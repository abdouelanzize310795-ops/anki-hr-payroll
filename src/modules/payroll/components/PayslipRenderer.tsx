import type { CSSProperties, ReactNode } from "react";
import type { PayslipLine } from "@/modules/payroll/types";
import type {
  BlockOptions,
  PayslipBlock,
  PayslipLayout,
  RenderablePayslip,
} from "@/modules/payroll/template.types";

/**
 * Renders a payslip from a block layout (payslip templates). The page is always a white
 * sheet (independent of the app's dark mode) so screen, print and PDF look the same.
 */

const DEFAULT_LAYOUT: PayslipLayout = {
  theme: { accent: "#0E4C56", font: "serif", density: "comfortable" },
  blocks: [
    { id: "b1", type: "company_header", options: { showLogo: true, align: "left" } },
    { id: "b2", type: "title_period", options: {} },
    { id: "b3", type: "employee_info", options: {} },
    { id: "b4", type: "net_highlight", options: { style: "box" } },
    { id: "b5", type: "earnings_table", options: { showBaseRate: true, hideZero: true } },
    { id: "b6", type: "deductions_table", options: { showBaseRate: true, hideZero: true } },
    { id: "b7", type: "employer_contributions", options: { showBaseRate: true } },
  ],
};

function money(value: number | null | undefined, currency: string): string {
  const n = Math.round(Number(value ?? 0));
  const grouped = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${n < 0 ? "−" : ""}${grouped} ${currency}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-FR");
}

type Ctx = { slip: RenderablePayslip; accent: string; compact: boolean; display: string };

export function PayslipRenderer({
  slip,
  layout,
  selectedBlockId,
  renderBlockWrapper,
}: {
  slip: RenderablePayslip;
  layout?: PayslipLayout | null;
  selectedBlockId?: string | null;
  /** Editor hook: wraps each block (drag handles, selection). */
  renderBlockWrapper?: (block: PayslipBlock, content: ReactNode, index: number) => ReactNode;
}) {
  const l = layout ?? slip.layout ?? DEFAULT_LAYOUT;
  const ctx: Ctx = {
    slip,
    accent: l.theme.accent,
    compact: l.theme.density === "compact",
    display: l.theme.font === "serif" ? "var(--font-display)" : "Manrope, system-ui, sans-serif",
  };
  const style: CSSProperties = {
    fontFamily: "Manrope, system-ui, sans-serif",
    color: "#16211F",
    ["--accent" as string]: l.theme.accent,
  };

  return (
    <div
      className={`payslip-print mx-auto w-full max-w-3xl rounded-sm bg-white shadow-sm print:max-w-none print:shadow-none ${ctx.compact ? "p-5 text-[12px]" : "p-8 text-sm"}`}
      style={style}
    >
      {l.blocks.map((block, index) => {
        const content = <BlockView block={block} ctx={ctx} />;
        const wrapped = renderBlockWrapper ? renderBlockWrapper(block, content, index) : content;
        return (
          <div
            key={block.id}
            className={selectedBlockId === block.id ? "rounded outline outline-2 outline-offset-4 outline-[var(--accent)]" : ""}
          >
            {wrapped}
          </div>
        );
      })}
    </div>
  );
}

