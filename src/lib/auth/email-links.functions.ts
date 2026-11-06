import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  confirmUserEmail,
  consumeEmailToken,
  createEmailToken,
  findUserByEmail,
  recentEmailTokens,
  resetUserPassword,
} from "@/lib/db/auth";
import { appUrl, mailEnabled, sendActionMail } from "@/lib/db/mail";

/**
 * "Mot de passe oublié" and e-mail confirmation, through one-time links sent
 * by e-mail. Answers never reveal whether an address has an account.
 */

const RESET_TTL_MINUTES = 60;
const VERIFY_TTL_MINUTES = 48 * 60;
const MAX_LINKS_PER_HOUR = 3;

const emailSchema = z.object({ email: z.string().trim().email("E-mail invalide") });
const SAME_ANSWER = "Si un compte existe pour cette adresse, un e-mail vient d’être envoyé. Pensez à vérifier les spams.";

export const requestPasswordReset = createServerFn({ method: "POST" })
  .validator(emailSchema)
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    if (!mailEnabled()) {
      return { ok: false, message: "L’envoi d’e-mails n’est pas encore configuré. Contactez votre administrateur." };
    }
    const user = await findUserByEmail(data.email);
    if (user && (await recentEmailTokens(user.id, "reset")) < MAX_LINKS_PER_HOUR) {
      const token = await createEmailToken(user.id, "reset", RESET_TTL_MINUTES);
      await sendActionMail({
        to: user.email,
        subject: "Réinitialisation de votre mot de passe Mshahara",
        intro: "Vous avez demandé à changer le mot de passe de votre compte Mshahara.",
        action: "Choisir un nouveau mot de passe",
        url: `${appUrl()}/reset-password?token=${token}`,
        outro: `Ce lien est valable ${RESET_TTL_MINUTES} minutes et ne sert qu’une fois. Si vous n’êtes pas à l’origine de cette demande, ignorez cet e-mail : votre mot de passe reste inchangé.`,
      }).catch((err) => console.error("[mail] reset", err instanceof Error ? err.message : err));
    }
    return { ok: true, message: SAME_ANSWER };
  });

export const resetPasswordWithToken = createServerFn({ method: "POST" })
  .validator(
    z.object({
      token: z.string().min(20),
      password: z.string().min(8, "Au moins 8 caractères").max(200),
    }),
  )
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const user = await consumeEmailToken(data.token, "reset");
    if (!user) return { ok: false, message: "Lien invalide ou expiré. Faites une nouvelle demande." };
    await resetUserPassword(user.id, user.email, data.password);
    // Clicking the link also proves the address.
    await confirmUserEmail(user.id);
    return { ok: true, message: "Mot de passe modifié. Vous pouvez vous connecter." };
  });

export const confirmEmailWithToken = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().min(20) }))
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    const user = await consumeEmailToken(data.token, "verify");
    if (!user) return { ok: false, message: "Lien invalide ou expiré. Demandez un nouveau lien depuis la page de connexion." };
    await confirmUserEmail(user.id);
    return { ok: true, message: "Adresse confirmée. Vous pouvez vous connecter." };
  });

/** Sends (or re-sends) the confirmation link of a not-yet-confirmed account. */
export const sendEmailConfirmation = createServerFn({ method: "POST" })
  .validator(emailSchema)
  .handler(async ({ data }): Promise<{ ok: boolean; message: string }> => {
    if (!mailEnabled()) return { ok: false, message: "L’envoi d’e-mails n’est pas configuré." };
    const user = await findUserByEmail(data.email);
    if (user && !user.confirmed && (await recentEmailTokens(user.id, "verify")) < MAX_LINKS_PER_HOUR) {
      const token = await createEmailToken(user.id, "verify", VERIFY_TTL_MINUTES);
      await sendActionMail({
        to: user.email,
        subject: "Confirmez votre adresse e-mail Mshahara",
        intro: "Bienvenue sur Mshahara ! Confirmez votre adresse e-mail pour activer votre compte.",
        action: "Confirmer mon adresse",
        url: `${appUrl()}/verify-email?token=${token}`,
        outro: "Ce lien est valable 48 heures. Si vous n’avez pas créé de compte Mshahara, ignorez cet e-mail.",
      }).catch((err) => console.error("[mail] verify", err instanceof Error ? err.message : err));
    }
    return { ok: true, message: SAME_ANSWER };
  });
