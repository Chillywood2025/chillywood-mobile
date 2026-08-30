import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ProfileMediaImage as Image } from "../../components/ui/ProfileMediaImage";

import { trackEvent } from "../../_lib/analytics";
import { DEFAULT_APP_CONFIG, readAppConfig } from "../../_lib/appConfig";
import {
  listChillyChatCallEvents,
  readChillyChatCallInvite,
  readLatestChillyChatCallInviteForRoom,
  readLatestRingingChillyChatCallInvite,
  subscribeToChillyChatCallInvite,
  updateChillyChatCallInviteStatus,
  type ChillyChatCallEvent,
  type ChillyChatCallInvite,
} from "../../_lib/chillyChatCalls";
import { getChillyChatCallDeliveryMessage } from "../../_lib/chillyChatCallDeliveryCopy";
import { resolveAuthoritativeNativeCallDecline } from "../../_lib/chillyChatNativeCallRoutes.mjs";
import {
  playChillyChatCallSound,
  stopChillyChatCallSound,
  type ChillyChatPlayingSound,
} from "../../_lib/chillyChatCallSoundAssets";
import {
  clearEndedChatThreadCall,
  getChatThread,
  listChatMessages,
  markChatThreadRead,
  sendChatMessage,
  startChatThreadCall,
  subscribeToThread,
  type ChatCallType,
  type ChatMessage,
  type ChatThreadMember,
  type ChatThreadSummary,
} from "../../_lib/chat";
import { getCommunicationRoomSnapshot } from "../../_lib/communication";
import {
  completeIosAcceptedNativeAnswer,
  createIosAcceptedCallKitMediaDescriptor,
  doesForegroundAuthenticatedUiCallIntentOwnAction,
  doesNativeCallActionOwnTransition,
  resolveAcceptedChatCallRoomId,
  resolveIncomingCallRoomJoinAction,
  resolveIosChatCallAudioRoute,
  settleIosAcceptedCallKitMediaFailure,
  shouldApplyAuthoritativeChatCallCleanup,
  shouldActivateAcceptedChatCallMedia,
  shouldKeepAcceptedChatCallPanelOpen,
  terminateIosAcceptedNativeAnswer,
  shouldShowOutgoingRingingPanel,
} from "../../_lib/communicationCallMediaPolicy.mjs";
import { normalizeCommunicationRoomIdentifier } from "../../_lib/communicationRoomIdentifier.mjs";
import { decodeVisiblePercentEscapes } from "../../_lib/displayText";
import {
  acceptChillyCircleRequest,
  cancelChillyCircleRequest,
  declineChillyCircleRequest,
  readFriendRelationshipState,
  removeFromChillyCircle,
  sendChillyCircleRequest,
  type FriendRelationshipState,
} from "../../_lib/friendGraph";
import { reportRuntimeError } from "../../_lib/logger";
import {
  completeIosNativeCallAnswer,
  endIosNativeCall,
  hasIosNativeCallPresentation,
  isIosNativeCallsRuntimeEnabled,
  reportIosNativeCallRemoteEnd,
  setIosNativeCallAudioRoute,
  setIosNativeCallMuted,
  subscribeToIosNativeCallEvents,
  subscribeToIosNativeCallPresentation,
} from "../../_lib/iosNativeCalls";
import {
  consumeMountedAndroidNativeCallRoute,
  consumeMountedForegroundAuthenticatedUiCallRoute,
  consumeMountedIosNativeCallRoute,
  subscribeToTrustedAndroidNativeActionRoutes,
} from "../../_lib/nativeCallTransitionProvenance.mjs";
import type { TrustedAndroidNativeActionRoute } from "../../_lib/nativeCallTransitionProvenance.d.ts";
import { buildSafetyReportContext, submitSafetyReport, trackModerationActionUsed } from "../../_lib/moderation";
import {
  dismissChillyChatCallNotificationRows,
  dismissPresentedChillyChatCallNotifications,
  readNotificationPreferences,
  refreshPushRegistrationIfGranted,
  requestPushPermissionAndRegister,
  type NotificationPreferenceSettings,
} from "../../_lib/notifications";
import { getOfficialPlatformAccount } from "../../_lib/officialAccounts";
import {
  READ_RECEIPT_THROTTLE_MS,
} from "../../_lib/performancePolicy";
import { useSession } from "../../_lib/session";
import { formatUsernameHandle } from "../../_lib/usernameHandles";
import {
  SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE,
  type SocialAttachmentPickerScope,
  type SocialAttachmentFile,
} from "../../_lib/socialAttachments";
import { pickSocialAttachmentFile } from "../../_lib/socialAttachmentPicker";
import { InRoomCommunicationPanel } from "../../components/communication/in-room-communication-panel";
import { ReportSheet } from "../../components/safety/report-sheet";
import { LinkedText } from "../../components/social/linked-text";
import { SocialAttachmentActionSheet } from "../../components/social/social-attachment-action-sheet";
import { SocialAttachmentCard } from "../../components/social/social-attachment-card";
import { useChatCallMediaSession } from "../../hooks/use-chat-call-media-session";

const logChatThread = (event: string, details?: Record<string, unknown>) => {
  void event;
  void details;
};

const logChatCall = (event: string, details?: Record<string, unknown>) => {
  void event;
  void details;
};

const IOS_NATIVE_PRESENTATION_GRACE_MS = 1_500;

const buildAuthor = (members: ChatThreadMember[], senderUserId: string) => {
  return members.find((member) => member.userId === senderUserId)?.displayName ?? "User";
};

const formatStamp = (value: string) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const formatCallEventTitle = (event: ChillyChatCallEvent, currentUserId: string) => {
  const callLabel = event.callType === "video" ? "Video call" : "Voice call";
  const actorLabel = event.actorUserId === currentUserId ? "You" : "They";
  switch (event.eventType) {
    case "accepted":
      return `${actorLabel} accepted ${callLabel.toLowerCase()}`;
    case "declined":
      return `${actorLabel} declined ${callLabel.toLowerCase()}`;
    case "missed":
      return `Missed ${callLabel.toLowerCase()}`;
    case "canceled":
      return `${callLabel} canceled`;
    case "ended":
      return event.durationSeconds ? `${callLabel} ended • ${Math.max(1, Math.round(event.durationSeconds / 60))} min` : `${callLabel} ended`;
    case "busy":
      return `${callLabel} busy`;
    case "started":
    default:
      return `${callLabel} started`;
  }
};

const TERMINAL_CHAT_CALL_INVITE_STATUSES = new Set<string>([
  "declined",
  "missed",
  "canceled",
  "ended",
  "busy",
]);
const exactIosAcceptedMediaInvite = (invite: ChillyChatCallInvite | null, descriptor: NonNullable<ReturnType<typeof createIosAcceptedCallKitMediaDescriptor>>) => !!invite
  && invite.id === descriptor.inviteId && invite.threadId === descriptor.threadId
  && invite.communicationRoomId === descriptor.roomId && invite.calleeUserId === descriptor.authenticatedUserId
  && invite.callerUserId !== descriptor.authenticatedUserId && invite.mediaProvider === descriptor.mediaProvider;

const getThreadStatusLabel = (thread: ChatThreadSummary | null) => {
  if (thread?.activeCommunicationRoomId && thread.activeCallType) {
    return thread.activeCallType === "video" ? "Video call live" : "Voice call live";
  }
  if ((thread?.currentMember?.unreadCount ?? 0) > 0) {
    return "Unread activity";
  }
  return "Direct thread";
};

const buildSmartReplySuggestions = ({
  activeCallType,
  lastIncomingMessage,
  otherMemberName,
}: {
  activeCallType?: ChatCallType;
  lastIncomingMessage?: string;
  otherMemberName?: string;
}) => {
  const firstName = String(otherMemberName ?? "").trim().split(/\s+/).filter(Boolean)[0] ?? "there";
  const normalizedMessage = String(lastIncomingMessage ?? "").trim().toLowerCase();

  if (activeCallType) {
    return activeCallType === "video"
      ? ["Joining the video now", "Give me 2 min", "Let's keep the camera on"]
      : ["Joining the call now", "Mic is ready", "Give me 2 min"];
  }

  if (normalizedMessage.includes("?")) {
    return ["I'm in", "Give me 5 min", "Let's jump on a call"];
  }

  if (normalizedMessage.includes("when")) {
    return ["I'm ready now", "Send the time", "Let's do a quick call"];
  }

  if (normalizedMessage.includes("where")) {
    return ["Send the link", "I'm on my way", "Let's meet in the thread"];
  }

  return [`Hey ${firstName}, I'm here`, "Let's do a voice call", "Send me the details"];
};

function GatedSmartReplySuggestions(_: {
  activeCallType?: ChatCallType;
  currentUserId: string;
  messages: ChatMessage[];
  onSelectSuggestion: (suggestion: string) => void;
  otherMemberName?: string;
}) {
  // Smart replies are nonessential for the live invite/call proof lane.
  return null;
}

