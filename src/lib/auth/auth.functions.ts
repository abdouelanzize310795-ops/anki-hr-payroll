import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthUser, Profile } from "@/lib/auth/types";

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

async function resolveAuthUser(): Promise<AuthUser | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) return null;

  const profile = await loadProfile(data.user.id);

  // Fallback: role in app_metadata (not user_metadata) if profile row lags
  const metaRole = data.user.app_metadata?.role;
  if (
    profile &&
    metaRole === "platform_admin" &&
    profile.role !== "platform_admin"
  ) {
    return {
      id: data.user.id,
      email: data.user.email ?? "",
      profile: { ...profile, role: "platform_admin" },
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      },
    };
  }

  return {
    id: data.user.id,
    email: data.user.email ?? "",
    profile,
  };
}

export function isPlatformAdmin(user: AuthUser | null | undefined): boolean {
  return user?.profile?.role === "platform_admin";
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
  await supabase.auth.signOut();
  throw redirect({ to: "/login" });
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
