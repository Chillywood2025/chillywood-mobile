import { useLocalSearchParams, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import * as DocumentPicker from "expo-document-picker";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  resolveChannelAccess,
  type ChannelAccessResolution,
} from "../../_lib/accessEntitlements";
import {
    DEFAULT_APP_CONFIG,
    readAppConfig,
    resolveBrandingConfig,
    resolveFeatureConfig,
    resolveMonetizationConfig,
} from "../../_lib/appConfig";
import { trackEvent } from "../../_lib/analytics";
import { getOrCreateDirectThread } from "../../_lib/chat";
import {
  readFriendRelationshipState,
  type FriendRelationshipState,
} from "../../_lib/friendGraph";
import {
  followChannel,
  readMyChannelFollowState,
  unfollowChannel,
  type ChannelViewerFollowState,
} from "../../_lib/channelAudience";
import {
  type CreatorEventSummary,
  type CreatorEventType,
} from "../../_lib/liveEvents";
import {
  readPublicEventReminderSummaries,
  setEventReminderEnrollment,
  type EventReminderEnrollment,
  type PublicEventReminderSummary,
} from "../../_lib/notifications";
import { reportRuntimeError } from "../../_lib/logger";
import {
  readCreatorPermissions,
  getMonetizationAccessSheetPresentation,
  type CreatorPermissionSet,
} from "../../_lib/monetization";
import {
  requireWatchPartyLivePremium,
  type PremiumWatchPartyFeatureAccessDecision,
} from "../../_lib/premiumWatchPartyAccess";
import {
  formatCreatorVideoFileSize,
  getCreatorVideoStorageLimitMessage,
  getCreatorVideoTooLargeMessage,
  isCreatorVideoFileOverChannelMovieLimit,
  readCreatorVideos,
  uploadCreatorVideo,
  type CreatorVideo,
  type CreatorVideoFile,
  type CreatorVideoVisibility,
} from "../../_lib/creatorVideos";
import { buildCreatorVideoDeepLink, isCreatorVideoPubliclyShareable } from "../../_lib/creatorVideoLinks";
import { buildSafetyReportContext, submitSafetyReport, trackModerationActionUsed } from "../../_lib/moderation";
import { getOfficialPlatformAccount } from "../../_lib/officialAccounts";
import {
  createProfilePost,
  createProfilePostComment,
  deleteProfilePostComment,
  deleteProfilePost,
  readProfilePostComments,
  readProfilePostEngagementState,
  readProfilePosts,
  setProfilePostLike,
  PROFILE_POST_BODY_LIMIT,
  PROFILE_POST_COMMENT_BODY_LIMIT,
  type ProfilePost,
  type ProfilePostComment,
  type ProfilePostEngagementState,
} from "../../_lib/profilePosts";
import {
  getSocialAttachmentValidationMessage,
  SOCIAL_ATTACHMENT_PICKER_TYPES,
  SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE,
  type SocialAttachmentFile,
} from "../../_lib/socialAttachments";
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import {
  buildUserChannelProfile,
  readUserProfile,
  readUserProfileByUserId,
  type UserProfile,
} from "../../_lib/userData";
import { CreatorVideoCard } from "../../components/creator-media/creator-video-card";
import { LinkedText } from "../../components/social/linked-text";
import { SocialAttachmentCard } from "../../components/social/social-attachment-card";
import { getWritablePartyUserId } from "../../_lib/watchParty";
import { ReportSheet } from "../../components/safety/report-sheet";
import { AccessSheet } from "../../components/monetization/access-sheet";

type PublicProfileTabKey = "home" | "content" | "live" | "community" | "about";

type ProfileSurfaceCard = {
  title: string;
  kicker: string;
  body: string;
  accent?: "default" | "live" | "official";
};

type OwnerStatCard = {
  label: string;
  value: string;
  body: string;
  tone?: "default" | "live" | "linked";
};

type OwnerQuickAction = {
  label: string;
  onPress: () => void;
  emphasis?: "default" | "primary";
};

type OwnerPromptCard = {
  kicker: string;
  title: string;
  body: string;
  actionLabel?: string;
  onPress?: () => void;
};

type ProfileAccessDetail = {
  label: string;
  value: string;
  body: string;
};

type ProfileViewerFollowState = ChannelViewerFollowState | "loading";

type ProfilePostUiState = {
  engagement?: ProfilePostEngagementState;
  engagementReady?: boolean;
  commentsOpen?: boolean;
  commentsReady?: boolean;
  comments?: ProfilePostComment[];
  commentDraft?: string;
  commentAttachmentFile?: SocialAttachmentFile | null;
  replyTargetCommentId?: string | null;
  commentBusy?: boolean;
  commentNotice?: string | null;
  likeBusy?: boolean;
  deletingCommentId?: string | null;
};

const PROFILE_DEEP_LINK_SCHEME = "chillywoodmobile";

const buildProfileDeepLink = (profileUserId: string) => {
  const normalizedId = encodeURIComponent(String(profileUserId ?? "").trim());
  return `${PROFILE_DEEP_LINK_SCHEME}://profile/${normalizedId}`;
};

const resolveChannelLayoutPreset = (value?: UserProfile["channelLayoutPreset"] | null) => {
  if (value === "live_first" || value === "library_first") {
    return value;
  }
  return "spotlight";
};

const formatChannelRoomAccessValue = (value?: ChannelAccessResolution["watchPartyAccessRule"] | null) => {
  if (value === "party_pass") return "Party Pass";
  if (value === "premium") return "Premium";
  return "Open";
};

const getAccessPostureTitle = (resolution: ChannelAccessResolution | null, isOfficialProfile: boolean) => {
  if (isOfficialProfile || resolution?.reason === "official_access") return "Official Access";
  if (!resolution || resolution.renderState === "loading" || resolution.reason === "missing_channel_context") {
    return "Checking Access";
  }
  if (resolution.classification === "subscriber_access") return "Subscriber Access";
  if (resolution.classification === "private") return "Private Entry";
  if (resolution.classification === "mixed_access") return "Mixed Entry";
  return "Open Channel";
};

const formatPublicActivityVisibilityValue = (value?: UserProfile["publicActivityVisibility"] | null) => {
  switch (value) {
    case "followers_only":
      return "Follower-Led";
    case "subscribers_only":
      return "Subscriber-Led";
    case "private":
      return "Quiet";
    default:
      return "Open";
  }
};

const getPublicActivityVisibilityBody = (value?: UserProfile["publicActivityVisibility"] | null) => {
  switch (value) {
    case "followers_only":
      return "Public activity stays follower-led here, so the channel can feel social without pretending the whole audience sees every signal.";
    case "subscribers_only":
      return "Public activity stays channel-subscriber-led here and remains distinct from account-tier premium access.";
    case "private":
      return "Public activity stays quiet here until the creator opens it up.";
    default:
      return "Public activity can show up openly on this channel.";
  }
};

const formatAudienceSurfaceVisibilityValue = (enabled: boolean) => enabled ? "Active" : "Quiet";

const getAudienceSurfaceVisibilityBody = (surface: "followers" | "subscribers", enabled: boolean) => {
  if (surface === "followers") {
    return enabled
      ? "Follower cues can show up here when that relationship is real."
      : "This channel keeps follower-only cues out of public view right now.";
  }
  return enabled
    ? "Subscriber cues can show up here when the channel relationship is real."
    : "This channel keeps subscriber-only cues out of public view right now.";
};

const formatEventDate = (value?: string | null) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "TBD";
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? normalized : parsed.toLocaleString();
};

const formatProfilePostDate = (value?: string | null) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Just now";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return "Recently";
  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const isProfilePostPubliclyShareable = (post: ProfilePost) => (
  post.visibility === "public"
  && (post.moderationStatus === "clean" || post.moderationStatus === "reported")
);

const isProfilePostEngageable = (post: ProfilePost) => (
  post.visibility === "public"
  && post.moderationStatus === "clean"
);

const formatEngagementCount = (count: number, singular: string, plural: string) => {
  const normalizedCount = Math.max(0, Math.floor(Number(count) || 0));
  if (normalizedCount <= 0) return "";
  return `${normalizedCount} ${normalizedCount === 1 ? singular : plural}`;
};

const formatEventTypeLabel = (value: CreatorEventType) => {
  switch (value) {
    case "live_watch_party":
      return "Live Watch-Party";
    case "watch_party_live":
      return "Watch-Party Live";
    default:
      return "Live First";
  }
};

const formatEventStatusLabel = (event: CreatorEventSummary) => {
  if (event.isLiveNow) return "Live Now";
  if (event.isUpcoming) return "Upcoming";
  if (event.replay.isReplayAvailableNow) return "Replay Available";
  if (event.replay.isReplayExpired) return "Replay Expired";
  return event.status.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
};

const formatEventReminderLabel = (event: CreatorEventSummary) => {
  if (event.reminder.state === "ready") return "Reminder Ready";
  if (event.reminder.reason === "missing_start_time") return "Start Time Needed";
  return "Reminder Not Ready";
};

const formatEventReminderEnrollmentLabel = (enrollment: EventReminderEnrollment) => {
  switch (enrollment.state) {
    case "active":
      return "Reminder Saved";
    case "canceled":
      return "Reminder Off";
    case "signed_out":
      return "Sign In To Save";
    case "not_ready":
      return "Reminder Unavailable";
    default:
      return "Reminder Available";
  }
};

const getEventReminderEnrollmentBody = (enrollment: EventReminderEnrollment) => {
  switch (enrollment.state) {
    case "active":
      return "You are enrolled for this backed event reminder. Delivery still depends on later notification infrastructure.";
    case "canceled":
      return "Your reminder enrollment is currently off. You can turn it back on while this event stays reminder-ready.";
    case "signed_out":
      return "Sign in to save a real reminder enrollment for this backed event.";
    case "not_ready":
      return "Reminder enrollment stays unavailable until the event is scheduled and marked reminder-ready.";
    default:
      return "This event is reminder-ready and can accept a real reminder enrollment.";
  }
};

const getProfileAccessBody = (resolution: ChannelAccessResolution | null, isOfficialProfile: boolean) => {
  if (isOfficialProfile || resolution?.reason === "official_access") {
    return "Verified help and official follow-up stay public here.";
  }
  if (!resolution || resolution.renderState === "loading" || resolution.reason === "missing_channel_context") {
    return "Checking the channel's current entry posture.";
  }
  if (resolution.reason === "channel_defaults_subscriber") {
    return "This channel stays public to browse while deeper conversation and watch-party entry can be subscriber-led.";
  }
  if (resolution.reason === "channel_defaults_private") {
    return "This channel stays public to browse while deeper room entry stays invite-led.";
  }
  if (resolution.reason === "channel_defaults_mixed") {
    return "Some entry stays open while member-only moments stay protected.";
  }
  return "Conversation and watch-party entry stay open by default on this channel.";
};

const getWatchPartyAccessBody = (resolution: ChannelAccessResolution | null, ready: boolean) => {
  if (!ready || !resolution) return "checking watch-party entry";
  if (resolution.joinPolicy === "locked") return "invite-led room entry by default";
  if (resolution.watchPartyAccessRule === "party_pass") return "Party Pass room entry by default";
  if (resolution.watchPartyAccessRule === "premium") return "Premium room entry by default";
  return "open room entry by default";
};

const getCommunicationAccessBody = (resolution: ChannelAccessResolution | null, ready: boolean) => {
  if (!ready || !resolution) return "checking communication-room posture";
  if (resolution.communicationAccessRule === "party_pass") return "linked communication rooms can stay Party Pass-led by default";
  if (resolution.communicationAccessRule === "premium") return "linked communication rooms can stay Premium-led by default";
  return "linked communication rooms stay open by default";
};

const getBrowseAccessValue = (resolution: ChannelAccessResolution | null, isOfficialProfile: boolean) => {
  if (isOfficialProfile || resolution?.reason === "official_access") return "Verified";
  if (!resolution || resolution.renderState === "loading" || resolution.reason === "missing_channel_context") {
    return "Loading";
  }
  return resolution.previewMode === "teaser" ? "Preview" : "Open";
};

const getBrowseAccessBody = (resolution: ChannelAccessResolution | null, isOfficialProfile: boolean) => {
  if (isOfficialProfile || resolution?.reason === "official_access") {
    return "verified platform-owned public identity";
  }
  if (!resolution || resolution.renderState === "loading" || resolution.reason === "missing_channel_context") {
    return "checking public channel posture";
  }
  if (resolution.reason === "channel_defaults_subscriber") {
    return "the channel stays visible while member access protects deeper entry";
  }
  if (resolution.reason === "channel_defaults_private") {
    return "the channel stays visible even when room entry is invite-led";
  }
  if (resolution.reason === "channel_defaults_mixed") {
    return "the channel stays visible while access changes by surface";
  }
  return "the full channel story stays open to browse";
};

const SUPPORTED_PROFILE_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
]);

const SUPPORTED_PROFILE_VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "m4v"]);

const getReadableProfileFileName = (value?: string | null) => String(value ?? "").trim() || "video file";

const getProfileVideoTitleFromName = (value?: string | null) => (
  getReadableProfileFileName(value)
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .trim()
);

const formatProfileFileSize = formatCreatorVideoFileSize;

const isSupportedProfileVideoFile = (file: CreatorVideoFile) => {
  const mimeType = String(file.mimeType ?? "").trim().toLowerCase();
  const extension = String(file.name ?? "").trim().toLowerCase().split(".").pop() ?? "";
  const hasSupportedMimeType = SUPPORTED_PROFILE_VIDEO_MIME_TYPES.has(mimeType) || mimeType.startsWith("video/");
  const hasSupportedExtension = SUPPORTED_PROFILE_VIDEO_EXTENSIONS.has(extension);

  if (hasSupportedMimeType || hasSupportedExtension) return !!file.uri;
  if (!mimeType && !extension) return !!file.uri;

  return false;
};

const formatProfileComposerError = (error: unknown, fallback: string, fileSize?: number | null) => {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  const message = rawMessage.trim().toLowerCase();

  if (!message) return fallback;
  if (message.includes("too large") || message.includes("maximum") || message.includes("exceeded")) {
    return getCreatorVideoStorageLimitMessage(fileSize);
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "Network trouble interrupted your profile upload. Check your connection and try again.";
  }
  if (message.includes("permission") || message.includes("denied") || message.includes("policy") || message.includes("rls")) {
    return "This account cannot publish that profile upload right now.";
  }
  if (message.includes("empty") || message.includes("zero")) {
    return "That video uploaded as an empty file. Choose a non-empty video and try again.";
  }
  if (message.includes("storage") || message.includes("bucket") || message.includes("upload")) {
    return "The video could not be saved to creator storage right now. Try again in a moment.";
  }
  if (message.includes("file") || message.includes("mime") || message.includes("unsupported")) {
    return "Choose an MP4, MOV, WebM, or M4V video file.";
  }

  return fallback;
};

const logProfileComposer = (event: string, details?: Record<string, unknown>) => {
  if (!__DEV__) return;
  console.log("[profile-composer]", event, details ?? {});
};

const buildSocialAttachmentFileFromAsset = (asset: DocumentPicker.DocumentPickerAsset): SocialAttachmentFile => ({
  uri: asset.uri,
  name: asset.name,
  mimeType: asset.mimeType,
  size: asset.size,
});

