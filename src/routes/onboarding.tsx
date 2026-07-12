import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { AnkibaPayLogo } from "@/components/brand/AnkibaPayLogo";
import { brand } from "@/lib/brand";
import { getAuthSession, isPlatformAdmin } from "@/lib/auth/auth.functions";
import { createCompany } from "@/modules/companies/company.functions";
import { CompanyForm } from "@/modules/companies/components/CompanyForm";
import type { CreateCompanyInput } from "@/modules/companies/schemas";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async () => {
    const session = await getAuthSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    // Platform admin skips company onboarding
    if (isPlatformAdmin(session) || session.profile?.company_id) {
      throw redirect({ to: "/" });
    }
    return { auth: session };
  },
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();

  const handleCreate = async (values: CreateCompanyInput) => {
    const result = await createCompany({ data: values });
    if (!result.ok) {
      throw new Error(result.message);
    }
    await navigate({ to: "/companies" });
  };

  return (
    <div className="relative min-h-screen bg-background px-4 py-10">
      <div
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          background:
            "radial-gradient(ellipse 70% 45% at 10% 0%, color-mix(in srgb, #0E4C56 28%, transparent), transparent), radial-gradient(ellipse 50% 40% at 100% 100%, color-mix(in srgb, #E8A93B 20%, transparent), transparent)",
        }}
      />
      <div className="relative mx-auto w-full max-w-2xl">
        <div className="mb-8 text-center">
          <AnkibaPayLogo variant="full" className="mx-auto h-12 w-auto" />
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-reef">
            {brand.tagline}
          </p>
        </div>

        <div className="card-elevated rounded-2xl p-6 sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-reef">Étape 1 / 1</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-primary sm:text-3xl">
            Configurez votre entreprise
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ces informations alimentent les contrats, bulletins de paie et ordres de virement.
            Vous serez automatiquement défini comme employeur de cette entreprise.
          </p>
          <div className="ridge-divider mt-4" aria-hidden />

          <div className="mt-6">
            <CompanyForm submitLabel="Créer mon entreprise" onSubmit={handleCreate} />
          </div>
        </div>
      </div>
    </div>
  );
}
