/**
 * Demo company "Innvo.tech": opened on 2025-10-22, 50 fictitious employees
 * (from personnes_fictives_test_comores_50.csv), contracts, one year of
 * attendance, leave and monthly payroll (approved, transferred, paid).
 *
 * Usage: DATABASE_URL=... CSV=path/to/file.csv node db/seed-innovtech.mjs
 * Prints the generated employer / HR passwords (store them in test-accounts.local).
 */
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import pg from "pg";

const { DATABASE_URL, CSV } = process.env;
if (!DATABASE_URL || !CSV) throw new Error("DATABASE_URL et CSV requis");

const OPENED = "2025-10-22";
const TODAY = "2026-10-21"; // last attendance day of the history
const TEMPLATE_DETAILED = "00000000-0000-4000-a000-000000000004";

// Deterministic pseudo-random generator (same data on every run).
let seed = 20251022;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));

const people = readFileSync(CSV, "utf8")
  .split(/\r?\n/)
  .slice(1)
  .filter((l) => l.trim())
  .map((l) => {
    const [last, first, birth, phone] = l.split(",");
    return { last: last.trim(), first: first.trim(), birth: birth.trim(), phone: phone.trim() };
  });
if (people.length !== 50) throw new Error(`50 personnes attendues, ${people.length} trouvées`);

const FEMALE = new Set(["Fatima", "Amina", "Zainab", "Mariama", "Halima", "Saida", "Nawal", "Mariam", "Khadija", "Rukiya", "Mouna", "Sakina", "Yasmina", "Hawa", "Nadia", "Aicha", "Fahima", "Saliha", "Rachida", "Mounira", "Chamsia", "Nassira", "Mariamou", "Yasra"]);

const DEPARTMENTS = [
  { code: "DIR", name: "Direction" },
  { code: "DEV", name: "Développement logiciel" },
  { code: "INF", name: "Infrastructure & Réseaux" },
  { code: "COM", name: "Commercial & Marketing" },
  { code: "FIN", name: "Finance & Comptabilité" },
  { code: "RH", name: "Ressources humaines" },
  { code: "SUP", name: "Support client" },
];

// [department, job title, base salary KMF, contract type] for the 50 positions.
const POSITIONS = [
  ["DIR", "Directeur général", 1500000, "cdi"],
  ["DIR", "Directrice des opérations", 1200000, "cdi"],
  ["DEV", "Responsable développement", 950000, "cdi"],
  ["INF", "Responsable infrastructure", 900000, "cdi"],
  ["COM", "Responsable commercial", 850000, "cdi"],
  ["FIN", "Responsable financier", 900000, "cdi"],
  ["RH", "Responsable RH", 800000, "cdi"],
  ["SUP", "Responsable support", 700000, "cdi"],
  ...Array.from({ length: 12 }, (_, i) => ["DEV", i < 4 ? "Développeur senior" : "Développeur", i < 4 ? 650000 : 480000, i === 11 ? "cdd" : "cdi"]),
  ...Array.from({ length: 6 }, (_, i) => ["INF", i < 2 ? "Administrateur systèmes" : "Technicien réseau", i < 2 ? 550000 : 380000, "cdi"]),
  ...Array.from({ length: 7 }, (_, i) => ["COM", i < 2 ? "Chargé de clientèle senior" : "Commercial", i < 2 ? 450000 : 320000, i === 6 ? "cdd" : "cdi"]),
  ...Array.from({ length: 4 }, (_, i) => ["FIN", i === 0 ? "Comptable senior" : "Comptable", i === 0 ? 500000 : 350000, "cdi"]),
  ...Array.from({ length: 3 }, (_, i) => ["RH", i === 0 ? "Chargée RH" : "Assistante RH", i === 0 ? 400000 : 280000, "cdi"]),
  ...Array.from({ length: 6 }, (_, i) => ["SUP", "Agent support", 250000, i >= 4 ? "cdd" : "cdi"]),
  ["DEV", "Stagiaire développement", 100000, "stage"],
  ["COM", "Stagiaire marketing", 100000, "stage"],
  ["SUP", "Stagiaire support", 100000, "stage"],
  ["INF", "Stagiaire réseau", 100000, "stage"],
];
if (POSITIONS.length !== 50) throw new Error(`50 postes attendus, ${POSITIONS.length}`);

