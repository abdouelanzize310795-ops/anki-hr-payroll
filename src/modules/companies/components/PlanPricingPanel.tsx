import { useCallback, useEffect, useState } from "react";
import { SectionCard } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listSubscriptionPlans, updateSubscriptionPlan } from "@/modules/companies/payment.functions";
import type { PlanPricing } from "@/modules/companies/plans";

function PlanRow({ plan, onSaved }: { plan: PlanPricing; onSaved: () => void }) {
  const [price, setPrice] = useState(plan.price_per_employee == null ? "" : String(Number(plan.price_per_employee)));
  const [limit, setLimit] = useState(String(plan.seat_limit));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await updateSubscriptionPlan({
        data: { code: plan.code, price: price.trim() === "" ? null : Number(price), seatLimit: Number(limit) },
      });
      setMessage(result.ok ? "Enregistré" : result.message);
      if (result.ok) onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-border py-3 first:border-0">
      <div className="w-28 font-medium">{plan.name}</div>
      <label className="text-xs text-muted-foreground">
        Prix par employé / mois (KMF)
        <Input
          type="number"
          min={0}
          className="mt-1 h-9 w-44"
          placeholder="Sur devis"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </label>
      <label className="text-xs text-muted-foreground">
        Limite d’employés
        <Input
          type="number"
          min={1}
          className="mt-1 h-9 w-32"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
        />
      </label>
      <Button size="sm" disabled={busy || Number(limit) < 1} onClick={() => void save()}>
        Enregistrer
      </Button>
      {message ? <span className="text-xs text-muted-foreground">{message}</span> : null}
    </div>
  );
}

export function PlanPricingPanel() {
  const [plans, setPlans] = useState<PlanPricing[]>([]);
  const load = useCallback(() => {
    listSubscriptionPlans().then(setPlans).catch(() => setPlans([]));
  }, []);
  useEffect(load, [load]);

  return (
    <SectionCard
      title="Prix des abonnements"
      description="S’applique aux nouveaux codes de paiement et aux pages publiques. Les codes déjà générés gardent leur montant. Prix vide = sur devis."
    >
      {plans.map((p) => (
        <PlanRow key={p.code} plan={p} onSaved={load} />
      ))}
    </SectionCard>
  );
}
