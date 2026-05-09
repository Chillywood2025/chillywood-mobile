import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  getDiscoveryAdPolicyLabel,
  getDiscoveryAccessLabel,
  getDiscoveryLiveLabel,
  readPublicDiscoveryFeedItem,
  type DiscoveryFeedItem,
} from "../../_lib/discoveryFeed";
import { resolveSpectatorAccess, type SpectatorAccessDecision } from "../../_lib/spectatorAccess";

type LoadState = "loading" | "ready" | "unavailable";

const normalizeRouteParam = (value: string | string[] | undefined) =>
  String(Array.isArray(value) ? value[0] : value ?? "").trim();

const formatDate = (value?: string | null) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Time TBD";
  const parsed = new Date(normalized);
  if (!Number.isFinite(parsed.getTime())) return "Time TBD";
  return parsed.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const getPrimaryActorId = (item: DiscoveryFeedItem) =>
  String(item.channel_user_id ?? item.owner_user_id ?? item.host_user_id ?? "").trim();

export default function SpectatorMetadataScreen() {
  const router = useRouter();
  const safeAreaInsets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ itemId?: string | string[] }>();
  const itemId = normalizeRouteParam(params.itemId);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [item, setItem] = useState<DiscoveryFeedItem | null>(null);
  const [decision, setDecision] = useState<SpectatorAccessDecision | null>(null);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoadState("loading");
      setItem(null);
      setDecision(null);

      if (!itemId) {
        setLoadState("unavailable");
        return;
      }

      const nextItem = await readPublicDiscoveryFeedItem(itemId).catch(() => null);
      if (!active) return;

      if (!nextItem) {
        setLoadState("unavailable");
        return;
      }

      const nextDecision = resolveSpectatorAccess(nextItem);
      setItem(nextItem);
      setDecision(nextDecision);
      setLoadState(nextDecision.canShowMetadata ? "ready" : "unavailable");
    };

    void load();

    return () => {
      active = false;
    };
  }, [itemId]);

  const openChannel = () => {
    if (!item) return;
    const actorId = getPrimaryActorId(item);
    if (!actorId) return;
    router.push({
      pathname: "/channel/[userId]",
      params: { userId: actorId },
    });
  };

  const openProfile = () => {
    if (!item) return;
    const actorId = String(item.owner_user_id ?? item.host_user_id ?? item.channel_user_id ?? "").trim();
    if (!actorId) return;
    router.push({
      pathname: "/profile/[userId]",
      params: { userId: actorId },
    });
  };

  const renderUnavailable = () => (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(28, safeAreaInsets.top + 12) }]}>
        <TouchableOpacity style={styles.navButton} activeOpacity={0.84} onPress={() => router.back()}>
          <Text style={styles.navButtonText}>Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Spectator</Text>
        <View style={styles.navSpacer} />
      </View>
      <View style={styles.centerCard}>
        {loadState === "loading" ? (
          <>
            <ActivityIndicator color="#E50914" />
            <Text style={styles.centerTitle}>Checking public metadata</Text>
            <Text style={styles.centerBody}>No room token, mic, camera, or playback is requested.</Text>
          </>
        ) : (
          <>
            <Text style={styles.centerTitle}>Spectator view unavailable</Text>
            <Text style={styles.centerBody}>
              This item is private, protected, blocked, or not available for public metadata.
            </Text>
          </>
        )}
      </View>
    </View>
  );

  if (loadState !== "ready" || !item || !decision) {
    return renderUnavailable();
  }

  const title = String(item.title ?? "").trim() || "Public discovery item";
  const subtitle = String(item.subtitle ?? "").trim();
  const scheduledAt = item.starts_at ?? item.published_at ?? item.created_at;
  const canOpenChannel = !!getPrimaryActorId(item);
  const canOpenProfile = !!String(item.owner_user_id ?? item.host_user_id ?? item.channel_user_id ?? "").trim();

  return (
    <View style={styles.screen}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: 36 + safeAreaInsets.bottom }]}
      >
        <View style={[styles.header, { paddingTop: Math.max(28, safeAreaInsets.top + 12) }]}>
          <TouchableOpacity style={styles.navButton} activeOpacity={0.84} onPress={() => router.back()}>
            <Text style={styles.navButtonText}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Spectator</Text>
          <View style={styles.navSpacer} />
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroMedia}>
            {item.thumbnail_url ? (
              <Image source={{ uri: item.thumbnail_url }} style={styles.heroImage} />
            ) : (
              <View style={styles.heroFallback}>
                <Text style={styles.heroInitial}>{title.slice(0, 1).toUpperCase()}</Text>
              </View>
            )}
            <View style={styles.heroScrim} />
            <View style={styles.badgeRow}>
              <Text style={[styles.badge, item.live_state === "live" ? styles.liveBadge : null]}>
                {getDiscoveryLiveLabel(item)}
              </Text>
              <Text style={styles.badge}>{getDiscoveryAccessLabel(item)}</Text>
            </View>
          </View>

          <View style={styles.heroCopy}>
            <Text style={styles.kicker}>METADATA ONLY</Text>
            <Text style={styles.title} numberOfLines={3}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle} numberOfLines={3}>{subtitle}</Text> : null}
            <Text style={styles.meta}>{formatDate(scheduledAt)}</Text>
          </View>
        </View>

        <View style={styles.guardrailCard}>
          <Text style={styles.guardrailTitle}>Spectator playback is not connected yet.</Text>
          <Text style={styles.guardrailBody}>{decision.safeCopy}</Text>
          <View style={styles.guardrailList}>
            <Text style={styles.guardrailItem}>No mic or camera controls</Text>
            <Text style={styles.guardrailItem}>No full LiveKit room token</Text>
            <Text style={styles.guardrailItem}>No HLS or Egress playback URL</Text>
            <Text style={styles.guardrailItem}>No real ad playback or CTV inventory</Text>
            <Text style={styles.guardrailItem}>No host controls or room mutation</Text>
          </View>
        </View>

        <View style={styles.detailCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Access</Text>
            <Text style={styles.detailValue}>{decision.accessType.replaceAll("_", " ")}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Rights</Text>
            <Text style={styles.detailValue}>{decision.rightsStatus.replaceAll("_", " ")}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Ad policy</Text>
            <Text style={styles.detailValue}>{getDiscoveryAdPolicyLabel(item)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Full room</Text>
            <Text style={styles.detailValue}>
              {decision.canJoinFullRoom ? "Use the gated room route" : "Not available from spectator metadata"}
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          {canOpenChannel ? (
            <TouchableOpacity style={styles.primaryButton} activeOpacity={0.86} onPress={openChannel}>
              <Text style={styles.primaryButtonText}>View Channel</Text>
            </TouchableOpacity>
          ) : null}
          {canOpenProfile ? (
            <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.86} onPress={openProfile}>
              <Text style={styles.secondaryButtonText}>View Profile</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#07080D",
  },
  content: {
    paddingBottom: 36,
  },
  header: {
    minHeight: 84,
    paddingHorizontal: 18,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navButton: {
    minWidth: 70,
    minHeight: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  navButtonText: {
    color: "#F7FAFF",
    fontSize: 13,
    fontWeight: "900",
  },
  headerTitle: {
    color: "#F7FAFF",
    fontSize: 15,
    fontWeight: "900",
  },
  navSpacer: {
    width: 70,
  },
  centerCard: {
    margin: 18,
    minHeight: 220,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#10141D",
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
    gap: 10,
  },
  centerTitle: {
    color: "#F7FAFF",
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  centerBody: {
    color: "#AAB5CA",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    textAlign: "center",
  },
  heroCard: {
    marginHorizontal: 18,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "#10141D",
    overflow: "hidden",
  },
  heroMedia: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#151A25",
  },
  heroImage: {
    width: "100%",
    height: "100%",
  },
  heroFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  heroInitial: {
    color: "#F7FAFF",
    fontSize: 44,
    fontWeight: "900",
  },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3,5,10,0.18)",
  },
  badgeRow: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  badge: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    color: "#F2F6FF",
    fontSize: 11,
    fontWeight: "900",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  liveBadge: {
    backgroundColor: "#E50914",
  },
  heroCopy: {
    padding: 18,
    gap: 8,
  },
  kicker: {
    color: "#7ED7FF",
    fontSize: 11,
    fontWeight: "900",
  },
  title: {
    color: "#F7FAFF",
    fontSize: 25,
    lineHeight: 31,
    fontWeight: "900",
  },
  subtitle: {
    color: "#B6C1D4",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  meta: {
    color: "#95A2B8",
    fontSize: 12,
    fontWeight: "800",
  },
  guardrailCard: {
    marginHorizontal: 18,
    marginTop: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.22)",
    backgroundColor: "rgba(18,14,22,0.92)",
    padding: 17,
    gap: 10,
  },
  guardrailTitle: {
    color: "#FFE5EC",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  guardrailBody: {
    color: "#D7B6C0",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  guardrailList: {
    gap: 5,
  },
  guardrailItem: {
    color: "#F2DCE4",
    fontSize: 12.5,
    fontWeight: "800",
  },
  detailCard: {
    marginHorizontal: 18,
    marginTop: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#10141D",
    paddingHorizontal: 17,
    paddingVertical: 4,
  },
  detailRow: {
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
    gap: 5,
  },
  detailLabel: {
    color: "#8F9CB2",
    fontSize: 11,
    fontWeight: "900",
  },
  detailValue: {
    color: "#F4F7FF",
    fontSize: 13.5,
    lineHeight: 19,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  actionRow: {
    marginHorizontal: 18,
    marginTop: 16,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  primaryButton: {
    minHeight: 46,
    flexGrow: 1,
    borderRadius: 12,
    backgroundColor: "#E50914",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  secondaryButton: {
    minHeight: 46,
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  secondaryButtonText: {
    color: "#F7FAFF",
    fontSize: 13,
    fontWeight: "900",
  },
});
