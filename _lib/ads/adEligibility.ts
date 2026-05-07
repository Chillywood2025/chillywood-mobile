import {
  ADS_ALLOWED_CANDIDATE_ROUTE_PATHS,
  ADS_FORBIDDEN_ROUTE_PREFIXES,
  ADS_LAUNCH_CONFIG_DEFAULTS,
  type AdsLaunchConfig,
  type AdsPlacementKind,
} from "./adConfig";
import {
  DISCONNECTED_PLACEHOLDER_AD_STATUS,
  createAdProviderStatus,
  type AdProviderStatus,
} from "./adProvider";
import { getAdCapSnapshot, getAdSessionSnapshot } from "./adSession";
import { resolveMonetizationAccess, type UserPlan } from "../monetization";

export type AdAppActivityState = "active" | "inactive" | "background" | "unknown";

export type AdForbiddenContextFlags = {
  activeVideoPlayback?: boolean | null;
  activeLiveKitRoom?: boolean | null;
  typingOrCommenting?: boolean | null;
  uploadActive?: boolean | null;
  paymentOrSubscriptionScreenActive?: boolean | null;
  adminSurfaceActive?: boolean | null;
  channelStudioSurfaceActive?: boolean | null;
};

export type AdFreeStatus = {
  isAdFree: boolean | null;
  reason: string;
  plan?: UserPlan | null;
};

export type AdEligibilityOptions = {
  placementKind: AdsPlacementKind;
  routePath?: string | null;
  appState?: AdAppActivityState | null;
  userId?: string | null;
  userPlan?: UserPlan | null;
  isAdFree?: boolean | null;
  forbiddenContexts?: AdForbiddenContextFlags | null;
  config?: AdsLaunchConfig | null;
  providerStatus?: AdProviderStatus | null;
  activeBrowsingSeconds?: number;
  now?: Date;
};

export type AdEligibilityResult = {
  eligible: boolean;
  reason: string;
  remainingSessionCount: number;
  remainingDailyCount: number;
  activeBrowsingSeconds: number;
  providerStatus: AdProviderStatus;
};

const REQUIRED_FORBIDDEN_CONTEXT_KEYS: (keyof AdForbiddenContextFlags)[] = [
  "activeVideoPlayback",
  "activeLiveKitRoom",
  "typingOrCommenting",
  "uploadActive",
  "paymentOrSubscriptionScreenActive",
  "adminSurfaceActive",
  "channelStudioSurfaceActive",
];

export const normalizeAdRoutePath = (routePath?: string | null) => {
  const raw = String(routePath ?? "").trim();
  if (!raw) return "";

  const withoutQuery = raw.split("?")[0]?.split("#")[0] ?? "";
  const withLeadingSlash = withoutQuery.startsWith("/") ? withoutQuery : `/${withoutQuery}`;
  return withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
};

export const isForbiddenAdRoute = (routePath?: string | null) => {
  const normalized = normalizeAdRoutePath(routePath);
  if (!normalized) return true;

  return ADS_FORBIDDEN_ROUTE_PREFIXES.some((prefix) => (
    normalized === prefix || normalized.startsWith(`${prefix}/`)
  ));
};

export const isAllowedAdCandidateRoute = (routePath?: string | null) => {
  const normalized = normalizeAdRoutePath(routePath);
  return ADS_ALLOWED_CANDIDATE_ROUTE_PATHS.some((path) => normalized === path);
};

const getUnknownForbiddenContextKey = (
  contexts?: AdForbiddenContextFlags | null,
) => {
  if (!contexts) return "forbidden_contexts";

  return REQUIRED_FORBIDDEN_CONTEXT_KEYS.find((key) => typeof contexts[key] !== "boolean") ?? null;
};

const getActiveForbiddenContextKey = (
  contexts: AdForbiddenContextFlags,
) => REQUIRED_FORBIDDEN_CONTEXT_KEYS.find((key) => contexts[key] === true) ?? null;

const inactiveResult = (
  reason: string,
  providerStatus: AdProviderStatus,
  activeBrowsingSeconds: number,
): AdEligibilityResult => ({
  eligible: false,
  reason,
  remainingSessionCount: 0,
  remainingDailyCount: 0,
  activeBrowsingSeconds,
  providerStatus,
});

export async function resolveCurrentUserAdFreeStatus(options?: {
  isAdFree?: boolean | null;
  userPlan?: UserPlan | null;
}): Promise<AdFreeStatus> {
  if (typeof options?.isAdFree === "boolean") {
    return {
      isAdFree: options.isAdFree,
      reason: options.isAdFree ? "provided_ad_free" : "provided_free",
      plan: options.userPlan ?? null,
    };
  }

  if (typeof options?.userPlan?.adFree === "boolean") {
    return {
      isAdFree: options.userPlan.adFree,
      reason: options.userPlan.adFree ? "plan_ad_free" : "plan_free",
      plan: options.userPlan,
    };
  }

  try {
    const access = await resolveMonetizationAccess({
      accessRule: "premium",
      targetHint: "premium_subscription",
      strictEntitlementRequired: true,
    });

    return {
      isAdFree: access.plan.adFree,
      reason: access.plan.adFree ? "premium_entitlement_ad_free" : "no_premium_entitlement",
      plan: access.plan,
    };
  } catch {
    return {
      isAdFree: null,
      reason: "premium_truth_unavailable",
      plan: null,
    };
  }
}

