import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  createCourseSchema,
  enrollSchema,
  updateCourseSchema,
  updateEnrollmentSchema,
} from "./schemas";
import type {
  TrainingCourse,
  TrainingCourseWithMeta,
  TrainingEnrollmentWithMeta,
} from "./types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

function mapCourse(
  row: Record<string, unknown>,
  extras?: Partial<TrainingCourseWithMeta>,
): TrainingCourseWithMeta {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    title: row.title as string,
    category: row.category as string,
    description: (row.description as string) ?? null,
    duration_hours: Number(row.duration_hours),
    status: row.status as TrainingCourse["status"],
    created_by: (row.created_by as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string) ?? null,
    ...extras,
  };
}

export const listCourses = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }): Promise<TrainingCourseWithMeta[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("training_courses")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (data?.companyId) query = query.eq("company_id", data.companyId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const courses = rows ?? [];
    const ids = courses.map((c) => c.id as string);
    const { data: enrolls } = ids.length
      ? await supabase
          .from("training_enrollments")
          .select("course_id, status, progress_pct")
          .in("course_id", ids)
          .is("deleted_at", null)
          .neq("status", "cancelled")
      : { data: [] as Array<{ course_id: string; status: string; progress_pct: number }> };

    const byCourse = new Map<
      string,
      { enrolled: number; completed: number; progressSum: number }
    >();
    for (const e of enrolls ?? []) {
      const cur = byCourse.get(e.course_id) ?? {
        enrolled: 0,
        completed: 0,
        progressSum: 0,
      };
      cur.enrolled += 1;
      if (e.status === "completed") cur.completed += 1;
      cur.progressSum += Number(e.progress_pct || 0);
      byCourse.set(e.course_id, cur);
    }

    return courses.map((c) => {
      const m = byCourse.get(c.id as string);
      return mapCourse(c as Record<string, unknown>, {
        enrolled_count: m?.enrolled ?? 0,
        completed_count: m?.completed ?? 0,
        avg_progress: m?.enrolled
          ? Math.round(m.progressSum / m.enrolled)
          : 0,
      });
    });
  });

export const createCourse = createServerFn({ method: "POST" })
  .validator(createCourseSchema)
  .handler(async ({ data }): Promise<ActionResult<TrainingCourseWithMeta>> => {
    const userId = await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: row, error } = await supabase
      .from("training_courses")
      .insert({
        company_id: data.companyId,
        title: data.title.trim(),
        category: data.category?.trim() || "Général",
        description: data.description?.trim() || null,
        duration_hours: data.durationHours ?? 2,
        status: data.status ?? "active",
        created_by: userId,
      })
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Création impossible" };
    return {
      ok: true,
      data: mapCourse(row as Record<string, unknown>, {
        enrolled_count: 0,
        completed_count: 0,
        avg_progress: 0,
      }),
    };
  });

export const updateCourse = createServerFn({ method: "POST" })
  .validator(updateCourseSchema)
  .handler(async ({ data }): Promise<ActionResult<TrainingCourseWithMeta>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title.trim();
    if (data.category !== undefined) patch.category = data.category.trim();
    if (data.description !== undefined) patch.description = data.description?.trim() || null;
    if (data.durationHours !== undefined) patch.duration_hours = data.durationHours;
    if (data.status !== undefined) patch.status = data.status;

    const { data: row, error } = await supabase
      .from("training_courses")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Mise à jour impossible" };
    return { ok: true, data: mapCourse(row as Record<string, unknown>) };
  });

export const softDeleteCourse = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("training_courses")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: data.id } };
  });

