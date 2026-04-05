import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  View,
} from "react-native";
import { useFeatureFlag } from "posthog-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { trackEvent } from "../../_lib/analytics";
import {
  clearEndedChatThreadCall,
  getChatThread,
  listChatMessages,
  markChatThreadRead,
  sendChatMessage,
  startChatThreadCall,
  subscribeToThread,
  type ChatCallType,
  type ChatMessage,
  type ChatThreadMember,
  type ChatThreadSummary,
} from "../../_lib/chat";
import { reportRuntimeError } from "../../_lib/logger";
import { getPostHogConfig, isPostHogFlagEnabled, posthogFeatureFlags } from "../../_lib/posthog";
import { useSession } from "../../_lib/session";
import { InRoomCommunicationPanel } from "../../components/communication/in-room-communication-panel";
import { useCommunicationRoomSession } from "../../hooks/use-communication-room-session";

const buildAuthor = (members: ChatThreadMember[], senderUserId: string) => {
  return members.find((member) => member.userId === senderUserId)?.displayName ?? "User";
};

const formatStamp = (value: string) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

const getThreadStatusLabel = (thread: ChatThreadSummary | null) => {
  if (thread?.activeCommunicationRoomId && thread.activeCallType) {
    return thread.activeCallType === "video" ? "Video call live" : "Voice call live";
  }
  if ((thread?.currentMember?.unreadCount ?? 0) > 0) {
    return "Unread activity";
  }
  return "Direct thread";
};

const buildSmartReplySuggestions = ({
  activeCallType,
  lastIncomingMessage,
  otherMemberName,
}: {
  activeCallType?: ChatCallType;
  lastIncomingMessage?: string;
  otherMemberName?: string;
}) => {
  const firstName = String(otherMemberName ?? "").trim().split(/\s+/).filter(Boolean)[0] ?? "there";
  const normalizedMessage = String(lastIncomingMessage ?? "").trim().toLowerCase();

  if (activeCallType) {
    return activeCallType === "video"
      ? ["Joining the video now", "Give me 2 min", "Let's keep the camera on"]
      : ["Joining the call now", "Mic is ready", "Give me 2 min"];
  }

  if (normalizedMessage.includes("?")) {
    return ["I'm in", "Give me 5 min", "Let's jump on a call"];
  }

  if (normalizedMessage.includes("when")) {
    return ["I'm ready now", "Send the time", "Let's do a quick call"];
  }

  if (normalizedMessage.includes("where")) {
    return ["Send the link", "I'm on my way", "Let's meet in the thread"];
  }

  return [`Hey ${firstName}, I'm here`, "Let's do a voice call", "Send me the details"];
};

