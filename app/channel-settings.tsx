import { useLocalSearchParams, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { ResizeMode, Video } from "expo-av";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  Linking,
  Modal,
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
  resolveChannelAccess,
  type ChannelAccessResolution,
} from "../_lib/accessEntitlements";
import {
  DEFAULT_APP_CONFIG,
  readAppConfig,
  resolveBrandingConfig,
  resolveFeatureConfig,
} from "../_lib/appConfig";
import { trackEvent } from "../_lib/analytics";
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
  previewCreatorPayoutPreproductionWorkflow,
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
import { CREATOR_MONEY_ROUTE_TARGETS } from "../_lib/creatorMonetizationRouteTargets";
import {
  listMyCreatorSandboxMonetizationConfigs,
  saveCreatorSandboxMonetizationConfig,
  type CreatorMonetizationConfig,
  type CreatorMonetizationSetupSourceType,
} from "../_lib/creatorMonetizationSetup";
import {
  listMyPaidVideoOffers,
  listMyPaidVideoTransactions,
  savePaidVideoOffer,
  type CreatorPaidVideoOffer,
  type CreatorPaidVideoTransaction,
} from "../_lib/creatorPaidVideos";
import {
  listMyPaidWatchPartyOffers,
  listMyPaidWatchPartyTransactions,
  savePaidWatchPartyOffer,
  type PaidWatchPartyOffer,
  type PaidWatchPartyTransaction,
} from "../_lib/paidWatchPartyTickets";
import {
  listMyPaidCreatorEventOffers,
  listMyPaidCreatorEventTransactions,
  savePaidCreatorEventOffer,
  type PaidCreatorEventOffer,
  type PaidCreatorEventTransaction,
} from "../_lib/paidCreatorEvents";
import {
  formatCreatorVipPassPrice,
  listMyCreatorVipPassOffers,
  listMyCreatorVipTransactions,
  saveCreatorVipPassOffer,
  setCreatorVideoVipAccess,
  type CreatorVipPassOffer,
  type CreatorVipTransaction,
} from "../_lib/creatorVipPasses";
import {
  formatChannelSubscriptionPrice,
  getChannelSubscriptionReadbackStatus,
  listMyChannelSubscriptionOffers,
  listMyChannelSubscriptionTransactions,
  saveChannelSubscriptionOffer,
  type ChannelSubscriptionOffer,
  type ChannelSubscriptionTransaction,
} from "../_lib/channelSubscriptions";
import {
  listMyCreatorTipTransactions,
  readMyCreatorTipSettings,
  saveMyCreatorTipSettings,
  type CreatorTipSettings,
  type CreatorTipTransaction,
} from "../_lib/creatorTips";
import {
  listSandboxMonetizationTesters,
  resolveSandboxMonetizationTester,
  type SandboxMonetizationTesterRow,
} from "../_lib/sandboxMonetizationTesters";
import {
  CREATOR_MONETIZATION_FEATURE_CATALOG,
  type MonetizationFeatureAction,
  type MonetizationFeatureCatalogItem,
  type MonetizationFeatureKey,
  type MonetizationFeatureStatus,
} from "../_lib/creatorMonetizationFeatures";
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
import { isMoneyCenterSectionBodyVisible } from "../_lib/moneyCenterSectionVisibility";
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
  ACCESS_VISIBILITY_OPTIONS,
  getAccessVisibilityLabel,
  normalizeAccessVisibility,
  type AccessVisibility,
} from "../_lib/accessVisibility";
import {
  readCurrentUserEntitlement,
  type PremiumEntitlementDecision,
} from "../_lib/premiumEntitlements";
import {
  approveChannelAudienceRequest,
  blockChannelAudienceMember,
  declineChannelAudienceRequest,
  getChannelSubscriberRelationshipActionSupport,
  readChannelAudienceMembers,
  removeChannelFollower,
  unblockChannelAudienceMember,
  type ChannelAudienceActionResult,
  type ChannelAudienceActionStatus,
  type ChannelAudienceMemberSummary,
} from "../_lib/channelAudience";
import { useSession } from "../_lib/session";
import { ProfileMediaImage as Image } from "../components/ui/ProfileMediaImage";
import {
  getCachedMonetizationSnapshot,
  readCreatorPermissions,
  readMonetizationSnapshot,
  sanitizeCreatorRoomAccessRule,
  subscribeToMonetizationSnapshot,
  type CreatorPermissionSet,
} from "../_lib/monetization";
import {
  hasPlatformRoleMembership,
  hasPlatformStaffPermission,
  readMyPlatformRoleMemberships,
  type PlatformRoleMembership,
} from "../_lib/moderation";
import { LIVE_REPLAY_ACKNOWLEDGEMENT } from "../_lib/legalPolicies";
import { getUserFacingErrorMessage } from "../_lib/userFacingErrors";
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
  CREATOR_VIDEO_MAX_RUNTIME_LABEL,
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
  buildCreatorVideoDeepLink,
  isCreatorVideoPubliclyShareable,
} from "../_lib/creatorVideoLinks";
import {
  formatCreatorReplaySourceLabel,
  formatCreatorReplayStatusLabel,
  formatCreatorReplayVisibilityLabel,
  readCreatorReplayLibraryItems,
  updateCreatorReplayLibraryItem,
  type CreatorReplayLibraryItem,
  type CreatorReplayVisibility,
} from "../_lib/creatorReplays";
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
  formatPlatformBrandScanStatus,
  getPlatformBrandAssetValidationMessage,
  normalizePlatformBrandFitMode,
  normalizePlatformBrandThemePreset,
  publishPlatformBrandProfile,
  readPlatformBrandStudio,
  resolveBrandPublishReadbackStatus,
  removePlatformBrandAsset,
  savePlatformBrandProfileDraft,
  uploadPlatformBrandAsset,
  type PlatformBrandAsset,
  type PlatformBrandAssetFile,
  type PlatformBrandAssetType,
  type PlatformBrandFitMode,
  type PlatformBrandPublishReadbackStatus,
  type PlatformBrandingBundle,
  type PlatformBrandProfile,
  type PlatformBrandThemePreset,
} from "../_lib/platformBranding";
import {
  readCreatorEventReminderSummaries,
  type CreatorEventReminderSummary,
} from "../_lib/notifications";
import type { UserChannelRole, UserProfile } from "../_lib/userData";
import { normalizeUserProfile, readUserProfile, saveUserProfile, updateMyPlatformAccessVisibility } from "../_lib/userData";
import { CreatorVideoCard } from "../components/creator-media/creator-video-card";
import { CreatorContentActionSheet, type CreatorContentActionSheetVisibilityAction } from "../components/creator-media/CreatorContentActionSheet";
import { MoneyScopeInfoButton, type MoneyScopeKey } from "../components/monetization/MoneyScopeInfoButton";
import { NotificationBellButton } from "../components/notifications/notification-bell-button";
import { BetaAccessScreen } from "../components/system/beta-access-screen";
import { AppActionButton, AppEmptyState, AppStickyActionBar } from "../components/ui/app-surface";

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

type SandboxTesterOfferKey =
  | "tips"
  | "paid_video"
  | "watch_party_ticket"
  | "event_pass"
  | "channel_subscription"
  | "vip_pass";

type SandboxTesterOfferCard = {
  key: SandboxTesterOfferKey;
  title: string;
  configured: boolean;
  blocker?: string;
  description: string;
  scopeKey: MoneyScopeKey;
  testID: string;
  statusLabel: string;
  actionLabel?: string;
  actionTestID?: string;
  onPress?: () => void;
};

type SandboxSetupLifecycle = "idle" | "setting_up" | "complete" | "partial" | "failed" | "timed_out";

type StudioTabId = "home" | "content" | "clip" | "live" | "audience" | "monetization" | "moderation" | "insights" | "brand";
type ContentStatusFilter = "all" | "uploads" | "replays" | "published" | "circle" | "drafts" | "paid" | "events" | "processing" | "needs_attention";
type ContentSortId = "newest" | "oldest";
type CreatorAnalyticsMetricKey = keyof CreatorAnalyticsReadModel["dataStatus"];
type VideoLifecycleState = "idle" | "file_selected" | "uploading" | "succeeded" | "failed";
type CreatorVideoSourceTarget = "legacy_video" | "clip_video";
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
  | "ways_to_earn"
  | "offers"
  | "transactions"
  | "payouts"
  | "tax_legal"
  | "providers"
  | "testing_proof";
type MoneyCenterFocusSection = "overview" | "ways_to_earn" | "transactions" | "payouts";
type MoneyTransactionFilter = "all" | "tips" | "videos" | "rooms" | "subscriptions" | "vip" | "events" | "merch";
type BrandStudioSectionId = "hero" | "background" | "brandKit" | "theme" | "scenePresets" | "preview" | "defaults";
type ClipStudioSectionId = "media" | "cover" | "title" | "templates" | "format" | "brand" | "save" | "advanced";

const LAUNCH_CRITICAL_HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const;
const SANDBOX_SETUP_TIMEOUT_MS = 30000;
const SANDBOX_SETUP_TIMEOUT_ERROR = "sandbox_setup_timed_out";

const getBrandSectionTestId = (id: BrandStudioSectionId) => {
  if (id === "hero") return "brand-hero-media-section";
  if (id === "background") return "brand-background-section";
  if (id === "brandKit") return "brand-avatar-logo-section";
  return undefined;
};

const getBrandSectionAccessibilityLabel = (id: BrandStudioSectionId, title: string, summary: string) => {
  if (id === "hero") return "Open Hero Media";
  if (id === "background") return "Open Brand Studio Background";
  if (id === "brandKit") return "Open Brand Studio Avatar and Logo";
  return `${title}. ${summary}`;
};

const getProfilePublishSnapshot = (profile: UserProfile | null | undefined) => {
  const normalized = normalizeUserProfile(profile ?? {});
  return JSON.stringify({
    displayName: normalized.displayName ?? "",
    tagline: normalized.tagline ?? "",
    channelLayoutPreset: normalized.channelLayoutPreset ?? "spotlight",
  });
};

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
  visibility: CreatorVideoVisibility;
  accessMode: "free" | "paid";
  priceDollars: string;
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
  visibility: "draft",
  accessMode: "free",
  priceDollars: "0.99",
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

const getFileNameFromUri = (uri?: string | null, fallback = "video") => {
  const normalized = String(uri ?? "").split("?")[0]?.split("#")[0] ?? "";
  const rawName = decodeURIComponent(normalized.split("/").filter(Boolean).pop() ?? "").trim();
  return rawName || fallback;
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
    return "The video could not be saved right now. Try again in a moment.";
  }
  if (message.includes("file") || message.includes("mime") || message.includes("unsupported")) {
    return "Choose an MP4, MOV, WebM, or M4V video file.";
  }

  return fallback;
};

const formatChannelRoomAccessValue = (value?: ChannelAccessResolution["watchPartyAccessRule"] | null) => {
  if (value === "party_pass") return "Seat Pass";
  if (value === "premium") return "Premium";
  return "Public";
};

