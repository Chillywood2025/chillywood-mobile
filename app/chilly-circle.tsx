import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  acceptChillyCircleRequest,
  cancelChillyCircleRequest,
  declineChillyCircleRequest,
  listIncomingChillyCircleRequests,
  listMyChillyCircle,
  listOutgoingChillyCircleRequests,
  removeFromChillyCircle,
  type ChillyCircleListItem,
} from "../_lib/friendGraph";
import { RACHI_OFFICIAL_ACCOUNT } from "../_lib/officialAccounts";
import {
  getPrimaryPeopleSearchCandidate,
  matchesPeopleSearchValues,
  normalizePeopleSearchQuery,
  PEOPLE_SEARCH_NO_RESULTS_COPY,
} from "../_lib/peopleSearchNormalization";
import { searchPublicPeople, type PublicPeopleSearchResult } from "../_lib/publicPeopleSearch";
import { useSession } from "../_lib/session";

type CircleAction = "accept" | "decline" | "cancel" | "remove";

const CHILLY_CIRCLE_SEARCH_DEBOUNCE_MS = 280;
const CHILLY_CIRCLE_SUGGESTION_MIN_LENGTH = 2;
const CHILLY_CIRCLE_SUGGESTION_DEBOUNCE_MS = 260;
const CHILLY_CIRCLE_LOCAL_SEARCH_MIN_LENGTH = 1;
const CHILLY_CIRCLE_MAX_LOCAL_RESULTS = 4;
const CHILLY_CIRCLE_MAX_PEOPLE_RESULTS = 5;

type ChillyCircleSuggestion = {
  id: string;
  kind: "circle" | "incoming" | "outgoing" | "people" | "official";
  title: string;
  subtitle: string;
  avatarUrl: string | null;
  onPress: () => void;
};

type CircleSectionKey = "circle" | "incoming" | "outgoing";

const CIRCLE_SECTION_COLLAPSE_THRESHOLD = 6;

const normalizeCircleSearchNeedle = (value: string) => getPrimaryPeopleSearchCandidate(value);

const matchesCircleItem = (item: ChillyCircleListItem, needle: string) => {
  if (!needle) return true;
  return matchesPeopleSearchValues([
    item.displayName,
    item.handle,
    item.tagline,
    item.relationshipStatus,
  ], needle);
};

const formatUpdatedAt = (value: string) => {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "Recently";
  return parsed.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  });
};

const normalizeCircleError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "Unable to update Chi'lly Circle right now.";
  return message
    .replace(/friendship/gi, "Chi'lly Circle")
    .replace(/friends/gi, "Chi'lly Circle")
    .replace(/friend/gi, "Chi'lly Circle");
};

const includesNeedle = (value: unknown, needle: string) => {
  return matchesPeopleSearchValues([value], needle);
};

