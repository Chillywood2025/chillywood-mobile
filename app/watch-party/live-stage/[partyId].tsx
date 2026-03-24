import type { RealtimeChannel } from "@supabase/supabase-js";
import { useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Image,
    ImageBackground,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    type ImageSourcePropType,
} from "react-native";
import { titles as localTitles } from "../../../_data/titles";
import { supabase } from "../../../_lib/supabase";
import { readUserProfile } from "../../../_lib/userData";
import { getPartyRoom, getSafePartyUserId } from "../../../_lib/watchParty";

type StageParticipant = {
  userId: string;
  username: string;
  avatarUrl?: string;
  role: "host" | "viewer";
  isLive: boolean;
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
const TECHNICAL_NAME_PATTERN = /^(user[·\-\s]|viewer[·\-\s]|anon[\-\s])/i;
const UUID_LIKE_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const resolveIdentityName = (...candidates: unknown[]) => {
  for (const candidate of candidates) {
    const value = String(candidate ?? "").trim();
    if (!value) continue;
    if (UUID_LIKE_PATTERN.test(value)) continue;
    if (TECHNICAL_NAME_PATTERN.test(value)) continue;
    return value;
  }
  return "Guest";
};

export default function WatchPartyLiveStageScreen() {
  const { partyId: partyIdParam } = useLocalSearchParams<{ partyId?: string }>();
  const partyId = (Array.isArray(partyIdParam) ? partyIdParam[0] : partyIdParam) ?? "";

  const [loading, setLoading] = useState(true);
  const [participants, setParticipants] = useState<StageParticipant[]>([]);
  const [myUserId, setMyUserId] = useState<string>("");
  const [myUsername, setMyUsername] = useState<string>("You");
  const [isHost, setIsHost] = useState(false);
  const [stageMode, setStageMode] = useState<"live" | "hybrid">("live");
  const [selfTileMinimized, setSelfTileMinimized] = useState(true);
  const [chatOverlayOpen, setChatOverlayOpen] = useState(true);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [stageMessages, setStageMessages] = useState<StageChatMessage[]>([]);
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([]);
  const [isSelfDragPressed, setIsSelfDragPressed] = useState(false);
  const [activeSpeakerUserId, setActiveSpeakerUserId] = useState<string>("");
  const [featuredParticipantById, setFeaturedParticipantById] = useState<Record<string, boolean>>({});
  const [participantPresentationById, setParticipantPresentationById] = useState<Record<string, "compact" | "expanded">>({});

  const channelRef = useRef<RealtimeChannel | null>(null);
  const motion = useRef(new Animated.Value(0)).current;
  const reactionTapPulse = useRef(new Animated.Value(0)).current;
  const reactionCounterRef = useRef(0);
  const chatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      console.log("LIVE STAGE ROUTE PARAMS", { partyIdParam, partyId });
      console.log("LIVE STAGE ASYNC START", { partyId });

      if (!partyId) {
        console.log("LIVE STAGE MISSING PARTY ID");
        console.log("LIVE STAGE SET LOADING FALSE", { reason: "missing-party-id" });
        setLoading(false);
        return;
      }

      const userId = await getSafePartyUserId().catch(() => "");
      const profile = await readUserProfile().catch(() => null);
      let profileAvatarUrl = "";
      try {
        const authUser = await supabase.auth.getUser();
        const metadata = authUser.data.user?.user_metadata as Record<string, unknown> | undefined;
        profileAvatarUrl = String(metadata?.avatar_url ?? metadata?.picture ?? "").trim();
      } catch {
        profileAvatarUrl = "";
      }
      const username = resolveIdentityName(profile?.username, "Guest");
      const room = await getPartyRoom(partyId).catch(() => null);

      console.log("LIVE STAGE ASYNC COMPLETE", {
        userId,
        username,
        roomFound: !!room,
      });

      if (cancelled) return;

      setMyUserId(userId);
      setMyUsername(username || "You");
      setIsHost(!!room && String(room.hostUserId) === String(userId));

      const channel = supabase.channel(`room-${partyId}`, {
        config: { presence: { key: userId || "anon" } },
      });

      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ userId?: string; username?: string; avatarUrl?: string; role?: string; isLive?: boolean }>();
        const list: StageParticipant[] = Object.entries(state).map(([key, presences]) => {
          const p = Array.isArray(presences) ? (presences[0] as { userId?: string; username?: string; avatarUrl?: string; role?: string; isLive?: boolean }) : {};
          const resolvedUserId = String(p.userId ?? key).trim();
          const resolvedUsername = resolveIdentityName(
            p.username,
            resolvedUserId === userId ? profile?.username : "",
            "Guest",
          );
          const resolvedAvatarUrl = String(p.avatarUrl ?? "").trim() || (resolvedUserId === userId ? profileAvatarUrl : "");
          return {
            userId: resolvedUserId,
            username: resolvedUsername,
            avatarUrl: resolvedAvatarUrl || undefined,
            role: p.role === "host" ? "host" : "viewer",
            isLive: !!p.isLive,
          };
        });

        const ordered = [...list].sort((a, b) => {
          const aMe = a.userId === userId ? 1 : 0;
          const bMe = b.userId === userId ? 1 : 0;
          return bMe - aMe;
        });

        setParticipants(ordered);
      });

      channel.subscribe(async (status) => {
        console.log("LIVE STAGE CHANNEL STATUS", { status });
        if (status !== "SUBSCRIBED") return;
        await channel.track({
          userId,
          username,
          avatarUrl: profileAvatarUrl || undefined,
          role: room && String(room.hostUserId) === String(userId) ? "host" : "viewer",
          isLive: true,
        });
        if (!cancelled) {
          console.log("LIVE STAGE SET LOADING FALSE", { reason: "subscribed" });
          setLoading(false);
        }
      });

      channelRef.current = channel;

      loadGuardTimeout = setTimeout(() => {
        if (cancelled) return;
        console.log("LIVE STAGE SET LOADING FALSE", { reason: "load-guard-timeout" });
        setLoading(false);
      }, 3000);
    };

    init();

    return () => {
      cancelled = true;
      if (loadGuardTimeout) clearTimeout(loadGuardTimeout);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
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
      return [
        ...displayParticipants.filter((participant) => !!featuredParticipantById[participant.userId]),
        ...displayParticipants.filter((participant) => !featuredParticipantById[participant.userId]),
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
      } as StageParticipant,
    ];
  }, [displayParticipants, featuredParticipantById, myUserId, myUsername, isHost]);

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
    const id = `reaction-${Date.now()}-${reactionCounterRef.current++}`;
    const drift = Math.floor(Math.random() * 90) - 45;
    const rise = new Animated.Value(0);
    const opacity = new Animated.Value(1);
    const scale = new Animated.Value(0.85);

    const entry: FloatingReaction = { id, emoji, drift, rise, opacity, scale };
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

  const isLive = true;
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

      <View style={styles.screen}>
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
          {selfTileMinimized ? (
            <TouchableOpacity
              style={[styles.selfMiniBubble, isSelfDragPressed && styles.selfMiniBubblePressed]}
              activeOpacity={0.84}
              onPressIn={() => setIsSelfDragPressed(true)}
              onPressOut={() => setIsSelfDragPressed(false)}
              onPress={() => setSelfTileMinimized(false)}
            >
              <View style={styles.selfMiniAvatar}>
                {displayParticipants.find((participant) => participant.userId === myUserId)?.avatarUrl ? (
                  <Image
                    source={{ uri: String(displayParticipants.find((participant) => participant.userId === myUserId)?.avatarUrl ?? "") }}
                    style={styles.selfMiniAvatarImage}
                  />
                ) : (
                  <Text style={styles.selfMiniAvatarText}>{(resolveIdentityName(myUsername, "Guest") || "G").slice(0, 1).toUpperCase()}</Text>
                )}
                {isLive ? <View style={styles.selfMiniLiveDot} /> : null}
              </View>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.selfFloatingTile, isSelfDragPressed && styles.selfFloatingTilePressed]}
              activeOpacity={1}
              onPressIn={() => setIsSelfDragPressed(true)}
              onPressOut={() => setIsSelfDragPressed(false)}
            >
              <View style={styles.selfFloatingHeader}>
                <Text style={styles.selfFloatingLabel}>You</Text>
                {isLive ? (
                  <View style={styles.selfLiveBadge}>
                    <Text style={styles.selfLiveBadgeText}>LIVE</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelfTileMinimized(true)}
                >
                  <Text style={styles.selfFloatingToggle}>⇲</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.selfFloatingBody}>
                <View style={styles.selfAvatar}>
                  {displayParticipants.find((participant) => participant.userId === myUserId)?.avatarUrl ? (
                    <Image
                      source={{ uri: String(displayParticipants.find((participant) => participant.userId === myUserId)?.avatarUrl ?? "") }}
                      style={styles.selfAvatarImage}
                    />
                  ) : (
                    <Text style={styles.selfAvatarText}>{(resolveIdentityName(myUsername, "Guest") || "G").slice(0, 1).toUpperCase()}</Text>
                  )}
                </View>
                 <Text style={styles.selfSub}>{isHost ? "You • Host" : resolveIdentityName(myUsername, "Guest")}</Text>
              </View>
            </TouchableOpacity>
          )}

          <View pointerEvents="none" style={styles.floatingReactionsLayer}>
            {floatingReactions.map((reaction) => (
              <Animated.Text
                key={reaction.id}
                style={[
                  styles.floatingReactionEmoji,
                  {
                    opacity: reaction.opacity,
                    transform: [{ translateY: reaction.rise }, { translateX: reaction.drift }, { scale: reaction.scale }],
                  },
                ]}
              >
                {reaction.emoji}
              </Animated.Text>
            ))}
          </View>
        </Animated.View>

        <View style={styles.overlayBottom}>
          {chatOverlayOpen ? (
            <Animated.View style={[styles.chatOverlay, { opacity: chatOpacity, transform: [{ translateY: chatFloat }] }]}>
              <View style={styles.chatFloatStack}>
                {visibleMessages.length === 0 ? <Text style={styles.chatOverlayLine}>Waiting…</Text> : null}
                {visibleMessages.map((msg, index) => {
                  const isMe = msg.userId === myUserId;
                  const distance = visibleMessages.length - 1 - index;
                  const fade = Math.max(0.35, 1 - distance * 0.16);
                  return (
                    <Animated.View
                      key={msg.id}
                      style={[
                        styles.chatFloatLine,
                        {
                          opacity: fade,
                          transform: [{ translateY: -distance * 5 }],
                        },
                      ]}
                    >
                      <Text style={styles.chatOverlayLine}>
                        <Text style={[styles.chatUsername, isMe && styles.chatUsernameMe]}>{isMe ? "You" : msg.username}</Text>
                        <Text style={styles.chatMessageText}>  {msg.text}</Text>
                      </Text>
                    </Animated.View>
                  );
                })}
              </View>
            </Animated.View>
          ) : null}
        </View>

        <View style={styles.stageParticipantStripWrap}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.stagePresenceScroll}
            contentContainerStyle={styles.stagePresenceScrollContent}
          >
            {stripParticipants.map((participant) => {
              const isHostBubble = participant.role === "host";
              const isActiveSpeaker = participant.userId === activeSpeakerUserId;
              const isLiveParticipant = participant.isLive;
              const isFeatured = !!featuredParticipantById[participant.userId];
              const presentation = participantPresentationById[participant.userId] ?? "compact";
              const isExpanded = presentation === "expanded";
              const shouldPulse = isHostBubble || isActiveSpeaker || isLiveParticipant;

              return (
                <TouchableOpacity
                  key={`presence-${participant.userId}`}
                  activeOpacity={0.84}
                  style={[
                    styles.stageParticipantTile,
                    isExpanded && styles.stageParticipantTileExpanded,
                    isFeatured && styles.stageParticipantTileFeatured,
                  ]}
                  onPress={() => {
                    setActiveSpeakerUserId(participant.userId);
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
                  <Animated.View
                    style={[
                      styles.stagePresenceBubble,
                      isExpanded && styles.stagePresenceBubbleExpanded,
                      isFeatured && styles.stagePresenceBubbleFeatured,
                      isHostBubble && styles.stagePresenceHost,
                      isActiveSpeaker && styles.stagePresenceSpeaker,
                      shouldPulse && {
                        opacity: activePulseOpacity,
                        transform: [{ scale: activePulseScale }],
                      },
                    ]}
                  >
                    {shouldPulse ? <Animated.View style={[styles.stagePresenceActiveRing, { opacity: activePulseOpacity }]} /> : null}
                    {isHostBubble ? <View style={styles.stagePresenceHostDot} /> : null}
                    {participant.avatarUrl ? (
                      <Image source={{ uri: participant.avatarUrl }} style={styles.stagePresenceImage} />
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
                  </Animated.View>
                  {(isExpanded || isFeatured) ? (
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.stageParticipantName,
                        isExpanded && styles.stageParticipantNameExpanded,
                        isFeatured && styles.stageParticipantNameFeatured,
                      ]}
                    >
                      {participant.username}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.footerControls}>
          <TouchableOpacity style={styles.footerIconBtn} activeOpacity={0.82} onPress={() => setChatOverlayOpen((value) => !value)}>
            <Text style={styles.footerIconBtnText}>💬</Text>
            <Text style={styles.footerIconBtnLabel}>Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.footerIconBtn} activeOpacity={0.82} onPress={() => triggerReactionBurst("❤️")}>
            <Text style={styles.footerIconBtnText}>✨</Text>
            <Text style={styles.footerIconBtnLabel}>React</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.footerIconBtn} activeOpacity={0.82}>
            <Text style={styles.footerIconBtnText}>↗</Text>
            <Text style={styles.footerIconBtnLabel}>Share</Text>
          </TouchableOpacity>
        </View>
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
    minHeight: 472,
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
  stageParticipantStripWrap: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.28)",
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  stagePresenceScroll: { marginTop: 1, maxHeight: 130 },
  stagePresenceScrollContent: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingRight: 10 },
  stageParticipantTile: {
    width: 52,
    minHeight: 52,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  stageParticipantTileExpanded: {
    width: 108,
    minHeight: 84,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  stageParticipantTileFeatured: {
    width: 132,
    minHeight: 106,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  stagePresenceBubble: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(0,0,0,0.58)",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "visible",
  },
  stagePresenceBubbleExpanded: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  stagePresenceBubbleFeatured: {
    width: 66,
    height: 66,
    borderRadius: 33,
    marginHorizontal: 2,
  },
  stagePresenceHost: {
    borderColor: "rgba(220,20,60,0.72)",
    backgroundColor: "rgba(220,20,60,0.24)",
  },
  stagePresenceSpeaker: {
    borderColor: "rgba(104,149,255,0.84)",
    backgroundColor: "rgba(104,149,255,0.28)",
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
  stagePresenceInitialExpanded: { fontSize: 17 },
  stagePresenceInitialFeatured: { fontSize: 20 },
  stagePresenceImage: { width: "100%", height: "100%", borderRadius: 999 },
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
  stageParticipantName: {
    marginTop: 6,
    color: "#D7DBE4",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
    maxWidth: "100%",
  },
  stageParticipantNameExpanded: {
    fontSize: 12,
  },
  stageParticipantNameFeatured: {
    fontSize: 13,
    color: "#EEF2FA",
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
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.16)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    gap: 4,
    maxHeight: 130,
    width: "68%",
  },
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
  footerIconBtnText: { color: "#F1F1F1", fontSize: 15, fontWeight: "900" },
  footerIconBtnLabel: { color: "#D4D4D4", fontSize: 9.5, fontWeight: "800" },
});
