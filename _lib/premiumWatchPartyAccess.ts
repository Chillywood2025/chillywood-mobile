import {
  resolveMonetizationAccess,
  type ContentAccessDecision,
  type MonetizationTargetId,
} from "./monetization";

export type PremiumWatchPartyFeatureAccessDecision = ContentAccessDecision;

type PremiumWatchPartyFeatureAccessOptions = {
  accessKey?: string | null;
};

export const LIVE_FIRST_PREMIUM_UPSELL_COPY = {
  title: "Premium required",
  message: "Live rooms are a Premium feature. Upgrade to go live and join full live rooms.",
} as const;

export const LIVE_WATCH_PARTY_PREMIUM_UPSELL_COPY = {
  title: "Premium required",
  message: "Live Watch-Party is Premium. Upgrade to join full live watch parties.",
} as const;

export const WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY = {
  title: "Premium required",
  message: "Watch-Party Live is Premium. Upgrade to start or join watch-party rooms.",
} as const;

// Historical file name: this now centralizes all full live/watch-party Premium gates.
const requirePremiumLiveFeatureAccess = (
  targetHint: MonetizationTargetId,
  options?: PremiumWatchPartyFeatureAccessOptions,
) => resolveMonetizationAccess({
  accessRule: "premium",
  accessKey: String(options?.accessKey ?? "").trim() || undefined,
  targetHint,
  strictEntitlementRequired: true,
});

export async function requireLiveFirstPremium(
  options?: PremiumWatchPartyFeatureAccessOptions,
): Promise<PremiumWatchPartyFeatureAccessDecision> {
  return requirePremiumLiveFeatureAccess("premium_live_access", options);
}

export async function requireLiveWatchPartyPremium(
  options?: PremiumWatchPartyFeatureAccessOptions,
): Promise<PremiumWatchPartyFeatureAccessDecision> {
  return requirePremiumLiveFeatureAccess("premium_watch_party_access", options);
}

export async function requireWatchPartyLivePremium(
  options?: PremiumWatchPartyFeatureAccessOptions,
): Promise<PremiumWatchPartyFeatureAccessDecision> {
  return requirePremiumLiveFeatureAccess("premium_watch_party_access", options);
}

export async function canUseLiveFirst(options?: PremiumWatchPartyFeatureAccessOptions) {
  const access = await requireLiveFirstPremium(options);
  return access.allowed;
}

export async function canUseLiveWatchParty(options?: PremiumWatchPartyFeatureAccessOptions) {
  const access = await requireLiveWatchPartyPremium(options);
  return access.allowed;
}

export async function canUseWatchPartyLive(options?: PremiumWatchPartyFeatureAccessOptions) {
  const access = await requireWatchPartyLivePremium(options);
  return access.allowed;
}
