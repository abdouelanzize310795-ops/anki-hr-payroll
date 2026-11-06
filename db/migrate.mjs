/**
 * Applies db/00_compat.sql then supabase/migrations/*.sql in order.
 * Applied files are tracked in public._migrations.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL manquant");

const client = new pg.Client({ connectionString: url });
for (let attempt = 1; ; attempt++) {
  try {
    await client.connect();
    break;
  } catch (err) {
    if (attempt >= 30) throw err;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

await client.query(
  "create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())",
);
const { rows } = await client.query("select name from public._migrations");
const applied = new Set(rows.map((r) => r.name));

const migrationsDir = path.join(root, "supabase", "migrations");
const files = [
  path.join(root, "db", "00_compat.sql"),
  ...(await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort().map((f) => path.join(migrationsDir, f)),
];

for (const file of files) {
  const name = path.basename(file);
  if (applied.has(name)) continue;
  const sql = (await readFile(file, "utf8")).replace(/﻿/g, "");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into public._migrations (name) values ($1)", [name]);
    await client.query("commit");
    console.log(`[migrate] ${name}`);
  } catch (err) {
    await client.query("rollback");
    console.error(`[migrate] ÉCHEC ${name}: ${err.message}`);
    process.exit(1);
  }
}

console.log("[migrate] base à jour");
await client.end();
