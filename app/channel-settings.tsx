import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import { ResizeMode, Video } from "expo-av";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  resolveChannelAccess,
  type ChannelAccessResolution,
} from "../_lib/accessEntitlements";
import {
  DEFAULT_APP_CONFIG,
  readAppConfig,
  resolveBrandingConfig,
  resolveFeatureConfig,
} from "../_lib/appConfig";
import { getBetaAccessBlockCopy, useBetaProgram } from "../_lib/betaProgram";
import {
  readChannelAudienceSummary,
  readChannelSafetyAdminSummary,
  readCreatorAnalyticsSummary,
  type ChannelReadModelFieldStatus,
  type ChannelAudienceReadModel,
  type ChannelSafetyAdminReadModel,
  type CreatorAnalyticsReadModel,
} from "../_lib/channelReadModels";
import {
  createCreatorPayoutOnboardingLink,
  createEmptyCreatorPayoutDashboardReadModel,
  createOrReuseCreatorPayoutProviderAccount,
  readCreatorPayoutDashboardSummary,
  resolveCreatorPayoutReadiness,
  syncCreatorPayoutProviderStatus,
  type CreatorPayoutDashboardReadModel,
} from "../_lib/creatorPayouts";
import {
  CREATOR_MONETIZATION_DOCTRINE,
  DEFAULT_CREATOR_MONETIZATION_RUNTIME_FLAGS,
  formatMonetizationCurrency,
  readCreatorMonetizationFoundationSummary,
  type CreatorMonetizationFoundationSummary,
} from "../_lib/creatorMonetization";
import {
  getMoneyFeatureFlag,
  getMoneyFeatureFlagFallbackSummary,
  getMoneyFeatureStateLabel,
  isMoneyFeatureSandboxOrOn,
  readMoneyFeatureFlagSummary,
  type MoneyFeatureFlagKey,
  type MoneyFeatureFlagState,
  type MoneyFeatureFlagSummaryRow,
} from "../_lib/moneyFeatureFlags";
import {
  findProviderReadinessSummary,
  getCreatorReadinessLabel,
  getProviderReadinessFallbackSummary,
  getProviderReadinessTone,
  readProviderReadinessSummary,
  summarizeProviderReadiness,
  type ProviderReadinessCapability,
  type ProviderReadinessProvider,
  type ProviderReadinessSummaryRow,
} from "../_lib/providerReadiness";
import {
  buildCreatorMoneyAuditEvents,
  readCreatorMoneyAuditSourceRows,
  type MoneyAuditEvent,
  type MoneyAuditSourceRow,
} from "../_lib/moneyAuditEvents";
import { getRevenueCatProductionReadiness } from "../_lib/revenuecat";
import {
  approveChannelAudienceRequest,
  blockChannelAudienceMember,
  cancelChannelAudienceRequest,
  declineChannelAudienceRequest,
  getChannelSubscriberRelationshipActionSupport,
  removeChannelFollower,
  unblockChannelAudienceMember,
  type ChannelAudienceActionResult,
  type ChannelAudienceActionStatus,
} from "../_lib/channelAudience";
import { useSession } from "../_lib/session";
import {
  readCreatorPermissions,
  sanitizeCreatorRoomAccessRule,
  type CreatorPermissionSet,
} from "../_lib/monetization";
import {
  hasPlatformRoleMembership,
  hasPlatformStaffPermission,
  readMyPlatformRoleMemberships,
  type PlatformRoleMembership,
} from "../_lib/moderation";
import { LIVE_REPLAY_ACKNOWLEDGEMENT } from "../_lib/legalPolicies";
import {
  createCreatorEvent,
  updateCreatorEvent,
  type CreatorEventReplayPolicy,
  type CreatorEventStatus,
  type CreatorEventSummary,
  type CreatorEventType,
} from "../_lib/liveEvents";
import {
  deleteCreatorVideo,
  formatCreatorVideoFileSize,
  getCreatorVideoStorageLimitMessage,
  getCreatorVideoTooLargeMessage,
  isCreatorVideoFileOverChannelMovieLimit,
  readCreatorVideoForOwner,
  readCreatorVideoForPlayer,
  readCreatorVideos,
  updateCreatorVideoMetadata,
  uploadCreatorVideo,
  type CreatorVideo,
  type CreatorVideoFile,
  type CreatorVideoVisibility,
} from "../_lib/creatorVideos";
import {
  CLIP_STUDIO_SUBTITLE_OVERLAY_MAX_LENGTH,
  CLIP_STUDIO_TITLE_OVERLAY_MAX_LENGTH,
  formatClipStudioFormatLabel,
  formatClipStudioTemplateLabel,
  getClipStudioCoverValidationMessage,
  getClipStudioTemplatePresetConfig,
  getClipStudioTitleOverlayValidationMessage,
  normalizeClipStudioFitMode,
  normalizeClipStudioFormat,
  normalizeClipStudioOverlayPosition,
  normalizeClipStudioOverlayStyle,
  normalizeClipStudioTemplatePreset,
  readClipStudioEdit,
  readClipStudioEditsForVideos,
  saveClipStudioEdit,
  uploadClipStudioCoverImage,
  type ClipStudioCoverUpload,
  type ClipStudioEdit,
  type ClipStudioEditPatch,
  type ClipStudioFitMode,
  type ClipStudioFormat,
  type ClipStudioOverlayPosition,
  type ClipStudioOverlayStyle,
  type ClipStudioTemplatePreset,
} from "../_lib/clipStudio";
import {
  formatPlatformBrandAssetStatus,
  formatPlatformBrandFileSize,
  getPlatformBrandAssetValidationMessage,
  normalizePlatformBrandFitMode,
  normalizePlatformBrandThemePreset,
  readPlatformBrandReviewQueue,
  publishPlatformBrandProfile,
  readPlatformBrandStudio,
  removePlatformBrandAsset,
  reviewPlatformBrandAsset,
  savePlatformBrandProfileDraft,
  uploadPlatformBrandAsset,
  type PlatformBrandAsset,
  type PlatformBrandAssetFile,
  type PlatformBrandAssetType,
  type PlatformBrandFitMode,
  type PlatformBrandReviewAction,
  type PlatformBrandingBundle,
  type PlatformBrandProfile,
  type PlatformBrandThemePreset,
} from "../_lib/platformBranding";
import {
  readCreatorEventReminderSummaries,
  type CreatorEventReminderSummary,
} from "../_lib/notifications";
import type { UserChannelRole, UserProfile } from "../_lib/userData";
import { normalizeUserProfile, readUserProfile, saveUserProfile } from "../_lib/userData";
import { CreatorVideoCard } from "../components/creator-media/creator-video-card";
import { BetaAccessScreen } from "../components/system/beta-access-screen";

const SKYLINE_SOURCE = require("../assets/images/chicago-skyline.jpg");

type ChannelSettingsSectionStatus = "current" | "near_term" | "later_phase";

type ChannelSettingsSectionModel = {
  title: string;
  status: ChannelSettingsSectionStatus;
  body: string;
};

type ChannelSettingsSectionGroup = {
  title: string;
  body: string;
  sections: readonly ChannelSettingsSectionModel[];
};

type ChannelAccessSummaryDetail = {
  label: string;
  value: string;
  body: string;
};

type SummaryMetricCard = {
  label: string;
  value: string;
  body: string;
  tone?: "default" | "unavailable";
};

type StudioTabId = "home" | "content" | "clip" | "live" | "audience" | "monetization" | "moderation" | "insights" | "brand";
type ContentStatusFilter = "all" | "published" | "drafts";
type ContentSortId = "newest" | "oldest";
type CreatorAnalyticsMetricKey = keyof CreatorAnalyticsReadModel["dataStatus"];
type VideoLifecycleState = "idle" | "file_selected" | "uploading" | "succeeded" | "failed";
type ClipStudioSaveState =
  | "idle"
  | "selecting_video"
  | "video_selected"
  | "selecting_cover"
  | "ready_to_save"
  | "saving"
  | "saved"
  | "save_failed"
  | "retrying";
type StudioHomeSectionId = "create" | "live" | "audience" | "monetization" | "moderation" | "insights" | "brand";
type MonetizationSectionId =
  | "overview"
  | "digital_sales"
  | "tips"
  | "watch_party_seats"
  | "paid_content"
  | "merch"
  | "balance"
  | "payouts"
  | "tax_legal"
  | "providers"
  | "future"
  | "technical";
type BrandStudioSectionId = "hero" | "background" | "brandKit" | "theme" | "scenePresets" | "review" | "preview" | "defaults";
type ClipStudioSectionId = "media" | "cover" | "title" | "templates" | "format" | "brand" | "save" | "advanced";

const createPayoutSetupRedirectUrl = (status: "return" | "refresh") => (
  `chillywoodmobile://channel-studio?tab=monetization&focus=payouts&payout_setup=${status}`
);

type ChannelEventEditorState = {
  editingEventId: string | null;
  eventTitle: string;
  eventType: CreatorEventType;
  status: CreatorEventStatus;
  startsAt: string;
  endsAt: string;
  linkedTitleId: string;
  replayPolicy: CreatorEventReplayPolicy;
  replayAvailableAt: string;
  replayExpiresAt: string;
  reminderReady: boolean;
};

type ChannelVideoEditorState = {
  editingVideoId: string | null;
  title: string;
  description: string;
  thumbUrl: string;
  visibility: CreatorVideoVisibility;
};

type ClipStudioEditorState = {
  editingVideoId: string | null;
  title: string;
  description: string;
  visibility: CreatorVideoVisibility;
  videoPreviewUrl: string;
  clipFormat: ClipStudioFormat;
  fitMode: ClipStudioFitMode;
  trimStartMs: string;
  trimEndMs: string;
  coverStoragePath: string | null;
  coverMimeType: string | null;
  coverFileSizeBytes: number | null;
  coverPreviewUrl: string;
  titleOverlayText: string;
  titleOverlaySubtitle: string;
  titleOverlayPosition: ClipStudioOverlayPosition;
  titleOverlayStyle: ClipStudioOverlayStyle;
  templatePreset: ClipStudioTemplatePreset;
  brandMarkEnabled: boolean;
  brandAssetId: string | null;
};

const createEmptyEventEditorState = (): ChannelEventEditorState => ({
  editingEventId: null,
  eventTitle: "",
  eventType: "live_first",
  status: "draft",
  startsAt: "",
  endsAt: "",
  linkedTitleId: "",
  replayPolicy: "none",
  replayAvailableAt: "",
  replayExpiresAt: "",
  reminderReady: false,
});

const createEmptyVideoEditorState = (): ChannelVideoEditorState => ({
  editingVideoId: null,
  title: "",
  description: "",
  thumbUrl: "",
  visibility: "draft",
});

const createEmptyClipStudioEditorState = (): ClipStudioEditorState => ({
  editingVideoId: null,
  title: "",
  description: "",
  visibility: "draft",
  videoPreviewUrl: "",
  clipFormat: "vertical_9_16",
  fitMode: "fill",
  trimStartMs: "",
  trimEndMs: "",
  coverStoragePath: null,
  coverMimeType: null,
  coverFileSizeBytes: null,
  coverPreviewUrl: "",
  titleOverlayText: "",
  titleOverlaySubtitle: "",
  titleOverlayPosition: "bottom",
  titleOverlayStyle: "clean",
  templatePreset: "highlight",
  brandMarkEnabled: false,
  brandAssetId: null,
});

const logCreatorVideoUploadUi = (event: string, details?: Record<string, unknown>) => {
  if (!__DEV__) return;
  console.log("[creator-video-upload-ui]", event, details ?? {});
};

const logClipStudioUi = (event: string, details?: Record<string, unknown>) => {
  if (!__DEV__) return;
  console.log("[clip-studio-ui]", event, details ?? {});
};

const SUPPORTED_CREATOR_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
]);

const SUPPORTED_CREATOR_VIDEO_EXTENSIONS = new Set(["mp4", "mov", "webm", "m4v"]);

const isSupportedCreatorVideoFile = (file: CreatorVideoFile) => {
  const mimeType = String(file.mimeType ?? "").trim().toLowerCase();
  const extension = String(file.name ?? "").trim().toLowerCase().split(".").pop() ?? "";
  const hasSupportedMimeType = SUPPORTED_CREATOR_VIDEO_MIME_TYPES.has(mimeType) || mimeType.startsWith("video/");
  const hasSupportedExtension = SUPPORTED_CREATOR_VIDEO_EXTENSIONS.has(extension);

  if (hasSupportedMimeType || hasSupportedExtension) return !!file.uri;
  if (!mimeType && !extension) return !!file.uri;

  return false;
};

const formatCreatorVideoUiError = (error: unknown, fallback: string, fileSize?: number | null) => {
  const rawMessage = error instanceof Error ? error.message : String(error ?? "");
  const message = rawMessage.trim().toLowerCase();

  if (!message) return fallback;
  if (message.includes("too large") || message.includes("maximum") || message.includes("exceeded")) {
    return getCreatorVideoStorageLimitMessage(fileSize);
  }
  if (message.includes("network") || message.includes("fetch")) {
    return "Network trouble interrupted creator videos. Check your connection and try again.";
  }
  if (message.includes("sign in") || message.includes("session") || message.includes("auth")) {
    return "Sign in again before saving this clip.";
  }
  if (message.includes("permission") || message.includes("denied") || message.includes("policy") || message.includes("rls")) {
    return "This account cannot complete that creator video action right now.";
  }
  if (message.includes("storage") || message.includes("bucket") || message.includes("upload")) {
    return "The video could not be saved to creator storage right now. Try again in a moment.";
  }
  if (message.includes("file") || message.includes("mime") || message.includes("unsupported")) {
    return "Choose an MP4, MOV, WebM, or M4V video file.";
  }

  return fallback;
};

const formatChannelRoomAccessValue = (value?: ChannelAccessResolution["watchPartyAccessRule"] | null) => {
  if (value === "party_pass") return "Party Pass";
  if (value === "premium") return "Premium";
  return "Public";
};

const formatRoomDefaultAccessLabel = (value: "open" | "party_pass" | "premium") => {
  if (value === "party_pass") return "Party Pass";
  if (value === "premium") return "Premium";
  return "Open";
};

const formatChannelRoleLabel = (value?: UserChannelRole | null) => {
  if (value === "creator") return "Creator";
  if (value === "host") return "Host";
  if (value === "viewer") return "Viewer";
  return "";
};

const formatJoinPolicyLabel = (value: "open" | "locked") => (value === "locked" ? "Locked" : "Open");
const formatReactionsPolicyLabel = (value: "enabled" | "muted") => (value === "muted" ? "Muted" : "Enabled");
const formatCapturePolicyLabel = (value: "best_effort" | "host_managed") => (
  value === "host_managed" ? "Host Managed" : "Best Effort"
);

const toDatetimeLocalValue = (value: string | null) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return normalized.slice(0, 16);
  const offset = parsed.getTimezoneOffset();
  return new Date(parsed.getTime() - offset * 60_000).toISOString().slice(0, 16);
};

const fromDatetimeLocalValue = (value: string) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? normalized : parsed.toISOString();
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

const formatEventStatusLabel = (value: CreatorEventStatus) => {
  switch (value) {
    case "live_now":
      return "Live Now";
    case "replay_available":
      return "Replay Available";
    default:
      return value.replaceAll("_", " ").replace(/\b\w/g, (match) => match.toUpperCase());
  }
};

const formatReplayPolicyLabel = (value: CreatorEventReplayPolicy) => {
  switch (value) {
    case "indefinite":
      return "Replay Kept";
    case "until_expiration":
      return "Replay Until Expiration";
    default:
      return "No Replay";
  }
};

const formatReminderLabel = (event: CreatorEventSummary) => {
  switch (event.reminder.reason) {
    case "ready":
      return "Reminder Ready";
    case "missing_start_time":
      return "Start Time Needed";
    default:
      return event.status === "scheduled" ? "Reminder Off" : "Not Scheduled";
  }
};

const formatReplayStateLabel = (event: CreatorEventSummary) => {
  if (event.replay.policy === "none") return "No Replay";
  if (event.replay.isReplayExpired) return "Replay Expired";
  if (event.replay.isReplayAvailableNow) return "Replay Available";
  return "Replay Pending";
};

const getChannelAccessSummaryBody = (resolution: ChannelAccessResolution | null) => {
  if (!resolution || resolution.renderState === "loading" || resolution.reason === "missing_channel_context") {
    return "Checking saved defaults and creator grants.";
  }
  if (resolution.reason === "channel_defaults_subscriber") {
    return "Both defaults are gated, so public platform copy should prepare visitors for member-style access.";
  }
  if (resolution.reason === "channel_defaults_private") {
    return "Watch-party entry is locked by default, so private room behavior should stay explicit on public surfaces.";
  }
  if (resolution.reason === "channel_defaults_mixed") {
    return "This Platform mixes open and gated defaults, so access changes need to stay visible on public surfaces.";
  }
  return "This Platform currently defaults to open communication and open watch-party access.";
};

const formatCount = (value: number | null) => value === null ? "Unavailable" : String(value);
const formatBooleanStatus = (value: boolean) => value ? "Enabled" : "Unavailable";
const formatVisibilitySurface = (value: boolean | null) => value == null ? "Unavailable" : value ? "Visible" : "Hidden";
const formatPublicActivityVisibility = (value: ChannelAudienceReadModel["publicActivityVisibility"]) => {
  switch (value) {
    case "public":
      return "Public";
    case "followers_only":
      return "Followers Only";
    case "subscribers_only":
      return "Subscribers Only";
    case "private":
      return "Private";
    default:
      return "Unavailable";
  }
};

const formatChannelLayoutPresetLabel = (value?: UserProfile["channelLayoutPreset"] | null) => {
  switch (value) {
    case "live_first":
      return "Live First";
    case "library_first":
      return "Library First";
    default:
      return "Spotlight";
  }
};

const getChannelLayoutPresetBody = (value?: UserProfile["channelLayoutPreset"] | null) => {
  switch (value) {
    case "live_first":
      return "The public platform home leads with live presence first.";
    case "library_first":
      return "The public platform home leads with content/library context first.";
    default:
      return "The public platform home keeps the featured spotlight first.";
  }
};

const formatBrandThemeLabel = (value?: PlatformBrandThemePreset | null) => {
  const option = BRAND_THEME_OPTIONS.find((item) => item.id === value);
  return option?.label ?? "City Night";
};

const formatPlatformBrandAssetTypeLabel = (value?: PlatformBrandAssetType | null) => {
  switch (value) {
    case "background_image":
      return "Background";
    case "avatar":
      return "Platform Avatar";
    case "logo":
      return "Logo Mark";
    case "hero_video":
      return "Hero Reel";
    case "hero_poster":
      return "Hero Poster";
    case "watermark":
      return "Watermark";
    default:
      return "Hero Image";
  }
};

const getBrandAssetReviewCopy = (asset?: PlatformBrandAsset | null) => {
  if (!asset) return "No asset selected yet.";
  if (asset.assetState === "published" && ["clean", "reported"].includes(asset.moderationStatus)) {
    return "Published on the public Platform.";
  }
  if (asset.assetState === "draft" && ["clean", "reported"].includes(asset.moderationStatus)) {
    return "Approved. Publish changes to show it on the public Platform.";
  }
  if (asset.moderationStatus === "pending_review") {
    return "Saved as draft and waiting for review before public display.";
  }
  if (asset.moderationStatus === "rejected" || asset.moderationStatus === "hidden" || asset.moderationStatus === "removed") {
    return "This asset needs changes before it can appear publicly.";
  }
  return "Ready to publish when you publish Brand Studio changes.";
};

const getPlatformBrandHeroSource = (bundle?: PlatformBrandingBundle | null) => {
  const heroImage = bundle?.heroImage?.signedUrl;
  const heroPoster = bundle?.heroPoster?.signedUrl;
  return heroImage || heroPoster || "";
};

const formatIsoDate = (value: string | null) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "Unavailable";
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? normalized : parsed.toLocaleString();
};

const formatAudienceActionLabel = (value: ChannelAudienceActionResult["action"]) => {
  switch (value) {
    case "approve_request":
      return "Approve Request";
    case "decline_request":
      return "Decline Request";
    case "cancel_request":
      return "Cancel Request";
    case "block":
      return "Block Audience Member";
    case "unblock":
      return "Unblock Audience Member";
    case "remove_follower":
      return "Remove Follower";
    case "follow":
      return "Follow Platform";
    case "unfollow":
      return "Unfollow Platform";
    case "subscriber_relationship_mutation":
      return "Subscriber Relationship";
    default:
      return value.replaceAll("_", " ").replace(/\b\w/g, (match: string) => match.toUpperCase());
  }
};

const formatAudienceActionStatus = (value: ChannelAudienceActionStatus) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (match: string) => match.toUpperCase());
const formatReadModelStatusValue = (value: Exclude<ChannelReadModelFieldStatus, "available">) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (match: string) => match.toUpperCase());

const getCreatorFacingPayoutSetupLabel = (summary: CreatorPayoutDashboardReadModel) => {
  if (summary.setupStatus === "provider_not_configured") return "Setup required";
  if (summary.setupStatus === "payouts_disabled") return "Not active";
  return summary.setupStatusLabel;
};

const getCreatorFacingPayoutSetupBody = (summary: CreatorPayoutDashboardReadModel) => {
  switch (summary.setupStatus) {
    case "provider_not_configured":
      return "Payout setup is not available yet.";
    case "setup_required":
      return "Connect a payout method when setup is available. Payouts are still not active.";
    case "onboarding_in_progress":
      return "Continue payout setup. Withdrawals remain inactive.";
    case "action_required":
      return "More payout setup information is needed before readiness can be reviewed.";
    case "under_review":
      return "Provider or platform review is pending. No payout action is available.";
    case "provider_ready_payouts_not_active":
      return "Payout setup is ready, but withdrawals are not active yet.";
    case "on_hold":
      return "A policy or review hold is active. No payout action is available.";
    case "payouts_disabled":
      return "Payouts are unavailable. No payout action is available.";
    default:
      return "Creator payouts are not active yet.";
  }
};

const formatStudioSectionStatusLabel = (status: ChannelSettingsSectionStatus) => {
  if (status === "current") return "CURRENT";
  if (status === "near_term") return "COMING SOON";
  return "COMING LATER";
};

const analyticsUnavailableMetricDefinitions: readonly {
  key: CreatorAnalyticsMetricKey;
  label: string;
  missingBody: string;
  laterBody: string;
}[] = [
  {
    key: "profileVisits",
    label: "Profile Visits",
    missingBody: "Profile analytics are in scope, but no honest aggregate read path exists yet.",
    laterBody: "Profile/Platform opens are not treated as creator analytics yet.",
  },
  {
    key: "liveAttendanceTotal",
    label: "Live Attendance",
    missingBody: "Attendance totals still need real aggregate backing before they can be shown.",
    laterBody: "This stays later until live attendance aggregates are supported.",
  },
  {
    key: "contentLaunches",
    label: "Content Launches",
    missingBody: "Creator-facing content-performance aggregates are not backed yet.",
    laterBody: "This stays later until creator content-performance aggregates are supported.",
  },
  {
    key: "continueWatchingReturns",
    label: "Continue Watching Returns",
    missingBody: "The repo does not aggregate return behavior honestly yet.",
    laterBody: "Continue-watching return analytics belong to a later aggregate layer.",
  },
  {
    key: "gatedSurfaceViews",
    label: "Gated Surface Views",
    missingBody: "Access events are emitted, but not yet aggregated into creator-facing conversion reporting.",
    laterBody: "Conversion-style gate views stay later until a real creator conversion read model exists.",
  },
];

const STUDIO_TABS: readonly { id: StudioTabId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "content", label: "Content" },
  { id: "clip", label: "Clip" },
  { id: "monetization", label: "Monetization" },
  { id: "live", label: "Live" },
  { id: "audience", label: "Audience" },
  { id: "moderation", label: "Moderation" },
  { id: "insights", label: "Insights" },
  { id: "brand", label: "Brand" },
];

const CONTENT_STATUS_FILTERS: readonly { id: ContentStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "published", label: "Published" },
  { id: "drafts", label: "Drafts" },
];

const CONTENT_SORT_OPTIONS: readonly { id: ContentSortId; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "oldest", label: "Oldest" },
];

const CLIP_FORMAT_OPTIONS: readonly { id: ClipStudioFormat; label: string; body: string }[] = [
  { id: "vertical_9_16", label: "Vertical 9:16", body: "Best for phone-first clips and Platform previews." },
  { id: "square_1_1", label: "Square 1:1", body: "Compact framing for feeds and cards." },
  { id: "landscape_16_9", label: "Landscape 16:9", body: "Classic widescreen for long-form uploads." },
];

const CLIP_FIT_OPTIONS: readonly { id: ClipStudioFitMode; label: string }[] = [
  { id: "fill", label: "Fill" },
  { id: "fit", label: "Fit" },
  { id: "center", label: "Center" },
];

const CLIP_OVERLAY_POSITION_OPTIONS: readonly { id: ClipStudioOverlayPosition; label: string }[] = [
  { id: "top", label: "Top" },
  { id: "center", label: "Center" },
  { id: "bottom", label: "Bottom" },
];

const CLIP_OVERLAY_STYLE_OPTIONS: readonly { id: ClipStudioOverlayStyle; label: string }[] = [
  { id: "clean", label: "Clean" },
  { id: "bold", label: "Bold" },
  { id: "spotlight", label: "Spotlight" },
  { id: "trailer", label: "Trailer" },
];

const CLIP_TEMPLATE_OPTIONS: readonly { id: ClipStudioTemplatePreset; label: string; body: string }[] = [
  { id: "trailer", label: "Trailer", body: "Trailer style, centered title, landscape frame." },
  { id: "highlight", label: "Highlight", body: "Clean style, bottom title, vertical frame." },
  { id: "promo", label: "Promo", body: "Bold style, bottom title, vertical frame." },
  { id: "event", label: "Event", body: "Spotlight style, top title, landscape frame." },
  { id: "reaction", label: "Reaction", body: "Clean style, bottom title, fit preview." },
  { id: "platform_intro", label: "Platform Intro", body: "Spotlight style, centered title, square frame." },
];

const BRAND_FIT_OPTIONS: readonly { id: PlatformBrandFitMode; label: string }[] = [
  { id: "fill", label: "Fill" },
  { id: "fit", label: "Fit" },
  { id: "center", label: "Center" },
];

const BRAND_THEME_OPTIONS: readonly { id: PlatformBrandThemePreset; label: string; body: string }[] = [
  { id: "city_night", label: "City Night", body: "Dark skyline, soft crimson, readable overlays." },
  { id: "studio_red", label: "Studio Red", body: "Stronger Chi'llwood accent for launches." },
  { id: "clean_dark", label: "Clean Dark", body: "Quiet, minimal, and content-first." },
  { id: "spotlight", label: "Spotlight", body: "Hero-forward with a stronger stage dim." },
  { id: "classic", label: "Classic", body: "Simple dark platform presentation." },
];

const BRAND_ACCENT_OPTIONS: readonly { label: string; value: string }[] = [
  { label: "Crimson", value: "#DC143C" },
  { label: "Sky", value: "#7ED7FF" },
  { label: "Gold", value: "#F2C25B" },
  { label: "Mint", value: "#70D3A6" },
];

const BRAND_OVERLAY_OPTIONS: readonly { label: string; value: number }[] = [
  { label: "Light", value: 0.42 },
  { label: "Soft", value: 0.62 },
  { label: "Strong", value: 0.78 },
];

const BRAND_BLUR_OPTIONS: readonly { label: string; value: number }[] = [
  { label: "Off", value: 0 },
  { label: "Soft", value: 0.35 },
  { label: "Strong", value: 0.7 },
];

const normalizeStudioTabId = (value: unknown): StudioTabId | null => {
  const normalized = String(Array.isArray(value) ? value[0] : value ?? "").trim().toLowerCase();
  if (normalized === "monetize" || normalized === "payouts" || normalized === "revenue") {
    return "monetization";
  }
  if (
    normalized === "home"
    || normalized === "content"
    || normalized === "clip"
    || normalized === "live"
    || normalized === "audience"
    || normalized === "monetization"
    || normalized === "moderation"
    || normalized === "insights"
    || normalized === "brand"
  ) {
    return normalized;
  }
  return null;
};

const normalizeMonetizationSectionId = (value: unknown): MonetizationSectionId | null => {
  const normalized = String(Array.isArray(value) ? value[0] : value ?? "").trim().toLowerCase();
  if (normalized === "monetize" || normalized === "status" || normalized === "overview") return "overview";
  if (
    normalized === "premium"
    || normalized === "subscriptions"
    || normalized === "subscription"
    || normalized === "digital"
    || normalized === "digital-sales"
    || normalized === "digital_sales"
    || normalized === "sales"
  ) return "digital_sales";
  if (normalized === "tips" || normalized === "tip") return "tips";
  if (
    normalized === "watch-party-seats"
    || normalized === "watch_party_seats"
    || normalized === "watch-party-seat"
    || normalized === "watch_party_seat"
    || normalized === "seats"
    || normalized === "seat"
  ) return "watch_party_seats";
  if (
    normalized === "paid-content"
    || normalized === "paid_content"
    || normalized === "paid"
    || normalized === "content-sales"
    || normalized === "content_sales"
  ) return "paid_content";
  if (
    normalized === "merch"
    || normalized === "merchandise"
    || normalized === "commerce"
    || normalized === "platform-commerce"
    || normalized === "platform_commerce"
  ) return "merch";
  if (
    normalized === "revenue"
    || normalized === "earnings"
    || normalized === "balance"
    || normalized === "balances"
    || normalized === "creator-balance"
    || normalized === "creator_balance"
  ) return "balance";
  if (
    normalized === "payout"
    || normalized === "payouts"
    || normalized === "stripe"
    || normalized === "connect"
    || normalized === "stripe-setup"
    || normalized === "stripe_setup"
  ) return "payouts";
  if (
    normalized === "tax"
    || normalized === "legal"
    || normalized === "tax-legal"
    || normalized === "tax_legal"
    || normalized === "kyc"
  ) return "tax_legal";
  if (
    normalized === "store"
    || normalized === "google"
    || normalized === "revenuecat"
    || normalized === "google-play"
    || normalized === "google_play"
    || normalized === "provider"
    || normalized === "providers"
    || normalized === "provider-status"
    || normalized === "provider_status"
  ) {
    return "providers";
  }
  if (normalized === "future" || normalized === "tools") return "future";
  if (normalized === "technical" || normalized === "checks") return "technical";
  return null;
};

const createInitialMonetizationSections = (tab: unknown, focus: unknown) => {
  const sections = new Set<MonetizationSectionId>(["overview"]);
  const routedSection = normalizeMonetizationSectionId(tab) ?? normalizeMonetizationSectionId(focus);
  if (routedSection) sections.add(routedSection);
  return sections;
};

