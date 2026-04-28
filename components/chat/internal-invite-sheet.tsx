import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { sendDirectInviteMessage, searchChatPeople, type ChatThreadSummary, type ChatUserSearchResult } from "../../_lib/chat";

const logInviteDebug = (..._args: unknown[]) => {};

type InternalInviteSheetProps = {
  visible: boolean;
  sourceSurface?: string;
  title: string;
  body: string;
  inviteMessage: string;
  suggestedTargets?: ChatUserSearchResult[];
  onClose: () => void;
  onInviteSent?: (thread: ChatThreadSummary) => void;
  onSystemShareFallback?: () => void;
};

const normalizeInviteSearchText = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/^@+/, "");

const matchesSuggestedTarget = (target: ChatUserSearchResult, rawQuery: string) => {
  const normalizedQuery = normalizeInviteSearchText(rawQuery);
  if (normalizedQuery.length < 2) return false;
  return [target.displayName, target.username, target.tagline, target.userId].some((value) =>
    normalizeInviteSearchText(value).includes(normalizedQuery),
  );
};

const mergeInviteTargets = (
  priorityTargets: ChatUserSearchResult[],
  secondaryTargets: ChatUserSearchResult[],
): ChatUserSearchResult[] => {
  const merged = new Map<string, ChatUserSearchResult>();

  priorityTargets.forEach((target) => {
    const userId = String(target.userId ?? "").trim();
    if (!userId) return;
    merged.set(userId, {
      ...target,
      userId,
    });
  });

  secondaryTargets.forEach((target) => {
    const userId = String(target.userId ?? "").trim();
    if (!userId) return;
    const existing = merged.get(userId);
    merged.set(userId, {
      userId,
      displayName: existing?.displayName ?? target.displayName,
      username: existing?.username ?? target.username,
      avatarUrl: existing?.avatarUrl ?? target.avatarUrl ?? null,
      tagline: existing?.tagline ?? target.tagline ?? null,
    });
  });

  return Array.from(merged.values());
};

