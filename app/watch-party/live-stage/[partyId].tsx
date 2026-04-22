import type { RealtimeChannel } from "@supabase/supabase-js";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Track } from "livekit-client";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    ActivityIndicator,
    Animated,
    AppState,
    FlatList,
    Image,
    ImageBackground,
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
import { useIsFocused } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { titles as localTitles } from "../../../_data/titles";
import {
    DEFAULT_APP_CONFIG,
    readAppConfig,
    resolveBrandingConfig,
} from "../../../_lib/appConfig";
import { getBetaAccessBlockCopy, useBetaProgram } from "../../../_lib/betaProgram";
import {
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
import { debugLog, reportRuntimeError } from "../../../_lib/logger";
import { buildSafetyReportContext, submitSafetyReport, trackModerationActionUsed } from "../../../_lib/moderation";
import { isLiveKitRuntimeConfigured } from "../../../_lib/runtimeConfig";
import { useSession } from "../../../_lib/session";
import { supabase } from "../../../_lib/supabase";
import { readUserProfile } from "../../../_lib/userData";
import {
    getActivePartyMemberships,
    getPartyRoomSnapshot,
    getSafePartyUserId,
    joinPartyRoomSession,
    sendPartyMessage,
    setPartyRoomPolicies,
    setPartyParticipantState,
    touchPartyRoomSession,
    type WatchPartyRoomMembership,
    type WatchPartyState,
} from "../../../_lib/watchParty";
import {
    getCommunicationRTCModule,
    getLinkedCommunicationRoom,
    getOrCreateLinkedCommunicationRoom,
    type CommunicationParticipantView,
} from "../../../_lib/communication";
import { useCommunicationRoomSession } from "../../../hooks/use-communication-room-session";
import { InternalInviteSheet } from "../../../components/chat/internal-invite-sheet";
import { ParticipantDetailSheet } from "../../../components/room/participant-detail-sheet";
import { RoomReactionPicker, pushRecentReaction } from "../../../components/room/reaction-picker";
import { getProtectedSessionCopy } from "../../../components/prototype/protected-session-note";
import { ReportSheet } from "../../../components/safety/report-sheet";
import { BetaAccessScreen } from "../../../components/system/beta-access-screen";
import { LiveKitStageMediaSurface } from "../../../components/watch-party-live/livekit-stage-media-surface";
import {
    buildOrderedParticipantsWithSelf,
    buildParticipantProfileParams,
    buildSharedParticipantIdentity,
    canRequestSeat,
    createDefaultParticipantState,
    getParticipantLayerLabel,
    mergeMissingParticipantStates,
    normalizeSharedRoomMode,
    prioritizeParticipantStripOrder,
    resolveIdentityName,
    resolveSelectedParticipantContext,
    type SharedParticipantIdentity,
    type SharedParticipantLocalState,
    type SharedRoomMode,
} from "../_lib/_room-shared";

type StageParticipant = SharedParticipantIdentity & {
  username: string;
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
};

type LiveStageCommentRow = {
  id?: string | null;
  user_id?: string | null;
  username?: string | null;
  text?: string | null;
  created_at?: string | null;
};

const LIVE_FACE_FILTER_OPTIONS = [
  { id: "none", label: "Natural", subtitle: "No filter" },
  { id: "studio", label: "Studio Glow", subtitle: "Warm lift" },
  { id: "cool", label: "City Cool", subtitle: "Blue clarity" },
  { id: "midnight", label: "Midnight", subtitle: "Deep contrast" },
] as const;

type LiveFaceFilterId = (typeof LIVE_FACE_FILTER_OPTIONS)[number]["id"];

const getLiveFaceFilterPresentation = (filterId: LiveFaceFilterId) => {
  switch (filterId) {
    case "studio":
      return {
        label: "Studio Glow",
        subtitle: "Warm lift across your live camera feed.",
        overlayColor: "rgba(255,189,122,0.16)",
        borderColor: "rgba(255,214,168,0.52)",
      };
    case "cool":
      return {
        label: "City Cool",
        subtitle: "Blue-edge clarity for night-stage energy.",
        overlayColor: "rgba(108,166,255,0.18)",
        borderColor: "rgba(168,203,255,0.52)",
      };
    case "midnight":
      return {
        label: "Midnight",
        subtitle: "Deeper contrast with a cooler low-light finish.",
        overlayColor: "rgba(96,112,255,0.16)",
        borderColor: "rgba(149,164,255,0.5)",
      };
    case "none":
    default:
      return {
        label: "Natural",
        subtitle: "No filter on your live camera feed.",
        overlayColor: "transparent",
        borderColor: "rgba(255,255,255,0.1)",
      };
  }
};

const SIM_REACTIONS = ["👍", "🔥", "👏", "❤️", "✨", "😂"];
const MIC_SPEAKING_THRESHOLD_DB = -52;
const MIC_SPEAKING_RELEASE_MS = 420;
const STAGE_HEARTBEAT_INTERVAL_MILLIS = 10_000;
const STAGE_OVERLAY_AUTO_HIDE_MILLIS = 5_000;
const STAGE_CONTROL_HIT_SLOP = { top: 14, bottom: 14, left: 18, right: 18 } as const;
const STAGE_MENU_ITEM_HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 } as const;
type CommunicationRTCViewComponent = React.ComponentType<{
  streamURL: string;
  style?: object;
  objectFit?: "cover" | "contain";
  mirror?: boolean;
}>;

const HYBRID_LIVEKIT_CONNECT_TIMEOUT_MILLIS = 10_000;

type LiveKitStageFallbackReason = "connection_timeout" | "disconnected" | "room_error";

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

  const matchingTrack = useMemo(
    () => tracks.find((trackRef) => (
      isHybridLiveKitTrackReference(trackRef)
      && trackRef.participant.identity === participantId
      && trackRef.participant.identity !== localParticipant.identity
    )) ?? null,
    [localParticipant.identity, participantId, tracks],
  );
  const fallbackRemoteTrack = useMemo(
    () => remoteTracks[remoteTrackIndex] ?? remoteTracks[0] ?? null,
    [remoteTrackIndex, remoteTracks],
  );

  const resolvedRemoteTrack = matchingTrack ?? fallbackRemoteTrack;

  if (resolvedRemoteTrack && isHybridLiveKitTrackReference(resolvedRemoteTrack)) {
    return (
      <HybridLiveKitVideoTrack
        trackRef={resolvedRemoteTrack}
        style={styles.stagePresenceCameraFill}
        objectFit="cover"
        mirror={false}
      />
    );
  }

  return <>{fallback}</>;
}