export const shouldTrackActiveBrowsingTime = (options: {
  routePath?: string | null;
  appState?: AdAppActivityState | null;
  isAdFree?: boolean | null;
  forbiddenContexts?: AdForbiddenContextFlags | null;
  config?: AdsLaunchConfig | null;
}) => {
  const config = options.config ?? ADS_LAUNCH_CONFIG_DEFAULTS;
  if (!config.ads_enabled) return false;
  if (options.appState !== "active") return false;
  if (options.isAdFree !== false) return false;
  if (isForbiddenAdRoute(options.routePath) || !isAllowedAdCandidateRoute(options.routePath)) return false;

  const unknownContext = getUnknownForbiddenContextKey(options.forbiddenContexts);
  if (unknownContext) return false;

  return !getActiveForbiddenContextKey(options.forbiddenContexts as AdForbiddenContextFlags);
};

export async function evaluateAdEligibility(
  options: AdEligibilityOptions,
): Promise<AdEligibilityResult> {
  const config = options.config ?? ADS_LAUNCH_CONFIG_DEFAULTS;
  const activeBrowsingSeconds = Math.max(
    0,
    Math.floor(options.activeBrowsingSeconds ?? getAdSessionSnapshot().activeBrowsingSeconds),
  );
  const providerStatus = options.providerStatus
    ?? (config.ads_provider === "placeholder"
      ? DISCONNECTED_PLACEHOLDER_AD_STATUS
      : createAdProviderStatus(
          config.ads_provider,
          false,
          "not_connected",
          "Configured ad provider is not connected.",
        ));

  if (!config.ads_enabled) {
    return inactiveResult("ads_disabled", providerStatus, activeBrowsingSeconds);
  }

  if (options.placementKind === "interstitial" && !config.interstitial_enabled) {
    return inactiveResult("interstitial_disabled", providerStatus, activeBrowsingSeconds);
  }

  if (options.placementKind === "native_feed" && !config.native_feed_enabled) {
    return inactiveResult("native_feed_disabled", providerStatus, activeBrowsingSeconds);
  }

  if (!config.premium_users_ad_free) {
    return inactiveResult("premium_ad_free_guard_not_enforced", providerStatus, activeBrowsingSeconds);
  }

  const adFreeStatus = await resolveCurrentUserAdFreeStatus({
    isAdFree: options.isAdFree,
    userPlan: options.userPlan,
  });

  if (adFreeStatus.isAdFree === null) {
    return inactiveResult(adFreeStatus.reason, providerStatus, activeBrowsingSeconds);
  }

  if (adFreeStatus.isAdFree) {
    return inactiveResult("premium_ad_free", providerStatus, activeBrowsingSeconds);
  }

  if (!providerStatus.isConnected) {
    return inactiveResult("provider_not_connected", providerStatus, activeBrowsingSeconds);
  }

  if (providerStatus.provider !== config.ads_provider) {
    return inactiveResult("provider_config_mismatch", providerStatus, activeBrowsingSeconds);
  }

  if (options.appState !== "active") {
    return inactiveResult("app_not_active", providerStatus, activeBrowsingSeconds);
  }

  if (isForbiddenAdRoute(options.routePath)) {
    return inactiveResult("forbidden_route", providerStatus, activeBrowsingSeconds);
  }

  if (!isAllowedAdCandidateRoute(options.routePath)) {
    return inactiveResult("surface_not_enabled", providerStatus, activeBrowsingSeconds);
  }

  const unknownContext = getUnknownForbiddenContextKey(options.forbiddenContexts);
  if (unknownContext) {
    return inactiveResult(`unknown_${unknownContext}`, providerStatus, activeBrowsingSeconds);
  }

  const activeForbiddenContext = getActiveForbiddenContextKey(options.forbiddenContexts as AdForbiddenContextFlags);
  if (activeForbiddenContext) {
    return inactiveResult(`forbidden_context_${activeForbiddenContext}`, providerStatus, activeBrowsingSeconds);
  }

  const cap = await getAdCapSnapshot(options.placementKind, {
    config,
    userId: options.userId,
    activeBrowsingSeconds,
    now: options.now,
  });

  if (options.placementKind === "interstitial" && cap.firstInterstitialDelayRemainingSeconds > 0) {
    return {
      eligible: false,
      reason: "first_interstitial_delay",
      remainingSessionCount: cap.remainingSessionCount,
      remainingDailyCount: cap.remainingDailyCount,
      activeBrowsingSeconds: cap.activeBrowsingSeconds,
      providerStatus,
    };
  }

  if (options.placementKind === "interstitial" && cap.interstitialSpacingRemainingSeconds > 0) {
    return {
      eligible: false,
      reason: "interstitial_spacing",
      remainingSessionCount: cap.remainingSessionCount,
      remainingDailyCount: cap.remainingDailyCount,
      activeBrowsingSeconds: cap.activeBrowsingSeconds,
      providerStatus,
    };
  }

  if (cap.remainingSessionCount <= 0) {
    return {
      eligible: false,
      reason: "session_cap_exhausted",
      remainingSessionCount: cap.remainingSessionCount,
      remainingDailyCount: cap.remainingDailyCount,
      activeBrowsingSeconds: cap.activeBrowsingSeconds,
      providerStatus,
    };
  }

  if (cap.remainingDailyCount <= 0) {
    return {
      eligible: false,
      reason: "daily_cap_exhausted",
      remainingSessionCount: cap.remainingSessionCount,
      remainingDailyCount: cap.remainingDailyCount,
      activeBrowsingSeconds: cap.activeBrowsingSeconds,
      providerStatus,
    };
  }

  return {
    eligible: true,
    reason: "eligible",
    remainingSessionCount: cap.remainingSessionCount,
    remainingDailyCount: cap.remainingDailyCount,
    activeBrowsingSeconds: cap.activeBrowsingSeconds,
    providerStatus,
  };
}

