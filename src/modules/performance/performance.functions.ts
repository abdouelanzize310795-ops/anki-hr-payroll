import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createReviewSchema, updateReviewSchema } from "./schemas";
import type { PerformanceReview, PerformanceReviewWithMeta } from "./types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

function mapReview(
  row: Record<string, unknown>,
  extras?: Partial<PerformanceReviewWithMeta>,
): PerformanceReviewWithMeta {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    employee_id: row.employee_id as string,
    period_label: row.period_label as string,
    score: Number(row.score),
    goals_pct: Number(row.goals_pct),
    status: row.status as PerformanceReview["status"],
    notes: (row.notes as string) ?? null,
    reviewer_name: (row.reviewer_name as string) ?? null,
    reviewed_at: (row.reviewed_at as string) ?? null,
    created_by: (row.created_by as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string) ?? null,
    ...extras,
  };
}

export const listReviews = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }): Promise<PerformanceReviewWithMeta[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("performance_reviews")
      .select("*")
      .is("deleted_at", null)
      .order("score", { ascending: false })
      .order("created_at", { ascending: false });
    if (data?.companyId) query = query.eq("company_id", data.companyId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const empIds = [...new Set((rows ?? []).map((r) => r.employee_id))];
    const { data: emps } = empIds.length
      ? await supabase
          .from("employees")
          .select("id, first_name, last_name, job_title")
          .in("id", empIds)
      : { data: [] as Array<{ id: string; first_name: string; last_name: string; job_title: string | null }> };

    const meta = new Map(
      (emps ?? []).map((e) => [
        e.id,
        { name: `${e.first_name} ${e.last_name}`, job: e.job_title },
      ]),
    );

    return (rows ?? []).map((r) => {
      const m = meta.get(r.employee_id as string);
      return mapReview(r as Record<string, unknown>, {
        employee_name: m?.name ?? "—",
        job_title: m?.job ?? null,
      });
    });
  });

export const createReview = createServerFn({ method: "POST" })
  .validator(createReviewSchema)
  .handler(async ({ data }): Promise<ActionResult<PerformanceReviewWithMeta>> => {
    const userId = await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: emp } = await supabase
      .from("employees")
      .select("id, company_id, first_name, last_name, job_title")
      .eq("id", data.employeeId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!emp || emp.company_id !== data.companyId) {
      return { ok: false, message: "Employé introuvable" };
    }

    const status = data.status ?? "finalized";
    const { data: row, error } = await supabase
      .from("performance_reviews")
      .insert({
        company_id: data.companyId,
        employee_id: data.employeeId,
        period_label: data.periodLabel?.trim() || "T3 2026",
        score: data.score ?? 3,
        goals_pct: data.goalsPct ?? 0,
        notes: data.notes?.trim() || null,
        reviewer_name: data.reviewerName?.trim() || null,
        status,
        reviewed_at: status === "finalized" ? new Date().toISOString() : null,
        created_by: userId,
      })
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Création impossible" };
    return {
      ok: true,
      data: mapReview(row as Record<string, unknown>, {
        employee_name: `${emp.first_name} ${emp.last_name}`,
        job_title: emp.job_title,
      }),
    };
  });

export const updateReview = createServerFn({ method: "POST" })
  .validator(updateReviewSchema)
  .handler(async ({ data }): Promise<ActionResult<PerformanceReviewWithMeta>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const patch: Record<string, unknown> = {};
    if (data.score !== undefined) patch.score = data.score;
    if (data.goalsPct !== undefined) patch.goals_pct = data.goalsPct;
    if (data.notes !== undefined) patch.notes = data.notes?.trim() || null;
    if (data.reviewerName !== undefined) patch.reviewer_name = data.reviewerName?.trim() || null;
    if (data.periodLabel !== undefined) patch.period_label = data.periodLabel.trim();
    if (data.status !== undefined) {
      patch.status = data.status;
      if (data.status === "finalized") patch.reviewed_at = new Date().toISOString();
    }

    const { data: row, error } = await supabase
      .from("performance_reviews")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Mise à jour impossible" };
    return { ok: true, data: mapReview(row as Record<string, unknown>) };
  });

export const softDeleteReview = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("performance_reviews")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: data.id } };
  });

export const performanceStats = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }) => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("performance_reviews")
      .select("id, score, goals_pct, status")
      .is("deleted_at", null);
    if (data?.companyId) query = query.eq("company_id", data.companyId);
    const { data: rows } = await query;

    const list = rows ?? [];
    const finalized = list.filter((r) => r.status === "finalized" || r.status === "submitted");
    const avgScore = finalized.length
      ? Math.round(
          (finalized.reduce((s, r) => s + Number(r.score), 0) / finalized.length) * 10,
        ) / 10
      : 0;
    const avgGoals = finalized.length
      ? Math.round(
          finalized.reduce((s, r) => s + Number(r.goals_pct), 0) / finalized.length,
        )
      : 0;

    let empQ = supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .in("status", ["active", "on_leave"]);
    if (data?.companyId) empQ = empQ.eq("company_id", data.companyId);
    const { count: headcount } = await empQ;

    return {
      avgScore,
      avgGoals,
      reviewsDone: finalized.length,
      headcount: headcount ?? 0,
      topCount: finalized.filter((r) => Number(r.score) >= 4.5).length,
    };
  });
