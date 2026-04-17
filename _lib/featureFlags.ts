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
