import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { Eye, EyeOff, FlaskConical, GripVertical, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { listDepartments } from "@/modules/companies/company.functions";
import type { Department } from "@/modules/companies/types";
import { listEmployees } from "@/modules/employees/employee.functions";
import type { EmployeeWithRelations } from "@/modules/employees/types";
import {
  addComponentFromPreset,
  listComponentPresets,
  listPayrollComponents,
  previewPayslip,
  removeComponent,
  reorderComponents,
  updateComponentRules,
  type PayslipPreview,
} from "@/modules/payroll/payroll.functions";
import {
  MONTHS_FR,
  calcMethodLabel,
  percentBasisLabel,
  type PayrollCalcMethod,
  type PayrollComponent,
  type PayrollComponentKind,
  type PayrollComponentPreset,
  type PercentBasis,
} from "@/modules/payroll/types";

const PRESET_MIME = "application/x-mshahara-preset";
const ROW_MIME = "application/x-mshahara-component";

const COLUMNS: { kind: PayrollComponentKind; title: string; hint: string }[] = [
  { kind: "earning", title: "Gains", hint: "Ajoutés au salaire brut" },
  { kind: "deduction", title: "Retenues", hint: "Déduites du salaire" },
  { kind: "employer_contribution", title: "Charges patronales", hint: "Payées par l’employeur" },
];

const CONTRACTS = [
  { value: "cdi", label: "CDI" },
  { value: "cdd", label: "CDD" },
  { value: "essai", label: "Essai" },
  { value: "stage", label: "Stage" },
  { value: "consultant", label: "Consultant" },
] as const;

function fmt(n: number | null | undefined) {
  return Math.round(Number(n ?? 0)).toLocaleString("fr-FR");
}

function ruleSummary(c: PayrollComponent): string {
  const parts: string[] = [];
  if (c.calc_method === "fixed") parts.push(`${fmt(c.rate_value)} fixe`);
  else if (c.calc_method.startsWith("percent")) parts.push(`${c.rate_value} %`);
  else parts.push(calcMethodLabel[c.calc_method]);
  if (c.min_amount != null) parts.push(`min ${fmt(c.min_amount)}`);
  if (c.max_amount != null) parts.push(`max ${fmt(c.max_amount)}`);
  const conds = [
    c.cond_department_ids?.length ? `${c.cond_department_ids.length} service(s)` : null,
    c.cond_contract_types?.length ? c.cond_contract_types.join("/").toUpperCase() : null,
    c.cond_min_seniority_months ? `≥ ${c.cond_min_seniority_months} mois d’ancienneté` : null,
    c.cond_employee_ids?.length ? `${c.cond_employee_ids.length} employé(s)` : null,
  ].filter(Boolean);
  if (conds.length) parts.push(`si ${conds.join(", ")}`);
  return parts.join(" · ");
}

/** Drag & drop builder for payroll rubrics with configurable rules. */
export function ComponentBuilder({ companyId }: { companyId: string }) {
  const [components, setComponents] = useState<PayrollComponent[]>([]);
  const [presets, setPresets] = useState<PayrollComponentPreset[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [employees, setEmployees] = useState<EmployeeWithRelations[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [c, p, d, e] = await Promise.all([
      listPayrollComponents({ data: { companyId } }),
      listComponentPresets(),
      listDepartments({ data: { companyId } }).catch(() => [] as Department[]),
      listEmployees({ data: { companyId, status: "active" } }).catch(() => [] as EmployeeWithRelations[]),
    ]);
    setComponents(c);
    setPresets(p);
    setDepartments(d);
    setEmployees(e);
  }, [companyId]);

  useEffect(() => void load(), [load]);

  const byKind = useMemo(() => {
    const map: Record<string, PayrollComponent[]> = { earning: [], deduction: [], employer_contribution: [] };
    for (const c of [...components].sort((a, b) => a.sort_order - b.sort_order)) map[c.kind]?.push(c);
    return map;
  }, [components]);

  const presetGroups = useMemo(() => {
    const groups = new Map<string, PayrollComponentPreset[]>();
    for (const p of presets) groups.set(p.category, [...(groups.get(p.category) ?? []), p]);
    return [...groups.entries()];
  }, [presets]);

  async function addPreset(code: string, kind?: PayrollComponentKind) {
    const res = await addComponentFromPreset({ data: { companyId, presetCode: code, kind } });
    if (!res.ok) {
      setMessage(res.message);
      return;
    }
    setMessage(`« ${res.data.name} » ajoutée. Réglez ses règles à droite.`);
    await load();
    setSelectedId(res.data.id);
  }

  async function persistOrder(next: Record<string, PayrollComponent[]>) {
    const ids = [...next.earning!, ...next.deduction!, ...next.employer_contribution!].map((c) => c.id);
    const ordered = ids.map((id, i) => ({ ...components.find((c) => c.id === id)!, sort_order: (i + 1) * 10 }));
    setComponents(ordered);
    const res = await reorderComponents({ data: { companyId, ids } });
    if (!res.ok) setMessage(res.message);
  }

  function onDrop(e: DragEvent, kind: PayrollComponentKind, beforeId: string | null) {
    e.preventDefault();
    e.stopPropagation();
    setOverColumn(null);
    const presetCode = e.dataTransfer.getData(PRESET_MIME);
    if (presetCode) {
      void addPreset(presetCode, kind);
      return;
    }
    const rowId = e.dataTransfer.getData(ROW_MIME);
    if (!rowId) return;
    const moving = components.find((c) => c.id === rowId);
    if (!moving) return;
    if (moving.kind !== kind) {
      setMessage("Une rubrique ne peut pas changer de colonne (gain, retenue, charge).");
      return;
    }
    const list = byKind[kind]!.filter((c) => c.id !== rowId);
    const at = beforeId ? list.findIndex((c) => c.id === beforeId) : list.length;
    list.splice(at < 0 ? list.length : at, 0, moving);
    void persistOrder({ ...byKind, [kind]: list });
  }

  const selected = components.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="space-y-4">
      {message ? <p className="rounded-md bg-muted px-3 py-2 text-sm">{message}</p> : null}
      <div className="grid gap-4 xl:grid-cols-[230px_minmax(0,1fr)_340px]">
        {/* Library */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Bibliothèque — glissez dans une colonne
          </p>
          {presetGroups.map(([category, items]) => (
            <div key={category}>
              <p className="mb-1 text-[11px] font-semibold text-reef">{category}</p>
              <div className="space-y-1.5">
                {items.map((p) => (
                  <div
                    key={p.code}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(PRESET_MIME, p.code);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    className="flex cursor-grab items-start gap-2 rounded-md border bg-card p-2 text-sm hover:border-primary/50 active:cursor-grabbing"
                    title={p.description}
                  >
                    <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-tight">{p.name}</p>
                      <p className="text-[11px] leading-snug text-muted-foreground">{p.description}</p>
                    </div>
                    <button
                      type="button"
                      className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                      aria-label={`Ajouter ${p.name}`}
                      onClick={() => void addPreset(p.code)}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Columns */}
        <div className="grid gap-3 md:grid-cols-3">
          {COLUMNS.map((col) => (
            <div
              key={col.kind}
              onDragOver={(e) => {
                e.preventDefault();
                setOverColumn(col.kind);
              }}
              onDragLeave={() => setOverColumn((k) => (k === col.kind ? null : k))}
              onDrop={(e) => onDrop(e, col.kind, null)}
              className={`min-h-[320px] rounded-lg border-2 p-2 transition ${overColumn === col.kind ? "border-dashed border-primary bg-primary/5" : "border-transparent bg-muted/40"}`}
            >
              <p className="px-1 font-semibold text-primary">{col.title}</p>
              <p className="mb-2 px-1 text-[11px] text-muted-foreground">{col.hint}</p>
              <div className="space-y-1.5">
                {byKind[col.kind]!.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(ROW_MIME, c.id);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => onDrop(e, col.kind, c.id)}
                    onClick={() => setSelectedId(c.id)}
                    className={`flex cursor-pointer items-start gap-2 rounded-md border bg-card p-2 text-sm ${selectedId === c.id ? "border-gold ring-1 ring-gold" : ""} ${c.is_active ? "" : "opacity-50"}`}
                  >
                    <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1 font-medium leading-tight">
                        {c.name}
                        {c.show_on_payslip === false ? <EyeOff className="h-3 w-3 text-muted-foreground" /> : null}
                      </p>
                      <p className="text-[11px] leading-snug text-muted-foreground">{ruleSummary(c)}</p>
                    </div>
                  </div>
                ))}
                {byKind[col.kind]!.length === 0 ? (
                  <p className="rounded border border-dashed p-4 text-center text-xs text-muted-foreground">
                    Déposez une rubrique ici
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>

        {/* Rules + tester */}
        <div className="space-y-4">
          {selected ? (
            <RulesPanel
              key={selected.id}
              component={selected}
              departments={departments}
              employees={employees}
              onSaved={async (msg) => {
                setMessage(msg);
                await load();
              }}
              onRemoved={async () => {
                setSelectedId(null);
                await load();
              }}
            />
          ) : (
            <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
              Cliquez sur une rubrique pour régler son calcul, ses conditions et son affichage.
            </div>
          )}
          <PreviewTester employees={employees} />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function RulesPanel({
  component: c,
  departments,
  employees,
  onSaved,
  onRemoved,
}: {
  component: PayrollComponent;
  departments: Department[];
  employees: EmployeeWithRelations[];
  onSaved: (message: string) => void | Promise<void>;
  onRemoved: () => void | Promise<void>;
}) {
  const [name, setName] = useState(c.name);
  const [calcMethod, setCalcMethod] = useState<PayrollCalcMethod>(c.calc_method);
  const [rate, setRate] = useState(String(c.rate_value));
  const [basis, setBasis] = useState<PercentBasis>(c.percent_basis ?? "auto");
  const [min, setMin] = useState(c.min_amount == null ? "" : String(c.min_amount));
  const [max, setMax] = useState(c.max_amount == null ? "" : String(c.max_amount));
  const [igr, setIgr] = useState(c.subject_to_igr);
  const [retirement, setRetirement] = useState(c.subject_to_retirement);
  const [reduces, setReduces] = useState(Boolean(c.reduces_taxable_base));
  const [active, setActive] = useState(c.is_active);
  const [visible, setVisible] = useState(c.show_on_payslip !== false);
  const [baseRate, setBaseRate] = useState(c.show_base_rate !== false);
  const [depts, setDepts] = useState<string[]>(c.cond_department_ids ?? []);
  const [contracts, setContracts] = useState<string[]>(c.cond_contract_types ?? []);
  const [seniority, setSeniority] = useState(c.cond_min_seniority_months == null ? "" : String(c.cond_min_seniority_months));
  const [emps, setEmps] = useState<string[]>(c.cond_employee_ids ?? []);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const methods: PayrollCalcMethod[] =
    c.kind === "earning"
      ? ["base_salary", "fixed", "percent_of_base", "percent_of_gross", "worked_hours", "overtime_hours"]
      : ["fixed", "percent_of_base", "percent_of_gross", "igr_progressive"];
  const isPercent = calcMethod.startsWith("percent");

  async function save() {
    setBusy(true);
    setError(null);
    const res = await updateComponentRules({
      data: {
        id: c.id,
        name,
        calcMethod,
        rateValue: Number(rate.replace(",", ".")) || 0,
        percentBasis: basis,
        minAmount: num(min),
        maxAmount: num(max),
        subjectToIgr: igr,
        subjectToRetirement: retirement,
        reducesTaxableBase: reduces,
        isActive: active,
        showOnPayslip: visible,
        showBaseRate: baseRate,
        condDepartmentIds: depts,
        condContractTypes: contracts as ("cdi" | "cdd" | "essai" | "stage" | "consultant")[],
        condMinSeniorityMonths: seniority.trim() === "" ? null : Math.max(0, Math.round(Number(seniority))),
        condEmployeeIds: emps,
      },
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.message);
      return;
    }
    await onSaved(`Règles de « ${res.data.name} » enregistrées.`);
  }

  async function remove() {
    if (!window.confirm(`Supprimer la rubrique « ${c.name} » ?`)) return;
    const res = await removeComponent({ data: { id: c.id } });
    if (!res.ok) setError(res.message);
    else await onRemoved();
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4 text-sm">
      <div className="flex items-center justify-between gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 font-semibold" />
        <label className="flex items-center gap-1.5 text-xs">
          <Switch checked={active} onCheckedChange={setActive} /> Active
        </label>
      </div>
      <p className="font-mono text-[11px] text-muted-foreground">{c.code}{c.is_system ? " · rubrique système" : ""}</p>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-reef">Calcul</p>
        <select
          className="h-8 w-full rounded-md border bg-background px-2"
          value={calcMethod}
          disabled={c.is_system}
          onChange={(e) => setCalcMethod(e.target.value as PayrollCalcMethod)}
        >
          {methods.map((m) => (
            <option key={m} value={m}>{calcMethodLabel[m]}</option>
          ))}
        </select>
        {calcMethod !== "base_salary" && calcMethod !== "igr_progressive" ? (
          <label className="block">
            {calcMethod === "fixed" ? "Montant (KMF)" : isPercent ? "Taux (%)" : calcMethod === "overtime_hours" ? "Majoration (0 = valeur de l’entreprise)" : "Tarif horaire (0 = salaire / heures)"}
            <Input className="mt-1 h-8" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
          </label>
        ) : null}
        {isPercent ? (
          <label className="block">
            Calculé sur
            <select className="mt-1 h-8 w-full rounded-md border bg-background px-2" value={basis}
              onChange={(e) => setBasis(e.target.value as PercentBasis)}>
              {(Object.keys(percentBasisLabel) as PercentBasis[]).map((b) => (
                <option key={b} value={b}>{percentBasisLabel[b]}</option>
              ))}
            </select>
          </label>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <label>
            Plancher
            <Input className="mt-1 h-8" inputMode="decimal" placeholder="Aucun" value={min} onChange={(e) => setMin(e.target.value)} />
          </label>
          <label>
            Plafond
            <Input className="mt-1 h-8" inputMode="decimal" placeholder="Aucun" value={max} onChange={(e) => setMax(e.target.value)} />
          </label>
        </div>
        {c.kind === "earning" ? (
          <>
            <label className="flex items-center justify-between">Soumise à l’IGR <Switch checked={igr} onCheckedChange={setIgr} /></label>
            <label className="flex items-center justify-between">Soumise à la retraite <Switch checked={retirement} onCheckedChange={setRetirement} /></label>
          </>
        ) : c.kind === "deduction" && calcMethod !== "igr_progressive" ? (
          <label className="flex items-center justify-between">Déduite de la base IGR <Switch checked={reduces} onCheckedChange={setReduces} /></label>
        ) : null}
      </section>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-reef">Conditions — s’applique seulement si…</p>
        <div>
          <p className="text-xs text-muted-foreground">Services (aucun = tous)</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {departments.length === 0 ? <span className="text-xs text-muted-foreground">Aucun service créé</span> : null}
            {departments.map((d) => (
              <button key={d.id} type="button" onClick={() => setDepts(toggle(depts, d.id))}
                className={`rounded-full border px-2 py-0.5 text-xs ${depts.includes(d.id) ? "bg-primary text-primary-foreground" : ""}`}>
                {d.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Types de contrat (aucun = tous)</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {CONTRACTS.map((k) => (
              <button key={k.value} type="button" onClick={() => setContracts(toggle(contracts, k.value))}
                className={`rounded-full border px-2 py-0.5 text-xs ${contracts.includes(k.value) ? "bg-primary text-primary-foreground" : ""}`}>
                {k.label}
              </button>
            ))}
          </div>
        </div>
        <label className="block">
          Ancienneté minimale (mois)
          <Input className="mt-1 h-8" inputMode="numeric" placeholder="Aucune" value={seniority} onChange={(e) => setSeniority(e.target.value)} />
        </label>
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Employés précis ({emps.length || "tous"})
          </summary>
          <div className="mt-1 max-h-36 space-y-1 overflow-y-auto">
            {employees.map((e) => (
              <label key={e.id} className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={emps.includes(e.id)} onChange={() => setEmps(toggle(emps, e.id))} />
                {e.first_name} {e.last_name}
              </label>
            ))}
          </div>
        </details>
      </section>

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-reef">Affichage sur le bulletin</p>
        <label className="flex items-center justify-between">
          <span className="flex items-center gap-1">{visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} Visible sur le bulletin</span>
          <Switch checked={visible} onCheckedChange={setVisible} />
        </label>
        <label className="flex items-center justify-between">Afficher base et taux <Switch checked={baseRate} onCheckedChange={setBaseRate} /></label>
        {!visible ? (
          <p className="text-[11px] text-muted-foreground">Une rubrique masquée est quand même calculée et comptée dans les totaux.</p>
        ) : null}
      </section>

      {error ? <p className="text-destructive">{error}</p> : null}
      <div className="flex gap-2">
        <Button size="sm" disabled={busy} onClick={() => void save()}>{busy ? "Enregistrement…" : "Enregistrer les règles"}</Button>
        {!c.is_system ? (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => void remove()}>
            <Trash2 className="mr-1 h-4 w-4" /> Supprimer
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function PreviewTester({ employees }: { employees: EmployeeWithRelations[] }) {
  const now = new Date();
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year] = useState(now.getFullYear());
  const [preview, setPreview] = useState<PayslipPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    if (!employeeId) return;
    setBusy(true);
    setError(null);
    const res = await previewPayslip({ data: { employeeId, year, month } });
    setBusy(false);
    if (!res.ok) setError(res.message);
    else setPreview(res.data);
  }

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4 text-sm">
      <p className="flex items-center gap-1.5 font-semibold text-primary"><FlaskConical className="h-4 w-4" /> Tester sur un employé</p>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <select className="h-8 rounded-md border bg-background px-2" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
          <option value="">Choisir un employé</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
          ))}
        </select>
        <select className="h-8 rounded-md border bg-background px-2" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MONTHS_FR.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
      </div>
      <Button size="sm" variant="outline" disabled={!employeeId || busy} onClick={() => void run()}>
        {busy ? "Calcul…" : "Calculer un bulletin d’essai"}
      </Button>
      <p className="text-[11px] text-muted-foreground">Rien n’est enregistré : c’est une simulation avec les règles actuelles.</p>
      {error ? <p className="text-destructive">{error}</p> : null}
      {preview ? (
        <div className="space-y-1 border-t pt-2">
          {preview.message ? <p className="text-muted-foreground">{preview.message}</p> : null}
          {preview.lines.map((l) => (
            <div key={`${l.kind}-${l.code}`} className={`flex justify-between gap-2 ${l.hidden ? "text-muted-foreground" : ""}`}>
              <span>{l.kind === "earning" ? "+" : l.kind === "deduction" ? "−" : "·"} {l.label}{l.hidden ? " (masquée)" : ""}</span>
              <span className="font-mono">{fmt(l.amount)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
            <span>Net à payer</span>
            <span className="font-mono">{fmt(preview.net)} KMF</span>
          </div>
          <p className="text-[11px] text-muted-foreground">Brut {fmt(preview.gross)} · retenues {fmt(preview.deductions)} · charges {fmt(preview.employer)}</p>
        </div>
      ) : null}
    </div>
  );
}
