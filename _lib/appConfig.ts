import {
  APP_MONETIZATION_RUNTIME_DEFAULTS,
  APP_RUNTIME_CONTROL_DEFAULTS,
  APP_RUNTIME_FEATURE_DEFAULTS,
  resolveAppRuntimeControls,
  resolveAppMonetizationRuntimeFeatures,
  resolveAppRuntimeFeatures,
  setAppMonetizationRuntimeFeatures,
  type AppMonetizationRuntimeFeatures,
  type AppRuntimeControls,
  type AppRuntimeFeatures,
} from "./featureFlags";
import {
  ADS_LAUNCH_CONFIG_DEFAULTS,
  resolveAdsLaunchConfig as normalizeAdsLaunchConfig,
  type AdsLaunchConfig,
} from "./ads/adConfig";
import {
  normalizeCapturePolicy,
  normalizeContentAccessRule,
  normalizeJoinPolicy,
  normalizeReactionsPolicy,
  type CapturePolicy,
  type ContentAccessRule,
  type JoinPolicy,
  type ReactionsPolicy,
} from "./roomRules";
import type { Tables, TablesInsert } from "../supabase/database.types";
import { supabase } from "./supabase";

export const APP_CONFIG_TABLE = "app_configurations";
export const APP_CONFIG_GLOBAL_KEY = "global";

export type AppThemePreset =
  | "city_night"
  | "lake_glow"
  | "steel_day"
  | "theater_noir"
  | "premiere_gold"
  | "red_carpet"
  | "midnight_blue"
  | "studio_neon"
  | "chi_town_glow"
  | "skyline_glass"
  | "creator_spotlight";
export type AppBackgroundMode = "hero_art" | "skyline";
export type HomeHeroMode = "latest" | "hero_flag" | "manual_title";
export type HomeRailKey = "top_picks" | "browse" | "favorites" | "continue_watching";
export type HomeTopPicksSource = "recent" | "top_row" | "featured" | "trending";

export type AppThemeConfig = {
  preset: AppThemePreset;
  backgroundMode: AppBackgroundMode;
};

export type HomeConfig = {
  heroMode: HomeHeroMode;
  manualHeroTitleId?: string | null;
  railOrder: HomeRailKey[];
  enabledRails: Record<HomeRailKey, boolean>;
  topPicksSource: HomeTopPicksSource;
  browseCategoryLabel: string;
  browseCategoryQuery: string;
  maxItemsPerRail: number;
};

export type BrandingConfig = {
  appDisplayName: string;
  homeHeroKicker: string;
  watchPartyLabel: string;
  liveWaitingRoomTitle: string;
  partyWaitingRoomTitle: string;
  liveRoomTitle: string;
  partyRoomTitle: string;
  adminTitle: string;
  adminSubtitle: string;
};

export type RoomDefaultConfig = {
  watchParty: {
    joinPolicy: JoinPolicy;
    reactionsPolicy: ReactionsPolicy;
    contentAccessRule: ContentAccessRule;
    capturePolicy: CapturePolicy;
  };
  communication: {
    contentAccessRule: ContentAccessRule;
    capturePolicy: CapturePolicy;
  };
};

export type AppConfig = {
  theme: AppThemeConfig;
  home: HomeConfig;
  branding: BrandingConfig;
  features: AppRuntimeFeatures;
  runtimeControls: AppRuntimeControls;
  adsLaunch: AdsLaunchConfig;
  monetization: AppMonetizationRuntimeFeatures & {
    defaultSponsorLabel: string;
    premiumUpsellTitle: string;
    premiumUpsellBody: string;
  };
  roomDefaults: RoomDefaultConfig;
};

type AppConfigRow = Tables<"app_configurations">;
type AppConfigInsert = TablesInsert<"app_configurations">;

export type ThemePresetPalette = {
  accent: string;
  surfaceTint: string;
  screenOverlay: string;
  heroOverlay: string;
  tabBarBackground: string;
  tabBarBorder: string;
  tabActiveTint: string;
};

export const HOME_RAIL_KEYS: HomeRailKey[] = [
  "top_picks",
  "browse",
  "favorites",
  "continue_watching",
];