const addDays = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const isoDow = (iso) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// Public holidays (Comoros) over the period.
const HOLIDAYS = [
  ["2025-11-12", "Journée de Maoré"],
  ["2025-12-25", "Noël"],
  ["2026-01-01", "Jour de l’an"],
  ["2026-03-18", "Journée Cheikh Al-Maarouf"],
  ["2026-03-20", "Aïd el-Fitr"],
  ["2026-05-01", "Fête du travail"],
  ["2026-05-27", "Aïd el-Kebir"],
  ["2026-07-06", "Fête de l’indépendance"],
  ["2026-08-26", "Maoulid"],
];
const holidaySet = new Set(HOLIDAYS.map(([d]) => d));

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
const q = (sql, params = []) => client.query(sql, params);

const existing = await q("select id from public.companies where legal_name = 'Innvo.tech' and deleted_at is null");
if (existing.rowCount) {
  console.log("Innvo.tech existe déjà — rien à faire.");
  await client.end();
  process.exit(0);
}

await q("begin");
await q("select set_config('ankibapay.bypass_role_guard', '1', true)");

// ---- Accounts (employer + HR) -------------------------------------------------
const pwEmployer = `Inv-${randomBytes(6).toString("hex")}`;
const pwHr = `Rh-${randomBytes(6).toString("hex")}`;
async function createUser(email, password, fullName) {
  const r = await q(
    `insert into auth.users (instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                             raw_app_meta_data, raw_user_meta_data, created_at)
     values ('00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1,
             crypt($2, gen_salt('bf')), $4, '{"provider":"email","providers":["email"]}'::jsonb,
             jsonb_build_object('full_name', $3::text), $4)
     returning id`,
    [email, password, fullName, `${OPENED} 08:00:00+03`],
  );
  return r.rows[0].id;
}
const employerId = await createUser("direction@innvo.test", pwEmployer, "Abdallah Mze");
const hrId = await createUser("rh@innvo.test", pwHr, "Mariam Soilihi");

// ---- Company ------------------------------------------------------------------
const company = (
  await q(
    `insert into public.companies (legal_name, trade_name, sector, tax_id, registration_number, email, phone,
       address_line1, city, region, country_code, currency_code, bank_name, bank_account,
       is_active, approval_status, subscription_status, subscription_plan, subscription_paid_at,
       subscription_starts_at, subscription_ends_at, payment_method, payment_reference,
       payslip_template_id, created_by, created_at, approved_at)
     values ('Innvo.tech', 'Innvo.tech', 'Services numériques', 'NIF-TEST-2025-0042', 'RCCM-TEST-2025-B-042',
       'contact@innvo.test', '+269 TEST', 'Rue de la Corniche', 'Moroni', 'Grande Comore', 'KM', 'KMF',
       'Banque de test', 'TEST-0000-INNVO', true, 'approved', 'active', 'pro', $1, $1, '2026-11-22',
       'mvola', 'MSH-INNVO-TEST', $2, $3, $1, $1)
     returning id`,
    [`${OPENED} 09:00:00+03`, TEMPLATE_DETAILED, employerId],
  )
).rows[0].id;

await q("update public.profiles set role = 'employer', company_id = $2, full_name = 'Abdallah Mze' where id = $1", [employerId, company]);
await q("update public.profiles set role = 'hr', company_id = $2, full_name = 'Mariam Soilihi' where id = $1", [hrId, company]);

for (const [d, name] of HOLIDAYS) {
  await q("insert into public.public_holidays (company_id, holiday_date, name, country_code) values ($1, $2, $3, 'KM')", [company, d, name]);
}