const getCreatorVideoCreatedTimestamp = (video: CreatorVideo) => {
  const timestamp = Date.parse(video.createdAt || video.updatedAt);
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const hasPlayableCreatorVideoSource = (video: CreatorVideo) => !!(video.playbackUrl || video.storagePath);

const getVideoLifecycleCopy = (input: {
  editingVideoId: string | null;
  selectedFile: CreatorVideoFile | null;
  titleReady: boolean;
  saving: boolean;
  lifecycleState: VideoLifecycleState;
  notice: string | null;
}) => {
  if (input.saving && input.editingVideoId) {
    return {
      label: "Saving Metadata",
      body: "Updating backed title, description, thumbnail URL, or visibility.",
      tone: "active" as const,
    };
  }

  if (input.saving) {
    return {
      label: "Uploading...",
      body: "Saving the selected file to creator storage. Percent progress is not backed yet.",
      tone: "active" as const,
    };
  }

  if (input.editingVideoId) {
    return {
      label: "Editing Metadata",
      body: "Existing media stays in place. This edits backed metadata and visibility only.",
      tone: "ready" as const,
    };
  }

  if (input.lifecycleState === "succeeded") {
    return {
      label: "Upload Succeeded",
      body: "The video was saved to creator storage and added to your platform library.",
      tone: "success" as const,
    };
  }

  if (input.lifecycleState === "failed") {
    return {
      label: "Upload Failed",
      body: input.notice || "The last file or upload action failed locally. Nothing was published automatically.",
      tone: "error" as const,
    };
  }

  if (input.selectedFile) {
    const sizeLabel = formatCreatorVideoFileSize(input.selectedFile.size);
    const fileLabel = input.selectedFile.name || "video file";
    return {
      label: input.titleReady ? "Ready To Upload" : "File Selected",
      body: input.titleReady
        ? `${fileLabel}${sizeLabel ? ` (${sizeLabel})` : ""} is selected. Upload will use the visibility you choose below.`
        : `${fileLabel}${sizeLabel ? ` (${sizeLabel})` : ""} is selected. Add a title before uploading.`,
      tone: input.titleReady ? "ready" as const : "idle" as const,
    };
  }

  return {
    label: "No File Selected",
    body: "Choose an MP4, MOV, WebM, or M4V file before uploading.",
    tone: "idle" as const,
  };
};

export function ChannelStudioScreen() {
  const router = useRouter();
  const routeParams = useLocalSearchParams<{ tab?: string; focus?: string; action?: string }>();
  const { isLoading: authLoading, isSignedIn, user } = useSession();
  const { accessState, isLoading: betaLoading, isActive } = useBetaProgram();
  const routeAction = String(Array.isArray(routeParams.action) ? routeParams.action[0] : routeParams.action ?? "").trim();
  const initialStudioTab = normalizeStudioTabId(routeParams.tab)
    ?? normalizeStudioTabId(routeParams.focus)
    ?? (routeAction === "clip" || routeAction === "create-clip" ? "clip" : null)
    ?? (routeAction === "upload" ? "content" : null)
    ?? "home";
  const [activeStudioTab, setActiveStudioTab] = useState<StudioTabId>(initialStudioTab);
  const [expandedHomeSections, setExpandedHomeSections] = useState<ReadonlySet<StudioHomeSectionId>>(
    () => new Set<StudioHomeSectionId>(["create"]),
  );
  const [expandedMonetizationSections, setExpandedMonetizationSections] = useState<ReadonlySet<MonetizationSectionId>>(
    () => createInitialMonetizationSections(routeParams.tab, routeParams.focus),
  );
  const [expandedBrandSections, setExpandedBrandSections] = useState<ReadonlySet<BrandStudioSectionId>>(
    () => new Set<BrandStudioSectionId>(["hero"]),
  );
  const [expandedClipSections, setExpandedClipSections] = useState<ReadonlySet<ClipStudioSectionId>>(
    () => new Set<ClipStudioSectionId>(["media", "title", "templates", "save"]),
  );
  const [contentStatusFilter, setContentStatusFilter] = useState<ContentStatusFilter>("all");
  const [contentSearchQuery, setContentSearchQuery] = useState("");
  const [contentSort, setContentSort] = useState<ContentSortId>("newest");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [platformBranding, setPlatformBranding] = useState<PlatformBrandingBundle | null>(null);
  const [brandDraft, setBrandDraft] = useState<PlatformBrandProfile | null>(null);
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandNotice, setBrandNotice] = useState<string | null>(null);
  const [brandBusyAssetType, setBrandBusyAssetType] = useState<PlatformBrandAssetType | null>(null);
  const [brandReviewReason, setBrandReviewReason] = useState("");
  const [brandReviewBusyAssetId, setBrandReviewBusyAssetId] = useState<string | null>(null);
  const [brandReviewQueueAssets, setBrandReviewQueueAssets] = useState<PlatformBrandAsset[]>([]);
  const [brandReviewQueueLoading, setBrandReviewQueueLoading] = useState(false);
  const [platformRoleMemberships, setPlatformRoleMemberships] = useState<PlatformRoleMembership[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsEnabled, setSettingsEnabled] = useState(true);
  const [appDisplayName, setAppDisplayName] = useState(DEFAULT_APP_CONFIG.branding.appDisplayName);
  const [uploadsEnabled, setUploadsEnabled] = useState(DEFAULT_APP_CONFIG.runtimeControls.uploads_enabled);
  const [creatorPostingEnabled, setCreatorPostingEnabled] = useState(
    DEFAULT_APP_CONFIG.runtimeControls.creator_posting_enabled,
  );
  const [maxUploadSizeMb, setMaxUploadSizeMb] = useState(
    DEFAULT_APP_CONFIG.runtimeControls.max_upload_size_mb,
  );
  const [creatorPermissions, setCreatorPermissions] = useState<CreatorPermissionSet | null>(null);
  const [audienceSummary, setAudienceSummary] = useState<ChannelAudienceReadModel | null>(null);
  const [safetyAdminSummary, setSafetyAdminSummary] = useState<ChannelSafetyAdminReadModel | null>(null);
  const [creatorAnalyticsSummary, setCreatorAnalyticsSummary] = useState<CreatorAnalyticsReadModel | null>(null);
  const [creatorPayoutSummary, setCreatorPayoutSummary] = useState<CreatorPayoutDashboardReadModel>(
    createEmptyCreatorPayoutDashboardReadModel,
  );
  const [creatorMonetizationSummary, setCreatorMonetizationSummary] =
    useState<CreatorMonetizationFoundationSummary | null>(null);
  const [creatorMoneyAuditSourceRows, setCreatorMoneyAuditSourceRows] = useState<MoneyAuditSourceRow[]>([]);
  const [selectedCreatorMoneyAuditEvent, setSelectedCreatorMoneyAuditEvent] = useState<MoneyAuditEvent | null>(null);
  const [providerReadinessSummary, setProviderReadinessSummary] = useState<ProviderReadinessSummaryRow[]>(
    getProviderReadinessFallbackSummary,
  );
  const [moneyFeatureFlags, setMoneyFeatureFlags] = useState<MoneyFeatureFlagSummaryRow[]>(
    getMoneyFeatureFlagFallbackSummary,
  );
  const [payoutSetupBusy, setPayoutSetupBusy] = useState<"setup" | "sync" | null>(null);
  const [payoutSetupNotice, setPayoutSetupNotice] = useState<string | null>(null);
  const [channelAccessResolution, setChannelAccessResolution] = useState<ChannelAccessResolution | null>(null);
  const [creatorEvents, setCreatorEvents] = useState<CreatorEventSummary[]>([]);
  const [creatorVideos, setCreatorVideos] = useState<CreatorVideo[]>([]);
  const [creatorVideoClipEdits, setCreatorVideoClipEdits] = useState<Record<string, ClipStudioEdit>>({});
  const [creatorReminderSummaries, setCreatorReminderSummaries] = useState<CreatorEventReminderSummary[]>([]);
  const [audienceActionNotice, setAudienceActionNotice] = useState<string | null>(null);
  const [audienceActionResult, setAudienceActionResult] = useState<ChannelAudienceActionResult | null>(null);
  const [audienceActionLoading, setAudienceActionLoading] = useState<ChannelAudienceActionResult["action"] | null>(null);
  const [audienceRequestIdInput, setAudienceRequestIdInput] = useState("");
  const [audienceFollowerUserIdInput, setAudienceFollowerUserIdInput] = useState("");
  const [audienceTargetUserIdInput, setAudienceTargetUserIdInput] = useState("");
  const [audienceBlockReasonInput, setAudienceBlockReasonInput] = useState("");
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventSaving, setEventSaving] = useState(false);
  const [eventNotice, setEventNotice] = useState<string | null>(null);
  const [eventEditor, setEventEditor] = useState<ChannelEventEditorState>(createEmptyEventEditorState);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosLoadError, setVideosLoadError] = useState<string | null>(null);
  const [videoSaving, setVideoSaving] = useState(false);
  const [videoNotice, setVideoNotice] = useState<string | null>(null);
  const [videoEditor, setVideoEditor] = useState<ChannelVideoEditorState>(createEmptyVideoEditorState);
  const [selectedVideoFile, setSelectedVideoFile] = useState<CreatorVideoFile | null>(null);
  const [clipNotice, setClipNotice] = useState<string | null>(null);
  const [clipSaving, setClipSaving] = useState(false);
  const clipSaveInFlightRef = useRef(false);
  const [clipEditor, setClipEditor] = useState<ClipStudioEditorState>(createEmptyClipStudioEditorState);
  const [selectedClipVideoFile, setSelectedClipVideoFile] = useState<CreatorVideoFile | null>(null);
  const [selectedClipCoverFile, setSelectedClipCoverFile] = useState<CreatorVideoFile | null>(null);
  const [clipSaveState, setClipSaveState] = useState<ClipStudioSaveState>("idle");
  const [clipSavedVideoId, setClipSavedVideoId] = useState<string | null>(null);
  const [liveReplayAccepted, setLiveReplayAccepted] = useState(false);
  const [videoLifecycleState, setVideoLifecycleState] = useState<VideoLifecycleState>("idle");
  const liveReplayAcknowledgementRequired =
    eventEditor.replayPolicy !== "none"
    || eventEditor.status === "live_now"
    || eventEditor.status === "replay_available";
  const videoTitleReady = videoEditor.title.trim().length > 0;
  const videoSubmitRequirement = videoEditor.editingVideoId
    ? videoTitleReady
      ? ""
      : "Enter a title to update this video."
    : !selectedVideoFile
      ? "Choose a video file to enable upload."
      : videoTitleReady
        ? ""
        : "Enter a title to enable upload.";
  const isVideoSubmitDisabled = videoSaving || !!videoSubmitRequirement;
  const canUseChannelSettings = isSignedIn && isActive && !!user?.id;
  const canReviewPlatformBrandAssets = useMemo(
    () => hasPlatformRoleMembership(platformRoleMemberships, ["owner", "operator"])
      || hasPlatformStaffPermission(platformRoleMemberships, ["content_moderation", "reports_review"]),
    [platformRoleMemberships],
  );
  const canSeeMonetizationTechnicalChecks = useMemo(
    () => __DEV__ || hasPlatformRoleMembership(platformRoleMemberships, ["owner", "operator"]),
    [platformRoleMemberships],
  );
  const revenueCatReadiness = useMemo(() => getRevenueCatProductionReadiness(), []);
  const creatorMoneyAuditEvents = useMemo(() => buildCreatorMoneyAuditEvents({
    summary: creatorMonetizationSummary,
    sourceRows: creatorMoneyAuditSourceRows,
    providerRows: providerReadinessSummary,
    moneyFlags: moneyFeatureFlags,
    generatedAt: creatorMonetizationSummary?.generatedAt ?? new Date().toISOString(),
  }), [
    creatorMoneyAuditSourceRows,
    creatorMonetizationSummary,
    moneyFeatureFlags,
    providerReadinessSummary,
  ]);
  const blockedBetaCopy = getBetaAccessBlockCopy(accessState.status, "Platform Studio");
  const subscriberMutationSupport = getChannelSubscriberRelationshipActionSupport();
  const openStudioTab = (
    tab: StudioTabId,
    options?: { filter?: ContentStatusFilter; focus?: string },
  ) => {
    setActiveStudioTab(tab);
    if (options?.filter) setContentStatusFilter(options.filter);
    if (tab === "monetization") {
      const routedSection = normalizeMonetizationSectionId(options?.focus);
      if (routedSection) {
        setExpandedMonetizationSections((current) => new Set([...current, routedSection]));
      }
    }
    router.setParams({
      tab,
      focus: options?.focus ?? "",
    });
  };
  const showStudioUnavailable = (title: string, body: string) => {
    Alert.alert(title, body);
  };
  const toggleHomeSection = (id: StudioHomeSectionId) => {
    setExpandedHomeSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleMonetizationSection = (id: MonetizationSectionId) => {
    setExpandedMonetizationSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleBrandSection = (id: BrandStudioSectionId) => {
    setExpandedBrandSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleClipSection = (id: ClipStudioSectionId) => {
    setExpandedClipSections((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  useEffect(() => {
    const nextTab = normalizeStudioTabId(routeParams.tab)
      ?? normalizeStudioTabId(routeParams.focus)
      ?? (routeAction === "clip" || routeAction === "create-clip" ? "clip" : null)
      ?? (routeAction === "upload" ? "content" : null);
    if (nextTab) {
      setActiveStudioTab(nextTab);
    }
    const monetizationSection = normalizeMonetizationSectionId(routeParams.tab)
      ?? normalizeMonetizationSectionId(routeParams.focus);
    if (nextTab === "monetization" && monetizationSection) {
      setExpandedMonetizationSections((current) => new Set([...current, monetizationSection]));
    }
    if (routeAction === "upload") setContentStatusFilter("all");
  }, [routeAction, routeParams.focus, routeParams.tab]);

  useEffect(() => {
    if (!canUseChannelSettings) {
      setCreatorPayoutSummary(createEmptyCreatorPayoutDashboardReadModel());
      setCreatorMonetizationSummary(null);
      setCreatorMoneyAuditSourceRows([]);
      setSelectedCreatorMoneyAuditEvent(null);
      setProviderReadinessSummary(getProviderReadinessFallbackSummary());
      setMoneyFeatureFlags(getMoneyFeatureFlagFallbackSummary());
      setPayoutSetupNotice(null);
      setPlatformBranding(null);
      setBrandDraft(null);
      setPlatformRoleMemberships([]);
      setBrandReviewQueueAssets([]);
      setCreatorVideoClipEdits({});
      setLoading(false);
      return;
    }
    let active = true;

    Promise.all([
      readUserProfile(),
      readAppConfig().catch(() => DEFAULT_APP_CONFIG),
      readCreatorPermissions().catch(() => null),
      readChannelAudienceSummary(String(user?.id ?? "")).catch(() => null),
      readChannelSafetyAdminSummary(String(user?.id ?? "")).catch(() => null),
      readCreatorAnalyticsSummary(String(user?.id ?? "")).catch(() => null),
      readCreatorPayoutDashboardSummary({ creatorUserId: String(user?.id ?? ""), limit: 5 }),
      readCreatorMonetizationFoundationSummary(String(user?.id ?? "")).catch(() => null),
      readCreatorMoneyAuditSourceRows(String(user?.id ?? "")).catch(() => []),
      readProviderReadinessSummary().catch(getProviderReadinessFallbackSummary),
      readMoneyFeatureFlagSummary().catch(getMoneyFeatureFlagFallbackSummary),
      readPlatformBrandStudio(String(user?.id ?? "")).catch(() => null),
      readMyPlatformRoleMemberships().catch(() => []),
    ])
      .then(([
        resolvedProfile,
        resolvedConfig,
        resolvedPermissions,
        resolvedAudienceSummary,
        resolvedSafetyAdminSummary,
        resolvedCreatorAnalyticsSummary,
        resolvedCreatorPayoutSummary,
        resolvedCreatorMonetizationSummary,
        resolvedCreatorMoneyAuditSourceRows,
        resolvedProviderReadinessSummary,
        resolvedMoneyFeatureFlags,
        resolvedPlatformBranding,
        resolvedPlatformRoleMemberships,
      ]) => {
        if (!active) return;
        setProfile(normalizeUserProfile(resolvedProfile));
        setSettingsEnabled(resolveFeatureConfig(resolvedConfig).creatorSettingsEnabled);
        setAppDisplayName(resolveBrandingConfig(resolvedConfig).appDisplayName);
        setUploadsEnabled(resolvedConfig.runtimeControls.uploads_enabled);
        setCreatorPostingEnabled(resolvedConfig.runtimeControls.creator_posting_enabled);
        setMaxUploadSizeMb(resolvedConfig.runtimeControls.max_upload_size_mb);
        setCreatorPermissions(resolvedPermissions);
        setAudienceSummary(resolvedAudienceSummary);
        setSafetyAdminSummary(resolvedSafetyAdminSummary);
        setCreatorAnalyticsSummary(resolvedCreatorAnalyticsSummary);
        setCreatorPayoutSummary(resolvedCreatorPayoutSummary);
        setCreatorMonetizationSummary(resolvedCreatorMonetizationSummary);
        setCreatorMoneyAuditSourceRows(resolvedCreatorMoneyAuditSourceRows);
        setProviderReadinessSummary(resolvedProviderReadinessSummary);
        setMoneyFeatureFlags(resolvedMoneyFeatureFlags);
        setPlatformBranding(resolvedPlatformBranding);
        setBrandDraft(resolvedPlatformBranding?.profile ?? null);
        setPlatformRoleMemberships(resolvedPlatformRoleMemberships);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setProfile(normalizeUserProfile({ username: "", avatarIndex: 0 }));
        setUploadsEnabled(DEFAULT_APP_CONFIG.runtimeControls.uploads_enabled);
        setCreatorPostingEnabled(DEFAULT_APP_CONFIG.runtimeControls.creator_posting_enabled);
        setMaxUploadSizeMb(DEFAULT_APP_CONFIG.runtimeControls.max_upload_size_mb);
        setAudienceSummary(null);
        setSafetyAdminSummary(null);
        setCreatorAnalyticsSummary(null);
        setCreatorPayoutSummary(createEmptyCreatorPayoutDashboardReadModel());
        setCreatorMonetizationSummary(null);
        setCreatorMoneyAuditSourceRows([]);
        setSelectedCreatorMoneyAuditEvent(null);
        setProviderReadinessSummary(getProviderReadinessFallbackSummary());
        setMoneyFeatureFlags(getMoneyFeatureFlagFallbackSummary());
        setPlatformRoleMemberships([]);
        setBrandReviewQueueAssets([]);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canUseChannelSettings, user?.id]);

  const refreshCreatorPayouts = useCallback(async () => {
    if (!user?.id) {
      setCreatorPayoutSummary(createEmptyCreatorPayoutDashboardReadModel());
      return;
    }

    const nextSummary = await readCreatorPayoutDashboardSummary({
      creatorUserId: String(user.id),
      limit: 5,
    });
    setCreatorPayoutSummary(nextSummary);
  }, [user?.id]);

  const handleStartPayoutProviderSetup = useCallback(async () => {
    const creatorUserId = String(user?.id ?? "").trim();
    if (!creatorUserId || payoutSetupBusy) return;

    setPayoutSetupBusy("setup");
    setPayoutSetupNotice(null);

    try {
      const accountPayload = await createOrReuseCreatorPayoutProviderAccount(creatorUserId);
      if (accountPayload.status === "not_configured") {
        setPayoutSetupNotice("Payout setup is not available yet.");
        await refreshCreatorPayouts();
        return;
      }

      const linkPayload = await createCreatorPayoutOnboardingLink({
        creatorUserId,
        refreshUrl: createPayoutSetupRedirectUrl("refresh"),
        returnUrl: createPayoutSetupRedirectUrl("return"),
      });

      if (linkPayload.status === "not_configured" || linkPayload.status === "setup_required") {
        setPayoutSetupNotice(linkPayload.message || "Payout provider setup is not available yet.");
        await refreshCreatorPayouts();
        return;
      }

      const onboardingUrl = String(linkPayload.onboarding_url ?? "").trim();
      if (!onboardingUrl) {
        setPayoutSetupNotice("Payout setup did not return an onboarding link. Try again later.");
        await refreshCreatorPayouts();
        return;
      }

      const canOpen = await Linking.canOpenURL(onboardingUrl).catch(() => true);
      if (!canOpen) {
        setPayoutSetupNotice("Payout setup link could not be opened on this device.");
        await refreshCreatorPayouts();
        return;
      }

      await Linking.openURL(onboardingUrl);
      setPayoutSetupNotice("Payout setup opened. Withdrawals are not active yet.");
      await refreshCreatorPayouts();
    } catch {
      setPayoutSetupNotice("Payout setup could not be started. No payout or transfer was created.");
    } finally {
      setPayoutSetupBusy(null);
    }
  }, [payoutSetupBusy, refreshCreatorPayouts, user?.id]);

  const handleRefreshPayoutProviderStatus = useCallback(async () => {
    const creatorUserId = String(user?.id ?? "").trim();
    if (!creatorUserId || payoutSetupBusy) return;

    setPayoutSetupBusy("sync");
    setPayoutSetupNotice(null);

    try {
      const syncPayload = await syncCreatorPayoutProviderStatus(creatorUserId);
      setPayoutSetupNotice(
        syncPayload.message || "Payout provider status was checked. Withdrawals are not active yet.",
      );
      await refreshCreatorPayouts();
    } catch {
      setPayoutSetupNotice("Payout provider status could not be refreshed. No money action was created.");
    } finally {
      setPayoutSetupBusy(null);
    }
  }, [payoutSetupBusy, refreshCreatorPayouts, user?.id]);

  useEffect(() => {
    let active = true;

    if (!canUseChannelSettings || loading) {
      setChannelAccessResolution(null);
      return () => {
        active = false;
      };
    }

    void resolveChannelAccess({
      channelUserId: String(user?.id ?? ""),
      profile,
      creatorPermissions,
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
  }, [canUseChannelSettings, creatorPermissions, loading, profile, user?.id]);

  useEffect(() => {
    let active = true;

    if (!canUseChannelSettings) {
      setCreatorEvents([]);
      setCreatorReminderSummaries([]);
      setCreatorVideos([]);
      setCreatorVideoClipEdits({});
      setEventsLoading(false);
      setVideosLoading(false);
      return () => {
        active = false;
      };
    }

    setEventsLoading(true);

    void readCreatorEventReminderSummaries(String(user?.id ?? ""))
      .then((summaries) => {
        if (!active) return;
        setCreatorReminderSummaries(summaries);
        setCreatorEvents(summaries.map((summary) => summary.event));
        setEventsLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setCreatorEvents([]);
        setCreatorReminderSummaries([]);
        setEventsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canUseChannelSettings, user?.id]);

  useEffect(() => {
    let active = true;

    if (!canUseChannelSettings || !user?.id) {
      setCreatorVideos([]);
      setVideosLoadError(null);
      setVideosLoading(false);
      return () => {
        active = false;
      };
    }

    setVideosLoading(true);
    setVideosLoadError(null);
    void readCreatorVideos(String(user.id), { includeDrafts: true, limit: 50 })
      .then(async (videos) => {
        if (!active) return;
        setCreatorVideos(videos);
        const editMap = await readClipStudioEditsForVideos(videos.map((video) => video.id)).catch(() => new Map());
        if (!active) return;
        setCreatorVideoClipEdits(Object.fromEntries(editMap));
        setVideosLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setCreatorVideos([]);
        setCreatorVideoClipEdits({});
        setVideosLoadError("Unable to load creator videos right now. Check your connection and retry.");
        setVideosLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canUseChannelSettings, user?.id]);

  const updateProfile = (patch: Partial<UserProfile>) => {
    setProfile((prev) => normalizeUserProfile({ ...(prev ?? {}), ...patch }));
    setNotice(null);
  };

  const updateEventEditor = (patch: Partial<ChannelEventEditorState>) => {
    setEventEditor((prev) => ({ ...prev, ...patch }));
    setEventNotice(null);
  };

  const updateVideoEditor = (patch: Partial<ChannelVideoEditorState>) => {
    setVideoEditor((prev) => ({ ...prev, ...patch }));
    setVideoLifecycleState((current) => current === "succeeded" ? "idle" : current);
    setVideoNotice(null);
  };

  const markClipStudioDirty = (nextState: ClipStudioSaveState = "ready_to_save") => {
    setClipSaveState((current) => (
      current === "saving" || current === "retrying" ? current : nextState
    ));
    setClipSavedVideoId(null);
  };

  const updateClipEditor = (patch: Partial<ClipStudioEditorState>) => {
    setClipEditor((prev) => ({ ...prev, ...patch }));
    markClipStudioDirty();
    setClipNotice(null);
  };

  const applyClipTemplatePreset = (preset: ClipStudioTemplatePreset) => {
    const templateConfig = getClipStudioTemplatePresetConfig(preset);
    updateClipEditor({
      templatePreset: templateConfig.preset,
      titleOverlayStyle: templateConfig.titleOverlayStyle,
      titleOverlayPosition: templateConfig.titleOverlayPosition,
      clipFormat: templateConfig.clipFormat,
      fitMode: templateConfig.fitMode,
    });
    setExpandedClipSections((current) => new Set<ClipStudioSectionId>([...current, "title", "format"]));
    setClipNotice(`${formatClipStudioTemplateLabel(templateConfig.preset)} template selected. Preview updated.`);
  };

  const resetClipStudio = () => {
    clipSaveInFlightRef.current = false;
    setClipEditor(createEmptyClipStudioEditorState());
    setSelectedClipVideoFile(null);
    setSelectedClipCoverFile(null);
    setClipSaveState("idle");
    setClipSavedVideoId(null);
    setClipNotice(null);
  };

  const openClipStudioForNew = () => {
    const transferredFile = selectedVideoFile;
    setClipEditor({
      ...createEmptyClipStudioEditorState(),
      title: videoEditor.title,
      description: videoEditor.description,
      visibility: "draft",
    });
    setSelectedClipVideoFile(transferredFile);
    setSelectedClipCoverFile(null);
    setClipSaveState(transferredFile ? "video_selected" : "idle");
    setClipSavedVideoId(null);
    setClipNotice(
      transferredFile
        ? "Video moved into Clip Studio. Choose format, cover, and title metadata before saving."
        : "Choose a video to start a new Clip Studio draft.",
    );
    openStudioTab("clip", { focus: "create" });
  };

  const openClipStudioForVideo = (video: CreatorVideo) => {
    setClipEditor({
      ...createEmptyClipStudioEditorState(),
      editingVideoId: video.id,
      title: video.title,
      description: video.description,
      visibility: video.visibility,
      videoPreviewUrl: video.playbackUrl,
      coverStoragePath: video.thumbStoragePath || null,
      coverPreviewUrl: video.thumbnailUrl,
    });
    setSelectedClipVideoFile(null);
    setSelectedClipCoverFile(null);
    setClipSaveState("saved");
    setClipSavedVideoId(video.id);
    setClipNotice("Loading Clip Studio settings for this video...");
    openStudioTab("clip", { focus: "edit" });
    void Promise.all([
      readClipStudioEdit(video.id),
      readCreatorVideoForPlayer(video.id).catch(() => null),
    ])
      .then(([edit, previewVideo]) => {
        if (!edit) {
          setClipEditor((current) => ({
            ...current,
            videoPreviewUrl: previewVideo?.playbackUrl || current.videoPreviewUrl,
            coverPreviewUrl: previewVideo?.thumbnailUrl || current.coverPreviewUrl,
          }));
          setClipNotice("Clip Studio is ready. Existing videos keep their public state until you save or publish.");
          return;
        }
        setClipEditor((current) => ({
          ...current,
          videoPreviewUrl: previewVideo?.playbackUrl || current.videoPreviewUrl,
          clipFormat: edit.clipFormat,
          fitMode: edit.fitMode,
          trimStartMs: edit.trimStartMs == null ? "" : String(edit.trimStartMs),
          trimEndMs: edit.trimEndMs == null ? "" : String(edit.trimEndMs),
          coverStoragePath: edit.coverStoragePath,
          coverMimeType: edit.coverMimeType,
          coverFileSizeBytes: edit.coverFileSizeBytes,
          coverPreviewUrl: previewVideo?.thumbnailUrl || current.coverPreviewUrl,
          titleOverlayText: edit.titleOverlayText,
          titleOverlaySubtitle: edit.titleOverlaySubtitle,
          titleOverlayPosition: edit.titleOverlayPosition,
          titleOverlayStyle: edit.titleOverlayStyle,
          templatePreset: edit.templatePreset,
          brandMarkEnabled: edit.brandMarkEnabled,
          brandAssetId: edit.brandAssetId,
        }));
        setClipNotice("Clip Studio settings loaded.");
      })
      .catch(() => {
        setClipNotice("Clip Studio settings could not load. You can still edit this video safely.");
      });
  };

  const refreshAudienceSummary = async () => {
    if (!user?.id) {
      setAudienceSummary(null);
      return;
    }

    const nextSummary = await readChannelAudienceSummary(String(user.id)).catch(() => null);
    setAudienceSummary(nextSummary);
  };

  const runAudienceAction = async (
    action: ChannelAudienceActionResult["action"],
    execute: () => Promise<ChannelAudienceActionResult>,
  ) => {
    try {
      setAudienceActionLoading(action);
      setAudienceActionNotice(null);
      const result = await execute();
      setAudienceActionResult(result);
      setAudienceActionNotice(result.message);

      if (result.status === "completed") {
        await refreshAudienceSummary();
      }

      return result;
    } catch {
      const fallback: ChannelAudienceActionResult = {
        action,
        status: "error",
        reason: "update_failed",
        message: "Unable to complete this audience action right now.",
        actorScope: "channel_owner",
        requiredScope: "owner_or_operator",
        channelUserId: String(user?.id ?? "") || null,
        viewerUserId: String(user?.id ?? "") || null,
        targetUserId: null,
        requestId: null,
        requestKind: null,
        requestStatus: null,
      };
      setAudienceActionResult(fallback);
      setAudienceActionNotice(fallback.message);
      return fallback;
    } finally {
      setAudienceActionLoading(null);
    }
  };

  const resetEventEditor = () => {
    setEventEditor(createEmptyEventEditorState());
    setLiveReplayAccepted(false);
  };

  const loadCreatorEvents = async () => {
    if (!user?.id) {
      setCreatorEvents([]);
      setCreatorReminderSummaries([]);
      return;
    }

    setEventsLoading(true);
    try {
      const summaries = await readCreatorEventReminderSummaries(String(user.id));
      setCreatorReminderSummaries(summaries);
      setCreatorEvents(summaries.map((summary) => summary.event));
    } finally {
      setEventsLoading(false);
    }
  };

  const loadCreatorVideos = async () => {
    if (!user?.id) {
      setCreatorVideos([]);
      setVideosLoadError(null);
      return [];
    }

    setVideosLoading(true);
    setVideosLoadError(null);
    try {
      const videos = await readCreatorVideos(String(user.id), { includeDrafts: true, limit: 50 });
      setCreatorVideos(videos);
      const editMap = await readClipStudioEditsForVideos(videos.map((video) => video.id)).catch(() => new Map());
      setCreatorVideoClipEdits(Object.fromEntries(editMap));
      return videos;
    } catch (error) {
      setCreatorVideos([]);
      setCreatorVideoClipEdits({});
      setVideosLoadError(formatCreatorVideoUiError(
        error,
        "Unable to load creator videos right now. Check your connection and retry.",
      ));
      return [];
    } finally {
      setVideosLoading(false);
    }
  };

  const loadPlatformBranding = async () => {
    const ownerUserId = String(user?.id ?? "").trim();
    if (!ownerUserId) {
      setPlatformBranding(null);
      setBrandDraft(null);
      return null;
    }

    setBrandLoading(true);
    try {
      const bundle = await readPlatformBrandStudio(ownerUserId);
      setPlatformBranding(bundle);
      setBrandDraft(bundle.profile);
      return bundle;
    } catch {
      setBrandNotice("Brand Studio could not load Platform media right now.");
      return null;
    } finally {
      setBrandLoading(false);
    }
  };

  const loadPlatformBrandReviewQueue = async () => {
    if (!canReviewPlatformBrandAssets) {
      setBrandReviewQueueAssets([]);
      return [];
    }

    setBrandReviewQueueLoading(true);
    try {
      const assets = await readPlatformBrandReviewQueue(30);
      setBrandReviewQueueAssets(assets);
      return assets;
    } catch {
      setBrandReviewQueueAssets([]);
      return [];
    } finally {
      setBrandReviewQueueLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    if (!canUseChannelSettings || !canReviewPlatformBrandAssets) {
      setBrandReviewQueueAssets([]);
      setBrandReviewQueueLoading(false);
      return;
    }

    setBrandReviewQueueLoading(true);
    readPlatformBrandReviewQueue(30)
      .then((assets) => {
        if (active) setBrandReviewQueueAssets(assets);
      })
      .catch(() => {
        if (active) setBrandReviewQueueAssets([]);
      })
      .finally(() => {
        if (active) setBrandReviewQueueLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canReviewPlatformBrandAssets, canUseChannelSettings]);

  const resetVideoEditor = (nextLifecycleState: VideoLifecycleState = "idle") => {
    setVideoEditor(createEmptyVideoEditorState());
    setSelectedVideoFile(null);
    setVideoLifecycleState(nextLifecycleState);
  };

  const onPickVideoFile = async () => {
    try {
      setVideoNotice(null);
      logCreatorVideoUploadUi("picker_open");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        logCreatorVideoUploadUi("picker_canceled");
        setVideoNotice("No video selected. Choose Video File when you're ready to upload.");
        setVideoLifecycleState("idle");
        return;
      }
      const asset = result.assets[0];
      if (!asset?.uri) {
        logCreatorVideoUploadUi("picker_missing_asset");
        setVideoNotice("Choose a video file before uploading.");
        setVideoLifecycleState("failed");
        return;
      }

      const pickedFile = {
        uri: asset.uri,
        name: asset.name,
        mimeType: asset.mimeType,
        size: asset.size,
      };

      if (!isSupportedCreatorVideoFile(pickedFile)) {
        logCreatorVideoUploadUi("picker_unsupported", {
          name: pickedFile.name ?? "unnamed",
          mimeType: pickedFile.mimeType ?? null,
        });
        setSelectedVideoFile(null);
        setVideoNotice("Choose an MP4, MOV, WebM, or M4V video file.");
        setVideoLifecycleState("failed");
        return;
      }

      if (isCreatorVideoFileOverChannelMovieLimit(pickedFile, maxUploadSizeMb)) {
        logCreatorVideoUploadUi("picker_too_large", {
          name: pickedFile.name ?? "unnamed",
          size: pickedFile.size ?? null,
        });
        setSelectedVideoFile(null);
        setVideoNotice(getCreatorVideoTooLargeMessage(pickedFile.size, maxUploadSizeMb));
        setVideoLifecycleState("failed");
        return;
      }

      setSelectedVideoFile(pickedFile);
      setVideoLifecycleState("file_selected");
      logCreatorVideoUploadUi("picker_selected", {
        name: pickedFile.name ?? "unnamed",
        mimeType: pickedFile.mimeType ?? null,
        size: pickedFile.size ?? null,
      });
      setVideoNotice(`Selected ${pickedFile.name || "video file"}. Enter a title, then tap Upload Video.`);
      if (!videoEditor.title.trim() && asset.name) {
        updateVideoEditor({ title: asset.name.replace(/\.[^.]+$/, "") });
      }
    } catch (error) {
      logCreatorVideoUploadUi("picker_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      setVideoNotice("Unable to open the video picker right now.");
      setVideoLifecycleState("failed");
    }
  };

  const onPickClipVideoFile = async () => {
    try {
      setClipSaveState("selecting_video");
      setClipNotice(null);
      logClipStudioUi("clip_video_select_started");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        setClipSaveState((current) => (clipEditor.editingVideoId || selectedClipVideoFile ? "ready_to_save" : current === "selecting_video" ? "idle" : current));
        setClipNotice("No video selected. Choose Video when you're ready.");
        logClipStudioUi("clip_video_select_canceled");
        return;
      }

      const asset = result.assets[0];
      const pickedFile: CreatorVideoFile = {
        uri: asset?.uri ?? "",
        name: asset?.name,
        mimeType: asset?.mimeType,
        size: asset?.size,
      };

      if (!pickedFile.uri) {
        setClipSaveState("save_failed");
        setClipNotice("Choose a video before opening Clip Studio preview.");
        logClipStudioUi("clip_video_select_failed", { reason: "missing_uri" });
        return;
      }

      if (!isSupportedCreatorVideoFile(pickedFile)) {
        setSelectedClipVideoFile(null);
        setClipSaveState("save_failed");
        setClipNotice("Choose an MP4, MOV, WebM, or M4V video file.");
        logClipStudioUi("clip_video_select_failed", { reason: "unsupported_type" });
        return;
      }

      if (isCreatorVideoFileOverChannelMovieLimit(pickedFile, maxUploadSizeMb)) {
        setSelectedClipVideoFile(null);
        setClipSaveState("save_failed");
        setClipNotice(getCreatorVideoTooLargeMessage(pickedFile.size, maxUploadSizeMb));
        logClipStudioUi("clip_video_select_failed", { reason: "too_large", size: pickedFile.size ?? null });
        return;
      }

      setSelectedClipVideoFile(pickedFile);
      setSelectedClipCoverFile(null);
      setClipSavedVideoId(null);
      setClipSaveState("video_selected");
      setClipEditor((current) => ({
        ...current,
        editingVideoId: null,
        videoPreviewUrl: "",
        title: current.title.trim() || (asset?.name ? asset.name.replace(/\.[^.]+$/, "") : current.title),
        visibility: "draft",
        coverStoragePath: null,
        coverMimeType: null,
        coverFileSizeBytes: null,
        coverPreviewUrl: "",
      }));
      setClipNotice("Video selected. Preview, cover, format, and metadata can be saved as a draft.");
      logClipStudioUi("clip_video_selected", {
        mimeType: pickedFile.mimeType ?? null,
        size: pickedFile.size ?? null,
      });
    } catch {
      setClipSaveState("save_failed");
      setClipNotice("Unable to open the video picker right now.");
      logClipStudioUi("clip_video_select_failed", { reason: "picker_unavailable" });
    }
  };

  const onPickClipCoverFile = async () => {
    try {
      setClipSaveState("selecting_cover");
      setClipNotice(null);
      logClipStudioUi("clip_cover_select_started");
      const result = await DocumentPicker.getDocumentAsync({
        type: ["image/jpeg", "image/png", "image/webp"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        setClipSaveState((current) => (current === "selecting_cover" ? "ready_to_save" : current));
        setClipNotice("No cover image selected.");
        logClipStudioUi("clip_cover_select_canceled");
        return;
      }

      const asset = result.assets[0];
      const pickedFile: CreatorVideoFile = {
        uri: asset?.uri ?? "",
        name: asset?.name,
        mimeType: asset?.mimeType,
        size: asset?.size,
      };
      const validationMessage = getClipStudioCoverValidationMessage(pickedFile);
      if (validationMessage) {
        setSelectedClipCoverFile(null);
        setClipSaveState("save_failed");
        setClipNotice(validationMessage);
        logClipStudioUi("clip_cover_select_failed", { reason: "validation_failed" });
        return;
      }

      setSelectedClipCoverFile(pickedFile);
      setClipSavedVideoId(null);
      updateClipEditor({ coverPreviewUrl: pickedFile.uri });
      setClipNotice("Cover image selected. It stays private until you save it to a draft or publish.");
      logClipStudioUi("clip_cover_selected", {
        mimeType: pickedFile.mimeType ?? null,
        size: pickedFile.size ?? null,
      });
    } catch {
      setClipSaveState("save_failed");
      setClipNotice("Unable to open the cover picker right now.");
      logClipStudioUi("clip_cover_select_failed", { reason: "picker_unavailable" });
    }
  };

  const updateBrandDraft = (patch: Partial<PlatformBrandProfile>) => {
    setBrandDraft((current) => {
      const source = current ?? platformBranding?.profile;
      if (!source) return current;
      return {
        ...source,
        ...patch,
        heroFitMode: normalizePlatformBrandFitMode(patch.heroFitMode ?? source.heroFitMode),
        backgroundFitMode: normalizePlatformBrandFitMode(patch.backgroundFitMode ?? source.backgroundFitMode),
        themePreset: normalizePlatformBrandThemePreset(patch.themePreset ?? source.themePreset),
        updatedAt: new Date().toISOString(),
      };
    });
  };

  const getCurrentBrandDraft = () => brandDraft ?? platformBranding?.profile ?? null;

  const saveBrandDraftPatch = async (patch?: Partial<PlatformBrandProfile>) => {
    const ownerUserId = String(user?.id ?? "").trim();
    const draft = getCurrentBrandDraft();
    if (!ownerUserId || !draft) {
      setBrandNotice("Sign in before saving Brand Studio changes.");
      return null;
    }

    const nextDraft = {
      ...draft,
      ...patch,
      heroFitMode: normalizePlatformBrandFitMode(patch?.heroFitMode ?? draft.heroFitMode),
      backgroundFitMode: normalizePlatformBrandFitMode(patch?.backgroundFitMode ?? draft.backgroundFitMode),
      themePreset: normalizePlatformBrandThemePreset(patch?.themePreset ?? draft.themePreset),
    };

    setBrandSaving(true);
    try {
      const savedProfile = await savePlatformBrandProfileDraft(ownerUserId, nextDraft);
      setBrandDraft(savedProfile);
      await loadPlatformBranding();
      setBrandNotice("Draft changes saved. Public media appears only after review and publish.");
      return savedProfile;
    } catch {
      setBrandNotice("Unable to save Brand Studio changes right now.");
      return null;
    } finally {
      setBrandSaving(false);
    }
  };

  const publishBrandDraft = async () => {
    const ownerUserId = String(user?.id ?? "").trim();
    const draft = getCurrentBrandDraft();
    if (!ownerUserId || !draft) {
      setBrandNotice("Sign in before publishing Brand Studio changes.");
      return;
    }

    setBrandSaving(true);
    try {
      const savedProfile = await publishPlatformBrandProfile(ownerUserId, draft);
      setBrandDraft(savedProfile);
      await loadPlatformBranding();
      setBrandNotice("Brand Studio published. Assets still waiting for review stay off the public Platform.");
    } catch {
      setBrandNotice("Unable to publish Brand Studio changes right now.");
    } finally {
      setBrandSaving(false);
    }
  };

  const pickPlatformBrandAsset = async (assetType: PlatformBrandAssetType) => {
    const ownerUserId = String(user?.id ?? "").trim();
    if (!ownerUserId) {
      setBrandNotice("Sign in before choosing Platform media.");
      return;
    }

    const documentTypes = assetType === "hero_video"
      ? ["video/mp4", "video/quicktime", "video/webm"]
      : ["image/jpeg", "image/png", "image/webp"];

    try {
      setBrandBusyAssetType(assetType);
      setBrandNotice(null);
      const result = await DocumentPicker.getDocumentAsync({
        type: documentTypes,
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        setBrandNotice("No Platform media selected.");
        return;
      }

      const asset = result.assets[0];
      const pickedFile: PlatformBrandAssetFile = {
        uri: asset?.uri ?? "",
        name: asset?.name,
        mimeType: asset?.mimeType,
        size: asset?.size,
      };
      const validationMessage = getPlatformBrandAssetValidationMessage(pickedFile, assetType);
      if (validationMessage) {
        setBrandNotice(validationMessage);
        return;
      }

      const uploadedAsset = await uploadPlatformBrandAsset({
        ownerUserId,
        assetType,
        file: pickedFile,
      });
      const assetPatch: Partial<PlatformBrandProfile> = {};
      if (assetType === "hero_image") assetPatch.heroImageAssetId = uploadedAsset.id;
      if (assetType === "hero_video") assetPatch.heroVideoAssetId = uploadedAsset.id;
      if (assetType === "hero_poster") assetPatch.heroPosterAssetId = uploadedAsset.id;
      if (assetType === "background_image") assetPatch.backgroundImageAssetId = uploadedAsset.id;
      if (assetType === "avatar") assetPatch.avatarAssetId = uploadedAsset.id;
      if (assetType === "logo") assetPatch.logoAssetId = uploadedAsset.id;
      if (assetType === "watermark") assetPatch.watermarkAssetId = uploadedAsset.id;

      await saveBrandDraftPatch(assetPatch);
      setBrandNotice("Platform media saved as draft. Review is required before it can appear publicly.");
    } catch {
      setBrandNotice("Unable to choose or save that Platform media right now.");
    } finally {
      setBrandBusyAssetType(null);
    }
  };

  const handleReviewPlatformBrandAsset = async (
    asset: PlatformBrandAsset,
    action: PlatformBrandReviewAction,
  ) => {
    const reason = brandReviewReason.trim();
    if ((action === "reject" || action === "archive") && reason.length < 6) {
      setBrandNotice("Add a short review reason before rejecting or archiving a Platform asset.");
      return;
    }

    setBrandReviewBusyAssetId(`${asset.id}:${action}`);
    setBrandNotice(null);
    try {
      await reviewPlatformBrandAsset(
        asset.id,
        action,
        action === "approve" ? reason || "Approved for public Platform display." : reason,
      );
      setBrandReviewReason("");
      await loadPlatformBranding();
      await loadPlatformBrandReviewQueue();
      setBrandNotice(
        action === "approve"
          ? "Platform asset approved. It still appears publicly only after Publish Changes."
          : action === "reject"
            ? "Platform asset rejected with a review note."
            : "Platform asset archived and removed from public eligibility.",
      );
    } catch {
      setBrandNotice("Unable to update that review state. Check review access and try again.");
    } finally {
      setBrandReviewBusyAssetId(null);
    }
  };

  const confirmRemoveBrandAsset = (assetType: PlatformBrandAssetType, asset: PlatformBrandAsset | null) => {
    if (!asset) {
      setBrandNotice("No Platform asset is selected for that section.");
      return;
    }

    Alert.alert(
      "Remove Platform asset?",
      "This removes the asset from Brand Studio drafts. Public assets already reviewed may stop appearing after you publish.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                setBrandSaving(true);
                await removePlatformBrandAsset(asset);
                const patch: Partial<PlatformBrandProfile> = {};
                if (assetType === "hero_image") patch.heroImageAssetId = null;
                if (assetType === "hero_video") patch.heroVideoAssetId = null;
                if (assetType === "hero_poster") patch.heroPosterAssetId = null;
                if (assetType === "background_image") patch.backgroundImageAssetId = null;
                if (assetType === "avatar") patch.avatarAssetId = null;
                if (assetType === "logo") patch.logoAssetId = null;
                if (assetType === "watermark") patch.watermarkAssetId = null;
                await saveBrandDraftPatch(patch);
                setBrandNotice("Platform asset removed from Brand Studio.");
              } catch {
                setBrandNotice("Unable to remove that Platform asset right now.");
              } finally {
                setBrandSaving(false);
              }
            })();
          },
        },
      ],
    );
  };

  const onEditVideo = (video: CreatorVideo) => {
    setVideoEditor({
      editingVideoId: video.id,
      title: video.title,
      description: video.description,
      thumbUrl: video.thumbnailUrl,
      visibility: video.visibility,
    });
    setSelectedVideoFile(null);
    setVideoLifecycleState("idle");
    setVideoNotice(null);
  };

  const onSaveVideo = async () => {
    if (!videoEditor.title.trim()) {
      logCreatorVideoUploadUi("submit_blocked", { reason: "missing_title" });
      setVideoNotice(videoEditor.editingVideoId ? "Enter a title before updating." : "Enter a title before uploading.");
      return;
    }

    if (!videoEditor.editingVideoId && !selectedVideoFile) {
      logCreatorVideoUploadUi("submit_blocked", { reason: "missing_file" });
      setVideoNotice("Choose a video file before uploading.");
      return;
    }

    if (!videoEditor.editingVideoId && selectedVideoFile && isCreatorVideoFileOverChannelMovieLimit(selectedVideoFile, maxUploadSizeMb)) {
      logCreatorVideoUploadUi("submit_blocked", {
        reason: "file_too_large",
        fileSize: selectedVideoFile.size ?? null,
      });
      setVideoNotice(getCreatorVideoTooLargeMessage(selectedVideoFile.size, maxUploadSizeMb));
      return;
    }

    if (!videoEditor.editingVideoId && !uploadsEnabled) {
      logCreatorVideoUploadUi("submit_blocked", { reason: "uploads_paused" });
      setVideoLifecycleState("idle");
      setVideoNotice("Creator video uploads are temporarily paused. Existing videos can still be managed.");
      return;
    }

    const fileToUpload = selectedVideoFile;

    try {
      setVideoSaving(true);
      setVideoLifecycleState(videoEditor.editingVideoId ? "idle" : "uploading");
      setVideoNotice(videoEditor.editingVideoId ? "Saving creator video..." : "Uploading creator video...");
      logCreatorVideoUploadUi("submit_start", {
        mode: videoEditor.editingVideoId ? "edit" : "upload",
        fileName: selectedVideoFile?.name ?? null,
        fileSize: selectedVideoFile?.size ?? null,
        visibility: videoEditor.visibility,
      });

      if (videoEditor.editingVideoId) {
        const updatedVideo = await updateCreatorVideoMetadata(videoEditor.editingVideoId, {
          title: videoEditor.title,
          description: videoEditor.description,
          thumbUrl: videoEditor.thumbUrl,
          visibility: videoEditor.visibility,
        });
        setVideoNotice("Creator video updated.");
      } else {
        const uploadedVideo = await uploadCreatorVideo({
          file: fileToUpload!,
          title: videoEditor.title,
          description: videoEditor.description,
          thumbUrl: videoEditor.thumbUrl,
          visibility: videoEditor.visibility,
          maxUploadSizeMb,
        });
        setVideoNotice(`Creator video uploaded: ${uploadedVideo.title}.`);
      }

      await loadCreatorVideos();
      resetVideoEditor(videoEditor.editingVideoId ? "idle" : "succeeded");
    } catch (error) {
      logCreatorVideoUploadUi("submit_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      setVideoLifecycleState("failed");
      setVideoNotice(
        formatCreatorVideoUiError(
          error,
          "Unable to save creator video right now. Try again in a moment.",
          fileToUpload?.size,
        ),
      );
    } finally {
      setVideoSaving(false);
    }
  };

  const buildClipStudioEditPatch = (coverUpload?: ClipStudioCoverUpload | null) => {
    const brandAsset = approvedClipBrandAsset;
    const brandMarkEnabled = clipEditor.brandMarkEnabled && !!brandAsset;
    return {
      clipFormat: normalizeClipStudioFormat(clipEditor.clipFormat),
      fitMode: normalizeClipStudioFitMode(clipEditor.fitMode),
      trimStartMs: null,
      trimEndMs: null,
      coverStoragePath: coverUpload?.storagePath ?? clipEditor.coverStoragePath,
      coverMimeType: coverUpload?.mimeType ?? clipEditor.coverMimeType,
      coverFileSizeBytes: coverUpload?.fileSizeBytes ?? clipEditor.coverFileSizeBytes,
      titleOverlayText: clipEditor.titleOverlayText,
      titleOverlaySubtitle: clipEditor.titleOverlaySubtitle,
      titleOverlayPosition: normalizeClipStudioOverlayPosition(clipEditor.titleOverlayPosition),
      titleOverlayStyle: normalizeClipStudioOverlayStyle(clipEditor.titleOverlayStyle),
      templatePreset: normalizeClipStudioTemplatePreset(clipEditor.templatePreset),
      brandMarkEnabled,
      brandAssetId: brandMarkEnabled ? brandAsset?.id ?? null : null,
    };
  };

  const clipStudioEditMatchesPatch = (edit: ClipStudioEdit, patch: ClipStudioEditPatch) => {
    const nullableText = (value: unknown) => {
      const normalized = String(value ?? "").trim();
      return normalized || null;
    };
    const nullableNumber = (value: unknown) => (
      typeof value === "number" && Number.isFinite(value) ? value : null
    );

    const coverPathMatches = nullableText(edit.coverStoragePath) === nullableText(patch.coverStoragePath);
    const coverMimeMatches = nullableText(edit.coverMimeType) === nullableText(patch.coverMimeType);
    const persistedCoverSize = nullableNumber(edit.coverFileSizeBytes);
    const intendedCoverSize = nullableNumber(patch.coverFileSizeBytes);
    const coverSizeMatches = persistedCoverSize === intendedCoverSize
      || (coverPathMatches && coverMimeMatches && persistedCoverSize !== null && intendedCoverSize === null);

    return edit.clipFormat === normalizeClipStudioFormat(patch.clipFormat)
      && edit.fitMode === normalizeClipStudioFitMode(patch.fitMode)
      && nullableNumber(edit.trimStartMs) === nullableNumber(patch.trimStartMs)
      && nullableNumber(edit.trimEndMs) === nullableNumber(patch.trimEndMs)
      && coverPathMatches
      && coverMimeMatches
      && coverSizeMatches
      && nullableText(edit.titleOverlayText) === nullableText(patch.titleOverlayText)
      && nullableText(edit.titleOverlaySubtitle) === nullableText(patch.titleOverlaySubtitle)
      && edit.titleOverlayPosition === normalizeClipStudioOverlayPosition(patch.titleOverlayPosition)
      && edit.titleOverlayStyle === normalizeClipStudioOverlayStyle(patch.titleOverlayStyle)
      && edit.templatePreset === normalizeClipStudioTemplatePreset(patch.templatePreset)
      && edit.brandMarkEnabled === (patch.brandMarkEnabled === true)
      && nullableText(edit.brandAssetId) === nullableText(patch.brandAssetId);
  };

  const saveClipStudio = async (targetVisibility: CreatorVideoVisibility) => {
    if (clipSaveInFlightRef.current) return;

    const title = clipEditor.title.trim();
    const isPublishing = targetVisibility === "public";
    if (!title) {
      setClipSaveState("save_failed");
      setClipNotice("Enter a title before saving this clip.");
      logClipStudioUi("clip_save_draft_failed", { reason: "missing_title", targetVisibility });
      return;
    }

    if (!clipEditor.editingVideoId && !selectedClipVideoFile) {
      setClipSaveState("idle");
      setClipNotice("Choose a video before saving this Clip Studio draft.");
      logClipStudioUi("clip_save_draft_failed", { reason: "missing_video", targetVisibility });
      return;
    }

    const titleOverlayValidation = getClipStudioTitleOverlayValidationMessage(
      clipEditor.titleOverlayText,
      clipEditor.titleOverlaySubtitle,
    );
    if (titleOverlayValidation) {
      setClipSaveState("save_failed");
      setClipNotice(titleOverlayValidation);
      logClipStudioUi("clip_save_draft_failed", { reason: "title_overlay_too_long", targetVisibility });
      return;
    }

    if (!clipEditor.editingVideoId && !uploadsEnabled) {
      setClipSaveState("save_failed");
      setClipNotice("Creator video uploads are temporarily paused. Existing clips can still be managed.");
      logClipStudioUi("clip_save_draft_failed", { reason: "uploads_paused", targetVisibility });
      return;
    }

    if (selectedClipVideoFile && isCreatorVideoFileOverChannelMovieLimit(selectedClipVideoFile, maxUploadSizeMb)) {
      setClipSaveState("save_failed");
      setClipNotice(getCreatorVideoTooLargeMessage(selectedClipVideoFile.size, maxUploadSizeMb));
      logClipStudioUi("clip_save_draft_failed", { reason: "video_too_large", targetVisibility });
      return;
    }

    if (clipEditor.brandMarkEnabled && !approvedClipBrandAsset) {
      setClipSaveState("save_failed");
      setClipNotice("Use Platform brand is available after a published approved avatar or logo exists in Brand Studio.");
      logClipStudioUi("clip_save_draft_failed", { reason: "brand_mark_unavailable", targetVisibility });
      return;
    }

    clipSaveInFlightRef.current = true;
    let savedVideoId = clipEditor.editingVideoId;
    let videoMutationComplete = false;
    let intendedEditPatch: ClipStudioEditPatch | null = null;

    try {
      setClipSaving(true);
      setClipSaveState((current) => (current === "save_failed" ? "retrying" : "saving"));
      setClipNotice(isPublishing ? "Publishing clip..." : "Saving Clip Studio draft...");
      logClipStudioUi("clip_save_draft_attempted", {
        mode: savedVideoId ? "update" : "new",
        targetVisibility,
        hasCover: !!selectedClipCoverFile,
      });
      let coverUpload: ClipStudioCoverUpload | null = null;

      if (savedVideoId) {
        const updatedVideo = await updateCreatorVideoMetadata(savedVideoId, {
          title,
          description: clipEditor.description,
          visibility: targetVisibility,
        });
        savedVideoId = updatedVideo.id;
      } else {
        const uploadedVideo = await uploadCreatorVideo({
          file: selectedClipVideoFile!,
          title,
          description: clipEditor.description,
          thumbUrl: "",
          visibility: targetVisibility,
          maxUploadSizeMb,
        });
        savedVideoId = uploadedVideo.id;
        setClipEditor((current) => ({
          ...current,
          editingVideoId: uploadedVideo.id,
          title: uploadedVideo.title,
          description: uploadedVideo.description,
          visibility: uploadedVideo.visibility,
        }));
      }
      videoMutationComplete = true;

      if (selectedClipCoverFile && savedVideoId) {
        coverUpload = await uploadClipStudioCoverImage({
          videoId: savedVideoId,
          file: selectedClipCoverFile,
        });
      }

      if (!savedVideoId) throw new Error("Clip Studio could not resolve a saved video.");
      intendedEditPatch = buildClipStudioEditPatch(coverUpload);
      await saveClipStudioEdit(savedVideoId, intendedEditPatch);
      const confirmedVideo = await readCreatorVideoForOwner(savedVideoId);
      if (!confirmedVideo) {
        throw new Error("Clip Studio could not confirm the saved draft.");
      }
      if (confirmedVideo.visibility !== targetVisibility) {
        throw new Error("Clip Studio saved state could not be confirmed.");
      }
      const confirmedEdit = await readClipStudioEdit(savedVideoId);
      if (!confirmedEdit) {
        throw new Error("Clip Studio settings could not be confirmed.");
      }
      if (!intendedEditPatch || !clipStudioEditMatchesPatch(confirmedEdit, intendedEditPatch)) {
        throw new Error("Clip Studio settings could not be confirmed.");
      }
      const confirmedPlayerVideo = await readCreatorVideoForPlayer(savedVideoId).catch(() => null);
      if (coverUpload && confirmedVideo.thumbStoragePath !== coverUpload.storagePath) {
        throw new Error("Clip Studio cover could not be confirmed.");
      }
      if (coverUpload && confirmedEdit.coverStoragePath !== coverUpload.storagePath) {
        throw new Error("Clip Studio cover settings could not be confirmed.");
      }
      const refreshedVideos = await loadCreatorVideos();
      const contentLibraryContainsDraft = refreshedVideos.some((video) => (
        video.id === savedVideoId && video.visibility === targetVisibility
      ));
      if (!contentLibraryContainsDraft) {
        setClipEditor((current) => ({
          ...current,
          editingVideoId: savedVideoId,
          title: confirmedVideo.title,
          description: confirmedVideo.description,
          visibility: confirmedVideo.visibility,
          videoPreviewUrl: confirmedPlayerVideo?.playbackUrl || current.videoPreviewUrl,
          clipFormat: confirmedEdit.clipFormat,
          fitMode: confirmedEdit.fitMode,
          trimStartMs: confirmedEdit.trimStartMs == null ? "" : String(confirmedEdit.trimStartMs),
          trimEndMs: confirmedEdit.trimEndMs == null ? "" : String(confirmedEdit.trimEndMs),
          coverStoragePath: confirmedEdit.coverStoragePath ?? confirmedVideo.thumbStoragePath ?? null,
          coverMimeType: confirmedEdit.coverMimeType,
          coverFileSizeBytes: confirmedEdit.coverFileSizeBytes,
          coverPreviewUrl: coverUpload?.signedUrl || confirmedPlayerVideo?.thumbnailUrl || confirmedVideo.thumbnailUrl || current.coverPreviewUrl,
          titleOverlayText: confirmedEdit.titleOverlayText,
          titleOverlaySubtitle: confirmedEdit.titleOverlaySubtitle,
          titleOverlayPosition: confirmedEdit.titleOverlayPosition,
          titleOverlayStyle: confirmedEdit.titleOverlayStyle,
          templatePreset: confirmedEdit.templatePreset,
          brandMarkEnabled: confirmedEdit.brandMarkEnabled,
          brandAssetId: confirmedEdit.brandAssetId,
        }));
        setClipSavedVideoId(null);
        setClipSaveState("save_failed");
        setClipNotice("Draft saved, but Content Library could not refresh it. Check your connection, then retry.");
        logClipStudioUi("clip_save_draft_failed", { reason: "library_refresh_missing_saved_video", targetVisibility });
        return;
      }

      setClipEditor((current) => ({
        ...current,
        editingVideoId: savedVideoId,
        title: confirmedVideo.title,
        description: confirmedVideo.description,
        visibility: confirmedVideo.visibility,
        videoPreviewUrl: confirmedPlayerVideo?.playbackUrl || current.videoPreviewUrl,
        clipFormat: confirmedEdit.clipFormat,
        fitMode: confirmedEdit.fitMode,
        trimStartMs: confirmedEdit.trimStartMs == null ? "" : String(confirmedEdit.trimStartMs),
        trimEndMs: confirmedEdit.trimEndMs == null ? "" : String(confirmedEdit.trimEndMs),
        coverStoragePath: confirmedEdit.coverStoragePath ?? confirmedVideo.thumbStoragePath ?? null,
        coverMimeType: confirmedEdit.coverMimeType,
        coverFileSizeBytes: confirmedEdit.coverFileSizeBytes,
        coverPreviewUrl: coverUpload?.signedUrl || confirmedPlayerVideo?.thumbnailUrl || confirmedVideo.thumbnailUrl || current.coverPreviewUrl,
        titleOverlayText: confirmedEdit.titleOverlayText,
        titleOverlaySubtitle: confirmedEdit.titleOverlaySubtitle,
        titleOverlayPosition: confirmedEdit.titleOverlayPosition,
        titleOverlayStyle: confirmedEdit.titleOverlayStyle,
        templatePreset: confirmedEdit.templatePreset,
        brandMarkEnabled: confirmedEdit.brandMarkEnabled,
        brandAssetId: confirmedEdit.brandAssetId,
      }));
      setSelectedClipVideoFile(null);
      setSelectedClipCoverFile(null);
      setClipSavedVideoId(savedVideoId);
      setClipSaveState("saved");
      setClipNotice(
        isPublishing
          ? "Clip published and confirmed in Content Library. Public playback still uses the existing Player."
          : "Draft saved and confirmed in Content Library.",
      );
      logClipStudioUi("clip_save_draft_succeeded", { targetVisibility });
    } catch (error) {
      if (savedVideoId && videoMutationComplete) {
        const confirmedPartialVideo = await readCreatorVideoForOwner(savedVideoId).catch(() => null);
        if (confirmedPartialVideo) {
          const confirmedPartialEdit = await readClipStudioEdit(savedVideoId).catch(() => null);
          const confirmedPartialPlayerVideo = await readCreatorVideoForPlayer(savedVideoId).catch(() => null);
          const refreshedVideos = await loadCreatorVideos().catch(() => []);
          const partialDraftIsVisible = refreshedVideos.some((video) => video.id === confirmedPartialVideo.id);
          const partialSaveConfirmed =
            confirmedPartialVideo.visibility === targetVisibility
            && !!confirmedPartialEdit
            && !!intendedEditPatch
            && partialDraftIsVisible
            && clipStudioEditMatchesPatch(confirmedPartialEdit, intendedEditPatch);

          if (partialSaveConfirmed && confirmedPartialEdit) {
            setClipEditor((current) => ({
              ...current,
              editingVideoId: confirmedPartialVideo.id,
              title: confirmedPartialVideo.title,
              description: confirmedPartialVideo.description,
              visibility: confirmedPartialVideo.visibility,
              videoPreviewUrl: confirmedPartialPlayerVideo?.playbackUrl || current.videoPreviewUrl,
              clipFormat: confirmedPartialEdit.clipFormat,
              fitMode: confirmedPartialEdit.fitMode,
              trimStartMs: confirmedPartialEdit.trimStartMs == null ? "" : String(confirmedPartialEdit.trimStartMs),
              trimEndMs: confirmedPartialEdit.trimEndMs == null ? "" : String(confirmedPartialEdit.trimEndMs),
              coverStoragePath: confirmedPartialEdit.coverStoragePath ?? confirmedPartialVideo.thumbStoragePath ?? null,
              coverMimeType: confirmedPartialEdit.coverMimeType,
              coverFileSizeBytes: confirmedPartialEdit.coverFileSizeBytes,
              coverPreviewUrl: confirmedPartialPlayerVideo?.thumbnailUrl || confirmedPartialVideo.thumbnailUrl || current.coverPreviewUrl,
              titleOverlayText: confirmedPartialEdit.titleOverlayText,
              titleOverlaySubtitle: confirmedPartialEdit.titleOverlaySubtitle,
              titleOverlayPosition: confirmedPartialEdit.titleOverlayPosition,
              titleOverlayStyle: confirmedPartialEdit.titleOverlayStyle,
              templatePreset: confirmedPartialEdit.templatePreset,
              brandMarkEnabled: confirmedPartialEdit.brandMarkEnabled,
              brandAssetId: confirmedPartialEdit.brandAssetId,
            }));
            setSelectedClipVideoFile(null);
            setSelectedClipCoverFile(null);
            setClipSavedVideoId(confirmedPartialVideo.id);
            setClipSaveState("saved");
            setClipNotice(
              targetVisibility === "public"
                ? "Clip published and confirmed in Content Library. Public playback still uses the existing Player."
                : "Draft saved and confirmed in Content Library.",
            );
            logClipStudioUi("clip_save_draft_succeeded", { targetVisibility, recoveredAfterReadback: true });
            return;
          }

          setClipEditor((current) => ({
            ...current,
            editingVideoId: confirmedPartialVideo.id,
            title: confirmedPartialVideo.title,
            description: confirmedPartialVideo.description,
            visibility: confirmedPartialVideo.visibility,
            videoPreviewUrl: confirmedPartialPlayerVideo?.playbackUrl || current.videoPreviewUrl,
            clipFormat: confirmedPartialEdit?.clipFormat ?? current.clipFormat,
            fitMode: confirmedPartialEdit?.fitMode ?? current.fitMode,
            trimStartMs: confirmedPartialEdit?.trimStartMs == null ? current.trimStartMs : String(confirmedPartialEdit.trimStartMs),
            trimEndMs: confirmedPartialEdit?.trimEndMs == null ? current.trimEndMs : String(confirmedPartialEdit.trimEndMs),
            coverStoragePath: confirmedPartialEdit?.coverStoragePath ?? confirmedPartialVideo.thumbStoragePath ?? current.coverStoragePath,
            coverMimeType: confirmedPartialEdit?.coverMimeType ?? current.coverMimeType,
            coverFileSizeBytes: confirmedPartialEdit?.coverFileSizeBytes ?? current.coverFileSizeBytes,
            coverPreviewUrl: confirmedPartialPlayerVideo?.thumbnailUrl || confirmedPartialVideo.thumbnailUrl || current.coverPreviewUrl,
            titleOverlayText: confirmedPartialEdit?.titleOverlayText ?? current.titleOverlayText,
            titleOverlaySubtitle: confirmedPartialEdit?.titleOverlaySubtitle ?? current.titleOverlaySubtitle,
            titleOverlayPosition: confirmedPartialEdit?.titleOverlayPosition ?? current.titleOverlayPosition,
            titleOverlayStyle: confirmedPartialEdit?.titleOverlayStyle ?? current.titleOverlayStyle,
            templatePreset: confirmedPartialEdit?.templatePreset ?? current.templatePreset,
            brandMarkEnabled: confirmedPartialEdit?.brandMarkEnabled ?? current.brandMarkEnabled,
            brandAssetId: confirmedPartialEdit?.brandAssetId ?? current.brandAssetId,
          }));
          setClipSavedVideoId(null);
          setClipSaveState("save_failed");
          setClipNotice(
            partialDraftIsVisible
              ? "A draft is visible in Content Library, but Clip Studio could not finish cover or settings confirmation. Retry Save Draft to finish it without creating another draft."
              : "A draft was created, but Clip Studio could not refresh Content Library or finish cover settings. Retry Save Draft to finish it without creating another draft.",
          );
          logClipStudioUi("clip_save_draft_failed", { reason: "partial_draft_needs_retry", targetVisibility });
          return;
        }
      }

      setClipSaveState("save_failed");
      setClipSavedVideoId(null);
      setClipNotice(formatCreatorVideoUiError(error, "Unable to save this clip right now. Try again.", selectedClipVideoFile?.size));
      logClipStudioUi("clip_save_draft_failed", {
        reason: error instanceof Error ? error.message : "unknown",
        targetVisibility,
      });
    } finally {
      setClipSaving(false);
      clipSaveInFlightRef.current = false;
    }
  };

  const onSaveClipDraft = () => {
    void saveClipStudio("draft");
  };

  const onPublishClip = () => {
    void saveClipStudio("public");
  };

  const runVideoVisibilityUpdate = async (video: CreatorVideo) => {
    const nextVisibility = video.visibility === "public" ? "draft" : "public";
    try {
      setVideoSaving(true);
      setVideoNotice(nextVisibility === "public" ? "Publishing video..." : "Moving video to draft...");
      const updatedVideo = await updateCreatorVideoMetadata(video.id, { visibility: nextVisibility });
      await loadCreatorVideos();
      setVideoNotice(nextVisibility === "public" ? "Video published." : "Video moved to draft.");
    } catch (error) {
      setVideoNotice(formatCreatorVideoUiError(error, "Unable to update video visibility right now."));
    } finally {
      setVideoSaving(false);
    }
  };

  const onToggleVideoVisibility = (video: CreatorVideo) => {
    if (video.visibility === "public") {
      Alert.alert(
        "Unpublish Video",
        `Move "${video.title}" back to draft? It will stop appearing publicly but stays in your platform library.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Unpublish",
            style: "destructive",
            onPress: () => {
              void runVideoVisibilityUpdate(video);
            },
          },
        ],
      );
      return;
    }

    Alert.alert(
      "Publish Video",
      `Publish "${video.title}" to your public platform? Public videos can appear on your Profile/Platform and open in Player.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Publish",
          onPress: () => {
            void runVideoVisibilityUpdate(video);
          },
        },
      ],
    );
  };

  const onDeleteVideo = (video: CreatorVideo) => {
    Alert.alert(
      "Delete Video",
      `Remove "${video.title}" from your platform?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                setVideoSaving(true);
                setVideoNotice(null);
                await deleteCreatorVideo(video);
                await loadCreatorVideos();
                if (videoEditor.editingVideoId === video.id) resetVideoEditor();
                setVideoNotice("Creator video deleted.");
              } catch (error) {
                setVideoNotice(formatCreatorVideoUiError(error, "Unable to delete creator video right now."));
              } finally {
                setVideoSaving(false);
              }
            })();
          },
        },
      ],
    );
  };

  const onEditEvent = (event: CreatorEventSummary) => {
    setEventEditor({
      editingEventId: event.id,
      eventTitle: event.eventTitle,
      eventType: event.eventType,
      status: event.status,
      startsAt: toDatetimeLocalValue(event.startsAt),
      endsAt: toDatetimeLocalValue(event.endsAt),
      linkedTitleId: event.linkedTitleId ?? "",
      replayPolicy: event.replayPolicy,
      replayAvailableAt: toDatetimeLocalValue(event.replayAvailableAt),
      replayExpiresAt: toDatetimeLocalValue(event.replayExpiresAt),
      reminderReady: event.reminderReady,
    });
    setLiveReplayAccepted(false);
    setEventNotice(null);
  };

  const onSaveEvent = async () => {
    if (!user?.id) return;

    if (!eventEditor.editingEventId && !creatorPostingEnabled) {
      setEventNotice("Creator event creation is temporarily paused. Existing events can still be managed.");
      return;
    }

    if (liveReplayAcknowledgementRequired && !liveReplayAccepted) {
      setEventNotice("Confirm the live/replay acknowledgement before saving this event.");
      return;
    }

    try {
      setEventSaving(true);
      const payload = {
        hostUserId: String(user.id),
        eventTitle: eventEditor.eventTitle,
        eventType: eventEditor.eventType,
        status: eventEditor.status,
        startsAt: fromDatetimeLocalValue(eventEditor.startsAt),
        endsAt: fromDatetimeLocalValue(eventEditor.endsAt),
        linkedTitleId:
          eventEditor.eventType === "watch_party_live"
            ? String(eventEditor.linkedTitleId).trim() || null
            : null,
        replayPolicy: eventEditor.replayPolicy,
        replayAvailableAt: fromDatetimeLocalValue(eventEditor.replayAvailableAt),
        replayExpiresAt: fromDatetimeLocalValue(eventEditor.replayExpiresAt),
        reminderReady: eventEditor.reminderReady,
      };

      const result = eventEditor.editingEventId
        ? await updateCreatorEvent(eventEditor.editingEventId, payload)
        : await createCreatorEvent(payload);

      if ("error" in result) {
        setEventNotice(result.error.message);
        return;
      }

      await loadCreatorEvents();
      resetEventEditor();
      setEventNotice(eventEditor.editingEventId ? "Creator event updated." : "Creator event created.");
    } catch {
      setEventNotice("Unable to save creator event right now.");
    } finally {
      setEventSaving(false);
    }
  };

  const onSave = async () => {
    if (!profile) return;

    try {
      setSaving(true);
      const normalized = normalizeUserProfile({
        ...profile,
        defaultWatchPartyContentAccessRule: sanitizeCreatorRoomAccessRule(
          profile.defaultWatchPartyContentAccessRule,
          creatorPermissions,
        ),
        defaultCommunicationContentAccessRule: sanitizeCreatorRoomAccessRule(
          profile.defaultCommunicationContentAccessRule,
          creatorPermissions,
        ),
      });
      await saveUserProfile(normalized);
      setProfile(normalized);
      setNotice("Platform Studio saved.");
    } catch {
      setNotice("Unable to save Platform Studio changes right now.");
    } finally {
      setSaving(false);
    }
  };

  const studioSectionGroups: readonly ChannelSettingsSectionGroup[] = [
    {
      title: "Content",
      body: "Creator-owned videos and the future platform library shape.",
      sections: [
        {
          title: "Creator Content",
          status: "current",
          body: "Upload and manage creator videos.",
        },
        {
          title: "Featured Video / Trailer",
          status: "near_term",
          body: "Coming soon once featured/trailer backing is added.",
        },
        {
          title: "Playlists / Shelves",
          status: "near_term",
          body: "Coming soon once playlist or shelf backing exists.",
        },
      ],
    },
    {
      title: "Monetization",
      body: "Money Center keeps digital sales, merch, balance, payouts, and provider readiness in one place.",
      sections: [
        {
          title: "Digital Sales",
          status: "current",
          body: "Android digital access stays governed by Google Play and RevenueCat readiness.",
        },
        {
          title: "Creator Balance",
          status: "near_term",
          body: "Verified earnings will appear only after real ledger rows exist.",
        },
        {
          title: "Payouts",
          status: "near_term",
          body: "Payouts stay unavailable until setup, review, tax/legal, and payout checks are ready.",
        },
        {
          title: "Merch",
          status: "near_term",
          body: "Physical merch stays separate from Android digital access.",
        },
        {
          title: "Provider Status",
          status: "near_term",
          body: "Sanitized provider readiness is the visible source of truth.",
        },
      ],
    },
    {
      title: "Brand & Design",
      body: "Platform identity controls that stay separate from personal Profile privacy.",
      sections: [
        {
          title: "Identity",
          status: "current",
          body: "Name, tagline, and role.",
        },
        {
          title: "Layout",
          status: "current",
          body: "Home emphasis and layout preset.",
        },
        {
          title: "Design",
          status: "near_term",
          body: "Coming soon for hero, avatar, accent, and brand treatment.",
        },
      ],
    },
    {
      title: "Live & Events",
      body: "Room defaults, creator events, and backed scheduling posture.",
      sections: [
        {
          title: "Access Defaults",
          status: "current",
          body: "Room defaults and backed creator grants.",
        },
        {
          title: "Live Events",
          status: "current",
          body: "Schedule live sessions and replays.",
        },
      ],
    },
    {
      title: "Audience",
      body: "Platform-owned audience relationships and visibility controls.",
      sections: [
        {
          title: "Audience",
          status: "current",
          body: "Followers, requests, blocks, and visibility.",
        },
      ],
    },
    {
      title: "Insights",
      body: "Only backed summaries render here; assistant-style help stays later.",
      sections: [
        {
          title: "Analytics",
          status: "current",
          body: "Backed room, event, and audience signals.",
        },
        {
          title: "Platform IQ / Rachi Platform Studio Assistant",
          status: "later_phase",
          body: "Coming later; no assistant implementation is wired in this pass.",
        },
      ],
    },
    {
      title: "Safety",
      body: "Role and report context without replacing the Admin surface.",
      sections: [
        {
          title: "Safety/Admin",
          status: "current",
          body: "Role, report, and admin reach.",
        },
      ],
    },
  ];
  const designSectionHighlights = [
    "Hero treatment",
    "Avatar framing",
    "Accent direction",
    "Brand presence",
  ] as const;
  const layoutSectionHighlights = [
    "Home block order",
    "Default tab emphasis",
    "Shelf hierarchy",
    "Live module priority",
  ] as const;
  const accessSummary = {
    title: channelAccessResolution?.label ?? "Loading Access",
    body: getChannelAccessSummaryBody(channelAccessResolution),
  };
  const resolvedCreatorPermissions = channelAccessResolution?.creatorPermissions ?? creatorPermissions;
  const accessSummaryDetails: readonly ChannelAccessSummaryDetail[] = [
    {
      label: "Watch Party",
      value: formatChannelRoomAccessValue(channelAccessResolution?.watchPartyAccessRule),
      body: channelAccessResolution?.joinPolicy === "locked" ? "locked join policy" : "open join policy",
    },
    {
      label: "Communication",
      value: formatChannelRoomAccessValue(channelAccessResolution?.communicationAccessRule),
      body: "Chi'lly Chat stays canonical even when default room access is gated",
    },
  ];
  const creatorGrantDetails: readonly ChannelAccessSummaryDetail[] = [
    {
      label: "Party Pass Rooms",
      value: !resolvedCreatorPermissions
        ? "Loading"
        : resolvedCreatorPermissions.canUsePartyPassRooms
          ? "Ready"
          : "Open Only",
      body: !resolvedCreatorPermissions
        ? "checking whether Party Pass room defaults are available"
        : resolvedCreatorPermissions.canUsePartyPassRooms
          ? "Party Pass room defaults can stay active on this route"
          : "Party Pass defaults fall back to open until the creator grant is enabled",
    },
    {
      label: "Premium Rooms",
      value: !resolvedCreatorPermissions
        ? "Loading"
        : resolvedCreatorPermissions.canUsePremiumRooms
          ? "Ready"
          : "Open Only",
      body: !resolvedCreatorPermissions
        ? "checking whether Premium room defaults are available"
        : resolvedCreatorPermissions.canUsePremiumRooms
          ? "Premium room defaults can stay active on this route"
          : "Premium room defaults stay hidden until the creator grant is enabled",
    },
  ];
  const audienceSummaryCards: readonly SummaryMetricCard[] = [
    {
      label: "Followers",
      value: formatCount(audienceSummary?.followerCount ?? null),
      body: "Real Platform follower relationships from the landed audience schema.",
    },
    {
      label: "Subscribers",
      value: formatCount(audienceSummary?.subscriberCount ?? null),
      body: "Creator/Platform subscriber truth only, not account-tier premium.",
    },
    {
      label: "Requests",
      value: formatCount(audienceSummary?.pendingRequestCount ?? null),
      body: "Pending audience requests waiting on Platform review.",
    },
    {
      label: "Blocked",
      value: formatCount(audienceSummary?.blockedAudienceCount ?? null),
      body: "Blocked audience rows already supported by current schema truth.",
    },
  ];
  const audienceVisibilityCards: readonly SummaryMetricCard[] = [
    {
      label: "Public Activity",
      value: formatPublicActivityVisibility(audienceSummary?.publicActivityVisibility ?? null),
      body: "Profile-backed audience visibility truth now lives on the Platform profile record.",
    },
    {
      label: "Follower Surface",
      value: formatVisibilitySurface(audienceSummary?.followerSurfaceEnabled ?? null),
      body: "Shows whether follower visibility can appear on the Platform surface from current backed truth.",
    },
    {
      label: "Subscriber Surface",
      value: formatVisibilitySurface(audienceSummary?.subscriberSurfaceEnabled ?? null),
      body: "Shows whether subscriber visibility can appear on the Platform surface from current backed truth.",
    },
  ];
  const audienceUnavailableCards: readonly SummaryMetricCard[] = [
    {
      label: "VIP / Mod / Co-Host",
      value: "Later",
      body: "Audience-role rosters are not backed yet.",
      tone: "unavailable",
    },
  ];
  const audienceActionSummaryCards: readonly SummaryMetricCard[] = audienceActionResult
    ? [
      {
        label: "Last Action",
        value: formatAudienceActionLabel(audienceActionResult.action),
        body: audienceActionResult.message,
      },
      {
        label: "Result",
        value: formatAudienceActionStatus(audienceActionResult.status),
        body: `Required scope: ${audienceActionResult.requiredScope.replaceAll("_", " ")}`,
      },
      {
        label: "Request State",
        value: audienceActionResult.requestStatus
          ? audienceActionResult.requestStatus.replaceAll("_", " ").replace(/\b\w/g, (match: string) => match.toUpperCase())
          : "N/A",
        body: audienceActionResult.requestId
          ? `Request #${audienceActionResult.requestId}`
          : "No request id is attached to the latest action.",
      },
    ]
    : [];
  const analyticsSummaryCards: readonly SummaryMetricCard[] = [
    {
      label: "Watch-Party Sessions",
      value: formatCount(creatorAnalyticsSummary?.watchPartySessionsHosted ?? null),
      body: "Hosted title-driven watch-party rooms.",
    },
    {
      label: "Live Sessions",
      value: formatCount(creatorAnalyticsSummary?.liveSessionsHosted ?? null),
      body: "Hosted live-room sessions.",
    },
    {
      label: "Communication Rooms",
      value: formatCount(creatorAnalyticsSummary?.communicationRoomsHosted ?? null),
      body: "Hosted communication-room sessions.",
    },
    {
      label: "Active Hosted Rooms",
      value: formatCount(creatorAnalyticsSummary?.activeHostedRooms ?? null),
      body: "Current active rooms across watch-party/live and communication.",
    },
    {
      label: "Latest Hosted Activity",
      value: formatIsoDate(creatorAnalyticsSummary?.latestHostedActivityAt ?? null),
      body: "Most recent hosted room activity timestamp across landed room tables.",
    },
    {
      label: "Follower Signal",
      value: formatCount(creatorAnalyticsSummary?.followerCount ?? null),
      body: "Follower signal from the landed audience model.",
    },
    {
      label: "Subscriber Signal",
      value: formatCount(creatorAnalyticsSummary?.subscriberCount ?? null),
      body: "Subscriber signal from creator/Platform subscriber truth.",
    },
  ];
  const analyticsUnavailableCards: readonly SummaryMetricCard[] = analyticsUnavailableMetricDefinitions.reduce<SummaryMetricCard[]>((cards, definition) => {
      const status = creatorAnalyticsSummary?.dataStatus?.[definition.key] ?? "missing";
      if (status === "available") {
        return cards;
      }
      cards.push({
        label: definition.label,
        value: formatReadModelStatusValue(status),
        body: status === "later" ? definition.laterBody : definition.missingBody,
        tone: "unavailable" as const,
      });
      return cards;
    }, []);
  const safetySummaryCards: readonly SummaryMetricCard[] = [
    {
      label: "Actor Role",
      value: String(safetyAdminSummary?.actorRole ?? "member").replaceAll("_", " ").toUpperCase(),
      body: "Current moderation role truth from the existing access model.",
    },
    {
      label: "Admin Access",
      value: formatBooleanStatus(!!safetyAdminSummary?.canAccessAdmin),
      body: "Current admin reach stays grounded in operator/platform doctrine.",
    },
    {
      label: "Safety Review",
      value: formatBooleanStatus(!!safetyAdminSummary?.canReviewSafetyReports),
      body: "Report review access only appears when current moderation truth allows it.",
    },
    {
      label: "Official Protection",
      value: safetyAdminSummary?.isOfficial ? "Official" : "Member",
      body: safetyAdminSummary?.auditOwnerKey
        ? `Audit owner key: ${safetyAdminSummary.auditOwnerKey}`
        : "No official or operator audit key is attached to this Platform context.",
    },
  ];
  const safetySummarySecondaryCards: readonly SummaryMetricCard[] = [
    {
      label: "Platform Roles",
      value: safetyAdminSummary?.platformRoles?.length
        ? safetyAdminSummary.platformRoles.map((role) => role.toUpperCase()).join(" · ")
        : "None",
      body: "Current platform-role memberships for the signed-in identity.",
    },
    {
      label: "Recent Safety Reports",
      value: safetyAdminSummary?.recentSafetyReportCount == null
        ? "Unavailable"
        : String(safetyAdminSummary?.recentSafetyReportCount),
      body: safetyAdminSummary?.recentSafetyReportCount == null
        ? "The current account does not have report-queue review access."
        : "Current review-queue summary from existing safety-report access.",
      tone: safetyAdminSummary?.recentSafetyReportCount == null ? "unavailable" : "default",
    },
    {
      label: "Queue Sources",
      value: safetyAdminSummary?.recentSourceSurfaces == null
        ? "Unavailable"
        : safetyAdminSummary.recentSourceSurfaces.length
          ? safetyAdminSummary.recentSourceSurfaces.map((surface) => surface.replaceAll("-", " ").toUpperCase()).join(" · ")
          : "None",
      body: safetyAdminSummary?.recentSourceSurfaces == null
        ? "Recent review-source mix appears only when the current account can see the queue."
        : "Current source surfaces represented in the recent review queue slice.",
      tone: safetyAdminSummary?.recentSourceSurfaces == null ? "unavailable" : "default",
    },
    {
      label: "Platform Targets",
      value: safetyAdminSummary?.recentPlatformOwnedTargetCount == null
        ? "Unavailable"
        : String(safetyAdminSummary.recentPlatformOwnedTargetCount),
      body: safetyAdminSummary?.recentPlatformOwnedTargetCount == null
        ? "Platform-owned target count appears only when the current account can see the queue."
        : "Current number of platform-owned targets in the recent review queue slice.",
      tone: safetyAdminSummary?.recentPlatformOwnedTargetCount == null ? "unavailable" : "default",
    },
  ];
  const creatorRevenueSummaryCards: readonly SummaryMetricCard[] = [
    {
      label: "Ledger source",
      value: "Not active yet",
      body: "Chi'llwood ledger entries are the source of future creator balance truth.",
      tone: "unavailable",
    },
    {
      label: "Verified earnings",
      value: "Not active",
      body: "No verified earnings, paid status, or available balance is shown.",
      tone: "unavailable",
    },
    {
      label: "Adjustments",
      value: "No earnings yet",
      body: "Refunds, reversals, holds, and fraud checks must settle before payout review.",
      tone: "unavailable",
    },
  ];
  const creatorMonetizationSettings =
    creatorMonetizationSummary?.settings ?? DEFAULT_CREATOR_MONETIZATION_RUNTIME_FLAGS;
  const liveMoneyFeatureFlag = getMoneyFeatureFlag(moneyFeatureFlags, "live_money_enabled");
  const moneyCenterFeatureFlag = getMoneyFeatureFlag(moneyFeatureFlags, "money_center_visible");
  const providerHasLiveMoneyProof = providerReadinessSummary.some((row) => row.status === "active" && row.isLiveMoneyEnabled);
  const moneyCenterLiveActive =
    creatorMonetizationSettings.liveMoneyEnabled === true
    && liveMoneyFeatureFlag.state === "on"
    && providerHasLiveMoneyProof;
  const moneyCenterHomeStatus =
    moneyCenterFeatureFlag.state === "locked" ? "Blocked"
      : moneyCenterFeatureFlag.state === "off" || moneyCenterFeatureFlag.state === "maintenance" ? "Disabled"
        : moneyCenterLiveActive ? "Active"
          : "Not active";
  const moneyCenterHomeTone =
    moneyCenterHomeStatus === "Active" ? "default"
      : moneyCenterHomeStatus === "Blocked" ? "warning"
        : "muted";
  const creatorPayoutReadiness = resolveCreatorPayoutReadiness(
    creatorPayoutSummary,
    creatorMonetizationSettings,
  );
  const upcomingEvents = useMemo(
    () => creatorEvents.filter((event) => event.isUpcoming),
    [creatorEvents],
  );
  const otherCreatorEvents = useMemo(
    () => creatorEvents.filter((event) => !event.isUpcoming),
    [creatorEvents],
  );
  const liveNowEvents = useMemo(
    () => creatorEvents.filter((event) => event.isLiveNow),
    [creatorEvents],
  );
  const replayReadyEvents = useMemo(
    () => creatorEvents.filter((event) => event.replay.isReplayAvailableNow),
    [creatorEvents],
  );
  const reminderReadyEvents = useMemo(
    () => creatorEvents.filter((event) => event.reminder.state === "ready"),
    [creatorEvents],
  );
  const creatorReminderSummaryByEventId = useMemo(
    () => new Map(creatorReminderSummaries.map((summary) => [summary.event.id, summary])),
    [creatorReminderSummaries],
  );
  const activeReminderEnrollments = useMemo(
    () => creatorReminderSummaries.reduce((total, summary) => total + summary.activeReminderCount, 0),
    [creatorReminderSummaries],
  );
  const eventsWithReminderInterest = useMemo(
    () => creatorReminderSummaries.filter((summary) => summary.activeReminderCount > 0),
    [creatorReminderSummaries],
  );
  const analyticsEventSignalCards: readonly SummaryMetricCard[] = [
    {
      label: "Upcoming Events",
      value: String(upcomingEvents.length),
      body: "Scheduled creator events with future start times.",
    },
    {
      label: "Live Now Events",
      value: String(liveNowEvents.length),
      body: "Creator events currently marked live now.",
    },
    {
      label: "Replay Available",
      value: String(replayReadyEvents.length),
      body: "Ended creator events with replay open now.",
    },
    {
      label: "Reminder Enrollments",
      value: String(activeReminderEnrollments),
      body: "Active reminder enrollments across reminder-ready events.",
    },
  ];
  const nextUpcomingEvent = upcomingEvents[0] ?? null;
  const eventSummaryCards: readonly SummaryMetricCard[] = [
    {
      label: "Upcoming",
      value: String(upcomingEvents.length),
      body: nextUpcomingEvent
        ? `Next up: ${nextUpcomingEvent.eventTitle}`
        : "No future scheduled event is currently backed by creator event truth.",
    },
    {
      label: "Live Now",
      value: String(liveNowEvents.length),
      body: liveNowEvents.length
        ? liveNowEvents.map((event) => event.eventTitle).slice(0, 2).join(" · ")
        : "No creator event is currently marked live now.",
    },
    {
      label: "Replay Ready",
      value: String(replayReadyEvents.length),
      body: replayReadyEvents.length
        ? "Replay is backed for ended events currently open for viewing."
        : "No creator event replay is currently available.",
    },
    {
      label: "Reminder Ready",
      value: String(reminderReadyEvents.length),
      body: reminderReadyEvents.length
        ? "Scheduled events with start times are reminder-ready."
        : "No scheduled event is currently reminder-ready.",
    },
  ];
  const reminderEnrollmentCards: readonly SummaryMetricCard[] = [
    {
      label: "Reminder Enrollments",
      value: String(activeReminderEnrollments),
      body: activeReminderEnrollments
        ? `${activeReminderEnrollments} active reminder enrollment${activeReminderEnrollments === 1 ? "" : "s"} now back this creator schedule.`
        : "No viewer has enrolled in a reminder yet.",
    },
    {
      label: "Events With Interest",
      value: String(eventsWithReminderInterest.length),
      body: eventsWithReminderInterest.length
        ? eventsWithReminderInterest.map((summary) => summary.event.eventTitle).slice(0, 2).join(" · ")
        : "No creator event currently shows reminder interest.",
      tone: eventsWithReminderInterest.length ? "default" : "unavailable",
    },
  ];
  const channelName = String(profile?.displayName || profile?.username || "Your Platform").trim();
  const channelTagline = String(profile?.tagline ?? "").trim();
  const channelInitial = channelName.charAt(0).toUpperCase() || "C";
  const activeBrandProfile = brandDraft ?? platformBranding?.profile ?? null;
  const brandHeroSource = getPlatformBrandHeroSource(platformBranding);
  const brandHeroStatus = formatPlatformBrandAssetStatus(platformBranding?.heroImage);
  const brandBackgroundStatus = formatPlatformBrandAssetStatus(platformBranding?.backgroundImage);
  const brandKitReady = !!(platformBranding?.avatar || platformBranding?.logo || profile?.avatarUrl);
  const brandHasPendingReview = (platformBranding?.assets ?? []).some((asset) => asset.moderationStatus === "pending_review");
  const brandReviewAssets = (platformBranding?.assets ?? []).filter((asset) => (
    !asset.deletedAt
    && asset.assetState !== "archived"
    && ["hero_image", "background_image", "avatar", "logo"].includes(asset.assetType)
  ));
  const brandPendingReviewCount = brandReviewAssets.filter((asset) => asset.moderationStatus === "pending_review").length;
  const brandReviewQueuePendingCount = brandReviewQueueAssets.filter((asset) => asset.moderationStatus === "pending_review").length;
  const brandReviewDisplayAssets = Array.from(
    new Map([...brandReviewQueueAssets, ...brandReviewAssets].map((asset) => [asset.id, asset])).values(),
  );
  const brandPublished = !!activeBrandProfile?.publishedAt;
  const brandStatusLabel = brandHasPendingReview ? "Needs review" : brandPublished ? "Published" : "Draft changes";
  const approvedClipBrandAsset = useMemo(
    () => [platformBranding?.logo, platformBranding?.avatar, platformBranding?.watermark].find((asset) => (
      !!asset
      && asset.assetState === "published"
      && ["clean", "reported"].includes(asset.moderationStatus)
      && !asset.deletedAt
    )) ?? null,
    [platformBranding?.avatar, platformBranding?.logo, platformBranding?.watermark],
  );
  const publishedVideoCount = creatorVideos.filter((video) => video.visibility === "public").length;
  const draftVideoCount = creatorVideos.filter((video) => video.visibility === "draft").length;
  const latestCreatorVideo = useMemo(
    () => [...creatorVideos].sort((a, b) => getCreatorVideoCreatedTimestamp(b) - getCreatorVideoCreatedTimestamp(a))[0] ?? null,
    [creatorVideos],
  );
  const filteredCreatorVideos = useMemo(() => {
    const query = contentSearchQuery.trim().toLowerCase();
    return creatorVideos
      .filter((video) => {
        if (contentStatusFilter === "published" && video.visibility !== "public") return false;
        if (contentStatusFilter === "drafts" && video.visibility !== "draft") return false;
        if (!query) return true;
        return `${video.title} ${video.description}`.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        const diff = getCreatorVideoCreatedTimestamp(a) - getCreatorVideoCreatedTimestamp(b);
        return contentSort === "oldest" ? diff : -diff;
      });
  }, [contentSearchQuery, contentSort, contentStatusFilter, creatorVideos]);
  const videoLifecycleCopy = getVideoLifecycleCopy({
    editingVideoId: videoEditor.editingVideoId,
    selectedFile: selectedVideoFile,
    titleReady: videoTitleReady,
    saving: videoSaving,
    lifecycleState: videoLifecycleState,
    notice: videoNotice,
  });
  const audienceFollowerCount = typeof audienceSummary?.followerCount === "number" ? audienceSummary.followerCount : null;
  const audienceSubscriberCount = typeof audienceSummary?.subscriberCount === "number" ? audienceSummary.subscriberCount : null;
  const pendingAudienceRequestCount = typeof audienceSummary?.pendingRequestCount === "number" ? audienceSummary.pendingRequestCount : null;
  const blockedAudienceCount = typeof audienceSummary?.blockedAudienceCount === "number" ? audienceSummary.blockedAudienceCount : null;
  const recentSafetyReportCount = typeof safetyAdminSummary?.recentSafetyReportCount === "number"
    ? safetyAdminSummary.recentSafetyReportCount
    : null;
  const channelRoleLabel = formatChannelRoleLabel(profile?.channelRole ?? null);
  const platformIdentityPillLabel = channelRoleLabel === "Viewer" ? "Platform access" : channelRoleLabel;
  const needsAttentionItems: readonly {
    title: string;
    body: string;
    tab: StudioTabId;
  }[] = [
    ...(draftVideoCount > 0 ? [{
      title: "Drafts waiting",
      body: `${draftVideoCount} draft${draftVideoCount === 1 ? "" : "s"} can be reviewed for publish.`,
      tab: "content" as const,
    }] : []),
    ...((pendingAudienceRequestCount ?? 0) > 0 ? [{
      title: "Audience requests",
      body: `${pendingAudienceRequestCount} request${pendingAudienceRequestCount === 1 ? "" : "s"} need review.`,
      tab: "audience" as const,
    }] : []),
    ...((recentSafetyReportCount ?? 0) > 0 ? [{
      title: "Safety review",
      body: `${recentSafetyReportCount} recent report${recentSafetyReportCount === 1 ? "" : "s"} are visible to this account.`,
      tab: "moderation" as const,
    }] : []),
  ];
  const todayCards: readonly {
    label: string;
    value: string;
    body: string;
    tab: StudioTabId;
  }[] = [
    {
      label: "Published",
      value: videosLoading ? "..." : String(publishedVideoCount),
      body: publishedVideoCount ? "Public videos" : "No public videos",
      tab: "content",
    },
    {
      label: "Drafts",
      value: videosLoading ? "..." : String(draftVideoCount),
      body: draftVideoCount ? "Waiting to publish" : "No drafts",
      tab: "content",
    },
    {
      label: "Events",
      value: eventsLoading ? "..." : String(upcomingEvents.length),
      body: upcomingEvents.length ? "Upcoming" : "No events scheduled",
      tab: "live",
    },
    {
      label: "Needs attention",
      value: needsAttentionItems.length ? String(needsAttentionItems.length) : "Clear",
      body: needsAttentionItems.length ? "Review tasks" : "All clear",
      tab: needsAttentionItems[0]?.tab ?? "home",
    },
  ];
  const insightMetricCards: readonly SummaryMetricCard[] = [
    {
      label: "Published Videos",
      value: videosLoading ? "..." : String(publishedVideoCount),
      body: "Public creator videos loaded for this Platform.",
    },
    {
      label: "Drafts",
      value: videosLoading ? "..." : String(draftVideoCount),
      body: "Owner-only creator uploads loaded for this Platform.",
    },
    ...(audienceFollowerCount == null ? [] : [{
      label: "Followers",
      value: String(audienceFollowerCount),
      body: "Backed Platform follower relationships.",
    }]),
    ...(pendingAudienceRequestCount == null ? [] : [{
      label: "Audience Requests",
      value: String(pendingAudienceRequestCount),
      body: "Pending backed audience requests.",
    }]),
    ...(blockedAudienceCount == null ? [] : [{
      label: "Blocked Users",
      value: String(blockedAudienceCount),
      body: "Blocked audience rows in current Platform truth.",
    }]),
    ...(audienceSubscriberCount == null ? [] : [{
      label: "Subscribers",
      value: String(audienceSubscriberCount),
      body: "Creator/Platform subscriber signal only.",
    }]),
    {
      label: "Upcoming Events",
      value: eventsLoading ? "..." : String(upcomingEvents.length),
      body: "Scheduled creator events with future start times.",
    },
  ];

  const renderContentPanel = () => {
    const filteredEmptyCopy = contentStatusFilter === "published"
      ? "No published videos yet. Publish a draft when it is ready."
      : contentStatusFilter === "drafts"
        ? "No drafts right now."
        : "No platform videos yet. Upload your first video.";

    return (
    <View style={[styles.panel, styles.creatorContentPanel]}>
      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderCopy}>
          <Text style={styles.panelTitle}>Content</Text>
          <Text style={styles.panelSubtitle}>Manage your platform videos, drafts, and published uploads.</Text>
        </View>
      </View>
      <Text style={styles.permissionCopy}>
        Upload playable videos to your public platform. Drafts stay visible only to you; public videos can appear on your Profile/Platform and open in Player.
      </Text>

      <View style={styles.studioHeaderActions}>
        <TouchableOpacity
          style={[styles.studioActionButton, styles.studioActionButtonPrimary]}
          activeOpacity={0.88}
          onPress={openClipStudioForNew}
        >
          <Text style={styles.studioActionButtonText}>Create Clip</Text>
          <Text style={styles.studioActionButtonCopy}>Open Clip Studio</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.studioActionButton}
          activeOpacity={0.88}
          onPress={() => openStudioTab("content", { filter: "all", focus: "upload" })}
        >
          <Text style={styles.studioActionButtonText}>Classic Upload</Text>
          <Text style={styles.studioActionButtonCopy}>Existing flow</Text>
        </TouchableOpacity>
      </View>

      {videoNotice ? (
        <View style={styles.noticeCard}>
          <Text style={styles.noticeText}>{videoNotice}</Text>
        </View>
      ) : null}

      <View style={styles.summaryGrid}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Videos</Text>
          <Text style={styles.summaryValue}>{videosLoading ? "..." : String(creatorVideos.length)}</Text>
          <Text style={styles.summaryBody}>creator-owned uploads in this platform library</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Published</Text>
          <Text style={styles.summaryValue}>
            {videosLoading ? "..." : String(publishedVideoCount)}
          </Text>
          <Text style={styles.summaryBody}>visible to public profile visitors</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Drafts</Text>
          <Text style={styles.summaryValue}>
            {videosLoading ? "..." : String(draftVideoCount)}
          </Text>
          <Text style={styles.summaryBody}>owner-only until published</Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>Status</Text>
      <View style={styles.segmentRow}>
        {CONTENT_STATUS_FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter.id}
            style={[styles.segmentButton, contentStatusFilter === filter.id && styles.segmentButtonActive]}
            activeOpacity={0.86}
            onPress={() => setContentStatusFilter(filter.id)}
          >
            <Text style={[styles.segmentButtonText, contentStatusFilter === filter.id && styles.segmentButtonTextActive]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Search videos</Text>
      <TextInput
        style={styles.input}
        placeholder="Search videos"
        placeholderTextColor="#8d8d8d"
        value={contentSearchQuery}
        onChangeText={setContentSearchQuery}
        autoCapitalize="none"
      />

      <Text style={styles.sectionLabel}>Sort</Text>
      <View style={styles.segmentRow}>
        {CONTENT_SORT_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.id}
            style={[styles.segmentButton, contentSort === option.id && styles.segmentButtonActive]}
            activeOpacity={0.86}
            onPress={() => setContentSort(option.id)}
          >
            <Text style={[styles.segmentButtonText, contentSort === option.id && styles.segmentButtonTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionLabel}>Creator Library</Text>
      {videosLoading ? (
        <View style={styles.loadingCard}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.loadingText}>Loading creator videos...</Text>
        </View>
      ) : videosLoadError ? (
        <View style={styles.eventEmptyCard}>
          <Text style={styles.eventEmptyTitle}>{"Creator videos couldn't refresh"}</Text>
          <Text style={styles.eventEmptyBody}>{videosLoadError}</Text>
          <TouchableOpacity
            style={styles.eventSecondaryButton}
            activeOpacity={0.86}
            onPress={() => {
              void loadCreatorVideos();
            }}
          >
            <Text style={styles.eventSecondaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : creatorVideos.length && filteredCreatorVideos.length ? (
        <View style={styles.eventList}>
          {filteredCreatorVideos.map((video) => (
            <CreatorVideoCard
              key={video.id}
              video={video}
              mode="owner"
              clipEdit={creatorVideoClipEdits[video.id] ?? null}
              busy={videoSaving}
              onOpen={() => router.push({ pathname: "/player/[id]", params: { id: video.id, source: "creator-video" } })}
              onEdit={() => onEditVideo(video)}
              onEditClip={() => openClipStudioForVideo(video)}
              onToggleVisibility={() => onToggleVideoVisibility(video)}
              onDelete={() => onDeleteVideo(video)}
            />
          ))}
        </View>
      ) : creatorVideos.length ? (
        <View style={styles.eventEmptyCard}>
          <Text style={styles.eventEmptyTitle}>No matching videos</Text>
          <Text style={styles.eventEmptyBody}>{filteredEmptyCopy}</Text>
        </View>
      ) : (
        <View style={styles.eventEmptyCard}>
          <Text style={styles.eventEmptyTitle}>No platform videos yet</Text>
          <Text style={styles.eventEmptyBody}>
            {"No platform videos yet. Use the Video Upload form below when you're ready."}
          </Text>
        </View>
      )}

      <Text style={styles.sectionLabel}>
        {videoEditor.editingVideoId ? "Edit Video" : "Video Upload"}
      </Text>
      <View
        style={[
          styles.uploadLifecycleInline,
          videoLifecycleCopy.tone === "ready" && styles.uploadLifecycleInlineReady,
          videoLifecycleCopy.tone === "active" && styles.uploadLifecycleInlineActive,
          videoLifecycleCopy.tone === "success" && styles.uploadLifecycleInlineSuccess,
          videoLifecycleCopy.tone === "error" && styles.uploadLifecycleInlineError,
        ]}
      >
        <View style={styles.uploadLifecycleHeader}>
          <Text style={styles.uploadLifecycleLabel}>Upload Status</Text>
          <Text
            style={[
              styles.uploadLifecycleStatus,
              videoLifecycleCopy.tone === "ready" && styles.uploadLifecycleStatusReady,
              videoLifecycleCopy.tone === "active" && styles.uploadLifecycleStatusActive,
              videoLifecycleCopy.tone === "success" && styles.uploadLifecycleStatusSuccess,
              videoLifecycleCopy.tone === "error" && styles.uploadLifecycleStatusError,
            ]}
          >
            {videoLifecycleCopy.label}
          </Text>
        </View>
        <Text style={styles.uploadLifecycleBody}>{videoLifecycleCopy.body}</Text>
      </View>
      {!videoEditor.editingVideoId ? (
        <TouchableOpacity
          style={styles.eventSecondaryButton}
          activeOpacity={0.86}
          onPress={onPickVideoFile}
          disabled={videoSaving}
        >
          <Text style={styles.eventSecondaryButtonText} numberOfLines={2}>
            {selectedVideoFile?.name ? selectedVideoFile.name : "Choose Video File"}
          </Text>
        </TouchableOpacity>
      ) : null}
      {selectedVideoFile && !videoEditor.editingVideoId ? (
        <Text style={styles.videoSelectedFileText} numberOfLines={2}>
          Selected: {selectedVideoFile.name || "video file"}
        </Text>
      ) : null}
      <TextInput
        style={styles.input}
        placeholder="Video title"
        placeholderTextColor="#8d8d8d"
        value={videoEditor.title}
        onChangeText={(text) => updateVideoEditor({ title: text })}
      />
      <TextInput
        style={[styles.input, styles.textArea]}
        placeholder="Description"
        placeholderTextColor="#8d8d8d"
        value={videoEditor.description}
        onChangeText={(text) => updateVideoEditor({ description: text })}
        multiline
      />
      <TextInput
        style={styles.input}
        placeholder="Thumbnail URL (optional)"
        placeholderTextColor="#8d8d8d"
        value={videoEditor.thumbUrl}
        onChangeText={(text) => updateVideoEditor({ thumbUrl: text })}
        autoCapitalize="none"
      />
      <Text style={styles.sectionLabel}>Visibility</Text>
      <View style={styles.chipRow}>
        {(["draft", "public"] as const).map((value) => (
          <TouchableOpacity
            key={value}
            style={[styles.chip, videoEditor.visibility === value && styles.chipActive]}
            onPress={() => updateVideoEditor({ visibility: value })}
            disabled={videoSaving}
          >
            <Text style={[styles.chipText, videoEditor.visibility === value && styles.chipTextActive]}>
              {value.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {videoSubmitRequirement ? (
        <Text style={styles.videoRequirementText}>{videoSubmitRequirement}</Text>
      ) : null}
      <View style={styles.eventActionRow}>
        <TouchableOpacity
          style={[styles.eventPrimaryButton, isVideoSubmitDisabled && styles.eventPrimaryButtonDisabled]}
          onPress={onSaveVideo}
          activeOpacity={0.88}
          disabled={isVideoSubmitDisabled}
        >
          {videoSaving ? (
            <View style={styles.eventPrimaryButtonBusyRow}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.eventPrimaryButtonText}>
                {videoEditor.editingVideoId ? "Saving..." : "Uploading..."}
              </Text>
            </View>
          ) : (
            <Text style={styles.eventPrimaryButtonText}>
              {videoEditor.editingVideoId ? "Update Video" : "Upload Video"}
            </Text>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.eventSecondaryButton}
          onPress={() => resetVideoEditor()}
          activeOpacity={0.88}
          disabled={videoSaving}
        >
          <Text style={styles.eventSecondaryButtonText}>Clear</Text>
        </TouchableOpacity>
      </View>
    </View>
    );
  };

  const renderClipStudioTab = () => {
    const previewVideoUri = selectedClipVideoFile?.uri || clipEditor.videoPreviewUrl || "";
    const coverPreviewUri = selectedClipCoverFile?.uri || clipEditor.coverPreviewUrl;
    const hasSavedVideo = !!clipEditor.editingVideoId;
    const hasWorkingVideo = !!previewVideoUri || hasSavedVideo;
    const clipTitleReady = clipEditor.title.trim().length > 0;
    const isClipVideoTooLarge = !!selectedClipVideoFile
      && isCreatorVideoFileOverChannelMovieLimit(selectedClipVideoFile, maxUploadSizeMb);
    const titleOverlayValidation = getClipStudioTitleOverlayValidationMessage(
      clipEditor.titleOverlayText,
      clipEditor.titleOverlaySubtitle,
    );
    const clipSaveDraftRequirement = !hasSavedVideo && !selectedClipVideoFile
      ? "Choose a video to enable Save Draft."
      : !clipTitleReady
        ? "Enter a title to enable Save Draft."
        : !hasSavedVideo && !uploadsEnabled
          ? "Creator video uploads are temporarily paused."
          : isClipVideoTooLarge
            ? getCreatorVideoTooLargeMessage(selectedClipVideoFile?.size, maxUploadSizeMb)
            : titleOverlayValidation
              ? titleOverlayValidation
              : clipEditor.brandMarkEnabled && !approvedClipBrandAsset
                ? "Publish and approve a Platform avatar or logo before using the brand mark."
                : "";
    const clipPublishRequirement = !hasWorkingVideo
      ? "Choose a video before publishing."
      : !clipTitleReady
        ? "Enter a title before publishing."
        : isClipVideoTooLarge
          ? getCreatorVideoTooLargeMessage(selectedClipVideoFile?.size, maxUploadSizeMb)
          : titleOverlayValidation
            ? titleOverlayValidation
            : "";
    const previewAspectRatio = clipEditor.clipFormat === "square_1_1"
      ? 1
      : clipEditor.clipFormat === "landscape_16_9"
        ? 16 / 9
        : 9 / 16;
    const previewResizeMode = clipEditor.fitMode === "fill" ? ResizeMode.COVER : ResizeMode.CONTAIN;
    const clipStatus = clipSaveState === "saving"
      ? "Saving"
      : clipSaveState === "retrying"
        ? "Retrying"
        : clipSaveState === "save_failed"
          ? "Save failed"
          : clipSaveState === "saved" && hasSavedVideo
            ? clipEditor.visibility === "public" ? "Published" : "Saved draft"
            : clipSaveState === "selecting_video"
              ? "Choosing video"
              : clipSaveState === "selecting_cover"
                ? "Choosing cover"
                : hasSavedVideo
                  ? clipEditor.visibility === "public" ? "Published" : "Draft"
                  : selectedClipVideoFile
                    ? "Ready to save"
                    : "Unsaved";
    const clipStatusTone = !hasWorkingVideo
      ? "muted"
      : clipSaveState === "save_failed"
        ? "warning"
        : "default";
    const shouldShowViewDraftAction =
      clipSaveState === "saved"
      && !!clipSavedVideoId
      && clipEditor.visibility === "draft";
    const primaryClipActionLabel = shouldShowViewDraftAction
      ? "View Draft"
      : clipSaving
        ? "Saving..."
        : clipSaveState === "save_failed"
          ? "Retry Save Draft"
          : "Save Draft";
    const isPrimaryClipActionDisabled = shouldShowViewDraftAction
      ? false
      : clipSaving || !!clipSaveDraftRequirement;
    const isPublishClipDisabled = clipSaving || !!clipPublishRequirement;
    const brandMarkReady = !!approvedClipBrandAsset;
    const selectedTemplateLabel = formatClipStudioTemplateLabel(clipEditor.templatePreset);
    const selectedTemplateConfig = getClipStudioTemplatePresetConfig(clipEditor.templatePreset);
    const titleOverlayCharacterCount = clipEditor.titleOverlayText.trim().length;
    const subtitleOverlayCharacterCount = clipEditor.titleOverlaySubtitle.trim().length;

    return (
      <View style={[styles.panel, styles.clipStudioPanel]}>
        <View style={styles.panelHeader}>
          <View style={styles.panelHeaderCopy}>
            <Text style={styles.panelTitle}>Clip Studio</Text>
            <Text style={styles.panelSubtitle}>Prepare your video before publishing.</Text>
          </View>
          {renderStudioStatusPill(clipStatus, clipStatusTone)}
        </View>

        <View style={styles.clipPreviewShell}>
          <View style={[styles.clipPreviewFrame, { aspectRatio: previewAspectRatio }]}>
            {previewVideoUri ? (
              <Video
                source={{ uri: previewVideoUri }}
                style={styles.clipPreviewMedia}
                resizeMode={previewResizeMode}
                useNativeControls
                shouldPlay={false}
                isMuted
              />
            ) : coverPreviewUri ? (
              <Image source={{ uri: coverPreviewUri }} style={styles.clipPreviewMedia} resizeMode={clipEditor.fitMode === "fill" ? "cover" : "contain"} />
            ) : (
              <ImageBackground source={SKYLINE_SOURCE} style={styles.clipPreviewFallback} resizeMode="cover">
                <View style={styles.brandPreviewFallbackScrim} />
                <Text style={styles.brandPreviewFallbackText}>CLIP STUDIO</Text>
              </ImageBackground>
            )}
            <View pointerEvents="none" style={styles.clipSafeAreaFrame} />
            {clipEditor.titleOverlayText.trim() || clipEditor.titleOverlaySubtitle.trim() ? (
              <View
                pointerEvents="none"
                style={[
                  styles.clipTitleOverlay,
                  clipEditor.titleOverlayPosition === "top" && styles.clipTitleOverlayTop,
                  clipEditor.titleOverlayPosition === "center" && styles.clipTitleOverlayCenter,
                  clipEditor.titleOverlayStyle === "bold" && styles.clipTitleOverlayBold,
                  clipEditor.titleOverlayStyle === "spotlight" && styles.clipTitleOverlaySpotlight,
                  clipEditor.titleOverlayStyle === "trailer" && styles.clipTitleOverlayTrailer,
                ]}
              >
                {clipEditor.titleOverlayText.trim() ? (
                  <Text style={styles.clipTitleOverlayText} numberOfLines={2}>{clipEditor.titleOverlayText.trim()}</Text>
                ) : null}
                {clipEditor.titleOverlaySubtitle.trim() ? (
                  <Text style={styles.clipTitleOverlaySubtitle} numberOfLines={2}>{clipEditor.titleOverlaySubtitle.trim()}</Text>
                ) : null}
              </View>
            ) : null}
            {clipEditor.brandMarkEnabled && approvedClipBrandAsset?.signedUrl ? (
              <Image source={{ uri: approvedClipBrandAsset.signedUrl }} style={styles.clipBrandMarkPreview} />
            ) : null}
          </View>
          <View style={styles.clipPreviewCopy}>
            <Text style={styles.clipPreviewKicker}>Preview</Text>
            <Text style={styles.brandPreviewTitle}>
              {hasWorkingVideo ? (clipEditor.title.trim() || "Untitled Clip") : "No video selected"}
            </Text>
            <Text style={styles.brandPreviewBody}>
              {hasWorkingVideo
                ? `${formatClipStudioFormatLabel(clipEditor.clipFormat)} · ${clipEditor.fitMode.toUpperCase()} · ${selectedTemplateLabel}`
                : "Choose a video from your device to preview a Clip Studio draft."}
            </Text>
            <Text style={styles.brandPreviewMeta}>
              {previewVideoUri
                ? "Preview crop is used for display. Final export editing is coming later."
                : coverPreviewUri
                  ? "Preview is using the selected cover."
                  : "Preview uses a neutral placeholder until media or cover is ready."}
            </Text>
          </View>
        </View>

        {clipNotice ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>{clipNotice}</Text>
          </View>
        ) : null}

        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Source</Text>
            <Text style={styles.summaryValue}>{selectedClipVideoFile ? "Selected" : hasSavedVideo ? "Saved" : "Needed"}</Text>
            <Text style={styles.summaryBody}>{selectedClipVideoFile?.name || (hasSavedVideo ? "Using existing creator video." : "Choose a video to begin.")}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Save State</Text>
            <Text style={styles.summaryValue}>{clipStatus}</Text>
            <Text style={styles.summaryBody}>
              {clipSaveState === "saved"
                ? "Confirmed in your Content Library."
                : clipSaveDraftRequirement || "Ready for a confirmed draft save."}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Cover</Text>
            <Text style={styles.summaryValue}>{coverPreviewUri ? "Ready" : "Optional"}</Text>
            <Text style={styles.summaryBody}>{coverPreviewUri ? "Cover preview is staged." : "Upload a cover image when ready."}</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Public display</Text>
            <Text style={styles.summaryValue}>Editor preview only</Text>
            <Text style={styles.summaryBody}>Title cards and templates reopen here after Save Draft.</Text>
          </View>
        </View>

        <View style={styles.studioAccordionStack}>
          {renderClipAccordion({
            id: "media",
            title: "Media",
            summary: "Choose or replace the video source.",
            status: selectedClipVideoFile ? "Selected" : hasSavedVideo ? "Saved" : "Needed",
            statusTone: hasWorkingVideo ? "default" : "muted",
            children: (
              <>
                <View style={styles.studioHeaderActions}>
                  <TouchableOpacity
                    style={[styles.studioActionButton, styles.studioActionButtonPrimary, clipSaving && styles.studioActionButtonDisabled]}
                    activeOpacity={0.88}
                    onPress={onPickClipVideoFile}
                    disabled={clipSaving}
                  >
                    <Text style={styles.studioActionButtonText}>{selectedClipVideoFile || hasSavedVideo ? "Replace Video" : "Choose Video"}</Text>
                    <Text style={styles.studioActionButtonCopy}>Open picker</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.studioActionButton}
                    activeOpacity={0.88}
                    onPress={() => openStudioTab("home")}
                    disabled={clipSaving}
                  >
                    <Text style={styles.studioActionButtonText}>Back to Studio</Text>
                    <Text style={styles.studioActionButtonCopy}>Return home</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.brandPreviewMeta}>
                  {selectedClipVideoFile?.name || (hasSavedVideo ? "Using the saved creator video." : "Choose a video to start a draft.")}
                </Text>
              </>
            ),
          })}

          {renderClipAccordion({
            id: "cover",
            title: "Cover Image",
            summary: "Upload a private cover image for this creator video.",
            status: coverPreviewUri ? "Selected" : "Optional",
            statusTone: coverPreviewUri ? "default" : "muted",
            children: (
              <>
                <TouchableOpacity
                  style={[styles.eventSecondaryButton, clipSaving && styles.eventPrimaryButtonDisabled]}
                  activeOpacity={0.86}
                  onPress={onPickClipCoverFile}
                  disabled={clipSaving}
                >
                  <Text style={styles.eventSecondaryButtonText}>{coverPreviewUri ? "Replace Cover Image" : "Choose Cover Image"}</Text>
                </TouchableOpacity>
                {coverPreviewUri ? (
                  <Image source={{ uri: coverPreviewUri }} style={styles.clipCoverPreview} resizeMode="cover" />
                ) : (
                  <View style={styles.eventEmptyCard}>
                    <Text style={styles.eventEmptyTitle}>No cover selected</Text>
                    <Text style={styles.eventEmptyBody}>
                      Upload a JPG, PNG, or WebP image. Frame picking from video is deferred until real extraction support exists.
                    </Text>
                  </View>
                )}
              </>
            ),
          })}

          {renderClipAccordion({
            id: "title",
            title: "Title Card",
            summary: "Add a title for this clip.",
            status: clipEditor.titleOverlayText.trim() ? "Set" : "Optional",
            statusTone: clipEditor.titleOverlayText.trim() ? "default" : "muted",
            children: (
              <>
                <Text style={styles.brandPreviewMeta}>Add a title for this clip.</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Title text"
                  placeholderTextColor="#8d8d8d"
                  value={clipEditor.titleOverlayText}
                  onChangeText={(text) => updateClipEditor({ titleOverlayText: text })}
                  maxLength={CLIP_STUDIO_TITLE_OVERLAY_MAX_LENGTH}
                />
                <Text style={styles.inputMeta}>
                  {titleOverlayCharacterCount}/{CLIP_STUDIO_TITLE_OVERLAY_MAX_LENGTH}
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Subtitle text"
                  placeholderTextColor="#8d8d8d"
                  value={clipEditor.titleOverlaySubtitle}
                  onChangeText={(text) => updateClipEditor({ titleOverlaySubtitle: text })}
                  maxLength={CLIP_STUDIO_SUBTITLE_OVERLAY_MAX_LENGTH}
                />
                <Text style={styles.inputMeta}>
                  {subtitleOverlayCharacterCount}/{CLIP_STUDIO_SUBTITLE_OVERLAY_MAX_LENGTH}
                </Text>
                <Text style={styles.sectionLabel}>Placement</Text>
                <View style={styles.segmentRow}>
                  {CLIP_OVERLAY_POSITION_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.segmentButton, clipEditor.titleOverlayPosition === option.id && styles.segmentButtonActive]}
                      activeOpacity={0.86}
                      onPress={() => updateClipEditor({ titleOverlayPosition: option.id })}
                    >
                      <Text style={[styles.segmentButtonText, clipEditor.titleOverlayPosition === option.id && styles.segmentButtonTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.sectionLabel}>Style</Text>
                <View style={styles.segmentRow}>
                  {CLIP_OVERLAY_STYLE_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.segmentButton, clipEditor.titleOverlayStyle === option.id && styles.segmentButtonActive]}
                      activeOpacity={0.86}
                      onPress={() => updateClipEditor({ titleOverlayStyle: option.id })}
                    >
                      <Text style={[styles.segmentButtonText, clipEditor.titleOverlayStyle === option.id && styles.segmentButtonTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.eventEmptyCard}>
                  <Text style={styles.eventEmptyTitle}>Public display</Text>
                  <Text style={styles.eventEmptyBody}>
                    Editor preview only. Title cards save with your draft and reopen here.
                  </Text>
                </View>
              </>
            ),
          })}

          {renderClipAccordion({
            id: "templates",
            title: "Templates",
            summary: "Pick a metadata preset for this clip.",
            status: selectedTemplateLabel,
            children: (
              <>
                <View style={styles.brandThemeGrid}>
                  {CLIP_TEMPLATE_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.brandThemeCard, clipEditor.templatePreset === option.id && styles.brandThemeCardActive]}
                      activeOpacity={0.86}
                      onPress={() => applyClipTemplatePreset(option.id)}
                      disabled={clipSaving}
                    >
                      <Text style={styles.brandThemeTitle}>{option.label}</Text>
                      <Text style={styles.brandThemeBody}>{option.body}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.eventEmptyCard}>
                  <Text style={styles.eventEmptyTitle}>{selectedTemplateLabel} selected</Text>
                  <Text style={styles.eventEmptyBody}>
                    {`${selectedTemplateConfig.formatSuggestion}. ${selectedTemplateConfig.coverLayoutSuggestion}`}
                  </Text>
                </View>
              </>
            ),
          })}

          {renderClipAccordion({
            id: "format",
            title: "Format",
            summary: "Choose frame shape and preview fit.",
            status: formatClipStudioFormatLabel(clipEditor.clipFormat),
            children: (
              <>
                <Text style={styles.sectionLabel}>Frame</Text>
                <View style={styles.brandThemeGrid}>
                  {CLIP_FORMAT_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.brandThemeCard, clipEditor.clipFormat === option.id && styles.brandThemeCardActive]}
                      activeOpacity={0.86}
                      onPress={() => updateClipEditor({ clipFormat: option.id })}
                      disabled={clipSaving}
                    >
                      <Text style={styles.brandThemeTitle}>{option.label}</Text>
                      <Text style={styles.brandThemeBody}>{option.body}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.sectionLabel}>Fit</Text>
                <View style={styles.segmentRow}>
                  {CLIP_FIT_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.segmentButton, clipEditor.fitMode === option.id && styles.segmentButtonActive]}
                      activeOpacity={0.86}
                      onPress={() => updateClipEditor({ fitMode: option.id })}
                      disabled={clipSaving}
                    >
                      <Text style={[styles.segmentButtonText, clipEditor.fitMode === option.id && styles.segmentButtonTextActive]}>
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.eventEmptyCard}>
                  <Text style={styles.eventEmptyTitle}>Trim/export is coming later.</Text>
                  <Text style={styles.eventEmptyBody}>
                    Clip Studio stores display metadata only in this MVP. It does not render a permanent crop or trimmed video.
                  </Text>
                </View>
              </>
            ),
          })}

          {renderClipAccordion({
            id: "save",
            title: "Save",
            summary: "Confirm details and save the draft.",
            status: clipSaveState === "saved" ? "Confirmed" : "Save Draft",
            statusTone: clipSaveState === "save_failed" ? "warning" : clipSaveState === "saved" ? "default" : "muted",
            children: (
              <>
                <Text style={styles.sectionLabel}>Clip Details</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Clip title"
                  placeholderTextColor="#8d8d8d"
                  value={clipEditor.title}
                  onChangeText={(text) => updateClipEditor({ title: text })}
                />
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Description"
                  placeholderTextColor="#8d8d8d"
                  value={clipEditor.description}
                  onChangeText={(text) => updateClipEditor({ description: text })}
                  multiline
                />
                <View style={styles.eventActionRow}>
                  <TouchableOpacity
                    style={[styles.eventPrimaryButton, isPrimaryClipActionDisabled && styles.eventPrimaryButtonDisabled]}
                    activeOpacity={0.88}
                    onPress={() => {
                      if (shouldShowViewDraftAction) {
                        openStudioTab("content", { filter: "drafts", focus: "library" });
                        return;
                      }
                      onSaveClipDraft();
                    }}
                    disabled={isPrimaryClipActionDisabled}
                  >
                    {clipSaving ? (
                      <View style={styles.eventPrimaryButtonBusyRow}>
                        <ActivityIndicator color="#fff" />
                        <Text style={styles.eventPrimaryButtonText}>{primaryClipActionLabel}</Text>
                      </View>
                    ) : (
                      <Text style={styles.eventPrimaryButtonText}>{primaryClipActionLabel}</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.eventSecondaryButton, isPublishClipDisabled && styles.eventPrimaryButtonDisabled]}
                    activeOpacity={0.88}
                    onPress={onPublishClip}
                    disabled={isPublishClipDisabled}
                  >
                    <Text style={styles.eventSecondaryButtonText}>Publish Clip</Text>
                  </TouchableOpacity>
                </View>
                <TouchableOpacity
                  style={styles.eventSecondaryButton}
                  activeOpacity={0.88}
                  onPress={() => openStudioTab("content", { filter: "all", focus: "library" })}
                  disabled={clipSaving}
                >
                  <Text style={styles.eventSecondaryButtonText}>Back to Content Library</Text>
                </TouchableOpacity>
              </>
            ),
          })}

          {renderClipAccordion({
            id: "brand",
            title: "Platform Brand",
            summary: "Preview a safe Platform logo mark when available.",
            status: brandMarkReady ? "Ready" : "Coming later",
            statusTone: brandMarkReady ? "default" : "muted",
            children: brandMarkReady ? (
              <>
                <TouchableOpacity
                  style={[styles.legalAcknowledgementRow, clipEditor.brandMarkEnabled && styles.legalAcknowledgementRowActive]}
                  activeOpacity={0.86}
                  onPress={() => updateClipEditor({
                    brandMarkEnabled: !clipEditor.brandMarkEnabled,
                    brandAssetId: !clipEditor.brandMarkEnabled ? approvedClipBrandAsset?.id ?? null : null,
                  })}
                  disabled={clipSaving}
                >
                  <View style={[styles.legalCheckbox, clipEditor.brandMarkEnabled && styles.legalCheckboxActive]}>
                    <Text style={styles.legalCheckboxMark}>{clipEditor.brandMarkEnabled ? "✓" : ""}</Text>
                  </View>
                  <Text style={styles.legalAcknowledgementText}>
                    Use approved Platform brand mark in Clip Studio preview.
                  </Text>
                </TouchableOpacity>
                <Text style={styles.brandPreviewMeta}>
                  Brand mark display is preview metadata for this draft.
                </Text>
              </>
            ) : (
              <View style={styles.eventEmptyCard}>
                <Text style={styles.eventEmptyTitle}>Brand mark coming later</Text>
                <Text style={styles.eventEmptyBody}>
                  Publish and approve a Platform avatar or logo in Brand Studio before using it in Clip Studio.
                </Text>
              </View>
            ),
          })}

          {renderClipAccordion({
            id: "advanced",
            title: "Coming Later",
            summary: "Advanced editor tools stay locked until backed.",
            status: "Locked",
            statusTone: "muted",
            children: (
              <View style={styles.roadmapList}>
                <Text style={styles.roadmapItem}>Multi-clip timeline, split clip, transitions, beat sync, auto captions, AI cut, green screen, effects, stickers, and full export rendering are not active in this MVP.</Text>
                <Text style={styles.roadmapItem}>Trim/export is coming later.</Text>
                <Text style={styles.roadmapItem}>Poster frame extraction from video is coming later.</Text>
              </View>
            ),
          })}
        </View>
      </View>
    );
  };

  const renderPreviewChannelAction = () => {
    const previewUserId = String(user?.id ?? "").trim();
    if (!previewUserId) {
      return (
        <TouchableOpacity
          style={[styles.studioActionButton, styles.studioActionButtonDisabled]}
          activeOpacity={0.86}
          disabled
        >
          <Text style={styles.studioActionButtonText}>Preview Platform</Text>
          <Text style={styles.studioActionButtonCopy}>Profile required to preview platform.</Text>
        </TouchableOpacity>
      );
    }

    return (
      <TouchableOpacity
        style={[styles.studioActionButton, styles.studioActionButtonPrimary]}
        activeOpacity={0.86}
        onPress={() => {
          router.push({
            pathname: "/channel/[userId]",
            params: { userId: previewUserId, preview: "public" },
          });
        }}
      >
        <Text style={styles.studioActionButtonText}>Preview Platform</Text>
        <Text style={styles.studioActionButtonCopy}>Open public platform</Text>
      </TouchableOpacity>
    );
  };

  const renderStudioHeader = () => (
    <View style={styles.studioHeaderCard}>
      <Text style={styles.heroTitle}>Platform Studio</Text>
      <Text style={styles.studioSubtitle}>Run your platform from one place.</Text>
      <Text style={styles.studioClarifier}>Profile settings stay separate.</Text>
      {profile ? (
        <View style={styles.channelIdentityRow}>
          {profile.avatarUrl ? (
            <Image source={{ uri: profile.avatarUrl }} style={styles.channelAvatarImage} />
          ) : (
            <View style={styles.channelAvatarFallback}>
              <Text style={styles.channelAvatarFallbackText}>{channelInitial}</Text>
            </View>
          )}
          <View style={styles.channelIdentityCopy}>
            <Text style={styles.channelIdentityName} numberOfLines={1}>{channelName}</Text>
            {platformIdentityPillLabel ? (
              <Text style={styles.channelRoleChip}>{platformIdentityPillLabel}</Text>
            ) : null}
            {channelTagline ? (
              <Text style={styles.channelIdentityTagline} numberOfLines={1}>{channelTagline}</Text>
            ) : null}
          </View>
        </View>
      ) : null}
      <View style={styles.studioHeaderActions}>
        {renderPreviewChannelAction()}
        <TouchableOpacity
          style={styles.studioActionButton}
          activeOpacity={0.88}
          onPress={openClipStudioForNew}
        >
          <Text style={styles.studioActionButtonText}>Create Clip</Text>
          <Text style={styles.studioActionButtonCopy}>Clip Studio</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.studioActionButton}
          activeOpacity={0.88}
          onPress={() => openStudioTab("brand", { focus: "studio" })}
        >
          <Text style={styles.studioActionButtonText}>Brand Studio</Text>
          <Text style={styles.studioActionButtonCopy}>Stage Design</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderStudioTabBar = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.studioTabScroll}
      contentContainerStyle={styles.studioTabBar}
    >
      {STUDIO_TABS.map((tab) => {
        const active = activeStudioTab === tab.id;
        return (
          <TouchableOpacity
            key={tab.id}
            style={[styles.studioTabButton, active && styles.studioTabButtonActive]}
            activeOpacity={0.86}
            onPress={() => openStudioTab(tab.id)}
          >
            <Text style={[styles.studioTabButtonText, active && styles.studioTabButtonTextActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );

  const renderStudioStatusPill = (label: string, tone: "default" | "muted" | "warning" = "default") => (
    <View style={[
      styles.studioStatusPill,
      tone === "muted" && styles.studioStatusPillMuted,
      tone === "warning" && styles.studioStatusPillWarning,
    ]}>
      <Text style={styles.studioStatusPillText}>{label}</Text>
    </View>
  );

  const renderStudioActionRow = ({
    title,
    body,
    value,
    onPress,
    tone = "default",
  }: {
    title: string;
    body: string;
    value?: string;
    onPress: () => void;
    tone?: "default" | "muted" | "warning";
  }) => (
    <TouchableOpacity
      style={[
        styles.studioActionRow,
        tone === "warning" && styles.studioActionRowWarning,
        tone === "muted" && styles.studioActionRowMuted,
      ]}
      activeOpacity={0.86}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
    >
      <View style={styles.studioActionRowCopy}>
        <Text style={styles.studioActionRowTitle}>{title}</Text>
        <Text style={styles.studioActionRowBody}>{body}</Text>
      </View>
      <View style={styles.studioActionRowMeta}>
        {value ? renderStudioStatusPill(value, tone === "warning" ? "warning" : "muted") : null}
        <Text style={styles.studioActionChevron}>›</Text>
      </View>
    </TouchableOpacity>
  );

  const renderHomeAccordion = ({
    id,
    title,
    summary,
    status,
    statusTone = "default",
    children,
  }: {
    id: StudioHomeSectionId;
    title: string;
    summary: string;
    status?: string;
    statusTone?: "default" | "muted" | "warning";
    children: React.ReactNode;
  }) => {
    const expanded = expandedHomeSections.has(id);
    return (
      <View style={styles.studioAccordionCard}>
        <TouchableOpacity
          style={styles.studioAccordionHeader}
          activeOpacity={0.86}
          onPress={() => toggleHomeSection(id)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${title}. ${summary}`}
        >
          <View style={styles.studioAccordionCopy}>
            <Text style={styles.studioAccordionTitle}>{title}</Text>
            <Text style={styles.studioAccordionSummary}>{summary}</Text>
          </View>
          <View style={styles.studioAccordionMeta}>
            {status ? renderStudioStatusPill(status, statusTone) : null}
            <Text style={styles.studioAccordionChevron}>{expanded ? "⌄" : "›"}</Text>
          </View>
        </TouchableOpacity>
        {expanded ? <View style={styles.studioAccordionBody}>{children}</View> : null}
      </View>
    );
  };

  const renderMonetizationAccordion = ({
    id,
    title,
    summary,
    status,
    statusTone = "default",
    children,
  }: {
    id: MonetizationSectionId;
    title: string;
    summary: string;
    status?: string;
    statusTone?: "default" | "muted" | "warning";
    children: React.ReactNode;
  }) => {
    const expanded = expandedMonetizationSections.has(id);
    return (
      <View style={styles.studioAccordionCard}>
        <TouchableOpacity
          style={styles.studioAccordionHeader}
          activeOpacity={0.86}
          onPress={() => toggleMonetizationSection(id)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${title}. ${summary}`}
        >
          <View style={styles.studioAccordionCopy}>
            <Text style={styles.studioAccordionTitle}>{title}</Text>
            <Text style={styles.studioAccordionSummary}>{summary}</Text>
          </View>
          <View style={styles.studioAccordionMeta}>
            {status ? renderStudioStatusPill(status, statusTone) : null}
            <Text style={styles.studioAccordionChevron}>{expanded ? "⌄" : "›"}</Text>
          </View>
        </TouchableOpacity>
        {expanded ? <View style={styles.studioAccordionBody}>{children}</View> : null}
      </View>
    );
  };

  const renderBrandAccordion = ({
    id,
    title,
    summary,
    status,
    statusTone = "default",
    children,
  }: {
    id: BrandStudioSectionId;
    title: string;
    summary: string;
    status?: string;
    statusTone?: "default" | "muted" | "warning";
    children: React.ReactNode;
  }) => {
    const expanded = expandedBrandSections.has(id);
    return (
      <View style={styles.studioAccordionCard}>
        <TouchableOpacity
          style={styles.studioAccordionHeader}
          activeOpacity={0.86}
          onPress={() => toggleBrandSection(id)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${title}. ${summary}`}
        >
          <View style={styles.studioAccordionCopy}>
            <Text style={styles.studioAccordionTitle}>{title}</Text>
            <Text style={styles.studioAccordionSummary}>{summary}</Text>
          </View>
          <View style={styles.studioAccordionMeta}>
            {status ? renderStudioStatusPill(status, statusTone) : null}
            <Text style={styles.studioAccordionChevron}>{expanded ? "⌄" : "›"}</Text>
          </View>
        </TouchableOpacity>
        {expanded ? <View style={styles.studioAccordionBody}>{children}</View> : null}
      </View>
    );
  };

  const renderClipAccordion = ({
    id,
    title,
    summary,
    status,
    statusTone = "default",
    children,
  }: {
    id: ClipStudioSectionId;
    title: string;
    summary: string;
    status?: string;
    statusTone?: "default" | "muted" | "warning";
    children: React.ReactNode;
  }) => {
    const expanded = expandedClipSections.has(id);
    return (
      <View style={styles.studioAccordionCard}>
        <TouchableOpacity
          style={styles.studioAccordionHeader}
          activeOpacity={0.86}
          onPress={() => toggleClipSection(id)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={`${title}. ${summary}`}
        >
          <View style={styles.studioAccordionCopy}>
            <Text style={styles.studioAccordionTitle}>{title}</Text>
            <Text style={styles.studioAccordionSummary}>{summary}</Text>
          </View>
          <View style={styles.studioAccordionMeta}>
            {status ? renderStudioStatusPill(status, statusTone) : null}
            <Text style={styles.studioAccordionChevron}>{expanded ? "⌄" : "›"}</Text>
          </View>
        </TouchableOpacity>
        {expanded ? <View style={styles.studioAccordionBody}>{children}</View> : null}
      </View>
    );
  };

  const renderBrandAssetPreview = ({
    title,
    asset,
    fallback,
  }: {
    title: string;
    asset?: PlatformBrandAsset | null;
    fallback: string;
  }) => (
    <View style={styles.brandPreviewCard}>
      <View style={styles.brandPreviewMedia}>
        {asset?.signedUrl ? (
          <Image source={{ uri: asset.signedUrl }} style={styles.brandPreviewImage} resizeMode="cover" />
        ) : (
          <ImageBackground source={SKYLINE_SOURCE} style={styles.brandPreviewFallback} resizeMode="cover">
            <View style={styles.brandPreviewFallbackScrim} />
            <Text style={styles.brandPreviewFallbackText}>{fallback}</Text>
          </ImageBackground>
        )}
        <View pointerEvents="none" style={styles.brandSafeAreaFrame} />
      </View>
      <View style={styles.brandPreviewCopy}>
        <Text style={styles.brandPreviewTitle}>{title}</Text>
        <Text style={styles.brandPreviewBody}>{getBrandAssetReviewCopy(asset)}</Text>
        {asset?.fileSizeBytes ? (
          <Text style={styles.brandPreviewMeta}>{formatPlatformBrandFileSize(asset.fileSizeBytes)}</Text>
        ) : null}
      </View>
    </View>
  );

  const renderBrandReviewAsset = (asset: PlatformBrandAsset) => {
    const status = formatPlatformBrandAssetStatus(asset);
    const approved = ["clean", "reported"].includes(asset.moderationStatus);
    const busyPrefix = `${asset.id}:`;
    const busy = brandReviewBusyAssetId?.startsWith(busyPrefix) ?? false;
    const approveBusy = brandReviewBusyAssetId === `${asset.id}:approve`;
    const rejectBusy = brandReviewBusyAssetId === `${asset.id}:reject`;
    const archiveBusy = brandReviewBusyAssetId === `${asset.id}:archive`;

    return (
      <View key={asset.id} style={styles.eventEmptyCard}>
        <View style={styles.eventCardHeader}>
          <View style={styles.eventCardCopy}>
            <Text style={styles.eventEmptyTitle}>{formatPlatformBrandAssetTypeLabel(asset.assetType)}</Text>
            <Text style={styles.eventCardMeta}>
              {status}{asset.fileSizeBytes ? ` · ${formatPlatformBrandFileSize(asset.fileSizeBytes)}` : ""}
            </Text>
          </View>
          {renderStudioStatusPill(status, asset.moderationStatus === "pending_review" ? "warning" : "muted")}
        </View>
        <Text style={styles.eventEmptyBody}>{getBrandAssetReviewCopy(asset)}</Text>
        {asset.moderationReason ? (
          <Text style={styles.eventEmptyBody}>Review note: {asset.moderationReason}</Text>
        ) : null}
        <View style={styles.brandReviewActions}>
          <TouchableOpacity
            style={[styles.eventPrimaryButton, styles.brandReviewButton, (busy || approved) && styles.eventPrimaryButtonDisabled]}
            activeOpacity={0.88}
            disabled={busy || approved}
            onPress={() => {
              void handleReviewPlatformBrandAsset(asset, "approve");
            }}
          >
            {approveBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.eventPrimaryButtonText}>Approve</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.eventSecondaryButton, styles.brandReviewButton, busy && styles.eventPrimaryButtonDisabled]}
            activeOpacity={0.88}
            disabled={busy}
            onPress={() => {
              void handleReviewPlatformBrandAsset(asset, "reject");
            }}
          >
            {rejectBusy ? <ActivityIndicator color="#D9E0EE" /> : <Text style={styles.eventSecondaryButtonText}>Reject</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.eventSecondaryButton,
              styles.brandReviewButton,
              styles.brandReviewArchiveButton,
              busy && styles.eventPrimaryButtonDisabled,
            ]}
            activeOpacity={0.88}
            disabled={busy}
            onPress={() => {
              void handleReviewPlatformBrandAsset(asset, "archive");
            }}
          >
            {archiveBusy ? <ActivityIndicator color="#D9E0EE" /> : <Text style={styles.eventSecondaryButtonText}>Archive</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderQuickActionCard = ({
    title,
    body,
    onPress,
    disabled = false,
  }: {
    title: string;
    body: string;
    onPress?: () => void;
    disabled?: boolean;
  }) => (
    <TouchableOpacity
      style={[styles.quickActionCard, disabled && styles.quickActionCardDisabled]}
      activeOpacity={0.86}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.quickActionTitle}>{title}</Text>
      <Text style={styles.quickActionBody}>{body}</Text>
    </TouchableOpacity>
  );

  const renderHomeActionCard = ({
    title,
    body,
    onPress,
    disabled = false,
  }: {
    title: string;
    body?: string;
    onPress?: () => void;
    disabled?: boolean;
  }) => (
    <TouchableOpacity
      style={[styles.homeActionCard, disabled && styles.homeActionCardDisabled]}
      activeOpacity={0.86}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.homeActionTitle, disabled && styles.homeActionTitleDisabled]}>{title}</Text>
      {body ? <Text style={styles.homeActionBody} numberOfLines={2}>{body}</Text> : null}
    </TouchableOpacity>
  );

  const renderLatestContentCard = () => {
    if (!latestCreatorVideo) {
      return (
        <View style={styles.eventEmptyCard}>
          <Text style={styles.eventEmptyTitle}>No platform videos yet</Text>
          <Text style={styles.eventEmptyBody}>No platform videos yet. Upload your first video to start building your platform.</Text>
        </View>
      );
    }

    const playable = hasPlayableCreatorVideoSource(latestCreatorVideo);
    const statusLabel = !playable
      ? "Unavailable"
      : latestCreatorVideo.visibility === "public"
        ? "Published"
        : "Draft";
    const actionLabel = playable && latestCreatorVideo.visibility === "public" ? "Open Player" : "Edit Clip";
    const onPressAction = () => {
      if (actionLabel === "Open Player") {
        router.push({ pathname: "/player/[id]", params: { id: latestCreatorVideo.id, source: "creator-video" } });
        return;
      }
      openClipStudioForVideo(latestCreatorVideo);
    };

    return (
      <View style={styles.latestContentCard}>
        {latestCreatorVideo.thumbnailUrl ? (
          <Image source={{ uri: latestCreatorVideo.thumbnailUrl }} style={styles.latestContentThumb} />
        ) : (
          <View style={styles.latestContentFallback}>
            <Text style={styles.latestContentFallbackText}>{"CHI'LLYWOOD"}</Text>
          </View>
        )}
        <View style={styles.latestContentBody}>
          <View style={styles.latestContentTitleRow}>
            <Text style={styles.latestContentTitle} numberOfLines={2}>{latestCreatorVideo.title}</Text>
            <View style={[styles.contentStatusChip, !playable && styles.contentStatusChipUnavailable]}>
              <Text style={styles.contentStatusChipText}>{statusLabel}</Text>
            </View>
          </View>
          {latestCreatorVideo.description ? (
            <Text style={styles.latestContentDescription} numberOfLines={2}>{latestCreatorVideo.description}</Text>
          ) : null}
          <TouchableOpacity style={styles.eventPrimaryButton} activeOpacity={0.88} onPress={onPressAction}>
            <Text style={styles.eventPrimaryButtonText}>{actionLabel}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderStudioHomeTab = () => (
    <>
      <View style={styles.dashboardPanel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelHeaderCopy}>
            <Text style={styles.panelTitle}>Today</Text>
            <Text style={styles.panelSubtitle}>A short read on what is real right now.</Text>
          </View>
        </View>
        <View style={styles.homeSnapshotGrid}>
          {todayCards.map((card) => (
            <TouchableOpacity
              key={card.label}
              style={styles.homeSnapshotCard}
              activeOpacity={0.86}
              onPress={() => openStudioTab(card.tab)}
            >
              <Text style={styles.homeSnapshotValue}>{card.value}</Text>
              <Text style={styles.homeSnapshotLabel}>{card.label}</Text>
              <Text style={styles.homeSnapshotBody} numberOfLines={1}>{card.body}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {needsAttentionItems.length ? (
        <View style={styles.dashboardPanel}>
          <View style={styles.panelHeader}>
            <View style={styles.panelHeaderCopy}>
              <Text style={styles.panelTitle}>Needs Attention</Text>
              <Text style={styles.panelSubtitle}>Only backed, actionable items show here.</Text>
            </View>
          </View>
          <View style={styles.eventList}>
            {needsAttentionItems.map((item) => (
              <TouchableOpacity
                key={item.title}
                style={styles.attentionCard}
                activeOpacity={0.86}
                onPress={() => openStudioTab(item.tab, item.tab === "content" ? { filter: "drafts", focus: "drafts" } : undefined)}
              >
                <Text style={styles.attentionTitle}>{item.title}</Text>
                <Text style={styles.attentionBody}>{item.body}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <View style={styles.homeEmptyTaskCard}>
          <Text style={styles.homeEmptyTaskText}>All clear. Nothing needs attention right now.</Text>
        </View>
      )}

      <View style={styles.studioAccordionStack}>
        {renderHomeAccordion({
          id: "create",
          title: "Create and Manage",
          summary: "Upload, drafts, library, and latest content.",
          status: draftVideoCount ? `${draftVideoCount} draft${draftVideoCount === 1 ? "" : "s"}` : "Ready",
          statusTone: draftVideoCount ? "warning" : "default",
          children: (
            <>
              {renderStudioActionRow({
                title: "Create Clip",
                body: "Open Clip Studio for format, cover, title metadata, and draft publish prep.",
                value: "Studio",
                onPress: openClipStudioForNew,
              })}
              {renderStudioActionRow({
                title: "Upload video",
                body: uploadsEnabled ? "Open the existing upload form." : "Uploads are temporarily paused by app configuration.",
                value: uploadsEnabled ? "Open" : "Paused",
                tone: uploadsEnabled ? "default" : "warning",
                onPress: () => openStudioTab("content", { filter: "all", focus: "upload" }),
              })}
              {renderStudioActionRow({
                title: "Drafts",
                body: draftVideoCount ? `${draftVideoCount} draft${draftVideoCount === 1 ? "" : "s"} waiting.` : "No drafts right now.",
                value: draftVideoCount ? String(draftVideoCount) : "Clear",
                onPress: () => openStudioTab("content", { filter: "drafts", focus: "drafts" }),
              })}
              {renderStudioActionRow({
                title: "Published library",
                body: publishedVideoCount ? `${publishedVideoCount} public video${publishedVideoCount === 1 ? "" : "s"}.` : "No public videos yet.",
                value: publishedVideoCount ? String(publishedVideoCount) : "Empty",
                onPress: () => openStudioTab("content", { filter: "published", focus: "library" }),
              })}
              {renderStudioActionRow({
                title: "View all content",
                body: "Open the full content manager.",
                value: "Open",
                onPress: () => openStudioTab("content", { filter: "all", focus: "library" }),
              })}
              <View style={styles.accordionInlineBlock}>
                <Text style={styles.sectionLabel}>Latest Content</Text>
                {renderLatestContentCard()}
              </View>
            </>
          ),
        })}

        {renderHomeAccordion({
          id: "live",
          title: "Live and Events",
          summary: "Go live, schedule events, and manage reminders.",
          status: upcomingEvents.length ? `${upcomingEvents.length} upcoming` : "No events",
          children: (
            <>
              {renderStudioActionRow({
                title: "Go Live",
                body: "Open the existing Live Watch-Party start flow. Premium gates still apply.",
                value: "Open",
                onPress: () => {
                  router.push({ pathname: "/watch-party", params: { mode: "live", source: "platform-studio" } });
                },
              })}
              {renderStudioActionRow({
                title: "Live Events",
                body: nextUpcomingEvent ? `Next: ${nextUpcomingEvent.eventTitle}` : "No events scheduled.",
                value: upcomingEvents.length ? String(upcomingEvents.length) : "Empty",
                onPress: () => openStudioTab("live", { focus: "events" }),
              })}
              {renderStudioActionRow({
                title: "Watch-Party Live from content",
                body: latestCreatorVideo?.visibility === "public"
                  ? "Open a public video, then start Watch-Party Live from Player."
                  : "Publish a video first, then start Watch-Party Live from Player.",
                value: latestCreatorVideo?.visibility === "public" ? "Player" : "Setup required",
                tone: latestCreatorVideo?.visibility === "public" ? "default" : "warning",
                onPress: () => {
                  if (latestCreatorVideo?.visibility === "public" && hasPlayableCreatorVideoSource(latestCreatorVideo)) {
                    router.push({ pathname: "/player/[id]", params: { id: latestCreatorVideo.id, source: "creator-video" } });
                    return;
                  }
                  showStudioUnavailable(
                    "Setup required",
                    "Watch-Party Live from content starts from a playable public video. Publish a video first, then open it in Player.",
                  );
                },
              })}
              {renderStudioActionRow({
                title: "Schedule event",
                body: "Use the backed creator event form.",
                value: "Open",
                onPress: () => openStudioTab("live", { focus: "schedule" }),
              })}
            </>
          ),
        })}

        {renderHomeAccordion({
          id: "audience",
          title: "Audience",
          summary: "Followers, subscribers, requests, and audience activity.",
          status: audienceFollowerCount == null ? "Protected" : `${audienceFollowerCount} followers`,
          children: (
            <>
              {renderStudioActionRow({
                title: "Audience dashboard",
                body: "Open follower, subscriber, request, and visibility tools.",
                value: "Open",
                onPress: () => openStudioTab("audience", { focus: "overview" }),
              })}
              {renderStudioActionRow({
                title: "Requests",
                body: pendingAudienceRequestCount ? `${pendingAudienceRequestCount} request${pendingAudienceRequestCount === 1 ? "" : "s"} waiting.` : "No requests waiting.",
                value: pendingAudienceRequestCount ? String(pendingAudienceRequestCount) : "Clear",
                onPress: () => openStudioTab("audience", { focus: "requests" }),
              })}
              {renderStudioActionRow({
                title: "Blocked accounts",
                body: blockedAudienceCount ? `${blockedAudienceCount} blocked account${blockedAudienceCount === 1 ? "" : "s"}.` : "No blocked accounts.",
                value: blockedAudienceCount ? String(blockedAudienceCount) : "Clear",
                onPress: () => openStudioTab("moderation", { focus: "blocks" }),
              })}
            </>
          ),
        })}

        {renderHomeAccordion({
          id: "monetization",
          title: "Monetization",
          summary: "Money Center for sales, balances, payouts, and provider checks.",
          status: moneyCenterHomeStatus,
          statusTone: moneyCenterHomeTone,
          children: (
            <>
              {renderStudioActionRow({
                title: "Money Center",
                body: moneyCenterFeatureFlag.state === "off" || moneyCenterFeatureFlag.state === "locked"
                  ? "Money Center is not active yet. Payments stay locked until provider checks pass."
                  : "Review what is active, what is locked, and what setup is needed.",
                value: "Open",
                tone: moneyCenterFeatureFlag.state === "locked" ? "warning" : moneyCenterFeatureFlag.state === "off" ? "muted" : "default",
                onPress: () => openStudioTab("monetization", { focus: "overview" }),
              })}
              {renderStudioActionRow({
                title: "Creator Balance",
                body: "Your balance will appear after verified sales.",
                value: "Not active",
                tone: "muted",
                onPress: () => openStudioTab("monetization", { focus: "balance" }),
              })}
              {renderStudioActionRow({
                title: "Payouts",
                body: getCreatorFacingPayoutSetupBody(creatorPayoutSummary),
                value: getCreatorFacingPayoutSetupLabel(creatorPayoutSummary),
                tone: "muted",
                onPress: () => openStudioTab("monetization", { focus: "payouts" }),
              })}
              {renderStudioActionRow({
                title: "Provider Status",
                body: "Check store and payout readiness without exposing credentials.",
                value: "Open",
                onPress: () => openStudioTab("monetization", { focus: "providers" }),
              })}
              {renderStudioActionRow({
                title: "Creator monetization policy",
                body: "Open the public policy for creator monetization and revenue.",
                value: "Policy",
                onPress: () => router.push("/creator-monetization" as Parameters<typeof router.push>[0]),
              })}
            </>
          ),
        })}

        {renderHomeAccordion({
          id: "moderation",
          title: "Moderation and Safety",
          summary: "Reports, blocks, comments, and platform safety.",
          status: recentSafetyReportCount == null ? "Protected" : recentSafetyReportCount ? `${recentSafetyReportCount} reports` : "Clear",
          statusTone: recentSafetyReportCount ? "warning" : "default",
          children: (
            <>
              {renderStudioActionRow({
                title: "Reports",
                body: recentSafetyReportCount == null ? "Creator-facing report review is not available to this account." : recentSafetyReportCount ? "Reports are visible to this account." : "No reports waiting.",
                value: recentSafetyReportCount == null ? "Not available" : recentSafetyReportCount ? String(recentSafetyReportCount) : "Clear",
                tone: recentSafetyReportCount ? "warning" : "muted",
                onPress: () => openStudioTab("moderation", { focus: "reports" }),
              })}
              {renderStudioActionRow({
                title: "Blocked accounts",
                body: blockedAudienceCount ? "Manage real Platform-owned audience blocks." : "No blocked accounts.",
                value: blockedAudienceCount ? String(blockedAudienceCount) : "Clear",
                onPress: () => openStudioTab("moderation", { focus: "blocks" }),
              })}
              {renderStudioActionRow({
                title: "Comments and replies",
                body: "Content-specific comments stay with each video for now.",
                value: "Content",
                onPress: () => openStudioTab("content", { filter: "all", focus: "comments" }),
              })}
              {renderStudioActionRow({
                title: "Live safety",
                body: "Live room safety follows the existing Live and room controls.",
                value: "Live",
                onPress: () => openStudioTab("live", { focus: "safety" }),
              })}
              {renderStudioActionRow({
                title: "Community rules",
                body: "Open the community rules creators and viewers follow.",
                value: "Policy",
                onPress: () => router.push("/community-guidelines" as Parameters<typeof router.push>[0]),
              })}
              {renderStudioActionRow({
                title: "Appeals and enforcement",
                body: "Open the moderation and appeals policy.",
                value: "Policy",
                onPress: () => router.push("/moderation-policy" as Parameters<typeof router.push>[0]),
              })}
            </>
          ),
        })}

        {renderHomeAccordion({
          id: "insights",
          title: "Insights",
          summary: "Backed signals only; unsupported analytics stay unavailable.",
          status: creatorAnalyticsSummary ? "Signals" : "Preparing",
          statusTone: creatorAnalyticsSummary ? "default" : "muted",
          children: (
            <>
              {renderStudioActionRow({
                title: "Insights overview",
                body: creatorAnalyticsSummary ? "Open backed room, event, and audience signals." : "Insights will appear after your platform has activity.",
                value: "Open",
                onPress: () => openStudioTab("insights", { focus: "overview" }),
              })}
              {renderStudioActionRow({
                title: "Activity signals",
                body: "Review hosted rooms, events, follower, and subscriber signals.",
                value: "Signals",
                onPress: () => openStudioTab("insights", { focus: "activity" }),
              })}
            </>
          ),
        })}

        {renderHomeAccordion({
          id: "brand",
          title: "Brand Studio",
          summary: "Hero Media, Background, Brand Kit, theme, and preview.",
          status: brandStatusLabel,
          statusTone: brandHasPendingReview ? "warning" : brandPublished ? "default" : "muted",
          children: (
            <>
              {renderStudioActionRow({
                title: "Brand Studio",
                body: "Open Stage Design for public Platform visuals.",
                value: "Open",
                onPress: () => openStudioTab("brand", { focus: "studio" }),
              })}
              {renderStudioActionRow({
                title: "Edit Hero",
                body: brandHeroSource ? "Adjust Hero Media, fit, overlay, and safe area." : "Add Hero Media for your public Platform.",
                value: brandHeroStatus,
                tone: brandHasPendingReview ? "warning" : "default",
                onPress: () => {
                  openStudioTab("brand", { focus: "hero" });
                  setExpandedBrandSections(new Set<BrandStudioSectionId>(["hero"]));
                },
              })}
              {renderStudioActionRow({
                title: "Preview Platform",
                body: "Open the public platform preview as visitors see it.",
                value: "Preview",
                onPress: () => {
                  const previewUserId = String(user?.id ?? "").trim();
                  if (!previewUserId) {
                    showStudioUnavailable("Preview unavailable", "Sign in with a profile before previewing your platform.");
                    return;
                  }
                  router.push({ pathname: "/channel/[userId]", params: { userId: previewUserId, preview: "public" } });
                },
              })}
              {renderStudioActionRow({
                title: "Profile settings",
                body: "Profile settings stay separate from Platform settings.",
                value: "Settings",
                onPress: () => router.push("/settings" as Parameters<typeof router.push>[0]),
              })}
            </>
          ),
        })}
      </View>
    </>
  );

  const renderBrandStudioTab = () => {
    if (!profile) return null;
    const draft = activeBrandProfile;
    const heroBusy = brandBusyAssetType === "hero_image" || brandBusyAssetType === "hero_poster";
    const backgroundBusy = brandBusyAssetType === "background_image";
    const kitBusy = brandBusyAssetType === "avatar" || brandBusyAssetType === "logo" || brandBusyAssetType === "watermark";

    if (brandLoading && !platformBranding) {
      return (
        <View style={styles.loadingCard}>
          <ActivityIndicator color="#fff" />
          <Text style={styles.loadingText}>Loading Brand Studio…</Text>
        </View>
      );
    }

    return (
      <>
        <View style={styles.brandStudioHeroCard}>
          <View style={styles.brandStudioHeroMedia}>
            {brandHeroSource ? (
              <Image source={{ uri: brandHeroSource }} style={styles.brandStudioHeroImage} resizeMode="cover" />
            ) : (
              <ImageBackground source={SKYLINE_SOURCE} style={styles.brandStudioHeroImage} resizeMode="cover">
                <View style={styles.brandStudioHeroScrim} />
              </ImageBackground>
            )}
            <View style={styles.brandStudioHeroOverlay} />
            <View style={styles.brandStudioHeroCopy}>
              <Text style={styles.panelTitle}>Brand Studio</Text>
              <Text style={styles.panelSubtitle}>Stage Design for Hero Media, Background, Brand Kit, theme, and preview.</Text>
              <View style={styles.previewChipRow}>
                {renderStudioStatusPill(brandStatusLabel, brandHasPendingReview ? "warning" : brandPublished ? "default" : "muted")}
                {renderStudioStatusPill(`${formatBrandThemeLabel(draft?.themePreset)}`, "muted")}
              </View>
            </View>
          </View>
          <View style={styles.brandStudioIdentityRow}>
            {profile?.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.channelAvatarImage} />
            ) : (
              <View style={styles.channelAvatarFallback}>
                <Text style={styles.channelAvatarFallbackText}>{channelInitial}</Text>
              </View>
            )}
            <View style={styles.channelIdentityCopy}>
              <Text style={styles.channelIdentityName} numberOfLines={1}>{channelName}</Text>
              <Text style={styles.channelIdentityTagline} numberOfLines={2}>
                Platform avatar and public visuals stay separate from your Profile photo.
              </Text>
            </View>
          </View>
          <View style={styles.brandStudioActions}>
            <TouchableOpacity
              style={[styles.eventPrimaryButton, brandSaving && styles.eventPrimaryButtonDisabled]}
              activeOpacity={0.88}
              disabled={brandSaving}
              onPress={() => {
                setExpandedBrandSections(new Set<BrandStudioSectionId>(["hero"]));
              }}
            >
              <Text style={styles.eventPrimaryButtonText}>Edit Hero</Text>
            </TouchableOpacity>
            {renderPreviewChannelAction()}
          </View>
        </View>

        {brandNotice ? (
          <View style={styles.noticeCard}>
            <Text style={styles.noticeText}>{brandNotice}</Text>
          </View>
        ) : null}

        <View style={styles.studioAccordionStack}>
          {renderBrandAccordion({
            id: "hero",
            title: "Hero Media",
            summary: "Hero Image, Hero Reel, crop, fit, overlay, and safe area.",
            status: brandHeroStatus,
            statusTone: platformBranding?.heroImage?.moderationStatus === "pending_review" ? "warning" : "muted",
            children: (
              <>
                {renderBrandAssetPreview({
                  title: "Hero Image",
                  asset: platformBranding?.heroImage,
                  fallback: "HERO MEDIA",
                })}
                <View style={styles.brandButtonRow}>
                  <TouchableOpacity
                    style={[styles.eventPrimaryButton, heroBusy && styles.eventPrimaryButtonDisabled]}
                    activeOpacity={0.88}
                    disabled={heroBusy || brandSaving}
                    onPress={() => pickPlatformBrandAsset("hero_image")}
                  >
                    {brandBusyAssetType === "hero_image"
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.eventPrimaryButtonText}>Upload Image</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.eventSecondaryButton}
                    activeOpacity={0.88}
                    onPress={() => {
                      showStudioUnavailable(
                        "Hero Reel not available yet",
                        "Hero Video needs reviewed video processing before public autoplay can launch. Use Hero Image or choose a public upload as Spotlight content for now.",
                      );
                    }}
                  >
                    <Text style={styles.eventSecondaryButtonText}>Hero Reel</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.sectionLabel}>Fit</Text>
                <View style={styles.chipRow}>
                  {BRAND_FIT_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.chip, draft?.heroFitMode === option.id && styles.chipActive]}
                      activeOpacity={0.86}
                      onPress={() => updateBrandDraft({ heroFitMode: option.id })}
                    >
                      <Text style={[styles.chipText, draft?.heroFitMode === option.id && styles.chipTextActive]}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.permissionCopy}>
                  Fit settings save presentation metadata now. Drag reposition can be added when a backed gesture cropper is approved.
                </Text>
                <Text style={styles.sectionLabel}>Overlay</Text>
                <View style={styles.chipRow}>
                  {BRAND_OVERLAY_OPTIONS.map((option) => {
                    const active = Math.abs((draft?.overlayStrength ?? 0.7) - option.value) < 0.02;
                    return (
                      <TouchableOpacity
                        key={option.label}
                        style={[styles.chip, active && styles.chipActive]}
                        activeOpacity={0.86}
                        onPress={() => updateBrandDraft({ overlayStrength: option.value })}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {renderStudioActionRow({
                  title: "Remove Hero Image",
                  body: platformBranding?.heroImage ? "Remove this image from the Brand Studio draft." : "No Hero Image selected yet.",
                  value: platformBranding?.heroImage ? "Remove" : "Empty",
                  tone: platformBranding?.heroImage ? "warning" : "muted",
                  onPress: () => confirmRemoveBrandAsset("hero_image", platformBranding?.heroImage ?? null),
                })}
              </>
            ),
          })}

          {renderBrandAccordion({
            id: "background",
            title: "Background",
            summary: "Platform Background, fit, dim, blur, and readability.",
            status: brandBackgroundStatus,
            statusTone: platformBranding?.backgroundImage?.moderationStatus === "pending_review" ? "warning" : "muted",
            children: (
              <>
                {renderBrandAssetPreview({
                  title: "Platform Background",
                  asset: platformBranding?.backgroundImage,
                  fallback: "BACKGROUND",
                })}
                <View style={styles.brandButtonRow}>
                  <TouchableOpacity
                    style={[styles.eventPrimaryButton, backgroundBusy && styles.eventPrimaryButtonDisabled]}
                    activeOpacity={0.88}
                    disabled={backgroundBusy || brandSaving}
                    onPress={() => pickPlatformBrandAsset("background_image")}
                  >
                    {brandBusyAssetType === "background_image"
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.eventPrimaryButtonText}>Upload Background</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.eventSecondaryButton}
                    activeOpacity={0.88}
                    onPress={() => confirmRemoveBrandAsset("background_image", platformBranding?.backgroundImage ?? null)}
                  >
                    <Text style={styles.eventSecondaryButtonText}>Remove</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.sectionLabel}>Background Fit</Text>
                <View style={styles.chipRow}>
                  {BRAND_FIT_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.chip, draft?.backgroundFitMode === option.id && styles.chipActive]}
                      activeOpacity={0.86}
                      onPress={() => updateBrandDraft({ backgroundFitMode: option.id })}
                    >
                      <Text style={[styles.chipText, draft?.backgroundFitMode === option.id && styles.chipTextActive]}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.sectionLabel}>Blur Background</Text>
                <View style={styles.chipRow}>
                  {BRAND_BLUR_OPTIONS.map((option) => {
                    const active = Math.abs((draft?.blurStrength ?? 0) - option.value) < 0.02;
                    return (
                      <TouchableOpacity
                        key={option.label}
                        style={[styles.chip, active && styles.chipActive]}
                        activeOpacity={0.86}
                        onPress={() => updateBrandDraft({ blurStrength: option.value })}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ),
          })}

          {renderBrandAccordion({
            id: "brandKit",
            title: "Avatar and Logo",
            summary: "Platform avatar, logo mark, and optional Brand Mark.",
            status: brandKitReady ? "Ready" : "Not set",
            statusTone: brandKitReady ? "default" : "muted",
            children: (
              <>
                <Text style={styles.permissionCopy}>
                  Platform avatar appears on your public Platform. Your Profile photo stays separate.
                </Text>
                <View style={styles.brandKitGrid}>
                  {renderBrandAssetPreview({
                    title: "Platform Avatar",
                    asset: platformBranding?.avatar,
                    fallback: channelInitial,
                  })}
                  {renderBrandAssetPreview({
                    title: "Logo Mark",
                    asset: platformBranding?.logo,
                    fallback: "LOGO",
                  })}
                </View>
                <View style={styles.brandButtonRow}>
                  <TouchableOpacity
                    style={[styles.eventPrimaryButton, kitBusy && styles.eventPrimaryButtonDisabled]}
                    activeOpacity={0.88}
                    disabled={kitBusy || brandSaving}
                    onPress={() => pickPlatformBrandAsset("avatar")}
                  >
                    <Text style={styles.eventPrimaryButtonText}>Upload Avatar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.eventSecondaryButton}
                    activeOpacity={0.88}
                    disabled={kitBusy || brandSaving}
                    onPress={() => pickPlatformBrandAsset("logo")}
                  >
                    <Text style={styles.eventSecondaryButtonText}>Upload Logo</Text>
                  </TouchableOpacity>
                </View>
                {renderStudioActionRow({
                  title: "Watermark",
                  body: "Video watermark rendering is not active yet. Save a Brand Mark draft without changing Player behavior.",
                  value: platformBranding?.watermark ? formatPlatformBrandAssetStatus(platformBranding.watermark) : "Not available",
                  tone: "muted",
                  onPress: () => {
                    showStudioUnavailable(
                      "Watermark not available yet",
                      "Brand Mark upload can be staged later, but public video watermark rendering is not active in Player.",
                    );
                  },
                })}
              </>
            ),
          })}

          {renderBrandAccordion({
            id: "theme",
            title: "Theme",
            summary: "Accent color, layout, overlay, and readable presets.",
            status: formatBrandThemeLabel(draft?.themePreset),
            children: (
              <>
                <Text style={styles.sectionLabel}>Platform Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Platform Name"
                  placeholderTextColor="#8d8d8d"
                  value={profile.displayName ?? ""}
                  onChangeText={(text) => updateProfile({ displayName: text })}
                />
                <TextInput
                  style={styles.input}
                  placeholder="Platform Tagline"
                  placeholderTextColor="#8d8d8d"
                  value={profile.tagline ?? ""}
                  onChangeText={(text) => updateProfile({ tagline: text })}
                />
                <Text style={styles.sectionLabel}>Theme Preset</Text>
                <View style={styles.brandThemeGrid}>
                  {BRAND_THEME_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.id}
                      style={[styles.brandThemeCard, draft?.themePreset === option.id && styles.brandThemeCardActive]}
                      activeOpacity={0.86}
                      onPress={() => updateBrandDraft({ themePreset: option.id })}
                    >
                      <Text style={styles.brandThemeTitle}>{option.label}</Text>
                      <Text style={styles.brandThemeBody}>{option.body}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.sectionLabel}>Accent Color</Text>
                <View style={styles.chipRow}>
                  {BRAND_ACCENT_OPTIONS.map((option) => (
                    <TouchableOpacity
                      key={option.value}
                      style={[styles.brandSwatchChip, draft?.accentColor === option.value && styles.brandSwatchChipActive]}
                      activeOpacity={0.86}
                      onPress={() => updateBrandDraft({ accentColor: option.value })}
                      accessibilityLabel={`${option.label} accent`}
                    >
                      <View style={[styles.brandSwatch, { backgroundColor: option.value }]} />
                      <Text style={styles.chipText}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.sectionLabel}>Platform Layout Preset</Text>
                <View style={styles.chipRow}>
                  {(["spotlight", "live_first", "library_first"] as const).map((preset) => (
                    <TouchableOpacity
                      key={preset}
                      style={[styles.chip, (profile.channelLayoutPreset ?? "spotlight") === preset && styles.chipActive]}
                      onPress={() => updateProfile({ channelLayoutPreset: preset })}
                    >
                      <Text style={[styles.chipText, (profile.channelLayoutPreset ?? "spotlight") === preset && styles.chipTextActive]}>
                        {formatChannelLayoutPresetLabel(preset)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.permissionCopy}>{getChannelLayoutPresetBody(profile.channelLayoutPreset)}</Text>
              </>
            ),
          })}

          {renderBrandAccordion({
            id: "scenePresets",
            title: "Scene Presets",
            summary: "Visual presets for launch, spotlight, and offline presentation.",
            status: "Preview",
            children: (
              <>
                {renderStudioActionRow({
                  title: "Spotlight",
                  body: "Hero-forward visual template using current Brand Studio media.",
                  value: "Apply",
                  onPress: () => {
                    updateBrandDraft({ themePreset: "spotlight", heroFitMode: "fill", overlayStrength: 0.78 });
                    setBrandNotice("Spotlight preset applied as a draft.");
                  },
                })}
                {renderStudioActionRow({
                  title: "Launch",
                  body: "Stronger crimson accent and readable hero dim for premieres.",
                  value: "Apply",
                  onPress: () => {
                    updateBrandDraft({ themePreset: "studio_red", accentColor: "#DC143C", overlayStrength: 0.78 });
                    setBrandNotice("Launch preset applied as a draft.");
                  },
                })}
                {renderStudioActionRow({
                  title: "Starting Soon",
                  body: "Live scene switching is not active here yet.",
                  value: "Not available",
                  tone: "muted",
                  onPress: () => showStudioUnavailable("Not available yet", "Starting Soon cards need a backed scene renderer before creators can publish them."),
                })}
                {renderStudioActionRow({
                  title: "Offline Card",
                  body: "Offline presentation can be previewed in a later Brand Studio lane.",
                  value: "Not available",
                  tone: "muted",
                  onPress: () => showStudioUnavailable("Not available yet", "Offline Cards need a backed public renderer before they can launch."),
                })}
              </>
            ),
          })}

          {canReviewPlatformBrandAssets ? renderBrandAccordion({
            id: "review",
            title: "Review and Publishing",
            summary: "Approve or reject public-facing Platform assets.",
            status: brandReviewQueueLoading
              ? "Loading"
              : (brandReviewQueuePendingCount || brandPendingReviewCount)
                ? `${brandReviewQueuePendingCount || brandPendingReviewCount} waiting`
                : "Ready",
            statusTone: (brandReviewQueuePendingCount || brandPendingReviewCount) ? "warning" : "default",
            children: (
              <>
                <Text style={styles.permissionCopy}>
                  Approval means moderation-safe. Creators still publish Brand Studio changes before approved assets appear publicly.
                </Text>
                <TextInput
                  style={[styles.input, styles.brandReviewReasonInput]}
                  placeholder="Review reason for reject or archive"
                  placeholderTextColor="#8d8d8d"
                  value={brandReviewReason}
                  onChangeText={setBrandReviewReason}
                  multiline
                  textAlignVertical="top"
                />
                {brandReviewQueueLoading ? (
                  <View style={styles.loadingCard}>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.loadingText}>Loading review queue...</Text>
                  </View>
                ) : brandReviewDisplayAssets.length ? (
                  <View style={styles.eventList}>
                    {brandReviewDisplayAssets.map(renderBrandReviewAsset)}
                  </View>
                ) : (
                  <View style={styles.eventEmptyCard}>
                    <Text style={styles.eventEmptyTitle}>No brand assets waiting.</Text>
                    <Text style={styles.eventEmptyBody}>Upload Hero Media, Background, Avatar, or Logo assets before review.</Text>
                  </View>
                )}
              </>
            ),
          }) : null}

          {renderBrandAccordion({
            id: "preview",
            title: "Public Preview",
            summary: "Preview the public Platform without drafts or owner controls.",
            status: "Safe",
            children: (
              <>
                {renderStudioActionRow({
                  title: "Preview Platform",
                  body: "Opens as visitors see it. Draft and pending-review assets stay hidden.",
                  value: "Preview",
                  onPress: () => {
                    const previewUserId = String(user?.id ?? "").trim();
                    if (!previewUserId) {
                      showStudioUnavailable("Preview unavailable", "Sign in with a profile before previewing your platform.");
                      return;
                    }
                    router.push({ pathname: "/channel/[userId]", params: { userId: previewUserId, preview: "public" } });
                  },
                })}
                {renderStudioActionRow({
                  title: "Save Draft",
                  body: "Save current Brand Studio choices without publishing them.",
                  value: brandSaving ? "Saving" : "Draft",
                  onPress: () => {
                    void saveBrandDraftPatch();
                  },
                })}
                {renderStudioActionRow({
                  title: "Publish Changes",
                  body: "Publish reviewed assets and current theme settings to the public Platform.",
                  value: brandSaving ? "Publishing" : "Publish",
                  tone: brandHasPendingReview ? "warning" : "default",
                  onPress: () => {
                    void publishBrandDraft();
                  },
                })}
              </>
            ),
          })}

          {renderBrandAccordion({
            id: "defaults",
            title: "Platform Defaults",
            summary: "Current backed role, access, Watch-Party, and communication defaults.",
            status: "Backed",
            children: (
              <>
                <Text style={styles.sectionLabel}>Platform Role</Text>
                <View style={styles.chipRow}>
                  {(["viewer", "host", "creator"] as UserChannelRole[]).map((role) => (
                    <TouchableOpacity
                      key={role}
                      style={[styles.chip, profile.channelRole === role && styles.chipActive]}
                      onPress={() => updateProfile({ channelRole: role })}
                    >
                      <Text style={[styles.chipText, profile.channelRole === role && styles.chipTextActive]}>
                        {formatChannelRoleLabel(role) || role}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={styles.accessSummaryCard}>
                  <Text style={styles.accessSummaryKicker}>CURRENT ACCESS POSTURE</Text>
                  <Text style={styles.accessSummaryTitle}>{accessSummary.title}</Text>
                  <Text style={styles.accessSummaryBody}>{accessSummary.body}</Text>
                </View>
                <Text style={styles.sectionLabel}>Watch-Party Join Policy</Text>
                <View style={styles.chipRow}>
                  {(["open", "locked"] as const).map((value) => (
                    <TouchableOpacity
                      key={value}
                      style={[styles.chip, profile.defaultWatchPartyJoinPolicy === value && styles.chipActive]}
                      onPress={() => updateProfile({ defaultWatchPartyJoinPolicy: value })}
                    >
                      <Text style={[styles.chipText, profile.defaultWatchPartyJoinPolicy === value && styles.chipTextActive]}>
                        {formatJoinPolicyLabel(value)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.sectionLabel}>Watch-Party Content Access</Text>
                <View style={styles.chipRow}>
                  {(["open", "party_pass", "premium"] as const).map((value) => {
                    const blocked =
                      (value === "party_pass" && creatorPermissions?.canUsePartyPassRooms === false)
                      || (value === "premium" && creatorPermissions?.canUsePremiumRooms === false);
                    return (
                      <TouchableOpacity
                        key={value}
                        style={[
                          styles.chip,
                          profile.defaultWatchPartyContentAccessRule === value && styles.chipActive,
                          blocked && styles.chipDisabled,
                        ]}
                        onPress={() => {
                          if (blocked) return;
                          updateProfile({ defaultWatchPartyContentAccessRule: value });
                        }}
                        disabled={blocked}
                      >
                        <Text style={[styles.chipText, profile.defaultWatchPartyContentAccessRule === value && styles.chipTextActive]}>
                          {formatRoomDefaultAccessLabel(value)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={styles.sectionLabel}>Communication Access</Text>
                <View style={styles.chipRow}>
                  {(["open", "party_pass", "premium"] as const).map((value) => {
                    const blocked =
                      (value === "party_pass" && creatorPermissions?.canUsePartyPassRooms === false)
                      || (value === "premium" && creatorPermissions?.canUsePremiumRooms === false);
                    return (
                      <TouchableOpacity
                        key={value}
                        style={[
                          styles.chip,
                          profile.defaultCommunicationContentAccessRule === value && styles.chipActive,
                          blocked && styles.chipDisabled,
                        ]}
                        onPress={() => {
                          if (blocked) return;
                          updateProfile({ defaultCommunicationContentAccessRule: value });
                        }}
                        disabled={blocked}
                      >
                        <Text style={[styles.chipText, profile.defaultCommunicationContentAccessRule === value && styles.chipTextActive]}>
                          {formatRoomDefaultAccessLabel(value)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ),
          })}
        </View>

        <View style={styles.brandActionRow}>
          <TouchableOpacity
            style={[styles.eventSecondaryButton, brandSaving && styles.eventPrimaryButtonDisabled]}
            activeOpacity={0.88}
            disabled={brandSaving}
            onPress={() => {
              void saveBrandDraftPatch();
              void onSave();
            }}
          >
            <Text style={styles.eventSecondaryButtonText}>Save Draft</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, brandSaving && styles.eventPrimaryButtonDisabled]}
            onPress={() => {
              void publishBrandDraft();
              void onSave();
            }}
            activeOpacity={0.88}
            disabled={brandSaving}
          >
            {brandSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Publish Changes</Text>}
          </TouchableOpacity>
        </View>
      </>
    );
  };

  const renderSummaryMetricCards = (cards: readonly SummaryMetricCard[]) => (
    <View style={styles.summaryGrid}>
      {cards.map((card) => (
        <View
          key={card.label}
          style={[styles.summaryCard, card.tone === "unavailable" && styles.summaryCardUnavailable]}
        >
          <Text style={styles.summaryLabel}>{card.label}</Text>
          <Text style={styles.summaryValue}>{card.value}</Text>
          <Text style={styles.summaryBody}>{card.body}</Text>
        </View>
      ))}
    </View>
  );

  const creatorMoneyEventTone = (event: MoneyAuditEvent): "default" | "muted" | "warning" => {
    if (event.environment === "sandbox" || event.statusLabel === "Blocked") return "warning";
    if (event.payable) return "default";
    return "muted";
  };

  const renderCreatorMoneyEventRows = (
    events: readonly MoneyAuditEvent[],
    emptyTitle = "No money rows returned",
    emptyBody = "Money setup, readiness, sandbox, and ledger rows will appear here when they are safely readable.",
    limit = 4,
  ) => {
    const visibleEvents = events.slice(0, limit);
    if (!visibleEvents.length) {
      return (
        <View style={styles.eventEmptyCard}>
          <Text style={styles.eventEmptyTitle}>{emptyTitle}</Text>
          <Text style={styles.eventEmptyBody}>{emptyBody}</Text>
        </View>
      );
    }
    return (
      <View style={styles.eventList}>
        {visibleEvents.map((event) => (
          <TouchableOpacity
            key={event.id}
            style={styles.eventCard}
            activeOpacity={0.86}
            onPress={() => setSelectedCreatorMoneyAuditEvent(event)}
            accessibilityRole="button"
            accessibilityLabel={`View details for ${event.title}`}
          >
            <View style={styles.eventCardHeader}>
              <View style={styles.eventCardCopy}>
                <Text style={styles.eventCardTitle}>{event.title}</Text>
                <Text style={styles.eventCardMeta}>
                  {`${event.createdAt ? formatIsoDate(event.createdAt) : "Time unknown"} · ${event.sourceLabel}`}
                </Text>
              </View>
              {renderStudioStatusPill(event.statusLabel, creatorMoneyEventTone(event))}
            </View>
            <Text style={styles.eventCardBody}>{event.summary}</Text>
            <View style={styles.moneyAuditBadgeRow}>
              {[event.environment === "sandbox" ? "Sandbox only" : event.environment === "production" ? "Production" : "Setup only", event.payable ? "Payable" : "Not payable"]
                .map((badge) => (
                  <View key={`${event.id}-${badge}`} style={styles.moneyAuditBadge}>
                    <Text style={styles.moneyAuditBadgeText}>{badge}</Text>
                  </View>
                ))}
            </View>
            <View style={styles.eventActionButton}>
              <Text style={styles.eventActionButtonText}>View details</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderMonetizationTab = () => {
    const readiness = (
      provider: ProviderReadinessProvider,
      capability: ProviderReadinessCapability,
    ) => findProviderReadinessSummary(providerReadinessSummary, provider, capability);
    const providerStatusLabel = (
      row: ProviderReadinessSummaryRow | null | undefined,
      fallback: string,
    ) => {
      if (!row) return fallback;
      if (row.status === "active") return "Active";
      if (row.status === "sandbox_ready") return "Sandbox ready";
      if (row.status === "ready_for_review" || row.status === "configured") return "Ready for review";
      if (row.status === "setup_needed" || row.status === "missing" || row.status === "error") return "Setup needed";
      if (row.status === "blocked") return "Blocked";
      if (row.status === "disabled") return "Disabled";
      return row.displayLabel || fallback;
    };
    const premiumEntitlementReadiness = readiness("revenuecat", "premium_entitlement");
    const revenueCatOfferingReadiness = readiness("revenuecat", "revenuecat_offering");
    const revenueCatEntitlementReadiness = readiness("revenuecat", "revenuecat_entitlement");
    const googlePlayProductReadiness = readiness("google_play", "google_play_subscription_product");
    const stripeConnectReadiness = readiness("stripe_connect", "stripe_connect_account");
    const stripeWebhookReadiness = readiness("stripe", "stripe_webhook_signature");
    const payoutSetupReadiness = readiness("stripe_connect", "payout_setup");
    const payoutReleaseReadiness = readiness("stripe_connect", "payout_release");
    const revenueImportReadiness = readiness("internal_policy", "creator_revenue_imports");
    const tipsReadiness = readiness("stripe", "tips");
    const paidContentReadiness = readiness("google_play", "paid_content");
    const commerceReadiness = readiness("stripe", "platform_commerce");
    const adRevenueReadiness = readiness("ads", "ad_revenue");
    const policyReadiness = readiness("internal_policy", "creator_monetization_policy");
    const moneyFlag = (key: MoneyFeatureFlagKey) => getMoneyFeatureFlag(moneyFeatureFlags, key);
    const switchTone = (state: MoneyFeatureFlagState): "default" | "muted" | "warning" => (
      state === "on" || state === "sandbox_only" ? "default" : state === "locked" ? "warning" : "muted"
    );
    const switchSetupBody = (key: MoneyFeatureFlagKey, fallback: string) => {
      const flag = moneyFlag(key);
      if (flag.state === "off") return "Turned off by owner.";
      if (flag.state === "locked") return "This money feature is unavailable.";
      if (flag.state === "maintenance") return "Temporarily unavailable.";
      if (flag.state === "sandbox_only") return "Sandbox checks can be reviewed, but live money is not active.";
      return fallback;
    };
    const digitalSalesFlagBody = (fallback: string) => switchSetupBody("digital_sales_enabled", fallback);
    const sectionStatus = (
      key: MoneyFeatureFlagKey,
      row: ProviderReadinessSummaryRow | null | undefined,
      fallback = "Setup needed",
    ) => {
      const flag = moneyFlag(key);
      if (flag.state === "locked") return "Blocked";
      if (flag.state === "off" || flag.state === "maintenance") return "Disabled";
      if (flag.state === "sandbox_only") {
        if (row?.status === "blocked") return "Blocked";
        if (row?.status === "missing" || row?.status === "setup_needed" || row?.status === "error") return "Setup needed";
        return "Sandbox ready";
      }
      if (!row) return fallback;
      if (row.status === "active") return liveMoneyFeatureFlag.state === "on" ? "Active" : "Ready for review";
      if (row.status === "sandbox_ready") return "Sandbox ready";
      if (row.status === "ready_for_review" || row.status === "configured") return "Ready for review";
      if (row.status === "blocked") return "Blocked";
      if (row.status === "disabled") return "Disabled";
      return "Setup needed";
    };
    const sectionTone = (status: string): "default" | "muted" | "warning" => (
      status === "Active" || status === "Sandbox ready" || status === "Ready for review"
        ? "default"
        : status === "Blocked" ? "warning" : "muted"
    );
    const monetizationActive = moneyCenterLiveActive;
    const moneyCenterStatus = moneyCenterFeatureFlag.state === "locked" ? "Blocked"
      : moneyCenterFeatureFlag.state === "off" || moneyCenterFeatureFlag.state === "maintenance" ? "Disabled"
        : monetizationActive ? "Active"
          : "Not active";
    const topStatus = moneyCenterStatus;
    const tipsFlag = moneyFlag("tips_enabled");
    const watchPartySeatsFlag = moneyFlag("watch_party_seats_enabled");
    const paidContentFlag = moneyFlag("paid_content_enabled");
    const merchFlag = moneyFlag("merch_enabled");
    const creatorBalanceFlag = moneyFlag("creator_balance_visible");
    const payoutsFlag = moneyFlag("payouts_enabled");
    const stripeConnectFlag = moneyFlag("stripe_connect_enabled");
    const providerWebhooksFlag = moneyFlag("provider_webhooks_enabled");
    const storeProviderRow = googlePlayProductReadiness ?? revenueCatOfferingReadiness ?? revenueCatEntitlementReadiness;
    const storeStatus = sectionStatus("revenuecat_google_play_enabled", storeProviderRow, revenueCatReadiness.anyPublicKeyConfigured ? "Ready for review" : "Setup needed");
    const digitalSalesStatus = sectionStatus("digital_sales_enabled", storeProviderRow, "Setup needed");
    const stripeStatus = sectionStatus("stripe_connect_enabled", stripeConnectReadiness, creatorPayoutSummary.providerReady ? "Ready for review" : "Setup needed");
    const premiumStatus = sectionStatus("revenuecat_google_play_enabled", premiumEntitlementReadiness, revenueCatReadiness.anyPublicKeyConfigured ? "Setup needed" : "Setup needed");
    const tipsStatus = sectionStatus("tips_enabled", tipsReadiness, "Planned");
    const paidContentStatus = sectionStatus("paid_content_enabled", paidContentReadiness, "Setup needed");
    const watchPartySeatsStatus = sectionStatus("watch_party_seats_enabled", googlePlayProductReadiness, "Planned");
    const merchStatus = sectionStatus("merch_enabled", commerceReadiness, "Planned");
    const balanceStatus = creatorBalanceFlag.state === "locked" ? "Blocked" : creatorBalanceFlag.state === "off" || creatorBalanceFlag.state === "maintenance" ? "Disabled" : "Not active";
    const payoutsStatus = sectionStatus("payouts_enabled", payoutSetupReadiness ?? payoutReleaseReadiness, "Setup needed");
    const taxLegalStatus = creatorPayoutSummary.kycReady && creatorPayoutSummary.taxReady && payoutsFlag.state === "on" ? "Ready for review" : "Setup needed";
    const providerOverallStatus = providerReadinessSummary.some((row) => row.status === "active" && row.isLiveMoneyEnabled && liveMoneyFeatureFlag.state === "on")
      ? "Active"
      : providerReadinessSummary.some((row) => row.status === "sandbox_ready")
        ? "Sandbox ready"
        : "Setup needed";
    const canStartStripeSetup = isMoneyFeatureSandboxOrOn(stripeConnectFlag.state) && payoutsFlag.state === "on";
    const digitalSalesCards: readonly SummaryMetricCard[] = [
      {
        label: "Premium access",
        value: premiumStatus,
        body: "Premium gates stay on the existing entitlement path.",
        tone: sectionTone(premiumStatus) === "default" ? "default" : "unavailable",
      },
      {
        label: "Android digital access",
        value: digitalSalesStatus,
        body: digitalSalesFlagBody("Digital sales inside the Android app use Google Play Billing and RevenueCat where required."),
        tone: sectionTone(digitalSalesStatus) === "default" ? "default" : "unavailable",
      },
      {
        label: "Creator split",
        value: "Not active",
        body: "Creator share is calculated only after verified purchases, fees, refunds, and policy checks settle.",
        tone: "unavailable",
      },
      {
        label: "Stripe checkout",
        value: "Not for Android digital",
        body: "Stripe is not used to charge Android users for in-app digital access.",
        tone: "unavailable",
      },
    ];
    const tipsCards: readonly SummaryMetricCard[] = [
      {
        label: "Tips",
        value: tipsStatus,
        body: `${tipsFlag.state === "off" ? "Tips are not active yet." : switchSetupBody("tips_enabled", "Tips are planned.")} Tips will unlock after store products and payout rules are verified.`,
        tone: sectionTone(tipsStatus) === "default" ? "default" : "unavailable",
      },
      {
        label: "First products",
        value: "Planned",
        body: "Fixed tip products such as $1, $3, $5, and $10 should be proved before any custom amount.",
        tone: "unavailable",
      },
      {
        label: "Digital support",
        value: tipsFlag.state === "on" ? "Setup needed" : tipsFlag.state === "sandbox_only" ? "Sandbox ready" : "Not active",
        body: "Android in-app creator support is treated as digital support unless legal and provider review approve another path.",
        tone: "unavailable",
      },
    ];
    const watchPartySeatCards: readonly SummaryMetricCard[] = [
      {
        label: "Seat sales",
        value: watchPartySeatsStatus,
        body: `${watchPartySeatsFlag.state === "off" ? "Watch-Party seats are not active yet." : switchSetupBody("watch_party_seats_enabled", "Paid seats need verified store setup first.")} Viewer, VIP, speaker, event pass, and creator-room access products need verified store setup first.`,
        tone: "unavailable",
      },
      {
        label: "Room authority",
        value: "Unchanged",
        body: "A paid seat cannot grant original host controls or bypass required speaker approval.",
        tone: "unavailable",
      },
      {
        label: "Premium gates",
        value: "Unchanged",
        body: "Paid seats do not bypass Premium gates unless a later approved product policy says so.",
        tone: "unavailable",
      },
    ];
    const paidContentCards: readonly SummaryMetricCard[] = [
      {
        label: "Paid content",
        value: paidContentStatus,
        body: `${paidContentFlag.state === "off" ? "Paid content is not active yet." : switchSetupBody("paid_content_enabled", "Paid videos, replays, posts, and collections need store products and entitlement checks.")} ${summarizeProviderReadiness(paidContentReadiness, "Paid videos, replays, posts, and collections need store products and entitlement checks.")}`,
        tone: sectionTone(paidContentStatus) === "default" ? "default" : "unavailable",
      },
      {
        label: "Access unlock",
        value: "Locked",
        body: "Access unlocks require verified purchase and entitlement checks.",
        tone: "unavailable",
      },
      {
        label: "Private content",
        value: "Protected",
        body: "Draft, private, reported, or restricted content remains unavailable for paid public access.",
        tone: "unavailable",
      },
    ];
    const merchCards: readonly SummaryMetricCard[] = [
      {
        label: "Physical merch",
        value: merchStatus,
        body: `${merchFlag.state === "off" ? "Merch is not active yet." : switchSetupBody("merch_enabled", "Physical merch can use a separate approved checkout when provider, tax, fulfillment, and refund checks are ready.")} Physical merch can use a separate approved checkout when provider, tax, fulfillment, and refund checks are ready.`,
        tone: sectionTone(merchStatus) === "default" ? "default" : "unavailable",
      },
      {
        label: "Digital separation",
        value: "Required",
        body: "Digital app access stays separate from merch and cannot be bundled without legal and payment review.",
        tone: "unavailable",
      },
      {
        label: "Orders",
        value: "Planned",
        body: "No merch store, shipping status, inventory, or order history is active yet.",
        tone: "unavailable",
      },
    ];
    const balanceCards: readonly SummaryMetricCard[] = [
      ...creatorRevenueSummaryCards,
      {
        label: "Balance states",
        value: "Pending later",
        body: "Future rows must separate pending, available, paid, refunded, reversed, and blocked states.",
        tone: "unavailable",
      },
    ];
    const payoutCards: readonly SummaryMetricCard[] = [
      {
        label: "Payout setup",
        value: payoutsStatus,
        body: payoutsFlag.state === "off" ? "Payouts are unavailable." : getCreatorFacingPayoutSetupBody(creatorPayoutSummary),
        tone: sectionTone(payoutsStatus) === "default" && creatorPayoutSummary.providerReady ? "default" : "unavailable",
      },
      {
        label: "Stripe setup",
        value: stripeStatus,
        body: `${switchSetupBody("stripe_connect_enabled", "Payout setup is needed before payout readiness can move forward.")} ${summarizeProviderReadiness(stripeConnectReadiness, "Payout setup is needed before payout readiness can move forward.")}`,
        tone: sectionTone(stripeStatus) === "default" ? "default" : "unavailable",
      },
      {
        label: "Tax / KYC",
        value: taxLegalStatus,
        body: "Identity and tax checks must be ready before payouts can be reviewed.",
        tone: creatorPayoutSummary.kycReady && creatorPayoutSummary.taxReady ? "default" : "unavailable",
      },
      {
        label: "Payout release",
        value: payoutsFlag.state === "on" && liveMoneyFeatureFlag.state === "on" ? getCreatorReadinessLabel(payoutReleaseReadiness, "Setup needed") : "Disabled",
        body: `${payoutsFlag.state === "off" || liveMoneyFeatureFlag.state !== "on" ? "Payouts are unavailable." : summarizeProviderReadiness(payoutReleaseReadiness, "No withdrawal, transfer, cash-out, or payout release action is available.")} No withdrawal, transfer, cash-out, or payout release action is available.`,
        tone: "unavailable",
      },
      {
        label: "Scheduled payout",
        value: creatorPayoutReadiness.canRequestScheduledPayout && payoutsFlag.state === "on" && liveMoneyFeatureFlag.state === "on" ? "Ready for review" : "Setup needed",
        body: `Scheduled payout fee is ${formatMonetizationCurrency(creatorPayoutReadiness.scheduledPayoutFeeCents, "usd")}. Requests stay locked until all checks are ready.`,
        tone: creatorPayoutReadiness.canRequestScheduledPayout && payoutsFlag.state === "on" && liveMoneyFeatureFlag.state === "on" ? "default" : "unavailable",
      },
      {
        label: "Instant cash-out",
        value: creatorPayoutReadiness.canRequestInstantCashout && payoutsFlag.state === "on" && liveMoneyFeatureFlag.state === "on" ? "Ready for review" : "Setup needed",
        body: `Optional instant cash-out is ${creatorPayoutReadiness.instantCashoutFeeBps / 100}% with no default cap when a future payout rollout is approved.`,
        tone: creatorPayoutReadiness.canRequestInstantCashout && payoutsFlag.state === "on" && liveMoneyFeatureFlag.state === "on" ? "default" : "unavailable",
      },
    ];
    const taxLegalCards: readonly SummaryMetricCard[] = [
      {
        label: "Tax profile",
        value: creatorPayoutSummary.taxReady ? "Ready for review" : "Setup needed",
        body: "Accurate tax information is required before any future payout can be reviewed.",
        tone: creatorPayoutSummary.taxReady ? "default" : "unavailable",
      },
      {
        label: "Identity checks",
        value: creatorPayoutSummary.kycReady ? "Ready for review" : "Setup needed",
        body: "Payout identity checks stay separate from buyer payment collection.",
        tone: creatorPayoutSummary.kycReady ? "default" : "unavailable",
      },
      {
        label: "Refunds and reversals",
        value: "Required",
        body: "Refunds, reversals, fraud holds, and policy checks can reduce pending or available balances.",
        tone: "unavailable",
      },
      {
        label: "Payout terms",
        value: "Review later",
        body: "No payout is available until setup and verification are complete.",
        tone: "unavailable",
      },
    ];
    const providerCards: readonly SummaryMetricCard[] = [
      {
        label: "Google Play",
        value: storeStatus,
        body: `${switchSetupBody("revenuecat_google_play_enabled", "Store setup needed before Android digital purchases can be active.")} ${summarizeProviderReadiness(googlePlayProductReadiness, "Store setup needed before Android digital purchases can be active.")}`,
        tone: sectionTone(storeStatus) === "default" ? "default" : "unavailable",
      },
      {
        label: "RevenueCat",
        value: providerStatusLabel(revenueCatOfferingReadiness, storeStatus),
        body: summarizeProviderReadiness(revenueCatOfferingReadiness, "Subscription and entitlement checks stay on the existing Premium path."),
        tone: getProviderReadinessTone(revenueCatOfferingReadiness),
      },
      {
        label: "Stripe Connect",
        value: stripeStatus,
        body: "Stripe Connect is payout setup only. It does not charge Android users for digital goods.",
        tone: sectionTone(stripeStatus) === "default" ? "default" : "unavailable",
      },
      {
        label: "Stripe webhook",
        value: sectionStatus("provider_webhooks_enabled", stripeWebhookReadiness, "Setup needed"),
        body: `${switchSetupBody("provider_webhooks_enabled", "Webhook checks are sanitized and do not expose secrets.")} ${summarizeProviderReadiness(stripeWebhookReadiness, "Webhook checks are sanitized and do not expose secrets.")}`,
        tone: sectionTone(sectionStatus("provider_webhooks_enabled", stripeWebhookReadiness, "Setup needed")) === "default" ? "default" : "unavailable",
      },
      {
        label: "Live money",
        value: liveMoneyFeatureFlag.state === "on" && monetizationActive ? "Active" : getMoneyFeatureStateLabel(liveMoneyFeatureFlag.state),
        body: "Live money stays disabled until provider checks, policy checks, and owner approval pass.",
        tone: monetizationActive ? "default" : "unavailable",
      },
      {
        label: "Creator monetization",
        value: sectionStatus("creator_monetization_enabled", policyReadiness, "Ready for review"),
        body: "Provider readiness is the visible source of truth for creator money tools.",
        tone: sectionTone(sectionStatus("creator_monetization_enabled", policyReadiness, "Ready for review")) === "default" ? "default" : "unavailable",
      },
      {
        label: "Payouts flag",
        value: getMoneyFeatureStateLabel(payoutsFlag.state),
        body: payoutsFlag.displaySummary,
        tone: switchTone(payoutsFlag.state) === "default" ? "default" : "unavailable",
      },
      {
        label: "Webhooks flag",
        value: getMoneyFeatureStateLabel(providerWebhooksFlag.state),
        body: providerWebhooksFlag.displaySummary,
        tone: switchTone(providerWebhooksFlag.state) === "default" ? "default" : "unavailable",
      },
    ];
    const futureToolCards: readonly SummaryMetricCard[] = [
      { label: "Subscriptions", value: "Planned", body: "Creator subscriptions are separate from Chi'llywood Premium and need a later entitlement model.", tone: "unavailable" },
      { label: "Sponsorships", value: getMoneyFeatureStateLabel(moneyFlag("sponsorships_enabled").state) === "Disabled" ? "Planned" : getMoneyFeatureStateLabel(moneyFlag("sponsorships_enabled").state), body: "Sponsorship tools need review, disclosure, brand safety, and payment checks.", tone: "unavailable" },
      { label: "Ad revenue", value: getMoneyFeatureStateLabel(moneyFlag("ads_revenue_enabled").state) === "Disabled" ? "Planned" : getMoneyFeatureStateLabel(moneyFlag("ads_revenue_enabled").state), body: summarizeProviderReadiness(adRevenueReadiness, "Creator ad revenue waits for real ad reporting and payout checks."), tone: "unavailable" },
      { label: "Revenue imports", value: sectionStatus("creator_revenue_imports_enabled", revenueImportReadiness, "Disabled"), body: summarizeProviderReadiness(revenueImportReadiness, "Real source revenue imports remain unavailable."), tone: "unavailable" },
    ];
    const technicalCards: readonly SummaryMetricCard[] = [
      {
        label: "RevenueCat public key",
        value: revenueCatReadiness.anyPublicKeyConfigured ? "Present" : "Missing",
        body: "Public runtime status only. No credentials are shown.",
        tone: revenueCatReadiness.anyPublicKeyConfigured ? "default" : "unavailable",
      },
      {
        label: "Offering",
        value: "premium",
        body: "Public model id only; purchase availability is still checked by the subscription flow.",
      },
      {
        label: "Product",
        value: CREATOR_MONETIZATION_DOCTRINE.premiumProduct,
        body: "Google Play product id is public setup metadata, not a credential.",
      },
      {
        label: "Stripe Connect",
        value: providerStatusLabel(stripeConnectReadiness, creatorPayoutSummary.providerReady ? "Ready for review" : "Not active"),
        body: "No credentials, webhook signing values, transfers, or payout actions are exposed.",
        tone: getProviderReadinessTone(stripeConnectReadiness),
      },
      {
        label: "Stripe switch",
        value: getMoneyFeatureStateLabel(stripeConnectFlag.state),
        body: stripeConnectFlag.displaySummary,
        tone: switchTone(stripeConnectFlag.state) === "default" ? "default" : "unavailable",
      },
      {
        label: "Payment rails",
        value: providerStatusLabel(policyReadiness, "Guarded"),
        body: summarizeProviderReadiness(policyReadiness, "Premium remains Google Play plus RevenueCat; creator payouts remain separate."),
      },
      {
        label: "Revenue imports",
        value: providerStatusLabel(revenueImportReadiness, "Not active yet"),
        body: summarizeProviderReadiness(revenueImportReadiness, "Real source revenue imports remain unavailable."),
        tone: "unavailable",
      },
      {
        label: "Webhook checks",
        value: getMoneyFeatureStateLabel(providerWebhooksFlag.state),
        body: "Technical status only. Secret values and provider payloads are never shown.",
        tone: switchTone(providerWebhooksFlag.state) === "default" ? "default" : "unavailable",
      },
    ];
    const overviewEvents = creatorMoneyAuditEvents.filter((event) => (
      event.category === "kill_switches"
      || event.category === "provider_readiness"
      || event.category === "blocked_actions"
      || event.category === "ledger"
    ));
    const digitalEvents = creatorMoneyAuditEvents.filter((event) => event.category === "digital_sales");
    const merchEvents = creatorMoneyAuditEvents.filter((event) => event.category === "merch");
    const balanceEvents = creatorMoneyAuditEvents.filter((event) => event.category === "ledger" || event.category === "revenue_imports");
    const payoutEvents = creatorMoneyAuditEvents.filter((event) => event.category === "payouts");
    const providerEvents = creatorMoneyAuditEvents.filter((event) => event.category === "provider_readiness" || event.category === "webhooks");

    if (moneyCenterFeatureFlag.state === "off" || moneyCenterFeatureFlag.state === "locked" || moneyCenterFeatureFlag.state === "maintenance") {
      const unavailableStatus = moneyCenterFeatureFlag.state === "locked" ? "Blocked" : "Disabled";
      return (
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <View style={styles.panelHeaderCopy}>
              <Text style={styles.panelTitle}>Money Center</Text>
              <Text style={styles.panelSubtitle}>Creator money tools are unavailable right now.</Text>
            </View>
            {renderStudioStatusPill(unavailableStatus, moneyCenterFeatureFlag.state === "locked" ? "warning" : "muted")}
          </View>
          <Text style={styles.permissionCopy}>
            Money Center is not active yet. Payments stay locked until provider checks pass.
          </Text>
          {renderSummaryMetricCards([
            { label: "Money Center", value: unavailableStatus, body: moneyCenterFeatureFlag.displaySummary, tone: "unavailable" },
            { label: "Provider checks", value: providerOverallStatus, body: "Provider checks are the source of readiness truth.", tone: "unavailable" },
            { label: "Live money", value: getMoneyFeatureStateLabel(liveMoneyFeatureFlag.state), body: "Live money stays off until owner approval and provider proof pass.", tone: "unavailable" },
          ])}
        </View>
      );
    }

    return (
      <>
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <View style={styles.panelHeaderCopy}>
              <Text style={styles.panelTitle}>Money Center</Text>
              <Text style={styles.panelSubtitle}>One place for sales readiness, creator balance, payouts, and provider checks.</Text>
            </View>
            {renderStudioStatusPill(topStatus, sectionTone(topStatus))}
          </View>
          <Text style={styles.permissionCopy}>
            {monetizationActive
              ? "Money tools are active. Keep store, payment, refund, tax, safety, and payout checks reviewed before adding new tools."
              : "Digital sales are not active yet. Payments stay locked until provider checks pass."}
          </Text>
          <View style={styles.summaryGrid}>
            {[
              { label: "Active", value: monetizationActive ? "Money tools" : "None" },
              { label: "Locked", value: monetizationActive ? "Review needed" : "Sales and payouts" },
              { label: "Next step", value: providerOverallStatus === "Sandbox ready" ? "Review setup" : "Store setup needed" },
            ].map((item) => (
              <View key={item.label} style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>{item.label}</Text>
                <Text style={styles.summaryValue}>{item.value}</Text>
              </View>
            ))}
          </View>
          <View style={styles.eventActionRow}>
            <TouchableOpacity
              style={styles.eventPrimaryButton}
              activeOpacity={0.88}
              onPress={() => {
                setExpandedMonetizationSections(new Set<MonetizationSectionId>([
                  "overview",
                  "digital_sales",
                  "balance",
                  "payouts",
                  "providers",
                ]));
              }}
            >
              <Text style={styles.eventPrimaryButtonText}>Check readiness</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.eventSecondaryButton}
              activeOpacity={0.88}
              onPress={() => router.push("/subscribe" as Parameters<typeof router.push>[0])}
            >
              <Text style={styles.eventSecondaryButtonText}>Manage Premium</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.studioAccordionStack}>
          {renderMonetizationAccordion({
            id: "overview",
            title: "Overview",
            summary: "A quick read on what is active and what is locked.",
            status: topStatus,
            statusTone: sectionTone(topStatus),
            children: (
              <>
                {renderSummaryMetricCards([
                  { label: "Digital sales", value: digitalSalesStatus === "Disabled" ? "Not active" : digitalSalesStatus, body: "Store setup needed before paid digital access can open.", tone: sectionTone(digitalSalesStatus) === "default" ? "default" : "unavailable" },
                  { label: "Creator balance", value: "No verified earnings yet", body: "Your balance will appear after verified sales.", tone: "unavailable" },
                  { label: "Payouts", value: payoutsStatus === "Disabled" ? "Not active" : payoutsStatus, body: "Payouts need Stripe setup and policy checks.", tone: sectionTone(payoutsStatus) === "default" && creatorPayoutSummary.providerReady ? "default" : "unavailable" },
                  { label: "Provider checks", value: providerOverallStatus, body: "Provider checks are the source of readiness truth.", tone: providerOverallStatus === "Sandbox ready" ? "default" : "unavailable" },
                ])}
                <View style={styles.eventEmptyCard}>
                  <Text style={styles.eventEmptyTitle}>Payment rules</Text>
                  <Text style={styles.eventEmptyBody}>
                    Digital sales inside Android use Google Play Billing where required. Creator payouts are handled separately through Stripe Connect when available. Physical merch can use an approved merch checkout. No payout is available until setup and verification are complete.
                  </Text>
                </View>
                {renderCreatorMoneyEventRows(
                  overviewEvents,
                  "No creator money events yet",
                  "Setup, sandbox, readiness, and ledger details will appear here when there are safe rows for this creator.",
                  5,
                )}
              </>
            ),
          })}

          {renderMonetizationAccordion({
            id: "digital_sales",
            title: "Digital Sales",
            summary: "Premium, digital passes, and paid access readiness.",
            status: digitalSalesStatus,
            statusTone: sectionTone(digitalSalesStatus),
            children: (
              <>
                {renderSummaryMetricCards(digitalSalesCards)}
                {renderCreatorMoneyEventRows(
                  digitalEvents,
                  "No digital sales rows yet",
                  "Digital sales setup rows, sandbox provider events, and readiness checks will appear here when safely readable.",
                  4,
                )}
                {renderStudioActionRow({
                  title: "Manage Premium",
                  body: "Open the subscription screen for Premium status, purchase, restore, or account subscription management.",
                  value: "Open",
                  onPress: () => router.push("/subscribe" as Parameters<typeof router.push>[0]),
                })}
              </>
            ),
          })}

          {renderMonetizationAccordion({
            id: "tips",
            title: "Tips",
            summary: "Creator support readiness.",
            status: tipsStatus,
            statusTone: sectionTone(tipsStatus),
            children: (
              <>
                {renderSummaryMetricCards(tipsCards)}
                {renderCreatorMoneyEventRows(
                  digitalEvents.filter((event) => event.title.toLowerCase().includes("tip") || event.sourceLabel.toLowerCase().includes("tip")),
                  "No tips rows yet",
                  "Tips are planned/setup only. Any future sandbox rows will be marked sandbox only and not payable.",
                  3,
                )}
                <View style={styles.eventEmptyCard}>
                  <Text style={styles.eventEmptyTitle}>Tips are planned.</Text>
                  <Text style={styles.eventEmptyBody}>No tip totals, tip balance, or tip checkout is available here.</Text>
                </View>
              </>
            ),
          })}

          {renderMonetizationAccordion({
            id: "watch_party_seats",
            title: "Watch-Party Seats",
            summary: "Paid seat readiness without changing room authority.",
            status: watchPartySeatsStatus,
            statusTone: sectionTone(watchPartySeatsStatus),
            children: (
              <>
                {renderSummaryMetricCards(watchPartySeatCards)}
                {renderCreatorMoneyEventRows(
                  providerEvents.filter((event) => event.capability === "google_play_subscription_product" || event.capability === "paid_content"),
                  "No Watch-Party seat rows yet",
                  "Paid seats stay setup/planned until Google Play or RevenueCat provider proof exists.",
                  3,
                )}
              </>
            ),
          })}

          {renderMonetizationAccordion({
            id: "paid_content",
            title: "Paid Content",
            summary: "Paid videos, replays, posts, and collections.",
            status: paidContentStatus,
            statusTone: sectionTone(paidContentStatus),
            children: (
              <>
                {renderSummaryMetricCards(paidContentCards)}
                {renderCreatorMoneyEventRows(
                  digitalEvents.filter((event) => event.title.toLowerCase().includes("content") || event.capability === "paid_content"),
                  "No paid content rows yet",
                  "Paid content setup rows are not paywalls and do not unlock access until provider proof exists.",
                  3,
                )}
              </>
            ),
          })}

          {renderMonetizationAccordion({
            id: "merch",
            title: "Merch",
            summary: "Physical goods are separate from digital app access.",
            status: merchStatus,
            statusTone: sectionTone(merchStatus),
            children: (
              <>
                {renderSummaryMetricCards(merchCards)}
                {renderCreatorMoneyEventRows(
                  merchEvents,
                  "No merch rows yet",
                  "Physical merch setup rows will appear here when safe creator-owned records exist.",
                  3,
                )}
              </>
            ),
          })}

          {renderMonetizationAccordion({
            id: "balance",
            title: "Creator Balance",
            summary: "Ledger-first balance status.",
            status: balanceStatus,
            statusTone: sectionTone(balanceStatus),
            children: (
              <>
                {renderSummaryMetricCards(balanceCards)}
                <View style={styles.eventEmptyCard}>
                  <Text style={styles.eventEmptyTitle}>No verified earnings yet.</Text>
                  <Text style={styles.eventEmptyBody}>No dollar amount is shown until verified ledger rows exist. Pending, available, paid, refunded, reversed, and blocked balances stay separate.</Text>
                </View>
                {renderCreatorMoneyEventRows(
                  balanceEvents,
                  "No verified ledger rows yet",
                  "Any setup/readiness row here is not payable and does not create a balance.",
                  5,
                )}
              </>
            ),
          })}

          {renderMonetizationAccordion({
            id: "payouts",
            title: "Payouts",
            summary: "Setup status, KYC/tax readiness, and unavailable payout actions.",
            status: payoutsStatus,
            statusTone: sectionTone(payoutsStatus),
            children: (
              <>
                {renderSummaryMetricCards(payoutCards)}
                {canStartStripeSetup && (creatorPayoutSummary.setupActionLabel || creatorPayoutSummary.canRefreshProviderStatus) ? (
                  <View style={styles.eventActionRow}>
                    {creatorPayoutSummary.setupActionLabel ? (
                      <TouchableOpacity
                        style={[styles.eventPrimaryButton, payoutSetupBusy === "setup" && styles.eventPrimaryButtonDisabled]}
                        activeOpacity={0.88}
                        disabled={payoutSetupBusy !== null}
                        onPress={handleStartPayoutProviderSetup}
                      >
                        {payoutSetupBusy === "setup" ? (
                          <View style={styles.eventPrimaryButtonBusyRow}>
                            <ActivityIndicator color="#fff" />
                            <Text style={styles.eventPrimaryButtonText}>Opening setup</Text>
                          </View>
                        ) : (
                          <Text style={styles.eventPrimaryButtonText}>{creatorPayoutSummary.setupActionLabel}</Text>
                        )}
                      </TouchableOpacity>
                    ) : null}
                    {creatorPayoutSummary.canRefreshProviderStatus ? (
                      <TouchableOpacity
                        style={[styles.eventSecondaryButton, payoutSetupBusy === "sync" && styles.eventPrimaryButtonDisabled]}
                        activeOpacity={0.88}
                        disabled={payoutSetupBusy !== null}
                        onPress={handleRefreshPayoutProviderStatus}
                      >
                        {payoutSetupBusy === "sync" ? (
                          <ActivityIndicator color="#3F2D20" />
                        ) : (
                          <Text style={styles.eventSecondaryButtonText}>Refresh status</Text>
                        )}
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
                {payoutSetupNotice ? <Text style={styles.noticeText}>{payoutSetupNotice}</Text> : null}
                <View style={styles.eventEmptyCard}>
                  <Text style={styles.eventEmptyTitle}>Payouts are locked.</Text>
                  <Text style={styles.eventEmptyBody}>Stripe Connect is for creator payouts only. It is not used to charge Android users for digital access.</Text>
                </View>
                {renderCreatorMoneyEventRows(
                  payoutEvents,
                  "No payout rows yet",
                  "Payout setup and request rows are not withdrawable while payout and live-money switches are off.",
                  4,
                )}
              </>
            ),
          })}

          {renderMonetizationAccordion({
            id: "tax_legal",
            title: "Tax & Legal",
            summary: "Tax profile, payout terms, refunds, and policy checks.",
            status: taxLegalStatus,
            statusTone: sectionTone(taxLegalStatus),
            children: (
              <>
                {renderSummaryMetricCards(taxLegalCards)}
                {renderStudioActionRow({
                  title: "Creator monetization policy",
                  body: "Open creator monetization policy and payout terms.",
                  value: "Policy",
                  onPress: () => router.push("/creator-monetization" as Parameters<typeof router.push>[0]),
                })}
              </>
            ),
          })}

          {renderMonetizationAccordion({
            id: "providers",
            title: "Provider Status",
            summary: "Sanitized readiness for store, payout, and policy checks.",
            status: providerOverallStatus,
            statusTone: providerOverallStatus === "Sandbox ready" || providerOverallStatus === "Active" ? "default" : "muted",
            children: (
              <>
                {renderSummaryMetricCards(providerCards)}
                {renderCreatorMoneyEventRows(
                  providerEvents,
                  "No provider readiness details yet",
                  "Provider readiness rows are sanitized and never expose secrets or raw payloads.",
                  6,
                )}
              </>
            ),
          })}

          {renderMonetizationAccordion({
            id: "future",
            title: "Future Tools",
            summary: "Money tools that stay planned until backed.",
            status: "Planned",
            statusTone: "muted",
            children: (
              <>
                {renderSummaryMetricCards(futureToolCards)}
                <View style={styles.eventEmptyCard}>
                  <Text style={styles.eventEmptyTitle}>No money action is available here.</Text>
                  <Text style={styles.eventEmptyBody}>Setup required states do not create balances, transfers, checkout, withdrawals, or earnings.</Text>
                </View>
              </>
            ),
          })}

          {canSeeMonetizationTechnicalChecks ? renderMonetizationAccordion({
            id: "technical",
            title: "Technical checks",
            summary: "Owner/dev-only public-safe readiness details.",
            status: "Owner/dev",
            statusTone: "muted",
            children: renderSummaryMetricCards(technicalCards),
          }) : null}
        </View>
      </>
    );
  };

  const renderModerationTab = () => (
    <>
      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <View style={styles.panelHeaderCopy}>
            <Text style={styles.panelTitle}>Moderation and Safety</Text>
            <Text style={styles.panelSubtitle}>Reports, blocks, comments, and platform safety.</Text>
          </View>
          <Text style={styles.panelStatusMuted}>CREATOR SAFE</Text>
        </View>
        <Text style={styles.permissionCopy}>
          Platform Studio shows creator-safe safety controls here. Admin-only queues and enforcement tools stay in Admin unless this account already has backed review access.
        </Text>
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>Safety status</Text>
          <Text style={styles.panelStatusMuted}>
            {recentSafetyReportCount == null ? "Protected" : recentSafetyReportCount ? "Needs review" : "Clear"}
          </Text>
        </View>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Reports</Text>
            <Text style={styles.summaryValue}>
              {recentSafetyReportCount == null ? "Not available" : String(recentSafetyReportCount)}
            </Text>
            <Text style={styles.summaryBody}>
              {recentSafetyReportCount == null
                ? "Creator-facing report review is not available to this account."
                : recentSafetyReportCount
                  ? "Reports are visible to this account through backed review access."
                  : "No reports waiting."}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Blocked accounts</Text>
            <Text style={styles.summaryValue}>{blockedAudienceCount == null ? "Protected" : String(blockedAudienceCount)}</Text>
            <Text style={styles.summaryBody}>
              {blockedAudienceCount ? "Platform-owned audience blocks are backed here." : "No blocked accounts."}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Comments</Text>
            <Text style={styles.summaryValue}>Per video</Text>
            <Text style={styles.summaryBody}>Comment and reply controls stay with each content item for now.</Text>
          </View>
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>Safety paths</Text>
          <Text style={styles.panelStatusMuted}>Open</Text>
        </View>
        <View style={styles.studioActionList}>
          {renderStudioActionRow({
            title: "Reports",
            body: recentSafetyReportCount == null ? "Not available yet for normal creator review." : recentSafetyReportCount ? "Open report signal details." : "No reports waiting.",
            value: recentSafetyReportCount == null ? "Not available" : recentSafetyReportCount ? String(recentSafetyReportCount) : "Clear",
            tone: recentSafetyReportCount ? "warning" : "muted",
            onPress: () => {
              if (recentSafetyReportCount == null) {
                showStudioUnavailable(
                  "Not available yet",
                  "Creator-facing report review is not available to this account yet. Platform reports are still handled through the existing safety review flow.",
                );
                return;
              }
              showStudioUnavailable(
                recentSafetyReportCount ? "Reports visible" : "No reports waiting",
                recentSafetyReportCount
                  ? "This account has backed report visibility. Use Admin for operator review actions; Platform Studio keeps creator-facing controls here."
                  : "No reports are waiting for this platform right now.",
              );
            },
          })}
          {renderStudioActionRow({
            title: "Blocked accounts",
            body: "Open audience block controls.",
            value: "Audience",
            onPress: () => openStudioTab("audience", { focus: "blocks" }),
          })}
          {renderStudioActionRow({
            title: "Comments and replies",
            body: "Open content management. Comment controls stay with each video.",
            value: "Content",
            onPress: () => openStudioTab("content", { filter: "all", focus: "comments" }),
          })}
          {renderStudioActionRow({
            title: "Live safety",
            body: "Open live events and room defaults. Existing LiveKit behavior is unchanged.",
            value: "Live",
            onPress: () => openStudioTab("live", { focus: "safety" }),
          })}
          {renderStudioActionRow({
            title: "Community rules",
            body: "Open the rules for platform participation.",
            value: "Policy",
            onPress: () => router.push("/community-guidelines" as Parameters<typeof router.push>[0]),
          })}
          {renderStudioActionRow({
            title: "Content moderation policy",
            body: "Open enforcement, moderation, and appeals policy.",
            value: "Policy",
            onPress: () => router.push("/moderation-policy" as Parameters<typeof router.push>[0]),
          })}
        </View>
      </View>
    </>
  );

  const renderCreatorEventCard = (event: CreatorEventSummary) => {
    const reminderSummary = creatorReminderSummaryByEventId.get(event.id);

    return (
      <View key={event.id} style={styles.eventCard}>
        <View style={styles.eventCardHeader}>
          <View style={styles.eventCardCopy}>
            <Text style={styles.eventCardTitle}>{event.eventTitle}</Text>
            <Text style={styles.eventCardMeta}>
              {formatEventTypeLabel(event.eventType)} · {formatEventStatusLabel(event.status)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.eventActionButton}
            onPress={() => onEditEvent(event)}
            activeOpacity={0.86}
          >
            <Text style={styles.eventActionButtonText}>Edit</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.eventCardBody}>
          Starts: {formatIsoDate(event.startsAt)}{"\n"}
          Ends: {formatIsoDate(event.endsAt)}{"\n"}
          Replay: {formatReplayPolicyLabel(event.replayPolicy)} · {formatReplayStateLabel(event)}{"\n"}
          Reminder: {formatReminderLabel(event)} · {reminderSummary?.activeReminderCount ?? 0} active enrollment{(reminderSummary?.activeReminderCount ?? 0) === 1 ? "" : "s"}
          {reminderSummary?.canceledReminderCount
            ? `\nCanceled reminders: ${reminderSummary.canceledReminderCount}`
            : ""}
          {event.linkedTitleId ? `\nLinked title: ${event.linkedTitleId}` : ""}
        </Text>
      </View>
    );
  };

  const renderLiveActionsPanel = () => (
    <View style={styles.panel}>
      <View style={styles.panelHeader}>
        <View style={styles.panelHeaderCopy}>
          <Text style={styles.panelTitle}>Live Actions</Text>
        </View>
      </View>
      <View style={styles.quickActionGrid}>
        {renderQuickActionCard({
          title: "Go Live",
          body: "Open the existing Live Watch-Party start flow.",
          onPress: () => {
            router.push({ pathname: "/watch-party", params: { mode: "live", source: "platform-studio" } });
          },
        })}
        {renderQuickActionCard({
          title: "Schedule Event",
          body: "Use the backed creator event form below.",
          onPress: () => openStudioTab("live", { focus: "schedule" }),
        })}
        {renderQuickActionCard({
          title: "Watch-Party Tools",
          body: "Open a public video, then start Watch-Party Live from Player.",
          onPress: () => {
            if (latestCreatorVideo?.visibility === "public" && hasPlayableCreatorVideoSource(latestCreatorVideo)) {
              router.push({ pathname: "/player/[id]", params: { id: latestCreatorVideo.id, source: "creator-video" } });
              return;
            }
            showStudioUnavailable(
              "Setup required",
              "Watch-Party Live from content starts from a playable public video. Publish a video first, then open it in Player.",
            );
          },
        })}
      </View>
    </View>
  );

  if (authLoading || betaLoading) {
    return (
      <BetaAccessScreen
        title="Loading Platform Studio"
        body="Checking your signed-in identity before opening Platform Studio."
        loadingOverride
      />
    );
  }

  if (!isSignedIn) {
    return (
      <BetaAccessScreen
        title="Sign in to open Platform Studio"
        body="Platform Studio stays behind signed-in access because it changes creator defaults and room options."
      />
    );
  }

  if (!isActive) {
    return (
      <BetaAccessScreen
        title={blockedBetaCopy.title}
        body={blockedBetaCopy.body}
        accessState={accessState.status === "loading" || accessState.status === "signed_out" || accessState.status === "active" ? null : accessState.status}
      />
    );
  }

  return (
    <>
    <ImageBackground source={SKYLINE_SOURCE} style={styles.background} resizeMode="cover">
      <View style={styles.overlay} />

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>{appDisplayName.toUpperCase()} · PLATFORM STUDIO</Text>
          <View style={{ width: 18 }} />
        </View>

        {renderStudioHeader()}

        {loading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.loadingText}>Loading Platform Studio…</Text>
          </View>
        ) : !settingsEnabled ? (
          <View style={styles.disabledCard}>
            <Text style={styles.disabledTitle}>Platform Studio is hidden</Text>
            <Text style={styles.disabledBody}>
              The creator settings entry is currently disabled in global app config.
            </Text>
          </View>
        ) : profile ? (
          <>
            {notice ? (
              <View style={styles.noticeCard}>
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            ) : null}

            {renderStudioTabBar()}
            {activeStudioTab === "home" ? renderStudioHomeTab() : null}
            {activeStudioTab === "content" ? renderContentPanel() : null}
            {activeStudioTab === "clip" ? renderClipStudioTab() : null}
            {activeStudioTab === "monetization" ? renderMonetizationTab() : null}
            {activeStudioTab === "moderation" ? renderModerationTab() : null}

            {activeStudioTab === "brand" ? renderBrandStudioTab() : null}

            {activeStudioTab === "live" ? (
              <>
                {renderLiveActionsPanel()}
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <View style={styles.panelHeaderCopy}>
                  <Text style={styles.panelTitle}>Live</Text>
                  <Text style={styles.panelSubtitle}>Manage live events and future Watch-Party tools for your platform.</Text>
                </View>
                <Text style={styles.panelStatus}>CURRENT CONTROL</Text>
              </View>
              <Text style={styles.permissionCopy}>
                Schedule live sessions here now. Event access and reminder delivery still stay later.
              </Text>

              {eventNotice ? (
                <View style={styles.noticeCard}>
                  <Text style={styles.noticeText}>{eventNotice}</Text>
                </View>
              ) : null}

              <View style={styles.summaryGrid}>
                {eventSummaryCards.map((card) => (
                  <View key={card.label} style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.summaryGrid}>
                {reminderEnrollmentCards.map((card) => (
                  <View
                    key={card.label}
                    style={[styles.summaryCard, card.tone === "unavailable" && styles.summaryCardUnavailable]}
                  >
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.permissionCopy}>
                Reminder delivery still stays later. This surface shows only real reminder-ready event truth and viewer enrollment interest.
              </Text>

              <View style={styles.eventSnapshotCard}>
                <Text style={styles.accessSummaryKicker}>NEXT REAL EVENT</Text>
                <Text style={styles.accessSummaryTitle}>
                  {nextUpcomingEvent ? nextUpcomingEvent.eventTitle : "No upcoming event scheduled"}
                </Text>
                <Text style={styles.accessSummaryBody}>
                  {nextUpcomingEvent
                    ? `${formatEventTypeLabel(nextUpcomingEvent.eventType)} · ${formatIsoDate(nextUpcomingEvent.startsAt)}`
                    : "Create the first scheduled event here. Countdown, reminder delivery, and event access still stay later."}
                </Text>
              </View>

              <Text style={styles.sectionLabel}>Upcoming Events</Text>
              {eventsLoading ? (
                <View style={styles.loadingCard}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.loadingText}>Loading creator events…</Text>
                </View>
              ) : upcomingEvents.length ? (
                <View style={styles.eventList}>
                  {upcomingEvents.map(renderCreatorEventCard)}
                </View>
              ) : (
                <View style={styles.eventEmptyCard}>
                  <Text style={styles.eventEmptyTitle}>No upcoming events yet.</Text>
                  <Text style={styles.eventEmptyBody}>No upcoming events yet.</Text>
                </View>
              )}

              {!eventsLoading && otherCreatorEvents.length ? (
                <>
                  <Text style={styles.sectionLabel}>Other Events</Text>
                  <View style={styles.eventList}>
                    {otherCreatorEvents.map(renderCreatorEventCard)}
                  </View>
                </>
              ) : null}

              <Text style={styles.sectionLabel}>
                {eventEditor.editingEventId ? "Edit Event" : "Create Event"}
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Event title"
                placeholderTextColor="#8d8d8d"
                value={eventEditor.eventTitle}
                onChangeText={(text) => updateEventEditor({ eventTitle: text })}
              />

              <Text style={styles.sectionLabel}>Event Type</Text>
              <View style={styles.chipRow}>
                {(["live_first", "live_watch_party", "watch_party_live"] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, eventEditor.eventType === value && styles.chipActive]}
                    onPress={() => updateEventEditor({ eventType: value })}
                  >
                    <Text style={[styles.chipText, eventEditor.eventType === value && styles.chipTextActive]}>
                      {formatEventTypeLabel(value)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Status</Text>
              <View style={styles.chipRow}>
                {(["draft", "scheduled", "live_now", "ended", "replay_available", "expired", "canceled"] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, eventEditor.status === value && styles.chipActive]}
                    onPress={() => updateEventEditor({ status: value, reminderReady: value === "scheduled" ? eventEditor.reminderReady : false })}
                  >
                    <Text style={[styles.chipText, eventEditor.status === value && styles.chipTextActive]}>
                      {formatEventStatusLabel(value)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.input}
                placeholder="Starts at (YYYY-MM-DDTHH:mm)"
                placeholderTextColor="#8d8d8d"
                value={eventEditor.startsAt}
                onChangeText={(text) => updateEventEditor({ startsAt: text })}
              />
              <TextInput
                style={styles.input}
                placeholder="Ends at (YYYY-MM-DDTHH:mm)"
                placeholderTextColor="#8d8d8d"
                value={eventEditor.endsAt}
                onChangeText={(text) => updateEventEditor({ endsAt: text })}
              />

              {eventEditor.eventType === "watch_party_live" ? (
                <TextInput
                  style={styles.input}
                  placeholder="Linked title id"
                  placeholderTextColor="#8d8d8d"
                  value={eventEditor.linkedTitleId}
                  onChangeText={(text) => updateEventEditor({ linkedTitleId: text })}
                />
              ) : null}

              <Text style={styles.sectionLabel}>Replay Policy</Text>
              <View style={styles.chipRow}>
                {(["none", "indefinite", "until_expiration"] as const).map((value) => (
                  <TouchableOpacity
                    key={value}
                    style={[styles.chip, eventEditor.replayPolicy === value && styles.chipActive]}
                    onPress={() => updateEventEditor({ replayPolicy: value })}
                  >
                    <Text style={[styles.chipText, eventEditor.replayPolicy === value && styles.chipTextActive]}>
                      {formatReplayPolicyLabel(value)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {eventEditor.replayPolicy !== "none" ? (
                <>
                  <TextInput
                    style={styles.input}
                    placeholder="Replay available at (YYYY-MM-DDTHH:mm)"
                    placeholderTextColor="#8d8d8d"
                    value={eventEditor.replayAvailableAt}
                    onChangeText={(text) => updateEventEditor({ replayAvailableAt: text })}
                  />
                  {eventEditor.replayPolicy === "until_expiration" ? (
                    <TextInput
                      style={styles.input}
                      placeholder="Replay expires at (YYYY-MM-DDTHH:mm)"
                      placeholderTextColor="#8d8d8d"
                      value={eventEditor.replayExpiresAt}
                      onChangeText={(text) => updateEventEditor({ replayExpiresAt: text })}
                    />
                  ) : null}
                </>
              ) : null}

              {liveReplayAcknowledgementRequired ? (
                <TouchableOpacity
                  style={[styles.legalAcknowledgementRow, liveReplayAccepted && styles.legalAcknowledgementRowActive]}
                  activeOpacity={0.86}
                  onPress={() => setLiveReplayAccepted((current) => !current)}
                  disabled={eventSaving}
                >
                  <View style={[styles.legalCheckbox, liveReplayAccepted && styles.legalCheckboxActive]}>
                    <Text style={styles.legalCheckboxMark}>{liveReplayAccepted ? "✓" : ""}</Text>
                  </View>
                  <Text style={styles.legalAcknowledgementText}>{LIVE_REPLAY_ACKNOWLEDGEMENT}</Text>
                </TouchableOpacity>
              ) : null}

              <Text style={styles.sectionLabel}>Reminder Readiness</Text>
              <View style={styles.chipRow}>
                {(["off", "ready"] as const).map((value) => {
                  const active = value === "ready" ? eventEditor.reminderReady : !eventEditor.reminderReady;
                  const disabled = value === "ready" && eventEditor.status !== "scheduled";

                  return (
                    <TouchableOpacity
                      key={value}
                      style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}
                      onPress={() => {
                        if (disabled) return;
                        updateEventEditor({ reminderReady: value === "ready" });
                      }}
                      disabled={disabled}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>
                        {value === "ready" ? "READY" : "OFF"}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.permissionCopy}>
                Reminder readiness is only honest for scheduled events with a real start time. Delivery still lands later.
              </Text>

              <View style={styles.eventActionRow}>
                <TouchableOpacity
                  style={styles.eventPrimaryButton}
                  onPress={onSaveEvent}
                  activeOpacity={0.88}
                  disabled={eventSaving}
                >
                  {eventSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.eventPrimaryButtonText}>
                      {eventEditor.editingEventId ? "Update Event" : "Create Event"}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.eventSecondaryButton}
                  onPress={() => {
                    resetEventEditor();
                    setEventNotice(null);
                  }}
                  activeOpacity={0.86}
                  disabled={eventSaving}
                >
                  <Text style={styles.eventSecondaryButtonText}>Reset</Text>
                </TouchableOpacity>
              </View>
            </View>

              </>
            ) : null}

            {activeStudioTab === "audience" ? (
              <>
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <View style={styles.panelHeaderCopy}>
                  <Text style={styles.panelTitle}>Audience</Text>
                  <Text style={styles.panelSubtitle}>Manage followers, requests, blocks, and subscriber signals for your platform.</Text>
                </View>
                <Text style={styles.panelStatus}>CURRENT CONTROL</Text>
              </View>
              <Text style={styles.permissionCopy}>
                Counts and visibility values come from the landed audience read model. Deeper audience-role systems still stay later.
              </Text>
              <View style={styles.summaryGrid}>
                {audienceSummaryCards.map((card) => (
                  <View key={card.label} style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.summaryGrid}>
                {audienceVisibilityCards.map((card) => (
                  <View key={card.label} style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.eventSnapshotCard}>
                <Text style={styles.accessSummaryKicker}>LIVE WORKFLOWS</Text>
                <Text style={styles.accessSummaryTitle}>Real audience actions live here now</Text>
                <Text style={styles.accessSummaryBody}>
                  Follower removal, request review, and block workflows are real here now. Subscriber mutation and VIP/mod/co-host systems still stay later.
                </Text>
              </View>

              {audienceActionNotice ? (
                <View style={styles.noticeCard}>
                  <Text style={styles.noticeText}>{audienceActionNotice}</Text>
                </View>
              ) : null}

              {audienceActionSummaryCards.length ? (
                <View style={styles.summaryGrid}>
                  {audienceActionSummaryCards.map((card) => (
                    <View key={card.label} style={styles.summaryCard}>
                      <Text style={styles.summaryLabel}>{card.label}</Text>
                      <Text style={styles.summaryValue}>{card.value}</Text>
                      <Text style={styles.summaryBody}>{card.body}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              <Text style={styles.sectionLabel}>Request Review</Text>
              <Text style={styles.permissionCopy}>
                Enter a backed request id to approve, decline, or cancel it. `follow` requests are real now; `subscriber_access` stays unsupported until subscriber mutation truth exists.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Audience request id"
                placeholderTextColor="#8d8d8d"
                value={audienceRequestIdInput}
                onChangeText={(text) => {
                  setAudienceRequestIdInput(text);
                  setAudienceActionNotice(null);
                }}
                keyboardType="number-pad"
              />
              <View style={styles.eventActionRow}>
                <TouchableOpacity
                  style={styles.eventPrimaryButton}
                  onPress={() => {
                    const requestId = Number.parseInt(audienceRequestIdInput, 10);
                    if (!Number.isFinite(requestId) || requestId <= 0) {
                      setAudienceActionNotice("Enter a valid audience request id before approving.");
                      return;
                    }
                    void runAudienceAction("approve_request", async () => {
                      const result = await approveChannelAudienceRequest(requestId);
                      if (result.status === "completed" || result.status === "unsupported" || result.status === "noop") {
                        setAudienceRequestIdInput("");
                      }
                      return result;
                    });
                  }}
                  activeOpacity={0.88}
                  disabled={audienceActionLoading !== null}
                >
                  {audienceActionLoading === "approve_request" ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.eventPrimaryButtonText}>Approve</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.eventSecondaryButton}
                  onPress={() => {
                    const requestId = Number.parseInt(audienceRequestIdInput, 10);
                    if (!Number.isFinite(requestId) || requestId <= 0) {
                      setAudienceActionNotice("Enter a valid audience request id before declining.");
                      return;
                    }
                    void runAudienceAction("decline_request", async () => {
                      const result = await declineChannelAudienceRequest(requestId);
                      if (result.status === "completed" || result.status === "noop") {
                        setAudienceRequestIdInput("");
                      }
                      return result;
                    });
                  }}
                  activeOpacity={0.86}
                  disabled={audienceActionLoading !== null}
                >
                  {audienceActionLoading === "decline_request" ? (
                    <ActivityIndicator color="#D9E0EE" />
                  ) : (
                    <Text style={styles.eventSecondaryButtonText}>Decline</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.eventSecondaryButton}
                  onPress={() => {
                    const requestId = Number.parseInt(audienceRequestIdInput, 10);
                    if (!Number.isFinite(requestId) || requestId <= 0) {
                      setAudienceActionNotice("Enter a valid audience request id before canceling.");
                      return;
                    }
                    void runAudienceAction("cancel_request", async () => {
                      const result = await cancelChannelAudienceRequest(requestId);
                      if (result.status === "completed" || result.status === "noop") {
                        setAudienceRequestIdInput("");
                      }
                      return result;
                    });
                  }}
                  activeOpacity={0.86}
                  disabled={audienceActionLoading !== null}
                >
                  {audienceActionLoading === "cancel_request" ? (
                    <ActivityIndicator color="#D9E0EE" />
                  ) : (
                    <Text style={styles.eventSecondaryButtonText}>Cancel</Text>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionLabel}>Follower Relationship</Text>
              <Text style={styles.permissionCopy}>
                Remove a backed follower relationship by follower user id when creator-side cleanup is needed. This stays separate from viewer-side follow or unfollow actions and does not invent subscriber mutation.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Follower user id"
                placeholderTextColor="#8d8d8d"
                value={audienceFollowerUserIdInput}
                onChangeText={(text) => {
                  setAudienceFollowerUserIdInput(text);
                  setAudienceActionNotice(null);
                }}
                autoCapitalize="none"
              />
              <View style={styles.eventActionRow}>
                <TouchableOpacity
                  style={styles.eventPrimaryButton}
                  onPress={() => {
                    const followerUserId = String(audienceFollowerUserIdInput).trim();
                    if (!followerUserId) {
                      setAudienceActionNotice("Enter a follower user id before removing a follower relationship.");
                      return;
                    }
                    void runAudienceAction("remove_follower", async () => {
                      const result = await removeChannelFollower({
                        channelUserId: String(user?.id ?? ""),
                        followerUserId,
                      });
                      if (result.status === "completed" || result.status === "noop") {
                        setAudienceFollowerUserIdInput("");
                      }
                      return result;
                    });
                  }}
                  activeOpacity={0.88}
                  disabled={audienceActionLoading !== null}
                >
                  {audienceActionLoading === "remove_follower" ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.eventPrimaryButtonText}>Remove Follower</Text>
                  )}
                </TouchableOpacity>
              </View>

              <Text style={styles.sectionLabel}>Blocked Audience</Text>
              <Text style={styles.permissionCopy}>
                Block and unblock use the real Platform-owned audience boundary already backed by schema truth. VIP, moderator, and co-host roles still stay out.
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Audience member user id"
                placeholderTextColor="#8d8d8d"
                value={audienceTargetUserIdInput}
                onChangeText={(text) => {
                  setAudienceTargetUserIdInput(text);
                  setAudienceActionNotice(null);
                }}
                autoCapitalize="none"
              />
              <TextInput
                style={styles.input}
                placeholder="Block reason (optional)"
                placeholderTextColor="#8d8d8d"
                value={audienceBlockReasonInput}
                onChangeText={(text) => {
                  setAudienceBlockReasonInput(text);
                  setAudienceActionNotice(null);
                }}
              />
              <View style={styles.eventActionRow}>
                <TouchableOpacity
                  style={styles.eventPrimaryButton}
                  onPress={() => {
                    const blockedUserId = String(audienceTargetUserIdInput).trim();
                    if (!blockedUserId) {
                      setAudienceActionNotice("Enter an audience member user id before blocking.");
                      return;
                    }
                    void runAudienceAction("block", async () => {
                      const result = await blockChannelAudienceMember({
                        channelUserId: String(user?.id ?? ""),
                        blockedUserId,
                        reason: String(audienceBlockReasonInput).trim() || null,
                      });
                      if (result.status === "completed" || result.status === "noop") {
                        setAudienceTargetUserIdInput("");
                        setAudienceBlockReasonInput("");
                      }
                      return result;
                    });
                  }}
                  activeOpacity={0.88}
                  disabled={audienceActionLoading !== null}
                >
                  {audienceActionLoading === "block" ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.eventPrimaryButtonText}>Block</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.eventSecondaryButton}
                  onPress={() => {
                    const blockedUserId = String(audienceTargetUserIdInput).trim();
                    if (!blockedUserId) {
                      setAudienceActionNotice("Enter an audience member user id before unblocking.");
                      return;
                    }
                    void runAudienceAction("unblock", async () => {
                      const result = await unblockChannelAudienceMember({
                        channelUserId: String(user?.id ?? ""),
                        blockedUserId,
                      });
                      if (result.status === "completed" || result.status === "noop") {
                        setAudienceTargetUserIdInput("");
                        setAudienceBlockReasonInput("");
                      }
                      return result;
                    });
                  }}
                  activeOpacity={0.86}
                  disabled={audienceActionLoading !== null}
                >
                  {audienceActionLoading === "unblock" ? (
                    <ActivityIndicator color="#D9E0EE" />
                  ) : (
                    <Text style={styles.eventSecondaryButtonText}>Unblock</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>

              </>
            ) : null}

            {activeStudioTab === "insights" ? (
              <>
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <View style={styles.panelHeaderCopy}>
                  <Text style={styles.panelTitle}>Insights</Text>
                  <Text style={styles.panelSubtitle}>Track what is actually backed by your platform data today.</Text>
                </View>
                <Text style={styles.panelStatus}>CURRENT SUMMARY</Text>
              </View>
              <Text style={styles.permissionCopy}>
                Only backed creator analytics render here. Unsupported metrics stay unavailable instead of being zeroed or fabricated.
              </Text>
              <Text style={styles.sectionLabel}>Platform Metrics</Text>
              <View style={styles.summaryGrid}>
                {insightMetricCards.map((card) => (
                  <View key={card.label} style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.sectionLabel}>Room And Audience Signals</Text>
              <View style={styles.summaryGrid}>
                {analyticsSummaryCards.map((card) => (
                  <View key={card.label} style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.sectionLabel}>Live / Event Signals</Text>
              <View style={styles.summaryGrid}>
                {analyticsEventSignalCards.map((card) => (
                  <View key={card.label} style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
            </View>

              </>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </ImageBackground>
    <Modal
      visible={selectedCreatorMoneyAuditEvent !== null}
      animationType="slide"
      transparent
      onRequestClose={() => setSelectedCreatorMoneyAuditEvent(null)}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.modalTitle}>Money Event Detail</Text>
              <Text style={styles.modalSubtitle}>
                {selectedCreatorMoneyAuditEvent
                  ? `${selectedCreatorMoneyAuditEvent.sourceLabel} · ${selectedCreatorMoneyAuditEvent.statusLabel}`
                  : "Money detail"}
              </Text>
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedCreatorMoneyAuditEvent(null)}>
              <Text style={styles.closeText}>Close</Text>
            </TouchableOpacity>
          </View>
          {selectedCreatorMoneyAuditEvent ? (
            <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: 12, paddingBottom: 18 }} showsVerticalScrollIndicator={false}>
              <View style={styles.eventEmptyCard}>
                <View style={styles.eventCardHeader}>
                  <View style={styles.eventCardCopy}>
                    <Text style={styles.eventCardTitle}>{selectedCreatorMoneyAuditEvent.title}</Text>
                    <Text style={styles.eventCardMeta}>
                      {selectedCreatorMoneyAuditEvent.createdAt ? formatIsoDate(selectedCreatorMoneyAuditEvent.createdAt) : "Time unknown"}
                    </Text>
                  </View>
                  {renderStudioStatusPill(selectedCreatorMoneyAuditEvent.statusLabel, creatorMoneyEventTone(selectedCreatorMoneyAuditEvent))}
                </View>
                <Text style={styles.eventEmptyBody}>{selectedCreatorMoneyAuditEvent.summary}</Text>
                <View style={styles.moneyAuditBadgeRow}>
                  <View style={styles.moneyAuditBadge}>
                    <Text style={styles.moneyAuditBadgeText}>
                      {selectedCreatorMoneyAuditEvent.environment === "sandbox" ? "Sandbox only" : selectedCreatorMoneyAuditEvent.environment === "production" ? "Production" : "Setup only"}
                    </Text>
                  </View>
                  <View style={styles.moneyAuditBadge}>
                    <Text style={styles.moneyAuditBadgeText}>{selectedCreatorMoneyAuditEvent.payable ? "Payable" : "Not payable"}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.eventEmptyCard}>
                <Text style={styles.eventEmptyTitle}>What this means</Text>
                <Text style={styles.eventEmptyBody}>{selectedCreatorMoneyAuditEvent.reason}</Text>
                <Text style={styles.eventEmptyBody}>{selectedCreatorMoneyAuditEvent.nextStep}</Text>
              </View>
              <View style={styles.eventEmptyCard}>
                <Text style={styles.eventEmptyTitle}>Safe Details</Text>
                {[
                  { label: "Source", value: selectedCreatorMoneyAuditEvent.sourceLabel },
                  { label: "Status", value: selectedCreatorMoneyAuditEvent.statusLabel },
                  { label: "Environment", value: selectedCreatorMoneyAuditEvent.environment },
                  { label: "Payable", value: selectedCreatorMoneyAuditEvent.payable ? "Yes" : "No" },
                  { label: "Provider", value: selectedCreatorMoneyAuditEvent.provider || "not provider-backed" },
                  { label: "Capability", value: selectedCreatorMoneyAuditEvent.capability || "not returned" },
                  { label: "Provider event", value: selectedCreatorMoneyAuditEvent.providerEventId ? "Recorded" : "not returned" },
                  { label: "Idempotency", value: selectedCreatorMoneyAuditEvent.idempotencyLabel },
                  ...selectedCreatorMoneyAuditEvent.detailRows.filter((row) => !row.label.toLowerCase().includes("user_id")).slice(0, 8),
                ].map((row) => (
                  <View key={`${row.label}-${row.value}`} style={styles.moneyAuditDetailRow}>
                    <Text style={styles.moneyAuditDetailLabel}>{row.label}</Text>
                    <Text style={styles.moneyAuditDetailValue}>{row.value}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.eventEmptyCard}>
                <Text style={styles.eventEmptyTitle}>Inspect only</Text>
                <Text style={styles.eventEmptyBody}>This detail view cannot create checkout, tips, balances, transfers, withdrawals, payouts, unlocks, or payable obligations.</Text>
              </View>
            </ScrollView>
          ) : null}
        </View>
      </View>
    </Modal>
    </>
  );
}

export default function ChannelSettingsCompatibilityRoute() {
  return <ChannelStudioScreen />;
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(6,8,14,0.8)",
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingTop: 54,
    paddingBottom: 48,
    paddingHorizontal: 18,
    gap: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backArrow: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  kicker: {
    color: "#AAB3C7",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
  },
  heroCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(12,16,24,0.88)",
    padding: 16,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
  },
  heroBody: {
    color: "#B8C1D6",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
    fontWeight: "600",
  },
  studioHeaderCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(168,192,245,0.16)",
    backgroundColor: "rgba(12,16,24,0.92)",
    padding: 16,
    gap: 11,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  studioSubtitle: {
    color: "#D8E0F0",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  studioClarifier: {
    color: "#98A5BD",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "700",
  },
  channelIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 9,
  },
  channelAvatarImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  channelAvatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(220,20,60,0.2)",
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.35)",
  },
  channelAvatarFallbackText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },
  channelIdentityCopy: {
    flex: 1,
    gap: 3,
  },
  channelIdentityName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  channelRoleChip: {
    alignSelf: "flex-start",
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: "#D6F8FF",
    backgroundColor: "rgba(126,215,255,0.14)",
    fontSize: 10.5,
    fontWeight: "900",
  },
  channelIdentityTagline: {
    color: "#B8C2D7",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "600",
  },
  studioHeaderActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  studioActionButton: {
    flexGrow: 1,
    flexBasis: "46%",
    minWidth: 132,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  studioActionButtonPrimary: {
    borderColor: "rgba(220,20,60,0.45)",
    backgroundColor: "rgba(220,20,60,0.24)",
  },
  studioActionButtonDisabled: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.05)",
    opacity: 0.78,
  },
  studioActionButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  studioActionButtonCopy: {
    color: "#B8C2D7",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },
  studioTabScroll: {
    marginHorizontal: -18,
  },
  studioTabBar: {
    paddingHorizontal: 18,
    gap: 8,
  },
  studioTabButton: {
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  studioTabButtonActive: {
    borderColor: "rgba(220,20,60,0.55)",
    backgroundColor: "rgba(220,20,60,0.28)",
  },
  studioTabButtonText: {
    color: "#B9C3D9",
    fontSize: 12,
    fontWeight: "900",
  },
  studioTabButtonTextActive: {
    color: "#fff",
  },
  studioStatusPill: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(45,153,92,0.34)",
    backgroundColor: "rgba(45,153,92,0.14)",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  studioStatusPillMuted: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  studioStatusPillWarning: {
    borderColor: "rgba(255,183,77,0.34)",
    backgroundColor: "rgba(255,183,77,0.13)",
  },
  studioStatusPillText: {
    color: "#F4F7FF",
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "900",
  },
  studioAccordionStack: {
    gap: 10,
  },
  studioAccordionCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(12,16,24,0.86)",
    overflow: "hidden",
  },
  studioAccordionHeader: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  studioAccordionCopy: {
    flex: 1,
    gap: 4,
  },
  studioAccordionTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  studioAccordionSummary: {
    color: "#AEB8CE",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  studioAccordionMeta: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 8,
  },
  studioAccordionChevron: {
    color: "#DDE6F8",
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "900",
  },
  studioAccordionBody: {
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    padding: 12,
    gap: 9,
  },
  studioActionList: {
    gap: 9,
  },
  studioActionRow: {
    minHeight: 60,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.045)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  studioActionRowMuted: {
    backgroundColor: "rgba(255,255,255,0.035)",
  },
  studioActionRowWarning: {
    borderColor: "rgba(255,183,77,0.24)",
    backgroundColor: "rgba(255,183,77,0.08)",
  },
  studioActionRowCopy: {
    flex: 1,
    gap: 3,
  },
  studioActionRowTitle: {
    color: "#F5F7FF",
    fontSize: 13.5,
    lineHeight: 18,
    fontWeight: "900",
  },
  studioActionRowBody: {
    color: "#AAB5CA",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "700",
  },
  studioActionRowMeta: {
    alignItems: "flex-end",
    justifyContent: "center",
    gap: 6,
  },
  studioActionChevron: {
    color: "#DDE6F8",
    fontSize: 18,
    lineHeight: 20,
    fontWeight: "900",
  },
  accordionInlineBlock: {
    gap: 8,
    marginTop: 2,
  },
  quickActionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  quickActionCard: {
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 138,
    minHeight: 96,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 13,
    justifyContent: "space-between",
    gap: 8,
  },
  quickActionCardDisabled: {
    opacity: 0.58,
  },
  quickActionTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  quickActionBody: {
    color: "#AEB8CE",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "700",
  },
  homeActionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  homeActionCard: {
    flexBasis: "30%",
    flexGrow: 1,
    minWidth: 96,
    minHeight: 64,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.055)",
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: "center",
    gap: 4,
  },
  homeActionCardDisabled: {
    opacity: 0.52,
  },
  homeActionTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  homeActionTitleDisabled: {
    color: "#BBC3D5",
  },
  homeActionBody: {
    color: "#98A4BC",
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "800",
  },
  homeSnapshotGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  homeSnapshotCard: {
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 132,
    minHeight: 82,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.045)",
    paddingHorizontal: 12,
    paddingVertical: 11,
    justifyContent: "center",
    gap: 3,
  },
  homeSnapshotValue: {
    color: "#F3F6FF",
    fontSize: 20,
    fontWeight: "900",
  },
  homeSnapshotLabel: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  homeSnapshotBody: {
    color: "#93A0B8",
    fontSize: 10.5,
    lineHeight: 14,
    fontWeight: "700",
  },
  homeEmptyTaskCard: {
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  homeEmptyTaskText: {
    color: "#AEB8CE",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "700",
  },
  attentionCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.22)",
    backgroundColor: "rgba(220,20,60,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  attentionTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900",
  },
  attentionBody: {
    color: "#F0C2CB",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  latestContentCard: {
    flexDirection: "row",
    alignItems: "stretch",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    overflow: "hidden",
  },
  latestContentThumb: {
    width: 118,
    height: 126,
    backgroundColor: "#080A10",
  },
  latestContentFallback: {
    width: 118,
    height: 126,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(220,20,60,0.16)",
  },
  latestContentFallbackText: {
    color: "#F4C4CC",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 1,
  },
  latestContentBody: {
    flex: 1,
    padding: 12,
    gap: 8,
    justifyContent: "space-between",
  },
  latestContentTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  latestContentTitle: {
    flex: 1,
    color: "#fff",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  latestContentDescription: {
    color: "#AEB8CE",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "600",
  },
  contentStatusChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(45,153,92,0.36)",
    backgroundColor: "rgba(45,153,92,0.16)",
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  contentStatusChipUnavailable: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  contentStatusChipText: {
    color: "#F3F6FF",
    fontSize: 10.5,
    fontWeight: "900",
  },
  roadmapPanel: {
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(10,14,22,0.56)",
    paddingVertical: 11,
  },
  roadmapList: {
    gap: 5,
  },
  roadmapTitle: {
    color: "#B8C2D7",
    fontSize: 13,
    fontWeight: "900",
  },
  roadmapItem: {
    color: "#8F9AB1",
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },
  brandStudioHeroCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(12,16,24,0.9)",
    overflow: "hidden",
  },
  brandStudioHeroMedia: {
    minHeight: 216,
    justifyContent: "flex-end",
    backgroundColor: "#0B1018",
  },
  brandStudioHeroImage: {
    ...StyleSheet.absoluteFillObject,
    width: "100%",
    height: "100%",
  },
  brandStudioHeroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,7,12,0.32)",
  },
  brandStudioHeroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(4,6,12,0.58)",
  },
  brandStudioHeroCopy: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 8,
  },
  brandStudioIdentityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(8,12,18,0.86)",
  },
  brandStudioActions: {
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: "rgba(8,12,18,0.86)",
  },
  brandPreviewCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
    overflow: "hidden",
  },
  brandPreviewMedia: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: "#090D14",
  },
  brandPreviewImage: {
    width: "100%",
    height: "100%",
  },
  brandPreviewFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  brandPreviewFallbackScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(5,7,12,0.62)",
  },
  brandPreviewFallbackText: {
    color: "#F5CAD2",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 1,
  },
  brandSafeAreaFrame: {
    position: "absolute",
    left: 18,
    right: 18,
    top: 18,
    bottom: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.42)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  brandPreviewCopy: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 4,
  },
  brandPreviewTitle: {
    color: "#F3F6FF",
    fontSize: 14,
    fontWeight: "900",
  },
  brandPreviewBody: {
    color: "#AEB8CE",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  brandPreviewMeta: {
    color: "#7F8CA5",
    fontSize: 11,
    fontWeight: "800",
  },
  brandButtonRow: {
    flexDirection: "row",
    gap: 10,
  },
  brandReviewReasonInput: {
    minHeight: 76,
  },
  brandReviewActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  brandReviewButton: {
    minWidth: 96,
    flexGrow: 1,
  },
  brandReviewArchiveButton: {
    borderColor: "rgba(242,194,91,0.34)",
  },
  brandKitGrid: {
    gap: 10,
  },
  brandThemeGrid: {
    gap: 9,
  },
  brandThemeCard: {
    minHeight: 66,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 4,
  },
  brandThemeCardActive: {
    borderColor: "rgba(220,20,60,0.5)",
    backgroundColor: "rgba(220,20,60,0.14)",
  },
  brandThemeTitle: {
    color: "#F3F6FF",
    fontSize: 13,
    fontWeight: "900",
  },
  brandThemeBody: {
    color: "#AEB8CE",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "700",
  },
  brandSwatchChip: {
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  brandSwatchChipActive: {
    borderColor: "rgba(255,255,255,0.42)",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  brandSwatch: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  brandActionRow: {
    gap: 10,
  },
  segmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  segmentButton: {
    minHeight: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  segmentButtonActive: {
    borderColor: "rgba(220,20,60,0.55)",
    backgroundColor: "rgba(220,20,60,0.24)",
  },
  segmentButtonText: {
    color: "#B9C3D9",
    fontSize: 12,
    fontWeight: "900",
  },
  segmentButtonTextActive: {
    color: "#fff",
  },
  heroTruthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 14,
  },
  heroTruthCard: {
    flexBasis: "31%",
    flexGrow: 1,
    minWidth: 118,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 4,
  },
  heroTruthLabel: {
    color: "#F2C5D0",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  heroTruthBody: {
    color: "#D9E0EE",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "700",
  },
  permissionCopy: {
    color: "#93A0B8",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
    marginBottom: 10,
  },
  loadingCard: {
    borderRadius: 16,
    padding: 18,
    backgroundColor: "rgba(14,18,26,0.88)",
    alignItems: "center",
    gap: 10,
  },
  loadingText: {
    color: "#D5DDED",
    fontSize: 13,
    fontWeight: "700",
  },
  disabledCard: {
    borderRadius: 16,
    padding: 18,
    backgroundColor: "rgba(25,18,18,0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  disabledTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  disabledBody: {
    color: "#C4CAD7",
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
  },
  noticeCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(45,153,92,0.45)",
    backgroundColor: "rgba(45,153,92,0.18)",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeText: {
    color: "#F4FFF7",
    fontSize: 12,
    fontWeight: "700",
  },
  sectionMapCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.16)",
    backgroundColor: "rgba(10,14,24,0.9)",
    padding: 16,
    gap: 10,
  },
  sectionMapKicker: {
    color: "#8D98B1",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1.1,
  },
  sectionMapTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
  },
  sectionMapBody: {
    color: "#BBC4D8",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  sectionMapSubheading: {
    color: "#AAB6CD",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginTop: 2,
  },
  sectionMapGroup: {
    gap: 8,
  },
  sectionMapGroupBody: {
    color: "#9FA9BF",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  sectionMapGrid: {
    gap: 10,
  },
  sectionMapItem: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
    gap: 6,
  },
  sectionMapHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  sectionMapItemTitle: {
    color: "#F3F6FF",
    fontSize: 14,
    fontWeight: "900",
    flexShrink: 1,
  },
  sectionMapItemBody: {
    color: "#AFB8CD",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  sectionStatusChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  sectionStatusChipCurrent: {
    borderColor: "rgba(45,153,92,0.4)",
    backgroundColor: "rgba(45,153,92,0.16)",
  },
  sectionStatusChipNearTerm: {
    borderColor: "rgba(115,134,255,0.28)",
    backgroundColor: "rgba(115,134,255,0.14)",
  },
  sectionStatusChipLaterPhase: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  sectionStatusChipText: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  sectionStatusChipTextCurrent: {
    color: "#D9FFE6",
  },
  sectionStatusChipTextNearTerm: {
    color: "#E1E7FF",
  },
  sectionStatusChipTextLaterPhase: {
    color: "#B0BACD",
  },
  panel: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(12,16,24,0.9)",
    padding: 17,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
  },
  dashboardPanel: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(12,16,24,0.84)",
    padding: 15,
  },
  creatorContentPanel: {
    borderColor: "rgba(220,20,60,0.26)",
    backgroundColor: "rgba(30,13,24,0.92)",
  },
  clipStudioPanel: {
    borderColor: "rgba(126,215,255,0.2)",
    backgroundColor: "rgba(10,16,25,0.93)",
  },
  clipPreviewShell: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
    overflow: "hidden",
    marginBottom: 12,
  },
  clipPreviewFrame: {
    width: "100%",
    maxHeight: 420,
    minHeight: 220,
    alignSelf: "center",
    backgroundColor: "#05070D",
    overflow: "hidden",
  },
  clipPreviewMedia: {
    width: "100%",
    height: "100%",
    backgroundColor: "#05070D",
  },
  clipPreviewFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  clipSafeAreaFrame: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 16,
    bottom: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(255,255,255,0.025)",
  },
  clipPreviewCopy: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 4,
    backgroundColor: "rgba(8,12,18,0.86)",
  },
  clipPreviewKicker: {
    color: "#7ED7FF",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  clipTitleOverlay: {
    position: "absolute",
    left: 18,
    right: 18,
    bottom: 22,
    borderRadius: 14,
    backgroundColor: "rgba(5,7,12,0.58)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 3,
  },
  clipTitleOverlayTop: {
    top: 22,
    bottom: undefined,
  },
  clipTitleOverlayCenter: {
    top: "42%",
    bottom: undefined,
  },
  clipTitleOverlayBold: {
    backgroundColor: "rgba(220,20,60,0.58)",
  },
  clipTitleOverlaySpotlight: {
    backgroundColor: "rgba(8,12,18,0.72)",
    borderWidth: 1,
    borderColor: "rgba(242,194,91,0.38)",
  },
  clipTitleOverlayTrailer: {
    backgroundColor: "rgba(3,4,8,0.78)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
    paddingVertical: 14,
  },
  clipTitleOverlayText: {
    color: "#FFFFFF",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "900",
  },
  clipTitleOverlaySubtitle: {
    color: "#DDE5F5",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  clipBrandMarkPreview: {
    position: "absolute",
    right: 18,
    top: 18,
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(8,12,18,0.72)",
  },
  clipCoverPreview: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: 14,
    backgroundColor: "#080A10",
  },
  inputMeta: {
    color: "#8490A6",
    fontSize: 10.5,
    fontWeight: "800",
    textAlign: "right",
    marginTop: -6,
    marginBottom: 4,
  },
  panelSubtle: {
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(10,14,22,0.74)",
  },
  panelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 12,
  },
  panelHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  panelTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },
  panelSubtitle: {
    color: "#B9C2D5",
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: "600",
  },
  panelStatus: {
    color: "#D6FFE4",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  panelStatusMuted: {
    color: "#97A4BE",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0.9,
  },
  sectionLabel: {
    color: "#AAB6CD",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.6,
    marginTop: 4,
    marginBottom: 8,
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
  },
  textArea: {
    minHeight: 86,
    textAlignVertical: "top",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  chipActive: {
    borderColor: "#DC143C",
    backgroundColor: "rgba(220,20,60,0.22)",
  },
  chipDisabled: {
    opacity: 0.42,
  },
  chipText: {
    color: "#DADFEA",
    fontSize: 11,
    fontWeight: "700",
  },
  chipTextActive: {
    color: "#fff",
  },
  legalAcknowledgementRow: {
    alignItems: "flex-start",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.045)",
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
    padding: 12,
  },
  legalAcknowledgementRowActive: {
    borderColor: "rgba(220,20,60,0.55)",
    backgroundColor: "rgba(220,20,60,0.12)",
  },
  legalCheckbox: {
    alignItems: "center",
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    height: 24,
    justifyContent: "center",
    marginTop: 2,
    width: 24,
  },
  legalCheckboxActive: {
    backgroundColor: "#DC143C",
    borderColor: "#FF8AA0",
  },
  legalCheckboxMark: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 18,
  },
  legalAcknowledgementText: {
    color: "#DDE5F5",
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  previewChipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  previewChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.2)",
    backgroundColor: "rgba(115,134,255,0.1)",
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  previewChipText: {
    color: "#E1E7FF",
    fontSize: 11,
    fontWeight: "700",
  },
  accessSummaryCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.18)",
    backgroundColor: "rgba(17,24,40,0.82)",
    padding: 14,
    gap: 8,
  },
  accessSummaryKicker: {
    color: "#8D97AD",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 1,
  },
  accessSummaryTitle: {
    color: "#F4F7FF",
    fontSize: 18,
    fontWeight: "900",
  },
  accessSummaryBody: {
    color: "#B8C0D4",
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: "600",
  },
  accessSummaryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  accessSummaryDetailCard: {
    flexBasis: "31%",
    flexGrow: 1,
    minWidth: 96,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 4,
  },
  accessSummaryDetailLabel: {
    color: "#8590A6",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  accessSummaryDetailValue: {
    color: "#F3F6FF",
    fontSize: 15,
    fontWeight: "900",
  },
  accessSummaryDetailBody: {
    color: "#ACB5C9",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "600",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  summaryCard: {
    flexBasis: "31%",
    flexGrow: 1,
    minWidth: 110,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 4,
  },
  summaryCardUnavailable: {
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.03)",
  },
  summaryLabel: {
    color: "#8590A6",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  summaryValue: {
    color: "#F3F6FF",
    fontSize: 15,
    fontWeight: "900",
  },
  summaryBody: {
    color: "#ACB5C9",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "600",
  },
  audienceWorkflowLimitCard: {
    marginTop: 12,
  },
  eventSnapshotCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.22)",
    backgroundColor: "rgba(31,15,22,0.84)",
    padding: 14,
    marginTop: 10,
    marginBottom: 12,
    gap: 8,
  },
  eventList: {
    gap: 10,
    marginBottom: 10,
  },
  eventCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  eventCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  eventCardCopy: {
    flex: 1,
    gap: 4,
  },
  eventCardTitle: {
    color: "#F3F6FF",
    fontSize: 15,
    fontWeight: "900",
  },
  eventCardMeta: {
    color: "#98A5C0",
    fontSize: 11.5,
    fontWeight: "800",
  },
  eventCardBody: {
    color: "#B8C0D4",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  eventActionButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.24)",
    backgroundColor: "rgba(115,134,255,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  eventActionButtonText: {
    color: "#E1E7FF",
    fontSize: 11.5,
    fontWeight: "800",
  },
  moneyAuditBadgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  moneyAuditBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  moneyAuditBadgeText: {
    color: "#DCE5F5",
    fontSize: 10.5,
    fontWeight: "900",
  },
  moneyAuditDetailRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.035)",
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 3,
  },
  moneyAuditDetailLabel: {
    color: "#8590A6",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  moneyAuditDetailValue: {
    color: "#F3F6FF",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  eventEmptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    gap: 4,
  },
  eventEmptyTitle: {
    color: "#F3F6FF",
    fontSize: 14,
    fontWeight: "900",
  },
  eventEmptyBody: {
    color: "#ACB5C9",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  eventActionRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  eventPrimaryButton: {
    flex: 1,
    borderRadius: 14,
    backgroundColor: "#DC143C",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  eventPrimaryButtonDisabled: {
    backgroundColor: "rgba(220,20,60,0.38)",
  },
  eventPrimaryButtonBusyRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  eventPrimaryButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
  eventSecondaryButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  eventSecondaryButtonText: {
    color: "#D9E0EE",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.62)",
  },
  modalSheet: {
    maxHeight: "90%",
    backgroundColor: "#0B0E15",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    paddingTop: 14,
    paddingHorizontal: 14,
  },
  modalHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 10,
  },
  modalTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  modalSubtitle: {
    color: "#9AA8C0",
    fontSize: 12,
    fontWeight: "700",
    marginTop: 2,
  },
  closeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  closeText: {
    color: "#E6EAF3",
    fontSize: 11,
    fontWeight: "900",
  },
  uploadLifecycleInline: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.035)",
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 7,
    marginBottom: 8,
  },
  uploadLifecycleInlineReady: {
    borderColor: "rgba(115,134,255,0.24)",
    backgroundColor: "rgba(115,134,255,0.08)",
  },
  uploadLifecycleInlineActive: {
    borderColor: "rgba(242,194,91,0.3)",
    backgroundColor: "rgba(242,194,91,0.08)",
  },
  uploadLifecycleInlineSuccess: {
    borderColor: "rgba(45,153,92,0.32)",
    backgroundColor: "rgba(45,153,92,0.1)",
  },
  uploadLifecycleInlineError: {
    borderColor: "rgba(255,116,116,0.3)",
    backgroundColor: "rgba(255,116,116,0.08)",
  },
  uploadLifecycleHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  uploadLifecycleLabel: {
    color: "#8793AA",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  uploadLifecycleStatus: {
    color: "#DDE5F5",
    fontSize: 11.5,
    fontWeight: "900",
    textAlign: "right",
    flexShrink: 1,
  },
  uploadLifecycleStatusReady: {
    color: "#E1E7FF",
  },
  uploadLifecycleStatusActive: {
    color: "#FFE8B7",
  },
  uploadLifecycleStatusSuccess: {
    color: "#D9FFE6",
  },
  uploadLifecycleStatusError: {
    color: "#FFD4D4",
  },
  uploadLifecycleBody: {
    color: "#B7C1D6",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  videoSelectedFileText: {
    color: "#ACB5C9",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  videoRequirementText: {
    color: "#F4B4C0",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  saveButton: {
    borderRadius: 14,
    backgroundColor: "#DC143C",
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
  },
});
