import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Image,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { trackEvent } from "../../_lib/analytics";
import { getOrCreateDirectThread, listChatThreads, subscribeToInbox, type ChatThreadSummary } from "../../_lib/chat";
import { readActiveFriendUserIds } from "../../_lib/friendGraph";
import { getOfficialPlatformAccount, RACHI_OFFICIAL_ACCOUNT } from "../../_lib/officialAccounts";
import { useSession } from "../../_lib/session";

type InboxErrorState = {
  message: string;
  source: "load" | "official-thread";
};

function buildPreview(thread: ChatThreadSummary) {
  if (thread.activeCommunicationRoomId && thread.activeCallType) {
    return `${thread.activeCallType === "video" ? "Video" : "Voice"} call active`;
  }
  return thread.lastMessagePreview ?? "Start the thread";
}

function formatThreadTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function getIdentityLabel(thread: ChatThreadSummary) {
  if (thread.activeCommunicationRoomId && thread.activeCallType) {
    return thread.activeCallType === "video" ? "Video call live" : "Voice call live";
  }
  return thread.currentMember?.unreadCount ? "Unread" : "Caught up";
}

function getThreadKindLabel(thread: ChatThreadSummary) {
  return getOfficialPlatformAccount(thread.otherMember?.userId) ? "Official thread" : "Direct thread";
}

function matchesSearch(thread: ChatThreadSummary, rawQuery: string) {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;

  const searchFields = [
    thread.otherMember?.displayName,
    thread.otherMember?.tagline,
    thread.lastMessagePreview,
    thread.activeCallType,
  ];

  return searchFields.some((value) => String(value ?? "").toLowerCase().includes(query));
}

