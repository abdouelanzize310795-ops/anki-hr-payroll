import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPlatformAdmin, requireAuthSession } from "@/lib/auth/auth.functions";

export type AdminOverview = {
  tenants: number;
  activeUsers: number;
  employees: number;
  openPayrollRuns: number;
  companies: Array<{
    id: string;
    legal_name: string;
    city: string | null;
    employee_count: number;
    created_at: string;
  }>;
  users: Array<{
    id: string;
    email: string;
    full_name: string | null;
    role: string;
    company_name: string | null;
    is_active: boolean;
    created_at: string;
  }>;
  activity: Array<{
    id: string;
    kind: string;
    label: string;
    when: string;
    status: string;
  }>;
};

export const getAdminOverview = createServerFn({ method: "GET" }).handler(
  async (): Promise<AdminOverview> => {
    const auth = await requireAuthSession();
    if (!isPlatformAdmin(auth)) {
      throw new Error("Accès réservé au super administrateur");
    }

    const supabase = createSupabaseServerClient();

    const [
      { data: companies },
      { data: profiles },
      { count: empCount },
      { data: payrollRuns },
      { data: leavePending },
      { data: recentRuns },
    ] = await Promise.all([
      supabase
        .from("companies")
        .select("id, legal_name, city, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("profiles")
        .select("id, email, full_name, role, company_id, is_active, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null),
      supabase
        .from("payroll_runs")
        .select("id, status")
        .is("deleted_at", null)
        .in("status", ["draft", "calculated", "approved"]),
      supabase
        .from("leave_requests")
        .select("id, created_at, status")
        .eq("status", "pending")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("payroll_runs")
        .select("id, label, status, calculated_at, created_at, company_id")
        .is("deleted_at", null)
        .order("updated_at", { ascending: false })
        .limit(8),
    ]);

    const companyIds = (companies ?? []).map((c) => c.id);
    const { data: empRows } = companyIds.length
      ? await supabase
          .from("employees")
          .select("company_id")
          .in("company_id", companyIds)
          .is("deleted_at", null)
      : { data: [] as Array<{ company_id: string }> };

    const empByCompany = new Map<string, number>();
    for (const e of empRows ?? []) {
      empByCompany.set(e.company_id, (empByCompany.get(e.company_id) ?? 0) + 1);
    }

    const companyName = new Map((companies ?? []).map((c) => [c.id, c.legal_name]));

    const activity: AdminOverview["activity"] = [];
    for (const r of recentRuns ?? []) {
      activity.push({
        id: `pr-${r.id}`,
        kind: "payroll",
        label: `Paie — ${r.label} (${companyName.get(r.company_id) ?? "—"})`,
        when: r.calculated_at ?? r.created_at,
        status:
          r.status === "paid"
            ? "Payé"
            : r.status === "approved"
              ? "Approuvé"
              : r.status === "calculated"
                ? "Calculé"
                : "Brouillon",
      });
    }
    for (const l of leavePending ?? []) {
      activity.push({
        id: `lv-${l.id}`,
        kind: "leave",
        label: "Demande de congé en attente",
        when: l.created_at,
        status: "En attente",
      });
    }
    activity.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

    return {
      tenants: companies?.length ?? 0,
      activeUsers: (profiles ?? []).filter((p) => p.is_active).length,
      employees: empCount ?? 0,
      openPayrollRuns: payrollRuns?.length ?? 0,
      companies: (companies ?? []).map((c) => ({
        id: c.id,
        legal_name: c.legal_name,
        city: c.city,
        employee_count: empByCompany.get(c.id) ?? 0,
        created_at: c.created_at,
      })),
      users: (profiles ?? []).map((p) => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        role: p.role,
        company_name: p.company_id ? companyName.get(p.company_id) ?? null : null,
        is_active: p.is_active,
        created_at: p.created_at,
      })),
      activity: activity.slice(0, 12),
    };
  },
);
