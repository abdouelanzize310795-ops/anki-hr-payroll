import { readFile } from "node:fs/promises";
import path from "node:path";
import { createHmac, timingSafeEqual } from "node:crypto";
import { SESSION_COOKIE, createSession, deleteSession, getUserBySessionToken, verifyPassword } from "./auth";
import { getPool } from "./pool";
import { callRpc } from "./query-builder";
import {
  STORAGE_ROUTE,
  isPublicBucket,
  safeObjectPath,
  storageBucket,
  verifySignature,
  writeObject,
} from "./storage";

/**
 * Plain HTTP endpoints served next to the app:
 *  - /api/storage/*  file download (public or signed) and signed upload
 *  - /api/mobile/*   login + whitelisted RPCs for the employee mobile app (Bearer token)
 * Returns null when the request is not for one of these routes.
 */

const MOBILE_RPCS = new Set([
  "mobile_get_me",
  "mobile_get_home",
  "mobile_secure_clock",
  "mobile_get_schedule",
  "mobile_request_correction",
  "mobile_list_corrections",
  "mobile_list_attendance",
  "mobile_list_leaves",
  "mobile_list_payslips",
  "mobile_list_notifications",
  "mobile_mark_notification_read",
  "mobile_list_team_attendance",
  "mobile_list_team_pending_leaves",
  "mobile_review_leave",
  "mobile_list_leave_types",
  "mobile_request_leave",
  "mobile_cancel_leave",
  "mobile_get_payslip",
  "mobile_get_compensation",
  "mobile_list_documents",
]);

const DOCUMENTS_BUCKET = "hr-documents";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

function splitBucketPath(rest: string): { bucket: string; objectPath: string } {
  const [bucket, ...parts] = rest.split("/").map(decodeURIComponent);
  return { bucket: bucket ?? "", objectPath: parts.join("/") };
}

async function serveFile(bucket: string, objectPath: string, download: boolean): Promise<Response> {
  try {
    const bytes = await readFile(safeObjectPath(bucket, objectPath));
    const type = MIME[path.extname(objectPath).toLowerCase()] ?? "application/octet-stream";
    const headers: Record<string, string> = {
      "content-type": type,
      "cache-control": "private, max-age=300",
      "x-content-type-options": "nosniff",
    };
    // Never render uploaded SVG/HTML inline as an active document from our origin.
    if (type.startsWith("image/svg") || type.startsWith("text/html")) {
      headers["content-security-policy"] = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox";
    }
    if (download) headers["content-disposition"] = `attachment; filename="${path.basename(objectPath)}"`;
    return new Response(bytes, { status: 200, headers });
  } catch {
    return json({ message: "Fichier introuvable" }, 404);
  }
}

async function handleStorage(request: Request, url: URL): Promise<Response> {
  const rest = url.pathname.slice(STORAGE_ROUTE.length + 1);
  const [kind, ...remaining] = rest.split("/");
  const { bucket, objectPath } = splitBucketPath(remaining.join("/"));
  if (!bucket || !objectPath) return json({ message: "Chemin invalide" }, 400);

  if (kind === "public" && request.method === "GET") {
    if (!(await isPublicBucket(bucket))) return json({ message: "Accès refusé" }, 403);
    return serveFile(bucket, objectPath, false);
  }

  if (kind === "object" && request.method === "GET") {
    const exp = Number(url.searchParams.get("exp"));
    const sig = url.searchParams.get("sig") ?? "";
    if (!verifySignature("read", bucket, objectPath, exp, sig)) return json({ message: "Lien expiré ou invalide" }, 403);
    return serveFile(bucket, objectPath, url.searchParams.has("download"));
  }

  if (kind === "upload" && (request.method === "PUT" || request.method === "POST")) {
    const [expRaw, sig] = (url.searchParams.get("token") ?? "").split(".");
    if (!verifySignature("upload", bucket, objectPath, Number(expRaw), sig ?? "")) {
      return json({ message: "Jeton d’upload invalide ou expiré" }, 403);
    }
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_UPLOAD_BYTES) return json({ message: "Fichier trop volumineux" }, 413);
    const bytes = new Uint8Array(await request.arrayBuffer());
    if (bytes.byteLength > MAX_UPLOAD_BYTES) return json({ message: "Fichier trop volumineux" }, 413);
    await writeObject(bucket, objectPath, bytes, url.searchParams.get("upsert") === "true");
    return json({ path: objectPath, fullPath: `${bucket}/${objectPath}` });
  }

  return json({ message: "Route inconnue" }, 404);
}

function bearer(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
}

