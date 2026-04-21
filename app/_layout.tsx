import { Stack, useGlobalSearchParams, usePathname, useRouter, useSegments } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { setAnalyticsSink, trackEvent, trackScreen, type AnalyticsPayload } from "../_lib/analytics";
import { BetaProgramProvider, useBetaProgram } from "../_lib/betaProgram";
import { REMOTE_CONFIG_KEYS } from "../_lib/featureFlags";
import {
  bootstrapFirebaseAnalytics,
  clearFirebaseAnalyticsUser,
  identifyFirebaseAnalyticsUser,
  trackFirebaseAnalyticsEvent,
  trackFirebaseAnalyticsScreen,
} from "../_lib/firebaseAnalytics";
import {
  bootstrapFirebaseCrashlytics,
  clearFirebaseCrashlyticsUser,
  identifyFirebaseCrashlyticsUser,
} from "../_lib/firebaseCrashlytics";
import { bootstrapFirebasePerformance } from "../_lib/firebasePerformance";
import { bootstrapFirebaseRemoteConfig, getRemoteConfigBoolean } from "../_lib/firebaseRemoteConfig";
import { bootstrapLiveKitFoundation } from "../_lib/livekit/bootstrap";
import { reportRuntimeError } from "../_lib/logger";
import { bootstrapMonetizationFoundation } from "../_lib/monetization";
import { getSupportRoutePath, getRuntimeConfigIssueSummary, isRuntimeConfigValid } from "../_lib/runtimeConfig";
import { SessionProvider, useSession } from "../_lib/session";
import { BetaWelcomeSheet } from "../components/beta/beta-welcome-sheet";
import DevDebugOverlay from "../components/dev/dev-debug-overlay";
import { RootErrorBoundary } from "../components/system/root-error-boundary";
import { RuntimeUnavailableScreen } from "../components/system/runtime-unavailable-screen";

const PUBLIC_LEGAL_PATHS = new Set(["/privacy", "/terms", "/account-deletion"]);

const isPublicLegalPath = (pathname?: string | null) => !!pathname && PUBLIC_LEGAL_PATHS.has(pathname);

function RouteAnalyticsBridge() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();

  useEffect(() => {
    trackScreen(pathname, params as Record<string, string>);
  }, [params, pathname]);

  return null;
}

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

function FirebaseRuntimeBridge() {
  const { user } = useSession();

  const sanitizeAnalyticsPayload = (payload?: AnalyticsPayload) => {
    if (!payload) return undefined;

    const sanitized: Record<string, string | number | boolean | null> = {};

    Object.entries(payload).forEach(([key, value]) => {
      if (value === undefined) return;
      sanitized[key] = value ?? null;
    });

    return Object.keys(sanitized).length > 0 ? sanitized : undefined;
  };

  useEffect(() => {
    bootstrapLiveKitFoundation();
    void bootstrapFirebaseAnalytics();
    void bootstrapFirebaseCrashlytics();
    void bootstrapFirebasePerformance();
    void bootstrapFirebaseRemoteConfig().then(() => {
      void getRemoteConfigBoolean(REMOTE_CONFIG_KEYS.liveWaitingRoomEnabled);
      void getRemoteConfigBoolean(REMOTE_CONFIG_KEYS.partyWaitingRoomEnabled);
      void getRemoteConfigBoolean(REMOTE_CONFIG_KEYS.watchPartyLiveHandoffV2);
      void getRemoteConfigBoolean(REMOTE_CONFIG_KEYS.chillyChatExpandedV1);
      void getRemoteConfigBoolean(REMOTE_CONFIG_KEYS.aiChatSuggestionsV1);
    });

    setAnalyticsSink({
      identifyUser(identity) {
        void identifyFirebaseAnalyticsUser(identity);
      },
      clearUser() {
        void clearFirebaseAnalyticsUser();
      },
      trackScreen(screenName, payload) {
        void payload;
        void trackFirebaseAnalyticsScreen(screenName);
      },
      trackEvent(eventName, payload) {
        void trackFirebaseAnalyticsEvent(eventName, sanitizeAnalyticsPayload(payload));
      },
    });

    return () => {
      setAnalyticsSink(null);
    };
  }, []);

  useEffect(() => {
    if (user) {
      const identity = {
        id: user.id,
        email: user.email ?? null,
      };
      void identifyFirebaseAnalyticsUser(identity);
      void identifyFirebaseCrashlyticsUser(identity);
      return;
    }

    void clearFirebaseAnalyticsUser();
    void clearFirebaseCrashlyticsUser();
  }, [user]);

  return null;
}

function RevenueCatBootstrap() {
  const { user } = useSession();

  useEffect(() => {
    void bootstrapMonetizationFoundation(user?.id ?? null).catch(() => {
      // runtime error reporting already happens inside the monetization owners
    });
  }, [user?.id]);

  return null;
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
        <Stack.Screen name="settings" />
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

function AuthBootScreen() {
  return (
    <View style={styles.authBootScreen}>
      <ActivityIndicator color="#DC143C" />
      <Text style={styles.authBootText}>Checking your session…</Text>
    </View>
  );
}

function AuthRouteGate() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const segments = useSegments();
  const { isLoading, isSignedIn } = useSession();

  const redirectTo = serializeRedirectTarget(pathname, params as Record<string, unknown>);
  const authRedirectTo = String(params.redirectTo ?? "").trim() || "/";
  const insideAuthGroup = segments[0] === "(auth)";
  const insideTabsGroup = segments[0] === "(tabs)" || pathname === "/";

  useEffect(() => {
    if (isLoading) return;

    if (!isSignedIn && insideTabsGroup) {
      router.replace({
        pathname: "/(auth)/login",
        params: { redirectTo },
      });
      return;
    }

    if (isSignedIn && insideAuthGroup) {
      router.replace(authRedirectTo as Parameters<typeof router.replace>[0]);
    }
  }, [authRedirectTo, insideAuthGroup, insideTabsGroup, isLoading, isSignedIn, redirectTo, router]);

  if (isLoading) return <AuthBootScreen />;
  if ((!isSignedIn && insideTabsGroup) || (isSignedIn && insideAuthGroup)) return <AuthBootScreen />;

  return <RootNavigator />;
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

function PublicLegalNavigator() {
  return (
    <RootErrorBoundary>
      <Stack screenOptions={{ headerShown: false }} />
    </RootErrorBoundary>
  );
}

export default function RootLayout() {
  const pathname = usePathname();
  const publicLegalPath = isPublicLegalPath(pathname);

  if (!isRuntimeConfigValid() && !publicLegalPath) {
    const message = getRuntimeConfigIssueSummary();
    if (__DEV__) {
      throw new Error(message);
    }

    return <RuntimeUnavailableScreen message={message} />;
  }

  if (publicLegalPath) {
    return <PublicLegalNavigator />;
  }

  return (
    <SessionProvider>
      <FirebaseRuntimeBridge />
      <RevenueCatBootstrap />
      <BetaProgramProvider>
        <RootErrorBoundary>
          <AuthRouteGate />
        </RootErrorBoundary>
        <BetaWelcomeController />
      </BetaProgramProvider>
    </SessionProvider>
  );
}

const styles = StyleSheet.create({
  authBootScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#05060A",
    gap: 10,
  },
  authBootText: {
    color: "#F4F7FC",
    fontSize: 13,
    fontWeight: "600",
  },
});
