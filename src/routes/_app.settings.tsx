import { createFileRoute, getRouteApi, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/AppShell";
import { SectionCard } from "@/components/app/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Building2, User, Bell, Lock, Wallet, UsersRound } from "lucide-react";
import {
  getCompany,
  listCompanies,
  listCountries,
  listCurrencies,
  updateCompany,
} from "@/modules/companies/company.functions";
import { updateMyProfile } from "@/lib/auth/auth.functions";
import { isPlatformAdmin } from "@/lib/auth/auth.functions";
import type { CompanyWithMeta, Country, Currency } from "@/modules/companies/types";
import type { UpdateCompanyInput } from "@/modules/companies/schemas";
import {
  HR_ACCESS,
  listCompanyStaff,
  provisionStaffAccount,
  type CompanyStaffMember,
} from "@/modules/staff/staff.functions";

export const Route = createFileRoute("/_app/settings")({ component: SettingsPage });

const appRouteApi = getRouteApi("/_app");

type Tab = "company" | "payroll" | "team" | "account" | "notifications" | "security";

const nav: Array<{ id: Tab; icon: typeof Building2; t: string; d: string }> = [
  { id: "company", icon: Building2, t: "Entreprise", d: "Profil légal, coordonnées, banque." },
  { id: "payroll", icon: Wallet, t: "Paie", d: "Périodicité et horaires de référence." },
  { id: "team", icon: UsersRound, t: "Équipe RH", d: "Comptes RH et managers." },
  { id: "account", icon: User, t: "Mon compte", d: "Nom, téléphone, langue." },
  { id: "notifications", icon: Bell, t: "Notifications", d: "Préférences d’alerte (navigateur)." },
  { id: "security", icon: Lock, t: "Sécurité", d: "Session et bonnes pratiques." },
];

const employeeNav = nav.filter((s) => s.id === "account" || s.id === "notifications" || s.id === "security");
const managerNav = nav.filter((s) => s.id !== "team" && s.id !== "payroll");

function SettingsPage() {
  const { auth } = appRouteApi.useRouteContext();
  const admin = isPlatformAdmin(auth);
  const role = auth.profile?.role;
  const isEmployee = role === "employee";
  const isManager = role === "manager";
  const isEmployer = role === "employer" || admin;
  const canManage =
    admin || role === "employer" || role === "hr";

  const [tab, setTab] = useState<Tab>(isEmployee ? "account" : "company");
  const visibleNav = isEmployee ? employeeNav : isManager ? managerNav : nav;
  const [companies, setCompanies] = useState<CompanyWithMeta[]>([]);
  const [companyId, setCompanyId] = useState<string>(auth.profile?.company_id ?? "");
  const [company, setCompany] = useState<CompanyWithMeta | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Company form
  const [legalName, setLegalName] = useState("");
  const [tradeName, setTradeName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [region, setRegion] = useState("");
  const [countryCode, setCountryCode] = useState("KM");
  const [currencyCode, setCurrencyCode] = useState("KMF");
  const [bankName, setBankName] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankRib, setBankRib] = useState("");
  const [payrollPeriodicity, setPayrollPeriodicity] = useState<"monthly" | "biweekly" | "weekly">("monthly");
  const [workDays, setWorkDays] = useState(5);
  const [hoursPerDay, setHoursPerDay] = useState(8);
  const [overtimeMultiplier, setOvertimeMultiplier] = useState(1.5);

  // Profile form
  const [fullName, setFullName] = useState(auth.profile?.full_name ?? "");
  const [profilePhone, setProfilePhone] = useState(auth.profile?.phone ?? "");
  const [locale, setLocale] = useState(auth.profile?.locale ?? "fr-KM");

  const [digestEmail, setDigestEmail] = useState(true);
  const [leaveAlerts, setLeaveAlerts] = useState(true);

  const [staff, setStaff] = useState<CompanyStaffMember[]>([]);
  const [staffEmail, setStaffEmail] = useState("");
  const [staffName, setStaffName] = useState("");
  const [staffRole, setStaffRole] = useState<"hr" | "manager">("hr");
  const [staffCreds, setStaffCreds] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    setDigestEmail(localStorage.getItem("ap_digest") !== "0");
    setLeaveAlerts(localStorage.getItem("ap_leave_alerts") !== "0");
  }, []);

  useEffect(() => {
    void (async () => {
      if (isEmployee) return;
      const [cos, curs, comps] = await Promise.all([
        listCountries(),
        listCurrencies(),
        listCompanies(),
      ]);
      setCountries(cos);
      setCurrencies(curs);
      setCompanies(comps);
      if (!companyId && comps[0]) setCompanyId(comps[0].id);
    })();
  }, [isEmployee]);

  useEffect(() => {
    if (isEmployee || !companyId) {
      setCompany(null);
      return;
    }
    void (async () => {
      const c = await getCompany({ data: { id: companyId } });
      setCompany(c);
      if (c) {
        setLegalName(c.legal_name);
        setTradeName(c.trade_name ?? "");
        setTaxId(c.tax_id ?? "");
        setEmail(c.email ?? "");
        setPhone(c.phone ?? "");
        setAddress(c.address_line1 ?? "");
        setCity(c.city ?? "");
        setRegion(c.region ?? "");
        setCountryCode(c.country_code);
        setCurrencyCode(c.currency_code);
        setBankName(c.bank_name ?? "");
        setBankAccount(c.bank_account ?? "");
        setBankRib(c.bank_rib ?? "");
        setPayrollPeriodicity(c.payroll_periodicity);
        setWorkDays(c.work_days_per_week);
        setHoursPerDay(Number(c.standard_hours_per_day));
        setOvertimeMultiplier(Number(c.overtime_multiplier ?? 1.5));
      }
    })();
  }, [companyId, isEmployee]);

  useEffect(() => {
    if (!companyId || isEmployee || isManager) {
      setStaff([]);
      return;
    }
    void (async () => {
      try {
        setStaff(await listCompanyStaff({ data: { companyId } }));
      } catch {
        setStaff([]);
      }
    })();
  }, [companyId, isEmployee, isManager]);

  const flash = (msg: string) => {
    setSuccess(msg);
    setError(null);
    setTimeout(() => setSuccess(null), 3000);
  };

  const saveCompany = async () => {
    if (!companyId || !canManage) return;
    setBusy(true);
    setError(null);
    try {
      const payload: UpdateCompanyInput = {
        id: companyId,
        legalName,
        tradeName,
        taxId,
        email,
        phone,
        addressLine1: address,
        city,
        region,
        countryCode,
        currencyCode,
        bankName,
        bankAccount,
        bankRib,
        payrollPeriodicity,
        workDaysPerWeek: workDays,
        standardHoursPerDay: hoursPerDay,
        overtimeMultiplier,
      };
      const result = await updateCompany({ data: payload });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      flash("Entreprise enregistrée");
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await updateMyProfile({
        data: {
          fullName,
          phone: profilePhone,
          locale,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      flash("Profil enregistré — rechargez pour voir le nom partout");
    } finally {
      setBusy(false);
    }
  };

  const createStaff = async () => {
    if (!companyId || !isEmployer) return;
    setBusy(true);
    setError(null);
    setStaffCreds(null);
    try {
      const result = await provisionStaffAccount({
        data: {
          companyId,
          email: staffEmail,
          fullName: staffName,
          role: staffRole,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      if (result.data.temporary_password) {
        setStaffCreds({
          email: result.data.email,
          password: result.data.temporary_password,
        });
      }
      setStaffEmail("");
      setStaffName("");
      setStaff(await listCompanyStaff({ data: { companyId } }));
      flash(
        result.data.created
          ? `Compte ${result.data.role === "hr" ? "RH" : "manager"} créé`
          : `Compte lié en ${result.data.role === "hr" ? "RH" : "manager"}`,
      );
    } finally {
      setBusy(false);
    }
  };

  const initials = (fullName || auth.email || "?").slice(0, 2).toUpperCase();
  const roleLabel: Record<string, string> = {
    employer: "Employeur",
    hr: "RH",
    manager: "Manager",
  };

  return (
    <>
      <PageHeader
        badge="Préférences"
        title="Paramètres"
        description={
          isEmployee
            ? "Votre compte personnel — aucune donnée confidentielle d’entreprise."
            : "Entreprise, paie et compte utilisateur."
        }
      />

      {(error || success) && (
        <p
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            error
              ? "border border-destructive/30 bg-destructive/5 text-destructive"
              : "border border-success/30 bg-success/10 text-success"
          }`}
        >
          {error ?? success}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        <nav className="space-y-1">
          {visibleNav.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setTab(s.id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${
                tab === s.id
                  ? "bg-primary-soft font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              <s.icon className="h-4 w-4" /> {s.t}
            </button>
          ))}
        </nav>

        <div className="space-y-6">
          {tab === "company" && (
            <SectionCard
              title="Profil entreprise"
              description={company ? company.legal_name : "Sélectionnez une entreprise"}
              action={
                admin ? (
                  <Select value={companyId} onValueChange={setCompanyId}>
                    <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Entreprise" /></SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.legal_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : null
              }
            >
              {!companyId ? (
                <div className="text-sm text-muted-foreground">
                  Aucune entreprise liée.{" "}
                  <Link to="/onboarding" className="text-primary underline">Créer une entreprise</Link>
                </div>
              ) : (
                <>
                  <div className="mb-6 flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarFallback className="brand-gradient text-lg font-bold text-primary-foreground">
                        {legalName.slice(0, 1).toUpperCase() || "A"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-display text-lg font-semibold">{legalName || "—"}</p>
                      <p className="text-xs text-muted-foreground">
                        {countryCode} · {currencyCode}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                      <Label>Raison sociale</Label>
                      <Input className="mt-1.5" value={legalName} onChange={(e) => setLegalName(e.target.value)} disabled={!canManage} />
                    </div>
                    <div>
                      <Label>Enseigne</Label>
                      <Input className="mt-1.5" value={tradeName} onChange={(e) => setTradeName(e.target.value)} disabled={!canManage} />
                    </div>
                    <div>
                      <Label>NIF / registre</Label>
                      <Input className="mt-1.5" value={taxId} onChange={(e) => setTaxId(e.target.value)} disabled={!canManage} />
                    </div>
                    <div>
                      <Label>E-mail</Label>
                      <Input className="mt-1.5" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!canManage} />
                    </div>
                    <div>
                      <Label>Téléphone</Label>
                      <Input className="mt-1.5" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!canManage} />
                    </div>
                    <div>
                      <Label>Adresse</Label>
                      <Input className="mt-1.5" value={address} onChange={(e) => setAddress(e.target.value)} disabled={!canManage} />
                    </div>
                    <div>
                      <Label>Ville</Label>
                      <Input className="mt-1.5" value={city} onChange={(e) => setCity(e.target.value)} disabled={!canManage} />
                    </div>
                    <div>
                      <Label>Île / région</Label>
                      <Input className="mt-1.5" value={region} onChange={(e) => setRegion(e.target.value)} disabled={!canManage} />
                    </div>
                    <div>
                      <Label>Pays</Label>
                      <Select value={countryCode} onValueChange={setCountryCode} disabled={!canManage}>
                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {countries.map((c) => (
                            <SelectItem key={c.code} value={c.code}>{c.name_fr}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Devise</Label>
                      <Select value={currencyCode} onValueChange={setCurrencyCode} disabled={!canManage}>
                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {currencies.map((c) => (
                            <SelectItem key={c.code} value={c.code}>{c.code} — {c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Banque</Label>
                      <Input className="mt-1.5" value={bankName} onChange={(e) => setBankName(e.target.value)} disabled={!canManage} />
                    </div>
                    <div>
                      <Label>Compte</Label>
                      <Input className="mt-1.5" value={bankAccount} onChange={(e) => setBankAccount(e.target.value)} disabled={!canManage} />
                    </div>
                    <div className="md:col-span-2">
                      <Label>RIB</Label>
                      <Input className="mt-1.5" value={bankRib} onChange={(e) => setBankRib(e.target.value)} disabled={!canManage} />
                    </div>
                  </div>
                  {canManage && (
                    <Button className="mt-4" disabled={busy} onClick={() => void saveCompany()}>
                      {busy ? "Enregistrement…" : "Enregistrer"}
                    </Button>
                  )}
                </>
              )}
            </SectionCard>
          )}

          {tab === "payroll" && (
            <SectionCard title="Paramètres de paie" description="Références utilisées par le moteur (pas de taux légaux figés).">
              {!companyId ? (
                <p className="text-sm text-muted-foreground">Liez une entreprise d’abord.</p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                    <div>
                      <Label>Périodicité</Label>
                      <Select
                        value={payrollPeriodicity}
                        onValueChange={(v) => setPayrollPeriodicity(v as typeof payrollPeriodicity)}
                        disabled={!canManage}
                      >
                        <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="monthly">Mensuelle</SelectItem>
                          <SelectItem value="biweekly">Bimensuelle</SelectItem>
                          <SelectItem value="weekly">Hebdomadaire</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Jours / semaine</Label>
                      <Input
                        className="mt-1.5"
                        type="number"
                        min={1}
                        max={7}
                        value={workDays}
                        onChange={(e) => setWorkDays(Number(e.target.value))}
                        disabled={!canManage}
                      />
                    </div>
                    <div>
                      <Label>Heures / jour</Label>
                      <Input
                        className="mt-1.5"
                        type="number"
                        min={1}
                        max={24}
                        step={0.5}
                        value={hoursPerDay}
                        onChange={(e) => setHoursPerDay(Number(e.target.value))}
                        disabled={!canManage}
                      />
                    </div>
                    <div>
                      <Label>Multiplicateur heures supp.</Label>
                      <Input
                        className="mt-1.5"
                        type="number"
                        min={0}
                        max={10}
                        step={0.1}
                        value={overtimeMultiplier}
                        onChange={(e) => setOvertimeMultiplier(Number(e.target.value))}
                        disabled={!canManage}
                      />
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted-foreground">
                    La paie utilise le pointage (heures normales + heures supp. au-delà des heures/jour).
                    Multiplicateur HS configurable ici (ex. 1,5). Cotisations dans{" "}
                    <Link to="/payroll" className="text-primary underline">Paie → Composants</Link>.
                  </p>
                  {canManage && (
                    <Button className="mt-4" disabled={busy} onClick={() => void saveCompany()}>
                      {busy ? "Enregistrement…" : "Enregistrer"}
                    </Button>
                  )}
                </>
              )}
            </SectionCard>
          )}

          {tab === "team" && (
            <div className="space-y-6">
              <SectionCard
                title={HR_ACCESS.title}
                description={HR_ACCESS.summary}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Accès autorisés
                    </p>
                    <ul className="space-y-1.5 text-sm text-foreground">
                      {HR_ACCESS.can.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className="text-success">✓</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Non autorisé
                    </p>
                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      {HR_ACCESS.cannot.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span>—</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </SectionCard>

              <SectionCard
                title="Comptes gestionnaires"
                description="Employeur, RH et managers liés à cette entreprise."
              >
                {staff.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun compte gestionnaire listé.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {staff.map((m) => (
                      <li key={m.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0">
                        <div>
                          <div className="text-sm font-medium">{m.full_name || m.email}</div>
                          <div className="text-xs text-muted-foreground">{m.email}</div>
                        </div>
                        <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                          {roleLabel[m.role] ?? m.role}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>

              {isEmployer && (
                <SectionCard
                  title="Créer un compte RH ou manager"
                  description="Un mot de passe temporaire s’affiche une seule fois."
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Nom complet</Label>
                      <Input
                        value={staffName}
                        onChange={(e) => setStaffName(e.target.value)}
                        placeholder="Fatima Said"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>E-mail</Label>
                      <Input
                        type="email"
                        value={staffEmail}
                        onChange={(e) => setStaffEmail(e.target.value)}
                        placeholder="rh@entreprise.com"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Rôle</Label>
                      <Select
                        value={staffRole}
                        onValueChange={(v) => setStaffRole(v as "hr" | "manager")}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="hr">RH</SelectItem>
                          <SelectItem value="manager">Manager</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    className="mt-4"
                    disabled={busy || !staffEmail.trim() || staffName.trim().length < 2}
                    onClick={() => void createStaff()}
                  >
                    {busy ? "Création…" : "Créer le compte"}
                  </Button>
                  {staffCreds && (
                    <div className="mt-4 rounded-lg border border-gold/40 bg-gold/10 p-3 text-sm">
                      <p className="font-medium">Identifiants à transmettre (une seule fois)</p>
                      <p className="mt-1 font-mono text-xs">E-mail : {staffCreds.email}</p>
                      <p className="font-mono text-xs">Mot de passe : {staffCreds.password}</p>
                    </div>
                  )}
                </SectionCard>
              )}
            </div>
          )}

          {tab === "account" && (
            <SectionCard title="Mon compte">
              <div className="mb-6 flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarFallback className="bg-primary-soft text-lg font-semibold text-primary">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{auth.email}</p>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {auth.profile?.role ?? "—"}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <Label>Nom complet</Label>
                  <Input className="mt-1.5" value={fullName} onChange={(e) => setFullName(e.target.value)} />
                </div>
                <div>
                  <Label>Téléphone</Label>
                  <Input className="mt-1.5" value={profilePhone} onChange={(e) => setProfilePhone(e.target.value)} />
                </div>
                <div>
                  <Label>Langue / locale</Label>
                  <Select value={locale} onValueChange={setLocale}>
                    <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fr-KM">Français (Comores)</SelectItem>
                      <SelectItem value="fr-FR">Français</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button className="mt-4" disabled={busy} onClick={() => void saveProfile()}>
                {busy ? "Enregistrement…" : "Enregistrer le profil"}
              </Button>
            </SectionCard>
          )}

          {tab === "notifications" && (
            <SectionCard title="Notifications" description="Stockées localement sur cet appareil pour l’instant.">
              {[
                {
                  l: "Digest e-mail",
                  d: "Résumé quotidien des validations en attente.",
                  on: digestEmail,
                  set: (v: boolean) => {
                    setDigestEmail(v);
                    localStorage.setItem("ap_digest", v ? "1" : "0");
                  },
                },
                {
                  l: "Alertes congés",
                  d: "Rappeler les demandes en attente.",
                  on: leaveAlerts,
                  set: (v: boolean) => {
                    setLeaveAlerts(v);
                    localStorage.setItem("ap_leave_alerts", v ? "1" : "0");
                  },
                },
              ].map((p) => (
                <div key={p.l} className="flex items-center justify-between border-b border-border py-3 last:border-0">
                  <div>
                    <div className="text-sm font-medium">{p.l}</div>
                    <div className="text-xs text-muted-foreground">{p.d}</div>
                  </div>
                  <Switch checked={p.on} onCheckedChange={p.set} />
                </div>
              ))}
            </SectionCard>
          )}

          {tab === "security" && (
            <SectionCard title="Sécurité">
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>Session protégée par cookies Supabase Auth.</li>
                <li>Les rôles sont stockés dans <span className="font-mono text-xs">app_metadata</span> (non modifiables par l’utilisateur).</li>
                <li>RLS actif sur toutes les tables métier.</li>
                <li>Documents stockés dans un bucket privé avec URLs signées.</li>
              </ul>
              <p className="mt-4 text-xs text-muted-foreground">
                Pour changer le mot de passe, utilisez la récupération de compte Supabase Auth (à brancher).
              </p>
            </SectionCard>
          )}
        </div>
      </div>
    </>
  );
}
