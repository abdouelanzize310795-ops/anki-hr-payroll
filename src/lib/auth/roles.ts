import type { AppRole } from "@/lib/auth/types";
import type { AuthUser } from "@/lib/auth/types";

export function getUserRole(user: AuthUser | null | undefined): AppRole {
  return user?.profile?.role ?? "employee";
}

export function isEmployerLike(role: AppRole): boolean {
  return role === "employer" || role === "hr" || role === "platform_admin";
}

export function isManagerLike(role: AppRole): boolean {
  return role === "manager" || isEmployerLike(role);
}

/** Nav URLs allowed per role — aligned with product workflows. */
export const NAV_BY_ROLE: Record<AppRole, Set<string>> = {
  platform_admin: new Set([
    "/", "/companies", "/employees", "/recruitment", "/contracts",
    "/attendance", "/leave", "/payroll", "/accounting", "/transfers",
    "/training", "/performance", "/tasks",
    "/documents", "/assets", "/reports", "/notifications",
    "/ai", "/subscriptions", "/admin", "/settings",
  ]),
  employer: new Set([
    "/", "/companies", "/employees", "/recruitment", "/contracts",
    "/attendance", "/leave", "/payroll", "/accounting", "/transfers",
    "/training", "/performance", "/tasks",
    "/documents", "/assets", "/reports", "/notifications",
    "/ai", "/subscriptions", "/settings",
  ]),
  hr: new Set([
    "/", "/companies", "/employees", "/recruitment", "/contracts",
    "/attendance", "/leave", "/payroll", "/accounting", "/transfers",
    "/training", "/performance", "/tasks",
    "/documents", "/assets", "/reports", "/notifications",
    "/ai", "/subscriptions", "/settings",
  ]),
  manager: new Set([
    "/", "/employees", "/attendance", "/leave", "/tasks",
    "/performance", "/documents", "/reports", "/notifications",
    "/ai", "/settings",
  ]),
  employee: new Set([
    "/", "/attendance", "/leave", "/tasks",
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
    title: "Cycle mensuel RH & paie",
    steps: [
      { n: 1, title: "Créer l’entreprise", subtitle: "Paramètres et rubriques de paie", href: "/companies" },
      { n: 2, title: "Ajouter les employés", subtitle: "Fiches et contrats électroniques", href: "/employees" },
      { n: 3, title: "Suivre le mois", subtitle: "Pointage, tâches, congés", href: "/attendance" },
      { n: 4, title: "Valider et générer la paie", subtitle: "Justificatifs et bulletins", href: "/payroll" },
      { n: 5, title: "Payer et transmettre", subtitle: "Virements et envoi des bulletins", href: "/transfers" },
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
    badge: "Parcours admin plateforme",
    title: "Superviser AnkibaPay",
    steps: [
      { n: 1, title: "Créer une entreprise cliente", subtitle: "Compte et accès initial", href: "/companies" },
      { n: 2, title: "Paramétrer le cadre légal", subtitle: "SMIG, I.G.R., caisse de retraite", href: "/payroll" },
      { n: 3, title: "Superviser la plateforme", subtitle: "Disponibilité et sécurité", href: "/admin" },
      { n: 4, title: "Accompagner les clients", subtitle: "Support et mises à jour", href: "/admin" },
    ],
  },
};
