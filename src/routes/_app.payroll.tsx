import { createFileRoute, Link, getRouteApi } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { EmptyPlaceholder, Money, SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Wallet, Play, FileText, DollarSign, TrendingUp, Building2, Settings2,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import { listCompanies } from "@/modules/companies/company.functions";
import {
  createPayrollRun,
  listPayrollComponents,
  listPayrollRuns,
  payrollStats,
  payrollTrend,
} from "@/modules/payroll/payroll.functions";
import { PayrollComponentsPanel } from "@/modules/payroll/components/PayrollComponentsPanel";
import {
  MONTHS_FR,
  payrollRunStatusPill,
  type PayrollComponent,
  type PayrollRunWithMeta,
} from "@/modules/payroll/types";
import type { CompanyWithMeta } from "@/modules/companies/types";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/payroll")({ component: PayrollPage });

const appRouteApi = getRouteApi("/_app");

function formatKmfCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)} k`;
  return String(Math.round(value));
}

function PayrollPage() {
  const { auth } = appRouteApi.useRouteContext();
  const profileCompanyId = auth.profile?.company_id ?? null;
  const admin = isPlatformAdmin(auth);
  const canManage =
    admin || auth.profile?.role === "employer" || auth.profile?.role === "hr";

  const now = useMemo(() => new Date(), []);
  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>(profileCompanyId ?? "all");
  const [runs, setRuns] = useState<PayrollRunWithMeta[]>([]);
  const [components, setComponents] = useState<PayrollComponent[]>([]);
  const [stats, setStats] = useState({
    latestGross: 0, latestNet: 0, latestEmployees: 0, latestAvg: 0, payslipCount: 0, ytdGross: 0,
  });
  const [trend, setTrend] = useState<Array<{ m: string; brut: number; net: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openRun, setOpenRun] = useState(false);
  const [openConfig, setOpenConfig] = useState(false);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [creating, setCreating] = useState(false);

  const lockedCompanyId = admin ? null : profileCompanyId;
  const effectiveCompanyId =
    lockedCompanyId ?? (companyFilter === "all" ? undefined : companyFilter);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, s, t] = await Promise.all([
        listPayrollRuns({ data: { companyId: effectiveCompanyId } }),
        payrollStats({ data: { companyId: effectiveCompanyId } }),
        payrollTrend({ data: { companyId: effectiveCompanyId } }),
      ]);
      setRuns(rows);
      setStats(s);
      setTrend(t);

      if (effectiveCompanyId) {
        setComponents(await listPayrollComponents({ data: { companyId: effectiveCompanyId } }));
      } else {
        setComponents([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger la paie");
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
    void load();
  }, [companyFilter, lockedCompanyId]);

  const handleCreate = async () => {
    const companyId = effectiveCompanyId ?? (admin && companies[0]?.id);
    if (!companyId) {
      setError("Sélectionnez une entreprise");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const result = await createPayrollRun({
        data: { companyId, year, month },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpenRun(false);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const earningsShare = stats.latestGross > 0
    ? Math.round((stats.latestNet / stats.latestGross) * 100)
    : 0;

  return (
    <>
      <PageHeader
        badge="Paie"
        title="Paie"
        description="Cycles mensuels, composants paramétrables et bulletins en KMF."
        actions={
          <>
            {canManage && (
              <Dialog open={openConfig} onOpenChange={setOpenConfig}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!effectiveCompanyId}
                    title={!effectiveCompanyId ? "Sélectionnez une entreprise" : undefined}
                  >
                    <Settings2 className="mr-1.5 h-4 w-4" />
                    Composants
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle className="font-display">Composants de paie</DialogTitle>
                  </DialogHeader>
                  {effectiveCompanyId && (
                    <PayrollComponentsPanel
                      companyId={effectiveCompanyId}
                      components={components}
                      onChanged={load}
                    />
                  )}
                </DialogContent>
              </Dialog>
            )}
            {canManage && (
              <Dialog open={openRun} onOpenChange={setOpenRun}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Play className="mr-1.5 h-4 w-4" />
                    Nouveau cycle
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle className="font-display">Lancer un cycle de paie</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    {!lockedCompanyId && (
                      <div className="space-y-2">
                        <Label>Entreprise</Label>
                        <Select
                          value={companyFilter === "all" ? "" : companyFilter}
                          onValueChange={setCompanyFilter}
                        >
                          <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                          <SelectContent>
                            {companies.map((c) => (
                              <SelectItem key={c.id} value={c.id}>{c.legal_name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Mois</Label>
                        <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {MONTHS_FR.map((m, i) => (
                              <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Année</Label>
                        <Input
                          type="number"
                          value={year}
                          onChange={(e) => setYear(Number(e.target.value))}
                        />
                      </div>
                    </div>
                    <Button className="w-full" disabled={creating} onClick={() => void handleCreate()}>
                      {creating ? "Création…" : "Créer le cycle"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Masse brute (dernier)"
          value={`${formatKmfCompact(stats.latestGross)} KMF`}
          icon={Wallet}
          accent="primary"
        />
        <StatCard
          label="Salaire net moyen"
          value={`${formatKmfCompact(stats.latestAvg)} KMF`}
          icon={DollarSign}
          accent="gold"
        />
        <StatCard
          label="Bulletins générés"
          value={String(stats.payslipCount)}
          icon={FileText}
          accent="success"
        />
        <StatCard
          label="Brut YTD"
          value={`${formatKmfCompact(stats.ytdGross)} KMF`}
          icon={TrendingUp}
          accent="primary"
        />
      </div>

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
      </div>

      {error && (
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard title="Tendance de la paie" description="Brut vs net (millions KMF)">
            <div className="h-[260px]">
              {trend.length === 0 ? (
                <p className="grid h-full place-items-center text-sm text-muted-foreground">
                  Aucun cycle calculé pour l’instant.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--color-card)",
                        border: "1px solid var(--color-border)",
                        borderRadius: 12,
                      }}
                    />
                    <Line type="monotone" dataKey="brut" name="Brut" stroke="var(--color-primary)" strokeWidth={3} dot={{ r: 3 }} />
                    <Line type="monotone" dataKey="net" name="Net" stroke="var(--color-gold)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </SectionCard>
        </div>
        <SectionCard title="Répartition" description="Dernier cycle">
          {[
            { l: "Net versé", v: stats.latestNet, w: `${earningsShare}%` },
            { l: "Retenues", v: Math.max(0, stats.latestGross - stats.latestNet), w: `${Math.max(0, 100 - earningsShare)}%` },
          ].map((r) => (
            <div key={r.l} className="mb-3 last:mb-0">
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium">{r.l}</span>
                <span className="font-mono text-muted-foreground">
                  <Money value={r.v} />
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: r.w }} />
              </div>
            </div>
          ))}
          <p className="mt-4 text-xs text-muted-foreground">
            {stats.latestEmployees} salarié{stats.latestEmployees > 1 ? "s" : ""} sur le dernier cycle.
          </p>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Cycles de paie">
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : runs.length === 0 ? (
            <EmptyPlaceholder
              title="Aucun cycle"
              description="Créez un cycle mensuel, configurez les composants, puis lancez le calcul."
              icon={Wallet}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Période</TableHead>
                  {admin && <TableHead>Entreprise</TableHead>}
                  <TableHead>Effectif</TableHead>
                  <TableHead>Brut</TableHead>
                  <TableHead>Net</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.label}</TableCell>
                    {admin && (
                      <TableCell className="text-muted-foreground">{r.company_name}</TableCell>
                    )}
                    <TableCell className="font-mono">{r.employee_count}</TableCell>
                    <TableCell className="font-mono">
                      <Money value={r.total_gross} currency={r.currency_code} />
                    </TableCell>
                    <TableCell className="font-mono font-semibold">
                      <Money value={r.total_net} currency={r.currency_code} />
                    </TableCell>
                    <TableCell>
                      <StatusPill status={payrollRunStatusPill[r.status]} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" asChild>
                        <Link to="/payroll/$runId" params={{ runId: r.id }}>
                          Ouvrir
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </SectionCard>
      </div>
    </>
  );
}
