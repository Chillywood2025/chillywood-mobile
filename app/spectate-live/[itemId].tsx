import { ResizeMode, Video } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  getDiscoveryAccessLabel,
  readPublicDiscoveryFeedItem,
  readRankedPublicDiscoveryFeedItems,
  type DiscoveryFeedItem,
} from "../../_lib/discoveryFeed";
import {
  readCircleSpectatorFeedItem,
  readRankedCircleSpectatorFeedItems,
} from "../../_lib/circleSpectatorFeed";
import { resolveSpectatorAccess } from "../../_lib/spectatorAccess";
import {
  readSpectatorPlaybackReadout,
  resolveSpectatorPlaybackState,
  type SpectatorPlaybackReadout,
} from "../../_lib/spectatorPlayback";
import {
  buildSpectatorDeepLink,
  resolveSpectatorLaunchEligibility,
  startSpectatorChildRoom,
} from "../../_lib/spectatorChildRooms";
import { buildSafetyReportContext, submitSafetyReport, trackModerationActionUsed } from "../../_lib/moderation";
import { useSession } from "../../_lib/session";
import { ReportSheet } from "../../components/safety/report-sheet";

type AccessLane = "public" | "circle";
type PagePlayback = {
  state: "loading" | "ready" | "unavailable";
  playback: SpectatorPlaybackReadout | null;
};

const normalizeParam = (value: string | string[] | undefined) =>
  String(Array.isArray(value) ? value[0] : value ?? "").trim();

const isCircleItem = (item: DiscoveryFeedItem) =>
  item.visibility === "circle" || item.visibility === "chilly_circle" || item.access_type === "circle";

const getPrimaryActorId = (item: DiscoveryFeedItem) =>
  String(item.channel_user_id ?? item.owner_user_id ?? item.host_user_id ?? "").trim();

