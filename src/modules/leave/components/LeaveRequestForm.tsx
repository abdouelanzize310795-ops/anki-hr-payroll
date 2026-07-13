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
import { createLeaveRequestSchema, type CreateLeaveRequestInput } from "@/modules/leave/schemas";
import { listCompanies } from "@/modules/companies/company.functions";
import { listEmployees } from "@/modules/employees/employee.functions";
import { getLeaveActingOptions, listLeaveTypes } from "@/modules/leave/leave.functions";
import { countBusinessDays, type LeaveType } from "@/modules/leave/types";
import type { CompanyWithMeta } from "@/modules/companies/types";
import type { EmployeeWithRelations } from "@/modules/employees/types";

type LeaveRequestFormProps = {
  lockedCompanyId?: string | null;
  submitLabel?: string;
  onSubmit: (values: CreateLeaveRequestInput) => Promise<void>;
};

export function LeaveRequestForm({
  lockedCompanyId,
  submitLabel = "Soumettre la demande",
  onSubmit,
}: LeaveRequestFormProps) {
  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [employees, setEmployees] = useState<EmployeeWithRelations[]>([]);
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [isDeptManager, setIsDeptManager] = useState(false);
  const [replacements, setReplacements] = useState<
    Array<{ id: string; first_name: string; last_name: string }>
  >([]);

  const today = new Date().toISOString().slice(0, 10);

  const form = useForm<CreateLeaveRequestInput>({
    resolver: zodResolver(createLeaveRequestSchema),
    defaultValues: {
      companyId: lockedCompanyId ?? "",
      employeeId: "",
      leaveTypeId: "",
      startDate: today,
      endDate: today,
      reason: "",
      attachmentUrl: "",
      isMedical: false,
      actingManagerEmployeeId: null,
      submitNow: true,
    },
  });

  const companyId = form.watch("companyId");
  const employeeId = form.watch("employeeId");
  const leaveTypeId = form.watch("leaveTypeId");
  const startDate = form.watch("startDate");
  const endDate = form.watch("endDate");
  const businessDays = countBusinessDays(startDate, endDate);
  const selectedType = types.find((t) => t.id === leaveTypeId);
  const showMedicalAttachment =
    form.watch("isMedical") ||
    String(selectedType?.code ?? "").toUpperCase() === "SICK";

  useEffect(() => {
    void (async () => {
      const rows = await listCompanies();
      setCompanies(rows);
      if (!lockedCompanyId && !form.getValues("companyId") && rows[0]) {
        form.setValue("companyId", rows[0].id);
      }
    })();
  }, [lockedCompanyId, form]);

  useEffect(() => {
    if (!companyId) {
      setEmployees([]);
      setTypes([]);
      return;
    }
    void (async () => {
      const [emps, leaveTypes] = await Promise.all([
        listEmployees({ data: { companyId, status: "active" } }),
        listLeaveTypes({ data: { companyId } }),
      ]);
      setEmployees(emps);
      setTypes(leaveTypes);
      if (!form.getValues("leaveTypeId") && leaveTypes[0]) {
        form.setValue("leaveTypeId", leaveTypes[0].id);
      }
      if (!form.getValues("employeeId") && emps[0]) {
        form.setValue("employeeId", emps[0].id);
      }
    })();
  }, [companyId, form]);

  useEffect(() => {
    if (!companyId || !employeeId) {
      setIsDeptManager(false);
      setReplacements([]);
      form.setValue("actingManagerEmployeeId", null);
      return;
    }
    void (async () => {
      try {
        const meta = await getLeaveActingOptions({
          data: { companyId, employeeId },
        });
        setIsDeptManager(meta.isDepartmentManager);
        setReplacements(meta.replacements);
        if (!meta.isDepartmentManager) {
          form.setValue("actingManagerEmployeeId", null);
        }
      } catch {
        setIsDeptManager(false);
        setReplacements([]);
      }
    })();
  }, [companyId, employeeId, form]);

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (values) => {
        setServerError(null);
        try {
          if (isDeptManager && !values.actingManagerEmployeeId) {
            setServerError("Désignez un manager remplaçant pour la durée du congé");
            return;
          }
          await onSubmit(values);
        } catch (err) {
          setServerError(err instanceof Error ? err.message : "Erreur inattendue");
        }
      })}
    >
      {!lockedCompanyId && (
        <div className="space-y-2">
          <Label>Entreprise</Label>
          <Select
            value={form.watch("companyId")}
            onValueChange={(v) => {
              form.setValue("companyId", v);
              form.setValue("employeeId", "");
              form.setValue("leaveTypeId", "");
              form.setValue("actingManagerEmployeeId", null);
            }}
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

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Employé</Label>
          <Select
            value={form.watch("employeeId")}
            onValueChange={(v) => {
              form.setValue("employeeId", v);
              form.setValue("actingManagerEmployeeId", null);
            }}
          >
            <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
            <SelectContent>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.first_name} {e.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.employeeId && (
            <p className="text-xs text-destructive">{form.formState.errors.employeeId.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Type de congé</Label>
          <Select
            value={form.watch("leaveTypeId")}
            onValueChange={(v) => form.setValue("leaveTypeId", v)}
          >
            <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
            <SelectContent>
              {types.map((t) => (
                <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {form.formState.errors.leaveTypeId && (
            <p className="text-xs text-destructive">{form.formState.errors.leaveTypeId.message}</p>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="startDate">Du</Label>
          <Input id="startDate" type="date" {...form.register("startDate")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endDate">Au</Label>
          <Input id="endDate" type="date" {...form.register("endDate")} />
          {form.formState.errors.endDate && (
            <p className="text-xs text-destructive">{form.formState.errors.endDate.message}</p>
          )}
        </div>
      </div>

      <p className="font-mono text-xs text-muted-foreground">
        {businessDays} jour{businessDays > 1 ? "s" : ""} ouvré{businessDays > 1 ? "s" : ""} (lun–ven)
      </p>

      {isDeptManager && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <Label>Manager remplaçant *</Label>
          <p className="text-xs text-muted-foreground">
            Obligatoire : il valide les congés de l’équipe du {startDate} au {endDate}.
            Le titulaire reprend automatiquement après.
          </p>
          <Select
            value={form.watch("actingManagerEmployeeId") ?? "__none"}
            onValueChange={(v) =>
              form.setValue("actingManagerEmployeeId", v === "__none" ? null : v)
            }
          >
            <SelectTrigger><SelectValue placeholder="Choisir un collaborateur" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Choisir…</SelectItem>
              {replacements.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.first_name} {e.last_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="reason">Motif</Label>
        <Textarea id="reason" rows={3} {...form.register("reason")} placeholder="Optionnel" />
      </div>

      {showMedicalAttachment && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <Label htmlFor="attachmentUrl">Certificat médical (URL)</Label>
          <p className="text-xs text-muted-foreground">
            Lien vers le certificat (Drive, e-mail, etc.). Le statut médical passera en attente de justification.
          </p>
          <Input
            id="attachmentUrl"
            type="url"
            placeholder="https://…"
            {...form.register("attachmentUrl")}
          />
          {form.formState.errors.attachmentUrl && (
            <p className="text-xs text-destructive">{form.formState.errors.attachmentUrl.message}</p>
          )}
        </div>
      )}

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <Button type="submit" disabled={form.formState.isSubmitting} className="w-full sm:w-auto">
        {form.formState.isSubmitting ? "Envoi…" : submitLabel}
      </Button>
    </form>
  );
}
