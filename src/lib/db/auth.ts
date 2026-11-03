import { createHash, randomBytes } from "node:crypto";
import { getPool, toDbError, type DbError } from "./pool";

/**
 * Email/password authentication stored in auth.users (bcrypt via pgcrypto),
 * with opaque session tokens in auth.sessions. Replaces Supabase Auth.
 */

export const SESSION_COOKIE = "mshahara_session";
export const SESSION_TTL_DAYS = 30;

export type AuthUserRecord = {
  id: string;
  email: string;
  app_metadata: Record<string, unknown>;
  user_metadata: Record<string, unknown>;
  created_at: string;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function mapUser(row: any): AuthUserRecord {
  return {
    id: row.id,
    email: row.email,
    app_metadata: row.raw_app_meta_data ?? {},
    user_metadata: row.raw_user_meta_data ?? {},
    created_at: row.created_at,
  };
}

const USER_COLUMNS = "id, email, raw_app_meta_data, raw_user_meta_data, created_at";

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 3600 * 1000);
  await getPool().query(
    "insert into auth.sessions (token_hash, user_id, expires_at) values ($1, $2, $3)",
    [hashToken(token), userId, expiresAt],
  );
  await getPool().query("update auth.users set last_sign_in_at = now() where id = $1", [userId]);
  return { token, expiresAt };
}

export async function getUserBySessionToken(token: string | undefined | null): Promise<AuthUserRecord | null> {
  if (!token) return null;
  const res = await getPool().query(
    `select ${USER_COLUMNS.split(", ").map((c) => `u.${c}`).join(", ")}
       from auth.sessions s join auth.users u on u.id = s.user_id
      where s.token_hash = $1 and s.expires_at > now() and u.deleted_at is null`,
    [hashToken(token)],
  );
  return res.rows[0] ? mapUser(res.rows[0]) : null;
}

export async function deleteSession(token: string | undefined | null): Promise<void> {
  if (!token) return;
  await getPool().query("delete from auth.sessions where token_hash = $1", [hashToken(token)]);
}

// Brute-force guard, counters in public.login_throttle (kept across restarts):
//  - per e-mail AND client IP: 5 wrong passwords lock that pair for 15 min, so a
//    stranger typing wrong passwords does not lock the owner out;
//  - per e-mail from any IP: 30 wrong passwords lock the account for 15 min
//    (spread-out attacks). A password reset by e-mail lifts both.
const LOCK_MS = 15 * 60 * 1000;
const MAX_PER_IP = 5;
const MAX_PER_ACCOUNT = 30;

function lockKeys(email: string, ip?: string | null): Array<{ key: string; max: number }> {
  const e = email.trim().toLowerCase();
  return [
    { key: `${e}|${ip || "?"}`, max: MAX_PER_IP },
    { key: e, max: MAX_PER_ACCOUNT },
  ];
}

async function loginLockMessage(keys: string[]): Promise<string | null> {
  const res = await getPool().query(
    "select max(locked_until) as until from public.login_throttle where key = any($1) and locked_until > now()",
    [keys],
  );
  // The pool returns timestamps as ISO strings.
  const until = res.rows[0]?.until as string | null | undefined;
  if (!until) return null;
  const minutes = Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 60_000));
  return `Trop de tentatives de connexion. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}, ou réinitialisez votre mot de passe.`;
}

/** Lifts every lock of an e-mail (after a password reset). */
export async function clearLoginLocks(email: string): Promise<void> {
  const e = email.trim().toLowerCase();
  await getPool().query("delete from public.login_throttle where key = $1 or key like $2", [e, `${e}|%`]);
}

async function recordLoginFailure(key: string, max: number): Promise<void> {
  // A failure older than LOCK_MS starts a new series.
  await getPool().query(
    `insert into public.login_throttle as t (key, failures, first_failure_at)
     values ($1, 1, now())
     on conflict (key) do update set
       failures = case when t.first_failure_at < now() - $2::interval then 1 else t.failures + 1 end,
       first_failure_at = case when t.first_failure_at < now() - $2::interval then now() else t.first_failure_at end,
       locked_until = case
         when t.first_failure_at >= now() - $2::interval and t.failures + 1 >= $3 then now() + $2::interval
         else t.locked_until end`,
    [key, `${LOCK_MS / 1000} seconds`, max],
  );
}

