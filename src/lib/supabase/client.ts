/**
 * Browser-side storage helper. Uploads go straight to the app's own
 * /api/storage endpoint using a signed token issued by a server function.
 */

const STORAGE_ROUTE = "/api/storage";

function encodeObjectPath(objectPath: string): string {
  return objectPath.split("/").map(encodeURIComponent).join("/");
}

async function uploadToSignedUrl(
  bucket: string,
  objectPath: string,
  token: string,
  file: Blob,
  options?: { contentType?: string; upsert?: boolean },
): Promise<{ data: { path: string } | null; error: { message: string } | null }> {
  const params = new URLSearchParams({ token });
  if (options?.upsert) params.set("upsert", "true");
  try {
    const res = await fetch(`${STORAGE_ROUTE}/upload/${bucket}/${encodeObjectPath(objectPath)}?${params}`, {
      method: "PUT",
      headers: { "content-type": options?.contentType || file.type || "application/octet-stream" },
      body: file,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      return { data: null, error: { message: body?.message ?? `Upload impossible (${res.status})` } };
    }
    return { data: { path: objectPath }, error: null };
  } catch (err) {
    return { data: null, error: { message: err instanceof Error ? err.message : "Upload impossible" } };
  }
}

export function createSupabaseBrowserClient() {
  return {
    storage: {
      from: (bucket: string) => ({
        uploadToSignedUrl: (
          objectPath: string,
          token: string,
          file: Blob,
          options?: { contentType?: string; upsert?: boolean },
        ) => uploadToSignedUrl(bucket, objectPath, token, file, options),
      }),
    },
  };
}
