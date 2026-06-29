import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { trackEvent } from "../../_lib/analytics";
import {
  getOrCreateDirectThread,
  hideChatThreadFromInbox,
  listChatThreads,
  subscribeToInbox,
  type ChatCallType,
  type ChatThreadSummary,
} from "../../_lib/chat";
import { searchPublicPeople, type PublicPeopleSearchResult } from "../../_lib/publicPeopleSearch";
import { readActiveFriendUserIds } from "../../_lib/friendGraph";
import { getOfficialPlatformAccount } from "../../_lib/officialAccounts";
import {
  matchesPeopleSearchValues,
  normalizePeopleSearchQuery,
  PEOPLE_SEARCH_NO_RESULTS_COPY,
} from "../../_lib/peopleSearchNormalization";
import { useSession } from "../../_lib/session";
import { formatUsernameHandle } from "../../_lib/usernameHandles";

type InboxErrorState = {
  message: string;
};

const CHAT_SUGGESTION_MIN_LENGTH = 2;
const CHAT_SUGGESTION_DEBOUNCE_MS = 300;
const CHAT_THREAD_PREVIEW_LIMIT = 4;

function buildThreadMap(items: ChatThreadSummary[]) {
  const map = new Map<string, ChatThreadSummary>();
  for (const item of items) {
    const userId = item.otherMember?.userId;
    if (userId) {
      map.set(userId, item);
    }
  }
  return map;
}

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
  return getOfficialPlatformAccount(thread.otherMember?.userId) ? "Official" : "Direct thread";
}

