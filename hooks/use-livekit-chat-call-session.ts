import "../_lib/livekit/dom-exception-polyfill";

import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type TrackPublication,
} from "livekit-client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { registerActiveMediaSessionStopper } from "../_lib/mediaSessionLifecycle";
import {
  createLiveKitV1RoomOptions,
  LIVE_VIDEO_CAPTURE_OPTIONS,
  ROOM_HEARTBEAT_MS,
} from "../_lib/performancePolicy";

type ChatCallChannelState = "idle" | "connecting" | "live" | "reconnecting" | "error";
type RoomEndedReason = "host-left" | "ended" | "room-full";

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
  const sessionKey = enabled && inviteId
    ? `${inviteId}:${normalizedRoomId}:${inviteCallType}:${inviteProvider}`
    : "";
  const initialCameraEnabled = inviteCallType === "video"
    && initialMediaPreferences?.cameraEnabled !== false;
  const initialMicEnabled = initialMediaPreferences?.micEnabled !== false;
  const roomRef = useRef<Room | null>(null);
  const sessionKeyRef = useRef(sessionKey);
  const sessionGenerationRef = useRef(0);
  if (sessionKeyRef.current !== sessionKey) {
    sessionKeyRef.current = sessionKey;
    sessionGenerationRef.current += 1;
  }
  const productRoomRef = useRef<CommunicationRoomState | null>(null);
  const identityRef = useRef<CommunicationIdentity | null>(null);
  const membershipsRef = useRef<CommunicationRoomMembership[]>([]);
  const cameraRequestedRef = useRef(initialCameraEnabled);
  const micRequestedRef = useRef(initialMicEnabled);
  const appStateRef = useRef(AppState.currentState);
  const endingRef = useRef(false);
  const manualDisconnectRef = useRef(false);
  const cleanupCompletedKeyRef = useRef("");
  const installedUiConnectedRef = useRef(false);
  const firstAudioRef = useRef(false);
  const firstVideoRef = useRef(false);
  const tokenValidatedRef = useRef(false);
  const cameraFacingRef = useRef<"user" | "environment">("user");
  const speakerRequestedRef = useRef(inviteCallType === "video");
  const mediaControlRef = useRef<Promise<unknown> | null>(null);
  const mediaControlOwnerRef = useRef<{ token: symbol; sessionKey: string; generation: number } | null>(null);
  const pendingMicToggleRef = useRef(false);
  const pendingMicOwnerRef = useRef<{ token: symbol; sessionKey: string; generation: number } | null>(null);
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
  const [mediaPermissionMessage, setMediaPermissionMessage] = useState<string | null>(null);
  const [speakerEnabled, setSpeakerEnabledState] = useState(inviteCallType === "video");
  const [participants, setParticipants] = useState<CommunicationParticipantView[]>([]);
  const [firstMediaState, setFirstMediaState] = useState<ChatCallFirstMediaState>(EMPTY_FIRST_MEDIA_STATE);

  useEffect(() => {
    onRoomEndedRef.current = onRoomEnded;
  }, [onRoomEnded]);

  useEffect(() => {
    const owner = mediaControlOwnerRef.current;
    if (owner && (owner.sessionKey !== sessionKeyRef.current || owner.generation !== sessionGenerationRef.current)) {
      mediaControlOwnerRef.current = null;
      mediaControlRef.current = null;
      setMediaControlsBusy(false);
    }
  }, [sessionKey]);

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
    operation: () => Promise<T>,
    binding?: { token?: symbol; sessionKey: string; generation: number },
  ): Promise<T | null> => {
    if (mediaControlRef.current) return null;
    const owner = { token: binding?.token ?? Symbol("media-control"), sessionKey: binding?.sessionKey ?? "", generation: binding?.generation ?? -1 };
    setMediaControlsBusy(true);
    const pending = operation();
    mediaControlRef.current = pending;
    mediaControlOwnerRef.current = owner;
    try {
      return await pending;
    } finally {
      if (
        mediaControlOwnerRef.current?.token === owner.token
        && mediaControlOwnerRef.current.sessionKey === owner.sessionKey
        && mediaControlOwnerRef.current.generation === owner.generation
      ) {
        mediaControlRef.current = null;
        mediaControlOwnerRef.current = null;
        setMediaControlsBusy(false);
      }
    }
  }, []);

  const readCurrentMembershipMediaState = useCallback(async (
    originStillCurrent?: () => boolean,
    binding?: { room: CommunicationRoomState; identity: CommunicationIdentity; roomId: string; userId: string },
  ) => {
    const currentIdentity = binding?.identity ?? identityRef.current;
    const currentRoom = binding?.room ?? productRoomRef.current;
    const roomId = binding?.roomId ?? currentRoom?.roomId;
    const userId = binding?.userId ?? currentIdentity?.userId;
    if (!currentIdentity || !currentRoom || !roomId || !userId) return null;
    const remainsCurrent = () => (
      identityRef.current === currentIdentity
      && productRoomRef.current === currentRoom
      && (!originStillCurrent || originStillCurrent())
    );
    const snapshot = await getCommunicationRoomSnapshot(roomId).catch(() => null);
    if (
      !remainsCurrent()
      || !snapshot
      || snapshot.room.roomId !== roomId
      || snapshot.room.status !== "active"
    ) return null;
    const membership = snapshot.memberships.find((entry) => (
      entry.roomId === roomId
      && entry.userId === userId
      && !entry.leftAt
      && (entry.membershipState === "active" || entry.membershipState === "reconnecting")
    )) ?? null;
    if (!membership || !remainsCurrent()) return null;
    membershipsRef.current = [
      ...snapshot.memberships.filter((entry) => entry.userId !== membership.userId),
      membership,
    ];
    return membership;
  }, []);

  const updateMembershipMediaState = useCallback(async (
    cameraOn: boolean,
    micOn: boolean,
    membershipState: "active" | "reconnecting" = "active",
    strict = false,
    originStillCurrent?: () => boolean,
    binding?: { room: CommunicationRoomState; identity: CommunicationIdentity; roomId: string; userId: string },
  ) => {
    const currentIdentity = binding?.identity ?? identityRef.current;
    const currentRoom = binding?.room ?? productRoomRef.current;
    const roomId = binding?.roomId ?? currentRoom?.roomId;
    const userId = binding?.userId ?? currentIdentity?.userId;
    if (!currentIdentity || !currentRoom || !roomId || !userId) return null;
    const remainsCurrent = () => (
      identityRef.current === currentIdentity
      && productRoomRef.current === currentRoom
      && (!originStillCurrent || originStillCurrent())
    );
    const isExact = (candidate: CommunicationRoomMembership | null | undefined) => {
      return !!candidate
        && candidate.roomId === roomId
        && candidate.userId === userId
        && candidate.cameraEnabled === cameraOn
        && candidate.micEnabled === micOn
        && !candidate.leftAt
        && (candidate.membershipState === "active" || candidate.membershipState === "reconnecting");
    };
    if (!remainsCurrent()) return null;
    let membership = await touchCommunicationRoomSession({
      roomId,
      userId,
      membershipState,
      cameraEnabled: cameraOn,
      micEnabled: micOn,
      displayName: currentIdentity.displayName,
      avatarUrl: currentIdentity.avatarUrl,
    }).catch(() => null);
    if (!remainsCurrent()) return null;
    if (strict && !isExact(membership)) {
      const observed = await readCurrentMembershipMediaState(remainsCurrent, binding);
      membership = isExact(observed) ? observed : null;
    }
    if (!membership || !remainsCurrent() || (strict && !isExact(membership))) return null;
    membershipsRef.current = [
      ...membershipsRef.current.filter((entry) => entry.userId !== membership.userId),
      membership,
    ];
    return membership;
  }, [readCurrentMembershipMediaState]);

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
    const leaseBinding = { token: Symbol("mic-lease"), sessionKey: sessionKeyRef.current, generation: sessionGenerationRef.current };
    const result = await runMediaControl(async () => {
      try {
        const liveKitRoom = roomRef.current;
        if (!liveKitRoom || liveKitRoom.state !== ConnectionState.Connected) return false;
        const originSessionKey = sessionKeyRef.current;
        const originSessionGeneration = sessionGenerationRef.current;
        if (nextEnabled) {
          const audioSessionReady = await LiveKitAudioSession.startAudioSession()
            .then(() => true)
            .catch(() => false);
          if (!audioSessionReady) return false;
        }
        if (
          sessionKeyRef.current !== originSessionKey
          || sessionGenerationRef.current !== originSessionGeneration
          || roomRef.current !== liveKitRoom
        ) return false;
        const currentRoom = productRoomRef.current;
        const currentIdentity = identityRef.current;
        const originRoomId = currentRoom?.roomId ?? "";
        const originUserId = currentIdentity?.userId ?? "";
        if (
          currentRoom?.status !== "active"
          || !currentIdentity
          || (channelState !== "live" && channelState !== "reconnecting")
        ) return false;
        const originStillCurrent = () => (
          sessionKeyRef.current === originSessionKey
          && sessionGenerationRef.current === originSessionGeneration
          && roomRef.current === liveKitRoom
          && productRoomRef.current === currentRoom
          && identityRef.current === currentIdentity
          && currentRoom.roomId === originRoomId
          && currentIdentity.userId === originUserId
        );
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
        const priorDurable = await readCurrentMembershipMediaState(originStillCurrent, {
          room: currentRoom,
          identity: currentIdentity,
          roomId: originRoomId,
          userId: originUserId,
        });
        if (!originStillCurrent()) return false;
        const priorConverged = !!priorDurable
          && priorDurable.roomId === currentRoom.roomId
          && priorDurable.userId === currentIdentity.userId
          && !priorDurable.leftAt
          && (priorDurable.membershipState === "active" || priorDurable.membershipState === "reconnecting")
          && priorDurable.micEnabled === priorActual
          && priorActual === priorRequested
          && priorRequested === priorUi
          && priorDurable.cameraEnabled === priorCameraActual
          && priorCameraActual === priorCameraRequested
          && priorCameraRequested === priorCameraUi;
        if (!priorConverged) {
          setMediaPermissionMessage("Microphone state could not be confirmed. The call remains connected.");
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
            nativeRestored = publicationIsUsable(
              liveKitRoom.localParticipant.getTrackPublication(Track.Source.Microphone),
            ) === priorActual;
          }
          const cameraUnchanged = publicationIsUsable(
            liveKitRoom.localParticipant.getTrackPublication(Track.Source.Camera),
          ) === priorCameraActual;
          if (!nativeRestored || !cameraUnchanged) micReconciliationBlockedRef.current = true;
          setMediaPermissionMessage("Microphone state could not be confirmed. The call remains connected.");
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

        const membership = await updateMembershipMediaState(
          priorCameraRequested,
          nextEnabled,
          priorDurable.membershipState === "reconnecting" ? "reconnecting" : "active",
          true,
          originStillCurrent,
          { room: currentRoom, identity: currentIdentity, roomId: originRoomId, userId: originUserId },
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
          const durableRestored = await updateMembershipMediaState(
            priorDurable.cameraEnabled,
            priorDurable.micEnabled,
            priorDurable.membershipState === "reconnecting" ? "reconnecting" : "active",
            true,
            originStillCurrent,
            { room: currentRoom, identity: currentIdentity, roomId: originRoomId, userId: originUserId },
          );
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
          setMediaPermissionMessage("Microphone state could not be confirmed. The call remains connected.");
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
          && mediaControlOwnerRef.current.generation === leaseBinding.generation
          && mediaControlOwnerRef.current.token === leaseBinding.token
        );
        const commitConfirmedMicrophoneTarget = () => {
          if (!originStillCurrent() || !leaseStillOwned()) return false;
          micRequestedRef.current = nextEnabled;
          setMicEnabledState(nextEnabled);
          setMediaPermissionMessage(null);
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
          && pendingMicOwnerRef.current.generation === leaseBinding.generation
          && pendingMicOwnerRef.current.token === leaseBinding.token
        ) {
          pendingMicOwnerRef.current = null;
          pendingMicToggleRef.current = false;
        }
      }
    }, leaseBinding);
    return result === true;
  }, [
    cameraEnabled,
    channelState,
    emitStage,
    micEnabled,
    readCurrentMembershipMediaState,
    refreshParticipantViews,
    runMediaControl,
    updateFirstMediaState,
    updateMembershipMediaState,
  ]);

  const setCameraEnabled = useCallback(async (nextEnabled: boolean) => {
    const result = await runMediaControl(async () => {
      const liveKitRoom = roomRef.current;
      if (!liveKitRoom || liveKitRoom.state !== ConnectionState.Connected) return false;
      const publication = await liveKitRoom.localParticipant.setCameraEnabled(
        nextEnabled,
        LIVE_VIDEO_CAPTURE_OPTIONS,
      );
      if (nextEnabled && !publication) return false;
      cameraRequestedRef.current = nextEnabled;
      setCameraEnabledState(nextEnabled);
      setMediaPermissionMessage(null);
      await updateMembershipMediaState(nextEnabled, micRequestedRef.current);
      refreshParticipantViews();
      if (nextEnabled) {
        emitStage("local_video_published", { connectionState: String(liveKitRoom.state) });
        updateFirstMediaState({ localVideoPublished: true });
        await setSpeaker(speakerRequestedRef.current);
      }
      return true;
    });
    return result === true;
  }, [emitStage, refreshParticipantViews, runMediaControl, setSpeaker, updateFirstMediaState, updateMembershipMediaState]);

  const toggleCamera = useCallback(async () => {
    try {
      const updated = await setCameraEnabled(!cameraRequestedRef.current);
      if (!updated) {
        setMediaPermissionMessage("Camera access is unavailable. The call remains connected.");
        return false;
      }
      return true;
    } catch (mediaError) {
      setMediaPermissionMessage("Camera access is unavailable. Check device settings and try again.");
      reportRuntimeError("chat-call-livekit-camera", mediaError);
      return false;
    }
  }, [setCameraEnabled]);

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
    await Linking.openSettings().catch((settingsError) => {
      reportRuntimeError("chat-call-livekit-open-settings", settingsError);
    });
  }, []);

  const cleanupSession = useCallback(async (options: {
    endRoomIfHost?: boolean;
    leaveMembership?: boolean;
  } = {}) => {
    if (endingRef.current || cleanupCompletedKeyRef.current === sessionKey) return;
    endingRef.current = true;
    manualDisconnectRef.current = true;
    const liveKitRoom = roomRef.current;
    const productRoom = productRoomRef.current;
    const currentIdentity = identityRef.current;
    try {
      if (liveKitRoom) {
        await Promise.allSettled([
          liveKitRoom.localParticipant.setCameraEnabled(false),
          liveKitRoom.localParticipant.setMicrophoneEnabled(false),
        ]);
        await liveKitRoom.disconnect().catch(() => undefined);
      }
      await LiveKitAudioSession.stopAudioSession().catch(() => undefined);
      if (ownsIosAudioConfigurationRef.current) {
        await resetLiveKitIosAudioSession().catch(() => undefined);
        ownsIosAudioConfigurationRef.current = false;
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
      cleanupCompletedKeyRef.current = sessionKey;
      roomRef.current = null;
      setParticipants([]);
      setCameraEnabledState(false);
      setMicEnabledState(false);
      setLoading(false);
      setChannelState("idle");
    } finally {
      endingRef.current = false;
    }
  }, [emitStage, sessionKey]);

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
    telemetryStartedAtRef.current = Date.now();
    cleanupCompletedKeyRef.current = "";
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
    setMediaPermissionMessage(null);
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
          setChannelState("reconnecting");
          emitStage("reconnecting", { connectionState: "reconnecting" });
        })
        .on(RoomEvent.SignalReconnecting, () => {
          if (!active) return;
          setChannelState("reconnecting");
          emitStage("reconnecting", { connectionState: "signal_reconnecting" });
        })
        .on(RoomEvent.Reconnected, () => {
          if (!active) return;
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

      const microphonePublication = initialMicEnabled
        ? await liveKitRoom.localParticipant.setMicrophoneEnabled(true)
        : undefined;
      if (initialMicEnabled && !microphonePublication) {
        throw new Error("chat_call_livekit_microphone_publish_failed");
      }
      if (microphonePublication) {
        updateFirstMediaState({ localAudioPublished: true });
        emitStage("local_audio_published", { connectionState: String(liveKitRoom.state) });
      }

      const cameraPublication = initialCameraEnabled
        ? await liveKitRoom.localParticipant.setCameraEnabled(true, LIVE_VIDEO_CAPTURE_OPTIONS)
        : undefined;
      if (initialCameraEnabled && !cameraPublication) {
        throw new Error("chat_call_livekit_camera_publish_failed");
      }
      if (cameraPublication) {
        updateFirstMediaState({ localVideoPublished: true });
        emitStage("local_video_published", { connectionState: String(liveKitRoom.state) });
      }

      if (!active) return;
      await setSpeaker(speakerRequestedRef.current);
      await updateMembershipMediaState(initialCameraEnabled, initialMicEnabled);
      setCameraEnabledState(initialCameraEnabled);
      setMicEnabledState(initialMicEnabled);
      setLoading(false);
      setChannelState("live");
      setError(null);
      refreshParticipantViews();
      emitStage("room_connected", { connectionState: "connected" });
      if (liveKitRoom.remoteParticipants.size > 0) {
        emitStage("remote_participant_joined", { connectionState: "connected" });
      }

      heartbeat = setInterval(() => {
        const currentRoom = productRoomRef.current;
        const currentIdentityValue = identityRef.current;
        if (!active || !currentRoom || !currentIdentityValue) return;
        void updateMembershipMediaState(
          cameraRequestedRef.current && appStateRef.current === "active",
          micRequestedRef.current && (appStateRef.current === "active" || allowBackgroundAudio),
          appStateRef.current === "active" || allowBackgroundAudio ? "active" : "reconnecting",
        );
        void getCommunicationRoomSnapshot(currentRoom.roomId)
          .then((latestSnapshot) => {
            if (!active) return;
            if (!latestSnapshot || latestSnapshot.room.status !== "active") {
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
      const message = getErrorMessage(initializationError);
      setLoading(false);
      setChannelState("error");
      setError(
        message.includes("camera") || message.includes("microphone")
          ? "Camera or microphone access is required for this accepted call."
          : "Unable to connect this accepted Chi'lly Chat call through LiveKit.",
      );
      setMediaPermissionMessage(
        message.includes("camera") || message.includes("microphone")
          ? "Check camera and microphone access in device settings."
          : null,
      );
      reportRuntimeError("chat-call-livekit-initialize", initializationError);
      await cleanupSession({ leaveMembership: true });
      if (active) setChannelState("error");
    });

    return () => {
      active = false;
      if (heartbeat) clearInterval(heartbeat);
      void cleanupSession({ leaveMembership: true });
    };
  }, [
    allowBackgroundAudio,
    cleanupSession,
    emitStage,
    initialCameraEnabled,
    initialMicEnabled,
    inviteCallType,
    inviteCalleeUserId,
    inviteCallerUserId,
    inviteCommunicationRoomId,
    inviteId,
    inviteProvider,
    inviteStatus,
    inviteThreadId,
    normalizedRoomId,
    refreshParticipantViews,
    sessionKey,
    setSpeaker,
    threadId,
    updateFirstMediaState,
    updateMembershipMediaState,
  ]);

  useEffect(() => {
    if (!sessionKey) return undefined;
    return registerActiveMediaSessionStopper((reason) => {
      const liveKitRoom = roomRef.current;
      if (!liveKitRoom) return;
      if (reason === "app_background") {
        if (allowBackgroundAudio && micRequestedRef.current) {
          void liveKitRoom.localParticipant.setCameraEnabled(false);
          return;
        }
        void liveKitRoom.localParticipant.setCameraEnabled(false);
        void liveKitRoom.localParticipant.setMicrophoneEnabled(false);
        return;
      }
      void cleanupSession({ leaveMembership: true });
    });
  }, [allowBackgroundAudio, cleanupSession, sessionKey]);

  useEffect(() => {
    if (!sessionKey) return undefined;
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if (nextState === previousState || !roomRef.current) return;
      const liveKitRoom = roomRef.current;
      if (nextState === "active") {
        emitStage("foregrounded", { connectionState: String(liveKitRoom.state) });
        void LiveKitAudioSession.startAudioSession()
          .then(() => Promise.all([
            liveKitRoom.localParticipant.setMicrophoneEnabled(micRequestedRef.current),
            liveKitRoom.localParticipant.setCameraEnabled(
              cameraRequestedRef.current,
              LIVE_VIDEO_CAPTURE_OPTIONS,
            ),
          ]))
          .then(async () => {
            await setSpeaker(speakerRequestedRef.current);
            setMicEnabledState(micRequestedRef.current);
            setCameraEnabledState(cameraRequestedRef.current);
            setChannelState(liveKitRoom.state === ConnectionState.Connected ? "live" : "reconnecting");
            void updateMembershipMediaState(cameraRequestedRef.current, micRequestedRef.current);
            emitStage("recovered", { connectionState: String(liveKitRoom.state) });
            refreshParticipantViews();
          })
          .catch((foregroundError) => {
            setError("The call stayed connected, but local media could not be restored.");
            reportRuntimeError("chat-call-livekit-foreground", foregroundError);
          });
        return;
      }

      emitStage("backgrounded", { connectionState: String(liveKitRoom.state) });
      if (allowBackgroundAudio && micRequestedRef.current) {
        void liveKitRoom.localParticipant.setCameraEnabled(false);
        setCameraEnabledState(false);
        void updateMembershipMediaState(false, true, "active");
        return;
      }
      void Promise.all([
        liveKitRoom.localParticipant.setCameraEnabled(false),
        liveKitRoom.localParticipant.setMicrophoneEnabled(false),
      ]);
      setCameraEnabledState(false);
      setMicEnabledState(false);
      setChannelState("reconnecting");
      void updateMembershipMediaState(false, false, "reconnecting");
    });
    return () => subscription.remove();
  }, [
    allowBackgroundAudio,
    emitStage,
    refreshParticipantViews,
    sessionKey,
    setSpeaker,
    updateMembershipMediaState,
  ]);

  useEffect(() => {
    if (!sessionKey || mediaActivationSerial <= 0 || !roomRef.current) return;
    const liveKitRoom = roomRef.current;
    void LiveKitAudioSession.startAudioSession()
      .then(() => liveKitRoom.localParticipant.setMicrophoneEnabled(micRequestedRef.current))
      .then(() => {
        if (AppState.currentState === "active") {
          return liveKitRoom.localParticipant.setCameraEnabled(
            cameraRequestedRef.current,
            LIVE_VIDEO_CAPTURE_OPTIONS,
          );
        }
        return undefined;
      })
      .then(() => {
        setMicEnabledState(micRequestedRef.current);
        if (AppState.currentState === "active") setCameraEnabledState(cameraRequestedRef.current);
        return setSpeaker(speakerRequestedRef.current);
      })
      .then(() => {
        refreshParticipantViews();
      })
      .catch((activationError) => {
        reportRuntimeError("chat-call-livekit-native-audio-activation", activationError);
      });
  }, [mediaActivationSerial, refreshParticipantViews, sessionKey, setSpeaker]);

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
    cameraPermissionState: mediaPermissionMessage ? "denied" : "granted",
    microphonePermissionState: mediaPermissionMessage ? "denied" : "granted",
    mediaPermissionMessage,
    canOpenMediaSettings: !!mediaPermissionMessage,
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
