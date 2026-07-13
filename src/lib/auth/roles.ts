import type { AppRole } from "@/lib/auth/types";
import type { AuthUser } from "@/lib/auth/types";

export function getUserRole(user: AuthUser | null | undefined): AppRole {
  return user?.profile?.role ?? "employee";
}

/** Tenant RH operators — never includes platform_admin. */
export function isEmployerLike(role: AppRole): boolean {
  return role === "employer" || role === "hr";
}

export function isManagerLike(role: AppRole): boolean {
  return role === "manager" || isEmployerLike(role);
}

/** Routes allowed for platform console (ops SaaS). */
export const PLATFORM_ADMIN_ROUTES = new Set([
  "/",
  "/admin",
  "/companies",
  "/company-access",
  "/notifications",
  "/settings",
]);

/** Nav URLs allowed per role — console ops ≠ workspace RH. */
export const NAV_BY_ROLE: Record<AppRole, Set<string>> = {
  platform_admin: new Set([
    "/",
    "/admin",
    "/companies",
    "/notifications",
    "/settings",
  ]),
  employer: new Set([
    "/", "/companies", "/employees", "/recruitment", "/contracts",
    "/attendance", "/leave", "/helpdesk", "/payroll", "/accounting", "/transfers",
    "/training", "/performance", "/tasks",
    "/documents", "/assets", "/reports", "/notifications",
    "/ai", "/subscriptions", "/settings",
  ]),
  hr: new Set([
    "/", "/companies", "/employees", "/recruitment", "/contracts",
    "/attendance", "/leave", "/helpdesk", "/payroll", "/accounting", "/transfers",
    "/training", "/performance", "/tasks",
    "/documents", "/assets", "/reports", "/notifications",
    "/ai", "/subscriptions", "/settings",
  ]),
  manager: new Set([
    "/", "/employees", "/attendance", "/leave", "/helpdesk", "/tasks",
    "/performance", "/documents", "/reports", "/notifications",
    "/ai", "/settings",
  ]),
  employee: new Set([
    "/", "/attendance", "/leave", "/helpdesk", "/tasks",
    "/contracts", "/payroll", "/documents", "/notifications",
    "/ai", "/settings",
  ]),
};

export type WorkflowStep = {
  n: number;
  title: string;
  subtitle: string;
  href: string;
};

export const WORKFLOWS: Record<AppRole, { badge: string; title: string; steps: WorkflowStep[] }> = {
  employer: {
    badge: "Parcours employeur",
    title: "Cycle mensuel RH & paie",
    steps: [
      { n: 1, title: "Créer l’entreprise", subtitle: "Paramètres et rubriques de paie", href: "/companies" },
      { n: 2, title: "Ajouter les employés", subtitle: "Fiches et contrats électroniques", href: "/employees" },
      { n: 3, title: "Suivre le mois", subtitle: "Pointage, tâches, congés", href: "/attendance" },
      { n: 4, title: "Valider et générer la paie", subtitle: "Justificatifs et bulletins", href: "/payroll" },
      { n: 5, title: "Payer et transmettre", subtitle: "Virements et envoi des bulletins", href: "/transfers" },
    ],
  },
  hr: {
    badge: "Parcours RH",
    title: "Cycle social & paie",
    steps: [
      { n: 1, title: "Assigner les managers", subtitle: "Un manager par département", href: "/employees" },
      { n: 2, title: "Gérer l’effectif", subtitle: "Employés, contrats, dossiers", href: "/employees" },
      { n: 3, title: "Valider les congés", subtitle: "Après le manager → accord final RH", href: "/leave" },
      { n: 4, title: "Calculer la paie", subtitle: "Heures, bulletins, approbation", href: "/payroll" },
      { n: 5, title: "Payer et transmettre", subtitle: "Virements et rapports", href: "/transfers" },
    ],
  },
  employee: {
    badge: "Parcours collaborateur",
    title: "Votre quotidien AnkibaPay",
    steps: [
      { n: 1, title: "Recevoir ses identifiants", subtitle: "Accès e-mail à l’application", href: "/settings" },
      { n: 2, title: "Se connecter et signer", subtitle: "Mot de passe et contrat", href: "/contracts" },
      { n: 3, title: "Badger chaque jour", subtitle: "Entrée et sortie", href: "/attendance" },
      { n: 4, title: "Déclarer tâches et congés", subtitle: "Activité quotidienne", href: "/leave" },
      { n: 5, title: "Recevoir son bulletin", subtitle: "Paie envoyée chaque mois", href: "/payroll" },
    ],
  },
  manager: {
    badge: "Parcours manager",
    title: "Piloter votre équipe",
    steps: [
      { n: 1, title: "Se connecter", subtitle: "Application web", href: "/" },
      { n: 2, title: "Consulter l’équipe", subtitle: "Présence, tâches, congés", href: "/attendance" },
      { n: 3, title: "Valider les demandes", subtitle: "Congés et justificatifs", href: "/leave" },
      { n: 4, title: "Suivre la performance", subtitle: "Évaluations et objectifs", href: "/performance" },
    ],
  },
  platform_admin: {
    badge: "Console plateforme",
    title: "Opérer AnkibaPay (SaaS)",
    steps: [
      { n: 1, title: "Suivre les inscriptions", subtitle: "Paiements et dossiers", href: "/admin" },
      { n: 2, title: "Valider les entreprises", subtitle: "Approuver ou refuser", href: "/admin" },
      { n: 3, title: "Piloter les tenants", subtitle: "Liste et santé des comptes", href: "/companies" },
      { n: 4, title: "Gérer votre compte ops", subtitle: "Sécurité et préférences", href: "/settings" },
    ],
  },
};
