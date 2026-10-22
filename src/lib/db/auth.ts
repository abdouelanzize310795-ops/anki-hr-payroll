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

export async function verifyPassword(
  email: string,
  password: string,
): Promise<{ user: AuthUserRecord | null; error: DbError | null }> {
  try {
    const res = await getPool().query(
      `select ${USER_COLUMNS} from auth.users
        where lower(email) = lower($1) and deleted_at is null
          and encrypted_password is not null
          and encrypted_password = crypt($2, encrypted_password)`,
      [email.trim(), password],
    );
    if (!res.rows[0]) return { user: null, error: { message: "Invalid login credentials" } };
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
               crypt($2, gen_salt('bf')), now(),
               $3::jsonb, $4::jsonb)
       returning ${USER_COLUMNS}`,
      [
        email.trim(),
        password,
        JSON.stringify({ provider: "email", providers: ["email"], ...appMetadata }),
        JSON.stringify(userMetadata),
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
