import Svg, { Polyline } from "react-native-svg";
import { colors } from "./tokens";

/** Karthala ridge line from the Mshahara brand mark. */
export function BrandRidge({ width = 180, height = 14 }: { width?: number; height?: number }) {
  return (
    <Svg width={width} height={height} viewBox="0 0 380 24">
      <Polyline
        points="0,14 50,14 69,4 98,20 133,2 170,14 380,14"
        fill="none"
        stroke={colors.gold}
        strokeWidth={4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
