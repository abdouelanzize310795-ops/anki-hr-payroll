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
import { useFocusEffect } from "expo-router";
import {
  listTeamAttendance,
  listTeamPendingLeaves,
  reviewLeave,
} from "@/lib/api/mobile";
import type {
  MobileTeamMemberAttendance,
  MobileTeamPendingLeave,
} from "@/lib/api/types";
import { colors, radii, spacing } from "@/theme/tokens";

function fmtTime(v: string | null | undefined) {
  if (!v) return "—";
  return String(v).slice(0, 5);
}

export default function TeamScreen() {
  const [members, setMembers] = useState<MobileTeamMemberAttendance[]>([]);
  const [leaves, setLeaves] = useState<MobileTeamPendingLeave[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [team, pending] = await Promise.all([
        listTeamAttendance(),
        listTeamPendingLeaves(),
      ]);
      setMembers(team);
      setLeaves(pending);
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

  async function onReview(id: string, action: "approve" | "reject") {
    setBusyId(id);
    setError(null);
    try {
      await reviewLeave(id, action);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible");
    } finally {
      setBusyId(null);
    }
  }

  if (loading && members.length === 0 && leaves.length === 0) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.lagoon} />
      </View>
    );
  }

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
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionLabel}>Présence équipe</Text>
      {members.length === 0 ? (
        <Text style={styles.empty}>Aucun collaborateur dans votre équipe.</Text>
      ) : (
        members.map((m) => (
          <View key={m.employee_id} style={styles.card}>
            <Text style={styles.name}>
              {m.first_name} {m.last_name}
            </Text>
            <Text style={styles.meta}>{m.job_title ?? "—"}</Text>
            <Text style={styles.time}>
              {fmtTime(m.check_in)} → {fmtTime(m.check_out)} ·{" "}
              {m.status ?? "absent"}
            </Text>
          </View>
        ))
      )}

      <Text style={[styles.sectionLabel, { marginTop: 10 }]}>
        Congés à valider
      </Text>
      {leaves.length === 0 ? (
        <Text style={styles.empty}>Aucune demande en attente.</Text>
      ) : (
        leaves.map((l) => (
          <View key={l.id} style={styles.card}>
            <Text style={styles.name}>
              {l.first_name} {l.last_name}
            </Text>
            <Text style={styles.meta}>
              {l.start_date} → {l.end_date} ({Number(l.days_count)} j)
            </Text>
            {l.reason ? <Text style={styles.meta}>{l.reason}</Text> : null}
            <View style={styles.actions}>
              <Pressable
                style={[styles.btn, styles.approve]}
                disabled={busyId === l.id}
                onPress={() => onReview(l.id, "approve")}
              >
                <Text style={styles.btnTextDark}>
                  {busyId === l.id ? "…" : "Approuver"}
                </Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.reject]}
                disabled={busyId === l.id}
                onPress={() => onReview(l.id, "reject")}
              >
                <Text style={styles.btnTextLight}>Refuser</Text>
              </Pressable>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    padding: spacing.md,
    gap: 10,
    backgroundColor: colors.sand,
    flexGrow: 1,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.sand,
  },
  sectionLabel: {
    fontFamily: "IBMPlexMono_500Medium",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.reef,
  },
  empty: {
    color: colors.muted,
    fontFamily: "Manrope_400Regular",
  },
  error: {
    color: colors.danger,
    fontFamily: "Manrope_500Medium",
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 4,
  },
  name: {
    fontFamily: "Manrope_700Bold",
    color: colors.ink,
    fontSize: 15,
  },
  meta: {
    color: colors.muted,
    fontFamily: "Manrope_400Regular",
  },
  time: {
    color: colors.lagoon,
    fontFamily: "IBMPlexMono_600SemiBold",
    marginTop: 2,
  },
  actions: { flexDirection: "row", gap: 8, marginTop: 10 },
  btn: {
    flex: 1,
    borderRadius: radii.sm,
    paddingVertical: 11,
    alignItems: "center",
  },
  approve: { backgroundColor: colors.gold },
  reject: { backgroundColor: colors.danger },
  btnTextDark: {
    color: colors.lagoonDark,
    fontFamily: "Manrope_800ExtraBold",
  },
  btnTextLight: {
    color: colors.white,
    fontFamily: "Manrope_800ExtraBold",
  },
});
