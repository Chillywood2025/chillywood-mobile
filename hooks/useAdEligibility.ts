import { useCallback, useEffect, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { usePathname } from "expo-router";

import {
  evaluateAdEligibility,
  type AdAppActivityState,
  type AdEligibilityResult,
  type AdForbiddenContextFlags,
} from "../_lib/ads/adEligibility";
import {
  ADS_LAUNCH_CONFIG_DEFAULTS,
  type AdsLaunchConfig,
  type AdsPlacementKind,
} from "../_lib/ads/adConfig";
import type { AdProviderStatus } from "../_lib/ads/adProvider";
import type { UserPlan } from "../_lib/monetization";
import { useOptionalSession } from "../_lib/session";

const normalizeAppState = (state: AppStateStatus): AdAppActivityState => (
  state === "active" ? "active" : state === "background" ? "background" : "inactive"
);

export function useAdEligibility(options: {
  placementKind: AdsPlacementKind;
  routePath?: string | null;
  userPlan?: UserPlan | null;
  isAdFree?: boolean | null;
  forbiddenContexts?: AdForbiddenContextFlags | null;
  config?: AdsLaunchConfig | null;
  providerStatus?: AdProviderStatus | null;
  activeBrowsingSeconds?: number;
}) {
  const pathname = usePathname();
  const session = useOptionalSession();
  const [appState, setAppState] = useState<AdAppActivityState>(() => normalizeAppState(AppState.currentState));
  const [eligibility, setEligibility] = useState<AdEligibilityResult | null>(null);
  const [loading, setLoading] = useState(false);
  const routePath = options.routePath ?? pathname;
  const config = options.config ?? ADS_LAUNCH_CONFIG_DEFAULTS;
  const userId = session?.user?.id ?? null;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setAppState(normalizeAppState(nextState));
    });

    return () => subscription.remove();
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await evaluateAdEligibility({
        placementKind: options.placementKind,
        routePath,
        appState,
        userId,
        userPlan: options.userPlan,
        isAdFree: options.isAdFree,
        forbiddenContexts: options.forbiddenContexts,
        config,
        providerStatus: options.providerStatus,
        activeBrowsingSeconds: options.activeBrowsingSeconds,
      });
      setEligibility(result);
      return result;
    } finally {
      setLoading(false);
    }
  }, [
    appState,
    config,
    options.activeBrowsingSeconds,
    options.forbiddenContexts,
    options.isAdFree,
    options.placementKind,
    options.providerStatus,
    options.userPlan,
    routePath,
    userId,
  ]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    eligibility,
    loading,
    refresh,
  };
}

