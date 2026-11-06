import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { listAttendance, listCorrections, requestCorrection } from "@/lib/api/mobile";
import type { MobileAttendanceDay, MobileCorrection } from "@/lib/api/types";
import { DateField } from "@/ui/DateField";
import { formatDate, toIsoDate } from "@/ui/format";
import { colors, radii, spacing } from "@/theme/tokens";

const STATUS_FR: Record<string, string> = {
  present: "Présent",
  late: "En retard",
  absent: "Absent",
  half_day: "Demi-journée",
  remote: "Télétravail",
  on_leave: "En congé",
};

const CORRECTION_FR: Record<string, { label: string; color: string }> = {
  pending: { label: "En attente", color: "#A86A00" },
  approved: { label: "Validée", color: colors.success },
  rejected: { label: "Refusée", color: colors.danger },
  cancelled: { label: "Annulée", color: colors.muted },
};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

type Row = MobileAttendanceDay & { late_minutes?: number; missing_checkout?: boolean };

export default function HistoryScreen() {
  const [rows, setRows] = useState<Row[]>([]);
  const [corrections, setCorrections] = useState<MobileCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [a, c] = await Promise.all([listAttendance(), listCorrections(10).catch(() => [])]);
      setRows(a as Row[]);
      setCorrections(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
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

  function openForm(day?: Row) {
    setDate(day?.work_date ?? toIsoDate(new Date()));
    setCheckIn((day?.check_in ?? "").toString().slice(0, 5));
    setCheckOut((day?.check_out ?? "").toString().slice(0, 5));
    setReason("");
    setFormError(null);
    setOpen(true);
  }

  async function submit() {
    if (!date) return setFormError("Choisissez le jour à corriger.");
    if (!checkIn && !checkOut) return setFormError("Indiquez l’heure d’entrée et/ou de sortie (HH:MM).");
    if ((checkIn && !TIME.test(checkIn)) || (checkOut && !TIME.test(checkOut))) {
      return setFormError("Format d’heure attendu : HH:MM (ex. 08:05).");
    }
    if (reason.trim().length < 3) return setFormError("Expliquez brièvement le motif.");
    setBusy(true);
    setFormError(null);
    try {
      await requestCorrection({ workDate: date, checkIn: checkIn || null, checkOut: checkOut || null, reason });
      setOpen(false);
      await load();
      Alert.alert("Demande envoyée", "Votre manager ou les RH vont examiner la correction.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setBusy(false);
    }
  }

  if (loading && rows.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.lagoon} />
      </View>
    );
  }

  const today = toIsoDate(new Date());
  const minDate = toIsoDate(new Date(Date.now() - 60 * 86_400_000));

  return (
    <>
      <FlatList
        style={styles.list}
        contentContainerStyle={{ padding: spacing.md, gap: 10, paddingBottom: 40 }}
        data={rows}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.lagoon} />}
        ListEmptyComponent={<Text style={styles.empty}>{error ?? "Aucun pointage ce mois-ci."}</Text>}
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <Pressable style={styles.btn} onPress={() => openForm()}>
              <Text style={styles.btnText}>Demander une correction</Text>
            </Pressable>
            {corrections.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.sectionLabel}>Mes corrections</Text>
                {corrections.map((c) => {
                  const s = CORRECTION_FR[c.status] ?? { label: c.status, color: colors.muted };
                  return (
                    <View key={c.id} style={styles.corrRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.date}>{formatDate(c.work_date)}</Text>
                        <Text style={styles.status}>
                          {c.requested_check_in ?? "—"} → {c.requested_check_out ?? "—"} · {c.reason}
                        </Text>
                        {c.review_note ? <Text style={styles.status}>Réponse : {c.review_note}</Text> : null}
                      </View>
                      <Text style={[styles.badge, { color: s.color }]}>{s.label}</Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
            <Text style={styles.sectionLabel}>Présences du mois · touchez un jour pour le corriger</Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => openForm(item)}>
            <View>
              <Text style={styles.date}>{formatDate(item.work_date ?? null)}</Text>
              <Text style={[styles.status, item.status === "late" && { color: "#A86A00" }, item.status === "absent" && { color: colors.danger }]}>
                {STATUS_FR[item.status] ?? item.status}
                {item.late_minutes ? ` · ${item.late_minutes} min` : ""}
                {item.missing_checkout ? " · sortie manquante" : ""}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.time}>
                {(item.check_in ?? "—").toString().slice(0, 5)} → {(item.check_out ?? "—").toString().slice(0, 5)}
              </Text>
              <Text style={styles.mins}>
                {item.worked_minutes != null ? `${Math.round(item.worked_minutes / 6) / 10} h` : "—"}
              </Text>
            </View>
          </Pressable>
        )}
      />

      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Demande de correction</Text>
            <DateField label="Jour" value={date} minDate={minDate} onChange={(d) => d <= today && setDate(d)} />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Entrée</Text>
                <TextInput style={styles.input} placeholder="08:00" placeholderTextColor={colors.muted}
                  keyboardType="numbers-and-punctuation" maxLength={5} value={checkIn} onChangeText={setCheckIn} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.fieldLabel}>Sortie</Text>
                <TextInput style={styles.input} placeholder="17:00" placeholderTextColor={colors.muted}
                  keyboardType="numbers-and-punctuation" maxLength={5} value={checkOut} onChangeText={setCheckOut} />
              </View>
            </View>
            <Text style={styles.fieldLabel}>Motif</Text>
            <TextInput
              style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
              multiline
              placeholder="Ex. : téléphone déchargé, oubli de pointer la sortie…"
              placeholderTextColor={colors.muted}
              value={reason}
              onChangeText={setReason}
            />
            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <Pressable style={[styles.btn, busy && { opacity: 0.6 }]} disabled={busy} onPress={() => void submit()}>
              {busy ? <ActivityIndicator color={colors.lagoonDark} /> : <Text style={styles.btnText}>Envoyer</Text>}
            </Pressable>
            <Pressable onPress={() => setOpen(false)} style={{ alignItems: "center", paddingVertical: 8 }}>
              <Text style={styles.cancel}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.sand },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.sand },
  sectionLabel: {
    fontFamily: "IBMPlexMono_500Medium",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.reef,
    marginBottom: 6,
  },
  empty: { textAlign: "center", color: colors.muted, marginTop: 40, fontFamily: "Manrope_500Medium" },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
  },
  corrRow: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  badge: { fontFamily: "Manrope_700Bold", fontSize: 12 },
  row: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.line,
  },
  date: { fontFamily: "Manrope_700Bold", color: colors.ink },
  status: { color: colors.muted, marginTop: 2, fontFamily: "Manrope_400Regular", fontSize: 13 },
  time: { fontFamily: "IBMPlexMono_600SemiBold", color: colors.lagoon },
  mins: { color: colors.muted, marginTop: 2, fontFamily: "Manrope_400Regular" },
  btn: {
    backgroundColor: colors.gold,
    borderRadius: radii.sm,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: colors.lagoonDark, fontFamily: "Manrope_800ExtraBold", fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: "rgba(10,54,61,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.lg,
    gap: 8,
  },
  sheetTitle: { fontFamily: "Fraunces_600SemiBold", fontSize: 20, color: colors.lagoon },
  fieldLabel: {
    fontFamily: "IBMPlexMono_500Medium",
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.reef,
    marginTop: 6,
  },
  input: {
    backgroundColor: colors.sand,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.line,
    fontFamily: "Manrope_500Medium",
    fontSize: 15,
    color: colors.ink,
  },
  error: { color: colors.danger, fontFamily: "Manrope_500Medium" },
  cancel: { fontFamily: "Manrope_700Bold", color: colors.muted },
});
