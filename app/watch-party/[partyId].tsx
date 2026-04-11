import type { RealtimeChannel } from "@supabase/supabase-js";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";












import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Animated,
    AppState,
    Image,
    ImageBackground,
    type ImageSourcePropType,
    KeyboardAvoidingView,
    LayoutAnimation,
    Platform,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { titles as localTitles } from "../../_data/titles";
import {
    DEFAULT_APP_CONFIG,
    readAppConfig,
    resolveBrandingConfig,
    resolveFeatureConfig,
    resolveMonetizationConfig,
} from "../../_lib/appConfig";
import { trackEvent } from "../../_lib/analytics";
import { getBetaAccessBlockCopy, useBetaProgram } from "../../_lib/betaProgram";
import {
    reportDebugError,
    reportDebugParty,
    reportDebugQuery,
} from "../../_lib/devDebug";
import { debugLog, reportRuntimeError } from "../../_lib/logger";
import { buildSafetyReportContext, submitSafetyReport, trackModerationActionUsed } from "../../_lib/moderation";
import {
    getMonetizationAccessSheetPresentation,
} from "../../_lib/monetization";
import type { RoomAccessDecision } from "../../_lib/roomRules";
import { useSession } from "../../_lib/session";
import { supabase } from "../../_lib/supabase";
import { buildUserChannelProfile, readUserProfile, saveLastPartySession, type UserProfile } from "../../_lib/userData";
import {
    applyHostAction,
    evaluatePartyRoomAccess,
    getActivePartyMemberships,
    getPartyRoom,
    getPartyRoomSnapshot,
    getSafePartyUserId,
    joinPartyRoomSession,
    setPartyRoomPolicies,
    setPartyParticipantState,
    touchPartyRoomSession,
    type WatchPartyRoomMembership,
    type WatchPartyState,
} from "../../_lib/watchParty";
import { LiveBottomStrip, type LiveBottomStripParticipant } from "../../components/room/live-bottom-strip";
import { AccessSheet, type AccessSheetReason } from "../../components/monetization/access-sheet";
import { InternalInviteSheet } from "../../components/chat/internal-invite-sheet";
import { ReportSheet } from "../../components/safety/report-sheet";
import { BetaAccessScreen } from "../../components/system/beta-access-screen";
import { ParticipantDetailSheet } from "../../components/room/participant-detail-sheet";
import { RoomParticipantTile } from "../../components/room/participant-tile";
import { RoomCodeInviteCard } from "../../components/room/room-code-invite-card";
import { ProtectedSessionNote, getProtectedSessionCopy } from "../../components/prototype/protected-session-note";
import {
    buildOrderedParticipantsWithSelf,
    buildPartyRoomParticipantEntries,
    buildParticipantProfileParams,
    buildSharedRoomLabels,
    buildSharedParticipantIdentity,
    computeBottomStripParticipants,
    computeDominantSpeakerId,
    createDefaultParticipantState,
    getInitials,
    getParticipantRoleLabel,
    mergeMissingParticipantStates,
    normalizeSharedRoomMode,
    prioritizeParticipantStripOrder,
    resolveIdentityName,
    resolveSelectedParticipantContext,
    shouldShowHostControls,
    type SharedParticipantIdentity,
    type SharedParticipantLocalState,
} from "./_lib/_room-shared";

type ConnState = "loading" | "connecting" | "live" | "reconnecting" | "error";

type MonetizationGate = {
  source: "room";
  access: RoomAccessDecision;
  accessKey: string;
};

type LocalMsg = {
  id: string;
  kind: "chat" | "reaction" | "system";
  body: string;
  authorLabel: string;
  isMe: boolean;
  ts: number;
};

type RoomChatMessageRow = {
  id: string;
  party_id: string;
  user_id: string;
  username: string;
  text: string;
  created_at: string;
};

type PresenceParticipant = SharedParticipantIdentity & {
  avatarIndex?: number;
};

type LiveBubbleParticipant = PresenceParticipant & {
  isPlaceholder?: boolean;
};

