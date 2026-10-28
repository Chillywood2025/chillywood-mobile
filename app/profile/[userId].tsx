import { ConversationTimestamp } from "../../components/social/conversation-timestamp";
import { conversationCreatedAt } from "../../_lib/conversationTimestamp";
import { useLocalSearchParams, useRouter } from "expo-router";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { useSession } from "../../_lib/session";
import { getCurrentAccountSessionAuthoritySnapshot, sameAccountSessionAuthority } from "../../_lib/accountSessionAuthority";
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
import { createActionSingleFlightLatch } from "../../_lib/actionSingleFlight.mjs";
import { getOrCreateDirectThread } from "../../_lib/chat";
import {
  acceptChillyCircleRequest,
  cancelChillyCircleRequest,
  declineChillyCircleRequest,
  readFriendListSummary,
  readFriendRelationshipState,
  removeFromChillyCircle,
  sendChillyCircleRequest,
  type FriendRelationshipState,
} from "../../_lib/friendGraph";
import {
  blockChannelAudienceMember,
  followChannel,
  readMyChannelFollowState,
  unfollowChannel,
  type ChannelViewerFollowState,
} from "../../_lib/channelAudience";
import { useLiveDiscoveryFeed } from "../../_lib/useLiveDiscoveryFeed";
import { useProfileLiveState } from "../../_lib/useProfileLiveState";
import { ProfileLiveNow } from "../../components/live/profile-live-now";
import { useProfilePresentation } from "../../components/profile/use-profile-presentation";
import { Skeleton } from "../../components/ui/Skeleton";
import type { DiscoveryFeedItem } from "../../_lib/discoveryFeed";
import {
  type CreatorEventSummary,
  type CreatorEventType,
} from "../../_lib/liveEvents";
import {
  readNotificationListPage,
  readPublicEventReminderSummaries,
  resolveNotificationPath,
  setEventReminderEnrollment,
  type EventReminderEnrollment,
  type NotificationRecord,
  type PublicEventReminderSummary,
} from "../../_lib/notifications";
import { reportRuntimeError } from "../../_lib/logger";
import { createForegroundAuthenticatedUiCallIntent } from "../../_lib/nativeCallTransitionProvenance.mjs";
import {
  getMonetizationAccessSheetPresentation,
} from "../../_lib/monetization";
import {
  getRuntimeControlBlockedCopy,
  isRuntimeControlBlockedAccess,
  WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY,
  requireWatchPartyLivePremium,
  type PremiumWatchPartyFeatureAccessDecision,
} from "../../_lib/premiumWatchPartyAccess";
import {
  readCreatorVideos,
  type CreatorVideo,
} from "../../_lib/creatorVideos";
import { buildCreatorVideoDeepLink, isCreatorVideoPubliclyShareable } from "../../_lib/creatorVideoLinks";
import { buildSafetyReportContext, submitSafetyReport, trackModerationActionUsed } from "../../_lib/moderation";
import { getOfficialPlatformAccount } from "../../_lib/officialAccounts";
import {
  getProfilePrivacyLockedBody,
  getProfilePrivacyLockedTitle,
  resolveProfilePrivacyAccess,
  type ProfilePrivacyAccess,
} from "../../_lib/profilePrivacy";
import {
  createProfilePost,
  createProfilePostComment,
  deleteProfilePostComment,
  deleteProfilePost,
  readProfilePostCommentsPage,
  readProfilePostById,
  readProfilePostEngagementState,
  readProfilePostEngagementStates,
  readProfilePostsPage,
  setProfilePostLike,
  PROFILE_POST_BODY_LIMIT,
  PROFILE_POST_COMMENT_BODY_LIMIT,
  type ProfilePost,
  type ProfilePostComment,
  type ProfilePostEngagementState,
} from "../../_lib/profilePosts";
import {
  buildOwnProfileSocialFeed,
  buildPublicProfileActivityFeed,
  type ProfileSocialFeedActor,
  type ProfileSocialFeedActorMap,
  type ProfileSocialFeedItem,
  type ProfileSocialFeedMode,
  type ProfileSocialFeedPostActivity,
} from "../../_lib/profileSocialFeed";
import { readOwnProfileFeedHead, readOwnProfileFeedPage, type ProfileFeedHead } from "../../_lib/profileFeedReader";
import { hasNewProfileFeedHead, startProfileFeedFreshness } from "../../_lib/profileFeedFreshness";
import { readSharedLiveSnapshot } from "../../_lib/sharedLiveRead";
import { getNotificationActivityOwnerKey, subscribeToNotificationActivity } from "../../_lib/notificationActivity";
import {
  SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE,
  type SocialAttachmentPickerScope,
  type SocialAttachmentFile,
} from "../../_lib/socialAttachments";
import { pickSocialAttachmentFile } from "../../_lib/socialAttachmentPicker";
import { getUserFacingErrorMessage } from "../../_lib/userFacingErrors";
import {
  pickProfileMediaImage,
  removeProfileMedia,
  updateProfileMediaFitMode,
  uploadProfileMedia,
  type ProfileMediaImageFile,
  type ProfileMediaKind,
} from "../../_lib/profileMedia";
import {
    ActivityIndicator,
    Alert,
    AppState,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
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
  isProfileMediaActive,
  readUserProfileByUserId,
  saveUserProfileAbout,
  type ProfileAppearanceFitMode,
  type UserProfile,
} from "../../_lib/userData";
import { CreatorVideoCard } from "../../components/creator-media/creator-video-card";
import { ProfileSocialFeedCard } from "../../components/ProfileSocialFeedCard";
import { LinkedText } from "../../components/social/linked-text";
import { SocialAttachmentActionSheet } from "../../components/social/social-attachment-action-sheet";
import { SocialAttachmentCard } from "../../components/social/social-attachment-card";
import {
  ProfileActionsSheet,
  ProfileAppearanceSheet,
  ProfileImagePreviewSheet,
  ProfileMediaReviewSheet,
} from "../../components/profile/profile-media-sheets";
import { NotificationBellButton } from "../../components/notifications/notification-bell-button";
import { ReportSheet } from "../../components/safety/report-sheet";
import { AccessSheet } from "../../components/monetization/access-sheet";
import { StableImage } from "../../components/ui/StableImage";
import { AppText } from "../../components/ui/typography";

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

type ProfileSocialFeedExtraState = {
  actorsByUserId: ProfileSocialFeedActorMap;
  circleUserIds: string[];
  followedChannelUserIds: string[];
  circlePosts: ProfileSocialFeedPostActivity[];
  followedPosts: ProfileSocialFeedPostActivity[];
  circleVideos: CreatorVideo[];
  followedVideos: CreatorVideo[];
  notifications: NotificationRecord[];
  circleBackingUnavailable: boolean;
};

const createEmptyProfileSocialFeedExtras = (): ProfileSocialFeedExtraState => ({
  actorsByUserId: {},
  circleUserIds: [],
  followedChannelUserIds: [],
  circlePosts: [],
  followedPosts: [],
  circleVideos: [],
  followedVideos: [],
  notifications: [],
  circleBackingUnavailable: false,
});

const normalizeFeedUserId = (value: unknown) => String(value ?? "").trim();

const buildProfileSocialActor = (
  userId: string,
  profile: Pick<ReturnType<typeof buildUserChannelProfile>, "displayName" | "handle" | "avatarUrl"> | null,
): ProfileSocialFeedActor => ({
  userId,
  displayName: normalizeFeedUserId(profile?.displayName) || "Member",
  handle: normalizeFeedUserId(profile?.handle) || null,
  avatarUrl: normalizeFeedUserId(profile?.avatarUrl) || null,
});

async function readProfileSocialActor(userId: string): Promise<ProfileSocialFeedActor> {
  const normalizedUserId = normalizeFeedUserId(userId);
  const profile = normalizedUserId
    ? await readUserProfileByUserId(normalizedUserId).catch(() => null)
    : null;
  return buildProfileSocialActor(
    normalizedUserId,
    buildUserChannelProfile({
      id: normalizedUserId,
      profile,
      fallbackDisplayName: "Member",
    }),
  );
}

async function readProfileSocialActorMap(userIds: string[]): Promise<ProfileSocialFeedActorMap> {
  const normalizedUserIds = Array.from(new Set(userIds.map(normalizeFeedUserId).filter(Boolean))).slice(0, 24);
  const actors = await Promise.all(normalizedUserIds.map(readProfileSocialActor));
  return actors.reduce<ProfileSocialFeedActorMap>((map, actor) => {
    map[actor.userId] = actor;
    return map;
  }, {});
}

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
  commentsCursor?: string | null;
  commentsHasMore?: boolean;
  commentsLoading?: boolean;
  commentsRefreshAvailable?: boolean;
  comments?: ProfilePostComment[];
  commentDraft?: string;
  commentAttachmentFile?: SocialAttachmentFile | null;
  replyTargetCommentId?: string | null;
  commentBusy?: boolean;
  commentNotice?: string | null;
  likeBusy?: boolean;
  deletingCommentId?: string | null;
};

type ProfileAttachmentSheetTarget =
  | { surface: "post"; identity: string }
  | { surface: "comment"; post: ProfilePost; identity: string };

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
  if (value === "party_pass") return "Party Room Pass";
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
  return "Open Platform";
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
      return "Public activity stays follower-led here, so the Platform can feel social without pretending the whole audience sees every signal.";
    case "subscribers_only":
      return "Public activity stays Platform-subscriber-led here and remains distinct from account-tier premium access.";
    case "private":
      return "Public activity stays quiet here until the creator opens it up.";
    default:
      return "Public activity can show up openly on this Platform.";
  }
};

const formatAudienceSurfaceVisibilityValue = (enabled: boolean) => enabled ? "Active" : "Quiet";

const getAudienceSurfaceVisibilityBody = (surface: "followers" | "subscribers", enabled: boolean) => {
  if (surface === "followers") {
    return enabled
      ? "Follower cues can show up here when that relationship is real."
      : "This Platform keeps follower-only cues out of public view right now.";
  }
  return enabled
    ? "Subscriber cues can show up here when the Platform relationship is real."
    : "This Platform keeps subscriber-only cues out of public view right now.";
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

const shouldShowOwnerDraftMarker = (
  isSelfProfile: boolean,
  post: { visibility?: string },
) => isSelfProfile && post.visibility === "draft";

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
      return "You are enrolled for this event reminder. Delivery depends on notification availability.";
    case "canceled":
      return "Your reminder enrollment is currently off. You can turn it back on while this event stays reminder-ready.";
    case "signed_out":
      return "Sign in to save this event reminder.";
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
    return "Checking the Platform's current entry posture.";
  }
  if (resolution.reason === "channel_defaults_subscriber") {
    return "This Platform stays public to browse while deeper conversation and watch-party entry can be subscriber-led.";
  }
  if (resolution.reason === "channel_defaults_private") {
    return "This Platform stays public to browse while deeper room entry stays invite-led.";
  }
  if (resolution.reason === "channel_defaults_mixed") {
    return "Some entry stays open while member-only moments stay protected.";
  }
  return "Conversation and watch-party entry stay open by default on this Platform.";
};

const getWatchPartyAccessBody = (resolution: ChannelAccessResolution | null, ready: boolean) => {
  if (!ready || !resolution) return "checking watch-party entry";
  if (resolution.joinPolicy === "locked") return "invite-led room entry by default";
  if (resolution.watchPartyAccessRule === "party_pass") return "Party Room Pass entry by default";
  if (resolution.watchPartyAccessRule === "premium") return "Premium room entry by default";
  return "open room entry by default";
};

const getCommunicationAccessBody = (resolution: ChannelAccessResolution | null, ready: boolean) => {
  if (!ready || !resolution) return "checking Chi'lly Chat posture";
  if (resolution.communicationAccessRule === "party_pass") return "Chi'lly Chat follow-up can stay Party Room Pass-led by default";
  if (resolution.communicationAccessRule === "premium") return "Chi'lly Chat follow-up can stay Premium-led by default";
  return "Chi'lly Chat follow-up stays open by default";
};

const CHILLY_CIRCLE_BLOCKED_COPY =
  "A Platform audience block exists between these accounts, so Chi'lly Circle requests are unavailable.";

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
    return "checking public Platform posture";
  }
  if (resolution.reason === "channel_defaults_subscriber") {
    return "the Platform stays visible while member access protects deeper entry";
  }
  if (resolution.reason === "channel_defaults_private") {
    return "the Platform stays visible even when room entry is invite-led";
  }
  if (resolution.reason === "channel_defaults_mixed") {
    return "the Platform stays visible while access changes by surface";
  }
  return "the full Platform story stays open to browse";
};

const resolveProfileImageResizeMode = (fitMode?: ProfileAppearanceFitMode) => {
  if (fitMode === "fit") return "contain" as const;
  if (fitMode === "center") return "center" as const;
  return "cover" as const;
};

type ProfileCircleAction = "request" | "accept" | "decline" | "cancel" | "remove";

// The retained Profile route must re-resolve both relationship presentation and
// canonical access. A Circle result is never itself permission to view content.
function useProfileAudienceState(input: {
  userId: string;
  isOfficialProfile: boolean;
  isSelfProfile: boolean;
  channelAccessReady: boolean;
  profileVisibility?: UserProfile["profileVisibility"];
}) {
  const { authority, authorityStatus } = useSession();
  const focused = useIsFocused();
  const { userId, isOfficialProfile, isSelfProfile, channelAccessReady, profileVisibility } = input;
  const lifetime = useMemo(() => ({ authority, authorityStatus, userId, isOfficialProfile, isSelfProfile, channelAccessReady, profileVisibility }),
    [authority, authorityStatus, userId, isOfficialProfile, isSelfProfile, channelAccessReady, profileVisibility]);
  const latest = useRef(lifetime);
  latest.current = lifetime;
  const reloadRef = useRef<{ lifetime: object; run: () => Promise<void>; current: () => boolean; version: () => number } | null>(null);
  const mutationRef = useRef<{ lifetime: object; action: ProfileCircleAction } | null>(null);
  const [mutation, setMutation] = useState<typeof mutationRef.current>(null);
  const empty = { friendState: null as FriendRelationshipState | null, profilePrivacyAccess: null as ProfilePrivacyAccess | null,
    friendError: false, privacyError: false, profilePrivacyReady: false, chillyCircleLoading: false };
  const [state, setState] = useState(() => ({ ...empty, lifetime }));
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const { authority, authorityStatus, userId, isOfficialProfile, isSelfProfile, channelAccessReady, profileVisibility } = lifetime;
    let disposed = false, sequence = 0;
    const timers = new Set<ReturnType<typeof setTimeout>>();
    const guest = authorityStatus === "signed_out" && authority === null;
    const admitted = guest || (authorityStatus === "active" && !!authority && !authority.restoreOnly);
    const current = () => !disposed && latest.current === lifetime && focused && AppState.currentState === "active"
      && admitted && (guest ? getCurrentAccountSessionAuthoritySnapshot() === null
        : sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot()));
    const publish = (next: typeof state) => { stateRef.current = next; setState(next); };
    const clear = () => publish({ friendState: null, profilePrivacyAccess: null, friendError: false,
      privacyError: false, profilePrivacyReady: false, chillyCircleLoading: false, lifetime });
    const run = async () => {
      if (!current() || !userId || (!isOfficialProfile && !isSelfProfile && !channelAccessReady)
        || mutationRef.current?.lifetime === lifetime) return;
      const request = ++sequence;
      const viewerUserId = authority?.userId ?? null;
      const readCircle = !guest && !isOfficialProfile && !isSelfProfile;
      publish({ friendState: null, profilePrivacyAccess: null, friendError: false,
        privacyError: false, profilePrivacyReady: false, chillyCircleLoading: readCircle, lifetime });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const [privacy, friend] = await Promise.race([
          Promise.all([
            resolveProfilePrivacyAccess({ ownerUserId: userId, viewerUserId, visibility: isOfficialProfile || isSelfProfile ? "everyone" : profileVisibility })
              .then(value => ({ value, error: false })).catch(() => ({ value: null, error: true })),
            readCircle ? readFriendRelationshipState(userId)
              .then(value => ({ value, error: false })).catch(() => ({ value: null, error: true }))
              : Promise.resolve({ value: null, error: false }),
          ]),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Profile access timed out.")), 12_000); timers.add(timer); }),
        ]);
        if (!current() || request !== sequence) return;
        const privacyError = privacy.error || !privacy.value || privacy.value.reason === "unavailable"
          || privacy.value.ownerUserId !== userId || privacy.value.viewerUserId !== viewerUserId;
        const friendError = friend.error || (readCircle && (!friend.value
          || friend.value.otherUserId !== userId || friend.value.viewerUserId !== viewerUserId));
        publish({ lifetime, friendState: friendError ? null : friend.value,
          profilePrivacyAccess: privacyError ? null : privacy.value, friendError, privacyError,
          profilePrivacyReady: true, chillyCircleLoading: false });
      } catch {
        if (current() && request === sequence) publish({ lifetime, friendState: null, profilePrivacyAccess: null,
          friendError: readCircle, privacyError: true, profilePrivacyReady: true, chillyCircleLoading: false });
      } finally {
        if (timer !== undefined) { clearTimeout(timer); timers.delete(timer); }
      }
    };
    const owned = { lifetime, run, current, version: () => sequence };
    reloadRef.current = owned;
    clear();
    void run();
    const subscription = AppState.addEventListener("change", next => {
      if (next === "active") void run();
      else { ++sequence; clear(); for (const timer of timers) clearTimeout(timer); timers.clear(); }
    });
    return () => {
      disposed = true; ++sequence;
      subscription.remove();
      for (const timer of timers) clearTimeout(timer);
      if (reloadRef.current === owned) reloadRef.current = null;
    };
  }, [lifetime, focused]);

  const refreshProfileAudience = useCallback(async () => {
    if (reloadRef.current?.lifetime === lifetime) await reloadRef.current.run();
  }, [lifetime]);
  const performCircleAction = useCallback(async (action: ProfileCircleAction) => {
    const owned = reloadRef.current;
    const allowed = { request: state.friendState?.canRequest, accept: state.friendState?.canAccept,
      decline: state.friendState?.canDecline, cancel: state.friendState?.canCancel, remove: state.friendState?.canRemove };
    if (!owned?.current() || owned.lifetime !== lifetime || stateRef.current !== state || state.lifetime !== lifetime
      || state.chillyCircleLoading || state.friendError || !allowed[action] || mutationRef.current?.lifetime === lifetime) return null;
    const pending = { lifetime, action };
    const version = owned.version();
    mutationRef.current = pending;
    setMutation(pending);
    try {
      const actions = { request: sendChillyCircleRequest, accept: acceptChillyCircleRequest,
        decline: declineChillyCircleRequest, cancel: cancelChillyCircleRequest, remove: removeFromChillyCircle };
      const next = await actions[action](lifetime.userId);
      if (reloadRef.current !== owned || !owned.current() || owned.version() !== version) return null;
      if (next.otherUserId !== lifetime.userId || next.viewerUserId !== lifetime.authority?.userId) throw new Error("Chi'lly Circle status is unavailable right now.");
      return next;
    } catch (error) {
      if (reloadRef.current === owned && owned.current() && owned.version() === version) throw error;
      return null;
    } finally {
      if (mutationRef.current === pending) {
        mutationRef.current = null;
        setMutation(null);
        if (reloadRef.current?.lifetime === lifetime) void reloadRef.current.run();
      }
    }
  }, [lifetime, state]);
  const visible = state.lifetime === lifetime && focused && AppState.currentState === "active"
    && ((authorityStatus === "signed_out" && authority === null && getCurrentAccountSessionAuthoritySnapshot() === null)
      || (authorityStatus === "active" && !authority?.restoreOnly && sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot())));
  return { ...(visible ? state : empty), refreshProfileAudience, performCircleAction,
    chillyCircleActionBusy: mutation?.lifetime === lifetime ? mutation.action : null };
}

