export const FEATURE_FLAGS = {
  monetization: {
    subscriptions: true,
    partyPass: true,
    ads: true,
    preRollAds: true,
    midRollAds: true,
    bannerAds: true,
  },
} as const;

export const REMOTE_CONFIG_KEYS = {
  liveWaitingRoomEnabled: "live_waiting_room_enabled",
  partyWaitingRoomEnabled: "party_waiting_room_enabled",
  watchPartyLiveHandoffV2: "watch_party_live_handoff_v2",
  chillyChatExpandedV1: "chilly_chat_expanded_v1",
  aiChatSuggestionsV1: "ai_chat_suggestions_v1",
} as const;

export const REMOTE_CONFIG_DEFAULTS: Record<
  (typeof REMOTE_CONFIG_KEYS)[keyof typeof REMOTE_CONFIG_KEYS],
  boolean | string | number
> = {
  [REMOTE_CONFIG_KEYS.liveWaitingRoomEnabled]: false,
  [REMOTE_CONFIG_KEYS.partyWaitingRoomEnabled]: false,
  [REMOTE_CONFIG_KEYS.watchPartyLiveHandoffV2]: false,
  [REMOTE_CONFIG_KEYS.chillyChatExpandedV1]: false,
  [REMOTE_CONFIG_KEYS.aiChatSuggestionsV1]: false,
};

export type FeatureFlags = typeof FEATURE_FLAGS;

export const APP_RUNTIME_FEATURE_DEFAULTS: {
  watchPartyEnabled: boolean;
  communicationEnabled: boolean;
  favoritesEnabled: boolean;
  continueWatchingEnabled: boolean;
  creatorSettingsEnabled: boolean;
} = {
  watchPartyEnabled: true,
  communicationEnabled: true,
  favoritesEnabled: true,
  continueWatchingEnabled: true,
  creatorSettingsEnabled: true,
};

export type AppRuntimeFeatures = typeof APP_RUNTIME_FEATURE_DEFAULTS;

export const APP_RUNTIME_CONTROL_DEFAULTS: {
  new_accounts_enabled: boolean;
  uploads_enabled: boolean;
  comments_enabled: boolean;
  attachments_enabled: boolean;
  chat_enabled: boolean;
  chat_attachments_enabled: boolean;
  live_first_enabled: boolean;
  live_watch_party_enabled: boolean;
  watch_party_live_enabled: boolean;
  ads_enabled: boolean;
  creator_posting_enabled: boolean;
  profile_posting_enabled: boolean;
  max_upload_size_mb: number;
  premium_required_for_live: boolean;
  premium_required_for_watch_party: boolean;
} = {
  new_accounts_enabled: true,
  uploads_enabled: true,
  comments_enabled: true,
  attachments_enabled: true,
  chat_enabled: true,
  chat_attachments_enabled: true,
  live_first_enabled: true,
  live_watch_party_enabled: true,
  watch_party_live_enabled: true,
  ads_enabled: false,
  creator_posting_enabled: true,
  profile_posting_enabled: true,
  max_upload_size_mb: 5120,
  premium_required_for_live: true,
  premium_required_for_watch_party: true,
};

export type AppRuntimeControls = typeof APP_RUNTIME_CONTROL_DEFAULTS;

export const APP_MONETIZATION_RUNTIME_DEFAULTS: {
  premiumEnabled: boolean;
  partyPassEnabled: boolean;
  sponsorPlacementsEnabled: boolean;
  playerBannerEnabled: boolean;
  playerMidRollEnabled: boolean;
} = {
  premiumEnabled: true,
  partyPassEnabled: true,
  sponsorPlacementsEnabled: false,
  playerBannerEnabled: false,
  playerMidRollEnabled: false,
};

export type AppMonetizationRuntimeFeatures = typeof APP_MONETIZATION_RUNTIME_DEFAULTS;

let cachedAppMonetizationRuntimeFeatures: AppMonetizationRuntimeFeatures = APP_MONETIZATION_RUNTIME_DEFAULTS;

export const resolveAppRuntimeFeatures = (
  overrides?: Partial<Record<keyof AppRuntimeFeatures, unknown>> | null,
): AppRuntimeFeatures => ({
  watchPartyEnabled: typeof overrides?.watchPartyEnabled === "boolean"
    ? overrides.watchPartyEnabled
    : APP_RUNTIME_FEATURE_DEFAULTS.watchPartyEnabled,
  communicationEnabled: typeof overrides?.communicationEnabled === "boolean"
    ? overrides.communicationEnabled
    : APP_RUNTIME_FEATURE_DEFAULTS.communicationEnabled,
  favoritesEnabled: typeof overrides?.favoritesEnabled === "boolean"
    ? overrides.favoritesEnabled
    : APP_RUNTIME_FEATURE_DEFAULTS.favoritesEnabled,
  continueWatchingEnabled: typeof overrides?.continueWatchingEnabled === "boolean"
    ? overrides.continueWatchingEnabled
    : APP_RUNTIME_FEATURE_DEFAULTS.continueWatchingEnabled,
  creatorSettingsEnabled: typeof overrides?.creatorSettingsEnabled === "boolean"
    ? overrides.creatorSettingsEnabled
    : APP_RUNTIME_FEATURE_DEFAULTS.creatorSettingsEnabled,
});

