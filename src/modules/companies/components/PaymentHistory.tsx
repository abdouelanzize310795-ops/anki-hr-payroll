import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SectionCard } from "@/components/app/primitives";
import { adminReviewCompany } from "@/modules/admin/admin.functions";
import { listSubscriptionPayments, type SubscriptionPayment } from "@/modules/companies/payment.functions";
import { paymentMethodLabel } from "@/modules/companies/payment-methods";

const STATUS_LABEL: Record<SubscriptionPayment["status"], string> = {
  pending: "En attente",
  confirmed: "Confirmé",
  rejected: "Refusé",
  cancelled: "Remplacé",
};

export function formatKmf(value: number | string | null | undefined) {
  if (value == null) return "—";
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(value))} KMF`;
}

export function formatDay(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString("fr-FR") : "—";
}

function periodOf(p: SubscriptionPayment) {
  return p.period_start ? `${formatDay(p.period_start)} → ${formatDay(p.period_end)}` : "—";
}

function PaymentRow({ p, showCompany }: { p: SubscriptionPayment; showCompany?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border py-3 text-sm first:border-0">
      <div className="min-w-0">
        {showCompany ? <div className="font-medium">{p.company_name ?? "—"}</div> : null}
        <div className="font-mono text-xs">{p.reference ?? "—"}</div>
        <div className="text-xs text-muted-foreground">
          {formatDay(p.created_at)} · <span className="capitalize">{p.plan ?? "—"}</span>
          {p.payment_method ? ` · ${paymentMethodLabel(p.payment_method)}` : ""}
          {p.seats != null ? ` · ${p.seats} employé(s)` : ""} · Période : {periodOf(p)}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="font-mono font-semibold">
            {formatKmf(p.status === "confirmed" ? p.received_amount : p.expected_amount)}
          </div>
          <div className="text-xs text-muted-foreground">{STATUS_LABEL[p.status]}</div>
        </div>
        {p.status === "confirmed" ? (
          <Button variant="outline" size="sm" asChild>
            <Link to="/subscriptions/receipt/$paymentId" params={{ paymentId: p.id }}>
              Reçu
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function PaymentHistory({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<SubscriptionPayment[] | null>(null);
  useEffect(() => {
    listSubscriptionPayments({ data: { companyId } })
      .then(setRows)
      .catch(() => setRows([]));
  }, [companyId]);

  return (
    <div className="mt-6">
      <SectionCard title="Historique des paiements" description="Vos paiements d’abonnement et leurs reçus.">
        {rows == null ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun paiement pour le moment.</p>
        ) : (
          rows.map((p) => <PaymentRow key={p.id} p={p} />)
        )}
      </SectionCard>
    </div>
  );
}

function PendingPayment({ p, onDone }: { p: SubscriptionPayment; onDone: () => void }) {
  const [received, setReceived] = useState(p.expected_amount != null ? String(Number(p.expected_amount)) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const expected = p.expected_amount != null ? Number(p.expected_amount) : null;
  const amount = Number(received);
  const differs = received !== "" && expected != null && amount !== expected;

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await adminReviewCompany({
        data: { companyId: p.company_id, action: "approve", receivedAmount: received === "" ? null : amount },
      });
      if (result.ok) onDone();
      else setError(result.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-primary/30 p-3">
      <PaymentRow p={p} showCompany />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="number"
          min={0}
          className="h-9 w-40"
          aria-label="Montant reçu en KMF"
          placeholder="Montant reçu"
          value={received}
          onChange={(e) => setReceived(e.target.value)}
        />
        <Button size="sm" disabled={busy || (received === "" && expected == null)} onClick={() => void confirm()}>
          Confirmer et ajouter 1 mois
        </Button>
      </div>
      {differs ? (
        <p className="mt-2 text-xs text-destructive">
          Différence de {formatKmf(amount - (expected ?? 0))} avec le montant attendu ({formatKmf(expected)}).
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function AdminPaymentsPanel() {
  const [rows, setRows] = useState<SubscriptionPayment[]>([]);
  const load = useCallback(() => {
    listSubscriptionPayments({ data: {} }).then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);

  const pending = rows.filter((p) => p.status === "pending");
  const others = rows.filter((p) => p.status === "confirmed" || p.status === "rejected");

  return (
    <SectionCard title="Paiements d’abonnement" description="Comparez le montant reçu au montant attendu avant de confirmer.">
      <div className="space-y-3">
        {pending.map((p) => (
          <PendingPayment key={p.id} p={p} onDone={load} />
        ))}
      </div>
      {others.map((p) => (
        <PaymentRow key={p.id} p={p} showCompany />
      ))}
      {rows.length === 0 ? <p className="text-sm text-muted-foreground">Aucun paiement enregistré.</p> : null}
    </SectionCard>
  );
}
