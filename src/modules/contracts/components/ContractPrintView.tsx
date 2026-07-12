import { Money } from "@/components/app/primitives";
import type { ContractDetail } from "@/modules/contracts/types";
import { contractTypeLabel } from "@/modules/contracts/types";
import { brand } from "@/lib/brand";

export function ContractPrintView({ contract }: { contract: ContractDetail }) {
  return (
    <article className="contract-print rounded-2xl border border-border bg-card p-6 text-sm text-foreground sm:p-10 print:border-0 print:p-0 print:shadow-none">
      <header className="border-b border-border pb-6">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-reef">{brand.tagline}</p>
        <h2 className="mt-2 font-display text-2xl font-bold text-primary">
          Contrat de travail — {contractTypeLabel[contract.contract_type]}
        </h2>
        <p className="mt-1 text-muted-foreground">
          N° <span className="font-mono text-foreground">{contract.contract_number}</span>
        </p>
      </header>

      <section className="mt-6 grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-reef">Employeur</h3>
          <p className="mt-2 font-semibold">{contract.company_name}</p>
          <p className="text-muted-foreground">
            {[contract.company_address, contract.company_city, contract.company_region]
              .filter(Boolean)
              .join(", ") || "—"}
          </p>
          {contract.company_tax_id && (
            <p className="mt-1 font-mono text-xs">NIF : {contract.company_tax_id}</p>
          )}
        </div>
        <div>
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-reef">Salarié</h3>
          <p className="mt-2 font-semibold">{contract.employee_name}</p>
          <p className="text-muted-foreground">{contract.employee_email || "—"}</p>
          <p className="text-muted-foreground">{contract.employee_phone || ""}</p>
          {contract.employee_national_id && (
            <p className="mt-1 font-mono text-xs">Pièce : {contract.employee_national_id}</p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-reef">Conditions</h3>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-muted/40 px-4 py-3">
            <dt className="text-xs text-muted-foreground">Poste</dt>
            <dd className="font-medium">{contract.job_title}</dd>
          </div>
          <div className="rounded-xl bg-muted/40 px-4 py-3">
            <dt className="text-xs text-muted-foreground">Département</dt>
            <dd className="font-medium">{contract.department_name || "—"}</dd>
          </div>
          <div className="rounded-xl bg-muted/40 px-4 py-3">
            <dt className="text-xs text-muted-foreground">Début</dt>
            <dd className="font-medium">{contract.start_date}</dd>
          </div>
          <div className="rounded-xl bg-muted/40 px-4 py-3">
            <dt className="text-xs text-muted-foreground">Fin</dt>
            <dd className="font-medium">{contract.end_date || "Indéterminée"}</dd>
          </div>
          <div className="rounded-xl bg-muted/40 px-4 py-3">
            <dt className="text-xs text-muted-foreground">Salaire de base</dt>
            <dd className="font-display text-lg font-bold">
              <Money value={contract.base_salary} currency={contract.currency_code} />
            </dd>
          </div>
          <div className="rounded-xl bg-muted/40 px-4 py-3">
            <dt className="text-xs text-muted-foreground">Temps de travail</dt>
            <dd className="font-medium">
              {contract.work_days_per_week} j / sem · {contract.hours_per_week} h
            </dd>
          </div>
        </dl>
      </section>

      {contract.benefits && (
        <section className="mt-8">
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-reef">Avantages</h3>
          <p className="mt-2 whitespace-pre-wrap text-muted-foreground">{contract.benefits}</p>
        </section>
      )}

      {contract.clauses && (
        <section className="mt-8">
          <h3 className="font-mono text-[10px] uppercase tracking-wider text-reef">Clauses</h3>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed text-muted-foreground">{contract.clauses}</p>
        </section>
      )}

      <section className="mt-10 grid gap-8 border-t border-border pt-8 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">L’employeur</p>
          <p className="mt-6 font-medium">{contract.signed_by_employer_name || "________________"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {contract.signed_at ? `Signé le ${new Date(contract.signed_at).toLocaleDateString("fr-FR")}` : "Signature"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Le salarié</p>
          <p className="mt-6 font-medium">{contract.signed_by_employee_name || contract.employee_name || "________________"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {contract.signature_otp_hint
              ? `Preuve : ${contract.signature_otp_hint}`
              : "Signature"}
          </p>
        </div>
      </section>

      <footer className="mt-8 text-center font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Document généré par AnkibaPay — valeur probante sous réserve du cadre légal comorien
      </footer>
    </article>
  );
}
