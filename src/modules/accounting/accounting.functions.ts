import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

const MONTHS_FR = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Aoû", "Sep", "Oct", "Nov", "Déc",
] as const;

export type AccountingEntry = {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  currency: string;
  status: string;
  href: string;
};

export const getAccountingOverview = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }) => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const companyId = data?.companyId;
    const year = new Date().getFullYear();

    let runsQ = supabase
      .from("payroll_runs")
      .select(
        "id, label, status, total_gross, total_net, total_deductions, total_employer_cost, employee_count, currency_code, period_month, period_year, paid_at, approved_at, calculated_at, created_at",
      )
      .is("deleted_at", null)
      .in("status", ["calculated", "approved", "paid"])
      .order("period_year", { ascending: true })
      .order("period_month", { ascending: true });
    if (companyId) runsQ = runsQ.eq("company_id", companyId);
    const { data: runs, error } = await runsQ;
    if (error) throw new Error(error.message);

    const list = runs ?? [];
    const ytd = list.filter((r) => r.period_year === year);
    const paidYtd = ytd.filter((r) => r.status === "paid");
    const pending = list.filter((r) => r.status === "calculated" || r.status === "approved");

    const sum = (rows: typeof list, key: "total_gross" | "total_net" | "total_employer_cost" | "total_deductions") =>
      rows.reduce((s, r) => s + Number(r[key] || 0), 0);

    const netPaidYtd = sum(paidYtd, "total_net");
    const grossYtd = sum(ytd, "total_gross");
    const employerYtd = sum(ytd, "total_employer_cost");
    const pendingNet = sum(pending, "total_net");

    const byMonth = new Map<string, { m: string; brut: number; net: number; cout: number }>();
    for (const r of list.slice(-12)) {
      const key = `${r.period_year}-${r.period_month}`;
      const label = `${MONTHS_FR[(r.period_month - 1) % 12]} ${String(r.period_year).slice(2)}`;
      const cur = byMonth.get(key) ?? { m: label, brut: 0, net: 0, cout: 0 };
      cur.brut += Number(r.total_gross || 0) / 1000;
      cur.net += Number(r.total_net || 0) / 1000;
      cur.cout += Number(r.total_employer_cost || 0) / 1000;
      byMonth.set(key, cur);
    }
    const trend = [...byMonth.values()].map((row) => ({
      m: row.m,
      brut: Math.round(row.brut),
      net: Math.round(row.net),
      cout: Math.round(row.cout),
    }));

    const entries: AccountingEntry[] = [...list]
      .reverse()
      .slice(0, 20)
      .map((r) => {
        const when =
          r.paid_at ?? r.approved_at ?? r.calculated_at ?? r.created_at;
        const statusLabel =
          r.status === "paid"
            ? "Payé"
            : r.status === "approved"
              ? "Approuvé"
              : "Calculé";
        return {
          id: r.id,
          date: new Date(when).toLocaleDateString("fr-FR", {
            day: "2-digit",
            month: "short",
          }),
          description: `Paie — ${r.label}`,
          category: "Personnel",
          amount: -Number(r.total_net || 0),
          currency: r.currency_code || "KMF",
          status: statusLabel,
          href: `/payroll/${r.id}`,
        };
      });

    let transferQ = supabase
      .from("transfer_batches")
      .select("id, label, status, total_amount, currency_code, created_at, exported_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10);
    if (companyId) transferQ = transferQ.eq("company_id", companyId);
    const { data: batches } = await transferQ;

    for (const b of batches ?? []) {
      entries.push({
        id: `tr-${b.id}`,
        date: new Date(b.exported_at ?? b.created_at).toLocaleDateString("fr-FR", {
          day: "2-digit",
          month: "short",
        }),
        description: `Virement — ${b.label}`,
        category: "Banque",
        amount: -Number(b.total_amount || 0),
        currency: b.currency_code || "KMF",
        status:
          b.status === "paid" || b.status === "exported" || b.status === "sent"
            ? "Payé"
            : b.status === "draft"
              ? "Brouillon"
              : "En attente",
        href: `/transfers/${b.id}`,
      });
    }

    entries.sort((a, b) => a.date.localeCompare(b.date) * -1);

    return {
      year,
      currency: list[0]?.currency_code ?? "KMF",
      netPaidYtd,
      grossYtd,
      employerYtd,
      pendingNet,
      pendingCount: pending.length,
      paidCount: paidYtd.length,
      trend,
      entries: entries.slice(0, 25),
    };
  });
