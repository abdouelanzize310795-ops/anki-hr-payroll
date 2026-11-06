import { StyleSheet, Text, View, type ViewStyle } from "react-native";
import { BrandRidge } from "./BrandRidge";
import { colors } from "./tokens";

type Props = {
  size?: "sm" | "md" | "lg";
  dark?: boolean;
  showTagline?: boolean;
  showRidge?: boolean;
  style?: ViewStyle;
};

export function BrandMark({
  size = "md",
  dark = false,
  showTagline = true,
  showRidge = true,
  style,
}: Props) {
  const titleSize = size === "lg" ? 40 : size === "sm" ? 24 : 32;
  const ink = dark ? colors.white : colors.lagoon;

  return (
    <View style={[styles.wrap, style]}>
      <Text style={[styles.word, { fontSize: titleSize, color: ink }]}>
        Msha
        <Text style={{ color: colors.gold }}>hara</Text>
      </Text>
      {showRidge ? <BrandRidge width={size === "lg" ? 220 : 160} /> : null}
      {showTagline ? (
        <Text style={[styles.tag, { color: dark ? colors.gold : colors.lagoon }]}>
          PAIE · RH · POINTAGE
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "flex-start", gap: 8 },
  word: {
    fontFamily: "Fraunces_700Bold",
    letterSpacing: -0.8,
  },
  tag: {
    fontFamily: "IBMPlexMono_500Medium",
    fontSize: 10,
    letterSpacing: 2.2,
    marginTop: 2,
  },
});
