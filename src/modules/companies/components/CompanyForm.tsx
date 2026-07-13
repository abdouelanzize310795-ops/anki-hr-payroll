import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { createCompanySchema, type CreateCompanyInput } from "@/modules/companies/schemas";
import { listCountries, listCurrencies } from "@/modules/companies/company.functions";
import type { Country, Currency } from "@/modules/companies/types";
import { ImagePlus } from "lucide-react";

export type CompanyFormSubmit = {
  values: CreateCompanyInput;
  logoFile: File | null;
};

type CompanyFormProps = {
  defaultValues?: Partial<CreateCompanyInput>;
  existingLogoUrl?: string | null;
  submitLabel?: string;
  onSubmit: (payload: CompanyFormSubmit) => Promise<void>;
};

export function CompanyForm({
  defaultValues,
  existingLogoUrl,
  submitLabel = "Enregistrer",
  onSubmit,
}: CompanyFormProps) {
  const [countries, setCountries] = useState<Country[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(existingLogoUrl ?? null);

  const form = useForm<CreateCompanyInput>({
    resolver: zodResolver(createCompanySchema),
    defaultValues: {
      legalName: "",
      tradeName: "",
      sector: "",
      taxId: "",
      registrationNumber: "",
      email: "",
      phone: "",
      addressLine1: "",
      city: "",
      region: "",
      countryCode: "KM",
      currencyCode: "KMF",
      bankName: "",
      bankAccount: "",
      bankRib: "",
      ...defaultValues,
    },
  });

  useEffect(() => {
    void (async () => {
      const [c, cur] = await Promise.all([listCountries(), listCurrencies()]);
      setCountries(c);
      setCurrencies(cur);
    })();
  }, []);

  useEffect(() => {
    setLogoPreview(existingLogoUrl ?? null);
  }, [existingLogoUrl]);

  useEffect(() => {
    if (!logoFile) return;
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  const handleSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await onSubmit({ values, logoFile });
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Une erreur est survenue");
    }
  });

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-4">
        <Label className="mb-2 block">Identité visuelle</Label>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-xl border border-border bg-card">
            {logoPreview ? (
              <img src={logoPreview} alt="Logo" className="h-full w-full object-contain p-1" />
            ) : (
              <ImagePlus className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <Input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            />
            <p className="text-[11px] text-muted-foreground">
              Logo affiché en en-tête des contrats, bulletins et modèles RH — PNG/JPG/WebP/SVG, 2 Mo max.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="legalName">Raison sociale *</Label>
          <Input id="legalName" placeholder="SARL Ankiba Services" {...form.register("legalName")} />
          {form.formState.errors.legalName && (
            <p className="text-xs text-destructive">{form.formState.errors.legalName.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="tradeName">Nom commercial</Label>
          <Input id="tradeName" {...form.register("tradeName")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sector">Secteur d’activité</Label>
          <Input id="sector" placeholder="Commerce, Banque, Santé…" {...form.register("sector")} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="taxId">NIF / Identification fiscale</Label>
          <Input id="taxId" {...form.register("taxId")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="registrationNumber">RCCM / N° registre</Label>
          <Input id="registrationNumber" {...form.register("registrationNumber")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Téléphone</Label>
          <Input id="phone" placeholder="+269 …" {...form.register("phone")} />
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="email">E-mail entreprise</Label>
          <Input id="email" type="email" {...form.register("email")} />
          {form.formState.errors.email && (
            <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
          )}
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="addressLine1">Adresse</Label>
          <Input id="addressLine1" {...form.register("addressLine1")} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="city">Ville</Label>
          <Input id="city" placeholder="Moroni" {...form.register("city")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="region">Île / région</Label>
          <Input id="region" placeholder="Grande Comore" {...form.register("region")} />
        </div>

        <div className="space-y-2">
          <Label>Pays</Label>
          <Select
            value={form.watch("countryCode")}
            onValueChange={(v) => form.setValue("countryCode", v, { shouldValidate: true })}
          >
            <SelectTrigger><SelectValue placeholder="Pays" /></SelectTrigger>
            <SelectContent>
              {countries.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.name_fr}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Devise</Label>
          <Select
            value={form.watch("currencyCode")}
            onValueChange={(v) => form.setValue("currencyCode", v, { shouldValidate: true })}
          >
            <SelectTrigger><SelectValue placeholder="Devise" /></SelectTrigger>
            <SelectContent>
              {currencies.map((c) => (
                <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-reef">Coordonnées bancaires</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="bankName">Banque</Label>
          <Input id="bankName" {...form.register("bankName")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="bankAccount">N° de compte</Label>
          <Input id="bankAccount" className="font-mono" {...form.register("bankAccount")} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="bankRib">RIB</Label>
          <Input id="bankRib" className="font-mono" {...form.register("bankRib")} />
        </div>
      </div>

      {serverError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <Button
        type="submit"
        className="w-full bg-gold text-gold-foreground hover:bg-gold/90 sm:w-auto"
        disabled={form.formState.isSubmitting}
      >
        {form.formState.isSubmitting ? "Enregistrement…" : submitLabel}
      </Button>
    </form>
  );
}
