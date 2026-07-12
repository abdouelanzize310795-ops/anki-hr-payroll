import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createContractSchema, type CreateContractInput } from "@/modules/contracts/schemas";
import { listCompanies, listBranches, listDepartments } from "@/modules/companies/company.functions";
import { listEmployees } from "@/modules/employees/employee.functions";
import type { Branch, CompanyWithMeta, Department } from "@/modules/companies/types";
import type { EmployeeWithRelations } from "@/modules/employees/types";

type ContractFormProps = {
  defaultValues?: Partial<CreateContractInput>;
  lockedCompanyId?: string | null;
  submitLabel?: string;
  onSubmit: (values: CreateContractInput) => Promise<void>;
};

export function ContractForm({
  defaultValues,
  lockedCompanyId,
  submitLabel = "Enregistrer",
  onSubmit,
}: ContractFormProps) {
  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [employees, setEmployees] = useState<EmployeeWithRelations[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  const form = useForm<CreateContractInput>({
    resolver: zodResolver(createContractSchema),
    defaultValues: {
      companyId: lockedCompanyId ?? "",
      employeeId: "",
      contractType: "cdi",
      jobTitle: "",
      departmentId: null,
      branchId: null,
      startDate: today,
      endDate: "",
      trialEndDate: "",
      baseSalary: 0,
      currencyCode: "KMF",
      workDaysPerWeek: 5,
      hoursPerWeek: 40,
      benefits: "Transport, allocation selon politique interne.",
      clauses:
        "Le présent contrat est régi par le Code du travail de l'Union des Comores. Toute modification fait l'objet d'un avenant écrit.",
      signedByEmployerName: "",
      ...defaultValues,
    },
  });

  const companyId = form.watch("companyId");
  const employeeId = form.watch("employeeId");
  const contractType = form.watch("contractType");

  useEffect(() => {
    void (async () => {
      const rows = await listCompanies();
      setCompanies(rows);
      if (!lockedCompanyId && !form.getValues("companyId") && rows[0]) {
        form.setValue("companyId", rows[0].id);
        form.setValue("currencyCode", rows[0].currency_code);
      }
    })();
  }, [lockedCompanyId, form]);

  useEffect(() => {
    if (!companyId) {
      setEmployees([]);
      setBranches([]);
      setDepartments([]);
      return;
    }
    void (async () => {
      const [emps, b, d] = await Promise.all([
        listEmployees({ data: { companyId, status: "all" } }),
        listBranches({ data: { companyId } }),
        listDepartments({ data: { companyId } }),
      ]);
      setEmployees(emps.filter((e) => e.status !== "terminated"));
      setBranches(b);
      setDepartments(d);
      const company = companies.find((c) => c.id === companyId);
      if (company) form.setValue("currencyCode", company.currency_code);
    })();
  }, [companyId, companies, form]);

  useEffect(() => {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) return;
    if (!form.getValues("jobTitle")) form.setValue("jobTitle", emp.job_title ?? "");
    if (!form.getValues("baseSalary")) form.setValue("baseSalary", emp.base_salary ?? 0);
    if (emp.department_id) form.setValue("departmentId", emp.department_id);
    if (emp.branch_id) form.setValue("branchId", emp.branch_id);
    form.setValue("currencyCode", emp.currency_code);
  }, [employeeId, employees, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Une erreur est survenue");
    }
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        {!lockedCompanyId && (
          <div className="space-y-2 sm:col-span-2">
            <Label>Entreprise *</Label>
            <Select
              value={companyId}
              onValueChange={(v) => form.setValue("companyId", v, { shouldValidate: true })}
            >
              <SelectTrigger><SelectValue placeholder="Entreprise" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.legal_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2 sm:col-span-2">
          <Label>Employé *</Label>
          <Select
            value={employeeId}
            onValueChange={(v) => form.setValue("employeeId", v, { shouldValidate: true })}
          >
            <SelectTrigger><SelectValue placeholder="Sélectionner un employé" /></SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.first_name} {e.last_name}
                  {e.employee_number ? ` (${e.employee_number})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.employeeId && (
            <p className="text-xs text-destructive">{form.formState.errors.employeeId.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Type de contrat *</Label>
          <Select
            value={contractType}
            onValueChange={(v) => form.setValue("contractType", v as CreateContractInput["contractType"])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="cdi">CDI</SelectItem>
              <SelectItem value="cdd">CDD</SelectItem>
              <SelectItem value="essai">Période d’essai</SelectItem>
              <SelectItem value="stage">Stage</SelectItem>
              <SelectItem value="consultant">Consultant</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="jobTitle">Poste *</Label>
          <Input id="jobTitle" {...form.register("jobTitle")} />
          {form.formState.errors.jobTitle && (
            <p className="text-xs text-destructive">{form.formState.errors.jobTitle.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="startDate">Date de début *</Label>
          <Input id="startDate" type="date" {...form.register("startDate")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">Date de fin {contractType === "cdd" || contractType === "stage" ? "*" : ""}</Label>
          <Input id="endDate" type="date" {...form.register("endDate")} />
          {form.formState.errors.endDate && (
            <p className="text-xs text-destructive">{form.formState.errors.endDate.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="trialEndDate">Fin période d’essai</Label>
          <Input id="trialEndDate" type="date" {...form.register("trialEndDate")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="baseSalary">Salaire de base *</Label>
          <Input id="baseSalary" type="number" min={0} className="font-mono" {...form.register("baseSalary")} />
        </div>

        <div className="space-y-2">
          <Label>Département</Label>
          <Select
            value={form.watch("departmentId") ?? "none"}
            onValueChange={(v) => form.setValue("departmentId", v === "none" ? null : v)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Établissement</Label>
          <Select
            value={form.watch("branchId") ?? "none"}
            onValueChange={(v) => form.setValue("branchId", v === "none" ? null : v)}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="workDaysPerWeek">Jours / semaine</Label>
          <Input id="workDaysPerWeek" type="number" min={1} max={7} {...form.register("workDaysPerWeek")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hoursPerWeek">Heures / semaine</Label>
          <Input id="hoursPerWeek" type="number" min={1} {...form.register("hoursPerWeek")} />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="benefits">Avantages</Label>
          <Textarea id="benefits" rows={2} {...form.register("benefits")} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="clauses">Clauses</Label>
          <Textarea id="clauses" rows={4} {...form.register("clauses")} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="signedByEmployerName">Signataire employeur</Label>
          <Input id="signedByEmployerName" placeholder="Nom du représentant" {...form.register("signedByEmployerName")} />
        </div>
      </div>

      {serverError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <Button
        type="submit"
        className="w-full bg-gold text-gold-foreground hover:bg-gold/90 sm:w-auto"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? "Enregistrement…" : submitLabel}
      </Button>
    </form>
  );
}
