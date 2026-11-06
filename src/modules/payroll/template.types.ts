import type { PayslipDetail } from "./types";

export type BlockType =
  | "company_header"
  | "title_period"
  | "employee_info"
  | "net_highlight"
  | "earnings_table"
  | "deductions_table"
  | "employer_contributions"
  | "totals_summary"
  | "ytd_totals"
  | "leave_balance"
  | "hours_summary"
  | "payment_info"
  | "signatures"
  | "free_text"
  | "legal_footer"
  | "spacer";

export type BlockOptions = {
  showLogo?: boolean;
  align?: "left" | "center" | "banner";
  showBank?: boolean;
  style?: "box" | "banner" | "line";
  showBaseRate?: boolean;
  hideZero?: boolean;
  text?: string;
  title?: string;
  left?: string;
  right?: string;
  size?: "sm" | "md" | "lg";
};

export type PayslipBlock = { id: string; type: BlockType; options: BlockOptions };

export type PayslipTheme = {
  accent: string;
  font: "serif" | "sans";
  density: "comfortable" | "compact";
};

export type PayslipLayout = { theme: PayslipTheme; blocks: PayslipBlock[] };

export type PayslipTemplate = {
  id: string;
  company_id: string | null;
  name: string;
  description: string | null;
  layout: PayslipLayout;
  is_system: boolean;
  base_template_id: string | null;
  updated_at: string;
};

export const CLASSIC_TEMPLATE_ID = "00000000-0000-4000-a000-000000000001";

type OptionField =
  | { key: keyof BlockOptions; label: string; kind: "boolean" }
  | { key: keyof BlockOptions; label: string; kind: "text"; multiline?: boolean }
  | { key: keyof BlockOptions; label: string; kind: "select"; choices: { value: string; label: string }[] };

export const BLOCK_CATALOG: Record<
  BlockType,
  { label: string; description: string; defaults: BlockOptions; fields: OptionField[]; repeatable?: boolean }
> = {
  company_header: {
    label: "En-tête entreprise",
    description: "Logo, raison sociale, adresse, NIF.",
    defaults: { showLogo: true, align: "left" },
    fields: [
      { key: "showLogo", label: "Afficher le logo", kind: "boolean" },
      {
        key: "align",
        label: "Disposition",
        kind: "select",
        choices: [
          { value: "left", label: "À gauche" },
          { value: "center", label: "Centrée" },
          { value: "banner", label: "Bandeau de couleur" },
        ],
      },
    ],
  },
  title_period: {
    label: "Titre et période",
    description: "« Bulletin de paie », mois, numéro.",
    defaults: {},
    fields: [{ key: "title", label: "Titre (facultatif)", kind: "text" }],
  },
  employee_info: {
    label: "Informations salarié",
    description: "Nom, poste, service, matricule.",
    defaults: { showBank: false },
    fields: [{ key: "showBank", label: "Afficher banque et compte", kind: "boolean" }],
  },
  net_highlight: {
    label: "Net à payer",
    description: "Le montant net mis en valeur.",
    defaults: { style: "box" },
    fields: [
      {
        key: "style",
        label: "Style",
        kind: "select",
        choices: [
          { value: "box", label: "Encadré" },
          { value: "banner", label: "Bandeau de couleur" },
          { value: "line", label: "Ligne simple" },
        ],
      },
    ],
  },
  earnings_table: {
    label: "Tableau des gains",
    description: "Salaire de base, primes, heures sup…",
    defaults: { showBaseRate: true, hideZero: true },
    fields: [
      { key: "showBaseRate", label: "Colonnes base et taux", kind: "boolean" },
      { key: "hideZero", label: "Masquer les lignes à 0", kind: "boolean" },
    ],
  },
  deductions_table: {
    label: "Tableau des retenues",
    description: "Retraite, IGR, avances…",
    defaults: { showBaseRate: true, hideZero: true },
    fields: [
      { key: "showBaseRate", label: "Colonnes base et taux", kind: "boolean" },
      { key: "hideZero", label: "Masquer les lignes à 0", kind: "boolean" },
    ],
  },
  employer_contributions: {
    label: "Charges patronales",
    description: "Cotisations payées par l’employeur (information).",
    defaults: { showBaseRate: true },
    fields: [{ key: "showBaseRate", label: "Colonnes base et taux", kind: "boolean" }],
  },
  totals_summary: {
    label: "Récapitulatif",
    description: "Brut, retenues, net, coût employeur.",
    defaults: {},
    fields: [],
  },
  ytd_totals: {
    label: "Cumuls de l’année",
    description: "Brut, net et IGR cumulés depuis janvier.",
    defaults: {},
    fields: [],
  },
  leave_balance: {
    label: "Solde de congés",
    description: "Jours acquis, pris et restants.",
    defaults: {},
    fields: [],
  },
  hours_summary: {
    label: "Heures travaillées",
    description: "Heures prévues, réalisées, supplémentaires.",
    defaults: {},
    fields: [],
  },
  payment_info: {
    label: "Paiement",
    description: "Mode de paiement, banque, compte.",
    defaults: {},
    fields: [],
  },
  signatures: {
    label: "Signatures",
    description: "Zones de signature employeur / salarié.",
    defaults: { left: "L’employeur", right: "Le salarié" },
    fields: [
      { key: "left", label: "Libellé gauche", kind: "text" },
      { key: "right", label: "Libellé droite", kind: "text" },
    ],
  },
  free_text: {
    label: "Texte libre",
    description: "Message, rappel, mention personnalisée.",
    defaults: { text: "Votre texte ici." },
    fields: [
      { key: "title", label: "Titre (facultatif)", kind: "text" },
      { key: "text", label: "Texte", kind: "text", multiline: true },
    ],
    repeatable: true,
  },
  legal_footer: {
    label: "Mentions légales",
    description: "Petit texte en bas de page.",
    defaults: { text: "Bulletin à conserver sans limitation de durée." },
    fields: [{ key: "text", label: "Texte", kind: "text", multiline: true }],
  },
  spacer: {
    label: "Espace",
    description: "Ajoute de l’espace entre deux blocs.",
    defaults: { size: "md" },
    fields: [
      {
        key: "size",
        label: "Hauteur",
        kind: "select",
        choices: [
          { value: "sm", label: "Petite" },
          { value: "md", label: "Moyenne" },
          { value: "lg", label: "Grande" },
        ],
      },
    ],
    repeatable: true,
  },
};

