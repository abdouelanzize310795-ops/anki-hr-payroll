import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createFromTemplateSchema, documentIdSchema, prepareUploadSchema } from "./schemas";
import type { DocumentCategory, HrDocument, HrDocumentWithMeta } from "./types";
import { getTemplateById } from "./templates/catalog";
import { defaultTemplateContext, renderTemplateHtml } from "./templates/render";

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

export const listDocumentTemplates = createServerFn({ method: "GET" }).handler(async () => {
  await requireUserId();
  const { DOCUMENT_TEMPLATES } = await import("./templates/catalog");
  return DOCUMENT_TEMPLATES.map((t) => ({
    id: t.id,
    category: t.category,
    title: t.title,
    shortLabel: t.shortLabel,
    description: t.description,
    note: t.note ?? null,
    fields: t.fields,
  }));
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
      const { error: cleanupError } = await supabase.from("hr_documents").delete().eq("id", id);
      if (cleanupError) {
        await supabase
          .from("hr_documents")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", id);
      }
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

export const createDocumentFromTemplate = createServerFn({ method: "POST" })
  .validator(createFromTemplateSchema)
  .handler(async ({ data }): Promise<ActionResult<{ document: HrDocument }>> => {
    const userId = await requireUserId();
    const supabase = createSupabaseServerClient();
    const template = getTemplateById(data.templateId);
    if (!template) return { ok: false, message: "Modèle introuvable" };

    const { data: company } = await supabase
      .from("companies")
      .select(
        "id, legal_name, trade_name, city, region, address_line1, phone, email, tax_id, registration_number, logo_url",
      )
      .eq("id", data.companyId)
      .is("deleted_at", null)
      .maybeSingle();
    if (!company) return { ok: false, message: "Entreprise introuvable" };

    const ctx = defaultTemplateContext();
    ctx.company = company.legal_name || company.trade_name || "Entreprise";
    ctx.city = company.city || company.region || "Moroni";
    if (data.startDate) ctx.start = data.startDate;
    if (data.endDate) ctx.end = data.endDate;
    if (data.salary) ctx.salary = data.salary;
    if (data.jobTitle) ctx.job = data.jobTitle;

    let employeeId: string | null = data.employeeId || null;
    if (employeeId) {
      const { data: emp } = await supabase
        .from("employees")
        .select(
          "id, company_id, first_name, last_name, job_title, national_id, bank_rib, bank_account, hire_date, base_salary, city",
        )
        .eq("id", employeeId)
        .is("deleted_at", null)
        .maybeSingle();
      if (!emp || emp.company_id !== data.companyId) {
        return { ok: false, message: "Employé introuvable pour cette entreprise" };
      }
      ctx.employee = `${emp.first_name} ${emp.last_name}`.trim();
      ctx.job = data.jobTitle || emp.job_title || ctx.job;
      ctx.national_id = emp.national_id || ctx.national_id;
      ctx.rib = emp.bank_rib || emp.bank_account || ctx.rib;
      if (!data.startDate && emp.hire_date) ctx.start = emp.hire_date;
      if (!data.salary && emp.base_salary != null) ctx.salary = String(emp.base_salary);
      if (emp.city) ctx.city = emp.city;
    }

    const html = renderTemplateHtml(template, ctx, {
      letterhead: {
        legalName: company.legal_name,
        tradeName: company.trade_name,
        logoUrl: company.logo_url,
        address: company.address_line1,
        city: company.city,
        region: company.region,
        phone: company.phone,
        email: company.email,
        taxId: company.tax_id,
        registrationNumber: company.registration_number,
      },
    });
    const bytes = new TextEncoder().encode(html);
    const id = crypto.randomUUID();
    const label =
      ctx.employee !== "[Nom du salarié]" ? ctx.employee : "modele";
    const safeName = sanitizeFileName(`${template.shortLabel}-${label}.html`);
    const storagePath = `${data.companyId}/${id}/${safeName}`;

    const { data: row, error } = await supabase
      .from("hr_documents")
      .insert({
        id,
        company_id: data.companyId,
        employee_id: employeeId,
        category: template.category,
        title: template.title,
        description: template.description,
        file_name: safeName,
        mime_type: "text/html",
        file_size: bytes.byteLength,
        storage_path: storagePath,
        uploaded_by: userId,
      })
      .select("*")
      .single();

    if (error || !row) return { ok: false, message: error?.message ?? "Création impossible" };

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
      contentType: "text/html",
      upsert: false,
    });

    if (uploadError) {
      await supabase.from("hr_documents").delete().eq("id", id);
      return { ok: false, message: uploadError.message };
    }

    return { ok: true, data: { document: mapDoc(row as HrDocument) } };
  });

export const getDocumentDownloadUrl = createServerFn({ method: "POST" })
  .validator(documentIdSchema)
  .handler(async ({ data }): Promise<
    ActionResult<{ url: string; fileName: string; mimeType: string | null }>
  > => {
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
      return {
        ok: false,
        message:
          signError?.message ??
          "Fichier introuvable dans le stockage — re-téléversez le document",
      };
    }

    return {
      ok: true,
      data: {
        url: signed.signedUrl,
        fileName: doc.file_name,
        mimeType: doc.mime_type,
      },
    };
  });

/** Returns HTML body for in-app preview (avoids signed-URL raw source / CORS). */
export const getDocumentHtmlContent = createServerFn({ method: "POST" })
  .validator(documentIdSchema)
  .handler(async ({ data }): Promise<
    ActionResult<{ html: string; title: string }>
  > => {
    await requireUserId();
    const supabase = createSupabaseServerClient();

    const { data: doc, error } = await supabase
      .from("hr_documents")
      .select("id, file_name, mime_type, storage_path, title")
      .eq("id", data.id)
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !doc) return { ok: false, message: "Document introuvable" };

    const isHtml =
      (doc.mime_type ?? "").includes("html") ||
      doc.file_name.toLowerCase().endsWith(".html");
    if (!isHtml) return { ok: false, message: "Ce fichier n’est pas un document HTML" };

    const { data: blob, error: dlError } = await supabase.storage
      .from(BUCKET)
      .download(doc.storage_path);

    if (dlError || !blob) {
      return { ok: false, message: dlError?.message ?? "Téléchargement impossible" };
    }

    const html = await blob.text();
    return {
      ok: true,
      data: {
        html,
        title: doc.title || doc.file_name.replace(/\.html$/i, ""),
      },
    };
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
    const { error } = await supabase.from("hr_documents").delete().eq("id", data.id);
    if (error) {
      const { error: softError } = await supabase
        .from("hr_documents")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", data.id);
      if (softError) return { ok: false, message: softError.message };
    }
    return { ok: true, data: { id: data.id } };
  });
