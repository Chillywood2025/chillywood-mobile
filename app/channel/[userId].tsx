import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  followChannel,
  readPublicChannelAudienceState,
  unfollowChannel,
  type PublicChannelAudienceState,
} from "../../_lib/channelAudience";
import { readCreatorVideos, type CreatorVideo } from "../../_lib/creatorVideos";
import { readPublicEventSummaries, type CreatorEventSummary } from "../../_lib/liveEvents";
import { buildSafetyReportContext, submitSafetyReport, trackModerationActionUsed } from "../../_lib/moderation";
import { getOfficialPlatformAccount } from "../../_lib/officialAccounts";
import { useSession } from "../../_lib/session";
import { buildUserChannelProfile, readUserProfileByUserId, type UserChannelProfile } from "../../_lib/userData";
import { ReportSheet } from "../../components/safety/report-sheet";

const SKYLINE_SOURCE = require("../../assets/images/chicago-skyline.jpg");

type ChannelLoadState = "loading" | "ready" | "not_found" | "blocked";

const normalizeRouteParam = (value: string | string[] | undefined) =>
  String(Array.isArray(value) ? value[0] : value ?? "").trim();

const buildChannelDeepLink = (userId: string) =>
  `chillywoodmobile://channel/${encodeURIComponent(String(userId ?? "").trim())}`;

const formatRoleLabel = (value?: UserChannelProfile["role"] | null) => {
  if (value === "creator") return "Creator";
  if (value === "host") return "Host";
  return "Viewer";
};

const formatCountLabel = (value: number, singular: string, plural: string) => {
  const normalized = Math.max(0, Math.floor(Number(value) || 0));
  return `${normalized} ${normalized === 1 ? singular : plural}`;
};

const formatDate = (value?: string | null) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatEventDate = (value?: string | null) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "TBD";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized;
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatEventStatus = (event: CreatorEventSummary) => {
  if (event.isLiveNow) return "Live Now";
  if (event.isUpcoming) return "Upcoming";
  return event.status.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
};

const hasPlayableVideo = (video: CreatorVideo) => !!(video.playbackUrl || video.storagePath);

