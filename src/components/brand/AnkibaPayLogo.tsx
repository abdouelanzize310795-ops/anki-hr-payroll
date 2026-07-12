import { cn } from "@/lib/utils";

type LogoVariant = "full" | "full-dark" | "icon";

type AnkibaPayLogoProps = {
  variant?: LogoVariant;
  className?: string;
  title?: string;
};

/**
 * Official AnkibaPay mark — perforated validation stamp + Karthala ridge.
 * Extracted from Charte graphique v1.0 (SVG).
 */
export function AnkibaPayLogo({
  variant = "full",
  className,
  title = "AnkibaPay",
}: AnkibaPayLogoProps) {
  if (variant === "icon") {
    return (
      <svg
        viewBox="0 0 120 120"
        role="img"
        aria-label={title}
        className={cn("h-9 w-9 shrink-0", className)}
      >
        <title>{title}</title>
        <circle cx="60" cy="60" r="58" fill="#FFFFFF" stroke="#0E4C56" strokeWidth="2" />
        <circle
          cx="60"
          cy="60"
          r="50"
          fill="none"
          stroke="#E8A93B"
          strokeWidth="3.5"
          strokeDasharray="1.2 7"
        />
        <circle cx="60" cy="60" r="40" fill="#0E4C56" />
        <path
          d="M 42 62 L 55 75 L 80 45"
          fill="none"
          stroke="#F3EFE3"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  const onDark = variant === "full-dark";
  const wordAnkiba = onDark ? "#FFFFFF" : "#0E4C56";
  const outerFill = onDark ? "#0E4C56" : "#FFFFFF";
  const outerStroke = onDark ? "#F3EFE3" : "#0E4C56";
  const innerFill = onDark ? "#F3EFE3" : "#0E4C56";
  const checkStroke = onDark ? "#0E4C56" : "#F3EFE3";

  return (
    <svg
      viewBox="0 0 420 120"
      role="img"
      aria-label={title}
      className={cn("h-10 w-auto", className)}
    >
      <title>{title}</title>
      <g transform="translate(4,4)">
        <circle cx="56" cy="56" r="52" fill={outerFill} stroke={outerStroke} strokeWidth="2" />
        <circle
          cx="56"
          cy="56"
          r="44"
          fill="none"
          stroke="#E8A93B"
          strokeWidth="3.5"
          strokeDasharray="1.2 7"
        />
        <circle cx="56" cy="56" r="36" fill={innerFill} />
        <path
          d="M 40 58 L 52 70 L 74 44"
          fill="none"
          stroke={checkStroke}
          strokeWidth="7.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <text
          x="128"
          y="68"
          fontFamily="Fraunces, Georgia, serif"
          fontWeight="700"
          fontSize="42"
          fill={wordAnkiba}
        >
          Ankiba
          <tspan fill="#E8A93B">Pay</tspan>
        </text>
        <polyline
          points="128,82 168,82 182,70 200,90 218,66 240,82 380,82"
          fill="none"
          stroke="#E8A93B"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}
