import { createFileRoute, getRouteApi, Link, redirect } from "@tanstack/react-router";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Clock, CreditCard, ShieldCheck, XCircle } from "lucide-react";
import { isCompanyApproved, isPlatformAdmin } from "@/lib/auth/auth.functions";
import {
  companyApprovalLabel,
  companySubscriptionLabel,
} from "@/modules/companies/types";
import { SubscriptionPaymentInstructions } from "@/modules/companies/components/MvolaPaymentInstructions";
import {
  SUBSCRIPTION_SUPPORT,
  paymentMethodLabel,
} from "@/modules/companies/payment-methods";

export const Route = createFileRoute("/_app/company-access")({
  beforeLoad: ({ context }) => {
    if (isPlatformAdmin(context.auth) || isCompanyApproved(context.auth)) {
      throw redirect({ to: "/" });
    }
  },
  component: CompanyAccessPage,
});

const appRouteApi = getRouteApi("/_app");

function CompanyAccessPage() {
  const { auth } = appRouteApi.useRouteContext();
  const company = auth.company;

  const status = company?.approval_status ?? "pending_payment";

  return (
    <>
      <PageHeader
        badge="Accès"
        title="Validation de votre entreprise"
        description={`Payez via M'Vola ou Poketra EXIM BANK avec votre code unique. Activation sous ${SUBSCRIPTION_SUPPORT.activationSlaHours} h.`}
      />

      <div className="mx-auto max-w-2xl space-y-4">
        <SectionCard
          title={company?.legal_name ?? "Votre entreprise"}
          description="État du dossier"
        >
          <div className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Validation</span>
              <StatusPill
                status={
                  companyApprovalLabel[status as keyof typeof companyApprovalLabel] ?? status
                }
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Abonnement</span>
              <StatusPill
                status={
                  company
                    ? companySubscriptionLabel[company.subscription_status]
                    : "Aucun"
                }
              />
            </div>
            {company?.subscription_plan && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium capitalize">{company.subscription_plan}</span>
              </div>
            )}
            {company?.payment_method && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Paiement</span>
                <span className="font-medium">{paymentMethodLabel(company.payment_method)}</span>
              </div>
            )}
            {company?.payment_reference && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Code unique</span>
                <span className="font-mono font-semibold text-primary">
                  {company.payment_reference}
                </span>
              </div>
            )}
          </div>
        </SectionCard>

        {status === "pending_payment" && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <CreditCard className="mb-3 h-8 w-8 text-primary" />
            <h2 className="font-display text-lg font-semibold">Choisissez un abonnement</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Sélectionnez M&apos;Vola ou Poketra, puis un plan pour générer votre code unique de
              paiement.
            </p>
            <Button className="mt-4" asChild>
              <Link to="/subscriptions">Choisir un abonnement</Link>
            </Button>
          </div>
        )}

        {status === "pending_approval" && (
          <div className="space-y-4">
            {company?.payment_reference ? (
              <SubscriptionPaymentInstructions
                paymentReference={company.payment_reference}
                paymentMethod={company.payment_method}
                planLabel={company.subscription_plan}
              />
            ) : null}
            <div className="rounded-2xl border border-border bg-card p-6">
              <Clock className="mb-3 h-8 w-8 text-gold" />
              <h2 className="font-display text-lg font-semibold">
                Activation sous {SUBSCRIPTION_SUPPORT.activationSlaHours}&nbsp;h
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Après votre transfert (avec le code dans la description), un administrateur
                plateforme active votre entreprise. En cas de retard, contactez le service client
                WhatsApp au {SUBSCRIPTION_SUPPORT.whatsappLocal}.
              </p>
              <Button className="mt-4" variant="outline" asChild>
                <Link to="/subscriptions">Voir l’abonnement</Link>
              </Button>
            </div>
          </div>
        )}

        {status === "rejected" && (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
            <XCircle className="mb-3 h-8 w-8 text-destructive" />
            <h2 className="font-display text-lg font-semibold">Demande refusée</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {company?.rejection_reason ||
                "L’administrateur a refusé la création de cette entreprise."}
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Contactez le support WhatsApp au {SUBSCRIPTION_SUPPORT.whatsappLocal}.
            </p>
            <Button className="mt-4" variant="outline" asChild>
              <a href={SUBSCRIPTION_SUPPORT.whatsappUrl} target="_blank" rel="noreferrer">
                Contacter WhatsApp
              </a>
            </Button>
          </div>
        )}

        {status === "approved" && (
          <div className="rounded-2xl border border-border bg-card p-6">
            <ShieldCheck className="mb-3 h-8 w-8 text-primary" />
            <h2 className="font-display text-lg font-semibold">Compte validé</h2>
            <Button className="mt-4" asChild>
              <Link to="/">Accéder au tableau de bord</Link>
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
