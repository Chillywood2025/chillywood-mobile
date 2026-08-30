import type { RealtimeChannel } from "@supabase/supabase-js";
import { Audio } from "expo-av";
import { useCameraPermissions } from "expo-camera";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, type AppStateStatus } from "react-native";
import type { MediaStream } from "@livekit/react-native-webrtc";

import { resolveRoomAccess } from "../_lib/accessEntitlements";
import { trackEvent } from "../_lib/analytics";
import {
  broadcastCommunicationRoomSignal,
  buildCommunicationChannelName,
  buildCommunicationPresencePayload,
  COMMUNICATION_DEFAULT_ICE_SERVERS,
  COMMUNICATION_ROOM_MAX_PARTICIPANTS,
  createCommunicationMediaStream,
  endCommunicationRoom,
  getActiveCommunicationMemberships,
  getCommunicationRoomSnapshot,
  getCommunicationRTCModule,
  getCommunicationStreamURL,
  getCommunicationTrack,
  joinCommunicationRoomSession,
  leaveCommunicationRoomSession,
  readCommunicationIdentity,
  setCommunicationTrackEnabled,
  stopCommunicationStream,
  touchCommunicationRoomSession,
  type CommunicationIdentity,
  type CommunicationMediaPreferences,
  type CommunicationParticipantPresence,
  type CommunicationParticipantView,
  type CommunicationRoomMembership,
  type CommunicationRoomState,
} from "../_lib/communication";
import { reportRuntimeError } from "../_lib/logger";
import {
  canAttemptNativeCallBackgroundAudio,
  resolveLegacyChatSessionRecovery,
  setActiveCommunicationTracksEnabled,
  shouldPreserveNativeCallBackgroundAudio,
} from "../_lib/communicationCallMediaPolicy.mjs";
import {
  getMediaPermissionRecoveryMessage,
  resolveMediaPermission,
  UNDETERMINED_MEDIA_PERMISSION,
  type MediaPermissionSnapshot,
} from "../_lib/mediaPermissions";
import { registerActiveMediaSessionStopper } from "../_lib/mediaSessionLifecycle";
import {
  ROOM_HEARTBEAT_MS,
} from "../_lib/performancePolicy";
import { normalizeRoomMembershipState } from "../_lib/roomRules";
import { supabase } from "../_lib/supabase";

type UseCommunicationRoomSessionOptions = {
  authenticatedAccessToken?: string;
  authenticatedUserId?: string;
  roomId: string;
  initialMediaPreferences?: Partial<CommunicationMediaPreferences>;
  onRoomEnded?: (reason: "host-left" | "ended" | "room-full") => void;
  enabled?: boolean;
  allowBackgroundAudio?: boolean;
  mediaActivationSerial?: number;
  restartDisconnectedSession?: boolean;
  analyticsContext?: {
    surface?: "party-room" | "live-room" | "communication-room" | "chat-thread";
    role?: "host" | "viewer" | null;
  };
};

type PeerConnectionState = CommunicationParticipantView["connectionState"];

type PresenceStatePayload = {
  userId?: string;
  displayName?: string;
  avatarUrl?: string;
  cameraOn?: boolean;
  micOn?: boolean;
  joinedAt?: string;
  isHost?: boolean;
};

type LegacyMicSessionAuthority = {
  channel: RealtimeChannel;
  generation: number;
  roomId: string;
  userId: string;
};

type LegacyMicAnswerWaiter = {
  authority: LegacyMicSessionAuthority;
  peerConnection: any;
  remoteUserId: string;
  resolve: (answered: boolean) => void;
};

const LEGACY_BACKGROUND_MEDIA_STATE = {
  cameraEnabled: false,
  micEnabled: false,
} as const;

const HEARTBEAT_INTERVAL_MILLIS = ROOM_HEARTBEAT_MS;
const SNAPSHOT_WARMUP_INITIAL_DELAY_MILLIS = 750;
const SNAPSHOT_WARMUP_INTERVAL_MILLIS = 1_500;
const SNAPSHOT_WARMUP_MAX_ATTEMPTS = 8;
const OFFER_RETRY_DELAY_MILLIS = 2_500;
const OFFER_RETRY_MIN_INTERVAL_MILLIS = 2_000;
const REALTIME_OPERATION_TIMEOUT_MILLIS = 3_000;
const LEGACY_MIC_RENEGOTIATION_TIMEOUT_MILLIS = 3_000;
const PREFERRED_VIDEO_CODEC = "VP8";

const logChatRtc = (event: string, details?: Record<string, unknown>) => {
  if (!__DEV__) return;
  const shouldLog = event.startsWith("diag_")
    || event === "remote_stream_attached"
    || event === "peer_connection_state"
    || event === "offer_received"
    || event === "answer_received";
  if (!shouldLog) return;
  console.log("[CH_RTC]", event, details ?? {});
};

const describeTrack = (track: { id?: unknown; kind?: unknown; enabled?: unknown; muted?: unknown; readyState?: unknown } | null | undefined) => ({
  id: String(track?.id ?? ""),
  kind: String(track?.kind ?? ""),
  enabled: typeof track?.enabled === "boolean" ? track.enabled : null,
  muted: typeof track?.muted === "boolean" ? track.muted : null,
  readyState: String(track?.readyState ?? ""),
});

const describeStream = (stream: MediaStream | null | undefined) => ({
  id: String((stream as { id?: unknown } | null | undefined)?.id ?? ""),
  url: getCommunicationStreamURL(stream ?? null),
  videoTracks: typeof stream?.getVideoTracks === "function"
    ? stream.getVideoTracks().map((track) => describeTrack(track as any))
    : [],
  audioTracks: typeof stream?.getAudioTracks === "function"
    ? stream.getAudioTracks().map((track) => describeTrack(track as any))
    : [],
});

const isRenderableVideoTrack = (track: any) => {
  if (String(track?.kind ?? "") !== "video") return false;
  if (track?.enabled === false) return false;
  const readyState = String(track?.readyState ?? "").trim().toLowerCase();
  return readyState !== "ended";
};

const hasRenderableVideoTrack = (stream: MediaStream | null | undefined) => (
  typeof stream?.getVideoTracks === "function"
  && stream.getVideoTracks().some((track) => isRenderableVideoTrack(track as any))
);

const getRenderableVideoStreamURL = (stream: MediaStream | null | undefined) => (
  hasRenderableVideoTrack(stream) ? getCommunicationStreamURL(stream) : ""
);

const describePeerConnection = (peerConnection: any) => ({
  connectionState: String(peerConnection?.connectionState ?? ""),
  iceConnectionState: String(peerConnection?.iceConnectionState ?? ""),
  iceGatheringState: String(peerConnection?.iceGatheringState ?? ""),
  signalingState: String(peerConnection?.signalingState ?? ""),
  transceivers: typeof peerConnection?.getTransceivers === "function"
    ? peerConnection.getTransceivers().map((transceiver: any) => ({
        mid: transceiver?.mid ?? null,
        direction: String(transceiver?.direction ?? ""),
        currentDirection: String(transceiver?.currentDirection ?? ""),
        senderTrack: describeTrack(transceiver?.sender?.track),
        receiverTrack: describeTrack(transceiver?.receiver?.track),
      }))
    : [],
  receivers: typeof peerConnection?.getReceivers === "function"
    ? peerConnection.getReceivers().map((receiver: any) => describeTrack(receiver?.track))
    : [],
});

const buildRemoteRenderStream = (
  rtc: NonNullable<ReturnType<typeof getCommunicationRTCModule>>,
  peerConnection: any,
  fallbackStream: MediaStream | null | undefined,
  preferredTrack?: any,
) => {
  const nextStream = new rtc.MediaStream();
  const addedTrackIds = new Set<string>();
  const addTrack = (track: any) => {
    const descriptor = describeTrack(track);
    if (descriptor.kind !== "audio" && descriptor.kind !== "video") return;
    if (!descriptor.id || addedTrackIds.has(descriptor.id)) return;
    addedTrackIds.add(descriptor.id);
    nextStream.addTrack(track);
  };

  if (preferredTrack) addTrack(preferredTrack);
  if (typeof fallbackStream?.getVideoTracks === "function") {
    fallbackStream.getVideoTracks().forEach((track) => addTrack(track));
  }
  if (typeof fallbackStream?.getAudioTracks === "function") {
    fallbackStream.getAudioTracks().forEach((track) => addTrack(track));
  }
  if (typeof peerConnection?.getReceivers === "function") {
    peerConnection.getReceivers().forEach((receiver: any) => addTrack(receiver?.track));
  }

  return nextStream;
};

const summarizeInboundVideoStats = async (peerConnection: any) => {
  if (typeof peerConnection?.getStats !== "function") return [];
  const statsReport = await peerConnection.getStats();
  const entries = Array.isArray(statsReport)
    ? statsReport
    : typeof statsReport?.forEach === "function"
      ? (() => {
          const next: any[] = [];
          statsReport.forEach((value: any) => next.push(value));
          return next;
        })()
      : Object.values(statsReport ?? {});

  return entries
    .filter((entry: any) => {
      const type = String(entry?.type ?? "");
      const kind = String(entry?.kind ?? entry?.mediaType ?? "");
      return type === "inbound-rtp" && kind === "video";
    })
    .map((entry: any) => ({
      id: String(entry?.id ?? ""),
      kind: String(entry?.kind ?? entry?.mediaType ?? ""),
      bytesReceived: typeof entry?.bytesReceived === "number" ? entry.bytesReceived : null,
      framesReceived: typeof entry?.framesReceived === "number" ? entry.framesReceived : null,
      framesDecoded: typeof entry?.framesDecoded === "number" ? entry.framesDecoded : null,
      framesDropped: typeof entry?.framesDropped === "number" ? entry.framesDropped : null,
      packetsReceived: typeof entry?.packetsReceived === "number" ? entry.packetsReceived : null,
      packetsLost: typeof entry?.packetsLost === "number" ? entry.packetsLost : null,
      decoderImplementation: String(entry?.decoderImplementation ?? ""),
      frameWidth: typeof entry?.frameWidth === "number" ? entry.frameWidth : null,
      frameHeight: typeof entry?.frameHeight === "number" ? entry.frameHeight : null,
    }));
};

const summarizeOutboundRtpStats = async (peerConnection: any, kind: "audio" | "video") => {
  if (typeof peerConnection?.getStats !== "function") return [];
  const statsReport = await peerConnection.getStats();
  const entries = Array.isArray(statsReport)
    ? statsReport
    : typeof statsReport?.forEach === "function"
      ? (() => {
          const next: any[] = [];
          statsReport.forEach((value: any) => next.push(value));
          return next;
        })()
      : Object.values(statsReport ?? {});

  return entries
    .filter((entry: any) => {
      const type = String(entry?.type ?? "");
      const mediaKind = String(entry?.kind ?? entry?.mediaType ?? "");
      return type === "outbound-rtp" && mediaKind === kind;
    })
    .map((entry: any) => ({
      id: String(entry?.id ?? ""),
      kind: String(entry?.kind ?? entry?.mediaType ?? ""),
      bytesSent: typeof entry?.bytesSent === "number" ? entry.bytesSent : null,
      packetsSent: typeof entry?.packetsSent === "number" ? entry.packetsSent : null,
      framesEncoded: typeof entry?.framesEncoded === "number" ? entry.framesEncoded : null,
      frameWidth: typeof entry?.frameWidth === "number" ? entry.frameWidth : null,
      frameHeight: typeof entry?.frameHeight === "number" ? entry.frameHeight : null,
      qualityLimitationReason: String(entry?.qualityLimitationReason ?? ""),
      encoderImplementation: String(entry?.encoderImplementation ?? ""),
      active: typeof entry?.active === "boolean" ? entry.active : null,
    }));
};

const summarizeInboundRtpStats = async (peerConnection: any, kind: "audio" | "video") => {
  if (kind === "video") return summarizeInboundVideoStats(peerConnection);
  if (typeof peerConnection?.getStats !== "function") return [];
  const statsReport = await peerConnection.getStats();
  const entries = Array.isArray(statsReport)
    ? statsReport
    : typeof statsReport?.forEach === "function"
      ? (() => {
          const next: any[] = [];
          statsReport.forEach((value: any) => next.push(value));
          return next;
        })()
      : Object.values(statsReport ?? {});

  return entries
    .filter((entry: any) => {
      const type = String(entry?.type ?? "");
      const mediaKind = String(entry?.kind ?? entry?.mediaType ?? "");
      return type === "inbound-rtp" && mediaKind === kind;
    })
    .map((entry: any) => ({
      id: String(entry?.id ?? ""),
      kind: String(entry?.kind ?? entry?.mediaType ?? ""),
      bytesReceived: typeof entry?.bytesReceived === "number" ? entry.bytesReceived : null,
      packetsReceived: typeof entry?.packetsReceived === "number" ? entry.packetsReceived : null,
      packetsLost: typeof entry?.packetsLost === "number" ? entry.packetsLost : null,
      jitter: typeof entry?.jitter === "number" ? entry.jitter : null,
    }));
};

const mapPresenceState = (state: Record<string, PresenceStatePayload[] | undefined>) => {
  const mapped: Record<string, PresenceStatePayload> = {};
  Object.entries(state).forEach(([presenceKey, presences]) => {
    const presence = Array.isArray(presences) ? presences[0] : undefined;
    // Presence payloads are client-authored. Treat the subscribed presence key
    // as the routing hint and never let a claimed userId replace it.
    const userId = String(presenceKey).trim();
    if (!userId) return;
    mapped[userId] = { ...(presence ?? {}), userId };
  });
  return mapped;
};

const shouldInitiatePeerOffer = ({
  localUserId,
  remoteUserId,
  hostUserId,
}: {
  localUserId: string;
  remoteUserId: string;
  hostUserId?: string | null;
}) => {
  const localId = localUserId.trim();
  const remoteId = remoteUserId.trim();
  const hostId = String(hostUserId ?? "").trim();
  if (!localId || !remoteId) return false;
  if (hostId) {
    if (localId === hostId && remoteId !== hostId) return true;
    if (remoteId === hostId) return false;
  }
  return localId.localeCompare(remoteId) < 0;
};

