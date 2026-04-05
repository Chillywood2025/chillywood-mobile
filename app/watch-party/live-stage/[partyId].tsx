import type { RealtimeChannel } from "@supabase/supabase-js";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    ActivityIndicator,
    Animated,
    AppState,
    Image,
    ImageBackground,
    LayoutAnimation,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View,
    type ImageSourcePropType,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { titles as localTitles } from "../../../_data/titles";
import {
    DEFAULT_APP_CONFIG,
    readAppConfig,
    resolveBrandingConfig,
} from "../../../_lib/appConfig";
import { getBetaAccessBlockCopy, useBetaProgram } from "../../../_lib/betaProgram";
import { debugLog, reportRuntimeError } from "../../../_lib/logger";
import { buildSafetyReportContext, submitSafetyReport, trackModerationActionUsed } from "../../../_lib/moderation";
import { useSession } from "../../../_lib/session";
import { supabase } from "../../../_lib/supabase";
import { readUserProfile } from "../../../_lib/userData";
import {
    getActivePartyMemberships,
    getPartyRoomSnapshot,
    getSafePartyUserId,
    joinPartyRoomSession,
    setPartyParticipantState,
    touchPartyRoomSession,
    type WatchPartyRoomMembership,
    type WatchPartyState,
} from "../../../_lib/watchParty";
import { buildFooterControlTokens, mapFooterControlRowStyles } from "../../../components/room/control-style-tokens";
import { LiveLowerDock } from "../../../components/room/live-lower-dock";
import { ParticipantDetailSheet } from "../../../components/room/participant-detail-sheet";
import { pushRecentReaction } from "../../../components/room/reaction-picker";
import { ProtectedSessionNote, getProtectedSessionCopy } from "../../../components/prototype/protected-session-note";
import { ReportSheet } from "../../../components/safety/report-sheet";
import { BetaAccessScreen } from "../../../components/system/beta-access-screen";
import {
    buildOrderedParticipantsWithSelf,
    buildParticipantProfileParams,
    buildSharedParticipantIdentity,
    createDefaultParticipantState,
    getParticipantRoleLabel,
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

type StageChatMessage = {
  id: string;
  userId: string;
  username: string;
  text: string;
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

const STAGE_CHAT_LINES = [
  "This stage looks cinematic tonight.",
  "Hybrid layout is super clean 👏",
  "Dropping reactions from Lagos 🇳🇬",
  "Can’t wait for player mode in stage.",
  "Audio sync test soon?",
  "Host energy is amazing 🔥",
  "Love this vibe ✨",
  "Who else is watching from mobile?",
  "This feels like TikTok Live already.",
  "Send hearts if you can hear me ❤️",
];

const SIM_REACTIONS = ["👍", "🔥", "👏", "❤️", "✨", "😂"];
const MIC_SPEAKING_THRESHOLD_DB = -52;
const MIC_SPEAKING_RELEASE_MS = 420;
const STAGE_HEARTBEAT_INTERVAL_MILLIS = 10_000;

export default function WatchPartyLiveStageScreen() {
  const safeAreaInsets = useSafeAreaInsets();
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
  const [stageMode, setStageMode] = useState<SharedRoomMode>(initialStageMode);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reactionPickerOpen, setReactionPickerOpen] = useState(false);
  const [recentReactionEmojis, setRecentReactionEmojis] = useState<string[]>([]);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [stageMessages, setStageMessages] = useState<StageChatMessage[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [activeSpeakerUserId, setActiveSpeakerUserId] = useState<string>("");
  const [activeParticipantId, setActiveParticipantId] = useState<string>("");
  const [featuredParticipantById, setFeaturedParticipantById] = useState<Record<string, boolean>>({});
  const [participantPresentationById, setParticipantPresentationById] = useState<Record<string, "compact" | "expanded">>({});
  const [participantStateById, setParticipantStateById] = useState<Record<string, SharedParticipantLocalState>>({});
  const [isSpeakingById, setIsSpeakingById] = useState<Record<string, boolean>>({});
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>("");
  const [hiddenParticipantIds, setHiddenParticipantIds] = useState<Record<string, boolean>>({});
  const [appConfig, setAppConfig] = useState(DEFAULT_APP_CONFIG);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ userId: string; label: string } | null>(null);
  const myCameraPreviewUrlRef = useRef<string>("");
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const channelRef = useRef<RealtimeChannel | null>(null);
  const roomRealtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const membershipMapRef = useRef<Record<string, WatchPartyRoomMembership>>({});
  const motion = useRef(new Animated.Value(0)).current;
  const reactionTapPulse = useRef(new Animated.Value(0)).current;
  const reactionCounterRef = useRef(0);
  const chatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    setStageMode(normalizeSharedRoomMode(modeParamValue, "live"));
  }, [modeParamValue]);

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

  const pushStageMessage = useCallback((userId: string, username: string, text: string) => {
    const next: StageChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userId,
      username,
      text,
    };
    setStageMessages((prev) => [...prev.slice(-39), next]);
  }, []);

  useEffect(() => {
    if (displayParticipants.length === 0) return;
    if (stageMessages.length > 0) return;

    const initial = displayParticipants.slice(0, 3).map((participant, index) => ({
      id: `hello-${participant.userId}-${index}`,
      userId: participant.userId,
      username: participant.userId === myUserId ? "You" : participant.username,
      text: participant.userId === myUserId ? "joined the live stage" : "joined the room",
    }));
    setStageMessages(initial);
  }, [displayParticipants, stageMessages.length, myUserId]);

  useEffect(() => {
    if (displayParticipants.length === 0) return;
    let cancelled = false;

    const schedule = () => {
      if (cancelled) return;
      const delay = 2600 + Math.floor(Math.random() * 4200);
      chatTimeoutRef.current = setTimeout(() => {
        if (cancelled) return;
        const speakerPool = displayParticipants.filter((participant) => participant.userId !== myUserId);
        const speaker = speakerPool[Math.floor(Math.random() * speakerPool.length)] ?? displayParticipants[0];
        if (!speaker) return;
        const line = STAGE_CHAT_LINES[Math.floor(Math.random() * STAGE_CHAT_LINES.length)];
        pushStageMessage(speaker.userId, speaker.username, line);

        if (Math.random() < 0.24) {
          setTimeout(() => {
            if (cancelled) return;
            const second = speakerPool[Math.floor(Math.random() * speakerPool.length)] ?? speaker;
            const shortLine = STAGE_CHAT_LINES[Math.floor(Math.random() * STAGE_CHAT_LINES.length)].slice(0, 36);
            pushStageMessage(second.userId, second.username, shortLine);
          }, 420 + Math.floor(Math.random() * 900));
        }

        schedule();
      }, delay);
    };

    schedule();
    return () => {
      cancelled = true;
      if (chatTimeoutRef.current) clearTimeout(chatTimeoutRef.current);
    };
  }, [displayParticipants, myUserId, pushStageMessage]);

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

  useEffect(() => {
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
  }, [myUserId, emitParticipantSpeaking]);

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
  const stageScale = motion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.016] });
  const stageOpacity = motion.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1] });
  const liveDotScale = motion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.3] });
  const liveDotOpacity = motion.interpolate({ inputRange: [0, 1], outputRange: [0.58, 1] });
  const viewersScale = motion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const viewersOpacity = motion.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] });
  const liveGlowOpacity = motion.interpolate({ inputRange: [0, 1], outputRange: [0.24, 0.48] });
  const chatFloat = motion.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  const chatOpacity = motion.interpolate({ inputRange: [0, 1], outputRange: [0.78, 0.9] });
  const liveDockBottomInset = Math.max(28, safeAreaInsets.bottom + 14);
  const commentsLaneBottomOffset = liveDockBottomInset + 188;
  const localHeroPreviewUri = String(myCameraPreviewUrlRef.current || "").trim();
  const hasLocalHeroCamera = Platform.OS !== "web" && !!cameraPermission?.granted;
  const hasLocalHeroImage = !hasLocalHeroCamera && !!localHeroPreviewUri;
  const heroOwnsLocalFeed = hasLocalHeroCamera || hasLocalHeroImage;
  const isLiveFirstMode = stageMode === "live";
  const lowerCommunityParticipants = useMemo(() => {
    if (isLiveFirstMode) {
      return visibleStripParticipants.filter((participant) => participant.role !== "host");
    }
    return visibleStripParticipants.filter((participant) => participant.userId !== currentUserParticipantId);
  }, [isLiveFirstMode, visibleStripParticipants, currentUserParticipantId]);
  const lowerCommunityCountLabel = isLiveFirstMode
    ? (lowerCommunityParticipants.length > 0 ? `${lowerCommunityParticipants.length} in audience` : "Audience waiting")
    : `${viewerCount} in room`;

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
        <Text style={styles.loadingText}>Opening Live Stage…</Text>
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

      <View style={[styles.screen, { paddingBottom: liveDockBottomInset + 92 }]}> 
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

        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeBtn, stageMode === "live" && styles.modeBtnOn]}
            activeOpacity={0.82}
            onPress={() => setStageMode("live")}
          >
            <Text style={[styles.modeBtnText, stageMode === "live" && styles.modeBtnTextOn]}>Live-First</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, stageMode === "hybrid" && styles.modeBtnOn]}
            activeOpacity={0.82}
            onPress={() => setStageMode("hybrid")}
          >
            <Text style={[styles.modeBtnText, stageMode === "hybrid" && styles.modeBtnTextOn]}>{branding.watchPartyLabel}</Text>
          </TouchableOpacity>
        </View>

        <ProtectedSessionNote
          {...getProtectedSessionCopy("live-stage", {
            contentAccessRule: room?.contentAccessRule,
            capturePolicy: room?.capturePolicy,
          })}
        />

        <Animated.View
          style={[
            styles.stageCanvas,
            stageMode === "hybrid" && styles.stageCanvasHybrid,
            { transform: [{ scale: stageScale }], opacity: stageOpacity },
          ]}
        >
          {hasLocalHeroCamera ? (
            <CameraView
              style={styles.stageHeroMediaFill}
              facing="front"
              mute
              mirror
            />
          ) : hasLocalHeroImage ? (
            <Image
              source={{ uri: localHeroPreviewUri }}
              style={styles.stageHeroMediaFill}
            />
          ) : null}
          <View pointerEvents="none" style={styles.stageHeroOverlay}>
            <View style={styles.stageHeroTagRow}>
              <View style={styles.stageHeroLiveDot} />
            <Text style={styles.stageHeroTagText}>{isLiveFirstMode ? "LIVE FIRST" : "LIVE WATCH-PARTY"}</Text>
          </View>
        </View>
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
        </Animated.View>

        <View style={[styles.overlayBottom, { bottom: commentsLaneBottomOffset }]} pointerEvents="box-none">
          {commentsOpen ? (
            <Animated.View pointerEvents="auto" style={[styles.chatOverlay, { opacity: chatOpacity, transform: [{ translateY: chatFloat }] }]}>
              <Text style={styles.chatDrawerTitle}>Comments</Text>
              <ScrollView style={styles.chatDrawerList} contentContainerStyle={styles.chatDrawerListContent}>
                {stageMessages.length === 0 ? (
                  <Text style={styles.chatOverlayLine}>No comments yet.</Text>
                ) : (
                  stageMessages.slice(-20).map((msg) => {
                    const isMe = msg.userId === myUserId;
                    return (
                      <Text key={msg.id} style={styles.chatOverlayLine}>
                        <Text style={[styles.chatUsername, isMe && styles.chatUsernameMe]}>{isMe ? "You" : msg.username}: </Text>
                        <Text style={styles.chatMessageText}>{msg.text}</Text>
                      </Text>
                    );
                  })
                )}
              </ScrollView>
            </Animated.View>
          ) : null}
        </View>

        <LiveLowerDock
          rootStyle={[styles.liveStageLowerDock, { marginBottom: liveDockBottomInset }]}
          participantStrip={(
            <View style={styles.stageParticipantStripWrap}>
              <View style={styles.stageTailoredCard}>
                <Text style={styles.stageTailoredKicker}>{isLiveFirstMode ? "LIVE FIRST FOCUS" : "TAILORED LIVE WATCH-PARTY"}</Text>
                <Text style={styles.stageTailoredTitle}>
                  {isLiveFirstMode ? "Keep the live room focused" : "Keep the host and community clear"}
                </Text>
                <Text style={styles.stageTailoredBody}>
                  {hostParticipant
                    ? `${hostParticipant.userId === currentUserParticipantId ? "You are" : `${hostParticipant.displayName} is`} hosting. Use local host-first and hide controls here without opening a separate communication room.`
                    : "Use local host-first and hide controls here without opening a separate communication room."}
                </Text>
                <View style={styles.stageTailoredMetaRow}>
                  <View style={styles.stageTailoredMetaPill}>
                    <Text style={styles.stageTailoredMetaText}>
                      Host: {hostParticipant ? (hostParticipant.userId === currentUserParticipantId ? "You" : hostParticipant.displayName) : "Syncing..."}
                    </Text>
                  </View>
                  <View style={styles.stageTailoredMetaPill}>
                    <Text style={styles.stageTailoredMetaText}>
                      Focus: {tailoredFocusParticipant ? (tailoredFocusParticipant.userId === currentUserParticipantId ? "You" : tailoredFocusParticipant.displayName) : "Host"}
                    </Text>
                  </View>
                  {hiddenParticipantCount > 0 ? (
                    <View style={styles.stageTailoredMetaPill}>
                      <Text style={styles.stageTailoredMetaText}>Hidden locally: {hiddenParticipantCount}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.stageTailoredActions}>
                  <TouchableOpacity
                    style={styles.stageTailoredActionButton}
                    activeOpacity={0.86}
                    onPress={() => {
                      if (!hostParticipant?.userId) return;
                      featureParticipantFirst(hostParticipant.userId);
                    }}
                    disabled={!hostParticipant?.userId}
                  >
                    <Text style={styles.stageTailoredActionText}>See host first</Text>
                  </TouchableOpacity>
                  {tailoredFocusParticipant && tailoredFocusParticipant.userId !== hostParticipant?.userId ? (
                    <TouchableOpacity
                      style={styles.stageTailoredActionButton}
                      activeOpacity={0.86}
                      onPress={() => {
                        featureParticipantFirst(tailoredFocusParticipant.userId);
                      }}
                    >
                      <Text style={styles.stageTailoredActionText}>
                        See {tailoredFocusParticipant.userId === currentUserParticipantId ? "yourself" : tailoredFocusParticipant.displayName} first
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {tailoredFocusParticipant
                    && tailoredFocusParticipant.userId !== currentUserParticipantId
                    && tailoredFocusParticipant.role !== "host" ? (
                    <TouchableOpacity
                      style={[styles.stageTailoredActionButton, styles.stageTailoredActionButtonGhost]}
                      activeOpacity={0.86}
                      onPress={() => {
                        hideParticipantLocally(tailoredFocusParticipant.userId);
                      }}
                    >
                      <Text style={[styles.stageTailoredActionText, styles.stageTailoredActionTextGhost]}>
                        Hide {tailoredFocusParticipant.displayName}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {hiddenParticipantCount > 0 ? (
                    <TouchableOpacity
                      style={[styles.stageTailoredActionButton, styles.stageTailoredActionButtonGhost]}
                      activeOpacity={0.86}
                      onPress={showEveryoneLocally}
                    >
                      <Text style={[styles.stageTailoredActionText, styles.stageTailoredActionTextGhost]}>Show everyone</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.stageTailoredActionButton, styles.stageTailoredActionButtonGhost]}
                    activeOpacity={0.86}
                    onPress={resetTailoredStageView}
                  >
                    <Text style={[styles.stageTailoredActionText, styles.stageTailoredActionTextGhost]}>Reset layout</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.stageCommunityHeader}>
                <View style={styles.stageCommunityHeaderLeft}>
                  <View style={styles.stageCommunityDot} />
                  <Text style={styles.stageCommunityLabel}>{isLiveFirstMode ? "Audience" : "Live Community"}</Text>
                </View>
                <Text style={styles.stageCommunityCount}>{lowerCommunityCountLabel}</Text>
              </View>
              {lowerCommunityParticipants.length === 0 ? (
                <View style={styles.stageCommunityEmptyState}>
                  <Text style={styles.stageCommunityEmptyText}>No audience in room yet.</Text>
                </View>
              ) : (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.stagePresenceScroll}
                  contentContainerStyle={styles.stagePresenceScrollContent}
                >
                  {lowerCommunityParticipants.map((participant) => {
                  const isCurrentUser = participant.userId === currentUserParticipantId;
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
                  const presentation = participantPresentationById[participant.userId] ?? "compact";
                  const isExpanded = presentation === "expanded";
                  const canModerateParticipant = participantState.role !== "host";
                  const roleLabel = getParticipantRoleLabel(participantState);
                  const participantDisplayName = isCurrentUser && isLiveFirstMode
                    ? "You"
                    : participant.displayName;
                  const showLocalCameraPreview = Platform.OS !== "web" && isCurrentUser && !!cameraPermission?.granted && !heroOwnsLocalFeed;
                  const bubbleMediaUri = isCurrentUser
                    ? (heroOwnsLocalFeed ? (participant.avatarUrl || "") : (myCameraPreviewUrlRef.current || participant.cameraPreviewUrl || participant.avatarUrl || ""))
                    : (participant.cameraPreviewUrl || participant.avatarUrl || "");

                  return (
                    <TouchableOpacity
                      key={`presence-${participant.userId}`}
                      activeOpacity={0.74}
                      style={[
                        styles.stageParticipantTile,
                        isExpanded && styles.stageParticipantTileExpanded,
                        isFeatured && styles.stageParticipantTileFeatured,
                        isActiveParticipant && !isFeatured && styles.stageParticipantTileActive,
                        isRemoved && styles.stageParticipantTileRemoved,
                      ]}
                      onPress={() => {
                        if (isHost) {
                          debugLog("live-stage", "host tap user", { userId: participant.userId });
                        } else {
                          debugLog("live-stage", "request mic", { userId: participant.userId });
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
                        <View style={styles.stageParticipantActionMenu}>
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
                            }}
                          >
                            <Text style={styles.stageParticipantActionText}>{isSpeakerRole ? "Listener" : "Speaker"}</Text>
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
                            }}
                          >
                            <Text style={[styles.stageParticipantActionText, styles.stageParticipantActionTextDanger]}>
                              {isRemoved ? "Restore" : "Remove"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                      <View style={styles.stagePresenceTapWrap}>
                        <Animated.View
                          style={[
                            styles.stagePresenceBubble,
                            isExpanded && styles.stagePresenceBubbleExpanded,
                            isFeatured && styles.stagePresenceBubbleFeatured,
                          ]}
                        >
                        {isHostBubble ? <View style={styles.stagePresenceHostDot} /> : null}
                        {(showLocalCameraPreview || bubbleMediaUri) ? (
                          <View
                            style={[
                              styles.stagePresenceFaceClip,
                              isExpanded && styles.stagePresenceFaceClipExpanded,
                              isFeatured && styles.stagePresenceFaceClipFeatured,
                            ]}
                          >
                            {showLocalCameraPreview ? (
                              <CameraView
                                style={styles.stagePresenceCameraFill}
                                facing="front"
                                mute
                                mirror
                              />
                            ) : (
                              <Image
                                source={{ uri: bubbleMediaUri }}
                                style={[
                                  styles.stagePresenceImage,
                                  isExpanded && styles.stagePresenceImageExpanded,
                                  isFeatured && styles.stagePresenceImageFeatured,
                                ]}
                              />
                            )}
                          </View>
                        ) : (
                          <Text
                            style={[
                              styles.stagePresenceInitial,
                              isExpanded && styles.stagePresenceInitialExpanded,
                              isFeatured && styles.stagePresenceInitialFeatured,
                            ]}
                          >
                            {participantDisplayName.slice(0, 1).toUpperCase()}
                          </Text>
                        )}
                        <View style={styles.stagePresenceOnlineDot} />
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
                          isExpanded && styles.stageParticipantNameExpanded,
                          isFeatured && styles.stageParticipantNameFeatured,
                        ]}
                      >
                        {participantDisplayName}
                      </Text>
                      <Text
                        style={[
                          styles.stageParticipantRole,
                        ]}
                      >
                        {isMuted ? `${roleLabel} · Muted` : roleLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                </ScrollView>
              )}
            </View>
          )}
          leftAction={{
            id: "comments",
            icon: "🗨️",
            label: "Comments",
            activeOpacity: 0.82,
            onPress: () => {
              setReactionPickerOpen(false);
              setCommentsOpen((value) => !value);
            },
            buttonStyle: commentsOpen ? styles.stageFooterActionActiveBtn : undefined,
            labelStyle: commentsOpen ? styles.stageFooterActionActiveLabel : undefined,
          }}
          trailingActions={[
            {
              id: "react",
              icon: "✨",
              label: "React",
              activeOpacity: 0.82,
              onPress: () => {
                setCommentsOpen(false);
                setReactionPickerOpen((value) => !value);
              },
              buttonStyle: reactionPickerOpen ? styles.stageFooterActionActiveBtn : undefined,
              labelStyle: reactionPickerOpen ? styles.stageFooterActionActiveLabel : undefined,
            },
          ]}
          footerStyles={mapFooterControlRowStyles({
            row: styles.footerControls,
            actionButton: styles.footerIconBtn,
            actionIconText: styles.footerIconBtnText,
            actionLabelText: styles.footerIconBtnLabel,
            quickRow: styles.footerReactionQuickRow,
            quickChip: styles.footerReactionQuickBtn,
            quickChipText: styles.footerReactionQuickText,
          }, buildFooterControlTokens({ size: "compact", surface: "glass" }))}
          reactionPicker={{
            visible: reactionPickerOpen,
            onClose: () => setReactionPickerOpen(false),
            onSelectEmoji: onSelectReactionFromPicker,
            recentEmojis: recentReactionEmojis,
            title: "React",
            subtitle: "Browse and tap to send",
            styles: {
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
            },
          }}
        />
      </View>

      <ParticipantDetailSheet
        visible={!!selectedParticipant}
        participant={selectedParticipant}
        participantState={selectedParticipantState}
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

  modeRow: {
    flexDirection: "row",
    gap: 4,
    marginBottom: 8,
    alignSelf: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.24)",
    padding: 2,
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
  stageCanvasHybrid: {
    minHeight: 470,
  },
  stageHeroMediaFill: {
    ...StyleSheet.absoluteFillObject,
  },
  stageHeroOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    paddingHorizontal: 8,
    paddingBottom: 14,
    backgroundColor: "rgba(0,0,0,0.08)",
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
  liveStageLowerDock: {
    marginTop: 8,
  },
  stageParticipantStripWrap: {
    marginTop: 3,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(154,182,246,0.24)",
    backgroundColor: "rgba(7,12,22,0.74)",
    paddingVertical: 8,
    paddingHorizontal: 10,
    shadowColor: "#000",
    shadowOpacity: 0.26,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
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
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  stageCommunityHeaderLeft: {
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
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.35,
    textTransform: "uppercase",
  },
  stageCommunityCount: {
    color: "#AEB9CF",
    fontSize: 10,
    fontWeight: "700",
  },
  stagePresenceScroll: { marginTop: 0, maxHeight: 176 },
  stagePresenceScrollContent: { flexDirection: "row", alignItems: "stretch", gap: 10, paddingRight: 10, paddingVertical: 2 },
  stageCommunityEmptyState: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(162,184,228,0.2)",
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 10,
  },
  stageCommunityEmptyText: {
    color: "#AEB9CF",
    fontSize: 10.5,
    fontWeight: "700",
  },
  stageParticipantTile: {
    width: 82,
    minHeight: 94,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(184,206,246,0.2)",
    backgroundColor: "rgba(14,20,32,0.78)",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 9,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    position: "relative",
  },
  stageParticipantTileExpanded: {
    width: 136,
    minHeight: 136,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderColor: "rgba(148,184,255,0.88)",
    backgroundColor: "rgba(30,40,64,0.9)",
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
  },
  stageParticipantTileFeatured: {
    width: 186,
    minHeight: 186,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginHorizontal: 6,
    borderColor: "rgba(226,236,255,0.62)",
    backgroundColor: "rgba(36,47,74,0.92)",
    shadowColor: "rgba(150,185,255,0.65)",
    shadowOpacity: 0.44,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
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
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(0,0,0,0.48)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  stagePresenceBubbleExpanded: {
    width: 68,
    height: 68,
    borderRadius: 34,
  },
  stagePresenceBubbleFeatured: {
    width: 92,
    height: 92,
    borderRadius: 46,
    marginHorizontal: 2,
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
  stagePresenceInitial: { color: "#ECECEC", fontSize: 14, fontWeight: "900" },
  stagePresenceInitialExpanded: { fontSize: 22 },
  stagePresenceInitialFeatured: { fontSize: 29 },
  stagePresenceImage: { width: "100%", height: "100%", borderRadius: 13 },
  stagePresenceImageExpanded: { borderRadius: 22 },
  stagePresenceImageFeatured: { borderRadius: 30 },
  stagePresenceFaceClip: {
    width: "100%",
    height: "100%",
    borderRadius: 13,
    overflow: "hidden",
  },
  stagePresenceFaceClipExpanded: { borderRadius: 22 },
  stagePresenceFaceClipFeatured: { borderRadius: 30 },
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
    width: 10,
    height: 10,
    borderRadius: 5,
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
    marginTop: 7,
    color: "#C6CEDC",
    fontSize: 10.5,
    fontWeight: "700",
    textAlign: "center",
    maxWidth: "100%",
  },
  stageParticipantNameActive: {
    color: "#C6CEDC",
    fontWeight: "700",
  },
  stageParticipantNameExpanded: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "800",
    color: "#E5EBF8",
  },
  stageParticipantNameFeatured: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "900",
    color: "#F4F7FF",
  },
  stageParticipantRole: {
    marginTop: 3,
    fontSize: 9,
    fontWeight: "800",
    color: "#9FA8BA",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.06)",
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
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(7,10,16,0.84)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxHeight: 206,
    width: "100%",
  },
  chatDrawerTitle: { color: "#EFF3FC", fontSize: 11.5, fontWeight: "900", marginBottom: 6 },
  chatDrawerList: { maxHeight: 166 },
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
    gap: 4,
    marginTop: 10,
    alignSelf: "center",
  },
  footerIconBtn: {
    width: 58,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(0,0,0,0.36)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
    gap: 2,
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
    backgroundColor: "rgba(0,0,0,0.32)",
    alignItems: "center",
    justifyContent: "center",
  },
  footerReactionQuickText: {
    color: "#F1F1F1",
    fontSize: 15,
    fontWeight: "900",
  },
  footerIconBtnText: { color: "#F1F1F1", fontSize: 15, fontWeight: "900" },
  footerIconBtnLabel: { color: "#D4D4D4", fontSize: 9.5, fontWeight: "800" },
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
