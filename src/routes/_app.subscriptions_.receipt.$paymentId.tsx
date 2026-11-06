import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDay, formatKmf } from "@/modules/companies/components/PaymentHistory";
import { getPaymentReceipt, type PaymentReceipt } from "@/modules/companies/payment.functions";
import { paymentMethodLabel } from "@/modules/companies/payment-methods";

export const Route = createFileRoute("/_app/subscriptions_/receipt/$paymentId")({
  component: ReceiptPage,
});

function ReceiptPage() {
  const { paymentId } = Route.useParams();
  const [receipt, setReceipt] = useState<PaymentReceipt | null | undefined>(undefined);

  useEffect(() => {
    getPaymentReceipt({ data: { id: paymentId } })
      .then(setReceipt)
      .catch(() => setReceipt(null));
  }, [paymentId]);

  if (receipt === undefined) return <p className="text-sm text-muted-foreground">Chargement…</p>;
  if (receipt === null) return <p className="text-sm text-muted-foreground">Reçu introuvable.</p>;

  const { payment: p, company } = receipt;
  const rows: Array<[string, string]> = [
    ["Date de confirmation", formatDay(p.confirmed_at)],
    ["Référence du paiement", p.reference ?? "—"],
    ["Mode de paiement", p.payment_method ? paymentMethodLabel(p.payment_method) : "—"],
    ["Formule", p.plan ?? "—"],
    ["Employés couverts", p.seats != null ? String(p.seats) : "—"],
    ["Période couverte", `${formatDay(p.period_start)} → ${formatDay(p.period_end)}`],
  ];

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex justify-between print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/subscriptions">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Retour
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="mr-1.5 h-4 w-4" />
          Imprimer / PDF
        </Button>
      </div>
      <div className="rounded-2xl border border-border bg-card p-8 print:border-0">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-primary">Reçu de paiement</h1>
            <p className="font-mono text-sm">{p.receipt_number}</p>
          </div>
          <div className="text-right text-sm">
            <div className="font-semibold">Mshahara</div>
            <div className="text-muted-foreground">contact@mshahara.online</div>
          </div>
        </div>
        <div className="mt-6 text-sm">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Reçu de</div>
          <div className="font-semibold">{company?.legal_name ?? "—"}</div>
          {company?.address_line1 ? <div>{company.address_line1}</div> : null}
          {company?.city ? <div>{company.city}</div> : null}
          {company?.tax_id ? <div>NIF : {company.tax_id}</div> : null}
        </div>
        <dl className="mt-6 text-sm">
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-t border-border py-2">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="text-right font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex items-baseline justify-between rounded-xl bg-primary-soft/40 p-4">
          <span className="font-semibold">Montant reçu</span>
          <span className="font-mono text-2xl font-bold text-primary">{formatKmf(p.received_amount)}</span>
        </div>
      </div>
    </div>
  );
}
