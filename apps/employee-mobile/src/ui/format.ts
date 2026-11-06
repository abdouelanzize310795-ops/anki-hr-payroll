const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** 300000 → "300 000 KMF" */
export function formatMoney(amount: number | null | undefined, currency = "KMF"): string {
  const value = Math.round(Number(amount ?? 0));
  const grouped = Math.abs(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${value < 0 ? "-" : ""}${grouped} ${currency}`;
}

/** "2026-11-09" → "9 novembre 2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Date → "YYYY-MM-DD" (local day). */
export function toIsoDate(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

export function monthLabel(year: number, monthIndex: number): string {
  const name = MONTHS[monthIndex] ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

/** Mon–Fri days between two ISO dates, inclusive (holidays are counted server-side). */
export function countWeekdays(startIso: string, endIso: string): number {
  if (!startIso || !endIso || endIso < startIso) return 0;
  const cursor = new Date(`${startIso}T12:00:00`);
  const end = new Date(`${endIso}T12:00:00`);
  let days = 0;
  while (cursor <= end) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) days += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

export const leaveStatusLabel: Record<string, string> = {
  draft: "Brouillon",
  pending: "En attente",
  pending_manager: "En attente du manager",
  pending_hr: "En attente des RH",
  approved: "Approuvé",
  rejected: "Refusé",
  cancelled: "Annulé",
};

export function leaveStatusColor(status: string): { bg: string; fg: string } {
  if (status === "approved") return { bg: "#E3F4EC", fg: "#1E8A5F" };
  if (status === "rejected") return { bg: "#FBE7E4", fg: "#C0392B" };
  if (status === "cancelled") return { bg: "#EEEEEE", fg: "#6B7371" };
  return { bg: "#FDF3E1", fg: "#A86A00" };
}