function GatedSmartReplySuggestions({
  activeCallType,
  currentUserId,
  messages,
  onSelectSuggestion,
  otherMemberName,
}: {
  activeCallType?: ChatCallType;
  currentUserId: string;
  messages: ChatMessage[];
  onSelectSuggestion: (suggestion: string) => void;
  otherMemberName?: string;
}) {
  const chillyChatExpandedFlag = useFeatureFlag(posthogFeatureFlags.chillyChatExpandedV1);
  const aiChatSuggestionsFlag = useFeatureFlag(posthogFeatureFlags.aiChatSuggestionsV1);

  const isExpandedEnabled = isPostHogFlagEnabled(chillyChatExpandedFlag);
  const isAiSuggestionsEnabled = isPostHogFlagEnabled(aiChatSuggestionsFlag);
  const latestIncomingMessage = useMemo(
    () => [...messages].reverse().find((message) => message.senderUserId !== currentUserId)?.body ?? "",
    [currentUserId, messages],
  );
  const suggestions = useMemo(
    () => buildSmartReplySuggestions({
      activeCallType,
      lastIncomingMessage: latestIncomingMessage,
      otherMemberName,
    }),
    [activeCallType, latestIncomingMessage, otherMemberName],
  );

  if (!isExpandedEnabled || !isAiSuggestionsEnabled || suggestions.length === 0) {
    return null;
  }

  return (
    <View style={styles.smartReplyCard}>
      <View style={styles.smartReplyHeader}>
        <Text style={styles.smartReplyKicker}>AI SMART REPLIES</Text>
        <Text style={styles.smartReplyMeta}>PostHog gated</Text>
      </View>
      <Text style={styles.smartReplyBody}>
        Smart suggestions stay additive inside this thread and do not change default messaging behavior unless the remote flags are enabled.
      </Text>
      <View style={styles.smartReplyRow}>
        {suggestions.map((suggestion) => (
          <TouchableOpacity
            key={suggestion}
            style={styles.smartReplyChip}
            activeOpacity={0.86}
            onPress={() => onSelectSuggestion(suggestion)}
          >
            <Text style={styles.smartReplyChipText}>{suggestion}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

export default function ChillyChatThreadScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useSession();
  const { threadId: threadIdParam, startCall: startCallParam } = useLocalSearchParams<{ threadId?: string; startCall?: string }>();
  const threadId = String(Array.isArray(threadIdParam) ? threadIdParam[0] : threadIdParam ?? "").trim();
  const requestedCallMode = String(Array.isArray(startCallParam) ? startCallParam[0] : startCallParam ?? "").trim().toLowerCase();

  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [callBusy, setCallBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thread, setThread] = useState<ChatThreadSummary | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [callPanelOpen, setCallPanelOpen] = useState(false);
  const [headerQuickActionsOpen, setHeaderQuickActionsOpen] = useState(false);
  const autoStartCallRef = useRef("");

  const activeCallRoomId = thread?.activeCommunicationRoomId ?? "";
  const currentUserId = String(user?.id ?? "").trim();
  const posthogEnabled = getPostHogConfig().isEnabled;

  const loadThreadState = useCallback(async () => {
    if (!threadId) {
      setError("Missing Chi'lly Chat thread.");
      setLoading(false);
      return;
    }

    try {
      const [nextThread, nextMessages] = await Promise.all([
        getChatThread(threadId),
        listChatMessages(threadId),
      ]);

      if (!nextThread) {
        setError("This Chi'lly Chat thread could not be found.");
        setLoading(false);
        return;
      }

      setThread(nextThread);
      setMessages(nextMessages);
      setError(null);
      setLoading(false);

      await markChatThreadRead(threadId).catch(() => null);

      setCallPanelOpen((wasOpen) => (wasOpen ? !!nextThread.activeCommunicationRoomId : false));
    } catch (loadError: any) {
      setError(loadError?.message ?? "Unable to load this Chi'lly Chat thread.");
      setLoading(false);
    }
  }, [threadId]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      void loadThreadState();
      trackEvent("chat_thread_opened", {
        surface: "chat-thread",
        threadId,
      });

      if (!threadId) {
        return () => {};
      }

      const unsubscribe = subscribeToThread(threadId, () => {
        void loadThreadState();
      });

      return unsubscribe;
    }, [loadThreadState, threadId]),
  );

  const initialCallMediaPreferences = useMemo(() => {
    if (thread?.activeCallType === "voice") {
      return {
        cameraEnabled: false,
        micEnabled: true,
      };
    }

    if (thread?.activeCallType === "video") {
      return {
        cameraEnabled: true,
        micEnabled: true,
      };
    }

    return undefined;
  }, [thread?.activeCallType]);

  const {
    room: callRoom,
    loading: callLoading,
    error: callError,
    channelState: callChannelState,
    cameraEnabled,
    micEnabled,
    participants,
    participantCount,
    toggleCamera,
    toggleMic,
    leaveRoom,
  } = useCommunicationRoomSession({
    roomId: activeCallRoomId,
    enabled: callPanelOpen && !!activeCallRoomId,
    initialMediaPreferences: initialCallMediaPreferences,
    analyticsContext: {
      surface: "chat-thread",
      role: null,
    },
    onRoomEnded: (reason) => {
      trackEvent("chat_call_ended", {
        surface: "chat-thread",
        threadId,
        reason,
      });
      void clearEndedChatThreadCall(threadId).finally(() => {
        setCallPanelOpen(false);
        void loadThreadState();
      });
    },
  });

  const otherMember = thread?.otherMember;
  const callTitle = thread?.activeCallType === "video" ? "Video call active" : "Voice call active";
  const callBody = thread?.activeCallType === "video"
    ? "Chi'lly Chat video stays inside this direct thread so both people can join without leaving the conversation."
    : "Chi'lly Chat voice stays inside this direct thread so both people can join without leaving the conversation.";
  const callActionLabel = callBusy
    ? "Connecting..."
    : !activeCallRoomId
      ? "No Active Call"
      : callPanelOpen
        ? "Close Chi'lly Chat"
        : thread?.activeCallType === "video"
          ? "Join Video Call"
          : "Join Voice Call";

  const renderedMessages = useMemo(
    () => messages.map((message) => ({
      ...message,
      isMe: message.senderUserId === currentUserId,
      authorLabel: buildAuthor(thread?.members ?? [], message.senderUserId),
    })),
    [currentUserId, messages, thread?.members],
  );

  const handleSend = useCallback(async () => {
    const trimmedDraft = draft.trim();
    if (!threadId || !trimmedDraft || sending || !thread) return;

    const tempId = `temp-${Date.now()}`;
    const optimistic: ChatMessage = {
      id: tempId,
      threadId,
      senderUserId: currentUserId,
      body: trimmedDraft,
      messageType: "text",
      createdAt: new Date().toISOString(),
    };

    setDraft("");
    setSending(true);
    setMessages((prev) => [...prev, optimistic]);

    try {
      const sent = await sendChatMessage(threadId, trimmedDraft);
      trackEvent("chat_message_sent", {
        surface: "chat-thread",
        threadId,
      });
      setMessages((prev) => prev.map((message) => (message.id === tempId ? sent : message)));
      await markChatThreadRead(threadId).catch(() => null);
    } catch (sendError) {
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      const message = sendError instanceof Error ? sendError.message : "Unable to send Chi'lly Chat message.";
      setError(message);
      reportRuntimeError("chat-thread-send-message", sendError, {
        threadId,
      });
    } finally {
      setSending(false);
    }
  }, [currentUserId, draft, sending, thread, threadId]);

  const handleStartCall = useCallback(async (mode: ChatCallType) => {
    if (!threadId || callBusy || !!activeCallRoomId) return;

    try {
      setCallBusy(true);
      const result = await startChatThreadCall(threadId, mode);
      setThread(result.thread);
      setCallPanelOpen(true);
      trackEvent("chat_call_started", {
        surface: "chat-thread",
        threadId,
        mode,
      });
    } catch (callStartError) {
      const message = callStartError instanceof Error ? callStartError.message : "Unable to start Chi'lly Chat call.";
      setError(message);
      reportRuntimeError("chat-thread-start-call", callStartError, {
        threadId,
        mode,
      });
    } finally {
      setCallBusy(false);
    }
  }, [activeCallRoomId, callBusy, threadId]);

  useEffect(() => {
    const nextMode: ChatCallType | null = requestedCallMode === "voice"
      ? "voice"
      : requestedCallMode === "video"
        ? "video"
        : null;
    const requestKey = nextMode ? `${threadId}:${nextMode}` : "";

    if (!nextMode || !threadId || loading || !thread || callBusy || !!activeCallRoomId) {
      if (!nextMode) autoStartCallRef.current = "";
      return;
    }

    if (autoStartCallRef.current === requestKey) return;
    autoStartCallRef.current = requestKey;
    void handleStartCall(nextMode);
  }, [activeCallRoomId, callBusy, handleStartCall, loading, requestedCallMode, thread, threadId]);

  const handleJoinOrCloseCall = useCallback(async () => {
    if (!threadId) return;

    if (!activeCallRoomId) {
      await handleStartCall("video");
      return;
    }

    if (!callPanelOpen) {
      trackEvent("chat_call_join_requested", {
        surface: "chat-thread",
        threadId,
        mode: thread?.activeCallType ?? null,
      });
      setCallPanelOpen(true);
      return;
    }

    const isHost = !!callRoom?.hostUserId && callRoom.hostUserId === currentUserId;
    try {
      await leaveRoom({ endRoomIfHost: isHost });
      if (isHost) {
        await clearEndedChatThreadCall(threadId);
      }
      setCallPanelOpen(false);
      await loadThreadState();
    } catch (leaveError) {
      reportRuntimeError("chat-thread-close-call", leaveError, {
        threadId,
        role: isHost ? "host" : "viewer",
      });
    }
  }, [activeCallRoomId, callPanelOpen, callRoom?.hostUserId, currentUserId, handleStartCall, leaveRoom, loadThreadState, thread?.activeCallType, threadId]);

  const handleOpenProfile = useCallback(() => {
    if (!otherMember?.userId) return;

    trackEvent("chat_thread_profile_open_requested", {
      surface: "chat-thread",
      threadId,
      targetUserId: otherMember.userId,
    });
    setHeaderQuickActionsOpen(false);
    router.push({
      pathname: "/profile/[userId]",
      params: {
        userId: otherMember.userId,
        displayName: otherMember.displayName,
        avatarUrl: otherMember.avatarUrl,
        tagline: otherMember.tagline,
      },
    });
  }, [otherMember, router, threadId]);

  const handleHeaderCallAction = useCallback(async (mode: ChatCallType) => {
    setHeaderQuickActionsOpen(false);

    if (activeCallRoomId) {
      trackEvent("chat_thread_call_join_requested", {
        surface: "chat-thread-header",
        threadId,
        mode: thread?.activeCallType ?? mode,
      });
      setCallPanelOpen(true);
      return;
    }

    await handleStartCall(mode);
  }, [activeCallRoomId, handleStartCall, thread?.activeCallType, threadId]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: safeAreaInsets.top + 28 }]}>
        <ActivityIndicator size="small" color="#F34B74" />
        <Text style={styles.stateText}>Loading thread…</Text>
      </View>
    );
  }

  if (!thread) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: safeAreaInsets.top + 28 }]}>
        <Text style={styles.stateText}>{error ?? "This Chi'lly Chat thread is unavailable."}</Text>
        <TouchableOpacity style={styles.secondaryBtn} activeOpacity={0.85} onPress={() => router.back()}>
          <Text style={styles.secondaryBtnText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: safeAreaInsets.top + 8 }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      testID="chat-thread-screen"
      accessibilityLabel="Chi'lly Chat direct thread screen"
    >
      <View style={styles.header}>
        <TouchableOpacity
          testID="chat-thread-back-button"
          accessibilityLabel="Back from Chi'lly Chat thread"
          activeOpacity={0.8}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.headerAvatarButton}
          activeOpacity={0.86}
          onLongPress={() => setHeaderQuickActionsOpen((current) => !current)}
          onPress={() => setHeaderQuickActionsOpen(false)}
        >
          {otherMember?.avatarUrl ? (
            <Image source={{ uri: otherMember.avatarUrl }} style={styles.headerAvatarImage} />
          ) : (
            <View style={styles.headerAvatar}>
              <Text style={styles.headerAvatarText}>{(otherMember?.displayName ?? "C").slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.kicker}>CHI&apos;LLY CHAT</Text>
          <Text style={styles.title}>{otherMember?.displayName ?? "Direct Thread"}</Text>
          {otherMember?.tagline ? <Text style={styles.body}>{otherMember.tagline}</Text> : null}
          <View style={styles.headerMetaRow}>
            <View style={styles.headerPill}>
              <View style={[styles.headerPillDot, activeCallRoomId && styles.headerPillDotAlert]} />
              <Text style={styles.headerPillText}>{getThreadStatusLabel(thread)}</Text>
            </View>
            {thread?.currentMember?.lastReadAt ? (
              <Text style={styles.headerMetaText}>Read updates sync when this thread opens.</Text>
            ) : (
              <Text style={styles.headerMetaText}>Messenger-first thread with room-linked calling.</Text>
            )}
          </View>
          <Text style={styles.headerHint}>Long-press the avatar for profile and call actions.</Text>
        </View>
      </View>

      {headerQuickActionsOpen ? (
        <View style={styles.headerQuickActionCard}>
          <Text style={styles.headerQuickActionKicker}>THREAD QUICK ACTIONS</Text>
          <Text style={styles.headerQuickActionTitle}>
            {otherMember?.displayName ?? "Chi'lly Chat contact"}
          </Text>
          <Text style={styles.headerQuickActionBody}>
            Open the profile or keep voice/video entry inside this thread so the conversation and call state stay together.
          </Text>
          <View style={styles.headerQuickActionRow}>
            <TouchableOpacity
              style={styles.headerQuickActionButton}
              activeOpacity={0.86}
              disabled={!otherMember?.userId}
              onPress={() => {
                void handleOpenProfile();
              }}
            >
              <Text style={styles.headerQuickActionButtonText}>View Profile</Text>
            </TouchableOpacity>
            {activeCallRoomId ? (
              <TouchableOpacity
                style={[styles.headerQuickActionButton, styles.headerQuickActionAccentButton]}
                activeOpacity={0.86}
                onPress={() => {
                  void handleHeaderCallAction(thread?.activeCallType ?? "video");
                }}
              >
                <Text style={styles.headerQuickActionAccentButtonText}>Open Call</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity
                  style={[styles.headerQuickActionButton, styles.headerQuickActionAccentButton]}
                  activeOpacity={0.86}
                  onPress={() => {
                    void handleHeaderCallAction("voice");
                  }}
                >
                  <Text style={styles.headerQuickActionAccentButtonText}>Voice Call</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.headerQuickActionButton, styles.headerQuickActionAccentButton]}
                  activeOpacity={0.86}
                  onPress={() => {
                    void handleHeaderCallAction("video");
                  }}
                >
                  <Text style={styles.headerQuickActionAccentButtonText}>Video Call</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      ) : null}

      <View style={styles.actionRow}>
        <TouchableOpacity
          testID="chat-thread-voice-call-button"
          accessibilityLabel="Start Chi'lly Chat voice call"
          style={[styles.callBtn, callBusy && styles.callBtnDisabled]}
          activeOpacity={0.86}
          disabled={callBusy || !!activeCallRoomId}
          onPress={() => void handleStartCall("voice")}
        >
          <Text style={styles.callBtnText}>Voice Call</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="chat-thread-video-call-button"
          accessibilityLabel="Start Chi'lly Chat video call"
          style={[styles.callBtn, callBusy && styles.callBtnDisabled]}
          activeOpacity={0.86}
          disabled={callBusy || !!activeCallRoomId}
          onPress={() => void handleStartCall("video")}
        >
          <Text style={styles.callBtnText}>Video Call</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID="chat-thread-join-call-button"
          accessibilityLabel={callActionLabel}
          style={[styles.joinBtn, (callBusy || (!activeCallRoomId && !callPanelOpen)) && styles.callBtnDisabled]}
          activeOpacity={0.86}
          disabled={callBusy || (!activeCallRoomId && !callPanelOpen)}
          onPress={() => void handleJoinOrCloseCall()}
        >
          <Text style={styles.joinBtnText}>{callActionLabel}</Text>
        </TouchableOpacity>
      </View>

      {activeCallRoomId && !callPanelOpen ? (
        <View style={styles.callBanner}>
          <Text style={styles.callBannerTitle}>{callTitle}</Text>
          <Text style={styles.callBannerBody}>
            {otherMember?.displayName ?? "The other participant"} can join from this same thread. Open Chi&apos;lly Chat to join.
          </Text>
        </View>
      ) : null}

      {callPanelOpen ? (
        <View style={styles.panelWrap}>
          <InRoomCommunicationPanel
            surfaceLabel="Chi'lly Chat"
            titleText={callTitle}
            bodyText={callBody}
            loadingText="Connecting Chi'lly Chat call…"
            emptyStateText="Waiting for the other participant to join this Chi'lly Chat call."
            roomCode={callRoom?.roomCode}
            participantCount={participantCount}
            isHost={!!callRoom?.hostUserId && callRoom.hostUserId === currentUserId}
            channelState={callChannelState}
            loading={callLoading}
            statusMessage={callError}
            participants={participants}
            cameraEnabled={cameraEnabled}
            micEnabled={micEnabled}
            showControls={!!activeCallRoomId && !callError && !callLoading}
            onToggleCamera={toggleCamera}
            onToggleMic={toggleMic}
            onLeave={() => {
              void handleJoinOrCloseCall();
            }}
          />
        </View>
      ) : null}

      <ScrollView
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        testID="chat-thread-messages-scroll"
        accessibilityLabel="Chi'lly Chat messages"
      >
        {renderedMessages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.messageBubble,
              message.isMe ? styles.messageBubbleMe : styles.messageBubbleThem,
            ]}
          >
            <Text style={[styles.messageAuthor, message.isMe && styles.messageAuthorMe]}>
              {message.isMe ? "You" : message.authorLabel}
            </Text>
            <Text style={styles.messageBody}>{message.body}</Text>
            <Text style={[styles.messageTime, message.isMe && styles.messageTimeMe]}>
              {formatStamp(message.createdAt)}
            </Text>
          </View>
        ))}
        {renderedMessages.length === 0 ? (
          <View
            style={styles.emptyCard}
            testID="chat-thread-empty-state"
            accessibilityLabel="Chi'lly Chat empty thread"
          >
            <Text style={styles.emptyTitle}>Start the conversation</Text>
              <Text style={styles.emptyBody}>
                Send the first message here. Voice and video stay thread-based when you start a Chi&apos;lly Chat call.
              </Text>
          </View>
        ) : null}
      </ScrollView>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View
        style={styles.composer}
        testID="chat-thread-composer"
        accessibilityLabel="Chi'lly Chat composer"
      >
        <View style={styles.composerAffordanceRow}>
          <View style={styles.composerAffordanceChip}>
            <Text style={styles.composerAffordanceText}>Attach</Text>
          </View>
          <View style={styles.composerAffordanceChip}>
            <Text style={styles.composerAffordanceText}>React</Text>
          </View>
          <Text style={styles.composerAssistText}>Text send is live now. Media and reactions land next.</Text>
        </View>
        {posthogEnabled ? (
          <GatedSmartReplySuggestions
            activeCallType={thread?.activeCallType}
            currentUserId={currentUserId}
            messages={messages}
            otherMemberName={otherMember?.displayName}
            onSelectSuggestion={(suggestion) => {
              trackEvent("chat_thread_ai_suggestion_selected", {
                surface: "chat-thread",
                threadId,
                suggestion,
              });
              setDraft((current) => (current.trim() ? `${current.trim()} ${suggestion}` : suggestion));
            }}
          />
        ) : null}
        <View style={styles.composerInputRow}>
          <TextInput
            testID="chat-thread-input"
            accessibilityLabel="Write a Chi'lly Chat message"
            style={styles.input}
            placeholder="Write a message"
            placeholderTextColor="#7F8AA1"
            value={draft}
            onChangeText={setDraft}
            multiline
          />
          <TouchableOpacity
            testID="chat-thread-send-button"
            accessibilityLabel="Send Chi'lly Chat message"
            style={[styles.sendBtn, (sending || !draft.trim()) && styles.callBtnDisabled]}
            activeOpacity={0.86}
            disabled={sending || !draft.trim()}
            onPress={() => {
              void handleSend();
            }}
          >
            <Text style={styles.sendBtnText}>{sending ? "..." : "Send"}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#060A12",
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 24,
  },
  header: {
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 18,
    paddingBottom: 14,
    alignItems: "flex-start",
  },
  backText: {
    color: "#E2E9F7",
    fontSize: 14,
    fontWeight: "800",
  },
  headerAvatarButton: {
    borderRadius: 24,
  },
  headerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(243,75,116,0.2)",
    marginTop: 2,
  },
  headerAvatarImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginTop: 2,
  },
  headerAvatarText: {
    color: "#FFF5F8",
    fontSize: 18,
    fontWeight: "900",
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  kicker: {
    color: "#8894AB",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.15,
  },
  title: {
    color: "#F8FBFF",
    fontSize: 24,
    fontWeight: "900",
  },
  body: {
    color: "#B9C5D9",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  headerMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  },
  headerPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerPillDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#7AE2B7",
  },
  headerPillDotAlert: {
    backgroundColor: "#F34B74",
  },
  headerPillText: {
    color: "#E8F0FF",
    fontSize: 10,
    fontWeight: "900",
  },
  headerMetaText: {
    color: "#92A0B8",
    fontSize: 11,
    fontWeight: "700",
  },
  headerHint: {
    color: "#90A0B9",
    fontSize: 11,
    fontWeight: "700",
  },
  headerQuickActionCard: {
    gap: 10,
    marginHorizontal: 18,
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(243,75,116,0.28)",
    backgroundColor: "rgba(243,75,116,0.1)",
    padding: 16,
  },
  headerQuickActionKicker: {
    color: "#FFB8C8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  headerQuickActionTitle: {
    color: "#FFF5F8",
    fontSize: 17,
    fontWeight: "900",
  },
  headerQuickActionBody: {
    color: "#FFD8E2",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  headerQuickActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  headerQuickActionButton: {
    minWidth: 116,
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(6,10,18,0.35)",
    paddingVertical: 11,
    paddingHorizontal: 10,
  },
  headerQuickActionButtonText: {
    color: "#FFF4F8",
    fontSize: 12,
    fontWeight: "900",
  },
  headerQuickActionAccentButton: {
    backgroundColor: "#F34B74",
    borderColor: "rgba(243,75,116,0.7)",
  },
  headerQuickActionAccentButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  callBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingVertical: 12,
    alignItems: "center",
  },
  joinBtn: {
    flex: 1.2,
    borderRadius: 14,
    backgroundColor: "#F34B74",
    paddingVertical: 12,
    alignItems: "center",
  },
  callBtnDisabled: {
    opacity: 0.5,
  },
  callBtnText: {
    color: "#EDF3FF",
    fontSize: 12,
    fontWeight: "900",
  },
  joinBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  callBanner: {
    marginHorizontal: 18,
    marginBottom: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(243,75,116,0.3)",
    backgroundColor: "rgba(243,75,116,0.1)",
    padding: 14,
    gap: 6,
  },
  callBannerTitle: {
    color: "#FFF4F8",
    fontSize: 15,
    fontWeight: "900",
  },
  callBannerBody: {
    color: "#FFD4DE",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  panelWrap: {
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  messages: {
    flex: 1,
  },
  messagesContent: {
    paddingHorizontal: 18,
    paddingBottom: 14,
    gap: 10,
  },
  messageBubble: {
    maxWidth: "84%",
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 4,
  },
  messageBubbleMe: {
    alignSelf: "flex-end",
    backgroundColor: "#F34B74",
  },
  messageBubbleThem: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  messageAuthor: {
    color: "#F4F8FF",
    fontSize: 11,
    fontWeight: "900",
  },
  messageAuthorMe: {
    color: "#FFF3F7",
  },
  messageBody: {
    color: "#FFFFFF",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  messageTime: {
    color: "#C7D1E3",
    fontSize: 10,
    fontWeight: "700",
    textAlign: "right",
  },
  messageTimeMe: {
    color: "#FFE2EA",
  },
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 18,
    gap: 8,
    marginTop: 4,
  },
  emptyTitle: {
    color: "#F8FBFF",
    fontSize: 18,
    fontWeight: "900",
  },
  emptyBody: {
    color: "#B9C5D9",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  composer: {
    gap: 10,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: Platform.OS === "ios" ? 26 : 18,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(6,10,18,0.96)",
  },
  composerAffordanceRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  composerAffordanceChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  composerAffordanceText: {
    color: "#B9C5D9",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  composerAssistText: {
    color: "#8794AC",
    fontSize: 10.5,
    fontWeight: "700",
  },
  smartReplyCard: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(122,226,183,0.16)",
    backgroundColor: "rgba(122,226,183,0.08)",
    padding: 14,
  },
  smartReplyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  smartReplyKicker: {
    color: "#D8FFF0",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.05,
  },
  smartReplyMeta: {
    color: "#8FE0BE",
    fontSize: 10,
    fontWeight: "800",
  },
  smartReplyBody: {
    color: "#CDEBDF",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  smartReplyRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  smartReplyChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(122,226,183,0.28)",
    backgroundColor: "rgba(6,10,18,0.3)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  smartReplyChipText: {
    color: "#E8FFF5",
    fontSize: 11.5,
    fontWeight: "800",
  },
  composerInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    color: "#F7FBFF",
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 13,
    fontWeight: "600",
  },
  sendBtn: {
    borderRadius: 14,
    backgroundColor: "#F34B74",
    paddingHorizontal: 16,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  secondaryBtn: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryBtnText: {
    color: "#EFF4FF",
    fontSize: 13,
    fontWeight: "800",
  },
  stateText: {
    color: "#CDD7EA",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    textAlign: "center",
  },
  errorText: {
    color: "#FFB6C7",
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 18,
    paddingBottom: 8,
  },
});
