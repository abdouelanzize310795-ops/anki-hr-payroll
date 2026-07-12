import { createFileRoute, Link, getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { EmptyPlaceholder, Money, SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Landmark, Download, FileText, Wallet, Building2, Plus } from "lucide-react";
import { listCompanies } from "@/modules/companies/company.functions";
import {
  generateTransferBatch,
  listEligiblePayrollRuns,
  listTransferBatches,
  transferStats,
} from "@/modules/transfers/transfer.functions";
import {
  transferStatusPill,
  type TransferBatch,
} from "@/modules/transfers/types";
import type { CompanyWithMeta } from "@/modules/companies/types";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/transfers")({ component: TransfersPage });

const appRouteApi = getRouteApi("/_app");

function formatKmf(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.round(value));
}

function TransfersPage() {
  const { auth } = appRouteApi.useRouteContext();
  const profileCompanyId = auth.profile?.company_id ?? null;
  const admin = isPlatformAdmin(auth);
  const canManage =
    admin || auth.profile?.role === "employer" || auth.profile?.role === "hr";

  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>(profileCompanyId ?? "all");
  const [batches, setBatches] = useState<
    Array<TransferBatch & { company_name?: string | null; payroll_label?: string | null }>
  >([]);
  const [eligible, setEligible] = useState<
    Array<{
      id: string;
      label: string;
      total_net: number;
      currency_code: string;
      status: string;
      existing_batch_id: string | null;
    }>
  >([]);
  const [stats, setStats] = useState({
    batchCount: 0, totalAmount: 0, readyCount: 0, exportedCount: 0,
  });
  const [selectedRunId, setSelectedRunId] = useState("");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lockedCompanyId = admin ? null : profileCompanyId;
  const effectiveCompanyId =
    lockedCompanyId ?? (companyFilter === "all" ? undefined : companyFilter);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, s, runs] = await Promise.all([
        listTransferBatches({ data: { companyId: effectiveCompanyId } }),
        transferStats({ data: { companyId: effectiveCompanyId } }),
        listEligiblePayrollRuns({ data: { companyId: effectiveCompanyId } }),
      ]);
      setBatches(rows);
      setStats(s);
      setEligible(runs);
      if (!selectedRunId && runs[0]) setSelectedRunId(runs[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible");
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

  const handleGenerate = async () => {
    if (!selectedRunId) {
      setError("Sélectionnez un cycle de paie");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await generateTransferBatch({ data: { payrollRunId: selectedRunId } });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        badge="Virements"
        title="Ordres de virement"
        description="Générés depuis les cycles de paie approuvés ou payés — format banques comoriennes (KMF)."
        actions={
          canManage ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1.5 h-4 w-4" />
                  Générer depuis la paie
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle className="font-display">Nouvel ordre de virement</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <p className="text-xs text-muted-foreground">
                    Les montants sont les nets des bulletins. Renseignez le compte bancaire
                    sur chaque fiche employé avant export.
                  </p>
                  <Select value={selectedRunId} onValueChange={setSelectedRunId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Cycle de paie" />
                    </SelectTrigger>
                    <SelectContent>
                      {eligible.length === 0 ? (
                        <SelectItem value="__none" disabled>
                          Aucun cycle approuvé / payé
                        </SelectItem>
                      ) : (
                        eligible.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.label} — {formatKmf(r.total_net)} {r.currency_code}
                            {r.existing_batch_id ? " (existe)" : ""}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    className="w-full"
                    disabled={busy || !selectedRunId || eligible.length === 0}
                    onClick={() => void handleGenerate()}
                  >
                    {busy ? "Génération…" : "Générer l’ordre"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Ordres" value={String(stats.batchCount)} icon={Landmark} accent="primary" />
        <StatCard
          label="Total cumulé"
          value={`${formatKmf(stats.totalAmount)} KMF`}
          icon={Wallet}
          accent="gold"
        />
        <StatCard
          label="Exportés"
          value={String(stats.exportedCount)}
          icon={FileText}
          accent="success"
        />
      </div>

      {admin && (
        <div className="mt-6">
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
        <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="mt-6">
        <SectionCard title="Ordres de virement">
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : batches.length === 0 ? (
            <EmptyPlaceholder
              title="Aucun ordre"
              description="Approuvez un cycle de paie, puis générez l’ordre de virement groupé."
              icon={Landmark}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Libellé</TableHead>
                  {admin && <TableHead>Entreprise</TableHead>}
                  <TableHead>Lignes</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div className="font-medium">{b.label}</div>
                      {b.missing_account_count > 0 && (
                        <div className="text-xs text-destructive">
                          {b.missing_account_count} compte(s) manquant(s)
                        </div>
                      )}
                    </TableCell>
                    {admin && (
                      <TableCell className="text-muted-foreground">{b.company_name}</TableCell>
                    )}
                    <TableCell className="font-mono">{b.line_count}</TableCell>
                    <TableCell className="font-mono font-semibold">
                      <Money value={b.total_amount} currency={b.currency_code} />
                    </TableCell>
                    <TableCell>
                      <StatusPill status={transferStatusPill[b.status]} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/transfers/$batchId" params={{ batchId: b.id }}>
                          <Download className="mr-1.5 h-3.5 w-3.5" />
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
