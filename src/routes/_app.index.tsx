import { createFileRoute, Link, getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { StatCard, SectionCard, StatusPill, Money } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Users, Wallet, Clock, ListChecks, Plus, ArrowRight, FileSignature,
  CalendarDays, WalletCards, CheckCircle2, Target, ShieldCheck, Building2, AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar,
} from "recharts";
import {
  getDashboardData,
  type DashboardData,
} from "@/modules/dashboard/dashboard.functions";
import { getMyWorkspace, type MyWorkspace } from "@/modules/workspace/workspace.functions";
import { getAdminOverview, type AdminOverview } from "@/modules/admin/admin.functions";
import { getUserRole, WORKFLOWS, isEmployerLike } from "@/lib/auth/roles";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";
import type { AppRole } from "@/lib/auth/types";
import {
  companyApprovalLabel,
  type CompanyApprovalStatus,
} from "@/modules/companies/types";
import { CompanyApprovalActions } from "@/modules/admin/components/CompanyApprovalActions";

export const Route = createFileRoute("/_app/")({
  component: DashboardPage,
});

const appRouteApi = getRouteApi("/_app");

function formatGross(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")} M KMF`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} k KMF`;
  return `${Math.round(value)} KMF`;
}

function WorkflowStrip({ role }: { role: AppRole }) {
  const wf = WORKFLOWS[role];
  return (
    <SectionCard title={wf.title} description={wf.badge}>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {wf.steps.map((s) => (
          <Link
            key={s.n}
            to={s.href as "/"}
            className="group rounded-xl border border-border bg-muted/20 p-3 transition-all hover:-translate-y-0.5 hover:border-primary hover:bg-primary-soft/40"
          >
            <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
              {s.n}
            </div>
            <div className="text-sm font-medium group-hover:text-primary">{s.title}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{s.subtitle}</div>
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}

function EmployeeHome({ ws, name }: { ws: MyWorkspace | null; name: string }) {
  const present = ws?.todayAttendance?.check_in_at && !ws.todayAttendance.check_out_at;
  return (
    <>
      <PageHeader
        badge="Espace collaborateur"
        title={`Bonjour, ${name}`}
        description="Badgez, déclarez vos congés et consultez vos bulletins."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/leave">Congés</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/attendance">
                <Clock className="mr-1.5 h-4 w-4" />
                {present ? "Pointer la sortie" : "Badger"}
              </Link>
            </Button>
          </>
        }
      />
      <WorkflowStrip role="employee" />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pointage du jour"
          value={
            !ws?.todayAttendance
              ? "À badger"
              : present
                ? "Présent"
                : ws.todayAttendance.check_out_at
                  ? "Terminé"
                  : StatusLabel(ws.todayAttendance.status)
          }
          icon={Clock}
          accent="success"
        />
        <StatCard
          label="Congés en cours"
          value={String(ws?.pendingLeaves ?? 0)}
          icon={CalendarDays}
          accent="gold"
        />
        <StatCard
          label="Tâches ouvertes"
          value={String(ws?.openTasks ?? 0)}
          icon={ListChecks}
          accent="primary"
        />
        <StatCard
          label="Contrats à signer"
          value={String(ws?.contractsToSign ?? 0)}
          icon={FileSignature}
          accent="destructive"
        />
      </div>
      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Mes demandes de congé" action={<Button variant="ghost" size="sm" asChild><Link to="/leave">Voir</Link></Button>}>
          {(ws?.myLeaveRequests.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune demande récente.</p>
          ) : (
            <div className="divide-y divide-border">
              {ws!.myLeaveRequests.map((l) => (
                <div key={l.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                  <div>
                    <div className="text-sm font-medium">{l.start_date} → {l.end_date}</div>
                    <div className="text-xs text-muted-foreground">{l.days_count} jour(s)</div>
                  </div>
                  <StatusPill status={leaveStatusFr(l.status)} />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
        <SectionCard title="Dernier bulletin" action={<Button variant="ghost" size="sm" asChild><Link to="/payroll">Paie</Link></Button>}>
          {!ws?.latestPayslip ? (
            <p className="text-sm text-muted-foreground">
              Aucun bulletin disponible pour le moment.
            </p>
          ) : (
            <div className="flex items-center gap-4">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary-soft text-primary">
                <WalletCards className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium">{ws.latestPayslip.period_label}</div>
                <div className="text-xs text-muted-foreground">
                  {ws.latestPayslip.payslip_number || "Bulletin"}
                </div>
              </div>
              <div className="text-right">
                <Money value={ws.latestPayslip.net_amount} currency={ws.latestPayslip.currency_code} />
                <Button size="sm" className="mt-2" asChild>
                  <Link to="/payroll/payslip/$payslipId" params={{ payslipId: ws.latestPayslip.id }}>
                    Ouvrir
                  </Link>
                </Button>
              </div>
            </div>
          )}
          {!ws?.employee && (
            <p className="mt-4 rounded-lg border border-gold/30 bg-gold/10 px-3 py-2 text-xs text-gold-foreground">
              Votre compte n’est pas encore lié à une fiche employé. Contactez les RH.
            </p>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function leaveStatusFr(s: string) {
  return (
    {
      pending: "En attente manager",
      pending_manager: "En attente manager",
      pending_hr: "En attente RH",
      approved: "Approuvé",
      rejected: "Refusé",
      draft: "Brouillon",
      cancelled: "Annulé",
    }[s] ?? s
  );
}

function StatusLabel(s: string) {
  return (
    { present: "Présent", absent: "Absent", late: "Retard", remote: "Télétravail" }[s] ?? s
  );
}

function ManagerHome({ ws, name }: { ws: MyWorkspace | null; name: string }) {
  return (
    <>
      <PageHeader
        badge="Espace manager"
        title={`Bonjour, ${name}`}
        description="Consultez l’équipe, validez les demandes, suivez la performance."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/performance">Performance</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/leave">Valider les congés</Link>
            </Button>
          </>
        }
      />
      <WorkflowStrip role="manager" />
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Effectif équipe"
          value={String(ws?.teamHeadcount ?? 0)}
          icon={Users}
          accent="primary"
        />
        <StatCard
          label="Présents aujourd’hui"
          value={String(ws?.teamPresentToday ?? 0)}
          icon={CheckCircle2}
          accent="success"
        />
        <StatCard
          label="Congés à valider"
          value={String(ws?.teamPendingLeaves.length ?? 0)}
          icon={CalendarDays}
          accent="gold"
        />
        <StatCard
          label="Objectifs"
          value="→"
          icon={Target}
          accent="primary"
          deltaLabel="Performance"
        />
      </div>
      <div className="mt-6">
        <SectionCard
          title="Demandes à valider"
          description="Congés en attente de votre équipe"
          action={<Button variant="outline" size="sm" asChild><Link to="/leave">Tout voir</Link></Button>}
        >
          {(ws?.teamPendingLeaves.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune demande en attente.</p>
          ) : (
            <div className="divide-y divide-border">
              {ws!.teamPendingLeaves.map((l) => (
                <div key={l.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-primary-soft text-xs text-primary">
                      {l.employee_name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{l.employee_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.start_date} → {l.end_date} · {l.days_count} j
                    </div>
                  </div>
                  <Button size="sm" asChild>
                    <Link to="/leave">Traiter</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function EmployerHome({
  data, loading, name, error, role = "employer",
}: {
  data: DashboardData | null;
  loading: boolean;
  name: string;
  error: string | null;
  role?: "employer" | "hr";
}) {
  const isHr = role === "hr";
  return (
    <>
      <PageHeader
        badge={isHr ? "Espace RH" : "Espace employeur"}
        title={`Bonjour, ${name}`}
        description={
          isHr
            ? "Effectif, congés (validation finale), paie et documents de l’entreprise."
            : "Situation de l’effectif et de la paie pour aujourd’hui."
        }
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/leave">{isHr ? "Congés à valider" : "Congés"}</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/employees"><Plus className="mr-1.5 h-4 w-4" />Employé</Link>
            </Button>
          </>
        }
      />

      <WorkflowStrip role={isHr ? "hr" : "employer"} />

      {error && (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Employés" value={loading ? "…" : String(data?.stats.employees ?? 0)} icon={Users} accent="primary" />
        <StatCard label="Masse salariale" value={loading ? "…" : formatGross(data?.stats.payrollGross ?? 0)} icon={Wallet} accent="gold" />
        <StatCard
          label="Présence du jour"
          value={loading ? "…" : data?.stats.attendanceRate != null ? `${data.stats.attendanceRate} %` : "—"}
          icon={Clock}
          accent="success"
        />
        <StatCard label="À valider" value={loading ? "…" : String(data?.stats.pendingApprovals ?? 0)} icon={ListChecks} accent="destructive" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard
            title="Tendance de la paie"
            description="Brut vs net — cycles calculés (millions KMF)"
            action={<Button variant="ghost" size="sm" asChild><Link to="/payroll">Voir <ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button>}
          >
            <div className="h-[280px]">
              {(data?.payrollTrend.length ?? 0) === 0 ? (
                <p className="grid h-full place-items-center text-sm text-muted-foreground">
                  Aucun cycle de paie calculé pour l’instant.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data!.payrollTrend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-gold)" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="var(--color-gold)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
                    <Area type="monotone" dataKey="brut" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#g1)" name="Brut" />
                    <Area type="monotone" dataKey="net" stroke="var(--color-gold)" strokeWidth={2.5} fill="url(#g2)" name="Net" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </SectionCard>
        </div>
        <SectionCard title="Présence de la semaine" description="Pointages" action={<Button variant="ghost" size="sm" asChild><Link to="/attendance">Ouvrir</Link></Button>}>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.attendanceWeek ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="d" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
                <Bar dataKey="p" fill="var(--color-primary)" radius={[6, 6, 0, 0]} name="Présents" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard
            title="Validations en attente"
            description={loading ? "Chargement…" : `${data?.pendingItems.length ?? 0} élément(s) à traiter`}
            action={<Button variant="outline" size="sm" asChild><Link to="/leave">Congés</Link></Button>}
          >
            {(data?.pendingItems.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Rien en attente — paie, congés et contrats sont à jour.</p>
            ) : (
              <div className="divide-y divide-border">
                {data!.pendingItems.map((a) => (
                  <div key={`${a.type}-${a.id}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                      {a.type === "leave" ? <CalendarDays className="h-4 w-4" /> : a.type === "payroll" ? <WalletCards className="h-4 w-4" /> : <FileSignature className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{a.title}</div>
                      <div className="text-xs text-muted-foreground">{a.subtitle}</div>
                    </div>
                    <Button size="sm" asChild><a href={a.href}>Ouvrir</a></Button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
        <SectionCard title="Contrats à échéance" description="30 prochains jours" action={<Button variant="ghost" size="sm" asChild><Link to="/contracts">Voir tout</Link></Button>}>
          {(data?.expiringContracts.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun CDD / contrat à échéance proche.</p>
          ) : (
            <div className="space-y-4">
              {data!.expiringContracts.map((c) => (
                <div key={c.id} className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback className="bg-gold/20 text-xs font-semibold text-gold-foreground">
                      {c.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.role}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium">{c.ends}</div>
                    <StatusPill status={c.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function PlatformAdminHome({
  data, loading, name, error, onRefresh, onError,
}: {
  data: AdminOverview | null;
  loading: boolean;
  name: string;
  error: string | null;
  onRefresh: () => void;
  onError: (message: string) => void;
}) {
  const pending = (data?.companies ?? []).filter(
    (c) =>
      c.approval_status === "pending_approval" || c.approval_status === "pending_payment",
  );

  return (
    <>
      <PageHeader
        badge="Console plateforme"
        title={`Bonjour, ${name}`}
        description="Pilotage SaaS AnkibaPay — validation des entreprises et santé des tenants."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/companies">Tenants</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/admin">
                <ShieldCheck className="mr-1.5 h-4 w-4" />
                Console admin
              </Link>
            </Button>
          </>
        }
      />

      <WorkflowStrip role="platform_admin" />

      {error && (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Entreprises"
          value={loading ? "…" : String(data?.tenants ?? 0)}
          icon={Building2}
          accent="primary"
        />
        <StatCard
          label="À valider"
          value={loading ? "…" : String(data?.pendingApprovals ?? 0)}
          icon={AlertTriangle}
          accent={data?.pendingApprovals ? "destructive" : "gold"}
        />
        <StatCard
          label="Utilisateurs actifs"
          value={loading ? "…" : String(data?.activeUsers ?? 0)}
          icon={Users}
          accent="gold"
        />
        <StatCard
          label="Employés (tous tenants)"
          value={loading ? "…" : String(data?.employees ?? 0)}
          icon={Users}
          accent="success"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard
          title="File de validation"
          description="Vérifiez le code M'Vola puis activez"
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin">Traiter</Link>
            </Button>
          }
        >
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune entreprise en attente.</p>
          ) : (
            <div className="divide-y divide-border">
              {pending.slice(0, 6).map((c) => (
                <div
                  key={c.id}
                  className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold-foreground">
                      <Building2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{c.legal_name}</div>
                      <div className="text-xs text-muted-foreground">
                        Plan {c.subscription_plan || "—"} · {c.city || "—"}
                        {c.payment_reference ? (
                          <>
                            {" · "}
                            <span className="font-mono text-primary">{c.payment_reference}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <StatusPill
                      status={
                        companyApprovalLabel[c.approval_status as CompanyApprovalStatus] ??
                        c.approval_status
                      }
                    />
                  </div>
                  <CompanyApprovalActions
                    companyId={c.id}
                    approvalStatus={c.approval_status}
                    onDone={onRefresh}
                    onError={onError}
                  />
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Tenants récents"
          description="Dernières entreprises inscrites"
          action={
            <Button variant="outline" size="sm" asChild>
              <Link to="/companies">Tout voir</Link>
            </Button>
          }
        >
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : !(data?.companies.length) ? (
            <p className="text-sm text-muted-foreground">Aucun tenant.</p>
          ) : (
            <div className="divide-y divide-border">
              {data!.companies.slice(0, 6).map((c) => (
                <div key={c.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{c.legal_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.employee_count} employé(s) · {c.city || "—"}
                    </div>
                  </div>
                  <StatusPill
                    status={
                      companyApprovalLabel[c.approval_status as CompanyApprovalStatus] ??
                      c.approval_status
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function DashboardPage() {
  const { auth } = appRouteApi.useRouteContext();
  const role = getUserRole(auth);
  const admin = isPlatformAdmin(auth);
  const employerLike = isEmployerLike(role);

  const [data, setData] = useState<DashboardData | null>(null);
  const [adminData, setAdminData] = useState<AdminOverview | null>(null);
  const [ws, setWs] = useState<MyWorkspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        if (admin) {
          setAdminData(await getAdminOverview());
        } else if (employerLike) {
          const companyId = auth.profile?.company_id ?? undefined;
          setData(await getDashboardData({ data: { companyId } }));
        } else {
          setWs(await getMyWorkspace());
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Chargement impossible");
      } finally {
        setLoading(false);
      }
    })();
  }, [admin, employerLike, auth.profile?.company_id]);

  const name =
    (admin
      ? auth.profile?.full_name?.split(/\s+/)[0]
      : employerLike
        ? data?.greetingName
        : auth.profile?.full_name?.split(/\s+/)[0]) ||
    auth.email.split("@")[0] ||
    "…";
  const displayName = name.charAt(0).toUpperCase() + name.slice(1);

  if (admin) {
    return (
      <PlatformAdminHome
        data={adminData}
        loading={loading}
        name={displayName}
        error={error}
        onError={setError}
        onRefresh={() => {
          void (async () => {
            try {
              setAdminData(await getAdminOverview());
            } catch (err) {
              setError(err instanceof Error ? err.message : "Chargement impossible");
            }
          })();
        }}
      />
    );
  }
  if (role === "employee") {
    return <EmployeeHome ws={ws} name={displayName} />;
  }
  if (role === "manager") {
    return <ManagerHome ws={ws} name={displayName} />;
  }
  return (
    <EmployerHome
      data={data}
      loading={loading}
      name={displayName}
      error={error}
      role={role === "hr" ? "hr" : "employer"}
    />
  );
}
