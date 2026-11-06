import { createFileRoute, Link } from "@tanstack/react-router";
import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  ArrowRight,
  Building2,
  ClipboardCheck,
  FileDown,
  LayoutTemplate,
  MapPin,
  QrCode,
  Scale,
  Timer,
  Banknote,
  BarChart3,
  Briefcase,
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  FileSignature,
  FileText,
  Hand,
  Shuffle,
  Star,
  Menu,
  ShieldCheck,
  Smartphone,
  Users,
  X,
} from "lucide-react";
import { MshaharaLogo } from "@/components/brand/MshaharaLogo";
import { getAuthSession } from "@/lib/auth/auth.functions";
import { PayslipRenderer } from "@/modules/payroll/components/PayslipRenderer";
import { SAMPLE_PAYSLIP, type PayslipLayout } from "@/modules/payroll/template.types";

import { listSubscriptionPlans } from "@/modules/companies/payment.functions";
import { withPlanPricing } from "@/modules/companies/plans";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [auth, pricing] = await Promise.all([getAuthSession(), listSubscriptionPlans().catch(() => [])]);
    return { auth, pricing };
  },
  component: LandingPage,
});

const nav = [
  { label: "Fonctionnalités", href: "#fonctionnalites" },
  { label: "Pointage sécurisé", href: "#pointage" },
  { label: "Bulletins", href: "#bulletins" },
  { label: "Application mobile", href: "#mobile" },
  { label: "Tarifs", href: "#tarifs" },
  { label: "FAQ", href: "#faq" },
];

const features = [
  {
    icon: Banknote,
    title: "Paie automatique",
    text: "Bulletins calculés à partir des heures pointées, des primes et des retenues, avec l’IGR selon votre barème.",
  },
  {
    icon: QrCode,
    title: "Pointage anti-fraude",
    text: "QR code qui change toutes les 15 s, position GPS vérifiée sur place et un seul téléphone autorisé par salarié.",
  },
  {
    icon: Timer,
    title: "Horaires et retards",
    text: "Vos horaires, la tolérance et les fenêtres d’arrivée : retards, départs anticipés et absences calculés seuls.",
  },
  {
    icon: CalendarDays,
    title: "Congés acquis chaque mois",
    text: "2,5 jours par mois (ou votre règle), report d’une année sur l’autre, demandes et validation en ligne.",
  },
  {
    icon: Scale,
    title: "Règles de paie sur mesure",
    text: "Primes par service, contrat ou ancienneté, plancher et plafond, base IGR et retraite : tout se règle sans code.",
  },
  {
    icon: LayoutTemplate,
    title: "20 modèles de bulletin",
    text: "Choisissez votre modèle à l’inscription puis personnalisez-le en glisser-déposer : blocs, couleurs, mentions.",
  },
  {
    icon: FileDown,
    title: "Bulletins PDF",
    text: "Chaque bulletin se télécharge ou se partage en PDF, exactement au modèle choisi par l’employeur.",
  },
  {
    icon: ClipboardCheck,
    title: "Corrections de pointage",
    text: "Téléphone en panne, oubli ? Le salarié demande une correction, le manager valide, tout est tracé.",
  },
  {
    icon: BarChart3,
    title: "Présences en direct",
    text: "Attendus, présents, en retard, absents par site, mis à jour en temps réel, et export Excel / CSV.",
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
    icon: Building2,
    title: "Plusieurs sites",
    text: "Siège, agences, entrepôts : chaque site a sa position, son rayon et son écran de pointage.",
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
    text: "Réglez par M’Vola ou Poketra (EXIM Bank), en mobile money. Votre espace est validé sous 24 h.",
  },
  {
    n: "03",
    title: "Gérez vos équipes",
    text: "Ajoutez vos employés, lancez le pointage et éditez votre première paie dès ce mois-ci.",
  },
];

