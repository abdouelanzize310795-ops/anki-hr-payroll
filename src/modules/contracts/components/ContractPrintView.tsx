import { Money } from "@/components/app/primitives";
import type { ContractDetail } from "@/modules/contracts/types";
import { contractTypeLabel } from "@/modules/contracts/types";
import { CompanyDocumentHeader } from "@/modules/companies/components/CompanyDocumentHeader";

export function ContractPrintView({ contract }: { contract: ContractDetail }) {
  return (
    <article className="contract-print rounded-2xl border border-border bg-card p-6 text-sm text-foreground sm:p-10 print:border-0 print:p-0 print:shadow-none">
      <CompanyDocumentHeader
        company={{
          legalName: contract.company_name || "Entreprise",
          tradeName: contract.company_trade_name,
          logoUrl: contract.company_logo_url,
          address: contract.company_address,
          city: contract.company_city,
          region: contract.company_region,
          phone: contract.company_phone,
          email: contract.company_email,
          taxId: contract.company_tax_id,
          registrationNumber: contract.company_registration_number,
        }}
        documentTitle="Contrat de travail"
        documentSubtitle={contractTypeLabel[contract.contract_type]}
        rightMeta={
          <p className="mt-1 text-xs text-muted-foreground">
            N° <span className="font-mono text-foreground">{contract.contract_number}</span>
          </p>
        }
      />

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
            <dd className="font-medium">
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

      <section className="mt-10 grid gap-8 sm:grid-cols-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-reef">Employeur</p>
          <p className="mt-6 font-medium">{contract.signed_by_employer_name || "________________"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {contract.signed_at ? `Signé le ${new Date(contract.signed_at).toLocaleDateString("fr-FR")}` : "Signature"}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-wider text-reef">Salarié</p>
          <p className="mt-6 font-medium">{contract.signed_by_employee_name || contract.employee_name || "________________"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {contract.signature_otp_hint
              ? `Preuve : ${contract.signature_otp_hint}`
              : "Signature"}
          </p>
        </div>
      </section>
    </article>
  );
}
