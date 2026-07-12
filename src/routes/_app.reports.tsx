import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { Money, SectionCard, StatCard } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart3, FileText, Users, Wallet, Building2, CalendarDays, Clock,
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, AreaChart, Area,
} from "recharts";
import { listCompanies } from "@/modules/companies/company.functions";
import { getReportsData } from "@/modules/reports/report.functions";
import type { CompanyWithMeta } from "@/modules/companies/types";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/reports")({ component: ReportsPage });

const appRouteApi = getRouteApi("/_app");

function ReportsPage() {
  const { auth } = appRouteApi.useRouteContext();
  const admin = isPlatformAdmin(auth);
  const profileCompanyId = auth.profile?.company_id ?? null;

  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [companyFilter, setCompanyFilter] = useState(profileCompanyId ?? "all");
  const [data, setData] = useState<Awaited<ReturnType<typeof getReportsData>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const lockedCompanyId = admin ? null : profileCompanyId;
  const effectiveCompanyId =
    lockedCompanyId ?? (companyFilter === "all" ? undefined : companyFilter);

  useEffect(() => {
    void (async () => {
      if (admin) setCompanies(await listCompanies());
    })();
  }, [admin]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        setData(await getReportsData({ data: { companyId: effectiveCompanyId } }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Chargement impossible");
      } finally {
        setLoading(false);
      }
    })();
  }, [companyFilter, lockedCompanyId]);

  return (
    <>
      <PageHeader
        badge="Analytique"
        title="Rapports"
        description="Effectif, paie et présence — données live AnkibaPay."
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link to="/payroll"><BarChart3 className="mr-1.5 h-4 w-4" />Paie</Link>
          </Button>
        }
      />

      {admin && (
        <div className="mb-4">
          <Select value={companyFilter} onValueChange={setCompanyFilter}>
            <SelectTrigger className="w-full sm:w-56">
              <Building2 className="mr-2 h-4 w-4 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toutes les entreprises</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.legal_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Effectif actif" value={loading ? "…" : String(data?.headcount ?? 0)} icon={Users} accent="primary" />
        <StatCard
          label="Masse salariale base"
          value={loading ? "…" : `${Math.round((data?.massSalary ?? 0) / 1000)} k`}
          icon={Wallet}
          accent="gold"
        />
        <StatCard label="Présents aujourd’hui" value={loading ? "…" : String(data?.presentToday ?? 0)} icon={Clock} accent="success" />
        <StatCard label="Congés en attente" value={loading ? "…" : String(data?.pendingLeave ?? 0)} icon={CalendarDays} accent="destructive" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Répartition par département">
          <div className="h-[260px]">
            {(data?.byDept.length ?? 0) === 0 ? (
              <p className="grid h-full place-items-center text-sm text-muted-foreground">Pas encore de données.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data!.byDept} innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {data!.byDept.map((p) => <Cell key={p.name} fill={p.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Effectif par ville / site">
          <div className="h-[260px]">
            {(data?.byCity.length ?? 0) === 0 ? (
              <p className="grid h-full place-items-center text-sm text-muted-foreground">Pas encore de données.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data!.byCity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="c" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
                  <Bar dataKey="v" fill="var(--color-primary)" radius={[6, 6, 0, 0]} name="Employés" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Tendance paie" description="Brut / net (millions KMF)">
          <div className="h-[240px]">
            {(data?.payrollTrend.length ?? 0) === 0 ? (
              <p className="grid h-full place-items-center text-sm text-muted-foreground">
                Aucun cycle calculé — lancez une paie pour alimenter ce graphique.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data!.payrollTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="m" stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 12 }} />
                  <Area type="monotone" dataKey="brut" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.15} name="Brut" />
                  <Area type="monotone" dataKey="net" stroke="var(--color-gold)" fill="var(--color-gold)" fillOpacity={0.12} name="Net" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {(data?.catalog ?? []).map((r) => (
          <a
            key={r.title}
            href={r.href}
            className="card-elevated flex items-start gap-3 p-4 transition-all hover:-translate-y-0.5 hover:shadow-glow"
          >
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
              <FileText className="h-4 w-4" />
            </div>
            <div>
              <div className="font-medium">{r.title}</div>
              <div className="text-xs text-muted-foreground">{r.desc}</div>
            </div>
          </a>
        ))}
      </div>

      {data && data.massSalary > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Masse salariale de base cumulée : <Money value={data.massSalary} />
        </p>
      )}
    </>
  );
}