export async function verifyPassword(
  email: string,
  password: string,
  ip?: string | null,
): Promise<{ user: AuthUserRecord | null; error: DbError | null }> {
  const keys = lockKeys(email, ip);
  const locked = await loginLockMessage(keys.map((k) => k.key));
  if (locked) return { user: null, error: { message: locked, code: "locked" } };
  const result = await checkPassword(email, password);
  if (result.user) {
    await getPool().query("delete from public.login_throttle where key = $1", [keys[0].key]);
  } else if (!result.error?.code) {
    for (const k of keys) await recordLoginFailure(k.key, k.max);
  }
  return result;
}

async function checkPassword(
  email: string,
  password: string,
): Promise<{ user: AuthUserRecord | null; error: DbError | null }> {
  try {
    const res = await getPool().query(
      `select ${USER_COLUMNS}, email_confirmed_at from auth.users
        where lower(email) = lower($1) and deleted_at is null
          and encrypted_password is not null
          and encrypted_password = crypt($2, encrypted_password)`,
      [email.trim(), password],
    );
    if (!res.rows[0]) return { user: null, error: { message: "Invalid login credentials" } };
    // Right password but e-mail not confirmed yet: refused, not counted as a failure.
    if (!res.rows[0].email_confirmed_at) {
      return {
        user: null,
        error: {
          message: "Adresse e-mail non confirmée. Cliquez sur le lien reçu par e-mail, ou demandez-en un nouveau.",
          code: "email_not_confirmed",
        },
      };
    }
    return { user: mapUser(res.rows[0]), error: null };
  } catch (err) {
    return { user: null, error: toDbError(err) };
  }
}

export async function createUser(
  email: string,
  password: string,
  userMetadata: Record<string, unknown> = {},
  appMetadata: Record<string, unknown> = {},
  confirmed = true,
): Promise<{ user: AuthUserRecord | null; error: DbError | null }> {
  const client = await getPool().connect();
  try {
    const existing = await client.query("select 1 from auth.users where lower(email) = lower($1)", [email]);
    if (existing.rowCount) return { user: null, error: { message: "User already registered" } };
    await client.query("begin");
    const res = await client.query(
      `insert into auth.users (instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                               raw_app_meta_data, raw_user_meta_data)
       values ('00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', lower($1),
               crypt($2, gen_salt('bf')), case when $5::boolean then now() end,
               $3::jsonb, $4::jsonb)
       returning ${USER_COLUMNS}`,
      [
        email.trim(),
        password,
        JSON.stringify({ provider: "email", providers: ["email"], ...appMetadata }),
        JSON.stringify(userMetadata),
        confirmed,
      ],
    );
    const user = mapUser(res.rows[0]);
    await client.query(
      `insert into auth.identities (user_id, identity_data, provider, provider_id)
       values ($1, $2::jsonb, 'email', $3)`,
      [user.id, JSON.stringify({ sub: user.id, email: user.email }), user.id],
    );
    await client.query("commit");
    return { user, error: null };
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    return { user: null, error: toDbError(err) };
  } finally {
    client.release();
  }
}

export async function updateUserRecord(
  userId: string,
  changes: { password?: string; data?: Record<string, unknown>; email?: string },
): Promise<{ user: AuthUserRecord | null; error: DbError | null }> {
  try {
    if (changes.password) {
      await getPool().query(
        "update auth.users set encrypted_password = crypt($2, gen_salt('bf')), updated_at = now() where id = $1",
        [userId, changes.password],
      );
    }
    if (changes.data) {
      await getPool().query(
        "update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb, updated_at = now() where id = $1",
        [userId, JSON.stringify(changes.data)],
      );
    }
    if (changes.email) {
      await getPool().query("update auth.users set email = lower($2), updated_at = now() where id = $1", [
        userId,
        changes.email,
      ]);
    }
    const res = await getPool().query(`select ${USER_COLUMNS} from auth.users where id = $1`, [userId]);
    return { user: res.rows[0] ? mapUser(res.rows[0]) : null, error: null };
  } catch (err) {
    return { user: null, error: toDbError(err) };
  }
}