export default function ChillyChatInboxScreen() {
  const router = useRouter();
  const safeAreaInsets = useSafeAreaInsets();
  const { isLoading: authLoading, isSignedIn } = useSession();
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<InboxErrorState | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [quickActionThreadId, setQuickActionThreadId] = useState("");
  const [starterBusy, setStarterBusy] = useState(false);
  const [activeFriendUserIds, setActiveFriendUserIds] = useState<string[]>([]);

  const loadThreads = useCallback(async (refresh = false) => {
    if (!isSignedIn) {
      setThreads([]);
      setError(null);
      setActiveFriendUserIds([]);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const nextThreads = await listChatThreads();
      setThreads(nextThreads);
      setError(null);
      void readActiveFriendUserIds()
        .then((nextUserIds) => {
          setActiveFriendUserIds(nextUserIds);
        })
        .catch(() => {
          setActiveFriendUserIds([]);
        });
    } catch (loadError: any) {
      setError({
        message: loadError?.message ?? "Unable to load Chi'lly Chat right now.",
        source: "load",
      });
      setActiveFriendUserIds([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isSignedIn]);

  useFocusEffect(
    useCallback(() => {
      if (authLoading) {
        return () => {};
      }

      if (!isSignedIn) {
        setThreads([]);
        setError(null);
        setActiveFriendUserIds([]);
        setLoading(false);
        setRefreshing(false);
        return () => {};
      }

      void loadThreads();
      trackEvent("chat_inbox_opened", {
        surface: "chat-inbox",
      });

      const unsubscribe = subscribeToInbox(() => {
        void loadThreads(true);
      });

      return unsubscribe;
    }, [authLoading, isSignedIn, loadThreads]),
  );

  const filteredThreads = useMemo(
    () => threads.filter((thread) => matchesSearch(thread, searchQuery)),
    [searchQuery, threads],
  );

  const unreadThreadCount = useMemo(
    () => threads.filter((thread) => (thread.currentMember?.unreadCount ?? 0) > 0).length,
    [threads],
  );

  const liveCallCount = useMemo(
    () => threads.filter((thread) => !!thread.activeCommunicationRoomId && !!thread.activeCallType).length,
    [threads],
  );

  const quickActionThread = useMemo(
    () => threads.find((thread) => thread.threadId === quickActionThreadId) ?? null,
    [quickActionThreadId, threads],
  );

  const activeFriendUserIdSet = useMemo(
    () => new Set(activeFriendUserIds.map((userId) => String(userId).trim()).filter(Boolean)),
    [activeFriendUserIds],
  );

  const openThread = useCallback((thread: ChatThreadSummary, startCall?: "voice" | "video") => {
    trackEvent("chat_thread_open_requested", {
      surface: "chat-inbox",
      threadId: thread.threadId,
      hasUnread: (thread.currentMember?.unreadCount ?? 0) > 0 ? "true" : "false",
      entryMode: startCall ?? "thread",
    });
    router.push({
      pathname: "/chat/[threadId]",
      params: {
        threadId: thread.threadId,
        ...(startCall ? { startCall } : {}),
      },
    });
  }, [router]);

  const openProfile = useCallback((thread: ChatThreadSummary) => {
    const otherMember = thread.otherMember;
    if (!otherMember?.userId) return;
    const officialAccount = getOfficialPlatformAccount(otherMember.userId);
    const avatarUrl = officialAccount ? undefined : otherMember.avatarUrl;

    trackEvent("chat_inbox_profile_open_requested", {
      surface: "chat-inbox",
      threadId: thread.threadId,
      targetUserId: otherMember.userId,
    });
    router.push({
      pathname: "/profile/[userId]",
      params: {
        userId: otherMember.userId,
        displayName: officialAccount?.displayName ?? otherMember.displayName,
        avatarUrl,
        tagline: officialAccount?.tagline ?? otherMember.tagline,
      },
    });
  }, [router]);

  const openOfficialProfile = useCallback(() => {
    trackEvent("chat_official_profile_open_requested", {
      surface: "chat-inbox",
      targetUserId: RACHI_OFFICIAL_ACCOUNT.userId,
    });
    router.push({
      pathname: "/profile/[userId]",
      params: {
        userId: RACHI_OFFICIAL_ACCOUNT.userId,
        displayName: RACHI_OFFICIAL_ACCOUNT.displayName,
        tagline: RACHI_OFFICIAL_ACCOUNT.tagline,
      },
    });
  }, [router]);

  const openOfficialThread = useCallback(async () => {
    setStarterBusy(true);
    setError(null);

    try {
      const thread = await getOrCreateDirectThread({
        userId: RACHI_OFFICIAL_ACCOUNT.userId,
        displayName: RACHI_OFFICIAL_ACCOUNT.displayName,
        tagline: RACHI_OFFICIAL_ACCOUNT.tagline,
      });
      trackEvent("chat_official_thread_open_requested", {
        surface: "chat-inbox",
        threadId: thread.threadId,
        targetUserId: RACHI_OFFICIAL_ACCOUNT.userId,
      });
      router.push({
        pathname: "/chat/[threadId]",
        params: {
          threadId: thread.threadId,
        },
      });
    } catch (threadError: any) {
      setError({
        message: threadError?.message ?? "Unable to open the official Chi'lly Chat thread right now.",
        source: "official-thread",
      });
    } finally {
      setStarterBusy(false);
    }
  }, [router]);

  const listHeader = useMemo(() => (
    <View style={styles.header}>
      <Text style={styles.kicker}>CHI&apos;LLY CHAT</Text>
      <Text style={styles.title}>Inbox</Text>
      <Text style={styles.body}>
        Direct threads, voice, and video live here.
      </Text>
      <View style={styles.headerMetaRow}>
        <View style={styles.headerPill}>
          <Text style={styles.headerPillText}>{threads.length} thread{threads.length === 1 ? "" : "s"}</Text>
        </View>
        <View style={styles.headerPill}>
          <Text style={styles.headerPillText}>{unreadThreadCount} unread</Text>
        </View>
        <View style={styles.headerPill}>
          <Text style={styles.headerPillText}>{liveCallCount} live call{liveCallCount === 1 ? "" : "s"}</Text>
        </View>
      </View>
      <View style={styles.officialStarterCard}>
        <View style={styles.officialStarterBadgeRow}>
          <View style={styles.officialStarterBadge}>
            <Text style={styles.officialStarterBadgeText}>{RACHI_OFFICIAL_ACCOUNT.officialBadgeLabel}</Text>
          </View>
          <View style={styles.officialStarterMetaPill}>
            <Text style={styles.officialStarterMetaText}>{RACHI_OFFICIAL_ACCOUNT.platformOwnershipLabel}</Text>
          </View>
        </View>
        <Text style={styles.officialStarterTitle}>{RACHI_OFFICIAL_ACCOUNT.displayName}</Text>
        <Text style={styles.officialStarterHeadline}>{RACHI_OFFICIAL_ACCOUNT.conciergeHeadline}</Text>
        <Text style={styles.officialStarterBody}>{RACHI_OFFICIAL_ACCOUNT.trustSummary}</Text>
        <View style={styles.officialStarterTopicRow}>
          {RACHI_OFFICIAL_ACCOUNT.guidanceTopics.map((topic) => (
            <View key={topic} style={styles.officialStarterTopicPill}>
              <Text style={styles.officialStarterTopicText}>{topic}</Text>
            </View>
          ))}
        </View>
        <View style={styles.quickActionRow}>
          <TouchableOpacity
            style={styles.quickActionButton}
            activeOpacity={0.86}
            onPress={() => {
              void openOfficialThread();
            }}
            disabled={starterBusy}
          >
            <Text style={styles.quickActionButtonText}>{starterBusy ? "Opening..." : "Open Thread"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.quickActionButton, styles.quickActionAccentButton]}
            activeOpacity={0.86}
            onPress={openOfficialProfile}
          >
            <Text style={styles.quickActionAccentButtonText}>Open Profile</Text>
          </TouchableOpacity>
        </View>
      </View>
      {error ? (
        <View style={styles.headerErrorCard}>
          <View style={styles.headerErrorCopy}>
            <Text style={styles.headerErrorTitle}>
              {error.source === "official-thread" ? "Official thread needs another try" : "Inbox needs another try"}
            </Text>
            <Text style={styles.headerErrorBody}>{error.message}</Text>
          </View>
          <TouchableOpacity
            style={styles.headerErrorAction}
            activeOpacity={0.86}
            onPress={() => {
              if (error.source === "official-thread") {
                void openOfficialThread();
                return;
              }
              void loadThreads(true);
            }}
          >
            <Text style={styles.headerErrorActionText}>
              {error.source === "official-thread" ? "Open Thread" : "Refresh Inbox"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <Text style={styles.headerHint}>Tap an avatar for profile. Long-press a thread for quick call actions.</Text>
      {quickActionThread ? (
        <View style={styles.quickActionCard}>
          <Text style={styles.quickActionKicker}>THREAD SHORTCUTS</Text>
          <Text style={styles.quickActionTitle}>
            {quickActionThread.otherMember?.displayName ?? "Chi'lly Chat Thread"}
          </Text>
          <Text style={styles.quickActionBody}>
            Open the thread, jump to the profile, or start voice/video from the same inbox surface.
          </Text>
          <View style={styles.quickActionRow}>
            <TouchableOpacity
              style={styles.quickActionButton}
              activeOpacity={0.86}
              onPress={() => {
                setQuickActionThreadId("");
                openThread(quickActionThread);
              }}
            >
              <Text style={styles.quickActionButtonText}>Open Thread</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.quickActionButton}
              activeOpacity={0.86}
              disabled={!quickActionThread.otherMember?.userId}
              onPress={() => {
                setQuickActionThreadId("");
                openProfile(quickActionThread);
              }}
            >
              <Text style={styles.quickActionButtonText}>Open Profile</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.quickActionRow}>
            <TouchableOpacity
              style={[styles.quickActionButton, styles.quickActionAccentButton]}
              activeOpacity={0.86}
              onPress={() => {
                setQuickActionThreadId("");
                openThread(quickActionThread, "voice");
              }}
            >
              <Text style={styles.quickActionAccentButtonText}>Voice Call</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickActionButton, styles.quickActionAccentButton]}
              activeOpacity={0.86}
              onPress={() => {
                setQuickActionThreadId("");
                openThread(quickActionThread, "video");
              }}
            >
              <Text style={styles.quickActionAccentButtonText}>Video Call</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      <View style={styles.searchShell}>
        <Text style={styles.searchLabel}>Search</Text>
        <TextInput
          testID="chat-inbox-search-input"
          accessibilityLabel="Search Chi'lly Chat inbox"
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search threads, names, or call state"
          placeholderTextColor="#75829A"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>
    </View>
  ), [
    error,
    liveCallCount,
    loadThreads,
    openOfficialProfile,
    openOfficialThread,
    openProfile,
    openThread,
    quickActionThread,
    searchQuery,
    starterBusy,
    threads.length,
    unreadThreadCount,
  ]);

  if (authLoading || loading) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: safeAreaInsets.top + 28 }]}>
        <ActivityIndicator size="small" color="#F34B74" />
        <Text style={styles.stateText}>{authLoading ? "Checking Chi'lly Chat access..." : "Loading Chi'lly Chat..."}</Text>
      </View>
    );
  }

  if (!isSignedIn) {
    return (
      <View style={[styles.screen, styles.centered, { paddingTop: safeAreaInsets.top + 28 }]}>
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Sign in to open Chi&apos;lly Chat</Text>
          <Text style={styles.emptyBody}>
            Chi&apos;lly Chat inbox, direct threads, and official support threads only open on a signed-in Chi&apos;llywood identity.
          </Text>
          <TouchableOpacity
            style={[styles.quickActionButton, styles.quickActionAccentButton]}
            activeOpacity={0.86}
            onPress={() => router.push({ pathname: "/(auth)/login", params: { redirectTo: "/chat" } })}
          >
            <Text style={styles.quickActionAccentButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.screen, { paddingTop: safeAreaInsets.top + 12 }]}
      testID="chat-inbox-screen"
      accessibilityLabel="Chi'lly Chat inbox screen"
    >
      <FlatList
        data={filteredThreads}
        keyExtractor={(item) => item.threadId}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadThreads(true)} tintColor="#F34B74" />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={(
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{searchQuery.trim() ? "No matching threads" : "No Chi'lly Chat threads yet"}</Text>
            <Text style={styles.emptyBody}>
              {searchQuery.trim()
                ? "Try another name or clear your search."
                : "Open Chi'lly Chat from a profile to start your first direct thread."}
            </Text>
            {error ? <Text style={styles.errorText}>{error.message}</Text> : null}
          </View>
        )}
        renderItem={({ item }) => {
          const other = item.otherMember;
          const officialAccount = getOfficialPlatformAccount(other?.userId);
          const avatarUrl = officialAccount ? undefined : other?.avatarUrl;
          const unreadCount = item.currentMember?.unreadCount ?? 0;
          const preview = officialAccount && !item.lastMessagePreview && !item.activeCommunicationRoomId
            ? officialAccount.starterWelcomeBody
            : buildPreview(item);
          const identityLabel = getIdentityLabel(item);
          const threadKindLabel = getThreadKindLabel(item);
          const displayName = officialAccount?.displayName ?? other?.displayName ?? "Chi'lly Chat Thread";
          const tagline = officialAccount?.tagline ?? other?.tagline;
          const isActiveFriend = !officialAccount && !!other?.userId && activeFriendUserIdSet.has(String(other.userId).trim());

          return (
            <TouchableOpacity
              testID={`chat-thread-row-${item.threadId}`}
              style={[
                styles.threadCard,
                unreadCount > 0 && styles.threadCardUnread,
                officialAccount && styles.threadCardOfficial,
                item.activeCommunicationRoomId && item.activeCallType && styles.threadCardLive,
              ]}
              activeOpacity={0.85}
              onLongPress={() => setQuickActionThreadId(item.threadId)}
              onPress={() => openThread(item)}
            >
              <TouchableOpacity
                style={styles.avatarButton}
                activeOpacity={0.86}
                onPress={() => openProfile(item)}
                onLongPress={() => setQuickActionThreadId(item.threadId)}
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
                ) : (
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{displayName.slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <View style={styles.threadCopy}>
                <View style={styles.threadTitleRow}>
                  <View style={styles.threadTitleWrap}>
                    <Text style={styles.threadTitle}>{displayName}</Text>
                    {officialAccount ? (
                      <View style={styles.threadOfficialPill}>
                        <Text style={styles.threadOfficialPillText}>{officialAccount.officialBadgeLabel}</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.threadTime}>{formatThreadTime(item.lastMessageAt ?? item.updatedAt)}</Text>
                </View>
                <View style={styles.threadMetaRow}>
                  <View style={[styles.threadKindPill, officialAccount && styles.threadKindPillOfficial]}>
                    <Text style={[styles.threadKindPillText, officialAccount && styles.threadKindPillTextOfficial]}>
                      {threadKindLabel}
                    </Text>
                  </View>
                  <View style={[styles.identityPill, unreadCount > 0 && styles.identityPillUnread]}>
                    <View style={[styles.identityDot, unreadCount > 0 && styles.identityDotUnread]} />
                    <Text style={[styles.identityPillText, unreadCount > 0 && styles.identityPillTextUnread]}>{identityLabel}</Text>
                  </View>
                  {isActiveFriend ? (
                    <View style={styles.friendHintPill}>
                      <Text style={styles.friendHintPillText}>Friends</Text>
                    </View>
                  ) : null}
                </View>
                {tagline ? (
                  <Text style={styles.threadTagline} numberOfLines={1}>{tagline}</Text>
                ) : (
                  <Text style={styles.threadTagline} numberOfLines={1}>
                    {officialAccount ? "Platform-owned conversation" : "Direct conversation"}
                  </Text>
                )}
                <Text style={styles.threadPreview} numberOfLines={2}>{preview}</Text>
                {item.activeCommunicationRoomId && item.activeCallType ? (
                  <View style={styles.callPill}>
                    <Text style={styles.callPillText}>
                      {item.activeCallType === "video" ? "Video call live" : "Voice call live"}
                    </Text>
                  </View>
                ) : null}
              </View>
              {unreadCount > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadText}>{unreadCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        }}
      />
    </View>
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
    gap: 10,
  },
  listContent: {
    paddingHorizontal: 18,
    paddingBottom: 34,
    gap: 12,
  },
  header: {
    gap: 8,
    paddingBottom: 16,
  },
  headerMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  headerPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  headerPillText: {
    color: "#D9E3F5",
    fontSize: 11,
    fontWeight: "800",
  },
  headerHint: {
    color: "#90A0B9",
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: "700",
  },
  headerErrorCard: {
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(243,75,116,0.28)",
    backgroundColor: "rgba(243,75,116,0.1)",
    padding: 14,
  },
  headerErrorCopy: {
    gap: 4,
  },
  headerErrorTitle: {
    color: "#FFF4F8",
    fontSize: 14,
    fontWeight: "900",
  },
  headerErrorBody: {
    color: "#FFD8E2",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  headerErrorAction: {
    alignSelf: "flex-start",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(243,75,116,0.42)",
    backgroundColor: "rgba(6,10,18,0.3)",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  headerErrorActionText: {
    color: "#FFF4F8",
    fontSize: 12,
    fontWeight: "900",
  },
  inboxGuideCard: {
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 16,
  },
  inboxGuideKicker: {
    color: "#8FA0BC",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  inboxGuideTitle: {
    color: "#F8FBFF",
    fontSize: 17,
    fontWeight: "900",
  },
  inboxGuideBody: {
    color: "#B9C5D9",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  inboxGuideMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  inboxGuidePill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(6,10,18,0.28)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  inboxGuidePillOfficial: {
    borderColor: "rgba(242,194,91,0.32)",
    backgroundColor: "rgba(242,194,91,0.12)",
  },
  inboxGuidePillText: {
    color: "#E6EEFB",
    fontSize: 10.5,
    fontWeight: "900",
  },
  inboxGuidePillTextOfficial: {
    color: "#FFE6A6",
  },
  officialStarterCard: {
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(242,194,91,0.3)",
    backgroundColor: "rgba(96,72,20,0.26)",
    padding: 16,
  },
  officialStarterBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  officialStarterBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(242,194,91,0.38)",
    backgroundColor: "rgba(242,194,91,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  officialStarterBadgeText: {
    color: "#FFE6A6",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  officialStarterMetaPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  officialStarterMetaText: {
    color: "#F8F2DD",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  officialStarterTitle: {
    color: "#FFF9E8",
    fontSize: 18,
    fontWeight: "900",
  },
  officialStarterHeadline: {
    color: "#FFF4D6",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },
  officialStarterBody: {
    color: "#F0E5C5",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  officialStarterTopicRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  officialStarterTopicPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(242,194,91,0.32)",
    backgroundColor: "rgba(32,24,10,0.32)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  officialStarterTopicText: {
    color: "#FFE6A6",
    fontSize: 10.5,
    fontWeight: "900",
  },
  searchShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  searchLabel: {
    color: "#8E9BB2",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  searchInput: {
    flex: 1,
    color: "#F7FBFF",
    fontSize: 13,
    fontWeight: "600",
    paddingVertical: 0,
  },
  kicker: {
    color: "#8894AB",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.15,
  },
  title: {
    color: "#F8FBFF",
    fontSize: 28,
    fontWeight: "900",
  },
  body: {
    color: "#B9C5D9",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  threadCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 14,
  },
  threadCardUnread: {
    borderColor: "rgba(243,75,116,0.26)",
    backgroundColor: "rgba(243,75,116,0.08)",
  },
  threadCardOfficial: {
    borderColor: "rgba(242,194,91,0.24)",
    backgroundColor: "rgba(96,72,20,0.16)",
  },
  threadCardLive: {
    borderColor: "rgba(243,75,116,0.3)",
  },
  avatarButton: {
    borderRadius: 26,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(243,75,116,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  avatarText: {
    color: "#FFF5F8",
    fontSize: 20,
    fontWeight: "900",
  },
  threadCopy: {
    flex: 1,
    gap: 6,
  },
  threadTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  threadTitleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  threadTitle: {
    color: "#F7FBFF",
    fontSize: 16,
    fontWeight: "900",
  },
  threadOfficialPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(242,194,91,0.38)",
    backgroundColor: "rgba(242,194,91,0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  threadOfficialPillText: {
    color: "#FFE6A6",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.7,
  },
  threadTime: {
    color: "#93A1B7",
    fontSize: 11,
    fontWeight: "700",
  },
  threadPreview: {
    color: "#BBC7DA",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  threadMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  threadKindPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(6,10,18,0.28)",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  threadKindPillOfficial: {
    borderColor: "rgba(242,194,91,0.32)",
    backgroundColor: "rgba(242,194,91,0.12)",
  },
  threadKindPillText: {
    color: "#DFE8F7",
    fontSize: 10,
    fontWeight: "900",
  },
  threadKindPillTextOfficial: {
    color: "#FFE6A6",
  },
  identityPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(120, 225, 180, 0.18)",
    backgroundColor: "rgba(120, 225, 180, 0.09)",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  identityPillUnread: {
    borderColor: "rgba(243,75,116,0.3)",
    backgroundColor: "rgba(243,75,116,0.12)",
  },
  identityDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: "#7AE2B7",
  },
  identityDotUnread: {
    backgroundColor: "#F34B74",
  },
  identityPillText: {
    color: "#D9F8EA",
    fontSize: 10,
    fontWeight: "900",
  },
  identityPillTextUnread: {
    color: "#FFD6E1",
  },
  friendHintPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(182, 202, 255, 0.18)",
    backgroundColor: "rgba(182, 202, 255, 0.08)",
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  friendHintPillText: {
    color: "#DCE6FF",
    fontSize: 10,
    fontWeight: "900",
  },
  threadTagline: {
    flex: 1,
    color: "#90A0B9",
    fontSize: 11,
    fontWeight: "700",
  },
  threadRouteHint: {
    color: "#91A1BA",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  callPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "rgba(243,75,116,0.16)",
    borderWidth: 1,
    borderColor: "rgba(243,75,116,0.35)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  callPillText: {
    color: "#FFD8E2",
    fontSize: 11,
    fontWeight: "900",
  },
  unreadBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#F34B74",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  unreadText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  quickActionCard: {
    gap: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(243,75,116,0.28)",
    backgroundColor: "rgba(243,75,116,0.1)",
    padding: 16,
  },
  quickActionKicker: {
    color: "#FFB8C8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  quickActionTitle: {
    color: "#FFF5F8",
    fontSize: 18,
    fontWeight: "900",
  },
  quickActionBody: {
    color: "#FFD8E2",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  quickActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  quickActionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(6,10,18,0.35)",
    paddingVertical: 11,
    paddingHorizontal: 10,
  },
  quickActionButtonText: {
    color: "#FFF4F8",
    fontSize: 12,
    fontWeight: "900",
  },
  quickActionAccentButton: {
    backgroundColor: "#F34B74",
    borderColor: "rgba(243,75,116,0.7)",
  },
  quickActionAccentButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  emptyCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 18,
    gap: 8,
    marginTop: 12,
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
  stateText: {
    color: "#CBD5E7",
    fontSize: 13,
    fontWeight: "700",
  },
  errorText: {
    color: "#FFB3C3",
    fontSize: 12,
    fontWeight: "700",
  },
});
