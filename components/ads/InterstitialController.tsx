import { usePathname } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  ADS_LAUNCH_CONFIG_DEFAULTS,
  type AdsLaunchConfig,
} from "../../_lib/ads/adConfig";
import {
  evaluateAdEligibility,
  normalizeAdRoutePath,
  resolveCurrentUserAdFreeStatus,
  type AdAppActivityState,
  type AdEligibilityResult,
  type AdForbiddenContextFlags,
} from "../../_lib/ads/adEligibility";
import {
  type AdProvider,
  type AdProviderResult,
  type AdProviderStatus,
} from "../../_lib/ads/adProvider";
import {
  recordPlaceholderAdShow,
  type RecordPlaceholderAdShowResult,
} from "../../_lib/ads/adSession";
import { placeholderAdProvider } from "../../_lib/ads/providers/placeholder";
import type { UserPlan } from "../../_lib/monetization";
import { useOptionalSession } from "../../_lib/session";
import { useActiveBrowsingTime } from "../../hooks/useActiveBrowsingTime";
import { useAdsLaunchConfig } from "../../hooks/useAdsLaunchConfig";

const DEFAULT_INTERSTITIAL_FORBIDDEN_CONTEXTS: AdForbiddenContextFlags = {
  activeVideoPlayback: false,
  activeLiveKitRoom: false,
  typingOrCommenting: false,
  uploadActive: false,
  paymentOrSubscriptionScreenActive: false,
  adminSurfaceActive: false,
  channelStudioSurfaceActive: false,
};

const normalizeAppState = (state: AppStateStatus): AdAppActivityState => (
  state === "active" ? "active" : state === "background" ? "background" : "inactive"
);

export type InterstitialPlaceholderTransitionResult = {
  shouldShow: boolean;
  reason: string;
  eligibility: AdEligibilityResult | null;
  providerResult: AdProviderResult | null;
  recordResult: RecordPlaceholderAdShowResult | null;
};

export async function evaluateInterstitialPlaceholderTransition(options: {
  routePath: string;
  previousRoutePath?: string | null;
  hasObservedRoute: boolean;
  appState: AdAppActivityState;
  forbiddenContexts: AdForbiddenContextFlags;
  config?: AdsLaunchConfig | null;
  provider?: AdProvider | null;
  providerStatus?: AdProviderStatus | null;
  userId?: string | null;
  userPlan?: UserPlan | null;
  isAdFree?: boolean | null;
  activeBrowsingSeconds?: number;
  now?: Date;
  recordShow?: boolean;
}): Promise<InterstitialPlaceholderTransitionResult> {
  const config = options.config ?? ADS_LAUNCH_CONFIG_DEFAULTS;
  const provider = options.provider ?? placeholderAdProvider;
  const providerStatus = options.providerStatus ?? provider.getStatus();
  const normalizedRoute = normalizeAdRoutePath(options.routePath);
  const normalizedPreviousRoute = normalizeAdRoutePath(options.previousRoutePath);
  const activeBrowsingSeconds = Math.max(0, Math.floor(options.activeBrowsingSeconds ?? 0));

  if (!options.hasObservedRoute) {
    return {
      shouldShow: false,
      reason: "initial_route_mount",
      eligibility: null,
      providerResult: null,
      recordResult: null,
    };
  }

  if (!normalizedRoute || normalizedRoute === normalizedPreviousRoute) {
    return {
      shouldShow: false,
      reason: "route_transition_required",
      eligibility: null,
      providerResult: null,
      recordResult: null,
    };
  }

  const adFreeStatus = await resolveCurrentUserAdFreeStatus({
    isAdFree: options.isAdFree,
    userPlan: options.userPlan,
  });

  const eligibility = await evaluateAdEligibility({
    placementKind: "interstitial",
    routePath: normalizedRoute,
    appState: options.appState,
    userId: options.userId,
    userPlan: adFreeStatus.plan ?? options.userPlan ?? null,
    isAdFree: adFreeStatus.isAdFree,
    forbiddenContexts: options.forbiddenContexts,
    config,
    providerStatus,
    activeBrowsingSeconds,
    now: options.now,
  });

  if (!eligibility.eligible) {
    return {
      shouldShow: false,
      reason: eligibility.reason,
      eligibility,
      providerResult: null,
      recordResult: null,
    };
  }

  if (
    config.ads_provider !== "placeholder"
    || provider.provider !== "placeholder"
    || providerStatus.provider !== "placeholder"
  ) {
    return {
      shouldShow: false,
      reason: "placeholder_only_controller",
      eligibility,
      providerResult: null,
      recordResult: null,
    };
  }

  if (!options.recordShow) {
    return {
      shouldShow: true,
      reason: "eligible_placeholder_not_recorded",
      eligibility,
      providerResult: null,
      recordResult: null,
    };
  }

  const providerResult = await provider.showInterstitial({
    surface: "route_transition",
    routePath: normalizedRoute,
    userId: options.userId ?? null,
  });

  if (!providerResult.placeholderOnly || !providerResult.shown) {
    return {
      shouldShow: false,
      reason: providerResult.message || "placeholder_interstitial_not_shown",
      eligibility,
      providerResult,
      recordResult: null,
    };
  }

  const recordResult = await recordPlaceholderAdShow("interstitial", {
    eligible: eligibility.eligible,
    isAdFree: adFreeStatus.isAdFree,
    config,
    userId: options.userId,
    now: options.now,
    activeBrowsingSeconds,
  });

  return {
    shouldShow: recordResult.recorded,
    reason: recordResult.reason,
    eligibility,
    providerResult,
    recordResult,
  };
}