function matchesSearch(thread: ChatThreadSummary, rawQuery: string) {
  return matchesPeopleSearchValues([
    thread.otherMember?.displayName,
    thread.otherMember?.username,
    thread.otherMember?.tagline,
    thread.lastMessagePreview,
    thread.activeCallType,
  ], rawQuery);
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
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [searchPeopleLoading, setSearchPeopleLoading] = useState(false);
  const [searchPeopleError, setSearchPeopleError] = useState<string | null>(null);
  const [searchPeopleResults, setSearchPeopleResults] = useState<PublicPeopleSearchResult[]>([]);
  const [startingChatUserId, setStartingChatUserId] = useState("");
  const [quickActionThreadId, setQuickActionThreadId] = useState("");
  const [activeFriendUserIds, setActiveFriendUserIds] = useState<string[]>([]);
  const [areThreadsExpanded, setAreThreadsExpanded] = useState(false);

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
      setThreads(nextThreads.filter((thread) => !getOfficialPlatformAccount(thread.otherMember?.userId)));
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

  const shouldCollapseThreads = !searchQuery.trim() && filteredThreads.length > CHAT_THREAD_PREVIEW_LIMIT;
  const visibleThreads = useMemo(
    () => shouldCollapseThreads && !areThreadsExpanded
      ? filteredThreads.slice(0, CHAT_THREAD_PREVIEW_LIMIT)
      : filteredThreads,
    [filteredThreads, shouldCollapseThreads, areThreadsExpanded],
  );

  useEffect(() => {
    if (searchQuery.trim()) {
      setAreThreadsExpanded(false);
      return;
    }

    if (!shouldCollapseThreads) {
      setAreThreadsExpanded(false);
    }
  }, [searchQuery, shouldCollapseThreads]);

  const threadByOtherUserId = useMemo(
    () => buildThreadMap(threads),
    [threads],
  );

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, CHAT_SUGGESTION_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    const search = normalizePeopleSearchQuery(debouncedSearchQuery);
    const query = search.cleaned;
    if (!search.searchable || search.candidates.every((candidate) => candidate.length < CHAT_SUGGESTION_MIN_LENGTH)) {
      setSearchPeopleLoading(false);
      setSearchPeopleError(null);
      setSearchPeopleResults([]);
      return;
    }

    let active = true;
    setSearchPeopleLoading(true);
    setSearchPeopleError(null);

    const timeout = setTimeout(() => {
      searchPublicPeople(query, { limit: 6 })
        .then((results) => {
          if (!active) return;
          const filtered = results
            .filter((person) => person.userId !== "")
            .filter((person) => (person.userId ? !threadByOtherUserId.has(person.userId) : true));
          setSearchPeopleResults(filtered);
        })
        .catch(() => {
          if (!active) return;
          setSearchPeopleResults([]);
          setSearchPeopleError("People search is unavailable right now.");
        })
        .finally(() => {
          if (active) setSearchPeopleLoading(false);
        });
    }, 120);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [debouncedSearchQuery, threadByOtherUserId]);

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

  const confirmHideThread = useCallback((thread: ChatThreadSummary) => {
    if (thread.activeCommunicationRoomId) {
      Alert.alert(
        "Call active in this thread",
        "Finish or leave the active call before removing this conversation from your inbox.",
      );
      return;
    }

    Alert.alert(
      "Delete from my inbox",
      "This removes the conversation from your inbox. It does not delete it for the other person.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete from my inbox",
          style: "destructive",
          onPress: () => {
            setQuickActionThreadId("");
            setThreads((current) => current.filter((item) => item.threadId !== thread.threadId));
            void hideChatThreadFromInbox(thread.threadId)
              .then(() => {
                trackEvent("chat_thread_hidden_from_inbox", {
                  surface: "chat-inbox",
                  threadId: thread.threadId,
                });
                void loadThreads(true);
              })
              .catch((hideError) => {
                setThreads((current) => current.some((item) => item.threadId === thread.threadId) ? current : [thread, ...current]);
                Alert.alert(
                  "Couldn't remove conversation",
                  hideError instanceof Error
                    ? hideError.message
                    : "Couldn't remove this conversation right now. Please try again.",
                );
              });
          },
        },
      ],
    );
  }, [loadThreads]);

  const openProfileByPerson = useCallback((person: PublicPeopleSearchResult) => {
    const officialAccount = getOfficialPlatformAccount(person.userId);
    const avatarUrl = officialAccount ? undefined : person.avatarUrl;

    router.push({
      pathname: "/profile/[userId]",
      params: {
        userId: person.userId,
        displayName: officialAccount?.displayName ?? person.displayName,
        avatarUrl,
        tagline: person.shortBio,
      },
    });
  }, [router]);

  const openDirectThreadForPerson = useCallback(async (
    person: PublicPeopleSearchResult,
    startCall?: ChatCallType,
  ) => {
    const officialAccount = getOfficialPlatformAccount(person.userId);
    if (officialAccount || person.isOfficial) {
      openProfileByPerson(person);
      return;
    }

    const existingThread = threadByOtherUserId.get(person.userId);
    if (existingThread) {
      openThread(existingThread, startCall);
      return;
    }

    setStartingChatUserId(person.userId);
    setSearchPeopleError(null);
    try {
      const thread = await getOrCreateDirectThread({
        userId: person.userId,
        displayName: person.displayName,
        avatarUrl: person.avatarUrl,
        tagline: person.shortBio,
      });
      trackEvent("chat_inbox_start_chat_created", {
        surface: "chat-inbox-search",
        targetUserId: person.userId,
        entryMode: startCall ?? "thread",
      });
      setSearchQuery("");
      setSearchPeopleResults([]);
      openThread(thread, startCall);
    } catch (threadError) {
      const message = threadError instanceof Error
        ? threadError.message
        : "Unable to open Chi'lly Chat with this person right now.";
      setSearchPeopleError(message);
    } finally {
      setStartingChatUserId("");
    }
  }, [openProfileByPerson, openThread, threadByOtherUserId]);

  const openSearchSuggestion = useCallback((person: PublicPeopleSearchResult) => {
    const thread = threadByOtherUserId.get(person.userId);
    if (thread) {
      openThread(thread);
      return;
    }

    void openDirectThreadForPerson(person);
  }, [openDirectThreadForPerson, openThread, threadByOtherUserId]);

  const openSearchSuggestionCall = useCallback((person: PublicPeopleSearchResult, mode: ChatCallType) => {
    void openDirectThreadForPerson(person, mode);
  }, [openDirectThreadForPerson]);

  const renderPeopleSuggestionRows = () => {
    const search = normalizePeopleSearchQuery(debouncedSearchQuery);
    if (!search.searchable || search.candidates.every((candidate) => candidate.length < CHAT_SUGGESTION_MIN_LENGTH)) {
      return null;
    }
    const hasMatchingThreadResults = filteredThreads.length > 0;

    return (
      <View style={styles.suggestionPanel}>
        <Text style={styles.suggestionPanelTitle}>People</Text>
        {searchPeopleLoading ? (
          <View style={styles.suggestionPanelState}>
            <ActivityIndicator color="#F34B74" size="small" />
            <Text style={styles.suggestionPanelText}>Searching people…</Text>
          </View>
        ) : searchPeopleError ? (
          <View style={styles.suggestionPanelState}>
            <Text style={styles.suggestionPanelText}>{searchPeopleError}</Text>
          </View>
        ) : searchPeopleResults.length ? (
          <View style={styles.suggestionPanelList}>
            {searchPeopleResults.slice(0, 5).map((person, index) => {
              const initial = person.displayName.slice(0, 1).toUpperCase();
              const hasAvatar = Boolean(person.avatarUrl);
              const officialAccount = getOfficialPlatformAccount(person.userId);
              const callsAvailable = !officialAccount && !person.isOfficial;
              const isOpening = startingChatUserId === person.userId;
              return (
                <View
                  key={person.userId}
                  style={styles.suggestionResultCard}
                >
                  <TouchableOpacity
                    testID={`chat-search-suggestion-row-${index}`}
                    activeOpacity={0.86}
                    style={styles.suggestionRow}
                    disabled={isOpening}
                    onPress={() => openSearchSuggestion(person)}
                  >
                    <View style={styles.suggestionAvatar}>
                      {hasAvatar ? (
                        <Image source={{ uri: person.avatarUrl as string }} style={styles.suggestionAvatarImage} />
                      ) : (
                        <Text style={styles.suggestionAvatarText}>{initial}</Text>
                      )}
                    </View>
                    <View style={styles.suggestionCopy}>
                      <Text style={styles.suggestionName} numberOfLines={1}>{person.displayName}</Text>
                      <Text style={styles.suggestionMeta} numberOfLines={1}>
                        {person.username ? `@${person.username}` : "Visible profile result"}
                      </Text>
                    </View>
                    <Text style={styles.suggestionAction}>{isOpening ? "Opening..." : callsAvailable ? "Chat" : "Profile"}</Text>
                  </TouchableOpacity>
                  {callsAvailable ? (
                    <View style={styles.suggestionActionRow}>
                      <TouchableOpacity
                        testID={`chat-search-suggestion-chat-${index}`}
                        activeOpacity={0.84}
                        disabled={isOpening}
                        style={[styles.suggestionActionButton, isOpening && styles.suggestionActionButtonDisabled]}
                        onPress={() => openSearchSuggestion(person)}
                      >
                        <Text style={styles.suggestionActionButtonText}>Chi'lly Chat</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`chat-search-suggestion-voice-${index}`}
                        activeOpacity={0.84}
                        disabled={isOpening}
                        style={[styles.suggestionActionButton, styles.suggestionActionButtonAccent, isOpening && styles.suggestionActionButtonDisabled]}
                        onPress={() => openSearchSuggestionCall(person, "voice")}
                      >
                        <Text style={styles.suggestionActionButtonAccentText}>Voice Call</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        testID={`chat-search-suggestion-video-${index}`}
                        activeOpacity={0.84}
                        disabled={isOpening}
                        style={[styles.suggestionActionButton, styles.suggestionActionButtonAccent, isOpening && styles.suggestionActionButtonDisabled]}
                        onPress={() => openSearchSuggestionCall(person, "video")}
                      >
                        <Text style={styles.suggestionActionButtonAccentText}>Video Call</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View style={styles.suggestionPanelState}>
            <Text style={styles.suggestionPanelText}>
              {hasMatchingThreadResults ? "Already in your threads" : "No matching people"}
            </Text>
            <Text style={styles.suggestionSubtext}>
              {hasMatchingThreadResults
                ? "Open the matching thread below."
                : PEOPLE_SEARCH_NO_RESULTS_COPY}
            </Text>
          </View>
        )}
      </View>
    );
  };

  const listHeader = useMemo(() => (
    <View style={styles.header}>
      <Text style={styles.kicker}>CHI'LLY CHAT</Text>
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
      {error ? (
        <View style={styles.headerErrorCard}>
          <View style={styles.headerErrorCopy}>
            <Text style={styles.headerErrorTitle}>Inbox needs another try</Text>
            <Text style={styles.headerErrorBody}>{error.message}</Text>
          </View>
          <TouchableOpacity
            style={styles.headerErrorAction}
            activeOpacity={0.86}
            onPress={() => {
              void loadThreads(true);
            }}
          >
            <Text style={styles.headerErrorActionText}>Refresh Inbox</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <Text style={styles.headerHint}>Tap an avatar for profile. Long-press a thread for profile, call, and inbox actions.</Text>
      {quickActionThread ? (
        <View style={styles.quickActionCard}>
          <Text style={styles.quickActionKicker}>THREAD SHORTCUTS</Text>
          <Text style={styles.quickActionTitle}>
            {quickActionThread.otherMember?.displayName ?? "Chi'lly Chat Thread"}
          </Text>
          <Text style={styles.quickActionBody}>
            Open the thread, jump to the profile, start voice/video, or remove this conversation from your inbox only.
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
          <TouchableOpacity
            style={[styles.quickActionButton, styles.quickActionDeleteButton]}
            activeOpacity={0.86}
            onPress={() => confirmHideThread(quickActionThread)}
          >
            <Text style={styles.quickActionDeleteButtonText}>Delete from my inbox</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.searchShell}>
        <Text style={styles.searchLabel}>Search</Text>
        <TextInput
          testID="chat-search-input"
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
        {searchQuery.trim() ? (
          <TouchableOpacity
            testID="chat-search-clear-button"
            accessibilityLabel="Clear Chi'lly Chat search"
            activeOpacity={0.86}
            onPress={() => setSearchQuery("")}
            style={styles.searchClearButton}
          >
            <Text style={styles.searchClearButtonText}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {renderPeopleSuggestionRows()}
      {filteredThreads.length ? (
        <View style={styles.threadSectionHeader}>
          <View>
            <Text style={styles.threadSectionTitle}>Threads</Text>
            <Text style={styles.threadSectionMeta}>
              {shouldCollapseThreads && !areThreadsExpanded
                ? `Showing ${visibleThreads.length} of ${filteredThreads.length}`
                : `${filteredThreads.length} visible`}
            </Text>
          </View>
          {shouldCollapseThreads ? (
            <TouchableOpacity
              testID="chat-thread-list-header-collapse-toggle"
              activeOpacity={0.84}
              onPress={() => setAreThreadsExpanded((next) => !next)}
              style={styles.threadSectionToggle}
            >
              <Text style={styles.threadSectionToggleText}>
                {areThreadsExpanded ? "Collapse" : "Show all"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  ), [
    areThreadsExpanded,
    error,
    filteredThreads.length,
    liveCallCount,
    loadThreads,
    confirmHideThread,
    openProfile,
    openThread,
    openSearchSuggestion,
    openSearchSuggestionCall,
    quickActionThread,
    searchQuery,
    debouncedSearchQuery,
    searchPeopleError,
    searchPeopleLoading,
    searchPeopleResults,
    shouldCollapseThreads,
    startingChatUserId,
    threads.length,
    unreadThreadCount,
    visibleThreads.length,
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
          <Text style={styles.emptyTitle}>Sign in to open Chi'lly Chat</Text>
          <Text style={styles.emptyBody}>
            Chi'lly Chat inbox, direct threads, voice, and video only open on a signed-in Chi'llywood identity.
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
        data={visibleThreads}
        keyExtractor={(item) => item.threadId}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void loadThreads(true)} tintColor="#F34B74" />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={(
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>{searchQuery.trim() ? "No matching threads" : "No Chi'lly Chat threads yet"}</Text>
            <Text style={styles.emptyBody}>
              {searchQuery.trim()
                ? "Try another name, handle, or clear your search."
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
          const preview = buildPreview(item);
          const identityLabel = getIdentityLabel(item);
          const threadKindLabel = getThreadKindLabel(item);
          const displayName = officialAccount?.displayName ?? other?.displayName ?? "Chi'lly Chat Thread";
          const memberHandle = officialAccount?.handle ?? formatUsernameHandle(other?.username);
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
                    {memberHandle ? (
                      <Text style={styles.threadHandle} testID="chat-inbox-thread-handle">
                        {memberHandle}
                      </Text>
                    ) : null}
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
                      <Text style={styles.friendHintPillText}>{"Chi'lly Circle"}</Text>
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
                <Text style={styles.threadPreview} numberOfLines={1}>{preview}</Text>
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
        ListFooterComponent={shouldCollapseThreads ? (
          <TouchableOpacity
            testID="chat-thread-list-collapse-toggle"
            activeOpacity={0.84}
            onPress={() => setAreThreadsExpanded((next) => !next)}
            style={styles.expandCollapseButton}
          >
            <Text style={styles.expandCollapseButtonText}>
              {areThreadsExpanded ? "Show fewer threads" : `Show ${filteredThreads.length - CHAT_THREAD_PREVIEW_LIMIT} more threads`}
            </Text>
          </TouchableOpacity>
        ) : null}
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
    paddingBottom: 38,
    gap: 8,
  },
  header: {
    gap: 9,
    paddingBottom: 18,
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
    gap: 9,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(168,192,245,0.14)",
    backgroundColor: "rgba(255,255,255,0.055)",
    padding: 17,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
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
  searchShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.055)",
    paddingHorizontal: 10,
    paddingVertical: 7,
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
  searchClearButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  searchClearButtonText: {
    color: "#EAF0FF",
    fontSize: 11,
    fontWeight: "900",
  },
  suggestionPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 7,
    marginTop: 6,
    gap: 7,
  },
  suggestionPanelTitle: {
    color: "#E7EEFA",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    textTransform: "uppercase",
  },
  suggestionPanelState: {
    gap: 4,
    paddingVertical: 4,
  },
  suggestionPanelText: {
    color: "#D7E1F4",
    fontSize: 12.5,
    fontWeight: "800",
  },
  suggestionSubtext: {
    color: "#AAB5C7",
    fontSize: 11,
    fontWeight: "700",
  },
  suggestionPanelList: {
    gap: 8,
  },
  suggestionResultCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.035)",
    padding: 7,
    gap: 7,
  },
  suggestionRow: {
    borderRadius: 10,
    paddingHorizontal: 2,
    paddingVertical: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 46,
  },
  suggestionAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(243,75,116,0.26)",
  },
  suggestionAvatarText: {
    color: "#F7FBFF",
    fontSize: 12,
    fontWeight: "900",
  },
  suggestionAvatarImage: {
    width: "100%",
    height: "100%",
    borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  suggestionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  suggestionName: {
    color: "#F4F8FF",
    fontSize: 12.5,
    fontWeight: "900",
  },
  suggestionMeta: {
    color: "#9FB0CA",
    fontSize: 11,
    fontWeight: "700",
  },
  suggestionAction: {
    color: "#EAF0FF",
    fontSize: 10.5,
    fontWeight: "900",
  },
  suggestionActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  suggestionActionButton: {
    minHeight: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 7,
    justifyContent: "center",
  },
  suggestionActionButtonAccent: {
    borderColor: "rgba(169,246,210,0.26)",
    backgroundColor: "rgba(169,246,210,0.1)",
  },
  suggestionActionButtonDisabled: {
    opacity: 0.55,
  },
  suggestionActionButtonText: {
    color: "#EAF0FF",
    fontSize: 10.5,
    fontWeight: "900",
  },
  suggestionActionButtonAccentText: {
    color: "#A9F6D2",
    fontSize: 10.5,
    fontWeight: "900",
  },
  threadSectionHeader: {
    marginTop: 4,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.035)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  threadSectionTitle: {
    color: "#F7FAFF",
    fontSize: 14,
    fontWeight: "900",
  },
  threadSectionMeta: {
    color: "#91A0B8",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  threadSectionToggle: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  threadSectionToggleText: {
    color: "#EAF0FF",
    fontSize: 11,
    fontWeight: "900",
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
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 8,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
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
    borderRadius: 20,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(243,75,116,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  avatarText: {
    color: "#FFF5F8",
    fontSize: 14.5,
    fontWeight: "900",
  },
  threadCopy: {
    flex: 1,
    gap: 4,
  },
  threadTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
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
    fontSize: 14.5,
    fontWeight: "900",
  },
  threadHandle: {
    color: "#9FB0CA",
    fontSize: 12,
    fontWeight: "800",
    flexShrink: 1,
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
    fontSize: 10.5,
    fontWeight: "700",
  },
  threadPreview: {
    color: "#BBC7DA",
    fontSize: 11.5,
    lineHeight: 15,
    fontWeight: "600",
  },
  threadMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
  },
  threadKindPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(6,10,18,0.28)",
    paddingHorizontal: 8,
    paddingVertical: 3,
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
    paddingHorizontal: 8,
    paddingVertical: 3,
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
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  friendHintPillText: {
    color: "#DCE6FF",
    fontSize: 10,
    fontWeight: "900",
  },
  threadTagline: {
    flex: 1,
    color: "#90A0B9",
    fontSize: 10,
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
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  callPillText: {
    color: "#FFD8E2",
    fontSize: 10,
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
    fontSize: 11,
    fontWeight: "900",
  },
  quickActionCard: {
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(243,75,116,0.28)",
    backgroundColor: "rgba(243,75,116,0.1)",
    padding: 12,
  },
  quickActionKicker: {
    color: "#FFB8C8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  quickActionTitle: {
    color: "#FFF5F8",
    fontSize: 16,
    fontWeight: "900",
  },
  quickActionBody: {
    color: "#FFD8E2",
    fontSize: 11.5,
    lineHeight: 17,
    fontWeight: "600",
  },
  quickActionRow: {
    flexDirection: "row",
    gap: 8,
  },
  quickActionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(6,10,18,0.35)",
    paddingVertical: 7,
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
  quickActionDeleteButton: {
    backgroundColor: "rgba(255,255,255,0.03)",
    borderColor: "rgba(255,184,200,0.34)",
  },
  quickActionDeleteButtonText: {
    color: "#FFD8E2",
    fontSize: 12,
    fontWeight: "900",
  },
  expandCollapseButton: {
    marginTop: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignSelf: "flex-start",
  },
  expandCollapseButtonText: {
    color: "#EAF0FF",
    fontSize: 11,
    fontWeight: "900",
  },
  emptyCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 10,
    gap: 8,
    marginTop: 10,
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
