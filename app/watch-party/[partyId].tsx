import type { RealtimeChannel } from "@supabase/supabase-js";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { reportDebugError, reportDebugParty, reportDebugQuery } from "../../_lib/devDebug";
import { supabase } from "../../_lib/supabase";
import { getAvatarEmoji, readUserProfile, saveLastPartySession, type UserProfile } from "../../_lib/userData";
import {
    emitSyncEvent,
    fetchPartyMessages,
    getPartyRoom,
    getSafePartyUserId,
    sendPartyMessage,
    updateRoomPlayback,
    type WatchPartyMessage,
    type WatchPartyState,
} from "../../_lib/watchParty";

type ConnState = "loading" | "connecting" | "live" | "reconnecting" | "error";

type LocalMsg = {
  id: string;
  kind: "chat" | "reaction" | "system";
  body: string;
  authorLabel: string;
  isMe: boolean;
  ts: number;
};

type PresenceParticipant = {
  userId: string;
  role: "host" | "viewer";
  displayName: string;
  avatarIndex?: number;
};

type ParticipantReaction = {
  emoji: string;
  ts: number;
};

const REACTIONS = ["👍", "😂", "🔥"];
const HOST_SEEK_STEP_MILLIS = 10_000;

const formatPartyTime = (millis: number) => {
  const totalSeconds = Math.max(0, Math.floor((millis || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

export default function WatchPartyRoomScreen() {
  const { partyId: partyIdParam, titleId: titleIdParam } = useLocalSearchParams<{
    partyId?: string;
    titleId?: string;
  }>();
  const router = useRouter();

  const partyId = (Array.isArray(partyIdParam) ? partyIdParam[0] : partyIdParam) ?? "";
  const titleIdHint = Array.isArray(titleIdParam) ? titleIdParam[0] : titleIdParam;

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
  const [chatVisible, setChatVisible] = useState(false);
  const [messages, setMessages] = useState<LocalMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [floatingReaction, setFloatingReaction] = useState<string | null>(null);
  const [participantReactions, setParticipantReactions] = useState<Record<string, ParticipantReaction>>({});
  const chatScrollRef = useRef<ScrollView>(null);

  // ── Host controls (broadcast-driven) ────────────────────────────────────────
  const [reactionsGloballyMuted, setReactionsGloballyMuted] = useState(false);
  const [roomLocked, setRoomLocked] = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const lastRoomUpdatedAtRef = useRef<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatChannelRef = useRef<RealtimeChannel | null>(null);
  const roomRealtimeChannelRef = useRef<RealtimeChannel | null>(null);
  const myUserIdRef = useRef<string | null>(null);
  const myRoleRef = useRef<"host" | "viewer" | null>(null);
  const floatingReactionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const participantReactionTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Helper: append message ───────────────────────────────────────────────────
  const addMsg = useCallback((msg: LocalMsg) => {
    setMessages((prev) => [...prev.slice(-199), msg]);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 60);
  }, []);

  const flashReaction = useCallback((emoji: string) => {
    if (floatingReactionTimeoutRef.current) {
      clearTimeout(floatingReactionTimeoutRef.current);
      floatingReactionTimeoutRef.current = null;
    }
    setFloatingReaction(emoji);
    floatingReactionTimeoutRef.current = setTimeout(() => {
      setFloatingReaction(null);
      floatingReactionTimeoutRef.current = null;
    }, 1100);
  }, []);

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

  const clampMillis = useCallback((value: number) => Math.max(0, Math.floor(value || 0)), []);

  // ── Bootstrap ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!partyId) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      try {
        // Load user profile for chat identity
        const profile = await readUserProfile();

        // Get session
        const userId = await getSafePartyUserId();
        if (cancelled) return;

        myUserIdRef.current = userId;

        // Load room
        const fetchedRoom = await getPartyRoom(partyId).catch(() => null);
        if (cancelled) return;

        if (!fetchedRoom) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        setRoom(fetchedRoom);
        lastRoomUpdatedAtRef.current = fetchedRoom.updatedAt;

        const role: "host" | "viewer" = userId === fetchedRoom.hostUserId ? "host" : "viewer";
        setMyRole(role);
        myRoleRef.current = role;

        // Fetch title name
        supabase
          .from("titles")
          .select("title")
          .eq("id", fetchedRoom.titleId)
          .maybeSingle()
          .then(
            ({ data }) => { if (data?.title && !cancelled) setTitleName(String(data.title)); },
            () => {},
          );

        // Try to load message history (graceful – table may not exist)
        const history = await fetchPartyMessages(partyId, 100).catch((): WatchPartyMessage[] => []);
        if (!cancelled && history.length > 0) {
          const loaded: LocalMsg[] = history.map((m) => ({
            id: m.id,
            kind: m.kind,
            body: m.body,
            authorLabel: m.userId === userId ? "You" : `User·${m.userId.slice(-4)}`,
            isMe: m.userId === userId,
            ts: new Date(m.createdAt).getTime(),
          }));
          setMessages(loaded);
        }

        setLoading(false);

        // Start room poll
        pollRef.current = setInterval(() => {
          getPartyRoom(partyId)
            .then((r) => {
              if (!r || cancelled) return;
              if (r.updatedAt <= lastRoomUpdatedAtRef.current) return;
              lastRoomUpdatedAtRef.current = r.updatedAt;
              setRoom(r);
            })
            .catch(() => {});
        }, 5000);

        // Save this as last joined party for auto-rejoin
        if (partyId && fetchedRoom) {
          await saveLastPartySession({ partyId, titleId: fetchedRoom.titleId, joinedAt: Date.now() }).catch(() => {});
        }

        // Start chat / presence channel
        startChatChannel(userId, role, fetchedRoom, profile);

        // Start realtime room sync (poll remains as fallback)
        startRoomRealtimeSync();
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
      if (chatChannelRef.current) {
        supabase.removeChannel(chatChannelRef.current);
        chatChannelRef.current = null;
      }
      if (roomRealtimeChannelRef.current) {
        supabase.removeChannel(roomRealtimeChannelRef.current);
        roomRealtimeChannelRef.current = null;
      }
      if (floatingReactionTimeoutRef.current) {
        clearTimeout(floatingReactionTimeoutRef.current);
        floatingReactionTimeoutRef.current = null;
      }
      Object.values(participantReactionTimeoutsRef.current).forEach((timeoutId) => clearTimeout(timeoutId));
      participantReactionTimeoutsRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId]);

  // ── Chat + Presence channel ──────────────────────────────────────────────────
  const startChatChannel = useCallback(
    (userId: string | null, role: "host" | "viewer", fetchedRoom: WatchPartyState, profile: UserProfile | null) => {
      if (chatChannelRef.current) supabase.removeChannel(chatChannelRef.current);
      setConnState("connecting");

      const channel = supabase.channel(`party-chat-${partyId}`, {
        config: { presence: { key: userId ?? "anon" } },
      });

      // Presence sync → participant list
      channel.on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ role: string; displayName: string; avatarIndex?: number }>();
        const list: PresenceParticipant[] = Object.entries(state).map(([key, presArr]) => {
          const p = Array.isArray(presArr) ? (presArr[0] as { role?: string; displayName?: string; avatarIndex?: number }) : {};
          return {
            userId: key,
            role: (p.role === "host" ? "host" : "viewer") as "host" | "viewer",
            displayName: p.displayName ?? `User·${key.slice(-4)}`,
            avatarIndex: p.avatarIndex,
          };
        });
        setParticipants(list);
      });

      // Presence join → system message
      channel.on("presence", { event: "join" }, ({ key, newPresences }: any) => {
        const newPres = Array.isArray(newPresences) ? newPresences[0] : newPresences;
        const displayName = newPres?.displayName ?? `User·${key.slice(-4)}`;
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
        const displayName = leftPres?.displayName ?? `User·${key.slice(-4)}`;
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
      channel.on("broadcast", { event: "message" }, ({ payload }: { payload: Record<string, unknown> }) => {
        if (!payload?.id) return;
        addMsg({
          id: String(payload.id),
          kind: payload.kind === "reaction" || payload.kind === "system" ? payload.kind as "reaction" | "system" : "chat",
          body: String(payload.body ?? ""),
          authorLabel: String(payload.authorLabel ?? "?"),
          isMe: payload.userId === myUserIdRef.current,
          ts: Number(payload.ts ?? Date.now()),
        });
      });

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

      // Host actions (mute reactions, lock room)
      channel.on("broadcast", { event: "host_action" }, ({ payload }: { payload: Record<string, unknown> }) => {
        if (payload?.action === "mute_reactions") setReactionsGloballyMuted(!!payload.enabled);
        if (payload?.action === "lock_room") setRoomLocked(!!payload.enabled);
      });

      // Subscribe → track presence once confirmed
      channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setConnState("live");
          await channel.track({
            role,
            displayName: userId
              ? role === "host"
                ? "Host"
                : `Viewer·${userId.slice(-4)}`
              : "Guest",
            avatarIndex: profile?.avatarIndex ?? 0,
          });
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnState("reconnecting");
        } else if (status === "CLOSED") {
          setConnState("error");
        }
      });

      chatChannelRef.current = channel;
    },
    [partyId, addMsg, attachReactionToParticipant, flashReaction],
  );

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
          event: "UPDATE",
          schema: "public",
          table: "watch_party_rooms",
          filter: `party_id=eq.${partyId}`,
        },
        (payload) => {
          const row = payload.new as {
            party_id?: string | null;
            host_user_id?: string | null;
            title_id?: string | null;
            playback_position_millis?: number | null;
            playback_state?: "playing" | "paused" | "buffering" | null;
            started_at?: string | null;
            updated_at?: string | null;
          };

          const normalizedPartyId = String(row.party_id ?? "").trim();
          const hostUserId = String(row.host_user_id ?? "").trim();
          const titleId = String(row.title_id ?? "").trim();
          if (!normalizedPartyId || !hostUserId || !titleId) return;

          const nextUpdatedAt = String(row.updated_at ?? "").trim();
          if (nextUpdatedAt && nextUpdatedAt <= lastRoomUpdatedAtRef.current) return;
          if (nextUpdatedAt) lastRoomUpdatedAtRef.current = nextUpdatedAt;

          setRoom({
            partyId: normalizedPartyId,
            roomCode: normalizedPartyId,
            titleId,
            hostUserId,
            playbackPositionMillis: Math.max(0, Number(row.playback_position_millis ?? 0)),
            playbackState: row.playback_state === "playing" ? "playing" : "paused",
            startedAt: String(row.started_at ?? new Date().toISOString()),
            updatedAt: nextUpdatedAt || new Date().toISOString(),
          });
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setConnState("reconnecting");
        }
      });

    roomRealtimeChannelRef.current = channel;
  }, [partyId]);

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

  // ── Send chat ────────────────────────────────────────────────────────────────
  const onSendMessage = useCallback(async () => {
    const text = draft.trim();
    if (!text || !chatChannelRef.current || !myUserIdRef.current || sending) return;

    setSending(true);
    setDraft("");

    const id = `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const authorLabel = myRoleRef.current === "host" ? "Host" : "You";
    const ts = Date.now();

    // Broadcast to all viewers
    await chatChannelRef.current
      .send({ type: "broadcast", event: "message", payload: { id, kind: "chat", body: text, userId: myUserIdRef.current, authorLabel, ts } })
      .catch(() => {});

    // Show in own view immediately
    addMsg({ id, kind: "chat", body: text, authorLabel, isMe: true, ts });

    // Best-effort DB persistence
    sendPartyMessage(partyId, myUserIdRef.current, "chat", text).catch(() => {});

    setSending(false);
  }, [draft, partyId, sending, addMsg]);

  // ── Send reaction ────────────────────────────────────────────────────────────
  const onSendReaction = useCallback(
    async (emoji: string) => {
      if (!chatChannelRef.current || !myUserIdRef.current || reactionsGloballyMuted) return;
      const authorLabel = myRoleRef.current === "host" ? "Host" : `User·${myUserIdRef.current.slice(-4)}`;
      flashReaction(emoji);
      attachReactionToParticipant(myUserIdRef.current, emoji);
      await chatChannelRef.current
        .send({ type: "broadcast", event: "reaction", payload: { emoji, userId: myUserIdRef.current, authorLabel } })
        .catch(() => {});
      addMsg({ id: `react-${Date.now()}`, kind: "reaction", body: emoji, authorLabel: "You", isMe: true, ts: Date.now() });
    },
    [reactionsGloballyMuted, addMsg, attachReactionToParticipant, flashReaction],
  );

  // ── Host: toggle mute reactions ──────────────────────────────────────────────
  const onToggleMuteReactions = useCallback(async () => {
    if (!chatChannelRef.current || myRoleRef.current !== "host") return;
    const next = !reactionsGloballyMuted;
    setReactionsGloballyMuted(next);
    await chatChannelRef.current
      .send({ type: "broadcast", event: "host_action", payload: { action: "mute_reactions", enabled: next } })
      .catch(() => {});
  }, [reactionsGloballyMuted]);

  // ── Host: toggle lock room ───────────────────────────────────────────────────
  const onToggleLockRoom = useCallback(async () => {
    if (!chatChannelRef.current || myRoleRef.current !== "host") return;
    const next = !roomLocked;
    setRoomLocked(next);
    await chatChannelRef.current
      .send({ type: "broadcast", event: "host_action", payload: { action: "lock_room", enabled: next } })
      .catch(() => {});
  }, [roomLocked]);

  // ── Share / invite ───────────────────────────────────────────────────────────
  const onShareCode = useCallback(() => {
    const roomCode = room?.roomCode ?? partyId;
    Share.share({
      message: `Join my Chillywood Watch Party!\n\nRoom code: ${roomCode}\n\nOpen Chillywood → Watch Party → enter the code to join.`,
      title: "Watch Party Invite",
    }).catch(() => {});
  }, [partyId, room?.roomCode]);

  // ── Watch together ───────────────────────────────────────────────────────────
  const onWatchTogether = useCallback(async () => {
    let targetTitleId = String(room?.titleId ?? "").trim();

    if (!targetTitleId && partyId) {
      const latestRoom = await getPartyRoom(partyId).catch(() => null);
      targetTitleId = String(latestRoom?.titleId ?? "").trim();
    }

    if (!targetTitleId) {
      targetTitleId = String(titleIdHint ?? "").trim();
    }

    if (!targetTitleId || !partyId) return;

    console.log("WATCH PARTY OPEN PLAYER: navigating with titleId", targetTitleId);
    router.push({ pathname: "/player/[id]", params: { id: targetTitleId, partyId } });
  }, [room?.titleId, titleIdHint, partyId, router]);

  const onHostTogglePlayPause = useCallback(async () => {
    if (myRoleRef.current !== "host" || !room || !partyId) return;

    const nextState = room.playbackState === "playing" ? "paused" : "playing";
    const nextPosition = clampMillis(room.playbackPositionMillis ?? 0);
    const nowIso = new Date().toISOString();

    setRoom((prev) =>
      prev
        ? {
            ...prev,
            playbackState: nextState,
            playbackPositionMillis: nextPosition,
            updatedAt: nowIso,
          }
        : prev,
    );

    await updateRoomPlayback(partyId, nextPosition, nextState).catch(() => {});
    if (myUserIdRef.current) {
      await emitSyncEvent(partyId, myUserIdRef.current, nextState === "playing" ? "play" : "pause", nextPosition).catch(() => {});
    }
  }, [clampMillis, partyId, room]);

  const onHostSeek = useCallback(
    async (deltaMillis: number) => {
      if (myRoleRef.current !== "host" || !room || !partyId) return;

      const nextPosition = clampMillis((room.playbackPositionMillis ?? 0) + deltaMillis);
      const nextState = room.playbackState === "playing" ? "playing" : "paused";
      const nowIso = new Date().toISOString();

      setRoom((prev) =>
        prev
          ? {
              ...prev,
              playbackPositionMillis: nextPosition,
              playbackState: nextState,
              updatedAt: nowIso,
            }
          : prev,
      );

      await updateRoomPlayback(partyId, nextPosition, nextState).catch(() => {});
      if (myUserIdRef.current) {
        await emitSyncEvent(partyId, myUserIdRef.current, "seek", nextPosition).catch(() => {});
      }
    },
    [clampMillis, partyId, room],
  );

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
  const getParticipantStatus = useCallback(
    (participant: PresenceParticipant): "watching" | "paused" | "syncing" => {
      if (connState === "connecting" || connState === "reconnecting") return "syncing";
      if (participant.role === "host") return isPlaying ? "watching" : "paused";
      return isPlaying ? "watching" : "paused";
    },
    [connState, isPlaying],
  );

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#DC143C" />
        <Text style={styles.loadingText}>Joining room…</Text>
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
  const chatCount = messages.filter((m) => m.kind === "chat").length;
  const isSyncUnstable = connState === "reconnecting" || connState === "connecting";
  const isWaitingForHost = !isHost && !participants.some((p) => p.role === "host");
  const roleStatusTitle = isHost ? "Host Controls Active" : "Guest Synced to Host";
  const roleStatusBody = isHost
    ? `You control room playback · ${isPlaying ? "Playing" : "Paused"} at ${formatPartyTime(room.positionMillis ?? 0)}`
    : isWaitingForHost
      ? "Waiting for host…"
      : isSyncUnstable
        ? `Resyncing with host · ${isPlaying ? "Playing" : "Paused"}`
        : `Following host playback · ${isPlaying ? "Playing" : "Paused"} at ${formatPartyTime(room.positionMillis ?? 0)}`;

  // ── Room UI ──────────────────────────────────────────────────────────────────
  return (
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
          <Text style={styles.kicker}>CHILLYWOOD · WATCH PARTY</Text>
          {/* Connection badge */}
          <View style={[styles.connBadge, { borderColor: connColor[connState] + "44" }]}>
            <View style={[styles.connDot, { backgroundColor: connColor[connState] }]} />
            <Text style={[styles.connLabel, { color: connColor[connState] }]}>{connLabel[connState]}</Text>
          </View>
        </View>

        {/* ── Live indicator + role ───────────────────────────────────── */}
        <View style={styles.liveRow}>
          <View style={[styles.liveDot, { backgroundColor: isPlaying ? "#2ecc40" : "#b58900" }]} />
          <Text style={[styles.liveText, { color: isPlaying ? "#2ecc40" : "#b58900" }]}>
            {isPlaying ? "Playing" : "Paused"}
          </Text>
          <View style={{ flex: 1 }} />
          <View style={[styles.rolePill, isHost && styles.rolePillHost]}>
            <Text style={[styles.rolePillText, isHost && styles.rolePillTextHost]}>
              {isHost ? "Host" : "Guest"}
            </Text>
          </View>
        </View>

        <View style={styles.syncStatusCard}>
          <Text style={styles.syncStatusTitle}>{roleStatusTitle}</Text>
          <Text style={styles.syncStatusBody}>{roleStatusBody}</Text>
          {!isHost ? <Text style={styles.syncedBadge}>Synced to Host</Text> : null}
        </View>

        {/* ── Title card ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>NOW WATCHING</Text>
          <Text style={styles.cardTitle} numberOfLines={2}>
            {titleName ?? room.titleId}
          </Text>
        </View>

        {/* ── Invite card ────────────────────────────────────────────── */}
        <View style={styles.inviteCard}>
          <View style={styles.inviteLeft}>
            <Text style={styles.inviteLabel}>ROOM CODE</Text>
            <Text style={styles.inviteCode} selectable>{room.roomCode}</Text>
          </View>
          <TouchableOpacity style={styles.shareBtn} onPress={onShareCode} activeOpacity={0.8}>
            <Text style={styles.shareBtnText}>Share invite ↗</Text>
          </TouchableOpacity>
        </View>

        {/* ── Participant list ────────────────────────────────────────── */}
        {participants.length > 0 && (
          <View style={styles.participantsWrap}>
            <Text style={styles.sectionKicker}>PRESENCE</Text>
            <View style={styles.participantsCard}>
            <Text style={styles.participantsLabel}>
              <Text style={styles.viewerCount}>👥 {participants.length}</Text>
              {participants.length === 1 ? " person" : " people"} watching
              {participants.length >= 3 && <Text style={styles.trendingBadge}>  🔥 Trending</Text>}
            </Text>
            <View style={styles.chips}>
              {participants.slice(0, 7).map((p) => (
                <View key={p.userId} style={[styles.chip, p.role === "host" && styles.chipHost]}>
                  <View style={styles.avatarCircle}>
                    <Text style={styles.chipAvatar}>{getAvatarEmoji(p.avatarIndex ?? 0)}</Text>
                    {participantReactions[p.userId] ? (
                      <View style={styles.participantReactionBadge}>
                        <Text style={styles.participantReactionText}>{participantReactions[p.userId].emoji}</Text>
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.participantMeta}>
                    <Text style={[styles.chipText, p.role === "host" && styles.chipTextHost]} numberOfLines={1}>
                      {p.role === "host" ? "👑 " : ""}{p.displayName}
                    </Text>
                    <Text
                      style={[
                        styles.participantStatus,
                        getParticipantStatus(p) === "watching" && styles.participantStatusWatching,
                        getParticipantStatus(p) === "paused" && styles.participantStatusPaused,
                        getParticipantStatus(p) === "syncing" && styles.participantStatusSyncing,
                      ]}
                    >
                      {getParticipantStatus(p)}
                    </Text>
                  </View>
                </View>
              ))}
              {participants.length > 7 && (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>+{participants.length - 7}</Text>
                </View>
              )}
            </View>
            </View>
          </View>
        )}

        {/* ── Watch CTA ──────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.watchCTA} onPress={onWatchTogether} activeOpacity={0.88}>
          <Text style={styles.watchCTAText}>{isHost ? "▶  Open Player" : "⟳  Sync & Watch"}</Text>
        </TouchableOpacity>

        {/* ── Reaction bar ───────────────────────────────────────────── */}
        <View style={styles.interactionWrap}>
          <Text style={styles.sectionKicker}>REACTIONS & CHAT</Text>
          <View style={styles.reactionsPanel}>
            <View style={styles.reactionsRow}>
              {REACTIONS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={[styles.reactionBtn, reactionsGloballyMuted && styles.reactionBtnMuted]}
                  onPress={() => onSendReaction(emoji)}
                  disabled={reactionsGloballyMuted}
                  activeOpacity={0.72}
                >
                  <Text style={styles.reactionEmoji}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {reactionsGloballyMuted && (
              <Text style={styles.mutedNotice}>Reactions muted by host</Text>
            )}
          </View>
        </View>
        {floatingReaction ? (
          <View pointerEvents="none" style={styles.reactionOverlay}>
            <Text style={styles.reactionOverlayEmoji}>{floatingReaction}</Text>
          </View>
        ) : null}

        {/* ── Host controls ──────────────────────────────────────────── */}
        {isHost && (
          <View style={styles.hostWrap}>
            <Text style={styles.sectionKicker}>CONTROLS</Text>
            <View style={styles.hostSection}>
            <Text style={styles.hostSectionLabel}>HOST CONTROLS</Text>
            <View style={styles.hostPlaybackRow}>
              <TouchableOpacity style={styles.hostPlaybackBtn} onPress={() => onHostSeek(-HOST_SEEK_STEP_MILLIS)} activeOpacity={0.8}>
                <Text style={styles.hostPlaybackBtnText}>-10s</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.hostPlaybackBtn, styles.hostPlaybackBtnPrimary]} onPress={onHostTogglePlayPause} activeOpacity={0.8}>
                <Text style={[styles.hostPlaybackBtnText, styles.hostPlaybackBtnTextPrimary]}>{isPlaying ? "Pause" : "Play"}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.hostPlaybackBtn} onPress={() => onHostSeek(HOST_SEEK_STEP_MILLIS)} activeOpacity={0.8}>
                <Text style={styles.hostPlaybackBtnText}>+10s</Text>
              </TouchableOpacity>
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
            </View>
            </View>
          </View>
        )}

        {/* ── Chat toggle ────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.chatToggle} onPress={() => setChatVisible((v) => !v)} activeOpacity={0.8}>
          <Text style={styles.chatToggleText}>
            {chatVisible ? "▾  Hide chat" : "▸  Party chat"}
            {chatCount > 0 && <Text style={styles.chatCount}>  ({chatCount})</Text>}
          </Text>
        </TouchableOpacity>

        {/* ── Chat section ───────────────────────────────────────────── */}
        {chatVisible && (
          <View style={styles.chatSection}>
            <ScrollView
              ref={chatScrollRef}
              style={styles.chatScroll}
              contentContainerStyle={styles.chatScrollContent}
            >
              {messages.length === 0 ? (
                <Text style={styles.chatEmpty}>No messages yet — say hi! 👋</Text>
              ) : (
                messages.map((msg) =>
                  msg.kind === "reaction" ? (
                    <View key={msg.id} style={styles.reactionLine}>
                      <Text style={styles.reactionLineEmoji}>{msg.body}</Text>
                      <Text style={styles.reactionLineAuthor}>{msg.authorLabel}</Text>
                    </View>
                  ) : msg.kind === "system" ? (
                    <Text key={msg.id} style={styles.systemMsg}>{msg.body}</Text>
                  ) : (
                    <View key={msg.id} style={[styles.msgRow, msg.isMe && styles.msgRowMe]}>
                      <View style={[styles.msgBubble, msg.isMe && styles.msgBubbleMe]}>
                        {!msg.isMe && <Text style={styles.msgAuthor}>{msg.authorLabel}</Text>}
                        <Text style={[styles.msgText, msg.isMe && styles.msgTextMe]}>{msg.body}</Text>
                      </View>
                    </View>
                  )
                )
              )}
            </ScrollView>

            <View style={styles.chatInputRow}>
              <TextInput
                style={styles.chatInput}
                placeholder="Say something…"
                placeholderTextColor="#555"
                value={draft}
                onChangeText={setDraft}
                onSubmitEditing={onSendMessage}
                returnKeyType="send"
                editable={!sending}
                maxLength={300}
              />
              <TouchableOpacity
                style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
                onPress={onSendMessage}
                disabled={!draft.trim() || sending}
                activeOpacity={0.8}
              >
                <Text style={styles.sendBtnText}>↑</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#050505" },
  center: { flex: 1, backgroundColor: "#050505", alignItems: "center", justifyContent: "center" },
  scroll: { flex: 1, width: "100%" },
  content: { paddingTop: 56, paddingBottom: 56, paddingHorizontal: 18, gap: 14 },
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

  // Participants
  participantsWrap: { gap: 0 },
  participantsCard: {
    backgroundColor: "rgba(16,16,16,0.97)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    padding: 14,
    gap: 10,
  },
  participantsLabel: { color: "#7A7A7A", fontSize: 10.5, fontWeight: "700" },
  viewerCount: { color: "#F7D6DD", fontWeight: "900", fontSize: 11 },
  trendingBadge: { color: "#FF6B35", fontWeight: "800", fontSize: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
  watchCTAText: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },

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
    alignSelf: "center",
    marginTop: 4,
    backgroundColor: "rgba(0,0,0,0.42)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  reactionOverlayEmoji: { fontSize: 24, fontWeight: "800" },
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