const basePlans = [
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
    a: "Par M’Vola ou Poketra, le mobile money d’EXIM Bank. Un code de paiement unique vous est fourni à l’inscription ; un administrateur active votre espace sous 24 h après réception.",
  },
  {
    q: "Mes employés doivent-ils installer une application ?",
    a: "Oui, l’application Android Mshahara : pointage par QR code ou GPS, historique des présences, demandes de congé et de correction, contrat, salaire et bulletins de paie en PDF. Les RH et l’employeur travaillent depuis le navigateur.",
  },
  {
    q: "Que deviennent mes données si mon abonnement expire ?",
    a: "Elles sont conservées. L’accès à l’espace de travail est suspendu jusqu’au renouvellement, sans aucune suppression.",
  },
  {
    q: "Comment empêcher qu’un salarié pointe depuis chez lui ?",
    a: "Le pointage n’est accepté que dans le rayon GPS du site, depuis le téléphone autorisé du salarié. Sur les sites qui l’exigent, il faut en plus scanner le QR code affiché à l’écran : il change toutes les 15 secondes, une photo envoyée par message ne fonctionne donc pas.",
  },
  {
    q: "Comment sont calculés les congés ?",
    a: "Vous choisissez la règle par type de congé : par exemple 2,5 jours acquis à la fin de chaque mois travaillé, soit 30 jours par an. Les jours non pris sont reportés sur l’année suivante (avec un plafond si vous le souhaitez) et personne ne peut demander plus que son solde.",
  },
  {
    q: "Puis-je adapter le bulletin de paie à mon entreprise ?",
    a: "Oui. 20 modèles sont proposés, du plus sobre au plus détaillé. Vous pouvez ensuite ajouter, retirer ou déplacer les blocs en glisser-déposer, changer la couleur et les mentions. Les bulletins déjà émis gardent leur mise en page.",
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
          <div aria-hidden className="lp-orb -left-24 -top-24 h-80 w-80 bg-reef/20" />
          <div aria-hidden className="lp-orb right-0 top-40 h-96 w-96 bg-gold/20" style={{ animationDelay: "-6s" }} />
          <div aria-hidden className="lp-orb bottom-0 left-1/3 h-72 w-72 bg-primary/10" style={{ animationDelay: "-12s" }} />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:py-24 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="lp-enter font-mono text-xs uppercase tracking-[0.25em] text-reef">
                Paie · RH · Pointage
              </p>
              <h1
                className="lp-enter mt-4 font-display text-4xl font-bold leading-tight text-primary md:text-6xl"
                style={delay(120)}
              >
                La paie et les RH de votre entreprise, <span className="lp-gradient-text">enfin simples.</span>
              </h1>
              <p style={delay(240)} className="lp-enter mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
                Mshahara réunit le pointage, les congés, les contrats et la paie dans une seule
                plateforme pensée pour les entreprises des Comores. Vos salaires sont prêts à
                virer en fin de mois, sans tableur.
              </p>
              <div style={delay(360)} className="lp-enter mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  to={loggedIn ? "/dashboard" : "/signup"}
                  className="lp-shine inline-flex items-center justify-center gap-2 rounded-md bg-gold px-6 py-3 text-base font-semibold text-gold-foreground hover:brightness-95"
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
              <div style={delay(480)} className="lp-enter mt-8">
                <PlayStoreBadge />
              </div>
              <ul style={delay(600)} className="lp-enter mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                {["Validation sous 24 h", "Paiement M’Vola ou Poketra", "Données conservées"].map((t) => (
                  <li key={t} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-reef" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div style={delay(300)} className="lp-enter">
              <TiltOnScroll>
                <div className="lp-float">
                  <HeroPreview />
                </div>
              </TiltOnScroll>
            </div>
          </div>
        </section>

        {/* Payment strip */}
        <section className="border-y border-border/60 bg-card">
          <Reveal className="mx-auto grid max-w-6xl items-center gap-6 px-4 py-8 md:grid-cols-[1fr_auto]">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-reef/15 text-reef">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <p className="font-display text-lg font-semibold text-primary">
                  Votre abonnement, réglé en francs comoriens
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Payez en quelques secondes depuis votre téléphone, par mobile money. Aucune carte bancaire
                  n’est nécessaire, et l’activation est confirmée sous 24 h.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:flex">
              {[
                { src: "/payments/mvola.png", name: "M’Vola", text: "Mobile money" },
                { src: "/payments/poketra-exim.png", name: "Poketra", text: "Mobile money · EXIM Bank" },
              ].map((m) => (
                <div
                  key={m.name}
                  className="lp-lift flex items-center gap-3 rounded-xl border border-border/70 bg-background px-4 py-3"
                >
                  <img src={m.src} alt="" className="h-10 w-10 rounded-lg object-contain" />
                  <div className="leading-tight">
                    <p className="text-sm font-semibold text-primary">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* Scroll-lit statement */}
        <ScrollWords text="Pointage, congés, contrats et paie. Un seul outil, pensé pour les Comores. Zéro tableur, zéro oubli, des salaires prêts à virer en fin de mois." />

        {/* Features */}
        <section id="fonctionnalites" className="scroll-mt-20">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionTitle
              eyebrow="Fonctionnalités"
              title="Tout ce qu’il faut pour gérer vos équipes"
              text="Un seul outil, du recrutement jusqu’au virement des salaires."
            />
            <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {features.map(({ icon: Icon, title, text }, i) => (
                <Reveal key={title} delay={(i % 4) * 90} className="lp-lift rounded-xl border border-border/70 bg-card p-6 shadow-sm">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold text-primary">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Key figures */}
        <section className="border-y border-border/60 bg-card">
          <div className="mx-auto grid max-w-6xl grid-cols-2 gap-6 px-4 py-10 text-center md:grid-cols-4">
            {[
              { value: "15 s", label: "durée de vie d’un QR code de pointage" },
              { value: "20", label: "modèles de bulletin personnalisables" },
              { value: "2,5 j", label: "de congés acquis par mois (réglable)" },
              { value: "1 clic", label: "pour un bulletin PDF au modèle de l’entreprise" },
            ].map((k, i) => (
              <Reveal key={k.label} delay={i * 100}>
                <p className="font-display text-3xl font-bold text-primary md:text-4xl">
                  <CountUp value={k.value} />
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{k.label}</p>
              </Reveal>
            ))}
          </div>
        </section>

        {/* Secure attendance */}
        <section id="pointage" className="scroll-mt-20">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 lg:grid-cols-2">
            <div>
              <SectionTitle
                eyebrow="Pointage sécurisé"
                title="Fini les pointages à distance et les badges prêtés"
                text="Chaque pointage passe par plusieurs contrôles, faits par le serveur, avant d’être enregistré."
                align="left"
              />
              <ul className="mt-8 space-y-4">
                {[
                  { icon: QrCode, t: "QR code tournant", d: "Un écran dans chaque site affiche un code signé qui change toutes les 15 secondes." },
                  { icon: MapPin, t: "Position vérifiée", d: "Le salarié doit être dans le rayon du site, avec un GPS assez précis ; les fausses positions sont rejetées." },
                  { icon: Smartphone, t: "Un téléphone par salarié", d: "Un nouveau téléphone doit être approuvé par les RH : impossible de pointer pour un collègue." },
                  { icon: Timer, t: "Retards et absences automatiques", d: "Selon vos horaires et votre tolérance ; la journée se clôture seule (absent, sortie manquante)." },
                  { icon: ClipboardCheck, t: "Journal et corrections", d: "Chaque refus est expliqué et enregistré ; les corrections passent par le manager et restent tracées." },
                ].map(({ icon: Icon, t, d }) => (
                  <li key={t} className="flex gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </span>
                    <div>
                      <p className="font-semibold text-primary">{t}</p>
                      <p className="text-sm text-muted-foreground">{d}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            <Reveal delay={150}>
              <QrScreenMock />
            </Reveal>
          </div>
        </section>

        {/* Payslips */}
        <section id="bulletins" className="scroll-mt-20 bg-card">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionTitle
              eyebrow="Bulletins de paie"
              title="Un bulletin à votre image, en glisser-déposer"
              text="Choisissez parmi 20 modèles dès l’inscription, puis composez le vôtre : blocs, couleurs, mentions, rubriques et règles de calcul."
            />
            <Reveal className="mt-12">
              <PayslipShuffleGame />
            </Reveal>
            <div className="mt-10 grid gap-4 md:grid-cols-3">
              {[
                { t: "Éditeur glisser-déposer", d: "Ajoutez cumuls de l’année, solde de congés, heures, signatures ou texte libre ; déplacez les blocs, changez la couleur." },
                { t: "Rubriques et règles", d: "Glissez primes, cotisations et IGR depuis une bibliothèque ; conditions par service, contrat ou ancienneté, plancher et plafond." },
                { t: "PDF identique au modèle", d: "Téléchargé depuis le site ou partagé depuis l’application mobile, le PDF reprend exactement votre mise en page." },
              ].map((x) => (
                <div key={x.t} className="rounded-lg border border-border/70 bg-background p-5">
                  <p className="font-semibold text-primary">{x.t}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{x.d}</p>
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
              {steps.map((s, i) => (
                <Reveal key={s.n} delay={i * 140} className="border-t border-primary-foreground/20 pt-6">
                  <span className="font-mono text-sm text-gold">{s.n}</span>
                  <h3 className="mt-3 font-display text-xl font-semibold">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-primary-foreground/75">{s.text}</p>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* Mobile */}
        <PhoneStory />

        {/* Pricing */}
        <section id="tarifs" className="scroll-mt-20 bg-card">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <SectionTitle
              eyebrow="Tarifs"
              title="Un prix juste, par employé"
              text="Sans frais d’installation. Changez de formule à chaque renouvellement."
            />
            <div className="mt-12 grid gap-6 lg:grid-cols-3">
              {withPlanPricing(basePlans, Route.useLoaderData().pricing).map((p, i) => (
                <Reveal
                  key={p.name}
                  delay={i * 120}
                  className={
                    p.featured
                      ? "lp-lift relative rounded-2xl border-2 border-gold bg-background p-8 shadow-lg"
                      : "lp-lift rounded-2xl border border-border/70 bg-background p-8"
                  }
                >
                  {p.featured ? (
                    <span className="lp-pulse absolute -top-3 left-8 rounded-full bg-gold px-3 py-1 text-xs font-semibold text-gold-foreground">
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
                </Reveal>
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
          <Reveal className="relative mx-auto max-w-6xl overflow-hidden rounded-2xl bg-primary px-6 py-14 text-center text-primary-foreground md:px-12">
            <div aria-hidden className="lp-orb -right-16 -top-16 h-64 w-64 bg-gold/25" />
            <div aria-hidden className="lp-orb -bottom-20 -left-10 h-64 w-64 bg-reef/30" style={{ animationDelay: "-9s" }} />
            <h2 className="relative font-display text-3xl font-bold md:text-4xl">
              Prêt à simplifier votre paie ?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-primary-foreground/75">
              Créez votre compte entreprise aujourd’hui et éditez vos premiers bulletins dès ce mois-ci.
            </p>
            <Link
              to={loggedIn ? "/dashboard" : "/signup"}
              className="lp-shine relative mt-8 inline-flex items-center gap-2 rounded-md bg-gold px-6 py-3 font-semibold text-gold-foreground hover:brightness-95"
            >
              {loggedIn ? "Accéder à mon espace" : "Créer mon compte entreprise"}
              <ArrowRight className="h-4 w-4" />
            </Link>
            <div className="relative mt-6 flex justify-center">
              <PlayStoreBadge />
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row">
          <MshaharaLogo variant="full" className="h-8 w-auto" />
          <p>© {new Date().getFullYear()} Mshahara — Paie, RH et pointage.</p>
          <PlayStoreBadge compact />
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
    <Reveal className={align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <p className={`font-mono text-xs uppercase tracking-[0.25em] ${dark ? "text-gold" : "text-reef"}`}>
        {eyebrow}
      </p>
      <h2 className={`mt-3 font-display text-3xl font-bold md:text-4xl ${dark ? "" : "text-primary"}`}>
        {title}
      </h2>
      {text ? (
        <p className={`mt-4 ${dark ? "text-primary-foreground/75" : "text-muted-foreground"}`}>{text}</p>
      ) : null}
    </Reveal>
  );
}

/** Staggered animation delay, read by the .lp-enter / .lp-reveal classes. */
function delay(ms: number): CSSProperties {
  return { "--lp-delay": `${ms}ms` } as CSSProperties;
}

/** Fades its content in the first time it scrolls into view. */
function Reveal({
  children,
  delay: ms = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={delay(ms)} className={`lp-reveal ${visible ? "is-visible" : ""} ${className}`}>
      {children}
    </div>
  );
}

/** Counts the leading number of a key figure ("2,5 j") up from 0 when it appears. */
function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState(value);
  useEffect(() => {
    const match = /^(\d+)(?:,(\d+))?(.*)$/.exec(value);
    const el = ref.current;
    if (!match || !el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const decimals = match[2]?.length ?? 0;
    const target = Number(`${match[1]}.${match[2] ?? 0}`);
    const suffix = match[3];
    let frame = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / 1400);
        const eased = 1 - Math.pow(1 - t, 3);
        setShown(`${(target * eased).toFixed(decimals).replace(".", ",")}${suffix}`);
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value]);
  return <span ref={ref}>{shown}</span>;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Scroll progress (0 → 1) of a tall section while it is pinned: 0 when its top
 * reaches the top of the screen, 1 when its bottom reaches the bottom.
 */
function useScrollProgress<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      setProgress(1);
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const travel = rect.height - window.innerHeight;
      const value = travel > 0 ? -rect.top / travel : 1;
      setProgress(Math.min(1, Math.max(0, value)));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return [ref, progress] as const;
}

/** Starts tilted back in 3D and lies flat as the page scrolls (Apple-style hero). */
function TiltOnScroll({ children }: { children: ReactNode }) {
  const [amount, setAmount] = useState(1);
  useEffect(() => {
    if (prefersReducedMotion()) {
      setAmount(0);
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      setAmount(Math.max(0, 1 - window.scrollY / 420));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);
  return (
    <div style={{ perspective: "1200px" }}>
      <div
        style={{
          transform: `rotateX(${amount * 16}deg) rotateY(${amount * -8}deg) scale(${1 - amount * 0.06})`,
          transformOrigin: "center top",
          transition: "transform 0.15s linear",
          willChange: "transform",
        }}
      >
        {children}
      </div>
    </div>
  );
}

/** Big statement whose words light up one by one while the section is pinned. */
function ScrollWords({ text }: { text: string }) {
  const [ref, progress] = useScrollProgress<HTMLElement>();
  const words = text.split(" ");
  // Finish lighting a little before the end so the full sentence rests on screen.
  const lit = Math.min(1, progress / 0.8) * words.length;
  return (
    <section ref={ref} className="relative h-[220vh] bg-background">
      <div className="sticky top-0 flex h-screen items-center">
        <p className="mx-auto max-w-5xl px-4 text-center font-display text-3xl font-bold leading-tight md:text-6xl">
          {words.map((word, i) => {
            const t = Math.min(1, Math.max(0, lit - i));
            return (
              <span
                key={`${word}-${i}`}
                className="text-primary transition-opacity duration-200"
                style={{ opacity: 0.12 + t * 0.88 }}
              >
                {word}{" "}
              </span>
            );
          })}
        </p>
      </div>
    </section>
  );
}

const PHONE_STAGES = [
  {
    eyebrow: "Pointage",
    title: "Badgez en un geste.",
    text: "Scan du QR code du site ou position GPS : l’heure et le statut s’affichent aussitôt, avec les retards calculés tout seuls.",
  },
  {
    eyebrow: "Congés et horaires",
    title: "Votre journée, sous les yeux.",
    text: "Horaire du jour, historique des présences, soldes de congés à jour et demandes envoyées directement au manager.",
  },
  {
    eyebrow: "Paie",
    title: "Votre bulletin dans la poche.",
    text: "Salaire, contrat et bulletins de paie à partager en PDF par WhatsApp ou e-mail. Les managers valident les congés de l’équipe.",
  },
];

/** Pinned phone that grows and straightens while three captions take turns. */
function PhoneStory() {
  const [ref, progress] = useScrollProgress<HTMLElement>();
  const intro = Math.min(1, progress * 3);
  const active = Math.min(PHONE_STAGES.length - 1, Math.floor(progress * PHONE_STAGES.length));
  return (
    <section id="mobile" ref={ref} className="relative h-[300vh] scroll-mt-20 bg-card">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden">
        <div aria-hidden className="lp-orb left-1/4 top-1/4 h-96 w-96 bg-reef/15" />
        <div className="relative mx-auto grid w-full max-w-6xl items-center gap-10 px-4 lg:grid-cols-2">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.25em] text-reef">Application mobile</p>
            <div className="relative mt-4 min-h-[13rem] md:min-h-[15rem]">
              {PHONE_STAGES.map((stage, i) => (
                <div
                  key={stage.title}
                  aria-hidden={i !== active}
                  className="absolute inset-0 transition-all duration-700 ease-out"
                  style={{
                    opacity: i === active ? 1 : 0,
                    transform: `translateY(${i === active ? 0 : i < active ? -24 : 24}px)`,
                    filter: i === active ? "none" : "blur(6px)",
                  }}
                >
                  <p className="text-sm font-semibold text-gold">{stage.eyebrow}</p>
                  <h2 className="mt-2 font-display text-3xl font-bold text-primary md:text-5xl">{stage.title}</h2>
                  <p className="mt-4 max-w-md text-muted-foreground">{stage.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2" aria-hidden>
              {PHONE_STAGES.map((stage, i) => (
                <span
                  key={stage.title}
                  className="h-1.5 rounded-full bg-primary transition-all duration-500"
                  style={{ width: i === active ? 32 : 8, opacity: i === active ? 1 : 0.25 }}
                />
              ))}
            </div>
            <div className="mt-8">
              <PlayStoreBadge />
              <p className="mt-3 text-xs text-muted-foreground">
                Android 8 et plus · Les identifiants sont fournis par votre service RH.
              </p>
            </div>
          </div>
          <div
            className="hidden sm:block"
            style={{
              transform: `scale(${0.82 + intro * 0.18}) rotate(${(1 - intro) * -8}deg) translateY(${(1 - intro) * 60}px)`,
              opacity: 0.4 + intro * 0.6,
              transition: "transform 0.15s linear, opacity 0.15s linear",
            }}
          >
            <PhoneMock />
          </div>
        </div>
      </div>
    </section>
  );
}

type DragState = {
  name: string;
  pointerId: number;
  startX: number;
  startY: number;
  dx: number;
  dy: number;
  tilt: number;
  frame: number;
  /** Slot position before a swap, to keep the card under the pointer afterwards. */
  pending: { x: number; y: number } | null;
};

/** Payslip preview + caption; memoised so dragging never re-renders it. */
const ShowcaseCardBody = memo(function ShowcaseCardBody({ name }: { name: string }) {
  const m = SHOWCASE_LAYOUTS.find((x) => x.name === name)!;
  return (
    <>
      <div className="pointer-events-none h-64 overflow-hidden bg-muted/40" aria-hidden>
        <div className="origin-top-left scale-[0.34]" style={{ width: "294%" }}>
          <PayslipRenderer slip={SAMPLE_PAYSLIP} layout={m.layout} />
        </div>
      </div>
      <div className="border-t p-4">
        <p className="font-semibold text-primary">{m.name}</p>
        <p className="text-xs text-muted-foreground">{m.text}</p>
      </div>
    </>
  );
});

/**
 * Payslip templates as a little game: grab a card (mouse or finger), it follows
 * the pointer with a tilt, the others glide aside (FLIP animation) to make room.
 * The dragged card is moved straight on the DOM, once per frame: React only
 * re-renders when the order changes.
 */
function PayslipShuffleGame() {
  const [order, setOrder] = useState(() => SHOWCASE_LAYOUTS.map((m) => m.name));
  const [dragging, setDragging] = useState<string | null>(null);
  const [moves, setMoves] = useState(0);
  const cards = useRef(new Map<string, HTMLDivElement>());
  const lastRects = useRef(new Map<string, DOMRect>());
  const drag = useRef<DragState | null>(null);

  const paint = () => {
    const d = drag.current;
    if (!d) return;
    d.frame = 0;
    const el = cards.current.get(d.name);
    if (el) el.style.transform = `translate3d(${d.dx}px, ${d.dy}px, 0) rotate(${d.tilt}deg) scale(1.05)`;
  };
  const schedulePaint = () => {
    const d = drag.current;
    if (d && !d.frame) d.frame = requestAnimationFrame(paint);
  };

  // After every reorder: keep the dragged card under the pointer, and slide the
  // others from their old slot to the new one (FLIP).
  useLayoutEffect(() => {
    const d = drag.current;
    if (d?.pending) {
      const el = cards.current.get(d.name);
      if (el) {
        const shiftX = el.offsetLeft - d.pending.x;
        const shiftY = el.offsetTop - d.pending.y;
        d.startX += shiftX;
        d.startY += shiftY;
        d.dx -= shiftX;
        d.dy -= shiftY;
        paint();
      }
      d.pending = null;
    }
    const reduce = prefersReducedMotion();
    for (const [name, el] of cards.current) {
      const before = lastRects.current.get(name);
      const after = { left: el.offsetLeft, top: el.offsetTop } as DOMRect;
      lastRects.current.set(name, after);
      if (!before || reduce || name === d?.name) continue;
      const dx = before.left - after.left;
      const dy = before.top - after.top;
      if (!dx && !dy) continue;
      el.animate(
        [{ transform: `translate3d(${dx}px, ${dy}px, 0)` }, { transform: "translate3d(0, 0, 0)" }],
        { duration: 420, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
    }
  }, [order]);

  const move = (name: string, to: number) => {
    setOrder((current) => {
      const from = current.indexOf(name);
      if (from === to || from < 0) return current;
      const next = [...current];
      next.splice(from, 1);
      next.splice(to, 0, name);
      return next;
    });
  };

  const onPointerDown = (name: string) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || drag.current) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a nicety (keeps events when the pointer outruns the card).
    }
    drag.current = {
      name,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      tilt: 0,
      frame: 0,
      pending: null,
    };
    setDragging(name);
    schedulePaint();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const dx = e.clientX - d.startX;
    // Tilt follows horizontal speed and eases back when the pointer slows down.
    d.tilt = Math.max(-10, Math.min(10, d.tilt * 0.8 + (dx - d.dx) * 0.5));
    d.dx = dx;
    d.dy = e.clientY - d.startY;
    schedulePaint();

    if (d.pending) return;
    for (const [name, el] of cards.current) {
      if (name === d.name) continue;
      const r = el.getBoundingClientRect();
      if (e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom) {
        const self = cards.current.get(d.name)!;
        d.pending = { x: self.offsetLeft, y: self.offsetTop };
        move(d.name, order.indexOf(name));
        setMoves((m) => m + 1);
        break;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.pointerId) return;
    cancelAnimationFrame(d.frame);
    drag.current = null;
    const el = cards.current.get(d.name);
    if (el) {
      el.style.transform = "";
      // Spring back into the slot from wherever the card was dropped.
      el.animate(
        [
          { transform: `translate3d(${d.dx}px, ${d.dy}px, 0) rotate(${d.tilt}deg) scale(1.05)` },
          { transform: "translate3d(0, 0, 0) rotate(0) scale(1)" },
        ],
        { duration: 450, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
      );
    }
    setDragging(null);
  };

  const shuffle = () => {
    setOrder((current) => {
      const next = [...current];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
    setMoves((m) => m + 1);
  };

  const favourite = order[0];

  return (
    <div>
      <div className="mb-5 flex flex-col items-center justify-between gap-3 sm:flex-row">
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Hand className="h-4 w-4 text-gold" />
          Attrapez un bulletin et déplacez-le : votre préféré prend la première place.
        </p>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/10 px-3 py-1 font-mono text-xs text-primary">
            {moves} déplacement{moves > 1 ? "s" : ""}
          </span>
          <button
            type="button"
            onClick={shuffle}
            className="inline-flex items-center gap-1.5 rounded-md border border-primary/25 px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
          >
            <Shuffle className="h-3.5 w-3.5" />
            Mélanger
          </button>
        </div>
      </div>

      <div className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {order.map((name, index) => {
          const isDragged = dragging === name;
          return (
            <div
              key={name}
              ref={(el) => {
                if (el) cards.current.set(name, el);
                else cards.current.delete(name);
              }}
              onPointerDown={onPointerDown(name)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowUp") move(name, Math.max(0, index - 1));
                if (e.key === "ArrowRight" || e.key === "ArrowDown") move(name, Math.min(order.length - 1, index + 1));
              }}
              tabIndex={0}
              role="button"
              aria-label={`${name}, position ${index + 1} sur ${order.length}. Flèches pour déplacer.`}
              className={`relative select-none overflow-hidden rounded-xl border bg-background outline-none focus-visible:ring-2 focus-visible:ring-gold ${
                isDragged
                  ? "z-20 cursor-grabbing border-gold shadow-2xl"
                  : "cursor-grab border-border/70 shadow-sm transition-shadow duration-300 hover:shadow-lg"
              }`}
              style={{ touchAction: "none", willChange: isDragged ? "transform" : undefined }}
            >
              <span
                className={`absolute left-3 top-3 z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold shadow transition-colors duration-300 ${
                  name === favourite ? "bg-gold text-gold-foreground" : "bg-background/90 text-primary"
                }`}
              >
                {name === favourite ? <Star className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <ShowcaseCardBody name={name} />
            </div>
          );
        })}
      </div>

      <p className="mt-5 text-center text-sm text-muted-foreground">
        Votre préféré :{" "}
        <span key={favourite} className="lp-enter inline-block font-semibold text-primary">
          {favourite}
        </span>
      </p>
    </div>
  );
}

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=km.ankibapay.employee";

/** "Disponible sur Google Play" badge linking to the employee app. */
function PlayStoreBadge({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href={PLAY_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Disponible sur Google Play"
      className={`group inline-flex items-center rounded-xl border border-white/15 bg-black text-white shadow-lg transition-all duration-300 hover:-translate-y-0.5 hover:shadow-xl ${
        compact ? "gap-2 px-3 py-1.5" : "gap-3 px-4 py-2.5"
      }`}
    >
      <svg
        viewBox="0 0 512 512"
        className={`${compact ? "h-5 w-5" : "h-7 w-7"} transition-transform duration-300 group-hover:scale-110`}
        aria-hidden
      >
        <path fill="#00A0FF" d="M64 32 L288 256 L64 480 Q48 472 48 452 V60 Q48 40 64 32Z" />
        <path fill="#00F076" d="M64 32 L288 256 L360 184 L96 34 Q78 24 64 32Z" />
        <path fill="#FF3A44" d="M64 480 L288 256 L360 328 L96 478 Q78 488 64 480Z" />
        <path fill="#FFD500" d="M360 184 L288 256 L360 328 L448 278 Q472 264 472 256 Q472 248 448 234Z" />
      </svg>
      <span className="flex flex-col text-left leading-none">
        <span className={`${compact ? "text-[8px]" : "text-[10px]"} uppercase tracking-wider text-white/80`}>
          Disponible sur
        </span>
        <span className={`${compact ? "mt-0.5 text-sm" : "mt-1 text-lg"} font-semibold tracking-tight`}>
          Google Play
        </span>
      </span>
    </a>
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

/** Four payslip templates shown on the landing page (same renderer as the app). */
const SHOWCASE_LAYOUTS: { name: string; text: string; layout: PayslipLayout }[] = [
  {
    name: "Moderne",
    text: "Net à payer en bannière, mise en page aérée.",
    layout: {
      theme: { accent: "#0E4C56", font: "sans", density: "comfortable" },
      blocks: [
        { id: "a", type: "company_header", options: { align: "banner" } },
        { id: "b", type: "net_highlight", options: { style: "banner" } },
        { id: "c", type: "employee_info", options: {} },
        { id: "d", type: "earnings_table", options: { showBaseRate: false } },
        { id: "e", type: "deductions_table", options: { showBaseRate: false } },
      ],
    },
  },
  {
    name: "Officiel Comores",
    text: "Administratif complet, cachet et signatures.",
    layout: {
      theme: { accent: "#14532D", font: "serif", density: "comfortable" },
      blocks: [
        { id: "a", type: "company_header", options: { align: "center" } },
        { id: "b", type: "title_period", options: { title: "Bulletin de salaire" } },
        { id: "c", type: "employee_info", options: {} },
        { id: "d", type: "earnings_table", options: {} },
        { id: "e", type: "deductions_table", options: {} },
        { id: "f", type: "net_highlight", options: { style: "line" } },
        { id: "g", type: "signatures", options: {} },
      ],
    },
  },
  {
    name: "Corporate Bleu",
    text: "Bandeau bleu et récapitulatif chiffré.",
    layout: {
      theme: { accent: "#1D4ED8", font: "sans", density: "comfortable" },
      blocks: [
        { id: "a", type: "company_header", options: { align: "banner" } },
        { id: "b", type: "title_period", options: {} },
        { id: "c", type: "employee_info", options: {} },
        { id: "d", type: "earnings_table", options: {} },
        { id: "e", type: "totals_summary", options: {} },
      ],
    },
  },
  {
    name: "Élégant Bordeaux",
    text: "Police élégante, net encadré en haut.",
    layout: {
      theme: { accent: "#881337", font: "serif", density: "comfortable" },
      blocks: [
        { id: "a", type: "company_header", options: {} },
        { id: "b", type: "net_highlight", options: { style: "box" } },
        { id: "c", type: "title_period", options: {} },
        { id: "d", type: "employee_info", options: {} },
        { id: "e", type: "earnings_table", options: {} },
        { id: "f", type: "deductions_table", options: {} },
      ],
    },
  },
];

/** Illustration of the site screen showing the rotating QR code. */
function QrScreenMock() {
  // Static, decorative QR-like pattern.
  const cells = Array.from({ length: 21 * 21 }, (_, i) => {
    const x = i % 21;
    const y = Math.floor(i / 21);
    const finder = (cx: number, cy: number) =>
      x >= cx && x < cx + 7 && y >= cy && y < cy + 7 &&
      (x === cx || x === cx + 6 || y === cy || y === cy + 6 || (x >= cx + 2 && x <= cx + 4 && y >= cy + 2 && y <= cy + 4));
    if (finder(0, 0) || finder(14, 0) || finder(0, 14)) return true;
    if ((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12)) return false;
    return ((x * 7 + y * 13 + x * y) % 5) < 2;
  });
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="rounded-2xl border-8 border-[#16211F] bg-primary p-6 text-center text-primary-foreground shadow-2xl">
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono uppercase tracking-[0.2em] text-gold">Siège Moroni</span>
          <span className="font-display text-lg font-bold">08:02:41</span>
        </div>
        <div className="mx-auto mt-5 w-56 rounded-xl bg-white p-3">
          <div className="grid" style={{ gridTemplateColumns: "repeat(21, 1fr)" }}>
            {cells.map((on, i) => (
              <span key={i} className={`aspect-square ${on ? "bg-[#16211F]" : ""}`} />
            ))}
          </div>
        </div>
        <div className="mx-auto mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-white/20">
          <div className="h-full w-2/3 bg-gold" />
        </div>
        <p className="mt-2 text-xs text-primary-foreground/80">Nouveau code dans 10 s · scannez avec l’app Mshahara</p>
      </div>
      <div className="mx-auto -mt-4 w-40 rounded-b-xl bg-[#16211F] py-2" />
      <div className="mx-auto mt-6 flex max-w-xs items-center gap-3 rounded-xl border bg-card p-4 text-sm shadow">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-success/15 text-success">
          <Check className="h-4 w-4" />
        </span>
        <div>
          <p className="font-semibold">Entrée 08:02 — à l’heure</p>
          <p className="text-xs text-muted-foreground">Siège Moroni · 6 m · QR + GPS</p>
        </div>
      </div>
    </div>
  );
}
