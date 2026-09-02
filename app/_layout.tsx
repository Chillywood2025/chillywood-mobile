import { Stack, useGlobalSearchParams, usePathname, useRouter, useSegments } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, Linking, Platform, StyleSheet, Text, TouchableOpacity, Vibration, View } from "react-native";

import { setAnalyticsSink, trackEvent, trackScreen, type AnalyticsPayload } from "../_lib/analytics";
import { restoreScheduledAccountDeletion } from "../_lib/accountDeletionRequests";
import {
  accountLegalCheckIsPending,
  accountLegalVerificationKey,
  isCurrentAccountLegalRequest,
  recordAccountLegalAcceptance,
  resolveAccountLegalRequirements,
  shouldRefreshAccountLegalRequirements,
  type LegalRequirementsReadback,
} from "../_lib/accountLegalAcceptance";
import {
  APPLICATION_LEGAL_PATHS,
  consumeRegisteredAuthRedirect,
  isCreatorReplayApplicationLink,
  parseApplicationLink,
  registerAuthRedirect,
  registerVerifiedApplicationAuthInput,
  resolveApplicationRouteByKind,
} from "../_lib/appLinks";
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
import { getLegalDocument } from "../_lib/legalPolicies";
import { bootstrapMonetizationFoundation } from "../_lib/monetization";
import {
  readLatestRingingChillyChatCallInviteForCallee,
  readChillyChatCallInvite,
  subscribeToChillyChatCallInvite,
  subscribeToIncomingChillyChatCallInvites,
  updateChillyChatCallInviteStatus,
  type ChillyChatCallInvite,
} from "../_lib/chillyChatCalls";
import {
  playChillyChatCallSound,
  stopChillyChatCallSound,
  type ChillyChatPlayingSound,
} from "../_lib/chillyChatCallSoundAssets";
import {
  clearPendingAndroidNativeCallRouteClaims,
  consumePendingAndroidNativeCallRoute,
  subscribeToPendingAndroidNativeCallActionAvailability,
} from "../_lib/chillyChatNativeCallRouteBuffer";
import { clearEndedChatThreadCall, getChatThread } from "../_lib/chat";
import { resolveIncomingCallPresentation } from "../_lib/communicationCallMediaPolicy.mjs";
import {
  clearApplicationNotificationBadge,
  configureNotificationRuntime,
  dismissChillyChatCallNotificationRows,
  dismissPresentedChillyChatCallNotifications,
  readNotificationPreferences,
  refreshPushRegistrationIfGranted,
  subscribeToForegroundActivityNotifications,
  subscribeToForegroundNotificationAlerts,
  subscribeToNotificationResponses,
  type ForegroundActivityNotification,
  type ForegroundNotificationAlert,
  type NotificationPreferenceSettings,
} from "../_lib/notifications";
import { getSupportRoutePath, getRuntimeConfigIssueSummary, isRuntimeConfigValid } from "../_lib/runtimeConfig";
import { RuntimeUpdateGate } from "../_lib/runtimeUpdates";
import { SessionProvider, useSession } from "../_lib/session";
import { supabase } from "../_lib/supabase";
import {
  completeIosNativeCallAnswer,
  hasIosNativeCallPresentation,
  isIosNativeCallsRuntimeEnabled,
  reportIosNativeCallRemoteEnd,
  revokeIosVoipRegistration,
  startIosNativeCallsReadiness,
  subscribeToIosNativeCallPresentation,
  type SanitizedNativeCallEvent,
} from "../_lib/iosNativeCalls";
import {
  containsSensitiveNativeCallClaimRouteParams,
  consumeTrustedAndroidNativeActionStoreClaim,
  createForegroundAuthenticatedUiCallIntent,
  createIosCallKitAnswerRouteHandler,
  sanitizeExternalIosNativeCallPath,
} from "../_lib/nativeCallTransitionProvenance.mjs";
import { BetaWelcomeSheet } from "../components/beta/beta-welcome-sheet";
import DevDebugOverlay from "../components/dev/dev-debug-overlay";
import { RootErrorBoundary } from "../components/system/root-error-boundary";
import { RuntimeUnavailableScreen } from "../components/system/runtime-unavailable-screen";
import InterstitialAdController from "../components/ads/InterstitialController";

const PUBLIC_LEGAL_PATHS = new Set<string>(APPLICATION_LEGAL_PATHS);
const IOS_NATIVE_PRESENTATION_GRACE_MS = 1_500;

const isPublicLegalPath = (pathname?: string | null) => !!pathname && PUBLIC_LEGAL_PATHS.has(pathname);

const getPublicLegalRouteFromUrl = (url: string | null) => {
  const parsed = parseApplicationLink(url);
  return parsed?.kind === "legal" ? parsed.pathname : null;
};

const isCreatorReplayPlayerDeepLink = (url?: string | null) => isCreatorReplayApplicationLink(url);

const hasAuthLinkLikeParams = (params: Record<string, unknown>) => {
  const type = String(params.type ?? "").trim().toLowerCase();
  const flow = String(params.flow ?? "").trim().toLowerCase();

  return (
    type === "signup"
    || type === "email"
    || type === "email_change"
    || type === "invite"
    || type === "magiclink"
    || type === "reauthentication"
    || type === "recovery"
    || type === "recover"
    || flow === "signup"
    || flow === "email"
    || flow === "email_change"
    || flow === "invite"
    || flow === "magiclink"
    || flow === "reauthentication"
    || flow === "recovery"
    || flow === "recover"
    || Object.prototype.hasOwnProperty.call(params, "type")
    || Object.prototype.hasOwnProperty.call(params, "flow")
    || Object.prototype.hasOwnProperty.call(params, "code")
    || Object.prototype.hasOwnProperty.call(params, "token")
    || Object.prototype.hasOwnProperty.call(params, "token_hash")
    || Object.prototype.hasOwnProperty.call(params, "access_token")
    || Object.prototype.hasOwnProperty.call(params, "refresh_token")
    || Object.prototype.hasOwnProperty.call(params, "error")
    || Object.prototype.hasOwnProperty.call(params, "error_code")
    || Object.prototype.hasOwnProperty.call(params, "error_description")
    || Object.prototype.hasOwnProperty.call(params, "confirmation_token")
    || Object.prototype.hasOwnProperty.call(params, "recovery_token")
  );
};

const SENSITIVE_ROUTE_PARAM_NAMES = new Set([
  "#",
  "access_token",
  "authorization",
  "code",
  "code_verifier",
  "foregroundcallclaim",
  "nativecallaction",
  "nativecallclaim",
  "nativecalluuid",
  "opencall",
  "password",
  "refresh_token",
  "secret",
  "startcall",
  "token",
  "token_hash",
]);

const sanitizeRouteAnalyticsParams = (pathname: string, params: Record<string, unknown>) => {
  if (pathname === "/reset-password" || pathname === "/auth-callback") return {};

  const sanitized: Record<string, string> = {};

  Object.entries(params).forEach(([key, value]) => {
    const normalizedKey = key.toLowerCase();
    if (SENSITIVE_ROUTE_PARAM_NAMES.has(normalizedKey)) return;
    if (normalizedKey.includes("token") || normalizedKey.includes("password") || normalizedKey.includes("secret")) return;
    if (value == null || Array.isArray(value)) return;

    const normalizedValue = String(value);
    if (normalizedValue.includes("#")) return;
    sanitized[key] = normalizedValue;
  });

  return sanitized;
};

const getPasswordRecoveryRouteFromUrl = (url: string | null) => (
  resolveApplicationRouteByKind(url, "password_reset")
);

const getAuthCallbackRouteFromUrl = (url: string | null) => (
  resolveApplicationRouteByKind(url, "auth_callback")
);