// ---- Sites & departments ---------------------------------------------------------
const siteMoroni = (
  await q(
    `insert into public.branches (company_id, name, code, city, region, is_headquarters, latitude, longitude, radius_m, created_at)
     values ($1, 'Siège Moroni', 'MOR', 'Moroni', 'Grande Comore', true, -11.7022, 43.2551, 80, $2) returning id`,
    [company, `${OPENED} 09:00:00+03`],
  )
).rows[0].id;
const siteAnjouan = (
  await q(
    `insert into public.branches (company_id, name, code, city, region, is_headquarters, latitude, longitude, radius_m, created_at)
     values ($1, 'Agence Mutsamudu', 'MUT', 'Mutsamudu', 'Anjouan', false, -12.1675, 44.3989, 80, $2) returning id`,
    [company, "2026-01-05 09:00:00+03"],
  )
).rows[0].id;

const deptIds = {};
for (const d of DEPARTMENTS) {
  deptIds[d.code] = (
    await q("insert into public.departments (company_id, name, code, branch_id) values ($1, $2, $3, $4) returning id", [
      company, d.name, d.code, d.code === "SUP" ? siteAnjouan : siteMoroni,
    ])
  ).rows[0].id;
}

// ---- Employees & contracts ------------------------------------------------------
// The first 30 join at the opening, the others are hired month after month.
const LATE_HIRES = ["2025-12-01", "2026-01-05", "2026-02-02", "2026-03-02", "2026-04-01", "2026-05-04", "2026-06-01", "2026-07-01", "2026-08-03", "2026-09-01"];
const employees = [];
for (let i = 0; i < 50; i++) {
  const p = people[i];
  const [dept, title, salary, contractType] = POSITIONS[i];
  const hire = i < 30 ? addDays(OPENED, i < 8 ? 0 : between(0, 12)) : LATE_HIRES[(i - 30) % LATE_HIRES.length];
  const termination = i === 44 ? "2026-06-30" : i === 47 ? "2026-08-31" : null; // two departures
  const userId = i === 0 ? employerId : i === 25 ? hrId : null;
  const email = `${p.first}.${p.last}`.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z.]/g, "") + "@innvo.test";
  const row = (
    await q(
      `insert into public.employees (company_id, branch_id, department_id, user_id, employee_number, first_name, last_name,
         email, phone, date_of_birth, gender, job_title, hire_date, termination_date, status, base_salary, currency_code,
         bank_name, bank_account, city, created_by, created_at, home_branch_id)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'KMF', $17, $18, $19, $20, $21, $2)
       returning id`,
      [
        company, dept === "SUP" ? siteAnjouan : siteMoroni, deptIds[dept], userId, `INV-${String(i + 1).padStart(4, "0")}`,
        p.first, p.last, email, p.phone, p.birth, FEMALE.has(p.first) ? "female" : "male", title, hire, termination,
        termination ? "terminated" : "active", salary,
        i % 9 === 8 ? null : pick(["Banque de test A", "Banque de test B", "Mobile money (test)"]),
        i % 9 === 8 ? null : `TEST-${String(100000 + i * 7919).slice(-6)}`,
        dept === "SUP" ? "Mutsamudu" : "Moroni", employerId, `${hire} 08:00:00+03`,
      ],
    )
  ).rows[0].id;

  const end = contractType === "cdd" ? addDays(hire, 364) : contractType === "stage" ? addDays(hire, 181) : null;
  await q(
    `insert into public.contracts (company_id, employee_id, contract_number, contract_type, status, job_title, department_id,
       branch_id, start_date, end_date, trial_end_date, base_salary, currency_code, work_days_per_week, hours_per_week,
       benefits, sent_at, signed_at, signed_by_employee_name, signed_by_employer_name, activated_at, created_by, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'KMF', 5, 40, $13, $14, $14, $15, 'Abdallah Mze', $14, $16, $14)`,
    [
      company, row, `CT-INV-${String(i + 1).padStart(4, "0")}`, contractType, termination ? "expired" : "active", title,
      deptIds[dept], dept === "SUP" ? siteAnjouan : siteMoroni, hire, termination ?? end,
      contractType === "stage" ? null : addDays(hire, 89), salary,
      dept === "DIR" ? "Prime de logement, véhicule de fonction" : contractType === "stage" ? "Indemnité de stage" : "Prime de transport",
      `${addDays(hire, -3)} 10:00:00+03`, `${p.first} ${p.last}`, employerId,
    ],
  );
  employees.push({ id: row, i, hire, termination, dept, salary, manager: i < 8 });
}

