import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createCandidateSchema,
  createJobOpeningSchema,
  moveCandidateSchema,
  updateJobOpeningSchema,
} from "./schemas";
import type {
  CandidateWithMeta,
  JobOpening,
  JobOpeningWithMeta,
} from "./types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

function mapJob(row: Record<string, unknown>, extras?: Partial<JobOpeningWithMeta>): JobOpeningWithMeta {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    title: row.title as string,
    department_id: (row.department_id as string) ?? null,
    location: (row.location as string) ?? null,
    employment_type: row.employment_type as string,
    description: (row.description as string) ?? null,
    status: row.status as JobOpening["status"],
    openings_count: Number(row.openings_count),
    salary_min: row.salary_min != null ? Number(row.salary_min) : null,
    salary_max: row.salary_max != null ? Number(row.salary_max) : null,
    currency_code: (row.currency_code as string) || "KMF",
    published_at: (row.published_at as string) ?? null,
    closed_at: (row.closed_at as string) ?? null,
    created_by: (row.created_by as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string) ?? null,
    ...extras,
  };
}

export const listJobOpenings = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }): Promise<JobOpeningWithMeta[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("job_openings")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (data?.companyId) query = query.eq("company_id", data.companyId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const jobs = rows ?? [];
    const deptIds = [...new Set(jobs.map((j) => j.department_id).filter(Boolean))] as string[];
    const jobIds = jobs.map((j) => j.id as string);

    const [{ data: depts }, { data: cands }] = await Promise.all([
      deptIds.length
        ? supabase.from("departments").select("id, name").in("id", deptIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      jobIds.length
        ? supabase
            .from("candidates")
            .select("job_opening_id")
            .in("job_opening_id", jobIds)
            .is("deleted_at", null)
            .neq("stage", "rejected")
        : Promise.resolve({ data: [] as Array<{ job_opening_id: string }> }),
    ]);

    const deptName = new Map((depts ?? []).map((d) => [d.id, d.name]));
    const counts = new Map<string, number>();
    for (const c of cands ?? []) {
      counts.set(c.job_opening_id, (counts.get(c.job_opening_id) ?? 0) + 1);
    }

    return jobs.map((j) =>
      mapJob(j as Record<string, unknown>, {
        department_name: j.department_id ? deptName.get(j.department_id) ?? null : null,
        candidate_count: counts.get(j.id as string) ?? 0,
      }),
    );
  });

export const createJobOpening = createServerFn({ method: "POST" })
  .validator(createJobOpeningSchema)
  .handler(async ({ data }): Promise<ActionResult<JobOpeningWithMeta>> => {
    const userId = await requireUserId();
    const supabase = createSupabaseServerClient();

    const status = data.status ?? "open";
    const { data: row, error } = await supabase
      .from("job_openings")
      .insert({
        company_id: data.companyId,
        title: data.title.trim(),
        department_id: data.departmentId || null,
        location: data.location?.trim() || null,
        employment_type: data.employmentType || "CDI",
        description: data.description?.trim() || null,
        status,
        openings_count: data.openingsCount ?? 1,
        salary_min: data.salaryMin ?? null,
        salary_max: data.salaryMax ?? null,
        published_at: status === "open" ? new Date().toISOString() : null,
        created_by: userId,
      })
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Création impossible" };
    return { ok: true, data: mapJob(row as Record<string, unknown>, { candidate_count: 0 }) };
  });

export const updateJobOpening = createServerFn({ method: "POST" })
  .validator(updateJobOpeningSchema)
  .handler(async ({ data }): Promise<ActionResult<JobOpeningWithMeta>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title.trim();
    if (data.departmentId !== undefined) patch.department_id = data.departmentId;
    if (data.location !== undefined) patch.location = data.location?.trim() || null;
    if (data.employmentType !== undefined) patch.employment_type = data.employmentType;
    if (data.description !== undefined) patch.description = data.description?.trim() || null;
    if (data.openingsCount !== undefined) patch.openings_count = data.openingsCount;
    if (data.salaryMin !== undefined) patch.salary_min = data.salaryMin;
    if (data.salaryMax !== undefined) patch.salary_max = data.salaryMax;
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === "open") patch.published_at = new Date().toISOString();
      if (data.status === "closed" || data.status === "filled") {
        patch.closed_at = new Date().toISOString();
      }
    }

    const { data: row, error } = await supabase
      .from("job_openings")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Mise à jour impossible" };
    return { ok: true, data: mapJob(row as Record<string, unknown>) };
  });