function AndroidNativeCallRouteBridge() {
  const router = useRouter();
  const { isLoading, isSignedIn, user } = useSession();
  const authenticatedUserId = String(user?.id ?? "").trim();
  useEffect(() => {
    if (Platform.OS !== "android") return () => {};
    if (isLoading || !isSignedIn || !authenticatedUserId) {
      clearPendingAndroidNativeCallRouteClaims();
      return () => {};
    }
    let active = true;
    const consumePendingNativeCallAction = () => {
      void consumePendingAndroidNativeCallRoute({ authenticatedUserId })
        .then((nativeCallRoute) => {
          if (!nativeCallRoute || nativeCallRoute.status !== "created") return;
          if (!("destination" in nativeCallRoute)) return;
          if (!active) {
            consumeTrustedAndroidNativeActionStoreClaim({
              authenticatedUserId,
              claimId: nativeCallRoute.claimId,
              inviteId: nativeCallRoute.inviteId,
              requestKey: nativeCallRoute.nativeIdentity,
              threadId: nativeCallRoute.threadId,
            });
            return;
          }
          if (active && nativeCallRoute?.destination) {
            try {
              router.replace(
                nativeCallRoute.destination as Parameters<typeof router.replace>[0],
              );
            } catch {
              consumeTrustedAndroidNativeActionStoreClaim({
                authenticatedUserId,
                claimId: nativeCallRoute.claimId,
                inviteId: nativeCallRoute.inviteId,
                requestKey: nativeCallRoute.nativeIdentity,
                threadId: nativeCallRoute.threadId,
              });
              throw new Error("Android native call route unavailable.");
            }
          }
        })
        .catch((error) => {
          reportRuntimeError("android-native-call-pending-action", error, {
            source: "root-layout",
          });
        });
    };
    consumePendingNativeCallAction();
    const pendingActionSubscription =
      subscribeToPendingAndroidNativeCallActionAvailability(
        () => {
          if (AppState.currentState === "active") {
            consumePendingNativeCallAction();
          }
        },
      );
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") consumePendingNativeCallAction();
    });
    return () => {
      active = false;
      pendingActionSubscription();
      appStateSubscription.remove();
    };
  }, [authenticatedUserId, isLoading, isSignedIn, router]);

  return null;
}

function RouteAnalyticsBridge() {
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const router = useRouter();
  const { isSignedIn, user } = useSession();
  const handledInitialUrlRef = useRef(false);

  useEffect(() => {
    trackScreen(pathname, sanitizeRouteAnalyticsParams(pathname, params as Record<string, unknown>));
  }, [params, pathname]);

  useEffect(() => {
    let active = true;
    const refreshPushIfAllowed = async () => {
      const userId = String(user?.id ?? "").trim();
      if (!isSignedIn || !userId) return;
      const preferences = await readNotificationPreferences(userId).catch(() => null);
      if (!active || preferences?.pushEnabled === false) return;
      await refreshPushRegistrationIfGranted().catch(() => null);
    };

    void configureNotificationRuntime();
    void clearApplicationNotificationBadge();
    void refreshPushIfAllowed();
    const subscription = subscribeToNotificationResponses((path) => {
      const safePath = sanitizeExternalIosNativeCallPath(path);
      router.push(safePath as Parameters<typeof router.push>[0]);
    });
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState !== "active") return;
      void clearApplicationNotificationBadge();
      void refreshPushIfAllowed();
    });
    return () => {
      active = false;
      subscription.remove();
      appStateSubscription.remove();
    };
  }, [isSignedIn, router, user?.id]);

  useEffect(() => {
    let active = true;

    const routePublicLegalUrl = (url: string | null) => {
      const publicLegalRoute = getPublicLegalRouteFromUrl(url);
      if (!publicLegalRoute || pathname === publicLegalRoute) return false;
      router.replace(publicLegalRoute as Parameters<typeof router.replace>[0]);
      return true;
    };
    const routeRecoveryUrl = (url: string | null) => {
      const verifiedAuthInput = registerVerifiedApplicationAuthInput(url);
      const recoveryRoute = verifiedAuthInput?.kind === "password_reset"
        ? verifiedAuthInput.route
        : getPasswordRecoveryRouteFromUrl(url);
      if (!recoveryRoute || pathname === "/reset-password") return;
      router.replace(recoveryRoute as Parameters<typeof router.replace>[0]);
    };
    const routeAuthCallbackUrl = (url: string | null) => {
      const verifiedAuthInput = registerVerifiedApplicationAuthInput(url);
      const callbackRoute = verifiedAuthInput?.kind === "auth_callback"
        ? verifiedAuthInput.route
        : getAuthCallbackRouteFromUrl(url);
      if (!callbackRoute || pathname === "/auth-callback") return;
      router.replace(callbackRoute as Parameters<typeof router.replace>[0]);
    };

    if (!handledInitialUrlRef.current) {
      handledInitialUrlRef.current = true;
      Linking.getInitialURL()
        .then((url) => {
          if (!active) return;
          if (routePublicLegalUrl(url)) return;

          const verifiedAuthInput = registerVerifiedApplicationAuthInput(url);
          const recoveryRoute = verifiedAuthInput?.kind === "password_reset"
            ? verifiedAuthInput.route
            : getPasswordRecoveryRouteFromUrl(url);
          if (recoveryRoute) {
            routeRecoveryUrl(url);
            return;
          }

          routeAuthCallbackUrl(url);
        })
        .catch((error) => {
          reportRuntimeError("auth-password-recovery-route", error, {
            source: "root-layout",
          });
        });
    }

    const subscription = Linking.addEventListener("url", ({ url }) => {
      if (routePublicLegalUrl(url)) return;

      const verifiedAuthInput = registerVerifiedApplicationAuthInput(url);
      const recoveryRoute = verifiedAuthInput?.kind === "password_reset"
        ? verifiedAuthInput.route
        : getPasswordRecoveryRouteFromUrl(url);
      if (recoveryRoute) {
        routeRecoveryUrl(url);
        return;
      }

      routeAuthCallbackUrl(url);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [pathname, router]);

  return null;
}

const buildIncomingCallPath = (invite: ChillyChatCallInvite) => {
  const params = new URLSearchParams({
    callInviteId: invite.id,
  });
  return `/chat/${invite.threadId}?${params.toString()}`;
};

type IncomingCallAlert = ForegroundNotificationAlert & {
  invite?: ChillyChatCallInvite | null;
};

const ROOM_SAFE_CALL_PATH_PREFIXES = [
  "/watch-party",
  "/watch-party/",
  "/watch-party/live-stage",
  "/communication",
  "/communication/",
] as const;

const isRoomSafeIncomingCallPath = (pathname: string) => (
  ROOM_SAFE_CALL_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))
);

const isHostedLiveSurfacePath = (pathname: string) => (
  pathname === "/watch-party/live-stage" || pathname.startsWith("/watch-party/live-stage/")
);

const getIncomingCallKind = (alert: IncomingCallAlert) => {
  if (alert.invite?.callType === "voice") return "voice";
  const normalizedTitle = String(alert.title ?? "").toLowerCase();
  return normalizedTitle.includes("voice") ? "voice" : "video";
};