function BlockView({ block, ctx }: { block: PayslipBlock; ctx: Ctx }) {
  const gap = ctx.compact ? "mt-3" : "mt-6";
  const o = block.options;
  switch (block.type) {
    case "company_header":
      return <CompanyHeader ctx={ctx} o={o} />;
    case "title_period":
      return (
        <div className={`${gap} flex flex-wrap items-end justify-between gap-2 border-b pb-2`} style={{ borderColor: ctx.accent }}>
          <div>
            <p className="font-bold uppercase tracking-[0.12em]" style={{ color: ctx.accent, fontFamily: ctx.display, fontSize: ctx.compact ? 15 : 20 }}>
              {o.title || "Bulletin de paie"}
            </p>
            <p className="text-[#6B7371]">{ctx.slip.period_label}</p>
          </div>
          <div className="text-right text-xs text-[#6B7371]">
            <p className="font-mono">{ctx.slip.payslip_number}</p>
            <p>
              Du {fmtDate(ctx.slip.period_start)} au {fmtDate(ctx.slip.period_end)}
            </p>
          </div>
        </div>
      );
    case "employee_info":
      return <EmployeeInfo ctx={ctx} o={o} gap={gap} />;
    case "net_highlight":
      return <NetHighlight ctx={ctx} o={o} gap={gap} />;
    case "earnings_table":
      return (
        <LinesTable
          ctx={ctx}
          gap={gap}
          title="Gains"
          lines={ctx.slip.lines.filter((x) => x.kind === "earning")}
          showBaseRate={o.showBaseRate !== false}
          hideZero={o.hideZero !== false}
          totalLabel="Salaire brut"
          total={ctx.slip.gross_amount}
        />
      );
    case "deductions_table":
      return (
        <LinesTable
          ctx={ctx}
          gap={gap}
          title="Retenues"
          lines={ctx.slip.lines.filter((x) => x.kind === "deduction")}
          showBaseRate={o.showBaseRate !== false}
          hideZero={o.hideZero !== false}
          totalLabel="Total des retenues"
          total={ctx.slip.deduction_amount}
          negative
        />
      );
    case "employer_contributions": {
      const lines = ctx.slip.lines.filter((x) => x.kind === "employer_contribution");
      if (lines.length === 0) return null;
      return (
        <LinesTable
          ctx={ctx}
          gap={gap}
          title="Charges patronales (information)"
          lines={lines}
          showBaseRate={o.showBaseRate !== false}
          hideZero
          totalLabel="Total employeur"
          total={ctx.slip.employer_contribution_amount}
          muted
        />
      );
    }
    case "totals_summary": {
      const c = ctx.slip.currency_code;
      const cells = [
        { label: "Brut", value: money(ctx.slip.gross_amount, c) },
        { label: "Retenues", value: money(-ctx.slip.deduction_amount, c) },
        { label: "Net à payer", value: money(ctx.slip.net_amount, c), strong: true },
        { label: "Coût employeur", value: money(ctx.slip.gross_amount + ctx.slip.employer_contribution_amount, c) },
      ];
      return (
        <div className={`${gap} grid grid-cols-2 gap-2 sm:grid-cols-4`}>
          {cells.map((cell) => (
            <div key={cell.label} className="rounded-md border border-[#E5E2D8] p-3">
              <p className="text-[10px] uppercase tracking-wider text-[#6B7371]">{cell.label}</p>
              <p className="mt-1 font-mono font-semibold" style={cell.strong ? { color: ctx.accent } : undefined}>
                {cell.value}
              </p>
            </div>
          ))}
        </div>
      );
    }
    case "ytd_totals": {
      const y = ctx.slip.ytd;
      const c = ctx.slip.currency_code;
      return (
        <Section ctx={ctx} gap={gap} title={`Cumuls de l’année${y ? ` (${y.months} mois)` : ""}`}>
          {y ? (
            <div className="grid grid-cols-3 gap-2 font-mono">
              <KeyValue label="Brut cumulé" value={money(y.gross, c)} />
              <KeyValue label="Net cumulé" value={money(y.net, c)} />
              <KeyValue label="IGR cumulé" value={money(y.igr, c)} />
            </div>
          ) : (
            <p className="text-[#6B7371]">Disponible après le premier bulletin validé de l’année.</p>
          )}
        </Section>
      );
    }
    case "leave_balance": {
      const rows = ctx.slip.leave ?? [];
      return (
        <Section ctx={ctx} gap={gap} title="Solde de congés">
          {rows.length === 0 ? (
            <p className="text-[#6B7371]">Aucun solde de congés.</p>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="text-left text-[11px] text-[#6B7371]">
                  <th className="py-1 font-medium">Type</th>
                  <th className="py-1 text-right font-medium">Acquis</th>
                  <th className="py-1 text-right font-medium">Pris</th>
                  <th className="py-1 text-right font-medium">En attente</th>
                  <th className="py-1 text-right font-medium">Restant</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map((r) => (
                  <tr key={r.name} className="border-t border-[#E5E2D8]">
                    <td className="py-1 font-sans">{r.name}</td>
                    <td className="py-1 text-right">{r.entitled} j</td>
                    <td className="py-1 text-right">{r.used} j</td>
                    <td className="py-1 text-right">{r.pending} j</td>
                    <td className="py-1 text-right font-semibold" style={{ color: ctx.accent }}>{r.remaining} j</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>
      );
    }
    case "hours_summary":
      return (
        <Section ctx={ctx} gap={gap} title="Temps de travail">
          <div className="grid grid-cols-3 gap-2 font-mono">
            <KeyValue label="Heures prévues" value={`${Number(ctx.slip.expected_hours ?? 0).toFixed(1)} h`} />
            <KeyValue label="Heures réalisées" value={`${Number(ctx.slip.worked_hours ?? 0).toFixed(1)} h`} />
            <KeyValue label="Heures supplémentaires" value={`${Number(ctx.slip.overtime_hours ?? 0).toFixed(1)} h`} />
          </div>
        </Section>
      );
    case "payment_info": {
      const b = ctx.slip.bank;
      return (
        <Section ctx={ctx} gap={gap} title="Paiement">
          <div className="grid grid-cols-3 gap-2">
            <KeyValue label="Mode" value={b?.bank_account || b?.bank_rib ? "Virement bancaire" : "À définir"} />
            <KeyValue label="Banque" value={b?.bank_name || "—"} />
            <KeyValue label="Compte / RIB" value={b?.bank_rib || b?.bank_account || "—"} mono />
          </div>
        </Section>
      );
    }
    case "signatures":
      return (
        <div className={`${gap} grid grid-cols-2 gap-8`}>
          {[o.left || "L’employeur", o.right || "Le salarié"].map((label) => (
            <div key={label}>
              <p className="text-[11px] text-[#6B7371]">{label}</p>
              <div className="mt-10 border-t border-[#C9C5B8]" />
            </div>
          ))}
        </div>
      );
    case "free_text":
      return (
        <div className={gap}>
          {o.title ? <p className="font-semibold" style={{ color: ctx.accent }}>{o.title}</p> : null}
          <p className="whitespace-pre-line text-[#3A4442]">{o.text}</p>
        </div>
      );
    case "legal_footer":
      return <p className={`${gap} text-center text-[10px] text-[#8A918F]`}>{o.text}</p>;
    case "spacer":
      return <div style={{ height: o.size === "sm" ? 8 : o.size === "lg" ? 40 : 20 }} />;
    default:
      return null;
  }
}

function CompanyHeader({ ctx, o }: { ctx: Ctx; o: BlockOptions }) {
  const s = ctx.slip;
  const name = s.company_trade_name || s.company_name || "Entreprise";
  const address = [s.company_address, s.company_city, s.company_region].filter(Boolean).join(", ");
  const ids = [s.company_tax_id, s.company_registration_number].filter(Boolean).join(" · ");
  const logo =
    o.showLogo !== false && s.company_logo_url ? (
      <img src={s.company_logo_url} alt="" className="h-14 w-auto max-w-[160px] object-contain" />
    ) : null;

  if (o.align === "banner") {
    return (
      <div className="-mx-8 -mt-8 flex items-center gap-4 px-8 py-5 text-white print:mx-0 print:mt-0" style={{ background: ctx.accent }}>
        {logo ? <div className="rounded bg-white p-1.5">{logo}</div> : null}
        <div>
          <p className="text-lg font-bold" style={{ fontFamily: ctx.display }}>{name}</p>
          {address ? <p className="text-xs opacity-80">{address}</p> : null}
          {ids ? <p className="text-[11px] opacity-70">{ids}</p> : null}
        </div>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-4 ${o.align === "center" ? "flex-col text-center" : ""}`}>
      {logo}
      <div>
        <p className="text-lg font-bold" style={{ color: ctx.accent, fontFamily: ctx.display }}>{name}</p>
        {address ? <p className="text-xs text-[#6B7371]">{address}</p> : null}
        <p className="text-[11px] text-[#6B7371]">{[s.company_phone, s.company_email].filter(Boolean).join(" · ")}</p>
        {ids ? <p className="text-[11px] text-[#6B7371]">{ids}</p> : null}
      </div>
    </div>
  );
}

function EmployeeInfo({ ctx, o, gap }: { ctx: Ctx; o: BlockOptions; gap: string }) {
  const s = ctx.slip;
  return (
    <div className={`${gap} grid grid-cols-2 gap-x-6 gap-y-1 rounded-md bg-[#F6F4EE] p-4 sm:grid-cols-4`}>
      <KeyValue label="Salarié" value={s.employee_name} strong />
      <KeyValue label="Poste" value={s.job_title || "—"} />
      <KeyValue label="Service" value={s.department_name || "—"} />
      <KeyValue label="Matricule" value={s.employee_number || "—"} mono />
      {o.showBank ? (
        <>
          <KeyValue label="Banque" value={s.bank?.bank_name || "—"} />
          <KeyValue label="Compte" value={s.bank?.bank_account || s.bank?.bank_rib || "—"} mono />
        </>
      ) : null}
    </div>
  );
}

function NetHighlight({ ctx, o, gap }: { ctx: Ctx; o: BlockOptions; gap: string }) {
  const value = money(ctx.slip.net_amount, ctx.slip.currency_code);
  if (o.style === "line") {
    return (
      <div className={`${gap} flex items-center justify-between border-y-2 py-2 font-bold`} style={{ borderColor: ctx.accent }}>
        <span>NET À PAYER</span>
        <span className="font-mono text-lg" style={{ color: ctx.accent }}>{value}</span>
      </div>
    );
  }
  if (o.style === "banner") {
    return (
      <div className={`${gap} flex items-center justify-between rounded-lg px-6 py-4 text-white`} style={{ background: ctx.accent }}>
        <span className="text-xs uppercase tracking-[0.2em] opacity-80">Net à payer</span>
        <span className="text-3xl font-bold" style={{ fontFamily: ctx.display }}>{value}</span>
      </div>
    );
  }
  return (
    <div className={`${gap} flex justify-end`}>
      <div className="rounded-lg border-2 px-5 py-3 text-right" style={{ borderColor: ctx.accent }}>
        <p className="text-[10px] uppercase tracking-[0.16em] text-[#6B7371]">Net à payer</p>
        <p className="text-2xl font-bold" style={{ color: ctx.accent, fontFamily: ctx.display }}>{value}</p>
      </div>
    </div>
  );
}

function rateLabel(l: PayslipLine): string {
  if (l.calc_method === "igr_progressive") return "barème";
  if (l.calc_method.startsWith("percent")) return `${Number(l.rate_applied)} %`;
  if (l.calc_method === "overtime_hours") return `× ${Number(l.rate_applied)}`;
  if (l.calc_method === "worked_hours") return `${Math.round(Number(l.rate_applied))}/h`;
  return "—";
}

function LinesTable({
  ctx, gap, title, lines, showBaseRate, hideZero, totalLabel, total, negative, muted,
}: {
  ctx: Ctx;
  gap: string;
  title: string;
  lines: PayslipLine[];
  showBaseRate: boolean;
  hideZero: boolean;
  totalLabel: string;
  total: number;
  negative?: boolean;
  muted?: boolean;
}) {
  const c = ctx.slip.currency_code;
  const rows = lines.filter((l) => !l.is_hidden && (!hideZero || Number(l.amount) !== 0));
  return (
    <div className={gap}>
      <p className="mb-1 font-semibold" style={{ color: muted ? "#6B7371" : ctx.accent, fontFamily: ctx.display }}>{title}</p>
      <table className="w-full">
        <thead>
          <tr className="border-b text-left text-[11px] text-[#6B7371]" style={{ borderColor: ctx.accent }}>
            <th className="py-1.5 font-medium">Libellé</th>
            {showBaseRate ? <th className="py-1.5 text-right font-medium">Base</th> : null}
            {showBaseRate ? <th className="py-1.5 text-right font-medium">Taux</th> : null}
            <th className="py-1.5 text-right font-medium">Montant</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const showCols = showBaseRate && l.show_base_rate !== false;
            const hours = l.calc_method === "worked_hours" || l.calc_method === "overtime_hours";
            return (
              <tr key={l.id} className="border-b border-[#ECE9E0]">
                <td className="py-1.5">{l.label}</td>
                {showBaseRate ? (
                  <td className="py-1.5 text-right font-mono text-[#6B7371]">
                    {showCols ? (hours ? `${Number(l.basis_amount).toFixed(2)} h` : money(l.basis_amount, c)) : ""}
                  </td>
                ) : null}
                {showBaseRate ? (
                  <td className="py-1.5 text-right font-mono text-[#6B7371]">{showCols ? rateLabel(l) : ""}</td>
                ) : null}
                <td className="py-1.5 text-right font-mono">{money(negative ? -l.amount : l.amount, c)}</td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td className="py-1.5 text-[#8A918F]" colSpan={showBaseRate ? 4 : 2}>Aucune ligne</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <div className="mt-1.5 flex justify-between font-semibold">
        <span>{totalLabel}</span>
        <span className="font-mono">{money(negative ? -total : total, c)}</span>
      </div>
    </div>
  );
}

function Section({ ctx, gap, title, children }: { ctx: Ctx; gap: string; title: string; children: ReactNode }) {
  return (
    <div className={gap}>
      <p className="mb-1.5 font-semibold" style={{ color: ctx.accent, fontFamily: ctx.display }}>{title}</p>
      {children}
    </div>
  );
}

function KeyValue({ label, value, strong, mono }: { label: string; value: string; strong?: boolean; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-[#8A918F]">{label}</p>
      <p className={`truncate ${strong ? "font-semibold" : ""} ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
