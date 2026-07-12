import { createServerFn } from "@tanstack/react-start";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type MyWorkspace = {
  role: string;
  employee: {
    id: string;
    first_name: string;
    last_name: string;
    job_title: string | null;
    employee_number: string | null;
    company_id: string;
  } | null;
  todayAttendance: {
    id: string;
    status: string;
    check_in_at: string | null;
    check_out_at: string | null;
  } | null;
  pendingLeaves: number;
  myLeaveRequests: Array<{
    id: string;
    status: string;
    start_date: string;
    end_date: string;
    days_count: number;
  }>;
  openTasks: number;
  contractsToSign: number;
  latestPayslip: {
    id: string;
    payslip_number: string | null;
    net_amount: number;
    currency_code: string;
    period_label: string;
  } | null;
  teamPendingLeaves: Array<{
    id: string;
    employee_name: string;
    start_date: string;
    end_date: string;
    days_count: number;
  }>;
  teamPresentToday: number;
  teamHeadcount: number;
};

export const getMyWorkspace = createServerFn({ method: "GET" }).handler(
  async (): Promise<MyWorkspace> => {
    const supabase = createSupabaseServerClient();
    const { data: auth, error } = await supabase.auth.getUser();
    if (error || !auth.user) throw new Error("Authentification requise");

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, company_id, full_name")
      .eq("id", auth.user.id)
      .maybeSingle();

    const role = profile?.role ?? "employee";
    const companyId = profile?.company_id ?? null;

    const { data: emp } = await supabase
      .from("employees")
      .select("id, first_name, last_name, job_title, employee_number, company_id")
      .eq("user_id", auth.user.id)
      .is("deleted_at", null)
      .maybeSingle();

    const today = new Date().toISOString().slice(0, 10);
    let todayAttendance: MyWorkspace["todayAttendance"] = null;
    let pendingLeaves = 0;
    let myLeaveRequests: MyWorkspace["myLeaveRequests"] = [];
    let openTasks = 0;
    let contractsToSign = 0;
    let latestPayslip: MyWorkspace["latestPayslip"] = null;

    if (emp) {
      const { data: att } = await supabase
        .from("attendance_records")
        .select("id, status, check_in_at, check_out_at")
        .eq("employee_id", emp.id)
        .eq("work_date", today)
        .is("deleted_at", null)
        .maybeSingle();
      todayAttendance = att ?? null;

      const { data: leaves } = await supabase
        .from("leave_requests")
        .select("id, status, start_date, end_date, days_count")
        .eq("employee_id", emp.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(5);
      myLeaveRequests = (leaves ?? []).map((l) => ({
        ...l,
        days_count: Number(l.days_count),
      }));
      pendingLeaves = (leaves ?? []).filter((l) => l.status === "pending").length;

      const { count: taskCount } = await supabase
        .from("hr_tasks")
        .select("id", { count: "exact", head: true })
        .eq("assignee_employee_id", emp.id)
        .in("status", ["todo", "in_progress"])
        .is("deleted_at", null);
      openTasks = taskCount ?? 0;

      const { count: ctrCount } = await supabase
        .from("contracts")
        .select("id", { count: "exact", head: true })
        .eq("employee_id", emp.id)
        .eq("status", "sent")
        .is("deleted_at", null);
      contractsToSign = ctrCount ?? 0;

      const { data: slip } = await supabase
        .from("payslips")
        .select("id, payslip_number, net_amount, currency_code, payroll_run_id")
        .eq("employee_id", emp.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (slip) {
        const { data: run } = await supabase
          .from("payroll_runs")
          .select("label, period_month, period_year")
          .eq("id", slip.payroll_run_id)
          .maybeSingle();
        latestPayslip = {
          id: slip.id,
          payslip_number: slip.payslip_number,
          net_amount: Number(slip.net_amount),
          currency_code: slip.currency_code,
          period_label: run?.label ?? `${run?.period_month}/${run?.period_year}`,
        };
      }
    }

    let teamPendingLeaves: MyWorkspace["teamPendingLeaves"] = [];
    let teamPresentToday = 0;
    let teamHeadcount = 0;

    if ((role === "manager" || role === "employer" || role === "hr") && companyId) {
      const { data: teamLeaves } = await supabase
        .from("leave_requests")
        .select("id, start_date, end_date, days_count, employee_id, status")
        .eq("company_id", companyId)
        .eq("status", "pending")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(8);

      const empIds = [...new Set((teamLeaves ?? []).map((l) => l.employee_id))];
      const { data: emps } = empIds.length
        ? await supabase.from("employees").select("id, first_name, last_name").in("id", empIds)
        : { data: [] as Array<{ id: string; first_name: string; last_name: string }> };
      const names = new Map(
        (emps ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]),
      );

      teamPendingLeaves = (teamLeaves ?? []).map((l) => ({
        id: l.id,
        employee_name: names.get(l.employee_id) ?? "Employé",
        start_date: l.start_date,
        end_date: l.end_date,
        days_count: Number(l.days_count),
      }));

      const { count: head } = await supabase
        .from("employees")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .in("status", ["active", "on_leave"])
        .is("deleted_at", null);
      teamHeadcount = head ?? 0;

      const { count: present } = await supabase
        .from("attendance_records")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .eq("work_date", today)
        .eq("status", "present")
        .is("deleted_at", null);
      teamPresentToday = present ?? 0;
    }

    return {
      role,
      employee: emp
        ? {
            id: emp.id,
            first_name: emp.first_name,
            last_name: emp.last_name,
            job_title: emp.job_title,
            employee_number: emp.employee_number,
            company_id: emp.company_id,
          }
        : null,
      todayAttendance,
      pendingLeaves,
      myLeaveRequests,
      openTasks,
      contractsToSign,
      latestPayslip,
      teamPendingLeaves,
      teamPresentToday,
      teamHeadcount,
    };
  },
);
