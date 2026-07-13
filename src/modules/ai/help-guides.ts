/**
 * Guided how-to answers for AnkibaPay (French).
 * Matched before live-data intents when the user asks "comment…".
 */

export type HelpGuide = {
  id: string;
  /** Keywords / regexes tested against normalized question (accents stripped). */
  patterns: RegExp[];
  answer: string;
  hints: string[];
  /** If set, only these roles see this guide. */
  roles?: Array<"employee" | "manager" | "hr" | "employer" | "platform_admin">;
};

export const HELP_GUIDES: HelpGuide[] = [
  {
    id: "create-ticket",
    patterns: [
      /comment.*(creer|ouvrir|faire|soumettre).*ticket/,
      /comment.*helpdesk/,
      /creer.*ticket/,
      /ouvrir.*ticket/,
      /nouveau ticket/,
      /faire.*demande.*support/,
    ],
    answer:
      "Pour **créer un ticket helpdesk** :\n" +
      "1. Ouvrez **Helpdesk** dans le menu.\n" +
      "2. Cliquez **Nouveau ticket**.\n" +
      "3. Renseignez le titre, la description, la catégorie et la priorité.\n" +
      "4. Assignez à **un département** ou **une personne**.\n" +
      "5. Joignez une **photo** si besoin, puis **Soumettre**.\n" +
      "Ensuite : votre **manager** valide → le service assigné traite (Prendre en charge → Résoudre).",
    hints: [
      "Comment valider un ticket ?",
      "Comment pointer ?",
      "Comment demander un congé ?",
    ],
  },
  {
    id: "validate-ticket",
    patterns: [
      /comment.*(valider|approuver|refuser).*ticket/,
      /comment.*prendre en charge/,
      /comment.*traiter.*ticket/,
    ],
    answer:
      "Cycle d’un ticket :\n" +
      "1. **Manager du demandeur** : Approuver ou Refuser (statut « En attente manager »).\n" +
      "2. Après approbation, le **département / personne assigné(e)** reçoit une notification.\n" +
      "3. Un membre du service clique **Prendre en charge** (son nom s’affiche).\n" +
      "4. Puis **Résoudre**, et le demandeur peut **Clôturer**.\n" +
      "Menu : **Helpdesk**.",
    hints: [
      "Comment créer un ticket ?",
      "Tickets helpdesk ouverts",
      "Qui a pris un ticket ?",
    ],
    roles: ["manager", "hr", "employer", "employee"],
  },
  {
    id: "clock-in",
    patterns: [
      /comment.*(pointer|badger|pointage)/,
      /comment.*(entree|sortie)/,
      /faire.*pointage/,
    ],
    answer:
      "Pour **pointer** :\n" +
      "1. Allez dans **Pointage**.\n" +
      "2. Cliquez **Entrée** le matin, puis **Sortie** en fin de journée.\n" +
      "3. Les employés voient leurs pointages du **mois** ; la RH voit la présence du jour.\n" +
      "Astuce : un retard est marqué automatiquement selon l’heure d’entrée.",
    hints: [
      "Mon pointage",
      "Présence du jour",
      "Comment demander un congé ?",
    ],
  },
  {
    id: "request-leave",
    patterns: [
      /comment.*(demander|poser|faire).*conge/,
      /demande.*conge/,
      /poser.*conge/,
    ],
    answer:
      "Pour **demander un congé** :\n" +
      "1. Ouvrez **Congés**.\n" +
      "2. Créez une demande (type, dates, motif).\n" +
      "3. Si vous êtes **manager de département**, désignez un **remplaçant** pour vos dates.\n" +
      "4. Validation : **manager** → puis **RH**.\n" +
      "Vous êtes notifié à chaque étape (et immédiatement si refus manager).",
    hints: [
      "Mes congés",
      "Qui est en congé ?",
      "Comment pointer ?",
    ],
  },
  {
    id: "approve-leave",
    patterns: [
      /comment.*(valider|approuver).*conge/,
      /comment.*refuser.*conge/,
    ],
    answer:
      "Pour **valider un congé** :\n" +
      "1. Allez dans **Congés**.\n" +
      "2. Les managers voient les demandes **en attente manager** de leur équipe.\n" +
      "3. Approuvez ou refusez (le collaborateur est notifié).\n" +
      "4. Si approuvé, la demande passe à la **RH** pour validation finale.\n" +
      "Menu notifications : cloche / **Notifications**.",
    hints: [
      "Qui est en congé ?",
      "Comment demander un congé ?",
    ],
    roles: ["manager", "hr", "employer"],
  },
  {
    id: "create-employee",
    patterns: [
      /comment.*(ajouter|creer).*employ/,
      /comment.*(ajouter|creer).*collabor/,
      /nouvelle fiche/,
    ],
    answer:
      "Pour **ajouter un employé** :\n" +
      "1. Menu **Employés** → créer une fiche (identité, poste, salaire, département).\n" +
      "2. Créez un **contrat**, puis **activez**-le : un compte d’accès est provisionné.\n" +
      "3. Les identifiants temporaires s’affichent une fois (changement de mot de passe à la 1ʳᵉ connexion).\n" +
      "La RH peut aussi assigner un **manager de département** depuis Employés / Équipe.",
    hints: [
      "Comment créer un contrat ?",
      "Comment calculer la paie ?",
      "Effectif actif",
    ],
    roles: ["hr", "employer"],
  },
  {
    id: "create-contract",
    patterns: [
      /comment.*(creer|faire|activer).*contrat/,
      /comment.*activer.*contrat/,
    ],
    answer:
      "Pour **créer / activer un contrat** :\n" +
      "1. Menu **Contrats** → **Nouveau contrat** (lié à un employé).\n" +
      "2. Remplissez type, dates, salaire, horaires.\n" +
      "3. Envoyez → faites signer → **Activez**.\n" +
      "À l’activation, le compte employé est créé ou lié automatiquement.",
    hints: [
      "État des contrats",
      "Comment ajouter un employé ?",
    ],
    roles: ["hr", "employer", "manager"],
  },
  {
    id: "run-payroll",
    patterns: [
      /comment.*(calculer|lancer|faire|generer).*paie/,
      /comment.*bulletin/,
      /cycle.*paie/,
    ],
    answer:
      "Pour **calculer la paie** :\n" +
      "1. Menu **Paie** → créer un **cycle** (mois / année).\n" +
      "2. Lancez le **calcul** : il s’appuie sur le pointage (heures + heures supp. selon le paramètre entreprise).\n" +
      "3. Vérifiez les bulletins, puis validez / approuvez selon votre processus.\n" +
      "4. Ensuite : **Virements** pour le paiement bancaire.\n" +
      "Les taux et rubriques se configurent dans les paramètres entreprise (pas de taux figés).",
    hints: [
      "Résumé de la paie",
      "Présence du jour",
      "Comment pointer ?",
    ],
    roles: ["hr", "employer"],
  },
  {
    id: "assign-manager",
    patterns: [
      /comment.*(assigner|definir|nommer).*manager/,
      /manager.*departement/,
      /responsable.*departement/,
    ],
    answer:
      "Pour **assigner un manager de département** :\n" +
      "1. Connectez-vous en **RH**.\n" +
      "2. Allez dans **Employés** → panneau **Managers de département**.\n" +
      "3. Choisissez le département et l’employé responsable.\n" +
      "Seul le rôle RH peut faire cette affectation. Le manager valide ensuite les congés de son équipe.",
    hints: [
      "Comment valider un congé ?",
      "Effectif actif",
    ],
    roles: ["hr", "employer"],
  },
  {
    id: "view-payslip",
    patterns: [
      /comment.*(voir|consulter|ouvrir).*bulletin/,
      /ou.*est.*mon.*bulletin/,
      /trouver.*bulletin/,
    ],
    answer:
      "Pour **voir votre bulletin** :\n" +
      "1. Menu **Paie**.\n" +
      "2. Ouvrez votre bulletin du mois (les employés ne voient que les leurs).\n" +
      "Vous pouvez aussi me demander « Mon bulletin » ici.",
    hints: ["Mon bulletin", "Mes congés", "Mon pointage"],
  },
  {
    id: "change-password",
    patterns: [
      /comment.*(changer|modifier).*mot de passe/,
      /premiere.*connexion/,
      /changer.*password/,
    ],
    answer:
      "À la **première connexion** avec un mot de passe temporaire, AnkibaPay impose le **changement de mot de passe**.\n" +
      "Ensuite : **Paramètres** pour mettre à jour votre profil. En cas d’oubli, contactez la RH / l’employeur.",
    hints: [
      "Comment pointer ?",
      "Comment demander un congé ?",
    ],
  },
  {
    id: "notifications",
    patterns: [
      /comment.*(voir|lire).*notif/,
      /ou.*sont.*les.*notif/,
      /cloche/,
    ],
    answer:
      "Les **notifications** (congés, tickets, paie…) sont dans le menu **Notifications**, et via la cloche selon l’écran.\n" +
      "Exemples : ticket à valider, congé refusé, prise en charge d’un ticket, bulletin disponible.",
    hints: [
      "Comment créer un ticket ?",
      "Comment demander un congé ?",
    ],
  },
  {
    id: "what-can-i-ask",
    patterns: [
      /que.*puis.?je.*(demander|faire|poser)/,
      /aide/,
      /help/,
      /comment.*utiliser.*(assistant|ia|ankiba)/,
      /que.*sais.?tu.*faire/,
      /quelles.*questions/,
    ],
    answer:
      "Je peux vous aider de deux façons :\n" +
      "**1. Guides** — « Comment créer un ticket ? », « Comment pointer ? », « Comment demander un congé ? », « Comment calculer la paie ? »…\n" +
      "**2. Données live** — effectif, présence du jour, congés en attente, résumé paie, tickets ouverts, qui traite un ticket.\n" +
      "Selon votre rôle, les réponses sont limitées à ce que vous avez le droit de voir.",
    hints: [
      "Comment créer un ticket ?",
      "Comment pointer ?",
      "Comment demander un congé ?",
      "Effectif actif",
    ],
  },
];

export function matchHelpGuide(
  normalizedQuestion: string,
  role: string,
): HelpGuide | null {
  for (const guide of HELP_GUIDES) {
    if (guide.roles && !guide.roles.includes(role as NonNullable<HelpGuide["roles"]>[number])) {
      continue;
    }
    if (guide.patterns.some((p) => p.test(normalizedQuestion))) {
      return guide;
    }
  }
  return null;
}
