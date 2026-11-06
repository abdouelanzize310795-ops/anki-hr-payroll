import { useCallback, useEffect, useMemo, useState, type DragEvent } from "react";
import { ArrowDown, ArrowUp, GripVertical, RotateCcw, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  getCompanyTemplate,
  listPayslipTemplates,
  saveCompanyTemplate,
  setCompanyTemplate,
} from "@/modules/payroll/template.functions";
import {
  BLOCK_CATALOG,
  SAMPLE_PAYSLIP,
  newBlockId,
  type BlockType,
  type PayslipBlock,
  type PayslipLayout,
  type PayslipTemplate,
} from "@/modules/payroll/template.types";
import { PayslipRenderer } from "./PayslipRenderer";
import { TemplatePicker } from "./TemplatePicker";

const PALETTE_MIME = "application/x-mshahara-block";
const MOVE_MIME = "application/x-mshahara-move";

const ACCENTS = ["#0E4C56", "#16211F", "#1D4ED8", "#7C3AED", "#B45309", "#BE123C", "#15803D"];

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** Drag & drop editor for the company's payslip layout. */
export function TemplateEditor({ companyId }: { companyId: string }) {
  const [templates, setTemplates] = useState<PayslipTemplate[]>([]);
  const [current, setCurrent] = useState<PayslipTemplate | null>(null);
  const [layout, setLayout] = useState<PayslipLayout | null>(null);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const load = useCallback(async () => {
    const [list, tpl] = await Promise.all([
      listPayslipTemplates({ data: { companyId } }),
      getCompanyTemplate({ data: { companyId } }),
    ]);
    setTemplates(list);
    setCurrent(tpl);
    setLayout(clone(tpl.layout));
    setName(tpl.is_system ? `${tpl.name} — personnalisé` : tpl.name);
    setDirty(false);
    setSelected(null);
  }, [companyId]);

  useEffect(() => void load(), [load]);

  const update = (next: PayslipLayout) => {
    setLayout(next);
    setDirty(true);
    setMessage(null);
  };

  const usedTypes = useMemo(() => new Set(layout?.blocks.map((b) => b.type)), [layout]);
  const selectedBlock = layout?.blocks.find((b) => b.id === selected) ?? null;

  if (!layout || !current) {
    return <p className="text-sm text-muted-foreground">Chargement du modèle…</p>;
  }

  function insertBlock(type: BlockType, index: number) {
    if (!layout) return;
    const block: PayslipBlock = { id: newBlockId(), type, options: clone(BLOCK_CATALOG[type].defaults) };
    const blocks = [...layout.blocks];
    blocks.splice(index, 0, block);
    update({ ...layout, blocks });
    setSelected(block.id);
  }

  function moveBlock(from: number, to: number) {
    if (!layout || from === to || from + 1 === to) return;
    const blocks = [...layout.blocks];
    const [moved] = blocks.splice(from, 1);
    blocks.splice(to > from ? to - 1 : to, 0, moved!);
    update({ ...layout, blocks });
  }

  function removeBlock(id: string) {
    if (!layout) return;
    update({ ...layout, blocks: layout.blocks.filter((b) => b.id !== id) });
    if (selected === id) setSelected(null);
  }

  function onDropAt(e: DragEvent, index: number) {
    e.preventDefault();
    setDropIndex(null);
    const type = e.dataTransfer.getData(PALETTE_MIME) as BlockType;
    const from = e.dataTransfer.getData(MOVE_MIME);
    if (type) insertBlock(type, index);
    else if (from !== "") moveBlock(Number(from), index);
  }

  async function onSave() {
    if (!layout) return;
    setSaving(true);
    const res = await saveCompanyTemplate({
      data: { companyId, templateId: current?.id, name: name.trim() || "Mon modèle", layout },
    });
    setSaving(false);
    if (!res.ok) {
      setMessage(res.message);
      return;
    }
    setMessage("Modèle enregistré : il sera utilisé pour les prochains calculs de paie.");
    await load();
  }

  async function onPickBase(id: string) {
    const res = await setCompanyTemplate({ data: { companyId, templateId: id } });
    if (!res.ok) {
      setMessage(res.message);
      return;
    }
    setShowPicker(false);
    await load();
    setMessage("Modèle appliqué. Vous pouvez le personnaliser ci-dessous.");
  }

  const DropZone = ({ index }: { index: number }) => (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDropIndex(index);
      }}
      onDragLeave={() => setDropIndex((i) => (i === index ? null : i))}
      onDrop={(e) => onDropAt(e, index)}
      className={`rounded transition-all ${dropIndex === index ? "my-1 h-10 border-2 border-dashed border-[var(--accent)] bg-[var(--accent)]/5" : "h-2"}`}
      style={{ ["--accent" as string]: layout.theme.accent }}
    />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
        <div className="min-w-[220px] flex-1">
          <p className="text-xs text-muted-foreground">
            Modèle utilisé : <span className="font-semibold text-foreground">{current.name}</span>
            {current.is_system ? " (modèle Mshahara)" : " (personnalisé)"}
          </p>
          <Input className="mt-1 h-8" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} />
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowPicker((v) => !v)}>
          Changer de modèle de base
        </Button>
        <Button variant="ghost" size="sm" disabled={!dirty} onClick={() => void load()}>
          <RotateCcw className="mr-1 h-4 w-4" /> Annuler
        </Button>
        <Button size="sm" disabled={!dirty || saving} onClick={() => void onSave()}>
          <Save className="mr-1 h-4 w-4" /> {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
      </div>
      {message ? <p className="rounded-md bg-muted px-3 py-2 text-sm">{message}</p> : null}
      {showPicker ? (
        <div className="rounded-lg border p-4">
          <p className="mb-3 text-sm text-muted-foreground">
            Choisir un modèle remplace la mise en page actuelle (vos modèles personnalisés restent disponibles ici).
          </p>
          <TemplatePicker templates={templates} value={current.id} onChange={(id) => void onPickBase(id)} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)_280px]">
        {/* Palette */}
        <div className="space-y-2 lg:sticky lg:top-20 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Blocs — glissez-les</p>
          {(Object.keys(BLOCK_CATALOG) as BlockType[]).map((type) => {
            const info = BLOCK_CATALOG[type];
            const disabled = !info.repeatable && usedTypes.has(type);
            return (
              <div
                key={type}
                draggable={!disabled}
                onDragStart={(e) => {
                  e.dataTransfer.setData(PALETTE_MIME, type);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onDoubleClick={() => !disabled && insertBlock(type, layout.blocks.length)}
                title={disabled ? "Déjà sur le bulletin" : "Glissez sur le bulletin (ou double-cliquez)"}
                className={`flex cursor-grab items-start gap-2 rounded-md border bg-card p-2 text-sm active:cursor-grabbing ${disabled ? "cursor-not-allowed opacity-40" : "hover:border-primary/50"}`}
              >
                <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="font-medium leading-tight">{info.label}</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">{info.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Canvas */}
        <div className="overflow-x-auto rounded-lg bg-muted/40 p-4">
          <PayslipRenderer
            slip={SAMPLE_PAYSLIP}
            layout={layout}
            selectedBlockId={selected}
            renderBlockWrapper={(block, content, index) => (
              <>
                {index === 0 ? <DropZone index={0} /> : null}
                <div
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(MOVE_MIME, String(index));
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onClick={() => setSelected(block.id)}
                  className="group relative cursor-pointer rounded hover:bg-black/[0.02]"
                >
                  <div className="absolute -left-3 top-1/2 hidden -translate-x-full -translate-y-1/2 flex-col gap-1 group-hover:flex print:hidden">
                    <span className="flex h-6 w-6 cursor-grab items-center justify-center rounded bg-white text-muted-foreground shadow">
                      <GripVertical className="h-4 w-4" />
                    </span>
                  </div>
                  <span className="pointer-events-none absolute -top-2 right-0 hidden rounded bg-[#16211F] px-1.5 py-0.5 text-[10px] text-white group-hover:block">
                    {BLOCK_CATALOG[block.type].label}
                  </span>
                  {content}
                </div>
                <DropZone index={index + 1} />
              </>
            )}
          />
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Aperçu avec des données d’exemple. Glissez un bloc pour le déplacer, cliquez pour le régler.
          </p>
        </div>

        {/* Inspector */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-lg border bg-card p-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Apparence</p>
            <p className="text-sm">Couleur</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Couleur ${c}`}
                  onClick={() => update({ ...layout, theme: { ...layout.theme, accent: c } })}
                  className={`h-7 w-7 rounded-full border-2 ${layout.theme.accent === c ? "border-gold" : "border-transparent"}`}
                  style={{ background: c }}
                />
              ))}
              <input
                type="color"
                value={layout.theme.accent}
                onChange={(e) => update({ ...layout, theme: { ...layout.theme, accent: e.target.value } })}
                className="h-7 w-9 cursor-pointer rounded border"
                aria-label="Couleur personnalisée"
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <label>
                Police
                <select
                  className="mt-1 h-8 w-full rounded-md border bg-background px-2"
                  value={layout.theme.font}
                  onChange={(e) => update({ ...layout, theme: { ...layout.theme, font: e.target.value as "serif" | "sans" } })}
                >
                  <option value="serif">Élégante</option>
                  <option value="sans">Moderne</option>
                </select>
              </label>
              <label>
                Densité
                <select
                  className="mt-1 h-8 w-full rounded-md border bg-background px-2"
                  value={layout.theme.density}
                  onChange={(e) => update({ ...layout, theme: { ...layout.theme, density: e.target.value as "comfortable" | "compact" } })}
                >
                  <option value="comfortable">Aérée</option>
                  <option value="compact">Compacte</option>
                </select>
              </label>
            </div>
          </div>

          <div className="rounded-lg border bg-card p-3">
            {selectedBlock ? (
              <BlockInspector
                block={selectedBlock}
                index={layout.blocks.findIndex((b) => b.id === selectedBlock.id)}
                total={layout.blocks.length}
                onChange={(options) =>
                  update({
                    ...layout,
                    blocks: layout.blocks.map((b) => (b.id === selectedBlock.id ? { ...b, options } : b)),
                  })
                }
                onMove={(delta) => {
                  const i = layout.blocks.findIndex((b) => b.id === selectedBlock.id);
                  moveBlock(i, delta < 0 ? i - 1 : i + 2);
                }}
                onRemove={() => removeBlock(selectedBlock.id)}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                Cliquez sur un bloc du bulletin pour régler ses options, le déplacer ou le retirer.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockInspector({
  block, index, total, onChange, onMove, onRemove,
}: {
  block: PayslipBlock;
  index: number;
  total: number;
  onChange: (options: PayslipBlock["options"]) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const info = BLOCK_CATALOG[block.type];
  return (
    <div className="space-y-3">
      <div>
        <p className="font-semibold text-primary">{info.label}</p>
        <p className="text-xs text-muted-foreground">{info.description}</p>
      </div>
      {info.fields.map((f) => {
        const value = block.options[f.key];
        if (f.kind === "boolean") {
          return (
            <label key={f.key} className="flex items-center justify-between gap-2 text-sm">
              {f.label}
              <Switch checked={value === undefined ? Boolean(info.defaults[f.key]) : Boolean(value)}
                onCheckedChange={(v) => onChange({ ...block.options, [f.key]: v })} />
            </label>
          );
        }
        if (f.kind === "select") {
          return (
            <label key={f.key} className="block text-sm">
              {f.label}
              <select
                className="mt-1 h-8 w-full rounded-md border bg-background px-2"
                value={String(value ?? f.choices[0]?.value)}
                onChange={(e) => onChange({ ...block.options, [f.key]: e.target.value })}
              >
                {f.choices.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </label>
          );
        }
        return (
          <label key={f.key} className="block text-sm">
            {f.label}
            {f.multiline ? (
              <Textarea className="mt-1" rows={3} value={String(value ?? "")}
                onChange={(e) => onChange({ ...block.options, [f.key]: e.target.value })} />
            ) : (
              <Input className="mt-1 h-8" value={String(value ?? "")}
                onChange={(e) => onChange({ ...block.options, [f.key]: e.target.value })} />
            )}
          </label>
        );
      })}
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button size="sm" variant="outline" disabled={index <= 0} onClick={() => onMove(-1)}>
          <ArrowUp className="mr-1 h-4 w-4" /> Monter
        </Button>
        <Button size="sm" variant="outline" disabled={index >= total - 1} onClick={() => onMove(1)}>
          <ArrowDown className="mr-1 h-4 w-4" /> Descendre
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive" onClick={onRemove}>
          <Trash2 className="mr-1 h-4 w-4" /> Retirer
        </Button>
      </div>
    </div>
  );
}
