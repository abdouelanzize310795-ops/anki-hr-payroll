import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { getHome, getSchedule } from "@/lib/api/mobile";
import type { MobileHome, MobileSchedule, MobileSecureClockResult } from "@/lib/api/types";
import { clockWithChecks } from "@/lib/clocking";
import { BrandRidge } from "@/theme/BrandRidge";
import { colors, radii, spacing } from "@/theme/tokens";

function formatTime(value: string | null | undefined) {
  if (!value) return "—";
  return String(value).slice(0, 5);
}

export default function HomeScreen() {
  const [home, setHome] = useState<MobileHome | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<MobileSchedule | null>(null);
  const [result, setResult] = useState<MobileSecureClockResult | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [h, s] = await Promise.all([getHome(), getSchedule().catch(() => null)]);
      setHome(h);
      setSchedule(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void load();
    }, [load]),
  );

  async function doClock() {
    if (schedule?.requires_qr) {
      router.push("/scan");
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setAccuracy(null);
    try {
      setResult(await clockWithChecks(null, setAccuracy));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pointage impossible");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !home) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.lagoon} />
      </View>
    );
  }

  const att = home?.today_attendance;
  const name = home
    ? `${home.employee.first_name} ${home.employee.last_name}`
    : "";

  return (
    <ScrollView
      contentContainerStyle={styles.root}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={load}
          tintColor={colors.lagoon}
        />
      }
    >
      <View style={styles.headerCard}>
        <Text style={styles.eyebrow}>
          {home?.is_manager ? "Espace manager" : "Espace collaborateur"}
        </Text>
        <Text style={styles.hello}>Bonjour {name}</Text>
        <BrandRidge width={140} height={12} />
        <Text style={styles.meta}>
          {home?.employee.job_title ?? "Collaborateur"} · {home?.work_date}
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.sectionLabel}>Aujourd’hui</Text>
        <View style={styles.row}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Entrée</Text>
            <Text style={styles.statValue}>{formatTime(att?.check_in)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Sortie</Text>
            <Text style={styles.statValue}>{formatTime(att?.check_out)}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Statut</Text>
            <Text style={styles.statValue}>{att?.status ?? "à badger"}</Text>
          </View>
        </View>

        {schedule ? (
          <Text style={styles.schedule}>
            {schedule.is_working_day
              ? `Horaire : ${schedule.start_time}–${schedule.end_time} · retard après ${schedule.grace_minutes} min · entrée dès ${schedule.checkin_opens}`
              : schedule.holiday_name
                ? `Jour férié : ${schedule.holiday_name}`
                : "Aujourd’hui n’est pas un jour travaillé."}
          </Text>
        ) : null}

        {result ? (
          <View style={[styles.result, result.ok ? styles.resultOk : styles.resultKo]}>
            <Text style={[styles.resultText, { color: result.ok ? colors.success : colors.danger }]}>
              {result.ok ? "✓ " : "✕ "}
              {result.message}
            </Text>
            {result.ok && result.branch_name ? (
              <Text style={styles.resultMeta}>
                {result.branch_name}
                {result.distance_m != null ? ` · ${result.distance_m} m` : ""}
              </Text>
            ) : null}
          </View>
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {(() => {
          const canClock = Boolean(home?.actions.can_clock_in || home?.actions.can_clock_out);
          const isOut = Boolean(home?.actions.can_clock_out);
          const label = busy
            ? accuracy != null
              ? `Localisation… ±${Math.round(accuracy)} m`
              : "Localisation…"
            : schedule?.requires_qr
              ? isOut ? "Scanner pour sortir" : "Scanner pour pointer"
              : isOut ? "Pointer la sortie" : "Pointer l’entrée";
          return (
            <Pressable
              style={[
                styles.clockBtn,
                isOut ? styles.outBtn : styles.inBtn,
                (!canClock || busy) && styles.disabled,
              ]}
              disabled={!canClock || busy}
              onPress={() => void doClock()}
            >
              {busy ? <ActivityIndicator color={isOut ? colors.white : colors.lagoonDark} /> : null}
              <Text style={isOut ? styles.clockTextWhite : styles.clockTextGold}>
                {canClock ? label : "Journée terminée"}
              </Text>
            </Pressable>
          );
        })()}
        {!schedule?.requires_qr && (home?.actions.can_clock_in || home?.actions.can_clock_out) ? (
          <Pressable onPress={() => router.push("/scan")} hitSlop={8} disabled={busy}>
            <Text style={styles.correctionLink}>Pointer en scannant le QR code du site ›</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={() => router.push("/history")} hitSlop={8}>
          <Text style={styles.correctionLink}>Oubli ou téléphone en panne ? Demander une correction ›</Text>
        </Pressable>
      </View>

      <View style={styles.counts}>
        <Text style={styles.sectionLabel}>Résumé</Text>
        <Text style={styles.countItem}>
          Congés en cours · {home?.counts.pending_leaves ?? 0}
        </Text>
        <Text style={styles.countItem}>
          Tâches ouvertes · {home?.counts.open_tasks ?? 0}
        </Text>
        <Text style={styles.countItem}>
          Notifications · {home?.counts.unread_notifications ?? 0}
        </Text>
        {home?.is_manager ? (
          <>
            <Text style={styles.countItem}>
              Équipe présente · {home.counts.team_present_today ?? 0}/
              {home.counts.team_headcount ?? 0}
            </Text>
            <Text style={styles.countItem}>
              Congés à valider · {home.counts.team_pending_leaves ?? 0}
            </Text>
          </>
        ) : null}
      </View>

      {home?.latest_payslip ? (
        <View style={styles.payslip}>
          <Text style={styles.sectionLabel}>Dernier bulletin</Text>
          <Text style={styles.payslipAmt}>
            {Number(home.latest_payslip.net_amount).toLocaleString("fr-FR")}{" "}
            {home.latest_payslip.currency_code}
          </Text>
          <Text style={styles.meta}>{home.latest_payslip.period_label}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.sand,
    flexGrow: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sand,
  },
  headerCard: {
    backgroundColor: colors.lagoon,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: 8,
  },
  eyebrow: {
    fontFamily: "IBMPlexMono_500Medium",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.gold,
  },
  hello: {
    fontFamily: "Fraunces_700Bold",
    fontSize: 26,
    color: colors.white,
  },
  meta: {
    fontFamily: "Manrope_400Regular",
    color: colors.mist,
    fontSize: 13,
  },
  panel: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  sectionLabel: {
    fontFamily: "IBMPlexMono_500Medium",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.reef,
  },
  row: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, gap: 4 },
  statLabel: {
    fontFamily: "Manrope_400Regular",
    fontSize: 12,
    color: colors.muted,
  },
  statValue: {
    fontFamily: "IBMPlexMono_600SemiBold",
    fontSize: 17,
    color: colors.lagoon,
  },
  actions: { flexDirection: "row", gap: 10 },
  clockBtn: {
    borderRadius: radii.md,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 10,
  },
  schedule: { fontFamily: "Manrope_500Medium", fontSize: 12, color: colors.muted },
  result: { borderRadius: radii.md, padding: 12, borderWidth: 1 },
  resultOk: { backgroundColor: "#E3F4EC", borderColor: "#BFE3CF" },
  resultKo: { backgroundColor: "#FBE7E4", borderColor: "#F2C4BD" },
  resultText: { fontFamily: "Manrope_700Bold", fontSize: 14 },
  resultMeta: { fontFamily: "Manrope_400Regular", fontSize: 12, color: colors.muted, marginTop: 2 },
  correctionLink: { fontFamily: "Manrope_500Medium", fontSize: 12, color: colors.reef, textAlign: "center" },
  inBtn: { backgroundColor: colors.gold },
  outBtn: { backgroundColor: colors.lagoon },
  disabled: { opacity: 0.4 },
  clockTextGold: {
    color: colors.lagoonDark,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 16,
  },
  clockTextWhite: {
    color: colors.white,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 16,
  },
  error: { color: colors.danger, fontFamily: "Manrope_500Medium" },
  counts: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
  },
  countItem: {
    fontFamily: "Manrope_500Medium",
    color: colors.ink,
    fontSize: 14,
  },
  payslip: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 4,
  },
  payslipAmt: {
    fontFamily: "IBMPlexMono_600SemiBold",
    fontSize: 22,
    color: colors.lagoon,
  },
});
