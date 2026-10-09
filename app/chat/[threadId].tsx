import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  AppState,
  Keyboard,
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
import { ChillywoodBrandedSurface } from "../../components/ui/chillywood-branded-surface";
import { ChillywoodPrimaryActionFill } from "../../components/ui/chillywood-visual-system";

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
import {
  getChillyChatCallDeliveryMessage,
  isChillyChatCallDeviceAlertConfirmed,
} from "../../_lib/chillyChatCallDeliveryCopy";
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
  doesIosAcceptedCallKitMediaDescriptorOwnSession,
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
  ensureIosForegroundIncomingCallPresentation,
  hasIosNativeCallPresentation,
  isIosNativeCallsRuntimeEnabled,
  readIosNativeApplicationActiveSerial,
  reportIosNativeCallRemoteEnd,
  requestIosNativeCallAnswer,
  setIosNativeCallAudioRoute,
  setIosNativeCallMuted,
  subscribeToIosNativeCallEvents,
  subscribeToIosNativeCallPresentation,
} from "../../_lib/iosNativeCalls";
import {
  consumeMountedAndroidNativeCallRoute,
  consumeMountedForegroundAuthenticatedUiCallRoute,
  consumeMountedIosNativeCallRoute,
  resolveIosForegroundIncomingAnswerAuthority,
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
import { getUserFacingErrorMessage } from "../../_lib/userFacingErrors";
import { formatUsernameHandle } from "../../_lib/usernameHandles";
import {
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
const ACTIVE_CHAT_CALL_TERMINAL_RECONCILIATION_MS = 4_000;

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

function useExpiredIncomingCallPresentation(invite: ChillyChatCallInvite | null, threadId: string, currentUserId: string, sessionGeneration: string) {
  const [, refreshPresentation] = useState(0);
  const retained = useRef<{ invite: ChillyChatCallInvite; sessionGeneration: string } | null>(null);
  const candidate = invite ?? (retained.current?.sessionGeneration === sessionGeneration ? retained.current.invite : null);
  const presentationInvite = candidate?.status === "ringing"
    && candidate.threadId === threadId
    && candidate.calleeUserId === currentUserId
    && candidate.callerUserId !== currentUserId ? candidate : null;
  // A terminal refresh may omit ringing while its stale thread projection
  // remains. Remember only this account/session's exact presentation identity.
  useLayoutEffect(() => {
    retained.current = presentationInvite ? { invite: presentationInvite, sessionGeneration } : null;
  }, [presentationInvite, sessionGeneration]);
  const expiresAt = Date.parse(presentationInvite?.expiresAt ?? "");
  useEffect(() => {
    if (!presentationInvite || !Number.isFinite(expiresAt)) return;
    // A suspended JS deadline cannot refresh the foreground surface. Keep this
    // local presentation clock independent of the authoritative expiry RPCs.
    const refresh = () => refreshPresentation(revision => revision + 1);
    const remainingMs = expiresAt - Date.now();
    const timeout = remainingMs > 0 ? setTimeout(refresh, remainingMs) : null;
    const subscription = AppState.addEventListener("change", state => {
      if (state === "active") refresh();
    });
    return () => { if (timeout) clearTimeout(timeout); subscription.remove(); };
  }, [expiresAt, presentationInvite]);
  // Re-evaluate on every render too: a read started before expiry can settle
  // after it. This is presentation suppression, never a terminal transition.
  return Number.isFinite(expiresAt) && expiresAt <= Date.now() ? presentationInvite : null;
}

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

type IncomingCallAnswerOperation = { context: { key: string }; inviteId: string };

function useChatThreadOperationOwnership({
  currentUserId, threadId, sessionGeneration, isSignedIn, setCallBusy, visibleInviteId,
}: {
  currentUserId: string;
  threadId: string;
  sessionGeneration: string;
  isSignedIn: boolean;
  setCallBusy: React.Dispatch<React.SetStateAction<boolean>>;
  visibleInviteId: string;
}) {
  const contextKey = JSON.stringify([currentUserId, threadId, sessionGeneration, isSignedIn]);
  const contextRef = useRef<{ key: string } | null>(null);
  const operationRef = useRef<IncomingCallAnswerOperation | null>(null);
  const readRef = useRef<{ context: { key: string } } | null>(null);
  const visibleInviteRef = useRef(visibleInviteId);
  useLayoutEffect(() => {
    const context = { key: contextKey };
    contextRef.current = context;
    operationRef.current = null;
    readRef.current = null;
    setCallBusy(false);
    return () => {
      if (contextRef.current !== context) return;
      contextRef.current = null;
      operationRef.current = null;
      readRef.current = null;
    };
  }, [contextKey, setCallBusy]);
  useLayoutEffect(() => {
    visibleInviteRef.current = visibleInviteId;
    if (!visibleInviteId || !operationRef.current || operationRef.current.inviteId === visibleInviteId) return;
    operationRef.current = null;
    setCallBusy(false);
  }, [setCallBusy, visibleInviteId]);

  const captureCallOperation = useCallback(() => {
    const context = contextRef.current;
    const inviteId = visibleInviteRef.current;
    return () => !!context && context.key === contextKey
      && contextRef.current === context && visibleInviteRef.current === inviteId;
  }, [contextKey]);

  const beginAnswerOperation = useCallback((inviteId: string) => {
    const context = contextRef.current;
    if (!isSignedIn || !currentUserId || !threadId || !inviteId
      || !context || context.key !== contextKey || operationRef.current) return null;
    const operation = { context, inviteId };
    operationRef.current = operation;
    setCallBusy(true);
    return operation;
  }, [contextKey, currentUserId, isSignedIn, setCallBusy, threadId]);
  const isAnswerOperationCurrent = useCallback((operation: IncomingCallAnswerOperation) => (
    operationRef.current === operation && contextRef.current === operation.context
  ), []);
  const finishAnswerOperation = useCallback((operation: IncomingCallAnswerOperation) => {
    if (!isAnswerOperationCurrent(operation)) return;
    operationRef.current = null;
    setCallBusy(false);
  }, [isAnswerOperationCurrent, setCallBusy]);
  const beginThreadRead = useCallback(() => {
    const context = contextRef.current;
    if (!context || context.key !== contextKey) return null;
    const read = { context };
    readRef.current = read;
    return read;
  }, [contextKey]);
  const isThreadReadCurrent = useCallback((read: { context: { key: string } }) => (
    readRef.current === read && contextRef.current === read.context
  ), []);
  const invalidateThreadReads = useCallback(() => { readRef.current = null; }, []);
  return { beginAnswerOperation, isAnswerOperationCurrent, finishAnswerOperation, beginThreadRead, isThreadReadCurrent, invalidateThreadReads, captureCallOperation };
}

function useIosNativeMicrophoneAcknowledgements(contextKey: string, callUuid: string) {
  type Acknowledgement = { muted: boolean; expiresAt: number | null };
  const currentContext = useRef<object | null>(null);
  const pending = useRef<Acknowledgement[]>([]);
  const context = useMemo(() => ({ contextKey, callUuid }), [contextKey, callUuid]);
  useLayoutEffect(() => {
    currentContext.current = context;
    pending.current = [];
    return () => {
      if (currentContext.current === context) currentContext.current = null;
      pending.current = [];
    };
  }, [context]);
  const forgetNativeMicAck = useCallback((ack: Acknowledgement | null) => {
    pending.current = pending.current.filter((candidate) => candidate !== ack);
  }, []);
  const rememberNativeMicAck = useCallback((muted: boolean, awaitingMedia = false) => {
    if (!callUuid || currentContext.current !== context) return null;
    const now = Date.now();
    const ack = { muted, expiresAt: awaitingMedia ? null : now + 10_000 };
    pending.current = [...pending.current.filter((candidate) => (
      (candidate.expiresAt === null || candidate.expiresAt > now)
      // An old local Mute receipt cannot swallow a new privacy-preserving
      // system Mute once the user starts another Unmute attempt.
      && !(awaitingMedia && !muted && candidate.muted)
    )).slice(-7), ack];
    return ack;
  }, [callUuid, context]);
  const consumeNativeMicAck = useCallback((muted: boolean) => {
    if (currentContext.current !== context) return false;
    pending.current = pending.current.filter((candidate) => candidate.expiresAt === null || candidate.expiresAt > Date.now());
    const ack = pending.current.find((candidate) => candidate.muted === muted);
    if (!ack) {
      // A new opposite system intent retires the in-flight media reservation;
      // it must not suppress a later system reversal back to the original state.
      pending.current = pending.current.filter((candidate) => candidate.expiresAt !== null);
      return false;
    }
    // Equivalent OS feedback during a pending media command acknowledges that
    // command. Its owner removes the reservation when the media promise settles.
    if (ack.expiresAt !== null) forgetNativeMicAck(ack);
    return true;
  }, [context, forgetNativeMicAck]);
  const isNativeMicContextCurrent = useCallback(() => currentContext.current === context, [context]);
  return { rememberNativeMicAck, consumeNativeMicAck, forgetNativeMicAck, isNativeMicContextCurrent };
}

export default function ChillyChatThreadScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const router = useRouter();
  const { authority, session, user, isLoading: authLoading, isSignedIn } = useSession();
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
  const messageSendContext = useMemo(() => ({
    userId: currentUserId, threadId, sessionGeneration: authority?.sessionGeneration ?? "", isSignedIn,
  }), [authority?.sessionGeneration, currentUserId, isSignedIn, threadId]);
  const mountedMessageSendContextRef = useRef<typeof messageSendContext | null>(null);
  const messageSendOperationRef = useRef<{ context: typeof messageSendContext } | null>(null);
  useLayoutEffect(() => {
    mountedMessageSendContextRef.current = messageSendContext;
    messageSendOperationRef.current = null;
    setSending(false);
    setDraft("");
    setAttachmentFile(null);
    return () => {
      if (mountedMessageSendContextRef.current !== messageSendContext) return;
      mountedMessageSendContextRef.current = null;
      messageSendOperationRef.current = null;
    };
  }, [messageSendContext]);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [messageReportTarget, setMessageReportTarget] = useState<ChatMessage | null>(null);
  const [messageReportBusy, setMessageReportBusy] = useState(false);
  const [callPanelOpen, setCallPanelOpen] = useState(false);
  useEffect(() => {
    // Every call entry path shares this panel, including native Answer and reopening.
    // Release composer focus so the keyboard cannot cover the call controls.
    if (callPanelOpen) Keyboard.dismiss();
  }, [callPanelOpen]);
  const [nativeSpeakerEnabled, setNativeSpeakerEnabled] = useState(false);
  const [iosNativeAnswerRecoveryBlocked, setIosNativeAnswerRecoveryBlocked] = useState(false);
  const [nativeMediaActivationSerial, setNativeMediaActivationSerial] = useState(0);
  const [nativeApplicationActiveSerial, setNativeApplicationActiveSerial] = useState(0);
  const [nativeAudioSessionCallUuid, setNativeAudioSessionCallUuid] = useState("");
  const nativeAudioSessionCallUuidRef = useRef("");
  const [callEvents, setCallEvents] = useState<ChillyChatCallEvent[]>([]);
  const [incomingCallInvite, setIncomingCallInvite] = useState<ChillyChatCallInvite | null>(null);
  const [outgoingCallInvite, setOutgoingCallInvite] = useState<ChillyChatCallInvite | null>(null);
  const [outgoingCallDeviceAlertSent, setOutgoingCallDeviceAlertSent] = useState(false);
  const [activeCallInvite, setActiveCallInvite] = useState<ChillyChatCallInvite | null>(null);
  const expiredIncomingCallPresentation = useExpiredIncomingCallPresentation(incomingCallInvite, threadId, currentUserId, authority?.sessionGeneration ?? "");
  const incomingCallPresentationExpired = !!incomingCallInvite && expiredIncomingCallPresentation?.id === incomingCallInvite.id;
  const { rememberNativeMicAck, consumeNativeMicAck, forgetNativeMicAck, isNativeMicContextCurrent } = useIosNativeMicrophoneAcknowledgements(
    JSON.stringify([currentUserId, threadId, authority?.sessionGeneration ?? "", isSignedIn, activeCallInvite?.id ?? "", activeCallInvite?.communicationRoomId ?? ""]), requestedNativeCallUuid,
  );
  const { beginAnswerOperation, isAnswerOperationCurrent, finishAnswerOperation, beginThreadRead, isThreadReadCurrent, invalidateThreadReads, captureCallOperation } = useChatThreadOperationOwnership({
    currentUserId, threadId, sessionGeneration: authority?.sessionGeneration ?? "", isSignedIn, setCallBusy,
    visibleInviteId: incomingCallInvite?.id ?? activeCallInvite?.id ?? outgoingCallInvite?.id ?? "",
  });
  const [callDeliveryStatus, setCallDeliveryStatus] = useState<string | null>(null);
  const [callControlError, setCallControlError] = useState<string | null>(null);
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
  const acceptedIosNativeMediaSettlementInFlightRef = useRef<(() => boolean) | null>(null);
  const nativeAudioReadinessDeadlineRef = useRef<{
    descriptor: NonNullable<ReturnType<typeof createIosAcceptedCallKitMediaDescriptor>>;
    deadlineMs: number;
  } | null>(null);
  const handledActiveTerminalInviteIdsRef = useRef<Set<string>>(new Set());
  const lastReadReceiptWriteAtRef = useRef(0);
  const incomingCallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const incomingCallSoundRef = useRef<ChillyChatPlayingSound | null>(null);
  const handledIncomingInviteIdsRef = useRef<Set<string>>(new Set());
  const handledIncomingRoomIdsRef = useRef<Set<string>>(new Set());
  const outgoingCallTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outgoingRingbackSoundRef = useRef<ChillyChatPlayingSound | null>(null);
  const releaseTrustedNativeCallSession = useCallback((expectedInviteId: string) => {
    if (
      !trustedNativeCallClaim
      || trustedNativeCallClaim.inviteId !== expectedInviteId
    ) return false;
    acceptedIosNativeMediaDescriptorRef.current = null;
    activeNativeCallActionRequestKeyRef.current = "";
    nativeCallActionHandledRef.current = "";
    setTrustedNativeCallClaim(null);
    setTrustedNativeCallClaimAccountId("");
    setIosNativeAnswerRecoveryBlocked(false);
    nativeAudioSessionCallUuidRef.current = "";
    setNativeAudioSessionCallUuid("");
    setNativeApplicationActiveSerial(0);
    setNativeMediaActivationSerial(0);
    return true;
  }, [trustedNativeCallClaim]);

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

  // Retain the raw invite/thread for exact backend reconciliation, while the
  // expired ringing room cannot keep the header live or disable new-call UI.
  const presentedThread = thread && expiredIncomingCallPresentation
    && expiredIncomingCallPresentation.communicationRoomId === thread.activeCommunicationRoomId
    && !activeCallInvite && !outgoingCallInvite
      ? { ...thread, activeCommunicationRoomId: undefined, activeCallType: undefined }
      : thread;
  // Keep only the owned terminal call's identity until cleanup succeeds. It
  // cannot activate media, but End must still target it after server projection clears.
  const activeCallRoomId = activeCallInvite && TERMINAL_CHAT_CALL_INVITE_STATUSES.has(activeCallInvite.status)
    ? activeCallInvite.communicationRoomId ?? ""
    : resolveAcceptedChatCallRoomId({
    inviteRoomId: activeCallInvite?.communicationRoomId,
    inviteStatus: activeCallInvite?.status,
    threadRoomId: presentedThread?.activeCommunicationRoomId,
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
    fromCurrentRead = false,
  ) => {
    const roomId = String(invite?.communicationRoomId ?? "").trim();
    const valid =
      invite?.status === "accepted"
      && !!roomId
      && invite.threadId === threadId
      && invite.calleeUserId === currentUserId
      && invite.callerUserId !== currentUserId;
    if (!valid) return false;
    if (!fromCurrentRead) invalidateThreadReads();

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
  }, [currentUserId, invalidateThreadReads, rememberHandledIncomingInvite, threadId]);

  const terminalIosNativeAnswerOperations = useMemo(() => ({
      delay: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)), endNative: endIosNativeCall,
      readInvite: readChillyChatCallInvite,
      updateInvite: (latest: ChillyChatCallInvite) => updateChillyChatCallInviteStatus({actorUserId: currentUserId!, invite: latest, status: "ended"}),
  }), [currentUserId]);
  const terminateAcceptedIosNativeAnswer = useCallback((invite: ChillyChatCallInvite, reason: string, descriptor: ReturnType<typeof createIosAcceptedCallKitMediaDescriptor>) => terminateIosAcceptedNativeAnswer({authenticatedUserId: currentUserId, callUuid: requestedNativeCallUuid, descriptor, invite, reason, threadId, trustedNativeClaim: trustedNativeCallClaim}, terminalIosNativeAnswerOperations), [currentUserId, requestedNativeCallUuid, terminalIosNativeAnswerOperations, threadId, trustedNativeCallClaim]);

  const completeTrustedIosNativeAnswer = useCallback(async (invite: ChillyChatCallInvite, isCurrent: () => boolean = () => true) => {
    if (!isCurrent()) return false;
    if (!requestedNativeCallUuid || requestedNativeCallAction !== "answer") { setIosNativeAnswerRecoveryBlocked(false); return true; }
    const result = await completeIosAcceptedNativeAnswer({authenticatedUserId: currentUserId, callUuid: requestedNativeCallUuid, invite, serverAccepted: true, threadId, trustedNativeClaim: trustedNativeCallClaim}, {completeNative: completeIosNativeCallAnswer, monotonicNow: () => globalThis.performance?.now?.(), terminal: terminalIosNativeAnswerOperations});
    if (!isCurrent()) return false;
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

  const reconcileEndedCallState = useCallback(async (nextThread: ChatThreadSummary | null, isCurrent: () => boolean) => {
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
    if (!isCurrent()) return nextThread;
    if (snapshot?.room.status === "active") {
      logChatCall("reconcile_keep_active", {
        threadId: nextThread.threadId,
        roomId: nextThread.activeCommunicationRoomId,
        roomStatus: snapshot.room.status,
      });
      return nextThread;
    }
    const ownedInvite = activeCallInviteRef.current;
    if (ownedInvite?.threadId === nextThread.threadId
      && ownedInvite.communicationRoomId === nextThread.activeCommunicationRoomId) {
      // The mounted media owner must complete cleanup before its retry surface closes.
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
    if (!isCurrent()) return nextThread;
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
    const read = beginThreadRead();
    if (!read) return;
    const isCurrent = () => isThreadReadCurrent(read);
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
      if (!isCurrent()) return;
      const nextThread = await reconcileEndedCallState(loadedThread, isCurrent);
      if (!isCurrent()) return;
      const acceptedActiveInvite = nextThread?.activeCommunicationRoomId
        ? await readLatestChillyChatCallInviteForRoom(
          nextThread.activeCommunicationRoomId,
        ).catch(() => null)
        : null;
      if (!isCurrent()) return;
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
      const cleanupPending = !!activeCallInviteRef.current
        && TERMINAL_CHAT_CALL_INVITE_STATUSES.has(activeCallInviteRef.current.status);
      if (resumableAcceptedInvite && !cleanupPending) {
        applyAcceptedIncomingInviteState(resumableAcceptedInvite, true);
      }
      if (!cleanupPending) setError(null);
      setLoading(false);
      if (!visibleThread.activeCommunicationRoomId && !cleanupPending) {
        setCallDeliveryStatus(null);
      }
      logChatThread("load_state_success", {
        threadId,
        messageCount: nextMessages.length,
        activeCommunicationRoomId: visibleThread.activeCommunicationRoomId ?? "",
        activeCallType: visibleThread.activeCallType ?? "",
      });

      await markThreadReadWithThrottle();
      if (!isCurrent()) return;

      if (cleanupPending) {
        setCallPanelOpen(true);
      } else if (visibleIncomingInvite && !resumableAcceptedInvite) {
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
      if (!isCurrent()) return;
      logChatThread("load_state_failed", {
        threadId,
        message: loadError?.message ?? "unknown_error",
      });
      setError(getUserFacingErrorMessage(loadError, "Unable to load this Chi'lly Chat thread."));
      setLoading(false);
    }
  }, [applyAcceptedIncomingInviteState, beginThreadRead, currentUserId, isSignedIn, isThreadReadCurrent, markThreadReadWithThrottle, reconcileEndedCallState, stopOutgoingRingback, threadId]);

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

  // The server clears the thread projection when the invite becomes terminal.
  // Keep the exact call's media kind while its local cleanup/retry panel remains.
  const resolvedCallType = activeCallInvite?.communicationRoomId === activeCallRoomId
    ? activeCallInvite.callType
    : thread?.activeCallType;
  const initialCallMediaPreferences = useMemo(() => {
    if (resolvedCallType === "voice") {
      return {
        cameraEnabled: false,
        micEnabled: true,
      };
    }

    if (resolvedCallType === "video") {
      return {
        cameraEnabled: true,
        micEnabled: true,
      };
    }

    return undefined;
  }, [resolvedCallType]);
  // The consumed navigation claim expires after handoff. Once CallKit Answer
  // has an exact accepted descriptor, its audio prerequisite belongs to that
  // session and must not disappear when the navigation claim ages out.
  const acceptedNativeAudioDescriptor = acceptedIosNativeMediaDescriptorRef.current;
  const acceptedNativeAudioCallUuid = Platform.OS === "ios" && isSignedIn
    && doesIosAcceptedCallKitMediaDescriptorOwnSession({
      authenticatedUserId: currentUserId,
      descriptor: acceptedNativeAudioDescriptor,
      inviteId: activeCallInvite?.id,
      inviteStatus: activeCallInvite?.status,
      mediaProvider: activeCallInvite?.mediaProvider,
      roomId: activeCallRoomId,
      threadId,
    }) ? acceptedNativeAudioDescriptor?.callUuid ?? "" : "";
  const activeIosNativeAudioCallUuid = acceptedNativeAudioCallUuid || (
    Platform.OS === "ios" && requestedNativeCallAction === "answer"
    && requestedNativeCallOwnsTransition ? requestedNativeCallUuid : ""
  );
  const waitingForIosNativeAudioSession = !!activeIosNativeAudioCallUuid
    && nativeAudioSessionCallUuid !== activeIosNativeAudioCallUuid;

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
    consumeAutomaticMicrophoneFeedback,
    switchCamera,
    mediaPermissionMessage,
    mediaControlError,
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
      && requestedNativeCallOwnsTransition
      && !!requestedNativeCallUuid,
    mediaActivationSerial: nativeMediaActivationSerial,
    iosAcceptedCallKitMediaDescriptor: acceptedIosNativeMediaDescriptorRef.current,
    nativeForegroundActivationInviteId:
      requestedNativeCallAction === "answer" && requestedNativeCallOwnsTransition
        ? requestedCallInviteId
        : "",
    nativeForegroundActivationSerial:
      requestedNativeCallAction === "answer" && requestedNativeCallOwnsTransition
        ? nativeApplicationActiveSerial
        : 0,
    initialMediaPreferences: initialCallMediaPreferences,
    onRoomEnded: async (reason): Promise<void> => {
      const activeInvite = activeCallInviteRef.current;
      const ownsEndedCall = () => isNativeMicContextCurrent()
        && !!activeInvite
        && activeInvite.id === activeCallInvite?.id
        && activeCallInviteRef.current?.id === activeInvite.id
        && activeCallInviteRef.current?.communicationRoomId === activeInvite.communicationRoomId;
      if (!ownsEndedCall()) return;
      trackEvent("chat_call_ended", {
        surface: "chat-thread",
        threadId,
        reason,
      });
      let terminalInvite = activeInvite;
      if (activeInvite?.status === "accepted" && currentUserId) {
        terminalInvite = await updateChillyChatCallInviteStatus({
          actorUserId: currentUserId,
          invite: activeInvite,
          status: "ended",
        }).catch(() => null);
      }
      if (!ownsEndedCall()) return;
      if (!terminalInvite || !TERMINAL_CHAT_CALL_INVITE_STATUSES.has(terminalInvite.status)) {
        // Stop owned capture even if durable terminal confirmation is unavailable.
        // Keep End available; this is not proof that the whole call has ended.
        await leaveRoom({ endRoomIfHost: false }).catch(() => undefined);
        if (!ownsEndedCall()) return;
        const message = "Unable to confirm the call ended. Use End Call to retry cleanup safely.";
        setError(message);
        setCallControlError(message);
        setCallPanelOpen(true);
        return;
      }
      if (!await finishTerminalInviteCleanup(terminalInvite, ownsEndedCall, `room_${reason}`)) return;
      void loadThreadState();
    },
  });

  const finishTerminalInviteCleanup = useCallback(async (
    invite: ChillyChatCallInvite,
    ownsContext: () => boolean,
    remoteReason?: string,
  ): Promise<boolean> => {
    const isCurrent = () => ownsContext()
      && invite.threadId === threadId
      && invite.communicationRoomId === activeCallRoomId
      && (invite.callerUserId === currentUserId || invite.calleeUserId === currentUserId)
      && (!activeCallInviteRef.current || activeCallInviteRef.current.id === invite.id);
    if (!isCurrent() || !TERMINAL_CHAT_CALL_INVITE_STATUSES.has(invite.status)) return false;
    stopOutgoingRingback();
    try {
      // Capture the exact session's cleanup before disabling media for the
      // terminal invite. A failed leave must retain its resources for Retry End.
      // The authoritative terminal invite transition already closes the room
      // for both participants. Repeating a host mutation after that transition
      // can lose its active-room authority before the exact self-leave receipt.
      const cleanup = leaveRoom({ endRoomIfHost: false });
      activeCallInviteRef.current = invite;
      setActiveCallInvite(invite);
      setOutgoingCallInvite(null);
      await cleanup;
      if (!isCurrent()) return false;
      if (remoteReason && requestedNativeCallUuid) {
        const nativeEnded = await reportIosNativeCallRemoteEnd(requestedNativeCallUuid, remoteReason).catch(() => false);
        if (!isCurrent()) return false;
        if (!nativeEnded) throw new Error("native_call_cleanup_pending");
      }
      await clearEndedChatThreadCall(threadId, invite.communicationRoomId, authority ?? undefined);
      if (!isCurrent()) return false;
      handledActiveTerminalInviteIdsRef.current.add(invite.id);
      activeCallInviteRef.current = null;
      setActiveCallInvite(null);
      setIncomingCallInvite(null);
      setCallPanelOpen(false);
      releaseTrustedNativeCallSession(invite.id);
      setError(null);
      return true;
    } catch (cleanupError) {
      if (!isCurrent()) return false;
      handledActiveTerminalInviteIdsRef.current.delete(invite.id);
      setCallPanelOpen(true);
      const message = "The call ended, but cleanup is not complete. Use End Call to retry safely.";
      setError(message);
      setCallControlError(message);
      setCallDeliveryStatus(message);
      reportRuntimeError("chat-call-terminal-cleanup", cleanupError, { threadId });
      return false;
    }
  }, [activeCallRoomId, authority, currentUserId, leaveRoom, releaseTrustedNativeCallSession, requestedNativeCallUuid, stopOutgoingRingback, threadId]);

  useEffect(() => {
    const descriptor = acceptedIosNativeMediaDescriptorRef.current;
    if (!descriptor || !acceptedNativeAudioCallUuid || !waitingForIosNativeAudioSession) {
      nativeAudioReadinessDeadlineRef.current = null;
      return;
    }
    if (iosNativeAnswerRecoveryBlocked) return;
    // Bound the accepted native handoff, not server acceptance or the route
    // claim. Suspended JavaScript may deliver this timer later; it never grants
    // audio authority, and incidental renders must not restart its deadline.
    const nowMs = globalThis.performance?.now?.() ?? Date.now();
    if (nativeAudioReadinessDeadlineRef.current?.descriptor !== descriptor) {
      nativeAudioReadinessDeadlineRef.current = { descriptor, deadlineMs: nowMs + 15_000 };
    }
    const deadline = nativeAudioReadinessDeadlineRef.current;
    const ownsOperation = captureCallOperation();
    const isCurrent = () => ownsOperation()
      && acceptedIosNativeMediaDescriptorRef.current === descriptor
      && exactIosAcceptedMediaInvite(activeCallInviteRef.current, descriptor);
    let canceled = false;
    const timer = setTimeout(() => {
      if (canceled || !isCurrent() || nativeAudioSessionCallUuidRef.current === descriptor.callUuid) return;
      setIosNativeAnswerRecoveryBlocked(true);
      setCallPanelOpen(true);
      const message = "Call audio did not become ready. Ending this call safely. You can use End Call to retry cleanup.";
      setError(message);
      setCallControlError(message);
      setCallDeliveryStatus(message);
      void (async () => {
        const invite = activeCallInviteRef.current;
        if (!invite || !isCurrent()) return;
        // Recheck ownership at every asynchronous boundary: a queued timeout
        // must never end a replacement call or act for a replaced account.
        const settled = await terminateIosAcceptedNativeAnswer({
          authenticatedUserId: currentUserId, callUuid: descriptor.callUuid,
          descriptor, invite, reason: "native_audio_activation_timeout",
          threadId, trustedNativeClaim: trustedNativeCallClaim,
        }, {
          delay: (ms: number) => isCurrent() ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve(),
          endNative: (uuid: string, reason: string) => isCurrent() ? endIosNativeCall(uuid, reason) : false,
          readInvite: (inviteId: string) => isCurrent() ? readChillyChatCallInvite(inviteId) : null,
          updateInvite: (latest: ChillyChatCallInvite) => isCurrent()
            ? updateChillyChatCallInviteStatus({ actorUserId: currentUserId!, invite: latest, status: "ended" }) : null,
        });
        if (!isCurrent()) return;
        const terminal = settled ? await readChillyChatCallInvite(descriptor.inviteId).catch(() => null) : null;
        if (!isCurrent()) return;
        if (!settled || !exactIosAcceptedMediaInvite(terminal, descriptor)
          || !TERMINAL_CHAT_CALL_INVITE_STATUSES.has(terminal?.status ?? "")) {
          const message = "Call audio did not become ready, and cleanup could not finish. Use End Call to retry safely.";
          setError(message);
          setCallControlError(message);
          setCallDeliveryStatus(message);
          return;
        }
        if (await finishTerminalInviteCleanup(terminal!, isCurrent)) void loadThreadState();
      })();
    }, Math.max(0, deadline.deadlineMs - nowMs));
    return () => { canceled = true; clearTimeout(timer); };
  }, [acceptedNativeAudioCallUuid, captureCallOperation, currentUserId, finishTerminalInviteCleanup,
    iosNativeAnswerRecoveryBlocked, loadThreadState, threadId, trustedNativeCallClaim, waitingForIosNativeAudioSession]);

  useEffect(() => {
    const candidate = acceptedIosNativeMediaDescriptorRef.current;
    const isCurrent = captureCallOperation();
    const failure = {
      authenticatedUserId: candidate?.authenticatedUserId, callUuid: candidate?.callUuid,
      channelState: callChannelState, descriptor: candidate,
      inviteId: candidate?.inviteId, inviteStatus: activeCallInvite?.status,
      mediaProvider: candidate?.mediaProvider, platform: Platform.OS,
      roomId: candidate?.roomId, threadId: candidate?.threadId,
    };
    if (acceptedIosNativeMediaSettlementInFlightRef.current?.()) return;
    acceptedIosNativeMediaSettlementInFlightRef.current = isCurrent;
    void (async () => {
      const operations = {
        terminateAccepted: async (descriptor: NonNullable<typeof candidate>, reason: string) => {
          if (!isCurrent()) return false;
          const accepted = await readChillyChatCallInvite(descriptor.inviteId).catch(() => null);
          if (!isCurrent()) return false;
          return exactIosAcceptedMediaInvite(accepted, descriptor) && (accepted?.status === "accepted" || TERMINAL_CHAT_CALL_INVITE_STATUSES.has(accepted?.status ?? "")) ? terminateAcceptedIosNativeAnswer(accepted!, reason, descriptor) : false;
        },
        leaveRoom: (descriptor: NonNullable<typeof candidate>) => isCurrent() && descriptor.roomId === activeCallRoomId && descriptor.mediaProvider === callMediaProvider && exactIosAcceptedMediaInvite(activeCallInviteRef.current, descriptor) ? leaveRoom({endRoomIfHost: false}).then(() => isCurrent()) : false,
        clearLocal: async (descriptor: NonNullable<typeof candidate>) => {
          if (!isCurrent() || acceptedIosNativeMediaDescriptorRef.current !== descriptor || !exactIosAcceptedMediaInvite(activeCallInviteRef.current, descriptor)) return false;
          await clearEndedChatThreadCall(descriptor.threadId, descriptor.roomId, authority ?? undefined).catch(() => null);
          if (!isCurrent() || acceptedIosNativeMediaDescriptorRef.current !== descriptor || !exactIosAcceptedMediaInvite(activeCallInviteRef.current, descriptor)) return false;
          acceptedIosNativeMediaDescriptorRef.current = null; handledActiveTerminalInviteIdsRef.current.add(descriptor.inviteId);
          setIosNativeAnswerRecoveryBlocked(false);
          activeCallInviteRef.current = null; setActiveCallInvite(null); setCallPanelOpen(false);
          setCallDeliveryStatus("Media could not connect. The accepted call was ended safely."); await loadThreadState().catch(() => null); return true;
        },
      };
      let result = await settleIosAcceptedCallKitMediaFailure(failure, operations);
      for (let attempt = 0; attempt < 2 && isCurrent() && result.status === "settled_cleanup_pending"; attempt += 1) result = await settleIosAcceptedCallKitMediaFailure(failure, operations);
      if (!isCurrent()) return;
      if (result.status === "retryable") setError("Media failed, but the accepted call could not be ended. Use End Call to retry safely.");
      if (result.status === "settled_cleanup_pending") setError("The call ended, but local cleanup needs a refresh.");
    })().finally(() => {
      if (acceptedIosNativeMediaSettlementInFlightRef.current === isCurrent) {
        acceptedIosNativeMediaSettlementInFlightRef.current = null;
      }
    });
  }, [activeCallInvite?.id, activeCallInvite?.status, activeCallRoomId, authority, callChannelState, callMediaProvider, captureCallOperation, currentUserId, leaveRoom, loadThreadState, requestedNativeCallUuid, terminateAcceptedIosNativeAnswer, threadId]);

  useEffect(() => {
    setCallControlError(null);
  }, [activeCallInvite?.id, activeCallRoomId]);

  const microphoneControlOperationRef = useRef<(() => boolean) | null>(null);
  const handleToggleCallMic = useCallback(async () => {
    if (!isNativeMicContextCurrent()) return;
    if (microphoneControlOperationRef.current?.()) return;
    const ownsOperation = isNativeMicContextCurrent;
    microphoneControlOperationRef.current = ownsOperation;
    const nextEnabled = !micEnabled;
    // Changing the WebRTC track can itself trigger CallKit's bottom-up mute
    // event before the durable media commit returns. Reserve that feedback now
    // so it cannot supersede and roll back this same microphone intent.
    const mediaAcknowledgement = requestedNativeCallUuid
      ? rememberNativeMicAck(!nextEnabled, true) : null;
    try {
      const updated = await setMicrophoneEnabled(nextEnabled);
      forgetNativeMicAck(mediaAcknowledgement);
      if (!isNativeMicContextCurrent()) return;
      if (!updated) {
        const message = canOpenMediaSettings
          ? "Microphone permission is unavailable. The call remains connected."
          : "Microphone state could not be synchronized. The call remains connected.";
        setError(message);
        setCallControlError(message);
        return;
      }
      setError(null);
      setCallControlError(null);
      if (requestedNativeCallUuid) {
        // The media command already succeeded. CallKit echoes this local
        // request through its delegate; that acknowledgment must not perform
        // another capture/peer/membership mutation. Unmatched native controls
        // still run the normal media command, including ended-track recovery.
        const acknowledgement = rememberNativeMicAck(!nextEnabled);
        if (!acknowledgement) return;
        const nativeControlUpdated = await setIosNativeCallMuted(requestedNativeCallUuid, !nextEnabled);
        if (!isNativeMicContextCurrent()) return;
        if (!nativeControlUpdated) {
          forgetNativeMicAck(acknowledgement);
          const message = "Microphone changed, but the native call control could not be synchronized.";
          setError(message);
          setCallControlError(message);
          reportRuntimeError("chat-call-toggle-native-microphone", new Error("native_microphone_control_sync_failed"), {
            threadId,
          });
        }
      }
    } catch (mediaError) {
      if (!isNativeMicContextCurrent()) return;
      const message = "The microphone could not be changed. The call remains connected.";
      setError(message);
      setCallControlError(message);
      reportRuntimeError("chat-call-toggle-microphone", mediaError, { threadId });
    } finally {
      forgetNativeMicAck(mediaAcknowledgement);
      if (microphoneControlOperationRef.current === ownsOperation) microphoneControlOperationRef.current = null;
    }
  }, [canOpenMediaSettings, forgetNativeMicAck, isNativeMicContextCurrent, micEnabled, rememberNativeMicAck, requestedNativeCallUuid, setMicrophoneEnabled, threadId]);

  const handleToggleCallCamera = useCallback(async () => {
    if (!isNativeMicContextCurrent()) return;
    try {
      const updated = await toggleCamera();
      if (!isNativeMicContextCurrent()) return;
      if (updated === false) {
        const message = "Camera state could not be synchronized. The call remains connected.";
        setError(message);
        setCallControlError(message);
        return;
      }
      setError(null);
      setCallControlError(null);
    } catch (mediaError) {
      if (!isNativeMicContextCurrent()) return;
      const message = "The camera could not be changed. The call remains connected.";
      setError(message);
      setCallControlError(message);
      reportRuntimeError("chat-call-toggle-camera", mediaError, { threadId });
    }
  }, [isNativeMicContextCurrent, threadId, toggleCamera]);

  const handleSwitchCallCamera = useCallback(async () => {
    if (!isNativeMicContextCurrent()) return;
    try {
      const updated = await switchCamera();
      if (!isNativeMicContextCurrent()) return;
      if (!updated) {
        const message = "The camera could not be flipped on this device. The call remains connected.";
        setError(message);
        setCallControlError(message);
        return;
      }
      setError(null);
      setCallControlError(null);
    } catch (mediaError) {
      if (!isNativeMicContextCurrent()) return;
      const message = "The camera could not be flipped on this device. The call remains connected.";
      setError(message);
      setCallControlError(message);
      reportRuntimeError("chat-call-switch-camera", mediaError, { threadId });
    }
  }, [isNativeMicContextCurrent, switchCamera, threadId]);

  const nativeAudioRouteQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const nativeAudioRouteIntentRef = useRef<{
    isCurrent: () => boolean; speaker: boolean; manual: boolean;
  } | null>(null);
  const applyCallAudioRoute = useCallback((speaker: boolean, automatic = false) => {
    if (!isNativeMicContextCurrent()) return Promise.resolve();
    const previous = nativeAudioRouteIntentRef.current;
    const retainedManual = automatic && previous?.isCurrent() && previous.manual;
    const intent = {
      isCurrent: isNativeMicContextCurrent,
      speaker: retainedManual ? (previous?.speaker ?? speaker) : speaker,
      manual: !automatic || !!retainedManual,
    };
    nativeAudioRouteIntentRef.current = intent;
    const ownsRoute = () => intent.isCurrent() && nativeAudioRouteIntentRef.current === intent;
    // Native routing is process-wide. Serialize issued commands so a late old
    // command cannot remain the final route after the current call's choice.
    const operation = nativeAudioRouteQueueRef.current.catch(() => undefined).then(async () => {
      if (!ownsRoute()) return;
      try {
        const liveKitUpdated = callMediaProvider === "livekit"
          ? await setCallMediaSpeaker(intent.speaker)
          : false;
        if (!ownsRoute()) return;
        const nativeUpdated = Platform.OS === "ios"
          ? await setIosNativeCallAudioRoute(intent.speaker ? "speaker" : "receiver")
          : false;
        if (!ownsRoute()) return;
        if (liveKitUpdated || nativeUpdated) {
          setNativeSpeakerEnabled(intent.speaker);
          setError(null);
          setCallControlError(null);
          return;
        }
        nativeAudioRouteIntentRef.current = previous?.isCurrent() ? previous : null;
        if (automatic) return;
        const message = "The audio output could not be changed. The call remains connected.";
        setError(message);
        setCallControlError(message);
      } catch (routeError) {
        if (!ownsRoute()) return;
        nativeAudioRouteIntentRef.current = previous?.isCurrent() ? previous : null;
        const message = "The audio output could not be changed. The call remains connected.";
        setError(message);
        setCallControlError(message);
        reportRuntimeError("chat-call-audio-route", routeError, { threadId });
      }
    });
    nativeAudioRouteQueueRef.current = operation;
    return operation;
  }, [callMediaProvider, isNativeMicContextCurrent, setCallMediaSpeaker, threadId]);

  const handleToggleNativeAudioRoute = useCallback(() => {
    const previous = nativeAudioRouteIntentRef.current;
    const currentSpeaker = previous?.isCurrent() ? previous.speaker : nativeSpeakerEnabled;
    return applyCallAudioRoute(!currentSpeaker);
  }, [applyCallAudioRoute, nativeSpeakerEnabled]);

  useEffect(() => {
    if (
      !activeCallRoomId
      || activeCallInvite?.status !== "accepted"
      || callChannelState !== "live"
    ) return;
    const route = resolveIosChatCallAudioRoute(resolvedCallType);
    const shouldUseSpeaker = route === "speaker";
    void applyCallAudioRoute(shouldUseSpeaker, true);
  }, [activeCallInvite?.status, activeCallRoomId, applyCallAudioRoute, callChannelState, nativeMediaActivationSerial, resolvedCallType]);

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
    const ownsContext = captureCallOperation();
    const isCurrent = () => soundActive && ownsContext();
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
    const timeoutMs = Number.isFinite(expiresAt) ? Math.max(0, expiresAt - Date.now()) : 0;
    const exactOutgoingInvite = (invite: ChillyChatCallInvite | null) => !!invite
      && invite.id === outgoingCallInvite.id
      && invite.threadId === outgoingCallInvite.threadId
      && invite.communicationRoomId === outgoingCallInvite.communicationRoomId
      && invite.callerUserId === currentUserId
      && invite.calleeUserId === outgoingCallInvite.calleeUserId;
    const scheduleReconciliation = (delayMs: number) => {
      if (!isCurrent()) return;
      outgoingCallTimeoutRef.current = setTimeout(async () => {
        const latestInvite = await readChillyChatCallInvite(outgoingCallInvite.id).catch(() => null);
        if (!isCurrent()) return;
        if (!latestInvite || !exactOutgoingInvite(latestInvite)) {
          scheduleReconciliation(ACTIVE_CHAT_CALL_TERMINAL_RECONCILIATION_MS);
          return;
        }
        if (latestInvite.status === "accepted") {
          activeCallInviteRef.current = latestInvite;
          setActiveCallInvite(latestInvite);
          setOutgoingCallInvite(null);
          stopOutgoingRingback();
          setCallDeliveryStatus("Receiver joined the call.");
          return;
        }
        if (TERMINAL_CHAT_CALL_INVITE_STATUSES.has(latestInvite.status)) {
          const completed = await finishTerminalInviteCleanup(latestInvite, ownsContext);
          if (!completed) return;
          setCallDeliveryStatus("The call is no longer ringing. Active call state was cleared.");
          await loadThreadState();
          return;
        }
        const latestExpiresAt = Date.parse(latestInvite.expiresAt);
        if (latestInvite.status !== "ringing" || (Number.isFinite(latestExpiresAt) && latestExpiresAt > Date.now())) {
          scheduleReconciliation(latestInvite.status === "ringing" ? latestExpiresAt - Date.now() : ACTIVE_CHAT_CALL_TERMINAL_RECONCILIATION_MS);
          return;
        }
        const missedInvite = await updateChillyChatCallInviteStatus({
          actorUserId: currentUserId,
          invite: latestInvite,
          status: "missed",
        }).catch(() => null);
        if (!isCurrent()) return;
        if (!missedInvite || missedInvite.status !== "missed" || !exactOutgoingInvite(missedInvite)) {
          scheduleReconciliation(ACTIVE_CHAT_CALL_TERMINAL_RECONCILIATION_MS);
          return;
        }
        const completed = await finishTerminalInviteCleanup(missedInvite, ownsContext);
        if (!completed) return;
        setCallDeliveryStatus("No answer. The call expired and active call state was cleared.");
        await loadThreadState();
      }, delayMs);
    };
    scheduleReconciliation(timeoutMs);

    return () => {
      soundActive = false;
      stopOutgoingRingback();
    };
  }, [authority, callPreferences?.chillyChatCallSoundKey, callPreferences?.chillyChatCallVibrateEnabled, captureCallOperation, currentUserId, finishTerminalInviteCleanup, loadThreadState, outgoingCallInvite, participantCount, stopOutgoingRingback, threadId]);

  useEffect(() => {
    if (!outgoingCallInvite?.id) return () => {};
    let active = true;
    let cleanupInFlight = false;
    const ownsContext = captureCallOperation();
    const applyInviteState = async () => {
      const invite = await readChillyChatCallInvite(outgoingCallInvite.id).catch(() => null);
      if (!active || !ownsContext() || !invite || invite.id !== outgoingCallInvite.id) return;
      if (invite.status === "accepted") {
        activeCallInviteRef.current = invite;
        setActiveCallInvite(invite);
        stopOutgoingRingback();
        setOutgoingCallInvite(null);
        setCallDeliveryStatus("Receiver joined the call.");
        return;
      }
      if (TERMINAL_CHAT_CALL_INVITE_STATUSES.has(invite.status)) {
        if (cleanupInFlight) return;
        cleanupInFlight = true;
        // Unsubscribing after terminal projection must not cancel owned cleanup.
        const completed = await finishTerminalInviteCleanup(invite, ownsContext);
        cleanupInFlight = false;
        if (!completed) return;
        setCallDeliveryStatus("The call ended. Active call state was cleared.");
        await loadThreadState();
        return;
      }
      setOutgoingCallInvite(invite);
    };
    void applyInviteState();
    const unsubscribe = subscribeToChillyChatCallInvite(outgoingCallInvite.id, () => {
      void applyInviteState();
    });
    return () => { active = false; unsubscribe(); };
  }, [captureCallOperation, finishTerminalInviteCleanup, loadThreadState, outgoingCallInvite?.id, stopOutgoingRingback]);

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
      || incomingCallPresentationExpired
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
    incomingCallPresentationExpired,
    iosNativePresentationGraceReadyInviteId,
    iosNativePresentationRevision,
  ]);

  useEffect(() => {
    if (incomingCallTimeoutRef.current) {
      clearTimeout(incomingCallTimeoutRef.current);
      incomingCallTimeoutRef.current = null;
    }
    if (!incomingCallInvite || !currentUserId) return undefined;
    let active = true;
    const ownsContext = captureCallOperation();
    const isCurrent = () => active && ownsContext();

    const expiresAt = Date.parse(incomingCallInvite.expiresAt);
    const timeoutMs = Number.isFinite(expiresAt) ? Math.max(0, expiresAt - Date.now()) : 0;
    const scheduleReconciliation = (delayMs: number) => {
      if (!isCurrent()) return;
      incomingCallTimeoutRef.current = setTimeout(async () => {
        const latestInvite = await readChillyChatCallInvite(incomingCallInvite.id).catch(() => null);
        if (!isCurrent()) return;
        const exactInvite = latestInvite?.id === incomingCallInvite.id
          && latestInvite.threadId === incomingCallInvite.threadId
          && latestInvite.communicationRoomId === incomingCallInvite.communicationRoomId
          && latestInvite.callerUserId === incomingCallInvite.callerUserId
          && latestInvite.calleeUserId === currentUserId;
        if (!exactInvite || !latestInvite) {
          // A failed read is not terminal authority. Keep one scheduled retry
          // at a time, bounded by this invite/account's mounted ownership.
          scheduleReconciliation(ACTIVE_CHAT_CALL_TERMINAL_RECONCILIATION_MS);
          return;
        }
        if (latestInvite.status === "accepted") {
          applyAcceptedIncomingInviteState(latestInvite);
          return;
        }
        if (TERMINAL_CHAT_CALL_INVITE_STATUSES.has(latestInvite.status)) {
          await clearEndedChatThreadCall(threadId, incomingCallInvite.communicationRoomId, authority ?? undefined).catch(() => null);
          if (!isCurrent()) return;
          clearVisibleIncomingCallState(latestInvite);
          await loadThreadState();
          return;
        }
        if (latestInvite.status !== "ringing") {
          scheduleReconciliation(ACTIVE_CHAT_CALL_TERMINAL_RECONCILIATION_MS);
          return;
        }
        const latestExpiresAt = Date.parse(latestInvite.expiresAt);
        if (Number.isFinite(latestExpiresAt) && latestExpiresAt > Date.now()) {
          scheduleReconciliation(latestExpiresAt - Date.now());
          return;
        }
        const missedInvite = await updateChillyChatCallInviteStatus({
          actorUserId: currentUserId,
          invite: latestInvite,
          status: "missed",
        }).catch(() => null);
        if (!isCurrent()) return;
        if (missedInvite?.status !== "missed" || missedInvite.id !== latestInvite.id
          || missedInvite.threadId !== latestInvite.threadId
          || missedInvite.communicationRoomId !== latestInvite.communicationRoomId
          || missedInvite.callerUserId !== latestInvite.callerUserId
          || missedInvite.calleeUserId !== latestInvite.calleeUserId) {
          scheduleReconciliation(ACTIVE_CHAT_CALL_TERMINAL_RECONCILIATION_MS);
          return;
        }
        await clearEndedChatThreadCall(threadId, incomingCallInvite.communicationRoomId, authority ?? undefined).catch(() => null);
        if (!isCurrent()) return;
        clearVisibleIncomingCallState(missedInvite);
        void loadThreadState();
      }, delayMs);
    };
    scheduleReconciliation(timeoutMs);

    return () => {
      active = false;
      if (incomingCallTimeoutRef.current) {
        clearTimeout(incomingCallTimeoutRef.current);
        incomingCallTimeoutRef.current = null;
      }
    };
  }, [applyAcceptedIncomingInviteState, authority, captureCallOperation, clearVisibleIncomingCallState, currentUserId, incomingCallInvite, loadThreadState, threadId]);

  useEffect(() => {
    if (!incomingCallInvite?.id) return undefined;
    const visibleInvite = incomingCallInvite;
    let active = true;
    const ownsContext = captureCallOperation();

    const reconcileInvitePresentation = async () => {
      const latestInvite = await readChillyChatCallInvite(visibleInvite.id).catch(() => null);
      if (!active || !ownsContext() || !latestInvite || latestInvite.status === "ringing"
        || latestInvite.id !== visibleInvite.id || latestInvite.threadId !== threadId
        || latestInvite.communicationRoomId !== visibleInvite.communicationRoomId
        || latestInvite.callerUserId !== visibleInvite.callerUserId
        || latestInvite.calleeUserId !== currentUserId) return;

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
  }, [captureCallOperation, clearVisibleIncomingCallState, currentUserId, incomingCallInvite, rememberHandledIncomingInvite, threadId]);

  useEffect(() => {
    if (!activeCallInvite?.id || activeCallInvite.status !== "accepted" || !currentUserId) {
      return undefined;
    }
    const inviteId = activeCallInvite.id;
    let subscribed = true;
    let terminalCleanupInFlight = false;
    const ownsContext = captureCallOperation();
    const reconcileActiveInvite = async () => {
      const latestInvite = await readChillyChatCallInvite(inviteId).catch(() => null);
      if (!subscribed || !ownsContext() || !latestInvite || latestInvite.id !== inviteId) return;
      if (!TERMINAL_CHAT_CALL_INVITE_STATUSES.has(latestInvite.status)) return;
      if (terminalCleanupInFlight || handledActiveTerminalInviteIdsRef.current.has(inviteId)) return;
      terminalCleanupInFlight = true;
      const completed = await finishTerminalInviteCleanup(latestInvite, ownsContext, `invite_${latestInvite.status}`);
      terminalCleanupInFlight = false;
      if (!completed) return;
      setCallDeliveryStatus("The call ended. Active call state was cleared on both devices.");
      await loadThreadState();
    };
    void reconcileActiveInvite();
    const unsubscribe = subscribeToChillyChatCallInvite(inviteId, () => { void reconcileActiveInvite(); });
    // Realtime may reconnect without replaying the terminal invite update.
    const terminalReconciliationInterval = setInterval(() => { void reconcileActiveInvite(); }, ACTIVE_CHAT_CALL_TERMINAL_RECONCILIATION_MS);
    return () => { subscribed = false; clearInterval(terminalReconciliationInterval); unsubscribe(); };
  }, [activeCallInvite?.id, activeCallInvite?.status, captureCallOperation, currentUserId, finishTerminalInviteCleanup, loadThreadState]);

  const otherMember = thread?.otherMember;
  const officialAccount = getOfficialPlatformAccount(otherMember?.userId);
  const otherMemberAvatarUrl = otherMember?.avatarUrl;
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
    && !incomingCallPresentationExpired
    && incomingCallInvite.status === "ringing"
    && incomingCallInvite.calleeUserId === currentUserId
    && incomingCallInvite.callerUserId !== currentUserId;
  const outgoingDeviceAlertConfirmed = outgoingCallRinging && outgoingCallDeviceAlertSent;
  const callTitle = outgoingCallRinging
    ? outgoingDeviceAlertConfirmed
      ? (resolvedCallType === "video" ? "Video call ringing" : "Voice call ringing")
      : (resolvedCallType === "video" ? "Video call — waiting for answer" : "Voice call — waiting for answer")
    : (resolvedCallType === "video" ? "Video call active" : "Voice call active");
  const callBody = outgoingCallRinging
    ? outgoingDeviceAlertConfirmed
      ? `A device alert was sent to ${otherMemberDisplayName}. Waiting for an answer.`
      : `The call invite is ready. Waiting for ${otherMemberDisplayName} to answer in Chi'lly Chat.`
    : resolvedCallType === "video"
      ? "Chi'lly Chat video stays inside this direct thread so both people can join without leaving the conversation."
      : "Chi'lly Chat voice stays inside this direct thread so both people can join without leaving the conversation.";
  const callActionLabel = callBusy
    ? "Connecting..."
    : !activeCallRoomId
      ? "No Active Call"
      : callPanelOpen
        ? "Call Open"
        : outgoingCallRinging
          ? outgoingDeviceAlertConfirmed ? "Open Ringing Call" : "Open Call"
          : activeCallInvite?.status === "accepted"
            ? resolvedCallType === "video"
              ? "Open Video Call"
              : "Open Voice Call"
            : resolvedCallType === "video"
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
      setError(getUserFacingErrorMessage(error, "Unable to attach that file right now."));
    }
  }, []);

  const handleSelectAttachment = useCallback((scope: SocialAttachmentPickerScope) => {
    setAttachmentSheetVisible(false);
    void handlePickAttachment(scope);
  }, [handlePickAttachment]);

  const handleSend = useCallback(async (bodyOverride?: string) => {
    // A stale event handler must not submit using the replacement session.
    // An already-dispatched write may settle for its original account, but its
    // completion must never update a different screen/account/session context.
    if (mountedMessageSendContextRef.current !== messageSendContext
      || !messageSendContext.isSignedIn || !messageSendContext.userId
      || messageSendOperationRef.current) return;
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

    const operation = { context: messageSendContext };
    messageSendOperationRef.current = operation;
    const isCurrent = () => mountedMessageSendContextRef.current === operation.context
      && messageSendOperationRef.current === operation;

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
      if (!isCurrent()) return;
      trackEvent("chat_message_sent", {
        surface: "chat-thread",
        threadId,
        hasAttachment: selectedAttachment ? "true" : "false",
      });
      setMessages((prev) => prev.map((message) => (message.id === tempId ? sent : message)));
      await markThreadReadWithThrottle();
    } catch (sendError) {
      if (!isCurrent()) return;
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      if (selectedAttachment) setAttachmentFile(selectedAttachment);
      const message = getUserFacingErrorMessage(sendError, "Unable to send Chi'lly Chat message.");
      setError(message);
      reportRuntimeError("chat-thread-send-message", sendError, {
        threadId,
      });
    } finally {
      if (isCurrent()) {
        messageSendOperationRef.current = null;
        setSending(false);
      }
    }
  }, [appConfig.runtimeControls.chat_attachments_enabled, appConfig.runtimeControls.chat_enabled, attachmentFile, currentUserId, draft, markThreadReadWithThrottle, messageSendContext, sending, thread, threadId]);

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
      setOutgoingCallDeviceAlertSent(false);
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
      setOutgoingCallDeviceAlertSent(isChillyChatCallDeviceAlertConfirmed(result.delivery));
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
      const message = getUserFacingErrorMessage(callStartError, "Unable to start Chi'lly Chat call.");
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
    isCurrent: () => boolean = () => true,
  ): Promise<ChillyChatCallInvite | null> => {
    const latestInvite = await readChillyChatCallInvite(invite.id).catch(() => null);
    if (!isCurrent()) return null;
    const expiresAt = Date.parse(String(latestInvite?.expiresAt ?? ""));
    const expired = Number.isFinite(expiresAt) && expiresAt <= Date.now();
    const roomId = normalizeCommunicationRoomIdentifier(latestInvite?.communicationRoomId);
    const valid =
      !!latestInvite
      && latestInvite.id === invite.id
      && (latestInvite.status === "accepted" || (latestInvite.status === "ringing" && !expired))
      && !!roomId
      && roomId === normalizeCommunicationRoomIdentifier(invite.communicationRoomId)
      && latestInvite.threadId === threadId
      && latestInvite.calleeUserId === currentUserId
      && latestInvite.callerUserId !== currentUserId;

    if (valid) {
      // A concurrent native or foreground Answer may already have accepted this
      // exact invite. Resume only the thread's authoritative active room.
      if (latestInvite.status !== "accepted") return latestInvite;
      const latestThread = await getChatThread(threadId).catch(() => null);
      if (!isCurrent()) return null;
      if (latestThread?.threadId === threadId && latestThread.activeCommunicationRoomId === roomId) return latestInvite;
    }

    await clearEndedChatThreadCall(threadId).catch(() => null);
    if (!isCurrent()) return null;
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
    const operation = beginAnswerOperation(invite.id);
    if (!operation) return false;

    Vibration.cancel();
    void stopChillyChatCallSound(incomingCallSoundRef.current);
    incomingCallSoundRef.current = null;
    if (incomingCallTimeoutRef.current) {
      clearTimeout(incomingCallTimeoutRef.current);
      incomingCallTimeoutRef.current = null;
    }
    try {
      const [latestInvite, latestThread] = await Promise.all([
        readChillyChatCallInvite(invite.id).catch(() => null),
        getChatThread(threadId).catch(() => null),
      ]);
      if (!isAnswerOperationCurrent(operation)) return false;
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

      if (!(await completeTrustedIosNativeAnswer(latestInvite, () => isAnswerOperationCurrent(operation)))) {
        throw new Error("Unable to finish the native Answer handoff safely.");
      }
      if (!isAnswerOperationCurrent(operation)) return false;
      if (!applyAcceptedIncomingInviteState(latestInvite)) return false;
      await dismissPresentedChillyChatCallNotifications({
        callInviteId: latestInvite.id,
        dismissAllPresentedNotificationsFallback: true,
        dismissIncomingCallFallback: true,
        threadId,
      }).catch(() => 0);
      if (!isAnswerOperationCurrent(operation)) return false;
      await dismissChillyChatCallNotificationRows({
        callInviteId: latestInvite.id,
        threadId,
      }).catch(() => 0);
      if (!isAnswerOperationCurrent(operation)) return false;
      logChatCall("accepted_invite_resumed", {
        threadId,
        roomId,
      });
      await loadThreadState();
      return true;
    } catch (resumeError) {
      if (isAnswerOperationCurrent(operation)) setError(getUserFacingErrorMessage(resumeError, "Unable to resume this Chi'lly Chat call."));
      return false;
    } finally {
      finishAnswerOperation(operation);
    }
  }, [
    applyAcceptedIncomingInviteState,
    beginAnswerOperation,
    callBusy,
    completeTrustedIosNativeAnswer,
    currentUserId,
    finishAnswerOperation,
    isAnswerOperationCurrent,
    loadThreadState,
    threadId,
  ]);

  const acceptIncomingInvite = useCallback(async (invite: ChillyChatCallInvite) => {
    if (!invite || callBusy || !currentUserId) return false;
    const operation = beginAnswerOperation(invite.id);
    if (!operation) return false;
    try {
      if (Platform.OS === "ios" && !requestedNativeCallUuid) {
        const ownsForegroundAnswer = () => isAnswerOperationCurrent(operation);
        const presentationWaitOutcome = await ensureIosForegroundIncomingCallPresentation({
          inviteId: invite.id,
          threadId,
          roomId: normalizeCommunicationRoomIdentifier(invite.communicationRoomId),
          authority,
          isCurrent: ownsForegroundAnswer,
        });
        if (!isAnswerOperationCurrent(operation)) return false;
        const answerAuthority = resolveIosForegroundIncomingAnswerAuthority(presentationWaitOutcome);
        if (answerAuthority === "native_answer") {
          const requested = await requestIosNativeCallAnswer(invite.id, ownsForegroundAnswer);
          if (!isAnswerOperationCurrent(operation)) return false;
          if (!requested) {
            setError("Unable to hand this call to iPhone right now. The call remains available while it is still ringing.");
          }
          return requested;
        }
        if (answerAuthority === "blocked") {
          setError("Unable to hand this call to iPhone right now. The call remains available while it is still ringing.");
          return false;
        }
      }
      Vibration.cancel();
      void stopChillyChatCallSound(incomingCallSoundRef.current);
      incomingCallSoundRef.current = null;
      if (incomingCallTimeoutRef.current) {
        clearTimeout(incomingCallTimeoutRef.current);
        incomingCallTimeoutRef.current = null;
      }
      const currentInvite = await readAcceptableIncomingInvite(invite, () => isAnswerOperationCurrent(operation));
      if (!currentInvite || !isAnswerOperationCurrent(operation)) return false;
      const acceptedInvite = currentInvite.status === "accepted"
        ? currentInvite
        : await updateChillyChatCallInviteStatus({
          actorUserId: currentUserId,
          invite: currentInvite,
          status: "accepted",
        });
      if (!isAnswerOperationCurrent(operation)) return false;
      if (!acceptedInvite || acceptedInvite.status !== "accepted"
        || acceptedInvite.id !== currentInvite.id
        || acceptedInvite.threadId !== threadId
        || acceptedInvite.communicationRoomId !== currentInvite.communicationRoomId
        || acceptedInvite.calleeUserId !== currentUserId
        || acceptedInvite.callerUserId !== currentInvite.callerUserId) {
        throw new Error("Unable to accept this Chi'lly Chat call right now.");
      }
      if (!(await completeTrustedIosNativeAnswer(acceptedInvite, () => isAnswerOperationCurrent(operation)))) {
        throw new Error("Unable to finish the native Answer handoff safely.");
      }
      if (!isAnswerOperationCurrent(operation)) return false;
      if (!applyAcceptedIncomingInviteState(acceptedInvite)) {
        throw new Error("Unable to open this accepted Chi'lly Chat call.");
      }
      await dismissPresentedChillyChatCallNotifications({
        callInviteId: currentInvite.id,
        dismissAllPresentedNotificationsFallback: true,
        dismissIncomingCallFallback: true,
        threadId,
      }).catch(() => 0);
      if (!isAnswerOperationCurrent(operation)) return false;
      await dismissChillyChatCallNotificationRows({
        callInviteId: currentInvite.id,
        threadId,
      }).catch(() => 0);
      if (!isAnswerOperationCurrent(operation)) return false;
      trackEvent("chat_call_accepted", {
        surface: "chat-thread",
        threadId,
        mode: currentInvite.callType,
      });
      await loadThreadState();
      return true;
    } catch (acceptError) {
      if (isAnswerOperationCurrent(operation)) setError(getUserFacingErrorMessage(acceptError, "Unable to accept this Chi'lly Chat call."));
      return false;
    } finally {
      finishAnswerOperation(operation);
    }
  }, [
    applyAcceptedIncomingInviteState,
    authority,
    beginAnswerOperation,
    callBusy,
    completeTrustedIosNativeAnswer,
    currentUserId,
    finishAnswerOperation,
    isAnswerOperationCurrent,
    loadThreadState,
    readAcceptableIncomingInvite,
    requestedNativeCallUuid,
    threadId,
  ]);

  const handleAcceptIncomingCall = useCallback(async () => {
    if (!incomingCallInvite) return;
    await acceptIncomingInvite(incomingCallInvite);
  }, [acceptIncomingInvite, incomingCallInvite]);

  const requestAuthoritativeIncomingCallDecline = useCallback(async (
    invite: ChillyChatCallInvite,
    isCurrent: () => boolean = () => true,
  ) => {
    if (!isCurrent()) return null;
    const updatedInvite = await updateChillyChatCallInviteStatus({
      actorUserId: currentUserId!,
      invite,
      status: "declined",
    });
    if (!isCurrent()) return null;
    const candidateInvite = updatedInvite
      ?? await readChillyChatCallInvite(invite.id).catch(() => null);
    if (!isCurrent()) return null;
    const declinedInvite = resolveAuthoritativeNativeCallDecline({
      currentUserId,
      expectedInviteId: invite.id,
      expectedThreadId: threadId,
      invite: candidateInvite,
    });
    if (declinedInvite) return declinedInvite;
    const exactTerminalInvite = !!candidateInvite
      && candidateInvite.id === invite.id
      && candidateInvite.threadId === threadId
      && candidateInvite.calleeUserId === currentUserId
      && candidateInvite.callerUserId !== currentUserId
      && TERMINAL_CHAT_CALL_INVITE_STATUSES.has(candidateInvite.status);
    return exactTerminalInvite ? candidateInvite : null;
  }, [currentUserId, threadId]);

  const handleDeclineIncomingCall = useCallback(async () => {
    if (!incomingCallInvite || !currentUserId) return;
    const operation = beginAnswerOperation(incomingCallInvite.id);
    if (!operation) return;
    const isCurrent = () => isAnswerOperationCurrent(operation);
    Vibration.cancel();
    void stopChillyChatCallSound(incomingCallSoundRef.current);
    incomingCallSoundRef.current = null;
    try {
      const declinedInvite = await requestAuthoritativeIncomingCallDecline(incomingCallInvite, isCurrent);
      if (!isCurrent()) return;
      if (!declinedInvite) {
        throw new Error("Unable to decline this Chi'lly Chat call right now.");
      }
      rememberHandledIncomingInvite(declinedInvite, { clearRoom: true });
      await dismissPresentedChillyChatCallNotifications({
        callInviteId: incomingCallInvite.id,
        exactInviteOnly: true,
        threadId,
      }).catch(() => 0);
      if (!isCurrent()) return;
      await dismissChillyChatCallNotificationRows({
        callInviteId: incomingCallInvite.id,
        exactInviteOnly: true,
        threadId,
        userId: currentUserId,
      }).catch(() => 0);
      if (!isCurrent()) return;
      await clearEndedChatThreadCall(threadId, incomingCallInvite.communicationRoomId, authority ?? undefined);
      if (!isCurrent()) return;
      clearVisibleIncomingCallState(incomingCallInvite);
      setCallDeliveryStatus("Incoming call declined. Call state was cleared.");
      trackEvent("chat_call_declined", {
        surface: "chat-thread",
        threadId,
        mode: incomingCallInvite.callType,
      });
      await loadThreadState();
    } catch (declineError) {
      if (!isCurrent()) return;
      setError(getUserFacingErrorMessage(declineError, "Unable to decline this Chi'lly Chat call."));
    } finally {
      finishAnswerOperation(operation);
    }
  }, [authority, beginAnswerOperation, clearVisibleIncomingCallState, currentUserId, finishAnswerOperation, incomingCallInvite, isAnswerOperationCurrent, loadThreadState, rememberHandledIncomingInvite, requestAuthoritativeIncomingCallDecline, threadId]);

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
    const ownsContext = captureCallOperation();
    const isCurrent = () => ownsContext() && activeNativeCallActionRequestKeyRef.current === requestKey;
    const resolveRequestedInvite = async () => {
      const hydratedInvite =
        incomingCallInvite?.id === requestedCallInviteId
          ? incomingCallInvite
          : null;
      if (hydratedInvite) return hydratedInvite;

      for (let attempt = 0; attempt < 6; attempt += 1) {
        if (!isCurrent()) return null;
        const invite = await readChillyChatCallInvite(requestedCallInviteId).catch(() => null);
        if (!isCurrent()) return null;
        if (invite || attempt === 5) return invite;
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
      return null;
    };

    const handleNativeCallAction = async () => {
      const invite = await resolveRequestedInvite();
      if (!isCurrent()) return;
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
          exactInviteOnly: true,
          threadId,
        }).catch(() => 0);
        if (!isCurrent()) return;
        if (action === "answer" && requestedNativeCallUuid) {
          await completeIosNativeCallAnswer(requestedNativeCallUuid, false);
        }
        return;
      }

      if (action === "answer") {
        const accepted = invite.status === "accepted"
          ? await resumeAcceptedIncomingInvite(invite)
          : await acceptIncomingInvite(invite);
        if (!isCurrent()) return;
        if (!accepted && requestedNativeCallUuid) {
          await completeIosNativeCallAnswer(requestedNativeCallUuid, false);
        }
        return;
      }

      if (action === "mute" || action === "unmute") {
        const shouldMute = action === "mute";
        if (invite.status === "accepted") {
          const updated = await setMicrophoneEnabled(!shouldMute);
          if (!isCurrent()) return;
          if (!updated) {
            const message = "The native microphone action could not be synchronized. Open the call to try again.";
            setError(message);
            setCallControlError(message);
            reportRuntimeError("chat-call-native-microphone-action", new Error("native_microphone_action_sync_failed"), {
              action,
              threadId,
            });
          } else {
            setError(null);
            setCallControlError(null);
          }
        }
        return;
      }

      if (action === "end") {
        let terminalInvite = invite;
        if (invite.status === "accepted") {
          const endedInvite = await updateChillyChatCallInviteStatus({ actorUserId: currentUserId, invite, status: "ended" }).catch(() => null);
          if (!isCurrent()) return;
          if (!endedInvite || endedInvite.status !== "ended") {
            setError("Unable to confirm that the call ended for both participants. Reopen the call and try End Call again.");
            return;
          }
          terminalInvite = endedInvite;
        }
        if (!await finishTerminalInviteCleanup(terminalInvite, isCurrent)) return;
        await loadThreadState();
        return;
      }

      if (incomingCallInvite?.id === invite.id) {
        await handleDeclineIncomingCall();
        return;
      }

      const declinedInvite = await requestAuthoritativeIncomingCallDecline(invite, isCurrent);
      if (!isCurrent()) return;
      if (!declinedInvite) {
        setError("Unable to confirm that the call was declined. The active call remains unchanged.");
        return;
      }
      rememberHandledIncomingInvite(declinedInvite, { clearRoom: true });
      await dismissPresentedChillyChatCallNotifications({
        callInviteId: invite.id,
        exactInviteOnly: true,
        threadId,
      }).catch(() => 0);
      if (!isCurrent()) return;
      await dismissChillyChatCallNotificationRows({
        callInviteId: invite.id,
        exactInviteOnly: true,
        threadId,
        userId: currentUserId,
      }).catch(() => 0);
      if (!isCurrent()) return;
      await clearEndedChatThreadCall(threadId, invite.communicationRoomId, authority ?? undefined).catch(() => null);
      if (!isCurrent()) return;
      clearVisibleIncomingCallState(invite);
      setCallDeliveryStatus("Incoming call declined. Call state was cleared.");
      await loadThreadState();
    };

    void handleNativeCallAction();
  }, [
    acceptIncomingInvite,
    authority,
    callBusy,
    captureCallOperation,
    clearVisibleIncomingCallState,
    currentUserId,
    finishTerminalInviteCleanup,
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
    releaseTrustedNativeCallSession,
    resumeAcceptedIncomingInvite,
    setMicrophoneEnabled,
    callRoom?.hostUserId,
    leaveRoom,
    threadId,
    trustedNativeCallClaim,
  ]);

  useEffect(() => {
    const exactNativeAnswer = Platform.OS === "ios"
      && requestedNativeCallAction === "answer"
      && requestedNativeCallOwnsTransition
      && !!requestedCallInviteId
      && !!requestedNativeCallUuid;
    setNativeApplicationActiveSerial(
      exactNativeAnswer ? readIosNativeApplicationActiveSerial(requestedCallInviteId) : 0,
    );
  }, [
    requestedCallInviteId,
    requestedNativeCallAction,
    requestedNativeCallOwnsTransition,
    requestedNativeCallUuid,
  ]);

  useEffect(() => {
    if (Platform.OS !== "ios" || !activeIosNativeAudioCallUuid) return undefined;
    return subscribeToIosNativeCallEvents((event) => {
      const eventCallUuid = String(event.callUuid ?? "").trim();
      const appliesToActiveCall = !eventCallUuid || eventCallUuid === activeIosNativeAudioCallUuid;
      if (!appliesToActiveCall) return;
      if (event.type === "muted" || event.type === "unmuted") {
        if (eventCallUuid && consumeNativeMicAck(event.type === "muted")) return;
        if (eventCallUuid && consumeAutomaticMicrophoneFeedback(event.type === "muted")) return;
        void setMicrophoneEnabled(event.type === "unmuted");
        return;
      }
      if (
        event.type === "audioSessionActivated"
        || event.type === "applicationActive"
      ) {
        setNativeMediaActivationSerial((current) => current + 1);
      }
      if (event.type === "applicationActive") {
        setNativeApplicationActiveSerial(
          readIosNativeApplicationActiveSerial(requestedCallInviteId),
        );
      }
      if (event.type === "audioSessionActivated") {
        // Receipt wins over a queued deadline even before React commits state.
        nativeAudioSessionCallUuidRef.current = activeIosNativeAudioCallUuid;
        setNativeAudioSessionCallUuid(activeIosNativeAudioCallUuid);
      }
    });
  }, [activeIosNativeAudioCallUuid, consumeAutomaticMicrophoneFeedback, consumeNativeMicAck, requestedCallInviteId, setMicrophoneEnabled]);

  const handleJoinOrCloseCall = useCallback(async (
    expectedInviteId = "",
    allowForegroundRingingAccept = true,
  ) => {
    const ownsContext = captureCallOperation();
    const isCurrent = () => ownsContext() && isNativeMicContextCurrent();
    if (!isCurrent()) return;
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

    if (!callPanelOpen && activeCallInvite && TERMINAL_CHAT_CALL_INVITE_STATUSES.has(activeCallInvite.status)) {
      setCallPanelOpen(true);
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
        if (!isCurrent()) return;
        if (requestedInvite?.communicationRoomId === activeCallRoomId) joinInvite = requestedInvite;
        if (!joinInvite && attempt < 5) await new Promise((resolve) => setTimeout(resolve, 300));
        if (!isCurrent()) return;
      }
      for (let attempt = 0; !joinInvite && !normalizedExpectedInviteId && attempt < 6; attempt += 1) {
        joinInvite = await readLatestChillyChatCallInviteForRoom(activeCallRoomId).catch(() => null);
        if (!isCurrent()) return;
        if (!joinInvite && attempt < 5) await new Promise((resolve) => setTimeout(resolve, 300));
        if (!isCurrent()) return;
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
          if (!isCurrent()) return;
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
      if (!isCurrent()) return;
      const inviteBelongsToParticipant = !!terminalInvite
        && terminalInvite.threadId === threadId
        && terminalInvite.communicationRoomId === activeCallRoomId
        && (!normalizedExpectedInviteId || terminalInvite.id === normalizedExpectedInviteId)
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
        if (!isCurrent()) return;
        if (!canceledInvite || canceledInvite.status !== "canceled"
          || canceledInvite.id !== terminalInvite.id || canceledInvite.threadId !== terminalInvite.threadId
          || canceledInvite.communicationRoomId !== terminalInvite.communicationRoomId
          || canceledInvite.callerUserId !== terminalInvite.callerUserId
          || canceledInvite.calleeUserId !== terminalInvite.calleeUserId) {
          throw new Error("Unable to cancel the ringing call for the receiver. The call was left connected so you can try again.");
        }
        handledActiveTerminalInviteIdsRef.current.add(terminalInvite.id);
        activeCallInviteRef.current = canceledInvite;
        setActiveCallInvite(canceledInvite);
      } else if (terminalInvite.status === "accepted" && currentUserId) {
        const endedInvite = await updateChillyChatCallInviteStatus({
          actorUserId: currentUserId,
          invite: terminalInvite,
          status: "ended",
        }).catch(() => null);
        if (!isCurrent()) return;
        if (!endedInvite || endedInvite.status !== "ended"
          || endedInvite.id !== terminalInvite.id || endedInvite.threadId !== terminalInvite.threadId
          || endedInvite.communicationRoomId !== terminalInvite.communicationRoomId
          || endedInvite.callerUserId !== terminalInvite.callerUserId
          || endedInvite.calleeUserId !== terminalInvite.calleeUserId) {
          throw new Error("Unable to end the call for both participants. The call was left connected so you can try again.");
        }
        handledActiveTerminalInviteIdsRef.current.add(terminalInvite.id);
        activeCallInviteRef.current = endedInvite;
        setActiveCallInvite(endedInvite);
      } else if (!TERMINAL_CHAT_CALL_INVITE_STATUSES.has(terminalInvite.status)) {
        throw new Error("The active call is changing state. Wait a moment and try End Call again.");
      }
      // Terminal invite authority has already closed the shared room. Only
      // local/native resources and the exact membership still need settlement.
      await leaveRoom({ endRoomIfHost: false });
      if (!isCurrent()) return;
      if (requestedNativeCallUuid) {
        const nativeEnded = await endIosNativeCall(requestedNativeCallUuid, "in_app_leave").catch(() => false);
        if (!isCurrent()) return;
        if (!nativeEnded) throw new Error("Native call cleanup is still pending. Use End Call to retry.");
      }
      await clearEndedChatThreadCall(threadId, terminalInvite.communicationRoomId, authority ?? undefined);
      if (!isCurrent()) return;
      stopOutgoingRingback();
      setOutgoingCallInvite(null);
      activeCallInviteRef.current = null;
      setActiveCallInvite(null);
      setCallPanelOpen(false);
      releaseTrustedNativeCallSession(terminalInvite.id);
      setCallDeliveryStatus("The call ended and both participants' active call state was cleared.");
      await loadThreadState();
    } catch (leaveError) {
      if (!isCurrent()) return;
      const leaveMessage = getUserFacingErrorMessage(
        leaveError,
        "Unable to end this Chi'lly Chat call safely.",
      );
      setError(leaveMessage);
      setCallControlError(leaveMessage);
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
  }, [acceptIncomingInvite, activeCallInvite, activeCallRoomId, authority, callPanelOpen, callRoom?.hostUserId, captureCallOperation, currentUserId, handleStartCall, incomingCallInvite, isNativeMicContextCurrent, leaveRoom, loadThreadState, officialAccount, outgoingCallInvite, releaseTrustedNativeCallSession, requestedNativeCallUuid, stopOutgoingRingback, thread?.activeCallType, threadId]);

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
      const message = getUserFacingErrorMessage(
        friendError,
        "Unable to update Chi'lly Circle right now.",
      );
      Alert.alert("Chi'lly Circle unavailable", message);
    } finally {
      setFriendBusy(null);
    }
  }, [friendBusy, officialAccount, otherMember?.userId]);

  if (authLoading || loading) {
    return (
      <ChillywoodBrandedSurface variant="chat" style={[styles.screen, styles.centered, { paddingTop: safeAreaInsets.top + 28 }]}>
        <ActivityIndicator size="small" color="#F34B74" />
        <Text style={styles.stateText}>{authLoading ? "Checking Chi'lly Chat access..." : "Loading thread…"}</Text>
      </ChillywoodBrandedSurface>
    );
  }

  if (!isSignedIn) {
    return (
      <ChillywoodBrandedSurface variant="chat" style={[styles.screen, styles.centered, { paddingTop: safeAreaInsets.top + 28 }]}>
        <Text style={styles.stateText}>Sign in to open Chi&apos;lly Chat.</Text>
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
      </ChillywoodBrandedSurface>
    );
  }

  if (!thread) {
    return (
      <ChillywoodBrandedSurface variant="chat" style={[styles.screen, styles.centered, { paddingTop: safeAreaInsets.top + 28 }]}>
        <Text style={styles.stateText}>{error ?? "This Chi'lly Chat thread is unavailable."}</Text>
        <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.85} onPress={() => router.back()}>
          <Text style={styles.secondaryBtnText}>Back</Text>
        </TouchableOpacity>
      </ChillywoodBrandedSurface>
    );
  }

  if (officialAccount) {
    return (
      <ChillywoodBrandedSurface variant="chat" style={[styles.screen, styles.centered, { paddingTop: safeAreaInsets.top + 28, paddingHorizontal: 24 }]}>
        <Text style={styles.stateText}>Rachi now lives in Chi&apos;lly Circle.</Text>
        <Text style={[styles.stateText, styles.centeredStateBody]}>
          Rachi is your first official Chi&apos;lly Circle connection. Chi&apos;lly Chat is for direct threads with people.
        </Text>
        <TouchableOpacity
          style={[styles.secondaryBtn, styles.signInBtn]}
          activeOpacity={0.85}
          onPress={() => {
            router.replace("/chilly-circle" as Parameters<typeof router.replace>[0]);
          }}
        >
          <Text style={styles.secondaryBtnText}>Open Chi&apos;lly Circle</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.85} onPress={() => router.back()}>
          <Text style={styles.secondaryBtnText}>Back</Text>
        </TouchableOpacity>
      </ChillywoodBrandedSurface>
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
    <ChillywoodBrandedSurface variant="chat" testID="chat-thread-branded-surface">
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
          <Text style={styles.kicker}>CHI&apos;LLY CHAT</Text>
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
              <Text style={styles.headerPillText}>{getThreadStatusLabel(presentedThread)}</Text>
            </View>
            {thread?.currentMember?.lastReadAt ? (
              <Text style={styles.headerMetaText}>Read up to date.</Text>
            ) : (
              <Text style={styles.headerMetaText}>Voice and video stay in-thread.</Text>
            )}
          </View>
          <Text style={styles.headerHint}>
            Tap the avatar for profile, Chi&apos;lly Circle, report, and call actions.
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
            Open the profile, manage Chi&apos;lly Circle, or keep voice/video entry in this same thread.
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
                <Text style={styles.friendshipKicker}>CHI&apos;LLY CIRCLE</Text>
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
            <ChillywoodPrimaryActionFill />
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
                : `${otherMemberDisplayName} can join from this same thread. Open Chi'lly Chat to join.`}
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
        keyboardShouldPersistTaps="handled"
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
            {message.isMe ? <ChillywoodPrimaryActionFill opacity={0.34} radius={20} /> : null}
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
            <ChillywoodPrimaryActionFill />
            <Text style={styles.sendBtnText}>{sending ? "..." : "Send"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {callPanelOpen ? (
        <ChillywoodBrandedSurface
          variant="chat"
          style={styles.callOverlay}
          testID="chat-call-branded-surface"
        >
          <InRoomCommunicationPanel
            surfaceLabel="Chi'lly Chat"
            titleText={callTitle}
            bodyText={callBody}
            loadingText="Connecting Chi'lly Chat call…"
            emptyStateText={outgoingCallRinging
              ? outgoingDeviceAlertConfirmed
                ? "Ringing. Waiting for the other participant to answer this Chi'lly Chat call."
                : "Waiting for the other participant to answer this Chi'lly Chat call."
              : "Waiting for the other participant to join this Chi'lly Chat call."}
            roomCode={callRoom?.roomCode ?? activeCallRoomId}
            participantCount={outgoingCallRinging ? 1 : participantCount}
            isHost={outgoingCallRinging || (!!callRoom?.hostUserId && callRoom.hostUserId === currentUserId)}
            channelState={callChannelState}
            loading={outgoingCallRinging ? false : callLoading}
            statusMessage={outgoingCallRinging ? null : callError}
            statusLabelOverride={outgoingCallRinging ? outgoingDeviceAlertConfirmed ? "Ringing" : "Calling" : null}
            participants={participants}
            callType={resolvedCallType ?? null}
            cameraEnabled={cameraEnabled}
            micEnabled={micEnabled}
            mediaControlsBusy={mediaControlsBusy}
            speakerEnabled={nativeSpeakerEnabled}
            leaveLabel={outgoingCallRinging ? "Cancel Call" : "End Call"}
            mediaPermissionMessage={mediaPermissionMessage}
            mediaControlMessage={callControlError ?? mediaControlError}
            canOpenMediaSettings={canOpenMediaSettings}
            showControls={outgoingCallRinging || activeCallInvite?.status === "accepted" || TERMINAL_CHAT_CALL_INVITE_STATUSES.has(activeCallInvite?.status ?? "")}
            showMediaControls={activeCallInvite?.status === "accepted" && !outgoingCallRinging && !callError && !callLoading}
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
              setCallDeliveryStatus(TERMINAL_CHAT_CALL_INVITE_STATUSES.has(activeCallInvite?.status ?? "")
                ? "Call cleanup is pending. Tap Open Call, then End Call to retry."
                : "Call is still connected. Tap Open Call to return.");
            }}
          />
        </ChillywoodBrandedSurface>
      ) : null}

      {incomingCallInvite
        && !incomingCallPresentationExpired
        && !callPanelOpen
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
    </ChillywoodBrandedSurface>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
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
    marginHorizontal: 12,
    marginBottom: 12,
    padding: 14,
    alignItems: "flex-start",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(132,40,255,0.4)",
    backgroundColor: "rgba(7,5,27,0.8)",
  },
  backText: {
    color: "#E2E9F7",
    fontSize: 14,
    fontWeight: "800",
  },
  headerAvatarButton: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(0,168,255,0.48)",
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
    color: "#C5BCDE",
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
    borderColor: "rgba(102,61,190,0.48)",
    backgroundColor: "rgba(17,15,42,0.7)",
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
    borderColor: "rgba(102,61,190,0.62)",
    backgroundColor: "rgba(17,15,42,0.82)",
    paddingVertical: 12,
    alignItems: "center",
  },
  joinBtn: {
    flex: 1.2,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(91,214,255,0.62)",
    backgroundColor: "#5B1DFF",
    paddingVertical: 12,
    alignItems: "center",
    overflow: "hidden",
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
    paddingTop: 4,
  },
  messageBubble: {
    maxWidth: "84%",
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 4,
    overflow: "hidden",
  },
  messageBubbleMe: {
    alignSelf: "flex-end",
    backgroundColor: "rgba(7,5,27,0.94)",
    borderWidth: 1,
    borderColor: "rgba(0,168,255,0.38)",
  },
  messageBubbleThem: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(8,7,29,0.9)",
    borderWidth: 1,
    borderColor: "rgba(102,61,190,0.42)",
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
    borderColor: "rgba(102,61,190,0.42)",
    backgroundColor: "rgba(7,5,27,0.82)",
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
    borderTopColor: "rgba(132,40,255,0.44)",
    backgroundColor: "rgba(7,5,27,0.96)",
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
    borderColor: "rgba(102,61,190,0.62)",
    backgroundColor: "rgba(17,15,42,0.82)",
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(102,61,190,0.62)",
    backgroundColor: "rgba(17,15,42,0.82)",
    color: "#F7FBFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    fontWeight: "600",
  },
  sendBtn: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(91,214,255,0.58)",
    backgroundColor: "#5B1DFF",
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
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