// Department managers
for (const e of employees.filter((x) => x.manager && x.dept !== "DIR")) {
  await q("update public.departments set manager_employee_id = $1 where id = $2", [e.id, deptIds[e.dept]]);
}

// ---- Payroll rubrics -------------------------------------------------------------
await q("select set_config('request.jwt.claim.sub', $1, true)", [employerId]);
await q("select public.ensure_default_payroll_components($1)", [company]);
await q("update public.payroll_components set rate_value = 15000, subject_to_igr = false, subject_to_retirement = false, cond_contract_types = array['cdi','cdd'] where company_id = $1 and code = 'TRANSPORT'", [company]);
await q("update public.payroll_components set rate_value = 6 where company_id = $1 and code = 'COTIS_PAT'", [company]);
await q(
  `insert into public.payroll_components (company_id, code, name, kind, calc_method, rate_value, sort_order, subject_to_igr,
     subject_to_retirement, cond_department_ids, description)
   values ($1, 'PRIME_LOGEMENT', 'Prime de logement', 'earning', 'fixed', 100000, 60, true, true, array[$2::uuid], 'Direction uniquement')`,
  [company, deptIds.DIR],
);
await q(
  `insert into public.payroll_components (company_id, code, name, kind, calc_method, rate_value, sort_order, subject_to_igr,
     subject_to_retirement, cond_employee_ids, description)
   values ($1, 'PRIME_RESPONSABILITE', 'Prime de responsabilité', 'earning', 'percent_of_base', 10, 45, true, true, $2::uuid[], 'Responsables de service')`,
  [company, employees.filter((e) => e.manager && e.dept !== "DIR").map((e) => e.id)],
);
await q(
  `insert into public.payroll_components (company_id, code, name, kind, calc_method, rate_value, sort_order, subject_to_igr,
     subject_to_retirement, cond_contract_types, description)
   values ($1, 'INDEMNITE_STAGE', 'Indemnité de repas', 'earning', 'fixed', 20000, 55, false, false, array['stage'], 'Stagiaires')`,
  [company],
);
await q(
  `insert into public.payroll_components (company_id, code, name, kind, calc_method, rate_value, sort_order, subject_to_igr,
     subject_to_retirement, description)
   values ($1, 'MUTUELLE', 'Mutuelle santé', 'deduction', 'fixed', 5000, 115, false, false, 'Tous les salariés')`,
  [company],
);

// ---- Leave ---------------------------------------------------------------------------
await q("select public.ensure_default_leave_types($1)", [company]);
const leaveTypes = Object.fromEntries((await q("select code, id from public.leave_types where company_id = $1", [company])).rows.map((r) => [r.code, r.id]));

const businessDays = (start, end) => {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) if (isoDow(d) <= 5 && !holidaySet.has(d)) n++;
  return n;
};
const leaveDays = new Map(); // employeeId -> Set(dates)
const leaveRows = [];
for (const e of employees) {
  leaveDays.set(e.id, new Set());
  const monthsWorked = Math.floor((Date.parse(TODAY) - Date.parse(e.hire)) / (30.4 * 86400000));
  if (monthsWorked < 4 || e.termination) continue;
  // One approved paid-leave block per employee (3 to 8 working days), within the earned balance.
  let start = addDays(e.hire, between(110, Math.max(111, Math.min(monthsWorked * 30 - 20, 330))));
  while (isoDow(start) > 5) start = addDays(start, 1);
  if (start > TODAY) continue;
  const want = between(3, Math.min(8, Math.floor(monthsWorked * 2.5) - 1));
  let end = start;
  while (businessDays(start, end) < want) end = addDays(end, 1);
  if (end > TODAY) continue;
  const days = businessDays(start, end);
  for (let d = start; d <= end; d = addDays(d, 1)) leaveDays.get(e.id).add(d);
  leaveRows.push({ e, type: "CP", start, end, days, status: "approved", reason: pick(["Congé annuel", "Voyage familial", "Repos", "Événement familial"]) });
}
// A few sick leaves, one pending and one rejected request.
for (const idx of [9, 17, 33]) {
  const e = employees[idx];
  const start = idx === 9 ? "2026-02-09" : idx === 17 ? "2026-05-18" : "2026-09-14";
  if (start < e.hire) continue;
  const end = addDays(start, 2);
  for (let d = start; d <= end; d = addDays(d, 1)) leaveDays.get(e.id).add(d);
  leaveRows.push({ e, type: "MAL", start, end, days: businessDays(start, end), status: "approved", reason: "Arrêt maladie (certificat fourni)" });
}
leaveRows.push({ e: employees[12], type: "CP", start: "2026-11-09", end: "2026-11-13", days: 5, status: "pending_hr", reason: "Congé de fin d’année" });
leaveRows.push({ e: employees[22], type: "CP", start: "2026-08-10", end: "2026-08-14", days: 5, status: "rejected", reason: "Vacances", note: "Période de forte activité, merci de proposer d’autres dates." });

