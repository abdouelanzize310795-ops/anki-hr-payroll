import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { cancelLeave, listLeaves, listLeaveTypes, requestLeave } from "@/lib/api/mobile";
import type { MobileLeave, MobileLeaveType } from "@/lib/api/types";
import { DateField } from "@/ui/DateField";
import {
  countWeekdays,
  formatDate,
  leaveStatusColor,
  leaveStatusLabel,
  toIsoDate,
} from "@/ui/format";
import { colors, radii, spacing } from "@/theme/tokens";

const CANCELLABLE = new Set(["draft", "pending", "pending_manager", "pending_hr"]);

export default function LeaveScreen() {
  const [types, setTypes] = useState<MobileLeaveType[]>([]);
  const [leaves, setLeaves] = useState<MobileLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const today = toIsoDate(new Date());

  const load = useCallback(async () => {
    setError(null);
    try {
      const [t, l] = await Promise.all([listLeaveTypes(), listLeaves(30)]);
      setTypes(t);
      setLeaves(l);
      setTypeId((current) => current ?? t[0]?.id ?? null);
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

  const selectedType = types.find((t) => t.id === typeId) ?? null;
  const days = countWeekdays(start, end);

  function resetForm() {
    setStart("");
    setEnd("");
    setReason("");
    setFormError(null);
  }

  async function onSubmit() {
    if (!typeId || !start || !end) {
      setFormError("Choisissez le type de congé et les dates.");
      return;
    }
    if (end < start) {
      setFormError("La date de fin doit être après la date de début.");
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await requestLeave({ leaveTypeId: typeId, startDate: start, endDate: end, reason });
      resetForm();
      setFormOpen(false);
      await load();
      Alert.alert("Demande envoyée", "Votre demande de congé a été transmise pour validation.");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Envoi impossible");
    } finally {
      setBusy(false);
    }
  }

  function onCancel(item: MobileLeave) {
    Alert.alert(
      "Annuler la demande ?",
      `Congé du ${formatDate(item.start_date)} au ${formatDate(item.end_date)}.`,
      [
        { text: "Non", style: "cancel" },
        {
          text: "Annuler la demande",
          style: "destructive",
          onPress: async () => {
            try {
              await cancelLeave(item.id);
              await load();
            } catch (e) {
              Alert.alert("Erreur", e instanceof Error ? e.message : "Annulation impossible");
            }
          },
        },
      ],
    );
  }

  if (loading && types.length === 0 && leaves.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.lagoon} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: spacing.md, gap: spacing.md, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.lagoon} />}
      keyboardShouldPersistTaps="handled"
    >
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionLabel}>Mes soldes {new Date().getFullYear()}</Text>
      <View style={styles.balances}>
        {types
          .filter((t) => t.deducts_balance)
          .map((t) => (
            <View key={t.id} style={styles.balanceCard}>
              <Text style={styles.balanceValue}>{Number(t.remaining_days)}</Text>
              <Text style={styles.balanceUnit}>jours restants</Text>
              <Text style={styles.balanceName}>{t.name}</Text>
              <Text style={styles.balanceMeta}>
                {Number(t.used_days)} pris · {Number(t.pending_days)} en attente
              </Text>
            </View>
          ))}
      </View>

      {formOpen ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nouvelle demande</Text>

          <Text style={styles.fieldLabel}>Type de congé</Text>
          <View style={styles.chips}>
            {types.map((t) => {
              const active = t.id === typeId;
              return (
                <Pressable
                  key={t.id}
                  onPress={() => setTypeId(t.id)}
                  style={[styles.chip, active && { backgroundColor: colors.lagoon, borderColor: colors.lagoon }]}
                >
                  <Text style={[styles.chipText, active && { color: colors.white }]}>{t.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <DateField
            label="Du"
            value={start}
            minDate={today}
            onChange={(iso) => {
              setStart(iso);
              if (!end || end < iso) setEnd(iso);
            }}
          />
          <DateField label="Au (inclus)" value={end} minDate={start || today} onChange={setEnd} />

          <Text style={styles.fieldLabel}>Motif (facultatif)</Text>
          <TextInput
            style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
            multiline
            placeholder="Ex. : congé annuel, événement familial…"
            placeholderTextColor={colors.muted}
            value={reason}
            onChangeText={setReason}
          />

          {days > 0 ? (
            <Text style={styles.summary}>
              {days} jour{days > 1 ? "s" : ""} ouvré{days > 1 ? "s" : ""}
              {selectedType?.deducts_balance
                ? ` · solde après validation : ${Number(selectedType.remaining_days) - days} j`
                : ""}
            </Text>
          ) : null}

          {formError ? <Text style={styles.error}>{formError}</Text> : null}

          <Pressable
            style={[styles.btn, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={onSubmit}
          >
            {busy ? (
              <ActivityIndicator color={colors.lagoonDark} />
            ) : (
              <Text style={styles.btnText}>Envoyer la demande</Text>
            )}
          </Pressable>
          <Pressable
            style={styles.btnGhost}
            onPress={() => {
              resetForm();
              setFormOpen(false);
            }}
          >
            <Text style={styles.btnGhostText}>Annuler</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={styles.btn} onPress={() => setFormOpen(true)}>
          <Text style={styles.btnText}>+ Demander un congé</Text>
        </Pressable>
      )}

      <Text style={styles.sectionLabel}>Mes demandes</Text>
      {leaves.length === 0 ? (
        <Text style={styles.empty}>Aucune demande pour le moment.</Text>
      ) : (
        leaves.map((item) => {
          const tone = leaveStatusColor(item.status);
          return (
            <View key={item.id} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>
                  {formatDate(item.start_date)} → {formatDate(item.end_date)}
                </Text>
                <Text style={styles.rowMeta}>
                  {Number(item.days_count)} jour{Number(item.days_count) > 1 ? "s" : ""}
                  {item.reason ? ` · ${item.reason}` : ""}
                </Text>
                {CANCELLABLE.has(item.status) ? (
                  <Pressable onPress={() => onCancel(item)} hitSlop={8}>
                    <Text style={styles.cancelLink}>Annuler la demande</Text>
                  </Pressable>
                ) : null}
              </View>
              <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                <Text style={[styles.badgeText, { color: tone.fg }]}>
                  {leaveStatusLabel[item.status] ?? item.status}
                </Text>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.sand },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.sand },
  sectionLabel: {
    fontFamily: "IBMPlexMono_500Medium",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.reef,
  },
  balances: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  balanceCard: {
    flexGrow: 1,
    minWidth: "45%",
    backgroundColor: colors.lagoon,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  balanceValue: { fontFamily: "Fraunces_700Bold", fontSize: 34, color: colors.white },
  balanceUnit: { fontFamily: "Manrope_500Medium", fontSize: 12, color: colors.mist },
  balanceName: { fontFamily: "Manrope_700Bold", fontSize: 14, color: colors.gold, marginTop: 8 },
  balanceMeta: { fontFamily: "Manrope_400Regular", fontSize: 12, color: colors.mist, marginTop: 2 },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardTitle: { fontFamily: "Fraunces_600SemiBold", fontSize: 20, color: colors.lagoon },
  fieldLabel: {
    fontFamily: "IBMPlexMono_500Medium",
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: colors.reef,
    marginTop: 6,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.sand,
  },
  chipText: { fontFamily: "Manrope_500Medium", fontSize: 13, color: colors.ink },
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
  summary: { fontFamily: "Manrope_700Bold", color: colors.lagoon, marginTop: 6 },
  btn: {
    marginTop: 6,
    backgroundColor: colors.gold,
    borderRadius: radii.sm,
    paddingVertical: 15,
    alignItems: "center",
  },
  btnText: { color: colors.lagoonDark, fontFamily: "Manrope_800ExtraBold", fontSize: 15 },
  btnGhost: { alignItems: "center", paddingVertical: 10 },
  btnGhostText: { fontFamily: "Manrope_700Bold", color: colors.muted },
  row: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: 14,
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowTitle: { fontFamily: "Manrope_700Bold", color: colors.ink },
  rowMeta: { fontFamily: "Manrope_400Regular", color: colors.muted, marginTop: 2 },
  cancelLink: { fontFamily: "Manrope_700Bold", color: colors.danger, marginTop: 8, fontSize: 13 },
  badge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontFamily: "Manrope_700Bold", fontSize: 11 },
  empty: { color: colors.muted, fontFamily: "Manrope_500Medium" },
  error: { color: colors.danger, fontFamily: "Manrope_500Medium" },
});
