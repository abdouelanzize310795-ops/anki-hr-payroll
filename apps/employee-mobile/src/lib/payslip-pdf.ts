import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { getAccessToken, getApiUrl } from "@/lib/supabase";

/**
 * Downloads the payslip PDF (rendered by the server with the employer's template)
 * and opens the phone's share sheet (WhatsApp, e-mail, Drive…).
 */
export async function sharePayslipPdf(payslipId: string, fileLabel: string): Promise<void> {
  const [base, token] = await Promise.all([getApiUrl(), getAccessToken()]);
  if (!token) throw new Error("Session expirée, reconnectez-vous.");

  const safe = fileLabel
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_");
  const target = `${FileSystem.cacheDirectory}Bulletin_${safe}.pdf`;

  const res = await FileSystem.downloadAsync(`${base}/api/payslips/${payslipId}/pdf`, target, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status !== 200) {
    await FileSystem.deleteAsync(target, { idempotent: true });
    throw new Error(
      res.status === 401
        ? "Session expirée, reconnectez-vous."
        : res.status === 404
          ? "Bulletin introuvable ou pas encore validé."
          : "Le PDF n’a pas pu être généré. Réessayez dans un instant.",
    );
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Le partage n’est pas disponible sur ce téléphone.");
  }
  await Sharing.shareAsync(res.uri, {
    mimeType: "application/pdf",
    UTI: "com.adobe.pdf",
    dialogTitle: `Bulletin de paie — ${fileLabel}`,
  });
}