for (const l of leaveRows) {
  await q(
    `insert into public.leave_requests (company_id, employee_id, leave_type_id, start_date, end_date, days_count, reason, status,
       reviewed_by, reviewed_at, review_note, manager_reviewed_by, manager_reviewed_at, medical_status, created_by, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $9, $10, $12, $13, $14)`,
    [
      company, l.e.id, leaveTypes[l.type], l.start, l.end, l.days, l.reason, l.status,
      l.status === "pending_hr" ? null : hrId,
      l.status === "pending_hr" ? null : `${addDays(l.start, -10)} 11:00:00+03`,
      l.note ?? (l.status === "approved" ? "Validé" : null),
      l.type === "MAL" ? "justified" : null, employerId, `${addDays(l.start, -14)} 09:30:00+03`,
    ],
  );
}

// ---- Attendance (weekdays, opening → today) --------------------------------------------
const att = { emp: [], date: [], status: [], cin: [], cout: [], worked: [], late: [], branch: [], source: [], dist: [] };
for (const e of employees) {
  const last = e.termination && e.termination < TODAY ? e.termination : TODAY;
  for (let d = e.hire; d <= last; d = addDays(d, 1)) {
    if (isoDow(d) > 5 || holidaySet.has(d)) continue;
    const branch = e.dept === "SUP" ? siteAnjouan : siteMoroni;
    if (leaveDays.get(e.id).has(d)) {
      att.emp.push(e.id); att.date.push(d); att.status.push("on_leave"); att.cin.push(null); att.cout.push(null);
      att.worked.push(null); att.late.push(0); att.branch.push(branch); att.source.push("job"); att.dist.push(null);
      continue;
    }
    const r = rand();
    if (r < 0.02) {
      att.emp.push(e.id); att.date.push(d); att.status.push("absent"); att.cin.push(null); att.cout.push(null);
      att.worked.push(null); att.late.push(0); att.branch.push(branch); att.source.push("job"); att.dist.push(null);
      continue;
    }
    const late = r < 0.09;
    const inMin = late ? between(8 * 60 + 16, 9 * 60 + 5) : between(7 * 60 + 35, 8 * 60 + 10);
    const overtime = rand() < 0.05;
    const outMin = overtime ? between(18 * 60 + 15, 19 * 60) : between(17 * 60, 17 * 60 + 25);
    att.emp.push(e.id); att.date.push(d); att.status.push(late ? "late" : "present");
    att.cin.push(hhmm(inMin)); att.cout.push(hhmm(outMin));
    att.worked.push(Math.min(outMin - inMin - 60, overtime ? 640 : 480)); // 1 h lunch break
    att.late.push(late ? inMin - 8 * 60 : 0); att.branch.push(branch);
    att.source.push(d >= "2026-02-01" ? "qr" : "mobile"); att.dist.push(between(2, 45));
  }
}
await q(
  `insert into public.attendance_records (company_id, employee_id, work_date, status, check_in, check_out, worked_minutes,
     late_minutes, branch_id, source, check_in_distance_m, expected_start, expected_end, created_at)
   select $1, x.emp, x.d, x.st, x.cin::time, x.cout::time, x.w, x.late, x.br, x.src, x.dist, '08:00', '17:00', x.d::timestamptz + interval '8 hours'
   from unnest($2::uuid[], $3::date[], $4::text[], $5::text[], $6::text[], $7::int[], $8::int[], $9::uuid[], $10::text[], $11::numeric[])
     as x(emp, d, st, cin, cout, w, late, br, src, dist)`,
  [company, att.emp, att.date, att.status, att.cin, att.cout, att.worked, att.late, att.branch, att.source, att.dist],
);

