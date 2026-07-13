import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSignature, Plus, FileCheck2, FileClock, FileX2, Search, Building2 } from "lucide-react";
import { listCompanies } from "@/modules/companies/company.functions";
import {
  contractStats, createContract, listContracts,
} from "@/modules/contracts/contract.functions";
import { ContractForm } from "@/modules/contracts/components/ContractForm";
import {
  contractStatusLabel,
  contractTypeLabel,
  type ContractStatus,
  type ContractWithRelations,
} from "@/modules/contracts/types";
import type { CreateContractInput } from "@/modules/contracts/schemas";
import type { CompanyWithMeta } from "@/modules/companies/types";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/contracts")({
  component: ContractsLayout,
});

function ContractsLayout() {
  const showingDetail = useRouterState({
    select: (s) =>
      s.location.pathname.startsWith("/contracts/") && s.location.pathname !== "/contracts",
  });
  if (showingDetail) return <Outlet />;
  return <ContractsPage />;
}

const appRouteApi = getRouteApi("/_app");

function statusToPill(status: ContractStatus) {
  const map: Record<ContractStatus, string> = {
    draft: "Brouillon",
    sent: "En attente",
    signed: "Approuvé",
    active: "Actif",
    expired: "Expiré",
    cancelled: "Annulé",
  };
  return map[status];
}

function ContractsPage() {
  const { auth } = appRouteApi.useRouteContext();
  const profileCompanyId = auth.profile?.company_id ?? null;
  const admin = isPlatformAdmin(auth);

  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>(profileCompanyId ?? "all");
  const [contracts, setContracts] = useState<ContractWithRelations[]>([]);
  const [stats, setStats] = useState({ active: 0, draft: 0, expired: 0, expiring30d: 0 });
  const [statusFilter, setStatusFilter] = useState<"all" | ContractStatus>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const lockedCompanyId = admin ? null : profileCompanyId;
  const effectiveCompanyId =
    lockedCompanyId ?? (companyFilter === "all" ? undefined : companyFilter);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [rows, s] = await Promise.all([
        listContracts({
          data: {
            companyId: effectiveCompanyId,
            status: statusFilter,
            search: search.trim() || undefined,
          },
        }),
        contractStats({ data: { companyId: effectiveCompanyId } }),
      ]);
      setContracts(rows);
      setStats(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les contrats");
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
  }, [companyFilter, statusFilter, lockedCompanyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contracts;
    return contracts.filter((c) =>
      [c.employee_name, c.job_title, c.contract_number, c.company_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [contracts, search]);

  const canCreate =
    Boolean(lockedCompanyId || admin) &&
    (admin || auth.profile?.role === "employer" || auth.profile?.role === "hr");

  const handleCreate = async (values: CreateContractInput) => {
    if (!admin && profileCompanyId) values.companyId = profileCompanyId;
    const result = await createContract({ data: values });
    if (!result.ok) throw new Error(result.message);
    setOpen(false);
    await load();
  };

  if (!canCreate && !profileCompanyId) {
    return (
      <>
        <PageHeader badge="Contrats" title="Contrats" description="Contrats électroniques CDI / CDD." />
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <Building2 className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 font-display text-lg font-semibold">Entreprise requise</p>
          <Button className="mt-4" size="sm" asChild>
            <Link to="/companies">Configurer une entreprise</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        badge="Contrats"
        title="Contrats"
        description="Création, signature et activation des contrats de travail."
        actions={
          canCreate ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Nouveau contrat</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="font-display">Nouveau contrat</DialogTitle>
                </DialogHeader>
                <ContractForm
                  lockedCompanyId={lockedCompanyId}
                  submitLabel="Créer le contrat"
                  onSubmit={handleCreate}
                />
              </DialogContent>
            </Dialog>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Actifs" value={String(stats.active)} icon={FileCheck2} accent="success" />
        <StatCard label="Expirent sous 30 j" value={String(stats.expiring30d)} icon={FileClock} accent="gold" />
        <StatCard label="Brouillons" value={String(stats.draft)} icon={FileSignature} accent="primary" />
        <StatCard label="Clos / annulés" value={String(stats.expired)} icon={FileX2} accent="destructive" />
      </div>

      <div className="mt-6">
        <SectionCard
          title="Tous les contrats"
          description={loading ? "Chargement…" : `${filtered.length} contrat(s)`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {admin && (
                <Select value={companyFilter} onValueChange={setCompanyFilter}>
                  <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.legal_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
              >
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous statuts</SelectItem>
                  {(Object.keys(contractStatusLabel) as ContractStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{contractStatusLabel[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  className="h-9 w-56 pl-8"
                  placeholder="Rechercher…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          }
        >
          {error && (
            <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {!loading && filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center">
              <FileSignature className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-3 font-display text-lg font-semibold">Aucun contrat</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Créez un contrat à partir d’un employé existant.
              </p>
              {canCreate && (
                <Button className="mt-4" size="sm" onClick={() => setOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" />Nouveau contrat
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employé</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Début</TableHead>
                  <TableHead>Fin</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.employee_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {c.contract_number}
                        {admin && c.company_name ? ` · ${c.company_name}` : ""}
                      </div>
                    </TableCell>
                    <TableCell>{contractTypeLabel[c.contract_type]}</TableCell>
                    <TableCell>{c.start_date}</TableCell>
                    <TableCell>{c.end_date || "—"}</TableCell>
                    <TableCell><StatusPill status={statusToPill(c.status)} /></TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/contracts/$contractId" params={{ contractId: c.id }}>
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
