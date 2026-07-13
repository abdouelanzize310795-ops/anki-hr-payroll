import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatCard, StatusPill, Money } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Users, Plus, Search, UserCheck, UserX, UserCog, Building2, Upload } from "lucide-react";
import { listCompanies } from "@/modules/companies/company.functions";
import {
  createEmployee, employeeStats, importEmployeesCsv, listEmployees,
} from "@/modules/employees/employee.functions";
import { EmployeeForm } from "@/modules/employees/components/EmployeeForm";
import { DepartmentManagersPanel } from "@/modules/employees/components/DepartmentManagersPanel";
import {
  employeeStatusLabel,
  type EmployeeStatus,
  type EmployeeWithRelations,
} from "@/modules/employees/types";
import type { CreateEmployeeInput } from "@/modules/employees/schemas";
import type { CompanyWithMeta } from "@/modules/companies/types";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/employees")({
  component: EmployeesLayout,
});

function EmployeesLayout() {
  const showingDetail = useRouterState({
    select: (s) =>
      s.location.pathname.startsWith("/employees/") && s.location.pathname !== "/employees",
  });
  if (showingDetail) return <Outlet />;
  return <EmployeesPage />;
}

const appRouteApi = getRouteApi("/_app");

function statusPill(status: EmployeeStatus) {
  const map: Record<EmployeeStatus, string> = {
    active: "Actif",
    onboarding: "Pending",
    on_leave: "En congé",
    suspended: "En attente",
    terminated: "Expiré",
  };
  return map[status];
}

