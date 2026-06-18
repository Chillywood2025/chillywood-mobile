import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { resolvePlatformVisibilityAccess, type VisibilityAccessResolution } from "../../_lib/accessVisibility";
import {
  followChannel,
  readPublicChannelAudienceState,
  unfollowChannel,
  type PublicChannelAudienceState,
} from "../../_lib/channelAudience";
import {
  formatMonetizationCurrency,
  readCreatorMiniPlatformCommerceSurface,
  type CreatorMiniPlatformCommerceSurface,
} from "../../_lib/creatorMonetization";
import {
  readCreatorTipPublicStatus,
  type CreatorTipPublicStatus,
} from "../../_lib/creatorTips";
import {
  formatCreatorVipPassPrice,
  purchaseCreatorVipPass,
  resolveCreatorVipPassAccess,
  type CreatorVipPassAccess,
} from "../../_lib/creatorVipPasses";
import {
  formatChannelSubscriptionPrice,
  purchaseChannelSubscription,
  resolveChannelSubscriptionAccess,
  type ChannelSubscriptionAccess,
} from "../../_lib/channelSubscriptions";
import {
  formatPaidWatchPartyTicketPrice,
  readPublicPaidWatchPartyTicketOfferForCreator,
  type PaidWatchPartyOffer,
} from "../../_lib/paidWatchPartyTickets";
import { formatClipStudioTemplateLabel, type ClipStudioTemplatePreset } from "../../_lib/clipStudio";
import { CREATOR_MONEY_ROUTE_TARGETS } from "../../_lib/creatorMonetizationRouteTargets";
import { isCreatorVideoPubliclyShareable } from "../../_lib/creatorVideoLinks";
import { deleteCreatorVideo, readCreatorVideos, updateCreatorVideoMetadata, type CreatorVideo } from "../../_lib/creatorVideos";
import { readPublicEventSummaries, type CreatorEventSummary } from "../../_lib/liveEvents";
import { buildSafetyReportContext, submitSafetyReport, trackModerationActionUsed } from "../../_lib/moderation";
import { getOfficialPlatformAccount } from "../../_lib/officialAccounts";
import { resolvePlatformDisplayIdentity } from "../../_lib/platformIdentity";
import { isOwnerPlatformMode, isViewerPurchasePlatformMode, resolvePublicPlatformMode } from "../../_lib/platformModes";
import {
  readPlatformBrandStudio,
  readPublicPlatformBranding,
  type PlatformBrandAsset,
  type PlatformBrandFitMode,
  type PlatformBrandingBundle,
} from "../../_lib/platformBranding";
import { resolveSandboxMonetizationTester } from "../../_lib/sandboxMonetizationTesters";
import { useSession } from "../../_lib/session";
import { buildUserChannelProfile, readUserProfileByUserId, type UserChannelProfile, type UserProfile } from "../../_lib/userData";
import { ReportSheet } from "../../components/safety/report-sheet";
import { TipSheet } from "../../components/monetization/tip-sheet";
import { AppActionButton, AppEmptyState, AppSection, AppStatusPill } from "../../components/ui/app-surface";

type ChannelLoadState = "loading" | "ready" | "not_found" | "blocked" | "locked";

const normalizeRouteParam = (value: string | string[] | undefined) =>
  String(Array.isArray(value) ? value[0] : value ?? "").trim();

const buildChannelDeepLink = (userId: string) =>
  `chillywoodmobile://channel/${encodeURIComponent(String(userId ?? "").trim())}`;

const formatRoleLabel = (value?: UserChannelProfile["role"] | null) => {
  if (value === "creator") return "Creator";
  if (value === "host") return "Host";
  return "Viewer";
};

const formatPlatformRoleLabel = (value: UserChannelProfile["role"] | null | undefined, isOwner: boolean) => {
  if (isOwner) return "Your Platform";
  return formatRoleLabel(value);
};

const formatCountLabel = (value: number, singular: string, plural: string) => {
  const normalized = Math.max(0, Math.floor(Number(value) || 0));
  return `${normalized} ${normalized === 1 ? singular : plural}`;
};

const formatStatValue = (value: number | null) => {
  if (value === null) return "—";
  return String(Math.max(0, Math.floor(Number(value) || 0)));
};

const resolveBrandResizeMode = (value?: PlatformBrandFitMode | null) => {
  if (value === "fit") return "contain";
  if (value === "center") return "center";
  return "cover";
};

