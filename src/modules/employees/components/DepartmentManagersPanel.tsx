import { useEffect, useState } from "react";
import { SectionCard } from "@/components/app/primitives";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { listDepartments } from "@/modules/companies/company.functions";
import { listEmployees, setDepartmentManager } from "@/modules/employees/employee.functions";
import type { Department } from "@/modules/companies/types";
import type { EmployeeWithRelations } from "@/modules/employees/types";

type Props = {
  companyId: string;
  /** Only RH (and platform admin) can assign; others see read-only. */
  canAssign: boolean;
};

export function DepartmentManagersPanel({ companyId, canAssign }: Props) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<EmployeeWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [deps, emps] = await Promise.all([
        listDepartments({ data: { companyId } }),
        listEmployees({ data: { companyId, status: "active" } }),
      ]);
      setDepartments(deps);
      setEmployees(emps);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [companyId]);

  const handleSetManager = async (departmentId: string, managerEmployeeId: string | null) => {
    setSavingId(departmentId);
    setError(null);
    try {
      const result = await setDepartmentManager({
        data: { departmentId, managerEmployeeId },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await load();
    } finally {
      setSavingId(null);
    }
  };

  return (
    <SectionCard
      title="Managers de département"
      description={
        canAssign
          ? "La RH désigne un manager par département — il valide les congés de son équipe avant vous."
          : "Seul le compte RH peut assigner un manager à chaque département."
      }
    >
      {error && (
        <p className="mb-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : departments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun département. Créez-en lors de l’ajout d’un employé.
        </p>
      ) : (
        <ul className="space-y-3 text-sm">
          {departments.map((d) => (
            <li
              key={d.id}
              className="flex flex-col gap-2 border-b border-border/60 py-3 first:pt-0 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="font-medium">{d.name}</div>
                <div className="text-xs text-muted-foreground">
                  {d.code ?? "—"}
                  {" · Titulaire : "}
                  {d.manager_name ?? "non assigné"}
                </div>
                {d.acting_manager_name && d.coverage_start && d.coverage_end ? (
                  <div className="mt-1 text-xs text-gold-foreground">
                    Remplaçant actif : {d.acting_manager_name} ({d.coverage_start} → {d.coverage_end})
                  </div>
                ) : null}
              </div>
              {canAssign ? (
                <Select
                  value={d.manager_employee_id ?? "__none"}
                  disabled={savingId === d.id}
                  onValueChange={(v) =>
                    void handleSetManager(d.id, v === "__none" ? null : v)
                  }
                >
                  <SelectTrigger className="w-full sm:w-56">
                    <SelectValue placeholder="Choisir le manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sans manager</SelectItem>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.first_name} {e.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