const formatRoomDefaultAccessLabel = (value: "open" | "party_pass" | "premium") => {
  if (value === "party_pass") return "Seat Pass";
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

const parseDollarInputToCents = (value: string) => {
  const normalized = String(value ?? "").replace(/[^0-9.]/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.round(parsed * 100));
};

const formatCentsAsDollarInput = (value: number) => (
  (Math.max(0, Math.trunc(value || 0)) / 100).toFixed(2)
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
  if (asset.scanStatus === "malware_detected" || asset.scanStatus === "scan_failed" || asset.scanStatus === "quarantined") {
    return "Blocked by safety checks and will not appear publicly.";
  }
  if (asset.scanStatus === "pending_scan" || asset.scanStatus === "scanning") {
    return "Saved as draft while safety checks run.";
  }
  if (asset.assetState === "published" && ["clean", "reported"].includes(asset.moderationStatus)) {
    return "Published on the public Platform.";
  }
  if (asset.assetState === "draft" && ["clean", "reported"].includes(asset.moderationStatus)) {
    return "Approved. Publish changes to show it on the public Platform.";
  }
  if (asset.moderationStatus === "pending_review") {
    return "Saved as draft. Publish Changes applies eligible safe media to the public Platform.";
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

const getCreatorFacingPayoutSetupBody = (summary: CreatorPayoutDashboardReadModel) => {
  switch (summary.setupStatus) {
    case "provider_not_configured":
      return "Payout readiness/status flow is active. Provider setup is not configured, and payouts remain off.";
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
  if (status === "near_term") return "STATUS PATH";
  return "LATER STATUS";
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
    missingBody: "Creator-facing content insight status opens here once the backed aggregate exists.",
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
  { id: "live", label: "Live" },
  { id: "audience", label: "Audience" },
  { id: "moderation", label: "Moderation" },
  { id: "insights", label: "Insights" },
  { id: "monetization", label: "Monetization" },
  { id: "brand", label: "Brand" },
];

const CONTENT_STATUS_FILTERS: readonly { id: ContentStatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "uploads", label: "Uploads" },
  { id: "replays", label: "Replays" },
  { id: "drafts", label: "Drafts" },
  { id: "circle", label: "Chi'lly Circle" },
  { id: "published", label: "Public" },
  { id: "paid", label: "Paid" },
  { id: "events", label: "Events" },
  { id: "processing", label: "Processing" },
  { id: "needs_attention", label: "Needs Attention" },
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
  { id: "studio_red", label: "Studio Red", body: "Stronger Chi'llywood accent for launches." },
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

const getBrandPreviewResizeMode = (
  fitMode?: PlatformBrandFitMode | null,
): "cover" | "contain" | "center" => {
  if (fitMode === "fit") return "contain";
  if (fitMode === "center") return "center";
  return "cover";
};

const getBrandPreviewOverlayColor = (strength?: number | null) => {
  const numericStrength = Number(strength);
  const alpha = Number.isFinite(numericStrength)
    ? Math.max(0.24, Math.min(0.82, numericStrength))
    : 0.62;
  return `rgba(4,7,13,${alpha})`;
};

const getBrandPreviewBlurRadius = (strength?: number | null) => {
  const numericStrength = Number(strength);
  if (!Number.isFinite(numericStrength) || numericStrength <= 0) return 0;
  if (numericStrength >= 0.7) return 8;
  return 4;
};

const createInitialBrandSections = (
  tab: unknown,
  focus: unknown,
): ReadonlySet<BrandStudioSectionId> => {
  const normalized = String(Array.isArray(focus) ? focus[0] : focus ?? "").trim().toLowerCase();
  if (String(Array.isArray(tab) ? tab[0] : tab ?? "").trim().toLowerCase() !== "brand" && !normalized) {
    return new Set<BrandStudioSectionId>();
  }
  if (normalized === "hero") return new Set<BrandStudioSectionId>(["hero"]);
  if (normalized === "background") return new Set<BrandStudioSectionId>(["background"]);
  if (normalized === "brandkit" || normalized === "brand-kit" || normalized === "avatar" || normalized === "logo") {
    return new Set<BrandStudioSectionId>(["brandKit"]);
  }
  if (normalized === "theme") return new Set<BrandStudioSectionId>(["theme"]);
  if (normalized === "preview") return new Set<BrandStudioSectionId>(["preview"]);
  return new Set<BrandStudioSectionId>();
};

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
  ) return "offers";
  if (
    normalized === "ways"
    || normalized === "ways-to-earn"
    || normalized === "ways_to_earn"
    || normalized === "earn"
    || normalized === "earning"
    || normalized === "earnings"
    || normalized === "features"
  ) return "ways_to_earn";
  if (
    normalized === "offer"
    || normalized === "offers"
    || normalized === "digital_sales"
    || normalized === "digital-sales"
    || normalized === "sales"
    || normalized === "product"
    || normalized === "products"
  ) return "offers";
  if (
    normalized === "transaction"
    || normalized === "transactions"
    || normalized === "history"
    || normalized === "activity"
    || normalized === "ledger"
  ) return "transactions";
  if (normalized === "tips" || normalized === "tip") return "ways_to_earn";
  if (
    normalized === "watch-party-seats"
    || normalized === "watch_party_seats"
    || normalized === "watch-party-seat"
    || normalized === "watch_party_seat"
    || normalized === "seats"
    || normalized === "seat"
  ) return "offers";
  if (
    normalized === "paid-content"
    || normalized === "paid_content"
    || normalized === "paid"
    || normalized === "content-sales"
    || normalized === "content_sales"
  ) return "offers";
  if (
    normalized === "merch"
    || normalized === "merchandise"
    || normalized === "commerce"
    || normalized === "platform-commerce"
    || normalized === "platform_commerce"
  ) return "offers";
  if (
    normalized === "revenue"
    || normalized === "earnings"
    || normalized === "balance"
    || normalized === "balances"
    || normalized === "creator-balance"
    || normalized === "creator_balance"
  ) return "overview";
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
  if (normalized === "future" || normalized === "tools" || normalized === "technical" || normalized === "checks") return "providers";
  if (
    normalized === "testing"
    || normalized === "testing-proof"
    || normalized === "testing_proof"
    || normalized === "advanced"
    || normalized === "advanced-testing"
    || normalized === "advanced_testing"
    || normalized === "sandbox"
    || normalized === "proof"
  ) return "testing_proof";
  return null;
};

const normalizeMoneyManageTarget = (value: unknown): MonetizationFeatureKey | null => {
  const normalized = String(Array.isArray(value) ? value[0] : value ?? "").trim().toLowerCase();
  if (normalized === "tips" || normalized === "tip") return "tips";
  if (normalized === "paid_videos" || normalized === "paid-video" || normalized === "paid_video") return "paid_videos";
  if (
    normalized === "paid_watch_parties"
    || normalized === "paid-watch-parties"
    || normalized === "watch_party_ticket"
    || normalized === "watch-party-ticket"
    || normalized === "watch_party_tickets"
    || normalized === "watch-party-tickets"
  ) return "paid_watch_parties";
  if (
    normalized === "channel_subscriptions"
    || normalized === "channel-subscriptions"
    || normalized === "channel_subscription"
    || normalized === "channel-subscription"
    || normalized === "platform_subscription"
    || normalized === "platform-subscription"
  ) return "channel_subscriptions";
  if (normalized === "vip_passes" || normalized === "vip-passes" || normalized === "vip_pass" || normalized === "vip-pass") return "vip_passes";
  if (normalized === "paid_events" || normalized === "paid-events" || normalized === "event_pass" || normalized === "event-pass") return "paid_events";
  return null;
};

const formatWatchPartySeatPassDisplayTitle = (value?: string | null) => {
  const title = typeof value === "string" ? value.trim() : "";
  const displayTitle = title.length ? title : "Sandbox Watch-Party Seat Pass";
  return displayTitle
    .replace(/\bWatch-Party\s+Ticket\b/gi, "Watch-Party Seat Pass")
    .replace(/\bWatch Party\s+Ticket\b/gi, "Watch-Party Seat Pass")
    .replace(/\bParty\s+Ticket\b/gi, "Party Seat Pass")
    .replace(/\bRoom\s+Ticket\b/gi, "Room Seat Pass")
    .replace(/\bTicket\b/gi, "Seat Pass");
};

const createInitialMonetizationSections = (tab: unknown, focus: unknown) => {
  const sections = new Set<MonetizationSectionId>(["overview", "ways_to_earn"]);
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
      body: "Updating title, description, thumbnail, or visibility.",
      tone: "active" as const,
    };
  }

  if (input.saving) {
    return {
      label: "Uploading...",
      body: "Saving the selected file to your Platform library.",
      tone: "active" as const,
    };
  }

  if (input.editingVideoId) {
    return {
      label: "Editing Metadata",
      body: "Existing media stays in place. This edits details and visibility only.",
      tone: "ready" as const,
    };
  }

  if (input.lifecycleState === "succeeded") {
    return {
      label: "Upload Succeeded",
      body: "The video was saved and added to your Platform library.",
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

const createInitialMoneyManageTarget = (manage: unknown): MonetizationFeatureKey | null => (
  normalizeMoneyManageTarget(manage)
);

export function ChannelStudioScreen() {
  const router = useRouter();
  const safeAreaInsets = useSafeAreaInsets();
  const routeParams = useLocalSearchParams<{
    tab?: string;
    focus?: string;
    action?: string;
    manage?: string;
    sourceVideoId?: string;
    eventTitle?: string;
    description?: string;
    thumbnail?: string;
    suggestedEventType?: string;
    spotlightVideoId?: string;
  }>();
  const { isLoading: authLoading, isSignedIn, user } = useSession();
  const { accessState, isLoading: betaLoading, isActive } = useBetaProgram();
  const routeAction = String(Array.isArray(routeParams.action) ? routeParams.action[0] : routeParams.action ?? "").trim();
  const initialStudioTab = normalizeStudioTabId(routeParams.tab)
    ?? normalizeStudioTabId(routeParams.focus)
    ?? (routeAction === "clip" || routeAction === "create-clip" ? "clip" : null)
    ?? (routeAction === "upload" ? "content" : null)
    ?? "home";
  const studioContentContainerStyle = useMemo(
    () => [styles.content, { paddingTop: Math.max(54, safeAreaInsets.top + 18) }],
    [safeAreaInsets.top],
  );
  const [activeStudioTab, setActiveStudioTab] = useState<StudioTabId>(initialStudioTab);
  const [expandedHomeSections, setExpandedHomeSections] = useState<ReadonlySet<StudioHomeSectionId>>(
    () => new Set<StudioHomeSectionId>(["create"]),
  );
  const [expandedMonetizationSections, setExpandedMonetizationSections] = useState<ReadonlySet<MonetizationSectionId>>(
    () => createInitialMonetizationSections(routeParams.tab, routeParams.focus),
  );
  const [activeMoneyManageTarget, setActiveMoneyManageTarget] = useState<MonetizationFeatureKey | null>(
    () => createInitialMoneyManageTarget(routeParams.manage),
  );
  const [moneyManageNotice, setMoneyManageNotice] = useState<string | null>(null);
  const [activeBrandSheetSection, setActiveBrandSheetSection] = useState<BrandStudioSectionId | null>(
    () => Array.from(createInitialBrandSections(routeParams.tab, routeParams.focus))[0] ?? null,
  );
  const [expandedClipSections, setExpandedClipSections] = useState<ReadonlySet<ClipStudioSectionId>>(
    () => new Set<ClipStudioSectionId>(["media", "title", "save"]),
  );
  const [contentStatusFilter, setContentStatusFilter] = useState<ContentStatusFilter>("all");
  const [contentSearchQuery, setContentSearchQuery] = useState("");
  const [contentSort, setContentSort] = useState<ContentSortId>("newest");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [platformVisibilitySaving, setPlatformVisibilitySaving] = useState<AccessVisibility | null>(null);
  const [platformVisibilityNotice, setPlatformVisibilityNotice] = useState<string | null>(null);
  const savedProfilePublishSnapshotRef = useRef<string | null>(null);
  const [platformBranding, setPlatformBranding] = useState<PlatformBrandingBundle | null>(null);
  const [brandDraft, setBrandDraft] = useState<PlatformBrandProfile | null>(null);
  const [brandLoading, setBrandLoading] = useState(false);
  const [brandSaving, setBrandSaving] = useState(false);
  const [brandNotice, setBrandNotice] = useState<string | null>(null);
  const [brandBusyAssetType, setBrandBusyAssetType] = useState<PlatformBrandAssetType | null>(null);
  const [brandPreviewFailedAssetIds, setBrandPreviewFailedAssetIds] = useState<ReadonlySet<string>>(() => new Set());
  const [platformRoleMemberships, setPlatformRoleMemberships] = useState<PlatformRoleMembership[]>([]);
  const [premiumEntitlement, setPremiumEntitlement] = useState<PremiumEntitlementDecision | null>(null);
  const [premiumSnapshotActive, setPremiumSnapshotActive] = useState(
    () => getCachedMonetizationSnapshot().targets.premium_subscription.hasEntitlement,
  );
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
  const [moneyTransactionFilter, setMoneyTransactionFilter] = useState<MoneyTransactionFilter>("all");
  const [creatorTipSettings, setCreatorTipSettings] = useState<CreatorTipSettings | null>(null);
  const [creatorTipTransactions, setCreatorTipTransactions] = useState<CreatorTipTransaction[]>([]);
  const [creatorPaidVideoOffers, setCreatorPaidVideoOffers] = useState<CreatorPaidVideoOffer[]>([]);
  const [creatorPaidVideoTransactions, setCreatorPaidVideoTransactions] = useState<CreatorPaidVideoTransaction[]>([]);
  const [creatorPaidWatchPartyOffers, setCreatorPaidWatchPartyOffers] = useState<PaidWatchPartyOffer[]>([]);
  const [creatorPaidWatchPartyTransactions, setCreatorPaidWatchPartyTransactions] = useState<PaidWatchPartyTransaction[]>([]);
  const [creatorPaidEventOffers, setCreatorPaidEventOffers] = useState<PaidCreatorEventOffer[]>([]);
  const [creatorPaidEventTransactions, setCreatorPaidEventTransactions] = useState<PaidCreatorEventTransaction[]>([]);
  const [creatorVipPassOffers, setCreatorVipPassOffers] = useState<CreatorVipPassOffer[]>([]);
  const [creatorVipTransactions, setCreatorVipTransactions] = useState<CreatorVipTransaction[]>([]);
  const [vipPassSaving, setVipPassSaving] = useState(false);
  const [vipPassNotice, setVipPassNotice] = useState<string | null>(null);
  const [creatorChannelSubscriptionOffers, setCreatorChannelSubscriptionOffers] = useState<ChannelSubscriptionOffer[]>([]);
  const [creatorChannelSubscriptionTransactions, setCreatorChannelSubscriptionTransactions] = useState<ChannelSubscriptionTransaction[]>([]);
  const [channelSubscriptionSaving, setChannelSubscriptionSaving] = useState(false);
  const [channelSubscriptionNotice, setChannelSubscriptionNotice] = useState<string | null>(null);
  const [creatorSandboxConfigs, setCreatorSandboxConfigs] = useState<CreatorMonetizationConfig[]>([]);
  const [watchPartySetupSavingId, setWatchPartySetupSavingId] = useState<string | null>(null);
  const [sandboxTesterActive, setSandboxTesterActive] = useState(false);
  const [sandboxTesterRows, setSandboxTesterRows] = useState<SandboxMonetizationTesterRow[]>([]);
  const [sandboxSetupBusy, setSandboxSetupBusy] = useState(false);
  const [sandboxSetupState, setSandboxSetupState] = useState<SandboxSetupLifecycle>("idle");
  const [sandboxSetupNotice, setSandboxSetupNotice] = useState<string | null>(null);
  const [paidEventSavingId, setPaidEventSavingId] = useState<string | null>(null);
  const [tipSettingsBusy, setTipSettingsBusy] = useState(false);
  const [tipSettingsNotice, setTipSettingsNotice] = useState<string | null>(null);
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
  const [creatorReplays, setCreatorReplays] = useState<CreatorReplayLibraryItem[]>([]);
  const [creatorVideoClipEdits, setCreatorVideoClipEdits] = useState<Record<string, ClipStudioEdit>>({});
  const [creatorReminderSummaries, setCreatorReminderSummaries] = useState<CreatorEventReminderSummary[]>([]);
  const [audienceMembers, setAudienceMembers] = useState<ChannelAudienceMemberSummary[]>([]);
  const [audienceMembersLoading, setAudienceMembersLoading] = useState(false);
  const [audienceActionNotice, setAudienceActionNotice] = useState<string | null>(null);
  const [audienceActionResult, setAudienceActionResult] = useState<ChannelAudienceActionResult | null>(null);
  const [audienceActionLoading, setAudienceActionLoading] = useState<ChannelAudienceActionResult["action"] | null>(null);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [eventSaving, setEventSaving] = useState(false);
  const [eventNotice, setEventNotice] = useState<string | null>(null);
  const [eventEditor, setEventEditor] = useState<ChannelEventEditorState>(createEmptyEventEditorState);
  const [videosLoading, setVideosLoading] = useState(false);
  const [videosLoadError, setVideosLoadError] = useState<string | null>(null);
  const [videoSaving, setVideoSaving] = useState(false);
  const [videoNotice, setVideoNotice] = useState<string | null>(null);
  const [selectedContentActionVideo, setSelectedContentActionVideo] = useState<CreatorVideo | null>(null);
  const [videoEditor, setVideoEditor] = useState<ChannelVideoEditorState>(createEmptyVideoEditorState);
  const [selectedVideoFile, setSelectedVideoFile] = useState<CreatorVideoFile | null>(null);
  const [uploadSourceTarget, setUploadSourceTarget] = useState<CreatorVideoSourceTarget | null>(null);
  const [clipNotice, setClipNotice] = useState<string | null>(null);
  const [clipSaving, setClipSaving] = useState(false);
  const clipSaveInFlightRef = useRef(false);
  const brandProfileSaveInFlightRef = useRef(false);
  const sourceVideoEventPrefillRef = useRef<string | null>(null);
  const spotlightRouteAppliedRef = useRef<string | null>(null);
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
  const hasOwnerOperatorStudioAccess = useMemo(
    () => hasPlatformRoleMembership(platformRoleMemberships, ["owner", "operator"]),
    [platformRoleMemberships],
  );
  const hasPremiumCreatorToolAccess =
    premiumEntitlement?.isActive === true || premiumSnapshotActive || hasOwnerOperatorStudioAccess;
  const storeProviderName = Platform.OS === "ios" ? "App Store" : "Google Play";
  const storeProviderPair = `${storeProviderName} / RevenueCat`;
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
    options?: { filter?: ContentStatusFilter; focus?: string; manage?: MonetizationFeatureKey },
  ) => {
    setActiveStudioTab(tab);
    if (options?.filter) setContentStatusFilter(options.filter);
    if (tab === "monetization") {
      const routedSection = normalizeMonetizationSectionId(options?.focus);
      if (routedSection) {
        setExpandedMonetizationSections((current) => new Set([...current, routedSection]));
      }
      if (options?.manage) setActiveMoneyManageTarget(options.manage);
    }
    router.setParams({
      tab,
      focus: options?.focus ?? "",
      manage: options?.manage ?? "",
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
      else {
        next.add(id);
        trackEvent("money_section_opened", {
          creator_id: user?.id ?? null,
          route_name: "channel-studio",
          source_surface: "money_center",
          feature_key: id,
        });
      }
      return next;
    });
  };
  const focusMoneyCenterSection = useCallback((id: MoneyCenterFocusSection) => {
    setActiveStudioTab("monetization");
    setExpandedMonetizationSections((current) => new Set([...current, id]));
  }, []);
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
    const manageTarget = normalizeMoneyManageTarget(routeParams.manage);
    if (nextTab === "monetization" && manageTarget) {
      setActiveMoneyManageTarget(manageTarget);
      setExpandedMonetizationSections((current) => new Set([...current, "ways_to_earn"]));
    }
    if (routeAction === "upload") setContentStatusFilter("all");
  }, [routeAction, routeParams.focus, routeParams.manage, routeParams.tab]);

  useEffect(() => {
    if (activeStudioTab !== "monetization") return;
    trackEvent("money_center_opened", {
      creator_id: user?.id ?? null,
      route_name: "channel-studio",
      source_surface: "platform_studio",
    });
  }, [activeStudioTab, user?.id]);

  useEffect(() => {
    const sourceVideoId = String(Array.isArray(routeParams.sourceVideoId) ? routeParams.sourceVideoId[0] : routeParams.sourceVideoId ?? "").trim();
    if (!sourceVideoId || sourceVideoEventPrefillRef.current === sourceVideoId) return;
    sourceVideoEventPrefillRef.current = sourceVideoId;
    const routedEventTitle = String(Array.isArray(routeParams.eventTitle) ? routeParams.eventTitle[0] : routeParams.eventTitle ?? "").trim();
    const suggestedEventType = String(Array.isArray(routeParams.suggestedEventType) ? routeParams.suggestedEventType[0] : routeParams.suggestedEventType ?? "").trim();
    const safeEventType: CreatorEventType = suggestedEventType === "live_watch_party" || suggestedEventType === "watch_party_live"
      ? suggestedEventType
      : "watch_party_live";

    setActiveStudioTab("live");
    setEventEditor({
      ...createEmptyEventEditorState(),
      eventTitle: routedEventTitle ? `${routedEventTitle} Live Event` : "Creator Content Event",
      eventType: safeEventType,
      status: "draft",
      linkedTitleId: "",
    });
    setEventNotice("Event draft prefilled from creator content. Confirm event type, start/end time, visibility, and access before saving.");
    router.setParams({
      tab: "live",
      focus: "schedule",
      sourceVideoId: "",
      eventTitle: "",
      description: "",
      thumbnail: "",
      suggestedEventType: "",
    });
  }, [routeParams.description, routeParams.eventTitle, routeParams.sourceVideoId, routeParams.suggestedEventType, router]);

  useEffect(() => {
    if (!canUseChannelSettings) {
      setCreatorPayoutSummary(createEmptyCreatorPayoutDashboardReadModel());
      setCreatorMonetizationSummary(null);
      setCreatorMoneyAuditSourceRows([]);
      setSelectedCreatorMoneyAuditEvent(null);
      setCreatorTipSettings(null);
      setCreatorTipTransactions([]);
      setCreatorPaidVideoOffers([]);
      setCreatorPaidVideoTransactions([]);
      setCreatorPaidWatchPartyOffers([]);
      setCreatorPaidWatchPartyTransactions([]);
      setCreatorPaidEventOffers([]);
      setCreatorPaidEventTransactions([]);
      setCreatorVipPassOffers([]);
      setCreatorVipTransactions([]);
      setVipPassSaving(false);
      setVipPassNotice(null);
      setCreatorChannelSubscriptionOffers([]);
      setCreatorChannelSubscriptionTransactions([]);
      setChannelSubscriptionSaving(false);
      setChannelSubscriptionNotice(null);
      setCreatorSandboxConfigs([]);
      setWatchPartySetupSavingId(null);
      setSandboxTesterActive(false);
      setSandboxTesterRows([]);
      setSandboxSetupBusy(false);
      setSandboxSetupNotice(null);
      setPaidEventSavingId(null);
      setTipSettingsNotice(null);
      setProviderReadinessSummary(getProviderReadinessFallbackSummary());
      setMoneyFeatureFlags(getMoneyFeatureFlagFallbackSummary());
      setPayoutSetupNotice(null);
      setPlatformBranding(null);
      setPlatformVisibilitySaving(null);
      setPlatformVisibilityNotice(null);
      setBrandDraft(null);
      setPlatformRoleMemberships([]);
      setPremiumEntitlement(null);
      setPremiumSnapshotActive(false);
      setCreatorVideoClipEdits({});
      setAudienceMembers([]);
      setAudienceMembersLoading(false);
      setLoading(false);
      return;
    }
    let active = true;

    Promise.all([
      readUserProfile(),
      readAppConfig().catch(() => DEFAULT_APP_CONFIG),
      readCreatorPermissions().catch(() => null),
      readChannelAudienceSummary(String(user?.id ?? "")).catch(() => null),
      readChannelAudienceMembers(String(user?.id ?? "")).catch(() => []),
      readChannelSafetyAdminSummary(String(user?.id ?? "")).catch(() => null),
      readCreatorAnalyticsSummary(String(user?.id ?? "")).catch(() => null),
      readCreatorPayoutDashboardSummary({ creatorUserId: String(user?.id ?? ""), limit: 5 }),
      readCreatorMonetizationFoundationSummary(String(user?.id ?? "")).catch(() => null),
      readCreatorMoneyAuditSourceRows(String(user?.id ?? "")).catch(() => []),
      readMyCreatorTipSettings().catch(() => null),
      listMyCreatorTipTransactions(25).catch(() => []),
      listMyPaidVideoOffers().catch(() => []),
      listMyPaidVideoTransactions(50).catch(() => []),
      listMyPaidWatchPartyOffers().catch(() => []),
      listMyPaidWatchPartyTransactions(50).catch(() => []),
      listMyPaidCreatorEventOffers().catch(() => []),
      listMyPaidCreatorEventTransactions(50).catch(() => []),
      listMyCreatorVipPassOffers().catch(() => []),
      listMyCreatorVipTransactions(50).catch(() => []),
      listMyChannelSubscriptionOffers().catch(() => []),
      listMyChannelSubscriptionTransactions(50).catch(() => []),
      listMyCreatorSandboxMonetizationConfigs().catch(() => []),
      resolveSandboxMonetizationTester(String(user?.id ?? ""), String(user?.email ?? "")).catch(() => false),
      listSandboxMonetizationTesters().catch(() => []),
      readProviderReadinessSummary().catch(getProviderReadinessFallbackSummary),
      readMoneyFeatureFlagSummary().catch(getMoneyFeatureFlagFallbackSummary),
      readPlatformBrandStudio(String(user?.id ?? "")).catch(() => null),
      readMyPlatformRoleMemberships().catch(() => []),
      readCurrentUserEntitlement("premium").catch(() => null),
    ])
      .then(([
        resolvedProfile,
        resolvedConfig,
        resolvedPermissions,
        resolvedAudienceSummary,
        resolvedAudienceMembers,
        resolvedSafetyAdminSummary,
        resolvedCreatorAnalyticsSummary,
        resolvedCreatorPayoutSummary,
        resolvedCreatorMonetizationSummary,
        resolvedCreatorMoneyAuditSourceRows,
        resolvedCreatorTipSettings,
        resolvedCreatorTipTransactions,
        resolvedCreatorPaidVideoOffers,
        resolvedCreatorPaidVideoTransactions,
        resolvedCreatorPaidWatchPartyOffers,
        resolvedCreatorPaidWatchPartyTransactions,
        resolvedCreatorPaidEventOffers,
        resolvedCreatorPaidEventTransactions,
        resolvedCreatorVipPassOffers,
        resolvedCreatorVipTransactions,
        resolvedCreatorChannelSubscriptionOffers,
        resolvedCreatorChannelSubscriptionTransactions,
        resolvedCreatorSandboxConfigs,
        resolvedSandboxTesterActive,
        resolvedSandboxTesterRows,
        resolvedProviderReadinessSummary,
        resolvedMoneyFeatureFlags,
        resolvedPlatformBranding,
        resolvedPlatformRoleMemberships,
        resolvedPremiumEntitlement,
      ]) => {
        if (!active) return;
        const normalizedProfile = normalizeUserProfile(resolvedProfile);
        setProfile(normalizedProfile);
        savedProfilePublishSnapshotRef.current = getProfilePublishSnapshot(normalizedProfile);
        setSettingsEnabled(resolveFeatureConfig(resolvedConfig).creatorSettingsEnabled);
        setAppDisplayName(resolveBrandingConfig(resolvedConfig).appDisplayName);
        setUploadsEnabled(resolvedConfig.runtimeControls.uploads_enabled);
        setCreatorPostingEnabled(resolvedConfig.runtimeControls.creator_posting_enabled);
        setMaxUploadSizeMb(resolvedConfig.runtimeControls.max_upload_size_mb);
        setCreatorPermissions(resolvedPermissions);
        setAudienceSummary(resolvedAudienceSummary);
        setAudienceMembers(resolvedAudienceMembers);
        setSafetyAdminSummary(resolvedSafetyAdminSummary);
        setCreatorAnalyticsSummary(resolvedCreatorAnalyticsSummary);
        setCreatorPayoutSummary(resolvedCreatorPayoutSummary);
        setCreatorMonetizationSummary(resolvedCreatorMonetizationSummary);
        setCreatorMoneyAuditSourceRows(resolvedCreatorMoneyAuditSourceRows);
        setCreatorTipSettings(resolvedCreatorTipSettings);
        setCreatorTipTransactions(resolvedCreatorTipTransactions);
        setCreatorPaidVideoOffers(resolvedCreatorPaidVideoOffers);
        setCreatorPaidVideoTransactions(resolvedCreatorPaidVideoTransactions);
        setCreatorPaidWatchPartyOffers(resolvedCreatorPaidWatchPartyOffers);
        setCreatorPaidWatchPartyTransactions(resolvedCreatorPaidWatchPartyTransactions);
        setCreatorPaidEventOffers(resolvedCreatorPaidEventOffers);
        setCreatorPaidEventTransactions(resolvedCreatorPaidEventTransactions);
        setCreatorVipPassOffers(resolvedCreatorVipPassOffers);
        setCreatorVipTransactions(resolvedCreatorVipTransactions);
        setCreatorChannelSubscriptionOffers(resolvedCreatorChannelSubscriptionOffers);
        setCreatorChannelSubscriptionTransactions(resolvedCreatorChannelSubscriptionTransactions);
        setCreatorSandboxConfigs(resolvedCreatorSandboxConfigs);
        setSandboxTesterActive(resolvedSandboxTesterActive);
        setSandboxTesterRows(resolvedSandboxTesterRows);
        setProviderReadinessSummary(resolvedProviderReadinessSummary);
        setMoneyFeatureFlags(resolvedMoneyFeatureFlags);
        setPlatformBranding(resolvedPlatformBranding);
        setBrandDraft(resolvedPlatformBranding?.profile ?? null);
        setPlatformRoleMemberships(resolvedPlatformRoleMemberships);
        setPremiumEntitlement(resolvedPremiumEntitlement);
        setPremiumSnapshotActive(getCachedMonetizationSnapshot().targets.premium_subscription.hasEntitlement);
        setLoading(false);
      })
      .catch(() => {
        if (!active) return;
        const fallbackProfile = normalizeUserProfile({ username: "", avatarIndex: 0 });
        setProfile(fallbackProfile);
        savedProfilePublishSnapshotRef.current = getProfilePublishSnapshot(fallbackProfile);
        setUploadsEnabled(DEFAULT_APP_CONFIG.runtimeControls.uploads_enabled);
        setCreatorPostingEnabled(DEFAULT_APP_CONFIG.runtimeControls.creator_posting_enabled);
        setMaxUploadSizeMb(DEFAULT_APP_CONFIG.runtimeControls.max_upload_size_mb);
        setAudienceSummary(null);
        setAudienceMembers([]);
        setAudienceMembersLoading(false);
        setSafetyAdminSummary(null);
        setCreatorAnalyticsSummary(null);
        setCreatorPayoutSummary(createEmptyCreatorPayoutDashboardReadModel());
        setCreatorMonetizationSummary(null);
        setCreatorMoneyAuditSourceRows([]);
        setSelectedCreatorMoneyAuditEvent(null);
        setCreatorTipSettings(null);
        setCreatorTipTransactions([]);
        setCreatorPaidVideoOffers([]);
        setCreatorPaidVideoTransactions([]);
        setCreatorPaidWatchPartyOffers([]);
        setCreatorPaidWatchPartyTransactions([]);
        setCreatorPaidEventOffers([]);
        setCreatorPaidEventTransactions([]);
        setCreatorVipPassOffers([]);
        setCreatorVipTransactions([]);
        setCreatorChannelSubscriptionOffers([]);
        setCreatorChannelSubscriptionTransactions([]);
        setCreatorSandboxConfigs([]);
        setSandboxTesterActive(false);
        setSandboxTesterRows([]);
        setSandboxSetupBusy(false);
        setSandboxSetupNotice(null);
        setChannelSubscriptionSaving(false);
        setChannelSubscriptionNotice(null);
        setPaidEventSavingId(null);
        setTipSettingsNotice(null);
        setProviderReadinessSummary(getProviderReadinessFallbackSummary());
        setMoneyFeatureFlags(getMoneyFeatureFlagFallbackSummary());
        setPlatformRoleMemberships([]);
        setPremiumEntitlement(null);
        setPremiumSnapshotActive(getCachedMonetizationSnapshot().targets.premium_subscription.hasEntitlement);
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [canUseChannelSettings, user?.email, user?.id]);

  useEffect(() => {
    const syncPremiumSnapshotAccess = () => {
      setPremiumSnapshotActive(getCachedMonetizationSnapshot().targets.premium_subscription.hasEntitlement);
    };
    syncPremiumSnapshotAccess();
    return subscribeToMonetizationSnapshot(syncPremiumSnapshotAccess);
  }, []);

  useEffect(() => {
    if (!canUseChannelSettings || !user?.id) {
      setPremiumSnapshotActive(false);
      return;
    }
    let active = true;

    readMonetizationSnapshot({ forceRefresh: true, userId: String(user.id) })
      .then((snapshot) => {
        if (!active) return;
        setPremiumSnapshotActive(snapshot.targets.premium_subscription.hasEntitlement);
      })
      .catch(() => {
        if (!active) return;
        setPremiumSnapshotActive(getCachedMonetizationSnapshot().targets.premium_subscription.hasEntitlement);
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

  const refreshCreatorTips = useCallback(async () => {
    if (!user?.id) {
      setCreatorTipSettings(null);
      setCreatorTipTransactions([]);
      return;
    }

    const [nextSettings, nextTransactions] = await Promise.all([
      readMyCreatorTipSettings().catch(() => null),
      listMyCreatorTipTransactions(25).catch(() => []),
    ]);
    setCreatorTipSettings(nextSettings);
    setCreatorTipTransactions(nextTransactions);
  }, [user?.id]);

  const refreshPaidVideos = useCallback(async () => {
    if (!user?.id) {
      setCreatorPaidVideoOffers([]);
      setCreatorPaidVideoTransactions([]);
      return;
    }

    const [nextOffers, nextTransactions] = await Promise.all([
      listMyPaidVideoOffers().catch(() => []),
      listMyPaidVideoTransactions(50).catch(() => []),
    ]);
    setCreatorPaidVideoOffers(nextOffers);
    setCreatorPaidVideoTransactions(nextTransactions);
  }, [user?.id]);

  const refreshPaidEvents = useCallback(async () => {
    if (!user?.id) {
      setCreatorPaidEventOffers([]);
      setCreatorPaidEventTransactions([]);
      return;
    }

    const [nextOffers, nextTransactions] = await Promise.all([
      listMyPaidCreatorEventOffers().catch(() => []),
      listMyPaidCreatorEventTransactions(50).catch(() => []),
    ]);
    setCreatorPaidEventOffers(nextOffers);
    setCreatorPaidEventTransactions(nextTransactions);
  }, [user?.id]);

  const refreshVipPasses = useCallback(async () => {
    if (!user?.id) {
      setCreatorVipPassOffers([]);
      setCreatorVipTransactions([]);
      return;
    }

    const [nextOffers, nextTransactions] = await Promise.all([
      listMyCreatorVipPassOffers().catch(() => []),
      listMyCreatorVipTransactions(50).catch(() => []),
    ]);
    setCreatorVipPassOffers(nextOffers);
    setCreatorVipTransactions(nextTransactions);
  }, [user?.id]);

  const refreshChannelSubscriptions = useCallback(async () => {
    if (!user?.id) {
      setCreatorChannelSubscriptionOffers([]);
      setCreatorChannelSubscriptionTransactions([]);
      return;
    }

    const [nextOffers, nextTransactions] = await Promise.all([
      listMyChannelSubscriptionOffers().catch(() => []),
      listMyChannelSubscriptionTransactions(50).catch(() => []),
    ]);
    setCreatorChannelSubscriptionOffers(nextOffers);
    setCreatorChannelSubscriptionTransactions(nextTransactions);
  }, [user?.id]);

  const refreshCreatorSandboxConfigs = useCallback(async () => {
    if (!user?.id) {
      setCreatorSandboxConfigs([]);
      return [];
    }
    const nextConfigs = await listMyCreatorSandboxMonetizationConfigs().catch(() => []);
    setCreatorSandboxConfigs(nextConfigs);
    return nextConfigs;
  }, [user?.id]);

  const saveCreatorSetupConfig = useCallback(async (input: {
    displayName: string;
    metadata?: Record<string, unknown>;
    productKey: string;
    sourceId: string;
    sourceType: CreatorMonetizationSetupSourceType;
  }) => {
    const config = await saveCreatorSandboxMonetizationConfig({
      ...input,
      metadata: {
        ...(input.metadata ?? {}),
        no_live_money: true,
        no_live_payout: true,
        setup_surface: input.metadata?.setup_surface ?? "money_center_flow_manager",
      },
    });
    await refreshCreatorSandboxConfigs();
    return config;
  }, [refreshCreatorSandboxConfigs]);

  const saveCreatorTipSandboxSetupConfig = useCallback(async (setupSurface: string) => {
    if (!user?.id) {
      throw new Error("Enter a real creator source before saving.");
    }

    return saveCreatorSetupConfig({
      displayName: "Creator tip",
      metadata: {
        google_play_revenuecat_only: true,
        no_access_grant: true,
        setup_surface: setupSurface,
        tip_setup_mode: "sandbox_not_payable",
      },
      productKey: "creator_tip_sandbox_099",
      sourceId: String(user.id),
      sourceType: "creator_tip",
    });
  }, [saveCreatorSetupConfig, user?.id]);

  const formatCreatorSetupError = (error: unknown, fallback: string) => {
    const message = error instanceof Error ? error.message : "";
    if (
      message === "Enter a real source UUID before saving."
      || message === "Enter a real creator source before saving."
      || message === "Choose an approved sandbox product tier."
      || message === "Source type does not match the selected product tier."
    ) {
      return message;
    }
    if (/rpc.*blocked|setup rpc.*blocked|permission denied|row-level security|violates row-level security/i.test(message)) {
      return "Tip settings could not be saved because the setup RPC was blocked.";
    }
    if (/internal sandbox monetization setup/i.test(message)) {
      return "This account is not approved for internal sandbox monetization setup.";
    }
    if (/product|provider|revenuecat|google play/i.test(message)) {
      return "Sandbox product is not available on this build/account.";
    }
    return fallback;
  };

  const refreshSandboxTesterExperience = useCallback(async () => {
    if (!user?.id) {
      setSandboxTesterActive(false);
      setSandboxTesterRows([]);
      return;
    }

    const [
      nextTipSettings,
      nextTipTransactions,
      nextPaidVideoOffers,
      nextPaidVideoTransactions,
      nextPaidWatchPartyOffers,
      nextPaidWatchPartyTransactions,
      nextPaidEventOffers,
      nextPaidEventTransactions,
      nextVipOffers,
      nextVipTransactions,
      nextSubscriptionOffers,
      nextSubscriptionTransactions,
      nextSandboxConfigs,
      nextTesterActive,
      nextTesterRows,
    ] = await Promise.all([
      readMyCreatorTipSettings().catch(() => null),
      listMyCreatorTipTransactions(25).catch(() => []),
      listMyPaidVideoOffers().catch(() => []),
      listMyPaidVideoTransactions(50).catch(() => []),
      listMyPaidWatchPartyOffers().catch(() => []),
      listMyPaidWatchPartyTransactions(50).catch(() => []),
      listMyPaidCreatorEventOffers().catch(() => []),
      listMyPaidCreatorEventTransactions(50).catch(() => []),
      listMyCreatorVipPassOffers().catch(() => []),
      listMyCreatorVipTransactions(50).catch(() => []),
      listMyChannelSubscriptionOffers().catch(() => []),
      listMyChannelSubscriptionTransactions(50).catch(() => []),
      listMyCreatorSandboxMonetizationConfigs().catch(() => []),
      resolveSandboxMonetizationTester(String(user.id), String(user.email ?? "")).catch(() => false),
      listSandboxMonetizationTesters().catch(() => []),
    ]);

    setCreatorTipSettings(nextTipSettings);
    setCreatorTipTransactions(nextTipTransactions);
    setCreatorPaidVideoOffers(nextPaidVideoOffers);
    setCreatorPaidVideoTransactions(nextPaidVideoTransactions);
    setCreatorPaidWatchPartyOffers(nextPaidWatchPartyOffers);
    setCreatorPaidWatchPartyTransactions(nextPaidWatchPartyTransactions);
    setCreatorPaidEventOffers(nextPaidEventOffers);
    setCreatorPaidEventTransactions(nextPaidEventTransactions);
    setCreatorVipPassOffers(nextVipOffers);
    setCreatorVipTransactions(nextVipTransactions);
    setCreatorChannelSubscriptionOffers(nextSubscriptionOffers);
    setCreatorChannelSubscriptionTransactions(nextSubscriptionTransactions);
    setCreatorSandboxConfigs(nextSandboxConfigs);
    setSandboxTesterActive(nextTesterActive);
    setSandboxTesterRows(nextTesterRows);
  }, [user?.email, user?.id]);

  const handleSaveTipSettings = useCallback(async (tipsEnabled: boolean) => {
    if (tipSettingsBusy) return;

    setTipSettingsBusy(true);
    setTipSettingsNotice(null);
    trackEvent(tipsEnabled ? "money_feature_enabled" : "money_feature_paused", {
      creator_id: user?.id ?? null,
      feature_key: "tips",
      route_name: "channel-studio",
      source_surface: "money_center",
    });

    try {
      const current = creatorTipSettings;
      const tipSettingsInput = {
        currency: current?.currency ?? "usd",
        defaultAmountCents: current?.defaultAmountCents ?? 300,
        maxAmountCents: current?.maxAmountCents ?? 50000,
        minAmountCents: current?.minAmountCents ?? 100,
        suggestedAmountsCents: current?.suggestedAmountsCents?.length ? current.suggestedAmountsCents : [100, 300, 500, 1000],
        tipsEnabled,
      };

      if (tipsEnabled) {
        await saveCreatorTipSandboxSetupConfig("money_center_tips_manager");

        let nextSettings: CreatorTipSettings | null = null;
        let publicStatusSyncError: unknown = null;
        try {
          nextSettings = await saveMyCreatorTipSettings(tipSettingsInput);
          setCreatorTipSettings(nextSettings);
        } catch (error) {
          publicStatusSyncError = error;
        }

        await refreshCreatorTips();
        setTipSettingsNotice(
          publicStatusSyncError
            ? "Tips setup is saved in sandbox/not-payable mode. Tip setup is sandbox/not-payable. Live tips require owner/provider activation."
            : nextSettings?.status === "active"
              ? "Tips setup is saved in sandbox/not-payable mode. Production tips are not live."
              : "Tips setup is saved in sandbox/not-payable mode. Tip setup is sandbox/not-payable. Live tips require owner/provider activation.",
        );
        return;
      }

      const nextSettings = await saveMyCreatorTipSettings(tipSettingsInput);
      setCreatorTipSettings(nextSettings);
      setTipSettingsNotice("Tips setup is paused. Production tips are not live.");
      await refreshCreatorTips();
    } catch (error) {
      setTipSettingsNotice(formatCreatorSetupError(error, "Tip settings could not be saved. Try again later."));
    } finally {
      setTipSettingsBusy(false);
    }
  }, [creatorTipSettings, refreshCreatorTips, saveCreatorTipSandboxSetupConfig, tipSettingsBusy, user?.id]);

  const handleSaveChannelSubscription = useCallback(async (enabled: boolean) => {
    if (channelSubscriptionSaving) return;

    setChannelSubscriptionSaving(true);
    setChannelSubscriptionNotice(null);
    trackEvent(enabled ? "money_feature_enabled" : "money_feature_paused", {
      creator_id: user?.id ?? null,
      feature_key: "channel_subscriptions",
      route_name: "channel-studio",
      source_surface: "money_center",
    });

    try {
      const savedOffer = await saveChannelSubscriptionOffer({
        description:
          "Subscribe to this creator's Platform. While active, it includes this creator's ordinary Paid Videos, but not Premium, VIP-only content, Watch-Party Seat Passes, Event Passes, or other creators' Platforms.",
        status: enabled ? "sandbox" : "paused",
        title: "Channel subscription",
      });
      if (enabled) {
        await saveCreatorSetupConfig({
          displayName: "Sandbox Channel Subscription",
          metadata: {
            provider_product_type: "creator_channel_subscription",
            setup_surface: "money_center_channel_subscription_manager",
          },
          productKey: "channel_subscription_sandbox_monthly_499",
          sourceId: savedOffer.id,
          sourceType: "channel_subscription",
        });
      }
      setChannelSubscriptionNotice(
        enabled
          ? `Channel Subscription saved in sandbox mode. Fans can subscribe only through verified ${storeProviderPair} checkout.`
          : "Channel Subscription paused. Fans cannot start a new subscription right now.",
      );
      await refreshChannelSubscriptions();
    } catch (error) {
      setChannelSubscriptionNotice(formatCreatorSetupError(error, "Channel Subscription settings could not be saved right now."));
    } finally {
      setChannelSubscriptionSaving(false);
    }
  }, [channelSubscriptionSaving, refreshChannelSubscriptions, saveCreatorSetupConfig, storeProviderPair, user?.id]);

  const handleSaveVipPass = useCallback(async (enabled: boolean) => {
    if (vipPassSaving) return;

    setVipPassSaving(true);
    setVipPassNotice(null);
    trackEvent(enabled ? "money_feature_enabled" : "money_feature_paused", {
      creator_id: user?.id ?? null,
      feature_key: "vip_passes",
      route_name: "channel-studio",
      source_surface: "money_center",
    });

    try {
      const savedOffer = await saveCreatorVipPassOffer({
        description:
          "VIP is a one-time 30-day status and VIP-only shelf for this Platform. It does not include Premium, ordinary Paid Video ownership, Watch-Party Seat Passes, Event Passes, Channel Subscriptions, or other creators' Platforms.",
        status: enabled ? "sandbox" : "paused",
        title: "VIP Pass",
      });
      if (enabled) {
        await saveCreatorSetupConfig({
          displayName: "Sandbox VIP Pass",
          metadata: {
            provider_product_type: "creator_vip_pass",
            setup_surface: "money_center_vip_pass_manager",
          },
          productKey: "vip_pass_sandbox_499",
          sourceId: savedOffer.id,
          sourceType: "vip_pass",
        });
      }
      setVipPassNotice(
        enabled
          ? `VIP Pass saved in sandbox mode. Fans can get VIP only through verified ${storeProviderPair} checkout.`
          : "VIP Pass paused. Fans cannot get VIP right now.",
      );
      await refreshVipPasses();
    } catch (error) {
      setVipPassNotice(formatCreatorSetupError(error, "VIP Pass settings could not be saved right now."));
    } finally {
      setVipPassSaving(false);
    }
  }, [refreshVipPasses, saveCreatorSetupConfig, storeProviderPair, user?.id, vipPassSaving]);

  const handleRefreshSandboxTesterExperience = useCallback(async () => {
    if (sandboxSetupBusy) return;
    setSandboxSetupBusy(true);
    setSandboxSetupState("setting_up");
    setSandboxSetupNotice(null);
    try {
      await refreshSandboxTesterExperience();
      setSandboxSetupState("complete");
      setSandboxSetupNotice("Sandbox tester status refreshed. Live money and payouts remain off.");
    } catch {
      setSandboxSetupState("failed");
      setSandboxSetupNotice("Sandbox tester status could not be refreshed right now.");
    } finally {
      setSandboxSetupBusy(false);
    }
  }, [refreshSandboxTesterExperience, sandboxSetupBusy]);

  const handleSetupSandboxTesterExperience = useCallback(async () => {
    if (!user?.id || sandboxSetupBusy) return;

    setSandboxSetupBusy(true);
    setSandboxSetupState("setting_up");
    setSandboxSetupNotice(null);

    let setupTimeout: ReturnType<typeof setTimeout> | null = null;

    try {
      await Promise.race([
        (async () => {

    const blockers: string[] = [];
    const completed: string[] = [];

    try {
      const currentTipSettings = creatorTipSettings;
      await saveCreatorTipSandboxSetupConfig("money_center_sandbox_tester_experience");
      await saveMyCreatorTipSettings({
        currency: currentTipSettings?.currency ?? "usd",
        defaultAmountCents: currentTipSettings?.defaultAmountCents ?? 300,
        maxAmountCents: currentTipSettings?.maxAmountCents ?? 50000,
        minAmountCents: currentTipSettings?.minAmountCents ?? 100,
        suggestedAmountsCents: currentTipSettings?.suggestedAmountsCents?.length
          ? currentTipSettings.suggestedAmountsCents
          : [100, 300, 500, 1000],
        tipsEnabled: true,
      }).catch(() => null);
      completed.push("Tips");
    } catch {
      blockers.push(`${storeProviderName} sandbox tip setup still needs attention.`);
    }

    const latestPublicVideo = creatorVideos
      .filter((video) => (
        video.visibility === "public"
        && ["clean", "reported"].includes(video.moderationStatus)
        && hasPlayableCreatorVideoSource(video)
      ))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;

    if (latestPublicVideo) {
      try {
        await savePaidVideoOffer({
          currency: "usd",
          isPaid: true,
          priceCents: 99,
          videoId: latestPublicVideo.id,
        });
        await saveCreatorSandboxMonetizationConfig({
          displayName: "Sandbox Paid Video",
          metadata: {
            no_live_payout: true,
            setup_surface: "money_center_sandbox_tester_experience",
          },
          productKey: "paid_content_access_sandbox_099",
          sourceId: latestPublicVideo.id,
          sourceType: "paid_content",
        });
        completed.push("Paid Video");
      } catch {
        blockers.push("Paid Video could not be saved for the latest public video.");
      }
    } else {
      blockers.push("No public safe video is available for Paid Video.");
    }

    const existingWatchPartyOffer = creatorPaidWatchPartyOffers
      .find((offer) => !!offer.partyId && ["sandbox", "paused", "draft", "sold_out"].includes(offer.status));
    if (existingWatchPartyOffer?.partyId) {
      try {
        const savedWatchPartyOffer = await savePaidWatchPartyOffer({
          partyId: existingWatchPartyOffer.partyId,
          priceCents: 99,
          seatLimit: existingWatchPartyOffer.seatLimit ?? 25,
          status: "sandbox",
          title: formatWatchPartySeatPassDisplayTitle(existingWatchPartyOffer.title),
        });
        await saveCreatorSandboxMonetizationConfig({
          displayName: "Sandbox Watch-Party Seat Pass",
          metadata: {
            no_live_payout: true,
            party_id: savedWatchPartyOffer.partyId,
            setup_surface: "money_center_sandbox_tester_experience",
          },
          productKey: "watch_party_live_ticket_sandbox_099",
          sourceId: savedWatchPartyOffer.id,
          sourceType: "watch_party_live",
        });
        completed.push("Watch-Party Seat Pass");
      } catch {
        blockers.push("Watch-Party Seat Pass needs a valid creator-owned Party Room.");
      }
    } else {
      blockers.push("Create one Party Room before a Watch-Party Seat Pass can be configured.");
    }

    let eventForPass = creatorEvents
      .filter((event) => !["expired", "canceled", "ended"].includes(event.status))
      .sort((a, b) => Date.parse(a.startsAt ?? "") - Date.parse(b.startsAt ?? ""))[0] ?? null;
    if (!eventForPass) {
      const startsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      const endsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString();
      const created = await createCreatorEvent({
        endsAt,
        eventTitle: "Sandbox Event Pass Demo",
        eventType: "live_first",
        hostUserId: String(user.id),
        startsAt,
        status: "scheduled",
      });
      if ("error" in created) {
        blockers.push("Event Pass needs a valid creator event.");
      } else {
        eventForPass = created;
        setCreatorEvents((current) => [created, ...current.filter((event) => event.id !== created.id)]);
      }
    }
    if (eventForPass) {
      try {
        const savedEventOffer = await savePaidCreatorEventOffer({
          capacityLimit: null,
          creatorEventId: eventForPass.id,
          description: "Sandbox event pass test flow. No live payout.",
          priceCents: 99,
          status: "sandbox",
        });
        await saveCreatorSandboxMonetizationConfig({
          displayName: "Sandbox Event Pass",
          metadata: {
            event_offer_id: savedEventOffer.id,
            no_live_payout: true,
            setup_surface: "money_center_sandbox_tester_experience",
          },
          productKey: "event_pass_sandbox_099",
          sourceId: eventForPass.id,
          sourceType: "event",
        });
        completed.push("Event Pass");
      } catch {
        blockers.push("Event Pass could not be saved for the selected event.");
      }
    }

    try {
      const savedChannelSubscriptionOffer = await saveChannelSubscriptionOffer({
        description:
          "Sandbox creator-specific Channel Subscription test flow. While active it includes this creator's ordinary Paid Videos, but not Premium, VIP-only content, Watch-Party Seat Passes, Event Passes, or other creators.",
        status: "sandbox",
        title: "Channel subscription",
      });
      await saveCreatorSandboxMonetizationConfig({
        displayName: "Sandbox Channel Subscription",
        metadata: {
          no_live_payout: true,
          setup_surface: "money_center_sandbox_tester_experience",
        },
        productKey: "channel_subscription_sandbox_monthly_499",
        sourceId: savedChannelSubscriptionOffer.id,
        sourceType: "channel_subscription",
      });
      completed.push("Channel Subscription");
    } catch {
      blockers.push("Channel Subscription could not be saved.");
    }

    try {
      const savedVipOffer = await saveCreatorVipPassOffer({
        description:
          "Sandbox one-time 30-day creator-specific VIP test flow with VIP-only shelf access. It does not include Premium, ordinary Paid Video ownership, Watch-Party Seat Passes, Event Passes, Channel Subscriptions, or other creators.",
        status: "sandbox",
        title: "VIP Pass",
      });
      await saveCreatorSandboxMonetizationConfig({
        displayName: "Sandbox VIP Pass",
        metadata: {
          no_live_payout: true,
          setup_surface: "money_center_sandbox_tester_experience",
        },
        productKey: "vip_pass_sandbox_499",
        sourceId: savedVipOffer.id,
        sourceType: "vip_pass",
      });
      completed.push("VIP Pass");
    } catch {
      blockers.push("VIP Pass could not be saved.");
    }

    await refreshSandboxTesterExperience();
    setSandboxSetupState(blockers.length ? "partial" : "complete");
    setSandboxSetupNotice(
      blockers.length
        ? `Sandbox setup is partially ready: ${completed.length} flow${completed.length === 1 ? "" : "s"} ready. ${blockers.slice(0, 2).join(" ")} Live money: Off. Payouts: Off.`
        : "Sandbox tester offers are ready. Test mode only. No real charges, creator earnings, payouts, withdrawals, or cash-out.",
    );
        })(),
        new Promise<never>((_, reject) => {
          setupTimeout = setTimeout(() => reject(new Error(SANDBOX_SETUP_TIMEOUT_ERROR)), SANDBOX_SETUP_TIMEOUT_MS);
        }),
      ]);
    } catch (error) {
      const timedOut = error instanceof Error && error.message === SANDBOX_SETUP_TIMEOUT_ERROR;
      setSandboxSetupState(timedOut ? "timed_out" : "failed");
      setSandboxSetupNotice(
        timedOut
          ? "Setup timed out. Refresh status or retry setup. Live money: Off. Payouts: Off."
          : "Setup failed. Retry setup or check the missing flow cards. Live money: Off. Payouts: Off.",
      );
    } finally {
      if (setupTimeout) clearTimeout(setupTimeout);
      setSandboxSetupBusy(false);
    }
  }, [
    creatorEvents,
    creatorPaidWatchPartyOffers,
    creatorTipSettings,
    creatorVideos,
    refreshSandboxTesterExperience,
    saveCreatorTipSandboxSetupConfig,
    sandboxSetupBusy,
    storeProviderName,
    user?.id,
  ]);

  const handleStartPayoutProviderSetup = useCallback(async () => {
    const creatorUserId = String(user?.id ?? "").trim();
    if (!creatorUserId || payoutSetupBusy) return;

    setPayoutSetupBusy("setup");
    setPayoutSetupNotice(null);
    trackEvent("payout_setup_started", {
      creator_id: creatorUserId,
      route_name: "channel-studio",
      source_surface: "money_center",
    });

    try {
      const accountPayload = await createOrReuseCreatorPayoutProviderAccount(creatorUserId);
      if (accountPayload.status === "not_configured") {
        setPayoutSetupNotice("Payout readiness/status flow is active. Provider setup is not configured, and no payout movement is enabled.");
        await refreshCreatorPayouts();
        return;
      }

      const linkPayload = await createCreatorPayoutOnboardingLink({
        creatorUserId,
        refreshUrl: createPayoutSetupRedirectUrl("refresh"),
        returnUrl: createPayoutSetupRedirectUrl("return"),
      });

      if (linkPayload.status === "not_configured" || linkPayload.status === "setup_required") {
        setPayoutSetupNotice(linkPayload.message || "Payout provider setup needs owner/provider resolution. No payout movement is enabled.");
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
      await refreshCreatorTips();
    } catch {
      setPayoutSetupNotice("Payout setup could not be started. No payout or transfer was created.");
    } finally {
      setPayoutSetupBusy(null);
    }
  }, [payoutSetupBusy, refreshCreatorPayouts, refreshCreatorTips, user?.id]);

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
      await refreshCreatorTips();
    } catch {
      setPayoutSetupNotice("Payout provider status could not be refreshed. No money action was created.");
    } finally {
      setPayoutSetupBusy(null);
    }
  }, [payoutSetupBusy, refreshCreatorPayouts, refreshCreatorTips, user?.id]);

  const handleReviewCashoutReadiness = useCallback(() => {
    const runtimeFlags = creatorMonetizationSummary?.settings ?? DEFAULT_CREATOR_MONETIZATION_RUNTIME_FLAGS;
    const preview = previewCreatorPayoutPreproductionWorkflow(
      creatorPayoutSummary,
      { amountCents: 10000, payoutType: "scheduled" },
      runtimeFlags,
    );
    const blockers = preview.blockedReasons.slice(0, 4).join(" ");
    const nextSteps = preview.approvalSteps.slice(0, 2).join(" ");
    setPayoutSetupNotice(
      `Cashout readiness reviewed. Cashout not live yet. No real payout will be sent. ${blockers} ${nextSteps}`,
    );
    setExpandedMonetizationSections((current) => {
      const next = new Set<MonetizationSectionId>([...current, "payouts", "providers", "tax_legal"]);
      next.delete("ways_to_earn");
      return next;
    });
    trackEvent("payout_readiness_reviewed", {
      creator_id: user?.id ?? null,
      live_money_enabled: runtimeFlags.liveMoneyEnabled,
      payout_enabled: runtimeFlags.payoutsEnabled,
      production_execution_allowed: preview.productionExecutionAllowed,
      route_name: "channel-studio",
      source_surface: "money_center",
    });
  }, [creatorMonetizationSummary?.settings, creatorPayoutSummary, user?.id]);

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
      setCreatorReplays([]);
      setVideosLoadError(null);
      setVideosLoading(false);
      return () => {
        active = false;
      };
    }

    setVideosLoading(true);
    setVideosLoadError(null);
    void Promise.all([
      readCreatorVideos(String(user.id), { includeDrafts: true, limit: 50 }),
      readCreatorReplayLibraryItems(String(user.id)),
    ])
      .then(async ([videos, replays]) => {
        if (!active) return;
        setCreatorVideos(videos);
        setCreatorReplays(replays);
        const editMap = await readClipStudioEditsForVideos(videos.map((video) => video.id)).catch(() => new Map());
        if (!active) return;
        setCreatorVideoClipEdits(Object.fromEntries(editMap));
        setVideosLoading(false);
      })
      .catch(() => {
        if (!active) return;
        setCreatorVideos([]);
        setCreatorReplays([]);
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

  const onSavePlatformVisibility = async (visibility: AccessVisibility) => {
    const normalizedVisibility = normalizeAccessVisibility(visibility);
    if (platformVisibilitySaving) return;

    setPlatformVisibilitySaving(normalizedVisibility);
    setPlatformVisibilityNotice(null);
    try {
      const savedVisibility = await updateMyPlatformAccessVisibility(normalizedVisibility);
      updateProfile({ platformAccessVisibility: savedVisibility });
      setPlatformVisibilityNotice(`Platform visibility set to ${getAccessVisibilityLabel(savedVisibility)}.`);
    } catch (error) {
      const message = getUserFacingErrorMessage(error, "Unable to update Platform visibility right now.");
      setPlatformVisibilityNotice(message);
      Alert.alert("Platform Visibility", message);
    } finally {
      setPlatformVisibilitySaving(null);
    }
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
    setSelectedVideoFile(null);
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
      setAudienceMembers([]);
      return;
    }

    const [nextSummary, nextMembers] = await Promise.all([
      readChannelAudienceSummary(String(user.id)).catch(() => null),
      readChannelAudienceMembers(String(user.id)).catch(() => []),
    ]);
    setAudienceSummary(nextSummary);
    setAudienceMembers(nextMembers);
  };

  const loadAudienceMembers = async () => {
    if (!user?.id) {
      setAudienceMembers([]);
      return;
    }

    setAudienceMembersLoading(true);
    try {
      const nextMembers = await readChannelAudienceMembers(String(user.id));
      setAudienceMembers(nextMembers);
    } catch {
      setAudienceMembers([]);
    } finally {
      setAudienceMembersLoading(false);
    }
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

  const runAudienceMemberAction = (
    action: ChannelAudienceActionResult["action"],
    member: ChannelAudienceMemberSummary,
  ) => {
    if (!user?.id) {
      setAudienceActionNotice("Sign in with a profile before managing audience members.");
      return;
    }

    if (action === "approve_request") {
      if (!member.requestId) {
        setAudienceActionNotice("That request is no longer available.");
        return;
      }
      void runAudienceAction("approve_request", () => approveChannelAudienceRequest(member.requestId ?? 0));
      return;
    }

    if (action === "decline_request") {
      if (!member.requestId) {
        setAudienceActionNotice("That request is no longer available.");
        return;
      }
      void runAudienceAction("decline_request", () => declineChannelAudienceRequest(member.requestId ?? 0));
      return;
    }

    if (action === "remove_follower") {
      void runAudienceAction("remove_follower", () => removeChannelFollower({
        channelUserId: String(user.id),
        followerUserId: member.userId,
      }));
      return;
    }

    if (action === "block") {
      void runAudienceAction("block", () => blockChannelAudienceMember({
        channelUserId: String(user.id),
        blockedUserId: member.userId,
        reason: null,
      }));
      return;
    }

    if (action === "unblock") {
      void runAudienceAction("unblock", () => unblockChannelAudienceMember({
        channelUserId: String(user.id),
        blockedUserId: member.userId,
      }));
    }
  };

  const openAudienceMemberActions = (member: ChannelAudienceMemberSummary) => {
    const buttons: Parameters<typeof Alert.alert>[2] = [];

    if (member.kind === "pending_request") {
      buttons.push(
        { text: "Approve", onPress: () => runAudienceMemberAction("approve_request", member) },
        { text: "Decline", style: "destructive", onPress: () => runAudienceMemberAction("decline_request", member) },
        { text: "Block", style: "destructive", onPress: () => runAudienceMemberAction("block", member) },
      );
    } else if (member.kind === "blocked") {
      buttons.push({ text: "Unblock", onPress: () => runAudienceMemberAction("unblock", member) });
    } else {
      buttons.push(
        { text: "Remove Follower", style: "destructive", onPress: () => runAudienceMemberAction("remove_follower", member) },
        { text: "Block", style: "destructive", onPress: () => runAudienceMemberAction("block", member) },
      );
    }

    buttons.push({ text: "Cancel", style: "cancel" });

    Alert.alert("Audience member", member.displayName, buttons);
  };

  const getAudienceMemberStatus = (member: ChannelAudienceMemberSummary) => {
    if (member.kind === "pending_request") return "Request";
    if (member.kind === "blocked") return "Blocked";
    return "Follower";
  };

  const renderAudienceMemberRow = (member: ChannelAudienceMemberSummary) => {
    const busy = audienceActionLoading !== null;
    const initial = member.displayName.trim().charAt(0).toUpperCase() || "A";
    return (
      <TouchableOpacity
        key={member.id}
        style={styles.audienceMemberCard}
        activeOpacity={0.86}
        onLongPress={() => openAudienceMemberActions(member)}
        onPress={() => openAudienceMemberActions(member)}
        accessibilityRole="button"
        accessibilityLabel={`Manage ${member.displayName}`}
        testID={`audience-member-${member.kind}`}
      >
        <TouchableOpacity
          style={styles.audienceMemberAvatar}
          activeOpacity={0.86}
          onLongPress={() => openAudienceMemberActions(member)}
          onPress={() => openAudienceMemberActions(member)}
          accessibilityRole="button"
          accessibilityLabel={`Manage ${member.displayName}`}
        >
          {member.avatarUrl ? (
            <Image source={{ uri: member.avatarUrl }} style={styles.audienceMemberAvatarImage} resizeMode="cover" />
          ) : (
            <Text style={styles.audienceMemberAvatarText}>{initial}</Text>
          )}
        </TouchableOpacity>
        <View style={styles.audienceMemberCopy}>
          <View style={styles.audienceMemberTitleRow}>
            <Text style={styles.audienceMemberName} numberOfLines={1}>{member.displayName}</Text>
            {renderStudioStatusPill(getAudienceMemberStatus(member), member.kind === "blocked" ? "warning" : "default")}
          </View>
          <Text style={styles.audienceMemberMeta} numberOfLines={1}>
            {member.username ? `@${member.username}` : member.kind === "pending_request" ? "Pending request" : member.kind === "blocked" ? "Blocked from this Platform" : "Following this Platform"}
          </Text>
          {member.note || member.reason ? (
            <Text style={styles.audienceMemberMeta} numberOfLines={2}>{member.note || member.reason}</Text>
          ) : null}
        </View>
        <View style={styles.audienceMemberActions}>
          {member.kind === "pending_request" ? (
            <>
              <TouchableOpacity
                style={[styles.memberActionButton, styles.memberActionButtonPrimary, busy && styles.eventPrimaryButtonDisabled]}
                activeOpacity={0.86}
                disabled={busy}
                onPress={() => runAudienceMemberAction("approve_request", member)}
              >
                <Text style={styles.memberActionButtonText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.memberActionButton, busy && styles.eventPrimaryButtonDisabled]}
                activeOpacity={0.86}
                disabled={busy}
                onPress={() => runAudienceMemberAction("decline_request", member)}
              >
                <Text style={styles.memberActionButtonText}>Decline</Text>
              </TouchableOpacity>
            </>
          ) : member.kind === "blocked" ? (
            <TouchableOpacity
              style={[styles.memberActionButton, styles.memberActionButtonPrimary, busy && styles.eventPrimaryButtonDisabled]}
              activeOpacity={0.86}
              disabled={busy}
              onPress={() => runAudienceMemberAction("unblock", member)}
            >
              <Text style={styles.memberActionButtonText}>Unblock</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.memberActionButton, busy && styles.eventPrimaryButtonDisabled]}
              activeOpacity={0.86}
              disabled={busy}
              onPress={() => openAudienceMemberActions(member)}
            >
              <Text style={styles.memberActionButtonText}>Manage</Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
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
      setCreatorReplays([]);
      setVideosLoadError(null);
      return [];
    }

    setVideosLoading(true);
    setVideosLoadError(null);
    try {
      const [videos, replays] = await Promise.all([
        readCreatorVideos(String(user.id), { includeDrafts: true, limit: 50 }),
        readCreatorReplayLibraryItems(String(user.id)),
      ]);
      setCreatorVideos(videos);
      setCreatorReplays(replays);
      const editMap = await readClipStudioEditsForVideos(videos.map((video) => video.id)).catch(() => new Map());
      setCreatorVideoClipEdits(Object.fromEntries(editMap));
      return videos;
    } catch (error) {
      setCreatorVideos([]);
      setCreatorReplays([]);
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

  const resetVideoEditor = (nextLifecycleState: VideoLifecycleState = "idle") => {
    setVideoEditor(createEmptyVideoEditorState());
    setSelectedVideoFile(null);
    setVideoLifecycleState(nextLifecycleState);
  };

  const openUploadSourceChooser = (target: CreatorVideoSourceTarget) => {
    setUploadSourceTarget(target);
  };

  const applyLegacyCreatorVideoFile = (pickedFile: CreatorVideoFile) => {
    if (!pickedFile.uri) {
      logCreatorVideoUploadUi("picker_missing_asset");
      setVideoNotice("Choose a video file before uploading.");
      setVideoLifecycleState("failed");
      return;
    }

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
    setVideoNotice(`Selected ${pickedFile.name || "video file"}. Open Clip Studio to finish details and save.`);
    if (!videoEditor.title.trim() && pickedFile.name) {
      updateVideoEditor({ title: pickedFile.name.replace(/\.[^.]+$/, "") });
    }
  };

  const applyClipStudioVideoFile = (pickedFile: CreatorVideoFile) => {
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
      title: current.title.trim() || (pickedFile.name ? pickedFile.name.replace(/\.[^.]+$/, "") : current.title),
      visibility: "draft",
      coverStoragePath: null,
      coverMimeType: null,
      coverFileSizeBytes: null,
      coverPreviewUrl: "",
    }));
    setClipNotice("Video selected. Preview, cover, format, and metadata can be saved as a draft.");
    logClipStudioUi("clip_video_selected", {
      source: "upload_source_chooser",
      mimeType: pickedFile.mimeType ?? null,
      size: pickedFile.size ?? null,
    });
  };

  const applySelectedCreatorVideoFile = (target: CreatorVideoSourceTarget, pickedFile: CreatorVideoFile) => {
    if (target === "clip_video") {
      applyClipStudioVideoFile(pickedFile);
      return;
    }
    applyLegacyCreatorVideoFile(pickedFile);
  };

  const pickCreatorVideoFromFiles = async (target: CreatorVideoSourceTarget) => {
    try {
      if (target === "clip_video") {
        setClipSaveState("selecting_video");
        setClipNotice(null);
        logClipStudioUi("clip_video_select_started", { source: "files" });
      } else {
        setVideoNotice(null);
        logCreatorVideoUploadUi("picker_open", { source: "files" });
      }

      const result = await DocumentPicker.getDocumentAsync({
        type: ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v"],
        copyToCacheDirectory: true,
        multiple: false,
      });

      if (result.canceled) {
        if (target === "clip_video") {
          setClipSaveState((current) => (clipEditor.editingVideoId || selectedClipVideoFile ? "ready_to_save" : current === "selecting_video" ? "idle" : current));
          setClipNotice("No video selected. Choose Video when you're ready.");
          logClipStudioUi("clip_video_select_canceled", { source: "files" });
        } else {
          logCreatorVideoUploadUi("picker_canceled", { source: "files" });
          setVideoNotice("No video selected. Open Clip Studio when you're ready to add a Platform video.");
          setVideoLifecycleState("idle");
        }
        return;
      }

      const asset = result.assets[0];
      applySelectedCreatorVideoFile(target, {
        uri: asset?.uri ?? "",
        name: asset?.name ?? getFileNameFromUri(asset?.uri, "video"),
        mimeType: asset?.mimeType,
        size: asset?.size,
      });
    } catch (error) {
      if (target === "clip_video") {
        setClipSaveState("save_failed");
        setClipNotice("Unable to open the video picker right now.");
        logClipStudioUi("clip_video_select_failed", { reason: "picker_unavailable", source: "files" });
      } else {
        logCreatorVideoUploadUi("picker_failed", {
          source: "files",
          message: error instanceof Error ? error.message : "unknown",
        });
        setVideoNotice("Unable to open the video picker right now.");
        setVideoLifecycleState("failed");
      }
    }
  };

  const pickCreatorVideoFromGallery = async (target: CreatorVideoSourceTarget) => {
    try {
      if (target === "clip_video") {
        setClipSaveState("selecting_video");
        setClipNotice(null);
        logClipStudioUi("clip_video_select_started", { source: "gallery" });
      } else {
        setVideoNotice(null);
        logCreatorVideoUploadUi("picker_open", { source: "gallery" });
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["videos"],
        allowsMultipleSelection: false,
        allowsEditing: false,
        quality: 1,
        videoExportPreset: ImagePicker.VideoExportPreset.Passthrough,
        legacy: false,
      });

      if (result.canceled) {
        if (target === "clip_video") {
          setClipSaveState((current) => (clipEditor.editingVideoId || selectedClipVideoFile ? "ready_to_save" : current === "selecting_video" ? "idle" : current));
          setClipNotice("No video selected. Choose Video when you're ready.");
          logClipStudioUi("clip_video_select_canceled", { source: "gallery" });
        } else {
          logCreatorVideoUploadUi("picker_canceled", { source: "gallery" });
          setVideoNotice("No video selected. Open Clip Studio when you're ready to add a Platform video.");
          setVideoLifecycleState("idle");
        }
        return;
      }

      const asset = result.assets[0];
      applySelectedCreatorVideoFile(target, {
        uri: asset?.uri ?? "",
        name: asset?.fileName ?? getFileNameFromUri(asset?.uri, "gallery-video"),
        mimeType: asset?.mimeType,
        size: asset?.fileSize,
      });
    } catch (error) {
      if (target === "clip_video") {
        setClipSaveState("save_failed");
        setClipNotice("Unable to open Photos / Gallery right now. Try Files if the video is saved elsewhere.");
        logClipStudioUi("clip_video_select_failed", { reason: "gallery_unavailable" });
      } else {
        logCreatorVideoUploadUi("picker_failed", {
          source: "gallery",
          message: error instanceof Error ? error.message : "unknown",
        });
        setVideoNotice("Unable to open Photos / Gallery right now. Try Files if the video is saved elsewhere.");
        setVideoLifecycleState("failed");
      }
    }
  };

  const runUploadSourceChoice = (source: "gallery" | "files") => {
    const target = uploadSourceTarget;
    setUploadSourceTarget(null);
    if (!target) return;
    requestAnimationFrame(() => {
      if (source === "gallery") void pickCreatorVideoFromGallery(target);
      else void pickCreatorVideoFromFiles(target);
    });
  };

  const onPickVideoFile = () => {
    openUploadSourceChooser("legacy_video");
  };

  const onPickClipVideoFile = () => {
    openUploadSourceChooser("clip_video");
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

  const onRemoveClipCoverFile = () => {
    setSelectedClipCoverFile(null);
    updateClipEditor({
      coverStoragePath: null,
      coverMimeType: null,
      coverFileSizeBytes: null,
      coverPreviewUrl: "",
    });
    setClipNotice("Cover image removed. Save Draft or Publish Clip to confirm the update.");
    logClipStudioUi("clip_cover_removed");
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

  const getBrandSelectedAssetIds = (source: PlatformBrandingBundle | PlatformBrandProfile | null | undefined) => {
    const profile = source && "profile" in source ? source.profile : source;
    return (
    [
      profile?.heroImageAssetId,
      profile?.heroVideoAssetId,
      profile?.heroPosterAssetId,
      profile?.backgroundImageAssetId,
      profile?.avatarAssetId,
      profile?.logoAssetId,
      profile?.watermarkAssetId,
    ].filter(Boolean) as string[]
    );
  };

  const getBrandPublishNotice = (
    readback: PlatformBrandPublishReadbackStatus | null | undefined,
    profileSaved: boolean,
  ) => {
    const profileRetryCopy = profileSaved ? "" : " Name or tagline changes may need another save.";
    if (!readback) {
      return `Brand Studio changes saved.${profileRetryCopy} Refresh Preview Platform to confirm public media.`;
    }
    if (readback.selectedCount <= 0) {
      return `Brand Studio settings published.${profileRetryCopy}`;
    }
    if (readback.publicReturnedCount > 0) {
      const remainingCount = Math.max(0, readback.selectedCount - readback.publicReturnedCount);
      if (remainingCount > 0) {
        return `Brand Studio published. ${readback.publicReturnedCount} media item${readback.publicReturnedCount === 1 ? "" : "s"} live; ${remainingCount} still getting ready.${profileRetryCopy}`;
      }
      return `Brand Studio published. Your public Platform is updated.${profileRetryCopy}`;
    }
    if (readback.publicReadbackMissingCount > 0) {
      return `Published, but Preview Platform has not refreshed yet.${profileRetryCopy} Reopen Preview Platform to check it.`;
    }
    if (readback.waitingScanCount > 0) {
      return `Saved. Your media is still getting ready.${profileRetryCopy} Try Publish Changes again shortly.`;
    }
    if (readback.waitingReviewCount > 0) {
      return `Saved, but Publish Changes could not apply this media yet.${profileRetryCopy} Retry after refresh.`;
    }
    if (readback.blockedCount > 0 || readback.notPublishedCount > 0) {
      return `Saved, but this media cannot be published yet.${profileRetryCopy}`;
    }
    return `Published, but Preview Platform has not refreshed yet.${profileRetryCopy} Reopen Preview Platform to check it.`;
  };

  const getBrandPublishFailureNotice = (
    readback: PlatformBrandPublishReadbackStatus | null | undefined,
  ) => {
    if (readback) return getBrandPublishNotice(readback, false);
    return "Unable to publish Brand Studio changes right now. Reopen Brand Studio, check the selected media, and try again.";
  };

  const getNormalizedProfileForSave = () => {
    if (!profile) return null;
    return normalizeUserProfile({
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
  };

  const saveCurrentProfileSettings = async () => {
    const normalized = getNormalizedProfileForSave();
    if (!normalized) throw new Error("Platform profile unavailable.");
    await saveUserProfile(normalized);
    setProfile(normalized);
    savedProfilePublishSnapshotRef.current = getProfilePublishSnapshot(normalized);
    return normalized;
  };

  const saveCurrentProfileSettingsIfNeeded = async () => {
    const normalized = getNormalizedProfileForSave();
    if (!normalized) throw new Error("Platform profile unavailable.");
    const nextSnapshot = getProfilePublishSnapshot(normalized);
    if (savedProfilePublishSnapshotRef.current === nextSnapshot) {
      return { saved: false, profile: normalized };
    }
    await saveUserProfile(normalized);
    setProfile(normalized);
    savedProfilePublishSnapshotRef.current = nextSnapshot;
    return { saved: true, profile: normalized };
  };

  const persistBrandDraftPatch = async (patch?: Partial<PlatformBrandProfile>) => {
    const ownerUserId = String(user?.id ?? "").trim();
    const draft = getCurrentBrandDraft();
    if (!ownerUserId || !draft) {
      throw new Error("Sign in before saving Brand Studio changes.");
    }

    const nextDraft = {
      ...draft,
      ...patch,
      heroFitMode: normalizePlatformBrandFitMode(patch?.heroFitMode ?? draft.heroFitMode),
      backgroundFitMode: normalizePlatformBrandFitMode(patch?.backgroundFitMode ?? draft.backgroundFitMode),
      themePreset: normalizePlatformBrandThemePreset(patch?.themePreset ?? draft.themePreset),
    };

    const savedProfile = await savePlatformBrandProfileDraft(ownerUserId, nextDraft);
    setBrandDraft(savedProfile);
    await loadPlatformBranding();
    return savedProfile;
  };

  const saveBrandDraftPatch = async (patch?: Partial<PlatformBrandProfile>) => {
    if (brandProfileSaveInFlightRef.current) return null;
    brandProfileSaveInFlightRef.current = true;
    setBrandSaving(true);
    setBrandNotice(null);
    try {
      const savedProfile = await persistBrandDraftPatch(patch);
      setBrandNotice("Draft changes saved. Publish Changes when you are ready to update your public Platform.");
      return savedProfile;
    } catch {
      setBrandNotice("Unable to save Brand Studio changes right now.");
      return null;
    } finally {
      brandProfileSaveInFlightRef.current = false;
      setBrandSaving(false);
    }
  };

  const persistBrandPublish = async () => {
    const ownerUserId = String(user?.id ?? "").trim();
    const draft = getCurrentBrandDraft();
    if (!ownerUserId || !draft) {
      throw new Error("Sign in before publishing Brand Studio changes.");
    }

    const selectedAssetIds = getBrandSelectedAssetIds(draft);
    const savedProfile = await publishPlatformBrandProfile(ownerUserId, draft);
    setBrandDraft(savedProfile);
    const bundle = await loadPlatformBranding();
    const readback = await resolveBrandPublishReadbackStatus(ownerUserId, selectedAssetIds);
    return { bundle, readback };
  };

  const publishBrandDraft = async () => {
    if (brandProfileSaveInFlightRef.current) return;
    brandProfileSaveInFlightRef.current = true;
    setBrandSaving(true);
    setBrandNotice(null);
    const ownerUserId = String(user?.id ?? "").trim();
    const selectedAssetIds = getBrandSelectedAssetIds(getCurrentBrandDraft());
    try {
      const { readback } = await persistBrandPublish();
      setBrandNotice(getBrandPublishNotice(readback, true));
    } catch {
      const readback = ownerUserId
        ? await resolveBrandPublishReadbackStatus(ownerUserId, selectedAssetIds).catch(() => null)
        : null;
      setBrandNotice(getBrandPublishFailureNotice(readback));
    } finally {
      brandProfileSaveInFlightRef.current = false;
      setBrandSaving(false);
    }
  };

  const saveBrandStudioDraftAndProfile = async () => {
    if (brandProfileSaveInFlightRef.current) return;
    brandProfileSaveInFlightRef.current = true;
    setBrandSaving(true);
    setSaving(true);
    setBrandNotice(null);
    setNotice(null);
    try {
      await persistBrandDraftPatch();
    } catch {
      setBrandNotice("Unable to save Brand Studio changes. Platform name and tagline were not saved from this action.");
      brandProfileSaveInFlightRef.current = false;
      setBrandSaving(false);
      setSaving(false);
      return;
    }

    try {
      await saveCurrentProfileSettings();
      setBrandNotice("Draft changes saved. Platform name and tagline saved. Publish Changes when you are ready to update your public Platform.");
    } catch {
      setBrandNotice("Brand Studio draft saved, but Platform name or tagline changes could not be saved. Retry Save Draft to finish profile details.");
    } finally {
      brandProfileSaveInFlightRef.current = false;
      setBrandSaving(false);
      setSaving(false);
    }
  };

  const publishBrandStudioAndProfile = async () => {
    if (brandProfileSaveInFlightRef.current) return;
    brandProfileSaveInFlightRef.current = true;
    setBrandSaving(true);
    setSaving(true);
    setBrandNotice(null);
    setNotice(null);
    let publishResult: { bundle: PlatformBrandingBundle | null; readback: PlatformBrandPublishReadbackStatus | null } | null = null;
    const ownerUserId = String(user?.id ?? "").trim();
    const selectedAssetIds = getBrandSelectedAssetIds(getCurrentBrandDraft());
    try {
      publishResult = await persistBrandPublish();
    } catch {
      const readback = ownerUserId
        ? await resolveBrandPublishReadbackStatus(ownerUserId, selectedAssetIds).catch(() => null)
        : null;
      setBrandNotice(getBrandPublishFailureNotice(readback));
      brandProfileSaveInFlightRef.current = false;
      setBrandSaving(false);
      setSaving(false);
      return;
    }

    try {
      await saveCurrentProfileSettingsIfNeeded();
      setBrandNotice(getBrandPublishNotice(publishResult?.readback, true));
    } catch {
      setBrandNotice(getBrandPublishNotice(publishResult?.readback, false));
    } finally {
      brandProfileSaveInFlightRef.current = false;
      setBrandSaving(false);
      setSaving(false);
    }
  };

  const publishSpotlightVideo = async (video: CreatorVideo | null) => {
    const ownerUserId = String(user?.id ?? "").trim();
    if (!ownerUserId) {
      setVideoNotice("Sign in before changing your featured Platform video.");
      return;
    }
    if (video && video.visibility !== "public") {
      setVideoNotice("Publish this video before featuring it on your public Platform.");
      return;
    }

    setBrandSaving(true);
    setVideoNotice(video ? "Updating featured video..." : "Removing featured video...");
    try {
      const bundle = platformBranding ?? await loadPlatformBranding();
      const currentProfile = brandDraft ?? bundle?.profile;
      if (!currentProfile) {
        throw new Error("Platform brand profile unavailable.");
      }

      await publishPlatformBrandProfile(ownerUserId, {
        ...currentProfile,
        spotlightVideoId: video?.id ?? null,
      });
      await loadPlatformBranding();
      setVideoNotice(video ? `"${video.title}" is now featured on your public Platform.` : "Featured video removed from your public Platform.");
    } catch (error) {
      setVideoNotice(formatCreatorVideoUiError(error, "Unable to update the featured video right now."));
    } finally {
      setBrandSaving(false);
    }
  };

  useEffect(() => {
    const routedSpotlightVideoId = String(
      Array.isArray(routeParams.spotlightVideoId)
        ? routeParams.spotlightVideoId[0]
        : routeParams.spotlightVideoId ?? "",
    ).trim();
    if (!routedSpotlightVideoId || spotlightRouteAppliedRef.current === routedSpotlightVideoId) return;
    if (videosLoading) return;

    const routedVideo = creatorVideos.find((video) => video.id === routedSpotlightVideoId) ?? null;
    spotlightRouteAppliedRef.current = routedSpotlightVideoId;
    setActiveStudioTab("content");
    setContentStatusFilter("all");

    if (!routedVideo) {
      setVideoNotice("Feature request could not find that creator video in your Content library.");
      router.setParams({ spotlightVideoId: "" });
      return;
    }

    void publishSpotlightVideo(routedVideo).finally(() => {
      router.setParams({ spotlightVideoId: "" });
    });
  }, [creatorVideos, publishSpotlightVideo, routeParams.spotlightVideoId, router, videosLoading]);

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
      setBrandNotice("Platform media saved as draft. Use Preview Brand Draft now; Publish Changes applies eligible safe media publicly.");
    } catch {
      setBrandNotice("Unable to choose or save that Platform media right now.");
    } finally {
      setBrandBusyAssetType(null);
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
    const paidOffer = paidVideoOfferByVideoId.get(video.id);
    setVideoEditor({
      editingVideoId: video.id,
      title: video.title,
      description: video.description,
      visibility: video.visibility,
      accessMode: paidOffer?.isPaid && (paidOffer.status === "sandbox" || paidOffer.status === "active") ? "paid" : "free",
      priceDollars: paidOffer?.priceCents ? formatCentsAsDollarInput(paidOffer.priceCents) : "0.99",
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

      let savedVideoId = videoEditor.editingVideoId ?? "";
      if (videoEditor.editingVideoId) {
        const updatedVideo = await updateCreatorVideoMetadata(videoEditor.editingVideoId, {
          title: videoEditor.title,
          description: videoEditor.description,
          visibility: videoEditor.visibility,
        });
        savedVideoId = updatedVideo.id;
        setVideoNotice("Creator video updated.");
      } else {
        const uploadedVideo = await uploadCreatorVideo({
          file: fileToUpload!,
          title: videoEditor.title,
          description: videoEditor.description,
          visibility: videoEditor.visibility,
          maxUploadSizeMb,
        });
        savedVideoId = uploadedVideo.id;
        setVideoNotice(`Creator video uploaded: ${uploadedVideo.title}.`);
      }

      if (savedVideoId) {
        const paidVideoPriceCents = parseDollarInputToCents(videoEditor.priceDollars);
        const paidVideoEnabled = videoEditor.accessMode === "paid";
        if (paidVideoEnabled && paidVideoPriceCents !== 99) {
          setVideoNotice("Video saved. The current Paid Video sandbox catalog supports the exact $0.99 tier only.");
        } else {
          const result = await savePaidVideoOffer({
            videoId: savedVideoId,
            isPaid: paidVideoEnabled,
            priceCents: paidVideoPriceCents,
            currency: "usd",
          });
          const status = String((result as Record<string, unknown> | null)?.status ?? "");
          const reason = String((result as Record<string, unknown> | null)?.reason ?? "");
          if (status === "blocked") {
            setVideoNotice(`Video saved. Paid video setup is blocked: ${reason || "provider not ready"}.`);
          } else if (paidVideoEnabled) {
            await saveCreatorSetupConfig({
              displayName: "Sandbox Paid Video",
              metadata: {
                setup_surface: "content_video_editor",
              },
              productKey: "paid_content_access_sandbox_099",
              sourceId: savedVideoId,
              sourceType: "paid_content",
            });
            setVideoNotice(`Video saved as a sandbox paid video at ${formatMonetizationCurrency(paidVideoPriceCents, "usd")}.`);
          }
        }
      }

      await loadCreatorVideos();
      await refreshPaidVideos();
      resetVideoEditor(videoEditor.editingVideoId ? "idle" : "succeeded");
    } catch (error) {
      logCreatorVideoUploadUi("submit_failed", {
        message: error instanceof Error ? error.message : "unknown",
      });
      setVideoLifecycleState("failed");
      setVideoNotice(
        formatCreatorVideoUiError(
          error,
          formatCreatorSetupError(error, "Unable to save creator video right now. Try again in a moment."),
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

  const runVideoVisibilityUpdate = async (
    video: CreatorVideo,
    targetVisibility?: CreatorContentActionSheetVisibilityAction,
  ) => {
    const nextVisibility = targetVisibility ?? (video.visibility === "public" ? "draft" : "public");
    try {
      setVideoSaving(true);
      setVideoNotice(
        nextVisibility === "public"
          ? "Publishing video..."
          : nextVisibility === "circle"
            ? "Making video private to Chi'lly Circle..."
            : "Moving video to draft...",
      );
      await updateCreatorVideoMetadata(video.id, { visibility: nextVisibility });
      await loadCreatorVideos();
      setSelectedContentActionVideo(null);
      setVideoNotice(
        nextVisibility === "public"
          ? "Public on your Platform. Eligible for followers, Chi'lly Circle members, Explore, and Home only where backed by discovery rules. It is not posted to everybody's Profile feed."
          : nextVisibility === "circle"
            ? "Private to your Chi'lly Circle. Circle members can see it where Circle content is backed. It is not public discovery."
            : "Saved as Draft. Only you can see it in Platform Studio.",
      );
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
      `Publish "${video.title}" to your public Platform? Public videos can appear on your Platform and open in Player where discovery rules allow.`,
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

  const onSetContentActionVisibility = (
    video: CreatorVideo,
    visibility: CreatorContentActionSheetVisibilityAction,
  ) => {
    void runVideoVisibilityUpdate(video, visibility);
  };

  const onSetContentActionVipAccess = async (video: CreatorVideo, required: boolean) => {
    setSelectedContentActionVideo(null);
    setVideoSaving(true);
    setVideoNotice(null);
    try {
      await setCreatorVideoVipAccess(video.id, required);
      await loadCreatorVideos();
      setVideoNotice(required ? "Added to the VIP shelf. Per-video paid unlock was disabled for this video." : "Removed from the VIP shelf.");
    } catch (error) {
      setVideoNotice(error instanceof Error ? error.message : "VIP video access could not be updated.");
    } finally {
      setVideoSaving(false);
    }
  };

  const onSetContentActionPrice = (video: CreatorVideo) => {
    setSelectedContentActionVideo(null);
    router.push({
      ...CREATOR_MONEY_ROUTE_TARGETS.paidVideo.ownerTarget,
      params: {
        ...CREATOR_MONEY_ROUTE_TARGETS.paidVideo.ownerTarget.params,
        videoId: video.id,
      },
    } as unknown as Parameters<typeof router.push>[0]);
  };

  const onCreateEventFromVideo = (video: CreatorVideo) => {
    setSelectedContentActionVideo(null);
    openStudioTab("live", { focus: "schedule" });
    setEventEditor({
      ...createEmptyEventEditorState(),
      eventTitle: `${video.title} Live Event`,
      eventType: "watch_party_live",
      status: "draft",
      linkedTitleId: "",
    });
    setEventNotice("Event draft prefilled from creator content. Confirm event type, start/end time, visibility, and access before saving.");
  };

  const onShareContentActionVideo = async (video: CreatorVideo) => {
    if (!isCreatorVideoPubliclyShareable(video)) {
      setVideoNotice("Only public, shareable creator videos can be shared.");
      return;
    }
    try {
      await Share.share({
        message: `Watch ${video.title} on Chi'llywood: ${buildCreatorVideoDeepLink(video.id)}`,
      });
      setSelectedContentActionVideo(null);
    } catch {
      setVideoNotice("Unable to open sharing right now.");
    }
  };

  const onFeatureContentActionVideo = (video: CreatorVideo) => {
    setSelectedContentActionVideo(null);
    void publishSpotlightVideo(video);
  };

  const updateReplayVisibility = async (replay: CreatorReplayLibraryItem, visibility: CreatorReplayVisibility) => {
    try {
      setVideoSaving(true);
      setVideoNotice(
        visibility === "public"
          ? "Making replay public..."
          : visibility === "circle"
            ? "Making replay private to Chi'lly Circle..."
            : "Moving replay to Draft...",
      );
      await updateCreatorReplayLibraryItem(replay.id, { visibility });
      if (user?.id) setCreatorReplays(await readCreatorReplayLibraryItems(String(user.id)));
      setVideoNotice(
        visibility === "public"
          ? "Public on your Platform. Eligible for Home and Explore only when ready, clean, and rights-safe."
          : visibility === "circle"
            ? "Private to your Chi'lly Circle. Circle members can see it where Circle content is backed. It is not public discovery."
            : "Saved as Draft. Only you can see it in Platform Studio.",
      );
    } catch (error) {
      setVideoNotice(error instanceof Error ? error.message : "Unable to update replay visibility right now.");
    } finally {
      setVideoSaving(false);
    }
  };

  const deleteReplay = (replay: CreatorReplayLibraryItem) => {
    Alert.alert(
      "Delete Replay",
      `Remove "${replay.title}" from Content Library?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                setVideoSaving(true);
                await updateCreatorReplayLibraryItem(replay.id, { saveStatus: "deleted" });
                if (user?.id) setCreatorReplays(await readCreatorReplayLibraryItems(String(user.id)));
                setVideoNotice("Replay deleted from Content Library.");
              } catch (error) {
                setVideoNotice(error instanceof Error ? error.message : "Unable to delete replay right now.");
              } finally {
                setVideoSaving(false);
              }
            })();
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
                setSelectedContentActionVideo(null);
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
        setEventNotice(getUserFacingErrorMessage(result.error, "Unable to save creator event right now."));
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

  const onSavePaidEventOffer = async (event: CreatorEventSummary) => {
    if (paidEventSavingId) return;
    setPaidEventSavingId(event.id);
    setEventNotice(null);
    try {
      const saved = await savePaidCreatorEventOffer({
        creatorEventId: event.id,
        description: "Sandbox paid creator event pass.",
        priceCents: 99,
        capacityLimit: null,
        status: "sandbox",
      });
      await saveCreatorSetupConfig({
        displayName: "Sandbox Event Pass",
        metadata: {
          event_offer_id: saved.id,
          setup_surface: "live_event_editor",
        },
        productKey: "event_pass_sandbox_099",
        sourceId: event.id,
        sourceType: "event",
      });
      trackEvent("money_offer_created", {
        creator_id: user?.id ?? null,
        feature_key: "paid_events",
        offer_type: "paid_event",
        price_bucket: formatMonetizationCurrency(saved.priceCents, saved.currency),
        route_name: "channel-studio",
        source_surface: "live_events",
      });
      await refreshPaidEvents();
      setEventNotice(`Paid Event saved in sandbox mode. Fans can buy an Event Pass only through verified ${storeProviderPair} checkout.`);
    } catch (error) {
      setEventNotice(formatCreatorSetupError(error, "Unable to save Paid Event settings right now."));
    } finally {
      setPaidEventSavingId(null);
    }
  };

  const onSave = async () => {
    if (!profile) return;

    try {
      setSaving(true);
      await saveCurrentProfileSettings();
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
          body: "Create and manage Platform videos through Clip Studio.",
        },
        {
          title: "Featured Video",
          status: "current",
          body: "Choose a published upload as the public Platform spotlight.",
        },
        {
          title: "Playlists / Shelves",
          status: "near_term",
          body: "Opens a status path until playlist or shelf backing exists.",
        },
      ],
    },
    {
      title: "Monetization",
      body: "Money Center keeps creator earnings, offers, transactions, payouts, tax/legal, and provider readiness in one place.",
      sections: [
        {
          title: "Ways to Earn",
          status: "current",
          body: "Tips, paid videos, paid Watch-Parties, Channel Subscriptions, VIP passes, and paid events stay together.",
        },
        {
          title: "Offers and Transactions",
          status: "current",
          body: "Creator offers and transaction history are consolidated instead of split by feature.",
        },
        {
          title: "Payouts, Tax & Legal, Provider Status",
          status: "near_term",
          body: "Payout setup, tax/legal requirements, and sanitized provider readiness live only in Money Center.",
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
          body: "Opens active status and draft controls for hero, avatar, accent, and brand treatment.",
        },
      ],
    },
    {
      title: "Live & Events",
      body: "Room defaults, creator events, and scheduling status.",
      sections: [
        {
          title: "Access Defaults",
          status: "current",
          body: "Room defaults and creator access.",
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
      body: "Only available summaries appear here; assistant-style help stays later.",
      sections: [
        {
          title: "Analytics",
          status: "current",
          body: "Backed room, event, and audience signals.",
        },
        {
          title: "Platform IQ / Rachi Platform Studio Assistant",
          status: "later_phase",
          body: "Status path only; no assistant implementation is exposed as a dead control.",
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
      label: "Seat Pass Rooms",
      value: !resolvedCreatorPermissions
        ? "Loading"
        : resolvedCreatorPermissions.canUsePartyPassRooms
          ? "Ready"
          : "Open Only",
      body: !resolvedCreatorPermissions
        ? "checking whether Seat Pass room defaults are available"
        : resolvedCreatorPermissions.canUsePartyPassRooms
          ? "Seat Pass room defaults can stay active on this route"
          : "Seat Pass defaults fall back to open until the creator grant is enabled",
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
      body: "Real Platform follower relationships.",
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
      body: "Blocked audience entries are supported for this Platform.",
    },
  ];
  const audienceVisibilityCards: readonly SummaryMetricCard[] = [
    {
      label: "Public Activity",
      value: formatPublicActivityVisibility(audienceSummary?.publicActivityVisibility ?? null),
      body: "Audience visibility comes from this Platform profile.",
    },
    {
      label: "Follower Surface",
      value: formatVisibilitySurface(audienceSummary?.followerSurfaceEnabled ?? null),
      body: "Shows whether follower visibility can appear on this Platform.",
    },
    {
      label: "Subscriber Surface",
      value: formatVisibilitySurface(audienceSummary?.subscriberSurfaceEnabled ?? null),
      body: "Shows whether subscriber visibility can appear on this Platform.",
    },
  ];
  const audienceUnavailableCards: readonly SummaryMetricCard[] = [
    {
      label: "VIP / Mod / Co-Host",
      value: "Later",
      body: "Audience-role roster status is active here; moderation/admin authority stays in the scoped staff surfaces.",
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
        : "No future scheduled event is available yet.",
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
        ? "Replay is available for ended events currently open for viewing."
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
  const brandKitReady = !!(platformBranding?.avatar || platformBranding?.logo);
  const brandStudioAssets = (platformBranding?.assets ?? []).filter((asset) => (
    !asset.deletedAt
    && asset.assetState !== "archived"
    && ["hero_image", "background_image", "avatar", "logo"].includes(asset.assetType)
  ));
  const brandCheckingCount = brandStudioAssets.filter((asset) => asset.scanStatus === "pending_scan" || asset.scanStatus === "scanning").length;
  const brandBlockedCount = brandStudioAssets.filter((asset) => asset.scanStatus === "malware_detected" || asset.scanStatus === "scan_failed" || asset.scanStatus === "quarantined").length;
  const brandReadyToPublishCount = brandStudioAssets.filter((asset) => (
    asset.assetState === "draft"
    && (asset.moderationStatus === "pending_review" || ["clean", "reported"].includes(asset.moderationStatus))
    && asset.scanStatus === "clean"
  )).length;
  const brandPublished = !!activeBrandProfile?.publishedAt;
  const brandStatusLabel = brandBlockedCount
    ? "Blocked"
    : brandCheckingCount
      ? "Checking"
      : brandReadyToPublishCount
        ? "Ready to publish"
        : brandPublished ? "Published" : "Draft changes";
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
  const circleVideoCount = creatorVideos.filter((video) => video.visibility === "circle").length;
  const draftVideoCount = creatorVideos.filter((video) => video.visibility === "draft").length;
  const replayCount = creatorReplays.length;
  const processingReplayCount = creatorReplays.filter((replay) => (
    replay.saveStatus === "processing_replay"
    || replay.saveStatus === "recording_active"
    || replay.saveStatus === "recording_stopping"
    || replay.saveStatus === "requested"
  )).length;
  const needsAttentionReplayCount = creatorReplays.filter((replay) => (
    replay.saveStatus === "failed" || replay.saveStatus === "recording_not_started" || replay.moderationStatus === "hidden"
  )).length;
  const latestCreatorVideo = useMemo(
    () => [...creatorVideos].sort((a, b) => getCreatorVideoCreatedTimestamp(b) - getCreatorVideoCreatedTimestamp(a))[0] ?? null,
    [creatorVideos],
  );
  const paidVideoOfferByVideoId = useMemo(() => {
    const map = new Map<string, CreatorPaidVideoOffer>();
    creatorPaidVideoOffers.forEach((offer) => {
      if (offer.videoId) map.set(offer.videoId, offer);
    });
    return map;
  }, [creatorPaidVideoOffers]);
  const paidEventOfferByCreatorEventId = useMemo(() => {
    const map = new Map<string, PaidCreatorEventOffer>();
    creatorPaidEventOffers.forEach((offer) => {
      if (offer.creatorEventId) map.set(offer.creatorEventId, offer);
    });
    return map;
  }, [creatorPaidEventOffers]);
  const filteredCreatorVideos = useMemo(() => {
    const query = contentSearchQuery.trim().toLowerCase();
    return creatorVideos
      .filter((video) => {
        if (contentStatusFilter === "published" && video.visibility !== "public") return false;
        if (contentStatusFilter === "circle" && video.visibility !== "circle") return false;
        if (contentStatusFilter === "drafts" && video.visibility !== "draft") return false;
        if (contentStatusFilter === "replays" || contentStatusFilter === "processing" || contentStatusFilter === "needs_attention" || contentStatusFilter === "events") return false;
        if (contentStatusFilter === "paid" && !paidVideoOfferByVideoId.get(video.id)?.isPaid) return false;
        if (!query) return true;
        return `${video.title} ${video.description}`.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        const diff = getCreatorVideoCreatedTimestamp(a) - getCreatorVideoCreatedTimestamp(b);
        return contentSort === "oldest" ? diff : -diff;
      });
  }, [contentSearchQuery, contentSort, contentStatusFilter, creatorVideos, paidVideoOfferByVideoId]);
  const filteredCreatorReplays = useMemo(() => {
    const query = contentSearchQuery.trim().toLowerCase();
    return creatorReplays
      .filter((replay) => {
        if (contentStatusFilter === "uploads" || contentStatusFilter === "events" || contentStatusFilter === "paid") return false;
        if (contentStatusFilter === "published" && replay.visibility !== "public") return false;
        if (contentStatusFilter === "circle" && replay.visibility !== "circle") return false;
        if (contentStatusFilter === "drafts" && replay.visibility !== "draft") return false;
        if (contentStatusFilter === "processing" && !["requested", "recording_active", "recording_stopping", "processing_replay"].includes(replay.saveStatus)) return false;
        if (contentStatusFilter === "needs_attention" && !["failed", "recording_not_started"].includes(replay.saveStatus) && replay.moderationStatus !== "hidden") return false;
        if (!query) return true;
        return `${replay.title} ${replay.description ?? ""}`.toLowerCase().includes(query);
      })
      .sort((a, b) => {
        const aTime = new Date(a.createdAt || a.updatedAt).getTime();
        const bTime = new Date(b.createdAt || b.updatedAt).getTime();
        const diff = (Number.isFinite(aTime) ? aTime : 0) - (Number.isFinite(bTime) ? bTime : 0);
        return contentSort === "oldest" ? diff : -diff;
      });
  }, [contentSearchQuery, contentSort, contentStatusFilter, creatorReplays]);
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
      label: "Circle",
      value: videosLoading ? "..." : String(circleVideoCount),
      body: circleVideoCount ? "Private to Chi'lly Circle" : "No Circle-private videos",
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
    {
      label: "Chi'lly Circle",
      value: videosLoading ? "..." : String(circleVideoCount),
      body: "Circle-private videos loaded for this Platform Studio.",
    },
    ...(audienceFollowerCount == null ? [] : [{
      label: "Followers",
      value: String(audienceFollowerCount),
      body: "Backed Platform follower relationships.",
    }]),
    ...(pendingAudienceRequestCount == null ? [] : [{
      label: "Audience Requests",
      value: String(pendingAudienceRequestCount),
      body: "Pending audience requests.",
    }]),
    ...(blockedAudienceCount == null ? [] : [{
      label: "Blocked Users",
      value: String(blockedAudienceCount),
      body: "Blocked audience entries for this Platform.",
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
    const query = contentSearchQuery.trim().toLowerCase();
    const sortedVideos = [...creatorVideos]
      .filter((video) => !query || `${video.title} ${video.description}`.toLowerCase().includes(query))
      .sort((a, b) => {
        const diff = getCreatorVideoCreatedTimestamp(a) - getCreatorVideoCreatedTimestamp(b);
        return contentSort === "oldest" ? diff : -diff;
      });
    const featuredVideos = activeBrandProfile?.spotlightVideoId
      ? sortedVideos.filter((video) => video.id === activeBrandProfile.spotlightVideoId)
      : [];
    const publishedVideos = sortedVideos.filter((video) => video.visibility === "public");
    const draftVideos = sortedVideos.filter((video) => video.visibility === "draft");
    const circleVideos = sortedVideos.filter((video) => video.visibility === "circle");
    const vipVideos = sortedVideos.filter((video) => video.vipAccessRequired);
    const paidVideos = sortedVideos.filter((video) => {
      const offer = paidVideoOfferByVideoId.get(video.id);
      return !!offer?.isPaid && (offer.status === "sandbox" || offer.status === "active");
    });
    const needsAttentionVideos = sortedVideos.filter((video) => (
      ["hidden", "removed", "banned"].includes(video.moderationStatus)
      || video.renditionStatuses.some((rendition) => rendition.status === "failed")
    ));
    const searchedReplays = creatorReplays.filter((replay) => (
      !query || `${replay.title} ${replay.description ?? ""}`.toLowerCase().includes(query)
    ));
    const processingReplays = searchedReplays.filter((replay) => (
      ["requested", "recording_active", "recording_stopping", "processing_replay"].includes(replay.saveStatus)
    ));
    const attentionReplays = searchedReplays.filter((replay) => (
      ["failed", "recording_not_started"].includes(replay.saveStatus) || replay.moderationStatus === "hidden"
    ));
    const searchedEvents = creatorEvents.filter((event) => (
      !query || `${event.eventTitle} ${formatEventTypeLabel(event.eventType)}`.toLowerCase().includes(query)
    ));
    const videoShelves = [
      { key: "recent", title: "Recent Uploads", items: sortedVideos },
      { key: "featured", title: "Featured", items: featuredVideos },
      { key: "published", title: "Published", items: publishedVideos },
      { key: "drafts", title: "Drafts", items: draftVideos },
      { key: "paid", title: "Paid Videos", items: paidVideos },
      { key: "vip", title: "VIP", items: vipVideos },
      { key: "circle", title: "Chi'lly Circle", items: circleVideos },
      { key: "attention", title: "Needs Attention", items: needsAttentionVideos },
    ].filter((shelf) => shelf.items.length > 0);
    const totalContentItems = creatorVideos.length + creatorReplays.length + creatorEvents.length;
    const hasVisibleRows = videoShelves.length > 0 || searchedReplays.length > 0 || searchedEvents.length > 0;

    const renderOwnedContentTile = (video: CreatorVideo) => (
      <View key={video.id} style={styles.contentShelfCard}>
        <CreatorVideoCard
          video={video}
          mode="owner"
          clipEdit={creatorVideoClipEdits[video.id] ?? null}
          featured={activeBrandProfile?.spotlightVideoId === video.id}
          accessLabel={(() => {
            const offer = paidVideoOfferByVideoId.get(video.id);
            return offer?.isPaid && (offer.status === "sandbox" || offer.status === "active") ? "Paid Video" : null;
          })()}
          busy={videoSaving || brandSaving}
          onOpen={() => router.push({ pathname: "/player/[id]", params: { id: video.id, source: "creator-video" } })}
          onEdit={() => openClipStudioForVideo(video)}
          onEditClip={() => openClipStudioForVideo(video)}
          onSetFeatured={() => { void publishSpotlightVideo(video); }}
          onClearFeatured={() => { void publishSpotlightVideo(null); }}
          onToggleVisibility={() => onToggleVideoVisibility(video)}
          onDelete={() => onDeleteVideo(video)}
          onOpenActions={() => setSelectedContentActionVideo(video)}
        />
      </View>
    );

    const openReplayVisibility = (replay: CreatorReplayLibraryItem) => {
      Alert.alert(
        "Replay visibility",
        "Choose where this replay belongs.",
        [
          { text: "Draft", onPress: () => { void updateReplayVisibility(replay, "draft"); } },
          { text: "Chi'lly Circle", onPress: () => { void updateReplayVisibility(replay, "circle"); } },
          { text: "Public", onPress: () => { if (replay.saveStatus === "ready") void updateReplayVisibility(replay, "public"); } },
        ],
      );
    };

    const openReplayActions = (replay: CreatorReplayLibraryItem) => {
      Alert.alert(
        replay.title,
        `${formatCreatorReplayVisibilityLabel(replay.visibility)} · ${formatCreatorReplayStatusLabel(replay.saveStatus)}`,
        [
          {
            text: replay.saveStatus === "ready" ? "Open" : "View State",
            onPress: () => router.push({ pathname: "/player/replay/[replayId]", params: { replayId: replay.id } } as unknown as Parameters<typeof router.push>[0]),
          },
          { text: "Visibility", onPress: () => openReplayVisibility(replay) },
          { text: "Delete", style: "destructive", onPress: () => deleteReplay(replay) },
        ],
      );
    };

    const renderReplayShelf = (title: string, rows: CreatorReplayLibraryItem[]) => {
      if (!rows.length) return null;
      return (
        <View style={styles.contentShelf}>
          <View style={styles.contentShelfHeader}>
            <Text style={styles.contentShelfTitle}>{title}</Text>
            <Text style={styles.contentShelfCount}>{rows.length}</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contentShelfRow}>
            {rows.map((replay) => (
              <TouchableOpacity
                key={replay.id}
                style={styles.contentReplayCard}
                activeOpacity={0.88}
                onPress={() => openReplayActions(replay)}
                accessibilityRole="button"
                accessibilityLabel={`Manage replay ${replay.title}`}
              >
                <View style={styles.contentReplayPoster}>
                  <Text style={styles.contentReplayKicker}>REPLAY</Text>
                  <Text style={styles.contentReplayTitle} numberOfLines={3}>{replay.title}</Text>
                  <View style={styles.contentReplayBottom}>
                    <Text style={styles.contentReplayMeta} numberOfLines={1}>{formatCreatorReplayVisibilityLabel(replay.visibility)}</Text>
                    <Text style={styles.contentReplayMeta} numberOfLines={1}>{formatCreatorReplayStatusLabel(replay.saveStatus)}</Text>
                  </View>
                </View>
                <View style={styles.contentShelfOverflow}><Text style={styles.contentShelfOverflowText}>•••</Text></View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      );
    };

    return (
      <View style={[styles.panel, styles.creatorContentPanel]}>
        <View style={styles.panelHeader}>
          <View style={styles.panelHeaderCopy}>
            <Text style={styles.panelTitle}>Content</Text>
            <Text style={styles.panelSubtitle}>A clean library of your uploads, drafts, paid videos, Circle media, replays, and events.</Text>
          </View>
          <AppActionButton
            accessibilityLabel="Add Video to Content Library"
            label="Add Video"
            onPress={openClipStudioForNew}
            testID="content-library-add-video-button"
            variant="primary"
          />
        </View>

        {videoNotice ? <View style={styles.noticeCard}><Text style={styles.noticeText}>{videoNotice}</Text></View> : null}

        <View style={styles.contentLibraryStatsRow}>
          {[
            `All ${totalContentItems}`,
            `Published ${publishedVideoCount}`,
            `Drafts ${draftVideoCount}`,
            `Paid ${paidVideos.length}`,
            `Circle ${circleVideoCount}`,
            `Replays ${replayCount}`,
          ].map((label) => (
            <View key={label} style={styles.contentLibraryStatPill}><Text style={styles.contentLibraryStatText}>{label}</Text></View>
          ))}
        </View>

        <TextInput
          style={[styles.input, styles.contentSearchInput]}
          placeholder="Search your content"
          placeholderTextColor="#8d8d8d"
          value={contentSearchQuery}
          onChangeText={setContentSearchQuery}
          autoCapitalize="none"
        />

        {videosLoading ? (
          <View style={styles.loadingCard}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.loadingText}>Loading content...</Text>
          </View>
        ) : videosLoadError ? (
          <AppEmptyState actionLabel="Retry" body={videosLoadError} onAction={() => { void loadCreatorVideos(); }} title="Content couldn't refresh" />
        ) : hasVisibleRows ? (
          <>
            {videoShelves.map((shelf) => (
              <View key={shelf.key} style={styles.contentShelf} testID={`content-shelf-${shelf.key}`}>
                <View style={styles.contentShelfHeader}>
                  <Text style={styles.contentShelfTitle}>{shelf.title}</Text>
                  <Text style={styles.contentShelfCount}>{shelf.items.length}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contentShelfRow}>
                  {shelf.items.map(renderOwnedContentTile)}
                </ScrollView>
              </View>
            ))}

            {renderReplayShelf("Replays", searchedReplays)}
            {processingReplays.length !== searchedReplays.length ? renderReplayShelf("Processing", processingReplays) : null}
            {attentionReplays.length ? renderReplayShelf("Replay Needs Attention", attentionReplays) : null}

            {searchedEvents.length ? (
              <View style={styles.contentShelf} testID="content-shelf-events">
                <View style={styles.contentShelfHeader}>
                  <Text style={styles.contentShelfTitle}>Events</Text>
                  <Text style={styles.contentShelfCount}>{searchedEvents.length}</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.contentShelfRow}>
                  {searchedEvents.map((event) => (
                    <TouchableOpacity
                      key={event.id}
                      style={styles.contentEventCard}
                      activeOpacity={0.88}
                      onPress={() => router.push(`/event/${event.id}`)}
                    >
                      <Text style={styles.contentReplayKicker}>{formatEventStatusLabel(event.status).toUpperCase()}</Text>
                      <Text style={styles.contentReplayTitle} numberOfLines={3}>{event.eventTitle}</Text>
                      <View style={styles.contentReplayBottom}>
                        <Text style={styles.contentReplayMeta} numberOfLines={1}>{formatEventTypeLabel(event.eventType)}</Text>
                        <Text style={styles.contentReplayMeta} numberOfLines={1}>{formatIsoDate(event.startsAt)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}
          </>
        ) : (
          <AppEmptyState title={query ? "No matching content" : "No content yet"} body={query ? "Try another search." : "Open Clip Studio to add your first Platform video."} />
        )}

        <View style={styles.contentCreateFooter}>
          <View style={styles.studioActionRowCopy}>
            <Text style={styles.studioActionRowTitle}>Create something new</Text>
            <Text style={styles.studioActionRowBody}>Clip Studio handles video, cover, title card, draft, and publish.</Text>
          </View>
          <AppActionButton label="Open Clip Studio" onPress={openClipStudioForNew} />
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


        <View style={styles.studioAccordionStack}>
          {renderClipAccordion({
            id: "media",
            title: "Video",
            summary: "Choose or replace the full video source.",
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
                    testID="clip-studio-choose-full-video-button"
                    accessibilityRole="button"
                    accessibilityLabel={selectedClipVideoFile || hasSavedVideo ? "Replace Video" : "Choose Full Video"}
                  >
                    <Text style={styles.studioActionButtonText}>{selectedClipVideoFile || hasSavedVideo ? "Replace Video" : "Choose Full Video"}</Text>
                    <Text style={styles.studioActionButtonCopy}>Up to {CREATOR_VIDEO_MAX_RUNTIME_LABEL}</Text>
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
                  {selectedClipVideoFile?.name || (hasSavedVideo ? "Using the saved creator video." : "Choose an MP4, MOV, WebM, or M4V video to start a draft.")}
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
                {coverPreviewUri ? (
                  <>
                    <View style={styles.studioHeaderActions}>
                      <TouchableOpacity
                        style={[styles.studioActionButton, styles.studioActionButtonPrimary, clipSaving && styles.studioActionButtonDisabled]}
                        activeOpacity={0.86}
                        onPress={onPickClipCoverFile}
                        disabled={clipSaving}
                      >
                        <Text style={styles.studioActionButtonText}>Change Cover</Text>
                        <Text style={styles.studioActionButtonCopy}>Open image picker</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.studioActionButton, styles.studioActionButtonDanger, clipSaving && styles.studioActionButtonDisabled]}
                        activeOpacity={0.86}
                        onPress={onRemoveClipCoverFile}
                        disabled={clipSaving}
                      >
                        <Text style={styles.studioActionButtonText}>Remove Cover</Text>
                        <Text style={styles.studioActionButtonCopy}>Use fallback art</Text>
                      </TouchableOpacity>
                    </View>
                    <Image source={{ uri: coverPreviewUri }} style={styles.clipCoverPreview} resizeMode="cover" />
                  </>
                ) : (
                  <View style={styles.eventEmptyCard}>
                    <Text style={styles.eventEmptyTitle}>No cover selected</Text>
                    <Text style={styles.eventEmptyBody}>
                      Upload a JPG, PNG, or WebP image. Frame picking from video is deferred until real extraction support exists.
                    </Text>
                    <TouchableOpacity
                      style={styles.eventSecondaryButton}
                      activeOpacity={0.86}
                      onPress={onPickClipCoverFile}
                      disabled={clipSaving}
                    >
                      <Text style={styles.eventSecondaryButtonText}>Choose Cover Image</Text>
                    </TouchableOpacity>
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
            summary: "Advanced editor tools stay locked until they are available.",
            status: "Locked",
            statusTone: "muted",
            children: (
              <View style={styles.roadmapList}>
                <Text style={styles.roadmapItem}>Multi-clip timeline, split clip, transitions, beat sync, auto captions, AI cut, green screen, effects, stickers, and full export rendering open status paths in this MVP.</Text>
                <Text style={styles.roadmapItem}>Trim/export status stays visible until the backed editor path is active.</Text>
                <Text style={styles.roadmapItem}>Poster frame extraction status stays visible until the backed extraction path is active.</Text>
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
          style={styles.studioActionButton}
          activeOpacity={0.86}
          onPress={() => showStudioUnavailable("Preview status", "Sign in and load a profile before previewing the public Platform. This control is active and reports the missing profile context.")}
          testID="brand-preview-public-platform-button"
          accessibilityLabel="Preview Public Platform"
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
        testID="brand-preview-public-platform-button"
        accessibilityLabel="Preview Public Platform"
      >
        <Text style={styles.studioActionButtonText}>Preview Platform</Text>
        <Text style={styles.studioActionButtonCopy}>Reviewed public view</Text>
      </TouchableOpacity>
    );
  };

  const openDraftBrandPreview = () => {
    const previewUserId = String(user?.id ?? "").trim();
    if (!previewUserId) {
      showStudioUnavailable("Draft preview unavailable", "Sign in with a profile before previewing Brand Studio changes.");
      return;
    }
    router.push({
      pathname: "/channel/[userId]",
      params: { userId: previewUserId, preview: "brand-draft" },
    });
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
          accessibilityLabel="Open Brand Studio"
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
            testID={tab.id === "brand" ? "platform-studio-tab-brand" : undefined}
            accessibilityLabel={tab.id === "brand" ? "Open Brand Studio" : tab.label}
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
    disabled = false,
    testID,
    accessibilityLabel,
  }: {
    title: string;
    body: string;
    value?: string;
    onPress: () => void;
    tone?: "default" | "muted" | "warning";
    disabled?: boolean;
    testID?: string;
    accessibilityLabel?: string;
  }) => (
    <TouchableOpacity
      style={[
        styles.studioActionRow,
        tone === "warning" && styles.studioActionRowWarning,
        tone === "muted" && styles.studioActionRowMuted,
        disabled && styles.eventPrimaryButtonDisabled,
      ]}
      activeOpacity={0.86}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${title}. ${body}`}
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
    const showBody = isMoneyCenterSectionBodyVisible(expanded);
    return (
      <View
        style={styles.studioAccordionCard}
        testID={`money-section-${id}`}
      >
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
        {showBody ? <View style={styles.studioAccordionBody}>{children}</View> : null}
      </View>
    );
  };

  const renderBrandAccordion = ({
    id,
    title,
    summary,
    status,
    statusTone = "default",
    thumbnailAsset,
    thumbnailLabel,
    children,
  }: {
    id: BrandStudioSectionId;
    title: string;
    summary: string;
    status?: string;
    statusTone?: "default" | "muted" | "warning";
    thumbnailAsset?: PlatformBrandAsset | null;
    thumbnailLabel?: string;
    children: React.ReactNode;
  }) => {
    const expanded = activeBrandSheetSection === id;
    return (
      <View style={styles.studioAccordionCard}>
        <TouchableOpacity
          style={styles.studioAccordionHeader}
          activeOpacity={0.86}
          onPress={() => setActiveBrandSheetSection(id)}
          testID={getBrandSectionTestId(id)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          accessibilityLabel={getBrandSectionAccessibilityLabel(id, title, summary)}
        >
          <View style={styles.brandAssetThumb}>
            {thumbnailAsset?.signedUrl ? (
              <Image source={{ uri: thumbnailAsset.signedUrl }} style={styles.brandAssetThumbImage} resizeMode="cover" />
            ) : (
              <Text style={styles.brandAssetThumbText}>{thumbnailLabel ?? title.slice(0, 2).toUpperCase()}</Text>
            )}
          </View>
          <View style={styles.studioAccordionCopy}>
            <Text style={styles.studioAccordionTitle}>{title}</Text>
            <Text style={styles.studioAccordionSummary}>{summary}</Text>
          </View>
          <View style={styles.studioAccordionMeta}>
            {status ? renderStudioStatusPill(status, statusTone) : null}
            <Text style={styles.studioAccordionChevron}>{expanded ? "⌄" : "›"}</Text>
          </View>
        </TouchableOpacity>
        <Modal
          visible={expanded}
          transparent
          animationType="slide"
          onRequestClose={() => setActiveBrandSheetSection(null)}
        >
          <View style={styles.assetManagerSheetOverlay}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setActiveBrandSheetSection(null)}
            />
            <View style={styles.assetManagerSheet}>
              <View style={styles.assetManagerSheetHandle} />
              <View style={styles.assetManagerSheetHeader}>
                <View style={styles.studioAccordionCopy}>
                  <Text style={styles.assetManagerSheetTitle}>{title}</Text>
                  <Text style={styles.assetManagerSheetSummary}>{summary}</Text>
                </View>
                {status ? renderStudioStatusPill(status, statusTone) : null}
              </View>
              <ScrollView
                style={styles.assetManagerSheetScroll}
                contentContainerStyle={styles.assetManagerSheetBody}
                showsVerticalScrollIndicator={false}
              >
                {children}
              </ScrollView>
            </View>
          </View>
        </Modal>
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
    fitMode,
    overlayStrength,
    blurStrength,
  }: {
    title: string;
    asset?: PlatformBrandAsset | null;
    fallback: string;
    fitMode?: PlatformBrandFitMode | null;
    overlayStrength?: number | null;
    blurStrength?: number | null;
  }) => {
    const canShowPreview = !!asset?.signedUrl && !brandPreviewFailedAssetIds.has(asset.id);
    const previewBlurRadius = getBrandPreviewBlurRadius(blurStrength);
    return (
      <View style={styles.brandPreviewCard}>
        {canShowPreview ? (
          <View style={styles.brandPreviewMedia}>
            <Image
              source={{ uri: asset.signedUrl }}
              style={styles.brandPreviewImage}
              resizeMode={getBrandPreviewResizeMode(fitMode)}
              blurRadius={previewBlurRadius}
              onError={() => {
                if (!asset?.id) return;
                setBrandPreviewFailedAssetIds((current) => {
                  const next = new Set(current);
                  next.add(asset.id);
                  return next;
                });
              }}
            />
            {overlayStrength != null ? (
              <View
                pointerEvents="none"
                style={[
                  styles.brandPreviewOverlay,
                  { backgroundColor: getBrandPreviewOverlayColor(overlayStrength) },
                ]}
              />
            ) : null}
            <View pointerEvents="none" style={styles.brandSafeAreaFrame} />
          </View>
        ) : null}
        <View style={styles.brandPreviewCopy}>
          <Text style={styles.brandPreviewTitle}>{title}</Text>
          <Text style={styles.brandPreviewBody}>{getBrandAssetReviewCopy(asset)}</Text>
          {asset?.fileSizeBytes ? (
            <Text style={styles.brandPreviewMeta}>{formatPlatformBrandFileSize(asset.fileSizeBytes)}</Text>
          ) : null}
          {asset ? (
            <Text style={styles.brandPreviewMeta}>{formatPlatformBrandScanStatus(asset)}</Text>
          ) : null}
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
        : latestCreatorVideo.visibility === "circle"
          ? "Chi'lly Circle"
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
            <Text style={styles.latestContentFallbackText}>{"Chi'llywood"}</Text>
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
              <Text style={styles.panelSubtitle}>Only available actions show here.</Text>
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
                body: "Use the creator event form.",
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
                  : "Review Ways to Earn, Offers, Transactions, Payouts, Tax & Legal, and Provider Status.",
                value: "Open",
                tone: moneyCenterFeatureFlag.state === "locked" ? "warning" : moneyCenterFeatureFlag.state === "off" ? "muted" : "default",
                onPress: () => openStudioTab("monetization", { focus: "overview" }),
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
                body: creatorAnalyticsSummary ? "Open room, event, and audience signals." : "Insights will appear after your platform has activity.",
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
          statusTone: brandBlockedCount || brandCheckingCount ? "warning" : brandPublished || brandReadyToPublishCount ? "default" : "muted",
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
                tone: platformBranding?.heroImage && (platformBranding.heroImage.scanStatus === "pending_scan" || platformBranding.heroImage.scanStatus === "scanning" || platformBranding.heroImage.scanStatus === "malware_detected" || platformBranding.heroImage.scanStatus === "scan_failed" || platformBranding.heroImage.scanStatus === "quarantined") ? "warning" : "default",
                onPress: () => {
                  openStudioTab("brand", { focus: "hero" });
                  setActiveBrandSheetSection("hero");
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
                title: "Preview Brand Draft",
                body: "Owner-only preview with saved Brand Studio media before public publish.",
                value: "Draft",
                tone: brandBlockedCount || brandCheckingCount ? "warning" : "default",
                testID: "brand-home-preview-draft-platform-button",
                accessibilityLabel: "Preview Brand Draft",
                onPress: openDraftBrandPreview,
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
              <Text style={styles.panelSubtitle}>Design your public Platform.</Text>
              <View style={styles.previewChipRow}>
                {renderStudioStatusPill(brandStatusLabel, brandBlockedCount || brandCheckingCount ? "warning" : brandPublished || brandReadyToPublishCount ? "default" : "muted")}
                {renderStudioStatusPill(`${formatBrandThemeLabel(draft?.themePreset)}`, "muted")}
              </View>
            </View>
          </View>
          <View style={styles.brandStudioIdentityRow}>
            {platformBranding?.avatar?.signedUrl ? (
              <Image source={{ uri: platformBranding.avatar.signedUrl }} style={styles.channelAvatarImage} />
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
            {renderPreviewChannelAction()}
            <TouchableOpacity
              style={styles.studioActionButton}
              activeOpacity={0.86}
              onPress={openDraftBrandPreview}
              testID="brand-preview-draft-platform-button"
              accessibilityLabel="Preview Brand Draft"
            >
              <Text style={styles.studioActionButtonText}>Preview Brand Draft</Text>
              <Text style={styles.studioActionButtonCopy}>Owner-only saved draft view</Text>
            </TouchableOpacity>
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
            summary: platformBranding?.heroImage ? "Adjust image framing and overlay." : "Choose a public Platform hero image.",
            status: brandHeroStatus,
            statusTone: platformBranding?.heroImage && (platformBranding.heroImage.scanStatus === "pending_scan" || platformBranding.heroImage.scanStatus === "scanning" || platformBranding.heroImage.scanStatus === "malware_detected" || platformBranding.heroImage.scanStatus === "scan_failed" || platformBranding.heroImage.scanStatus === "quarantined") ? "warning" : platformBranding?.heroImage ? "default" : "muted",
            thumbnailAsset: platformBranding?.heroImage,
            thumbnailLabel: "Hero",
            children: (
              <>
                <View style={styles.brandButtonRow}>
                  <TouchableOpacity
                    style={[styles.eventPrimaryButton, heroBusy && styles.eventPrimaryButtonDisabled]}
                    activeOpacity={0.88}
                    disabled={heroBusy || brandSaving}
                    onPress={() => pickPlatformBrandAsset("hero_image")}
                    testID="brand-hero-choose-image-button"
                    accessibilityLabel="Choose Brand Studio Hero Image"
                  >
                    {brandBusyAssetType === "hero_image"
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.eventPrimaryButtonText}>{platformBranding?.heroImage ? "Change Image" : "Choose Image"}</Text>}
                  </TouchableOpacity>
                  <Text style={styles.permissionCopy}>
                    Hero Reel not available yet. Use Hero Image or a public Spotlight upload for now.
                  </Text>
                </View>
                {platformBranding?.heroImage ? (
                  <>
                    {renderBrandAssetPreview({
                      title: "Adjust Hero Image",
                      asset: platformBranding.heroImage,
                      fallback: "HERO MEDIA",
                      fitMode: draft?.heroFitMode,
                      overlayStrength: draft?.overlayStrength,
                    })}
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
                    <View style={styles.brandButtonRow}>
                      <TouchableOpacity
                        style={[styles.eventPrimaryButton, brandSaving && styles.eventPrimaryButtonDisabled]}
                        activeOpacity={0.88}
                        disabled={brandSaving}
                        onPress={() => void saveBrandDraftPatch()}
                        testID="brand-save-draft-button"
                        accessibilityLabel="Save Brand Studio Draft"
                        hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
                      >
                        <Text style={styles.eventPrimaryButtonText}>Save Draft</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.eventSecondaryButton}
                        activeOpacity={0.88}
                        onPress={() => confirmRemoveBrandAsset("hero_image", platformBranding.heroImage)}
                        testID="brand-hero-remove-image-button"
                        accessibilityLabel="Remove Brand Studio Hero Image"
                      >
                        <Text style={styles.eventSecondaryButtonText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : null}
              </>
            ),
          })}

          {renderBrandAccordion({
            id: "background",
            title: "Background",
            summary: platformBranding?.backgroundImage ? "Adjust fit and readability." : "Choose a Platform background.",
            status: brandBackgroundStatus,
            statusTone: platformBranding?.backgroundImage && (platformBranding.backgroundImage.scanStatus === "pending_scan" || platformBranding.backgroundImage.scanStatus === "scanning" || platformBranding.backgroundImage.scanStatus === "malware_detected" || platformBranding.backgroundImage.scanStatus === "scan_failed" || platformBranding.backgroundImage.scanStatus === "quarantined") ? "warning" : platformBranding?.backgroundImage ? "default" : "muted",
            thumbnailAsset: platformBranding?.backgroundImage,
            thumbnailLabel: "Bg",
            children: (
              <>
                <View style={styles.brandButtonRow}>
                  <TouchableOpacity
                    style={[styles.eventPrimaryButton, backgroundBusy && styles.eventPrimaryButtonDisabled]}
                    activeOpacity={0.88}
                    disabled={backgroundBusy || brandSaving}
                    onPress={() => pickPlatformBrandAsset("background_image")}
                    testID="brand-background-choose-image-button"
                    accessibilityLabel="Choose Brand Studio Background Image"
                  >
                    {brandBusyAssetType === "background_image"
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.eventPrimaryButtonText}>{platformBranding?.backgroundImage ? "Change Background" : "Choose Background"}</Text>}
                  </TouchableOpacity>
                </View>
                {platformBranding?.backgroundImage ? (
                  <>
                    {renderBrandAssetPreview({
                      title: "Adjust Background",
                      asset: platformBranding.backgroundImage,
                      fallback: "BACKGROUND",
                      fitMode: draft?.backgroundFitMode,
                      blurStrength: draft?.blurStrength,
                    })}
                    <Text style={styles.sectionLabel}>Fit</Text>
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
                    <Text style={styles.sectionLabel}>Blur</Text>
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
                    <View style={styles.brandButtonRow}>
                      <TouchableOpacity
                        style={[styles.eventPrimaryButton, brandSaving && styles.eventPrimaryButtonDisabled]}
                        activeOpacity={0.88}
                        disabled={brandSaving}
                        onPress={() => void saveBrandDraftPatch()}
                        testID="brand-background-save-draft-button"
                        accessibilityLabel="Save Brand Studio Draft"
                      >
                        <Text style={styles.eventPrimaryButtonText}>Save Draft</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.eventSecondaryButton}
                        activeOpacity={0.88}
                        onPress={() => confirmRemoveBrandAsset("background_image", platformBranding.backgroundImage)}
                        testID="brand-background-remove-image-button"
                        accessibilityLabel="Remove Brand Studio Background Image"
                      >
                        <Text style={styles.eventSecondaryButtonText}>Remove</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : null}
              </>
            ),
          })}

          {renderBrandAccordion({
            id: "brandKit",
            title: "Avatar and Logo",
            summary: "Public Platform identity assets.",
            status: brandKitReady ? "Ready" : "Not set",
            statusTone: brandKitReady ? "default" : "muted",
            thumbnailAsset: platformBranding?.avatar ?? platformBranding?.logo,
            thumbnailLabel: "ID",
            children: (
              <>
                <Text style={styles.permissionCopy}>
                  These appear on your public Platform, separate from your Profile photo.
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
                    testID="brand-avatar-choose-image-button"
                    accessibilityLabel="Choose Brand Studio Avatar Image"
                  >
                    <Text style={styles.eventPrimaryButtonText}>{platformBranding?.avatar ? "Change Avatar" : "Choose Avatar"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.eventSecondaryButton}
                    activeOpacity={0.88}
                    disabled={kitBusy || brandSaving}
                    onPress={() => pickPlatformBrandAsset("logo")}
                    testID="brand-logo-choose-image-button"
                    accessibilityLabel="Choose Brand Studio Logo Image"
                  >
                    <Text style={styles.eventSecondaryButtonText}>{platformBranding?.logo ? "Change Logo" : "Choose Logo"}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.permissionCopy}>
                  Watermark not available yet. Public video watermark rendering is not active.
                </Text>
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

          <View style={styles.eventEmptyCard}>
            <View style={styles.eventCardHeader}>
              <View style={styles.eventCardCopy}>
                <Text style={styles.eventEmptyTitle}>Publishing Status</Text>
                <Text style={styles.eventEmptyBody}>
                  Draft, safety, and public state. Use the bottom buttons to save or publish Brand Studio changes.
                </Text>
              </View>
              {renderStudioStatusPill(
                brandBlockedCount
                  ? `${brandBlockedCount} blocked`
                  : brandCheckingCount
                    ? `${brandCheckingCount} checking`
                    : brandReadyToPublishCount
                      ? `${brandReadyToPublishCount} ready`
                  : brandPublished ? "Live" : "Draft",
                brandBlockedCount || brandCheckingCount ? "warning" : "default",
              )}
            </View>
            <View style={styles.brandStatusGrid}>
              <View style={styles.homeSnapshotCard}>
                <Text style={styles.homeSnapshotLabel}>Public</Text>
                <Text style={styles.homeSnapshotBody}>{brandPublished ? "Published profile settings are live." : "Nothing new is live until publish."}</Text>
              </View>
              <View style={styles.homeSnapshotCard}>
                <Text style={styles.homeSnapshotLabel}>Draft</Text>
                <Text style={styles.homeSnapshotBody}>{(platformBranding?.assets ?? []).length ? "Saved Brand Studio assets exist." : "No Brand Studio media selected."}</Text>
              </View>
              <View style={styles.homeSnapshotCard}>
                <Text style={styles.homeSnapshotLabel}>Next step</Text>
                <Text style={styles.homeSnapshotBody}>
                  {brandBlockedCount
                    ? "One or more media items cannot be published yet."
                    : brandCheckingCount
                      ? "Media is still getting ready."
                      : brandReadyToPublishCount
                        ? `${brandReadyToPublishCount} asset${brandReadyToPublishCount === 1 ? "" : "s"} ready to publish.`
                        : brandPublished
                          ? "Public Platform is current."
                          : "Save a draft or publish when ready."}
                </Text>
              </View>
            </View>
            <Text style={styles.permissionCopy}>
              Save Draft keeps media owner-only. Preview Platform is the reviewed visitor view; use Preview Brand Draft to check saved draft media before publish. Publish Changes is required before eligible safe assets can appear publicly.
            </Text>
          </View>
        </View>

        <View style={styles.brandActionRow}>
          <TouchableOpacity
            style={[styles.eventSecondaryButton, (brandSaving || saving) && styles.eventPrimaryButtonDisabled]}
            activeOpacity={0.88}
            disabled={brandSaving || saving}
            onPress={() => {
              void saveBrandStudioDraftAndProfile();
            }}
            testID="brand-main-save-draft-button"
            accessibilityLabel="Save Brand Studio Draft"
            hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
          >
            <Text style={styles.eventSecondaryButtonText}>Save Draft</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.saveButton, (brandSaving || saving) && styles.eventPrimaryButtonDisabled]}
            onPress={() => {
              void publishBrandStudioAndProfile();
            }}
            activeOpacity={0.88}
            disabled={brandSaving || saving}
            testID="brand-publish-changes-button"
            accessibilityLabel="Publish Brand Studio Changes"
            hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
          >
            {brandSaving || saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Publish Changes</Text>}
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
    emptyTitle = "No money activity yet",
    emptyBody = "Money setup, readiness, sandbox, and ledger activity will appear here when it is safely readable.",
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
    const revenueCatOfferingReadiness = readiness("revenuecat", "revenuecat_offering");
    const revenueCatEntitlementReadiness = readiness("revenuecat", "revenuecat_entitlement");
    const googlePlayProductReadiness = readiness("google_play", "google_play_subscription_product");
    const stripeConnectReadiness = readiness("stripe_connect", "stripe_connect_account");
    const stripeWebhookReadiness = readiness("stripe", "stripe_webhook_signature");
    const payoutSetupReadiness = readiness("stripe_connect", "payout_setup");
    const payoutReleaseReadiness = readiness("stripe_connect", "payout_release");
    const tipsProviderReadiness = readiness("stripe", "tips");
    const paidContentReadiness = readiness("google_play", "paid_content");
    const commerceReadiness = readiness("stripe", "platform_commerce");
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
    const creatorSetupModeActive = isMoneyFeatureSandboxOrOn(moneyFlag("creator_monetization_enabled").state)
      && liveMoneyFeatureFlag.state !== "on";
    const monetizationActive = moneyCenterLiveActive;
    const moneyCenterStatus = moneyCenterFeatureFlag.state === "locked" ? "Blocked"
      : moneyCenterFeatureFlag.state === "off" || moneyCenterFeatureFlag.state === "maintenance" ? "Disabled"
        : monetizationActive ? "Active"
          : creatorSetupModeActive ? "Setup mode"
            : "Not active";
    const topStatus = moneyCenterStatus;
    const tipsFlag = moneyFlag("tips_enabled");
    const watchPartyTicketsFlag = moneyFlag("watch_party_tickets_enabled");
    const paidContentFlag = moneyFlag("paid_content_enabled");
    const payoutsFlag = moneyFlag("payouts_enabled");
    const stripeConnectFlag = moneyFlag("stripe_connect_enabled");
    const providerWebhooksFlag = moneyFlag("provider_webhooks_enabled");
    const storeProviderRow = googlePlayProductReadiness ?? revenueCatOfferingReadiness ?? revenueCatEntitlementReadiness;
    const storeStatus = sectionStatus("revenuecat_google_play_enabled", storeProviderRow, revenueCatReadiness.anyPublicKeyConfigured ? "Ready for review" : "Setup needed");
    const digitalSalesStatus = sectionStatus("digital_sales_enabled", storeProviderRow, "Setup needed");
    const stripeStatus = sectionStatus("stripe_connect_enabled", stripeConnectReadiness, creatorPayoutSummary.providerReady ? "Ready for review" : "Setup needed");
    const paidContentStatus = sectionStatus("paid_content_enabled", paidContentReadiness, "Setup needed");
    const watchPartyTicketsStatus = sectionStatus("watch_party_tickets_enabled", googlePlayProductReadiness, "Planned");
    const merchStatus = sectionStatus("merch_enabled", commerceReadiness, "Planned");
    const payoutsStatus = sectionStatus("payouts_enabled", payoutSetupReadiness ?? payoutReleaseReadiness, "Setup needed");
    const taxLegalStatus = creatorPayoutSummary.kycReady && creatorPayoutSummary.taxReady && payoutsFlag.state === "on" ? "Ready for review" : "Setup needed";
    const providerOverallStatus = providerReadinessSummary.some((row) => row.status === "active" && row.isLiveMoneyEnabled && liveMoneyFeatureFlag.state === "on")
      ? "Active"
      : providerReadinessSummary.some((row) => row.status === "sandbox_ready")
        ? "Sandbox ready"
        : "Setup needed";
    const canStartStripeSetup = isMoneyFeatureSandboxOrOn(stripeConnectFlag.state)
      && payoutsFlag.state !== "on"
      && liveMoneyFeatureFlag.state !== "on";
    const canReviewCashoutReadiness = isMoneyFeatureSandboxOrOn(stripeConnectFlag.state)
      || moneyFlag("creator_balance_visible").state === "on";
    const paidTipTransactions = creatorTipTransactions.filter((transaction) => transaction.status === "paid");
    const tipGrossCents = paidTipTransactions.reduce((total, transaction) => total + transaction.amountCents, 0);
    const tipPendingTransactions = creatorTipTransactions.filter((transaction) => transaction.status === "pending" || transaction.status === "checkout_started");
    const paidVideoPaidTransactions = creatorPaidVideoTransactions.filter((transaction) => transaction.status === "paid");
    const paidVideoGrossCents = paidVideoPaidTransactions.reduce((total, transaction) => total + transaction.amountCents, 0);
    const paidWatchPartyPaidTransactions = creatorPaidWatchPartyTransactions.filter((transaction) => transaction.status === "paid");
    const paidWatchPartyGrossCents = paidWatchPartyPaidTransactions.reduce((total, transaction) => total + transaction.amountCents, 0);
    const paidEventPaidTransactions = creatorPaidEventTransactions.filter((transaction) => transaction.status === "paid");
    const paidEventGrossCents = paidEventPaidTransactions.reduce((total, transaction) => total + transaction.amountCents, 0);
    const vipPaidTransactions = creatorVipTransactions.filter((transaction) => transaction.status === "paid");
    const vipGrossCents = vipPaidTransactions.reduce((total, transaction) => total + transaction.amountCents, 0);
    const channelSubscriptionPaidTransactions = creatorChannelSubscriptionTransactions.filter((transaction) => transaction.status === "paid" || transaction.status === "renewal_paid");
    const channelSubscriptionGrossCents = channelSubscriptionPaidTransactions.reduce((total, transaction) => total + transaction.amountCents, 0);
    const creatorTipSandboxConfig = creatorSandboxConfigs.find((config) => (
      config.sourceType === "creator_tip"
      && config.productKey === "creator_tip_sandbox_099"
      && config.status !== "revoked"
    )) ?? null;
    const tipSetupSaved = !!creatorTipSandboxConfig || creatorTipSettings?.tipsEnabled === true;
    const tipFeatureStatus: MonetizationFeatureStatus = (() => {
      if (tipsFlag.state === "locked") return "Blocked";
      if (tipSetupSaved) return "Setup mode";
      if (!creatorTipSettings) return "Not set up";
      if (creatorTipSettings.status === "active") return "Setup mode";
      if (creatorTipSettings.status === "paused") return "Paused";
      if (creatorTipSettings.status === "blocked") return "Blocked";
      return "Needs attention";
    })();
    const tipProviderReady = creatorTipSettings?.providerChargesEnabled === true && creatorTipSettings?.providerPayoutsEnabled === true;
    const tipSetupCards: readonly SummaryMetricCard[] = [
      {
        label: "Tips",
        value: tipFeatureStatus,
        body: tipSetupSaved
          ? "Tips setup is saved in sandbox/not-payable mode. They do not unlock content, badges, room access, VIP, or perks."
          : "Set up Tips in sandbox/not-payable mode. Production tips still require provider and owner approval.",
        tone: tipSetupSaved ? "default" : "unavailable",
      },
      {
        label: "Payable state",
        value: "Not payable",
        body: "Payout readiness can be reviewed, but no tip creates a payable balance while live money and payouts are off.",
        tone: "unavailable",
      },
      {
        label: "Tip total",
        value: formatMonetizationCurrency(tipGrossCents, creatorTipSettings?.currency ?? "usd"),
        body: paidTipTransactions.length ? `${paidTipTransactions.length} verified test tip${paidTipTransactions.length === 1 ? "" : "s"}.` : "No verified tips yet.",
        tone: paidTipTransactions.length ? "default" : "unavailable",
      },
      {
        label: "Pending tips",
        value: String(tipPendingTransactions.length),
        body: "Pending checkout rows are not creator earnings until the Stripe webhook verifies payment.",
        tone: "unavailable",
      },
    ];
    const payoutCards: readonly SummaryMetricCard[] = [
      {
        label: "Payout setup",
        value: canReviewCashoutReadiness ? "Readiness" : payoutsStatus,
        body: "Creators can review cashout readiness in setup mode. Production payouts remain off.",
        tone: canReviewCashoutReadiness ? "default" : "unavailable",
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
        body: `${payoutsFlag.state === "off" || liveMoneyFeatureFlag.state !== "on" ? "Payouts are unavailable for production movement." : summarizeProviderReadiness(payoutReleaseReadiness, "No withdrawal, transfer, cash-out, or payout release action is available.")} No withdrawal, transfer, cash-out, or payout release action is available.`,
        tone: "unavailable",
      },
      {
        label: "Scheduled payout",
        value: creatorPayoutReadiness.canRequestScheduledPayout && payoutsFlag.state === "on" && liveMoneyFeatureFlag.state === "on" ? "Ready for review" : "Not live",
        body: `Scheduled payout fee is ${formatMonetizationCurrency(creatorPayoutReadiness.scheduledPayoutFeeCents, "usd")} when a future payout rollout is approved. Requests stay locked until all checks are ready.`,
        tone: creatorPayoutReadiness.canRequestScheduledPayout && payoutsFlag.state === "on" && liveMoneyFeatureFlag.state === "on" ? "default" : "unavailable",
      },
      {
        label: "Instant cash-out",
        value: creatorPayoutReadiness.canRequestInstantCashout && payoutsFlag.state === "on" && liveMoneyFeatureFlag.state === "on" ? "Ready for review" : "Not live",
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
        label: storeProviderName,
        value: storeStatus,
        body: `${switchSetupBody("revenuecat_google_play_enabled", "Store setup needed before digital purchases can be active.")} ${summarizeProviderReadiness(googlePlayProductReadiness, "Store setup needed before digital purchases can be active.")}`,
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
        body: "Stripe Connect is payout setup only. It does not charge users for digital goods.",
        tone: sectionTone(stripeStatus) === "default" ? "default" : "unavailable",
      },
      {
        label: "Tips rail",
        value: providerStatusLabel(tipsProviderReadiness, tipFeatureStatus === "Setup mode" ? "Setup mode" : "Setup needed"),
        body: summarizeProviderReadiness(
          tipsProviderReadiness,
          `${storeProviderName} tester tips use ${storeProviderPair} sandbox. Stripe is reserved for physical merch and payout readiness.`,
        ),
        tone: getProviderReadinessTone(tipsProviderReadiness),
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
        body: `${storeProviderName} product id is public setup metadata, not a credential.`,
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
        body: summarizeProviderReadiness(policyReadiness, `Premium remains ${storeProviderName} plus RevenueCat; creator payouts remain separate.`),
      },
      {
        label: "Webhook checks",
        value: getMoneyFeatureStateLabel(providerWebhooksFlag.state),
        body: "Status only. Secret values and private provider details are never shown.",
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
    const payoutEvents = creatorMoneyAuditEvents.filter((event) => event.category === "payouts");
    const providerEvents = creatorMoneyAuditEvents.filter((event) => event.category === "provider_readiness" || event.category === "webhooks");
    const featureStatusByKey: Record<MonetizationFeatureKey, MonetizationFeatureStatus> = {
      tips: tipFeatureStatus,
      paid_videos: paidContentFlag.state === "locked" ? "Blocked" : creatorPaidVideoOffers.some((offer) => offer.isPaid && offer.status === "sandbox") ? "Setup mode" : paidContentFlag.state === "on" && monetizationActive ? "Active" : paidContentFlag.state === "maintenance" ? "Paused" : "Not set up",
      paid_watch_parties: watchPartyTicketsFlag.state === "locked" ? "Blocked" : creatorPaidWatchPartyOffers.some((offer) => offer.status === "sandbox" || offer.status === "sold_out") ? "Setup mode" : watchPartyTicketsFlag.state === "on" && monetizationActive ? "Active" : watchPartyTicketsFlag.state === "maintenance" ? "Paused" : "Not set up",
      channel_subscriptions: digitalSalesStatus === "Blocked" ? "Blocked" : creatorChannelSubscriptionOffers.some((offer) => offer.status === "sandbox") ? "Setup mode" : digitalSalesStatus === "Disabled" ? "Not set up" : "Not set up",
      vip_passes: digitalSalesStatus === "Blocked" ? "Blocked" : creatorVipPassOffers.some((offer) => offer.status === "sandbox") ? "Setup mode" : digitalSalesStatus === "Disabled" ? "Not set up" : "Not set up",
      paid_events: digitalSalesStatus === "Blocked" ? "Blocked" : creatorPaidEventOffers.some((offer) => offer.status === "sandbox" || offer.status === "sold_out") ? "Setup mode" : digitalSalesStatus === "Disabled" ? "Not set up" : "Not set up",
    };
    const featureBlockedReasonByKey: Partial<Record<MonetizationFeatureKey, string>> = {
      tips: tipsFlag.state === "locked" ? tipsFlag.displaySummary : undefined,
      paid_videos: paidContentFlag.state === "locked" ? paidContentFlag.displaySummary : undefined,
      paid_watch_parties: watchPartyTicketsFlag.state === "locked" ? watchPartyTicketsFlag.displaySummary : undefined,
      channel_subscriptions: digitalSalesStatus === "Blocked" ? "Payments are unavailable right now." : undefined,
      vip_passes: digitalSalesStatus === "Blocked" ? "Payments are unavailable right now." : undefined,
      paid_events: digitalSalesStatus === "Blocked" ? "Payments are unavailable right now." : undefined,
    };
    const featureActionForStatus = (status: MonetizationFeatureStatus): MonetizationFeatureAction => {
      if (status === "Active" || status === "Setup mode") return "Manage";
      if (status === "Paused") return "Resume";
      if (status === "Blocked" || status === "Needs attention") return "Fix issue";
      return "Set up";
    };
    const monetizationFeatureCards = CREATOR_MONETIZATION_FEATURE_CATALOG.map((feature) => ({
      ...feature,
      status: featureStatusByKey[feature.key],
      creatorActionLabel: featureActionForStatus(featureStatusByKey[feature.key]),
      blockedReason: featureBlockedReasonByKey[feature.key] ?? feature.blockedReason,
    }));
    const latestPublicSandboxVideo = creatorVideos
      .filter((video) => (
        video.visibility === "public"
        && ["clean", "reported"].includes(video.moderationStatus)
        && hasPlayableCreatorVideoSource(video)
      ))
      .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;
    const hasPaidVideoOffer = creatorPaidVideoOffers.some((offer) => offer.isPaid && offer.status === "sandbox");
    const hasPaidWatchPartyOffer = creatorPaidWatchPartyOffers.some((offer) => offer.status === "sandbox" || offer.status === "sold_out");
    const hasChannelSubscriptionOffer = creatorChannelSubscriptionOffers.some((offer) => offer.status === "sandbox");
    const hasVipPassOffer = creatorVipPassOffers.some((offer) => offer.status === "sandbox");
    const hasPaidEventOffer = creatorPaidEventOffers.some((offer) => offer.status === "sandbox" || offer.status === "sold_out");
    const sandboxConfigsBySourceType = creatorSandboxConfigs.reduce((map, config) => {
      const nextRows = map.get(config.sourceType) ?? [];
      nextRows.push(config);
      map.set(config.sourceType, nextRows);
      return map;
    }, new Map<CreatorMonetizationSetupSourceType, CreatorMonetizationConfig[]>());
    const sandboxConfigCount = (sourceType: CreatorMonetizationSetupSourceType) =>
      sandboxConfigsBySourceType.get(sourceType)?.length ?? 0;
    const formatCreatorSetupSourceLabel = (sourceType: CreatorMonetizationSetupSourceType) => {
      if (sourceType === "paid_content") return "Paid Video";
      if (sourceType === "watch_party_live") return "Watch-Party Seat Pass";
      if (sourceType === "channel_subscription") return "Channel Subscription";
      if (sourceType === "vip_pass") return "VIP";
      if (sourceType === "event") return "Event Pass";
      if (sourceType === "creator_tip") return "Tips";
      return sourceType.replaceAll("_", " ");
    };
    const setMoneyManageFocus = (
      target: MonetizationFeatureKey,
      sections: readonly MonetizationSectionId[],
      notice: string,
    ) => {
      setActiveMoneyManageTarget(target);
      setMoneyManageNotice(notice);
      setExpandedMonetizationSections((current) => new Set([...current, ...sections]));
      router.setParams({
        tab: "monetization",
        focus: sections[0] ?? "ways_to_earn",
        manage: target,
      });
    };
    const handleManageMoneyFeature = (feature: MonetizationFeatureCatalogItem) => {
      trackEvent("money_feature_card_pressed", {
        blocked_reason: feature.blockedReason ?? null,
        creator_id: user?.id ?? null,
        feature_key: feature.key,
        route_name: "channel-studio",
        source_surface: "money_center",
      });
      if (feature.status === "Blocked" || feature.status === "Needs attention") {
        trackEvent("money_provider_blocked_state_seen", {
          blocked_reason: feature.blockedReason ?? feature.status,
          creator_id: user?.id ?? null,
          feature_key: feature.key,
          route_name: "channel-studio",
          source_surface: "money_center",
        });
      }

      if (feature.key === "tips") {
        setMoneyManageFocus(
          "tips",
          ["ways_to_earn"],
          "Tips setup is focused below. Use Enable Tips or Pause Tips. Cashout readiness stays separate and not payable.",
        );
        return;
      }

      if (feature.key === "paid_videos") {
        setMoneyManageFocus(
          "paid_videos",
          ["ways_to_earn"],
          hasPaidVideoOffer
            ? "Paid Video Manager is open below. Choose a video to manage its paid unlock."
            : "Paid Video Manager is open below. Choose a public video before enabling paid unlocks.",
        );
        return;
      }

      if (feature.key === "paid_watch_parties") {
        setMoneyManageFocus(
          "paid_watch_parties",
          ["ways_to_earn"],
          hasPaidWatchPartyOffer
            ? "Watch-Party Seat Pass Manager is open below. Seat Pass access still routes through Party Waiting Room to Party Room."
            : "Watch-Party Seat Pass Manager is open below. Create or link a Party Room target before enabling Seat Pass access.",
        );
        return;
      }

      if (feature.key === "channel_subscriptions") {
        setMoneyManageFocus(
          "channel_subscriptions",
          ["ways_to_earn"],
          hasChannelSubscriptionOffer
            ? "Channel Subscription Manager is open below with Manage and Pause actions."
            : "Channel Subscription Manager is open below. Enable it to create the sandbox offer.",
        );
        return;
      }

      if (feature.key === "vip_passes") {
        setMoneyManageFocus(
          "vip_passes",
          ["ways_to_earn"],
          hasVipPassOffer
            ? "VIP Pass Manager is open below with Manage and Pause actions."
            : "VIP Pass Manager is open below. Enable it to create the sandbox offer.",
        );
        return;
      }

      setMoneyManageFocus(
        "paid_events",
        ["ways_to_earn"],
        hasPaidEventOffer
          ? "Event Pass Manager is open below. Use the event actions to adjust the linked event."
          : "Event Pass Manager is open below. Choose an event before enabling paid event passes.",
      );
    };
    const previewCreatorPlatform = () => {
      if (!user?.id) return;
      router.push({ pathname: "/channel/[userId]", params: { userId: String(user.id), preview: "public" } });
    };
    const openMoneyTransactions = () => {
      setExpandedMonetizationSections((current) => new Set([...current, "transactions"]));
    };
    const sandboxTesterOfferCards: SandboxTesterOfferCard[] = [
      {
        key: "tips",
        title: "Tips",
        configured: tipSetupSaved,
        blocker: tipSetupSaved ? undefined : "Tips are not enabled yet.",
        description: tipSetupSaved
          ? "Testers can send a sandbox tip. No money moves."
          : "Run setup to turn on the sandbox tip flow.",
        scopeKey: "creator_tip",
        statusLabel: tipSetupSaved ? "Ready" : "Needs setup",
        actionLabel: tipSetupSaved ? "Preview tip flow" : undefined,
        onPress: previewCreatorPlatform,
        testID: "money-sandbox-tips-card",
      },
      {
        key: "paid_video",
        title: "Paid Video",
        configured: hasPaidVideoOffer,
        blocker: hasPaidVideoOffer
          ? undefined
          : latestPublicSandboxVideo
            ? "Run setup to attach a sandbox paid-video offer."
            : "Publish a creator video before testers can unlock paid video.",
        description: hasPaidVideoOffer
          ? "Testers can unlock one public creator video in sandbox mode."
          : latestPublicSandboxVideo
            ? "A public video exists. Run setup to attach a sandbox unlock."
            : "Paid video needs a public safe creator video first.",
        scopeKey: "paid_creator_video",
        statusLabel: hasPaidVideoOffer ? "Ready" : latestPublicSandboxVideo ? "Needs setup" : "Blocked",
        actionLabel: hasPaidVideoOffer
          ? "Preview paid video"
          : latestPublicSandboxVideo
            ? "Fix missing setup"
            : "Open Content",
        onPress: hasPaidVideoOffer && latestPublicSandboxVideo
          ? () => router.push({ pathname: "/player/[id]", params: { id: latestPublicSandboxVideo.id, source: "creator-video" } })
          : () => setActiveStudioTab("content"),
        testID: "money-sandbox-paid-video-card",
      },
      {
        key: "watch_party_ticket",
        title: "Watch-Party Seat Pass",
        configured: hasPaidWatchPartyOffer,
        blocker: hasPaidWatchPartyOffer
          ? undefined
          : "Create a Party Room before testers can get a Seat Pass.",
        description: hasPaidWatchPartyOffer
          ? "Testers can get a sandbox Seat Pass before Party Waiting Room or Party Room entry."
          : "Watch-Party Seat Pass needs a Party Room target.",
        scopeKey: "watch_party_ticket",
        statusLabel: hasPaidWatchPartyOffer ? "Ready" : "Blocked",
        actionLabel: hasPaidWatchPartyOffer
          ? "Preview Seat Pass flow"
          : "Create Party Room target",
        actionTestID: hasPaidWatchPartyOffer
          ? undefined
          : "money-sandbox-create-party-room-target-button",
        onPress: () => router.push({ pathname: "/watch-party", params: { mode: "live", source: "money-sandbox" } }),
        testID: "money-sandbox-watch-party-ticket-card",
      },
      {
        key: "event_pass",
        title: "Event Pass",
        configured: hasPaidEventOffer,
        blocker: hasPaidEventOffer
          ? undefined
          : "Create a creator event first, or run setup to create the sandbox event demo.",
        description: hasPaidEventOffer
          ? "Testers can get a sandbox event pass."
          : "Event Pass needs a creator event and sandbox offer.",
        scopeKey: "event_pass",
        statusLabel: hasPaidEventOffer ? "Ready" : "Needs setup",
        actionLabel: hasPaidEventOffer ? "Preview event pass" : "Create event",
        onPress: hasPaidEventOffer && creatorEvents[0]
          ? () => router.push(`/event/${creatorEvents[0].id}` as Parameters<typeof router.push>[0])
          : () => setActiveStudioTab("live"),
        testID: "money-sandbox-event-pass-card",
      },
      {
        key: "channel_subscription",
        title: "Channel Subscription",
        configured: hasChannelSubscriptionOffer,
        blocker: hasChannelSubscriptionOffer ? undefined : "No sandbox subscription offer.",
        description: hasChannelSubscriptionOffer
          ? "Testers can subscribe to this creator's Platform in sandbox mode. This is not Chi'llywood Premium."
          : "Run setup to create the sandbox Channel Subscription.",
        scopeKey: "channel_subscription",
        statusLabel: hasChannelSubscriptionOffer ? "Ready" : "Needs setup",
        actionLabel: hasChannelSubscriptionOffer ? "Preview subscription" : undefined,
        onPress: previewCreatorPlatform,
        testID: "money-sandbox-channel-subscription-card",
      },
      {
        key: "vip_pass",
        title: "VIP Pass",
        configured: hasVipPassOffer,
        blocker: hasVipPassOffer ? undefined : "No sandbox VIP offer.",
        description: hasVipPassOffer
          ? "Testers can get creator-specific VIP in sandbox mode. It does not unlock Premium or other creators."
          : "Run setup to create the sandbox VIP pass.",
        scopeKey: "vip_pass",
        statusLabel: hasVipPassOffer ? "Ready" : "Needs setup",
        actionLabel: hasVipPassOffer ? "Preview VIP" : undefined,
        onPress: previewCreatorPlatform,
        testID: "money-sandbox-vip-pass-card",
      },
    ];
    const sandboxConfiguredCount = sandboxTesterOfferCards.filter((card) => card.configured).length;
    const sandboxSetupStatus = sandboxConfiguredCount === sandboxTesterOfferCards.length
      ? "Ready"
      : sandboxConfiguredCount > 0
        ? "Partially Ready"
        : "Needs Setup";
    const sandboxNextStep = sandboxConfiguredCount === sandboxTesterOfferCards.length
      ? "Open tester preview"
      : sandboxTesterOfferCards.find((card) => !card.configured)?.actionLabel
        ?? sandboxTesterOfferCards.find((card) => !card.configured)?.blocker
        ?? "Set up sandbox offers";
    const sandboxSetupButtonLabel = sandboxSetupBusy
      ? "Setting up"
      : sandboxSetupState === "failed"
        ? "Setup failed - retry"
        : sandboxSetupState === "timed_out"
          ? "Retry setup"
          : sandboxConfiguredCount === sandboxTesterOfferCards.length
            ? "Refresh setup"
            : sandboxConfiguredCount > 0
              ? "Fix missing setup"
              : "Set up sandbox offers";
    const sandboxChecklist = [
      {
        label: "Configure offers",
        status: sandboxConfiguredCount === sandboxTesterOfferCards.length ? "Done" : sandboxConfiguredCount > 0 ? "Needs action" : "Not started",
        body: `${sandboxConfiguredCount} of ${sandboxTesterOfferCards.length} flows ready.`,
      },
      {
        label: "Grant tester",
        status: sandboxTesterRows.length > 0 ? "Done" : "Needs action",
        body: sandboxTesterRows.length > 0 ? `Active testers: ${sandboxTesterRows.length}` : "No active testers.",
      },
      {
        label: "Test flows",
        status: sandboxConfiguredCount === sandboxTesterOfferCards.length && sandboxTesterRows.length > 0 ? "Ready" : "Not started",
        body: "Use a non-owner tester account on the Play-installed app.",
      },
      {
        label: "Revoke tester",
        status: "Not started",
        body: "After proof, revoke the tester and confirm sandbox CTAs disappear.",
      },
    ] as const;
    const scopeForFeatureKey = (key: MonetizationFeatureKey): MoneyScopeKey => {
      if (key === "tips") return "creator_tip";
      if (key === "paid_videos") return "paid_creator_video";
      if (key === "paid_watch_parties") return "watch_party_ticket";
      if (key === "channel_subscriptions") return "channel_subscription";
      if (key === "vip_passes") return "vip_pass";
      return "event_pass";
    };
    const ctaTestIdByFeatureKey: Record<MonetizationFeatureKey, string> = {
      tips: "money-feature-tips-cta",
      paid_videos: "money-feature-paid_video-cta",
      paid_watch_parties: "money-feature-watch_party_ticket-cta",
      channel_subscriptions: "money-feature-channel_subscription-cta",
      vip_passes: "money-feature-vip-cta",
      paid_events: "money-feature-event_pass-cta",
    };
    const renderFeatureCard = (feature: MonetizationFeatureCatalogItem, testIdSuffix = "") => (
      <View
        key={feature.key}
        style={[
          styles.summaryCard,
          styles.moneyFeatureCard,
          activeMoneyManageTarget === feature.key && styles.moneyFocusedCard,
          (feature.status === "Blocked" || feature.status === "Needs attention") && styles.summaryCardUnavailable,
        ]}
        testID={`money-feature-card-${feature.key}${testIdSuffix}`}
      >
        <View style={styles.moneyFeatureHeaderRow}>
          <Text style={styles.summaryLabel}>{feature.title}</Text>
          <MoneyScopeInfoButton scope={scopeForFeatureKey(feature.key)} compact />
        </View>
        <Text style={styles.summaryValue}>{feature.status}</Text>
        <Text style={styles.summaryBody}>{feature.creatorDescription}</Text>
        {feature.blockedReason ? <Text style={styles.noticeText}>{feature.blockedReason}</Text> : null}
        <TouchableOpacity
          style={styles.eventActionButton}
          activeOpacity={0.86}
          onPress={() => handleManageMoneyFeature(feature)}
          hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={`${feature.creatorActionLabel} ${feature.title}`}
          testID={`${ctaTestIdByFeatureKey[feature.key]}${testIdSuffix}`}
        >
          <Text style={styles.eventActionButtonText}>{feature.creatorActionLabel}</Text>
        </TouchableOpacity>
      </View>
    );
    const renderActiveMoneyManagerPanel = () => {
      if (!activeMoneyManageTarget) return null;

      const managerTitleByTarget: Record<MonetizationFeatureKey, string> = {
        tips: "Tips Manager",
        paid_videos: "Paid Video Manager",
        paid_watch_parties: "Watch-Party Seat Pass Manager",
        channel_subscriptions: "Channel Subscription Manager",
        vip_passes: "VIP Pass Manager",
        paid_events: "Event Pass Manager",
      };
      const managerScopeByTarget: Record<MonetizationFeatureKey, MoneyScopeKey> = {
        tips: "creator_tip",
        paid_videos: "paid_creator_video",
        paid_watch_parties: "watch_party_ticket",
        channel_subscriptions: "channel_subscription",
        vip_passes: "vip_pass",
        paid_events: "event_pass",
      };
      const managerTestIdByTarget: Record<MonetizationFeatureKey, string> = {
        tips: "money-manager-tips",
        paid_videos: "money-manager-paid_video",
        paid_watch_parties: "money-manager-watch_party_ticket",
        channel_subscriptions: "money-manager-channel_subscription",
        vip_passes: "money-manager-vip",
        paid_events: "money-manager-event_pass",
      };

      const renderManagerBody = () => {
        if (activeMoneyManageTarget === "tips") {
          return (
            <>
              {renderSummaryMetricCards(tipSetupCards)}
              <View style={styles.eventActionRow}>
                {!tipSetupSaved ? (
                  <TouchableOpacity
                    style={[styles.eventPrimaryButton, tipSettingsBusy && styles.eventPrimaryButtonDisabled]}
                    activeOpacity={0.88}
                    disabled={tipSettingsBusy}
                    onPress={() => handleSaveTipSettings(true)}
                    hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
                    accessibilityRole="button"
                    accessibilityLabel="Enable Tips"
                    testID="money-manager-tips-enable-button"
                  >
                    {tipSettingsBusy ? (
                      <View style={styles.eventPrimaryButtonBusyRow}>
                        <ActivityIndicator color="#fff" />
                        <Text style={styles.eventPrimaryButtonText}>Saving tips</Text>
                      </View>
                    ) : (
                      <Text style={styles.eventPrimaryButtonText}>Enable Tips</Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={[styles.eventSecondaryButton, tipSettingsBusy && styles.eventPrimaryButtonDisabled]}
                    activeOpacity={0.88}
                    disabled={tipSettingsBusy}
                    onPress={() => handleSaveTipSettings(true)}
                    hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
                    accessibilityRole="button"
                    accessibilityLabel="Refresh Tips setup"
                    testID="money-manager-tips-refresh-button"
                  >
                    <Text style={styles.eventSecondaryButtonText}>Refresh Tips setup</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.eventSecondaryButton}
                  activeOpacity={0.88}
                  onPress={handleReviewCashoutReadiness}
                  hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel="Review cashout readiness"
                  testID="money-manager-tips-review-cashout-button"
                >
                  <Text style={styles.eventSecondaryButtonText}>Review cashout readiness</Text>
                </TouchableOpacity>
              </View>
              {!tipProviderReady ? (
                <Text style={styles.noticeText}>Cashout readiness stays separate from Tips setup. Tips remain contribution-only, not payable yet, and unlock nothing.</Text>
              ) : null}
              {tipSettingsNotice ? <Text style={styles.noticeText}>{tipSettingsNotice}</Text> : null}
            </>
          );
        }

        if (activeMoneyManageTarget === "paid_videos") {
          const manageableVideos = creatorVideos.filter((video) => (
            video.visibility === "public"
            && ["clean", "reported"].includes(video.moderationStatus)
            && hasPlayableCreatorVideoSource(video)
          ));
          return (
            <>
              {!manageableVideos.length ? (
                <View style={styles.eventEmptyCard}>
                  <Text style={styles.eventEmptyTitle}>Publish a video before enabling paid unlocks.</Text>
                  <Text style={styles.eventEmptyBody}>Paid Video needs a public, playable creator video before an unlock offer can be managed.</Text>
                </View>
              ) : (
                <View style={styles.eventList}>
                  {manageableVideos.slice(0, 4).map((video) => {
                    const offer = creatorPaidVideoOffers.find((entry) => entry.videoId === video.id);
                    return (
                      <View key={video.id} style={styles.eventEmptyCard}>
                        <View style={styles.eventCardHeader}>
                          <Text style={styles.eventEmptyTitle}>{video.title || "Untitled video"}</Text>
                          {renderStudioStatusPill(offer?.status === "sandbox" ? "Paid unlock" : "Ready", offer?.status === "sandbox" ? "default" : "muted")}
                        </View>
                        <Text style={styles.eventEmptyBody}>
                          {offer
                            ? `${formatMonetizationCurrency(offer.priceCents, offer.currency)} paid unlock is configured.`
                            : "No paid unlock is attached yet."}
                        </Text>
                        <TouchableOpacity
                          style={styles.eventSecondaryButton}
                          activeOpacity={0.86}
                          onPress={() => onEditVideo(video)}
                          hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
                          accessibilityRole="button"
                          accessibilityLabel={`Manage paid unlock for ${video.title || "video"}`}
                          testID="money-manager-paid-video-edit-button"
                        >
                          <Text style={styles.eventSecondaryButtonText}>Open video setup</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}
              <TouchableOpacity
                style={styles.eventPrimaryButton}
                activeOpacity={0.88}
                onPress={() => {
                  setVideoNotice("Publish a video before enabling paid unlocks.");
                  openStudioTab("content", { filter: "all", focus: "upload" });
                }}
                hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Open Content to publish a video"
                testID="money-manager-paid-videos-open-content-button"
              >
                <Text style={styles.eventPrimaryButtonText}>Open Content</Text>
              </TouchableOpacity>
            </>
          );
        }

        if (activeMoneyManageTarget === "paid_watch_parties") {
          const handleSaveWatchPartySetupConfig = async (offer: PaidWatchPartyOffer) => {
            if (watchPartySetupSavingId) return;
            setWatchPartySetupSavingId(offer.id);
            setMoneyManageNotice(null);
            try {
              await saveCreatorSetupConfig({
                displayName: "Sandbox Watch-Party Seat Pass",
                metadata: {
                  party_id: offer.partyId,
                  setup_surface: "money_center_watch_party_manager",
                },
                productKey: "watch_party_live_ticket_sandbox_099",
                sourceId: offer.id,
                sourceType: "watch_party_live",
              });
              setMoneyManageNotice("Watch-Party Seat Pass setup is saved in sandbox/not-payable mode. Viewer flow stays on Party Waiting Room and Party Room.");
            } catch (error) {
              setMoneyManageNotice(formatCreatorSetupError(error, "Watch-Party Seat Pass setup could not be saved right now."));
            } finally {
              setWatchPartySetupSavingId(null);
            }
          };
          return (
            <>
              {hasPaidWatchPartyOffer ? (
                <View style={styles.eventList}>
                  {creatorPaidWatchPartyOffers.map((offer) => {
                    const displayTitle = formatWatchPartySeatPassDisplayTitle(offer.title);
                    return (
                      <View key={offer.id} style={styles.eventEmptyCard}>
                        <View style={styles.eventCardHeader}>
                          <Text style={styles.eventEmptyTitle}>{displayTitle}</Text>
                          {renderStudioStatusPill(offer.status === "sandbox" ? "Seat Pass ready" : offer.status, offer.status === "sandbox" || offer.status === "sold_out" ? "default" : "muted")}
                        </View>
                        <Text style={styles.eventEmptyBody}>
                          {formatMonetizationCurrency(offer.priceCents, offer.currency)} · Party Room {offer.partyId ?? "not linked"} · {offer.seatsSold}{offer.seatLimit ? ` / ${offer.seatLimit}` : ""} seats sold.
                        </Text>
                        <TouchableOpacity
                          style={[styles.eventSecondaryButton, watchPartySetupSavingId === offer.id && styles.eventPrimaryButtonDisabled]}
                          activeOpacity={0.86}
                          disabled={watchPartySetupSavingId !== null}
                          onPress={() => {
                            void handleSaveWatchPartySetupConfig(offer);
                          }}
                          hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
                          accessibilityRole="button"
                          accessibilityLabel={`Save setup config for ${displayTitle}`}
                          testID="money-manager-watch-party-save-config-button"
                        >
                          <Text style={styles.eventSecondaryButtonText}>
                            {watchPartySetupSavingId === offer.id ? "Saving setup" : "Save setup config"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.eventEmptyCard}>
                  <Text style={styles.eventEmptyTitle}>Watch-Party target needed.</Text>
                  <Text style={styles.eventEmptyBody}>Create or link a Party Room target before a Seat Pass offer can be managed.</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.eventPrimaryButton}
                activeOpacity={0.88}
                onPress={() => router.push({ pathname: "/watch-party", params: { mode: "live", source: "money-center" } })}
                hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel="Create Watch-Party target"
                testID="money-manager-watch-party-create-target-button"
              >
                <Text style={styles.eventPrimaryButtonText}>Create Watch-Party target</Text>
              </TouchableOpacity>
            </>
          );
        }

        if (activeMoneyManageTarget === "channel_subscriptions") {
          return (
            <>
              <View style={styles.eventEmptyCard}>
                <Text style={styles.eventEmptyTitle}>Channel Subscription setup</Text>
                <Text style={styles.eventEmptyBody}>
                  Creator-specific recurring membership. While active it includes this creator’s ordinary Paid Videos, but not Premium, VIP-only content, Watch-Party Seat Passes, Event Passes, or other creators.
                </Text>
              </View>
              <View style={styles.eventActionRow}>
                <TouchableOpacity
                  style={[styles.eventPrimaryButton, channelSubscriptionSaving && styles.eventPrimaryButtonDisabled]}
                  activeOpacity={0.88}
                  disabled={channelSubscriptionSaving}
                  onPress={() => handleSaveChannelSubscription(true)}
                  hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel={hasChannelSubscriptionOffer ? "Manage Channel Subscription" : "Enable Channel Subscription"}
                  testID="money-manager-channel-subscription-enable-button"
                >
                  {channelSubscriptionSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.eventPrimaryButtonText}>{hasChannelSubscriptionOffer ? "Manage Channel Subscription" : "Enable Channel Subscription"}</Text>
                  )}
                </TouchableOpacity>
                {hasChannelSubscriptionOffer ? (
                  <TouchableOpacity
                    style={[styles.eventSecondaryButton, channelSubscriptionSaving && styles.eventPrimaryButtonDisabled]}
                    activeOpacity={0.88}
                    disabled={channelSubscriptionSaving}
                    onPress={() => handleSaveChannelSubscription(false)}
                    hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
                    accessibilityRole="button"
                    accessibilityLabel="Pause Channel Subscription"
                    testID="money-manager-channel-subscription-pause-button"
                  >
                    <Text style={styles.eventSecondaryButtonText}>Pause Subscription</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {channelSubscriptionNotice ? <Text style={styles.noticeText}>{channelSubscriptionNotice}</Text> : null}
            </>
          );
        }

        if (activeMoneyManageTarget === "vip_passes") {
          return (
            <>
              <View style={styles.eventEmptyCard}>
                <Text style={styles.eventEmptyTitle}>VIP Pass setup</Text>
                <Text style={styles.eventEmptyBody}>
                  VIP is a one-time creator-specific 30-day pass with VIP-only shelf access. It is separate from Premium, Channel Subscriptions, ordinary Paid Video ownership, Watch-Party Seat Passes, Event Passes, LiveKit authority, and other creators.
                </Text>
              </View>
              <View style={styles.eventActionRow}>
                <TouchableOpacity
                  style={[styles.eventPrimaryButton, vipPassSaving && styles.eventPrimaryButtonDisabled]}
                  activeOpacity={0.88}
                  disabled={vipPassSaving}
                  onPress={() => handleSaveVipPass(true)}
                  hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
                  accessibilityRole="button"
                  accessibilityLabel={hasVipPassOffer ? "Manage VIP Pass" : "Enable VIP Pass"}
                  testID="money-manager-vip-pass-enable-button"
                >
                  {vipPassSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.eventPrimaryButtonText}>{hasVipPassOffer ? "Manage VIP Pass" : "Enable VIP Pass"}</Text>
                  )}
                </TouchableOpacity>
                {hasVipPassOffer ? (
                  <TouchableOpacity
                    style={[styles.eventSecondaryButton, vipPassSaving && styles.eventPrimaryButtonDisabled]}
                    activeOpacity={0.88}
                    disabled={vipPassSaving}
                    onPress={() => handleSaveVipPass(false)}
                    hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
                    accessibilityRole="button"
                    accessibilityLabel="Pause VIP Pass"
                    testID="money-manager-vip-pass-pause-button"
                  >
                    <Text style={styles.eventSecondaryButtonText}>Pause VIP Pass</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              {vipPassNotice ? <Text style={styles.noticeText}>{vipPassNotice}</Text> : null}
            </>
          );
        }

        return (
          <>
            {!creatorEvents.length ? (
              <View style={styles.eventEmptyCard}>
                <Text style={styles.eventEmptyTitle}>Create an event before enabling paid event passes.</Text>
                <Text style={styles.eventEmptyBody}>Event Pass needs an existing creator event before paid access can be managed.</Text>
              </View>
            ) : (
              <View style={styles.eventList}>
                {creatorEvents.slice(0, 4).map((event) => {
                  const offer = creatorPaidEventOffers.find((entry) => entry.creatorEventId === event.id);
                  return (
                    <View key={event.id} style={styles.eventEmptyCard}>
                      <View style={styles.eventCardHeader}>
                        <Text style={styles.eventEmptyTitle}>{event.eventTitle}</Text>
                        {renderStudioStatusPill(offer?.status === "sandbox" ? "Pass ready" : "Ready", offer?.status === "sandbox" ? "default" : "muted")}
                      </View>
                      <Text style={styles.eventEmptyBody}>
                        {offer
                          ? `${formatMonetizationCurrency(offer.priceCents, offer.currency)} event pass is configured.`
                          : "No event pass is attached yet."}
                      </Text>
                      <TouchableOpacity
                        style={styles.eventSecondaryButton}
                        activeOpacity={0.86}
                        onPress={() => onEditEvent(event)}
                        hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
                        accessibilityRole="button"
                        accessibilityLabel={`Manage event pass for ${event.eventTitle}`}
                        testID="money-manager-paid-event-edit-button"
                      >
                        <Text style={styles.eventSecondaryButtonText}>Open event setup</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )}
            <TouchableOpacity
              style={styles.eventPrimaryButton}
              activeOpacity={0.88}
              onPress={() => {
                setEventNotice("Create an event before enabling paid event passes.");
                openStudioTab("live", { focus: "events" });
              }}
              hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
              accessibilityRole="button"
              accessibilityLabel="Open event creation"
              testID="money-manager-paid-events-open-live-button"
            >
              <Text style={styles.eventPrimaryButtonText}>Open Event Creation</Text>
            </TouchableOpacity>
          </>
        );
      };

      return (
        <View
          style={[styles.panel, styles.moneyFocusedCard]}
          testID={managerTestIdByTarget[activeMoneyManageTarget]}
        >
          <View style={styles.panelHeader}>
            <View style={styles.panelHeaderCopy}>
              <Text style={styles.panelTitle}>{managerTitleByTarget[activeMoneyManageTarget]}</Text>
              <Text style={styles.panelSubtitle}>
                {moneyManageNotice ?? "Manage this creator setup flow in sandbox/not-payable mode without changing provider or payout behavior."}
              </Text>
            </View>
            <View style={styles.scopeInfoHeaderRow}>
              <MoneyScopeInfoButton scope={managerScopeByTarget[activeMoneyManageTarget]} compact />
              <TouchableOpacity
                style={styles.closeBtn}
                activeOpacity={0.86}
                onPress={() => {
                  setActiveMoneyManageTarget(null);
                  setMoneyManageNotice(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Close manager"
                testID="money-manager-close-button"
              >
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
          {renderManagerBody()}
        </View>
      );
    };
    const offerRows: readonly SummaryMetricCard[] = [
      { label: "Paid video unlocks", value: creatorPaidVideoOffers.length ? `${creatorPaidVideoOffers.length} configured` : paidContentStatus, body: paidVideoPaidTransactions.length ? `${paidVideoPaidTransactions.length} verified sandbox unlock${paidVideoPaidTransactions.length === 1 ? "" : "s"} totaling ${formatMonetizationCurrency(paidVideoGrossCents, "usd")}.` : `Offer type: paid_video. Setup configs saved: ${sandboxConfigCount("paid_content")}. Setup mode uses approved sandbox tiers and valid source ids only.`, tone: creatorPaidVideoOffers.length || sandboxConfigCount("paid_content") ? "default" : sectionTone(paidContentStatus) === "default" ? "default" : "unavailable" },
      { label: "Paid Watch-Party Seat Passes", value: creatorPaidWatchPartyOffers.length ? `${creatorPaidWatchPartyOffers.length} configured` : watchPartyTicketsStatus, body: paidWatchPartyPaidTransactions.length ? `${paidWatchPartyPaidTransactions.length} verified sandbox Seat Pass purchase${paidWatchPartyPaidTransactions.length === 1 ? "" : "s"} totaling ${formatMonetizationCurrency(paidWatchPartyGrossCents, "usd")}. Purchases happen before Party Waiting Room and route to Party Room.` : `Offer type: paid_watch_party. Setup configs saved: ${sandboxConfigCount("watch_party_live")}. Purchases must happen before Party Waiting Room and route to Party Room.`, tone: creatorPaidWatchPartyOffers.length || sandboxConfigCount("watch_party_live") ? "default" : "unavailable" },
      { label: "Channel Subscriptions", value: creatorChannelSubscriptionOffers.length ? `${creatorChannelSubscriptionOffers.length} configured` : digitalSalesStatus === "Sandbox ready" ? "Needs attention" : "Not set up", body: channelSubscriptionPaidTransactions.length ? `${channelSubscriptionPaidTransactions.length} verified sandbox subscription transaction${channelSubscriptionPaidTransactions.length === 1 ? "" : "s"} totaling ${formatMonetizationCurrency(channelSubscriptionGrossCents, "usd")}. Active access includes this creator's subscriber area and ordinary Paid Videos without per-video economics.` : `Offer type: channel_subscription. Setup configs saved: ${sandboxConfigCount("channel_subscription")}. Active access includes this creator's ordinary Paid Videos; Premium, VIP-only content, Watch-Party Seat Passes, and Event Passes stay separate.`, tone: creatorChannelSubscriptionOffers.length || sandboxConfigCount("channel_subscription") ? "default" : "unavailable" },
      { label: "VIP passes", value: creatorVipPassOffers.length ? `${creatorVipPassOffers.length} configured` : digitalSalesStatus === "Sandbox ready" ? "Needs attention" : "Not set up", body: vipPaidTransactions.length ? `${vipPaidTransactions.length} verified sandbox VIP purchase${vipPaidTransactions.length === 1 ? "" : "s"} totaling ${formatMonetizationCurrency(vipGrossCents, "usd")}. Each pass unlocks this creator's VIP Area and VIP-only shelf for 30 days.` : `Offer type: vip_pass. Setup configs saved: ${sandboxConfigCount("vip_pass")}. VIP is one-time and 30 days; Premium, ordinary Paid Video ownership, Watch-Party Seat Passes, Event Passes, Channel Subscriptions, and Tips stay separate.`, tone: creatorVipPassOffers.length || sandboxConfigCount("vip_pass") ? "default" : "unavailable" },
      { label: "Paid event passes", value: creatorPaidEventOffers.length ? `${creatorPaidEventOffers.length} configured` : digitalSalesStatus === "Sandbox ready" ? "Needs attention" : "Not set up", body: paidEventPaidTransactions.length ? `${paidEventPaidTransactions.length} verified sandbox event pass${paidEventPaidTransactions.length === 1 ? "" : "es"} totaling ${formatMonetizationCurrency(paidEventGrossCents, "usd")}. Event passes unlock only the linked creator event.` : `Offer type: paid_event. Setup configs saved: ${sandboxConfigCount("event")}. Event passes unlock only the linked creator event and stay separate from Premium, VIP, paid videos, and Watch-Party Seat Passes.`, tone: creatorPaidEventOffers.length || sandboxConfigCount("event") ? "default" : "unavailable" },
      { label: "Physical merch", value: merchStatus, body: "Offer type: merch. Physical goods stay separate from digital access.", tone: sectionTone(merchStatus) === "default" ? "default" : "unavailable" },
      { label: "Saved setup configs", value: `${creatorSandboxConfigs.length} saved`, body: "Saved creator configs are sandbox/not-payable. Production sales require owner/provider activation.", tone: creatorSandboxConfigs.length ? "default" : "unavailable" },
    ];
    const transactionFilters: readonly { id: MoneyTransactionFilter; label: string }[] = [
      { id: "all", label: "All" },
      { id: "tips", label: "Tips" },
      { id: "videos", label: "Videos" },
      { id: "rooms", label: "Rooms" },
      { id: "subscriptions", label: "Subscriptions" },
      { id: "vip", label: "VIP" },
      { id: "events", label: "Events" },
      { id: "merch", label: "Merch" },
    ];
    const transactionMatchesFilter = (event: MoneyAuditEvent) => {
      const haystack = `${event.title} ${event.sourceLabel} ${event.summary} ${event.capability ?? ""}`.toLowerCase();
      if (moneyTransactionFilter === "all") return true;
      if (moneyTransactionFilter === "tips") return haystack.includes("tip");
      if (moneyTransactionFilter === "videos") return haystack.includes("video") || haystack.includes("content");
      if (moneyTransactionFilter === "rooms") return haystack.includes("room") || haystack.includes("watch-party") || haystack.includes("ticket") || haystack.includes("seat");
      if (moneyTransactionFilter === "subscriptions") return haystack.includes("subscription") || haystack.includes("subscriber");
      if (moneyTransactionFilter === "vip") return haystack.includes("vip");
      if (moneyTransactionFilter === "events") return haystack.includes("event");
      if (moneyTransactionFilter === "merch") return haystack.includes("merch") || haystack.includes("order");
      return true;
    };
    const filteredTransactionEvents = creatorMoneyAuditEvents.filter(transactionMatchesFilter);
    const visibleTipTransactions = moneyTransactionFilter === "all" || moneyTransactionFilter === "tips"
      ? creatorTipTransactions
      : [];
    const visiblePaidVideoTransactions = moneyTransactionFilter === "all" || moneyTransactionFilter === "videos"
      ? creatorPaidVideoTransactions
      : [];
    const visiblePaidWatchPartyTransactions = moneyTransactionFilter === "all" || moneyTransactionFilter === "rooms"
      ? creatorPaidWatchPartyTransactions
      : [];
    const visiblePaidEventTransactions = moneyTransactionFilter === "all" || moneyTransactionFilter === "events"
      ? creatorPaidEventTransactions
      : [];
    const visibleVipTransactions = moneyTransactionFilter === "all" || moneyTransactionFilter === "vip"
      ? creatorVipTransactions
      : [];
    const visibleChannelSubscriptionTransactions = moneyTransactionFilter === "all" || moneyTransactionFilter === "subscriptions"
      ? creatorChannelSubscriptionTransactions
      : [];
    const renderTipTransactionRows = () => {
      if (!visibleTipTransactions.length) return null;
      return (
        <View style={styles.eventList}>
          {visibleTipTransactions.map((transaction) => (
            <View key={transaction.id} style={styles.eventEmptyCard}>
              <View style={styles.eventCardHeader}>
                <Text style={styles.eventEmptyTitle}>
                  {formatMonetizationCurrency(transaction.amountCents, transaction.currency)} tip
                </Text>
                {renderStudioStatusPill(transaction.status === "paid" ? "Paid" : transaction.status, transaction.status === "paid" ? "default" : transaction.status === "failed" || transaction.status === "refunded" || transaction.status === "disputed" ? "warning" : "muted")}
              </View>
              <Text style={styles.eventEmptyBody}>
                {transaction.createdAt ? new Date(transaction.createdAt).toLocaleString() : "Date unavailable"} · {transaction.providerEnvironment === "test" ? "Test mode" : transaction.providerEnvironment}
              </Text>
              {transaction.messagePrivate ? <Text style={styles.noticeText}>{transaction.messagePrivate}</Text> : null}
              <Text style={styles.eventEmptyBody}>
                Tips do not unlock content, badges, room access, VIP, subscriptions, or perks. Payout status: {transaction.payoutStatus}.
              </Text>
            </View>
          ))}
        </View>
      );
    };
    const renderPaidVideoTransactionRows = () => {
      if (!visiblePaidVideoTransactions.length) return null;
      return (
        <View style={styles.eventList}>
          {visiblePaidVideoTransactions.map((transaction) => (
            <View key={transaction.id} style={styles.eventEmptyCard}>
              <View style={styles.eventCardHeader}>
                <Text style={styles.eventEmptyTitle}>
                  {formatMonetizationCurrency(transaction.amountCents, transaction.currency)} video unlock
                </Text>
                {renderStudioStatusPill(transaction.status === "paid" ? "Paid" : transaction.status, transaction.status === "paid" ? "default" : transaction.status === "failed" || transaction.status === "refunded" || transaction.status === "chargeback" ? "warning" : "muted")}
              </View>
              <Text style={styles.eventEmptyBody}>
                {transaction.videoTitle} · {transaction.createdAt ? new Date(transaction.createdAt).toLocaleString() : "Date unavailable"} · {transaction.environment === "sandbox" ? "Sandbox" : transaction.environment}
              </Text>
              <Text style={styles.eventEmptyBody}>
                Paid Videos unlock only this creator video. Premium and Tips stay separate. Payout status: {transaction.payoutStatus}.
              </Text>
            </View>
          ))}
        </View>
      );
    };
    const renderPaidWatchPartyTransactionRows = () => {
      if (!visiblePaidWatchPartyTransactions.length) return null;
      return (
        <View style={styles.eventList}>
          {visiblePaidWatchPartyTransactions.map((transaction) => (
            <View key={transaction.id} style={styles.eventEmptyCard}>
              <View style={styles.eventCardHeader}>
                <Text style={styles.eventEmptyTitle}>
                  {formatMonetizationCurrency(transaction.amountCents, transaction.currency)} Seat Pass
                </Text>
                {renderStudioStatusPill(transaction.status === "paid" ? "Paid" : transaction.status, transaction.status === "paid" ? "default" : transaction.status === "failed" || transaction.status === "refunded" || transaction.status === "revoked" ? "warning" : "muted")}
              </View>
              <Text style={styles.eventEmptyBody}>
                {formatWatchPartySeatPassDisplayTitle(transaction.roomTitle)} · {transaction.createdAt ? new Date(transaction.createdAt).toLocaleString() : "Date unavailable"} · {transaction.environment === "sandbox" ? "Sandbox" : transaction.environment}
              </Text>
              <Text style={styles.eventEmptyBody}>
                Paid Watch-Party Seat Passes unlock only this Party Waiting Room and Party Room. Premium, Tips, Paid Videos, VIP, subscriptions, events, and Live Stage stay separate. Payout status: {transaction.payoutStatus}.
              </Text>
            </View>
          ))}
        </View>
      );
    };
    const renderChannelSubscriptionTransactionRows = () => {
      if (!visibleChannelSubscriptionTransactions.length) return null;
      return (
        <View style={styles.eventList}>
          {visibleChannelSubscriptionTransactions.map((transaction) => {
            const readbackStatus = getChannelSubscriptionReadbackStatus(transaction);
            return (
              <View key={transaction.id} style={styles.eventEmptyCard}>
                <View style={styles.eventCardHeader}>
                  <Text style={styles.eventEmptyTitle}>
                    {formatMonetizationCurrency(transaction.amountCents, transaction.currency)} channel subscription
                  </Text>
                  {renderStudioStatusPill(readbackStatus.label, readbackStatus.tone)}
                </View>
                <Text style={styles.eventEmptyBody}>
                  {transaction.title} · {transaction.createdAt ? new Date(transaction.createdAt).toLocaleString() : "Date unavailable"} · {transaction.environment === "sandbox" ? "Sandbox" : transaction.environment}
                </Text>
                <Text style={styles.eventEmptyBody}>
                  {readbackStatus.accessCopy}
                </Text>
                <Text style={styles.eventEmptyBody}>
                  Active Channel Subscriptions unlock this creator’s subscriber area and ordinary Paid Videos without a per-video purchase. Premium, VIP-only content, Watch-Party Seat Passes, Paid Events, and Tips stay separate. Payout status: {transaction.payoutStatus}.
                </Text>
              </View>
            );
          })}
        </View>
      );
    };
    const renderVipTransactionRows = () => {
      if (!visibleVipTransactions.length) return null;
      return (
        <View style={styles.eventList}>
          {visibleVipTransactions.map((transaction) => (
            <View key={transaction.id} style={styles.eventEmptyCard}>
              <View style={styles.eventCardHeader}>
                <Text style={styles.eventEmptyTitle}>
                  {formatMonetizationCurrency(transaction.amountCents, transaction.currency)} VIP pass
                </Text>
                {renderStudioStatusPill(transaction.status === "paid" ? "Paid" : transaction.status, transaction.status === "paid" ? "default" : transaction.status === "failed" || transaction.status === "refunded" || transaction.status === "revoked" ? "warning" : "muted")}
              </View>
              <Text style={styles.eventEmptyBody}>
                {transaction.title} · {transaction.createdAt ? new Date(transaction.createdAt).toLocaleString() : "Date unavailable"} · {transaction.environment === "sandbox" ? "Sandbox" : transaction.environment}
              </Text>
              <Text style={styles.eventEmptyBody}>
                VIP unlocks this creator’s VIP state and VIP-only shelf for exactly 30 days. Premium, Tips, ordinary Paid Video ownership, Watch-Party Seat Passes, Paid Events, Channel Subscriptions, LiveKit authority, and room permissions stay separate. Payout status: {transaction.payoutStatus}.
              </Text>
            </View>
          ))}
        </View>
      );
    };
    const renderPaidEventTransactionRows = () => {
      if (!visiblePaidEventTransactions.length) return null;
      return (
        <View style={styles.eventList}>
          {visiblePaidEventTransactions.map((transaction) => (
            <View key={transaction.id} style={styles.eventEmptyCard}>
              <View style={styles.eventCardHeader}>
                <Text style={styles.eventEmptyTitle}>
                  {formatMonetizationCurrency(transaction.amountCents, transaction.currency)} event pass
                </Text>
                {renderStudioStatusPill(transaction.status === "paid" ? "Paid" : transaction.status, transaction.status === "paid" ? "default" : transaction.status === "failed" || transaction.status === "refunded" || transaction.status === "revoked" ? "warning" : "muted")}
              </View>
              <Text style={styles.eventEmptyBody}>
                {transaction.eventTitle} · {transaction.createdAt ? new Date(transaction.createdAt).toLocaleString() : "Date unavailable"} · {transaction.environment === "sandbox" ? "Sandbox" : transaction.environment}
              </Text>
              <Text style={styles.eventEmptyBody}>
                Paid Events unlock only this creator event. Premium, Tips, Paid Videos, Watch-Party Seat Passes, VIP, and subscriptions stay separate. Payout status: {transaction.payoutStatus}.
              </Text>
            </View>
          ))}
        </View>
      );
    };

    const openWaysToEarn = () => {
      setActiveMoneyManageTarget(null);
      setMoneyManageNotice(null);
      focusMoneyCenterSection("ways_to_earn");
      setExpandedMonetizationSections((current) => new Set([...current, "ways_to_earn"]));
      router.setParams({
        tab: "monetization",
        focus: "ways_to_earn",
      });
    };
    const renderMoneyCenterOverviewContent = () => (
      <View testID="money-center-overview-panel">
        <View style={styles.summaryGrid}>
          {[
            { label: "Available balance", value: "Not payable" },
            { label: "Ways to Earn", value: `${monetizationFeatureCards.filter((card) => card.status === "Setup mode" || card.status === "Active").length} setup` },
            { label: "Transactions", value: creatorMoneyAuditEvents.length ? `${creatorMoneyAuditEvents.length} recorded` : "None yet" },
            { label: "Payout readiness", value: canReviewCashoutReadiness ? "Review" : payoutsStatus },
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
            onPress={openWaysToEarn}
            hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Open Ways to Earn"
            testID="money-center-open-ways-to-earn-button"
          >
            <Text style={styles.eventPrimaryButtonText}>Open Ways to Earn</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.eventSecondaryButton}
            activeOpacity={0.88}
            onPress={() => router.push("/subscribe" as Parameters<typeof router.push>[0])}
            hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Manage Premium"
          >
            <Text style={styles.eventSecondaryButtonText}>Manage Premium</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
    const renderWaysToEarnContent = (
      testID = "money-center-ways-to-earn-panel",
    ) => (
      <View testID={testID}>
        <View style={styles.eventEmptyCard}>
          <Text style={styles.eventEmptyTitle}>Premium is separate from creator purchases.</Text>
          <Text style={styles.eventEmptyBody}>
            {"Fans do not buy Chi'llywood Premium when they tip, unlock a video, get a Seat Pass, subscribe to a creator, get VIP, or buy an event pass."}
          </Text>
          <MoneyScopeInfoButton scope="premium" label="What does Premium unlock?" />
        </View>
        <View style={styles.summaryGrid}>
          {monetizationFeatureCards.map((feature) => (
            <React.Fragment key={`money-feature-with-manager-${feature.key}`}>
              {renderFeatureCard(feature)}
              {activeMoneyManageTarget === feature.key ? (
                <View style={styles.moneyFeatureManagerInline}>
                  {renderActiveMoneyManagerPanel()}
                </View>
              ) : null}
            </React.Fragment>
          ))}
        </View>
      </View>
    );
    const renderMoneyTransactionsContent = (testID = "money-center-transactions-panel") => (
      <View testID={testID}>
        <View style={styles.filterRow}>
          {transactionFilters.map((filter) => (
            <TouchableOpacity
              key={filter.id}
              style={[styles.filterChip, moneyTransactionFilter === filter.id && styles.filterChipActive]}
              activeOpacity={0.86}
              onPress={() => setMoneyTransactionFilter(filter.id)}
            >
              <Text style={[styles.filterChipText, moneyTransactionFilter === filter.id && styles.filterChipTextActive]}>{filter.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {renderTipTransactionRows()}
        {renderPaidVideoTransactionRows()}
        {renderPaidWatchPartyTransactionRows()}
        {renderChannelSubscriptionTransactionRows()}
        {renderVipTransactionRows()}
        {renderPaidEventTransactionRows()}
        {renderCreatorMoneyEventRows(
          filteredTransactionEvents,
          "No transactions yet",
          "Tips, video unlocks, Seat Passes, subscriptions, VIP purchases, event passes, merch, refunds, failed payments, and chargebacks will appear here when supported.",
          8,
        )}
      </View>
    );
    const renderPayoutReadinessContent = (testID = "money-manager-cashout-readiness") => (
      <View testID={testID}>
        {renderSummaryMetricCards(payoutCards)}
        <View style={styles.eventEmptyCard}>
          <Text style={styles.eventEmptyTitle}>Cashout not live yet.</Text>
          <Text style={styles.eventEmptyBody}>
            Creators can review payout setup and blockers here. No real payout will be sent, no payable balance is created, and cashout requires approval before live money movement.
          </Text>
          <MoneyScopeInfoButton scope="payout_readiness" label="What does payout setup mean?" />
        </View>
        <View style={styles.eventActionRow}>
          <TouchableOpacity
            style={styles.eventPrimaryButton}
            activeOpacity={0.88}
            onPress={handleReviewCashoutReadiness}
            hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
            accessibilityRole="button"
            accessibilityLabel="Review cashout readiness"
            testID="money-payout-review-readiness-button"
          >
            <Text style={styles.eventPrimaryButtonText}>Review cashout readiness</Text>
          </TouchableOpacity>
        </View>
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
        <Text style={styles.noticeText}>Payouts and cashout remain OFF for production money movement.</Text>
        {renderCreatorMoneyEventRows(
          payoutEvents,
          "No payout activity yet",
          "Payout setup and requests are not withdrawable while payout and live-money switches are off.",
          4,
        )}
      </View>
    );
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
            { label: "Live money", value: getMoneyFeatureStateLabel(liveMoneyFeatureFlag.state), body: "Live money stays off until owner approval and provider checks pass.", tone: "unavailable" },
          ])}
          <View style={styles.eventActionRow}>
            <TouchableOpacity
              style={styles.eventSecondaryButton}
              activeOpacity={0.88}
              hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
              onPress={handleRefreshSandboxTesterExperience}
              testID="money-center-status-refresh-button"
              accessibilityRole="button"
              accessibilityLabel="Refresh Money Center status"
            >
              <Text style={styles.eventSecondaryButtonText}>Refresh status</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.eventSecondaryButton}
              activeOpacity={0.88}
              hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
              onPress={openMoneyTransactions}
              testID="money-center-status-transactions-button"
              accessibilityRole="button"
              accessibilityLabel="Open Money Center transaction status"
            >
              <Text style={styles.eventSecondaryButtonText}>View status ledger</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <>
        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <View style={styles.panelHeaderCopy}>
              <Text style={styles.panelTitle}>Money Center</Text>
              <Text style={styles.panelSubtitle}>Creator earnings, offers, transactions, payout readiness, and setup.</Text>
            </View>
            {renderStudioStatusPill(`Sandbox ${sandboxSetupStatus}`, sandboxSetupStatus === "Ready" ? "default" : sandboxSetupStatus === "Partially Ready" ? "warning" : "muted")}
          </View>
          <Text style={styles.permissionCopy}>
            Sandbox/test mode. No real charges, payouts, cashout, or withdrawals.
          </Text>
          {renderMoneyCenterOverviewContent()}
        </View>

        <View
          style={styles.studioAccordionStack}
          testID="money-center-monetization-section-stack"
        >
          {renderMonetizationAccordion({
            id: "ways_to_earn",
            title: "Ways to Earn",
            summary: "The six creator monetization setup flows in one actionable view.",
            status: monetizationActive ? "Active" : creatorSetupModeActive ? "Setup mode" : "Needs attention",
            statusTone: monetizationActive || creatorSetupModeActive ? "default" : "muted",
            children: renderWaysToEarnContent("money-center-ways-to-earn-panel"),
          })}

          {renderMonetizationAccordion({
            id: "offers",
            title: "Offers",
            summary: "Paid creator offers in one consolidated list.",
            status: digitalSalesStatus,
            statusTone: sectionTone(digitalSalesStatus),
            children: (
              <>
                {renderSummaryMetricCards(offerRows)}
                {creatorSandboxConfigs.length ? (
                  <View style={styles.eventList} testID="money-saved-sandbox-config-readback">
                    {creatorSandboxConfigs.slice(0, 8).map((config) => (
                      <View key={config.id} style={styles.eventEmptyCard}>
                        <View style={styles.eventCardHeader}>
                          <Text style={styles.eventEmptyTitle}>
                            {config.sourceType === "watch_party_live"
                              ? formatWatchPartySeatPassDisplayTitle(config.displayName)
                              : config.displayName || formatCreatorSetupSourceLabel(config.sourceType)}
                          </Text>
                          {renderStudioStatusPill("Sandbox / not payable", "default")}
                        </View>
                        <Text style={styles.eventEmptyBody}>
                          {formatCreatorSetupSourceLabel(config.sourceType)} · {config.priceLabel} · Production sales off · Payouts off
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.eventEmptyCard}>
                    <Text style={styles.eventEmptyTitle}>No saved setup configs yet.</Text>
                    <Text style={styles.eventEmptyBody}>Use Ways to Earn to save sandbox/not-payable setup for each creator flow.</Text>
                  </View>
                )}
                {creatorPaidVideoOffers.length ? (
                  <View style={styles.eventList}>
                    {creatorPaidVideoOffers.map((offer) => (
                      <View
                        key={offer.id}
                        style={[styles.eventEmptyCard, activeMoneyManageTarget === "paid_videos" && styles.moneyFocusedCard]}
                      >
                        <View style={styles.eventCardHeader}>
                          <Text style={styles.eventEmptyTitle}>{offer.title}</Text>
                          <View style={styles.scopeInfoHeaderRow}>
                            <MoneyScopeInfoButton scope="paid_creator_video" compact />
                            {renderStudioStatusPill(offer.status === "sandbox" ? "Sandbox" : offer.status, offer.isPaid ? "default" : "muted")}
                          </View>
                        </View>
                        <Text style={styles.eventEmptyBody}>
                          paid_video · {formatMonetizationCurrency(offer.priceCents, offer.currency)} · {offer.salesCount} sale{offer.salesCount === 1 ? "" : "s"} · {formatMonetizationCurrency(offer.totalRevenueCents, offer.currency)} sandbox gross
                        </Text>
                        <TouchableOpacity
                          style={styles.eventSecondaryButton}
                          activeOpacity={0.86}
                          onPress={() => {
                            const video = creatorVideos.find((entry) => entry.id === offer.videoId);
                            if (video) onEditVideo(video);
                          }}
                        >
                          <Text style={styles.eventSecondaryButtonText}>Manage</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : null}
                {creatorPaidWatchPartyOffers.length ? (
                  <View style={styles.eventList}>
                    {creatorPaidWatchPartyOffers.map((offer) => {
                      const displayTitle = formatWatchPartySeatPassDisplayTitle(offer.title);
                      return (
                        <View
                          key={offer.id}
                          style={[styles.eventEmptyCard, activeMoneyManageTarget === "paid_watch_parties" && styles.moneyFocusedCard]}
                        >
                          <View style={styles.eventCardHeader}>
                            <Text style={styles.eventEmptyTitle}>{displayTitle}</Text>
                            <View style={styles.scopeInfoHeaderRow}>
                              <MoneyScopeInfoButton scope="watch_party_ticket" compact />
                              {renderStudioStatusPill(offer.status === "sandbox" ? "Sandbox" : offer.status, offer.status === "sandbox" || offer.status === "sold_out" ? "default" : "muted")}
                            </View>
                          </View>
                          <Text style={styles.eventEmptyBody}>
                            paid_watch_party · {formatMonetizationCurrency(offer.priceCents, offer.currency)} · {offer.seatsSold}{offer.seatLimit ? ` / ${offer.seatLimit}` : ""} seats sold · Party Room {offer.partyId ?? "not linked"}
                          </Text>
                          <Text style={styles.eventEmptyBody}>
                            Purchases happen before Party Waiting Room and route to Party Room, not Live Stage. Sandbox rows are not payable.
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
                {creatorChannelSubscriptionOffers.length ? (
                  <View style={styles.eventList}>
                    {creatorChannelSubscriptionOffers.map((offer) => (
                      <View
                        key={offer.id}
                        style={[styles.eventEmptyCard, activeMoneyManageTarget === "channel_subscriptions" && styles.moneyFocusedCard]}
                      >
                        <View style={styles.eventCardHeader}>
                          <Text style={styles.eventEmptyTitle}>{offer.title}</Text>
                          <View style={styles.scopeInfoHeaderRow}>
                            <MoneyScopeInfoButton scope="channel_subscription" compact />
                            {renderStudioStatusPill(offer.status === "sandbox" ? "Sandbox" : offer.status, offer.status === "sandbox" ? "default" : "muted")}
                          </View>
                        </View>
                        <Text style={styles.eventEmptyBody}>
                          channel_subscription · {formatChannelSubscriptionPrice(offer.priceCents, offer.currency)} · {offer.subscriberCount} recorded subscriber signal{offer.subscriberCount === 1 ? "" : "s"}
                        </Text>
                        <Text style={styles.eventEmptyBody}>
                          Subscriber access and included ordinary Paid Videos are decided by the effective access gate, not stale provider rows. Premium, VIP-only content, Watch-Party Seat Passes, Paid Events, and Tips stay separate.
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {creatorVipPassOffers.length ? (
                  <View style={styles.eventList}>
                    {creatorVipPassOffers.map((offer) => (
                      <View
                        key={offer.id}
                        style={[styles.eventEmptyCard, activeMoneyManageTarget === "vip_passes" && styles.moneyFocusedCard]}
                      >
                        <View style={styles.eventCardHeader}>
                          <Text style={styles.eventEmptyTitle}>{offer.title}</Text>
                          <View style={styles.scopeInfoHeaderRow}>
                            <MoneyScopeInfoButton scope="vip_pass" compact />
                            {renderStudioStatusPill(offer.status === "sandbox" ? "Sandbox" : offer.status, offer.status === "sandbox" ? "default" : "muted")}
                          </View>
                        </View>
                        <Text style={styles.eventEmptyBody}>
                          vip_pass · {formatCreatorVipPassPrice(offer.priceCents, offer.currency)} · {offer.vipCount} VIP fan signal{offer.vipCount === 1 ? "" : "s"}
                        </Text>
                        <Text style={styles.eventEmptyBody}>
                          VIP unlocks this creator’s VIP Area and VIP-only shelf for 30 days. Premium, ordinary Paid Video ownership, Watch-Party Seat Passes, Paid Events, Channel Subscriptions, Tips, LiveKit authority, and room permissions stay separate.
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                {creatorPaidEventOffers.length ? (
                  <View style={styles.eventList}>
                    {creatorPaidEventOffers.map((offer) => (
                      <View
                        key={offer.id}
                        style={[styles.eventEmptyCard, activeMoneyManageTarget === "paid_events" && styles.moneyFocusedCard]}
                      >
                        <View style={styles.eventCardHeader}>
                          <Text style={styles.eventEmptyTitle}>{offer.title}</Text>
                          <View style={styles.scopeInfoHeaderRow}>
                            <MoneyScopeInfoButton scope="event_pass" compact />
                            {renderStudioStatusPill(offer.status === "sandbox" ? "Sandbox" : offer.status, offer.status === "sandbox" || offer.status === "sold_out" ? "default" : "muted")}
                          </View>
                        </View>
                        <Text style={styles.eventEmptyBody}>
                          paid_event · {formatMonetizationCurrency(offer.priceCents, offer.currency)} · {offer.passesSold}{offer.capacityLimit ? ` / ${offer.capacityLimit}` : ""} passes sold · {formatEventTypeLabel(offer.eventType as CreatorEventType)}
                        </Text>
                        <Text style={styles.eventEmptyBody}>
                          Event passes unlock only this creator event. Premium, VIP, Paid Videos, Watch-Party Seat Passes, Tips, and subscriptions stay separate.
                        </Text>
                        <TouchableOpacity
                          style={styles.eventSecondaryButton}
                          activeOpacity={0.86}
                          onPress={() => {
                            const event = creatorEvents.find((entry) => entry.id === offer.creatorEventId);
                            if (event) onEditEvent(event);
                          }}
                        >
                          <Text style={styles.eventSecondaryButtonText}>Manage</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                ) : null}
                {renderCreatorMoneyEventRows(
                  [...digitalEvents, ...merchEvents],
                  "No offers yet",
                  "Paid video unlocks, paid Watch-Party Seat Passes, creator subscriptions, VIP passes, event passes, and merch appear here when backed rows exist.",
                  6,
                )}
                <View style={styles.eventEmptyCard}>
                  <Text style={styles.eventEmptyTitle}>Physical merch scope</Text>
                  <Text style={styles.eventEmptyBody}>
                    Merch is a physical-goods setup path only. It does not unlock Premium, VIP, subscriptions, Seat Passes, events, LiveKit authority, or payout access.
                  </Text>
                  <MoneyScopeInfoButton scope="merch_physical_good" label="What does merch include?" />
                </View>
                {renderStudioActionRow({
                  title: "Configure supported sandbox offers",
                  body: "Use only approved sandbox tiers for backed paid videos, Watch-Party Seat Passes, channel subscriptions, VIP passes, event passes, tips, and physical merch. Live money stays disabled.",
                  value: "Offers",
                  onPress: () => setExpandedMonetizationSections((current) => new Set([...current, "offers"])),
                })}
              </>
            ),
          })}

          {renderMonetizationAccordion({
            id: "transactions",
            title: "Transactions",
            summary: "One filtered transaction history for creator money activity.",
            status: creatorMoneyAuditEvents.length ? "Available" : "Empty",
            statusTone: creatorMoneyAuditEvents.length ? "default" : "muted",
            children: renderMoneyTransactionsContent("money-center-transactions-accordion-panel"),
          })}

          {renderMonetizationAccordion({
            id: "payouts",
            title: "Cashout / Payout readiness",
            summary: "Cashout readiness, KYC/tax status, and unavailable payout actions.",
            status: canReviewCashoutReadiness ? "Readiness" : payoutsStatus,
            statusTone: canReviewCashoutReadiness ? "default" : sectionTone(payoutsStatus),
            children: renderPayoutReadinessContent("money-manager-cashout-readiness-accordion"),
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
            summary: "Sanitized readiness for creator payment, payout, and purchase providers.",
            status: providerOverallStatus,
            statusTone: providerOverallStatus === "Sandbox ready" || providerOverallStatus === "Active" ? "default" : "muted",
            children: (
              <>
                {renderSummaryMetricCards(providerCards)}
                {renderSummaryMetricCards(technicalCards)}
                {renderCreatorMoneyEventRows(
                  providerEvents,
                  "No provider readiness details yet",
                  "Provider readiness details are sanitized and never expose secrets or private provider details.",
                  6,
                )}
              </>
            ),
          })}

          {renderMonetizationAccordion({
            id: "testing_proof",
            title: "Sandbox QA",
            summary: "Advanced tester setup, checklist, and proof-only status for internal QA.",
            status: sandboxSetupStatus,
            statusTone: sandboxSetupStatus === "Ready" ? "default" : sandboxSetupStatus === "Partially Ready" ? "warning" : "muted",
            children: (
              <View testID="money-sandbox-setup-section" accessibilityLabel="Sandbox Tester Experience">
                <View style={styles.sandboxSafetyBanner}>
                  <Text style={styles.sandboxSafetyTitle}>Test mode - no payouts</Text>
                  <Text style={styles.sandboxSafetyBody}>No real charges. No creator earnings. No withdrawals.</Text>
                </View>
                <View style={styles.summaryGrid}>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Sandbox Testing</Text>
                    <Text style={styles.summaryValue}>{sandboxSetupStatus}</Text>
                    <Text style={styles.summaryBody}>
                      {sandboxConfiguredCount} of {sandboxTesterOfferCards.length} flows ready.
                    </Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Tester Access</Text>
                    <Text style={styles.summaryValue}>{sandboxTesterRows.length > 0 ? `Active testers: ${sandboxTesterRows.length}` : "No active testers"}</Text>
                    <Text style={styles.summaryBody}>
                      Tester access allows sandbox/test-only monetization flows. It does not grant owner, payout, or live-money permissions.
                    </Text>
                  </View>
                </View>
                <Text style={styles.sectionLabel}>Setup checklist</Text>
                <View style={styles.summaryGrid}>
                  {sandboxChecklist.map((step, index) => (
                    <View key={step.label} style={styles.summaryCard}>
                      <Text style={styles.summaryLabel}>{index + 1}. {step.label}</Text>
                      <Text style={styles.summaryValue}>{step.status}</Text>
                      <Text style={styles.summaryBody}>{step.body}</Text>
                    </View>
                  ))}
                </View>
                <View style={styles.summaryGrid}>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Live Money</Text>
                    <Text style={styles.summaryValue}>Off</Text>
                    <Text style={styles.summaryBody}>Provider details stay behind the advanced section.</Text>
                  </View>
                <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Payouts</Text>
                    <Text style={styles.summaryValue}>Off</Text>
                    <Text style={styles.summaryBody}>Cash-out, transfer, and payout release stay locked.</Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Purchase provider</Text>
                    <Text style={styles.summaryValue}>{storeProviderName} sandbox</Text>
                    <Text style={styles.summaryBody}>
                      {`Digital tests use ${storeProviderPair}. Merchandise stays in the separate Stripe lane.`}
                    </Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Next Step</Text>
                    <Text style={styles.summaryValue}>{sandboxNextStep}</Text>
                    <Text style={styles.summaryBody}>
                      {hasOwnerOperatorStudioAccess ? "Owner setup mode." : sandboxTesterActive ? "Tester access active." : "No tester access on this account."}
                    </Text>
                  </View>
                </View>
                <Text style={styles.sectionLabel}>Offer setup</Text>
                <View style={styles.summaryGrid}>
                  {sandboxTesterOfferCards.map((card) => (
                    <View
                      key={card.key}
                      style={[
                        styles.summaryCard,
                        styles.sandboxOfferCard,
                        card.configured ? styles.sandboxOfferCardReady : styles.sandboxOfferCardBlocked,
                      ]}
                      testID={card.testID}
                      accessibilityLabel={`${card.title} sandbox offer status`}
                    >
                      <View style={styles.eventCardHeader}>
                        <Text style={styles.summaryLabel}>{card.title}</Text>
                        <View style={styles.scopeInfoHeaderRow}>
                          <MoneyScopeInfoButton scope={card.scopeKey} compact />
                          {renderStudioStatusPill(card.statusLabel, card.configured ? "default" : card.statusLabel === "Blocked" ? "warning" : "muted")}
                        </View>
                      </View>
                      <Text style={styles.summaryValue}>{card.configured ? "Tester visible" : card.statusLabel}</Text>
                      <Text style={styles.summaryBody}>{card.description}</Text>
                      <Text style={styles.eventEmptyBody}>Sandbox only · No payouts</Text>
                      {card.blocker ? <Text style={styles.noticeText}>{card.blocker}</Text> : null}
                      {card.actionLabel && card.onPress ? (
                        <TouchableOpacity
                          style={styles.eventActionButton}
                          activeOpacity={0.86}
                          onPress={card.onPress}
                          hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
                          testID={card.actionTestID}
                          accessibilityRole="button"
                          accessibilityLabel={card.actionLabel}
                        >
                          <Text style={styles.eventActionButtonText}>{card.actionLabel}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ))}
                </View>
                <View style={styles.eventActionRow}>
                  <TouchableOpacity
                    style={[styles.eventPrimaryButton, sandboxSetupBusy && styles.eventPrimaryButtonDisabled]}
                    activeOpacity={0.88}
                    disabled={sandboxSetupBusy}
                    hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
                    onPress={handleSetupSandboxTesterExperience}
                    testID="money-sandbox-setup-button"
                    accessibilityRole="button"
                    accessibilityLabel="Set up sandbox offers"
                  >
                    {sandboxSetupBusy ? (
                      <View style={styles.eventPrimaryButtonBusyRow}>
                        <ActivityIndicator color="#fff" />
                        <Text style={styles.eventPrimaryButtonText}>{sandboxSetupButtonLabel}</Text>
                      </View>
                    ) : (
                      <Text style={styles.eventPrimaryButtonText}>{sandboxSetupButtonLabel}</Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.eventSecondaryButton, sandboxSetupBusy && styles.eventPrimaryButtonDisabled]}
                    activeOpacity={0.88}
                    disabled={sandboxSetupBusy}
                    hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
                    onPress={handleRefreshSandboxTesterExperience}
                    testID="money-sandbox-refresh-button"
                    accessibilityRole="button"
                    accessibilityLabel="Refresh sandbox status"
                  >
                    <Text style={styles.eventSecondaryButtonText}>Refresh status</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.eventActionRow}>
                  <TouchableOpacity
                    style={styles.eventSecondaryButton}
                    activeOpacity={0.88}
                    hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
                    onPress={previewCreatorPlatform}
                    testID="money-sandbox-open-tester-preview-button"
                    accessibilityRole="button"
                    accessibilityLabel="Open tester preview"
                  >
                    <Text style={styles.eventSecondaryButtonText}>Open tester preview</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.eventSecondaryButton}
                    activeOpacity={0.88}
                    hitSlop={LAUNCH_CRITICAL_HIT_SLOP}
                    onPress={openMoneyTransactions}
                    testID="money-sandbox-manage-testers-button"
                    accessibilityRole="button"
                    accessibilityLabel="View tester access"
                  >
                    <Text style={styles.eventSecondaryButtonText}>View tester access</Text>
                  </TouchableOpacity>
                </View>
                {sandboxSetupNotice ? <Text style={styles.noticeText}>{sandboxSetupNotice}</Text> : null}
              </View>
            ),
          })}
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
            <Text style={styles.panelSubtitle}>What needs attention, plus the controls that resolve it.</Text>
          </View>
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
                  ? "Reports are visible to this account through review access."
                  : "No reports waiting."}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Blocked accounts</Text>
            <Text style={styles.summaryValue}>{blockedAudienceCount == null ? "Protected" : String(blockedAudienceCount)}</Text>
            <Text style={styles.summaryBody}>
              {blockedAudienceCount ? "Platform-owned audience blocks appear here." : "No blocked accounts."}
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
            body: recentSafetyReportCount == null ? "Report status opens the existing safety review path; normal creator review is not exposed here." : recentSafetyReportCount ? "Open report signal details." : "No reports waiting.",
            value: recentSafetyReportCount == null ? "Status path" : recentSafetyReportCount ? String(recentSafetyReportCount) : "Clear",
            tone: recentSafetyReportCount ? "warning" : "muted",
            onPress: () => {
              if (recentSafetyReportCount == null) {
                showStudioUnavailable(
                  "Report status",
                  "Creator-facing report review is not available to this account yet. Platform reports are still handled through the existing safety review flow.",
                );
                return;
              }
              showStudioUnavailable(
                recentSafetyReportCount ? "Reports visible" : "No reports waiting",
                recentSafetyReportCount
                  ? "This account has report visibility. Use Admin for operator review actions; Platform Studio keeps creator-facing controls here."
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
    const paidEventOffer = paidEventOfferByCreatorEventId.get(event.id);
    const paidEventBusy = paidEventSavingId === event.id;

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
        <View style={styles.eventActionRow}>
          <TouchableOpacity
            style={styles.eventSecondaryButton}
            activeOpacity={0.86}
            onPress={() => router.push(`/event/${event.id}`)}
          >
            <Text style={styles.eventSecondaryButtonText}>Open Event</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.eventPrimaryButton, paidEventBusy && styles.eventPrimaryButtonDisabled]}
            activeOpacity={0.86}
            onPress={() => onSavePaidEventOffer(event)}
            disabled={paidEventBusy}
          >
            {paidEventBusy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.eventPrimaryButtonText}>
                {paidEventOffer ? "Manage Paid Event" : "Set Paid Event"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
        {paidEventOffer ? (
          <Text style={styles.eventCardBody}>
            Paid Event: {paidEventOffer.status === "sandbox" ? "Sandbox" : paidEventOffer.status} · {formatMonetizationCurrency(paidEventOffer.priceCents, paidEventOffer.currency)} · {paidEventOffer.passesSold}{paidEventOffer.capacityLimit ? ` / ${paidEventOffer.capacityLimit}` : ""} passes sold. Premium, Tips, Paid Videos, Watch-Party Seat Passes, VIP, and subscriptions stay separate.
          </Text>
        ) : null}
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
          body: "Use the creator event form below.",
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

  if (authLoading || betaLoading || (canUseChannelSettings && loading)) {
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

  if (!hasPremiumCreatorToolAccess) {
    return (
      <BetaAccessScreen
        title="Premium required"
        body={`Platform Studio, Brand Studio, Clip Studio, and creator uploads require active Premium entitlement. Open Premium setup when RevenueCat/${storeProviderName} access is available, or use an Owner/Admin account for setup-only review.`}
        primaryActionLabel="Manage Premium"
        primaryActionRoute="/subscribe"
      />
    );
  }

  return (
    <>
    <ImageBackground source={SKYLINE_SOURCE} style={styles.background} resizeMode="cover">
      <View style={styles.overlay} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={studioContentContainerStyle}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.8}>
            <Text style={styles.backArrow}>←</Text>
          </TouchableOpacity>
          <Text style={styles.kicker}>{appDisplayName.toUpperCase()} · PLATFORM STUDIO</Text>
          <NotificationBellButton surface="channel-studio" />
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
              <View style={styles.eventSnapshotCard}>
                <Text style={styles.accessSummaryKicker}>PLATFORM VISIBILITY</Text>
                <Text style={styles.accessSummaryTitle}>Who can view your creator Platform</Text>
                <Text style={styles.accessSummaryBody}>
                  Platform is your creator destination. Public means anyone can view. Private means Circle members or subscribers can view. Subscriber-only means only subscribers can view. Followers stay a public social signal only.
                </Text>
                <View style={styles.chipRow}>
                  {ACCESS_VISIBILITY_OPTIONS.map((option) => {
                    const currentVisibility = normalizeAccessVisibility(profile?.platformAccessVisibility);
                    const active = currentVisibility === option.value;
                    const savingVisibility = platformVisibilitySaving === option.value;

                    return (
                      <TouchableOpacity
                        key={option.value}
                        testID={option.platformTestID}
                        accessibilityLabel={`${option.label} Platform visibility`}
                        style={[styles.chip, active && styles.chipActive, !!platformVisibilitySaving && styles.chipDisabled]}
                        activeOpacity={0.86}
                        disabled={!!platformVisibilitySaving}
                        onPress={() => {
                          void onSavePlatformVisibility(option.value);
                        }}
                      >
                        {savingVisibility ? <ActivityIndicator color="#FFE4EA" size="small" /> : null}
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {option.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <TouchableOpacity
                  testID="platform-visibility-save-button"
                  accessibilityLabel="Save Platform visibility"
                  style={[styles.eventSecondaryButtonCompact, platformVisibilitySaving && styles.chipDisabled]}
                  activeOpacity={0.86}
                  disabled={!!platformVisibilitySaving}
                  onPress={() => {
                    void onSavePlatformVisibility(normalizeAccessVisibility(profile?.platformAccessVisibility));
                  }}
                >
                  <Text style={styles.eventSecondaryButtonText}>
                    {platformVisibilitySaving ? "Saving..." : "Save Platform Visibility"}
                  </Text>
                </TouchableOpacity>
                {platformVisibilityNotice ? <Text style={styles.permissionCopy}>{platformVisibilityNotice}</Text> : null}
              </View>
              <View style={styles.summaryGrid}>
                {audienceSummaryCards.map((card) => (
                  <View key={card.label} style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
              <View style={styles.eventSnapshotCard}>
                <Text style={styles.accessSummaryKicker}>AUDIENCE ACTIONS</Text>
                <Text style={styles.accessSummaryTitle}>Manage people from their profile row</Text>
                <Text style={styles.accessSummaryBody}>
                  Hold a profile photo, tap a row, or use the row action to approve requests, remove followers, block, or unblock. Subscriber mutation and VIP/mod/co-host systems still stay later.
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

              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionLabel}>People</Text>
                <TouchableOpacity
                  style={styles.eventSecondaryButtonCompact}
                  activeOpacity={0.86}
                  onPress={() => void loadAudienceMembers()}
                  disabled={audienceMembersLoading || audienceActionLoading !== null}
                >
                  <Text style={styles.eventSecondaryButtonText}>
                    {audienceMembersLoading ? "Loading" : "Refresh"}
                  </Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.permissionCopy}>
                Pending requests, followers, and blocked people appear here. Hold a profile photo or tap a row for actions.
              </Text>
              {audienceMembersLoading ? (
                <View style={styles.loadingCard}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.loadingText}>Loading audience…</Text>
                </View>
              ) : audienceMembers.length ? (
                <View style={styles.eventList}>
                  {audienceMembers.map(renderAudienceMemberRow)}
                </View>
              ) : (
                <View style={styles.eventEmptyCard}>
                  <Text style={styles.eventEmptyTitle}>No audience actions waiting.</Text>
                  <Text style={styles.eventEmptyBody}>Pending requests, followers, and blocked people will appear here when available.</Text>
                </View>
              )}
            </View>

              </>
            ) : null}

            {activeStudioTab === "insights" ? (
              <>
            <View style={styles.panel}>
              <View style={styles.panelHeader}>
                <View style={styles.panelHeaderCopy}>
                  <Text style={styles.panelTitle}>Insights</Text>
                  <Text style={styles.panelSubtitle}>Track what your Platform data shows today.</Text>
                </View>
                <Text style={styles.panelStatus}>CURRENT SUMMARY</Text>
              </View>
              <Text style={styles.permissionCopy}>
                Only available creator analytics appear here. Unsupported metrics stay unavailable instead of being zeroed or fabricated.
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
              <Text style={styles.sectionLabel}>Audience and Rooms</Text>
              <View style={styles.summaryGrid}>
                {analyticsSummaryCards.map((card) => (
                  <View key={card.label} style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>{card.label}</Text>
                    <Text style={styles.summaryValue}>{card.value}</Text>
                    <Text style={styles.summaryBody}>{card.body}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.sectionLabel}>Live and Events</Text>
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
	    <CreatorContentActionSheet
	      visible={selectedContentActionVideo !== null}
      video={selectedContentActionVideo}
      busy={videoSaving || brandSaving}
      isFeatured={!!selectedContentActionVideo && activeBrandProfile?.spotlightVideoId === selectedContentActionVideo.id}
      onClose={() => {
        if (!videoSaving && !brandSaving) setSelectedContentActionVideo(null);
      }}
      onOpenPlayer={(video) => {
        setSelectedContentActionVideo(null);
        router.push({ pathname: "/player/[id]", params: { id: video.id, source: "creator-video" } });
      }}
      onEditDetails={(video) => {
        setSelectedContentActionVideo(null);
        openClipStudioForVideo(video);
      }}
      onSetVisibility={onSetContentActionVisibility}
      onSetPrice={onSetContentActionPrice}
      onSetVipAccess={onSetContentActionVipAccess}
      onCreateEvent={onCreateEventFromVideo}
      onFeature={onFeatureContentActionVideo}
      onShare={(video) => {
        void onShareContentActionVideo(video);
      }}
	      onDelete={onDeleteVideo}
	    />
	    <Modal
	      visible={uploadSourceTarget !== null}
      animationType="fade"
      transparent
      onRequestClose={() => setUploadSourceTarget(null)}
    >
      <View
        style={styles.uploadSourceBackdrop}
        testID="creator-upload-source-sheet"
        accessibilityLabel="Choose upload source"
      >
        <View style={styles.uploadSourceSheet}>
          <Text style={styles.uploadSourceTitle}>Choose upload source</Text>
          <Text style={styles.uploadSourceBody}>
            Select a video from your gallery or browse files on this device.
          </Text>
          <TouchableOpacity
            style={[styles.uploadSourceButton, styles.uploadSourceButtonPrimary]}
            activeOpacity={0.88}
            onPress={() => runUploadSourceChoice("gallery")}
            testID="creator-upload-source-gallery-button"
            accessibilityRole="button"
            accessibilityLabel="Choose from Photos or Gallery"
          >
            <Text style={styles.uploadSourceButtonText}>Photos / Gallery</Text>
            <Text style={styles.uploadSourceButtonMeta}>Open your video gallery</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.uploadSourceButton}
            activeOpacity={0.88}
            onPress={() => runUploadSourceChoice("files")}
            testID="creator-upload-source-files-button"
            accessibilityRole="button"
            accessibilityLabel="Choose from Files"
          >
            <Text style={styles.uploadSourceButtonText}>Files</Text>
            <Text style={styles.uploadSourceButtonMeta}>Browse device storage</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.uploadSourceCancelButton}
            activeOpacity={0.88}
            onPress={() => setUploadSourceTarget(null)}
            testID="creator-upload-source-cancel-button"
            accessibilityRole="button"
            accessibilityLabel="Cancel upload source chooser"
          >
            <Text style={styles.uploadSourceCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
                  { label: "Provider", value: selectedCreatorMoneyAuditEvent.provider || "No provider" },
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
    gap: 12,
  },
  backArrow: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  kicker: {
    flex: 1,
    color: "#AAB3C7",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.1,
    textAlign: "center",
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
  studioActionButtonDanger: {
    borderColor: "rgba(255,75,104,0.42)",
    backgroundColor: "rgba(220,20,60,0.14)",
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
  studioStickyAction: {
    flex: 1,
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
  brandAssetThumb: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.055)",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  brandAssetThumbImage: {
    width: "100%",
    height: "100%",
  },
  brandAssetThumbText: {
    color: "#DDE6F8",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
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
  assetManagerSheetOverlay: {
    ...(Platform.OS === "web" ? { position: "fixed" as "absolute" } : null),
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flex: 1,
    minHeight: "100%",
    height: "100%",
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.54)",
    zIndex: 1000,
  },
  assetManagerSheet: {
    ...(Platform.OS === "web" ? { height: "86%" as "86%" } : null),
    maxHeight: "86%",
    overflow: "hidden",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(9,13,21,0.98)",
    paddingTop: 10,
    paddingHorizontal: 14,
    paddingBottom: 18,
  },
  assetManagerSheetHandle: {
    alignSelf: "center",
    width: 44,
    height: 5,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.24)",
    marginBottom: 12,
  },
  assetManagerSheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 4,
    paddingBottom: 12,
  },
  assetManagerSheetTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },
  assetManagerSheetSummary: {
    color: "#AEB8CE",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  assetManagerSheetScroll: {
    maxHeight: "100%",
  },
  assetManagerSheetBody: {
    gap: 10,
    paddingBottom: 22,
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
    minHeight: 156,
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
  brandPreviewOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  brandPreviewFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  brandPreviewEmpty: {
    width: "100%",
    height: "100%",
    minHeight: 96,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
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
    flexWrap: "wrap",
    gap: 10,
  },
  brandStatusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
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
  segmentButtonDisabled: {
    opacity: 0.46,
  },
  segmentButtonDanger: {
    borderColor: "rgba(255,107,129,0.38)",
    backgroundColor: "rgba(255,107,129,0.12)",
  },
  segmentButtonText: {
    color: "#B9C3D9",
    fontSize: 12,
    fontWeight: "900",
  },
  segmentButtonTextActive: {
    color: "#fff",
  },
  creatorReplayCard: {
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.055)",
    padding: 12,
    gap: 12,
  },
  creatorReplayHeader: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  creatorReplayThumb: {
    width: 74,
    aspectRatio: 1,
    borderRadius: 14,
    backgroundColor: "rgba(220,20,60,0.18)",
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  creatorReplayThumbText: {
    color: "#FFD6DE",
    fontSize: 11,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  creatorReplayCopy: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  creatorReplayKicker: {
    color: "#91A3C2",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  creatorReplayTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
  },
  creatorReplayMeta: {
    color: "#D7DEF0",
    fontSize: 11,
    fontWeight: "800",
  },
  creatorReplayBody: {
    color: "#9EAAC2",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  creatorReplayActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
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
  contentLibraryStatsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginTop: 4,
    marginBottom: 4,
  },
  contentLibraryStatPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.055)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  contentLibraryStatText: {
    color: "#DCE3F1",
    fontSize: 10.5,
    fontWeight: "800",
  },
  contentSearchInput: {
    marginTop: 8,
    marginBottom: 2,
  },
  contentShelf: {
    marginTop: 14,
    gap: 8,
  },
  contentShelfHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  contentShelfTitle: {
    color: "#F7F9FF",
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "900",
  },
  contentShelfCount: {
    color: "#8E9AAF",
    fontSize: 11,
    fontWeight: "800",
  },
  contentShelfRow: {
    gap: 9,
    paddingRight: 8,
  },
  contentShelfCard: {
    width: 150,
  },
  contentReplayCard: {
    width: 150,
    aspectRatio: 9 / 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(126,215,255,0.18)",
    backgroundColor: "rgba(10,14,22,0.94)",
    overflow: "hidden",
  },
  contentEventCard: {
    width: 150,
    aspectRatio: 9 / 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.22)",
    backgroundColor: "rgba(18,10,18,0.94)",
    padding: 11,
    justifyContent: "flex-end",
    gap: 7,
  },
  contentReplayPoster: {
    flex: 1,
    padding: 11,
    paddingTop: 44,
    justifyContent: "flex-end",
    gap: 7,
  },
  contentReplayKicker: {
    color: "#AAB5C9",
    fontSize: 9.5,
    fontWeight: "900",
    letterSpacing: 0.6,
  },
  contentReplayTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "900",
  },
  contentReplayBottom: {
    gap: 2,
  },
  contentReplayMeta: {
    color: "#B7C1D4",
    fontSize: 9.5,
    lineHeight: 13,
    fontWeight: "700",
  },
  contentShelfOverflow: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(5,7,12,0.74)",
  },
  contentShelfOverflowText: {
    color: "#FFFFFF",
    fontSize: 14,
    lineHeight: 16,
    fontWeight: "900",
    marginTop: -4,
  },
  contentCreateFooter: {
    marginTop: 18,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    paddingTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
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
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 4,
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
  moneyFeatureCard: {
    flexBasis: "47%",
    minWidth: 154,
  },
  moneyFeatureHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  moneyFocusedCard: {
    borderColor: "rgba(220,20,60,0.52)",
    backgroundColor: "rgba(220,20,60,0.12)",
  },
  moneyFeatureManagerInline: {
    flexBasis: "100%",
    width: "100%",
  },
  moneyManageNoticeCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(242,194,91,0.36)",
    backgroundColor: "rgba(242,194,91,0.1)",
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 10,
    gap: 4,
  },
  sandboxSafetyBanner: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(115,134,255,0.25)",
    backgroundColor: "rgba(115,134,255,0.12)",
    paddingHorizontal: 13,
    paddingVertical: 12,
    marginBottom: 12,
    gap: 3,
  },
  sandboxSafetyTitle: {
    color: "#E4E9FF",
    fontSize: 12.5,
    fontWeight: "900",
  },
  sandboxSafetyBody: {
    color: "#BFC8E3",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "700",
  },
  sandboxOfferCard: {
    minWidth: 150,
  },
  sandboxOfferCardReady: {
    borderColor: "rgba(45,153,92,0.34)",
    backgroundColor: "rgba(45,153,92,0.09)",
  },
  sandboxOfferCardBlocked: {
    borderColor: "rgba(242,194,91,0.28)",
    backgroundColor: "rgba(242,194,91,0.07)",
  },
  summaryLabel: {
    color: "#8590A6",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
    flexShrink: 1,
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
  scopeInfoHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexShrink: 0,
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
    flexWrap: "wrap",
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
    flexShrink: 1,
  },
  eventEmptyBody: {
    color: "#ACB5C9",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "600",
  },
  eventActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 4,
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.05)",
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  filterChipActive: {
    borderColor: "rgba(220,20,60,0.48)",
    backgroundColor: "rgba(220,20,60,0.18)",
  },
  filterChipText: {
    color: "#B9C3D6",
    fontSize: 11,
    fontWeight: "900",
  },
  filterChipTextActive: {
    color: "#FFFFFF",
  },
  eventPrimaryButton: {
    flex: 1,
    minWidth: 132,
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
    flexGrow: 1,
    minWidth: 132,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  eventSecondaryButtonCompact: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  eventSecondaryButtonText: {
    color: "#D9E0EE",
    fontSize: 12,
    fontWeight: "800",
    textAlign: "center",
  },
  audienceMemberCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
    padding: 12,
  },
  audienceMemberAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
  },
  audienceMemberAvatarImage: {
    width: "100%",
    height: "100%",
  },
  audienceMemberAvatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  audienceMemberCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  audienceMemberTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  audienceMemberName: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  audienceMemberMeta: {
    color: "#AAB6CD",
    fontSize: 11.5,
    lineHeight: 16,
    fontWeight: "700",
  },
  audienceMemberActions: {
    alignItems: "flex-end",
    gap: 8,
  },
  memberActionButton: {
    minWidth: 78,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  },
  memberActionButtonPrimary: {
    borderColor: "rgba(112,211,166,0.28)",
    backgroundColor: "rgba(20,110,76,0.38)",
  },
  memberActionButtonText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "900",
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
  uploadSourceBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.66)",
  },
  uploadSourceSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "#090D15",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 28,
    gap: 12,
  },
  uploadSourceTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  uploadSourceBody: {
    color: "#B8C1D6",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "700",
    marginBottom: 4,
  },
  uploadSourceButton: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(255,255,255,0.06)",
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 3,
  },
  uploadSourceButtonPrimary: {
    borderColor: "rgba(220,20,60,0.55)",
    backgroundColor: "rgba(220,20,60,0.2)",
  },
  uploadSourceButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  uploadSourceButtonMeta: {
    color: "#AAB4C8",
    fontSize: 12,
    fontWeight: "700",
  },
  uploadSourceCancelButton: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  uploadSourceCancelText: {
    color: "#DDE4F3",
    fontSize: 13,
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
