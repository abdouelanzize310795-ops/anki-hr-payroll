export type PlanPricing = {
  code: string;
  name: string;
  price_per_employee: number | null;
  seat_limit: number;
};

const CODE_BY_NAME: Record<string, string> = { Starter: "starter", Pro: "pro", Entreprise: "enterprise" };

/** From this limit on, a plan is presented as unlimited. */
const UNLIMITED_SEATS = 1_000_000;

/** Puts the current price and limit on a page's plan cards; the first feature is the limit. */
export function withPlanPricing<T extends { name: string; price: string; per: string; features: string[] }>(
  cards: T[],
  pricing: PlanPricing[],
): T[] {
  return cards.map((card) => {
    const row = pricing.find((p) => p.code === CODE_BY_NAME[card.name]);
    if (!row) return card;
    const quoted = row.price_per_employee == null;
    return {
      ...card,
      price: quoted ? "Sur devis" : new Intl.NumberFormat("fr-FR").format(Number(row.price_per_employee)),
      per: quoted ? "licence annuelle" : "KMF / employé / mois",
      features: [
        row.seat_limit >= UNLIMITED_SEATS
          ? "Employés illimités"
          : `Jusqu’à ${new Intl.NumberFormat("fr-FR").format(row.seat_limit)} employés`,
        ...card.features.slice(1),
      ],
    };
  });
}
