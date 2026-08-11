import "../_lib/livekit/dom-exception-polyfill";

import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type TrackPublication,
} from "livekit-client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, Platform } from "react-native";

import { emitChatCallLiveKitStage } from "../_lib/chatCallLiveKitTelemetry";
import type { ChillyChatCallInvite } from "../_lib/chillyChatCalls";
import {
  endCommunicationRoom,
  getActiveCommunicationMemberships,
  getCommunicationRoomSnapshot,
  joinCommunicationRoomSession,
  leaveCommunicationRoomSession,
  readCommunicationIdentity,
  touchCommunicationRoomSession,
  type CommunicationIdentity,
  type CommunicationMediaPreferences,
  type CommunicationParticipantView,
  type CommunicationRoomMembership,
  type CommunicationRoomState,
} from "../_lib/communication";
import {
  selectLiveKitAudioOutput,
  type LiveKitAudioOutput,
} from "../_lib/livekit/audioRouting";
import {
  configureLiveKitIosAudioSession,
  LiveKitAudioSession,
  resetLiveKitIosAudioSession,
} from "../_lib/livekit/react-native-module";
import {
  requestLiveKitParticipantToken,
  validateChatCallLiveKitTokenClaims,
} from "../_lib/livekit/token-contract";
import { reportRuntimeError } from "../_lib/logger";
import type { MediaPermissionState } from "../_lib/mediaPermissions";
import { registerActiveMediaSessionStopper } from "../_lib/mediaSessionLifecycle";
import {
  createLiveKitV1RoomOptions,
  LIVE_VIDEO_CAPTURE_OPTIONS,
  ROOM_HEARTBEAT_MS,
} from "../_lib/performancePolicy";

type ChatCallChannelState = "idle" | "connecting" | "live" | "reconnecting" | "error";
type RoomEndedReason = "host-left" | "ended" | "room-full";
type CommittedRoomState = "pending" | "active" | "reconnecting" | "terminal";
type MediaReconciliationState = "clear" | "recovering" | "warning";

type CommittedSession = Readonly<{
  callType: ChillyChatCallInvite["callType"] | null;
  communicationRoomId: string;
  generation: number;
  inviteId: string;
  liveKitRoom: Room | null;
  mediaProvider: ChillyChatCallInvite["mediaProvider"] | null;
  normalizedRoomId: string;
  participantAuthority: string;
  roomState: CommittedRoomState;
  sessionKey: string;
  userId: string;
}>;

type MediaControlOwner = {
  generation: number;
  liveKitRoom: Room;
  sessionKey: string;
  token: symbol;
};

type DeferredMediaReconciliation = {
  binding: CommittedSession;
  promise: Promise<boolean>;
  reconcileNative: boolean;
};

type UseLiveKitChatCallSessionOptions = {
  allowBackgroundAudio?: boolean;
  enabled: boolean;
  initialMediaPreferences?: Partial<CommunicationMediaPreferences>;
  invite: ChillyChatCallInvite | null;
  mediaActivationSerial?: number;
  onRoomEnded?: (reason: RoomEndedReason) => void | Promise<void>;
  roomId: string;
  threadId: string;
};

export type ChatCallFirstMediaState = {
  firstAudio: boolean;
  firstVideo: boolean;
  localAudioPublished: boolean;
  localVideoPublished: boolean;
  remoteAudioSubscribed: boolean;
  remoteVideoSubscribed: boolean;
};

const EMPTY_FIRST_MEDIA_STATE: ChatCallFirstMediaState = {
  firstAudio: false,
  firstVideo: false,
  localAudioPublished: false,
  localVideoPublished: false,
  remoteAudioSubscribed: false,
  remoteVideoSubscribed: false,
};

const normalizeRoomId = (value: unknown) => String(value ?? "").trim().toUpperCase();
const getErrorMessage = (error: unknown) => (
  error instanceof Error ? error.message : String(error ?? "unknown_error")
);

const getAudioOutputCandidates = (speakerEnabled: boolean): LiveKitAudioOutput[] => (
  speakerEnabled ? ["speaker", "force_speaker"] : ["earpiece", "default"]
);

const publicationIsUsable = (publication: TrackPublication | undefined) => (
  !!publication?.track && !publication.isMuted
);

const isConfirmedNativePermissionDenial = (error: unknown) => {
  const candidate = error as { code?: unknown; name?: unknown } | null;
  const name = String(candidate?.name ?? "").trim().toLowerCase();
  const code = String(candidate?.code ?? "").trim().toLowerCase();
  const message = getErrorMessage(error).trim().toLowerCase();
  return name === "notallowederror"
    || name === "permissiondeniederror"
    || code === "permission_denied"
    || code === "e_audio_permission"
    || code === "e_camera_permission"
    || message.includes("permission denied")
    || message.includes("permission was denied");
};

const sameCommittedAuthority = (left: CommittedSession | null, right: CommittedSession | null) => (
  !!left
  && !!right
  && left.generation === right.generation
  && left.sessionKey === right.sessionKey
  && left.inviteId === right.inviteId
  && left.communicationRoomId === right.communicationRoomId
  && left.normalizedRoomId === right.normalizedRoomId
  && left.participantAuthority === right.participantAuthority
  && left.userId === right.userId
  && left.mediaProvider === right.mediaProvider
  && left.callType === right.callType
  && left.liveKitRoom === right.liveKitRoom
);