export default function ProfileScreen() {
  const router = useRouter();
  const scrollViewRef = useRef<ScrollView | null>(null);
  const profilePostComposerYRef = useRef(0);
  const [currentUserId, setCurrentUserId] = useState("");
  const [friendState, setFriendState] = useState<FriendRelationshipState | null>(null);
  const [viewerFollowState, setViewerFollowState] = useState<ProfileViewerFollowState>("unavailable");
  const [followActionBusy, setFollowActionBusy] = useState(false);
  const [appConfig, setAppConfig] = useState(DEFAULT_APP_CONFIG);
  const [creatorSettingsEnabled, setCreatorSettingsEnabled] = useState(DEFAULT_APP_CONFIG.features.creatorSettingsEnabled);
  const [watchPartyPremiumGate, setWatchPartyPremiumGate] = useState<PremiumWatchPartyFeatureAccessDecision | null>(null);
  const [watchPartyPremiumSheetVisible, setWatchPartyPremiumSheetVisible] = useState(false);
  const [avatarQuickActionsOpen, setAvatarQuickActionsOpen] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [profilePostReportTarget, setProfilePostReportTarget] = useState<ProfilePost | null>(null);
  const [profilePosts, setProfilePosts] = useState<ProfilePost[]>([]);
  const [profilePostsReady, setProfilePostsReady] = useState(false);
  const [profilePostsNotice, setProfilePostsNotice] = useState<string | null>(null);
  const [profilePostDraft, setProfilePostDraft] = useState("");
  const [profilePostAttachmentFile, setProfilePostAttachmentFile] = useState<SocialAttachmentFile | null>(null);
  const [profilePostBusy, setProfilePostBusy] = useState(false);
  const [profilePostDeletingId, setProfilePostDeletingId] = useState<string | null>(null);
  const [profilePostUiById, setProfilePostUiById] = useState<Record<string, ProfilePostUiState>>({});
  const [profilePostCommentReportTarget, setProfilePostCommentReportTarget] = useState<{
    post: ProfilePost;
    comment: ProfilePostComment;
  } | null>(null);
  const [creatorVideos, setCreatorVideos] = useState<CreatorVideo[]>([]);
  const [creatorVideosReady, setCreatorVideosReady] = useState(false);
  const [profileComposerOpen, setProfileComposerOpen] = useState(false);
  const [profileComposerText, setProfileComposerText] = useState("");
  const [profileComposerTitle, setProfileComposerTitle] = useState("");
  const [profileComposerFile, setProfileComposerFile] = useState<CreatorVideoFile | null>(null);
  const [profileComposerVisibility, setProfileComposerVisibility] = useState<CreatorVideoVisibility>("public");
  const [profileComposerBusy, setProfileComposerBusy] = useState(false);
  const [profileComposerNotice, setProfileComposerNotice] = useState<string | null>(null);
  const [channelAccessProfile, setChannelAccessProfile] = useState<UserProfile | null>(null);
  const [channelAccessPermissions, setChannelAccessPermissions] = useState<CreatorPermissionSet | null>(null);
  const [channelAccessReady, setChannelAccessReady] = useState(false);
  const [channelAccessResolution, setChannelAccessResolution] = useState<ChannelAccessResolution | null>(null);
  const [publicEvents, setPublicEvents] = useState<CreatorEventSummary[]>([]);
  const [publicReminderSummaries, setPublicReminderSummaries] = useState<PublicEventReminderSummary[]>([]);
  const [publicEventsReady, setPublicEventsReady] = useState(false);
  const [reminderActionLoading, setReminderActionLoading] = useState<string | null>(null);
  const [reminderActionNotice, setReminderActionNotice] = useState<string | null>(null);
  const params = useLocalSearchParams<{
    userId?: string;
    displayName?: string;
    avatarUrl?: string;
    tagline?: string;
    role?: string;
    isLive?: string;
    self?: string;
    partyId?: string;
    mode?: string;
    source?: string;
  }>();
  const userId = String(Array.isArray(params.userId) ? params.userId[0] : params.userId ?? "").trim();
  const displayNameParam = String(Array.isArray(params.displayName) ? params.displayName[0] : params.displayName ?? "").trim();
  const avatarUrlParam = String(Array.isArray(params.avatarUrl) ? params.avatarUrl[0] : params.avatarUrl ?? "").trim();
  const taglineParam = String(Array.isArray(params.tagline) ? params.tagline[0] : params.tagline ?? "").trim();
  const roleParam = String(Array.isArray(params.role) ? params.role[0] : params.role ?? "").trim();
  const isLiveParam = String(Array.isArray(params.isLive) ? params.isLive[0] : params.isLive ?? "").trim().toLowerCase();
  const selfParam = String(Array.isArray(params.self) ? params.self[0] : params.self ?? "").trim().toLowerCase();
  const partyIdParam = String(Array.isArray(params.partyId) ? params.partyId[0] : params.partyId ?? "").trim();
  const modeParam = String(Array.isArray(params.mode) ? params.mode[0] : params.mode ?? "").trim();
  const sourceParam = String(Array.isArray(params.source) ? params.source[0] : params.source ?? "").trim();
  const officialAccount = getOfficialPlatformAccount(userId);
  const profile = buildUserChannelProfile({
    id: userId,
    displayName: displayNameParam,
    avatarUrl: avatarUrlParam,
    tagline: taglineParam,
    role: roleParam,
    isLive: isLiveParam === "1" || isLiveParam === "true" || isLiveParam === "yes" || isLiveParam === "live",
    fallbackDisplayName: "Channel",
  });
  const branding = resolveBrandingConfig(appConfig);
  const monetizationConfig = resolveMonetizationConfig(appConfig);
  useEffect(() => {
    let active = true;
    getWritablePartyUserId()
      .then((resolvedUserId) => {
        if (active) setCurrentUserId(String(resolvedUserId ?? "").trim());
      })
      .catch(() => {
        if (active) setCurrentUserId("");
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;

    setPublicEventsReady(false);

    if (!userId) {
      setPublicEvents([]);
      setPublicReminderSummaries([]);
      setPublicEventsReady(true);
      return () => {
        active = false;
      };
    }

    void readPublicEventReminderSummaries(userId, currentUserId || undefined)
      .then((summaries) => {
        if (!active) return;
        setPublicReminderSummaries(summaries);
        setPublicEvents(summaries.map((summary) => summary.event));
        setPublicEventsReady(true);
      })
      .catch(() => {
        if (!active) return;
        setPublicEvents([]);
        setPublicReminderSummaries([]);
        setPublicEventsReady(true);
      });

    return () => {
      active = false;
    };
  }, [currentUserId, userId]);

  useEffect(() => {
    let active = true;

    readAppConfig()
      .then((config) => {
        if (!active) return;
        setAppConfig(config);
        setCreatorSettingsEnabled(resolveFeatureConfig(config).creatorSettingsEnabled);
      })
      .catch(() => {
        if (!active) return;
        setAppConfig(DEFAULT_APP_CONFIG);
        setCreatorSettingsEnabled(DEFAULT_APP_CONFIG.features.creatorSettingsEnabled);
      });

    return () => {
      active = false;
    };
  }, []);

  const requestedSelfProfile = selfParam === "1" || selfParam === "true";
  const isOfficialProfile = profile.identityKind === "official_platform";
  const hasVerifiedSelfIdentity = !!userId && !!currentUserId && userId === currentUserId;
  const isSelfProfile = !profile.isProtectedFromClaim
    && hasVerifiedSelfIdentity
    && (!requestedSelfProfile || hasVerifiedSelfIdentity);

  useEffect(() => {
    let active = true;

    setCreatorVideosReady(false);

    if (isOfficialProfile || !userId) {
      setCreatorVideos([]);
      setCreatorVideosReady(true);
      return () => {
        active = false;
      };
    }

    void readCreatorVideos(userId, { includeDrafts: isSelfProfile, limit: 24 })
      .then((videos) => {
        if (!active) return;
        setCreatorVideos(videos);
        setCreatorVideosReady(true);
      })
      .catch(() => {
        if (!active) return;
        setCreatorVideos([]);
        setCreatorVideosReady(true);
      });

    return () => {
      active = false;
    };
  }, [isOfficialProfile, isSelfProfile, userId]);

  useEffect(() => {
    let active = true;

    setProfilePostsReady(false);
    setProfilePostsNotice(null);

    if (!userId) {
      setProfilePosts([]);
      setProfilePostsReady(true);
      return () => {
        active = false;
      };
    }

    void readProfilePosts(userId, { includeDrafts: isSelfProfile, limit: 24 })
      .then((posts) => {
        if (!active) return;
        setProfilePosts(posts);
        setProfilePostsReady(true);
      })
      .catch(() => {
        if (!active) return;
        setProfilePosts([]);
        setProfilePostsReady(true);
        setProfilePostsNotice("Unable to load profile updates right now.");
      });

    return () => {
      active = false;
    };
  }, [isSelfProfile, userId]);

  const profilePostIdsKey = useMemo(
    () => profilePosts.map((post) => post.id).join("|"),
    [profilePosts],
  );

  useEffect(() => {
    let active = true;
    const postIds = profilePosts.map((post) => post.id).filter(Boolean);

    if (!postIds.length) {
      setProfilePostUiById({});
      return () => {
        active = false;
      };
    }

    setProfilePostUiById((current) => {
      const next: Record<string, ProfilePostUiState> = {};
      for (const post of profilePosts) {
        next[post.id] = current[post.id] ?? {};
      }
      return next;
    });

    void Promise.all(
      postIds.map((postId) => readProfilePostEngagementState(postId).catch(() => null)),
    ).then((states) => {
      if (!active) return;
      setProfilePostUiById((current) => {
        const next = { ...current };
        states.forEach((state, index) => {
          const postId = postIds[index];
          next[postId] = {
            ...(next[postId] ?? {}),
            engagement: state ?? next[postId]?.engagement,
            engagementReady: !!state,
          };
        });
        return next;
      });
    });

    return () => {
      active = false;
    };
  }, [currentUserId, profilePostIdsKey, profilePosts]);

  const updateProfilePostUiState = (
    postId: string,
    updater: (current: ProfilePostUiState) => ProfilePostUiState,
  ) => {
    setProfilePostUiById((current) => ({
      ...current,
      [postId]: updater(current[postId] ?? {}),
    }));
  };

  const pickSocialAttachmentFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [...SOCIAL_ATTACHMENT_PICKER_TYPES],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled) return null;
    const asset = result.assets[0];
    if (!asset?.uri) throw new Error("Choose an attachment before posting.");

    const file = buildSocialAttachmentFileFromAsset(asset);
    const validationMessage = getSocialAttachmentValidationMessage(file);
    if (validationMessage) throw new Error(validationMessage);
    return file;
  };

  const onPickProfilePostAttachment = async () => {
    try {
      setProfilePostsNotice(null);
      const file = await pickSocialAttachmentFile();
      if (!file) return;
      setProfilePostAttachmentFile(file);
    } catch (error) {
      setProfilePostAttachmentFile(null);
      setProfilePostsNotice(error instanceof Error ? error.message : "Unable to attach that file right now.");
    }
  };

  const onPickProfilePostCommentAttachment = async (post: ProfilePost) => {
    try {
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        commentNotice: null,
      }));
      const file = await pickSocialAttachmentFile();
      if (!file) return;
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        commentAttachmentFile: file,
      }));
    } catch (error) {
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        commentAttachmentFile: null,
        commentNotice: error instanceof Error ? error.message : "Unable to attach that file right now.",
      }));
    }
  };

  const clearProfilePostCommentReply = (postId: string) => {
    updateProfilePostUiState(postId, (current) => ({
      ...current,
      replyTargetCommentId: null,
      commentNotice: null,
    }));
  };

  const scrollProfilePostComposerIntoView = () => {
    setTimeout(() => {
      scrollViewRef.current?.scrollTo({
        y: Math.max(profilePostComposerYRef.current - 22, 0),
        animated: true,
      });
    }, 120);
  };

  const refreshProfilePostEngagement = async (postId: string) => {
    const engagement = await readProfilePostEngagementState(postId);
    updateProfilePostUiState(postId, (current) => ({
      ...current,
      engagement,
      engagementReady: true,
    }));
    return engagement;
  };

  const loadProfilePostComments = async (postId: string) => {
    updateProfilePostUiState(postId, (current) => ({
      ...current,
      commentsReady: false,
      commentNotice: null,
    }));
    try {
      const comments = await readProfilePostComments(postId, { limit: 24 });
      updateProfilePostUiState(postId, (current) => ({
        ...current,
        comments,
        commentsReady: true,
      }));
    } catch {
      updateProfilePostUiState(postId, (current) => ({
        ...current,
        comments: [],
        commentsReady: true,
        commentNotice: "Unable to load comments right now.",
      }));
    }
  };

  const shareCreatorVideo = async (video: CreatorVideo) => {
    if (!isCreatorVideoPubliclyShareable(video)) {
      Alert.alert("Share unavailable", "Only public creator videos can be shared outside this channel.");
      return;
    }

    const link = buildCreatorVideoDeepLink(video.id);
    try {
      await Share.share({
        message: `Watch ${video.title} on Chi'llywood: ${link}`,
      });
    } catch {
      Alert.alert("Share unavailable", "Unable to open the share sheet right now.");
    }
  };

  useEffect(() => {
    let active = true;

    if (isOfficialProfile || !userId) {
      setChannelAccessProfile(null);
      setChannelAccessPermissions(null);
      setChannelAccessReady(true);
      return () => {
        active = false;
      };
    }

    setChannelAccessReady(false);

    Promise.all([
      isSelfProfile
        ? readUserProfile().catch(() => null)
        : readUserProfileByUserId(userId).catch(() => null),
      readCreatorPermissions(userId).catch(() => null),
    ])
      .then(([resolvedProfile, resolvedPermissions]) => {
        if (!active) return;
        setChannelAccessProfile(resolvedProfile);
        setChannelAccessPermissions(resolvedPermissions);
        setChannelAccessReady(true);
      })
      .catch(() => {
        if (!active) return;
        setChannelAccessProfile(null);
        setChannelAccessPermissions(null);
        setChannelAccessReady(true);
      });

    return () => {
      active = false;
    };
  }, [isOfficialProfile, isSelfProfile, userId]);
  useEffect(() => {
    let active = true;

    if (isOfficialProfile) {
      void resolveChannelAccess({ channelUserId: userId, isOfficial: true })
        .then((resolution) => {
          if (active) setChannelAccessResolution(resolution);
        })
        .catch(() => {
          if (active) setChannelAccessResolution(null);
        });

      return () => {
        active = false;
      };
    }

    if (!userId || !channelAccessReady) {
      setChannelAccessResolution(null);
      return () => {
        active = false;
      };
    }

    void resolveChannelAccess({
      channelUserId: userId,
      profile: channelAccessProfile,
      creatorPermissions: channelAccessPermissions,
    })
      .then((resolution) => {
        if (active) setChannelAccessResolution(resolution);
      })
      .catch(() => {
        if (active) setChannelAccessResolution(null);
      });

    return () => {
      active = false;
    };
  }, [channelAccessPermissions, channelAccessProfile, channelAccessReady, isOfficialProfile, userId]);
  useEffect(() => {
    let active = true;

    if (!userId || isOfficialProfile || isSelfProfile) {
      setFriendState(null);
      return () => {
        active = false;
      };
    }

    readFriendRelationshipState(userId)
      .then((nextState) => {
        if (active) setFriendState(nextState);
      })
      .catch(() => {
        if (active) setFriendState(null);
      });

    return () => {
      active = false;
    };
  }, [currentUserId, isOfficialProfile, isSelfProfile, userId]);
  useEffect(() => {
    let active = true;

    if (isSelfProfile) {
      setViewerFollowState("self");
      return () => {
        active = false;
      };
    }

    if (!userId || isOfficialProfile || !currentUserId) {
      setViewerFollowState("unavailable");
      return () => {
        active = false;
      };
    }

    setViewerFollowState("loading");
    void readMyChannelFollowState(userId)
      .then((state) => {
        if (active) setViewerFollowState(state);
      })
      .catch(() => {
        if (active) setViewerFollowState("unavailable");
      });

    return () => {
      active = false;
    };
  }, [currentUserId, isOfficialProfile, isSelfProfile, userId]);
  const [activeTab, setActiveTab] = useState<PublicProfileTabKey>("home");
  const liveNowEvent = useMemo(
    () => publicEvents.find((event) => event.isLiveNow) ?? null,
    [publicEvents],
  );
  const nextUpcomingEvent = useMemo(
    () => publicEvents.find((event) => event.isUpcoming) ?? null,
    [publicEvents],
  );
  const scheduledWatchPartyEvent = useMemo(
    () => publicEvents.find((event) => event.eventType === "watch_party_live" && !!event.linkedTitleId) ?? null,
    [publicEvents],
  );
  const roleLabel = isOfficialProfile
    ? profile.platformRoleLabel ?? "Official"
    : isSelfProfile
      ? "Owner"
      : profile.role === "creator"
        ? "Creator"
        : profile.role === "host"
          ? "Host"
          : "Viewer";
  const channelLabel = isOfficialProfile
    ? "Official Profile"
    : isSelfProfile
      ? "Your Profile"
      : "Profile";
  const profileEyebrow = isOfficialProfile
    ? "OFFICIAL PROFILE"
    : isSelfProfile
      ? "YOUR PROFILE"
      : "PUBLIC PROFILE";
  const channelHandle = useMemo(() => {
    if (profile.handle) return profile.handle;
    const normalizedHandle = profile.displayName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ".")
      .replace(/^\.+|\.+$/g, "");
    if (normalizedHandle) return `@${normalizedHandle}`;
    return isSelfProfile ? "@you" : "@channel";
  }, [isSelfProfile, profile.displayName, profile.handle]);
  const liveActionLabel = profile.isLive ? "Join Live" : "View Live";
  const hasLiveRouteContext = !!partyIdParam;
  const canReportProfile = !isSelfProfile && !!userId;
  const hasLiveTabEntry = !hasLiveRouteContext && (!!liveNowEvent || !!nextUpcomingEvent || profile.isLive);
  const scheduledWatchPartyTitleId = String(scheduledWatchPartyEvent?.linkedTitleId ?? "").trim();
  const canOpenWatchPartyEntry = hasLiveRouteContext || !!scheduledWatchPartyTitleId;
  const liveActionTitle = hasLiveRouteContext ? liveActionLabel : "Live Events";
  const officialGuidanceTopics = officialAccount?.guidanceTopics ?? [];
  const liveStateLabel = isOfficialProfile ? "CONCIERGE READY" : profile.isLive ? "LIVE NOW" : "OFF AIR";
  const routeContextLabel = isOfficialProfile ? "PROTECTED" : hasLiveRouteContext ? "ROOM LINKED" : "CONTEXT NEEDED";
  const channelHomeBody = isOfficialProfile
    ? officialAccount?.trustSummary
      ?? "Chi'llywood's official channel for trusted help, updates, and auditable follow-up."
    : isSelfProfile
      ? "Share updates, connect with people, and guide fans to your Channel."
      : "Read public updates, connect through Chi'lly Chat, and visit the Channel for creator videos.";
  const liveStatusTitle = isOfficialProfile
    ? "Official concierge is ready"
    : profile.isLive
      ? "Channel is live now"
      : "Channel is off air";
  const liveStatusBody = isOfficialProfile
    ? "Open Chi'lly Chat for trusted help, then return here for the official channel view."
    : hasLiveRouteContext
      ? profile.isLive
        ? "Live and watch-party entry both hand back into the linked room."
        : "Room context is attached, so live and watch-party entry stay pointed at the linked room."
      : hasLiveTabEntry
        ? "Use the Live tab for the current schedule and backed events."
        : "No room context is attached yet, but this channel's live posture still stays visible.";
  const showFriendshipHint = !!friendState?.isFriend && !isOfficialProfile && !isSelfProfile;

  const openChannelSettings = (params?: { focus?: "content"; action?: "upload" }) => {
    if (!creatorSettingsEnabled) {
      Alert.alert("Manage Channel", "Creator channel settings are currently hidden by app configuration.");
      return;
    }
    if (params) {
      router.push({ pathname: "/channel-settings", params });
      return;
    }
    router.push("/channel-settings");
  };
  const onPressManageChannel = () => {
    openChannelSettings();
  };
  const onPressUploadVideo = () => {
    if (!creatorSettingsEnabled) {
      Alert.alert("Upload Video", "Creator uploads are currently hidden by app configuration.");
      return;
    }
    setProfileComposerOpen(true);
    setProfileComposerNotice(null);
    setActiveTab("content");
  };
  const refreshProfileCreatorVideos = async () => {
    if (isOfficialProfile || !userId) {
      setCreatorVideos([]);
      setCreatorVideosReady(true);
      return [];
    }

    const videos = await readCreatorVideos(userId, { includeDrafts: isSelfProfile, limit: 24 });
    setCreatorVideos(videos);
    setCreatorVideosReady(true);
    return videos;
  };
  const onPickProfileComposerFile = async () => {
    try {
      setProfileComposerNotice(null);
      logProfileComposer("picker_open");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        logProfileComposer("picker_canceled");
        setProfileComposerNotice("No video selected.");
        return;
      }

      const asset = result.assets[0];
      if (!asset?.uri) {
        logProfileComposer("picker_missing_asset");
        setProfileComposerNotice("Choose a video file before uploading.");
        return;
      }

      const pickedFile: CreatorVideoFile = {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
      };

      if (!isSupportedProfileVideoFile(pickedFile)) {
        logProfileComposer("picker_unsupported", {
          name: pickedFile.name ?? "unnamed",
          mimeType: pickedFile.mimeType ?? null,
        });
        setProfileComposerFile(null);
        setProfileComposerNotice("Choose an MP4, MOV, WebM, or M4V video file.");
        return;
      }

      if (isCreatorVideoFileOverChannelMovieLimit(pickedFile)) {
        logProfileComposer("picker_too_large", {
          name: pickedFile.name ?? "unnamed",
          size: pickedFile.size ?? null,
        });
        setProfileComposerFile(null);
        setProfileComposerNotice(getCreatorVideoTooLargeMessage(pickedFile.size));
        return;
      }

      setProfileComposerFile(pickedFile);
      if (!profileComposerTitle.trim()) {
        setProfileComposerTitle(getProfileVideoTitleFromName(pickedFile.name));
      }
      logProfileComposer("picker_selected", {
        name: pickedFile.name ?? "unnamed",
        mimeType: pickedFile.mimeType ?? null,
        size: pickedFile.size ?? null,
      });
      setProfileComposerNotice(`${getReadableProfileFileName(pickedFile.name)} attached.`);
    } catch (error) {
      logProfileComposer("picker_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      setProfileComposerNotice("Unable to open the video picker right now.");
    }
  };
  const onSubmitProfileComposer = async () => {
    if (!isSelfProfile) return;

    if (!profileComposerFile) {
      setProfileComposerNotice("Attach a video before uploading to your Channel.");
      return;
    }

    if (typeof profileComposerFile.size === "number" && profileComposerFile.size <= 0) {
      setProfileComposerNotice("Choose a non-empty video file before uploading.");
      return;
    }

    if (isCreatorVideoFileOverChannelMovieLimit(profileComposerFile)) {
      setProfileComposerNotice(getCreatorVideoTooLargeMessage(profileComposerFile.size));
      return;
    }

    if (!profileComposerTitle.trim()) {
      setProfileComposerNotice("Add a title before uploading this video.");
      return;
    }

    try {
      setProfileComposerBusy(true);
      setProfileComposerNotice("Uploading to your Channel...");
      logProfileComposer("submit_start", {
        fileName: profileComposerFile.name ?? null,
        fileSize: profileComposerFile.size ?? null,
        visibility: profileComposerVisibility,
      });

      const uploadedVideo = await uploadCreatorVideo({
        file: profileComposerFile,
        title: profileComposerTitle,
        description: profileComposerText,
        visibility: profileComposerVisibility,
      });

      const refreshedVideos = await refreshProfileCreatorVideos().catch(() => []);
      if (!refreshedVideos.some((video) => video.id === uploadedVideo.id)) {
        setCreatorVideos((current) => [uploadedVideo, ...current.filter((video) => video.id !== uploadedVideo.id)]);
        setCreatorVideosReady(true);
      }

      setActiveTab("content");
      setProfileComposerFile(null);
      setProfileComposerTitle("");
      setProfileComposerText("");
      setProfileComposerVisibility("public");
      setProfileComposerNotice(
        profileComposerVisibility === "public"
          ? "Uploaded to your public Channel."
          : "Saved as a draft in your Channel.",
      );
      logProfileComposer("submit_succeeded", {
        id: uploadedVideo.id,
        visibility: uploadedVideo.visibility,
      });
    } catch (error) {
      logProfileComposer("submit_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      setProfileComposerNotice(
        formatProfileComposerError(
          error,
          "Unable to upload this video right now. Try again in a moment.",
          profileComposerFile.size,
        ),
      );
    } finally {
      setProfileComposerBusy(false);
    }
  };
  const onPressLive = () => {
    if (hasLiveRouteContext) {
      if (profile.isLive) {
        router.push({
          pathname: "/watch-party/live-stage/[partyId]",
          params: {
            partyId: partyIdParam,
            ...(modeParam ? { mode: modeParam } : {}),
            ...(sourceParam ? { source: sourceParam } : {}),
          },
        });
        return;
      }

      router.push({
        pathname: "/watch-party/[partyId]",
        params: {
          partyId: partyIdParam,
          ...(modeParam ? { mode: modeParam } : {}),
        },
      });
      return;
    }

    setActiveTab("live");
  };
  const onPressWatchParty = async () => {
    if (hasLiveRouteContext) {
      const access = await requireWatchPartyLivePremium({ accessKey: partyIdParam }).catch(() => null);
      if (!access?.allowed) {
        if (access) setWatchPartyPremiumGate(access);
        setWatchPartyPremiumSheetVisible(true);
        trackEvent("monetization_gate_shown", {
          surface: "profile-watch-party-live",
          reason: access?.reason ?? "premium_required",
          roomId: partyIdParam || "linked-room",
        });
        return;
      }

      setWatchPartyPremiumGate(null);
      router.push({
        pathname: "/watch-party/[partyId]",
        params: {
          partyId: partyIdParam,
          ...(modeParam ? { mode: modeParam } : {}),
          ...(sourceParam ? { source: sourceParam } : {}),
        },
      });
      return;
    }

    if (!scheduledWatchPartyTitleId) return;
    const access = await requireWatchPartyLivePremium({ accessKey: scheduledWatchPartyTitleId }).catch(() => null);
    if (!access?.allowed) {
      if (access) setWatchPartyPremiumGate(access);
      setWatchPartyPremiumSheetVisible(true);
      trackEvent("monetization_gate_shown", {
        surface: "profile-watch-party-live",
        reason: access?.reason ?? "premium_required",
        titleId: scheduledWatchPartyTitleId,
      });
      return;
    }

    setWatchPartyPremiumGate(null);
    router.push({
      pathname: "/watch-party",
      params: {
        titleId: scheduledWatchPartyTitleId,
      },
    });
  };
  const onPressCommunication = async (entryMode: "message" | "voice" | "video" = "message") => {
    if (isSelfProfile) {
      trackEvent("communication_profile_entry_requested", {
        targetRoute: "/chat",
        entryPath: "profile",
        profileIsSelf: "true",
        entryMode,
      });
      router.push("/chat");
      return;
    }

    if (!userId) {
      trackEvent("communication_profile_entry_blocked", {
        entryPath: "profile",
        profileIsSelf: "false",
        reason: "missing_target_user",
      });
      Alert.alert("Chi'lly Chat", "This channel is missing the identity needed to open a direct thread.");
      return;
    }

    try {
      trackEvent("communication_profile_entry_requested", {
        targetRoute: "/chat/[threadId]",
        entryPath: "profile",
        profileIsSelf: "false",
        targetUserId: userId,
        entryMode,
      });

      const thread = await getOrCreateDirectThread({
        userId,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        tagline: profile.tagline,
      });

      router.push({
        pathname: "/chat/[threadId]",
        params: {
          threadId: thread.threadId,
          ...(entryMode === "voice" || entryMode === "video" ? { startCall: entryMode } : {}),
        },
      });
    } catch (error) {
      const isChatAuthFailure = error instanceof Error
        && error.message === "Chi'lly Chat requires a signed-in user.";
      trackEvent("communication_profile_entry_blocked", {
        entryPath: "profile",
        profileIsSelf: "false",
        reason: isChatAuthFailure ? "auth_required" : "thread_open_failed",
        targetUserId: userId,
      });
      const normalizedError = reportRuntimeError("profile-open-chilly-chat", error, {
        targetUserId: userId,
      });
      Alert.alert(
        "Chi'lly Chat",
        isChatAuthFailure
          ? "Sign in to open Chi'lly Chat from public channels."
          : (normalizedError.message || "Unable to open Chi'lly Chat right now."),
      );
    }
  };
  const onPressReportProfile = () => {
    if (!canReportProfile) return;
    trackModerationActionUsed({
      surface: "profile",
      action: "open_safety_report",
      targetType: "participant",
      targetId: userId,
      sourceRoute: `/profile/${userId}`,
      targetAuditOwnerKey: profile.auditOwnerKey ?? null,
      platformOwnedTarget: isOfficialProfile,
    });
    setProfilePostReportTarget(null);
    setProfilePostCommentReportTarget(null);
    setReportVisible(true);
  };
  const onPressViewChannel = () => {
    setActiveTab("content");
  };
  const onPressSettings = () => {
    router.push("/settings");
  };
  const onShareProfile = async () => {
    if (!userId) {
      Alert.alert("Share unavailable", "This profile is missing the identity needed to share it.");
      return;
    }

    try {
      await Share.share({
        message: `View ${profile.displayName} on Chi'llywood: ${buildProfileDeepLink(userId)}`,
      });
    } catch {
      Alert.alert("Share unavailable", "Unable to open the share sheet right now.");
    }
  };
  const onShareProfilePost = async (post: ProfilePost) => {
    if (!userId || !isProfilePostPubliclyShareable(post)) {
      Alert.alert("Share unavailable", "Only public profile posts can be shared.");
      return;
    }

    try {
      await Share.share({
        message: `Check out this Chi'llwood post from ${profile.displayName}: ${buildProfileDeepLink(userId)}`,
      });
    } catch {
      Alert.alert("Share unavailable", "Unable to open the share sheet right now.");
    }
  };
  const onToggleFollowChannel = async () => {
    if (!userId || isSelfProfile || isOfficialProfile || followActionBusy) return;

    try {
      setFollowActionBusy(true);
      const result = viewerFollowState === "following"
        ? await unfollowChannel(userId)
        : await followChannel(userId);

      if (result.status === "completed" || result.status === "noop") {
        setViewerFollowState(result.action === "follow" ? "following" : "not_following");
        return;
      }

      if (result.reason === "signed_out") {
        Alert.alert("Follow channel", "Sign in to follow this creator channel.");
        return;
      }

      Alert.alert("Follow channel", "Unable to update this follow relationship right now.");
    } catch {
      Alert.alert("Follow channel", "Unable to update this follow relationship right now.");
    } finally {
      setFollowActionBusy(false);
    }
  };
  const onSubmitProfilePost = async () => {
    if (!isSelfProfile || profilePostBusy) return;

    const body = profilePostDraft.trim();
    if (!body) {
      setProfilePostsNotice("Write an update before posting.");
      return;
    }
    if (body.length > PROFILE_POST_BODY_LIMIT) {
      setProfilePostsNotice(`Profile updates can be ${PROFILE_POST_BODY_LIMIT} characters or fewer.`);
      return;
    }

    try {
      setProfilePostBusy(true);
      setProfilePostsNotice(null);
      const post = await createProfilePost({
        body,
        visibility: "public",
        attachmentFile: profilePostAttachmentFile,
      });
      setProfilePosts((current) => [post, ...current.filter((entry) => entry.id !== post.id)]);
      setProfilePostUiById((current) => ({
        ...current,
        [post.id]: {
          engagement: {
            postId: post.id,
            viewerUserId: currentUserId || null,
            likeCount: 0,
            commentCount: 0,
            likedByViewer: false,
            canLike: !!currentUserId,
            canComment: !!currentUserId,
          },
          engagementReady: true,
          comments: [],
          commentsReady: true,
        },
      }));
      setProfilePostDraft("");
      setProfilePostAttachmentFile(null);
      setProfilePostsReady(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setProfilePostsNotice(message === SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE
        ? SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE
        : "Unable to post this update right now.");
    } finally {
      setProfilePostBusy(false);
    }
  };
  const onDeleteProfilePost = (post: ProfilePost) => {
    if (!isSelfProfile || profilePostDeletingId) return;

    Alert.alert(
      "Delete update?",
      "This removes the profile update from your public Profile.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                setProfilePostDeletingId(post.id);
                setProfilePostsNotice(null);
                await deleteProfilePost(post.id);
                setProfilePosts((current) => current.filter((entry) => entry.id !== post.id));
                setProfilePostUiById((current) => {
                  const next = { ...current };
                  delete next[post.id];
                  return next;
                });
              } catch {
                setProfilePostsNotice("Unable to delete this update right now.");
              } finally {
                setProfilePostDeletingId(null);
              }
            })();
          },
        },
      ],
    );
  };
  const onToggleProfilePostLike = async (post: ProfilePost) => {
    if (!currentUserId) {
      Alert.alert("Like post", "Sign in to like this post.");
      return;
    }
    if (!isProfilePostEngageable(post)) {
      Alert.alert("Like unavailable", "This post cannot receive likes right now.");
      return;
    }

    const currentState = profilePostUiById[post.id];
    const nextLiked = !(currentState?.engagement?.likedByViewer ?? false);
    updateProfilePostUiState(post.id, (current) => ({
      ...current,
      likeBusy: true,
      commentNotice: null,
    }));

    try {
      const engagement = await setProfilePostLike(post.id, nextLiked);
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        engagement,
        engagementReady: true,
      }));
    } catch {
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        commentNotice: "Unable to update this like right now.",
      }));
    } finally {
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        likeBusy: false,
      }));
    }
  };
  const onToggleProfilePostComments = (post: ProfilePost) => {
    const currentState = profilePostUiById[post.id] ?? {};
    const nextOpen = !currentState.commentsOpen;
    updateProfilePostUiState(post.id, (current) => ({
      ...current,
      commentsOpen: nextOpen,
      commentNotice: null,
    }));
    if (nextOpen && !currentState.commentsReady) {
      void loadProfilePostComments(post.id);
    }
  };
  const onSubmitProfilePostComment = async (post: ProfilePost) => {
    if (!currentUserId) {
      Alert.alert("Comment", "Sign in to comment on this post.");
      return;
    }
    if (!isProfilePostEngageable(post)) {
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        commentNotice: "Comments are unavailable for this post right now.",
      }));
      return;
    }

    const uiState = profilePostUiById[post.id] ?? {};
    const body = String(uiState.commentDraft ?? "").trim();
    if (!body) {
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        commentNotice: "Write a comment before posting.",
      }));
      return;
    }
    if (body.length > PROFILE_POST_COMMENT_BODY_LIMIT) {
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        commentNotice: `Comments can be ${PROFILE_POST_COMMENT_BODY_LIMIT} characters or fewer.`,
      }));
      return;
    }

    updateProfilePostUiState(post.id, (current) => ({
      ...current,
      commentBusy: true,
      commentNotice: null,
    }));
    try {
      const replyTarget = (uiState.comments ?? []).find((comment) => comment.id === uiState.replyTargetCommentId) ?? null;
      const parentCommentId = replyTarget?.parentCommentId || replyTarget?.id || null;
      const comment = await createProfilePostComment({
        postId: post.id,
        body,
        parentCommentId,
        attachmentFile: uiState.commentAttachmentFile,
      });
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        comments: [...(current.comments ?? []), comment],
        commentsReady: true,
        commentsOpen: true,
        commentDraft: "",
        commentAttachmentFile: null,
        replyTargetCommentId: null,
      }));
      await refreshProfilePostEngagement(post.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        commentNotice: message === SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE
          ? SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE
          : "Unable to post this comment right now.",
      }));
    } finally {
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        commentBusy: false,
      }));
    }
  };
  const onDeleteProfilePostCommentPress = (post: ProfilePost, comment: ProfilePostComment) => {
    if (!currentUserId) return;

    Alert.alert(
      "Delete comment?",
      "This removes the comment from this Profile post.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              updateProfilePostUiState(post.id, (current) => ({
                ...current,
                deletingCommentId: comment.id,
                commentNotice: null,
              }));
              try {
                await deleteProfilePostComment(comment.id);
                updateProfilePostUiState(post.id, (current) => ({
                  ...current,
                  comments: (current.comments ?? []).filter((entry) => (
                    entry.id !== comment.id && entry.parentCommentId !== comment.id
                  )),
                  replyTargetCommentId: current.replyTargetCommentId === comment.id
                    ? null
                    : current.replyTargetCommentId,
                }));
                await refreshProfilePostEngagement(post.id);
              } catch {
                updateProfilePostUiState(post.id, (current) => ({
                  ...current,
                  commentNotice: "Unable to delete this comment right now.",
                }));
              } finally {
                updateProfilePostUiState(post.id, (current) => ({
                  ...current,
                  deletingCommentId: null,
                }));
              }
            })();
          },
        },
      ],
    );
  };
  const onPressReportProfilePost = (post: ProfilePost) => {
    if (isSelfProfile || !post.id) return;
    trackModerationActionUsed({
      surface: "profile",
      action: "open_safety_report",
      targetType: "profile_post",
      targetId: post.id,
      sourceRoute: `/profile/${userId}`,
      targetAuditOwnerKey: profile.auditOwnerKey ?? null,
      platformOwnedTarget: isOfficialProfile,
    });
    setProfilePostReportTarget(post);
    setProfilePostCommentReportTarget(null);
    setReportVisible(true);
  };
  const onPressReportProfilePostComment = (post: ProfilePost, comment: ProfilePostComment) => {
    if (!currentUserId || comment.userId === currentUserId) return;
    trackModerationActionUsed({
      surface: "profile",
      action: "open_safety_report",
      targetType: "profile_post_comment",
      targetId: comment.id,
      sourceRoute: `/profile/${userId}`,
      targetAuditOwnerKey: profile.auditOwnerKey ?? null,
      platformOwnedTarget: isOfficialProfile,
    });
    setProfilePostReportTarget(null);
    setProfilePostCommentReportTarget({ post, comment });
    setReportVisible(true);
  };
  const onSubmitProfileReport = async (input: { category: Parameters<typeof submitSafetyReport>[0]["category"]; note: string }) => {
    const commentTarget = profilePostCommentReportTarget;
    const postTarget = profilePostReportTarget;
    if (!canReportProfile && !postTarget && !commentTarget) return;
    setReportBusy(true);
    try {
      if (commentTarget) {
        await submitSafetyReport({
          targetType: "profile_post_comment",
          targetId: commentTarget.comment.id,
          category: input.category,
          note: input.note,
          context: buildSafetyReportContext({
            sourceSurface: "profile",
            sourceRoute: `/profile/${userId}`,
            targetLabel: `${profile.displayName} profile post comment`,
            targetRoleLabel: "Profile post comment",
            targetAuditOwnerKey: profile.auditOwnerKey ?? null,
            platformOwnedTarget: isOfficialProfile,
            context: {
              profileUserId: userId,
              postId: commentTarget.post.id,
              commentPreview: commentTarget.comment.body.slice(0, 140),
            },
          }),
        });
        setProfilePostCommentReportTarget(null);
      } else if (postTarget) {
        await submitSafetyReport({
          targetType: "profile_post",
          targetId: postTarget.id,
          category: input.category,
          note: input.note,
          context: buildSafetyReportContext({
            sourceSurface: "profile",
            sourceRoute: `/profile/${userId}`,
            targetLabel: `${profile.displayName} profile update`,
            targetRoleLabel: "Profile update",
            targetAuditOwnerKey: profile.auditOwnerKey ?? null,
            platformOwnedTarget: isOfficialProfile,
            context: {
              profileUserId: userId,
              postPreview: postTarget.body.slice(0, 140),
            },
          }),
        });
        setProfilePostReportTarget(null);
      } else {
        await submitSafetyReport({
          targetType: "participant",
          targetId: userId,
          category: input.category,
          note: input.note,
          context: buildSafetyReportContext({
            sourceSurface: "profile",
            sourceRoute: `/profile/${userId}`,
            targetLabel: profile.displayName,
            targetRoleLabel: roleLabel,
            targetAuditOwnerKey: profile.auditOwnerKey ?? null,
            platformOwnedTarget: isOfficialProfile,
            context: {
              identityKind: profile.identityKind,
              channelHandle,
            },
          }),
        });
      }
      setReportVisible(false);
    } finally {
      setReportBusy(false);
    }
  };
  const publicCreatorVideoCount = creatorVideos.filter((video) => video.visibility === "public").length;
  const hasCreatorVideoTruth = creatorVideos.length > 0;
  const canShowFollowAction = !isOfficialProfile
    && !isSelfProfile
    && (viewerFollowState === "following" || viewerFollowState === "not_following" || viewerFollowState === "loading");
  const followActionLabel = followActionBusy || viewerFollowState === "loading"
    ? "Checking"
    : viewerFollowState === "following"
      ? "Following"
      : "Follow";
  const publicEventCount = publicEvents.length;
  const liveEventCount = publicEvents.filter((event) => event.isLiveNow).length;
  const channelSignals = [
    {
      label: isOfficialProfile ? "Identity" : "Posts",
      value: isOfficialProfile
        ? "Official"
        : profilePostsReady ? String(profilePosts.length) : "...",
      body: isOfficialProfile
        ? "platform-backed identity"
        : "text updates on this Profile",
      tone: isOfficialProfile ? "official" : "default",
    },
    {
      label: isOfficialProfile ? "Chat" : "Channel",
      value: isOfficialProfile
        ? "Starter"
        : creatorVideosReady ? String(publicCreatorVideoCount) : "...",
      body: isOfficialProfile
        ? "trusted thread open"
        : "public creator videos",
      tone: "linked",
    },
    {
      label: isOfficialProfile ? "Trust" : "Events",
      value: isOfficialProfile
        ? "Audited"
        : publicEventsReady ? String(publicEventCount) : "...",
      body: isOfficialProfile
        ? "protected official continuity"
        : liveEventCount
          ? "live creator event active now"
          : "creator live/watch-party schedule",
      tone: isOfficialProfile ? "official" : liveEventCount ? "live" : "default",
    },
  ] as const;
  const channelHelper = isOfficialProfile
    ? {
        kicker: "CHANNEL FLOW",
        title: "Verified help starts here",
        body: "Use the official thread for trusted help, then return here for the verified account surface.",
      }
    : isSelfProfile
      ? {
          kicker: "CHANNEL",
          title: "Your uploads live in Channel",
          body: creatorVideosReady
            ? hasCreatorVideoTruth
              ? "Your uploads, live moments, and creator events live here."
              : "Upload your first video when you are ready for this Channel to become watchable."
            : "Loading your creator-video library."
        }
      : {
          kicker: "CHANNEL",
          title: "Creator uploads live here",
          body: hasLiveRouteContext
            ? "This visit carries real room context, so live and watch-party handoff stays clean from here."
            : "Uploads, live moments, and creator events live here while personal updates stay in Posts."
        };
  const contentHomeBody = isSelfProfile
    ? creatorVideosReady
      ? hasCreatorVideoTruth
        ? "Your uploads, live moments, and creator events live here."
        : "Upload your first video when you are ready to make this channel watchable."
      : "Loading your channel library."
    : isOfficialProfile
      ? "Official account updates and trusted help stay here; Chi'llywood Originals stay in Home, Explore, and title pages."
    : creatorVideosReady
      ? hasCreatorVideoTruth
        ? `${publicCreatorVideoCount} creator video${publicCreatorVideoCount === 1 ? "" : "s"} already give this channel a real library.`
        : "This channel is getting ready."
      : "Loading this channel's creator videos.";
  const contentCreatorVideosBody = isSelfProfile
    ? creatorVideosReady
      ? hasCreatorVideoTruth
        ? "Your uploads, live moments, and creator events live here. Public videos appear for visitors while drafts stay owner-only."
        : "Upload your first creator video when you are ready to make the channel watchable."
      : "Loading your creator-video library."
    : isOfficialProfile
      ? "This official account does not host Chi'llywood Originals inside Profile/Channel."
      : creatorVideosReady && hasCreatorVideoTruth
        ? `${publicCreatorVideoCount} creator-uploaded video${publicCreatorVideoCount === 1 ? "" : "s"} are ready to watch.`
        : "This channel is getting ready.";
  const contentCreatorEventsBody = isOfficialProfile
    ? "Official platform programming stays in Home, Explore, dedicated Originals surfaces, title pages, and admin-managed title routes."
    : publicEventsReady
      ? publicEventCount
        ? `${publicEventCount} public creator event${publicEventCount === 1 ? "" : "s"} can appear here when scheduled or live.`
        : "No public creator live or watch-party events are scheduled yet."
      : "Loading this channel's creator events.";
  const quickActions = isOfficialProfile
    ? [
        { label: "Chi'lly Chat", onPress: () => { void onPressCommunication("message"); } },
        { label: "Share Profile", onPress: () => { void onShareProfile(); } },
        ...(canReportProfile ? [{ label: "Report", onPress: onPressReportProfile }] : []),
      ]
    : isSelfProfile
      ? []
      : [
          ...(canShowFollowAction ? [{ label: followActionLabel, onPress: onToggleFollowChannel }] : []),
          { label: "Chi'lly Chat", onPress: () => { void onPressCommunication("message"); } },
          { label: "View Channel", onPress: onPressViewChannel },
          { label: "Share Profile", onPress: () => { void onShareProfile(); } },
          ...(canReportProfile ? [{ label: "Report", onPress: onPressReportProfile }] : []),
        ];
  const communityActions = isSelfProfile
    ? [
        { label: "Chi'lly Chat", onPress: () => { void onPressCommunication("message"); } },
      ]
    : isOfficialProfile
      ? [
          { label: "Chi'lly Chat", onPress: () => { void onPressCommunication("message"); } },
          ...(canReportProfile ? [{ label: "Report", onPress: onPressReportProfile }] : []),
        ]
      : [
          { label: "Chi'lly Chat", onPress: () => { void onPressCommunication("message"); } },
          { label: "Voice Call", onPress: () => { void onPressCommunication("voice"); } },
          { label: "Video Call", onPress: () => { void onPressCommunication("video"); } },
          ...(canReportProfile ? [{ label: "Report", onPress: onPressReportProfile }] : []),
        ];
  const publicProfileTabs = [
    { key: "home", label: "Posts" },
    { key: "content", label: "Channel" },
    { key: "live", label: "Live" },
    { key: "community", label: "Community" },
    { key: "about", label: "About" },
  ] as const satisfies readonly { key: PublicProfileTabKey; label: string }[];
  const featuredSpotlightTitle = isOfficialProfile
    ? "Official Spotlight"
    : isSelfProfile
      ? "Your Profile"
      : `${profile.displayName}'s Spotlight`;
  const featuredSpotlightBody = isOfficialProfile
    ? "Verified updates and trusted follow-up start here; platform titles stay in platform surfaces."
    : isSelfProfile
      ? "Share updates, connect with people, and guide fans to your Channel."
      : "Start here for personal updates, public identity, and the next backed creator or chat move.";
  const channelLayoutPreset = resolveChannelLayoutPreset(channelAccessProfile?.channelLayoutPreset);
  const homeSectionMap = {
    featured: {
      title: featuredSpotlightTitle,
      kicker: "SPOTLIGHT",
      body: featuredSpotlightBody,
      accent: isOfficialProfile ? "official" : "default",
    },
    live: {
      title: liveStatusTitle,
      kicker: "LIVE",
      body: liveStatusBody,
      accent: profile.isLive ? "live" : "default",
    },
    content: {
      title: isSelfProfile ? "Your Channel" : "Channel",
      kicker: "CREATOR CONTENT",
      body: contentHomeBody,
    },
    community: {
      title: "Community Pulse",
      kicker: "COMMUNITY",
      body: isOfficialProfile
        ? "Trusted follow-up stays visible here while direct conversation stays in Chi'lly Chat."
        : "Public follow-up stays visible here while direct conversation stays in Chi'lly Chat.",
    },
    about: {
      title: "Profile Identity",
      kicker: "ABOUT",
      body: `${profile.displayName} should feel like a clear public profile even before deeper creator shelves arrive.`,
    },
  } satisfies Record<"featured" | "live" | "content" | "community" | "about", ProfileSurfaceCard>;
  const homeSectionOrder = channelLayoutPreset === "live_first"
    ? (["live", "featured", "content", "community", "about"] as const)
    : channelLayoutPreset === "library_first"
      ? (["content", "featured", "live", "community", "about"] as const)
      : (["featured", "live", "content", "community", "about"] as const);
  const homeSections: readonly ProfileSurfaceCard[] = homeSectionOrder.map((key) => homeSectionMap[key]);
  const contentTabSections: readonly ProfileSurfaceCard[] = isOfficialProfile
    ? [
        {
          title: "Official Channel",
          kicker: profile.officialBadgeLabel ?? "OFFICIAL",
          body: contentCreatorVideosBody,
          accent: "official",
        },
        {
          title: "Platform Surface Boundary",
          kicker: "PLATFORM SURFACES",
          body: contentCreatorEventsBody,
        },
      ]
    : [
        {
          title: isSelfProfile ? "Your Creator Videos" : "Creator Videos",
          kicker: isSelfProfile ? "YOUR CHANNEL" : "PUBLIC CHANNEL",
          body: contentCreatorVideosBody,
        },
        {
          title: "Creator Events",
          kicker: "LIVE / WATCH-PARTY",
          body: contentCreatorEventsBody,
        },
      ];
  const liveNowEvents = useMemo(
    () => publicEvents.filter((event) => event.isLiveNow),
    [publicEvents],
  );
  const upcomingEvents = useMemo(
    () => publicEvents.filter((event) => event.isUpcoming),
    [publicEvents],
  );
  const replayReadyEvents = useMemo(
    () => publicEvents.filter((event) => event.replay.isReplayAvailableNow),
    [publicEvents],
  );
  const replayExpiredEvents = useMemo(
    () => publicEvents.filter((event) => event.replay.isReplayExpired),
    [publicEvents],
  );
  const reminderReadyEvents = useMemo(
    () => publicEvents.filter((event) => event.reminder.state === "ready"),
    [publicEvents],
  );
  const publicReminderSummaryByEventId = useMemo(
    () => new Map(publicReminderSummaries.map((summary) => [summary.event.id, summary])),
    [publicReminderSummaries],
  );
  const liveTabSections: readonly ProfileSurfaceCard[] = [
    {
      title: profile.isLive ? "Live Presence" : "Live Status",
      kicker: "LIVE",
      body: liveNowEvent
        ? `${liveNowEvent.eventTitle} is live here now as ${formatEventTypeLabel(liveNowEvent.eventType)}.`
        : profile.isLive
          ? "This channel is showing live presence. Room re-entry appears only when real room context is attached."
          : "No live room is active right now. This tab keeps live status clear without pretending the profile is the room.",
      accent: profile.isLive ? "live" : "default",
    },
    {
      title: nextUpcomingEvent ? formatEventTypeLabel(nextUpcomingEvent.eventType) : "Live Watch-Party",
      kicker: "LIVE FLOW",
      body: nextUpcomingEvent
        ? `${nextUpcomingEvent.eventTitle} is the next backed public event at ${formatEventDate(nextUpcomingEvent.startsAt)}.`
        : "This tab can point people toward Live Watch-Party without absorbing the live-room flow.",
    },
    {
      title: scheduledWatchPartyEvent ? "Watch-Party Live Scheduled" : "Watch-Party Live",
      kicker: "WATCH TOGETHER",
      body: scheduledWatchPartyEvent
        ? `${scheduledWatchPartyEvent.eventTitle} is scheduled for ${formatEventDate(scheduledWatchPartyEvent.startsAt)} and links out to the canonical Watch-Party Live entry.`
        : "Watch-Party Live stays on the canonical watch-together path.",
    },
    {
      title: hasLiveRouteContext ? "Linked Room Context" : "Room Continuity",
      kicker: hasLiveRouteContext ? "ACTIVE CONTEXT" : "WHEN AVAILABLE",
      body: hasLiveRouteContext
        ? "Real room context is attached, so live and watch-party entry can hand off to the correct canonical route."
        : "When a profile is opened from a room or live session, this tab should become the clean re-entry point instead of a fake room shell.",
    },
  ];
  const publicAudienceVisibilitySections: readonly ProfileSurfaceCard[] = useMemo(() => {
    if (isOfficialProfile) return [];

    const sections: ProfileSurfaceCard[] = [];
    const publicActivityVisibility = channelAccessProfile?.publicActivityVisibility;
    const followerSurfaceEnabled = channelAccessProfile?.followerSurfaceEnabled;
    const subscriberSurfaceEnabled = channelAccessProfile?.subscriberSurfaceEnabled;

    if (publicActivityVisibility) {
      sections.push({
        title: "Audience Activity",
        kicker: "PUBLIC ACTIVITY",
        body: `${formatPublicActivityVisibilityValue(publicActivityVisibility)}. ${getPublicActivityVisibilityBody(publicActivityVisibility)}`,
      });
    }

    if (typeof followerSurfaceEnabled === "boolean") {
      sections.push({
        title: "Follower Circle",
        kicker: "FOLLOWERS",
        body: `${formatAudienceSurfaceVisibilityValue(followerSurfaceEnabled)}. ${getAudienceSurfaceVisibilityBody("followers", followerSurfaceEnabled)}`,
      });
    }

    if (typeof subscriberSurfaceEnabled === "boolean") {
      sections.push({
        title: "Subscriber Circle",
        kicker: "SUBSCRIBERS",
        body: `${formatAudienceSurfaceVisibilityValue(subscriberSurfaceEnabled)}. ${getAudienceSurfaceVisibilityBody("subscribers", subscriberSurfaceEnabled)}`,
      });
    }

    return sections;
  }, [
    channelAccessProfile?.followerSurfaceEnabled,
    channelAccessProfile?.publicActivityVisibility,
    channelAccessProfile?.subscriberSurfaceEnabled,
    isOfficialProfile,
  ]);
  const audiencePostureBody = useMemo(() => {
    if (isOfficialProfile) return "";

    const publicActivityVisibility = channelAccessProfile?.publicActivityVisibility;
    const followerSurfaceEnabled = channelAccessProfile?.followerSurfaceEnabled;
    const subscriberSurfaceEnabled = channelAccessProfile?.subscriberSurfaceEnabled;
    const postureLead = publicActivityVisibility === "followers_only"
      ? "Community activity stays follower-led on this channel."
      : publicActivityVisibility === "subscribers_only"
        ? "Community activity stays subscriber-led on this channel."
        : publicActivityVisibility === "private"
          ? "Community activity stays quiet on the public route for now."
          : "Community activity can stay open on this channel.";
    const followerCue = followerSurfaceEnabled
      ? "Follower cues can appear when that relationship is real."
      : "Follower cues stay quiet on the public route.";
    const subscriberCue = subscriberSurfaceEnabled
      ? "Subscriber cues can appear when that relationship is real."
      : "Subscriber cues stay quiet on the public route.";
    return `${postureLead} ${followerCue} ${subscriberCue}`;
  }, [
    channelAccessProfile?.followerSurfaceEnabled,
    channelAccessProfile?.publicActivityVisibility,
    channelAccessProfile?.subscriberSurfaceEnabled,
    isOfficialProfile,
  ]);
  const communityTabSections: readonly ProfileSurfaceCard[] = [
    ...(!isOfficialProfile ? [{
      title: "Audience Posture",
      kicker: "AUDIENCE",
      body: audiencePostureBody,
    }] : []),
    {
      title: "Conversation",
      kicker: "CHI'LLY CHAT",
      body: isSelfProfile
        ? "Keep direct follow-up in Chi'lly Chat so this route can stay public-facing."
        : isOfficialProfile
          ? "Official follow-up stays in canonical Chi'lly Chat so trusted help never turns into a shadow support app."
          : "Direct follow-up from this channel should move into Chi'lly Chat, not hide inside the profile.",
    },
    {
      title: isOfficialProfile ? "Trust And Safety" : "Public Trust",
      kicker: isOfficialProfile ? "SAFETY" : "COMMUNITY",
      body: isOfficialProfile
        ? "Official accounts need protected trust markers, bounded reporting, and auditable follow-up."
        : canReportProfile
          ? "Reporting is already available here, so audience posture and community trust can grow from a real safety floor."
          : "Keep this channel identity-first, socially readable, and ready for real public activity when it exists.",
    },
    ...publicAudienceVisibilitySections,
  ];
  const aboutTabSections: readonly ProfileSurfaceCard[] = isOfficialProfile
    ? [
        {
          title: "Official Identity",
          kicker: profile.platformOwnershipLabel ?? "PLATFORM OWNED",
          body: officialAccount?.conciergeHeadline
            ? `${officialAccount.conciergeHeadline} ${profile.displayName} is Chi'llywood's verified public account.`
            : `${profile.displayName} is Chi'llywood's verified public account, not a claimable owner page.`,
          accent: "official",
        },
        {
          title: "Channel Read",
          kicker: "ABOUT",
          body: "Verified access, trusted follow-up, and official channel posture stay clear on this canonical route.",
        },
        {
          title: "Starter Thread",
          kicker: "CHI'LLY CHAT",
          body: "Open the canonical direct thread for official help, onboarding questions, and future platform follow-up.",
        },
      ]
    : [
        {
          title: "Channel Identity",
          kicker: "ABOUT",
          body: `${profile.displayName} keeps live presence, access posture, and direct follow-up inside one Chi'llywood identity.`,
        },
        {
          title: "Channel Read",
          kicker: "CHANNEL",
          body: isSelfProfile
            ? "Keep this surface public-facing first. Manage Channel stays the deeper editing handoff while access and audience posture stay easy to read here."
            : "This route stays a public channel destination where access posture, audience cues, and follow-up stay easy to read.",
        },
      ];
  const activeTabSections = activeTab === "home"
    ? homeSections
    : activeTab === "content"
      ? contentTabSections
      : activeTab === "live"
        ? liveTabSections
        : activeTab === "community"
          ? communityTabSections
          : aboutTabSections;
  const publicEventSummaryCards: readonly OwnerStatCard[] = [
    {
      label: "Live Now",
      value: String(liveNowEvents.length),
      body: liveNowEvents.length
        ? liveNowEvents.map((event) => event.eventTitle).slice(0, 2).join(" · ")
        : "no public creator event is live now",
      tone: liveNowEvents.length ? "live" : "default",
    },
    {
      label: "Upcoming",
      value: String(upcomingEvents.length),
      body: nextUpcomingEvent
        ? `next: ${nextUpcomingEvent.eventTitle}`
        : "no upcoming public event yet",
      tone: upcomingEvents.length ? "linked" : "default",
    },
    {
      label: "Replay",
      value: String(replayReadyEvents.length),
      body: replayReadyEvents.length
        ? replayReadyEvents.map((event) => event.eventTitle).slice(0, 2).join(" · ")
        : replayExpiredEvents.length
          ? `${replayExpiredEvents.length} replay window${replayExpiredEvents.length === 1 ? "" : "s"} expired`
          : "no public replay currently available",
    },
    {
      label: "Reminders",
      value: String(reminderReadyEvents.length),
      body: reminderReadyEvents.length
        ? "reminder-ready public schedule is backed"
        : "no reminder-ready public event yet",
      tone: reminderReadyEvents.length ? "linked" : "default",
    },
  ];
  const loadPublicReminderEvents = async () => {
    if (!userId) {
      setPublicEvents([]);
      setPublicReminderSummaries([]);
      setPublicEventsReady(true);
      return;
    }

    setPublicEventsReady(false);
    try {
      const summaries = await readPublicEventReminderSummaries(userId, currentUserId || undefined);
      setPublicReminderSummaries(summaries);
      setPublicEvents(summaries.map((summary) => summary.event));
    } finally {
      setPublicEventsReady(true);
    }
  };

  const onToggleReminderEnrollment = async (eventId: string, enabled: boolean) => {
    try {
      setReminderActionLoading(eventId);
      setReminderActionNotice(null);
      const result = await setEventReminderEnrollment(eventId, enabled, currentUserId || undefined);
      setReminderActionNotice(result.message);

      if (result.status === "completed" || result.status === "noop") {
        await loadPublicReminderEvents();
      }
    } catch {
      setReminderActionNotice("Unable to update event reminder enrollment right now.");
    } finally {
      setReminderActionLoading(null);
    }
  };
  const accessPosture = {
    title: getAccessPostureTitle(channelAccessResolution, isOfficialProfile),
    body: getProfileAccessBody(channelAccessResolution, isOfficialProfile),
  };
  const accessDetails: readonly ProfileAccessDetail[] = isOfficialProfile ? [
    {
      label: "Browse",
      value: "Verified",
      body: "official platform-owned identity",
    },
    {
      label: "Chi'lly Chat",
      value: "Official",
      body: "trusted help starts in the official thread",
    },
  ] : [
    {
      label: "Browse",
      value: getBrowseAccessValue(channelAccessResolution, isOfficialProfile),
      body: getBrowseAccessBody(channelAccessResolution, isOfficialProfile),
    },
    {
      label: "Watch Party",
      value: formatChannelRoomAccessValue(channelAccessResolution?.watchPartyAccessRule),
      body: getWatchPartyAccessBody(channelAccessResolution, channelAccessReady),
    },
    {
      label: "Chi'lly Chat",
      value: formatChannelRoomAccessValue(channelAccessResolution?.communicationAccessRule),
      body: getCommunicationAccessBody(channelAccessResolution, channelAccessReady),
    },
  ];
  const ownerStatsRibbon: readonly OwnerStatCard[] = isSelfProfile ? [
    {
      label: "Videos",
      value: creatorVideosReady ? String(creatorVideos.length) : "...",
      body: "uploaded videos in your channel library",
    },
    {
      label: "Public",
      value: creatorVideosReady ? String(publicCreatorVideoCount) : "...",
      body: "published videos visitors can watch",
      tone: "linked",
    },
    {
      label: "Events",
      value: publicEventsReady ? String(publicEventCount) : "...",
      body: "backed creator live/watch-party events",
      tone: publicEventCount ? "live" : "default",
    },
  ] : [];
  const ownerQuickActions: readonly OwnerQuickAction[] = isSelfProfile ? [
    {
      label: "Manage Channel",
      onPress: onPressManageChannel,
    },
    {
      label: "Upload Video",
      onPress: onPressUploadVideo,
      emphasis: "primary",
    },
    {
      label: "Open Chi'lly Chat",
      onPress: () => {
        void onPressCommunication("message");
      },
    },
  ] : [];
  const ownerNextSteps = [
    !profile.tagline ? "add a sharper channel line" : null,
    creatorVideosReady && creatorVideos.length === 0 ? "upload your first video" : null,
  ].filter(Boolean);
  const ownerPromptCards: readonly OwnerPromptCard[] = isSelfProfile ? [
    ...(!creatorSettingsEnabled ? [{
      kicker: "OWNER VIEW",
      title: "Channel editing is currently hidden",
      body: "This route stays focused on the public-facing channel view until deeper creator controls return.",
    }] : []),
    ...(creatorSettingsEnabled && ownerNextSteps.length ? [{
      kicker: "NEXT IN MANAGE CHANNEL",
      title: ownerNextSteps.length > 1 ? "Shape the next public read" : (
        ownerNextSteps[0] === "add a sharper channel line"
          ? "Add a sharper channel line"
          : ownerNextSteps[0] === "upload your first video"
            ? "Upload your first video"
            : "Build the first visible shelf"
      ),
      body: ownerNextSteps.length > 1
        ? "Start by adding a sharper channel line and uploading the first playable channel video."
        : ownerNextSteps[0] === "add a sharper channel line"
          ? "Give visitors a clearer first read on your lane with a short tagline."
          : "Upload a real video from this Profile so your Channel starts feeling like a mini streaming platform.",
      actionLabel: ownerNextSteps.length === 1 && ownerNextSteps[0] === "upload your first video"
        ? "Upload Video"
        : "Open Manage Channel",
      onPress: ownerNextSteps.length === 1 && ownerNextSteps[0] === "upload your first video"
        ? onPressUploadVideo
        : onPressManageChannel,
    }] : []),
  ] : [];
  const openCreatorVideo = (video: CreatorVideo) => {
    router.push({
      pathname: "/player/[id]",
      params: {
        id: video.id,
        source: "creator-video",
      },
    });
  };
  const renderComposerAvatar = (size: "small" | "medium" = "small") => (
    <View style={size === "small" ? styles.composerAvatar : styles.feedAvatar}>
      {profile.avatarUrl ? (
        <Image source={{ uri: profile.avatarUrl }} style={styles.composerAvatarImage} />
      ) : (
        <Text style={styles.composerAvatarInitial}>{profile.displayName.slice(0, 1).toUpperCase()}</Text>
      )}
    </View>
  );
  const renderProfileComposerCard = () => {
    if (!isSelfProfile) return null;

    return (
      <View style={styles.feedComposerCard}>
        <View style={styles.feedComposerPromptRow}>
          {renderComposerAvatar("small")}
          <TouchableOpacity
            style={styles.feedComposerPrompt}
            activeOpacity={0.86}
            onPress={onPressUploadVideo}
          >
            <Text style={styles.feedComposerPromptText}>Upload a creator video</Text>
          </TouchableOpacity>
          {profileComposerOpen ? (
            <TouchableOpacity
              style={styles.feedComposerClose}
              activeOpacity={0.84}
              disabled={profileComposerBusy}
              onPress={() => setProfileComposerOpen(false)}
            >
              <MaterialIcons name="close" size={18} color="#DDE5F7" />
            </TouchableOpacity>
          ) : null}
        </View>

        {profileComposerOpen ? (
          <View style={styles.feedComposerExpanded}>
            <TextInput
              style={[styles.profileComposerInput, styles.profileComposerTextArea, styles.feedComposerTextArea]}
              placeholder="Add a description for this channel video."
              placeholderTextColor="#8A93A8"
              value={profileComposerText}
              onChangeText={setProfileComposerText}
              multiline
            />
            <TouchableOpacity
              style={styles.feedComposerAttachButton}
              activeOpacity={0.86}
              onPress={() => {
                void onPickProfileComposerFile();
              }}
              disabled={profileComposerBusy}
            >
              <MaterialIcons name="videocam" size={18} color="#EAF0FF" />
              <Text style={styles.feedComposerAttachText}>
                {profileComposerFile ? "Change Video" : "Add Video"}
              </Text>
            </TouchableOpacity>
            {profileComposerFile ? (
              <View style={styles.feedComposerFileCard}>
                <View style={styles.feedComposerFileIcon}>
                  <MaterialIcons name="movie" size={20} color="#fff" />
                </View>
                <View style={styles.feedComposerFileText}>
                  <Text style={styles.profileComposerFileName} numberOfLines={2}>
                    {getReadableProfileFileName(profileComposerFile.name)}
                  </Text>
                  {formatProfileFileSize(profileComposerFile.size) ? (
                    <Text style={styles.profileComposerFileMeta}>{formatProfileFileSize(profileComposerFile.size)}</Text>
                  ) : null}
                </View>
              </View>
            ) : null}
            <TextInput
              style={styles.profileComposerInput}
              placeholder="Title this video"
              placeholderTextColor="#8A93A8"
              value={profileComposerTitle}
              onChangeText={setProfileComposerTitle}
            />
            <View style={styles.profileComposerVisibilityRow}>
              {(["public", "draft"] as const).map((visibility) => (
                <TouchableOpacity
                  key={visibility}
                  style={[
                    styles.profileComposerVisibilityChip,
                    profileComposerVisibility === visibility && styles.profileComposerVisibilityChipActive,
                  ]}
                  activeOpacity={0.84}
                  disabled={profileComposerBusy}
                  onPress={() => setProfileComposerVisibility(visibility)}
                >
                  <MaterialIcons
                    name={visibility === "public" ? "public" : "lock"}
                    size={15}
                    color={profileComposerVisibility === visibility ? "#FFF6F8" : "#BAC3D6"}
                  />
                  <Text
                    style={[
                      styles.profileComposerVisibilityText,
                      profileComposerVisibility === visibility && styles.profileComposerVisibilityTextActive,
                    ]}
                  >
                    {visibility === "public" ? "Public" : "Draft"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {profileComposerNotice ? (
              <View style={styles.profileComposerNotice}>
                <Text style={styles.profileComposerNoticeText}>{profileComposerNotice}</Text>
              </View>
            ) : null}
            <View style={styles.feedComposerActionRow}>
              <TouchableOpacity
                style={[
                  styles.feedComposerPostButton,
                  (!profileComposerFile || profileComposerBusy) && styles.ownerHeroToolsButtonDisabled,
                ]}
                activeOpacity={0.86}
                disabled={!profileComposerFile || profileComposerBusy}
                onPress={() => {
                  void onSubmitProfileComposer();
                }}
              >
                <View style={styles.profileComposerSubmitContent}>
                  {profileComposerBusy ? <ActivityIndicator size="small" color="#fff" /> : null}
                  <Text style={styles.feedComposerPostText}>
                    {profileComposerBusy ? "Uploading..." : "Upload"}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    );
  };
  const renderProfilePostComposer = () => {
    if (!isSelfProfile) return null;

    const draftLength = profilePostDraft.trim().length;
    const composerDisabled = profilePostBusy || draftLength === 0 || draftLength > PROFILE_POST_BODY_LIMIT;

    return (
      <View
        style={styles.profilePostComposerCard}
        onLayout={(event) => {
          profilePostComposerYRef.current = event.nativeEvent.layout.y;
        }}
      >
        <View style={styles.feedComposerPromptRow}>
          {renderComposerAvatar("small")}
          <View style={styles.profilePostComposerCopy}>
            <Text style={styles.profilePostComposerTitle}>Post</Text>
            <Text style={styles.profilePostComposerMeta}>Attach a photo or file. Creator videos stay in Channel.</Text>
          </View>
        </View>
        <TextInput
          style={[styles.profileComposerInput, styles.profileComposerTextArea]}
          placeholder="How are you feeling?"
          placeholderTextColor="#8A93A8"
          value={profilePostDraft}
          onChangeText={(value) => {
            setProfilePostDraft(value);
            if (profilePostsNotice) setProfilePostsNotice(null);
          }}
          multiline
          editable={!profilePostBusy}
          maxLength={PROFILE_POST_BODY_LIMIT}
          onFocus={scrollProfilePostComposerIntoView}
        />
        {profilePostAttachmentFile ? (
          <SocialAttachmentCard
            file={profilePostAttachmentFile}
            compact
            onRemove={() => setProfilePostAttachmentFile(null)}
          />
        ) : null}
        <View style={styles.profilePostComposerFooter}>
          <View style={styles.profilePostComposerTools}>
            <TouchableOpacity
              style={[styles.profilePostAttachButton, profilePostBusy && styles.ownerHeroToolsButtonDisabled]}
              activeOpacity={0.84}
              disabled={profilePostBusy}
              onPress={() => {
                void onPickProfilePostAttachment();
              }}
              accessibilityLabel="Attach to profile post"
            >
              <MaterialIcons name="attach-file" size={16} color="#E6ECFA" />
              <Text style={styles.profilePostAttachButtonText}>Attach</Text>
            </TouchableOpacity>
            <Text style={styles.profilePostComposerCount}>
              {draftLength}/{PROFILE_POST_BODY_LIMIT}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.feedComposerPostButton,
              styles.profilePostComposerButton,
              composerDisabled && styles.ownerHeroToolsButtonDisabled,
            ]}
            activeOpacity={0.86}
            disabled={composerDisabled}
            onPress={() => {
              void onSubmitProfilePost();
            }}
          >
            <View style={styles.profileComposerSubmitContent}>
              {profilePostBusy ? <ActivityIndicator size="small" color="#fff" /> : null}
              <Text style={styles.feedComposerPostText}>{profilePostBusy ? "Posting..." : "Post"}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  };
  const renderProfilePostCard = (post: ProfilePost) => {
    const canDeletePost = isSelfProfile && post.userId === currentUserId;
    const canReportPost = !isSelfProfile && !!currentUserId && post.visibility === "public";
    const canSharePost = isProfilePostPubliclyShareable(post);
    const canEngageWithPost = isProfilePostEngageable(post);
    const uiState = profilePostUiById[post.id] ?? {};
    const engagement = uiState.engagement;
    const likeCountLabel = uiState.engagementReady
      ? formatEngagementCount(engagement?.likeCount ?? 0, "like", "likes")
      : "";
    const commentCountLabel = uiState.engagementReady
      ? formatEngagementCount(engagement?.commentCount ?? 0, "comment", "comments")
      : "";
    const likeButtonLabel = engagement?.likedByViewer ? "Liked" : "Like";
    const comments = uiState.comments ?? [];
    const commentDraft = uiState.commentDraft ?? "";
    const commentDraftLength = commentDraft.trim().length;
    const commentSubmitDisabled = !!uiState.commentBusy
      || !canEngageWithPost
      || !currentUserId
      || commentDraftLength === 0
      || commentDraftLength > PROFILE_POST_COMMENT_BODY_LIMIT;
    const getProfilePostCommentAuthorLabel = (comment: ProfilePostComment) => {
      if (comment.userId === currentUserId) return "You";
      if (comment.userId === post.userId) return profile.displayName;
      return comment.authorName || "Member";
    };
    const replyTarget = comments.find((comment) => comment.id === uiState.replyTargetCommentId) ?? null;
    const topLevelComments = comments.filter((comment) => !comment.parentCommentId);
    const repliesByParentId = comments.reduce((map, comment) => {
      if (!comment.parentCommentId) return map;
      const current = map.get(comment.parentCommentId) ?? [];
      current.push(comment);
      map.set(comment.parentCommentId, current);
      return map;
    }, new Map<string, ProfilePostComment[]>());
    const renderProfilePostCommentItem = (comment: ProfilePostComment, nested = false) => {
      const canDeleteComment = !!currentUserId
        && (comment.userId === currentUserId || (isSelfProfile && post.userId === currentUserId));
      const canReportComment = !!currentUserId && comment.userId !== currentUserId;
      const canReply = !!currentUserId && canEngageWithPost;
      const commentAuthorLabel = getProfilePostCommentAuthorLabel(comment);

      return (
        <View key={comment.id} style={[styles.profilePostCommentCard, nested && styles.profilePostReplyCard]}>
          <View style={styles.profilePostCommentHeader}>
            <Text style={styles.profilePostCommentAuthor} numberOfLines={1}>
              {commentAuthorLabel}
            </Text>
            <Text style={styles.profilePostCommentMeta}>{formatProfilePostDate(comment.createdAt)}</Text>
          </View>
          <LinkedText text={comment.body} style={styles.profilePostCommentBody} />
          {comment.attachments.length ? (
            <View style={styles.profilePostCommentAttachmentStack}>
              {comment.attachments.map((attachment) => (
                <SocialAttachmentCard key={attachment.id} attachment={attachment} compact />
              ))}
            </View>
          ) : null}
          {canReply || canDeleteComment || canReportComment ? (
            <View style={styles.profilePostCommentActionRow}>
              {canReply ? (
                <TouchableOpacity
                  style={styles.profilePostCommentAction}
                  activeOpacity={0.84}
                  onPress={() => updateProfilePostUiState(post.id, (current) => ({
                    ...current,
                    commentsOpen: true,
                    replyTargetCommentId: comment.id,
                    commentNotice: null,
                  }))}
                >
                  <Text style={styles.profilePostCommentActionText}>Reply</Text>
                </TouchableOpacity>
              ) : null}
              {canDeleteComment ? (
                <TouchableOpacity
                  style={[
                    styles.profilePostCommentAction,
                    uiState.deletingCommentId === comment.id && styles.feedPostActionDisabled,
                  ]}
                  activeOpacity={0.84}
                  disabled={uiState.deletingCommentId === comment.id}
                  onPress={() => onDeleteProfilePostCommentPress(post, comment)}
                >
                  <Text style={styles.profilePostCommentActionText}>
                    {uiState.deletingCommentId === comment.id ? "Deleting" : "Delete"}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {canReportComment ? (
                <TouchableOpacity
                  style={styles.profilePostCommentAction}
                  activeOpacity={0.84}
                  onPress={() => onPressReportProfilePostComment(post, comment)}
                >
                  <Text style={styles.profilePostCommentActionText}>Report</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>
      );
    };

    return (
      <View key={post.id} style={styles.feedPostCard}>
        <View style={styles.feedPostHeader}>
          {renderComposerAvatar("medium")}
          <View style={styles.feedPostIdentity}>
            <Text style={styles.feedPostName} numberOfLines={1}>{profile.displayName}</Text>
            <Text style={styles.feedPostMeta}>{formatProfilePostDate(post.createdAt)}</Text>
          </View>
          {post.visibility === "draft" ? (
            <View style={styles.feedDraftBadge}>
              <Text style={styles.feedDraftBadgeText}>DRAFT</Text>
            </View>
          ) : null}
          {post.moderationStatus === "reported" ? (
            <View style={styles.feedDraftBadge}>
              <Text style={styles.feedDraftBadgeText}>REPORTED</Text>
            </View>
          ) : null}
        </View>
        <LinkedText text={post.body} style={styles.feedPostCaption} />
        {post.attachments.length ? (
          <View style={styles.feedPostAttachmentStack}>
            {post.attachments.map((attachment) => (
              <SocialAttachmentCard key={attachment.id} attachment={attachment} compact />
            ))}
          </View>
        ) : null}
        <View style={styles.feedPostActionRow}>
          {canSharePost ? (
            <TouchableOpacity
              style={[styles.feedPostAction, uiState.likeBusy && styles.feedPostActionDisabled]}
              activeOpacity={0.84}
              disabled={!!uiState.likeBusy}
              onPress={() => {
                void onToggleProfilePostLike(post);
              }}
            >
              <MaterialIcons
                name={engagement?.likedByViewer ? "favorite" : "favorite-border"}
                size={17}
                color={engagement?.likedByViewer ? "#FF7A9B" : "#E6ECFA"}
              />
              <Text style={styles.feedPostActionText}>
                {likeCountLabel ? `${likeButtonLabel} · ${likeCountLabel}` : likeButtonLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
          {canSharePost ? (
            <TouchableOpacity
              style={styles.feedPostAction}
              activeOpacity={0.84}
              onPress={() => onToggleProfilePostComments(post)}
            >
              <MaterialIcons name="chat-bubble-outline" size={17} color="#E6ECFA" />
              <Text style={styles.feedPostActionText}>
                {commentCountLabel || "Comment"}
              </Text>
            </TouchableOpacity>
          ) : null}
          {canSharePost ? (
            <TouchableOpacity
              style={styles.feedPostAction}
              activeOpacity={0.84}
              onPress={() => {
                void onShareProfilePost(post);
              }}
            >
              <MaterialIcons name="ios-share" size={17} color="#E6ECFA" />
              <Text style={styles.feedPostActionText}>Share</Text>
            </TouchableOpacity>
          ) : null}
          {canDeletePost ? (
            <TouchableOpacity
              style={[
                styles.feedPostAction,
                profilePostDeletingId === post.id && styles.feedPostActionDisabled,
              ]}
              activeOpacity={0.84}
              disabled={profilePostDeletingId === post.id}
              onPress={() => onDeleteProfilePost(post)}
            >
              <MaterialIcons name="delete-outline" size={17} color="#E6ECFA" />
              <Text style={styles.feedPostActionText}>
                {profilePostDeletingId === post.id ? "Deleting" : "Delete"}
              </Text>
            </TouchableOpacity>
          ) : null}
          {canReportPost ? (
            <TouchableOpacity
              style={styles.feedPostAction}
              activeOpacity={0.84}
              onPress={() => onPressReportProfilePost(post)}
            >
              <MaterialIcons name="outlined-flag" size={17} color="#E6ECFA" />
              <Text style={styles.feedPostActionText}>Report</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {uiState.commentsOpen ? (
          <View style={styles.profilePostCommentsPanel}>
            {uiState.commentNotice ? (
              <View style={styles.profilePostCommentNotice}>
                <Text style={styles.profilePostCommentNoticeText}>{uiState.commentNotice}</Text>
              </View>
            ) : null}
            {!uiState.commentsReady ? (
              <View style={styles.profilePostCommentsLoading}>
                <ActivityIndicator color="#DC143C" />
                <Text style={styles.profilePostCommentMeta}>Loading comments</Text>
              </View>
            ) : comments.length ? (
              <View style={styles.profilePostCommentList}>
                {topLevelComments.map((comment) => (
                  <View key={comment.id} style={styles.profilePostCommentThread}>
                    {renderProfilePostCommentItem(comment)}
                    {(repliesByParentId.get(comment.id) ?? []).map((reply) => (
                      renderProfilePostCommentItem(reply, true)
                    ))}
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.profilePostCommentEmpty}>No comments yet.</Text>
            )}
            {canEngageWithPost ? (
              currentUserId ? (
                <View style={styles.profilePostCommentComposer}>
                  {replyTarget ? (
                    <View style={styles.profilePostReplyNotice}>
                      <Text style={styles.profilePostReplyNoticeText} numberOfLines={1}>
                        Replying to {getProfilePostCommentAuthorLabel(replyTarget)}
                      </Text>
                      <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={() => clearProfilePostCommentReply(post.id)}
                      >
                        <Text style={styles.profilePostReplyCancelText}>Cancel Reply</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  <TextInput
                    style={styles.profilePostCommentInput}
                    placeholder={replyTarget ? "Write a reply" : "Write a comment"}
                    placeholderTextColor="#8A93A8"
                    value={commentDraft}
                    onChangeText={(value) => updateProfilePostUiState(post.id, (current) => ({
                      ...current,
                      commentDraft: value,
                      commentNotice: null,
                    }))}
                    multiline
                    editable={!uiState.commentBusy}
                    maxLength={PROFILE_POST_COMMENT_BODY_LIMIT}
                  />
                  {uiState.commentAttachmentFile ? (
                    <SocialAttachmentCard
                      file={uiState.commentAttachmentFile}
                      compact
                      onRemove={() => updateProfilePostUiState(post.id, (current) => ({
                        ...current,
                        commentAttachmentFile: null,
                      }))}
                    />
                  ) : null}
                  <View style={styles.profilePostCommentComposerFooter}>
                    <View style={styles.profilePostComposerTools}>
                      <TouchableOpacity
                        style={[styles.profilePostAttachButton, uiState.commentBusy && styles.ownerHeroToolsButtonDisabled]}
                        activeOpacity={0.84}
                        disabled={!!uiState.commentBusy}
                        onPress={() => {
                          void onPickProfilePostCommentAttachment(post);
                        }}
                        accessibilityLabel="Attach to profile post comment"
                      >
                        <MaterialIcons name="attach-file" size={16} color="#E6ECFA" />
                        <Text style={styles.profilePostAttachButtonText}>Attach</Text>
                      </TouchableOpacity>
                      <Text style={styles.profilePostComposerCount}>
                        {commentDraftLength}/{PROFILE_POST_COMMENT_BODY_LIMIT}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        styles.profilePostCommentSubmit,
                        commentSubmitDisabled && styles.ownerHeroToolsButtonDisabled,
                      ]}
                      activeOpacity={0.86}
                      disabled={commentSubmitDisabled}
                      onPress={() => {
                        void onSubmitProfilePostComment(post);
                      }}
                    >
                      {uiState.commentBusy ? <ActivityIndicator size="small" color="#fff" /> : null}
                      <Text style={styles.feedComposerPostText}>{replyTarget ? "Reply" : "Post"}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <Text style={styles.profilePostCommentEmpty}>Sign in to comment.</Text>
              )
            ) : (
              <Text style={styles.profilePostCommentEmpty}>Comments are closed for this post.</Text>
            )}
          </View>
        ) : null}
      </View>
    );
  };
  const renderPostsFeed = () => (
    <View style={styles.feedStack}>
      {renderProfilePostComposer()}
      {profilePostsNotice ? (
        <View style={styles.profileComposerNotice}>
          <Text style={styles.profileComposerNoticeText}>{profilePostsNotice}</Text>
        </View>
      ) : null}
      {!profilePostsReady ? (
        <View style={styles.feedEmptyCard}>
          <ActivityIndicator color="#DC143C" />
          <Text style={styles.feedEmptyTitle}>Loading profile updates</Text>
          <Text style={styles.feedEmptyText}>Checking real public updates before showing this Profile feed.</Text>
        </View>
      ) : profilePosts.length ? (
        profilePosts.map(renderProfilePostCard)
      ) : (
        <View style={styles.feedEmptyCard}>
          <Text style={styles.feedEmptyTitle}>
            {isSelfProfile ? "Post your first update." : "No posts yet."}
          </Text>
          <Text style={styles.feedEmptyText}>
            {isSelfProfile
              ? "Post a short thought or how-you-feel update here. Creator videos still belong to your Channel."
              : "This Profile has not shared a public personal update yet."}
          </Text>
          <TouchableOpacity style={styles.feedEmptyButton} activeOpacity={0.86} onPress={onPressViewChannel}>
            <MaterialIcons name="video-library" size={17} color="#fff" />
            <Text style={styles.feedEmptyButtonText}>{isSelfProfile ? "View Your Channel" : "View Channel"}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
  const renderOwnerHandoffCard = () => {
    if (!isSelfProfile) return null;

    return (
      <View style={styles.ownerModeCard}>
        <Text style={styles.ownerModeKicker}>OWNER HANDOFF</Text>
        <Text style={styles.ownerModeTitle}>Keep the public channel in front.</Text>
        <Text style={styles.ownerModeBody}>
          Use Manage Channel for deeper edits while this route keeps the public read, live posture, and access truth easy to scan.
        </Text>
        {ownerQuickActions.length ? (
          <View style={styles.ownerQuickActionRow}>
            {ownerQuickActions.map((action) => (
              <TouchableOpacity
                key={action.label}
                style={[
                  styles.ownerActionChip,
                  action.emphasis === "primary" && styles.ownerActionChipPrimary,
                ]}
                activeOpacity={0.84}
                onPress={action.onPress}
              >
                <Text
                  style={[
                    styles.ownerActionChipText,
                    action.emphasis === "primary" && styles.ownerActionChipTextPrimary,
                  ]}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {ownerStatsRibbon.length ? (
          <View style={styles.ownerSignalRow}>
            {ownerStatsRibbon.map((card) => (
              <View
                key={card.label}
                style={[
                  styles.ownerSignalChip,
                  card.tone === "linked" && styles.ownerSignalChipLinked,
                  card.tone === "live" && styles.ownerSignalChipLive,
                ]}
              >
                <Text style={styles.ownerSignalValue}>{card.value}</Text>
                <Text style={styles.ownerSignalLabel}>{card.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {ownerPromptCards.length ? (
          <View style={styles.ownerPromptStack}>
            {ownerPromptCards.map((prompt) => (
              <View key={prompt.title} style={styles.ownerPromptCard}>
                <Text style={styles.ownerPromptKicker}>{prompt.kicker}</Text>
                <Text style={styles.ownerPromptTitle}>{prompt.title}</Text>
                <Text style={styles.ownerPromptBody}>{prompt.body}</Text>
                {prompt.actionLabel && prompt.onPress ? (
                  <TouchableOpacity
                    style={styles.ownerPromptAction}
                    activeOpacity={0.84}
                    onPress={prompt.onPress}
                  >
                    <Text style={styles.ownerPromptActionText}>{prompt.actionLabel}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}
      </View>
    );
  };
  const watchPartyGatePresentation = watchPartyPremiumGate
    ? getMonetizationAccessSheetPresentation({
        gate: watchPartyPremiumGate,
        appDisplayName: branding.appDisplayName,
        premiumUpsellTitle: monetizationConfig.premiumUpsellTitle,
        premiumUpsellBody: monetizationConfig.premiumUpsellBody,
      })
    : null;

  return (
    <View
      style={styles.outerFlex}
      testID="profile-screen"
      accessibilityLabel="Chi'llywood profile channel screen"
    >
      <View style={styles.fullBackgroundFallback} pointerEvents="none" />
      <View style={styles.fullBackgroundOverlay} pointerEvents="none" />

      <KeyboardAvoidingView
        style={styles.outerFlex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
      <ScrollView
        ref={scrollViewRef}
        style={styles.screen}
        contentContainerStyle={[styles.content, styles.contentKeyboardInset]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>{"CHI'LLYWOOD · PROFILE"}</Text>
          <View style={{ width: 18 }} />
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileCover}>
            <View style={styles.profileCoverTopRow}>
              <Text style={styles.profileEyebrow}>{profileEyebrow}</Text>
              <View style={styles.profileCoverBadgeRow}>
                {isOfficialProfile ? (
                  <View style={[styles.heroBadge, styles.heroBadgeOfficial]}>
                    <Text style={[styles.heroBadgeText, styles.heroBadgeTextOfficial]}>
                      {profile.officialBadgeLabel ?? officialAccount?.officialBadgeLabel ?? "OFFICIAL"}
                    </Text>
                  </View>
                ) : null}
                <View style={[styles.heroBadge, profile.isLive ? styles.heroBadgeLive : styles.heroBadgeDefault]}>
                  <Text style={[styles.heroBadgeText, profile.isLive && styles.heroBadgeTextLive]}>{liveStateLabel}</Text>
                </View>
              </View>
            </View>
          </View>
          <View style={styles.profileIdentityRow}>
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setAvatarQuickActionsOpen((current) => !current)}
              onLongPress={() => setAvatarQuickActionsOpen((current) => !current)}
              delayLongPress={220}
            >
              <View style={styles.avatarWrap}>
                <View style={styles.avatarCircle}>
                  {profile.avatarUrl ? (
                    <Image source={{ uri: profile.avatarUrl }} style={styles.avatarImage} />
                  ) : (
                    <Text style={styles.avatarInitial}>{profile.displayName.slice(0, 1).toUpperCase()}</Text>
                  )}
                </View>
                {profile.isLive ? <View style={styles.avatarLiveDot} /> : null}
              </View>
            </TouchableOpacity>
            <View style={styles.profileIdentityCopy}>
              <Text style={styles.channelLabel}>{channelLabel}</Text>
              <Text
                style={styles.username}
                numberOfLines={1}
                ellipsizeMode="tail"
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {profile.displayName}
              </Text>
              <Text style={styles.userIdLabel} numberOfLines={1}>{channelHandle}</Text>
              {profile.tagline ? <Text style={styles.profileTagline}>{profile.tagline}</Text> : null}
              <View style={styles.metaRow}>
                <View style={styles.metaPill}>
                  <Text style={styles.metaPillText}>{roleLabel}</Text>
                </View>
                {hasLiveRouteContext ? (
                  <View style={[styles.metaPill, styles.metaPillLinked]}>
                    <Text style={styles.metaPillText}>{routeContextLabel}</Text>
                  </View>
                ) : null}
                {isOfficialProfile ? (
                  <View style={[styles.metaPill, styles.metaPillOfficial]}>
                    <Text style={[styles.metaPillText, styles.metaPillTextOfficial]}>
                      {profile.platformOwnershipLabel ?? officialAccount?.platformOwnershipLabel ?? "PLATFORM OWNED"}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>
          <Text style={styles.channelSupportText}>{channelHomeBody}</Text>
          <View style={styles.channelSignalGrid}>
            {channelSignals.map((signal) => (
              <View
                key={signal.label}
                style={[
                  styles.channelSignalCard,
                  signal.tone === "live" && styles.channelSignalCardLive,
                  signal.tone === "linked" && styles.channelSignalCardLinked,
                  signal.tone === "official" && styles.channelSignalCardOfficial,
                ]}
              >
                <Text style={styles.channelSignalLabel}>{signal.label}</Text>
                <Text style={styles.channelSignalValue}>{signal.value}</Text>
              </View>
            ))}
          </View>
          {avatarQuickActionsOpen && quickActions.length > 0 ? (
            <View style={styles.quickActionsCard}>
              <Text style={styles.quickActionsTitle}>
                {isOfficialProfile ? "Official Quick Actions" : isSelfProfile ? "Your Channel Quick Actions" : "Channel Quick Actions"}
              </Text>
              <View style={styles.quickActionsRow}>
                {quickActions.map((action) => (
                  <TouchableOpacity
                    key={action.label}
                    style={styles.quickActionChip}
                    activeOpacity={0.84}
                    onPress={() => {
                      setAvatarQuickActionsOpen(false);
                      action.onPress();
                    }}
                  >
                    <Text style={styles.quickActionChipText}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
          <View style={styles.actionCluster}>
            {isSelfProfile ? (
              <>
                <View style={styles.primaryActionRow}>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnConnected]}
                    activeOpacity={0.86}
                    onPress={onPressManageChannel}
                  >
                    <Text style={[styles.actionBtnText, styles.actionBtnTextConnected]}>Manage Channel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnSecondary]}
                    activeOpacity={0.86}
                    onPress={onPressUploadVideo}
                  >
                    <Text style={styles.actionBtnText}>Upload</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.secondaryActionRow}>
                  <TouchableOpacity
                    style={[styles.actionChip, styles.actionChipConnected]}
                    activeOpacity={0.86}
                    onPress={onPressSettings}
                  >
                    <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>Settings</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={styles.primaryActionRow}>
                  {canShowFollowAction ? (
                    <TouchableOpacity
                      style={[
                        styles.actionBtn,
                        viewerFollowState === "following" ? styles.actionBtnSecondary : styles.actionBtnConnected,
                        (followActionBusy || viewerFollowState === "loading") && styles.actionBtnPlaceholder,
                      ]}
                      activeOpacity={0.86}
                      disabled={followActionBusy || viewerFollowState === "loading"}
                      onPress={onToggleFollowChannel}
                    >
                      <Text
                        style={[
                          styles.actionBtnText,
                          viewerFollowState === "following" ? styles.actionBtnText : styles.actionBtnTextConnected,
                          (followActionBusy || viewerFollowState === "loading") && styles.actionBtnTextPlaceholder,
                        ]}
                      >
                        {followActionLabel}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    testID="profile-chilly-chat-button"
                    accessibilityLabel="Open Chi'lly Chat"
                    style={[styles.actionBtn, styles.actionBtnConnected]}
                    activeOpacity={0.86}
                    onPress={() => {
                      void onPressCommunication("message");
                    }}
                  >
                    <Text style={[styles.actionBtnText, styles.actionBtnTextConnected]}>
                      {"Chi'lly Chat"}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.secondaryActionRow}>
                  {!isOfficialProfile ? (
                    <TouchableOpacity
                      style={[styles.actionChip, styles.actionChipConnected]}
                      activeOpacity={0.82}
                      onPress={onPressViewChannel}
                    >
                      <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>View Channel</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity
                    style={[styles.actionChip, styles.actionChipConnected]}
                    activeOpacity={0.82}
                    onPress={() => {
                      void onShareProfile();
                    }}
                  >
                    <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>Share Profile</Text>
                  </TouchableOpacity>
                  {hasLiveRouteContext || hasLiveTabEntry ? (
                    <TouchableOpacity
                      style={[
                        styles.actionChip,
                        hasLiveRouteContext && profile.isLive ? styles.actionChipReport : styles.actionChipConnected,
                      ]}
                      activeOpacity={0.86}
                      onPress={onPressLive}
                    >
                      <Text
                        style={[
                          styles.actionChipText,
                          hasLiveRouteContext && profile.isLive ? styles.actionChipTextReport : styles.actionChipTextConnected,
                        ]}
                      >
                        {liveActionTitle}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {canOpenWatchPartyEntry ? (
                    <TouchableOpacity
                      style={[styles.actionChip, styles.actionChipConnected]}
                      activeOpacity={0.86}
                      onPress={onPressWatchParty}
                    >
                      <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>
                        {hasLiveRouteContext ? "Watch Party" : "Watch-Party Live"}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {showFriendshipHint ? (
                    <View style={[styles.actionChip, styles.actionChipConnected]}>
                      <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>
                        Friends
                      </Text>
                    </View>
                  ) : null}
                  {canReportProfile ? (
                    <TouchableOpacity
                      style={[styles.actionChip, styles.actionChipReport]}
                      activeOpacity={0.82}
                      onPress={onPressReportProfile}
                    >
                      <Text style={[styles.actionChipText, styles.actionChipTextReport]}>
                        Report
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </>
            )}
          </View>
        </View>

        {renderProfileComposerCard()}

        <View style={styles.sectionStack}>
          <View style={styles.tabStripCard}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabStripRow}
              keyboardShouldPersistTaps="handled"
            >
              {publicProfileTabs.map((tab) => (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.tabChip,
                    activeTab === tab.key && styles.tabChipActive,
                  ]}
                  activeOpacity={0.84}
                  onPress={() => setActiveTab(tab.key)}
                >
                  <Text
                    style={[
                      styles.tabChipText,
                      activeTab === tab.key && styles.tabChipTextActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          {activeTab === "home" ? renderPostsFeed() : null}
          {activeTab === "about" ? renderOwnerHandoffCard() : null}
          {activeTab !== "home" ? activeTabSections.map((section) => (
            <View
              key={section.title}
              style={[
                styles.sectionCard,
                section.accent === "live" && styles.sectionCardLive,
                section.accent === "official" && styles.sectionCardOfficial,
              ]}
            >
              <Text style={styles.sectionKicker}>{section.kicker}</Text>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          )) : null}
          {activeTab === "about" ? (
            <>
              <View style={styles.channelGuideCard}>
                <Text style={styles.channelGuideKicker}>{channelHelper.kicker}</Text>
                <Text style={styles.channelGuideTitle}>{channelHelper.title}</Text>
                <Text style={styles.channelGuideBody}>{channelHelper.body}</Text>
                {isOfficialProfile && officialGuidanceTopics.length ? (
                  <View style={styles.officialTopicRow}>
                    {officialGuidanceTopics.map((topic) => (
                      <View key={topic} style={styles.officialTopicChip}>
                        <Text style={styles.officialTopicChipText}>{topic}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
              <View style={styles.accessCard}>
                <Text style={styles.accessKicker}>CHANNEL ACCESS</Text>
                <Text style={styles.accessTitle}>{accessPosture.title}</Text>
                <Text style={styles.accessBody}>{accessPosture.body}</Text>
                <View style={styles.accessDetailRow}>
                  {accessDetails.map((detail) => (
                    <View key={detail.label} style={styles.accessDetailCard}>
                      <Text style={styles.accessDetailLabel}>{detail.label}</Text>
                      <Text style={styles.accessDetailValue}>{detail.value}</Text>
                      <Text style={styles.accessDetailBody}>{detail.body}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </>
          ) : null}
          {activeTab === "content" ? (
            <View style={styles.quickActionsCard}>
              <Text style={styles.quickActionsTitle}>
                {isSelfProfile ? "Your Uploaded Videos" : "Creator Videos"}
              </Text>
              {!creatorVideosReady ? (
                <Text style={styles.sectionBody}>Loading creator videos...</Text>
              ) : creatorVideos.length ? (
                <View style={styles.creatorVideoGrid}>
                  {creatorVideos.map((video) => (
                    <CreatorVideoCard
                      key={video.id}
                      video={video}
                      mode={isSelfProfile ? "owner" : "public"}
                      onOpen={() => openCreatorVideo(video)}
                      onShare={!isSelfProfile && isCreatorVideoPubliclyShareable(video) ? () => {
                        void shareCreatorVideo(video);
                      } : undefined}
                    />
                  ))}
                </View>
              ) : isSelfProfile ? (
                <View style={styles.creatorVideoEmptyCard}>
                  <Text style={styles.creatorVideoTitle}>Upload your first video</Text>
                  <Text style={styles.creatorVideoBody}>
                    Add a playable video right from this Profile so your Channel becomes watchable immediately.
                  </Text>
                  <TouchableOpacity
                    style={styles.ownerPromptAction}
                    activeOpacity={0.84}
                    onPress={onPressUploadVideo}
                  >
                    <Text style={styles.ownerPromptActionText}>Upload Video</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.sectionBody}>
                  This channel has not published creator videos yet.
                </Text>
              )}
            </View>
          ) : null}
          {activeTab === "community" && communityActions.length ? (
            <View style={styles.quickActionsCard}>
              <Text style={styles.quickActionsTitle}>Community Follow-Up</Text>
              <View style={styles.quickActionsRow}>
                {communityActions.map((action) => (
                  <TouchableOpacity
                    key={action.label}
                    style={styles.quickActionChip}
                    activeOpacity={0.84}
                    onPress={action.onPress}
                  >
                    <Text style={styles.quickActionChipText}>{action.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : null}
          {activeTab === "live" ? (
            <>
              <View style={styles.ownerStatsRow}>
                {publicEventSummaryCards.map((card) => (
                  <View
                    key={card.label}
                    style={[
                      styles.ownerStatCard,
                      card.tone === "linked" && styles.ownerStatCardLinked,
                      card.tone === "live" && styles.ownerStatCardLive,
                    ]}
                  >
                    <Text style={styles.ownerStatLabel}>{card.label}</Text>
                    <Text style={styles.ownerStatValue}>{card.value}</Text>
                    <Text style={styles.ownerStatBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
              {!publicEventsReady ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionKicker}>EVENT STATUS</Text>
                  <Text style={styles.sectionTitle}>Loading public event truth</Text>
                  <Text style={styles.sectionBody}>
                    Checking backed creator events before showing live, replay, and reminder state.
                  </Text>
                </View>
              ) : null}
              {publicEventsReady && reminderActionNotice ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionKicker}>REMINDER STATUS</Text>
                  <Text style={styles.sectionBody}>{reminderActionNotice}</Text>
                </View>
              ) : null}
              {publicEventsReady && publicEvents.length ? (
                publicEvents.map((event) => {
                  const reminderSummary = publicReminderSummaryByEventId.get(event.id) ?? null;
                  const enrollment: EventReminderEnrollment = reminderSummary?.enrollment ?? {
                    eventId: event.id,
                    viewerUserId: currentUserId || null,
                    state: currentUserId ? "not_enrolled" : "signed_out",
                    reminderReady: event.reminder.reminderReady,
                    canEnroll: event.reminder.canSetReminder,
                    reason: currentUserId ? "ready" : "signed_out",
                    updatedAt: null,
                  };

                  return (
                    <View
                      key={event.id}
                      style={[
                        styles.sectionCard,
                        (event.isLiveNow || event.isUpcoming) && styles.sectionCardLive,
                      ]}
                    >
                      <Text style={styles.sectionKicker}>{formatEventTypeLabel(event.eventType).toUpperCase()}</Text>
                      <Text style={styles.sectionTitle}>{event.eventTitle}</Text>
                      <Text style={styles.sectionBody}>
                        {formatEventStatusLabel(event)} · Starts {formatEventDate(event.startsAt)} · Ends {formatEventDate(event.endsAt)}{"\n"}
                        {event.replay.isReplayAvailableNow
                          ? "Replay is currently available."
                          : event.replay.isReplayExpired
                            ? "Replay window has expired."
                            : event.replay.policy === "none"
                              ? "Replay is not enabled for this event."
                              : "Replay is configured but not available yet."}{"\n"}
                        {formatEventReminderLabel(event)} · {formatEventReminderEnrollmentLabel(enrollment)}
                        {event.linkedTitleId ? `\nWatch title: ${event.linkedTitleId}` : ""}
                      </Text>
                      <Text style={styles.actionFootnote}>{getEventReminderEnrollmentBody(enrollment)}</Text>
                      {event.reminder.canSetReminder ? (
                        <View style={styles.secondaryActionRow}>
                          {currentUserId ? (
                            <TouchableOpacity
                              style={[
                                styles.actionChip,
                                enrollment.state === "active" && styles.actionChipConnected,
                                reminderActionLoading === event.id && styles.actionChipPlaceholder,
                              ]}
                              onPress={() => onToggleReminderEnrollment(event.id, enrollment.state !== "active")}
                              activeOpacity={0.86}
                              disabled={reminderActionLoading === event.id}
                            >
                              <Text
                                style={[
                                  styles.actionChipText,
                                  enrollment.state === "active" && styles.actionChipTextConnected,
                                  reminderActionLoading === event.id && styles.actionChipTextPlaceholder,
                                ]}
                              >
                                {reminderActionLoading === event.id
                                  ? "Saving…"
                                  : enrollment.state === "active"
                                    ? "Cancel Reminder"
                                    : "Set Reminder"}
                              </Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  );
                })
              ) : publicEventsReady ? (
                <View style={styles.sectionCard}>
                  <Text style={styles.sectionKicker}>EVENT STATUS</Text>
                  <Text style={styles.sectionTitle}>No public event schedule yet</Text>
                  <Text style={styles.sectionBody}>
                    This profile does not currently have any non-draft creator events to show. The route stays honest instead of faking upcoming rooms or reminder state.
                  </Text>
                </View>
              ) : null}
            </>
          ) : null}
        </View>
        <ReportSheet
          visible={reportVisible}
          title={profilePostCommentReportTarget
            ? "Report comment"
            : profilePostReportTarget
            ? "Report profile update"
            : isOfficialProfile ? "Report official account concern" : "Report profile or participant"}
          description={profilePostCommentReportTarget
            ? `Send a safety report for this comment under ${profile.displayName}'s post.`
            : profilePostReportTarget
            ? `Send a safety report for this public update from ${profile.displayName}.`
            : isOfficialProfile
              ? `Send a safety report for ${profile.displayName} if an official platform interaction feels unsafe, misleading, or compromised.`
              : `Send a safety report for ${profile.displayName} if this identity feels abusive, unsafe, or misrepresented.`}
          busy={reportBusy}
          onSubmit={onSubmitProfileReport}
          onClose={() => {
            if (reportBusy) return;
            setProfilePostReportTarget(null);
            setProfilePostCommentReportTarget(null);
            setReportVisible(false);
          }}
        />
      </ScrollView>
      </KeyboardAvoidingView>
      {watchPartyPremiumGate?.reason === "premium_required" ? (
        <AccessSheet
          visible={watchPartyPremiumSheetVisible}
          reason="premium_required"
          gate={watchPartyPremiumGate}
          appDisplayName={branding.appDisplayName}
          premiumUpsellTitle={monetizationConfig.premiumUpsellTitle}
          premiumUpsellBody={monetizationConfig.premiumUpsellBody}
          kickerOverride={watchPartyGatePresentation?.kicker}
          titleOverride={watchPartyGatePresentation?.title}
          bodyOverride={watchPartyGatePresentation?.body}
          actionLabelOverride={watchPartyGatePresentation?.actionLabel}
          onPurchaseResult={(result) => {
            if (!result.ok) {
              return {
                message: result.message,
                tone: "error" as const,
              };
            }
            return {
              message: "Premium access updated. Try Watch-Party Live again.",
              tone: "success" as const,
            };
          }}
          onRestoreResult={(result) => {
            if (!result.ok) {
              return {
                message: result.message,
                tone: "error" as const,
              };
            }
            return {
              message: "Purchases restored. Try Watch-Party Live again.",
              tone: "success" as const,
            };
          }}
          onClose={() => setWatchPartyPremiumSheetVisible(false)}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  outerFlex: { flex: 1 },
  fullBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  fullBackgroundFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0B0B10",
  },
  fullBackgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  screen: { flex: 1, backgroundColor: "transparent" },
  content: { paddingTop: 56, paddingBottom: 48, paddingHorizontal: 18, gap: 14 },
  contentKeyboardInset: { paddingBottom: 128 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backArrow: { color: "#aaa", fontSize: 20, fontWeight: "700", paddingRight: 8 },
  kicker: { color: "#555", fontSize: 9.5, fontWeight: "800", letterSpacing: 1.2 },

  profileCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(18,18,18,0.96)",
    overflow: "hidden",
    alignItems: "stretch",
    gap: 0,
  },
  profileCover: {
    minHeight: 88,
    padding: 16,
    justifyContent: "flex-start",
    backgroundColor: "#171A22",
  },
  profileCoverTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },
  profileCoverBadgeRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 7, flexShrink: 1 },
  profileIdentityRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 13,
    paddingHorizontal: 16,
    marginTop: -34,
  },
  profileIdentityCopy: {
    flex: 1,
    minWidth: 0,
    paddingTop: 34,
    paddingBottom: 4,
    gap: 3,
  },
  profileEyebrow: { color: "#A9B3C7", fontSize: 9.5, fontWeight: "900", letterSpacing: 1.5 },
  heroBadgeRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: -2 },
  heroBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  heroBadgeDefault: {
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  heroBadgeLive: {
    borderColor: "rgba(220,20,60,0.32)",
    backgroundColor: "rgba(220,20,60,0.14)",
  },
  heroBadgeOfficial: {
    borderColor: "rgba(242,194,91,0.38)",
    backgroundColor: "rgba(242,194,91,0.14)",
  },
  heroBadgeLinked: {
    borderColor: "rgba(115,134,255,0.26)",
    backgroundColor: "rgba(115,134,255,0.12)",
  },
  heroBadgeText: { color: "#A8B0C3", fontSize: 10.5, fontWeight: "900", letterSpacing: 0.8 },
  heroBadgeTextLive: { color: "#FFD5DD" },
  heroBadgeTextOfficial: { color: "#FFE6A6" },
  heroBadgeTextLinked: { color: "#D7DDFF" },
  avatarWrap: { position: "relative" },
  avatarCircle: {
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 3,
    borderColor: "rgba(18,18,18,0.96)",
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarLiveDot: {
    position: "absolute",
    right: 4,
    bottom: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "rgba(18,18,18,0.96)",
    backgroundColor: "#DC143C",
  },
  avatarImage: { width: "100%", height: "100%" },
  avatarInitial: { color: "#fff", fontSize: 32, fontWeight: "900" },
  avatarHint: { color: "#7C879C", fontSize: 11, fontWeight: "700" },
  channelLabel: { color: "#A7B2C9", fontSize: 11, fontWeight: "800", letterSpacing: 0.6 },
  username: {
    color: "#fff",
    fontSize: 23,
    lineHeight: 27,
    fontWeight: "900",
    letterSpacing: 0,
    flexShrink: 1,
    includeFontPadding: false,
  },
  userIdLabel: { color: "#A0A0A0", fontSize: 13, fontWeight: "700" },
  profileTagline: { color: "#B8C1D6", fontSize: 13, lineHeight: 18, fontWeight: "600", textAlign: "left" },
  metaRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: 8, marginTop: 2 },
  metaPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  metaPillText: { color: "#D5D5D5", fontSize: 11, fontWeight: "800" },
  metaPillOfficial: {
    borderColor: "rgba(242,194,91,0.34)",
    backgroundColor: "rgba(242,194,91,0.12)",
  },
  metaPillLinked: {
    borderColor: "rgba(115,134,255,0.26)",
    backgroundColor: "rgba(115,134,255,0.12)",
  },
  metaPillTextOfficial: {
    color: "#FFE6A6",
  },
  livePill: {
    borderColor: "rgba(220,20,60,0.28)",
    backgroundColor: "rgba(220,20,60,0.12)",
  },
  livePillText: { color: "#F2C1CC" },
  channelSupportText: {
    color: "#9FA8BA",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
    textAlign: "left",
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  statusPanel: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 4,
  },
  statusPanelLive: {
    borderColor: "rgba(220,20,60,0.16)",
    backgroundColor: "rgba(48,16,24,0.82)",
  },
  statusPanelKicker: { color: "#7A859A", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  statusPanelTitle: { color: "#F3F5FA", fontSize: 16, fontWeight: "900" },
  statusPanelBody: { color: "#9CA5B8", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  channelSignalGrid: { width: "100%", flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 14 },
  channelSignalCard: {
    flexBasis: "31%",
    flexGrow: 1,
    minWidth: 86,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  channelSignalCardLive: {
    borderColor: "rgba(220,20,60,0.2)",
    backgroundColor: "rgba(50,16,24,0.78)",
  },
  channelSignalCardLinked: {
    borderColor: "rgba(115,134,255,0.22)",
    backgroundColor: "rgba(23,31,52,0.78)",
  },
  channelSignalCardOfficial: {
    borderColor: "rgba(242,194,91,0.28)",
    backgroundColor: "rgba(46,34,18,0.78)",
  },
  channelSignalLabel: { color: "#7E889D", fontSize: 9.5, fontWeight: "900", letterSpacing: 0.9 },
  channelSignalValue: { color: "#F3F5FA", fontSize: 15, fontWeight: "900" },
  channelSignalBody: { color: "#9FA8BA", fontSize: 11, lineHeight: 15, fontWeight: "600" },
  channelGuideCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 5,
  },
  officialTopicRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  officialTopicChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(242,194,91,0.3)",
    backgroundColor: "rgba(242,194,91,0.12)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  officialTopicChipText: {
    color: "#FFE6A6",
    fontSize: 10.5,
    fontWeight: "900",
  },
  channelGuideKicker: { color: "#7A859A", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  channelGuideTitle: { color: "#F4F7FF", fontSize: 15, fontWeight: "900" },
  channelGuideBody: { color: "#A2ABBD", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  accessCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.16)",
    backgroundColor: "rgba(17,24,40,0.84)",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 8,
  },
  accessKicker: { color: "#7E8AA0", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  accessTitle: { color: "#F2F5FF", fontSize: 16, fontWeight: "900" },
  accessBody: { color: "#A9B3C7", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  accessDetailRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  accessDetailCard: {
    flexBasis: "31%",
    flexGrow: 1,
    minWidth: 98,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 4,
  },
  accessDetailLabel: { color: "#8590A6", fontSize: 10, fontWeight: "900", letterSpacing: 0.9 },
  accessDetailValue: { color: "#F4F7FF", fontSize: 15, fontWeight: "900" },
  accessDetailBody: { color: "#AAB3C7", fontSize: 11.5, lineHeight: 16, fontWeight: "600" },
  quickActionsCard: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.2)",
    backgroundColor: "rgba(24,34,58,0.88)",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 8,
  },
  quickActionsTitle: { color: "#F2F5FD", fontSize: 14, fontWeight: "900" },
  quickActionsRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 },
  quickActionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.24)",
    backgroundColor: "rgba(115,134,255,0.12)",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  quickActionChipText: { color: "#E0E7FF", fontSize: 12, fontWeight: "800" },
  feedComposerCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(18,18,18,0.96)",
    padding: 13,
    gap: 12,
  },
  feedComposerPromptRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  composerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  feedAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.09)",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  composerAvatarImage: { width: "100%", height: "100%" },
  composerAvatarInitial: { color: "#fff", fontSize: 16, fontWeight: "900" },
  feedComposerPrompt: {
    flex: 1,
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.055)",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  feedComposerPromptText: { color: "#C6CEDD", fontSize: 13, fontWeight: "700" },
  feedComposerClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  feedComposerExpanded: { gap: 10 },
  feedComposerTextArea: { minHeight: 72 },
  feedComposerAttachButton: {
    minHeight: 44,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.25)",
    backgroundColor: "rgba(115,134,255,0.15)",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  feedComposerAttachText: { color: "#EAF0FF", fontSize: 13, fontWeight: "900" },
  feedComposerFileCard: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
    padding: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  feedComposerFileIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: "rgba(220,20,60,0.86)",
    alignItems: "center",
    justifyContent: "center",
  },
  feedComposerFileText: { flex: 1, gap: 2 },
  feedComposerActionRow: { flexDirection: "row", gap: 10 },
  feedComposerPostButton: {
    flex: 1.2,
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: "#DC143C",
    alignItems: "center",
    justifyContent: "center",
  },
  feedComposerPostText: { color: "#fff", fontSize: 13, fontWeight: "900" },
  profilePostComposerCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.16)",
    backgroundColor: "rgba(13,18,32,0.88)",
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
  },
  profilePostComposerCopy: {
    flex: 1,
    gap: 2,
  },
  profilePostComposerTitle: {
    color: "#F4F7FF",
    fontSize: 14,
    fontWeight: "900",
  },
  profilePostComposerMeta: {
    color: "#95A0B6",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "700",
  },
  profilePostComposerFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  profilePostComposerTools: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  profilePostAttachButton: {
    minHeight: 34,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.055)",
    paddingHorizontal: 11,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  profilePostAttachButtonText: {
    color: "#E6ECFA",
    fontSize: 11.5,
    fontWeight: "900",
  },
  profilePostComposerCount: {
    color: "#8E98AE",
    fontSize: 11.5,
    fontWeight: "800",
  },
  profilePostComposerButton: {
    flex: 0,
    minWidth: 96,
    paddingHorizontal: 16,
  },
  feedStack: { gap: 12 },
  feedPostCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(18,18,18,0.96)",
    overflow: "hidden",
  },
  feedPostHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 13,
    paddingTop: 13,
    paddingBottom: 9,
  },
  feedPostIdentity: { flex: 1, gap: 2 },
  feedPostName: { color: "#F4F7FF", fontSize: 14, fontWeight: "900" },
  feedPostMeta: { color: "#8D97AA", fontSize: 11.5, fontWeight: "700" },
  feedDraftBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.26)",
    backgroundColor: "rgba(115,134,255,0.12)",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  feedDraftBadgeText: { color: "#DDE4FF", fontSize: 10.5, fontWeight: "900" },
  feedPostCaption: {
    color: "#DDE3F0",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
    paddingHorizontal: 13,
    paddingBottom: 11,
  },
  feedPostAttachmentStack: {
    paddingHorizontal: 13,
    paddingBottom: 12,
    gap: 8,
  },
  feedVideoPreview: {
    minHeight: 204,
    backgroundColor: "#0A0D14",
    justifyContent: "flex-end",
  },
  feedVideoPreviewUnavailable: { opacity: 0.82 },
  feedVideoThumbnail: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  feedVideoFallback: {
    ...StyleSheet.absoluteFillObject,
    padding: 16,
    justifyContent: "center",
    backgroundColor: "#121723",
  },
  feedVideoFallbackKicker: { color: "#8792A7", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  feedVideoFallbackTitle: { color: "#F6F8FF", fontSize: 22, lineHeight: 27, fontWeight: "900", marginTop: 5 },
  feedVideoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  feedPlayBadge: {
    position: "absolute",
    left: 14,
    top: 14,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(220,20,60,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  feedVideoTitle: {
    color: "#FFFFFF",
    fontSize: 19,
    lineHeight: 23,
    fontWeight: "900",
    padding: 14,
  },
  feedPostActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    padding: 8,
    gap: 8,
  },
  feedPostAction: {
    flexGrow: 1,
    flexBasis: "30%",
    minWidth: 104,
    minHeight: 38,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.055)",
  },
  feedPostActionDisabled: { opacity: 0.5 },
  feedPostActionText: { color: "#E6ECFA", fontSize: 12.5, fontWeight: "900" },
  profilePostCommentsPanel: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    padding: 11,
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.025)",
  },
  profilePostCommentsLoading: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  profilePostCommentList: { gap: 8 },
  profilePostCommentThread: {
    gap: 7,
  },
  profilePostCommentCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.045)",
    padding: 10,
    gap: 6,
  },
  profilePostReplyCard: {
    marginLeft: 22,
    borderColor: "rgba(115,134,255,0.18)",
    backgroundColor: "rgba(115,134,255,0.07)",
  },
  profilePostCommentHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  profilePostCommentAuthor: {
    flex: 1,
    color: "#F3F6FF",
    fontSize: 12.5,
    fontWeight: "900",
  },
  profilePostCommentMeta: {
    color: "#8994A9",
    fontSize: 10.5,
    fontWeight: "800",
  },
  profilePostCommentBody: {
    color: "#DDE3F0",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  profilePostCommentAttachmentStack: {
    gap: 7,
  },
  profilePostCommentActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  profilePostCommentAction: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.055)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  profilePostCommentActionText: {
    color: "#DDE5F7",
    fontSize: 11,
    fontWeight: "900",
  },
  profilePostCommentEmpty: {
    color: "#AAB3C7",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  profilePostCommentNotice: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.24)",
    backgroundColor: "rgba(220,20,60,0.1)",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  profilePostCommentNoticeText: {
    color: "#FFD7DF",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "800",
  },
  profilePostCommentComposer: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.16)",
    backgroundColor: "rgba(13,18,32,0.72)",
    padding: 10,
    gap: 8,
  },
  profilePostReplyNotice: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.2)",
    backgroundColor: "rgba(115,134,255,0.09)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
  },
  profilePostReplyNoticeText: {
    color: "#E7ECFF",
    fontSize: 11.5,
    fontWeight: "900",
  },
  profilePostReplyCancelText: {
    color: "#AFC0FF",
    fontSize: 11,
    fontWeight: "900",
  },
  profilePostCommentInput: {
    width: "100%",
    minHeight: 58,
    maxHeight: 132,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.055)",
    color: "#F7F9FF",
    paddingHorizontal: 11,
    paddingVertical: 9,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "700",
    textAlignVertical: "top",
  },
  profilePostCommentComposerFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  profilePostCommentSubmit: {
    minHeight: 36,
    minWidth: 82,
    borderRadius: 12,
    backgroundColor: "#DC143C",
    paddingHorizontal: 13,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  feedEmptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(18,18,18,0.96)",
    padding: 16,
    gap: 8,
    alignItems: "flex-start",
  },
  feedEmptyTitle: { color: "#F4F7FF", fontSize: 16, fontWeight: "900" },
  feedEmptyText: { color: "#A8B1C3", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  feedEmptyButton: {
    marginTop: 4,
    borderRadius: 13,
    backgroundColor: "#DC143C",
    paddingHorizontal: 13,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  feedEmptyButtonText: { color: "#fff", fontSize: 12.5, fontWeight: "900" },
  creatorVideoGrid: {
    gap: 10,
  },
  creatorVideoCard: {
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 142,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 10,
    gap: 8,
  },
  creatorVideoThumb: {
    aspectRatio: 16 / 9,
    borderRadius: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(220,20,60,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  creatorVideoThumbImage: {
    width: "100%",
    height: "100%",
  },
  creatorVideoThumbText: {
    color: "#FFE4EB",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  creatorVideoVisibilityBadge: {
    position: "absolute",
    right: 6,
    top: 6,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.66)",
    paddingHorizontal: 7,
    paddingVertical: 4,
  },
  creatorVideoVisibilityText: {
    color: "#F4F7FF",
    fontSize: 9,
    fontWeight: "900",
  },
  creatorVideoTitle: {
    color: "#F3F6FF",
    fontSize: 13.5,
    fontWeight: "900",
  },
  creatorVideoBody: {
    color: "#AAB3C7",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "600",
  },
  creatorVideoEmptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.22)",
    backgroundColor: "rgba(220,20,60,0.08)",
    padding: 12,
    gap: 8,
  },
  tabStripCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(18,18,18,0.96)",
    paddingVertical: 9,
    paddingHorizontal: 8,
  },
  tabStripKicker: { color: "#727C91", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  tabStripRow: { flexDirection: "row", gap: 7, paddingRight: 14 },
  tabChip: {
    minHeight: 38,
    minWidth: 68,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  tabChipActive: {
    borderColor: "rgba(115,134,255,0.28)",
    backgroundColor: "rgba(115,134,255,0.14)",
  },
  tabChipText: { color: "#B5BED1", fontSize: 12, fontWeight: "800" },
  tabChipTextActive: { color: "#E4E9FF" },
  tabIntro: { color: "#9FA8BA", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  viewSwitchRow: { flexDirection: "row", gap: 10, width: "100%" },
  viewSwitchChip: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingVertical: 9,
    alignItems: "center",
  },
  viewSwitchChipActive: {
    borderColor: "rgba(115,134,255,0.28)",
    backgroundColor: "rgba(115,134,255,0.14)",
  },
  viewSwitchChipText: { color: "#B5BED1", fontSize: 12.5, fontWeight: "800" },
  viewSwitchChipTextActive: { color: "#E4E9FF" },
  actionCluster: { width: "100%", gap: 10, marginTop: 6 },
  primaryActionRow: { flexDirection: "row", gap: 10, width: "100%" },
  secondaryActionRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10 },
  actionBtn: {
    flex: 1,
    minWidth: 0,
    minHeight: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  actionBtnPrimary: {
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "#F3F4F8",
  },
  actionBtnSecondary: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  actionBtnConnected: {
    borderColor: "rgba(115,134,255,0.24)",
    backgroundColor: "rgba(115,134,255,0.14)",
  },
  actionBtnLive: {
    borderColor: "rgba(220,20,60,0.34)",
    backgroundColor: "rgba(220,20,60,0.16)",
  },
  actionBtnPlaceholder: {
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  actionBtnText: { color: "#E7EAF3", fontSize: 13.5, fontWeight: "900" },
  actionBtnTextPrimary: { color: "#090A0F" },
  actionBtnTextConnected: { color: "#E4E8FF" },
  actionBtnTextLive: { color: "#FFD7DE" },
  actionBtnTextPlaceholder: { color: "#9BA4B7" },
  actionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  actionChipConnected: {
    borderColor: "rgba(115,134,255,0.22)",
    backgroundColor: "rgba(115,134,255,0.12)",
  },
  actionChipReport: {
    borderColor: "rgba(220,20,60,0.24)",
    backgroundColor: "rgba(220,20,60,0.12)",
  },
  actionChipPlaceholder: {
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  actionChipPlaceholderMuted: {
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  actionChipText: { color: "#DCE2F0", fontSize: 12, fontWeight: "800" },
  actionChipTextConnected: { color: "#DDE4FF" },
  actionChipTextReport: { color: "#FFD6DE" },
  actionChipTextPlaceholder: { color: "#97A1B5" },
  actionChipTextMuted: { color: "#9AA3B7" },
  ownerActionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.035)",
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  ownerActionChipPrimary: {
    borderColor: "rgba(115,134,255,0.22)",
    backgroundColor: "rgba(115,134,255,0.12)",
  },
  ownerActionChipText: { color: "#DDE4FF", fontSize: 12.5, fontWeight: "800" },
  ownerActionChipTextPrimary: { color: "#EEF2FF" },
  actionFootnote: { color: "#6D7486", fontSize: 11.5, lineHeight: 16, fontWeight: "600", textAlign: "center" },
  ownerHeroToolsCard: {
    width: "100%",
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.24)",
    backgroundColor: "rgba(28,13,24,0.82)",
    padding: 14,
    gap: 8,
  },
  ownerHeroToolsKicker: { color: "#F7AFC0", fontSize: 10.5, fontWeight: "900", letterSpacing: 1 },
  ownerHeroToolsTitle: { color: "#FFF5F8", fontSize: 17, fontWeight: "900" },
  ownerHeroToolsBody: { color: "#D7DFEF", fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  ownerHeroToolsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ownerHeroToolsButton: {
    flexGrow: 1,
    minWidth: 118,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  ownerHeroToolsButtonPrimary: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#DC143C",
  },
  ownerHeroToolsButtonDisabled: {
    opacity: 0.56,
  },
  ownerHeroToolsButtonText: { color: "#E9EEFB", fontSize: 13, fontWeight: "900" },
  ownerHeroToolsButtonTextPrimary: { color: "#fff", fontSize: 13, fontWeight: "900" },
  profileComposerStack: {
    width: "100%",
    gap: 10,
  },
  profileComposerInput: {
    width: "100%",
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#F7F9FF",
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 13,
    fontWeight: "700",
  },
  profileComposerTextArea: {
    minHeight: 82,
    textAlignVertical: "top",
    lineHeight: 18,
  },
  profileComposerAttachButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.24)",
    backgroundColor: "rgba(115,134,255,0.14)",
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  profileComposerAttachText: { color: "#E4E9FF", fontSize: 13, fontWeight: "900" },
  profileComposerFileCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(0,0,0,0.2)",
    padding: 12,
    gap: 4,
  },
  profileComposerFileKicker: { color: "#8A95AA", fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  profileComposerFileName: { color: "#F6F8FF", fontSize: 13.5, fontWeight: "900" },
  profileComposerFileMeta: { color: "#A9B2C6", fontSize: 11.5, fontWeight: "700" },
  profileComposerVisibilityRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  profileComposerVisibilityChip: {
    flexGrow: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  profileComposerVisibilityChipActive: {
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(220,20,60,0.22)",
  },
  profileComposerVisibilityText: { color: "#BAC3D6", fontSize: 12.5, fontWeight: "900" },
  profileComposerVisibilityTextActive: { color: "#FFF6F8" },
  profileComposerNotice: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  profileComposerNoticeText: { color: "#DDE5F7", fontSize: 12.5, lineHeight: 17, fontWeight: "700" },
  profileComposerSubmitContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ownerModeCard: {
    width: "100%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.12)",
    backgroundColor: "rgba(13,18,32,0.8)",
    padding: 15,
    gap: 10,
  },
  ownerModeKicker: { color: "#8390AB", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  ownerModeTitle: { color: "#F4F7FF", fontSize: 16.5, fontWeight: "900" },
  ownerModeBody: { color: "#B4BDD1", fontSize: 13, lineHeight: 19 },
  ownerSignalRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ownerSignalChip: {
    flexGrow: 1,
    flexBasis: 92,
    minWidth: 92,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(255,255,255,0.03)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  ownerSignalChipLinked: {
    borderColor: "rgba(115,134,255,0.18)",
    backgroundColor: "rgba(115,134,255,0.1)",
  },
  ownerSignalChipLive: {
    borderColor: "rgba(220,20,60,0.22)",
    backgroundColor: "rgba(220,20,60,0.1)",
  },
  ownerSignalValue: { color: "#EEF2FF", fontSize: 18, fontWeight: "900" },
  ownerSignalLabel: { color: "#98A3B8", fontSize: 11.5, fontWeight: "800" },
  ownerStatsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ownerStatCard: {
    flexGrow: 1,
    flexBasis: 110,
    minWidth: 110,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
    gap: 4,
  },
  ownerStatCardLinked: {
    borderColor: "rgba(115,134,255,0.22)",
    backgroundColor: "rgba(115,134,255,0.12)",
  },
  ownerStatCardLive: {
    borderColor: "rgba(220,20,60,0.26)",
    backgroundColor: "rgba(220,20,60,0.12)",
  },
  ownerStatLabel: { color: "#8F99AE", fontSize: 10.5, fontWeight: "900", letterSpacing: 0.9 },
  ownerStatValue: { color: "#F6F8FF", fontSize: 22, fontWeight: "900" },
  ownerStatBody: { color: "#B1BCD0", fontSize: 12, lineHeight: 17 },
  ownerQuickActionRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  ownerPromptStack: { gap: 10 },
  ownerPromptCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.02)",
    padding: 12,
    gap: 6,
  },
  ownerPromptKicker: { color: "#8B95AA", fontSize: 10.5, fontWeight: "900", letterSpacing: 1 },
  ownerPromptTitle: { color: "#F0F4FF", fontSize: 15, fontWeight: "900" },
  ownerPromptBody: { color: "#B5BED2", fontSize: 12.5, lineHeight: 18 },
  ownerPromptAction: {
    alignSelf: "flex-start",
    marginTop: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.18)",
    backgroundColor: "rgba(115,134,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ownerPromptActionText: { color: "#E4E9FF", fontSize: 12, fontWeight: "800" },

  sectionStack: { gap: 12 },
  sectionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(18,18,18,0.96)",
    padding: 16,
    gap: 6,
  },
  sectionCardLive: {
    borderColor: "rgba(220,20,60,0.18)",
    backgroundColor: "rgba(28,16,20,0.96)",
  },
  sectionCardOfficial: {
    borderColor: "rgba(242,194,91,0.22)",
    backgroundColor: "rgba(28,23,14,0.96)",
  },
  sectionKicker: { color: "#727C91", fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  sectionTitle: { color: "#ECECEC", fontSize: 16, fontWeight: "900" },
  sectionBody: { color: "#8B8B8B", fontSize: 13, lineHeight: 18, fontWeight: "600" },
});