const getIncomingCallerLabel = (alert: IncomingCallAlert) => {
  const normalizedBody = String(alert.body ?? "").trim();
  const match = normalizedBody.match(/^(.+?) is calling you on Chi'lly Chat\.?$/u);
  return String(match?.[1] ?? "").trim() || "Someone";
};

const normalizeRoutePathOnly = (value?: string | null) => {
  const normalized = String(value ?? "").trim().split("?")[0]?.replace(/\/+$/u, "") ?? "";
  return normalized || "/";
};

const buildIncomingCallAlertFromInvite = async (invite: ChillyChatCallInvite): Promise<IncomingCallAlert> => {
  const callLabel = invite.callType === "voice" ? "voice" : "video";
  const thread = await getChatThread(invite.threadId).catch(() => null);
  const callerName = String(thread?.otherMember?.displayName ?? "").trim();
  return {
    body: callerName
      ? `${callerName} is calling you on Chi'lly Chat.`
      : `Incoming Chi'lly Chat ${callLabel} call.`,
    invite,
    inviteId: invite.id,
    path: buildIncomingCallPath(invite),
    title: `Incoming Chi'lly Chat ${callLabel} call`,
    triggerType: "chilly_chat_call_invite",
  };
};

function IncomingCallNotificationBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn, user } = useSession();
  const [alert, setAlert] = useState<IncomingCallAlert | null>(null);
  const [appState, setAppState] = useState(AppState.currentState);
  const [callPreferences, setCallPreferences] = useState<NotificationPreferenceSettings | null>(null);
  const [iosNativePresentationRevision, bumpIosNativePresentationRevision] = useState(0);
  const [iosNativePresentationGraceReadyInviteId, setIosNativePresentationGraceReadyInviteId] = useState("");
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incomingCallSoundRef = useRef<ChillyChatPlayingSound | null>(null);
  const latestInviteAlertIdRef = useRef("");

  useEffect(() => {
    if (Platform.OS !== "ios") return () => {};
    return subscribeToIosNativeCallPresentation(() => {
      bumpIosNativePresentationRevision((revision) => revision + 1);
    });
  }, []);

  useEffect(() => {
    const inviteId = String(alert?.inviteId ?? "").trim();
    if (
      Platform.OS !== "ios"
      || !isIosNativeCallsRuntimeEnabled()
      || !inviteId
    ) {
      setIosNativePresentationGraceReadyInviteId(inviteId);
      return () => {};
    }
    setIosNativePresentationGraceReadyInviteId("");
    const timeout = setTimeout(() => {
      setIosNativePresentationGraceReadyInviteId(inviteId);
    }, IOS_NATIVE_PRESENTATION_GRACE_MS);
    return () => clearTimeout(timeout);
  }, [alert?.inviteId]);

  const stopIncomingCallAttention = () => {
    Vibration.cancel();
    void stopChillyChatCallSound(incomingCallSoundRef.current);
    incomingCallSoundRef.current = null;
  };

  const showAlert = (nextAlert: IncomingCallAlert) => {
    if (nextAlert.inviteId && latestInviteAlertIdRef.current === nextAlert.inviteId) {
      if (nextAlert.invite) {
        setAlert((current) => current?.invite ? current : current ? { ...current, ...nextAlert } : nextAlert);
      }
      return;
    }
    if (nextAlert.inviteId) latestInviteAlertIdRef.current = nextAlert.inviteId;
    setAlert(nextAlert);
    if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    dismissTimeoutRef.current = setTimeout(() => {
      setAlert(null);
      dismissTimeoutRef.current = null;
    }, 45_000);
  };

  useEffect(() => {
    const subscription = subscribeToForegroundNotificationAlerts((nextAlert) => {
      showAlert(nextAlert);
    });

    return () => {
      subscription.remove();
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const currentUserId = String(user?.id ?? "").trim();
    if (!isSignedIn || !currentUserId) {
      latestInviteAlertIdRef.current = "";
      setCallPreferences(null);
      setAlert(null);
      return () => {};
    }

    let active = true;
    let refreshInFlight = false;
    const refreshIncomingInvite = async () => {
      if (refreshInFlight) return;
      refreshInFlight = true;
      try {
        const preferences = await readNotificationPreferences(currentUserId).catch(() => null);
        if (!active) return;
        setCallPreferences(preferences);
        if (preferences?.chillyChatCallsEnabled === false || preferences?.inAppEnabled === false) {
          setAlert((current) => current?.triggerType === "chilly_chat_call_invite" ? null : current);
          return;
        }

        const invite = await readLatestRingingChillyChatCallInviteForCallee(currentUserId).catch(() => null);
        if (!active) return;
        if (!invite) {
          latestInviteAlertIdRef.current = "";
          setAlert((current) => current?.triggerType === "chilly_chat_call_invite" ? null : current);
          return;
        }

        const nextAlert = await buildIncomingCallAlertFromInvite(invite);
        if (active) showAlert(nextAlert);
      } finally {
        refreshInFlight = false;
      }
    };

    void refreshIncomingInvite();
    const refreshInterval = setInterval(() => {
      if (AppState.currentState === "active") {
        void refreshIncomingInvite();
      }
    }, 3000);
    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      setAppState(nextState);
      if (nextState === "active") {
        void refreshIncomingInvite();
      }
    });
    const unsubscribe = subscribeToIncomingChillyChatCallInvites(currentUserId, () => {
      void refreshIncomingInvite();
    });

    return () => {
      active = false;
      clearInterval(refreshInterval);
      appStateSubscription.remove();
      unsubscribe();
    };
  }, [isSignedIn, user?.id]);

  useEffect(() => {
    stopIncomingCallAttention();
    if (!alert) return () => stopIncomingCallAttention();

    const currentPath = normalizeRoutePathOnly(pathname);
    const alertPath = normalizeRoutePathOnly(alert.path);
    const alreadyOnSameThread = currentPath.startsWith("/chat/") && alertPath && currentPath === alertPath;
    const alertInviteId = String(alert.inviteId ?? "").trim();
    const iosNativeCallPresentationOwned = hasIosNativeCallPresentation(alertInviteId);
    const waitingForIosNativePresentation =
      Platform.OS === "ios"
      && isIosNativeCallsRuntimeEnabled()
      && !!alertInviteId
      && !iosNativeCallPresentationOwned
      && iosNativePresentationGraceReadyInviteId !== alertInviteId;
    if (
      appState !== "active"
      || alreadyOnSameThread
      || iosNativeCallPresentationOwned
      || waitingForIosNativePresentation
      || callPreferences?.chillyChatCallsEnabled === false
      || callPreferences?.inAppEnabled === false
    ) {
      return () => stopIncomingCallAttention();
    }

    const vibrateEnabled = callPreferences?.chillyChatCallVibrateEnabled !== false;
    const soundKey = callPreferences?.chillyChatCallSoundKey ?? "chilly_ring";
    let soundActive = true;
    if (vibrateEnabled) {
      Vibration.vibrate(soundKey === "quiet_buzz" ? [0, 120, 80, 120] : [0, 380, 180, 380], true);
    }
    void playChillyChatCallSound(soundKey, { loop: true, volume: 0.78 })
      .then((sound) => {
        if (!sound) return;
        if (!soundActive) {
          void stopChillyChatCallSound(sound);
          return;
        }
        incomingCallSoundRef.current = sound;
      })
      .catch(() => null);

    return () => {
      soundActive = false;
      stopIncomingCallAttention();
    };
  }, [
    alert,
    appState,
    callPreferences?.chillyChatCallSoundKey,
    callPreferences?.chillyChatCallVibrateEnabled,
    callPreferences?.chillyChatCallsEnabled,
    callPreferences?.inAppEnabled,
    iosNativePresentationGraceReadyInviteId,
    iosNativePresentationRevision,
    pathname,
  ]);

  if (!alert) return null;

  const currentPath = normalizeRoutePathOnly(pathname);
  const alertPath = normalizeRoutePathOnly(alert.path);
  const alreadyOnSameThread = currentPath.startsWith("/chat/") && !!alertPath && currentPath === alertPath;
  const alertInviteId = String(alert.inviteId ?? "").trim();
  const iosNativeCallPresentationOwned = hasIosNativeCallPresentation(alertInviteId);
  const waitingForIosNativePresentation =
    Platform.OS === "ios"
    && isIosNativeCallsRuntimeEnabled()
    && !!alertInviteId
    && !iosNativeCallPresentationOwned
    && iosNativePresentationGraceReadyInviteId !== alertInviteId;
  if (waitingForIosNativePresentation) return null;
  const presentation = resolveIncomingCallPresentation({
    appState,
    alreadyOnSameThread,
    nativeCallPresentationOwned: iosNativeCallPresentationOwned,
  });
  if (presentation === "native_ios" || presentation === "native_background" || presentation === "thread_banner") return null;

  const roomSafeCall = isRoomSafeIncomingCallPath(pathname);
  const callKind = getIncomingCallKind(alert);
  const callerLabel = getIncomingCallerLabel(alert);

  const clearAlert = () => {
    stopIncomingCallAttention();
    if (dismissTimeoutRef.current) {
      clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = null;
    }
    setAlert(null);
  };

  const cleanupChillyChatCallNotifications = (input: {
    callInviteId?: string | null;
    path?: string | null;
    presentedNotificationId?: string | null;
    threadId?: string | null;
  }) => {
    void dismissPresentedChillyChatCallNotifications({
      ...input,
      dismissAllPresentedNotificationsFallback: true,
      dismissIncomingCallFallback: true,
    });
    void dismissChillyChatCallNotificationRows(input);
    [750, 1800, 5000].forEach((delayMs) => {
      setTimeout(() => {
        void dismissPresentedChillyChatCallNotifications({
          ...input,
          dismissAllPresentedNotificationsFallback: true,
          dismissIncomingCallFallback: true,
        });
        void dismissChillyChatCallNotificationRows(input);
      }, delayMs);
    });
  };

  const openCall = async () => {
    const actorUserId = String(user?.id ?? "").trim();
    const inviteId = String(alert.invite?.id ?? alert.inviteId ?? "").trim();
    const invite = inviteId
      ? await readChillyChatCallInvite(inviteId).catch(() => null)
      : null;
    if (
      !actorUserId
      || !invite
      || invite.calleeUserId !== actorUserId
      || invite.callerUserId === actorUserId
      || (invite.status !== "ringing" && invite.status !== "accepted")
    ) {
      Alert.alert("Call unavailable", "This Chi'lly Chat call can no longer be answered.");
      return;
    }
    const acceptedInvite = invite.status === "accepted"
      ? invite
      : await updateChillyChatCallInviteStatus({
        actorUserId,
        invite,
        status: "accepted",
      }).catch(() => null);
    if (!acceptedInvite || acceptedInvite.status !== "accepted") {
      Alert.alert("Unable to answer", "The call remains available if it is still ringing. Try again from the chat thread.");
      return;
    }
    const trustedUiIntent = createForegroundAuthenticatedUiCallIntent({
      action: "open_call",
      authenticated: true,
      authenticatedUserId: actorUserId,
      inviteId: acceptedInvite.id,
      roomId: acceptedInvite.communicationRoomId,
      threadId: acceptedInvite.threadId,
    });
    if (trustedUiIntent.status !== "created" || !trustedUiIntent.claimId) {
      Alert.alert("Unable to open", "The call remains accepted. Open it from the chat thread.");
      return;
    }
    const path = `/chat/${encodeURIComponent(acceptedInvite.threadId)}`;
    cleanupChillyChatCallNotifications({
      callInviteId: acceptedInvite.id,
      path,
      presentedNotificationId: alert.presentedNotificationId ?? null,
      threadId: acceptedInvite.threadId,
    });
    clearAlert();
    router.push({
      pathname: "/chat/[threadId]",
      params: {
        callInviteId: acceptedInvite.id,
        foregroundCallClaim: trustedUiIntent.claimId,
        openCall: "1",
        threadId: acceptedInvite.threadId,
      },
    });
  };

  const decline = async () => {
    const invite = alert.invite ?? null;
    const actorUserId = String(user?.id ?? "").trim();
    cleanupChillyChatCallNotifications({
      callInviteId: invite?.id ?? alert.inviteId ?? null,
      path: alert.path,
      presentedNotificationId: alert.presentedNotificationId ?? null,
      threadId: invite?.threadId ?? null,
    });
    clearAlert();
    if (invite && actorUserId) {
      await updateChillyChatCallInviteStatus({
        actorUserId,
        invite,
        status: "declined",
      }).catch(() => null);
      await clearEndedChatThreadCall(invite.threadId).catch(() => null);
      await dismissPresentedChillyChatCallNotifications({
        callInviteId: invite.id,
        dismissAllPresentedNotificationsFallback: true,
        dismissIncomingCallFallback: true,
        path: alert.path,
        presentedNotificationId: alert.presentedNotificationId ?? null,
        threadId: invite.threadId,
      }).catch(() => 0);
      await dismissChillyChatCallNotificationRows({
        callInviteId: invite.id,
        threadId: invite.threadId,
      }).catch(() => 0);
    }
  };

  const replyInChat = () => {
    const threadId = String(alert.invite?.threadId ?? "").trim();
    cleanupChillyChatCallNotifications({
      callInviteId: alert.invite?.id ?? alert.inviteId ?? null,
      path: alert.path,
      presentedNotificationId: alert.presentedNotificationId ?? null,
      threadId,
    });
    clearAlert();
    router.push((threadId ? `/chat/${threadId}` : "/chat") as Parameters<typeof router.push>[0]);
  };

  const leaveRoomAndAnswer = () => {
    const hostWarning = isHostedLiveSurfacePath(pathname);
    Alert.alert(
      "Leave room and answer?",
      hostWarning
        ? "Answering will leave or pause your current room media session. You are hosting. Leaving may end or disrupt the room."
        : "Answering will leave or pause your current room media session. Returning will re-check your room access.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Leave room and answer", style: "destructive", onPress: () => { void openCall(); } },
      ],
    );
  };

  const overlay = (
    <View
      pointerEvents="box-none"
      style={styles.incomingCallBannerOverlay}
      testID="app-wide-incoming-call-overlay"
      accessibilityLabel="Incoming Chi'lly Chat call overlay"
    >
      {roomSafeCall ? (
      <View style={styles.incomingCallBannerCard}>
        <View
          style={styles.incomingCallOpenAction}
          testID="room-safe-incoming-call-banner"
          accessibilityLabel="Room-safe incoming Chi'lly Chat call"
        >
          <Text style={styles.incomingCallEyebrow}>Chi&apos;lly Chat</Text>
          <Text style={styles.incomingCallTitle}>Incoming Chi&apos;lly Chat call</Text>
          <Text style={styles.incomingCallBody}>
            Answering will leave or pause your current room media session.
          </Text>
        </View>
        <View style={styles.incomingCallActions}>
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={() => {
              void decline();
            }}
            style={[styles.incomingCallButton, styles.incomingCallSecondaryButton]}
            testID="room-safe-incoming-call-decline"
            accessibilityLabel="Decline incoming Chi'lly Chat call"
          >
            <Text style={styles.incomingCallSecondaryText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={replyInChat}
            style={[styles.incomingCallButton, styles.incomingCallSecondaryButton]}
            testID="room-safe-incoming-call-reply-chat"
            accessibilityLabel="Reply in Chi'lly Chat"
          >
            <Text style={styles.incomingCallSecondaryText}>Reply in Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={leaveRoomAndAnswer}
            style={[styles.incomingCallButton, styles.incomingCallPrimaryButton]}
            testID="room-safe-incoming-call-leave-answer"
            accessibilityLabel="Leave room and answer Chi'lly Chat call"
          >
            <Text style={styles.incomingCallPrimaryText}>Leave room and answer</Text>
          </TouchableOpacity>
        </View>
      </View>
      ) : (
      <View
        style={styles.incomingCallBannerCard}
        testID="app-wide-incoming-call-banner"
        accessibilityLabel={`Incoming Chi'lly Chat ${callKind} call from ${callerLabel}`}
      >
        <Text style={styles.incomingCallEyebrow}>Incoming {callKind} call</Text>
        <Text style={styles.incomingCallTitle}>{callerLabel} is calling…</Text>
        <Text style={styles.incomingCallBody}>Answer, decline, or reply without leaving your current screen.</Text>
        <View style={styles.incomingCallActions}>
          <TouchableOpacity
            activeOpacity={0.86}
            onPress={() => {
              void decline();
            }}
            style={[styles.incomingCallButton, styles.incomingCallDeclineButton]}
            testID="app-wide-incoming-call-decline"
            accessibilityLabel="Decline incoming Chi'lly Chat call"
          >
            <Text style={styles.incomingCallDeclineText}>Decline</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.82}
            onPress={replyInChat}
            style={[styles.incomingCallButton, styles.incomingCallSecondaryButton]}
            testID="app-wide-incoming-call-reply-chat"
            accessibilityLabel="Reply in Chi'lly Chat without answering"
          >
            <Text style={styles.incomingCallSecondaryText}>Reply</Text>
          </TouchableOpacity>
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => { void openCall(); }}
            style={[styles.incomingCallButton, styles.incomingCallPrimaryButton]}
            testID="app-wide-incoming-call-answer"
            accessibilityLabel="Answer incoming Chi'lly Chat call"
          >
            <Text style={styles.incomingCallPrimaryText}>Answer</Text>
          </TouchableOpacity>
        </View>
      </View>
      )}
    </View>
  );

  return overlay;
}