export const listEnrollments = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        companyId: z.string().uuid().optional(),
        courseId: z.string().uuid().optional(),
      })
      .optional(),
  )
  .handler(async ({ data }): Promise<TrainingEnrollmentWithMeta[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("training_enrollments")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (data?.companyId) query = query.eq("company_id", data.companyId);
    if (data?.courseId) query = query.eq("course_id", data.courseId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const empIds = [...new Set((rows ?? []).map((r) => r.employee_id))];
    const courseIds = [...new Set((rows ?? []).map((r) => r.course_id))];

    const [{ data: emps }, { data: courses }] = await Promise.all([
      empIds.length
        ? supabase.from("employees").select("id, first_name, last_name").in("id", empIds)
        : Promise.resolve({ data: [] as Array<{ id: string; first_name: string; last_name: string }> }),
      courseIds.length
        ? supabase.from("training_courses").select("id, title").in("id", courseIds)
        : Promise.resolve({ data: [] as Array<{ id: string; title: string }> }),
    ]);

    const empName = new Map(
      (emps ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]),
    );
    const courseTitle = new Map((courses ?? []).map((c) => [c.id, c.title]));

    return (rows ?? []).map((r) => ({
      ...(r as TrainingEnrollmentWithMeta),
      progress_pct: Number(r.progress_pct),
      employee_name: empName.get(r.employee_id) ?? "—",
      course_title: courseTitle.get(r.course_id) ?? "—",
    }));
  });

export const enrollEmployee = createServerFn({ method: "POST" })
  .validator(enrollSchema)
  .handler(async ({ data }): Promise<ActionResult<TrainingEnrollmentWithMeta>> => {
    const userId = await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: course } = await supabase
      .from("training_courses")
      .select("id, company_id, title")
      .eq("id", data.courseId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!course || course.company_id !== data.companyId) {
      return { ok: false, message: "Cours introuvable" };
    }

    const { data: row, error } = await supabase
      .from("training_enrollments")
      .insert({
        company_id: data.companyId,
        course_id: data.courseId,
        employee_id: data.employeeId,
        status: "enrolled",
        progress_pct: 0,
        created_by: userId,
      })
      .select("*")
      .single();

    if (error || !row) {
      if (error?.code === "23505") {
        return { ok: false, message: "Cet employé est déjà inscrit à ce cours" };
      }
      return { ok: false, message: error?.message ?? "Inscription impossible" };
    }

    const { data: emp } = await supabase
      .from("employees")
      .select("first_name, last_name")
      .eq("id", data.employeeId)
      .maybeSingle();

    return {
      ok: true,
      data: {
        ...(row as TrainingEnrollmentWithMeta),
        progress_pct: Number(row.progress_pct),
        employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "—",
        course_title: course.title,
      },
    };
  });

export const updateEnrollment = createServerFn({ method: "POST" })
  .validator(updateEnrollmentSchema)
  .handler(async ({ data }): Promise<ActionResult<TrainingEnrollmentWithMeta>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const patch: Record<string, unknown> = {};
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === "completed") {
        patch.progress_pct = 100;
        patch.completed_at = new Date().toISOString();
        patch.certificate_issued = true;
      }
      if (data.status === "in_progress" && data.progressPct === undefined) {
        patch.progress_pct = 50;
      }
    }
    if (data.progressPct !== undefined) patch.progress_pct = data.progressPct;
    if (data.certificateIssued !== undefined) {
      patch.certificate_issued = data.certificateIssued;
    }

    const { data: row, error } = await supabase
      .from("training_enrollments")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Mise à jour impossible" };
    return {
      ok: true,
      data: {
        ...(row as TrainingEnrollmentWithMeta),
        progress_pct: Number(row.progress_pct),
      },
    };
  });

export const trainingStats = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }) => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let coursesQ = supabase
      .from("training_courses")
      .select("id, status")
      .is("deleted_at", null);
    if (data?.companyId) coursesQ = coursesQ.eq("company_id", data.companyId);
    const { data: courses } = await coursesQ;

    let enrollQ = supabase
      .from("training_enrollments")
      .select("id, status, progress_pct, certificate_issued")
      .is("deleted_at", null)
      .neq("status", "cancelled");
    if (data?.companyId) enrollQ = enrollQ.eq("company_id", data.companyId);
    const { data: enrolls } = await enrollQ;

    const activeCourses = (courses ?? []).filter((c) => c.status === "active").length;
    const enrollments = enrolls?.length ?? 0;
    const certificates = (enrolls ?? []).filter((e) => e.certificate_issued).length;
    const avgCompletion = enrollments
      ? Math.round(
          (enrolls ?? []).reduce((s, e) => s + Number(e.progress_pct || 0), 0) / enrollments,
        )
      : 0;

    return { activeCourses, enrollments, certificates, avgCompletion };
  });
