import type { RealtimeChannel } from "@supabase/supabase-js";
import { Audio } from "expo-av";
import { useCameraPermissions } from "expo-camera";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import type { MediaStream } from "@livekit/react-native-webrtc";

import { resolveRoomAccess } from "../_lib/accessEntitlements";
import { trackEvent } from "../_lib/analytics";
import {
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
  roomId: string;
  initialMediaPreferences?: Partial<CommunicationMediaPreferences>;
  onRoomEnded?: (reason: "host-left" | "ended" | "room-full") => void;
  enabled?: boolean;
  allowBackgroundAudio?: boolean;
  mediaActivationSerial?: number;
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
  roomId: string;
  userId: string;
};

type LegacyMicAnswerWaiter = {
  authority: LegacyMicSessionAuthority;
  peerConnection: any;
  remoteUserId: string;
  resolve: (answered: boolean) => void;
};

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
    const userId = String(presence?.userId ?? presenceKey).trim();
    if (!userId) return;
    mapped[userId] = presence ?? {};
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
  roomId,
  initialMediaPreferences,
  onRoomEnded,
  enabled = true,
  allowBackgroundAudio = false,
  mediaActivationSerial = 0,
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
  const legacyMicAnswerWaitersRef = useRef<Record<string, LegacyMicAnswerWaiter>>({});
  const legacyMicNegotiationSerialRef = useRef(0);
  const mediaControlTailRef = useRef<Promise<void>>(Promise.resolve());
  const pendingMediaControlCountRef = useRef(0);
  const endingRef = useRef(false);
  const reconnectTrackedRef = useRef(false);
  const cameraFacingRef = useRef<"front" | "environment">("front");
  const appStateRef = useRef(AppState.currentState);
  const allowBackgroundAudioRef = useRef(allowBackgroundAudio);

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

  const cleanupRemotePeer = useCallback((userId: string) => {
    logChatRtc("remote_peer_cleanup", {
      roomId,
      userId,
    });
    clearOfferRetry(userId);
    Object.entries(legacyMicAnswerWaitersRef.current).forEach(([negotiationId, waiter]) => {
      if (waiter.remoteUserId !== userId) return;
      delete legacyMicAnswerWaitersRef.current[negotiationId];
      waiter.resolve(false);
    });
    const existing = peerConnectionsRef.current[userId];
    if (existing) {
      try {
        existing.close();
      } catch {
        // noop
      }
      delete peerConnectionsRef.current[userId];
    }

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

  const pauseLocalMediaCapture = useCallback(() => {
    stopCommunicationStream(localStreamRef.current);
    localStreamRef.current = null;
    setLocalStreamURL("");
    setLocalVideoStreamURL("");
    auxiliaryStreamsRef.current.forEach((stream) => stopCommunicationStream(stream));
    auxiliaryStreamsRef.current = [];
  }, []);

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

  const cleanupSessionMedia = useCallback(() => {
    logChatRtc("session_media_cleanup_start", {
      roomId,
      remotePeerCount: Object.keys(peerConnectionsRef.current).length,
      hasLocalStream: !!localStreamRef.current,
    });
    Object.keys(offerRetryTimersRef.current).forEach(clearOfferRetry);
    Object.entries(legacyMicAnswerWaitersRef.current).forEach(([negotiationId, waiter]) => {
      delete legacyMicAnswerWaitersRef.current[negotiationId];
      waiter.resolve(false);
    });
    Object.keys(peerConnectionsRef.current).forEach(cleanupRemotePeer);
    pauseLocalMediaCapture();
    logChatRtc("session_media_cleanup_complete", {
      roomId,
    });
  }, [cleanupRemotePeer, clearOfferRetry, pauseLocalMediaCapture, roomId]);

  useEffect(() => {
    if (!enabled) return undefined;
    return registerActiveMediaSessionStopper((reason) => {
      if (reason === "app_background") {
        if (allowBackgroundAudioRef.current) {
          stopLocalMediaKind("video");
          return;
        }
        pauseLocalMediaCapture();
        return;
      }
      cleanupSessionMedia();
    });
  }, [cleanupSessionMedia, enabled, pauseLocalMediaCapture, stopLocalMediaKind]);

  const cleanupChannel = useCallback(async () => {
    const channel = channelRef.current;
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

  const cleanupSnapshotChannel = useCallback(() => {
    const channel = snapshotChannelRef.current;
    if (!channel) return;
    supabase.removeChannel(channel);
    snapshotChannelRef.current = null;
  }, []);

  const ensureMicrophonePermission = useCallback(async () => {
    microphonePermissionRequestedRef.current = true;
    logChatRtc("mic_permission_request_start", {
      roomId,
      currentState: microphonePermissionRef.current.state,
    });
    const permission = await Audio.requestPermissionsAsync();
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
  }, [roomId]);

  const ensureCameraPermission = useCallback(async () => {
    if (cameraPermissionGrantedRef.current) return true;
    cameraPermissionRequestedRef.current = true;
    logChatRtc("camera_permission_request_start", {
      roomId,
      currentState: cameraPermissionSnapshotRef.current.state,
    });
    const nextPermission = await requestCameraPermission();
    cameraPermissionSnapshotRef.current = resolveMediaPermission(nextPermission);
    cameraPermissionGrantedRef.current = !!nextPermission.granted;
    logChatRtc("camera_permission_request_result", {
      roomId,
      granted: !!nextPermission.granted,
      canAskAgain: !!nextPermission.canAskAgain,
    });
    return !!nextPermission.granted;
  }, [requestCameraPermission, roomId]);

  const sendBroadcast = useCallback(async (event: string, payload: Record<string, unknown>) => {
    const channel = channelRef.current;
    if (!channel) return;
    await waitForRealtimeOperation(channel.send({ type: "broadcast", event, payload })).catch(() => {});
  }, []);

  const applyParticipantsFromSources = useCallback(async (presenceByUserId?: Record<string, PresenceStatePayload>) => {
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
      if (!membership && !presence && participantId !== resolvedIdentity.userId) return null;

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
        isHost: (membership?.role === "host") || resolvedRoom.hostUserId === participantId || !!presence?.isHost,
      } as CommunicationParticipantPresence;
    }).filter(Boolean) as CommunicationParticipantPresence[];

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
    const resolvedRoomId = formatRoomId(targetRoomId ?? roomRef.current?.roomId ?? roomId);
    if (!resolvedRoomId) return null;

    const snapshot = await getCommunicationRoomSnapshot(resolvedRoomId);
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
    const channel = channelRef.current;
    const resolvedRoom = roomRef.current;
    const resolvedIdentity = identityRef.current;
    if (!channel || !resolvedRoom || !resolvedIdentity) return;

    await touchCommunicationRoomSession({
      roomId: resolvedRoom.roomId,
      userId: resolvedIdentity.userId,
      membershipState: channelStateRef.current === "reconnecting" ? "reconnecting" : "active",
      cameraEnabled: nextCameraEnabled,
      micEnabled: nextMicEnabled,
      displayName: resolvedIdentity.displayName,
      avatarUrl: resolvedIdentity.avatarUrl,
    }).catch(() => null);

    await channel.track(
      buildCommunicationPresencePayload({
        identity: resolvedIdentity,
        room: resolvedRoom,
        media: {
          cameraEnabled: nextCameraEnabled,
          micEnabled: nextMicEnabled,
        },
        joinedAt: localJoinedAtRef.current,
      }),
    ).catch(() => {});
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
    const canUseMic = wantsMic
      ? requestMissingPermissions && appIsActive
        ? await ensureMicrophonePermission()
        : microphonePermissionRef.current.state === "granted"
      : false;

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

    if (!stream) {
      setLocalStreamURL("");
      logChatRtc("local_stream_failed", {
        roomId,
        canUseCamera,
        canUseMic,
      });
      return null;
    }

    setCommunicationTrackEnabled(stream, "video", canUseCamera);
    setCommunicationTrackEnabled(stream, "audio", canUseMic);

    localStreamRef.current = stream;
    setLocalStreamURL(getCommunicationStreamURL(stream));
    setLocalVideoStreamURL(getRenderableVideoStreamURL(stream));
    logChatRtc("local_stream_success", {
      roomId,
      canUseCamera,
      canUseMic,
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
    const rtc = getCommunicationRTCModule();
    const resolvedIdentity = identityRef.current;
    if (!rtc || !resolvedIdentity) return null;

    if (peerConnectionsRef.current[remoteUserId]) {
      logChatRtc("peer_connection_reuse", {
        roomId,
        remoteUserId,
      });
      await attachMissingLocalTracks(peerConnectionsRef.current[remoteUserId]);
      return peerConnectionsRef.current[remoteUserId];
    }

    const peerConnection = new rtc.RTCPeerConnection({
      iceServers: COMMUNICATION_DEFAULT_ICE_SERVERS,
    });
    logChatRtc("peer_connection_created", {
      roomId,
      remoteUserId,
    });

    await attachMissingLocalTracks(peerConnection);

    (peerConnection as any).addEventListener("icecandidate", (event: any) => {
      const currentIdentity = identityRef.current;
      if (!event?.candidate || !currentIdentity) return;
      logChatRtc("ice_candidate_local", {
        roomId,
        remoteUserId,
        hasCandidate: !!event?.candidate,
      });
      void sendBroadcast("webrtc:ice", {
        targetUserId: remoteUserId,
        fromUserId: currentIdentity.userId,
        candidate: {
          candidate: event.candidate.candidate ?? null,
          sdpMid: event.candidate.sdpMid ?? null,
          sdpMLineIndex: typeof event.candidate.sdpMLineIndex === "number" ? event.candidate.sdpMLineIndex : null,
        },
      });
    });

    (peerConnection as any).addEventListener("track", (event: any) => {
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
        void logInboundVideoDiagnostics(remoteUserId, peerConnection, "track_delayed");
      }, 1500);
      setTimeout(() => {
        void logInboundVideoDiagnostics(remoteUserId, peerConnection, "track_settled");
      }, 4000);
    });

    (peerConnection as any).addEventListener("connectionstatechange", () => {
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
      if (mappedState === "connected" || mappedState === "connecting") {
        void logInboundVideoDiagnostics(remoteUserId, peerConnection, `pc_${mappedState}`);
      }
    });

    (peerConnection as any).addEventListener("iceconnectionstatechange", () => {
      logChatRtc("diag_ice_connection_state", {
        roomId,
        remoteUserId,
        peer: describePeerConnection(peerConnection),
      });
    });

    (peerConnection as any).addEventListener("signalingstatechange", () => {
      logChatRtc("diag_signaling_state", {
        roomId,
        remoteUserId,
        peer: describePeerConnection(peerConnection),
      });
    });

    peerConnectionsRef.current[remoteUserId] = peerConnection;
    setConnectionStateByUserId((prev) => ({
      ...prev,
      [remoteUserId]: "connecting",
    }));
    return peerConnection;
  }, [attachMissingLocalTracks, clearOfferRetry, logInboundVideoDiagnostics, roomId, sendBroadcast]);

  const broadcastOfferDescription = useCallback(async (remoteUserId: string, description: { type?: unknown; sdp?: unknown } | null | undefined) => {
    const resolvedIdentity = identityRef.current;
    if (!resolvedIdentity || !description) return false;

    const descriptionType = String(description.type ?? "").trim();
    if (descriptionType !== "offer") return false;

    lastOfferSentAtRef.current[remoteUserId] = Date.now();
    await sendBroadcast("webrtc:offer", {
      targetUserId: remoteUserId,
      fromUserId: resolvedIdentity.userId,
      description: {
        type: descriptionType,
        sdp: typeof description.sdp === "string" ? description.sdp : null,
      },
    });
    return true;
  }, [sendBroadcast]);

  const scheduleOfferRetry = useCallback((remoteUserId: string) => {
    clearOfferRetry(remoteUserId);
    offerRetryTimersRef.current[remoteUserId] = setTimeout(() => {
      delete offerRetryTimersRef.current[remoteUserId];
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
  }, [broadcastOfferDescription, clearOfferRetry, roomId]);

  const createAndSendOffer = useCallback(async (remoteUserId: string) => {
    const resolvedIdentity = identityRef.current;
    if (!resolvedIdentity) return;

    const peerConnection = await ensurePeerConnection(remoteUserId);
    if (!peerConnection) return;

    const connectionState = String(peerConnection.connectionState ?? "");
    if (connectionState === "connected" || connectionState === "closed") {
      clearOfferRetry(remoteUserId);
      return;
    }

    const signalingState = String(peerConnection.signalingState ?? "stable");
    const existingLocalDescription = peerConnection.localDescription
      ?? peerConnection.pendingLocalDescription
      ?? peerConnection.currentLocalDescription;
    if (signalingState !== "stable") {
      if (String(existingLocalDescription?.type ?? "") === "offer") {
        await broadcastOfferDescription(remoteUserId, existingLocalDescription);
        scheduleOfferRetry(remoteUserId);
      } else {
        logChatRtc("offer_skipped_unstable", {
          roomId,
          remoteUserId,
          peer: describePeerConnection(peerConnection),
        });
      }
      return;
    }

    const lastOfferSentAt = lastOfferSentAtRef.current[remoteUserId] ?? 0;
    if (Date.now() - lastOfferSentAt < OFFER_RETRY_MIN_INTERVAL_MILLIS) return;

    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
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
    await broadcastOfferDescription(remoteUserId, normalizedOffer);
    scheduleOfferRetry(remoteUserId);
  }, [
    broadcastOfferDescription,
    clearOfferRetry,
    ensurePeerConnection,
    roomId,
    scheduleOfferRetry,
  ]);

  const syncPeerConnections = useCallback(async (nextParticipants: CommunicationParticipantPresence[]) => {
    const resolvedIdentity = identityRef.current;
    if (!resolvedIdentity) return;

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
      await cleanupChannel();
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
      if (!allowedRemoteIds.has(userId)) cleanupRemotePeer(userId);
    });

    for (const participant of allowedParticipants) {
      if (participant.userId === resolvedIdentity.userId) continue;

      const shouldInitiateOffer = shouldInitiatePeerOffer({
        localUserId: resolvedIdentity.userId,
        remoteUserId: participant.userId,
        hostUserId: roomRef.current?.hostUserId,
      });
      const existingPeerConnection = peerConnectionsRef.current[participant.userId];
      if (existingPeerConnection) {
        await attachMissingLocalTracks(existingPeerConnection);
        if (shouldInitiateOffer) {
          const connectionState = String(existingPeerConnection.connectionState ?? "");
          const lastOfferSentAt = lastOfferSentAtRef.current[participant.userId] ?? 0;
          if (
            connectionState !== "connected"
            && connectionState !== "closed"
            && Date.now() - lastOfferSentAt >= OFFER_RETRY_MIN_INTERVAL_MILLIS
          ) {
            await createAndSendOffer(participant.userId);
          }
        }
        continue;
      }

      if (shouldInitiateOffer) {
        await createAndSendOffer(participant.userId);
      } else {
        await ensurePeerConnection(participant.userId);
      }
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
    await syncPeerConnections(nextParticipants);
  }, [applyParticipantsFromSources, roomId, syncPeerConnections]);

  const leaveRoom = useCallback(async (options?: { endRoomIfHost?: boolean }) => {
    if (endingRef.current) return;
    endingRef.current = true;
    logChatRtc("leave_room_start", {
      roomId,
      endRoomIfHost: !!options?.endRoomIfHost,
    });

    const resolvedRoom = roomRef.current;
    const resolvedIdentity = identityRef.current;

    if (resolvedRoom && resolvedIdentity) {
      if (options?.endRoomIfHost && resolvedRoom.hostUserId === resolvedIdentity.userId) {
        await sendBroadcast("room:end", {
          fromUserId: resolvedIdentity.userId,
          roomId: resolvedRoom.roomId,
          reason: "host-left",
        });
        await endCommunicationRoom(resolvedRoom.roomId).catch(() => {});
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

    await cleanupChannel();
    cleanupSnapshotChannel();
    cleanupSessionMedia();
    endingRef.current = false;
    logChatRtc("leave_room_complete", {
      roomId,
      endRoomIfHost: !!options?.endRoomIfHost,
    });
  }, [analyticsRole, analyticsSurface, cleanupChannel, cleanupSessionMedia, cleanupSnapshotChannel, roomId, sendBroadcast]);

  useEffect(() => {
    let active = true;

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

      const resolvedIdentity = await readCommunicationIdentity();
      if (!active) return;

      identityRef.current = resolvedIdentity;
      setIdentity(resolvedIdentity);
      localJoinedAtRef.current = new Date().toISOString();

      const joinedMembership = await joinCommunicationRoomSession({
        roomId,
        userId: resolvedIdentity.userId,
        displayName: resolvedIdentity.displayName,
        avatarUrl: resolvedIdentity.avatarUrl,
        cameraEnabled: cameraEnabledRef.current,
        micEnabled: micEnabledRef.current,
      }).catch((error) => {
        logChatRtc("join_room_failed", {
          roomId,
          message: error instanceof Error ? error.message : "unknown_error",
        });
        return null;
      });
      logChatRtc("join_room_result", {
        roomId,
        joined: !!joinedMembership,
        userId: resolvedIdentity.userId,
      });

      if (!active) return;

      const snapshot = await refreshSnapshot(roomId);
      if (!active) return;

      if (!snapshot || snapshot.room.status === "ended") {
        logChatRtc("init_room_unavailable", {
          roomId,
          roomStatus: snapshot?.room.status ?? "missing",
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

      await ensureInitialLocalStream();

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
            void refreshSnapshot(snapshot.room.roomId);
          },
        )
        .subscribe();

      snapshotChannelRef.current = stateChannel;

      const channel = supabase.channel(presenceChannelName, {
        config: {
          presence: { key: resolvedIdentity.userId },
        },
      });

      channel.on("presence", { event: "sync" }, () => {
        void setPresenceFromChannel();
      });

      channel.on("presence", { event: "leave" }, ({ key }: { key: string }) => {
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
        const currentIdentity = identityRef.current;
        const rtc = getCommunicationRTCModule();
        if (!currentIdentity || !rtc) return;

        const targetUserId = String(payload?.targetUserId ?? "").trim();
        const fromUserId = String(payload?.fromUserId ?? "").trim();
        const negotiationId = String(payload?.negotiationId ?? "").trim();
        if (!targetUserId || targetUserId !== currentIdentity.userId || !fromUserId) return;
        logChatRtc("offer_received", {
          roomId: snapshot.room.roomId,
          fromUserId,
          targetUserId,
        });

        const peerConnection = await ensurePeerConnection(fromUserId);
        if (!peerConnection) return;

        await peerConnection.setRemoteDescription(new rtc.RTCSessionDescription(payload?.description as any));
        logChatRtc("diag_offer_remote_description_set", {
          roomId: snapshot.room.roomId,
          fromUserId,
          peer: describePeerConnection(peerConnection),
        });
        void logInboundVideoDiagnostics(fromUserId, peerConnection, "offer_remote_description_set");
        const answer = await peerConnection.createAnswer();
        const normalizedAnswer = {
          ...answer,
          sdp: preferVideoCodecInSdp(answer.sdp, PREFERRED_VIDEO_CODEC),
        };
        logChatRtc("answer_created", {
          roomId: snapshot.room.roomId,
          fromUserId,
        });
        await peerConnection.setLocalDescription(normalizedAnswer);
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
        const currentIdentity = identityRef.current;
        const rtc = getCommunicationRTCModule();
        if (!currentIdentity || !rtc) return;

        const targetUserId = String(payload?.targetUserId ?? "").trim();
        const fromUserId = String(payload?.fromUserId ?? "").trim();
        const negotiationId = String(payload?.negotiationId ?? "").trim();
        if (!targetUserId || targetUserId !== currentIdentity.userId || !fromUserId) return;
        const correlatedWaiter = negotiationId ? legacyMicAnswerWaitersRef.current[negotiationId] : null;
        if (negotiationId && !correlatedWaiter) return;
        if (
          correlatedWaiter
          && (
            correlatedWaiter.remoteUserId !== fromUserId
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
        if (!peerConnection) return;
        clearOfferRetry(fromUserId);
        await peerConnection.setRemoteDescription(new rtc.RTCSessionDescription(payload?.description as any));
        const waiter = correlatedWaiter;
        if (
          waiter
          && waiter.remoteUserId === fromUserId
          && waiter.peerConnection === peerConnection
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
        const currentIdentity = identityRef.current;
        const rtc = getCommunicationRTCModule();
        if (!currentIdentity || !rtc) return;

        const targetUserId = String(payload?.targetUserId ?? "").trim();
        const fromUserId = String(payload?.fromUserId ?? "").trim();
        if (!targetUserId || targetUserId !== currentIdentity.userId || !fromUserId || !payload?.candidate) return;
        logChatRtc("ice_received", {
          roomId: snapshot.room.roomId,
          fromUserId,
          targetUserId,
        });

        const peerConnection = await ensurePeerConnection(fromUserId);
        if (!peerConnection) return;
        await peerConnection.addIceCandidate(new rtc.RTCIceCandidate(payload.candidate as any)).catch(() => {});
      });

      channel.on("broadcast", { event: "media:update" }, ({ payload }: { payload: Record<string, unknown> }) => {
        const fromUserId = String(payload?.fromUserId ?? "").trim();
        if (!fromUserId) return;
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
        const reason = String(payload?.reason ?? "ended").trim() === "host-left" ? "host-left" : "ended";
        if (!active) return;
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
        if (!active) return;

        if (status === "SUBSCRIBED") {
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
          void updatePresence(cameraEnabledRef.current, micEnabledRef.current)
            .then(() => refreshSnapshot(snapshot.room.roomId))
            .catch((error) => {
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
            await refreshSnapshot(currentRoom.roomId);
          }
          setLoading(false);
        }
      });
    };

    void init().catch((error) => {
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
      const currentRoom = roomRef.current;
      const currentIdentity = identityRef.current;
      if (currentRoom && currentIdentity && !endingRef.current) {
        void touchCommunicationRoomSession({
          roomId: currentRoom.roomId,
          userId: currentIdentity.userId,
          membershipState: "reconnecting",
          cameraEnabled: cameraEnabledRef.current,
          micEnabled: micEnabledRef.current,
          displayName: currentIdentity.displayName,
          avatarUrl: currentIdentity.avatarUrl,
        }).catch(() => null);
      }
      void cleanupChannel();
      cleanupSnapshotChannel();
      cleanupSessionMedia();
      roomRef.current = null;
      identityRef.current = null;
      membershipsRef.current = [];
      presenceStateRef.current = {};
    };
  }, [
    applyParticipantsFromSources,
    cleanupChannel,
    cleanupRemotePeer,
    cleanupSessionMedia,
    cleanupSnapshotChannel,
    ensureInitialLocalStream,
    logInboundVideoDiagnostics,
    ensurePeerConnection,
    isRtcAvailable,
    refreshSnapshot,
    roomId,
    sendBroadcast,
    setPresenceFromChannel,
    updatePresence,
    enabled,
    analyticsRole,
    analyticsSurface,
    clearOfferRetry,
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

  const renegotiateAllPeers = useCallback(async () => {
    const remoteUserIds = Object.keys(peerConnectionsRef.current);
    for (const remoteUserId of remoteUserIds) {
      await createAndSendOffer(remoteUserId);
    }
  }, [createAndSendOffer]);

  const restoreLocalMediaAfterForeground = useCallback(async () => {
    const [nextCameraPermission, nextMicrophonePermission] = await Promise.all([
      getCameraPermission().catch(() => null),
      Audio.getPermissionsAsync().catch(() => null),
    ]);

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
    }
    if (micEnabledRef.current && microphonePermissionRef.current.state === "undetermined") {
      await ensureMicrophonePermission();
    }

    const nextCameraEnabled = cameraEnabledRef.current
      && cameraPermissionSnapshotRef.current.state === "granted";
    const nextMicEnabled = micEnabledRef.current
      && microphonePermissionRef.current.state === "granted";

    if (cameraEnabledRef.current !== nextCameraEnabled) {
      cameraEnabledRef.current = nextCameraEnabled;
      setCameraEnabled(nextCameraEnabled);
    }
    if (micEnabledRef.current !== nextMicEnabled) {
      micEnabledRef.current = nextMicEnabled;
      setMicEnabled(nextMicEnabled);
    }

    if (nextCameraEnabled || nextMicEnabled) {
      await ensureInitialLocalStream(false);
      await Promise.all(
        Object.values(peerConnectionsRef.current).map((peerConnection) => (
          attachMissingLocalTracks(peerConnection, false)
        )),
      );
      await renegotiateAllPeers();
    }

    await updatePresence(nextCameraEnabled, nextMicEnabled);
  }, [attachMissingLocalTracks, ensureCameraPermission, ensureInitialLocalStream, ensureMicrophonePermission, getCameraPermission, renegotiateAllPeers, updatePresence]);

  useEffect(() => {
    if (!enabled || loading || channelState !== "live" || !roomRef.current || !identityRef.current) return;
    if (!mediaActivationSerial && AppState.currentState !== "active") return;

    let cancelled = false;
    const reconcileNativeAnswerMedia = async () => {
      const currentAppState = AppState.currentState;
      appStateRef.current = currentAppState;
      if (currentAppState === "active") {
        await restoreLocalMediaAfterForeground();
        if (!cancelled && channelRef.current) {
          channelStateRef.current = "live";
          setChannelState("live");
          setError(null);
        }
        return;
      }

      if (!allowBackgroundAudioRef.current || !micEnabledRef.current) return;
      const permission = await Audio.getPermissionsAsync().catch(() => null);
      if (permission) {
        const snapshot = resolveMediaPermission(permission);
        microphonePermissionRef.current = snapshot;
        setMicrophonePermission(snapshot);
      }
      if (microphonePermissionRef.current.state !== "granted") return;

      const stream = await ensureInitialLocalStream(false);
      if (!stream || cancelled) return;
      await Promise.all(
        Object.values(peerConnectionsRef.current).map((peerConnection) => (
          attachMissingLocalTracks(peerConnection, false)
        )),
      );
      await renegotiateAllPeers();
      if (cancelled) return;
      channelStateRef.current = "live";
      setChannelState("live");
      setError(null);
      await updatePresence(false, hasUsableLocalTrack("audio"));
    };

    void reconcileNativeAnswerMedia().catch((mediaError) => {
      reportRuntimeError("communication-native-answer-media", mediaError, { roomId });
    });
    return () => {
      cancelled = true;
    };
  }, [
    attachMissingLocalTracks,
    channelState,
    enabled,
    ensureInitialLocalStream,
    hasUsableLocalTrack,
    identity?.userId,
    loading,
    mediaActivationSerial,
    renegotiateAllPeers,
    restoreLocalMediaAfterForeground,
    room?.roomId,
    roomId,
    updatePresence,
  ]);

  useEffect(() => {
    if (!enabled) return undefined;
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;
      if (nextState === previousState) return;

      const currentRoom = roomRef.current;
      const currentIdentity = identityRef.current;
      if (!currentRoom || !currentIdentity) return;

      if (nextState === "active") {
        if (reconnectTrackedRef.current) {
          reconnectTrackedRef.current = false;
          trackEvent("communication_connect", {
            surface: analyticsSurface,
            role: analyticsRole,
            roomId: currentRoom.roomId,
            reason: "app_foreground",
          });
        }
        if (channelRef.current) {
          channelStateRef.current = "live";
          setChannelState("live");
          setError(null);
        } else {
          channelStateRef.current = "connecting";
          setChannelState("connecting");
        }
        void restoreLocalMediaAfterForeground()
          .then(() => touchCommunicationRoomSession({
            roomId: currentRoom.roomId,
            userId: currentIdentity.userId,
            membershipState: "active",
            cameraEnabled: cameraEnabledRef.current,
            micEnabled: micEnabledRef.current,
            displayName: currentIdentity.displayName,
            avatarUrl: currentIdentity.avatarUrl,
          }))
          .then(() => refreshSnapshot(currentRoom.roomId))
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
        void touchCommunicationRoomSession({
          roomId: currentRoom.roomId,
          userId: currentIdentity.userId,
          membershipState: "active",
          cameraEnabled: false,
          micEnabled: true,
          displayName: currentIdentity.displayName,
          avatarUrl: currentIdentity.avatarUrl,
        }).catch((error) => {
          reportRuntimeError("communication-appstate-background-audio", error, {
            roomId: currentRoom.roomId,
          });
        });
        return;
      }

      pauseLocalMediaCapture();
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
      void touchCommunicationRoomSession({
        roomId: currentRoom.roomId,
        userId: currentIdentity.userId,
        membershipState: "reconnecting",
        cameraEnabled: false,
        micEnabled: false,
        displayName: currentIdentity.displayName,
        avatarUrl: currentIdentity.avatarUrl,
      }).catch((error) => {
        reportRuntimeError("communication-appstate-background", error, {
          roomId: currentRoom.roomId,
        });
      });
    });

    return () => subscription.remove();
  }, [analyticsRole, analyticsSurface, enabled, hasUsableLocalTrack, pauseLocalMediaCapture, refreshSnapshot, restoreLocalMediaAfterForeground, stopLocalMediaKind]);

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
          continue;
        }
        peerConnection.addTrack(track, localStreamRef.current as MediaStream);
      }
      await renegotiateAllPeers();
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
    return { channel, roomId: resolvedRoomId, userId };
  }, [roomId]);

  const isLegacyMicSessionAuthorityCurrent = useCallback((authority: LegacyMicSessionAuthority) => {
    const sessionState = channelStateRef.current;
    return (
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

  const strictlyRenegotiateLegacyMicPeer = useCallback(async ({
    authority,
    peerConnection,
    remoteUserId,
    phase,
  }: {
    authority: LegacyMicSessionAuthority;
    peerConnection: any;
    remoteUserId: string;
    phase: "forward" | "compensate";
  }) => {
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
        authority.channel.send({
          type: "broadcast",
          event: "webrtc:offer",
          payload: {
            targetUserId: remoteUserId,
            fromUserId: authority.userId,
            negotiationId,
            description: {
              type: normalizedOffer.type,
              sdp: normalizedOffer.sdp ?? null,
            },
          },
        }),
        LEGACY_MIC_RENEGOTIATION_TIMEOUT_MILLIS,
      ).catch(() => null);
      if (sendResult !== "ok") throw new Error("LEGACY_MIC_OFFER_SEND_FAILED");
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
  }, [isLegacyMicSessionAuthorityCurrent, rollbackLegacyMicLocalOffer]);

  const strictlyCommitLegacyMicPresence = useCallback(async (
    authority: LegacyMicSessionAuthority,
    nextMicEnabled: boolean,
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
      cameraEnabled: cameraEnabledRef.current,
      micEnabled: nextMicEnabled,
      displayName: resolvedIdentity.displayName,
      avatarUrl: resolvedIdentity.avatarUrl,
    }).catch(() => null);
    if (
      !membership
      || formatRoomId(membership.roomId) !== authority.roomId
      || membership.userId !== authority.userId
      || membership.micEnabled !== nextMicEnabled
      || normalizeRoomMembershipState(membership.membershipState) !== membershipState
      || !isLegacyMicSessionAuthorityCurrent(authority)
    ) return { durableWritten: !!membership, ok: false };

    const trackResult = await waitForRealtimeOperation(authority.channel.track(
      buildCommunicationPresencePayload({
        identity: resolvedIdentity,
        room: resolvedRoom,
        media: {
          cameraEnabled: cameraEnabledRef.current,
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
  ) => {
    if (!isLegacyMicSessionAuthorityCurrent(authority)) return { ok: false, sent: false };
    const result = await waitForRealtimeOperation(authority.channel.send({
      type: "broadcast",
      event: "media:update",
      payload: {
        fromUserId: authority.userId,
        cameraOn: cameraEnabledRef.current,
        micOn: nextMicEnabled,
      },
    })).catch(() => null);
    return {
      ok: result === "ok" && isLegacyMicSessionAuthorityCurrent(authority),
      sent: result === "ok",
    };
  }, [isLegacyMicSessionAuthorityCurrent]);

  const prepareLegacyMicrophoneTrack = useCallback(async (authority: LegacyMicSessionAuthority) => {
    if (!isLegacyMicSessionAuthorityCurrent(authority)) return null;
    const streams = new Set<MediaStream>([
      ...(localStreamRef.current ? [localStreamRef.current] : []),
      ...auxiliaryStreamsRef.current,
    ]);
    const usableTracks = [...streams].flatMap((stream) => stream.getAudioTracks()).filter((track) => (
      String(track.readyState ?? "").trim().toLowerCase() !== "ended"
    ));
    if (usableTracks.length > 1) return null;

    const previousLocalStream = localStreamRef.current;
    const previousAuxiliaryStreams = [...auxiliaryStreamsRef.current];
    let createdStream: MediaStream | null = null;
    let track: ReturnType<typeof getCommunicationTrack> = usableTracks[0] ?? null;
    const previousTrackEnabled = track?.enabled !== false;
    const removedEndedTracks: { stream: MediaStream; track: any }[] = [];
    let addedCreatedTrackToPreviousLocalStream = false;

    const restoreLocalMedia = () => {
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
    };

    if (!track) {
      if (!await ensureMicrophonePermission()) return null;
      createdStream = await createCommunicationMediaStream({ audio: true, video: false }).catch(() => null);
      track = getCommunicationTrack(createdStream, "audio");
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
  }, [ensureMicrophonePermission, isLegacyMicSessionAuthorityCurrent, strictlyRenegotiateLegacyMicPeer]);

  const setCameraCaptureEnabled = useCallback((nextEnabled: boolean) => runSerializedMediaControl(async () => {
    if (nextEnabled === cameraEnabledRef.current) {
      const updatedExistingTrack = setLocalMediaKindEnabled("video", nextEnabled);
      if (!nextEnabled || updatedExistingTrack) return true;
    }

    if (nextEnabled) {
      const track = await ensureTrackKind("video");
      if (!track) {
        setCameraEnabled(false);
        cameraEnabledRef.current = false;
        await updatePresence(false, micEnabledRef.current);
        return false;
      }
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

    cameraEnabledRef.current = nextEnabled;
    setCameraEnabled(nextEnabled);
    await Promise.all([
      updatePresence(nextEnabled, micEnabledRef.current),
      sendBroadcast("media:update", {
        fromUserId: identityRef.current?.userId ?? "",
        cameraOn: nextEnabled,
        micOn: micEnabledRef.current,
      }),
    ]);
    return true;
  }), [ensureTrackKind, runSerializedMediaControl, sendBroadcast, setLocalMediaKindEnabled, updatePresence]);

  const toggleCamera = useCallback(async () => {
    await setCameraCaptureEnabled(!cameraEnabledRef.current);
  }, [setCameraCaptureEnabled]);

  const setMicrophoneEnabled = useCallback((nextEnabled: boolean) => runSerializedMediaControl(async () => {
    if (nextEnabled === micEnabledRef.current) {
      const updatedExistingTrack = setLocalMediaKindEnabled("audio", nextEnabled);
      if (!nextEnabled || updatedExistingTrack) return true;
    }

    if (nextEnabled) {
      const authority = captureLegacyMicSessionAuthority();
      if (!authority) return false;
      const prepared = await prepareLegacyMicrophoneTrack(authority);
      if (!prepared) {
        setMicEnabled(false);
        micEnabledRef.current = false;
        if (isLegacyMicSessionAuthorityCurrent(authority)) {
          await updatePresence(cameraEnabledRef.current, false);
        }
        return false;
      }
      let durableCommitted = false;
      let broadcastCommitted = false;
      try {
        const presenceCommit = await strictlyCommitLegacyMicPresence(authority, true);
        durableCommitted = presenceCommit.durableWritten;
        if (!presenceCommit.ok) throw new Error("LEGACY_MIC_DURABLE_COMMIT_FAILED");
        const broadcastCommit = await strictlyBroadcastLegacyMicState(authority, true);
        broadcastCommitted = broadcastCommit.sent;
        if (
          !broadcastCommit.ok
          || !isLegacyMicSessionAuthorityCurrent(authority)
          || !prepared.senderInvariant()
          || String(prepared.track.readyState ?? "").trim().toLowerCase() === "ended"
        ) throw new Error("LEGACY_MIC_ATOMIC_COMMIT_FAILED");
        prepared.track.enabled = true;
        micEnabledRef.current = true;
        setMicEnabled(true);
        return true;
      } catch {
        prepared.track.enabled = false;
        let compensated = true;
        if (broadcastCommitted) {
          const broadcastCompensation = await strictlyBroadcastLegacyMicState(authority, false);
          compensated = broadcastCompensation.ok && compensated;
        }
        if (durableCommitted) {
          const presenceCompensation = await strictlyCommitLegacyMicPresence(authority, false);
          compensated = presenceCompensation.ok && compensated;
        }
        const rolledBack = await prepared.rollback();
        micEnabledRef.current = false;
        setMicEnabled(false);
        if (!compensated || !rolledBack) throw new Error("LEGACY_MIC_ROLLBACK_UNVERIFIED");
        return false;
      }
    } else {
      setLocalMediaKindEnabled("audio", false);
    }

    micEnabledRef.current = nextEnabled;
    setMicEnabled(nextEnabled);
    await Promise.all([
      updatePresence(cameraEnabledRef.current, nextEnabled),
      sendBroadcast("media:update", {
        fromUserId: identityRef.current?.userId ?? "",
        cameraOn: cameraEnabledRef.current,
        micOn: nextEnabled,
      }),
    ]);
    return true;
  }), [
    captureLegacyMicSessionAuthority,
    isLegacyMicSessionAuthorityCurrent,
    prepareLegacyMicrophoneTrack,
    runSerializedMediaControl,
    sendBroadcast,
    setLocalMediaKindEnabled,
    strictlyBroadcastLegacyMicState,
    strictlyCommitLegacyMicPresence,
    updatePresence,
  ]);

  const toggleMic = useCallback(async () => {
    await setMicrophoneEnabled(!micEnabledRef.current);
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
