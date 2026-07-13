import { useState } from "react";
import { Copy, Check, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SUBSCRIPTION_SUPPORT,
  getPaymentMethod,
  type SubscriptionPaymentMethod,
} from "@/modules/companies/payment-methods";

type Props = {
  paymentReference: string;
  paymentMethod?: string | null;
  planLabel?: string | null;
  compact?: boolean;
};

export function SubscriptionPaymentInstructions({
  paymentReference,
  paymentMethod = "mvola",
  planLabel,
  compact = false,
}: Props) {
  const [copied, setCopied] = useState(false);
  const pay = getPaymentMethod(paymentMethod as SubscriptionPaymentMethod);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(paymentReference);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className={
        compact
          ? "space-y-3 text-sm"
          : "space-y-4 rounded-2xl border border-primary/25 bg-primary-soft/30 p-5 text-sm"
      }
    >
      {!compact && (
        <div className="flex flex-wrap items-start gap-3">
          {pay.logoSrc ? (
            <img
              src={pay.logoSrc}
              alt={pay.logoAlt ?? pay.methodLabel}
              className="h-12 w-auto rounded-lg object-contain shadow-sm"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-semibold">
              Paiement via {pay.methodLabel}
            </h3>
            <p className="mt-1 text-muted-foreground">
              Effectuez un transfert vers le compte AnkibaPay, puis placez le code unique dans
              la <strong>description du transfert</strong>.
              {planLabel ? (
                <>
                  {" "}
                  Plan sélectionné : <strong className="capitalize">{planLabel}</strong>.
                </>
              ) : null}
            </p>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Code unique à coller dans la description
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="font-mono text-lg font-bold tracking-wide text-primary">
            {paymentReference}
          </code>
          <Button type="button" size="sm" variant="outline" onClick={() => void copyCode()}>
            {copied ? <Check className="mr-1 h-3.5 w-3.5" /> : <Copy className="mr-1 h-3.5 w-3.5" />}
            {copied ? "Copié" : "Copier"}
          </Button>
        </div>
      </div>

      <dl className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card/80 px-3 py-2">
          <dt className="text-xs text-muted-foreground">{pay.accountNameLabel}</dt>
          <dd className="font-medium">{pay.accountName}</dd>
        </div>
        <div className="rounded-lg border border-border bg-card/80 px-3 py-2">
          <dt className="text-xs text-muted-foreground">{pay.accountNumberLabel}</dt>
          <dd className="font-mono font-medium">{pay.accountNumber}</dd>
        </div>
      </dl>

      <ol className="list-decimal space-y-1.5 pl-5 text-muted-foreground">
        <li>{pay.openAppHint}</li>
        <li>
          Destinataire : <strong className="text-foreground">{pay.accountName}</strong> —{" "}
          <strong className="text-foreground">{pay.accountNumber}</strong>.
        </li>
        <li>
          Dans la description, collez exactement :{" "}
          <strong className="font-mono text-foreground">{paymentReference}</strong>.
        </li>
        <li>
          Un administrateur AnkibaPay active votre entreprise sous{" "}
          <strong className="text-foreground">
            {SUBSCRIPTION_SUPPORT.activationSlaHours}&nbsp;h
          </strong>{" "}
          après réception du paiement.
        </li>
      </ol>

      <p className="text-muted-foreground">
        En cas de retard, contactez le service client via WhatsApp au{" "}
        <strong className="text-foreground">{SUBSCRIPTION_SUPPORT.whatsappLocal}</strong>.
      </p>

      <Button variant="outline" size="sm" asChild>
        <a href={SUBSCRIPTION_SUPPORT.whatsappUrl} target="_blank" rel="noreferrer">
          <MessageCircle className="mr-1.5 h-4 w-4" />
          WhatsApp {SUBSCRIPTION_SUPPORT.whatsappLocal}
        </a>
      </Button>
    </div>
  );
}

/** @deprecated Use SubscriptionPaymentInstructions */
export const MvolaPaymentInstructions = SubscriptionPaymentInstructions;
