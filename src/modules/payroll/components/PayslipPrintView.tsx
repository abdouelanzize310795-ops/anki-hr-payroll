import { AnkibaPayLogo } from "@/components/brand/AnkibaPayLogo";
import { Money } from "@/components/app/primitives";
import type { PayslipDetail } from "@/modules/payroll/types";

export function PayslipPrintView({ slip }: { slip: PayslipDetail }) {
  const earnings = slip.lines.filter((l) => l.kind === "earning");
  const deductions = slip.lines.filter((l) => l.kind === "deduction");
  const employer = slip.lines.filter((l) => l.kind === "employer_contribution");

  return (
    <div className="payslip-print mx-auto max-w-3xl bg-[var(--color-background)] p-8 text-[var(--color-foreground)] print:max-w-none print:p-0">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--color-border)] pb-6">
        <div>
          <AnkibaPayLogo className="h-10 w-auto" />
          <p className="mt-3 font-display text-lg font-semibold">{slip.company_name}</p>
          <p className="text-xs text-muted-foreground">
            {[slip.company_address, slip.company_city].filter(Boolean).join(" · ")}
          </p>
          {slip.company_tax_id && (
            <p className="font-mono text-[10px] text-muted-foreground">NIF {slip.company_tax_id}</p>
          )}
        </div>
        <div className="text-right">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Bulletin de paie
          </p>
          <p className="font-display text-xl font-bold">{slip.period_label}</p>
          <p className="font-mono text-xs text-muted-foreground">{slip.payslip_number}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {slip.period_start} → {slip.period_end}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Salarié</p>
          <p className="font-display text-lg font-semibold">{slip.employee_name}</p>
          <p className="text-sm text-muted-foreground">{slip.job_title}</p>
          {slip.department_name && (
            <p className="text-xs text-muted-foreground">{slip.department_name}</p>
          )}
          {slip.employee_number && (
            <p className="font-mono text-xs text-muted-foreground">{slip.employee_number}</p>
          )}
        </div>
        <div className="rounded-xl bg-[var(--color-muted)]/40 p-4 sm:text-right">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Net à payer</p>
          <p className="font-display text-3xl font-bold tracking-tight">
            <Money value={slip.net_amount} currency={slip.currency_code} />
          </p>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="font-display text-sm font-semibold">Gains</h3>
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--color-border)] text-left text-xs text-muted-foreground">
              <th className="py-2 font-medium">Libellé</th>
              <th className="py-2 font-medium">Base</th>
              <th className="py-2 font-medium">Taux</th>
              <th className="py-2 text-right font-medium">Montant</th>
            </tr>
          </thead>
          <tbody>
            {earnings.map((l) => (
              <tr key={l.id} className="border-b border-[var(--color-border)]/60">
                <td className="py-2">{l.label}</td>
                <td className="py-2 font-mono text-xs">
                  <Money value={l.basis_amount} currency={slip.currency_code} />
                </td>
                <td className="py-2 font-mono text-xs">
                  {l.calc_method.startsWith("percent") ? `${l.rate_applied} %` : "—"}
                </td>
                <td className="py-2 text-right font-mono">
                  <Money value={l.amount} currency={slip.currency_code} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-2 flex justify-between text-sm font-semibold">
          <span>Brut</span>
          <Money value={slip.gross_amount} currency={slip.currency_code} />
        </div>
      </div>

      {deductions.length > 0 && (
        <div className="mt-6">
          <h3 className="font-display text-sm font-semibold">Retenues</h3>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {deductions.map((l) => (
                <tr key={l.id} className="border-b border-[var(--color-border)]/60">
                  <td className="py-2">{l.label}</td>
                  <td className="py-2 font-mono text-xs text-muted-foreground">
                    {l.calc_method.startsWith("percent") ? `${l.rate_applied} %` : "fixe"}
                  </td>
                  <td className="py-2 text-right font-mono">
                    − <Money value={l.amount} currency={slip.currency_code} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 flex justify-between text-sm font-semibold">
            <span>Total retenues</span>
            <span>
              − <Money value={slip.deduction_amount} currency={slip.currency_code} />
            </span>
          </div>
        </div>
      )}

      {employer.length > 0 && (
        <div className="mt-6">
          <h3 className="font-display text-sm font-semibold">Charges patronales (info)</h3>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {employer.map((l) => (
                <tr key={l.id} className="border-b border-[var(--color-border)]/60">
                  <td className="py-2">{l.label}</td>
                  <td className="py-2 font-mono text-xs text-muted-foreground">
                    {l.calc_method.startsWith("percent") ? `${l.rate_applied} %` : "fixe"}
                  </td>
                  <td className="py-2 text-right font-mono">
                    <Money value={l.amount} currency={slip.currency_code} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-10 text-center text-[10px] text-muted-foreground">
        Document généré par AnkibaPay — les taux appliqués sont ceux paramétrés par l’employeur.
        Aucun taux légal n’est imposé par le logiciel.
      </p>
    </div>
  );
}
