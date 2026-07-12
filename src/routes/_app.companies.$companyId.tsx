import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard, StatusPill } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Building2, Landmark } from "lucide-react";
import {
  getCompany, listBranches, listDepartments, updateCompany,
} from "@/modules/companies/company.functions";
import { CompanyForm } from "@/modules/companies/components/CompanyForm";
import type { Branch, CompanyWithMeta, Department } from "@/modules/companies/types";
import type { CreateCompanyInput } from "@/modules/companies/schemas";

export const Route = createFileRoute("/_app/companies/$companyId")({
  component: CompanyDetailPage,
});

function CompanyDetailPage() {
  const { companyId } = Route.useParams();
  const [company, setCompany] = useState<CompanyWithMeta | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, b, d] = await Promise.all([
        getCompany({ data: { id: companyId } }),
        listBranches({ data: { companyId } }),
        listDepartments({ data: { companyId } }),
      ]);
      if (!c) {
        setError("Entreprise introuvable ou accès refusé.");
        setCompany(null);
        return;
      }
      setCompany(c);
      setBranches(b);
      setDepartments(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [companyId]);

  const handleUpdate = async (values: CreateCompanyInput) => {
    if (!company) return;
    const result = await updateCompany({
      data: {
        id: company.id,
        ...values,
      },
    });
    if (!result.ok) throw new Error(result.message);
    setSaved(true);
    await load();
    setTimeout(() => setSaved(false), 2500);
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-8 text-sm text-muted-foreground">
        Chargement de l’entreprise…
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="space-y-4">
        <Button variant="outline" size="sm" asChild>
          <Link to="/companies"><ArrowLeft className="mr-1.5 h-4 w-4" />Retour</Link>
        </Button>
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {error ?? "Entreprise introuvable"}
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        badge="Fiche entreprise"
        title={company.legal_name}
        description={[company.city, company.region, company.country?.name_fr]
          .filter(Boolean)
          .join(" · ") || "Paramètres de l’entité"}
        actions={
          <div className="flex items-center gap-2">
            <StatusPill status={company.is_active ? "Actif" : "En attente"} />
            <Button variant="outline" size="sm" asChild>
              <Link to="/companies"><ArrowLeft className="mr-1.5 h-4 w-4" />Liste</Link>
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <Badge variant="secondary" className="bg-primary-soft text-primary border-0">
          <Building2 className="mr-1 h-3.5 w-3.5" />
          {company.currency_code}
        </Badge>
        <Badge variant="secondary" className="border-0 bg-gold/15 text-gold-foreground">
          Paie {company.payroll_periodicity === "monthly" ? "mensuelle" : company.payroll_periodicity}
        </Badge>
        <Badge variant="outline">{branches.length} établissement(s)</Badge>
        <Badge variant="outline">{departments.length} département(s)</Badge>
      </div>

      {saved && (
        <div className="mb-4 rounded-lg border border-reef/30 bg-reef/10 px-3 py-2 text-sm">
          Modifications enregistrées.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SectionCard title="Informations générales" description="Identité légale et contact">
            <CompanyForm
              submitLabel="Enregistrer les modifications"
              defaultValues={{
                legalName: company.legal_name,
                tradeName: company.trade_name ?? "",
                sector: company.sector ?? "",
                taxId: company.tax_id ?? "",
                email: company.email ?? "",
                phone: company.phone ?? "",
                addressLine1: company.address_line1 ?? "",
                city: company.city ?? "",
                region: company.region ?? "",
                countryCode: company.country_code,
                currencyCode: company.currency_code,
                bankName: company.bank_name ?? "",
                bankAccount: company.bank_account ?? "",
                bankRib: company.bank_rib ?? "",
              }}
              onSubmit={handleUpdate}
            />
          </SectionCard>
        </div>

        <div className="space-y-6 lg:col-span-2">
          <SectionCard title="Établissements" description="Sièges et sites">
            {branches.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun établissement.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nom</TableHead>
                    <TableHead>Ville</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">
                        {b.name}
                        {b.is_headquarters && (
                          <span className="ml-2 text-[10px] uppercase tracking-wider text-reef">Siège</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{b.city ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>

          <SectionCard title="Banque" description="Pour les ordres de virement">
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <Landmark className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <div className="font-medium">{company.bank_name || "Banque non renseignée"}</div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">
                    Compte : {company.bank_account || "—"}
                  </div>
                  <div className="font-mono text-xs text-muted-foreground">
                    RIB : {company.bank_rib || "—"}
                  </div>
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Départements">
            {departments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun département pour l’instant. Ils pourront être créés depuis le module Employés.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {departments.map((d) => (
                  <li key={d.id} className="flex justify-between border-b border-border/60 py-2 last:border-0">
                    <span className="font-medium">{d.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{d.code ?? ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
