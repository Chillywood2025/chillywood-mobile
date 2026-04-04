import { Stack, useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { PostHogProvider, useFeatureFlag } from "posthog-react-native";

import { trackEvent, trackScreen } from "../_lib/analytics";
import { BetaProgramProvider, useBetaProgram } from "../_lib/betaProgram";
import { reportRuntimeError } from "../_lib/logger";
import { getPostHogConfig, posthogFeatureFlags } from "../_lib/posthog";
import { getSupportRoutePath, getRuntimeConfigIssueSummary, isRuntimeConfigValid } from "../_lib/runtimeConfig";
import { SessionProvider } from "../_lib/session";
import { BetaWelcomeSheet } from "../components/beta/beta-welcome-sheet";
import DevDebugOverlay from "../components/dev/dev-debug-overlay";
import { RootErrorBoundary } from "../components/system/root-error-boundary";
import { RuntimeUnavailableScreen } from "../components/system/runtime-unavailable-screen";

function RouteAnalyticsBridge() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();

  useEffect(() => {
    trackScreen(pathname, params as Record<string, string>);
  }, [params, pathname]);

  return null;
}

function PostHogFlagProbe() {
  const liveWaitingRoomEnabled = useFeatureFlag(posthogFeatureFlags.liveWaitingRoomEnabled);
  const partyWaitingRoomEnabled = useFeatureFlag(posthogFeatureFlags.partyWaitingRoomEnabled);
  const watchPartyLiveHandoffV2 = useFeatureFlag(posthogFeatureFlags.watchPartyLiveHandoffV2);

  void liveWaitingRoomEnabled;
  void partyWaitingRoomEnabled;
  void watchPartyLiveHandoffV2;

  return null;
}

function PostHogRootProvider({ children }: { children: React.ReactNode }) {
  const { apiKey, host, isEnabled } = getPostHogConfig();

  if (!isEnabled) {
    return <>{children}</>;
  }

  return (
    <PostHogProvider
      apiKey={apiKey}
      autocapture={false}
      options={{
        host,
        captureAppLifecycleEvents: false,
        sendFeatureFlagEvent: false,
      }}
    >
      <PostHogFlagProbe />
      {children}
    </PostHogProvider>
  );
}

function RootNavigator() {
  return (
    <>
      <RouteAnalyticsBridge />
      <Stack initialRouteName="(tabs)" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="player/[id]" />
        <Stack.Screen name="title/[id]" />
        <Stack.Screen name="watch-party/index" />
        <Stack.Screen name="watch-party/[partyId]" />
        <Stack.Screen name="watch-party/live-stage/[partyId]" />
        <Stack.Screen name="communication/index" />
        <Stack.Screen name="communication/[roomId]" />
        <Stack.Screen name="profile/[userId]" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="channel-settings" />
        <Stack.Screen name="support" />
        <Stack.Screen name="beta-support" />
        <Stack.Screen name="modal" options={{ presentation: "modal" }} />
      </Stack>
      <DevDebugOverlay />
    </>
  );
}

function BetaWelcomeController() {
  const router = useRouter();
  const { accessState, isActive, acknowledgeOnboarding } = useBetaProgram();
  const [busy, setBusy] = useState(false);
  const trackedRef = useRef(false);

  useEffect(() => {
    if (!accessState.needsOnboarding) {
      trackedRef.current = false;
      return;
    }

    if (trackedRef.current) return;
    trackedRef.current = true;

    trackEvent("beta_welcome_seen", {
      cohort: accessState.membership?.cohort ?? null,
    });
  }, [accessState.membership?.cohort, accessState.needsOnboarding]);

  const handleDismiss = async (openGuide: boolean) => {
    setBusy(true);

    try {
      await acknowledgeOnboarding();
      if (openGuide) {
        router.push(getSupportRoutePath());
      }
    } catch (error) {
      reportRuntimeError("beta-welcome-acknowledge", error, {
        openGuide,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <BetaWelcomeSheet
      visible={isActive && accessState.needsOnboarding}
      busy={busy}
      onPrimaryPress={() => {
        void handleDismiss(true);
      }}
      onDismiss={() => {
        void handleDismiss(false);
      }}
    />
  );
}

export default function RootLayout() {
  if (!isRuntimeConfigValid()) {
    const message = getRuntimeConfigIssueSummary();
    if (__DEV__) {
      throw new Error(message);
    }

    return <RuntimeUnavailableScreen message={message} />;
  }

  return (
    <PostHogRootProvider>
      <SessionProvider>
        <BetaProgramProvider>
          <RootErrorBoundary>
            <RootNavigator />
          </RootErrorBoundary>
          <BetaWelcomeController />
        </BetaProgramProvider>
      </SessionProvider>
    </PostHogRootProvider>
  );
}