export default function ChillyCircleScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isLoading: sessionLoading, isSignedIn } = useSession();
  const [circle, setCircle] = useState<ChillyCircleListItem[]>([]);
  const [incoming, setIncoming] = useState<ChillyCircleListItem[]>([]);
  const [outgoing, setOutgoing] = useState<ChillyCircleListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [peopleError, setPeopleError] = useState<string | null>(null);
  const [peopleResults, setPeopleResults] = useState<PublicPeopleSearchResult[]>([]);
  const [collapsedSections, setCollapsedSections] = useState<Partial<Record<CircleSectionKey, boolean>>>({});

  const normalizedNeedle = normalizeCircleSearchNeedle(debouncedSearchQuery);
  const hasSearchQuery = normalizedNeedle.length >= CHILLY_CIRCLE_LOCAL_SEARCH_MIN_LENGTH;

  const buildSuggestionRow = (
    kind: ChillyCircleSuggestion["kind"],
    id: string,
    title: string,
    subtitle: string,
    avatarUrl: string | null,
    onPress: () => void,
  ): ChillyCircleSuggestion => ({
    id,
    kind,
    title,
    subtitle,
    avatarUrl,
    onPress,
  });

  const openProfile = useCallback((userId: string) => {
    router.push({ pathname: "/profile/[userId]", params: { userId } });
  }, [router]);

  useEffect(() => {
    if (sessionLoading || isSignedIn) return;
    router.replace("/(auth)/login");
  }, [isSignedIn, router, sessionLoading]);

  const loadCircle = useCallback(async () => {
    if (!isSignedIn) return;

    setLoading(true);
    setNotice(null);
    try {
      const [nextCircle, nextIncoming, nextOutgoing] = await Promise.all([
        listMyChillyCircle({ limit: 100 }),
        listIncomingChillyCircleRequests({ limit: 100 }),
        listOutgoingChillyCircleRequests({ limit: 100 }),
      ]);
      setCircle(nextCircle);
      setIncoming(nextIncoming);
      setOutgoing(nextOutgoing);
    } catch (error) {
      setCircle([]);
      setIncoming([]);
      setOutgoing([]);
      setNotice(normalizeCircleError(error));
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  useEffect(() => {
    if (sessionLoading || !isSignedIn) return;
    void loadCircle();
  }, [isSignedIn, loadCircle, sessionLoading]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, CHILLY_CIRCLE_SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  useEffect(() => {
    const search = normalizePeopleSearchQuery(debouncedSearchQuery);
    const query = search.cleaned;
    if (!search.searchable || search.candidates.every((candidate) => candidate.length < CHILLY_CIRCLE_SUGGESTION_MIN_LENGTH)) {
      setPeopleLoading(false);
      setPeopleError(null);
      setPeopleResults([]);
      return;
    }

    let active = true;
    setPeopleLoading(true);
    setPeopleError(null);

    const timeout = setTimeout(() => {
      searchPublicPeople(query, { limit: 10 })
        .then((results) => {
          if (!active) return;
          const existingIds = new Set([...circle, ...incoming, ...outgoing].map((item) => item.id));
          setPeopleResults(results.filter((person) => !existingIds.has(person.userId)));
        })
        .catch(() => {
          if (!active) return;
          setPeopleResults([]);
          setPeopleError("People search is unavailable right now.");
        })
        .finally(() => {
          if (active) {
            setPeopleLoading(false);
          }
        });
    }, CHILLY_CIRCLE_SUGGESTION_DEBOUNCE_MS);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [debouncedSearchQuery, circle, incoming, outgoing]);

  const circleSearchResults = useMemo(
    () => circle.filter((item) => matchesCircleItem(item, normalizedNeedle)),
    [circle, normalizedNeedle],
  );
  const incomingSearchResults = useMemo(
    () => incoming.filter((item) => matchesCircleItem(item, normalizedNeedle)),
    [incoming, normalizedNeedle],
  );
  const outgoingSearchResults = useMemo(
    () => outgoing.filter((item) => matchesCircleItem(item, normalizedNeedle)),
    [outgoing, normalizedNeedle],
  );

  const isOfficialSuggestionMatch = useMemo(
    () => includesNeedle(RACHI_OFFICIAL_ACCOUNT.displayName, normalizedNeedle)
      || includesNeedle(RACHI_OFFICIAL_ACCOUNT.handle, normalizedNeedle),
    [normalizedNeedle],
  );

  const suggestionGroups = useMemo(() => {
    if (!hasSearchQuery) return [] as { label: string; kind: ChillyCircleSuggestion["kind"]; rows: ChillyCircleSuggestion[] }[];

    const next = [
      {
        label: "In your Chi'lly Circle",
        kind: "circle" as const,
        rows: circleSearchResults.slice(0, CHILLY_CIRCLE_MAX_LOCAL_RESULTS).map((item) => buildSuggestionRow(
          "circle",
          `circle-${item.id}`,
          item.displayName,
          item.tagline || `Updated ${formatUpdatedAt(item.relationshipUpdatedAt)}`,
          item.avatarUrl ?? null,
          () => openProfile(item.id),
        )),
      },
      {
        label: "Requests",
        kind: "incoming" as const,
        rows: incomingSearchResults.slice(0, CHILLY_CIRCLE_MAX_LOCAL_RESULTS).map((item) => buildSuggestionRow(
          "incoming",
          `incoming-${item.id}`,
          item.displayName,
          item.tagline || "Incoming request",
          item.avatarUrl ?? null,
          () => openProfile(item.id),
        )),
      },
      {
        label: "Requests",
        kind: "outgoing" as const,
        rows: outgoingSearchResults.slice(0, CHILLY_CIRCLE_MAX_LOCAL_RESULTS).map((item) => buildSuggestionRow(
          "outgoing",
          `outgoing-${item.id}`,
          item.displayName,
          item.tagline || "Sent request",
          item.avatarUrl ?? null,
          () => openProfile(item.id),
        )),
      },
      {
        label: "People",
        kind: "people" as const,
        rows: peopleResults.slice(0, CHILLY_CIRCLE_MAX_PEOPLE_RESULTS).map((person) => buildSuggestionRow(
          "people",
          person.userId,
          person.displayName,
          person.username ? `@${person.username}` : "Public profile",
          person.avatarUrl ?? null,
          () => openProfile(person.userId),
        )),
      },
      ...(isOfficialSuggestionMatch ? [{
        label: "Official",
        kind: "official" as const,
        rows: [
          buildSuggestionRow(
            "official",
            "official-rachi",
            RACHI_OFFICIAL_ACCOUNT.displayName,
            "Official Chi'llywood updates and Originals.",
            RACHI_OFFICIAL_ACCOUNT.avatarUrl ?? null,
            () => openProfile(RACHI_OFFICIAL_ACCOUNT.userId),
          ),
        ],
      }] : []),
    ];

    return next
      .map((group) => ({
        ...group,
        rows: group.rows.filter((row) => matchesPeopleSearchValues([row.title, row.subtitle], normalizedNeedle)),
      }))
      .filter((group) => group.rows.length > 0);
  }, [circleSearchResults, incomingSearchResults, outgoingSearchResults, hasSearchQuery, isOfficialSuggestionMatch, normalizedNeedle, openProfile, peopleResults]);

  const hasAnySuggestions = suggestionGroups.some((group) => group.rows.length > 0);

  const resolveSectionCollapsed = (key: CircleSectionKey, itemCount: number) => {
    if (hasSearchQuery) return false;
    if (typeof collapsedSections[key] === "boolean") {
      return collapsedSections[key]!;
    }
    return itemCount > CIRCLE_SECTION_COLLAPSE_THRESHOLD;
  };

  const toggleSectionCollapsed = (key: CircleSectionKey) => {
    setCollapsedSections((prev) => {
      const currentlyCollapsed = resolveSectionCollapsed(key, 0);
      return {
        ...prev,
        [key]: !currentlyCollapsed,
      };
    });
  };

  const runAction = useCallback(async (action: CircleAction, userId: string) => {
    const key = `${action}:${userId}`;
    if (busyKey) return;

    setBusyKey(key);
    setNotice(null);
    try {
      if (action === "accept") {
        await acceptChillyCircleRequest(userId);
      } else if (action === "decline") {
        await declineChillyCircleRequest(userId);
      } else if (action === "cancel") {
        await cancelChillyCircleRequest(userId);
      } else {
        await removeFromChillyCircle(userId);
      }
      await loadCircle();
    } catch (error) {
      const message = normalizeCircleError(error);
      setNotice(message);
      Alert.alert("Chi'lly Circle", message);
    } finally {
      setBusyKey("");
    }
  }, [busyKey, loadCircle]);

  const renderAvatar = (avatarUrl: string | null, label: string) => (
    <View style={styles.avatar}>
      {avatarUrl ? (
        <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
      ) : (
        <Text style={styles.avatarInitial}>{label.slice(0, 1).toUpperCase()}</Text>
      )}
    </View>
  );

  const renderActionButton = (label: string, action: CircleAction, item: ChillyCircleListItem, accent = false) => {
    const key = `${action}:${item.id}`;
    const busy = busyKey === key;
    return (
      <TouchableOpacity
        key={`${item.id}:${action}`}
        style={[
          styles.actionButton,
          accent && styles.actionButtonAccent,
          !!busyKey && !busy && styles.actionButtonDisabled,
        ]}
        activeOpacity={0.86}
        disabled={!!busyKey}
        onPress={() => {
          void runAction(action, item.id);
        }}
      >
        {busy ? <ActivityIndicator color={accent ? "#FFF7FA" : "#EAF0FF"} size="small" /> : null}
        <Text style={[styles.actionButtonText, accent && styles.actionButtonTextAccent]}>
          {busy ? "Working" : label}
        </Text>
      </TouchableOpacity>
    );
  };

  const openPersonActions = (
    item: ChillyCircleListItem,
    actions: { label: string; action: CircleAction; accent?: boolean }[],
  ) => {
    if (!actions.length) return;
    Alert.alert(
      item.displayName,
      "Manage this Chi'lly Circle connection.",
      [
        ...actions.map((entry) => ({
          text: entry.label,
          style: entry.action === "remove" || entry.action === "decline" || entry.action === "cancel" ? "destructive" as const : "default" as const,
          onPress: () => {
            void runAction(entry.action, item.id);
          },
        })),
        { text: "Cancel", style: "cancel" as const },
      ],
    );
  };

  const renderSuggestionGroup = (group: { label: string; kind: ChillyCircleSuggestion["kind"]; rows: ChillyCircleSuggestion[] }, index: number) => (
    <View key={`${group.label}-${group.kind}-${index}`} style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{group.label}</Text>
      <View style={styles.sectionStack}>
        {group.rows.map((suggestion, rowIndex) => (
          <TouchableOpacity
            key={suggestion.id}
            testID={`chilly-circle-suggestion-row-${suggestion.kind}-${rowIndex}`}
            activeOpacity={0.86}
            style={styles.suggestionRow}
            onPress={suggestion.onPress}
          >
            {renderAvatar(suggestion.avatarUrl, suggestion.title)}
            <View style={styles.personCopy}>
              <View style={styles.searchResultMetaRow}>
                <Text style={styles.personName} numberOfLines={1}>{suggestion.title}</Text>
                <View style={styles.resultPill}>
                  <Text style={styles.resultPillText}>
                    {suggestion.kind === "circle" ? "Circle" : suggestion.kind === "incoming" ? "Incoming"
                      : suggestion.kind === "outgoing" ? "Sent" : suggestion.kind === "official" ? "Official" : "Person"}
                  </Text>
                </View>
              </View>
              <Text style={styles.personMeta} numberOfLines={1}>{suggestion.subtitle}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderPersonRow = (
    item: ChillyCircleListItem,
    actions: { label: string; action: CircleAction; accent?: boolean }[],
    statusLabel?: string,
  ) => {
    const showInlineActions = statusLabel !== "Connected";
    return (
      <View key={item.id} style={[styles.personCard, !showInlineActions && styles.personCardCompact]}>
        <TouchableOpacity
          style={styles.personMain}
          activeOpacity={0.86}
          onPress={() => openProfile(item.id)}
          onLongPress={() => openPersonActions(item, actions)}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.displayName}. Hold for Chi'lly Circle options.`}
        >
          {renderAvatar(item.avatarUrl ?? null, item.displayName)}
          <View style={styles.personCopy}>
            <Text style={styles.personName} numberOfLines={1}>{item.displayName}</Text>
            <Text style={styles.personMeta} numberOfLines={1}>
              {item.tagline || `Updated ${formatUpdatedAt(item.relationshipUpdatedAt)}`}
            </Text>
          </View>
          {statusLabel ? (
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{statusLabel}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        {actions.length && showInlineActions ? (
          <View style={styles.personActions}>
            {actions.map((entry) => renderActionButton(entry.label, entry.action, item, entry.accent))}
          </View>
        ) : null}
      </View>
    );
  };

  const renderSection = (
    sectionKey: CircleSectionKey,
    title: string,
    items: ChillyCircleListItem[],
    emptyText: string,
    actionsForItem: (item: ChillyCircleListItem) => { label: string; action: CircleAction; accent?: boolean }[],
    statusLabel?: string,
  ) => (
    <View style={styles.sectionCard}>
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionHeaderRight}>
          <Text style={styles.sectionCount}>{items.length}</Text>
          {!!items.length ? (
            <TouchableOpacity
              activeOpacity={0.86}
              style={styles.sectionToggleButton}
              onPress={() => toggleSectionCollapsed(sectionKey)}
            >
              <Text style={styles.sectionToggleText}>
                {resolveSectionCollapsed(sectionKey, items.length) ? "Expand" : "Collapse"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      {resolveSectionCollapsed(sectionKey, items.length) ? (
        <View style={styles.sectionCollapsedNotice}>
          <Text style={styles.sectionCollapsedNoticeText}>
            {loading
              ? "Loading"
              : `This section is collapsed. Expand to view ${items.length} ${items.length === 1 ? "person" : "people"}.`}
          </Text>
        </View>
      ) : (
        <View style={styles.sectionStack}>
          {loading ? (
            <View style={styles.loadingInline}>
              <ActivityIndicator color="#DC143C" size="small" />
              <Text style={styles.emptyText}>Loading</Text>
            </View>
          ) : items.length ? (
            items.map((item) => renderPersonRow(item, actionsForItem(item), statusLabel))
          ) : (
            <Text style={styles.emptyText}>{emptyText}</Text>
          )}
        </View>
      )}
    </View>
  );

  const renderRachiConnection = () => (
    <View style={styles.officialCard}>
      <TouchableOpacity
        style={styles.officialRow}
        activeOpacity={0.86}
        onPress={() => openProfile(RACHI_OFFICIAL_ACCOUNT.userId)}
      >
        <View style={[styles.avatar, styles.officialAvatar, styles.officialAvatarCompact]}>
          <Text style={[styles.avatarInitial, styles.officialAvatarInitial]}>R</Text>
        </View>
        <View style={styles.personCopy}>
          <View style={styles.officialTitleRow}>
            <Text style={styles.officialName} numberOfLines={1}>{RACHI_OFFICIAL_ACCOUNT.displayName}</Text>
            <View style={styles.officialPill}>
              <Text style={styles.statusPillText}>Official</Text>
            </View>
          </View>
          <Text style={styles.officialMeta} numberOfLines={1}>Official connection</Text>
          <Text style={styles.officialMeta} numberOfLines={1}>Your first Chi'lly Circle connection</Text>
          <Text style={styles.officialMeta} numberOfLines={1}>Rachi does not read your private chats.</Text>
        </View>
      </TouchableOpacity>
    </View>
  );

  if (sessionLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#DC143C" />
        <Text style={styles.emptyText}>{"Loading Chi'lly Circle"}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Math.max(insets.top + 16, 24),
          paddingBottom: Math.max(insets.bottom + 28, 28),
        },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.82}>
          <Text style={styles.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={styles.kicker}>CHI'LLY CIRCLE</Text>
        <TouchableOpacity activeOpacity={0.82} onPress={() => { void loadCircle(); }}>
          <Text style={styles.refreshText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.pageTitle}>Chi'lly Circle</Text>
      <Text style={styles.pageSubtle}>Find people and manage official and mutual connections.</Text>

      <View style={styles.searchShell}>
        <TextInput
          testID="chilly-circle-search-input"
          accessibilityLabel="Search Chi'lly Circle"
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search your Circle, requests, or people"
          placeholderTextColor="#75829A"
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {searchQuery.trim() ? (
          <TouchableOpacity
            testID="chilly-circle-search-clear-button"
            accessibilityLabel="Clear Chi'lly Circle search"
            activeOpacity={0.86}
            onPress={() => setSearchQuery("")}
            style={styles.searchClearButton}
          >
            <Text style={styles.searchClearButtonText}>Clear</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {notice ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {renderRachiConnection()}

      {hasSearchQuery ? (
        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>Search suggestions</Text>
              {peopleLoading ? (
                <View style={styles.suggestionPanelState}>
                  <ActivityIndicator color="#F34B74" size="small" />
                  <Text style={styles.emptyText}>Searching people...</Text>
                </View>
              ) : peopleError ? (
                <View style={styles.suggestionPanelState}>
                  <Text style={styles.emptyText}>{peopleError}</Text>
                </View>
              ) : hasAnySuggestions ? (
                <View style={styles.suggestionPanel}>
                  {suggestionGroups.map((group, index) => renderSuggestionGroup(group, index))}
                </View>
          ) : (
            <View style={styles.suggestionPanelState}>
              <Text style={styles.emptyText}>No matching Circle connections, requests, or people.</Text>
              <Text style={styles.emptySmall}>{PEOPLE_SEARCH_NO_RESULTS_COPY}</Text>
            </View>
          )}
        </View>
      ) : null}

      {renderSection(
        "circle",
        "My Chi'lly Circle",
        hasSearchQuery ? circleSearchResults : circle,
        "No Chi'lly Circle connections yet",
        () => [{ label: "Remove from Chi'lly Circle", action: "remove" }],
        "Connected",
      )}

      {renderSection(
        "incoming",
        "Incoming requests",
        hasSearchQuery ? incomingSearchResults : incoming,
        "No incoming Chi'lly Circle requests",
        () => [
          { label: "Accept", action: "accept", accent: true },
          { label: "Decline", action: "decline" },
        ],
      )}

      {renderSection(
        "outgoing",
        "Sent requests",
        hasSearchQuery ? outgoingSearchResults : outgoing,
        "No sent Chi'lly Circle requests",
        () => [{ label: "Cancel Request", action: "cancel" }],
        "Requested",
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#06070B",
    paddingHorizontal: 18,
  },
  content: {
    gap: 10,
  },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#06070B",
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  backArrow: {
    color: "#AAB4C8",
    fontSize: 20,
    fontWeight: "800",
    paddingRight: 8,
  },
  kicker: {
    color: "#7B8497",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1.2,
  },
  refreshText: {
    color: "#F4F7FC",
    fontSize: 12,
    fontWeight: "800",
  },
  pageTitle: {
    color: "#FFFFFF",
    fontSize: 26,
    fontWeight: "900",
  },
  pageSubtle: {
    color: "#B6BFD3",
    fontSize: 12.5,
    marginTop: 3,
    marginBottom: 6,
    fontWeight: "600",
  },
  searchShell: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    backgroundColor: "rgba(255,255,255,0.055)",
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  notice: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.36)",
    backgroundColor: "rgba(220,20,60,0.12)",
    padding: 12,
  },
  noticeText: {
    color: "#FFDDE6",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  sectionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(18,18,18,0.96)",
    padding: 12,
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 16.5,
    fontWeight: "900",
  },
  sectionCount: {
    color: "#9EA8BA",
    fontSize: 11.5,
    fontWeight: "900",
  },
  sectionHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionToggleButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  sectionToggleText: {
    color: "#E9EEFB",
    fontSize: 10,
    fontWeight: "900",
  },
  sectionCollapsedNotice: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 10,
    justifyContent: "center",
  },
  sectionCollapsedNoticeText: {
    color: "#9CA7BA",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
  },
  sectionStack: {
    gap: 8,
  },
  officialCard: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(18,18,18,0.9)",
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 6,
  },
  officialRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  officialTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  officialName: {
    color: "#F4F7FC",
    fontSize: 12.5,
    fontWeight: "900",
    flex: 1,
  },
  officialMeta: {
    color: "#9CA7BA",
    fontSize: 10,
    fontWeight: "700",
    marginTop: 1,
  },
  officialPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 7,
    paddingVertical: 1.5,
  },
  officialAvatarCompact: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  officialAvatarInitial: {
    fontSize: 10,
  },
  loadingInline: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  suggestionPanel: {
    gap: 8,
  },
  suggestionPanelState: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  emptyText: {
    color: "#93A0B6",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySmall: {
    color: "#9FB0CA",
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  personCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 9,
    gap: 8,
  },
  personCardCompact: {
    paddingVertical: 8,
  },
  personMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
  },
  personCopy: {
    flex: 1,
    minWidth: 0,
  },
  personName: {
    color: "#F4F7FC",
    fontSize: 13.5,
    fontWeight: "900",
  },
  personMeta: {
    color: "#9CA7BA",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(220,20,60,0.28)",
    overflow: "hidden",
  },
  officialAvatar: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(220,20,60,0.44)",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarInitial: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusPillText: {
    color: "#E8EEFB",
    fontSize: 10,
    fontWeight: "900",
  },
  searchResultMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  resultPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.35)",
    backgroundColor: "rgba(220,20,60,0.16)",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  resultPillText: {
    color: "#FFE6EF",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  suggestionRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  personActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionButton: {
    minHeight: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
  },
  actionButtonAccent: {
    borderColor: "rgba(220,20,60,0.45)",
    backgroundColor: "rgba(220,20,60,0.2)",
  },
  actionButtonDisabled: {
    opacity: 0.58,
  },
  actionButtonText: {
    color: "#EAF0FF",
    fontSize: 11.5,
    fontWeight: "900",
  },
  actionButtonTextAccent: {
    color: "#FFF7FA",
  },
});
