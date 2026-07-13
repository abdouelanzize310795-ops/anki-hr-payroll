import { createFileRoute, getRouteApi, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, CreditCard, Users } from "lucide-react";
import { listCompanies, markSubscriptionPaid } from "@/modules/companies/company.functions";
import { listEmployees } from "@/modules/employees/employee.functions";
import { isCompanyApproved, isPlatformAdmin } from "@/lib/auth/auth.functions";
import {
  companyApprovalLabel,
  companySubscriptionLabel,
} from "@/modules/companies/types";
import { SubscriptionPaymentInstructions } from "@/modules/companies/components/MvolaPaymentInstructions";
import {
  PAYMENT_METHODS,
  SUBSCRIPTION_SUPPORT,
  paymentMethodLabel,
  type SubscriptionPaymentMethod,
} from "@/modules/companies/payment-methods";

export const Route = createFileRoute("/_app/subscriptions")({
  component: SubscriptionsPage,
});

const appRouteApi = getRouteApi("/_app");

const plans = [
  {
    id: "starter" as const,
    name: "Starter",
    price: "2 500",
    per: "KMF / employé / mois",
    features: ["Jusqu’à 25 employés", "RH de base", "Paie simple", "Support e-mail"],
    cta: "Choisir Starter",
  },
  {
    id: "pro" as const,
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
    cta: "Choisir Pro",
  },
  {
    id: "enterprise" as const,
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
    cta: "Choisir Entreprise",
  },
];

