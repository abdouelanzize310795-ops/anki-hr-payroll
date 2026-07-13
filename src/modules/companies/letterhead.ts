export type CompanyLetterhead = {
  legalName: string;
  tradeName?: string | null;
  logoUrl?: string | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  registrationNumber?: string | null;
};

export function companyLetterheadLines(info: CompanyLetterhead): string[] {
  const lines: string[] = [];
  const addr = [info.address, info.city, info.region].filter(Boolean).join(", ");
  if (addr) lines.push(addr);
  const contact = [info.phone, info.email].filter(Boolean).join(" · ");
  if (contact) lines.push(contact);
  if (info.taxId) lines.push(`NIF : ${info.taxId}`);
  if (info.registrationNumber) lines.push(`RCCM / Registre : ${info.registrationNumber}`);
  return lines;
}
