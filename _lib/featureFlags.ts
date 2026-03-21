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

export type FeatureFlags = typeof FEATURE_FLAGS;