function LiveKitHybridHeroVideo({
  fallbackInitial,
  participantRole,
}: {
  fallbackInitial: string;
  participantRole: LiveKitTokenReady["participantRole"];
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
  const remoteTracks = useMemo(
    () => tracks.filter((trackRef) => (
      isHybridLiveKitTrackReference(trackRef) && trackRef.participant.identity !== localParticipant.identity
    )),
    [localParticipant.identity, tracks],
  );
  const primaryRemoteTrack = remoteTracks[0] ?? null;
  const localCameraTrackRef = useMemo(() => {
    if (!shouldPublishLocalCamera || !cameraTrack) return null;
    return {
      participant: localParticipant,
      publication: cameraTrack,
      source: Track.Source.Camera,
    };
  }, [cameraTrack, localParticipant, shouldPublishLocalCamera]);
  const primaryTrack = useMemo(
    () => {
      if (shouldPublishLocalCamera && localCameraTrackRef) {
        return localCameraTrackRef;
      }
      return primaryRemoteTrack ?? localCameraTrackRef;
    },
    [localCameraTrackRef, primaryRemoteTrack, shouldPublishLocalCamera],
  );

  if (primaryTrack && isHybridLiveKitTrackReference(primaryTrack)) {
    const showLocalPrimary = primaryTrack.participant.identity === localParticipant.identity;

    return (
      <View style={styles.stageHeroMediaFill}>
        <HybridLiveKitVideoTrack
          trackRef={primaryTrack}
          style={styles.stageHeroMediaFill}
          objectFit="cover"
          mirror={showLocalPrimary}
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
  children,
}: {
  joinContract: LiveKitTokenReady;
  onFallback: (reason: LiveKitStageFallbackReason) => void;
  children: React.ReactNode;
}) {
  const fallbackTriggeredRef = useRef(false);
  const [didConnectOnce, setDidConnectOnce] = useState(false);
  const publishLocalCamera = joinContract.participantRole !== "viewer";

  const triggerFallback = useCallback(
    (reason: LiveKitStageFallbackReason, error?: unknown) => {
      if (fallbackTriggeredRef.current) return;
      fallbackTriggeredRef.current = true;

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
    [joinContract.endpoint, joinContract.participantRole, joinContract.roomName, onFallback],
  );

  useEffect(() => {
    fallbackTriggeredRef.current = false;
    setDidConnectOnce(false);
  }, [joinContract.participantToken, joinContract.roomName]);

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
        triggerFallback(
          "connection_timeout",
          new Error("LiveKit did not finish connecting before the hybrid community feed fallback deadline."),
        );
      }
    }, HYBRID_LIVEKIT_CONNECT_TIMEOUT_MILLIS);

    return () => {
      clearTimeout(timeout);
    };
  }, [didConnectOnce, triggerFallback]);

  return (
    <HybridLiveKitRoom
      serverUrl={joinContract.serverUrl}
      token={joinContract.participantToken}
      connect
      audio={false}
      video={publishLocalCamera}
      connectOptions={{ autoSubscribe: true }}
      options={{ adaptiveStream: true, dynacast: false }}
      onConnected={() => {
        setDidConnectOnce(true);
        debugLog("livekit", "hybrid community room connected", {
          roomName: joinContract.roomName,
          participantRole: joinContract.participantRole,
          publishLocalCamera,
        });
      }}
      onDisconnected={() => {
        triggerFallback(
          "disconnected",
          new Error("LiveKit disconnected before the hybrid community feed could stay stable."),
        );
      }}
      onError={(error) => {
        triggerFallback("room_error", error);
      }}
      onMediaDeviceFailure={(failure) => {
        triggerFallback(
          "room_error",
          new Error(`LiveKit media-device failure: ${String(failure ?? "unknown_failure")}`),
        );
      }}
    >
      {children}
    </HybridLiveKitRoom>
  );
}

