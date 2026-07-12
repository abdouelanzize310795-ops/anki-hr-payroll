export type DocumentCategory =
  | "contract"
  | "payslip"
  | "identity"
  | "policy"
  | "medical"
  | "other";

export type HrDocument = {
  id: string;
  company_id: string;
  employee_id: string | null;
  category: DocumentCategory;
  title: string;
  description: string | null;
  file_name: string;
  mime_type: string | null;
  file_size: number;
  storage_path: string;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type HrDocumentWithMeta = HrDocument & {
  employee_name?: string | null;
  company_name?: string | null;
};

export const documentCategoryLabel: Record<DocumentCategory, string> = {
  contract: "Contrats",
  payslip: "Bulletins",
  identity: "Identité & conformité",
  policy: "Politiques",
  medical: "Médical",
  other: "Autres",
};

export const DOCUMENT_CATEGORIES = Object.keys(documentCategoryLabel) as DocumentCategory[];

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function relativeTimeFr(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "à l’instant";
  if (mins < 60) return `il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "hier";
  return `il y a ${days} j`;
}
