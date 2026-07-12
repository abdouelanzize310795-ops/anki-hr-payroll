import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

export const askAnkibaAi = createServerFn({ method: "POST" })
  .validator(
    z.object({
      question: z.string().trim().min(2).max(500),
      companyId: z.string().uuid().optional(),
    }),
  )
  .handler(async ({ data }) => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const q = data.question.toLowerCase();
    const companyId = data.companyId;

    let empQ = supabase
      .from("employees")
      .select("id, first_name, last_name, status, base_salary, job_title")
      .is("deleted_at", null);
    if (companyId) empQ = empQ.eq("company_id", companyId);
    const { data: employees } = await empQ;
    const emps = employees ?? [];
    const active = emps.filter((e) => e.status === "active" || e.status === "on_leave");

    let leaveQ = supabase
      .from("leave_requests")
      .select("id, status, start_date, end_date, days_count")
      .is("deleted_at", null)
      .in("status", ["pending", "approved"]);
    if (companyId) leaveQ = leaveQ.eq("company_id", companyId);
    const { data: leaves } = await leaveQ;

    let runQ = supabase
      .from("payroll_runs")
      .select("id, label, status, total_net, total_gross, period_month, period_year")
      .is("deleted_at", null)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .limit(3);
    if (companyId) runQ = runQ.eq("company_id", companyId);
    const { data: runs } = await runQ;

    const fmt = (n: number) =>
      new Intl.NumberFormat("fr-KM", { maximumFractionDigits: 0 }).format(n);

    if (/effectif|headcount|combien.*employé|nombre.*employé/.test(q)) {
      return {
        answer: `Effectif actuel : **${active.length}** collaborateur(s) actifs (sur ${emps.length} au total).`,
        hints: ["Qui est en congé ?", "Résumé de la paie"],
      };
    }

    if (/congé|leave|absent/.test(q)) {
      const pending = (leaves ?? []).filter((l) => l.status === "pending").length;
      const approved = (leaves ?? []).filter((l) => l.status === "approved");
      const names = approved.slice(0, 5);
      return {
        answer:
          `Congés : **${pending}** demande(s) en attente, **${approved.length}** approuvée(s).` +
          (names.length
            ? ` Prochaines périodes : ${names
                .map((l) => `${l.start_date} → ${l.end_date} (${l.days_count} j)`)
                .join(" ; ")}.`
            : ""),
        hints: ["Effectif actif", "Résumé de la paie"],
      };
    }

    if (/paie|payroll|salaire|bulletin|masse/.test(q)) {
      const latest = runs?.[0];
      if (!latest) {
        return {
          answer: "Aucun cycle de paie trouvé. Créez-en un depuis le module Paie.",
          hints: ["Effectif actif", "Qui est en congé ?"],
        };
      }
      const mass = active.reduce((s, e) => s + Number(e.base_salary || 0), 0);
      return {
        answer:
          `Dernier cycle : **${latest.label}** (${latest.status}). ` +
          `Brut ${fmt(Number(latest.total_gross))} KMF · Net ${fmt(Number(latest.total_net))} KMF. ` +
          `Masse salariale de base (actifs) : ${fmt(mass)} KMF.`,
        hints: ["Effectif actif", "Qui est en congé ?"],
      };
    }

    if (/contrat|offer|embauch/.test(q)) {
      let cq = supabase
        .from("contracts")
        .select("id, status, job_title")
        .is("deleted_at", null)
        .in("status", ["draft", "sent", "signed"]);
      if (companyId) cq = cq.eq("company_id", companyId);
      const { data: contracts } = await cq;
      const byStatus = new Map<string, number>();
      for (const c of contracts ?? []) {
        byStatus.set(c.status, (byStatus.get(c.status) ?? 0) + 1);
      }
      return {
        answer: `Contrats actifs : ${(contracts ?? []).length} — ${[...byStatus.entries()]
          .map(([s, n]) => `${s}: ${n}`)
          .join(", ") || "aucun"}.`,
        hints: ["Effectif actif", "Résumé de la paie"],
      };
    }

    const top = active
      .slice(0, 5)
      .map((e) => `${e.first_name} ${e.last_name}${e.job_title ? ` (${e.job_title})` : ""}`)
      .join(", ");

    return {
      answer:
        `Je peux répondre sur l’effectif, les congés, la paie et les contrats à partir de vos données. ` +
        `Aperçu : ${active.length} actifs` +
        (top ? ` — ex. ${top}` : "") +
        `. Essayez : « Résumé de la paie » ou « Qui est en congé ? ».`,
      hints: [
        "Effectif actif",
        "Qui est en congé ?",
        "Résumé de la paie",
        "État des contrats",
      ],
    };
  });
