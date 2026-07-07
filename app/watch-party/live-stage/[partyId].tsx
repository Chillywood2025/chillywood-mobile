import type { RealtimeChannel } from "@supabase/supabase-js";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ConnectionState, Room, Track } from "livekit-client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    AppState,
    BackHandler,
    FlatList,
    Image,
    ImageBackground,
    Keyboard,
    LayoutAnimation,
    Platform,
    Pressable,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    UIManager,
    useWindowDimensions,
    View,
    type ImageSourcePropType,
} from "react-native";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { titles as localTitles } from "../../../_data/titles";
import {
  resolveRoomAccess,
  type RoomAccessResolution,
} from "../../../_lib/accessEntitlements";
import { trackEvent } from "../../../_lib/analytics";
import {
    DEFAULT_APP_CONFIG,
    readAppConfig,
    resolveBrandingConfig,
    resolveMonetizationConfig,
} from "../../../_lib/appConfig";
import {
  getMonetizationAccessSheetPresentation,
} from "../../../_lib/monetization";
import {
  readRouteBackedMonetizationProofConfig,
  type RouteBackedMonetizationProofConfig,
} from "../../../_lib/routeBackedMonetizationVisualProof";
import {
  LIVE_COMMENT_FALLBACK_REFRESH_MS,
  LIVE_VIDEO_CAPTURE_OPTIONS,
  ROOM_HEARTBEAT_MS,
  createLiveKitV1RoomOptions,
} from "../../../_lib/performancePolicy";
import {
    getRuntimeControlBlockedCopy,
    isRuntimeControlBlockedAccess,
    LIVE_FIRST_PREMIUM_UPSELL_COPY,
    LIVE_WATCH_PARTY_PREMIUM_UPSELL_COPY,
    requireLiveFirstPremium,
    requireLiveWatchPartyPremium,
    type PremiumWatchPartyFeatureAccessDecision,
} from "../../../_lib/premiumWatchPartyAccess";
import { getBetaAccessBlockCopy, useBetaProgram } from "../../../_lib/betaProgram";
import {
  type LiveKitTokenUnavailable,
  type LiveKitTokenReady,
} from "../../../_lib/livekit/token-contract";
import {
  LiveKitAudioSession as HybridLiveKitAudioSession,
  LiveKitRoom as HybridLiveKitRoom,
  LiveKitVideoTrack as HybridLiveKitVideoTrack,
  isLiveKitTrackReference as isHybridLiveKitTrackReference,
  useLiveKitConnectionState as useHybridLiveKitConnectionState,
  useLiveKitLocalParticipant as useHybridLiveKitLocalParticipant,
  useLiveKitTracks as useHybridLiveKitTracks,
} from "../../../_lib/livekit/react-native-module";
import { prepareLiveKitJoinBoundary } from "../../../_lib/livekit/join-boundary";
import { enforceLiveKitParticipantState } from "../../../_lib/livekit/participant-permissions";
import { debugLog, reportRuntimeError } from "../../../_lib/logger";
import { buildSafetyReportContext, submitSafetyReport, trackModerationActionUsed } from "../../../_lib/moderation";
import { isLiveKitRuntimeConfigured } from "../../../_lib/runtimeConfig";
import { useSession } from "../../../_lib/session";
import { supabase } from "../../../_lib/supabase";
import { readUserProfile } from "../../../_lib/userData";
import {
    getActivePartyMemberships,
    getPartyRoomSnapshot,
    getWritablePartyUserId,
    joinPartyRoomSession,
    deletePartyMessage,
    sendPartyMessageRecord,
    setPartyRoomPolicies,
    setPartyParticipantState,
    touchPartyRoomSession,
    type WatchPartyRoomMembership,
    type WatchPartyState,
} from "../../../_lib/watchParty";
import {
    createSocialAttachmentForSurface,
    readSocialAttachmentsForSurfaces,
    type SocialAttachment,
    type SocialAttachmentPickerScope,
    type SocialAttachmentFile,
} from "../../../_lib/socialAttachments";
import { pickSocialAttachmentFile } from "../../../_lib/socialAttachmentPicker";
import { resolveWatchPartyContentSource } from "../../../_lib/watchPartyContentSources";
import {
    getCommunicationRTCModule,
    getLinkedCommunicationRoom,
    getOrCreateLinkedCommunicationRoom,
    type CommunicationParticipantView,
} from "../../../_lib/communication";
import { useCommunicationRoomSession } from "../../../hooks/use-communication-room-session";
import { InternalInviteSheet } from "../../../components/chat/internal-invite-sheet";
import { AccessSheet, type AccessSheetReason } from "../../../components/monetization/access-sheet";
import { MoneyScopeInfoButton } from "../../../components/monetization/MoneyScopeInfoButton";
import { RouteBackedMonetizationProofCard } from "../../../components/monetization/route-backed-monetization-proof-card";
import { ParticipantDetailSheet } from "../../../components/room/participant-detail-sheet";
import { NotificationBellButton } from "../../../components/notifications/notification-bell-button";
import { RoomReactionPicker, pushRecentReaction } from "../../../components/room/reaction-picker";
import { getProtectedSessionCopy } from "../../../components/prototype/protected-session-note";
import { ReportSheet } from "../../../components/safety/report-sheet";
import { BetaAccessScreen } from "../../../components/system/beta-access-screen";
import { useChannelFollowAction } from "../../../hooks/use-channel-follow-action";
import { LiveEffectsPanel } from "../../../components/live/live-effects-sheet";
import { SocialAttachmentActionSheet } from "../../../components/social/social-attachment-action-sheet";
import { SocialAttachmentCard } from "../../../components/social/social-attachment-card";
import {
  patchLiveKitSignalReadingLoop,
} from "../../../components/watch-party-live/livekit-stage-media-surface";
import {
  CHILLYFECTS_BRAND_NAME,
  LIVE_EFFECT_OFF_ID,
  getLiveEffectById,
  getLiveEffectStatusCopy,
  isLiveEffectAppliedToCamera,
} from "../../../_lib/liveEffects";
import { isReactNativeNewArchitecture } from "../../../_lib/reactNativeRuntime";
import { requestSaveReplay } from "../../../_lib/creatorReplays";
import {
    buildOrderedParticipantsWithSelf,
    buildParticipantProfileParams,
    buildSharedParticipantIdentity,
    canRequestSeat,
    createDefaultParticipantState,
    getParticipantLayerLabel,
    LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS,
    mergeMissingParticipantStates,
    normalizeSharedRoomMode,
    prioritizeParticipantStripOrder,
    resolveIdentityName,
    resolveSelectedParticipantContext,
    type SharedParticipantIdentity,
    type SharedParticipantLocalState,
    type SharedRoomMode,
} from "../../../_lib/watch-party/room-shared";

type StageParticipant = SharedParticipantIdentity & {
  username: string;
};

const canStageMembershipPublishMedia = (membership?: WatchPartyRoomMembership | null) => {
  if (!membership) return false;
  if (membership.membershipState === "removed" || membership.membershipState === "left") return false;
  if (membership.isMuted) return false;
  return membership.role === "host" || membership.stageRole === "host" || membership.stageRole === "speaker" || membership.canSpeak;
};

type FloatingReaction = {
  id: string;
  emoji: string;
  originX: number;
  drift: number;
  rise: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
};

type LiveStageComment = {
  id: string;
  userId: string;
  authorLabel: string;
  body: string;
  createdAt: string;
  isMe: boolean;
  attachments: SocialAttachment[];
};

type LiveStageCommentRow = {
  id?: string | null;
  user_id?: string | null;
  username?: string | null;
  text?: string | null;
  created_at?: string | null;
};

const getLiveStageAccessTitle = (access: Pick<RoomAccessResolution, "reason"> | null | undefined) => {
  if (access?.reason === "room_locked") return "Live room locked";
  if (access?.reason === "removed") return "Live room access removed";
  if (access?.reason === "identity_required") return "Sign in required";
  if (access?.reason === "premium_required") return LIVE_FIRST_PREMIUM_UPSELL_COPY.title;
  if (access?.reason === "party_pass_required") return "Seat Pass required";
  return "Live room access unavailable";
};

const getLiveStageAccessBody = (access: Pick<RoomAccessResolution, "reason" | "label"> | null | undefined) => {
  if (access?.reason === "room_locked") return "This live room is locked right now. Ask the host to reopen it.";
  if (access?.reason === "removed") return "You no longer have access to this live room.";
  if (access?.reason === "identity_required") {
    return "Sign in before entering Live Stage so room membership, moderation, and reconnect truth stay reliable.";
  }
  if (access?.reason === "premium_required") {
    return LIVE_FIRST_PREMIUM_UPSELL_COPY.message;
  }
  if (access?.reason === "party_pass_required") {
    return "Watch-Party Seat Pass access is required before this live room can open from the direct Live Stage route.";
  }
  return `${access?.label ?? "Room"} access is unavailable right now.`;
};

const isAccessSheetReason = (reason: string | null | undefined): reason is AccessSheetReason => (
  reason === "premium_required" || reason === "party_pass_required"
);

type StagePresenceEntry = {
  userId?: string;
  username?: string;
  avatarUrl?: string;
  cameraPreviewUrl?: string;
  camera_preview_url?: string;
  role?: string;
  isLive?: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
};

const SIM_REACTIONS = ["👍", "🔥", "👏", "❤️", "✨", "😂"];
const MIC_SPEAKING_THRESHOLD_DB = -52;
const MIC_SPEAKING_RELEASE_MS = 420;
const STAGE_HEARTBEAT_INTERVAL_MILLIS = ROOM_HEARTBEAT_MS;
const STAGE_OVERLAY_AUTO_HIDE_MILLIS = 10_000;
const STAGE_CONTROL_HIT_SLOP = { top: 14, bottom: 14, left: 18, right: 18 } as const;
const LIVE_STAGE_REMOTE_GRID_COLUMNS = 3;
const LIVE_STAGE_REMOTE_GRID_VISIBLE_ROWS = 2;
const LIVE_STAGE_VERBOSE_LOGGING = false;

const debugLiveStage = (message: string, meta?: Record<string, unknown>) => {
  if (!LIVE_STAGE_VERBOSE_LOGGING) return;
  debugLog("live-stage", message, meta);
};
const LIVE_STAGE_REMOTE_GRID_GAP = 8;
const LIVE_STAGE_REMOTE_GRID_TILE_MIN_HEIGHT = 144;
type CommunicationRTCViewComponent = React.ComponentType<{
  streamURL: string;
  style?: object;
  objectFit?: "cover" | "contain";
  mirror?: boolean;
}>;

const HYBRID_LIVEKIT_CONNECT_TIMEOUT_MILLIS = 30_000;
const HYBRID_LIVEKIT_DISCONNECT_FALLBACK_GRACE_MILLIS = 4_500;

type LiveKitStageFallbackReason = "connection_timeout" | "disconnected" | "room_error";

const isHybridLiveKitConnectedishState = (state: unknown) => (
  state === ConnectionState.Connected
  || state === ConnectionState.Connecting
  || state === ConnectionState.Reconnecting
  || state === ConnectionState.SignalReconnecting
);

const isHybridLiveKitClientDisconnectReason = (reason: unknown) => {
  const normalizedReason = String(reason ?? "").toLowerCase();
  return normalizedReason.includes("client") || normalizedReason.includes("user initiated");
};

function ConditionalWrap({
  condition,
  children,
  wrap,
}: {
  condition: boolean;
  children: React.ReactNode;
  wrap: (children: React.ReactNode) => React.ReactElement;
}) {
  return condition ? wrap(children) : <>{children}</>;
}

function LiveKitHybridParticipantVideo({
  participantId,
  fallback,
  remoteTrackIndex = 0,
}: {
  participantId: string;
  fallback: React.ReactNode;
  remoteTrackIndex?: number;
}) {
  const { localParticipant } = useHybridLiveKitLocalParticipant();
  const tracks = useHybridLiveKitTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: false },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: true },
  );
  const remoteTracks = useMemo(
    () => tracks.filter((trackRef) => (
      isHybridLiveKitTrackReference(trackRef)
      && trackRef.participant.identity !== localParticipant.identity
    )),
    [localParticipant.identity, tracks],
  );
  const remoteCameraTracks = useMemo(
    () => remoteTracks.filter((trackRef) => trackRef.source === Track.Source.Camera),
    [remoteTracks],
  );

  const matchingTrack = useMemo(
    () => tracks.find((trackRef) => (
      isHybridLiveKitTrackReference(trackRef)
      && trackRef.participant.identity === participantId
      && trackRef.participant.identity !== localParticipant.identity
      && trackRef.source === Track.Source.Camera
    )) ?? null,
    [localParticipant.identity, participantId, tracks],
  );
  const fallbackRemoteTrack = useMemo(
    () => remoteCameraTracks[remoteTrackIndex] ?? remoteCameraTracks[0] ?? null,
    [remoteCameraTracks, remoteTrackIndex],
  );

  const resolvedRemoteTrack = matchingTrack ?? fallbackRemoteTrack;

  useEffect(() => {
    debugLog("livekit", "live-stage member tile track state", {
      participantId,
      localParticipantIdentity: localParticipant.identity,
      remoteCameraTrackCount: remoteCameraTracks.length,
      remoteCameraIdentities: remoteCameraTracks.map((trackRef) => trackRef.participant.identity),
      hasMatchingTrack: !!matchingTrack,
      resolvedRemoteIdentity: resolvedRemoteTrack && isHybridLiveKitTrackReference(resolvedRemoteTrack)
        ? resolvedRemoteTrack.participant.identity
        : null,
    });
  }, [
    localParticipant.identity,
    matchingTrack,
    participantId,
    remoteCameraTracks,
    resolvedRemoteTrack,
  ]);

  if (resolvedRemoteTrack && isHybridLiveKitTrackReference(resolvedRemoteTrack)) {
    return (
      <View style={styles.stagePresenceCameraFill} collapsable={false}>
        <HybridLiveKitVideoTrack
          trackRef={resolvedRemoteTrack}
          style={styles.stagePresenceCameraFill}
          objectFit="cover"
          mirror={false}
          zOrder={0}
        />
      </View>
    );
  }

  return <>{fallback}</>;
}

function LiveKitHybridHeroVideo({
  fallbackInitial,
  forceLocalHeroFallback = false,
  participantRole,
  preferLocalHero,
  roomName,
}: {
  fallbackInitial: string;
  forceLocalHeroFallback?: boolean;
  participantRole: LiveKitTokenReady["participantRole"];
  preferLocalHero: boolean;
  roomName: string;
}) {
  const connectionState = useHybridLiveKitConnectionState();
  const {
    cameraTrack,
    lastCameraError,
    localParticipant,
  } = useHybridLiveKitLocalParticipant();
  const shouldPublishLocalCamera = participantRole !== "viewer";
  const tracks = useHybridLiveKitTracks(
    [
      { source: Track.Source.ScreenShare, withPlaceholder: false },
      { source: Track.Source.Camera, withPlaceholder: false },
    ],
    { onlySubscribed: true },
  );
  const renderableTracks = useMemo(
    () => tracks.filter(isHybridLiveKitTrackReference),
    [tracks],
  );
  const remoteTracks = useMemo(
    () => renderableTracks.filter((trackRef) => trackRef.participant.identity !== localParticipant.identity),
    [localParticipant.identity, renderableTracks],
  );
  const primaryRemoteTrack = remoteTracks[0] ?? null;
  const publishedLocalCameraTrackRef = useMemo(
    () => renderableTracks.find((trackRef) => (
      trackRef.participant.identity === localParticipant.identity
      && trackRef.source === Track.Source.Camera
    )) ?? null,
    [localParticipant.identity, renderableTracks],
  );
  const directLocalCameraTrackRef = useMemo(() => {
    if (!shouldPublishLocalCamera || !cameraTrack) return null;
    return {
      participant: localParticipant,
      publication: cameraTrack,
      source: Track.Source.Camera,
    };
  }, [cameraTrack, localParticipant, shouldPublishLocalCamera]);
  const localCameraTrackRef = publishedLocalCameraTrackRef ?? directLocalCameraTrackRef;
  const primaryTrack = useMemo(
    () => {
      if (preferLocalHero) {
        if (shouldPublishLocalCamera && localCameraTrackRef) {
          return localCameraTrackRef;
        }
        if (forceLocalHeroFallback) {
          return null;
        }
      }
      return primaryRemoteTrack ?? localCameraTrackRef;
    },
    [forceLocalHeroFallback, localCameraTrackRef, preferLocalHero, primaryRemoteTrack, shouldPublishLocalCamera],
  );
  const visibleTrackCount = (localCameraTrackRef ? 1 : 0) + remoteTracks.length;

  useEffect(() => {
    debugLog("livekit", "hybrid stage media publish state", {
      surfaceLabel: "Hybrid Live Stage",
      roomName,
      participantRole,
      forceLocalHeroFallback,
      preferLocalHero,
      shouldPublishLocalCamera,
      hasLocalCameraTrack: !!cameraTrack,
      hasPublishedLocalCameraTrack: !!publishedLocalCameraTrackRef,
      hasRemoteTrack: !!primaryRemoteTrack,
      remoteTrackCount: remoteTracks.length,
      visibleTrackCount,
      connectionState: String(connectionState ?? ""),
      lastCameraError: lastCameraError?.message ?? null,
    });
  }, [
    cameraTrack,
    connectionState,
    lastCameraError?.message,
    forceLocalHeroFallback,
    participantRole,
    preferLocalHero,
    primaryRemoteTrack,
    publishedLocalCameraTrackRef,
    remoteTracks.length,
    roomName,
    shouldPublishLocalCamera,
    visibleTrackCount,
  ]);

  if (primaryTrack && isHybridLiveKitTrackReference(primaryTrack)) {
    const showLocalPrimary = primaryTrack.participant.identity === localParticipant.identity;

    return (
      <View style={styles.stageHeroMediaFill} collapsable={false}>
        <HybridLiveKitVideoTrack
          trackRef={primaryTrack}
          style={styles.stageHeroMediaFill}
          objectFit="cover"
          mirror={showLocalPrimary}
          zOrder={0}
        />
      </View>
    );
  }

  const isConnected = String(connectionState ?? "").toLowerCase() === "connected";
  const shouldShowWaiting = isConnected && shouldPublishLocalCamera && !lastCameraError;
  const fallbackText = shouldShowWaiting
    ? "Preparing your live camera…"
    : "Live feed is syncing.";

  return (
    <View style={styles.stageHeroFallback}>
      <Text style={styles.stageHeroFallbackInitial}>{fallbackInitial}</Text>
      <Text style={styles.stageHeroFallbackBody}>{fallbackText}</Text>
    </View>
  );
}

