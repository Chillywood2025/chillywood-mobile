import {
  resolveMonetizationAccess,
  type ContentAccessDecision,
} from "./monetization";

export type PremiumWatchPartyFeatureAccessDecision = ContentAccessDecision;

type PremiumWatchPartyFeatureAccessOptions = {
  accessKey?: string | null;
};

const WATCH_PARTY_PREMIUM_TARGET_HINT = "premium_watch_party_access" as const;

const requirePremiumWatchPartyFeatureAccess = (
  options?: PremiumWatchPartyFeatureAccessOptions,
) => resolveMonetizationAccess({
  accessRule: "premium",
  accessKey: String(options?.accessKey ?? "").trim() || undefined,
  targetHint: WATCH_PARTY_PREMIUM_TARGET_HINT,
});

export async function requireLiveWatchPartyPremium(
  options?: PremiumWatchPartyFeatureAccessOptions,
): Promise<PremiumWatchPartyFeatureAccessDecision> {
  return requirePremiumWatchPartyFeatureAccess(options);
}

export async function requireWatchPartyLivePremium(
  options?: PremiumWatchPartyFeatureAccessOptions,
): Promise<PremiumWatchPartyFeatureAccessDecision> {
  return requirePremiumWatchPartyFeatureAccess(options);
}

export async function canUseLiveWatchParty(options?: PremiumWatchPartyFeatureAccessOptions) {
  const access = await requireLiveWatchPartyPremium(options);
  return access.allowed;
}

export async function canUseWatchPartyLive(options?: PremiumWatchPartyFeatureAccessOptions) {
  const access = await requireWatchPartyLivePremium(options);
  return access.allowed;
}
