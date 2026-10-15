import type { PlatformBrandProfile } from "./platformBranding";

const THEMES = {
  city_night: { backgroundColor: "#07080D", heroBackgroundColor: "#0B1018" },
  studio_red: { backgroundColor: "#12070C", heroBackgroundColor: "#200D15" },
  clean_dark: { backgroundColor: "#090A0C", heroBackgroundColor: "#141518" },
  spotlight: { backgroundColor: "#080A12", heroBackgroundColor: "#171C2A" },
  classic: { backgroundColor: "#101014", heroBackgroundColor: "#1A1A21" },
} as const;

/** The existing Brand controls affect the public surface and its owner draft preview equally. */
export function resolvePlatformPresentation(profile?: Partial<PlatformBrandProfile> | null) {
  const preset = profile?.themePreset && profile.themePreset in THEMES ? profile.themePreset : "city_night";
  const accentColor = /^#[0-9a-f]{6}$/i.test(profile?.accentColor ?? "") ? profile!.accentColor! : "#DC143C";
  const strength = Number(profile?.blurStrength ?? 0);
  return {
    ...THEMES[preset],
    accentColor,
    blurRadius: !Number.isFinite(strength) || strength <= 0 ? 0 : strength >= 0.7 ? 8 : 4,
  };
}