export default function WatchPartyLiveStageScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const isFocused = useIsFocused();
  const { isLoading: authLoading, isSignedIn } = useSession();
  const { accessState, isLoading: betaLoading, isActive } = useBetaProgram();
  const { partyId: partyIdParam, mode: modeParam, source: sourceParam } = useLocalSearchParams<{ partyId?: string; mode?: string; source?: string }>();
  const router = useRouter();
  const partyId = (Array.isArray(partyIdParam) ? partyIdParam[0] : partyIdParam) ?? "";
  const modeParamValue = Array.isArray(modeParam) ? modeParam[0] : modeParam;
  const source = String(Array.isArray(sourceParam) ? sourceParam[0] : sourceParam ?? "").trim().toLowerCase();
  const initialStageMode = normalizeSharedRoomMode(modeParamValue, "live");
  const canUseBetaStage = isSignedIn && isActive;
  const blockedBetaCopy = getBetaAccessBlockCopy(accessState.status, "Live Stage");

  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState<WatchPartyState | null>(null);
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
  const [stageMenuOpen, setStageMenuOpen] = useState(false);
  const [hybridComments, setHybridComments] = useState<LiveStageComment[]>([]);
  const [hybridCommentDraft, setHybridCommentDraft] = useState("");
  const [hybridCommentSending, setHybridCommentSending] = useState(false);
  const [liveFaceFilter, setLiveFaceFilter] = useState<LiveFaceFilterId>("none");
  const [stageOverlayVisible, setStageOverlayVisible] = useState(true);
  const [recentReactionEmojis, setRecentReactionEmojis] = useState<string[]>([]);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [activeSpeakerUserId, setActiveSpeakerUserId] = useState<string>("");
  const [activeParticipantId, setActiveParticipantId] = useState<string>("");
  const [featuredParticipantById, setFeaturedParticipantById] = useState<Record<string, boolean>>({});
  const [participantPresentationById, setParticipantPresentationById] = useState<Record<string, "compact" | "expanded">>({});
  const [participantStateById, setParticipantStateById] = useState<Record<string, SharedParticipantLocalState>>({});
  const [seatRequestsById, setSeatRequestsById] = useState<Record<string, boolean>>({});
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
  const stripOrderRef = useRef<string>("");
  const branding = resolveBrandingConfig(appConfig);

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
    setCommunicationRoomId("");
    setLiveKitJoinContract(null);
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
    syncStageSnapshot(snapshot, String(trackedUserId ?? myUserId ?? "").trim());
    return snapshot;
  }, [myUserId, partyId, syncStageSnapshot]);

  const buildStageParticipantsFromPresence = useCallback((options: {
    state: Record<string, { userId?: string; username?: string; avatarUrl?: string; cameraPreviewUrl?: string; camera_preview_url?: string; role?: string; isLive?: boolean; isSpeaking?: boolean; isMuted?: boolean }[] | undefined>;
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
        ? presences[0] as { userId?: string; username?: string; avatarUrl?: string; cameraPreviewUrl?: string; camera_preview_url?: string; role?: string; isLive?: boolean; isSpeaking?: boolean; isMuted?: boolean }
        : undefined;
      const resolvedUserId = String(p?.userId ?? presenceKey).trim();
      if (!resolvedUserId) return null;
      const membership = membershipMapRef.current[resolvedUserId];
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

  const updateStageMode = useCallback((nextMode: SharedRoomMode) => {
    setStageMode(nextMode);
    if (modeParamValue !== nextMode) {
      router.setParams({ mode: nextMode });
    }
  }, [modeParamValue, router]);

  useEffect(() => {
    const normalizedRouteMode = normalizeSharedRoomMode(modeParamValue, "live");
    setStageMode((currentMode) => (currentMode === normalizedRouteMode ? currentMode : normalizedRouteMode));
  }, [modeParamValue]);

  useEffect(() => {
    setLiveSurface("room");
    setSeatRequestsById({});
  }, [partyId]);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const backgroundSource: ImageSourcePropType | null = (() => {
    const first = localTitles[0] as any;
    return first?.image || first?.poster || null;
  })();

  useEffect(() => {
    debugLog("live-stage", "mount", { partyIdParam, partyId });
  }, [partyIdParam, partyId]);

  useEffect(() => {
    debugLog("live-stage", "loading state", { loading });
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
        debugLog("live-stage", "route params", { partyIdParam, partyId });
        debugLog("live-stage", "async start", { partyId });

        if (!partyId) {
          debugLog("live-stage", "missing party id");
          debugLog("live-stage", "set loading false", { reason: "missing-party-id" });
          setLoading(false);
          return;
        }

        const userId = await getSafePartyUserId().catch(() => "");
        const trackedUserId = String(userId || "anon").trim() || "anon";
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

        debugLog("live-stage", "async complete", {
          userId,
          username,
          roomFound: !!snapshot?.room,
        });

        if (cancelled) return;

        setMyUserId(trackedUserId);
        setMyUsername(username || "You");
        myCameraPreviewUrlRef.current = profileCameraPreviewUrl;

        if (!snapshot) {
          setLoading(false);
          return;
        }

        syncStageSnapshot(snapshot, trackedUserId);
        await joinPartyRoomSession({
          partyId,
          userId: trackedUserId,
          role: trackedUserId === snapshot.room.hostUserId ? "host" : "viewer",
          canSpeak: trackedUserId === snapshot.room.hostUserId,
          cameraEnabled: !!profileCameraPreviewUrl,
          micEnabled: true,
          displayName: username,
          avatarUrl: profileAvatarUrl,
          cameraPreviewUrl: profileCameraPreviewUrl,
        }).catch(() => null);
        if (!cancelled) {
          await refreshStageSnapshot(trackedUserId).catch(() => null);
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
          debugLog("live-stage", "channel status", { status });
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
                debugLog("live-stage", "set loading false", { reason: "subscribed" });
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
          void touchPartyRoomSession({
            partyId,
            userId: trackedUserId,
            role: membershipMapRef.current[trackedUserId]?.role ?? (snapshot.room.hostUserId === trackedUserId ? "host" : "viewer"),
            canSpeak: membershipMapRef.current[trackedUserId]?.canSpeak ?? (snapshot.room.hostUserId === trackedUserId),
            cameraEnabled: !!profileCameraPreviewUrl,
            micEnabled: true,
            displayName: username,
            avatarUrl: profileAvatarUrl,
            cameraPreviewUrl: profileCameraPreviewUrl,
          }).then(() => refreshStageSnapshot(trackedUserId));
        }, STAGE_HEARTBEAT_INTERVAL_MILLIS);

        loadGuardTimeout = setTimeout(() => {
          if (cancelled) return;
          debugLog("live-stage", "set loading false", { reason: "load-guard-timeout" });
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
  }, [buildStageParticipantsFromPresence, canUseBetaStage, partyId, partyIdParam, refreshStageSnapshot, syncStageSnapshot]);

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

      if (nextState === "active") {
        void touchPartyRoomSession({
          partyId,
          userId: currentUserId,
          role: membershipMapRef.current[currentUserId]?.role ?? (isHost ? "host" : "viewer"),
          canSpeak: membershipMapRef.current[currentUserId]?.canSpeak ?? isHost,
          cameraEnabled: !!myCameraPreviewUrlRef.current,
          micEnabled: true,
          displayName: myUsername || "You",
          cameraPreviewUrl: myCameraPreviewUrlRef.current,
          membershipState: "active",
        }).then(() => refreshStageSnapshot(currentUserId));
        return;
      }

      void touchPartyRoomSession({
        partyId,
        userId: currentUserId,
        role: membershipMapRef.current[currentUserId]?.role ?? (isHost ? "host" : "viewer"),
        canSpeak: membershipMapRef.current[currentUserId]?.canSpeak ?? isHost,
        cameraEnabled: !!myCameraPreviewUrlRef.current,
        micEnabled: true,
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
  const RTCView = useMemo<CommunicationRTCViewComponent | undefined>(() => {
    if (!shouldRenderLegacyStageRtc) return undefined;
    return getCommunicationRTCModule()?.RTCView as CommunicationRTCViewComponent | undefined;
  }, [shouldRenderLegacyStageRtc]);
  const {
    localStreamURL,
    participants: stageMediaParticipants,
  } = useCommunicationRoomSession({
    roomId: communicationRoomId,
    enabled: shouldRenderLegacyStageRtc,
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
  const selectedParticipant = useMemo(
    () => visibleStripParticipants.find((participant) => participant.userId === selectedParticipantId) ?? null,
    [visibleStripParticipants, selectedParticipantId],
  );
  const { selectedParticipantUserId, selectedParticipantState, canShowProfileAction } = resolveSelectedParticipantContext({
    selectedParticipant,
    participantStateById,
    currentUserId: currentUserParticipantId,
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
    const dominantCandidate = visibleStripParticipants.find((participant) => {
      const participantState = participantStateById[participant.userId];
      const isMuted = participantState?.isMuted ?? !!participant.isMuted;
      const role = participantState?.role ?? (participant.role === "host" ? "host" : participant.isSpeaking ? "speaker" : "listener");
      const isSpeakerRole = role === "speaker";
      const isSpeakingNow = !isMuted && !!(isSpeakingById[participant.userId] || (isSpeakerRole && (!!participant.isSpeaking || participant.userId === activeSpeakerUserId)));
      return isSpeakingNow;
    });
    const dominantIndex = dominantCandidate ? visibleStripParticipants.findIndex((participant) => participant.userId === dominantCandidate.userId) : -1;
    const dominantBiasX = dominantIndex >= 0 && visibleStripParticipants.length > 1
      ? ((dominantIndex / (visibleStripParticipants.length - 1)) - 0.5) * 52
      : 0;
    const id = `reaction-${Date.now()}-${reactionCounterRef.current++}`;
    const originX = Math.round(dominantBiasX);
    const drift = Math.floor(Math.random() * 90) - 45;
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
  }, [visibleStripParticipants, participantStateById, isSpeakingById, activeSpeakerUserId]);

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
    triggerReactionBurst(emoji);
    setRecentReactionEmojis((prev) => pushRecentReaction(prev, emoji));
  }, [triggerReactionBurst]);

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
    setStageMenuOpen(false);
    setCommentsOpen(false);
    setReactionPickerOpen(false);
    setStageControlsOpen(false);
    setFaceFilterSheetOpen(false);
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

  const revealStageOverlay = useCallback(() => {
    clearStageOverlayAutoHideTimeout();
    clearStageOverlayFinalizeHideTimeout();
    stageOverlayLastInteractionAtRef.current = Date.now();
    setStageOverlayVisible(true);
    stageOverlayMotion.stopAnimation();
    Animated.timing(stageOverlayMotion, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [clearStageOverlayAutoHideTimeout, clearStageOverlayFinalizeHideTimeout, stageOverlayMotion]);

  const emitParticipantUpdate = useCallback(async (participantId: string, changes: Partial<SharedParticipantLocalState>) => {
    if (!partyId || !participantId || !isHost) return;
    const currentMembership = membershipMapRef.current[participantId];
    const nextStageRole = changes.role
      ? (changes.role === "host" ? "host" : changes.role)
      : currentMembership?.stageRole;
    const shouldRemove = typeof changes.isRemoved === "boolean" ? changes.isRemoved : currentMembership?.membershipState === "removed";

    await setPartyParticipantState(partyId, participantId, {
      isMuted: typeof changes.isMuted === "boolean" ? changes.isMuted : currentMembership?.isMuted,
      stageRole: nextStageRole,
      canSpeak: nextStageRole === "host" || nextStageRole === "speaker",
      membershipState: shouldRemove ? "removed" : "active",
      leftAt: shouldRemove ? new Date().toISOString() : null,
    }).catch(() => null);
    await refreshStageSnapshot(myUserId).catch(() => null);
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

    revealStageOverlay();
    setSeatRequestsById((prev) => ({ ...prev, [nextParticipantId]: true }));
    broadcastSeatRequest(nextParticipantId, true);
  }, [
    broadcastSeatRequest,
    isHost,
    myUserId,
    participantStateById,
    revealStageOverlay,
    seatRequestsById,
  ]);

  useEffect(() => {
    if (!canOwnActiveStageSurface || shouldRenderLiveKitStage) return;
    debugLog("live-stage", "mic setup start");
    const currentUserId = String(myUserId || "").trim();

    let cancelled = false;

    const startMicMetering = async () => {
      try {
        const permission = await Audio.requestPermissionsAsync();
        debugLog("live-stage", "mic permission", { granted: permission.granted, status: permission.status, canAskAgain: permission.canAskAgain });
        if (!permission.granted || cancelled) return;

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        });

        debugLog("live-stage", "mic recording created");
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
        debugLog("live-stage", "mic prepare complete");
        debugLog("live-stage", "mic start async");
        await recording.startAsync();
        debugLog("live-stage", "mic recording started");
        recording.setProgressUpdateInterval(220);
        recording.setOnRecordingStatusUpdate((status) => {
          debugLog("live-stage", "mic meter", { isRecording: status.isRecording, metering: status.metering });
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
            debugLog("live-stage", "speaking change", {
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
            debugLog("live-stage", "speaking change", {
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
  const stageMenuSheetVisible = stageMenuOpen && !commentsOpen && !reactionPickerOpen && !stageControlsOpen && !faceFilterSheetOpen;
  const liveDockBottomInset = Math.max(28, safeAreaInsets.bottom + 14);
  const liveRoomFooterInset = Math.max(16, safeAreaInsets.bottom + 8);
  const hybridDeckTop = safeAreaInsets.top + 140;
  const isLiveFirstMode = stageMode === "live";
  const isHybridMode = stageMode === "hybrid";
  const usesSharedStageCommentLane = isLiveFirstMode || isHybridMode;
  const commentsLaneBottomOffset = liveDockBottomInset + (usesSharedStageCommentLane ? 292 : 172);
  const hybridCommunityMaxHeight = Math.max(
    170,
    Math.min(300, windowHeight - hybridDeckTop - (safeAreaInsets.bottom + 360)),
  );
  const lowerCommunityParticipants = useMemo(() => {
    if (isLiveFirstMode) {
      return visibleStripParticipants.filter((participant) => participant.role !== "host");
    }
    if (isHybridMode) {
      return visibleStripParticipants.filter((participant) => participant.userId !== currentUserParticipantId);
    }
    return visibleStripParticipants;
  }, [currentUserParticipantId, isHybridMode, isLiveFirstMode, visibleStripParticipants]);
  const lowerCommunityRows = useMemo(() => {
    const rows: typeof lowerCommunityParticipants[] = [];
    let pendingRow: typeof lowerCommunityParticipants = [];

    lowerCommunityParticipants.forEach((participant) => {
      const isFeatured = !!featuredParticipantById[participant.userId];
      if (isFeatured) {
        if (pendingRow.length > 0) {
          rows.push(pendingRow);
          pendingRow = [];
        }
        rows.push([participant]);
        return;
      }

      pendingRow.push(participant);
      if (pendingRow.length === 2) {
        rows.push(pendingRow);
        pendingRow = [];
      }
    });

    if (pendingRow.length > 0) {
      rows.push(pendingRow);
    }

    return rows;
  }, [featuredParticipantById, lowerCommunityParticipants]);
  const lowerCommunityParticipantIndexById = useMemo(
    () => Object.fromEntries(lowerCommunityParticipants.map((participant, index) => [participant.userId, index])),
    [lowerCommunityParticipants],
  );
  const lowerCommunityCountLabel = isLiveFirstMode
    ? (lowerCommunityParticipants.length > 0 ? `${lowerCommunityParticipants.length} in audience` : "Audience waiting")
    : `${viewerCount} in room`;
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
  const liveKitParticipantRole = isHost
    ? "host"
    : !isLiveFirstMode
      ? "speaker"
      : participantStateById[trackedUserId]?.role === "speaker"
        || membershipMapRef.current[trackedUserId]?.canSpeak
        ? "speaker"
        : "viewer";
  const stageModeTitle = isLiveFirstMode
    ? "Host-led live focus"
    : "Shared watch moment";
  const stageModeBody = isLiveFirstMode
    ? "Live-First keeps the host at the center."
    : `${branding.watchPartyLabel} keeps the shared watch moment centered in the live route.`;
  const hybridStageFocusTarget = tailoredFocusParticipant && tailoredFocusParticipant.userId !== currentUserParticipantId
    ? tailoredFocusParticipant
    : (lowerCommunityParticipants[0] ?? hostParticipant ?? tailoredFocusParticipant);
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
  const stageModeMeaning = isLiveFirstMode
    ? "Host-led live presentation mode with audience energy at the front."
    : `${branding.watchPartyLabel} keeps shared content inside the live presentation while comments, reactions, and audience presence stay active.`;
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
  const heroParticipant = stageFocusTarget ?? hostParticipant ?? selfFallbackParticipant;
  const stageMediaParticipantsByUserId = useMemo(
    () => Object.fromEntries(stageMediaParticipants.map((participant) => [participant.userId, participant])),
    [stageMediaParticipants],
  );
  const heroMediaParticipant = heroParticipant ? stageMediaParticipantsByUserId[heroParticipant.userId] as CommunicationParticipantView | undefined : undefined;
  const heroParticipantIsCurrentUser = heroParticipant?.userId === currentUserParticipantId;
  const showHeroLocalRtcVideo = heroParticipantIsCurrentUser && !!RTCView && !!localStreamURL;
  const showHeroRemoteVideo = !heroParticipantIsCurrentUser && !!RTCView && !!heroMediaParticipant?.streamURL && heroMediaParticipant.cameraOn;
  const heroParticipantPreviewUri = String(
    heroParticipantIsCurrentUser
      ? (myCameraPreviewUrlRef.current || heroParticipant?.cameraPreviewUrl || heroParticipant?.avatarUrl || "")
      : (heroParticipant?.cameraPreviewUrl || heroParticipant?.avatarUrl || ""),
  ).trim();
  const showHeroRemoteImage = !showHeroLocalRtcVideo && !showHeroRemoteVideo && !!heroParticipantPreviewUri;
  const heroOwnsLocalFeed = heroParticipantIsCurrentUser;
  const heroFallbackInitial = String(heroParticipant?.displayName || "H").trim().slice(0, 1).toUpperCase();
  const activeLiveFaceFilter = getLiveFaceFilterPresentation(liveFaceFilter);
  const inviteSheetAutolaunchedRef = useRef<string | null>(null);
  const hybridCommentCountLabel = hybridComments.length === 1 ? "1 comment" : `${hybridComments.length} comments`;
  const hybridCommentPlaceholder = isHost ? "Comment as host" : "Add a comment";

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
    };
  }, [resolvedCurrentUsername, trackedUserId]);

  useEffect(() => {
    if (!__DEV__ || !canOwnActiveStageSurface || shouldRenderLiveKitStage) return;
    debugLog("live-stage", "stage media binding", {
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
      if (roomMessagesChannelRef.current) {
        supabase.removeChannel(roomMessagesChannelRef.current);
        roomMessagesChannelRef.current = null;
      }
      return;
    }

    let active = true;

    const loadHybridComments = async () => {
      try {
        const { data, error } = await supabase
          .from("watch_party_room_messages")
          .select("id,user_id,username,text,created_at")
          .eq("party_id", partyId)
          .order("created_at", { ascending: true })
          .limit(120);

        if (!active) return;
        if (error || !data) {
          setHybridComments([]);
          return;
        }

        const nextComments = (data as LiveStageCommentRow[])
          .map((row) => mapLiveStageCommentRow(row))
          .filter(Boolean) as LiveStageComment[];
        setHybridComments(nextComments);
      } catch {
        if (active) setHybridComments([]);
      }
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
      .subscribe();

    roomMessagesChannelRef.current = channel;

    return () => {
      active = false;
      if (roomMessagesChannelRef.current === channel) {
        supabase.removeChannel(channel);
        roomMessagesChannelRef.current = null;
      }
    };
  }, [canUseBetaStage, mapLiveStageCommentRow, partyId, usesSharedStageCommentLane]);

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

  const onShareLiveRoom = useCallback(async () => {
    if (!liveRoomShareCode) return;
    setInviteSheetVisible(true);
  }, [liveRoomShareCode]);

  useEffect(() => {
    if (!__DEV__ || !isHost || liveSurface !== "room" || !liveRoomShareCode) return;
    if (inviteSheetAutolaunchedRef.current === liveRoomShareCode) return;
    inviteSheetAutolaunchedRef.current = liveRoomShareCode;
    setInviteSheetVisible(true);
  }, [isHost, liveRoomShareCode, liveSurface]);

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

  const onEnterLiveStage = useCallback(async () => {
    if (liveKitFoundationEnabled && partyId) {
      const joinResult = await prepareLiveKitJoinBoundary({
        surface: "live-stage",
        roomName: partyId,
        participantIdentity: trackedUserId,
        participantName: resolvedCurrentUsername,
        participantRole: liveKitParticipantRole,
        metadata: {
          roomCode: room?.roomCode ?? null,
          stageMode,
          source: source || null,
        },
      });

      if (joinResult.status === "ready") {
        setLiveKitJoinContract(joinResult);
        debugLog("livekit", "prepared live-stage join contract", {
          roomName: joinResult.roomName,
          endpoint: joinResult.endpoint,
          participantRole: joinResult.participantRole,
          requestedGrants: joinResult.requestedGrants,
        });
      } else {
        setLiveKitJoinContract(null);
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
      setLiveKitJoinContract(null);
    }

    closeStageOverlayPanels();
    stageOverlayLastInteractionAtRef.current = Date.now();
    setStageOverlayVisible(true);
    stageOverlayMotion.setValue(1);
    setLiveSurface("stage");
  }, [
    closeStageOverlayPanels,
    liveKitParticipantRole,
    liveKitFoundationEnabled,
    partyId,
    resolvedCurrentUsername,
    room?.roomCode,
    source,
    stageMode,
    stageOverlayMotion,
    trackedUserId,
  ]);

  const onReturnToLiveRoom = useCallback(() => {
    closeStageOverlayPanels();
    stageOverlayLastInteractionAtRef.current = Date.now();
    setStageOverlayVisible(true);
    stageOverlayMotion.setValue(1);
    setLiveKitJoinContract(null);
    setLiveSurface("room");
  }, [closeStageOverlayPanels, stageOverlayMotion]);

  const onToggleStageControls = useCallback(() => {
    revealStageOverlay();
    setStageMenuOpen(false);
    setCommentsOpen(false);
    setReactionPickerOpen(false);
    setFaceFilterSheetOpen(false);
    setStageControlsOpen((value) => !value);
  }, [revealStageOverlay]);

  const onToggleFaceFilters = useCallback(() => {
    revealStageOverlay();
    setStageMenuOpen(false);
    setCommentsOpen(false);
    setReactionPickerOpen(false);
    setStageControlsOpen(false);
    setFaceFilterSheetOpen((value) => !value);
  }, [revealStageOverlay]);

  const onToggleStageMenu = useCallback(() => {
    revealStageOverlay();
    setCommentsOpen(false);
    setReactionPickerOpen(false);
    setStageControlsOpen(false);
    setFaceFilterSheetOpen(false);
    setStageMenuOpen((value) => !value);
  }, [revealStageOverlay]);

  const onOpenStageComments = useCallback(() => {
    revealStageOverlay();
    setStageMenuOpen(false);
    setStageControlsOpen(false);
    setFaceFilterSheetOpen(false);
    setReactionPickerOpen(false);

    if (usesSharedStageCommentLane) {
      setCommentsOpen(true);
      setTimeout(() => {
        hybridCommentInputRef.current?.focus();
        hybridCommentsScrollRef.current?.scrollToEnd({ animated: true });
      }, 80);
      return;
    }

    setCommentsOpen((value) => !value);
  }, [revealStageOverlay, usesSharedStageCommentLane]);

  const onSendHybridComment = useCallback(async () => {
    const safeBody = hybridCommentDraft.trim();
    if (!safeBody || !partyId || hybridCommentSending) return;

    setHybridCommentSending(true);
    try {
      await sendPartyMessage(partyId, trackedUserId, "chat", safeBody, {
        username: resolvedCurrentUsername,
      });
      setHybridCommentDraft("");
      setCommentsOpen(true);
      setTimeout(() => {
        hybridCommentsScrollRef.current?.scrollToEnd({ animated: true });
      }, 40);
    } finally {
      setHybridCommentSending(false);
    }
  }, [hybridCommentDraft, hybridCommentSending, partyId, resolvedCurrentUsername, trackedUserId]);

  useEffect(() => {
    if (isLiveRoomSurface) {
      stageOverlayLastInteractionAtRef.current = Date.now();
      setStageOverlayVisible(true);
      stageOverlayMotion.setValue(1);
      return;
    }

    revealStageOverlay();
  }, [isLiveRoomSurface, revealStageOverlay, stageOverlayMotion]);

  useEffect(() => {
    if (isLiveRoomSurface || !stageOverlayVisible) {
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
    faceFilterSheetOpen,
    hideStageOverlay,
    isLiveRoomSurface,
    reactionPickerOpen,
    stageControlsOpen,
    stageMenuOpen,
    stageOverlayVisible,
  ]);

  useEffect(() => {
    if (!commentsOpen && !reactionPickerOpen && !stageControlsOpen && !faceFilterSheetOpen) {
      return;
    }

    setStageMenuOpen(false);
  }, [commentsOpen, faceFilterSheetOpen, reactionPickerOpen, stageControlsOpen]);

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
        <TouchableOpacity style={styles.liveRoomPrimaryButton} activeOpacity={0.88} onPress={onEnterLiveStage}>
          <Text style={styles.liveRoomPrimaryButtonText}>{liveRoomEntryLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  debugLog("live-stage", "render branch", {
    loading,
    partyId,
    participants: participants.length,
    displayParticipants: displayParticipants.length,
  });

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
          condition={!!(isHybridMode && shouldRenderLiveKitStage && liveKitJoinContract)}
          wrap={(children) => (
            <LiveKitHybridCommunityRoomHost
              joinContract={liveKitJoinContract as LiveKitTokenReady}
              onFallback={onLiveKitStageFallback}
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
          {shouldRenderLiveKitStage && liveKitJoinContract ? (
            isHybridMode ? (
              <LiveKitHybridHeroVideo
                fallbackInitial={heroFallbackInitial}
                participantRole={liveKitJoinContract.participantRole}
              />
            ) : (
              <View style={styles.stageHeroMediaFill}>
                <LiveKitStageMediaSurface
                  joinContract={liveKitJoinContract}
                  onFallback={onLiveKitStageFallback}
                />
              </View>
            )
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
          {isHybridMode ? <View pointerEvents="none" style={styles.stageHybridMediaScrim} /> : null}
          {!isHybridMode && (showHeroLocalRtcVideo || showHeroRemoteImage) && liveFaceFilter !== "none" ? (
            <View
              pointerEvents="none"
              style={[
                styles.stageHeroFilterOverlay,
                {
                  backgroundColor: activeLiveFaceFilter.overlayColor,
                  borderColor: activeLiveFaceFilter.borderColor,
                },
              ]}
            />
          ) : null}
          <View pointerEvents="none" style={styles.floatingReactionsLayer}>
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
            onPress={revealStageOverlay}
          />
        ) : null}

        <Animated.View
          style={[
            styles.stageOverlayPanelWrap,
            {
              opacity: stageOverlayOpacity,
              transform: [{ translateY: stageOverlayTranslate }],
            },
          ]}
          pointerEvents={stageOverlayVisible ? "box-none" : "none"}
        >
        <View style={[styles.stageTopChrome, { top: safeAreaInsets.top + 50 }]} pointerEvents="box-none">
          <View style={styles.stageTopChromeRow}>
            <View style={styles.stageTopChromeCopy}>
              <Text style={styles.stageSurfaceKicker}>LIVE STAGE</Text>
              <Text numberOfLines={1} style={styles.stageTopChromeTitle}>
                {isLiveFirstMode ? "Host-led live" : `${branding.watchPartyLabel} live`}
              </Text>
              <Text numberOfLines={1} style={styles.stageTopChromeBody}>
                {`${lowerCommunityCountLabel} · ${liveStageProtectionStatus}`}
              </Text>
            </View>
            <View style={styles.stageTopChromeActions}>
              <TouchableOpacity
                style={[styles.stageTopMenuButton, stageMenuSheetVisible && styles.stageTopMenuButtonActive]}
                activeOpacity={0.84}
                accessibilityRole="button"
                accessibilityLabel="Live Stage Menu"
                hitSlop={STAGE_CONTROL_HIT_SLOP}
                onPress={onToggleStageMenu}
                testID="live-stage-menu-button"
              >
                <Text style={styles.stageTopMenuButtonText}>Menu</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.stageSurfaceBackButton}
                activeOpacity={0.84}
                accessibilityRole="button"
                accessibilityLabel="Return to Live Room"
                hitSlop={STAGE_CONTROL_HIT_SLOP}
                onPress={onReturnToLiveRoom}
                testID="live-stage-live-room-button"
              >
                <Text style={styles.stageSurfaceBackText}>Live Room</Text>
              </TouchableOpacity>
            </View>
          </View>

          {stageMenuSheetVisible ? (
            <View style={styles.stageTopMenuSheet}>
              <TouchableOpacity
                style={[styles.stageTopMenuItem, commentsOpen && styles.stageTopMenuItemActive]}
                activeOpacity={0.84}
                accessibilityRole="button"
                accessibilityLabel="Open Live Stage Comments"
                hitSlop={STAGE_MENU_ITEM_HIT_SLOP}
                onPress={onOpenStageComments}
                testID="live-stage-comments-button"
              >
                <Text style={styles.stageTopMenuItemIcon}>🗨️</Text>
                <View style={styles.stageTopMenuItemCopy}>
                  <Text style={styles.stageTopMenuItemTitle}>Comments</Text>
                  <Text style={styles.stageTopMenuItemBody}>
                    {usesSharedStageCommentLane ? "Open the bottom comment lane." : "Open the room response lane."}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.stageTopMenuItem, stageControlsOpen && styles.stageTopMenuItemActive]}
                activeOpacity={0.84}
                accessibilityRole="button"
                accessibilityLabel="Open Live Stage Studio Controls"
                hitSlop={STAGE_MENU_ITEM_HIT_SLOP}
                onPress={onToggleStageControls}
                testID="live-stage-studio-button"
              >
                <Text style={styles.stageTopMenuItemIcon}>🎛️</Text>
                <View style={styles.stageTopMenuItemCopy}>
                  <Text style={styles.stageTopMenuItemTitle}>Studio</Text>
                  <Text style={styles.stageTopMenuItemBody}>Focus and room-stage controls.</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.stageTopMenuItem, (faceFilterSheetOpen || liveFaceFilter !== "none") && styles.stageTopMenuItemActive]}
                activeOpacity={0.84}
                accessibilityRole="button"
                accessibilityLabel="Open Live Stage Filters"
                hitSlop={STAGE_MENU_ITEM_HIT_SLOP}
                onPress={onToggleFaceFilters}
                testID="live-stage-filters-button"
              >
                <Text style={styles.stageTopMenuItemIcon}>🎭</Text>
                <View style={styles.stageTopMenuItemCopy}>
                  <Text style={styles.stageTopMenuItemTitle}>Filters</Text>
                  <Text style={styles.stageTopMenuItemBody}>Adjust the on-camera look.</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.stageTopMenuItem, reactionPickerOpen && styles.stageTopMenuItemActive]}
                activeOpacity={0.84}
                accessibilityRole="button"
                accessibilityLabel="Open Live Stage Reactions"
                hitSlop={STAGE_MENU_ITEM_HIT_SLOP}
                onPress={() => {
                  revealStageOverlay();
                  setStageMenuOpen(false);
                  setStageControlsOpen(false);
                  setFaceFilterSheetOpen(false);
                  setCommentsOpen(false);
                  setReactionPickerOpen((value) => !value);
                }}
                testID="live-stage-react-button"
              >
                <Text style={styles.stageTopMenuItemIcon}>✨</Text>
                <View style={styles.stageTopMenuItemCopy}>
                  <Text style={styles.stageTopMenuItemTitle}>React</Text>
                  <Text style={styles.stageTopMenuItemBody}>Send a live reaction.</Text>
                </View>
              </TouchableOpacity>
            </View>
          ) : null}

        </View>
        {isHybridMode ? (
          <View style={[styles.stageHybridDeck, { top: hybridDeckTop }]} pointerEvents="box-none">
            <View pointerEvents="auto" style={[styles.stageHybridCommunityCard, { maxHeight: hybridCommunityMaxHeight + 58 }]}>
              <View style={styles.stageCommunityHeader}>
                <View style={styles.stageCommunityHeaderLeft}>
                  <View style={styles.stageCommunityDot} />
                  <Text style={styles.stageCommunityLabelHybrid}>Chi'lly Party Members</Text>
                </View>
                <Text style={styles.stageCommunityCount}>{lowerCommunityCountLabel}</Text>
              </View>

              {lowerCommunityParticipants.length > 0 ? (
                <FlatList
                  data={lowerCommunityRows}
                  keyExtractor={(row, index) => row.map((participant) => participant.userId).join("|") || `community-row-${index}`}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  style={[styles.stageHybridCommunityScroll, { maxHeight: hybridCommunityMaxHeight }]}
                  contentContainerStyle={styles.stageHybridCommunityGrid}
                  removeClippedSubviews={Platform.OS === "android"}
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
                    stageMediaParticipantsByUserId,
                    localStreamURL,
                    liveFaceFilter,
                    heroOwnsLocalFeed,
                    isHost,
                  }}
                  renderItem={({ item: participantRow }) => (
                    <View style={styles.stageHybridCommunityRow}>
                      {participantRow.map((participant) => {
                        const isCurrentUser = participant.userId === currentUserParticipantId;
                        const mediaParticipant = stageMediaParticipantsByUserId[participant.userId] as CommunicationParticipantView | undefined;
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
                        const isRequesting = !!seatRequestsById[participant.userId] && participantState.role === "listener" && !isRemoved;
                        const presentation = participantPresentationById[participant.userId] ?? "compact";
                        const isExpanded = presentation === "expanded";
                        const canModerateParticipant = participantState.role !== "host";
                        const roleLabel = getParticipantLayerLabel({
                          state: participantState,
                          isFeatured,
                          isRequesting,
                        });
                        const participantDisplayName = isCurrentUser ? "You" : participant.displayName;
                        const showLocalRtcPreview = isCurrentUser && !!RTCView && !!localStreamURL && !heroOwnsLocalFeed;
                        const showRemoteLiveVideo = !isCurrentUser && !!RTCView && !!mediaParticipant?.streamURL && mediaParticipant.cameraOn;
                        const shouldUseHybridLiveKitVideo = isHybridMode && shouldRenderLiveKitStage && !!liveKitJoinContract;
                        const bubbleMediaUri = isCurrentUser
                          ? (heroOwnsLocalFeed ? (participant.avatarUrl || "") : (myCameraPreviewUrlRef.current || participant.cameraPreviewUrl || participant.avatarUrl || ""))
                          : (participant.cameraPreviewUrl || participant.avatarUrl || "");

                        return (
                          <TouchableOpacity
                            key={`hybrid-presence-${participant.userId}`}
                            activeOpacity={0.74}
                            style={[
                              styles.stageParticipantTile,
                              styles.stageParticipantTileGrid,
                              isExpanded && styles.stageParticipantTileExpandedGrid,
                              isFeatured && styles.stageParticipantTileFeaturedGrid,
                              isActiveParticipant && !isFeatured && styles.stageParticipantTileActive,
                              isRemoved && styles.stageParticipantTileRemoved,
                            ]}
                            onPress={() => {
                              if (isHost) {
                                debugLog("live-stage", "host tap user", { userId: participant.userId });
                              } else {
                                debugLog("live-stage", "request mic", { userId: participant.userId });
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
                              setSelectedParticipantId(participant.userId);
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
                                      style={styles.stageParticipantActionBtn}
                                      activeOpacity={0.82}
                                      onPress={() => {
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
                                        emitParticipantUpdate(participant.userId, { role: "speaker" });
                                        broadcastSeatState(participant.userId, {
                                          role: "speaker",
                                          isMuted,
                                          pending: false,
                                        });
                                      }}
                                    >
                                      <Text style={styles.stageParticipantActionText}>Approve Seat</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={styles.stageParticipantActionBtn}
                                      activeOpacity={0.82}
                                      onPress={() => {
                                        setSeatRequestsById((prev) => {
                                          if (!prev[participant.userId]) return prev;
                                          const next = { ...prev };
                                          delete next[participant.userId];
                                          return next;
                                        });
                                        broadcastSeatRequest(participant.userId, false);
                                      }}
                                    >
                                      <Text style={styles.stageParticipantActionText}>Deny</Text>
                                    </TouchableOpacity>
                                  </>
                                ) : null}
                                <TouchableOpacity
                                  style={styles.stageParticipantActionBtn}
                                  activeOpacity={0.82}
                                  onPress={() => {
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
                                          isMuted: current.role === "host" ? current.isMuted : !current.isMuted,
                                        },
                                      };
                                    });
                                    emitParticipantUpdate(participant.userId, { isMuted: !isMuted });
                                  }}
                                >
                                  <Text style={styles.stageParticipantActionText}>{isMuted ? "Unmute" : "Mute"}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.stageParticipantActionBtn}
                                  activeOpacity={0.82}
                                  onPress={() => {
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
                                          role: current.role === "host" ? "host" : current.role === "speaker" ? "listener" : "speaker",
                                        },
                                      };
                                    });
                                    emitParticipantUpdate(participant.userId, { role: isSpeakerRole ? "listener" : "speaker" });
                                    broadcastSeatState(participant.userId, {
                                      role: isSpeakerRole ? "listener" : "speaker",
                                      isMuted,
                                      pending: false,
                                    });
                                    setSeatRequestsById((prev) => {
                                      if (!prev[participant.userId]) return prev;
                                      const next = { ...prev };
                                      delete next[participant.userId];
                                      return next;
                                    });
                                  }}
                                >
                                  <Text style={styles.stageParticipantActionText}>{isSpeakerRole ? "Move to Audience" : "Seat Participant"}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={[styles.stageParticipantActionBtn, styles.stageParticipantActionBtnDanger]}
                                  activeOpacity={0.82}
                                  onPress={() => {
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
                                    emitParticipantUpdate(participant.userId, { isRemoved: !isRemoved });
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
                                  }}
                                >
                                  <Text style={[styles.stageParticipantActionText, styles.stageParticipantActionTextDanger]}>
                                    {isRemoved ? "Restore" : "Remove"}
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            ) : null}
                            <View style={[styles.stagePresenceTapWrap, styles.stagePresenceTapWrapGrid]}>
                              <Animated.View
                                style={[
                                  styles.stagePresenceBubble,
                                  styles.stagePresenceBubbleGrid,
                                  isExpanded && styles.stagePresenceBubbleExpandedGrid,
                                  isFeatured && styles.stagePresenceBubbleFeaturedGrid,
                                ]}
                              >
                                {isHostBubble ? <View style={styles.stagePresenceHostDot} /> : null}
                                {(shouldUseHybridLiveKitVideo || showLocalRtcPreview || bubbleMediaUri) ? (
                                  <View
                                    style={[
                                      styles.stagePresenceFaceClip,
                                      styles.stagePresenceFaceClipGrid,
                                      isExpanded && styles.stagePresenceFaceClipExpandedGrid,
                                      isFeatured && styles.stagePresenceFaceClipFeaturedGrid,
                                    ]}
                                  >
                                    {shouldUseHybridLiveKitVideo ? (
                                      <LiveKitHybridParticipantVideo
                                        participantId={participant.userId}
                                        remoteTrackIndex={lowerCommunityParticipantIndexById[participant.userId] ?? 0}
                                        fallback={bubbleMediaUri ? (
                                          <Image
                                            source={{ uri: bubbleMediaUri }}
                                            style={[
                                              styles.stagePresenceImage,
                                              styles.stagePresenceImageGrid,
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
                                          isExpanded && styles.stagePresenceImageExpandedGrid,
                                          isFeatured && styles.stagePresenceImageFeaturedGrid,
                                        ]}
                                      />
                                    )}
                                    {isCurrentUser && liveFaceFilter !== "none" && (shouldUseHybridLiveKitVideo || showLocalRtcPreview || !!bubbleMediaUri) ? (
                                      <View
                                        pointerEvents="none"
                                        style={[
                                          styles.stagePresenceFilterOverlay,
                                          {
                                            backgroundColor: activeLiveFaceFilter.overlayColor,
                                            borderColor: activeLiveFaceFilter.borderColor,
                                          },
                                        ]}
                                      />
                                    ) : null}
                                  </View>
                                ) : (
                                  <Text
                                    style={[
                                      styles.stagePresenceInitial,
                                      styles.stagePresenceInitialGrid,
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
                                {isMuted ? <Text style={styles.stagePresenceMutedIcon}>🔇</Text> : null}
                              </Animated.View>
                            </View>
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.stageParticipantName,
                                styles.stageParticipantNameGrid,
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
                      {participantRow.length === 1 && !featuredParticipantById[participantRow[0]?.userId] ? (
                        <View style={styles.stageHybridCommunitySpacer} />
                      ) : null}
                    </View>
                  )}
                />
              ) : (
                <View style={styles.stageCommunityEmptyState}>
                  <Text style={styles.stageCommunityEmptyText}>No party members in view yet.</Text>
                </View>
              )}
            </View>
          </View>
        ) : null}
        <View style={[styles.overlayBottom, { bottom: commentsLaneBottomOffset }]} pointerEvents="box-none">
          {stageControlsOpen ? (
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
                <TouchableOpacity
                  style={[styles.stageUtilityActionBtn, styles.stageUtilityActionBtnGhost]}
                  activeOpacity={0.84}
                  onPress={onReturnToLiveRoom}
                >
                  <Text style={[styles.stageUtilityActionText, styles.stageUtilityActionTextGhost]}>Back to Live Room</Text>
                </TouchableOpacity>
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
            </View>
          ) : null}

          {faceFilterSheetOpen ? (
            <View pointerEvents="auto" style={styles.stageUtilitySheet}>
              <View style={styles.stageUtilityHeader}>
                <View style={styles.stageUtilityHeaderCopy}>
                  <Text style={styles.stageUtilityKicker}>FACE FILTERS</Text>
                  <Text style={styles.stageUtilityTitle}>{activeLiveFaceFilter.label}</Text>
                </View>
                <TouchableOpacity
                  style={styles.stageUtilityDismissBtn}
                  activeOpacity={0.84}
                  onPress={() => setFaceFilterSheetOpen(false)}
                >
                  <Text style={styles.stageUtilityDismissText}>Done</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.stageUtilityBody}>
                Filters only change your camera view on this stage.
              </Text>
              <Text style={styles.stageUtilityHelper}>{activeLiveFaceFilter.subtitle}</Text>
              <View style={styles.stageFilterRow}>
                {LIVE_FACE_FILTER_OPTIONS.map((option) => {
                  const active = liveFaceFilter === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.stageFilterChip, active && styles.stageFilterChipActive]}
                      activeOpacity={0.84}
                      onPress={() => setLiveFaceFilter(option.id)}
                    >
                      <Text style={[styles.stageFilterChipText, active && styles.stageFilterChipTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

        </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.stageDockOverlay,
            {
              paddingBottom: liveDockBottomInset,
              opacity: stageOverlayOpacity,
              transform: [{ translateY: stageOverlayTranslate }],
            },
          ]}
          pointerEvents={stageOverlayVisible ? "auto" : "none"}
        >
        <View style={[styles.liveStageLowerDock, styles.liveStageLowerDockHybrid]}>
          <View style={[styles.modeRow, styles.modeRowHybrid]}>
            <TouchableOpacity
              style={[styles.modeBtn, isLiveFirstMode && styles.modeBtnOn]}
              activeOpacity={0.82}
              onPress={() => updateStageMode("live")}
            >
              <Text style={[styles.modeBtnText, isLiveFirstMode && styles.modeBtnTextOn]}>Live-First</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, isHybridMode && styles.modeBtnOn]}
              activeOpacity={0.82}
              onPress={() => updateStageMode("hybrid")}
            >
              <Text style={[styles.modeBtnText, isHybridMode && styles.modeBtnTextOn]}>{branding.watchPartyLabel}</Text>
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
                  </View>
                ))
              ) : (
                <Text style={styles.stageHybridCommentEmpty}>
                  Room comments will land here. Say something to get it moving.
                </Text>
              )}
            </ScrollView>

            <View style={styles.stageHybridCommentInputRow}>
              <TextInput
                ref={hybridCommentInputRef}
                value={hybridCommentDraft}
                onChangeText={setHybridCommentDraft}
                onFocus={() => {
                  revealStageOverlay();
                  setStageMenuOpen(false);
                  setStageControlsOpen(false);
                  setFaceFilterSheetOpen(false);
                  setReactionPickerOpen(false);
                  setCommentsOpen(true);
                }}
                placeholder={hybridCommentPlaceholder}
                placeholderTextColor="rgba(190,206,232,0.72)"
                returnKeyType="send"
                blurOnSubmit={false}
                editable={!hybridCommentSending}
                onSubmitEditing={() => {
                  void onSendHybridComment();
                }}
                style={styles.stageHybridCommentInput}
              />
              <TouchableOpacity
                style={[
                  styles.stageHybridCommentSendButton,
                  (!hybridCommentDraft.trim() || hybridCommentSending) && styles.stageHybridCommentSendButtonDisabled,
                ]}
                activeOpacity={0.84}
                disabled={!hybridCommentDraft.trim() || hybridCommentSending}
                onPress={() => {
                  void onSendHybridComment();
                }}
              >
                <Text style={styles.stageHybridCommentSendText}>
                  {hybridCommentSending ? "Sending" : "Send"}
                </Text>
              </TouchableOpacity>
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
            onSelectReactionFromPicker(emoji);
          }}
          recentEmojis={recentReactionEmojis}
          title="React"
          subtitle="Browse and tap to send"
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
        </Animated.View>
        </>
        </ConditionalWrap>
        ) : null}
      </View>

      <ParticipantDetailSheet
        visible={!!selectedParticipant}
        participant={selectedParticipant}
        participantState={selectedParticipantState}
        isFeatured={!!(selectedParticipant && featuredParticipantById[selectedParticipant.userId])}
        isRequesting={!!(selectedParticipant && seatRequestsById[selectedParticipant.userId])}
        canShowProfileAction={canShowProfileAction}
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
      <InternalInviteSheet
        visible={inviteSheetVisible}
        sourceSurface="live-room"
        title="Invite people to this live room"
        body="Find a Chi'llywood member, send the live-room code inside Chi'lly Chat, or fall back to system share if you need to leave the app."
        inviteMessage={`Join me in a Chi'llywood live room.\n\nRoom code: ${liveRoomShareCode}\n\nOpen Chi'llywood -> Live Watch-Party -> enter the code to join the live room.`}
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
  liveRoomSurface: { flex: 1 },
  liveRoomSurfaceScroll: { flex: 1 },
  liveRoomSurfaceContent: { paddingBottom: 20 },
  liveRoomFooter: {
    paddingTop: 8,
    paddingHorizontal: 2,
    backgroundColor: "rgba(6,8,14,0.88)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.06)",
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
    gap: 10,
  },
  stageTopChromeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  stageTopChromeActions: {
    alignItems: "flex-end",
    gap: 8,
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
  stageTopMenuSheet: {
    alignSelf: "flex-end",
    width: 248,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(154,182,246,0.24)",
    backgroundColor: "rgba(6,10,18,0.92)",
    padding: 10,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  stageTopMenuItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 11,
    paddingVertical: 10,
  },
  stageTopMenuItemActive: {
    borderColor: "rgba(172,196,255,0.34)",
    backgroundColor: "rgba(120,156,245,0.14)",
  },
  stageTopMenuItemIcon: {
    color: "#F4F7FF",
    fontSize: 16,
    lineHeight: 18,
  },
  stageTopMenuItemCopy: {
    flex: 1,
    gap: 2,
  },
  stageTopMenuItemTitle: {
    color: "#F5F8FF",
    fontSize: 12.5,
    fontWeight: "800",
  },
  stageTopMenuItemBody: {
    color: "#B8C6E0",
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "600",
  },
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
    shadowColor: "#DC143C",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
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
  modeBtnText: { color: "#C8C8C8", fontSize: 11.5, fontWeight: "800" },
  modeBtnTextOn: { color: "#fff" },

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
  stageHeroFallbackBody: {
    marginTop: 12,
    color: "#C9D4E9",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
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
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(5,7,14,0.88)",
    shadowColor: "#000000",
    shadowOpacity: 0.24,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
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
  stageHybridDeck: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 31,
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
    borderColor: "rgba(172,196,255,0.2)",
    backgroundColor: "rgba(4,8,18,0.18)",
    overflow: "hidden",
    justifyContent: "flex-end",
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
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
    width: 228,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(168,192,245,0.2)",
    backgroundColor: "rgba(6,10,18,0.54)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
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
    gap: 9,
  },
  stageHybridCommunitySpacer: {
    width: "47.5%",
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
  stageHybridMediaScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,9,18,0.76)",
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
    ...StyleSheet.absoluteFillObject,
    alignItems: "flex-end",
    justifyContent: "flex-end",
    paddingBottom: 70,
    paddingRight: 22,
  },
  floatingReactionEmoji: {
    position: "absolute",
    bottom: 12,
    fontSize: 34,
    fontWeight: "900",
  },

  overlayBottom: {
    position: "absolute",
    left: 14,
    right: 14,
    zIndex: 30,
    gap: 10,
  },
  stageOverlayPanelWrap: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  stageDockOverlay: {
    position: "absolute",
    left: 14,
    right: 14,
    bottom: 0,
    zIndex: 29,
  },
  liveStageLowerDock: {
    borderRadius: 26,
    borderWidth: 1,
    borderColor: "rgba(154,182,246,0.18)",
    backgroundColor: "rgba(6,10,18,0.52)",
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(160,188,245,0.14)",
    backgroundColor: "rgba(7,12,22,0.38)",
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 4,
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
  stageParticipantTile: {
    width: 68,
    minHeight: 78,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(184,206,246,0.14)",
    backgroundColor: "rgba(10,16,27,0.58)",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 7,
    shadowColor: "#000",
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    position: "relative",
  },
  stageParticipantTileGrid: {
    width: "47.5%",
    minHeight: 132,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 16,
    alignItems: "stretch",
    justifyContent: "flex-start",
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
    width: "47.5%",
    minHeight: 90,
    paddingHorizontal: 7,
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
    width: "100%",
    minHeight: 92,
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
    height: 76,
    borderRadius: 14,
  },
  stagePresenceBubbleExpanded: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  stagePresenceBubbleExpandedGrid: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  stagePresenceBubbleFeatured: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginHorizontal: 2,
  },
  stagePresenceBubbleFeaturedGrid: {
    width: 44,
    height: 44,
    borderRadius: 22,
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
  stagePresenceInitial: { color: "#ECECEC", fontSize: 13, fontWeight: "900" },
  stagePresenceInitialExpanded: { fontSize: 18 },
  stagePresenceInitialFeatured: { fontSize: 21 },
  stagePresenceInitialGrid: { fontSize: 12 },
  stagePresenceInitialExpandedGrid: { fontSize: 14 },
  stagePresenceInitialFeaturedGrid: { fontSize: 16 },
  stagePresenceImage: { width: "100%", height: "100%", borderRadius: 12 },
  stagePresenceImageExpanded: { borderRadius: 18 },
  stagePresenceImageFeatured: { borderRadius: 22 },
  stagePresenceImageGrid: { borderRadius: 14 },
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
    left: -8,
    bottom: -8,
    fontSize: 10,
    lineHeight: 10,
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
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  stageParticipantActionBtnDanger: {
    borderColor: "rgba(220,20,60,0.5)",
    backgroundColor: "rgba(220,20,60,0.2)",
  },
  stageParticipantActionText: {
    color: "#EAF0FA",
    fontSize: 9,
    fontWeight: "800",
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
