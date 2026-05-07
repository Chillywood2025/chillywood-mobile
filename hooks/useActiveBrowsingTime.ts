import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";

import {
  addActiveBrowsingSeconds,
  getAdSessionSnapshot,
} from "../_lib/ads/adSession";
import {
  shouldTrackActiveBrowsingTime,
  type AdAppActivityState,
  type AdForbiddenContextFlags,
} from "../_lib/ads/adEligibility";
import {
  ADS_LAUNCH_CONFIG_DEFAULTS,
  type AdsLaunchConfig,
} from "../_lib/ads/adConfig";

const normalizeAppState = (state: AppStateStatus): AdAppActivityState => (
  state === "active" ? "active" : state === "background" ? "background" : "inactive"
);

export function useActiveBrowsingTime(options: {
  routePath?: string | null;
  isAdFree?: boolean | null;
  forbiddenContexts?: AdForbiddenContextFlags | null;
  config?: AdsLaunchConfig | null;
}) {
  const [appState, setAppState] = useState<AdAppActivityState>(() => normalizeAppState(AppState.currentState));
  const [activeBrowsingSeconds, setActiveBrowsingSeconds] = useState(
    () => getAdSessionSnapshot().activeBrowsingSeconds,
  );
  const lastTickRef = useRef<number | null>(null);
  const config = options.config ?? ADS_LAUNCH_CONFIG_DEFAULTS;

  const canTrack = useMemo(() => shouldTrackActiveBrowsingTime({
    routePath: options.routePath,
    appState,
    isAdFree: options.isAdFree,
    forbiddenContexts: options.forbiddenContexts,
    config,
  }), [
    appState,
    config,
    options.forbiddenContexts,
    options.isAdFree,
    options.routePath,
  ]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setAppState(normalizeAppState(nextState));
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!canTrack) {
      lastTickRef.current = null;
      return;
    }

    lastTickRef.current = Date.now();
    const timer = setInterval(() => {
      const previousTick = lastTickRef.current ?? Date.now();
      const currentTick = Date.now();
      lastTickRef.current = currentTick;
      const elapsedSeconds = Math.floor((currentTick - previousTick) / 1000);
      const snapshot = addActiveBrowsingSeconds(elapsedSeconds, {
        canTrack,
        isAdFree: options.isAdFree,
        now: currentTick,
      });
      setActiveBrowsingSeconds(snapshot.activeBrowsingSeconds);
    }, 1000);

    return () => clearInterval(timer);
  }, [canTrack, options.isAdFree]);

  return {
    activeBrowsingSeconds,
    appState,
    isTracking: canTrack,
  };
}

