import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPool, toDbError, type DbError } from "./pool";

/**
 * Local-disk file storage replacing Supabase Storage.
 * Files live in UPLOADS_DIR/<bucket>/<path>. Private files are served through
 * HMAC-signed URLs; buckets flagged public in storage.buckets are served openly.
 */

export const STORAGE_ROUTE = "/api/storage";

function uploadsDir(): string {
  return process.env.UPLOADS_DIR || path.join(process.cwd(), ".uploads");
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET manquant");
  return s;
}

const SAFE_SEGMENT = /^[^/\\\0:*?"<>|]+$/;

export function safeObjectPath(bucket: string, objectPath: string): string {
  const segments = objectPath.split("/").filter(Boolean);
  if (!SAFE_SEGMENT.test(bucket) || segments.length === 0 || segments.some((s) => !SAFE_SEGMENT.test(s) || s === ".." || s === ".")) {
    throw new Error("Chemin de fichier invalide");
  }
  return path.join(uploadsDir(), bucket, ...segments);
}

export function sign(purpose: "read" | "upload", bucket: string, objectPath: string, exp: number): string {
  return createHmac("sha256", secret()).update(`${purpose}:${bucket}/${objectPath}:${exp}`).digest("base64url");
}

export function verifySignature(
  purpose: "read" | "upload",
  bucket: string,
  objectPath: string,
  exp: number,
  sig: string,
): boolean {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(purpose, bucket, objectPath, exp));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function encodeObjectPath(objectPath: string): string {
  return objectPath.split("/").map(encodeURIComponent).join("/");
}

export async function isPublicBucket(bucket: string): Promise<boolean> {
  const res = await getPool().query("select public from storage.buckets where id = $1", [bucket]);
  return res.rows[0]?.public === true;
}

export async function writeObject(bucket: string, objectPath: string, bytes: Uint8Array, upsert = true) {
  const target = safeObjectPath(bucket, objectPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes, upsert ? undefined : { flag: "wx" });
}

type Result<T> = Promise<{ data: T | null; error: DbError | null }>;

async function wrap<T>(fn: () => Promise<T>): Result<T> {
  try {
    return { data: await fn(), error: null };
  } catch (err) {
    return { data: null, error: toDbError(err) };
  }
}

export function storageBucket(bucket: string) {
  return {
    upload: (objectPath: string, body: Uint8Array | ArrayBuffer | Blob | string, options?: { upsert?: boolean; contentType?: string }) =>
      wrap(async () => {
        const bytes =
          typeof body === "string"
            ? new TextEncoder().encode(body)
            : body instanceof Blob
              ? new Uint8Array(await body.arrayBuffer())
              : body instanceof ArrayBuffer
                ? new Uint8Array(body)
                : body;
        await writeObject(bucket, objectPath, bytes, options?.upsert ?? false);
        return { path: objectPath, fullPath: `${bucket}/${objectPath}` };
      }),

    download: (objectPath: string) =>
      wrap(async () => {
        const bytes = await readFile(safeObjectPath(bucket, objectPath));
        return new Blob([bytes]);
      }),

    remove: (paths: string[]) =>
      wrap(async () => {
        for (const p of paths) await rm(safeObjectPath(bucket, p), { force: true });
        return paths.map((name) => ({ name }));
      }),

    createSignedUrl: (objectPath: string, expiresInSeconds: number) =>
      wrap(async () => {
        safeObjectPath(bucket, objectPath);
        const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
        const sig = sign("read", bucket, objectPath, exp);
        return {
          signedUrl: `${STORAGE_ROUTE}/object/${bucket}/${encodeObjectPath(objectPath)}?exp=${exp}&sig=${sig}`,
        };
      }),

    createSignedUploadUrl: (objectPath: string) =>
      wrap(async () => {
        safeObjectPath(bucket, objectPath);
        const exp = Math.floor(Date.now() / 1000) + 2 * 3600;
        const token = `${exp}.${sign("upload", bucket, objectPath, exp)}`;
        return {
          path: objectPath,
          token,
          signedUrl: `${STORAGE_ROUTE}/upload/${bucket}/${encodeObjectPath(objectPath)}?token=${token}`,
        };
      }),

    getPublicUrl: (objectPath: string) => ({
      data: { publicUrl: publicObjectUrl(bucket, objectPath) },
    }),
  };
}

export function publicObjectUrl(bucket: string, objectPath: string): string {
  return `${STORAGE_ROUTE}/public/${bucket}/${encodeObjectPath(objectPath)}`;
}
