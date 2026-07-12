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
import { createEmployeeSchema, type CreateEmployeeInput } from "@/modules/employees/schemas";
import { listCompanies } from "@/modules/companies/company.functions";
import { listBranches, listDepartments } from "@/modules/companies/company.functions";
import type { Branch, CompanyWithMeta, Department } from "@/modules/companies/types";
import { createDepartment } from "@/modules/employees/employee.functions";

type EmployeeFormProps = {
  defaultValues?: Partial<CreateEmployeeInput>;
  lockedCompanyId?: string | null;
  submitLabel?: string;
  onSubmit: (values: CreateEmployeeInput) => Promise<void>;
};

export function EmployeeForm({
  defaultValues,
  lockedCompanyId,
  submitLabel = "Enregistrer",
  onSubmit,
}: EmployeeFormProps) {
  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [newDeptName, setNewDeptName] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  const form = useForm<CreateEmployeeInput>({
    resolver: zodResolver(createEmployeeSchema),
    defaultValues: {
      companyId: lockedCompanyId ?? "",
      branchId: null,
      departmentId: null,
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      jobTitle: "",
      hireDate: today,
      status: "active",
      baseSalary: 0,
      currencyCode: "KMF",
      bankName: "",
      bankAccount: "",
      bankRib: "",
      city: "",
      region: "",
      nationalId: "",
      notes: "",
      ...defaultValues,
    },
  });

  const companyId = form.watch("companyId");

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
      setBranches([]);
      setDepartments([]);
      return;
    }
    void (async () => {
      const [b, d] = await Promise.all([
        listBranches({ data: { companyId } }),
        listDepartments({ data: { companyId } }),
      ]);
      setBranches(b);
      setDepartments(d);
      const company = companies.find((c) => c.id === companyId);
      if (company) form.setValue("currencyCode", company.currency_code);
    })();
  }, [companyId, companies, form]);

  const handleSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await onSubmit(values);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Une erreur est survenue");
    }
  });

  const handleAddDepartment = async () => {
    if (!companyId || newDeptName.trim().length < 2) return;
    const result = await createDepartment({
      data: { companyId, name: newDeptName.trim() },
    });
    if (!result.ok) {
      setServerError(result.message);
      return;
    }
    setDepartments((prev) => [...prev, result.data].sort((a, b) => a.name.localeCompare(b.name)));
    form.setValue("departmentId", result.data.id);
    setNewDeptName("");
  };

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
              <SelectTrigger><SelectValue placeholder="Choisir une entreprise" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.legal_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.formState.errors.companyId && (
              <p className="text-xs text-destructive">{form.formState.errors.companyId.message}</p>
            )}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="firstName">Prénom *</Label>
          <Input id="firstName" {...form.register("firstName")} />
          {form.formState.errors.firstName && (
            <p className="text-xs text-destructive">{form.formState.errors.firstName.message}</p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Nom *</Label>
          <Input id="lastName" {...form.register("lastName")} />
          {form.formState.errors.lastName && (
            <p className="text-xs text-destructive">{form.formState.errors.lastName.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" {...form.register("email")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Téléphone</Label>
          <Input id="phone" {...form.register("phone")} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="jobTitle">Poste</Label>
          <Input id="jobTitle" placeholder="Comptable, RH…" {...form.register("jobTitle")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hireDate">Date d’embauche *</Label>
          <Input id="hireDate" type="date" {...form.register("hireDate")} />
        </div>

        <div className="space-y-2">
          <Label>Statut</Label>
          <Select
            value={form.watch("status")}
            onValueChange={(v) => form.setValue("status", v as CreateEmployeeInput["status"])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Actif</SelectItem>
              <SelectItem value="onboarding">Onboarding</SelectItem>
              <SelectItem value="on_leave">En congé</SelectItem>
              <SelectItem value="suspended">Suspendu</SelectItem>
              <SelectItem value="terminated">Sorti</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Établissement</Label>
          <Select
            value={form.watch("branchId") ?? "none"}
            onValueChange={(v) => form.setValue("branchId", v === "none" ? null : v)}
          >
            <SelectTrigger><SelectValue placeholder="Établissement" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label>Département</Label>
          <Select
            value={form.watch("departmentId") ?? "none"}
            onValueChange={(v) => form.setValue("departmentId", v === "none" ? null : v)}
          >
            <SelectTrigger><SelectValue placeholder="Département" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="mt-2 flex gap-2">
            <Input
              placeholder="Nouveau département…"
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
            />
            <Button type="button" variant="outline" onClick={() => void handleAddDepartment()}>
              Ajouter
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="baseSalary">Salaire de base</Label>
          <Input id="baseSalary" type="number" min={0} step={1} className="font-mono" {...form.register("baseSalary")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="currencyCode">Devise</Label>
          <Input id="currencyCode" className="font-mono" {...form.register("currencyCode")} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="bankName">Banque</Label>
          <Input id="bankName" {...form.register("bankName")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bankAccount">N° de compte</Label>
          <Input id="bankAccount" className="font-mono" {...form.register("bankAccount")} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="bankRib">RIB</Label>
          <Input id="bankRib" className="font-mono" {...form.register("bankRib")} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="city">Ville</Label>
          <Input id="city" {...form.register("city")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="nationalId">N° pièce d’identité</Label>
          <Input id="nationalId" {...form.register("nationalId")} />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea id="notes" rows={3} {...form.register("notes")} />
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
