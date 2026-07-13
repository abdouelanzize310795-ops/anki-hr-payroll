import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  attachHelpdeskTicketPhoto,
  prepareHelpdeskPhotoUpload,
} from "@/modules/helpdesk/helpdesk.functions";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function uploadHelpdeskTicketPhoto(
  companyId: string,
  ticketId: string,
  file: File,
): Promise<string> {
  if (!ALLOWED.has(file.type)) {
    throw new Error("Formats acceptés : PNG, JPG, WebP, GIF");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Photo trop volumineuse (max 5 Mo)");
  }

  const prepared = await prepareHelpdeskPhotoUpload({
    data: {
      companyId,
      ticketId,
      fileName: file.name,
      mimeType: file.type as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
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

  const attached = await attachHelpdeskTicketPhoto({
    data: {
      ticketId,
      photoPath: prepared.data.path,
      photoUrl: prepared.data.publicUrl,
    },
  });
  if (!attached.ok) throw new Error(attached.message);

  return prepared.data.publicUrl;
}