// Devices (one approved phone per employee)
await q(
  `insert into public.employee_devices (company_id, employee_id, device_id, platform, model, status, registered_at, last_seen_at, reviewed_at)
   select $1, e.id, 'demo-' || substr(md5(e.id::text), 1, 16), 'android', 'Android (démo)', 'approved', e.hire_date::timestamptz, now(), e.hire_date::timestamptz
   from public.employees e where e.company_id = $1 and e.termination_date is null`,
  [company],
);

// ---- Monthly payroll: Nov 2025 → Sep 2026 paid, Oct 2026 calculated --------------------
await q("set local role authenticated");
const months = [];
for (let y = 2025, m = 11; y < 2026 || m <= 10; m === 12 ? ((m = 1), y++) : m++) months.push([y, m]);
const MONTHS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
for (const [y, m] of months) {
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const end = addDays(m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`, -1);
  const label = `${MONTHS[m - 1]} ${y}`;
  const run = (
    await q(
      `insert into public.payroll_runs (company_id, label, period_year, period_month, period_start, period_end, currency_code, created_by)
       values ($1, $2, $3, $4, $5, $6, 'KMF', $7) returning id`,
      [company, label, y, m, start, end, employerId],
    )
  ).rows[0].id;
  await q("select public.calculate_payroll_run($1)", [run]);
  if (y === 2026 && m === 10) continue; // current month: calculated, not yet approved
  await q("select public.transition_payroll_run($1, 'approve')", [run]);
  await q("select public.generate_transfer_batch($1, $2)", [run, `Virements des salaires de ${label.toLowerCase()}`]);
  await q("select public.mark_transfer_batch_exported(id) from public.transfer_batches where payroll_run_id = $1 and deleted_at is null", [run]);
  await q("select public.transition_payroll_run($1, 'pay')", [run]);
  // Realistic timestamps: calculated the 25th, approved the 26th, paid the 28th.
  const day = (n) => `${y}-${String(m).padStart(2, "0")}-${n} 10:00:00+03`;
  await q("reset role");
  await q(
    "update public.payroll_runs set created_at = $2, calculated_at = $2, approved_at = $3, paid_at = $4, approved_by = $5 where id = $1",
    [run, day(25), day(26), day(28), employerId],
  );
  await q("update public.transfer_batches set created_at = $2, exported_at = $3 where payroll_run_id = $1", [run, day(27), day(27)]);
  await q("set local role authenticated");
}
await q("reset role");

// Leave balances recomputed with the monthly accrual, then used days from approved leave.
await q("select public.run_leave_accruals($1)", [company]);
await q(
  `with used as (
     select lr.employee_id, lr.leave_type_id, extract(year from lr.start_date)::int as y,
            sum(lr.days_count) filter (where lr.status = 'approved') as used,
            sum(lr.days_count) filter (where lr.status in ('pending', 'pending_manager', 'pending_hr')) as pending
     from public.leave_requests lr where lr.company_id = $1 group by 1, 2, 3)
   update public.leave_balances b set used_days = coalesce(u.used, 0), pending_days = coalesce(u.pending, 0)
   from used u join public.leave_types lt on lt.id = u.leave_type_id and lt.deducts_balance
   where b.employee_id = u.employee_id and b.leave_type_id = u.leave_type_id and b.year = u.y`,
  [company],
);

await q("commit");
await client.end();

console.log(JSON.stringify({ company, employees: employees.length, attendance: att.emp.length, leaves: leaveRows.length, runs: months.length }));
console.log(`EMPLOYER direction@innvo.test ${pwEmployer}`);
console.log(`HR rh@innvo.test ${pwHr}`);