export const softDeleteJobOpening = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("job_openings")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: data.id } };
  });

export const listCandidates = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        companyId: z.string().uuid().optional(),
        jobOpeningId: z.string().uuid().optional(),
      })
      .optional(),
  )
  .handler(async ({ data }): Promise<CandidateWithMeta[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("candidates")
      .select("*")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });
    if (data?.companyId) query = query.eq("company_id", data.companyId);
    if (data?.jobOpeningId) query = query.eq("job_opening_id", data.jobOpeningId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const jobIds = [...new Set((rows ?? []).map((r) => r.job_opening_id))];
    const { data: jobs } = jobIds.length
      ? await supabase.from("job_openings").select("id, title").in("id", jobIds)
      : { data: [] as Array<{ id: string; title: string }> };
    const titles = new Map((jobs ?? []).map((j) => [j.id, j.title]));

    return (rows ?? []).map((r) => ({
      ...(r as CandidateWithMeta),
      expected_salary: r.expected_salary != null ? Number(r.expected_salary) : null,
      job_title: titles.get(r.job_opening_id) ?? null,
    }));
  });

export const createCandidate = createServerFn({ method: "POST" })
  .validator(createCandidateSchema)
  .handler(async ({ data }): Promise<ActionResult<CandidateWithMeta>> => {
    const userId = await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: job } = await supabase
      .from("job_openings")
      .select("id, company_id, title")
      .eq("id", data.jobOpeningId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!job || job.company_id !== data.companyId) {
      return { ok: false, message: "Offre introuvable pour cette entreprise" };
    }

    const { data: row, error } = await supabase
      .from("candidates")
      .insert({
        company_id: data.companyId,
        job_opening_id: data.jobOpeningId,
        first_name: data.firstName.trim(),
        last_name: data.lastName.trim(),
        email: data.email?.trim() || null,
        phone: data.phone?.trim() || null,
        stage: data.stage ?? "sourced",
        source: data.source?.trim() || null,
        notes: data.notes?.trim() || null,
        expected_salary: data.expectedSalary ?? null,
        created_by: userId,
      })
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Création impossible" };
    return {
      ok: true,
      data: {
        ...(row as CandidateWithMeta),
        expected_salary: row.expected_salary != null ? Number(row.expected_salary) : null,
        job_title: job.title,
      },
    };
  });

export const moveCandidateStage = createServerFn({ method: "POST" })
  .validator(moveCandidateSchema)
  .handler(async ({ data }): Promise<ActionResult<CandidateWithMeta>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: row, error } = await supabase
      .from("candidates")
      .update({ stage: data.stage })
      .eq("id", data.id)
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Mise à jour impossible" };

    if (data.stage === "hired") {
      await supabase
        .from("job_openings")
        .update({ status: "filled", closed_at: new Date().toISOString() })
        .eq("id", row.job_opening_id)
        .eq("status", "open");
    }

    return {
      ok: true,
      data: {
        ...(row as CandidateWithMeta),
        expected_salary: row.expected_salary != null ? Number(row.expected_salary) : null,
      },
    };
  });

export const softDeleteCandidate = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("candidates")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: data.id } };
  });

