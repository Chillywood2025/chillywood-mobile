import { ResizeMode, Video } from "expo-av";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Share,
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
import { readCircleSpectatorFeedItem } from "../../_lib/circleSpectatorFeed";
import { resolveSpectatorAccess, type SpectatorAccessDecision } from "../../_lib/spectatorAccess";
import {
  readSpectatorPlaybackReadout,
  resolveSpectatorPlaybackState,
  type SpectatorPlaybackReadout,
} from "../../_lib/spectatorPlayback";
import {
  buildSpectatorDeepLink,
  resolveSpectatorLaunchEligibility,
  startSpectatorChildRoom,
  type SpectatorLaunchAction,
} from "../../_lib/spectatorChildRooms";
import { buildSafetyReportContext, submitSafetyReport, trackModerationActionUsed } from "../../_lib/moderation";
import { useSession } from "../../_lib/session";
import { ReportSheet } from "../../components/safety/report-sheet";

type LoadState = "loading" | "ready" | "unavailable";
type SpectatorAccessLane = "public" | "circle";

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
  const { isSignedIn } = useSession();
  const params = useLocalSearchParams<{ itemId?: string | string[] }>();
  const itemId = normalizeRouteParam(params.itemId);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [item, setItem] = useState<DiscoveryFeedItem | null>(null);
  const [decision, setDecision] = useState<SpectatorAccessDecision | null>(null);
  const [playback, setPlayback] = useState<SpectatorPlaybackReadout | null>(null);
  const [accessLane, setAccessLane] = useState<SpectatorAccessLane>("public");
  const [startingAction, setStartingAction] = useState<SpectatorLaunchAction | null>(null);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoadState("loading");
      setItem(null);
      setDecision(null);
      setPlayback(null);
      setAccessLane("public");

      if (!itemId) {
        setLoadState("unavailable");
        return;
      }

      const publicItem = await readPublicDiscoveryFeedItem(itemId).catch(() => null);
      const circleItem = publicItem ? null : await readCircleSpectatorFeedItem(itemId).catch(() => null);
      const nextItem = publicItem ?? circleItem;
      const nextLane: SpectatorAccessLane = circleItem ? "circle" : "public";
      if (!active) return;

      if (!nextItem) {
        setLoadState("unavailable");
        return;
      }

      const nextDecision = resolveSpectatorAccess(nextItem, {
        circleAccess: nextLane === "circle" ? "allowed" : undefined,
      });
      const fallbackPlayback = resolveSpectatorPlaybackState(nextItem, nextDecision);
      const nextPlayback = await readSpectatorPlaybackReadout(nextItem, nextDecision).catch(() => fallbackPlayback);
      if (!active) return;
      setItem(nextItem);
      setDecision(nextDecision);
      setPlayback(nextPlayback);
      setAccessLane(nextLane);
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

  const handleStart = async (action: SpectatorLaunchAction) => {
    if (!item) return;
    if (!isSignedIn) {
      router.push({
        pathname: "/(auth)/login",
        params: { redirectTo: `/spectate/${item.id}` },
      });
      return;
    }

    setStartingAction(action);
    try {
      const created = await startSpectatorChildRoom(action, item.id);
      if (created.roomType === "live") {
        router.push({
          pathname: "/watch-party/live-stage/[partyId]",
          params: { partyId: created.childRoomId, source: "spectator" },
        });
      } else {
        router.push({
          pathname: "/watch-party/[partyId]",
          params: { partyId: created.childRoomId, source: "spectator" },
        });
      }
    } catch (error) {
      Alert.alert(
        "Watch party unavailable",
        error instanceof Error && error.message ? error.message : "This live can’t be used for a watch party",
      );
    } finally {
      setStartingAction(null);
    }
  };

  const handleShare = async () => {
    if (!item) return;
    const eligibility = resolveSpectatorLaunchEligibility(item, playback);
    if (!eligibility.canShare) {
      Alert.alert("Sharing unavailable", "This source can’t be shared from Spectator.");
      return;
    }
    await Share.share({
      message: `Watch ${String(item.title ?? "this public source").trim() || "this public source"} on Chi'llywood: ${buildSpectatorDeepLink(item.id)}`,
      title: String(item.title ?? "Chi'llywood Spectator").trim() || "Chi'llywood Spectator",
    });
  };

  const openReport = () => {
    if (!item) return;
    trackModerationActionUsed({
      surface: "spectator",
      action: "open_safety_report",
      targetType: "room",
      targetId: String(item.room_id ?? item.source_id ?? item.id),
      roomId: String(item.room_id ?? item.source_id ?? "") || null,
      sourceRoute: `/spectate/${item.id}`,
    });
    setReportVisible(true);
  };

  const submitReport = async (input: { category: Parameters<typeof submitSafetyReport>[0]["category"]; note: string }) => {
    if (!item) return;
    setReportBusy(true);
    try {
      const safeTargetId = String(item.room_id ?? item.source_id ?? item.id).trim();
      await submitSafetyReport({
        targetType: "room",
        targetId: safeTargetId,
        category: input.category,
        note: input.note,
        roomId: String(item.room_id ?? item.source_id ?? "") || null,
        context: buildSafetyReportContext({
          sourceSurface: "spectator",
          sourceRoute: `/spectate/${item.id}`,
          targetLabel: title,
          targetRoleLabel: "Spectator source",
          context: {
            sourceItemId: item.id,
            sourceType: item.source_type,
            liveState: item.live_state,
            publicSafe: true,
            rawPlaybackUrlVisible: false,
          },
        }),
      });
      setReportVisible(false);
    } catch (error) {
      Alert.alert(
        "Report unavailable",
        error instanceof Error && error.message ? error.message : "Sign in before sending a safety report.",
      );
    } finally {
      setReportBusy(false);
    }
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
            <Text style={styles.centerTitle}>Checking spectator metadata</Text>
            <Text style={styles.centerBody}>No room token, mic, camera, or playback is requested.</Text>
          </>
        ) : (
          <>
            <Text style={styles.centerTitle}>Spectator view unavailable</Text>
            <Text style={styles.centerBody}>
              This item is private to the creator's Chi'lly Circle, protected, blocked, or unavailable.
            </Text>
          </>
        )}
      </View>
    </View>
  );

  if (loadState !== "ready" || !item || !decision || !playback) {
    return renderUnavailable();
  }

  const title = String(item.title ?? "").trim() || (accessLane === "circle" ? "Chi'lly Circle spectator item" : "Public discovery item");
  const subtitle = String(item.subtitle ?? "").trim();
  const scheduledAt = item.starts_at ?? item.published_at ?? item.created_at;
  const canOpenChannel = !!getPrimaryActorId(item);
  const launchEligibility = resolveSpectatorLaunchEligibility(item, playback);
  const primaryCanStart = launchEligibility.primaryAction === "start_live_reaction"
    ? launchEligibility.canStartLiveWatchParty
    : launchEligibility.canStartWatchPartyLive;
  const primaryBusy = startingAction === launchEligibility.primaryAction;
  const reactionBusy = startingAction === "start_live_reaction";

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
            <Text style={styles.kicker}>{playback.canRenderPlayback ? "WATCH ONLY" : "METADATA ONLY"}</Text>
            <Text style={styles.title} numberOfLines={3}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle} numberOfLines={3}>{subtitle}</Text> : null}
            <Text style={styles.meta}>{formatDate(scheduledAt)}</Text>
          </View>
        </View>

        <View style={styles.guardrailCard}>
          <Text style={styles.guardrailTitle}>{playback.title}</Text>
          <Text style={styles.guardrailBody}>{playback.copy}</Text>
          <View style={styles.guardrailList}>
            {playback.guardrails.map((guardrail) => (
              <Text key={guardrail} style={styles.guardrailItem}>{guardrail}</Text>
            ))}
          </View>
        </View>

        {playback.canRenderPlayback && playback.playbackUrl ? (
          <View style={styles.playbackCard}>
            <View style={styles.playbackShell}>
              <Video
                source={{ uri: playback.playbackUrl }}
                style={styles.playbackVideo}
                resizeMode={ResizeMode.CONTAIN}
                shouldPlay
                useNativeControls
              />
            </View>
            <Text style={styles.playbackCaption}>
              Watch-only spectator playback. Mic, camera, and host controls stay off.
            </Text>
          </View>
        ) : null}

        <View style={styles.detailCard}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Access</Text>
            <Text style={styles.detailValue}>{decision.accessType.replaceAll("_", " ")}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Safety</Text>
            <Text style={styles.detailValue}>{decision.rightsStatus.replaceAll("_", " ")}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Ad policy</Text>
            <Text style={styles.detailValue}>{getDiscoveryAdPolicyLabel(item)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Spectator state</Text>
            <Text style={styles.detailValue}>{playback.state.replaceAll("_", " ")}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Full room</Text>
            <Text style={styles.detailValue}>
              {playback.fullRoomRequiresTicket
                ? "Room Pass flow required later"
                : playback.fullRoomRequiresPremium
                  ? "Premium required for full room"
                  : decision.canJoinFullRoom
                    ? "Use the gated room route"
                    : "Not available from spectator metadata"}
            </Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.primaryButton, (!primaryCanStart || !!startingAction) && styles.buttonDisabled]}
            activeOpacity={0.86}
            disabled={!primaryCanStart || !!startingAction}
            onPress={() => handleStart(launchEligibility.primaryAction)}
          >
            <Text style={styles.primaryButtonText}>
              {primaryBusy ? "Starting..." : launchEligibility.primaryLabel}
            </Text>
          </TouchableOpacity>
          {launchEligibility.kind === "live" ? (
            <TouchableOpacity
              style={[styles.secondaryButton, (!launchEligibility.canStartLiveWatchParty || !!startingAction) && styles.buttonDisabled]}
              activeOpacity={0.86}
              disabled={!launchEligibility.canStartLiveWatchParty || !!startingAction}
              onPress={() => handleStart("start_live_reaction")}
            >
              <Text style={styles.secondaryButtonText}>
                {reactionBusy ? "Starting..." : launchEligibility.reactionLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.secondaryButton, (!primaryCanStart || !!startingAction) && styles.buttonDisabled]}
            activeOpacity={0.86}
            disabled={!primaryCanStart || !!startingAction}
            onPress={() => handleStart(launchEligibility.primaryAction)}
          >
            <Text style={styles.secondaryButtonText}>
              {primaryBusy ? "Starting..." : launchEligibility.secondaryLabel}
            </Text>
          </TouchableOpacity>
          {launchEligibility.disabledReason ? (
            <Text style={styles.actionHint}>{launchEligibility.disabledReason}</Text>
          ) : null}
          <TouchableOpacity
            style={[styles.secondaryButton, !launchEligibility.canShare && styles.buttonDisabled]}
            activeOpacity={0.86}
            disabled={!launchEligibility.canShare}
            onPress={handleShare}
          >
            <Text style={styles.secondaryButtonText}>Share</Text>
          </TouchableOpacity>
          {canOpenChannel ? (
            <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.86} onPress={openChannel}>
              <Text style={styles.primaryButtonText}>View Platform</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.secondaryButton} activeOpacity={0.86} onPress={openReport}>
            <Text style={styles.secondaryButtonText}>Report</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <ReportSheet
        visible={reportVisible}
        title="Report spectator source"
        description="Send a safety report for this spectator source."
        busy={reportBusy}
        onClose={() => setReportVisible(false)}
        onSubmit={submitReport}
      />
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
    borderRadius: 20,
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
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(168,192,245,0.16)",
    backgroundColor: "#10141D",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.26,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
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
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.18)",
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
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.28)",
    backgroundColor: "rgba(18,14,22,0.92)",
    padding: 18,
    gap: 11,
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
  playbackCard: {
    marginHorizontal: 18,
    marginTop: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(126,215,255,0.26)",
    backgroundColor: "rgba(7,11,18,0.96)",
    padding: 12,
    gap: 10,
  },
  playbackShell: {
    width: "100%",
    aspectRatio: 16 / 9,
    overflow: "hidden",
    borderRadius: 14,
    backgroundColor: "#03050A",
  },
  playbackVideo: {
    width: "100%",
    height: "100%",
  },
  playbackCaption: {
    color: "#AAB5CA",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "800",
  },
  detailCard: {
    marginHorizontal: 18,
    marginTop: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(16,20,29,0.96)",
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
    padding: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(9,12,20,0.84)",
  },
  primaryButton: {
    minHeight: 46,
    width: "100%",
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
    minWidth: "47%",
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
  buttonDisabled: {
    opacity: 0.48,
  },
  actionHint: {
    width: "100%",
    color: "#D7B6C0",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "800",
  },
});
