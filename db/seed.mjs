/**
 * Creates (or updates) the platform administrator account.
 * Reads ADMIN_EMAIL / ADMIN_PASSWORD (and optional ADMIN_NAME) from the environment.
 */
import pg from "pg";

const { DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME = "Administrateur Mshahara" } = process.env;
if (!DATABASE_URL) throw new Error("DATABASE_URL manquant");
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.log("[seed] ADMIN_EMAIL / ADMIN_PASSWORD absents — aucun administrateur créé");
  process.exit(0);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
const email = ADMIN_EMAIL.trim().toLowerCase();

await client.query("begin");
const existing = await client.query("select id from auth.users where lower(email) = $1", [email]);
let userId = existing.rows[0]?.id;

if (!userId) {
  const res = await client.query(
    `insert into auth.users (instance_id, aud, role, email, encrypted_password, email_confirmed_at,
                             raw_app_meta_data, raw_user_meta_data)
     values ('00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', $1,
             crypt($2, gen_salt('bf')), now(),
             '{"provider":"email","providers":["email"],"role":"platform_admin"}'::jsonb,
             jsonb_build_object('full_name', $3::text))
     returning id`,
    [email, ADMIN_PASSWORD, ADMIN_NAME],
  );
  userId = res.rows[0].id;
  await client.query(
    "insert into auth.identities (user_id, identity_data, provider, provider_id) values ($1, $2::jsonb, 'email', $3)",
    [userId, JSON.stringify({ sub: userId, email }), userId],
  );
  console.log(`[seed] administrateur créé: ${email}`);
} else {
  console.log(`[seed] administrateur déjà présent: ${email}`);
}

await client.query("select set_config('ankibapay.bypass_role_guard', '1', true)");
await client.query(
  "update public.profiles set role = 'platform_admin', full_name = coalesce(full_name, $2), must_change_password = false where id = $1",
  [userId, ADMIN_NAME],
);
await client.query("commit");
await client.end();
