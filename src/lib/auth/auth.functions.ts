import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthUser, CompanyAccess, Profile } from "@/lib/auth/types";

const credentialsSchema = z.object({
  email: z.string().email("Adresse e-mail invalide"),
  password: z.string().min(8, "Le mot de passe doit contenir au moins 8 caractères"),
});

const signUpSchema = credentialsSchema.extend({
  fullName: z.string().min(2, "Indiquez votre nom complet").max(120),
});

async function loadProfile(userId: string): Promise<Profile | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("profiles load error", error.message);
    return null;
  }
  return data as Profile | null;
}

async function loadCompanyAccess(companyId: string): Promise<CompanyAccess | null> {
  const supabase = createSupabaseServerClient();

  // Expire overdue periods + J-5 notifications (employer/HR); never deletes data
  await supabase.rpc("sync_company_subscriptions", { p_company_id: companyId });

  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, legal_name, is_active, approval_status, subscription_status, subscription_plan, subscription_paid_at, subscription_starts_at, subscription_ends_at, payment_reference, payment_method, rejection_reason",
    )
    .eq("id", companyId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;
  return data as CompanyAccess;
}

async function resolveAuthUser(): Promise<AuthUser | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) return null;

  const profile = await loadProfile(data.user.id);
  const metaRole = data.user.app_metadata?.role;

  if (
    profile &&
    metaRole === "platform_admin" &&
    profile.role !== "platform_admin"
  ) {
    const company = profile.company_id
      ? await loadCompanyAccess(profile.company_id)
      : null;
    return {
      id: data.user.id,
      email: data.user.email ?? "",
      profile: { ...profile, role: "platform_admin" },
      company,
    };
  }

  if (!profile && metaRole === "platform_admin") {
    return {
      id: data.user.id,
      email: data.user.email ?? "",
      profile: {
        id: data.user.id,
        email: data.user.email ?? "",
        full_name: (data.user.user_metadata?.full_name as string | undefined) ?? null,
        role: "platform_admin",
        company_id: null,
        phone: null,
        avatar_url: null,
        locale: "fr-KM",
        is_active: true,
        must_change_password: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
      company: null,
    };
  }

  const company = profile?.company_id
    ? await loadCompanyAccess(profile.company_id)
    : null;

  return {
    id: data.user.id,
    email: data.user.email ?? "",
    profile,
    company,
  };
}

export function isPlatformAdmin(user: AuthUser | null | undefined): boolean {
  return user?.profile?.role === "platform_admin";
}

export function isCompanyApproved(user: AuthUser | null | undefined): boolean {
  if (isPlatformAdmin(user)) return true;
  const company = user?.company;
  if (!company) return false;
  if (company.approval_status !== "approved" || company.is_active !== true) {
    return false;
  }
  if (company.subscription_status === "expired" || company.subscription_status === "cancelled") {
    return false;
  }
  if (company.subscription_ends_at) {
    const ends = new Date(company.subscription_ends_at).getTime();
    if (!Number.isNaN(ends) && ends < Date.now()) return false;
  }
  return company.subscription_status === "active";
}

export function subscriptionDaysRemaining(
  user: AuthUser | null | undefined,
): number | null {
  const endsAt = user?.company?.subscription_ends_at;
  if (!endsAt || user?.company?.subscription_status !== "active") return null;
  const ends = new Date(endsAt).getTime();
  if (Number.isNaN(ends)) return null;
  return Math.max(0, Math.ceil((ends - Date.now()) / 86_400_000));
}

export const getAuthSession = createServerFn({ method: "GET" }).handler(async (): Promise<AuthUser | null> => {
  return resolveAuthUser();
});

export const requireAuthSession = createServerFn({ method: "GET" }).handler(async (): Promise<AuthUser> => {
  const session = await resolveAuthUser();
  if (!session) {
    throw redirect({ to: "/login" });
  }
  return session;
});

export const signInWithPassword = createServerFn({ method: "POST" })
  .validator(credentialsSchema)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; message: string }> => {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email.trim().toLowerCase(),
      password: data.password,
    });

    if (error) {
      return {
        ok: false,
        message: error.message.toLowerCase().includes("invalid login")
          ? "E-mail ou mot de passe incorrect."
          : error.message,
      };
    }

    return { ok: true };
  });

export const signUpWithPassword = createServerFn({ method: "POST" })
  .validator(signUpSchema)
  .handler(async ({ data }): Promise<{ ok: true; needsEmailConfirmation: boolean } | { ok: false; message: string }> => {
    const supabase = createSupabaseServerClient();
    const email = data.email.trim().toLowerCase();

    const { data: signUpData, error } = await supabase.auth.signUp({
      email,
      password: data.password,
      options: {
        data: {
          full_name: data.fullName.trim(),
        },
      },
    });

    if (error) {
      return { ok: false, message: error.message };
    }

    const needsEmailConfirmation = !signUpData.session;

    if (signUpData.user && signUpData.session) {
      await supabase
        .from("profiles")
        .update({ full_name: data.fullName.trim() })
        .eq("id", signUpData.user.id);
    }

    return { ok: true, needsEmailConfirmation };
  });

export const signOut = createServerFn({ method: "POST" }).handler(async () => {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
  return { ok: true as const };
});

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Nom trop court").max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  locale: z.string().trim().min(2).max(20).optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .validator(updateProfileSchema)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; message: string }> => {
    const supabase = createSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return { ok: false, message: "Authentification requise" };
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: data.fullName.trim(),
        phone: data.phone?.trim() || null,
        locale: data.locale?.trim() || "fr-KM",
      })
      .eq("id", authData.user.id)
      .is("deleted_at", null);

    if (error) return { ok: false, message: error.message };

    await supabase.auth.updateUser({
      data: { full_name: data.fullName.trim() },
    });

    return { ok: true };
  });

const changePasswordSchema = z
  .object({
    newPassword: z.string().min(8, "Au moins 8 caractères"),
    confirmPassword: z.string().min(8, "Au moins 8 caractères"),
  })
  .superRefine((val, ctx) => {
    if (val.newPassword !== val.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Les mots de passe ne correspondent pas",
        path: ["confirmPassword"],
      });
    }
  });

/** First-login / forced password change for provisioned accounts. */
export const changePasswordFirstLogin = createServerFn({ method: "POST" })
  .validator(changePasswordSchema)
  .handler(async ({ data }): Promise<{ ok: true } | { ok: false; message: string }> => {
    const supabase = createSupabaseServerClient();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      return { ok: false, message: "Authentification requise" };
    }

    const { error: pwdError } = await supabase.auth.updateUser({
      password: data.newPassword,
    });
    if (pwdError) {
      return { ok: false, message: pwdError.message };
    }

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        must_change_password: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", authData.user.id)
      .is("deleted_at", null);

    if (profileError) {
      return { ok: false, message: profileError.message };
    }

    return { ok: true };
  });
