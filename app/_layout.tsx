import { Stack, useGlobalSearchParams, usePathname, useRouter, useSegments } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, Vibration, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { setAnalyticsSink, trackEvent, trackScreen, type AnalyticsPayload } from "../_lib/analytics";
import { restoreScheduledAccountDeletion } from "../_lib/accountDeletionRequests";
import { getAccountNavigationTreeKey } from "../_lib/accountSessionAuthority";
import {
  accountLegalCheckIsPending,
  accountLegalVerificationKey,
  isCurrentAccountLegalRequest,
  recordAccountLegalAcceptance,
  resolveAccountLegalRequirements,
  shouldBlockAccountLegalGate,
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
  completeIosNativeCallTerminalTransition,
  drainIosNativeCallPendingEvents,
  hasIosNativeCallPresentation,
  isIosNativeCallsRuntimeEnabled,
  readIosNativeCallPresentations,
  reportIosNativeCallRemoteEnd,
  requestIosNativeCallAnswer,
  revokeIosVoipRegistration,
  startIosNativeCallsReadiness,
  subscribeToIosNativeCallPresentation,
  waitForIosNativeCallAnswerRouteReadiness,
  waitForIosNativeCallPresentation,
  type SanitizedNativeCallEvent,
} from "../_lib/iosNativeCalls";
import { resolveIosNativeCallBridgeLifecycle } from "../_lib/iosNativeCallBridgeLifecycle.mjs";
import {
  containsSensitiveNativeCallClaimRouteParams,
  consumeTrustedAndroidNativeActionStoreClaim,
  createForegroundAuthenticatedUiCallIntent,
  createIosCallKitAnswerRouteHandler,
  resolveIosForegroundIncomingAnswerAuthority,
  sanitizeExternalIosNativeCallPath,
} from "../_lib/nativeCallTransitionProvenance.mjs";
import { BetaWelcomeSheet } from "../components/beta/beta-welcome-sheet";
import DevDebugOverlay from "../components/dev/dev-debug-overlay";
import { RootErrorBoundary } from "../components/system/root-error-boundary";
import { RuntimeUnavailableScreen } from "../components/system/runtime-unavailable-screen";
import InterstitialAdController from "../components/ads/InterstitialController";
import { ChillywoodBrandedSurface, ChillywoodGlassPanel } from "../components/ui/chillywood-branded-surface";
import { ChillywoodPrimaryActionFill } from "../components/ui/chillywood-visual-system";

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

function useIncomingCallActionOwnership(contextKey: string) {
  type ActionOwner = { key: string; pending: boolean; settled: boolean };
  const ownerRef = useRef<ActionOwner | null>(null);
  useLayoutEffect(() => {
    const owner = contextKey ? { key: contextKey, pending: false, settled: false } : null;
    ownerRef.current = owner;
    return () => {
      if (ownerRef.current === owner) ownerRef.current = null;
    };
  }, [contextKey]);
  return {
    begin: () => {
      const owner = ownerRef.current;
      // A retained callback cannot borrow a replacement context. Reserve this
      // owner synchronously so two taps cannot race before React commits.
      if (!owner || owner.key !== contextKey || owner.pending || owner.settled) return null;
      owner.pending = true;
      return owner;
    },
    isCurrent: (owner: ActionOwner | null) => !!owner && ownerRef.current === owner,
    finish: (owner: ActionOwner, settled: boolean) => {
      if (ownerRef.current !== owner) return;
      owner.pending = false;
      // Failed actions remain retryable; successful ones stay retired through
      // the interval between clearAlert() and the next committed render.
      owner.settled = settled;
    },
  };
}

function useIncomingCallAlertDeadline(
  alert: IncomingCallAlert | null,
  setAlert: React.Dispatch<React.SetStateAction<IncomingCallAlert | null>>,
  timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
) {
  const inviteId = alert?.invite?.id ?? "";
  const status = alert?.invite?.status;
  const expiresAt = alert?.invite?.expiresAt ?? "";
  useEffect(() => {
    // A notification is only a hint until server readback supplies its invite.
    // It cannot invent or renew a ringing lifetime. Accepted calls are governed
    // by room liveness, not by the former ringing deadline.
    if (!inviteId || status !== "ringing") return;
    const deadline = Date.parse(expiresAt);
    const clearExactRingingAlert = () => {
      setAlert((current) => current?.invite?.id === inviteId
        && current.invite.status === "ringing" && current.invite.expiresAt === expiresAt
        ? null : current);
    };
    if (!Number.isFinite(deadline) || deadline <= Date.now()) {
      clearExactRingingAlert();
      return;
    }
    const timer = setTimeout(() => {
      if (timerRef.current !== timer) return;
      timerRef.current = null;
      clearExactRingingAlert();
    }, deadline - Date.now());
    timerRef.current = timer;
    return () => {
      clearTimeout(timer);
      if (timerRef.current === timer) timerRef.current = null;
    };
  }, [expiresAt, inviteId, setAlert, status, timerRef]);
}

