/**
 * AnkibaPay brand tokens — source of truth from Charte graphique v1.0
 * Never invent alternate brand colors or fonts.
 */
export const brand = {
  name: "AnkibaPay",
  tagline: "Paie · RH · Pointage",
  taglineEn: "Smart HR • Smart Payroll",
  colors: {
    lagoon: "#0E4C56",
    lagoonDark: "#0A363D",
    gold: "#E8A93B",
    reef: "#35A69A",
    ink: "#16211F",
    sand: "#F3EFE3",
    white: "#FFFFFF",
  },
  fonts: {
    display: "Fraunces",
    sans: "Manrope",
    mono: "IBM Plex Mono",
  },
  defaultLocale: "fr-KM",
  defaultCurrency: "KMF",
  defaultCountry: "KM",
} as const;

export type BrandColor = keyof typeof brand.colors;