const buildBrandOverlayColor = (strength?: number | null) => {
  const parsed = Number(strength);
  const alpha = Number.isFinite(parsed) ? Math.max(0.42, Math.min(0.84, parsed)) : 0.7;
  return `rgba(3,6,12,${alpha})`;
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

const hasPlayableVideo = (video: CreatorVideo) => isCreatorVideoPubliclyShareable(video);
const getPublicClipMetadata = (video: CreatorVideo) => (
  video.publicClipMetadata?.isPublic ? video.publicClipMetadata : null
);

const formatPublicClipTemplateLabel = (
  preset: NonNullable<CreatorVideo["publicClipMetadata"]>["templatePreset"],
) => (
  preset ? formatClipStudioTemplateLabel(preset as ClipStudioTemplatePreset) : ""
);

export default function PublicChannelScreen() {
  const router = useRouter();
  const safeAreaInsets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ userId?: string | string[]; preview?: string | string[] }>();
  const routeUserId = normalizeRouteParam(params.userId);
  const publicPreviewMode = normalizeRouteParam(params.preview) === "public";
  const brandDraftPreviewMode = normalizeRouteParam(params.preview) === "brand-draft";
  const { isLoading: sessionLoading, user } = useSession();
  const viewerUserId = String(user?.id ?? "").trim();
  const isOwner = !!routeUserId && !!viewerUserId && routeUserId === viewerUserId;
  const showDraftBranding = isOwner && brandDraftPreviewMode;
  const showOwnerControls = isOwner && !publicPreviewMode && !brandDraftPreviewMode;

  const [loadState, setLoadState] = useState<ChannelLoadState>("loading");
  const [platformAccessResolution, setPlatformAccessResolution] = useState<VisibilityAccessResolution | null>(null);
  const [channel, setChannel] = useState<UserChannelProfile | null>(null);
  const [channelProfile, setChannelProfile] = useState<UserProfile | null>(null);
  const [audienceState, setAudienceState] = useState<PublicChannelAudienceState | null>(null);
  const [videos, setVideos] = useState<CreatorVideo[]>([]);
  const [events, setEvents] = useState<CreatorEventSummary[]>([]);
  const [commerceSurface, setCommerceSurface] = useState<CreatorMiniPlatformCommerceSurface | null>(null);
  const [tipStatus, setTipStatus] = useState<CreatorTipPublicStatus | null>(null);
  const [sandboxTesterActive, setSandboxTesterActive] = useState(false);
  const [tipSheetVisible, setTipSheetVisible] = useState(false);
  const [subscriptionAccess, setSubscriptionAccess] = useState<ChannelSubscriptionAccess | null>(null);
  const [subscriptionBusy, setSubscriptionBusy] = useState(false);
  const [subscriptionNotice, setSubscriptionNotice] = useState<string | null>(null);
  const [vipAccess, setVipAccess] = useState<CreatorVipPassAccess | null>(null);
  const [vipBusy, setVipBusy] = useState(false);
  const [vipNotice, setVipNotice] = useState<string | null>(null);
  const [watchPartyTicketOffer, setWatchPartyTicketOffer] = useState<PaidWatchPartyOffer | null>(null);
  const [platformBranding, setPlatformBranding] = useState<PlatformBrandingBundle | null>(null);
  const [selectedVideoAction, setSelectedVideoAction] = useState<CreatorVideo | null>(null);
  const [videoActionBusy, setVideoActionBusy] = useState(false);
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
      setChannelProfile(null);
      setPlatformAccessResolution(null);
      setAudienceState(null);
      setVideos([]);
      setEvents([]);
      setCommerceSurface(null);
      setTipStatus(null);
      setSandboxTesterActive(false);
      setSubscriptionAccess(null);
      setSubscriptionNotice(null);
      setVipAccess(null);
      setVipNotice(null);
      setWatchPartyTicketOffer(null);
      setPlatformBranding(null);

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
        fallbackDisplayName: "Untitled Platform",
      });

      const nextAudienceState = await readPublicChannelAudienceState(routeUserId).catch(() => null);
      if (!active) return;

      setChannel(nextChannel);
      setChannelProfile(profile);
      setAudienceState(nextAudienceState);

      if (nextAudienceState?.isViewerBlocked) {
        setLoadState("blocked");
        return;
      }

      const nextPlatformAccess = officialAccount
        ? {
          allowed: true,
          visibility: "public" as const,
          reason: "public_allowed" as const,
          isOwner: false,
          isBlocked: false,
          isCircleMember: false,
          isSubscriber: false,
          isFollower: false,
          viewerUserId: viewerUserId || null,
          ownerUserId: routeUserId,
        }
        : await resolvePlatformVisibilityAccess(routeUserId).catch(() => null);
      if (!active) return;
      setPlatformAccessResolution(nextPlatformAccess);

      if (!isOwner && nextPlatformAccess?.allowed !== true) {
        setLoadState("locked");
        return;
      }

      const brandPromise = showDraftBranding
        ? readPlatformBrandStudio(routeUserId).catch(() => null)
        : readPublicPlatformBranding(routeUserId).catch(() => null);
      const [publicVideos, publicEvents, nextCommerceSurface, nextTipStatus, nextSubscriptionAccess, nextVipAccess, nextWatchPartyTicketOffer, nextSandboxTesterActive, nextPlatformBranding] = await Promise.all([
        readCreatorVideos(routeUserId, { includeDrafts: false, limit: 50 }).catch(() => []),
        readPublicEventSummaries(routeUserId).catch(() => []),
        readCreatorMiniPlatformCommerceSurface(routeUserId).catch(() => null),
        readCreatorTipPublicStatus(routeUserId).catch(() => null),
        resolveChannelSubscriptionAccess(routeUserId).catch(() => null),
        resolveCreatorVipPassAccess(routeUserId).catch(() => null),
        readPublicPaidWatchPartyTicketOfferForCreator(routeUserId).catch(() => null),
        resolveSandboxMonetizationTester(viewerUserId, String(user?.email ?? "")).catch(() => false),
        brandPromise,
      ]);

      if (!active) return;

      setVideos(publicVideos);
      setEvents(publicEvents.filter((event) => event.isLiveNow || event.isUpcoming));
      setCommerceSurface(nextCommerceSurface);
      setTipStatus(nextTipStatus);
      setSandboxTesterActive(nextSandboxTesterActive === true);
      setSubscriptionAccess(nextSubscriptionAccess);
      setVipAccess(nextVipAccess);
      setWatchPartyTicketOffer(nextWatchPartyTicketOffer);
      setPlatformBranding(nextPlatformBranding);
      setLoadState("ready");
    };

    void loadChannel();

    return () => {
      active = false;
    };
  }, [routeUserId, sessionLoading, showDraftBranding, user?.email, viewerUserId]);

  const spotlightVideoId = platformBranding?.profile.spotlightVideoId ?? null;
  const featuredVideo = useMemo(() => (
    (spotlightVideoId ? videos.find((video) => video.id === spotlightVideoId) ?? null : null)
    ?? videos[0]
    ?? null
  ), [spotlightVideoId, videos]);
  const latestUploadVideos = useMemo(() => {
    if (!featuredVideo) return videos;
    const withoutFeatured = videos.filter((video) => video.id !== featuredVideo.id);
    return withoutFeatured.length ? withoutFeatured : videos;
  }, [featuredVideo, videos]);
  const liveNowEvents = useMemo(() => events.filter((event) => event.isLiveNow), [events]);
  const upcomingEvents = useMemo(() => events.filter((event) => event.isUpcoming), [events]);
  const isOfficialChannel = channel?.identityKind === "official_platform";
  const platformMode = resolvePublicPlatformMode({
    isOwner,
    sandboxTesterActive,
    publicPreviewMode,
  });
  const platformIdentity = useMemo(() => resolvePlatformDisplayIdentity({
    channel,
    profile: channelProfile,
    fallbackDisplayName: "Untitled Platform",
  }), [channel, channelProfile]);
  const platformDisplayName = platformIdentity.displayName;
  const platformHandle = platformIdentity.handle;
  const followerCount = audienceState?.followerCount ?? null;
  const viewerFollowState = audienceState?.viewerFollowState ?? "unavailable";
  const visibleStats = useMemo(() => {
    return [
      { label: "Followers", value: formatStatValue(followerCount) },
      { label: "Videos", value: String(videos.length) },
      { label: "Events", value: String(liveNowEvents.length + upcomingEvents.length) },
    ];
  }, [followerCount, liveNowEvents.length, upcomingEvents.length, videos.length]);
  const channelPulseCards = useMemo(() => {
    const cards: { label: string; value: string }[] = [
      { label: "Followers", value: formatStatValue(followerCount) },
      { label: "Videos", value: String(videos.length) },
      { label: "Events", value: String(liveNowEvents.length + upcomingEvents.length) },
    ];
    if (featuredVideo) {
      cards.push({
        label: formatDate(featuredVideo.createdAt) || "Published",
        value: spotlightVideoId ? "Featured" : "Latest Upload",
      });
    }
    return cards;
  }, [featuredVideo, followerCount, liveNowEvents.length, spotlightVideoId, upcomingEvents.length, videos.length]);
  const canShowDraftAsset = (asset?: PlatformBrandAsset | null) => {
    if (!asset) return null;
    if (!showDraftBranding) return asset;
    if (asset.deletedAt) return null;
    if (["hidden", "removed", "rejected"].includes(asset.moderationStatus)) return null;
    if (["malware_detected", "scan_failed", "quarantined"].includes(asset.scanStatus)) return null;
    return asset;
  };
  const visibleBrandHeroImage = canShowDraftAsset(platformBranding?.heroImage);
  const visibleBrandHeroPoster = canShowDraftAsset(platformBranding?.heroPoster);
  const visibleBrandBackground = canShowDraftAsset(platformBranding?.backgroundImage);
  const visibleBrandAvatar = canShowDraftAsset(platformBranding?.avatar);
  const visibleBrandLogo = canShowDraftAsset(platformBranding?.logo);
  const brandHeroSource = visibleBrandHeroImage?.signedUrl || visibleBrandHeroPoster?.signedUrl || "";
  const brandBackgroundSource = visibleBrandBackground?.signedUrl || "";
  const brandAvatarSource = visibleBrandAvatar?.signedUrl || channel?.avatarUrl || "";
  const brandLogoSource = visibleBrandLogo?.signedUrl || "";
  const heroResizeMode = resolveBrandResizeMode(platformBranding?.profile.heroFitMode);
  const backgroundResizeMode = resolveBrandResizeMode(platformBranding?.profile.backgroundFitMode);
  const heroOverlayColor = buildBrandOverlayColor(platformBranding?.profile.overlayStrength);

  const aboutItems = useMemo(() => {
    if (!channel) return [];
    const items: { label: string; value: string }[] = [];
    if (channel.tagline) items.push({ label: "About", value: channel.tagline });
    items.push({ label: "Platform", value: formatPlatformRoleLabel(channel.role, isOwner) });
    if (isOwner) items.push({ label: "Profile", value: "Profile settings stay separate from Platform settings." });
    if (followerCount !== null) {
      items.push({ label: "Audience", value: formatCountLabel(followerCount, "follower", "followers") });
    }
    return items;
  }, [channel, followerCount, isOwner]);

  const openPlayer = (video: CreatorVideo) => {
    if (!hasPlayableVideo(video)) {
      Alert.alert("Video unavailable", "This platform video is not playable right now.");
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

  const openStudio = (params?: Record<string, string>) => {
    if (params) {
      router.push({ pathname: "/channel-studio", params } as unknown as Parameters<typeof router.push>[0]);
      return;
    }
    router.push("/channel-studio");
  };

  const refreshPublicVideos = async () => {
    if (!routeUserId) return;
    const nextVideos = await readCreatorVideos(routeUserId, { includeDrafts: false, limit: 50 }).catch(() => []);
    setVideos(nextVideos);
  };

  const updateSelectedVideoVisibility = async (video: CreatorVideo, visibility: "draft" | "public") => {
    if (!showOwnerControls || videoActionBusy) return;
    try {
      setVideoActionBusy(true);
      await updateCreatorVideoMetadata(video.id, { visibility });
      setSelectedVideoAction(null);
      await refreshPublicVideos();
    } catch (error) {
      Alert.alert(
        "Update video",
        error instanceof Error && error.message ? error.message : "Unable to update this video right now.",
      );
    } finally {
      setVideoActionBusy(false);
    }
  };

  const confirmDeleteSelectedVideo = (video: CreatorVideo) => {
    if (!showOwnerControls || videoActionBusy) return;
    Alert.alert(
      "Delete video?",
      `"${video.title}" will be removed from your Platform library.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                setVideoActionBusy(true);
                await deleteCreatorVideo(video);
                setSelectedVideoAction(null);
                await refreshPublicVideos();
              } catch (error) {
                Alert.alert(
                  "Delete video",
                  error instanceof Error && error.message ? error.message : "Unable to delete this video right now.",
                );
              } finally {
                setVideoActionBusy(false);
              }
            })();
          },
        },
      ],
    );
  };

  const openProfile = () => {
    if (!routeUserId) return;
    router.push({
      pathname: "/profile/[userId]",
      params: { userId: routeUserId },
    });
  };

  const refreshSubscriptionAccess = async () => {
    if (!routeUserId) return null;
    const nextAccess = await resolveChannelSubscriptionAccess(routeUserId).catch(() => null);
    setSubscriptionAccess(nextAccess);
    return nextAccess;
  };

  const openSubscriberArea = () => {
    if (!routeUserId) return;
    router.push({
      pathname: "/channel-subscription/[creatorId]",
      params: { creatorId: routeUserId },
    } as unknown as Parameters<typeof router.push>[0]);
  };

  const refreshVipAccess = async () => {
    if (!routeUserId) return null;
    const nextAccess = await resolveCreatorVipPassAccess(routeUserId).catch(() => null);
    setVipAccess(nextAccess);
    return nextAccess;
  };

  const openVipArea = () => {
    if (!routeUserId) return;
    router.push({
      pathname: "/vip-pass/[creatorId]",
      params: { creatorId: routeUserId },
    } as unknown as Parameters<typeof router.push>[0]);
  };

  const handleSubscribe = async () => {
    if (!routeUserId || subscriptionBusy || isOwner) return;
    if (!viewerUserId) {
      Alert.alert("Subscribe", "Sign in to subscribe to this creator Platform.");
      return;
    }
    if (subscriptionAccess?.allowed) {
      openSubscriberArea();
      return;
    }
    if (!subscriptionAccess?.requiresPurchase) {
      Alert.alert("Subscribe", "This creator subscription is not available right now.");
      return;
    }

    try {
      setSubscriptionBusy(true);
      setSubscriptionNotice(null);
      const result = await purchaseChannelSubscription({
        creatorId: routeUserId,
        sourceSurface: "creator_channel_header",
      });
      setSubscriptionAccess(result.access);
      setSubscriptionNotice(
        result.ok && sandboxTesterActive
          ? `Sandbox subscription complete. No money moved. No payout created. ${new Date().toLocaleString()}`
          : result.message,
      );
      if (result.ok) {
        openSubscriberArea();
      } else {
        Alert.alert("Subscribe", result.message);
      }
    } catch (error) {
      Alert.alert(
        "Subscribe",
        error instanceof Error && error.message
          ? error.message
          : "Channel Subscription checkout is not available right now.",
      );
      await refreshSubscriptionAccess();
    } finally {
      setSubscriptionBusy(false);
    }
  };

  const handleGetVip = async () => {
    if (!routeUserId || vipBusy || isOwner) return;
    if (!viewerUserId) {
      Alert.alert("Get VIP", "Sign in to get VIP for this creator Platform.");
      return;
    }
    if (vipAccess?.allowed) {
      openVipArea();
      return;
    }
    if (!vipAccess?.requiresPurchase) {
      Alert.alert("Get VIP", "VIP is not available for this creator right now.");
      return;
    }

    try {
      setVipBusy(true);
      setVipNotice(null);
      const result = await purchaseCreatorVipPass({
        creatorId: routeUserId,
        sourceSurface: "creator_channel_vip_card",
      });
      setVipAccess(result.access);
      setVipNotice(
        result.ok && sandboxTesterActive
          ? `Sandbox VIP complete. No money moved. No payout created. ${new Date().toLocaleString()}`
          : result.message,
      );
      if (result.ok) {
        openVipArea();
      } else {
        Alert.alert("Get VIP", result.message);
      }
    } catch (error) {
      Alert.alert(
        "Get VIP",
        error instanceof Error && error.message
          ? error.message
          : "VIP Pass checkout is not available right now.",
      );
      await refreshVipAccess();
    } finally {
      setVipBusy(false);
    }
  };

  const shareChannel = async () => {
    if (!channel?.id) {
      Alert.alert("Share unavailable", "This Platform is missing the identity needed to share it.");
      return;
    }

    try {
      await Share.share({
        message: `View ${platformDisplayName} on Chi'llywood: ${buildChannelDeepLink(channel.id)}`,
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
      Alert.alert("Follow Platform", "Sign in to follow this Platform.");
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
        Alert.alert("Follow Platform", "Sign in to follow this Platform.");
        return;
      }

      Alert.alert("Follow Platform", "Unable to update this follow relationship right now.");
    } catch {
      Alert.alert("Follow Platform", "Unable to update this follow relationship right now.");
    } finally {
      setFollowBusy(false);
    }
  };

  const openReport = () => {
    if (!channel || isOwner) return;
    if (!viewerUserId) {
      Alert.alert("Report Platform", "Sign in to report this Platform.");
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
          targetLabel: platformDisplayName,
          targetRoleLabel: formatPlatformRoleLabel(channel.role, false),
          targetAuditOwnerKey: channel.auditOwnerKey ?? null,
          platformOwnedTarget: channel.identityKind === "official_platform",
          context: {
            channelUserId: channel.id,
            channelHandle: platformHandle ?? null,
          },
        }),
      });
      setReportVisible(false);
    } catch (error) {
      Alert.alert(
        "Report Platform",
        error instanceof Error && error.message
          ? error.message
          : "Unable to send this report right now.",
      );
    } finally {
      setReportBusy(false);
    }
  };

  const renderBackHeader = () => (
    <View style={[styles.navBar, { paddingTop: Math.max(28, safeAreaInsets.top + 12) }]}>
      <TouchableOpacity style={styles.navButton} activeOpacity={0.82} onPress={() => router.back()}>
        <Text style={styles.navButtonText}>←</Text>
      </TouchableOpacity>
      <Text style={styles.navTitle}>Platform</Text>
      {showOwnerControls ? (
        <TouchableOpacity style={styles.navStudioButton} activeOpacity={0.86} onPress={() => openStudio()}>
          <Text style={styles.navStudioText}>Platform Studio</Text>
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
        <Text style={styles.unavailableTitle}>Platform unavailable</Text>
        <Text style={styles.unavailableBody}>{body}</Text>
        <AppActionButton label="Back" onPress={() => router.back()} variant="primary" />
      </View>
    </View>
  );

  const renderHero = () => {
    if (!channel) return null;
    const followLabel = viewerFollowState === "following" ? "Following" : "Follow";
    const viewerPurchaseMode = isViewerPurchasePlatformMode(platformMode);
    const canRenderFollow = viewerPurchaseMode && viewerFollowState !== "unavailable";
    const canRenderTip = viewerPurchaseMode && (tipStatus?.canTip === true || sandboxTesterActive);
    const canRenderSubscribe = viewerPurchaseMode && sandboxTesterActive && !!subscriptionAccess?.offer && (subscriptionAccess.requiresPurchase || subscriptionAccess.allowed);
    const subscribeLabel = subscriptionAccess?.allowed
      ? "Subscribed"
      : subscriptionBusy
        ? "Subscribing"
        : "Subscribe";

    return (
      <View style={styles.hero}>
        <View style={styles.heroBackdrop}>
          {brandHeroSource ? (
            <Image source={{ uri: brandHeroSource }} resizeMode={heroResizeMode} style={styles.heroImage} />
          ) : null}
          <View style={[styles.heroOverlay, { backgroundColor: heroOverlayColor }]} />
          <View style={styles.heroContent}>
            {brandLogoSource ? (
              <Image source={{ uri: brandLogoSource }} style={styles.heroLogoMark} resizeMode="contain" />
            ) : null}
            <View style={styles.avatarWrap}>
              {brandAvatarSource ? (
                <Image source={{ uri: brandAvatarSource }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarInitial}>
                  {(platformDisplayName || "U").slice(0, 1).toUpperCase()}
                </Text>
              )}
            </View>
            <Text style={styles.channelName} numberOfLines={2}>{platformDisplayName}</Text>
            {platformHandle ? (
              <Text style={styles.channelHandle} numberOfLines={1} testID="platform-public-handle">
                {platformHandle}
              </Text>
            ) : null}
	            {isOfficialChannel ? <Text style={[styles.rolePill, styles.officialRolePill]}>{"Official Chi'llwood"}</Text> : null}
            {showDraftBranding ? <Text style={[styles.rolePill, styles.draftPreviewPill]}>Draft Preview</Text> : null}
            <Text style={styles.rolePill}>{formatPlatformRoleLabel(channel.role, isOwner)}</Text>
            {channel.tagline ? <Text style={styles.channelTagline} numberOfLines={2}>{channel.tagline}</Text> : null}
            <View style={styles.statsRow}>
              {visibleStats.map((stat) => (
                <View key={stat.label} style={styles.statPill}>
                  <Text style={styles.statValue}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.actionRow}>
          {canRenderFollow ? (
            <AppActionButton
              label={followBusy ? "Updating" : followLabel}
              loading={followBusy}
              onPress={toggleFollow}
              style={styles.actionButtonWide}
              variant={viewerFollowState === "following" ? "secondary" : "primary"}
            />
          ) : null}
          {canRenderTip ? (
            <AppActionButton
              label={sandboxTesterActive ? "Sandbox Tip" : "Tip"}
              onPress={() => setTipSheetVisible(true)}
              style={styles.actionButtonWide}
              variant="success"
            />
          ) : null}
          {canRenderSubscribe ? (
            <AppActionButton
              label={subscribeLabel}
              loading={subscriptionBusy}
              onPress={subscriptionAccess?.allowed ? openSubscriberArea : handleSubscribe}
              style={styles.actionButtonWide}
              variant={subscriptionAccess?.allowed ? "secondary" : "primary"}
            />
          ) : null}
          <AppActionButton label="Share" onPress={shareChannel} />
          {viewerPurchaseMode ? (
            <AppActionButton label="Report" onPress={openReport} variant="danger" />
          ) : null}
          <AppActionButton label="View Profile" onPress={openProfile} />
          {showOwnerControls ? (
            <AppActionButton label="Manage Platform" onPress={() => openStudio()} style={styles.actionButtonWide} variant="success" />
          ) : null}
        </View>
      </View>
    );
  };

  const renderChannelPulse = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.pulseScroll}
      contentContainerStyle={styles.pulseRow}
    >
      {channelPulseCards.map((card) => (
        <View key={`${card.value}-${card.label}`} style={styles.pulseCard}>
          <Text style={styles.pulseValue}>{card.value}</Text>
          <Text style={styles.pulseLabel}>{card.label}</Text>
        </View>
      ))}
    </ScrollView>
  );

  const getPublicClipCardTitle = (video: CreatorVideo) => (
    getPublicClipMetadata(video)?.titleText || video.title
  );

  const getPublicClipCardSubtitle = (video: CreatorVideo) => (
    getPublicClipMetadata(video)?.subtitleText || video.description
  );

  const renderPublicClipTemplateBadge = (video: CreatorVideo) => {
    const metadata = getPublicClipMetadata(video);
    const templateLabel = formatPublicClipTemplateLabel(metadata?.templatePreset ?? null);
    if (!templateLabel) return null;
    return (
      <View style={styles.publicClipTemplateBadge}>
        <Text style={styles.publicClipTemplateText}>{templateLabel}</Text>
      </View>
    );
  };

  const renderPublicClipMetadataOverlay = (video: CreatorVideo, variant: "featured" | "shelf") => {
    const metadata = getPublicClipMetadata(video);
    const title = metadata?.titleText.trim() ?? "";
    const subtitle = metadata?.subtitleText.trim() ?? "";
    if (!metadata || (!title && !subtitle)) return null;

    return (
      <View
        pointerEvents="none"
        style={[
          styles.publicClipOverlay,
          variant === "shelf" && styles.publicClipOverlayShelf,
          metadata.titlePosition === "top" && styles.publicClipOverlayTop,
          metadata.titlePosition === "center" && styles.publicClipOverlayCenter,
          metadata.titleStyle === "bold" && styles.publicClipOverlayBold,
          metadata.titleStyle === "spotlight" && styles.publicClipOverlaySpotlight,
          metadata.titleStyle === "trailer" && styles.publicClipOverlayTrailer,
        ]}
      >
        {title ? <Text style={styles.publicClipOverlayTitle} numberOfLines={2}>{title}</Text> : null}
        {subtitle ? <Text style={styles.publicClipOverlaySubtitle} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
    );
  };

  const renderOwnerVideoActionButton = (video: CreatorVideo) => (
    showOwnerControls ? (
      <TouchableOpacity
        style={styles.videoOverflowButton}
        activeOpacity={0.84}
        onPress={() => setSelectedVideoAction(video)}
        testID="platform-content-overflow-button"
        accessibilityRole="button"
        accessibilityLabel="Open Platform content actions"
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Text style={styles.videoOverflowText}>•••</Text>
      </TouchableOpacity>
    ) : null
  );

  const renderFeaturedVideoCard = (video: CreatorVideo) => (
    <TouchableOpacity
      key={video.id}
      style={styles.featuredSpotlightCard}
      activeOpacity={0.92}
      onPress={() => openPlayer(video)}
      onLongPress={showOwnerControls ? () => setSelectedVideoAction(video) : undefined}
      testID="platform-content-card"
      accessibilityRole="button"
      accessibilityLabel={`Open ${video.title}`}
    >
      <View style={styles.featuredSpotlightMedia}>
        {video.thumbnailUrl ? (
          <Image source={{ uri: video.thumbnailUrl }} resizeMode="cover" style={styles.videoThumbImage} />
        ) : (
          <View style={styles.featuredSpotlightFallback}>
            <Text style={styles.videoThumbInitial}>{video.title.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={styles.mediaScrim} />
        {renderOwnerVideoActionButton(video)}
        {renderPublicClipTemplateBadge(video)}
        {renderPublicClipMetadataOverlay(video, "featured") ?? (
          <View style={styles.featuredMediaFooter}>
            <Text style={styles.cardKicker}>Latest from this Platform</Text>
            <Text style={styles.featuredCardTitle} numberOfLines={2}>{getPublicClipCardTitle(video)}</Text>
          </View>
        )}
      </View>
      <View style={styles.featuredSpotlightCopy}>
        {getPublicClipCardSubtitle(video) ? (
          <Text style={styles.cardBody} numberOfLines={3}>{getPublicClipCardSubtitle(video)}</Text>
        ) : null}
        <View style={styles.metaRow}>
          {formatDate(video.createdAt) ? <Text style={styles.metaText}>{formatDate(video.createdAt)}</Text> : null}
          <Text style={styles.publicChip}>Public</Text>
        </View>
        <TouchableOpacity style={styles.playButton} activeOpacity={0.86} onPress={() => openPlayer(video)}>
          <Text style={styles.playButtonText}>Play</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderLatestUploadCard = (video: CreatorVideo) => (
    <TouchableOpacity
      key={video.id}
      style={styles.shelfCard}
      activeOpacity={0.92}
      onPress={() => openPlayer(video)}
      onLongPress={showOwnerControls ? () => setSelectedVideoAction(video) : undefined}
      testID="platform-content-card"
      accessibilityRole="button"
      accessibilityLabel={`Open ${video.title}`}
    >
      <View style={styles.shelfThumb}>
        {video.thumbnailUrl ? (
          <Image source={{ uri: video.thumbnailUrl }} resizeMode="cover" style={styles.videoThumbImage} />
        ) : (
          <View style={styles.videoThumbFallback}>
            <Text style={styles.videoThumbInitial}>{video.title.slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        {renderOwnerVideoActionButton(video)}
        {renderPublicClipTemplateBadge(video)}
        {renderPublicClipMetadataOverlay(video, "shelf")}
      </View>
      <View style={styles.shelfCopy}>
        <Text style={styles.shelfTitle} numberOfLines={2}>{getPublicClipCardTitle(video)}</Text>
        {getPublicClipCardSubtitle(video) ? (
          <Text style={styles.shelfBody} numberOfLines={2}>{getPublicClipCardSubtitle(video)}</Text>
        ) : null}
        <View style={styles.metaRow}>
          {formatDate(video.createdAt) ? <Text style={styles.metaText}>{formatDate(video.createdAt)}</Text> : null}
          <Text style={styles.publicChip}>Public</Text>
        </View>
        <TouchableOpacity style={styles.shelfPlayButton} activeOpacity={0.86} onPress={() => openPlayer(video)}>
          <Text style={styles.playButtonText}>Play</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderFeatured = () => (
    <AppSection title="Featured" statusLabel={featuredVideo ? "Public" : "Empty"} statusTone={featuredVideo ? "success" : "muted"}>
      {featuredVideo ? (
        renderFeaturedVideoCard(featuredVideo)
      ) : (
        <AppEmptyState
          actionLabel={showOwnerControls ? "Open Platform Studio" : undefined}
          body="This Platform has not published videos yet."
          onAction={showOwnerControls ? openStudio : undefined}
          title="No featured video"
        />
      )}
    </AppSection>
  );

  const renderLatestUploads = () => (
    <AppSection title="Latest Uploads" statusLabel={latestUploadVideos.length ? "Public" : "Empty"} statusTone={latestUploadVideos.length ? "success" : "muted"}>
      {latestUploadVideos.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.shelfScroll}
          contentContainerStyle={styles.shelfRow}
        >
          {latestUploadVideos.map((video) => renderLatestUploadCard(video))}
        </ScrollView>
      ) : (
        <AppEmptyState title="No public uploads yet" body="Public videos appear here after this creator publishes them." />
      )}
    </AppSection>
  );

  const renderEventCard = (event: CreatorEventSummary) => (
    <View key={event.id} style={styles.programmingCard}>
      <Text style={styles.cardKicker}>{formatEventStatus(event)}</Text>
      <Text style={styles.cardTitle} numberOfLines={2}>{event.eventTitle}</Text>
      <Text style={styles.cardBody}>{formatEventDate(event.startsAt)}</Text>
      {event.reminder.canSetReminder ? (
        <Text style={styles.metaText}>Reminder ready</Text>
      ) : null}
    </View>
  );

  const renderLiveNow = () => (
    <AppSection title="Live Now" statusLabel={liveNowEvents.length ? "Live" : "Empty"} statusTone={liveNowEvents.length ? "accent" : "muted"}>
      {liveNowEvents.length ? (
        <View style={styles.listStack}>
          {liveNowEvents.map((event) => renderEventCard(event))}
        </View>
      ) : (
        <AppEmptyState title="No public live room" body="Public live rooms appear here only while they are active." />
      )}
    </AppSection>
  );

  const renderUpcomingEvents = () => (
    <AppSection title="Upcoming Events" statusLabel={upcomingEvents.length ? "Scheduled" : "Empty"} statusTone={upcomingEvents.length ? "default" : "muted"}>
      {upcomingEvents.length ? (
        <View style={styles.listStack}>
          {upcomingEvents.map((event) => renderEventCard(event))}
        </View>
      ) : (
        <AppEmptyState title="No upcoming events" body="Scheduled public creator events appear here when available." />
      )}
    </AppSection>
  );

  const renderMiniPlatformCommerce = () => {
    const products = commerceSurface?.products ?? [];
    return (
      <AppSection title="Platform Store" statusLabel={products.length ? "Sandbox" : "Not active"} statusTone={products.length ? "warning" : "muted"}>
        {products.length ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.shelfScroll}
            contentContainerStyle={styles.shelfRow}
          >
            {products.map((product) => (
              <View key={product.id} style={styles.shelfCard}>
                <View style={styles.shelfCopy}>
                  <Text style={styles.cardKicker}>{product.productType.replaceAll("_", " ").toUpperCase()}</Text>
                  <Text style={styles.shelfTitle} numberOfLines={2}>{product.title}</Text>
                  {product.description ? (
                    <Text style={styles.shelfBody} numberOfLines={2}>{product.description}</Text>
                  ) : null}
                  <View style={styles.metaRow}>
                    <Text style={styles.metaText}>
                      {formatMonetizationCurrency(product.priceCents, product.currency)}
                    </Text>
                    <AppStatusPill label="Checkout pending" tone="warning" />
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        ) : (
          <AppEmptyState
            title="Commerce not active"
            body={`${commerceSurface?.message ?? "Platform commerce is not active yet."} Tips, paid content, products, orders, and cash-out stay disabled until provider and legal checks are complete.`}
          />
        )}
      </AppSection>
    );
  };

  const renderSandboxTesterSurface = () => {
    if (!sandboxTesterActive || platformMode !== "sandbox_tester_mode") return null;

    const firstVideo = videos.find(hasPlayableVideo) ?? null;
    const firstEvent = events[0] ?? null;
    const hasSubscription = !!subscriptionAccess?.offer && (subscriptionAccess.requiresPurchase || subscriptionAccess.allowed);
    const hasVip = !!vipAccess?.offer && (vipAccess.requiresPurchase || vipAccess.allowed);
    const flowCards = [
      {
        title: "Tip creator",
        body: "Sandbox only. No real money moves.",
        button: "Test tip",
        testID: "tester-tip-creator-button",
        onPress: () => setTipSheetVisible(true),
        available: tipStatus?.canTip === true || sandboxTesterActive,
      },
      {
        title: "Paid video",
        body: firstVideo ? "Open a public creator video and unlock it in sandbox mode." : "Video test unavailable - creator needs a public video.",
        button: "Unlock test video",
        testID: "tester-paid-video-unlock-button",
        onPress: () => {
          if (firstVideo) router.push({ pathname: "/player/[id]", params: { id: firstVideo.id, source: "creator-video" } });
        },
        available: !!firstVideo,
      },
      {
        title: "Watch-Party Ticket",
        body: watchPartyTicketOffer?.partyId
          ? "Get a sandbox Watch-Party ticket. No payout is created."
          : "Ticket test unavailable - creator needs a Party Room target.",
        button: "Get test ticket",
        testID: "tester-watch-party-ticket-button",
        onPress: () => {
          if (!watchPartyTicketOffer?.partyId) return;
          router.push({
            pathname: "/watch-party/[partyId]",
            params: { partyId: watchPartyTicketOffer.partyId },
          } as unknown as Parameters<typeof router.push>[0]);
        },
        available: !!watchPartyTicketOffer?.partyId,
      },
      {
        title: "Event Pass",
        body: firstEvent ? "Get a sandbox event pass. No payout is created." : "Event pass unavailable - creator needs an event.",
        button: "Get test event pass",
        testID: "tester-event-pass-button",
        onPress: () => {
          if (firstEvent) router.push(`/event/${firstEvent.id}` as Parameters<typeof router.push>[0]);
        },
        available: !!firstEvent,
      },
      {
        title: "Channel Subscription",
        body: "Creator Platform subscription test. This is not Chi'llywood Premium.",
        button: subscriptionAccess?.allowed ? "Open Subscriber Area" : "Subscribe in test mode",
        testID: "tester-channel-subscribe-button",
        onPress: subscriptionAccess?.allowed ? openSubscriberArea : handleSubscribe,
        available: hasSubscription,
      },
      {
        title: "VIP Pass",
        body: "Creator-specific VIP test. Does not unlock Premium or other creators.",
        button: vipAccess?.allowed ? "Open VIP Area" : "Get test VIP",
        testID: "tester-vip-pass-button",
        onPress: vipAccess?.allowed ? openVipArea : handleGetVip,
        available: hasVip,
      },
    ];

    return (
      <AppSection title="Test Creator Purchases" statusLabel="Sandbox" statusTone="warning">
        <View style={styles.programmingCard}>
          <Text style={styles.cardKicker}>Sandbox only</Text>
          <Text style={styles.cardTitle}>No real money moves.</Text>
          <Text style={styles.cardBody}>
            Try configured creator purchase flows as a tester. Revoked tester access hides these test actions.
          </Text>
          <View style={styles.sandboxFlowGrid}>
            {flowCards.map((flow) => (
              <View key={flow.title} style={[styles.sandboxFlowCard, !flow.available && styles.sandboxFlowCardDisabled]}>
                <Text style={styles.sandboxFlowTitle}>{flow.title}</Text>
                <Text style={styles.sandboxFlowBody}>{flow.body}</Text>
                {flow.available && flow.onPress ? (
                  <TouchableOpacity
                    style={styles.sandboxFlowButton}
                    activeOpacity={0.86}
                    onPress={flow.onPress}
                    testID={flow.testID}
                    accessibilityRole="button"
                    accessibilityLabel={flow.button}
                  >
                    <Text style={styles.sandboxFlowButtonText}>{flow.button}</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={styles.sandboxFlowUnavailable}>Unavailable</Text>
                )}
              </View>
            ))}
          </View>
        </View>
      </AppSection>
    );
  };

  const renderChannelSubscription = () => {
    if (sandboxTesterActive && !isOwnerPlatformMode(platformMode)) return null;
    const offer = subscriptionAccess?.offer ?? null;
    if (!offer || (!sandboxTesterActive && !isOwnerPlatformMode(platformMode))) return null;
    const subscribed = subscriptionAccess?.allowed === true;
    const unavailable = !subscribed && !subscriptionAccess?.requiresPurchase;
    const unavailableCopy = "Channel Subscription is not available for this creator Platform in sandbox right now. Premium, VIP, paid videos, paid rooms, and paid events stay separate.";
    if (isOwnerPlatformMode(platformMode)) {
      return (
        <AppSection title="Channel Subscription" statusLabel={offer ? "Manage" : "Not set"} statusTone={offer ? "success" : "muted"}>
          <View style={styles.programmingCard}>
            <Text style={styles.cardKicker}>Owner tools</Text>
            <Text style={styles.cardTitle}>{offer?.title ?? "Subscription offer"}</Text>
            <Text style={styles.cardBody}>
              Manage this creator Platform subscription. This is separate from Chi'llywood Premium, VIP, paid videos, Watch-Party tickets, paid events, and payouts.
            </Text>
            <View style={styles.ownerCommerceActions}>
              <TouchableOpacity
                style={styles.ownerCommerceButton}
                activeOpacity={0.86}
                onPress={() => router.push(CREATOR_MONEY_ROUTE_TARGETS.platformSubscription.ownerTarget as unknown as Parameters<typeof router.push>[0])}
              >
                <Text style={styles.ownerCommerceButtonText}>Manage subscription offer</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ownerCommerceButtonSecondary} activeOpacity={0.86} onPress={openSubscriberArea}>
                <Text style={styles.ownerCommerceButtonText}>View Subscriber Area</Text>
              </TouchableOpacity>
            </View>
          </View>
        </AppSection>
      );
    }
    return (
      <AppSection
        title="Channel Subscription"
        statusLabel={subscribed ? "Subscribed" : unavailable ? "Unavailable" : "Sandbox"}
        statusTone={subscribed ? "success" : unavailable ? "muted" : "warning"}
      >
        <View style={styles.programmingCard}>
          <Text style={styles.cardKicker}>Creator membership</Text>
          <Text style={styles.cardTitle}>{offer.title}</Text>
	          <Text style={styles.cardBody}>
	            {`Sandbox Test: subscribe to this creator Platform for ${formatChannelSubscriptionPrice(offer.priceCents, offer.currency)}. No live payout. This does not include Chi'llwood Premium, VIP, paid videos, paid Watch-Party tickets, paid events, or other creators.`}
	          </Text>
          {subscriptionNotice ? <Text style={styles.metaText}>{subscriptionNotice}</Text> : null}
          {unavailable ? <Text style={styles.metaText}>{unavailableCopy}</Text> : null}
          <TouchableOpacity
            style={[styles.playButton, (subscriptionBusy || unavailable) && styles.actionButtonDisabled]}
            activeOpacity={0.86}
            disabled={subscriptionBusy || unavailable}
            onPress={subscribed ? openSubscriberArea : handleSubscribe}
            testID="tester-channel-subscribe-button"
            accessibilityLabel="Sandbox Test Subscribe to Creator Channel"
          >
            {subscriptionBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.playButtonText}>{subscribed ? "Open Subscriber Area" : "Subscribe"}</Text>
            )}
          </TouchableOpacity>
        </View>
      </AppSection>
    );
  };

  const renderVipPass = () => {
    if (sandboxTesterActive && !isOwnerPlatformMode(platformMode)) return null;
    const offer = vipAccess?.offer ?? null;
    if (!offer || (!sandboxTesterActive && !isOwnerPlatformMode(platformMode))) return null;
    const isVip = vipAccess?.allowed === true;
    const unavailable = !isVip && !vipAccess?.requiresPurchase;
    const unavailableCopy = "VIP is not available for this creator Platform in sandbox right now. Premium, subscriptions, paid videos, paid rooms, and paid events stay separate.";
    if (isOwnerPlatformMode(platformMode)) {
      return (
        <AppSection title="VIP Pass" statusLabel={offer ? "Manage" : "Not set"} statusTone={offer ? "success" : "muted"}>
          <View style={styles.programmingCard}>
            <Text style={styles.cardKicker}>Owner tools</Text>
            <Text style={styles.cardTitle}>{offer?.title ?? "VIP offer"}</Text>
            <Text style={styles.cardBody}>
              Manage creator-specific VIP for this Platform. VIP does not unlock Chi'llywood Premium, subscriptions, paid videos, Watch-Party tickets, paid events, room authority, or payouts.
            </Text>
            <View style={styles.ownerCommerceActions}>
              <TouchableOpacity
                style={styles.ownerCommerceButton}
                activeOpacity={0.86}
                onPress={() => router.push(CREATOR_MONEY_ROUTE_TARGETS.vipPass.ownerTarget as unknown as Parameters<typeof router.push>[0])}
              >
                <Text style={styles.ownerCommerceButtonText}>Manage VIP offer</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ownerCommerceButtonSecondary} activeOpacity={0.86} onPress={openVipArea}>
                <Text style={styles.ownerCommerceButtonText}>View VIP Area</Text>
              </TouchableOpacity>
            </View>
          </View>
        </AppSection>
      );
    }
    return (
      <AppSection
        title="VIP Pass"
        statusLabel={isVip ? "VIP" : unavailable ? "Unavailable" : "Sandbox"}
        statusTone={isVip ? "success" : unavailable ? "muted" : "warning"}
      >
        <View style={styles.programmingCard}>
          <Text style={styles.cardKicker}>Creator-specific VIP</Text>
          <Text style={styles.cardTitle}>{offer.title}</Text>
          <Text style={styles.cardBody}>
            {`Sandbox Test: get VIP for this creator Platform for ${formatCreatorVipPassPrice(offer.priceCents, offer.currency)}. No live payout. VIP does not unlock Chi'llywood Premium, paid videos, paid Watch-Party tickets, paid events, subscriptions, LiveKit authority, room permissions, or other creators.`}
          </Text>
          {vipNotice ? <Text style={styles.metaText}>{vipNotice}</Text> : null}
          {unavailable ? <Text style={styles.metaText}>{unavailableCopy}</Text> : null}
          <TouchableOpacity
            style={[styles.playButton, (vipBusy || unavailable) && styles.actionButtonDisabled]}
            activeOpacity={0.86}
            disabled={vipBusy || unavailable}
            onPress={isVip ? openVipArea : handleGetVip}
            testID="tester-vip-pass-button"
            accessibilityLabel="Sandbox Test Get Creator VIP"
          >
            {vipBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.playButtonText}>{isVip ? "Open VIP Area" : "Get VIP"}</Text>
            )}
          </TouchableOpacity>
        </View>
      </AppSection>
    );
  };

  const renderPlatformMonetization = () => {
    const firstVideo = videos.find(hasPlayableVideo) ?? null;
    const firstEvent = events[0] ?? null;
    const subscriptionOffer = subscriptionAccess?.offer ?? null;
    const vipOffer = vipAccess?.offer ?? null;
    const subscriptionAvailable = !!subscriptionOffer && (subscriptionAccess?.requiresPurchase || subscriptionAccess?.allowed);
    const vipAvailable = !!vipOffer && (vipAccess?.requiresPurchase || vipAccess?.allowed);

    if (isOwnerPlatformMode(platformMode)) {
      const ownerOffers = [
        {
          title: "Tips",
          body: "Manage contribution settings and test readback. Tips do not unlock content.",
          status: tipStatus?.canTip ? "Ready" : "Setup",
          actions: [
            {
              label: "Manage tip settings",
              onPress: () => router.push(CREATOR_MONEY_ROUTE_TARGETS.tips.ownerTarget as unknown as Parameters<typeof router.push>[0]),
            },
          ],
        },
        {
          title: "Paid videos",
          body: "Set prices from Content. Each unlock applies to one video only.",
          status: firstVideo ? "Content ready" : "Needs video",
          actions: [
            { label: "Manage Content", onPress: () => openStudio({ tab: "content" }) },
            {
              label: "Manage paid offers",
              onPress: () => router.push(CREATOR_MONEY_ROUTE_TARGETS.paidVideo.ownerTarget as unknown as Parameters<typeof router.push>[0]),
            },
          ],
        },
        {
          title: "Watch-Party tickets",
          body: "Choose a Party Room target. Ticket access does not grant host or LiveKit authority.",
          status: watchPartyTicketOffer?.partyId ? "Target ready" : "Needs target",
          actions: [
            {
              label: watchPartyTicketOffer?.partyId ? "Manage ticket target" : "Choose Party Room target",
              onPress: () => router.push(CREATOR_MONEY_ROUTE_TARGETS.watchPartyTicket.ownerTarget as unknown as Parameters<typeof router.push>[0]),
            },
          ],
        },
        {
          title: "Event passes",
          body: "Manage event access. Each pass is for one creator event only.",
          status: firstEvent ? "Event ready" : "Needs event",
          actions: [
            {
              label: "Manage event pass",
              onPress: () => router.push(CREATOR_MONEY_ROUTE_TARGETS.eventPass.ownerTarget as unknown as Parameters<typeof router.push>[0]),
            },
          ],
        },
        {
          title: "Subscription",
          body: "Monthly creator Platform membership. This is not Chi'llywood Premium.",
          status: subscriptionOffer ? "Manage" : "Not set",
          actions: [
            {
              label: "Manage subscription offer",
              onPress: () => router.push(CREATOR_MONEY_ROUTE_TARGETS.platformSubscription.ownerTarget as unknown as Parameters<typeof router.push>[0]),
            },
            { label: "View Subscriber Area", onPress: openSubscriberArea },
          ],
        },
        {
          title: "VIP",
          body: "Creator-specific VIP only. Does not unlock Premium, paid videos, tickets, or events.",
          status: vipOffer ? "Manage" : "Not set",
          actions: [
            {
              label: "Manage VIP offer",
              onPress: () => router.push(CREATOR_MONEY_ROUTE_TARGETS.vipPass.ownerTarget as unknown as Parameters<typeof router.push>[0]),
            },
            { label: "View VIP Area", onPress: openVipArea },
          ],
        },
      ];

      return (
        <AppSection title="Creator Offers" statusLabel="Manage" statusTone="success">
          <View style={styles.creatorOffersIntro}>
            <Text style={styles.cardKicker}>Owner management</Text>
            <Text style={styles.cardTitle}>Manage offers. Do not buy your own.</Text>
            <Text style={styles.cardBody}>
              Premium is app-wide and separate. Live money and payouts remain off unless a future launch lane explicitly enables them.
            </Text>
          </View>
          <View style={styles.offerGrid}>
            {ownerOffers.map((offer) => (
              <View key={offer.title} style={styles.ownerOfferCard}>
                <View style={styles.offerHeaderRow}>
                  <Text style={styles.offerTitle}>{offer.title}</Text>
                  <Text style={styles.offerStatusPill}>{offer.status}</Text>
                </View>
                <Text style={styles.offerBody}>{offer.body}</Text>
                <View style={styles.offerActionRow}>
                  {offer.actions.map((action, index) => (
                    <TouchableOpacity
                      key={`${offer.title}-${action.label}`}
                      style={[styles.offerActionButton, index > 0 && styles.offerActionButtonSecondary]}
                      activeOpacity={0.86}
                      onPress={action.onPress}
                    >
                      <Text style={styles.offerActionText}>{action.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </AppSection>
      );
    }

    if (!isViewerPurchasePlatformMode(platformMode)) return null;

    const supportItems = [
      {
        title: "Tip",
        body: "Send a contribution. Does not unlock content.",
        price: sandboxTesterActive ? "Sandbox test" : null,
        button: sandboxTesterActive ? "Test tip" : "Tip",
        testID: sandboxTesterActive ? "tester-tip-creator-button" : "platform-support-tip-button",
        available: tipStatus?.canTip === true || sandboxTesterActive,
        onPress: () => setTipSheetVisible(true),
      },
      {
        title: "Subscribe",
        body: "Support this Platform monthly. Does not include Premium.",
        price: subscriptionOffer ? formatChannelSubscriptionPrice(subscriptionOffer.priceCents, subscriptionOffer.currency) : null,
        button: subscriptionAccess?.allowed ? "Open Subscriber Area" : sandboxTesterActive ? "Subscribe in test mode" : "Subscribe",
        testID: sandboxTesterActive ? "tester-channel-subscribe-button" : "platform-support-subscribe-button",
        available: subscriptionAvailable,
        busy: subscriptionBusy,
        onPress: subscriptionAccess?.allowed ? openSubscriberArea : handleSubscribe,
      },
      {
        title: "VIP",
        body: "Creator-specific VIP. Does not unlock Premium or paid videos.",
        price: vipOffer ? formatCreatorVipPassPrice(vipOffer.priceCents, vipOffer.currency) : null,
        button: vipAccess?.allowed ? "Open VIP Area" : sandboxTesterActive ? "Get test VIP" : "Get VIP",
        testID: sandboxTesterActive ? "tester-vip-pass-button" : "platform-support-vip-button",
        available: vipAvailable,
        busy: vipBusy,
        onPress: vipAccess?.allowed ? openVipArea : handleGetVip,
      },
      {
        title: "Paid video",
        body: firstVideo ? "Unlock this video only." : "Paid video unavailable until a public video is ready.",
        price: sandboxTesterActive ? "Sandbox unlock" : null,
        button: "Unlock video",
        testID: sandboxTesterActive ? "tester-paid-video-unlock-button" : "platform-support-paid-video-button",
        available: !!firstVideo,
        onPress: () => {
          if (firstVideo) router.push({ pathname: "/player/[id]", params: { id: firstVideo.id, source: "creator-video" } });
        },
      },
      {
        title: "Ticket",
        body: "Access this Watch-Party target only.",
        price: watchPartyTicketOffer ? formatPaidWatchPartyTicketPrice(watchPartyTicketOffer.priceCents, watchPartyTicketOffer.currency) : null,
        button: "Get ticket",
        testID: sandboxTesterActive ? "tester-watch-party-ticket-button" : "platform-support-ticket-button",
        available: !!watchPartyTicketOffer?.partyId,
        onPress: () => {
          if (!watchPartyTicketOffer?.partyId) return;
          router.push({
            pathname: "/watch-party/[partyId]",
            params: { partyId: watchPartyTicketOffer.partyId },
          } as unknown as Parameters<typeof router.push>[0]);
        },
      },
      {
        title: "Event pass",
        body: firstEvent ? "Access this event only." : "Event pass unavailable until an event is ready.",
        price: sandboxTesterActive ? "Sandbox pass" : null,
        button: "Get event pass",
        testID: sandboxTesterActive ? "tester-event-pass-button" : "platform-support-event-pass-button",
        available: !!firstEvent,
        onPress: () => {
          if (firstEvent) router.push(`/event/${firstEvent.id}` as Parameters<typeof router.push>[0]);
        },
      },
    ].filter((item) => item.available);

    if (!supportItems.length) return null;

    return (
      <AppSection title="Support this Platform" statusLabel={sandboxTesterActive ? "Sandbox" : "Available"} statusTone={sandboxTesterActive ? "warning" : "success"}>
        <View style={styles.supportIntro}>
          <Text style={styles.cardKicker}>{sandboxTesterActive ? "Sandbox tester" : "Creator support"}</Text>
          <Text style={styles.cardTitle}>{sandboxTesterActive ? "Test purchases. No real money moves." : "Choose exactly what you want to support."}</Text>
          <Text style={styles.cardBody}>
            Premium, subscriptions, VIP, tips, videos, tickets, and event passes are separate.
          </Text>
        </View>
        <View style={styles.supportList}>
          {supportItems.map((item) => (
            <View key={item.title} style={styles.supportItemCard}>
              <View style={styles.offerHeaderRow}>
                <Text style={styles.offerTitle}>{item.title}</Text>
                {sandboxTesterActive ? <Text style={styles.sandboxBadge}>Sandbox</Text> : null}
              </View>
              <Text style={styles.offerBody}>{item.body}</Text>
              {item.price ? <Text style={styles.offerMeta}>{item.price}</Text> : null}
              {(subscriptionNotice && item.title === "Subscribe") || (vipNotice && item.title === "VIP") ? (
                <Text style={styles.offerMeta}>{item.title === "Subscribe" ? subscriptionNotice : vipNotice}</Text>
              ) : null}
              <TouchableOpacity
                style={[styles.supportButton, item.busy && styles.actionButtonDisabled]}
                activeOpacity={0.86}
                disabled={!!item.busy}
                onPress={item.onPress}
                testID={item.testID}
                accessibilityRole="button"
                accessibilityLabel={item.button}
              >
                {item.busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.supportButtonText}>{item.button}</Text>}
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </AppSection>
    );
  };

  const renderAbout = () => (
    <AppSection title="About" statusLabel={aboutItems.length ? "Public" : "Empty"} statusTone={aboutItems.length ? "success" : "muted"}>
      {aboutItems.length ? (
        <View style={styles.aboutCard}>
          {aboutItems.map((item, index) => (
            <View
              key={item.label}
              style={[
                styles.aboutRow,
                index < aboutItems.length - 1 ? styles.aboutRowDivider : null,
              ]}
            >
              <Text style={styles.aboutLabel}>{item.label}</Text>
              <Text style={styles.aboutValue}>{item.value}</Text>
            </View>
          ))}
        </View>
      ) : (
        <AppEmptyState title="No about details yet" body="This Platform has not added an about section yet." />
      )}
    </AppSection>
  );

  if (loadState === "loading") {
    return (
      <View style={styles.screen}>
        {renderBackHeader()}
        <View style={styles.loadingCard}>
          <ActivityIndicator color="#DC143C" />
          <Text style={styles.loadingText}>Loading creator Platform…</Text>
        </View>
      </View>
    );
  }

  if (loadState === "not_found") {
    return renderUnavailable("This platform could not be found.");
  }

  if (loadState === "blocked") {
    return renderUnavailable("You cannot view this platform.");
  }

  if (loadState === "locked") {
    const isSubscriberOnly = platformAccessResolution?.visibility === "subscriber_only";
    return renderUnavailable(
      isSubscriberOnly
        ? "This Platform is subscriber-only. Subscribers can view this Platform."
        : "This Platform is private. Circle members or subscribers can view this Platform.",
    );
  }

  return (
    <View style={styles.screen}>
      {brandBackgroundSource ? (
        <Image
          source={{ uri: brandBackgroundSource }}
          resizeMode={backgroundResizeMode}
          style={styles.platformBackgroundImage}
        />
      ) : null}
      {brandBackgroundSource ? <View style={styles.platformBackgroundScrim} /> : null}
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 40 + safeAreaInsets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {renderBackHeader()}
        {renderHero()}
        {renderChannelPulse()}
        {renderFeatured()}
        {renderLatestUploads()}
        {renderLiveNow()}
        {renderUpcomingEvents()}
        {renderPlatformMonetization()}
        {renderAbout()}
      </ScrollView>
      <ReportSheet
        visible={reportVisible}
        title="Report Platform"
        description={channel ? `Send a safety report for ${platformDisplayName}.` : "Send a safety report for this Platform."}
        busy={reportBusy}
        onSubmit={submitChannelReport}
        onClose={() => {
          if (reportBusy) return;
          setReportVisible(false);
        }}
      />
      {channel ? (
        <TipSheet
          visible={tipSheetVisible}
          creatorId={channel.id}
          creatorName={platformDisplayName}
          creatorAvatarUrl={brandAvatarSource}
          sourceSurface="creator_channel_header"
          tipStatus={tipStatus}
          sandboxTester={sandboxTesterActive}
          onClose={() => setTipSheetVisible(false)}
        />
      ) : null}
      <Modal
        visible={!!selectedVideoAction}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!videoActionBusy) setSelectedVideoAction(null);
        }}
      >
        <View style={styles.videoActionBackdrop}>
          <TouchableOpacity
            style={styles.videoActionDismiss}
            activeOpacity={1}
            onPress={() => {
              if (!videoActionBusy) setSelectedVideoAction(null);
            }}
          />
          {selectedVideoAction ? (
            <View style={styles.videoActionSheet}>
              <Text style={styles.cardKicker}>Platform content</Text>
              <Text style={styles.videoActionTitle} numberOfLines={2}>{selectedVideoAction.title}</Text>
              <Text style={styles.cardBody}>Owner actions stay hidden from public viewers.</Text>
              <TouchableOpacity
                style={styles.videoActionButton}
                activeOpacity={0.86}
                onPress={() => {
                  const video = selectedVideoAction;
                  setSelectedVideoAction(null);
                  openPlayer(video);
                }}
                testID="platform-content-open-button"
                accessibilityRole="button"
                accessibilityLabel="Open Platform content in Player"
              >
                <Text style={styles.videoActionButtonText}>Open in Player</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.videoActionButton}
                activeOpacity={0.86}
                onPress={() => {
                  const videoId = selectedVideoAction.id;
                  setSelectedVideoAction(null);
                  openStudio({ tab: "content", videoId });
                }}
                testID="platform-content-edit-button"
                accessibilityRole="button"
                accessibilityLabel="Edit Platform content details"
              >
                <Text style={styles.videoActionButtonText}>Edit details</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.videoActionButton}
                activeOpacity={0.86}
                onPress={() => {
                  const videoId = selectedVideoAction.id;
                  setSelectedVideoAction(null);
                  router.push({
                    ...CREATOR_MONEY_ROUTE_TARGETS.paidVideo.ownerTarget,
                    params: {
                      ...CREATOR_MONEY_ROUTE_TARGETS.paidVideo.ownerTarget.params,
                      videoId,
                    },
                  } as unknown as Parameters<typeof router.push>[0]);
                }}
                testID="platform-content-set-price-button"
                accessibilityRole="button"
                accessibilityLabel="Manage paid video offer"
              >
                <Text style={styles.videoActionButtonText}>Set price / manage paid offer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.videoActionButton}
                activeOpacity={0.86}
                onPress={() => {
                  const spotlightVideoId = selectedVideoAction.id;
                  setSelectedVideoAction(null);
                  openStudio({ tab: "brand", spotlightVideoId });
                }}
                testID="platform-content-feature-button"
                accessibilityRole="button"
                accessibilityLabel="Feature Platform content"
              >
                <Text style={styles.videoActionButtonText}>Feature in Platform Studio</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.videoActionButton}
                activeOpacity={0.86}
                disabled={videoActionBusy}
                onPress={() => updateSelectedVideoVisibility(selectedVideoAction, "draft")}
                testID="platform-content-visibility-button"
                accessibilityRole="button"
                accessibilityLabel="Move Platform content to draft"
              >
                <Text style={styles.videoActionButtonText}>Unpublish / move to draft</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.videoActionButton, styles.videoActionButtonDanger]}
                activeOpacity={0.86}
                disabled={videoActionBusy}
                onPress={() => confirmDeleteSelectedVideo(selectedVideoAction)}
                testID="platform-content-delete-button"
                accessibilityRole="button"
                accessibilityLabel="Delete Platform content"
              >
                <Text style={styles.videoActionButtonText}>Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.videoActionCancelButton}
                activeOpacity={0.86}
                disabled={videoActionBusy}
                onPress={() => setSelectedVideoAction(null)}
                accessibilityRole="button"
                accessibilityLabel="Close Platform content actions"
              >
                <Text style={styles.videoActionButtonText}>{videoActionBusy ? "Working..." : "Cancel"}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#07080D",
  },
  platformBackgroundImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    opacity: 0.42,
  },
  platformBackgroundScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3,6,12,0.72)",
  },
  content: {
    paddingBottom: 40,
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
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
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
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 14,
  },
  navStudioText: {
    color: "#F8FAFF",
    fontSize: 13,
    fontWeight: "900",
  },
  navSpacer: {
    width: 72,
  },
  hero: {
    marginHorizontal: 18,
    borderRadius: 26,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "#0B1018",
    shadowColor: "#000",
    shadowOpacity: 0.38,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
    elevation: 10,
  },
  heroBackdrop: {
    minHeight: 352,
    justifyContent: "flex-end",
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(3,6,12,0.7)",
  },
  heroContent: {
    paddingHorizontal: 22,
    paddingTop: 78,
    paddingBottom: 20,
    gap: 11,
  },
  heroLogoMark: {
    position: "absolute",
    top: 22,
    right: 22,
    width: 64,
    height: 64,
    borderRadius: 14,
    backgroundColor: "rgba(6,9,16,0.62)",
  },
  avatarWrap: {
    width: 94,
    height: 94,
    borderRadius: 47,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.38)",
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarInitial: {
    color: "#F8FAFF",
    fontSize: 36,
    fontWeight: "900",
  },
  channelName: {
    color: "#F8FAFF",
    fontSize: 37,
    lineHeight: 42,
    fontWeight: "900",
  },
  channelHandle: {
    color: "#B9C8DE",
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
  },
  channelTagline: {
    color: "#D7E2F3",
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "700",
    maxWidth: 780,
  },
  rolePill: {
    alignSelf: "flex-start",
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    color: "#D6F8FF",
    backgroundColor: "rgba(126,215,255,0.18)",
    fontSize: 12,
    fontWeight: "900",
  },
  officialRolePill: {
    color: "#FFEAF0",
    backgroundColor: "rgba(220,20,60,0.24)",
  },
  draftPreviewPill: {
    color: "#FFE9B7",
    backgroundColor: "rgba(242,194,91,0.18)",
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 8,
  },
  statPill: {
    minWidth: 88,
    flexGrow: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(8,11,18,0.62)",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  statValue: {
    color: "#F8FAFF",
    fontSize: 18,
    fontWeight: "900",
  },
  statLabel: {
    color: "#B7C1D2",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 2,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(9,12,19,0.96)",
  },
  actionButton: {
    minHeight: 46,
    minWidth: 118,
    flexGrow: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(255,255,255,0.07)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  actionButtonWide: {
    flexBasis: "100%",
  },
  actionButtonPrimary: {
    backgroundColor: "#DC143C",
    borderColor: "rgba(255,255,255,0.18)",
  },
  actionButtonSecondary: {
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  actionButtonReport: {
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.035)",
  },
  actionButtonReportText: {
    color: "#9AA7BC",
    fontSize: 13,
    fontWeight: "900",
  },
  actionButtonOwner: {
    backgroundColor: "#DC143C",
    borderColor: "rgba(220,20,60,0.45)",
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
  actionButtonOwnerText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  pulseScroll: {
    marginTop: 14,
  },
  pulseRow: {
    paddingHorizontal: 18,
    gap: 10,
  },
  pulseCard: {
    minWidth: 116,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    backgroundColor: "rgba(255,255,255,0.055)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pulseValue: {
    color: "#F8FAFF",
    fontSize: 13,
    fontWeight: "900",
  },
  pulseLabel: {
    color: "#96A5BE",
    fontSize: 10.5,
    fontWeight: "800",
    marginTop: 2,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 18,
    gap: 13,
  },
  sectionTitle: {
    color: "#F8FAFF",
    fontSize: 23,
    lineHeight: 29,
    fontWeight: "900",
  },
  listStack: {
    gap: 12,
  },
  videoCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#10141D",
    overflow: "hidden",
  },
  featuredVideoCard: {
    backgroundColor: "#111824",
    borderColor: "rgba(126,215,255,0.18)",
  },
  latestVideoCard: {
    backgroundColor: "#0F131C",
  },
  videoThumb: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#171D29",
  },
  featuredVideoThumb: {
    aspectRatio: 16 / 9.6,
  },
  latestVideoThumb: {
    aspectRatio: 16 / 9,
  },
  videoThumbImage: {
    width: "100%",
    height: "100%",
  },
  videoThumbFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#171D29",
  },
  videoThumbInitial: {
    color: "#F8FAFF",
    fontSize: 42,
    fontWeight: "900",
  },
  videoCopy: {
    padding: 17,
    gap: 10,
  },
  featuredSpotlightCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.32)",
    backgroundColor: "#10141D",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 12 },
    elevation: 7,
  },
  featuredSpotlightMedia: {
    width: "100%",
    aspectRatio: 16 / 9.4,
    justifyContent: "flex-end",
    backgroundColor: "#171D29",
  },
  featuredSpotlightFallback: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#171D29",
  },
  mediaScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,6,11,0.34)",
  },
  videoOverflowButton: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 4,
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(5,8,14,0.82)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
  },
  videoOverflowText: {
    color: "#F8FAFF",
    fontSize: 16,
    lineHeight: 18,
    fontWeight: "900",
  },
  publicClipTemplateBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 2,
    borderRadius: 999,
    backgroundColor: "rgba(5,8,14,0.76)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  publicClipTemplateText: {
    color: "#F8FAFF",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
  },
  publicClipOverlay: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 18,
    zIndex: 2,
    borderRadius: 12,
    backgroundColor: "rgba(5,8,14,0.68)",
    paddingHorizontal: 13,
    paddingVertical: 11,
    gap: 3,
  },
  publicClipOverlayShelf: {
    left: 12,
    right: 12,
    bottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
  },
  publicClipOverlayTop: {
    top: 42,
    bottom: undefined,
  },
  publicClipOverlayCenter: {
    top: "38%",
    bottom: undefined,
  },
  publicClipOverlayBold: {
    backgroundColor: "rgba(220,20,60,0.62)",
  },
  publicClipOverlaySpotlight: {
    backgroundColor: "rgba(8,12,18,0.8)",
    borderWidth: 1,
    borderColor: "rgba(242,194,91,0.45)",
  },
  publicClipOverlayTrailer: {
    backgroundColor: "rgba(3,4,8,0.84)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
  },
  publicClipOverlayTitle: {
    color: "#FFFFFF",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "900",
  },
  publicClipOverlaySubtitle: {
    color: "#DDE5F5",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  featuredMediaFooter: {
    padding: 18,
    gap: 7,
  },
  featuredSpotlightCopy: {
    padding: 17,
    gap: 11,
    backgroundColor: "#0E131C",
  },
  cardKicker: {
    color: "#7ED7FF",
    fontSize: 11,
    letterSpacing: 0,
    fontWeight: "900",
  },
  cardTitle: {
    color: "#F8FAFF",
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "900",
  },
  featuredCardTitle: {
    color: "#F8FAFF",
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "900",
  },
  cardBody: {
    color: "#AEB9CF",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
  },
  sandboxFlowGrid: {
    gap: 10,
    marginTop: 8,
  },
  sandboxFlowCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.22)",
    backgroundColor: "rgba(115,134,255,0.08)",
    padding: 12,
    gap: 7,
  },
  sandboxFlowCardDisabled: {
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.035)",
  },
  sandboxFlowTitle: {
    color: "#F8FAFF",
    fontSize: 14,
    fontWeight: "900",
  },
  sandboxFlowBody: {
    color: "#B9C4D8",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  sandboxFlowButton: {
    alignSelf: "flex-start",
    borderRadius: 999,
    backgroundColor: "#DC143C",
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  sandboxFlowButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  sandboxFlowUnavailable: {
    color: "#8F9AB0",
    fontSize: 11,
    fontWeight: "900",
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  metaText: {
    color: "#95A5BF",
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
    minHeight: 46,
    borderRadius: 12,
    backgroundColor: "#F8FAFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  shelfScroll: {
    marginHorizontal: -18,
  },
  shelfRow: {
    paddingHorizontal: 18,
    gap: 12,
  },
  shelfCard: {
    width: 248,
    minHeight: 316,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#10141D",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  shelfThumb: {
    width: "100%",
    aspectRatio: 16 / 9,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#171D29",
  },
  shelfCopy: {
    flex: 1,
    padding: 14,
    gap: 9,
    justifyContent: "space-between",
  },
  shelfTitle: {
    color: "#F8FAFF",
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "900",
  },
  shelfBody: {
    color: "#AEB9CF",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  shelfPlayButton: {
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: "#F8FAFF",
    alignItems: "center",
    justifyContent: "center",
    marginTop: "auto",
  },
  playButtonText: {
    color: "#080A10",
    fontSize: 13,
    fontWeight: "900",
  },
  programmingCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(126,215,255,0.18)",
    backgroundColor: "rgba(14,20,30,0.96)",
    padding: 17,
    gap: 9,
  },
  creatorOffersIntro: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(57,217,138,0.18)",
    backgroundColor: "rgba(14,20,30,0.92)",
    padding: 15,
    gap: 7,
  },
  supportIntro: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(126,215,255,0.18)",
    backgroundColor: "rgba(14,20,30,0.92)",
    padding: 15,
    gap: 7,
  },
  offerGrid: {
    gap: 10,
  },
  supportList: {
    gap: 10,
  },
  ownerOfferCard: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
    padding: 13,
    gap: 9,
  },
  supportItemCard: {
    borderRadius: 15,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.2)",
    backgroundColor: "rgba(115,134,255,0.07)",
    padding: 13,
    gap: 9,
  },
  offerHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  offerTitle: {
    flex: 1,
    color: "#F8FAFF",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  offerBody: {
    color: "#B9C4D8",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  offerMeta: {
    color: "#F2C25B",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
  },
  offerStatusPill: {
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    color: "#BFFFE8",
    backgroundColor: "rgba(57,217,138,0.13)",
    fontSize: 10,
    fontWeight: "900",
  },
  sandboxBadge: {
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
    color: "#D8DEFF",
    backgroundColor: "rgba(115,134,255,0.18)",
    fontSize: 10,
    fontWeight: "900",
  },
  offerActionRow: {
    gap: 8,
  },
  offerActionButton: {
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DC143C",
    paddingHorizontal: 12,
  },
  offerActionButtonSecondary: {
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  offerActionText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  supportButton: {
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFF",
    paddingHorizontal: 12,
  },
  supportButtonText: {
    color: "#080A10",
    fontSize: 12,
    fontWeight: "900",
  },
  ownerCommerceActions: {
    gap: 10,
    marginTop: 4,
  },
  ownerCommerceButton: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DC143C",
    paddingHorizontal: 14,
  },
  ownerCommerceButtonSecondary: {
    minHeight: 46,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    paddingHorizontal: 14,
  },
  ownerCommerceButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  eventCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#10141D",
    padding: 17,
    gap: 9,
  },
  programmingEmptyCard: {
    minHeight: 112,
    borderColor: "rgba(126,215,255,0.15)",
    backgroundColor: "rgba(14,20,30,0.86)",
  },
  aboutCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(16,20,29,0.72)",
    paddingHorizontal: 17,
    paddingVertical: 4,
  },
  videoActionBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.56)",
  },
  videoActionDismiss: {
    ...StyleSheet.absoluteFillObject,
  },
  videoActionSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "#0B1018",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 30,
    gap: 10,
  },
  videoActionTitle: {
    color: "#F8FAFF",
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
  },
  videoActionButton: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    paddingHorizontal: 14,
  },
  videoActionButtonDanger: {
    borderColor: "rgba(255,92,122,0.35)",
    backgroundColor: "rgba(220,20,60,0.18)",
  },
  videoActionCancelButton: {
    minHeight: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#DC143C",
    paddingHorizontal: 14,
  },
  videoActionButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  aboutRow: {
    gap: 5,
    paddingVertical: 14,
  },
  aboutRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  aboutLabel: {
    color: "#95A5BF",
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
    minHeight: 118,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#10141D",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    gap: 12,
  },
  featuredEmptyCard: {
    minHeight: 190,
  },
  spotlightEmptyCard: {
    borderColor: "rgba(220,20,60,0.22)",
    backgroundColor: "rgba(18,14,22,0.96)",
  },
  emptyText: {
    color: "#AEB9CF",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtext: {
    color: "#7F8AA1",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySecondaryButton: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.45)",
    backgroundColor: "rgba(220,20,60,0.12)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  emptySecondaryButtonText: {
    color: "#FFE6EC",
    fontSize: 13,
    fontWeight: "900",
  },
  loadingCard: {
    margin: 18,
    minHeight: 180,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#10141D",
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
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#10141D",
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
    borderRadius: 12,
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
