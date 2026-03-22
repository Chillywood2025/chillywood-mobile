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
    fetchPartyMessages,
    getPartyRoom,
    getSafePartyUserId,
    sendPartyMessage,
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

const REACTIONS = ["🔥", "😂", "😮", "❤️", "👏", "💀"];

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
  const chatScrollRef = useRef<ScrollView>(null);

  // ── Host controls (broadcast-driven) ────────────────────────────────────────
  const [reactionsGloballyMuted, setReactionsGloballyMuted] = useState(false);
  const [roomLocked, setRoomLocked] = useState(false);

  // ── Refs ─────────────────────────────────────────────────────────────────────
  const lastRoomUpdatedAtRef = useRef<string>("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatChannelRef = useRef<RealtimeChannel | null>(null);
  const myUserIdRef = useRef<string | null>(null);
  const myRoleRef = useRef<"host" | "viewer" | null>(null);

  // ── Helper: append message ───────────────────────────────────────────────────
  const addMsg = useCallback((msg: LocalMsg) => {
    setMessages((prev) => [...prev.slice(-199), msg]);
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 60);
  }, []);

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
        addMsg({
          id: `react-${Date.now()}-${Math.random()}`,
          kind: "reaction",
          body: String(payload.emoji),
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
    [partyId, addMsg],
  );

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
      await chatChannelRef.current
        .send({ type: "broadcast", event: "reaction", payload: { emoji, userId: myUserIdRef.current, authorLabel } })
        .catch(() => {});
      addMsg({ id: `react-${Date.now()}`, kind: "reaction", body: emoji, authorLabel: "You", isMe: true, ts: Date.now() });
    },
    [reactionsGloballyMuted, addMsg],
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
  const isPlaying = room.playbackState === "playing";
  const chatCount = messages.filter((m) => m.kind === "chat").length;

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
              {isHost ? "Host" : "Viewer"}
            </Text>
          </View>
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
          <View style={styles.participantsCard}>
            <Text style={styles.participantsLabel}>
              <Text style={styles.viewerCount}>👥 {participants.length}</Text>
              {participants.length === 1 ? " person" : " people"} watching
              {participants.length >= 3 && <Text style={styles.trendingBadge}>  🔥 Trending</Text>}
            </Text>
            <View style={styles.chips}>
              {participants.slice(0, 7).map((p) => (
                <View key={p.userId} style={[styles.chip, p.role === "host" && styles.chipHost]}>
                  <Text style={styles.chipAvatar}>{getAvatarEmoji(p.avatarIndex ?? 0)}</Text>
                  <Text style={[styles.chipText, p.role === "host" && styles.chipTextHost]}>
                    {p.role === "host" ? "👑 " : ""}{p.displayName}
                  </Text>
                </View>
              ))}
              {participants.length > 7 && (
                <View style={styles.chip}>
                  <Text style={styles.chipText}>+{participants.length - 7}</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ── Watch CTA ──────────────────────────────────────────────── */}
        <TouchableOpacity style={styles.watchCTA} onPress={onWatchTogether} activeOpacity={0.88}>
          <Text style={styles.watchCTAText}>{isHost ? "▶  Open Player" : "⟳  Sync & Watch"}</Text>
        </TouchableOpacity>

        {/* ── Reaction bar ───────────────────────────────────────────── */}
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

        {/* ── Host controls ──────────────────────────────────────────── */}
        {isHost && (
          <View style={styles.hostSection}>
            <Text style={styles.hostSectionLabel}>HOST CONTROLS</Text>
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
  content: { paddingTop: 56, paddingBottom: 52, paddingHorizontal: 18, gap: 12 },
  loadingText: { color: "#888", marginTop: 14, fontSize: 14 },

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
  liveRow: { flexDirection: "row", alignItems: "center", gap: 6 },
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
  participantsCard: {
    backgroundColor: "rgba(18,18,18,0.96)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 12,
    gap: 8,
  },
  participantsLabel: { color: "#666", fontSize: 10, fontWeight: "700" },
  viewerCount: { color: "#F7D6DD", fontWeight: "900", fontSize: 11 },
  trendingBadge: { color: "#FF6B35", fontWeight: "800", fontSize: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 9,
    paddingVertical: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  chipHost: {
    borderColor: "rgba(220,20,60,0.3)",
    backgroundColor: "rgba(220,20,60,0.1)",
  },
  chipAvatar: { fontSize: 13, fontWeight: "600" },
  chipText: { color: "#bbb", fontSize: 11, fontWeight: "600" },
  chipTextHost: { color: "#F7D6DD" },

  // Watch CTA
  watchCTA: {
    backgroundColor: "#DC143C",
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: "center",
  },
  watchCTAText: { color: "#fff", fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },

  // Reactions
  reactionsRow: { flexDirection: "row", gap: 8, paddingVertical: 4 },
  reactionBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  reactionBtnMuted: { opacity: 0.3 },
  reactionEmoji: { fontSize: 22 },
  mutedNotice: { color: "#555", fontSize: 11, textAlign: "center", marginTop: -4 },

  // Host controls
  hostSection: {
    backgroundColor: "rgba(18,18,18,0.96)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    padding: 14,
    gap: 10,
  },
  hostSectionLabel: { color: "#555", fontSize: 9.5, fontWeight: "800", letterSpacing: 1 },
  hostBtnRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  hostBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  hostBtnOn: {
    borderColor: "rgba(220,20,60,0.4)",
    backgroundColor: "rgba(220,20,60,0.12)",
  },
  hostBtnText: { color: "#ccc", fontSize: 12, fontWeight: "700" },

  // Chat toggle
  chatToggle: { paddingVertical: 10 },
  chatToggleText: { color: "#888", fontSize: 13, fontWeight: "700" },
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
