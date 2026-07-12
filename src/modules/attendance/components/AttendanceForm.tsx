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
import { upsertAttendanceSchema, type UpsertAttendanceInput } from "@/modules/attendance/schemas";
import { attendanceStatusLabel } from "@/modules/attendance/types";
import { listCompanies } from "@/modules/companies/company.functions";
import { listEmployees } from "@/modules/employees/employee.functions";
import type { CompanyWithMeta } from "@/modules/companies/types";
import type { EmployeeWithRelations } from "@/modules/employees/types";

type AttendanceFormProps = {
  lockedCompanyId?: string | null;
  defaultWorkDate?: string;
  onSubmit: (values: UpsertAttendanceInput) => Promise<void>;
};

export function AttendanceForm({
  lockedCompanyId,
  defaultWorkDate,
  onSubmit,
}: AttendanceFormProps) {
  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [employees, setEmployees] = useState<EmployeeWithRelations[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const today = defaultWorkDate ?? new Date().toISOString().slice(0, 10);

  const form = useForm<UpsertAttendanceInput>({
    resolver: zodResolver(upsertAttendanceSchema),
    defaultValues: {
      companyId: lockedCompanyId ?? "",
      employeeId: "",
      workDate: today,
      status: "present",
      checkIn: "08:00",
      checkOut: "17:00",
      notes: "",
    },
  });

  const companyId = form.watch("companyId");

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
      return;
    }
    void (async () => {
      const emps = await listEmployees({ data: { companyId, status: "active" } });
      setEmployees(emps);
      if (!form.getValues("employeeId") && emps[0]) {
        form.setValue("employeeId", emps[0].id);
      }
    })();
  }, [companyId, form]);

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (values) => {
        setServerError(null);
        try {
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

      <div className="space-y-2">
        <Label>Employé</Label>
        <Select
          value={form.watch("employeeId")}
          onValueChange={(v) => form.setValue("employeeId", v)}
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
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="workDate">Date</Label>
          <Input id="workDate" type="date" {...form.register("workDate")} />
        </div>
        <div className="space-y-2">
          <Label>Statut</Label>
          <Select
            value={form.watch("status")}
            onValueChange={(v) => form.setValue("status", v as UpsertAttendanceInput["status"])}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(Object.keys(attendanceStatusLabel) as Array<keyof typeof attendanceStatusLabel>).map((k) => (
                <SelectItem key={k} value={k}>{attendanceStatusLabel[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="checkIn">Entrée</Label>
          <Input id="checkIn" type="time" {...form.register("checkIn")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="checkOut">Sortie</Label>
          <Input id="checkOut" type="time" {...form.register("checkOut")} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Note</Label>
        <Textarea id="notes" rows={2} {...form.register("notes")} />
      </div>

      {serverError && <p className="text-sm text-destructive">{serverError}</p>}

      <Button type="submit" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  );
}
