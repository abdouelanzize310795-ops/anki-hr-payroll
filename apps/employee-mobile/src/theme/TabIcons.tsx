import Svg, { Circle, Path, Rect } from "react-native-svg";

type Props = { color: string; size?: number };

export function IconClock({ color, size = 24 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" />
      <Path
        d="M12 7v5l3 2"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function IconPeople({ color, size = 24 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="9" cy="8" r="3" stroke={color} strokeWidth="2" />
      <Path
        d="M3 19c0-3 2.5-5 6-5s6 2 6 5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <Circle cx="17" cy="9" r="2.5" stroke={color} strokeWidth="2" />
      <Path
        d="M16 19c0-2 1.5-3.5 4-3.5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function IconCalendar({ color, size = 24 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x="3"
        y="5"
        width="18"
        height="16"
        rx="2"
        stroke={color}
        strokeWidth="2"
      />
      <Path d="M3 10h18" stroke={color} strokeWidth="2" />
      <Path
        d="M8 3v4M16 3v4"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function IconPerson({ color, size = 24 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="8" r="3.5" stroke={color} strokeWidth="2" />
      <Path
        d="M5 20c0-3.5 3-6 7-6s7 2.5 7 6"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function IconSun({ color, size = 24 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx="12" cy="12" r="4" stroke={color} strokeWidth="2" />
      <Path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function IconWallet({ color, size = 24 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="6" width="18" height="13" rx="2.5" stroke={color} strokeWidth="2" />
      <Path d="M3 10h18" stroke={color} strokeWidth="2" />
      <Circle cx="16.5" cy="14.5" r="1.3" fill={color} />
      <Path d="M7 6V5a2 2 0 0 1 2-2h8" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}