function RoomSafeActivityNotificationBridge() {
  const pathname = usePathname();
  const [alert, setAlert] = useState<ForegroundActivityNotification | null>(null);
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const roomSafeSurface = isRoomSafeIncomingCallPath(pathname);

  useEffect(() => {
    const subscription = subscribeToForegroundActivityNotifications((nextAlert) => {
      if (!isRoomSafeIncomingCallPath(pathname)) return;
      setAlert(nextAlert);
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
      dismissTimeoutRef.current = setTimeout(() => {
        setAlert(null);
        dismissTimeoutRef.current = null;
      }, 6500);
    });

    return () => {
      subscription.remove();
      if (dismissTimeoutRef.current) clearTimeout(dismissTimeoutRef.current);
    };
  }, [pathname]);

  if (!roomSafeSurface || !alert) return null;

  return (
    <View
      pointerEvents="box-none"
      style={styles.roomSafeActivityToastOverlay}
      testID="room-safe-notification-toast"
      accessibilityLabel={alert.title}
    >
      <TouchableOpacity
        activeOpacity={0.84}
        style={styles.roomSafeActivityToast}
        onPress={() => setAlert(null)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss room-safe notification"
      >
        <Text style={styles.roomSafeActivityToastTitle}>{alert.title}</Text>
        <Text style={styles.roomSafeActivityToastBody} numberOfLines={2}>
          {alert.category === "creator_money_sale"
            ? "New creator activity"
            : alert.body}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const serializeRedirectTarget = (pathname: string, params: Record<string, unknown>) => {
  const search = new URLSearchParams();
  const fragmentFreePathname = pathname.split("#", 1)[0] || "/";

  Object.entries(params).forEach(([key, value]) => {
    const normalizedKey = key.toLowerCase();
    if (SENSITIVE_ROUTE_PARAM_NAMES.has(normalizedKey)) return;
    if (normalizedKey.includes("token") || normalizedKey.includes("password") || normalizedKey.includes("secret")) return;
    if (value == null) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry == null) return;
        if (String(entry).includes("#")) return;
        search.append(key, String(entry));
      });
      return;
    }

    if (String(value).includes("#")) return;
    search.append(key, String(value));
  });

  const query = search.toString();
  return query ? `${fragmentFreePathname}?${query}` : fragmentFreePathname;
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

