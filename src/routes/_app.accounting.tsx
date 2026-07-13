import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { EmptyPlaceholder, Money, SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Calculator, TrendingUp, TrendingDown, Wallet, Building2, Landmark, Download,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listCompanies } from "@/modules/companies/company.functions";
import { getAccountingOverview } from "@/modules/accounting/accounting.functions";
import type { CompanyWithMeta } from "@/modules/companies/types";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/accounting")({ component: AccountingPage });

const appRouteApi = getRouteApi("/_app");

function formatK(n: number) {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} M`;
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)} k`;
  return new Intl.NumberFormat("fr-KM", { maximumFractionDigits: 0 }).format(n);
}

function AccountingPage() {
  const { auth } = appRouteApi.useRouteContext();
  const admin = isPlatformAdmin(auth);
  const profileCompanyId = auth.profile?.company_id ?? null;

  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [companyFilter, setCompanyFilter] = useState(profileCompanyId ?? "all");
  const [data, setData] = useState<Awaited<ReturnType<typeof getAccountingOverview>> | null>(null);
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
        setData(await getAccountingOverview({ data: { companyId: effectiveCompanyId } }));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Chargement impossible");
      } finally {
        setLoading(false);
      }
    })();
  }, [companyFilter, lockedCompanyId]);

  const downloadJournalCsv = () => {
    const entries = data?.entries ?? [];
    if (!entries.length) return;
    const escape = (v: string | number) => {
      const s = String(v ?? "");
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const header = ["date", "description", "category", "amount", "currency", "status"];
    const lines = [
      header.join(","),
      ...entries.map((e) =>
        [e.date, e.description, e.category, e.amount, e.currency, e.status]
          .map(escape)
          .join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `journal-comptable-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader
        badge="Finance"
        title="Comptabilité"
        description="Charges de personnel et virements issus de la paie AnkibaPay."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!data?.entries.length}
              onClick={downloadJournalCsv}
            >
              <Download className="mr-1.5 h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to="/payroll">
                <Calculator className="mr-1.5 h-4 w-4" />
                Cycles de paie
              </Link>
            </Button>
          </div>
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
        <StatCard
          label={`Net payé ${data?.year ?? ""}`}
          value={loading ? "…" : formatK(data?.netPaidYtd ?? 0)}
          icon={Wallet}
          accent="success"
          delta={data?.paidCount ? `${data.paidCount} cycle(s)` : undefined}
          deltaLabel="payés"
          trend="up"
        />
        <StatCard
          label="Masse brute YTD"
          value={loading ? "…" : formatK(data?.grossYtd ?? 0)}
          icon={TrendingUp}
          accent="primary"
        />
        <StatCard
          label="Coût employeur YTD"
          value={loading ? "…" : formatK(data?.employerYtd ?? 0)}
          icon={TrendingDown}
          accent="destructive"
        />
        <StatCard
          label="En attente de paiement"
          value={loading ? "…" : formatK(data?.pendingNet ?? 0)}
          icon={Landmark}
          accent="gold"
          delta={data?.pendingCount ? `${data.pendingCount}` : undefined}
          deltaLabel="cycle(s)"
          trend="down"
        />
      </div>

      <div className="mt-6">
        <SectionCard
          title="Charges de personnel"
          description="Brut / net / coût employeur (milliers KMF)"
        >
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : (data?.trend.length ?? 0) === 0 ? (
            <EmptyPlaceholder
              title="Aucune écriture de paie"
              description="Calculez un cycle sur Paie pour voir les charges ici."
              icon={Calculator}
            />
          ) : (
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data!.trend}>
                  <defs>
                    <linearGradient id="acc-brut" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="acc-net" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
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
                  <Legend />
                  <Area type="monotone" dataKey="brut" name="Brut" stroke="var(--color-primary)" strokeWidth={2.5} fill="url(#acc-brut)" />
                  <Area type="monotone" dataKey="net" name="Net" stroke="var(--color-success)" strokeWidth={2.5} fill="url(#acc-net)" />
                  <Area type="monotone" dataKey="cout" name="Coût emp." stroke="var(--color-destructive)" strokeWidth={2} fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      <div className="mt-6">
        <SectionCard title="Journal paie & virements" description="Écritures dérivées des cycles et lots bancaires">
          {(data?.entries.length ?? 0) === 0 && !loading ? (
            <EmptyPlaceholder
              title="Journal vide"
              description="Les cycles calculés et les lots de virement apparaîtront ici."
              icon={Landmark}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead>Statut</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.entries ?? []).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-muted-foreground">{e.date}</TableCell>
                    <TableCell className="font-medium">
                      <a href={e.href} className="hover:text-primary hover:underline">
                        {e.description}
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{e.category}</TableCell>
                    <TableCell className="text-right font-medium text-foreground">
                      <Money value={e.amount} currency={e.currency} />
                    </TableCell>
                    <TableCell><StatusPill status={e.status} /></TableCell>
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
