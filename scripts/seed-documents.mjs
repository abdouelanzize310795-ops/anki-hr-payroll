/**
 * Seed demo HR documents (Karthala + Océan Bleu) and verify signed download.
 * Usage: node scripts/seed-documents.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  }
  return env;
}

function client(url, key) {
  return createClient(url, key, { auth: { persistSession: false } });
}

async function login(url, key, email, password) {
  const supabase = client(url, key);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`login ${email}: ${error?.message}`);
  return { supabase, user: data.user };
}

function pdfBytes(title) {
  // Minimal valid PDF
  const content = `%PDF-1.1
1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj
2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj
3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources<< /Font<< /F1 5 0 R >> >> >>endobj
4 0 obj<< /Length 68 >>stream
BT /F1 18 Tf 40 80 Td (${title.replace(/[()\\]/g, "")}) Tj ET
endstream endobj
5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000274 00000 n 
0000000393 00000 n 
trailer<< /Size 6 /Root 1 0 R >>
startxref
466
%%EOF`;
  return new Blob([content], { type: "application/pdf" });
}

async function uploadDoc(supabase, userId, companyId, employeeId, meta) {
  const id = crypto.randomUUID();
  const fileName = meta.fileName;
  const storagePath = `${companyId}/${id}/${fileName}`;
  const blob = pdfBytes(meta.title);
  const fileSize = blob.size;

  const { error: insertError } = await supabase.from("hr_documents").insert({
    id,
    company_id: companyId,
    employee_id: employeeId,
    category: meta.category,
    title: meta.title,
    description: meta.description,
    file_name: fileName,
    mime_type: "application/pdf",
    file_size: fileSize,
    storage_path: storagePath,
    uploaded_by: userId,
  });
  if (insertError) throw new Error(`insert ${meta.title}: ${insertError.message}`);

  const { data: signed, error: signError } = await supabase.storage
    .from("hr-documents")
    .createSignedUploadUrl(storagePath);
  if (signError || !signed) {
    await supabase.from("hr_documents").delete().eq("id", id);
    throw new Error(`signed upload ${meta.title}: ${signError?.message}`);
  }

  const { error: upError } = await supabase.storage
    .from("hr-documents")
    .uploadToSignedUrl(signed.path, signed.token, blob, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (upError) {
    await supabase.from("hr_documents").delete().eq("id", id);
    throw new Error(`upload ${meta.title}: ${upError.message}`);
  }

  const { data: dl, error: dlError } = await supabase.storage
    .from("hr-documents")
    .createSignedUrl(storagePath, 600);
  if (dlError || !dl?.signedUrl) throw new Error(`download check ${meta.title}: ${dlError?.message}`);

  const res = await fetch(dl.signedUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${meta.title}`);

  console.log(`OK  ${meta.title} (${id.slice(0, 8)})`);
  return id;
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("FAIL: .env.local incomplete");
  process.exit(1);
}

const accounts = [
  {
    email: "employeur.karthala@ankibapay.test",
    password: "Karthala2026!",
    docs: [
      {
        category: "policy",
        title: "Règlement intérieur Karthala",
        description: "Document de démo E2E",
        fileName: "reglement-interieur.pdf",
        linkEmployee: false,
      },
      {
        category: "contract",
        title: "Contrat CDI — Amina Yussuf",
        description: "Contrat type démo",
        fileName: "contrat-amina.pdf",
        linkEmployee: true,
      },
      {
        category: "payslip",
        title: "Bulletin juillet 2026 — Amina",
        description: "Copie archivée démo",
        fileName: "bulletin-amina-2026-07.pdf",
        linkEmployee: true,
      },
      {
        category: "identity",
        title: "Pièce d’identité — Amina",
        description: "CNI / passeport (démo)",
        fileName: "identite-amina.pdf",
        linkEmployee: true,
      },
    ],
  },
  {
    email: "employeur.oceanbleu@ankibapay.test",
    password: "OceanBleu2026!",
    docs: [
      {
        category: "policy",
        title: "Charte RH Océan Bleu",
        description: "Document de démo E2E",
        fileName: "charte-rh.pdf",
        linkEmployee: false,
      },
      {
        category: "medical",
        title: "Attestation médicale type",
        description: "Modèle démo",
        fileName: "attestation-medicale.pdf",
        linkEmployee: false,
      },
    ],
  },
];

let failed = 0;
for (const account of accounts) {
  console.log(`\n=== ${account.email} ===`);
  try {
    const { supabase, user } = await login(url, key, account.email, account.password);
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();
    const companyId = profile?.company_id;
    if (!companyId) throw new Error("company_id manquant");

    const { data: employees } = await supabase
      .from("employees")
      .select("id, first_name")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .limit(5);
    const firstEmployeeId = employees?.[0]?.id ?? null;

    for (const doc of account.docs) {
      try {
        await uploadDoc(
          supabase,
          user.id,
          companyId,
          doc.linkEmployee ? firstEmployeeId : null,
          doc,
        );
      } catch (err) {
        failed += 1;
        console.error(`FAIL ${doc.title}:`, err.message);
      }
    }
  } catch (err) {
    failed += 1;
    console.error(`FAIL account:`, err.message);
  }
}

console.log(failed ? `\nSEED DOCS FAIL (${failed})` : "\nSEED DOCS PASS");
process.exit(failed ? 1 : 0);