async function handleMobile(request: Request, url: URL): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "POST") return json({ message: "Méthode non autorisée" }, 405, CORS);

  const route = url.pathname.slice("/api/mobile/".length);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  if (route === "login") {
    const email = String(body.email ?? "");
    const password = String(body.password ?? "");
    const { user, error } = await verifyPassword(email, password);
    if (error || !user) {
      // Diagnostic without leaking the password: email as received + password length.
      console.warn(`[mobile-login] échec pour ${JSON.stringify(email)} (mot de passe : ${password.length} caractères)`);
      return json({ message: "E-mail ou mot de passe incorrect." }, 401, CORS);
    }
    const { token, expiresAt } = await createSession(user.id);
    return json(
      { access_token: token, expires_at: Math.floor(expiresAt.getTime() / 1000), user },
      200,
      CORS,
    );
  }

  const token = bearer(request);
  const user = await getUserBySessionToken(token);
  if (!user) return json({ message: "Session expirée, reconnectez-vous." }, 401, CORS);

  if (route === "logout") {
    await deleteSession(token);
    return json({ ok: true }, 200, CORS);
  }

  if (route === "session") return json({ user }, 200, CORS);

  if (route.startsWith("rpc/")) {
    const name = route.slice(4);
    if (!MOBILE_RPCS.has(name)) return json({ message: "Fonction non autorisée" }, 403, CORS);
    const { data, error } = await callRpc(name, body, async () => user.id);
    if (error) return json({ message: error.message }, 400, CORS);
    if (name === "mobile_list_documents" && Array.isArray(data)) {
      const signed = await Promise.all(
        data.map(async ({ storage_path, ...doc }: { storage_path: string; [k: string]: unknown }) => {
          const { data: link } = await storageBucket(DOCUMENTS_BUCKET).createSignedUrl(storage_path, 15 * 60);
          return { ...doc, url: link?.signedUrl ?? null };
        }),
      );
      return json({ data: signed }, 200, CORS);
    }
    return json({ data }, 200, CORS);
  }

  return json({ message: "Route inconnue" }, 404, CORS);
}

/** Pairing key that lets a site's display screen fetch its rotating QR token. */
export function displayKey(branchId: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET manquant");
  return createHmac("sha256", secret).update(`display:${branchId}`).digest("base64url").slice(0, 32);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleDisplay(request: Request, url: URL): Promise<Response> {
  const [branchId, action] = url.pathname.slice("/api/display/".length).split("/");
  if (request.method !== "GET" || action !== "token" || !branchId || !UUID.test(branchId)) {
    return json({ message: "Route inconnue" }, 404);
  }
  const given = Buffer.from(url.searchParams.get("key") ?? "");
  const expected = Buffer.from(displayKey(branchId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return json({ message: "Écran non autorisé. Rouvrez le lien d’affichage depuis Mshahara." }, 403);
  }
  try {
    const res = await getPool().query("select public.branch_qr_current($1) as qr", [branchId]);
    return json(res.rows[0].qr, 200, { "cache-control": "no-store" });
  } catch (err) {
    return json({ message: err instanceof Error ? err.message : "Erreur" }, 400);
  }
}

function cookieValue(request: Request, name: string): string | null {
  const header = request.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return null;
}

/** GET /api/payslips/:id/pdf — payslip PDF with the employer's template (cookie or Bearer session). */
async function handlePayslipPdf(request: Request, url: URL): Promise<Response> {
  const [id, action] = url.pathname.slice("/api/payslips/".length).split("/");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET" || action !== "pdf" || !id || !UUID.test(id)) {
    return json({ message: "Route inconnue" }, 404, CORS);
  }
  const token = bearer(request) ?? cookieValue(request, SESSION_COOKIE);
  const user = await getUserBySessionToken(token);
  if (!user || !token) return json({ message: "Session expirée, reconnectez-vous." }, 401, CORS);

  try {
    const { renderPayslipPdf } = await import("./payslip-pdf");
    const pdf = await renderPayslipPdf(id, token);
    const meta = await getPool().query(
      `select p.employee_name, r.period_year, r.period_month
         from public.payslips p join public.payroll_runs r on r.id = p.payroll_run_id where p.id = $1`,
      [id],
    );
    const m = meta.rows[0];
    const slug = String(m?.employee_name ?? "salarie")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z0-9]+/g, "_");
    const period = m ? `${m.period_year}-${String(m.period_month).padStart(2, "0")}` : "bulletin";
    return new Response(Buffer.from(pdf), {
      status: 200,
      headers: {
        ...CORS,
        "content-type": "application/pdf",
        "content-disposition": `${url.searchParams.has("inline") ? "inline" : "attachment"}; filename="Bulletin_${slug}_${period}.pdf"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Génération du PDF impossible";
    return json({ message }, /introuvable|accessible/i.test(message) ? 404 : 500, CORS);
  }
}

let jobsStarted = false;

/** Runs the idempotent attendance closing job every 10 minutes (absences, missing check-outs). */
export function startAttendanceJobs(): void {
  if (jobsStarted || !process.env.DATABASE_URL) return;
  jobsStarted = true;
  const run = () =>
    getPool()
      .query("select public.run_attendance_jobs(), public.run_leave_accruals()")
      .catch((err) => console.error("[attendance-jobs]", err instanceof Error ? err.message : err));
  setTimeout(run, 30_000);
  setInterval(run, 10 * 60_000);
}

export async function handleApiRequest(request: Request): Promise<Response | null> {
  startAttendanceJobs();
  const url = new URL(request.url);
  if (url.pathname.startsWith(`${STORAGE_ROUTE}/`)) return handleStorage(request, url);
  if (url.pathname.startsWith("/api/mobile/")) return handleMobile(request, url);
  if (url.pathname.startsWith("/api/display/")) return handleDisplay(request, url);
  if (url.pathname.startsWith("/api/payslips/")) return handlePayslipPdf(request, url);
  return null;
}