export function useLiveKitChatCallSession({
  allowBackgroundAudio = false,
  enabled,
  initialMediaPreferences,
  invite,
  mediaActivationSerial = 0,
  onRoomEnded,
  roomId,
  threadId,
}: UseLiveKitChatCallSessionOptions) {
  const normalizedRoomId = normalizeRoomId(roomId);
  const inviteId = invite?.id ?? "";
  const inviteStatus = invite?.status ?? null;
  const inviteProvider = invite?.mediaProvider ?? null;
  const inviteThreadId = invite?.threadId ?? "";
  const inviteCommunicationRoomId = invite?.communicationRoomId ?? "";
  const inviteCallerUserId = invite?.callerUserId ?? "";
  const inviteCalleeUserId = invite?.calleeUserId ?? "";
  const inviteCallType = invite?.callType ?? null;
  const participantAuthority = [inviteCallerUserId, inviteCalleeUserId].sort().join(":");
  const sessionKey = enabled && inviteId
    ? `${inviteId}:${normalizedRoomId}:${inviteCallType}:${inviteProvider}`
    : "";
  const initialCameraEnabled = inviteCallType === "video"
    && initialMediaPreferences?.cameraEnabled !== false;
  const initialMicEnabled = initialMediaPreferences?.micEnabled !== false;
  const roomRef = useRef<Room | null>(null);
  const sessionGenerationRef = useRef(0);
  const committedSessionRef = useRef<CommittedSession | null>(null);
  const productRoomRef = useRef<CommunicationRoomState | null>(null);
  const identityRef = useRef<CommunicationIdentity | null>(null);
  const membershipsRef = useRef<CommunicationRoomMembership[]>([]);
  const cameraRequestedRef = useRef(initialCameraEnabled);
  const micRequestedRef = useRef(initialMicEnabled);
  const appStateRef = useRef(AppState.currentState);
  const endingCleanupOwnersRef = useRef<Set<object | symbol>>(new Set());
  const manualDisconnectRef = useRef(false);
  const cleanupCompletedOwnersRef = useRef<Set<object | symbol>>(new Set());
  const installedUiConnectedRef = useRef(false);
  const firstAudioRef = useRef(false);
  const firstVideoRef = useRef(false);
  const tokenValidatedRef = useRef(false);
  const cameraFacingRef = useRef<"user" | "environment">("user");
  const speakerRequestedRef = useRef(inviteCallType === "video");
  const mediaControlRef = useRef<Promise<unknown> | null>(null);
  const mediaControlOwnerRef = useRef<MediaControlOwner | null>(null);
  const mediaWriteTailsRef = useRef<WeakMap<Room, Promise<void>>>(new WeakMap());
  const deferredMediaReconciliationRef = useRef<DeferredMediaReconciliation | null>(null);
  const pendingMicToggleRef = useRef(false);
  const pendingMicOwnerRef = useRef<MediaControlOwner | null>(null);
  const micReconciliationBlockedRef = useRef(false);
  const ownsIosAudioConfigurationRef = useRef(false);
  const onRoomEndedRef = useRef(onRoomEnded);
  const telemetryStartedAtRef = useRef(Date.now());
  const [room, setRoom] = useState<CommunicationRoomState | null>(null);
  const [identity, setIdentity] = useState<CommunicationIdentity | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [channelState, setChannelState] = useState<ChatCallChannelState>("idle");
  const [cameraEnabled, setCameraEnabledState] = useState(initialCameraEnabled);
  const [micEnabled, setMicEnabledState] = useState(initialMicEnabled);
  const [mediaControlsBusy, setMediaControlsBusy] = useState(false);
  const [cameraPermissionState, setCameraPermissionState] = useState<MediaPermissionState>("undetermined");
  const [microphonePermissionState, setMicrophonePermissionState] = useState<MediaPermissionState>("undetermined");
  const [cameraPermissionMessage, setCameraPermissionMessage] = useState<string | null>(null);
  const [microphonePermissionMessage, setMicrophonePermissionMessage] = useState<string | null>(null);
  const [mediaReconciliationMessage, setMediaReconciliationMessage] = useState<string | null>(null);
  const [mediaReconciliationState, setMediaReconciliationState] = useState<MediaReconciliationState>("clear");
  const [speakerEnabled, setSpeakerEnabledState] = useState(inviteCallType === "video");
  const [participants, setParticipants] = useState<CommunicationParticipantView[]>([]);
  const [firstMediaState, setFirstMediaState] = useState<ChatCallFirstMediaState>(EMPTY_FIRST_MEDIA_STATE);
  const mediaPermissionMessage = useMemo(() => (
    [cameraPermissionMessage, microphonePermissionMessage].filter(Boolean).join(" ") || null
  ), [cameraPermissionMessage, microphonePermissionMessage]);

  useLayoutEffect(() => {
    const current = committedSessionRef.current;
    const communicationRoomId = normalizeRoomId(inviteCommunicationRoomId);
    const sameCandidate = !!current
      && current.sessionKey === sessionKey
      && current.inviteId === inviteId
      && current.communicationRoomId === communicationRoomId
      && current.normalizedRoomId === normalizedRoomId
      && current.participantAuthority === participantAuthority
      && current.mediaProvider === inviteProvider
      && current.callType === inviteCallType;
    if (sameCandidate) return;
    const generation = sessionGenerationRef.current + 1;
    sessionGenerationRef.current = generation;
    committedSessionRef.current = Object.freeze({
      callType: inviteCallType,
      communicationRoomId,
      generation,
      inviteId,
      liveKitRoom: null,
      mediaProvider: inviteProvider,
      normalizedRoomId,
      participantAuthority,
      roomState: sessionKey ? "pending" : "terminal",
      sessionKey,
      userId: "",
    });
    const mediaOwner = mediaControlOwnerRef.current;
    if (mediaOwner && mediaOwner.generation !== generation) {
      mediaControlRef.current = null;
      mediaControlOwnerRef.current = null;
      setMediaControlsBusy(false);
    }
    const pendingMicOwner = pendingMicOwnerRef.current;
    if (pendingMicOwner && pendingMicOwner.generation !== generation) {
      pendingMicOwnerRef.current = null;
      pendingMicToggleRef.current = false;
    }
  }, [
    inviteCallType,
    inviteCommunicationRoomId,
    inviteId,
    inviteProvider,
    normalizedRoomId,
    participantAuthority,
    sessionKey,
  ]);

  useEffect(() => {
    onRoomEndedRef.current = onRoomEnded;
  }, [onRoomEnded]);

  const telemetryBinding = useMemo(() => ({
    callInviteId: inviteId,
    communicationRoomId: normalizedRoomId,
    threadId,
  }), [inviteId, normalizedRoomId, threadId]);

  const emitStage = useCallback((
    stage: Parameters<typeof emitChatCallLiveKitStage>[0],
    options: Parameters<typeof emitChatCallLiveKitStage>[2] = {},
  ) => emitChatCallLiveKitStage(stage, telemetryBinding, {
    durationMs: Date.now() - telemetryStartedAtRef.current,
    ...options,
  }), [telemetryBinding]);

  const updateFirstMediaState = useCallback((updates: Partial<ChatCallFirstMediaState>) => {
    setFirstMediaState((current) => ({ ...current, ...updates }));
  }, []);

  const setReconciliationWarning = useCallback((message = "Microphone state could not be synchronized. The call remains connected.") => {
    setMediaReconciliationState("warning");
    setMediaReconciliationMessage(message);
  }, []);

  const clearReconciliationWarning = useCallback(() => {
    setMediaReconciliationState("clear");
    setMediaReconciliationMessage(null);
  }, []);

  const setConfirmedPermissionDenied = useCallback((kind: "camera" | "microphone") => {
    if (kind === "camera") {
      setCameraPermissionState("denied");
      setCameraPermissionMessage("Camera access is off. Open Settings, allow access for Chi'llywood, then return to the call.");
      return;
    }
    setMicrophonePermissionState("denied");
    setMicrophonePermissionMessage("Microphone access is off. Open Settings, allow access for Chi'llywood, then return to the call.");
  }, []);

  const isCommittedSessionCurrent = useCallback((binding: CommittedSession | null) => {
    const current = committedSessionRef.current;
    if (
      !binding
      || !sameCommittedAuthority(current, binding)
      || !binding.liveKitRoom
      || !binding.userId
      || (current?.roomState !== "active" && current?.roomState !== "reconnecting")
      || roomRef.current !== binding.liveKitRoom
      || identityRef.current?.userId !== binding.userId
      || normalizeRoomId(productRoomRef.current?.roomId) !== binding.normalizedRoomId
      || productRoomRef.current?.status !== "active"
    ) return false;
    return binding.liveKitRoom.state === ConnectionState.Connected
      || binding.liveKitRoom.state === ConnectionState.Reconnecting;
  }, []);

  const activateCommittedSession = useCallback((options: {
    identity: CommunicationIdentity;
    liveKitRoom: Room;
    productRoom: CommunicationRoomState;
    roomState: "active" | "reconnecting";
  }) => {
    const current = committedSessionRef.current;
    if (
      !current
      || current.sessionKey !== sessionKey
      || current.inviteId !== inviteId
      || current.communicationRoomId !== normalizeRoomId(inviteCommunicationRoomId)
      || current.normalizedRoomId !== normalizedRoomId
      || current.participantAuthority !== participantAuthority
      || current.mediaProvider !== inviteProvider
      || current.callType !== inviteCallType
      || normalizeRoomId(options.productRoom.roomId) !== normalizedRoomId
      || options.productRoom.status !== "active"
      || !options.identity.userId
    ) return null;
    const committed = Object.freeze({
      ...current,
      liveKitRoom: options.liveKitRoom,
      roomState: options.roomState,
      userId: options.identity.userId,
    });
    if (current.liveKitRoom && current.liveKitRoom !== options.liveKitRoom) {
      if (mediaControlOwnerRef.current?.liveKitRoom === current.liveKitRoom) {
        mediaControlRef.current = null;
        mediaControlOwnerRef.current = null;
        setMediaControlsBusy(false);
      }
      if (pendingMicOwnerRef.current?.liveKitRoom === current.liveKitRoom) {
        pendingMicOwnerRef.current = null;
        pendingMicToggleRef.current = false;
      }
    }
    committedSessionRef.current = committed;
    return committed;
  }, [
    inviteCallType,
    inviteCommunicationRoomId,
    inviteId,
    inviteProvider,
    normalizedRoomId,
    participantAuthority,
    sessionKey,
  ]);

  const setCommittedRoomState = useCallback((binding: CommittedSession | null, roomState: CommittedRoomState) => {
    const current = committedSessionRef.current;
    if (!binding || !sameCommittedAuthority(current, binding)) return false;
    committedSessionRef.current = Object.freeze({ ...current, roomState });
    return true;
  }, []);

  const enqueueSessionMediaWrite = useCallback(async <T,>(
    binding: CommittedSession,
    operation: () => Promise<T>,
  ): Promise<T | null> => {
    const liveKitRoom = binding.liveKitRoom;
    if (!liveKitRoom) return null;
    const predecessor = mediaWriteTailsRef.current.get(liveKitRoom)?.catch(() => undefined)
      ?? Promise.resolve();
    const pending = predecessor.then(async () => {
      if (!isCommittedSessionCurrent(binding)) return null;
      return operation();
    });
    mediaWriteTailsRef.current.set(liveKitRoom, pending.then(() => undefined, () => undefined));
    try {
      return await pending;
    } catch {
      return null;
    }
  }, [isCommittedSessionCurrent]);

  const refreshParticipantViews = useCallback(() => {
    const liveKitRoom = roomRef.current;
    const currentIdentity = identityRef.current;
    const productRoom = productRoomRef.current;
    if (!liveKitRoom || !currentIdentity || !productRoom) {
      setParticipants([]);
      return;
    }

    const activeMemberships = getActiveCommunicationMemberships(membershipsRef.current);
    const membershipByUserId = new Map(
      activeMemberships.map((membership) => [membership.userId, membership]),
    );
    const connectedParticipants: Participant[] = [
      liveKitRoom.localParticipant,
      ...Array.from(liveKitRoom.remoteParticipants.values()),
    ];
    const views = connectedParticipants
      .map<CommunicationParticipantView>((participant) => {
        const participantIdentity = String(participant.identity ?? "").trim();
        const isSelf = participant === liveKitRoom.localParticipant;
        const resolvedIdentity = isSelf ? currentIdentity.userId : participantIdentity;
        const membership = membershipByUserId.get(resolvedIdentity);
        const cameraPublication = participant.getTrackPublication(Track.Source.Camera);
        const microphonePublication = participant.getTrackPublication(Track.Source.Microphone);
        const liveKitVideoTrackReference = publicationIsUsable(cameraPublication)
          ? {
            participant,
            publication: cameraPublication as TrackPublication,
            source: Track.Source.Camera,
          }
          : undefined;

        return {
          userId: resolvedIdentity,
          displayName: isSelf
            ? currentIdentity.displayName
            : membership?.displayName || String(participant.name ?? "").trim() || "Call participant",
          avatarUrl: isSelf ? currentIdentity.avatarUrl : membership?.avatarUrl,
          cameraOn: publicationIsUsable(cameraPublication),
          micOn: publicationIsUsable(microphonePublication),
          joinedAt: membership?.joinedAt ?? new Date().toISOString(),
          isHost: resolvedIdentity === productRoom.hostUserId,
          isSelf,
          liveKitVideoTrackReference,
          mediaProvider: "livekit",
          connectionState: liveKitRoom.state === ConnectionState.Connected
            ? "connected"
            : liveKitRoom.state === ConnectionState.Disconnected
              ? "disconnected"
              : "connecting",
        };
      })
      .filter((participant) => !!participant.userId)
      .sort((left, right) => {
        if (left.isSelf !== right.isSelf) return left.isSelf ? -1 : 1;
        if (left.isHost !== right.isHost) return left.isHost ? -1 : 1;
        return left.userId.localeCompare(right.userId);
      });
    setParticipants(views);
  }, []);

  const runMediaControl = useCallback(async <T,>(
    operation: (owner: MediaControlOwner) => Promise<T>,
    binding?: CommittedSession | null,
  ): Promise<T | null> => {
    if (mediaControlRef.current) return null;
    const activeBinding = binding ?? committedSessionRef.current;
    if (!activeBinding || !isCommittedSessionCurrent(activeBinding)) return null;
    const owner = {
      generation: activeBinding.generation,
      liveKitRoom: activeBinding.liveKitRoom,
      sessionKey: activeBinding.sessionKey,
      token: Symbol("media-control"),
    };
    setMediaControlsBusy(true);
    const pending = operation(owner);
    mediaControlRef.current = pending;
    mediaControlOwnerRef.current = owner;
    try {
      return await pending;
    } finally {
      if (
        mediaControlOwnerRef.current?.token === owner.token
        && mediaControlOwnerRef.current.liveKitRoom === owner.liveKitRoom
        && mediaControlOwnerRef.current.sessionKey === owner.sessionKey
        && mediaControlOwnerRef.current.generation === owner.generation
      ) {
        mediaControlRef.current = null;
        mediaControlOwnerRef.current = null;
        setMediaControlsBusy(false);
      }
    }
  }, [isCommittedSessionCurrent]);

  const readCurrentMembershipMediaState = useCallback(async (
    binding?: CommittedSession | null,
  ) => {
    const activeBinding = binding ?? committedSessionRef.current;
    if (!activeBinding || !isCommittedSessionCurrent(activeBinding)) return null;
    const roomId = activeBinding.normalizedRoomId;
    const userId = activeBinding.userId;
    const snapshot = await getCommunicationRoomSnapshot(roomId).catch(() => null);
    if (
      !isCommittedSessionCurrent(activeBinding)
      || !snapshot
      || normalizeRoomId(snapshot.room.roomId) !== roomId
      || snapshot.room.status !== "active"
    ) return null;
    const membership = snapshot.memberships.find((entry) => (
      entry.roomId === roomId
      && entry.userId === userId
      && !entry.leftAt
      && (entry.membershipState === "active" || entry.membershipState === "reconnecting")
    )) ?? null;
    if (!membership || !isCommittedSessionCurrent(activeBinding)) return null;
    membershipsRef.current = [
      ...snapshot.memberships.filter((entry) => entry.userId !== membership.userId),
      membership,
    ];
    return membership;
  }, [isCommittedSessionCurrent]);

  const performMembershipMediaWrite = useCallback(async (
    cameraOn: boolean,
    micOn: boolean,
    membershipState: "active" | "reconnecting" = "active",
    strict = false,
    binding?: CommittedSession | null,
  ) => {
    const activeBinding = binding ?? committedSessionRef.current;
    const currentIdentity = identityRef.current;
    if (!activeBinding || !currentIdentity || !isCommittedSessionCurrent(activeBinding)) return null;
    const roomId = activeBinding.normalizedRoomId;
    const userId = activeBinding.userId;
    const isExact = (candidate: CommunicationRoomMembership | null | undefined) => {
      return !!candidate
        && candidate.roomId === roomId
        && candidate.userId === userId
        && candidate.cameraEnabled === cameraOn
        && candidate.micEnabled === micOn
        && !candidate.leftAt
        && (candidate.membershipState === "active" || candidate.membershipState === "reconnecting");
    };
    let membership = await touchCommunicationRoomSession({
      roomId,
      userId,
      membershipState,
      cameraEnabled: cameraOn,
      micEnabled: micOn,
      displayName: currentIdentity.displayName,
      avatarUrl: currentIdentity.avatarUrl,
    }).catch(() => null);
    if (!isCommittedSessionCurrent(activeBinding)) return null;
    if (strict && !isExact(membership)) {
      const observed = await readCurrentMembershipMediaState(activeBinding);
      membership = isExact(observed) ? observed : null;
    }
    if (!membership || !isCommittedSessionCurrent(activeBinding) || (strict && !isExact(membership))) return null;
    membershipsRef.current = [
      ...membershipsRef.current.filter((entry) => entry.userId !== membership.userId),
      membership,
    ];
    return membership;
  }, [isCommittedSessionCurrent, readCurrentMembershipMediaState]);

  const reconcileLatestCommittedMedia = useCallback(async (
    binding: CommittedSession,
    reconcileNative: boolean,
  ) => {
    if (!isCommittedSessionCurrent(binding) || !binding.liveKitRoom) return false;
    const bindingStillCurrent = sameCommittedAuthority(committedSessionRef.current, binding);
    const liveKitRoom = binding.liveKitRoom ?? (bindingStillCurrent ? roomRef.current : null);
    const appActive = appStateRef.current === "active";
    const cameraTarget = cameraRequestedRef.current && appActive;
    const microphoneTarget = micRequestedRef.current && (appActive || allowBackgroundAudio);
    const membershipState = appActive || allowBackgroundAudio ? "active" : "reconnecting";
    setMediaReconciliationState("recovering");

    if (reconcileNative) {
      try {
        if (microphoneTarget) await LiveKitAudioSession.startAudioSession();
        await liveKitRoom.localParticipant.setMicrophoneEnabled(microphoneTarget);
      } catch (microphoneError) {
        if (!isCommittedSessionCurrent(binding)) return false;
        if (isConfirmedNativePermissionDenial(microphoneError)) {
          setConfirmedPermissionDenied("microphone");
        } else {
          setReconciliationWarning("Local media could not be reconciled. The call remains connected.");
        }
        reportRuntimeError("chat-call-livekit-media-reconciliation", microphoneError);
        return false;
      }
      if (!isCommittedSessionCurrent(binding)) return false;
      try {
        await liveKitRoom.localParticipant.setCameraEnabled(cameraTarget, LIVE_VIDEO_CAPTURE_OPTIONS);
      } catch (cameraError) {
        if (!isCommittedSessionCurrent(binding)) return false;
        if (isConfirmedNativePermissionDenial(cameraError)) {
          setConfirmedPermissionDenied("camera");
        } else {
          setReconciliationWarning("Local media could not be reconciled. The call remains connected.");
        }
        reportRuntimeError("chat-call-livekit-media-reconciliation", cameraError);
        return false;
      }
      if (!isCommittedSessionCurrent(binding)) return false;
      const nativeMicrophoneExact = publicationIsUsable(
        liveKitRoom.localParticipant.getTrackPublication(Track.Source.Microphone),
      ) === microphoneTarget;
      const nativeCameraExact = publicationIsUsable(
        liveKitRoom.localParticipant.getTrackPublication(Track.Source.Camera),
      ) === cameraTarget;
      if (!nativeMicrophoneExact || !nativeCameraExact) {
        setReconciliationWarning("Local media could not be reconciled. The call remains connected.");
        return false;
      }
      setMicEnabledState(microphoneTarget);
      setCameraEnabledState(cameraTarget);
      if (microphoneTarget) setMicrophonePermissionState("granted");
      if (cameraTarget) setCameraPermissionState("granted");
    }

    const membership = await performMembershipMediaWrite(
      cameraTarget,
      microphoneTarget,
      membershipState,
      true,
      binding,
    );
    if (!membership || !isCommittedSessionCurrent(binding)) {
      setReconciliationWarning();
      return false;
    }
    clearReconciliationWarning();
    return true;
  }, [
    allowBackgroundAudio,
    clearReconciliationWarning,
    isCommittedSessionCurrent,
    performMembershipMediaWrite,
    setConfirmedPermissionDenied,
    setReconciliationWarning,
  ]);

  const scheduleLatestMediaReconciliation = useCallback((reconcileNative = false) => {
    const binding = committedSessionRef.current;
    if (!binding || !isCommittedSessionCurrent(binding)) return Promise.resolve(false);
    const existing = deferredMediaReconciliationRef.current;
    if (existing && sameCommittedAuthority(existing.binding, binding)) {
      existing.reconcileNative = existing.reconcileNative || reconcileNative;
      return existing.promise;
    }
    const request = {
      binding,
      promise: Promise.resolve(false),
      reconcileNative,
    };
    request.promise = enqueueSessionMediaWrite(binding, async () => {
      if (deferredMediaReconciliationRef.current === request) {
        deferredMediaReconciliationRef.current = null;
      }
      return reconcileLatestCommittedMedia(binding, request.reconcileNative);
    }).then((result) => result === true);
    deferredMediaReconciliationRef.current = request;
    void request.promise.finally(() => {
      if (deferredMediaReconciliationRef.current === request) {
        deferredMediaReconciliationRef.current = null;
      }
    });
    return request.promise;
  }, [enqueueSessionMediaWrite, isCommittedSessionCurrent, reconcileLatestCommittedMedia]);

  const setSpeaker = useCallback(async (nextSpeakerEnabled: boolean) => {
    const audioSessionReady = await LiveKitAudioSession.startAudioSession()
      .then(() => true)
      .catch(() => false);
    if (!audioSessionReady) return false;
    for (const output of getAudioOutputCandidates(nextSpeakerEnabled)) {
      const selected = await selectLiveKitAudioOutput(output).catch(() => false);
      if (selected) {
        speakerRequestedRef.current = nextSpeakerEnabled;
        setSpeakerEnabledState(nextSpeakerEnabled);
        return true;
      }
    }
    return false;
  }, []);

  const setMicrophoneEnabled = useCallback(async (nextEnabled: boolean) => {
    const binding = committedSessionRef.current;
    if (!binding || !isCommittedSessionCurrent(binding)) return false;
    const result = await runMediaControl((leaseBinding) => enqueueSessionMediaWrite(binding, async () => {
      try {
        const liveKitRoom = binding.liveKitRoom;
        if (!liveKitRoom || liveKitRoom.state !== ConnectionState.Connected) return false;
        if (nextEnabled) {
          const audioSessionReady = await LiveKitAudioSession.startAudioSession()
            .then(() => true)
            .catch(() => false);
          if (!audioSessionReady) return false;
        }
        if (channelState !== "live" && channelState !== "reconnecting") return false;
        const originStillCurrent = () => isCommittedSessionCurrent(binding);
        if (!originStillCurrent()) return false;

        const priorRequested = micRequestedRef.current;
        const priorUi = micEnabled;
        const priorCameraRequested = cameraRequestedRef.current;
        const priorCameraUi = cameraEnabled;
        const priorActual = publicationIsUsable(
          liveKitRoom.localParticipant.getTrackPublication(Track.Source.Microphone),
        );
        const priorCameraActual = publicationIsUsable(
          liveKitRoom.localParticipant.getTrackPublication(Track.Source.Camera),
        );
        const priorDurable = await readCurrentMembershipMediaState(binding);
        if (!originStillCurrent()) return false;
        const priorConverged = !!priorDurable
          && normalizeRoomId(priorDurable.roomId) === binding.normalizedRoomId
          && priorDurable.userId === binding.userId
          && !priorDurable.leftAt
          && (priorDurable.membershipState === "active" || priorDurable.membershipState === "reconnecting")
          && priorDurable.micEnabled === priorActual
          && priorActual === priorRequested
          && priorRequested === priorUi
          && priorDurable.cameraEnabled === priorCameraActual
          && priorCameraActual === priorCameraRequested
          && priorCameraRequested === priorCameraUi;
        if (!priorConverged) {
          setReconciliationWarning();
          if (micReconciliationBlockedRef.current) {
            reportRuntimeError(
              "chat-call-livekit-microphone-membership-reconciliation",
              new Error("microphone_reconciliation_still_unprovable"),
            );
          }
          return false;
        }
        micReconciliationBlockedRef.current = false;
        if (!originStillCurrent()) return false;
        pendingMicToggleRef.current = true;
        pendingMicOwnerRef.current = leaseBinding;

        let publication: TrackPublication | undefined;
        let forwardError: unknown = null;
        try {
          publication = await liveKitRoom.localParticipant.setMicrophoneEnabled(nextEnabled);
        } catch (errorValue) {
          forwardError = errorValue;
        }
        const targetActual = publicationIsUsable(
          liveKitRoom.localParticipant.getTrackPublication(Track.Source.Microphone),
        );
        if (!originStillCurrent()) {
          await liveKitRoom.localParticipant.setMicrophoneEnabled(priorActual).catch(() => undefined);
          return false;
        }
        const nativeTargetConfirmed = !forwardError
          && targetActual === nextEnabled
          && (!nextEnabled || !!publication)
          && publicationIsUsable(
            liveKitRoom.localParticipant.getTrackPublication(Track.Source.Camera),
          ) === priorCameraActual;
        if (!nativeTargetConfirmed) {
          let nativeRestored = targetActual === priorActual;
          if (!nativeRestored) {
            await liveKitRoom.localParticipant.setMicrophoneEnabled(priorActual).catch(() => undefined);
            if (!originStillCurrent()) return false;
            nativeRestored = publicationIsUsable(
              liveKitRoom.localParticipant.getTrackPublication(Track.Source.Microphone),
            ) === priorActual;
          }
          const cameraUnchanged = publicationIsUsable(
            liveKitRoom.localParticipant.getTrackPublication(Track.Source.Camera),
          ) === priorCameraActual;
          if (!nativeRestored || !cameraUnchanged) micReconciliationBlockedRef.current = true;
          if (forwardError && isConfirmedNativePermissionDenial(forwardError)) {
            setConfirmedPermissionDenied("microphone");
          } else {
            setReconciliationWarning();
          }
          reportRuntimeError(
            "chat-call-livekit-microphone-membership-reconciliation",
            forwardError ?? new Error(nativeRestored ? "microphone_target_unconfirmed" : "microphone_compensation_unprovable"),
          );
          refreshParticipantViews();
          return false;
        }

        if (!originStillCurrent()) {
          await liveKitRoom.localParticipant.setMicrophoneEnabled(priorActual).catch(() => undefined);
          const restored = publicationIsUsable(
            liveKitRoom.localParticipant.getTrackPublication(Track.Source.Microphone),
          ) === priorActual;
          if (!restored) micReconciliationBlockedRef.current = true;
          return false;
        }

        const membership = await performMembershipMediaWrite(
          priorCameraRequested,
          nextEnabled,
          priorDurable.membershipState === "reconnecting" ? "reconnecting" : "active",
          true,
          binding,
        );
        const targetCameraUnchanged = publicationIsUsable(
          liveKitRoom.localParticipant.getTrackPublication(Track.Source.Camera),
        ) === priorCameraActual;
        const targetCallValid = liveKitRoom.state === ConnectionState.Connected
          || liveKitRoom.state === ConnectionState.Reconnecting;
        if (!originStillCurrent()) {
          await liveKitRoom.localParticipant.setMicrophoneEnabled(priorActual).catch(() => undefined);
          return false;
        }
        if (!membership || !targetCameraUnchanged || !targetCallValid) {
          await liveKitRoom.localParticipant.setMicrophoneEnabled(priorActual).catch(() => undefined);
          if (!originStillCurrent()) return false;
          const nativeRestored = publicationIsUsable(
            liveKitRoom.localParticipant.getTrackPublication(Track.Source.Microphone),
          ) === priorActual;
          const durableRestored = await performMembershipMediaWrite(
            priorDurable.cameraEnabled,
            priorDurable.micEnabled,
            priorDurable.membershipState === "reconnecting" ? "reconnecting" : "active",
            true,
            binding,
          );
          if (!originStillCurrent()) return false;
          const cameraUnchanged = publicationIsUsable(
            liveKitRoom.localParticipant.getTrackPublication(Track.Source.Camera),
          ) === priorCameraActual;
          const compensationProved = nativeRestored
            && !!durableRestored
            && durableRestored.roomId === priorDurable.roomId
            && durableRestored.userId === priorDurable.userId
            && durableRestored.micEnabled === priorDurable.micEnabled
            && durableRestored.cameraEnabled === priorDurable.cameraEnabled
            && cameraUnchanged
            && (liveKitRoom.state === ConnectionState.Connected
              || liveKitRoom.state === ConnectionState.Reconnecting);
          micReconciliationBlockedRef.current = !compensationProved;
          setReconciliationWarning();
          if (!compensationProved) {
            reportRuntimeError(
              "chat-call-livekit-microphone-membership-reconciliation",
              new Error("microphone_compensation_unprovable"),
            );
          }
          refreshParticipantViews();
          return false;
        }

        const leaseStillOwned = () => (
          mediaControlOwnerRef.current?.sessionKey === leaseBinding.sessionKey
          && mediaControlOwnerRef.current.liveKitRoom === leaseBinding.liveKitRoom
          && mediaControlOwnerRef.current.generation === leaseBinding.generation
          && mediaControlOwnerRef.current.token === leaseBinding.token
        );
        const commitConfirmedMicrophoneTarget = () => {
          if (!originStillCurrent() || !leaseStillOwned()) return false;
          micRequestedRef.current = nextEnabled;
          setMicEnabledState(nextEnabled);
          setMicrophonePermissionState("granted");
          setMicrophonePermissionMessage(null);
          clearReconciliationWarning();
          refreshParticipantViews();
          if (nextEnabled) {
            emitStage("local_audio_published", { connectionState: String(liveKitRoom.state) });
            updateFirstMediaState({ localAudioPublished: true });
          }
          return true;
        };
        if (!commitConfirmedMicrophoneTarget()) {
          await liveKitRoom.localParticipant.setMicrophoneEnabled(priorActual).catch(() => undefined);
          return false;
        }
        return true;
      } finally {
        if (
          pendingMicOwnerRef.current?.sessionKey === leaseBinding.sessionKey
          && pendingMicOwnerRef.current.liveKitRoom === leaseBinding.liveKitRoom
          && pendingMicOwnerRef.current.generation === leaseBinding.generation
          && pendingMicOwnerRef.current.token === leaseBinding.token
        ) {
          pendingMicOwnerRef.current = null;
          pendingMicToggleRef.current = false;
        }
      }
    }), binding);
    return result === true;
  }, [
    cameraEnabled,
    channelState,
    clearReconciliationWarning,
    emitStage,
    enqueueSessionMediaWrite,
    isCommittedSessionCurrent,
    micEnabled,
    performMembershipMediaWrite,
    readCurrentMembershipMediaState,
    refreshParticipantViews,
    runMediaControl,
    setConfirmedPermissionDenied,
    setReconciliationWarning,
    updateFirstMediaState,
  ]);

  const setCameraEnabled = useCallback(async (nextEnabled: boolean) => {
    const binding = committedSessionRef.current;
    if (!binding || !isCommittedSessionCurrent(binding)) return false;
    const result = await runMediaControl(() => enqueueSessionMediaWrite(binding, async () => {
      const liveKitRoom = binding.liveKitRoom;
      if (!liveKitRoom || !isCommittedSessionCurrent(binding)) return false;
      const priorRequested = cameraRequestedRef.current;
      const priorUi = cameraEnabled;
      const priorActual = publicationIsUsable(
        liveKitRoom.localParticipant.getTrackPublication(Track.Source.Camera),
      );
      const priorDurable = await readCurrentMembershipMediaState(binding);
      if (
        !priorDurable
        || !isCommittedSessionCurrent(binding)
        || priorDurable.cameraEnabled !== priorRequested
        || priorRequested !== priorUi
        || priorActual !== priorRequested
      ) {
        setReconciliationWarning("Camera state could not be synchronized. The call remains connected.");
        return false;
      }
      let publication: TrackPublication | undefined;
      let forwardError: unknown = null;
      try {
        publication = await liveKitRoom.localParticipant.setCameraEnabled(
          nextEnabled,
          LIVE_VIDEO_CAPTURE_OPTIONS,
        );
      } catch (cameraError) {
        forwardError = cameraError;
      }
      if (!isCommittedSessionCurrent(binding)) {
        await liveKitRoom.localParticipant.setCameraEnabled(
          priorActual,
          LIVE_VIDEO_CAPTURE_OPTIONS,
        ).catch(() => undefined);
        return false;
      }
      const nativeTarget = publicationIsUsable(
        liveKitRoom.localParticipant.getTrackPublication(Track.Source.Camera),
      );
      if (forwardError || nativeTarget !== nextEnabled || (nextEnabled && !publication)) {
        await liveKitRoom.localParticipant.setCameraEnabled(
          priorActual,
          LIVE_VIDEO_CAPTURE_OPTIONS,
        ).catch(() => undefined);
        if (forwardError && isConfirmedNativePermissionDenial(forwardError)) {
          setConfirmedPermissionDenied("camera");
        } else {
          setReconciliationWarning("Camera state could not be synchronized. The call remains connected.");
        }
        if (forwardError) reportRuntimeError("chat-call-livekit-camera", forwardError);
        return false;
      }
      const membership = await performMembershipMediaWrite(
        nextEnabled,
        micRequestedRef.current,
        priorDurable.membershipState === "reconnecting" ? "reconnecting" : "active",
        true,
        binding,
      );
      if (!membership || !isCommittedSessionCurrent(binding)) {
        await liveKitRoom.localParticipant.setCameraEnabled(
          priorActual,
          LIVE_VIDEO_CAPTURE_OPTIONS,
        ).catch(() => undefined);
        if (isCommittedSessionCurrent(binding)) {
          await performMembershipMediaWrite(
            priorDurable.cameraEnabled,
            priorDurable.micEnabled,
            priorDurable.membershipState === "reconnecting" ? "reconnecting" : "active",
            true,
            binding,
          );
          setReconciliationWarning("Camera state could not be synchronized. The call remains connected.");
        }
        return false;
      }
      cameraRequestedRef.current = nextEnabled;
      setCameraEnabledState(nextEnabled);
      setCameraPermissionState("granted");
      setCameraPermissionMessage(null);
      clearReconciliationWarning();
      refreshParticipantViews();
      if (nextEnabled) {
        emitStage("local_video_published", { connectionState: String(liveKitRoom.state) });
        updateFirstMediaState({ localVideoPublished: true });
        await setSpeaker(speakerRequestedRef.current);
      }
      return true;
    }), binding);
    return result === true;
  }, [
    cameraEnabled,
    clearReconciliationWarning,
    emitStage,
    enqueueSessionMediaWrite,
    isCommittedSessionCurrent,
    performMembershipMediaWrite,
    readCurrentMembershipMediaState,
    refreshParticipantViews,
    runMediaControl,
    setConfirmedPermissionDenied,
    setReconciliationWarning,
    setSpeaker,
    updateFirstMediaState,
  ]);

  const toggleCamera = useCallback(async () => {
    try {
      const updated = await setCameraEnabled(!cameraRequestedRef.current);
      return updated;
    } catch (mediaError) {
      if (isConfirmedNativePermissionDenial(mediaError)) setConfirmedPermissionDenied("camera");
      else setReconciliationWarning("Camera state could not be synchronized. The call remains connected.");
      reportRuntimeError("chat-call-livekit-camera", mediaError);
      return false;
    }
  }, [setCameraEnabled, setConfirmedPermissionDenied, setReconciliationWarning]);

  const switchCamera = useCallback(async () => {
    const result = await runMediaControl(async () => {
      const liveKitRoom = roomRef.current;
      const publication = liveKitRoom?.localParticipant.getTrackPublication(Track.Source.Camera);
      const localVideoTrack = publication?.track as {
        mediaStreamTrack?: {
          _switchCamera?: () => void;
          applyConstraints?: (constraints: Record<string, unknown>) => Promise<void>;
        };
      } | undefined;
      const mediaStreamTrack = localVideoTrack?.mediaStreamTrack;
      if (!mediaStreamTrack || !cameraRequestedRef.current) return false;
      if (typeof mediaStreamTrack._switchCamera === "function") {
        mediaStreamTrack._switchCamera();
        cameraFacingRef.current = cameraFacingRef.current === "user" ? "environment" : "user";
        return true;
      }
      if (typeof mediaStreamTrack.applyConstraints === "function") {
        const nextFacing = cameraFacingRef.current === "user" ? "environment" : "user";
        await mediaStreamTrack.applyConstraints({
          facingMode: { ideal: nextFacing },
        });
        cameraFacingRef.current = nextFacing;
        return true;
      }
      return false;
    });
    return result === true;
  }, [runMediaControl]);

  const openMediaSettings = useCallback(async () => {
    if (cameraPermissionState !== "denied" && microphonePermissionState !== "denied") return;
    await Linking.openSettings().catch((settingsError) => {
      reportRuntimeError("chat-call-livekit-open-settings", settingsError);
    });
  }, [cameraPermissionState, microphonePermissionState]);

  const cleanupSession = useCallback(async (options: {
    endRoomIfHost?: boolean;
    leaveMembership?: boolean;
  } = {}, bindingOverride?: CommittedSession | null, cleanupToken?: symbol) => {
    const binding = bindingOverride ?? committedSessionRef.current;
    if (!binding) return;
    const cleanupOwner: object | symbol = cleanupToken ?? binding.liveKitRoom ?? binding;
    if (
      endingCleanupOwnersRef.current.has(cleanupOwner)
      || cleanupCompletedOwnersRef.current.has(cleanupOwner)
    ) return;
    endingCleanupOwnersRef.current.add(cleanupOwner);
    setCommittedRoomState(binding, "terminal");
    manualDisconnectRef.current = true;
    const liveKitRoom = binding.liveKitRoom;
    const productRoom = normalizeRoomId(productRoomRef.current?.roomId) === binding.normalizedRoomId
      ? productRoomRef.current
      : null;
    const currentIdentity = binding.userId
      ? (identityRef.current?.userId === binding.userId ? identityRef.current : null)
      : (bindingStillCurrent ? identityRef.current : null);
    try {
      if (liveKitRoom) {
        await Promise.allSettled([
          liveKitRoom.localParticipant.setCameraEnabled(false),
          liveKitRoom.localParticipant.setMicrophoneEnabled(false),
        ]);
        await liveKitRoom.disconnect().catch(() => undefined);
      }
      if (
        roomRef.current === liveKitRoom
        || sameCommittedAuthority(committedSessionRef.current, binding)
      ) {
        await LiveKitAudioSession.stopAudioSession().catch(() => undefined);
        if (ownsIosAudioConfigurationRef.current) {
          await resetLiveKitIosAudioSession().catch(() => undefined);
          ownsIosAudioConfigurationRef.current = false;
        }
      }
      if (productRoom && currentIdentity && options.endRoomIfHost && productRoom.hostUserId === currentIdentity.userId) {
        await endCommunicationRoom(productRoom.roomId).catch(() => undefined);
      }
      if (productRoom && currentIdentity && options.leaveMembership !== false) {
        await leaveCommunicationRoomSession({
          roomId: productRoom.roomId,
          userId: currentIdentity.userId,
        }).catch(() => null);
      }
      if (tokenValidatedRef.current) {
        emitStage("disconnected", { connectionState: "disconnected" });
        emitStage("cleanup_complete", { connectionState: "disconnected" });
      }
      cleanupCompletedOwnersRef.current.add(cleanupOwner);
      if (
        roomRef.current === liveKitRoom
        && sameCommittedAuthority(committedSessionRef.current, binding)
      ) {
        roomRef.current = null;
        setParticipants([]);
        setCameraEnabledState(false);
        setMicEnabledState(false);
        setLoading(false);
        setChannelState("idle");
      }
    } finally {
      endingCleanupOwnersRef.current.delete(cleanupOwner);
    }
  }, [emitStage, setCommittedRoomState]);

  const leaveRoom = useCallback(async (options?: { endRoomIfHost?: boolean }) => {
    await cleanupSession({
      endRoomIfHost: options?.endRoomIfHost,
      leaveMembership: true,
    });
  }, [cleanupSession]);

  const markInstalledUiConnected = useCallback(() => {
    if (installedUiConnectedRef.current || channelState !== "live") return;
    installedUiConnectedRef.current = true;
    emitStage("installed_ui_connected", {
      connectionState: "connected",
      shouldRenderSurface: true,
    });
  }, [channelState, emitStage]);

  const markParticipantVideoRendered = useCallback((participant: CommunicationParticipantView) => {
    if (
      participant.mediaProvider !== "livekit"
      || participant.isSelf
      || !participant.liveKitVideoTrackReference
      || firstVideoRef.current
    ) return;
    firstVideoRef.current = true;
    setFirstMediaState((current) => ({ ...current, firstVideo: true }));
    emitStage("first_video", {
      connectionState: String(roomRef.current?.state ?? ""),
      shouldRenderSurface: true,
    });
  }, [emitStage]);

  useEffect(() => {
    if (!sessionKey || inviteStatus !== "accepted" || inviteProvider !== "livekit" || !inviteCallType) {
      setLoading(false);
      setChannelState("idle");
      return undefined;
    }

    let active = true;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let effectBinding = committedSessionRef.current;
    const cleanupToken = Symbol("livekit-session-effect");
    telemetryStartedAtRef.current = Date.now();
    installedUiConnectedRef.current = false;
    firstAudioRef.current = false;
    firstVideoRef.current = false;
    tokenValidatedRef.current = false;
    cameraFacingRef.current = "user";
    speakerRequestedRef.current = inviteCallType === "video";
    manualDisconnectRef.current = false;
    cameraRequestedRef.current = initialCameraEnabled;
    micRequestedRef.current = initialMicEnabled;
    setFirstMediaState(EMPTY_FIRST_MEDIA_STATE);
    setCameraEnabledState(initialCameraEnabled);
    setMicEnabledState(initialMicEnabled);
    setCameraPermissionState("undetermined");
    setMicrophonePermissionState("undetermined");
    setCameraPermissionMessage(null);
    setMicrophonePermissionMessage(null);
    clearReconciliationWarning();
    setError(null);
    setLoading(true);
    setChannelState("connecting");

    const initialize = async () => {
      const [snapshot, currentIdentity] = await Promise.all([
        getCommunicationRoomSnapshot(normalizedRoomId),
        readCommunicationIdentity(),
      ]);
      if (!active) return;
      if (!snapshot || snapshot.room.status !== "active") {
        throw new Error("accepted_chat_call_room_unavailable");
      }
      if (
        !currentIdentity.userId
        || (currentIdentity.userId !== inviteCallerUserId && currentIdentity.userId !== inviteCalleeUserId)
        || inviteThreadId !== threadId
        || normalizeRoomId(inviteCommunicationRoomId) !== normalizedRoomId
      ) {
        throw new Error("accepted_chat_call_identity_mismatch");
      }

      const membership = await joinCommunicationRoomSession({
        roomId: normalizedRoomId,
        userId: currentIdentity.userId,
        displayName: currentIdentity.displayName,
        avatarUrl: currentIdentity.avatarUrl,
        cameraEnabled: initialCameraEnabled,
        micEnabled: initialMicEnabled,
      });
      if (!active) return;
      if (!membership) {
        const roomFull = getActiveCommunicationMemberships(snapshot.memberships).length >= 4;
        if (roomFull) await onRoomEndedRef.current?.("room-full");
        throw new Error(roomFull ? "accepted_chat_call_room_full" : "accepted_chat_call_membership_denied");
      }

      const nextMemberships = [
        ...snapshot.memberships.filter((entry) => entry.userId !== membership.userId),
        membership,
      ];
      productRoomRef.current = snapshot.room;
      identityRef.current = currentIdentity;
      membershipsRef.current = nextMemberships;
      setRoom(snapshot.room);
      setIdentity(currentIdentity);

      emitStage("token_requested", { connectionState: "membership_confirmed" });
      const tokenResult = await requestLiveKitParticipantToken({
        surface: "chat-call",
        roomName: normalizedRoomId,
        participantIdentity: currentIdentity.userId,
        participantName: currentIdentity.displayName,
        participantRole: "speaker",
        callInviteId: inviteId,
        callType: inviteCallType,
        mediaProvider: "livekit",
        threadId: inviteThreadId,
      });
      if (!active) return;
      if (tokenResult.status !== "ready") {
        throw new Error(`chat_call_livekit_token_${tokenResult.reason}`);
      }
      emitStage("token_returned", { connectionState: "token_ready" });
      const grants = tokenResult.requestedGrants;
      const claimsValid = tokenResult.participantRole === "speaker"
        && grants.roomJoin
        && grants.canPublish
        && grants.canSubscribe
        && grants.canPublishData
        && normalizeRoomId(tokenResult.roomName) === normalizedRoomId
        && validateChatCallLiveKitTokenClaims({
          participantIdentity: currentIdentity.userId,
          participantToken: tokenResult.participantToken,
          roomName: normalizedRoomId,
        });
      if (!claimsValid) {
        throw new Error("chat_call_livekit_token_claims_rejected");
      }
      tokenValidatedRef.current = true;
      emitStage("token_claims_validated", { connectionState: "claims_validated" });

      const liveKitRoom = new Room(createLiveKitV1RoomOptions({
        adaptiveStream: true,
        dynacast: true,
      }));
      roomRef.current = liveKitRoom;
      effectBinding = activateCommittedSession({
        identity: currentIdentity,
        liveKitRoom,
        productRoom: snapshot.room,
        roomState: "reconnecting",
      });
      if (!effectBinding) throw new Error("accepted_chat_call_committed_session_stale");

      if (Platform.OS === "ios" && !allowBackgroundAudio) {
        await configureLiveKitIosAudioSession(inviteCallType === "video");
        ownsIosAudioConfigurationRef.current = true;
      }

      const refresh = () => refreshParticipantViews();
      liveKitRoom
        .on(RoomEvent.ParticipantConnected, () => {
          emitStage("remote_participant_joined", { connectionState: String(liveKitRoom.state) });
          refresh();
        })
        .on(RoomEvent.ParticipantDisconnected, refresh)
        .on(RoomEvent.TrackPublished, refresh)
        .on(RoomEvent.TrackUnpublished, refresh)
        .on(RoomEvent.TrackMuted, refresh)
        .on(RoomEvent.TrackUnmuted, refresh)
        .on(RoomEvent.LocalTrackPublished, (publication) => {
          if (publication.source === Track.Source.Microphone && !pendingMicToggleRef.current) {
            updateFirstMediaState({ localAudioPublished: true });
            emitStage("local_audio_published", { connectionState: String(liveKitRoom.state) });
          }
          if (publication.source === Track.Source.Camera) {
            updateFirstMediaState({ localVideoPublished: true });
            emitStage("local_video_published", { connectionState: String(liveKitRoom.state) });
          }
          refresh();
        })
        .on(RoomEvent.LocalTrackUnpublished, refresh)
        .on(RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === Track.Kind.Audio) {
            updateFirstMediaState({ remoteAudioSubscribed: true });
            emitStage("remote_audio_subscribed", { connectionState: String(liveKitRoom.state) });
            void setSpeaker(speakerRequestedRef.current);
          }
          if (track.kind === Track.Kind.Video) {
            updateFirstMediaState({ remoteVideoSubscribed: true });
            emitStage("remote_video_subscribed", { connectionState: String(liveKitRoom.state) });
          }
          refresh();
        })
        .on(RoomEvent.TrackUnsubscribed, refresh)
        .on(RoomEvent.ActiveSpeakersChanged, (activeSpeakers) => {
          if (
            !firstAudioRef.current
            && activeSpeakers.some((participant) => participant.identity !== liveKitRoom.localParticipant.identity)
          ) {
            firstAudioRef.current = true;
            updateFirstMediaState({ firstAudio: true });
            emitStage("first_audio", { connectionState: String(liveKitRoom.state) });
          }
        })
        .on(RoomEvent.Reconnecting, () => {
          if (!active) return;
          setCommittedRoomState(effectBinding, "reconnecting");
          setChannelState("reconnecting");
          emitStage("reconnecting", { connectionState: "reconnecting" });
        })
        .on(RoomEvent.SignalReconnecting, () => {
          if (!active) return;
          setCommittedRoomState(effectBinding, "reconnecting");
          setChannelState("reconnecting");
          emitStage("reconnecting", { connectionState: "signal_reconnecting" });
        })
        .on(RoomEvent.Reconnected, () => {
          if (!active) return;
          setCommittedRoomState(effectBinding, "active");
          setChannelState("live");
          emitStage("recovered", { connectionState: "connected" });
          void setSpeaker(speakerRequestedRef.current);
          refresh();
        })
        .on(RoomEvent.ConnectionStateChanged, (connectionState) => {
          if (!active) return;
          if (connectionState === ConnectionState.Connected) {
            emitStage("ice_state", { connectionState: "connected" });
          }
          refresh();
        })
        .on(RoomEvent.Disconnected, () => {
          emitStage("disconnected", { connectionState: "disconnected" });
          if (!active || manualDisconnectRef.current) return;
          setCommittedRoomState(effectBinding, "terminal");
          setChannelState("error");
          setError("The LiveKit call disconnected. End the call or try again from the thread.");
          refresh();
        });

      await LiveKitAudioSession.startAudioSession();
      await liveKitRoom.connect(tokenResult.serverUrl, tokenResult.participantToken, {
        autoSubscribe: true,
      });
      if (!active) return;
      emitStage("websocket_connected", { connectionState: String(liveKitRoom.state) });
      emitStage("ice_state", { connectionState: String(liveKitRoom.state) });

      let effectiveMicEnabled = initialMicEnabled;
      let microphonePublication: TrackPublication | undefined;
      try {
        microphonePublication = initialMicEnabled
          ? await liveKitRoom.localParticipant.setMicrophoneEnabled(true)
          : undefined;
        if (initialMicEnabled && !microphonePublication) {
          effectiveMicEnabled = false;
          setReconciliationWarning("Local microphone could not be started. The call remains connected.");
        } else if (initialMicEnabled) {
          setMicrophonePermissionState("granted");
          setMicrophonePermissionMessage(null);
        }
      } catch (microphoneError) {
        effectiveMicEnabled = false;
        if (isConfirmedNativePermissionDenial(microphoneError)) {
          setConfirmedPermissionDenied("microphone");
        } else {
          setReconciliationWarning("Local microphone could not be started. The call remains connected.");
        }
        reportRuntimeError("chat-call-livekit-initial-microphone", microphoneError);
      }
      if (microphonePublication) {
        updateFirstMediaState({ localAudioPublished: true });
        emitStage("local_audio_published", { connectionState: String(liveKitRoom.state) });
      }

      let effectiveCameraEnabled = initialCameraEnabled;
      let cameraPublication: TrackPublication | undefined;
      try {
        cameraPublication = initialCameraEnabled
          ? await liveKitRoom.localParticipant.setCameraEnabled(true, LIVE_VIDEO_CAPTURE_OPTIONS)
          : undefined;
        if (initialCameraEnabled && !cameraPublication) {
          effectiveCameraEnabled = false;
          setReconciliationWarning("Local camera could not be started. The call remains connected.");
        } else if (initialCameraEnabled) {
          setCameraPermissionState("granted");
          setCameraPermissionMessage(null);
        }
      } catch (cameraError) {
        effectiveCameraEnabled = false;
        if (isConfirmedNativePermissionDenial(cameraError)) {
          setConfirmedPermissionDenied("camera");
        } else {
          setReconciliationWarning("Local camera could not be started. The call remains connected.");
        }
        reportRuntimeError("chat-call-livekit-initial-camera", cameraError);
      }
      if (cameraPublication) {
        updateFirstMediaState({ localVideoPublished: true });
        emitStage("local_video_published", { connectionState: String(liveKitRoom.state) });
      }

      if (!active) return;
      effectBinding = activateCommittedSession({
        identity: currentIdentity,
        liveKitRoom,
        productRoom: snapshot.room,
        roomState: "active",
      });
      if (!effectBinding) return;
      cameraRequestedRef.current = effectiveCameraEnabled;
      micRequestedRef.current = effectiveMicEnabled;
      await setSpeaker(speakerRequestedRef.current);
      const initialMembership = await enqueueSessionMediaWrite(effectBinding, () => (
        performMembershipMediaWrite(
          effectiveCameraEnabled,
          effectiveMicEnabled,
          "active",
          true,
          effectBinding,
        )
      ));
      if (!initialMembership) setReconciliationWarning();
      setCameraEnabledState(effectiveCameraEnabled);
      setMicEnabledState(effectiveMicEnabled);
      setLoading(false);
      setChannelState("live");
      setError(null);
      refreshParticipantViews();
      emitStage("room_connected", { connectionState: "connected" });
      if (liveKitRoom.remoteParticipants.size > 0) {
        emitStage("remote_participant_joined", { connectionState: "connected" });
      }

      heartbeat = setInterval(() => {
        const heartbeatBinding = effectBinding;
        if (!active || !heartbeatBinding || !isCommittedSessionCurrent(heartbeatBinding)) return;
        void scheduleLatestMediaReconciliation(false);
        void getCommunicationRoomSnapshot(heartbeatBinding.normalizedRoomId)
          .then((latestSnapshot) => {
            if (
              !active
              || !sameCommittedAuthority(committedSessionRef.current, heartbeatBinding)
            ) return;
            if (
              !latestSnapshot
              || normalizeRoomId(latestSnapshot.room.roomId) !== heartbeatBinding.normalizedRoomId
              || latestSnapshot.room.status !== "active"
            ) {
              setCommittedRoomState(heartbeatBinding, "terminal");
              void onRoomEndedRef.current?.("ended");
              return;
            }
            membershipsRef.current = latestSnapshot.memberships;
            setRoom(latestSnapshot.room);
            productRoomRef.current = latestSnapshot.room;
            refreshParticipantViews();
          })
          .catch(() => undefined);
      }, ROOM_HEARTBEAT_MS);
    };

    void initialize().catch(async (initializationError) => {
      if (!active) return;
      setLoading(false);
      setChannelState("error");
      setError("Unable to connect this accepted Chi'lly Chat call through LiveKit.");
      reportRuntimeError("chat-call-livekit-initialize", initializationError);
      await cleanupSession({ leaveMembership: true }, effectBinding, cleanupToken);
      if (active) setChannelState("error");
    });

    return () => {
      active = false;
      if (heartbeat) clearInterval(heartbeat);
      void cleanupSession({ leaveMembership: true }, effectBinding, cleanupToken);
    };
  }, [
    activateCommittedSession,
    allowBackgroundAudio,
    clearReconciliationWarning,
    cleanupSession,
    emitStage,
    initialCameraEnabled,
    initialMicEnabled,
    enqueueSessionMediaWrite,
    inviteCallType,
    inviteCalleeUserId,
    inviteCallerUserId,
    inviteCommunicationRoomId,
    inviteId,
    inviteProvider,
    inviteStatus,
    inviteThreadId,
    normalizedRoomId,
    isCommittedSessionCurrent,
    performMembershipMediaWrite,
    refreshParticipantViews,
    scheduleLatestMediaReconciliation,
    sessionKey,
    setCommittedRoomState,
    setConfirmedPermissionDenied,
    setReconciliationWarning,
    setSpeaker,
    threadId,
    updateFirstMediaState,
  ]);

  useEffect(() => {
    if (!sessionKey) return undefined;
    return registerActiveMediaSessionStopper((reason) => {
      if (reason === "app_background") {
        appStateRef.current = "background";
        void scheduleLatestMediaReconciliation(true);
        return;
      }
      void cleanupSession({ leaveMembership: true });
    });
  }, [cleanupSession, scheduleLatestMediaReconciliation, sessionKey]);

  useEffect(() => {
    if (!sessionKey) return undefined;
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if (nextState === previousState || !roomRef.current) return;
      const liveKitRoom = roomRef.current;
      emitStage(nextState === "active" ? "foregrounded" : "backgrounded", {
        connectionState: String(liveKitRoom.state),
      });
      void scheduleLatestMediaReconciliation(true).then(async (reconciled) => {
        if (!reconciled) return;
        if (nextState === "active") await setSpeaker(speakerRequestedRef.current);
        setChannelState(
          nextState === "active" && liveKitRoom.state === ConnectionState.Connected
            ? "live"
            : "reconnecting",
        );
        emitStage("recovered", { connectionState: String(liveKitRoom.state) });
        refreshParticipantViews();
      });
    });
    return () => subscription.remove();
  }, [
    emitStage,
    refreshParticipantViews,
    scheduleLatestMediaReconciliation,
    sessionKey,
    setSpeaker,
  ]);

  useEffect(() => {
    if (!sessionKey || mediaActivationSerial <= 0 || !roomRef.current) return;
    void scheduleLatestMediaReconciliation(true).then(async (reconciled) => {
      if (!reconciled) return;
      await setSpeaker(speakerRequestedRef.current);
      refreshParticipantViews();
    });
  }, [
    mediaActivationSerial,
    refreshParticipantViews,
    scheduleLatestMediaReconciliation,
    sessionKey,
    setSpeaker,
  ]);

  return {
    room,
    identity,
    loading,
    error,
    channelState,
    isRtcAvailable: true,
    cameraEnabled,
    micEnabled,
    mediaControlsBusy,
    cameraPermissionState,
    microphonePermissionState,
    mediaPermissionMessage,
    mediaReconciliationMessage,
    mediaReconciliationState,
    canOpenMediaSettings: cameraPermissionState === "denied" || microphonePermissionState === "denied",
    participants,
    participantCount: participants.length,
    localStreamURL: "",
    toggleCamera,
    setCameraEnabled,
    setMicrophoneEnabled,
    switchCamera,
    setSpeaker,
    speakerEnabled,
    canSetSpeaker: true,
    openMediaSettings,
    leaveRoom,
    firstMediaState,
    markInstalledUiConnected,
    markParticipantVideoRendered,
  };
}