function EmployeesPage() {
  const { auth } = appRouteApi.useRouteContext();
  const profileCompanyId = auth.profile?.company_id ?? null;
  const admin = isPlatformAdmin(auth);

  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [companyFilter, setCompanyFilter] = useState<string>(profileCompanyId ?? "all");
  const [employees, setEmployees] = useState<EmployeeWithRelations[]>([]);
  const [stats, setStats] = useState({ total: 0, active: 0, onLeave: 0, onboarding: 0 });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | EmployeeStatus>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const effectiveCompanyId =
    companyFilter === "all" ? undefined : companyFilter;

  const lockedCompanyId = admin ? null : profileCompanyId;
  const importCompanyId = lockedCompanyId ?? (companyFilter !== "all" ? companyFilter : null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const companyId = lockedCompanyId ?? effectiveCompanyId;
      const [rows, s] = await Promise.all([
        listEmployees({
          data: {
            companyId,
            status: statusFilter,
            search: search.trim() || undefined,
          },
        }),
        employeeStats({ data: { companyId } }),
      ]);
      setEmployees(rows);
      setStats(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible de charger les employés");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      if (admin) {
        const rows = await listCompanies();
        setCompanies(rows);
      }
    })();
  }, [admin]);

  useEffect(() => {
    void load();
  }, [companyFilter, statusFilter, lockedCompanyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      [e.first_name, e.last_name, e.email, e.job_title, e.employee_number, e.department_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [employees, search]);

  const canCreate = Boolean(lockedCompanyId || admin);
  const isHr = auth.profile?.role === "hr";
  const canAssignDeptManagers = isHr || admin;
  const deptCompanyId = lockedCompanyId ?? (companyFilter !== "all" ? companyFilter : null);

  const handleCreate = async (values: CreateEmployeeInput) => {
    if (!admin && profileCompanyId) {
      values.companyId = profileCompanyId;
    }
    const result = await createEmployee({ data: values });
    if (!result.ok) throw new Error(result.message);
    setOpen(false);
    await load();
  };

  const parseCsvLine = (line: string): string[] => {
    const cells: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        cells.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
  };

  const handleImportCsv = async (file: File) => {
    if (!importCompanyId) {
      setError("Sélectionnez une entreprise avant l’import CSV");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const text = await file.text();
      const lines = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      if (lines.length < 2) {
        setError("CSV vide ou sans données");
        return;
      }
      const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
      const idx = (name: string) => headers.indexOf(name);
      const rows = lines.slice(1).map((line) => {
        const cols = parseCsvLine(line);
        const get = (name: string) => {
          const i = idx(name);
          return i >= 0 ? cols[i] ?? "" : "";
        };
        return {
          firstName: get("first_name"),
          lastName: get("last_name"),
          email: get("email") || undefined,
          jobTitle: get("job_title") || undefined,
          baseSalary: get("base_salary") ? Number(get("base_salary")) : undefined,
          hireDate: get("hire_date") || undefined,
          departmentName: get("department_name") || undefined,
        };
      }).filter((r) => r.firstName && r.lastName);

      if (!rows.length) {
        setError("Aucune ligne valide (first_name, last_name requis)");
        return;
      }

      const result = await importEmployeesCsv({
        data: { companyId: importCompanyId, rows },
      });
      if (result.errors.length) {
        setError(
          `Importé ${result.imported}. Erreurs : ${result.errors.slice(0, 5).join(" · ")}${
            result.errors.length > 5 ? ` (+${result.errors.length - 5})` : ""
          }`,
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import CSV impossible");
    } finally {
      setImporting(false);
    }
  };

  if (!canCreate && !loading && companies.length === 0 && !profileCompanyId) {
    return (
      <>
        <PageHeader badge="Employés" title="Employés" description="Gérez l’effectif de votre entreprise." />
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-10 text-center">
          <Building2 className="mx-auto h-8 w-8 text-primary" />
          <p className="mt-3 font-display text-lg font-semibold">Aucune entreprise associée</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Créez ou rattachez une entreprise avant d’ajouter des employés.
          </p>
          <Button className="mt-4" size="sm" asChild>
            <Link to="/companies">Aller aux entreprises</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        badge="Employés"
        title="Employés"
        description="Fiches administratives, postes et salaires de base (KMF)."
        actions={
          canCreate ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!importCompanyId || importing}
                onClick={() => document.getElementById("employee-csv-input")?.click()}
              >
                <Upload className="mr-1.5 h-4 w-4" />
                {importing ? "Import…" : "Import CSV"}
              </Button>
              <input
                id="employee-csv-input"
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void handleImportCsv(file);
                }}
              />
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="mr-1.5 h-4 w-4" />Ajouter un employé</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                  <DialogHeader>
                    <DialogTitle className="font-display">Nouvel employé</DialogTitle>
                  </DialogHeader>
                  <EmployeeForm
                    lockedCompanyId={lockedCompanyId}
                    submitLabel="Créer l’employé"
                    onSubmit={handleCreate}
                  />
                </DialogContent>
              </Dialog>
            </div>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total" value={String(stats.total)} icon={Users} accent="primary" />
        <StatCard label="Actifs" value={String(stats.active)} icon={UserCheck} accent="success" />
        <StatCard label="En congé" value={String(stats.onLeave)} icon={UserX} accent="gold" />
        <StatCard label="Onboarding" value={String(stats.onboarding)} icon={UserCog} accent="primary" />
      </div>

      {deptCompanyId && (canAssignDeptManagers || auth.profile?.role === "employer") && (
        <div className="mt-6">
          <DepartmentManagersPanel
            companyId={deptCompanyId}
            canAssign={canAssignDeptManagers}
          />
        </div>
      )}

      <div className="mt-6">
        <SectionCard
          title="Annuaire"
          description={loading ? "Chargement…" : `${filtered.length} employé(s)`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              {admin && (
                <Select value={companyFilter} onValueChange={setCompanyFilter}>
                  <SelectTrigger className="h-9 w-48">
                    <SelectValue placeholder="Entreprise" />
                  </SelectTrigger>
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
                <SelectTrigger className="h-9 w-40">
                  <SelectValue placeholder="Statut" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous statuts</SelectItem>
                  <SelectItem value="active">Actif</SelectItem>
                  <SelectItem value="onboarding">Onboarding</SelectItem>
                  <SelectItem value="on_leave">En congé</SelectItem>
                  <SelectItem value="suspended">Suspendu</SelectItem>
                  <SelectItem value="terminated">Sorti</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher…"
                  className="h-9 w-56 pl-8"
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
              <Users className="mx-auto h-8 w-8 text-primary" />
              <p className="mt-3 font-display text-lg font-semibold">Aucun employé</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ajoutez votre premier collaborateur pour démarrer la paie.
              </p>
              {canCreate && (
                <Button className="mt-4" size="sm" onClick={() => setOpen(true)}>
                  <Plus className="mr-1.5 h-4 w-4" />Ajouter un employé
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employé</TableHead>
                  <TableHead>Poste</TableHead>
                  <TableHead>Département</TableHead>
                  <TableHead>Salaire</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary">
                            {`${e.first_name[0] ?? ""}${e.last_name[0] ?? ""}`.toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{e.first_name} {e.last_name}</div>
                          <div className="text-xs text-muted-foreground">
                            {e.employee_number ?? "—"}
                            {admin && e.company_name ? ` · ${e.company_name}` : ""}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{e.job_title ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{e.department_name ?? "—"}</TableCell>
                    <TableCell>
                      <Money value={e.base_salary} currency={e.currency_code} className="text-sm" />
                    </TableCell>
                    <TableCell>
                      <StatusPill status={statusPill(e.status)} />
                      <span className="sr-only">{employeeStatusLabel[e.status]}</span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/employees/$employeeId" params={{ employeeId: e.id }}>
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
