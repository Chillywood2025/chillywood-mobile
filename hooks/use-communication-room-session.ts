import type { RealtimeChannel } from "@supabase/supabase-js";
import { Audio } from "expo-av";
import { useCameraPermissions } from "expo-camera";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import type { MediaStream } from "react-native-webrtc";

import { trackEvent } from "../_lib/analytics";
import {
  buildCommunicationChannelName,
  buildCommunicationPresencePayload,
  COMMUNICATION_ACTIVE_MEMBER_WINDOW_MILLIS,
  COMMUNICATION_DEFAULT_ICE_SERVERS,
  COMMUNICATION_ROOM_MAX_PARTICIPANTS,
  createCommunicationMediaStream,
  endCommunicationRoom,
  evaluateCommunicationRoomAccess,
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
import { normalizeRoomMembershipState } from "../_lib/roomRules";
import { supabase } from "../_lib/supabase";

type CommunicationPermissionState = "unknown" | "granted" | "denied" | "blocked";

type UseCommunicationRoomSessionOptions = {
  roomId: string;
  initialMediaPreferences?: Partial<CommunicationMediaPreferences>;
  onRoomEnded?: (reason: "host-left" | "ended" | "room-full") => void;
  enabled?: boolean;
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

const HEARTBEAT_INTERVAL_MILLIS = 10_000;

const logChatRtc = (event: string, details?: Record<string, unknown>) => {
  if (!__DEV__) return;
  console.error("[CH_RTC]", event, details ?? {});
};

const mapMicrophonePermission = (permission: { granted: boolean; canAskAgain: boolean }): CommunicationPermissionState => {
  if (permission.granted) return "granted";
  return permission.canAskAgain ? "denied" : "blocked";
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

export function useCommunicationRoomSession({
  roomId,
  initialMediaPreferences,
  onRoomEnded,
  enabled = true,
  analyticsContext,
}: UseCommunicationRoomSessionOptions) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermissionState, setMicrophonePermissionState] = useState<CommunicationPermissionState>("unknown");
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
  const [remoteStreamURLByUserId, setRemoteStreamURLByUserId] = useState<Record<string, string>>({});
  const [connectionStateByUserId, setConnectionStateByUserId] = useState<Record<string, PeerConnectionState>>({});

  const localJoinedAtRef = useRef(new Date().toISOString());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const snapshotChannelRef = useRef<RealtimeChannel | null>(null);
  const roomRef = useRef<CommunicationRoomState | null>(null);
  const identityRef = useRef<CommunicationIdentity | null>(null);
  const membershipsRef = useRef<CommunicationRoomMembership[]>([]);
  const presenceStateRef = useRef<Record<string, PresenceStatePayload>>({});
  const cameraEnabledRef = useRef(cameraEnabled);
  const micEnabledRef = useRef(micEnabled);
  const cameraPermissionGrantedRef = useRef(!!cameraPermission?.granted);
  const onRoomEndedRef = useRef(onRoomEnded);
  const localStreamRef = useRef<MediaStream | null>(null);
  const auxiliaryStreamsRef = useRef<MediaStream[]>([]);
  const peerConnectionsRef = useRef<Record<string, any>>({});
  const endingRef = useRef(false);
  const reconnectTrackedRef = useRef(false);
  const appStateRef = useRef(AppState.currentState);

  const cameraPermissionState: CommunicationPermissionState = cameraPermission?.granted
    ? "granted"
    : cameraPermission && !cameraPermission.canAskAgain
      ? "blocked"
      : cameraPermission
        ? "denied"
        : "unknown";

  const isRtcAvailable = !!getCommunicationRTCModule();
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
        if (active) setMicrophonePermissionState(mapMicrophonePermission(permission));
      })
      .catch(() => {
        if (active) setMicrophonePermissionState("unknown");
      });
    return () => {
      active = false;
    };
  }, []);

  const cleanupRemotePeer = useCallback((userId: string) => {
    logChatRtc("remote_peer_cleanup", {
      roomId,
      userId,
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

    setRemoteStreamURLByUserId((prev) => {
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
  }, []);

  const cleanupSessionMedia = useCallback(() => {
    logChatRtc("session_media_cleanup_start", {
      roomId,
      remotePeerCount: Object.keys(peerConnectionsRef.current).length,
      hasLocalStream: !!localStreamRef.current,
    });
    Object.keys(peerConnectionsRef.current).forEach(cleanupRemotePeer);
    stopCommunicationStream(localStreamRef.current);
    localStreamRef.current = null;
    setLocalStreamURL("");
    auxiliaryStreamsRef.current.forEach((stream) => stopCommunicationStream(stream));
    auxiliaryStreamsRef.current = [];
    logChatRtc("session_media_cleanup_complete", {
      roomId,
    });
  }, [cleanupRemotePeer, roomId]);

  const cleanupChannel = useCallback(async () => {
    const channel = channelRef.current;
    if (!channel) return;

    try {
      await channel.untrack();
    } catch {
      // noop
    }
    supabase.removeChannel(channel);
    channelRef.current = null;
  }, []);

  const cleanupSnapshotChannel = useCallback(() => {
    const channel = snapshotChannelRef.current;
    if (!channel) return;
    supabase.removeChannel(channel);
    snapshotChannelRef.current = null;
  }, []);

  const ensureMicrophonePermission = useCallback(async () => {
    logChatRtc("mic_permission_request_start", {
      roomId,
      currentState: microphonePermissionState,
    });
    const permission = await Audio.requestPermissionsAsync();
    const nextState = mapMicrophonePermission(permission);
    setMicrophonePermissionState(nextState);
    logChatRtc("mic_permission_request_result", {
      roomId,
      granted: permission.granted,
      canAskAgain: permission.canAskAgain,
      nextState,
    });
    return permission.granted;
  }, [microphonePermissionState, roomId]);

  const ensureCameraPermission = useCallback(async () => {
    if (cameraPermissionGrantedRef.current) return true;
    logChatRtc("camera_permission_request_start", {
      roomId,
      currentState: cameraPermissionState,
    });
    const nextPermission = await requestCameraPermission();
    logChatRtc("camera_permission_request_result", {
      roomId,
      granted: !!nextPermission.granted,
      canAskAgain: !!nextPermission.canAskAgain,
    });
    return !!nextPermission.granted;
  }, [cameraPermissionState, requestCameraPermission, roomId]);

  const sendBroadcast = useCallback(async (event: string, payload: Record<string, unknown>) => {
    const channel = channelRef.current;
    if (!channel) return;
    await channel.send({ type: "broadcast", event, payload }).catch(() => {});
  }, []);

  const applyParticipantsFromSources = useCallback(async (presenceByUserId?: Record<string, PresenceStatePayload>) => {
    const resolvedIdentity = identityRef.current;
    const resolvedRoom = roomRef.current;
    if (!resolvedIdentity || !resolvedRoom) return;

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
  }, []);

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
      membershipState: channelState === "reconnecting" ? "reconnecting" : "active",
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
  }, [channelState]);

  const ensureInitialLocalStream = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;

    const wantsCamera = cameraEnabledRef.current;
    const wantsMic = micEnabledRef.current;
    logChatRtc("local_stream_start", {
      roomId,
      wantsCamera,
      wantsMic,
    });
    const canUseCamera = wantsCamera ? await ensureCameraPermission() : false;
    const canUseMic = wantsMic ? await ensureMicrophonePermission() : false;

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

    setCommunicationTrackEnabled(stream, "video", wantsCamera && canUseCamera);
    setCommunicationTrackEnabled(stream, "audio", wantsMic && canUseMic);

    localStreamRef.current = stream;
    setLocalStreamURL(getCommunicationStreamURL(stream));
    logChatRtc("local_stream_success", {
      roomId,
      canUseCamera,
      canUseMic,
      streamURL: getCommunicationStreamURL(stream),
    });
    return stream;
  }, [ensureCameraPermission, ensureMicrophonePermission, roomId]);

  const attachMissingLocalTracks = useCallback(async (peerConnection: any) => {
    const localStream = await ensureInitialLocalStream();
    if (!localStream) return;
    const senders = typeof peerConnection.getSenders === "function" ? peerConnection.getSenders() : [];
    localStream.getTracks().forEach((track) => {
      const alreadyAdded = senders.some((sender: any) => sender?.track?.id === track.id);
      if (!alreadyAdded) peerConnection.addTrack(track, localStream);
    });
  }, [ensureInitialLocalStream]);

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
      const stream = event?.streams?.[0];
      if (!stream) return;
      logChatRtc("remote_stream_attached", {
        roomId,
        remoteUserId,
      });
      setRemoteStreamURLByUserId((prev) => ({
        ...prev,
        [remoteUserId]: stream.toURL(),
      }));
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
      });
    });

    peerConnectionsRef.current[remoteUserId] = peerConnection;
    setConnectionStateByUserId((prev) => ({
      ...prev,
      [remoteUserId]: "connecting",
    }));
    return peerConnection;
  }, [attachMissingLocalTracks, roomId, sendBroadcast]);

  const createAndSendOffer = useCallback(async (remoteUserId: string) => {
    const resolvedIdentity = identityRef.current;
    if (!resolvedIdentity) return;

    const peerConnection = await ensurePeerConnection(remoteUserId);
    if (!peerConnection) return;

    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    logChatRtc("offer_created", {
      roomId,
      remoteUserId,
    });
    await peerConnection.setLocalDescription(offer);

    await sendBroadcast("webrtc:offer", {
      targetUserId: remoteUserId,
      fromUserId: resolvedIdentity.userId,
      description: {
        type: offer.type,
        sdp: offer.sdp ?? null,
      },
    });
  }, [ensurePeerConnection, roomId, sendBroadcast]);

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

      if (peerConnectionsRef.current[participant.userId]) {
        await attachMissingLocalTracks(peerConnectionsRef.current[participant.userId]);
        continue;
      }

      const localJoinedAt = localJoinedAtRef.current;
      const shouldInitiateOffer = localJoinedAt < participant.joinedAt
        || (localJoinedAt === participant.joinedAt && resolvedIdentity.userId.localeCompare(participant.userId) < 0);

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
    await applyParticipantsFromSources(mapped);
    await syncPeerConnections(
      [...Object.keys(mapped)].map((userId) => ({
        userId,
        displayName: String(mapped[userId]?.displayName ?? "Participant"),
        avatarUrl: String(mapped[userId]?.avatarUrl ?? "").trim() || undefined,
        cameraOn: !!mapped[userId]?.cameraOn,
        micOn: !!mapped[userId]?.micOn,
        joinedAt: String(mapped[userId]?.joinedAt ?? new Date().toISOString()),
        isHost: !!mapped[userId]?.isHost,
      })).filter((participant) =>
        membershipsRef.current.some((membership) => membership.userId === participant.userId && normalizeRoomMembershipState(membership.membershipState) !== "removed")
        || participant.userId === identityRef.current?.userId,
      ),
    );
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
  }, [cleanupChannel, cleanupSessionMedia, cleanupSnapshotChannel, roomId, sendBroadcast]);

  useEffect(() => {
    let active = true;

    const init = async () => {
      if (!enabled) {
        setRoom(null);
        setIdentity(null);
        setMemberships([]);
        setPresenceParticipants([]);
        setRemoteStreamURLByUserId({});
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
        return;
      }

      if (!joinedMembership) {
        const currentMembership = snapshot.memberships.find((membership) => membership.userId === resolvedIdentity.userId) ?? null;
        const access = await evaluateCommunicationRoomAccess({
          room: snapshot.room,
          membership: currentMembership,
          userId: resolvedIdentity.userId,
        });
        const activeMemberships = getActiveCommunicationMemberships(snapshot.memberships);
        if (access.canJoin && !currentMembership && activeMemberships.length >= COMMUNICATION_ROOM_MAX_PARTICIPANTS) {
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

      const stateChannel = supabase
        .channel(`comm-room-state-${snapshot.room.roomId}`)
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

      const channel = supabase.channel(buildCommunicationChannelName(snapshot.room.roomId), {
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
        if (!targetUserId || targetUserId !== currentIdentity.userId || !fromUserId) return;
        logChatRtc("offer_received", {
          roomId: snapshot.room.roomId,
          fromUserId,
          targetUserId,
        });

        const peerConnection = await ensurePeerConnection(fromUserId);
        if (!peerConnection) return;

        await peerConnection.setRemoteDescription(new rtc.RTCSessionDescription(payload?.description as any));
        const answer = await peerConnection.createAnswer();
        logChatRtc("answer_created", {
          roomId: snapshot.room.roomId,
          fromUserId,
        });
        await peerConnection.setLocalDescription(answer);
        await sendBroadcast("webrtc:answer", {
          targetUserId,
          fromUserId: currentIdentity.userId,
          description: {
            type: answer.type,
            sdp: answer.sdp ?? null,
          },
        });
      });

      channel.on("broadcast", { event: "webrtc:answer" }, async ({ payload }: { payload: Record<string, unknown> }) => {
        const currentIdentity = identityRef.current;
        const rtc = getCommunicationRTCModule();
        if (!currentIdentity || !rtc) return;

        const targetUserId = String(payload?.targetUserId ?? "").trim();
        const fromUserId = String(payload?.fromUserId ?? "").trim();
        if (!targetUserId || targetUserId !== currentIdentity.userId || !fromUserId) return;
        logChatRtc("answer_received", {
          roomId: snapshot.room.roomId,
          fromUserId,
          targetUserId,
        });

        const peerConnection = await ensurePeerConnection(fromUserId);
        if (!peerConnection) return;
        await peerConnection.setRemoteDescription(new rtc.RTCSessionDescription(payload?.description as any));
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
          await updatePresence(cameraEnabledRef.current, micEnabledRef.current);
          await refreshSnapshot(snapshot.room.roomId);
          setLoading(false);
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
  ]);

  useEffect(() => {
    if (!enabled) return;
    if (!room || !identity || loading) return;

    const interval = setInterval(() => {
      void touchCommunicationRoomSession({
        roomId: room.roomId,
        userId: identity.userId,
        membershipState: channelState === "reconnecting" ? "reconnecting" : "active",
        cameraEnabled: cameraEnabledRef.current,
        micEnabled: micEnabledRef.current,
        displayName: identity.displayName,
        avatarUrl: identity.avatarUrl,
      }).then(() => refreshSnapshot(room.roomId));
    }, HEARTBEAT_INTERVAL_MILLIS);

    return () => clearInterval(interval);
  }, [channelState, enabled, identity, loading, refreshSnapshot, room]);

  useEffect(() => {
    if (!enabled) return;
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
        setChannelState((prev) => (prev === "reconnecting" ? "connecting" : prev));
        void touchCommunicationRoomSession({
          roomId: currentRoom.roomId,
          userId: currentIdentity.userId,
          membershipState: "active",
          cameraEnabled: cameraEnabledRef.current,
          micEnabled: micEnabledRef.current,
          displayName: currentIdentity.displayName,
          avatarUrl: currentIdentity.avatarUrl,
        }).then(() => refreshSnapshot(currentRoom.roomId)).catch((error) => {
          reportRuntimeError("communication-appstate-active", error, {
            roomId: currentRoom.roomId,
          });
        });
        return;
      }

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
        cameraEnabled: cameraEnabledRef.current,
        micEnabled: micEnabledRef.current,
        displayName: currentIdentity.displayName,
        avatarUrl: currentIdentity.avatarUrl,
      }).catch((error) => {
        reportRuntimeError("communication-appstate-background", error, {
          roomId: currentRoom.roomId,
        });
      });
    });

    return () => {
      subscription.remove();
    };
  }, [enabled, refreshSnapshot, analyticsRole, analyticsSurface]);

  useEffect(() => {
    if (!enabled) return;
    if (!channelRef.current || !roomRef.current || !identityRef.current || loading) return;
    void updatePresence(cameraEnabled, micEnabled);
  }, [cameraEnabled, enabled, loading, micEnabled, updatePresence]);

  const renegotiateAllPeers = useCallback(async () => {
    const remoteUserIds = Object.keys(peerConnectionsRef.current);
    for (const remoteUserId of remoteUserIds) {
      await createAndSendOffer(remoteUserId);
    }
  }, [createAndSendOffer]);

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
    } else {
      localStreamRef.current.addTrack(track);
      setLocalStreamURL(getCommunicationStreamURL(localStreamRef.current));
      Object.values(peerConnectionsRef.current).forEach((peerConnection) => {
        const senders = typeof peerConnection.getSenders === "function" ? peerConnection.getSenders() : [];
        const alreadyAdded = senders.some((sender: any) => sender?.track?.id === track.id);
        if (!alreadyAdded) {
          peerConnection.addTrack(track, localStreamRef.current as MediaStream);
        }
      });
      await renegotiateAllPeers();
    }

    return track;
  }, [ensureCameraPermission, ensureMicrophonePermission, renegotiateAllPeers]);

  const toggleCamera = useCallback(async () => {
    const nextEnabled = !cameraEnabledRef.current;
    if (nextEnabled) {
      const track = await ensureTrackKind("video");
      if (!track) {
        setCameraEnabled(false);
        cameraEnabledRef.current = false;
        await updatePresence(false, micEnabledRef.current);
        return;
      }
      track.enabled = true;
    } else {
      setCommunicationTrackEnabled(localStreamRef.current, "video", false);
    }

    cameraEnabledRef.current = nextEnabled;
    setCameraEnabled(nextEnabled);
    await updatePresence(nextEnabled, micEnabledRef.current);
    await sendBroadcast("media:update", {
      fromUserId: identityRef.current?.userId ?? "",
      cameraOn: nextEnabled,
      micOn: micEnabledRef.current,
    });
    if (roomRef.current && identityRef.current) {
      await refreshSnapshot(roomRef.current.roomId);
    }
  }, [ensureTrackKind, refreshSnapshot, sendBroadcast, updatePresence]);

  const toggleMic = useCallback(async () => {
    const nextEnabled = !micEnabledRef.current;
    if (nextEnabled) {
      const track = await ensureTrackKind("audio");
      if (!track) {
        setMicEnabled(false);
        micEnabledRef.current = false;
        await updatePresence(cameraEnabledRef.current, false);
        return;
      }
      track.enabled = true;
    } else {
      setCommunicationTrackEnabled(localStreamRef.current, "audio", false);
    }

    micEnabledRef.current = nextEnabled;
    setMicEnabled(nextEnabled);
    await updatePresence(cameraEnabledRef.current, nextEnabled);
    await sendBroadcast("media:update", {
      fromUserId: identityRef.current?.userId ?? "",
      cameraOn: cameraEnabledRef.current,
      micOn: nextEnabled,
    });
    if (roomRef.current && identityRef.current) {
      await refreshSnapshot(roomRef.current.roomId);
    }
  }, [ensureTrackKind, refreshSnapshot, sendBroadcast, updatePresence]);

  const participants = useMemo<CommunicationParticipantView[]>(() => {
    const localUserId = identity?.userId ?? "";
    const activeMemberships = getActiveCommunicationMemberships(memberships);
    const activeIds = new Set(activeMemberships.map((membership) => membership.userId));

    const merged = presenceParticipants
      .filter((participant) => activeIds.has(participant.userId) || participant.userId === localUserId)
      .map((participant) => ({
        ...participant,
        isSelf: participant.userId === localUserId,
        streamURL: participant.userId === localUserId
          ? localStreamURL || undefined
          : remoteStreamURLByUserId[participant.userId],
        connectionState: participant.userId === localUserId
          ? "connected"
          : (connectionStateByUserId[participant.userId] ?? "waiting"),
      }))
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
        streamURL: localStreamURL || undefined,
        connectionState: "connected",
      },
      ...merged,
    ];
  }, [cameraEnabled, connectionStateByUserId, identity, localStreamURL, memberships, micEnabled, presenceParticipants, remoteStreamURLByUserId, room?.hostUserId]);

  return {
    room,
    identity,
    loading,
    error,
    channelState,
    isRtcAvailable,
    cameraEnabled,
    micEnabled,
    cameraPermissionState,
    microphonePermissionState,
    participants,
    participantCount: participants.length,
    localStreamURL,
    toggleCamera,
    toggleMic,
    leaveRoom,
  };
}

function formatRoomId(value: string) {
  return String(value ?? "").trim().toUpperCase();
}
