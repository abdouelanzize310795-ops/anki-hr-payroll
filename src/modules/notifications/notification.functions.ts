import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

export type AppNotification = {
  id: string;
  title: string;
  description: string;
  when: string;
  href: string;
  kind: "payroll" | "leave" | "contract" | "attendance" | "task";
  unread: boolean;
};

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

export const listNotifications = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }): Promise<AppNotification[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const companyId = data?.companyId;

    const items: AppNotification[] = [];

    let leaveQ = supabase
      .from("leave_requests")
      .select("id, status, created_at, days_count, start_date, end_date, employee_id")
      .eq("status", "pending")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(10);
    if (companyId) leaveQ = leaveQ.eq("company_id", companyId);
    const { data: leaves } = await leaveQ;

    let payrollQ = supabase
      .from("payroll_runs")
      .select("id, label, status, total_net, currency_code, calculated_at, created_at, employee_count")
      .eq("status", "calculated")
      .is("deleted_at", null)
      .order("calculated_at", { ascending: false })
      .limit(5);
    if (companyId) payrollQ = payrollQ.eq("company_id", companyId);
    const { data: runs } = await payrollQ;

    let contractQ = supabase
      .from("contracts")
      .select("id, job_title, status, created_at, updated_at, employee_id")
      .in("status", ["sent", "signed"])
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(5);
    if (companyId) contractQ = contractQ.eq("company_id", companyId);
    const { data: contracts } = await contractQ;

    let taskQ = supabase
      .from("hr_tasks")
      .select("id, title, priority, status, created_at, due_date")
      .in("status", ["todo", "in_progress"])
      .eq("priority", "high")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5);
    if (companyId) taskQ = taskQ.eq("company_id", companyId);
    const { data: tasks } = await taskQ;

    const empIds = [
      ...new Set(
        [
          ...(leaves ?? []).map((l) => l.employee_id),
          ...(contracts ?? []).map((c) => c.employee_id),
        ].filter(Boolean),
      ),
    ] as string[];

    const { data: emps } = empIds.length
      ? await supabase.from("employees").select("id, first_name, last_name").in("id", empIds)
      : { data: [] as Array<{ id: string; first_name: string; last_name: string }> };
    const nameMap = new Map(
      (emps ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]),
    );

    for (const r of runs ?? []) {
      items.push({
        id: `pay-${r.id}`,
        title: `${r.label} prêt à approuver`,
        description: `${r.employee_count} bulletin(s) · ${Number(r.total_net).toLocaleString("fr-FR")} ${r.currency_code} net`,
        when: relativeFr(r.calculated_at || r.created_at),
        href: `/payroll/${r.id}`,
        kind: "payroll",
        unread: true,
      });
    }

    for (const l of leaves ?? []) {
      const name = nameMap.get(l.employee_id) ?? "Employé";
      items.push({
        id: `leave-${l.id}`,
        title: `${name} a demandé un congé`,
        description: `${l.start_date} → ${l.end_date} (${l.days_count} j)`,
        when: relativeFr(l.created_at),
        href: "/leave",
        kind: "leave",
        unread: true,
      });
    }

    for (const c of contracts ?? []) {
      const name = nameMap.get(c.employee_id) ?? "Employé";
      items.push({
        id: `ctr-${c.id}`,
        title:
          c.status === "sent"
            ? `Contrat envoyé — ${c.job_title}`
            : `Contrat signé — ${c.job_title}`,
        description: name,
        when: relativeFr(c.updated_at || c.created_at),
        href: `/contracts/${c.id}`,
        kind: "contract",
        unread: c.status === "sent",
      });
    }

    for (const t of tasks ?? []) {
      items.push({
        id: `task-${t.id}`,
        title: t.title,
        description: t.due_date ? `Échéance ${t.due_date}` : "Priorité haute",
        when: relativeFr(t.created_at),
        href: "/tasks",
        kind: "task",
        unread: true,
      });
    }

    return items.slice(0, 20);
  });
