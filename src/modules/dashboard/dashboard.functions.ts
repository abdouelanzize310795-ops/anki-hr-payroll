import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MONTHS_FR } from "@/modules/payroll/types";

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

export type DashboardData = {
  greetingName: string;
  companyId: string | null;
  stats: {
    employees: number;
    payrollGross: number;
    attendanceRate: number | null;
    pendingApprovals: number;
  };
  payrollTrend: Array<{ m: string; brut: number; net: number }>;
  attendanceWeek: Array<{ d: string; p: number }>;
  pendingItems: Array<{
    id: string;
    title: string;
    subtitle: string;
    type: "leave" | "payroll" | "contract";
    href: string;
  }>;
  activity: Array<{
    who: string;
    what: string;
    when: string;
    init: string;
  }>;
  expiringContracts: Array<{
    id: string;
    name: string;
    role: string;
    ends: string;
    status: string;
  }>;
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function relativeFr(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l’instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  return `il y a ${days} j`;
}

export const getDashboardData = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }): Promise<DashboardData> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: authData } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, company_id, role")
      .eq("id", authData.user!.id)
      .maybeSingle();

    const companyId = data?.companyId ?? profile?.company_id ?? null;
    const greetingName =
      profile?.full_name?.split(" ")[0] || "bonjour";

    const today = new Date().toISOString().slice(0, 10);

    // Employees
    let empQuery = supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .in("status", ["active", "on_leave", "onboarding"]);
    if (companyId) empQuery = empQuery.eq("company_id", companyId);
    const { count: empCount } = await empQuery;

    // Latest payroll + trend
    let runsQuery = supabase
      .from("payroll_runs")
      .select("id, label, total_gross, total_net, period_year, period_month, status, created_at")
      .is("deleted_at", null)
      .neq("status", "cancelled")
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false });
    if (companyId) runsQuery = runsQuery.eq("company_id", companyId);
    const { data: runs } = await runsQuery;

    const latestRun = (runs ?? []).find((r) =>
      ["calculated", "approved", "paid"].includes(r.status),
    );
    const payrollTrend = [...(runs ?? [])]
      .filter((r) => ["calculated", "approved", "paid"].includes(r.status))
      .reverse()
      .slice(-7)
      .map((r) => ({
        m: (MONTHS_FR[r.period_month - 1] ?? "").slice(0, 3),
        brut: Math.round((Number(r.total_gross) / 1_000_000) * 10) / 10,
        net: Math.round((Number(r.total_net) / 1_000_000) * 10) / 10,
      }));

    // Attendance today + week
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7)); // Monday
    const weekDates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(weekStart.getDate() + i);
      return d.toISOString().slice(0, 10);
    });
    const dayLabels = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

    let attQuery = supabase
      .from("attendance_records")
      .select("work_date, status")
      .gte("work_date", weekDates[0]!)
      .lte("work_date", weekDates[6]!)
      .is("deleted_at", null);
    if (companyId) attQuery = attQuery.eq("company_id", companyId);
    const { data: attRows } = await attQuery;

    const attendanceWeek = weekDates.map((date, i) => {
      const present = (attRows ?? []).filter(
        (r) =>
          r.work_date === date &&
          ["present", "late", "remote", "half_day"].includes(r.status),
      ).length;
      return { d: dayLabels[i]!, p: present };
    });

    const todayPresent = (attRows ?? []).filter(
      (r) =>
        r.work_date === today &&
        ["present", "late", "remote", "half_day"].includes(r.status),
    ).length;
    const activeCount = empCount ?? 0;
    const attendanceRate =
      activeCount > 0 && todayPresent > 0
        ? Math.round((todayPresent / activeCount) * 1000) / 10
        : null;

    // Pending leave
    let leaveQuery = supabase
      .from("leave_requests")
      .select("id, start_date, end_date, days_count, created_at, employee_id, status")
      .eq("status", "pending")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10);
    if (companyId) leaveQuery = leaveQuery.eq("company_id", companyId);
    const { data: pendingLeaves } = await leaveQuery;

    // Pending payroll (calculated awaiting approval)
    const pendingPayroll = (runs ?? []).filter((r) => r.status === "calculated").slice(0, 5);

    // Contracts needing attention (sent)
    let contractQuery = supabase
      .from("contracts")
      .select("id, job_title, status, end_date, employee_id, created_at")
      .is("deleted_at", null)
      .in("status", ["sent", "signed"])
      .order("created_at", { ascending: false })
      .limit(5);
    if (companyId) contractQuery = contractQuery.eq("company_id", companyId);
    const { data: pendingContracts } = await contractQuery;

    // Expiring contracts 30d
    const in30 = new Date();
    in30.setDate(in30.getDate() + 30);
    const in30Str = in30.toISOString().slice(0, 10);
    let expQuery = supabase
      .from("contracts")
      .select("id, job_title, status, end_date, employee_id")
      .is("deleted_at", null)
      .eq("status", "active")
      .not("end_date", "is", null)
      .gte("end_date", today)
      .lte("end_date", in30Str)
      .order("end_date")
      .limit(5);
    if (companyId) expQuery = expQuery.eq("company_id", companyId);
    const { data: expiring } = await expQuery;

    const employeeIds = [
      ...new Set(
        [
          ...(pendingLeaves ?? []).map((l) => l.employee_id),
          ...(pendingContracts ?? []).map((c) => c.employee_id),
          ...(expiring ?? []).map((c) => c.employee_id),
        ].filter(Boolean),
      ),
    ] as string[];

    const { data: emps } = employeeIds.length
      ? await supabase
          .from("employees")
          .select("id, first_name, last_name")
          .in("id", employeeIds)
      : { data: [] as Array<{ id: string; first_name: string; last_name: string }> };

    const empName = new Map(
      (emps ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]),
    );

    const pendingItems: DashboardData["pendingItems"] = [];

    for (const r of pendingPayroll) {
      pendingItems.push({
        id: r.id,
        title: r.label,
        subtitle: `Cycle calculé · ${Number(r.total_net).toLocaleString("fr-FR")} KMF net`,
        type: "payroll",
        href: `/payroll/${r.id}`,
      });
    }
    for (const l of pendingLeaves ?? []) {
      const name = empName.get(l.employee_id) ?? "Employé";
      pendingItems.push({
        id: l.id,
        title: `Congé — ${l.days_count} j`,
        subtitle: `${name} · ${l.start_date} → ${l.end_date}`,
        type: "leave",
        href: "/leave",
      });
    }
    for (const c of pendingContracts ?? []) {
      const name = empName.get(c.employee_id) ?? "Employé";
      pendingItems.push({
        id: c.id,
        title: `${c.status === "sent" ? "Contrat envoyé" : "Contrat signé"} — ${c.job_title}`,
        subtitle: name,
        type: "contract",
        href: `/contracts/${c.id}`,
      });
    }

    // Activity from recent leave + contracts + payroll
    let recentLeaveQ = supabase
      .from("leave_requests")
      .select("id, status, created_at, employee_id, days_count")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5);
    if (companyId) recentLeaveQ = recentLeaveQ.eq("company_id", companyId);
    const { data: recentLeave } = await recentLeaveQ;

    let recentContractsQ = supabase
      .from("contracts")
      .select("id, status, created_at, employee_id, job_title, activated_at, signed_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (companyId) recentContractsQ = recentContractsQ.eq("company_id", companyId);
    const { data: recentContracts } = await recentContractsQ;

    const actEmpIds = [
      ...new Set(
        [
          ...(recentLeave ?? []).map((l) => l.employee_id),
          ...(recentContracts ?? []).map((c) => c.employee_id),
        ].filter(Boolean),
      ),
    ] as string[];
    const missing = actEmpIds.filter((id) => !empName.has(id));
    if (missing.length) {
      const { data: more } = await supabase
        .from("employees")
        .select("id, first_name, last_name")
        .in("id", missing);
      for (const e of more ?? []) {
        empName.set(e.id, `${e.first_name} ${e.last_name}`);
      }
    }

    const activity: DashboardData["activity"] = [];
    for (const l of recentLeave ?? []) {
      const name = empName.get(l.employee_id) ?? "Employé";
      activity.push({
        who: name,
        what:
          l.status === "pending"
            ? `a demandé un congé (${l.days_count} j)`
            : `congé ${l.status}`,
        when: relativeFr(l.created_at),
        init: initials(name),
      });
    }
    for (const c of recentContracts ?? []) {
      const name = empName.get(c.employee_id) ?? "Employé";
      const what =
        c.status === "active"
          ? `contrat activé — ${c.job_title}`
          : c.status === "signed"
            ? `a signé son contrat — ${c.job_title}`
            : `contrat ${c.status} — ${c.job_title}`;
      activity.push({
        who: name,
        what,
        when: relativeFr(c.signed_at || c.activated_at || c.created_at),
        init: initials(name),
      });
    }
    activity.sort((a, b) => a.when.localeCompare(b.when));

    const expiringContracts = (expiring ?? []).map((c) => {
      const name = empName.get(c.employee_id) ?? "Employé";
      const days = Math.ceil(
        (new Date(c.end_date!).getTime() - Date.now()) / 86400000,
      );
      return {
        id: c.id,
        name,
        role: c.job_title,
        ends: days <= 0 ? "aujourd’hui" : `dans ${days} jour${days > 1 ? "s" : ""}`,
        status: "Actif",
      };
    });

    return {
      greetingName,
      companyId,
      stats: {
        employees: activeCount,
        payrollGross: latestRun ? Number(latestRun.total_gross) : 0,
        attendanceRate,
        pendingApprovals: pendingItems.length,
      },
      payrollTrend,
      attendanceWeek,
      pendingItems: pendingItems.slice(0, 8),
      activity: activity.slice(0, 8),
      expiringContracts,
    };
  });
