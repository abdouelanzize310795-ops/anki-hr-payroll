import type { ReactNode } from "react";
import { companyLetterheadLines, type CompanyLetterhead } from "@/modules/companies/letterhead";

type Props = {
  company: CompanyLetterhead;
  documentTitle: string;
  documentSubtitle?: string | null;
  rightMeta?: ReactNode;
};

export function CompanyDocumentHeader({
  company,
  documentTitle,
  documentSubtitle,
  rightMeta,
}: Props) {
  const lines = companyLetterheadLines(company);
  const displayName = company.tradeName || company.legalName;

  return (
    <header className="flex items-start justify-between gap-4 border-b border-border pb-6 print:border-border">
      <div className="flex min-w-0 items-start gap-4">
        {company.logoUrl ? (
          <img
            src={company.logoUrl}
            alt={`Logo ${displayName}`}
            className="h-14 w-14 shrink-0 rounded-lg border border-border object-contain bg-white p-1"
          />
        ) : (
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
            {displayName.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-display text-lg font-bold text-primary">{displayName}</p>
          {company.tradeName && company.tradeName !== company.legalName && (
            <p className="text-xs text-muted-foreground">{company.legalName}</p>
          )}
          {lines.map((line) => (
            <p key={line} className="text-xs text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-reef">
          {documentTitle}
        </p>
        {documentSubtitle && (
          <p className="mt-1 font-display text-base font-semibold">{documentSubtitle}</p>
        )}
        {rightMeta}
      </div>
    </header>
  );
}