function mergeIncomingCallAlert(current: IncomingCallAlert | null, nextAlert: IncomingCallAlert) {
  if (!current) return nextAlert;
  const merged = { ...current, ...nextAlert };
  const sameInvite = current.invite === merged.invite || (!!current.invite && !!merged.invite
    && Object.keys(current.invite).length === Object.keys(merged.invite).length
    && (Object.keys(merged.invite) as (keyof ChillyChatCallInvite)[])
      .every((key) => current.invite?.[key] === merged.invite?.[key]));
  const samePresentation = (Object.keys(merged) as (keyof IncomingCallAlert)[])
    .every((key) => key === "invite" || current[key] === merged[key]);
  // Preserve effect identity across unchanged polling readbacks so attention
  // does not stop/restart every three seconds. Real status/deadline changes win.
  return sameInvite && samePresentation ? current : merged;
}

function IncomingCallNotificationBridge() {
  const router = useRouter();
  const pathname = usePathname();
  const { authority, isSignedIn, user } = useSession();
  const [alert, setAlert] = useState<IncomingCallAlert | null>(null);
  const currentAlertInviteId = String(alert?.invite?.id ?? alert?.inviteId ?? "").trim();
  const currentAlertUserId = String(user?.id ?? "").trim();
  const incomingActionKey = isSignedIn && authority?.state === "ACTIVE"
    && authority.restoreOnly === false && authority.userId === currentAlertUserId
    && authority.accountId === currentAlertUserId && authority.sessionGeneration && currentAlertInviteId
    ? JSON.stringify([currentAlertUserId, authority.accountId, authority.sessionGeneration, currentAlertInviteId])
    : "";
  const incomingActionOwner = useIncomingCallActionOwnership(incomingActionKey);
  const [appState, setAppState] = useState(AppState.currentState);
  const [callPreferences, setCallPreferences] = useState<NotificationPreferenceSettings | null>(null);
  const [iosNativePresentationRevision, bumpIosNativePresentationRevision] = useState(0);
  const [iosNativePresentationGraceReadyInviteId, setIosNativePresentationGraceReadyInviteId] = useState("");
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incomingCallSoundRef = useRef<ChillyChatPlayingSound | null>(null);
  const latestInviteAlertIdRef = useRef("");
  useIncomingCallAlertDeadline(alert, setAlert, dismissTimeoutRef);

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
        // Refresh semantic status/deadline even when the invite ID is stable.
        setAlert((current) => mergeIncomingCallAlert(current, nextAlert));
      }
      return;
    }
    if (nextAlert.inviteId) latestInviteAlertIdRef.current = nextAlert.inviteId;
    setAlert(nextAlert);
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
    const callInviteId = String(input.callInviteId ?? "").trim();
    const userId = String(user?.id ?? "").trim();
    if (!callInviteId || !userId) return;
    const exactInput = {
      ...input,
      callInviteId,
      exactInviteOnly: true,
    };
    void dismissPresentedChillyChatCallNotifications(exactInput);
    void dismissChillyChatCallNotificationRows({ ...exactInput, userId });
    [750, 1800, 5000].forEach((delayMs) => {
      setTimeout(() => {
        void dismissPresentedChillyChatCallNotifications(exactInput);
        void dismissChillyChatCallNotificationRows({ ...exactInput, userId });
      }, delayMs);
    });
  };

  const openCall = async () => {
    const operation = incomingActionOwner.begin();
    if (!operation) return;
    let completed = false;
    try {
      const actorUserId = String(user?.id ?? "").trim();
      const inviteId = String(alert.invite?.id ?? alert.inviteId ?? "").trim();
      const invite = inviteId
        ? await readChillyChatCallInvite(inviteId).catch(() => null)
        : null;
      if (!incomingActionOwner.isCurrent(operation)) return;
      if (
        !actorUserId
        || !invite
        || invite.id !== inviteId
        || invite.calleeUserId !== actorUserId
        || invite.callerUserId === actorUserId
        || (invite.status !== "ringing" && invite.status !== "accepted")
      ) {
        Alert.alert("Call unavailable", "This Chi'lly Chat call can no longer be answered.");
        return;
      }
      const nativePresentationWaitOutcome = Platform.OS === "ios"
        ? await waitForIosNativeCallPresentation(invite.id)
        : "not_expected";
      if (!incomingActionOwner.isCurrent(operation)) return;
      const answerAuthority = resolveIosForegroundIncomingAnswerAuthority(nativePresentationWaitOutcome);
      if (answerAuthority === "native_answer") {
        const nativeAnswerRequested = await requestIosNativeCallAnswer(invite.id);
        if (!incomingActionOwner.isCurrent(operation)) return;
        if (!nativeAnswerRequested) {
          Alert.alert("Unable to answer", "The call remains available if it is still ringing. Try again from the chat thread.");
          return;
        }
        cleanupChillyChatCallNotifications({
          callInviteId: invite.id,
          path: alert.path,
          presentedNotificationId: alert.presentedNotificationId ?? null,
          threadId: invite.threadId,
        });
        clearAlert();
        completed = true;
        return;
      }
      if (answerAuthority === "blocked") {
        Alert.alert(
          "Still preparing this call",
          "iPhone is still preparing the incoming call. Answer from the iPhone call alert when it appears.",
        );
        return;
      }
      const acceptedInvite = invite.status === "accepted"
        ? invite
        : await updateChillyChatCallInviteStatus({
          actorUserId,
          invite,
          status: "accepted",
        }).catch(() => null);
      if (!incomingActionOwner.isCurrent(operation)) return;
      if (!acceptedInvite || acceptedInvite.status !== "accepted"
        || acceptedInvite.id !== inviteId || acceptedInvite.threadId !== invite.threadId) {
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
      completed = true;
      router.push({
        pathname: "/chat/[threadId]",
        params: {
          callInviteId: acceptedInvite.id,
          foregroundCallClaim: trustedUiIntent.claimId,
          openCall: "1",
          threadId: acceptedInvite.threadId,
        },
      });
    } finally {
      incomingActionOwner.finish(operation, completed);
    }
  };

  const decline = async () => {
    if (!authority) return;
    const operation = incomingActionOwner.begin();
    if (!operation) return;
    let completed = false;
    try {
      const inviteId = String(alert.invite?.id ?? alert.inviteId ?? "").trim();
      const actorUserId = String(user?.id ?? "").trim();
      const invite = inviteId
        ? await readChillyChatCallInvite(inviteId).catch(() => null)
        : null;
      if (!incomingActionOwner.isCurrent(operation)) return;
      const exactRecipient = !!invite
        && invite.id === inviteId
        && !!actorUserId
        && invite.calleeUserId === actorUserId
        && invite.callerUserId !== actorUserId;
      if (!exactRecipient || !invite) {
        Alert.alert("Unable to decline", "The call state could not be verified. Open the chat thread and try again.");
        return;
      }
      const declinedInvite = invite.status === "ringing"
        ? await updateChillyChatCallInviteStatus({
          actorUserId,
          invite,
          status: "declined",
        }).catch(() => null)
        : invite;
      if (!incomingActionOwner.isCurrent(operation)) return;
      const terminal = declinedInvite?.status === "declined"
        || declinedInvite?.status === "missed"
        || declinedInvite?.status === "canceled"
        || declinedInvite?.status === "ended"
        || declinedInvite?.status === "busy";
      if (!terminal || !declinedInvite || declinedInvite.id !== inviteId
        || declinedInvite.threadId !== invite.threadId) {
        Alert.alert("Unable to decline", "The call is still changing state. Try again from the chat thread.");
        return;
      }
      await clearEndedChatThreadCall(declinedInvite.threadId, declinedInvite.communicationRoomId, authority).catch(() => null);
      if (!incomingActionOwner.isCurrent(operation)) return;
      await dismissPresentedChillyChatCallNotifications({
        callInviteId: declinedInvite.id,
        exactInviteOnly: true,
        path: alert.path,
        presentedNotificationId: alert.presentedNotificationId ?? null,
        threadId: declinedInvite.threadId,
      }).catch(() => 0);
      if (!incomingActionOwner.isCurrent(operation)) return;
      await dismissChillyChatCallNotificationRows({
        callInviteId: declinedInvite.id,
        exactInviteOnly: true,
        threadId: declinedInvite.threadId,
        userId: actorUserId,
      }).catch(() => 0);
      if (!incomingActionOwner.isCurrent(operation)) return;
      cleanupChillyChatCallNotifications({
        callInviteId: declinedInvite.id,
        path: alert.path,
        presentedNotificationId: alert.presentedNotificationId ?? null,
        threadId: declinedInvite.threadId,
      });
      clearAlert();
      completed = true;
    } finally {
      incomingActionOwner.finish(operation, completed);
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
  const { authority: sessionAuthority, authorityStatus, user } = useSession();
  const currentUserId = String(user?.id ?? "").trim();
  const authorityUserId = sessionAuthority?.userId ?? "";
  const authorityAccountId = sessionAuthority?.accountId ?? "";
  const authorityGeneration = sessionAuthority?.sessionGeneration ?? "";
  const authorityState = sessionAuthority?.state;
  const authorityRestoreOnly = sessionAuthority?.restoreOnly;
  const authority = useMemo(() => authorityState === "ACTIVE" && typeof authorityRestoreOnly === "boolean"
    ? { userId: authorityUserId, accountId: authorityAccountId, sessionGeneration: authorityGeneration, state: authorityState, restoreOnly: authorityRestoreOnly }
    : null, [authorityAccountId, authorityGeneration, authorityRestoreOnly, authorityState, authorityUserId]);
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);
  const inviteSubscriptionsRef = useRef(new Map<string, () => void>());
  const nativeCallDescriptorsRef = useRef(new Map<string, {
    callUuid: string;
    reconcile(): Promise<void>;
    dispose(): void;
  }>());
  const activeNativeAuthorityKeyRef = useRef("");

  useEffect(() => {
    let active = true;
    const lifecycle = resolveIosNativeCallBridgeLifecycle({
      authority,
      authorityStatus,
      hadActiveAuthority: !!activeNativeAuthorityKeyRef.current,
      userId: currentUserId,
    });

    const clearInviteSubscription = (inviteId: string) => {
      nativeCallDescriptorsRef.current.get(inviteId)?.dispose();
      inviteSubscriptionsRef.current.get(inviteId)?.();
      inviteSubscriptionsRef.current.delete(inviteId);
      nativeCallDescriptorsRef.current.delete(inviteId);
    };
    const clearInviteSubscriptions = () => {
      nativeCallDescriptorsRef.current.forEach((descriptor) => descriptor.dispose());
      inviteSubscriptionsRef.current.forEach((unsubscribe) => unsubscribe());
      inviteSubscriptionsRef.current.clear();
      nativeCallDescriptorsRef.current.clear();
    };

    if (lifecycle.action !== "start" || !authority) {
      nativeCallDescriptorsRef.current.forEach((descriptor) => {
        void reportIosNativeCallRemoteEnd(descriptor.callUuid, "account_transition");
      });
      clearInviteSubscriptions();
      if (lifecycle.action === "revoke") {
        activeNativeAuthorityKeyRef.current = "";
        void revokeIosVoipRegistration();
      }
      return () => {
        active = false;
        clearInviteSubscriptions();
      };
    }

    activeNativeAuthorityKeyRef.current = lifecycle.bindingKey;
    const ownsAuthority = () => active
      && activeNativeAuthorityKeyRef.current === lifecycle.bindingKey;

    const watchInviteLifecycle = (event: Pick<SanitizedNativeCallEvent, "callInviteId" | "callUuid">) => {
      const inviteId = String(event.callInviteId ?? "").trim();
      const callUuid = String(event.callUuid ?? "").trim();
      if (!active || !inviteId || !callUuid) return;
      if (nativeCallDescriptorsRef.current.get(inviteId)?.callUuid === callUuid
        && inviteSubscriptionsRef.current.has(inviteId)) return;
      clearInviteSubscription(inviteId);
      let reconciling = false;
      let refreshRequested = false;
      let retryCount = 0;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;
      const ownsPresentation = () => ownsAuthority()
        && nativeCallDescriptorsRef.current.get(inviteId) === descriptor;
      const descriptor = {
        callUuid,
        dispose: () => {
          if (retryTimer !== null) clearTimeout(retryTimer);
          retryTimer = null;
        },
        reconcile: async () => {
          if (!ownsPresentation()) return;
          if (reconciling) {
            refreshRequested = true;
            return;
          }
          descriptor.dispose();
          reconciling = true;
          refreshRequested = false;
          let retryNeeded = false;
          try {
            const invite = await readChillyChatCallInvite(inviteId).catch(() => null);
            if (!ownsPresentation()) return;
            if (!invite) {
              retryNeeded = true;
              return;
            }
            if (invite.status === "ringing" || invite.status === "accepted") return;
            // A terminal server row does not prove that CallKit dismissed its
            // presentation. Retain this exact owner until native completion;
            // transient bridge errors must remain retryable on activation.
            await reportIosNativeCallRemoteEnd(callUuid, `invite_${invite.status}`).catch(() => false);
            if (!ownsPresentation()) return;
            // The native promise acknowledges dispatch to the main queue; the
            // exact remoteEnded event below acknowledges presentation removal.
            // A resolved dispatch without that event is still incomplete.
            retryNeeded = true;
          } finally {
            reconciling = false;
            if (ownsPresentation() && (retryNeeded || refreshRequested) && retryCount < 3) {
              retryCount += 1;
              retryTimer = setTimeout(() => { void descriptor.reconcile(); }, 400 * retryCount);
            }
          }
        },
      };
      nativeCallDescriptorsRef.current.set(inviteId, descriptor);

      inviteSubscriptionsRef.current.set(
        inviteId,
        subscribeToChillyChatCallInvite(inviteId, () => {
          retryCount = 0;
          void descriptor.reconcile();
        }),
      );
      void descriptor.reconcile();
    };

    const routeNativeAnswer = createIosCallKitAnswerRouteHandler({
      completeAnswerFailure: (callUuid: string) => completeIosNativeCallAnswer(callUuid, false),
      getAuthenticatedUserId: () => currentUserId,
      isActive: () => active && authorityStatus === "active",
      replace: (destination: string) => {
        routerRef.current.replace(destination as Parameters<typeof routerRef.current.replace>[0]);
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
      if (!ownsAuthority() || !inviteId || !threadId) return false;
      const callUuid = String(event.callUuid ?? "").trim();
      const currentDescriptor = nativeCallDescriptorsRef.current.get(inviteId);
      if (!callUuid || (currentDescriptor && currentDescriptor.callUuid !== callUuid)) return false;
      const ownsNativeAction = () => {
        const descriptor = nativeCallDescriptorsRef.current.get(inviteId);
        return ownsAuthority() && (!descriptor || descriptor.callUuid === callUuid);
      };
      const actionKey = `${inviteId}:${callUuid}:${status}`;
      pendingNativeTerminalActions.set(actionKey, { event, status });
      if (nativeTerminalActionsInFlight.has(actionKey)) return false;
      nativeTerminalActionsInFlight.add(actionKey);

      let settled = false;
      let settledRoomId: string | null = null;
      try {
        for (let attempt = 0; ownsNativeAction() && attempt < 3; attempt += 1) {
          const invite = await readChillyChatCallInvite(inviteId).catch(() => null);
          if (!ownsNativeAction()) return false;
          if (!invite || invite.threadId !== threadId) break;
          settledRoomId = invite.communicationRoomId;

          const actorIsParticipant =
            invite.callerUserId === currentUserId
            || invite.calleeUserId === currentUserId;
          // Failed native Answer can arrive before the server acceptance. The
          // native presentation is already gone, so the callee must decline
          // that still-ringing invite rather than leave a phantom callable row.
          const transitionStatus = status === "ended" && invite.status === "ringing"
            && invite.calleeUserId === currentUserId && invite.callerUserId !== currentUserId
            ? "declined" : status;
          const transitionAllowed = transitionStatus === "declined"
            ? invite.status === "ringing"
              && invite.calleeUserId === currentUserId
              && invite.callerUserId !== currentUserId
            : transitionStatus === "missed"
              ? invite.status === "ringing" && actorIsParticipant
              : invite.status === "accepted" && actorIsParticipant;
          if (!transitionAllowed) {
            settled = invite.status !== "ringing" && invite.status !== "accepted";
            break;
          }

          const updated = await updateChillyChatCallInviteStatus({
            actorUserId: currentUserId,
            invite,
            status: transitionStatus,
          }).catch(() => null);
          // The server operation may finish after sign-out or account/session
          // replacement. Its result cannot authorize this retired bridge to
          // clear the replacement's thread or notification state.
          if (!ownsNativeAction()) return false;
          if (updated?.status === transitionStatus) {
            settled = true;
            break;
          }
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, 450 * (attempt + 1)));
          }
        }

        if (!settled || !ownsNativeAction()) return false;
        await clearEndedChatThreadCall(threadId, settledRoomId, authority).catch(() => null);
        if (!ownsNativeAction()) return false;
        await dismissPresentedChillyChatCallNotifications({
          callInviteId: inviteId,
          exactInviteOnly: true,
          threadId,
        }).catch(() => 0);
        if (!ownsNativeAction()) return false;
        await dismissChillyChatCallNotificationRows({
          callInviteId: inviteId,
          exactInviteOnly: true,
          threadId,
          userId: currentUserId,
        }).catch(() => 0);
        if (!ownsNativeAction()) return false;
        const completed = await completeIosNativeCallTerminalTransition(String(event.callUuid ?? "").trim()).catch(() => false);
        if (!ownsNativeAction() || !completed) return false;
        pendingNativeTerminalActions.delete(actionKey);
        if (nativeCallDescriptorsRef.current.get(inviteId)?.callUuid === String(event.callUuid ?? "").trim()) {
          clearInviteSubscription(inviteId);
        }
        return true;
      } finally {
        nativeTerminalActionsInFlight.delete(actionKey);
        if (!ownsNativeAction()) pendingNativeTerminalActions.delete(actionKey);
      }
    };

    const handleNativeCallEvent = async (event: SanitizedNativeCallEvent) => {
      if (!active) return;
      if (event.type === "incoming" || event.type === "recovered") {
        watchInviteLifecycle(event);
        return;
      }
      if (event.type === "answerRequested") {
        const navigationReady = await waitForIosNativeCallAnswerRouteReadiness(event);
        if (!ownsAuthority()) return;
        if (!navigationReady) {
          await completeIosNativeCallAnswer(String(event.callUuid ?? "").trim(), false).catch(() => false);
          return;
        }
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
        const inviteId = String(event.callInviteId ?? "").trim();
        if (nativeCallDescriptorsRef.current.get(inviteId)?.callUuid === String(event.callUuid ?? "").trim()) {
          clearInviteSubscription(inviteId);
        }
      }
    };

    void startIosNativeCallsReadiness(authority, handleNativeCallEvent).then((readiness) => {
      if (!active || readiness.status !== "started") return;
      readIosNativeCallPresentations().forEach(watchInviteLifecycle);
    }).catch((error) => reportRuntimeError("ios-native-call-readiness", error));
    const activationSubscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      void drainIosNativeCallPendingEvents();
      pendingNativeTerminalActions.forEach(({ event, status }) => {
        void settleNativeTerminalAction(event, status);
      });
      nativeCallDescriptorsRef.current.forEach((descriptor) => { void descriptor.reconcile(); });
    });

    return () => {
      active = false;
      activationSubscription.remove();
      clearInviteSubscriptions();
    };
  }, [
    authority,
    authorityStatus,
    currentUserId,
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

const getWatchPartyWaitingRoomSingularId = (
  name: string,
  params?: Record<string, unknown>,
) => {
  const exactTarget = [
    params?.mode,
    params?.roomId ?? params?.partyId ?? params?.roomCode,
    params?.source,
    params?.sourceType,
    params?.sourceId ?? params?.titleId,
  ].map((value) => String(value ?? "").trim()).join(":");
  return `${name}:${exactTarget}`;
};

function RootNavigator() {
  const params = useGlobalSearchParams<Record<string, string | string[]>>();
  const hideDebugOverlay = containsSensitiveNativeCallClaimRouteParams(params);
  return (
    <>
      <RouteAnalyticsBridge />
      <RoomSafeActivityNotificationBridge />
      <IncomingCallNotificationBridge />
      <InterstitialAdController />
      <Stack initialRouteName="(tabs)" screenOptions={{ headerShown: false, contentStyle: styles.navigatorContent }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="player/[id]" />
        <Stack.Screen name="player/replay/[replayId]" />
        <Stack.Screen name="title/[id]" />
        <Stack.Screen name="watch-party/index" dangerouslySingular={getWatchPartyWaitingRoomSingularId} />
        <Stack.Screen name="watch-party/[partyId]" dangerouslySingular />
        <Stack.Screen name="watch-party/live-stage/index" />
        <Stack.Screen name="watch-party/live-stage/[partyId]" />
        <Stack.Screen name="event/[eventId]" dangerouslySingular />
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

function AuthBootScreen({ message = "Checking your session…", onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.authBootScreen}>
      <ActivityIndicator color="#DC143C" />
      <Text style={styles.authBootText}>{message}</Text>
      {onRetry ? (
        <>
          <TouchableOpacity
            style={styles.legalGateSecondary}
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel="Try session verification again"
          >
            <Text style={styles.legalGateSecondaryText}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.legalGateSecondary}
            onPress={() => { void supabase.auth.signOut(); }}
            accessibilityRole="button"
            accessibilityLabel="Sign out of this session"
          >
            <Text style={styles.legalGateSecondaryText}>Sign out</Text>
          </TouchableOpacity>
        </>
      ) : null}
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
    <ChillywoodBrandedSurface style={[styles.legalBrandedGateScreen, styles.legalGateScroll]} testID="account-restore-branded-surface" variant="legal">
      <ChillywoodGlassPanel style={styles.legalGateCard} testID="account-restore-glass-panel" variant="legal">
        <Text style={styles.legalGateKicker}>ACCOUNT DELETION SCHEDULED</Text>
        <Text style={styles.legalGateTitle}>Restore or sign out</Text>
        <Text style={styles.legalGateBody}>Private features and notifications remain off. Restore this account before continuing.</Text>
        {error ? <Text style={styles.legalGateError}>{error}</Text> : null}
        <TouchableOpacity style={styles.legalGateButton} onPress={() => { void restore(); }} disabled={busy}>
          <ChillywoodPrimaryActionFill />
          <Text style={styles.legalGateButtonText}>{busy ? "Restoring…" : "Restore account"}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.legalGateSecondary} onPress={() => { void supabase.auth.signOut(); }}>
          <Text style={styles.legalGateSecondaryText}>Sign out</Text>
        </TouchableOpacity>
      </ChillywoodGlassPanel>
    </ChillywoodBrandedSurface>
  );
}

function LegalAcceptanceScreen({ readback, onAccepted, onRetry }: {
  readback: LegalRequirementsReadback | null; onAccepted: (value: LegalRequirementsReadback) => void; onRetry: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    <ChillywoodBrandedSurface
      style={styles.legalBrandedGateScreen}
      testID="legal-acceptance-branded-surface"
      variant="legal"
    >
      <ScrollView
        contentContainerStyle={[
          styles.legalGateScroll,
          {
            paddingTop: Math.max(insets.top + 24, 40),
            paddingBottom: Math.max(insets.bottom + 24, 40),
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
      <ChillywoodGlassPanel style={styles.legalGateCard} testID="legal-acceptance-glass-panel" variant="legal">
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
            accessibilityLabel="Accept every current Chi'llywood policy version"
            accessibilityRole="checkbox" accessibilityState={{ checked: confirmed }}
            testID="legal-acceptance-checkbox">
            <Text style={styles.legalGateCheck}>{confirmed ? "✓" : ""}</Text>
            <Text style={styles.legalGateConfirmText}>I reviewed and accept every policy version listed above.</Text>
          </TouchableOpacity>
        ) : null}
        {error ? <Text style={styles.legalGateError}>{error}</Text> : null}
        <TouchableOpacity style={[styles.legalGateButton, (!readback || !confirmed || busy) && styles.legalGateButtonDisabled]}
          disabled={!readback || !confirmed || busy} onPress={() => { void accept(); }}
          accessibilityLabel="Accept current policies and continue" accessibilityRole="button"
          accessibilityState={{ busy, disabled: !readback || !confirmed || busy }}
          testID="legal-acceptance-submit-button">
          <ChillywoodPrimaryActionFill />
          <Text style={styles.legalGateButtonText}>{busy ? "Verifying…" : "Accept and continue"}</Text>
        </TouchableOpacity>
        {!readback ? (
          <TouchableOpacity style={styles.legalGateSecondary} onPress={onRetry} accessibilityRole="button">
            <Text style={styles.legalGateSecondaryText}>Retry verification</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity style={styles.legalGateSecondary} onPress={() => { void supabase.auth.signOut(); }}
          accessibilityLabel="Sign out instead of accepting current policies" accessibilityRole="button">
          <Text style={styles.legalGateSecondaryText}>Sign out</Text>
        </TouchableOpacity>
      </ChillywoodGlassPanel>
      </ScrollView>
    </ChillywoodBrandedSurface>
  );
}

function AuthRouteGate() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const segments = useSegments();
  const { authority, authorityStatus, isLoading, isPasswordRecoverySession, isSignedIn, retryAuthority } = useSession();
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
  const acceptedLegalVerificationKeyRef = useRef("");

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
  const navigationTreeKey = getAccountNavigationTreeKey(authority);
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
  const legalGateBlocking = shouldBlockAccountLegalGate({
    applicable: legalGateApplicable,
    checkPending: legalCheckPending,
    status: legalStatus,
    acceptedVerificationKey: acceptedLegalVerificationKey,
    currentVerificationKey: legalVerificationKey,
  });

  useEffect(() => {
    if (!legalGateApplicable || !legalAuthority || !legalVerificationKey) {
      legalRequestGenerationRef.current += 1;
      acceptedLegalVerificationKeyRef.current = "";
      setLegalReadback(null); setLegalStatus("idle"); setAcceptedLegalVerificationKey("");
      setSettledLegalRetry(-1); setSettledLegalVerificationKey("");
      return;
    }
    const requestGeneration = legalRequestGenerationRef.current + 1;
    legalRequestGenerationRef.current = requestGeneration;
    const requestVerificationKey = legalVerificationKey;
    const requestRetry = legalRetry;
    const preserveAcceptedRender = acceptedLegalVerificationKeyRef.current === requestVerificationKey;
    if (!preserveAcceptedRender) {
      setLegalReadback(null); setLegalStatus("checking"); setAcceptedLegalVerificationKey("");
    }
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
        const acceptedKey = resolution.status === "accepted" ? requestVerificationKey : "";
        acceptedLegalVerificationKeyRef.current = acceptedKey;
        setAcceptedLegalVerificationKey(acceptedKey);
      })
      .catch(() => {
        if (isCurrentAccountLegalRequest({
          requestGeneration,
          currentGeneration: legalRequestGenerationRef.current,
          requestVerificationKey,
          currentVerificationKey: legalVerificationKeyRef.current,
        })) {
          acceptedLegalVerificationKeyRef.current = "";
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
    navigationBlocker = <AuthBootScreen message="Protected access remains locked because session authority is unavailable." onRetry={retryAuthority} />;
  } else if (legalGateBlocking) {
    navigationBlocker = legalCheckPending || legalStatus === "checking" || legalStatus === "idle"
      ? <AuthBootScreen message="Checking current policy requirements…" />
      : (
        <LegalAcceptanceScreen
          readback={legalStatus === "required" ? legalReadback : null}
          onAccepted={(next) => {
            acceptedLegalVerificationKeyRef.current = legalVerificationKey;
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
    <ChillywoodBrandedSurface style={styles.appRootReady} testID="app-root-ready" variant="app">
      <RootNavigator key={navigationTreeKey} />
      {navigationBlocker ? (
        <View
          pointerEvents="auto"
          style={styles.navigationBlockingOverlay}
          testID="navigation-blocking-overlay"
        >
          {navigationBlocker}
        </View>
      ) : null}
    </ChillywoodBrandedSurface>
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
          <ChillywoodBrandedSurface style={styles.appRootReady} variant="app">
            <Stack screenOptions={{ headerShown: false, contentStyle: styles.navigatorContent }} />
          </ChillywoodBrandedSurface>
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
  navigatorContent: {
    backgroundColor: "transparent",
  },
  navigationBlockingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,5,18,0.94)",
    elevation: 100,
    zIndex: 100,
  },
  authBootScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    gap: 10,
  },
  authBootText: {
    color: "#F4F7FC",
    fontSize: 13,
    fontWeight: "600",
    maxWidth: 320,
    textAlign: "center",
  },
  legalBrandedGateScreen: { flex: 1 },
  legalGateScroll: { flexGrow: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 22 },
  legalGateCard: { gap: 14 },
  legalGateKicker: { color: "#D2CFE2", fontSize: 11, fontWeight: "900", letterSpacing: 2.1 },
  legalGateTitle: { color: "#FFFFFF", fontSize: 30, fontWeight: "900" },
  legalGateBody: { color: "#AAB4C8", fontSize: 14, fontWeight: "600", lineHeight: 20 },
  legalGatePolicy: { borderRadius: 16, borderWidth: 1, borderColor: "rgba(102,61,190,0.62)", backgroundColor: "rgba(17,15,42,0.64)", padding: 14 },
  legalGatePolicyTitle: { color: "#F4F7FC", fontSize: 14, fontWeight: "800" },
  legalGatePolicyVersion: { color: "#AAA3C8", fontSize: 12, fontWeight: "700", marginTop: 3 },
  legalGateConfirm: { alignItems: "center", flexDirection: "row", gap: 10, paddingVertical: 4 },
  legalGateCheck: { width: 26, height: 26, borderRadius: 8, borderWidth: 1,
    borderColor: "#7A4DFF", backgroundColor: "rgba(110,33,255,0.2)", color: "#FFFFFF", textAlign: "center" },
  legalGateConfirmText: { color: "#E6EAF2", flex: 1, fontSize: 13, fontWeight: "700", lineHeight: 18 },
  legalGateError: { color: "#FFB4C1", fontSize: 13, fontWeight: "700", lineHeight: 18 },
  legalGateButton: { minHeight: 54, alignItems: "center", justifyContent: "center", backgroundColor: "#5B1DFF", borderRadius: 16, borderWidth: 1, borderColor: "rgba(91,214,255,0.62)", padding: 14, overflow: "hidden" },
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
