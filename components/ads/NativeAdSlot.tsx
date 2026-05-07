import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  ADS_LAUNCH_CONFIG_DEFAULTS,
  type AdsLaunchConfig,
} from "../../_lib/ads/adConfig";
import {
  evaluateAdEligibility,
  resolveCurrentUserAdFreeStatus,
  type AdEligibilityResult,
  type AdForbiddenContextFlags,
} from "../../_lib/ads/adEligibility";
import {
  DISCONNECTED_PLACEHOLDER_AD_STATUS,
  type AdProviderStatus,
} from "../../_lib/ads/adProvider";
import {
  recordPlaceholderAdShow,
  type RecordPlaceholderAdShowResult,
} from "../../_lib/ads/adSession";
import type { UserPlan } from "../../_lib/monetization";
import { useOptionalSession } from "../../_lib/session";
import { useActiveBrowsingTime } from "../../hooks/useActiveBrowsingTime";
import { useAdEligibility } from "../../hooks/useAdEligibility";
import { useAdsLaunchConfig } from "../../hooks/useAdsLaunchConfig";

type NativeAdSlotProps = {
  surface: "home" | "explore" | string;
  routePath: "/" | "/explore" | string;
  forbiddenContexts: AdForbiddenContextFlags;
  config?: AdsLaunchConfig | null;
  providerStatus?: AdProviderStatus | null;
  isAdFree?: boolean | null;
  userPlan?: UserPlan | null;
  activeBrowsingSecondsOverride?: number;
  now?: Date;
  disabled?: boolean;
  onRecordedPlaceholderShow?: (result: RecordPlaceholderAdShowResult) => void;
};

export type NativeFeedPlaceholderPlacementResult = {
  shouldRender: boolean;
  reason: string;
  eligibility: AdEligibilityResult;
  recordResult: RecordPlaceholderAdShowResult | null;
};

export async function evaluateNativeFeedPlaceholderPlacement(options: {
  routePath: string;
  surface: string;
  forbiddenContexts: AdForbiddenContextFlags;
  appState: "active" | "inactive" | "background" | "unknown";
  config?: AdsLaunchConfig | null;
  providerStatus?: AdProviderStatus | null;
  userId?: string | null;
  userPlan?: UserPlan | null;
  isAdFree?: boolean | null;
  activeBrowsingSeconds?: number;
  now?: Date;
  recordShow?: boolean;
}): Promise<NativeFeedPlaceholderPlacementResult> {
  const config = options.config ?? ADS_LAUNCH_CONFIG_DEFAULTS;
  const providerStatus = options.providerStatus ?? DISCONNECTED_PLACEHOLDER_AD_STATUS;
  const activeBrowsingSeconds = Math.max(0, Math.floor(options.activeBrowsingSeconds ?? 0));
  const adFreeStatus = await resolveCurrentUserAdFreeStatus({
    isAdFree: options.isAdFree,
    userPlan: options.userPlan,
  });
  const eligibility = await evaluateAdEligibility({
    placementKind: "native_feed",
    routePath: options.routePath,
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
      shouldRender: false,
      reason: eligibility.reason,
      eligibility,
      recordResult: null,
    };
  }

  if (!options.recordShow) {
    return {
      shouldRender: true,
      reason: "eligible_placeholder_not_recorded",
      eligibility,
      recordResult: null,
    };
  }

  const recordResult = await recordPlaceholderAdShow("native_feed", {
    eligible: eligibility.eligible,
    isAdFree: adFreeStatus.isAdFree,
    config,
    userId: options.userId,
    now: options.now,
    activeBrowsingSeconds,
  });

  return {
    shouldRender: recordResult.recorded,
    reason: recordResult.reason,
    eligibility,
    recordResult,
  };
}

