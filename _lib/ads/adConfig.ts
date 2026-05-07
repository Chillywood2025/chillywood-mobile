export type AdsProviderKey = "placeholder" | "applovin_max";
export type AdsPlacementKind = "interstitial" | "native_feed";

export type AdsLaunchConfig = {
  ads_enabled: boolean;
  ads_provider: AdsProviderKey;
  interstitial_enabled: boolean;
  native_feed_enabled: boolean;
  session_interstitial_base_cap: number;
  session_native_base_cap: number;
  long_use_minutes: number;
  long_use_interstitial_extra_cap: number;
  long_use_native_extra_cap: number;
  daily_interstitial_cap: number;
  daily_native_cap: number;
  min_seconds_before_first_interstitial: number;
  min_seconds_between_interstitials: number;
  premium_users_ad_free: boolean;
  ctv_ads_enabled_later: boolean;
  creator_page_ads_enabled_later: boolean;
  sponsor_slots_enabled_later: boolean;
};

export const ADS_LAUNCH_CONFIG_DEFAULTS: AdsLaunchConfig = {
  ads_enabled: false,
  ads_provider: "placeholder",
  interstitial_enabled: true,
  native_feed_enabled: true,
  session_interstitial_base_cap: 3,
  session_native_base_cap: 1,
  long_use_minutes: 120,
  long_use_interstitial_extra_cap: 2,
  long_use_native_extra_cap: 1,
  daily_interstitial_cap: 6,
  daily_native_cap: 3,
  min_seconds_before_first_interstitial: 180,
  min_seconds_between_interstitials: 600,
  premium_users_ad_free: true,
  ctv_ads_enabled_later: false,
  creator_page_ads_enabled_later: false,
  sponsor_slots_enabled_later: false,
};

export const ADS_FORBIDDEN_ROUTE_PREFIXES = [
  "/admin",
  "/channel-studio",
  "/channel-settings",
  "/profile",
  "/player",
  "/watch-party",
  "/subscribe",
  "/chat",
] as const;

export const ADS_ALLOWED_CANDIDATE_ROUTE_PATHS = [
  "/",
  "/explore",
] as const;

const toBoolean = (value: unknown, fallback: boolean) => (
  typeof value === "boolean" ? value : fallback
);

const toNonNegativeInt = (value: unknown, fallback: number) => {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

export const normalizeAdsProviderKey = (value: unknown): AdsProviderKey => {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "applovin_max") return "applovin_max";
  return "placeholder";
};

export function resolveAdsLaunchConfig(
  overrides?: Partial<Record<keyof AdsLaunchConfig, unknown>> | null,
): AdsLaunchConfig {
  const raw = overrides ?? {};

  return {
    ads_enabled: toBoolean(raw.ads_enabled, ADS_LAUNCH_CONFIG_DEFAULTS.ads_enabled),
    ads_provider: normalizeAdsProviderKey(raw.ads_provider ?? ADS_LAUNCH_CONFIG_DEFAULTS.ads_provider),
    interstitial_enabled: toBoolean(raw.interstitial_enabled, ADS_LAUNCH_CONFIG_DEFAULTS.interstitial_enabled),
    native_feed_enabled: toBoolean(raw.native_feed_enabled, ADS_LAUNCH_CONFIG_DEFAULTS.native_feed_enabled),
    session_interstitial_base_cap: toNonNegativeInt(
      raw.session_interstitial_base_cap,
      ADS_LAUNCH_CONFIG_DEFAULTS.session_interstitial_base_cap,
    ),
    session_native_base_cap: toNonNegativeInt(
      raw.session_native_base_cap,
      ADS_LAUNCH_CONFIG_DEFAULTS.session_native_base_cap,
    ),
    long_use_minutes: toNonNegativeInt(raw.long_use_minutes, ADS_LAUNCH_CONFIG_DEFAULTS.long_use_minutes),
    long_use_interstitial_extra_cap: toNonNegativeInt(
      raw.long_use_interstitial_extra_cap,
      ADS_LAUNCH_CONFIG_DEFAULTS.long_use_interstitial_extra_cap,
    ),
    long_use_native_extra_cap: toNonNegativeInt(
      raw.long_use_native_extra_cap,
      ADS_LAUNCH_CONFIG_DEFAULTS.long_use_native_extra_cap,
    ),
    daily_interstitial_cap: toNonNegativeInt(
      raw.daily_interstitial_cap,
      ADS_LAUNCH_CONFIG_DEFAULTS.daily_interstitial_cap,
    ),
    daily_native_cap: toNonNegativeInt(raw.daily_native_cap, ADS_LAUNCH_CONFIG_DEFAULTS.daily_native_cap),
    min_seconds_before_first_interstitial: toNonNegativeInt(
      raw.min_seconds_before_first_interstitial,
      ADS_LAUNCH_CONFIG_DEFAULTS.min_seconds_before_first_interstitial,
    ),
    min_seconds_between_interstitials: toNonNegativeInt(
      raw.min_seconds_between_interstitials,
      ADS_LAUNCH_CONFIG_DEFAULTS.min_seconds_between_interstitials,
    ),
    premium_users_ad_free: toBoolean(raw.premium_users_ad_free, ADS_LAUNCH_CONFIG_DEFAULTS.premium_users_ad_free),
    ctv_ads_enabled_later: toBoolean(
      raw.ctv_ads_enabled_later,
      ADS_LAUNCH_CONFIG_DEFAULTS.ctv_ads_enabled_later,
    ),
    creator_page_ads_enabled_later: toBoolean(
      raw.creator_page_ads_enabled_later,
      ADS_LAUNCH_CONFIG_DEFAULTS.creator_page_ads_enabled_later,
    ),
    sponsor_slots_enabled_later: toBoolean(
      raw.sponsor_slots_enabled_later,
      ADS_LAUNCH_CONFIG_DEFAULTS.sponsor_slots_enabled_later,
    ),
  };
}

export const getAdsLaunchConfig = (
  overrides?: Partial<Record<keyof AdsLaunchConfig, unknown>> | null,
) => resolveAdsLaunchConfig(overrides);