// ---------------------------------------------------------------------------
// One-time e-mail links (password reset, e-mail confirmation)

export type EmailTokenPurpose = "reset" | "verify";

/** Creates a one-time link token; only its hash is stored. */
export async function createEmailToken(userId: string, purpose: EmailTokenPurpose, ttlMinutes: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  await getPool().query(
    `insert into auth.email_tokens (token_hash, user_id, purpose, expires_at)
     values ($1, $2, $3, now() + make_interval(mins => $4))`,
    [hashToken(token), userId, purpose, ttlMinutes],
  );
  return token;
}

/** Links of this kind sent to the user in the last hour (anti-spam). */
export async function recentEmailTokens(userId: string, purpose: EmailTokenPurpose): Promise<number> {
  const res = await getPool().query(
    "select count(*)::int n from auth.email_tokens where user_id = $1 and purpose = $2 and created_at > now() - interval '1 hour'",
    [userId, purpose],
  );
  return res.rows[0]?.n ?? 0;
}

/** Uses up a valid token and returns its user, or null (unknown, used or expired). */
export async function consumeEmailToken(token: string, purpose: EmailTokenPurpose): Promise<AuthUserRecord | null> {
  const res = await getPool().query(
    `update auth.email_tokens t set used_at = now()
       from auth.users u
      where t.token_hash = $1 and t.purpose = $2 and t.used_at is null and t.expires_at > now()
        and u.id = t.user_id and u.deleted_at is null
     returning ${USER_COLUMNS.split(", ").map((c) => `u.${c}`).join(", ")}`,
    [hashToken(token), purpose],
  );
  return res.rows[0] ? mapUser(res.rows[0]) : null;
}

export async function findUserByEmail(email: string): Promise<(AuthUserRecord & { confirmed: boolean }) | null> {
  const res = await getPool().query(
    `select ${USER_COLUMNS}, email_confirmed_at from auth.users where lower(email) = lower($1) and deleted_at is null`,
    [email.trim()],
  );
  const row = res.rows[0];
  return row ? { ...mapUser(row), confirmed: Boolean(row.email_confirmed_at) } : null;
}

/** New password from a reset link: every session is closed and locks are lifted. */
export async function resetUserPassword(userId: string, email: string, password: string): Promise<void> {
  const pool = getPool();
  await pool.query("update auth.users set encrypted_password = crypt($2, gen_salt('bf')), updated_at = now() where id = $1", [userId, password]);
  await pool.query("update public.profiles set must_change_password = false where id = $1", [userId]);
  await pool.query("delete from auth.sessions where user_id = $1", [userId]);
  await pool.query("update auth.email_tokens set used_at = now() where user_id = $1 and purpose = 'reset' and used_at is null", [userId]);
  await clearLoginLocks(email);
}

export async function confirmUserEmail(userId: string): Promise<void> {
  await getPool().query("update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1", [userId]);
}

/**
 * The user's own new password: clears the "must change" flag and closes their
 * other sessions (the current one, keepToken, stays signed in).
 */
export async function changeOwnPassword(userId: string, password: string, keepToken: string | null): Promise<void> {
  const pool = getPool();
  await pool.query("update auth.users set encrypted_password = crypt($2, gen_salt('bf')), updated_at = now() where id = $1", [userId, password]);
  await pool.query("update public.profiles set must_change_password = false where id = $1", [userId]);
  await pool.query("delete from auth.sessions where user_id = $1 and token_hash is distinct from $2", [
    userId,
    keepToken ? hashToken(keepToken) : null,
  ]);
}