function LiveKitHybridCommunityRoomHost({
  joinContract,
  onFallback,
  publishLocalAudio,
  publishLocalCamera,
  children,
}: {
  joinContract: LiveKitTokenReady;
  onFallback: (reason: LiveKitStageFallbackReason) => void;
  publishLocalAudio: boolean;
  publishLocalCamera: boolean;
  children: React.ReactNode;
}) {
  const fallbackTriggeredRef = useRef(false);
  const tearingDownRoomsRef = useRef(new Set<Room>());
  const didConnectOnceRef = useRef(false);
  const disconnectFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [didConnectOnce, setDidConnectOnce] = useState(false);
  const [mediaDeviceFailure, setMediaDeviceFailure] = useState<string | null>(null);
  const connectOptions = useMemo(() => ({ autoSubscribe: true }), []);
  const roomKey = `${joinContract.roomName}:${joinContract.participantToken}`;
  const room = useMemo(() => {
    void roomKey;
    const nextRoom = new Room(createLiveKitV1RoomOptions({ adaptiveStream: true, dynacast: true }));
    patchLiveKitSignalReadingLoop(
      nextRoom,
      "Hybrid Live Stage",
      () => tearingDownRoomsRef.current.has(nextRoom),
    );
    return nextRoom;
  }, [roomKey]);

  const clearDisconnectFallbackTimeout = useCallback(() => {
    if (!disconnectFallbackTimeoutRef.current) return;
    clearTimeout(disconnectFallbackTimeoutRef.current);
    disconnectFallbackTimeoutRef.current = null;
  }, []);

  const disableHybridLocalMediaQuietly = useCallback((reason: string, options?: { audio?: boolean; camera?: boolean }) => {
    const localParticipant = room.localParticipant as {
      setCameraEnabled?: (enabled: boolean, options?: unknown) => Promise<unknown>;
      setMicrophoneEnabled?: (enabled: boolean) => Promise<unknown>;
    };
    const shouldDisableAudio = options?.audio !== false;
    const shouldDisableCamera = options?.camera !== false;

    Promise.all([
      shouldDisableCamera ? localParticipant.setCameraEnabled?.(false, LIVE_VIDEO_CAPTURE_OPTIONS) ?? Promise.resolve() : Promise.resolve(),
      shouldDisableAudio ? localParticipant.setMicrophoneEnabled?.(false) ?? Promise.resolve() : Promise.resolve(),
    ]).catch((error) => {
      debugLog("livekit", "hybrid community local media disable failed", {
        roomName: joinContract.roomName,
        participantRole: joinContract.participantRole,
        reason,
        audio: shouldDisableAudio,
        camera: shouldDisableCamera,
        error: error instanceof Error ? error.message : String(error ?? ""),
      });
    });
  }, [joinContract.participantRole, joinContract.roomName, room]);

  const triggerFallback = useCallback(
    (reason: LiveKitStageFallbackReason, error?: unknown) => {
      if (fallbackTriggeredRef.current) return;
      fallbackTriggeredRef.current = true;
      clearDisconnectFallbackTimeout();

      if (error) {
        reportRuntimeError("livekit-hybrid-community-room", error, {
          reason,
          roomName: joinContract.roomName,
          participantRole: joinContract.participantRole,
          endpoint: joinContract.endpoint,
        });
      }

      onFallback(reason);
    },
    [clearDisconnectFallbackTimeout, joinContract.endpoint, joinContract.participantRole, joinContract.roomName, onFallback],
  );

  useEffect(() => {
    fallbackTriggeredRef.current = false;
    didConnectOnceRef.current = false;
    tearingDownRoomsRef.current.delete(room);
    clearDisconnectFallbackTimeout();
    setDidConnectOnce(false);
    setMediaDeviceFailure(null);
  }, [clearDisconnectFallbackTimeout, room]);

  useEffect(() => {
    const tearingDownRooms = tearingDownRoomsRef.current;
    return () => {
      tearingDownRooms.add(room);
      fallbackTriggeredRef.current = true;
      clearDisconnectFallbackTimeout();
      disableHybridLocalMediaQuietly("unmount");
    };
  }, [clearDisconnectFallbackTimeout, disableHybridLocalMediaQuietly, room]);

  useEffect(() => {
    if (!publishLocalAudio || joinContract.participantRole === "viewer") {
      disableHybridLocalMediaQuietly("audio-authority-downgrade", { camera: false });
    }
  }, [disableHybridLocalMediaQuietly, joinContract.participantRole, publishLocalAudio]);

  useEffect(() => {
    if (!publishLocalCamera || joinContract.participantRole === "viewer") {
      disableHybridLocalMediaQuietly("camera-authority-downgrade", { audio: false });
    }
  }, [disableHybridLocalMediaQuietly, joinContract.participantRole, publishLocalCamera]);

  useEffect(() => {
    let cancelled = false;
    const localParticipant = room.localParticipant as {
      setCameraEnabled?: (enabled: boolean, options?: unknown) => Promise<unknown>;
      setMicrophoneEnabled?: (enabled: boolean) => Promise<unknown>;
    };
    const shouldPublishCamera = publishLocalCamera && joinContract.participantRole !== "viewer";
    const shouldPublishAudio = publishLocalAudio && joinContract.participantRole !== "viewer";

    localParticipant.setCameraEnabled?.(shouldPublishCamera, LIVE_VIDEO_CAPTURE_OPTIONS).catch((error) => {
      if (cancelled) return;
      debugLog("livekit", "explicit hybrid stage camera publish toggle failed", {
        roomName: joinContract.roomName,
        participantRole: joinContract.participantRole,
        shouldPublishCamera,
        error: error instanceof Error ? error.message : String(error ?? ""),
      });
    });
    localParticipant.setMicrophoneEnabled?.(shouldPublishAudio).catch((error) => {
      if (cancelled) return;
      debugLog("livekit", "explicit hybrid stage microphone publish toggle failed", {
        roomName: joinContract.roomName,
        participantRole: joinContract.participantRole,
        shouldPublishAudio,
        error: error instanceof Error ? error.message : String(error ?? ""),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [
    joinContract.participantRole,
    joinContract.roomName,
    publishLocalAudio,
    publishLocalCamera,
    room.localParticipant,
  ]);

  useEffect(() => {
    let active = true;

    HybridLiveKitAudioSession.startAudioSession().catch((error) => {
      if (!active) return;
      reportRuntimeError("livekit-hybrid-community-audio-session", error, {
        roomName: joinContract.roomName,
        participantRole: joinContract.participantRole,
      });
    });

    return () => {
      active = false;
      HybridLiveKitAudioSession.stopAudioSession().catch(() => {});
    };
  }, [joinContract.participantRole, joinContract.roomName]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!didConnectOnce) {
        if (isHybridLiveKitConnectedishState(room.state)) {
          debugLog("livekit", "hybrid community room still connecting after timeout window", {
            roomName: joinContract.roomName,
            participantRole: joinContract.participantRole,
            connectionState: String(room.state ?? ""),
          });
          return;
        }
        triggerFallback(
          "connection_timeout",
          new Error("LiveKit did not finish connecting before the hybrid community feed fallback deadline."),
        );
      }
    }, HYBRID_LIVEKIT_CONNECT_TIMEOUT_MILLIS);

    return () => {
      clearTimeout(timeout);
    };
  }, [didConnectOnce, joinContract.participantRole, joinContract.roomName, room, triggerFallback]);

  const handleConnected = useCallback(() => {
    clearDisconnectFallbackTimeout();
    tearingDownRoomsRef.current.delete(room);
    didConnectOnceRef.current = true;
    setDidConnectOnce(true);
    debugLog("livekit", "hybrid community room connected", {
      roomName: joinContract.roomName,
      participantRole: joinContract.participantRole,
      publishLocalCamera,
    });
  }, [clearDisconnectFallbackTimeout, joinContract.participantRole, joinContract.roomName, publishLocalCamera, room]);

  const handleDisconnected = useCallback((reason?: unknown) => {
    if (tearingDownRoomsRef.current.has(room) || isHybridLiveKitClientDisconnectReason(reason)) {
      debugLog("livekit", "hybrid community room disconnected without fallback", {
        roomName: joinContract.roomName,
        participantRole: joinContract.participantRole,
        reason: String(reason ?? "unknown"),
      });
      return;
    }

    clearDisconnectFallbackTimeout();
    disconnectFallbackTimeoutRef.current = setTimeout(() => {
      disconnectFallbackTimeoutRef.current = null;
      if (tearingDownRoomsRef.current.has(room) || isHybridLiveKitConnectedishState(room.state)) {
        return;
      }
      triggerFallback(
        "disconnected",
        new Error(didConnectOnceRef.current
          ? "LiveKit stayed disconnected after the hybrid community reconnect grace period."
          : "LiveKit disconnected before the hybrid community feed could stay stable."),
      );
    }, HYBRID_LIVEKIT_DISCONNECT_FALLBACK_GRACE_MILLIS);

    debugLog("livekit", "hybrid community room disconnected during reconnect grace", {
      roomName: joinContract.roomName,
      participantRole: joinContract.participantRole,
      reason: String(reason ?? "unknown"),
      didConnectOnce: didConnectOnceRef.current,
    });
  }, [
    clearDisconnectFallbackTimeout,
    joinContract.participantRole,
    joinContract.roomName,
    room,
    triggerFallback,
  ]);

  const handleError = useCallback((error: Error) => {
    if (tearingDownRoomsRef.current.has(room)) return;
    triggerFallback("room_error", error);
  }, [room, triggerFallback]);

  const handleMediaDeviceFailure = useCallback((failure: unknown) => {
    const normalizedFailure = String(failure ?? "unknown_failure");
    setMediaDeviceFailure(normalizedFailure);
    reportRuntimeError("livekit-hybrid-community-media-device", new Error(`LiveKit media-device failure: ${normalizedFailure}`), {
      roomName: joinContract.roomName,
      participantRole: joinContract.participantRole,
      publishLocalAudio,
      publishLocalCamera,
    });
  }, [joinContract.participantRole, joinContract.roomName, publishLocalAudio, publishLocalCamera]);

  return (
    <HybridLiveKitRoom
      key={roomKey}
      room={room}
      serverUrl={joinContract.serverUrl}
      token={joinContract.participantToken}
      connect
      audio={publishLocalAudio}
      video={publishLocalCamera ? LIVE_VIDEO_CAPTURE_OPTIONS : false}
      connectOptions={connectOptions}
      onConnected={handleConnected}
      onDisconnected={handleDisconnected}
      onError={handleError}
      onMediaDeviceFailure={handleMediaDeviceFailure}
    >
      {children}
      {mediaDeviceFailure ? (
        <View pointerEvents="none" style={styles.hybridLiveKitStatusPill}>
          <Text style={styles.hybridLiveKitStatusText}>Audio/device issue: {mediaDeviceFailure}</Text>
        </View>
      ) : null}
    </HybridLiveKitRoom>
  );
}

// Live Stage surface lock: preserve docs/LIVE_WATCH_PARTY_LAYOUT_LOCK.md.
// Do not visually change routes, comments, controls, player, composer, labels, or member tiles here without explicit approval.
// Live First must not render the Chi'lly Party Members box; Live Watch-Party owns that deck.
type WatchPartyLiveStageScreenProps = {
  routePartyId?: string;
  routeMode?: string;
  routeSource?: string;
};

export default function WatchPartyLiveStageScreen({
  routePartyId,
  routeMode,
  routeSource,
}: WatchPartyLiveStageScreenProps = {}) {
  const safeAreaInsets = useSafeAreaInsets();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const isFocused = useIsFocused();
  const { isLoading: authLoading, isSignedIn } = useSession();
  const { accessState, isLoading: betaLoading, isActive } = useBetaProgram();
  const { partyId: partyIdParam, mode: modeParam, source: sourceParam } = useLocalSearchParams<{ partyId?: string; mode?: string; source?: string }>();
  const router = useRouter();
  const partyId = routePartyId ?? (Array.isArray(partyIdParam) ? partyIdParam[0] : partyIdParam) ?? "";
  const modeParamValue = routeMode ?? (Array.isArray(modeParam) ? modeParam[0] : modeParam);
  const source = String(routeSource ?? (Array.isArray(sourceParam) ? sourceParam[0] : sourceParam ?? "")).trim().toLowerCase();
  const requestedRouteStageMode = normalizeSharedRoomMode(modeParamValue, "live");
  const initialStageMode = requestedRouteStageMode === "hybrid" ? "live" : requestedRouteStageMode;
  const returnToWatchPartyRoomRoute = useCallback(() => {
    const routeParams = {
      mode: requestedRouteStageMode,
      ...(source ? { source } : {}),
    };

    if (!partyId) {
      router.replace({
        pathname: "/watch-party",
        params: routeParams,
      });
      return;
    }

    router.replace({
      pathname: "/watch-party/[partyId]",
      params: {
        partyId,
        ...routeParams,
      },
    });
  }, [partyId, requestedRouteStageMode, router, source]);
  const canUseBetaStage = isSignedIn && isActive;
  const blockedBetaCopy = getBetaAccessBlockCopy(accessState.status, "Live Stage");

  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState<WatchPartyState | null>(null);
  const [blockedRoomAccess, setBlockedRoomAccess] = useState<RoomAccessResolution | null>(null);
  const [routeProofConfig, setRouteProofConfig] = useState<RouteBackedMonetizationProofConfig | null>(null);
  const [liveWatchPartyPremiumGate, setLiveWatchPartyPremiumGate] = useState<PremiumWatchPartyFeatureAccessDecision | null>(null);
  const [liveWatchPartyAccessSheetVisible, setLiveWatchPartyAccessSheetVisible] = useState(false);
  const [livePremiumGateKind, setLivePremiumGateKind] = useState<"live_first" | "live_watch_party">("live_watch_party");
  const [accessRetryToken, setAccessRetryToken] = useState(0);
  const [roomMissing, setRoomMissing] = useState(false);
  const [roomEntryError, setRoomEntryError] = useState("");
  const [sourceAttribution, setSourceAttribution] = useState<string | null>(null);
  const [sourceEnded, setSourceEnded] = useState(false);
  const [participants, setParticipants] = useState<StageParticipant[]>([]);
  const [myUserId, setMyUserId] = useState<string>("");
  const [myUsername, setMyUsername] = useState<string>("You");
  const [isHost, setIsHost] = useState(false);
  const [liveSurface, setLiveSurface] = useState<"room" | "stage">("room");
  const [stageMode, setStageMode] = useState<SharedRoomMode>(initialStageMode);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [stageControlsOpen, setStageControlsOpen] = useState(false);
  const [faceFilterSheetOpen, setFaceFilterSheetOpen] = useState(false);
  const [hybridCommentFocused, setHybridCommentFocused] = useState(false);
  const [hybridComments, setHybridComments] = useState<LiveStageComment[]>([]);
  const [hybridCommentDraft, setHybridCommentDraft] = useState("");
  const [hybridCommentError, setHybridCommentError] = useState("");
  const [hybridCommentSending, setHybridCommentSending] = useState(false);
  const [saveReplayEnding, setSaveReplayEnding] = useState(false);

  useEffect(() => {
    if (!isFocused || Platform.OS === "web") return undefined;

    const keepAwakeTag = `chillywood-live-stage:${partyId || "route"}`;
    activateKeepAwakeAsync(keepAwakeTag).catch((error) => {
      reportRuntimeError("live-stage-keep-awake-activate", error, { partyId });
    });

    return () => {
      deactivateKeepAwake(keepAwakeTag).catch((error) => {
        reportRuntimeError("live-stage-keep-awake-deactivate", error, { partyId });
      });
    };
  }, [isFocused, partyId]);
  const [hybridCommentAttachmentFile, setHybridCommentAttachmentFile] = useState<SocialAttachmentFile | null>(null);
  const [hybridCommentAttachmentSheetVisible, setHybridCommentAttachmentSheetVisible] = useState(false);
  const [stageKeyboardHeight, setStageKeyboardHeight] = useState(0);
  const [selectedStageEffectId, setSelectedStageEffectId] = useState(LIVE_EFFECT_OFF_ID);
  const [stageOverlayVisible, setStageOverlayVisible] = useState(true);
  const [stageOverlayAutoHideArmed, setStageOverlayAutoHideArmed] = useState(false);
  const [controlsLocked, setControlsLocked] = useState(false);
  const [viewerSelfHeroEnabled, setViewerSelfHeroEnabled] = useState(false);
  const [recentReactionEmojis, setRecentReactionEmojis] = useState<string[]>([]);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [activeSpeakerUserId, setActiveSpeakerUserId] = useState<string>("");
  const [activeParticipantId, setActiveParticipantId] = useState<string>("");
  const [featuredParticipantById, setFeaturedParticipantById] = useState<Record<string, boolean>>({});
  const [participantPresentationById, setParticipantPresentationById] = useState<Record<string, "compact" | "expanded">>({});
  const [participantStateById, setParticipantStateById] = useState<Record<string, SharedParticipantLocalState>>({});
  const [seatRequestsById, setSeatRequestsById] = useState<Record<string, boolean>>({});
  const [seatRequestSheetParticipantId, setSeatRequestSheetParticipantId] = useState("");
  const [seatRequestSheetClosedById, setSeatRequestSheetClosedById] = useState<Record<string, boolean>>({});
  const [stageParticipantActionBusyId, setStageParticipantActionBusyId] = useState("");
  const [isSpeakingById, setIsSpeakingById] = useState<Record<string, boolean>>({});
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>("");
  const [hiddenParticipantIds, setHiddenParticipantIds] = useState<Record<string, boolean>>({});
  const [appConfig, setAppConfig] = useState(DEFAULT_APP_CONFIG);
  const [communicationRoomId, setCommunicationRoomId] = useState("");
  const [reportVisible, setReportVisible] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ userId: string; label: string } | null>(null);
  const [inviteSheetVisible, setInviteSheetVisible] = useState(false);
  const [liveKitJoinContract, setLiveKitJoinContract] = useState<LiveKitTokenReady | null>(null);
  const [liveKitJoinUnavailable, setLiveKitJoinUnavailable] = useState<LiveKitTokenUnavailable | null>(null);
  const myCameraPreviewUrlRef = useRef<string>("");
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const channelRef = useRef<RealtimeChannel | null>(null);
  const roomRealtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const roomMessagesChannelRef = useRef<RealtimeChannel | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const membershipMapRef = useRef<Record<string, WatchPartyRoomMembership>>({});
  const hybridCommentsScrollRef = useRef<ScrollView | null>(null);
  const hybridCommentInputRef = useRef<TextInput | null>(null);
  const motion = useRef(new Animated.Value(0)).current;
  const reactionTapPulse = useRef(new Animated.Value(0)).current;
  const stageOverlayMotion = useRef(new Animated.Value(1)).current;
  const reactionCounterRef = useRef(0);
  const stageOverlayLastInteractionAtRef = useRef(Date.now());
  const stageOverlayAutoHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stageOverlayFinalizeHideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const micRecordingRef = useRef<Audio.Recording | null>(null);
  const micSpeakingRef = useRef(false);
  const micReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveKitStageContractRefreshKeyRef = useRef("");
  const liveKitStageAuthorityRetryKeyRef = useRef("");
  const liveKitStageAuthorityRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveKitStageMountedRef = useRef(true);
  const stripOrderRef = useRef<string>("");
  const branding = resolveBrandingConfig(appConfig);
  const monetizationConfig = resolveMonetizationConfig(appConfig);

  useEffect(() => {
    let active = true;
    readRouteBackedMonetizationProofConfig({
      sourceId: partyId,
      sourceTypes: ["live_watch_party_access", "live_watch_party_seat"],
    })
      .then((config) => {
        if (active) setRouteProofConfig(config);
      })
      .catch(() => {
        if (active) setRouteProofConfig(null);
      });
    return () => {
      active = false;
    };
  }, [partyId]);

  useEffect(() => {
    return () => {
      liveKitStageMountedRef.current = false;
      if (liveKitStageAuthorityRetryTimeoutRef.current) {
        clearTimeout(liveKitStageAuthorityRetryTimeoutRef.current);
        liveKitStageAuthorityRetryTimeoutRef.current = null;
      }
    };
  }, []);

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

  useEffect(() => {
    let active = true;
    if (room?.sourceType !== "spectator_playback") {
      setSourceAttribution(null);
      setSourceEnded(false);
      return () => {
        active = false;
      };
    }

    resolveWatchPartyContentSource(room)
      .then((sourceInfo) => {
        if (!active) return;
        setSourceAttribution(
          sourceInfo.attributionLabel
          ?? (sourceInfo.displayName ? `Watching ${sourceInfo.displayName} from this Platform` : "Watching from this Platform"),
        );
        setSourceEnded(sourceInfo.sourceEnded === true || sourceInfo.unavailableReason === "ended");
      })
      .catch(() => {
        if (!active) return;
        setSourceAttribution("Watching from this Platform");
        setSourceEnded(false);
      });

    return () => {
      active = false;
    };
  }, [room]);

  useEffect(() => {
    setCommunicationRoomId("");
    setLiveKitJoinContract(null);
    setLiveKitJoinUnavailable(null);
    setBlockedRoomAccess(null);
    setLiveWatchPartyPremiumGate(null);
    setLivePremiumGateKind("live_watch_party");
    setLiveWatchPartyAccessSheetVisible(false);
    setRoomMissing(false);
    setRoomEntryError("");
    setViewerSelfHeroEnabled(false);
    setSeatRequestSheetParticipantId("");
    setSeatRequestSheetClosedById({});
  }, [partyId]);

  const syncStageSnapshot = useCallback((snapshot: { room: WatchPartyState; memberships: WatchPartyRoomMembership[] }, trackedUserId: string) => {
    setRoom(snapshot.room);
    membershipMapRef.current = Object.fromEntries(snapshot.memberships.map((membership) => [membership.userId, membership]));
    setIsHost(String(snapshot.room.hostUserId) === String(trackedUserId));

    const nextParticipantStateById: Record<string, SharedParticipantLocalState> = {};
    getActivePartyMemberships(snapshot.memberships).forEach((membership) => {
      if (membership.membershipState === "removed" || membership.membershipState === "left") return;
      nextParticipantStateById[membership.userId] = {
        isMuted: membership.isMuted,
        role: membership.stageRole,
        isRemoved: false,
      };
    });
    setParticipantStateById(nextParticipantStateById);
    setSeatRequestsById((prev) => {
      const next: Record<string, boolean> = {};
      Object.entries(prev).forEach(([participantId, pending]) => {
        if (!pending) return;
        const participantState = nextParticipantStateById[participantId];
        if (participantState && !participantState.isRemoved && participantState.role === "listener") {
          next[participantId] = true;
        }
      });
      return next;
    });
  }, []);

  const refreshStageSnapshot = useCallback(async (trackedUserId?: string) => {
    const snapshot = await getPartyRoomSnapshot(partyId).catch(() => null);
    if (!snapshot) return null;
    if (snapshot.room.roomType !== "live") return null;
    syncStageSnapshot(snapshot, String(trackedUserId ?? myUserId ?? "").trim());
    return snapshot;
  }, [myUserId, partyId, syncStageSnapshot]);

  const buildStageParticipantsFromPresence = useCallback((options: {
    state: Record<string, StagePresenceEntry[] | undefined>;
    trackedUserId: string;
    profileUsername?: string | null;
    profileAvatarUrl?: string;
    profileCameraPreviewUrl?: string;
  }) => {
    const activeMemberships = getActivePartyMemberships(Object.values(membershipMapRef.current))
      .filter((membership) => membership.membershipState !== "removed" && membership.membershipState !== "left");
    const seenIds = new Set<string>([
      ...Object.keys(options.state),
      ...activeMemberships.map((membership) => membership.userId),
    ]);

    const list = [...seenIds].map<StageParticipant | null>((presenceKey) => {
      const presences = options.state[presenceKey];
      const p = Array.isArray(presences)
        ? presences[0] as StagePresenceEntry
        : undefined;
      const resolvedUserId = String(p?.userId ?? presenceKey).trim();
      if (!resolvedUserId) return null;
      const membership = membershipMapRef.current[resolvedUserId];
      if (!membership && resolvedUserId !== options.trackedUserId) return null;
      if (membership && (membership.membershipState === "removed" || membership.membershipState === "left")) return null;

      const identity = buildSharedParticipantIdentity({
        userId: resolvedUserId,
        role: membership?.role ?? p?.role,
        displayNameCandidates: [
          p?.username,
          membership?.displayName,
          resolvedUserId === options.trackedUserId ? options.profileUsername : "",
          "Guest",
        ],
        avatarUrl: String(p?.avatarUrl ?? membership?.avatarUrl ?? "").trim() || (resolvedUserId === options.trackedUserId ? options.profileAvatarUrl : ""),
        cameraPreviewUrl: String(p?.cameraPreviewUrl ?? p?.camera_preview_url ?? membership?.cameraPreviewUrl ?? "").trim() || (resolvedUserId === options.trackedUserId ? options.profileCameraPreviewUrl : ""),
        currentUserId: options.trackedUserId,
        isLive: typeof p?.isLive === "boolean" ? p.isLive : membership?.membershipState === "active",
        isSpeaking: p?.isSpeaking,
        isMuted: membership?.isMuted ?? p?.isMuted,
      });

      return {
        ...identity,
        username: identity.displayName,
      };
    }).filter(Boolean) as StageParticipant[];

    return [...list].sort((a, b) => {
      const aMe = a.userId === options.trackedUserId ? 1 : 0;
      const bMe = b.userId === options.trackedUserId ? 1 : 0;
      return bMe - aMe;
    });
  }, []);

  useEffect(() => {
    if (!canUseBetaStage || !partyId || !myUserId) return;

    const state = channelRef.current?.presenceState<StagePresenceEntry>() ?? {};
    setParticipants(buildStageParticipantsFromPresence({
      state,
      trackedUserId: myUserId,
      profileUsername: myUsername,
      profileCameraPreviewUrl: myCameraPreviewUrlRef.current,
    }));
  }, [buildStageParticipantsFromPresence, canUseBetaStage, myUserId, myUsername, participantStateById, partyId]);

  const requireLiveStagePremium = useCallback(async (
    feature: "live_first" | "live_watch_party",
    surface: "toggle" | "route",
  ) => {
    const access = await (feature === "live_first" ? requireLiveFirstPremium : requireLiveWatchPartyPremium)({
      accessKey: partyId,
    }).catch(() => null);
    if (access?.allowed) {
      setLiveWatchPartyPremiumGate(null);
      return true;
    }

    if (isRuntimeControlBlockedAccess(access)) {
      const blockedCopy = getRuntimeControlBlockedCopy(access);
      setLiveWatchPartyPremiumGate(null);
      setLiveWatchPartyAccessSheetVisible(false);
      if (surface === "route") {
        setRoomEntryError(blockedCopy.message);
      } else {
        Alert.alert(blockedCopy.title, blockedCopy.message);
      }
      trackEvent("runtime_control_blocked", {
        surface: surface === "route"
          ? (feature === "live_first" ? "live-stage-route-live" : "live-stage-route-hybrid")
          : (feature === "live_first" ? "live-stage-entry" : "live-stage-mode-toggle"),
        controlKey: access?.runtimeControlKey ?? (feature === "live_first" ? "live_first_enabled" : "live_watch_party_enabled"),
        roomId: partyId,
      });
      return false;
    }

    if (access) setLiveWatchPartyPremiumGate(access);
    setLivePremiumGateKind(feature);
    setLiveWatchPartyAccessSheetVisible(true);
    trackEvent("monetization_gate_shown", {
      surface: surface === "route"
        ? (feature === "live_first" ? "live-stage-route-live" : "live-stage-route-hybrid")
        : (feature === "live_first" ? "live-stage-entry" : "live-stage-mode-toggle"),
      reason: access?.reason ?? "premium_required",
      roomId: partyId,
    });
    return false;
  }, [partyId]);

  const requireHybridModePremium = useCallback(
    (surface: "toggle" | "route") => requireLiveStagePremium("live_watch_party", surface),
    [requireLiveStagePremium],
  );

  const updateStageMode = useCallback(async (nextMode: SharedRoomMode) => {
    if (!isHost) return;

    if (nextMode === "hybrid" && !(await requireHybridModePremium("toggle"))) {
      setStageMode("live");
      if (modeParamValue && normalizeSharedRoomMode(modeParamValue, "live") === "hybrid") {
        router.setParams({ mode: "live" });
      }
      return;
    }

    // Layout lock: mode switches must re-arm the same 10s overlay auto-hide without moving comments.
    if (stageOverlayAutoHideTimeoutRef.current) {
      clearTimeout(stageOverlayAutoHideTimeoutRef.current);
      stageOverlayAutoHideTimeoutRef.current = null;
    }
    if (stageOverlayFinalizeHideTimeoutRef.current) {
      clearTimeout(stageOverlayFinalizeHideTimeoutRef.current);
      stageOverlayFinalizeHideTimeoutRef.current = null;
    }
    setCommentsOpen(false);
    setReactionPickerOpen(false);
    setStageControlsOpen(false);
    setFaceFilterSheetOpen(false);
    setHybridCommentFocused(false);
    hybridCommentInputRef.current?.blur();
    stageOverlayLastInteractionAtRef.current = Date.now();
    setStageOverlayVisible(true);
    stageOverlayMotion.stopAnimation();
    stageOverlayMotion.setValue(1);
    setStageOverlayAutoHideArmed(true);
    setStageMode(nextMode);
    if (modeParamValue !== nextMode) {
      router.setParams({ mode: nextMode });
    }
  }, [isHost, modeParamValue, requireHybridModePremium, router, stageOverlayMotion]);

  useEffect(() => {
    const normalizedRouteMode = normalizeSharedRoomMode(modeParamValue, "live");
    if (!room || !myUserId) {
      if (normalizedRouteMode !== "hybrid") {
        setStageMode((currentMode) => (currentMode === normalizedRouteMode ? currentMode : normalizedRouteMode));
      }
      return;
    }

    if (!isHost) {
      setStageMode((currentMode) => (currentMode === "hybrid" ? currentMode : "hybrid"));
      if (normalizedRouteMode !== "hybrid") {
        router.setParams({ mode: "hybrid" });
      }
      return;
    }

    if (normalizedRouteMode !== "hybrid") {
      setStageMode((currentMode) => (currentMode === normalizedRouteMode ? currentMode : normalizedRouteMode));
      return;
    }

    let cancelled = false;
    requireHybridModePremium("route")
      .then((allowed) => {
        if (cancelled) return;
        if (allowed) {
          setStageMode("hybrid");
          return;
        }
        setStageMode("live");
        router.setParams({ mode: "live" });
      })
      .catch(() => {
        if (cancelled) return;
        setStageMode("live");
        router.setParams({ mode: "live" });
      });

    return () => {
      cancelled = true;
    };
  }, [isHost, modeParamValue, myUserId, requireHybridModePremium, room?.partyId, router]);

  useEffect(() => {
    setLiveSurface("room");
    setSeatRequestsById({});
  }, [partyId]);

  useEffect(() => {
    if (Platform.OS === "android" && !isReactNativeNewArchitecture() && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow",
      (event) => setStageKeyboardHeight(Math.max(0, event.endCoordinates?.height ?? 0)),
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide",
      () => setStageKeyboardHeight(0),
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const backgroundSource: ImageSourcePropType | null = (() => {
    const first = localTitles[0] as any;
    return first?.image || first?.poster || null;
  })();

  useEffect(() => {
    debugLiveStage("mount", { partyIdParam, partyId });
  }, [partyIdParam, partyId]);

  useEffect(() => {
    debugLiveStage("loading state", { loading });
  }, [loading]);

  useEffect(() => {
    if (!canUseBetaStage) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    let loadGuardTimeout: ReturnType<typeof setTimeout> | null = null;

    const init = async () => {
      try {
        debugLiveStage("route params", { partyIdParam, partyId });
        debugLiveStage("async start", { partyId });

        if (!partyId) {
          debugLiveStage("missing party id");
          debugLiveStage("set loading false", { reason: "missing-party-id" });
          setRoomMissing(true);
          setLoading(false);
          return;
        }

        setBlockedRoomAccess(null);
        setRoomMissing(false);
        setRoomEntryError("");

        const userId = await getWritablePartyUserId().catch(() => null);
        const trackedUserId = String(userId ?? "").trim();
        const profile = await readUserProfile().catch(() => null);
        let profileAvatarUrl = "";
        let profileCameraPreviewUrl = "";
        try {
          const authUser = await supabase.auth.getUser();
          const metadata = authUser.data.user?.user_metadata as Record<string, unknown> | undefined;
          profileAvatarUrl = String(metadata?.avatar_url ?? metadata?.picture ?? "").trim();
          profileCameraPreviewUrl = String(metadata?.camera_preview_url ?? metadata?.cameraPreviewUrl ?? "").trim();
        } catch {
          profileAvatarUrl = "";
          profileCameraPreviewUrl = "";
        }
        const username = resolveIdentityName(profile?.username, "Guest");
        const snapshot = await getPartyRoomSnapshot(partyId).catch(() => null);

        debugLiveStage("async complete", {
          userId,
          username,
          roomFound: !!snapshot?.room,
        });

        if (cancelled) return;

        setMyUserId(trackedUserId);
        setMyUsername(username || "You");
        myCameraPreviewUrlRef.current = profileCameraPreviewUrl;

        if (!snapshot) {
          setRoomMissing(true);
          setLoading(false);
          return;
        }

        if (snapshot.room.roomType !== "live") {
          setRoomEntryError("This room belongs to Watch-Party Live, not Live Stage. Open Party Room to continue.");
          setLoading(false);
          return;
        }

        const currentMembership = trackedUserId
          ? snapshot.memberships.find((membership) => membership.userId === trackedUserId) ?? null
          : null;
        const access = await resolveRoomAccess({
          roomSurface: "watch_party",
          partyId,
          room: snapshot.room,
          membership: currentMembership,
          ...(trackedUserId ? { userId: trackedUserId } : {}),
        }).catch(() => null);

        if (cancelled) return;

        if (!access) {
          setRoomEntryError("Unable to confirm live-room access right now.");
          setLoading(false);
          return;
        }

        if (!access.isAllowed) {
          setBlockedRoomAccess(access);
          setLoading(false);
          return;
        }

        syncStageSnapshot(snapshot, trackedUserId);
        const sessionMembership = currentMembership ?? membershipMapRef.current[trackedUserId] ?? null;
        const sessionIsHost = trackedUserId === snapshot.room.hostUserId;
        const sessionCanPublishMedia = sessionIsHost || canStageMembershipPublishMedia(sessionMembership);
        const persistedSessionMembership = await joinPartyRoomSession({
          partyId,
          userId: trackedUserId,
          role: sessionIsHost ? "host" : sessionMembership?.role ?? "viewer",
          stageRole: sessionMembership?.stageRole ?? (sessionIsHost ? "host" : undefined),
          canSpeak: sessionMembership?.canSpeak ?? (sessionIsHost ? true : undefined),
          cameraEnabled: sessionCanPublishMedia && !!profileCameraPreviewUrl,
          micEnabled: sessionCanPublishMedia,
          displayName: username,
          avatarUrl: profileAvatarUrl,
          cameraPreviewUrl: profileCameraPreviewUrl,
        }).catch(() => null);
        if (cancelled) return;
        const refreshedSnapshot = await refreshStageSnapshot(trackedUserId).catch(() => null);
        const persistedTrackedMembership = persistedSessionMembership
          ?? refreshedSnapshot?.memberships.find((membership) => membership.userId === trackedUserId)
          ?? membershipMapRef.current[trackedUserId]
          ?? null;
        if (!persistedTrackedMembership) {
          debugLog("live-stage", "blocked presence tracking without persisted membership", {
            partyId,
            trackedUserId,
            sessionIsHost,
          });
          setRoomEntryError("Unable to save your live-room seat yet. Check access and rejoin the room.");
          setLoading(false);
          return;
        }

        const roomChannelName = `room-${partyId}`;
        supabase.getChannels().forEach((existingChannel) => {
          if (existingChannel.topic === roomChannelName || existingChannel.topic === `realtime:${roomChannelName}`) {
            supabase.removeChannel(existingChannel);
          }
        });

        const channel = supabase.channel(roomChannelName, {
          config: { presence: { key: trackedUserId } },
        });

      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ userId?: string; username?: string; avatarUrl?: string; cameraPreviewUrl?: string; camera_preview_url?: string; role?: string; isLive?: boolean; isSpeaking?: boolean; isMuted?: boolean }>();
        setParticipants(buildStageParticipantsFromPresence({
          state,
          trackedUserId,
          profileUsername: profile?.username,
          profileAvatarUrl,
          profileCameraPreviewUrl,
        }));
      });

      channel.on("broadcast", { event: "participant:speaking" }, ({ payload }: { payload: Record<string, unknown> }) => {
        const participantId = String(payload?.participantId ?? "").trim();
        if (!participantId) return;
        const speaking = !!payload?.isSpeaking;
        setIsSpeakingById((prev) => ({
          ...prev,
          [participantId]: speaking,
        }));
      });

      channel.on("broadcast", { event: "participant:seat-request" }, ({ payload }: { payload: Record<string, unknown> }) => {
        const participantId = String(payload?.participantId ?? "").trim();
        if (!participantId) return;
        const pending = !!payload?.pending;
        setSeatRequestSheetClosedById((prev) => {
          if (!prev[participantId]) return prev;
          const next = { ...prev };
          delete next[participantId];
          return next;
        });
        setSeatRequestsById((prev) => {
          if (!pending) {
            if (!prev[participantId]) return prev;
            const next = { ...prev };
            delete next[participantId];
            return next;
          }
          return { ...prev, [participantId]: true };
        });
      });

      channel.on("broadcast", { event: "participant:seat-state" }, ({ payload }: { payload: Record<string, unknown> }) => {
        const participantId = String(payload?.participantId ?? "").trim();
        if (!participantId) return;
        const roleValue = String(payload?.role ?? "").trim();
        const nextRole: SharedParticipantLocalState["role"] = roleValue === "host" || roleValue === "speaker" ? roleValue : "listener";
        const nextIsMuted = !!payload?.isMuted;
        const nextIsRemoved = !!payload?.isRemoved;
        const pending = !!payload?.pending;

        setParticipantStateById((prev) => ({
          ...prev,
          [participantId]: {
            ...(prev[participantId] ?? {
              isMuted: nextIsMuted,
              role: nextRole,
              isRemoved: nextIsRemoved,
            }),
            isMuted: nextIsMuted,
            role: nextRole,
            isRemoved: nextIsRemoved,
          },
        }));
        setSeatRequestsById((prev) => {
          if (pending && nextRole === "listener" && !nextIsRemoved) {
            return { ...prev, [participantId]: true };
          }
          if (!prev[participantId]) return prev;
          const next = { ...prev };
          delete next[participantId];
          return next;
        });
      });

        channel.subscribe((status) => {
          debugLiveStage("channel status", { status });
          if (status !== "SUBSCRIBED") return;

          (async () => {
            try {
              await channel.track({
                userId: trackedUserId,
                username,
                avatarUrl: profileAvatarUrl || undefined,
                cameraPreviewUrl: profileCameraPreviewUrl || undefined,
                role: membershipMapRef.current[trackedUserId]?.role ?? (snapshot.room.hostUserId === trackedUserId ? "host" : "viewer"),
                isLive: true,
                isMuted: membershipMapRef.current[trackedUserId]?.isMuted ?? false,
              });
            } catch (error) {
              reportRuntimeError("live-stage-track", error, {
                partyId,
              });
            } finally {
              if (!cancelled) {
                debugLiveStage("set loading false", { reason: "subscribed" });
                setLoading(false);
              }
            }
          })().catch(() => {});
        });

        channelRef.current = channel;

        const roomRealtimeChannel = supabase
          .channel(`live-stage-room-${partyId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "watch_party_room_memberships",
              filter: `party_id=eq.${partyId}`,
            },
            () => {
              void refreshStageSnapshot(trackedUserId);
            },
          )
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "watch_party_rooms",
              filter: `party_id=eq.${partyId}`,
            },
            () => {
              void refreshStageSnapshot(trackedUserId);
            },
          )
          .subscribe();

        roomRealtimeChannelRef.current = roomRealtimeChannel;
        heartbeatRef.current = setInterval(() => {
          const heartbeatMembership = membershipMapRef.current[trackedUserId];
          const heartbeatIsHost = snapshot.room.hostUserId === trackedUserId;
          const heartbeatCanPublishMedia = heartbeatIsHost || canStageMembershipPublishMedia(heartbeatMembership);
          void touchPartyRoomSession({
            partyId,
            userId: trackedUserId,
            role: heartbeatIsHost ? "host" : heartbeatMembership?.role ?? "viewer",
            stageRole: heartbeatMembership?.stageRole ?? (heartbeatIsHost ? "host" : undefined),
            canSpeak: heartbeatMembership?.canSpeak ?? (heartbeatIsHost ? true : undefined),
            cameraEnabled: heartbeatCanPublishMedia && !!profileCameraPreviewUrl,
            micEnabled: heartbeatCanPublishMedia,
            displayName: username,
            avatarUrl: profileAvatarUrl,
            cameraPreviewUrl: profileCameraPreviewUrl,
          }).then(() => refreshStageSnapshot(trackedUserId));
        }, STAGE_HEARTBEAT_INTERVAL_MILLIS);

        loadGuardTimeout = setTimeout(() => {
          if (cancelled) return;
          debugLiveStage("set loading false", { reason: "load-guard-timeout" });
          setLoading(false);
        }, 3000);
      } catch (error) {
        reportRuntimeError("live-stage-init", error, {
          partyId,
        });
        if (!cancelled) setLoading(false);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (loadGuardTimeout) clearTimeout(loadGuardTimeout);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      if (roomRealtimeChannelRef.current) {
        supabase.removeChannel(roomRealtimeChannelRef.current);
        roomRealtimeChannelRef.current = null;
      }
    };
  }, [accessRetryToken, buildStageParticipantsFromPresence, canUseBetaStage, partyId, partyIdParam, refreshStageSnapshot, syncStageSnapshot]);

  useEffect(() => {
    if (!canUseBetaStage || !isFocused || !partyId || !room?.hostUserId || liveSurface === "room" || communicationRoomId) return;

    let cancelled = false;
    let retryTimeout: ReturnType<typeof setTimeout> | null = null;

    const scheduleRetry = () => {
      if (retryTimeout || isHost) return;
      retryTimeout = setTimeout(() => {
        retryTimeout = null;
        void ensureCommunicationRoom();
      }, 1_200);
    };

    const ensureCommunicationRoom = async () => {
      const linkedRoom = await (isHost
        ? getOrCreateLinkedCommunicationRoom({
            partyId,
            roomCode: room.roomCode,
            roomMode: initialStageMode,
            hostUserId: room.hostUserId,
          })
        : getLinkedCommunicationRoom(partyId)
      ).catch(() => null);

      if (cancelled) return;
      if (!linkedRoom || "error" in linkedRoom) {
        scheduleRetry();
        return;
      }
      setCommunicationRoomId(linkedRoom.roomId);
    };

    void ensureCommunicationRoom();

    return () => {
      cancelled = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [canUseBetaStage, communicationRoomId, initialStageMode, isFocused, isHost, liveSurface, partyId, room?.hostUserId, room?.roomCode]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSessionSeconds((value) => value + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const currentUserId = String(myUserId || "").trim();
      if (!partyId || !currentUserId) return;
      const currentMembership = membershipMapRef.current[currentUserId];
      const currentIsHost = isHost;
      const currentCanPublishMedia = currentIsHost || canStageMembershipPublishMedia(currentMembership);

      if (nextState === "active") {
        void touchPartyRoomSession({
          partyId,
          userId: currentUserId,
          role: currentIsHost ? "host" : currentMembership?.role ?? "viewer",
          stageRole: currentMembership?.stageRole ?? (currentIsHost ? "host" : undefined),
          canSpeak: currentMembership?.canSpeak ?? (currentIsHost ? true : undefined),
          cameraEnabled: currentCanPublishMedia && !!myCameraPreviewUrlRef.current,
          micEnabled: currentCanPublishMedia,
          displayName: myUsername || "You",
          cameraPreviewUrl: myCameraPreviewUrlRef.current,
          membershipState: "active",
        }).then(() => refreshStageSnapshot(currentUserId));
        return;
      }

      void touchPartyRoomSession({
        partyId,
        userId: currentUserId,
        role: currentIsHost ? "host" : currentMembership?.role ?? "viewer",
        stageRole: currentMembership?.stageRole ?? (currentIsHost ? "host" : undefined),
        canSpeak: currentMembership?.canSpeak ?? (currentIsHost ? true : undefined),
        cameraEnabled: currentCanPublishMedia && !!myCameraPreviewUrlRef.current,
        micEnabled: currentCanPublishMedia,
        displayName: myUsername || "You",
        cameraPreviewUrl: myCameraPreviewUrlRef.current,
        membershipState: "reconnecting",
      }).catch(() => null);
    });

    return () => {
      subscription.remove();
    };
  }, [isHost, myUserId, myUsername, partyId, refreshStageSnapshot]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(motion, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(motion, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [motion]);

  const trackedUserId = myUserId || "anon";
  const resolvedCurrentUsername = resolveIdentityName(myUsername, "You");
  const isLiveRoomSurface = liveSurface === "room";
  const liveKitFoundationEnabled = isLiveKitRuntimeConfigured();
  const canOwnActiveStageSurface = isFocused && !isLiveRoomSurface;
  const shouldRenderLiveKitStage = canOwnActiveStageSurface && Platform.OS !== "web" && !!liveKitJoinContract;
  const shouldRenderLegacyStageRtc =
    canUseBetaStage
    && canOwnActiveStageSurface
    && !!communicationRoomId
    && !shouldRenderLiveKitStage
    && stageMode !== "hybrid";
  // Avoid loading the legacy RTC renderer only while the native LiveKit stage actually owns the camera path.
  const shouldAllowLegacyStageRtcModule = Platform.OS === "web" || !shouldRenderLiveKitStage;
  const RTCView = useMemo<CommunicationRTCViewComponent | undefined>(() => {
    if (!shouldRenderLegacyStageRtc || !shouldAllowLegacyStageRtcModule) return undefined;
    return getCommunicationRTCModule()?.RTCView as CommunicationRTCViewComponent | undefined;
  }, [shouldAllowLegacyStageRtcModule, shouldRenderLegacyStageRtc]);
  const {
    localStreamURL,
    participants: stageMediaParticipants,
  } = useCommunicationRoomSession({
    roomId: communicationRoomId,
    enabled: shouldRenderLegacyStageRtc && shouldAllowLegacyStageRtcModule,
    analyticsContext: {
      surface: "live-room",
      role: isHost ? "host" : "viewer",
    },
  });

  const selfFallbackParticipant = useMemo<StageParticipant>(() => {
    const selfFallbackIdentity = buildSharedParticipantIdentity({
      userId: trackedUserId,
      role: isHost ? "host" : "viewer",
      displayNameCandidates: [resolvedCurrentUsername, "Guest"],
      avatarUrl: "",
      cameraPreviewUrl: myCameraPreviewUrlRef.current || "",
      currentUserId: trackedUserId,
      isLive: true,
      isSpeaking: !!isSpeakingById[trackedUserId],
      isMuted: false,
    });

    return {
      ...selfFallbackIdentity,
      username: selfFallbackIdentity.displayName,
    };
  }, [trackedUserId, isHost, resolvedCurrentUsername, isSpeakingById]);

  const displayParticipants = useMemo(
    () => buildOrderedParticipantsWithSelf({
      participants,
      currentUserId: trackedUserId,
      selfFallbackParticipant,
    }),
    [participants, trackedUserId, selfFallbackParticipant],
  );

  const stripParticipants = useMemo(
    () => prioritizeParticipantStripOrder(displayParticipants, featuredParticipantById, isSpeakingById),
    [displayParticipants, featuredParticipantById, isSpeakingById],
  );
  const hostParticipant = useMemo(
    () => displayParticipants.find((participant) => participant.role === "host") ?? null,
    [displayParticipants],
  );
  const visibleStripParticipants = useMemo(
    () => stripParticipants.filter((participant) => !hiddenParticipantIds[participant.userId]),
    [hiddenParticipantIds, stripParticipants],
  );
  const currentUserParticipantId = trackedUserId;
  const inviteableLiveRoomParticipants = useMemo(
    () => displayParticipants
      .filter((participant) => participant.userId && participant.userId !== currentUserParticipantId)
      .map((participant) => ({
        userId: participant.userId,
        displayName: participant.displayName,
        username: participant.username,
        avatarUrl: participant.avatarUrl,
      })),
    [currentUserParticipantId, displayParticipants],
  );
  const selectedParticipant = useMemo(
    () => visibleStripParticipants.find((participant) => participant.userId === selectedParticipantId) ?? null,
    [visibleStripParticipants, selectedParticipantId],
  );
  const { selectedParticipantUserId, selectedParticipantState, canShowProfileAction } = resolveSelectedParticipantContext({
    selectedParticipant,
    participantStateById,
    currentUserId: currentUserParticipantId,
  });
  const selectedParticipantFollowAction = useChannelFollowAction({
    channelUserId: selectedParticipantUserId,
    enabled: !!selectedParticipantUserId && canShowProfileAction,
  });
  const tailoredFocusParticipant = useMemo(
    () => visibleStripParticipants.find((participant) => participant.userId === activeParticipantId)
      ?? hostParticipant
      ?? visibleStripParticipants[0]
      ?? null,
    [activeParticipantId, hostParticipant, visibleStripParticipants],
  );
  const hiddenParticipantCount = useMemo(
    () => Object.values(hiddenParticipantIds).filter(Boolean).length,
    [hiddenParticipantIds],
  );
  const closeParticipantModal = useCallback(() => {
    setSelectedParticipantId("");
  }, []);
  const collapseHostParticipantControls = useCallback((participantId?: string) => {
    const nextParticipantId = String(participantId ?? "").trim();
    setSelectedParticipantId("");
    if (!nextParticipantId) {
      setActiveParticipantId("");
      return;
    }
    setActiveParticipantId((currentParticipantId) => (currentParticipantId === nextParticipantId ? "" : currentParticipantId));
    setParticipantPresentationById((prev) => {
      if (prev[nextParticipantId] !== "expanded") return prev;
      return {
        ...prev,
        [nextParticipantId]: "compact",
      };
    });
  }, []);
  const collapseHostParticipantControlsAfterFailure = useCallback((participantId?: string) => {
    collapseHostParticipantControls(participantId);
  }, [collapseHostParticipantControls]);
  const openSeatRequestSheet = useCallback((participantId: string) => {
    const nextParticipantId = String(participantId ?? "").trim();
    if (!nextParticipantId) return;
    setSeatRequestSheetClosedById((prev) => {
      if (!prev[nextParticipantId]) return prev;
      const next = { ...prev };
      delete next[nextParticipantId];
      return next;
    });
    setSeatRequestSheetParticipantId(nextParticipantId);
  }, []);
  const closeSeatRequestSheet = useCallback((participantId: string) => {
    const nextParticipantId = String(participantId ?? "").trim();
    if (!nextParticipantId) return;
    setSeatRequestSheetClosedById((prev) => ({ ...prev, [nextParticipantId]: true }));
    setSeatRequestSheetParticipantId((current) => (current === nextParticipantId ? "" : current));
  }, []);
  const runStageParticipantAction = useCallback(async (participantId: string, action: () => Promise<void>) => {
    const cleanParticipantId = String(participantId ?? "").trim();
    if (!cleanParticipantId || stageParticipantActionBusyId) return;
    setStageParticipantActionBusyId(cleanParticipantId);
    try {
      await action();
    } finally {
      setStageParticipantActionBusyId((current) => (current === cleanParticipantId ? "" : current));
    }
  }, [stageParticipantActionBusyId]);
  const featureParticipantFirst = useCallback((participantId: string) => {
    const nextParticipantId = String(participantId ?? "").trim();
    if (!nextParticipantId) return;
    setFeaturedParticipantById({ [nextParticipantId]: true });
    setActiveParticipantId(nextParticipantId);
    setActiveSpeakerUserId(nextParticipantId);
  }, []);
  const hideParticipantLocally = useCallback((participantId: string) => {
    const nextParticipantId = String(participantId ?? "").trim();
    if (!nextParticipantId) return;
    const participant = stripParticipants.find((entry) => entry.userId === nextParticipantId);
    if (!participant || participant.userId === currentUserParticipantId || participant.role === "host") return;
    setHiddenParticipantIds((prev) => ({ ...prev, [nextParticipantId]: true }));
    setFeaturedParticipantById((prev) => {
      if (!prev[nextParticipantId]) return prev;
      const next = { ...prev };
      delete next[nextParticipantId];
      return next;
    });
    setParticipantPresentationById((prev) => {
      if (!prev[nextParticipantId]) return prev;
      const next = { ...prev };
      delete next[nextParticipantId];
      return next;
    });
    if (activeParticipantId === nextParticipantId) {
      setActiveParticipantId(hostParticipant?.userId ?? "");
    }
    if (activeSpeakerUserId === nextParticipantId) {
      setActiveSpeakerUserId(hostParticipant?.userId ?? "");
    }
    setSelectedParticipantId((current) => (current === nextParticipantId ? "" : current));
  }, [activeParticipantId, activeSpeakerUserId, currentUserParticipantId, hostParticipant?.userId, stripParticipants]);
  const showEveryoneLocally = useCallback(() => {
    setHiddenParticipantIds({});
  }, []);
  const resetTailoredStageView = useCallback(() => {
    setHiddenParticipantIds({});
    setFeaturedParticipantById({});
    setParticipantPresentationById({});
    setActiveParticipantId(hostParticipant?.userId ?? "");
    setActiveSpeakerUserId(hostParticipant?.userId ?? "");
    setSelectedParticipantId("");
  }, [hostParticipant?.userId]);

  useEffect(() => {
    const nextOrder = visibleStripParticipants.map((participant) => participant.userId).join("|");
    if (!nextOrder) return;
    if (stripOrderRef.current && stripOrderRef.current !== nextOrder) {
      LayoutAnimation.configureNext({
        duration: 220,
        update: { type: LayoutAnimation.Types.easeOut },
      });
    }
    stripOrderRef.current = nextOrder;
  }, [visibleStripParticipants]);

  useEffect(() => {
    if (visibleStripParticipants.length === 0) {
      setActiveSpeakerUserId("");
      return;
    }
    if (!activeSpeakerUserId || !visibleStripParticipants.some((p) => p.userId === activeSpeakerUserId)) {
      setActiveSpeakerUserId(hostParticipant?.userId ?? visibleStripParticipants[0]?.userId ?? "");
    }
  }, [activeSpeakerUserId, hostParticipant, visibleStripParticipants]);

  useEffect(() => {
    if (visibleStripParticipants.length === 0) {
      setActiveParticipantId("");
      return;
    }
    if (!activeParticipantId || !visibleStripParticipants.some((p) => p.userId === activeParticipantId)) {
      setActiveParticipantId(hostParticipant?.userId ?? visibleStripParticipants[0]?.userId ?? "");
    }
  }, [activeParticipantId, hostParticipant, visibleStripParticipants]);

  useEffect(() => {
    if (displayParticipants.length === 0) return;
    setParticipantStateById((prev) => {
      return mergeMissingParticipantStates(
        prev,
        displayParticipants,
        (participant) => participant.userId,
        (participant) =>
          createDefaultParticipantState({
            role: participant.role,
            isSpeaking: participant.isSpeaking,
            isMuted: participant.isMuted,
          }),
      );
    });
  }, [displayParticipants]);

  const emitFloatingReaction = useCallback((emoji: string) => {
    const id = `reaction-${Date.now()}-${reactionCounterRef.current++}`;
    const originX = Math.floor(Math.random() * 26) - 13;
    const drift = Math.floor(Math.random() * 44) - 22;
    const rise = new Animated.Value(0);
    const opacity = new Animated.Value(1);
    const scale = new Animated.Value(0.85);

    const entry: FloatingReaction = { id, emoji, originX, drift, rise, opacity, scale };
    setFloatingReactions((prev) => [...prev, entry]);

    Animated.parallel([
      Animated.timing(rise, { toValue: -190, duration: 1700, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 1700, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.2, duration: 320, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.0, duration: 1380, useNativeDriver: true }),
      ]),
    ]).start(() => {
      setFloatingReactions((prev) => prev.filter((reaction) => reaction.id !== id));
    });
  }, []);

  const triggerReactionBurst = useCallback((emoji: string) => {
    Animated.sequence([
      Animated.timing(reactionTapPulse, { toValue: 1, duration: 110, useNativeDriver: true }),
      Animated.timing(reactionTapPulse, { toValue: 0, duration: 210, useNativeDriver: true }),
    ]).start();

    const burstCount = 3 + Math.floor(Math.random() * 3);
    for (let index = 0; index < burstCount; index += 1) {
      const burstEmoji = Math.random() < 0.6 ? emoji : SIM_REACTIONS[Math.floor(Math.random() * SIM_REACTIONS.length)];
      setTimeout(() => emitFloatingReaction(burstEmoji), index * 120);
    }
  }, [emitFloatingReaction, reactionTapPulse]);

  const onSelectReactionFromPicker = useCallback((emoji: string) => {
    if (room?.reactionsPolicy === "muted") return;
    triggerReactionBurst(emoji);
    setRecentReactionEmojis((prev) => pushRecentReaction(prev, emoji));
  }, [room?.reactionsPolicy, triggerReactionBurst]);

  const clearStageOverlayFinalizeHideTimeout = useCallback(() => {
    if (stageOverlayFinalizeHideTimeoutRef.current) {
      clearTimeout(stageOverlayFinalizeHideTimeoutRef.current);
      stageOverlayFinalizeHideTimeoutRef.current = null;
    }
  }, []);

  const clearStageOverlayAutoHideTimeout = useCallback(() => {
    if (stageOverlayAutoHideTimeoutRef.current) {
      clearTimeout(stageOverlayAutoHideTimeoutRef.current);
      stageOverlayAutoHideTimeoutRef.current = null;
    }
  }, []);

  const closeStageOverlayPanels = useCallback(() => {
    setCommentsOpen(false);
    setReactionPickerOpen(false);
    setStageControlsOpen(false);
    setFaceFilterSheetOpen(false);
    setHybridCommentFocused(false);
    hybridCommentInputRef.current?.blur();
  }, []);

  const hideStageOverlay = useCallback((options?: { closePanels?: boolean }) => {
    clearStageOverlayAutoHideTimeout();
    clearStageOverlayFinalizeHideTimeout();
    if (options?.closePanels !== false) {
      closeStageOverlayPanels();
    }
    Animated.timing(stageOverlayMotion, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
    stageOverlayFinalizeHideTimeoutRef.current = setTimeout(() => {
      setStageOverlayVisible(false);
      stageOverlayFinalizeHideTimeoutRef.current = null;
    }, 220);
  }, [clearStageOverlayAutoHideTimeout, clearStageOverlayFinalizeHideTimeout, closeStageOverlayPanels, stageOverlayMotion]);

  const revealStageOverlay = useCallback((options?: { armAutoHide?: boolean }) => {
    clearStageOverlayAutoHideTimeout();
    clearStageOverlayFinalizeHideTimeout();
    stageOverlayLastInteractionAtRef.current = Date.now();
    if (options?.armAutoHide !== false) {
      setStageOverlayAutoHideArmed(true);
    }
    setStageOverlayVisible(true);
    stageOverlayMotion.stopAnimation();
    Animated.timing(stageOverlayMotion, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [clearStageOverlayAutoHideTimeout, clearStageOverlayFinalizeHideTimeout, stageOverlayMotion]);

  const onToggleControlsLock = useCallback(() => {
    const nextLocked = !controlsLocked;
    setControlsLocked(nextLocked);

    if (nextLocked) {
      revealStageOverlay({ armAutoHide: false });
      setStageOverlayAutoHideArmed(false);
      return;
    }

    revealStageOverlay();
  }, [controlsLocked, revealStageOverlay]);

  const armAndRevealStageOverlay = useCallback(() => {
    revealStageOverlay();
  }, [revealStageOverlay]);

  const emitParticipantUpdate = useCallback(async (participantId: string, changes: Partial<SharedParticipantLocalState>) => {
    if (!partyId || !participantId || !isHost) return false;
    const currentMembership = membershipMapRef.current[participantId];
    const nextStageRole = changes.role
      ? (changes.role === "host" ? "host" : changes.role)
      : currentMembership?.stageRole;
    const shouldRemove = typeof changes.isRemoved === "boolean" ? changes.isRemoved : currentMembership?.membershipState === "removed";
    const nextIsMuted = typeof changes.isMuted === "boolean" ? changes.isMuted : currentMembership?.isMuted ?? false;
    const nextCanPublishMedia = !shouldRemove && !nextIsMuted && (nextStageRole === "host" || nextStageRole === "speaker");
    const nextMembershipState: "removed" | "active" = shouldRemove ? "removed" : "active";

    const participantStatePersistRequest = {
      isMuted: nextIsMuted,
      stageRole: nextStageRole,
      canSpeak: nextStageRole === "host" || nextStageRole === "speaker",
      cameraEnabled: nextCanPublishMedia,
      micEnabled: nextCanPublishMedia,
      membershipState: nextMembershipState,
      leftAt: shouldRemove ? new Date().toISOString() : null,
    };
    let updatedMembership = await setPartyParticipantState(partyId, participantId, participantStatePersistRequest).catch(() => null);
    if (!updatedMembership) {
      const serverPersisted = await enforceLiveKitParticipantState({
        surface: "live-stage",
        roomName: partyId,
        targetParticipantIdentity: participantId,
        metadata: {
          source: "live-stage-seat-control",
          persistMembershipState: true,
          stageRole: nextStageRole ?? "listener",
          canSpeak: nextStageRole === "host" || nextStageRole === "speaker",
          isMuted: nextIsMuted,
          isRemoved: shouldRemove,
        },
      }).catch(() => false);
      if (serverPersisted) {
        const refreshedSnapshot = await refreshStageSnapshot(myUserId).catch(() => null);
        updatedMembership = refreshedSnapshot?.memberships.find((membership) => membership.userId === participantId) ?? null;
      }
    }
    if (!updatedMembership) {
      debugLog("livekit", "blocked live-stage seat broadcast before membership authority persisted", {
        roomName: partyId,
        participantId,
        nextStageRole: nextStageRole ?? null,
        removed: !!shouldRemove,
      });
      return false;
    }
    await enforceLiveKitParticipantState({
      surface: "live-stage",
      roomName: partyId,
      targetParticipantIdentity: participantId,
      metadata: {
        source: "live-stage-seat-control",
        stageRole: nextStageRole ?? null,
        muted: typeof changes.isMuted === "boolean" ? changes.isMuted : currentMembership?.isMuted ?? null,
        removed: !!shouldRemove,
      },
    }).catch(() => false);
    await refreshStageSnapshot(myUserId).catch(() => null);
    return true;
  }, [isHost, myUserId, partyId, refreshStageSnapshot]);

  const emitParticipantSpeaking = useCallback((participantId: string, isSpeaking: boolean) => {
    const channel = channelRef.current;
    if (!channel || !participantId) return;
    channel
      .send({ type: "broadcast", event: "participant:speaking", payload: { participantId, isSpeaking } })
      .catch(() => {});
  }, []);

  const broadcastSeatRequest = useCallback((participantId: string, pending: boolean) => {
    const channel = channelRef.current;
    if (!channel || !participantId) return;
    channel
      .send({ type: "broadcast", event: "participant:seat-request", payload: { participantId, pending } })
      .catch(() => {});
  }, []);

  const broadcastSeatState = useCallback((participantId: string, payload: {
    role: SharedParticipantLocalState["role"];
    isMuted: boolean;
    isRemoved?: boolean;
    pending?: boolean;
  }) => {
    const channel = channelRef.current;
    if (!channel || !participantId) return;
    channel
      .send({
        type: "broadcast",
        event: "participant:seat-state",
        payload: {
          participantId,
          role: payload.role,
          isMuted: payload.isMuted,
          isRemoved: !!payload.isRemoved,
          pending: !!payload.pending,
        },
      })
      .catch(() => {});
  }, []);

  const requestStageSeat = useCallback(async (participantId: string) => {
    const nextParticipantId = String(participantId ?? "").trim();
    const selfParticipantId = String(myUserId || "").trim() || "anon";
    if (!nextParticipantId || isHost || nextParticipantId !== selfParticipantId) return;
    const currentState = participantStateById[nextParticipantId] ?? createDefaultParticipantState({
      role: "viewer",
      isSpeaking: false,
      isMuted: false,
    });
    if (!canRequestSeat(currentState) || seatRequestsById[nextParticipantId]) return;
    const currentMembership = membershipMapRef.current[nextParticipantId];
    if (!currentMembership) {
      const refreshedSnapshot = await refreshStageSnapshot(nextParticipantId).catch(() => null);
      const refreshedMembership = refreshedSnapshot?.memberships.find((membership) => membership.userId === nextParticipantId)
        ?? membershipMapRef.current[nextParticipantId]
        ?? null;
      if (!refreshedMembership) {
        debugLog("live-stage", "blocked seat request without persisted membership", {
          partyId,
          participantId: nextParticipantId,
        });
        setRoomEntryError("Your live-room seat is still syncing. Rejoin the room before requesting camera.");
        return;
      }
    }

    revealStageOverlay();
    setSeatRequestsById((prev) => ({ ...prev, [nextParticipantId]: true }));
    broadcastSeatRequest(nextParticipantId, true);
  }, [
    broadcastSeatRequest,
    isHost,
    myUserId,
    participantStateById,
    partyId,
    revealStageOverlay,
    refreshStageSnapshot,
    seatRequestsById,
  ]);

  useEffect(() => {
    if (!canOwnActiveStageSurface || shouldRenderLiveKitStage) return;
    debugLiveStage("mic setup start");
    const currentUserId = String(myUserId || "").trim();

    let cancelled = false;

    const startMicMetering = async () => {
      try {
        const permission = await Audio.requestPermissionsAsync();
        debugLiveStage("mic permission", { granted: permission.granted, status: permission.status, canAskAgain: permission.canAskAgain });
        if (!permission.granted || cancelled) return;

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        });

        debugLiveStage("mic recording created");
        const recording = new Audio.Recording();
        await recording.prepareToRecordAsync({
          isMeteringEnabled: true,
          android: {
            extension: ".m4a",
            outputFormat: Audio.AndroidOutputFormat.MPEG_4,
            audioEncoder: Audio.AndroidAudioEncoder.AAC,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 64000,
          },
          ios: {
            extension: ".caf",
            outputFormat: Audio.IOSOutputFormat.APPLELOSSLESS,
            audioQuality: Audio.IOSAudioQuality.MEDIUM,
            sampleRate: 44100,
            numberOfChannels: 1,
            bitRate: 64000,
            linearPCMBitDepth: 16,
            linearPCMIsBigEndian: false,
            linearPCMIsFloat: false,
          },
          web: {
            mimeType: "audio/webm",
            bitsPerSecond: 64000,
          },
        });
        debugLiveStage("mic prepare complete");
        debugLiveStage("mic start async");
        await recording.startAsync();
        debugLiveStage("mic recording started");
        recording.setProgressUpdateInterval(220);
        recording.setOnRecordingStatusUpdate((status) => {
          debugLiveStage("mic meter", { isRecording: status.isRecording, metering: status.metering });
          if (!status.isRecording || cancelled) return;
          const metering = typeof status.metering === "number" ? status.metering : -160;
          if (!currentUserId) return;
          const speaking = metering > MIC_SPEAKING_THRESHOLD_DB;
          if (speaking) {
            if (micReleaseTimeoutRef.current) {
              clearTimeout(micReleaseTimeoutRef.current);
              micReleaseTimeoutRef.current = null;
            }
            if (micSpeakingRef.current) return;
            debugLiveStage("speaking change", {
              from: micSpeakingRef.current,
              to: true,
              metering,
              threshold: MIC_SPEAKING_THRESHOLD_DB,
            });
            micSpeakingRef.current = true;
            setIsSpeakingById((prev) => ({ ...prev, [currentUserId]: true }));
            emitParticipantSpeaking(currentUserId, true);
            return;
          }
          if (!micSpeakingRef.current || micReleaseTimeoutRef.current) return;
          micReleaseTimeoutRef.current = setTimeout(() => {
            micReleaseTimeoutRef.current = null;
            if (!micSpeakingRef.current || cancelled) return;
            debugLiveStage("speaking change", {
              from: true,
              to: false,
              metering,
              threshold: MIC_SPEAKING_THRESHOLD_DB,
            });
            micSpeakingRef.current = false;
            setIsSpeakingById((prev) => ({ ...prev, [currentUserId]: false }));
            emitParticipantSpeaking(currentUserId, false);
          }, MIC_SPEAKING_RELEASE_MS);
        });
        if (cancelled) {
          await recording.stopAndUnloadAsync().catch(() => {});
          return;
        }
        micRecordingRef.current = recording;
      } catch {
      }
    };

    startMicMetering();

    return () => {
      cancelled = true;
      if (micReleaseTimeoutRef.current) {
        clearTimeout(micReleaseTimeoutRef.current);
        micReleaseTimeoutRef.current = null;
      }
      const recording = micRecordingRef.current;
      micRecordingRef.current = null;
      if (micSpeakingRef.current && currentUserId) {
        micSpeakingRef.current = false;
        setIsSpeakingById((prev) => ({ ...prev, [currentUserId]: false }));
        emitParticipantSpeaking(currentUserId, false);
      }
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, [canOwnActiveStageSurface, shouldRenderLiveKitStage, myUserId, emitParticipantSpeaking]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!myUserId) return;
    if (cameraPermission?.granted) return;
    if (cameraPermission && !cameraPermission.canAskAgain) return;
    requestCameraPermission().catch(() => {});
  }, [myUserId, cameraPermission, requestCameraPermission]);

  const stageMediaParticipantsByUserId = useMemo(
    () => Object.fromEntries(stageMediaParticipants.map((participant) => [participant.userId, participant])),
    [stageMediaParticipants],
  );
  const viewerCount = Math.max(1, displayParticipants.length);
  const timeLabel = `${Math.floor(sessionSeconds / 60).toString().padStart(2, "0")}:${(sessionSeconds % 60).toString().padStart(2, "0")}`;
  const motionOpacity = motion.interpolate({ inputRange: [0, 1], outputRange: [0.22, 0.46] });
  const motionTranslate = motion.interpolate({ inputRange: [0, 1], outputRange: [-16, 16] });
  const liveDotScale = motion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] });
  const liveDotOpacity = motion.interpolate({ inputRange: [0, 1], outputRange: [0.58, 1] });
  const viewersScale = motion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const viewersOpacity = motion.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });
  const liveGlowOpacity = motion.interpolate({ inputRange: [0, 1], outputRange: [0.24, 0.48] });
  const stageOverlayOpacity = stageOverlayMotion.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const stageOverlayTranslate = stageOverlayMotion.interpolate({ inputRange: [0, 1], outputRange: [26, 0] });
  const liveDockBottomInset = Math.max(28, safeAreaInsets.bottom + 14);
  const liveRoomFooterInset = Math.max(16, safeAreaInsets.bottom + 8);
  const hybridDeckTop = safeAreaInsets.top + 140;
  const isLiveFirstMode = stageMode === "live";
  const isHybridMode = stageMode === "hybrid";
  const usesSharedStageCommentLane = isLiveFirstMode || isHybridMode;
  const shouldShowStageCommunityDeck = isHybridMode;
  const stageReactionsEnabled = room?.reactionsPolicy !== "muted";
  const commentsLaneBottomOffset = liveDockBottomInset + (usesSharedStageCommentLane ? 292 : 172);
  const stageDockKeyboardLift = hybridCommentFocused
    ? Math.max(0, stageKeyboardHeight - safeAreaInsets.bottom)
    : 0;
  const liveStageCommunityCardWidth = Math.min(Math.max(windowWidth - 24, 318), 440);
  const liveStageRemoteGridVisibleHeight =
    (LIVE_STAGE_REMOTE_GRID_TILE_MIN_HEIGHT * LIVE_STAGE_REMOTE_GRID_VISIBLE_ROWS)
    + (LIVE_STAGE_REMOTE_GRID_GAP * (LIVE_STAGE_REMOTE_GRID_VISIBLE_ROWS - 1));
  const hybridCommunityMaxHeight = Math.max(
    liveStageRemoteGridVisibleHeight,
    Math.min(liveStageRemoteGridVisibleHeight + 34, windowHeight - hybridDeckTop - (safeAreaInsets.bottom + 340)),
  );
  const lowerCommunityParticipants = useMemo(() => {
    return visibleStripParticipants.filter((participant) => {
      if (!participant.userId || participant.userId === currentUserParticipantId) return false;
      if (participantStateById[participant.userId]?.isRemoved) return false;
      return true;
    });
  }, [currentUserParticipantId, participantStateById, visibleStripParticipants]);
  const lowerCommunityCountLabel = isLiveFirstMode
    ? (lowerCommunityParticipants.length > 0 ? `${lowerCommunityParticipants.length} in audience` : "Audience waiting")
    : `${viewerCount} in room`;
  const currentStageParticipantState = participantStateById[currentUserParticipantId] ?? createDefaultParticipantState({
    role: isHost ? "host" : "viewer",
    isSpeaking: false,
    isMuted: !!(membershipMapRef.current[currentUserParticipantId]?.isMuted),
  });
  const currentStageSeatRequestPending = !!seatRequestsById[currentUserParticipantId]
    && currentStageParticipantState.role === "listener"
    && !currentStageParticipantState.isRemoved;
  const stageSeatRequestHint = isHost
    ? "Remote live feeds appear here. Tap a feed to focus it; host controls appear on the active member."
    : currentStageParticipantState.role === "speaker"
      ? "Your camera seat is active. Your own preview stays out of this remote-feed grid."
      : currentStageSeatRequestPending
        ? "Camera request pending. The host can seat you when they review requests."
        : canRequestSeat(currentStageParticipantState)
          ? "Watching is allowed here when the room is free or your account has the required access. Request camera when you want to join the visible feeds."
          : "Watching is allowed here when the room is free or your account has the required access. Camera requests are unavailable for your current role.";
  const stageSeatRequestButtonLabel = currentStageParticipantState.role === "speaker"
    ? "Camera active"
    : currentStageSeatRequestPending
      ? "Request pending"
      : "Request camera";
  const stageSeatRequestButtonDisabled = currentStageParticipantState.role === "speaker"
    || currentStageSeatRequestPending
    || !canRequestSeat(currentStageParticipantState);
  const liveRoomRoleLabel = isHost ? "Host" : "Viewer";
  const liveRoomModeLabel = isLiveFirstMode ? "Live-First" : branding.watchPartyLabel;
  const liveRoomJoinLabel = room?.joinPolicy === "locked"
    ? "Host approval"
    : "Signed-in access";
  const liveRoomReactionsLabel = room?.reactionsPolicy === "muted"
    ? "Host-muted"
    : "Enabled";
  const liveRoomCaptureLabel = room?.capturePolicy === "host_managed"
    ? "Host-managed capture"
    : "Best-effort capture";
  const liveRoomShareCode = String(room?.roomCode ?? partyId ?? "").trim().toUpperCase();
  const liveRoomShellTitle = isHost
    ? "Set the live room before the stage opens."
    : "This live room stays pre-stage.";
  const liveRoomShellBody = isHost
    ? "Invite people, set the room, and then continue into Live Stage."
    : "Check the room setup, choose who to follow first, and then join Live Stage.";
  const liveRoomPermissionCopy = isHost
    ? "Access, reactions, capture, and focus stay here before stage."
    : "The host manages access, reactions, capture, and the handoff here.";
  const liveRoomFocusTarget = isHost
    ? (lowerCommunityParticipants[0] ?? hostParticipant)
    : hostParticipant;
  const liveRoomFocusLabel = liveRoomFocusTarget
    ? (liveRoomFocusTarget.userId === currentUserParticipantId ? "You" : liveRoomFocusTarget.displayName)
    : "Syncing...";
  const liveRoomAudienceLabel = lowerCommunityParticipants.length > 0
    ? `${lowerCommunityParticipants.length} ready before stage`
    : "Audience syncing";
  const liveRoomControlTitle = isHost
    ? "Set the opening focus."
    : "Choose who you want to follow first.";
  const liveRoomControlBody = isHost
    ? "Choose the first view here and leave presentation controls for Live Stage."
    : "Choose the host or audience view before you join.";
  const liveRoomPolicyTitle = isHost
    ? "Keep room defaults here."
    : "Current room defaults";
  const liveRoomPolicyBody = isHost
    ? "Set access, reactions, and capture here before you continue."
    : `Current room defaults are ${liveRoomJoinLabel.toLowerCase()}, ${liveRoomReactionsLabel.toLowerCase()}, and ${liveRoomCaptureLabel.toLowerCase()}.`;
  const liveRoomShareTitle = "Share the room code.";
  const liveRoomShareBody = "Invite in app first, then use system share only if you need it.";
  const liveRoomEntryLabel = isHost ? "Continue to Live Stage" : "Join Live Stage";
  const currentStageMembership = membershipMapRef.current[trackedUserId];
  const currentTrackedParticipantState = participantStateById[trackedUserId];
  const currentUserHasApprovedSpeakerSeat = !!(
    currentTrackedParticipantState?.role === "speaker"
    || currentStageMembership?.canSpeak
    || currentStageMembership?.stageRole === "speaker"
  );
  const liveKitParticipantRole = isHost
    ? "host"
    : currentUserHasApprovedSpeakerSeat
      ? "speaker"
      : "viewer";
  const isCurrentStageParticipantMuted = !!(
    participantStateById[trackedUserId]?.isMuted
    ?? membershipMapRef.current[trackedUserId]?.isMuted
  );
  const liveKitContractAllowsStagePublish = liveKitJoinContract
    ? liveKitJoinContract.requestedGrants.canPublish
    : liveKitParticipantRole !== "viewer";
  const publishLocalStageAudio = liveKitContractAllowsStagePublish && !isCurrentStageParticipantMuted;
  const publishLocalStageCamera = liveKitContractAllowsStagePublish && !isCurrentStageParticipantMuted;
  const currentMembershipAuthoritySignature = [
    currentTrackedParticipantState?.role ?? "none",
    currentStageMembership?.stageRole ?? "none",
    currentStageMembership?.canSpeak ? "canSpeak" : "noSpeak",
    currentStageMembership?.isMuted ? "muted" : "unmuted",
    currentStageMembership?.membershipState ?? "none",
  ].join("|");
  const canUseStageEffects = liveKitParticipantRole !== "viewer";
  const stageModeTitle = isLiveFirstMode
    ? "Host-led live focus"
    : "Shared watch moment";
  const stageModeBody = isLiveFirstMode
    ? "Live-First keeps the host at the center."
    : `${branding.watchPartyLabel} keeps the shared watch moment centered in the live route.`;
  const hybridStageFocusTarget = tailoredFocusParticipant && tailoredFocusParticipant.userId !== currentUserParticipantId
    ? tailoredFocusParticipant
    : (hostParticipant ?? lowerCommunityParticipants[0] ?? tailoredFocusParticipant);
  const stageFocusTarget = isLiveFirstMode
    ? (hostParticipant ?? tailoredFocusParticipant)
    : hybridStageFocusTarget;
  const stageFocusLabel = stageFocusTarget
    ? (stageFocusTarget.userId === currentUserParticipantId ? "You" : stageFocusTarget.displayName)
    : "Syncing...";
  const stagePrimaryActionLabel = isHost
    ? (isLiveFirstMode ? "Spotlight host" : "Spotlight community")
    : "Follow stage focus";
  const stageHelperCopy = isLiveFirstMode
    ? `${lowerCommunityCountLabel}. ${hostParticipant ? `${hostParticipant.userId === currentUserParticipantId ? "You lead the stage." : `${hostParticipant.displayName} leads the stage.`}` : "Host focus is syncing."}`
    : `${lowerCommunityCountLabel}. Keep the host and community readable while the shared watch moment leads.`;
  const stageReactionQuickEmojis = useMemo(
    () => Array.from(new Set(recentReactionEmojis)).slice(0, 2),
    [recentReactionEmojis],
  );
  const stageReactionQuickLabel = stageReactionsEnabled
    ? (isHost ? "Audience energy" : "Quick reactions")
    : "Reactions muted";
  const stageReactionQuickScale = reactionTapPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });
  const liveStageProtectionCopy = getProtectedSessionCopy("live-stage", {
    contentAccessRule: room?.contentAccessRule,
    capturePolicy: room?.capturePolicy,
  });
  const liveStageProtectionStatus = room?.capturePolicy === "host_managed"
    ? "Host-managed"
    : "Best-effort";
  const liveStageProtectionHint = room?.capturePolicy === "host_managed"
    ? "Host capture rules are active, while device blocking still stays best-effort."
    : "Capture protection stays best-effort on supported devices.";
  const liveRoomLayoutIsDefault = !tailoredFocusParticipant || tailoredFocusParticipant.userId === hostParticipant?.userId;
  const canUseViewerSelfHero = !isHost && isHybridMode;
  const shouldUseViewerSelfHero = canUseViewerSelfHero && viewerSelfHeroEnabled;
  // Viewer self-hero is local-only presentation state. It never changes host identity,
  // token grants, seat approval, or any room-wide ordering.
  const heroParticipant = shouldUseViewerSelfHero
    ? selfFallbackParticipant
    : (stageFocusTarget ?? hostParticipant ?? selfFallbackParticipant);
  const heroMediaParticipant = heroParticipant ? stageMediaParticipantsByUserId[heroParticipant.userId] as CommunicationParticipantView | undefined : undefined;
  const heroParticipantIsCurrentUser = heroParticipant?.userId === currentUserParticipantId;
  const currentUserHasCameraSeat = currentStageParticipantState.role === "host" || currentStageParticipantState.role === "speaker";
  const showHeroLocalRtcVideo = heroParticipantIsCurrentUser && currentUserHasCameraSeat && !!RTCView && !!localStreamURL;
  const showHeroRemoteVideo = !heroParticipantIsCurrentUser && !!RTCView && !!heroMediaParticipant?.streamURL;
  const heroParticipantPreviewUri = String(
    heroParticipantIsCurrentUser
      ? (currentUserHasCameraSeat ? (myCameraPreviewUrlRef.current || heroParticipant?.cameraPreviewUrl || heroParticipant?.avatarUrl || "") : (heroParticipant?.avatarUrl || ""))
      : (heroParticipant?.cameraPreviewUrl || heroParticipant?.avatarUrl || ""),
  ).trim();
  const showHeroRemoteImage = !showHeroLocalRtcVideo && !showHeroRemoteVideo && !!heroParticipantPreviewUri;
  const heroOwnsLocalFeed = heroParticipantIsCurrentUser;
  const selfHeroFallbackBody = currentStageParticipantState.role === "speaker"
    ? "Camera seat active"
    : "Local self view";
  const actualVisualHeroParticipantId = isHost
    ? currentUserParticipantId
    : shouldUseViewerSelfHero
      ? currentUserParticipantId
      : (heroParticipant?.userId ?? "");
  const communityCardParticipants = useMemo(() => {
    const nextParticipants = visibleStripParticipants.filter((participant) => {
      if (!participant.userId) return false;
      if (participant.userId === actualVisualHeroParticipantId) return false;
      const participantState = participantStateById[participant.userId] ?? createDefaultParticipantState({
        role: participant.role,
        isSpeaking: participant.isSpeaking,
        isMuted: participant.isMuted,
      });
      if (participantState.isRemoved) return false;
      return true;
    });
    if (!shouldUseViewerSelfHero || !hostParticipant?.userId) return nextParticipants;
    const hostEntry = nextParticipants.find((participant) => participant.userId === hostParticipant.userId);
    if (!hostEntry) return nextParticipants;
    return [
      hostEntry,
      ...nextParticipants.filter((participant) => participant.userId !== hostParticipant.userId),
    ];
  }, [
    actualVisualHeroParticipantId,
    currentUserParticipantId,
    hostParticipant,
    participantStateById,
    shouldUseViewerSelfHero,
    visibleStripParticipants,
  ]);
  const communityCardRows = useMemo(() => {
    const rows: typeof communityCardParticipants[] = [];
    let pendingRow: typeof communityCardParticipants = [];

    communityCardParticipants.forEach((participant) => {
      pendingRow.push(participant);
      if (pendingRow.length === LIVE_STAGE_REMOTE_GRID_COLUMNS) {
        rows.push(pendingRow);
        pendingRow = [];
      }
    });

    if (pendingRow.length > 0) {
      rows.push(pendingRow);
    }

    return rows;
  }, [communityCardParticipants]);
  const activeSpeakerSeatCount = useMemo(() => {
    const seen = new Set<string>();
    return visibleStripParticipants.reduce((count, participant) => {
      const participantId = String(participant.userId ?? "").trim();
      if (!participantId || seen.has(participantId)) return count;
      seen.add(participantId);
      const participantState = participantStateById[participantId] ?? createDefaultParticipantState({
        role: participant.role,
        isSpeaking: participant.isSpeaking,
        isMuted: participant.isMuted,
      });
      if (participantState.isRemoved) return count;
      return participantState.role === "host" || participantState.role === "speaker" ? count + 1 : count;
    }, 0);
  }, [participantStateById, visibleStripParticipants]);
  const canAddSpeakerSeat = useCallback((participantId: string) => {
    const participantState = participantStateById[participantId];
    if (participantState?.role === "host" || participantState?.role === "speaker") return true;
    return activeSpeakerSeatCount < LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS;
  }, [activeSpeakerSeatCount, participantStateById]);
  const clearPendingSeatRequest = useCallback((participantId: string, options?: { broadcast?: boolean }) => {
    const nextParticipantId = String(participantId ?? "").trim();
    if (!nextParticipantId) return;
    setSeatRequestsById((prev) => {
      if (!prev[nextParticipantId]) return prev;
      const next = { ...prev };
      delete next[nextParticipantId];
      return next;
    });
    if (options?.broadcast !== false) {
      broadcastSeatRequest(nextParticipantId, false);
    }
    setSeatRequestSheetClosedById((prev) => {
      if (!prev[nextParticipantId]) return prev;
      const next = { ...prev };
      delete next[nextParticipantId];
      return next;
    });
    setSeatRequestSheetParticipantId((current) => (current === nextParticipantId ? "" : current));
    collapseHostParticipantControls(nextParticipantId);
  }, [broadcastSeatRequest, collapseHostParticipantControls]);
  const approveStageSeatRequest = useCallback(async (participantId: string) => {
    const nextParticipantId = String(participantId ?? "").trim();
    if (!nextParticipantId) return;
    await runStageParticipantAction(nextParticipantId, async () => {
      const participant = visibleStripParticipants.find((entry) => entry.userId === nextParticipantId);
      const participantState = participantStateById[nextParticipantId] ?? createDefaultParticipantState({
        role: participant?.role ?? "viewer",
        isSpeaking: !!participant?.isSpeaking,
        isMuted: !!participant?.isMuted,
      });
      if (participantState.isRemoved || participantState.role === "host") {
        clearPendingSeatRequest(nextParticipantId);
        Alert.alert("Seat request updated", "This request is no longer active.");
        await refreshStageSnapshot(myUserId).catch(() => null);
        return;
      }
      if (!canAddSpeakerSeat(nextParticipantId)) {
        collapseHostParticipantControlsAfterFailure(nextParticipantId);
        setSeatRequestSheetParticipantId("");
        Alert.alert(
          "Speaker seats full",
          `Live rooms allow up to ${LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS} active speaker seats. Move someone to audience before approving another speaker.`,
        );
        return;
      }
      const seatPersisted = await emitParticipantUpdate(nextParticipantId, { role: "speaker" });
      if (!seatPersisted) {
        collapseHostParticipantControlsAfterFailure(nextParticipantId);
        setSeatRequestSheetParticipantId("");
        Alert.alert("Seat update unavailable", "The camera seat could not be saved yet. Try approving the seat again.");
        await refreshStageSnapshot(myUserId).catch(() => null);
        return;
      }
      setParticipantStateById((prev) => ({
        ...prev,
        [nextParticipantId]: {
          ...(prev[nextParticipantId] ?? participantState),
          role: "speaker",
        },
      }));
      setSeatRequestsById((prev) => {
        if (!prev[nextParticipantId]) return prev;
        const next = { ...prev };
        delete next[nextParticipantId];
        return next;
      });
      setSeatRequestSheetClosedById((prev) => {
        if (!prev[nextParticipantId]) return prev;
        const next = { ...prev };
        delete next[nextParticipantId];
        return next;
      });
      broadcastSeatState(nextParticipantId, {
        role: "speaker",
        isMuted: participantState.isMuted,
        pending: false,
      });
      setSeatRequestSheetParticipantId("");
      collapseHostParticipantControls(nextParticipantId);
    });
  }, [
    broadcastSeatState,
    canAddSpeakerSeat,
    clearPendingSeatRequest,
    collapseHostParticipantControls,
    collapseHostParticipantControlsAfterFailure,
    emitParticipantUpdate,
    myUserId,
    participantStateById,
    refreshStageSnapshot,
    runStageParticipantAction,
    visibleStripParticipants,
  ]);
  const pendingSeatRequestParticipants = useMemo(() => {
    if (!isHost) return [];
    return visibleStripParticipants.filter((participant) => {
      const participantId = String(participant.userId ?? "").trim();
      if (!participantId || !seatRequestsById[participantId]) return false;
      const participantState = participantStateById[participantId] ?? createDefaultParticipantState({
        role: participant.role,
        isSpeaking: participant.isSpeaking,
        isMuted: participant.isMuted,
      });
      return participantState.role === "listener" && !participantState.isRemoved;
    });
  }, [isHost, participantStateById, seatRequestsById, visibleStripParticipants]);
  const pendingSeatRequestParticipant = useMemo(() => {
    if (!pendingSeatRequestParticipants.length) return null;
    return pendingSeatRequestParticipants.find((participant) => participant.userId === seatRequestSheetParticipantId)
      ?? pendingSeatRequestParticipants[0]
      ?? null;
  }, [pendingSeatRequestParticipants, seatRequestSheetParticipantId]);
  const pendingSeatRequestParticipantState = pendingSeatRequestParticipant
    ? participantStateById[pendingSeatRequestParticipant.userId] ?? createDefaultParticipantState({
      role: pendingSeatRequestParticipant.role,
      isSpeaking: pendingSeatRequestParticipant.isSpeaking,
      isMuted: pendingSeatRequestParticipant.isMuted,
    })
    : null;
  useEffect(() => {
    if (!canUseViewerSelfHero && viewerSelfHeroEnabled) {
      setViewerSelfHeroEnabled(false);
    }
  }, [canUseViewerSelfHero, viewerSelfHeroEnabled]);
  useEffect(() => {
    if (!isHost || isLiveRoomSurface || !pendingSeatRequestParticipants.length) {
      setSeatRequestSheetParticipantId("");
      return;
    }
    setSeatRequestSheetParticipantId((current) => {
      if (current && pendingSeatRequestParticipants.some((participant) => participant.userId === current)) {
        return current;
      }
      return pendingSeatRequestParticipants.find((participant) => !seatRequestSheetClosedById[participant.userId])?.userId ?? "";
    });
  }, [isHost, isLiveRoomSurface, pendingSeatRequestParticipants, seatRequestSheetClosedById]);
  const communityCardParticipantIndexById = useMemo(
    () => Object.fromEntries(communityCardParticipants.map((participant, index) => [participant.userId, index])),
    [communityCardParticipants],
  );
  const communityCardCountLabel = communityCardParticipants.length > 0
    ? `${communityCardParticipants.length} ${communityCardParticipants.length === 1 ? "member" : "members"}`
    : "Feeds syncing";
  useEffect(() => {
    if (Platform.OS === "web" || liveSurface !== "stage") return;
    debugLog("livekit", "live-stage member feed authority state", {
      roomName: liveKitJoinContract?.roomName ?? partyId,
      currentUserId: currentUserParticipantId,
      desiredParticipantRole: liveKitParticipantRole,
      desiredCanPublish: liveKitParticipantRole !== "viewer" && !isCurrentStageParticipantMuted,
      contractParticipantRole: liveKitJoinContract?.participantRole ?? null,
      contractCanPublish: liveKitJoinContract?.requestedGrants.canPublish ?? null,
      publishLocalStageCamera,
      membershipAuthority: currentMembershipAuthoritySignature,
      memberParticipantIds: communityCardParticipants.map((participant) => participant.userId),
    });
  }, [
    communityCardParticipants,
    currentMembershipAuthoritySignature,
    currentUserParticipantId,
    isCurrentStageParticipantMuted,
    liveKitJoinContract?.participantRole,
    liveKitJoinContract?.requestedGrants.canPublish,
    liveKitJoinContract?.roomName,
    liveKitParticipantRole,
    liveSurface,
    partyId,
    publishLocalStageCamera,
  ]);
  const heroFallbackInitial = String(heroParticipant?.displayName || "H").trim().slice(0, 1).toUpperCase();
  const liveKitJoinUnavailableTitle = liveKitJoinUnavailable?.responseError === "no_eligible_livekit_server"
    ? "Live video unavailable"
    : liveKitJoinUnavailable
      ? "Live room unavailable"
      : "";
  const liveKitJoinUnavailableBody = liveKitJoinUnavailable
    ? "Live video is temporarily unavailable. Try again in a moment."
    : "";
  const selectedStageEffect = getLiveEffectById(selectedStageEffectId);
  const stageEffectAppliedToCamera = isLiveEffectAppliedToCamera(selectedStageEffect);
  const activeStageLookLabel = canUseStageEffects && stageEffectAppliedToCamera
    ? selectedStageEffect.label
    : "";
  const hybridCommentCountLabel = hybridComments.length === 1 ? "1 comment" : `${hybridComments.length} comments`;
  const hybridCommentPlaceholder = isHost ? "Comment as host" : "Add a comment";
  const hybridCommentDisabled = (!hybridCommentDraft.trim() && !hybridCommentAttachmentFile) || hybridCommentSending;
  const stageEffectsTitle = canUseStageEffects ? CHILLYFECTS_BRAND_NAME : "Chi'llyfects catalog";
  const stageEffectsBody = canUseStageEffects
    ? "Chi'llyfects can be previewed here. Live camera effects are still being prepared."
    : "Viewers can browse the Chi'llyfects catalog. Camera Chi'llyfects require a speaker or host camera role.";
  const stageEffectsHelper = getLiveEffectStatusCopy(selectedStageEffect);
  const stageTopChromeStatusLabel = `${lowerCommunityCountLabel} · ${liveStageProtectionStatus}${controlsLocked ? " · Controls locked" : ""}`;

  const mapLiveStageCommentRow = useCallback((row: LiveStageCommentRow): LiveStageComment | null => {
    const id = String(row.id ?? "").trim();
    const userId = String(row.user_id ?? "").trim();
    const body = String(row.text ?? "").trim();
    if (!id || !userId || !body) return null;

    const rowUsername = String(row.username ?? "").trim();
    const membership = membershipMapRef.current[userId];
    const fallbackAuthor = userId === trackedUserId
      ? resolvedCurrentUsername
      : (membership?.displayName || "Guest");
    const authorLabel = userId === trackedUserId
      ? "You"
      : resolveIdentityName(rowUsername, fallbackAuthor);

    return {
      id,
      userId,
      authorLabel,
      body,
      createdAt: String(row.created_at ?? new Date().toISOString()),
      isMe: userId === trackedUserId,
      attachments: [],
    };
  }, [resolvedCurrentUsername, trackedUserId]);

  const mergeHybridCommentsIfChanged = useCallback((nextComments: LiveStageComment[]) => {
    setHybridComments((prev) => {
      if (
        prev.length === nextComments.length
        && prev.every((comment, index) => {
          const nextComment = nextComments[index];
          return !!nextComment
            && comment.id === nextComment.id
            && comment.body === nextComment.body
            && comment.createdAt === nextComment.createdAt
            && comment.attachments.map((attachment) => attachment.id).join(",") === nextComment.attachments.map((attachment) => attachment.id).join(",");
        })
      ) {
        return prev;
      }

      return nextComments;
    });
  }, []);

  const fetchHybridComments = useCallback(async () => {
    if (!partyId) return [] as LiveStageComment[];

    try {
      const { data, error } = await supabase
        .from("watch_party_room_messages")
        .select("id,user_id,username,text,created_at")
        .eq("party_id", partyId)
        .order("created_at", { ascending: true })
        .limit(120);

      if (error || !data) return [] as LiveStageComment[];

      const comments = (data as LiveStageCommentRow[])
        .map((row) => mapLiveStageCommentRow(row))
        .filter(Boolean) as LiveStageComment[];
      const attachmentsByCommentId = await readSocialAttachmentsForSurfaces(
        "watch_party_room_message",
        comments.map((comment) => comment.id),
      );

      return comments.map((comment) => ({
        ...comment,
        attachments: attachmentsByCommentId.get(comment.id) ?? [],
      }));
    } catch {
      return [] as LiveStageComment[];
    }
  }, [mapLiveStageCommentRow, partyId]);

  useEffect(() => {
    if (!__DEV__ || !canOwnActiveStageSurface || shouldRenderLiveKitStage) return;
    debugLiveStage("stage media binding", {
      communicationRoomId,
      heroUserId: heroParticipant?.userId ?? "",
      heroStreamReady: !!heroMediaParticipant?.streamURL,
      heroCameraOn: heroMediaParticipant?.cameraOn ?? null,
      stageMediaParticipants: stageMediaParticipants.map((participant) => ({
        userId: participant.userId,
        isSelf: participant.isSelf,
        cameraOn: participant.cameraOn,
        micOn: participant.micOn,
        streamReady: !!participant.streamURL,
        connectionState: participant.connectionState,
      })),
      stageParticipants: displayParticipants.map((participant) => ({
        userId: participant.userId,
        role: participant.role,
        displayName: participant.displayName,
      })),
    });
  }, [
    communicationRoomId,
    displayParticipants,
    heroMediaParticipant?.cameraOn,
    heroMediaParticipant?.streamURL,
    heroParticipant?.userId,
    canOwnActiveStageSurface,
    shouldRenderLiveKitStage,
    stageMediaParticipants,
  ]);

  useEffect(() => {
    if (!canUseBetaStage || !partyId || !usesSharedStageCommentLane) {
      setHybridComments([]);
      setHybridCommentError("");
      if (roomMessagesChannelRef.current) {
        supabase.removeChannel(roomMessagesChannelRef.current);
        roomMessagesChannelRef.current = null;
      }
      return;
    }

    let active = true;

    const loadHybridComments = async () => {
      const nextComments = await fetchHybridComments();
      if (!active) return;
      mergeHybridCommentsIfChanged(nextComments);
    };

    void loadHybridComments();

    if (roomMessagesChannelRef.current) {
      supabase.removeChannel(roomMessagesChannelRef.current);
      roomMessagesChannelRef.current = null;
    }

    const channel = supabase
      .channel(`live-stage-comments-${partyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "watch_party_room_messages",
          filter: `party_id=eq.${partyId}`,
        },
        (payload) => {
          const nextComment = mapLiveStageCommentRow(payload.new as LiveStageCommentRow);
          if (!nextComment) return;
          setHybridComments((prev) => {
            if (prev.some((comment) => comment.id === nextComment.id)) return prev;
            return [...prev.slice(-119), nextComment];
          });
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void loadHybridComments();
        }
      });

    roomMessagesChannelRef.current = channel;

    return () => {
      active = false;
      if (roomMessagesChannelRef.current === channel) {
        supabase.removeChannel(channel);
        roomMessagesChannelRef.current = null;
      }
    };
  }, [canUseBetaStage, fetchHybridComments, mergeHybridCommentsIfChanged, partyId, usesSharedStageCommentLane]);

  useEffect(() => {
    if (!canUseBetaStage || !isFocused || !partyId || !usesSharedStageCommentLane || liveSurface !== "stage") return;

    let active = true;

    const syncHybridComments = async () => {
      const nextComments = await fetchHybridComments();
      if (!active) return;
      mergeHybridCommentsIfChanged(nextComments);
    };

    void syncHybridComments();
    const interval = setInterval(() => {
      void syncHybridComments();
    }, LIVE_COMMENT_FALLBACK_REFRESH_MS);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [
    canUseBetaStage,
    fetchHybridComments,
    isFocused,
    liveSurface,
    mergeHybridCommentsIfChanged,
    partyId,
    usesSharedStageCommentLane,
  ]);

  useEffect(() => {
    if (!usesSharedStageCommentLane || hybridComments.length === 0) return;
    const scrollTimeout = setTimeout(() => {
      hybridCommentsScrollRef.current?.scrollToEnd({ animated: true });
    }, 40);
    return () => clearTimeout(scrollTimeout);
  }, [hybridComments, usesSharedStageCommentLane]);

  const leaveLiveRoom = useCallback(() => {
    router.push({ pathname: "/watch-party", params: { mode: "live" } });
  }, [router]);

  const endLiveRoomWithoutSaving = useCallback(async () => {
    if (!partyId || saveReplayEnding) return;
    try {
      setSaveReplayEnding(true);
      await requestSaveReplay({
        action: "end_without_saving",
        partyId,
        sourceType: "live_stage",
      });
      leaveLiveRoom();
    } catch (error) {
      Alert.alert(
        "Could not end room",
        error instanceof Error ? error.message : "Try again or leave the room view.",
      );
    } finally {
      setSaveReplayEnding(false);
    }
  }, [leaveLiveRoom, partyId, saveReplayEnding]);

  const endLiveRoomAndSaveReplay = useCallback(async () => {
    if (!partyId || saveReplayEnding) return;
    try {
      setSaveReplayEnding(true);
      const result = await requestSaveReplay({
        action: "request_save_replay",
        partyId,
        sourceType: "live_stage",
        title: `Live Stage Replay ${partyId}`,
      });
      Alert.alert(
        "Replay is processing",
        result.message || "Replay is processing. You'll see it in Content Library when it's ready.",
        [{ text: "OK", onPress: leaveLiveRoom }],
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Replay could not be saved right now.";
      if (message.includes("Replay was not recording")) {
        Alert.alert(
          "Replay was not recording for this session. End without saving?",
          "This session does not have a saveable replay recording.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "End Without Saving", style: "destructive", onPress: () => { void endLiveRoomWithoutSaving(); } },
          ],
        );
      } else {
        Alert.alert("Save Replay unavailable", message);
      }
    } finally {
      setSaveReplayEnding(false);
    }
  }, [endLiveRoomWithoutSaving, leaveLiveRoom, partyId, saveReplayEnding]);

  const onEndLiveRoomAsHost = useCallback(() => {
    if (!isHost) {
      leaveLiveRoom();
      return;
    }
    Alert.alert(
      "Save Replay?",
      "The replay will be saved to your Content Library first. You can keep it Draft, make it private to your Chi'lly Circle, or make it Public later.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "End Without Saving", style: "destructive", onPress: () => { void endLiveRoomWithoutSaving(); } },
        { text: "End & Save Replay", onPress: () => { void endLiveRoomAndSaveReplay(); } },
      ],
    );
  }, [endLiveRoomAndSaveReplay, endLiveRoomWithoutSaving, isHost, leaveLiveRoom]);

  const onShareLiveRoom = useCallback(async () => {
    if (!liveRoomShareCode) return;
    setInviteSheetVisible(true);
  }, [liveRoomShareCode]);

  const onSystemShareLiveRoom = useCallback(async () => {
    if (!liveRoomShareCode) return;
    await Share.share({
      message: `${branding.appDisplayName} live room code: ${liveRoomShareCode}\n\nOpen ${branding.appDisplayName} -> Live Watch-Party -> enter the code to join the live room.`,
      title: "Live Room Invite",
    }).catch(() => {});
  }, [branding.appDisplayName, liveRoomShareCode]);

  const updateLiveRoomPolicies = useCallback(async (policies: {
    joinPolicy?: WatchPartyState["joinPolicy"];
    reactionsPolicy?: WatchPartyState["reactionsPolicy"];
    capturePolicy?: WatchPartyState["capturePolicy"];
  }) => {
    if (!isHost || !partyId) return;
    const nextRoom = await setPartyRoomPolicies(partyId, policies).catch(() => null);
    if (nextRoom) {
      setRoom(nextRoom);
    }
    await refreshStageSnapshot(trackedUserId).catch(() => null);
  }, [isHost, partyId, refreshStageSnapshot, trackedUserId]);

  const onToggleLiveRoomLock = useCallback(() => {
    void updateLiveRoomPolicies({
      joinPolicy: room?.joinPolicy === "locked" ? "open" : "locked",
    });
  }, [room?.joinPolicy, updateLiveRoomPolicies]);

  const onToggleLiveRoomReactions = useCallback(() => {
    void updateLiveRoomPolicies({
      reactionsPolicy: room?.reactionsPolicy === "muted" ? "enabled" : "muted",
    });
  }, [room?.reactionsPolicy, updateLiveRoomPolicies]);

  const onToggleLiveRoomCapture = useCallback(() => {
    void updateLiveRoomPolicies({
      capturePolicy: room?.capturePolicy === "host_managed" ? "best_effort" : "host_managed",
    });
  }, [room?.capturePolicy, updateLiveRoomPolicies]);

  const onLiveKitStageFallback = useCallback((reason: "connection_timeout" | "disconnected" | "room_error") => {
    debugLog("livekit", "falling back to legacy live-stage media path", {
      reason,
      roomName: liveKitJoinContract?.roomName ?? partyId,
    });
    setLiveKitJoinContract(null);
  }, [liveKitJoinContract?.roomName, partyId]);

  const resolveLiveKitStageEntryRole = useCallback(async (): Promise<LiveKitTokenReady["participantRole"]> => {
    if (
      isHost
      || !isLiveFirstMode
      || liveKitParticipantRole !== "viewer"
      || !partyId
      || !trackedUserId
      || trackedUserId === "anon"
    ) {
      return liveKitParticipantRole;
    }

    debugLog("livekit", "live-stage viewer entered without host-granted camera seat", {
      roomName: partyId,
      participantRole: liveKitParticipantRole,
      userId: trackedUserId,
    });
    return liveKitParticipantRole;
  }, [
    isHost,
    isLiveFirstMode,
    liveKitParticipantRole,
    partyId,
    trackedUserId,
  ]);

  const onEnterLiveStage = useCallback(async () => {
    const entryStageMode: SharedRoomMode = isHost ? stageMode : "hybrid";
    const entryParticipantRole: LiveKitTokenReady["participantRole"] = liveKitParticipantRole;

    if (!isHost && stageMode !== "hybrid") {
      setStageMode("hybrid");
      if (modeParamValue !== "hybrid") {
        router.setParams({ mode: "hybrid" });
      }
    }

    if (!(await requireLiveStagePremium(entryStageMode === "hybrid" ? "live_watch_party" : "live_first", "route"))) {
      setLiveKitJoinContract(null);
      setLiveKitJoinUnavailable(null);
      return;
    }

    if (__DEV__) {
      console.log("[live-stage-proof] enter live stage", {
        partyId,
        isHost,
        liveKitFoundationEnabled,
        participantRole: entryParticipantRole,
        stageMode: entryStageMode,
        trackedUserReady: !!trackedUserId && trackedUserId !== "anon",
      });
    }

    if (liveKitFoundationEnabled && partyId) {
      setLiveKitJoinUnavailable(null);
      const participantRole = entryParticipantRole === liveKitParticipantRole
        ? await resolveLiveKitStageEntryRole()
        : entryParticipantRole;
      const joinResult = await prepareLiveKitJoinBoundary({
        surface: "live-stage",
        roomName: partyId,
        participantIdentity: trackedUserId,
        participantName: resolvedCurrentUsername,
        participantRole,
        metadata: {
          roomCode: room?.roomCode ?? null,
          stageMode: entryStageMode,
          source: source || null,
        },
      });

      if (joinResult.status === "ready") {
        setLiveKitJoinContract(joinResult);
        setLiveKitJoinUnavailable(null);
        debugLog("livekit", "prepared live-stage join contract", {
          roomName: joinResult.roomName,
          endpoint: joinResult.endpoint,
          participantRole: joinResult.participantRole,
          requestedGrants: joinResult.requestedGrants,
        });
      } else {
        setLiveKitJoinContract(null);
        setLiveKitJoinUnavailable(joinResult);
        if (__DEV__) {
          console.log("[live-stage-proof] live-stage join contract unavailable", {
            reason: joinResult.reason,
            responseStatus: joinResult.responseStatus ?? null,
            responseError: joinResult.responseError ?? null,
            message: joinResult.message,
            roomName: joinResult.roomName,
            participantRole: joinResult.participantRole,
          });
        }
        debugLog("livekit", "live-stage join contract unavailable", {
          reason: joinResult.reason,
          roomName: joinResult.roomName,
          endpoint: joinResult.endpoint,
        });
        if (joinResult.reason === "request_failed" || joinResult.reason === "invalid_response") {
          reportRuntimeError("livekit-stage-contract", new Error(joinResult.message), {
            reason: joinResult.reason,
            roomName: joinResult.roomName,
          });
        }
      }
    } else {
      debugLog("livekit", "live-stage join skipped", {
        partyId,
        liveKitFoundationEnabled,
      });
      setLiveKitJoinContract(null);
      setLiveKitJoinUnavailable(null);
    }

    closeStageOverlayPanels();
    setStageOverlayAutoHideArmed(entryStageMode !== "hybrid");
    stageOverlayLastInteractionAtRef.current = Date.now();
    setStageOverlayVisible(true);
    stageOverlayMotion.setValue(1);
    setLiveSurface("stage");
  }, [
    closeStageOverlayPanels,
    isHost,
    liveKitFoundationEnabled,
    liveKitParticipantRole,
    modeParamValue,
    partyId,
    requireLiveStagePremium,
    resolveLiveKitStageEntryRole,
    resolvedCurrentUsername,
    room?.roomCode,
    router,
    source,
    stageMode,
    stageOverlayMotion,
    trackedUserId,
  ]);

  useEffect(() => {
    if (
      !liveKitFoundationEnabled
      || liveSurface !== "stage"
      || Platform.OS === "web"
      || !partyId
      || !trackedUserId
      || trackedUserId === "anon"
    ) {
      return;
    }

    const desiredCanPublish = liveKitParticipantRole !== "viewer" && !isCurrentStageParticipantMuted;
    const existingCanPublish = liveKitJoinContract?.requestedGrants.canPublish === true;
    const staleRoleContract = !!liveKitJoinContract && liveKitJoinContract.participantRole !== liveKitParticipantRole;
    const stalePublishContract = !!liveKitJoinContract && existingCanPublish !== desiredCanPublish;
    const staleContract = staleRoleContract || stalePublishContract;
    const authorityRetryKey = [
      partyId,
      trackedUserId,
      liveKitParticipantRole,
      desiredCanPublish ? "publish" : "viewer",
      currentMembershipAuthoritySignature,
    ].join(":");

    if (liveKitJoinContract && !staleContract) {
      liveKitStageAuthorityRetryKeyRef.current = "";
      liveKitStageContractRefreshKeyRef.current = "";
      return;
    }

    if (staleContract && desiredCanPublish && liveKitStageAuthorityRetryKeyRef.current === authorityRetryKey) {
      debugLog("livekit", "kept backend-authoritative live-stage contract after guarded publish retry", {
        roomName: partyId,
        currentUserId: trackedUserId,
        desiredParticipantRole: liveKitParticipantRole,
        desiredCanPublish,
        contractParticipantRole: liveKitJoinContract?.participantRole ?? null,
        contractCanPublish: existingCanPublish,
        membershipAuthority: currentMembershipAuthoritySignature,
      });
      return;
    }

    const refreshReason = !liveKitJoinContract
      ? "missing"
      : staleRoleContract
        ? "role_mismatch"
        : "publish_mismatch";
    const refreshKey = [
      partyId,
      trackedUserId,
      liveKitParticipantRole,
      desiredCanPublish ? "publish" : "viewer",
      currentMembershipAuthoritySignature,
      refreshReason,
    ].join(":");
    if (liveKitStageContractRefreshKeyRef.current === refreshKey) return;
    liveKitStageContractRefreshKeyRef.current = refreshKey;

    let active = true;
    if (staleContract) {
      debugLog("livekit", "refreshing stale live-stage join contract from membership authority", {
        roomName: partyId,
        currentUserId: trackedUserId,
        desiredParticipantRole: liveKitParticipantRole,
        desiredCanPublish,
        contractParticipantRole: liveKitJoinContract?.participantRole ?? null,
        contractCanPublish: liveKitJoinContract?.requestedGrants.canPublish ?? null,
        refreshReason,
        membershipAuthority: currentMembershipAuthoritySignature,
      });
      setLiveKitJoinContract(null);
    }

    prepareLiveKitJoinBoundary({
      surface: "live-stage",
      roomName: partyId,
      participantIdentity: trackedUserId,
      participantName: resolvedCurrentUsername,
      participantRole: liveKitParticipantRole,
      metadata: {
        roomCode: room?.roomCode ?? null,
        source: "live-stage-authority-refresh",
        muted: isCurrentStageParticipantMuted,
      },
    }).then((joinResult) => {
      if (!active) return;
      if (joinResult.status === "ready") {
        const joinResultCanPublish = joinResult.requestedGrants.canPublish === true;
        const joinResultMatchesDesired = joinResult.participantRole === liveKitParticipantRole
          && joinResultCanPublish === desiredCanPublish;
        setLiveKitJoinContract(joinResult);
        setLiveKitJoinUnavailable(null);
        debugLog("livekit", "refreshed live-stage join contract from membership authority", {
          roomName: joinResult.roomName,
          desiredParticipantRole: liveKitParticipantRole,
          desiredCanPublish,
          participantRole: joinResult.participantRole,
          requestedGrants: joinResult.requestedGrants,
          membershipAuthority: currentMembershipAuthoritySignature,
        });

        if (!joinResultMatchesDesired && desiredCanPublish) {
          if (liveKitStageAuthorityRetryKeyRef.current !== authorityRetryKey) {
            liveKitStageAuthorityRetryKeyRef.current = authorityRetryKey;
            if (liveKitStageAuthorityRetryTimeoutRef.current) {
              clearTimeout(liveKitStageAuthorityRetryTimeoutRef.current);
            }
            debugLog("livekit", "live-stage publish contract still downgraded; refreshing snapshot before one retry", {
              roomName: joinResult.roomName,
              currentUserId: trackedUserId,
              desiredParticipantRole: liveKitParticipantRole,
              desiredCanPublish,
              participantRole: joinResult.participantRole,
              canPublish: joinResultCanPublish,
              membershipAuthority: currentMembershipAuthoritySignature,
            });
            liveKitStageAuthorityRetryTimeoutRef.current = setTimeout(() => {
              liveKitStageAuthorityRetryTimeoutRef.current = null;
              if (!liveKitStageMountedRef.current) return;
              refreshStageSnapshot(trackedUserId).finally(() => {
                if (!liveKitStageMountedRef.current) return;
                liveKitStageContractRefreshKeyRef.current = "";
                setLiveKitJoinContract(null);
              });
            }, 650);
          } else {
            debugLog("livekit", "live-stage publish contract retry already used for authority snapshot", {
              roomName: joinResult.roomName,
              currentUserId: trackedUserId,
              desiredParticipantRole: liveKitParticipantRole,
              desiredCanPublish,
              participantRole: joinResult.participantRole,
              canPublish: joinResultCanPublish,
              membershipAuthority: currentMembershipAuthoritySignature,
            });
          }
        }
        return;
      }

      setLiveKitJoinContract(null);
      setLiveKitJoinUnavailable(joinResult);
    }).catch((error) => {
      if (!active) return;
      setLiveKitJoinContract(null);
      reportRuntimeError("livekit-stage-authority-refresh", error, { partyId, trackedUserId });
    });

    return () => {
      active = false;
    };
  }, [
    currentMembershipAuthoritySignature,
    isCurrentStageParticipantMuted,
    liveKitFoundationEnabled,
    liveKitJoinContract,
    liveKitParticipantRole,
    liveSurface,
    partyId,
    refreshStageSnapshot,
    resolvedCurrentUsername,
    room?.roomCode,
    trackedUserId,
  ]);

  const onReturnToLiveRoom = useCallback(() => {
    closeStageOverlayPanels();
    setStageOverlayAutoHideArmed(false);
    stageOverlayLastInteractionAtRef.current = Date.now();
    setStageOverlayVisible(true);
    stageOverlayMotion.setValue(1);
    setLiveKitJoinContract(null);
    setLiveSurface("room");
  }, [closeStageOverlayPanels, stageOverlayMotion]);

  const onLiveStageBack = useCallback(() => {
    if (seatRequestSheetParticipantId) {
      closeSeatRequestSheet(seatRequestSheetParticipantId);
      return;
    }
    if (!isLiveRoomSurface) {
      onReturnToLiveRoom();
      return;
    }

    returnToWatchPartyRoomRoute();
  }, [closeSeatRequestSheet, isLiveRoomSurface, onReturnToLiveRoom, returnToWatchPartyRoomRoute, seatRequestSheetParticipantId]);

  useEffect(() => {
    if (!isFocused || Platform.OS === "web") return undefined;

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onLiveStageBack();
      return true;
    });

    return () => {
      subscription.remove();
    };
  }, [isFocused, onLiveStageBack]);

  const onOpenStageReactionPicker = useCallback(() => {
    if (!stageReactionsEnabled) {
      Alert.alert("Reactions muted", "The host has muted reactions for this Live Stage. This control is active and reflects the current room policy without granting publish or moderation authority.");
      return;
    }
    revealStageOverlay();
    hybridCommentInputRef.current?.blur();
    setStageControlsOpen(false);
    setFaceFilterSheetOpen(false);
    setCommentsOpen(false);
    setReactionPickerOpen((value) => !value);
  }, [revealStageOverlay, stageReactionsEnabled]);

  const onSendQuickStageReaction = useCallback((emoji: string) => {
    if (!stageReactionsEnabled) {
      Alert.alert("Reactions muted", "The host has muted reactions for this Live Stage. This quick reaction control is active and reports the current room policy.");
      return;
    }
    revealStageOverlay();
    hybridCommentInputRef.current?.blur();
    setStageControlsOpen(false);
    setFaceFilterSheetOpen(false);
    setReactionPickerOpen(false);
    onSelectReactionFromPicker(emoji);
  }, [onSelectReactionFromPicker, revealStageOverlay, stageReactionsEnabled]);

  const onPickHybridCommentAttachment = useCallback(async (scope: SocialAttachmentPickerScope) => {
    try {
      setHybridCommentError("");
      const file = await pickSocialAttachmentFile(scope);
      if (!file) return;
      setHybridCommentAttachmentFile(file);
      setCommentsOpen(true);
      revealStageOverlay();
    } catch (error) {
      setHybridCommentAttachmentFile(null);
      setHybridCommentError(error instanceof Error ? error.message : "Unable to choose this attachment right now.");
    }
  }, [revealStageOverlay]);

  const onSelectHybridCommentAttachment = useCallback((scope: SocialAttachmentPickerScope) => {
    setHybridCommentAttachmentSheetVisible(false);
    void onPickHybridCommentAttachment(scope);
  }, [onPickHybridCommentAttachment]);

  const onSendHybridComment = useCallback(async () => {
    const safeBody = hybridCommentDraft.trim();
    const hasAttachment = !!hybridCommentAttachmentFile;
    if ((!safeBody && !hasAttachment) || !partyId || hybridCommentSending) return;
    if (!appConfig.runtimeControls.chat_enabled) {
      setHybridCommentError("Room comments are temporarily paused. You can still read existing comments.");
      return;
    }
    if (hybridCommentAttachmentFile && !appConfig.runtimeControls.chat_attachments_enabled) {
      setHybridCommentError("Room attachments are temporarily paused. You can still send text comments.");
      return;
    }

    setHybridCommentSending(true);
    setHybridCommentError("");
    try {
      const bodyToSend = safeBody || String(hybridCommentAttachmentFile?.name ?? "Attachment").trim() || "Attachment";
      const sent = await sendPartyMessageRecord(partyId, trackedUserId, "chat", bodyToSend, {
        username: resolvedCurrentUsername,
      });
      if (!sent) {
        setHybridCommentError("Comment did not appear in the room yet. Try sending it again.");
        return;
      }

      if (hybridCommentAttachmentFile) {
        try {
          const attachment = await createSocialAttachmentForSurface({
            surfaceType: "watch_party_room_message",
            surfaceId: sent.id,
            file: hybridCommentAttachmentFile,
          });
          setHybridComments((prev) => prev.map((comment) => (
            comment.id === sent.id ? { ...comment, attachments: [attachment] } : comment
          )));
        } catch (attachmentError) {
          await deletePartyMessage(sent.id).catch(() => undefined);
          setHybridComments((prev) => prev.filter((comment) => comment.id !== sent.id));
          throw attachmentError;
        }
      }

      let landedComments: LiveStageComment[] | null = null;
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const candidateComments = await fetchHybridComments();
        const commentLanded = candidateComments.some((comment) => (
          comment.id === sent.id
        ));

        if (commentLanded) {
          landedComments = candidateComments;
          break;
        }

        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 180));
        }
      }

      if (!landedComments) {
        setHybridCommentError("Comment did not appear in the room yet. Try sending it again.");
        return;
      }

      setHybridComments(landedComments);
      setHybridCommentDraft("");
      setHybridCommentAttachmentFile(null);
      setCommentsOpen(true);
      setTimeout(() => {
        hybridCommentsScrollRef.current?.scrollToEnd({ animated: true });
      }, 40);
    } catch (error) {
      setHybridCommentError(error instanceof Error && error.message
        ? error.message
        : "Comment did not appear in the room yet. Try sending it again.");
    } finally {
      setHybridCommentSending(false);
    }
  }, [
    appConfig.runtimeControls.chat_attachments_enabled,
    appConfig.runtimeControls.chat_enabled,
    fetchHybridComments,
    hybridCommentAttachmentFile,
    hybridCommentDraft,
    hybridCommentSending,
    partyId,
    resolvedCurrentUsername,
    trackedUserId,
  ]);

  useEffect(() => {
    if (canUseStageEffects) return;
    setFaceFilterSheetOpen(false);
  }, [canUseStageEffects]);

  useEffect(() => {
    setControlsLocked(false);
    setStageOverlayAutoHideArmed(false);
  }, [partyId]);

  useEffect(() => {
    if (isLiveRoomSurface) {
      setStageOverlayAutoHideArmed(false);
      stageOverlayLastInteractionAtRef.current = Date.now();
      setStageOverlayVisible(true);
      stageOverlayMotion.setValue(1);
      return;
    }

    // Live Watch-Party hybrid owns the member deck; it is not transient chrome.
    revealStageOverlay({ armAutoHide: !isHybridMode });
    if (isHybridMode) {
      setStageOverlayAutoHideArmed(false);
    }
  }, [isHybridMode, isLiveRoomSurface, revealStageOverlay, stageOverlayMotion]);

  useEffect(() => {
    if (isLiveRoomSurface || !stageOverlayVisible) {
      clearStageOverlayAutoHideTimeout();
      return;
    }

    if (
      isHybridMode
      || !stageOverlayAutoHideArmed
      || (
      controlsLocked
      || commentsOpen
      || hybridCommentFocused
      || reactionPickerOpen
      || stageControlsOpen
      || faceFilterSheetOpen
      )
    ) {
      clearStageOverlayAutoHideTimeout();
      return;
    }

    clearStageOverlayAutoHideTimeout();
    stageOverlayAutoHideTimeoutRef.current = setTimeout(() => {
      hideStageOverlay();
    }, STAGE_OVERLAY_AUTO_HIDE_MILLIS);

    return () => {
      clearStageOverlayAutoHideTimeout();
    };
  }, [
    clearStageOverlayAutoHideTimeout,
    commentsOpen,
    controlsLocked,
    faceFilterSheetOpen,
    hideStageOverlay,
    hybridCommentFocused,
    isHybridMode,
    isLiveRoomSurface,
    reactionPickerOpen,
    stageControlsOpen,
    stageOverlayAutoHideArmed,
    stageOverlayVisible,
    stageMode,
  ]);

  useEffect(() => {
    return () => undefined;
  }, []);

  useEffect(() => {
    return () => {
      clearStageOverlayAutoHideTimeout();
      clearStageOverlayFinalizeHideTimeout();
    };
  }, [clearStageOverlayAutoHideTimeout, clearStageOverlayFinalizeHideTimeout]);

  const renderLiveRoomOverviewCard = () => (
    <View style={styles.liveRoomShellCard}>
      <Text style={styles.liveRoomShellKicker}>LIVE ROOM</Text>
      <Text style={styles.liveRoomShellTitle}>{liveRoomShellTitle}</Text>
      <Text style={styles.liveRoomShellBody}>{liveRoomShellBody}</Text>

      <View style={styles.liveRoomMetaRow}>
        <View style={styles.liveRoomMetaPill}>
          <Text style={styles.liveRoomMetaLabel}>Role</Text>
          <Text style={styles.liveRoomMetaValue}>{liveRoomRoleLabel}</Text>
        </View>
        <View style={styles.liveRoomMetaPill}>
          <Text style={styles.liveRoomMetaLabel}>Mode</Text>
          <Text style={styles.liveRoomMetaValue}>{liveRoomModeLabel}</Text>
        </View>
        <View style={styles.liveRoomMetaPill}>
          <Text style={styles.liveRoomMetaLabel}>Join</Text>
          <Text style={styles.liveRoomMetaValue}>{liveRoomJoinLabel}</Text>
        </View>
        <View style={styles.liveRoomMetaPill}>
          <Text style={styles.liveRoomMetaLabel}>Reactions</Text>
          <Text style={styles.liveRoomMetaValue}>{liveRoomReactionsLabel}</Text>
        </View>
        <View style={styles.liveRoomMetaPill}>
          <Text style={styles.liveRoomMetaLabel}>Capture</Text>
          <Text style={styles.liveRoomMetaValue}>{liveRoomCaptureLabel}</Text>
        </View>
      </View>

      <Text style={styles.liveRoomPermissionText}>{liveRoomPermissionCopy}</Text>
    </View>
  );

  const renderLiveRoomViewingDefaultsCard = () => (
    <View style={styles.liveRoomControlCard}>
      <Text style={styles.liveRoomControlKicker}>VIEWING DEFAULTS</Text>
      <Text style={styles.liveRoomControlTitle}>{liveRoomControlTitle}</Text>
      <Text style={styles.liveRoomControlBody}>{liveRoomControlBody}</Text>
      <View style={styles.liveRoomMetaRow}>
        <View style={styles.liveRoomMetaPill}>
          <Text style={styles.liveRoomMetaLabel}>Focus</Text>
          <Text style={styles.liveRoomMetaValue}>{liveRoomFocusLabel}</Text>
        </View>
        <View style={styles.liveRoomMetaPill}>
          <Text style={styles.liveRoomMetaLabel}>Audience</Text>
          <Text style={styles.liveRoomMetaValue}>{liveRoomAudienceLabel}</Text>
        </View>
      </View>
      <View style={styles.liveRoomActionRow}>
        {liveRoomFocusTarget?.userId
          && (isHost ? liveRoomFocusTarget.userId !== hostParticipant?.userId : !liveRoomLayoutIsDefault) ? (
          <TouchableOpacity
            style={styles.liveRoomActionBtn}
            activeOpacity={0.84}
            onPress={() => {
              if (!liveRoomFocusTarget?.userId) return;
              featureParticipantFirst(liveRoomFocusTarget.userId);
              setActiveParticipantId(liveRoomFocusTarget.userId);
              setActiveSpeakerUserId(liveRoomFocusTarget.userId);
            }}
          >
            <Text style={styles.liveRoomActionText}>
              {isHost ? "See audience first" : "See host first"}
            </Text>
          </TouchableOpacity>
        ) : null}
        {hostParticipant && !liveRoomLayoutIsDefault ? (
          <TouchableOpacity
            style={styles.liveRoomActionBtn}
            activeOpacity={0.84}
            onPress={() => {
              featureParticipantFirst(hostParticipant.userId);
              setActiveParticipantId(hostParticipant.userId);
              setActiveSpeakerUserId(hostParticipant.userId);
            }}
          >
            <Text style={styles.liveRoomActionText}>See host first</Text>
          </TouchableOpacity>
        ) : null}
        {tailoredFocusParticipant
          && tailoredFocusParticipant.userId !== currentUserParticipantId
          && tailoredFocusParticipant.role !== "host" ? (
          <TouchableOpacity
            style={[styles.liveRoomActionBtn, styles.liveRoomActionBtnGhost]}
            activeOpacity={0.84}
            onPress={() => hideParticipantLocally(tailoredFocusParticipant.userId)}
          >
            <Text style={[styles.liveRoomActionText, styles.liveRoomActionTextGhost]}>
              Hide {tailoredFocusParticipant.displayName}
            </Text>
          </TouchableOpacity>
        ) : null}
        {hiddenParticipantCount > 0 ? (
          <TouchableOpacity
            style={[styles.liveRoomActionBtn, styles.liveRoomActionBtnGhost]}
            activeOpacity={0.84}
            onPress={showEveryoneLocally}
          >
            <Text style={[styles.liveRoomActionText, styles.liveRoomActionTextGhost]}>Show everyone</Text>
          </TouchableOpacity>
        ) : null}
        {!liveRoomLayoutIsDefault || hiddenParticipantCount > 0 ? (
          <TouchableOpacity
            style={[styles.liveRoomActionBtn, styles.liveRoomActionBtnGhost]}
            activeOpacity={0.84}
            onPress={resetTailoredStageView}
          >
            <Text style={[styles.liveRoomActionText, styles.liveRoomActionTextGhost]}>Reset layout</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  const renderLiveRoomInviteCard = () => (
    <View style={[styles.liveRoomControlCard, styles.liveRoomControlCardSubtle]}>
      <Text style={styles.liveRoomControlKicker}>INVITE + SHARE</Text>
      <Text style={styles.liveRoomControlTitle}>{liveRoomShareTitle}</Text>
      <Text style={styles.liveRoomControlBody}>{liveRoomShareBody}</Text>
      <Pressable
        style={styles.liveRoomShareRow}
        onPress={onShareLiveRoom}
        disabled={!liveRoomShareCode}
        hitSlop={8}
      >
        <View style={styles.liveRoomShareCodePill}>
          <Text style={styles.liveRoomShareCodeText}>{liveRoomShareCode || "ROOM"}</Text>
        </View>
        <View
          style={styles.liveRoomShareButton}
          pointerEvents="none"
        >
          <Text style={styles.liveRoomShareButtonText}>Invite in app</Text>
        </View>
      </Pressable>
    </View>
  );

  const renderLiveRoomPolicyCard = () => (
    <View style={[styles.liveRoomControlCard, styles.liveRoomControlCardSubtle]}>
      <Text style={styles.liveRoomControlKicker}>ROOM DEFAULTS</Text>
      <Text style={styles.liveRoomControlTitle}>{liveRoomPolicyTitle}</Text>
      <Text style={styles.liveRoomControlBody}>{liveRoomPolicyBody}</Text>
      <View style={styles.liveRoomActionRow}>
        {isHost ? (
          <>
            <TouchableOpacity style={styles.liveRoomActionBtn} activeOpacity={0.84} onPress={onToggleLiveRoomLock}>
              <Text style={styles.liveRoomActionText}>
                {room?.joinPolicy === "locked" ? "Unlock room" : "Lock room"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.liveRoomActionBtn} activeOpacity={0.84} onPress={onToggleLiveRoomReactions}>
              <Text style={styles.liveRoomActionText}>
                {room?.reactionsPolicy === "muted" ? "Enable reactions" : "Mute reactions"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.liveRoomActionBtn} activeOpacity={0.84} onPress={onToggleLiveRoomCapture}>
              <Text style={styles.liveRoomActionText}>
                {room?.capturePolicy === "host_managed" ? "Best-effort capture" : "Host-managed capture"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.liveRoomActionBtn, styles.liveRoomActionBtnGhost]}
              activeOpacity={0.84}
              onPress={onEndLiveRoomAsHost}
              disabled={saveReplayEnding}
            >
              <Text style={[styles.liveRoomActionText, styles.liveRoomActionTextGhost]}>
                {saveReplayEnding ? "Ending" : "End room"}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={[styles.liveRoomActionBtn, styles.liveRoomActionBtnGhost]}
            activeOpacity={0.84}
            onPress={leaveLiveRoom}
          >
            <Text style={[styles.liveRoomActionText, styles.liveRoomActionTextGhost]}>Leave room</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );

  const renderLiveRoomSupportSection = () => (
    <View style={styles.liveRoomSupportSection}>
      <Text style={styles.liveRoomSupportSectionLabel}>BEFORE STAGE</Text>
      {renderLiveRoomInviteCard()}
      {renderLiveRoomPolicyCard()}
    </View>
  );

  const renderLiveRoomSurfaceShell = () => (
    <View style={styles.liveRoomSurface}>
      <ScrollView
        style={styles.liveRoomSurfaceScroll}
        contentContainerStyle={[styles.liveRoomSurfaceContent, { paddingBottom: liveRoomFooterInset + 28 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {renderLiveRoomOverviewCard()}
        {renderLiveRoomViewingDefaultsCard()}
        {renderLiveRoomSupportSection()}
      </ScrollView>

      <View style={[styles.liveRoomFooter, { paddingBottom: liveRoomFooterInset }]}>
        <TouchableOpacity
          style={styles.liveRoomPrimaryButton}
          activeOpacity={0.88}
          accessible
          focusable
          accessibilityRole="button"
          accessibilityLabel={liveRoomEntryLabel}
          hitSlop={STAGE_CONTROL_HIT_SLOP}
          onPress={onEnterLiveStage}
          testID="live-room-enter-stage-button"
        >
          <Text style={styles.liveRoomPrimaryButtonText}>{liveRoomEntryLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStageTopChrome = () => (
    <View style={[styles.stageTopChrome, { top: safeAreaInsets.top + 50 }]} pointerEvents="box-none">
      <View style={styles.stageTopChromeRow}>
        <View style={styles.stageTopChromeCopy}>
          <Text style={styles.stageSurfaceKicker}>LIVE STAGE</Text>
          <Text numberOfLines={1} style={styles.stageTopChromeTitle}>
            {isLiveFirstMode ? "Host-led live" : `${branding.watchPartyLabel} live`}
          </Text>
          <Text numberOfLines={1} style={styles.stageTopChromeBody}>
            {stageTopChromeStatusLabel}
          </Text>
          {activeStageLookLabel ? (
            <View style={styles.stageTopChromeLookRow}>
              <View style={styles.stageTopChromeLookPill}>
                <Text numberOfLines={1} style={styles.stageTopChromeLookPillText}>
                  {`Look · ${activeStageLookLabel}`}
                </Text>
              </View>
            </View>
          ) : null}
        </View>
        <View style={styles.stageTopChromeActions}>
          <NotificationBellButton surface="live-stage" roomSafe style={styles.stageTopNotificationBell} />
          <TouchableOpacity
            style={[styles.stageTopMenuButton, controlsLocked && styles.stageTopMenuButtonActive]}
            activeOpacity={0.84}
            accessible
            focusable
            accessibilityRole="button"
            accessibilityLabel={controlsLocked ? "Unlock Live Stage controls" : "Lock Live Stage controls"}
            hitSlop={STAGE_CONTROL_HIT_SLOP}
            onPressIn={armAndRevealStageOverlay}
            onPress={onToggleControlsLock}
            testID="live-stage-lock-controls-button"
          >
            <Text style={styles.stageTopMenuButtonText}>
              {controlsLocked ? "Unlock controls" : "Lock controls"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.stageSurfaceBackButton}
            activeOpacity={0.84}
            accessible
            focusable
            accessibilityRole="button"
            accessibilityLabel="Return to Live Room"
            hitSlop={STAGE_CONTROL_HIT_SLOP}
            onPressIn={armAndRevealStageOverlay}
            onPress={onReturnToLiveRoom}
            testID="live-stage-live-room-button"
          >
            <Text style={styles.stageSurfaceBackText}>Live Room</Text>
          </TouchableOpacity>
        </View>
      </View>

    </View>
  );

  const renderStageControlsSheet = () => {
    if (!stageControlsOpen) return null;

    return (
      <View pointerEvents="auto" style={styles.stageUtilitySheet}>
        <View style={styles.stageUtilityHeader}>
          <View style={styles.stageUtilityHeaderCopy}>
            <Text style={styles.stageUtilityKicker}>STAGE CONTROLS</Text>
            <Text style={styles.stageUtilityTitle}>{stageModeTitle}</Text>
          </View>
          <TouchableOpacity
            style={styles.stageUtilityDismissBtn}
            activeOpacity={0.84}
            onPress={() => setStageControlsOpen(false)}
          >
            <Text style={styles.stageUtilityDismissText}>Done</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.stageUtilityBody}>{stageModeBody}</Text>
        <Text style={styles.stageUtilityHelper}>{stageHelperCopy}</Text>
        <View style={styles.stageUtilityMetaRow}>
          <View style={styles.stageUtilityMetaPill}>
            <Text style={styles.stageUtilityMetaLabel}>Mode</Text>
            <Text style={styles.stageUtilityMetaValue}>{liveRoomModeLabel}</Text>
          </View>
          <View style={styles.stageUtilityMetaPill}>
            <Text style={styles.stageUtilityMetaLabel}>Focus</Text>
            <Text style={styles.stageUtilityMetaValue}>{stageFocusLabel}</Text>
          </View>
          <View style={styles.stageUtilityMetaPill}>
            <Text style={styles.stageUtilityMetaLabel}>Community</Text>
            <Text style={styles.stageUtilityMetaValue}>{lowerCommunityCountLabel}</Text>
          </View>
        </View>
        <View style={styles.stageUtilityStatusRow}>
          <View style={styles.stageUtilityStatusCopy}>
            <Text style={styles.stageUtilityStatusLabel}>{liveStageProtectionCopy.title}</Text>
            <Text style={styles.stageUtilityStatusBody}>{liveStageProtectionHint}</Text>
          </View>
          <View style={styles.stageUtilityStatusPill}>
            <Text style={styles.stageUtilityStatusValue}>{liveStageProtectionStatus}</Text>
          </View>
        </View>
        <View style={styles.stageUtilityActionRow}>
          <TouchableOpacity
            style={[
              styles.stageUtilityActionBtn,
              !stageFocusTarget?.userId && styles.stageUtilityActionBtnDisabled,
            ]}
            activeOpacity={0.84}
            disabled={!stageFocusTarget?.userId}
            onPress={() => {
              if (!stageFocusTarget?.userId) return;
              featureParticipantFirst(stageFocusTarget.userId);
            }}
          >
            <Text style={styles.stageUtilityActionText}>{stagePrimaryActionLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderStageFaceFilterSheet = () => {
    if (!faceFilterSheetOpen) return null;

    return (
      <View pointerEvents="auto" style={styles.stageUtilitySheet}>
        <View style={styles.stageUtilityHeader}>
          <View style={styles.stageUtilityHeaderCopy}>
            <Text style={styles.stageUtilityKicker}>LIVE CHI’LLYFECTS</Text>
            <Text style={styles.stageUtilityTitle}>{stageEffectsTitle}</Text>
          </View>
          <TouchableOpacity
            style={styles.stageUtilityDismissBtn}
            activeOpacity={0.84}
            onPress={() => setFaceFilterSheetOpen(false)}
          >
            <Text style={styles.stageUtilityDismissText}>Done</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.stageUtilityBody}>{stageEffectsBody}</Text>
        <Text style={styles.stageUtilityHelper}>{stageEffectsHelper}</Text>
        <LiveEffectsPanel
          selectedEffectId={selectedStageEffectId}
          onSelectEffect={setSelectedStageEffectId}
          cameraAvailable={canUseStageEffects}
          surfaceLabel="Live Stage"
          showHeader={false}
        />
      </View>
    );
  };

  const renderStageOverlayUtilitySheets = () => (
    <View style={[styles.overlayBottom, { bottom: commentsLaneBottomOffset }]} pointerEvents="box-none">
      {renderStageControlsSheet()}
      {renderStageFaceFilterSheet()}
    </View>
  );

  const renderStageLowerDock = () => (
    <View
      style={[
        styles.stageDockOverlay,
        stageDockKeyboardLift > 0 && { bottom: stageDockKeyboardLift + 8 },
      ]}
      pointerEvents="box-none"
      collapsable={false}
      renderToHardwareTextureAndroid
      onTouchStart={armAndRevealStageOverlay}
    >
      <View
        style={[styles.liveStageLowerDock, styles.liveStageLowerDockHybrid]}
        pointerEvents="auto"
        collapsable={false}
        renderToHardwareTextureAndroid
        importantForAccessibility="yes"
      >
        {/* Layout lock: visible Live Stage comments stay in this dock per docs/LIVE_WATCH_PARTY_LAYOUT_LOCK.md. */}
        <View style={[styles.modeRow, styles.modeRowHybrid]}>
          <TouchableOpacity
            style={[styles.modeBtn, isLiveFirstMode && styles.modeBtnOn, !isHost && styles.modeBtnDisabled]}
            activeOpacity={isHost ? 0.82 : 1}
            accessible
            focusable
            accessibilityRole="button"
            accessibilityLabel={isHost ? "Switch to Live-First mode" : "Live-First mode is controlled by the host"}
            accessibilityState={{ selected: isLiveFirstMode, disabled: !isHost }}
            hitSlop={STAGE_CONTROL_HIT_SLOP}
            disabled={!isHost}
            onPress={() => {
              void updateStageMode("live");
            }}
            testID="live-stage-mode-live"
          >
            <Text style={[
              styles.modeBtnText,
              isLiveFirstMode && styles.modeBtnTextOn,
              !isHost && styles.modeBtnTextDisabled,
            ]}>Live-First</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, isHybridMode && styles.modeBtnOn, !isHost && styles.modeBtnDisabled]}
            activeOpacity={isHost ? 0.82 : 1}
            accessible
            focusable
            accessibilityRole="button"
            accessibilityLabel={isHost ? `Switch to ${branding.watchPartyLabel} mode` : `${branding.watchPartyLabel} mode is controlled by the host`}
            accessibilityState={{ selected: isHybridMode, disabled: !isHost }}
            hitSlop={STAGE_CONTROL_HIT_SLOP}
            disabled={!isHost}
            onPress={() => {
              void updateStageMode("hybrid");
            }}
            testID="live-stage-mode-hybrid"
          >
            <Text style={[
              styles.modeBtnText,
              isHybridMode && styles.modeBtnTextOn,
              !isHost && styles.modeBtnTextDisabled,
            ]}>{branding.watchPartyLabel}</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.stageHybridCommentsCard, commentsOpen && styles.stageHybridCommentsCardActive]}>
          <View style={styles.stageHybridCommentsHeader}>
            <Text style={styles.stageHybridCommentsTitle}>Room comments</Text>
            <Text style={styles.stageHybridCommentsCount}>{hybridCommentCountLabel}</Text>
          </View>

          <ScrollView
            ref={hybridCommentsScrollRef}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.stageHybridCommentsList}
            contentContainerStyle={styles.stageHybridCommentsListContent}
          >
            {hybridComments.length > 0 ? (
              hybridComments.map((comment) => (
                <View
                  key={comment.id}
                  style={[
                    styles.stageHybridCommentRow,
                    comment.isMe && styles.stageHybridCommentRowMe,
                  ]}
                >
                  <View style={styles.stageHybridCommentMeta}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.stageHybridCommentAuthor,
                        comment.isMe && styles.stageHybridCommentAuthorMe,
                      ]}
                    >
                      {comment.authorLabel}
                    </Text>
                  </View>
                  <Text style={styles.stageHybridCommentBody}>{comment.body}</Text>
                  {comment.attachments.length ? (
                    <View style={styles.stageHybridCommentAttachmentStack}>
                      {comment.attachments.map((attachment) => (
                        <SocialAttachmentCard key={attachment.id} attachment={attachment} compact />
                      ))}
                    </View>
                  ) : null}
                </View>
              ))
            ) : (
              <Text style={styles.stageHybridCommentEmpty}>
                Room comments will land here. Say something to get it moving.
              </Text>
            )}
          </ScrollView>

          {hybridCommentAttachmentFile ? (
            <SocialAttachmentCard
              file={hybridCommentAttachmentFile}
              compact
              onRemove={() => setHybridCommentAttachmentFile(null)}
            />
          ) : null}
          <View style={styles.stageHybridCommentInputRow}>
            <TouchableOpacity
              style={[
                styles.stageHybridCommentAttachButton,
                hybridCommentSending && styles.stageHybridCommentSendButtonDisabled,
              ]}
              activeOpacity={0.84}
              accessible
              focusable
              accessibilityRole="button"
              accessibilityLabel="Attach to Live Stage comment"
              hitSlop={STAGE_CONTROL_HIT_SLOP}
              disabled={hybridCommentSending}
              onPress={() => {
                setHybridCommentAttachmentSheetVisible(true);
              }}
              testID="live-stage-comment-attach"
            >
              <MaterialIcons name="attach-file" size={19} color="#F3F7FF" />
            </TouchableOpacity>
            <TextInput
              ref={hybridCommentInputRef}
              value={hybridCommentDraft}
              onChangeText={(value) => {
                if (hybridCommentError) setHybridCommentError("");
                setHybridCommentDraft(value);
              }}
              onFocus={() => {
                revealStageOverlay();
                setStageControlsOpen(false);
                setFaceFilterSheetOpen(false);
                setReactionPickerOpen(false);
                setCommentsOpen(true);
                setHybridCommentFocused(true);
              }}
              onBlur={() => setHybridCommentFocused(false)}
              placeholder={hybridCommentPlaceholder}
              placeholderTextColor="rgba(190,206,232,0.72)"
              returnKeyType="send"
              blurOnSubmit={false}
              multiline
              editable={!hybridCommentSending}
              accessible
              focusable
              accessibilityLabel={isHost ? "Live Stage comment input as host" : "Live Stage comment input"}
              onSubmitEditing={() => {
                void onSendHybridComment();
              }}
              style={styles.stageHybridCommentInput}
              testID="live-stage-comment-input"
            />
            <TouchableOpacity
              style={[
                styles.stageHybridCommentSendButton,
                hybridCommentDisabled && styles.stageHybridCommentSendButtonDisabled,
              ]}
              activeOpacity={0.84}
              accessible
              focusable
              accessibilityRole="button"
              accessibilityLabel={hybridCommentSending ? "Sending Live Stage comment" : "Send Live Stage comment"}
              hitSlop={STAGE_CONTROL_HIT_SLOP}
              disabled={hybridCommentDisabled}
              onPress={() => {
                void onSendHybridComment();
              }}
              testID="live-stage-comment-send"
            >
              <Text style={styles.stageHybridCommentSendText}>
                {hybridCommentSending ? "Sending" : "Send"}
              </Text>
            </TouchableOpacity>
          </View>
          {hybridCommentError ? (
            <Text style={styles.stageHybridCommentError}>{hybridCommentError}</Text>
          ) : null}
          <View style={styles.stageHybridReactionRow}>
            <Text
              style={[
                styles.stageHybridReactionLabel,
                !stageReactionsEnabled && styles.stageHybridReactionLabelMuted,
              ]}
            >
              {stageReactionQuickLabel}
            </Text>
            <Animated.View
              style={[
                styles.footerReactionQuickRow,
                { transform: [{ scale: stageReactionQuickScale }] },
              ]}
            >
              <TouchableOpacity
                style={[
                  styles.footerIconBtn,
                  reactionPickerOpen && styles.stageFooterActionActiveBtn,
                  !stageReactionsEnabled && styles.stageFooterActionDisabledBtn,
                ]}
                activeOpacity={0.84}
                accessible
                focusable
                accessibilityRole="button"
                accessibilityLabel={stageReactionsEnabled ? "Open Live Stage reaction picker" : "Live Stage reactions muted"}
                hitSlop={STAGE_CONTROL_HIT_SLOP}
                onPress={onOpenStageReactionPicker}
                testID="live-stage-reaction-picker-button"
              >
                <Text style={styles.footerIconBtnText}>✨</Text>
                <Text
                  style={[
                    styles.footerIconBtnLabel,
                    reactionPickerOpen && styles.stageFooterActionActiveLabel,
                    !stageReactionsEnabled && styles.stageFooterActionDisabledLabel,
                  ]}
                >
                  {stageReactionsEnabled ? "React" : "Muted"}
                </Text>
              </TouchableOpacity>
              {stageReactionQuickEmojis.map((emoji, index) => (
                <TouchableOpacity
                  key={`${emoji}-${index}`}
                  style={[
                    styles.footerReactionQuickBtn,
                    !stageReactionsEnabled && styles.stageFooterActionDisabledBtn,
                  ]}
                  activeOpacity={0.84}
                  accessible
                  focusable
                  accessibilityRole="button"
                  accessibilityLabel={stageReactionsEnabled ? `Send ${emoji} reaction` : `${emoji} reaction unavailable while reactions are muted`}
                  hitSlop={STAGE_CONTROL_HIT_SLOP}
                  onPress={() => onSendQuickStageReaction(emoji)}
                  testID={`live-stage-quick-reaction-${index}`}
                >
                  <Text
                    style={[
                      styles.footerReactionQuickText,
                      !stageReactionsEnabled && styles.stageFooterActionDisabledLabel,
                    ]}
                  >
                    {emoji}
                  </Text>
                </TouchableOpacity>
              ))}
            </Animated.View>
          </View>
        </View>
      </View>
      <RoomReactionPicker
        visible={reactionPickerOpen}
        onClose={() => {
          revealStageOverlay();
          setReactionPickerOpen(false);
        }}
        onSelectEmoji={(emoji) => {
          revealStageOverlay();
          if (!stageReactionsEnabled) return;
          onSelectReactionFromPicker(emoji);
        }}
        recentEmojis={recentReactionEmojis}
        title="React"
        subtitle={stageReactionsEnabled ? "Browse and tap to send" : "The host has reactions muted"}
        styles={{
          root: styles.reactionPickerRoot,
          backdrop: styles.reactionPickerBackdrop,
          sheet: styles.reactionPickerSheet,
          header: styles.reactionPickerHeader,
          title: styles.reactionPickerTitle,
          subtitle: styles.reactionPickerSubtitle,
          closeBtn: styles.reactionPickerCloseBtn,
          closeText: styles.reactionPickerCloseText,
          body: styles.reactionPickerBody,
          section: styles.reactionPickerSection,
          sectionTitle: styles.reactionPickerSectionTitle,
          grid: styles.reactionPickerGrid,
          emojiBtn: styles.reactionPickerEmojiBtn,
          emojiText: styles.reactionPickerEmojiText,
        }}
      />
    </View>
  );

  const liveWatchPartyGatePresentation = liveWatchPartyPremiumGate
    ? getMonetizationAccessSheetPresentation({
        gate: liveWatchPartyPremiumGate,
        appDisplayName: branding.appDisplayName,
        premiumUpsellTitle: monetizationConfig.premiumUpsellTitle,
        premiumUpsellBody: monetizationConfig.premiumUpsellBody,
      })
    : null;
  const blockedRoomAccessSheetReason = blockedRoomAccess && isAccessSheetReason(blockedRoomAccess.reason)
    ? blockedRoomAccess.reason
    : null;
  const activeLiveAccessSheetReason = liveWatchPartyPremiumGate && isAccessSheetReason(liveWatchPartyPremiumGate.reason)
    ? liveWatchPartyPremiumGate.reason
    : blockedRoomAccessSheetReason;
  const activeLiveAccessSheetGate = liveWatchPartyPremiumGate && isAccessSheetReason(liveWatchPartyPremiumGate.reason)
    ? liveWatchPartyPremiumGate
    : blockedRoomAccessSheetReason
      ? blockedRoomAccess
      : null;
  const blockedRoomAccessGatePresentation = blockedRoomAccessSheetReason
    ? getMonetizationAccessSheetPresentation({
        gate: blockedRoomAccess,
        appDisplayName: branding.appDisplayName,
        premiumUpsellTitle: monetizationConfig.premiumUpsellTitle,
        premiumUpsellBody: monetizationConfig.premiumUpsellBody,
      })
    : null;
  const livePremiumGateCopy = livePremiumGateKind === "live_first"
    ? LIVE_FIRST_PREMIUM_UPSELL_COPY
    : LIVE_WATCH_PARTY_PREMIUM_UPSELL_COPY;
  const activeLiveAccessPresentation = liveWatchPartyGatePresentation ?? blockedRoomAccessGatePresentation;
  const blockedRoomAccessPrimaryLabel = blockedRoomAccessSheetReason
    ? blockedRoomAccessSheetReason === "premium_required"
      ? "View Premium"
      : activeLiveAccessPresentation?.actionLabel ?? "View Room Access"
    : "Open Party Room";

  if (authLoading || betaLoading) {
    return (
      <BetaAccessScreen
        title="Loading live-stage access"
        body="Checking your signed-in session before opening Live Stage."
        loadingOverride
      />
    );
  }

  if (!isSignedIn) {
    return (
      <BetaAccessScreen
        title="Sign in to join Live Stage"
        body="Live rooms require a signed-in Chi'llywood identity so room membership, moderation, and reconnect handling stay reliable."
      />
    );
  }

  if (!isActive) {
    return (
      <BetaAccessScreen
        title={blockedBetaCopy.title}
        body={blockedBetaCopy.body}
        accessState={accessState.status === "loading" || accessState.status === "signed_out" || accessState.status === "active" ? null : accessState.status}
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#DC143C" />
        <Text style={styles.loadingText}>Opening Live Room…</Text>
      </View>
    );
  }

  if (roomMissing) {
    return (
      <View style={styles.center}>
        <View style={styles.routeGateCard}>
          <Text style={styles.routeGateTitle}>Live room unavailable</Text>
          <Text style={styles.routeGateBody}>
            This live room could not be found anymore. Open Party Room if you want to re-check the canonical room route.
          </Text>
          <RouteBackedMonetizationProofCard
            config={routeProofConfig}
            surface={routeProofConfig?.productType === "live_watch_party_seat_pass" ? "live_seat" : "live_access"}
          />
          <MoneyScopeInfoButton
            scope={routeProofConfig?.productType === "live_watch_party_seat_pass" ? "live_watch_party_seat_pass" : "live_watch_party_access_pass"}
            label="What does this unlock?"
          />
          <View style={styles.routeGateActions}>
            <TouchableOpacity
              style={styles.routeGateSecondaryButton}
              activeOpacity={0.86}
              onPress={returnToWatchPartyRoomRoute}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
            >
              <Text style={styles.routeGateSecondaryText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.routeGatePrimaryButton}
              activeOpacity={0.86}
              onPress={() => {
                if (blockedRoomAccessSheetReason) {
                  setLiveWatchPartyAccessSheetVisible(true);
                  return;
                }
                router.replace({
                  pathname: "/watch-party/[partyId]",
                  params: { partyId },
                });
              }}
              accessibilityRole="button"
              accessibilityLabel={blockedRoomAccessSheetReason ? blockedRoomAccessPrimaryLabel : "Open Party Room"}
              hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
            >
              <Text style={styles.routeGatePrimaryText}>{blockedRoomAccessPrimaryLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  if (roomEntryError || blockedRoomAccess) {
    return (
      <View style={styles.center}>
        <View style={styles.routeGateCard}>
          <Text style={styles.routeGateTitle}>
            {blockedRoomAccess ? getLiveStageAccessTitle(blockedRoomAccess) : "Live room access unavailable"}
          </Text>
          <Text style={styles.routeGateBody}>
            {blockedRoomAccess ? getLiveStageAccessBody(blockedRoomAccess) : roomEntryError}
          </Text>
          <RouteBackedMonetizationProofCard
            config={routeProofConfig}
            surface={routeProofConfig?.productType === "live_watch_party_seat_pass" ? "live_seat" : "live_access"}
          />
          <MoneyScopeInfoButton
            scope={routeProofConfig?.productType === "live_watch_party_seat_pass" ? "live_watch_party_seat_pass" : "live_watch_party_access_pass"}
            label="What does this unlock?"
          />
          <View style={styles.routeGateActions}>
            <TouchableOpacity
              style={styles.routeGateSecondaryButton}
              activeOpacity={0.86}
              onPress={returnToWatchPartyRoomRoute}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
            >
              <Text style={styles.routeGateSecondaryText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.routeGatePrimaryButton}
              activeOpacity={0.86}
              onPress={() => {
                if (blockedRoomAccessSheetReason) {
                  setLiveWatchPartyAccessSheetVisible(true);
                  return;
                }
                router.replace({
                  pathname: "/watch-party/[partyId]",
                  params: { partyId },
                });
              }}
              accessibilityRole="button"
              accessibilityLabel={blockedRoomAccessSheetReason ? blockedRoomAccessPrimaryLabel : "Open Party Room"}
              hitSlop={{ bottom: 6, left: 6, right: 6, top: 6 }}
            >
              <Text style={styles.routeGatePrimaryText}>{blockedRoomAccessSheetReason ? blockedRoomAccessPrimaryLabel : "Open Party Room"}</Text>
            </TouchableOpacity>
          </View>
        </View>
        {activeLiveAccessSheetGate && activeLiveAccessSheetReason ? (
          <AccessSheet
            visible={liveWatchPartyAccessSheetVisible}
            reason={activeLiveAccessSheetReason}
            gate={activeLiveAccessSheetGate}
            appDisplayName={branding.appDisplayName}
            premiumUpsellTitle={monetizationConfig.premiumUpsellTitle}
            premiumUpsellBody={monetizationConfig.premiumUpsellBody}
            kickerOverride={activeLiveAccessPresentation?.kicker}
            titleOverride={liveWatchPartyPremiumGate ? livePremiumGateCopy.title : activeLiveAccessPresentation?.title}
            bodyOverride={liveWatchPartyPremiumGate ? livePremiumGateCopy.message : activeLiveAccessPresentation?.body}
            actionLabelOverride={activeLiveAccessPresentation?.actionLabel}
            onPurchaseResult={(result) => {
              if (!result.ok) {
                return {
                  message: result.message,
                  tone: "error" as const,
                };
              }
              setLoading(true);
              setAccessRetryToken((value) => value + 1);
              return {
                message: "Premium access updated. Try Live Watch-Party again.",
                tone: "success" as const,
              };
            }}
            onRestoreResult={(result) => {
              if (!result.ok) {
                return {
                  message: result.message,
                  tone: "error" as const,
                };
              }
              setLoading(true);
              setAccessRetryToken((value) => value + 1);
              return {
                message: "Purchases restored. Try Live Watch-Party again.",
                tone: "success" as const,
              };
            }}
            onClose={() => setLiveWatchPartyAccessSheetVisible(false)}
          />
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.outerFlex}>
      {backgroundSource ? (
        <ImageBackground source={backgroundSource} style={styles.fullBackground} resizeMode="cover" />
      ) : (
        <View style={styles.fullBackgroundFallback} pointerEvents="none" />
      )}
      <View style={styles.fullBackgroundOverlay} pointerEvents="none" />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.motionLayer,
          {
            opacity: motionOpacity,
            transform: [{ translateY: motionTranslate }],
          },
        ]}
      />
      <View style={styles.vignetteLayer} pointerEvents="none" />
      <View style={styles.depthOverlayTop} pointerEvents="none" />
      <View style={styles.depthOverlayBottom} pointerEvents="none" />

      <View
        style={[styles.screen, { paddingBottom: isLiveRoomSurface ? 0 : Math.max(safeAreaInsets.bottom + 22, 28) }]}
      >
        <View style={styles.stageHudTop}>
          <Animated.View style={[styles.livePill, { opacity: viewersOpacity }]}>
            <Animated.View style={[styles.liveDot, { opacity: liveDotOpacity, transform: [{ scale: liveDotScale }] }]} />
            <Text style={styles.livePillText}>LIVE</Text>
            <Text style={styles.liveTimer}>· {timeLabel}</Text>
            <Animated.View pointerEvents="none" style={[styles.liveBadgeGlow, { opacity: liveGlowOpacity }]} />
          </Animated.View>
          <Animated.View style={[styles.viewersPill, { opacity: viewersOpacity, transform: [{ scale: viewersScale }] }]}>
            <Text style={styles.viewersText}>👁 {viewerCount}</Text>
          </Animated.View>
        </View>
        {isLiveRoomSurface ? renderLiveRoomSurfaceShell() : null}

        {!isLiveRoomSurface ? (
        <ConditionalWrap
          condition={!!(shouldRenderLiveKitStage && liveKitJoinContract)}
          wrap={(children) => (
            <LiveKitHybridCommunityRoomHost
              joinContract={liveKitJoinContract as LiveKitTokenReady}
              onFallback={onLiveKitStageFallback}
              publishLocalAudio={publishLocalStageAudio}
              publishLocalCamera={publishLocalStageCamera}
            >
              {children}
            </LiveKitHybridCommunityRoomHost>
          )}
        >
        <>
        <View
          style={[
            styles.stageCanvas,
            stageMode === "hybrid" && styles.stageCanvasHybrid,
            stageMode === "hybrid" && styles.stageCanvasFullBleed,
          ]}
          collapsable={false}
        >
          {shouldUseViewerSelfHero ? (
            showHeroLocalRtcVideo && RTCView ? (
              <RTCView
                key={`${heroParticipant?.userId ?? "hero"}:${localStreamURL ?? "no-local-stream"}`}
                streamURL={localStreamURL as string}
                style={styles.stageHeroMediaFill}
                objectFit="cover"
                mirror
              />
            ) : showHeroRemoteImage ? (
              <Image
                source={{ uri: heroParticipantPreviewUri }}
                style={styles.stageHeroMediaFill}
              />
            ) : (
              <View style={styles.stageHeroFallback}>
                <Text style={styles.stageHeroFallbackInitial}>{heroFallbackInitial}</Text>
                <Text style={styles.stageHeroFallbackBody}>{selfHeroFallbackBody}</Text>
              </View>
            )
          ) : shouldRenderLiveKitStage && liveKitJoinContract ? (
            <LiveKitHybridHeroVideo
              fallbackInitial={heroFallbackInitial}
              forceLocalHeroFallback={false}
              participantRole={liveKitJoinContract.participantRole}
              preferLocalHero={isHost}
              roomName={liveKitJoinContract.roomName}
            />
          ) : liveKitJoinUnavailable ? (
            <View style={styles.stageHeroFallback}>
              <Text style={styles.stageHeroFallbackTitle}>{liveKitJoinUnavailableTitle}</Text>
              <Text style={styles.stageHeroFallbackBody}>{liveKitJoinUnavailableBody}</Text>
            </View>
          ) : isHybridMode ? (
            <View style={styles.stageHeroFallback}>
              <Text style={styles.stageHeroFallbackInitial}>{heroFallbackInitial}</Text>
            </View>
          ) : showHeroLocalRtcVideo && RTCView ? (
            <RTCView
              key={`${heroParticipant?.userId ?? "hero"}:${localStreamURL ?? "no-local-stream"}`}
              streamURL={localStreamURL as string}
              style={styles.stageHeroMediaFill}
              objectFit="cover"
              mirror
            />
          ) : showHeroRemoteVideo && RTCView ? (
            <RTCView
              key={`${heroParticipant?.userId ?? "hero"}:${heroMediaParticipant?.streamURL ?? "no-stream"}`}
              streamURL={heroMediaParticipant.streamURL as string}
              style={styles.stageHeroMediaFill}
              objectFit="cover"
              mirror={false}
            />
          ) : showHeroRemoteImage ? (
            <Image
              source={{ uri: heroParticipantPreviewUri }}
              style={styles.stageHeroMediaFill}
            />
          ) : (
            <View style={styles.stageHeroFallback}>
              <Text style={styles.stageHeroFallbackInitial}>{heroFallbackInitial}</Text>
            </View>
          )}
          <View
            pointerEvents="none"
            style={[
              styles.floatingReactionsLayer,
              { bottom: liveDockBottomInset + 54 },
            ]}
          >
            {floatingReactions.map((reaction) => (
              <Animated.Text
                key={reaction.id}
                style={[
                  styles.floatingReactionEmoji,
                  {
                    opacity: reaction.opacity,
                    transform: [{ translateY: reaction.rise }, { translateX: reaction.originX }, { translateX: reaction.drift }, { scale: reaction.scale }],
                  },
                ]}
              >
                {reaction.emoji}
              </Animated.Text>
            ))}
          </View>
        </View>

        {!stageOverlayVisible ? (
          <Pressable
            style={[styles.stageTapRevealSurface, styles.stageTapRevealSurfaceHybrid]}
            onPress={armAndRevealStageOverlay}
          />
        ) : null}

        {stageOverlayVisible ? (
        <Animated.View
          style={[
            styles.stageOverlayPanelWrap,
            {
              opacity: stageOverlayOpacity,
              transform: [{ translateY: stageOverlayTranslate }],
            },
          ]}
          pointerEvents="box-none"
          collapsable={false}
          renderToHardwareTextureAndroid
        >
        {renderStageTopChrome()}
        {sourceAttribution ? (
          <View style={styles.stageSourceCard} pointerEvents="none">
            <Text style={styles.stageSourceKicker}>SOURCE</Text>
            <Text style={styles.stageSourceTitle} numberOfLines={2}>{sourceAttribution}</Text>
            <Text style={styles.stageSourceBody}>
              {sourceEnded
                ? "Source live has ended"
                : "Source playback is watch-only. This room has its own people, comments, and live controls."}
            </Text>
          </View>
        ) : null}
        {isHost && pendingSeatRequestParticipant && seatRequestSheetParticipantId ? (
          <View
            pointerEvents="auto"
            style={[styles.stageSeatRequestSheetWrap, { top: safeAreaInsets.top + 84 }]}
          >
            <View
              style={styles.stageSeatRequestSheet}
              pointerEvents="auto"
              testID="live-stage-seat-request-sheet"
            >
              <View style={styles.stageSeatRequestHeader}>
                <View style={styles.stageSeatRequestTitleWrap}>
                  <Text style={styles.stageSeatRequestKicker}>Seat request</Text>
                  <Text style={styles.stageSeatRequestTitle} numberOfLines={1}>
                    {pendingSeatRequestParticipant.displayName}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.stageSeatRequestCloseButton}
                  activeOpacity={0.82}
                  accessible
                  focusable
                  accessibilityRole="button"
                  accessibilityLabel="Dismiss seat request"
                  hitSlop={STAGE_CONTROL_HIT_SLOP}
                  onPress={() => closeSeatRequestSheet(pendingSeatRequestParticipant.userId)}
                  testID="live-stage-seat-request-close"
                >
                  <MaterialIcons name="close" size={18} color="#F5F7FF" />
                </TouchableOpacity>
              </View>
              <Text style={styles.stageSeatRequestBody}>
                Bring them on stage when you are ready. Dismissing keeps you in the room and does not seat them.
              </Text>
              <View style={styles.stageSeatRequestActionRow}>
                <TouchableOpacity
                  style={[
                    styles.stageSeatRequestSecondaryButton,
                    stageParticipantActionBusyId === pendingSeatRequestParticipant.userId && styles.stageParticipantActionBtnBusy,
                  ]}
                  activeOpacity={0.82}
                  accessible
                  focusable
                  accessibilityRole="button"
                  accessibilityLabel="Not now for this seat request"
                  disabled={stageParticipantActionBusyId === pendingSeatRequestParticipant.userId}
                  onPress={() => clearPendingSeatRequest(pendingSeatRequestParticipant.userId)}
                  testID="live-stage-seat-request-dismiss"
                >
                  <Text style={styles.stageSeatRequestSecondaryText}>Not now</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.stageSeatRequestPrimaryButton,
                    (!pendingSeatRequestParticipantState || stageParticipantActionBusyId === pendingSeatRequestParticipant.userId) && styles.stageParticipantActionBtnBusy,
                  ]}
                  activeOpacity={0.86}
                  accessible
                  focusable
                  accessibilityRole="button"
                  accessibilityLabel={`Bring ${pendingSeatRequestParticipant.displayName} on stage`}
                  disabled={!pendingSeatRequestParticipantState || stageParticipantActionBusyId === pendingSeatRequestParticipant.userId}
                  onPress={() => {
                    void approveStageSeatRequest(pendingSeatRequestParticipant.userId);
                  }}
                  testID="live-stage-seat-request-approve"
                >
                  <Text style={styles.stageSeatRequestPrimaryText}>
                    {stageParticipantActionBusyId === pendingSeatRequestParticipant.userId ? "Saving..." : "Bring on stage"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : null}
        {/* Layout lock: preserve the people-first Chi'lly Party Members grid structure in Live Watch-Party mode. */}
        {shouldShowStageCommunityDeck ? (
        <View style={[styles.stageHybridDeck, { top: hybridDeckTop }]} pointerEvents="box-none">
          <View
            pointerEvents="auto"
            style={[
              styles.stageHybridCommunityCard,
              isLiveFirstMode && styles.stageLiveFirstCommunityCard,
              {
                maxHeight: hybridCommunityMaxHeight + 112,
                width: liveStageCommunityCardWidth,
              },
            ]}
          >
            <View style={styles.stageCommunityHeader}>
              <View style={styles.stageCommunityHeaderLeft}>
                <View style={styles.stageCommunityDot} />
                <Text style={styles.stageCommunityLabelHybrid}>{"Chi'lly Party Members"}</Text>
              </View>
              <Text style={styles.stageCommunityCount}>{communityCardCountLabel}</Text>
            </View>
            <Text style={styles.stageCommunityHint}>{stageSeatRequestHint}</Text>
            {canUseViewerSelfHero ? (
              <TouchableOpacity
                style={[
                  styles.stageSelfHeroToggle,
                  viewerSelfHeroEnabled && styles.stageSelfHeroToggleActive,
                ]}
                activeOpacity={0.84}
                accessible
                focusable
                accessibilityRole="button"
                accessibilityLabel={viewerSelfHeroEnabled ? "Show the host as the Live Stage hero" : "Make me the Live Stage hero on this device"}
                accessibilityState={{ selected: viewerSelfHeroEnabled }}
                hitSlop={STAGE_CONTROL_HIT_SLOP}
                onPress={() => setViewerSelfHeroEnabled((value) => !value)}
                testID="live-stage-self-hero-toggle"
              >
                <Text
                  style={[
                    styles.stageSelfHeroToggleText,
                    viewerSelfHeroEnabled && styles.stageSelfHeroToggleTextActive,
                  ]}
                >
                  {viewerSelfHeroEnabled ? "Show host hero" : "Make me hero"}
                </Text>
                <Text style={styles.stageSelfHeroToggleHint}>Only changes your view</Text>
              </TouchableOpacity>
            ) : null}
            {!isHost ? (
              <TouchableOpacity
                style={[
                  styles.stageCommunityRequestButton,
                  stageSeatRequestButtonDisabled && styles.stageCommunityRequestButtonDisabled,
                ]}
                activeOpacity={0.84}
                disabled={stageSeatRequestButtonDisabled}
                onPress={() => {
                  requestStageSeat(currentUserParticipantId).catch(() => {});
                }}
              >
                <Text
                  style={[
                    styles.stageCommunityRequestButtonText,
                    stageSeatRequestButtonDisabled && styles.stageCommunityRequestButtonTextDisabled,
                  ]}
                >
                  {stageSeatRequestButtonLabel}
                </Text>
              </TouchableOpacity>
            ) : null}

            {communityCardParticipants.length > 0 ? (
              <FlatList
                data={communityCardRows}
                keyExtractor={(row, index) => row.map((participant) => participant.userId).join("|") || `community-row-${index}`}
                nestedScrollEnabled
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={[styles.stageHybridCommunityScroll, { maxHeight: hybridCommunityMaxHeight }]}
                contentContainerStyle={styles.stageHybridCommunityGrid}
                removeClippedSubviews={Platform.OS === "android" && !shouldRenderLiveKitStage}
                initialNumToRender={10}
                maxToRenderPerBatch={16}
                windowSize={7}
                extraData={{
                  activeParticipantId,
                  currentUserParticipantId,
                  featuredParticipantById,
                  participantPresentationById,
                  participantStateById,
                  seatRequestsById,
                  stageParticipantActionBusyId,
                  stageMediaParticipantsByUserId,
                  localStreamURL,
                  selectedStageEffectId,
                  heroOwnsLocalFeed,
                  isHost,
                }}
                renderItem={({ item: participantRow }) => (
                  <View style={styles.stageHybridCommunityRow}>
                    {participantRow.map((participant) => {
                      const isCurrentUser = participant.userId === currentUserParticipantId;
                      const mediaParticipant = stageMediaParticipantsByUserId[participant.userId] as CommunicationParticipantView | undefined;
                      const persistedParticipantMembership = membershipMapRef.current[participant.userId];
                      const participantState = participantStateById[participant.userId] ?? {
                        isMuted: !!participant.isMuted,
                        role: participant.role === "host" ? "host" : participant.isSpeaking ? "speaker" : "listener",
                        isRemoved: false,
                      };
                      const isHostBubble = participantState.role === "host";
                      const isActiveParticipant = participant.userId === activeParticipantId;
                      const isLiveParticipant = participant.isLive;
                      const isMuted = participantState.isMuted;
                      const isSpeakerRole = participantState.role === "speaker";
                      const isRemoved = participantState.isRemoved;
                      const isFeatured = !!featuredParticipantById[participant.userId];
                      const isRequesting = !!persistedParticipantMembership && !!seatRequestsById[participant.userId] && participantState.role === "listener" && !isRemoved;
                      const presentation = participantPresentationById[participant.userId] ?? "compact";
                      const isExpanded = presentation === "expanded";
                      const canModerateParticipant = !!persistedParticipantMembership && participantState.role !== "host";
                      // Featured is local focus styling only. Keep the primary card label tied to room state.
                      const roleLabel = getParticipantLayerLabel({
                        state: participantState,
                        isRequesting,
                      });
                      const participantDisplayName = isCurrentUser ? "You" : participant.displayName;
                      const currentUserCanShowCameraTile = isHostBubble || isSpeakerRole;
                      const showLocalRtcPreview = isCurrentUser && currentUserCanShowCameraTile && !!RTCView && !!localStreamURL && !heroOwnsLocalFeed;
                      const showRemoteLiveVideo = !isCurrentUser && !!RTCView && !!mediaParticipant?.streamURL;
                      const shouldUseHybridLiveKitVideo = shouldRenderLiveKitStage && !!liveKitJoinContract;
                      const bubbleMediaUri = isCurrentUser
                        ? (currentUserCanShowCameraTile && !heroOwnsLocalFeed ? (myCameraPreviewUrlRef.current || participant.cameraPreviewUrl || participant.avatarUrl || "") : (participant.avatarUrl || ""))
                        : (participant.cameraPreviewUrl || participant.avatarUrl || "");
                      const soloTile = communityCardParticipants.length === 1;
                      const isParticipantActionBusy = stageParticipantActionBusyId === participant.userId;

                      return (
                        <TouchableOpacity
                          key={`hybrid-presence-${participant.userId}`}
                          activeOpacity={0.74}
                          accessible
                          focusable
                          accessibilityRole="button"
                          accessibilityLabel={isRequesting
                            ? `${participantDisplayName} requested camera. Open seat request.`
                            : isCurrentUser
                              ? `You are in the Live Stage as ${roleLabel}.`
                              : `${participantDisplayName}, ${roleLabel}.`}
                          testID={isCurrentUser ? "live-stage-self-party-card" : isRequesting ? `live-stage-pending-seat-card-${participant.userId}` : `live-stage-party-card-${participant.userId}`}
                          style={[
                            styles.stageParticipantTile,
                            styles.stageParticipantTileGrid,
                            soloTile && styles.stageParticipantTileSoloGrid,
                            isExpanded && styles.stageParticipantTileExpandedGrid,
                            isFeatured && styles.stageParticipantTileFeaturedGrid,
                            isActiveParticipant && !isFeatured && styles.stageParticipantTileActive,
                            isRemoved && styles.stageParticipantTileRemoved,
                          ]}
                          onPress={() => {
                            if (isHost) {
                              debugLiveStage("host tap user", { userId: participant.userId });
                              if (isRequesting && canModerateParticipant) {
                                setSelectedParticipantId("");
                                setActiveSpeakerUserId(participant.userId);
                                setActiveParticipantId(participant.userId);
                                setParticipantPresentationById((prev) => ({
                                  ...prev,
                                  [participant.userId]: "compact",
                                }));
                                openSeatRequestSheet(participant.userId);
                                return;
                              }
                              if (canModerateParticipant) {
                                setSelectedParticipantId("");
                              }
                            } else {
                              debugLiveStage("request mic", { userId: participant.userId });
                              if (isCurrentUser && canRequestSeat(participantState) && !isRequesting) {
                                requestStageSeat(participant.userId).catch(() => {});
                              }
                            }
                            setActiveSpeakerUserId(participant.userId);
                            setActiveParticipantId(participant.userId);
                            setParticipantPresentationById((prev) => ({
                              ...prev,
                              [participant.userId]: (prev[participant.userId] ?? "compact") === "expanded" ? "compact" : "expanded",
                            }));
                            if (!isHost || !canModerateParticipant) {
                              setSelectedParticipantId(participant.userId);
                            }
                          }}
                          onLongPress={() => {
                            setFeaturedParticipantById((prev) => ({
                              ...prev,
                              [participant.userId]: !prev[participant.userId],
                            }));
                          }}
                          delayLongPress={220}
                        >
                          {isHost && isActiveParticipant && canModerateParticipant ? (
                            <View style={[styles.stageParticipantActionMenu, styles.stageParticipantActionMenuGrid]}>
                              {isRequesting ? (
                                <>
                                  <TouchableOpacity
                                    style={[styles.stageParticipantActionBtn, isParticipantActionBusy && styles.stageParticipantActionBtnBusy]}
                                    activeOpacity={0.82}
                                    disabled={isParticipantActionBusy}
                                    onPress={(event) => {
                                      event.stopPropagation();
                                      void runStageParticipantAction(participant.userId, async () => {
                                        if (!canAddSpeakerSeat(participant.userId)) {
                                          collapseHostParticipantControlsAfterFailure(participant.userId);
                                          Alert.alert(
                                            "Speaker seats full",
                                            `Live rooms allow up to ${LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS} active speaker seats. Move someone to audience before approving another speaker.`,
                                          );
                                          return;
                                        }
                                        const seatPersisted = await emitParticipantUpdate(participant.userId, { role: "speaker" });
                                        if (!seatPersisted) {
                                          collapseHostParticipantControlsAfterFailure(participant.userId);
                                          Alert.alert("Seat update unavailable", "The camera seat could not be saved yet. Try approving the seat again.");
                                          await refreshStageSnapshot(myUserId).catch(() => null);
                                          return;
                                        }
                                        setParticipantStateById((prev) => ({
                                          ...prev,
                                          [participant.userId]: {
                                            ...(prev[participant.userId] ?? participantState),
                                            role: "speaker",
                                          },
                                        }));
                                        setSeatRequestsById((prev) => {
                                          if (!prev[participant.userId]) return prev;
                                          const next = { ...prev };
                                          delete next[participant.userId];
                                          return next;
                                        });
                                        broadcastSeatState(participant.userId, {
                                          role: "speaker",
                                          isMuted,
                                          pending: false,
                                        });
                                        collapseHostParticipantControls(participant.userId);
                                      });
                                    }}
                                  >
                                    <Text style={styles.stageParticipantActionText}>{isParticipantActionBusy ? "Saving..." : "Approve Seat"}</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={styles.stageParticipantActionBtn}
                                    activeOpacity={0.82}
                                    onPress={(event) => {
                                      event.stopPropagation();
                                      setSeatRequestsById((prev) => {
                                        if (!prev[participant.userId]) return prev;
                                        const next = { ...prev };
                                        delete next[participant.userId];
                                        return next;
                                      });
                                      broadcastSeatRequest(participant.userId, false);
                                      collapseHostParticipantControls(participant.userId);
                                    }}
                                  >
                                    <Text style={styles.stageParticipantActionText}>Not now</Text>
                                  </TouchableOpacity>
                                </>
                              ) : null}
                              <TouchableOpacity
                                style={[styles.stageParticipantActionBtn, isParticipantActionBusy && styles.stageParticipantActionBtnBusy]}
                                activeOpacity={0.82}
                                disabled={isParticipantActionBusy}
                                onPress={(event) => {
                                  event.stopPropagation();
                                  void runStageParticipantAction(participant.userId, async () => {
                                    if (!isSpeakerRole && !canAddSpeakerSeat(participant.userId)) {
                                      collapseHostParticipantControlsAfterFailure(participant.userId);
                                      Alert.alert(
                                        "Speaker seats full",
                                        `Live rooms allow up to ${LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS} active speaker seats. Move someone to audience before seating another speaker.`,
                                      );
                                      return;
                                    }
                                    const mutePersisted = await emitParticipantUpdate(participant.userId, { isMuted: !isMuted });
                                    if (!mutePersisted) {
                                      collapseHostParticipantControlsAfterFailure(participant.userId);
                                      Alert.alert("Seat update unavailable", "The mute change could not be saved yet. Try again in a moment.");
                                      await refreshStageSnapshot(myUserId).catch(() => null);
                                      return;
                                    }
                                    const nextMuted = participantState.role === "host" ? isMuted : !isMuted;
                                    setParticipantStateById((prev) => {
                                      const current = prev[participant.userId] ?? {
                                        isMuted: !!participant.isMuted,
                                        role: participant.role === "host" ? "host" : participant.isSpeaking ? "speaker" : "listener",
                                        isRemoved: false,
                                      };
                                      return {
                                        ...prev,
                                        [participant.userId]: {
                                          ...current,
                                          isMuted: nextMuted,
                                        },
                                      };
                                    });
                                    broadcastSeatState(participant.userId, {
                                      role: participantState.role,
                                      isMuted: nextMuted,
                                      pending: false,
                                    });
                                    collapseHostParticipantControls(participant.userId);
                                  });
                                }}
                              >
                                <Text style={styles.stageParticipantActionText}>{isMuted ? "Unmute" : "Mute"}</Text>
                                {isParticipantActionBusy ? (
                                  <Text style={styles.stageParticipantActionStatusText}>Saving...</Text>
                                ) : null}
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.stageParticipantActionBtn, isParticipantActionBusy && styles.stageParticipantActionBtnBusy]}
                                activeOpacity={0.82}
                                disabled={isParticipantActionBusy}
                                onPress={(event) => {
                                  event.stopPropagation();
                                  void runStageParticipantAction(participant.userId, async () => {
                                    if (!isSpeakerRole && !canAddSpeakerSeat(participant.userId)) {
                                      collapseHostParticipantControlsAfterFailure(participant.userId);
                                      Alert.alert(
                                        "Speaker seats full",
                                        `Live rooms allow up to ${LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS} active speaker seats. Move someone to audience before seating another speaker.`,
                                      );
                                      return;
                                    }
                                    const nextRole = isSpeakerRole ? "listener" : "speaker";
                                    const seatPersisted = await emitParticipantUpdate(participant.userId, { role: nextRole });
                                    if (!seatPersisted) {
                                      collapseHostParticipantControlsAfterFailure(participant.userId);
                                      Alert.alert("Seat update unavailable", "The seat change could not be saved yet. Try again in a moment.");
                                      await refreshStageSnapshot(myUserId).catch(() => null);
                                      return;
                                    }
                                    setParticipantStateById((prev) => {
                                      const current = prev[participant.userId] ?? {
                                        isMuted: !!participant.isMuted,
                                        role: participant.role === "host" ? "host" : participant.isSpeaking ? "speaker" : "listener",
                                        isRemoved: false,
                                      };
                                      return {
                                        ...prev,
                                        [participant.userId]: {
                                          ...current,
                                          role: current.role === "host" ? "host" : nextRole,
                                        },
                                      };
                                    });
                                    broadcastSeatState(participant.userId, {
                                      role: nextRole,
                                      isMuted,
                                      pending: false,
                                    });
                                    setSeatRequestsById((prev) => {
                                      if (!prev[participant.userId]) return prev;
                                      const next = { ...prev };
                                      delete next[participant.userId];
                                      return next;
                                    });
                                    collapseHostParticipantControls(participant.userId);
                                  });
                                }}
                              >
                                <Text style={styles.stageParticipantActionText}>{isParticipantActionBusy ? "Saving..." : isSpeakerRole ? "Move to Audience" : "Seat Participant"}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.stageParticipantActionBtn, styles.stageParticipantActionBtnDanger, isParticipantActionBusy && styles.stageParticipantActionBtnBusy]}
                                activeOpacity={0.82}
                                disabled={isParticipantActionBusy}
                                onPress={(event) => {
                                  event.stopPropagation();
                                  void runStageParticipantAction(participant.userId, async () => {
                                    const removePersisted = await emitParticipantUpdate(participant.userId, { isRemoved: !isRemoved });
                                    if (!removePersisted) {
                                      collapseHostParticipantControlsAfterFailure(participant.userId);
                                      Alert.alert("Seat update unavailable", "The participant change could not be saved yet. Try again in a moment.");
                                      await refreshStageSnapshot(myUserId).catch(() => null);
                                      return;
                                    }
                                    setParticipantStateById((prev) => {
                                      const current = prev[participant.userId] ?? {
                                        isMuted: !!participant.isMuted,
                                        role: participant.role === "host" ? "host" : participant.isSpeaking ? "speaker" : "listener",
                                        isRemoved: false,
                                      };
                                      return {
                                        ...prev,
                                        [participant.userId]: {
                                          ...current,
                                          isRemoved: current.role === "host" ? current.isRemoved : !current.isRemoved,
                                        },
                                      };
                                    });
                                    broadcastSeatState(participant.userId, {
                                      role: participantState.role,
                                      isMuted,
                                      isRemoved: !isRemoved,
                                      pending: false,
                                    });
                                    setSeatRequestsById((prev) => {
                                      if (!prev[participant.userId]) return prev;
                                      const next = { ...prev };
                                      delete next[participant.userId];
                                      return next;
                                    });
                                    collapseHostParticipantControls(participant.userId);
                                  });
                                }}
                              >
                                <Text style={[styles.stageParticipantActionText, styles.stageParticipantActionTextDanger]}>
                                  {isParticipantActionBusy ? "Saving..." : isRemoved ? "Restore" : "Remove"}
                                </Text>
                              </TouchableOpacity>
                            </View>
                          ) : null}
                          <View style={[styles.stagePresenceTapWrap, styles.stagePresenceTapWrapGrid]}>
                            <Animated.View
                              style={[
                                styles.stagePresenceBubble,
                                styles.stagePresenceBubbleGrid,
                                soloTile && styles.stagePresenceBubbleSoloGrid,
                                isExpanded && styles.stagePresenceBubbleExpandedGrid,
                                isFeatured && styles.stagePresenceBubbleFeaturedGrid,
                              ]}
                            >
                              {isHostBubble ? (
                                <View style={styles.stagePresenceHostBadge}>
                                  <Text style={styles.stagePresenceHostBadgeText}>Host</Text>
                                </View>
                              ) : null}
                              {(shouldUseHybridLiveKitVideo || showLocalRtcPreview || bubbleMediaUri) ? (
                                <View
                                  style={[
                                    styles.stagePresenceFaceClip,
                                    styles.stagePresenceFaceClipGrid,
                                    soloTile && styles.stagePresenceFaceClipSoloGrid,
                                    isExpanded && styles.stagePresenceFaceClipExpandedGrid,
                                    isFeatured && styles.stagePresenceFaceClipFeaturedGrid,
                                  ]}
                                >
                                  {shouldUseHybridLiveKitVideo ? (
                                    <LiveKitHybridParticipantVideo
                                      participantId={participant.userId}
                                      remoteTrackIndex={communityCardParticipantIndexById[participant.userId] ?? 0}
                                      fallback={bubbleMediaUri ? (
                                        <Image
                                          source={{ uri: bubbleMediaUri }}
                                          style={[
                                            styles.stagePresenceImage,
                                            styles.stagePresenceImageGrid,
                                            soloTile && styles.stagePresenceImageSoloGrid,
                                            isExpanded && styles.stagePresenceImageExpandedGrid,
                                            isFeatured && styles.stagePresenceImageFeaturedGrid,
                                          ]}
                                        />
                                      ) : (
                                        <View style={styles.stagePresenceFallbackFill}>
                                          <Text
                                            style={[
                                              styles.stagePresenceInitial,
                                              styles.stagePresenceInitialGrid,
                                              soloTile && styles.stagePresenceInitialSoloGrid,
                                              isExpanded && styles.stagePresenceInitialExpandedGrid,
                                              isFeatured && styles.stagePresenceInitialFeaturedGrid,
                                            ]}
                                          >
                                            {participantDisplayName.slice(0, 1).toUpperCase()}
                                          </Text>
                                        </View>
                                      )}
                                    />
                                  ) : showLocalRtcPreview && RTCView ? (
                                    <RTCView
                                      streamURL={localStreamURL as string}
                                      style={styles.stagePresenceCameraFill}
                                      objectFit="cover"
                                      mirror
                                    />
                                  ) : showRemoteLiveVideo && RTCView ? (
                                    <RTCView
                                      streamURL={mediaParticipant.streamURL as string}
                                      style={styles.stagePresenceCameraFill}
                                      objectFit="cover"
                                      mirror={false}
                                    />
                                  ) : (
                                    <Image
                                      source={{ uri: bubbleMediaUri }}
                                      style={[
                                        styles.stagePresenceImage,
                                        styles.stagePresenceImageGrid,
                                        soloTile && styles.stagePresenceImageSoloGrid,
                                        isExpanded && styles.stagePresenceImageExpandedGrid,
                                        isFeatured && styles.stagePresenceImageFeaturedGrid,
                                      ]}
                                    />
                                  )}
                                </View>
                              ) : (
                                <Text
                                  style={[
                                    styles.stagePresenceInitial,
                                    styles.stagePresenceInitialGrid,
                                    soloTile && styles.stagePresenceInitialSoloGrid,
                                    isExpanded && styles.stagePresenceInitialExpandedGrid,
                                    isFeatured && styles.stagePresenceInitialFeaturedGrid,
                                  ]}
                                >
                                  {participantDisplayName.slice(0, 1).toUpperCase()}
                                </Text>
                              )}
                              <View
                                style={[
                                  styles.stagePresenceOnlineDot,
                                  isLiveParticipant && !isMuted ? styles.stagePresenceOnlineDotLive : styles.stagePresenceOnlineDotIdle,
                                ]}
                              />
                              {isMuted ? <Text style={styles.stagePresenceMutedIcon}>Muted</Text> : null}
                            </Animated.View>
                          </View>
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.stageParticipantName,
                              styles.stageParticipantNameGrid,
                              soloTile && styles.stageParticipantNameSoloGrid,
                              isExpanded && styles.stageParticipantNameExpandedGrid,
                              isFeatured && styles.stageParticipantNameFeaturedGrid,
                            ]}
                          >
                            {participantDisplayName}
                          </Text>
                          <Text style={[styles.stageParticipantRole, styles.stageParticipantRoleGrid]}>
                            {isMuted && !isRemoved ? `${roleLabel} · Muted` : roleLabel}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    {Array.from({ length: LIVE_STAGE_REMOTE_GRID_COLUMNS - participantRow.length }).map((_, spacerIndex) => (
                      <View key={`community-spacer-${spacerIndex}`} style={styles.stageHybridCommunitySpacer} />
                    ))}
                  </View>
                )}
              />
            ) : (
              <View style={styles.stageCommunityEmptyState}>
                <Text style={styles.stageCommunityEmptyText}>No other live feeds in view yet.</Text>
              </View>
            )}
          </View>
        </View>
        ) : null}
        {renderStageOverlayUtilitySheets()}
        {renderStageLowerDock()}
        </Animated.View>
        ) : null}
        </>
        </ConditionalWrap>
        ) : null}
      </View>

      {!isLiveRoomSurface ? (
        <View
          pointerEvents="box-none"
          style={[styles.stageNotificationPortal, { top: safeAreaInsets.top + 50 }]}
        >
          <NotificationBellButton
            surface="live-stage"
            roomSafe
            style={styles.stagePortalNotificationBell}
          />
        </View>
      ) : null}

      <ParticipantDetailSheet
        visible={!!selectedParticipant}
        participant={selectedParticipant}
        participantState={selectedParticipantState}
        isFeatured={!!(selectedParticipant && featuredParticipantById[selectedParticipant.userId])}
        isRequesting={!!(selectedParticipant && seatRequestsById[selectedParticipant.userId])}
        canShowProfileAction={canShowProfileAction}
        canShowFollowAction={selectedParticipantFollowAction.canRender}
        followActionLabel={selectedParticipantFollowAction.label}
        followActionBusy={selectedParticipantFollowAction.busy}
        onToggleFollow={selectedParticipantFollowAction.toggle}
        safeAreaBottom={safeAreaInsets.bottom}
        onClose={closeParticipantModal}
        onReportParticipant={selectedParticipantUserId ? () => {
          trackModerationActionUsed({
            surface: "live-stage",
            action: "open_safety_report",
            targetType: "participant",
            targetId: selectedParticipantUserId,
            roomId: partyId,
            titleId: room?.titleId ?? null,
            sourceRoute: `/watch-party/live-stage/${partyId}`,
          });
          setReportTarget({
            userId: selectedParticipantUserId,
            label: selectedParticipant?.displayName || "Participant",
          });
          setReportVisible(true);
        } : undefined}
        onViewProfile={canShowProfileAction ? () => {
          if (!selectedParticipant || !selectedParticipantUserId) return;
          closeParticipantModal();
          router.push({
            pathname: "/profile/[userId]",
            params: buildParticipantProfileParams({
              userId: selectedParticipantUserId,
              displayName: selectedParticipant.displayName,
              role: selectedParticipant.role,
              isLive: selectedParticipant.isLive,
              partyId,
              mode: stageMode,
              source,
              avatarUrl: selectedParticipant.avatarUrl,
            }),
          });
        } : undefined}
      />

      <ReportSheet
        visible={reportVisible}
        title="Report live participant"
        description={`Send a safety report for ${reportTarget?.label || "this participant"}.`}
        busy={reportBusy}
        onSubmit={async (input) => {
          if (!reportTarget) return;
          setReportBusy(true);
          try {
            await submitSafetyReport({
              targetType: "participant",
              targetId: reportTarget.userId,
              category: input.category,
              note: input.note,
              roomId: partyId,
              titleId: room?.titleId ?? null,
              context: buildSafetyReportContext({
                sourceSurface: "live-stage",
                sourceRoute: `/watch-party/live-stage/${partyId}`,
                targetLabel: reportTarget.label,
                targetRoleLabel: "Participant",
                context: {
                  label: reportTarget.label,
                  roomType: room?.roomType ?? null,
                },
              }),
            });
            setReportVisible(false);
            setReportTarget(null);
          } finally {
            setReportBusy(false);
          }
        }}
        onClose={() => {
          setReportVisible(false);
          setReportTarget(null);
        }}
      />
      {activeLiveAccessSheetGate && activeLiveAccessSheetReason ? (
        <AccessSheet
          visible={liveWatchPartyAccessSheetVisible}
          reason={activeLiveAccessSheetReason}
          gate={activeLiveAccessSheetGate}
          appDisplayName={branding.appDisplayName}
          premiumUpsellTitle={monetizationConfig.premiumUpsellTitle}
          premiumUpsellBody={monetizationConfig.premiumUpsellBody}
          kickerOverride={activeLiveAccessPresentation?.kicker}
          titleOverride={liveWatchPartyPremiumGate ? livePremiumGateCopy.title : activeLiveAccessPresentation?.title}
          bodyOverride={liveWatchPartyPremiumGate ? livePremiumGateCopy.message : activeLiveAccessPresentation?.body}
          actionLabelOverride={activeLiveAccessPresentation?.actionLabel}
          onPurchaseResult={(result) => {
            if (!result.ok) {
              return {
                message: result.message,
                tone: "error" as const,
              };
            }
            setLoading(true);
            setAccessRetryToken((value) => value + 1);
            return {
              message: "Premium access updated. Try Live Watch-Party again.",
              tone: "success" as const,
            };
          }}
          onRestoreResult={(result) => {
            if (!result.ok) {
              return {
                message: result.message,
                tone: "error" as const,
              };
            }
            setLoading(true);
            setAccessRetryToken((value) => value + 1);
            return {
              message: "Purchases restored. Try Live Watch-Party again.",
              tone: "success" as const,
            };
          }}
          onClose={() => setLiveWatchPartyAccessSheetVisible(false)}
        />
      ) : null}
      <InternalInviteSheet
        visible={inviteSheetVisible}
        sourceSurface="live-room"
        title="Invite people to this live room"
        body="Find a Chi'llywood member, send the live-room code inside Chi'lly Chat, or fall back to system share if you need to leave the app."
        inviteMessage={`Join me in a Chi'llywood live room.\n\nRoom code: ${liveRoomShareCode}\n\nOpen Chi'llywood -> Live Watch-Party -> enter the code to join the live room.`}
        suggestedTargets={inviteableLiveRoomParticipants}
        onClose={() => setInviteSheetVisible(false)}
        onInviteSent={(thread) => {
          router.push({
            pathname: "/chat/[threadId]",
            params: { threadId: thread.threadId },
          });
        }}
        onSystemShareFallback={() => {
          void onSystemShareLiveRoom();
        }}
      />
      <SocialAttachmentActionSheet
        visible={hybridCommentAttachmentSheetVisible}
        kicker="LIVE COMMENT ATTACHMENT"
        title="Add to live comment"
        body="Photos and files attach to this live-room comment and follow the existing room attachment rules."
        onSelect={onSelectHybridCommentAttachment}
        onClose={() => setHybridCommentAttachmentSheetVisible(false)}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  outerFlex: { flex: 1 },
  fullBackground: { ...StyleSheet.absoluteFillObject },
  fullBackgroundFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: "#0B0B10" },
  fullBackgroundOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(8,8,12,0.56)" },
  motionLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(38,60,102,0.22)",
  },
  vignetteLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.2)",
    borderColor: "rgba(0,0,0,0.08)",
    borderWidth: 1,
  },
  depthOverlayTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: "rgba(0,0,0,0.14)",
  },
  depthOverlayBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 190,
    backgroundColor: "rgba(0,0,0,0.3)",
  },
  screen: { flex: 1, backgroundColor: "transparent", paddingTop: 56, paddingBottom: 18, paddingHorizontal: 10 },
  center: { flex: 1, backgroundColor: "#050505", alignItems: "center", justifyContent: "center" },
  loadingText: { color: "#888", marginTop: 14, fontSize: 14 },
  routeGateCard: {
    width: "88%",
    maxWidth: 460,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(168,192,245,0.2)",
    backgroundColor: "rgba(8,12,20,0.96)",
    paddingHorizontal: 24,
    paddingVertical: 24,
    gap: 14,
    shadowColor: "#000",
    shadowOpacity: 0.32,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 18,
  },
  routeGateTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "800",
  },
  routeGateBody: {
    color: "rgba(232,236,242,0.82)",
    fontSize: 14,
    lineHeight: 20,
  },
  routeGateActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  routeGatePrimaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    backgroundColor: "#DC143C",
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  routeGatePrimaryText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "800",
  },
  routeGateSecondaryButton: {
    flex: 1,
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  routeGateSecondaryText: {
    color: "#F2F4F8",
    fontSize: 14,
    fontWeight: "700",
  },
  liveRoomSurface: { flex: 1 },
  liveRoomSurfaceScroll: { flex: 1 },
  liveRoomSurfaceContent: { paddingBottom: 20 },
  liveRoomFooter: {
    paddingTop: 8,
    paddingHorizontal: 2,
    backgroundColor: "rgba(6,8,14,0.88)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
    position: "relative",
    zIndex: 14,
    elevation: 14,
  },
  stageHudTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 7 },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.24)",
    paddingHorizontal: 3,
    paddingVertical: 3,
    gap: 5,
  },
  liveBadgeGlow: {
    position: "absolute",
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.62)",
  },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#DC143C" },
  livePillText: { color: "#F5D9DE", fontSize: 11, fontWeight: "900", letterSpacing: 0.4 },
  liveTimer: { color: "#E0E0E0", fontSize: 11, fontWeight: "800" },
  viewersPill: {
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.24)",
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  viewersText: { color: "#E8E8E8", fontSize: 11, fontWeight: "900" },

  liveRoomShellCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(8,10,16,0.78)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
    marginBottom: 10,
  },
  liveRoomShellKicker: { color: "#F3A6B7", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  liveRoomShellTitle: { color: "#F6F7FB", fontSize: 19, fontWeight: "900", lineHeight: 24 },
  liveRoomShellBody: { color: "#C6CDDA", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  liveRoomMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  liveRoomMetaPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 2,
  },
  liveRoomMetaLabel: { color: "#8E99B0", fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  liveRoomMetaValue: { color: "#F4F7FF", fontSize: 12, fontWeight: "800" },
  liveRoomPermissionText: { color: "#AEB9CC", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  liveRoomControlCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(138,178,255,0.18)",
    backgroundColor: "rgba(10,14,24,0.78)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    marginBottom: 8,
  },
  liveRoomControlCardSubtle: {
    borderColor: "rgba(138,178,255,0.12)",
    backgroundColor: "rgba(9,12,20,0.62)",
  },
  liveRoomControlKicker: { color: "#9DB8FF", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  liveRoomControlTitle: { color: "#F5F8FF", fontSize: 16, fontWeight: "900", lineHeight: 21 },
  liveRoomControlBody: { color: "#C6D0E2", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  liveRoomSupportSection: {
    gap: 4,
    marginTop: 4,
  },
  liveRoomSupportSectionLabel: {
    color: "#7F8BA5",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
    paddingHorizontal: 2,
  },
  liveRoomShareRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  liveRoomShareCodePill: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  liveRoomShareCodeText: { color: "#F4F7FF", fontSize: 13, fontWeight: "900", letterSpacing: 1 },
  liveRoomShareButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.48)",
    backgroundColor: "rgba(220,20,60,0.18)",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  liveRoomShareButtonText: { color: "#FFF5F7", fontSize: 12, fontWeight: "900" },
  liveRoomActionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  liveRoomActionBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(138,178,255,0.22)",
    backgroundColor: "rgba(19,28,46,0.8)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  liveRoomActionBtnActive: {
    borderColor: "rgba(220,20,60,0.3)",
    backgroundColor: "rgba(220,20,60,0.16)",
  },
  liveRoomActionBtnDisabled: {
    opacity: 0.45,
  },
  liveRoomActionBtnGhost: {
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  liveRoomActionText: { color: "#EEF2FF", fontSize: 12, fontWeight: "800" },
  liveRoomActionTextActive: { color: "#FFF5F7" },
  liveRoomActionTextGhost: { color: "#C5CCDA" },
  liveRoomHelperCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.24)",
    backgroundColor: "rgba(220,20,60,0.12)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  liveRoomHelperKicker: { color: "#F8D7DE", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  liveRoomHelperBody: { color: "#F6F7FB", fontSize: 12.5, lineHeight: 18, fontWeight: "700" },
  stageSurfaceHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  stageSurfaceHeaderCopy: {
    flex: 1,
    gap: 3,
  },
  stageSurfaceKicker: { color: "#DDE6FB", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  stageSurfaceBody: { color: "#B8C2D8", fontSize: 11.5, lineHeight: 17, fontWeight: "600" },
  stageTopChrome: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 32,
    elevation: 32,
    gap: 10,
  },
  stageTopChromeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  stageTopChromeActions: {
    position: "relative",
    alignItems: "flex-end",
    gap: 8,
    zIndex: 34,
    elevation: 34,
  },
  stageTopNotificationBell: {
    zIndex: 35,
    elevation: 35,
  },
  stageNotificationPortal: {
    position: "absolute",
    right: 14,
    zIndex: 90,
    elevation: 90,
    alignItems: "flex-end",
  },
  stagePortalNotificationBell: {
    zIndex: 91,
    elevation: 91,
  },
  stageTopChromeCopy: {
    flex: 1,
    gap: 4,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(6,10,18,0.42)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingRight: 10,
  },
  stageTopChromeTitle: {
    color: "#F6F8FF",
    fontSize: 15,
    lineHeight: 18,
    fontWeight: "900",
  },
  stageTopChromeBody: {
    color: "#CBD5E8",
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "700",
  },
  stageTopChromeLookRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  stageTopChromeLookPill: {
    maxWidth: "100%",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(184,206,246,0.2)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  stageTopChromeLookPillText: {
    color: "#E6EEFF",
    fontSize: 9.5,
    fontWeight: "800",
  },
  stageTopMenuButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(9,12,20,0.68)",
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  stageTopMenuButtonActive: {
    borderColor: "rgba(172,196,255,0.42)",
    backgroundColor: "rgba(54,82,148,0.52)",
  },
  stageTopMenuButtonText: {
    color: "#F4F7FF",
    fontSize: 11,
    fontWeight: "800",
  },
  stageSurfaceBackButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(9,12,20,0.76)",
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  stageSurfaceBackText: { color: "#E7EEFF", fontSize: 11, fontWeight: "800" },
  stageSectionIntro: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(8,10,16,0.54)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 4,
    marginBottom: 8,
  },
  stageSectionKicker: { color: "#A5B0C6", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  stageSectionBody: { color: "#C5CCDA", fontSize: 12, lineHeight: 17, fontWeight: "600" },
  stageSectionActionRow: { flexDirection: "row", justifyContent: "flex-start" },
  liveRoomPrimaryButton: {
    marginTop: 4,
    marginBottom: 10,
    borderRadius: 16,
    backgroundColor: "#DC143C",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#DC143C",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 16,
  },
  liveRoomPrimaryButtonText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900", letterSpacing: 0.3 },
  stageModeCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(138,178,255,0.18)",
    backgroundColor: "rgba(10,14,24,0.8)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
    marginBottom: 8,
  },
  stageModeCardKicker: { color: "#9DB8FF", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  stageModeCardTitle: { color: "#F5F8FF", fontSize: 18, fontWeight: "900", lineHeight: 23 },
  stageModeCardBody: { color: "#C6D0E2", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  stageModeHelperText: { color: "#EFF4FF", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  stageModeMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stageModeMetaPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 2,
  },
  stageModeMetaLabel: { color: "#8E9DBA", fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  stageModeMetaValue: { color: "#F4F7FF", fontSize: 12, fontWeight: "800" },
  stageModeActionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stageModeActionBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(138,178,255,0.22)",
    backgroundColor: "rgba(16,28,51,0.82)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  stageModeActionBtnActive: {
    borderColor: "rgba(220,20,60,0.3)",
    backgroundColor: "rgba(220,20,60,0.16)",
  },
  stageModeActionBtnDisabled: {
    opacity: 0.45,
  },
  stageModeActionText: { color: "#EEF2FF", fontSize: 12, fontWeight: "800" },
  stageModeActionTextActive: { color: "#FFF5F7" },
  stageUtilitySheet: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(154,182,246,0.24)",
    backgroundColor: "rgba(6,10,18,0.92)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 24,
  },
  stageUtilityHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  stageUtilityHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  stageUtilityKicker: { color: "#9DB8FF", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  stageUtilityTitle: { color: "#F5F8FF", fontSize: 16, fontWeight: "900", lineHeight: 21 },
  stageUtilityDismissBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stageUtilityDismissText: { color: "#DCE4F5", fontSize: 11, fontWeight: "800" },
  stageUtilityBody: { color: "#C6D0E2", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  stageUtilityHelper: { color: "#EFF4FF", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  stageUtilityMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stageUtilityMetaPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 2,
  },
  stageUtilityMetaLabel: { color: "#8E9DBA", fontSize: 10, fontWeight: "800", textTransform: "uppercase" },
  stageUtilityMetaValue: { color: "#F4F7FF", fontSize: 12, fontWeight: "800" },
  stageUtilityActionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stageUtilityActionBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(138,178,255,0.22)",
    backgroundColor: "rgba(16,28,51,0.82)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  stageUtilityActionBtnGhost: {
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  stageUtilityActionBtnDisabled: {
    opacity: 0.45,
  },
  stageUtilityActionText: { color: "#EEF2FF", fontSize: 12, fontWeight: "800" },
  stageUtilityActionTextGhost: { color: "#DCE4F5" },
  stageUtilityStatusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stageUtilityStatusCopy: {
    flex: 1,
    gap: 4,
  },
  stageUtilityStatusLabel: { color: "#E5ECFA", fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
  stageUtilityStatusBody: { color: "#AEB9CF", fontSize: 11.5, lineHeight: 16, fontWeight: "600" },
  stageUtilityStatusPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(7,12,22,0.7)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  stageUtilityStatusValue: { color: "#F4F7FF", fontSize: 11, fontWeight: "800" },
  stageFilterRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stageFilterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  stageFilterChipActive: {
    borderColor: "rgba(138,178,255,0.44)",
    backgroundColor: "rgba(34,52,92,0.86)",
  },
  stageFilterChipText: { color: "#DCE4F5", fontSize: 12, fontWeight: "700" },
  stageFilterChipTextActive: { color: "#F5F8FF" },

  modeRow: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 0,
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(6,10,18,0.56)",
    padding: 2,
  },
  modeRowHybrid: {
    alignSelf: "stretch",
    justifyContent: "center",
  },
  modeBtn: {
    borderRadius: 999,
    backgroundColor: "transparent",
    paddingVertical: 5,
    paddingHorizontal: 13,
    alignItems: "center",
  },
  modeBtnOn: {
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  modeBtnDisabled: {
    opacity: 0.62,
  },
  modeBtnText: { color: "#C8C8C8", fontSize: 11.5, fontWeight: "800" },
  modeBtnTextOn: { color: "#fff" },
  modeBtnTextDisabled: { color: "#8B93A6" },

  stageCanvas: {
    flex: 1,
    minHeight: 470,
    borderRadius: 0,
    backgroundColor: "transparent",
    padding: 0,
    overflow: "hidden",
  },
  stageCanvasFullBleed: {
    marginHorizontal: -10,
  },
  stageCanvasHybrid: {
    minHeight: 470,
  },
  stageHeroMediaFill: {
    ...StyleSheet.absoluteFillObject,
  },
  stageHeroFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8,12,20,0.92)",
  },
  stageHeroFallbackInitial: {
    color: "#F4F7FF",
    fontSize: 76,
    fontWeight: "900",
    letterSpacing: 1,
  },
  stageHeroFallbackTitle: {
    color: "#F4F7FF",
    fontSize: 22,
    fontWeight: "900",
    textAlign: "center",
  },
  stageHeroFallbackBody: {
    marginTop: 12,
    color: "#C9D4E9",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
    maxWidth: 300,
    textAlign: "center",
  },
  hybridLiveKitStatusPill: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: "rgba(7,12,24,0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
  },
  hybridLiveKitStatusText: {
    color: "#F4F7FF",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  stageHybridHeroSecondaryWrap: {
    position: "absolute",
    right: 14,
    bottom: 18,
    width: 96,
    height: 136,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(168,192,245,0.24)",
    backgroundColor: "rgba(5,7,14,0.9)",
    shadowColor: "#000000",
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  stageHybridHeroSecondaryVideo: {
    width: "100%",
    height: "100%",
  },
  stageHeroOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    paddingHorizontal: 8,
    paddingBottom: 14,
    backgroundColor: "rgba(0,0,0,0.08)",
  },
  stageTapRevealSurface: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 31,
    elevation: 31,
    justifyContent: "flex-end",
    paddingHorizontal: 8,
    paddingBottom: 14,
    backgroundColor: "rgba(4,8,18,0.01)",
  },
  stageTapRevealSurfaceHybrid: {
    left: -10,
    right: -10,
    paddingHorizontal: 18,
    backgroundColor: "transparent",
  },
  stageTapRevealContent: {
    alignSelf: "stretch",
    gap: 10,
  },
  stageHeroFilterOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
  },
  stageSourceCard: {
    position: "absolute",
    left: 14,
    right: 14,
    top: 88,
    zIndex: 32,
    elevation: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(126,215,255,0.24)",
    backgroundColor: "rgba(5,10,20,0.72)",
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 4,
  },
  stageSourceKicker: {
    color: "#7ED7FF",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1,
  },
  stageSourceTitle: {
    color: "#F4F7FF",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
  },
  stageSourceBody: {
    color: "#AAB5CA",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "800",
  },
  stageSeatRequestSheetWrap: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 42,
    elevation: 42,
  },
  stageSeatRequestSheet: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(166,200,255,0.28)",
    backgroundColor: "rgba(6,10,18,0.94)",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.32,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 14 },
  },
  stageSeatRequestHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stageSeatRequestTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  stageSeatRequestKicker: {
    color: "#9DB7F8",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
  },
  stageSeatRequestTitle: {
    color: "#F7FAFF",
    fontSize: 18,
    fontWeight: "900",
  },
  stageSeatRequestCloseButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  stageSeatRequestBody: {
    color: "#B9C6DD",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "700",
  },
  stageSeatRequestActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  stageSeatRequestPrimaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 16,
    backgroundColor: "#A7F3D0",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 13,
  },
  stageSeatRequestPrimaryText: {
    color: "#07110D",
    fontSize: 13,
    fontWeight: "900",
  },
  stageSeatRequestSecondaryButton: {
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  stageSeatRequestSecondaryText: {
    color: "#E8EEFB",
    fontSize: 13,
    fontWeight: "800",
  },
  stageHybridDeck: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 31,
    elevation: 31,
    flexDirection: "row",
    alignItems: "stretch",
    justifyContent: "flex-end",
    gap: 12,
  },
  stageHybridHeroCard: {
    flex: 1,
    minHeight: 248,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(172,196,255,0.26)",
    backgroundColor: "rgba(4,8,18,0.22)",
    overflow: "hidden",
    justifyContent: "flex-end",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
  },
  stageHybridHeroGlow: {
    position: "absolute",
    top: -32,
    left: -24,
    width: 140,
    height: 140,
    borderRadius: 999,
    backgroundColor: "rgba(120,156,245,0.18)",
  },
  stageHybridHeroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,8,18,0.28)",
  },
  stageHybridHeroCopy: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 10,
  },
  stageHybridHeroTitle: {
    color: "#F6F8FF",
    fontSize: 22,
    lineHeight: 26,
    fontWeight: "900",
  },
  stageHybridHeroBody: {
    color: "#D6E0F4",
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: "700",
    maxWidth: "88%",
  },
  stageHybridHeroMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  stageHybridCommunityCard: {
    width: 318,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(168,192,245,0.24)",
    backgroundColor: "rgba(6,10,18,0.62)",
    paddingHorizontal: 13,
    paddingVertical: 13,
    gap: 11,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  stageLiveFirstCommunityCard: {
    backgroundColor: "rgba(6,10,18,0.66)",
  },
  stageHybridCommunityScroll: {
    maxHeight: 388,
  },
  stageHybridCommunityGrid: {
    gap: 9,
    paddingBottom: 4,
  },
  stageHybridCommunityRow: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    gap: LIVE_STAGE_REMOTE_GRID_GAP,
  },
  stageHybridCommunitySpacer: {
    width: "31.5%",
    minHeight: LIVE_STAGE_REMOTE_GRID_TILE_MIN_HEIGHT,
  },
  stageHeroTagRow: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(164,190,255,0.34)",
    backgroundColor: "rgba(8,14,24,0.46)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  stageHeroLiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#8AB2FF",
  },
  stageHeroTagText: {
    color: "#E6EEFF",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.45,
  },
  stageHeroCaption: {
    alignSelf: "flex-start",
    marginTop: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(6,10,18,0.42)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
    maxWidth: "78%",
  },
  stageHeroCaptionTitle: {
    color: "#F4F7FF",
    fontSize: 13,
    fontWeight: "900",
  },
  stageHeroCaptionBody: {
    color: "#CBD5E8",
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "600",
  },
  selfFloatingTile: {
    position: "absolute",
    right: 12,
    top: 14,
    width: 96,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(0,0,0,0.46)",
    padding: 5,
    gap: 4,
  },
  selfMiniBubble: {
    position: "absolute",
    right: 12,
    top: 14,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
    backgroundColor: "rgba(0,0,0,0.74)",
    alignItems: "center",
    justifyContent: "center",
  },
  selfMiniBubblePressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
  selfMiniAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)" },
  selfMiniAvatarImage: { width: "100%", height: "100%", borderRadius: 999 },
  selfMiniAvatarText: { color: "#fff", fontSize: 16, fontWeight: "900" },
  selfMiniLiveDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.5)",
    backgroundColor: "#DC143C",
  },
  selfFloatingHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selfFloatingLabel: { color: "#F0F0F0", fontSize: 9.5, fontWeight: "900", flex: 1 },
  selfLiveBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(220,20,60,0.86)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginRight: 4,
  },
  selfLiveBadgeText: { color: "#fff", fontSize: 9, fontWeight: "900", letterSpacing: 0.4 },
  selfFloatingToggle: { color: "#fff", fontSize: 14, fontWeight: "900", paddingHorizontal: 4 },
  selfFloatingBody: { alignItems: "center", gap: 4 },
  selfFloatingTilePressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.92,
  },
  selfAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  selfAvatarText: { color: "#fff", fontSize: 20, fontWeight: "900" },
  selfAvatarImage: { width: "100%", height: "100%", borderRadius: 999 },
  selfSub: { color: "#D8D8D8", fontSize: 9.5, fontWeight: "700" },

  floatingReactionsLayer: {
    position: "absolute",
    right: 20,
    width: 104,
    height: 228,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  floatingReactionEmoji: {
    position: "absolute",
    bottom: 0,
    fontSize: 34,
    fontWeight: "900",
  },

  overlayBottom: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 30,
    elevation: 30,
    gap: 10,
  },
  stageOverlayPanelWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
  },
  stageDockOverlay: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 0,
    zIndex: 29,
    elevation: 29,
  },
  liveStageLowerDock: {
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(154,182,246,0.22)",
    backgroundColor: "rgba(6,10,18,0.62)",
    paddingHorizontal: 11,
    paddingTop: 11,
    paddingBottom: 9,
    gap: 9,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 12 },
    elevation: 18,
  },
  liveStageLowerDockHybrid: {
    paddingTop: 12,
    paddingBottom: 10,
  },
  stageParticipantStripWrap: {
    marginTop: 0,
    gap: 8,
  },
  stageBottomInfoCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(160,188,245,0.18)",
    backgroundColor: "rgba(7,12,22,0.44)",
    paddingHorizontal: 11,
    paddingVertical: 10,
    gap: 5,
  },
  stageBottomInfoHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  stageBottomInfoKicker: {
    color: "#AFC4F5",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  stageBottomInfoCount: {
    color: "#DDE6FB",
    fontSize: 10,
    fontWeight: "700",
  },
  stageBottomInfoTitle: {
    color: "#F4F7FF",
    fontSize: 13,
    fontWeight: "900",
  },
  stageBottomInfoBody: {
    color: "#C2CDE2",
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "600",
  },
  stageAudienceResponseCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(160,188,245,0.14)",
    backgroundColor: "rgba(7,12,22,0.3)",
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 6,
  },
  stageAudienceResponseText: {
    color: "#C2CDE2",
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "600",
  },
  stageTailoredCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(154,182,246,0.22)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
    marginBottom: 10,
  },
  stageTailoredKicker: {
    color: "#89A6DF",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  stageTailoredTitle: {
    color: "#F3F6FD",
    fontSize: 15,
    fontWeight: "900",
  },
  stageTailoredBody: {
    color: "#B4C1DC",
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: "600",
  },
  stageTailoredMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  stageTailoredMetaPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(7,12,22,0.7)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  stageTailoredMetaText: {
    color: "#E5ECFA",
    fontSize: 10.5,
    fontWeight: "700",
  },
  stageTailoredActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  stageTailoredActionButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(138,178,255,0.34)",
    backgroundColor: "rgba(24,42,76,0.84)",
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
  },
  stageTailoredActionButtonGhost: {
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  stageTailoredActionText: {
    color: "#E7EEFF",
    fontSize: 12,
    fontWeight: "800",
  },
  stageTailoredActionTextGhost: {
    color: "#DCE4F5",
  },
  stageCommunityHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  stageCommunityHeaderLeft: {
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  stageCommunityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#8AB2FF",
  },
  stageCommunityLabel: {
    color: "#DDE6FB",
    fontSize: 9.5,
    fontWeight: "800",
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  stageCommunityLabelHybrid: {
    color: "#E7EEFF",
    fontSize: 11,
    fontWeight: "800",
    flexShrink: 1,
  },
  stageCommunityCount: {
    color: "#C5D1E6",
    fontSize: 10,
    fontWeight: "700",
    flexShrink: 0,
    marginLeft: 12,
    textAlign: "right",
  },
  stageCommunityHint: {
    color: "#AEB9CF",
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "700",
    marginTop: -4,
  },
  stageSelfHeroToggle: {
    alignSelf: "stretch",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(142,178,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 11,
    paddingVertical: 8,
    gap: 2,
  },
  stageSelfHeroToggleActive: {
    borderColor: "rgba(167,243,208,0.42)",
    backgroundColor: "rgba(167,243,208,0.12)",
  },
  stageSelfHeroToggleText: {
    color: "#EEF4FF",
    fontSize: 11.5,
    fontWeight: "900",
  },
  stageSelfHeroToggleTextActive: {
    color: "#D7FFE9",
  },
  stageSelfHeroToggleHint: {
    color: "#9FACBF",
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: "700",
  },
  stageCommunityRequestButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(142,178,255,0.38)",
    backgroundColor: "rgba(106,146,255,0.16)",
    paddingHorizontal: 11,
    paddingVertical: 6,
    marginTop: -1,
  },
  stageCommunityRequestButtonDisabled: {
    borderColor: "rgba(170,184,210,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  stageCommunityRequestButtonText: {
    color: "#EEF4FF",
    fontSize: 10,
    fontWeight: "900",
  },
  stageCommunityRequestButtonTextDisabled: {
    color: "#9DA8BD",
  },
  stagePresenceScroll: { marginTop: 0, maxHeight: 112 },
  stagePresenceScrollContent: { flexDirection: "row", alignItems: "stretch", gap: 8, paddingRight: 8, paddingVertical: 2 },
  stageCommunityEmptyState: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(162,184,228,0.2)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  stageCommunityEmptyText: {
    color: "#AEB9CF",
    fontSize: 10,
    fontWeight: "700",
  },
  stageHybridCommentsCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(168,192,245,0.18)",
    backgroundColor: "rgba(6,10,18,0.76)",
    paddingHorizontal: 14,
    paddingTop: 13,
    paddingBottom: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  stageHybridCommentsCardActive: {
    borderColor: "rgba(186,208,255,0.28)",
    backgroundColor: "rgba(7,12,22,0.84)",
  },
  stageHybridCommentsHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  stageHybridCommentsTitle: {
    color: "#F4F7FF",
    fontSize: 13,
    fontWeight: "900",
  },
  stageHybridCommentsCount: {
    color: "#AFC0DE",
    fontSize: 11,
    fontWeight: "700",
  },
  stageHybridCommentsList: {
    maxHeight: 158,
  },
  stageHybridCommentsListContent: {
    gap: 8,
    paddingBottom: 2,
  },
  stageHybridCommentRow: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 11,
    paddingVertical: 9,
    gap: 4,
  },
  stageHybridCommentRowMe: {
    borderColor: "rgba(186,208,255,0.18)",
    backgroundColor: "rgba(72,92,132,0.2)",
  },
  stageHybridCommentMeta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  stageHybridCommentAuthor: {
    color: "#E5EDFC",
    fontSize: 11,
    fontWeight: "800",
  },
  stageHybridCommentAuthorMe: {
    color: "#FFFFFF",
  },
  stageHybridCommentBody: {
    color: "#C9D4E9",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "600",
  },
  stageHybridCommentAttachmentStack: {
    gap: 7,
    marginTop: 5,
  },
  stageHybridCommentEmpty: {
    color: "#AEB9CF",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "600",
    paddingVertical: 8,
  },
  stageHybridCommentInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  stageHybridCommentAttachButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  stageHybridCommentInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 88,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    color: "#F3F7FF",
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 12,
    fontWeight: "600",
  },
  stageHybridCommentSendButton: {
    minHeight: 44,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(186,208,255,0.22)",
    backgroundColor: "rgba(56,80,126,0.78)",
    paddingHorizontal: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  stageHybridCommentSendButtonDisabled: {
    opacity: 0.48,
  },
  stageHybridCommentSendText: {
    color: "#F7FAFF",
    fontSize: 12,
    fontWeight: "800",
  },
  stageHybridCommentError: {
    color: "#FFC9C9",
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "700",
    marginTop: -2,
  },
  stageHybridReactionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  stageHybridReactionLabel: {
    flex: 1,
    color: "#AFC0DE",
    fontSize: 10.5,
    fontWeight: "700",
  },
  stageHybridReactionLabelMuted: {
    color: "#8D98AD",
  },
  stageParticipantTile: {
    width: 68,
    minHeight: 78,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: "rgba(184,206,246,0.18)",
    backgroundColor: "rgba(10,16,27,0.64)",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 7,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    position: "relative",
  },
  stageParticipantTileGrid: {
    width: "31.5%",
    minHeight: LIVE_STAGE_REMOTE_GRID_TILE_MIN_HEIGHT,
    paddingHorizontal: 6,
    paddingVertical: 7,
    borderRadius: 16,
    alignItems: "stretch",
    justifyContent: "flex-start",
  },
  stageParticipantTileSoloGrid: {
    width: "31.5%",
    minHeight: LIVE_STAGE_REMOTE_GRID_TILE_MIN_HEIGHT,
  },
  stageParticipantTileExpanded: {
    width: 98,
    minHeight: 104,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderColor: "rgba(148,184,255,0.88)",
    backgroundColor: "rgba(30,40,64,0.9)",
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
  stageParticipantTileExpandedGrid: {
    width: "31.5%",
    minHeight: LIVE_STAGE_REMOTE_GRID_TILE_MIN_HEIGHT,
    paddingHorizontal: 6,
    paddingVertical: 8,
    borderRadius: 18,
  },
  stageParticipantTileFeatured: {
    width: 118,
    minHeight: 122,
    paddingHorizontal: 10,
    paddingVertical: 10,
    marginHorizontal: 4,
    borderColor: "rgba(226,236,255,0.62)",
    backgroundColor: "rgba(36,47,74,0.92)",
    shadowColor: "rgba(150,185,255,0.65)",
    shadowOpacity: 0.44,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
  },
  stageParticipantTileFeaturedGrid: {
    width: "31.5%",
    minHeight: LIVE_STAGE_REMOTE_GRID_TILE_MIN_HEIGHT,
    marginHorizontal: 0,
    borderRadius: 18,
  },
  stageParticipantTileActive: {
    borderColor: "rgba(255,255,255,0.18)",
    shadowOpacity: 0,
    transform: [{ scale: 1 }],
  },
  stageParticipantTileRemoved: {
    opacity: 0.6,
  },
  stagePresenceBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(0,0,0,0.48)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  stagePresenceBubbleGrid: {
    width: "100%",
    height: 92,
    borderRadius: 14,
  },
  stagePresenceBubbleSoloGrid: {
    height: 92,
    borderRadius: 14,
  },
  stagePresenceBubbleExpanded: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  stagePresenceBubbleExpandedGrid: {
    width: "100%",
    height: 92,
    borderRadius: 14,
  },
  stagePresenceBubbleFeatured: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginHorizontal: 2,
  },
  stagePresenceBubbleFeaturedGrid: {
    width: "100%",
    height: 92,
    borderRadius: 14,
    marginHorizontal: 0,
  },
  stagePresenceBubbleActive: {
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  stagePresenceHost: {
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(0,0,0,0.48)",
  },
  stagePresenceSpeaker: {
    borderColor: "rgba(255,255,255,0.3)",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  stagePresenceSpeakerBoost: {
    transform: [{ scale: 1 }],
    shadowOpacity: 0,
    zIndex: 1,
  },
  stagePresenceDominant: {
    transform: [{ scale: 1 }],
    shadowOpacity: 0,
    opacity: 1,
    zIndex: 1,
  },
  stagePresenceBubbleNonSpeaking: {
    transform: [{ scale: 1 }],
    opacity: 1,
    zIndex: 1,
  },
  stagePresenceTapWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  stagePresenceTapWrapGrid: {
    width: "100%",
  },
  stagePresenceTapWrapPulsed: {
    transform: [{ scale: 1 }],
    opacity: 1,
  },
  stagePresenceActiveRing: {
    position: "absolute",
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 999,
    borderWidth: 0,
    borderColor: "transparent",
  },
  stagePresenceActiveRingSpeaking: {
    borderWidth: 0,
  },
  stagePresenceActiveRingDominant: {
    borderWidth: 0,
  },
  stagePresenceHostDot: {
    position: "absolute",
    left: -1,
    top: -1,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.46)",
    backgroundColor: "#DC143C",
  },
  stagePresenceHostBadge: {
    position: "absolute",
    left: 7,
    top: 7,
    zIndex: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(220,20,60,0.86)",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  stagePresenceHostBadgeText: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  stagePresenceInitial: { color: "#ECECEC", fontSize: 13, fontWeight: "900" },
  stagePresenceInitialExpanded: { fontSize: 18 },
  stagePresenceInitialFeatured: { fontSize: 21 },
  stagePresenceInitialGrid: { fontSize: 12 },
  stagePresenceInitialSoloGrid: { fontSize: 12 },
  stagePresenceInitialExpandedGrid: { fontSize: 14 },
  stagePresenceInitialFeaturedGrid: { fontSize: 16 },
  stagePresenceImage: { width: "100%", height: "100%", borderRadius: 12 },
  stagePresenceImageExpanded: { borderRadius: 18 },
  stagePresenceImageFeatured: { borderRadius: 22 },
  stagePresenceImageGrid: { borderRadius: 14 },
  stagePresenceImageSoloGrid: { borderRadius: 18 },
  stagePresenceImageExpandedGrid: { borderRadius: 14 },
  stagePresenceImageFeaturedGrid: { borderRadius: 16 },
  stagePresenceFaceClip: {
    width: "100%",
    height: "100%",
    borderRadius: 12,
    overflow: "hidden",
  },
  stagePresenceFallbackFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stagePresenceFaceClipGrid: { borderRadius: 14 },
  stagePresenceFaceClipSoloGrid: { borderRadius: 18 },
  stagePresenceFilterOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 1,
    borderRadius: 999,
  },
  stagePresenceFaceClipExpanded: { borderRadius: 18 },
  stagePresenceFaceClipFeatured: { borderRadius: 22 },
  stagePresenceFaceClipExpandedGrid: { borderRadius: 14 },
  stagePresenceFaceClipFeaturedGrid: { borderRadius: 16 },
  stagePresenceCameraFill: {
    width: "100%",
    height: "100%",
  },
  stagePresenceCameraDominant: {
    opacity: 0.99,
  },
  stagePresenceOnlineDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.46)",
    backgroundColor: "#2ecc40",
  },
  stagePresenceMutedIcon: {
    position: "absolute",
    left: 7,
    bottom: 7,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "rgba(6,10,18,0.78)",
    color: "#F5F8FF",
    fontSize: 10,
    lineHeight: 10,
    fontWeight: "900",
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  stagePresenceOnlineDotLive: {
    backgroundColor: "#2ecc40",
  },
  stagePresenceOnlineDotIdle: {
    backgroundColor: "#7A808F",
  },
  stageParticipantName: {
    marginTop: 6,
    color: "#C6CEDC",
    fontSize: 9.5,
    fontWeight: "700",
    textAlign: "center",
    maxWidth: "100%",
  },
  stageParticipantNameGrid: {
    marginTop: 8,
    fontSize: 10,
    lineHeight: 12,
  },
  stageParticipantNameSoloGrid: {
    fontSize: 10,
    lineHeight: 12,
  },
  stageParticipantNameActive: {
    color: "#C6CEDC",
    fontWeight: "700",
  },
  stageParticipantNameExpanded: {
    marginTop: 7,
    fontSize: 11,
    fontWeight: "800",
    color: "#E5EBF8",
  },
  stageParticipantNameExpandedGrid: {
    marginTop: 6,
    fontSize: 9.5,
    fontWeight: "800",
  },
  stageParticipantNameFeatured: {
    marginTop: 8,
    fontSize: 11.5,
    fontWeight: "900",
    color: "#F4F7FF",
  },
  stageParticipantNameFeaturedGrid: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: "900",
  },
  stageParticipantRole: {
    marginTop: 3,
    fontSize: 8,
    fontWeight: "800",
    color: "#9FA8BA",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  stageParticipantRoleGrid: {
    marginTop: 4,
    fontSize: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  stageParticipantRoleSpeaking: {
    color: "#9FA8BA",
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  stageParticipantRoleHost: {
    color: "#C6CEDC",
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  stageParticipantActionMenu: {
    position: "absolute",
    top: -8,
    left: "50%",
    transform: [{ translateX: -58 }],
    flexDirection: "row",
    gap: 4,
    zIndex: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(8,12,18,0.92)",
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  stageParticipantActionMenuGrid: {
    left: -2,
    right: -2,
    top: -10,
    transform: [{ translateX: 0 }],
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 3,
  },
  stageParticipantActionBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
    minHeight: 28,
    justifyContent: "center",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  stageParticipantActionBtnBusy: {
    opacity: 0.62,
  },
  stageParticipantActionBtnDanger: {
    borderColor: "rgba(220,20,60,0.5)",
    backgroundColor: "rgba(220,20,60,0.2)",
  },
  stageParticipantActionText: {
    color: "#EAF0FA",
    fontSize: 10,
    fontWeight: "800",
  },
  stageParticipantActionStatusText: {
    color: "rgba(234,240,250,0.72)",
    fontSize: 8,
    fontWeight: "800",
    marginTop: 1,
  },
  stageParticipantActionTextDanger: {
    color: "#FFE3EA",
  },
  stageParticipantModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  stageParticipantModalSheet: {
    maxHeight: "78%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(12,12,12,0.98)",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    gap: 10,
  },
  stageParticipantModalHandle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 2,
  },
  stageParticipantModalKicker: { color: "#7A7A7A", fontSize: 9.5, fontWeight: "800", letterSpacing: 1, marginBottom: -2 },
  stageParticipantModalTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  stageParticipantModalIdentityRow: { gap: 7, marginBottom: 2 },
  stageParticipantModalRolePill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stageParticipantModalRolePillHost: {
    borderColor: "rgba(220,20,60,0.42)",
    backgroundColor: "rgba(220,20,60,0.14)",
  },
  stageParticipantModalRoleText: { color: "#CFCFCF", fontSize: 11, fontWeight: "800" },
  stageParticipantModalRoleTextHost: { color: "#F7D6DD" },
  stageParticipantModalStatusRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  stageParticipantModalStatusPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  stageParticipantModalStatusPillLive: {
    borderColor: "rgba(46,204,64,0.34)",
    backgroundColor: "rgba(46,204,64,0.12)",
  },
  stageParticipantModalStatusPillIdle: {
    borderColor: "rgba(122,128,143,0.35)",
    backgroundColor: "rgba(122,128,143,0.14)",
  },
  stageParticipantModalStatusPillMuted: {
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  stageParticipantModalStatusText: { color: "#B8B8B8", fontSize: 10.5, fontWeight: "700" },
  stageParticipantModalStatusTextLive: { color: "#BFDAC4" },
  stageParticipantModalActionsLabel: { color: "#7A7A7A", fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginTop: 2 },
  stageParticipantModalActionBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  stageParticipantModalActionBtnText: { color: "#E2E2E2", fontSize: 14, fontWeight: "800" },
  stageParticipantModalActionBtnDanger: {
    borderColor: "rgba(220,20,60,0.42)",
    backgroundColor: "rgba(220,20,60,0.14)",
  },
  stageParticipantModalActionBtnTextDanger: { color: "#F7D6DD" },
  stageParticipantModalActionBtnClose: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 2,
    alignItems: "center",
  },
  stageParticipantModalActionBtnCloseText: { color: "#BEBEBE", fontSize: 13, fontWeight: "800" },
  chatToggle: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(0,0,0,0.66)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  chatToggleText: { color: "#E3E3E3", fontSize: 11, fontWeight: "800" },
  chatOverlay: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(154,182,246,0.22)",
    backgroundColor: "rgba(6,10,18,0.92)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    maxHeight: 220,
    width: "100%",
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  chatDrawerTitle: { color: "#EFF3FC", fontSize: 12.5, fontWeight: "900", marginBottom: 8 },
  chatDrawerList: { maxHeight: 172 },
  chatDrawerListContent: { gap: 5, paddingBottom: 2 },
  chatFloatStack: { gap: 4 },
  chatFloatLine: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(0,0,0,0.28)",
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  chatOverlayLine: { color: "#C0C0C0", fontSize: 11, fontWeight: "700" },
  chatUsername: { color: "#F3F3F3", fontWeight: "900" },
  chatUsernameMe: { color: "#F7D6DD" },
  chatMessageText: { color: "#BEBEBE", fontWeight: "700" },

  bottomLiveStripOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 14,
    height: 88,
    backgroundColor: "rgba(8,12,18,0.2)",
    justifyContent: "center",
    zIndex: 20,
  },
  bottomLiveStripContent: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: "center",
    minHeight: 88,
  },
  bottomLiveBubbleTouchable: {
    alignItems: "center",
    justifyContent: "center",
  },
  bottomLiveBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  bottomLiveBubbleSpeaking: {
    transform: [{ scale: 1 }],
    shadowOpacity: 0,
    borderColor: "rgba(255,255,255,0.24)",
  },
  bottomLiveBubbleDominant: {
    transform: [{ scale: 1 }],
    shadowOpacity: 0,
    borderColor: "rgba(255,255,255,0.24)",
  },
  bottomLiveBubbleRing: {
    position: "absolute",
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 999,
    borderWidth: 0,
    borderColor: "transparent",
  },
  bottomLiveBubbleRingDominant: {
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderWidth: 0,
    borderColor: "transparent",
  },
  bottomLiveBubbleImage: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
  },
  bottomLiveBubbleFaceClip: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    overflow: "hidden",
  },
  bottomLiveBubbleCameraFill: {
    width: "100%",
    height: "100%",
  },
  bottomLiveBubbleCameraDominant: {
    opacity: 0.99,
  },
  bottomLiveBubbleInitial: { color: "#EAF0FA", fontSize: 14, fontWeight: "900" },

  footerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 2,
    alignSelf: "center",
  },
  footerIconBtn: {
    width: 58,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(10,16,28,0.7)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 7,
    gap: 3,
  },
  footerReactionQuickRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  footerReactionQuickBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(10,16,28,0.7)",
    alignItems: "center",
    justifyContent: "center",
  },
  footerReactionQuickText: {
    color: "#F1F1F1",
    fontSize: 15,
    fontWeight: "900",
  },
  footerIconBtnText: { color: "#F1F1F1", fontSize: 14, fontWeight: "900" },
  footerIconBtnLabel: { color: "#DCE3F3", fontSize: 8.5, fontWeight: "800" },
  stageFooterActionActiveBtn: {
    borderColor: "rgba(172,196,255,0.5)",
    backgroundColor: "rgba(120,156,245,0.2)",
    shadowColor: "rgba(140,176,255,0.82)",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  stageFooterActionActiveLabel: {
    color: "#F4F7FF",
  },
  stageFooterActionDisabledBtn: {
    opacity: 0.48,
  },
  stageFooterActionDisabledLabel: {
    color: "#8F99AD",
  },

  reactionPickerRoot: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    zIndex: 26,
  },
  reactionPickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.28)",
  },
  reactionPickerSheet: {
    marginHorizontal: 8,
    marginBottom: 112,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(7,10,16,0.95)",
    maxHeight: 260,
    padding: 10,
  },
  reactionPickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  reactionPickerTitle: { color: "#F2F5FC", fontSize: 13, fontWeight: "900" },
  reactionPickerSubtitle: { color: "#9EA6B8", fontSize: 10.5, fontWeight: "700", marginTop: 2 },
  reactionPickerCloseBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  reactionPickerCloseText: { color: "#E7ECF8", fontSize: 11, fontWeight: "800" },
  reactionPickerBody: { maxHeight: 196 },
  reactionPickerSection: { marginBottom: 8 },
  reactionPickerSectionTitle: { color: "#8F99AD", fontSize: 10.5, fontWeight: "800", marginBottom: 6 },
  reactionPickerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  reactionPickerEmojiBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  reactionPickerEmojiText: { fontSize: 20 },
});
