import type { DocumentCategory } from "../types";

export type DocumentTemplateField =
  | "company"
  | "employee"
  | "dates"
  | "salary"
  | "job"
  | "bank"
  | "free_text";

export type DocumentTemplateDef = {
  id: string;
  category: DocumentCategory;
  title: string;
  shortLabel: string;
  description: string;
  /** Legal / usage note shown in UI */
  note?: string;
  fields: DocumentTemplateField[];
  /** Body paragraphs; placeholders: {{company}}, {{employee}}, {{job}}, {{salary}}, {{start}}, {{end}}, {{city}}, {{today}}, {{national_id}}, {{rib}}, {{manager}} */
  sections: Array<{ heading?: string; paragraphs: string[] }>;
};

export const DOCUMENT_TEMPLATES: DocumentTemplateDef[] = [
  // ── Contrats ──────────────────────────────────────────────
  {
    id: "contract_cdi",
    category: "contract",
    title: "Contrat de travail à durée indéterminée (CDI)",
    shortLabel: "CDI",
    description: "Modèle CDI conforme aux usages RH aux Comores.",
    note: "À adapter selon le Code du travail comorien et la convention applicable.",
    fields: ["company", "employee", "job", "salary", "dates"],
    sections: [
      {
        heading: "Article 1 — Engagement",
        paragraphs: [
          "La société {{company}}, sise à {{city}}, engage {{employee}} en qualité de {{job}}, à compter du {{start}}.",
          "Le présent contrat est conclu pour une durée indéterminée.",
        ],
      },
      {
        heading: "Article 2 — Lieu et horaires",
        paragraphs: [
          "Le lieu de travail principal est situé à {{city}}. Les horaires sont fixés selon le règlement intérieur et les besoins du service.",
        ],
      },
      {
        heading: "Article 3 — Rémunération",
        paragraphs: [
          "La rémunération mensuelle brute de base est fixée à {{salary}} KMF, payable selon le calendrier de paie de l’employeur.",
          "Les cotisations sociales et fiscales applicables seront prélevées conformément à la réglementation en vigueur.",
        ],
      },
      {
        heading: "Article 4 — Obligations",
        paragraphs: [
          "Le salarié s’engage à respecter le règlement intérieur, la confidentialité des informations et les consignes de sécurité.",
          "L’employeur s’engage à fournir les moyens nécessaires à l’exécution du poste et à verser la rémunération convenue.",
        ],
      },
      {
        heading: "Article 5 — Résiliation",
        paragraphs: [
          "Le contrat peut être rompu selon les modalités légales (démission, licenciement, rupture conventionnelle le cas échéant), avec respect des préavis applicables.",
        ],
      },
      {
        heading: "Signatures",
        paragraphs: [
          "Fait à {{city}}, le {{today}}, en deux exemplaires originaux.",
          "L’employeur : ________________        Le salarié : ________________",
        ],
      },
    ],
  },
  {
    id: "contract_cdd",
    category: "contract",
    title: "Contrat de travail à durée déterminée (CDD)",
    shortLabel: "CDD",
    description: "Modèle CDD avec date de fin et motif.",
    fields: ["company", "employee", "job", "salary", "dates"],
    sections: [
      {
        heading: "Article 1 — Objet",
        paragraphs: [
          "{{company}} engage {{employee}} en CDD au poste de {{job}}, du {{start}} au {{end}}.",
          "Motif : [remplacement / accroissement temporaire d’activité / projet — à préciser].",
        ],
      },
      {
        heading: "Article 2 — Rémunération",
        paragraphs: [
          "Rémunération mensuelle brute : {{salary}} KMF.",
        ],
      },
      {
        heading: "Article 3 — Fin de contrat",
        paragraphs: [
          "Sauf renouvellement écrit, le contrat prend fin automatiquement le {{end}} sans indemnité autre que celles prévues par la loi.",
        ],
      },
      {
        heading: "Signatures",
        paragraphs: [
          "Fait à {{city}}, le {{today}}.",
          "L’employeur : ________________        Le salarié : ________________",
        ],
      },
    ],
  },
  {
    id: "contract_stage",
    category: "contract",
    title: "Convention de stage",
    shortLabel: "Stage",
    description: "Convention tripartite stagiaire / entreprise / établissement.",
    fields: ["company", "employee", "job", "dates"],
    sections: [
      {
        heading: "Objet",
        paragraphs: [
          "Convention de stage entre {{company}} et {{employee}} pour le poste / mission : {{job}}.",
          "Période : du {{start}} au {{end}}.",
        ],
      },
      {
        heading: "Encadrement",
        paragraphs: [
          "Un tuteur est désigné au sein de l’entreprise. Le stage ne constitue pas un contrat de travail, sauf disposition contraire.",
        ],
      },
      {
        heading: "Signatures",
        paragraphs: [
          "Fait à {{city}}, le {{today}}.",
          "Entreprise : ________  Stagiaire : ________  Établissement : ________",
        ],
      },
    ],
  },
  {
    id: "contract_avenant",
    category: "contract",
    title: "Avenant au contrat de travail",
    shortLabel: "Avenant",
    description: "Modification de poste, salaire ou horaires.",
    fields: ["company", "employee", "job", "salary", "dates"],
    sections: [
      {
        paragraphs: [
          "Par le présent avenant, {{company}} et {{employee}} conviennent de modifier le contrat en vigueur à compter du {{start}}.",
          "Nouveau poste : {{job}}. Nouvelle rémunération brute mensuelle : {{salary}} KMF.",
          "Les autres clauses du contrat initial demeurent inchangées.",
          "Fait à {{city}}, le {{today}}.",
          "L’employeur : ________________        Le salarié : ________________",
        ],
      },
    ],
  },
  {
    id: "contract_promesse",
    category: "contract",
    title: "Promesse d’embauche",
    shortLabel: "Promesse",
    description: "Engagement d’embauche avant signature du contrat.",
    fields: ["company", "employee", "job", "salary", "dates"],
    sections: [
      {
        paragraphs: [
          "{{company}} confirme son intention d’embaucher {{employee}} au poste de {{job}}, à compter du {{start}}, pour une rémunération brute de {{salary}} KMF.",
          "Un contrat de travail sera remis pour signature avant la date d’entrée.",
          "Fait à {{city}}, le {{today}}.",
          "Pour l’employeur : ________________",
        ],
      },
    ],
  },

  // ── Bulletins & attestations paie ─────────────────────────
  {
    id: "payslip_modele",
    category: "payslip",
    title: "Modèle de bulletin de paie",
    shortLabel: "Bulletin",
    description: "Trame de bulletin (à compléter avec les rubriques entreprise).",
    fields: ["company", "employee", "salary", "dates", "job"],
    sections: [
      {
        heading: "En-tête",
        paragraphs: [
          "Employeur : {{company}} — {{city}}",
          "Salarié : {{employee}} — Poste : {{job}} — Pièce : {{national_id}}",
          "Période : du {{start}} au {{end}} — Édité le {{today}}",
        ],
      },
      {
        heading: "Rémunération",
        paragraphs: [
          "Salaire de base : {{salary}} KMF",
          "Primes / heures supp. : ________ KMF",
          "Brut total : ________ KMF",
          "Cotisations salariales : ________ KMF",
          "Net à payer : ________ KMF",
        ],
      },
      {
        heading: "Mentions",
        paragraphs: [
          "Document généré via AnkibaPay. Les taux et rubriques sont ceux configurés par l’entreprise.",
        ],
      },
    ],
  },
  {
    id: "payslip_attestation_salaire",
    category: "payslip",
    title: "Attestation de salaire",
    shortLabel: "Att. salaire",
    description: "Pour banque, visa ou organisme social.",
    fields: ["company", "employee", "salary", "job", "dates"],
    sections: [
      {
        paragraphs: [
          "Je soussigné(e), représentant de {{company}}, certifie que {{employee}} occupe le poste de {{job}} depuis le {{start}}.",
          "Sa rémunération mensuelle brute s’élève à {{salary}} KMF.",
          "La présente attestation est délivrée pour servir et valoir ce que de droit.",
          "Fait à {{city}}, le {{today}}.",
          "Cachet et signature : ________________",
        ],
      },
    ],
  },
  {
    id: "payslip_certificat_travail",
    category: "payslip",
    title: "Certificat de travail",
    shortLabel: "Cert. travail",
    description: "Remis en fin de contrat.",
    fields: ["company", "employee", "job", "dates"],
    sections: [
      {
        paragraphs: [
          "{{company}} certifie que {{employee}} a été employé(e) en qualité de {{job}} du {{start}} au {{end}}.",
          "Le présent certificat est délivré pour faire valoir ce que de droit.",
          "Fait à {{city}}, le {{today}}.",
          "L’employeur : ________________",
        ],
      },
    ],
  },
  {
    id: "payslip_attestation_emploi",
    category: "payslip",
    title: "Attestation d’emploi",
    shortLabel: "Att. emploi",
    description: "Confirmation d’emploi en cours.",
    fields: ["company", "employee", "job", "dates"],
    sections: [
      {
        paragraphs: [
          "{{company}} atteste que {{employee}} est actuellement employé(e) au poste de {{job}} depuis le {{start}}.",
          "Fait à {{city}}, le {{today}}.",
          "Signature : ________________",
        ],
      },
    ],
  },

  // ── Identité & conformité ─────────────────────────────────
  {
    id: "identity_fiche_rh",
    category: "identity",
    title: "Fiche d’identité RH",
    shortLabel: "Fiche RH",
    description: "Données administratives du collaborateur.",
    fields: ["company", "employee", "job", "bank"],
    sections: [
      {
        heading: "Identité",
        paragraphs: [
          "Nom complet : {{employee}}",
          "Pièce d’identité : {{national_id}}",
          "Poste : {{job}} — Entreprise : {{company}}",
        ],
      },
      {
        heading: "Coordonnées bancaires",
        paragraphs: [
          "RIB / IBAN : {{rib}}",
          "Banque : ________",
        ],
      },
      {
        heading: "Contacts d’urgence",
        paragraphs: [
          "Nom : ________  Téléphone : ________  Lien : ________",
        ],
      },
    ],
  },
  {
    id: "identity_autorisation_prelevement",
    category: "identity",
    title: "Autorisation de prélèvement / virement",
    shortLabel: "Autor. banque",
    description: "Mandat pour virement de salaire.",
    fields: ["company", "employee", "bank"],
    sections: [
      {
        paragraphs: [
          "Je, {{employee}}, autorise {{company}} à verser mon salaire sur le compte bancaire suivant : {{rib}}.",
          "Cette autorisation reste valable jusqu’à révocation écrite.",
          "Fait à {{city}}, le {{today}}.",
          "Signature du salarié : ________________",
        ],
      },
    ],
  },
  {
    id: "identity_declaration_cnss",
    category: "identity",
    title: "Fiche déclaration sociale (trame)",
    shortLabel: "Décl. sociale",
    description: "Trame pour organismes sociaux (CNSS / équivalent).",
    fields: ["company", "employee", "job", "salary", "dates"],
    sections: [
      {
        paragraphs: [
          "Employeur : {{company}} — Salarié : {{employee}} — Poste : {{job}}",
          "Date d’embauche : {{start}} — Salaire de référence : {{salary}} KMF",
          "Pièce d’identité : {{national_id}}",
          "À transmettre à l’organisme social compétent selon les échéances locales.",
          "Édité le {{today}} à {{city}}.",
        ],
      },
    ],
  },

  // ── Politiques ────────────────────────────────────────────
  {
    id: "policy_reglement",
    category: "policy",
    title: "Règlement intérieur",
    shortLabel: "Règlement",
    description: "Cadre disciplinaire et organisation du travail.",
    fields: ["company"],
    sections: [
      {
        heading: "Champ d’application",
        paragraphs: [
          "Le présent règlement s’applique à l’ensemble du personnel de {{company}}.",
        ],
      },
      {
        heading: "Horaires et présence",
        paragraphs: [
          "Les horaires sont communiqués par la direction. Toute absence doit être justifiée. Le pointage est obligatoire le cas échéant.",
        ],
      },
      {
        heading: "Discipline",
        paragraphs: [
          "Sont notamment interdits : harcèlement, discrimination, consommation d’alcool au travail, divulgation d’informations confidentielles.",
          "Les sanctions vont de l’avertissement au licenciement selon la gravité.",
        ],
      },
      {
        heading: "Santé et sécurité",
        paragraphs: [
          "Chaque collaborateur doit respecter les consignes de sécurité et signaler tout incident.",
        ],
      },
      {
        paragraphs: [
          "Fait à {{city}}, le {{today}}. Direction : ________________",
        ],
      },
    ],
  },
  {
    id: "policy_conges",
    category: "policy",
    title: "Politique de congés",
    shortLabel: "Pol. congés",
    description: "Règles d’acquisition et de validation des absences.",
    fields: ["company"],
    sections: [
      {
        paragraphs: [
          "Chez {{company}}, les congés sont demandés via AnkibaPay et validés par le manager / RH.",
          "Le solde est calculé selon les types de congés configurés par l’entreprise.",
          "Les demandes doivent être déposées autant que possible 7 jours à l’avance, sauf urgence.",
          "Édité le {{today}}.",
        ],
      },
    ],
  },
  {
    id: "policy_charte_info",
    category: "policy",
    title: "Charte informatique",
    shortLabel: "Charte IT",
    description: "Usage des outils numériques et données.",
    fields: ["company"],
    sections: [
      {
        paragraphs: [
          "Les équipements et comptes fournis par {{company}} sont destinés à un usage professionnel.",
          "Il est interdit de partager ses identifiants, d’installer des logiciels non autorisés ou d’extraire des données hors circuit sécurisé.",
          "Fait à {{city}}, le {{today}}. Signature du collaborateur : ________________",
        ],
      },
    ],
  },
  {
    id: "policy_harcelement",
    category: "policy",
    title: "Politique anti-harcèlement",
    shortLabel: "Anti-harcèlement",
    description: "Prévention et signalement.",
    fields: ["company"],
    sections: [
      {
        paragraphs: [
          "{{company}} s’engage à un environnement de travail respectueux, sans harcèlement ni discrimination.",
          "Tout signalement peut être adressé à la direction / RH. Des mesures de protection et d’enquête seront engagées.",
          "Édité le {{today}}.",
        ],
      },
    ],
  },
  {
    id: "policy_code_conduite",
    category: "policy",
    title: "Code de conduite",
    shortLabel: "Conduite",
    description: "Éthique, conflits d’intérêts, cadeaux.",
    fields: ["company"],
    sections: [
      {
        paragraphs: [
          "Les collaborateurs de {{company}} agissent avec intégrité, loyauté et professionnalisme.",
          "Tout conflit d’intérêts doit être déclaré. Les cadeaux d’une valeur significative sont soumis à validation.",
          "Fait à {{city}}, le {{today}}.",
        ],
      },
    ],
  },

  // ── Médical ───────────────────────────────────────────────
  {
    id: "medical_demande_certificat",
    category: "medical",
    title: "Demande / réception de certificat médical",
    shortLabel: "Cert. médical",
    description: "Trame d’accompagnement d’un arrêt maladie.",
    fields: ["company", "employee", "dates"],
    sections: [
      {
        paragraphs: [
          "Collaborateur : {{employee}} — Entreprise : {{company}}",
          "Période d’arrêt déclarée : du {{start}} au {{end}}",
          "Joindre le certificat médical original. Transmission RH le {{today}}.",
          "Visa RH : ________________",
        ],
      },
    ],
  },
  {
    id: "medical_reprise",
    category: "medical",
    title: "Attestation de reprise du travail",
    shortLabel: "Reprise",
    description: "Confirmation de reprise après absence médicale.",
    fields: ["company", "employee", "dates"],
    sections: [
      {
        paragraphs: [
          "{{employee}} reprend ses fonctions au sein de {{company}} à compter du {{start}}.",
          "Éventuelles restrictions médicales : ________",
          "Fait à {{city}}, le {{today}}. RH : ________________",
        ],
      },
    ],
  },
  {
    id: "medical_accident",
    category: "medical",
    title: "Déclaration d’accident du travail (trame)",
    shortLabel: "Accident",
    description: "Déclaration interne à compléter.",
    fields: ["company", "employee", "dates"],
    sections: [
      {
        paragraphs: [
          "Entreprise : {{company}} — Victime : {{employee}}",
          "Date / heure de l’accident : {{start}} — Lieu : ________",
          "Description des faits : ________",
          "Témoins : ________ — Soins prodigués : ________",
          "Déclaré le {{today}}. Responsable : ________________",
        ],
      },
    ],
  },

  // ── Autres ────────────────────────────────────────────────
  {
    id: "other_demande_conge",
    category: "other",
    title: "Formulaire de demande de congé",
    shortLabel: "Dem. congé",
    description: "Version papier complémentaire à AnkibaPay.",
    fields: ["company", "employee", "dates"],
    sections: [
      {
        paragraphs: [
          "Salarié : {{employee}} — Société : {{company}}",
          "Type de congé : ________ — Du {{start}} au {{end}}",
          "Motif : ________",
          "Visa manager : ________  Visa RH : ________  Date : {{today}}",
        ],
      },
    ],
  },
  {
    id: "other_ordre_mission",
    category: "other",
    title: "Ordre de mission",
    shortLabel: "Mission",
    description: "Déplacement professionnel.",
    fields: ["company", "employee", "dates", "job"],
    sections: [
      {
        paragraphs: [
          "{{company}} ordonne à {{employee}} ({{job}}) d’effectuer une mission du {{start}} au {{end}}.",
          "Destination : ________ — Objet : ________ — Budget / frais : ________",
          "Fait à {{city}}, le {{today}}. Direction : ________________",
        ],
      },
    ],
  },
  {
    id: "other_avertissement",
    category: "other",
    title: "Lettre d’avertissement",
    shortLabel: "Avertissement",
    description: "Sanction disciplinaire de premier niveau.",
    fields: ["company", "employee", "dates"],
    sections: [
      {
        paragraphs: [
          "À l’attention de {{employee}},",
          "Suite aux faits constatés le {{start}} [décrire], {{company}} vous adresse le présent avertissement.",
          "Tout manquement ultérieur pourra entraîner des sanctions plus graves.",
          "Fait à {{city}}, le {{today}}.",
          "Direction : ________________        Accusé de réception salarié : ________________",
        ],
      },
    ],
  },
  {
    id: "other_demission",
    category: "other",
    title: "Modèle de lettre de démission",
    shortLabel: "Démission",
    description: "À remettre par le salarié.",
    fields: ["company", "employee", "dates", "job"],
    sections: [
      {
        paragraphs: [
          "Madame, Monsieur,",
          "Je soussigné(e) {{employee}}, occupant le poste de {{job}} au sein de {{company}}, vous informe de ma démission à compter du {{end}}.",
          "Je respecterai le préavis applicable sauf accord contraire.",
          "Veuillez agréer mes salutations distinguées.",
          "{{city}}, le {{today}} — Signature : ________________",
        ],
      },
    ],
  },
  {
    id: "other_fiche_poste",
    category: "other",
    title: "Fiche de poste",
    shortLabel: "Fiche poste",
    description: "Missions, compétences, rattachement.",
    fields: ["company", "job"],
    sections: [
      {
        paragraphs: [
          "Entreprise : {{company}} — Intitulé : {{job}}",
          "Rattachement hiérarchique : ________",
          "Missions principales : 1) ________ 2) ________ 3) ________",
          "Compétences requises : ________",
          "Indicateurs de performance : ________",
          "Édité le {{today}}.",
        ],
      },
    ],
  },
  {
    id: "other_attestation_formation",
    category: "other",
    title: "Attestation de formation",
    shortLabel: "Formation",
    description: "Certification de participation.",
    fields: ["company", "employee", "dates"],
    sections: [
      {
        paragraphs: [
          "{{company}} atteste que {{employee}} a suivi la formation « ________ » du {{start}} au {{end}}.",
          "Durée : ________ heures — Formateur : ________",
          "Fait à {{city}}, le {{today}}. Cachet : ________________",
        ],
      },
    ],
  },
  {
    id: "other_pv_entretien",
    category: "other",
    title: "Procès-verbal d’entretien",
    shortLabel: "PV entretien",
    description: "Compte rendu d’entretien individuel ou disciplinaire.",
    fields: ["company", "employee", "dates"],
    sections: [
      {
        paragraphs: [
          "Date : {{today}} — Entreprise : {{company}} — Collaborateur : {{employee}}",
          "Présents : ________",
          "Objets abordés : ________",
          "Décisions / engagements : ________",
          "Signatures : Manager ________  Collaborateur ________",
        ],
      },
    ],
  },
];

export function getTemplateById(id: string): DocumentTemplateDef | undefined {
  return DOCUMENT_TEMPLATES.find((t) => t.id === id);
}

export function templatesByCategory(): Record<DocumentCategory, DocumentTemplateDef[]> {
  const out: Record<DocumentCategory, DocumentTemplateDef[]> = {
    contract: [],
    payslip: [],
    identity: [],
    policy: [],
    medical: [],
    other: [],
  };
  for (const t of DOCUMENT_TEMPLATES) out[t.category].push(t);
  return out;
}