export const hireCandidateAsEmployee = createServerFn({ method: "POST" })
  .validator(z.object({ candidateId: z.string().uuid() }))
  .handler(async ({ data }): Promise<ActionResult<CandidateWithMeta>> => {
    const userId = await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: candidate, error: candError } = await supabase
      .from("candidates")
      .select("*")
      .eq("id", data.candidateId)
      .is("deleted_at", null)
      .maybeSingle();

    if (candError || !candidate) {
      return { ok: false, message: "Candidat introuvable" };
    }
    if (candidate.hired_employee_id) {
      return { ok: false, message: "Ce candidat est déjà embauché" };
    }

    const { data: job } = await supabase
      .from("job_openings")
      .select("id, title, department_id, currency_code")
      .eq("id", candidate.job_opening_id)
      .maybeSingle();

    const { error: seatError } = await supabase.rpc("assert_company_can_add_employee", {
      p_company_id: candidate.company_id,
    });
    if (seatError) return { ok: false, message: seatError.message };

    const today = new Date().toISOString().slice(0, 10);
    const { data: employee, error: empError } = await supabase
      .from("employees")
      .insert({
        company_id: candidate.company_id,
        department_id: job?.department_id ?? null,
        first_name: candidate.first_name,
        last_name: candidate.last_name,
        email: candidate.email,
        phone: candidate.phone,
        job_title: job?.title ?? null,
        hire_date: today,
        status: "active",
        base_salary: candidate.expected_salary != null ? Number(candidate.expected_salary) : 0,
        currency_code: job?.currency_code || "KMF",
        created_by: userId,
      })
      .select("id")
      .single();

    if (empError || !employee) {
      return { ok: false, message: empError?.message ?? "Création employé impossible" };
    }

    const { data: row, error } = await supabase
      .from("candidates")
      .update({
        stage: "hired",
        hired_employee_id: employee.id,
      })
      .eq("id", candidate.id)
      .select("*")
      .single();

    if (error || !row) {
      return { ok: false, message: error?.message ?? "Mise à jour candidat impossible" };
    }

    await supabase
      .from("job_openings")
      .update({ status: "filled", closed_at: new Date().toISOString() })
      .eq("id", candidate.job_opening_id)
      .eq("status", "open");

    await supabase.rpc("write_audit_log", {
      p_company_id: candidate.company_id,
      p_action: "recruitment.hire",
      p_entity_type: "employee",
      p_entity_id: employee.id,
      p_summary: `Embauche ${candidate.first_name} ${candidate.last_name}`,
      p_metadata: { candidate_id: candidate.id },
    });

    return {
      ok: true,
      data: {
        ...(row as CandidateWithMeta),
        expected_salary: row.expected_salary != null ? Number(row.expected_salary) : null,
        job_title: job?.title ?? null,
      },
    };
  });

export const recruitmentStats = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }) => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let jobsQ = supabase
      .from("job_openings")
      .select("id, status, created_at, closed_at, published_at")
      .is("deleted_at", null);
    if (data?.companyId) jobsQ = jobsQ.eq("company_id", data.companyId);
    const { data: jobs } = await jobsQ;

    let candsQ = supabase
      .from("candidates")
      .select("id, stage, created_at, updated_at")
      .is("deleted_at", null);
    if (data?.companyId) candsQ = candsQ.eq("company_id", data.companyId);
    const { data: cands } = await candsQ;

    const openRoles = (jobs ?? []).filter((j) => j.status === "open").length;
    const candidates = (cands ?? []).filter((c) => c.stage !== "rejected").length;
    const hired = (cands ?? []).filter((c) => c.stage === "hired");
    const offers = (cands ?? []).filter((c) => c.stage === "offer" || c.stage === "hired").length;
    const activePipe = (cands ?? []).filter(
      (c) => !["hired", "rejected"].includes(c.stage),
    ).length;

    let avgDays = 0;
    if (hired.length) {
      const days = hired.map((h) => {
        const start = new Date(h.created_at).getTime();
        const end = new Date(h.updated_at).getTime();
        return Math.max(1, Math.round((end - start) / 86400000));
      });
      avgDays = Math.round(days.reduce((a, b) => a + b, 0) / days.length);
    }

    const offerRate =
      candidates > 0 ? Math.round((offers / Math.max(candidates, 1)) * 100) : 0;

    return {
      openRoles,
      candidates,
      activePipe,
      avgDaysDays: avgDays,
      offerRate,
      hiredCount: hired.length,
    };
  });
