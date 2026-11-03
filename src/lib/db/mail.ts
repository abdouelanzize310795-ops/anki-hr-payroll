import nodemailer, { type Transporter } from "nodemailer";

/**
 * Outgoing e-mail through the hosting provider's SMTP server, configured in
 * the server's .env:
 *   SMTP_HOST, SMTP_PORT (465 = SSL, 587 = STARTTLS), SMTP_USER, SMTP_PASS,
 *   SMTP_FROM (e.g. "Mshahara <no-reply@mshahara.online>"),
 *   APP_URL (public address used in links, e.g. https://mshahara.online).
 * Without SMTP_HOST, e-mail features are off (sign-ups are confirmed at once).
 * SMTP_HOST=log (development): messages are written to the server log instead.
 */

let transporter: Transporter | null = null;

export function mailEnabled(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:8090").replace(/\/+$/, "");
}

function transport(): Transporter {
  if (!transporter && process.env.SMTP_HOST === "log") {
    transporter = nodemailer.createTransport({ jsonTransport: true });
  }
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Branded e-mail with one call-to-action link. */
export async function sendActionMail(opts: {
  to: string;
  subject: string;
  intro: string;
  action: string;
  url: string;
  outro: string;
}): Promise<void> {
  if (!mailEnabled()) throw new Error("L’envoi d’e-mails n’est pas configuré sur ce serveur.");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:Arial,sans-serif;color:#1f2933">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <p style="font-size:22px;font-weight:bold;color:#0e4c56;margin:0 0 24px">Mshahara</p>
    <div style="background:#fff;border-radius:12px;padding:28px">
      <p style="margin:0 0 20px;line-height:1.5">${escape(opts.intro)}</p>
      <p style="margin:0 0 24px"><a href="${escape(opts.url)}" style="display:inline-block;background:#e8a93b;color:#1f2933;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">${escape(opts.action)}</a></p>
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5">${escape(opts.outro)}</p>
    </div>
    <p style="font-size:12px;color:#9ca3af;margin-top:16px;word-break:break-all">Si le bouton ne fonctionne pas : ${escape(opts.url)}</p>
  </div></body></html>`;
  const text = `${opts.intro}\n\n${opts.action} : ${opts.url}\n\n${opts.outro}`;
  const info = await transport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: opts.to,
    subject: opts.subject,
    text,
    html,
  });
  if (process.env.SMTP_HOST === "log") console.log(`[mail] à ${opts.to} — ${opts.subject} — ${opts.url}`, info.messageId);
}

/** Sign-in details for an account created by HR (temporary password, to be changed). */
export async function sendWelcomeMail(opts: {
  to: string;
  fullName: string | null;
  company: string | null;
  role: string;
  temporaryPassword: string;
  loginUrl: string;
  mobile: boolean;
}): Promise<void> {
  if (!mailEnabled()) throw new Error("L’envoi d’e-mails n’est pas configuré sur ce serveur.");
  const hello = opts.fullName ? `Bonjour ${opts.fullName},` : "Bonjour,";
  const where = opts.company ? ` chez ${opts.company}` : "";
  const mobileLine = opts.mobile
    ? "Vous pouvez aussi vous connecter avec les mêmes identifiants dans l’application mobile Mshahara (Android), pour pointer et suivre vos congés et bulletins."
    : "";
  const rows: Array<[string, string]> = [
    ["Adresse de connexion", opts.loginUrl],
    ["Identifiant (e-mail)", opts.to],
    ["Mot de passe provisoire", opts.temporaryPassword],
  ];
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:Arial,sans-serif;color:#1f2933">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <p style="font-size:22px;font-weight:bold;color:#0e4c56;margin:0 0 24px">Mshahara</p>
    <div style="background:#fff;border-radius:12px;padding:28px">
      <p style="margin:0 0 12px">${escape(hello)}</p>
      <p style="margin:0 0 20px;line-height:1.5">Votre compte ${escape(opts.role)} Mshahara${escape(where)} a été créé. Voici vos informations de connexion :</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 20px;font-size:14px">
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding:8px 0;color:#6b7280">${escape(k)}</td><td style="padding:8px 0;font-weight:bold;font-family:monospace;word-break:break-all">${escape(v)}</td></tr>`,
          )
          .join("")}
      </table>
      <p style="margin:0 0 24px"><a href="${escape(opts.loginUrl)}" style="display:inline-block;background:#e8a93b;color:#1f2933;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:8px">Se connecter</a></p>
      <p style="margin:0 0 12px;font-size:13px;line-height:1.5"><strong>À la première connexion, vous devrez choisir votre propre mot de passe.</strong> Ne communiquez jamais votre mot de passe, même à votre employeur.</p>
      ${mobileLine ? `<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5">${escape(mobileLine)}</p>` : ""}
    </div>
  </div></body></html>`;
  const text = [
    hello,
    "",
    `Votre compte ${opts.role} Mshahara${where} a été créé.`,
    ...rows.map(([k, v]) => `${k} : ${v}`),
    "",
    "À la première connexion, vous devrez choisir votre propre mot de passe.",
    mobileLine,
  ].join("\n");
  const info = await transport().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: opts.to,
    subject: "Votre compte Mshahara est prêt",
    text,
    html,
  });
  // Development log: never the password.
  if (process.env.SMTP_HOST === "log") console.log(`[mail] à ${opts.to} — Votre compte Mshahara est prêt`, info.messageId);
}
