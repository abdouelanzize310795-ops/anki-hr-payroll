import type { DocumentTemplateDef } from "./catalog";
import {
  companyLetterheadLines,
  type CompanyLetterhead,
} from "@/modules/companies/letterhead";

export type TemplateContext = {
  company: string;
  employee: string;
  job: string;
  salary: string;
  start: string;
  end: string;
  city: string;
  today: string;
  national_id: string;
  rib: string;
  manager: string;
};

const PLACEHOLDER_RE = /\{\{(company|employee|job|salary|start|end|city|today|national_id|rib|manager)\}\}/g;

export function fillTemplateText(text: string, ctx: TemplateContext): string {
  return text.replace(PLACEHOLDER_RE, (_, key: keyof TemplateContext) => ctx[key] || "________");
}

export function renderTemplateHtml(
  template: DocumentTemplateDef,
  ctx: TemplateContext,
  options?: { letterhead?: CompanyLetterhead },
): string {
  const sections = template.sections
    .map((section) => {
      const heading = section.heading
        ? `<h2>${escapeHtml(fillTemplateText(section.heading, ctx))}</h2>`
        : "";
      const paragraphs = section.paragraphs
        .map((p) => `<p>${escapeHtml(fillTemplateText(p, ctx))}</p>`)
        .join("\n");
      return `<section>${heading}${paragraphs}</section>`;
    })
    .join("\n");

  const lh: CompanyLetterhead = options?.letterhead ?? {
    legalName: ctx.company,
    city: ctx.city,
  };
  const displayName = lh.tradeName || lh.legalName || ctx.company;
  const identityLines = companyLetterheadLines(lh)
    .map((line) => `<div class="id-line">${escapeHtml(line)}</div>`)
    .join("");
  const logoBlock = lh.logoUrl
    ? `<img class="logo" src="${escapeHtml(lh.logoUrl)}" alt="Logo ${escapeHtml(displayName)}" />`
    : `<div class="logo-fallback">${escapeHtml(displayName.slice(0, 2).toUpperCase())}</div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(template.title)} — ${escapeHtml(displayName)}</title>
  <style>
    :root { color-scheme: light; }
    body {
      font-family: "Segoe UI", system-ui, sans-serif;
      color: #16211F;
      background: #F3EFE3;
      margin: 0;
      padding: 32px 16px;
      line-height: 1.55;
    }
    .sheet {
      max-width: 720px;
      margin: 0 auto;
      background: #fff;
      border: 1px solid #d8d2c4;
      padding: 40px 44px;
      box-shadow: 0 8px 30px rgba(14, 76, 86, 0.08);
    }
    .letterhead {
      display: flex;
      gap: 16px;
      align-items: flex-start;
      justify-content: space-between;
      border-bottom: 2px solid #0E4C56;
      padding-bottom: 18px;
      margin-bottom: 22px;
    }
    .letterhead-left { display: flex; gap: 14px; align-items: flex-start; min-width: 0; }
    .logo {
      width: 64px; height: 64px; object-fit: contain;
      border: 1px solid #e8e2d6; border-radius: 10px; background: #fff; padding: 4px;
    }
    .logo-fallback {
      width: 64px; height: 64px; border-radius: 10px; background: #0E4C56; color: #fff;
      display: grid; place-items: center; font-weight: 700; font-size: 18px;
    }
    .company-name { font-family: Georgia, "Times New Roman", serif; font-size: 18px; color: #0E4C56; margin: 0 0 4px; }
    .id-line { font-size: 12px; color: #5c6663; }
    .doc-title-block { text-align: right; }
    .doc-kicker {
      font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: #35A69A; margin: 0 0 4px;
    }
    .doc-title { font-family: Georgia, "Times New Roman", serif; font-size: 16px; color: #0E4C56; margin: 0; }
    .meta { color: #5c6663; font-size: 13px; margin-bottom: 22px; }
    h2 {
      font-size: 14px;
      color: #0E4C56;
      margin: 22px 0 8px;
      border-bottom: 1px solid #e8e2d6;
      padding-bottom: 4px;
    }
    p { margin: 0 0 10px; font-size: 14px; white-space: pre-wrap; }
    .note {
      margin-top: 28px;
      padding-top: 14px;
      border-top: 1px dashed #d8d2c4;
      font-size: 12px;
      color: #6b736f;
    }
    .footer {
      margin-top: 24px;
      font-size: 11px;
      color: #8a918e;
    }
    @media print {
      body { background: #fff; padding: 0; }
      .sheet { box-shadow: none; border: 0; max-width: none; }
    }
  </style>
</head>
<body>
  <article class="sheet">
    <header class="letterhead">
      <div class="letterhead-left">
        ${logoBlock}
        <div>
          <p class="company-name">${escapeHtml(displayName)}</p>
          ${
            lh.tradeName && lh.tradeName !== lh.legalName
              ? `<div class="id-line">${escapeHtml(lh.legalName)}</div>`
              : ""
          }
          ${identityLines}
        </div>
      </div>
      <div class="doc-title-block">
        <p class="doc-kicker">Document RH</p>
        <p class="doc-title">${escapeHtml(template.title)}</p>
      </div>
    </header>
    <p class="meta">Édité le ${escapeHtml(ctx.today)} · ${escapeHtml(ctx.city || lh.city || "Comores")}</p>
    ${sections}
    ${
      template.note
        ? `<p class="note">${escapeHtml(fillTemplateText(template.note, ctx))}</p>`
        : ""
    }
    <p class="footer">${escapeHtml(displayName)} — document généré via AnkibaPay. À valider avant usage officiel.</p>
  </article>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function defaultTemplateContext(): TemplateContext {
  const today = new Date().toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return {
    company: "[Raison sociale]",
    employee: "[Nom du salarié]",
    job: "[Poste]",
    salary: "________",
    start: "[Date début]",
    end: "[Date fin]",
    city: "Moroni",
    today,
    national_id: "[N° pièce]",
    rib: "[RIB / IBAN]",
    manager: "[Manager]",
  };
}
