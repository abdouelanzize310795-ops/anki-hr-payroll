import { supabase } from "../supabase";
import type {
  ClockAction,
  MobileAttendanceDay,
  MobileClockResult,
  MobileHome,
  MobileCompensation,
  MobileCorrection,
  MobileDocument,
  MobileSchedule,
  MobileSecureClockResult,
  MobileLeave,
  MobileLeaveType,
  MobileMe,
  MobilePayslipDetail,
  MobileNotification,
  MobilePayslip,
  MobileTeamMemberAttendance,
  MobileTeamPendingLeave,
} from "./types";

function assertData<T>(data: T | null, error: { message: string } | null): T {
  if (error) throw new Error(error.message);
  if (data == null) throw new Error("Réponse vide");
  return data;
}

/** Profil + fiche employé + entreprise. */
export async function getMe(): Promise<MobileMe> {
  const { data, error } = await supabase.rpc("mobile_get_me");
  return assertData(data as MobileMe | null, error);
}

/** Accueil pointage (état du jour + actions). */
export async function getHome(): Promise<MobileHome> {
  const { data, error } = await supabase.rpc("mobile_get_home");
  return assertData(data as MobileHome | null, error);
}

/** Entrée / sortie — GPS optionnel. */
export async function clock(
  action: ClockAction,
  opts?: {
    at?: string;
    lat?: number;
    lng?: number;
    accuracyM?: number;
    deviceLabel?: string;
  },
): Promise<MobileClockResult> {
  const { data, error } = await supabase.rpc("mobile_clock", {
    p_action: action,
    p_at: opts?.at ?? new Date().toISOString(),
    p_lat: opts?.lat ?? null,
    p_lng: opts?.lng ?? null,
    p_accuracy_m: opts?.accuracyM ?? null,
    p_device_label: opts?.deviceLabel ?? null,
  });
  return assertData(data as MobileClockResult | null, error);
}

/** Historique de présence (défaut: mois en cours). */
export async function listAttendance(
  from?: string,
  to?: string,
): Promise<MobileAttendanceDay[]> {
  const { data, error } = await supabase.rpc("mobile_list_attendance", {
    p_from: from ?? null,
    p_to: to ?? null,
  });
  return assertData((data as MobileAttendanceDay[] | null) ?? [], error);
}

export async function listLeaves(limit = 20): Promise<MobileLeave[]> {
  const { data, error } = await supabase.rpc("mobile_list_leaves", {
    p_limit: limit,
  });
  return assertData((data as MobileLeave[] | null) ?? [], error);
}

export async function listPayslips(limit = 12): Promise<MobilePayslip[]> {
  const { data, error } = await supabase.rpc("mobile_list_payslips", {
    p_limit: limit,
  });
  return assertData((data as MobilePayslip[] | null) ?? [], error);
}

export async function listNotifications(
  limit = 30,
): Promise<MobileNotification[]> {
  const { data, error } = await supabase.rpc("mobile_list_notifications", {
    p_limit: limit,
  });
  return assertData((data as MobileNotification[] | null) ?? [], error);
}

export async function markNotificationRead(id: string) {
  const { data, error } = await supabase.rpc("mobile_mark_notification_read", {
    p_id: id,
  });
  return assertData(data, error);
}

export async function listTeamAttendance(
  workDate?: string,
): Promise<MobileTeamMemberAttendance[]> {
  const { data, error } = await supabase.rpc("mobile_list_team_attendance", {
    p_work_date: workDate ?? null,
  });
  return assertData((data as MobileTeamMemberAttendance[] | null) ?? [], error);
}

export async function listTeamPendingLeaves(
  limit = 30,
): Promise<MobileTeamPendingLeave[]> {
  const { data, error } = await supabase.rpc("mobile_list_team_pending_leaves", {
    p_limit: limit,
  });
  return assertData((data as MobileTeamPendingLeave[] | null) ?? [], error);
}

export async function reviewLeave(
  requestId: string,
  action: "approve" | "reject",
  note?: string,
) {
  const { data, error } = await supabase.rpc("mobile_review_leave", {
    p_request_id: requestId,
    p_action: action,
    p_note: note ?? null,
  });
  return assertData(data, error);
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

/** Types de congé avec le solde de l'année. */
export async function listLeaveTypes(): Promise<MobileLeaveType[]> {
  const { data, error } = await supabase.rpc("mobile_list_leave_types");
  return assertData((data as MobileLeaveType[] | null) ?? [], error);
}

/** Crée et envoie une demande de congé. */
export async function requestLeave(input: {
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason?: string;
}): Promise<MobileLeave> {
  const { data, error } = await supabase.rpc("mobile_request_leave", {
    p_leave_type_id: input.leaveTypeId,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_reason: input.reason ?? null,
  });
  return assertData(data as MobileLeave | null, error);
}

export async function cancelLeave(id: string) {
  const { data, error } = await supabase.rpc("mobile_cancel_leave", { p_id: id });
  return assertData(data, error);
}

/** Bulletin complet (lignes de paie incluses). */
export async function getPayslip(id: string): Promise<MobilePayslipDetail> {
  const { data, error } = await supabase.rpc("mobile_get_payslip", { p_id: id });
  return assertData(data as MobilePayslipDetail | null, error);
}

/** Salaire, coordonnées bancaires, contrat en cours, cumul annuel. */
export async function getCompensation(): Promise<MobileCompensation> {
  const { data, error } = await supabase.rpc("mobile_get_compensation");
  return assertData(data as MobileCompensation | null, error);
}

/** Documents RH personnels (liens de téléchargement valables 15 min). */
export async function listDocuments(): Promise<MobileDocument[]> {
  const { data, error } = await supabase.rpc("mobile_list_documents");
  return assertData((data as MobileDocument[] | null) ?? [], error);
}

/** Pointage sécurisé : appareil, position GPS, QR (facultatif) — contrôlés par le serveur. */
export async function secureClock(input: {
  deviceId: string;
  platform: string;
  model: string | null;
  lat: number;
  lng: number;
  accuracyM: number | null;
  isMock: boolean;
  qrToken: string | null;
}): Promise<MobileSecureClockResult> {
  const { data, error } = await supabase.rpc("mobile_secure_clock", {
    p_device_id: input.deviceId,
    p_platform: input.platform,
    p_model: input.model,
    p_lat: input.lat,
    p_lng: input.lng,
    p_accuracy_m: input.accuracyM,
    p_is_mock: input.isMock,
    p_qr_token: input.qrToken,
  });
  return assertData(data as MobileSecureClockResult | null, error);
}

/** Horaire du jour (heures, jour travaillé, QR obligatoire…). */
export async function getSchedule(): Promise<MobileSchedule> {
  const { data, error } = await supabase.rpc("mobile_get_schedule");
  return assertData(data as MobileSchedule | null, error);
}

export async function requestCorrection(input: {
  workDate: string;
  checkIn: string | null;
  checkOut: string | null;
  reason: string;
}) {
  const { data, error } = await supabase.rpc("mobile_request_correction", {
    p_work_date: input.workDate,
    p_check_in: input.checkIn,
    p_check_out: input.checkOut,
    p_reason: input.reason,
  });
  return assertData(data, error);
}

export async function listCorrections(limit = 20): Promise<MobileCorrection[]> {
  const { data, error } = await supabase.rpc("mobile_list_corrections", { p_limit: limit });
  return assertData((data as MobileCorrection[] | null) ?? [], error);
}