/** Extra data some blocks need (filled server-side for real payslips). */
export type PayslipExtras = {
  ytd?: { gross: number; net: number; igr: number; months: number } | null;
  leave?: { name: string; entitled: number; used: number; pending: number; remaining: number }[] | null;
  bank?: { bank_name: string | null; bank_account: string | null; bank_rib: string | null } | null;
};

export type RenderablePayslip = PayslipDetail & PayslipExtras & { layout?: PayslipLayout | null };

/** Fictional payslip used by the template picker and editor previews. */
export const SAMPLE_PAYSLIP: RenderablePayslip = {
  id: "sample",
  payroll_run_id: "sample",
  company_id: "sample",
  employee_id: "sample",
  payslip_number: "BP-202610-0001",
  employee_number: "MAT-0042",
  employee_name: "Amina Said",
  job_title: "Comptable",
  department_name: "Finance",
  base_salary: 300000,
  currency_code: "KMF",
  gross_amount: 339000,
  deduction_amount: 23170,
  net_amount: 315830,
  employer_contribution_amount: 20340,
  status: "approved",
  worked_hours: 168,
  overtime_hours: 4,
  expected_hours: 168,
  created_at: "2026-10-31",
  updated_at: "2026-10-31",
  deleted_at: null,
  company_name: "Etablissement Exemple",
  company_trade_name: null,
  company_address: "Avenue de la République",
  company_city: "Moroni",
  company_region: "Grande Comore",
  company_tax_id: "NIF 123456",
  company_registration_number: "RCCM 2026-B-001",
  company_phone: "+269 773 00 00",
  company_email: "rh@exemple.km",
  company_logo_url: null,
  period_label: "Octobre 2026",
  period_start: "2026-10-01",
  period_end: "2026-10-31",
  lines: [
    { id: "l1", payslip_id: "s", company_id: "s", component_id: null, code: "SALAIRE_BASE", label: "Salaire de base", kind: "earning", calc_method: "base_salary", rate_applied: 0, basis_amount: 300000, amount: 300000, sort_order: 10, created_at: "" },
    { id: "l2", payslip_id: "s", company_id: "s", component_id: null, code: "PRIME_ANCIENNETE", label: "Prime d’ancienneté", kind: "earning", calc_method: "percent_of_base", rate_applied: 3, basis_amount: 300000, amount: 9000, sort_order: 40, created_at: "" },
    { id: "l3", payslip_id: "s", company_id: "s", component_id: null, code: "TRANSPORT", label: "Prime de transport", kind: "earning", calc_method: "fixed", rate_applied: 15000, basis_amount: 15000, amount: 15000, sort_order: 50, created_at: "" },
    { id: "l4", payslip_id: "s", company_id: "s", component_id: null, code: "HEURES_SUP", label: "Heures supplémentaires", kind: "earning", calc_method: "overtime_hours", rate_applied: 1.5, basis_amount: 4, amount: 15000, sort_order: 30, created_at: "" },
    { id: "l5", payslip_id: "s", company_id: "s", component_id: null, code: "CAISSE_RETRAITE", label: "Caisse de retraite", kind: "deduction", calc_method: "percent_of_gross", rate_applied: 3, basis_amount: 324000, amount: 9720, sort_order: 110, created_at: "" },
    { id: "l6", payslip_id: "s", company_id: "s", component_id: null, code: "IGR", label: "I.G.R.", kind: "deduction", calc_method: "igr_progressive", rate_applied: 4.29, basis_amount: 314280, amount: 13450, sort_order: 120, created_at: "" },
    { id: "l7", payslip_id: "s", company_id: "s", component_id: null, code: "COTIS_PAT", label: "Cotisation patronale retraite", kind: "employer_contribution", calc_method: "percent_of_gross", rate_applied: 6, basis_amount: 339000, amount: 20340, sort_order: 210, created_at: "" },
  ],
  ytd: { gross: 3390000, net: 3158300, igr: 134500, months: 10 },
  leave: [{ name: "Congés payés", entitled: 25, used: 5, pending: 0, remaining: 20 }],
  bank: { bank_name: "Exim Bank Comores", bank_account: "00123456789", bank_rib: null },
};

export function newBlockId(): string {
  return `b${Math.random().toString(36).slice(2, 9)}`;
}