export function InterstitialController({
  disabled = false,
  config: configOverride,
  provider: providerOverride,
  providerStatus: providerStatusOverride,
  forbiddenContexts: forbiddenContextsOverride,
  isAdFree: providedIsAdFree,
  userPlan,
  activeBrowsingSecondsOverride,
  now,
  onPlaceholderTransition,
}: {
  disabled?: boolean;
  config?: AdsLaunchConfig | null;
  provider?: AdProvider | null;
  providerStatus?: AdProviderStatus | null;
  forbiddenContexts?: AdForbiddenContextFlags | null;
  isAdFree?: boolean | null;
  userPlan?: UserPlan | null;
  activeBrowsingSecondsOverride?: number;
  now?: Date;
  onPlaceholderTransition?: (result: InterstitialPlaceholderTransitionResult) => void;
}) {
  const pathname = usePathname();
  const session = useOptionalSession();
  const { config: appConfigAdsLaunch } = useAdsLaunchConfig({ enabled: !configOverride });
  const config = configOverride ?? appConfigAdsLaunch;
  const provider = providerOverride ?? placeholderAdProvider;
  const providerStatus = providerStatusOverride ?? provider.getStatus();
  const forbiddenContexts = useMemo(
    () => forbiddenContextsOverride ?? DEFAULT_INTERSTITIAL_FORBIDDEN_CONTEXTS,
    [forbiddenContextsOverride],
  );
  const [appState, setAppState] = useState<AdAppActivityState>(() => normalizeAppState(AppState.currentState));
  const [resolvedIsAdFree, setResolvedIsAdFree] = useState<boolean | null>(
    typeof providedIsAdFree === "boolean" ? providedIsAdFree : null,
  );
  const previousRouteRef = useRef<string | null>(null);
  const hasObservedRouteRef = useRef(false);
  const attemptedTransitionRef = useRef<string | null>(null);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setAppState(normalizeAppState(nextState));
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (!config.ads_enabled) {
      setResolvedIsAdFree(null);
      return () => {
        cancelled = true;
      };
    }

    resolveCurrentUserAdFreeStatus({
      isAdFree: providedIsAdFree,
      userPlan,
    }).then((status) => {
      if (!cancelled) setResolvedIsAdFree(status.isAdFree);
    }).catch(() => {
      if (!cancelled) setResolvedIsAdFree(null);
    });

    return () => {
      cancelled = true;
    };
  }, [config.ads_enabled, providedIsAdFree, userPlan]);

  const { activeBrowsingSeconds } = useActiveBrowsingTime({
    routePath: pathname,
    isAdFree: resolvedIsAdFree,
    forbiddenContexts,
    config,
  });
  const effectiveActiveBrowsingSeconds = activeBrowsingSecondsOverride ?? activeBrowsingSeconds;

  useEffect(() => {
    let cancelled = false;
    const previousRoute = previousRouteRef.current;
    const hasObservedRoute = hasObservedRouteRef.current;
    const normalizedCurrentRoute = normalizeAdRoutePath(pathname);
    const normalizedPreviousRoute = normalizeAdRoutePath(previousRoute);
    const transitionKey = `${normalizedPreviousRoute || "initial"}->${normalizedCurrentRoute || "unknown"}`;

    previousRouteRef.current = pathname;
    hasObservedRouteRef.current = true;

    if (disabled || !config.ads_enabled || attemptedTransitionRef.current === transitionKey) return undefined;
    attemptedTransitionRef.current = transitionKey;

    evaluateInterstitialPlaceholderTransition({
      routePath: pathname,
      previousRoutePath: previousRoute,
      hasObservedRoute,
      appState,
      forbiddenContexts,
      config,
      provider,
      providerStatus,
      userId: session?.user?.id ?? null,
      userPlan,
      isAdFree: resolvedIsAdFree,
      activeBrowsingSeconds: effectiveActiveBrowsingSeconds,
      now,
      recordShow: true,
    }).then((result) => {
      if (!cancelled) onPlaceholderTransition?.(result);
    }).catch(() => {
      // Placeholder interstitial foundation is fail-closed; runtime should continue silently.
    });

    return () => {
      cancelled = true;
    };
  }, [
    appState,
    config,
    disabled,
    effectiveActiveBrowsingSeconds,
    forbiddenContexts,
    now,
    onPlaceholderTransition,
    pathname,
    provider,
    providerStatus,
    resolvedIsAdFree,
    session?.user?.id,
    userPlan,
  ]);

  return null;
}

export default InterstitialController;
