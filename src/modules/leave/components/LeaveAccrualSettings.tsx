import { useCallback, useEffect, useState } from "react";
import { SectionCard } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listLeaveTypes, setLeaveTypeAccrual } from "@/modules/leave/leave.functions";
import type { LeaveType } from "@/modules/leave/types";

type Draft = {
  accrualMode: "annual" | "monthly";
  monthly: string;
  annual: string;
  maxCarry: string;
};

function toDraft(t: LeaveType): Draft {
  return {
    accrualMode: t.accrual_mode ?? "annual",
    monthly: String(t.monthly_accrual_days || 2.5),
    annual: String(t.default_entitlement_days ?? 0),
    maxCarry: t.max_carryover_days == null ? "" : String(t.max_carryover_days),
  };
}

const num = (v: string) => Number(v.replace(",", "."));

/** Employer settings: how each leave type is earned and carried over. */
export function LeaveAccrualSettings({ companyId, onSaved }: { companyId: string; onSaved?: () => void }) {
  const [types, setTypes] = useState<LeaveType[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const rows = (await listLeaveTypes({ data: { companyId } })).filter((t) => t.deducts_balance);
    setTypes(rows);
    setDrafts(Object.fromEntries(rows.map((t) => [t.id, toDraft(t)])));
  }, [companyId]);

  useEffect(() => void load(), [load]);

  async function save(t: LeaveType) {
    const d = drafts[t.id];
    if (!d) return;
    setSaving(t.id);
    setMessage(null);
    const res = await setLeaveTypeAccrual({
      data: {
        leaveTypeId: t.id,
        accrualMode: d.accrualMode,
        monthlyAccrualDays: d.accrualMode === "monthly" ? num(d.monthly) : 0,
        annualDays: d.accrualMode === "annual" ? num(d.annual) : 0,
        maxCarryoverDays: d.maxCarry.trim() === "" ? null : num(d.maxCarry),
      },
    });
    setSaving(null);
    if (!res.ok) {
      setMessage(res.message);
      return;
    }
    setMessage(`« ${t.name} » enregistré — les soldes de tous les employés ont été recalculés.`);
    await load();
    onSaved?.();
  }

  return (
    <SectionCard
      title="Acquisition des congés"
      description="Comment vos employés gagnent leurs jours de congé et ce qui est reporté d’une année sur l’autre."
    >
      {message ? <p className="mb-3 rounded-md bg-muted px-3 py-2 text-sm">{message}</p> : null}
      {types.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun type de congé décompté du solde.</p>
      ) : (
        <div className="space-y-4">
          {types.map((t) => {
            const d = drafts[t.id] ?? toDraft(t);
            const set = (patch: Partial<Draft>) => setDrafts((all) => ({ ...all, [t.id]: { ...d, ...patch } }));
            const perYear = d.accrualMode === "monthly" ? num(d.monthly) * 12 : num(d.annual);
            return (
              <div key={t.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-primary">{t.name}</p>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant={d.accrualMode === "monthly" ? "default" : "outline"}
                      onClick={() => set({ accrualMode: "monthly" })}
                    >
                      Chaque mois
                    </Button>
                    <Button
                      size="sm"
                      variant={d.accrualMode === "annual" ? "default" : "outline"}
                      onClick={() => set({ accrualMode: "annual" })}
                    >
                      En début d’année
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  {d.accrualMode === "monthly" ? (
                    <label className="text-sm">
                      Jours acquis par mois travaillé
                      <Input inputMode="decimal" value={d.monthly} onChange={(e) => set({ monthly: e.target.value })} />
                    </label>
                  ) : (
                    <label className="text-sm">
                      Jours crédités au 1er janvier
                      <Input inputMode="decimal" value={d.annual} onChange={(e) => set({ annual: e.target.value })} />
                    </label>
                  )}
                  <label className="text-sm">
                    Report maximum sur l’année suivante (jours)
                    <Input
                      inputMode="decimal"
                      placeholder="Illimité"
                      value={d.maxCarry}
                      onChange={(e) => set({ maxCarry: e.target.value })}
                    />
                  </label>
                  <div className="flex items-end">
                    <Button disabled={saving === t.id} onClick={() => void save(t)}>
                      {saving === t.id ? "Enregistrement…" : "Enregistrer"}
                    </Button>
                  </div>
                </div>

                <p className="mt-2 text-xs text-muted-foreground">
                  {Number.isFinite(perYear) ? `Soit ${perYear.toLocaleString("fr-FR")} jours par an. ` : ""}
                  {d.accrualMode === "monthly"
                    ? "Les jours sont ajoutés à la fin de chaque mois (le mois d’embauche compte si l’employé arrive avant le 16). "
                    : "Tout le droit annuel est disponible dès le 1er janvier. "}
                  {d.maxCarry.trim() === ""
                    ? "Les jours non pris s’accumulent sans limite."
                    : `Au plus ${d.maxCarry} jours non pris sont reportés sur l’année suivante.`}{" "}
                  Un employé ne peut pas demander plus que son solde disponible.
                </p>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
