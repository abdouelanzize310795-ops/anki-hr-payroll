export type AssetCategory = "laptop" | "phone" | "monitor" | "vehicle" | "other";
export type AssetStatus = "available" | "assigned" | "maintenance" | "retired";

export type CompanyAsset = {
  id: string;
  company_id: string;
  name: string;
  category: AssetCategory;
  serial_number: string | null;
  status: AssetStatus;
  assigned_employee_id: string | null;
  assigned_at: string | null;
  purchase_date: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CompanyAssetWithMeta = CompanyAsset & {
  assignee_name?: string | null;
};

export const ASSET_CATEGORY_LABEL: Record<AssetCategory, string> = {
  laptop: "Ordinateur",
  phone: "Téléphone",
  monitor: "Écran",
  vehicle: "Véhicule",
  other: "Autre",
};

export const ASSET_STATUS_LABEL: Record<AssetStatus, string> = {
  available: "Disponible",
  assigned: "Affecté",
  maintenance: "Maintenance",
  retired: "Retiré",
};

export const ASSET_CATEGORIES: AssetCategory[] = [
  "laptop",
  "phone",
  "monitor",
  "vehicle",
  "other",
];