type ParticipantReaction = {
  emoji: string;
  ts: number;
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

const MIC_SPEAKING_THRESHOLD_DB = -52;
const MIC_SPEAKING_RELEASE_MS = 420;
const ROOM_HEARTBEAT_INTERVAL_MILLIS = 10_000;
const getSafeRoomTitleLabel = (titleName: string | null, room: WatchPartyState, fallbackLabel: string) => {
  const resolvedTitle = String(titleName ?? "").trim();
  if (resolvedTitle) return resolvedTitle;
  return room.roomType === "title" ? "Selected Title" : fallbackLabel;
};

export default function WatchPartyRoomScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const { isLoading: authLoading, isSignedIn } = useSession();
  const { accessState, isLoading: betaLoading, isActive } = useBetaProgram();
  const { partyId: partyIdParam, titleId: titleIdParam, roomCode: roomCodeParam, mode: modeParam, source: sourceParam } = useLocalSearchParams<{
    partyId?: string;
    titleId?: string;
    roomCode?: string;
    mode?: string;
    source?: string;
  }>();
  const router = useRouter();

  const partyId = (Array.isArray(partyIdParam) ? partyIdParam[0] : partyIdParam) ?? "";
  const titleIdHint = Array.isArray(titleIdParam) ? titleIdParam[0] : titleIdParam;
  const roomCodeHint = String(Array.isArray(roomCodeParam) ? roomCodeParam[0] : roomCodeParam ?? "").trim().toUpperCase();
  const roomModeParam = Array.isArray(modeParam) ? modeParam[0] : modeParam;
  const source = String(Array.isArray(sourceParam) ? sourceParam[0] : sourceParam ?? "").trim().toLowerCase();
  const sharedRoomMode = normalizeSharedRoomMode(roomModeParam, "live");
  const canUseBetaRoom = isSignedIn && isActive;
  const blockedBetaCopy = getBetaAccessBlockCopy(accessState.status, "Watch-party rooms");

  // ── Core state ───────────────────────────────────────────────────────────────
  const [room, setRoom] = useState<WatchPartyState | null>(null);
  const [myRole, setMyRole] = useState<"host" | "viewer" | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [titleName, setTitleName] = useState<string | null>(null);

  // ── Connection ───────────────────────────────────────────────────────────────
  const [connState, setConnState] = useState<ConnState>("loading");

  // ── Participants (presence) ──────────────────────────────────────────────────
  const [participants, setParticipants] = useState<PresenceParticipant[]>([]);

  // ── Chat ─────────────────────────────────────────────────────────────────────
  const [, setMessages] = useState<LocalMsg[]>([]);
  const isLive = true;
  const [, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [participantReactions, setParticipantReactions] = useState<Record<string, ParticipantReaction>>({});
  const [featuredParticipantById, setFeaturedParticipantById] = useState<Record<string, boolean>>({});
  const [activeParticipantId, setActiveParticipantId] = useState<string>("");
  const [participantPresentationById, setParticipantPresentationById] = useState<Record<string, "compact" | "expanded">>({});
  const [participantStateById, setParticipantStateById] = useState<Record<string, SharedParticipantLocalState>>({});
  const [isSpeakingById, setIsSpeakingById] = useState<Record<string, boolean>>({});
  const [tapPulseById, setTapPulseById] = useState<Record<string, boolean>>({});
  const [selectedParticipant, setSelectedParticipant] = useState<LiveBubbleParticipant | null>(null);
  const [hiddenParticipantIds, setHiddenParticipantIds] = useState<Record<string, boolean>>({});
  const [appConfig, setAppConfig] = useState(DEFAULT_APP_CONFIG);
  const [accessGate, setAccessGate] = useState<MonetizationGate | null>(null);
  const [accessSheetVisible, setAccessSheetVisible] = useState(false);
  const [inviteSheetVisible, setInviteSheetVisible] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: "room" | "participant"; targetId: string; label: string } | null>(null);
  const [joinRetryToken, setJoinRetryToken] = useState(0);
  const chatScrollRef = useRef<ScrollView>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  // ── Host controls (broadcast-driven) ────────────────────────────────────────
  const [reactionsGloballyMuted, setReactionsGloballyMuted] = useState(false);
  const [roomLocked, setRoomLocked] = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const lastRoomUpdatedAtRef = useRef<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatChannelRef = useRef<RealtimeChannel | null>(null);
  const roomChatRealtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const roomRealtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const membershipMapRef = useRef<Record<string, WatchPartyRoomMembership>>({});
  const myUserIdRef = useRef<string | null>(null);
  const myUsernameRef = useRef<string>("");
  const myProfileUsernameRef = useRef<string>("");
  const myCameraPreviewUrlRef = useRef<string>("");
  const myRoleRef = useRef<"host" | "viewer" | null>(null);
  const reactionCounterRef = useRef(0);
  const participantReactionTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const micRecordingRef = useRef<Audio.Recording | null>(null);
  const micSpeakingRef = useRef(false);
  const micReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapPulseTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const activityPulse = useRef(new Animated.Value(0)).current;
  const liveBubbleOrderRef = useRef<string>("");
  const branding = resolveBrandingConfig(appConfig);
  const features = resolveFeatureConfig(appConfig);
  const monetizationConfig = resolveMonetizationConfig(appConfig);

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
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
    return () => {
      Object.values(tapPulseTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId));
      tapPulseTimeoutsRef.current = {};
    };
  }, []);

  const triggerBubbleTapPulse = useCallback((participantId: string) => {
    if (!participantId) return;
    LayoutAnimation.configureNext({
      duration: 140,
      update: { type: LayoutAnimation.Types.easeOut },
    });
    setTapPulseById((prev) => ({ ...prev, [participantId]: true }));
    if (tapPulseTimeoutsRef.current[participantId]) clearTimeout(tapPulseTimeoutsRef.current[participantId]);
    tapPulseTimeoutsRef.current[participantId] = setTimeout(() => {
      LayoutAnimation.configureNext({
        duration: 140,
        update: { type: LayoutAnimation.Types.easeOut },
      });
      setTapPulseById((prev) => ({ ...prev, [participantId]: false }));
      delete tapPulseTimeoutsRef.current[participantId];
    }, 150);
  }, []);

  // ── Helper: append message ───────────────────────────────────────────────────
  const addMsg = useCallback((msg: LocalMsg) => {
    setMessages((prev) => {
      if (prev.some((existing) => existing.id === msg.id)) return prev;
      return [...prev.slice(-199), msg];
    });
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 60);
  }, []);

  const flashReaction = useCallback((emoji: string) => {
    const dominantCandidate = participants.find((participant) => {
      const participantState = participantStateById[participant.userId];
      const isMuted = participantState?.isMuted ?? !!participant.isMuted;
      const role = participantState?.role ?? (participant.role === "host" ? "host" : participant.isSpeaking ? "speaker" : "listener");
      const isSpeakerRole = role === "speaker";
      return !isMuted && !!(isSpeakingById[participant.userId] || (isSpeakerRole && participant.isSpeaking));
    });
    const dominantIndex = dominantCandidate ? participants.findIndex((participant) => participant.userId === dominantCandidate.userId) : -1;
    const dominantBiasX = dominantIndex >= 0 && participants.length > 1
      ? ((dominantIndex / (participants.length - 1)) - 0.5) * 44
      : 0;
    const id = `reaction-${Date.now()}-${reactionCounterRef.current++}`;
    const originX = Math.round(dominantBiasX);
    const drift = Math.floor(Math.random() * 72) - 36;
    const rise = new Animated.Value(0);
    const opacity = new Animated.Value(1);
    const scale = new Animated.Value(0.88);

    const entry: FloatingReaction = { id, emoji, originX, drift, rise, opacity, scale };
    setFloatingReactions((prev) => [...prev, entry]);

    Animated.parallel([
      Animated.timing(rise, { toValue: -180, duration: 1680, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0, duration: 1680, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.12, duration: 240, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.0, duration: 1440, useNativeDriver: true }),
      ]),
    ]).start(() => {
      setFloatingReactions((prev) => prev.filter((reaction) => reaction.id !== id));
    });
  }, [participants, participantStateById, isSpeakingById]);

  const attachReactionToParticipant = useCallback((userId: string, emoji: string) => {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) return;

    const existing = participantReactionTimeoutsRef.current[safeUserId];
    if (existing) clearTimeout(existing);

    setParticipantReactions((prev) => ({
      ...prev,
      [safeUserId]: { emoji, ts: Date.now() },
    }));

    participantReactionTimeoutsRef.current[safeUserId] = setTimeout(() => {
      setParticipantReactions((prev) => {
        const next = { ...prev };
        delete next[safeUserId];
        return next;
      });
      delete participantReactionTimeoutsRef.current[safeUserId];
    }, 1400);
  }, []);

  const syncRoomFromSnapshot = useCallback((snapshot: { room: WatchPartyState; memberships: WatchPartyRoomMembership[] }, userId?: string | null) => {
    setRoom(snapshot.room);
    lastRoomUpdatedAtRef.current = snapshot.room.updatedAt;
    membershipMapRef.current = Object.fromEntries(snapshot.memberships.map((membership) => [membership.userId, membership]));
    setReactionsGloballyMuted(snapshot.room.reactionsPolicy === "muted");
    setRoomLocked(snapshot.room.joinPolicy === "locked");

    const resolvedUserId = String(userId ?? myUserIdRef.current ?? "").trim();
    const selfMembership = resolvedUserId ? snapshot.memberships.find((membership) => membership.userId === resolvedUserId) ?? null : null;
    const nextRole: "host" | "viewer" = resolvedUserId && resolvedUserId === snapshot.room.hostUserId
      ? "host"
      : (selfMembership?.role === "host" ? "host" : "viewer");
    setMyRole(nextRole);
    myRoleRef.current = nextRole;

    const nextParticipantStateById: Record<string, SharedParticipantLocalState> = {};
    getActivePartyMemberships(snapshot.memberships).forEach((membership) => {
      const state = membership.membershipState;
      if (state === "removed" || state === "left") return;
      nextParticipantStateById[membership.userId] = {
        isMuted: membership.isMuted,
        role: membership.stageRole,
        isRemoved: false,
      };
    });
    setParticipantStateById(nextParticipantStateById);
  }, []);

  const refreshRoomSnapshot = useCallback(async (userId?: string | null) => {
    const snapshot = await getPartyRoomSnapshot(partyId).catch(() => null);
    if (!snapshot) return null;
    syncRoomFromSnapshot(snapshot, userId);
    return snapshot;
  }, [partyId, syncRoomFromSnapshot]);

  const buildPresenceParticipants = useCallback((options: {
    state: Record<string, { userId?: string; username?: string; role?: string; avatarIndex?: number; avatarUrl?: string; cameraPreviewUrl?: string; camera_preview_url?: string; isLive?: boolean; isSpeaking?: boolean; isMuted?: boolean }[] | undefined>;
    trackedUserId: string;
  }) => {
    const activeMemberships = getActivePartyMemberships(Object.values(membershipMapRef.current))
      .filter((membership) => membership.membershipState !== "removed" && membership.membershipState !== "left");
    const seenIds = new Set<string>([
      ...Object.keys(options.state),
      ...activeMemberships.map((membership) => membership.userId),
    ]);

    return [...seenIds].map<PresenceParticipant | null>((presenceKey) => {
      const presArr = options.state[presenceKey];
      const presence = Array.isArray(presArr)
        ? presArr[0] as { userId?: string; username?: string; role?: string; avatarIndex?: number; avatarUrl?: string; cameraPreviewUrl?: string; camera_preview_url?: string; isLive?: boolean; isSpeaking?: boolean; isMuted?: boolean }
        : undefined;
      const normalizedUserId = String(presence?.userId ?? presenceKey).trim();
      if (!normalizedUserId) return null;

      const membership = membershipMapRef.current[normalizedUserId];
      if (membership && (membership.membershipState === "removed" || membership.membershipState === "left")) return null;

      const normalizedCameraPreviewUrl = String(
        presence?.cameraPreviewUrl
          ?? presence?.camera_preview_url
          ?? membership?.cameraPreviewUrl
          ?? "",
      ).trim() || (normalizedUserId === options.trackedUserId ? myCameraPreviewUrlRef.current : "");
      const identity = buildSharedParticipantIdentity({
        userId: normalizedUserId,
        role: membership?.role ?? presence?.role,
        displayNameCandidates: [
          presence?.username,
          membership?.displayName,
          normalizedUserId === options.trackedUserId ? myProfileUsernameRef.current : "",
          "Guest",
        ],
        avatarUrl: String(presence?.avatarUrl ?? membership?.avatarUrl ?? "").trim(),
        cameraPreviewUrl: normalizedCameraPreviewUrl,
        currentUserId: options.trackedUserId,
        isLive: typeof presence?.isLive === "boolean" ? presence.isLive : membership?.membershipState === "active",
        isSpeaking: typeof presence?.isSpeaking === "boolean" ? presence.isSpeaking : undefined,
        isMuted: membership?.isMuted ?? presence?.isMuted,
      });

      return {
        ...identity,
        avatarIndex: presence?.avatarIndex,
      };
    }).filter(Boolean) as PresenceParticipant[];
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(activityPulse, { toValue: 1, duration: 860, useNativeDriver: true }),
        Animated.timing(activityPulse, { toValue: 0, duration: 860, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [activityPulse]);

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!canUseBetaRoom) {
      setLoading(false);
      setConnState("error");
      return;
    }
    if (!partyId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setNotFound(false);
    setAccessGate(null);

    const bootstrap = async () => {
      try {
        const profile = await readUserProfile();
        let profileCameraPreviewUrl = "";
        try {
          const authUser = await supabase.auth.getUser();
          const metadata = authUser.data.user?.user_metadata as Record<string, unknown> | undefined;
          profileCameraPreviewUrl = String(metadata?.camera_preview_url ?? metadata?.cameraPreviewUrl ?? "").trim();
        } catch {
          profileCameraPreviewUrl = "";
        }

        // Get session
        const userId = await getSafePartyUserId();
        if (cancelled) return;

        myUserIdRef.current = userId;
        myProfileUsernameRef.current = resolveIdentityName(profile?.username, "Guest");
        myCameraPreviewUrlRef.current = profileCameraPreviewUrl;

        const snapshot = await getPartyRoomSnapshot(partyId).catch(() => null);
        if (cancelled) return;

        if (!snapshot) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        syncRoomFromSnapshot(snapshot, userId);
        const currentMembership = snapshot.memberships.find((membership) => membership.userId === userId) ?? null;
        const access = await evaluatePartyRoomAccess({
          partyId,
          userId,
          room: snapshot.room,
          membership: currentMembership,
        }).catch(() => null);

        if (cancelled) return;

        if (access?.canJoin) {
          await joinPartyRoomSession({
            partyId,
            userId,
            role: userId === snapshot.room.hostUserId ? "host" : "viewer",
            canSpeak: userId === snapshot.room.hostUserId,
            cameraEnabled: !!profileCameraPreviewUrl,
            micEnabled: true,
            displayName: myProfileUsernameRef.current,
            cameraPreviewUrl: profileCameraPreviewUrl,
          }).catch(() => null);
          if (!cancelled) {
            await refreshRoomSnapshot(userId).catch(() => null);
          }
        } else if (access?.reason === "identity_required") {
          setConnState("error");
        } else if (access && (access.reason === "premium_required" || access.reason === "party_pass_required")) {
          trackEvent("monetization_gate_shown", {
            surface: "watch-party-room",
            reason: access.reason,
            roomId: snapshot.room.partyId,
          });
          setAccessGate({
            source: "room",
            access,
            accessKey: snapshot.room.partyId,
          });
          setAccessSheetVisible(true);
          setLoading(false);
          return;
        } else if (access && !access.canJoin) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        if (snapshot.room.titleId) {
          supabase
            .from("titles")
            .select("title")
            .eq("id", snapshot.room.titleId)
            .maybeSingle()
            .then(
              ({ data }) => { if (data?.title && !cancelled) setTitleName(String(data.title)); },
              () => {},
            );
        } else {
          setTitleName("Live Room");
        }

        const { data: recentRows } = await supabase
          .from("watch_party_room_messages")
          .select("id, party_id, user_id, username, text, created_at")
          .eq("party_id", partyId)
          .order("created_at", { ascending: false })
          .limit(120)
          .returns<RoomChatMessageRow[]>();

        if (!cancelled && recentRows?.length) {
          const loaded: LocalMsg[] = [...recentRows]
            .reverse()
            .map((row) => ({
              id: String(row.id),
              kind: "chat",
              body: String(row.text ?? ""),
              authorLabel: String(row.user_id) === String(userId) ? "You" : resolveIdentityName(row.username, "Guest"),
              isMe: String(row.user_id) === String(userId),
              ts: new Date(String(row.created_at ?? new Date().toISOString())).getTime(),
            }));
          setMessages(loaded);
        }

        setLoading(false);

        pollRef.current = setInterval(() => {
          refreshRoomSnapshot(userId).catch(() => {});
        }, 5000);

        if (access?.canJoin) {
          heartbeatRef.current = setInterval(() => {
            void touchPartyRoomSession({
              partyId,
              userId,
              role: myRoleRef.current === "host" ? "host" : "viewer",
              canSpeak: myRoleRef.current === "host",
              cameraEnabled: !!myCameraPreviewUrlRef.current,
              micEnabled: true,
              displayName: myProfileUsernameRef.current,
              cameraPreviewUrl: myCameraPreviewUrlRef.current,
            }).then(() => refreshRoomSnapshot(userId));
          }, ROOM_HEARTBEAT_INTERVAL_MILLIS);
        }

        if (partyId && snapshot.room.titleId) {
          await saveLastPartySession({ partyId, titleId: snapshot.room.titleId, joinedAt: Date.now() }).catch(() => {});
        }

        startChatChannel(userId, myRoleRef.current === "host" ? "host" : "viewer", snapshot.room, profile);
        startRoomRealtimeSync();
        startRoomChatRealtimeSync();
      } catch {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
      if (pollRef.current) clearInterval(pollRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (chatChannelRef.current) {
        supabase.removeChannel(chatChannelRef.current);
        chatChannelRef.current = null;
      }
      if (roomChatRealtimeChannelRef.current) {
        supabase.removeChannel(roomChatRealtimeChannelRef.current);
        roomChatRealtimeChannelRef.current = null;
      }
      if (roomRealtimeChannelRef.current) {
        supabase.removeChannel(roomRealtimeChannelRef.current);
        roomRealtimeChannelRef.current = null;
      }
      Object.values(participantReactionTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId));
      participantReactionTimeoutsRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseBetaRoom, joinRetryToken, partyId, refreshRoomSnapshot, syncRoomFromSnapshot]);

  // ── Chat + Presence channel ──────────────────────────────────────────────────
  const startChatChannel = useCallback(
    (userId: string | null, role: "host" | "viewer", fetchedRoom: WatchPartyState, profile: UserProfile | null) => {
      if (chatChannelRef.current) supabase.removeChannel(chatChannelRef.current);
      setConnState("connecting");

      const safeUserId = String(userId ?? "").trim();
      const trackedUserId = safeUserId || "anon";
      const username = resolveIdentityName(profile?.username, "Guest");
      myUsernameRef.current = username;

      const channel = supabase.channel(`room-${partyId}`, {
        config: { presence: { key: trackedUserId } },
      });

      // Presence sync → participant list
      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ userId?: string; username?: string; role?: string; avatarIndex?: number; avatarUrl?: string; cameraPreviewUrl?: string; camera_preview_url?: string; isLive?: boolean; isSpeaking?: boolean; isMuted?: boolean }>();
        const list = buildPresenceParticipants({
          state,
          trackedUserId,
        });
        setParticipants(list);
      });

      // Presence join → system message
      channel.on("presence", { event: "join" }, ({ key, newPresences }: any) => {
        const newPres = Array.isArray(newPresences) ? newPresences[0] : newPresences;
        const joinedUserId = String(newPres?.userId ?? key ?? "").trim();
        const displayName = resolveIdentityName(newPres?.username, joinedUserId === trackedUserId ? myProfileUsernameRef.current : "", "Guest");
        addMsg({
          id: `join-${Date.now()}`,
          kind: "system",
          body: `${displayName} joined`,
          authorLabel: "System",
          isMe: false,
          ts: Date.now(),
        });
      });

      // Presence leave → system message
      channel.on("presence", { event: "leave" }, ({ key, leftPresences }: any) => {
        const leftPres = Array.isArray(leftPresences) ? leftPresences[0] : leftPresences;
        const leftUserId = String(leftPres?.userId ?? key ?? "").trim();
        const displayName = resolveIdentityName(leftPres?.username, leftUserId === trackedUserId ? myProfileUsernameRef.current : "", "Guest");
        addMsg({
          id: `leave-${Date.now()}`,
          kind: "system",
          body: `${displayName} left`,
          authorLabel: "System",
          isMe: false,
          ts: Date.now(),
        });
      });

      // Incoming chat messages
      // Incoming reactions (for chat display + floating overlay)
      channel.on("broadcast", { event: "reaction" }, ({ payload }: { payload: Record<string, unknown> }) => {
        if (!payload?.emoji) return;
        const emoji = String(payload.emoji);
        const reactionUserId = String(payload.userId ?? "").trim();
        flashReaction(emoji);
        if (reactionUserId) attachReactionToParticipant(reactionUserId, emoji);
        addMsg({
          id: `react-${Date.now()}-${Math.random()}`,
          kind: "reaction",
          body: emoji,
          authorLabel: String(payload.authorLabel ?? "?"),
          isMe: payload.userId === myUserIdRef.current,
          ts: Date.now(),
        });
        // Broadcast for floating overlay on player
        if (chatChannelRef.current) {
          chatChannelRef.current
            .send({ type: "broadcast", event: "floating_reaction", payload })
            .catch(() => {});
        }
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

      // Subscribe → track presence once confirmed
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setConnState("live");
          await channel.track({
            userId: trackedUserId,
            username,
            isLive,
            role: membershipMapRef.current[trackedUserId]?.role ?? role,
            avatarIndex: profile?.avatarIndex ?? 0,
            cameraPreviewUrl: myCameraPreviewUrlRef.current || undefined,
            isMuted: membershipMapRef.current[trackedUserId]?.isMuted ?? false,
          });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnState("reconnecting");
          void touchPartyRoomSession({
            partyId,
            userId: trackedUserId,
            role: membershipMapRef.current[trackedUserId]?.role ?? role,
            canSpeak: membershipMapRef.current[trackedUserId]?.canSpeak ?? (role === "host"),
            cameraEnabled: !!myCameraPreviewUrlRef.current,
            micEnabled: true,
            displayName: myProfileUsernameRef.current,
            cameraPreviewUrl: myCameraPreviewUrlRef.current,
            membershipState: "reconnecting",
          }).catch(() => null);
        } else if (status === "CLOSED") {
          setConnState("error");
        }
      });

      chatChannelRef.current = channel;
    },
    [partyId, addMsg, attachReactionToParticipant, buildPresenceParticipants, flashReaction, isLive],
  );

  const startRoomChatRealtimeSync = useCallback(() => {
    if (!partyId) return;

    if (roomChatRealtimeChannelRef.current) {
      supabase.removeChannel(roomChatRealtimeChannelRef.current);
      roomChatRealtimeChannelRef.current = null;
    }

    const channel = supabase
      .channel(`room-chat-${partyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "watch_party_room_messages",
          filter: `party_id=eq.${partyId}`,
        },
        (payload) => {
          const row = payload.new as RoomChatMessageRow;
          const rowId = String(row.id ?? "").trim();
          const rowUserId = String(row.user_id ?? "").trim();
          const rowUsername = resolveIdentityName(row.username, "Guest");
          const rowText = String(row.text ?? "");
          if (!rowId || !rowText) return;

          addMsg({
            id: rowId,
            kind: "chat",
            body: rowText,
            authorLabel: rowUserId === String(myUserIdRef.current ?? "").trim() ? "You" : rowUsername,
            isMe: rowUserId === String(myUserIdRef.current ?? "").trim(),
            ts: new Date(String(row.created_at ?? new Date().toISOString())).getTime(),
          });
        },
      )
      .subscribe();

    roomChatRealtimeChannelRef.current = channel;
  }, [partyId, addMsg]);

  const myUserId = String(myUserIdRef.current ?? "").trim();
  const isNativeCameraPlatform = Platform.OS !== "web";

  useEffect(() => {
    const channel = chatChannelRef.current;
    if (!channel) return;
    const trackedUserId = myUserId || "anon";
    channel.track({
      userId: trackedUserId,
      username: myUsernameRef.current,
      isLive,
      cameraPreviewUrl: myCameraPreviewUrlRef.current || undefined,
    }).catch(() => {});
  }, [isLive, myUserId]);

  const startRoomRealtimeSync = useCallback(() => {
    if (!partyId) return;

    if (roomRealtimeChannelRef.current) {
      supabase.removeChannel(roomRealtimeChannelRef.current);
      roomRealtimeChannelRef.current = null;
    }

    const channel = supabase
      .channel(`party-room-${partyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "watch_party_rooms",
          filter: `party_id=eq.${partyId}`,
        },
        () => {
          void refreshRoomSnapshot(myUserIdRef.current);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "watch_party_room_memberships",
          filter: `party_id=eq.${partyId}`,
        },
        () => {
          void refreshRoomSnapshot(myUserIdRef.current);
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnState("reconnecting");
        }
      });

    roomRealtimeChannelRef.current = channel;
  }, [partyId, refreshRoomSnapshot]);

  useEffect(() => {
    reportDebugParty({
      roomId: partyId || undefined,
      role: myRole,
      realtimeState: connState,
      participantCount: participants.length,
      roomUpdatedAt: room?.updatedAt,
      fallbackPollActive: !!pollRef.current,
      lastSyncAt: room ? Date.now() : undefined,
    });
  }, [partyId, myRole, connState, participants.length, room]);

  useEffect(() => {
    if (!partyId) {
      reportDebugQuery({ name: "party.room", status: "error", error: "Missing party id" });
      return;
    }
    if (loading) {
      reportDebugQuery({ name: "party.room", status: "loading", error: null });
      return;
    }
    if (notFound || !room) {
      reportDebugQuery({ name: "party.room", status: "error", error: "Room not found" });
      return;
    }
    reportDebugQuery({ name: "party.room", status: "success", error: null });
  }, [partyId, loading, notFound, room]);

  useEffect(() => {
    reportDebugError(notFound ? "Room not found" : null);
  }, [notFound]);

  // ── Host: toggle mute reactions ──────────────────────────────────────────────
  const onToggleMuteReactions = useCallback(async () => {
    if (myRoleRef.current !== "host" || !partyId) return;
    const next = !reactionsGloballyMuted;
    setReactionsGloballyMuted(next);
    trackModerationActionUsed({
      surface: "watch-party-room",
      action: next ? "mute_reactions" : "unmute_reactions",
      roomId: partyId,
      sourceRoute: `/watch-party/${partyId}`,
    });
    await (next
      ? applyHostAction(partyId, { type: "mute_reactions" })
      : setPartyRoomPolicies(partyId, { reactionsPolicy: "enabled" })
    ).catch(() => {});
    await refreshRoomSnapshot(myUserIdRef.current).catch(() => {});
  }, [partyId, reactionsGloballyMuted, refreshRoomSnapshot]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const currentUserId = String(myUserIdRef.current ?? "").trim();
      if (!partyId || !currentUserId) return;

      if (nextState === "active") {
        setConnState((prev) => (prev === "reconnecting" ? "connecting" : prev));
        void touchPartyRoomSession({
          partyId,
          userId: currentUserId,
          role: myRoleRef.current === "host" ? "host" : "viewer",
          canSpeak: myRoleRef.current === "host",
          cameraEnabled: !!myCameraPreviewUrlRef.current,
          micEnabled: true,
          displayName: myProfileUsernameRef.current,
          cameraPreviewUrl: myCameraPreviewUrlRef.current,
          membershipState: "active",
        }).then(() => refreshRoomSnapshot(currentUserId)).catch((error) => {
          reportRuntimeError("watch-party-appstate-active", error, {
            partyId,
          });
        });
        return;
      }

      setConnState("reconnecting");
      void touchPartyRoomSession({
        partyId,
        userId: currentUserId,
        role: myRoleRef.current === "host" ? "host" : "viewer",
        canSpeak: myRoleRef.current === "host",
        cameraEnabled: !!myCameraPreviewUrlRef.current,
        micEnabled: true,
        displayName: myProfileUsernameRef.current,
        cameraPreviewUrl: myCameraPreviewUrlRef.current,
        membershipState: "reconnecting",
      }).catch((error) => {
        reportRuntimeError("watch-party-appstate-background", error, {
          partyId,
        });
      });
    });

    return () => {
      subscription.remove();
    };
  }, [partyId, refreshRoomSnapshot]);

  // ── Host: toggle lock room ───────────────────────────────────────────────────
  const onToggleLockRoom = useCallback(async () => {
    if (myRoleRef.current !== "host" || !partyId) return;
    const next = !roomLocked;
    setRoomLocked(next);
    trackModerationActionUsed({
      surface: "watch-party-room",
      action: next ? "lock_room" : "unlock_room",
      roomId: partyId,
      sourceRoute: `/watch-party/${partyId}`,
    });
    await (next
      ? applyHostAction(partyId, { type: "lock_room" })
      : setPartyRoomPolicies(partyId, { joinPolicy: "open" })
    ).catch(() => {});
    await refreshRoomSnapshot(myUserIdRef.current).catch(() => {});
  }, [partyId, refreshRoomSnapshot, roomLocked]);

  const onToggleCaptureRoom = useCallback(async () => {
    if (myRoleRef.current !== "host" || !partyId || !room) return;
    const nextCapturePolicy = room.capturePolicy === "host_managed" ? "best_effort" : "host_managed";
    await setPartyRoomPolicies(partyId, { capturePolicy: nextCapturePolicy }).catch(() => {});
    await refreshRoomSnapshot(myUserIdRef.current).catch(() => {});
  }, [partyId, refreshRoomSnapshot, room]);

  const emitParticipantUpdate = useCallback(async (participantId: string, changes: Partial<SharedParticipantLocalState>) => {
    if (!partyId || !participantId || myRoleRef.current !== "host") return;
    const currentMembership = membershipMapRef.current[participantId];
    const nextStageRole = changes.role
      ? (changes.role === "host" ? "host" : changes.role)
      : currentMembership?.stageRole;
    const shouldRemove = typeof changes.isRemoved === "boolean" ? changes.isRemoved : currentMembership?.membershipState === "removed";
    trackModerationActionUsed({
      surface: "watch-party-room",
      action: shouldRemove
        ? "remove_participant"
        : typeof changes.isMuted === "boolean"
          ? (changes.isMuted ? "mute_participant" : "unmute_participant")
          : nextStageRole === "speaker"
            ? "promote_speaker"
            : "demote_listener",
      roomId: partyId,
      titleId: room?.titleId ?? null,
      targetType: "participant",
      targetId: participantId,
      sourceRoute: `/watch-party/${partyId}`,
    });

    await setPartyParticipantState(partyId, participantId, {
      isMuted: typeof changes.isMuted === "boolean" ? changes.isMuted : currentMembership?.isMuted,
      stageRole: nextStageRole,
      canSpeak: nextStageRole === "host" || nextStageRole === "speaker",
      membershipState: shouldRemove ? "removed" : "active",
      leftAt: shouldRemove ? new Date().toISOString() : null,
    }).catch(() => null);
    await refreshRoomSnapshot(myUserIdRef.current).catch(() => {});
  }, [partyId, refreshRoomSnapshot]);

  const emitParticipantSpeaking = useCallback((participantId: string, isSpeaking: boolean) => {
    const channel = chatChannelRef.current;
    if (!channel || !participantId) return;
    channel
      .send({ type: "broadcast", event: "participant:speaking", payload: { participantId, isSpeaking } })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!isNativeCameraPlatform) return;
    if (!myUserId) return;
    if (cameraPermission?.granted) return;
    if (cameraPermission && !cameraPermission.canAskAgain) return;
    requestCameraPermission().catch(() => {});
  }, [myUserId, cameraPermission, requestCameraPermission, isNativeCameraPlatform]);

  useEffect(() => {
    if (!myUserId) return;

    let cancelled = false;

    const startMicMetering = async () => {
      try {
        const permission = await Audio.requestPermissionsAsync();
        debugLog("watch-party", "mic permission", { granted: permission.granted, status: permission.status, canAskAgain: permission.canAskAgain });
        if (!permission.granted || cancelled) return;

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        });

        debugLog("watch-party", "mic recording created");
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
        debugLog("watch-party", "mic prepare complete");
        debugLog("watch-party", "mic start async");
        await recording.startAsync();
        debugLog("watch-party", "mic recording started");
        recording.setProgressUpdateInterval(220);
        recording.setOnRecordingStatusUpdate((status) => {
          debugLog("watch-party", "mic meter", { isRecording: status.isRecording, metering: status.metering });
          if (!status.isRecording || cancelled) return;
          const metering = typeof status.metering === "number" ? status.metering : -160;
          const speaking = metering > MIC_SPEAKING_THRESHOLD_DB;
          if (speaking) {
            if (micReleaseTimeoutRef.current) {
              clearTimeout(micReleaseTimeoutRef.current);
              micReleaseTimeoutRef.current = null;
            }
            if (micSpeakingRef.current) return;
            debugLog("watch-party", "speaking change", {
              from: micSpeakingRef.current,
              to: true,
              metering,
              threshold: MIC_SPEAKING_THRESHOLD_DB,
            });
            micSpeakingRef.current = true;
            setIsSpeakingById((prev) => ({ ...prev, [myUserId]: true }));
            emitParticipantSpeaking(myUserId, true);
            return;
          }
          if (!micSpeakingRef.current || micReleaseTimeoutRef.current) return;
          micReleaseTimeoutRef.current = setTimeout(() => {
            micReleaseTimeoutRef.current = null;
            if (!micSpeakingRef.current || cancelled) return;
            debugLog("watch-party", "speaking change", {
              from: true,
              to: false,
              metering,
              threshold: MIC_SPEAKING_THRESHOLD_DB,
            });
            micSpeakingRef.current = false;
            setIsSpeakingById((prev) => ({ ...prev, [myUserId]: false }));
            emitParticipantSpeaking(myUserId, false);
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
      if (micSpeakingRef.current) {
        micSpeakingRef.current = false;
        setIsSpeakingById((prev) => ({ ...prev, [myUserId]: false }));
        emitParticipantSpeaking(myUserId, false);
      }
      if (recording) {
        recording.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, [myUserId, emitParticipantSpeaking]);

  // ── Share / invite ───────────────────────────────────────────────────────────
  const displayRoomCode = String(room?.roomCode ?? "").trim().toUpperCase() || roomCodeHint;
  const roomCodeCardValue = displayRoomCode || "Room code unavailable";
  const internalInviteMessage = `Join me in Chi'llywood Watch-Party Live.\n\nRoom code: ${displayRoomCode}\n\nOpen Chi'llywood -> Watch-Party Live -> enter the code to join the party room.`;

  const onShareCode = useCallback(() => {
    if (!displayRoomCode) {
      Alert.alert("Room code unavailable", "This room code is still syncing. Try sharing again in a moment.");
      return;
    }
    setInviteSheetVisible(true);
  }, [displayRoomCode]);

  const onSystemShareCode = useCallback(() => {
    const roomCode = displayRoomCode;
    if (!roomCode) {
      Alert.alert("Room code unavailable", "This room code is still syncing. Try sharing again in a moment.");
      return;
    }
    Share.share({
      message: `Join my ${branding.appDisplayName} Watch-Party Live!\n\nRoom code: ${roomCode}\n\nOpen ${branding.appDisplayName} -> Watch-Party Live -> enter the code to join.`,
      title: "Watch-Party Live Invite",
    }).catch(() => {});
  }, [branding.appDisplayName, displayRoomCode]);

  const onResolveAccessGate = useCallback(async (action: "purchase" | "restore") => {
    if (!accessGate) {
      return {
        message: "Unable to confirm your room access right now.",
        tone: "error" as const,
      };
    }

    try {
      const latestRoom = await getPartyRoom(accessGate.accessKey).catch(() => null);
      const userId = await getSafePartyUserId().catch(() => "");
      const access = await evaluatePartyRoomAccess({
        partyId: accessGate.accessKey,
        userId,
        room: latestRoom ?? room ?? undefined,
      }).catch(() => null);

      if (access?.canJoin) {
        trackEvent("monetization_unlock_success", {
          action,
          surface: "watch-party-room",
          reason: accessGate.access.reason,
          roomId: accessGate.accessKey,
        });
        setAccessGate(null);
        setAccessSheetVisible(false);
        setLoading(true);
        setJoinRetryToken((value) => value + 1);
        return {
          message: action === "restore" ? "Purchases restored. Rejoining room…" : "Access unlocked. Rejoining room…",
          tone: "success" as const,
        };
      }

      if (access && (access.reason === "premium_required" || access.reason === "party_pass_required")) {
        setAccessGate({
          ...accessGate,
          access,
        });
        const message = access.monetization.issues[0] ?? "Room access is still locked for this account.";
        trackEvent("monetization_unlock_failure", {
          action,
          surface: "watch-party-room",
          reason: access.reason,
          roomId: accessGate.accessKey,
        });
        return {
          message,
          tone: "error" as const,
        };
      }

      const message = access?.reason === "room_locked"
        ? "This room is locked right now. Ask the host to reopen it."
        : access?.reason === "removed"
          ? "You no longer have access to this room."
          : "Unable to confirm your room access right now.";
      trackEvent("monetization_unlock_failure", {
        action,
        surface: "watch-party-room",
        reason: accessGate.access.reason,
        roomId: accessGate.accessKey,
      });
      return {
        message,
        tone: "error" as const,
      };
    } catch (error) {
      reportRuntimeError("watch-party-access-gate", error, {
        action,
        source: accessGate.source,
        reason: accessGate.access.reason,
      });
      return {
        message: "Unable to confirm your room access right now.",
        tone: "error" as const,
      };
    }
  }, [accessGate, room]);

  // ── Watch together ───────────────────────────────────────────────────────────
  const onWatchTogether = useCallback(async () => {
    const nextPartyId = String(room?.partyId ?? partyId ?? "").trim();
    let targetTitleId = String(room?.titleId ?? "").trim();

    if (!targetTitleId && nextPartyId) {
      const latestRoom = await getPartyRoom(nextPartyId).catch(() => null);
      targetTitleId = String(latestRoom?.titleId ?? "").trim();
    }

    if (!targetTitleId) {
      targetTitleId = String(titleIdHint ?? "").trim();
    }

    if (!nextPartyId || !targetTitleId) {
      Alert.alert("Unable to go live", "This room is missing required watch-party context.");
      return;
    }

    debugLog("watch-party", "open player", { targetTitleId });
    router.push({
      pathname: "/player/[id]",
      params: {
        id: targetTitleId,
        partyId: nextPartyId,
      },
    });
  }, [room?.partyId, room?.titleId, titleIdHint, partyId, router]);

  // ── Connection display helpers ───────────────────────────────────────────────
  const connLabel: Record<ConnState, string> = {
    loading: "Loading",
    connecting: "Connecting…",
    live: "Live",
    reconnecting: "Reconnecting…",
    error: "Offline",
  };
  const connColor: Record<ConnState, string> = {
    loading: "#555",
    connecting: "#b58900",
    live: "#2ecc40",
    reconnecting: "#e67e22",
    error: "#DC143C",
  };

  const isPlaying = room?.playbackState === "playing";
  const isLiveRoom = room?.roomType === "live" || !room?.titleId;
  const backgroundSource: ImageSourcePropType | null = (() => {
    const first = localTitles[0] as any;
    return first?.image || first?.poster || null;
  })();
  const trackedUserId = myUserId || "anon";
  const resolvedCurrentUsername = (() => {
    const preferred = resolveIdentityName(myProfileUsernameRef.current, myUsernameRef.current, "");
    return preferred === "Guest" ? "You" : preferred;
  })();
  const selfFallbackParticipant = useMemo<LiveBubbleParticipant>(() => ({
    ...buildSharedParticipantIdentity({
      userId: trackedUserId,
      role: (myRole ?? myRoleRef.current ?? "viewer") === "host" ? "host" : "viewer",
      displayNameCandidates: [resolvedCurrentUsername, "Guest"],
      avatarUrl: "",
      cameraPreviewUrl: myCameraPreviewUrlRef.current || "",
      currentUserId: trackedUserId,
      isLive: !!isLive,
      isSpeaking: !!isSpeakingById[trackedUserId],
      isMuted: false,
    }),
    isPlaceholder: true,
  }), [trackedUserId, myRole, resolvedCurrentUsername, isLive, isSpeakingById]);
  const liveBubbleParticipants: LiveBubbleParticipant[] = useMemo(
    () => prioritizeParticipantStripOrder(
      buildOrderedParticipantsWithSelf({
        participants,
        currentUserId: trackedUserId,
        selfFallbackParticipant,
      }),
      featuredParticipantById,
      isSpeakingById,
    ),
    [participants, trackedUserId, selfFallbackParticipant, featuredParticipantById, isSpeakingById],
  );

  useEffect(() => {
    const nextOrder = liveBubbleParticipants.map((participant) => participant.userId).join("|");
    if (!nextOrder) return;
    if (liveBubbleOrderRef.current && liveBubbleOrderRef.current !== nextOrder) {
      LayoutAnimation.configureNext({
        duration: 220,
        update: { type: LayoutAnimation.Types.easeOut },
      });
    }
    liveBubbleOrderRef.current = nextOrder;
  }, [liveBubbleParticipants]);

  const hostParticipant = useMemo(
    () => liveBubbleParticipants.find((participant) => participant.role === "host") ?? null,
    [liveBubbleParticipants],
  );
  const visibleLiveBubbleParticipants = useMemo(
    () => liveBubbleParticipants.filter((participant) => !hiddenParticipantIds[participant.userId]),
    [hiddenParticipantIds, liveBubbleParticipants],
  );

  useEffect(() => {
    if (liveBubbleParticipants.length === 0) {
      setActiveParticipantId("");
      return;
    }
    if (!activeParticipantId || !liveBubbleParticipants.some((participant) => participant.userId === activeParticipantId)) {
      const host = liveBubbleParticipants.find((participant) => participant.role === "host");
      setActiveParticipantId(host?.userId ?? liveBubbleParticipants[0]?.userId ?? "");
    }
  }, [liveBubbleParticipants, activeParticipantId]);

  useEffect(() => {
    if (liveBubbleParticipants.length === 0) return;
    setParticipantStateById((prev) => {
      return mergeMissingParticipantStates(
        prev,
        liveBubbleParticipants,
        (participant) => participant.userId,
        (participant) =>
          createDefaultParticipantState({
            role: participant.role,
            isSpeaking: participant.isSpeaking,
            isMuted: participant.isMuted,
          }),
      );
    });
  }, [liveBubbleParticipants]);

  const presenceParticipants: PresenceParticipant[] = liveBubbleParticipants;
  const currentUserBubbleId = trackedUserId;
  const waitingRoomParticipantSummary = useMemo(
    () =>
      buildPartyRoomParticipantEntries({
        participants: presenceParticipants,
        currentUserId: currentUserBubbleId,
        currentUsername: resolvedCurrentUsername,
        participantReactionById: participantReactions,
        maxVisible: 7,
      }),
    [presenceParticipants, currentUserBubbleId, participantReactions, resolvedCurrentUsername],
  );
  const isCurrentUserInParticipantBubbles = !!currentUserBubbleId && visibleLiveBubbleParticipants.some((participant) => participant.userId === currentUserBubbleId);
  const dominantLiveSpeakerId = useMemo(() => {
    return computeDominantSpeakerId(
      visibleLiveBubbleParticipants,
      (participant) => participant.userId,
      (participant) => {
        const participantState = participantStateById[participant.userId];
        const isMuted = participantState?.isMuted ?? !!participant.isMuted;
        const role = participantState?.role ?? (participant.role === "host" ? "host" : participant.isSpeaking ? "speaker" : "listener");
        const isSpeakerRole = role === "speaker";
        return !isMuted && !!(isSpeakingById[participant.userId] || (isSpeakerRole && participant.isSpeaking));
      },
    );
  }, [visibleLiveBubbleParticipants, participantStateById, isSpeakingById]);
  const bottomStripParticipants = useMemo(() => {
    return computeBottomStripParticipants(
      visibleLiveBubbleParticipants,
      (participant) => participant.userId,
      isCurrentUserInParticipantBubbles ? currentUserBubbleId : "",
    );
  }, [visibleLiveBubbleParticipants, isCurrentUserInParticipantBubbles, currentUserBubbleId]);
  const bottomStripEntries = useMemo<LiveBottomStripParticipant[]>(
    () =>
      bottomStripParticipants.map((participant) => ({
        id: participant.userId,
        displayName: participant.displayName,
        avatarUrl: participant.avatarUrl,
        cameraPreviewUrl: participant.cameraPreviewUrl,
        isSpeaking: participant.isSpeaking,
        isLive: participant.isLive,
        isMuted: participant.isMuted,
        isPresent: true,
      })),
    [bottomStripParticipants],
  );
  const onBottomStripParticipantPress = useCallback((participantId: string) => {
    if (!participantId) return;
    const participant = visibleLiveBubbleParticipants.find((entry) => entry.userId === participantId)
      ?? bottomStripParticipants.find((entry) => entry.userId === participantId);
    if (!participant) return;
    triggerBubbleTapPulse(participantId);
    setSelectedParticipant(participant);
  }, [visibleLiveBubbleParticipants, bottomStripParticipants, triggerBubbleTapPulse]);
  const tailoredFocusParticipant = useMemo(
    () => visibleLiveBubbleParticipants.find((participant) => participant.userId === activeParticipantId)
      ?? hostParticipant
      ?? visibleLiveBubbleParticipants[0]
      ?? null,
    [activeParticipantId, hostParticipant, visibleLiveBubbleParticipants],
  );
  const hiddenParticipantCount = useMemo(
    () => Object.values(hiddenParticipantIds).filter(Boolean).length,
    [hiddenParticipantIds],
  );
  const featureParticipantFirst = useCallback((participantId: string) => {
    const nextParticipantId = String(participantId ?? "").trim();
    if (!nextParticipantId) return;
    setFeaturedParticipantById({ [nextParticipantId]: true });
    setActiveParticipantId(nextParticipantId);
  }, []);
  const hideParticipantLocally = useCallback((participantId: string) => {
    const nextParticipantId = String(participantId ?? "").trim();
    if (!nextParticipantId) return;
    const participant = liveBubbleParticipants.find((entry) => entry.userId === nextParticipantId);
    if (!participant || participant.userId === currentUserBubbleId || participant.role === "host") return;
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
    setSelectedParticipant((current) => (current?.userId === nextParticipantId ? null : current));
  }, [activeParticipantId, currentUserBubbleId, hostParticipant?.userId, liveBubbleParticipants]);
  const showEveryoneLocally = useCallback(() => {
    setHiddenParticipantIds({});
  }, []);
  const resetTailoredRoomView = useCallback(() => {
    setHiddenParticipantIds({});
    setFeaturedParticipantById({});
    setParticipantPresentationById({});
    setActiveParticipantId(hostParticipant?.userId ?? "");
    setSelectedParticipant(null);
  }, [hostParticipant?.userId]);
  const closeParticipantModal = useCallback(() => {
    setSelectedParticipant(null);
  }, []);
  const onSubmitReport = useCallback(async (input: { category: Parameters<typeof submitSafetyReport>[0]["category"]; note: string }) => {
    if (!reportTarget) return;
    setReportBusy(true);
    try {
      await submitSafetyReport({
        targetType: reportTarget.type === "room" ? "room" : "participant",
        targetId: reportTarget.targetId,
        category: input.category,
        note: input.note,
        roomId: room?.partyId ?? partyId,
        titleId: room?.titleId ?? null,
        context: buildSafetyReportContext({
          sourceSurface: "watch-party-room",
          sourceRoute: `/watch-party/${partyId}`,
          targetLabel: reportTarget.label,
          targetRoleLabel: reportTarget.type === "room" ? "Room" : "Participant",
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
  }, [partyId, reportTarget, room?.partyId, room?.roomType, room?.titleId]);

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (authLoading || betaLoading) {
    return (
      <BetaAccessScreen
        title="Loading watch-party access"
        body="Checking your signed-in session before joining this room."
        loadingOverride
      />
    );
  }

  if (!isSignedIn) {
    return (
      <BetaAccessScreen
        title="Sign in to join this watch party"
        body="Watch-party rooms require a signed-in Chi'llywood identity so membership truth, moderation state, and reconnect behavior stay stable."
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
        <Text style={styles.loadingText}>Joining room…</Text>
      </View>
    );
  }

  if (accessGate?.source === "room" && room) {
    const accessGatePresentation = getMonetizationAccessSheetPresentation({
      gate: accessGate.access,
      appDisplayName: branding.appDisplayName,
      premiumUpsellTitle: monetizationConfig.premiumUpsellTitle,
      premiumUpsellBody: monetizationConfig.premiumUpsellBody,
    });
    return (
        <View style={styles.center}>
          <View style={styles.errorCard}>
            <Text style={styles.errorTitle}>
            {accessGate.access.reason === "premium_required" ? "Premium room access not currently available" : "Party Pass access not currently available"}
            </Text>
            <Text style={styles.errorBody}>
            {accessGate.access.reason === "premium_required"
              ? "This room stays locked because premium room access is not currently available for this device or account."
              : "This room stays locked because Party Pass access is not currently available for this device or account."}
            </Text>
          <ProtectedSessionNote
            {...getProtectedSessionCopy(sharedRoomMode === "live" ? "live-room" : "party-room", {
              contentAccessRule: room.contentAccessRule,
              capturePolicy: room.capturePolicy,
            })}
          />
          <TouchableOpacity
            style={[styles.secondaryBtn, styles.accessPrimaryButton]}
            onPress={() => setAccessSheetVisible(true)}
            activeOpacity={0.85}
          >
            <Text style={[styles.secondaryBtnText, styles.accessPrimaryButtonText]}>
              Coming Soon
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={styles.secondaryBtnText}>← Go Back</Text>
          </TouchableOpacity>
        </View>
        <AccessSheet
          visible={accessSheetVisible}
          reason={accessGate.access.reason as AccessSheetReason}
          gate={accessGate.access}
          appDisplayName={branding.appDisplayName}
          premiumUpsellTitle={monetizationConfig.premiumUpsellTitle}
          premiumUpsellBody={monetizationConfig.premiumUpsellBody}
          deferredMonetization
          kickerOverride={accessGatePresentation.kicker}
          titleOverride={accessGatePresentation.title}
          bodyOverride={accessGatePresentation.body}
          actionLabelOverride={accessGatePresentation.actionLabel}
          onPurchaseResult={(result) => {
            if (!result.ok) {
              trackEvent("monetization_unlock_failure", {
                action: "purchase",
                surface: "watch-party-room",
                reason: accessGate.access.reason,
                roomId: accessGate.accessKey,
              });
              return {
                message: result.message,
                tone: "error" as const,
              };
            }
            return onResolveAccessGate("purchase");
          }}
          onRestoreResult={(result) => {
            if (!result.ok) {
              trackEvent("monetization_unlock_failure", {
                action: "restore",
                surface: "watch-party-room",
                reason: accessGate.access.reason,
                roomId: accessGate.accessKey,
              });
              return {
                message: result.message,
                tone: "error" as const,
              };
            }
            return onResolveAccessGate("restore");
          }}
          onClose={() => setAccessSheetVisible(false)}
        />
      </View>
    );
  }

  // ── Not found ────────────────────────────────────────────────────────────────
  if (notFound || !room) {
    return (
      <View style={styles.center}>
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Room not found</Text>
          <Text style={styles.errorBody}>This party may have ended or the code is incorrect.</Text>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => router.back()} activeOpacity={0.85}>
            <Text style={styles.secondaryBtnText}>← Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const isHost = myRole === "host";
  const isSyncUnstable = connState === "reconnecting" || connState === "connecting";
  const isWaitingForHost = !isHost && !participants.some((p) => p.role === "host");
  const roleStatusTitle = isHost ? "Host Room Controls" : "Viewer Room Entry";
  const roleStatusBody = isHost
    ? "Shape the room here before the shared player opens. Invite people, set access, and decide how the audience enters the watch moment."
    : isWaitingForHost
      ? "Waiting for host…"
      : isSyncUnstable
        ? "Resyncing room setup with the host…"
        : "You are inside the host's room setup. Shared playback starts only after the room is ready.";
  const accessGatePresentation = accessGate
    ? getMonetizationAccessSheetPresentation({
        gate: accessGate.access,
        appDisplayName: branding.appDisplayName,
        premiumUpsellTitle: monetizationConfig.premiumUpsellTitle,
        premiumUpsellBody: monetizationConfig.premiumUpsellBody,
      })
    : null;
  const partyRoomTitleContext = getSafeRoomTitleLabel(titleName, room, "Selected Title");
  const roomLabels = buildSharedRoomLabels({
    isLiveRoom,
    branding: {
      watchPartyLabel: branding.watchPartyLabel,
      liveWaitingRoomTitle: branding.liveWaitingRoomTitle,
      partyWaitingRoomTitle: branding.partyWaitingRoomTitle,
      liveRoomTitle: branding.liveRoomTitle,
      partyRoomTitle: branding.partyRoomTitle,
    },
  });
  const roomStatusLabel = roomLabels.roomStatusLabel;
  const roomCardLabel = roomLabels.roomCardLabel;
  const roomCardTitle = roomLabels.roomCardTitle;
  const roomCardSubtext = isLiveRoom
    ? "Host and viewer control room for the live session."
    : `Pre-entry control room for ${partyRoomTitleContext}.`;
  const partyRoomFocusLabel = tailoredFocusParticipant
    ? (tailoredFocusParticipant.userId === currentUserBubbleId ? "You" : tailoredFocusParticipant.displayName)
    : "Host";
  const partyRoomVisibilityLabel = hiddenParticipantCount > 0 ? `${hiddenParticipantCount} hidden locally` : "Everyone visible";
  const partyRoomJoinLabel = roomLocked ? "Locked" : "Open";
  const partyRoomReactionLabel = reactionsGloballyMuted ? "Muted" : "Enabled";
  const partyRoomCaptureLabel = room.capturePolicy === "host_managed" ? "Host-managed" : "Best-effort";
  const { selectedParticipantUserId, selectedParticipantState, canShowProfileAction } = resolveSelectedParticipantContext({
    selectedParticipant,
    participantStateById,
    currentUserId: currentUserBubbleId,
  });
  const selectedParticipantProfile = selectedParticipant
    ? buildUserChannelProfile({
        id: selectedParticipantUserId,
        displayName: selectedParticipant.displayName,
        avatarUrl: selectedParticipant.avatarUrl,
        role: selectedParticipant.role,
        isLive: selectedParticipant.isLive,
        fallbackDisplayName: "Participant",
      })
    : null;

  // ── Room UI ──────────────────────────────────────────────────────────────────
  return (
    <View style={styles.outerFlex}>
      <LiveBottomStrip
        participants={bottomStripEntries}
        currentUserId={currentUserBubbleId}
        dominantSpeakerId={dominantLiveSpeakerId}
        speakingById={isSpeakingById}
        myCameraPreviewUrl={myCameraPreviewUrlRef.current}
        allowCameraPreview={isNativeCameraPlatform}
        cameraPermissionGranted={!!cameraPermission?.granted}
        tapPulseById={tapPulseById}
        pointerEvents="box-none"
        onParticipantPress={onBottomStripParticipantPress}
        styles={{
          overlay: styles.bottomLiveStripOverlay,
          content: styles.bottomLiveStripContent,
          touchable: styles.bottomLiveBubbleTouchable,
          tapWrap: styles.liveBubbleTapWrap,
          tapWrapPulsed: styles.liveBubbleTapWrapPulsed,
          bubble: styles.bottomLiveBubble,
          bubbleSpeaking: styles.bottomLiveBubbleSpeaking,
          bubbleDominant: styles.bottomLiveBubbleDominant,
          ring: styles.bottomLiveBubbleRing,
          ringDominant: styles.bottomLiveBubbleRingDominant,
          faceClip: styles.bottomLiveBubbleFaceClip,
          cameraFill: styles.bottomLiveBubbleCameraFill,
          cameraDominant: styles.bottomLiveBubbleCameraDominant,
          image: styles.bottomLiveBubbleImage,
          initialText: styles.bottomLiveBubbleInitial,
          presenceDot: styles.bottomLiveBubblePresenceDot,
          presenceDotLive: styles.bottomLiveBubblePresenceDotLive,
          presenceDotIdle: styles.bottomLiveBubblePresenceDotIdle,
          mutedIconText: styles.bottomLiveBubbleMutedIcon,
        }}
      />
      {backgroundSource ? (
        <View style={styles.fullBackground} pointerEvents="none">
          <ImageBackground
            source={backgroundSource}
            style={styles.fullBackground}
            resizeMode="cover"
          />
        </View>
      ) : (
        <View style={styles.fullBackgroundFallback} pointerEvents="none" />
      )}
      <View style={styles.fullBackgroundOverlay} pointerEvents="none" />

      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12} activeOpacity={0.75}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>CHI&apos;LLYWOOD · WATCH PARTY</Text>
          {/* Connection badge */}
          <View style={[styles.connBadge, { borderColor: connColor[connState] + "44" }]}>
            <View style={[styles.connDot, { backgroundColor: connColor[connState] }]} />
            <Text style={[styles.connLabel, { color: connColor[connState] }]}>{connLabel[connState]}</Text>
          </View>
        </View>

        {/* ── Live indicator + role ───────────────────────────────────── */}
        <View style={styles.liveRow}>
          <View style={[styles.liveDot, { backgroundColor: isLiveRoom ? "#DC143C" : isPlaying ? "#2ecc40" : "#b58900" }]} />
          <Text style={[styles.liveText, { color: isLiveRoom ? "#F7D6DD" : isPlaying ? "#2ecc40" : "#b58900" }]}>
            {roomStatusLabel}
          </Text>
          <View style={{ flex: 1 }} />
          <View style={[styles.rolePill, isHost && styles.rolePillHost]}>
            <Text style={[styles.rolePillText, isHost && styles.rolePillTextHost]}>
              {isHost ? "Host" : "Viewer"}
            </Text>
          </View>
        </View>

        {!isLiveRoom && (
          <View style={styles.syncStatusCard}>
            <Text style={styles.syncStatusTitle}>{roleStatusTitle}</Text>
            <Text style={styles.syncStatusBody}>{roleStatusBody}</Text>
            {!isHost ? <Text style={styles.syncedBadge}>Synced to Host</Text> : null}
          </View>
        )}

        {/* ── Title card ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>{roomCardLabel}</Text>
          <Text style={styles.cardTitle} numberOfLines={2}>{roomCardTitle}</Text>
          <Text style={styles.liveRoomSubtext}>{roomCardSubtext}</Text>
        </View>

        <View style={styles.liveBubblesSection}>
          <Text style={styles.sectionKicker}>IN THE ROOM</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.liveBubblesRow}
          >
            {visibleLiveBubbleParticipants.map((participant, index) => {
              const participantState = participantStateById[participant.userId] ?? {
                isMuted: !!participant.isMuted,
                role: participant.role === "host" ? "host" : participant.isSpeaking ? "speaker" : "listener",
                isRemoved: false,
              };
              const isCurrentUser = participant.userId === currentUserBubbleId;
              const isFeatured = !!featuredParticipantById[participant.userId];
              const isFocused = participant.userId === activeParticipantId;
              const isMuted = participantState.isMuted;
              const isSpeakerRole = participantState.role === "speaker";
              const isRemoved = participantState.isRemoved;
              const presentation = participantPresentationById[participant.userId] ?? "compact";
              const isExpanded = presentation === "expanded";
              const canModerateParticipant = participantState.role !== "host";
              const showLocalCameraPreview = isNativeCameraPlatform && isCurrentUser && !!cameraPermission?.granted;
              const roleLabel = getParticipantRoleLabel(participantState);
              const bubbleMediaUri = (isCurrentUser ? myCameraPreviewUrlRef.current : "") || participant.cameraPreviewUrl || participant.avatarUrl || "";
              return (
                <TouchableOpacity
                  key={`${participant.userId}-${index}`}
                  style={[
                    styles.liveBubbleItem,
                    isExpanded && styles.liveBubbleItemExpanded,
                    isFocused && !isFeatured && styles.liveBubbleItemActive,
                    isFeatured && styles.liveBubbleItemFeatured,
                    isRemoved && styles.liveBubbleItemRemoved,
                  ]}
                  activeOpacity={0.76}
                  onPress={() => {
                    triggerBubbleTapPulse(participant.userId);
                    if (isHost) {
                      debugLog("watch-party", "host tap user", { userId: participant.userId });
                    } else {
                      debugLog("watch-party", "request mic", { userId: participant.userId });
                    }
                    setActiveParticipantId(participant.userId);
                    setParticipantPresentationById((prev) => ({
                      ...prev,
                      [participant.userId]: (prev[participant.userId] ?? "compact") === "expanded" ? "compact" : "expanded",
                    }));
                    setSelectedParticipant(participant);
                  }}
                  onLongPress={() => {
                    setFeaturedParticipantById((prev) => ({
                      ...prev,
                      [participant.userId]: !prev[participant.userId],
                    }));
                  }}
                  delayLongPress={220}
                >
                  {isHost && isFocused && canModerateParticipant ? (
                    <View style={styles.liveBubbleActionMenu}>
                      <TouchableOpacity
                        style={styles.liveBubbleActionBtn}
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
                        <Text style={styles.liveBubbleActionText}>{isMuted ? "Unmute" : "Mute"}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.liveBubbleActionBtn}
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
                        }}
                      >
                        <Text style={styles.liveBubbleActionText}>{isSpeakerRole ? "Listener" : "Speaker"}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.liveBubbleActionBtn, styles.liveBubbleActionBtnDanger]}
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
                        }}
                      >
                        <Text style={[styles.liveBubbleActionText, styles.liveBubbleActionTextDanger]}>
                          {isRemoved ? "Restore" : "Remove"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  <View style={styles.liveBubbleTapWrap}>
                    <View
                      style={[
                        styles.liveBubble,
                        isExpanded && styles.liveBubbleExpanded,
                        isFocused && !isFeatured && styles.liveBubbleFocused,
                        isFeatured && styles.liveBubbleFeatured,
                        isCurrentUser && styles.liveBubbleMe,
                      ]}
                    >
                      {(showLocalCameraPreview || bubbleMediaUri) ? (
                        <View style={styles.liveBubbleFaceClip}>
                          {showLocalCameraPreview ? (
                            <CameraView
                              style={styles.liveBubbleCameraFill}
                              facing="front"
                              mute
                              mirror
                            />
                          ) : (
                            <Image
                              source={{ uri: bubbleMediaUri }}
                              style={styles.liveBubbleImage}
                            />
                          )}
                        </View>
                      ) : (
                        <Text style={[styles.liveBubbleInitials, isCurrentUser && styles.liveBubbleInitialsMe]}>
                          {getInitials(isCurrentUser ? "You" : participant.displayName)}
                        </Text>
                      )}
                      {participant.role === "host" ? (
                        <View style={styles.liveBubbleHostBadge}>
                          <Text style={styles.liveBubbleHostBadgeText}>👑</Text>
                        </View>
                      ) : null}
                      <View
                        style={[
                          styles.liveBubbleOnlineDot,
                          participant.isLive && !isMuted ? styles.liveBubbleOnlineDotLive : styles.liveBubbleOnlineDotIdle,
                        ]}
                      />
                      {isMuted ? <Text style={styles.liveBubbleMutedIcon}>🔇</Text> : null}
                    </View>
                  </View>
                  <Text style={styles.liveBubbleName} numberOfLines={1}>
                    <Text
                      style={[
                        isExpanded && styles.liveBubbleNameExpanded,
                        isFocused && !isFeatured && styles.liveBubbleNameFocused,
                        isFeatured && styles.liveBubbleNameFeatured,
                      ]}
                    >
                      {isCurrentUser ? "You" : participant.displayName}
                    </Text>
                  </Text>
                  <Text
                    style={[
                      styles.liveBubbleRole,
                    ]}
                    numberOfLines={1}
                  >
                    {isMuted ? `${roleLabel} · Muted` : roleLabel}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {!isLiveRoom ? (
          <View style={styles.tailoredRoomCard}>
            <Text style={styles.sectionKicker}>PARTY ROOM</Text>
            <Text style={styles.tailoredRoomTitle}>Shape the room before shared playback starts</Text>
            <Text style={styles.tailoredRoomBody}>
              {hostParticipant
                ? `${hostParticipant.userId === currentUserBubbleId ? "You are" : `${hostParticipant.displayName} is`} hosting. Use Party Room to decide who appears first, what the room allows, and how the watch-together moment opens before you enter shared Watch-Party Live.`
                : "Use Party Room to decide who appears first, what the room allows, and how the shared watch moment opens before playback starts."}
            </Text>
            <View style={styles.tailoredRoomMetaRow}>
              <View style={styles.tailoredRoomMetaPill}>
                <Text style={styles.tailoredRoomMetaText}>
                  Host: {hostParticipant ? (hostParticipant.userId === currentUserBubbleId ? "You" : hostParticipant.displayName) : "Syncing..."}
                </Text>
              </View>
              <View style={styles.tailoredRoomMetaPill}>
                <Text style={styles.tailoredRoomMetaText}>
                  Focus: {partyRoomFocusLabel}
                </Text>
              </View>
              <View style={styles.tailoredRoomMetaPill}>
                <Text style={styles.tailoredRoomMetaText}>Visibility: {partyRoomVisibilityLabel}</Text>
              </View>
            </View>
            <View style={styles.tailoredRoomActions}>
              <TouchableOpacity
                style={styles.tailoredRoomActionButton}
                activeOpacity={0.86}
                onPress={() => {
                  if (!hostParticipant?.userId) return;
                  featureParticipantFirst(hostParticipant.userId);
                }}
                disabled={!hostParticipant?.userId}
              >
                <Text style={styles.tailoredRoomActionText}>See host first</Text>
              </TouchableOpacity>
              {tailoredFocusParticipant && tailoredFocusParticipant.userId !== hostParticipant?.userId ? (
                <TouchableOpacity
                  style={styles.tailoredRoomActionButton}
                  activeOpacity={0.86}
                  onPress={() => {
                    featureParticipantFirst(tailoredFocusParticipant.userId);
                  }}
                >
                  <Text style={styles.tailoredRoomActionText}>
                    See {tailoredFocusParticipant.userId === currentUserBubbleId ? "yourself" : tailoredFocusParticipant.displayName} first
                  </Text>
                </TouchableOpacity>
              ) : null}
              {tailoredFocusParticipant
                && tailoredFocusParticipant.userId !== currentUserBubbleId
                && tailoredFocusParticipant.role !== "host" ? (
                <TouchableOpacity
                  style={[styles.tailoredRoomActionButton, styles.tailoredRoomActionButtonGhost]}
                  activeOpacity={0.86}
                  onPress={() => {
                    hideParticipantLocally(tailoredFocusParticipant.userId);
                  }}
                >
                  <Text style={[styles.tailoredRoomActionText, styles.tailoredRoomActionTextGhost]}>
                    Hide {tailoredFocusParticipant.displayName}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {hiddenParticipantCount > 0 ? (
                <TouchableOpacity
                  style={[styles.tailoredRoomActionButton, styles.tailoredRoomActionButtonGhost]}
                  activeOpacity={0.86}
                  onPress={showEveryoneLocally}
                >
                  <Text style={[styles.tailoredRoomActionText, styles.tailoredRoomActionTextGhost]}>Show everyone</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.tailoredRoomActionButton, styles.tailoredRoomActionButtonGhost]}
                activeOpacity={0.86}
                onPress={resetTailoredRoomView}
              >
                <Text style={[styles.tailoredRoomActionText, styles.tailoredRoomActionTextGhost]}>Reset layout</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* ── Invite card ────────────────────────────────────────────── */}
        <RoomCodeInviteCard
          roomCode={roomCodeCardValue}
          actionLabel="Invite in app"
          onActionPress={onShareCode}
          codeSelectable
          styles={{
            card: styles.inviteCard,
            left: styles.inviteLeft,
            label: styles.inviteLabel,
            code: styles.inviteCode,
            actionBtn: styles.shareBtn,
            actionText: styles.shareBtnText,
          }}
        />

        <TouchableOpacity
          style={styles.reportRoomButton}
          activeOpacity={0.84}
          onPress={() => {
            if (!room) return;
            trackModerationActionUsed({
              surface: "watch-party-room",
              action: "open_safety_report",
              targetType: "room",
              targetId: room.partyId,
              roomId: room.partyId,
              titleId: room.titleId ?? null,
              sourceRoute: `/watch-party/${partyId}`,
            });
            setReportTarget({
              type: "room",
              targetId: room.partyId,
              label: roomCodeCardValue || room.partyId,
            });
            setReportVisible(true);
          }}
        >
          <Text style={styles.reportRoomButtonText}>Report Room</Text>
        </TouchableOpacity>

        <ProtectedSessionNote
          {...getProtectedSessionCopy(isLiveRoom ? "live-room" : "party-room", {
            contentAccessRule: room.contentAccessRule,
            capturePolicy: room.capturePolicy,
          })}
        />

        {/* ── Participant list ────────────────────────────────────────── */}
        {waitingRoomParticipantSummary.totalCount > 0 && (
          <View style={styles.participantsWrap}>
            {!isLiveRoom ? <Text style={styles.sectionKicker}>IN THE ROOM</Text> : null}
            <View style={[styles.participantsCard, isLiveRoom && styles.participantsCardLive]}>
            <Text style={styles.participantsLabel}>
              <Text style={styles.viewerCount}>👥 {waitingRoomParticipantSummary.totalCount}</Text>
              {waitingRoomParticipantSummary.totalCount === 1 ? " person" : " people"} in room
              {!isLiveRoom && waitingRoomParticipantSummary.totalCount >= 3 && <Text style={styles.trendingBadge}>  🔥 Trending</Text>}
            </Text>
            <View style={[styles.chips, isLiveRoom && styles.chipsLive]}>
              {waitingRoomParticipantSummary.visible.map((participant) => (
                <RoomParticipantTile
                  key={participant.id}
                  participant={participant}
                  myCameraPreviewUrl={myCameraPreviewUrlRef.current}
                  showHostBadge={false}
                  styles={{
                    container: [styles.chip, isLiveRoom && styles.chipLive],
                    containerHost: styles.chipHost,
                    containerSelf: styles.chipMe,
                    avatarWrap: styles.avatarCircle,
                    avatarImage: styles.chipAvatarImage,
                    avatarLabel: styles.chipAvatar,
                    nameText: styles.chipText,
                    nameTextHost: styles.chipTextHost,
                    statusText: [styles.participantStatus, styles.participantStatusLive],
                    reactionBadge: styles.participantReactionBadge,
                    reactionText: styles.participantReactionText,
                  }}
                />
              ))}
              {waitingRoomParticipantSummary.overflowCount > 0 && (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>+{waitingRoomParticipantSummary.overflowCount}</Text>
                </View>
              )}
            </View>
            </View>
          </View>
        )}

        {/* ── Primary CTA ─────────────────────────────────────────────── */}
        {isLiveRoom ? (
          <TouchableOpacity
            style={styles.watchCTA}
            activeOpacity={0.88}
            onPress={() => {
              if (!partyId) return;
              router.push({
                pathname: "/watch-party/live-stage/[partyId]",
                params: {
                  partyId,
                  mode: sharedRoomMode,
                  ...(source ? { source } : {}),
                },
              });
            }}
          >
            <Text style={styles.watchCTAText}>🔴  Go Live</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.watchCTA} onPress={onWatchTogether} activeOpacity={0.88}>
            <Text style={styles.watchCTAText}>Watch-Party Live</Text>
          </TouchableOpacity>
        )}

        {/* ── Host controls ──────────────────────────────────────────── */}
        {shouldShowHostControls(isHost, isLiveRoom) && (
          <View style={styles.hostWrap}>
            <Text style={styles.sectionKicker}>CONTROLS</Text>
            <View style={styles.hostSection}>
            <Text style={styles.hostSectionLabel}>ROOM DEFAULTS</Text>
            <View style={styles.tailoredRoomMetaRow}>
              <View style={styles.tailoredRoomMetaPill}>
                <Text style={styles.tailoredRoomMetaText}>Access: {partyRoomJoinLabel}</Text>
              </View>
              <View style={styles.tailoredRoomMetaPill}>
                <Text style={styles.tailoredRoomMetaText}>Reactions: {partyRoomReactionLabel}</Text>
              </View>
              <View style={styles.tailoredRoomMetaPill}>
                <Text style={styles.tailoredRoomMetaText}>Capture: {partyRoomCaptureLabel}</Text>
              </View>
            </View>
            <View style={styles.hostBtnRow}>
              <TouchableOpacity
                style={[styles.hostBtn, reactionsGloballyMuted && styles.hostBtnOn]}
                onPress={onToggleMuteReactions}
                activeOpacity={0.8}
              >
                <Text style={styles.hostBtnText}>
                  {reactionsGloballyMuted ? "🔇  Unmute reactions" : "🔇  Mute reactions"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.hostBtn, roomLocked && styles.hostBtnOn]}
                onPress={onToggleLockRoom}
                activeOpacity={0.8}
              >
                <Text style={styles.hostBtnText}>
                  {roomLocked ? "🔓  Unlock room" : "🔒  Lock room"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.hostBtn, room.capturePolicy === "host_managed" && styles.hostBtnOn]}
                onPress={onToggleCaptureRoom}
                activeOpacity={0.8}
              >
                <Text style={styles.hostBtnText}>
                  {room.capturePolicy === "host_managed" ? "📷  Best-effort capture" : "📷  Host-managed capture"}
                </Text>
              </TouchableOpacity>
            </View>
            </View>
          </View>
        )}
        </ScrollView>
      </KeyboardAvoidingView>

      {accessGate ? (
        <AccessSheet
          visible={accessSheetVisible}
          reason={accessGate.access.reason as AccessSheetReason}
          gate={accessGate.access}
          appDisplayName={branding.appDisplayName}
          premiumUpsellTitle={monetizationConfig.premiumUpsellTitle}
          premiumUpsellBody={monetizationConfig.premiumUpsellBody}
          deferredMonetization
          kickerOverride={accessGatePresentation?.kicker}
          titleOverride={accessGatePresentation?.title}
          bodyOverride={accessGatePresentation?.body}
          actionLabelOverride={accessGatePresentation?.actionLabel}
          onPurchaseResult={(result) => {
            if (!result.ok) {
              trackEvent("monetization_unlock_failure", {
                action: "purchase",
                surface: "watch-party-room",
                reason: accessGate.access.reason,
                roomId: accessGate.accessKey,
              });
              return {
                message: result.message,
                tone: "error" as const,
              };
            }
            return onResolveAccessGate("purchase");
          }}
          onRestoreResult={(result) => {
            if (!result.ok) {
              trackEvent("monetization_unlock_failure", {
                action: "restore",
                surface: "watch-party-room",
                reason: accessGate.access.reason,
                roomId: accessGate.accessKey,
              });
              return {
                message: result.message,
                tone: "error" as const,
              };
            }
            return onResolveAccessGate("restore");
          }}
          onClose={() => setAccessSheetVisible(false)}
        />
      ) : null}

      <ParticipantDetailSheet
        visible={!!selectedParticipant}
        participant={selectedParticipant}
        participantState={selectedParticipantState}
        canShowProfileAction={canShowProfileAction}
        safeAreaBottom={safeAreaInsets.bottom}
        onClose={closeParticipantModal}
        onReportParticipant={selectedParticipantUserId ? () => {
          trackModerationActionUsed({
            surface: "watch-party-room",
            action: "open_safety_report",
            targetType: "participant",
            targetId: selectedParticipantUserId,
            roomId: partyId,
            titleId: room?.titleId ?? null,
            sourceRoute: `/watch-party/${partyId}`,
          });
          setReportTarget({
            type: "participant",
            targetId: selectedParticipantUserId,
            label: selectedParticipant?.displayName || "Participant",
          });
          setReportVisible(true);
        } : undefined}
        onViewProfile={canShowProfileAction ? () => {
          if (!selectedParticipantProfile?.id) return;
          closeParticipantModal();
          router.push({
            pathname: "/profile/[userId]",
            params: buildParticipantProfileParams({
              userId: selectedParticipantProfile.id,
              displayName: selectedParticipantProfile.displayName,
              role: selectedParticipantProfile.role,
              isLive: selectedParticipantProfile.isLive,
              partyId,
              mode: sharedRoomMode,
              source,
              avatarUrl: selectedParticipantProfile.avatarUrl,
              tagline: selectedParticipantProfile.tagline,
            }),
          });
        } : undefined}
      />

      <InternalInviteSheet
        visible={inviteSheetVisible}
        sourceSurface="party-room"
        title="Invite people to this party room"
        body="Find a Chi'llywood member, send the party-room code inside Chi'lly Chat, or fall back to system share if you need to leave the app."
        inviteMessage={internalInviteMessage}
        onClose={() => setInviteSheetVisible(false)}
        onInviteSent={(thread) => {
          router.push({
            pathname: "/chat/[threadId]",
            params: { threadId: thread.threadId },
          });
        }}
        onSystemShareFallback={onSystemShareCode}
      />

      <ReportSheet
        visible={reportVisible}
        title={reportTarget?.type === "participant" ? "Report participant" : "Report watch-party room"}
        description={reportTarget?.type === "participant"
          ? `Send a safety report for ${reportTarget?.label || "this participant"}.`
          : "Send a safety report for this room if it feels unsafe, abusive, or misused."}
        busy={reportBusy}
        onSubmit={onSubmitReport}
        onClose={() => {
          setReportVisible(false);
          setReportTarget(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outerFlex: { flex: 1 },
  fullBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  fullBackgroundFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0B0B10",
  },
  fullBackgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  screen: { flex: 1, backgroundColor: "transparent" },
  center: { flex: 1, backgroundColor: "#050505", alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1, width: "100%" },
  content: { paddingTop: 56, paddingBottom: 128, paddingHorizontal: 18, gap: 14 },
  loadingText: { color: "#888", marginTop: 14, fontSize: 14 },
  sectionKicker: { color: "#5B5B5B", fontSize: 9.5, fontWeight: "800", letterSpacing: 1.1, marginBottom: 6 },

  // Error
  errorCard: {
    backgroundColor: "rgba(18,18,18,0.96)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 24,
    marginHorizontal: 18,
    gap: 8,
  },
  errorTitle: { color: "#fff", fontSize: 20, fontWeight: "900" },
  errorBody: { color: "#888", fontSize: 14, lineHeight: 20 },
  secondaryBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingVertical: 11,
    paddingHorizontal: 20,
    alignItems: "center",
    marginTop: 10,
  },
  secondaryBtnText: { color: "#ccc", fontSize: 13, fontWeight: "700" },
  accessPrimaryButton: {
    borderColor: "rgba(220,20,60,0.48)",
    backgroundColor: "rgba(220,20,60,0.2)",
  },
  accessPrimaryButtonText: {
    color: "#FFF1F5",
    fontWeight: "900",
  },

  // Header
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  backArrow: { color: "#aaa", fontSize: 20, fontWeight: "600", paddingRight: 8 },
  kicker: { color: "#555", fontSize: 9.5, fontWeight: "800", letterSpacing: 1.2 },
  connBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  connDot: { width: 6, height: 6, borderRadius: 3 },
  connLabel: { fontSize: 9.5, fontWeight: "800", letterSpacing: 0.4 },

  // Live row
  liveRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  liveDot: { width: 7, height: 7, borderRadius: 999 },
  liveText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.3 },
  rolePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  rolePillHost: {
    borderColor: "rgba(220,20,60,0.4)",
    backgroundColor: "rgba(220,20,60,0.12)",
  },
  rolePillText: { color: "#aaa", fontSize: 10, fontWeight: "800" },
  rolePillTextHost: { color: "#F7D6DD" },
  syncStatusCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 4,
  },
  syncStatusTitle: { color: "#ECECEC", fontSize: 12, fontWeight: "800" },
  syncStatusBody: { color: "#909090", fontSize: 12, fontWeight: "600" },
  syncedBadge: {
    marginTop: 4,
    alignSelf: "flex-start",
    color: "#BFDAC4",
    fontSize: 10,
    fontWeight: "800",
    backgroundColor: "rgba(46,204,64,0.16)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },

  // Cards
  card: {
    backgroundColor: "rgba(18,18,18,0.96)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 16,
    gap: 5,
  },
  cardLabel: { color: "#555", fontSize: 9.5, fontWeight: "800", letterSpacing: 1 },
  cardTitle: { color: "#fff", fontSize: 21, fontWeight: "900", lineHeight: 27 },
  liveRoomSubtext: { color: "#8f8f8f", fontSize: 12.5, fontWeight: "600", lineHeight: 18, marginTop: 2 },

  // Live self tile
  liveSelfTile: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  liveSelfTileOff: {
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  liveSelfTileOn: {
    borderColor: "rgba(220,20,60,0.55)",
    backgroundColor: "rgba(220,20,60,0.14)",
    shadowColor: "#DC143C",
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  liveSelfTileHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  liveSelfTileKicker: { color: "#6A6A6A", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  liveNowBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(220,20,60,0.88)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  liveNowBadgeText: { color: "#fff", fontSize: 9.5, fontWeight: "900", letterSpacing: 0.4 },
  liveSelfTileBody: { flexDirection: "row", alignItems: "center", gap: 12 },
  liveSelfAvatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  liveSelfAvatarOn: {
    borderColor: "rgba(220,20,60,0.75)",
    backgroundColor: "rgba(220,20,60,0.24)",
  },
  liveSelfAvatarPulse: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "rgba(220,20,60,0.75)",
  },
  liveSelfAvatarImage: {
    width: "100%",
    height: "100%",
  },
  liveSelfAvatarFaceClip: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  liveSelfAvatarCameraFill: {
    width: "100%",
    height: "100%",
    position: "absolute",
  },
  liveSelfAvatarInitials: { color: "#fff", fontSize: 22, fontWeight: "900", letterSpacing: 0.6 },
  liveSelfMeta: { flex: 1, minWidth: 0 },
  liveSelfName: { color: "#fff", fontSize: 17, fontWeight: "900" },
  liveSelfStatus: { color: "#B7B7B7", fontSize: 12, fontWeight: "700", marginTop: 3 },

  // Live participant bubbles
  liveBubblesSection: {
    gap: 0,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(8,10,16,0.66)",
    paddingHorizontal: 11,
    paddingVertical: 11,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  liveBubblesRow: {
    alignItems: "stretch",
    paddingVertical: 2,
    paddingRight: 10,
    gap: 12,
  },
  liveBubbleItem: {
    width: 76,
    minHeight: 86,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(13,16,24,0.78)",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 4 },
    position: "relative",
  },
  liveBubbleItemExpanded: {
    width: 84,
    minHeight: 108,
    borderColor: "rgba(140,176,255,0.5)",
    backgroundColor: "rgba(40,54,88,0.52)",
  },
  liveBubbleItemActive: {
    width: 88,
    borderColor: "rgba(178,210,255,0.86)",
    shadowColor: "rgba(120,162,255,0.82)",
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  liveBubbleItemFeatured: {
    width: 112,
    minHeight: 124,
    marginHorizontal: 4,
    borderColor: "rgba(228,238,255,0.58)",
    backgroundColor: "rgba(42,56,92,0.68)",
    shadowColor: "rgba(180,205,255,0.86)",
    shadowOpacity: 0.34,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  liveBubbleItemRemoved: {
    opacity: 0.6,
  },
  liveBubble: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  liveBubbleExpanded: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderColor: "rgba(140,176,255,0.58)",
    backgroundColor: "rgba(104,149,255,0.2)",
  },
  liveBubbleFocused: {
    borderColor: "rgba(184,212,255,0.92)",
    backgroundColor: "rgba(120,162,255,0.24)",
    shadowColor: "rgba(120,162,255,0.84)",
    shadowOpacity: 0.28,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 2 },
    transform: [{ scale: 1.02 }],
  },
  liveBubbleFeatured: {
    width: 76,
    height: 76,
    borderRadius: 38,
    marginHorizontal: 5,
    borderColor: "rgba(234,241,255,0.62)",
    shadowColor: "rgba(180,205,255,0.9)",
    shadowOpacity: 0.36,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
  },
  liveBubbleMe: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderColor: "rgba(104,149,255,0.75)",
    backgroundColor: "rgba(104,149,255,0.2)",
  },
  liveBubbleActive: {
    shadowOpacity: 0,
  },
  liveBubbleSpeaking: {
    transform: [{ scale: 1 }],
    shadowOpacity: 0,
    zIndex: 1,
  },
  liveBubbleDominant: {
    transform: [{ scale: 1 }],
    shadowOpacity: 0,
    opacity: 1,
    zIndex: 1,
  },
  liveBubbleNonSpeaking: {
    transform: [{ scale: 1 }],
    opacity: 1,
    zIndex: 1,
  },
  liveBubbleTapWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  liveBubbleTapWrapPulsed: {
    transform: [{ scale: 1 }],
    opacity: 1,
  },
  liveBubbleActiveRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
    borderWidth: 0,
    borderColor: "transparent",
  },
  liveBubbleActiveRingSpeaking: {
    borderWidth: 0,
  },
  liveBubbleActiveRingDominant: {
    borderWidth: 0,
  },
  liveBubbleImage: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
  },
  liveBubbleFaceClip: {
    width: "100%",
    height: "100%",
    borderRadius: 999,
    overflow: "hidden",
  },
  liveBubbleCameraFill: {
    width: "100%",
    height: "100%",
  },
  liveBubbleCameraDominant: {
    opacity: 0.99,
  },
  liveBubbleInitials: { color: "#E7E7E7", fontSize: 14, fontWeight: "900", letterSpacing: 0.4 },
  liveBubbleInitialsMe: { color: "#fff" },
  liveBubbleOnlineDot: {
    position: "absolute",
    right: 2,
    bottom: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.55)",
    backgroundColor: "#2ecc40",
  },
  liveBubbleMutedIcon: {
    position: "absolute",
    left: -7,
    bottom: -7,
    fontSize: 10,
    lineHeight: 10,
  },
  liveBubbleOnlineDotLive: {
    backgroundColor: "#2ecc40",
  },
  liveBubbleOnlineDotIdle: {
    backgroundColor: "#7A808F",
  },
  liveBubbleHostBadge: {
    position: "absolute",
    left: -2,
    top: -4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(220,20,60,0.88)",
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  liveBubbleHostBadgeText: { color: "#fff", fontSize: 10, fontWeight: "800" },
  liveBubbleName: { color: "#BEBEBE", fontSize: 11, fontWeight: "700", maxWidth: 72, textAlign: "center" },
  liveBubbleNameExpanded: { fontSize: 13, color: "#E5EBF8", fontWeight: "800" },
  liveBubbleNameFocused: { color: "#EDF3FF", fontWeight: "800" },
  liveBubbleNameFeatured: { fontSize: 14, fontWeight: "900", color: "#F4F7FF" },
  liveBubbleRole: {
    marginTop: -1,
    color: "#97A1B5",
    fontSize: 8.5,
    fontWeight: "800",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  liveBubbleRoleSpeaking: {
    color: "#DCEBFF",
    borderColor: "rgba(141,182,255,0.52)",
    backgroundColor: "rgba(78,117,194,0.3)",
  },
  liveBubbleRoleHost: {
    color: "#F8E6EB",
    borderColor: "rgba(220,20,60,0.5)",
    backgroundColor: "rgba(220,20,60,0.22)",
  },
  liveBubbleActionMenu: {
    position: "absolute",
    top: -10,
    left: "50%",
    transform: [{ translateX: -58 }],
    flexDirection: "row",
    gap: 4,
    zIndex: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(8,12,18,0.9)",
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  liveBubbleActionBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  liveBubbleActionBtnDanger: {
    borderColor: "rgba(220,20,60,0.5)",
    backgroundColor: "rgba(220,20,60,0.2)",
  },
  liveBubbleActionText: {
    color: "#EAF0FA",
    fontSize: 9,
    fontWeight: "800",
  },
  liveBubbleActionTextDanger: {
    color: "#FFE3EA",
  },

  // Participant modal
  participantModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.52)",
  },
  participantModalSheet: {
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
  participantModalHandle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.2)",
    marginBottom: 2,
  },
  participantModalKicker: { color: "#7A7A7A", fontSize: 9.5, fontWeight: "800", letterSpacing: 1, marginBottom: -2 },
  participantModalTitle: { color: "#fff", fontSize: 18, fontWeight: "900" },
  participantModalIdentityRow: { gap: 7, marginBottom: 2 },
  participantModalRolePill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  participantModalRolePillHost: {
    borderColor: "rgba(220,20,60,0.42)",
    backgroundColor: "rgba(220,20,60,0.14)",
  },
  participantModalRoleText: { color: "#CFCFCF", fontSize: 11, fontWeight: "800" },
  participantModalRoleTextHost: { color: "#F7D6DD" },
  participantModalStatusRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  participantModalStatusPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  participantModalStatusPillLive: {
    borderColor: "rgba(46,204,64,0.34)",
    backgroundColor: "rgba(46,204,64,0.12)",
  },
  participantModalStatusPillIdle: {
    borderColor: "rgba(122,128,143,0.35)",
    backgroundColor: "rgba(122,128,143,0.14)",
  },
  participantModalStatusPillMuted: {
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  participantModalStatusText: { color: "#B8B8B8", fontSize: 10.5, fontWeight: "700" },
  participantModalStatusTextLive: { color: "#BFDAC4" },
  participantModalActionsLabel: { color: "#7A7A7A", fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginTop: 2 },
  participantActionBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  participantActionBtnText: { color: "#E2E2E2", fontSize: 14, fontWeight: "800" },
  participantActionBtnDanger: {
    borderColor: "rgba(220,20,60,0.42)",
    backgroundColor: "rgba(220,20,60,0.14)",
  },
  participantActionBtnTextDanger: { color: "#F7D6DD" },
  participantActionBtnClose: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 2,
    alignItems: "center",
  },
  participantActionBtnCloseText: { color: "#BEBEBE", fontSize: 13, fontWeight: "800" },

  // Invite card
  inviteCard: {
    backgroundColor: "rgba(18,18,18,0.96)",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  inviteLeft: { gap: 4 },
  inviteLabel: { color: "#555", fontSize: 9.5, fontWeight: "800", letterSpacing: 1 },
  inviteCode: { color: "#F7D6DD", fontSize: 22, fontWeight: "900", letterSpacing: 2.5 },
  shareBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.4)",
    backgroundColor: "rgba(220,20,60,0.12)",
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  shareBtnText: { color: "#F7D6DD", fontSize: 11, fontWeight: "800" },
  reportRoomButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 10,
  },
  reportRoomButtonText: {
    color: "#C8D0E2",
    fontSize: 12,
    fontWeight: "800",
  },

  // Participants
  participantsWrap: { gap: 0 },
  participantsCard: {
    backgroundColor: "rgba(8,10,16,0.66)",
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    padding: 11,
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  participantsCardLive: {
    padding: 16,
  },
  participantsLabel: { color: "#7A7A7A", fontSize: 10.5, fontWeight: "700" },
  viewerCount: { color: "#F7D6DD", fontWeight: "900", fontSize: 11 },
  trendingBadge: { color: "#FF6B35", fontWeight: "800", fontSize: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipsLive: { gap: 10 },
  chip: {
    minWidth: 134,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chipLive: {
    minWidth: 172,
    paddingVertical: 10,
  },
  chipMe: {
    borderColor: "rgba(104,149,255,0.48)",
    backgroundColor: "rgba(104,149,255,0.16)",
  },
  chipHost: {
    borderColor: "rgba(220,20,60,0.52)",
    backgroundColor: "rgba(220,20,60,0.16)",
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    position: "relative",
  },
  chipAvatar: { fontSize: 14, fontWeight: "600" },
  chipAvatarImage: { width: "100%", height: "100%", borderRadius: 999 },
  participantMeta: { flex: 1, minWidth: 0 },
  chipText: { color: "#CACACA", fontSize: 11, fontWeight: "700" },
  chipTextHost: { color: "#F7D6DD" },
  participantStatus: {
    marginTop: 4,
    fontSize: 9.5,
    fontWeight: "800",
    textTransform: "capitalize",
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  participantStatusWatching: {
    color: "#9BE3B1",
    borderColor: "rgba(46,204,64,0.35)",
    backgroundColor: "rgba(46,204,64,0.16)",
  },
  participantStatusPaused: {
    color: "#E4CB92",
    borderColor: "rgba(181,137,0,0.35)",
    backgroundColor: "rgba(181,137,0,0.16)",
  },
  participantStatusSyncing: {
    color: "#A7C4FF",
    borderColor: "rgba(104,149,255,0.4)",
    backgroundColor: "rgba(104,149,255,0.16)",
  },
  participantStatusLive: {
    color: "#A7C4FF",
    borderColor: "rgba(104,149,255,0.4)",
    backgroundColor: "rgba(104,149,255,0.16)",
  },
  participantReactionBadge: {
    position: "absolute",
    top: -8,
    right: -8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(0,0,0,0.75)",
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  participantReactionText: { fontSize: 11, fontWeight: "800" },

  bottomLiveStripOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 64,
    backgroundColor: "transparent",
    justifyContent: "center",
    zIndex: 40,
  },
  bottomLiveStripContent: {
    paddingHorizontal: 12,
    gap: 8,
    alignItems: "center",
    minHeight: 64,
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
  bottomLiveBubblePresenceDot: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.46)",
    backgroundColor: "#2ecc40",
  },
  bottomLiveBubblePresenceDotLive: {
    backgroundColor: "#2ecc40",
  },
  bottomLiveBubblePresenceDotIdle: {
    backgroundColor: "#7A808F",
  },
  bottomLiveBubbleMutedIcon: {
    position: "absolute",
    left: -8,
    bottom: -8,
    fontSize: 10,
    lineHeight: 10,
  },

  // Watch CTA
  watchCTA: {
    backgroundColor: "#DC143C",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    shadowColor: "#DC143C",
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  watchCTALiveOn: {
    backgroundColor: "#B80F31",
  },
  watchCTAText: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },
  tailoredRoomCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(12,12,12,0.92)",
    paddingHorizontal: 16,
    paddingVertical: 15,
    gap: 8,
  },
  tailoredRoomTitle: {
    color: "#F5F7FB",
    fontSize: 17,
    fontWeight: "900",
  },
  tailoredRoomBody: {
    color: "#A9B2C6",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  tailoredRoomMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  tailoredRoomMetaPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tailoredRoomMetaText: {
    color: "#D9E1F2",
    fontSize: 11,
    fontWeight: "700",
  },
  tailoredRoomActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tailoredRoomActionButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(90,153,255,0.32)",
    backgroundColor: "rgba(24,42,76,0.86)",
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: "center",
  },
  tailoredRoomActionButtonGhost: {
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  tailoredRoomActionText: {
    color: "#E6EEFF",
    fontSize: 13,
    fontWeight: "900",
  },
  tailoredRoomActionTextGhost: {
    color: "#E6EAF5",
  },

  // Reactions
  interactionWrap: { gap: 0 },
  reactionsPanel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(12,12,12,0.92)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 6,
  },
  reactionsRow: { flexDirection: "row", gap: 10, paddingVertical: 2 },
  reactionBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  reactionBtnMuted: { opacity: 0.3 },
  reactionEmoji: { fontSize: 22 },
  reactionOverlay: {
    position: "absolute",
    right: 14,
    bottom: 184,
    width: 118,
    height: 188,
    alignItems: "center",
    justifyContent: "flex-end",
  },
  reactionOverlayEmoji: {
    position: "absolute",
    bottom: 0,
    fontSize: 28,
    fontWeight: "900",
  },
  mutedNotice: { color: "#555", fontSize: 11, textAlign: "center", marginTop: -4 },

  // Host controls
  hostWrap: { gap: 0 },
  hostSection: {
    backgroundColor: "rgba(15,15,15,0.97)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    padding: 14,
    gap: 11,
  },
  hostSectionLabel: { color: "#555", fontSize: 9.5, fontWeight: "800", letterSpacing: 1 },
  hostPlaybackRow: { flexDirection: "row", gap: 8 },
  hostPlaybackBtn: {
    flex: 1,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingVertical: 11,
    alignItems: "center",
  },
  hostPlaybackBtnPrimary: {
    borderColor: "rgba(220,20,60,0.56)",
    backgroundColor: "rgba(220,20,60,0.28)",
    shadowColor: "#DC143C",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  hostPlaybackBtnText: { color: "#ddd", fontSize: 12, fontWeight: "800" },
  hostPlaybackBtnTextPrimary: { color: "#fff" },
  hostBtnRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  hostBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    backgroundColor: "rgba(255,255,255,0.07)",
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  hostBtnOn: {
    borderColor: "rgba(220,20,60,0.4)",
    backgroundColor: "rgba(220,20,60,0.12)",
  },
  hostBtnText: { color: "#ccc", fontSize: 12, fontWeight: "700" },

  // Chat toggle
  chatToggle: {
    marginTop: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  chatToggleText: { color: "#999", fontSize: 13, fontWeight: "800" },
  chatCount: { color: "#555", fontWeight: "600" },

  // Chat section
  chatSection: {
    backgroundColor: "rgba(12,12,12,0.97)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    overflow: "hidden",
  },
  chatScroll: { maxHeight: 260 },
  chatScrollContent: { padding: 12, gap: 6 },
  chatEmpty: { color: "#555", fontSize: 13, textAlign: "center", paddingVertical: 12 },
  msgRow: { alignItems: "flex-start" },
  msgRowMe: { alignItems: "flex-end" },
  msgBubble: {
    backgroundColor: "rgba(255,255,255,0.07)",
    borderRadius: 12,
    paddingHorizontal: 11,
    paddingVertical: 7,
    maxWidth: "80%",
  },
  msgBubbleMe: { backgroundColor: "rgba(220,20,60,0.22)" },
  msgAuthor: { color: "#666", fontSize: 10, fontWeight: "700", marginBottom: 2 },
  msgText: { color: "#ddd", fontSize: 13, lineHeight: 18 },
  msgTextMe: { color: "#F7D6DD" },
  reactionLine: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 1 },
  reactionLineEmoji: { fontSize: 18 },
  reactionLineAuthor: { color: "#555", fontSize: 10 },
  systemMsg: { color: "#666", fontSize: 12, textAlign: "center", paddingVertical: 6, fontStyle: "italic", fontWeight: "500" },
  chatInputRow: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.07)",
  },
  chatInput: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    color: "#fff",
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 13,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#DC143C",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.35 },
  sendBtnText: { color: "#fff", fontSize: 16, fontWeight: "900" },
});
