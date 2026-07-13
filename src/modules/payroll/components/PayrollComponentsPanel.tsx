import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  calcMethodLabel,
  componentKindLabel,
  type PayrollCalcMethod,
  type PayrollComponent,
} from "@/modules/payroll/types";
import {
  createPayrollComponent,
  updatePayrollComponent,
} from "@/modules/payroll/payroll.functions";

type Props = {
  companyId: string;
  components: PayrollComponent[];
  onChanged: () => Promise<void>;
};

export function PayrollComponentsPanel({ companyId, components, onChanged }: Props) {
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftRates, setDraftRates] = useState<Record<string, string>>({});
  const [newCode, setNewCode] = useState("");
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"earning" | "deduction" | "employer_contribution">("earning");
  const [newMethod, setNewMethod] = useState<
    "fixed" | "percent_of_base" | "percent_of_gross" | "worked_hours" | "overtime_hours"
  >("fixed");
  const [newRate, setNewRate] = useState("0");

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const c of components) next[c.id] = String(c.rate_value);
    setDraftRates(next);
  }, [components]);

  const saveRate = async (c: PayrollComponent) => {
    setSavingId(c.id);
    setError(null);
    try {
      const rate = Number(draftRates[c.id] ?? c.rate_value);
      const result = await updatePayrollComponent({
        data: { id: c.id, rateValue: rate },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await onChanged();
    } finally {
      setSavingId(null);
    }
  };

  const toggleActive = async (c: PayrollComponent) => {
    setSavingId(c.id);
    setError(null);
    try {
      const result = await updatePayrollComponent({
        data: { id: c.id, isActive: !c.is_active },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await onChanged();
    } finally {
      setSavingId(null);
    }
  };

  const toggleFlag = async (
    c: PayrollComponent,
    field: "subjectToIgr" | "subjectToRetirement",
    value: boolean,
  ) => {
    setSavingId(c.id);
    setError(null);
    try {
      const result = await updatePayrollComponent({
        data: { id: c.id, [field]: value },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      await onChanged();
    } finally {
      setSavingId(null);
    }
  };

  const addComponent = async () => {
    setError(null);
    const result = await createPayrollComponent({
      data: {
        companyId,
        code: newCode.toUpperCase(),
        name: newName,
        kind: newKind,
        calcMethod: newMethod,
        rateValue: Number(newRate) || 0,
      },
    });
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNewCode("");
    setNewName("");
    setNewRate("0");
    await onChanged();
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Tous les taux sont paramétrables par entreprise. Aucun taux légal n’est figé dans AnkibaPay —
        configurez cotisations et impôts selon votre conseil.
      </p>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="space-y-3">
        {components.map((c) => (
          <div
            key={c.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-3 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                {c.name}
                {c.is_system && (
                  <span className="ml-2 font-mono text-[10px] uppercase text-muted-foreground">système</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {c.code} · {componentKindLabel[c.kind]} · {calcMethodLabel[c.calc_method as PayrollCalcMethod]}
              </div>
              {c.kind === "earning" && (
                <div className="mt-2 flex flex-wrap gap-4 text-xs">
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={c.subject_to_igr}
                      disabled={savingId === c.id}
                      onChange={(e) => void toggleFlag(c, "subjectToIgr", e.target.checked)}
                    />
                    Soumis IGR
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={c.subject_to_retirement}
                      disabled={savingId === c.id}
                      onChange={(e) => void toggleFlag(c, "subjectToRetirement", e.target.checked)}
                    />
                    Soumis retraite
                  </label>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                className="w-28 font-mono"
                type="number"
                min={0}
                step="0.01"
                disabled={c.calc_method === "base_salary"}
                value={draftRates[c.id] ?? ""}
                onChange={(e) => setDraftRates((d) => ({ ...d, [c.id]: e.target.value }))}
              />
              <span className="w-10 text-xs text-muted-foreground">
                {c.calc_method.startsWith("percent")
                  ? "%"
                  : c.calc_method === "overtime_hours"
                    ? "×"
                    : c.calc_method === "worked_hours"
                      ? "KMF/h"
                      : "KMF"}
              </span>
              {c.calc_method !== "base_salary" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={savingId === c.id}
                  onClick={() => void saveRate(c)}
                >
                  Sauver
                </Button>
              )}
              <Switch
                checked={c.is_active}
                disabled={c.is_system || savingId === c.id}
                onCheckedChange={() => void toggleActive(c)}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-border p-4">
        <p className="mb-3 text-sm font-medium">Ajouter un composant</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Code</Label>
            <Input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="EX_PRIME" />
          </div>
          <div className="space-y-1">
            <Label>Libellé</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Prime exceptionnelle" />
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={newKind} onValueChange={(v) => setNewKind(v as typeof newKind)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="earning">Gain</SelectItem>
                <SelectItem value="deduction">Retenue</SelectItem>
                <SelectItem value="employer_contribution">Charge patronale</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Méthode</Label>
            <Select value={newMethod} onValueChange={(v) => setNewMethod(v as typeof newMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Montant fixe</SelectItem>
                <SelectItem value="percent_of_base">% du base</SelectItem>
                <SelectItem value="percent_of_gross">% du brut</SelectItem>
                <SelectItem value="worked_hours">Heures travaillées</SelectItem>
                <SelectItem value="overtime_hours">Heures supplémentaires</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Taux / montant</Label>
            <Input type="number" min={0} step="0.01" value={newRate} onChange={(e) => setNewRate(e.target.value)} />
          </div>
        </div>
        <Button className="mt-3" size="sm" onClick={() => void addComponent()} disabled={!newCode || !newName}>
          Ajouter
        </Button>
      </div>
    </div>
  );
}