export const DEFAULT_APP_CONFIG: AppConfig = {
  theme: {
    preset: "city_night",
    backgroundMode: "hero_art",
  },
  home: {
    heroMode: "latest",
    manualHeroTitleId: null,
    railOrder: [...HOME_RAIL_KEYS],
    enabledRails: {
      top_picks: true,
      browse: true,
      favorites: true,
      continue_watching: true,
    },
    topPicksSource: "recent",
    browseCategoryLabel: "Browse",
    browseCategoryQuery: "drama",
    maxItemsPerRail: 8,
  },
  branding: {
    appDisplayName: "Chi'llywood",
    homeHeroKicker: "STREAM THE CITY",
    watchPartyLabel: "Live Watch-Party",
    liveWaitingRoomTitle: "Live Waiting Room",
    partyWaitingRoomTitle: "Party Waiting Room",
    liveRoomTitle: "Live Room",
    partyRoomTitle: "Party Room",
    adminTitle: "Chi'llywood Operator Center",
    adminSubtitle: "Private platform surface for reports, moderation, roles, and launch operations.",
  },
  features: APP_RUNTIME_FEATURE_DEFAULTS,
  runtimeControls: APP_RUNTIME_CONTROL_DEFAULTS,
  adsLaunch: { ...ADS_LAUNCH_CONFIG_DEFAULTS },
  monetization: {
    ...APP_MONETIZATION_RUNTIME_DEFAULTS,
    defaultSponsorLabel: "Sponsored",
    premiumUpsellTitle: "Go Premium",
    premiumUpsellBody: "Premium unlocks premium titles and premium-entry rooms while keeping playback ad-free.",
  },
  roomDefaults: {
    watchParty: {
      joinPolicy: "open",
      reactionsPolicy: "enabled",
      contentAccessRule: "open",
      capturePolicy: "best_effort",
    },
    communication: {
      contentAccessRule: "open",
      capturePolicy: "best_effort",
    },
  },
};

export const THEME_PRESET_PALETTES: Record<AppThemePreset, ThemePresetPalette> = {
  city_night: {
    accent: "#DC143C",
    surfaceTint: "rgba(220,20,60,0.2)",
    screenOverlay: "rgba(8,10,16,0.48)",
    heroOverlay: "rgba(5,7,16,0.5)",
    tabBarBackground: "rgba(8,10,16,0.82)",
    tabBarBorder: "rgba(255,255,255,0.14)",
    tabActiveTint: "#DC143C",
  },
  lake_glow: {
    accent: "#1BA6B8",
    surfaceTint: "rgba(27,166,184,0.2)",
    screenOverlay: "rgba(8,22,28,0.42)",
    heroOverlay: "rgba(8,28,34,0.46)",
    tabBarBackground: "rgba(7,28,34,0.78)",
    tabBarBorder: "rgba(163,240,252,0.24)",
    tabActiveTint: "#7EE6F5",
  },
  steel_day: {
    accent: "#5D708F",
    surfaceTint: "rgba(93,112,143,0.2)",
    screenOverlay: "rgba(26,31,38,0.32)",
    heroOverlay: "rgba(28,36,48,0.36)",
    tabBarBackground: "rgba(28,36,48,0.72)",
    tabBarBorder: "rgba(210,222,241,0.18)",
    tabActiveTint: "#C6D4EA",
  },
  theater_noir: {
    accent: "#B8A16A",
    surfaceTint: "rgba(184,161,106,0.18)",
    screenOverlay: "rgba(5,5,7,0.58)",
    heroOverlay: "rgba(3,3,6,0.62)",
    tabBarBackground: "rgba(5,5,8,0.86)",
    tabBarBorder: "rgba(224,204,150,0.2)",
    tabActiveTint: "#E4C978",
  },
  premiere_gold: {
    accent: "#E0B95B",
    surfaceTint: "rgba(224,185,91,0.2)",
    screenOverlay: "rgba(18,13,8,0.5)",
    heroOverlay: "rgba(24,16,8,0.54)",
    tabBarBackground: "rgba(18,12,8,0.82)",
    tabBarBorder: "rgba(255,224,148,0.22)",
    tabActiveTint: "#FFD780",
  },
  red_carpet: {
    accent: "#E84A5F",
    surfaceTint: "rgba(232,74,95,0.2)",
    screenOverlay: "rgba(18,5,9,0.5)",
    heroOverlay: "rgba(24,5,11,0.56)",
    tabBarBackground: "rgba(18,5,9,0.84)",
    tabBarBorder: "rgba(255,138,153,0.22)",
    tabActiveTint: "#FF7C8D",
  },
  midnight_blue: {
    accent: "#5EA8FF",
    surfaceTint: "rgba(94,168,255,0.18)",
    screenOverlay: "rgba(5,12,23,0.52)",
    heroOverlay: "rgba(5,13,28,0.56)",
    tabBarBackground: "rgba(5,12,23,0.84)",
    tabBarBorder: "rgba(134,191,255,0.2)",
    tabActiveTint: "#8EC5FF",
  },
  studio_neon: {
    accent: "#27E6A8",
    surfaceTint: "rgba(39,230,168,0.18)",
    screenOverlay: "rgba(6,10,14,0.52)",
    heroOverlay: "rgba(3,12,14,0.55)",
    tabBarBackground: "rgba(5,10,14,0.84)",
    tabBarBorder: "rgba(93,255,205,0.2)",
    tabActiveTint: "#6CFFD0",
  },
  chi_town_glow: {
    accent: "#FF5E7A",
    surfaceTint: "rgba(255,94,122,0.2)",
    screenOverlay: "rgba(12,7,18,0.5)",
    heroOverlay: "rgba(15,8,24,0.54)",
    tabBarBackground: "rgba(12,7,18,0.84)",
    tabBarBorder: "rgba(255,160,176,0.2)",
    tabActiveTint: "#FF8DA0",
  },
  skyline_glass: {
    accent: "#9AD7FF",
    surfaceTint: "rgba(154,215,255,0.18)",
    screenOverlay: "rgba(8,15,20,0.46)",
    heroOverlay: "rgba(8,16,24,0.5)",
    tabBarBackground: "rgba(8,15,20,0.78)",
    tabBarBorder: "rgba(197,232,255,0.24)",
    tabActiveTint: "#C2EAFF",
  },
  creator_spotlight: {
    accent: "#F06FD8",
    surfaceTint: "rgba(240,111,216,0.18)",
    screenOverlay: "rgba(13,8,18,0.5)",
    heroOverlay: "rgba(16,8,22,0.54)",
    tabBarBackground: "rgba(13,8,18,0.84)",
    tabBarBorder: "rgba(247,168,233,0.2)",
    tabActiveTint: "#F7A8E9",
  },
};

