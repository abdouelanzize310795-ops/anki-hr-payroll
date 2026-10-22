import { StyleSheet, Text, type TextProps, type TextStyle } from "react-native";
import { colors } from "./tokens";

type Props = TextProps & {
  variant?: "display" | "title" | "body" | "label" | "mono" | "meta";
  color?: string;
};

export function BrandText({
  variant = "body",
  color,
  style,
  ...rest
}: Props) {
  const variantStyle = styles[variant];
  return (
    <Text
      {...rest}
      style={[variantStyle, color ? { color } : null, style as TextStyle]}
    />
  );
}

const styles = StyleSheet.create({
  display: {
    fontFamily: "Fraunces_700Bold",
    fontSize: 34,
    color: colors.lagoon,
    letterSpacing: -0.5,
  },
  title: {
    fontFamily: "Fraunces_600SemiBold",
    fontSize: 22,
    color: colors.ink,
  },
  body: {
    fontFamily: "Manrope_500Medium",
    fontSize: 15,
    color: colors.ink,
    lineHeight: 22,
  },
  label: {
    fontFamily: "IBMPlexMono_600SemiBold",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.reef,
  },
  mono: {
    fontFamily: "IBMPlexMono_600SemiBold",
    fontSize: 16,
    color: colors.lagoon,
  },
  meta: {
    fontFamily: "Manrope_400Regular",
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
  },
});
