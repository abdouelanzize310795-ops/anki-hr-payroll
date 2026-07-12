import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { amountInWordsFr } from "./amountWords";
import { batchIdSchema, generateTransferSchema } from "./schemas";
import type { TransferBatch, TransferBatchDetail, TransferLine } from "./types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

function mapBatch(row: TransferBatch): TransferBatch {
  return {
    ...row,
    total_amount: Number(row.total_amount),
    line_count: Number(row.line_count),
    missing_account_count: Number(row.missing_account_count),
  };
}

function mapLine(row: TransferLine): TransferLine {
  return { ...row, amount: Number(row.amount) };
}

export const listTransferBatches = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }): Promise<Array<TransferBatch & { company_name?: string | null; payroll_label?: string | null }>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("transfer_batches")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (data?.companyId) query = query.eq("company_id", data.companyId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const batches = ((rows ?? []) as TransferBatch[]).map(mapBatch);
    if (batches.length === 0) return [];

    const companyIds = [...new Set(batches.map((b) => b.company_id))];
    const runIds = [...new Set(batches.map((b) => b.payroll_run_id))];

    const [companiesRes, runsRes] = await Promise.all([
      supabase.from("companies").select("id, legal_name").in("id", companyIds),
      supabase.from("payroll_runs").select("id, label").in("id", runIds),
    ]);

    const companyMap = new Map((companiesRes.data ?? []).map((c) => [c.id, c.legal_name]));
    const runMap = new Map((runsRes.data ?? []).map((r) => [r.id, r.label]));

    return batches.map((b) => ({
      ...b,
      company_name: companyMap.get(b.company_id) ?? null,
      payroll_label: runMap.get(b.payroll_run_id) ?? null,
    }));
  });

export const getTransferBatch = createServerFn({ method: "GET" })
  .validator(batchIdSchema)
  .handler(async ({ data }): Promise<TransferBatchDetail | null> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: row, error } = await supabase
      .from("transfer_batches")
      .select("*")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!row) return null;

    const batch = mapBatch(row as TransferBatch);

    const [{ data: lines }, { data: company }, { data: run }] = await Promise.all([
      supabase
        .from("transfer_lines")
        .select("*")
        .eq("batch_id", batch.id)
        .order("order_number"),
      supabase.from("companies").select("legal_name").eq("id", batch.company_id).maybeSingle(),
      supabase.from("payroll_runs").select("label").eq("id", batch.payroll_run_id).maybeSingle(),
    ]);

    return {
      ...batch,
      company_name: company?.legal_name ?? null,
      payroll_label: run?.label ?? null,
      lines: ((lines ?? []) as TransferLine[]).map(mapLine),
    };
  });

export const listEligiblePayrollRuns = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }) => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("payroll_runs")
      .select("id, label, company_id, status, total_net, currency_code, period_year, period_month")
      .is("deleted_at", null)
      .in("status", ["approved", "paid"])
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false });

    if (data?.companyId) query = query.eq("company_id", data.companyId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const runs = rows ?? [];
    if (runs.length === 0) return [];

    const { data: batches } = await supabase
      .from("transfer_batches")
      .select("payroll_run_id, id, status")
      .in(
        "payroll_run_id",
        runs.map((r) => r.id),
      )
      .is("deleted_at", null);

    const batchByRun = new Map((batches ?? []).map((b) => [b.payroll_run_id, b]));

    return runs.map((r) => ({
      id: r.id,
      label: r.label,
      company_id: r.company_id,
      status: r.status,
      total_net: Number(r.total_net),
      currency_code: r.currency_code,
      existing_batch_id: batchByRun.get(r.id)?.id ?? null,
      existing_batch_status: batchByRun.get(r.id)?.status ?? null,
    }));
  });

export const generateTransferBatch = createServerFn({ method: "POST" })
  .validator(generateTransferSchema)
  .handler(async ({ data }): Promise<ActionResult<TransferBatch>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    // Peek net total to build words before RPC (RPC can also receive words)
    const { data: run } = await supabase
      .from("payroll_runs")
      .select("total_net, currency_code")
      .eq("id", data.payrollRunId)
      .maybeSingle();

    const words = amountInWordsFr(Number(run?.total_net ?? 0));

    const { data: row, error } = await supabase.rpc("generate_transfer_batch", {
      p_payroll_run_id: data.payrollRunId,
      p_total_in_words: words,
    });

    if (error || !row) return { ok: false, message: error?.message ?? "Génération impossible" };

    // Recompute words from actual batch total (may differ if some slips skipped)
    const batch = mapBatch(row as TransferBatch);
    const actualWords = amountInWordsFr(batch.total_amount);
    if (actualWords !== batch.total_in_words) {
      await supabase
        .from("transfer_batches")
        .update({ total_in_words: actualWords })
        .eq("id", batch.id);
      batch.total_in_words = actualWords;
    }

    return { ok: true, data: batch };
  });

export const markTransferExported = createServerFn({ method: "POST" })
  .validator(batchIdSchema)
  .handler(async ({ data }): Promise<ActionResult<TransferBatch>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: row, error } = await supabase.rpc("mark_transfer_batch_exported", {
      p_batch_id: data.id,
    });

    if (error || !row) return { ok: false, message: error?.message ?? "Export impossible" };
    return { ok: true, data: mapBatch(row as TransferBatch) };
  });

export const transferStats = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }) => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("transfer_batches")
      .select("status, total_amount, line_count")
      .is("deleted_at", null)
      .neq("status", "cancelled");

    if (data?.companyId) query = query.eq("company_id", data.companyId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const list = rows ?? [];
    const latest = list[0];
    return {
      batchCount: list.length,
      totalAmount: list.reduce((s, r) => s + Number(r.total_amount), 0),
      readyCount: list.filter((r) => r.status === "ready" || r.status === "draft").length,
      exportedCount: list.filter((r) => r.status === "exported").length,
      latestLines: latest ? Number(latest.line_count) : 0,
    };
  });