function IosNativeCallsBridge() {
  const router = useRouter();
  const { authority, isSignedIn, user } = useSession();
  const inviteSubscriptionsRef = useRef(new Map<string, () => void>());
  const nativeCallDescriptorsRef = useRef(new Map<string, { callUuid: string; threadId: string }>());

  useEffect(() => {
    let active = true;
    const currentUserId = String(user?.id ?? "").trim();

    const clearInviteSubscription = (inviteId: string) => {
      inviteSubscriptionsRef.current.get(inviteId)?.();
      inviteSubscriptionsRef.current.delete(inviteId);
      nativeCallDescriptorsRef.current.delete(inviteId);
    };
    const clearInviteSubscriptions = () => {
      inviteSubscriptionsRef.current.forEach((unsubscribe) => unsubscribe());
      inviteSubscriptionsRef.current.clear();
      nativeCallDescriptorsRef.current.clear();
    };

    if (!isSignedIn || !currentUserId || !authority || authority.restoreOnly
      || authority.userId !== currentUserId || authority.accountId !== currentUserId) {
      nativeCallDescriptorsRef.current.forEach((descriptor) => {
        void reportIosNativeCallRemoteEnd(descriptor.callUuid, "account_transition");
      });
      clearInviteSubscriptions();
      void revokeIosVoipRegistration();
      return () => {
        active = false;
        clearInviteSubscriptions();
      };
    }

    const watchInviteLifecycle = (event: SanitizedNativeCallEvent) => {
      const inviteId = String(event.callInviteId ?? "").trim();
      const callUuid = String(event.callUuid ?? "").trim();
      if (!inviteId || !callUuid || inviteSubscriptionsRef.current.has(inviteId)) return;
      nativeCallDescriptorsRef.current.set(inviteId, {
        callUuid,
        threadId: String(event.threadId ?? "").trim(),
      });

      const reconcileInvite = async () => {
        const invite = await readChillyChatCallInvite(inviteId).catch(() => null);
        if (!active || !invite) return;
        if (invite.status === "ringing" || invite.status === "accepted") return;
        clearInviteSubscription(inviteId);
        await reportIosNativeCallRemoteEnd(callUuid, `invite_${invite.status}`).catch(() => false);
      };

      inviteSubscriptionsRef.current.set(
        inviteId,
        subscribeToChillyChatCallInvite(inviteId, () => {
          void reconcileInvite();
        }),
      );
      void reconcileInvite();
    };

    const routeNativeAnswer = createIosCallKitAnswerRouteHandler({
      completeAnswerFailure: (callUuid: string) => completeIosNativeCallAnswer(callUuid, false),
      getAuthenticatedUserId: () => currentUserId,
      isActive: () => active && isSignedIn,
      replace: (destination: string) => {
        router.replace(destination as Parameters<typeof router.replace>[0]);
      },
    });

    const pendingNativeTerminalActions = new Map<string, {
      event: SanitizedNativeCallEvent;
      status: "declined" | "ended" | "missed";
    }>();
    const nativeTerminalActionsInFlight = new Set<string>();
    const settleNativeTerminalAction = async (
      event: SanitizedNativeCallEvent,
      status: "declined" | "ended" | "missed",
    ) => {
      const inviteId = String(event.callInviteId ?? "").trim();
      const threadId = String(event.threadId ?? "").trim();
      if (!inviteId || !threadId) return false;
      const actionKey = `${inviteId}:${status}`;
      pendingNativeTerminalActions.set(actionKey, { event, status });
      if (nativeTerminalActionsInFlight.has(actionKey)) return false;
      nativeTerminalActionsInFlight.add(actionKey);

      let settled = false;
      try {
        for (let attempt = 0; active && attempt < 3; attempt += 1) {
          const invite = await readChillyChatCallInvite(inviteId).catch(() => null);
          if (!active) return false;
          if (!invite || invite.threadId !== threadId) break;

          const actorIsParticipant =
            invite.callerUserId === currentUserId
            || invite.calleeUserId === currentUserId;
          const transitionAllowed = status === "declined"
            ? invite.status === "ringing"
              && invite.calleeUserId === currentUserId
              && invite.callerUserId !== currentUserId
            : status === "missed"
              ? invite.status === "ringing" && actorIsParticipant
              : invite.status === "accepted" && actorIsParticipant;
          if (!transitionAllowed) {
            settled = invite.status !== "ringing" && invite.status !== "accepted";
            break;
          }

          const updated = await updateChillyChatCallInviteStatus({
            actorUserId: currentUserId,
            invite,
            status,
          }).catch(() => null);
          if (updated?.status === status) {
            settled = true;
            break;
          }
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
          }
        }

        if (!settled) return false;
        pendingNativeTerminalActions.delete(actionKey);
        clearInviteSubscription(inviteId);
        await clearEndedChatThreadCall(threadId).catch(() => null);
        await dismissPresentedChillyChatCallNotifications({
          callInviteId: inviteId,
          dismissAllPresentedNotificationsFallback: true,
          dismissIncomingCallFallback: true,
          threadId,
        }).catch(() => 0);
        await dismissChillyChatCallNotificationRows({
          callInviteId: inviteId,
          threadId,
        }).catch(() => 0);
        return true;
      } finally {
        nativeTerminalActionsInFlight.delete(actionKey);
      }
    };

    const handleNativeCallEvent = async (event: SanitizedNativeCallEvent) => {
      if (!active) return;
      if (event.type === "incoming" || event.type === "recovered") {
        watchInviteLifecycle(event);
        return;
      }
      if (event.type === "answerRequested") {
        await routeNativeAnswer(event);
        return;
      }
      if (event.type === "declined") {
        await settleNativeTerminalAction(event, "declined");
        return;
      }
      if (event.type === "muted" || event.type === "unmuted") {
        // CallKit mute state is consumed by the already-mounted call screen.
        // Navigating here would stack a second chat route and tear down the
        // active WebRTC peer connection during the first screen's cleanup.
        return;
      }
      if (event.type === "audioInterruptionBegan") {
        // AVAudioSession owns interruption behavior. Do not navigate or turn a
        // transient system interruption into a call-screen replacement.
        return;
      }
      if (event.type === "timeout") {
        await settleNativeTerminalAction(event, "missed");
        return;
      }
      if (
        event.type === "ended"
        || event.type === "answerFailed"
        || event.type === "audioSessionFailed"
        || event.type === "providerReset"
      ) {
        await settleNativeTerminalAction(event, "ended");
        return;
      }
      if (event.type === "remoteEnded" || event.type === "reportFailed") {
        clearInviteSubscription(String(event.callInviteId ?? "").trim());
      }
    };

    void startIosNativeCallsReadiness(authority, handleNativeCallEvent);
    const activationSubscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      pendingNativeTerminalActions.forEach(({ event, status }) => {
        void settleNativeTerminalAction(event, status);
      });
      nativeCallDescriptorsRef.current.forEach((descriptor, inviteId) => {
        void readChillyChatCallInvite(inviteId)
          .then((invite) => {
            if (!invite || invite.status === "ringing" || invite.status === "accepted") return;
            clearInviteSubscription(inviteId);
            return reportIosNativeCallRemoteEnd(descriptor.callUuid, `activation_${invite.status}`);
          })
          .catch(() => null);
      });
    });

    return () => {
      active = false;
      activationSubscription.remove();
      clearInviteSubscriptions();
      void revokeIosVoipRegistration();
    };
  }, [
    authority,
    isSignedIn,
    router,
    user?.id,
  ]);

  return null;
}

