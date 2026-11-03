import { getPool } from "./pool";
import { appUrl, mailEnabled, sendWelcomeMail } from "./mail";

const ROLE_LABEL: Record<string, string> = {
  employee: "employé",
  manager: "manager",
  hr: "RH",
  employer: "employeur",
};

/**
 * After HR creates an account with a temporary password: the password must be
 * changed at the first sign-in, and the person receives their sign-in details
 * by e-mail. Returns whether the e-mail went out (otherwise HR passes them on).
 */
export async function afterAccountProvisioned(account: {
  userId: string;
  email: string;
  temporaryPassword: string;
}): Promise<{ mailed: boolean }> {
  const pool = getPool();
  await pool.query("update public.profiles set must_change_password = true, updated_at = now() where id = $1", [
    account.userId,
  ]);
  if (!mailEnabled()) return { mailed: false };

  const info = await pool.query(
    `select p.full_name, p.role::text as role, coalesce(c.trade_name, c.legal_name) as company
       from public.profiles p left join public.companies c on c.id = p.company_id
      where p.id = $1`,
    [account.userId],
  );
  const row = info.rows[0] ?? {};
  try {
    await sendWelcomeMail({
      to: account.email,
      fullName: row.full_name ?? null,
      company: row.company ?? null,
      role: ROLE_LABEL[row.role] ?? "collaborateur",
      temporaryPassword: account.temporaryPassword,
      loginUrl: `${appUrl()}/login`,
      mobile: row.role === "employee" || row.role === "manager",
    });
    return { mailed: true };
  } catch (err) {
    console.error("[mail] bienvenue", err instanceof Error ? err.message : err);
    return { mailed: false };
  }
}
