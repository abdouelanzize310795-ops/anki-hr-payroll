import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createAssetSchema, updateAssetSchema } from "./schemas";
import type { CompanyAsset, CompanyAssetWithMeta } from "./types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

function mapAsset(
  row: Record<string, unknown>,
  extras?: Partial<CompanyAssetWithMeta>,
): CompanyAssetWithMeta {
  return {
    id: row.id as string,
    company_id: row.company_id as string,
    name: row.name as string,
    category: row.category as CompanyAsset["category"],
    serial_number: (row.serial_number as string) ?? null,
    status: row.status as CompanyAsset["status"],
    assigned_employee_id: (row.assigned_employee_id as string) ?? null,
    assigned_at: (row.assigned_at as string) ?? null,
    purchase_date: (row.purchase_date as string) ?? null,
    notes: (row.notes as string) ?? null,
    created_by: (row.created_by as string) ?? null,
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
    deleted_at: (row.deleted_at as string) ?? null,
    ...extras,
  };
}

export const listAssets = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }): Promise<CompanyAssetWithMeta[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("company_assets")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });
    if (data?.companyId) query = query.eq("company_id", data.companyId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const empIds = [
      ...new Set(
        (rows ?? [])
          .map((r) => r.assigned_employee_id)
          .filter(Boolean) as string[],
      ),
    ];
    const { data: emps } = empIds.length
      ? await supabase
          .from("employees")
          .select("id, first_name, last_name")
          .in("id", empIds)
      : { data: [] as Array<{ id: string; first_name: string; last_name: string }> };

    const names = new Map(
      (emps ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]),
    );

    return (rows ?? []).map((r) =>
      mapAsset(r as Record<string, unknown>, {
        assignee_name: r.assigned_employee_id
          ? names.get(r.assigned_employee_id as string) ?? "—"
          : null,
      }),
    );
  });

export const createAsset = createServerFn({ method: "POST" })
  .validator(createAssetSchema)
  .handler(async ({ data }): Promise<ActionResult<CompanyAssetWithMeta>> => {
    const userId = await requireUserId();
    const supabase = createSupabaseServerClient();

    const assigned = data.assignedEmployeeId || null;
    const { data: row, error } = await supabase
      .from("company_assets")
      .insert({
        company_id: data.companyId,
        name: data.name.trim(),
        category: data.category ?? "other",
        serial_number: data.serialNumber?.trim() || null,
        status: assigned ? "assigned" : (data.status ?? "available"),
        assigned_employee_id: assigned,
        assigned_at: assigned ? new Date().toISOString().slice(0, 10) : null,
        purchase_date: data.purchaseDate || null,
        notes: data.notes?.trim() || null,
        created_by: userId,
      })
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Création impossible" };
    return { ok: true, data: mapAsset(row as Record<string, unknown>) };
  });

export const updateAsset = createServerFn({ method: "POST" })
  .validator(updateAssetSchema)
  .handler(async ({ data }): Promise<ActionResult<CompanyAssetWithMeta>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const patch: Record<string, unknown> = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.category !== undefined) patch.category = data.category;
    if (data.serialNumber !== undefined) {
      patch.serial_number = data.serialNumber?.trim() || null;
    }
    if (data.status !== undefined) patch.status = data.status;
    if (data.assignedEmployeeId !== undefined) {
      patch.assigned_employee_id = data.assignedEmployeeId;
      if (!data.assignedEmployeeId) {
        patch.status = data.status ?? "available";
        patch.assigned_at = null;
      }
    }
    if (data.purchaseDate !== undefined) patch.purchase_date = data.purchaseDate || null;
    if (data.notes !== undefined) patch.notes = data.notes?.trim() || null;

    const { data: row, error } = await supabase
      .from("company_assets")
      .update(patch)
      .eq("id", data.id)
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Mise à jour impossible" };
    return { ok: true, data: mapAsset(row as Record<string, unknown>) };
  });

export const softDeleteAsset = createServerFn({ method: "POST" })
  .validator(z.object({ id: z.string().uuid() }))
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    const { error } = await supabase
      .from("company_assets")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: data.id } };
  });

export const assetStats = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }) => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("company_assets")
      .select("category, status")
      .is("deleted_at", null);
    if (data?.companyId) query = query.eq("company_id", data.companyId);
    const { data: rows } = await query;

    const list = rows ?? [];
    const byCat = (c: string) => list.filter((r) => r.category === c).length;

    return {
      laptops: byCat("laptop"),
      phones: byCat("phone"),
      monitors: byCat("monitor"),
      unassigned: list.filter((r) => r.status === "available").length,
      total: list.length,
    };
  });
