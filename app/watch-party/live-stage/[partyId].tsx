import type { RealtimeChannel } from "@supabase/supabase-js";
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from "expo-av";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
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
import { supabase } from "../../../_lib/supabase";
import { readUserProfile } from "../../../_lib/userData";
import { getPartyRoom, getSafePartyUserId } from "../../../_lib/watchParty";
import { buildFooterControlTokens, mapFooterControlRowStyles } from "../../../components/room/control-style-tokens";
import { LiveLowerDock } from "../../../components/room/live-lower-dock";
import { pushRecentReaction } from "../../../components/room/reaction-picker";
import {
    computeDominantSpeakerId,
    createDefaultParticipantState,
    getParticipantRoleLabel,
    mergeMissingParticipantStates,
    resolveIdentityName,
} from "../_lib/_room-shared";

type StageParticipant = {
  userId: string;
  username: string;
  avatarUrl?: string;
  cameraPreviewUrl?: string;
  role: "host" | "viewer";
  isLive: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
};

type ParticipantLocalState = {
  isMuted: boolean;
  role: "host" | "speaker" | "listener";
  isRemoved: boolean;
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

export default function WatchPartyLiveStageScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const { partyId: partyIdParam } = useLocalSearchParams<{ partyId?: string }>();
  const partyId = (Array.isArray(partyIdParam) ? partyIdParam[0] : partyIdParam) ?? "";

  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<StageParticipant[]>([]);
  const [myUserId, setMyUserId] = useState<string>("");
  const [myUsername, setMyUsername] = useState<string>("You");
  const [isHost, setIsHost] = useState(false);
  const [stageMode, setStageMode] = useState<"live" | "hybrid">("live");
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
  const [recentlyJoinedById, setRecentlyJoinedById] = useState<Record<string, boolean>>({});
  const [participantStateById, setParticipantStateById] = useState<Record<string, ParticipantLocalState>>({});
  const [isSpeakingById, setIsSpeakingById] = useState<Record<string, boolean>>({});
  const [micLevelDb, setMicLevelDb] = useState(-160);
  const [tapPulseById, setTapPulseById] = useState<Record<string, boolean>>({});
  const myCameraPreviewUrlRef = useRef<string>("");
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const channelRef = useRef<RealtimeChannel | null>(null);
  const motion = useRef(new Animated.Value(0)).current;
  const reactionTapPulse = useRef(new Animated.Value(0)).current;
  const reactionCounterRef = useRef(0);
  const chatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const joinPulseTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const micRecordingRef = useRef<Audio.Recording | null>(null);
  const micSpeakingRef = useRef(false);
  const micReleaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seenParticipantIdsRef = useRef<string[]>([]);
  const tapPulseTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const stripOrderRef = useRef<string>("");

  useEffect(() => {
    if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
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

  const backgroundSource: ImageSourcePropType | null = (() => {
    const first = localTitles[0] as any;
    return first?.image || first?.poster || null;
  })();

  useEffect(() => {
    console.log("LIVE STAGE MOUNT", { partyIdParam, partyId });
  }, [partyIdParam, partyId]);

  useEffect(() => {
    console.log("LIVE STAGE LOADING STATE", { loading });
  }, [loading]);

  useEffect(() => {
    let cancelled = false;
    let loadGuardTimeout: ReturnType<typeof setTimeout> | null = null;

    const init = async () => {
      try {
        console.log("LIVE STAGE ROUTE PARAMS", { partyIdParam, partyId });
        console.log("LIVE STAGE ASYNC START", { partyId });

        if (!partyId) {
          console.log("LIVE STAGE MISSING PARTY ID");
          console.log("LIVE STAGE SET LOADING FALSE", { reason: "missing-party-id" });
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
        const room = await getPartyRoom(partyId).catch(() => null);

        console.log("LIVE STAGE ASYNC COMPLETE", {
          userId,
          username,
          roomFound: !!room,
        });

        if (cancelled) return;

        setMyUserId(trackedUserId);
        setMyUsername(username || "You");
        setIsHost(!!room && String(room.hostUserId) === String(trackedUserId));
        myCameraPreviewUrlRef.current = profileCameraPreviewUrl;

        const channel = supabase.channel(`room-${partyId}`, {
          config: { presence: { key: trackedUserId } },
        });

      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ userId?: string; username?: string; avatarUrl?: string; cameraPreviewUrl?: string; camera_preview_url?: string; role?: string; isLive?: boolean; isSpeaking?: boolean; isMuted?: boolean }>();
        const list: StageParticipant[] = Object.entries(state).map(([key, presences]) => {
          const p = Array.isArray(presences)
            ? (presences[0] as { userId?: string; username?: string; avatarUrl?: string; cameraPreviewUrl?: string; camera_preview_url?: string; role?: string; isLive?: boolean; isSpeaking?: boolean; isMuted?: boolean })
            : {};
          const resolvedUserId = String(p.userId ?? key).trim();
          const resolvedUsername = resolveIdentityName(p.username, resolvedUserId === trackedUserId ? profile?.username : "", "Guest");
          const resolvedAvatarUrl = String(p.avatarUrl ?? "").trim() || (resolvedUserId === trackedUserId ? profileAvatarUrl : "");
          const resolvedCameraPreviewUrl = String(p.cameraPreviewUrl ?? p.camera_preview_url ?? "").trim() || (resolvedUserId === trackedUserId ? profileCameraPreviewUrl : "");
          return {
            userId: resolvedUserId,
            username: resolvedUsername,
            avatarUrl: resolvedAvatarUrl || undefined,
            cameraPreviewUrl: resolvedCameraPreviewUrl || undefined,
            role: p.role === "host" ? "host" : "viewer",
            isLive: !!p.isLive,
            isSpeaking: !!p.isSpeaking,
            isMuted: !!p.isMuted,
          };
        });

        const ordered = [...list].sort((a, b) => {
          const aMe = a.userId === trackedUserId ? 1 : 0;
          const bMe = b.userId === trackedUserId ? 1 : 0;
          return bMe - aMe;
        });

        setParticipants(ordered);
      });

      channel.on("broadcast", { event: "participant:update" }, ({ payload }: { payload: Record<string, unknown> }) => {
        const participantId = String(payload?.participantId ?? "").trim();
        const changes = (payload?.changes ?? {}) as Record<string, unknown>;
        if (!participantId || !changes || typeof changes !== "object") return;

        setParticipantStateById((prev) => {
          const current = prev[participantId] ?? {
            isMuted: false,
            role: "listener" as ParticipantLocalState["role"],
            isRemoved: false,
          };
          const incomingRole = changes.role;
          const nextRoleCandidate = incomingRole === "host" || incomingRole === "speaker" || incomingRole === "listener"
            ? incomingRole
            : current.role;
          const nextRole = current.role === "host" ? "host" : nextRoleCandidate;
          const nextIsMuted = typeof changes.isMuted === "boolean"
            ? (nextRole === "host" ? current.isMuted : changes.isMuted)
            : current.isMuted;
          const nextIsRemoved = typeof changes.isRemoved === "boolean"
            ? (nextRole === "host" ? current.isRemoved : changes.isRemoved)
            : current.isRemoved;

          return {
            ...prev,
            [participantId]: {
              isMuted: nextIsMuted,
              role: nextRole,
              isRemoved: nextIsRemoved,
            },
          };
        });
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
          console.log("LIVE STAGE CHANNEL STATUS", { status });
          if (status !== "SUBSCRIBED") return;

          (async () => {
            try {
              await channel.track({
                userId: trackedUserId,
                username,
                avatarUrl: profileAvatarUrl || undefined,
                cameraPreviewUrl: profileCameraPreviewUrl || undefined,
                role: room && String(room.hostUserId) === String(userId) ? "host" : "viewer",
                isLive: true,
              });
            } catch (error) {
              console.log("LIVE STAGE TRACK ERROR", error);
            } finally {
              if (!cancelled) {
                console.log("LIVE STAGE SET LOADING FALSE", { reason: "subscribed" });
                setLoading(false);
              }
            }
          })().catch(() => {});
        });

        channelRef.current = channel;

        loadGuardTimeout = setTimeout(() => {
          if (cancelled) return;
          console.log("LIVE STAGE SET LOADING FALSE", { reason: "load-guard-timeout" });
          setLoading(false);
        }, 3000);
      } catch (error) {
        console.log("LIVE STAGE INIT ERROR", error);
        if (!cancelled) setLoading(false);
      }
    };

    init();

    return () => {
      cancelled = true;
      if (loadGuardTimeout) clearTimeout(loadGuardTimeout);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
      Object.values(joinPulseTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId));
      joinPulseTimeoutsRef.current = {};
    };
  }, [partyId, partyIdParam]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSessionSeconds((value) => value + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

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

  const displayParticipants = useMemo(() => {
    const merged = [...participants];
    const seen = new Set<string>();
    const unique = merged.filter((participant) => {
      if (!participant.userId || seen.has(participant.userId)) return false;
      seen.add(participant.userId);
      return true;
    });
    return unique.sort((a, b) => {
      const aMe = a.userId === myUserId ? 1 : 0;
      const bMe = b.userId === myUserId ? 1 : 0;
      if (aMe !== bMe) return bMe - aMe;
      const aHost = a.role === "host" ? 1 : 0;
      const bHost = b.role === "host" ? 1 : 0;
      return bHost - aHost;
    });
  }, [participants, myUserId]);

  const stripParticipants = useMemo(() => {
    if (displayParticipants.length > 0) {
      const prioritizeSpeaking = (list: StageParticipant[]) => list
        .map((participant, index) => ({
          participant,
          index,
          isSpeakingNow: !!(isSpeakingById[participant.userId] || participant.isSpeaking),
        }))
        .sort((a, b) => {
          if (a.isSpeakingNow !== b.isSpeakingNow) return Number(b.isSpeakingNow) - Number(a.isSpeakingNow);
          return a.index - b.index;
        })
        .map((item) => item.participant);

      return [
        ...prioritizeSpeaking(displayParticipants.filter((participant) => !!featuredParticipantById[participant.userId])),
        ...prioritizeSpeaking(displayParticipants.filter((participant) => !featuredParticipantById[participant.userId])),
      ];
    }

    const fallbackUserId = String(myUserId || "self").trim() || "self";
    return [
      {
        userId: fallbackUserId,
        username: resolveIdentityName(myUsername, "You"),
        avatarUrl: undefined,
        role: isHost ? "host" : "viewer",
        isLive: true,
        isSpeaking: false,
        isMuted: false,
      } as StageParticipant,
    ];
  }, [displayParticipants, featuredParticipantById, isSpeakingById, myUserId, myUsername, isHost]);
  const currentUserParticipantId = myUserId || stripParticipants[0]?.userId || "";

  useEffect(() => {
    const nextOrder = stripParticipants.map((participant) => participant.userId).join("|");
    if (!nextOrder) return;
    if (stripOrderRef.current && stripOrderRef.current !== nextOrder) {
      LayoutAnimation.configureNext({
        duration: 220,
        update: { type: LayoutAnimation.Types.easeOut },
      });
    }
    stripOrderRef.current = nextOrder;
  }, [stripParticipants]);

  useEffect(() => {
    if (displayParticipants.length === 0) {
      setActiveSpeakerUserId("");
      return;
    }
    if (!activeSpeakerUserId || !displayParticipants.some((p) => p.userId === activeSpeakerUserId)) {
      const host = displayParticipants.find((p) => p.role === "host");
      setActiveSpeakerUserId(host?.userId ?? displayParticipants[0]?.userId ?? "");
    }
  }, [displayParticipants, activeSpeakerUserId]);

  useEffect(() => {
    if (displayParticipants.length === 0) {
      setActiveParticipantId("");
      return;
    }
    if (!activeParticipantId || !displayParticipants.some((p) => p.userId === activeParticipantId)) {
      const host = displayParticipants.find((p) => p.role === "host");
      setActiveParticipantId(host?.userId ?? displayParticipants[0]?.userId ?? "");
    }
  }, [displayParticipants, activeParticipantId]);

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

  useEffect(() => {
    const currentIds = displayParticipants.map((participant) => participant.userId).filter(Boolean);
    const previousIds = seenParticipantIdsRef.current;
    const newIds = currentIds.filter((id) => !previousIds.includes(id));

    if (newIds.length > 0) {
      setRecentlyJoinedById((prev) => {
        const next = { ...prev };
        newIds.forEach((id) => {
          next[id] = true;
          if (joinPulseTimeoutsRef.current[id]) clearTimeout(joinPulseTimeoutsRef.current[id]);
          joinPulseTimeoutsRef.current[id] = setTimeout(() => {
            setRecentlyJoinedById((innerPrev) => {
              const innerNext = { ...innerPrev };
              delete innerNext[id];
              return innerNext;
            });
            delete joinPulseTimeoutsRef.current[id];
          }, 1400);
        });
        return next;
      });
    }

    seenParticipantIdsRef.current = currentIds;
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
    const dominantCandidate = stripParticipants.find((participant) => {
      const participantState = participantStateById[participant.userId];
      const isMuted = participantState?.isMuted ?? !!participant.isMuted;
      const role = participantState?.role ?? (participant.role === "host" ? "host" : participant.isSpeaking ? "speaker" : "listener");
      const isSpeakerRole = role === "speaker";
      const isSpeakingNow = !isMuted && !!(isSpeakingById[participant.userId] || (isSpeakerRole && (!!participant.isSpeaking || participant.userId === activeSpeakerUserId)));
      return isSpeakingNow;
    });
    const dominantIndex = dominantCandidate ? stripParticipants.findIndex((participant) => participant.userId === dominantCandidate.userId) : -1;
    const dominantBiasX = dominantIndex >= 0 && stripParticipants.length > 1
      ? ((dominantIndex / (stripParticipants.length - 1)) - 0.5) * 52
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
  }, [stripParticipants, participantStateById, isSpeakingById, activeSpeakerUserId]);

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

  const emitParticipantUpdate = useCallback((participantId: string, changes: Partial<ParticipantLocalState>) => {
    const channel = channelRef.current;
    if (!channel || !participantId) return;
    channel
      .send({ type: "broadcast", event: "participant:update", payload: { participantId, changes } })
      .catch(() => {});
  }, []);

  const emitParticipantSpeaking = useCallback((participantId: string, isSpeaking: boolean) => {
    const channel = channelRef.current;
    if (!channel || !participantId) return;
    channel
      .send({ type: "broadcast", event: "participant:speaking", payload: { participantId, isSpeaking } })
      .catch(() => {});
  }, []);

  useEffect(() => {
    console.log("MIC SETUP START");
    const currentUserId = String(myUserId || "").trim();

    let cancelled = false;

    const startMicMetering = async () => {
      try {
        const permission = await Audio.requestPermissionsAsync();
        console.log("LIVE STAGE MIC PERMISSION", { granted: permission.granted, status: permission.status, canAskAgain: permission.canAskAgain });
        if (!permission.granted || cancelled) return;

        await Audio.setAudioModeAsync({
          allowsRecordingIOS: true,
          playsInSilentModeIOS: true,
          shouldDuckAndroid: true,
          interruptionModeIOS: InterruptionModeIOS.DoNotMix,
          interruptionModeAndroid: InterruptionModeAndroid.DoNotMix,
        });

        console.log("LIVE STAGE MIC RECORDING CREATED");
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
        console.log("LIVE STAGE MIC PREPARE COMPLETE");
        console.log("LIVE STAGE MIC START ASYNC");
        await recording.startAsync();
        console.log("LIVE STAGE MIC RECORDING STARTED");
        recording.setProgressUpdateInterval(220);
        recording.setOnRecordingStatusUpdate((status) => {
          console.log("LIVE STAGE MIC METER", { isRecording: status.isRecording, metering: status.metering });
          if (!status.isRecording || cancelled) return;
          const metering = typeof status.metering === "number" ? status.metering : -160;
          setMicLevelDb(metering);
          if (!currentUserId) return;
          const speaking = metering > MIC_SPEAKING_THRESHOLD_DB;
          if (speaking) {
            if (micReleaseTimeoutRef.current) {
              clearTimeout(micReleaseTimeoutRef.current);
              micReleaseTimeoutRef.current = null;
            }
            if (micSpeakingRef.current) return;
            console.log("LIVE STAGE SPEAKING CHANGE", {
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
            console.log("LIVE STAGE SPEAKING CHANGE", {
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
  const activePulseScale = motion.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const activePulseOpacity = motion.interpolate({ inputRange: [0, 1], outputRange: [0.64, 1] });
  const chatFloat = motion.interpolate({ inputRange: [0, 1], outputRange: [0, -3] });
  const chatOpacity = motion.interpolate({ inputRange: [0, 1], outputRange: [0.78, 0.9] });
  const visibleMessages = stageMessages.slice(-5);
  const dominantStripSpeakerId = useMemo(() => {
    return computeDominantSpeakerId(
      stripParticipants,
      (participant) => participant.userId,
      (participant) => {
        const participantState = participantStateById[participant.userId];
        const isMuted = participantState?.isMuted ?? !!participant.isMuted;
        const role = participantState?.role ?? (participant.role === "host" ? "host" : participant.isSpeaking ? "speaker" : "listener");
        const isSpeakerRole = role === "speaker";
        return !isMuted && !!(isSpeakingById[participant.userId] || (isSpeakerRole && participant.isSpeaking) || participant.userId === activeSpeakerUserId);
      },
    );
  }, [stripParticipants, participantStateById, isSpeakingById, activeSpeakerUserId]);

  console.log("LIVE STAGE RENDER BRANCH", {
    loading,
    partyId,
    participants: participants.length,
    displayParticipants: displayParticipants.length,
  });

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

      <View style={[styles.screen, { paddingBottom: Math.max(18, safeAreaInsets.bottom + 92) }]}> 
        {myUserId ? (
          <View style={{ alignSelf: "flex-start", marginBottom: 8, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.55)" }}>
            <Text style={{ color: "#D9E3FF", fontSize: 11 }}>Meter: {micLevelDb.toFixed(1)} dB</Text>
            <Text style={{ color: "#D9E3FF", fontSize: 11 }}>Speaking: {String(!!isSpeakingById[myUserId])}</Text>
            <Text style={{ color: "#D9E3FF", fontSize: 11 }}>Threshold: {MIC_SPEAKING_THRESHOLD_DB} dB</Text>
          </View>
        ) : null}
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
            <Text style={[styles.modeBtnText, stageMode === "hybrid" && styles.modeBtnTextOn]}>Watch-Party Live</Text>
          </TouchableOpacity>
        </View>

        <Animated.View
          style={[
            styles.stageCanvas,
            stageMode === "hybrid" && styles.stageCanvasHybrid,
            { transform: [{ scale: stageScale }], opacity: stageOpacity },
          ]}
        >
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

        <View style={styles.overlayBottom} pointerEvents="box-none">
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
          rootStyle={styles.liveStageLowerDock}
          participantStrip={(
            <View style={styles.stageParticipantStripWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.stagePresenceScroll}
                contentContainerStyle={styles.stagePresenceScrollContent}
              >
                {stripParticipants.map((participant) => {
                  const isCurrentUser = participant.userId === currentUserParticipantId;
                  const participantState = participantStateById[participant.userId] ?? {
                    isMuted: !!participant.isMuted,
                    role: participant.role === "host" ? "host" : participant.isSpeaking ? "speaker" : "listener",
                    isRemoved: false,
                  };
                  const isHostBubble = participantState.role === "host";
                  const isActiveSpeaker = participant.userId === activeSpeakerUserId;
                  const isActiveParticipant = participant.userId === activeParticipantId;
                  const isLiveParticipant = participant.isLive;
                  const isMuted = participantState.isMuted;
                  const isSpeakerRole = participantState.role === "speaker";
                  const isSpeaking = !isMuted && (isSpeakingById[participant.userId] || (isSpeakerRole && (!!participant.isSpeaking || isActiveSpeaker)));
                  const isDominantSpeaker = !!dominantStripSpeakerId && participant.userId === dominantStripSpeakerId && isSpeaking;
                  const isRemoved = participantState.isRemoved;
                  const isRecentlyJoined = !!recentlyJoinedById[participant.userId];
                  const isFeatured = !!featuredParticipantById[participant.userId];
                  const presentation = participantPresentationById[participant.userId] ?? "compact";
                  const isExpanded = presentation === "expanded";
                  const hasSpeakingVisual = !isFeatured && !isMuted && isDominantSpeaker;
                  const shouldPulse = hasSpeakingVisual || isRecentlyJoined;
                  const canModerateParticipant = participantState.role !== "host";
                  const roleLabel = getParticipantRoleLabel(participantState);
                  const showLocalCameraPreview = Platform.OS !== "web" && isCurrentUser && !!cameraPermission?.granted;
                  const bubbleMediaUri = (isCurrentUser ? myCameraPreviewUrlRef.current : "") || participant.cameraPreviewUrl || participant.avatarUrl || "";

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
                        triggerBubbleTapPulse(participant.userId);
                        if (isHost) {
                          console.log("HOST TAP USER", participant.userId);
                        } else {
                          console.log("REQUEST MIC", participant.userId);
                        }
                        setActiveSpeakerUserId(participant.userId);
                        setActiveParticipantId(participant.userId);
                        setParticipantPresentationById((prev) => ({
                          ...prev,
                          [participant.userId]: (prev[participant.userId] ?? "compact") === "expanded" ? "compact" : "expanded",
                        }));
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
                      <View style={[styles.stagePresenceTapWrap, tapPulseById[participant.userId] && styles.stagePresenceTapWrapPulsed]}>
                        <Animated.View
                          style={[
                            styles.stagePresenceBubble,
                            isExpanded && styles.stagePresenceBubbleExpanded,
                            isFeatured && styles.stagePresenceBubbleFeatured,
                            isActiveParticipant && !isFeatured && styles.stagePresenceBubbleActive,
                            isHostBubble && styles.stagePresenceHost,
                            !isDominantSpeaker && styles.stagePresenceBubbleNonSpeaking,
                            hasSpeakingVisual && styles.stagePresenceSpeakerBoost,
                            hasSpeakingVisual && styles.stagePresenceSpeaker,
                            hasSpeakingVisual && styles.stagePresenceDominant,
                            shouldPulse && {
                              opacity: activePulseOpacity,
                              transform: [{ scale: activePulseScale }],
                            },
                          ]}
                        >
                        {shouldPulse ? (
                          <Animated.View
                            style={[
                              styles.stagePresenceActiveRing,
                              hasSpeakingVisual && styles.stagePresenceActiveRingSpeaking,
                              hasSpeakingVisual && styles.stagePresenceActiveRingDominant,
                              { opacity: activePulseOpacity },
                            ]}
                          />
                        ) : null}
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
                                style={[styles.stagePresenceCameraFill, isDominantSpeaker && styles.stagePresenceCameraDominant]}
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
                            {resolveIdentityName(participant.username, "Guest").slice(0, 1).toUpperCase()}
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
                          isActiveParticipant && !isFeatured && styles.stageParticipantNameActive,
                          isExpanded && styles.stageParticipantNameExpanded,
                          isFeatured && styles.stageParticipantNameFeatured,
                        ]}
                      >
                        {isCurrentUser ? "You" : participant.username}
                      </Text>
                      <Text
                        style={[
                          styles.stageParticipantRole,
                          isSpeaking && styles.stageParticipantRoleSpeaking,
                          isHostBubble && styles.stageParticipantRoleHost,
                        ]}
                      >
                        {isMuted ? `${roleLabel} · Muted` : roleLabel}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}
          leftAction={{
            id: "comments",
            icon: "🗨️",
            label: "Comments",
            activeOpacity: 0.82,
            onPress: () => setCommentsOpen((value) => !value),
          }}
          trailingActions={[
            {
              id: "react",
              icon: "✨",
              label: "React",
              activeOpacity: 0.82,
              onPress: () => setReactionPickerOpen((value) => !value),
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
    minHeight: 420,
    borderRadius: 16,
    backgroundColor: "rgba(6,6,8,0.14)",
    padding: 5,
    overflow: "hidden",
  },
  stageCanvasHybrid: {
    minHeight: 420,
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
    bottom: 62,
    gap: 7,
  },
  liveStageLowerDock: {
    marginTop: 4,
    marginBottom: 36,
  },
  stageParticipantStripWrap: {
    marginTop: 4,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(8,10,16,0.66)",
    paddingVertical: 9,
    paddingHorizontal: 11,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  stagePresenceScroll: { marginTop: 0, maxHeight: 160 },
  stagePresenceScrollContent: { flexDirection: "row", alignItems: "stretch", gap: 12, paddingRight: 10, paddingVertical: 2 },
  stageParticipantTile: {
    width: 76,
    minHeight: 86,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(13,16,24,0.78)",
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 9,
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
    borderColor: "rgba(180,208,255,0.9)",
    shadowColor: "rgba(126,171,255,0.8)",
    shadowOpacity: 0.32,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    transform: [{ scale: 1.02 }],
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
    borderColor: "rgba(184,212,255,0.98)",
    backgroundColor: "rgba(47,67,112,0.42)",
  },
  stagePresenceHost: {
    borderColor: "rgba(220,20,60,0.72)",
    backgroundColor: "rgba(220,20,60,0.24)",
  },
  stagePresenceSpeaker: {
    borderColor: "rgba(132,220,255,0.92)",
    backgroundColor: "rgba(104,149,255,0.36)",
  },
  stagePresenceSpeakerBoost: {
    transform: [{ translateY: -6 }, { scale: 1.2 }],
    shadowColor: "rgba(132,220,255,0.98)",
    shadowOpacity: 0.62,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
    zIndex: 12,
  },
  stagePresenceDominant: {
    transform: [{ translateY: -7 }, { scale: 1.24 }],
    shadowColor: "rgba(132,220,255,1)",
    shadowOpacity: 0.7,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    opacity: 1,
    zIndex: 14,
  },
  stagePresenceBubbleNonSpeaking: {
    transform: [{ scale: 0.9 }],
    opacity: 0.66,
    zIndex: 1,
  },
  stagePresenceTapWrap: {
    alignItems: "center",
    justifyContent: "center",
  },
  stagePresenceTapWrapPulsed: {
    transform: [{ scale: 1.05 }],
    opacity: 0.96,
  },
  stagePresenceActiveRing: {
    position: "absolute",
    top: -2,
    left: -2,
    right: -2,
    bottom: -2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(104,149,255,0.66)",
  },
  stagePresenceActiveRingSpeaking: {
    borderWidth: 3,
    borderColor: "rgba(132,220,255,0.98)",
  },
  stagePresenceActiveRingDominant: {
    borderWidth: 3.4,
    borderColor: "rgba(182,238,255,0.98)",
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
    backgroundColor: "#DC143C",
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
    color: "#EDF3FF",
    fontWeight: "800",
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
    color: "#DCEBFF",
    borderColor: "rgba(141,182,255,0.56)",
    backgroundColor: "rgba(78,117,194,0.34)",
  },
  stageParticipantRoleHost: {
    color: "#F8E6EB",
    borderColor: "rgba(220,20,60,0.56)",
    backgroundColor: "rgba(220,20,60,0.24)",
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
    maxHeight: 182,
    width: "100%",
  },
  chatDrawerTitle: { color: "#EFF3FC", fontSize: 11.5, fontWeight: "900", marginBottom: 6 },
  chatDrawerList: { maxHeight: 144 },
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
    transform: [{ scale: 1.08 }],
    shadowColor: "rgba(122,205,255,0.95)",
    shadowOpacity: 0.34,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    borderColor: "rgba(132,220,255,0.78)",
  },
  bottomLiveBubbleDominant: {
    transform: [{ scale: 1.13 }],
    shadowColor: "rgba(132,220,255,1)",
    shadowOpacity: 0.46,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    borderColor: "rgba(182,238,255,0.94)",
  },
  bottomLiveBubbleRing: {
    position: "absolute",
    top: -3,
    left: -3,
    right: -3,
    bottom: -3,
    borderRadius: 999,
    borderWidth: 1.6,
    borderColor: "rgba(132,220,255,0.72)",
  },
  bottomLiveBubbleRingDominant: {
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderWidth: 2,
    borderColor: "rgba(182,238,255,0.92)",
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
    marginTop: 6,
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
