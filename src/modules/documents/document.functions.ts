import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { documentIdSchema, prepareUploadSchema } from "./schemas";
import type { DocumentCategory, HrDocument, HrDocumentWithMeta } from "./types";

type ActionResult<T> = { ok: true; data: T } | { ok: false; message: string };

const BUCKET = "hr-documents";

async function requireUserId(): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentification requise");
  return data.user.id;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^\w.\-() ]+/g, "_").slice(0, 180);
}

function mapDoc(row: HrDocument): HrDocument {
  return { ...row, file_size: Number(row.file_size) };
}

export const listDocuments = createServerFn({ method: "GET" })
  .validator(
    z
      .object({
        companyId: z.string().uuid().optional(),
        category: z
          .enum(["contract", "payslip", "identity", "policy", "medical", "other", "all"])
          .optional(),
        search: z.string().optional(),
      })
      .optional(),
  )
  .handler(async ({ data }): Promise<HrDocumentWithMeta[]> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("hr_documents")
      .select("*")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (data?.companyId) query = query.eq("company_id", data.companyId);
    if (data?.category && data.category !== "all") query = query.eq("category", data.category);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    let docs = ((rows ?? []) as HrDocument[]).map(mapDoc);
    const search = data?.search?.trim().toLowerCase();
    if (search) {
      docs = docs.filter((d) =>
        [d.title, d.file_name, d.description]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(search)),
      );
    }

    if (docs.length === 0) return [];

    const employeeIds = [...new Set(docs.map((d) => d.employee_id).filter(Boolean))] as string[];
    const companyIds = [...new Set(docs.map((d) => d.company_id))];

    const [empsRes, companiesRes] = await Promise.all([
      employeeIds.length
        ? supabase.from("employees").select("id, first_name, last_name").in("id", employeeIds)
        : Promise.resolve({ data: [] as Array<{ id: string; first_name: string; last_name: string }> }),
      supabase.from("companies").select("id, legal_name").in("id", companyIds),
    ]);

    const empMap = new Map(
      (empsRes.data ?? []).map((e) => [e.id, `${e.first_name} ${e.last_name}`]),
    );
    const companyMap = new Map((companiesRes.data ?? []).map((c) => [c.id, c.legal_name]));

    return docs.map((d) => ({
      ...d,
      employee_name: d.employee_id ? empMap.get(d.employee_id) ?? null : null,
      company_name: companyMap.get(d.company_id) ?? null,
    }));
  });

export const documentStats = createServerFn({ method: "GET" })
  .validator(z.object({ companyId: z.string().uuid().optional() }).optional())
  .handler(async ({ data }) => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    let query = supabase
      .from("hr_documents")
      .select("id, category, file_size")
      .is("deleted_at", null);

    if (data?.companyId) query = query.eq("company_id", data.companyId);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const list = rows ?? [];
    const byCategory: Record<string, { count: number; size: number }> = {};
    for (const r of list) {
      const cur = byCategory[r.category] ?? { count: 0, size: 0 };
      cur.count += 1;
      cur.size += Number(r.file_size);
      byCategory[r.category] = cur;
    }

    return {
      fileCount: list.length,
      folderCount: Object.keys(byCategory).length,
      totalBytes: list.reduce((s, r) => s + Number(r.file_size), 0),
      byCategory,
    };
  });

export const prepareDocumentUpload = createServerFn({ method: "POST" })
  .validator(prepareUploadSchema)
  .handler(async ({ data }): Promise<
    ActionResult<{
      document: HrDocument;
      storagePath: string;
      bucket: string;
      token: string;
      path: string;
    }>
  > => {
    const userId = await requireUserId();
    const supabase = createSupabaseServerClient();

    if (data.employeeId) {
      const { data: emp } = await supabase
        .from("employees")
        .select("id, company_id")
        .eq("id", data.employeeId)
        .maybeSingle();
      if (!emp || emp.company_id !== data.companyId) {
        return { ok: false, message: "Employé introuvable pour cette entreprise" };
      }
    }

    const id = crypto.randomUUID();
    const safeName = sanitizeFileName(data.fileName);
    const storagePath = `${data.companyId}/${id}/${safeName}`;

    const { data: row, error } = await supabase
      .from("hr_documents")
      .insert({
        id,
        company_id: data.companyId,
        employee_id: data.employeeId || null,
        category: data.category as DocumentCategory,
        title: data.title.trim(),
        description: data.description?.trim() || null,
        file_name: safeName,
        mime_type: data.mimeType || null,
        file_size: data.fileSize,
        storage_path: storagePath,
        uploaded_by: userId,
      })
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Création impossible" };

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath);

    if (signError || !signed) {
      await supabase.from("hr_documents").delete().eq("id", id);
      return { ok: false, message: signError?.message ?? "Impossible de préparer l’upload" };
    }

    return {
      ok: true,
      data: {
        document: mapDoc(row as HrDocument),
        storagePath,
        bucket: BUCKET,
        token: signed.token,
        path: signed.path,
      },
    };
  });

export const getDocumentDownloadUrl = createServerFn({ method: "POST" })
  .validator(documentIdSchema)
  .handler(async ({ data }): Promise<ActionResult<{ url: string; fileName: string }>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: doc, error } = await supabase
      .from("hr_documents")
      .select("*")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !doc) return { ok: false, message: "Document introuvable" };

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(doc.storage_path, 60 * 10);

    if (signError || !signed?.signedUrl) {
      return { ok: false, message: signError?.message ?? "Lien de téléchargement indisponible" };
    }

    return { ok: true, data: { url: signed.signedUrl, fileName: doc.file_name } };
  });

export const softDeleteDocument = createServerFn({ method: "POST" })
  .validator(documentIdSchema)
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: doc } = await supabase
      .from("hr_documents")
      .select("id, storage_path")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (!doc) return { ok: false, message: "Document introuvable" };

    await supabase.storage.from(BUCKET).remove([doc.storage_path]);

    const { error } = await supabase
      .from("hr_documents")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", data.id);

    if (error) return { ok: false, message: error.message };
    return { ok: true, data: { id: data.id } };
  });

export const abortDocumentUpload = createServerFn({ method: "POST" })
  .validator(documentIdSchema)
  .handler(async ({ data }): Promise<ActionResult<{ id: string }>> => {
    await requireUserId();
    const supabase = createSupabaseServerClient();
    await supabase.from("hr_documents").delete().eq("id", data.id);
    return { ok: true, data: { id: data.id } };
  });
