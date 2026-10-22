import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MshaharaLogo } from "@/components/brand/MshaharaLogo";
import { brand } from "@/lib/brand";
import { getAuthSession, isPlatformAdmin } from "@/lib/auth/auth.functions";
import { createCompany } from "@/modules/companies/company.functions";
import { CompanyForm, type CompanyFormSubmit } from "@/modules/companies/components/CompanyForm";
import { uploadCompanyLogoFile } from "@/modules/companies/upload-logo";
import { TemplatePicker } from "@/modules/payroll/components/TemplatePicker";
import { listPayslipTemplates, setCompanyTemplate } from "@/modules/payroll/template.functions";
import { CLASSIC_TEMPLATE_ID, type PayslipTemplate } from "@/modules/payroll/template.types";

export const Route = createFileRoute("/onboarding")({
  beforeLoad: async () => {
    const session = await getAuthSession();
    if (!session) {
      throw redirect({ to: "/login" });
    }
    // Platform admin skips company onboarding
    if (isPlatformAdmin(session) || session.profile?.company_id) {
      throw redirect({ to: "/dashboard" });
    }
    return { auth: session };
  },
  component: OnboardingPage,
});

function OnboardingPage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<PayslipTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>(CLASSIC_TEMPLATE_ID);

  useEffect(() => {
    listPayslipTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  const handleCreate = async ({ values, logoFile }: CompanyFormSubmit) => {
    const result = await createCompany({ data: values });
    if (!result.ok) {
      throw new Error(result.message);
    }
    if (logoFile) {
      await uploadCompanyLogoFile(result.data.id, logoFile);
    }
    if (templateId !== CLASSIC_TEMPLATE_ID) {
      await setCompanyTemplate({ data: { companyId: result.data.id, templateId } });
    }
    await navigate({ to: "/subscriptions" });
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
      <div className="relative mx-auto w-full max-w-5xl">
        <div className="mb-8 text-center">
          <MshaharaLogo variant="full" className="mx-auto h-12 w-auto" />
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.2em] text-reef">
            {brand.tagline}
          </p>
        </div>

        <div className="card-elevated rounded-2xl p-6 sm:p-8">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-reef">Étape 1 / 2</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-primary sm:text-3xl">
            Configurez votre entreprise
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Ensuite vous choisirez un abonnement et paierez via M&apos;Vola Comores. Un
            administrateur activera votre compte sous 24&nbsp;h.
          </p>
          <div className="ridge-divider mt-4" aria-hidden />

          {templates.length > 0 ? (
            <div className="mt-6">
              <h2 className="font-display text-lg font-semibold text-primary">Modèle de bulletin de paie</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Choisissez l’apparence de vos bulletins. Vous pourrez la personnaliser plus tard (Paie → Modèle de bulletin).
              </p>
              <TemplatePicker templates={templates} value={templateId} onChange={setTemplateId} />
            </div>
          ) : null}

          <div className="mt-8">
            <h2 className="mb-3 font-display text-lg font-semibold text-primary">Informations de l’entreprise</h2>
            <CompanyForm submitLabel="Créer mon entreprise" onSubmit={handleCreate} />
          </div>
        </div>
      </div>
    </div>
  );
}