function DefaultOrientationLock() {
  useEffect(() => {
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch((error) => {
      reportRuntimeError("default-orientation-lock", error, {
        surface: "root-layout",
      });
    });
  }, []);

  return null;
}

function RootNavigator() {
  const params = useGlobalSearchParams<Record<string, string | string[]>>();
  const hideDebugOverlay = containsSensitiveNativeCallClaimRouteParams(params);
  return (
    <>
      <RouteAnalyticsBridge />
      <RoomSafeActivityNotificationBridge />
      <IncomingCallNotificationBridge />
      <InterstitialAdController />
      <Stack initialRouteName="(tabs)" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="player/[id]" />
        <Stack.Screen name="player/replay/[replayId]" />
        <Stack.Screen name="title/[id]" />
        <Stack.Screen name="watch-party/index" />
        <Stack.Screen name="watch-party/[partyId]" />
        <Stack.Screen name="watch-party/live-stage/index" />
        <Stack.Screen name="watch-party/live-stage/[partyId]" />
        <Stack.Screen name="communication/index" />
        <Stack.Screen name="communication/[roomId]" />
        <Stack.Screen name="chat/index" />
        <Stack.Screen name="chat/[threadId]" />
        <Stack.Screen name="profile/[userId]" />
        <Stack.Screen name="channel/[userId]" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="auth-callback" />
        <Stack.Screen name="auth/callback" />
        <Stack.Screen name="auth/index" />
        <Stack.Screen name="auth/verify" />
        <Stack.Screen name="auth/v1/index" />
        <Stack.Screen name="auth/v1/verify" />
        <Stack.Screen name="callback" />
        <Stack.Screen name="verify" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="subscribe" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="channel-studio/index" />
        <Stack.Screen name="channel-settings" />
        <Stack.Screen name="support" />
        <Stack.Screen name="support-policy" />
        <Stack.Screen name="premium-terms" />
        <Stack.Screen name="live-rules" />
        <Stack.Screen name="law-enforcement" />
        <Stack.Screen name="moderation-policy" />
        <Stack.Screen name="creator-monetization" />
        <Stack.Screen name="copyright-report" />
        <Stack.Screen name="beta-support" />
        <Stack.Screen name="modal" options={{ presentation: "modal" }} />
      </Stack>
      {hideDebugOverlay ? null : <DevDebugOverlay />}
    </>
  );
}

function AuthBootScreen({ message = "Checking your session…" }: { message?: string }) {
  return (
    <View style={styles.authBootScreen}>
      <ActivityIndicator color="#DC143C" />
      <Text style={styles.authBootText}>{message}</Text>
    </View>
  );
}