function SubscriptionsPage() {
  const { auth } = appRouteApi.useRouteContext();
  const navigate = useNavigate();
  const admin = isPlatformAdmin(auth);
  const approved = isCompanyApproved(auth);
  const companyId = auth.profile?.company_id ?? undefined;

  const [headcount, setHeadcount] = useState<number | null>(null);
  const [tenants, setTenants] = useState<number | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<SubscriptionPaymentMethod>(
    (auth.company?.payment_method as SubscriptionPaymentMethod) === "poketra"
      ? "poketra"
      : "mvola",
  );
  const [paymentCode, setPaymentCode] = useState<string | null>(
    auth.company?.payment_reference ?? null,
  );
  const [selectedPlan, setSelectedPlan] = useState<string | null>(
    auth.company?.subscription_plan ?? null,
  );
  const [savedMethod, setSavedMethod] = useState<string | null>(
    auth.company?.payment_method ?? null,
  );

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

  const estimate = headcount != null ? headcount * 4500 : null;
  const currentPlan = auth.company?.subscription_plan;

  const handleChoosePlan = async (plan: "starter" | "pro" | "enterprise") => {
    if (!companyId) {
      setError("Aucune entreprise liée à votre compte");
      return;
    }
    setBusyPlan(plan);
    setError(null);
    setSuccess(null);
    try {
      const result = await markSubscriptionPaid({
        data: { companyId, plan, paymentMethod },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const code = result.data.payment_reference;
      setPaymentCode(code);
      setSelectedPlan(result.data.subscription_plan);
      setSavedMethod(result.data.payment_method ?? paymentMethod);
      setSuccess(
        result.data.approval_status === "approved"
          ? "Abonnement mis à jour."
          : code
            ? `Plan ${plan} · ${paymentMethodLabel(paymentMethod)}. Code : ${code}.`
            : "Plan sélectionné.",
      );
      if (result.data.approval_status === "pending_approval") {
        window.location.href = "/company-access";
        return;
      }
      if (result.data.approval_status === "approved") {
        window.location.href = "/";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sélection impossible");
    } finally {
      setBusyPlan(null);
    }
  };

  return (
    <>
      <PageHeader
        badge="Facturation"
        title="Abonnements"
        description={
          approved
            ? "Gérez votre plan AnkibaPay."
            : `Choisissez un plan, payez via M'Vola ou Poketra EXIM BANK, puis activation sous ${SUBSCRIPTION_SUPPORT.activationSlaHours} h.`
        }
      />

      {!admin && auth.company && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
          <span className="font-medium">{auth.company.legal_name}</span>
          <StatusPill status={companyApprovalLabel[auth.company.approval_status]} />
          <StatusPill status={companySubscriptionLabel[auth.company.subscription_status]} />
          {currentPlan && (
            <Badge variant="outline" className="capitalize">
              Plan {currentPlan}
            </Badge>
          )}
          {auth.company.payment_method && (
            <Badge variant="outline">{paymentMethodLabel(auth.company.payment_method)}</Badge>
          )}
          {auth.company.payment_reference && (
            <Badge variant="outline" className="font-mono">
              {auth.company.payment_reference}
            </Badge>
          )}
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {success && (
        <p className="mb-4 rounded-lg border border-primary/30 bg-primary-soft/40 px-3 py-2 text-sm text-primary">
          {success}
        </p>
      )}

      {!admin && !approved && (
        <div className="mb-6">
          <SectionCard
            title="Mode de paiement"
            description="Choisissez M'Vola ou Poketra avant de sélectionner un plan."
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {PAYMENT_METHODS.map((m) => {
                const selected = paymentMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setPaymentMethod(m.id)}
                    className={`flex items-center gap-3 rounded-xl border p-4 text-left transition-colors ${
                      selected
                        ? "border-primary bg-primary-soft/50 ring-1 ring-primary"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                  {m.logoSrc ? (
                    <img
                      src={m.logoSrc}
                      alt={m.logoAlt ?? m.methodLabel}
                      className="h-12 w-12 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="grid h-12 w-12 place-items-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">
                      {m.id.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                    <div>
                      <div className="font-medium">{m.methodLabel}</div>
                      <div className="text-xs text-muted-foreground">
                        Compte {m.accountNumber} · {m.accountName}
                      </div>
                    </div>
                    {selected && <Check className="ml-auto h-5 w-5 shrink-0 text-primary" />}
                  </button>
                );
              })}
            </div>
          </SectionCard>
        </div>
      )}

      {(paymentCode || auth.company?.payment_reference) && !approved && (
        <div className="mb-6">
          <SubscriptionPaymentInstructions
            paymentReference={paymentCode ?? auth.company!.payment_reference!}
            paymentMethod={savedMethod ?? paymentMethod}
            planLabel={selectedPlan ?? currentPlan}
          />
        </div>
      )}

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
        {plans.map((p) => {
          const isCurrent = currentPlan === p.id && auth.company?.subscription_status === "active";
          return (
            <div
              key={p.id}
              className={`relative rounded-2xl border p-6 ${
                p.featured
                  ? "border-primary bg-primary-soft/40 shadow-glow"
                  : "border-border bg-card"
              }`}
            >
              {(p.featured || isCurrent) && (
                <Badge className="absolute right-4 top-4 border-0 bg-gold text-gold-foreground">
                  <Sparkles className="mr-1 h-3 w-3" />
                  {isCurrent ? "Actuel" : "Recommandé"}
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
                variant={p.featured ? "default" : "outline"}
                disabled={admin || !companyId || busyPlan !== null || isCurrent}
                onClick={() => void handleChoosePlan(p.id)}
              >
                {busyPlan === p.id
                  ? "Génération du code…"
                  : isCurrent
                    ? "Plan actuel"
                    : p.cta}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="mt-6">
        <SectionCard
          title="Paiement & activation"
          description={`M'Vola ou Poketra → activation admin sous ${SUBSCRIPTION_SUPPORT.activationSlaHours} h.`}
        >
          <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {auth.company?.payment_reference
                ? `Code ${auth.company.payment_reference} (${paymentMethodLabel(auth.company.payment_method)}) — en attente d’activation.`
                : "Choisissez le mode de paiement puis un plan pour générer votre code unique."}
            </span>
            <StatusPill
              status={
                auth.company?.subscription_status === "active"
                  ? "Actif"
                  : auth.company?.subscription_status === "pending"
                    ? "En attente"
                    : "À choisir"
              }
            />
          </div>
          {auth.company?.payment_reference && !approved && (
            <div className="mt-4">
              <Button variant="outline" onClick={() => void navigate({ to: "/company-access" })}>
                Voir les instructions de paiement
              </Button>
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}
