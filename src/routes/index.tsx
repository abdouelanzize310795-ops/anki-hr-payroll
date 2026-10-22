import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowRight,
  Banknote,
  BarChart3,
  Briefcase,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  FileSignature,
  FileText,
  Menu,
  ShieldCheck,
  Smartphone,
  Users,
  X,
} from "lucide-react";
import { MshaharaLogo } from "@/components/brand/MshaharaLogo";
import { getAuthSession } from "@/lib/auth/auth.functions";

export const Route = createFileRoute("/")({
  loader: async () => ({ auth: await getAuthSession() }),
  component: LandingPage,
});

const nav = [
  { label: "Fonctionnalités", href: "#fonctionnalites" },
  { label: "Comment ça marche", href: "#etapes" },
  { label: "Application mobile", href: "#mobile" },
  { label: "Tarifs", href: "#tarifs" },
  { label: "FAQ", href: "#faq" },
];

const features = [
  {
    icon: Banknote,
    title: "Paie en quelques clics",
    text: "Bulletins calculés automatiquement à partir des heures pointées, des primes et des retenues paramétrées par votre entreprise.",
  },
  {
    icon: Clock,
    title: "Pointage mobile",
    text: "Vos équipes badgent l’entrée et la sortie depuis leur téléphone, avec la position GPS en option.",
  },
  {
    icon: CalendarDays,
    title: "Congés et absences",
    text: "Demandes en ligne, validation par le manager puis par les RH, soldes mis à jour automatiquement.",
  },
  {
    icon: FileSignature,
    title: "Contrats électroniques",
    text: "Rédigez, envoyez et faites signer les contrats CDI, CDD, stage ou essai, sans papier.",
  },
  {
    icon: ShieldCheck,
    title: "Virements de salaires",
    text: "Générez les ordres de virement de la paie du mois, prêts à transmettre à votre banque.",
  },
  {
    icon: Users,
    title: "Dossier employé complet",
    text: "Fiches, documents, matériel attribué, formations et évaluations réunis au même endroit.",
  },
  {
    icon: Briefcase,
    title: "Recrutement",
    text: "Publiez vos offres et suivez chaque candidat, de la présélection à l’embauche.",
  },
  {
    icon: BarChart3,
    title: "Rapports et comptabilité",
    text: "Masse salariale, effectifs et présence en temps réel pour piloter votre entreprise.",
  },
];

const steps = [
  {
    n: "01",
    title: "Créez votre compte",
    text: "Inscrivez-vous et renseignez les informations de votre entreprise en quelques minutes.",
  },
  {
    n: "02",
    title: "Activez votre abonnement",
    text: "Réglez par M’Vola ou par virement EXIM Bank. Votre espace est validé sous 24 h.",
  },
  {
    n: "03",
    title: "Gérez vos équipes",
    text: "Ajoutez vos employés, lancez le pointage et éditez votre première paie dès ce mois-ci.",
  },
];

const plans = [
  {
    name: "Starter",
    price: "2 500",
    per: "KMF / employé / mois",
    features: ["Jusqu’à 25 employés", "RH de base", "Paie simple", "Support e-mail"],
  },
  {
    name: "Pro",
    price: "4 500",
    per: "KMF / employé / mois",
    featured: true,
    features: [
      "Jusqu’à 500 employés",
      "RH, paie et virements",
      "Assistant Mshahara",
      "Support prioritaire",
      "Multi-entreprises",
    ],
  },
  {
    name: "Entreprise",
    price: "Sur devis",
    per: "licence annuelle",
    features: [
      "Employés illimités",
      "Accompagnement dédié",
      "Connexion unique (SSO)",
      "Intégrations sur mesure",
      "Disponibilité garantie 99,9 %",
    ],
  },
];