let cachedAppConfig: AppConfig = DEFAULT_APP_CONFIG;
setAppMonetizationRuntimeFeatures(DEFAULT_APP_CONFIG.monetization);

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === "object" && !Array.isArray(value)
);

const toText = (value: unknown, fallback: string) => {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
};

const toNullableText = (value: unknown) => {
  const normalized = String(value ?? "").trim();
  return normalized || null;
};

const normalizeThemePreset = (value: unknown): AppThemePreset => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "lake_glow") return "lake_glow";
  if (normalized === "steel_day") return "steel_day";
  if (normalized === "theater_noir") return "theater_noir";
  if (normalized === "premiere_gold") return "premiere_gold";
  if (normalized === "red_carpet") return "red_carpet";
  if (normalized === "midnight_blue") return "midnight_blue";
  if (normalized === "studio_neon") return "studio_neon";
  if (normalized === "chi_town_glow") return "chi_town_glow";
  if (normalized === "skyline_glass") return "skyline_glass";
  if (normalized === "creator_spotlight") return "creator_spotlight";
  return "city_night";
};

const normalizeBackgroundMode = (value: unknown): AppBackgroundMode => (
  String(value ?? "").trim().toLowerCase() === "skyline" ? "skyline" : "hero_art"
);

const normalizeHeroMode = (value: unknown): HomeHeroMode => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "hero_flag") return "hero_flag";
  if (normalized === "manual_title") return "manual_title";
  return "latest";
};

const normalizeTopPicksSource = (value: unknown): HomeTopPicksSource => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "top_row") return "top_row";
  if (normalized === "featured") return "featured";
  if (normalized === "trending") return "trending";
  return "recent";
};

const normalizePositiveInt = (value: unknown, fallback: number, max = 24) => {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
};

