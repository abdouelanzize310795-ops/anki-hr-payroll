import { createFileRoute, getRouteApi } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, CreditCard, Users } from "lucide-react";
import { listCompanies } from "@/modules/companies/company.functions";
import { listEmployees } from "@/modules/employees/employee.functions";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/_app/subscriptions")({
  component: SubscriptionsPage,
});

const appRouteApi = getRouteApi("/_app");

const plans = [
  {
    name: "Starter",
    price: "2 500",
    per: "KMF / employé / mois",
    features: ["Jusqu’à 25 employés", "RH de base", "Paie simple", "Support e-mail"],
    cta: "Plan d’entrée",
  },
  {
    name: "Pro",
    price: "4 500",
    per: "KMF / employé / mois",
    featured: true,
    features: [
      "Jusqu’à 500 employés",
      "RH + paie + virements",
      "Assistant AnkibaPay",
      "Support prioritaire",
      "Multi-entreprises",
    ],
    cta: "Plan actuel (démo)",
  },
  {
    name: "Entreprise",
    price: "Sur devis",
    per: "licence annuelle",
    features: [
      "Employés illimités",
      "CSM dédié",
      "SSO",
      "Intégrations sur mesure",
      "SLA 99,9 %",
    ],
    cta: "Nous contacter",
  },
];

function SubscriptionsPage() {
  const { auth } = appRouteApi.useRouteContext();
  const admin = isPlatformAdmin(auth);
  const companyId = auth.profile?.company_id ?? undefined;

  const [headcount, setHeadcount] = useState<number | null>(null);
  const [tenants, setTenants] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      if (admin) {
        const companies = await listCompanies();
        setTenants(companies.length);
        let total = 0;
        for (const c of companies.slice(0, 20)) {
          const emps = await listEmployees({
            data: { companyId: c.id, status: "active" },
          });
          total += emps.length;
        }
        setHeadcount(total);
      } else if (companyId) {
        const emps = await listEmployees({
          data: { companyId, status: "active" },
        });
        setHeadcount(emps.length);
        setTenants(1);
      }
    })();
  }, [admin, companyId]);

  const estimate =
    headcount != null ? headcount * 4500 : null;

  return (
    <>
      <PageHeader
        badge="Facturation"
        title="Abonnements"
        description="Plans AnkibaPay en KMF — facturation Stripe à brancher plus tard."
        actions={
          <Button size="sm" variant="outline" disabled>
            <CreditCard className="mr-1.5 h-4 w-4" />
            Moyen de paiement
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Effectif facturable"
          value={headcount == null ? "…" : String(headcount)}
          icon={Users}
          accent="primary"
        />
        <StatCard
          label="Entreprises"
          value={tenants == null ? "…" : String(tenants)}
          icon={CreditCard}
          accent="gold"
        />
        <StatCard
          label="Estim. Pro / mois"
          value={
            estimate == null
              ? "…"
              : new Intl.NumberFormat("fr-KM", { maximumFractionDigits: 0 }).format(estimate)
          }
          icon={Sparkles}
          accent="success"
          deltaLabel="KMF"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <div
            key={p.name}
            className={`relative rounded-2xl border p-6 ${
              p.featured
                ? "border-primary bg-primary-soft/40 shadow-glow"
                : "border-border bg-card"
            }`}
          >
            {p.featured && (
              <Badge className="absolute right-4 top-4 border-0 bg-gold text-gold-foreground">
                <Sparkles className="mr-1 h-3 w-3" />
                Actuel
              </Badge>
            )}
            <div className="font-display text-lg font-bold">{p.name}</div>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="font-display text-3xl font-bold">{p.price}</span>
              <span className="text-xs text-muted-foreground">{p.per}</span>
            </div>
            <ul className="mt-5 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <Button
              className="mt-6 w-full"
              variant={p.featured ? "outline" : "default"}
              disabled
            >
              {p.cta}
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <SectionCard
          title="Factures"
          description="Historique de facturation — bientôt synchronisé avec Stripe."
        >
          <div className="flex items-center justify-between rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">
            <span>Aucune facture générée (mode démo).</span>
            <StatusPill status="Brouillon" />
          </div>
        </SectionCard>
      </div>
    </>
  );
}
