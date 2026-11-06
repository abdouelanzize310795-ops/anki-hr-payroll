import { useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import type { MobileSecureClockResult } from "@/lib/api/types";
import { clockWithChecks } from "@/lib/clocking";
import { colors, radii, spacing } from "@/theme/tokens";

/** Scans the rotating QR code shown on the site's screen, then clocks in/out. */
export default function ScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [result, setResult] = useState<MobileSecureClockResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  async function onScanned(data: string) {
    if (handled.current) return;
    if (!data.startsWith("MSH1.")) {
      setError("Ce QR code n’est pas un code de pointage Mshahara.");
      return;
    }
    handled.current = true;
    setBusy(true);
    setError(null);
    try {
      setResult(await clockWithChecks(data, setAccuracy));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pointage impossible");
      handled.current = false;
    } finally {
      setBusy(false);
    }
  }

  function retry() {
    handled.current = false;
    setResult(null);
    setError(null);
  }

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.lagoon} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Caméra nécessaire</Text>
        <Text style={styles.text}>
          Pour pointer, scannez le QR code affiché sur l’écran de votre site. Mshahara utilise la caméra uniquement
          pendant le scan.
        </Text>
        <Pressable style={styles.btn} onPress={() => void requestPermission()}>
          <Text style={styles.btnText}>Autoriser la caméra</Text>
        </Pressable>
      </View>
    );
  }

  if (result) {
    return (
      <View style={styles.center}>
        <Text style={[styles.bigIcon, { color: result.ok ? colors.success : colors.danger }]}>
          {result.ok ? "✓" : "✕"}
        </Text>
        <Text style={styles.title}>{result.ok ? "Pointage enregistré" : "Pointage refusé"}</Text>
        <Text style={styles.text}>{result.message}</Text>
        {result.ok && result.branch_name ? <Text style={styles.meta}>{result.branch_name}</Text> : null}
        {result.ok ? (
          <Pressable style={styles.btn} onPress={() => router.replace("/home")}>
            <Text style={styles.btnText}>Terminé</Text>
          </Pressable>
        ) : (
          <>
            <Pressable style={styles.btn} onPress={retry}>
              <Text style={styles.btnText}>Réessayer</Text>
            </Pressable>
            <Pressable onPress={() => router.replace("/home")} hitSlop={8}>
              <Text style={styles.link}>Retour</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={busy ? undefined : ({ data }) => void onScanned(data)}
      />
      <View style={styles.overlay}>
        <Text style={styles.overlayTitle}>Visez le QR code de l’écran</Text>
        <View style={styles.frame} />
        {busy ? (
          <View style={styles.status}>
            <ActivityIndicator color={colors.white} />
            <Text style={styles.statusText}>
              Vérification de votre position{accuracy != null ? ` (±${Math.round(accuracy)} m)` : ""}…
            </Text>
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : (
          <Text style={styles.statusText}>Le code change toutes les 15 secondes.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    gap: 12,
    backgroundColor: colors.sand,
  },
  overlay: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, padding: spacing.lg },
  overlayTitle: { fontFamily: "Manrope_700Bold", fontSize: 17, color: colors.white },
  frame: { width: 250, height: 250, borderRadius: 24, borderWidth: 3, borderColor: colors.gold },
  status: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusText: { fontFamily: "Manrope_500Medium", color: colors.white, textAlign: "center" },
  errorText: {
    fontFamily: "Manrope_700Bold",
    color: colors.white,
    backgroundColor: colors.danger,
    padding: 10,
    borderRadius: radii.sm,
    textAlign: "center",
  },
  bigIcon: { fontSize: 56, fontFamily: "Manrope_800ExtraBold" },
  title: { fontFamily: "Fraunces_700Bold", fontSize: 22, color: colors.lagoon, textAlign: "center" },
  text: { fontFamily: "Manrope_500Medium", fontSize: 15, color: colors.ink, textAlign: "center" },
  meta: { fontFamily: "Manrope_400Regular", color: colors.muted },
  btn: {
    marginTop: 8,
    backgroundColor: colors.gold,
    borderRadius: radii.sm,
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  btnText: { fontFamily: "Manrope_800ExtraBold", color: colors.lagoonDark, fontSize: 15 },
  link: { fontFamily: "Manrope_700Bold", color: colors.muted, marginTop: 4 },
});
