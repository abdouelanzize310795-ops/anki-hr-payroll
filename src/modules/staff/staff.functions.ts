import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { provisionStaffAccountSchema } from "./schemas";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

export type CompanyStaffMember = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
};

export type StaffProvisionResult = {
  user_id: string;
  email: string;
  role: string;
  created: boolean;
  temporary_password: string | null;
};

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

export const listCompanyStaff = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data }): Promise<CompanyStaffMember[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data: rows, error } = await supabase
      .from("profiles")
      .select("id, email, full_name, role, is_active, created_at")
      .eq("company_id", data.companyId)
      .in("role", ["employer", "hr", "manager"])
      .is("deleted_at", null)
      .order("role")
      .order("full_name");
    if (error) throw new Error(error.message);
    return (rows ?? []) as CompanyStaffMember[];
  });

export const provisionStaffAccount = createServerFn({ method: "POST" })
  .validator(provisionStaffAccountSchema)
  .handler(async ({ data }): Promise<ActionResult<StaffProvisionResult>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data: result, error } = await supabase.rpc("provision_staff_account", {
      p_company_id: data.companyId,
      p_email: data.email,
      p_full_name: data.fullName,
      p_role: data.role,
    });
    if (error) return { ok: false, message: error.message };
    const row = result as {
      ok?: boolean;
      user_id?: string;
      email?: string;
      role?: string;
      created?: boolean;
      temporary_password?: string | null;
    };
    if (!row?.ok || !row.user_id || !row.email) {
      return { ok: false, message: "Création du compte impossible" };
    }
    return {
      ok: true,
      data: {
        user_id: row.user_id,
        email: row.email,
        role: String(row.role ?? data.role),
        created: Boolean(row.created),
        temporary_password: row.temporary_password ?? null,
      },
    };
  });

/** Accès métier du rôle RH — source de vérité côté produit. */
export const HR_ACCESS = {
  title: "Compte RH",
  summary:
    "Le RH assigne un manager à chaque département, gère l’effectif et la paie, et valide définitivement les congés après le manager.",
  can: [
    "Assigner un manager à chaque département",
    "Consulter et modifier tous les employés de l’entreprise",
    "Créer / activer contrats et comptes employés",
    "Valider définitivement les congés (après le manager)",
    "Gérer pointage, tâches, documents RH",
    "Calculer, approuver et payer la paie",
    "Exporter les virements et rapports",
    "Créer des comptes manager",
  ],
  cannot: [
    "Créer un autre compte RH (réservé à l’employeur)",
    "Promouvoir quelqu’un en employeur",
    "Accéder à la console plateforme AnkibaPay",
  ],
} as const;