const faqs = [
  {
    q: "Les taux de cotisation et d’impôt sont-ils imposés ?",
    a: "Non. Chaque entreprise paramètre ses propres rubriques de paie (cotisations, IGR, primes). Mshahara applique ensuite ces règles automatiquement à chaque bulletin.",
  },
  {
    q: "Comment payer l’abonnement ?",
    a: "Par M’Vola ou par virement EXIM Bank. Un code de paiement unique vous est fourni à l’inscription ; un administrateur active votre espace sous 24 h après réception.",
  },
  {
    q: "Mes employés doivent-ils installer une application ?",
    a: "Seulement pour le pointage mobile. L’application Android permet de badger, consulter ses présences, ses congés et ses bulletins. Le reste se fait depuis le navigateur.",
  },
  {
    q: "Que deviennent mes données si mon abonnement expire ?",
    a: "Elles sont conservées. L’accès à l’espace de travail est suspendu jusqu’au renouvellement, sans aucune suppression.",
  },
];

function LandingPage() {
  const { auth } = Route.useLoaderData();
  const [menuOpen, setMenuOpen] = useState(false);
  const loggedIn = !!auth;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" aria-label="Mshahara — accueil">
            <MshaharaLogo variant="full" className="h-10 w-auto" />
          </Link>

          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground lg:flex">
            {nav.map((item) => (
              <a key={item.href} href={item.href} className="transition-colors hover:text-primary">
                {item.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            {loggedIn ? (
              <Link
                to="/dashboard"
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
              >
                Mon espace
              </Link>
            ) : (
              <>
                <Link to="/login" className="px-3 py-2 text-sm font-semibold text-primary hover:underline">
                  Se connecter
                </Link>
                <Link
                  to="/signup"
                  className="rounded-md bg-gold px-4 py-2 text-sm font-semibold text-gold-foreground hover:brightness-95"
                >
                  Essayer Mshahara
                </Link>
              </>
            )}
          </div>

          <button
            type="button"
            className="rounded-md p-2 text-primary lg:hidden"
            aria-label={menuOpen ? "Fermer le menu" : "Ouvrir le menu"}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {menuOpen ? (
          <div className="border-t border-border/60 bg-background px-4 pb-4 lg:hidden">
            <nav className="flex flex-col py-2">
              {nav.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="py-2.5 text-sm font-medium text-muted-foreground"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="flex flex-col gap-2">
              {loggedIn ? (
                <Link
                  to="/dashboard"
                  className="rounded-md bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground"
                >
                  Mon espace
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    className="rounded-md border border-primary/30 px-4 py-2.5 text-center text-sm font-semibold text-primary"
                  >
                    Se connecter
                  </Link>
                  <Link
                    to="/signup"
                    className="rounded-md bg-gold px-4 py-2.5 text-center text-sm font-semibold text-gold-foreground"
                  >
                    Essayer Mshahara
                  </Link>
                </>
              )}
            </div>
          </div>
        ) : null}
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:py-24 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.25em] text-reef">
                Paie · RH · Pointage
              </p>
              <h1 className="mt-4 font-display text-4xl font-bold leading-tight text-primary md:text-6xl">
                La paie et les RH de votre entreprise, enfin simples.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                Mshahara réunit le pointage, les congés, les contrats et la paie dans une seule
                plateforme pensée pour les entreprises des Comores. Vos salaires sont prêts à
                virer en fin de mois, sans tableur.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to={loggedIn ? "/dashboard" : "/signup"}
                  className="inline-flex items-center justify-center gap-2 rounded-md bg-gold px-6 py-3 text-base font-semibold text-gold-foreground hover:brightness-95"
                >
                  {loggedIn ? "Accéder à mon espace" : "Créer mon compte entreprise"}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="#fonctionnalites"
                  className="inline-flex items-center justify-center rounded-md border border-primary/25 px-6 py-3 text-base font-semibold text-primary hover:bg-primary/5"
                >
                  Découvrir les fonctionnalités
                </a>
              </div>
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                {["Validation sous 24 h", "Paiement M’Vola ou EXIM", "Données conservées"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-reef" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <HeroPreview />
          </div>
        </section>

        {/* Payment strip */}
        <section className="border-y border-border/60 bg-card">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row">
            <p className="text-sm font-medium text-muted-foreground">
              Abonnement réglé simplement, en monnaie locale :
            </p>
            <div className="flex items-center gap-8">
              <img src="/payments/mvola.png" alt="M’Vola" className="h-8 w-auto object-contain" />
              <img src="/payments/poketra-exim.png" alt="EXIM Bank" className="h-8 w-auto object-contain" />
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="fonctionnalites" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionTitle
              eyebrow="Fonctionnalités"
              title="Tout ce qu’il faut pour gérer vos équipes"
              text="Un seul outil, du recrutement jusqu’au virement des salaires."
            />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {features.map(({ icon: Icon, title, text }) => (
                <div key={title} className="rounded-xl border border-border/70 bg-card p-6 shadow-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold text-primary">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Steps */}
        <section id="etapes" className="scroll-mt-20 bg-primary text-primary-foreground">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionTitle
              eyebrow="Comment ça marche"
              title="Opérationnel en trois étapes"
              dark
            />
            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {steps.map((s) => (
                <div key={s.n} className="border-t border-primary-foreground/20 pt-6">
                  <span className="font-mono text-sm text-gold">{s.n}</span>
                  <h3 className="mt-3 font-display text-xl font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-primary-foreground/75">{s.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Mobile */}
        <section id="mobile" className="scroll-mt-20">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 lg:grid-cols-2">
            <div>
              <SectionTitle
                eyebrow="Application mobile"
                title="Le pointage dans la poche de chaque employé"
                align="left"
              />
              <ul className="mt-8 space-y-4">
                {[
                  "Entrée et sortie en un geste, avec position GPS en option",
                  "Historique des présences du mois",
                  "Demandes de congé et bulletins de paie",
                  "Validation des congés de l’équipe pour les managers",
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-muted-foreground">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-reef/15 text-reef">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <PhoneMock />
          </div>
        </section>

        {/* Pricing */}
        <section id="tarifs" className="scroll-mt-20 bg-card">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionTitle
              eyebrow="Tarifs"
              title="Un prix juste, par employé"
              text="Sans frais d’installation. Changez de formule à tout moment."
            />
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {plans.map((p) => (
                <div
                  key={p.name}
                  className={
                    p.featured
                      ? "relative rounded-2xl border-2 border-gold bg-background p-8 shadow-lg"
                      : "rounded-2xl border border-border/70 bg-background p-8"
                  }
                >
                  {p.featured ? (
                    <span className="absolute -top-3 left-8 rounded-full bg-gold px-3 py-1 text-xs font-semibold text-gold-foreground">
                      Le plus choisi
                    </span>
                  ) : null}
                  <h3 className="font-display text-xl font-semibold text-primary">{p.name}</h3>
                  <p className="mt-4">
                    <span className="font-display text-4xl font-bold text-primary">{p.price}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">{p.per}</p>
                  <ul className="mt-6 space-y-3 text-sm">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-reef" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={loggedIn ? "/subscriptions" : "/signup"}
                    className={
                      p.featured
                        ? "mt-8 block rounded-md bg-gold px-4 py-2.5 text-center text-sm font-semibold text-gold-foreground hover:brightness-95"
                        : "mt-8 block rounded-md border border-primary/25 px-4 py-2.5 text-center text-sm font-semibold text-primary hover:bg-primary/5"
                    }
                  >
                    {p.price === "Sur devis" ? "Nous contacter" : "Commencer"}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-20">
          <div className="mx-auto max-w-3xl px-4 py-20">
            <SectionTitle eyebrow="FAQ" title="Questions fréquentes" />
            <div className="mt-10 divide-y divide-border/70 rounded-xl border border-border/70 bg-card">
              {faqs.map((f) => (
                <details key={f.q} className="group px-6 py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-primary">
                    {f.q}
                    <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 pb-20">
          <div className="mx-auto max-w-6xl rounded-2xl bg-primary px-6 py-14 text-center text-primary-foreground md:px-12">
            <h2 className="font-display text-3xl font-bold md:text-4xl">
              Prêt à simplifier votre paie ?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-primary-foreground/75">
              Créez votre compte entreprise aujourd’hui et éditez vos premiers bulletins dès ce mois-ci.
            </p>
            <Link
              to={loggedIn ? "/dashboard" : "/signup"}
              className="mt-8 inline-flex items-center gap-2 rounded-md bg-gold px-6 py-3 font-semibold text-gold-foreground hover:brightness-95"
            >
              {loggedIn ? "Accéder à mon espace" : "Créer mon compte entreprise"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row">
          <MshaharaLogo variant="full" className="h-8 w-auto" />
          <p>© {new Date().getFullYear()} Mshahara — Paie, RH et pointage.</p>
          <div className="flex gap-5">
            <Link to="/login" className="hover:text-primary">Se connecter</Link>
            <Link to="/signup" className="hover:text-primary">Créer un compte</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  text,
  dark = false,
  align = "center",
}: {
  eyebrow: string;
  title: string;
  text?: string;
  dark?: boolean;
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <p className={`font-mono text-xs uppercase tracking-[0.25em] ${dark ? "text-gold" : "text-reef"}`}>
        {eyebrow}
      </p>
      <h2 className={`mt-3 font-display text-3xl font-bold md:text-4xl ${dark ? "" : "text-primary"}`}>
        {title}
      </h2>
      {text ? (
        <p className={`mt-4 ${dark ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{text}</p>
      ) : null}
    </div>
  );
}

/** Illustrative dashboard card (static figures). */
function HeroPreview() {
  const rows = [
    { name: "Amina Said", role: "Comptable", net: "285 000" },
    { name: "Ali Mohamed", role: "Chauffeur", net: "168 500" },
    { name: "Fatima Ahmed", role: "Assistante RH", net: "212 750" },
  ];
  return (
    <div className="relative">
      <div className="absolute -inset-4 -z-10 rounded-3xl bg-gold/15 blur-2xl" />
      <div className="rounded-2xl border border-border/70 bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Paie d’octobre</p>
            <p className="mt-1 font-display text-2xl font-bold text-primary">666 250 KMF</p>
          </div>
          <span className="rounded-full bg-reef/15 px-3 py-1 text-xs font-semibold text-reef">Approuvée</span>
        </div>
        <div className="mt-6 space-y-3">
          {rows.map((r) => (
            <div key={r.name} className="flex items-center justify-between rounded-lg bg-background px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                  {r.name.split(" ").map((p) => p[0]).join("")}
                </span>
                <div>
                  <p className="text-sm font-semibold">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.role}</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-primary">{r.net}</p>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground">
          <FileText className="h-4 w-4 text-gold" />
          Virements prêts à exporter
        </div>
      </div>
    </div>
  );
}

function PhoneMock() {
  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="rounded-[2.5rem] border-8 border-primary bg-background p-5 shadow-2xl">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-reef" />
          <p className="font-mono text-[10px] uppercase tracking-widest text-reef">Espace collaborateur</p>
        </div>
        <p className="mt-4 font-display text-xl font-bold text-primary">Bonjour Amina</p>
        <p className="text-sm text-muted-foreground">Mardi 21 octobre</p>
        <div className="mt-6 rounded-2xl bg-primary p-5 text-center text-primary-foreground">
          <p className="text-xs uppercase tracking-wider text-primary-foreground/70">Arrivée</p>
          <p className="mt-1 font-display text-4xl font-bold">08:02</p>
          <div className="mt-4 rounded-xl bg-gold py-3 text-sm font-semibold text-gold-foreground">
            Badger la sortie
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-xl bg-card p-3">
            <p className="font-display text-lg font-bold text-primary">21</p>
            <p className="text-[11px] text-muted-foreground">jours présents</p>
          </div>
          <div className="rounded-xl bg-card p-3">
            <p className="font-display text-lg font-bold text-primary">18,5</p>
            <p className="text-[11px] text-muted-foreground">jours de congé</p>
          </div>
        </div>
      </div>
    </div>
  );
}