const resolveRuntimeControlBoolean = (
  overrides: Partial<Record<keyof AppRuntimeControls, unknown>> | null | undefined,
  key: keyof AppRuntimeControls,
) => (
  typeof overrides?.[key] === "boolean"
    ? overrides[key] as boolean
    : APP_RUNTIME_CONTROL_DEFAULTS[key] as boolean
);

const resolveRuntimeControlPositiveInt = (
  value: unknown,
  fallback: number,
) => {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

export const resolveAppRuntimeControls = (
  overrides?: Partial<Record<keyof AppRuntimeControls, unknown>> | null,
): AppRuntimeControls => ({
  new_accounts_enabled: resolveRuntimeControlBoolean(overrides, "new_accounts_enabled"),
  uploads_enabled: resolveRuntimeControlBoolean(overrides, "uploads_enabled"),
  comments_enabled: resolveRuntimeControlBoolean(overrides, "comments_enabled"),
  attachments_enabled: resolveRuntimeControlBoolean(overrides, "attachments_enabled"),
  chat_enabled: resolveRuntimeControlBoolean(overrides, "chat_enabled"),
  chat_attachments_enabled: resolveRuntimeControlBoolean(overrides, "chat_attachments_enabled"),
  live_first_enabled: resolveRuntimeControlBoolean(overrides, "live_first_enabled"),
  live_watch_party_enabled: resolveRuntimeControlBoolean(overrides, "live_watch_party_enabled"),
  watch_party_live_enabled: resolveRuntimeControlBoolean(overrides, "watch_party_live_enabled"),
  ads_enabled: resolveRuntimeControlBoolean(overrides, "ads_enabled"),
  creator_posting_enabled: resolveRuntimeControlBoolean(overrides, "creator_posting_enabled"),
  profile_posting_enabled: resolveRuntimeControlBoolean(overrides, "profile_posting_enabled"),
  max_upload_size_mb: resolveRuntimeControlPositiveInt(
    overrides?.max_upload_size_mb,
    APP_RUNTIME_CONTROL_DEFAULTS.max_upload_size_mb,
  ),
  premium_required_for_live: resolveRuntimeControlBoolean(overrides, "premium_required_for_live"),
  premium_required_for_watch_party: resolveRuntimeControlBoolean(overrides, "premium_required_for_watch_party"),
});

export const resolveAppMonetizationRuntimeFeatures = (
  overrides?: Partial<Record<keyof AppMonetizationRuntimeFeatures, unknown>> | null,
): AppMonetizationRuntimeFeatures => ({
  premiumEnabled: typeof overrides?.premiumEnabled === "boolean"
    ? overrides.premiumEnabled
    : APP_MONETIZATION_RUNTIME_DEFAULTS.premiumEnabled,
  partyPassEnabled: typeof overrides?.partyPassEnabled === "boolean"
    ? overrides.partyPassEnabled
    : APP_MONETIZATION_RUNTIME_DEFAULTS.partyPassEnabled,
  sponsorPlacementsEnabled: typeof overrides?.sponsorPlacementsEnabled === "boolean"
    ? overrides.sponsorPlacementsEnabled
    : APP_MONETIZATION_RUNTIME_DEFAULTS.sponsorPlacementsEnabled,
  playerBannerEnabled: typeof overrides?.playerBannerEnabled === "boolean"
    ? overrides.playerBannerEnabled
    : APP_MONETIZATION_RUNTIME_DEFAULTS.playerBannerEnabled,
  playerMidRollEnabled: typeof overrides?.playerMidRollEnabled === "boolean"
    ? overrides.playerMidRollEnabled
    : APP_MONETIZATION_RUNTIME_DEFAULTS.playerMidRollEnabled,
});

export const getAppMonetizationRuntimeFeatures = () => cachedAppMonetizationRuntimeFeatures;

export const setAppMonetizationRuntimeFeatures = (
  overrides?: Partial<Record<keyof AppMonetizationRuntimeFeatures, unknown>> | null,
) => {
  cachedAppMonetizationRuntimeFeatures = resolveAppMonetizationRuntimeFeatures(overrides);
  return cachedAppMonetizationRuntimeFeatures;
};
