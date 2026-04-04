import { Redirect, Stack, useGlobalSearchParams, usePathname, useRouter, useSegments } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PostHogProvider, useFeatureFlag } from "posthog-react-native";

import { trackEvent, trackScreen } from "../_lib/analytics";
import { BetaProgramProvider, useBetaProgram } from "../_lib/betaProgram";
import { reportRuntimeError } from "../_lib/logger";
import { getPostHogConfig, posthogFeatureFlags } from "../_lib/posthog";
import { getRuntimeConfigIssueSummary, getSupportRoutePath, isRuntimeConfigValid } from "../_lib/runtimeConfig";
import { ensureSentryInitialized } from "../_lib/sentry";
import { SessionProvider, useSession } from "../_lib/session";
import { BetaWelcomeSheet } from "../components/beta/beta-welcome-sheet";
import DevDebugOverlay from "../components/dev/dev-debug-overlay";
import { RootErrorBoundary } from "../components/system/root-error-boundary";
import { RuntimeUnavailableScreen } from "../components/system/runtime-unavailable-screen";
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://16324e9e351e8fae1009349f4390d163@o4511124423835648.ingest.us.sentry.io/4511124437270528',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

ensureSentryInitialized();

const serializeRedirectTarget = (pathname: string, params: Record<string, unknown>) => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value == null) return;

    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry == null) return;
        search.append(key, String(entry));
      });
      return;
    }

    search.append(key, String(value));
  });

  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
};

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
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const segments = useSegments();
  const { isLoading: sessionLoading, isSignedIn } = useSession();
  const redirectTo = useMemo(
    () => serializeRedirectTarget(pathname, params as Record<string, unknown>),
    [params, pathname],
  );
  const authRoute = segments[0] === "(auth)";

  if (sessionLoading || (!isSignedIn && !authRoute)) {
    return sessionLoading ? null : (
      <Redirect
        href={{
          pathname: "/(auth)/login",
          params: { redirectTo },
        }}
      />
    );
  }

  return (
    <>
      <RouteAnalyticsBridge />
      <Stack initialRouteName={isSignedIn ? "(tabs)" : "(auth)"} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="player/[id]" />
        <Stack.Screen name="title/[id]" />
        <Stack.Screen name="watch-party/index" />
        <Stack.Screen name="watch-party/[partyId]" />
        <Stack.Screen name="watch-party/live-stage/[partyId]" />
        <Stack.Screen name="communication/index" />
        <Stack.Screen name="communication/[roomId]" />
        <Stack.Screen name="chat/index" />
        <Stack.Screen name="chat/[threadId]" />
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

export default Sentry.wrap(function RootLayout() {
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
});
