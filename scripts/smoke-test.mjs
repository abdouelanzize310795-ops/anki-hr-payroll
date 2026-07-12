/**
 * Smoke test AnkibaPay — auth + RLS + lecture données
 * Usage: node scripts/smoke-test.mjs
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

const accounts = [
  {
    label: "Karthala",
    email: "employeur.karthala@ankibapay.test",
    password: "Karthala2026!",
    expectCompany: "Karthala Distribution SARL",
  },
  {
    label: "Océan Bleu",
    email: "employeur.oceanbleu@ankibapay.test",
    password: "OceanBleu2026!",
    expectCompany: "Océan Bleu Hôtellerie SA",
  },
];

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("FAIL: .env.local incomplete");
  process.exit(1);
}

let failed = 0;

for (const acc of accounts) {
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: acc.email,
    password: acc.password,
  });
  if (authErr || !auth.user) {
    console.error(`FAIL [${acc.label}] login:`, authErr?.message);
    failed++;
    continue;
  }
  console.log(`OK   [${acc.label}] login`);

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("role, company_id, full_name")
    .eq("id", auth.user.id)
    .single();
  if (pErr || profile?.role !== "employer" || !profile.company_id) {
    console.error(`FAIL [${acc.label}] profile:`, pErr?.message || profile);
    failed++;
  } else {
    console.log(`OK   [${acc.label}] role=employer company linked`);
  }

  const { data: companies, error: cErr } = await supabase
    .from("companies")
    .select("id, legal_name")
    .is("deleted_at", null);
  if (cErr) {
    console.error(`FAIL [${acc.label}] companies:`, cErr.message);
    failed++;
  } else if ((companies?.length ?? 0) !== 1 || companies[0].legal_name !== acc.expectCompany) {
    console.error(`FAIL [${acc.label}] expected 1 company ${acc.expectCompany}, got:`, companies);
    failed++;
  } else {
    console.log(`OK   [${acc.label}] RLS companies = ${companies[0].legal_name}`);
  }

  const { data: employees, error: eErr } = await supabase
    .from("employees")
    .select("id, first_name, last_name, base_salary")
    .is("deleted_at", null);
  if (eErr) {
    console.error(`FAIL [${acc.label}] employees:`, eErr.message);
    failed++;
  } else if ((employees?.length ?? 0) < 2) {
    console.error(`FAIL [${acc.label}] expected >=2 employees, got`, employees?.length);
    failed++;
  } else {
    console.log(`OK   [${acc.label}] employees=${employees.length}`);
  }

  const { data: comps, error: pcErr } = await supabase
    .from("payroll_components")
    .select("code")
    .is("deleted_at", null);
  if (pcErr || (comps?.length ?? 0) < 1) {
    console.error(`FAIL [${acc.label}] payroll_components:`, pcErr?.message || comps);
    failed++;
  } else {
    console.log(`OK   [${acc.label}] payroll_components=${comps.length}`);
  }

  const { data: leaveTypes, error: ltErr } = await supabase
    .from("leave_types")
    .select("id")
    .is("deleted_at", null);
  if (ltErr || (leaveTypes?.length ?? 0) < 1) {
    console.error(`FAIL [${acc.label}] leave_types:`, ltErr?.message || leaveTypes);
    failed++;
  } else {
    console.log(`OK   [${acc.label}] leave_types=${leaveTypes.length}`);
  }

  const { error: runsErr } = await supabase
    .from("payroll_runs")
    .select("id, status")
    .is("deleted_at", null)
    .limit(5);
  if (runsErr) {
    console.error(`FAIL [${acc.label}] payroll_runs:`, runsErr.message);
    failed++;
  } else {
    console.log(`OK   [${acc.label}] payroll_runs readable`);
  }

  const { data: jobs, error: jobErr } = await supabase
    .from("job_openings")
    .select("id, title")
    .is("deleted_at", null);
  if (jobErr) {
    console.error(`FAIL [${acc.label}] job_openings:`, jobErr.message);
    failed++;
  } else {
    console.log(`OK   [${acc.label}] job_openings=${jobs?.length ?? 0}`);
  }

  const { data: courses, error: trErr } = await supabase
    .from("training_courses")
    .select("id")
    .is("deleted_at", null);
  if (trErr) {
    console.error(`FAIL [${acc.label}] training_courses:`, trErr.message);
    failed++;
  } else {
    console.log(`OK   [${acc.label}] training_courses=${courses?.length ?? 0}`);
  }

  const { error: perfErr } = await supabase
    .from("performance_reviews")
    .select("id")
    .is("deleted_at", null)
    .limit(5);
  if (perfErr) {
    console.error(`FAIL [${acc.label}] performance_reviews:`, perfErr.message);
    failed++;
  } else {
    console.log(`OK   [${acc.label}] performance_reviews readable`);
  }

  const { data: assets, error: asErr } = await supabase
    .from("company_assets")
    .select("id")
    .is("deleted_at", null);
  if (asErr) {
    console.error(`FAIL [${acc.label}] company_assets:`, asErr.message);
    failed++;
  } else {
    console.log(`OK   [${acc.label}] company_assets=${assets?.length ?? 0}`);
  }

  await supabase.auth.signOut();
}

// Platform admin sees both
{
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const adminEmail = "abdouelanze95@gmail.com";
  // password unknown here — skip if not in env
  const adminPass = env.SMOKE_ADMIN_PASSWORD;
  if (adminPass) {
    const { error } = await supabase.auth.signInWithPassword({
      email: adminEmail,
      password: adminPass,
    });
    if (error) {
      console.error("FAIL [admin] login:", error.message);
      failed++;
    } else {
      const { data: companies } = await supabase
        .from("companies")
        .select("id")
        .is("deleted_at", null);
      if ((companies?.length ?? 0) >= 2) console.log(`OK   [admin] sees ${companies.length} companies`);
      else {
        console.error("FAIL [admin] expected >=2 companies");
        failed++;
      }
    }
  } else {
    console.log("SKIP [admin] set SMOKE_ADMIN_PASSWORD to test");
  }
}

console.log(failed === 0 ? "\nSMOKE PASS" : `\nSMOKE FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
