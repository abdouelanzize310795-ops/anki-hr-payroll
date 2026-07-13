import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getRouteApi } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatusPill, Money } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { ArrowLeft, KeyRound } from "lucide-react";
import {
  getEmployee, softDeleteEmployee, updateEmployee, provisionEmployeeAccount,
  type EmployeeAccountProvision,
} from "@/modules/employees/employee.functions";
import { EmployeeForm } from "@/modules/employees/components/EmployeeForm";
import type { EmployeeWithRelations } from "@/modules/employees/types";
import type { CreateEmployeeInput } from "@/modules/employees/schemas";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/employees/$employeeId")({
  component: EmployeeDetailPage,
});

const appRouteApi = getRouteApi("/_app");

function EmployeeDetailPage() {
  const { employeeId } = Route.useParams();
  const { auth } = appRouteApi.useRouteContext();
  const [employee, setEmployee] = useState<EmployeeWithRelations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busyAccount, setBusyAccount] = useState(false);
  const [accountCreds, setAccountCreds] = useState<EmployeeAccountProvision | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await getEmployee({ data: { id: employeeId } });
      if (!row) {
        setError("Employé introuvable ou accès refusé.");
        setEmployee(null);
        return;
      }
      setEmployee(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [employeeId]);

  const handleUpdate = async (values: CreateEmployeeInput) => {
    if (!employee) return;
    const result = await updateEmployee({
      data: { id: employee.id, ...values },
    });
    if (!result.ok) throw new Error(result.message);
    setSaved(true);
    await load();
    setTimeout(() => setSaved(false), 2500);
  };

  const handleArchive = async () => {
    if (!employee) return;
    if (!confirm(`Archiver ${employee.first_name} ${employee.last_name} ?`)) return;
    const result = await softDeleteEmployee({ data: { id: employee.id } });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    window.location.assign("/employees");
  };

  const handleProvisionAccount = async () => {
    if (!employee) return;
    setBusyAccount(true);
    setError(null);
    try {
      const result = await provisionEmployeeAccount({ data: { employeeId: employee.id } });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setAccountCreds(result.data);
      await load();
    } finally {
      setBusyAccount(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Chargement de la fiche…
      </div>
    );
  }

  if (error || !employee) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" asChild>
          <Link to="/employees"><ArrowLeft className="mr-1.5 h-4 w-4" />Retour</Link>
        </Button>
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? "Employé introuvable"}
        </div>
      </div>
    );
  }

  const lockedCompanyId = isPlatformAdmin(auth) ? null : employee.company_id;

  return (
    <>
      <PageHeader
        badge={employee.employee_number ?? "Fiche"}
        title={`${employee.first_name} ${employee.last_name}`}
        description={[employee.job_title, employee.department_name, employee.company_name]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill
              status={
                employee.status === "active"
                  ? "Actif"
                  : employee.status === "on_leave"
                    ? "En congé"
                    : employee.status === "onboarding"
                      ? "Pending"
                      : "Expiré"
              }
            />
            <Button variant="outline" size="sm" asChild>
              <Link to="/employees"><ArrowLeft className="mr-1.5 h-4 w-4" />Liste</Link>
            </Button>
            {!employee.user_id && (
              <Button
                size="sm"
                disabled={busyAccount || !employee.email}
                onClick={() => void handleProvisionAccount()}
              >
                <KeyRound className="mr-1.5 h-4 w-4" />
                Créer compte d’accès
              </Button>
            )}
            <Button variant="destructive" size="sm" onClick={() => void handleArchive()}>
              Archiver
            </Button>
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Salaire de base</div>
          <div className="mt-1 font-display text-xl font-bold">
            <Money value={employee.base_salary} currency={employee.currency_code} />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Embauche</div>
          <div className="mt-1 text-sm font-medium">{employee.hire_date}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Banque</div>
          <div className="mt-1 text-sm font-medium">{employee.bank_name || "—"}</div>
          <div className="font-mono text-xs text-muted-foreground">{employee.bank_account || ""}</div>
        </div>
      </div>

      {accountCreds && (
        <div className="mb-4 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm">
          <div className="font-medium">Compte collaborateur</div>
          <p className="mt-1 text-muted-foreground">
            {accountCreds.created
              ? "Nouveau compte créé — communiquez le mot de passe temporaire."
              : "Compte lié à l’e-mail existant."}
          </p>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted-foreground">E-mail</dt>
              <dd className="font-mono">{accountCreds.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Mot de passe temporaire</dt>
              <dd className="font-mono">
                {accountCreds.temporaryPassword ?? "Compte existant — inchangé"}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {employee.user_id && !accountCreds && (
        <div className="mb-4 rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
          Compte d’accès déjà lié ({employee.email || "e-mail fiche"}).
        </div>
      )}

      {saved && (
        <div className="mb-4 rounded-lg border border-reef/30 bg-reef/10 px-3 py-2 text-sm">
          Fiche mise à jour.
        </div>
      )}

      <SectionCard title="Informations" description="Identité, poste et paie">
        <EmployeeForm
          lockedCompanyId={lockedCompanyId}
          submitLabel="Enregistrer les modifications"
          defaultValues={{
            companyId: employee.company_id,
            branchId: employee.branch_id,
            departmentId: employee.department_id,
            firstName: employee.first_name,
            lastName: employee.last_name,
            email: employee.email ?? "",
            phone: employee.phone ?? "",
            jobTitle: employee.job_title ?? "",
            hireDate: employee.hire_date,
            status: employee.status,
            baseSalary: employee.base_salary,
            currencyCode: employee.currency_code,
            bankName: employee.bank_name ?? "",
            bankAccount: employee.bank_account ?? "",
            bankRib: employee.bank_rib ?? "",
            city: employee.city ?? "",
            region: employee.region ?? "",
            nationalId: employee.national_id ?? "",
            notes: employee.notes ?? "",
          }}
          onSubmit={handleUpdate}
        />
      </SectionCard>
    </>
  );
}
