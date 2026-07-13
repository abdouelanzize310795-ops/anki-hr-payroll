/**
 * Génère tous les modèles RH dans le coffre (Karthala + Océan Bleu).
 * Usage: npx tsx scripts/seed-document-templates.ts
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DOCUMENT_TEMPLATES } from "../src/modules/documents/templates/catalog";
import {
  defaultTemplateContext,
  renderTemplateHtml,
} from "../src/modules/documents/templates/render";

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-() ]+/g, "_").slice(0, 180);
}

async function login(url: string, key: string, email: string, password: string) {
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`login ${email}: ${error?.message}`);
  return { supabase, user: data.user };
}

const accounts = [
  { email: "employeur.karthala@ankibapay.test", password: "Karthala2026!" },
  { email: "employeur.oceanbleu@ankibapay.test", password: "OceanBleu2026!" },
];

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("FAIL: .env.local incomplete");
  process.exit(1);
}

let failed = 0;

for (const account of accounts) {
  console.log(`\n=== ${account.email} — ${DOCUMENT_TEMPLATES.length} modèles ===`);
  try {
    const { supabase, user } = await login(url, key, account.email, account.password);
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();
    const companyId = profile?.company_id as string | undefined;
    if (!companyId) throw new Error("company_id manquant");

    const { data: company } = await supabase
      .from("companies")
      .select("legal_name, trade_name, city, region")
      .eq("id", companyId)
      .single();

    const { data: employees } = await supabase
      .from("employees")
      .select(
        "id, first_name, last_name, job_title, national_id, bank_rib, bank_account, hire_date, base_salary, city",
      )
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .limit(1);

    const emp = employees?.[0] ?? null;

    for (const template of DOCUMENT_TEMPLATES) {
      try {
        const ctx = defaultTemplateContext();
        ctx.company = company?.legal_name || company?.trade_name || "Entreprise";
        ctx.city = company?.city || company?.region || "Moroni";
        let employeeId: string | null = null;
        if (emp && template.fields.includes("employee")) {
          employeeId = emp.id;
          ctx.employee = `${emp.first_name} ${emp.last_name}`.trim();
          ctx.job = emp.job_title || ctx.job;
          ctx.national_id = emp.national_id || ctx.national_id;
          ctx.rib = emp.bank_rib || emp.bank_account || ctx.rib;
          if (emp.hire_date) ctx.start = emp.hire_date;
          if (emp.base_salary != null) ctx.salary = String(emp.base_salary);
          if (emp.city) ctx.city = emp.city;
        }

        const html = renderTemplateHtml(template, ctx, { companyLegalName: ctx.company });
        const bytes = new TextEncoder().encode(html);
        const id = crypto.randomUUID();
        const label = emp && employeeId ? ctx.employee : "modele";
        const safeName = sanitizeFileName(`${template.shortLabel}-${label}.html`);
        const storagePath = `${companyId}/${id}/${safeName}`;

        const { error: insertError } = await supabase.from("hr_documents").insert({
          id,
          company_id: companyId,
          employee_id: employeeId,
          category: template.category,
          title: template.title,
          description: `Modèle AnkibaPay — ${template.description}`,
          file_name: safeName,
          mime_type: "text/html",
          file_size: bytes.byteLength,
          storage_path: storagePath,
          uploaded_by: user.id,
        });
        if (insertError) throw new Error(insertError.message);

        const { error: uploadError } = await supabase.storage
          .from("hr-documents")
          .upload(storagePath, bytes, {
            contentType: "text/html",
            upsert: false,
          });
        if (uploadError) {
          await supabase.from("hr_documents").delete().eq("id", id);
          throw new Error(uploadError.message);
        }

        console.log(`OK  [${template.category}] ${template.shortLabel}`);
      } catch (err) {
        failed += 1;
        console.error(`FAIL ${template.id}:`, err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    failed += 1;
    console.error(`FAIL account:`, err instanceof Error ? err.message : err);
  }
}

console.log(failed ? `\nSEED TEMPLATES FAIL (${failed})` : "\nSEED TEMPLATES PASS");
process.exit(failed ? 1 : 0);