const uniqueLiveItems = (initial: DiscoveryFeedItem, ranked: DiscoveryFeedItem[]) => {
  const seen = new Set<string>();
  return [initial, ...ranked]
    .filter((item) => item.live_state === "live")
    .filter((item) => {
      const id = String(item.id ?? "").trim();
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
};

function ImmersiveLivePage({
  item,
  lane,
  active,
  height,
  onLongPress,
}: {
  item: DiscoveryFeedItem;
  lane: AccessLane;
  active: boolean;
  height: number;
  onLongPress: (item: DiscoveryFeedItem) => void;
}) {
  const [pagePlayback, setPagePlayback] = useState<PagePlayback>({ state: "loading", playback: null });

  useEffect(() => {
    let mounted = true;
    setPagePlayback({ state: "loading", playback: null });

    const decision = resolveSpectatorAccess(item, {
      circleAccess: lane === "circle" ? "allowed" : undefined,
    });
    const fallback = resolveSpectatorPlaybackState(item, decision);

    void readSpectatorPlaybackReadout(item, decision)
      .catch(() => fallback)
      .then((nextPlayback) => {
        if (!mounted) return;
        setPagePlayback({
          state: nextPlayback.canRenderPlayback && !!nextPlayback.playbackUrl ? "ready" : "unavailable",
          playback: nextPlayback,
        });
      });

    return () => {
      mounted = false;
    };
  }, [item, lane]);

  const title = String(item.title ?? "").trim() || "Live now";
  const subtitle = String(item.subtitle ?? "").trim();
  const playbackUrl = pagePlayback.playback?.playbackUrl ?? null;

  return (
    <Pressable
      style={[styles.page, { height }]}
      delayLongPress={320}
      onLongPress={() => onLongPress(item)}
      accessibilityRole="button"
      accessibilityLabel={`${title}. Hold for live options.`}
    >
      {pagePlayback.state === "ready" && playbackUrl ? (
        <Video
          source={{ uri: playbackUrl }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay={active}
          useNativeControls={false}
        />
      ) : item.thumbnail_url ? (
        <Image source={{ uri: item.thumbnail_url }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={styles.fallback}>
          <Text style={styles.fallbackInitial}>{title.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}

      <View pointerEvents="none" style={styles.topScrim} />
      <View pointerEvents="none" style={styles.bottomScrim} />

      {pagePlayback.state === "loading" ? (
        <View pointerEvents="none" style={styles.loadingBadge}>
          <ActivityIndicator color="#FFFFFF" size="small" />
          <Text style={styles.loadingText}>Opening live…</Text>
        </View>
      ) : null}

      <View pointerEvents="none" style={styles.liveCopy}>
        <View style={styles.badgeRow}>
          <Text style={styles.liveBadge}>LIVE</Text>
          <Text style={styles.accessBadge}>{lane === "circle" ? "Chi’lly Circle" : getDiscoveryAccessLabel(item)}</Text>
          <Text style={styles.watchOnlyBadge}>WATCH ONLY</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
        <Text style={styles.gestureHint}>Swipe for more  •  Hold for options</Text>
      </View>
    </Pressable>
  );
}

export default function ImmersiveLiveSpectatorScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const { isSignedIn } = useSession();
  const params = useLocalSearchParams<{
    itemId?: string | string[];
    lane?: string | string[];
  }>();
  const initialItemId = normalizeParam(params.itemId);
  const lane: AccessLane = normalizeParam(params.lane) === "circle" ? "circle" : "public";

  const [items, setItems] = useState<DiscoveryFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [sheetItem, setSheetItem] = useState<DiscoveryFeedItem | null>(null);
  const [sheetPlayback, setSheetPlayback] = useState<SpectatorPlaybackReadout | null>(null);
  const [sheetBusy, setSheetBusy] = useState(false);
  const [reportItem, setReportItem] = useState<DiscoveryFeedItem | null>(null);
  const [reportBusy, setReportBusy] = useState(false);

  const pageHeight = Math.max(1, height);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setUnavailable(false);

    const load = async () => {
      if (!initialItemId) {
        if (mounted) {
          setUnavailable(true);
          setLoading(false);
        }
        return;
      }

      const initial = lane === "circle"
        ? await readCircleSpectatorFeedItem(initialItemId).catch(() => null)
        : await readPublicDiscoveryFeedItem(initialItemId).catch(() => null);
      if (!mounted) return;

      if (!initial || initial.live_state !== "live" || (lane === "circle") !== isCircleItem(initial)) {
        setUnavailable(true);
        setLoading(false);
        return;
      }

      const ranked = lane === "circle"
        ? await readRankedCircleSpectatorFeedItems({ limit: 50 }).catch(() => ({ items: [] }))
        : await readRankedPublicDiscoveryFeedItems({ limit: 50, surface: "home" }).catch(() => ({ items: [] }));
      if (!mounted) return;

      setItems(uniqueLiveItems(initial, ranked.items));
      setActiveIndex(0);
      setLoading(false);
    };

    void load();
    return () => {
      mounted = false;
    };
  }, [initialItemId, lane]);

  useEffect(() => {
    let mounted = true;
    setSheetPlayback(null);
    if (!sheetItem) return () => {
      mounted = false;
    };

    const decision = resolveSpectatorAccess(sheetItem, {
      circleAccess: lane === "circle" ? "allowed" : undefined,
    });
    const fallback = resolveSpectatorPlaybackState(sheetItem, decision);
    void readSpectatorPlaybackReadout(sheetItem, decision)
      .catch(() => fallback)
      .then((nextPlayback) => {
        if (mounted) setSheetPlayback(nextPlayback);
      });

    return () => {
      mounted = false;
    };
  }, [sheetItem, lane]);

  const activeItem = items[activeIndex] ?? items[0] ?? null;
  const launchEligibility = useMemo(
    () => sheetItem ? resolveSpectatorLaunchEligibility(sheetItem, sheetPlayback) : null,
    [sheetItem, sheetPlayback],
  );

  const openChannel = () => {
    if (!sheetItem) return;
    const userId = getPrimaryActorId(sheetItem);
    if (!userId) return;
    setSheetItem(null);
    router.push({ pathname: "/channel/[userId]", params: { userId } });
  };

  const startReaction = async () => {
    if (!sheetItem || !launchEligibility) return;
    if (!launchEligibility.canStartLiveWatchParty) {
      Alert.alert("Reaction unavailable", launchEligibility.disabledReason || "This live can’t start a reaction room.");
      return;
    }
    if (!isSignedIn) {
      const redirectTo = `/spectate-live/${encodeURIComponent(sheetItem.id)}?lane=${lane}`;
      setSheetItem(null);
      router.push({ pathname: "/(auth)/login", params: { redirectTo } });
      return;
    }

    setSheetBusy(true);
    try {
      const created = await startSpectatorChildRoom("start_live_reaction", sheetItem.id);
      setSheetItem(null);
      router.push({
        pathname: "/watch-party/live-stage/[partyId]",
        params: { partyId: created.childRoomId, source: "spectator" },
      });
    } catch (error) {
      Alert.alert(
        "Reaction unavailable",
        error instanceof Error && error.message ? error.message : "This live can’t start a reaction room.",
      );
    } finally {
      setSheetBusy(false);
    }
  };

  const handleShare = async () => {
    if (!sheetItem || !launchEligibility?.canShare) return;
    await Share.share({
      message: `Watch ${String(sheetItem.title ?? "this live").trim() || "this live"} on Chi'llywood: ${buildSpectatorDeepLink(sheetItem.id)}`,
      title: String(sheetItem.title ?? "Chi'llywood Live").trim() || "Chi'llywood Live",
    });
  };

  const openReport = () => {
    if (!sheetItem) return;
    const item = sheetItem;
    trackModerationActionUsed({
      surface: "spectator",
      action: "open_safety_report",
      targetType: "room",
      targetId: String(item.room_id ?? item.source_id ?? item.id),
      roomId: String(item.room_id ?? item.source_id ?? "") || null,
      sourceRoute: `/spectate-live/${item.id}`,
    });
    setReportItem(item);
    setSheetItem(null);
  };

  const submitReport = async (input: { category: Parameters<typeof submitSafetyReport>[0]["category"]; note: string }) => {
    if (!reportItem) return;
    setReportBusy(true);
    try {
      const safeTargetId = String(reportItem.room_id ?? reportItem.source_id ?? reportItem.id).trim();
      await submitSafetyReport({
        targetType: "room",
        targetId: safeTargetId,
        category: input.category,
        note: input.note,
        roomId: String(reportItem.room_id ?? reportItem.source_id ?? "") || null,
        context: buildSafetyReportContext({
          sourceSurface: "spectator",
          sourceRoute: `/spectate-live/${reportItem.id}`,
          targetLabel: String(reportItem.title ?? "Live spectator source"),
          targetRoleLabel: "Live spectator source",
          context: {
            sourceItemId: reportItem.id,
            sourceType: reportItem.source_type,
            liveState: reportItem.live_state,
            accessLane: lane,
            rawPlaybackUrlVisible: false,
          },
        }),
      });
      setReportItem(null);
    } catch (error) {
      Alert.alert(
        "Report unavailable",
        error instanceof Error && error.message ? error.message : "Sign in before sending a safety report.",
      );
    } finally {
      setReportBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <ActivityIndicator color="#FFFFFF" />
        <Text style={styles.centerTitle}>Opening live…</Text>
      </View>
    );
  }

  if (unavailable || !items.length) {
    return (
      <View style={styles.centerScreen}>
        <Text style={styles.centerTitle}>This live isn’t available.</Text>
        <Text style={styles.centerBody}>Its audience, safety, or playback state may have changed.</Text>
        <TouchableOpacity style={styles.centerButton} onPress={() => router.back()}>
          <Text style={styles.centerButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item, index }) => (
          <ImmersiveLivePage
            item={item}
            lane={lane}
            active={index === activeIndex}
            height={pageHeight}
            onLongPress={setSheetItem}
          />
        )}
        pagingEnabled
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        getItemLayout={(_, index) => ({ length: pageHeight, offset: pageHeight * index, index })}
        onMomentumScrollEnd={(event) => {
          const nextIndex = Math.max(0, Math.min(items.length - 1, Math.round(event.nativeEvent.contentOffset.y / pageHeight)));
          setActiveIndex(nextIndex);
        }}
        initialNumToRender={2}
        windowSize={3}
        removeClippedSubviews
      />

      <TouchableOpacity
        style={[styles.backButton, { top: Math.max(14, insets.top + 6) }]}
        activeOpacity={0.82}
        onPress={() => router.back()}
        accessibilityRole="button"
        accessibilityLabel="Back"
      >
        <Text style={styles.backText}>‹</Text>
      </TouchableOpacity>

      {items.length > 1 ? (
        <View pointerEvents="none" style={[styles.positionPill, { top: Math.max(18, insets.top + 10) }]}>
          <Text style={styles.positionText}>{Math.min(activeIndex + 1, items.length)} / {items.length}</Text>
        </View>
      ) : null}

      <Modal
        visible={!!sheetItem}
        transparent
        animationType="fade"
        onRequestClose={() => setSheetItem(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setSheetItem(null)}>
          <Pressable style={[styles.sheet, { paddingBottom: Math.max(22, insets.bottom + 14) }]} onPress={() => {}}>
            {sheetItem ? (
              <>
                <View style={styles.sheetHandle} />
                <View style={styles.sheetBadgeRow}>
                  <Text style={styles.liveBadge}>LIVE</Text>
                  <Text style={styles.accessBadge}>{lane === "circle" ? "Chi’lly Circle" : "Public"}</Text>
                  <Text style={styles.watchOnlyBadge}>WATCH ONLY</Text>
                </View>
                <Text style={styles.sheetTitle} numberOfLines={2}>{String(sheetItem.title ?? "Live now").trim() || "Live now"}</Text>
                <Text style={styles.sheetBody}>
                  Watching stays separate from the creator’s room. Mic, camera, host controls, and original-room authority stay off.
                </Text>

                {launchEligibility?.canStartLiveWatchParty ? (
                  <TouchableOpacity style={styles.primaryAction} disabled={sheetBusy} onPress={() => void startReaction()}>
                    <Text style={styles.primaryActionText}>{sheetBusy ? "Starting…" : "React with Friends"}</Text>
                    <Text style={styles.primaryActionSubtext}>Start your own Live Watch-Party around this live</Text>
                  </TouchableOpacity>
                ) : null}

                <View style={styles.sheetActions}>
                  {getPrimaryActorId(sheetItem) ? (
                    <TouchableOpacity style={styles.secondaryAction} onPress={openChannel}>
                      <Text style={styles.secondaryActionText}>View Platform</Text>
                    </TouchableOpacity>
                  ) : null}
                  {launchEligibility?.canShare ? (
                    <TouchableOpacity style={styles.secondaryAction} onPress={() => void handleShare()}>
                      <Text style={styles.secondaryActionText}>Share</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity style={styles.secondaryAction} onPress={openReport}>
                    <Text style={styles.secondaryActionText}>Report</Text>
                  </TouchableOpacity>
                </View>

                {launchEligibility?.disabledReason ? (
                  <Text style={styles.disabledCopy}>{launchEligibility.disabledReason}</Text>
                ) : null}
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <ReportSheet
        visible={!!reportItem}
        title="Report live source"
        description="Send a safety report for this live source."
        busy={reportBusy}
        onClose={() => setReportItem(null)}
        onSubmit={submitReport}
      />

      <View pointerEvents="none" style={styles.srStatus}>
        <Text>{activeItem?.id}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000" },
  page: { width: "100%", backgroundColor: "#000", overflow: "hidden" },
  fallback: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", backgroundColor: "#10141D" },
  fallbackInitial: { color: "#E8EDF7", fontSize: 74, fontWeight: "900" },
  topScrim: { position: "absolute", top: 0, left: 0, right: 0, height: 150, backgroundColor: "rgba(0,0,0,0.24)" },
  bottomScrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 300, backgroundColor: "rgba(0,0,0,0.52)" },
  liveCopy: { position: "absolute", left: 22, right: 22, bottom: 38, gap: 8 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" },
  liveBadge: { color: "#FFF", backgroundColor: "#E50914", borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, fontSize: 11, fontWeight: "900", overflow: "hidden" },
  accessBadge: { color: "#FFF", backgroundColor: "rgba(24,28,38,0.84)", borderColor: "rgba(255,255,255,0.22)", borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, fontSize: 11, fontWeight: "900", overflow: "hidden" },
  watchOnlyBadge: { color: "#8DDEFF", backgroundColor: "rgba(8,23,32,0.84)", borderColor: "rgba(126,215,255,0.28)", borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6, fontSize: 10, fontWeight: "900", overflow: "hidden" },
  title: { color: "#FFF", fontSize: 28, lineHeight: 33, fontWeight: "900", letterSpacing: -0.5 },
  subtitle: { color: "rgba(255,255,255,0.82)", fontSize: 14, lineHeight: 20, fontWeight: "700" },
  gestureHint: { marginTop: 3, color: "rgba(255,255,255,0.62)", fontSize: 11.5, fontWeight: "800" },
  loadingBadge: { position: "absolute", alignSelf: "center", top: "47%", flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: "rgba(0,0,0,0.58)" },
  loadingText: { color: "#FFF", fontSize: 12, fontWeight: "800" },
  backButton: { position: "absolute", left: 16, width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(5,7,12,0.72)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  backText: { color: "#FFF", fontSize: 34, lineHeight: 36, fontWeight: "500", marginTop: -3 },
  positionPill: { position: "absolute", right: 16, minWidth: 48, height: 34, paddingHorizontal: 10, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(5,7,12,0.68)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  positionText: { color: "rgba(255,255,255,0.82)", fontSize: 11, fontWeight: "900" },
  centerScreen: { flex: 1, padding: 28, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#07080D" },
  centerTitle: { color: "#FFF", fontSize: 22, fontWeight: "900", textAlign: "center" },
  centerBody: { color: "#AAB5CA", fontSize: 14, lineHeight: 20, fontWeight: "700", textAlign: "center" },
  centerButton: { marginTop: 8, minWidth: 120, minHeight: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "#E50914", paddingHorizontal: 20 },
  centerButtonText: { color: "#FFF", fontSize: 14, fontWeight: "900" },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.58)" },
  sheet: { width: "100%", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, backgroundColor: "#10131B", borderTopWidth: 1, borderColor: "rgba(255,255,255,0.14)", gap: 12 },
  sheetHandle: { alignSelf: "center", width: 42, height: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.28)", marginBottom: 4 },
  sheetBadgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sheetTitle: { color: "#FFF", fontSize: 23, lineHeight: 29, fontWeight: "900", letterSpacing: -0.3 },
  sheetBody: { color: "#AEB8CB", fontSize: 13.5, lineHeight: 20, fontWeight: "700" },
  primaryAction: { marginTop: 4, minHeight: 62, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 11, justifyContent: "center", backgroundColor: "#E50914" },
  primaryActionText: { color: "#FFF", fontSize: 15, fontWeight: "900" },
  primaryActionSubtext: { marginTop: 3, color: "rgba(255,255,255,0.76)", fontSize: 11.5, lineHeight: 16, fontWeight: "700" },
  sheetActions: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  secondaryAction: { flexGrow: 1, minWidth: "30%", minHeight: 48, borderRadius: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, backgroundColor: "rgba(255,255,255,0.065)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" },
  secondaryActionText: { color: "#F7FAFF", fontSize: 13, fontWeight: "900" },
  disabledCopy: { color: "#8F9AAF", fontSize: 11.5, lineHeight: 16, fontWeight: "700" },
  srStatus: { position: "absolute", width: 1, height: 1, opacity: 0 },
});
