export const color = {
  background: "#0B0B0F",
  surface: "#14141C",
  surfaceDeep: "rgba(8,12,20,0.62)",
  surfaceRaised: "rgba(13,17,28,0.82)",
  surfaceOverlay: "rgba(9,12,20,0.92)",
  surfaceSoft: "rgba(10,14,22,0.76)",
  surfaceMuted: "rgba(255,255,255,0.07)",
  surfaceSubtle: "rgba(255,255,255,0.08)",
  primary: "#DC143C",
  primarySoft: "#FF5A76",
  textPrimary: "#F8FAFF",
  textOnPrimary: "#FFFFFF",
  textSecondary: "#AAB4C8",
  textMuted: "#D7DEEC",
  textLavender: "#E8ECFF",
  textAccent: "#FFE6EC",
  textDanger: "#FFE4E6",
  textSuccess: "#C9FFE1",
  textWarning: "#FFE8A3",
  textPremium: "#FFF2C7",
  borderDefault: "rgba(255,255,255,0.12)",
  borderSoft: "rgba(255,255,255,0.11)",
  borderMuted: "rgba(255,255,255,0.14)",
  borderStrong: "rgba(255,255,255,0.16)",
  borderPrimarySoft: "rgba(220,20,60,0.46)",
  borderBlueSoft: "rgba(116,130,255,0.24)",
  borderBlue: "rgba(116,130,255,0.3)",
  borderBlueMuted: "rgba(116,130,255,0.32)",
  accentBlueSurface: "rgba(116,130,255,0.12)",
  accentBlueSurfaceStrong: "rgba(116,130,255,0.13)",
  accentSurface: "rgba(220,20,60,0.16)",
  dangerSurface: "rgba(239,68,68,0.14)",
  dangerSurfaceStrong: "rgba(239,68,68,0.15)",
  dangerBorder: "rgba(239,68,68,0.42)",
  dangerBorderStrong: "rgba(239,68,68,0.44)",
  successSurface: "rgba(34,197,94,0.14)",
  successSurfaceStrong: "rgba(34,197,94,0.22)",
  successBorder: "rgba(34,197,94,0.36)",
  successBorderStrong: "rgba(34,197,94,0.45)",
  warningSurface: "rgba(245,158,11,0.14)",
  warningBorder: "rgba(245,158,11,0.36)",
  premiumSurface: "rgba(245,158,11,0.16)",
  premiumBorder: "rgba(245,158,11,0.38)",
} as const;

export const radius = {
  pill: 999,
  sm: 13,
  md: 14,
  lg: 18,
  xl: 20,
} as const;

export const spacing = {
  xs: 5,
  sm: 6,
  quickLinkCopyGap: 7,
  md: 10,
  lg: 12,
  xl: 15,
  xxl: 16,
  xxxl: 18,
  controlMinHeight: 44,
  sectionHeaderMinHeight: 72,
  quickLinkMinHeight: 88,
  emptyStateMinHeight: 116,
} as const;

export const motion = {
  activeOpacity: 0.84,
  disabledOpacity: 0.48,
  hitSlop: { bottom: 6, left: 6, right: 6, top: 6 },
} as const;

export const fontSize = {
  xs: 11,
  sm: 12,
  md: 13,
  lg: 14,
  xl: 16,
  xxl: 18,
  sectionTitle: 20,
  icon: 24,
} as const;

export const fontWeight = {
  strong: "700",
  heavy: "900",
} as const;

export const contrastRatio = (foreground: string, background: string) => {
  const parseHex = (value: string) => {
    const normalized = value.replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
    return [0, 2, 4].map((index) => parseInt(normalized.slice(index, index + 2), 16) / 255);
  };

  const luminanceWeights = [0.2126, 0.7152, 0.0722] as const;
  const relativeLuminance = (rgb: number[]) =>
    rgb
      .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4))
      .reduce((sum, channel, index) => sum + channel * (luminanceWeights[index] ?? 0), 0);

  const foregroundRgb = parseHex(foreground);
  const backgroundRgb = parseHex(background);
  if (!foregroundRgb || !backgroundRgb) return null;

  const lighter = Math.max(relativeLuminance(foregroundRgb), relativeLuminance(backgroundRgb));
  const darker = Math.min(relativeLuminance(foregroundRgb), relativeLuminance(backgroundRgb));
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
};