const normalizeRailOrder = (value: unknown): HomeRailKey[] => {
  const next: HomeRailKey[] = [];
  const rawList = Array.isArray(value) ? value : [];

  rawList.forEach((entry) => {
    const normalized = String(entry ?? "").trim().toLowerCase();
    if (!HOME_RAIL_KEYS.includes(normalized as HomeRailKey)) return;
    if (next.includes(normalized as HomeRailKey)) return;
    next.push(normalized as HomeRailKey);
  });

  HOME_RAIL_KEYS.forEach((key) => {
    if (!next.includes(key)) next.push(key);
  });

  return next;
};

const normalizeEnabledRails = (value: unknown): Record<HomeRailKey, boolean> => {
  const raw = isPlainObject(value) ? value : {};
  return {
    top_picks: typeof raw.top_picks === "boolean" ? raw.top_picks : DEFAULT_APP_CONFIG.home.enabledRails.top_picks,
    browse: typeof raw.browse === "boolean" ? raw.browse : DEFAULT_APP_CONFIG.home.enabledRails.browse,
    favorites: typeof raw.favorites === "boolean" ? raw.favorites : DEFAULT_APP_CONFIG.home.enabledRails.favorites,
    continue_watching: typeof raw.continue_watching === "boolean"
      ? raw.continue_watching
      : DEFAULT_APP_CONFIG.home.enabledRails.continue_watching,
  };
};

const isMissingTableError = (error: unknown) => {
  const code =
    typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";
  return code === "42P01";
};

export const normalizeAppConfig = (raw: unknown): AppConfig => {
  const config = isPlainObject(raw) ? raw : {};
  const theme = isPlainObject(config.theme) ? config.theme : {};
  const home = isPlainObject(config.home) ? config.home : {};
  const branding = isPlainObject(config.branding) ? config.branding : {};
  const features = isPlainObject(config.features) ? config.features : {};
  const runtimeControls = isPlainObject(config.runtimeControls) ? config.runtimeControls : {};
  const adsLaunch = isPlainObject(config.adsLaunch) ? config.adsLaunch : {};
  const monetization = isPlainObject(config.monetization) ? config.monetization : {};
  const roomDefaults = isPlainObject(config.roomDefaults) ? config.roomDefaults : {};
  const watchParty = isPlainObject(roomDefaults.watchParty) ? roomDefaults.watchParty : {};
  const communication = isPlainObject(roomDefaults.communication) ? roomDefaults.communication : {};

  return {
    theme: {
      preset: normalizeThemePreset(theme.preset),
      backgroundMode: normalizeBackgroundMode(theme.backgroundMode),
    },
    home: {
      heroMode: normalizeHeroMode(home.heroMode),
      manualHeroTitleId: toNullableText(home.manualHeroTitleId),
      railOrder: normalizeRailOrder(home.railOrder),
      enabledRails: normalizeEnabledRails(home.enabledRails),
      topPicksSource: normalizeTopPicksSource(home.topPicksSource),
      browseCategoryLabel: toText(home.browseCategoryLabel, DEFAULT_APP_CONFIG.home.browseCategoryLabel),
      browseCategoryQuery: toText(home.browseCategoryQuery, DEFAULT_APP_CONFIG.home.browseCategoryQuery),
      maxItemsPerRail: normalizePositiveInt(home.maxItemsPerRail, DEFAULT_APP_CONFIG.home.maxItemsPerRail),
    },
    branding: {
      // Core product naming stays code-owned even when global config is persisted.
      appDisplayName: DEFAULT_APP_CONFIG.branding.appDisplayName,
      homeHeroKicker: toText(branding.homeHeroKicker, DEFAULT_APP_CONFIG.branding.homeHeroKicker),
      watchPartyLabel: DEFAULT_APP_CONFIG.branding.watchPartyLabel,
      liveWaitingRoomTitle: DEFAULT_APP_CONFIG.branding.liveWaitingRoomTitle,
      partyWaitingRoomTitle: DEFAULT_APP_CONFIG.branding.partyWaitingRoomTitle,
      liveRoomTitle: DEFAULT_APP_CONFIG.branding.liveRoomTitle,
      partyRoomTitle: DEFAULT_APP_CONFIG.branding.partyRoomTitle,
      adminTitle: toText(branding.adminTitle, DEFAULT_APP_CONFIG.branding.adminTitle),
      adminSubtitle: toText(branding.adminSubtitle, DEFAULT_APP_CONFIG.branding.adminSubtitle),
    },
    features: resolveAppRuntimeFeatures(features),
    runtimeControls: resolveAppRuntimeControls(runtimeControls),
    adsLaunch: normalizeAdsLaunchConfig(adsLaunch),
    monetization: {
      ...resolveAppMonetizationRuntimeFeatures(monetization),
      defaultSponsorLabel: toText(monetization.defaultSponsorLabel, DEFAULT_APP_CONFIG.monetization.defaultSponsorLabel),
      premiumUpsellTitle: toText(monetization.premiumUpsellTitle, DEFAULT_APP_CONFIG.monetization.premiumUpsellTitle),
      premiumUpsellBody: toText(monetization.premiumUpsellBody, DEFAULT_APP_CONFIG.monetization.premiumUpsellBody),
    },
    roomDefaults: {
      watchParty: {
        joinPolicy: normalizeJoinPolicy(watchParty.joinPolicy),
        reactionsPolicy: normalizeReactionsPolicy(watchParty.reactionsPolicy),
        contentAccessRule: normalizeContentAccessRule(watchParty.contentAccessRule),
        capturePolicy: normalizeCapturePolicy(watchParty.capturePolicy),
      },
      communication: {
        contentAccessRule: normalizeContentAccessRule(communication.contentAccessRule),
        capturePolicy: normalizeCapturePolicy(communication.capturePolicy),
      },
    },
  };
};

