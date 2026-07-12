import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

export const getReportsData = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }) => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const companyId = data?.companyId;

    let empQ = supabase
      .from("employees")
      .select("id, status, department_id, company_id, base_salary, city")
      .is("deleted_at", null);
    if (companyId) empQ = empQ.eq("company_id", companyId);
    const { data: employees, error: eErr } = await empQ;
    if (eErr) throw new Error(eErr.message);

    const emps = employees ?? [];
    const active = emps.filter((e) => e.status === "active" || e.status === "on_leave").length;
    const onLeave = emps.filter((e) => e.status === "on_leave").length;
    const mass = emps
      .filter((e) => e.status === "active" || e.status === "on_leave")
      .reduce((s, e) => s + Number(e.base_salary || 0), 0);

    const deptIds = [...new Set(emps.map((e) => e.department_id).filter(Boolean))] as string[];
    const { data: depts } = deptIds.length
      ? await supabase.from("departments").select("id, name").in("id", deptIds)
      : { data: [] as Array<{ id: string; name: string }> };
    const deptName = new Map((depts ?? []).map((d) => [d.id, d.name]));

    const byDeptMap = new Map<string, number>();
    for (const e of emps) {
      if (!(e.status === "active" || e.status === "on_leave")) continue;
      const name = e.department_id ? deptName.get(e.department_id) ?? "Sans département" : "Sans département";
      byDeptMap.set(name, (byDeptMap.get(name) ?? 0) + 1);
    }
    const colors = [
      "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)",
    ];
    const byDept = [...byDeptMap.entries()].map(([name, value], i) => ({
      name,
      value,
      color: colors[i % colors.length]!,
    }));

    const byCityMap = new Map<string, number>();
    for (const e of emps) {
      if (!(e.status === "active" || e.status === "on_leave")) continue;
      const city = e.city?.trim() || "Non renseigné";
      byCityMap.set(city, (byCityMap.get(city) ?? 0) + 1);
    }
    const byCity = [...byCityMap.entries()]
      .map(([c, v]) => ({ c, v }))
      .sort((a, b) => b.v - a.v);

    let runsQ = supabase
      .from("payroll_runs")
      .select("period_month, period_year, total_gross, total_net, status")
      .is("deleted_at", null)
      .in("status", ["calculated", "approved", "paid"])
      .order("period_year")
      .order("period_month");
    if (companyId) runsQ = runsQ.eq("company_id", companyId);
    const { data: runs } = await runsQ;
    const payrollTrend = (runs ?? []).slice(-7).map((r) => ({
      m: `${String(r.period_month).padStart(2, "0")}/${String(r.period_year).slice(2)}`,
      brut: Math.round((Number(r.total_gross) / 1_000_000) * 10) / 10,
      net: Math.round((Number(r.total_net) / 1_000_000) * 10) / 10,
    }));

    const today = new Date().toISOString().slice(0, 10);
    let attQ = supabase
      .from("attendance_records")
      .select("status")
      .eq("work_date", today)
      .is("deleted_at", null);
    if (companyId) attQ = attQ.eq("company_id", companyId);
    const { data: att } = await attQ;
    const present = (att ?? []).filter((a) =>
      ["present", "late", "remote", "half_day"].includes(a.status),
    ).length;
    const absent = (att ?? []).filter((a) => a.status === "absent").length;

    let leaveQ = supabase
      .from("leave_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending")
      .is("deleted_at", null);
    if (companyId) leaveQ = leaveQ.eq("company_id", companyId);
    const { count: pendingLeave } = await leaveQ;

    return {
      headcount: active,
      onLeave,
      massSalary: mass,
      pendingLeave: pendingLeave ?? 0,
      presentToday: present,
      absentToday: absent,
      byDept,
      byCity,
      payrollTrend,
      catalog: [
        {
          title: "Synthèse RH mensuelle",
          desc: `${active} actifs · ${onLeave} en congé · masse ${Math.round(mass).toLocaleString("fr-FR")} KMF`,
          href: "/employees",
        },
        {
          title: "Grand livre de paie",
          desc: "Cycles, bulletins et nets par salarié",
          href: "/payroll",
        },
        {
          title: "Tendances de présence",
          desc: `${present} présent(s) / ${absent} absent(s) aujourd’hui`,
          href: "/attendance",
        },
        {
          title: "Congés en attente",
          desc: `${pendingLeave ?? 0} demande(s) à valider`,
          href: "/leave",
        },
      ],
    };
  });
