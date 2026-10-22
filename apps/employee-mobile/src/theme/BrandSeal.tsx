import Svg, { Circle, Path } from "react-native-svg";
import { colors } from "./tokens";

type Props = {
  size?: number;
  /** Light seal on dark splash (white ring + white check on lagoon fill) */
  variant?: "onDark" | "onLight";
};

/** Tampon Mshahara — check dans double cercle. */
export function BrandSeal({ size = 96, variant = "onDark" }: Props) {
  const fill = variant === "onDark" ? colors.white : colors.lagoon;
  const check = variant === "onDark" ? colors.lagoon : colors.white;
  const ring = variant === "onDark" ? colors.gold : colors.lagoon;

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <Circle
        cx="60"
        cy="60"
        r="56"
        stroke={ring}
        strokeWidth="3"
        strokeDasharray="2 10"
      />
      <Circle cx="60" cy="60" r="42" fill={fill} />
      <Path
        d="M38 62 L52 76 L84 42"
        stroke={check}
        strokeWidth="8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