export default function ChillyChatThreadScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const router = useRouter();
  const { session, user, isLoading: authLoading, isSignedIn } = useSession();
  const currentUserId = String(user?.id ?? "").trim();
  const {
    threadId: threadIdParam,
    callInviteId: callInviteIdParam,
    foregroundCallClaim: foregroundCallClaimParam,
    nativeCallClaim: nativeCallClaimParam,
    nativeCallUuid: nativeCallUuidParam,
  } =
    useLocalSearchParams<{
      callInviteId?: string;
      foregroundCallClaim?: string;
      nativeCallClaim?: string;
      nativeCallAction?: string;
      nativeCallUuid?: string;
      threadId?: string;
    }>();
  const threadId = String(Array.isArray(threadIdParam) ? threadIdParam[0] : threadIdParam ?? "").trim();
  const routeCallInviteId = String(Array.isArray(callInviteIdParam) ? callInviteIdParam[0] : callInviteIdParam ?? "").trim();
  const routeForegroundCallClaim = String(Array.isArray(foregroundCallClaimParam) ? foregroundCallClaimParam[0] : foregroundCallClaimParam ?? "").trim();
  const routeNativeCallClaim = String(Array.isArray(nativeCallClaimParam) ? nativeCallClaimParam[0] : nativeCallClaimParam ?? "").trim();
  const routeNativeCallUuid = String(Array.isArray(nativeCallUuidParam) ? nativeCallUuidParam[0] : nativeCallUuidParam ?? "").trim();
  const [trustedNativeCallClaim, setTrustedNativeCallClaim] = useState<ReturnType<typeof consumeMountedIosNativeCallRoute>>(null);
  const [trustedNativeCallClaimAccountId, setTrustedNativeCallClaimAccountId] = useState("");
  const [trustedForegroundUiIntent, setTrustedForegroundUiIntent] = useState<ReturnType<typeof consumeMountedForegroundAuthenticatedUiCallRoute>>(null);
  const requestedCallInviteId = trustedNativeCallClaim?.inviteId ?? routeCallInviteId;
  const requestedNativeCallAction = trustedNativeCallClaim?.action ?? "";
  const requestedNativeCallIdentity = trustedNativeCallClaim?.nativeIdentity ?? "";
  const requestedNativeCallUuid = trustedNativeCallClaim?.platform === "ios"
    ? requestedNativeCallIdentity
    : "";
  const requestedNativeCallOwnsTransition = doesNativeCallActionOwnTransition({
    authority: trustedNativeCallClaim ? "trusted_native_claim" : "none",
    callInviteId: requestedCallInviteId,
    currentUserId,
    nativeIdentity: requestedNativeCallIdentity,
    nativeCallAction: requestedNativeCallAction,
    monotonicNowMs: globalThis.performance?.now?.(),
    platform: Platform.OS,
    threadId,
    trustedNativeClaim: trustedNativeCallClaim,
  });
  const requestedNativeCallRequestKey = requestedNativeCallOwnsTransition
    ? trustedNativeCallClaim?.claimId ?? ""
    : "";

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [callBusy, setCallBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatThreadSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [attachmentFile, setAttachmentFile] = useState<SocialAttachmentFile | null>(null);
  const [attachmentSheetVisible, setAttachmentSheetVisible] = useState(false);
  const [appConfig, setAppConfig] = useState(DEFAULT_APP_CONFIG);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [messageReportTarget, setMessageReportTarget] = useState<ChatMessage | null>(null);
  const [messageReportBusy, setMessageReportBusy] = useState(false);
  const [callPanelOpen, setCallPanelOpen] = useState(false);
  const [nativeSpeakerEnabled, setNativeSpeakerEnabled] = useState(false);
  const [iosNativeAnswerRecoveryBlocked, setIosNativeAnswerRecoveryBlocked] = useState(false);
  const [nativeMediaActivationSerial, setNativeMediaActivationSerial] = useState(0);
  const [nativeAudioSessionCallUuid, setNativeAudioSessionCallUuid] = useState("");
  const [callEvents, setCallEvents] = useState<ChillyChatCallEvent[]>([]);
  const [incomingCallInvite, setIncomingCallInvite] = useState<ChillyChatCallInvite | null>(null);
  const [outgoingCallInvite, setOutgoingCallInvite] = useState<ChillyChatCallInvite | null>(null);
  const [activeCallInvite, setActiveCallInvite] = useState<ChillyChatCallInvite | null>(null);
  const [callDeliveryStatus, setCallDeliveryStatus] = useState<string | null>(null);
  const [callPreferences, setCallPreferences] = useState<NotificationPreferenceSettings | null>(null);
  const [headerQuickActionsOpen, setHeaderQuickActionsOpen] = useState(false);
  const [friendState, setFriendState] = useState<FriendRelationshipState | null>(null);
  const [friendLoading, setFriendLoading] = useState(true);
  const [friendBusy, setFriendBusy] = useState<"request" | "accept" | "decline" | "cancel" | "remove" | null>(null);
  const [composerFocused, setComposerFocused] = useState(false);
  const [iosNativePresentationRevision, bumpIosNativePresentationRevision] = useState(0);
  const [iosNativePresentationGraceReadyInviteId, setIosNativePresentationGraceReadyInviteId] = useState("");
  const nativeCallActionHandledRef = useRef("");
  const nativeCallClaimConsumptionRef = useRef("");
  const foregroundCallClaimConsumptionRef = useRef("");
  const foregroundCallIntentHandledRef = useRef("");
  const activeNativeCallActionRequestKeyRef = useRef("");
  const activeCallInviteRef = useRef<ChillyChatCallInvite | null>(null);
  const acceptedIosNativeMediaDescriptorRef = useRef<ReturnType<typeof createIosAcceptedCallKitMediaDescriptor>>(null);
  const acceptedIosNativeMediaSettlementInFlightRef = useRef(false);
  const handledActiveTerminalInviteIdsRef = useRef<Set<string>>(new Set());
  const lastReadReceiptWriteAtRef = useRef(0);
  const incomingCallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incomingCallSoundRef = useRef<ChillyChatPlayingSound | null>(null);
  const handledIncomingInviteIdsRef = useRef<Set<string>>(new Set());
  const handledIncomingRoomIdsRef = useRef<Set<string>>(new Set());
  const outgoingCallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outgoingRingbackSoundRef = useRef<ChillyChatPlayingSound | null>(null);

  useEffect(() => {
    if (
      Platform.OS !== "ios"
      || authLoading
      || !isSignedIn
      || !currentUserId
      || !routeNativeCallClaim
    ) return;
    const consumptionKey = `${threadId}:${routeCallInviteId}:${routeNativeCallUuid}:${routeNativeCallClaim}`;
    if (nativeCallClaimConsumptionRef.current === consumptionKey) return;
    nativeCallClaimConsumptionRef.current = consumptionKey;
    const claim = consumeMountedIosNativeCallRoute({
      action: "answer",
      authenticatedUserId: currentUserId,
      authLoading,
      callUuid: routeNativeCallUuid,
      claimId: routeNativeCallClaim,
      inviteId: routeCallInviteId,
      isSignedIn,
      platform: Platform.OS,
      threadId,
    });
    setTrustedNativeCallClaim(claim);
    setTrustedNativeCallClaimAccountId(claim ? currentUserId : "");
    router.setParams({
      nativeCallAction: undefined,
      nativeCallClaim: undefined,
      nativeCallUuid: undefined,
    });
  }, [authLoading, currentUserId, isSignedIn, routeCallInviteId, routeNativeCallClaim, routeNativeCallUuid, router, threadId]);

  useEffect(() => {
    if (
      Platform.OS !== "android"
      || authLoading
      || !isSignedIn
      || !currentUserId
      || !routeNativeCallClaim
    ) return;
    const consumptionKey = `android:${threadId}:${routeCallInviteId}:${routeNativeCallUuid}:${routeNativeCallClaim}`;
    if (nativeCallClaimConsumptionRef.current === consumptionKey) return;
    nativeCallClaimConsumptionRef.current = consumptionKey;
    const claim = consumeMountedAndroidNativeCallRoute({
      authenticatedUserId: currentUserId,
      authLoading,
      claimId: routeNativeCallClaim,
      inviteId: routeCallInviteId,
      isSignedIn,
      platform: Platform.OS,
      requestKey: routeNativeCallUuid,
      threadId,
    });
    if (claim) {
      setTrustedNativeCallClaim(claim);
      setTrustedNativeCallClaimAccountId(currentUserId);
    }
    router.setParams({
      nativeCallAction: undefined,
      nativeCallClaim: undefined,
      nativeCallUuid: undefined,
    });
  }, [authLoading, currentUserId, isSignedIn, routeCallInviteId, routeNativeCallClaim, routeNativeCallUuid, router, threadId]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android") return () => {};
      return subscribeToTrustedAndroidNativeActionRoutes((route: TrustedAndroidNativeActionRoute) => {
        if (
          authLoading
          || !isSignedIn
          || !currentUserId
          || route.status !== "created"
          || route.threadId !== threadId
          || !route.claimId
          || !route.inviteId
          || !route.nativeIdentity
        ) return;
        const claim = consumeMountedAndroidNativeCallRoute({
          authenticatedUserId: currentUserId,
          authLoading,
          claimId: route.claimId,
          inviteId: route.inviteId,
          isSignedIn,
          platform: Platform.OS,
          requestKey: route.nativeIdentity,
          threadId,
        });
        if (!claim) return false;
        setTrustedNativeCallClaim(claim);
        setTrustedNativeCallClaimAccountId(currentUserId);
        return true;
      });
    }, [authLoading, currentUserId, isSignedIn, threadId]),
  );

  useEffect(() => {
    if (authLoading || !isSignedIn || !currentUserId || !routeForegroundCallClaim) return;
    const mountedActiveCallRoomId = resolveAcceptedChatCallRoomId({
      inviteRoomId: activeCallInvite?.communicationRoomId,
      inviteStatus: activeCallInvite?.status,
      threadRoomId: thread?.activeCommunicationRoomId,
    });
    const acceptedOpenCallInvite = routeCallInviteId && activeCallInvite?.id === routeCallInviteId
      && activeCallInvite.status === "accepted"
      && activeCallInvite.communicationRoomId === mountedActiveCallRoomId
        ? activeCallInvite
        : null;
    if (routeCallInviteId && !acceptedOpenCallInvite) return;
    const consumptionKey = `${currentUserId}:${threadId}:${routeForegroundCallClaim}`;
    if (foregroundCallClaimConsumptionRef.current === consumptionKey) return;
    foregroundCallClaimConsumptionRef.current = consumptionKey;
    const intent = consumeMountedForegroundAuthenticatedUiCallRoute({
      authenticatedUserId: currentUserId,
      authLoading,
      claimId: routeForegroundCallClaim,
      inviteId: acceptedOpenCallInvite?.id,
      isSignedIn,
      roomId: acceptedOpenCallInvite?.communicationRoomId,
      threadId,
    });
    setTrustedForegroundUiIntent(intent);
    router.setParams({
      foregroundCallClaim: undefined,
      openCall: undefined,
      startCall: undefined,
    });
  }, [activeCallInvite, authLoading, currentUserId, isSignedIn, routeCallInviteId, routeForegroundCallClaim, router, thread?.activeCommunicationRoomId, threadId]);

  useEffect(() => {
    if (
      trustedNativeCallClaim
      && (
        !isSignedIn
        || !currentUserId
        || trustedNativeCallClaim.threadId !== threadId
        || trustedNativeCallClaimAccountId !== currentUserId
      )
    ) {
      setTrustedNativeCallClaim(null);
      setTrustedNativeCallClaimAccountId("");
    }
    if (
      trustedForegroundUiIntent
      && (
        !isSignedIn
        || !currentUserId
        || trustedForegroundUiIntent.authenticatedUserId !== currentUserId
        || trustedForegroundUiIntent.threadId !== threadId
      )
    ) {
      setTrustedForegroundUiIntent(null);
    }
  }, [currentUserId, isSignedIn, threadId, trustedForegroundUiIntent, trustedNativeCallClaim, trustedNativeCallClaimAccountId]);

  useEffect(() => {
    activeNativeCallActionRequestKeyRef.current = requestedNativeCallRequestKey;
    return () => {
      if (activeNativeCallActionRequestKeyRef.current === requestedNativeCallRequestKey) {
        activeNativeCallActionRequestKeyRef.current = "";
      }
    };
  }, [requestedNativeCallRequestKey]);

  useEffect(() => {
    if (Platform.OS !== "ios") return () => {};
    return subscribeToIosNativeCallPresentation(() => {
      bumpIosNativePresentationRevision((revision) => revision + 1);
    });
  }, []);

  useEffect(() => {
    const inviteId = String(incomingCallInvite?.id ?? "").trim();
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
  }, [incomingCallInvite?.id]);

  const activeCallRoomId = resolveAcceptedChatCallRoomId({
    inviteRoomId: activeCallInvite?.communicationRoomId,
    inviteStatus: activeCallInvite?.status,
    threadRoomId: thread?.activeCommunicationRoomId,
  });
  const rememberHandledIncomingInvite = useCallback((
    invite: ChillyChatCallInvite | null | undefined,
    options?: { clearRoom?: boolean },
  ) => {
    const inviteId = String(invite?.id ?? "").trim();
    if (inviteId) {
      handledIncomingInviteIdsRef.current.add(inviteId);
      if (handledIncomingInviteIdsRef.current.size > 40) {
        const oldestInviteId = handledIncomingInviteIdsRef.current.values().next().value;
        if (oldestInviteId) handledIncomingInviteIdsRef.current.delete(oldestInviteId);
      }
    }

    if (options?.clearRoom) {
      const roomId = String(invite?.communicationRoomId ?? "").trim();
      if (roomId) {
        handledIncomingRoomIdsRef.current.add(roomId);
        if (handledIncomingRoomIdsRef.current.size > 40) {
          const oldestRoomId = handledIncomingRoomIdsRef.current.values().next().value;
          if (oldestRoomId) handledIncomingRoomIdsRef.current.delete(oldestRoomId);
        }
      }
    }
  }, []);

  const applyAcceptedIncomingInviteState = useCallback((
    invite: ChillyChatCallInvite,
  ) => {
    const roomId = String(invite?.communicationRoomId ?? "").trim();
    const valid =
      invite?.status === "accepted"
      && !!roomId
      && invite.threadId === threadId
      && invite.calleeUserId === currentUserId
      && invite.callerUserId !== currentUserId;
    if (!valid) return false;

    rememberHandledIncomingInvite(invite);
    activeCallInviteRef.current = invite;
    setActiveCallInvite(invite);
    setIncomingCallInvite(null);
    setOutgoingCallInvite(null);
    setThread((current) => {
      if (!current || current.threadId !== threadId) return current;
      return {
        ...current,
        activeCommunicationRoomId: roomId,
        activeCallType: invite.callType,
      };
    });
    setCallPanelOpen(true);
    setError(null);
    setCallDeliveryStatus("Incoming call accepted. Connecting both sides now.");
    return true;
  }, [currentUserId, rememberHandledIncomingInvite, threadId]);

  const terminalIosNativeAnswerOperations = useMemo(() => ({
      delay: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)), endNative: endIosNativeCall,
      readInvite: readChillyChatCallInvite,
      updateInvite: (latest: ChillyChatCallInvite) => updateChillyChatCallInviteStatus({actorUserId: currentUserId!, invite: latest, status: "ended"}),
  }), [currentUserId]);
  const terminateAcceptedIosNativeAnswer = useCallback((invite: ChillyChatCallInvite, reason: string, descriptor: ReturnType<typeof createIosAcceptedCallKitMediaDescriptor>) => terminateIosAcceptedNativeAnswer({authenticatedUserId: currentUserId, callUuid: requestedNativeCallUuid, descriptor, invite, reason, threadId, trustedNativeClaim: trustedNativeCallClaim}, terminalIosNativeAnswerOperations), [currentUserId, requestedNativeCallUuid, terminalIosNativeAnswerOperations, threadId, trustedNativeCallClaim]);

  const completeTrustedIosNativeAnswer = useCallback(async (invite: ChillyChatCallInvite) => {
    if (!requestedNativeCallUuid || requestedNativeCallAction !== "answer") { setIosNativeAnswerRecoveryBlocked(false); return true; }
    const result = await completeIosAcceptedNativeAnswer({authenticatedUserId: currentUserId, callUuid: requestedNativeCallUuid, invite, serverAccepted: true, threadId, trustedNativeClaim: trustedNativeCallClaim}, {completeNative: completeIosNativeCallAnswer, monotonicNow: () => globalThis.performance?.now?.(), terminal: terminalIosNativeAnswerOperations});
    if (result.status === "ready" && result.descriptor) { acceptedIosNativeMediaDescriptorRef.current = result.descriptor; setIosNativeAnswerRecoveryBlocked(false); return true; }
    if (result.status === "terminal_retryable") { setIosNativeAnswerRecoveryBlocked(true); applyAcceptedIncomingInviteState(invite); setError("Native Answer failed and automatic call cleanup could not finish. Media remains blocked; use End Call to retry safely."); }
    return false;
  }, [applyAcceptedIncomingInviteState, currentUserId, requestedNativeCallAction, requestedNativeCallUuid, terminalIosNativeAnswerOperations, threadId, trustedNativeCallClaim]);

  const clearVisibleIncomingCallState = useCallback((invite: ChillyChatCallInvite | null | undefined) => {
    rememberHandledIncomingInvite(invite, { clearRoom: true });
    setIncomingCallInvite(null);
    setCallPanelOpen(false);
    setThread((current) => {
      if (!current || current.threadId !== threadId) return current;
      return {
        ...current,
        activeCommunicationRoomId: undefined,
        activeCallType: undefined,
      };
    });
  }, [rememberHandledIncomingInvite, threadId]);

  const stopOutgoingRingback = useCallback(() => {
    Vibration.cancel();
    void stopChillyChatCallSound(outgoingRingbackSoundRef.current);
    outgoingRingbackSoundRef.current = null;
    if (outgoingCallTimeoutRef.current) {
      clearTimeout(outgoingCallTimeoutRef.current);
      outgoingCallTimeoutRef.current = null;
    }
  }, []);

  const markThreadReadWithThrottle = useCallback(async () => {
    if (!threadId) return;
    const now = Date.now();
    if (now - lastReadReceiptWriteAtRef.current < READ_RECEIPT_THROTTLE_MS) return;
    lastReadReceiptWriteAtRef.current = now;
    await markChatThreadRead(threadId).catch(() => null);
  }, [threadId]);

  useEffect(() => {
    let active = true;

    readAppConfig()
      .then((config) => {
        if (active) setAppConfig(config);
      })
      .catch(() => {
        if (active) setAppConfig(DEFAULT_APP_CONFIG);
      });

    return () => {
      active = false;
    };
  }, []);

  const reconcileEndedCallState = useCallback(async (nextThread: ChatThreadSummary | null) => {
    logChatCall("reconcile_start", {
      threadId: nextThread?.threadId ?? threadId,
      activeCommunicationRoomId: nextThread?.activeCommunicationRoomId ?? "",
      activeCallType: nextThread?.activeCallType ?? "",
    });
    if (!nextThread?.activeCommunicationRoomId) return nextThread;

    let snapshot;
    try {
      snapshot = await getCommunicationRoomSnapshot(nextThread.activeCommunicationRoomId);
    } catch (error) {
      reportRuntimeError("chat-thread-call-reconciliation-read", error, {
        roomId: nextThread.activeCommunicationRoomId,
        threadId: nextThread.threadId,
      });
      return nextThread;
    }
    if (snapshot?.room.status === "active") {
      logChatCall("reconcile_keep_active", {
        threadId: nextThread.threadId,
        roomId: nextThread.activeCommunicationRoomId,
        roomStatus: snapshot.room.status,
      });
      return nextThread;
    }

    let cleanup;
    try {
      cleanup = await clearEndedChatThreadCall(
        nextThread.threadId,
        nextThread.activeCommunicationRoomId,
      );
    } catch (error) {
      reportRuntimeError("chat-thread-call-reconciliation-cleanup", error, {
        roomId: nextThread.activeCommunicationRoomId,
        threadId: nextThread.threadId,
      });
      return nextThread;
    }
    if (!shouldApplyAuthoritativeChatCallCleanup(cleanup)) {
      logChatCall("reconcile_preserved_authoritative", {
        threadId: nextThread.threadId,
        roomId: nextThread.activeCommunicationRoomId,
        reason: cleanup.reason,
      });
      return nextThread;
    }
    setCallPanelOpen(false);
    logChatCall("reconcile_cleared_stale", {
      threadId: nextThread.threadId,
      roomId: nextThread.activeCommunicationRoomId,
      roomStatus: snapshot?.room.status ?? "missing",
    });
    return (await getChatThread(nextThread.threadId).catch(() => null)) ?? null;
  }, [threadId]);

  const loadThreadState = useCallback(async () => {
    if (!threadId) {
      setError("Missing Chi'lly Chat thread.");
      setLoading(false);
      return;
    }

    if (!isSignedIn) {
      setThread(null);
      setMessages([]);
      setError("Sign in to open Chi'lly Chat.");
      setLoading(false);
      return;
    }

    try {
      logChatThread("load_state_start", { threadId });
      const [loadedThread, nextMessages, nextCallEvents, latestInvite, nextCallPreferences] = await Promise.all([
        getChatThread(threadId),
        listChatMessages(threadId),
        listChillyChatCallEvents(threadId),
        readLatestRingingChillyChatCallInvite(threadId),
        readNotificationPreferences(),
      ]);

      const nextThread = await reconcileEndedCallState(loadedThread);
      const acceptedActiveInvite = nextThread?.activeCommunicationRoomId
        ? await readLatestChillyChatCallInviteForRoom(
          nextThread.activeCommunicationRoomId,
        ).catch(() => null)
        : null;
      const resumableAcceptedInvite =
        acceptedActiveInvite?.status === "accepted"
        && acceptedActiveInvite.threadId === threadId
        && acceptedActiveInvite.communicationRoomId === nextThread?.activeCommunicationRoomId
        && acceptedActiveInvite.calleeUserId === currentUserId
        && acceptedActiveInvite.callerUserId !== currentUserId
          ? acceptedActiveInvite
          : null;

      if (!nextThread) {
        setError("This Chi'lly Chat thread could not be found.");
        setLoading(false);
        return;
      }

      const latestInviteForCurrentUser =
        latestInvite?.calleeUserId === currentUserId && latestInvite.callerUserId !== currentUserId
          ? latestInvite
          : null;
      const latestInviteWasHandled = !!latestInviteForCurrentUser?.id
        && handledIncomingInviteIdsRef.current.has(latestInviteForCurrentUser.id);
      const activeRoomWasHandled = !!nextThread.activeCommunicationRoomId
        && handledIncomingRoomIdsRef.current.has(nextThread.activeCommunicationRoomId);
      const visibleThread = latestInviteWasHandled || activeRoomWasHandled
        ? {
          ...nextThread,
          activeCommunicationRoomId: undefined,
          activeCallType: undefined,
        }
        : nextThread;

      setThread(visibleThread);
      setMessages(nextMessages);
      setCallEvents(nextCallEvents);
      setCallPreferences(nextCallPreferences);
      const visibleIncomingInvite = latestInviteForCurrentUser && !latestInviteWasHandled
        ? latestInviteForCurrentUser
        : null;
      setIncomingCallInvite(visibleIncomingInvite);
      if (resumableAcceptedInvite) {
        applyAcceptedIncomingInviteState(resumableAcceptedInvite);
      }
      setError(null);
      setLoading(false);
      if (!visibleThread.activeCommunicationRoomId) {
        setCallDeliveryStatus(null);
      }
      logChatThread("load_state_success", {
        threadId,
        messageCount: nextMessages.length,
        activeCommunicationRoomId: visibleThread.activeCommunicationRoomId ?? "",
        activeCallType: visibleThread.activeCallType ?? "",
      });

      await markThreadReadWithThrottle();

      if (visibleIncomingInvite && !resumableAcceptedInvite) {
        stopOutgoingRingback();
        activeCallInviteRef.current = null;
        setActiveCallInvite(null);
        setOutgoingCallInvite(null);
        setCallPanelOpen(false);
      } else {
        setCallPanelOpen((wasOpen) => shouldKeepAcceptedChatCallPanelOpen({
          inviteRoomId: activeCallInviteRef.current?.communicationRoomId,
          inviteStatus: activeCallInviteRef.current?.status,
          threadRoomId: visibleThread.activeCommunicationRoomId,
          wasOpen,
        }));
      }
    } catch (loadError: any) {
      logChatThread("load_state_failed", {
        threadId,
        message: loadError?.message ?? "unknown_error",
      });
      setError(loadError?.message ?? "Unable to load this Chi'lly Chat thread.");
      setLoading(false);
    }
  }, [applyAcceptedIncomingInviteState, currentUserId, isSignedIn, markThreadReadWithThrottle, reconcileEndedCallState, stopOutgoingRingback, threadId]);

  useFocusEffect(
    useCallback(() => {
      if (authLoading) {
        return () => {};
      }

      if (!isSignedIn) {
        setLoading(false);
        setThread(null);
        setMessages([]);
        setError("Sign in to open Chi'lly Chat.");
        return () => {};
      }

      setLoading(true);
      void loadThreadState();
      trackEvent("chat_thread_opened", {
        surface: "chat-thread",
        threadId,
      });

      if (!threadId) {
        return () => {};
      }

      const unsubscribe = subscribeToThread(threadId, () => {
        logChatThread("thread_subscription_refresh", { threadId });
        void loadThreadState();
      });

      return unsubscribe;
    }, [authLoading, isSignedIn, loadThreadState, threadId]),
  );

  const initialCallMediaPreferences = useMemo(() => {
    if (thread?.activeCallType === "voice") {
      return {
        cameraEnabled: false,
        micEnabled: true,
      };
    }

    if (thread?.activeCallType === "video") {
      return {
        cameraEnabled: true,
        micEnabled: true,
      };
    }

    return undefined;
  }, [thread?.activeCallType]);
  const waitingForIosNativeAudioSession =
    Platform.OS === "ios"
    && requestedNativeCallAction === "answer"
    && !!requestedNativeCallUuid
    && nativeAudioSessionCallUuid !== requestedNativeCallUuid;

  const {
    room: callRoom,
    loading: callLoading,
    error: callError,
    channelState: callChannelState,
    cameraEnabled,
    micEnabled,
    mediaControlsBusy,
    participants,
    participantCount,
    toggleCamera,
    setMicrophoneEnabled,
    switchCamera,
    mediaPermissionMessage,
    canOpenMediaSettings,
    openMediaSettings,
    leaveRoom,
    mediaProvider: callMediaProvider,
    setSpeaker: setCallMediaSpeaker,
    canSetSpeaker: canSetCallMediaSpeaker,
    markInstalledUiConnected,
    markParticipantVideoRendered,
  } = useChatCallMediaSession({
    authenticatedAccessToken: String(session?.access_token ?? "").trim(),
    authenticatedUserId: currentUserId,
    roomId: activeCallRoomId,
    invite: activeCallInvite,
    threadId,
    enabled: shouldActivateAcceptedChatCallMedia({
      roomId: activeCallRoomId,
      inviteStatus: activeCallInvite?.status,
    }) && !waitingForIosNativeAudioSession && !iosNativeAnswerRecoveryBlocked,
    allowBackgroundAudio: Platform.OS === "ios"
      && requestedNativeCallAction === "answer"
      && !!requestedNativeCallUuid,
    mediaActivationSerial: nativeMediaActivationSerial,
    initialMediaPreferences: initialCallMediaPreferences,
    onRoomEnded: async (reason) => {
      trackEvent("chat_call_ended", {
        surface: "chat-thread",
        threadId,
        reason,
      });
      const activeInvite = activeCallInviteRef.current;
      if (activeInvite?.status === "accepted" && currentUserId) {
        await updateChillyChatCallInviteStatus({
          actorUserId: currentUserId,
          invite: activeInvite,
          status: "ended",
        }).catch(() => null).finally(() => {
          activeCallInviteRef.current = null;
          setActiveCallInvite(null);
        });
      }
      if (requestedNativeCallUuid) {
        void endIosNativeCall(requestedNativeCallUuid, `room_${reason}`).catch(() => false);
      }
      void clearEndedChatThreadCall(threadId).finally(() => {
        setCallPanelOpen(false);
        void loadThreadState();
      });
    },
  });

  useEffect(() => {
    const candidate = acceptedIosNativeMediaDescriptorRef.current;
    const failure = {
      authenticatedUserId: candidate?.authenticatedUserId, callUuid: candidate?.callUuid,
      channelState: callChannelState, descriptor: candidate,
      inviteId: candidate?.inviteId, inviteStatus: activeCallInvite?.status,
      mediaProvider: candidate?.mediaProvider, platform: Platform.OS,
      roomId: candidate?.roomId, threadId: candidate?.threadId,
    };
    if (acceptedIosNativeMediaSettlementInFlightRef.current) return;
    acceptedIosNativeMediaSettlementInFlightRef.current = true;
    void (async () => {
      const operations = {
        terminateAccepted: async (descriptor: NonNullable<typeof candidate>, reason: string) => {
          const accepted = await readChillyChatCallInvite(descriptor.inviteId).catch(() => null);
          return exactIosAcceptedMediaInvite(accepted, descriptor) && (accepted?.status === "accepted" || TERMINAL_CHAT_CALL_INVITE_STATUSES.has(accepted?.status ?? "")) ? terminateAcceptedIosNativeAnswer(accepted!, reason, descriptor) : false;
        },
        leaveRoom: (descriptor: NonNullable<typeof candidate>) => descriptor.roomId === activeCallRoomId && descriptor.mediaProvider === callMediaProvider && exactIosAcceptedMediaInvite(activeCallInviteRef.current, descriptor) ? leaveRoom({endRoomIfHost: false}).then(() => true) : false,
        clearLocal: async (descriptor: NonNullable<typeof candidate>) => {
          if (acceptedIosNativeMediaDescriptorRef.current !== descriptor || !exactIosAcceptedMediaInvite(activeCallInviteRef.current, descriptor)) return false;
          acceptedIosNativeMediaDescriptorRef.current = null; handledActiveTerminalInviteIdsRef.current.add(descriptor.inviteId);
          setIosNativeAnswerRecoveryBlocked(false);
          await clearEndedChatThreadCall(descriptor.threadId).catch(() => null);
          activeCallInviteRef.current = null; setActiveCallInvite(null); setCallPanelOpen(false);
          setCallDeliveryStatus("Media could not connect. The accepted call was ended safely."); await loadThreadState().catch(() => null); return true;
        },
      };
      let result = await settleIosAcceptedCallKitMediaFailure(failure, operations);
      for (let attempt = 0; attempt < 2 && result.status === "settled_cleanup_pending"; attempt += 1) result = await settleIosAcceptedCallKitMediaFailure(failure, operations);
      if (result.status === "retryable") setError("Media failed, but the accepted call could not be ended. Use End Call to retry safely.");
      if (result.status === "settled_cleanup_pending") setError("The call ended, but local cleanup needs a refresh.");
    })().finally(() => { acceptedIosNativeMediaSettlementInFlightRef.current = false; });
  }, [activeCallInvite?.id, activeCallInvite?.status, activeCallRoomId, callChannelState, callMediaProvider, currentUserId, leaveRoom, loadThreadState, requestedNativeCallUuid, terminateAcceptedIosNativeAnswer, threadId]);

  const handleToggleCallMic = useCallback(async () => {
    const nextEnabled = !micEnabled;
    try {
      const updated = await setMicrophoneEnabled(nextEnabled);
      if (!updated) {
        setError("Microphone access is unavailable. The call remains connected.");
        return;
      }
      setError(null);
      if (requestedNativeCallUuid) {
        await setIosNativeCallMuted(requestedNativeCallUuid, !nextEnabled).catch(() => false);
      }
    } catch (mediaError) {
      setError("The microphone could not be changed. The call remains connected.");
      reportRuntimeError("chat-call-toggle-microphone", mediaError, { threadId });
    }
  }, [micEnabled, requestedNativeCallUuid, setMicrophoneEnabled, threadId]);

  const handleToggleCallCamera = useCallback(async () => {
    try {
      const updated = await toggleCamera();
      if (updated === false) return;
      setError(null);
    } catch (mediaError) {
      setError("The camera could not be changed. The call remains connected.");
      reportRuntimeError("chat-call-toggle-camera", mediaError, { threadId });
    }
  }, [threadId, toggleCamera]);

  const handleSwitchCallCamera = useCallback(async () => {
    try {
      const updated = await switchCamera();
      if (!updated) {
        setError("The camera could not be flipped on this device. The call remains connected.");
        return;
      }
      setError(null);
    } catch (mediaError) {
      setError("The camera could not be flipped on this device. The call remains connected.");
      reportRuntimeError("chat-call-switch-camera", mediaError, { threadId });
    }
  }, [switchCamera, threadId]);

  const handleToggleNativeAudioRoute = useCallback(async () => {
    const nextSpeakerEnabled = !nativeSpeakerEnabled;
    try {
      const liveKitUpdated = callMediaProvider === "livekit"
        ? await setCallMediaSpeaker(nextSpeakerEnabled)
        : false;
      const nativeUpdated = Platform.OS === "ios"
        ? await setIosNativeCallAudioRoute(nextSpeakerEnabled ? "speaker" : "receiver")
        : false;
      if (liveKitUpdated || nativeUpdated) {
        setNativeSpeakerEnabled(nextSpeakerEnabled);
        setError(null);
        return;
      }
      setError("The audio output could not be changed. The call remains connected.");
    } catch (routeError) {
      setError("The audio output could not be changed. The call remains connected.");
      reportRuntimeError("chat-call-audio-route", routeError, { threadId });
    }
  }, [callMediaProvider, nativeSpeakerEnabled, setCallMediaSpeaker, threadId]);

  useEffect(() => {
    if (
      !activeCallRoomId
      || activeCallInvite?.status !== "accepted"
      || callChannelState !== "live"
    ) return;
    const route = resolveIosChatCallAudioRoute(thread?.activeCallType);
    const shouldUseSpeaker = route === "speaker";
    if (callMediaProvider === "livekit") {
      void setCallMediaSpeaker(shouldUseSpeaker)
        .then((updated) => {
          if (updated) setNativeSpeakerEnabled(shouldUseSpeaker);
        });
    }
    if (Platform.OS === "ios") {
      void setIosNativeCallAudioRoute(route)
        .then((updated) => {
          if (updated) setNativeSpeakerEnabled(shouldUseSpeaker);
        });
    }
  }, [activeCallInvite?.status, activeCallRoomId, callChannelState, callMediaProvider, nativeMediaActivationSerial, setCallMediaSpeaker, thread?.activeCallType]);

  useEffect(() => {
    stopOutgoingRingback();

    if (
      !outgoingCallInvite
      || outgoingCallInvite.status !== "ringing"
      || !currentUserId
      || participantCount > 1
    ) {
      return () => stopOutgoingRingback();
    }

    const soundKey = callPreferences?.chillyChatCallSoundKey ?? "chilly_ring";
    let soundActive = true;
    if (callPreferences?.chillyChatCallVibrateEnabled !== false) {
      Vibration.vibrate([0, 120, 950, 120], true);
    }
    void playChillyChatCallSound(soundKey, { loop: true, volume: 0.42 })
      .then((sound) => {
        if (!sound) return;
        if (!soundActive) {
          void stopChillyChatCallSound(sound);
          return;
        }
        outgoingRingbackSoundRef.current = sound;
      })
      .catch(() => null);

    const expiresAt = Date.parse(outgoingCallInvite.expiresAt);
    const timeoutMs = Math.max(1000, Number.isFinite(expiresAt) ? expiresAt - Date.now() : 45_000);
    outgoingCallTimeoutRef.current = setTimeout(async () => {
      const latestInvite = await readChillyChatCallInvite(outgoingCallInvite.id).catch(() => null);
      if (latestInvite?.status === "accepted") {
        activeCallInviteRef.current = latestInvite;
        setActiveCallInvite(latestInvite);
        setOutgoingCallInvite(null);
        stopOutgoingRingback();
        setCallDeliveryStatus("Receiver joined the call.");
        return;
      }
      if (!latestInvite || latestInvite.status !== "ringing") return;

      const missedInvite = await updateChillyChatCallInviteStatus({
        actorUserId: currentUserId,
        invite: latestInvite,
        status: "missed",
      });
      if (!missedInvite || missedInvite.status !== "missed") return;

      stopOutgoingRingback();
      await leaveRoom({ endRoomIfHost: true }).catch(() => null);
      await clearEndedChatThreadCall(threadId).catch(() => null);
      activeCallInviteRef.current = null;
      setActiveCallInvite(null);
      setOutgoingCallInvite(null);
      setCallPanelOpen(false);
      setCallDeliveryStatus("No answer. The call expired and active call state was cleared.");
      await loadThreadState();
    }, timeoutMs);

    return () => {
      soundActive = false;
      stopOutgoingRingback();
    };
  }, [callPreferences?.chillyChatCallSoundKey, callPreferences?.chillyChatCallVibrateEnabled, currentUserId, leaveRoom, loadThreadState, outgoingCallInvite, participantCount, stopOutgoingRingback, threadId]);

  useEffect(() => {
    if (!outgoingCallInvite?.id) return () => {};

    let active = true;
    const applyInviteState = async () => {
      const invite = await readChillyChatCallInvite(outgoingCallInvite.id).catch(() => null);
      if (!active || !invite) return;

      setOutgoingCallInvite(invite);
      if (invite.status === "accepted") {
        activeCallInviteRef.current = invite;
        setActiveCallInvite(invite);
        stopOutgoingRingback();
        setOutgoingCallInvite(null);
        setCallDeliveryStatus("Receiver joined the call.");
        return;
      }

      if (
        invite.status === "declined"
        || invite.status === "busy"
        || invite.status === "missed"
        || invite.status === "canceled"
        || invite.status === "ended"
      ) {
        stopOutgoingRingback();
        await leaveRoom({ endRoomIfHost: true }).catch(() => null);
        await clearEndedChatThreadCall(threadId).catch(() => null);
        if (!active) return;
        activeCallInviteRef.current = null;
        setActiveCallInvite(null);
        setOutgoingCallInvite(null);
        setCallPanelOpen(false);
        setCallDeliveryStatus(
          invite.status === "declined"
            ? "The receiver declined. Active call state was cleared."
            : invite.status === "missed"
              ? "No answer. Active call state was cleared."
              : "The call ended. Active call state was cleared.",
        );
        await loadThreadState();
      }
    };

    void applyInviteState();
    const unsubscribe = subscribeToChillyChatCallInvite(outgoingCallInvite.id, () => {
      void applyInviteState();
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [leaveRoom, loadThreadState, outgoingCallInvite?.id, stopOutgoingRingback, threadId]);

  useEffect(() => {
    Vibration.cancel();
    void stopChillyChatCallSound(incomingCallSoundRef.current);
    incomingCallSoundRef.current = null;

    const incomingInviteId = String(incomingCallInvite?.id ?? "").trim();
    const iosNativeCallPresentationOwned = hasIosNativeCallPresentation(incomingInviteId);
    const waitingForIosNativePresentation =
      Platform.OS === "ios"
      && isIosNativeCallsRuntimeEnabled()
      && !!incomingInviteId
      && !iosNativeCallPresentationOwned
      && iosNativePresentationGraceReadyInviteId !== incomingInviteId;

    if (
      !incomingCallInvite
      || callPanelOpen
      || iosNativeCallPresentationOwned
      || waitingForIosNativePresentation
      || callPreferences?.chillyChatCallsEnabled === false
    ) {
      return () => {
        Vibration.cancel();
      };
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
      Vibration.cancel();
      void stopChillyChatCallSound(incomingCallSoundRef.current);
      incomingCallSoundRef.current = null;
    };
  }, [
    callPanelOpen,
    callPreferences?.chillyChatCallSoundKey,
    callPreferences?.chillyChatCallVibrateEnabled,
    callPreferences?.chillyChatCallsEnabled,
    incomingCallInvite,
    iosNativePresentationGraceReadyInviteId,
    iosNativePresentationRevision,
  ]);

  useEffect(() => {
    if (incomingCallTimeoutRef.current) {
      clearTimeout(incomingCallTimeoutRef.current);
      incomingCallTimeoutRef.current = null;
    }
    if (!incomingCallInvite || !currentUserId) return undefined;

    const expiresAt = Date.parse(incomingCallInvite.expiresAt);
    const timeoutMs = Math.max(0, Number.isFinite(expiresAt) ? expiresAt - Date.now() : 45_000);
    incomingCallTimeoutRef.current = setTimeout(async () => {
      const latestInvite = await readChillyChatCallInvite(incomingCallInvite.id).catch(() => null);
      if (!latestInvite || latestInvite.status !== "ringing") return;
      await updateChillyChatCallInviteStatus({
        actorUserId: currentUserId,
        invite: latestInvite,
        status: "missed",
      }).finally(() => {
        void clearEndedChatThreadCall(threadId);
        clearVisibleIncomingCallState(latestInvite);
        void loadThreadState();
      });
    }, timeoutMs);

    return () => {
      if (incomingCallTimeoutRef.current) {
        clearTimeout(incomingCallTimeoutRef.current);
        incomingCallTimeoutRef.current = null;
      }
    };
  }, [clearVisibleIncomingCallState, currentUserId, incomingCallInvite, loadThreadState, threadId]);

  useEffect(() => {
    if (!incomingCallInvite?.id) return undefined;
    const visibleInvite = incomingCallInvite;
    let active = true;

    const reconcileInvitePresentation = async () => {
      const latestInvite = await readChillyChatCallInvite(visibleInvite.id).catch(() => null);
      if (!active || !latestInvite || latestInvite.status === "ringing") return;

      rememberHandledIncomingInvite(latestInvite, {
        clearRoom: latestInvite.status !== "accepted",
      });
      setIncomingCallInvite((current) => current?.id === latestInvite.id ? null : current);
      if (latestInvite.status === "accepted") {
        activeCallInviteRef.current = latestInvite;
        setActiveCallInvite(latestInvite);
        setThread((current) => {
          if (!current || current.threadId !== threadId) return current;
          return {
            ...current,
            activeCommunicationRoomId: latestInvite.communicationRoomId ?? current.activeCommunicationRoomId,
            activeCallType: latestInvite.callType,
          };
        });
        setError(null);
        setCallPanelOpen(true);
        return;
      }

      clearVisibleIncomingCallState(latestInvite);
    };

    void reconcileInvitePresentation();
    const unsubscribe = subscribeToChillyChatCallInvite(visibleInvite.id, () => {
      void reconcileInvitePresentation();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [clearVisibleIncomingCallState, incomingCallInvite, rememberHandledIncomingInvite, threadId]);

  useEffect(() => {
    if (!activeCallInvite?.id || activeCallInvite.status !== "accepted" || !currentUserId) {
      return undefined;
    }

    const inviteId = activeCallInvite.id;
    let subscribed = true;
    let terminalCleanupInFlight = false;
    const reconcileActiveInvite = async () => {
      const latestInvite = await readChillyChatCallInvite(inviteId).catch(() => null);
      if (!subscribed || !latestInvite || latestInvite.status === "accepted") return;
      if (!TERMINAL_CHAT_CALL_INVITE_STATUSES.has(latestInvite.status)) return;
      if (
        terminalCleanupInFlight
        || handledActiveTerminalInviteIdsRef.current.has(latestInvite.id)
      ) return;

      terminalCleanupInFlight = true;
      handledActiveTerminalInviteIdsRef.current.add(latestInvite.id);
      const isHost = !!callRoom?.hostUserId && callRoom.hostUserId === currentUserId;
      await leaveRoom({ endRoomIfHost: isHost }).catch(() => undefined);
      if (requestedNativeCallUuid) {
        await reportIosNativeCallRemoteEnd(
          requestedNativeCallUuid,
          `invite_${latestInvite.status}`,
        ).catch(() => false);
      }
      await clearEndedChatThreadCall(threadId).catch(() => null);

      stopOutgoingRingback();
      activeCallInviteRef.current = null;
      setActiveCallInvite(null);
      setOutgoingCallInvite(null);
      setIncomingCallInvite(null);
      setCallPanelOpen(false);
      setError(null);
      setCallDeliveryStatus("The call ended. Active call state was cleared on both devices.");
      await loadThreadState();
    };

    void reconcileActiveInvite();
    const unsubscribe = subscribeToChillyChatCallInvite(inviteId, () => {
      void reconcileActiveInvite();
    });
    return () => {
      subscribed = false;
      unsubscribe();
    };
  }, [
    activeCallInvite?.id,
    activeCallInvite?.status,
    callRoom?.hostUserId,
    currentUserId,
    leaveRoom,
    loadThreadState,
    requestedNativeCallUuid,
    stopOutgoingRingback,
    threadId,
  ]);

  const otherMember = thread?.otherMember;
  const officialAccount = getOfficialPlatformAccount(otherMember?.userId);
  const otherMemberAvatarUrl = officialAccount ? undefined : otherMember?.avatarUrl;
  const otherMemberDisplayName = officialAccount?.displayName ?? otherMember?.displayName ?? "Direct Thread";
  const otherMemberHandle = officialAccount?.handle ?? formatUsernameHandle(otherMember?.username);
  const otherMemberTagline = officialAccount?.tagline ?? otherMember?.tagline;
  const outgoingCallRinging = !!outgoingCallInvite
    && shouldShowOutgoingRingingPanel({
      currentUserId,
      callerUserId: outgoingCallInvite.callerUserId,
      calleeUserId: outgoingCallInvite.calleeUserId,
      inviteStatus: outgoingCallInvite.status,
    })
    && participantCount < 2;
  const incomingCallRinging = !!incomingCallInvite
    && incomingCallInvite.status === "ringing"
    && incomingCallInvite.calleeUserId === currentUserId
    && incomingCallInvite.callerUserId !== currentUserId;
  const callTitle = outgoingCallRinging
    ? (thread?.activeCallType === "video" ? "Video call ringing" : "Voice call ringing")
    : (thread?.activeCallType === "video" ? "Video call active" : "Voice call active");
  const callBody = outgoingCallRinging
    ? `${otherMemberDisplayName} is being notified. You can return to the thread while Chi'lly Chat keeps ringing.`
    : thread?.activeCallType === "video"
      ? "Chi'lly Chat video stays inside this direct thread so both people can join without leaving the conversation."
      : "Chi'lly Chat voice stays inside this direct thread so both people can join without leaving the conversation.";
  const callActionLabel = callBusy
    ? "Connecting..."
    : !activeCallRoomId
      ? "No Active Call"
      : callPanelOpen
        ? "Call Open"
        : outgoingCallRinging
          ? "Open Ringing Call"
          : activeCallInvite?.status === "accepted"
            ? thread?.activeCallType === "video"
              ? "Open Video Call"
              : "Open Voice Call"
            : thread?.activeCallType === "video"
              ? "Join Video Call"
              : "Join Voice Call";

  const renderedMessages = useMemo(
    () => messages.map((message) => ({
      ...message,
      displayBody: decodeVisiblePercentEscapes(message.body),
      isMe: message.senderUserId === currentUserId,
      authorLabel: buildAuthor(thread?.members ?? [], message.senderUserId),
    })),
    [currentUserId, messages, thread?.members],
  );

  const friendStatusSummary = useMemo(() => {
    if (!otherMember?.userId || officialAccount) {
      return null;
    }

    if (friendLoading) {
      return {
        pill: "Checking Circle",
        title: "Checking Chi'lly Circle",
        body: "Chi'llywood is loading the private Chi'lly Circle state for this direct thread.",
      };
    }

    if (!friendState) {
      return {
        pill: "Direct thread only",
        title: "Direct thread only",
        body: "Messaging here does not automatically add someone to Chi'lly Circle. Chi'lly Circle is a separate mutual, private-first relationship.",
      };
    }

    if (friendState.availability === "blocked") {
      return {
        pill: "Unavailable",
        title: "Chi'lly Circle unavailable",
        body: "A Platform audience block currently prevents Chi'lly Circle actions between these accounts.",
      };
    }

    if (friendState.isFriend) {
      return {
        pill: "In Chi'lly Circle",
        title: "In Chi'lly Circle",
        body: "Chi'lly Circle is active here, but this thread still keeps its own chat and call history.",
      };
    }

    if (friendState.pendingDirection === "incoming") {
      return {
        pill: "Request waiting",
        title: "Chi'lly Circle request waiting on you",
        body: `${otherMemberDisplayName} already has this direct thread. Accept only if you want a separate mutual Chi'lly Circle connection too.`,
      };
    }

    if (friendState.pendingDirection === "outgoing") {
      return {
        pill: "Request sent",
        title: "Chi'lly Circle request sent",
        body: "This thread already works on its own. Chi'lly Circle becomes active only if the request is accepted.",
      };
    }

    if (friendState.availability === "signed_out") {
      return {
        pill: "Sign in for Circle",
        title: "Sign in for Chi'lly Circle",
        body: "Direct threads can exist without Chi'lly Circle. Sign in if you want to send or manage a request here.",
      };
    }

    return {
      pill: "Direct thread only",
      title: "Direct thread only",
      body: "Messaging here does not automatically add someone to Chi'lly Circle. Add them only if you both want a private mutual connection.",
    };
  }, [friendLoading, friendState, officialAccount, otherMember?.userId, otherMemberDisplayName]);

  const emptyThreadPrompts = useMemo(() => {
    return buildSmartReplySuggestions({
      activeCallType: thread?.activeCallType,
      otherMemberName: otherMemberDisplayName,
    });
  }, [otherMemberDisplayName, thread?.activeCallType]);

  useEffect(() => {
    let active = true;
    const targetUserId = String(otherMember?.userId ?? "").trim();

    if (!targetUserId || officialAccount) {
      setFriendState(null);
      setFriendLoading(false);
      return () => {
        active = false;
      };
    }

    setFriendLoading(true);
    readFriendRelationshipState(targetUserId)
      .then((nextState) => {
        if (active) setFriendState(nextState);
      })
      .catch(() => {
        if (active) setFriendState(null);
      })
      .finally(() => {
        if (active) setFriendLoading(false);
      });

    return () => {
      active = false;
    };
  }, [officialAccount, otherMember?.userId]);

  const handlePickAttachment = useCallback(async (scope: SocialAttachmentPickerScope) => {
    try {
      setError(null);
      const file = await pickSocialAttachmentFile(scope);
      if (!file) return;
      setAttachmentFile(file);
    } catch (error) {
      setAttachmentFile(null);
      setError(error instanceof Error ? error.message : "Unable to attach that file right now.");
    }
  }, []);

  const handleSelectAttachment = useCallback((scope: SocialAttachmentPickerScope) => {
    setAttachmentSheetVisible(false);
    void handlePickAttachment(scope);
  }, [handlePickAttachment]);

  const handleSend = useCallback(async (bodyOverride?: string) => {
    const trimmedDraft = String(bodyOverride ?? draft).trim();
    const selectedAttachment = bodyOverride ? null : attachmentFile;
    if (!threadId || (!trimmedDraft && !selectedAttachment) || sending || !thread) return;
    if (!appConfig.runtimeControls.chat_enabled) {
      setError("Chi'lly Chat is temporarily paused. You can still read existing messages.");
      return;
    }
    if (selectedAttachment && !appConfig.runtimeControls.chat_attachments_enabled) {
      setError("Chat attachments are temporarily paused. You can still send text messages.");
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      threadId,
      senderUserId: currentUserId,
      body: trimmedDraft || selectedAttachment?.name || "Attachment",
      messageType: "text",
      createdAt: new Date().toISOString(),
      attachments: [],
      moderationStatus: "clean",
      isModerationHidden: false,
    };

    setDraft("");
    if (!bodyOverride) setAttachmentFile(null);
    setSending(true);
    setMessages((prev) => [...prev, optimistic]);

    try {
      const sent = await sendChatMessage(threadId, trimmedDraft, selectedAttachment);
      trackEvent("chat_message_sent", {
        surface: "chat-thread",
        threadId,
        hasAttachment: selectedAttachment ? "true" : "false",
      });
      setMessages((prev) => prev.map((message) => (message.id === tempId ? sent : message)));
      await markThreadReadWithThrottle();
    } catch (sendError) {
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      if (selectedAttachment) setAttachmentFile(selectedAttachment);
      const message = sendError instanceof Error && sendError.message === SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE
        ? SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE
        : sendError instanceof Error
          ? sendError.message
          : "Unable to send Chi'lly Chat message.";
      setError(message);
      reportRuntimeError("chat-thread-send-message", sendError, {
        threadId,
      });
    } finally {
      setSending(false);
    }
  }, [appConfig.runtimeControls.chat_attachments_enabled, appConfig.runtimeControls.chat_enabled, attachmentFile, currentUserId, draft, markThreadReadWithThrottle, sending, thread, threadId]);

  const handleStartCall = useCallback(async (mode: ChatCallType) => {
    logChatCall("handle_start_call", {
      threadId,
      mode,
      callBusy,
      activeCommunicationRoomId: activeCallRoomId,
    });
    if (!threadId) {
      setError("Open a valid Chi'lly Chat thread before starting a call.");
      return;
    }
    if (callBusy) return;
    if (activeCallRoomId) {
      setCallDeliveryStatus("A call is already active in this thread. Open Call to continue.");
      return;
    }
    if (officialAccount) {
      setError("Calls are unavailable for the official Chi'llywood support thread.");
      return;
    }
    if (!appConfig.runtimeControls.chat_enabled) {
      setError("Chi'lly Chat calls are temporarily paused. You can still read existing messages.");
      return;
    }

    try {
      setCallBusy(true);
      setCallDeliveryStatus(null);
      void (Platform.OS === "android"
        ? requestPushPermissionAndRegister()
        : refreshPushRegistrationIfGranted());
      const result = await startChatThreadCall(threadId, mode);
      setThread(result.thread);
      if (result.role === "callee" && result.invite?.status === "ringing") {
        stopOutgoingRingback();
        activeCallInviteRef.current = null;
        setActiveCallInvite(null);
        setOutgoingCallInvite(null);
        setIncomingCallInvite(result.invite);
        setCallPanelOpen(false);
        setCallDeliveryStatus("You both called at the same time. The other call won; answer or decline it here.");
        return;
      }
      if (result.invite?.status === "busy") {
        stopOutgoingRingback();
        activeCallInviteRef.current = null;
        setActiveCallInvite(null);
        setOutgoingCallInvite(null);
        setIncomingCallInvite(null);
        setCallPanelOpen(false);
        setCallDeliveryStatus("The other person is already in a Chi'lly Chat call. No media was started.");
        return;
      }
      activeCallInviteRef.current = result.invite;
      setActiveCallInvite(result.invite);
      setOutgoingCallInvite(result.invite);
      setIncomingCallInvite(null);
      setCallPanelOpen(true);
      setCallDeliveryStatus(getChillyChatCallDeliveryMessage(result.delivery));
      logChatCall("handle_start_call_success", {
        threadId,
        mode,
        roomId: result.roomId,
        activeCommunicationRoomIdAfter: result.thread.activeCommunicationRoomId ?? "",
        deliveryStatus: result.delivery?.status ?? "",
        receiverPushSent: result.delivery?.pushSent === true,
        receiverNotificationCreated: result.delivery?.notificationCreated === true,
      });
      trackEvent("chat_call_started", {
        surface: "chat-thread",
        threadId,
        mode,
      });
    } catch (callStartError) {
      setOutgoingCallInvite(null);
      logChatCall("handle_start_call_failed", {
        threadId,
        mode,
        message: callStartError instanceof Error ? callStartError.message : "unknown_error",
      });
      const message = callStartError instanceof Error ? callStartError.message : "Unable to start Chi'lly Chat call.";
      setError(message);
      setCallDeliveryStatus("Delivery status: invite failed. Call was not started and receiver notification was not sent.");
      reportRuntimeError("chat-thread-start-call", callStartError, {
        threadId,
        mode,
      });
    } finally {
      setCallBusy(false);
    }
  }, [activeCallRoomId, appConfig.runtimeControls.chat_enabled, callBusy, officialAccount, stopOutgoingRingback, threadId]);

  const readAcceptableIncomingInvite = useCallback(async (
    invite: ChillyChatCallInvite,
  ): Promise<ChillyChatCallInvite | null> => {
    const latestInvite = await readChillyChatCallInvite(invite.id).catch(() => null);
    const expiresAt = Date.parse(String(latestInvite?.expiresAt ?? ""));
    const expired = Number.isFinite(expiresAt) && expiresAt <= Date.now();
    const roomId = normalizeCommunicationRoomIdentifier(latestInvite?.communicationRoomId);
    const valid =
      !!latestInvite
      && latestInvite.status === "ringing"
      && !expired
      && !!roomId
      && latestInvite.threadId === threadId
      && latestInvite.calleeUserId === currentUserId
      && latestInvite.callerUserId !== currentUserId;

    if (valid) return latestInvite;

    await clearEndedChatThreadCall(threadId).catch(() => null);
    clearVisibleIncomingCallState(latestInvite ?? invite);
    setCallDeliveryStatus("This Chi'lly Chat call is no longer available. Ask the caller to start a new call.");
    return null;
  }, [clearVisibleIncomingCallState, currentUserId, threadId]);

  const resumeAcceptedIncomingInvite = useCallback(async (
    invite: ChillyChatCallInvite,
  ) => {
    if (!invite || callBusy || !currentUserId) return false;
    const roomId = normalizeCommunicationRoomIdentifier(invite.communicationRoomId);
    const joinAction = resolveIncomingCallRoomJoinAction({
      currentUserIsRoomHost: false,
      inviteBelongsToCurrentCallee:
        invite.threadId === threadId
        && invite.calleeUserId === currentUserId
        && invite.callerUserId !== currentUserId,
      inviteStatus: invite.status,
    });
    if (joinAction !== "resume" || !roomId) return false;

    Vibration.cancel();
    void stopChillyChatCallSound(incomingCallSoundRef.current);
    incomingCallSoundRef.current = null;
    if (incomingCallTimeoutRef.current) {
      clearTimeout(incomingCallTimeoutRef.current);
      incomingCallTimeoutRef.current = null;
    }
    setCallBusy(true);
    try {
      const [latestInvite, latestThread] = await Promise.all([
        readChillyChatCallInvite(invite.id).catch(() => null),
        getChatThread(threadId).catch(() => null),
      ]);
      const authoritative =
        latestInvite?.status === "accepted"
        && latestInvite.id === invite.id
        && latestInvite.threadId === threadId
        && latestInvite.communicationRoomId === roomId
        && latestInvite.calleeUserId === currentUserId
        && latestInvite.callerUserId !== currentUserId
        && latestThread?.activeCommunicationRoomId === roomId;
      if (!authoritative || !latestInvite) {
        setCallDeliveryStatus("This Chi'lly Chat call is no longer available. Ask the caller to start a new call.");
        return false;
      }

      if (!(await completeTrustedIosNativeAnswer(latestInvite))) {
        throw new Error("Unable to finish the native Answer handoff safely.");
      }
      if (!applyAcceptedIncomingInviteState(latestInvite)) return false;
      await dismissPresentedChillyChatCallNotifications({
        callInviteId: latestInvite.id,
        dismissAllPresentedNotificationsFallback: true,
        dismissIncomingCallFallback: true,
        threadId,
      }).catch(() => 0);
      await dismissChillyChatCallNotificationRows({
        callInviteId: latestInvite.id,
        threadId,
      }).catch(() => 0);
      logChatCall("accepted_invite_resumed", {
        threadId,
        roomId,
      });
      await loadThreadState();
      return true;
    } catch (resumeError) {
      setError(resumeError instanceof Error ? resumeError.message : "Unable to resume this Chi'lly Chat call.");
      return false;
    } finally {
      setCallBusy(false);
    }
  }, [
    applyAcceptedIncomingInviteState,
    callBusy,
    completeTrustedIosNativeAnswer,
    currentUserId,
    loadThreadState,
    requestedNativeCallAction,
    requestedNativeCallUuid,
    threadId,
  ]);

  const acceptIncomingInvite = useCallback(async (invite: ChillyChatCallInvite) => {
    if (!invite || callBusy || !currentUserId) return false;
    Vibration.cancel();
    void stopChillyChatCallSound(incomingCallSoundRef.current);
    incomingCallSoundRef.current = null;
    if (incomingCallTimeoutRef.current) {
      clearTimeout(incomingCallTimeoutRef.current);
      incomingCallTimeoutRef.current = null;
    }
    setCallBusy(true);
    try {
      const currentInvite = await readAcceptableIncomingInvite(invite);
      if (!currentInvite) return false;
      const acceptedInvite = await updateChillyChatCallInviteStatus({
        actorUserId: currentUserId,
        invite: currentInvite,
        status: "accepted",
      });
      if (!acceptedInvite) {
        throw new Error("Unable to accept this Chi'lly Chat call right now.");
      }
      if (!(await completeTrustedIosNativeAnswer(acceptedInvite))) {
        throw new Error("Unable to finish the native Answer handoff safely.");
      }
      if (!applyAcceptedIncomingInviteState(acceptedInvite)) {
        throw new Error("Unable to open this accepted Chi'lly Chat call.");
      }
      await dismissPresentedChillyChatCallNotifications({
        callInviteId: currentInvite.id,
        dismissAllPresentedNotificationsFallback: true,
        dismissIncomingCallFallback: true,
        threadId,
      }).catch(() => 0);
      await dismissChillyChatCallNotificationRows({
        callInviteId: currentInvite.id,
        threadId,
      }).catch(() => 0);
      trackEvent("chat_call_accepted", {
        surface: "chat-thread",
        threadId,
        mode: currentInvite.callType,
      });
      await loadThreadState();
      return true;
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "Unable to accept this Chi'lly Chat call.");
      return false;
    } finally {
      setCallBusy(false);
    }
  }, [
    applyAcceptedIncomingInviteState,
    callBusy,
    completeTrustedIosNativeAnswer,
    currentUserId,
    loadThreadState,
    readAcceptableIncomingInvite,
    requestedNativeCallAction,
    requestedNativeCallUuid,
    threadId,
  ]);

  const handleAcceptIncomingCall = useCallback(async () => {
    if (!incomingCallInvite) return;
    await acceptIncomingInvite(incomingCallInvite);
  }, [acceptIncomingInvite, incomingCallInvite]);

  const requestAuthoritativeIncomingCallDecline = useCallback(async (
    invite: ChillyChatCallInvite,
  ) => {
    const updatedInvite = await updateChillyChatCallInviteStatus({
      actorUserId: currentUserId!,
      invite,
      status: "declined",
    });
    const candidateInvite = updatedInvite
      ?? await readChillyChatCallInvite(invite.id).catch(() => null);
    return resolveAuthoritativeNativeCallDecline({
      currentUserId,
      expectedInviteId: invite.id,
      expectedThreadId: threadId,
      invite: candidateInvite,
    });
  }, [currentUserId, threadId]);

  const handleDeclineIncomingCall = useCallback(async () => {
    if (!incomingCallInvite || callBusy || !currentUserId) return;
    Vibration.cancel();
    void stopChillyChatCallSound(incomingCallSoundRef.current);
    incomingCallSoundRef.current = null;
    setCallBusy(true);
    try {
      const declinedInvite = await requestAuthoritativeIncomingCallDecline(incomingCallInvite);
      if (!declinedInvite) {
        throw new Error("Unable to decline this Chi'lly Chat call right now.");
      }
      rememberHandledIncomingInvite(declinedInvite, { clearRoom: true });
      await dismissPresentedChillyChatCallNotifications({
        callInviteId: incomingCallInvite.id,
        dismissAllPresentedNotificationsFallback: true,
        dismissIncomingCallFallback: true,
        threadId,
      }).catch(() => 0);
      await dismissChillyChatCallNotificationRows({
        callInviteId: incomingCallInvite.id,
        threadId,
      }).catch(() => 0);
      await clearEndedChatThreadCall(threadId);
      clearVisibleIncomingCallState(incomingCallInvite);
      setCallDeliveryStatus("Incoming call declined. Call state was cleared.");
      trackEvent("chat_call_declined", {
        surface: "chat-thread",
        threadId,
        mode: incomingCallInvite.callType,
      });
      await loadThreadState();
    } catch (declineError) {
      setError(declineError instanceof Error ? declineError.message : "Unable to decline this Chi'lly Chat call.");
    } finally {
      setCallBusy(false);
    }
  }, [callBusy, clearVisibleIncomingCallState, currentUserId, incomingCallInvite, loadThreadState, rememberHandledIncomingInvite, requestAuthoritativeIncomingCallDecline, threadId]);

  useEffect(() => {
    const action = ["answer", "decline", "end", "mute", "unmute"].includes(requestedNativeCallAction)
      ? requestedNativeCallAction
      : "";
    const requestKey = requestedNativeCallRequestKey;
    if (!requestKey) {
      nativeCallActionHandledRef.current = "";
      return;
    }
    if (loading || callBusy || !currentUserId) return;
    if (nativeCallActionHandledRef.current === requestKey) return;
    nativeCallActionHandledRef.current = requestKey;
    const resolveRequestedInvite = async () => {
      const hydratedInvite =
        incomingCallInvite?.id === requestedCallInviteId
          ? incomingCallInvite
          : null;
      if (hydratedInvite) return hydratedInvite;

      for (let attempt = 0; attempt < 6; attempt += 1) {
        const invite = await readChillyChatCallInvite(requestedCallInviteId).catch(() => null);
        if (invite || attempt === 5) return invite;
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
      return null;
    };

    const handleNativeCallAction = async () => {
      const invite = await resolveRequestedInvite();
      if (activeNativeCallActionRequestKeyRef.current !== requestKey) return;
      const claimStillOwnsTransition = doesNativeCallActionOwnTransition({
        authority: trustedNativeCallClaim ? "trusted_native_claim" : "none",
        callInviteId: requestedCallInviteId,
        currentUserId,
        nativeIdentity: requestedNativeCallIdentity,
        nativeCallAction: requestedNativeCallAction,
        monotonicNowMs: globalThis.performance?.now?.(),
        platform: Platform.OS,
        threadId,
        trustedNativeClaim: trustedNativeCallClaim,
      });
      if (!claimStillOwnsTransition) {
        setTrustedNativeCallClaim(null);
        setTrustedNativeCallClaimAccountId("");
        if (action === "answer" && requestedNativeCallUuid) {
          await completeIosNativeCallAnswer(requestedNativeCallUuid, false);
        }
        return;
      }
      if (
        !invite
        || invite.threadId !== threadId
        || (invite.calleeUserId !== currentUserId && invite.callerUserId !== currentUserId)
        || ((action === "answer" || action === "decline") && invite.calleeUserId !== currentUserId)
        || ((action === "answer" || action === "decline") && invite.callerUserId === currentUserId)
      ) {
        setCallDeliveryStatus("This Chi'lly Chat call is no longer available. Ask the caller to start a new call.");
        await dismissPresentedChillyChatCallNotifications({
          callInviteId: requestedCallInviteId,
          dismissAllPresentedNotificationsFallback: true,
          dismissIncomingCallFallback: true,
          threadId,
        }).catch(() => 0);
        if (action === "answer" && requestedNativeCallUuid) {
          await completeIosNativeCallAnswer(requestedNativeCallUuid, false);
        }
        return;
      }

      if (action === "answer") {
        const accepted = invite.status === "accepted"
          ? await resumeAcceptedIncomingInvite(invite)
          : await acceptIncomingInvite(invite);
        if (!accepted && requestedNativeCallUuid) {
          await completeIosNativeCallAnswer(requestedNativeCallUuid, false);
        }
        return;
      }

      if (action === "mute" || action === "unmute") {
        const shouldMute = action === "mute";
        if (invite.status === "accepted") {
          await setMicrophoneEnabled(!shouldMute);
        }
        return;
      }

      if (action === "end") {
        if (invite.status === "accepted") {
          const isHost = !!callRoom?.hostUserId && callRoom.hostUserId === currentUserId;
          const endedInvite = await updateChillyChatCallInviteStatus({
            actorUserId: currentUserId,
            invite,
            status: "ended",
          }).catch(() => null);
          if (!endedInvite) {
            setError("Unable to confirm that the call ended for both participants. Reopen the call and try End Call again.");
            return;
          }
          handledActiveTerminalInviteIdsRef.current.add(invite.id);
          await leaveRoom({ endRoomIfHost: isHost }).catch(() => undefined);
        }
        activeCallInviteRef.current = null;
        setActiveCallInvite(null);
        await clearEndedChatThreadCall(threadId).catch(() => null);
        setCallPanelOpen(false);
        await loadThreadState();
        return;
      }

      if (incomingCallInvite?.id === invite.id) {
        await handleDeclineIncomingCall();
        return;
      }

      const declinedInvite = await requestAuthoritativeIncomingCallDecline(invite);
      if (!declinedInvite) {
        setError("Unable to confirm that the call was declined. The active call remains unchanged.");
        return;
      }
      rememberHandledIncomingInvite(declinedInvite, { clearRoom: true });
      await dismissPresentedChillyChatCallNotifications({
        callInviteId: invite.id,
        dismissAllPresentedNotificationsFallback: true,
        dismissIncomingCallFallback: true,
        threadId,
      }).catch(() => 0);
      await dismissChillyChatCallNotificationRows({
        callInviteId: invite.id,
        threadId,
      }).catch(() => 0);
      await clearEndedChatThreadCall(threadId).catch(() => null);
      clearVisibleIncomingCallState(invite);
      setCallDeliveryStatus("Incoming call declined. Call state was cleared.");
      await loadThreadState();
    };

    void handleNativeCallAction();
  }, [
    acceptIncomingInvite,
    callBusy,
    clearVisibleIncomingCallState,
    currentUserId,
    handleDeclineIncomingCall,
    incomingCallInvite,
    loadThreadState,
    loading,
    rememberHandledIncomingInvite,
    requestedCallInviteId,
    requestedNativeCallAction,
    requestedNativeCallIdentity,
    requestedNativeCallRequestKey,
    requestedNativeCallUuid,
    requestAuthoritativeIncomingCallDecline,
    resumeAcceptedIncomingInvite,
    setMicrophoneEnabled,
    callRoom?.hostUserId,
    leaveRoom,
    threadId,
    trustedNativeCallClaim,
  ]);

  useEffect(() => {
    if (Platform.OS !== "ios" || !requestedNativeCallUuid) return undefined;
    return subscribeToIosNativeCallEvents((event) => {
      const eventCallUuid = String(event.callUuid ?? "").trim();
      const appliesToActiveCall = !eventCallUuid || eventCallUuid === requestedNativeCallUuid;
      if (!appliesToActiveCall) return;
      if (event.type === "muted" || event.type === "unmuted") {
        void setMicrophoneEnabled(event.type === "unmuted");
        return;
      }
      if (
        event.type === "audioSessionActivated"
        || event.type === "applicationActive"
      ) {
        setNativeMediaActivationSerial((current) => current + 1);
      }
      if (event.type === "audioSessionActivated") {
        setNativeAudioSessionCallUuid(requestedNativeCallUuid);
      }
    });
  }, [requestedNativeCallUuid, setMicrophoneEnabled]);

  const handleJoinOrCloseCall = useCallback(async (
    expectedInviteId = "",
    allowForegroundRingingAccept = true,
  ) => {
    const normalizedExpectedInviteId = String(expectedInviteId).trim();
    logChatCall("handle_join_or_close", {
      threadId,
      activeCommunicationRoomId: activeCallRoomId,
      callPanelOpen,
      activeCallType: thread?.activeCallType ?? "",
      hasExpectedInvite: normalizedExpectedInviteId.length > 0,
    });
    if (!threadId || officialAccount) return;

    if (!activeCallRoomId) {
      logChatCall("handle_join_or_close_decision", {
        threadId,
        decision: "start_fresh_video",
      });
      await handleStartCall("video");
      return;
    }

    if (!callPanelOpen) {
      let joinInvite = activeCallInvite?.communicationRoomId === activeCallRoomId
        ? activeCallInvite
        : outgoingCallInvite?.communicationRoomId === activeCallRoomId
          ? outgoingCallInvite
          : incomingCallInvite?.communicationRoomId === activeCallRoomId
            ? incomingCallInvite
            : null;
      if (normalizedExpectedInviteId && joinInvite?.id !== normalizedExpectedInviteId) {
        joinInvite = null;
      }
      for (let attempt = 0; !joinInvite && normalizedExpectedInviteId && attempt < 6; attempt += 1) {
        const requestedInvite = await readChillyChatCallInvite(normalizedExpectedInviteId).catch(() => null);
        if (requestedInvite?.communicationRoomId === activeCallRoomId) joinInvite = requestedInvite;
        if (!joinInvite && attempt < 5) await new Promise((resolve) => setTimeout(resolve, 300));
      }
      for (let attempt = 0; !joinInvite && !normalizedExpectedInviteId && attempt < 6; attempt += 1) {
        joinInvite = await readLatestChillyChatCallInviteForRoom(activeCallRoomId).catch(() => null);
        if (!joinInvite && attempt < 5) await new Promise((resolve) => setTimeout(resolve, 300));
      }

      const inviteBelongsToCurrentParticipant = !!joinInvite
        && joinInvite.threadId === threadId
        && (joinInvite.callerUserId === currentUserId || joinInvite.calleeUserId === currentUserId);
      const currentUserIsRoomHost = inviteBelongsToCurrentParticipant
        && joinInvite?.callerUserId === currentUserId;
      if (!currentUserIsRoomHost) {
        const inviteBelongsToCurrentCallee = !!joinInvite
          && joinInvite.threadId === threadId
          && joinInvite.calleeUserId === currentUserId
          && joinInvite.callerUserId !== currentUserId;
        const joinAction = resolveIncomingCallRoomJoinAction({
          currentUserIsRoomHost,
          inviteBelongsToCurrentCallee,
          inviteStatus: joinInvite?.status,
        });
        if (joinAction === "accept" && joinInvite) {
          if (!allowForegroundRingingAccept) {
            setCallDeliveryStatus("Answer this ringing call with the in-app Answer control.");
            return;
          }
          const accepted = await acceptIncomingInvite(joinInvite);
          if (!accepted) {
            setCallDeliveryStatus("Incoming call could not be accepted. Ask the caller to start a new call.");
          }
          return;
        }
        if (joinAction !== "resume" || !joinInvite) {
          setCallPanelOpen(false);
          setCallDeliveryStatus("This call is not accepted or is no longer available. Ask the caller to start a new call.");
          await loadThreadState();
          return;
        }
        activeCallInviteRef.current = joinInvite;
        setActiveCallInvite(joinInvite);
      } else if (!joinInvite || (joinInvite.status !== "ringing" && joinInvite.status !== "accepted")) {
        setCallPanelOpen(false);
        setCallDeliveryStatus("This call is no longer available. Start a new call when both people are ready.");
        await loadThreadState();
        return;
      } else {
        activeCallInviteRef.current = joinInvite;
        setActiveCallInvite(joinInvite);
      }

      trackEvent("chat_call_join_requested", {
        surface: "chat-thread",
        threadId,
        mode: thread?.activeCallType ?? null,
      });
      setCallPanelOpen(true);
      setCallDeliveryStatus("Opening the active call from this thread.");
      logChatCall("handle_join_or_close_decision", {
        threadId,
        decision: "open_existing_call",
        roomId: activeCallRoomId,
      });
      return;
    }

    let shouldEndRoomAsHost = !!callRoom?.hostUserId && callRoom.hostUserId === currentUserId;
    try {
      const terminalInvite = activeCallInviteRef.current
        ?? outgoingCallInvite
        ?? await readLatestChillyChatCallInviteForRoom(activeCallRoomId).catch(() => null);
      const inviteBelongsToParticipant = !!terminalInvite
        && terminalInvite.threadId === threadId
        && (terminalInvite.callerUserId === currentUserId || terminalInvite.calleeUserId === currentUserId);
      if (!inviteBelongsToParticipant || !terminalInvite) {
        throw new Error("Unable to find the active call record. The call was left connected so it can be ended safely.");
      }
      const currentUserIsCaller = terminalInvite.callerUserId === currentUserId;
      shouldEndRoomAsHost = shouldEndRoomAsHost || currentUserIsCaller;
      logChatCall("handle_join_or_close_decision", {
        threadId,
        decision: shouldEndRoomAsHost ? "end_call_as_host" : "end_call_as_participant",
        roomId: activeCallRoomId,
      });
      if (terminalInvite.status === "ringing" && currentUserIsCaller && currentUserId) {
        const canceledInvite = await updateChillyChatCallInviteStatus({
          actorUserId: currentUserId,
          invite: terminalInvite,
          status: "canceled",
        }).catch(() => null);
        if (!canceledInvite) {
          throw new Error("Unable to cancel the ringing call for the receiver. The call was left connected so you can try again.");
        }
        handledActiveTerminalInviteIdsRef.current.add(terminalInvite.id);
      } else if (terminalInvite.status === "accepted" && currentUserId) {
        const endedInvite = await updateChillyChatCallInviteStatus({
          actorUserId: currentUserId,
          invite: terminalInvite,
          status: "ended",
        }).catch(() => null);
        if (!endedInvite) {
          throw new Error("Unable to end the call for both participants. The call was left connected so you can try again.");
        }
        handledActiveTerminalInviteIdsRef.current.add(terminalInvite.id);
        activeCallInviteRef.current = endedInvite;
        setActiveCallInvite(endedInvite);
      } else if (!TERMINAL_CHAT_CALL_INVITE_STATUSES.has(terminalInvite.status)) {
        throw new Error("The active call is changing state. Wait a moment and try End Call again.");
      }
      await leaveRoom({ endRoomIfHost: shouldEndRoomAsHost });
      if (requestedNativeCallUuid) {
        await endIosNativeCall(requestedNativeCallUuid, "in_app_leave").catch(() => false);
      }
      await clearEndedChatThreadCall(threadId);
      stopOutgoingRingback();
      setOutgoingCallInvite(null);
      activeCallInviteRef.current = null;
      setActiveCallInvite(null);
      setCallPanelOpen(false);
      setCallDeliveryStatus("The call ended and both participants' active call state was cleared.");
      await loadThreadState();
    } catch (leaveError) {
      const leaveMessage = leaveError instanceof Error
        ? leaveError.message
        : "Unable to end this Chi'lly Chat call safely.";
      setError(leaveMessage);
      setCallDeliveryStatus(leaveMessage);
      logChatCall("handle_join_or_close_failed", {
        threadId,
        roomId: activeCallRoomId,
        role: shouldEndRoomAsHost ? "host" : "viewer",
        message: leaveMessage,
      });
      reportRuntimeError("chat-thread-close-call", leaveError, {
        threadId,
        role: shouldEndRoomAsHost ? "host" : "viewer",
      });
    }
  }, [acceptIncomingInvite, activeCallInvite, activeCallRoomId, callPanelOpen, callRoom?.hostUserId, currentUserId, handleStartCall, incomingCallInvite, leaveRoom, loadThreadState, officialAccount, outgoingCallInvite, requestedNativeCallUuid, stopOutgoingRingback, thread?.activeCallType, threadId]);

  useEffect(() => {
    if (!trustedForegroundUiIntent || loading || callBusy || !currentUserId) return;
    const action = trustedForegroundUiIntent.action;
    if (action === "open_call" && (!activeCallInvite?.id || !activeCallRoomId)) return;
    const ownsAction = doesForegroundAuthenticatedUiCallIntentOwnAction({
      action,
      activeInviteId: activeCallInvite?.id,
      activeRoomId: activeCallRoomId,
      authority: "foreground_authenticated_ui",
      currentUserId,
      foregroundUiIntent: trustedForegroundUiIntent,
      monotonicNowMs: globalThis.performance?.now?.(),
      threadId,
    });
    if (!ownsAction) {
      setTrustedForegroundUiIntent(null);
      return;
    }
    if (foregroundCallIntentHandledRef.current === trustedForegroundUiIntent.claimId) return;
    foregroundCallIntentHandledRef.current = trustedForegroundUiIntent.claimId;

    const executeForegroundIntent = async () => {
      try {
        if (action === "start_voice" || action === "start_video") {
          await handleStartCall(action === "start_video" ? "video" : "voice");
          return;
        }
        if (
          action === "open_call"
          && !callPanelOpen
          && activeCallRoomId
          && (!trustedForegroundUiIntent.roomId || trustedForegroundUiIntent.roomId === activeCallRoomId)
        ) {
          await handleJoinOrCloseCall(trustedForegroundUiIntent.inviteId, false);
        }
      } finally {
        setTrustedForegroundUiIntent(null);
      }
    };
    void executeForegroundIntent();
  }, [activeCallInvite?.id, activeCallRoomId, callBusy, callPanelOpen, currentUserId, handleJoinOrCloseCall, handleStartCall, loading, threadId, trustedForegroundUiIntent]);

  useEffect(() => {
    logChatCall("panel_state_changed", {
      threadId,
      callPanelOpen,
      activeCommunicationRoomId: activeCallRoomId,
      activeCallType: thread?.activeCallType ?? "",
    });
  }, [activeCallRoomId, callPanelOpen, thread?.activeCallType, threadId]);

  const handleOpenProfile = useCallback(() => {
    if (!otherMember?.userId) return;

    trackEvent("chat_thread_profile_open_requested", {
      surface: "chat-thread",
      threadId,
      targetUserId: otherMember.userId,
    });
    setHeaderQuickActionsOpen(false);
    router.push({
      pathname: "/profile/[userId]",
      params: {
        userId: otherMember.userId,
        displayName: otherMemberDisplayName,
        avatarUrl: otherMemberAvatarUrl,
        tagline: otherMemberTagline,
      },
    });
  }, [otherMember, otherMemberAvatarUrl, otherMemberDisplayName, otherMemberTagline, router, threadId]);

  const handleHeaderCallAction = useCallback(async (mode: ChatCallType) => {
    setHeaderQuickActionsOpen(false);

    if (activeCallRoomId) {
      trackEvent("chat_thread_call_join_requested", {
        surface: "chat-thread-header",
        threadId,
        mode: thread?.activeCallType ?? mode,
      });
      setCallPanelOpen(true);
      return;
    }

    await handleStartCall(mode);
  }, [activeCallRoomId, handleStartCall, thread?.activeCallType, threadId]);

  const handleOpenReport = useCallback(() => {
    if (!threadId) {
      Alert.alert("Report", "This conversation is unavailable for reporting right now.");
      return;
    }

    trackModerationActionUsed({
      surface: "chat-thread",
      action: "open_safety_report",
      targetType: "chat_thread",
      targetId: threadId,
      threadId,
      sourceRoute: `/chat/${threadId}`,
      targetAuditOwnerKey: officialAccount?.auditOwnerKey ?? null,
      platformOwnedTarget: !!officialAccount,
    });
    setHeaderQuickActionsOpen(false);
    setReportVisible(true);
  }, [threadId, officialAccount]);

  const handleSubmitReport = useCallback(async (input: { category: Parameters<typeof submitSafetyReport>[0]["category"]; note: string }) => {
    if (!threadId) return;
    setReportBusy(true);
    try {
      await submitSafetyReport({
        targetType: "chat_thread",
        targetId: threadId,
        category: input.category,
        note: input.note,
        context: buildSafetyReportContext({
          sourceSurface: "chat-thread",
          sourceRoute: `/chat/${threadId}`,
          targetLabel: "Chat conversation",
          targetRoleLabel: officialAccount?.platformRoleLabel ?? "Conversation participant",
          targetAuditOwnerKey: officialAccount?.auditOwnerKey ?? null,
          platformOwnedTarget: !!officialAccount,
          context: {
            threadId,
            participantContext: otherMember?.userId ? "direct_chat_participant" : "unknown_participant",
            activeCallType: thread?.activeCallType ?? null,
          },
        }),
      });
      setReportVisible(false);
    } finally {
      setReportBusy(false);
    }
  }, [
    otherMember?.userId,
    thread?.activeCallType,
    threadId,
    officialAccount,
  ]);

  const handleOpenMessageReport = useCallback((message: ChatMessage) => {
    trackModerationActionUsed({
      surface: "chat-thread-message",
      action: "open_safety_report",
      targetType: "chat_message",
      targetId: message.id,
      threadId,
      sourceRoute: `/chat/${threadId}`,
      targetAuditOwnerKey: null,
      platformOwnedTarget: false,
    });
    setMessageReportTarget(message);
  }, [threadId]);

  const handleSubmitMessageReport = useCallback(async (input: { category: Parameters<typeof submitSafetyReport>[0]["category"]; note: string }) => {
    if (!messageReportTarget?.id || messageReportBusy) return;
    setMessageReportBusy(true);
    try {
      const senderLabel = buildAuthor(thread?.members ?? [], messageReportTarget.senderUserId);
      await submitSafetyReport({
        targetType: "chat_message",
        targetId: messageReportTarget.id,
        category: input.category,
        note: input.note,
        context: buildSafetyReportContext({
          sourceSurface: "chat-thread-message",
          sourceRoute: `/chat/${threadId}`,
          targetLabel: "Chat message",
          targetRoleLabel: senderLabel,
          context: {
            threadId,
            messageSenderUserId: messageReportTarget.senderUserId,
            messageCreatedAt: messageReportTarget.createdAt,
            hasAttachments: messageReportTarget.attachments.length > 0,
          },
        }),
      });
      setMessageReportTarget(null);
      Alert.alert("Report sent", "Thanks. The moderation team will review this message report.");
    } catch {
      Alert.alert("Report unavailable", "This message report could not be sent right now.");
    } finally {
      setMessageReportBusy(false);
    }
  }, [messageReportBusy, messageReportTarget, thread?.members, threadId]);

  const handleFriendAction = useCallback(async (action: "request" | "accept" | "decline" | "cancel" | "remove") => {
    const targetUserId = String(otherMember?.userId ?? "").trim();
    if (!targetUserId || officialAccount || friendBusy) return;

    setFriendBusy(action);
    try {
      const nextState = action === "request"
        ? await sendChillyCircleRequest(targetUserId)
        : action === "accept"
          ? await acceptChillyCircleRequest(targetUserId)
          : action === "decline"
            ? await declineChillyCircleRequest(targetUserId)
            : action === "cancel"
              ? await cancelChillyCircleRequest(targetUserId)
              : await removeFromChillyCircle(targetUserId);
      setFriendState(nextState);
    } catch (friendError) {
      const message = friendError instanceof Error
        ? friendError.message
            .replace(/friendship/gi, "Chi'lly Circle")
            .replace(/friends/gi, "Chi'lly Circle")
            .replace(/friend/gi, "Chi'lly Circle")
        : "Unable to update Chi'lly Circle right now.";
      Alert.alert("Chi'lly Circle unavailable", message);
    } finally {
      setFriendBusy(null);
    }
  }, [friendBusy, officialAccount, otherMember?.userId]);

  if (authLoading || loading) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: safeAreaInsets.top + 28 }]}>
        <ActivityIndicator size="small" color="#F34B74" />
        <Text style={styles.stateText}>{authLoading ? "Checking Chi'lly Chat access..." : "Loading thread…"}</Text>
      </View>
    );
  }

  if (!isSignedIn) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: safeAreaInsets.top + 28 }]}>
        <Text style={styles.stateText}>Sign in to open Chi’lly Chat.</Text>
        <TouchableOpacity
          style={[styles.secondaryBtn, styles.signInBtn]}
          activeOpacity={0.85}
          onPress={() => {
            router.push({
              pathname: "/(auth)/login",
              params: { redirectTo: threadId ? `/chat/${threadId}` : "/chat" },
            });
          }}
        >
          <Text style={styles.secondaryBtnText}>Sign In</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.85} onPress={() => router.back()}>
          <Text style={styles.secondaryBtnText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!thread) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: safeAreaInsets.top + 28 }]}>
        <Text style={styles.stateText}>{error ?? "This Chi'lly Chat thread is unavailable."}</Text>
        <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.85} onPress={() => router.back()}>
          <Text style={styles.secondaryBtnText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (officialAccount) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: safeAreaInsets.top + 28, paddingHorizontal: 24 }]}>
        <Text style={styles.stateText}>Rachi now lives in Chi’lly Circle.</Text>
        <Text style={[styles.stateText, styles.centeredStateBody]}>
          Rachi is your first official Chi’lly Circle connection. Chi’lly Chat is for direct threads with people.
        </Text>
        <TouchableOpacity
          style={[styles.secondaryBtn, styles.signInBtn]}
          activeOpacity={0.85}
          onPress={() => {
            router.replace("/chilly-circle" as Parameters<typeof router.replace>[0]);
          }}
        >
          <Text style={styles.secondaryBtnText}>Open Chi’lly Circle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.85} onPress={() => router.back()}>
          <Text style={styles.secondaryBtnText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const incomingCallInviteId = String(incomingCallInvite?.id ?? "").trim();
  const iosNativeCallPresentationOwned = hasIosNativeCallPresentation(incomingCallInviteId);
  const waitingForIosNativePresentation =
    Platform.OS === "ios"
    && isIosNativeCallsRuntimeEnabled()
    && !!incomingCallInviteId
    && !iosNativeCallPresentationOwned
    && iosNativePresentationGraceReadyInviteId !== incomingCallInviteId;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: safeAreaInsets.top + 8 }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      testID="chat-thread-screen"
      accessibilityLabel="Chi'lly Chat direct thread screen"
    >
      <View style={styles.header}>
        <TouchableOpacity
          testID="chat-thread-back-button"
          accessibilityLabel="Back from Chi'lly Chat thread"
          activeOpacity={0.8}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerAvatarButton}
          activeOpacity={0.86}
          onLongPress={() => setHeaderQuickActionsOpen((current) => !current)}
          onPress={() => setHeaderQuickActionsOpen((current) => !current)}
        >
          {otherMemberAvatarUrl ? (
            <Image source={{ uri: otherMemberAvatarUrl }} style={styles.headerAvatarImage} />
          ) : (
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarText}>{otherMemberDisplayName.slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>CHI’LLY CHAT</Text>
          <Text style={styles.title}>{otherMemberDisplayName}</Text>
          {otherMemberHandle ? (
            <Text style={styles.handleText} testID="chat-thread-header-handle">
              {otherMemberHandle}
            </Text>
          ) : null}
          {otherMemberTagline ? <Text style={styles.body}>{otherMemberTagline}</Text> : null}
          <View style={styles.headerMetaRow}>
            <View style={styles.headerPill}>
              <View style={[styles.headerPillDot, activeCallRoomId && styles.headerPillDotAlert]} />
              <Text style={styles.headerPillText}>{getThreadStatusLabel(thread)}</Text>
            </View>
            {thread?.currentMember?.lastReadAt ? (
              <Text style={styles.headerMetaText}>Read up to date.</Text>
            ) : (
              <Text style={styles.headerMetaText}>Voice and video stay in-thread.</Text>
            )}
          </View>
          <Text style={styles.headerHint}>
            Tap the avatar for profile, Chi’lly Circle, report, and call actions.
          </Text>
        </View>
      </View>

      {headerQuickActionsOpen ? (
        <View style={styles.headerQuickActionCard}>
          <Text style={styles.headerQuickActionKicker}>THREAD ACTIONS</Text>
          <Text style={styles.headerQuickActionTitle}>
            {otherMemberDisplayName}
          </Text>
          <Text style={styles.headerQuickActionBody}>
            Open the profile, manage Chi’lly Circle, or keep voice/video entry in this same thread.
          </Text>
          <View style={styles.headerQuickActionRow}>
            <TouchableOpacity
              style={styles.headerQuickActionButton}
              activeOpacity={0.86}
              disabled={!otherMember?.userId}
              onPress={() => {
                void handleOpenProfile();
              }}
            >
              <Text style={styles.headerQuickActionButtonText}>View Profile</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.headerQuickActionButton, styles.headerQuickActionReportButton]}
              activeOpacity={0.86}
              disabled={!otherMember?.userId}
              onPress={handleOpenReport}
            >
              <Text style={styles.headerQuickActionReportButtonText}>Report</Text>
            </TouchableOpacity>
            {activeCallRoomId ? (
              <TouchableOpacity
                style={[styles.headerQuickActionButton, styles.headerQuickActionAccentButton]}
                activeOpacity={0.86}
                onPress={() => {
                  void handleHeaderCallAction(thread?.activeCallType ?? "video");
                }}
              >
                <Text style={styles.headerQuickActionAccentButtonText}>Open Call</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.headerQuickActionButton, styles.headerQuickActionAccentButton]}
                  activeOpacity={0.86}
                  onPress={() => {
                    void handleHeaderCallAction("voice");
                  }}
                >
                  <Text style={styles.headerQuickActionAccentButtonText}>Voice Call</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.headerQuickActionButton, styles.headerQuickActionAccentButton]}
                  activeOpacity={0.86}
                  onPress={() => {
                    void handleHeaderCallAction("video");
                  }}
                >
                  <Text style={styles.headerQuickActionAccentButtonText}>Video Call</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
          {otherMember?.userId && friendStatusSummary ? (
            <View style={styles.friendshipCard}>
              <View style={styles.friendshipHeader}>
                <Text style={styles.friendshipKicker}>CHI’LLY CIRCLE</Text>
                <View style={styles.friendshipPill}>
                  <Text style={styles.friendshipPillText}>{friendStatusSummary.pill}</Text>
                </View>
              </View>
              <Text style={styles.friendshipTitle}>{friendStatusSummary.title}</Text>
              <Text style={styles.friendshipBody}>{friendStatusSummary.body}</Text>
              <View style={styles.friendshipActionRow}>
                {friendState?.canRequest ? (
                  <TouchableOpacity
                    style={[styles.friendshipActionButton, styles.friendshipActionButtonAccent]}
                    activeOpacity={0.86}
                    disabled={friendLoading || friendBusy !== null}
                    onPress={() => {
                      void handleFriendAction("request");
                    }}
                  >
                    <Text style={styles.friendshipActionButtonAccentText}>
                      {friendBusy === "request" ? "Sending..." : "Add to Chi'lly Circle"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {friendState?.canAccept ? (
                  <TouchableOpacity
                    style={[styles.friendshipActionButton, styles.friendshipActionButtonAccent]}
                    activeOpacity={0.86}
                    disabled={friendLoading || friendBusy !== null}
                    onPress={() => {
                      void handleFriendAction("accept");
                    }}
                  >
                    <Text style={styles.friendshipActionButtonAccentText}>
                      {friendBusy === "accept" ? "Accepting..." : "Accept"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {friendState?.canDecline ? (
                  <TouchableOpacity
                    style={styles.friendshipActionButton}
                    activeOpacity={0.86}
                    disabled={friendLoading || friendBusy !== null}
                    onPress={() => {
                      void handleFriendAction("decline");
                    }}
                  >
                    <Text style={styles.friendshipActionButtonText}>
                      {friendBusy === "decline" ? "Declining..." : "Decline"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {friendState?.canCancel ? (
                  <TouchableOpacity
                    style={styles.friendshipActionButton}
                    activeOpacity={0.86}
                    disabled={friendLoading || friendBusy !== null}
                    onPress={() => {
                      void handleFriendAction("cancel");
                    }}
                  >
                    <Text style={styles.friendshipActionButtonText}>
                      {friendBusy === "cancel" ? "Canceling..." : "Cancel Request"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
                {friendState?.canRemove ? (
                  <TouchableOpacity
                    style={styles.friendshipActionButton}
                    activeOpacity={0.86}
                    disabled={friendLoading || friendBusy !== null}
                    onPress={() => {
                      void handleFriendAction("remove");
                    }}
                  >
                    <Text style={styles.friendshipActionButtonText}>
                      {friendBusy === "remove" ? "Removing..." : "Remove from Chi'lly Circle"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <TouchableOpacity
          testID="chat-thread-voice-call-button"
          accessibilityLabel="Start Chi'lly Chat voice call"
          style={[styles.callBtn, callBusy && styles.callBtnDisabled]}
          activeOpacity={0.86}
          disabled={callBusy || !!activeCallRoomId}
          onPress={() => void handleStartCall("voice")}
        >
          <Text style={styles.callBtnText}>Voice Call</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="chat-thread-video-call-button"
          accessibilityLabel="Start Chi'lly Chat video call"
          style={[styles.callBtn, callBusy && styles.callBtnDisabled]}
          activeOpacity={0.86}
          disabled={callBusy || !!activeCallRoomId}
          onPress={() => void handleStartCall("video")}
        >
          <Text style={styles.callBtnText}>Video Call</Text>
        </TouchableOpacity>
        {!incomingCallRinging ? (
          <TouchableOpacity
            testID="chat-thread-join-call-button"
            accessibilityLabel={callActionLabel}
            style={[styles.joinBtn, (callBusy || (!activeCallRoomId && !callPanelOpen)) && styles.callBtnDisabled]}
            activeOpacity={0.86}
            disabled={callBusy || (!activeCallRoomId && !callPanelOpen)}
            onPress={() => void handleJoinOrCloseCall()}
          >
            <Text style={styles.joinBtnText}>{callActionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {activeCallRoomId && !callPanelOpen && !incomingCallRinging ? (
        <View style={styles.callBanner}>
          <Text style={styles.callBannerTitle}>{callTitle}</Text>
          <Text style={styles.callBannerBody}>
            {outgoingCallRinging
              ? `${otherMemberDisplayName} is still being notified. Tap Open Ringing Call to return.`
              : activeCallInvite?.status === "accepted"
                ? "Your call is still connected. Tap Open Call to return to the controls."
                : `${otherMemberDisplayName} can join from this same thread. Open Chi’lly Chat to join.`}
          </Text>
        </View>
      ) : null}

      {callDeliveryStatus ? (
        <View
          style={styles.callDeliveryStatusCard}
          testID="chat-call-delivery-status"
          accessibilityLabel="Chi'lly Chat call delivery status"
        >
          <MaterialIcons name="notifications-active" size={16} color="#A9F6D2" />
          <Text style={styles.callDeliveryStatusText}>{callDeliveryStatus}</Text>
        </View>
      ) : null}

      <ScrollView
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        testID="chat-thread-messages-scroll"
        accessibilityLabel="Chi'lly Chat messages"
      >
        {renderedMessages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.messageBubble,
              message.isMe ? styles.messageBubbleMe : styles.messageBubbleThem,
            ]}
          >
            <Text style={[styles.messageAuthor, message.isMe && styles.messageAuthorMe]}>
              {message.isMe ? "You" : message.authorLabel}
            </Text>
            <LinkedText text={message.displayBody} style={styles.messageBody} />
            {message.attachments.length ? (
              <View style={styles.messageAttachmentStack}>
                {message.attachments.map((attachment) => (
                  <SocialAttachmentCard key={attachment.id} attachment={attachment} compact />
                ))}
              </View>
            ) : null}
            <Text style={[styles.messageTime, message.isMe && styles.messageTimeMe]}>
              {formatStamp(message.createdAt)}
            </Text>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Report message"
              testID="chat-message-report-button"
              activeOpacity={0.82}
              onPress={() => handleOpenMessageReport(message)}
              style={[styles.messageReportButton, message.isMe && styles.messageReportButtonMe]}
            >
              <Text style={[styles.messageReportButtonText, message.isMe && styles.messageReportButtonTextMe]}>
                Report message
              </Text>
            </TouchableOpacity>
          </View>
        ))}
        {renderedMessages.length === 0 ? (
          <View
            style={styles.emptyCard}
            testID="chat-thread-empty-state"
            accessibilityLabel="Chi'lly Chat empty thread"
          >
            <Text style={styles.emptyTitle}>Start the conversation</Text>
            <Text style={styles.emptyBody}>
              Send the first message here, or start a voice or video handoff from the same thread.
            </Text>
            <View style={styles.starterPromptRow}>
              {emptyThreadPrompts.map((prompt) => (
                <TouchableOpacity
                  key={prompt}
                  style={styles.starterPromptChip}
                  activeOpacity={0.86}
                  disabled={sending}
                  onPress={() => {
                    void handleSend(prompt);
                  }}
                >
                  <Text style={styles.starterPromptChipText}>{prompt}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
        {callEvents.length ? (
          <View style={styles.callEventStack} testID="chat-thread-call-events">
            <Text style={styles.callEventSectionLabel}>Recent calls in this thread</Text>
            {callEvents.slice(-3).map((event) => (
              <View key={event.id} style={styles.callEventCard}>
                <View style={styles.callEventIcon}>
                  <MaterialIcons
                    name={event.callType === "video" ? "videocam" : "call"}
                    size={12}
                    color="#FFDCE5"
                  />
                </View>
                <View style={styles.callEventCopy}>
                  <Text style={styles.callEventTitle}>{formatCallEventTitle(event, currentUserId)}</Text>
                  <Text style={styles.callEventMeta}>{formatStamp(event.createdAt)}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View
        style={[
          styles.composer,
          Platform.OS === "android" && composerFocused ? styles.composerKeyboardDocked : null,
          {
            paddingBottom: Platform.OS === "ios"
              ? Math.max(safeAreaInsets.bottom + 18, 28)
              : Math.max(safeAreaInsets.bottom + 12, 20),
          },
        ]}
        testID="chat-thread-composer"
        accessibilityLabel="Chi'lly Chat composer"
      >
        <View style={styles.composerAffordanceRow}>
          <View style={styles.composerAffordanceChip}>
            <Text style={styles.composerAffordanceText}>Text and attachments</Text>
          </View>
          <Text style={styles.composerAssistText}>Calls stay in-thread. Attachments stay private to this thread.</Text>
        </View>
        <GatedSmartReplySuggestions
          activeCallType={thread?.activeCallType}
          currentUserId={currentUserId}
          messages={messages}
          otherMemberName={otherMemberDisplayName}
          onSelectSuggestion={(suggestion) => {
            trackEvent("chat_thread_ai_suggestion_selected", {
              surface: "chat-thread",
              threadId,
              suggestion,
            });
            setDraft((current) => (current.trim() ? `${current.trim()} ${suggestion}` : suggestion));
          }}
        />
        {attachmentFile ? (
          <SocialAttachmentCard
            file={attachmentFile}
            compact
            onRemove={() => setAttachmentFile(null)}
          />
        ) : null}
        <View style={styles.composerInputRow}>
          <TouchableOpacity
            testID="chat-thread-attach-button"
            accessibilityLabel="Attach a Chi'lly Chat file"
            style={[styles.attachBtn, sending && styles.callBtnDisabled]}
            activeOpacity={0.86}
            disabled={sending}
            onPress={() => {
              setAttachmentSheetVisible(true);
            }}
          >
            <MaterialIcons name="attach-file" size={18} color="#F4F8FF" />
          </TouchableOpacity>
          <TextInput
            testID="chat-thread-input"
            accessibilityLabel="Write a Chi'lly Chat message"
            style={styles.input}
            placeholder="Write a message"
            placeholderTextColor="#7F8AA1"
            value={draft}
            onChangeText={setDraft}
            onFocus={() => setComposerFocused(true)}
            onBlur={() => setComposerFocused(false)}
            multiline
          />
          <TouchableOpacity
            testID="chat-thread-send-button"
            accessibilityLabel="Send Chi'lly Chat message"
            style={[styles.sendBtn, (sending || (!draft.trim() && !attachmentFile)) && styles.callBtnDisabled]}
            activeOpacity={0.86}
            disabled={sending || (!draft.trim() && !attachmentFile)}
            onPress={() => {
              void handleSend();
            }}
          >
            <Text style={styles.sendBtnText}>{sending ? "..." : "Send"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {callPanelOpen ? (
        <View style={styles.callOverlay}>
          <InRoomCommunicationPanel
            surfaceLabel="Chi'lly Chat"
            titleText={callTitle}
            bodyText={callBody}
            loadingText="Connecting Chi'lly Chat call…"
            emptyStateText={outgoingCallRinging
              ? "Ringing. Waiting for the other participant to answer this Chi'lly Chat call."
              : "Waiting for the other participant to join this Chi'lly Chat call."}
            roomCode={callRoom?.roomCode ?? activeCallRoomId}
            participantCount={outgoingCallRinging ? 1 : participantCount}
            isHost={outgoingCallRinging || (!!callRoom?.hostUserId && callRoom.hostUserId === currentUserId)}
            channelState={callChannelState}
            loading={outgoingCallRinging ? false : callLoading}
            statusMessage={outgoingCallRinging ? null : callError}
            statusLabelOverride={outgoingCallRinging ? "Ringing" : null}
            participants={participants}
            callType={thread?.activeCallType ?? null}
            cameraEnabled={cameraEnabled}
            micEnabled={micEnabled}
            mediaControlsBusy={mediaControlsBusy}
            speakerEnabled={nativeSpeakerEnabled}
            leaveLabel={outgoingCallRinging ? "Cancel Call" : "End Call"}
            mediaPermissionMessage={mediaPermissionMessage}
            canOpenMediaSettings={canOpenMediaSettings}
            showControls={outgoingCallRinging || activeCallInvite?.status === "accepted"}
            showMediaControls={!outgoingCallRinging && !callError && !callLoading}
            presentation="fullscreen"
            onToggleCamera={() => {
              void handleToggleCallCamera();
            }}
            onToggleMic={() => {
              void handleToggleCallMic();
            }}
            onToggleAudioRoute={Platform.OS === "ios" || canSetCallMediaSpeaker
              ? () => {
                  void handleToggleNativeAudioRoute();
                }
              : undefined}
            onSwitchCamera={() => {
              void handleSwitchCallCamera();
            }}
            onOpenMediaSettings={() => {
              void openMediaSettings();
            }}
            onInstalledUiConnected={markInstalledUiConnected}
            onLiveKitVideoRendered={markParticipantVideoRendered}
            onLeave={() => {
              void handleJoinOrCloseCall();
            }}
            onCloseSurface={() => {
              setCallPanelOpen(false);
              setCallDeliveryStatus("Call is still connected. Tap Open Call to return.");
            }}
          />
        </View>
      ) : null}

      {incomingCallInvite
        && !callPanelOpen
        && !iosNativeCallPresentationOwned
        && !waitingForIosNativePresentation ? (
        <View
          style={[styles.incomingCallBannerOverlay, { top: Math.max(safeAreaInsets.top, 10) + 8 }]}
          pointerEvents="box-none"
          testID="chat-thread-incoming-call-banner"
          accessibilityLabel={`Incoming Chi'lly Chat ${incomingCallInvite.callType} call from ${otherMemberDisplayName}`}
        >
          <View style={styles.incomingCallBannerCard}>
            <Text style={styles.incomingKicker}>INCOMING {incomingCallInvite.callType.toUpperCase()} CALL</Text>
            <Text style={styles.incomingTitle}>{otherMemberDisplayName} is calling…</Text>
            <Text style={styles.incomingBody}>Answer or decline without leaving this thread.</Text>
            <View style={styles.incomingActionRow}>
              <TouchableOpacity
                style={[styles.incomingButton, styles.incomingDeclineButton]}
                activeOpacity={0.86}
                disabled={callBusy}
                onPress={() => {
                  void handleDeclineIncomingCall();
                }}
                testID="chat-thread-incoming-call-decline"
              >
                <Text style={styles.incomingButtonText}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.incomingButton, styles.incomingAcceptButton]}
                activeOpacity={0.86}
                disabled={callBusy}
                onPress={() => {
                  void handleAcceptIncomingCall();
                }}
                testID="chat-thread-incoming-call-answer"
              >
                <Text style={styles.incomingButtonText}>Answer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : null}

      <ReportSheet
        visible={reportVisible}
        title="Report conversation"
        description="Send a safety report for this chat conversation. Participants are not notified merely because a report was filed."
        busy={reportBusy}
        onSubmit={handleSubmitReport}
        onClose={() => setReportVisible(false)}
      />
      <ReportSheet
        visible={!!messageReportTarget}
        title="Report message"
        description="Send a safety report for this specific chat message. The sender is not notified merely because a report was filed."
        busy={messageReportBusy}
        onSubmit={handleSubmitMessageReport}
        onClose={() => setMessageReportTarget(null)}
      />
      <SocialAttachmentActionSheet
        visible={attachmentSheetVisible}
        kicker="CHI'LLY CHAT ATTACHMENT"
        title="Add to message"
        body="Photos and files stay private to this Chi'lly Chat thread."
        onSelect={handleSelectAttachment}
        onClose={() => setAttachmentSheetVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#060A12",
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 18,
    paddingBottom: 16,
    alignItems: "flex-start",
  },
  backText: {
    color: "#E2E9F7",
    fontSize: 14,
    fontWeight: "800",
  },
  headerAvatarButton: {
    borderRadius: 24,
  },
  headerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(243,75,116,0.2)",
    marginTop: 2,
  },
  headerAvatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginTop: 2,
  },
  headerAvatarText: {
    color: "#FFF5F8",
    fontSize: 18,
    fontWeight: "900",
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  kicker: {
    color: "#8894AB",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.15,
  },
  title: {
    color: "#F8FBFF",
    fontSize: 24,
    fontWeight: "900",
  },
  handleText: {
    color: "#9FB0CA",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "800",
  },
  body: {
    color: "#B9C5D9",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  headerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  headerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerPillDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#7AE2B7",
  },
  headerPillDotAlert: {
    backgroundColor: "#F34B74",
  },
  headerPillText: {
    color: "#E8F0FF",
    fontSize: 10,
    fontWeight: "900",
  },
  headerPillOfficial: {
    borderColor: "rgba(242,194,91,0.38)",
    backgroundColor: "rgba(242,194,91,0.12)",
  },
  headerPillTextOfficial: {
    color: "#FFE6A6",
  },
  headerMetaText: {
    color: "#92A0B8",
    fontSize: 11,
    fontWeight: "700",
  },
  headerHint: {
    color: "#90A0B9",
    fontSize: 11,
    fontWeight: "700",
  },
  headerQuickActionCard: {
    gap: 10,
    marginHorizontal: 18,
    marginBottom: 12,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(243,75,116,0.32)",
    backgroundColor: "rgba(243,75,116,0.12)",
    padding: 17,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  headerQuickActionKicker: {
    color: "#FFB8C8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  headerQuickActionTitle: {
    color: "#FFF5F8",
    fontSize: 17,
    fontWeight: "900",
  },
  headerQuickActionBody: {
    color: "#FFD8E2",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  headerQuickActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  headerQuickActionButton: {
    minWidth: 116,
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(6,10,18,0.35)",
    paddingVertical: 11,
    paddingHorizontal: 10,
  },
  headerQuickActionButtonText: {
    color: "#FFF4F8",
    fontSize: 12,
    fontWeight: "900",
  },
  headerQuickActionAccentButton: {
    backgroundColor: "#F34B74",
    borderColor: "rgba(243,75,116,0.7)",
  },
  headerQuickActionAccentButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  headerQuickActionReportButton: {
    borderColor: "rgba(220,20,60,0.28)",
    backgroundColor: "rgba(220,20,60,0.12)",
  },
  headerQuickActionReportButtonText: {
    color: "#FFD5DD",
    fontSize: 12,
    fontWeight: "900",
  },
  friendshipCard: {
    gap: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(6,10,18,0.28)",
    padding: 14,
  },
  friendshipHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  friendshipKicker: {
    color: "#9FB3D0",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  friendshipPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  friendshipPillText: {
    color: "#EFF4FF",
    fontSize: 10.5,
    fontWeight: "900",
  },
  friendshipTitle: {
    color: "#FFF5F8",
    fontSize: 15,
    fontWeight: "900",
  },
  friendshipBody: {
    color: "#D6DEEC",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  friendshipActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  friendshipActionButton: {
    minWidth: 118,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  friendshipActionButtonAccent: {
    borderColor: "rgba(243,75,116,0.7)",
    backgroundColor: "#F34B74",
  },
  friendshipActionButtonText: {
    color: "#EFF4FF",
    fontSize: 12,
    fontWeight: "900",
  },
  friendshipActionButtonAccentText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  callBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingVertical: 12,
    alignItems: "center",
  },
  joinBtn: {
    flex: 1.2,
    borderRadius: 14,
    backgroundColor: "#F34B74",
    paddingVertical: 12,
    alignItems: "center",
  },
  callBtnDisabled: {
    opacity: 0.5,
  },
  callBtnText: {
    color: "#EDF3FF",
    fontSize: 12,
    fontWeight: "900",
  },
  officialPresenceCard: {
    gap: 8,
    marginHorizontal: 18,
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(242,194,91,0.26)",
    backgroundColor: "rgba(96,72,20,0.18)",
    padding: 16,
  },
  officialPresenceKicker: {
    color: "#FFE6A6",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  officialPresenceTitle: {
    color: "#FFF6E0",
    fontSize: 16,
    fontWeight: "900",
  },
  officialPresenceBody: {
    color: "#EEDFB8",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  officialPresenceTopicRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  officialPresenceTopicPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(242,194,91,0.3)",
    backgroundColor: "rgba(32,24,10,0.28)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  officialPresenceTopicText: {
    color: "#FFE6A6",
    fontSize: 10.5,
    fontWeight: "900",
  },
  joinBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  callBanner: {
    marginHorizontal: 18,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(243,75,116,0.3)",
    backgroundColor: "rgba(243,75,116,0.1)",
    padding: 14,
    gap: 6,
  },
  callBannerTitle: {
    color: "#FFF4F8",
    fontSize: 15,
    fontWeight: "900",
  },
  callBannerBody: {
    color: "#FFD4DE",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  callDeliveryStatusCard: {
    marginHorizontal: 18,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(169,246,210,0.26)",
    backgroundColor: "rgba(35,122,88,0.16)",
    padding: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  callDeliveryStatusText: {
    flex: 1,
    color: "#DDFBEF",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "800",
  },
  callEventStack: {
    gap: 6,
    marginTop: 2,
    paddingTop: 4,
  },
  callEventSectionLabel: {
    alignSelf: "center",
    color: "#8897B0",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  callEventCard: {
    alignSelf: "center",
    maxWidth: "86%",
    minHeight: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.035)",
    paddingHorizontal: 9,
    paddingVertical: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  callEventIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(243,75,116,0.16)",
  },
  callEventCopy: {
    flex: 1,
    gap: 2,
  },
  callEventTitle: {
    color: "#E9EFFB",
    fontSize: 11,
    fontWeight: "900",
  },
  callEventMeta: {
    color: "#9CAAC0",
    fontSize: 9.5,
    fontWeight: "700",
  },
  callOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
  },
  incomingCallBannerOverlay: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 30,
  },
  incomingCallBannerCard: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(169,246,210,0.34)",
    backgroundColor: "rgba(7,16,20,0.98)",
    padding: 12,
    gap: 4,
    shadowColor: "#000",
    shadowOpacity: 0.26,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  incomingKicker: {
    color: "#A9F6D2",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.15,
  },
  incomingTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  incomingBody: {
    color: "#C9D4E8",
    fontSize: 12,
    fontWeight: "700",
  },
  incomingActionRow: {
    flexDirection: "row",
    gap: 8,
    width: "100%",
    marginTop: 8,
  },
  incomingButton: {
    flex: 1,
    minHeight: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  incomingDeclineButton: {
    backgroundColor: "#B91C1C",
  },
  incomingAcceptButton: {
    backgroundColor: "#16A34A",
  },
  incomingButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 18,
    paddingBottom: 16,
    gap: 11,
  },
  messageBubble: {
    maxWidth: "84%",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 4,
  },
  messageBubbleMe: {
    alignSelf: "flex-end",
    backgroundColor: "#F34B74",
  },
  messageBubbleThem: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  messageAuthor: {
    color: "#F4F8FF",
    fontSize: 11,
    fontWeight: "900",
  },
  messageAuthorMe: {
    color: "#FFF3F7",
  },
  messageBody: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  messageAttachmentStack: {
    gap: 7,
    marginTop: 3,
  },
  messageTime: {
    color: "#C7D1E3",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "right",
  },
  messageTimeMe: {
    color: "#FFE2EA",
  },
  messageReportButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 9,
    paddingVertical: 5,
    marginTop: 2,
  },
  messageReportButtonMe: {
    alignSelf: "flex-end",
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  messageReportButtonText: {
    color: "#C8D0E2",
    fontSize: 10,
    fontWeight: "900",
  },
  messageReportButtonTextMe: {
    color: "#FFF3F7",
  },
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 18,
    gap: 8,
    marginTop: 4,
  },
  emptyCardOfficial: {
    borderColor: "rgba(242,194,91,0.24)",
    backgroundColor: "rgba(96,72,20,0.18)",
  },
  emptyTitle: {
    color: "#F8FBFF",
    fontSize: 18,
    fontWeight: "900",
  },
  emptyBody: {
    color: "#B9C5D9",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  starterPromptRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 6,
  },
  starterPromptChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(242,194,91,0.34)",
    backgroundColor: "rgba(242,194,91,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  starterPromptChipText: {
    color: "#FFE6A6",
    fontSize: 11.5,
    fontWeight: "800",
  },
  composer: {
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 11,
    paddingBottom: Platform.OS === "ios" ? 28 : 20,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(6,10,18,0.96)",
  },
  composerKeyboardDocked: {
    // KeyboardAvoidingView already owns Android keyboard-height compensation.
    // Keep the composer in normal flow so the input stays visible above the keyboard.
    position: "relative",
  },
  composerAffordanceRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  composerAffordanceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  composerAffordanceText: {
    color: "#B9C5D9",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  composerAssistText: {
    color: "#8794AC",
    fontSize: 10.5,
    fontWeight: "700",
  },
  smartReplyCard: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(122,226,183,0.16)",
    backgroundColor: "rgba(122,226,183,0.08)",
    padding: 14,
  },
  smartReplyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  smartReplyKicker: {
    color: "#D8FFF0",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.05,
  },
  smartReplyMeta: {
    color: "#8FE0BE",
    fontSize: 10,
    fontWeight: "800",
  },
  smartReplyBody: {
    color: "#CDEBDF",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  smartReplyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  smartReplyChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(122,226,183,0.28)",
    backgroundColor: "rgba(6,10,18,0.3)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  smartReplyChipText: {
    color: "#E8FFF5",
    fontSize: 11.5,
    fontWeight: "800",
  },
  composerInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 9,
  },
  attachBtn: {
    width: 46,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    color: "#F7FBFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    fontWeight: "600",
  },
  sendBtn: {
    borderRadius: 14,
    backgroundColor: "#F34B74",
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  secondaryBtn: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  signInBtn: {
    backgroundColor: "#F34B74",
    borderColor: "rgba(243,75,116,0.7)",
  },
  secondaryBtnText: {
    color: "#EFF4FF",
    fontSize: 13,
    fontWeight: "800",
  },
  stateText: {
    color: "#CDD7EA",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    textAlign: "center",
  },
  centeredStateBody: {
    maxWidth: 320,
  },
  errorText: {
    color: "#FFB6C7",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
});
