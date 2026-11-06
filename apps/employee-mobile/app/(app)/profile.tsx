import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, router } from "expo-router";
import { getMe, signOut } from "@/lib/api/mobile";
import type { MobileMe } from "@/lib/api/types";
import { BrandMark } from "@/theme/BrandMark";
import { colors, radii, spacing } from "@/theme/tokens";

export default function ProfileScreen() {
  const [me, setMe] = useState<MobileMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setLoading(true);
      getMe()
        .then((data) => {
          if (alive) setMe(data);
        })
        .catch((e) => {
          if (alive) setError(e instanceof Error ? e.message : "Erreur");
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
      return () => {
        alive = false;
      };
    }, []),
  );

  async function onLogout() {
    await signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.lagoon} />
      </View>
    );
  }

  if (error || !me) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error ?? "Profil indisponible"}</Text>
      </View>
    );
  }

  const e = me.employee;
  const roleLabel =
    me.is_manager || me.profile.role === "manager" ? "Manager" : "Employé";

  return (
    <ScrollView contentContainerStyle={styles.root}>
      <View style={styles.hero}>
        <BrandMark size="sm" dark showTagline={false} showRidge />
        <Text style={styles.name}>
          {e.first_name} {e.last_name}
        </Text>
        <Text style={styles.role}>{roleLabel}</Text>
        <Text style={styles.company}>{me.company?.legal_name}</Text>
      </View>

      <View style={styles.block}>
        <Text style={styles.sectionLabel}>Identité</Text>
        <Row label="Poste" value={e.job_title} />
        <Row label="Matricule" value={e.employee_number} />
        <Row label="Email" value={e.email ?? me.profile.email} />
        <Row label="Téléphone" value={e.phone} />
        <Row label="Département" value={e.department_name} />
        <Row label="Agence" value={e.branch_name} />
        <Row label="Statut" value={e.status} />
        <Row label="Embauche" value={e.hire_date} />
      </View>

      <Pressable style={styles.logout} onPress={onLogout}>
        <Text style={styles.logoutText}>Se déconnecter</Text>
      </Pressable>
    </ScrollView>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value ?? "—"}</Text>
    </View>
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
    padding: 24,
    backgroundColor: colors.sand,
  },
  hero: {
    backgroundColor: colors.lagoon,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: 6,
  },
  name: {
    fontFamily: "Fraunces_700Bold",
    fontSize: 24,
    color: colors.white,
    marginTop: 8,
  },
  role: {
    fontFamily: "IBMPlexMono_500Medium",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.gold,
  },
  company: {
    fontFamily: "Manrope_400Regular",
    color: colors.mist,
  },
  block: {
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  sectionLabel: {
    fontFamily: "IBMPlexMono_500Medium",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.reef,
  },
  row: { gap: 2 },
  label: {
    fontSize: 12,
    color: colors.muted,
    fontFamily: "Manrope_400Regular",
  },
  value: {
    fontSize: 15,
    fontFamily: "Manrope_700Bold",
    color: colors.ink,
  },
  logout: {
    backgroundColor: colors.white,
    borderRadius: radii.md,
    padding: 16,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#EAC9C0",
  },
  logoutText: {
    color: colors.danger,
    fontFamily: "Manrope_700Bold",
  },
  error: {
    color: colors.danger,
    textAlign: "center",
    fontFamily: "Manrope_500Medium",
  },
});
