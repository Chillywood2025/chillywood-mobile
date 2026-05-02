import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
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
import { useSession } from "../_lib/session";

type CircleAction = "accept" | "decline" | "cancel" | "remove";

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

  const openProfile = useCallback((userId: string) => {
    router.push({ pathname: "/profile/[userId]", params: { userId } });
  }, [router]);

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

  const renderAvatar = (item: ChillyCircleListItem) => (
    <View style={styles.avatar}>
      {item.avatarUrl ? (
        <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
      ) : (
        <Text style={styles.avatarInitial}>{item.displayName.slice(0, 1).toUpperCase()}</Text>
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

  const renderPersonRow = (
    item: ChillyCircleListItem,
    actions: { label: string; action: CircleAction; accent?: boolean }[],
    statusLabel?: string,
  ) => {
    const meta = item.handle || item.tagline || `Updated ${formatUpdatedAt(item.relationshipUpdatedAt)}`;
    return (
      <View key={item.id} style={styles.personCard}>
        <TouchableOpacity
          style={styles.personMain}
          activeOpacity={0.86}
          onPress={() => openProfile(item.id)}
        >
          {renderAvatar(item)}
          <View style={styles.personCopy}>
            <Text style={styles.personName} numberOfLines={1}>{item.displayName}</Text>
            <Text style={styles.personMeta} numberOfLines={1}>{meta}</Text>
          </View>
          {statusLabel ? (
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText}>{statusLabel}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        {actions.length ? (
          <View style={styles.personActions}>
            {actions.map((entry) => renderActionButton(entry.label, entry.action, item, entry.accent))}
          </View>
        ) : null}
      </View>
    );
  };

  const renderSection = (
    title: string,
    body: string,
    items: ChillyCircleListItem[],
    emptyText: string,
    actionsForItem: (item: ChillyCircleListItem) => { label: string; action: CircleAction; accent?: boolean }[],
    statusLabel?: string,
  ) => (
    <View style={styles.sectionCard}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{body}</Text>
      <View style={styles.sectionStack}>
        {loading ? (
          <View style={styles.loadingInline}>
            <ActivityIndicator color="#DC143C" />
            <Text style={styles.emptyText}>Loading</Text>
          </View>
        ) : items.length ? (
          items.map((item) => renderPersonRow(item, actionsForItem(item), statusLabel))
        ) : (
          <Text style={styles.emptyText}>{emptyText}</Text>
        )}
      </View>
    </View>
  );

  if (sessionLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#DC143C" />
        <Text style={styles.emptyText}>Loading Chi'lly Circle</Text>
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

      <View style={styles.heroCard}>
        <Text style={styles.heroKicker}>CHI'LLY CIRCLE REQUESTS</Text>
        <Text style={styles.heroTitle}>Manage mutual connections.</Text>
        <Text style={styles.heroBody}>
          Follow stays separate. Chi'lly Circle is the mutual connection layer used by the existing mutual-connection system.
        </Text>
        <View style={styles.summaryRow}>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryValue}>{loading ? "..." : String(circle.length)}</Text>
            <Text style={styles.summaryLabel}>In Circle</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryValue}>{loading ? "..." : String(incoming.length)}</Text>
            <Text style={styles.summaryLabel}>Incoming</Text>
          </View>
          <View style={styles.summaryPill}>
            <Text style={styles.summaryValue}>{loading ? "..." : String(outgoing.length)}</Text>
            <Text style={styles.summaryLabel}>Sent</Text>
          </View>
        </View>
        {notice ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>{notice}</Text>
          </View>
        ) : null}
      </View>

      {renderSection(
        "My Chi'lly Circle",
        "People who have accepted a mutual Chi'lly Circle connection.",
        circle,
        "No one is in your Chi'lly Circle yet.",
        () => [{ label: "Remove from Chi'lly Circle", action: "remove" }],
        "In Chi'lly Circle",
      )}

      {renderSection(
        "Incoming requests",
        "Requests waiting for your response.",
        incoming,
        "No incoming Chi'lly Circle requests.",
        () => [
          { label: "Accept", action: "accept", accent: true },
          { label: "Decline", action: "decline" },
        ],
      )}

      {renderSection(
        "Sent requests",
        "Requests you sent that have not been accepted yet.",
        outgoing,
        "No sent Chi'lly Circle requests.",
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
    gap: 14,
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
    marginBottom: 18,
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
  heroCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(18,18,18,0.96)",
    padding: 18,
    gap: 12,
  },
  heroKicker: {
    color: "#7B7B7B",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "900",
  },
  heroBody: {
    color: "#B8C1D6",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  summaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summaryPill: {
    minWidth: 92,
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
    gap: 2,
  },
  summaryValue: {
    color: "#F6F8FF",
    fontSize: 22,
    fontWeight: "900",
  },
  summaryLabel: {
    color: "#9EA8BA",
    fontSize: 11,
    fontWeight: "800",
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(18,18,18,0.96)",
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  sectionBody: {
    color: "#AEB8CC",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  sectionStack: {
    gap: 10,
  },
  loadingInline: {
    minHeight: 58,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  emptyText: {
    color: "#93A0B6",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
  },
  personCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
    gap: 12,
  },
  personMain: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(220,20,60,0.28)",
    overflow: "hidden",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarInitial: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
  personCopy: {
    flex: 1,
    minWidth: 0,
  },
  personName: {
    color: "#F4F7FC",
    fontSize: 14.5,
    fontWeight: "900",
  },
  personMeta: {
    color: "#9CA7BA",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  statusPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillText: {
    color: "#E8EEFB",
    fontSize: 10.5,
    fontWeight: "900",
  },
  personActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  actionButton: {
    minHeight: 40,
    borderRadius: 12,
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
    fontSize: 12,
    fontWeight: "900",
  },
  actionButtonTextAccent: {
    color: "#FFF7FA",
  },
});