// The request epoch is scoped to both the route and the exact authenticated
// session. A retained screen must never publish another account's async result.
export function useProfileFeedPages(userId: string, own: boolean, enabled: boolean, postId: string) {
  const { authority, authorityStatus } = useSession();
  const focused = useIsFocused();
  const focusedRef = useRef(focused); focusedRef.current = focused;
  const identity = `${userId}:${authorityStatus}:${authority?.userId ?? ""}:${authority?.sessionGeneration ?? ""}:${own}:${enabled}:${postId}`;
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const epoch = useRef(0);
  const refreshRevision = useRef(0);
  const mutationRevision = useRef(0);
  const busy = useRef(false);
  const wasFocused = useRef(focused);
  const [state, setState] = useState({ identity, posts: [] as ProfilePost[], items: [] as ProfileSocialFeedItem[], head: null as ProfileFeedHead | null, ready: false, notice: null as string | null, cursor: null as string | null, hasMore: false });
  const load = useCallback(async (append = false) => {
    if (!enabled || !userId || (append && busy.current)) return;
    const request = ++epoch.current;
    const startedAtMutation = mutationRevision.current;
    const binding = authority;
    const current = () => identityRef.current === identity && request === epoch.current
      && (binding ? sameAccountSessionAuthority(binding, getCurrentAccountSessionAuthoritySnapshot()) : !getCurrentAccountSessionAuthoritySnapshot());
    busy.current = true;
    setState(s => ({ ...s, notice: null, ready: append ? s.ready : false }));
    try {
      const page = own
        ? await readOwnProfileFeedPage({ limit: 24, cursor: append ? state.cursor ?? undefined : undefined })
        : await readProfilePostsPage(userId, { limit: 24, cursor: append ? state.cursor ?? undefined : undefined });
      const linkedPost = !append && postId ? await readProfilePostById(postId) : null;
      if (!current()) return;
      if (startedAtMutation !== mutationRevision.current) {
        // A successful local create/delete is newer than this server snapshot.
        // Keep it visible and reread; never resurrect or erase it with old data.
        busy.current = false;
        void loadRef.current(append);
        return;
      }
      if (!append) refreshRevision.current += 1;
      const items = own ? page.items as ProfileSocialFeedItem[] : [];
      const posts = own ? items.flatMap(item => "post" in item ? [item.post] : []) : page.items as ProfilePost[];
      if (linkedPost && linkedPost.userId === userId && !posts.some(p => p.id === linkedPost.id)) posts.unshift(linkedPost);
      const unique = <T extends { id: string }>(values: T[]) => Array.from(new Map(values.map(value => [value.id, value])).values());
      setState(s => ({ identity, posts: unique([...(append ? s.posts : []), ...posts]), items: unique([...(append ? s.items : []), ...items]), head: append ? s.head : "head" in page ? page.head as ProfileFeedHead | null : null, ready: true,
        notice: postId && !append && (!linkedPost || linkedPost.userId !== userId) ? "This shared post is unavailable or private." : null,
        cursor: page.nextCursor, hasMore: page.hasMore }));
      return true;
    } catch {
      if (current()) setState(s => ({ ...s, identity, ready: true, notice: "Unable to load profile updates right now. Retry to reconnect." }));
    } finally { if (current()) busy.current = false; }
  }, [authority, enabled, identity, own, postId, state.cursor, userId]);
  const loadRef = useRef(load); loadRef.current = load;
  useEffect(() => {
    epoch.current += 1; busy.current = false;
    setState({ identity, posts: [], items: [], head: null, ready: !enabled, notice: null, cursor: null, hasMore: false });
    if (focusedRef.current && enabled) void loadRef.current();
    return () => { epoch.current += 1; };
  }, [identity, enabled]);
  useEffect(() => {
    if (focused && !wasFocused.current && enabled) void loadRef.current();
    wasFocused.current = focused;
  }, [focused, enabled]);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", next => { if (next === "active" && focused) void loadRef.current(); });
    return () => subscription.remove();
  }, [focused]);
  const visible = state.identity === identity;
  const acceptsPublication = () => identityRef.current === identity
    && (authority ? sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot()) : !getCurrentAccountSessionAuthoritySnapshot());
  return {
    posts: visible ? state.posts : [], items: visible ? state.items : [], head: visible ? state.head : null, ready: visible && state.ready,
    refreshRevision: refreshRevision.current,
    notice: visible ? state.notice : null, hasMore: visible && state.hasMore,
    refresh: () => loadRef.current(), loadMore: () => loadRef.current(true),
    setPosts: (update: React.SetStateAction<ProfilePost[]>) => { if (acceptsPublication()) { mutationRevision.current += 1; setState(s => ({ ...s, posts: typeof update === "function" ? update(s.posts) : update })); } },
    setNotice: (notice: string | null) => { if (acceptsPublication()) setState(s => ({ ...s, notice })); },
    setReady: (ready: boolean) => { if (acceptsPublication()) setState(s => ({ ...s, ready })); },
  };
}

