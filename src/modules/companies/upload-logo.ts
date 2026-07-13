import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  prepareCompanyLogoUpload,
  setCompanyLogoUrl,
} from "@/modules/companies/company.functions";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/svg+xml"]);

export async function uploadCompanyLogoFile(companyId: string, file: File): Promise<string> {
  if (!ALLOWED.has(file.type)) {
    throw new Error("Formats acceptés : PNG, JPG, WebP, SVG");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error("Logo trop volumineux (max 2 Mo)");
  }

  const prepared = await prepareCompanyLogoUpload({
    data: {
      companyId,
      fileName: file.name,
      mimeType: file.type as "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml",
      fileSize: file.size,
    },
  });
  if (!prepared.ok) throw new Error(prepared.message);

  const supabase = createSupabaseBrowserClient();
  const { error: uploadError } = await supabase.storage
    .from(prepared.data.bucket)
    .uploadToSignedUrl(prepared.data.path, prepared.data.token, file, {
      contentType: file.type,
      upsert: true,
    });
  if (uploadError) throw new Error(uploadError.message);

  const saved = await setCompanyLogoUrl({
    data: { companyId, logoUrl: prepared.data.publicUrl },
  });
  if (!saved.ok) throw new Error(saved.message);

  return prepared.data.publicUrl;
}