export function NativeAdSlot({
  surface,
  routePath,
  forbiddenContexts,
  config: configOverride,
  providerStatus: providerStatusOverride,
  isAdFree: providedIsAdFree,
  userPlan,
  activeBrowsingSecondsOverride,
  now,
  disabled = false,
  onRecordedPlaceholderShow,
}: NativeAdSlotProps) {
  const session = useOptionalSession();
  const { config: appConfigAdsLaunch } = useAdsLaunchConfig({ enabled: !configOverride });
  const config = configOverride ?? appConfigAdsLaunch;
  const providerStatus = providerStatusOverride ?? DISCONNECTED_PLACEHOLDER_AD_STATUS;
  const [resolvedIsAdFree, setResolvedIsAdFree] = useState<boolean | null>(
    typeof providedIsAdFree === "boolean" ? providedIsAdFree : null,
  );
  const [recordResult, setRecordResult] = useState<RecordPlaceholderAdShowResult | null>(null);
  const [hasAttemptedRecord, setHasAttemptedRecord] = useState(false);

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

  const { activeBrowsingSeconds, appState } = useActiveBrowsingTime({
    routePath,
    isAdFree: resolvedIsAdFree,
    forbiddenContexts,
    config,
  });
  const effectiveActiveBrowsingSeconds = activeBrowsingSecondsOverride ?? activeBrowsingSeconds;
  const { eligibility } = useAdEligibility({
    placementKind: "native_feed",
    routePath,
    isAdFree: resolvedIsAdFree,
    userPlan,
    forbiddenContexts,
    config,
    providerStatus,
    activeBrowsingSeconds: effectiveActiveBrowsingSeconds,
  });

  useEffect(() => {
    let cancelled = false;

    if (disabled || hasAttemptedRecord || resolvedIsAdFree !== false || !eligibility?.eligible) return undefined;

    setHasAttemptedRecord(true);

    evaluateNativeFeedPlaceholderPlacement({
      routePath,
      surface,
      forbiddenContexts,
      appState,
      config,
      providerStatus,
      userId: session?.user?.id ?? null,
      userPlan,
      isAdFree: resolvedIsAdFree,
      activeBrowsingSeconds: effectiveActiveBrowsingSeconds,
      now,
      recordShow: true,
    }).then((result) => {
      if (cancelled) return;
      setRecordResult(result.recordResult);
      if (result.recordResult) onRecordedPlaceholderShow?.(result.recordResult);
    }).catch(() => {
      if (!cancelled) setRecordResult(null);
    });

    return () => {
      cancelled = true;
    };
  }, [
    appState,
    config,
    disabled,
    effectiveActiveBrowsingSeconds,
    eligibility?.eligible,
    forbiddenContexts,
    hasAttemptedRecord,
    now,
    onRecordedPlaceholderShow,
    providerStatus,
    resolvedIsAdFree,
    routePath,
    session?.user?.id,
    surface,
    userPlan,
  ]);

  const renderCopy = useMemo(() => ({
    kicker: "Sponsored",
    title: "Ad placeholder",
    body: "Native/feed placement foundation. No real ad is loaded.",
  }), []);

  if (disabled || !recordResult?.recorded) return null;

  return (
    <View
      style={styles.card}
      accessibilityRole="text"
      accessibilityLabel={`${renderCopy.kicker}. ${renderCopy.title}.`}
    >
      <View style={styles.kickerRow}>
        <Text style={styles.kicker}>{renderCopy.kicker}</Text>
        <Text style={styles.placeholderPill}>Placeholder</Text>
      </View>
      <Text style={styles.title}>{renderCopy.title}</Text>
      <Text style={styles.body}>{renderCopy.body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(12,14,20,0.78)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 7,
  },
  kickerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  kicker: {
    color: "#9AA8C4",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  placeholderPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    color: "#DDE6F8",
    fontSize: 10.5,
    fontWeight: "900",
    paddingHorizontal: 9,
    paddingVertical: 5,
    overflow: "hidden",
  },
  title: {
    color: "#F5F8FF",
    fontSize: 15,
    fontWeight: "900",
  },
  body: {
    color: "#AAB4C8",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
});
