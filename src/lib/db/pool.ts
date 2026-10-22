import pg from "pg";

/**
 * Shared PostgreSQL pool (server only).
 * Values are returned in the same shapes Supabase/PostgREST used to return:
 * numerics as numbers, dates as "YYYY-MM-DD", timestamps as ISO strings.
 */
const { types } = pg;

/** "2026-10-21 12:00:00.123+03" → ISO string (self-contained: safe across hot reloads). */
function timestamptzToIso(value: string): string {
  const iso = value
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00")
    .replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

types.setTypeParser(types.builtins.NUMERIC, (v) => Number(v));
types.setTypeParser(types.builtins.INT8, (v) => Number(v));
types.setTypeParser(types.builtins.DATE, (v) => v);
types.setTypeParser(types.builtins.TIMESTAMPTZ, timestamptzToIso);
types.setTypeParser(types.builtins.TIMESTAMP, (v) => new Date(`${v.replace(" ", "T")}Z`).toISOString());

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL manquant");
    pool = new pg.Pool({ connectionString, max: 10 });
  }
  return pool;
}

export type DbError = { message: string; code?: string; details?: string; hint?: string };

export function toDbError(err: unknown): DbError {
  const e = err as { message?: string; code?: string; detail?: string; hint?: string };
  return { message: e?.message ?? String(err), code: e?.code, details: e?.detail, hint: e?.hint };
}

/**
 * Runs `fn` in a transaction that impersonates `userId` the way Supabase did:
 * role `authenticated` (or `anon`) + `request.jwt.claim.sub`, so RLS policies and
 * auth.uid() behave exactly as before.
 */
export async function withUser<T>(
  userId: string | null,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${userId ? "authenticated" : "anon"}`);
    await client.query(
      "select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)",
      [userId ?? "", userId ? "authenticated" : "anon"],
    );
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}
