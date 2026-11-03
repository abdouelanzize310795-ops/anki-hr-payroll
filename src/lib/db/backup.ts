import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { getPool } from "./pool";
import { uploadsDir } from "./storage";

/**
 * Full-system backups for the platform admin: one ZIP holding
 *  - manifest.json   what the archive is and what it contains
 *  - database.dump   pg_dump of the whole database (every company, account,
 *                    payroll, attendance, sessions, migrations…)
 *  - uploads/        every uploaded file (logos, HR documents…)
 * Restoring wipes the database schemas and the upload folder and puts the
 * archive's content back, so the system is exactly as it was when the backup
 * was made. A safety backup of the current state is taken first.
 *
 * Needs pg_dump/psql (PostgreSQL client matching the server) and zip/unzip in
 * the app image.
 */

const APP = "mshahara";
const FORMAT = 1;
const SCHEMAS = ["public", "auth", "storage"];
const AUTO_KEEP = 7;
export const MAX_RESTORE_BYTES = 4 * 1024 * 1024 * 1024;

export type BackupKind = "manual" | "auto" | "before-restore";

export type BackupManifest = {
  app: string;
  format: number;
  kind: BackupKind;
  created_at: string;
  counts: Record<string, number>;
};

export type BackupFile = { name: string; size: number; created_at: string; kind: BackupKind };

const NAME = /^mshahara-(manual|auto|before-restore)-\d{8}-\d{6}\.zip$/;

let busy: string | null = null;

export function backupsDir(): string {
  return process.env.BACKUPS_DIR || path.join(path.dirname(uploadsDir()), "backups");
}

/** Absolute path of a stored backup, or null for a name that is not one of ours. */
export function backupPath(name: string): string | null {
  return NAME.test(name) ? path.join(backupsDir(), name) : null;
}

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  return url;
}