export default function PublicChannelScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string | string[] }>();
  const routeUserId = normalizeRouteParam(params.userId);
  const { isLoading: sessionLoading, user } = useSession();
  const viewerUserId = String(user?.id ?? "").trim();
  const isOwner = !!routeUserId && !!viewerUserId && routeUserId === viewerUserId;

  const [loadState, setLoadState] = useState<ChannelLoadState>("loading");
  const [channel, setChannel] = useState<UserChannelProfile | null>(null);
  const [audienceState, setAudienceState] = useState<PublicChannelAudienceState | null>(null);
  const [videos, setVideos] = useState<CreatorVideo[]>([]);
  const [events, setEvents] = useState<CreatorEventSummary[]>([]);
  const [followBusy, setFollowBusy] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);

  useEffect(() => {
    let active = true;

    if (sessionLoading) return () => {
      active = false;
    };

    const loadChannel = async () => {
      setLoadState("loading");
      setChannel(null);
      setAudienceState(null);
      setVideos([]);
      setEvents([]);

      if (!routeUserId) {
        setLoadState("not_found");
        return;
      }

      const [profile, officialAccount] = await Promise.all([
        readUserProfileByUserId(routeUserId).catch(() => null),
        Promise.resolve(getOfficialPlatformAccount(routeUserId)),
      ]);

      if (!active) return;

      if (!profile && !officialAccount) {
        setLoadState("not_found");
        return;
      }

      const nextChannel = buildUserChannelProfile({
        id: routeUserId,
        profile,
        fallbackDisplayName: "Untitled Channel",
      });

      const nextAudienceState = await readPublicChannelAudienceState(routeUserId).catch(() => null);
      if (!active) return;

      setChannel(nextChannel);
      setAudienceState(nextAudienceState);

      if (nextAudienceState?.isViewerBlocked) {
        setLoadState("blocked");
        return;
      }

      const [publicVideos, publicEvents] = await Promise.all([
        readCreatorVideos(routeUserId, { includeDrafts: false, limit: 24 }).catch(() => []),
        readPublicEventSummaries(routeUserId).catch(() => []),
      ]);

      if (!active) return;

      setVideos(publicVideos);
      setEvents(publicEvents.filter((event) => event.isLiveNow || event.isUpcoming));
      setLoadState("ready");
    };

    void loadChannel();

    return () => {
      active = false;
    };
  }, [routeUserId, sessionLoading]);

  const featuredVideo = videos[0] ?? null;
  const followerCount = audienceState?.followerCount ?? null;
  const viewerFollowState = audienceState?.viewerFollowState ?? "unavailable";
  const visibleStats = useMemo(() => {
    const stats: { label: string; value: string }[] = [
      { label: "Videos", value: String(videos.length) },
      { label: "Events", value: String(events.length) },
    ];
    if (followerCount !== null) {
      stats.unshift({ label: "Followers", value: String(followerCount) });
    }
    return stats;
  }, [events.length, followerCount, videos.length]);

  const aboutItems = useMemo(() => {
    if (!channel) return [];
    const items: { label: string; value: string }[] = [];
    if (channel.tagline) items.push({ label: "About", value: channel.tagline });
    if (channel.role) items.push({ label: "Role", value: formatRoleLabel(channel.role) });
    if (followerCount !== null) {
      items.push({ label: "Audience", value: formatCountLabel(followerCount, "follower", "followers") });
    }
    return items;
  }, [channel, followerCount]);

  const openPlayer = (video: CreatorVideo) => {
    if (!hasPlayableVideo(video)) {
      Alert.alert("Video unavailable", "This channel video is not playable right now.");
      return;
    }

    router.push({
      pathname: "/player/[id]",
      params: {
        id: video.id,
        source: "creator-video",
      },
    });
  };

  const openStudio = () => {
    router.push("/channel-studio");
  };

  const openProfile = () => {
    if (!routeUserId) return;
    router.push({
      pathname: "/profile/[userId]",
      params: { userId: routeUserId },
    });
  };

  const shareChannel = async () => {
    if (!channel?.id) {
      Alert.alert("Share unavailable", "This channel is missing the identity needed to share it.");
      return;
    }

    try {
      await Share.share({
        message: `View ${channel.displayName} on Chi'llywood: ${buildChannelDeepLink(channel.id)}`,
      });
    } catch {
      Alert.alert("Share unavailable", "Unable to open the share sheet right now.");
    }
  };

  const refreshAudienceState = async () => {
    if (!routeUserId) return;
    const nextAudienceState = await readPublicChannelAudienceState(routeUserId).catch(() => null);
    setAudienceState(nextAudienceState);
  };

  const toggleFollow = async () => {
    if (!routeUserId || followBusy || isOwner) return;

    if (viewerFollowState === "signed_out") {
      Alert.alert("Follow channel", "Sign in to follow this channel.");
      return;
    }

    try {
      setFollowBusy(true);
      const result = viewerFollowState === "following"
        ? await unfollowChannel(routeUserId)
        : await followChannel(routeUserId);

      if (result.status === "completed" || result.status === "noop") {
        await refreshAudienceState();
        return;
      }

      if (result.reason === "signed_out") {
        Alert.alert("Follow channel", "Sign in to follow this channel.");
        return;
      }

      Alert.alert("Follow channel", "Unable to update this follow relationship right now.");
    } catch {
      Alert.alert("Follow channel", "Unable to update this follow relationship right now.");
    } finally {
      setFollowBusy(false);
    }
  };

  const openReport = () => {
    if (!channel || isOwner) return;
    if (!viewerUserId) {
      Alert.alert("Report channel", "Sign in to report this channel.");
      return;
    }
    trackModerationActionUsed({
      surface: "channel",
      action: "open_safety_report",
      targetType: "participant",
      targetId: channel.id,
      sourceRoute: `/channel/${channel.id}`,
      targetAuditOwnerKey: channel.auditOwnerKey ?? null,
      platformOwnedTarget: channel.identityKind === "official_platform",
    });
    setReportVisible(true);
  };

  const submitChannelReport = async (input: { category: Parameters<typeof submitSafetyReport>[0]["category"]; note: string }) => {
    if (!channel) return;
    setReportBusy(true);
    try {
      await submitSafetyReport({
        targetType: "participant",
        targetId: channel.id,
        category: input.category,
        note: input.note,
        context: buildSafetyReportContext({
          sourceSurface: "channel",
          sourceRoute: `/channel/${channel.id}`,
          targetLabel: channel.displayName,
          targetRoleLabel: formatRoleLabel(channel.role),
          targetAuditOwnerKey: channel.auditOwnerKey ?? null,
          platformOwnedTarget: channel.identityKind === "official_platform",
          context: {
            channelUserId: channel.id,
            channelHandle: channel.handle ?? null,
          },
        }),
      });
      setReportVisible(false);
    } catch (error) {
      Alert.alert(
        "Report channel",
        error instanceof Error && error.message
          ? error.message
          : "Unable to send this report right now.",
      );
    } finally {
      setReportBusy(false);
    }
  };

  const renderBackHeader = () => (
    <View style={styles.navBar}>
      <TouchableOpacity style={styles.navButton} activeOpacity={0.82} onPress={() => router.back()}>
        <Text style={styles.navButtonText}>←</Text>
      </TouchableOpacity>
      <Text style={styles.navTitle}>Channel</Text>
      {isOwner ? (
        <TouchableOpacity style={styles.navStudioButton} activeOpacity={0.86} onPress={openStudio}>
          <Text style={styles.navStudioText}>Studio</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.navSpacer} />
      )}
    </View>
  );

  const renderUnavailable = (body: string) => (
    <View style={styles.screen}>
      {renderBackHeader()}
      <View style={styles.unavailableCard}>
        <Text style={styles.unavailableTitle}>Channel unavailable</Text>
        <Text style={styles.unavailableBody}>{body}</Text>
        <TouchableOpacity style={styles.primaryButton} activeOpacity={0.86} onPress={() => router.back()}>
          <Text style={styles.primaryButtonText}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderHero = () => {
    if (!channel) return null;
    const followLabel = viewerFollowState === "following" ? "Following" : "Follow";
    const canRenderFollow = !isOwner && viewerFollowState !== "unavailable";

    return (
      <View style={styles.hero}>
        <ImageBackground source={SKYLINE_SOURCE} resizeMode="cover" style={styles.heroBackdrop}>
          <View style={styles.heroOverlay} />
          <View style={styles.heroContent}>
            <View style={styles.avatarWrap}>
              {channel.avatarUrl ? (
                <Image source={{ uri: channel.avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitial}>
                  {(channel.displayName || "U").slice(0, 1).toUpperCase()}
                </Text>
              )}
            </View>
            <Text style={styles.channelName}>{channel.displayName || "Untitled Channel"}</Text>
            {channel.tagline ? <Text style={styles.channelTagline}>{channel.tagline}</Text> : null}
            {channel.role ? <Text style={styles.rolePill}>{formatRoleLabel(channel.role)}</Text> : null}
            <View style={styles.statsRow}>
              {visibleStats.map((stat) => (
                <View key={stat.label} style={styles.statPill}>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </ImageBackground>

        <View style={styles.actionRow}>
          {canRenderFollow ? (
            <TouchableOpacity
              style={[
                styles.actionButton,
                viewerFollowState === "following" ? styles.actionButtonSecondary : styles.actionButtonPrimary,
                followBusy && styles.actionButtonDisabled,
              ]}
              activeOpacity={0.86}
              disabled={followBusy}
              onPress={toggleFollow}
            >
              <Text style={viewerFollowState === "following" ? styles.actionButtonText : styles.actionButtonTextPrimary}>
                {followBusy ? "Updating" : followLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.actionButton} activeOpacity={0.86} onPress={shareChannel}>
            <Text style={styles.actionButtonText}>Share</Text>
          </TouchableOpacity>
          {!isOwner ? (
            <TouchableOpacity style={styles.actionButton} activeOpacity={0.86} onPress={openReport}>
              <Text style={styles.actionButtonText}>Report</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity style={styles.actionButton} activeOpacity={0.86} onPress={openProfile}>
            <Text style={styles.actionButtonText}>View Profile</Text>
          </TouchableOpacity>
          {isOwner ? (
            <TouchableOpacity style={[styles.actionButton, styles.actionButtonPrimary]} activeOpacity={0.86} onPress={openStudio}>
              <Text style={styles.actionButtonTextPrimary}>Open Channel Studio</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const renderVideoCard = (video: CreatorVideo, featured = false) => (
    <View key={video.id} style={styles.videoCard}>
      <View style={styles.videoThumb}>
        {video.thumbnailUrl ? (
          <Image source={{ uri: video.thumbnailUrl }} style={styles.videoThumbImage} />
        ) : (
          <Text style={styles.videoThumbInitial}>{video.title.slice(0, 1).toUpperCase()}</Text>
        )}
      </View>
      <View style={styles.videoCopy}>
        {featured ? <Text style={styles.cardKicker}>Latest from this channel</Text> : null}
        <Text style={styles.cardTitle}>{video.title}</Text>
        {video.description ? <Text style={styles.cardBody} numberOfLines={3}>{video.description}</Text> : null}
        <View style={styles.metaRow}>
          {formatDate(video.createdAt) ? <Text style={styles.metaText}>{formatDate(video.createdAt)}</Text> : null}
          <Text style={styles.publicChip}>Public</Text>
        </View>
        <TouchableOpacity style={styles.playButton} activeOpacity={0.86} onPress={() => openPlayer(video)}>
          <Text style={styles.playButtonText}>Play</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderFeatured = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Featured</Text>
      {featuredVideo ? (
        renderVideoCard(featuredVideo, true)
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>This channel has not published videos yet.</Text>
        </View>
      )}
    </View>
  );

  const renderLatestUploads = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Latest Uploads</Text>
      {videos.length ? (
        <View style={styles.listStack}>
          {videos.map((video) => renderVideoCard(video))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No public uploads yet.</Text>
        </View>
      )}
    </View>
  );

  const renderEvents = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Live & Upcoming</Text>
      {events.length ? (
        <View style={styles.listStack}>
          {events.map((event) => (
            <View key={event.id} style={styles.eventCard}>
              <Text style={styles.cardKicker}>{formatEventStatus(event)}</Text>
              <Text style={styles.cardTitle}>{event.eventTitle}</Text>
              <Text style={styles.cardBody}>{formatEventDate(event.startsAt)}</Text>
              {event.reminder.canSetReminder ? (
                <Text style={styles.metaText}>Reminder ready</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>No upcoming live events yet.</Text>
        </View>
      )}
    </View>
  );

  const renderAbout = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>About</Text>
      {aboutItems.length ? (
        <View style={styles.aboutCard}>
          {aboutItems.map((item) => (
            <View key={item.label} style={styles.aboutRow}>
              <Text style={styles.aboutLabel}>{item.label}</Text>
              <Text style={styles.aboutValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>This channel has not added an about section yet.</Text>
        </View>
      )}
    </View>
  );

  if (loadState === "loading") {
    return (
      <View style={styles.screen}>
        {renderBackHeader()}
        <View style={styles.loadingCard}>
          <ActivityIndicator color="#DC143C" />
          <Text style={styles.loadingText}>Loading channel…</Text>
        </View>
      </View>
    );
  }

  if (loadState === "not_found") {
    return renderUnavailable("This channel could not be found.");
  }

  if (loadState === "blocked") {
    return renderUnavailable("You cannot view this channel.");
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {renderBackHeader()}
        {renderHero()}
        {renderFeatured()}
        {renderLatestUploads()}
        {renderEvents()}
        {renderAbout()}
      </ScrollView>
      <ReportSheet
        visible={reportVisible}
        title="Report channel"
        description={channel ? `Send a safety report for ${channel.displayName}.` : "Send a safety report for this channel."}
        busy={reportBusy}
        onSubmit={submitChannelReport}
        onClose={() => {
          if (reportBusy) return;
          setReportVisible(false);
        }}
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
    paddingBottom: 34,
  },
  navBar: {
    minHeight: 92,
    paddingTop: 46,
    paddingHorizontal: 18,
    paddingBottom: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  navButtonText: {
    color: "#F8FAFF",
    fontSize: 24,
    fontWeight: "800",
  },
  navTitle: {
    color: "#F8FAFF",
    fontSize: 15,
    fontWeight: "900",
  },
  navStudioButton: {
    minWidth: 72,
    minHeight: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(220,20,60,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingHorizontal: 14,
  },
  navStudioText: {
    color: "#FFE7EC",
    fontSize: 13,
    fontWeight: "900",
  },
  navSpacer: {
    width: 72,
  },
  hero: {
    marginHorizontal: 18,
    borderRadius: 8,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#11141D",
  },
  heroBackdrop: {
    minHeight: 370,
    justifyContent: "flex-end",
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,6,12,0.58)",
  },
  heroContent: {
    padding: 24,
    gap: 12,
  },
  avatarWrap: {
    width: 86,
    height: 86,
    borderRadius: 43,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.28)",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarInitial: {
    color: "#F8FAFF",
    fontSize: 34,
    fontWeight: "900",
  },
  channelName: {
    color: "#F8FAFF",
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "900",
  },
  channelTagline: {
    color: "#DCE5F5",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
  },
  rolePill: {
    alignSelf: "flex-start",
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    color: "#BFFFE8",
    backgroundColor: "rgba(57,217,138,0.14)",
    fontSize: 12,
    fontWeight: "900",
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  statPill: {
    minWidth: 92,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statValue: {
    color: "#F8FAFF",
    fontSize: 18,
    fontWeight: "900",
  },
  statLabel: {
    color: "#AEB9CF",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    padding: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  actionButton: {
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  actionButtonPrimary: {
    backgroundColor: "#DC143C",
    borderColor: "rgba(255,255,255,0.12)",
  },
  actionButtonSecondary: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  actionButtonDisabled: {
    opacity: 0.7,
  },
  actionButtonText: {
    color: "#EAF0FA",
    fontSize: 13,
    fontWeight: "900",
  },
  actionButtonTextPrimary: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  section: {
    marginTop: 22,
    paddingHorizontal: 18,
    gap: 12,
  },
  sectionTitle: {
    color: "#F8FAFF",
    fontSize: 22,
    fontWeight: "900",
  },
  listStack: {
    gap: 12,
  },
  videoCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#10131B",
    overflow: "hidden",
  },
  videoThumb: {
    width: "100%",
    aspectRatio: 16 / 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#191F2B",
  },
  videoThumbImage: {
    width: "100%",
    height: "100%",
  },
  videoThumbInitial: {
    color: "#F8FAFF",
    fontSize: 42,
    fontWeight: "900",
  },
  videoCopy: {
    padding: 16,
    gap: 10,
  },
  cardKicker: {
    color: "#7ED7FF",
    fontSize: 11,
    fontWeight: "900",
  },
  cardTitle: {
    color: "#F8FAFF",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
  },
  cardBody: {
    color: "#AEB9CF",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  metaText: {
    color: "#91A0BA",
    fontSize: 12,
    fontWeight: "800",
  },
  publicChip: {
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    color: "#BFFFE8",
    backgroundColor: "rgba(57,217,138,0.14)",
    fontSize: 11,
    fontWeight: "900",
  },
  playButton: {
    minHeight: 44,
    borderRadius: 8,
    backgroundColor: "#F8FAFF",
    alignItems: "center",
    justifyContent: "center",
  },
  playButtonText: {
    color: "#080A10",
    fontSize: 13,
    fontWeight: "900",
  },
  eventCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#10131B",
    padding: 16,
    gap: 9,
  },
  aboutCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#10131B",
    padding: 16,
    gap: 14,
  },
  aboutRow: {
    gap: 5,
  },
  aboutLabel: {
    color: "#91A0BA",
    fontSize: 11,
    fontWeight: "900",
  },
  aboutValue: {
    color: "#F8FAFF",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  emptyCard: {
    minHeight: 92,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#10131B",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  emptyText: {
    color: "#AEB9CF",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  loadingCard: {
    margin: 18,
    minHeight: 180,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#10131B",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    color: "#F8FAFF",
    fontSize: 15,
    fontWeight: "800",
  },
  unavailableCard: {
    margin: 18,
    minHeight: 230,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "#10131B",
    justifyContent: "center",
    padding: 20,
    gap: 12,
  },
  unavailableTitle: {
    color: "#F8FAFF",
    fontSize: 24,
    fontWeight: "900",
  },
  unavailableBody: {
    color: "#AEB9CF",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
  },
  primaryButton: {
    minHeight: 46,
    borderRadius: 8,
    backgroundColor: "#DC143C",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
});
