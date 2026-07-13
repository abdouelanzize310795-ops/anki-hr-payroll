import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { EmptyPlaceholder, SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Clock, LogIn, LogOut, Timer, Plus, Building2, UserCheck,
} from "lucide-react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { listCompanies } from "@/modules/companies/company.functions";
import { listEmployees } from "@/modules/employees/employee.functions";
import {
  attendanceMonthSeries,
  attendanceStats,
  clockAttendance,
  listAttendance,
  markAbsentForActive,
  upsertAttendance,
} from "@/modules/attendance/attendance.functions";
import { AttendanceForm } from "@/modules/attendance/components/AttendanceForm";
import {
  attendanceStatusToPill,
  formatMinutes,
  type AttendanceWithRelations,
} from "@/modules/attendance/types";
import type { UpsertAttendanceInput } from "@/modules/attendance/schemas";
import type { CompanyWithMeta } from "@/modules/companies/types";
import type { EmployeeWithRelations } from "@/modules/employees/types";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/attendance")({ component: AttendancePage });

const appRouteApi = getRouteApi("/_app");

function monthBounds(date = new Date()) {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const from = `${y}-${String(m).padStart(2, "0")}-01`;
  const last = new Date(y, m, 0).getDate();
  const to = `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { from, to, label: date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) };
}

function AttendancePage() {
  const { auth } = appRouteApi.useRouteContext();
  const profileCompanyId = auth.profile?.company_id ?? null;
  const admin = isPlatformAdmin(auth);
  const role = auth.profile?.role ?? "employee";
  const isEmployee = role === "employee";
  const canManage =
    admin || role === "employer" || role === "hr";

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const month = useMemo(() => monthBounds(), []);
  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [employees, setEmployees] = useState<EmployeeWithRelations[]>([]);
  const [myEmployeeId, setMyEmployeeId] = useState<string | null>(null);
  const [companyFilter, setCompanyFilter] = useState<string>(profileCompanyId ?? "all");
  const [workDate, setWorkDate] = useState(today);
  const [records, setRecords] = useState<AttendanceWithRelations[]>([]);
  const [series, setSeries] = useState<Array<{ d: number; h: number }>>([]);
  const [stats, setStats] = useState({ present: 0, late: 0, absent: 0, overtimeHours: 0 });
  const [clockEmployeeId, setClockEmployeeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const lockedCompanyId = admin ? null : profileCompanyId;
  const effectiveCompanyId =
    lockedCompanyId ?? (companyFilter === "all" ? undefined : companyFilter);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const listArgs = isEmployee
        ? { companyId: effectiveCompanyId, from: month.from, to: month.to }
        : { companyId: effectiveCompanyId, workDate };
      const [rows, s, chart] = await Promise.all([
        listAttendance({ data: listArgs }),
        attendanceStats({ data: { companyId: effectiveCompanyId, workDate } }),
        attendanceMonthSeries({ data: { companyId: effectiveCompanyId } }),
      ]);
      setRecords(rows);
      setStats(s);
      setSeries(chart);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger le pointage");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      if (admin) setCompanies(await listCompanies());
    })();
  }, [admin]);

  useEffect(() => {
    if (!effectiveCompanyId) {
      setEmployees([]);
      setClockEmployeeId("");
      return;
    }
    void (async () => {
      const emps = await listEmployees({
        data: { companyId: effectiveCompanyId, status: "active" },
      });
      setEmployees(emps);
      const mine = emps.find((e) => e.user_id === auth.user?.id) ?? (isEmployee ? emps[0] : undefined);
      if (mine) setMyEmployeeId(mine.id);
      if (isEmployee) {
        if (mine) setClockEmployeeId(mine.id);
      } else if (!clockEmployeeId && emps[0]) {
        setClockEmployeeId(emps[0].id);
      }
    })();
  }, [effectiveCompanyId, isEmployee, auth.user?.id]);

  useEffect(() => {
    void load();
  }, [companyFilter, workDate, lockedCompanyId, isEmployee]);

  const handleUpsert = async (values: UpsertAttendanceInput) => {
    const result = await upsertAttendance({ data: values });
    if (!result.ok) throw new Error(result.message);
    setOpen(false);
    await load();
  };

  const handleClock = async (action: "in" | "out") => {
    const employeeId = isEmployee ? (myEmployeeId ?? clockEmployeeId) : clockEmployeeId;
    if (!effectiveCompanyId || !employeeId) {
      setError(isEmployee ? "Fiche employé introuvable" : "Sélectionnez une entreprise et un employé");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await clockAttendance({
        data: { companyId: effectiveCompanyId, employeeId, action },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const handleMarkAbsent = async () => {
    if (!effectiveCompanyId) {
      setError("Sélectionnez une entreprise");
      return;
    }
    setBusy(true);
    try {
      const result = await markAbsentForActive({
        data: { companyId: effectiveCompanyId, workDate },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const todayRecord = useMemo(
    () => records.find((r) => r.work_date === today) ?? null,
    [records, today],
  );

  return (
    <>
      <PageHeader
        badge="Temps"
        title="Pointage"
        description={
          isEmployee
            ? "Vos entrées / sorties du mois (fuseau Comores)."
            : "Entrées / sorties, retards et heures travaillées (fuseau Comores)."
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {canManage && (
              <Button variant="outline" size="sm" disabled={busy || !effectiveCompanyId} onClick={() => void handleMarkAbsent()}>
                <UserCheck className="mr-1.5 h-4 w-4" />
                Marquer absents
              </Button>
            )}
            {canManage && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-1.5 h-4 w-4" />
                    Saisie manuelle
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle className="font-display">Enregistrement de présence</DialogTitle>
                  </DialogHeader>
                  <AttendanceForm
                    lockedCompanyId={lockedCompanyId ?? effectiveCompanyId ?? null}
                    defaultWorkDate={workDate}
                    onSubmit={handleUpsert}
                  />
                </DialogContent>
              </Dialog>
            )}
            {isEmployee && (
              <>
                <Button size="sm" disabled={busy || !myEmployeeId} onClick={() => void handleClock("in")}>
                  <LogIn className="mr-1.5 h-4 w-4" />
                  Entrée
                </Button>
                <Button size="sm" variant="outline" disabled={busy || !myEmployeeId} onClick={() => void handleClock("out")}>
                  <LogOut className="mr-1.5 h-4 w-4" />
                  Sortie
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label={isEmployee ? "Jours présents" : "Présents"}
          value={String(stats.present)}
          icon={LogIn}
          accent="success"
        />
        <StatCard label="Retards" value={String(stats.late)} icon={Clock} accent="gold" />
        <StatCard label="Heures supp." value={`${stats.overtimeHours}h`} icon={Timer} accent="primary" />
        <StatCard
          label={isEmployee ? "Jours absents" : "Absents"}
          value={String(stats.absent)}
          icon={LogOut}
          accent="destructive"
        />
      </div>

      {isEmployee && todayRecord && (
        <p className="mt-4 text-sm text-muted-foreground">
          Aujourd’hui ({today}) : entrée{" "}
          <span className="font-mono text-foreground">{todayRecord.check_in?.slice(0, 5) ?? "—"}</span>
          {" · "}
          sortie{" "}
          <span className="font-mono text-foreground">{todayRecord.check_out?.slice(0, 5) ?? "—"}</span>
          {" · "}
          <StatusPill status={attendanceStatusToPill(todayRecord.status)} />
        </p>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        {admin && (
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue placeholder="Entreprise" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les entreprises</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.legal_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {!isEmployee && (
          <>
            <Input
              type="date"
              className="w-full sm:w-44"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
            />
            {effectiveCompanyId && (
              <>
                <Select value={clockEmployeeId} onValueChange={setClockEmployeeId}>
                  <SelectTrigger className="w-full sm:w-56">
                    <SelectValue placeholder="Employé à pointer" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.first_name} {e.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" disabled={busy || !clockEmployeeId} onClick={() => void handleClock("in")}>
                  <LogIn className="mr-1.5 h-4 w-4" />
                  Entrée
                </Button>
                <Button size="sm" variant="outline" disabled={busy || !clockEmployeeId} onClick={() => void handleClock("out")}>
                  <LogOut className="mr-1.5 h-4 w-4" />
                  Sortie
                </Button>
              </>
            )}
          </>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard
            title={isEmployee ? "Mes pointages du mois" : "Présences du jour"}
            description={isEmployee ? month.label : workDate}
          >
            {loading ? (
              <p className="text-sm text-muted-foreground">Chargement…</p>
            ) : records.length === 0 ? (
              <EmptyPlaceholder
                title="Aucun pointage"
                description={
                  isEmployee
                    ? "Pointez votre entrée pour commencer la journée."
                    : "Pointez une entrée ou saisissez une présence manuellement."
                }
                icon={Clock}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    {isEmployee ? <TableHead>Date</TableHead> : <TableHead>Employé</TableHead>}
                    <TableHead>Entrée</TableHead>
                    <TableHead>Sortie</TableHead>
                    <TableHead>Durée</TableHead>
                    <TableHead>Statut</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        {isEmployee ? (
                          <div className="font-medium font-mono text-sm">{r.work_date}</div>
                        ) : (
                          <>
                            <div className="font-medium">{r.employee_name}</div>
                            <div className="text-xs text-muted-foreground">{r.job_title}</div>
                          </>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {r.check_in?.slice(0, 5) ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {r.check_out?.slice(0, 5) ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatMinutes(r.worked_minutes)}
                      </TableCell>
                      <TableCell>
                        <StatusPill status={attendanceStatusToPill(r.status)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </div>

        <SectionCard
          title={isEmployee ? "Mes heures" : "Heures moyennes"}
          description={isEmployee ? "Mois en cours · heures / jour" : "Mois en cours · moyenne par jour"}
        >
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="d" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 12,
                  }}
                />
                <Bar dataKey="h" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>
    </>
  );
}