export function InternalInviteSheet({
  visible,
  sourceSurface = "unknown",
  title,
  body,
  inviteMessage,
  suggestedTargets = [],
  onClose,
  onInviteSent,
  onSystemShareFallback,
}: InternalInviteSheetProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChatUserSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [sendingUserId, setSendingUserId] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible && __DEV__) {
      logInviteDebug("[CH_INVITE]", "sheet_opened", {
        sourceSurface,
        title,
      });
    }
    if (!visible) {
      setQuery("");
      setResults([]);
      setLoading(false);
      setSendingUserId("");
      setError(null);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const trimmed = query.trim();
    if (__DEV__) {
      logInviteDebug("[CH_SEARCH]", "query_changed", {
        sourceSurface,
        query: trimmed,
      });
    }
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const timeout = setTimeout(() => {
      searchChatPeople(trimmed)
        .then((nextResults) => {
          if (!cancelled) {
            if (__DEV__) {
              logInviteDebug("[CH_SEARCH]", "sheet_results_loaded", {
                sourceSurface,
                query: trimmed,
                resultCount: nextResults.length,
                results: nextResults.slice(0, 5).map((person) => ({
                  userId: person.userId,
                  username: person.username ?? "",
                  displayName: person.displayName ?? "",
                })),
              });
            }
            setResults(nextResults);
          }
        })
        .catch((searchError: any) => {
          if (!cancelled) {
            if (__DEV__) {
              logInviteDebug("[CH_SEARCH]", "sheet_results_failed", {
                sourceSurface,
                query: trimmed,
                message: searchError?.message ?? "unknown_error",
              });
            }
            setError(searchError?.message ?? "Unable to search Chi'llywood people right now.");
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }, 160);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [query, visible]);

  const emptyText = useMemo(() => {
    if (query.trim().length < 2) return "Type at least 2 characters to find a Chi'llywood member.";
    if (loading) return "Searching Chi'llywood people...";
    return "No matching Chi'llywood members found yet.";
  }, [loading, query]);

  const matchedSuggestedTargets = useMemo(
    () => suggestedTargets.filter((target) => matchesSuggestedTarget(target, query)),
    [query, suggestedTargets],
  );

  const displayResults = useMemo(
    () => mergeInviteTargets(matchedSuggestedTargets, results),
    [matchedSuggestedTargets, results],
  );

  const visibleError = displayResults.length > 0 ? null : error;

  const handleSendInvite = useCallback(async (target: ChatUserSearchResult) => {
    setSendingUserId(target.userId);
    setError(null);
    try {
      if (__DEV__) {
        logInviteDebug("[CH_INVITE]", "target_selected", {
          sourceSurface,
          targetUserId: target.userId,
          username: target.username ?? "",
          displayName: target.displayName ?? "",
        });
      }
      const outcome = await sendDirectInviteMessage(target, inviteMessage);
      if (__DEV__) {
        logInviteDebug("[CH_INVITE]", "thread_open_after_invite", {
          sourceSurface,
          targetUserId: target.userId,
          threadId: outcome.thread.threadId,
        });
      }
      onInviteSent?.(outcome.thread);
      onClose();
    } catch (inviteError: any) {
      if (__DEV__) {
        logInviteDebug("[CH_INVITE]", "send_failed", {
          sourceSurface,
          targetUserId: target.userId,
          message: inviteError?.message ?? "unknown_error",
        });
      }
      setError(inviteError?.message ?? "Unable to send this Chi'llywood invite right now.");
    } finally {
      setSendingUserId("");
    }
  }, [inviteMessage, onClose, onInviteSent]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <Text style={styles.kicker}>CHI&apos;LLYWOOD INVITE</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.searchShell}>
            <Text style={styles.searchLabel}>Find people</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search by name, username, or tagline"
              placeholderTextColor="#77839B"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <ScrollView style={styles.results} contentContainerStyle={styles.resultsContent} keyboardShouldPersistTaps="handled">
            {loading ? (
              <View style={styles.stateRow}>
                <ActivityIndicator color="#F34B74" size="small" />
                <Text style={styles.stateText}>Searching people...</Text>
              </View>
            ) : displayResults.length > 0 ? (
              displayResults.map((person) => {
                const initials = (person.displayName ?? person.username ?? "U").slice(0, 1).toUpperCase();
                const sending = sendingUserId === person.userId;

                return (
                  <TouchableOpacity
                    key={person.userId}
                    style={[styles.resultCard, sending && styles.resultCardBusy]}
                    activeOpacity={0.86}
                    onPress={() => void handleSendInvite(person)}
                    disabled={sending}
                  >
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>
                    <View style={styles.resultCopy}>
                      <Text style={styles.resultTitle}>{person.displayName ?? "Chi'llywood member"}</Text>
                      {person.username ? <Text style={styles.resultMeta}>@{person.username}</Text> : null}
                      {person.tagline ? <Text style={styles.resultBody} numberOfLines={2}>{person.tagline}</Text> : null}
                    </View>
                    <View style={styles.resultAction}>
                      {sending ? <ActivityIndicator color="#F7D6DD" size="small" /> : <Text style={styles.resultActionText}>Send</Text>}
                    </View>
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>{emptyText}</Text>
              </View>
            )}
          </ScrollView>
          {visibleError ? <Text style={styles.errorText}>{visibleError}</Text> : null}
          <View style={styles.footerRow}>
            {onSystemShareFallback ? (
              <TouchableOpacity
                style={[styles.footerButton, styles.footerButtonGhost]}
                activeOpacity={0.84}
                onPress={() => {
                  if (__DEV__) {
                    logInviteDebug("[CH_INVITE]", "system_share_fallback", {
                      sourceSurface,
                    });
                  }
                  onClose();
                  onSystemShareFallback();
                }}
              >
                <Text style={styles.footerButtonGhostText}>Use system share</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={styles.footerButton} activeOpacity={0.84} onPress={onClose}>
              <Text style={styles.footerButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(5,8,14,0.76)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  sheet: {
    backgroundColor: "#0B1320",
    borderWidth: 1,
    borderColor: "rgba(244,96,131,0.24)",
    borderRadius: 26,
    paddingHorizontal: 18,
    paddingVertical: 18,
    maxHeight: "82%",
    gap: 10,
  },
  kicker: { color: "#F490A8", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: "#F7F9FF", fontSize: 21, fontWeight: "900" },
  body: { color: "#BAC4D9", fontSize: 13, lineHeight: 19, fontWeight: "600" },
  searchShell: { gap: 6, marginTop: 4 },
  searchLabel: { color: "#8895AD", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  searchInput: {
    minHeight: 46,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(132,148,175,0.25)",
    backgroundColor: "rgba(14,22,35,0.92)",
    color: "#F6F8FD",
    paddingHorizontal: 14,
    fontSize: 14,
    fontWeight: "600",
  },
  results: { maxHeight: 280 },
  resultsContent: { gap: 10, paddingVertical: 4 },
  stateRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 18 },
  stateText: { color: "#B7C0D3", fontSize: 13, fontWeight: "600" },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(137,153,179,0.18)",
    backgroundColor: "rgba(16,24,37,0.94)",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  resultCardBusy: { opacity: 0.8 },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(243,75,116,0.18)",
    borderWidth: 1,
    borderColor: "rgba(243,75,116,0.36)",
  },
  avatarText: { color: "#F8D9E1", fontSize: 16, fontWeight: "900" },
  resultCopy: { flex: 1, gap: 2 },
  resultTitle: { color: "#F5F8FF", fontSize: 14, fontWeight: "800" },
  resultMeta: { color: "#9EB0CC", fontSize: 12, fontWeight: "700" },
  resultBody: { color: "#BAC6DB", fontSize: 12, lineHeight: 16, fontWeight: "600" },
  resultAction: {
    minWidth: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: "rgba(243,75,116,0.16)",
  },
  resultActionText: { color: "#F8D6DE", fontSize: 12, fontWeight: "800" },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(127,143,168,0.18)",
    backgroundColor: "rgba(13,19,30,0.92)",
    paddingHorizontal: 14,
    paddingVertical: 16,
  },
  emptyText: { color: "#AEB9CF", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  errorText: { color: "#FF9AB0", fontSize: 12, lineHeight: 17, fontWeight: "700" },
  footerRow: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 4 },
  footerButton: {
    minHeight: 42,
    borderRadius: 14,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F34B74",
  },
  footerButtonGhost: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(161,175,199,0.24)",
  },
  footerButtonText: { color: "#FFF5F7", fontSize: 12, fontWeight: "800" },
  footerButtonGhostText: { color: "#D6DDED", fontSize: 12, fontWeight: "800" },
});
