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
  algorithmRankingV1Enabled: "algorithm_ranking_v1_enabled",
  algorithmRankingFreshnessWeight: "algorithm_ranking_freshness_weight",
  algorithmRankingEngagementWeight: "algorithm_ranking_engagement_weight",
  algorithmRankingCompletionWeight: "algorithm_ranking_completion_weight",
  algorithmRankingCreatorTrustWeight: "algorithm_ranking_creator_trust_weight",
  algorithmRankingLiveBoostWeight: "algorithm_ranking_live_boost_weight",
  algorithmRankingSafetyPenaltyWeight: "algorithm_ranking_safety_penalty_weight",
  algorithmRankingAlreadySeenPenaltyWeight: "algorithm_ranking_already_seen_penalty_weight",
  algorithmRankingNewCreatorBoostWeight: "algorithm_ranking_new_creator_boost_weight",
  algorithmRankingDiversityPenaltyWeight: "algorithm_ranking_diversity_penalty_weight",
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
  [REMOTE_CONFIG_KEYS.algorithmRankingV1Enabled]: false,
  [REMOTE_CONFIG_KEYS.algorithmRankingFreshnessWeight]: 0.16,
  [REMOTE_CONFIG_KEYS.algorithmRankingEngagementWeight]: 0.2,
  [REMOTE_CONFIG_KEYS.algorithmRankingCompletionWeight]: 0.14,
  [REMOTE_CONFIG_KEYS.algorithmRankingCreatorTrustWeight]: 0.14,
  [REMOTE_CONFIG_KEYS.algorithmRankingLiveBoostWeight]: 0.12,
  [REMOTE_CONFIG_KEYS.algorithmRankingSafetyPenaltyWeight]: 1,
  [REMOTE_CONFIG_KEYS.algorithmRankingAlreadySeenPenaltyWeight]: 0.2,
  [REMOTE_CONFIG_KEYS.algorithmRankingNewCreatorBoostWeight]: 0.08,
  [REMOTE_CONFIG_KEYS.algorithmRankingDiversityPenaltyWeight]: 0.2,
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
  premiumPurchaseEnabled: boolean;
  paidContentCheckoutEnabled: boolean;
  creatorPricingEnabled: boolean;
  tipsEnabled: boolean;
  merchStoreEnabled: boolean;
  cashoutEnabled: boolean;
  payoutsEnabled: boolean;
  stripeConnectProductionEnabled: boolean;
  liveMoneyEnabled: boolean;
} = {
  premiumEnabled: true,
  partyPassEnabled: true,
  sponsorPlacementsEnabled: false,
  playerBannerEnabled: false,
  playerMidRollEnabled: false,
  premiumPurchaseEnabled: false,
  paidContentCheckoutEnabled: false,
  creatorPricingEnabled: false,
  tipsEnabled: false,
  merchStoreEnabled: false,
  cashoutEnabled: false,
  payoutsEnabled: false,
  stripeConnectProductionEnabled: false,
  liveMoneyEnabled: false,
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
  premiumPurchaseEnabled: typeof overrides?.premiumPurchaseEnabled === "boolean"
    ? overrides.premiumPurchaseEnabled
    : APP_MONETIZATION_RUNTIME_DEFAULTS.premiumPurchaseEnabled,
  paidContentCheckoutEnabled: typeof overrides?.paidContentCheckoutEnabled === "boolean"
    ? overrides.paidContentCheckoutEnabled
    : APP_MONETIZATION_RUNTIME_DEFAULTS.paidContentCheckoutEnabled,
  creatorPricingEnabled: typeof overrides?.creatorPricingEnabled === "boolean"
    ? overrides.creatorPricingEnabled
    : APP_MONETIZATION_RUNTIME_DEFAULTS.creatorPricingEnabled,
  tipsEnabled: typeof overrides?.tipsEnabled === "boolean"
    ? overrides.tipsEnabled
    : APP_MONETIZATION_RUNTIME_DEFAULTS.tipsEnabled,
  merchStoreEnabled: typeof overrides?.merchStoreEnabled === "boolean"
    ? overrides.merchStoreEnabled
    : APP_MONETIZATION_RUNTIME_DEFAULTS.merchStoreEnabled,
  cashoutEnabled: typeof overrides?.cashoutEnabled === "boolean"
    ? overrides.cashoutEnabled
    : APP_MONETIZATION_RUNTIME_DEFAULTS.cashoutEnabled,
  payoutsEnabled: typeof overrides?.payoutsEnabled === "boolean"
    ? overrides.payoutsEnabled
    : APP_MONETIZATION_RUNTIME_DEFAULTS.payoutsEnabled,
  stripeConnectProductionEnabled: typeof overrides?.stripeConnectProductionEnabled === "boolean"
    ? overrides.stripeConnectProductionEnabled
    : APP_MONETIZATION_RUNTIME_DEFAULTS.stripeConnectProductionEnabled,
  liveMoneyEnabled: typeof overrides?.liveMoneyEnabled === "boolean"
    ? overrides.liveMoneyEnabled
    : APP_MONETIZATION_RUNTIME_DEFAULTS.liveMoneyEnabled,
});

export const getAppMonetizationRuntimeFeatures = () => cachedAppMonetizationRuntimeFeatures;

export const setAppMonetizationRuntimeFeatures = (
  overrides?: Partial<Record<keyof AppMonetizationRuntimeFeatures, unknown>> | null,
) => {
  cachedAppMonetizationRuntimeFeatures = resolveAppMonetizationRuntimeFeatures(overrides);
  return cachedAppMonetizationRuntimeFeatures;
};