export default function ProfileScreen() {
  const router = useRouter();
  const focused = useIsFocused();
  const { authority, authorityStatus } = useSession();
  const scrollViewRef = useRef<FlatList<ProfileSocialFeedItem> | null>(null);
  const profilePostComposerYRef = useRef(0);
  const profilePostInputRef = useRef<TextInput | null>(null);
  const followActionLatchRef = useRef(createActionSingleFlightLatch());
  const socialActionKeysRef = useRef(new Set<string>());
  const commentRevisionsRef = useRef(new Map<string, number>());
  const engagementRevisionsRef = useRef(new Map<string, number>());
  const visibleFeedPostIdsRef = useRef<string[]>([]);
  const onFeedViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: { item: ProfileSocialFeedItem; isViewable: boolean }[] }) => {
    visibleFeedPostIdsRef.current = viewableItems.filter(entry => entry.isViewable && "post" in entry.item)
      .flatMap(entry => "post" in entry.item ? [entry.item.post.id] : []).slice(0, 12);
  }).current;
  const feedViewabilityConfig = useRef({ itemVisiblePercentThreshold: 20 }).current;
  const currentUserId = authorityStatus === "active" && !authority?.restoreOnly ? authority?.userId ?? "" : "";
  const [chillyCircleCount, setChillyCircleCount] = useState<number | null>(null);
  const [viewerFollowState, setViewerFollowState] = useState<ProfileViewerFollowState>("unavailable");
  const [followActionBusy, setFollowActionBusy] = useState(false);
  const [appConfig, setAppConfig] = useState(DEFAULT_APP_CONFIG);
  const [creatorSettingsEnabled, setCreatorSettingsEnabled] = useState(DEFAULT_APP_CONFIG.features.creatorSettingsEnabled);
  const [watchPartyPremiumGate, setWatchPartyPremiumGate] = useState<PremiumWatchPartyFeatureAccessDecision | null>(null);
  const [watchPartyPremiumSheetVisible, setWatchPartyPremiumSheetVisible] = useState(false);
  const [profilePhotoSheetVisible, setProfilePhotoSheetVisible] = useState(false);
  const [profileBackgroundSheetVisible, setProfileBackgroundSheetVisible] = useState(false);
  const [profileActionsSheetVisible, setProfileActionsSheetVisible] = useState(false);
  const [profileImagePreview, setProfileImagePreview] = useState<{
    title: string;
    imageUrl?: string;
    fitMode?: ProfileAppearanceFitMode;
  } | null>(null);
  const [profileMediaReview, setProfileMediaReview] = useState<{
    kind: ProfileMediaKind;
    file: ProfileMediaImageFile;
    fitMode: ProfileAppearanceFitMode;
  } | null>(null);
  const [profileAppearanceBusy, setProfileAppearanceBusy] = useState<ProfileMediaKind | null>(null);
  const [profileBlockBusy, setProfileBlockBusy] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [profilePostReportTarget, setProfilePostReportTarget] = useState<ProfilePost | null>(null);
  const [profileMediaReportTarget, setProfileMediaReportTarget] = useState<ProfileMediaKind | null>(null);
  const [profilePostDraft, setProfilePostDraft] = useState("");
  const [profilePostAttachmentFile, setProfilePostAttachmentFile] = useState<SocialAttachmentFile | null>(null);
  const [profilePostBusy, setProfilePostBusy] = useState(false);
  const [profilePostDeletingId, setProfilePostDeletingId] = useState<string | null>(null);
  const [profilePostUiById, setProfilePostUiById] = useState<Record<string, ProfilePostUiState>>({});
  const [profileAttachmentSheetTarget, setProfileAttachmentSheetTarget] = useState<ProfileAttachmentSheetTarget | null>(null);
  const [profilePostCommentReportTarget, setProfilePostCommentReportTarget] = useState<{
    post: ProfilePost;
    comment: ProfilePostComment;
  } | null>(null);
  const [creatorVideos, setCreatorVideos] = useState<CreatorVideo[]>([]);
  const [creatorVideosReady, setCreatorVideosReady] = useState(false);
  const [creatorVideosError, setCreatorVideosError] = useState<string | null>(null);
  const [channelAccessResolution, setChannelAccessResolution] = useState<ChannelAccessResolution | null>(null);
  const [publicEvents, setPublicEvents] = useState<CreatorEventSummary[]>([]);
  const [publicReminderSummaries, setPublicReminderSummaries] = useState<PublicEventReminderSummary[]>([]);
  const [publicEventsReady, setPublicEventsReady] = useState(false);
  const [publicEventsError, setPublicEventsError] = useState<string | null>(null);
  const [publicEventsRetry, setPublicEventsRetry] = useState(0);
  const [profileSocialFeedExtras, setProfileSocialFeedExtras] = useState<ProfileSocialFeedExtraState>(
    createEmptyProfileSocialFeedExtras,
  );
  const [profileSocialFeedExtrasReady, setProfileSocialFeedExtrasReady] = useState(false);
  const [profileSocialFeedNotice, setProfileSocialFeedNotice] = useState<string | null>(null);
  const [socialRefresh, setSocialRefresh] = useState(0);
  const [feedFreshness, setFeedFreshness] = useState<{ identity: string; available: boolean; retry?: boolean }>({ identity: "", available: false });
  const [feedAppActive, setFeedAppActive] = useState(AppState.currentState === "active");
  const [reminderActionLoading, setReminderActionLoading] = useState<string | null>(null);
  const [reminderActionNotice, setReminderActionNotice] = useState<string | null>(null);
  const [aboutDraft, setAboutDraft] = useState("");
  const [aboutBusy, setAboutBusy] = useState(false);
  const [aboutNotice, setAboutNotice] = useState<string | null>(null);
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
    postId?: string;
  }>();
  const userId = String(Array.isArray(params.userId) ? params.userId[0] : params.userId ?? "").trim();
  const displayNameParam = String(Array.isArray(params.displayName) ? params.displayName[0] : params.displayName ?? "").trim();
  const avatarUrlParam = String(Array.isArray(params.avatarUrl) ? params.avatarUrl[0] : params.avatarUrl ?? "").trim();
  const taglineParam = String(Array.isArray(params.tagline) ? params.tagline[0] : params.tagline ?? "").trim();
  const roleParam = String(Array.isArray(params.role) ? params.role[0] : params.role ?? "").trim();
  const isLiveParam = String(Array.isArray(params.isLive) ? params.isLive[0] : params.isLive ?? "").trim().toLowerCase();
  // Legacy linked-room routing hint only; public live status comes from current discovery.
  const linkedLiveRoute = isLiveParam === "1" || isLiveParam === "true" || isLiveParam === "yes" || isLiveParam === "live";
  const selfParam = String(Array.isArray(params.self) ? params.self[0] : params.self ?? "").trim().toLowerCase();
  const partyIdParam = String(Array.isArray(params.partyId) ? params.partyId[0] : params.partyId ?? "").trim();
  const modeParam = String(Array.isArray(params.mode) ? params.mode[0] : params.mode ?? "").trim();
  const sourceParam = String(Array.isArray(params.source) ? params.source[0] : params.source ?? "").trim();
  const officialAccount = getOfficialPlatformAccount(userId);
  const {
    profile: channelAccessProfile, permissions: channelAccessPermissions, ready: channelAccessReady,
    error: profilePresentationError, refresh: refreshProfilePresentation, setProfile: setChannelAccessProfile,
  } = useProfilePresentation(userId, !officialAccount && !!userId && userId === currentUserId);
  const hasBackedProfileIdentity = !!channelAccessProfile;
  const profile = buildUserChannelProfile({
    id: userId,
    profile: channelAccessProfile,
    displayName: hasBackedProfileIdentity ? undefined : displayNameParam,
    avatarUrl: hasBackedProfileIdentity ? undefined : avatarUrlParam,
    tagline: hasBackedProfileIdentity ? undefined : taglineParam,
    role: hasBackedProfileIdentity ? undefined : roleParam,
    fallbackDisplayName: "Profile",
  });
  const branding = resolveBrandingConfig(appConfig);
  const monetizationConfig = resolveMonetizationConfig(appConfig);
  const requestedSelfProfile = selfParam === "1" || selfParam === "true";
  const isOfficialProfile = profile.identityKind === "official_platform";
  const hasVerifiedSelfIdentity = !!userId && !!currentUserId && userId === currentUserId;
  const isSelfProfile = !profile.isProtectedFromClaim
    && hasVerifiedSelfIdentity
    && (!requestedSelfProfile || hasVerifiedSelfIdentity);
  const profileAudience = useProfileAudienceState({ userId, isOfficialProfile, isSelfProfile,
    channelAccessReady, profileVisibility: channelAccessProfile?.profileVisibility });
  const { friendState, chillyCircleLoading, chillyCircleActionBusy, profilePrivacyAccess, profilePrivacyReady } = profileAudience;
  const canViewFullProfile = profilePrivacyAccess?.canViewFullProfile ?? false;
  const sharedPostId = String(Array.isArray(params.postId) ? params.postId[0] : params.postId ?? "").trim();
  const feedPages = useProfileFeedPages(userId, isSelfProfile, profilePrivacyReady && canViewFullProfile, sharedPostId);
  const { posts: profilePosts, setPosts: setProfilePosts, ready: profilePostsReady, setReady: setProfilePostsReady,
    notice: profilePostsNotice, setNotice: setProfilePostsNotice } = feedPages;
  const socialIdentity = `${userId}:${currentUserId}:${authority?.sessionGeneration ?? ""}`;
  const socialIdentityRef = useRef(socialIdentity);
  socialIdentityRef.current = socialIdentity;
  const isSocialIdentityCurrent = useCallback(() => socialIdentityRef.current === socialIdentity
    && (authority ? sameAccountSessionAuthority(authority, getCurrentAccountSessionAuthoritySnapshot()) : !getCurrentAccountSessionAuthoritySnapshot()), [authority, socialIdentity]);
  useEffect(() => {
    visibleFeedPostIdsRef.current = [];
    setProfilePostUiById({}); setAboutBusy(false); setAboutNotice(null);
    setProfilePostDraft(""); setProfilePostAttachmentFile(null); setProfilePostBusy(false);
    setProfileAttachmentSheetTarget(null); setProfilePostReportTarget(null); setProfilePostCommentReportTarget(null);
    setProfileMediaReportTarget(null); setReportVisible(false); setReportBusy(false);
    setProfileMediaReview(null); setProfileImagePreview(null); setProfilePhotoSheetVisible(false);
    setProfileBackgroundSheetVisible(false); setProfileActionsSheetVisible(false);
    setCreatorVideos([]); setCreatorVideosError(null);
    setPublicEvents([]); setPublicReminderSummaries([]);
    setProfileSocialFeedExtras(createEmptyProfileSocialFeedExtras());
  }, [socialIdentity]);

  useEffect(() => {
    let active = true;

    setPublicEventsReady(false);
    setPublicEventsError(null);

    if (!userId || !profilePrivacyReady) {
      setPublicEvents([]);
      setPublicReminderSummaries([]);
      setPublicEventsReady(!!profilePrivacyReady);
      return () => {
        active = false;
      };
    }

    if (!canViewFullProfile) {
      setPublicEvents([]);
      setPublicReminderSummaries([]);
      setPublicEventsReady(true);
      return () => {
        active = false;
      };
    }

    void readPublicEventReminderSummaries(userId, currentUserId || undefined, { throwOnUnavailable: true })
      .then((summaries) => {
        if (!active || !isSocialIdentityCurrent()) return;
        setPublicReminderSummaries(summaries);
        setPublicEvents(summaries.map((summary) => summary.event));
        setPublicEventsReady(true);
      })
      .catch(() => {
        if (!active || !isSocialIdentityCurrent()) return;
        setPublicEventsError("Unable to load public events. Please retry.");
        setPublicEventsReady(true);
      });

    return () => {
      active = false;
    };
  }, [canViewFullProfile, currentUserId, profilePrivacyReady, userId, publicEventsRetry, socialIdentity, isSocialIdentityCurrent]);

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

  const profileDiscovery = useLiveDiscoveryFeed({
    surface: "profile",
    creatorUserIds: Array.from(new Set([userId, ...(isSelfProfile ? [
      ...profileSocialFeedExtras.circleUserIds,
      ...profileSocialFeedExtras.followedChannelUserIds,
    ] : [])])).slice(0, 12),
    limit: 50,
    enabled: !!userId && profilePrivacyReady && canViewFullProfile && !isOfficialProfile,
  });
  const profileLive = useProfileLiveState(userId, !!userId && profilePrivacyReady && canViewFullProfile && !isOfficialProfile);
  const shouldShowLockedShell = profilePrivacyReady
    && (profileAudience.privacyError || (!!profilePrivacyAccess?.isLocked && !isOfficialProfile && !isSelfProfile));
  const shouldShowUnavailableProfile = channelAccessReady
    && profilePrivacyReady
    && !isOfficialProfile
    && !isSelfProfile
    && !channelAccessProfile;
  const profileMediaLoading = !shouldShowLockedShell && (!channelAccessReady || (!isOfficialProfile && !profilePrivacyReady));
  const canShowProfileMedia = !shouldShowLockedShell && (isOfficialProfile || (channelAccessReady && profilePrivacyReady && canViewFullProfile));
  const visibleProfileAvatarUrl = !canShowProfileMedia || !isProfileMediaActive(profile.profileAvatarMediaStatus)
    ? undefined
    : profile.avatarUrl;
  const visibleProfileBackgroundUrl = !canShowProfileMedia || !isProfileMediaActive(profile.profileBackgroundMediaStatus)
    ? undefined
    : profile.profileBackgroundUrl;
  const visibleProfileBackgroundOverlay = profile.profileBackgroundOverlayStrength;

  useEffect(() => {
    setAboutDraft(profile.tagline ?? "");
    setAboutNotice(null);
  }, [profile.tagline, userId, socialIdentity]);

  useEffect(() => {
    let active = true;

    setCreatorVideosReady(false);
    setCreatorVideosError(null);

    if (!userId || !profilePrivacyReady) {
      setCreatorVideos([]);
      setCreatorVideosReady(!!profilePrivacyReady);
      return () => {
        active = false;
      };
    }

    if (!canViewFullProfile) {
      setCreatorVideos([]);
      setCreatorVideosReady(true);
      return () => {
        active = false;
      };
    }

    void readCreatorVideos(userId, { includeDrafts: isSelfProfile, limit: 24, throwOnUnavailable: true })
      .then((videos) => {
        if (!active || !isSocialIdentityCurrent()) return;
        setCreatorVideos(videos);
        setCreatorVideosReady(true);
      })
      .catch(() => {
        if (!active || !isSocialIdentityCurrent()) return;
        setCreatorVideosError("Creator videos could not be loaded. Please retry.");
        setCreatorVideosReady(true);
      });

    return () => {
      active = false;
    };
  }, [canViewFullProfile, isSelfProfile, profilePrivacyReady, userId, socialRefresh, focused, isSocialIdentityCurrent]);

  useEffect(() => {
    let active = true;

    setProfileSocialFeedExtrasReady(false);
    setProfileSocialFeedNotice(null);

    if (!userId || !profilePrivacyReady || isOfficialProfile || !canViewFullProfile) {
      setProfileSocialFeedExtrasReady(!!profilePrivacyReady);
      return () => {
        active = false;
      };
    }

    const loadProfileSocialFeedExtras = async () => {
      if (isSelfProfile && currentUserId) {
        const notificationPage = await readNotificationListPage(currentUserId, 12);
        if (notificationPage.status !== "resolved" || notificationPage.subjectUserId !== currentUserId) throw new Error("Activity could not be loaded.");
        const notifications = notificationPage.items;
        if (!active || !isSocialIdentityCurrent()) return;
        setProfileSocialFeedExtras({ ...createEmptyProfileSocialFeedExtras(), notifications });
        setProfileSocialFeedExtrasReady(true);
        return;
      }

      const actorsByUserId = await readProfileSocialActorMap([userId]);

      if (!active) return;
      setProfileSocialFeedExtras({
        ...createEmptyProfileSocialFeedExtras(),
        actorsByUserId,
      });
      setProfileSocialFeedExtrasReady(true);
    };

    void loadProfileSocialFeedExtras().catch(() => {
      if (!active) return;
      setProfileSocialFeedNotice("Unable to load the full social feed right now.");
      setProfileSocialFeedExtrasReady(true);
    });

    return () => {
      active = false;
    };
  }, [
    canViewFullProfile,
    currentUserId,
    isOfficialProfile,
    isSelfProfile,
    profilePrivacyReady,
    userId,
    socialIdentity,
    socialRefresh,
    focused,
    isSocialIdentityCurrent,
  ]);

  const profilePostIdsKey = useMemo(
    () => profilePosts.map((post) => post.id).join("|"),
    [profilePosts],
  );
  const engagementReads = useRef({ scope: "", ids: new Set<string>() });

  useEffect(() => {
    let active = true;
    const scope = `${socialIdentity}:${feedPages.refreshRevision}`;
    if (engagementReads.current.scope !== scope) engagementReads.current = { scope, ids: new Set() };
    const allPostIds = profilePosts.map((post) => post.id).filter(Boolean);
    const postIds = allPostIds.filter(id => !engagementReads.current.ids.has(id));
    const revisions = new Map(postIds.map(id => [id, engagementRevisionsRef.current.get(`${socialIdentity}:${id}`) ?? 0]));

    if (!allPostIds.length) {
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

    const batches: string[][] = [];
    for (let offset = 0; offset < postIds.length; offset += 50) batches.push(postIds.slice(offset, offset + 50));
    void Promise.all(batches.map(ids => readProfilePostEngagementStates(ids).catch(() => ({}))))
    .then((pages) => {
      if (!active || !isSocialIdentityCurrent()) return;
      const states: Record<string, ProfilePostEngagementState> = Object.assign({}, ...pages);
      for (const id of Object.keys(states)) engagementReads.current.ids.add(id);
      setProfilePostUiById((current) => {
        const next = { ...current };
        postIds.forEach((postId) => {
          if (revisions.get(postId) !== (engagementRevisionsRef.current.get(`${socialIdentity}:${postId}`) ?? 0)) return;
          const state = states[postId];
          next[postId] = {
            ...(next[postId] ?? {}),
            engagement: state ?? next[postId]?.engagement,
            engagementReady: !!state,
            commentNotice: state ? next[postId]?.commentNotice : "Post counts could not be refreshed. Refresh the feed to retry.",
          };
        });
        return next;
      });
    });

    return () => {
      active = false;
    };
  }, [currentUserId, profilePostIdsKey, profilePosts, socialIdentity, isSocialIdentityCurrent, feedPages.refreshRevision]);

  const updateProfilePostUiState = (
    postId: string,
    updater: (current: ProfilePostUiState) => ProfilePostUiState,
  ) => {
    if (!isSocialIdentityCurrent()) return;
    setProfilePostUiById((current) => !isSocialIdentityCurrent() ? current : ({
      ...current,
      [postId]: updater(current[postId] ?? {}),
    }));
  };

  const attachProfilePostFile = async (scope: SocialAttachmentPickerScope) => {
    if (!isSocialIdentityCurrent()) return;
    try {
      setProfilePostsNotice(null);
      const file = await pickSocialAttachmentFile(scope);
      if (!isSocialIdentityCurrent()) return;
      if (!file) return;
      setProfilePostAttachmentFile(file);
    } catch (error) {
      if (!isSocialIdentityCurrent()) return;
      setProfilePostAttachmentFile(null);
      setProfilePostsNotice(getUserFacingErrorMessage(error, "Unable to attach that file right now."));
    }
  };

  const attachProfilePostCommentFile = async (post: ProfilePost, scope: SocialAttachmentPickerScope) => {
    if (!isSocialIdentityCurrent()) return;
    try {
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        commentNotice: null,
      }));
      const file = await pickSocialAttachmentFile(scope);
      if (!isSocialIdentityCurrent()) return;
      if (!file) return;
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        commentAttachmentFile: file,
      }));
    } catch (error) {
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        commentAttachmentFile: null,
        commentNotice: getUserFacingErrorMessage(error, "Unable to attach that file right now."),
      }));
    }
  };

  const onPickProfilePostAttachment = () => {
    setProfileAttachmentSheetTarget({ surface: "post", identity: socialIdentity });
  };

  const onPickProfilePostCommentAttachment = (post: ProfilePost) => {
    setProfileAttachmentSheetTarget({ surface: "comment", post, identity: socialIdentity });
  };

  const onSelectProfileAttachment = (scope: SocialAttachmentPickerScope) => {
    if (!isSocialIdentityCurrent()) return;
    const target = profileAttachmentSheetTarget;
    if (!target || target.identity !== socialIdentity) return;

    setProfileAttachmentSheetTarget(null);
    if (target.surface === "post") {
      void attachProfilePostFile(scope);
      return;
    }

    void attachProfilePostCommentFile(target.post, scope);
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
      scrollViewRef.current?.scrollToOffset({
        offset: Math.max(profilePostComposerYRef.current - 22, 0),
        animated: true,
      });
    }, 120);
  };

  const focusProfilePostComposer = () => {
    scrollProfilePostComposerIntoView();
    setTimeout(() => {
      profilePostInputRef.current?.focus();
    }, 180);
  };

  const refreshProfilePostEngagement = async (postId: string) => {
    const key = `${socialIdentity}:${postId}`;
    const revision = engagementRevisionsRef.current.get(key) ?? 0;
    const engagement = await readProfilePostEngagementState(postId);
    if (revision !== (engagementRevisionsRef.current.get(key) ?? 0)) return engagement;
    updateProfilePostUiState(postId, (current) => ({
      ...current,
      engagement,
      engagementReady: true,
    }));
    return engagement;
  };

  const loadProfilePostComments = async (postId: string, append = false) => {
    const key = `${socialIdentity}:comments:${postId}`;
    const revision = commentRevisionsRef.current.get(key) ?? 0;
    if (socialActionKeysRef.current.has(key)) return;
    socialActionKeysRef.current.add(key);
    updateProfilePostUiState(postId, (current) => ({
      ...current,
      commentsReady: append ? current.commentsReady : false,
      commentsLoading: true,
      commentNotice: null,
    }));
    try {
      const page = await readProfilePostCommentsPage(postId, { limit: 24, cursor: append ? profilePostUiById[postId]?.commentsCursor ?? undefined : undefined });
      if ((commentRevisionsRef.current.get(key) ?? 0) !== revision) {
        updateProfilePostUiState(postId, current => ({ ...current, commentsReady: true, commentsLoading: false, commentsHasMore: true, commentsCursor: null }));
        return;
      }
      updateProfilePostUiState(postId, (current) => ({
        ...current,
        comments: Array.from(new Map([...(append ? current.comments ?? [] : []), ...page.items].map(comment => [comment.id, comment])).values()),
        commentsCursor: page.nextCursor,
        commentsHasMore: page.hasMore,
        commentsLoading: false,
        commentsReady: true,
        commentsRefreshAvailable: append ? current.commentsRefreshAvailable : false,
      }));
    } catch {
      if ((commentRevisionsRef.current.get(key) ?? 0) !== revision) {
        updateProfilePostUiState(postId, current => ({ ...current, commentsReady: true, commentsLoading: false, commentsHasMore: true, commentsCursor: null }));
        return;
      }
      updateProfilePostUiState(postId, (current) => ({
        ...current,
        commentsLoading: false,
        commentsReady: true,
        commentNotice: "Unable to load comments right now.",
      }));
    } finally {
      socialActionKeysRef.current.delete(key);
      updateProfilePostUiState(postId, current => ({ ...current, commentsLoading: false }));
    }
  };

  const shareCreatorVideo = async (video: CreatorVideo) => {
    if (!isCreatorVideoPubliclyShareable(video)) {
      Alert.alert("Share unavailable", "Only public creator videos can be shared outside this Platform.");
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

    if (!isSelfProfile || !currentUserId) {
      setChillyCircleCount(null);
      return () => {
        active = false;
      };
    }

    readFriendListSummary({ limit: 1 })
      .then((summary) => {
        if (active) setChillyCircleCount(summary.activeCount);
      })
      .catch(() => {
        if (active) setChillyCircleCount(null);
      });

    return () => {
      active = false;
    };
  }, [currentUserId, isSelfProfile]);
  useEffect(() => {
    let active = true;

    if (isSelfProfile) {
      setViewerFollowState("self");
      return () => {
        active = false;
      };
    }

    if (!userId || isOfficialProfile) {
      setViewerFollowState("unavailable");
      return () => {
        active = false;
      };
    }

    if (!currentUserId) {
      setViewerFollowState("signed_out");
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
  const freshnessSnapshotRef = useRef({ items: feedPages.items, posts: profilePosts, head: feedPages.head, refreshRevision: feedPages.refreshRevision });
  freshnessSnapshotRef.current = { items: feedPages.items, posts: profilePosts, head: feedPages.head, refreshRevision: feedPages.refreshRevision };
  const freshnessAuthorityRef = useRef(authority); freshnessAuthorityRef.current = authority;
  const freshnessIdentityCurrentRef = useRef(isSocialIdentityCurrent); freshnessIdentityCurrentRef.current = isSocialIdentityCurrent;
  // The permit outlives focus/background effect cleanup. It owns no shared
  // engagement data and is released only when this screen's readers settle.
  const freshnessReadPendingRef = useRef(false);
  useEffect(() => {
    const subscription = AppState.addEventListener("change", next => setFeedAppActive(next === "active"));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    // Only a successful page replacement acknowledges the prompt. A failed
    // refresh leaves both the old reading position and the prompt intact.
    setFeedFreshness({ identity: socialIdentity, available: false });
  }, [socialIdentity, feedPages.refreshRevision]);
  useEffect(() => {
    if (!currentUserId || !focused || !feedAppActive || activeTab !== "home"
      || !profilePostsReady || !canViewFullProfile || isOfficialProfile) return;
    let retired = false;
    // Freeze this lifetime's predicate. Reading the ref after an account switch
    // could adopt the replacement identity before passive cleanup has run.
    const ownsIdentity = freshnessIdentityCurrentRef.current;
    const ownerKey = getNotificationActivityOwnerKey(freshnessAuthorityRef.current);
    const current = () => !retired && AppState.currentState === "active" && ownsIdentity();
    const controller = startProfileFeedFreshness({
      isCurrent: current,
      check: async (signal) => {
        if (freshnessReadPendingRef.current) return;
        freshnessReadPendingRef.current = true;
        try {
          const revision = freshnessSnapshotRef.current.refreshRevision;
          const ids = visibleFeedPostIdsRef.current.slice(0, 12);
          const revisions = new Map(ids.map(id => [id, engagementRevisionsRef.current.get(`${socialIdentity}:${id}`) ?? 0]));
          const reads = new AbortController();
          const abortReads = () => reads.abort();
          signal.addEventListener("abort", abortReads, { once: true });
          if (signal.aborted) reads.abort();
          const retireSiblings = <T,>(promise: Promise<T>) => promise.catch(error => { reads.abort(); throw error; });
          const results = await Promise.allSettled([
            // Share only canonical metadata. Visible engagement and optimistic
            // revisions belong to this screen, not to another mounted consumer.
            retireSiblings(isSelfProfile ? readSharedLiveSnapshot(ownerKey,
              JSON.stringify(["profile-feed-head", socialIdentity, revision]), reads.signal, readOwnProfileFeedHead) : Promise.resolve(null)),
            retireSiblings(ids.length ? readProfilePostEngagementStates(ids, reads.signal) : Promise.resolve({} as Record<string, ProfilePostEngagementState>)),
          ]);
          signal.removeEventListener("abort", abortReads);
          // Keep the controller's flight owned until both source readers settle,
          // even when a transport ignores the sibling's cancellation request.
          const [headResult, countsResult] = results;
          if (headResult.status === "rejected") throw headResult.reason;
          if (countsResult.status === "rejected") throw countsResult.reason;
          const head = headResult.value;
          const counts = countsResult.value;
          if (signal.aborted || !current() || revision !== freshnessSnapshotRef.current.refreshRevision) return;
          if (isSelfProfile) {
            const snapshot = freshnessSnapshotRef.current;
            const known = [
              ...snapshot.items.filter(item => item.type !== "spectator_entry").map(item => ({ id: item.id, createdAt: item.rankTime })),
              ...snapshot.posts.map(post => ({ id: `relationship-profile_post-${post.id}`, createdAt: post.createdAt })),
            ];
            setFeedFreshness(previous => signal.aborted || !current()
              || revision !== freshnessSnapshotRef.current.refreshRevision ? previous : ({
                identity: socialIdentity,
                available: (previous.identity === socialIdentity && previous.available)
                  || hasNewProfileFeedHead(head, known, snapshot.head),
                retry: previous.identity === socialIdentity && previous.retry,
              }));
          }
          setProfilePostUiById(previous => {
            if (signal.aborted || !current() || revision !== freshnessSnapshotRef.current.refreshRevision) return previous;
            const next = { ...previous };
            for (const id of ids) {
              if (!counts[id] || !next[id] || next[id].likeBusy || next[id].commentBusy || next[id].deletingCommentId
                || revisions.get(id) !== (engagementRevisionsRef.current.get(`${socialIdentity}:${id}`) ?? 0)) continue;
              // Counts update quietly. Loaded comment text, draft, attachment,
              // reply target and cursor are intentionally never replaced here.
              next[id] = { ...next[id], engagement: counts[id], engagementReady: true,
                commentsRefreshAvailable: next[id].commentsRefreshAvailable || (!!next[id].commentsOpen
                  && next[id].engagement?.commentCount !== counts[id].commentCount) };
            }
            return next;
          });
        } finally { freshnessReadPendingRef.current = false; }
      },
    });
    const unsubscribe = subscribeToNotificationActivity(ownerKey, controller.hint);
    return () => { retired = true; controller.dispose(); unsubscribe(); };
  }, [activeTab, canViewFullProfile, currentUserId, feedAppActive, focused,
    isOfficialProfile, isSelfProfile, profilePostsReady, socialIdentity]);
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
  const profileLabel = isOfficialProfile
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
    return isSelfProfile ? "@you" : "@profile";
  }, [isSelfProfile, profile.displayName, profile.handle]);
  const liveActionLabel = partyIdParam ? "Open Room" : profileLive.isLive ? "Join Live" : "View Live";
  const hasLiveRouteContext = !!partyIdParam;
  const canReportProfile = !isSelfProfile && !!userId;
  const hasLiveTabEntry = !hasLiveRouteContext && (!!liveNowEvent || !!nextUpcomingEvent || profileLive.isLive);
  const scheduledWatchPartyTitleId = String(scheduledWatchPartyEvent?.linkedTitleId ?? "").trim();
  const canOpenWatchPartyEntry = hasLiveRouteContext || !!scheduledWatchPartyTitleId;
  const liveActionTitle = hasLiveRouteContext ? liveActionLabel : "Live Events";
  const officialGuidanceTopics = officialAccount?.guidanceTopics ?? [];
  const liveStateLabel = profileLive.label;
  const routeContextLabel = isOfficialProfile ? "OFFICIAL PROFILE" : hasLiveRouteContext ? "ROOM LINKED" : "PROFILE";
  const channelHomeBody = isOfficialProfile
    ? officialAccount?.trustSummary
      ?? "Chi'llywood's official profile for updates, tips, Originals, and auditable follow-up."
    : isSelfProfile
      ? "Share updates, connect with people, and guide fans to your Platform."
      : "Read public updates, connect through Chi'lly Chat, and visit the Platform for creator videos.";
  const liveStatusTitle = isOfficialProfile
    ? "Official updates"
    : profileLive.isLive
      ? "Platform is live now"
      : profileLive.status === "offline" ? "Platform is off air" : "Checking live sessions";
  const liveStatusBody = isOfficialProfile
    ? "Rachi shares official updates and tips here. Rachi does not read your private chats."
    : hasLiveRouteContext
      ? profileLive.isLive
        ? "Live and watch-party entry both hand back into the linked room."
        : "Room context is attached, so live and watch-party entry stay pointed at the linked room."
      : hasLiveTabEntry
        ? "Use the Live tab for the current schedule and public events."
        : "No room context is attached yet, but this Platform's live posture still stays visible.";
  const openChannelSettings = (params?: { focus?: "content"; action?: "upload" }) => {
    if (!creatorSettingsEnabled) {
      Alert.alert("Platform Studio", "Creator platform controls are currently hidden by app configuration.");
      return;
    }
    if (params) {
      router.push({ pathname: "/channel-studio", params });
      return;
    }
    router.push("/channel-studio");
  };
  const onPressManageChannel = () => {
    openChannelSettings();
  };
  const onPressCreatePlatformContent = () => {
    openChannelSettings({ focus: "content", action: "upload" });
  };
  const onPressLive = () => {
    if (hasLiveRouteContext) {
      if (linkedLiveRoute) {
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
        if (isRuntimeControlBlockedAccess(access)) {
          const blockedCopy = getRuntimeControlBlockedCopy(access);
          setWatchPartyPremiumGate(null);
          setWatchPartyPremiumSheetVisible(false);
          Alert.alert(blockedCopy.title, blockedCopy.message);
          trackEvent("runtime_control_blocked", {
            surface: "profile-watch-party-live",
            controlKey: access?.runtimeControlKey ?? "watch_party_live_enabled",
            roomId: partyIdParam || "linked-room",
          });
          return;
        }
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
      if (isRuntimeControlBlockedAccess(access)) {
        const blockedCopy = getRuntimeControlBlockedCopy(access);
        setWatchPartyPremiumGate(null);
        setWatchPartyPremiumSheetVisible(false);
        Alert.alert(blockedCopy.title, blockedCopy.message);
        trackEvent("runtime_control_blocked", {
          surface: "profile-watch-party-live",
          controlKey: access?.runtimeControlKey ?? "watch_party_live_enabled",
          titleId: scheduledWatchPartyTitleId,
        });
        return;
      }
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
      Alert.alert("Chi'lly Chat", "This Profile is missing the identity needed to open a direct thread.");
      return;
    }

    if (isOfficialProfile) {
      trackEvent("communication_profile_entry_blocked", {
        entryPath: "profile",
        profileIsSelf: "false",
        reason: "official_account_chilly_circle_only",
        targetUserId: userId,
        entryMode,
      });
      Alert.alert(
        "Rachi is in Chi'lly Circle",
        "Rachi is your first official Chi'lly Circle connection. Chi'lly Chat is for direct threads with people.",
      );
      return;
    }

    if (!appConfig.runtimeControls.chat_enabled) {
      trackEvent("communication_profile_entry_blocked", {
        entryPath: "profile",
        profileIsSelf: "false",
        reason: "chat_paused",
        targetUserId: userId,
        entryMode,
      });
      Alert.alert(
        "Chi'lly Chat is paused",
        "Chi'lly Chat is temporarily paused. You can still view this Profile.",
      );
      return;
    }

    if (friendState?.availability === "blocked") {
      trackEvent("communication_profile_entry_blocked", {
        entryPath: "profile",
        profileIsSelf: "false",
        reason: "blocked_relationship",
        targetUserId: userId,
        entryMode,
      });
      Alert.alert(
        "Chi'lly Chat",
        "Messaging is unavailable while a Platform audience block exists between these accounts.",
      );
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
        avatarUrl: visibleProfileAvatarUrl,
        tagline: profile.tagline,
      });

      const trustedUiIntent = entryMode === "voice" || entryMode === "video"
        ? createForegroundAuthenticatedUiCallIntent({
          action: entryMode === "video" ? "start_video" : "start_voice",
          authenticated: !!currentUserId,
          authenticatedUserId: currentUserId,
          threadId: thread.threadId,
        })
        : null;
      if (entryMode !== "message" && (trustedUiIntent?.status !== "created" || !trustedUiIntent.claimId)) {
        Alert.alert("Unable to start call", "Open the chat thread and use its Voice or Video control.");
      }

      router.push({
        pathname: "/chat/[threadId]",
        params: {
          threadId: thread.threadId,
          ...(trustedUiIntent?.status === "created" && trustedUiIntent.claimId
            ? {foregroundCallClaim: trustedUiIntent.claimId, startCall: entryMode}
            : {}),
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
          ? "Sign in to open Chi'lly Chat from public Profiles."
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
    setProfileMediaReportTarget(null);
    setReportVisible(true);
  };
  const onPressReportProfileMedia = (kind: ProfileMediaKind) => {
    if (!canReportProfile) return;
    if (!currentUserId) {
      Alert.alert("Report Profile media", "Sign in to send a safety report.");
      return;
    }
    trackModerationActionUsed({
      surface: "profile",
      action: "open_safety_report",
      targetType: "profile_media",
      targetId: userId,
      sourceRoute: `/profile/${userId}`,
      targetAuditOwnerKey: profile.auditOwnerKey ?? null,
      platformOwnedTarget: isOfficialProfile,
    });
    setProfilePostReportTarget(null);
    setProfilePostCommentReportTarget(null);
    setProfileMediaReportTarget(kind);
    setReportVisible(true);
  };
  const onPressViewChannel = () => {
    if (!userId) return;
    router.push({
      pathname: "/channel/[userId]",
      params: { userId },
    });
  };
  const onPressPreviewPlatform = () => {
    if (!userId) return;
    router.push({
      pathname: "/channel/[userId]",
      params: { userId, preview: "public" },
    });
  };
  const onPressSettings = () => {
    router.push("/settings");
  };
  const onPressChillyCircleManage = () => {
    router.push("/chilly-circle" as Parameters<typeof router.push>[0]);
  };
  const onPressProfileAvatar = () => {
    if (isSelfProfile) {
      setProfilePhotoSheetVisible(true);
      return;
    }
    setProfileActionsSheetVisible(true);
  };
  const onViewProfileImage = (kind: ProfileMediaKind) => {
    const imageUrl = kind === "avatar" ? visibleProfileAvatarUrl : visibleProfileBackgroundUrl;
    if (!imageUrl) {
      Alert.alert(
        kind === "avatar" ? "Profile Photo" : "Profile Background",
        kind === "avatar" ? "No Profile photo is available yet." : "No Profile background is available yet.",
      );
      return;
    }

    setProfileImagePreview({
      title: kind === "avatar" ? "Profile Photo" : "Profile Background",
      imageUrl,
      fitMode: kind === "avatar" ? profile.profileAvatarFitMode : profile.profileBackgroundFitMode,
    });
  };
  const onChooseProfileMedia = async (kind: ProfileMediaKind) => {
    if (!isSelfProfile) {
      Alert.alert("Profile Appearance", "Only the Profile owner can change this image.");
      return;
    }
    if (profileAppearanceBusy) return;

    if (kind === "avatar") setProfilePhotoSheetVisible(false);
    if (kind === "background") setProfileBackgroundSheetVisible(false);
    try {
      const file = await pickProfileMediaImage(kind);
      if (!file) return;
      setProfileMediaReview({
        kind,
        file,
        fitMode: kind === "avatar" ? profile.profileAvatarFitMode : profile.profileBackgroundFitMode,
      });
    } catch (error) {
      Alert.alert(
        "Profile Appearance",
        getUserFacingErrorMessage(error, "Unable to choose a Profile image right now."),
      );
    }
  };
  const onSaveProfileMediaReview = async () => {
    if (!isSelfProfile || !profileMediaReview || profileAppearanceBusy) return;

    setProfileAppearanceBusy(profileMediaReview.kind);
    try {
      const nextProfile = await uploadProfileMedia(profileMediaReview.kind, profileMediaReview.file, {
        fitMode: profileMediaReview.fitMode,
      });
      setChannelAccessProfile(nextProfile);
      setProfileMediaReview(null);
      Alert.alert("Profile Appearance", profileMediaReview.kind === "avatar" ? "Profile photo updated." : "Profile background updated.");
    } catch (error) {
      Alert.alert(
        "Profile Appearance",
        getUserFacingErrorMessage(error, "Unable to update Profile appearance right now."),
      );
    } finally {
      setProfileAppearanceBusy(null);
    }
  };
  const onRemoveProfileMedia = (kind: ProfileMediaKind) => {
    if (!isSelfProfile) {
      Alert.alert("Profile Appearance", "Only the Profile owner can remove this image.");
      return;
    }
    const imageUrl = kind === "avatar" ? visibleProfileAvatarUrl : visibleProfileBackgroundUrl;
    if (!imageUrl || profileAppearanceBusy) return;

    if (kind === "avatar") setProfilePhotoSheetVisible(false);
    if (kind === "background") setProfileBackgroundSheetVisible(false);
    Alert.alert(
      kind === "avatar" ? "Remove Profile photo?" : "Remove Profile background?",
      kind === "avatar"
        ? "Your Profile will return to the default avatar."
        : "Your Profile will return to the default background.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: kind === "avatar" ? "Remove Photo" : "Remove Background",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setProfileAppearanceBusy(kind);
              try {
                const nextProfile = await removeProfileMedia(kind);
                setChannelAccessProfile(nextProfile);
                Alert.alert("Profile Appearance", kind === "avatar" ? "Profile photo removed." : "Profile background removed.");
              } catch (error) {
                Alert.alert(
                  "Profile Appearance",
                  getUserFacingErrorMessage(error, "Unable to remove this Profile image right now."),
                );
              } finally {
                setProfileAppearanceBusy(null);
              }
            })();
          },
        },
      ],
    );
  };
  const onSelectProfileMediaFitMode = async (kind: ProfileMediaKind, fitMode: ProfileAppearanceFitMode) => {
    if (!isSelfProfile || profileAppearanceBusy) return;
    const currentFitMode = kind === "avatar" ? profile.profileAvatarFitMode : profile.profileBackgroundFitMode;
    if (currentFitMode === fitMode) return;

    setProfileAppearanceBusy(kind);
    try {
      const nextProfile = await updateProfileMediaFitMode(kind, fitMode);
      setChannelAccessProfile(nextProfile);
    } catch (error) {
      Alert.alert(
        "Profile Appearance",
        getUserFacingErrorMessage(error, "Unable to update this image fit right now."),
      );
    } finally {
      setProfileAppearanceBusy(null);
    }
  };
  const onPressProfileActionsChat = () => {
    setProfileActionsSheetVisible(false);
    void onPressCommunication("message");
  };
  const onPressProfileActionsReport = () => {
    setProfileActionsSheetVisible(false);
    if (!currentUserId) {
      Alert.alert("Report User", "Sign in to send a safety report.");
      return;
    }
    onPressReportProfile();
  };
  const onPressProfileActionsReportPhoto = () => {
    setProfileActionsSheetVisible(false);
    onPressReportProfileMedia("avatar");
  };
  const onPressProfileActionsReportBackground = () => {
    setProfileActionsSheetVisible(false);
    onPressReportProfileMedia("background");
  };
  const onPressProfileActionsShare = () => {
    setProfileActionsSheetVisible(false);
    void onShareProfile();
  };
  const onPressProfileActionsPlatform = () => {
    setProfileActionsSheetVisible(false);
    if (!userId) {
      Alert.alert("View Platform", "This Profile is missing the identity needed to open a Platform.");
      return;
    }
    onPressViewChannel();
  };
  const onPressProfileActionsBlock = () => {
    if (profileBlockBusy) return;
    setProfileActionsSheetVisible(false);

    if (!currentUserId) {
      Alert.alert("Block User", "Sign in to block this user.");
      return;
    }
    if (!userId || userId === currentUserId || isSelfProfile) {
      Alert.alert("Block User", "You cannot block your own Profile.");
      return;
    }

    Alert.alert(
      "Block this user?",
      "They won't be able to message you or interact with you where blocking is supported.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Block User",
          style: "destructive",
          onPress: () => {
            void (async () => {
              setProfileBlockBusy(true);
              try {
                const result = await blockChannelAudienceMember({
                  channelUserId: currentUserId,
                  blockedUserId: userId,
                  reason: "profile_actions_sheet",
                });
                if (result.status !== "completed" && result.status !== "noop") {
                  Alert.alert("Block User", result.message || "Unable to block this user right now.");
                  return;
                }

                await profileAudience.refreshProfileAudience();
                Alert.alert("Block User", "User blocked.");
              } catch (error) {
                Alert.alert(
                  "Block User",
                  getUserFacingErrorMessage(error, "Unable to block this user right now."),
                );
              } finally {
                setProfileBlockBusy(false);
              }
            })();
          },
        },
      ],
    );
  };
  const normalizeChillyCircleActionError = (error: unknown) => {
    const message = getUserFacingErrorMessage(error, "Unable to update Chi'lly Circle right now.");
    if (message.toLowerCase().includes("audience block")) return CHILLY_CIRCLE_BLOCKED_COPY;
    return message
      .replace(/friendship/gi, "Chi'lly Circle")
      .replace(/friends/gi, "Chi'lly Circle")
      .replace(/friend/gi, "Chi'lly Circle");
  };
  const onPressChillyCircleAction = async (action: "request" | "accept" | "decline" | "cancel" | "remove") => {
    if (!userId || isSelfProfile || isOfficialProfile || chillyCircleActionBusy) return;

    if (!currentUserId || friendState?.availability === "signed_out") {
      Alert.alert("Chi'lly Circle", "Sign in to send or manage Chi'lly Circle requests.");
      return;
    }
    if (friendState?.availability === "blocked") {
      Alert.alert("Chi'lly Circle unavailable", CHILLY_CIRCLE_BLOCKED_COPY);
      return;
    }

    try {
      const nextState = await profileAudience.performCircleAction(action);
      if (!nextState) return;
      if (action === "request" && nextState.isFriend) {
        Alert.alert("Chi'lly Circle", "Added to your Chi'lly Circle.");
      } else if (action === "request" && nextState.status === "pending") {
        Alert.alert("Chi'lly Circle", "Request sent. This profile approves Chi'lly Circle adds first.");
      }
    } catch (error) {
      Alert.alert("Chi'lly Circle", normalizeChillyCircleActionError(error));
    }
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
        message: `Check out this Chi'llywood post: ${buildProfileDeepLink(post.userId)}?postId=${encodeURIComponent(post.id)}`,
      });
    } catch {
      Alert.alert("Share unavailable", "Unable to open the share sheet right now.");
    }
  };
  const onToggleFollowChannel = async () => {
    if (!userId || isSelfProfile || isOfficialProfile || !followActionLatchRef.current.tryAcquire()) return;

    if (viewerFollowState === "signed_out") {
      followActionLatchRef.current.release();
      Alert.alert("Follow Platform", "Sign in to follow this creator Platform.");
      return;
    }

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
        Alert.alert("Follow Platform", "Sign in to follow this creator Platform.");
        return;
      }

      Alert.alert("Follow Platform", result.message);
    } catch {
      Alert.alert("Follow Platform", "Unable to update this follow relationship right now.");
    } finally {
      followActionLatchRef.current.release();
      setFollowActionBusy(false);
    }
  };
  const onSubmitProfilePost = async () => {
    if (!isSocialIdentityCurrent()) return;
    const key = `${socialIdentity}:post-submit`;
    if (!isSelfProfile || profilePostBusy || socialActionKeysRef.current.has(key)) return;

    const body = profilePostDraft.trim();
    if (!body) {
      setProfilePostsNotice("Write an update before posting.");
      return;
    }
    if (body.length > PROFILE_POST_BODY_LIMIT) {
      setProfilePostsNotice(`Profile updates can be ${PROFILE_POST_BODY_LIMIT} characters or fewer.`);
      return;
    }
    if (!appConfig.runtimeControls.profile_posting_enabled) {
      setProfilePostsNotice("Profile posting is temporarily paused. You can still read existing posts.");
      return;
    }
    if (profilePostAttachmentFile && !appConfig.runtimeControls.attachments_enabled) {
      setProfilePostsNotice("Attachments are temporarily paused. You can still post without an attachment.");
      return;
    }

    socialActionKeysRef.current.add(key);
    try {
      setProfilePostBusy(true);
      setProfilePostsNotice(null);
      const post = await createProfilePost({
        expectedUserId: currentUserId,
        body,
        attachmentFile: profilePostAttachmentFile,
      });
      if (!isSocialIdentityCurrent()) return;
      setProfilePosts((current) => [post, ...current.filter((entry) => entry.id !== post.id)]);
      setProfilePostUiById((current) => !isSocialIdentityCurrent() ? current : ({
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
      // This explicit publish action also catches up the canonical feed. Without
      // it a newly added local post could mask an unseen older head in probes.
      // The page hook preserves the acknowledged post on failure and rejects
      // retired identity/mutation responses; do not scroll or clear other drafts.
      void feedPages.refresh().then(success => {
        if (!success && isSocialIdentityCurrent()) setFeedFreshness({ identity: socialIdentity, available: true, retry: true });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setProfilePostsNotice(message === SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE
        ? SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE
        : getUserFacingErrorMessage(error, "Unable to post this update right now."));
    } finally {
      socialActionKeysRef.current.delete(key);
      if (isSocialIdentityCurrent()) setProfilePostBusy(false);
    }
  };
  const onDeleteProfilePost = (post: ProfilePost) => {
    if (!isSocialIdentityCurrent()) return;
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
              if (!isSocialIdentityCurrent()) return;
              try {
                setProfilePostDeletingId(post.id);
                setProfilePostsNotice(null);
                await deleteProfilePost(post.id, currentUserId);
                if (!isSocialIdentityCurrent()) return;
                setProfilePosts((current) => current.filter((entry) => entry.id !== post.id));
                setProfilePostUiById((current) => {
                  const next = { ...current };
                  delete next[post.id];
                  return next;
                });
              } catch {
                setProfilePostsNotice("Unable to delete this update right now.");
              } finally {
                if (isSocialIdentityCurrent()) setProfilePostDeletingId(null);
              }
            })();
          },
        },
      ],
    );
  };
  const onToggleProfilePostLike = async (post: ProfilePost) => {
    if (!isSocialIdentityCurrent()) return;
    const key = `${socialIdentity}:like:${post.id}`;
    if (socialActionKeysRef.current.has(key)) return;
    if (!currentUserId) {
      Alert.alert("Like post", "Sign in to like this post.");
      return;
    }
    if (!isProfilePostEngageable(post)) {
      Alert.alert("Like unavailable", "This post cannot receive likes right now.");
      return;
    }

    const currentState = profilePostUiById[post.id];
    if (!currentState?.engagementReady || !currentState.engagement) {
      updateProfilePostUiState(post.id, current => ({ ...current, commentNotice: "Post counts are unavailable. Refresh the feed before changing your like." }));
      return;
    }
    const nextLiked = !(currentState?.engagement?.likedByViewer ?? false);
    socialActionKeysRef.current.add(key);
    updateProfilePostUiState(post.id, (current) => ({
      ...current,
      likeBusy: true,
      commentNotice: null,
    }));

    try {
      const engagement = await setProfilePostLike(post.id, nextLiked, currentUserId);
      const engagementKey = `${socialIdentity}:${post.id}`;
      engagementRevisionsRef.current.set(engagementKey, (engagementRevisionsRef.current.get(engagementKey) ?? 0) + 1);
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
      socialActionKeysRef.current.delete(key);
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
    if (!isSocialIdentityCurrent()) return;
    const key = `${socialIdentity}:comment-submit:${post.id}`;
    if (socialActionKeysRef.current.has(key)) return;
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
    if (!appConfig.runtimeControls.comments_enabled) {
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        commentNotice: "Comments are temporarily paused. You can still read existing comments.",
      }));
      return;
    }
    if (uiState.commentAttachmentFile && !appConfig.runtimeControls.attachments_enabled) {
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        commentNotice: "Attachments are temporarily paused. You can still comment without an attachment.",
      }));
      return;
    }

    socialActionKeysRef.current.add(key);
    updateProfilePostUiState(post.id, (current) => ({
      ...current,
      commentBusy: true,
      commentNotice: null,
    }));
    try {
      const replyTarget = (uiState.comments ?? []).find((comment) => comment.id === uiState.replyTargetCommentId) ?? null;
      const parentCommentId = replyTarget?.parentCommentId || replyTarget?.id || null;
      const comment = await createProfilePostComment({
        expectedUserId: currentUserId,
        postId: post.id,
        body,
        parentCommentId,
        attachmentFile: uiState.commentAttachmentFile,
      });
      if (!isSocialIdentityCurrent()) return;
      const readKey = `${socialIdentity}:comments:${post.id}`;
      commentRevisionsRef.current.set(readKey, (commentRevisionsRef.current.get(readKey) ?? 0) + 1);
      const engagementKey = `${socialIdentity}:${post.id}`;
      engagementRevisionsRef.current.set(engagementKey, (engagementRevisionsRef.current.get(engagementKey) ?? 0) + 1);
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        comments: [...(current.comments ?? []), comment],
        commentsReady: true,
        commentsOpen: true,
        commentDraft: "",
        commentAttachmentFile: null,
        replyTargetCommentId: null,
      }));
      await refreshProfilePostEngagement(post.id).catch(() => {
        updateProfilePostUiState(post.id, current => ({ ...current, commentNotice: "Comment posted. Counts could not be refreshed yet." }));
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        commentNotice: message === SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE
          ? SOCIAL_ATTACHMENT_TOO_LARGE_MESSAGE
          : getUserFacingErrorMessage(error, "Unable to post this comment right now."),
      }));
    } finally {
      socialActionKeysRef.current.delete(key);
      updateProfilePostUiState(post.id, (current) => ({
        ...current,
        commentBusy: false,
      }));
    }
  };
  const onDeleteProfilePostCommentPress = (post: ProfilePost, comment: ProfilePostComment) => {
    if (!isSocialIdentityCurrent()) return;
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
              if (!isSocialIdentityCurrent()) return;
              updateProfilePostUiState(post.id, (current) => ({
                ...current,
                deletingCommentId: comment.id,
                commentNotice: null,
              }));
              try {
                await deleteProfilePostComment(comment.id, currentUserId);
                if (!isSocialIdentityCurrent()) return;
                const readKey = `${socialIdentity}:comments:${post.id}`;
                commentRevisionsRef.current.set(readKey, (commentRevisionsRef.current.get(readKey) ?? 0) + 1);
                const engagementKey = `${socialIdentity}:${post.id}`;
                engagementRevisionsRef.current.set(engagementKey, (engagementRevisionsRef.current.get(engagementKey) ?? 0) + 1);
                updateProfilePostUiState(post.id, (current) => ({
                  ...current,
                  comments: (current.comments ?? []).filter((entry) => (
                    entry.id !== comment.id && entry.parentCommentId !== comment.id
                  )),
                  replyTargetCommentId: current.replyTargetCommentId === comment.id
                    ? null
                    : current.replyTargetCommentId,
                }));
                await refreshProfilePostEngagement(post.id).catch(() => {
                  updateProfilePostUiState(post.id, current => ({ ...current, commentNotice: "Comment deleted. Counts could not be refreshed yet." }));
                });
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
    if (post.userId === currentUserId || !post.id) return;
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
    setProfileMediaReportTarget(null);
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
    setProfileMediaReportTarget(null);
    setReportVisible(true);
  };
  const onSubmitProfileReport = async (input: { category: Parameters<typeof submitSafetyReport>[0]["category"]; note: string }) => {
    if (!isSocialIdentityCurrent()) return;
    const commentTarget = profilePostCommentReportTarget;
    const postTarget = profilePostReportTarget;
    const mediaTarget = profileMediaReportTarget;
    if (!canReportProfile && !postTarget && !commentTarget && !mediaTarget) return;
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
      } else if (mediaTarget) {
        const mediaLabel = mediaTarget === "avatar" ? "Profile photo" : "Profile background";
        const mediaStatus = mediaTarget === "avatar"
          ? profile.profileAvatarMediaStatus
          : profile.profileBackgroundMediaStatus;
        await submitSafetyReport({
          targetType: "profile_media",
          targetId: userId,
          category: input.category,
          note: input.note,
          context: buildSafetyReportContext({
            sourceSurface: "profile",
            sourceRoute: `/profile/${userId}`,
            targetLabel: `${profile.displayName} ${mediaLabel.toLowerCase()}`,
            targetRoleLabel: mediaLabel,
            targetAuditOwnerKey: profile.auditOwnerKey ?? null,
            platformOwnedTarget: isOfficialProfile,
            context: {
              profileUserId: userId,
              profileMediaKind: mediaTarget,
              profileMediaStatus: mediaStatus,
              profileMediaPublicState: isProfileMediaActive(mediaStatus) ? "active" : "hidden",
            },
          }),
        });
        setProfileMediaReportTarget(null);
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
    && (
      viewerFollowState === "following"
      || viewerFollowState === "not_following"
      || viewerFollowState === "signed_out"
      || viewerFollowState === "loading"
    );
  const followActionLabel = followActionBusy || viewerFollowState === "loading"
    ? "Checking"
    : viewerFollowState === "following"
      ? "Following"
      : "Follow";
  const renderChillyCircleActions = () => {
    if (isSelfProfile || isOfficialProfile) return null;

    const actionDisabled = chillyCircleLoading || chillyCircleActionBusy !== null;
    if (chillyCircleLoading) {
      return (
        <View style={[styles.actionChip, styles.actionChipPlaceholder]}>
          <Text style={[styles.actionChipText, styles.actionChipTextPlaceholder]}>Checking</Text>
        </View>
      );
    }

    if (profileAudience.friendError) {
      return (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry Chi'lly Circle status"
          style={[styles.actionChip, styles.actionChipPlaceholder]}
          onPress={() => { void profileAudience.refreshProfileAudience(); }}>
          <Text style={[styles.actionChipText, styles.actionChipTextPlaceholder]}>Circle unavailable · Try again</Text>
        </TouchableOpacity>
      );
    }

    if (friendState?.availability === "blocked") {
      return (
        <TouchableOpacity
          style={[styles.actionChip, styles.actionChipPlaceholder]}
          activeOpacity={0.82}
          onPress={() => Alert.alert("Chi'lly Circle unavailable", CHILLY_CIRCLE_BLOCKED_COPY)}
        >
          <Text style={[styles.actionChipText, styles.actionChipTextPlaceholder]}>Circle unavailable</Text>
        </TouchableOpacity>
      );
    }

    if (!friendState || friendState.canRequest || friendState.availability === "signed_out") {
      return (
        <TouchableOpacity
          style={[styles.actionChip, styles.actionChipConnected, actionDisabled && styles.actionChipPlaceholder]}
          activeOpacity={0.82}
          disabled={actionDisabled}
          onPress={() => {
            void onPressChillyCircleAction("request");
          }}
        >
          <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>
            {chillyCircleActionBusy === "request" ? "Requesting" : "Add to Chi'lly Circle"}
          </Text>
        </TouchableOpacity>
      );
    }

    if (friendState.canAccept || friendState.canDecline) {
      return (
        <>
          {friendState.canAccept ? (
            <TouchableOpacity
              style={[styles.actionChip, styles.actionChipConnected, actionDisabled && styles.actionChipPlaceholder]}
              activeOpacity={0.82}
              disabled={actionDisabled}
              onPress={() => {
                void onPressChillyCircleAction("accept");
              }}
            >
              <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>
                {chillyCircleActionBusy === "accept" ? "Accepting" : "Accept"}
              </Text>
            </TouchableOpacity>
          ) : null}
          {friendState.canDecline ? (
            <TouchableOpacity
              style={[styles.actionChip, styles.actionChipReport, actionDisabled && styles.actionChipPlaceholder]}
              activeOpacity={0.82}
              disabled={actionDisabled}
              onPress={() => {
                void onPressChillyCircleAction("decline");
              }}
            >
              <Text style={[styles.actionChipText, styles.actionChipTextReport]}>
                {chillyCircleActionBusy === "decline" ? "Declining" : "Decline"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </>
      );
    }

    if (friendState.canCancel) {
      return (
        <>
          <View style={[styles.actionChip, styles.actionChipPlaceholder]}>
            <Text style={[styles.actionChipText, styles.actionChipTextPlaceholder]}>Requested</Text>
          </View>
          <TouchableOpacity
            style={[styles.actionChip, styles.actionChipReport, actionDisabled && styles.actionChipPlaceholder]}
            activeOpacity={0.82}
            disabled={actionDisabled}
            onPress={() => {
              void onPressChillyCircleAction("cancel");
            }}
          >
            <Text style={[styles.actionChipText, styles.actionChipTextReport]}>
              {chillyCircleActionBusy === "cancel" ? "Canceling" : "Cancel Request"}
            </Text>
          </TouchableOpacity>
        </>
      );
    }

    if (friendState.canRemove || friendState.isFriend) {
      return (
        <>
          <View style={[styles.actionChip, styles.actionChipConnected]}>
            <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>{"In Chi'lly Circle"}</Text>
          </View>
          {friendState.canRemove ? (
            <TouchableOpacity
              style={[styles.actionChip, styles.actionChipReport, actionDisabled && styles.actionChipPlaceholder]}
              activeOpacity={0.82}
              disabled={actionDisabled}
              onPress={() => {
                void onPressChillyCircleAction("remove");
              }}
            >
              <Text style={[styles.actionChipText, styles.actionChipTextReport]}>
                {chillyCircleActionBusy === "remove" ? "Removing" : "Remove from Chi'lly Circle"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </>
      );
    }

    return null;
  };
  const currentPublicEvents = publicEvents.filter((event) => (
    event.isLiveNow || event.isUpcoming || event.replay.isReplayAvailableNow
  ));
  const publicEventCount = currentPublicEvents.length;
  const liveEventCount = publicEvents.filter((event) => event.isLiveNow).length;
  const channelSignals = [
    {
      label: isOfficialProfile ? "Identity" : "Posts",
      value: isOfficialProfile
        ? "Official"
        : profilePostsReady ? String(profilePosts.length) : "...",
      body: isOfficialProfile
        ? "official platform identity"
        : "text updates on this Profile",
      tone: isOfficialProfile ? "official" : "default",
    },
    {
      label: isOfficialProfile ? "Help" : "Platform",
      value: isOfficialProfile
        ? "Opt-in"
        : creatorVideosReady ? String(publicCreatorVideoCount) : "...",
      body: isOfficialProfile
        ? "only opens when you choose"
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
        kicker: "PLATFORM FLOW",
        title: "Official updates start here",
        body: "Use Rachi Profile for updates and Originals. Rachi stays pinned first in Chi'lly Circle.",
      }
    : isSelfProfile
      ? {
          kicker: "PLATFORM",
          title: "Your creator content lives in Platform",
          body: creatorVideosReady
            ? hasCreatorVideoTruth
              ? "Your creator videos, live moments, and creator events live here."
              : "Create your first video in Platform Studio when you are ready for this Platform to become watchable."
            : "Loading your creator-video library."
        }
      : {
          kicker: "PLATFORM",
          title: "Creator videos live here",
          body: hasLiveRouteContext
            ? "This visit carries real room context, so live and watch-party handoff stays clean from here."
            : "Creator videos, live moments, and events live here while personal updates stay in Posts."
        };
  const contentHomeBody = isSelfProfile
    ? creatorVideosReady
      ? hasCreatorVideoTruth
        ? "Your creator videos, live moments, and creator events live here."
        : "Create your first video in Platform Studio when you are ready to make this Platform watchable."
      : "Loading your Platform library."
    : isOfficialProfile
      ? "Official updates stay here, and published Chi'llywood Originals also appear in Home when public-safe."
    : creatorVideosReady
      ? hasCreatorVideoTruth
        ? `${publicCreatorVideoCount} creator video${publicCreatorVideoCount === 1 ? "" : "s"} already give this Platform a real library.`
        : "This Platform is getting ready."
      : "Loading this Platform's creator videos.";
  const contentCreatorVideosBody = isSelfProfile
    ? creatorVideosReady
      ? hasCreatorVideoTruth
        ? "Your creator videos, live moments, and creator events live here. Public videos appear for visitors while drafts stay owner-only."
        : "Create your first creator video in Platform Studio when you are ready to make the Platform watchable."
      : "Loading your creator-video library."
    : isOfficialProfile
      ? "Published public-safe Rachi uploads can appear here and in Home under Chi'llywood Originals."
      : creatorVideosReady && hasCreatorVideoTruth
        ? `${publicCreatorVideoCount} creator video${publicCreatorVideoCount === 1 ? "" : "s"} are ready to watch.`
        : "This Platform is getting ready.";
  const contentCreatorEventsBody = isOfficialProfile
    ? "Official programming stays public-safe and managed by Chi'llywood."
    : publicEventsReady
      ? publicEventCount
        ? `${publicEventCount} current public event${publicEventCount === 1 ? "" : "s"} ${publicEventCount === 1 ? "is" : "are"} live, upcoming, or replay-ready.`
        : "No public creator live or watch-party events are scheduled right now."
      : "Loading this Platform's creator events.";
  const communityActions = isSelfProfile
    ? [
        { label: "Chi'lly Chat", onPress: () => { void onPressCommunication("message"); } },
      ]
    : isOfficialProfile
      ? [
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
      ? "Share updates, connect with people, and guide fans to your Platform."
      : "Start here for personal updates, public identity, and the next creator or chat move.";
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
      accent: profileLive.isLive ? "live" : "default",
    },
    content: {
      title: isSelfProfile ? "Your Platform" : "Platform",
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
          title: "Official Platform",
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
          kicker: isSelfProfile ? "YOUR PLATFORM" : "PUBLIC PLATFORM",
          body: contentCreatorVideosBody,
        },
        {
          title: "Creator Events",
          kicker: "LIVE / WATCH-PARTY",
          body: contentCreatorEventsBody,
        },
      ];
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
      title: profileLive.isLive ? "Live Now" : "Live",
      kicker: "LIVE",
      body: profileLive.isLive
        ? `${profileLive.items[0].title || "A live session"} is live now. Open a live session below.`
        : profileLive.status === "offline" ? "No public live session right now."
          : profileLive.status === "error" ? "Live sessions could not be checked. Try again below."
            : "Checking current live sessions.",
      accent: profileLive.isLive ? "live" : "default",
    },
    {
      title: "Upcoming",
      kicker: "SCHEDULE",
      body: nextUpcomingEvent
        ? `${nextUpcomingEvent.eventTitle} starts ${formatEventDate(nextUpcomingEvent.startsAt)}.`
        : "No upcoming public events are scheduled.",
    },
    {
      title: "Replays",
      kicker: "WATCH LATER",
      body: replayReadyEvents.length
        ? `${replayReadyEvents.length} replay${replayReadyEvents.length === 1 ? " is" : "s are"} available now.`
        : "No event replays are available right now.",
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Retained Profile source contract; the current render path intentionally does not call it.
  const audiencePostureBody = useMemo(() => {
    if (isOfficialProfile) return "";

    const publicActivityVisibility = channelAccessProfile?.publicActivityVisibility;
    const followerSurfaceEnabled = channelAccessProfile?.followerSurfaceEnabled;
    const subscriberSurfaceEnabled = channelAccessProfile?.subscriberSurfaceEnabled;
    const postureLead = publicActivityVisibility === "followers_only"
      ? "Community activity stays follower-led on this Platform."
      : publicActivityVisibility === "subscribers_only"
        ? "Community activity stays subscriber-led on this Platform."
        : publicActivityVisibility === "private"
          ? "Community activity stays quiet on the public route for now."
          : "Community activity can stay open on this Platform.";
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
    {
      title: "Connections",
      kicker: "COMMUNITY",
      body: isSelfProfile
        ? "Your public community stays here while direct conversations live in Chi'lly Chat and closer connections live in Chi'lly Circle."
        : isOfficialProfile
          ? "Official updates stay public while direct private conversations remain separate."
          : "Follow public activity here, use Chi'lly Chat for direct conversation, and Chi'lly Circle for approved closer connections.",
    },
    ...publicAudienceVisibilitySections,
  ];
  const aboutTabSections: readonly ProfileSurfaceCard[] = isOfficialProfile
    ? [
        {
          title: "Official Identity",
          kicker: "CHI'LLYWOOD OFFICIAL",
          body: officialAccount?.conciergeHeadline
            ? `${officialAccount.conciergeHeadline} ${profile.displayName} is Chi'llywood's verified public account.`
            : `${profile.displayName} is Chi'llywood's verified public account.`,
          accent: "official",
        },
      ]
    : [
        {
          title: `About ${profile.displayName}`,
          kicker: "ABOUT",
          body: profile.tagline?.trim()
            || (isSelfProfile ? "Add a short bio so people know who you are and what you share." : "No bio has been added yet."),
        },
        {
          title: "At a glance",
          kicker: "PROFILE",
          body: [profile.handle ? `@${profile.handle.replace(/^@/, "")}` : null, roleLabel].filter(Boolean).join(" · "),
        },
      ];

  const onSaveAbout = async () => {
    if (!isSocialIdentityCurrent()) return;
    const key = `${socialIdentity}:about-save`;
    if (!isSelfProfile || !channelAccessProfile || aboutBusy || socialActionKeysRef.current.has(key)) return;
    socialActionKeysRef.current.add(key);
    const binding = authority;
    const stillCurrent = isSocialIdentityCurrent;
    const normalizedAbout = aboutDraft.trim().slice(0, 160);
    setAboutBusy(true);
    setAboutNotice(null);
    try {
      const savedProfile = await saveUserProfileAbout(normalizedAbout, userId, binding ?? undefined);
      if (!stillCurrent()) return;
      setChannelAccessProfile(savedProfile);
      setAboutDraft(normalizedAbout);
      setAboutNotice(normalizedAbout ? "About updated." : "About cleared.");
    } catch {
      if (stillCurrent()) setAboutNotice("Unable to update About right now. Your changes are ready to retry.");
    } finally {
      socialActionKeysRef.current.delete(key);
      if (stillCurrent()) setAboutBusy(false);
    }
  };
  const activeTabSections = activeTab === "home"
    ? homeSections
    : activeTab === "content"
      ? contentTabSections
      : activeTab === "live"
        ? liveTabSections
        : activeTab === "community"
          ? communityTabSections
          : aboutTabSections;
  const profileSocialFeedActor = useMemo<ProfileSocialFeedActor | null>(() => {
    if (!userId) return null;
    return buildProfileSocialActor(userId, {
      avatarUrl: profile.avatarUrl,
      displayName: profile.displayName,
      handle: profile.handle,
    });
  }, [profile.avatarUrl, profile.displayName, profile.handle, userId]);
  const profileSocialFeedMode: ProfileSocialFeedMode = isSelfProfile
    ? "own_profile_social_feed"
    : "public_profile_activity_feed";
  const profileSocialFeedItems = useMemo<ProfileSocialFeedItem[]>(() => {
    if (!userId || !canViewFullProfile) return [];
    if (profileSocialFeedMode === "own_profile_social_feed") {
      const supplemental = buildOwnProfileSocialFeed({
        ownerUserId: userId,
        ownerActor: profileSocialFeedActor,
        ownPosts: profilePosts.filter(post => post.userId === userId),
        ownVideos: [],
        circlePosts: profileSocialFeedExtras.circlePosts,
        followedPosts: profileSocialFeedExtras.followedPosts,
        circleVideos: profileSocialFeedExtras.circleVideos,
        followedVideos: profileSocialFeedExtras.followedVideos,
        discoveryItems: profileDiscovery.items,
        notifications: profileSocialFeedExtras.notifications,
        actorsByUserId: {
          ...profileSocialFeedExtras.actorsByUserId,
          ...(profileSocialFeedActor ? { [userId]: profileSocialFeedActor } : {}),
        },
        chillyCircleUserIds: profileSocialFeedExtras.circleUserIds,
        followedChannelUserIds: profileSocialFeedExtras.followedChannelUserIds,
      });
      const livePosts = new Map(profilePosts.map(post => [post.id, post]));
      const paged = feedPages.items.filter(item => !("post" in item) || livePosts.has(item.post.id));
      const seenPosts = new Set(paged.flatMap(item => "post" in item ? [item.post.id] : []));
      const seenDiscovery = new Set(paged.flatMap(item => "discoveryItem" in item ? [item.discoveryItem.id] : []));
      return [...supplemental.filter(item => "post" in item && !seenPosts.has(item.post.id)), ...paged,
        ...supplemental.filter(item => item.type === "backed_activity_item" || ("discoveryItem" in item && !seenDiscovery.has(item.discoveryItem.id)))];
    }

    return buildPublicProfileActivityFeed({
      profileUserId: userId,
      profileActor: profileSocialFeedActor,
      profilePosts: profilePosts.filter(post => post.userId === userId),
      profileVideos: creatorVideos,
      discoveryItems: profileDiscovery.items,
      actorsByUserId: {
        ...profileSocialFeedExtras.actorsByUserId,
        ...(profileSocialFeedActor ? { [userId]: profileSocialFeedActor } : {}),
      },
    });
  }, [
    canViewFullProfile,
    creatorVideos,
    profilePosts,
    feedPages.items,
    profileSocialFeedActor,
    profileSocialFeedExtras.actorsByUserId,
    profileSocialFeedExtras.circlePosts,
    profileSocialFeedExtras.circleUserIds,
    profileSocialFeedExtras.circleVideos,
    profileDiscovery.items,
    profileSocialFeedExtras.followedChannelUserIds,
    profileSocialFeedExtras.followedPosts,
    profileSocialFeedExtras.followedVideos,
    profileSocialFeedExtras.notifications,
    profileSocialFeedMode,
    userId,
  ]);
  const profileSocialFeedReady = profilePostsReady && creatorVideosReady && profileSocialFeedExtrasReady && !profileDiscovery.loading;
  const publicEventSummaryCards: readonly OwnerStatCard[] = [
    {
      label: "Live Now",
      value: profileLive.ready ? String(profileLive.items.length) : "…",
      body: profileLive.isLive
        ? profileLive.items.map((item) => item.title).slice(0, 2).join(" · ")
        : profileLive.status === "offline" ? "no public live session right now"
          : profileLive.status === "error" ? "live status unavailable" : "checking live sessions",
      tone: profileLive.isLive ? "live" : "default",
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
        ? "public schedule can accept reminders"
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
    setPublicEventsError(null);
    try {
      const summaries = await readPublicEventReminderSummaries(userId, currentUserId || undefined, { throwOnUnavailable: true });
      if (!isSocialIdentityCurrent()) return;
      setPublicReminderSummaries(summaries);
      setPublicEvents(summaries.map((summary) => summary.event));
    } catch {
      if (isSocialIdentityCurrent()) setPublicEventsError("Unable to load public events. Please retry.");
    } finally {
      if (isSocialIdentityCurrent()) setPublicEventsReady(true);
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Retained Profile source contract; the current render path intentionally does not call it.
  const accessDetails: readonly ProfileAccessDetail[] = isOfficialProfile ? [
    {
      label: "Browse",
      value: "Verified",
      body: "official platform-owned identity",
    },
    {
      label: "Chi'lly Circle",
      value: "Pinned first",
      body: "Rachi is your first official Chi'lly Circle connection",
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
      label: "Chi'lly Circle",
      value: chillyCircleCount === null ? "..." : String(chillyCircleCount),
      body: "mutual connections visible to you",
      tone: "linked",
    },
    {
      label: "Videos",
      value: creatorVideosReady ? String(creatorVideos.length) : "...",
      body: "videos in your Platform library",
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
      body: "creator live/watch-party events",
      tone: publicEventCount ? "live" : "default",
    },
  ] : [];
  const ownerQuickActions: readonly OwnerQuickAction[] = isSelfProfile ? [
    {
      label: "Platform Studio",
      onPress: onPressManageChannel,
    },
    {
      label: "Platform",
      onPress: onPressPreviewPlatform,
    },
    {
      label: "Chi'lly Chat",
      onPress: () => {
        void onPressCommunication("message");
      },
    },
    {
      label: "Chi'lly Circle",
      onPress: onPressChillyCircleManage,
    },
    {
      label: "Settings",
      onPress: onPressSettings,
    },
  ] : [];
  const ownerNextSteps = [
    !profile.tagline ? "add a sharper Platform line" : null,
    creatorVideosReady && creatorVideos.length === 0 ? "create platform content" : null,
  ].filter(Boolean);
  const ownerPromptCards: readonly OwnerPromptCard[] = isSelfProfile ? [
    ...(!creatorSettingsEnabled ? [{
      kicker: "OWNER VIEW",
      title: "Platform editing is currently hidden",
      body: "This route stays focused on the public-facing Profile until creator controls return.",
    }] : []),
    ...(creatorSettingsEnabled && ownerNextSteps.length ? [{
      kicker: "NEXT IN PLATFORM STUDIO",
      title: ownerNextSteps.length > 1 ? "Shape the next public read" : (
        ownerNextSteps[0] === "add a sharper Platform line"
          ? "Add a sharper Platform line"
          : ownerNextSteps[0] === "create platform content"
            ? "Create platform content"
            : "Build the first visible shelf"
      ),
      body: ownerNextSteps.length > 1
        ? "Start by adding a sharper Platform line and creating the first playable Platform video in Platform Studio."
        : ownerNextSteps[0] === "add a sharper Platform line"
          ? "Give visitors a clearer first read on your lane with a short tagline."
          : "Create platform content in Platform Studio so your public Platform starts feeling watchable.",
      actionLabel: "Open Platform Studio",
      onPress: onPressCreatePlatformContent,
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
  const openProfileSocialActorProfile = (actor: ProfileSocialFeedActor) => {
    const actorUserId = normalizeFeedUserId(actor.userId);
    if (!actorUserId) return;
    router.push({
      pathname: "/profile/[userId]",
      params: { userId: actorUserId },
    });
  };
  const openProfileSocialActorChannel = (actor: ProfileSocialFeedActor) => {
    const actorUserId = normalizeFeedUserId(actor.userId);
    if (!actorUserId) return;
    router.push({
      pathname: "/channel/[userId]",
      params: { userId: actorUserId },
    });
  };
  const openProfileSocialDiscoveryItem = (item: DiscoveryFeedItem) => {
    const mediaId = normalizeFeedUserId(item.media_id);
    if (item.item_type === "creator_upload" && mediaId) {
      router.push({
        pathname: "/player/[id]",
        params: {
          id: mediaId,
          source: "creator-video",
        },
      });
      return;
    }

    const itemId = normalizeFeedUserId(item.id);
    if (!itemId) return;
    router.push(`/spectate/${encodeURIComponent(itemId)}` as Parameters<typeof router.push>[0]);
  };
  const openProfileSocialNotification = (item: Extract<ProfileSocialFeedItem, { type: "backed_activity_item" }>) => {
    const target = item.notification.target;
    const entityId = normalizeFeedUserId(target.entityId);

    switch (target.route) {
      case "/profile/[userId]":
        if (entityId) {
          router.push({ pathname: "/profile/[userId]", params: { userId: entityId } });
        }
        return;
      case "/channel/[userId]":
        if (entityId) {
          router.push({ pathname: "/channel/[userId]", params: { userId: entityId } });
        }
        return;
      case "/player/[id]":
        if (entityId) {
          router.push({ pathname: "/player/[id]", params: { id: entityId, source: "creator-video" } });
        }
        return;
      case "/spectate/[itemId]":
        if (entityId) {
          router.push(`/spectate/${encodeURIComponent(entityId)}` as Parameters<typeof router.push>[0]);
        }
        return;
      case "/watch-party/[partyId]":
        if (entityId) {
          router.push({ pathname: "/watch-party/[partyId]", params: { partyId: entityId } });
        }
        return;
      case "/watch-party/live-stage/[partyId]":
        if (entityId) {
          router.push({ pathname: "/watch-party/live-stage/[partyId]", params: { partyId: entityId } });
        }
        return;
      case "/title/[id]":
        if (entityId) {
          router.push({ pathname: "/title/[id]", params: { id: entityId } });
        }
        return;
      case "/chat":
        router.push("/chat");
        return;
      case "/chat/[threadId]":
        if (entityId) {
          const path = resolveNotificationPath(`/chat/${entityId}`, {
            notificationType: item.notification.notificationType,
            targetEntityId: target.entityId,
            targetContext: target.context,
          });
          if (path) router.push(path as Parameters<typeof router.push>[0]);
        }
        return;
      default:
        return;
    }
  };
  if (shouldShowUnavailableProfile) {
    return (
      <View
        style={styles.outerFlex}
        testID="profile-screen"
        accessibilityLabel="Chi'llywood profile unavailable screen"
      >
        <View style={styles.fullBackgroundFallback} pointerEvents="none" />
        <View style={styles.fullBackgroundOverlay} pointerEvents="none" />
        <ScrollView
          style={styles.screen}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <TouchableOpacity
              accessible
              focusable
              hitSlop={12}
              testID="profile-back-button"
              onPress={() => router.back()}
              activeOpacity={0.8}
              style={styles.headerBackButton}
              accessibilityRole="button"
              accessibilityLabel="Go back from Profile"
            >
              <Text style={styles.backArrow}>←</Text>
            </TouchableOpacity>
            <Text style={styles.kicker}>{"Chi'llywood · PROFILE"}</Text>
            <NotificationBellButton surface="profile" />
          </View>
          <View style={styles.sectionCard}>
            <AppText scale="caption" style={styles.sectionKicker}>PROFILE</AppText>
            <AppText scale="title3" style={styles.sectionTitle}>Profile unavailable</AppText>
            <AppText scale="body" style={styles.sectionBody}>
              This profile is not available for public browsing. Use Chi&apos;lly Chat search to find or start a direct thread through the normal app path.
            </AppText>
            <View style={styles.profileUnavailableActionRow}>
              <TouchableOpacity
                testID="profile-unavailable-open-chat-search"
                accessibilityLabel="Open Chi'lly Chat search"
                style={[styles.actionBtn, styles.actionBtnConnected]}
                activeOpacity={0.86}
                onPress={() => router.push("/chat")}
              >
                <Text style={[styles.actionBtnText, styles.actionBtnTextConnected]}>Open Chi&apos;lly Chat</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                activeOpacity={0.86}
                onPress={() => router.back()}
              >
                <Text style={styles.actionBtnText}>Back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }
  const renderComposerAvatar = (size: "small" | "medium" = "small") => (
    <View style={size === "small" ? styles.composerAvatar : styles.feedAvatar}>
      {profile.avatarUrl ? (
        <StableImage
          expectedWidth="100%"
          expectedHeight="100%"
          source={{ uri: profile.avatarUrl }}
          borderRadius={size === "small" ? 19 : 21}
          resizeMode="cover"
        />
      ) : (
        <AppText scale="body" style={styles.composerAvatarInitial}>{profile.displayName.slice(0, 1).toUpperCase()}</AppText>
      )}
    </View>
  );
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
            <AppText scale="subhead" style={styles.profilePostComposerTitle}>Post</AppText>
            <AppText scale="caption" style={styles.profilePostComposerMeta}>Share an update. Attach photos or files. Creator videos belong in Platform Studio.</AppText>
          </View>
        </View>
        <TextInput
          ref={profilePostInputRef}
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
            <AppText scale="caption" style={styles.profilePostComposerCount}>
              {draftLength}/{PROFILE_POST_BODY_LIMIT}
            </AppText>
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
  const renderProfilePostCard = (post: ProfilePost, actor?: ProfileSocialFeedActor) => {
    const canDeletePost = isSelfProfile && post.userId === currentUserId;
    const canReportPost = post.userId !== currentUserId && !!currentUserId && post.visibility === "public";
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
      if (comment.userId === post.userId) return actor?.displayName ?? profile.displayName;
      return comment.authorName || "Member";
    };
    const replyTarget = comments.find((comment) => comment.id === uiState.replyTargetCommentId) ?? null;
    const topLevelComments = comments.filter((comment) => !comment.parentCommentId || !comments.some(parent => parent.id === comment.parentCommentId));
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
              <AppText scale="footnote" style={styles.profilePostCommentAuthor} numberOfLines={1}>
                {commentAuthorLabel}
              </AppText>
              <ConversationTimestamp scale="caption" style={styles.profilePostCommentMeta} value={conversationCreatedAt(comment)} />
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
          {actor ? <TouchableOpacity style={styles.feedAvatar} accessibilityRole="button" accessibilityLabel={`Open ${actor.displayName}'s profile`} onPress={() => openProfileSocialActorProfile(actor)}>
            {actor.avatarUrl ? <StableImage expectedWidth="100%" expectedHeight="100%" source={{ uri: actor.avatarUrl }} borderRadius={21} resizeMode="cover" />
              : <AppText scale="subhead">{actor.displayName.slice(0, 1)}</AppText>}
          </TouchableOpacity> : renderComposerAvatar("medium")}
          <View style={styles.feedPostIdentity}>
            <AppText scale="subhead" style={styles.feedPostName} numberOfLines={1}>{actor?.displayName ?? profile.displayName}</AppText>
            <AppText scale="caption" style={styles.feedPostMeta}>{formatProfilePostDate(post.createdAt)}</AppText>
          </View>
          {shouldShowOwnerDraftMarker(isSelfProfile, post as ProfilePost & { visibility: "public" | "draft" }) ? (
            <View style={styles.feedDraftBadge}>
              <AppText scale="caption" style={styles.feedDraftBadgeText}>DRAFT</AppText>
            </View>
          ) : null}
          {isSelfProfile && post.moderationStatus === "reported" ? (
            <View style={styles.feedDraftBadge}>
              <AppText scale="caption" style={styles.feedDraftBadgeText}>REPORTED</AppText>
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
              disabled={!!uiState.likeBusy || (!!currentUserId && !uiState.engagementReady)}
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
        {!uiState.commentsOpen && uiState.commentNotice ? <AppText scale="footnote" style={styles.profilePostCommentNoticeText}>{uiState.commentNotice}</AppText> : null}
        {uiState.commentsOpen ? (
          <View style={styles.profilePostCommentsPanel}>
            {uiState.commentsRefreshAvailable ? <TouchableOpacity accessibilityRole="button"
              accessibilityLabel="Comments changed. Refresh comments" disabled={uiState.commentsLoading}
              onPress={() => { void loadProfilePostComments(post.id); }}>
              <Text style={styles.feedPostActionText}>Comments changed · Refresh comments</Text>
            </TouchableOpacity> : null}
            {uiState.commentNotice ? (
              <View style={styles.profilePostCommentNotice}>
                <AppText scale="footnote" style={styles.profilePostCommentNoticeText}>{uiState.commentNotice}</AppText>
                <TouchableOpacity accessibilityRole="button" onPress={() => { void loadProfilePostComments(post.id, !!uiState.comments?.length); }}>
                  <Text style={styles.feedPostActionText}>Retry comments</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {!uiState.commentsReady ? (
              <View style={styles.profilePostCommentsLoading}>
                <ActivityIndicator color="#DC143C" />
                <AppText scale="caption" style={styles.profilePostCommentMeta}>Loading comments</AppText>
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
            ) : !uiState.commentNotice ? (
              <AppText scale="footnote" style={styles.profilePostCommentEmpty}>No comments yet.</AppText>
            ) : null}
            {uiState.commentsHasMore ? <TouchableOpacity accessibilityRole="button" disabled={uiState.commentsLoading}
              onPress={() => { void loadProfilePostComments(post.id, true); }}>
              <Text style={styles.feedPostActionText}>{uiState.commentsLoading ? "Loading comments…" : "Load more comments"}</Text>
            </TouchableOpacity> : null}
            {canEngageWithPost ? (
              currentUserId ? (
                <View style={styles.profilePostCommentComposer}>
                  {replyTarget ? (
                    <View style={styles.profilePostReplyNotice}>
                      <AppText scale="caption" style={styles.profilePostReplyNoticeText} numberOfLines={1}>
                        Replying to {getProfilePostCommentAuthorLabel(replyTarget)}
                      </AppText>
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
                      <AppText scale="caption" style={styles.profilePostComposerCount}>
                        {commentDraftLength}/{PROFILE_POST_COMMENT_BODY_LIMIT}
                      </AppText>
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
                <AppText scale="footnote" style={styles.profilePostCommentEmpty}>Sign in to comment.</AppText>
              )
            ) : (
              <AppText scale="footnote" style={styles.profilePostCommentEmpty}>Comments are closed for this post.</AppText>
            )}
          </View>
        ) : null}
      </View>
    );
  };
  const renderProfileSocialFeedItem = (item: ProfileSocialFeedItem) => {
    if ("post" in item) {
      return renderProfilePostCard(item.post, item.actor ?? undefined);
    }

    return (
      <ProfileSocialFeedCard
        key={item.id}
        item={item}
        onOpenActorChannel={openProfileSocialActorChannel}
        onOpenActorProfile={openProfileSocialActorProfile}
        onOpenCreatorVideo={openCreatorVideo}
        onOpenDiscoveryItem={openProfileSocialDiscoveryItem}
        onOpenNotification={openProfileSocialNotification}
      />
    );
  };
  const renderProfileSocialFeed = () => (
    <View style={styles.feedStack}>
      <View style={styles.profileSocialFeedHeader}>
        <AppText scale="caption" style={styles.profileSocialFeedKicker}>
          {profileSocialFeedMode === "own_profile_social_feed" ? "YOUR FEED" : "PROFILE FEED"}
        </AppText>
        <AppText scale="title3" style={styles.profileSocialFeedTitle}>
          {profileSocialFeedMode === "own_profile_social_feed" ? "Posts" : `${profile.displayName}'s Posts`}
        </AppText>
        <AppText scale="body" style={styles.profileSocialFeedBody}>
          {profileSocialFeedMode === "own_profile_social_feed"
            ? "Share an update, keep attachments with social posts, and catch public activity from your Chi'lly Circle and followed creators."
            : "This feed shows public posts, creator activity, and safe live or replay entries from this Profile."}
        </AppText>
      </View>
      {renderProfilePostComposer()}
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Refresh profile feed" onPress={() => { void feedPages.refresh(); setSocialRefresh(value => value + 1); void profileAudience.refreshProfileAudience(); void profileDiscovery.reload(); }}>
        <Text style={styles.feedPostActionText}>Refresh feed</Text>
      </TouchableOpacity>
      {profilePostsNotice || profileSocialFeedNotice || creatorVideosError || profileDiscovery.error ? (
        <View style={styles.profileComposerNotice}>
          <AppText scale="footnote" style={styles.profileComposerNoticeText}>{profilePostsNotice ?? profileSocialFeedNotice ?? creatorVideosError ?? profileDiscovery.error}</AppText>
          {profilePostsNotice || profileSocialFeedNotice || creatorVideosError ? <TouchableOpacity accessibilityRole="button" onPress={() => { void feedPages.refresh(); setSocialRefresh(value => value + 1); }}>
            <Text style={styles.feedPostActionText}>Retry posts</Text>
          </TouchableOpacity> : null}
          {profileDiscovery.error ? (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry profile discovery" onPress={() => { void profileDiscovery.reload(); }}>
              <AppText scale="footnote" style={styles.profileComposerNoticeText}>Retry live discovery</AppText>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {profileSocialFeedExtras.circleBackingUnavailable ? (
        <View style={styles.profileComposerNotice}>
          <AppText scale="footnote" style={styles.profileComposerNoticeText}>{"Chi'lly Circle activity is unavailable right now."}</AppText>
        </View>
      ) : null}
      {!profileSocialFeedReady && !profileSocialFeedItems.length ? (
        <View style={styles.feedEmptyCard}>
          <ActivityIndicator color="#DC143C" />
          <AppText scale="subhead" style={styles.feedEmptyTitle}>Loading profile feed</AppText>
          <AppText scale="footnote" style={styles.feedEmptyText}>Checking posts, public activity, and safe live entries.</AppText>
        </View>
      ) : !profileSocialFeedItems.length && !profilePostsNotice && !profileSocialFeedNotice && !creatorVideosError && !profileDiscovery.error ? (
        <View style={styles.feedEmptyCard}>
          <AppText scale="subhead" style={styles.feedEmptyTitle}>
            {profileSocialFeedMode === "own_profile_social_feed"
              ? "No posts yet"
              : "No public posts yet"}
          </AppText>
          <AppText scale="footnote" style={styles.feedEmptyText}>
            {profileSocialFeedMode === "own_profile_social_feed"
              ? "Share an update or attach a photo to start your Profile feed."
              : "Public updates will appear here when available."}
          </AppText>
          {profileSocialFeedMode === "own_profile_social_feed" ? (
            <TouchableOpacity
              style={styles.feedEmptyButton}
              activeOpacity={0.86}
              onPress={focusProfilePostComposer}
              accessibilityRole="button"
              accessibilityLabel="Create Profile post"
            >
              <MaterialIcons name="edit" size={17} color="#fff" />
              <Text style={styles.feedEmptyButtonText}>Create Post</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- Retained Profile source contract; the current render path intentionally does not call it.
  const renderOwnerHandoffCard = () => {
    if (!isSelfProfile) return null;

    return (
      <View style={styles.ownerModeCard}>
        <AppText scale="caption" style={styles.ownerModeKicker}>OWNER HANDOFF</AppText>
        <AppText scale="title3" style={styles.ownerModeTitle}>Keep Profile social and Platform public.</AppText>
        <AppText scale="body" style={styles.ownerModeBody}>
          Use Platform Studio for creator operations while this route keeps posts, identity, and social actions easy to scan.
        </AppText>
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
                <AppText scale="subhead" style={styles.ownerSignalValue}>{card.value}</AppText>
                <AppText scale="caption" style={styles.ownerSignalLabel}>{card.label}</AppText>
              </View>
            ))}
          </View>
        ) : null}
        {ownerPromptCards.length ? (
          <View style={styles.ownerPromptStack}>
            {ownerPromptCards.map((prompt) => (
              <View key={prompt.title} style={styles.ownerPromptCard}>
                <AppText scale="caption" style={styles.ownerPromptKicker}>{prompt.kicker}</AppText>
                <AppText scale="subhead" style={styles.ownerPromptTitle}>{prompt.title}</AppText>
                <AppText scale="footnote" style={styles.ownerPromptBody}>{prompt.body}</AppText>
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
      accessibilityLabel="Chi'llywood profile screen"
    >
      {visibleProfileBackgroundUrl ? (
        <View style={styles.fullBackground} pointerEvents="none">
          <StableImage
            expectedWidth="100%"
            expectedHeight="100%"
            source={{ uri: visibleProfileBackgroundUrl }}
            onRetry={refreshProfilePresentation}
            containerStyle={styles.fullBackgroundImage}
            borderRadius={0}
            resizeMode={resolveProfileImageResizeMode(profile.profileBackgroundFitMode)}
          />
        </View>
      ) : (
        <View style={styles.fullBackgroundFallback} pointerEvents="none" />
      )}
      <View
        style={[
          styles.fullBackgroundOverlay,
          visibleProfileBackgroundUrl && styles.fullBackgroundOverlayWithImage,
        ]}
        pointerEvents="none"
      />

      <KeyboardAvoidingView
        style={styles.outerFlex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
      {activeTab === "home" && isSelfProfile && canViewFullProfile && !shouldShowLockedShell && feedFreshness.identity === socialIdentity && feedFreshness.available ? (
        <View pointerEvents="box-none" style={styles.feedFreshnessOverlay}>
          <TouchableOpacity style={styles.feedFreshnessButton} accessibilityRole="button"
            accessibilityLabel="Refresh feed updates" disabled={!profilePostsReady}
            onPress={() => {
              void feedPages.refresh().then(success => {
                if (!success || !isSocialIdentityCurrent()) return;
                setSocialRefresh(value => value + 1);
                scrollViewRef.current?.scrollToOffset({ offset: 0, animated: true });
              });
            }}>
            <Text style={styles.feedPostActionText}>{profilePostsReady ? feedFreshness.retry ? "Feed updates · Retry" : "↑ New posts" : "Loading feed updates…"}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <FlatList
        key={socialIdentity}
        ref={scrollViewRef}
        extraData={profilePostUiById}
        onViewableItemsChanged={onFeedViewableItemsChanged}
        viewabilityConfig={feedViewabilityConfig}
        refreshing={!profilePostsReady && profilePosts.length > 0}
        onRefresh={() => { void feedPages.refresh(); setSocialRefresh(value => value + 1); void profileAudience.refreshProfileAudience(); void profileDiscovery.reload(); }}
        style={styles.screen}
        contentContainerStyle={[styles.content, styles.contentKeyboardInset]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
        data={activeTab === "home" && !shouldShowLockedShell ? [...profileSocialFeedItems].sort((left, right) => Number("post" in right && right.post.id === sharedPostId) - Number("post" in left && left.post.id === sharedPostId)) : []}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <View style={styles.virtualizedFeedItem}>
          {"post" in item && item.post.id === sharedPostId ? <AppText scale="caption" style={styles.profileSocialFeedKicker}>SHARED POST</AppText> : null}
          {renderProfileSocialFeedItem(item)}
        </View>}
        initialNumToRender={6}
        maxToRenderPerBatch={6}
        windowSize={7}
        ListFooterComponent={activeTab === "home" && !shouldShowLockedShell && feedPages.hasMore ? <TouchableOpacity style={styles.virtualizedFeedItem} accessibilityRole="button" onPress={() => { void feedPages.loadMore(); }}>
          <Text style={styles.feedPostActionText}>Load more posts</Text>
        </TouchableOpacity> : null}
        ListHeaderComponent={<View style={styles.profileListHeader}>
        <View style={styles.header}>
          <TouchableOpacity
            accessible
            focusable
            hitSlop={12}
            testID="profile-back-button"
            onPress={() => router.back()}
            activeOpacity={0.8}
            style={styles.headerBackButton}
            accessibilityRole="button"
            accessibilityLabel="Go back from Profile"
          >
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>{"Chi'llywood · PROFILE"}</Text>
          <NotificationBellButton surface="profile" />
        </View>

        <View style={styles.profileCard}>
          <View style={styles.profileCover}>
            {visibleProfileBackgroundUrl ? (
              <StableImage
                expectedWidth="100%"
                expectedHeight="100%"
                source={{ uri: visibleProfileBackgroundUrl }}
                onRetry={refreshProfilePresentation}
                containerStyle={styles.profileCoverImage}
                borderRadius={0}
                resizeMode={resolveProfileImageResizeMode(profile.profileBackgroundFitMode)}
              />
            ) : null}
            {visibleProfileBackgroundUrl ? (
              <View
                pointerEvents="none"
                style={[
                  styles.profileCoverImageOverlay,
                  { opacity: visibleProfileBackgroundOverlay },
                ]}
              />
            ) : null}
            <View style={styles.profileCoverTopRow}>
              <Text style={styles.profileEyebrow}>{shouldShowLockedShell ? "PROFILE" : profileEyebrow}</Text>
              {!shouldShowLockedShell ? (
                <View style={styles.profileCoverBadgeRow}>
                  {isOfficialProfile ? (
                    <View style={[styles.heroBadge, styles.heroBadgeOfficial]}>
                      <Text style={[styles.heroBadgeText, styles.heroBadgeTextOfficial]}>
                        {profile.officialBadgeLabel ?? officialAccount?.officialBadgeLabel ?? "OFFICIAL"}
                      </Text>
                    </View>
                  ) : null}
                  {!isOfficialProfile ? (
                    <View style={[styles.heroBadge, profileLive.isLive ? styles.heroBadgeLive : styles.heroBadgeDefault]}>
                      <Text style={[styles.heroBadgeText, profileLive.isLive && styles.heroBadgeTextLive]}>{liveStateLabel}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
          <View style={styles.profileIdentityRow}>
            <Pressable
              testID={isSelfProfile ? "profile-avatar-edit-trigger" : "profile-avatar-actions-trigger"}
              accessibilityRole="button"
              accessibilityLabel={isSelfProfile ? "Edit Profile Photo" : "Open Profile Actions"}
              style={({ pressed }) => [styles.avatarPressable, pressed && styles.avatarPressablePressed]}
              hitSlop={10}
              onPress={onPressProfileAvatar}
              onLongPress={onPressProfileAvatar}
              delayLongPress={220}
            >
              <View style={styles.avatarWrap}>
                <View style={styles.avatarCircle}>
                  {visibleProfileAvatarUrl ? (
                    <StableImage
                      expectedWidth="100%"
                      expectedHeight="100%"
                      source={{ uri: visibleProfileAvatarUrl }}
                      onRetry={refreshProfilePresentation}
                      borderRadius={43}
                      resizeMode={resolveProfileImageResizeMode(profile.profileAvatarFitMode)}
                    />
                  ) : profileMediaLoading ? (
                    <View testID="profile-avatar-loading" accessibilityLabel="Loading Profile Photo" style={styles.avatarImage}>
                      <Skeleton height="100%" width="100%" borderRadius={43} />
                    </View>
                  ) : profilePresentationError ? (
                    <Pressable testID="profile-avatar-retry" accessibilityRole="button" accessibilityLabel="Retry Profile Photo" onPress={(event) => {
                      event.stopPropagation();
                      refreshProfilePresentation();
                    }}>
                      <AppText scale="caption">Retry photo</AppText>
                    </Pressable>
                  ) : (
                    <AppText scale="title1" style={styles.avatarInitial}>{profile.displayName.slice(0, 1).toUpperCase()}</AppText>
                  )}
                </View>
                {!shouldShowLockedShell && profileLive.isLive ? <View style={styles.avatarLiveDot} /> : null}
              </View>
            </Pressable>
            <View style={styles.profileIdentityCopy}>
              <AppText scale="caption" style={styles.channelLabel}>{profileLabel}</AppText>
              <AppText
                scale="title2"
                style={styles.username}
                numberOfLines={1}
                ellipsizeMode="tail"
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {profile.displayName}
              </AppText>
              <AppText scale="subhead" style={styles.userIdLabel} numberOfLines={1}>{channelHandle}</AppText>
              {profile.tagline && !shouldShowLockedShell ? <AppText scale="subhead" style={styles.profileTagline}>{profile.tagline}</AppText> : null}
              {!shouldShowLockedShell ? (
                <View style={styles.metaRow}>
                  <View style={styles.metaPill}>
                    <AppText scale="caption" style={styles.metaPillText}>{roleLabel}</AppText>
                  </View>
                  {hasLiveRouteContext ? (
                    <View style={[styles.metaPill, styles.metaPillLinked]}>
                      <AppText scale="caption" style={styles.metaPillText}>{routeContextLabel}</AppText>
                    </View>
                  ) : null}
                  {isOfficialProfile ? (
                    <View style={[styles.metaPill, styles.metaPillOfficial]}>
                      <AppText scale="caption" style={[styles.metaPillText, styles.metaPillTextOfficial]}>
                        {officialAccount?.officialBadgeLabel ?? "OFFICIAL"}
                      </AppText>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          </View>
          {!shouldShowLockedShell ? (
            <>
              <AppText scale="footnote" style={styles.channelSupportText}>{channelHomeBody}</AppText>
              <View style={styles.channelSignalGrid}>
                {channelSignals.map((signal) => {
                  const signalIsPlatform = signal.label === "Platform";
                  return (
                    <TouchableOpacity
                      key={signal.label}
                      style={[
                        styles.channelSignalCard,
                        signal.tone === "live" && styles.channelSignalCardLive,
                        signal.tone === "linked" && styles.channelSignalCardLinked,
                        signal.tone === "official" && styles.channelSignalCardOfficial,
                        signalIsPlatform && styles.channelSignalCardPressable,
                      ]}
                      activeOpacity={signalIsPlatform ? 0.86 : 1}
                      disabled={!signalIsPlatform}
                      onPress={isSelfProfile ? onPressPreviewPlatform : onPressViewChannel}
                    >
                      <AppText scale="caption" style={styles.channelSignalLabel}>{signal.label}</AppText>
                      <AppText scale="subhead" style={styles.channelSignalValue}>{signal.value}</AppText>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </>
          ) : null}
          <View style={styles.actionCluster}>
            {shouldShowLockedShell ? null : isSelfProfile ? (
              <>
                <View style={styles.primaryActionRow}>
                  <TouchableOpacity
                    testID="profile-platform-studio-button"
                    style={[styles.actionBtn, styles.actionBtnConnected]}
                    activeOpacity={0.86}
                    onPress={onPressManageChannel}
                  >
                    <Text style={[styles.actionBtnText, styles.actionBtnTextConnected]}>Platform Studio</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    testID="profile-preview-platform-button"
                    accessibilityLabel="Open Platform"
                    style={[styles.actionBtn, styles.actionBtnSecondary]}
                    activeOpacity={0.86}
                    onPress={onPressPreviewPlatform}
                  >
                    <Text style={styles.actionBtnText}>Platform</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.secondaryActionRow}>
                  <TouchableOpacity
                    testID="profile-chilly-chat-button"
                    accessibilityLabel="Open Chi'lly Chat"
                    style={[styles.actionChip, styles.actionChipConnected]}
                    activeOpacity={0.86}
                    onPress={() => {
                      void onPressCommunication("message");
                    }}
                  >
                    <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>{"Chi'lly Chat"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionChip, styles.actionChipConnected]}
                    activeOpacity={0.86}
                    onPress={onPressChillyCircleManage}
                  >
                    <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>{"Chi'lly Circle"}</Text>
                  </TouchableOpacity>
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
                {canShowFollowAction || !isOfficialProfile ? (
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
                        accessibilityRole="button"
                        accessibilityLabel={followActionLabel}
                        accessibilityState={{ disabled: followActionBusy || viewerFollowState === "loading", busy: followActionBusy }}
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
                    {!isOfficialProfile ? (
                      <TouchableOpacity
                        testID="profile-chilly-chat-button"
                        accessibilityLabel="Open Chi'lly Chat"
                        style={[styles.actionBtn, styles.actionBtnConnected]}
                        activeOpacity={0.86}
                        onPress={() => {
                          void onPressCommunication("message");
                        }}
                      >
                        <Text style={[styles.actionBtnText, styles.actionBtnTextConnected]}>{"Chi'lly Chat"}</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
                <View style={styles.secondaryActionRow}>
                  {!isOfficialProfile || officialAccount ? (
                    <TouchableOpacity
                      style={[styles.actionChip, styles.actionChipConnected]}
                      activeOpacity={0.82}
                      onPress={onPressViewChannel}
                    >
                      <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>View Platform</Text>
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
                        hasLiveRouteContext && profileLive.isLive ? styles.actionChipReport : styles.actionChipConnected,
                      ]}
                      activeOpacity={0.86}
                      onPress={onPressLive}
                    >
                      <Text
                        style={[
                          styles.actionChipText,
                          hasLiveRouteContext && profileLive.isLive ? styles.actionChipTextReport : styles.actionChipTextConnected,
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
                  {renderChillyCircleActions()}
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

        {shouldShowLockedShell ? (
          <View style={styles.sectionCard}>
            <AppText scale="caption" style={styles.sectionKicker}>PROFILE PRIVACY</AppText>
            <AppText scale="title3" style={styles.sectionTitle}>{profileAudience.privacyError ? "Profile access is unavailable." : getProfilePrivacyLockedTitle(profilePrivacyAccess)}</AppText>
            <AppText scale="body" style={styles.sectionBody}>{profileAudience.privacyError ? "Profile access could not be checked. Try again." : getProfilePrivacyLockedBody(profilePrivacyAccess)}</AppText>
            <View style={styles.secondaryActionRow}>
              {profileAudience.privacyError ? (
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry Profile access"
                  style={styles.actionChip} onPress={() => { void profileAudience.refreshProfileAudience(); }}>
                  <Text style={styles.actionChipText}>Try again</Text>
                </TouchableOpacity>
              ) : null}
              {renderChillyCircleActions()}
            </View>
          </View>
        ) : (
          <>
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
          {activeTab === "home" ? renderProfileSocialFeed() : null}
          {activeTab !== "home" ? activeTabSections.map((section) => (
            <View
              key={section.title}
              style={[
                styles.sectionCard,
                section.accent === "live" && styles.sectionCardLive,
                section.accent === "official" && styles.sectionCardOfficial,
              ]}
            >
              <AppText scale="caption" style={styles.sectionKicker}>{section.kicker}</AppText>
              <AppText scale="title3" style={styles.sectionTitle}>{section.title}</AppText>
              <AppText scale="body" style={styles.sectionBody}>{section.body}</AppText>
            </View>
          )) : null}
          {activeTab === "about" ? (
            <>
              {isSelfProfile && !isOfficialProfile ? (
                <View style={styles.sectionCard}>
                  <AppText scale="caption" style={styles.sectionKicker}>EDIT ABOUT</AppText>
                  <AppText scale="title3" style={styles.sectionTitle}>Tell people a little about you</AppText>
                  <TextInput
                    style={styles.profilePostCommentInput}
                    value={aboutDraft}
                    onChangeText={(value) => {
                      setAboutDraft(value.slice(0, 160));
                      setAboutNotice(null);
                    }}
                    placeholder="What should people know about you?"
                    placeholderTextColor="#8A93A8"
                    multiline
                    maxLength={160}
                    editable={!aboutBusy}
                  />
                  <View style={styles.secondaryActionRow}>
                    <AppText scale="caption" style={styles.actionFootnote}>{aboutDraft.length}/160</AppText>
                    <TouchableOpacity
                      style={[styles.actionChip, styles.actionChipConnected, aboutBusy && styles.actionChipPlaceholder]}
                      activeOpacity={0.86}
                      disabled={aboutBusy}
                      onPress={() => { void onSaveAbout(); }}
                    >
                      <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>
                        {aboutBusy ? "Saving…" : "Save About"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {aboutNotice ? <AppText scale="footnote" style={styles.sectionBody}>{aboutNotice}</AppText> : null}
                </View>
              ) : null}
              {isOfficialProfile ? (
                <>
                  <View style={styles.channelGuideCard}>
                    <AppText scale="caption" style={styles.channelGuideKicker}>{channelHelper.kicker}</AppText>
                    <AppText scale="subhead" style={styles.channelGuideTitle}>{channelHelper.title}</AppText>
                    <AppText scale="footnote" style={styles.channelGuideBody}>{channelHelper.body}</AppText>
                    {officialGuidanceTopics.length ? (
                      <View style={styles.officialTopicRow}>
                        {officialGuidanceTopics.map((topic) => (
                          <View key={topic} style={styles.officialTopicChip}>
                            <AppText scale="caption" style={styles.officialTopicChipText}>{topic}</AppText>
                          </View>
                        ))}
                      </View>
                    ) : null}
                  </View>
                  <View style={styles.accessCard}>
                    <AppText scale="caption" style={styles.accessKicker}>PLATFORM ACCESS</AppText>
                    <AppText scale="subhead" style={styles.accessTitle}>{accessPosture.title}</AppText>
                    <AppText scale="footnote" style={styles.accessBody}>{accessPosture.body}</AppText>
                  </View>
                </>
              ) : null}
            </>
          ) : null}
          {activeTab === "content" ? (
            <View style={styles.quickActionsCard}>
              <AppText scale="subhead" style={styles.quickActionsTitle}>
                {isSelfProfile ? "Platform Videos" : "Creator Videos"}
              </AppText>
              {!creatorVideosReady ? (
                <AppText scale="body" style={styles.sectionBody}>Loading creator videos...</AppText>
              ) : creatorVideosError && !creatorVideos.length ? (
                <TouchableOpacity accessibilityRole="button" onPress={() => setSocialRefresh(value => value + 1)}>
                  <AppText scale="body" style={styles.sectionBody}>{creatorVideosError} Retry videos</AppText>
                </TouchableOpacity>
              ) : creatorVideos.length ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.creatorVideoGrid}
                >
                  {creatorVideos.map((video) => (
                    <View key={video.id} style={styles.profileCreatorVideoTile}>
                      <CreatorVideoCard
                        video={video}
                        mode={isSelfProfile ? "owner" : "public"}
                        onOpen={() => openCreatorVideo(video)}
                        onShare={!isSelfProfile && isCreatorVideoPubliclyShareable(video) ? () => {
                          void shareCreatorVideo(video);
                        } : undefined}
                      />
                    </View>
                  ))}
                </ScrollView>
              ) : isSelfProfile ? (
                <View style={styles.creatorVideoEmptyCard}>
                  <AppText scale="subhead" style={styles.creatorVideoTitle}>Create platform content in Platform Studio</AppText>
                  <AppText scale="footnote" style={styles.creatorVideoBody}>
                    Creator videos, Clip Studio, Brand Studio, and readiness tools stay in Platform Studio.
                  </AppText>
                  <TouchableOpacity
                    style={styles.ownerPromptAction}
                    activeOpacity={0.84}
                    onPress={onPressCreatePlatformContent}
                  >
                    <Text style={styles.ownerPromptActionText}>Open Platform Studio</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <AppText scale="body" style={styles.sectionBody}>
                  This Platform has not published creator videos yet.
                </AppText>
              )}
            </View>
          ) : null}
          {activeTab === "community" && communityActions.length ? (
            <View style={styles.quickActionsCard}>
              <AppText scale="subhead" style={styles.quickActionsTitle}>Community Follow-Up</AppText>
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
              <ProfileLiveNow live={profileLive} displayedEventIds={currentPublicEvents.map((event) => event.id)} />
              {publicEventsError ? <View style={styles.sectionCard}>
                <AppText scale="body" style={styles.sectionBody}>{publicEventsError}</AppText>
                <TouchableOpacity accessibilityRole="button" onPress={() => setPublicEventsRetry(value => value + 1)}>
                  <Text style={styles.feedPostActionText}>Retry events</Text>
                </TouchableOpacity>
              </View> : null}
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
                    <AppText scale="caption" style={styles.ownerStatLabel}>{card.label}</AppText>
                    <AppText scale="subhead" style={styles.ownerStatValue}>{card.label !== "Live Now" && publicEventsError && !publicEvents.length ? "Unavailable" : card.value}</AppText>
                    <AppText scale="caption" style={styles.ownerStatBody}>{card.label !== "Live Now" && publicEventsError && !publicEvents.length ? "Retry events to check the schedule." : card.body}</AppText>
                  </View>
                ))}
              </View>
              {!publicEventsReady ? (
                <View style={styles.sectionCard}>
                  <AppText scale="caption" style={styles.sectionKicker}>EVENT STATUS</AppText>
                  <AppText scale="title3" style={styles.sectionTitle}>Loading public event truth</AppText>
                  <AppText scale="body" style={styles.sectionBody}>
                    Checking public creator events before showing live, replay, and reminder state.
                  </AppText>
                </View>
              ) : null}
              {publicEventsReady && reminderActionNotice ? (
                <View style={styles.sectionCard}>
                  <AppText scale="caption" style={styles.sectionKicker}>REMINDER STATUS</AppText>
                  <AppText scale="body" style={styles.sectionBody}>{reminderActionNotice}</AppText>
                </View>
              ) : null}
              {publicEventsReady && currentPublicEvents.length ? (
                currentPublicEvents.map((event) => {
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
                      <AppText scale="caption" style={styles.sectionKicker}>{formatEventTypeLabel(event.eventType).toUpperCase()}</AppText>
                      <AppText scale="title3" style={styles.sectionTitle}>{event.eventTitle}</AppText>
                      <AppText scale="body" style={styles.sectionBody}>
                        {formatEventStatusLabel(event)} · Starts {formatEventDate(event.startsAt)} · Ends {formatEventDate(event.endsAt)}{"\n"}
                        {event.replay.isReplayAvailableNow
                          ? "Replay is currently available."
                          : event.replay.isReplayExpired
                            ? "Replay window has expired."
                            : event.replay.policy === "none"
                              ? "Replay is not enabled for this event."
                              : "Replay status is configured and opens through the event detail when the window is active."}{"\n"}
                        {formatEventReminderLabel(event)} · {formatEventReminderEnrollmentLabel(enrollment)}
                        {event.linkedTitleId ? `\nWatch title: ${event.linkedTitleId}` : ""}
                      </AppText>
                      <AppText scale="caption" style={styles.actionFootnote}>{getEventReminderEnrollmentBody(enrollment)}</AppText>
                      <View style={styles.secondaryActionRow}>
                        <TouchableOpacity
                          style={[styles.actionChip, styles.actionChipConnected]}
                          onPress={() => router.push(`/event/${event.id}`)}
                          activeOpacity={0.86}
                        >
                          <Text style={[styles.actionChipText, styles.actionChipTextConnected]}>Open Event</Text>
                        </TouchableOpacity>
                        {event.reminder.canSetReminder ? (
                          <>
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
                          </>
                        ) : null}
                      </View>
                    </View>
                  );
                })
              ) : publicEventsReady && !publicEventsError ? (
                <View style={styles.sectionCard}>
                  <AppText scale="caption" style={styles.sectionKicker}>EVENT STATUS</AppText>
                  <AppText scale="title3" style={styles.sectionTitle}>No public event schedule yet</AppText>
                  <AppText scale="body" style={styles.sectionBody}>
                    This profile does not currently have any non-draft creator events to show. The route stays honest instead of faking upcoming rooms or reminder state.
                  </AppText>
                </View>
              ) : null}
            </>
          ) : null}
            </View>
          </>
        )}
        <ReportSheet
          visible={reportVisible}
          title={profilePostCommentReportTarget
            ? "Report comment"
            : profilePostReportTarget
            ? "Report profile update"
            : profileMediaReportTarget
            ? `Report ${profileMediaReportTarget === "avatar" ? "Profile photo" : "Profile background"}`
            : isOfficialProfile ? "Report official account concern" : "Report profile or participant"}
          description={profilePostCommentReportTarget
            ? `Send a safety report for this comment under ${profile.displayName}'s post.`
            : profilePostReportTarget
            ? `Send a safety report for this public update from ${profile.displayName}.`
            : profileMediaReportTarget
            ? `Send a safety report for this ${profileMediaReportTarget === "avatar" ? "Profile photo" : "Profile background"}. Reports do not remove media automatically.`
            : isOfficialProfile
              ? `Send a safety report for ${profile.displayName} if an official platform interaction feels unsafe, misleading, or compromised.`
              : `Send a safety report for ${profile.displayName} if this identity feels abusive, unsafe, or misrepresented.`}
          busy={reportBusy}
          onSubmit={onSubmitProfileReport}
          onClose={() => {
            if (reportBusy) return;
            setProfilePostReportTarget(null);
            setProfilePostCommentReportTarget(null);
            setProfileMediaReportTarget(null);
            setReportVisible(false);
          }}
        />
      </View>}
      />
      </KeyboardAvoidingView>
      <SocialAttachmentActionSheet
        visible={!!profileAttachmentSheetTarget && profileAttachmentSheetTarget.identity === socialIdentity}
        kicker="PROFILE ATTACHMENT"
        title={profileAttachmentSheetTarget?.surface === "comment" ? "Add to comment" : "Add to post"}
        body="Photos and files attach to social posts."
        onSelect={onSelectProfileAttachment}
        onClose={() => setProfileAttachmentSheetTarget(null)}
      />
      <ProfileAppearanceSheet
        visible={profilePhotoSheetVisible && isSelfProfile}
        kind="avatar"
        imageUrl={visibleProfileAvatarUrl}
        fitMode={profile.profileAvatarFitMode}
        busy={profileAppearanceBusy === "avatar"}
        onView={() => onViewProfileImage("avatar")}
        onChoose={() => {
          void onChooseProfileMedia("avatar");
        }}
        onRemove={() => onRemoveProfileMedia("avatar")}
        onSelectFitMode={(fitMode) => {
          void onSelectProfileMediaFitMode("avatar", fitMode);
        }}
        onClose={() => {
          if (!profileAppearanceBusy) setProfilePhotoSheetVisible(false);
        }}
      />
      <ProfileAppearanceSheet
        visible={profileBackgroundSheetVisible && isSelfProfile}
        kind="background"
        imageUrl={visibleProfileBackgroundUrl}
        fitMode={profile.profileBackgroundFitMode}
        busy={profileAppearanceBusy === "background"}
        onView={() => onViewProfileImage("background")}
        onChoose={() => {
          void onChooseProfileMedia("background");
        }}
        onRemove={() => onRemoveProfileMedia("background")}
        onSelectFitMode={(fitMode) => {
          void onSelectProfileMediaFitMode("background", fitMode);
        }}
        onClose={() => {
          if (!profileAppearanceBusy) setProfileBackgroundSheetVisible(false);
        }}
      />
      <ProfileActionsSheet
        visible={profileActionsSheetVisible && !isSelfProfile}
        displayName={profile.displayName}
        hasPhoto={!!visibleProfileAvatarUrl}
        hasBackground={!!visibleProfileBackgroundUrl}
        blocked={friendState?.availability === "blocked"}
        busy={profileBlockBusy}
        onViewPhoto={() => onViewProfileImage("avatar")}
        onChat={onPressProfileActionsChat}
        onViewPlatform={onPressProfileActionsPlatform}
        onBlock={onPressProfileActionsBlock}
        onReport={onPressProfileActionsReport}
        onReportPhoto={onPressProfileActionsReportPhoto}
        onReportBackground={onPressProfileActionsReportBackground}
        onShare={onPressProfileActionsShare}
        onClose={() => {
          if (!profileBlockBusy) setProfileActionsSheetVisible(false);
        }}
      />
      <ProfileImagePreviewSheet
        visible={!!profileImagePreview}
        title={profileImagePreview?.title ?? "Profile Preview"}
        imageUrl={profileImagePreview?.imageUrl}
        fitMode={profileImagePreview?.fitMode}
        onClose={() => setProfileImagePreview(null)}
      />
      <ProfileMediaReviewSheet
        visible={!!profileMediaReview && isSelfProfile}
        kind={profileMediaReview?.kind ?? "avatar"}
        imageUri={profileMediaReview?.file.uri}
        fitMode={profileMediaReview?.fitMode}
        busy={profileMediaReview ? profileAppearanceBusy === profileMediaReview.kind : false}
        onSelectFitMode={(fitMode) => {
          setProfileMediaReview((current) => current ? { ...current, fitMode } : current);
        }}
        onChooseAnother={() => {
          if (!profileMediaReview || profileAppearanceBusy) return;
          const { kind } = profileMediaReview;
          setProfileMediaReview(null);
          void onChooseProfileMedia(kind);
        }}
        onSave={() => {
          void onSaveProfileMediaReview();
        }}
        onCancel={() => {
          if (!profileAppearanceBusy) setProfileMediaReview(null);
        }}
      />
      {watchPartyPremiumGate?.reason === "premium_required" ? (
        <AccessSheet
          visible={watchPartyPremiumSheetVisible}
          reason="premium_required"
          gate={watchPartyPremiumGate}
          appDisplayName={branding.appDisplayName}
          premiumUpsellTitle={monetizationConfig.premiumUpsellTitle}
          premiumUpsellBody={monetizationConfig.premiumUpsellBody}
          kickerOverride={watchPartyGatePresentation?.kicker}
          titleOverride={WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY.title}
          bodyOverride={WATCH_PARTY_LIVE_PREMIUM_UPSELL_COPY.message}
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
  virtualizedFeedItem: { width: "100%" },
  profileListHeader: { gap: 16 },
  feedFreshnessOverlay: { position: "absolute", top: 8, left: 0, right: 0, zIndex: 20, alignItems: "center" },
  feedFreshnessButton: { backgroundColor: "#29131D", borderColor: "#DC143C", borderWidth: 1, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 12 },
  outerFlex: { flex: 1 },
  fullBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  fullBackgroundImage: {
    width: "100%",
    height: "100%",
  },
  fullBackgroundFallback: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#0B0B10",
  },
  fullBackgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  fullBackgroundOverlayWithImage: {
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  screen: { flex: 1, backgroundColor: "transparent" },
  content: { paddingTop: 56, paddingBottom: 52, paddingHorizontal: 18, gap: 16 },
  contentKeyboardInset: { paddingBottom: 128 },

  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headerBackButton: { width: 38, minHeight: 38, justifyContent: "center", alignItems: "flex-start" },
  backArrow: { color: "#aaa", fontSize: 20, fontWeight: "700" },
  kicker: { flex: 1, color: "#555", fontSize: 9.5, fontWeight: "800", letterSpacing: 1.2, textAlign: "center" },

  profileCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(168,192,245,0.14)",
    backgroundColor: "rgba(18,18,18,0.96)",
    overflow: "hidden",
    alignItems: "stretch",
    gap: 0,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  profileCover: {
    minHeight: 88,
    padding: 16,
    justifyContent: "flex-start",
    backgroundColor: "#171A22",
    overflow: "hidden",
    position: "relative",
  },
  profileCoverImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  profileCoverImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#05070C",
  },
  profileCoverTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
    position: "relative",
    zIndex: 1,
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
  avatarPressable: {
    borderRadius: 48,
    zIndex: 3,
    elevation: 3,
  },
  avatarPressablePressed: { opacity: 0.88 },
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
  channelSignalCardPressable: {
    borderColor: "rgba(115,134,255,0.34)",
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
  feedStack: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.14)",
    backgroundColor: "rgba(10,14,24,0.88)",
    padding: 12,
    gap: 12,
  },
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
    gap: 9,
    paddingRight: 4,
  },
  profileCreatorVideoTile: {
    width: 150,
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
  tabStripRow: { flexDirection: "row", gap: 8, paddingHorizontal: 2, paddingRight: 16 },
  tabChip: {
    minHeight: 38,
    minWidth: 76,
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
  primaryActionRow: { flexDirection: "row", gap: 9, width: "100%" },
  secondaryActionRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 },
  actionBtn: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    borderRadius: 14,
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
  profileUnavailableActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginTop: 8,
    width: "100%",
  },
  actionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 13,
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
  profileSocialFeedHeader: {
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 2,
    gap: 6,
  },
  profileSocialFeedKicker: {
    color: "#91A2D8",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  profileSocialFeedTitle: {
    color: "#F4F7FF",
    fontSize: 17,
    fontWeight: "900",
  },
  profileSocialFeedBody: {
    color: "#AAB4CA",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },

  sectionStack: { gap: 14 },
  sectionCard: {
    borderRadius: 18,
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
