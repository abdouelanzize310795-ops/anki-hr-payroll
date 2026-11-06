import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { CLASSIC_TEMPLATE_ID, type PayslipLayout, type PayslipTemplate } from "./template.types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

const blockSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum([
    "company_header", "title_period", "employee_info", "net_highlight", "earnings_table",
    "deductions_table", "employer_contributions", "totals_summary", "ytd_totals", "leave_balance",
    "hours_summary", "payment_info", "signatures", "free_text", "legal_footer", "spacer",
  ]),
  options: z
    .object({
      showLogo: z.boolean().optional(),
      align: z.enum(["left", "center", "banner"]).optional(),
      showBank: z.boolean().optional(),
      style: z.enum(["box", "banner", "line"]).optional(),
      showBaseRate: z.boolean().optional(),
      hideZero: z.boolean().optional(),
      text: z.string().max(2000).optional(),
      title: z.string().max(120).optional(),
      left: z.string().max(60).optional(),
      right: z.string().max(60).optional(),
      size: z.enum(["sm", "md", "lg"]).optional(),
    })
    .strict(),
});

export const layoutSchema = z.object({
  theme: z.object({
    accent: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Couleur invalide"),
    font: z.enum(["serif", "sans"]),
    density: z.enum(["comfortable", "compact"]),
  }),
  blocks: z.array(blockSchema).min(1, "Ajoutez au moins un bloc").max(40),
});

/** Mshahara models + the company's own models. */
export const listPayslipTemplates = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }): Promise<PayslipTemplate[]> => {
    const supabase = createSupabaseServerClient();
    let q = supabase
      .from("payslip_templates")
      .select("id, company_id, name, description, layout, is_system, base_template_id, updated_at")
      .is("deleted_at", null)
      .order("is_system", { ascending: false })
      .order("name", { ascending: true });
    q = data?.companyId ? q.or(`company_id.is.null,company_id.eq.${data.companyId}`) : q.is("company_id", null);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as PayslipTemplate[];
  });

/** The template currently used by the company. */
export const getCompanyTemplate = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid() }))
  .handler(async ({ data }): Promise<PayslipTemplate> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data: company } = await supabase
      .from("companies")
      .select("payslip_template_id")
      .eq("id", data.companyId)
      .maybeSingle();
    const id = company?.payslip_template_id ?? CLASSIC_TEMPLATE_ID;
    const { data: row, error } = await supabase
      .from("payslip_templates")
      .select("id, company_id, name, description, layout, is_system, base_template_id, updated_at")
      .eq("id", id)
      .maybeSingle();
    if (error || !row) throw new Error(error?.message ?? "Modèle introuvable");
    return row as PayslipTemplate;
  });

/** Use an existing template (Mshahara model or company model). */
export const setCompanyTemplate = createServerFn({ method: "POST" })
  .validator(z.object({ companyId: z.string().uuid(), templateId: z.string().uuid() }))
  .handler(async ({ data }): Promise<ActionResult<{ templateId: string }>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { data: tpl } = await supabase
      .from("payslip_templates")
      .select("id, company_id, name")
      .eq("id", data.templateId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!tpl || (tpl.company_id && tpl.company_id !== data.companyId)) {
      return { ok: false, message: "Modèle introuvable" };
    }
    const { error } = await supabase
      .from("companies")
      .update({ payslip_template_id: data.templateId })
      .eq("id", data.companyId);
    if (error) return { ok: false, message: error.message };
    await supabase.rpc("write_audit_log", {
      p_company_id: data.companyId,
      p_action: "payslip_template.selected",
      p_entity_type: "payslip_template",
      p_entity_id: data.templateId,
      p_summary: `Modèle de bulletin : ${tpl.name}`,
    });
    return { ok: true, data: { templateId: data.templateId } };
  });

/**
 * Saves the company's customised layout. Editing a Mshahara model creates a company
 * copy ("Mon modèle") so the shared models never change; the copy becomes the default.
 */
export const saveCompanyTemplate = createServerFn({ method: "POST" })
  .validator(
    z.object({
      companyId: z.string().uuid(),
      templateId: z.string().uuid().optional(),
      name: z.string().trim().min(2).max(80),
      layout: layoutSchema,
    }),
  )
  .handler(async ({ data }): Promise<ActionResult<PayslipTemplate>> => {
    const userId = await requireUserId();
    const supabase = createSupabaseServerClient();

    let target: { id: string; company_id: string | null; is_system: boolean } | null = null;
    if (data.templateId) {
      const { data: existing } = await supabase
        .from("payslip_templates")
        .select("id, company_id, is_system")
        .eq("id", data.templateId)
        .maybeSingle();
      target = existing;
    }

    const layout = data.layout as PayslipLayout;
    const columns = "id, company_id, name, description, layout, is_system, base_template_id, updated_at";
    const query =
      target && target.company_id === data.companyId && !target.is_system
        ? supabase
            .from("payslip_templates")
            .update({ name: data.name, layout, updated_at: new Date().toISOString() })
            .eq("id", target.id)
        : supabase.from("payslip_templates").insert({
            company_id: data.companyId,
            name: data.name,
            description: "Modèle personnalisé de l’entreprise",
            layout,
            is_system: false,
            base_template_id: target?.id ?? null,
            created_by: userId,
          });
    const { data: row, error } = await query.select(columns).single();
    if (error || !row) return { ok: false, message: error?.message ?? "Enregistrement impossible" };

    const { error: linkError } = await supabase
      .from("companies")
      .update({ payslip_template_id: row.id })
      .eq("id", data.companyId);
    if (linkError) return { ok: false, message: linkError.message };

    await supabase.rpc("write_audit_log", {
      p_company_id: data.companyId,
      p_action: "payslip_template.saved",
      p_entity_type: "payslip_template",
      p_entity_id: row.id,
      p_summary: `Modèle « ${row.name} » enregistré (${layout.blocks.length} blocs)`,
    });
    return { ok: true, data: row as PayslipTemplate };
  });
