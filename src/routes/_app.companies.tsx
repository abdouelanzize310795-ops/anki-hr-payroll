import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatusPill, StatCard } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Building2, Plus, Search, MapPin, Layers3 } from "lucide-react";
import { getRouteApi } from "@tanstack/react-router";
import { listCompanies, createCompany } from "@/modules/companies/company.functions";
import { CompanyForm, type CompanyFormSubmit } from "@/modules/companies/components/CompanyForm";
import { uploadCompanyLogoFile } from "@/modules/companies/upload-logo";
import type { CompanyWithMeta } from "@/modules/companies/types";
import { companyApprovalLabel } from "@/modules/companies/types";
import { CompanyApprovalActions } from "@/modules/admin/components/CompanyApprovalActions";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/companies")({
  component: CompaniesLayout,
});

function CompaniesLayout() {
  const showingDetail = useRouterState({
    select: (s) =>
      s.location.pathname.startsWith("/companies/") && s.location.pathname !== "/companies",
  });
  if (showingDetail) return <Outlet />;
  return <CompaniesPage />;
}

const appRouteApi = getRouteApi("/_app");

function companyInitials(name: string) {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function CompaniesPage() {
  const { auth } = appRouteApi.useRouteContext();
  const platformAdmin = isPlatformAdmin(auth);
  const canCreateMore =
    platformAdmin || !auth.profile?.company_id;

  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await listCompanies();
      setCompanies(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les entreprises");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      [c.legal_name, c.trade_name, c.city, c.country?.name_fr, c.sector]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [companies, query]);

  const handleCreate = async ({ values, logoFile }: CompanyFormSubmit) => {
    const result = await createCompany({ data: values });
    if (!result.ok) throw new Error(result.message);
    if (logoFile) await uploadCompanyLogoFile(result.data.id, logoFile);
    setOpen(false);
    await load();
  };

  const branchesTotal = companies.reduce((s, c) => s + (c.branches_count ?? 0), 0);
  const countriesCount = new Set(companies.map((c) => c.country_code)).size;

  return (
    <>
      <PageHeader
        badge="Entreprises"
        title="Entreprises"
        description="Espaces multi-tenant : raisons sociales, établissements et paramétrage local."
        actions={
          canCreateMore ? (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Ajouter une entreprise</Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle className="font-display">Nouvelle entreprise</DialogTitle>
                </DialogHeader>
                <CompanyForm submitLabel="Créer l’entreprise" onSubmit={handleCreate} />
              </DialogContent>
            </Dialog>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Entreprises" value={String(companies.length)} icon={Building2} accent="primary" />
        <StatCard label="Établissements" value={String(branchesTotal)} icon={Layers3} accent="gold" />
        <StatCard label="Pays" value={String(countriesCount)} icon={MapPin} accent="success" />
      </div>

      <div className="mt-6">
        <SectionCard
          title="Toutes les entreprises"
          description={loading ? "Chargement…" : `${filtered.length} résultat(s)`}
          action={
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher…"
                className="h-9 w-56 pl-8"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
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
              <Building2 className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-3 font-display text-lg font-semibold">Aucune entreprise</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Créez votre première entreprise pour activer la paie et les contrats.
              </p>
              {canCreateMore && (
                <Button className="mt-4" size="sm" onClick={() => setOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" />Créer une entreprise
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entreprise</TableHead>
                  <TableHead>Pays</TableHead>
                  <TableHead>Devise</TableHead>
                  <TableHead>Établissements</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                            {companyInitials(c.legal_name)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{c.legal_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {[c.city, c.region].filter(Boolean).join(" · ") || "—"}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {c.country?.name_fr ?? c.country_code}
                    </TableCell>
                    <TableCell>
                      <span className="amount text-sm">{c.currency_code}</span>
                    </TableCell>
                    <TableCell>{c.branches_count ?? 0}</TableCell>
                    <TableCell>
                      <StatusPill
                        status={
                          companyApprovalLabel[c.approval_status] ??
                          (c.is_active ? "Actif" : "En attente")
                        }
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {platformAdmin && (
                          <CompanyApprovalActions
                            companyId={c.id}
                            approvalStatus={c.approval_status}
                            onDone={() => void load()}
                            onError={setError}
                          />
                        )}
                        <Button variant="outline" size="sm" asChild>
                          <Link to="/companies/$companyId" params={{ companyId: c.id }}>
                            Ouvrir
                          </Link>
                        </Button>
                      </div>
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
