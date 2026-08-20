import {
  resolveMonetizationAccess,
  type ContentAccessDecision,
  type MonetizationTargetId,
} from "./monetization";
import {
  DEFAULT_APP_CONFIG,
  readAppConfig,
} from "./appConfig";
import type { AppRuntimeControls } from "./featureFlags";

type RuntimeControlledLiveFeature = {
  controlKey: keyof Pick<
    AppRuntimeControls,
    "live_first_enabled" | "live_watch_party_enabled" | "watch_party_live_enabled"
  >;
  targetHint: MonetizationTargetId;
  disabledTitle: string;
  disabledMessage: string;
};

export type PremiumWatchPartyFeatureAccessDecision = Omit<ContentAccessDecision, "reason"> & {
  reason: ContentAccessDecision["reason"] | "feature_disabled";
  authorityUnavailable?: boolean;
  featureDisabled?: boolean;
  runtimeControlKey?: RuntimeControlledLiveFeature["controlKey"];
  disabledTitle?: string;
  disabledMessage?: string;
};

type PremiumWatchPartyFeatureAccessOptions = {
  accessKey?: string | null;
};

export const LIVE_FIRST_PREMIUM_UPSELL_COPY = {
  title: "Premium required",
  message: "Watch-Party Live is included with Premium.",
} as const;

export const LIVE_WATCH_PARTY_PREMIUM_UPSELL_COPY = {
  title: "Premium required",
  message: "Watch-Party Live is included with Premium.",
} as const;

export const WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY = {
  title: "Premium required",
  message: "Watch-Party Live is included with Premium.",
} as const;

const RUNTIME_CONTROL_DISABLED_COPY: Record<RuntimeControlledLiveFeature["controlKey"], {
  title: string;
  message: string;
}> = {
  live_first_enabled: {
    title: "Live First paused",
    message: "Live First is temporarily paused by Chi'llywood operations. Premium access is still required when it reopens.",
  },
  live_watch_party_enabled: {
    title: "Live Watch-Party paused",
    message: "Live Watch-Party is temporarily paused by Chi'llywood operations. Premium access is still required when it reopens.",
  },
  watch_party_live_enabled: {
    title: "Watch-Party Live paused",
    message: "Watch-Party Live is temporarily paused by Chi'llywood operations. Premium access is still required when it reopens.",
  },
};

export const isRuntimeControlBlockedAccess = (
  access?: PremiumWatchPartyFeatureAccessDecision | null,
) => access?.reason === "feature_disabled"
  || access?.featureDisabled === true
  || access?.reason === "entitlement_unknown"
  || access?.authorityUnavailable === true;

export const getRuntimeControlBlockedCopy = (
  access?: PremiumWatchPartyFeatureAccessDecision | null,
) => {
  if (access?.reason === "entitlement_unknown" || access?.authorityUnavailable) {
    return {
      title: "Premium status unavailable",
      message: "We could not verify Premium for this account. Recheck access before continuing.",
    };
  }
  const key = access?.runtimeControlKey;
  const fallback = key ? RUNTIME_CONTROL_DISABLED_COPY[key] : null;
  return {
    title: String(access?.disabledTitle ?? fallback?.title ?? "Feature paused").trim(),
    message: String(
      access?.disabledMessage
      ?? fallback?.message
      ?? "This feature is temporarily paused by Chi'llywood operations.",
    ).trim(),
  };
};

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

const requireRuntimeControlledPremiumAccess = async (
  feature: RuntimeControlledLiveFeature,
  options?: PremiumWatchPartyFeatureAccessOptions,
): Promise<PremiumWatchPartyFeatureAccessDecision> => {
  const config = await readAppConfig().catch(() => DEFAULT_APP_CONFIG);
  const controls = config.runtimeControls ?? DEFAULT_APP_CONFIG.runtimeControls;
  const enabled = controls[feature.controlKey] !== false;
  const premiumAccess = await requirePremiumLiveFeatureAccess(feature.targetHint, options);

  const copy = RUNTIME_CONTROL_DISABLED_COPY[feature.controlKey] ?? {
    title: feature.disabledTitle,
    message: feature.disabledMessage,
  };

  if (!enabled) {
    return {
      ...premiumAccess,
      allowed: false,
      reason: "feature_disabled",
      requiresPremium: false,
      requiresPartyPass: false,
      featureDisabled: true,
      runtimeControlKey: feature.controlKey,
      disabledTitle: copy.title,
      disabledMessage: copy.message,
      monetization: {
        ...premiumAccess.monetization,
        issues: [
          copy.message,
          ...premiumAccess.monetization.issues.filter((issue) => issue !== copy.message),
        ],
      },
    };
  }

  if (!premiumAccess.monetization.entitlementAuthorityAvailable) {
    return {
      ...premiumAccess,
      allowed: false,
      reason: "entitlement_unknown",
      requiresPremium: false,
      requiresPartyPass: false,
      authorityUnavailable: true,
      monetization: {
        ...premiumAccess.monetization,
        canPurchase: false,
        issues: [
          "Premium authority is unavailable for the current account.",
          ...premiumAccess.monetization.issues,
        ],
      },
    };
  }

  return premiumAccess;
};

export async function requireLiveFirstPremium(
  options?: PremiumWatchPartyFeatureAccessOptions,
): Promise<PremiumWatchPartyFeatureAccessDecision> {
  return requireRuntimeControlledPremiumAccess({
    controlKey: "live_first_enabled",
    targetHint: "premium_live_access",
    disabledTitle: RUNTIME_CONTROL_DISABLED_COPY.live_first_enabled.title,
    disabledMessage: RUNTIME_CONTROL_DISABLED_COPY.live_first_enabled.message,
  }, options);
}

export async function requireLiveWatchPartyPremium(
  options?: PremiumWatchPartyFeatureAccessOptions,
): Promise<PremiumWatchPartyFeatureAccessDecision> {
  return requireRuntimeControlledPremiumAccess({
    controlKey: "live_watch_party_enabled",
    targetHint: "premium_watch_party_access",
    disabledTitle: RUNTIME_CONTROL_DISABLED_COPY.live_watch_party_enabled.title,
    disabledMessage: RUNTIME_CONTROL_DISABLED_COPY.live_watch_party_enabled.message,
  }, options);
}

export async function requireWatchPartyLivePremium(
  options?: PremiumWatchPartyFeatureAccessOptions,
): Promise<PremiumWatchPartyFeatureAccessDecision> {
  return requireRuntimeControlledPremiumAccess({
    controlKey: "watch_party_live_enabled",
    targetHint: "premium_watch_party_access",
    disabledTitle: RUNTIME_CONTROL_DISABLED_COPY.watch_party_live_enabled.title,
    disabledMessage: RUNTIME_CONTROL_DISABLED_COPY.watch_party_live_enabled.message,
  }, options);
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
