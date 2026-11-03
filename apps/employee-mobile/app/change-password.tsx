import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Redirect, router } from "expo-router";
import { signOut } from "@/lib/api/mobile";
import { useAuth } from "@/lib/auth";
import { changePassword } from "@/lib/supabase";
import { BrandMark } from "@/theme/BrandMark";
import { colors, radii, spacing } from "@/theme/tokens";

/** First sign-in of an account created by HR: the temporary password must be replaced. */
export default function ChangePasswordScreen() {
  const { session, loading } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!loading && !session) return <Redirect href="/login" />;

  const mismatch = confirm.length > 0 && next !== confirm;
  const canSubmit = current.length > 0 && next.length >= 8 && next === confirm && !busy;

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
      router.replace("/(app)/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Modification impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.eyebrow}>Première connexion</Text>
          <BrandMark size="lg" dark />
          <Text style={styles.heroSub}>
            Pour protéger votre compte, remplacez le mot de passe provisoire reçu par e-mail par un mot de passe
            que vous seul connaissez.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Nouveau mot de passe</Text>
          <Text style={styles.cardSub}>Au moins 8 caractères.</Text>

          <Text style={styles.fieldLabel}>Mot de passe provisoire</Text>
          <TextInput style={styles.input} secureTextEntry value={current} onChangeText={setCurrent} />

          <Text style={styles.fieldLabel}>Nouveau mot de passe</Text>
          <TextInput style={styles.input} secureTextEntry value={next} onChangeText={setNext} />

          <Text style={styles.fieldLabel}>Confirmer</Text>
          <TextInput style={styles.input} secureTextEntry value={confirm} onChangeText={setConfirm} />
          {mismatch ? <Text style={styles.error}>Les deux mots de passe sont différents.</Text> : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={[styles.btn, !canSubmit && styles.btnDisabled]} disabled={!canSubmit} onPress={onSubmit}>
            {busy ? <ActivityIndicator color={colors.lagoonDark} /> : <Text style={styles.btnText}>Enregistrer</Text>}
          </Pressable>

          <Pressable
            onPress={async () => {
              await signOut().catch(() => undefined);
              router.replace("/login");
            }}
          >
            <Text style={styles.link}>Se déconnecter</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.sand },
  hero: {
    backgroundColor: colors.lagoon,
    paddingHorizontal: spacing.lg,
    paddingTop: 64,
    paddingBottom: spacing.xl,
    gap: 12,
  },
  eyebrow: {
    fontFamily: "IBMPlexMono_500Medium",
    fontSize: 11,
    letterSpacing: 2.5,
    textTransform: "uppercase",
    color: colors.gold,
  },
  heroSub: {
    fontFamily: "Manrope_400Regular",
    fontSize: 15,
    lineHeight: 22,
    color: colors.mist,
    maxWidth: 340,
    marginTop: 4,
  },
  card: {
    marginTop: -12,
    marginHorizontal: spacing.md,
    marginBottom: spacing.xl,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    elevation: 3,
  },
  cardTitle: { fontFamily: "Fraunces_600SemiBold", fontSize: 22, color: colors.lagoon },
  cardSub: { fontFamily: "Manrope_400Regular", fontSize: 13, color: colors.muted, marginBottom: 8 },
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
    paddingVertical: 13,
    borderWidth: 1,
    borderColor: colors.line,
    fontFamily: "Manrope_500Medium",
    fontSize: 16,
    color: colors.ink,
  },
  btn: {
    marginTop: 14,
    backgroundColor: colors.gold,
    borderRadius: radii.sm,
    paddingVertical: 15,
    alignItems: "center",
  },
  btnDisabled: { opacity: 0.55 },
  btnText: { color: colors.lagoonDark, fontFamily: "Manrope_800ExtraBold", fontSize: 15, letterSpacing: 0.3 },
  error: { color: colors.danger, fontFamily: "Manrope_500Medium", marginTop: 4 },
  link: {
    marginTop: 12,
    textAlign: "center",
    color: colors.reef,
    fontFamily: "Manrope_700Bold",
    fontSize: 14,
  },
});
