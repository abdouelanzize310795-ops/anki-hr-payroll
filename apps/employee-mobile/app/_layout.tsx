import "react-native-gesture-handler";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AuthProvider } from "@/lib/auth";
import { AnimatedSplash } from "@/theme/AnimatedSplash";
import { colors } from "@/theme/tokens";

SplashScreen.preventAutoHideAsync().catch(() => undefined);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fraunces_600SemiBold: require("@expo-google-fonts/fraunces/600SemiBold/Fraunces_600SemiBold.ttf"),
    Fraunces_700Bold: require("@expo-google-fonts/fraunces/700Bold/Fraunces_700Bold.ttf"),
    Manrope_400Regular: require("@expo-google-fonts/manrope/400Regular/Manrope_400Regular.ttf"),
    Manrope_500Medium: require("@expo-google-fonts/manrope/500Medium/Manrope_500Medium.ttf"),
    Manrope_700Bold: require("@expo-google-fonts/manrope/700Bold/Manrope_700Bold.ttf"),
    Manrope_800ExtraBold: require("@expo-google-fonts/manrope/800ExtraBold/Manrope_800ExtraBold.ttf"),
    IBMPlexMono_500Medium: require("@expo-google-fonts/ibm-plex-mono/500Medium/IBMPlexMono_500Medium.ttf"),
    IBMPlexMono_600SemiBold: require("@expo-google-fonts/ibm-plex-mono/600SemiBold/IBMPlexMono_600SemiBold.ttf"),
  });
  const [timedOut, setTimedOut] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [nativeHidden, setNativeHidden] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, []);

  const fontsReady = fontsLoaded || Boolean(fontError) || timedOut;

  useEffect(() => {
    if (!fontsReady || nativeHidden) return;
    SplashScreen.hideAsync()
      .catch(() => undefined)
      .finally(() => setNativeHidden(true));
  }, [fontsReady, nativeHidden]);

  const onSplashFinished = useCallback(() => setShowSplash(false), []);

  if (!fontsReady) {
    return <View style={styles.boot} />;
  }

  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <View style={styles.appRoot}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.sand },
          }}
        />
        {showSplash ? <AnimatedSplash onFinished={onSplashFinished} /> : null}
      </View>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.white,
  },
  appRoot: {
    flex: 1,
    backgroundColor: colors.white,
  },
});