const waitForRealtimeOperation = async <T,>(operation: Promise<T>, timeoutMillis = REALTIME_OPERATION_TIMEOUT_MILLIS) => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      operation,
      new Promise<null>((resolve) => {
        timeoutId = setTimeout(() => resolve(null), timeoutMillis);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export function useCommunicationRoomSession({
  authenticatedAccessToken,
  authenticatedUserId,
  roomId,
  initialMediaPreferences,
  onRoomEnded,
  enabled = true,
  allowBackgroundAudio = false,
  mediaActivationSerial = 0,
  restartDisconnectedSession = false,
  analyticsContext,
}: UseCommunicationRoomSessionOptions) {
  const [cameraPermission, requestCameraPermission, getCameraPermission] = useCameraPermissions();
  const [microphonePermission, setMicrophonePermission] = useState<MediaPermissionSnapshot>(UNDETERMINED_MEDIA_PERMISSION);
  const [room, setRoom] = useState<CommunicationRoomState | null>(null);
  const [identity, setIdentity] = useState<CommunicationIdentity | null>(null);
  const [memberships, setMemberships] = useState<CommunicationRoomMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [channelState, setChannelState] = useState<"idle" | "connecting" | "live" | "reconnecting" | "error">("idle");
  const [cameraEnabled, setCameraEnabled] = useState(initialMediaPreferences?.cameraEnabled ?? true);
  const [micEnabled, setMicEnabled] = useState(initialMediaPreferences?.micEnabled ?? true);
  const [presenceParticipants, setPresenceParticipants] = useState<CommunicationParticipantPresence[]>([]);
  const [localStreamURL, setLocalStreamURL] = useState("");
  const [localVideoStreamURL, setLocalVideoStreamURL] = useState("");
  const [remoteStreamsByUserId, setRemoteStreamsByUserId] = useState<Record<string, MediaStream>>({});
  const [connectionStateByUserId, setConnectionStateByUserId] = useState<Record<string, PeerConnectionState>>({});
  const [mediaControlsBusy, setMediaControlsBusy] = useState(false);
  const [legacySessionRestartSerial, setLegacySessionRestartSerial] = useState(0);

  const localJoinedAtRef = useRef(new Date().toISOString());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const snapshotChannelRef = useRef<RealtimeChannel | null>(null);
  const roomRef = useRef<CommunicationRoomState | null>(null);
  const identityRef = useRef<CommunicationIdentity | null>(null);
  const membershipsRef = useRef<CommunicationRoomMembership[]>([]);
  const presenceStateRef = useRef<Record<string, PresenceStatePayload>>({});
  const cameraEnabledRef = useRef(cameraEnabled);
  const micEnabledRef = useRef(micEnabled);
  const channelStateRef = useRef(channelState);
  const cameraPermissionGrantedRef = useRef(!!cameraPermission?.granted);
  const cameraPermissionRequestedRef = useRef(false);
  const microphonePermissionRequestedRef = useRef(false);
  const onRoomEndedRef = useRef(onRoomEnded);
  const localStreamRef = useRef<MediaStream | null>(null);
  const auxiliaryStreamsRef = useRef<MediaStream[]>([]);
  const peerConnectionsRef = useRef<Record<string, any>>({});
  const offerRetryTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const lastOfferSentAtRef = useRef<Record<string, number>>({});
  const peerOfferInFlightRef = useRef<Record<string, Promise<boolean>>>({});
  const peerOfferTailRef = useRef<Record<string, Promise<void>>>({});
  const legacyMicAnswerWaitersRef = useRef<Record<string, LegacyMicAnswerWaiter>>({});
  const legacyMicNegotiationSerialRef = useRef(0);
  const legacyMicControlRef = useRef<((nextEnabled: boolean, cameraEnabledOverride?: boolean) => Promise<boolean>) | null>(null);
  const legacyMicLocalPrivacyStopRef = useRef<(() => boolean) | null>(null);
  const resumeMicAfterForegroundRef = useRef(false);
  const legacySessionGenerationRef = useRef(0);
  const legacySessionRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const legacySessionRestartRequestedGenerationRef = useRef<number | null>(null);
  const mediaControlTailRef = useRef<Promise<void>>(Promise.resolve());
  const pendingMediaControlCountRef = useRef(0);
  const endingGenerationRef = useRef<number | null>(null);
  const reconnectTrackedRef = useRef(false);
  const cameraFacingRef = useRef<"front" | "environment">("front");
  const appStateRef = useRef(AppState.currentState);
  const allowBackgroundAudioRef = useRef(allowBackgroundAudio);
  const nativePermissionRequestDepthRef = useRef(0);
  const suppressedPermissionAppStateRef = useRef<AppStateStatus | null>(null);
  const appStateLifecycleHandlerRef = useRef<((nextState: AppStateStatus) => void) | null>(null);

  const requestLegacySessionRestart = useCallback((trigger: string, expectedGeneration = legacySessionGenerationRef.current) => {
    const recovery = resolveLegacyChatSessionRecovery({
      alreadyRequested: legacySessionRestartRequestedGenerationRef.current === expectedGeneration,
      appState: appStateRef.current,
      enabled: restartDisconnectedSession,
      ending: endingGenerationRef.current === expectedGeneration,
      generationIsCurrent: expectedGeneration === legacySessionGenerationRef.current,
      trigger,
    });
    if (!recovery) return false;
    legacySessionRestartRequestedGenerationRef.current = expectedGeneration;
    if (legacySessionRestartTimerRef.current) clearTimeout(legacySessionRestartTimerRef.current);
    legacySessionRestartTimerRef.current = setTimeout(() => {
      legacySessionRestartTimerRef.current = null;
      if (!resolveLegacyChatSessionRecovery({
        alreadyRequested: false,
        appState: appStateRef.current,
        enabled: restartDisconnectedSession,
        ending: endingGenerationRef.current === expectedGeneration,
        generationIsCurrent: expectedGeneration === legacySessionGenerationRef.current,
        trigger,
      })) return;
      channelStateRef.current = "connecting";
      setChannelState("connecting");
      setLoading(true);
      setLegacySessionRestartSerial((current) => current + 1);
    }, recovery.delayMs);
    return true;
  }, [restartDisconnectedSession]);

  useEffect(() => () => {
    if (legacySessionRestartTimerRef.current) clearTimeout(legacySessionRestartTimerRef.current);
  }, []);

  const cameraPermissionSnapshot = resolveMediaPermission(cameraPermission);
  const cameraPermissionState = cameraPermissionSnapshot.state;
  const microphonePermissionState = microphonePermission.state;
  const cameraPermissionSnapshotRef = useRef<MediaPermissionSnapshot>(cameraPermissionSnapshot);
  const microphonePermissionRef = useRef<MediaPermissionSnapshot>(microphonePermission);

  const isRtcAvailable = useMemo(() => {
    if (!enabled) return false;
    return !!getCommunicationRTCModule();
  }, [enabled]);
  const analyticsSurface = analyticsContext?.surface ?? "communication-room";
  const analyticsRole = analyticsContext?.role ?? null;

  useEffect(() => {
    logChatRtc("rtc_availability", {
      roomId,
      enabled,
      isRtcAvailable,
      surface: analyticsSurface,
    });
  }, [analyticsSurface, enabled, isRtcAvailable, roomId]);

  useEffect(() => {
    cameraEnabledRef.current = cameraEnabled;
  }, [cameraEnabled]);

  useEffect(() => {
    micEnabledRef.current = micEnabled;
  }, [micEnabled]);

  useEffect(() => {
    channelStateRef.current = channelState;
  }, [channelState]);

  useEffect(() => {
    allowBackgroundAudioRef.current = allowBackgroundAudio;
  }, [allowBackgroundAudio]);

  useEffect(() => {
    if (typeof initialMediaPreferences?.cameraEnabled === "boolean") {
      setCameraEnabled(initialMediaPreferences.cameraEnabled);
    }
    if (typeof initialMediaPreferences?.micEnabled === "boolean") {
      setMicEnabled(initialMediaPreferences.micEnabled);
    }
  }, [
    initialMediaPreferences?.cameraEnabled,
    initialMediaPreferences?.micEnabled,
    roomId,
  ]);

  useEffect(() => {
    cameraPermissionGrantedRef.current = !!cameraPermission?.granted;
  }, [cameraPermission?.granted]);

  useEffect(() => {
    cameraPermissionSnapshotRef.current = cameraPermissionSnapshot;
  }, [
    cameraPermissionSnapshot.canAskAgain,
    cameraPermissionSnapshot.shouldOpenSettings,
    cameraPermissionSnapshot.state,
  ]);

  useEffect(() => {
    microphonePermissionRef.current = microphonePermission;
  }, [microphonePermission]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    identityRef.current = identity;
  }, [identity]);

  useEffect(() => {
    membershipsRef.current = memberships;
  }, [memberships]);

  useEffect(() => {
    onRoomEndedRef.current = onRoomEnded;
  }, [onRoomEnded]);

  useEffect(() => {
    let active = true;
    Audio.getPermissionsAsync()
      .then((permission) => {
        if (active) setMicrophonePermission(resolveMediaPermission(permission));
      })
      .catch(() => {
        if (active) setMicrophonePermission(UNDETERMINED_MEDIA_PERMISSION);
      });
    return () => {
      active = false;
    };
  }, []);

  const clearOfferRetry = useCallback((userId: string) => {
    const existingTimer = offerRetryTimersRef.current[userId];
    if (existingTimer) clearTimeout(existingTimer);
    delete offerRetryTimersRef.current[userId];
  }, []);

  const runSerializedPeerOffer = useCallback((
    remoteUserId: string,
    operation: () => Promise<boolean>,
    deduplicateExisting: boolean,
  ) => {
    const existing = peerOfferInFlightRef.current[remoteUserId];
    if (deduplicateExisting && existing) return existing;
    const predecessor = peerOfferTailRef.current[remoteUserId] ?? Promise.resolve();
    const queued = predecessor.catch(() => undefined).then(operation);
    const tail = queued.then(() => undefined, () => undefined);
    peerOfferTailRef.current[remoteUserId] = tail;
    peerOfferInFlightRef.current[remoteUserId] = queued;
    void queued.finally(() => {
      if (peerOfferInFlightRef.current[remoteUserId] === queued) {
        delete peerOfferInFlightRef.current[remoteUserId];
      }
      if (peerOfferTailRef.current[remoteUserId] === tail) {
        delete peerOfferTailRef.current[remoteUserId];
      }
    }).catch(() => undefined);
    return queued;
  }, []);

  const cleanupRemotePeer = useCallback((userId: string, expectedPeerConnection?: any) => {
    logChatRtc("remote_peer_cleanup", {
      roomId,
      userId,
    });
    if (!expectedPeerConnection || peerConnectionsRef.current[userId] === expectedPeerConnection) {
      clearOfferRetry(userId);
      delete peerOfferInFlightRef.current[userId];
      delete peerOfferTailRef.current[userId];
    }
    Object.entries(legacyMicAnswerWaitersRef.current).forEach(([negotiationId, waiter]) => {
      if (
        waiter.remoteUserId !== userId
        || (expectedPeerConnection && waiter.peerConnection !== expectedPeerConnection)
      ) return;
      delete legacyMicAnswerWaitersRef.current[negotiationId];
      waiter.resolve(false);
    });
    const existing = expectedPeerConnection ?? peerConnectionsRef.current[userId];
    if (existing) {
      try {
        existing.close();
      } catch {
        // noop
      }
      if (peerConnectionsRef.current[userId] === existing) {
        delete peerConnectionsRef.current[userId];
      }
    }

    if (expectedPeerConnection) return;
    setRemoteStreamsByUserId((prev) => {
      if (!prev[userId]) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
    setConnectionStateByUserId((prev) => {
      if (!prev[userId]) return prev;
      const next = { ...prev };
      delete next[userId];
      return next;
    });
  }, [clearOfferRetry, roomId]);

  const hasUsableLocalTrack = useCallback((kind: "audio" | "video") => {
    const streams = [
      ...(localStreamRef.current ? [localStreamRef.current] : []),
      ...auxiliaryStreamsRef.current,
    ];
    return streams.some((stream) => {
      const tracks = kind === "audio" ? stream.getAudioTracks() : stream.getVideoTracks();
      return tracks.some((track) => (
        track.enabled !== false
        && String(track.readyState ?? "").trim().toLowerCase() !== "ended"
      ));
    });
  }, []);

  const stopLocalMediaKind = useCallback((kind: "audio" | "video") => {
    const streams = new Set<MediaStream>([
      ...(localStreamRef.current ? [localStreamRef.current] : []),
      ...auxiliaryStreamsRef.current,
    ]);

    streams.forEach((stream) => {
      const tracks = kind === "audio" ? stream.getAudioTracks() : stream.getVideoTracks();
      tracks.forEach((track) => {
        try {
          track.stop();
        } catch {
          // noop
        }
        try {
          stream.removeTrack(track);
        } catch {
          // noop
        }
      });
    });

    auxiliaryStreamsRef.current = auxiliaryStreamsRef.current.filter((stream) => stream.getTracks().length > 0);
    if (localStreamRef.current?.getTracks().length === 0) {
      localStreamRef.current = null;
      setLocalStreamURL("");
    } else if (localStreamRef.current) {
      setLocalStreamURL(getCommunicationStreamURL(localStreamRef.current));
    }
    if (kind === "video") setLocalVideoStreamURL("");
  }, []);

  const setLocalMediaKindEnabled = useCallback((kind: "audio" | "video", enabled: boolean) => {
    const streams = new Set<MediaStream>([
      ...(localStreamRef.current ? [localStreamRef.current] : []),
      ...auxiliaryStreamsRef.current,
    ]);
    let updated = false;

    streams.forEach((stream) => {
      const tracks = kind === "audio" ? stream.getAudioTracks() : stream.getVideoTracks();
      if (setActiveCommunicationTracksEnabled(tracks, enabled) > 0) updated = true;
    });

    return updated;
  }, []);

  const pauseLocalMediaCapture = useCallback((
    expectedLocalStream: MediaStream | null = localStreamRef.current,
    expectedAuxiliaryStreams: MediaStream[] = [...auxiliaryStreamsRef.current],
  ) => {
    stopCommunicationStream(expectedLocalStream);
    expectedAuxiliaryStreams.forEach((stream) => stopCommunicationStream(stream));
    if (localStreamRef.current === expectedLocalStream) {
      localStreamRef.current = null;
      setLocalStreamURL("");
      setLocalVideoStreamURL("");
    }
    auxiliaryStreamsRef.current = auxiliaryStreamsRef.current.filter((stream) => (
      !expectedAuxiliaryStreams.includes(stream)
    ));
  }, []);

  const cleanupSessionMedia = useCallback((snapshot?: {
    answerWaiters: [string, LegacyMicAnswerWaiter][];
    auxiliaryStreams: MediaStream[];
    localStream: MediaStream | null;
    offerRetryTimers: [string, ReturnType<typeof setTimeout>][];
    peers: [string, any][];
  }) => {
    const captured = snapshot ?? {
      answerWaiters: Object.entries(legacyMicAnswerWaitersRef.current),
      auxiliaryStreams: [...auxiliaryStreamsRef.current],
      localStream: localStreamRef.current,
      offerRetryTimers: Object.entries(offerRetryTimersRef.current),
      peers: Object.entries(peerConnectionsRef.current),
    };
    logChatRtc("session_media_cleanup_start", {
      roomId,
      remotePeerCount: captured.peers.length,
      hasLocalStream: !!captured.localStream,
    });
    captured.offerRetryTimers.forEach(([userId, timer]) => {
      clearTimeout(timer);
      if (offerRetryTimersRef.current[userId] === timer) delete offerRetryTimersRef.current[userId];
    });
    captured.answerWaiters.forEach(([negotiationId, waiter]) => {
      if (legacyMicAnswerWaitersRef.current[negotiationId] === waiter) {
        delete legacyMicAnswerWaitersRef.current[negotiationId];
      }
      waiter.resolve(false);
    });
    captured.peers.forEach(([userId, peerConnection]) => cleanupRemotePeer(userId, peerConnection));
    pauseLocalMediaCapture(captured.localStream, captured.auxiliaryStreams);
    logChatRtc("session_media_cleanup_complete", {
      roomId,
    });
  }, [cleanupRemotePeer, pauseLocalMediaCapture, roomId]);

  useEffect(() => {
    if (!enabled) return undefined;
    return registerActiveMediaSessionStopper(async (reason) => {
      if (reason === "app_background") {
        if (allowBackgroundAudioRef.current) {
          stopLocalMediaKind("video");
          return;
        }
        const shouldResumeMic = micEnabledRef.current;
        stopLocalMediaKind("video");
        try {
          const controlled = await legacyMicControlRef.current?.(
            LEGACY_BACKGROUND_MEDIA_STATE.micEnabled,
            LEGACY_BACKGROUND_MEDIA_STATE.cameraEnabled,
          ) ?? false;
          if (!controlled) legacyMicLocalPrivacyStopRef.current?.();
        } catch (error) {
          legacyMicLocalPrivacyStopRef.current?.();
          reportRuntimeError("communication-media-session-background", error, {
            roomId: roomRef.current?.roomId ?? roomId,
          });
        }
        resumeMicAfterForegroundRef.current = shouldResumeMic;
        return;
      }
      cleanupSessionMedia();
    });
  }, [cleanupSessionMedia, enabled, roomId, stopLocalMediaKind]);

  const cleanupChannel = useCallback(async (expectedChannel?: RealtimeChannel | null) => {
    const channel = expectedChannel ?? channelRef.current;
    if (!channel) return;

    // Clear the shared ref before awaiting untrack. A stale cleanup from the
    // previous room generation must never null a newly subscribed channel.
    if (channelRef.current === channel) channelRef.current = null;

    try {
      await waitForRealtimeOperation(channel.untrack());
    } catch {
      // noop
    }
    supabase.removeChannel(channel);
  }, []);

  const cleanupSnapshotChannel = useCallback((expectedChannel?: RealtimeChannel | null) => {
    const channel = expectedChannel ?? snapshotChannelRef.current;
    if (!channel) return;
    supabase.removeChannel(channel);
    if (snapshotChannelRef.current === channel) snapshotChannelRef.current = null;
  }, []);

  const runNativePermissionRequest = useCallback(async <T,>(request: () => Promise<T>) => {
    nativePermissionRequestDepthRef.current += 1;
    try {
      return await request();
    } finally {
      nativePermissionRequestDepthRef.current = Math.max(0, nativePermissionRequestDepthRef.current - 1);
      if (nativePermissionRequestDepthRef.current === 0) {
        suppressedPermissionAppStateRef.current = null;
        setTimeout(() => {
          const actualState = AppState.currentState;
          if (actualState !== appStateRef.current) {
            appStateLifecycleHandlerRef.current?.(actualState);
          }
        }, 0);
      }
    }
  }, []);

  const ensureMicrophonePermission = useCallback(async () => {
    const generation = legacySessionGenerationRef.current;
    const currentPermission = await Audio.getPermissionsAsync().catch(() => null);
    if (generation !== legacySessionGenerationRef.current) return false;
    if (currentPermission) {
      const currentSnapshot = resolveMediaPermission(currentPermission);
      microphonePermissionRef.current = currentSnapshot;
      setMicrophonePermission(currentSnapshot);
      if (currentPermission.granted) return true;
    }
    microphonePermissionRequestedRef.current = true;
    logChatRtc("mic_permission_request_start", {
      roomId,
      currentState: microphonePermissionRef.current.state,
    });
    const permission = await runNativePermissionRequest(() => Audio.requestPermissionsAsync());
    if (generation !== legacySessionGenerationRef.current) return false;
    const nextPermission = resolveMediaPermission(permission);
    microphonePermissionRef.current = nextPermission;
    setMicrophonePermission(nextPermission);
    logChatRtc("mic_permission_request_result", {
      roomId,
      granted: permission.granted,
      canAskAgain: permission.canAskAgain,
      nextState: nextPermission.state,
    });
    return permission.granted;
  }, [roomId, runNativePermissionRequest]);

  const ensureCameraPermission = useCallback(async () => {
    if (cameraPermissionGrantedRef.current) return true;
    const generation = legacySessionGenerationRef.current;
    const currentPermission = await getCameraPermission().catch(() => null);
    if (generation !== legacySessionGenerationRef.current) return false;
    if (currentPermission) {
      const currentSnapshot = resolveMediaPermission(currentPermission);
      cameraPermissionSnapshotRef.current = currentSnapshot;
      cameraPermissionGrantedRef.current = !!currentPermission.granted;
      if (currentPermission.granted) return true;
    }
    cameraPermissionRequestedRef.current = true;
    logChatRtc("camera_permission_request_start", {
      roomId,
      currentState: cameraPermissionSnapshotRef.current.state,
    });
    const nextPermission = await runNativePermissionRequest(() => requestCameraPermission());
    if (generation !== legacySessionGenerationRef.current) return false;
    cameraPermissionSnapshotRef.current = resolveMediaPermission(nextPermission);
    cameraPermissionGrantedRef.current = !!nextPermission.granted;
    logChatRtc("camera_permission_request_result", {
      roomId,
      granted: !!nextPermission.granted,
      canAskAgain: !!nextPermission.canAskAgain,
    });
    return !!nextPermission.granted;
  }, [getCameraPermission, requestCameraPermission, roomId, runNativePermissionRequest]);

  const sendBroadcast = useCallback(async (event: string, payload: Record<string, unknown>) => {
    const channel = channelRef.current;
    const identity = identityRef.current;
    const activeRoom = roomRef.current;
    if (!channel || !identity?.userId || !activeRoom?.roomId) return false;
    if (
      event !== "webrtc:offer"
      && event !== "webrtc:answer"
      && event !== "webrtc:ice"
      && event !== "media:update"
      && event !== "room:end"
    ) return false;
    return broadcastCommunicationRoomSignal({
      roomId: activeRoom.roomId,
      event,
      payload,
    }).catch(() => false);
  }, []);

  const applyParticipantsFromSources = useCallback(async (presenceByUserId?: Record<string, PresenceStatePayload>) => {
    const generation = legacySessionGenerationRef.current;
    const resolvedIdentity = identityRef.current;
    const resolvedRoom = roomRef.current;
    if (!resolvedIdentity || !resolvedRoom) return [];

    const activeMemberships = getActiveCommunicationMemberships(membershipsRef.current);
    const allowedMemberships = activeMemberships.filter((membership) => normalizeRoomMembershipState(membership.membershipState) !== "removed");
    const presenceMap = presenceByUserId ?? presenceStateRef.current;
    const participantIds = new Set<string>([
      ...allowedMemberships.map((membership) => membership.userId),
      ...Object.keys(presenceMap),
    ]);

    const nextParticipants = [...participantIds].map((participantId) => {
      const membership = allowedMemberships.find((entry) => entry.userId === participantId);
      const presence = presenceMap[participantId];
      if (!membership && participantId !== resolvedIdentity.userId) return null;

      return {
        userId: participantId,
        displayName: String(
          presence?.displayName
            ?? membership?.displayName
            ?? (participantId === resolvedIdentity.userId ? resolvedIdentity.displayName : "Participant"),
        ).trim() || "Participant",
        avatarUrl: String(presence?.avatarUrl ?? membership?.avatarUrl ?? "").trim() || undefined,
        cameraOn: typeof presence?.cameraOn === "boolean"
          ? presence.cameraOn
          : (membership?.cameraEnabled ?? (participantId === resolvedIdentity.userId ? cameraEnabledRef.current : false)),
        micOn: typeof presence?.micOn === "boolean"
          ? presence.micOn
          : (membership?.micEnabled ?? (participantId === resolvedIdentity.userId ? micEnabledRef.current : false)),
        joinedAt: String(presence?.joinedAt ?? membership?.joinedAt ?? new Date().toISOString()),
        isHost: resolvedRoom.hostUserId === participantId,
      } as CommunicationParticipantPresence;
    }).filter(Boolean) as CommunicationParticipantPresence[];

    if (
      generation !== legacySessionGenerationRef.current
      || identityRef.current !== resolvedIdentity
      || roomRef.current !== resolvedRoom
    ) return [];
    setPresenceParticipants(nextParticipants);
    logChatRtc("participant_sources_applied", {
      roomId,
      participantCount: nextParticipants.length,
      participants: nextParticipants.map((participant) => ({
        userId: participant.userId,
        isHost: participant.isHost,
        cameraOn: participant.cameraOn,
        micOn: participant.micOn,
      })),
    });
    return nextParticipants;
  }, [roomId]);

  const refreshSnapshot = useCallback(async (targetRoomId?: string) => {
    const generation = legacySessionGenerationRef.current;
    const resolvedRoomId = formatRoomId(targetRoomId ?? roomRef.current?.roomId ?? roomId);
    if (!resolvedRoomId) return null;

    const snapshot = await getCommunicationRoomSnapshot(resolvedRoomId);
    if (generation !== legacySessionGenerationRef.current) return null;
    if (!snapshot) {
      logChatRtc("snapshot_missing", {
        roomId: resolvedRoomId,
      });
      return null;
    }

    roomRef.current = snapshot.room;
    membershipsRef.current = snapshot.memberships;
    setRoom(snapshot.room);
    setMemberships(snapshot.memberships);
    await applyParticipantsFromSources();
    logChatRtc("snapshot_loaded", {
      roomId: resolvedRoomId,
      roomStatus: snapshot.room.status,
      membershipCount: snapshot.memberships.length,
    });
    return snapshot;
  }, [applyParticipantsFromSources, roomId]);

  const updatePresence = useCallback(async (nextCameraEnabled: boolean, nextMicEnabled: boolean) => {
    const generation = legacySessionGenerationRef.current;
    const channel = channelRef.current;
    const resolvedRoom = roomRef.current;
    const resolvedIdentity = identityRef.current;
    if (!channel || !resolvedRoom || !resolvedIdentity) return false;

    const membership = await touchCommunicationRoomSession({
      roomId: resolvedRoom.roomId,
      userId: resolvedIdentity.userId,
      membershipState: channelStateRef.current === "reconnecting" ? "reconnecting" : "active",
      cameraEnabled: nextCameraEnabled,
      micEnabled: nextMicEnabled,
      displayName: resolvedIdentity.displayName,
      avatarUrl: resolvedIdentity.avatarUrl,
    }).catch((presenceError) => {
      reportRuntimeError("communication-membership-media-update", presenceError, {
        roomId: resolvedRoom.roomId,
      });
      return null;
    });
    if (
      !membership
      || formatRoomId(membership.roomId) !== resolvedRoom.roomId
      || membership.userId !== resolvedIdentity.userId
      || membership.cameraEnabled !== nextCameraEnabled
      || membership.micEnabled !== nextMicEnabled
      || generation !== legacySessionGenerationRef.current
      || channelRef.current !== channel
      || roomRef.current !== resolvedRoom
      || identityRef.current !== resolvedIdentity
    ) return false;

    const trackResult = await channel.track(
      buildCommunicationPresencePayload({
        identity: resolvedIdentity,
        room: resolvedRoom,
        media: {
          cameraEnabled: nextCameraEnabled,
          micEnabled: nextMicEnabled,
        },
        joinedAt: localJoinedAtRef.current,
      }),
    ).catch((presenceError) => {
      reportRuntimeError("communication-realtime-presence-update", presenceError, {
        roomId: resolvedRoom.roomId,
      });
      return null;
    });
    return trackResult === "ok"
      && generation === legacySessionGenerationRef.current
      && channelRef.current === channel
      && roomRef.current === resolvedRoom
      && identityRef.current === resolvedIdentity;
  }, []);

  const runSerializedMediaControl = useCallback(<T,>(task: () => Promise<T>) => {
    pendingMediaControlCountRef.current += 1;
    setMediaControlsBusy(true);
    const result = mediaControlTailRef.current.then(task, task);
    mediaControlTailRef.current = result.then(() => undefined, () => undefined);
    return result.finally(() => {
      pendingMediaControlCountRef.current = Math.max(0, pendingMediaControlCountRef.current - 1);
      if (pendingMediaControlCountRef.current === 0) setMediaControlsBusy(false);
    });
  }, []);

  const ensureInitialLocalStream = useCallback(async (requestMissingPermissions = true) => {
    const generation = legacySessionGenerationRef.current;
    if (localStreamRef.current) return localStreamRef.current;
    const appIsActive = appStateRef.current === "active";
    const backgroundAudioAllowed = canAttemptNativeCallBackgroundAudio({
      appState: appStateRef.current,
      allowBackgroundAudio: allowBackgroundAudioRef.current,
      micRequested: micEnabledRef.current,
    });
    if (!appIsActive && !backgroundAudioAllowed) return null;

    const requestedCamera = cameraEnabledRef.current;
    const requestedMic = micEnabledRef.current;
    const wantsCamera = appIsActive && requestedCamera;
    const wantsMic = requestedMic && (appIsActive || backgroundAudioAllowed);
    logChatRtc("local_stream_start", {
      roomId,
      wantsCamera,
      wantsMic,
    });
    const canUseCamera = wantsCamera
      ? requestMissingPermissions && appIsActive
        ? await ensureCameraPermission()
        : cameraPermissionSnapshotRef.current.state === "granted"
      : false;
    if (generation !== legacySessionGenerationRef.current) return null;
    const canUseMic = wantsMic
      ? requestMissingPermissions && appIsActive
        ? await ensureMicrophonePermission()
        : microphonePermissionRef.current.state === "granted"
      : false;
    if (generation !== legacySessionGenerationRef.current) return null;

    if (appIsActive && requestedCamera && !canUseCamera) {
      cameraEnabledRef.current = false;
      setCameraEnabled(false);
    }
    if (appIsActive && requestedMic && !canUseMic) {
      micEnabledRef.current = false;
      setMicEnabled(false);
    }

    if (!canUseCamera && !canUseMic) {
      setLocalStreamURL("");
      logChatRtc("local_stream_skipped_no_permissions", {
        roomId,
        canUseCamera,
        canUseMic,
      });
      return null;
    }

    const stream = await createCommunicationMediaStream({
      audio: canUseMic,
      video: canUseCamera,
    }).catch(() => null);

    if (generation !== legacySessionGenerationRef.current) {
      stopCommunicationStream(stream);
      return null;
    }

    if (!stream) {
      setLocalStreamURL("");
      logChatRtc("local_stream_failed", {
        roomId,
        canUseCamera,
        canUseMic,
      });
      return null;
    }

    const cameraTrackReady = canUseCamera
      && !!getCommunicationTrack(stream, "video")
      && setCommunicationTrackEnabled(stream, "video", true);
    const microphoneTrackReady = canUseMic
      && !!getCommunicationTrack(stream, "audio")
      && setCommunicationTrackEnabled(stream, "audio", true);

    if (requestedCamera && !cameraTrackReady) {
      cameraEnabledRef.current = false;
      setCameraEnabled(false);
    }
    if (requestedMic && !microphoneTrackReady) {
      micEnabledRef.current = false;
      setMicEnabled(false);
    }
    if (!cameraTrackReady && !microphoneTrackReady) {
      stopCommunicationStream(stream);
      setLocalStreamURL("");
      logChatRtc("local_stream_missing_requested_tracks", {
        roomId,
        canUseCamera,
        canUseMic,
      });
      return null;
    }

    localStreamRef.current = stream;
    setLocalStreamURL(getCommunicationStreamURL(stream));
    setLocalVideoStreamURL(getRenderableVideoStreamURL(stream));
    logChatRtc("local_stream_success", {
      roomId,
      canUseCamera: cameraTrackReady,
      canUseMic: microphoneTrackReady,
      streamURL: getCommunicationStreamURL(stream),
    });
    return stream;
  }, [ensureCameraPermission, ensureMicrophonePermission, roomId]);

  const attachMissingLocalTracks = useCallback(async (
    peerConnection: any,
    requestMissingPermissions = true,
  ) => {
    const localStream = await ensureInitialLocalStream(requestMissingPermissions);
    if (!localStream) return;
    const senders = typeof peerConnection.getSenders === "function" ? peerConnection.getSenders() : [];
    for (const track of localStream.getTracks()) {
      if (String(track.readyState ?? "").trim().toLowerCase() === "ended") continue;
      const alreadyAdded = senders.some((sender: any) => sender?.track?.id === track.id);
      if (alreadyAdded) continue;

      const endedSender = senders.find((sender: any) => (
        sender?.track?.kind === track.kind
        && String(sender?.track?.readyState ?? "").toLowerCase() === "ended"
        && typeof sender?.replaceTrack === "function"
      ));
      if (endedSender) {
        await endedSender.replaceTrack(track);
        continue;
      }

      peerConnection.addTrack(track, localStream);
    }
    logChatRtc("diag_local_tracks_attached", {
      roomId,
      localStream: describeStream(localStream),
      peer: describePeerConnection(peerConnection),
    });
  }, [ensureInitialLocalStream, roomId]);

  const logInboundVideoDiagnostics = useCallback(async (remoteUserId: string, peerConnection: any, reason: string) => {
    if (!__DEV__) return;
    try {
      const [inboundVideo, inboundAudio, outboundVideo, outboundAudio] = await Promise.all([
        summarizeInboundRtpStats(peerConnection, "video"),
        summarizeInboundRtpStats(peerConnection, "audio"),
        summarizeOutboundRtpStats(peerConnection, "video"),
        summarizeOutboundRtpStats(peerConnection, "audio"),
      ]);
      logChatRtc("diag_rtp_stats", {
        roomId,
        remoteUserId,
        reason,
        inboundVideo,
        inboundAudio,
        outboundVideo,
        outboundAudio,
        peer: describePeerConnection(peerConnection),
      });
    } catch (error) {
      logChatRtc("diag_rtp_stats_failed", {
        roomId,
        remoteUserId,
        reason,
        message: error instanceof Error ? error.message : "unknown_error",
      });
    }
  }, [roomId]);

  const ensurePeerConnection = useCallback(async (remoteUserId: string) => {
    const generation = legacySessionGenerationRef.current;
    const rtc = getCommunicationRTCModule();
    const resolvedIdentity = identityRef.current;
    if (!rtc || !resolvedIdentity) return null;

    if (peerConnectionsRef.current[remoteUserId]) {
      const existingPeerConnection = peerConnectionsRef.current[remoteUserId];
      logChatRtc("peer_connection_reuse", {
        roomId,
        remoteUserId,
      });
      await attachMissingLocalTracks(existingPeerConnection);
      if (
        generation !== legacySessionGenerationRef.current
        || peerConnectionsRef.current[remoteUserId] !== existingPeerConnection
      ) return null;
      return existingPeerConnection;
    }

    const peerConnection = new rtc.RTCPeerConnection({
      iceServers: COMMUNICATION_DEFAULT_ICE_SERVERS,
    });
    logChatRtc("peer_connection_created", {
      roomId,
      remoteUserId,
    });

    await attachMissingLocalTracks(peerConnection);
    if (generation !== legacySessionGenerationRef.current || identityRef.current !== resolvedIdentity) {
      peerConnection.close();
      return null;
    }
    const isCurrentPeer = () => (
      generation === legacySessionGenerationRef.current
      && peerConnectionsRef.current[remoteUserId] === peerConnection
    );

    (peerConnection as any).addEventListener("icecandidate", (event: any) => {
      if (!event?.candidate || !isCurrentPeer()) return;
      logChatRtc("ice_candidate_local", {
        roomId,
        remoteUserId,
        hasCandidate: !!event?.candidate,
      });
      void sendBroadcast("webrtc:ice", {
        targetUserId: remoteUserId,
        fromUserId: resolvedIdentity.userId,
        candidate: {
          candidate: event.candidate.candidate ?? null,
          sdpMid: event.candidate.sdpMid ?? null,
          sdpMLineIndex: typeof event.candidate.sdpMLineIndex === "number" ? event.candidate.sdpMLineIndex : null,
        },
      });
    });

    (peerConnection as any).addEventListener("track", (event: any) => {
      if (!isCurrentPeer()) return;
      const track = event?.track;
      const primaryStream = event?.streams?.[0];
      const hasVideoTrack =
        typeof primaryStream?.getVideoTracks === "function"
          ? primaryStream.getVideoTracks().length > 0
          : false;
      const hasReceiverVideoTrack =
        typeof peerConnection?.getReceivers === "function"
          ? peerConnection.getReceivers().some((receiver: any) => String(receiver?.track?.kind ?? "") === "video")
          : false;

      // Android can surface the audio stream first, and some devices do not
      // fire a second track event when the video receiver becomes available.
      // Bind as soon as the peer connection exposes any video receiver.
      if (track?.kind !== "video" && !hasVideoTrack && !hasReceiverVideoTrack) {
        setTimeout(() => {
          if (!isCurrentPeer()) return;
          const delayedStream = buildRemoteRenderStream(rtc, peerConnection, primaryStream, track);
          const delayedHasVideo =
            typeof delayedStream?.getVideoTracks === "function"
              ? delayedStream.getVideoTracks().length > 0
              : false;
          if (!delayedHasVideo) return;
          logChatRtc("remote_stream_attached", {
            roomId,
            remoteUserId,
            trackKind: String(track?.kind ?? ""),
            delayedAudioFirstBind: true,
            eventTrack: describeTrack(track),
            receiverTrack: describeTrack(event?.receiver?.track),
            primaryStream: describeStream(primaryStream),
            boundStream: describeStream(delayedStream),
            peer: describePeerConnection(peerConnection),
          });
          setRemoteStreamsByUserId((prev) => ({
            ...prev,
            [remoteUserId]: delayedStream,
          }));
          setConnectionStateByUserId((prev) => ({
            ...prev,
            [remoteUserId]: "connected",
          }));
          void logInboundVideoDiagnostics(remoteUserId, peerConnection, "track_audio_first_delayed");
        }, 350);
        return;
      }

      const stream = buildRemoteRenderStream(
        rtc,
        peerConnection,
        primaryStream,
        track,
      );

      logChatRtc("remote_stream_attached", {
        roomId,
        remoteUserId,
        trackKind: String(track?.kind ?? ""),
        eventTrack: describeTrack(track),
        receiverTrack: describeTrack(event?.receiver?.track),
        primaryStream: describeStream(primaryStream),
        boundStream: describeStream(stream),
        peer: describePeerConnection(peerConnection),
      });
      setRemoteStreamsByUserId((prev) => ({
        ...prev,
        [remoteUserId]: stream,
      }));
      setConnectionStateByUserId((prev) => ({
        ...prev,
        [remoteUserId]: "connected",
      }));
      void logInboundVideoDiagnostics(remoteUserId, peerConnection, "track");
      setTimeout(() => {
        if (!isCurrentPeer()) return;
        void logInboundVideoDiagnostics(remoteUserId, peerConnection, "track_delayed");
      }, 1500);
      setTimeout(() => {
        if (!isCurrentPeer()) return;
        void logInboundVideoDiagnostics(remoteUserId, peerConnection, "track_settled");
      }, 4000);
    });

    (peerConnection as any).addEventListener("connectionstatechange", () => {
      if (!isCurrentPeer()) return;
      const state = String(peerConnection.connectionState ?? "connecting");
      const mappedState: PeerConnectionState = state === "connected"
        ? "connected"
        : state === "failed"
          ? "failed"
          : state === "disconnected" || state === "closed"
            ? "disconnected"
            : "connecting";
      setConnectionStateByUserId((prev) => ({
        ...prev,
        [remoteUserId]: mappedState,
      }));
      logChatRtc("peer_connection_state", {
        roomId,
        remoteUserId,
        state: mappedState,
        peer: describePeerConnection(peerConnection),
      });
      if (mappedState === "connected") {
        clearOfferRetry(remoteUserId);
      }
      if (mappedState === "failed") requestLegacySessionRestart("peer_failed", generation);
      else if (mappedState === "disconnected") requestLegacySessionRestart("peer_disconnected", generation);
      if (mappedState === "connected" || mappedState === "connecting") {
        void logInboundVideoDiagnostics(remoteUserId, peerConnection, `pc_${mappedState}`);
      }
    });

    (peerConnection as any).addEventListener("iceconnectionstatechange", () => {
      if (!isCurrentPeer()) return;
      logChatRtc("diag_ice_connection_state", {
        roomId,
        remoteUserId,
        peer: describePeerConnection(peerConnection),
      });
    });

    (peerConnection as any).addEventListener("signalingstatechange", () => {
      if (!isCurrentPeer()) return;
      logChatRtc("diag_signaling_state", {
        roomId,
        remoteUserId,
        peer: describePeerConnection(peerConnection),
      });
    });

    if (generation !== legacySessionGenerationRef.current || identityRef.current !== resolvedIdentity) {
      peerConnection.close();
      return null;
    }
    peerConnectionsRef.current[remoteUserId] = peerConnection;
    setConnectionStateByUserId((prev) => ({
      ...prev,
      [remoteUserId]: "connecting",
    }));
    return peerConnection;
  }, [attachMissingLocalTracks, clearOfferRetry, logInboundVideoDiagnostics, requestLegacySessionRestart, roomId, sendBroadcast]);

  const broadcastOfferDescription = useCallback(async (remoteUserId: string, description: { type?: unknown; sdp?: unknown } | null | undefined) => {
    const generation = legacySessionGenerationRef.current;
    const resolvedIdentity = identityRef.current;
    if (!resolvedIdentity || !description) return false;

    const descriptionType = String(description.type ?? "").trim();
    if (descriptionType !== "offer") return false;

    const sent = await sendBroadcast("webrtc:offer", {
      targetUserId: remoteUserId,
      fromUserId: resolvedIdentity.userId,
      description: {
        type: descriptionType,
        sdp: typeof description.sdp === "string" ? description.sdp : null,
      },
    });
    const current = sent
      && generation === legacySessionGenerationRef.current
      && identityRef.current === resolvedIdentity;
    if (current) lastOfferSentAtRef.current[remoteUserId] = Date.now();
    return current;
  }, [sendBroadcast]);

  const scheduleOfferRetry = useCallback((remoteUserId: string) => {
    const generation = legacySessionGenerationRef.current;
    clearOfferRetry(remoteUserId);
    const timer = setTimeout(() => {
      if (offerRetryTimersRef.current[remoteUserId] === timer) delete offerRetryTimersRef.current[remoteUserId];
      if (generation !== legacySessionGenerationRef.current) return;
      const peerConnection = peerConnectionsRef.current[remoteUserId];
      if (!peerConnection) return;

      const connectionState = String(peerConnection.connectionState ?? "");
      if (connectionState === "connected" || connectionState === "closed") return;

      const localDescription = peerConnection.localDescription
        ?? peerConnection.pendingLocalDescription
        ?? peerConnection.currentLocalDescription;
      if (String(localDescription?.type ?? "") !== "offer") return;

      logChatRtc("offer_retry_resend", {
        roomId,
        remoteUserId,
        peer: describePeerConnection(peerConnection),
      });
      void broadcastOfferDescription(remoteUserId, localDescription);
    }, OFFER_RETRY_DELAY_MILLIS);
    offerRetryTimersRef.current[remoteUserId] = timer;
  }, [broadcastOfferDescription, clearOfferRetry, roomId]);

  const createAndSendOffer = useCallback((remoteUserId: string, forceRenegotiation = false) => (
    runSerializedPeerOffer(remoteUserId, async () => {
      const generation = legacySessionGenerationRef.current;
      const resolvedIdentity = identityRef.current;
      if (!resolvedIdentity) return false;

      const peerConnection = await ensurePeerConnection(remoteUserId);
      if (
        !peerConnection
        || generation !== legacySessionGenerationRef.current
        || identityRef.current !== resolvedIdentity
        || peerConnectionsRef.current[remoteUserId] !== peerConnection
      ) return false;

      const connectionState = String(peerConnection.connectionState ?? "");
      if ((!forceRenegotiation && connectionState === "connected") || connectionState === "closed") {
        clearOfferRetry(remoteUserId);
        return true;
      }

      const signalingState = String(peerConnection.signalingState ?? "stable");
      const existingLocalDescription = peerConnection.localDescription
        ?? peerConnection.pendingLocalDescription
        ?? peerConnection.currentLocalDescription;
      if (signalingState !== "stable") {
        if (String(existingLocalDescription?.type ?? "") === "offer") {
          const resent = await broadcastOfferDescription(remoteUserId, existingLocalDescription);
          if (generation !== legacySessionGenerationRef.current || peerConnectionsRef.current[remoteUserId] !== peerConnection) return false;
          scheduleOfferRetry(remoteUserId);
          return resent;
        }
        logChatRtc("offer_skipped_unstable", {
          roomId,
          remoteUserId,
          peer: describePeerConnection(peerConnection),
        });
        return false;
      }

      const lastOfferSentAt = lastOfferSentAtRef.current[remoteUserId] ?? 0;
      if (!forceRenegotiation && Date.now() - lastOfferSentAt < OFFER_RETRY_MIN_INTERVAL_MILLIS) return true;

      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      if (generation !== legacySessionGenerationRef.current || peerConnectionsRef.current[remoteUserId] !== peerConnection) return false;
      const normalizedOffer = {
        ...offer,
        sdp: preferVideoCodecInSdp(offer.sdp, PREFERRED_VIDEO_CODEC),
      };
      logChatRtc("offer_created", {
        roomId,
        remoteUserId,
        peer: describePeerConnection(peerConnection),
      });
      await peerConnection.setLocalDescription(normalizedOffer);
      if (generation !== legacySessionGenerationRef.current || peerConnectionsRef.current[remoteUserId] !== peerConnection) return false;
      const sent = await broadcastOfferDescription(remoteUserId, normalizedOffer);
      if (!sent || generation !== legacySessionGenerationRef.current || peerConnectionsRef.current[remoteUserId] !== peerConnection) return false;
      scheduleOfferRetry(remoteUserId);
      return true;
    }, !forceRenegotiation)
  ), [
    broadcastOfferDescription,
    clearOfferRetry,
    ensurePeerConnection,
    roomId,
    runSerializedPeerOffer,
    scheduleOfferRetry,
  ]);

  const syncPeerConnections = useCallback(async (nextParticipants: CommunicationParticipantPresence[]) => {
    const generation = legacySessionGenerationRef.current;
    const resolvedIdentity = identityRef.current;
    if (!resolvedIdentity) return;
    const isCurrent = () => generation === legacySessionGenerationRef.current && identityRef.current === resolvedIdentity;

    logChatRtc("sync_peer_connections", {
      roomId,
      participantCount: nextParticipants.length,
      remoteTargetCount: nextParticipants.filter((participant) => participant.userId !== resolvedIdentity.userId).length,
    });
    const ordered = [...nextParticipants].sort((a, b) => {
      if (a.joinedAt !== b.joinedAt) return a.joinedAt.localeCompare(b.joinedAt);
      return a.userId.localeCompare(b.userId);
    });

    const allowedParticipants = ordered.slice(0, COMMUNICATION_ROOM_MAX_PARTICIPANTS);
    const localIsAllowed = allowedParticipants.some((participant) => participant.userId === resolvedIdentity.userId);
    if (!localIsAllowed && ordered.some((participant) => participant.userId === resolvedIdentity.userId)) {
      if (!isCurrent()) return;
      await cleanupChannel();
      if (!isCurrent()) return;
      cleanupSessionMedia();
      setError("Room is full. This communication room is limited to four active participants.");
      onRoomEndedRef.current?.("room-full");
      return;
    }

    const allowedRemoteIds = new Set(
      allowedParticipants
        .filter((participant) => participant.userId !== resolvedIdentity.userId)
        .map((participant) => participant.userId),
    );

    Object.keys(peerConnectionsRef.current).forEach((userId) => {
      if (isCurrent() && !allowedRemoteIds.has(userId)) cleanupRemotePeer(userId);
    });

    for (const participant of allowedParticipants) {
      if (!isCurrent()) return;
      if (participant.userId === resolvedIdentity.userId) continue;

      const shouldInitiateOffer = shouldInitiatePeerOffer({
        localUserId: resolvedIdentity.userId,
        remoteUserId: participant.userId,
        hostUserId: roomRef.current?.hostUserId,
      });
      const existingPeerConnection = peerConnectionsRef.current[participant.userId];
      if (existingPeerConnection) {
        await attachMissingLocalTracks(existingPeerConnection);
        if (!isCurrent() || peerConnectionsRef.current[participant.userId] !== existingPeerConnection) return;
        if (shouldInitiateOffer) {
          const connectionState = String(existingPeerConnection.connectionState ?? "");
          const lastOfferSentAt = lastOfferSentAtRef.current[participant.userId] ?? 0;
          if (
            connectionState !== "connected"
            && connectionState !== "closed"
            && Date.now() - lastOfferSentAt >= OFFER_RETRY_MIN_INTERVAL_MILLIS
          ) {
            await createAndSendOffer(participant.userId);
            if (!isCurrent()) return;
          }
        }
        continue;
      }

      if (shouldInitiateOffer) {
        await createAndSendOffer(participant.userId);
      } else {
        await ensurePeerConnection(participant.userId);
      }
      if (!isCurrent()) return;
    }
  }, [
    attachMissingLocalTracks,
    cleanupChannel,
    cleanupRemotePeer,
    cleanupSessionMedia,
    createAndSendOffer,
    ensurePeerConnection,
    roomId,
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (!roomRef.current || !identityRef.current || loading) return;
    if (presenceParticipants.length === 0) return;

    void syncPeerConnections(presenceParticipants);
  }, [enabled, loading, presenceParticipants, syncPeerConnections]);

  const setPresenceFromChannel = useCallback(async () => {
    const generation = legacySessionGenerationRef.current;
    const channel = channelRef.current;
    if (!channel) return;

    const mapped = mapPresenceState(channel.presenceState<PresenceStatePayload>());
    presenceStateRef.current = mapped;
    logChatRtc("presence_sync", {
      roomId,
      participantCount: Object.keys(mapped).length,
      participantIds: Object.keys(mapped),
    });
    const nextParticipants = await applyParticipantsFromSources(mapped);
    if (generation !== legacySessionGenerationRef.current || channelRef.current !== channel) return;
    await syncPeerConnections(nextParticipants);
  }, [applyParticipantsFromSources, roomId, syncPeerConnections]);

  const leaveRoom = useCallback(async (options?: { endRoomIfHost?: boolean }) => {
    const generation = legacySessionGenerationRef.current;
    if (endingGenerationRef.current === generation) return;
    endingGenerationRef.current = generation;
    const capturedChannel = channelRef.current;
    const capturedSnapshotChannel = snapshotChannelRef.current;
    const capturedMedia = {
      answerWaiters: Object.entries(legacyMicAnswerWaitersRef.current),
      auxiliaryStreams: [...auxiliaryStreamsRef.current],
      localStream: localStreamRef.current,
      offerRetryTimers: Object.entries(offerRetryTimersRef.current),
      peers: Object.entries(peerConnectionsRef.current),
    };
    if (legacySessionGenerationRef.current === generation) {
      legacySessionGenerationRef.current += 1;
    }
    logChatRtc("leave_room_start", {
      roomId,
      endRoomIfHost: !!options?.endRoomIfHost,
    });

    const resolvedRoom = roomRef.current;
    const resolvedIdentity = identityRef.current;

    if (resolvedRoom && resolvedIdentity) {
      if (options?.endRoomIfHost && resolvedRoom.hostUserId === resolvedIdentity.userId) {
        if (capturedChannel) {
          await broadcastCommunicationRoomSignal({
            roomId: resolvedRoom.roomId,
            event: "room:end",
            payload: {
              reason: "host-left",
            },
          }).catch(() => false);
        }
        await endCommunicationRoom(resolvedRoom.roomId, resolvedIdentity.userId).catch(() => {});
      }

      await leaveCommunicationRoomSession({
        roomId: resolvedRoom.roomId,
        userId: resolvedIdentity.userId,
      }).catch(() => null);
    }

    trackEvent("communication_disconnect", {
      surface: analyticsSurface,
      role: analyticsRole,
      roomId: resolvedRoom?.roomId ?? roomId,
      endRoomIfHost: !!options?.endRoomIfHost,
      reason: options?.endRoomIfHost ? "host_end_call" : "leave",
    });

    await cleanupChannel(capturedChannel);
    cleanupSnapshotChannel(capturedSnapshotChannel);
    cleanupSessionMedia(capturedMedia);
    logChatRtc("leave_room_complete", {
      roomId,
      endRoomIfHost: !!options?.endRoomIfHost,
    });
  }, [analyticsRole, analyticsSurface, cleanupChannel, cleanupSessionMedia, cleanupSnapshotChannel, roomId]);

  useEffect(() => {
    let active = true;
    const sessionGeneration = legacySessionGenerationRef.current + 1;
    legacySessionGenerationRef.current = sessionGeneration;
    legacySessionRestartRequestedGenerationRef.current = null;
    const isActiveGeneration = () => (
      active && legacySessionGenerationRef.current === sessionGeneration
    );

    const init = async () => {
      if (!enabled) {
        setRoom(null);
        setIdentity(null);
        setMemberships([]);
        setPresenceParticipants([]);
        setRemoteStreamsByUserId({});
        setConnectionStateByUserId({});
        setLocalStreamURL("");
        setLoading(false);
        setError(null);
        setChannelState("idle");
        return;
      }
      if (!roomId) {
        setError("Missing communication room.");
        setLoading(false);
        return;
      }
      if (!isRtcAvailable) {
        logChatRtc("init_blocked_no_rtc", {
          roomId,
        });
        setError("Communication rooms need a native development build on this device.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setChannelState("connecting");

      let resolvedIdentity = await readCommunicationIdentity(authenticatedUserId);
      let joinedMembership: CommunicationRoomMembership | null = null;
      for (let attempt = 0; attempt < 3 && !joinedMembership; attempt += 1) {
        if (!isActiveGeneration()) return;
        if (resolvedIdentity.userId) {
          joinedMembership = await joinCommunicationRoomSession({
            roomId,
            userId: resolvedIdentity.userId,
            displayName: resolvedIdentity.displayName,
            avatarUrl: resolvedIdentity.avatarUrl,
            // Joining establishes authority, not capture truth. Media is
            // promoted only after native tracks and Realtime are both proved.
            cameraEnabled: false,
            micEnabled: false,
          }).catch((error) => {
            logChatRtc("join_room_failed", {
              roomId,
              message: error instanceof Error ? error.message : "unknown_error",
            });
            return null;
          });
        }
        if (!joinedMembership && attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          resolvedIdentity = await readCommunicationIdentity(authenticatedUserId);
        }
      }
      if (!isActiveGeneration()) return;

      identityRef.current = resolvedIdentity;
      setIdentity(resolvedIdentity);
      localJoinedAtRef.current = new Date().toISOString();
      logChatRtc("join_room_result", {
        roomId,
        joined: !!joinedMembership,
        userId: resolvedIdentity.userId,
      });

      if (!isActiveGeneration()) return;

      const snapshot = await refreshSnapshot(roomId);
      if (!isActiveGeneration()) return;

      if (!snapshot) {
        logChatRtc("init_room_unavailable", {
          roomId,
          roomStatus: "unreadable",
        });
        setError("This communication room is unavailable.");
        setChannelState("error");
        setLoading(false);
        trackEvent("room_join_failure", {
          surface: analyticsSurface,
          role: analyticsRole,
          reason: joinedMembership ? "snapshot_unreadable" : "join_unavailable",
          roomId,
        });
        return;
      }

      if (snapshot.room.status === "ended") {
        logChatRtc("init_room_unavailable", {
          roomId,
          roomStatus: snapshot.room.status,
        });
        setError("This communication room is unavailable.");
        setLoading(false);
        onRoomEndedRef.current?.("ended");
        return;
      }

      if (!joinedMembership) {
        const currentMembership = snapshot.memberships.find((membership) => membership.userId === resolvedIdentity.userId) ?? null;
        const access = await resolveRoomAccess({
          roomSurface: "communication",
          room: snapshot.room,
          membership: currentMembership,
          userId: resolvedIdentity.userId,
        });
        const activeMemberships = getActiveCommunicationMemberships(snapshot.memberships);
        if (access.isAllowed && !currentMembership && activeMemberships.length >= COMMUNICATION_ROOM_MAX_PARTICIPANTS) {
          logChatRtc("join_room_blocked_full", {
            roomId,
            activeMembershipCount: activeMemberships.length,
          });
          setError("Room is full. This communication room is limited to four active participants.");
          setLoading(false);
          trackEvent("room_join_failure", {
            surface: analyticsSurface,
            role: analyticsRole,
            reason: "room_full",
            roomId,
          });
          onRoomEndedRef.current?.("room-full");
          return;
        }

        logChatRtc("join_room_blocked_unavailable", {
          roomId,
          hasCurrentMembership: !!currentMembership,
          activeMembershipCount: activeMemberships.length,
        });
        setError("This communication room is unavailable.");
        setLoading(false);
        trackEvent("room_join_failure", {
          surface: analyticsSurface,
          role: analyticsRole,
          reason: "room_unavailable",
          roomId,
        });
        return;
      }

      let realtimeAccessToken = String(authenticatedAccessToken ?? "").trim();
      let realtimeUserId = String(authenticatedUserId ?? "").trim();
      if (!realtimeAccessToken) {
        const { data: realtimeSessionData } = await supabase.auth.getSession();
        realtimeAccessToken = String(realtimeSessionData.session?.access_token ?? "").trim();
        realtimeUserId = String(realtimeSessionData.session?.user?.id ?? "").trim();
      }
      if (!realtimeAccessToken || realtimeUserId !== resolvedIdentity.userId) {
        throw new Error("communication_realtime_auth_required");
      }
      await supabase.realtime.setAuth(realtimeAccessToken);
      if (!isActiveGeneration()) return;

      await ensureInitialLocalStream();
      if (!isActiveGeneration()) return;

      const stateChannelName = `comm-room-state-${snapshot.room.roomId}`;
      const presenceChannelName = buildCommunicationChannelName(snapshot.room.roomId);

      supabase.getChannels().forEach((existingChannel) => {
        if (
          existingChannel.topic === stateChannelName
          || existingChannel.topic === `realtime:${stateChannelName}`
          || existingChannel.topic === presenceChannelName
          || existingChannel.topic === `realtime:${presenceChannelName}`
        ) {
          supabase.removeChannel(existingChannel);
        }
      });

      const stateChannel = supabase
        .channel(stateChannelName)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "communication_room_memberships",
            filter: `room_id=eq.${snapshot.room.roomId}`,
          },
          () => {
            if (!isActiveGeneration()) return;
            void refreshSnapshot(snapshot.room.roomId);
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "communication_rooms",
            filter: `room_id=eq.${snapshot.room.roomId}`,
          },
          () => {
            if (!isActiveGeneration()) return;
            void refreshSnapshot(snapshot.room.roomId);
          },
        )
        .subscribe();

      snapshotChannelRef.current = stateChannel;

      const channel = supabase.channel(presenceChannelName, {
        config: {
          private: true,
          presence: { key: resolvedIdentity.userId },
        },
      });

      const isAuthorizedInboundParticipant = (candidateUserId: unknown) => {
        const candidate = String(candidateUserId ?? "").trim();
        if (!candidate || candidate === resolvedIdentity.userId) return false;
        return getActiveCommunicationMemberships(membershipsRef.current).some((membership) => (
          membership.userId === candidate
          && (
            (candidate === snapshot.room.hostUserId && membership.role === "host")
            || (candidate !== snapshot.room.hostUserId && membership.role === "participant")
          )
        ));
      };
      const isExactInboundRoom = (payload: Record<string, unknown>) => (
        formatRoomId(String(payload?.roomId ?? "")) === snapshot.room.roomId
      );

      channel.on("presence", { event: "sync" }, () => {
        if (!isActiveGeneration()) return;
        void setPresenceFromChannel();
      });

      channel.on("presence", { event: "leave" }, ({ key }: { key: string }) => {
        if (!isActiveGeneration()) return;
        const departingUserId = String(key ?? "").trim();
        if (!departingUserId) return;
        logChatRtc("presence_leave", {
          roomId: snapshot.room.roomId,
          userId: departingUserId,
        });
        cleanupRemotePeer(departingUserId);
        delete presenceStateRef.current[departingUserId];
        void applyParticipantsFromSources();
      });

      channel.on("broadcast", { event: "webrtc:offer" }, async ({ payload }: { payload: Record<string, unknown> }) => {
        if (!isActiveGeneration()) return;
        const currentIdentity = identityRef.current;
        const rtc = getCommunicationRTCModule();
        if (!currentIdentity || !rtc) return;

        const targetUserId = String(payload?.targetUserId ?? "").trim();
        const fromUserId = String(payload?.fromUserId ?? "").trim();
        const negotiationId = String(payload?.negotiationId ?? "").trim();
        if (
          !isExactInboundRoom(payload)
          ||
          !targetUserId
          || targetUserId !== currentIdentity.userId
          || !isAuthorizedInboundParticipant(fromUserId)
        ) return;
        logChatRtc("offer_received", {
          roomId: snapshot.room.roomId,
          fromUserId,
          targetUserId,
        });

        const peerConnection = await ensurePeerConnection(fromUserId);
        if (!peerConnection || !isActiveGeneration()) return;

        await peerConnection.setRemoteDescription(new rtc.RTCSessionDescription(payload?.description as any));
        if (!isActiveGeneration()) return;
        logChatRtc("diag_offer_remote_description_set", {
          roomId: snapshot.room.roomId,
          fromUserId,
          peer: describePeerConnection(peerConnection),
        });
        void logInboundVideoDiagnostics(fromUserId, peerConnection, "offer_remote_description_set");
        const answer = await peerConnection.createAnswer();
        if (!isActiveGeneration()) return;
        const normalizedAnswer = {
          ...answer,
          sdp: preferVideoCodecInSdp(answer.sdp, PREFERRED_VIDEO_CODEC),
        };
        logChatRtc("answer_created", {
          roomId: snapshot.room.roomId,
          fromUserId,
        });
        await peerConnection.setLocalDescription(normalizedAnswer);
        if (!isActiveGeneration()) return;
        await sendBroadcast("webrtc:answer", {
          // Route the answer back to the original offer sender.
          targetUserId: fromUserId,
          fromUserId: currentIdentity.userId,
          ...(negotiationId ? { negotiationId } : {}),
          description: {
            type: normalizedAnswer.type,
            sdp: normalizedAnswer.sdp ?? null,
          },
        });
      });

      channel.on("broadcast", { event: "webrtc:answer" }, async ({ payload }: { payload: Record<string, unknown> }) => {
        if (!isActiveGeneration()) return;
        const currentIdentity = identityRef.current;
        const rtc = getCommunicationRTCModule();
        if (!currentIdentity || !rtc) return;

        const targetUserId = String(payload?.targetUserId ?? "").trim();
        const fromUserId = String(payload?.fromUserId ?? "").trim();
        const negotiationId = String(payload?.negotiationId ?? "").trim();
        if (
          !isExactInboundRoom(payload)
          ||
          !targetUserId
          || targetUserId !== currentIdentity.userId
          || !isAuthorizedInboundParticipant(fromUserId)
        ) return;
        const correlatedWaiter = negotiationId ? legacyMicAnswerWaitersRef.current[negotiationId] : null;
        if (negotiationId && !correlatedWaiter) return;
        if (
          correlatedWaiter
          && (
            correlatedWaiter.remoteUserId !== fromUserId
            || correlatedWaiter.authority.generation !== legacySessionGenerationRef.current
            || correlatedWaiter.authority.channel !== channel
            || correlatedWaiter.authority.channel !== channelRef.current
            || correlatedWaiter.authority.roomId !== formatRoomId(roomRef.current?.roomId ?? "")
            || correlatedWaiter.authority.userId !== currentIdentity.userId
          )
        ) return;
        logChatRtc("answer_received", {
          roomId: snapshot.room.roomId,
          fromUserId,
          targetUserId,
        });

        const peerConnection = await ensurePeerConnection(fromUserId);
        if (!peerConnection || !isActiveGeneration()) return;
        clearOfferRetry(fromUserId);
        await peerConnection.setRemoteDescription(new rtc.RTCSessionDescription(payload?.description as any));
        if (!isActiveGeneration()) return;
        const waiter = correlatedWaiter;
        if (
          waiter
          && waiter.remoteUserId === fromUserId
          && waiter.peerConnection === peerConnection
          && waiter.authority.generation === legacySessionGenerationRef.current
          && waiter.authority.channel === channelRef.current
          && waiter.authority.roomId === formatRoomId(roomRef.current?.roomId ?? "")
          && waiter.authority.userId === String(identityRef.current?.userId ?? "").trim()
        ) {
          delete legacyMicAnswerWaitersRef.current[negotiationId];
          waiter.resolve(true);
        }
        logChatRtc("diag_answer_remote_description_set", {
          roomId: snapshot.room.roomId,
          fromUserId,
          peer: describePeerConnection(peerConnection),
        });
        void logInboundVideoDiagnostics(fromUserId, peerConnection, "answer_remote_description_set");
      });

      channel.on("broadcast", { event: "webrtc:ice" }, async ({ payload }: { payload: Record<string, unknown> }) => {
        if (!isActiveGeneration()) return;
        const currentIdentity = identityRef.current;
        const rtc = getCommunicationRTCModule();
        if (!currentIdentity || !rtc) return;

        const targetUserId = String(payload?.targetUserId ?? "").trim();
        const fromUserId = String(payload?.fromUserId ?? "").trim();
        if (
          !isExactInboundRoom(payload)
          ||
          !targetUserId
          || targetUserId !== currentIdentity.userId
          || !isAuthorizedInboundParticipant(fromUserId)
          || !payload?.candidate
        ) return;
        logChatRtc("ice_received", {
          roomId: snapshot.room.roomId,
          fromUserId,
          targetUserId,
        });

        const peerConnection = await ensurePeerConnection(fromUserId);
        if (!peerConnection || !isActiveGeneration()) return;
        await peerConnection.addIceCandidate(new rtc.RTCIceCandidate(payload.candidate as any)).catch(() => {});
      });

      channel.on("broadcast", { event: "media:update" }, ({ payload }: { payload: Record<string, unknown> }) => {
        if (!isActiveGeneration()) return;
        const fromUserId = String(payload?.fromUserId ?? "").trim();
        if (!isExactInboundRoom(payload) || !isAuthorizedInboundParticipant(fromUserId)) return;
        const current = presenceStateRef.current[fromUserId] ?? {};
        presenceStateRef.current[fromUserId] = {
          ...current,
          userId: fromUserId,
          cameraOn: typeof payload?.cameraOn === "boolean" ? payload.cameraOn : current.cameraOn,
          micOn: typeof payload?.micOn === "boolean" ? payload.micOn : current.micOn,
        };
        void applyParticipantsFromSources();
      });

      channel.on("broadcast", { event: "room:end" }, ({ payload }: { payload: Record<string, unknown> }) => {
        const fromUserId = String(payload?.fromUserId ?? "").trim();
        if (
          !isExactInboundRoom(payload)
          || fromUserId !== snapshot.room.hostUserId
          || !isAuthorizedInboundParticipant(fromUserId)
        ) return;
        const reason = String(payload?.reason ?? "ended").trim() === "host-left" ? "host-left" : "ended";
        if (!isActiveGeneration()) return;
        logChatRtc("room_end_received", {
          roomId: snapshot.room.roomId,
          reason,
        });
        setError(reason === "host-left" ? "The host ended this communication room." : "This communication room has ended.");
        void cleanupChannel();
        cleanupSessionMedia();
        onRoomEndedRef.current?.(reason);
      });

      channel.subscribe(async (status) => {
        if (!isActiveGeneration()) return;

        if (status === "SUBSCRIBED") {
          if (legacySessionRestartTimerRef.current) {
            clearTimeout(legacySessionRestartTimerRef.current);
            legacySessionRestartTimerRef.current = null;
          }
          legacySessionRestartRequestedGenerationRef.current = null;
          logChatRtc("presence_subscription_status", {
            roomId: snapshot.room.roomId,
            status,
          });
          channelRef.current = channel;
          setChannelState("live");
          setError(null);
          const reconnectReason = reconnectTrackedRef.current ? "recovered" : "initial_join";
          reconnectTrackedRef.current = false;
          trackEvent("communication_connect", {
            surface: analyticsSurface,
            role: analyticsRole,
            roomId: snapshot.room.roomId,
            reason: reconnectReason,
          });
          setLoading(false);
          const provedCameraEnabled = cameraEnabledRef.current && hasUsableLocalTrack("video");
          const provedMicEnabled = micEnabledRef.current && hasUsableLocalTrack("audio");
          if (cameraEnabledRef.current !== provedCameraEnabled) {
            cameraEnabledRef.current = provedCameraEnabled;
            setCameraEnabled(provedCameraEnabled);
          }
          if (micEnabledRef.current !== provedMicEnabled) {
            micEnabledRef.current = provedMicEnabled;
            setMicEnabled(provedMicEnabled);
          }
          void (async () => {
            const promoted = await updatePresence(provedCameraEnabled, provedMicEnabled);
            if (!isActiveGeneration()) return;
            if (!promoted) {
              setLocalMediaKindEnabled("video", false);
              setLocalMediaKindEnabled("audio", false);
              cameraEnabledRef.current = false;
              micEnabledRef.current = false;
              setCameraEnabled(false);
              setMicEnabled(false);
              setLocalVideoStreamURL("");
              await updatePresence(false, false);
              if (!isActiveGeneration()) return;
              setError("Call media could not be synchronized. The call remains muted.");
              reportRuntimeError(
                "communication-presence-initial-promotion",
                new Error("initial_media_promotion_unproved"),
                { roomId: snapshot.room.roomId },
              );
            }
            await refreshSnapshot(snapshot.room.roomId);
          })().catch((error) => {
            reportRuntimeError("communication-presence-initial-sync", error, {
              roomId: snapshot.room.roomId,
            });
          });
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          logChatRtc("presence_subscription_status", {
            roomId: snapshot.room.roomId,
            status,
          });
          setChannelState("reconnecting");
          setError("Communication room reconnecting…");
          requestLegacySessionRestart(status === "CHANNEL_ERROR"
            ? "realtime_error"
            : status === "TIMED_OUT"
              ? "realtime_timeout"
              : "realtime_closed", sessionGeneration);
          if (!reconnectTrackedRef.current) {
            reconnectTrackedRef.current = true;
            trackEvent("communication_reconnect", {
              surface: analyticsSurface,
              role: analyticsRole,
              roomId: snapshot.room.roomId,
              reason: status === "CHANNEL_ERROR"
                ? "channel_error"
                : status === "TIMED_OUT"
                  ? "timed_out"
                  : "closed",
            });
          }
          const currentRoom = roomRef.current;
          const currentIdentity = identityRef.current;
          if (currentRoom && currentIdentity) {
            await touchCommunicationRoomSession({
              roomId: currentRoom.roomId,
              userId: currentIdentity.userId,
              membershipState: "reconnecting",
              cameraEnabled: cameraEnabledRef.current,
              micEnabled: micEnabledRef.current,
              displayName: currentIdentity.displayName,
              avatarUrl: currentIdentity.avatarUrl,
            }).catch(() => null);
            if (!isActiveGeneration()) return;
            await refreshSnapshot(currentRoom.roomId);
          }
          if (!isActiveGeneration()) return;
          setLoading(false);
        }
      });
    };

    void init().catch((error) => {
      if (!isActiveGeneration()) return;
      logChatRtc("init_failed", {
        roomId,
        message: error instanceof Error ? error.message : "unknown_error",
      });
      reportRuntimeError("communication-init", error, {
        roomId,
      });
      setError("Unable to connect this communication room right now.");
      setChannelState("error");
      setLoading(false);
    });

    return () => {
      active = false;
      const capturedChannel = channelRef.current;
      const capturedSnapshotChannel = snapshotChannelRef.current;
      const capturedRoom = roomRef.current;
      const capturedIdentity = identityRef.current;
      const capturedMemberships = membershipsRef.current;
      const capturedPresenceState = presenceStateRef.current;
      const capturedMedia = {
        answerWaiters: Object.entries(legacyMicAnswerWaitersRef.current),
        auxiliaryStreams: [...auxiliaryStreamsRef.current],
        localStream: localStreamRef.current,
        offerRetryTimers: Object.entries(offerRetryTimersRef.current),
        peers: Object.entries(peerConnectionsRef.current),
      };
      const wasCurrentGeneration = legacySessionGenerationRef.current === sessionGeneration;
      if (wasCurrentGeneration) {
        legacySessionGenerationRef.current += 1;
      }
      if (capturedRoom && capturedIdentity && wasCurrentGeneration && endingGenerationRef.current !== sessionGeneration) {
        void touchCommunicationRoomSession({
          roomId: capturedRoom.roomId,
          userId: capturedIdentity.userId,
          membershipState: "reconnecting",
          cameraEnabled: cameraEnabledRef.current,
          micEnabled: micEnabledRef.current,
          displayName: capturedIdentity.displayName,
          avatarUrl: capturedIdentity.avatarUrl,
        }).catch(() => null);
      }
      void cleanupChannel(capturedChannel);
      cleanupSnapshotChannel(capturedSnapshotChannel);
      cleanupSessionMedia(capturedMedia);
      if (roomRef.current === capturedRoom) roomRef.current = null;
      if (identityRef.current === capturedIdentity) identityRef.current = null;
      if (membershipsRef.current === capturedMemberships) membershipsRef.current = [];
      if (presenceStateRef.current === capturedPresenceState) presenceStateRef.current = {};
    };
  }, [
    applyParticipantsFromSources,
    cleanupChannel,
    cleanupRemotePeer,
    cleanupSessionMedia,
    cleanupSnapshotChannel,
    ensureInitialLocalStream,
    hasUsableLocalTrack,
    logInboundVideoDiagnostics,
    ensurePeerConnection,
    isRtcAvailable,
    refreshSnapshot,
    roomId,
    sendBroadcast,
    setLocalMediaKindEnabled,
    setPresenceFromChannel,
    updatePresence,
    enabled,
    analyticsRole,
    analyticsSurface,
    authenticatedAccessToken,
    authenticatedUserId,
    clearOfferRetry,
    legacySessionRestartSerial,
    requestLegacySessionRestart,
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (!room || !identity || loading) return;

    const interval = setInterval(() => {
      void touchCommunicationRoomSession({
        roomId: room.roomId,
        userId: identity.userId,
        membershipState: channelState === "reconnecting" ? "reconnecting" : "active",
        cameraEnabled: appStateRef.current === "active" && cameraEnabledRef.current,
        micEnabled: (appStateRef.current === "active" || allowBackgroundAudioRef.current)
          && micEnabledRef.current
          && hasUsableLocalTrack("audio"),
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
      }).then(() => refreshSnapshot(room.roomId));
    }, HEARTBEAT_INTERVAL_MILLIS);

    return () => clearInterval(interval);
  }, [channelState, enabled, hasUsableLocalTrack, identity, loading, refreshSnapshot, room]);

  useEffect(() => {
    if (!enabled) return;
    if (!room?.roomId || !identity?.userId || loading) return;

    const localUserId = identity.userId;
    const alreadyHasRemoteMember = getActiveCommunicationMemberships(membershipsRef.current)
      .some((membership) => membership.userId !== localUserId);
    if (alreadyHasRemoteMember) return;

    let attempts = 0;
    let inFlight = false;
    let warmupInterval: ReturnType<typeof setInterval> | null = null;
    let initialTimer: ReturnType<typeof setTimeout> | null = null;

    const clearWarmup = () => {
      if (warmupInterval) clearInterval(warmupInterval);
      if (initialTimer) clearTimeout(initialTimer);
      warmupInterval = null;
      initialTimer = null;
    };

    const refreshDuringWarmup = async () => {
      if (inFlight) return;
      attempts += 1;
      inFlight = true;
      const snapshot = await refreshSnapshot(room.roomId).catch(() => null);
      inFlight = false;

      const activeMemberships = getActiveCommunicationMemberships(snapshot?.memberships ?? membershipsRef.current);
      const hasRemoteMember = activeMemberships.some((membership) => membership.userId !== localUserId);
      if (hasRemoteMember || attempts >= SNAPSHOT_WARMUP_MAX_ATTEMPTS) {
        clearWarmup();
      }
    };

    initialTimer = setTimeout(() => {
      void refreshDuringWarmup();
    }, SNAPSHOT_WARMUP_INITIAL_DELAY_MILLIS);
    warmupInterval = setInterval(() => {
      void refreshDuringWarmup();
    }, SNAPSHOT_WARMUP_INTERVAL_MILLIS);

    return clearWarmup;
  }, [enabled, identity?.userId, loading, refreshSnapshot, room?.roomId]);

  const renegotiateAllPeers = useCallback(async (forceRenegotiation = false) => {
    const remoteUserIds = Object.keys(peerConnectionsRef.current);
    let completed = true;
    for (const remoteUserId of remoteUserIds) {
      completed = await createAndSendOffer(remoteUserId, forceRenegotiation) && completed;
    }
    return completed;
  }, [createAndSendOffer]);

  const restoreLocalMediaAfterForeground = useCallback(async () => {
    const generation = legacySessionGenerationRef.current;
    const requestedMic = micEnabledRef.current || resumeMicAfterForegroundRef.current;
    const [nextCameraPermission, nextMicrophonePermission] = await Promise.all([
      getCameraPermission().catch(() => null),
      Audio.getPermissionsAsync().catch(() => null),
    ]);
    if (generation !== legacySessionGenerationRef.current) return false;

    if (nextCameraPermission) {
      const snapshot = resolveMediaPermission(nextCameraPermission);
      cameraPermissionSnapshotRef.current = snapshot;
    }
    if (nextMicrophonePermission) {
      const snapshot = resolveMediaPermission(nextMicrophonePermission);
      microphonePermissionRef.current = snapshot;
      setMicrophonePermission(snapshot);
    }

    if (cameraEnabledRef.current && cameraPermissionSnapshotRef.current.state === "undetermined") {
      await ensureCameraPermission();
      if (generation !== legacySessionGenerationRef.current) return false;
    }
    if (requestedMic && microphonePermissionRef.current.state === "undetermined") {
      await ensureMicrophonePermission();
      if (generation !== legacySessionGenerationRef.current) return false;
    }

    const nextCameraEnabled = cameraEnabledRef.current
      && cameraPermissionSnapshotRef.current.state === "granted";
    const nextMicEnabled = requestedMic && microphonePermissionRef.current.state === "granted";

    if (cameraEnabledRef.current !== nextCameraEnabled) {
      cameraEnabledRef.current = nextCameraEnabled;
      setCameraEnabled(nextCameraEnabled);
    }
    if (nextCameraEnabled) {
      await ensureInitialLocalStream(false);
      if (generation !== legacySessionGenerationRef.current) return false;
      await Promise.all(
        Object.values(peerConnectionsRef.current).map((peerConnection) => (
          attachMissingLocalTracks(peerConnection, false)
        )),
      );
      if (generation !== legacySessionGenerationRef.current) return false;
      if (!await renegotiateAllPeers(true)) return false;
      if (generation !== legacySessionGenerationRef.current) return false;
    }

    const micResult = nextMicEnabled
      ? await legacyMicControlRef.current?.(true) ?? false
      : await legacyMicControlRef.current?.(false) ?? false;
    if (generation !== legacySessionGenerationRef.current) return false;
    resumeMicAfterForegroundRef.current = nextMicEnabled && !micResult;
    return micResult || !requestedMic;
  }, [attachMissingLocalTracks, ensureCameraPermission, ensureInitialLocalStream, ensureMicrophonePermission, getCameraPermission, renegotiateAllPeers]);

  useEffect(() => {
    if (!enabled || loading || channelState !== "live" || !roomRef.current || !identityRef.current) return;
    if (!mediaActivationSerial && AppState.currentState !== "active") return;

    let cancelled = false;
    const generation = legacySessionGenerationRef.current;
    const isCurrent = () => !cancelled && generation === legacySessionGenerationRef.current;
    const reconcileNativeAnswerMedia = async () => {
      const currentAppState = AppState.currentState;
      appStateRef.current = currentAppState;
      if (currentAppState === "active") {
        await restoreLocalMediaAfterForeground();
        if (isCurrent() && channelRef.current) {
          channelStateRef.current = "live";
          setChannelState("live");
          setError(null);
        }
        return;
      }

      if (!allowBackgroundAudioRef.current || !micEnabledRef.current) return;
      const permission = await Audio.getPermissionsAsync().catch(() => null);
      if (!isCurrent()) return;
      if (permission) {
        const snapshot = resolveMediaPermission(permission);
        microphonePermissionRef.current = snapshot;
        setMicrophonePermission(snapshot);
      }
      if (microphonePermissionRef.current.state !== "granted") return;

      const micResult = await legacyMicControlRef.current?.(true) ?? false;
      if (!micResult || !isCurrent()) return;
      channelStateRef.current = "live";
      setChannelState("live");
      setError(null);
    };

    void reconcileNativeAnswerMedia().catch((mediaError) => {
      reportRuntimeError("communication-native-answer-media", mediaError, { roomId });
    });
    return () => {
      cancelled = true;
    };
  }, [
    channelState,
    enabled,
    identity?.userId,
    loading,
    mediaActivationSerial,
    restoreLocalMediaAfterForeground,
    room?.roomId,
    roomId,
  ]);

  const handleAppStateLifecycleChange = useCallback((nextState: AppStateStatus) => {
      if (nativePermissionRequestDepthRef.current > 0) {
        suppressedPermissionAppStateRef.current = nextState;
        return;
      }
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if (nextState === previousState) return;

      const currentRoom = roomRef.current;
      const currentIdentity = identityRef.current;
      if (!currentRoom || !currentIdentity) return;

      if (nextState === "active") {
        const generation = legacySessionGenerationRef.current;
        if (reconnectTrackedRef.current) {
          reconnectTrackedRef.current = false;
          trackEvent("communication_connect", {
            surface: analyticsSurface,
            role: analyticsRole,
            roomId: currentRoom.roomId,
            reason: "app_foreground",
          });
        }
        // A backgrounded Realtime channel can remain non-null after its
        // underlying socket has closed. Treating that stale object as live
        // leaves legacy WebRTC permanently reconnecting with no new offers.
        // Rebuild this same accepted room session; the authoritative join is
        // idempotent and remains bound to the existing invite and auth.uid().
        if (restartDisconnectedSession && (channelStateRef.current === "reconnecting" || !channelRef.current)) {
          requestLegacySessionRestart("app_foreground");
          return;
        }
        if (channelRef.current) {
          channelStateRef.current = "live";
          setChannelState("live");
          setError(null);
        }
        void restoreLocalMediaAfterForeground()
          .then(() => {
            if (
              generation !== legacySessionGenerationRef.current
              || roomRef.current !== currentRoom
              || identityRef.current !== currentIdentity
            ) return null;
            return refreshSnapshot(currentRoom.roomId);
          })
          .catch((error) => {
            reportRuntimeError("communication-appstate-active", error, {
              roomId: currentRoom.roomId,
            });
          });
        return;
      }

      const preserveNativeCallAudio = shouldPreserveNativeCallBackgroundAudio({
        appState: nextState,
        allowBackgroundAudio: allowBackgroundAudioRef.current,
        micRequested: micEnabledRef.current,
        hasUsableAudioTrack: hasUsableLocalTrack("audio"),
      });
      if (preserveNativeCallAudio) {
        stopLocalMediaKind("video");
        channelStateRef.current = "live";
        setChannelState("live");
        setError(null);
        void legacyMicControlRef.current?.(true, false).catch((error) => {
          reportRuntimeError("communication-appstate-background-audio", error, {
            roomId: currentRoom.roomId,
          });
        });
        return;
      }

      const shouldResumeMic = micEnabledRef.current;
      stopLocalMediaKind("video");
      channelStateRef.current = "reconnecting";
      setChannelState("reconnecting");
      if (!reconnectTrackedRef.current) {
        reconnectTrackedRef.current = true;
        trackEvent("communication_reconnect", {
          surface: analyticsSurface,
          role: analyticsRole,
          roomId: currentRoom.roomId,
          reason: "app_background",
        });
      }
      void (legacyMicControlRef.current?.(
        LEGACY_BACKGROUND_MEDIA_STATE.micEnabled,
        LEGACY_BACKGROUND_MEDIA_STATE.cameraEnabled,
      ) ?? Promise.resolve(false))
        .then((controlled) => {
          if (!controlled) legacyMicLocalPrivacyStopRef.current?.();
          resumeMicAfterForegroundRef.current = shouldResumeMic;
        })
        .catch((error) => {
          legacyMicLocalPrivacyStopRef.current?.();
          resumeMicAfterForegroundRef.current = shouldResumeMic;
          reportRuntimeError("communication-appstate-background", error, {
            roomId: currentRoom.roomId,
          });
        });
  }, [analyticsRole, analyticsSurface, hasUsableLocalTrack, refreshSnapshot, requestLegacySessionRestart, restartDisconnectedSession, restoreLocalMediaAfterForeground, stopLocalMediaKind]);

  appStateLifecycleHandlerRef.current = handleAppStateLifecycleChange;

  useEffect(() => {
    if (!enabled) return undefined;
    const subscription = AppState.addEventListener("change", handleAppStateLifecycleChange);

    return () => subscription.remove();
  }, [enabled, handleAppStateLifecycleChange]);

  const ensureTrackKind = useCallback(async (kind: "audio" | "video") => {
    const currentStream = localStreamRef.current;
    const existingTrack = getCommunicationTrack(currentStream, kind);
    if (existingTrack) return existingTrack;

    const canUseKind = kind === "video" ? await ensureCameraPermission() : await ensureMicrophonePermission();
    if (!canUseKind) return null;

    const extraStream = await createCommunicationMediaStream({
      audio: kind === "audio",
      video: kind === "video",
    }).catch(() => null);
    if (!extraStream) return null;

    auxiliaryStreamsRef.current.push(extraStream);
    const track = getCommunicationTrack(extraStream, kind);
    if (!track) return null;

    if (!localStreamRef.current) {
      localStreamRef.current = extraStream;
      setLocalStreamURL(getCommunicationStreamURL(extraStream));
      if (kind === "video") setLocalVideoStreamURL(getRenderableVideoStreamURL(extraStream));
    } else {
      localStreamRef.current.addTrack(track);
      setLocalStreamURL(getCommunicationStreamURL(localStreamRef.current));
      if (kind === "video") {
        setLocalVideoStreamURL(getRenderableVideoStreamURL(extraStream) || getRenderableVideoStreamURL(localStreamRef.current));
      }
    }
    let senderTopologyChanged = false;
    for (const peerConnection of Object.values(peerConnectionsRef.current)) {
      const senders = typeof peerConnection.getSenders === "function" ? peerConnection.getSenders() : [];
      const alreadyAdded = senders.some((sender: any) => sender?.track?.id === track.id);
      if (alreadyAdded) continue;
      const endedSender = senders.find((sender: any) => (
        sender?.track?.kind === track.kind
        && String(sender?.track?.readyState ?? "").toLowerCase() === "ended"
        && typeof sender?.replaceTrack === "function"
      ));
      if (endedSender) {
        await endedSender.replaceTrack(track);
      } else {
        peerConnection.addTrack(track, localStreamRef.current as MediaStream);
      }
      senderTopologyChanged = true;
    }
    if (senderTopologyChanged && !await renegotiateAllPeers(true)) {
      try {
        track.enabled = false;
      } catch {
        // The caller returns failure and retains the media error boundary.
      }
      return null;
    }

    return track;
  }, [ensureCameraPermission, ensureMicrophonePermission, renegotiateAllPeers]);

  const captureLegacyMicSessionAuthority = useCallback((): LegacyMicSessionAuthority | null => {
    const channel = channelRef.current;
    const resolvedRoomId = formatRoomId(roomRef.current?.roomId ?? "");
    const userId = String(identityRef.current?.userId ?? "").trim();
    const sessionState = channelStateRef.current;
    if (
      !channel
      || !resolvedRoomId
      || resolvedRoomId !== formatRoomId(roomId)
      || !userId
      || (sessionState !== "live" && sessionState !== "reconnecting")
    ) return null;
    return {
      channel,
      generation: legacySessionGenerationRef.current,
      roomId: resolvedRoomId,
      userId,
    };
  }, [roomId]);

  const isLegacyMicSessionAuthorityCurrent = useCallback((authority: LegacyMicSessionAuthority) => {
    const sessionState = channelStateRef.current;
    return (
      legacySessionGenerationRef.current === authority.generation
      &&
      channelRef.current === authority.channel
      && formatRoomId(roomRef.current?.roomId ?? "") === authority.roomId
      && String(identityRef.current?.userId ?? "").trim() === authority.userId
      && (sessionState === "live" || sessionState === "reconnecting")
    );
  }, []);

  const rollbackLegacyMicLocalOffer = useCallback(async (peerConnection: any) => {
    if (String(peerConnection?.signalingState ?? "stable") === "stable") return true;
    if (typeof peerConnection?.setLocalDescription !== "function") return false;
    try {
      await peerConnection.setLocalDescription({ type: "rollback" });
    } catch {
      return false;
    }
    return String(peerConnection?.signalingState ?? "stable") === "stable";
  }, []);

  const strictlyRenegotiateLegacyMicPeer = useCallback(({
    authority,
    peerConnection,
    remoteUserId,
    phase,
  }: {
    authority: LegacyMicSessionAuthority;
    peerConnection: any;
    remoteUserId: string;
    phase: "forward" | "compensate";
  }) => runSerializedPeerOffer(remoteUserId, async () => {
    if (
      !isLegacyMicSessionAuthorityCurrent(authority)
      || peerConnectionsRef.current[remoteUserId] !== peerConnection
      || String(peerConnection?.connectionState ?? "") === "closed"
      || String(peerConnection?.signalingState ?? "stable") !== "stable"
    ) return false;

    const negotiationId = [
      "legacy-mic",
      authority.roomId,
      authority.userId,
      ++legacyMicNegotiationSerialRef.current,
      phase,
    ].join(":");
    let resolveAnswer = (_answered: boolean) => {};
    const answerPromise = new Promise<boolean>((resolve) => {
      resolveAnswer = resolve;
    });
    legacyMicAnswerWaitersRef.current[negotiationId] = {
      authority,
      peerConnection,
      remoteUserId,
      resolve: resolveAnswer,
    };

    let completed = false;
    try {
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      if (!isLegacyMicSessionAuthorityCurrent(authority)) throw new Error("LEGACY_MIC_SESSION_AUTHORITY_CHANGED");
      const normalizedOffer = {
        ...offer,
        sdp: preferVideoCodecInSdp(offer.sdp, PREFERRED_VIDEO_CODEC),
      };
      await peerConnection.setLocalDescription(normalizedOffer);
      if (!isLegacyMicSessionAuthorityCurrent(authority)) throw new Error("LEGACY_MIC_SESSION_AUTHORITY_CHANGED");
      const sendResult = await waitForRealtimeOperation(
        broadcastCommunicationRoomSignal({
          roomId: authority.roomId,
          event: "webrtc:offer",
          payload: {
            targetUserId: remoteUserId,
            negotiationId,
            description: {
              type: normalizedOffer.type,
              sdp: normalizedOffer.sdp ?? null,
            },
          },
        }),
        LEGACY_MIC_RENEGOTIATION_TIMEOUT_MILLIS,
      ).catch(() => false);
      if (sendResult !== true) throw new Error("LEGACY_MIC_OFFER_SEND_FAILED");
      const answered = await waitForRealtimeOperation(
        answerPromise,
        LEGACY_MIC_RENEGOTIATION_TIMEOUT_MILLIS,
      );
      completed = answered === true
        && isLegacyMicSessionAuthorityCurrent(authority)
        && peerConnectionsRef.current[remoteUserId] === peerConnection
        && String(peerConnection?.signalingState ?? "stable") === "stable";
    } catch {
      completed = false;
    }
    delete legacyMicAnswerWaitersRef.current[negotiationId];
    if (
      String(peerConnection?.signalingState ?? "stable") !== "stable"
      && !await rollbackLegacyMicLocalOffer(peerConnection)
    ) throw new Error("LEGACY_MIC_LOCAL_OFFER_ROLLBACK_UNVERIFIED");
    return completed;
  }, false), [isLegacyMicSessionAuthorityCurrent, rollbackLegacyMicLocalOffer, runSerializedPeerOffer]);

  const strictlyCommitLegacyMicPresence = useCallback(async (
    authority: LegacyMicSessionAuthority,
    nextMicEnabled: boolean,
    nextCameraEnabled: boolean = cameraEnabledRef.current,
  ) => {
    const resolvedRoom = roomRef.current;
    const resolvedIdentity = identityRef.current;
    if (!resolvedRoom || !resolvedIdentity || !isLegacyMicSessionAuthorityCurrent(authority)) {
      return { durableWritten: false, ok: false };
    }
    const membershipState = channelStateRef.current === "reconnecting" ? "reconnecting" : "active";
    const membership = await touchCommunicationRoomSession({
      roomId: authority.roomId,
      userId: authority.userId,
      membershipState,
      cameraEnabled: nextCameraEnabled,
      micEnabled: nextMicEnabled,
      displayName: resolvedIdentity.displayName,
      avatarUrl: resolvedIdentity.avatarUrl,
    }).catch(() => null);
    if (
      !membership
      || formatRoomId(membership.roomId) !== authority.roomId
      || membership.userId !== authority.userId
      || membership.cameraEnabled !== nextCameraEnabled
      || membership.micEnabled !== nextMicEnabled
      || normalizeRoomMembershipState(membership.membershipState) !== membershipState
      || !isLegacyMicSessionAuthorityCurrent(authority)
    ) return { durableWritten: !!membership, ok: false };

    const trackResult = await waitForRealtimeOperation(authority.channel.track(
      buildCommunicationPresencePayload({
        identity: resolvedIdentity,
        room: resolvedRoom,
        media: {
          cameraEnabled: nextCameraEnabled,
          micEnabled: nextMicEnabled,
        },
        joinedAt: localJoinedAtRef.current,
      }),
    )).catch(() => null);
    return {
      durableWritten: true,
      ok: trackResult === "ok" && isLegacyMicSessionAuthorityCurrent(authority),
    };
  }, [isLegacyMicSessionAuthorityCurrent]);

  const strictlyBroadcastLegacyMicState = useCallback(async (
    authority: LegacyMicSessionAuthority,
    nextMicEnabled: boolean,
    nextCameraEnabled: boolean = cameraEnabledRef.current,
  ) => {
    if (!isLegacyMicSessionAuthorityCurrent(authority)) return { ok: false, sent: false };
    const result = await waitForRealtimeOperation(broadcastCommunicationRoomSignal({
      roomId: authority.roomId,
      event: "media:update",
      payload: {
        cameraOn: nextCameraEnabled,
        micOn: nextMicEnabled,
      },
    })).catch(() => false);
    return {
      ok: result === true && isLegacyMicSessionAuthorityCurrent(authority),
      sent: result === true,
    };
  }, [isLegacyMicSessionAuthorityCurrent]);

  const collectLegacyMicTopology = useCallback(() => {
    const streams = new Set<MediaStream>([
      ...(localStreamRef.current ? [localStreamRef.current] : []),
      ...auxiliaryStreamsRef.current,
    ]);
    const tracks = new Set<any>();
    streams.forEach((stream) => {
      stream.getAudioTracks().forEach((track) => {
        if (String(track?.readyState ?? "").trim().toLowerCase() !== "ended") tracks.add(track);
      });
    });
    const peerEntries = Object.entries(peerConnectionsRef.current)
      .sort(([left], [right]) => left.localeCompare(right));
    const senderEntries: { peerConnection: any; remoteUserId: string; sender: any; track: any }[] = [];
    let topologyReadable = true;
    peerEntries.forEach(([remoteUserId, peerConnection]) => {
      if (typeof peerConnection?.getSenders !== "function") {
        topologyReadable = false;
        return;
      }
      let senders: any[] = [];
      try {
        senders = peerConnection.getSenders();
      } catch {
        topologyReadable = false;
        return;
      }
      senders.forEach((sender: any) => {
        const track = sender?.track ?? null;
        if (track?.kind !== "audio") return;
        senderEntries.push({ peerConnection, remoteUserId, sender, track });
        if (String(track.readyState ?? "").trim().toLowerCase() !== "ended") tracks.add(track);
      });
    });
    return {
      peerEntries,
      senderEntries,
      streams,
      topologyReadable,
      tracks: [...tracks],
    };
  }, []);

  const isLegacyMicTrackPrivacySafe = useCallback((track: any) => {
    try {
      return String(track?.readyState ?? "").trim().toLowerCase() === "ended" || track?.enabled === false;
    } catch {
      return false;
    }
  }, []);

  const quarantineLegacyMicrophoneTopology = useCallback(() => {
    setLocalMediaKindEnabled("audio", false);
    const topology = collectLegacyMicTopology();
    let topologyNormalized = topology.topologyReadable;
    const localTracks = localStreamRef.current?.getAudioTracks().filter((track) => (
      String(track.readyState ?? "").trim().toLowerCase() !== "ended"
    )) ?? [];
    const canonicalTrack = localTracks[0] ?? topology.tracks[0] ?? null;
    const duplicateTracks = new Set(topology.tracks.filter((track) => track !== canonicalTrack));

    topology.tracks.forEach((track) => {
      try {
        track.enabled = false;
      } catch {
        topologyNormalized = false;
      }
    });

    if (duplicateTracks.size > 0) {
      topology.streams.forEach((stream) => {
        stream.getAudioTracks().forEach((track) => {
          if (!duplicateTracks.has(track)) return;
          try {
            stream.removeTrack(track);
          } catch {
            topologyNormalized = false;
          }
        });
      });

      const sendersByPeer = new Map<any, typeof topology.senderEntries>();
      topology.senderEntries.forEach((entry) => {
        const entries = sendersByPeer.get(entry.peerConnection) ?? [];
        entries.push(entry);
        sendersByPeer.set(entry.peerConnection, entries);
      });
      sendersByPeer.forEach((entries, peerConnection) => {
        if (entries.length <= 1) return;
        const retained = entries.find((entry) => entry.track === canonicalTrack) ?? entries[0];
        entries.forEach((entry) => {
          if (entry === retained) return;
          if (typeof peerConnection?.removeTrack !== "function") {
            topologyNormalized = false;
            return;
          }
          try {
            peerConnection.removeTrack(entry.sender);
          } catch {
            topologyNormalized = false;
          }
        });
      });

      duplicateTracks.forEach((track) => {
        try {
          track.stop();
        } catch {
          topologyNormalized = false;
        }
      });
    }

    if (localStreamRef.current?.getTracks().length === 0) localStreamRef.current = null;
    auxiliaryStreamsRef.current = auxiliaryStreamsRef.current.filter((stream) => (
      stream !== localStreamRef.current && stream.getTracks().length > 0
    ));
    if (!localStreamRef.current && canonicalTrack) {
      const promotedStream = [...topology.streams].find((stream) => (
        stream.getAudioTracks().some((track) => track === canonicalTrack)
      )) ?? null;
      if (promotedStream) {
        localStreamRef.current = promotedStream;
        auxiliaryStreamsRef.current = auxiliaryStreamsRef.current.filter((stream) => stream !== promotedStream);
      }
    }
    setLocalStreamURL(getCommunicationStreamURL(localStreamRef.current));

    const verified = collectLegacyMicTopology();
    const senderCounts = new Map<any, number>();
    verified.senderEntries.forEach((entry) => {
      senderCounts.set(entry.peerConnection, (senderCounts.get(entry.peerConnection) ?? 0) + 1);
    });
    const privacyProved = verified.topologyReadable
      && verified.tracks.every(isLegacyMicTrackPrivacySafe)
      && verified.senderEntries.every((entry) => isLegacyMicTrackPrivacySafe(entry.track));
    const normalized = topologyNormalized
      && [...senderCounts.values()].every((count) => count <= 1)
      && verified.tracks.length <= 1;

    return {
      duplicateCount: duplicateTracks.size,
      normalized,
      privacyProved,
      senderCount: verified.senderEntries.length,
      trackCount: verified.tracks.length,
    };
  }, [collectLegacyMicTopology, isLegacyMicTrackPrivacySafe, setLocalMediaKindEnabled]);

  legacyMicLocalPrivacyStopRef.current = () => {
    const quarantine = quarantineLegacyMicrophoneTopology();
    if (quarantine.privacyProved) {
      micEnabledRef.current = false;
      setMicEnabled(false);
      if (quarantine.normalized) return true;
      setError("Microphone is locally blocked, but duplicate call media could not be removed.");
      return false;
    }
    setError("Microphone privacy could not be verified. Leave the call before continuing.");
    return false;
  };

  const commitProvedLegacyMicMute = useCallback(async (
    authority: LegacyMicSessionAuthority,
    nextCameraEnabled: boolean = cameraEnabledRef.current,
  ) => {
    if (!isLegacyMicSessionAuthorityCurrent(authority)) {
      return {
        committed: false,
        duplicateCount: 0,
        normalized: false,
        privacyProved: false,
        senderCount: 0,
        stale: true,
        trackCount: 0,
      };
    }
    const quarantine = quarantineLegacyMicrophoneTopology();
    if (!quarantine.privacyProved || !isLegacyMicSessionAuthorityCurrent(authority)) {
      setError("Microphone privacy could not be verified. Leave the call before continuing.");
      return { ...quarantine, committed: false };
    }
    const presenceCommit = await strictlyCommitLegacyMicPresence(authority, false, nextCameraEnabled);
    const broadcastCommit = await strictlyBroadcastLegacyMicState(authority, false, nextCameraEnabled);
    const committed = quarantine.normalized
      && presenceCommit.ok
      && broadcastCommit.ok
      && isLegacyMicSessionAuthorityCurrent(authority)
      && collectLegacyMicTopology().tracks.every(isLegacyMicTrackPrivacySafe);
    if (!committed) {
      setError("Microphone is locally blocked, but call state could not be synchronized.");
      return { ...quarantine, committed: false };
    }
    micEnabledRef.current = false;
    setMicEnabled(false);
    setError(null);
    return { ...quarantine, committed: true };
  }, [
    collectLegacyMicTopology,
    isLegacyMicSessionAuthorityCurrent,
    isLegacyMicTrackPrivacySafe,
    quarantineLegacyMicrophoneTopology,
    strictlyBroadcastLegacyMicState,
    strictlyCommitLegacyMicPresence,
  ]);

  const prepareLegacyMicrophoneTrack = useCallback(async (authority: LegacyMicSessionAuthority) => {
    if (!isLegacyMicSessionAuthorityCurrent(authority)) return null;
    const topology = collectLegacyMicTopology();
    const streams = topology.streams;
    const usableTracks = topology.tracks;
    if (usableTracks.length > 1) return null;

    const previousLocalStream = localStreamRef.current;
    const previousAuxiliaryStreams = [...auxiliaryStreamsRef.current];
    let createdStream: MediaStream | null = null;
    let track: ReturnType<typeof getCommunicationTrack> = usableTracks.find((candidate) => (
      [...streams].some((stream) => stream.getAudioTracks().some((streamTrack) => streamTrack === candidate))
    )) ?? null;
    const senderOnlyTrack = usableTracks[0] && !track ? usableTracks[0] : null;
    if (senderOnlyTrack) {
      try {
        senderOnlyTrack.enabled = false;
        senderOnlyTrack.stop();
      } catch {
        return null;
      }
    }
    const previousTrackEnabled = track?.enabled !== false;
    const removedEndedTracks: { stream: MediaStream; track: any }[] = [];
    let addedCreatedTrackToPreviousLocalStream = false;

    const restoreLocalMedia = () => {
      const authorityCurrent = isLegacyMicSessionAuthorityCurrent(authority);
      if (createdStream) {
        if (addedCreatedTrackToPreviousLocalStream && track) {
          try {
            previousLocalStream?.removeTrack(track);
          } catch {
            // noop
          }
          try {
            track.stop();
          } catch {
            // noop
          }
        }
        try {
          stopCommunicationStream(createdStream);
        } catch {
          // noop
        }
      } else if (track) {
        track.enabled = previousTrackEnabled;
      }
      if (authorityCurrent) {
        removedEndedTracks.forEach(({ stream, track: endedTrack }) => {
          try {
            stream.addTrack(endedTrack);
          } catch {
            // noop
          }
        });
        localStreamRef.current = previousLocalStream;
        auxiliaryStreamsRef.current = previousAuxiliaryStreams;
        setLocalStreamURL(getCommunicationStreamURL(previousLocalStream));
      }
    };

    if (!track) {
      if (!await ensureMicrophonePermission()) return null;
      createdStream = await createCommunicationMediaStream({ audio: true, video: false }).catch(() => null);
      track = getCommunicationTrack(createdStream, "audio");
      if (!isLegacyMicSessionAuthorityCurrent(authority)) {
        stopCommunicationStream(createdStream);
        return null;
      }
      if (!createdStream || !track || String(track.readyState ?? "").trim().toLowerCase() === "ended") {
        if (createdStream) stopCommunicationStream(createdStream);
        return null;
      }
      track.enabled = false;
      streams.forEach((stream) => {
        stream.getAudioTracks().forEach((endedTrack) => {
          if (String(endedTrack.readyState ?? "").trim().toLowerCase() !== "ended") return;
          removedEndedTracks.push({ stream, track: endedTrack });
          stream.removeTrack(endedTrack);
        });
      });
      if (!previousLocalStream) {
        localStreamRef.current = createdStream;
      } else {
        createdStream.removeTrack(track);
        previousLocalStream.addTrack(track);
        addedCreatedTrackToPreviousLocalStream = true;
      }
      setLocalStreamURL(getCommunicationStreamURL(localStreamRef.current));
    } else {
      track.enabled = false;
    }

    const targetTrack = track;
    const targetMediaStream = localStreamRef.current
      ?? [...streams].find((stream) => stream.getAudioTracks().some((candidate) => candidate === targetTrack))
      ?? createdStream;
    if (!targetMediaStream) {
      restoreLocalMedia();
      return null;
    }
    const peerEntries = Object.entries(peerConnectionsRef.current).sort(([left], [right]) => left.localeCompare(right));
    const senderChanges: {
      peerConnection: any;
      remoteUserId: string;
      sender: any;
      previousTrack: any;
      added: boolean;
    }[] = [];
    const peerSenderSnapshots = new Map<any, { sender: any; track: any }[]>();
    for (const [remoteUserId, peerConnection] of peerEntries) {
      if (
        peerConnectionsRef.current[remoteUserId] !== peerConnection
        || String(peerConnection?.connectionState ?? "") === "closed"
        || typeof peerConnection?.getSenders !== "function"
      ) {
        restoreLocalMedia();
        return null;
      }
      const audioSenders = peerConnection.getSenders().filter((sender: any) => sender?.track?.kind === "audio");
      peerSenderSnapshots.set(peerConnection, audioSenders.map((sender: any) => ({ sender, track: sender.track })));
      if (
        audioSenders.length > 1
        || (audioSenders.length === 0 && (typeof peerConnection?.addTrack !== "function" || typeof peerConnection?.removeTrack !== "function"))
        || (audioSenders.length === 1 && audioSenders[0]?.track !== targetTrack && typeof audioSenders[0]?.replaceTrack !== "function")
      ) {
        restoreLocalMedia();
        return null;
      }
    }

    const rollbackSenders = async () => {
      for (const change of [...senderChanges].reverse()) {
        if (change.added) {
          change.peerConnection.removeTrack(change.sender);
        } else {
          await change.sender.replaceTrack(change.previousTrack);
        }
      }
      return peerEntries.every(([remoteUserId, peerConnection]) => {
        if (peerConnectionsRef.current[remoteUserId] !== peerConnection) return false;
        const audioSenders = peerConnection.getSenders().filter((sender: any) => sender?.track?.kind === "audio");
        const snapshots = peerSenderSnapshots.get(peerConnection) ?? [];
        return audioSenders.length === snapshots.length && snapshots.every((snapshot) => (
          audioSenders.some((sender: any) => sender === snapshot.sender && sender.track === snapshot.track)
        ));
      });
    };

    const negotiatedPeers: { peerConnection: any; remoteUserId: string }[] = [];
    const rollbackPreparedTrack = async () => {
      const sendersRestored = await rollbackSenders().catch(() => false);
      let compensated = true;
      if (senderChanges.length > 0) {
        for (const peer of negotiatedPeers) {
          const result = await strictlyRenegotiateLegacyMicPeer({
            authority,
            peerConnection: peer.peerConnection,
            remoteUserId: peer.remoteUserId,
            phase: "compensate",
          });
          compensated = compensated && result;
        }
      }
      restoreLocalMedia();
      return sendersRestored && compensated;
    };

    try {
      for (const [remoteUserId, peerConnection] of peerEntries) {
        const audioSenders = peerConnection.getSenders().filter((sender: any) => sender?.track?.kind === "audio");
        if (audioSenders.length === 0) {
          const sender = peerConnection.addTrack(targetTrack, targetMediaStream);
          senderChanges.push({ peerConnection, remoteUserId, sender, previousTrack: null, added: true });
        } else if (audioSenders[0]?.track !== targetTrack) {
          const sender = audioSenders[0];
          const previousTrack = sender.track;
          await sender.replaceTrack(targetTrack);
          if (!isLegacyMicSessionAuthorityCurrent(authority)) throw new Error("LEGACY_MIC_SESSION_AUTHORITY_CHANGED");
          senderChanges.push({ peerConnection, remoteUserId, sender, previousTrack, added: false });
        }
        const currentAudioSenders = peerConnection.getSenders().filter((sender: any) => sender?.track?.kind === "audio");
        if (currentAudioSenders.length !== 1 || currentAudioSenders[0]?.track !== targetTrack) throw new Error("LEGACY_MIC_SENDER_INVARIANT");
      }
      for (const [remoteUserId, peerConnection] of peerEntries) {
        if (!senderChanges.some((change) => change.peerConnection === peerConnection)) continue;
        const renegotiated = await strictlyRenegotiateLegacyMicPeer({
          authority,
          peerConnection,
          remoteUserId,
          phase: "forward",
        });
        if (!renegotiated) throw new Error("LEGACY_MIC_RENEGOTIATION_FAILED");
        negotiatedPeers.push({ peerConnection, remoteUserId });
      }
    } catch (preparationError) {
      reportRuntimeError("communication-legacy-media-track-preparation", preparationError, {
        roomId: authority.roomId,
      });
      const rolledBack = await rollbackPreparedTrack();
      if (
        !rolledBack
        || (preparationError instanceof Error && preparationError.message === "LEGACY_MIC_LOCAL_OFFER_ROLLBACK_UNVERIFIED")
      ) throw new Error("LEGACY_MIC_ROLLBACK_UNVERIFIED");
      return null;
    }

    return {
      track: targetTrack,
      rollback: rollbackPreparedTrack,
      senderInvariant: () => peerEntries.every(([remoteUserId, peerConnection]) => {
        if (peerConnectionsRef.current[remoteUserId] !== peerConnection) return false;
        const audioSenders = peerConnection.getSenders().filter((sender: any) => sender?.track?.kind === "audio");
        return audioSenders.length === 1 && audioSenders[0]?.track === targetTrack;
      }),
    };
  }, [collectLegacyMicTopology, ensureMicrophonePermission, isLegacyMicSessionAuthorityCurrent, strictlyRenegotiateLegacyMicPeer]);

  const setCameraCaptureEnabled = useCallback((nextEnabled: boolean) => runSerializedMediaControl(async () => {
    const authority = captureLegacyMicSessionAuthority();
    if (!authority) return false;
    const previousCameraEnabled = cameraEnabledRef.current;
    const previousTrackStates = new Map<any, boolean>();
    const streams = new Set<MediaStream>([
      ...(localStreamRef.current ? [localStreamRef.current] : []),
      ...auxiliaryStreamsRef.current,
    ]);
    streams.forEach((stream) => stream.getVideoTracks().forEach((track) => {
      previousTrackStates.set(track, track.enabled !== false);
    }));
    let targetVideoTrack: any = null;

    if (nextEnabled) {
      const track = await ensureTrackKind("video");
      if (!track) {
        setCameraEnabled(false);
        cameraEnabledRef.current = false;
        await updatePresence(false, micEnabledRef.current);
        return false;
      }
      targetVideoTrack = track;
      track.enabled = true;
      setLocalVideoStreamURL(
        getRenderableVideoStreamURL(localStreamRef.current)
        || auxiliaryStreamsRef.current.map(getRenderableVideoStreamURL).find(Boolean)
        || "",
      );
    } else {
      setLocalMediaKindEnabled("video", false);
      setLocalVideoStreamURL("");
    }

    if (!isLegacyMicSessionAuthorityCurrent(authority)) {
      if (targetVideoTrack) {
        try {
          targetVideoTrack.enabled = false;
        } catch {
          // A stale transaction never receives authority to claim success.
        }
      }
      return false;
    }
    const presenceCommit = await strictlyCommitLegacyMicPresence(
      authority,
      micEnabledRef.current,
      nextEnabled,
    );
    const broadcastCommit = await strictlyBroadcastLegacyMicState(
      authority,
      micEnabledRef.current,
      nextEnabled,
    );
    if (presenceCommit.ok && broadcastCommit.ok && isLegacyMicSessionAuthorityCurrent(authority)) {
      cameraEnabledRef.current = nextEnabled;
      setCameraEnabled(nextEnabled);
      setError(null);
      return true;
    }
    reportRuntimeError(
      "communication-legacy-camera-commit",
      new Error("legacy_camera_atomic_commit_unproved"),
      { roomId: authority.roomId },
    );

    previousTrackStates.forEach((wasEnabled, track) => {
      try {
        if (String(track?.readyState ?? "").trim().toLowerCase() !== "ended") track.enabled = wasEnabled;
      } catch {
        // Verified through the returned failure state.
      }
    });
    if (nextEnabled && !previousCameraEnabled) setLocalMediaKindEnabled("video", false);
    await strictlyCommitLegacyMicPresence(authority, micEnabledRef.current, previousCameraEnabled);
    await strictlyBroadcastLegacyMicState(authority, micEnabledRef.current, previousCameraEnabled);
    cameraEnabledRef.current = previousCameraEnabled;
    setCameraEnabled(previousCameraEnabled);
    setLocalVideoStreamURL(previousCameraEnabled
      ? getRenderableVideoStreamURL(localStreamRef.current)
        || auxiliaryStreamsRef.current.map(getRenderableVideoStreamURL).find(Boolean)
        || ""
      : "");
    setError("Camera state could not be synchronized. The call remains connected.");
    return false;
  }), [
    captureLegacyMicSessionAuthority,
    ensureTrackKind,
    isLegacyMicSessionAuthorityCurrent,
    runSerializedMediaControl,
    setLocalMediaKindEnabled,
    strictlyBroadcastLegacyMicState,
    strictlyCommitLegacyMicPresence,
    updatePresence,
  ]);

  const toggleCamera = useCallback(async () => {
    return setCameraCaptureEnabled(!cameraEnabledRef.current);
  }, [setCameraCaptureEnabled]);

  const setMicrophoneEnabled = useCallback((
    nextEnabled: boolean,
    cameraEnabledOverride: boolean = cameraEnabledRef.current,
  ) => runSerializedMediaControl(async () => {
    if (!nextEnabled) resumeMicAfterForegroundRef.current = false;
    const authority = captureLegacyMicSessionAuthority();
    if (!authority) return false;
    if (nextEnabled) {
      const prepared = await prepareLegacyMicrophoneTrack(authority);
      if (!prepared) {
        if (microphonePermissionRef.current.state === "granted") {
          reportRuntimeError(
            "communication-legacy-microphone-preparation",
            new Error("legacy_microphone_track_preparation_unproved"),
            { roomId: authority.roomId },
          );
        }
        const muted = await commitProvedLegacyMicMute(authority, cameraEnabledOverride);
        if (muted.privacyProved && !muted.committed && isLegacyMicSessionAuthorityCurrent(authority)) {
          await updatePresence(cameraEnabledOverride, false);
          await commitProvedLegacyMicMute(authority, cameraEnabledOverride);
        }
        return false;
      }
      let durableCommitted = false;
      let broadcastCommitted = false;
      try {
        prepared.track.enabled = true;
        const enabledTopology = collectLegacyMicTopology();
        const enabledTracks = enabledTopology.tracks.filter((track) => (
          String(track?.readyState ?? "").trim().toLowerCase() !== "ended" && track?.enabled !== false
        ));
        if (
          enabledTracks.length !== 1
          || enabledTracks[0] !== prepared.track
          || !prepared.senderInvariant()
          || !isLegacyMicSessionAuthorityCurrent(authority)
        ) throw new Error("LEGACY_MIC_ENABLED_TOPOLOGY_UNVERIFIED");
        const presenceCommit = await strictlyCommitLegacyMicPresence(authority, true, cameraEnabledOverride);
        durableCommitted = presenceCommit.durableWritten;
        if (!presenceCommit.ok) throw new Error("LEGACY_MIC_DURABLE_COMMIT_FAILED");
        const broadcastCommit = await strictlyBroadcastLegacyMicState(authority, true, cameraEnabledOverride);
        broadcastCommitted = broadcastCommit.sent;
        if (
          !broadcastCommit.ok
          || !isLegacyMicSessionAuthorityCurrent(authority)
          || !prepared.senderInvariant()
          || String(prepared.track.readyState ?? "").trim().toLowerCase() === "ended"
          || Reflect.get(prepared.track, "enabled") === false
        ) throw new Error("LEGACY_MIC_ATOMIC_COMMIT_FAILED");
        micEnabledRef.current = true;
        setMicEnabled(true);
        resumeMicAfterForegroundRef.current = false;
        setError(null);
        return true;
      } catch (microphoneCommitError) {
        reportRuntimeError("communication-legacy-microphone-commit", microphoneCommitError, {
          roomId: authority.roomId,
        });
        prepared.track.enabled = false;
        let compensated = true;
        if (broadcastCommitted) {
          const broadcastCompensation = await strictlyBroadcastLegacyMicState(authority, false, cameraEnabledOverride);
          compensated = broadcastCompensation.ok && compensated;
        }
        if (durableCommitted) {
          const presenceCompensation = await strictlyCommitLegacyMicPresence(authority, false, cameraEnabledOverride);
          compensated = presenceCompensation.ok && compensated;
        }
        const rolledBack = await prepared.rollback();
        const muted = await commitProvedLegacyMicMute(authority, cameraEnabledOverride);
        if (muted.privacyProved && !muted.committed && isLegacyMicSessionAuthorityCurrent(authority)) {
          await updatePresence(cameraEnabledOverride, false);
          await commitProvedLegacyMicMute(authority, cameraEnabledOverride);
        }
        if (
          (!compensated || !rolledBack || !muted.committed)
          && isLegacyMicSessionAuthorityCurrent(authority)
        ) {
          setError("Microphone recovery failed closed and requires leaving the call.");
        }
        return false;
      }
    }

    const previousMicEnabled = micEnabledRef.current;
    const previousTopology = collectLegacyMicTopology();
    const previousTrackStates = new Map<any, boolean>(previousTopology.tracks.map((track) => [track, track.enabled !== false]));
    const muted = await commitProvedLegacyMicMute(authority, cameraEnabledOverride);
    if (muted.committed) return true;

    const canCompensate = muted.privacyProved
      && previousTopology.topologyReadable
      && previousTopology.tracks.length <= 1
      && isLegacyMicSessionAuthorityCurrent(authority);
    if (canCompensate) {
      previousTrackStates.forEach((wasEnabled, track) => {
        try {
          if (String(track?.readyState ?? "").trim().toLowerCase() !== "ended") track.enabled = wasEnabled;
        } catch {
          // Verified below.
        }
      });
      const restoredTopology = collectLegacyMicTopology();
      const trackStateRestored = previousMicEnabled
        ? restoredTopology.tracks.length === 1 && restoredTopology.tracks[0]?.enabled !== false
        : restoredTopology.tracks.every(isLegacyMicTrackPrivacySafe);
      const presenceCompensation = await strictlyCommitLegacyMicPresence(authority, previousMicEnabled, cameraEnabledOverride);
      const broadcastCompensation = await strictlyBroadcastLegacyMicState(authority, previousMicEnabled, cameraEnabledOverride);
      if (trackStateRestored && presenceCompensation.ok && broadcastCompensation.ok) {
        micEnabledRef.current = previousMicEnabled;
        setMicEnabled(previousMicEnabled);
        setError("Microphone state was not changed because call state could not be synchronized.");
        return false;
      }
    }

    const finalQuarantine = isLegacyMicSessionAuthorityCurrent(authority)
      ? quarantineLegacyMicrophoneTopology()
      : null;
    if (finalQuarantine?.privacyProved) {
      micEnabledRef.current = false;
      setMicEnabled(false);
      setError("Microphone is locally blocked, but call state could not be synchronized.");
    } else if (isLegacyMicSessionAuthorityCurrent(authority)) {
      setError("Microphone privacy could not be verified. Leave the call before continuing.");
    }
    return false;
  }), [
    captureLegacyMicSessionAuthority,
    collectLegacyMicTopology,
    commitProvedLegacyMicMute,
    isLegacyMicTrackPrivacySafe,
    isLegacyMicSessionAuthorityCurrent,
    prepareLegacyMicrophoneTrack,
    quarantineLegacyMicrophoneTopology,
    runSerializedMediaControl,
    strictlyBroadcastLegacyMicState,
    strictlyCommitLegacyMicPresence,
    updatePresence,
  ]);

  legacyMicControlRef.current = setMicrophoneEnabled;

  const toggleMic = useCallback(async () => {
    return setMicrophoneEnabled(!micEnabledRef.current);
  }, [setMicrophoneEnabled]);

  const switchCamera = useCallback(async () => {
    const videoTrack = getCommunicationTrack(localStreamRef.current, "video")
      ?? auxiliaryStreamsRef.current
        .map((stream) => getCommunicationTrack(stream, "video"))
        .find(Boolean);
    if (!videoTrack || !cameraEnabledRef.current) return false;

    const switchableTrack = videoTrack as typeof videoTrack & {
      _switchCamera?: () => void;
      applyConstraints?: (constraints: Record<string, unknown>) => Promise<void>;
    };
    const nextFacing = cameraFacingRef.current === "front" ? "environment" : "front";

    try {
      if (typeof switchableTrack._switchCamera === "function") {
        switchableTrack._switchCamera();
      } else if (typeof switchableTrack.applyConstraints === "function") {
        await switchableTrack.applyConstraints({
          facingMode: { ideal: nextFacing },
        });
      } else {
        return false;
      }
      cameraFacingRef.current = nextFacing;
      return true;
    } catch (switchError) {
      reportRuntimeError("communication-switch-camera", switchError, { roomId });
      return false;
    }
  }, [roomId]);

  const participants = useMemo<CommunicationParticipantView[]>(() => {
    const localUserId = identity?.userId ?? "";
    const activeMemberships = getActiveCommunicationMemberships(memberships);
    const activeIds = new Set(activeMemberships.map((membership) => membership.userId));

    const merged = presenceParticipants
      .filter((participant) => activeIds.has(participant.userId) || participant.userId === localUserId)
      .map((participant) => {
        const isSelf = participant.userId === localUserId;
        const remoteVideoStreamURL = isSelf
          ? ""
          : getRenderableVideoStreamURL(remoteStreamsByUserId[participant.userId] ?? null) || "";
        return {
          ...participant,
          isSelf,
          cameraOn: isSelf ? participant.cameraOn : participant.cameraOn,
          streamURL: isSelf
            ? localVideoStreamURL || undefined
            : remoteVideoStreamURL || undefined,
          connectionState: isSelf
            ? "connected"
            : (connectionStateByUserId[participant.userId] ?? "waiting"),
        };
      })
      .sort((a, b) => {
        const aSelf = a.isSelf ? 1 : 0;
        const bSelf = b.isSelf ? 1 : 0;
        if (aSelf !== bSelf) return bSelf - aSelf;
        const aHost = a.isHost ? 1 : 0;
        const bHost = b.isHost ? 1 : 0;
        if (aHost !== bHost) return bHost - aHost;
        if (a.joinedAt !== b.joinedAt) return a.joinedAt.localeCompare(b.joinedAt);
        return a.userId.localeCompare(b.userId);
      });

    if (!identity || merged.some((participant) => participant.userId === identity.userId)) {
      return merged;
    }

    return [
      {
        userId: identity.userId,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
        cameraOn: cameraEnabled,
        micOn: micEnabled,
        joinedAt: localJoinedAtRef.current,
        isHost: room?.hostUserId === identity.userId,
        isSelf: true,
        streamURL: localVideoStreamURL || undefined,
        connectionState: "connected",
      },
      ...merged,
    ];
  }, [cameraEnabled, connectionStateByUserId, identity, localVideoStreamURL, memberships, micEnabled, presenceParticipants, remoteStreamsByUserId, room?.hostUserId]);

  useEffect(() => {
    if (!__DEV__) return;
    const localUserId = identity?.userId ?? "";
    const remoteParticipants = presenceParticipants
      .filter((participant) => participant.userId !== localUserId)
      .map((participant) => ({
        userId: participant.userId,
        cameraOn: participant.cameraOn,
        micOn: participant.micOn,
        connectionState: connectionStateByUserId[participant.userId] ?? "waiting",
        stream: describeStream(remoteStreamsByUserId[participant.userId] ?? null),
      }));
    if (remoteParticipants.length === 0) return;
    logChatRtc("diag_render_binding", {
      roomId,
      remoteParticipants,
    });
  }, [connectionStateByUserId, identity?.userId, presenceParticipants, remoteStreamsByUserId, roomId]);

  const mediaPermissionMessage = useMemo(() => {
    const messages = [
      cameraEnabled || cameraPermissionRequestedRef.current
        ? getMediaPermissionRecoveryMessage("camera", cameraPermissionSnapshot)
        : null,
      micEnabled || microphonePermissionRequestedRef.current
        ? getMediaPermissionRecoveryMessage("microphone", microphonePermission)
        : null,
    ].filter((message): message is string => !!message);

    return messages.length > 0 ? messages.join(" ") : null;
  }, [cameraEnabled, cameraPermissionSnapshot, micEnabled, microphonePermission]);

  const canOpenMediaSettings = (
    cameraPermissionSnapshot.shouldOpenSettings
    || microphonePermission.shouldOpenSettings
  );

  const openMediaSettings = useCallback(async () => {
    if (!canOpenMediaSettings) return;
    await Linking.openSettings().catch((openSettingsError) => {
      reportRuntimeError("communication-open-media-settings", openSettingsError, {
        roomId,
      });
    });
  }, [canOpenMediaSettings, roomId]);

  return {
    room,
    identity,
    loading,
    error,
    channelState,
    isRtcAvailable,
    cameraEnabled,
    micEnabled,
    mediaControlsBusy,
    cameraPermissionState,
    microphonePermissionState,
    mediaPermissionMessage,
    canOpenMediaSettings,
    participants,
    participantCount: participants.length,
    localStreamURL,
    toggleCamera,
    toggleMic,
    setMicrophoneEnabled,
    switchCamera,
    openMediaSettings,
    leaveRoom,
  };
}

function formatRoomId(value: string) {
  return String(value ?? "").trim().toUpperCase();
}

function preferVideoCodecInSdp(sdp: string | null | undefined, codec: string) {
  const normalizedSdp = String(sdp ?? "");
  if (!normalizedSdp) return sdp ?? null;

  const lines = normalizedSdp.split("\r\n");
  const mLineIndex = lines.findIndex((line) => line.startsWith("m=video "));
  if (mLineIndex < 0) return normalizedSdp;

  const codecPattern = new RegExp(`a=rtpmap:(\\d+) ${codec}/`, "i");
  const codecPayloadType = lines
    .map((line) => line.match(codecPattern)?.[1] ?? "")
    .find(Boolean);

  if (!codecPayloadType) return normalizedSdp;

  const mLineParts = lines[mLineIndex].split(" ");
  if (mLineParts.length <= 3) return normalizedSdp;

  const header = mLineParts.slice(0, 3);
  const payloads = mLineParts.slice(3);
  const reorderedPayloads = [
    codecPayloadType,
    ...payloads.filter((payload) => payload !== codecPayloadType),
  ];

  lines[mLineIndex] = [...header, ...reorderedPayloads].join(" ");
  return lines.join("\r\n");
}
