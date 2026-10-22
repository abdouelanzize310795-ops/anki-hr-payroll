import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Redirect, router } from "expo-router";
import { signIn } from "@/lib/api/mobile";
import { useAuth } from "@/lib/auth";
import { getApiUrl, setApiUrl } from "@/lib/supabase";
import { BrandMark } from "@/theme/BrandMark";
import { colors, radii, spacing } from "@/theme/tokens";

export default function LoginScreen() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [server, setServer] = useState("");
  const [editServer, setEditServer] = useState(false);

  useEffect(() => {
    getApiUrl().then((url) => {
      setServer(url);
      if (!url) setEditServer(true);
    });
  }, []);

  if (!loading && session) return <Redirect href="/(app)/home" />;

  async function onSubmit() {
    setBusy(true);
    setError(null);
    try {
      setServer(await setApiUrl(server));
      await signIn(email, password);
      router.replace("/(app)/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connexion impossible");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>Espace collaborateur</Text>
        <BrandMark size="lg" dark showTagline />
        <Text style={styles.heroSub}>
          Badgez, suivez votre journée et validez votre équipe en toute
          confiance.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Connexion</Text>
        <Text style={styles.cardSub}>
          Employés et managers — identifiants fournis par la RH.
        </Text>

        <Text style={styles.fieldLabel}>Email</Text>
        <TextInput
          style={styles.input}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="vous@entreprise.km"
          placeholderTextColor={colors.muted}
          value={email}
          onChangeText={setEmail}
        />
        <Text style={styles.fieldLabel}>Mot de passe</Text>
        <TextInput
          style={styles.input}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={colors.muted}
          value={password}
          onChangeText={setPassword}
        />

        {editServer ? (
          <>
            <Text style={styles.fieldLabel}>Serveur</Text>
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              placeholder="192.168.1.10:8090"
              placeholderTextColor={colors.muted}
              value={server}
              onChangeText={setServer}
            />
          </>
        ) : (
          <Pressable onPress={() => setEditServer(true)}>
            <Text style={styles.serverLink}>Serveur : {server || "non configuré"} · modifier</Text>
          </Pressable>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={[styles.btn, busy && styles.btnDisabled]}
          disabled={busy || !email || !password}
          onPress={onSubmit}
        >
          {busy ? (
            <ActivityIndicator color={colors.lagoonDark} />
          ) : (
            <Text style={styles.btnText}>Se connecter</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.sand,
  },
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
    maxWidth: 320,
    marginTop: 4,
  },
  card: {
    marginTop: -12,
    marginHorizontal: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.lg,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    shadowColor: colors.lagoon,
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 3,
  },
  cardTitle: {
    fontFamily: "Fraunces_600SemiBold",
    fontSize: 22,
    color: colors.lagoon,
  },
  cardSub: {
    fontFamily: "Manrope_400Regular",
    fontSize: 13,
    color: colors.muted,
    marginBottom: 8,
  },
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
  btnText: {
    color: colors.lagoonDark,
    fontFamily: "Manrope_800ExtraBold",
    fontSize: 15,
    letterSpacing: 0.3,
  },
  serverLink: {
    fontFamily: "Manrope_400Regular",
    fontSize: 12,
    color: colors.muted,
    marginTop: 8,
  },
  error: {
    color: colors.danger,
    fontFamily: "Manrope_500Medium",
    marginTop: 4,
  },
});
