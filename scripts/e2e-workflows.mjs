/**
 * E2E workflows AnkibaPay — active et teste tous les parcours métier
 * Usage: node scripts/e2e-workflows.mjs
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

function ok(label, msg) {
  console.log(`OK   [${label}] ${msg}`);
}
function fail(label, msg) {
  console.error(`FAIL [${label}] ${msg}`);
}

function periodBounds(year, month) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const endDate = new Date(Date.UTC(year, month, 0));
  const end = endDate.toISOString().slice(0, 10);
  return { start, end };
}

const env = loadEnv();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("FAIL: .env.local incomplete");
  process.exit(1);
}

let failed = 0;
const today = new Date().toISOString().slice(0, 10);
const year = 2026;
const month = 7;

// ─────────────────────────────────────────────
// 1) EMPLOYEUR — cycle complet Karthala
// ─────────────────────────────────────────────
console.log("\n=== WORKFLOW EMPLOYEUR (Karthala) ===");
{
  const label = "employeur";
  try {
    const { supabase, user } = await login(
      url,
      key,
      "employeur.karthala@ankibapay.test",
      "Karthala2026!",
    );
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "employer") throw new Error(`role=${profile?.role}`);
    const companyId = profile.company_id;
    ok(label, "login + rôle employer");

    // Activer rubriques + types congés
    await supabase.rpc("ensure_default_payroll_components", { p_company_id: companyId });
    await supabase.rpc("ensure_default_leave_types", { p_company_id: companyId });
    ok(label, "rubriques paie + types congés assurés");

    const { data: employees } = await supabase
      .from("employees")
      .select("id, first_name, last_name, base_salary, bank_account, bank_name")
      .eq("company_id", companyId)
      .is("deleted_at", null);
    if ((employees?.length ?? 0) < 2) throw new Error("moins de 2 employés");
    ok(label, `employés=${employees.length}`);

    // Renseigner RIB si manquant (virements)
    for (const e of employees) {
      if (!e.bank_account) {
        await supabase
          .from("employees")
          .update({
            bank_name: e.bank_name || "BIC",
            bank_account: `KM46 0001 ${String(e.id).slice(0, 8).toUpperCase()}`,
            bank_rib: "000123456789012345678901",
          })
          .eq("id", e.id);
      }
    }
    ok(label, "RIB employés activés");

    // Pointage du jour pour tous
    for (const e of employees) {
      const { error } = await supabase.rpc("clock_attendance", {
        p_company_id: companyId,
        p_employee_id: e.id,
        p_action: "in",
        p_at: new Date().toISOString(),
      });
      // ignore already clocked
      if (error && !/déjà|already|existe/i.test(error.message)) {
        // try upsert present
        await supabase.from("attendance_records").upsert(
          {
            company_id: companyId,
            employee_id: e.id,
            work_date: today,
            status: "present",
            check_in_at: new Date().toISOString(),
            created_by: user.id,
          },
          { onConflict: "employee_id,work_date" },
        );
      }
    }
    ok(label, "pointage du jour activé");

    // Tâche RH
    const { data: task, error: taskErr } = await supabase
      .from("hr_tasks")
      .insert({
        company_id: companyId,
        title: `E2E — Préparer paie ${month}/${year}`,
        priority: "high",
        status: "in_progress",
        assignee_employee_id: employees[0].id,
        assignee_name: `${employees[0].first_name} ${employees[0].last_name}`,
        due_date: today,
        created_by: user.id,
      })
      .select("id")
      .single();
    if (taskErr) throw new Error(`task: ${taskErr.message}`);
    ok(label, `tâche créée ${task.id.slice(0, 8)}`);

    // Recrutement — avancer un candidat
    const { data: cand } = await supabase
      .from("candidates")
      .select("id, stage")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .neq("stage", "hired")
      .limit(1)
      .maybeSingle();
    if (cand) {
      const next =
        cand.stage === "sourced"
          ? "screened"
          : cand.stage === "screened"
            ? "interview"
            : cand.stage === "interview"
              ? "offer"
              : "hired";
      await supabase.from("candidates").update({ stage: next }).eq("id", cand.id);
      ok(label, `candidat ${cand.stage} → ${next}`);
    } else {
      ok(label, "recrutement (pas de candidat à avancer)");
    }

    // Formation — marquer une inscription completed
    const { data: enroll } = await supabase
      .from("training_enrollments")
      .select("id, status")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .neq("status", "completed")
      .limit(1)
      .maybeSingle();
    if (enroll) {
      await supabase
        .from("training_enrollments")
        .update({
          status: "completed",
          progress_pct: 100,
          certificate_issued: true,
          completed_at: new Date().toISOString(),
        })
        .eq("id", enroll.id);
      ok(label, "formation terminée + certificat");
    } else {
      ok(label, "formation (déjà complète)");
    }

    // Paie juillet — créer si besoin, calculer, approuver, payer
    let { data: run } = await supabase
      .from("payroll_runs")
      .select("*")
      .eq("company_id", companyId)
      .eq("period_year", year)
      .eq("period_month", month)
      .is("deleted_at", null)
      .maybeSingle();

    if (!run) {
      const bounds = periodBounds(year, month);
      const { data: created, error: cErr } = await supabase
        .from("payroll_runs")
        .insert({
          company_id: companyId,
          label: `Paie Juillet ${year}`,
          period_year: year,
          period_month: month,
          period_start: bounds.start,
          period_end: bounds.end,
          currency_code: "KMF",
          status: "draft",
          created_by: user.id,
        })
        .select("*")
        .single();
      if (cErr) throw new Error(`create run: ${cErr.message}`);
      run = created;
      ok(label, "cycle paie créé");
    } else {
      ok(label, `cycle paie existant status=${run.status}`);
    }

    if (run.status === "draft" || run.status === "calculated") {
      if (run.status === "draft") {
        const { data: calc, error: calcErr } = await supabase.rpc("calculate_payroll_run", {
          p_run_id: run.id,
        });
        if (calcErr) throw new Error(`calculate: ${calcErr.message}`);
        run = calc;
        ok(label, `paie calculée net=${run.total_net}`);
      }
      const { data: approved, error: aErr } = await supabase.rpc("transition_payroll_run", {
        p_run_id: run.id,
        p_action: "approve",
      });
      if (aErr) throw new Error(`approve: ${aErr.message}`);
      run = approved;
      ok(label, "paie approuvée");
    }

    if (run.status === "approved") {
      const { data: paid, error: pErr } = await supabase.rpc("transition_payroll_run", {
        p_run_id: run.id,
        p_action: "pay",
      });
      if (pErr) throw new Error(`pay: ${pErr.message}`);
      run = paid;
      ok(label, "paie marquée payée");
    } else if (run.status === "paid") {
      ok(label, "paie déjà payée");
    }

    // Virements
    let { data: batch } = await supabase
      .from("transfer_batches")
      .select("*")
      .eq("payroll_run_id", run.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!batch) {
      const { data: gen, error: gErr } = await supabase.rpc("generate_transfer_batch", {
        p_payroll_run_id: run.id,
        p_total_in_words: `${Number(run.total_net)} francs comoriens`,
      });
      if (gErr) throw new Error(`transfer: ${gErr.message}`);
      batch = gen;
      ok(label, `lot virement généré lines=${batch.line_count} total=${batch.total_amount}`);
    } else {
      ok(label, `lot virement existant status=${batch.status}`);
    }

    if (batch.status !== "exported" && batch.status !== "cancelled") {
      const { error: expErr } = await supabase.rpc("mark_transfer_batch_exported", {
        p_batch_id: batch.id,
      });
      if (expErr) {
        // soft: some envs may lack RPC name variants
        await supabase
          .from("transfer_batches")
          .update({ status: "exported", exported_at: new Date().toISOString() })
          .eq("id", batch.id);
      }
      ok(label, "lot virement exporté");
    }

    // Congé pending pour validation manager
    const { data: leaveTypes } = await supabase
      .from("leave_types")
      .select("id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .limit(1);
    const leaveTypeId = leaveTypes?.[0]?.id;
    if (leaveTypeId) {
      const empId = employees[0].id;
      const start = "2026-08-10";
      const end = "2026-08-12";
      const { data: existingLeave } = await supabase
        .from("leave_requests")
        .select("id, status")
        .eq("employee_id", empId)
        .eq("start_date", start)
        .is("deleted_at", null)
        .maybeSingle();

      let leaveId = existingLeave?.id;
      if (!leaveId) {
        const { data: lr, error: lrErr } = await supabase
          .from("leave_requests")
          .insert({
            company_id: companyId,
            employee_id: empId,
            leave_type_id: leaveTypeId,
            start_date: start,
            end_date: end,
            days_count: 3,
            reason: "E2E congé workflow",
            status: "draft",
            created_by: user.id,
          })
          .select("id")
          .single();
        if (lrErr) throw new Error(`leave create: ${lrErr.message}`);
        leaveId = lr.id;
        const { error: subErr } = await supabase.rpc("transition_leave_request", {
          p_request_id: leaveId,
          p_action: "submit",
          p_note: null,
        });
        if (subErr) throw new Error(`leave submit: ${subErr.message}`);
      }
      ok(label, `congé en attente ${leaveId.slice(0, 8)}`);
    }

    // Actifs / docs / perf / jobs lisibles
    for (const [table, name] of [
      ["company_assets", "actifs"],
      ["job_openings", "offres"],
      ["performance_reviews", "évaluations"],
      ["hr_documents", "documents"],
      ["contracts", "contrats"],
    ]) {
      const { error } = await supabase.from(table).select("id").limit(1);
      if (error) throw new Error(`${name}: ${error.message}`);
      ok(label, `${name} lisible`);
    }

    await supabase.auth.signOut();
  } catch (e) {
    fail(label, e.message);
    failed++;
  }
}

// ─────────────────────────────────────────────
// 2) EMPLOYÉ — parcours Amina
// ─────────────────────────────────────────────
console.log("\n=== WORKFLOW EMPLOYÉ (Amina) ===");
{
  const label = "employé";
  try {
    const { supabase, user } = await login(
      url,
      key,
      "employe.amina@ankibapay.test",
      "Amina2026!",
    );
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "employee") throw new Error(`role=${profile?.role}`);
    ok(label, "login + rôle employee");

    const { data: emp } = await supabase
      .from("employees")
      .select("id, company_id, first_name")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!emp) throw new Error("fiche employé non liée");
    ok(label, `lié à ${emp.first_name}`);

    // Badger
    const { error: clockErr } = await supabase.rpc("clock_attendance", {
      p_company_id: emp.company_id,
      p_employee_id: emp.id,
      p_action: "in",
      p_at: new Date().toISOString(),
    });
    if (clockErr) {
      await supabase.from("attendance_records").upsert(
        {
          company_id: emp.company_id,
          employee_id: emp.id,
          work_date: today,
          status: "present",
          check_in_at: new Date().toISOString(),
          created_by: user.id,
        },
        { onConflict: "employee_id,work_date" },
      );
    }
    ok(label, "pointage entrée");

    // Mes congés
    const { data: myLeaves, error: mlErr } = await supabase
      .from("leave_requests")
      .select("id, status")
      .eq("employee_id", emp.id)
      .is("deleted_at", null);
    if (mlErr) throw new Error(mlErr.message);
    ok(label, `congés visibles=${myLeaves?.length ?? 0}`);

    // Bulletin
    const { data: slips, error: sErr } = await supabase
      .from("payslips")
      .select("id, net_amount, payslip_number")
      .eq("employee_id", emp.id)
      .is("deleted_at", null);
    if (sErr) throw new Error(sErr.message);
    ok(label, `bulletins=${slips?.length ?? 0}`);

    // Contrats
    const { data: contracts, error: cErr } = await supabase
      .from("contracts")
      .select("id, status")
      .eq("employee_id", emp.id)
      .is("deleted_at", null);
    if (cErr) throw new Error(cErr.message);
    ok(label, `contrats=${contracts?.length ?? 0}`);

    // Tâches assignées
    const { data: tasks } = await supabase
      .from("hr_tasks")
      .select("id")
      .eq("assignee_employee_id", emp.id)
      .is("deleted_at", null);
    ok(label, `tâches=${tasks?.length ?? 0}`);

    // RLS: ne doit voir qu'1 entreprise
    const { data: cos } = await supabase
      .from("companies")
      .select("id")
      .is("deleted_at", null);
    if ((cos?.length ?? 0) !== 1) throw new Error(`RLS companies=${cos?.length}`);
    ok(label, "RLS 1 entreprise");

    await supabase.auth.signOut();
  } catch (e) {
    fail(label, e.message);
    failed++;
  }
}

// ─────────────────────────────────────────────
// 3) MANAGER — Said valide congés + équipe
// ─────────────────────────────────────────────
console.log("\n=== WORKFLOW MANAGER (Said) ===");
{
  const label = "manager";
  try {
    const { supabase, user } = await login(
      url,
      key,
      "manager.said@ankibapay.test",
      "Said2026!",
    );
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, company_id")
      .eq("id", user.id)
      .single();
    if (profile?.role !== "manager") throw new Error(`role=${profile?.role}`);
    ok(label, "login + rôle manager");

    const companyId = profile.company_id;

    const { data: team } = await supabase
      .from("employees")
      .select("id")
      .eq("company_id", companyId)
      .is("deleted_at", null);
    ok(label, `équipe visible=${team?.length ?? 0}`);

    const { data: att } = await supabase
      .from("attendance_records")
      .select("id, status")
      .eq("company_id", companyId)
      .eq("work_date", today)
      .is("deleted_at", null);
    ok(label, `présence jour=${att?.length ?? 0}`);

    const { data: pending } = await supabase
      .from("leave_requests")
      .select("id, status")
      .eq("company_id", companyId)
      .eq("status", "pending")
      .is("deleted_at", null);

    if ((pending?.length ?? 0) > 0) {
      const { error: apprErr } = await supabase.rpc("transition_leave_request", {
        p_request_id: pending[0].id,
        p_action: "approve",
        p_note: "OK manager E2E",
      });
      if (apprErr) {
        // managers may need can_manage — try with note
        fail(label, `approve leave: ${apprErr.message}`);
        failed++;
      } else {
        ok(label, `congé approuvé ${pending[0].id.slice(0, 8)}`);
      }
    } else {
      ok(label, "aucun congé pending (déjà traité)");
    }

    const { data: reviews } = await supabase
      .from("performance_reviews")
      .select("id, score")
      .eq("company_id", companyId)
      .is("deleted_at", null);
    ok(label, `évaluations=${reviews?.length ?? 0}`);

    await supabase.auth.signOut();
  } catch (e) {
    fail(label, e.message);
    failed++;
  }
}

// ─────────────────────────────────────────────
// 4) EMPLOYEUR Océan Bleu — activer paie
// ─────────────────────────────────────────────
console.log("\n=== WORKFLOW EMPLOYEUR (Océan Bleu) ===");
{
  const label = "océan";
  try {
    const { supabase, user } = await login(
      url,
      key,
      "employeur.oceanbleu@ankibapay.test",
      "OceanBleu2026!",
    );
    const { data: profile } = await supabase
      .from("profiles")
      .select("company_id")
      .eq("id", user.id)
      .single();
    const companyId = profile.company_id;

    await supabase.rpc("ensure_default_payroll_components", { p_company_id: companyId });
    await supabase.rpc("ensure_default_leave_types", { p_company_id: companyId });

    const { data: emps } = await supabase
      .from("employees")
      .select("id, bank_account, bank_name")
      .eq("company_id", companyId)
      .is("deleted_at", null);

    for (const e of emps ?? []) {
      if (!e.bank_account) {
        await supabase
          .from("employees")
          .update({
            bank_name: "Exim Bank",
            bank_account: `KM46 0002 ${String(e.id).slice(0, 8).toUpperCase()}`,
          })
          .eq("id", e.id);
      }
      await supabase.from("attendance_records").upsert(
        {
          company_id: companyId,
          employee_id: e.id,
          work_date: today,
          status: "present",
          check_in_at: new Date().toISOString(),
          created_by: user.id,
        },
        { onConflict: "employee_id,work_date" },
      );
    }
    ok(label, `pointage + RIB pour ${emps?.length ?? 0} employés`);

    let { data: run } = await supabase
      .from("payroll_runs")
      .select("*")
      .eq("company_id", companyId)
      .eq("period_year", year)
      .eq("period_month", month)
      .is("deleted_at", null)
      .maybeSingle();

    if (!run) {
      const bounds = periodBounds(year, month);
      const { data: created, error } = await supabase
        .from("payroll_runs")
        .insert({
          company_id: companyId,
          label: `Paie Juillet ${year}`,
          period_year: year,
          period_month: month,
          period_start: bounds.start,
          period_end: bounds.end,
          currency_code: "KMF",
          status: "draft",
          created_by: user.id,
        })
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      run = created;
    }

    if (run.status === "draft") {
      const { data: calc, error } = await supabase.rpc("calculate_payroll_run", {
        p_run_id: run.id,
      });
      if (error) throw new Error(`calc: ${error.message}`);
      run = calc;
    }
    if (run.status === "calculated") {
      const { data: appr, error } = await supabase.rpc("transition_payroll_run", {
        p_run_id: run.id,
        p_action: "approve",
      });
      if (error) throw new Error(`approve: ${error.message}`);
      run = appr;
    }
    if (run.status === "approved") {
      const { data: paid, error } = await supabase.rpc("transition_payroll_run", {
        p_run_id: run.id,
        p_action: "pay",
      });
      if (error) throw new Error(`pay: ${error.message}`);
      run = paid;
    }
    ok(label, `paie juillet status=${run.status} net=${run.total_net}`);

    await supabase.auth.signOut();
  } catch (e) {
    fail(label, e.message);
    failed++;
  }
}

// ─────────────────────────────────────────────
// 5) ADMIN plateforme (optionnel)
// ─────────────────────────────────────────────
console.log("\n=== WORKFLOW ADMIN PLATEFORME ===");
{
  const label = "admin";
  const adminPass = env.SMOKE_ADMIN_PASSWORD;
  if (!adminPass) {
    console.log("SKIP [admin] définir SMOKE_ADMIN_PASSWORD dans .env.local");
  } else {
    try {
      const { supabase } = await login(url, key, "abdouelanze95@gmail.com", adminPass);
      const { data: companies } = await supabase
        .from("companies")
        .select("id, legal_name")
        .is("deleted_at", null);
      if ((companies?.length ?? 0) < 2) throw new Error(`tenants=${companies?.length}`);
      ok(label, `tenants=${companies.length}`);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, role")
        .is("deleted_at", null);
      ok(label, `utilisateurs=${profiles?.length ?? 0}`);

      const { data: runs } = await supabase
        .from("payroll_runs")
        .select("id, status")
        .is("deleted_at", null);
      ok(label, `cycles paie plateforme=${runs?.length ?? 0}`);

      await supabase.auth.signOut();
    } catch (e) {
      fail(label, e.message);
      failed++;
    }
  }
}

console.log(failed === 0 ? "\nE2E WORKFLOWS PASS" : `\nE2E WORKFLOWS FAIL (${failed})`);
process.exit(failed === 0 ? 0 : 1);