export const resolveThemeConfig = (config?: Partial<AppConfig> | AppConfig | null): AppThemeConfig => (
  normalizeAppConfig(config).theme
);

export const resolveHomeConfig = (config?: Partial<AppConfig> | AppConfig | null): HomeConfig => (
  normalizeAppConfig(config).home
);

export const resolveBrandingConfig = (config?: Partial<AppConfig> | AppConfig | null): BrandingConfig => (
  normalizeAppConfig(config).branding
);

export const resolveFeatureConfig = (config?: Partial<AppConfig> | AppConfig | null): AppRuntimeFeatures => (
  normalizeAppConfig(config).features
);

export const resolveRuntimeControlsConfig = (
  config?: Partial<AppConfig> | AppConfig | null,
): AppRuntimeControls => normalizeAppConfig(config).runtimeControls;

export const resolveAdsLaunchConfigFromAppConfig = (
  config?: Partial<AppConfig> | AppConfig | null,
): AdsLaunchConfig => normalizeAppConfig(config).adsLaunch;

export const resolveMonetizationConfig = (
  config?: Partial<AppConfig> | AppConfig | null,
): AppConfig["monetization"] => normalizeAppConfig(config).monetization;

export const resolveRoomDefaultConfig = (config?: Partial<AppConfig> | AppConfig | null): RoomDefaultConfig => (
  normalizeAppConfig(config).roomDefaults
);

export const getThemePresetPalette = (preset?: AppThemePreset | string | null): ThemePresetPalette => {
  const safePreset = normalizeThemePreset(preset);
  return THEME_PRESET_PALETTES[safePreset];
};

export const getCachedAppConfig = () => cachedAppConfig;

export async function readAppConfig(): Promise<AppConfig> {
  try {
    const { data, error } = await supabase
      .from(APP_CONFIG_TABLE)
      .select("config_key,config,updated_at,updated_by")
      .eq("config_key", APP_CONFIG_GLOBAL_KEY)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error)) return cachedAppConfig;
      return cachedAppConfig;
    }

    const normalized = normalizeAppConfig(data?.config ?? {});
    cachedAppConfig = normalized;
    setAppMonetizationRuntimeFeatures(normalized.monetization);
    return normalized;
  } catch {
    return cachedAppConfig;
  }
}

export async function saveAppConfig(config: AppConfig, updatedBy?: string | null): Promise<AppConfig> {
  const normalized = normalizeAppConfig(config);
  const payload: AppConfigInsert = {
    config_key: APP_CONFIG_GLOBAL_KEY,
    config: normalized,
    updated_at: new Date().toISOString(),
    updated_by: toNullableText(updatedBy),
  };
  const { error } = await supabase
    .from(APP_CONFIG_TABLE)
    .upsert(payload, { onConflict: "config_key" });

  if (error) throw error;
  cachedAppConfig = normalized;
  setAppMonetizationRuntimeFeatures(normalized.monetization);
  return normalized;
}
