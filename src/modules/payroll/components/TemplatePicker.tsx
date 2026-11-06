import { Check } from "lucide-react";
import { SAMPLE_PAYSLIP, type PayslipTemplate } from "@/modules/payroll/template.types";
import { PayslipRenderer } from "./PayslipRenderer";

/** Grid of payslip templates with a live miniature of each one. */
export function TemplatePicker({
  templates,
  value,
  onChange,
}: {
  templates: PayslipTemplate[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {templates.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={`group relative overflow-hidden rounded-xl border-2 bg-card text-left transition ${
              selected ? "border-gold shadow-lg" : "border-border hover:border-primary/40"
            }`}
          >
            <div className="pointer-events-none h-56 overflow-hidden bg-muted/40" aria-hidden>
              <div className="origin-top-left scale-[0.32]" style={{ width: "312.5%" }}>
                <PayslipRenderer slip={SAMPLE_PAYSLIP} layout={t.layout} />
              </div>
            </div>
            <div className="border-t p-3">
              <p className="font-semibold text-primary">{t.name}</p>
              <p className="line-clamp-2 text-xs text-muted-foreground">{t.description}</p>
            </div>
            {selected ? (
              <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-gold text-gold-foreground shadow">
                <Check className="h-4 w-4" />
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