function AccountRestoreOnlyScreen() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restore = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const result = await restoreScheduledAccountDeletion();
      if (!result.restored) throw new Error("account_restore_not_confirmed");
      await supabase.auth.refreshSession();
    } catch {
      setError("The server did not confirm restoration. This account remains limited; try again.");
    } finally { setBusy(false); }
  };
  return (
    <View style={styles.legalGateScreen}>
      <View style={styles.legalGateCard}>
        <Text style={styles.legalGateKicker}>ACCOUNT DELETION SCHEDULED</Text>
        <Text style={styles.legalGateTitle}>Restore or sign out</Text>
        <Text style={styles.legalGateBody}>Private features and notifications remain off. Restore this account before continuing.</Text>
        {error ? <Text style={styles.legalGateError}>{error}</Text> : null}
        <TouchableOpacity style={styles.legalGateButton} onPress={() => { void restore(); }} disabled={busy}>
          <Text style={styles.legalGateButtonText}>{busy ? "Restoring…" : "Restore account"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.legalGateSecondary} onPress={() => { void supabase.auth.signOut(); }}>
          <Text style={styles.legalGateSecondaryText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function LegalAcceptanceScreen({ readback, onAccepted, onRetry }: {
  readback: LegalRequirementsReadback | null; onAccepted: (value: LegalRequirementsReadback) => void; onRetry: () => void;
}) {
  const router = useRouter();
  const { authority } = useSession();
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    if (!authority || !confirmed || busy) return;
    setBusy(true); setError(null);
    const result = await recordAccountLegalAcceptance(supabase, authority.userId, "account", readback).catch(() => null);
    setBusy(false);
    if (!result?.ok) { setError("Chi'llywood could not verify this acceptance. Nothing was unlocked; try again."); return; }
    setConfirmed(false); onAccepted(result.readback);
  };

  return (
    <View style={styles.legalGateScreen}>
      <View style={styles.legalGateCard}>
        <Text style={styles.legalGateKicker}>ACCOUNT REQUIREMENT</Text>
        <Text style={styles.legalGateTitle}>Review current policies</Text>
        <Text style={styles.legalGateBody}>Acceptance is server-recorded for this exact account, version, U.S. market, and session.</Text>
        {readback ? readback.requirements.map((requirement) => {
          const document = getLegalDocument(requirement.documentKey);
          return (
            <TouchableOpacity key={requirement.documentKey} style={styles.legalGatePolicy} accessibilityRole="link"
              onPress={() => document && router.push(document.path as Parameters<typeof router.push>[0])}>
              <Text style={styles.legalGatePolicyTitle}>{document?.title ?? requirement.documentKey}</Text>
              <Text style={styles.legalGatePolicyVersion}>Version {requirement.version} · Review</Text>
            </TouchableOpacity>
          );
        }) : (
          <Text style={styles.legalGateError}>Required policy versions are unavailable. Protected use remains locked.</Text>
        )}
        {readback ? (
          <TouchableOpacity style={styles.legalGateConfirm} onPress={() => setConfirmed((value) => !value)}
            accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }}>
            <Text style={styles.legalGateCheck}>{confirmed ? "✓" : ""}</Text>
            <Text style={styles.legalGateConfirmText}>I reviewed and accept every policy version listed above.</Text>
          </TouchableOpacity>
        ) : null}
        {error ? <Text style={styles.legalGateError}>{error}</Text> : null}
        <TouchableOpacity style={[styles.legalGateButton, (!readback || !confirmed || busy) && styles.legalGateButtonDisabled]}
          disabled={!readback || !confirmed || busy} onPress={() => { void accept(); }} accessibilityRole="button">
          <Text style={styles.legalGateButtonText}>{busy ? "Verifying…" : "Accept and continue"}</Text>
        </TouchableOpacity>
        {!readback ? (
          <TouchableOpacity style={styles.legalGateSecondary} onPress={onRetry} accessibilityRole="button">
            <Text style={styles.legalGateSecondaryText}>Retry verification</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.legalGateSecondary} onPress={() => { void supabase.auth.signOut(); }} accessibilityRole="button">
          <Text style={styles.legalGateSecondaryText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function AuthRouteGate() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const segments = useSegments();
  const { authority, authorityStatus, isLoading, isPasswordRecoverySession, isSignedIn } = useSession();
  const [initialReplayDeepLink, setInitialReplayDeepLink] = useState<boolean | null>(null);
  const [legalReadback, setLegalReadback] = useState<LegalRequirementsReadback | null>(null);
  const [legalStatus, setLegalStatus] = useState<"idle" | "checking" | "accepted" | "required" | "error">("idle");
  const [acceptedLegalVerificationKey, setAcceptedLegalVerificationKey] = useState("");
  const [legalRetry, setLegalRetry] = useState(0);
  const [settledLegalRetry, setSettledLegalRetry] = useState(-1);
  const [settledLegalVerificationKey, setSettledLegalVerificationKey] = useState("");
  const authNavigationStartedRef = useRef(false);
  const legalAppStateRef = useRef(AppState.currentState);
  const legalRequestGenerationRef = useRef(0);

  const redirectTo = serializeRedirectTarget(pathname, params as Record<string, unknown>);
  const authRedirectId = String(params.redirectId ?? "").trim();
  const insideAuthGroup = segments[0] === "(auth)";
  const insideTabsGroup = segments[0] === "(tabs)" || pathname === "/";
  const insideResetPassword = pathname === "/reset-password";
  const waitingForInitialReplayDeepLink = !isSignedIn && insideTabsGroup && initialReplayDeepLink === null;
  const allowInitialReplayDeepLink = !isSignedIn && insideTabsGroup && initialReplayDeepLink === true;
  const legalGateApplicable = isSignedIn
    && !isPasswordRecoverySession && !isPublicLegalPath(pathname)
    && !["/auth-callback", "/callback", "/confirm", "/verify", "/reset-password"].includes(pathname)
    && !pathname.startsWith("/auth/");
  const authorityUserId = authority?.userId ?? "";
  const authorityAccountId = authority?.accountId ?? "";
  const authoritySessionGeneration = authority?.sessionGeneration ?? "";
  const authorityState = authority?.state;
  const authorityRestoreOnly = authority?.restoreOnly;
  const legalAuthority = useMemo(() => (
    legalGateApplicable
    && authorityUserId
    && authorityAccountId === authorityUserId
    && authoritySessionGeneration
    && authorityState === "ACTIVE"
    && authorityRestoreOnly === false
      ? {
          userId: authorityUserId,
          accountId: authorityAccountId,
          sessionGeneration: authoritySessionGeneration,
          state: "ACTIVE" as const,
          restoreOnly: false,
        }
      : null
  ), [authorityAccountId, authorityRestoreOnly, authoritySessionGeneration, authorityState, authorityUserId, legalGateApplicable]);
  const legalVerificationKey = accountLegalVerificationKey(legalAuthority);
  const legalVerificationKeyRef = useRef(legalVerificationKey);
  legalVerificationKeyRef.current = legalVerificationKey;
  const legalCheckPending = legalGateApplicable && accountLegalCheckIsPending({
    settledRetry: settledLegalRetry,
    currentRetry: legalRetry,
    settledVerificationKey: settledLegalVerificationKey,
    currentVerificationKey: legalVerificationKey,
  });
  const legalGateBlocking = legalGateApplicable
    && (legalCheckPending || legalStatus !== "accepted" || acceptedLegalVerificationKey !== legalVerificationKey);

  useEffect(() => {
    if (!legalGateApplicable || !legalAuthority || !legalVerificationKey) {
      legalRequestGenerationRef.current += 1;
      setLegalReadback(null); setLegalStatus("idle"); setAcceptedLegalVerificationKey("");
      setSettledLegalRetry(-1); setSettledLegalVerificationKey("");
      return;
    }
    const requestGeneration = legalRequestGenerationRef.current + 1;
    legalRequestGenerationRef.current = requestGeneration;
    const requestVerificationKey = legalVerificationKey;
    const requestRetry = legalRetry;
    setLegalReadback(null); setLegalStatus("checking"); setAcceptedLegalVerificationKey("");
    void resolveAccountLegalRequirements(supabase, legalAuthority)
      .then((resolution) => {
        if (!isCurrentAccountLegalRequest({
          requestGeneration,
          currentGeneration: legalRequestGenerationRef.current,
          requestVerificationKey,
          currentVerificationKey: legalVerificationKeyRef.current,
        })) return;
        setLegalReadback(resolution.readback); setLegalStatus(resolution.status);
        setSettledLegalRetry(requestRetry); setSettledLegalVerificationKey(requestVerificationKey);
        setAcceptedLegalVerificationKey(resolution.status === "accepted" ? requestVerificationKey : "");
      })
      .catch(() => {
        if (isCurrentAccountLegalRequest({
          requestGeneration,
          currentGeneration: legalRequestGenerationRef.current,
          requestVerificationKey,
          currentVerificationKey: legalVerificationKeyRef.current,
        })) {
          setLegalReadback(null); setLegalStatus("error"); setAcceptedLegalVerificationKey("");
          setSettledLegalRetry(requestRetry); setSettledLegalVerificationKey(requestVerificationKey);
        }
      });
    return () => {
      if (legalRequestGenerationRef.current === requestGeneration) legalRequestGenerationRef.current += 1;
    };
  }, [legalAuthority, legalGateApplicable, legalRetry, legalVerificationKey]);

  useEffect(() => {
    if (!legalGateApplicable) return;
    legalAppStateRef.current = AppState.currentState;
    const subscription = AppState.addEventListener("change", (state) => {
      const previousState = legalAppStateRef.current;
      legalAppStateRef.current = state;
      if (shouldRefreshAccountLegalRequirements(previousState, state)) {
        setLegalRetry((value) => value + 1);
      }
    });
    return () => subscription.remove();
  }, [legalGateApplicable]);

  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    Linking.getInitialURL()
      .then((url) => {
        if (!active) return;
        const publicLegalRoute = getPublicLegalRouteFromUrl(url);
        if (publicLegalRoute) {
          setInitialReplayDeepLink(false);
          router.replace(publicLegalRoute as Parameters<typeof router.replace>[0]);
          return;
        }

        const isReplayDeepLink = isCreatorReplayPlayerDeepLink(url);
        setInitialReplayDeepLink(isReplayDeepLink);
        if (isReplayDeepLink) {
          timeout = setTimeout(() => {
            if (active) setInitialReplayDeepLink(false);
          }, 1800);
        }
      })
      .catch(() => {
        if (!active) return;
        setInitialReplayDeepLink(false);
      });

    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [router]);

  useEffect(() => {
    if (authorityStatus === "restore_only" || authorityStatus === "restricted" || authorityStatus === "unknown") return;
    if (isLoading) return;
    if (authorityStatus === "recovery_only") {
      if (!insideResetPassword) router.replace("/reset-password");
      return;
    }
    if (waitingForInitialReplayDeepLink || allowInitialReplayDeepLink) return;

    if (!isSignedIn && insideTabsGroup) {
      const redirectId = registerAuthRedirect(redirectTo);
      router.replace({ pathname: "/(auth)/login", params: redirectId ? { redirectId } : {} });
      return;
    }

    if (!isSignedIn) { authNavigationStartedRef.current = false; return; }

    if (isSignedIn && insideAuthGroup && !legalGateBlocking && authority && !authNavigationStartedRef.current) {
      authNavigationStartedRef.current = true;
      const target = consumeRegisteredAuthRedirect(authRedirectId, authority) ?? "/";
      router.replace(target as Parameters<typeof router.replace>[0]);
    }
  }, [allowInitialReplayDeepLink, authRedirectId, authority, authorityStatus, insideAuthGroup, insideResetPassword, insideTabsGroup, isLoading, isPasswordRecoverySession, isSignedIn, legalGateBlocking, redirectTo, router, waitingForInitialReplayDeepLink]);

  if (authorityStatus === "restore_only") return <AccountRestoreOnlyScreen />;
  if (authorityStatus === "restricted") return <AuthBootScreen message="This session is restricted and is being signed out safely." />;
  if (authorityStatus === "recovery_only" && !insideResetPassword) return <AuthBootScreen message="Password recovery must finish before protected access resumes." />;

  let navigationBlocker: React.ReactNode = null;
  if (authorityStatus === "unknown") {
    navigationBlocker = <AuthBootScreen message="Protected access remains locked because session authority is unavailable." />;
  } else if (legalGateBlocking) {
    navigationBlocker = legalCheckPending || legalStatus === "checking" || legalStatus === "idle"
      ? <AuthBootScreen message="Checking current policy requirements…" />
      : (
        <LegalAcceptanceScreen
          readback={legalStatus === "required" ? legalReadback : null}
          onAccepted={(next) => {
            setLegalReadback(next); setLegalStatus("accepted"); setAcceptedLegalVerificationKey(legalVerificationKey);
          }}
          onRetry={() => setLegalRetry((value) => value + 1)}
        />
      );
  } else if (
    isLoading
    || waitingForInitialReplayDeepLink
    || (!allowInitialReplayDeepLink && !isSignedIn && insideTabsGroup)
    || (isSignedIn && insideAuthGroup)
  ) {
    navigationBlocker = <AuthBootScreen />;
  }

  return (
    <View style={styles.appRootReady} testID="app-root-ready">
      <RootNavigator />
      {navigationBlocker ? (
        <View
          pointerEvents="auto"
          style={styles.navigationBlockingOverlay}
          testID="navigation-blocking-overlay"
        >
          {navigationBlocker}
        </View>
      ) : null}
    </View>
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

function PublicLegalNavigator() {
  return (
    <SessionProvider>
      <DefaultOrientationLock />
      <BetaProgramProvider>
        <RootErrorBoundary>
          <Stack screenOptions={{ headerShown: false }} />
        </RootErrorBoundary>
      </BetaProgramProvider>
    </SessionProvider>
  );
}

export default function RootLayout() {
  const pathname = usePathname();
  const params = useGlobalSearchParams<Record<string, string | string[]>>();
  const publicLegalPath = isPublicLegalPath(pathname);
  const publicLegalPathWithNoAuthData = publicLegalPath && !hasAuthLinkLikeParams(params as Record<string, unknown>);

  if (!isRuntimeConfigValid() && !publicLegalPathWithNoAuthData) {
    const message = getRuntimeConfigIssueSummary();
    if (__DEV__) {
      throw new Error(message);
    }

    return <RuntimeUnavailableScreen message={message} />;
  }

  if (publicLegalPathWithNoAuthData) {
    return <PublicLegalNavigator />;
  }

  return (
    <SessionProvider>
      <DefaultOrientationLock />
      <AndroidNativeCallRouteBridge />
      <RuntimeUpdateGate />
      <FirebaseRuntimeBridge />
      <RevenueCatBootstrap />
      <IosNativeCallsBridge />
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
  appRootReady: {
    flex: 1,
  },
  navigationBlockingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#05060A",
    elevation: 100,
    zIndex: 100,
  },
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
    maxWidth: 320,
    textAlign: "center",
  },
  legalGateScreen: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#05060A", padding: 22 },
  legalGateCard: { width: "100%", maxWidth: 520, borderRadius: 22, borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)", backgroundColor: "#0C0E14", gap: 12, padding: 22 },
  legalGateKicker: { color: "#DC143C", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  legalGateTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "900" },
  legalGateBody: { color: "#AAB4C8", fontSize: 14, fontWeight: "600", lineHeight: 20 },
  legalGatePolicy: { borderRadius: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", padding: 12 },
  legalGatePolicyTitle: { color: "#F4F7FC", fontSize: 14, fontWeight: "800" },
  legalGatePolicyVersion: { color: "#8E9AB0", fontSize: 12, fontWeight: "600", marginTop: 3 },
  legalGateConfirm: { alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 4 },
  legalGateCheck: { width: 24, height: 24, borderRadius: 6, borderWidth: 1,
    borderColor: "#DC143C", color: "#FFFFFF", textAlign: "center" },
  legalGateConfirmText: { color: "#E6EAF2", flex: 1, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  legalGateError: { color: "#FFB4C1", fontSize: 13, fontWeight: "700", lineHeight: 18 },
  legalGateButton: { alignItems: "center", backgroundColor: "#DC143C", borderRadius: 12, padding: 14 },
  legalGateButtonDisabled: { opacity: 0.45 },
  legalGateButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  legalGateSecondary: { alignItems: "center", padding: 8 },
  legalGateSecondaryText: { color: "#C8D0DF", fontSize: 13, fontWeight: "800" },
  incomingCallBannerOverlay: {
    position: "absolute",
    top: 18,
    left: 14,
    right: 14,
    zIndex: 40,
  },
  incomingCallBannerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(169,246,210,0.34)",
    backgroundColor: "rgba(7,16,20,0.96)",
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.26,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  incomingCallOpenAction: {
    gap: 4,
  },
  incomingCallEyebrow: {
    color: "#A9F6D2",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  incomingCallTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  incomingCallBody: {
    color: "#D7E4EA",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  incomingCallActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  incomingCallButton: {
    minHeight: 34,
    borderRadius: 17,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  incomingCallSecondaryButton: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  incomingCallPrimaryButton: {
    flexGrow: 1,
    backgroundColor: "#A9F6D2",
  },
  incomingCallDeclineButton: {
    backgroundColor: "#B91C1C",
  },
  incomingCallSecondaryText: {
    color: "#D7E4EA",
    fontSize: 12,
    fontWeight: "900",
  },
  incomingCallPrimaryText: {
    color: "#071014",
    fontSize: 12,
    fontWeight: "900",
  },
  incomingCallDeclineText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  roomSafeActivityToastOverlay: {
    position: "absolute",
    top: 84,
    left: 14,
    right: 14,
    zIndex: 35,
    alignItems: "center",
  },
  roomSafeActivityToast: {
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(7,12,18,0.92)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  roomSafeActivityToastTitle: {
    color: "#F4F7FC",
    fontSize: 13,
    fontWeight: "900",
  },
  roomSafeActivityToastBody: {
    color: "#AAB4C8",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 2,
  },
});