function run(cmd: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-4000);
    });
    child.on("error", (err) =>
      reject(new Error(`${cmd} introuvable sur le serveur (${err.message}). Reconstruisez l’image de l’application.`)),
    );
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} a échoué (code ${code}) : ${stderr.trim() || "sans message"}`)),
    );
  });
}

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function withLock<T>(label: string, fn: () => Promise<T>): Promise<T> {
  if (busy) throw new Error(`Une opération est déjà en cours : ${busy}. Réessayez dans quelques minutes.`);
  busy = label;
  try {
    return await fn();
  } finally {
    busy = null;
  }
}

async function counts(): Promise<Record<string, number>> {
  const res = await getPool().query(`
    select (select count(*) from public.companies)::int as entreprises,
           (select count(*) from auth.users)::int as comptes,
           (select count(*) from public.employees)::int as employes,
           (select count(*) from public.payslips)::int as bulletins,
           (select count(*) from public.attendance_records)::int as pointages,
           (select count(*) from public.leave_requests)::int as conges`);
  return res.rows[0] ?? {};
}

async function makeBackup(kind: BackupKind): Promise<BackupFile> {
  const work = await mkdtemp(path.join(os.tmpdir(), "mshahara-backup-"));
  try {
    await run("pg_dump", ["--format=custom", "--no-owner", `--file=${path.join(work, "database.dump")}`, databaseUrl()]);
    const uploads = path.join(work, "uploads");
    await mkdir(uploads);
    if (await exists(uploadsDir())) await cp(uploadsDir(), uploads, { recursive: true });
    const manifest: BackupManifest = {
      app: APP,
      format: FORMAT,
      kind,
      created_at: new Date().toISOString(),
      counts: await counts(),
    };
    await writeFile(path.join(work, "manifest.json"), JSON.stringify(manifest, null, 2));

    await mkdir(backupsDir(), { recursive: true });
    const name = `mshahara-${kind}-${stamp()}.zip`;
    const target = path.join(backupsDir(), name);
    await run("zip", ["-r", "-q", "-X", target, "manifest.json", "database.dump", "uploads"], work);
    const info = await stat(target);
    if (kind === "auto") await pruneAuto();
    return { name, size: info.size, created_at: manifest.created_at, kind };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function pruneAuto(): Promise<void> {
  const autos = (await listBackups()).filter((b) => b.kind === "auto");
  for (const old of autos.slice(AUTO_KEEP)) {
    await rm(path.join(backupsDir(), old.name), { force: true });
  }
}

export function createBackup(kind: BackupKind = "manual"): Promise<BackupFile> {
  return withLock("sauvegarde", () => makeBackup(kind));
}

/** Stored backups, newest first. */
export async function listBackups(): Promise<BackupFile[]> {
  if (!(await exists(backupsDir()))) return [];
  const files: BackupFile[] = [];
  for (const name of await readdir(backupsDir())) {
    const m = NAME.exec(name);
    if (!m) continue;
    const info = await stat(path.join(backupsDir(), name));
    files.push({ name, size: info.size, created_at: info.mtime.toISOString(), kind: m[1] as BackupKind });
  }
  return files.sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** Saves an uploaded archive (request body) to a temporary file, refusing oversize bodies. */
export async function saveUpload(body: ReadableStream<Uint8Array>): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "mshahara-upload-"));
  const file = path.join(dir, "upload.zip");
  let total = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _enc, done) {
      total += chunk.length;
      done(total > MAX_RESTORE_BYTES ? new Error("Archive trop volumineuse") : null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(body as never), limit, createWriteStream(file));
  return file;
}

/**
 * Restores a backup archive: database and uploaded files become exactly what
 * they were in the archive. Returns the name of the safety backup taken first.
 */
export function restoreBackup(zipFile: string): Promise<{ safety: string; manifest: BackupManifest }> {
  return withLock("restauration", async () => {
    const work = await mkdtemp(path.join(os.tmpdir(), "mshahara-restore-"));
    try {
      await run("unzip", ["-q", zipFile, "-d", work]);
      let manifest: BackupManifest;
      try {
        manifest = JSON.parse(await readFile(path.join(work, "manifest.json"), "utf8"));
      } catch {
        throw new Error("Ce fichier n’est pas une sauvegarde Mshahara (manifest.json absent).");
      }
      if (manifest.app !== APP || manifest.format !== FORMAT) {
        throw new Error("Ce fichier n’est pas une sauvegarde Mshahara compatible.");
      }
      const dump = path.join(work, "database.dump");
      if (!(await exists(dump))) throw new Error("Sauvegarde incomplète : base de données absente.");

      // Plain SQL from the dump, run in ONE transaction after wiping the schemas:
      // on any error nothing is changed.
      const sql = path.join(work, "database.sql");
      await run("pg_restore", ["--no-owner", `--file=${sql}`, dump]);
      const script = path.join(work, "restore.sql");
      await writeFile(
        script,
        [
          ...SCHEMAS.map((s) => `drop schema if exists ${s} cascade;`),
          "create schema public;",
          `\\i ${sql.replace(/\\/g, "/")}`,
          "",
        ].join("\n"),
      );

      const safety = await makeBackup("before-restore");

      await run("psql", ["--no-psqlrc", "--quiet", "--single-transaction", "-v", "ON_ERROR_STOP=1", `--file=${script}`, databaseUrl()]);

      // Uploaded files: replace the folder content with the archive's.
      const target = uploadsDir();
      await mkdir(target, { recursive: true });
      for (const entry of await readdir(target)) await rm(path.join(target, entry), { recursive: true, force: true });
      const uploads = path.join(work, "uploads");
      if (await exists(uploads)) await cp(uploads, target, { recursive: true });

      // An archive made by an older version: bring the schema up to this code.
      await run("node", ["db/migrate.mjs"], process.cwd());

      return { safety: safety.name, manifest };
    } finally {
      await rm(work, { recursive: true, force: true });
      await rm(path.dirname(zipFile), { recursive: true, force: true }).catch(() => undefined);
    }
  });
}
