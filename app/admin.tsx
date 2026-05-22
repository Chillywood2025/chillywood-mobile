import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  DEFAULT_APP_CONFIG,
  getThemePresetPalette,
  normalizeAppConfig,
  type AppConfig,
  type AppBackgroundMode,
  type AppThemePreset,
  type HomeRailKey,
} from "../_lib/appConfig";
import { placeholderAdProvider } from "../_lib/ads/providers/placeholder";
import {
  requestLegalEvidenceAction,
  type LegalEvidenceTargetType,
} from "../_lib/adminLegalEvidence";
import {
  activateBreakGlass,
  applyPermissionTemplate,
  createLegalRequest,
  endBreakGlass,
  listLegalRequests,
  listOwnerControlAudit,
  listOwnerControlCanaries,
  listPermissionTemplates,
  readBreakGlassStatus,
  readLegalRequestDetail,
  readOwnerSecurityStatus,
  revokeAllTemporaryOwnerGrants,
  revokeOwnerDevice,
  revokePermissionTemplate,
  revokeTemporaryOwnerGrant,
  runOwnerControlCanary,
  runOwnerSecurityChecklist,
  trustCurrentOwnerDevice,
  updateLegalRequest,
  type OwnerControlAuditRow,
  type OwnerControlBreakGlassSession,
  type OwnerControlCanaryResult,
  type OwnerControlCanaryRun,
  type OwnerControlLegalRequestDetail,
  type OwnerControlLegalRequestEvent,
  type OwnerControlLegalRequest,
  type OwnerControlPermissionTemplate,
  type OwnerControlSafetyDashboard,
  type OwnerControlSecurityStatus,
  type OwnerSecurityAuditEvent,
  type OwnerSecurityDevice,
  type OwnerSecurityLiveOpsFlag,
  type OwnerTemporaryGrant,
} from "../_lib/adminOwnerControls";
import { FEATURE_FLAGS, type AppRuntimeControls } from "../_lib/featureFlags";
import type { Database } from "../supabase/database.types";
import { getBetaAccessBlockCopy, useBetaProgram } from "../_lib/betaProgram";
import { reportDebugError, reportDebugQuery } from "../_lib/devDebug";
import { RACHI_OFFICIAL_ACCOUNT } from "../_lib/officialAccounts";
import {
  getRuntimeConfig,
  getRuntimeConfigIssues,
  isLiveKitRuntimeConfigured,
} from "../_lib/runtimeConfig";
import { useSession } from "../_lib/session";
import {
  readAdminAuditLog,
  applyAdminReportTargetAction,
  canAccessAuditExplorerTools,
  canAccessBreakGlassTools,
  canAccessDmcaTools,
  canAccessLegalEvidenceTools,
  canAccessLegalRequestIntakeTools,
  canAccessLiveOpsTools,
  canAccessAdminConsole,
  canManageStaffPermissionTemplates,
  canManageAdminRoleAssignments,
  canManageModeratorRoleAssignments,
  canManagePrivilegedAdminWrites,
  canReviewSafetyQueue,
  formatPlatformRoleDisplayLabel,
  getModerationAccess,
  grantPlatformStaffRoleByEmail,
  hasPlatformStaffPermission,
  hasPlatformRoleMembership,
  listAdminReportAuditEvents,
  listAdminRoleAuditEvents,
  readMyPlatformRoleMemberships,
  readPlatformRoleRoster,
  readPlatformStaffPermissionsByEmail,
  readSafetyReportQueue,
  revokePlatformStaffRoleByEmail,
  resolvePlatformActorRole,
  updatePlatformStaffPermissionsByEmail,
  updateAdminReportStatusAction,
  type AdminAuditLogEntry,
  type AdminAuditLogReadModel,
  type PlatformRoleAuditEvent,
  type PlatformRoleMembership,
  type PlatformRoleRosterEntry,
  type PlatformRoleRosterReadModel,
  type PlatformStaffPermissionKey,
  type PlatformStaffManagementRole,
  type SafetyReportQueueItem,
  type SafetyReportQueueSummary,
} from "../_lib/moderation";
import {
  normalizeCreatorPermissionSet,
  normalizeSponsorPlacement,
  normalizeTitleAccessRule,
  readCreatorPermissions,
  sanitizeCreatorTitleMonetization,
  type CreatorPermissionSet,
  type SponsorPlacement,
  type TitleAccessRule,
} from "../_lib/monetization";
import {
  formatUsageBytes,
  formatUsageMinutes,
  readAdminUsageReadModel,
  type AdminProviderUsageImportStatus,
  type AdminUsageReadModel,
} from "../_lib/platformUsage";
import {
  DEFAULT_LIVE_COST_GUARD_SETTINGS,
  LIVE_COST_GUARD_ACTION_TYPES,
  LIVE_COST_GUARD_MODES,
  classifyLiveCostSeverity,
  createManualLiveCostGuardEvent,
  formatEstimatedLiveCost,
  getLiveCostGuardSettings,
  listLiveCostGuardActions,
  listLiveCostGuardEvents,
  requestLiveCostGuardAction,
  updateLiveCostGuardSettings,
  type LiveCostGuardAction,
  type LiveCostGuardActionType,
  type LiveCostGuardEvent,
  type LiveCostGuardMode,
  type LiveCostGuardSettings,
  type LiveCostGuardSettingsReadModel,
} from "../_lib/adminLiveCostGuard";
import {
  formatLiveOpsTimestamp,
  formatLiveOpsToken,
  readLiveOpsFixCenter,
  requestLiveOpsFixCenterAction,
  type LiveOpsActionAudit,
  type LiveOpsFixCenterAction,
  type LiveOpsFixCenterReadModel,
  type LiveOpsIncident,
} from "../_lib/adminLiveOpsFixCenter";
import {
  formatFinanceFoundationCount,
  readAdminFinanceReadModel,
  type AdminFinanceReadModel,
} from "../_lib/platformFinance";
import {
  formatAdminAuditFoundationCount,
  readAdminImmutableAuditReadModel,
  type AdminImmutableAuditReadModel,
  type PlatformAdminAuditLogRow,
} from "../_lib/platformAudit";
import {
  DMCA_CONTENT_ACTIONS,
  DMCA_CONTENT_TYPES,
  DMCA_NOTIFICATION_TEMPLATES,
  adminDmcaCreateCase,
  adminDmcaAddStrike,
  adminDmcaForwardCounterNotice,
  adminDmcaMarkRestoreEligible,
  adminDmcaRecordContentAction,
  adminDmcaRecordCounterNotice,
  adminDmcaRecordCourtAction,
  adminDmcaSetCaseStatus,
  adminDmcaUpdateStrikeStatus,
  getDmcaNoticeCompleteness,
  readAdminDmcaCaseDetail,
  readAdminDmcaCaseSummary,
  readAdminDmcaCases,
  type AdminDmcaCreateCaseInput,
  type DmcaCase,
  type DmcaCaseDetail,
  type DmcaCaseSummary,
  type DmcaCaseStatus,
  type DmcaContentAction,
  type DmcaContentType,
} from "../_lib/dmca";
import { supabase } from "../_lib/supabase";
import { BetaAccessScreen } from "../components/system/beta-access-screen";

type TitleId = Database["public"]["Tables"]["titles"]["Row"]["id"];

type StatusType = "draft" | "published" | "scheduled" | "archived";
type ContentProgrammingActionType =
  | "create_title"
  | "update_title"
  | "feature"
  | "unfeature"
  | "pin_top_row"
  | "unpin_top_row"
  | "trend"
  | "untrend"
  | "set_hero"
  | "remove_hero"
  | "sort_increment"
  | "sort_decrement"
  | "publish"
  | "unpublish"
  | "archive"
  | "restore";

type ContentConfirmState =
  | {
      kind: "save_config";
      title: string;
      body: string;
      actionLabel: string;
      tone: OwnerControlTone;
    }
  | {
      kind: "title_action";
      title: string;
      body: string;
      actionLabel: string;
      tone: OwnerControlTone;
      titleId: TitleId | null;
      actionType: ContentProgrammingActionType;
      patch: Partial<TitleRow>;
      successText: string;
    }
  | {
      kind: "save_editor";
      title: string;
      body: string;
      actionLabel: string;
      tone: OwnerControlTone;
    }
  | {
      kind: "creator_grants";
      title: string;
      body: string;
      actionLabel: string;
      tone: OwnerControlTone;
    };

type ContentAuditRow = {
  id: string;
  action: string;
  action_category?: string | null;
  actor_email?: string | null;
  actor_role?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  target_user_id?: string | null;
  reason?: string | null;
  severity?: string | null;
  created_at?: string | null;
};

type TitleRow = {
  id: TitleId;
  title: string;
  created_at?: string | null;
  category?: string | null;
  year?: number | null;
  runtime?: string | null;
  synopsis?: string | null;
  poster_url?: string | null;
  video_url?: string | null;
  featured?: boolean | null;
  is_published?: boolean | null;
  sort_order?: number | null;
  is_hero?: boolean | null;
  is_trending?: boolean | null;
  pin_to_top_row?: boolean | null;
  thumbnail_url?: string | null;
  preview_video_url?: string | null;
  status?: string | null;
  release_at?: string | null;
  content_access_rule?: TitleAccessRule | null;
  ads_enabled?: boolean | null;
  sponsor_placement?: SponsorPlacement | null;
  sponsor_label?: string | null;
};

type FilterKey =
  | "all"
  | "published"
  | "scheduled"
  | "draft"
  | "archived"
  | "featured"
  | "hero"
  | "trending"
  | "top-row";

type EditorMode = "create" | "edit";
type OperatorTabKey =
  | "home"
  | "reports"
  | "dmca"
  | "content"
  | "roles"
  | "audit"
  | "audit-explorer"
  | "permission-templates"
  | "break-glass"
  | "owner-security"
  | "canary"
  | "safety-dashboard"
  | "rachi"
  | "users"
  | "premium"
  | "kill-switches"
  | "usage"
  | "ads"
  | "revenue"
  | "payouts"
  | "networks"
  | "sponsors"
  | "fraud"
  | "live-cost-guard"
  | "live-ops-fix-center"
  | "legal"
  | "ops-alerts"
  | "system";

type EditorForm = {
  id?: TitleId;
  title: string;
  category: string;
  year: string;
  runtime: string;
  synopsis: string;
  poster_url: string;
  thumbnail_url: string;
  video_url: string;
  preview_video_url: string;
  featured: boolean;
  is_hero: boolean;
  is_trending: boolean;
  pin_to_top_row: boolean;
  status: StatusType;
  release_at: string;
  sort_order: string;
  content_access_rule: TitleAccessRule;
  ads_enabled: boolean;
  sponsor_placement: SponsorPlacement;
  sponsor_label: string;
};

const BASE_SELECT = "id,title,created_at,category,year,runtime,synopsis,poster_url,video_url,featured,is_published,sort_order";

type AdminCapabilities = {
  heroCol: "is_hero" | "hero" | null;
  trendingCol: "is_trending" | "trending" | null;
  topRowCol: "pin_to_top_row" | "top_row" | null;
  releaseCol: "release_at" | "release_date" | null;
  statusCol: "status" | null;
  thumbnailCol: "thumbnail_url" | null;
  previewCol: "preview_video_url" | null;
  contentAccessCol: "content_access_rule" | null;
  adsEnabledCol: "ads_enabled" | null;
  sponsorPlacementCol: "sponsor_placement" | null;
  sponsorLabelCol: "sponsor_label" | null;
};

type AdminDashboardCard = {
  label: string;
  value: string;
  body: string;
  tone?: "default" | "unavailable";
  destination?: OperatorTabKey;
};

type AdminHomeTone = "default" | "success" | "danger" | "manual" | "locked" | "info";
type AdminHomeTruthQualifier =
  | "Backed"
  | "Connected"
  | "Foundation Only"
  | "Observe Only"
  | "DB Estimate"
  | "Not Connected"
  | "Read Only"
  | "Manual Review Required"
  | "Queue Ready";

type AdminHomeSignalTile = {
  label: string;
  value: string;
  body: string;
  qualifier: AdminHomeTruthQualifier;
  tone: AdminHomeTone;
  destination?: OperatorTabKey;
};

type AdminHomeAttentionItem = {
  label: string;
  value: string;
  body: string;
  priorityLabel: string;
  tone: AdminHomeTone;
  destination?: OperatorTabKey;
};

type AdminHomeBoundaryItem = {
  label: string;
  body: string;
  proofLabel: string;
  tone: AdminHomeTone;
};

type AdminHomeActivityItem = {
  id: string;
  title: string;
  meta: string;
  target: string;
  tone: AdminHomeTone;
};

type AdminHomeQuickAction = {
  label: string;
  body: string;
  destination: OperatorTabKey;
  tone: AdminHomeTone;
};

type ReportTargetModerationStatus = "hidden" | "removed" | "clean";

type PendingReportTargetModerationAction = {
  status: ReportTargetModerationStatus;
  targetType: SafetyReportQueueItem["targetType"];
  targetId: string;
  reason: string;
  reportId?: number | null;
  reportSourceSurface?: string | null;
};

type ReportTriageFilterKey =
  | "needs_review"
  | "critical"
  | "creator_video"
  | "profile_post"
  | "player"
  | "actioned"
  | "all";

const REPORT_TRIAGE_FILTERS: readonly {
  key: ReportTriageFilterKey;
  label: string;
}[] = [
  { key: "needs_review", label: "Needs Review" },
  { key: "critical", label: "Critical" },
  { key: "creator_video", label: "Creator Videos" },
  { key: "profile_post", label: "Profile Posts" },
  { key: "player", label: "Player" },
  { key: "actioned", label: "Actioned" },
  { key: "all", label: "All" },
];

const REPORT_AUDIT_UNAVAILABLE_REASON =
  "Recent report-specific audit rows are shown when immutable admin audit rows are connected for this target.";

type AdminV1ReadModel = AdminUsageReadModel & {
  loading: boolean;
};

type AdminFinanceReadModelWithLoading = AdminFinanceReadModel & {
  loading: boolean;
};

type AdminImmutableAuditReadModelWithLoading = AdminImmutableAuditReadModel & {
  loading: boolean;
};

const statusOptions: StatusType[] = ["draft", "published", "scheduled", "archived"];
const operatorTabs: { key: OperatorTabKey; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "reports", label: "Reports" },
  { key: "dmca", label: "DMCA" },
  { key: "content", label: "Content" },
  { key: "roles", label: "Roles" },
  { key: "audit", label: "Audit" },
  { key: "audit-explorer", label: "Audit Explorer" },
  { key: "permission-templates", label: "Permission Templates" },
  { key: "break-glass", label: "Break Glass" },
  { key: "owner-security", label: "Owner Security" },
  { key: "canary", label: "Canary" },
  { key: "safety-dashboard", label: "Safety" },
  { key: "rachi", label: "Rachi" },
  { key: "users", label: "Users" },
  { key: "premium", label: "Premium" },
  { key: "kill-switches", label: "Kill Switches" },
  { key: "usage", label: "Usage" },
  { key: "ads", label: "Ads" },
  { key: "revenue", label: "Revenue" },
  { key: "payouts", label: "Payouts" },
  { key: "networks", label: "Networks" },
  { key: "sponsors", label: "Sponsors" },
  { key: "fraud", label: "Fraud" },
  { key: "live-cost-guard", label: "Live Cost Guard" },
  { key: "live-ops-fix-center", label: "Live Ops Fix Center" },
  { key: "legal", label: "Legal" },
  { key: "ops-alerts", label: "Ops Alerts" },
  { key: "system", label: "System" },
];
const legalEvidenceTargetOptions: readonly { key: LegalEvidenceTargetType; label: string }[] = [
  { key: "user_id", label: "User / Account" },
  { key: "profile_channel", label: "Profile / Channel" },
  { key: "creator_video", label: "Creator Video" },
  { key: "profile_post", label: "Profile Post" },
  { key: "comment", label: "Comment / Reply" },
  { key: "social_attachment", label: "Attachment" },
  { key: "content_id", label: "Content ID" },
  { key: "room_id", label: "Room" },
  { key: "live_room", label: "Live Metadata" },
  { key: "chat_thread_id", label: "Chat Thread" },
  { key: "report_id", label: "Report ID" },
  { key: "dmca_case", label: "DMCA Case" },
  { key: "date_range", label: "Date Range" },
];
const staffPermissionOptions: readonly { key: PlatformStaffPermissionKey; label: string }[] = [
  { key: "support_inbox", label: "Support Inbox" },
  { key: "user_lookup", label: "User Lookup" },
  { key: "content_moderation", label: "Content Moderation" },
  { key: "reports_review", label: "Reports Review" },
  { key: "live_ops", label: "Live Ops" },
  { key: "billing_support_read", label: "Billing Support" },
  { key: "creator_support", label: "Creator Support" },
  { key: "legal_review", label: "Legal Review" },
  { key: "evidence_preview", label: "Evidence Preview" },
  { key: "dmca_review", label: "DMCA Review" },
  { key: "copyright_review", label: "Copyright Review" },
  { key: "evidence_export", label: "Evidence Export" },
  { key: "legal_hold", label: "Legal Hold" },
  { key: "legal_ops", label: "Legal Ops" },
  { key: "emergency_break_glass", label: "Break Glass" },
  { key: "admin_grants", label: "Admin Grants" },
  { key: "manage_moderators", label: "Moderator Grants" },
  { key: "audit_review", label: "Audit Review" },
  { key: "security_review", label: "Security Review" },
  { key: "staff_permission_templates", label: "Permission Templates" },
  { key: "legal_request_intake", label: "Legal Intake" },
];
const staffPermissionLabelByKey = staffPermissionOptions.reduce<Record<PlatformStaffPermissionKey, string>>((acc, option) => {
  acc[option.key] = option.label;
  return acc;
}, {} as Record<PlatformStaffPermissionKey, string>);

const staffPermissionGroups: readonly {
  key: string;
  label: string;
  body: string;
  permissions: readonly PlatformStaffPermissionKey[];
}[] = [
  {
    key: "support",
    label: "Support",
    body: "Support inbox, user lookup, billing readout, and creator support.",
    permissions: ["support_inbox", "user_lookup", "billing_support_read", "creator_support"],
  },
  {
    key: "moderation",
    label: "Moderation",
    body: "Reports, evidence preview, content moderation, and audit review.",
    permissions: ["content_moderation", "reports_review", "evidence_preview", "audit_review"],
  },
  {
    key: "live_ops",
    label: "Live Operations",
    body: "Live Ops, Live Cost Guard, and operations alert surfaces.",
    permissions: ["live_ops"],
  },
  {
    key: "legal",
    label: "Legal / DMCA",
    body: "Legal intake, copyright review, evidence export, and legal hold workflows.",
    permissions: ["legal_request_intake", "legal_review", "legal_ops", "dmca_review", "copyright_review", "evidence_export", "legal_hold"],
  },
  {
    key: "security",
    label: "Security / Admin",
    body: "Owner-controlled admin grants, templates, security review, and Break Glass.",
    permissions: ["security_review", "staff_permission_templates", "admin_grants", "manage_moderators", "emergency_break_glass"],
  },
];
type RoleAuditFilterKey = "all" | "grants" | "revokes" | "permissions" | "owners" | "admins" | "moderators";
const roleAuditFilterOptions: readonly { key: RoleAuditFilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "grants", label: "Grants" },
  { key: "revokes", label: "Revokes" },
  { key: "permissions", label: "Permissions" },
  { key: "owners", label: "Owners" },
  { key: "admins", label: "Admins" },
  { key: "moderators", label: "Moderators" },
];
type RoleConfirmState =
  | {
      kind: "revoke_role";
      email: string;
      role: PlatformStaffManagementRole;
      title: string;
      body: string;
    }
  | {
      kind: "save_permissions";
      email: string;
      selectedPermissions: PlatformStaffPermissionKey[];
      title: string;
      body: string;
    };
const EMPTY_ADMIN_V1_READ_MODEL: AdminV1ReadModel = {
  loading: false,
  premiumActiveCount: null,
  activeLiveRoomCount: null,
  activeWatchPartyCount: null,
  uploadsTodayCount: null,
  storageMetadataEstimateBytes: null,
  storageMetadataRowsRead: null,
  participantMinutesEstimate: null,
  participantMembershipRowsRead: null,
  bandwidthMeteringBytes: null,
  bandwidthMeteringRowsRead: null,
  internalUsageSchemaConnected: false,
  usageMeterEventsCount: null,
  usageDailySummariesCount: null,
  usageMonthlySummariesCount: null,
  providerUsageSchemaConnected: false,
  providerAccountsCount: null,
  providerUsageImportsCount: null,
  providerUsageDailyCount: null,
  providerBillingSnapshotsCount: null,
  providerBillingSnapshotImportedCount: null,
  providerUsageReconciliationCount: null,
  providerUsageReconciliationPendingCount: null,
  providerUsageReconciliationMatchedCount: null,
  providerUsageReconciliationVarianceCount: null,
  latestProviderUsageReconciliationStatus: null,
  latestProviderUsageReconciliationAt: null,
  providerImportStatuses: [],
  providerImportedStorageBytes: null,
  providerImportedRequestCount: null,
  providerImportedNetworkMetricCount: null,
  generatedAt: new Date(0).toISOString(),
};
const EMPTY_ADMIN_FINANCE_READ_MODEL: AdminFinanceReadModelWithLoading = {
  loading: false,
  financeLedgerEventCount: null,
  creatorRevenueSourceImportRecordCount: null,
  creatorRevenueSourceImportFoundationCount: null,
  creatorRevenueSourceImportSourceNotConnectedCount: null,
  creatorRevenueSourceImportImportedLaterCount: null,
  creatorRevenueShareRuleCount: null,
  creatorRevenueShareLedgerEntryCount: null,
  creatorRevenueShareLedgerFoundationCount: null,
  creatorPayoutLedgerEntryCount: null,
  creatorPayoutAccountCount: null,
  creatorPayoutAccountTestModeCount: null,
  creatorPayoutAccountReadyLaterCount: null,
  creatorPayoutAccountActionRequiredCount: null,
  creatorPayoutAccountPayoutsEnabledCount: null,
  creatorPayoutOnboardingSessionCount: null,
  creatorPayoutOnboardingLinkCreatedCount: null,
  creatorPayoutEligibilityRecordCount: null,
  creatorPayoutEligibilityProviderReadyCount: null,
  creatorPayoutEligibilityEligibleCount: null,
  creatorPayoutProviderWebhookEventCount: null,
  creatorPayoutProviderWebhookProcessedCount: null,
  creatorPayoutProviderWebhookIgnoredCount: null,
  creatorPayoutProviderWebhookFailedCount: null,
  creatorPayoutReviewRecordCount: null,
  creatorPayoutReviewNoteCount: null,
  creatorPayoutBatchCount: null,
  creatorPayoutBatchItemCount: null,
  creatorPayoutProviderTransferCount: null,
  creatorPayoutProviderTransferSyncRequiredCount: null,
  creatorPayoutProviderTransferSyncedTestCount: null,
  creatorPayoutProviderTransferSyncFailedCount: null,
  creatorPayoutHoldCount: null,
  creatorPayoutAuditLogCount: null,
  creatorMonetizationProfileCount: null,
  creatorContentPriceCount: null,
  paidContentPurchaseCount: null,
  contentAccessGrantCount: null,
  creatorProductCount: null,
  creatorProductOrderCount: null,
  creatorTipTransactionCount: null,
  creatorEarningsLedgerCount: null,
  creatorPayoutRequestCount: null,
  monetizationWebhookEventCount: null,
  monetizationAuditLogCount: null,
  networkBillingAccountCount: null,
  networkInvoiceRecordCount: null,
  networkInvoiceDraftCount: null,
  networkPlanRecordCount: null,
  networkAccountPlanAssignmentCount: null,
  networkQuotaRecordCount: null,
  networkInvoiceLineItemCount: null,
  networkInvoiceLineItemDraftCount: null,
  networkOverageEventCount: null,
  networkOverageWarningOnlyCount: null,
  networkOverageReviewRequiredCount: null,
  networkBillingAuditLogCount: null,
  sponsorBrandRecordCount: null,
  sponsorDealRecordCount: null,
  sponsorCreativeRecordCount: null,
  sponsorPlacementRecordCount: null,
  sponsorDisclosureRecordCount: null,
  sponsorDisclosureRequiredCount: null,
  sponsorReviewLogCount: null,
  sponsorReviewQueueRecordCount: null,
  sponsorReviewQueueFoundationCount: null,
  sponsorReviewQueueDisclosureRequiredCount: null,
  sponsorReviewQueueSafetyRequiredCount: null,
  sponsorReviewQueuePaymentReadinessCount: null,
  sponsorSafetyReviewRecordCount: null,
  sponsorSafetyReviewUnsafeProductCount: null,
  sponsorSafetyReviewScamCount: null,
  sponsorPaymentRecordCount: null,
  sponsorPaymentTestModePlannedCount: null,
  sponsorPayoutSplitRecordCount: null,
  platformFraudHoldCount: null,
  fraudReasonRecordCount: null,
  fraudEvidenceRecordCount: null,
  fraudActionRecordCount: null,
  fraudEnforcementPolicyCount: null,
  fraudEnforcementPolicyFoundationCount: null,
  fraudActionNotExecutableCount: null,
  fraudReviewQueueRecordCount: null,
  fraudReviewQueuePendingCount: null,
  fraudReviewQueueNeedsEvidenceCount: null,
  fraudReviewQueueEscalatedCount: null,
  fraudReviewQueueEnforcementPlannedCount: null,
  fraudReviewQueueAppealedCount: null,
  fraudReviewNoteCount: null,
  fraudAppealRecordCount: null,
  fraudAuditLogCount: null,
  generatedAt: new Date(0).toISOString(),
};
const EMPTY_ADMIN_IMMUTABLE_AUDIT_READ_MODEL: AdminImmutableAuditReadModelWithLoading = {
  loading: false,
  auditLogCount: null,
  latestRows: [],
  connected: false,
  generatedAt: new Date(0).toISOString(),
};
type PlannedKillSwitchRow = {
  label: string;
  controlKey?: keyof AppRuntimeControls;
  body: string;
  badgeLabel?: string;
};

const plannedKillSwitchRows: PlannedKillSwitchRow[] = [
  {
    label: "New Accounts",
    controlKey: "new_accounts_enabled",
    body: "Signup reads this runtime control before account creation. Enforced on signup.",
    badgeLabel: "Enforced on signup",
  },
  {
    label: "Uploads",
    controlKey: "uploads_enabled",
    body: "Creator video upload submit reads this runtime control before storage work. Enforced on upload.",
    badgeLabel: "Enforced on upload",
  },
  {
    label: "Comments",
    controlKey: "comments_enabled",
    body: "Profile post and creator-video comment submit paths read this runtime control before inserts. Enforced on comments.",
    badgeLabel: "Enforced on comments",
  },
  {
    label: "Attachments",
    controlKey: "attachments_enabled",
    body: "Profile post, Profile comment, and creator-video comment attachment submit paths read this runtime control before parent create or attachment upload. Enforced on social attachments.",
    badgeLabel: "Enforced on social attachments",
  },
  {
    label: "Chat",
    controlKey: "chat_enabled",
    body: "Standalone Chi'lly Chat send, call-start, official starter, Profile-to-chat entry, room invite direct-message, Watch-Party room comment, and Live Stage room comment paths read this runtime control before new chat writes or starts. Enforced on chat, invites, and room comments.",
    badgeLabel: "Enforced on chat, invites, and room comments",
  },
  {
    label: "Chat Attachments",
    controlKey: "chat_attachments_enabled",
    body: "Standalone Chi'lly Chat, Watch-Party room, and Live Stage room attachment submits read this runtime control before message insert or attachment upload. Enforced on chat and room attachments.",
    badgeLabel: "Enforced on chat and room attachments",
  },
  {
    label: "Live First",
    controlKey: "live_first_enabled",
    body: "Live First entry gates read this runtime control through the central Premium live helper before room entry or Live Stage route access. Premium remains required when enabled.",
    badgeLabel: "Enforced on Live First entry",
  },
  {
    label: "Live Watch-Party",
    controlKey: "live_watch_party_enabled",
    body: "Live Watch-Party hybrid Live Stage gates read this runtime control through the central Premium live helper before route access or mode toggle. Premium remains required when enabled.",
    badgeLabel: "Enforced on Live Watch-Party entry",
  },
  {
    label: "Watch-Party Live",
    controlKey: "watch_party_live_enabled",
    body: "Watch-Party Live title, player, profile, waiting-room, and direct-room entry gates read this runtime control through the central Premium watch-party helper. Premium remains required when enabled.",
    badgeLabel: "Enforced on Watch-Party Live entry",
  },
  {
    label: "Ads",
    controlKey: "ads_enabled",
    body: "Ads continue to use the existing Ads Launch config foundation. This runtime control is not enforced yet.",
  },
  {
    label: "Creator Posting",
    controlKey: "creator_posting_enabled",
    body: "Creator event creation reads this runtime control before creating a new creator event. Existing event edits are still managed separately. Enforced on creator events.",
    badgeLabel: "Enforced on creator events",
  },
  {
    label: "Profile Posting",
    controlKey: "profile_posting_enabled",
    body: "Profile post creation submit reads this runtime control before creating a post or uploading a post attachment. Enforced on profile posts.",
    badgeLabel: "Enforced on profile posts",
  },
  {
    label: "Max Live Room Minutes",
    body: "No typed runtime control exists for this limit in V1B1. Not connected yet.",
  },
  {
    label: "Max Room Participants",
    body: "No typed runtime control exists for this limit in V1B1. Not connected yet.",
  },
  {
    label: "Max Upload Size",
    controlKey: "max_upload_size_mb",
    body: "Creator video upload validation reads this runtime control before storage upload. Default 5120 MB preserves the existing 5 GB limit when config is missing.",
    badgeLabel: "Enforced before creator-video upload",
  },
  {
    label: "Premium Required For Live",
    controlKey: "premium_required_for_live",
    body: "Existing Premium live gates remain enforced separately. Not enforced yet as a runtime switch.",
  },
  {
    label: "Premium Required For Watch-Party",
    controlKey: "premium_required_for_watch_party",
    body: "Existing Premium watch-party gates remain enforced separately. Not enforced yet as a runtime switch.",
  },
];
const dmcaStatusFilters: (DmcaCaseStatus | "all")[] = [
  "all",
  "received",
  "needs_more_info",
  "under_review",
  "content_disabled",
  "counter_notice_received",
  "waiting_rightsholder_response",
  "eligible_for_restore",
  "repeat_infringer_review",
  "closed",
];
const dmcaStatusActionOptions: DmcaCaseStatus[] = [
  "under_review",
  "needs_more_info",
  "rejected_no_action",
  "uploader_notified",
  "content_disabled",
  "preserved_evidence",
  "eligible_for_restore",
  "repeat_infringer_review",
  "closed",
];
const dmcaActionContentTypes: DmcaContentType[] = [
  "creator_video",
  "profile_post",
  "profile_post_comment",
  "creator_video_comment",
  "social_attachment",
  "comment",
  "reply",
  "attachment",
];
type DmcaNoticeSource = AdminDmcaCreateCaseInput["source"];
type DmcaNoticeFormState = {
  reporterName: string;
  reporterCompany: string;
  reporterEmail: string;
  reporterPhone: string;
  reporterAddress: string;
  reporterIsOwner: boolean;
  authorizedAgentName: string;
  copyrightOwnerName: string;
  copyrightedWorkDescription: string;
  copyrightedWorkUrls: string;
  infringingMaterialDescription: string;
  contentType: DmcaContentType;
  contentId: string;
  contentUrl: string;
  source: DmcaNoticeSource;
  goodFaithStatement: boolean;
  authorityStatement: boolean;
  electronicSignature: string;
};
const dmcaNoticeSourceOptions: readonly { key: DmcaNoticeSource; label: string }[] = [
  { key: "admin_manual", label: "Admin Manual" },
  { key: "support_email_manual", label: "Support Email" },
  { key: "manual_email", label: "Manual Email" },
  { key: "public_form", label: "Public Form" },
  { key: "in_app_report", label: "In-App Report" },
];
const dmcaSupportedStateContentTypes = new Set<DmcaContentType>(dmcaActionContentTypes);
const createDmcaNoticeFormState = (): DmcaNoticeFormState => ({
  reporterName: "",
  reporterCompany: "",
  reporterEmail: "",
  reporterPhone: "",
  reporterAddress: "",
  reporterIsOwner: true,
  authorizedAgentName: "",
  copyrightOwnerName: "",
  copyrightedWorkDescription: "",
  copyrightedWorkUrls: "",
  infringingMaterialDescription: "",
  contentType: "creator_video",
  contentId: "",
  contentUrl: "",
  source: "admin_manual",
  goodFaithStatement: false,
  authorityStatement: false,
  electronicSignature: "",
});
const railLabels: Record<HomeRailKey, string> = {
  top_picks: "Top Picks",
  browse: "Browse",
  favorites: "Favorites",
  continue_watching: "Continue Watching",
};

const themePresetOptions: readonly {
  key: AppThemePreset;
  label: string;
  cue: string;
  body: string;
}[] = [
  { key: "city_night", label: "City Night", cue: "Crimson city glow", body: "Original premium night-city treatment." },
  { key: "lake_glow", label: "Lake Glow", cue: "Cyan shoreline", body: "Cooler lakefront accent palette." },
  { key: "steel_day", label: "Steel Day", cue: "Blue steel glass", body: "Daylight steel-and-skyline mode." },
  { key: "theater_noir", label: "Theater Noir", cue: "Black and gold", body: "Cinema-first darker command mood." },
  { key: "premiere_gold", label: "Premiere Gold", cue: "Warm marquee", body: "Launch-night gold accenting." },
  { key: "red_carpet", label: "Red Carpet", cue: "Crimson premiere", body: "Public programming emphasis." },
  { key: "midnight_blue", label: "Midnight Blue", cue: "Blue midnight", body: "Cool late-night streaming polish." },
  { key: "studio_neon", label: "Studio Neon", cue: "Green studio light", body: "Creator-forward production energy." },
  { key: "chi_town_glow", label: "Chi-Town Glow", cue: "Rose skyline", body: "Chicago nightlife accent pass." },
  { key: "skyline_glass", label: "Skyline Glass", cue: "Glass blue skyline", body: "Lighter glass overlay treatment." },
  { key: "creator_spotlight", label: "Creator Spotlight", cue: "Magenta spotlight", body: "Creator-led programming accent." },
];

const backgroundModeOptions: readonly {
  key: AppBackgroundMode;
  label: string;
  body: string;
}[] = [
  { key: "hero_art", label: "Hero Art", body: "Home leads with backed title artwork when available." },
  { key: "skyline", label: "Skyline", body: "Home leans into the shared Chicago skyline shell." },
];

const contentActionLabels: Record<ContentProgrammingActionType, string> = {
  create_title: "Create Title",
  update_title: "Update Title",
  feature: "Feature",
  unfeature: "Unfeature",
  pin_top_row: "Pin Top Row",
  unpin_top_row: "Unpin Top Row",
  trend: "Trend",
  untrend: "Untrend",
  set_hero: "Set Hero",
  remove_hero: "Remove Hero",
  sort_increment: "Sort +",
  sort_decrement: "Sort -",
  publish: "Publish",
  unpublish: "Unpublish",
  archive: "Archive",
  restore: "Restore",
};

const normalizeStatus = (raw?: string | null, isPublished?: boolean | null): StatusType => {
  const value = (raw ?? "").toLowerCase().trim();
  if (value === "draft" || value === "published" || value === "scheduled" || value === "archived") {
    return value;
  }
  return isPublished === true ? "published" : "draft";
};

const toIdString = (id: TitleId) => String(id);

const toSortNumber = (value?: number | null) =>
  typeof value === "number" && Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;

const toTimestamp = (value?: string | null) => {
  const parsed = Date.parse(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatProgrammingToken = (value: string) =>
  value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());

const stringifyConfig = (config: AppConfig | null) => JSON.stringify(config ?? {});

const formatContentCount = (value: number | null, loading: boolean) => {
  if (loading) return "Loading";
  if (value === null) return "Not Connected";
  return String(value);
};

const formatContentAuditActor = (row: ContentAuditRow) => {
  if (row.actor_role) return formatModerationToken(row.actor_role);
  if (row.actor_email) return maskOperatorIdentity(row.actor_email);
  return "System";
};

const formatContentAuditTarget = (row: ContentAuditRow) => {
  const targetType = row.target_type ? formatModerationToken(row.target_type) : "Content";
  const targetId = row.target_id || row.target_user_id;
  return targetId ? `${targetType} ${formatCompactIdentifier(targetId)}` : targetType;
};

const formatRuntimeControlValue = (value: AppRuntimeControls[keyof AppRuntimeControls]) => {
  if (typeof value === "boolean") return value ? "On by default" : "Off by default";
  return `${value} MB default`;
};

const sortTitlesByProgrammingTruth = (items: TitleRow[]) => {
  return [...items].sort((a, b) => {
    const sortDelta = toSortNumber(a.sort_order) - toSortNumber(b.sort_order);
    if (sortDelta !== 0) return sortDelta;
    const createdDelta = toTimestamp(b.created_at) - toTimestamp(a.created_at);
    if (createdDelta !== 0) return createdDelta;
    return (a.title ?? "").localeCompare(b.title ?? "");
  });
};

const defaultCapabilities: AdminCapabilities = {
  heroCol: null,
  trendingCol: null,
  topRowCol: null,
  releaseCol: null,
  statusCol: null,
  thumbnailCol: null,
  previewCol: null,
  contentAccessCol: null,
  adsEnabledCol: null,
  sponsorPlacementCol: null,
  sponsorLabelCol: null,
};

const toBoolean = (value: unknown) => value === true;

const canonicalizeRow = (row: Record<string, any>): TitleRow => {
  return {
    id: row.id,
    title: row.title,
    created_at: row.created_at,
    category: row.category,
    year: row.year,
    runtime: row.runtime,
    synopsis: row.synopsis,
    poster_url: row.poster_url,
    video_url: row.video_url,
    featured: row.featured,
    is_published: row.is_published,
    sort_order: row.sort_order,
    is_hero: toBoolean(row.is_hero) || toBoolean(row.hero),
    is_trending: toBoolean(row.is_trending) || toBoolean(row.trending),
    pin_to_top_row: toBoolean(row.pin_to_top_row) || toBoolean(row.top_row),
    thumbnail_url: row.thumbnail_url,
    preview_video_url: row.preview_video_url,
    status: row.status,
    release_at: row.release_at ?? row.release_date,
    content_access_rule: normalizeTitleAccessRule(row.content_access_rule),
    ads_enabled: row.ads_enabled === true,
    sponsor_placement: normalizeSponsorPlacement(row.sponsor_placement),
    sponsor_label: row.sponsor_label,
  };
};

const normalizeRows = (rows: TitleRow[]) => {
  return rows
    .map((row) => ({
      ...row,
      status: normalizeStatus(row.status, row.is_published),
      featured: row.featured === true,
      is_hero: row.is_hero === true,
      is_trending: row.is_trending === true,
      pin_to_top_row: row.pin_to_top_row === true,
      is_published: row.is_published === true,
      content_access_rule: normalizeTitleAccessRule(row.content_access_rule),
      ads_enabled: row.ads_enabled === true,
      sponsor_placement: normalizeSponsorPlacement(row.sponsor_placement),
      sponsor_label: row.sponsor_label ?? null,
    }))
    .sort((a, b) => {
      const orderDiff = toSortNumber(a.sort_order) - toSortNumber(b.sort_order);
      if (orderDiff !== 0) return orderDiff;
      return (a.title ?? "").localeCompare(b.title ?? "");
    });
};

const getCompactArtSource = (item: TitleRow) => {
  const poster = (item.poster_url ?? "").trim();
  if (poster.startsWith("http")) return { uri: poster };
  const thumb = (item.thumbnail_url ?? "").trim();
  if (thumb.startsWith("http")) return { uri: thumb };
  return require("../assets/images/chicago-skyline.jpg");
};

const getStatusTone = (status: StatusType) => {
  if (status === "published") return styles.badgePublished;
  if (status === "scheduled") return styles.badgeScheduled;
  if (status === "archived") return styles.badgeArchived;
  return styles.badgeDraft;
};

const hasTitleId = (item: TitleRow, targetId: string) => String(item.id ?? "").trim() === targetId;

const hasHeroFlagCandidate = (titles: TitleRow[]) => titles.some((item) => item.is_hero === true);

const getTopPicksCandidates = (titles: TitleRow[], source: AppConfig["home"]["topPicksSource"]) => {
  if (source === "recent") return [...titles].sort((a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at));
  if (source === "featured") return titles.filter((item) => item.featured === true);
  if (source === "trending") return titles.filter((item) => item.is_trending === true);
  return titles.filter((item) => item.pin_to_top_row === true);
};

const hasTopPicksCandidate = (titles: TitleRow[], source: AppConfig["home"]["topPicksSource"]) =>
  getTopPicksCandidates(titles, source).length > 0;

const applyExperienceConfigGuardrails = (
  config: AppConfig,
  titles: TitleRow[],
): { nextConfig: AppConfig; adjustments: string[] } => {
  const adjustments: string[] = [];
  const nextConfig: AppConfig = {
    ...config,
    home: {
      ...config.home,
      manualHeroTitleId: config.home.heroMode === "manual_title"
        ? String(config.home.manualHeroTitleId ?? "").trim() || null
        : null,
    },
  };

  if (nextConfig.home.heroMode === "manual_title") {
    const manualHeroTitleId = String(nextConfig.home.manualHeroTitleId ?? "").trim();
    const manualHeroExists = manualHeroTitleId.length > 0 && titles.some((item) => hasTitleId(item, manualHeroTitleId));
    if (!manualHeroExists) {
      const fallbackHeroMode = hasHeroFlagCandidate(titles) ? "hero_flag" : "latest";
      nextConfig.home = {
        ...nextConfig.home,
        heroMode: fallbackHeroMode,
        manualHeroTitleId: null,
      };
      adjustments.push(
        fallbackHeroMode === "hero_flag"
          ? "manual hero target was unavailable, so Hero Strategy was reset to HERO FLAG"
          : "manual hero target was unavailable, so Hero Strategy was reset to LATEST",
      );
    }
  } else if (nextConfig.home.heroMode === "hero_flag" && !hasHeroFlagCandidate(titles)) {
    nextConfig.home = {
      ...nextConfig.home,
      heroMode: "latest",
      manualHeroTitleId: null,
    };
    adjustments.push("hero flag strategy had no real hero title, so Hero Strategy was reset to LATEST");
  }

  if (!hasTopPicksCandidate(titles, nextConfig.home.topPicksSource)) {
    const staleSource = nextConfig.home.topPicksSource;
    nextConfig.home = {
      ...nextConfig.home,
      topPicksSource: "recent",
    };
    adjustments.push(`top picks source ${staleSource.replace("_", " ").toUpperCase()} had no real titles, so it was reset to RECENT`);
  }

  return { nextConfig, adjustments };
};

type PublicationState = {
  status: StatusType;
  isPublished: boolean;
  releaseAt: string | null;
  adjustments: string[];
};

const normalizePublicationState = ({
  status,
  releaseAt,
  hasStatusControl,
  hasReleaseControl,
}: {
  status: StatusType;
  releaseAt: string | null;
  hasStatusControl: boolean;
  hasReleaseControl: boolean;
}): PublicationState => {
  const adjustments: string[] = [];
  let nextStatus: StatusType = hasStatusControl ? status : status === "published" ? "published" : "draft";
  let nextReleaseAt = hasReleaseControl ? releaseAt : null;

  const releaseAtTime = nextReleaseAt ? new Date(nextReleaseAt).getTime() : Number.NaN;
  const hasUsableReleaseAt = nextReleaseAt !== null && Number.isFinite(releaseAtTime);
  const releaseInFuture = hasUsableReleaseAt && releaseAtTime > Date.now();

  if (nextStatus === "scheduled") {
    if (!hasUsableReleaseAt) {
      nextStatus = "draft";
      nextReleaseAt = null;
      adjustments.push("scheduled status had no usable release time, so it was reset to DRAFT");
    } else if (!releaseInFuture) {
      nextStatus = "published";
      nextReleaseAt = null;
      adjustments.push("scheduled status was already live, so it was normalized to PUBLISHED");
    }
  }

  if (nextStatus !== "scheduled" && nextReleaseAt) {
    nextReleaseAt = null;
    adjustments.push(`${nextStatus.toUpperCase()} status cleared stale scheduling time`);
  }

  return {
    status: nextStatus,
    isPublished: nextStatus === "published",
    releaseAt: nextReleaseAt,
    adjustments,
  };
};

const formatModerationToken = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return "UNKNOWN";
  if (text.toLowerCase() === "operator") return "Admin";
  return text.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatModerationTimestamp = (value: string | null) => {
  if (!value) return "Pending timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatCompactIdentifier = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return "not set";
  if (text.length <= 12) return text;
  return `${text.slice(0, 6)}...${text.slice(-4)}`;
};

const maskOperatorIdentity = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return "Unknown identity";
  if (text.includes("@")) {
    const [localPart, domain] = text.split("@");
    const safeLocal = localPart.length <= 2 ? localPart : `${localPart.slice(0, 2)}...`;
    return `${safeLocal}@${domain}`;
  }
  if (text.toUpperCase().startsWith("USER ")) {
    return `User ${formatCompactIdentifier(text.slice(5))}`;
  }
  return formatCompactIdentifier(text);
};

const formatAuditDisplayText = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return "";
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, (match) => maskOperatorIdentity(match))
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, (match) => formatCompactIdentifier(match));
};

type OwnerControlTone = "default" | "success" | "danger" | "manual" | "locked" | "info";
type CanaryStatusFilter = "all" | "fail" | "manual_required" | "pass";
type CanaryStatus = "pass" | "fail" | "manual_required";
type OwnerSecurityAuditFilter = "all" | "critical" | "grants" | "devices" | "roles" | "live_ops" | "failed_access";
type LegalSubsection = "intake" | "evidence" | "holds" | "requests" | "exports" | "timeline";
type LegalRequestStatusFilter =
  | "all"
  | "received"
  | "needs_more_info"
  | "under_review"
  | "preserved_legal_hold"
  | "evidence_prepared"
  | "exported"
  | "closed"
  | "rejected_no_action";

const legalSubsectionOptions: readonly { key: LegalSubsection; label: string }[] = [
  { key: "intake", label: "Intake" },
  { key: "evidence", label: "Evidence" },
  { key: "holds", label: "Holds" },
  { key: "requests", label: "Requests" },
  { key: "exports", label: "Exports" },
  { key: "timeline", label: "Timeline" },
];

const legalRequestStatusOptions: readonly { key: LegalRequestStatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "received", label: "Received" },
  { key: "needs_more_info", label: "Needs More Info" },
  { key: "under_review", label: "Under Review" },
  { key: "preserved_legal_hold", label: "Preserved / Legal Hold" },
  { key: "evidence_prepared", label: "Evidence Prepared" },
  { key: "exported", label: "Exported" },
  { key: "closed", label: "Closed" },
  { key: "rejected_no_action", label: "Rejected / No Action" },
];

const legalRequestTypeOptions = [
  "law_enforcement",
  "civil_legal",
  "preservation",
  "court_order",
  "subpoena",
  "emergency",
  "dmca_related",
  "other",
] as const;

const canaryFilterOptions: readonly { key: CanaryStatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "fail", label: "Failed" },
  { key: "manual_required", label: "Manual Required" },
  { key: "pass", label: "Passed" },
];

const ownerSecurityAuditFilterOptions: readonly { key: OwnerSecurityAuditFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "critical", label: "Critical" },
  { key: "grants", label: "Grants" },
  { key: "devices", label: "Devices" },
  { key: "roles", label: "Roles" },
  { key: "live_ops", label: "Live Ops" },
  { key: "failed_access", label: "Failed Access" },
];

const canarySectionOrder = [
  "Owner Protection",
  "Staff Permissions",
  "Premium / Entitlements",
  "Legal / Evidence",
  "DMCA / Copyright",
  "Legal Readiness",
  "Live Ops",
  "Public Web / Support",
  "Auth / Redirects",
  "Cleanup / Proof Hygiene",
] as const;

const normalizeCanaryStatus = (status: unknown): CanaryStatus => {
  const text = String(status ?? "").toLowerCase();
  if (text === "pass" || text === "fail") return text;
  return "manual_required";
};

const ownerToneForStatus = (status: unknown): OwnerControlTone => {
  const normalized = normalizeCanaryStatus(status);
  if (normalized === "pass") return "success";
  if (normalized === "fail") return "danger";
  return "manual";
};

const ownerStatusLabel = (status: unknown) => {
  const normalized = normalizeCanaryStatus(status);
  if (normalized === "pass") return "Pass";
  if (normalized === "fail") return "Failed";
  return "Manual Required";
};

const ownerSecurityToneForStatus = (status: unknown): OwnerControlTone => {
  const text = String(status ?? "").toLowerCase();
  if (!text) return "locked";
  if (["verified", "trusted", "healthy", "passed", "active", "success", "connected"].includes(text)) return "success";
  if (["urgent", "critical", "failed", "revoked", "not_verified", "denied", "danger"].includes(text)) return "danger";
  if (["warning", "manual", "manual_required", "unknown", "not_connected", "needs_review", "limited"].includes(text)) return "manual";
  if (["unavailable", "disabled", "closed", "expired"].includes(text)) return "locked";
  return "info";
};

const ownerSecurityStatusLabel = (status: unknown) => {
  const text = String(status ?? "").trim();
  if (!text) return "Not Connected";
  if (text.toLowerCase() === "not_verified") return "Not Verified";
  if (text.toLowerCase() === "not_connected") return "Not Connected";
  return formatModerationToken(text);
};

const ownerSecurityMetricValue = (value: unknown) => (
  value === null || value === undefined || value === "" ? "Not Connected" : String(value)
);

const ownerSecurityCountTone = (value: unknown): OwnerControlTone => {
  if (value === null || value === undefined) return "locked";
  return Number(value) > 0 ? "manual" : "success";
};

const ownerSecurityRiskTone = (value: unknown): OwnerControlTone => {
  if (value === null || value === undefined) return "locked";
  return Number(value) > 0 ? "danger" : "success";
};

const formatOwnerSecurityActor = (event: OwnerSecurityAuditEvent) => (
  formatAuditDisplayText(event.actor) || formatAuditDisplayText(event.actorRole) || "system"
);

const formatOwnerSecurityTarget = (event: OwnerSecurityAuditEvent) => {
  const target = formatAuditDisplayText(event.target);
  const type = formatAuditDisplayText(event.targetType);
  if (target && type) return `${formatModerationToken(type)} ${target}`;
  return target || type || "No target";
};

const summarizeOwnerSecurityMetadata = (metadata: Record<string, unknown> | null | undefined) => {
  if (!metadata || !Object.keys(metadata).length) return "";
  return Object.entries(metadata)
    .slice(0, 3)
    .map(([key, value]) => `${formatModerationToken(key)}: ${formatAuditDisplayText(value) || "set"}`)
    .join(" · ");
};

const matchesOwnerSecurityAuditFilter = (event: OwnerSecurityAuditEvent, filter: OwnerSecurityAuditFilter) => {
  if (filter === "all") return true;
  const searchable = [
    event.source,
    event.eventType,
    event.summary,
    event.target,
    event.targetType,
    event.reason,
    event.severity,
  ].map((value) => String(value ?? "").toLowerCase()).join(" ");
  if (filter === "critical") return ["critical", "high"].includes(String(event.severity ?? "").toLowerCase());
  if (filter === "grants") return searchable.includes("grant") || searchable.includes("permission");
  if (filter === "devices") return searchable.includes("device");
  if (filter === "roles") return searchable.includes("role");
  if (filter === "live_ops") return searchable.includes("live_ops") || searchable.includes("live ops") || searchable.includes("livekit");
  if (filter === "failed_access") return searchable.includes("failed") || searchable.includes("denied") || searchable.includes("blocked");
  return true;
};

const formatGrantExpiration = (grant: OwnerTemporaryGrant) => {
  const expiresAt = grant.expiresAt ? Date.parse(grant.expiresAt) : NaN;
  if (!grant.expiresAt || !Number.isFinite(expiresAt)) return "Expiration not connected";
  const minutes = Math.max(0, Math.round((expiresAt - Date.now()) / 60000));
  if (minutes <= 0) return "Expired";
  if (minutes < 60) return `${minutes}m left`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h left`;
  return `${Math.round(hours / 24)}d left`;
};

const formatDeviceMeta = (device: OwnerSecurityDevice) => {
  const platform = formatModerationToken(device.platform || "unknown");
  const appVersion = device.appVersion ? `App ${device.appVersion}` : "App version unavailable";
  const buildVersion = device.buildVersion ? `Build ${device.buildVersion}` : "Build unavailable";
  return `${platform} · ${appVersion} · ${buildVersion}`;
};

const formatLegalStatus = (value: unknown) => {
  const status = String(value ?? "received");
  const option = legalRequestStatusOptions.find((entry) => entry.key === status);
  return option?.label ?? formatModerationToken(status);
};

const legalStatusTone = (status: unknown): OwnerControlTone => {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "closed") return "locked";
  if (normalized === "rejected_no_action") return "danger";
  if (normalized === "exported" || normalized === "evidence_prepared") return "success";
  if (normalized === "preserved_legal_hold" || normalized === "needs_more_info") return "manual";
  return "info";
};

const legalRequestPrimaryTarget = (request: OwnerControlLegalRequest | null | undefined) => {
  if (!request) return { id: "", label: "No target", targetType: "user_id" as LegalEvidenceTargetType };
  const pairs: readonly [keyof OwnerControlLegalRequest, string, LegalEvidenceTargetType][] = [
    ["target_user_id", "User", "user_id"],
    ["target_content_id", "Content", "content_id"],
    ["target_thread_id", "Thread", "chat_thread_id"],
    ["target_room_id", "Room", "room_id"],
    ["target_report_id", "Report", "report_id"],
  ];
  const match = pairs.find(([key]) => String(request[key] ?? "").trim());
  if (!match) return { id: "", label: "No target", targetType: "user_id" as LegalEvidenceTargetType };
  return {
    id: String(request[match[0]] ?? "").trim(),
    label: match[1],
    targetType: match[2],
  };
};

const summarizeLegalPreview = (value: Record<string, unknown> | null | undefined) => {
  if (!value || !Object.keys(value).length) return "No evidence preview has been requested in this session.";
  return Object.entries(value)
    .filter(([key]) => !["generatedAt", "redaction", "targetId", "targetType"].includes(key))
    .map(([key, entry]) => `${formatModerationToken(key)}: ${Array.isArray(entry) ? entry.length : entry && typeof entry === "object" ? Object.keys(entry).length : String(entry ?? "none")}`)
    .join(" · ") || "Preview returned metadata with no matching rows.";
};

const ownerToneBadgeStyle = (tone: OwnerControlTone) => {
  if (tone === "success") return styles.ownerPillSuccess;
  if (tone === "danger") return styles.ownerPillDanger;
  if (tone === "manual") return styles.ownerPillManual;
  if (tone === "locked") return styles.ownerPillLocked;
  if (tone === "info") return styles.ownerPillInfo;
  return styles.ownerPillDefault;
};

const ownerMetricToneStyle = (tone: OwnerControlTone) => {
  if (tone === "success") return styles.ownerMetricSuccess;
  if (tone === "danger") return styles.ownerMetricDanger;
  if (tone === "manual") return styles.ownerMetricManual;
  if (tone === "locked") return styles.ownerMetricLocked;
  return null;
};

const resolveCanarySection = (input: unknown) => {
  const source = input && typeof input === "object"
    ? (input as Record<string, unknown>).section ?? (input as Record<string, unknown>).key ?? (input as Record<string, unknown>).label
    : input;
  const text = String(source ?? "").toLowerCase();
  const explicit = canarySectionOrder.find((section) => section.toLowerCase() === text);
  if (explicit) return explicit;
  if (text.includes("owner")) return "Owner Protection";
  if (text.includes("admin") || text.includes("moderator") || text.includes("staff")) return "Staff Permissions";
  if (text.includes("premium") || text.includes("entitlement")) return "Premium / Entitlements";
  if (text.includes("legal readiness") || text.includes("policy") || text.includes("dmca") || text.includes("deletion")) return "Legal Readiness";
  if (text.includes("legal") || text.includes("evidence")) return "Legal / Evidence";
  if (text.includes("live_ops") || text.includes("live ops") || text.includes("liveops") || text.includes("remediation")) return "Live Ops";
  if (text.includes("redirect") || text.includes("auth")) return "Auth / Redirects";
  if (text.includes("support") || text.includes("public") || text.includes("channel")) return "Public Web / Support";
  if (text.includes("proof") || text.includes("cleanup")) return "Cleanup / Proof Hygiene";
  return "Public Web / Support";
};

const summarizeCanaryRun = (run: OwnerControlCanaryRun | null | undefined) => {
  const results = Array.isArray(run?.results) ? run.results : [];
  const rawSummary = run?.summary && typeof run.summary === "object" && !Array.isArray(run.summary) ? run.summary : null;
  const summary = { fail: 0, manualRequired: 0, pass: 0 };
  if (rawSummary) {
    summary.fail = Number(rawSummary.fail ?? rawSummary.failed ?? rawSummary.failCount ?? 0) || 0;
    summary.pass = Number(rawSummary.pass ?? rawSummary.passed ?? rawSummary.passCount ?? 0) || 0;
    summary.manualRequired = Number(rawSummary.manualRequired ?? rawSummary.manual_required ?? rawSummary.manualRequiredCount ?? rawSummary.unknown ?? rawSummary.unknownCount ?? 0) || 0;
    if (summary.fail > 0 || summary.pass > 0 || summary.manualRequired > 0 || results.length === 0) return summary;
  }
  for (const result of results) {
    const status = normalizeCanaryStatus(result.status);
    if (status === "manual_required") summary.manualRequired += 1;
    else summary[status] += 1;
  }
  return summary;
};

const ownerMetricValue = (value: unknown) => (value === null || value === undefined ? "Manual" : String(value));

const ownerAttentionCountTone = (value: unknown): OwnerControlTone => {
  if (value === null || value === undefined) return "manual";
  return Number(value) > 0 ? "manual" : "success";
};

const OwnerStatusPill = ({ label, tone = "default" }: { label: string; tone?: OwnerControlTone }) => (
  <View style={[styles.ownerPill, ownerToneBadgeStyle(tone)]}>
    <Text style={styles.ownerPillText}>{label}</Text>
  </View>
);

const OwnerMetricTile = ({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: OwnerControlTone;
}) => (
  <View style={[styles.ownerMetricTile, ownerMetricToneStyle(tone)]}>
    <Text style={styles.ownerMetricLabel}>{label}</Text>
    <Text style={styles.ownerMetricValue}>{String(value)}</Text>
  </View>
);

const OwnerControlPanelHeader = ({
  actions,
  badgeLabel,
  badgeTone = "default",
  kicker,
  lastRunLabel,
  subtitle,
  title,
}: {
  actions?: React.ReactNode;
  badgeLabel?: string;
  badgeTone?: OwnerControlTone;
  kicker: string;
  lastRunLabel?: string;
  subtitle: string;
  title: string;
}) => (
  <View style={styles.ownerPanelHeader}>
    <View style={styles.ownerPanelTitleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.ownerPanelKicker}>{kicker}</Text>
        <Text style={styles.ownerPanelTitle}>{title}</Text>
      </View>
      {badgeLabel ? <OwnerStatusPill label={badgeLabel} tone={badgeTone} /> : null}
    </View>
    <Text style={styles.ownerPanelSubtitle}>{subtitle}</Text>
    {lastRunLabel ? <Text style={styles.ownerPanelMeta}>{lastRunLabel}</Text> : null}
    {actions ? <View style={styles.ownerPanelActions}>{actions}</View> : null}
  </View>
);

const OwnerFilterChips = <T extends string,>({
  onChange,
  options,
  value,
}: {
  onChange: (next: T) => void;
  options: readonly { key: T; label: string }[];
  value: T;
}) => (
  <View style={styles.ownerFilterRow}>
    {options.map((option) => {
      const active = value === option.key;
      return (
        <TouchableOpacity
          key={option.key}
          accessibilityRole="button"
          style={[styles.ownerFilterChip, active && styles.ownerFilterChipActive]}
          onPress={() => onChange(option.key)}
        >
          <Text style={[styles.ownerFilterChipText, active && styles.ownerFilterChipTextActive]}>{option.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
);

const OwnerEmptyState = ({ body, title }: { body: string; title: string }) => (
  <View style={styles.ownerEmptyState}>
    <Text style={styles.ownerEmptyTitle}>{title}</Text>
    <Text style={styles.ownerEmptyBody}>{body}</Text>
  </View>
);

const OwnerDisabledReason = ({ reason }: { reason: string }) => (
  <View style={styles.ownerDisabledReason}>
    <Text style={styles.ownerDisabledReasonText}>{reason}</Text>
  </View>
);

const formatOwnerDetailValue = (value: unknown) => {
  if (value === null || value === undefined || value === "") return "not supplied";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? "item" : "items"}`;
  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).filter((key) => {
      const entry = (value as Record<string, unknown>)[key];
      return entry !== null && entry !== undefined && entry !== "";
    });
    if (!keys.length) return "empty";
    return `${keys.length} ${keys.length === 1 ? "field" : "fields"}: ${keys.slice(0, 3).map(formatModerationToken).join(", ")}`;
  }
  return formatAuditDisplayText(value) || "not supplied";
};

const canaryStructuredRows = (result: OwnerControlCanaryResult) => {
  const source = result.details && Object.keys(result.details).length
    ? result.details
    : result.metadata && Object.keys(result.metadata).length
      ? result.metadata
      : null;
  if (!source) return [];
  return Object.entries(source)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 8)
    .map(([key, value]) => ({
      label: formatModerationToken(key),
      value: formatOwnerDetailValue(value),
    }));
};

const OwnerDetailGrid = ({ rows }: { rows: { label: string; value: string }[] }) => (
  <View style={styles.ownerDetailGrid}>
    {rows.map((row) => (
      <View key={row.label} style={styles.ownerDetailGridRow}>
        <Text style={styles.ownerDetailLabel}>{row.label}</Text>
        <Text style={styles.ownerDetailValue}>{row.value}</Text>
      </View>
    ))}
  </View>
);

const CanaryProofDetails = ({ result, status }: { result: OwnerControlCanaryResult; status: CanaryStatus }) => {
  const structuredRows = canaryStructuredRows(result);
  return (
    <>
      <OwnerDetailGrid
        rows={[
          { label: "Actor", value: formatOwnerDetailValue(result.actor || "system") },
          { label: "Expected", value: formatOwnerDetailValue(result.expected) },
          { label: "Actual", value: formatOwnerDetailValue(result.actual || result.message) },
          { label: "Tested Surface", value: formatOwnerDetailValue(result.testedSurface) },
          { label: "Timestamp", value: result.testedAt ? formatModerationTimestamp(String(result.testedAt)) : "not supplied" },
          { label: "Cleanup", value: formatOwnerDetailValue(result.cleanupStatus || "not applicable") },
          { label: "Backend Status", value: ownerStatusLabel(status) },
        ]}
      />
      {structuredRows.length ? (
        <View style={styles.ownerNestedProofPanel}>
          <View style={styles.ownerSectionHeaderRow}>
            <Text style={styles.ownerSectionTitle}>Proof Metadata</Text>
            <OwnerStatusPill label={`${structuredRows.length} fields`} tone="info" />
          </View>
          <OwnerDetailGrid rows={structuredRows} />
        </View>
      ) : (
        <Text style={styles.ownerDetailText}>No extra proof metadata returned for this check.</Text>
      )}
    </>
  );
};

const OwnerControlRow = ({
  children,
  expanded = false,
  message,
  meta,
  onPress,
  statusLabel,
  title,
  tone = "default",
}: {
  children?: React.ReactNode;
  expanded?: boolean;
  message?: string;
  meta?: string;
  onPress?: () => void;
  statusLabel?: string;
  title: string;
  tone?: OwnerControlTone;
}) => {
  const content = (
    <>
      <View style={styles.ownerRowHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.ownerRowTitle}>{title}</Text>
          {meta ? <Text style={styles.ownerRowMeta}>{meta}</Text> : null}
        </View>
        {statusLabel ? <OwnerStatusPill label={statusLabel} tone={tone} /> : null}
      </View>
      {message ? (
        <Text style={styles.ownerRowMessage} numberOfLines={expanded ? undefined : 1}>
          {message}
        </Text>
      ) : null}
      {expanded && children ? <View style={styles.ownerRowDetails}>{children}</View> : null}
    </>
  );

  if (!onPress) return <View style={styles.ownerControlRow}>{content}</View>;
  return (
    <TouchableOpacity accessibilityRole="button" activeOpacity={0.82} style={styles.ownerControlRow} onPress={onPress}>
      {content}
      <Text style={styles.ownerRowHint}>{expanded ? "Hide details" : "Show details"}</Text>
    </TouchableOpacity>
  );
};

const sortPermissionKeys = (keys: readonly PlatformStaffPermissionKey[]) => (
  Array.from(new Set(keys)).sort()
);

const permissionSetsEqual = (
  left: readonly PlatformStaffPermissionKey[] | null,
  right: readonly PlatformStaffPermissionKey[] | null,
) => {
  if (!left || !right) return false;
  const sortedLeft = sortPermissionKeys(left);
  const sortedRight = sortPermissionKeys(right);
  return sortedLeft.length === sortedRight.length && sortedLeft.every((key, index) => key === sortedRight[index]);
};

const formatPermissionSummary = (keys: readonly PlatformStaffPermissionKey[]) => {
  if (!keys.length) return "No scoped permissions selected";
  return sortPermissionKeys(keys).map((key) => staffPermissionLabelByKey[key] ?? formatModerationToken(key)).join(" · ");
};

const roleAuditTone = (entry: PlatformRoleAuditEvent): OwnerControlTone => {
  if (entry.action.includes("blocked")) return "danger";
  if (entry.action.includes("revoke") || entry.action.includes("expire")) return "manual";
  if (entry.auditKind === "permission") return "info";
  return "success";
};

const formatAdminOperationFailure = (error: any, fallback: string) => {
  const message = String(error?.message ?? "");
  const code = String(error?.code ?? "");
  const searchable = `${code} ${message}`.toLowerCase();

  if (
    searchable.includes("permission")
    || searchable.includes("row-level security")
    || searchable.includes("not authorized")
    || searchable.includes("policy")
    || code === "42501"
  ) {
    return "This operator action is not allowed for the current backend role.";
  }

  if (
    searchable.includes("single json object")
    || searchable.includes("0 rows")
    || searchable.includes("no rows")
    || searchable.includes("not found")
    || code === "PGRST116"
  ) {
    return "Content not found or no longer available.";
  }

  if (searchable.includes("network") || searchable.includes("fetch")) {
    return "Network trouble interrupted the operator action. Check the connection and try again.";
  }

  return fallback;
};

const formatDmcaOperationFailure = (error: any, fallback: string) => {
  const message = String(error?.message ?? "");
  const code = String(error?.code ?? "");
  const searchable = `${code} ${message}`.toLowerCase();

  if (code === "42P01" || searchable.includes("relation") && searchable.includes("does not exist")) {
    return `Missing backend config: ${message || "a required DMCA table does not exist."}`;
  }
  if (code === "42883" || searchable.includes("function") && searchable.includes("does not exist")) {
    return `Missing backend config: ${message || "a required DMCA RPC is not deployed."}`;
  }
  if (code === "42703" || searchable.includes("column") && searchable.includes("does not exist")) {
    return `Missing backend config: ${message || "a required DMCA column is not deployed."}`;
  }
  if (searchable.includes("dmca_valid_takedown_required")) {
    return "Strike disabled: this case is not a valid completed takedown. Move it to Content Disabled or record preservation before adding an active strike.";
  }
  if (searchable.includes("dmca_content_type_not_supported_for_disable_restore")) {
    return "Missing backend piece: disable/restore is not implemented for this content type.";
  }
  if (searchable.includes("dmca_owner_or_scoped_operator_required") || searchable.includes("dmca_owner_operator_required")) {
    return "Permission denied: Admin DMCA requires Owner or an approved Admin/Operator with dmca_review, copyright_review, or legal_review.";
  }

  return formatAdminOperationFailure(error, fallback);
};

const formatReportModerationFailure = (error: any) => {
  const message = String(error?.message ?? "");
  const code = String(error?.code ?? "");
  const searchable = `${code} ${message}`.toLowerCase();

  if (searchable.includes("audit event could not be written")) {
    return message;
  }

  if (
    searchable.includes("permission")
    || searchable.includes("row-level security")
    || searchable.includes("owner/operator")
    || searchable.includes("not authorized")
    || code === "42501"
  ) {
    return "Admin action denied. This account lacks backed report-review or content-moderation permission.";
  }

  if (searchable.includes("admin_report_reason_required")) {
    return "Add a short reason before recording this report action.";
  }
  if (searchable.includes("admin_report_closed_state")) {
    return "This report is already closed. Reopen is not backed in this lane.";
  }
  if (searchable.includes("admin_report_target_action_unsupported")) {
    return "That target type is not backed for public visibility moderation. Use Mark Reviewed, Dismiss, or Escalate.";
  }
  if (searchable.includes("admin_report_target_mismatch")) {
    return "Report target mismatch. Refresh Reports and try again.";
  }

  if (
    searchable.includes("single json object")
    || searchable.includes("0 rows")
    || searchable.includes("no rows")
    || searchable.includes("not found")
    || code === "PGRST116"
  ) {
    return "Content not found or no longer available.";
  }

  return "Unable to update this report action. Try again after confirming the report and target still exist.";
};

const formatAdminV1Count = (value: number | null, loading: boolean) => {
  if (loading) return "Loading";
  return value === null ? "Not connected yet" : String(value);
};

const formatHomeCount = (value: number | null | undefined, loading: boolean) => {
  if (loading) return "Loading";
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "Not Connected";
};

const getLatestHomeTimestamp = (values: Array<string | null | undefined>) => {
  const latest = values
    .map((value) => {
      const parsed = Date.parse(String(value ?? ""));
      return Number.isFinite(parsed) && parsed > 0 ? { parsed, value: String(value) } : null;
    })
    .filter((entry): entry is { parsed: number; value: string } => !!entry)
    .sort((left, right) => right.parsed - left.parsed)[0];
  return latest?.value ?? null;
};

const isLiveCostAttentionSeverity = (severity: string) => (
  severity === "warning" || severity === "high" || severity === "critical" || severity === "emergency"
);

const formatProviderUsageStatusLabel = (status: AdminProviderUsageImportStatus["status"]) => {
  if (status === "connected") return "Connected";
  if (status === "partial") return "Partial";
  if (status === "failed") return "Failed";
  return "Not connected yet";
};

const getProviderUsageStatusStyle = (status: AdminProviderUsageImportStatus["status"]) => {
  if (status === "connected") return styles.badgeOn;
  if (status === "partial") return styles.badgeScheduled;
  if (status === "failed") return styles.badgeDraft;
  return styles.badgeOff;
};

const getLiveCostGuardSeverityStyle = (severity: string) => {
  if (severity === "emergency" || severity === "critical") return styles.badgeDraft;
  if (severity === "high" || severity === "warning") return styles.badgeScheduled;
  return styles.badgePublished;
};

const getLiveOpsRiskStyle = (risk: string) => {
  if (risk === "critical" || risk === "high") return styles.badgeDraft;
  if (risk === "medium") return styles.badgeScheduled;
  return styles.badgePublished;
};

const formatLiveOpsDryRunResult = (result: Record<string, unknown> | null) => {
  if (!result) return "Not recorded";
  const safeToClean = typeof result.safeToClean === "boolean" ? `safe ${result.safeToClean ? "yes" : "no"}` : "";
  const status = typeof result.status === "string" ? result.status : "";
  const roomStatus = typeof result.roomStatus === "string" ? `room ${result.roomStatus}` : "";
  const dryRun = result.dryRun === true ? "dry-run" : result.dryRun === false ? "executed" : "";
  const summary = [dryRun, status, roomStatus, safeToClean].filter(Boolean).join(" · ");
  if (summary) return summary;
  const fieldCount = Object.keys(result).length;
  return fieldCount ? `${fieldCount} result ${fieldCount === 1 ? "field" : "fields"} recorded` : "Recorded";
};

const formatProviderUsageRows = (count: number | null) => (
  count === null ? "usage rows not readable" : `${count} provider usage row${count === 1 ? "" : "s"}`
);

const formatProviderImportDate = (value: string | null) => {
  if (!value) return "No completed import yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
};

const formatProviderUsageSummary = (status: AdminProviderUsageImportStatus) => {
  if (status.status === "not_connected") return "Not connected yet.";
  if (status.status === "failed") {
    return `Last import failed. ${formatProviderUsageRows(status.usageRowsCount)} remain readable if any previous import succeeded.`;
  }
  if (status.status === "partial") {
    return `Previous provider rows are readable, but the latest import did not complete. ${formatProviderUsageRows(status.usageRowsCount)}.`;
  }
  return `Provider import connected. ${formatProviderUsageRows(status.usageRowsCount)} readable.`;
};

const formatAdminFinanceCount = (value: number | null, loading: boolean, singular: string, plural: string) => {
  if (loading) return "Loading";
  return formatFinanceFoundationCount(value, singular, plural);
};

const formatImmutableAuditCount = (value: number | null, loading: boolean) => {
  if (loading) return "Loading";
  return formatAdminAuditFoundationCount(value);
};

const formatImmutableAuditActor = (entry: PlatformAdminAuditLogRow) => {
  if (entry.actorEmail) return maskOperatorIdentity(entry.actorEmail);
  if (entry.actorUserId) return `User ${formatCompactIdentifier(entry.actorUserId)}`;
  if (entry.actorRole) return formatModerationToken(entry.actorRole);
  return "Actor not captured";
};

const formatImmutableAuditTarget = (entry: PlatformAdminAuditLogRow) => {
  if (!entry.targetType && !entry.targetId) return "Target not set";
  const targetType = entry.targetType ? formatModerationToken(entry.targetType) : "Target";
  return entry.targetId ? `${targetType} ${formatCompactIdentifier(entry.targetId)}` : targetType;
};

const getCreatorVideoModerationActionLabel = (status: ReportTargetModerationStatus) => {
  if (status === "hidden") return "Hide From Public";
  if (status === "removed") return "Remove From Public";
  if (status === "clean") return "Restore Clean";
  return formatModerationToken(status);
};

const getReportTargetActionConfirmCopy = (
  status: ReportTargetModerationStatus,
  targetType?: SafetyReportQueueItem["targetType"] | null,
) => {
  const targetLabel = targetType ? formatModerationToken(targetType).toLowerCase() : "target";
  if (status === "hidden") {
    return `This hides the ${targetLabel} from public access while keeping the record available for review.`;
  }
  if (status === "removed") {
    return `This marks the ${targetLabel} removed from public access. Use only for reviewed policy action or safe proof content.`;
  }
  return `This clears the active moderation block and lets the ${targetLabel} follow its normal visibility rules again.`;
};

const formatReportSourceSurface = (surface: SafetyReportQueueItem["sourceSurface"]) => {
  switch (surface) {
    case "profile":
      return "Profile";
    case "player":
      return "Player";
    case "title-detail":
      return "Title Detail";
    case "chat-thread":
      return "Chat Thread";
    case "watch-party-room":
      return "Room";
    case "live-stage":
      return "Live Stage";
    case "communication-room":
      return "Call Room";
    default:
      return "Unknown Source";
  }
};

const formatReportReviewState = (status: SafetyReportQueueItem["status"]) => {
  switch (status) {
    case "reviewing":
      return "Under Review";
    case "actioned":
      return "Actioned";
    case "dismissed":
      return "Dismissed";
    case "escalated":
      return "Escalated";
    default:
      return "Needs Review";
  }
};

const getReportReviewTone = (status: SafetyReportQueueItem["status"]): OwnerControlTone => {
  if (status === "actioned" || status === "dismissed") return "success";
  if (status === "escalated") return "manual";
  if (status === "reviewing") return "info";
  return "manual";
};

const getReportSeverityTone = (severity: SafetyReportQueueItem["severity"]): OwnerControlTone => {
  if (severity === "critical") return "danger";
  if (severity === "high" || severity === "medium") return "manual";
  if (severity === "low") return "success";
  return "locked";
};

const formatReportRiskLabel = (report: SafetyReportQueueItem) => {
  if (report.severity === "critical") return "Critical";
  if (report.severity === "high") return "High Risk";
  if (report.severity === "medium") return "Medium";
  if (report.severity === "low") return "Low";
  return "Unknown Severity";
};

const isProfilePostReport = (report: SafetyReportQueueItem) => (
  report.targetType === "profile_post" || report.targetType === "profile_post_comment"
);

const isReportVisibilityTargetSupported = (targetType: SafetyReportQueueItem["targetType"]) => (
  targetType === "creator_video"
  || targetType === "profile_post"
  || targetType === "profile_post_comment"
  || targetType === "creator_video_comment"
  || targetType === "social_attachment"
);

const reportMatchesTriageFilter = (report: SafetyReportQueueItem, filter: ReportTriageFilterKey) => {
  if (filter === "all") return true;
  if (filter === "needs_review") return report.status === "needs_review" || report.status === "reviewing";
  if (filter === "creator_video") return report.targetType === "creator_video" || report.targetType === "creator_video_comment";
  if (filter === "profile_post") return isProfilePostReport(report);
  if (filter === "player") return report.sourceSurface === "player";
  if (filter === "critical") {
    return (
      (report.severity === "critical" || report.severity === "high")
      && report.status !== "actioned"
      && report.status !== "dismissed"
    );
  }
  if (filter === "actioned") return report.status === "actioned" || report.status === "dismissed" || report.status === "escalated";
  return true;
};

const buildReportTargetLine = (report: SafetyReportQueueItem) => {
  const label = formatAuditDisplayText(report.targetLabel) || formatCompactIdentifier(report.targetId);
  return `${formatModerationToken(report.targetType)} · ${label}`;
};

const buildReportActorLine = (report: SafetyReportQueueItem) => {
  const reporter = `Reporter ${formatModerationToken(report.reporterRole)}`;
  const target = `Target ${formatCompactIdentifier(report.targetId)}`;
  const owner = report.targetAuditOwnerKey ? `Owner ${formatCompactIdentifier(report.targetAuditOwnerKey)}` : "";
  return [reporter, target, owner].filter(Boolean).join(" · ");
};

const getReportTargetActionDisabledReason = (
  report: SafetyReportQueueItem | null,
  canApplyReportTargetActions: boolean,
) => {
  if (!report) return "Select a report before applying a target action.";
  if (report.status === "actioned" || report.status === "dismissed") {
    return "This report is already closed. Reopen is not backed in the Reports workflow yet.";
  }
  if (!isReportVisibilityTargetSupported(report.targetType)) {
    return `Missing backend piece: ${formatModerationToken(report.targetType)} public visibility mutation is not backed. Mark Reviewed, Dismiss, and Escalate are available.`;
  }
  if (!canApplyReportTargetActions) {
    return "Target visibility actions require Owner or scoped content_moderation permission. Report review alone can Mark Reviewed, Dismiss, or Escalate.";
  }
  return null;
};

const formatReportResolution = (report: SafetyReportQueueItem) => {
  if (report.resolutionType) return formatModerationToken(report.resolutionType);
  if (report.status === "needs_review") return "Pending";
  return formatModerationToken(report.status);
};

const formatRelease = (releaseAt?: string | null) => {
  const raw = (releaseAt ?? "").trim();
  if (!raw) return "—";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString();
};

const toDatetimeLocalValue = (raw?: string | null) => {
  const value = (raw ?? "").trim();
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const iso = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();
  return iso.slice(0, 16);
};

const fromDatetimeLocalValue = (raw: string) => {
  const value = raw.trim();
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const adminContentRpc = () => supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

const readAdminContentConfigRpc = async () => {
  const { data, error } = await adminContentRpc().rpc("get_admin_content_config");
  if (error) throw error;
  return data as {
    connected?: boolean;
    source?: string | null;
    config?: unknown;
    updatedAt?: string | null;
    updatedBy?: string | null;
  } | null;
};

const saveAdminContentConfigRpc = async (config: AppConfig, reason: string) => {
  const { data, error } = await adminContentRpc().rpc("save_admin_content_config", {
    p_config_patch: config,
    p_reason: reason,
  });
  if (error) throw error;
  return data as { config?: unknown; updatedAt?: string | null; auditLogId?: string | null } | null;
};

const applyAdminTitleProgrammingActionRpc = async (input: {
  actionType: ContentProgrammingActionType;
  patch?: Record<string, unknown>;
  reason: string;
  titleId?: TitleId | null;
}) => {
  const { data, error } = await adminContentRpc().rpc("apply_admin_title_programming_action", {
    p_title_id: input.titleId ?? null,
    p_action_type: input.actionType,
    p_patch: input.patch ?? {},
    p_reason: input.reason,
  });
  if (error) throw error;
  return data as { titleId?: string | null; auditLogId?: string | null } | null;
};

const saveAdminCreatorGrantsRpc = async (input: {
  grants: CreatorPermissionSet;
  reason: string;
  targetUserId: string;
}) => {
  const { data, error } = await adminContentRpc().rpc("save_admin_creator_grants", {
    p_target_user_id: input.targetUserId,
    p_grants: {
      canUsePartyPassRooms: input.grants.canUsePartyPassRooms,
      canUsePremiumRooms: input.grants.canUsePremiumRooms,
      canPublishPremiumTitles: input.grants.canPublishPremiumTitles,
      canUseSponsorPlacements: input.grants.canUseSponsorPlacements,
      canUsePlayerAds: input.grants.canUsePlayerAds,
    },
    p_reason: input.reason,
  });
  if (error) throw error;
  return data as { auditLogId?: string | null; grants?: unknown } | null;
};

const listAdminContentAuditEventsRpc = async (limit = 10) => {
  const { data, error } = await adminContentRpc().rpc("list_admin_content_audit_events", {
    p_limit: limit,
  });
  if (error) throw error;
  return ((data ?? []) as ContentAuditRow[]).filter((row) => !!row?.id && !!row?.action);
};

export default function AdminStudioScreen() {
  const router = useRouter();
  const { isLoading: authLoading, isSignedIn, user } = useSession();
  const { accessState, isLoading: betaLoading, isActive } = useBetaProgram();
  const [titles, setTitles] = useState<TitleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [manualHeroQuery, setManualHeroQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [operatorTab, setOperatorTab] = useState<OperatorTabKey>("home");
  const [saving, setSaving] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [capabilities, setCapabilities] = useState<AdminCapabilities>(defaultCapabilities);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [experienceConfig, setExperienceConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [savedExperienceConfig, setSavedExperienceConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [configLoading, setConfigLoading] = useState(true);
  const [appConfigConnected, setAppConfigConnected] = useState(false);
  const [appConfigSource, setAppConfigSource] = useState<string | null>(null);
  const [appConfigSavedAt, setAppConfigSavedAt] = useState<string | null>(null);
  const [configSaving, setConfigSaving] = useState(false);
  const [titlesConnected, setTitlesConnected] = useState(false);
  const [contentAuditRows, setContentAuditRows] = useState<ContentAuditRow[]>([]);
  const [contentAuditLoading, setContentAuditLoading] = useState(false);
  const [contentAuditConnected, setContentAuditConnected] = useState(false);
  const [contentLastRefreshedAt, setContentLastRefreshedAt] = useState<string | null>(null);
  const [contentConfirm, setContentConfirm] = useState<ContentConfirmState | null>(null);
  const [contentConfirmReason, setContentConfirmReason] = useState("");
  const [creatorGrantUserId, setCreatorGrantUserId] = useState("");
  const [creatorGrantLoading, setCreatorGrantLoading] = useState(false);
  const [creatorGrantSaving, setCreatorGrantSaving] = useState(false);
  const [creatorGrantForm, setCreatorGrantForm] = useState<CreatorPermissionSet>(normalizeCreatorPermissionSet(null));
  const [platformRoles, setPlatformRoles] = useState<PlatformRoleMembership[]>([]);
  const [platformRolesLoading, setPlatformRolesLoading] = useState(false);
  const [platformRolesChecked, setPlatformRolesChecked] = useState(false);
  const [platformRoleRoster, setPlatformRoleRoster] = useState<PlatformRoleRosterEntry[]>([]);
  const [platformRoleRosterSummary, setPlatformRoleRosterSummary] =
    useState<PlatformRoleRosterReadModel["summary"] | null>(null);
  const [platformRoleRosterGeneratedAt, setPlatformRoleRosterGeneratedAt] = useState<string | null>(null);
  const [platformRoleRosterLoading, setPlatformRoleRosterLoading] = useState(false);
  const [staffRoleEmail, setStaffRoleEmail] = useState("");
  const [staffRoleTarget, setStaffRoleTarget] = useState<PlatformStaffManagementRole>("moderator");
  const [staffRoleReason, setStaffRoleReason] = useState("");
  const [staffRoleBusy, setStaffRoleBusy] = useState<"grant" | "revoke" | null>(null);
  const [staffPermissionEmail, setStaffPermissionEmail] = useState("");
  const [staffPermissionSavedKeys, setStaffPermissionSavedKeys] = useState<PlatformStaffPermissionKey[] | null>(null);
  const [staffPermissionSelectedKeys, setStaffPermissionSelectedKeys] = useState<PlatformStaffPermissionKey[]>([]);
  const [staffPermissionLoadedEmail, setStaffPermissionLoadedEmail] = useState("");
  const [staffPermissionReason, setStaffPermissionReason] = useState("");
  const [staffPermissionExpiresAt, setStaffPermissionExpiresAt] = useState("");
  const [staffPermissionBusy, setStaffPermissionBusy] = useState<"load" | "save" | null>(null);
  const [roleAuditEvents, setRoleAuditEvents] = useState<PlatformRoleAuditEvent[]>([]);
  const [roleAuditLoading, setRoleAuditLoading] = useState(false);
  const [roleAuditFilter, setRoleAuditFilter] = useState<RoleAuditFilterKey>("all");
  const [roleConfirm, setRoleConfirm] = useState<RoleConfirmState | null>(null);
  const [adminAuditLog, setAdminAuditLog] = useState<AdminAuditLogEntry[]>([]);
  const [adminAuditLogSummary, setAdminAuditLogSummary] =
    useState<AdminAuditLogReadModel["summary"] | null>(null);
  const [adminAuditLogLoading, setAdminAuditLogLoading] = useState(false);
  const [safetyReports, setSafetyReports] = useState<SafetyReportQueueItem[]>([]);
  const [safetyReportQueueSummary, setSafetyReportQueueSummary] = useState<SafetyReportQueueSummary | null>(null);
  const [safetyReportsLoading, setSafetyReportsLoading] = useState(false);
  const [safetyReportsLastLoadedAt, setSafetyReportsLastLoadedAt] = useState<string | null>(null);
  const [safetyReportFilter, setSafetyReportFilter] = useState<ReportTriageFilterKey>("needs_review");
  const [selectedSafetyReportId, setSelectedSafetyReportId] = useState<number | null>(null);
  const [safetyReportDetailVisible, setSafetyReportDetailVisible] = useState(false);
  const [selectedReportAuditRows, setSelectedReportAuditRows] = useState<PlatformAdminAuditLogRow[]>([]);
  const [selectedReportAuditLoading, setSelectedReportAuditLoading] = useState(false);
  const [reportStatusActionBusy, setReportStatusActionBusy] = useState<string | null>(null);
  const [manualReportActionOpen, setManualReportActionOpen] = useState(false);
  const [moderationNotice, setModerationNotice] = useState<string | null>(null);
  const [dmcaCases, setDmcaCases] = useState<DmcaCase[]>([]);
  const [dmcaCasesLoading, setDmcaCasesLoading] = useState(false);
  const [dmcaCaseSummary, setDmcaCaseSummary] = useState<DmcaCaseSummary | null>(null);
  const [dmcaCaseDetail, setDmcaCaseDetail] = useState<DmcaCaseDetail | null>(null);
  const [dmcaDetailVisible, setDmcaDetailVisible] = useState(false);
  const [dmcaSelectedCaseId, setDmcaSelectedCaseId] = useState<string | null>(null);
  const [dmcaStatusFilter, setDmcaStatusFilter] = useState<DmcaCaseStatus | "all">("all");
  const [dmcaSearchQuery, setDmcaSearchQuery] = useState("");
  const [dmcaNotice, setDmcaNotice] = useState<string | null>(null);
  const [dmcaActionBusy, setDmcaActionBusy] = useState<string | null>(null);
  const [dmcaActionReason, setDmcaActionReason] = useState("");
  const [dmcaAdminNotes, setDmcaAdminNotes] = useState("");
  const [dmcaContentType, setDmcaContentType] = useState<DmcaContentType>("creator_video");
  const [dmcaContentId, setDmcaContentId] = useState("");
  const [dmcaContentAction, setDmcaContentAction] = useState<DmcaContentAction>("hidden");
  const [dmcaStrikeUserId, setDmcaStrikeUserId] = useState("");
  const [dmcaStrikeSeverity, setDmcaStrikeSeverity] = useState<"standard" | "severe">("standard");
  const [dmcaIntakeVisible, setDmcaIntakeVisible] = useState(false);
  const [dmcaIntakeBusy, setDmcaIntakeBusy] = useState(false);
  const [dmcaIntakeForm, setDmcaIntakeForm] = useState<DmcaNoticeFormState>(() => createDmcaNoticeFormState());
  const [counterSubmitterName, setCounterSubmitterName] = useState("");
  const [counterSubmitterEmail, setCounterSubmitterEmail] = useState("");
  const [counterSubmitterPhone, setCounterSubmitterPhone] = useState("");
  const [counterSubmitterAddress, setCounterSubmitterAddress] = useState("");
  const [counterRemovedDescription, setCounterRemovedDescription] = useState("");
  const [counterRemovedLocation, setCounterRemovedLocation] = useState("");
  const [counterGoodFaith, setCounterGoodFaith] = useState(false);
  const [counterJurisdiction, setCounterJurisdiction] = useState(false);
  const [counterService, setCounterService] = useState(false);
  const [counterSignature, setCounterSignature] = useState("");
  const [counterForwardedNow, setCounterForwardedNow] = useState(false);
  const [creatorVideoModerationReason, setCreatorVideoModerationReason] = useState("");
  const [creatorVideoModerationBusy, setCreatorVideoModerationBusy] = useState<ReportTargetModerationStatus | null>(null);
  const [pendingCreatorVideoModeration, setPendingCreatorVideoModeration] =
    useState<PendingReportTargetModerationAction | null>(null);
  const [adminOpsNotice, setAdminOpsNotice] = useState<string | null>(null);
  const [liveCostGuardSettingsReadModel, setLiveCostGuardSettingsReadModel] =
    useState<LiveCostGuardSettingsReadModel | null>(null);
  const [liveCostGuardSettingsForm, setLiveCostGuardSettingsForm] =
    useState<LiveCostGuardSettings>(DEFAULT_LIVE_COST_GUARD_SETTINGS);
  const [liveCostGuardEvents, setLiveCostGuardEvents] = useState<LiveCostGuardEvent[]>([]);
  const [liveCostGuardActions, setLiveCostGuardActions] = useState<LiveCostGuardAction[]>([]);
  const [liveCostGuardLoading, setLiveCostGuardLoading] = useState(false);
  const [liveCostGuardSaving, setLiveCostGuardSaving] = useState(false);
  const [liveCostGuardNotice, setLiveCostGuardNotice] = useState<string | null>(null);
  const [liveCostGuardActionBusy, setLiveCostGuardActionBusy] = useState<string | null>(null);
  const [liveCostGuardRoomName, setLiveCostGuardRoomName] = useState("");
  const [liveCostGuardParticipantIdentity, setLiveCostGuardParticipantIdentity] = useState("");
  const [liveCostGuardActionReason, setLiveCostGuardActionReason] = useState("");
  const [liveOpsReadModel, setLiveOpsReadModel] = useState<LiveOpsFixCenterReadModel | null>(null);
  const [liveOpsLoading, setLiveOpsLoading] = useState(false);
  const [liveOpsNotice, setLiveOpsNotice] = useState<string | null>(null);
  const [liveOpsActionBusy, setLiveOpsActionBusy] = useState<string | null>(null);
  const [legalTargetType, setLegalTargetType] = useState<LegalEvidenceTargetType>("user_id");
  const [legalTargetId, setLegalTargetId] = useState("");
  const [legalReason, setLegalReason] = useState("");
  const [legalDateFrom, setLegalDateFrom] = useState("");
  const [legalDateTo, setLegalDateTo] = useState("");
  const [legalBusy, setLegalBusy] = useState<"preview" | "export" | "hold" | null>(null);
  const [legalNotice, setLegalNotice] = useState<string | null>(null);
  const [legalPreviewResult, setLegalPreviewResult] = useState<Record<string, unknown> | null>(null);
  const [legalExportResult, setLegalExportResult] = useState<Record<string, unknown> | null>(null);
  const [legalHoldResult, setLegalHoldResult] = useState<Record<string, unknown> | null>(null);
  const [legalSubsection, setLegalSubsection] = useState<LegalSubsection>("intake");
  const [ownerControlNotice, setOwnerControlNotice] = useState<string | null>(null);
  const [ownerControlLoading, setOwnerControlLoading] = useState(false);
  const [auditExplorerRows, setAuditExplorerRows] = useState<OwnerControlAuditRow[]>([]);
  const [auditExplorerActionFilter, setAuditExplorerActionFilter] = useState("");
  const [auditExplorerTargetFilter, setAuditExplorerTargetFilter] = useState("");
  const [auditExplorerBreakGlassOnly, setAuditExplorerBreakGlassOnly] = useState(false);
  const [permissionTemplates, setPermissionTemplates] = useState<OwnerControlPermissionTemplate[]>([]);
  const [permissionTemplateKey, setPermissionTemplateKey] = useState("support_agent");
  const [permissionTemplateEmail, setPermissionTemplateEmail] = useState("");
  const [permissionTemplateDuration, setPermissionTemplateDuration] = useState("until_revoked");
  const [permissionTemplateReason, setPermissionTemplateReason] = useState("");
  const [permissionTemplateBusy, setPermissionTemplateBusy] = useState<"apply" | "revoke" | null>(null);
  const [breakGlassSessions, setBreakGlassSessions] = useState<OwnerControlBreakGlassSession[]>([]);
  const [breakGlassActiveSessionId, setBreakGlassActiveSessionId] = useState<string | null>(null);
  const [breakGlassReason, setBreakGlassReason] = useState("");
  const [breakGlassCaseId, setBreakGlassCaseId] = useState("");
  const [breakGlassReportId, setBreakGlassReportId] = useState("");
  const [breakGlassDuration, setBreakGlassDuration] = useState("1h");
  const [breakGlassBusy, setBreakGlassBusy] = useState<"activate" | "end" | null>(null);
  const [legalRequests, setLegalRequests] = useState<OwnerControlLegalRequest[]>([]);
  const [selectedLegalRequestId, setSelectedLegalRequestId] = useState<string | null>(null);
  const [selectedLegalRequestDetail, setSelectedLegalRequestDetail] = useState<OwnerControlLegalRequestDetail | null>(null);
  const [legalRequestStatusFilter, setLegalRequestStatusFilter] = useState<LegalRequestStatusFilter>("all");
  const [legalRequestSearch, setLegalRequestSearch] = useState("");
  const [legalRequestStatusUpdate, setLegalRequestStatusUpdate] = useState<LegalRequestStatusFilter>("under_review");
  const [legalRequestNote, setLegalRequestNote] = useState("");
  const [legalRequestDetailBusy, setLegalRequestDetailBusy] = useState(false);
  const [legalRequestAgency, setLegalRequestAgency] = useState("");
  const [legalRequestContact, setLegalRequestContact] = useState("");
  const [legalRequestContactEmail, setLegalRequestContactEmail] = useState("");
  const [legalRequestContactPhone, setLegalRequestContactPhone] = useState("");
  const [legalRequestCaseNumber, setLegalRequestCaseNumber] = useState("");
  const [legalRequestType, setLegalRequestType] = useState<typeof legalRequestTypeOptions[number]>("law_enforcement");
  const [legalRequestReason, setLegalRequestReason] = useState("");
  const [legalRequestDateFrom, setLegalRequestDateFrom] = useState("");
  const [legalRequestDateTo, setLegalRequestDateTo] = useState("");
  const [legalRequestDueAt, setLegalRequestDueAt] = useState("");
  const [legalRequestNotes, setLegalRequestNotes] = useState("");
  const [legalRequestTargetId, setLegalRequestTargetId] = useState("");
  const [legalRequestTargetType, setLegalRequestTargetType] = useState<"targetUserId" | "targetContentId" | "targetThreadId" | "targetRoomId" | "targetReportId">("targetUserId");
  const [legalRequestBusy, setLegalRequestBusy] = useState(false);
  const [ownerSecurityStatus, setOwnerSecurityStatus] = useState<OwnerControlSecurityStatus | null>(null);
  const [ownerSafetyDashboard, setOwnerSafetyDashboard] = useState<OwnerControlSafetyDashboard | null>(null);
  const [ownerSecurityAuditFilter, setOwnerSecurityAuditFilter] = useState<OwnerSecurityAuditFilter>("all");
  const [ownerSecurityActionBusy, setOwnerSecurityActionBusy] = useState<string | null>(null);
  const [ownerSecurityConfirmVisible, setOwnerSecurityConfirmVisible] = useState(false);
  const [ownerSecurityConfirmText, setOwnerSecurityConfirmText] = useState("");
  const [canaryRuns, setCanaryRuns] = useState<OwnerControlCanaryRun[]>([]);
  const [canaryBusy, setCanaryBusy] = useState(false);
  const [canaryStatusFilter, setCanaryStatusFilter] = useState<CanaryStatusFilter>("all");
  const [expandedCanaryRows, setExpandedCanaryRows] = useState<Record<string, boolean>>({});
  const [expandedOwnerControlRows, setExpandedOwnerControlRows] = useState<Record<string, boolean>>({});
  const [adminV1ReadModel, setAdminV1ReadModel] = useState<AdminV1ReadModel>(EMPTY_ADMIN_V1_READ_MODEL);
  const [adminFinanceReadModel, setAdminFinanceReadModel] =
    useState<AdminFinanceReadModelWithLoading>(EMPTY_ADMIN_FINANCE_READ_MODEL);
  const [adminImmutableAuditReadModel, setAdminImmutableAuditReadModel] =
    useState<AdminImmutableAuditReadModelWithLoading>(EMPTY_ADMIN_IMMUTABLE_AUDIT_READ_MODEL);
  const [form, setForm] = useState<EditorForm>({
    title: "",
    category: "",
    year: "",
    runtime: "",
    synopsis: "",
    poster_url: "",
    thumbnail_url: "",
    video_url: "",
    preview_video_url: "",
    featured: false,
    is_hero: false,
    is_trending: false,
    pin_to_top_row: false,
    status: "draft",
    release_at: "",
    sort_order: "0",
    content_access_rule: "open",
    ads_enabled: false,
    sponsor_placement: "none",
    sponsor_label: "",
  });
  const themePalette = getThemePresetPalette(experienceConfig.theme.preset);
  const runtimeConfig = useMemo(() => getRuntimeConfig(), []);
  const runtimeConfigIssues = useMemo(() => getRuntimeConfigIssues(runtimeConfig), [runtimeConfig]);
  const liveKitConfigured = useMemo(() => isLiveKitRuntimeConfigured(runtimeConfig), [runtimeConfig]);
  const adsProviderStatus = useMemo(() => placeholderAdProvider.getStatus(), []);
  const adsLaunchConfig = experienceConfig.adsLaunch;
  const moderationAccess = getModerationAccess({
    userId: user?.id ?? null,
    email: user?.email ?? null,
  });
  const resolvedActorRole = resolvePlatformActorRole(moderationAccess, platformRoles);
  const platformRoleCheckPending = isSignedIn && isActive && (!platformRolesChecked || platformRolesLoading);
  const canAccessAdmin = isSignedIn && isActive && platformRolesChecked && canAccessAdminConsole(moderationAccess, platformRoles);
  const canReviewSafetyReports = isSignedIn && isActive && platformRolesChecked && canReviewSafetyQueue(moderationAccess, platformRoles);
  const canManagePrivilegedWrites = isSignedIn && isActive && platformRolesChecked && canManagePrivilegedAdminWrites(moderationAccess, platformRoles);
  const canAccessContentProgramming = isSignedIn
    && isActive
    && platformRolesChecked
    && hasPlatformRoleMembership(platformRoles, ["owner", "operator"]);
  const isOwnerStaff = isSignedIn && isActive && platformRolesChecked && hasPlatformRoleMembership(platformRoles, ["owner"]);
  const canAccessDmca = isSignedIn && isActive && platformRolesChecked && canAccessDmcaTools(platformRoles);
  const canManageAdminStaff = isSignedIn && isActive && platformRolesChecked && canManageAdminRoleAssignments(platformRoles);
  const canManageModeratorStaff = isSignedIn && isActive && platformRolesChecked && canManageModeratorRoleAssignments(platformRoles);
  const canViewStaffRoles = canManageAdminStaff || canManageModeratorStaff;
  const canManageStaffPermissions = isSignedIn && isActive && platformRolesChecked && hasPlatformRoleMembership(platformRoles, ["owner"]);
  const canAccessLiveOps = isSignedIn && isActive && platformRolesChecked && canAccessLiveOpsTools(platformRoles);
  const canAccessLegalEvidence = isSignedIn && isActive && platformRolesChecked && canAccessLegalEvidenceTools(platformRoles);
  const canAccessAuditExplorer = isSignedIn && isActive && platformRolesChecked && canAccessAuditExplorerTools(platformRoles);
  const canManagePermissionTemplates = isSignedIn && isActive && platformRolesChecked && canManageStaffPermissionTemplates(platformRoles);
  const canAccessBreakGlass = isSignedIn && isActive && platformRolesChecked && canAccessBreakGlassTools(platformRoles);
  const canAccessLegalIntake = isSignedIn && isActive && platformRolesChecked && canAccessLegalRequestIntakeTools(platformRoles);
  const canApplyReportTargetActions = canManagePrivilegedWrites
    || (
      isSignedIn
      && isActive
      && platformRolesChecked
      && hasPlatformStaffPermission(platformRoles, ["content_moderation"])
    );
  const canAccessOwnerSecurity = isOwnerStaff;
  const canAccessCanaryChecks = canAccessAuditExplorer;
  const visibleOperatorTabs = useMemo(
    () => {
      if (canManagePrivilegedWrites) return operatorTabs;
      const scopedTabs: OperatorTabKey[] = ["home"];
      if (canReviewSafetyReports) {
        scopedTabs.push("reports", "audit");
      }
      if (canAccessContentProgramming) scopedTabs.push("content");
      if (canAccessDmca) scopedTabs.push("dmca");
      if (canViewStaffRoles) scopedTabs.push("roles");
      if (canAccessLiveOps) scopedTabs.push("live-cost-guard", "live-ops-fix-center");
      if (canAccessLegalEvidence || canAccessLegalIntake) scopedTabs.push("legal");
      if (canAccessAuditExplorer) scopedTabs.push("audit-explorer");
      if (canAccessCanaryChecks) scopedTabs.push("canary");
      if (canManagePermissionTemplates) scopedTabs.push("permission-templates");
      if (canAccessBreakGlass) scopedTabs.push("break-glass");
      if (canAccessOwnerSecurity) scopedTabs.push("owner-security", "safety-dashboard");
      return operatorTabs.filter((tab) => scopedTabs.includes(tab.key));
    },
    [
      canAccessAuditExplorer,
      canAccessBreakGlass,
      canAccessContentProgramming,
      canAccessLegalEvidence,
      canAccessLegalIntake,
      canAccessLiveOps,
      canAccessOwnerSecurity,
      canAccessCanaryChecks,
      canAccessDmca,
      canManagePrivilegedWrites,
      canManagePermissionTemplates,
      canReviewSafetyReports,
      canViewStaffRoles,
    ],
  );
  const staffRoleOptions = useMemo<readonly { key: PlatformStaffManagementRole; label: string }[]>(
    () => {
      if (canManageAdminStaff) {
        return [
          { key: "admin", label: "Admin" },
          { key: "moderator", label: "Moderator" },
        ];
      }
      if (canManageModeratorStaff) {
        return [{ key: "moderator", label: "Moderator" }];
      }
      return [];
    },
    [canManageAdminStaff, canManageModeratorStaff],
  );
  const staffSnapshotSummary = platformRoleRosterSummary;
  const activePlatformRoleRoster = useMemo(
    () => platformRoleRoster.filter((entry) => entry.status === "active"),
    [platformRoleRoster],
  );
  const revokedPlatformRoleRoster = useMemo(
    () => platformRoleRoster.filter((entry) => entry.status !== "active"),
    [platformRoleRoster],
  );
  const normalizedStaffPermissionEmail = staffPermissionEmail.trim().toLowerCase();
  const staffPermissionDraftChanged = staffPermissionSavedKeys !== null
    && normalizedStaffPermissionEmail === staffPermissionLoadedEmail
    && !permissionSetsEqual(staffPermissionSavedKeys, staffPermissionSelectedKeys);
  const staffPermissionGrantDelta = staffPermissionSavedKeys
    ? staffPermissionSelectedKeys.filter((key) => !staffPermissionSavedKeys.includes(key))
    : [];
  const staffPermissionRevokeDelta = staffPermissionSavedKeys
    ? staffPermissionSavedKeys.filter((key) => !staffPermissionSelectedKeys.includes(key))
    : [];
  const staffPermissionLoadState = staffPermissionSavedKeys === null
    ? "Not Loaded"
    : staffPermissionDraftChanged ? "Unsaved Changes" : "Loaded";
  const selectedPermissionCountLabel = `${staffPermissionSelectedKeys.length} selected`;
  const canSaveStaffPermissions = canManageStaffPermissions
    && staffPermissionDraftChanged
    && staffPermissionReason.trim().length >= 6
    && staffPermissionBusy === null;
  const selectedSafetyReport = useMemo(
    () => safetyReports.find((report) => report.id === selectedSafetyReportId) ?? null,
    [safetyReports, selectedSafetyReportId],
  );
  const filteredSafetyReports = useMemo(
    () => safetyReports.filter((report) => reportMatchesTriageFilter(report, safetyReportFilter)),
    [safetyReportFilter, safetyReports],
  );
  const safetyReportQueueConnected = canReviewSafetyReports && safetyReportQueueSummary !== null;
  const safetyReportQueueCount = safetyReportQueueSummary?.totalReports ?? safetyReports.length;
  const safetyReportSourceSummary = safetyReportQueueSummary
    ? safetyReportQueueSummary.sourceSurfaces.map(formatReportSourceSurface).join(" · ") || "No source surfaces returned"
    : "Queue source not connected";
  const fallbackSelectedReportAuditRows = useMemo(() => {
    if (!selectedSafetyReport || !adminImmutableAuditReadModel.connected) return [];
    return adminImmutableAuditReadModel.latestRows
      .filter((entry) => {
        const metadata = entry.metadata ?? {};
        return (
          entry.targetType === selectedSafetyReport.targetType && entry.targetId === selectedSafetyReport.targetId
        ) || String(metadata.report_id ?? "") === String(selectedSafetyReport.id);
      })
      .slice(0, 5);
  }, [adminImmutableAuditReadModel.connected, adminImmutableAuditReadModel.latestRows, selectedSafetyReport]);
  const visibleSelectedReportAuditRows = selectedReportAuditRows.length
    ? selectedReportAuditRows
    : fallbackSelectedReportAuditRows;
  const selectedReportTargetActionDisabledReason = getReportTargetActionDisabledReason(
    selectedSafetyReport,
    canApplyReportTargetActions,
  );
  const reportTriageMetrics = useMemo(() => {
    const criticalHighRiskCount = safetyReportQueueSummary?.criticalHighRiskCount ?? null;
    const actionedTodayCount = safetyReportQueueSummary?.actionedTodayCount ?? null;
    const queueValue = !canReviewSafetyReports
      ? "Locked"
      : safetyReportsLoading
        ? "Loading"
        : safetyReportQueueConnected
          ? String(safetyReportQueueSummary?.needsReviewCount ?? safetyReportQueueCount)
          : "Not Connected";
    const queueTone: OwnerControlTone = !canReviewSafetyReports
      ? "locked"
      : safetyReportsLoading
        ? "info"
        : safetyReportQueueConnected
          ? safetyReportQueueCount > 0 ? "manual" : "success"
          : "locked";
    const healthValue = !canReviewSafetyReports
      ? "Locked"
      : safetyReportsLoading
        ? "Loading"
        : safetyReportQueueConnected
          ? "Connected"
          : "Not Connected";
    return [
      {
        label: "Needs Review",
        value: queueValue,
        body: safetyReportQueueConnected
          ? "Backed status count from safety_reports."
          : "Queue count is unavailable until the report query succeeds.",
        tone: queueTone,
      },
      {
        label: "Critical / High Risk",
        value: safetyReportQueueConnected
          ? criticalHighRiskCount === null ? "Unavailable" : String(criticalHighRiskCount)
          : "Not Connected",
        body: criticalHighRiskCount === null
          ? "Severity count is unavailable until the backed overview RPC returns it."
          : "Backed severity filter counts critical/high open reports.",
        tone: safetyReportQueueConnected && criticalHighRiskCount !== null && criticalHighRiskCount > 0
          ? "danger" as OwnerControlTone
          : safetyReportQueueConnected && criticalHighRiskCount !== null ? "success" as OwnerControlTone : "locked" as OwnerControlTone,
      },
      {
        label: "Actioned Today",
        value: safetyReportQueueConnected
          ? actionedTodayCount === null ? "Unavailable" : String(actionedTodayCount)
          : "Not Connected",
        body: actionedTodayCount === null
          ? "Actioned count requires the backed overview timestamp query."
          : "Backed status/resolution timestamps for today's triage work.",
        tone: safetyReportQueueConnected && actionedTodayCount !== null ? "info" as OwnerControlTone : "locked" as OwnerControlTone,
      },
      {
        label: "Queue Health",
        value: healthValue,
        body: safetyReportQueueConnected
          ? `Sources: ${safetyReportSourceSummary}.`
          : "The queue fails closed when the backend cannot verify access.",
        tone: safetyReportQueueConnected ? "success" as OwnerControlTone : "locked" as OwnerControlTone,
      },
    ];
  }, [
    canReviewSafetyReports,
    safetyReportQueueConnected,
    safetyReportQueueCount,
    safetyReportQueueSummary,
    safetyReportSourceSummary,
    safetyReportsLoading,
  ]);
  const legalRequestSummary = useMemo(() => {
    const openStatuses = new Set(["received", "needs_more_info", "under_review", "preserved_legal_hold", "evidence_prepared"]);
    return {
      closed: legalRequests.filter((request) => String(request.status ?? "") === "closed").length,
      evidencePrepared: legalRequests.filter((request) => ["evidence_prepared", "exported"].includes(String(request.status ?? ""))).length,
      holds: legalRequests.filter((request) => String(request.legal_hold_status ?? "") === "active" || String(request.status ?? "") === "preserved_legal_hold").length,
      open: legalRequests.filter((request) => openStatuses.has(String(request.status ?? "received"))).length,
      underReview: legalRequests.filter((request) => String(request.status ?? "") === "under_review").length,
    };
  }, [legalRequests]);
  const filteredLegalRequests = useMemo(() => {
    const query = legalRequestSearch.trim().toLowerCase();
    return legalRequests.filter((request) => {
      const status = String(request.status ?? "received").toLowerCase();
      if (legalRequestStatusFilter !== "all" && status !== legalRequestStatusFilter) return false;
      if (!query) return true;
      return [
        request.id,
        request.case_number,
        request.requesting_agency,
        request.contact_name,
        request.contact_email,
        request.target_user_id,
        request.target_content_id,
        request.target_thread_id,
        request.target_room_id,
        request.target_report_id,
        status,
      ].some((value) => String(value ?? "").toLowerCase().includes(query));
    });
  }, [legalRequestSearch, legalRequestStatusFilter, legalRequests]);
  const selectedLegalRequest = selectedLegalRequestDetail?.request ?? legalRequests.find((request) => request.id === selectedLegalRequestId) ?? null;
  const selectedLegalTarget = legalRequestPrimaryTarget(selectedLegalRequest);
  const blockedBetaCopy = getBetaAccessBlockCopy(accessState.status, "Operator Center");

  useEffect(() => {
    if (visibleOperatorTabs.length > 0 && !visibleOperatorTabs.some((tab) => tab.key === operatorTab)) {
      setOperatorTab(visibleOperatorTabs[0].key);
    }
  }, [operatorTab, visibleOperatorTabs]);

  useEffect(() => {
    if (staffRoleOptions.length > 0 && !staffRoleOptions.some((option) => option.key === staffRoleTarget)) {
      setStaffRoleTarget(staffRoleOptions[0].key);
    }
  }, [staffRoleOptions, staffRoleTarget]);

  useEffect(() => {
    if (!isSignedIn || !isActive) {
      setLoading(false);
      setConfigLoading(false);
      setAppConfigConnected(false);
      setAppConfigSource(null);
      setAppConfigSavedAt(null);
      setSavedExperienceConfig(DEFAULT_APP_CONFIG);
      setTitlesConnected(false);
      setContentAuditRows([]);
      setContentAuditLoading(false);
      setContentAuditConnected(false);
      setContentLastRefreshedAt(null);
      setContentConfirm(null);
      setContentConfirmReason("");
      setPlatformRoles([]);
      setPlatformRolesLoading(false);
      setPlatformRolesChecked(false);
      setPlatformRoleRoster([]);
      setPlatformRoleRosterSummary(null);
      setPlatformRoleRosterGeneratedAt(null);
      setPlatformRoleRosterLoading(false);
      setStaffRoleEmail("");
      setStaffRoleTarget("moderator");
      setStaffRoleReason("");
      setStaffRoleBusy(null);
      setStaffPermissionEmail("");
      setStaffPermissionSavedKeys(null);
      setStaffPermissionSelectedKeys([]);
      setStaffPermissionLoadedEmail("");
      setStaffPermissionReason("");
      setStaffPermissionExpiresAt("");
      setStaffPermissionBusy(null);
      setRoleAuditEvents([]);
      setRoleAuditLoading(false);
      setRoleAuditFilter("all");
      setRoleConfirm(null);
      setAdminAuditLog([]);
      setAdminAuditLogSummary(null);
      setAdminAuditLogLoading(false);
      setSafetyReports([]);
      setSafetyReportQueueSummary(null);
      setSafetyReportsLoading(false);
      setSafetyReportsLastLoadedAt(null);
      setSafetyReportFilter("needs_review");
      setSelectedSafetyReportId(null);
      setSafetyReportDetailVisible(false);
      setSelectedReportAuditRows([]);
      setManualReportActionOpen(false);
      setModerationNotice(null);
      setDmcaCases([]);
      setDmcaCasesLoading(false);
      setDmcaCaseSummary(null);
      setDmcaCaseDetail(null);
      setDmcaDetailVisible(false);
      setDmcaSelectedCaseId(null);
      setDmcaSearchQuery("");
      setDmcaNotice(null);
      setDmcaActionBusy(null);
      setDmcaIntakeVisible(false);
      setDmcaIntakeBusy(false);
      setDmcaIntakeForm(createDmcaNoticeFormState());
      setCreatorVideoModerationReason("");
      setCreatorVideoModerationBusy(null);
      setPendingCreatorVideoModeration(null);
      setAdminOpsNotice(null);
      setLiveCostGuardSettingsReadModel(null);
      setLiveCostGuardSettingsForm(DEFAULT_LIVE_COST_GUARD_SETTINGS);
      setLiveCostGuardEvents([]);
      setLiveCostGuardActions([]);
      setLiveCostGuardLoading(false);
      setLiveCostGuardSaving(false);
      setLiveCostGuardNotice(null);
      setLiveCostGuardActionBusy(null);
      setLiveOpsReadModel(null);
      setLiveOpsLoading(false);
      setLiveOpsNotice(null);
      setLiveOpsActionBusy(null);
      setOwnerControlNotice(null);
      setOwnerControlLoading(false);
      setAuditExplorerRows([]);
      setPermissionTemplates([]);
      setPermissionTemplateBusy(null);
      setBreakGlassSessions([]);
      setBreakGlassActiveSessionId(null);
      setBreakGlassBusy(null);
      setLegalRequests([]);
      setSelectedLegalRequestId(null);
      setSelectedLegalRequestDetail(null);
      setLegalRequestDetailBusy(false);
      setLegalRequestStatusFilter("all");
      setLegalRequestSearch("");
      setLegalRequestNote("");
      setLegalPreviewResult(null);
      setLegalExportResult(null);
      setLegalHoldResult(null);
      setLegalSubsection("intake");
      setLegalRequestBusy(false);
      setOwnerSecurityStatus(null);
      setOwnerSafetyDashboard(null);
      setCanaryRuns([]);
      setCanaryBusy(false);
      setCanaryStatusFilter("all");
      setExpandedCanaryRows({});
      setExpandedOwnerControlRows({});
      setAdminV1ReadModel(EMPTY_ADMIN_V1_READ_MODEL);
      setAdminFinanceReadModel(EMPTY_ADMIN_FINANCE_READ_MODEL);
      setAdminImmutableAuditReadModel(EMPTY_ADMIN_IMMUTABLE_AUDIT_READ_MODEL);
      return;
    }
    void loadPlatformRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSignedIn, isActive, user?.id, user?.email]);

  useEffect(() => {
    if (!canAccessAdmin) {
      setLoading(false);
      setConfigLoading(false);
      setAppConfigConnected(false);
      setAppConfigSource(null);
      setAppConfigSavedAt(null);
      setSavedExperienceConfig(DEFAULT_APP_CONFIG);
      setTitlesConnected(false);
      setContentAuditRows([]);
      setContentAuditLoading(false);
      setContentAuditConnected(false);
      setContentLastRefreshedAt(null);
      setContentConfirm(null);
      setContentConfirmReason("");
      setPlatformRoleRoster([]);
      setPlatformRoleRosterSummary(null);
      setPlatformRoleRosterGeneratedAt(null);
      setPlatformRoleRosterLoading(false);
      setStaffRoleBusy(null);
      setStaffPermissionSavedKeys(null);
      setStaffPermissionSelectedKeys([]);
      setStaffPermissionLoadedEmail("");
      setStaffPermissionBusy(null);
      setRoleAuditEvents([]);
      setRoleAuditLoading(false);
      setRoleConfirm(null);
      setAdminAuditLog([]);
      setAdminAuditLogSummary(null);
      setAdminAuditLogLoading(false);
      setSafetyReports([]);
      setSafetyReportQueueSummary(null);
      setSafetyReportsLoading(false);
      setSafetyReportsLastLoadedAt(null);
      setSelectedSafetyReportId(null);
      setSafetyReportDetailVisible(false);
      setSelectedReportAuditRows([]);
      setManualReportActionOpen(false);
      setDmcaCases([]);
      setDmcaCasesLoading(false);
      setDmcaCaseSummary(null);
      setDmcaCaseDetail(null);
      setDmcaDetailVisible(false);
      setDmcaSelectedCaseId(null);
      setDmcaNotice(null);
      setDmcaActionBusy(null);
      setDmcaIntakeVisible(false);
      setDmcaIntakeBusy(false);
      setLiveCostGuardSettingsReadModel(null);
      setLiveCostGuardSettingsForm(DEFAULT_LIVE_COST_GUARD_SETTINGS);
      setLiveCostGuardEvents([]);
      setLiveCostGuardActions([]);
      setLiveCostGuardLoading(false);
      setLiveCostGuardSaving(false);
      setLiveCostGuardNotice(null);
      setLiveCostGuardActionBusy(null);
      setLiveOpsReadModel(null);
      setLiveOpsLoading(false);
      setLiveOpsNotice(null);
      setLiveOpsActionBusy(null);
      setOwnerControlNotice(null);
      setOwnerControlLoading(false);
      setAuditExplorerRows([]);
      setPermissionTemplates([]);
      setPermissionTemplateBusy(null);
      setBreakGlassSessions([]);
      setBreakGlassActiveSessionId(null);
      setBreakGlassBusy(null);
      setLegalRequests([]);
      setLegalRequestBusy(false);
      setOwnerSecurityStatus(null);
      setOwnerSafetyDashboard(null);
      setCanaryRuns([]);
      setCanaryBusy(false);
      setCanaryStatusFilter("all");
      setExpandedCanaryRows({});
      setExpandedOwnerControlRows({});
      setAdminV1ReadModel(EMPTY_ADMIN_V1_READ_MODEL);
      setAdminFinanceReadModel(EMPTY_ADMIN_FINANCE_READ_MODEL);
      setAdminImmutableAuditReadModel(EMPTY_ADMIN_IMMUTABLE_AUDIT_READ_MODEL);
      return;
    }
    if (!canAccessContentProgramming) {
      setLoading(false);
      setConfigLoading(false);
      setAppConfigConnected(false);
      setAppConfigSource(null);
      setAppConfigSavedAt(null);
      setSavedExperienceConfig(DEFAULT_APP_CONFIG);
      setTitlesConnected(false);
      setContentAuditRows([]);
      setContentAuditLoading(false);
      setContentAuditConnected(false);
      setContentLastRefreshedAt(null);
      setContentConfirm(null);
      setContentConfirmReason("");
      setLiveOpsReadModel(null);
      setLiveOpsLoading(false);
      setLiveOpsNotice(null);
      setLiveOpsActionBusy(null);
      setAdminV1ReadModel(EMPTY_ADMIN_V1_READ_MODEL);
      setAdminFinanceReadModel(EMPTY_ADMIN_FINANCE_READ_MODEL);
      setAdminImmutableAuditReadModel(EMPTY_ADMIN_IMMUTABLE_AUDIT_READ_MODEL);
      return;
    }
    loadTitles();
    loadExperienceConfig();
    void loadContentAuditEvents();
    void loadAdminV1ReadModel();
    void loadAdminFinanceReadModel();
    void loadAdminImmutableAuditReadModel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccessAdmin, canAccessContentProgramming]);

  useEffect(() => {
    if (!canAccessAdmin || !canReviewSafetyReports) {
      setSafetyReports([]);
      setSafetyReportQueueSummary(null);
      setSafetyReportsLoading(false);
      setSafetyReportsLastLoadedAt(null);
      setSelectedSafetyReportId(null);
      setSafetyReportDetailVisible(false);
      setSelectedReportAuditRows([]);
      return;
    }
    void loadSafetyReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccessAdmin, canReviewSafetyReports]);

  useEffect(() => {
    if (selectedSafetyReportId !== null && !safetyReports.some((report) => report.id === selectedSafetyReportId)) {
      setSelectedSafetyReportId(null);
      setSafetyReportDetailVisible(false);
      setSelectedReportAuditRows([]);
    }
  }, [safetyReports, selectedSafetyReportId]);

  useEffect(() => {
    if (!safetyReportDetailVisible || !selectedSafetyReport || !canReviewSafetyReports) {
      setSelectedReportAuditRows([]);
      setSelectedReportAuditLoading(false);
      return;
    }

    let cancelled = false;
    setSelectedReportAuditLoading(true);
    listAdminReportAuditEvents(selectedSafetyReport.id)
      .then((rows) => {
        if (!cancelled) setSelectedReportAuditRows(rows);
      })
      .catch(() => {
        if (!cancelled) setSelectedReportAuditRows([]);
      })
      .finally(() => {
        if (!cancelled) setSelectedReportAuditLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [canReviewSafetyReports, safetyReportDetailVisible, selectedSafetyReport]);

  useEffect(() => {
    if (!canAccessAdmin) {
      setPlatformRoleRoster([]);
      setPlatformRoleRosterSummary(null);
      setPlatformRoleRosterGeneratedAt(null);
      setPlatformRoleRosterLoading(false);
      setAdminAuditLog([]);
      setAdminAuditLogSummary(null);
      setAdminAuditLogLoading(false);
      setAdminOpsNotice(null);
      return;
    }
    void loadStaffAndAuditVisibility();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAccessAdmin, canManagePrivilegedWrites, canReviewSafetyReports, canViewStaffRoles, roleAuditFilter]);

  const stats = useMemo(() => {
    const total = titles.length;
    const published = titles.filter((item) => normalizeStatus(item.status, item.is_published) === "published").length;
    const scheduled = titles.filter((item) => normalizeStatus(item.status, item.is_published) === "scheduled").length;
    const draft = titles.filter((item) => normalizeStatus(item.status, item.is_published) === "draft").length;
    const hero = titles.filter((item) => item.is_hero === true).length;
    return { total, published, scheduled, draft, hero };
  }, [titles]);

  const categoryOptions = useMemo(() => {
    return Array.from(
      new Set(
        titles
          .map((item) => (item.category ?? "").trim())
          .filter((item) => item.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b));
  }, [titles]);

  const filteredTitles = useMemo(() => {
    const q = query.trim().toLowerCase();

    return titles.filter((item) => {
      const status = normalizeStatus(item.status, item.is_published);
      if (filter === "published" && status !== "published") return false;
      if (filter === "scheduled" && status !== "scheduled") return false;
      if (filter === "draft" && status !== "draft") return false;
      if (filter === "archived" && status !== "archived") return false;
      if (filter === "featured" && item.featured !== true) return false;
      if (filter === "hero" && item.is_hero !== true) return false;
      if (filter === "trending" && item.is_trending !== true) return false;
      if (filter === "top-row" && item.pin_to_top_row !== true) return false;

      if (!q) return true;

      const titleText = (item.title ?? "").toLowerCase();
      const categoryText = (item.category ?? "").toLowerCase();
      const statusText = status.toLowerCase();
      return titleText.includes(q) || categoryText.includes(q) || statusText.includes(q);
    });
  }, [titles, query, filter]);

  const programmingSnapshot = useMemo(() => {
    const latestTitles = [...titles].sort((a, b) => toTimestamp(b.created_at) - toTimestamp(a.created_at));
    const programmedTitles = sortTitlesByProgrammingTruth(titles);
    const guardrailedConfig = applyExperienceConfigGuardrails(experienceConfig, titles);
    const configuredHeroMode = experienceConfig.home.heroMode;
    const configuredTopPicksSource = experienceConfig.home.topPicksSource;
    const manualHeroTitleId = String(experienceConfig.home.manualHeroTitleId ?? "").trim();
    const manualHeroItem = manualHeroTitleId
      ? programmedTitles.find((item) => hasTitleId(item, manualHeroTitleId)) ?? null
      : null;
    const heroFlagItem = programmedTitles.find((item) => item.is_hero === true) ?? null;

    let resolvedHeroSource: AppConfig["home"]["heroMode"] = configuredHeroMode;
    let resolvedHeroItem: TitleRow | null = null;

    if (configuredHeroMode === "manual_title") {
      if (manualHeroItem) {
        resolvedHeroItem = manualHeroItem;
      } else if (heroFlagItem) {
        resolvedHeroSource = "hero_flag";
        resolvedHeroItem = heroFlagItem;
      } else {
        resolvedHeroSource = "latest";
        resolvedHeroItem = latestTitles[0] ?? null;
      }
    } else if (configuredHeroMode === "hero_flag") {
      if (heroFlagItem) {
        resolvedHeroItem = heroFlagItem;
      } else {
        resolvedHeroSource = "latest";
        resolvedHeroItem = latestTitles[0] ?? null;
      }
    } else {
      resolvedHeroItem = latestTitles[0] ?? null;
    }

    const configuredTopPicksTitles = getTopPicksCandidates(programmedTitles, configuredTopPicksSource);
    const effectiveTopPicksSource = configuredTopPicksTitles.length > 0 ? configuredTopPicksSource : "recent";
    const effectiveTopPicksTitles = effectiveTopPicksSource === configuredTopPicksSource
      ? configuredTopPicksTitles
      : latestTitles;

    return {
      configuredHeroMode,
      manualHeroItem,
      resolvedHeroSource,
      resolvedHeroItem,
      configuredTopPicksSource,
      configuredTopPicksCount: configuredTopPicksTitles.length,
      effectiveTopPicksSource,
      effectiveTopPicksCount: effectiveTopPicksTitles.length,
      guardrailAdjustments: guardrailedConfig.adjustments,
    };
  }, [experienceConfig, titles]);

  const manualHeroSelection = useMemo(() => {
    const selectedId = String(experienceConfig.home.manualHeroTitleId ?? "").trim();
    const needle = manualHeroQuery.trim().toLowerCase();
    const sortedTitles = sortTitlesByProgrammingTruth(titles);
    const matchingTitles = sortedTitles.filter((item) => {
      if (!needle) return true;
      const status = normalizeStatus(item.status, item.is_published);
      return (item.title ?? "").toLowerCase().includes(needle)
        || (item.category ?? "").toLowerCase().includes(needle)
        || status.toLowerCase().includes(needle);
    });

    const rankedTitles = matchingTitles.sort((a, b) => {
      const aSelected = selectedId.length > 0 && hasTitleId(a, selectedId);
      const bSelected = selectedId.length > 0 && hasTitleId(b, selectedId);
      if (aSelected && !bSelected) return -1;
      if (!aSelected && bSelected) return 1;
      return 0;
    });

    return {
      selectedId,
      selectedTitle: selectedId.length > 0
        ? sortedTitles.find((item) => hasTitleId(item, selectedId)) ?? null
        : null,
      totalMatches: rankedTitles.length,
      visibleTitles: rankedTitles.slice(0, needle ? 40 : 24),
    };
  }, [experienceConfig.home.manualHeroTitleId, manualHeroQuery, titles]);

  const hasHeroControl = capabilities.heroCol !== null;
  const hasTrendingControl = capabilities.trendingCol !== null;
  const hasTopRowControl = capabilities.topRowCol !== null;
  const hasReleaseControl = capabilities.releaseCol !== null;
  const hasStatusControl = capabilities.statusCol !== null;
  const hasTitleMonetizationControls =
    capabilities.contentAccessCol !== null
    && capabilities.adsEnabledCol !== null
    && capabilities.sponsorPlacementCol !== null
    && capabilities.sponsorLabelCol !== null;

  const upcomingScheduledSnapshot = useMemo(() => {
    const queue = titles
      .map((item) => {
        const publicationState = normalizePublicationState({
          status: normalizeStatus(item.status, item.is_published),
          releaseAt: item.release_at ?? null,
          hasStatusControl,
          hasReleaseControl,
        });

        if (publicationState.status !== "scheduled" || !publicationState.releaseAt) return null;

        const releaseAtTime = Date.parse(publicationState.releaseAt);
        if (!Number.isFinite(releaseAtTime) || releaseAtTime <= Date.now()) return null;

        return {
          item,
          releaseAt: publicationState.releaseAt,
          releaseAtTime,
        };
      })
      .filter((entry): entry is { item: TitleRow; releaseAt: string; releaseAtTime: number } => entry !== null)
      .sort((a, b) => {
        const releaseDelta = a.releaseAtTime - b.releaseAtTime;
        if (releaseDelta !== 0) return releaseDelta;
        const sortDelta = toSortNumber(a.item.sort_order) - toSortNumber(b.item.sort_order);
        if (sortDelta !== 0) return sortDelta;
        return (a.item.title ?? "").localeCompare(b.item.title ?? "");
      });

    return {
      totalUpcoming: queue.length,
      nextReleaseAt: queue[0]?.releaseAt ?? null,
      nextItem: queue[0]?.item ?? null,
      visibleItems: queue.slice(0, 4),
    };
  }, [hasReleaseControl, hasStatusControl, titles]);

  const contentConfigDirty = stringifyConfig(experienceConfig) !== stringifyConfig(savedExperienceConfig);
  const contentLastCheckedAt = useMemo(() => getLatestHomeTimestamp([
    contentLastRefreshedAt,
    appConfigSavedAt,
    contentAuditRows[0]?.created_at ?? null,
  ]), [appConfigSavedAt, contentAuditRows, contentLastRefreshedAt]);
  const contentLoading = loading || configLoading || contentAuditLoading;
  const contentConfirmBusy = configSaving || saving || creatorGrantSaving;
  const publishedTitleCount = titlesConnected ? stats.published : null;
  const scheduledTitleCount = titlesConnected ? upcomingScheduledSnapshot.totalUpcoming : null;
  const draftTitleCount = titlesConnected ? stats.draft : null;
  const heroPickCount = titlesConnected ? stats.hero : null;

  const contentCommandStatus = useMemo(() => {
    if (contentLoading) {
      return {
        body: "Refreshing title inventory, saved config, and content audit proof.",
        label: "Partial Visibility",
        tone: "info" as OwnerControlTone,
      };
    }
    if (!titlesConnected || !appConfigConnected) {
      return {
        body: "Content programming cannot be called ready until titles and saved app configuration both load successfully.",
        label: "Partial Visibility",
        tone: "manual" as OwnerControlTone,
      };
    }
    if (contentConfigDirty) {
      return {
        body: "Draft changes are selected locally. Save Config requires a reason and immutable audit.",
        label: "Unsaved Changes",
        tone: "manual" as OwnerControlTone,
      };
    }
    if (programmingSnapshot.guardrailAdjustments.length) {
      return {
        body: "Saved programming references a source that would normalize during the next save.",
        label: "Needs Review",
        tone: "manual" as OwnerControlTone,
      };
    }
    return {
      body: "Saved programming is backed by the current title/config read paths; foundation systems stay labeled below.",
      label: "Programming Ready",
      tone: "success" as OwnerControlTone,
    };
  }, [
    appConfigConnected,
    contentConfigDirty,
    contentLoading,
    programmingSnapshot.guardrailAdjustments.length,
    titlesConnected,
  ]);

  const contentSnapshotTiles = useMemo<readonly AdminHomeSignalTile[]>(() => [
    {
      label: "Published Titles",
      value: formatContentCount(publishedTitleCount, loading),
      body: titlesConnected ? "Backed count from the titles query." : "No count is shown until titles load successfully.",
      qualifier: titlesConnected ? "Backed" : "Not Connected",
      tone: loading ? "info" : titlesConnected ? "success" : "locked",
    },
    {
      label: "Scheduled Titles",
      value: formatContentCount(scheduledTitleCount, loading),
      body: hasReleaseControl ? "Future release_at rows only." : "Scheduling column not connected on this schema.",
      qualifier: hasReleaseControl ? titlesConnected ? "Backed" : "Not Connected" : "Not Connected",
      tone: loading ? "info" : hasReleaseControl && titlesConnected ? "manual" : "locked",
    },
    {
      label: "Draft Titles",
      value: formatContentCount(draftTitleCount, loading),
      body: titlesConnected ? "Draft/off-catalog programming rows." : "Draft count is hidden until titles load.",
      qualifier: titlesConnected ? "Backed" : "Not Connected",
      tone: loading ? "info" : titlesConnected ? "manual" : "locked",
    },
    {
      label: "Hero Picks",
      value: formatContentCount(heroPickCount, loading),
      body: hasHeroControl ? "Hero flag count from the titles row set." : "Hero flag column is not connected.",
      qualifier: hasHeroControl ? titlesConnected ? "Backed" : "Not Connected" : "Not Connected",
      tone: loading ? "info" : hasHeroControl && titlesConnected ? heroPickCount === 1 ? "success" : "manual" : "locked",
    },
  ], [
    draftTitleCount,
    hasHeroControl,
    hasReleaseControl,
    heroPickCount,
    loading,
    publishedTitleCount,
    scheduledTitleCount,
    titlesConnected,
  ]);

  const contentRailRows = useMemo(() => {
    const programmedTitles = sortTitlesByProgrammingTruth(titles);
    return experienceConfig.home.railOrder.map((railKey, index) => {
      let itemCount: number | null = null;
      let backing = "Config";
      let body = "Config-backed rail placement.";
      if (railKey === "top_picks") {
        itemCount = titlesConnected ? getTopPicksCandidates(programmedTitles, experienceConfig.home.topPicksSource).length : null;
        backing = "Backed";
        body = `${formatProgrammingToken(experienceConfig.home.topPicksSource)} source for Top Picks.`;
      } else if (railKey === "browse") {
        const needle = experienceConfig.home.browseCategoryQuery.trim().toLowerCase();
        itemCount = titlesConnected
          ? programmedTitles.filter((item) => (item.category ?? "").toLowerCase().includes(needle)).length
          : null;
        backing = "Backed";
        body = `Category query: ${experienceConfig.home.browseCategoryQuery || "not set"}.`;
      } else if (railKey === "favorites" || railKey === "continue_watching") {
        backing = "Read Only";
        body = "User-specific rail; global Content can order or hide it, not count personal rows.";
      }

      return {
        backing,
        body,
        itemCount,
        key: railKey,
        label: railLabels[railKey],
        position: index + 1,
        visible: experienceConfig.home.enabledRails[railKey],
      };
    });
  }, [experienceConfig.home, titles, titlesConnected]);

  const contentAuditVisibleRows = useMemo(() => contentAuditRows.slice(0, 6), [contentAuditRows]);

  const liveCostGuardSnapshot = useMemo(() => {
    const severityOrder: Record<string, number> = {
      normal: 0,
      warning: 1,
      high: 2,
      critical: 3,
      emergency: 4,
    };
    const strongestEventSeverity = liveCostGuardEvents
      .map((event) => event.severity)
      .sort((left, right) => (severityOrder[right] ?? 0) - (severityOrder[left] ?? 0))[0] ?? "normal";
    const thresholdSeverity = classifyLiveCostSeverity(
      {
        estimatedTurnMbps: null,
        estimatedUsdPerHour: null,
      },
      liveCostGuardSettingsForm,
    );
    const activeSeverity = (severityOrder[strongestEventSeverity] ?? 0) > (severityOrder[thresholdSeverity] ?? 0)
      ? strongestEventSeverity
      : thresholdSeverity;
    const since = Date.now() - (24 * 60 * 60 * 1000);
    const eventsLast24h = liveCostGuardEvents.filter((event) => Date.parse(event.createdAt) >= since).length;
    const actionsLast24h = liveCostGuardActions.filter((action) => Date.parse(action.createdAt) >= since).length;

    return {
      actionsLast24h,
      activeSeverity,
      eventsLast24h,
    };
  }, [liveCostGuardActions, liveCostGuardEvents, liveCostGuardSettingsForm]);

  const liveOpsIncidents = liveOpsReadModel?.incidents ?? [];
  const liveOpsAudits = liveOpsReadModel?.audits ?? [];
  const liveOpsOpenCount = liveOpsIncidents.filter((incident) =>
    incident.status === "detected" || incident.status === "waiting_approval"
  ).length;
  const liveOpsHighestRisk = useMemo(() => {
    const riskOrder: Record<string, number> = {
      low: 0,
      medium: 1,
      high: 2,
      critical: 3,
    };
    return liveOpsIncidents
      .map((incident) => incident.riskLevel)
      .sort((left, right) => (riskOrder[right] ?? 0) - (riskOrder[left] ?? 0))[0] ?? "low";
  }, [liveOpsIncidents]);
  const liveOpsAuditsByIncident = useMemo(() => {
    return liveOpsAudits.reduce<Record<string, LiveOpsActionAudit[]>>((acc, audit) => {
      if (!audit.incidentId) return acc;
      acc[audit.incidentId] = [...(acc[audit.incidentId] ?? []), audit];
      return acc;
    }, {});
  }, [liveOpsAudits]);

  const homeLastCheckedAt = useMemo(() => getLatestHomeTimestamp([
    safetyReportsLastLoadedAt,
    dmcaCases[0]?.updatedAt,
    adminV1ReadModel.generatedAt,
    adminFinanceReadModel.generatedAt,
    adminImmutableAuditReadModel.generatedAt,
    liveCostGuardSettingsForm.updatedAt,
    liveCostGuardEvents[0]?.createdAt,
    liveOpsIncidents[0]?.updatedAt,
  ]), [
    adminFinanceReadModel.generatedAt,
    adminImmutableAuditReadModel.generatedAt,
    adminV1ReadModel.generatedAt,
    dmcaCases,
    liveCostGuardEvents,
    liveCostGuardSettingsForm.updatedAt,
    liveOpsIncidents,
    safetyReportsLastLoadedAt,
  ]);

  const homeRefreshing = platformRoleCheckPending
    || safetyReportsLoading
    || dmcaCasesLoading
    || configLoading
    || adminV1ReadModel.loading
    || adminFinanceReadModel.loading
    || adminImmutableAuditReadModel.loading
    || liveCostGuardLoading
    || liveOpsLoading;

  const recentReportsNeedsReview = safetyReportQueueConnected
    ? safetyReportQueueSummary?.needsReviewCount ?? 0
    : null;
  const recentReportsCriticalHigh = safetyReportQueueConnected
    ? safetyReportQueueSummary?.criticalHighRiskCount ?? null
    : null;
  const dmcaOpenHomeCount = canAccessDmca && dmcaCaseSummary ? dmcaCaseSummary.open : null;
  const dmcaPriorityHomeCount = canAccessDmca && dmcaCaseSummary ? dmcaCaseSummary.priority : null;
  const liveOpsConnected = !!liveOpsReadModel?.connected;
  const liveCostGuardConnected = !!liveCostGuardSettingsReadModel?.connected;
  const liveCostGuardNeedsReview = isLiveCostAttentionSeverity(liveCostGuardSnapshot.activeSeverity);
  const appConfigNotConnected = !configLoading && !appConfigConnected;
  const immutableAuditNotConnected = !adminImmutableAuditReadModel.loading && !adminImmutableAuditReadModel.connected;
  const reportQueueNotConnected = canReviewSafetyReports && !safetyReportsLoading && !safetyReportQueueConnected;
  const dmcaNotConnected = canAccessDmca && !dmcaCasesLoading && !dmcaCaseSummary;
  const liveOpsNotConnected = canAccessLiveOps && !liveOpsLoading && !liveOpsConnected;

  const homeCommandStatus = useMemo(() => {
    const manualReviewRequired = notice?.type === "error"
      || (recentReportsCriticalHigh !== null && recentReportsCriticalHigh > 0)
      || liveOpsHighestRisk === "critical"
      || liveCostGuardSnapshot.activeSeverity === "critical"
      || liveCostGuardSnapshot.activeSeverity === "emergency";
    const needsAttention = (recentReportsNeedsReview !== null && recentReportsNeedsReview > 0)
      || (dmcaPriorityHomeCount !== null && dmcaPriorityHomeCount > 0)
      || liveOpsOpenCount > 0
      || liveCostGuardNeedsReview
      || !!moderationNotice
      || !!dmcaNotice
      || !!adminOpsNotice;
    const partialVisibility = appConfigNotConnected
      || immutableAuditNotConnected
      || reportQueueNotConnected
      || dmcaNotConnected
      || liveOpsNotConnected
      || adminV1ReadModel.premiumActiveCount === null
      || adminV1ReadModel.activeLiveRoomCount === null
      || adminV1ReadModel.activeWatchPartyCount === null
      || adminV1ReadModel.uploadsTodayCount === null;

    if (homeRefreshing) {
      return {
        body: "Refreshing backed admin queries and foundation readouts.",
        label: "Partial Visibility",
        tone: "info" as AdminHomeTone,
      };
    }
    if (manualReviewRequired) {
      return {
        body: "One or more backed signals requires owner/operator review before this can be called calm.",
        label: "Manual Review Required",
        tone: "danger" as AdminHomeTone,
      };
    }
    if (needsAttention) {
      return {
        body: "Backed queues or observe-only operations have pending work to review.",
        label: "Needs Attention",
        tone: "manual" as AdminHomeTone,
      };
    }
    if (partialVisibility) {
      return {
        body: "No urgent queue is visible, but at least one source is not connected or remains estimate/foundation only.",
        label: "Partial Visibility",
        tone: "manual" as AdminHomeTone,
      };
    }
    return {
      body: "Backed admin signals are quiet, with foundation-only systems still labeled below.",
      label: "Stable",
      tone: "success" as AdminHomeTone,
    };
  }, [
    adminOpsNotice,
    adminV1ReadModel.activeLiveRoomCount,
    adminV1ReadModel.activeWatchPartyCount,
    adminV1ReadModel.premiumActiveCount,
    adminV1ReadModel.uploadsTodayCount,
    appConfigNotConnected,
    dmcaNotConnected,
    dmcaNotice,
    dmcaPriorityHomeCount,
    homeRefreshing,
    immutableAuditNotConnected,
    liveCostGuardNeedsReview,
    liveCostGuardSnapshot.activeSeverity,
    liveOpsHighestRisk,
    liveOpsNotConnected,
    liveOpsOpenCount,
    moderationNotice,
    notice,
    recentReportsCriticalHigh,
    recentReportsNeedsReview,
    reportQueueNotConnected,
  ]);

  const homeSnapshotMetrics = useMemo<readonly AdminHomeSignalTile[]>(() => {
    const reportValue = !canReviewSafetyReports
      ? "Locked"
      : formatHomeCount(recentReportsNeedsReview, safetyReportsLoading);
    const dmcaValue = !canAccessDmca
      ? "Locked"
      : formatHomeCount(dmcaOpenHomeCount, dmcaCasesLoading);
    const liveOpsValue = !canAccessLiveOps
      ? "Locked"
      : liveOpsLoading
        ? "Loading"
        : liveOpsConnected
          ? String(liveOpsOpenCount)
          : "Not Connected";
    const auditValue = adminImmutableAuditReadModel.loading
      ? "Loading"
      : adminImmutableAuditReadModel.connected
        ? "Connected"
        : "Not Connected";

    return [
      {
        label: "Recent Reports",
        value: reportValue,
        body: safetyReportQueueConnected
          ? "Backed needs-review count from safety_reports."
          : canReviewSafetyReports
            ? "Queue count appears only after the report query succeeds."
            : "Report review is hidden without backed staff permission.",
        qualifier: safetyReportQueueConnected ? "Backed" : canReviewSafetyReports ? "Not Connected" : "Read Only",
        tone: !canReviewSafetyReports
          ? "locked"
          : safetyReportsLoading
            ? "info"
            : recentReportsCriticalHigh !== null && recentReportsCriticalHigh > 0
              ? "danger"
              : recentReportsNeedsReview !== null && recentReportsNeedsReview > 0
                ? "manual"
                : safetyReportQueueConnected
                  ? "success"
                  : "locked",
        destination: canReviewSafetyReports ? "reports" : undefined,
      },
      {
        label: "Open DMCA Cases",
        value: dmcaValue,
        body: dmcaCaseSummary
          ? "Backed open status count from dmca_cases."
          : canAccessDmca
            ? "Case count appears only after the DMCA query succeeds."
            : "Copyright case access requires scoped owner/admin truth.",
        qualifier: dmcaCaseSummary ? "Backed" : canAccessDmca ? "Not Connected" : "Read Only",
        tone: !canAccessDmca
          ? "locked"
          : dmcaCasesLoading
            ? "info"
            : dmcaPriorityHomeCount !== null && dmcaPriorityHomeCount > 0
              ? "manual"
              : dmcaOpenHomeCount !== null
                ? "success"
                : "locked",
        destination: canAccessDmca ? "dmca" : undefined,
      },
      {
        label: "Open Live Ops Items",
        value: liveOpsValue,
        body: liveOpsConnected
          ? "Owner/operator fix cards from the backend proxy."
          : canAccessLiveOps
            ? "Fix Center is unavailable until the backend proxy responds."
            : "Live Ops is scoped to Owner or live_ops permission.",
        qualifier: liveOpsConnected ? "Connected" : canAccessLiveOps ? "Not Connected" : "Read Only",
        tone: !canAccessLiveOps
          ? "locked"
          : liveOpsLoading
            ? "info"
            : liveOpsConnected && liveOpsOpenCount > 0
              ? "manual"
              : liveOpsConnected
                ? "success"
                : "locked",
        destination: canAccessLiveOps ? "live-ops-fix-center" : undefined,
      },
      {
        label: "Audit / Command Health",
        value: auditValue,
        body: adminImmutableAuditReadModel.connected
          ? "Immutable audit rows are readable; Home actions remain drill-down only."
          : "Audit health is unavailable until immutable audit query succeeds.",
        qualifier: adminImmutableAuditReadModel.connected ? "Connected" : "Not Connected",
        tone: adminImmutableAuditReadModel.loading
          ? "info"
          : adminImmutableAuditReadModel.connected
            ? "success"
            : "locked",
        destination: "audit",
      },
    ];
  }, [
    adminImmutableAuditReadModel.connected,
    adminImmutableAuditReadModel.loading,
    canAccessDmca,
    canAccessLiveOps,
    canReviewSafetyReports,
    dmcaCaseSummary,
    dmcaCasesLoading,
    dmcaOpenHomeCount,
    dmcaPriorityHomeCount,
    liveOpsConnected,
    liveOpsLoading,
    liveOpsOpenCount,
    recentReportsCriticalHigh,
    recentReportsNeedsReview,
    safetyReportQueueConnected,
    safetyReportsLoading,
  ]);

  const homeAttentionItems = useMemo<readonly AdminHomeAttentionItem[]>(() => {
    const rows: AdminHomeAttentionItem[] = [];

    if (canReviewSafetyReports && recentReportsNeedsReview !== null && recentReportsNeedsReview > 0) {
      rows.push({
        body: recentReportsCriticalHigh !== null && recentReportsCriticalHigh > 0
          ? "Critical/high-risk reports are present in the backed queue."
          : "Reports are waiting in the backed recent review queue.",
        destination: "reports",
        label: "Recent reports awaiting review",
        priorityLabel: recentReportsCriticalHigh !== null && recentReportsCriticalHigh > 0 ? "High" : "Review",
        tone: recentReportsCriticalHigh !== null && recentReportsCriticalHigh > 0 ? "danger" : "manual",
        value: String(recentReportsNeedsReview),
      });
    }

    if (canAccessDmca && dmcaPriorityHomeCount !== null && dmcaPriorityHomeCount > 0) {
      rows.push({
        body: "Priority DMCA states or repeat-infringer review need legal/copyright attention.",
        destination: "dmca",
        label: "DMCA priority queue",
        priorityLabel: "Legal",
        tone: "manual",
        value: String(dmcaPriorityHomeCount),
      });
    }

    if (canAccessLiveOps && liveOpsConnected && liveOpsOpenCount > 0) {
      rows.push({
        body: "Owner/operator-approved live reliability cards are waiting. Home only links to review.",
        destination: "live-ops-fix-center",
        label: "Open live ops items",
        priorityLabel: liveOpsHighestRisk === "critical" || liveOpsHighestRisk === "high" ? "High" : "Review",
        tone: liveOpsHighestRisk === "critical" || liveOpsHighestRisk === "high" ? "danger" : "manual",
        value: `${liveOpsOpenCount} open`,
      });
    }

    if (liveCostGuardNeedsReview && canAccessLiveOps) {
      rows.push({
        body: "Cost pressure is observe-only unless a backed operator action is reviewed in the guard tab.",
        destination: "live-cost-guard",
        label: "Live Cost Guard signal",
        priorityLabel: "Observe",
        tone: liveCostGuardSnapshot.activeSeverity === "critical" || liveCostGuardSnapshot.activeSeverity === "emergency"
          ? "danger"
          : "manual",
        value: formatModerationToken(liveCostGuardSnapshot.activeSeverity),
      });
    }

    if (appConfigNotConnected) {
      rows.push({
        body: "Home is using local normalized defaults until app_configurations confirms a connected read.",
        destination: "system",
        label: "App config not connected",
        priorityLabel: "Partial",
        tone: "locked",
        value: "Not Connected",
      });
    }

    if (immutableAuditNotConnected) {
      rows.push({
        body: "Recent Signals cannot show immutable audit activity until the audit table query succeeds.",
        destination: "audit",
        label: "Immutable audit missing",
        priorityLabel: "Visibility",
        tone: "locked",
        value: "Not Connected",
      });
    }

    if (reportQueueNotConnected) {
      rows.push({
        body: "Report queue access is role-gated and failed closed in this session.",
        destination: "reports",
        label: "Report queue source",
        priorityLabel: "Visibility",
        tone: "locked",
        value: "Not Connected",
      });
    }

    if (dmcaNotConnected) {
      rows.push({
        body: "DMCA case summary is unavailable; the Home tab will not show a zero count.",
        destination: "dmca",
        label: "DMCA source",
        priorityLabel: "Visibility",
        tone: "locked",
        value: "Not Connected",
      });
    }

    if (liveOpsNotConnected) {
      rows.push({
        body: "Live Ops Fix Center proxy did not return a connected incident list.",
        destination: "live-ops-fix-center",
        label: "Live Ops source",
        priorityLabel: "Visibility",
        tone: "locked",
        value: "Not Connected",
      });
    }

    if (notice?.type === "error") {
      rows.push({
        body: notice.text,
        label: "Admin error",
        priorityLabel: "Manual",
        tone: "danger",
        value: "Review",
      });
    }

    if (moderationNotice) {
      rows.push({
        body: moderationNotice,
        destination: "reports",
        label: "Moderation notice",
        priorityLabel: "Manual",
        tone: "manual",
        value: "Review",
      });
    }

    if (dmcaNotice) {
      rows.push({
        body: dmcaNotice,
        destination: "dmca",
        label: "DMCA notice",
        priorityLabel: "Manual",
        tone: "manual",
        value: "Review",
      });
    }

    if (adminOpsNotice) {
      rows.push({
        body: adminOpsNotice,
        destination: "audit",
        label: "Admin ops notice",
        priorityLabel: "Manual",
        tone: "manual",
        value: "Review",
      });
    }

    return rows;
  }, [
    adminOpsNotice,
    appConfigNotConnected,
    canAccessDmca,
    canAccessLiveOps,
    canReviewSafetyReports,
    dmcaNotConnected,
    dmcaNotice,
    dmcaPriorityHomeCount,
    immutableAuditNotConnected,
    liveCostGuardNeedsReview,
    liveCostGuardSnapshot.activeSeverity,
    liveOpsConnected,
    liveOpsHighestRisk,
    liveOpsNotConnected,
    liveOpsOpenCount,
    moderationNotice,
    notice,
    recentReportsCriticalHigh,
    recentReportsNeedsReview,
    reportQueueNotConnected,
  ]);

  const homeSystemTiles = useMemo<readonly AdminHomeSignalTile[]>(() => [
    {
      label: "Immutable Audit",
      value: adminImmutableAuditReadModel.loading
        ? "Loading"
        : adminImmutableAuditReadModel.connected
          ? "Connected"
          : "Not Connected",
      body: adminImmutableAuditReadModel.connected
        ? "Append-only audit rows are readable."
        : "Audit table read failed or is unavailable.",
      qualifier: adminImmutableAuditReadModel.connected ? "Connected" : "Not Connected",
      tone: adminImmutableAuditReadModel.loading ? "info" : adminImmutableAuditReadModel.connected ? "success" : "locked",
      destination: "audit",
    },
    {
      label: "Safety Gate",
      value: !canReviewSafetyReports
        ? "Locked"
        : safetyReportsLoading
          ? "Loading"
          : safetyReportQueueConnected
            ? "Queue Ready"
            : "Not Connected",
      body: safetyReportQueueConnected
        ? "Reports are backed by role-gated safety_reports queries."
        : "Safety review remains fail-closed when role or queue proof is missing.",
      qualifier: safetyReportQueueConnected ? "Queue Ready" : canReviewSafetyReports ? "Manual Review Required" : "Read Only",
      tone: !canReviewSafetyReports ? "locked" : safetyReportsLoading ? "info" : safetyReportQueueConnected ? "success" : "manual",
      destination: canReviewSafetyReports ? "reports" : undefined,
    },
    {
      label: "Live Cost Guard",
      value: !canAccessLiveOps
        ? "Locked"
        : liveCostGuardLoading
          ? "Loading"
          : liveCostGuardConnected
            ? liveCostGuardSettingsForm.mode === "observe_only"
              ? "Observe Only"
              : formatModerationToken(liveCostGuardSettingsForm.mode)
            : "Not Connected",
      body: liveCostGuardConnected
        ? "Metrics are not LiveKit billing truth; remediation stays reviewed in the guard tab."
        : "Cost guard settings/events are unavailable.",
      qualifier: liveCostGuardConnected ? "Observe Only" : canAccessLiveOps ? "Not Connected" : "Read Only",
      tone: !canAccessLiveOps ? "locked" : liveCostGuardLoading ? "info" : liveCostGuardNeedsReview ? "manual" : liveCostGuardConnected ? "success" : "locked",
      destination: canAccessLiveOps ? "live-cost-guard" : undefined,
    },
    {
      label: "Live Ops Fix Center",
      value: !canAccessLiveOps
        ? "Locked"
        : liveOpsLoading
          ? "Loading"
          : liveOpsConnected
            ? `${liveOpsOpenCount} open`
            : "Not Connected",
      body: "Incident cards are approval-gated drill-downs, not Home remediation controls.",
      qualifier: liveOpsConnected ? "Connected" : canAccessLiveOps ? "Not Connected" : "Read Only",
      tone: !canAccessLiveOps ? "locked" : liveOpsLoading ? "info" : liveOpsConnected && liveOpsOpenCount > 0 ? "manual" : liveOpsConnected ? "success" : "locked",
      destination: canAccessLiveOps ? "live-ops-fix-center" : undefined,
    },
    {
      label: "App Config",
      value: configLoading ? "Loading" : appConfigConnected ? "Connected" : "Not Connected",
      body: "Current config uses the existing app_configurations read path.",
      qualifier: appConfigConnected ? "Connected" : "Not Connected",
      tone: configLoading ? "info" : appConfigConnected ? "success" : "locked",
      destination: "system",
    },
    {
      label: "Premium Entitlements",
      value: formatHomeCount(adminV1ReadModel.premiumActiveCount, adminV1ReadModel.loading),
      body: "Count comes from active user_entitlements only, not subscription revenue.",
      qualifier: adminV1ReadModel.premiumActiveCount === null ? "Not Connected" : "Backed",
      tone: adminV1ReadModel.loading ? "info" : adminV1ReadModel.premiumActiveCount === null ? "locked" : "success",
      destination: "premium",
    },
    {
      label: "Active Live Rooms",
      value: formatHomeCount(adminV1ReadModel.activeLiveRoomCount, adminV1ReadModel.loading),
      body: "Fresh active watch_party_rooms live rows. This is not LiveKit server truth.",
      qualifier: adminV1ReadModel.activeLiveRoomCount === null ? "Not Connected" : "DB Estimate",
      tone: adminV1ReadModel.loading ? "info" : adminV1ReadModel.activeLiveRoomCount === null ? "locked" : "manual",
      destination: "usage",
    },
    {
      label: "Active Watch-Parties",
      value: formatHomeCount(adminV1ReadModel.activeWatchPartyCount, adminV1ReadModel.loading),
      body: "Fresh active title-room rows. This is a database estimate.",
      qualifier: adminV1ReadModel.activeWatchPartyCount === null ? "Not Connected" : "DB Estimate",
      tone: adminV1ReadModel.loading ? "info" : adminV1ReadModel.activeWatchPartyCount === null ? "locked" : "manual",
      destination: "usage",
    },
    {
      label: "Uploads Today",
      value: formatHomeCount(adminV1ReadModel.uploadsTodayCount, adminV1ReadModel.loading),
      body: "Creator video rows created today; no upload value is shown without a successful query.",
      qualifier: adminV1ReadModel.uploadsTodayCount === null ? "Not Connected" : "Backed",
      tone: adminV1ReadModel.loading ? "info" : adminV1ReadModel.uploadsTodayCount === null ? "locked" : "success",
      destination: "usage",
    },
    {
      label: "Ads Foundation",
      value: "Foundation Only",
      body: "Placeholder provider and caps exist. No real SDK, ad revenue, or rendering is live.",
      qualifier: "Foundation Only",
      tone: "locked",
      destination: "ads",
    },
  ], [
    adminImmutableAuditReadModel.connected,
    adminImmutableAuditReadModel.loading,
    adminV1ReadModel.activeLiveRoomCount,
    adminV1ReadModel.activeWatchPartyCount,
    adminV1ReadModel.loading,
    adminV1ReadModel.premiumActiveCount,
    adminV1ReadModel.uploadsTodayCount,
    appConfigConnected,
    canAccessLiveOps,
    canReviewSafetyReports,
    configLoading,
    liveCostGuardConnected,
    liveCostGuardLoading,
    liveCostGuardNeedsReview,
    liveCostGuardSettingsForm.mode,
    liveOpsConnected,
    liveOpsLoading,
    liveOpsOpenCount,
    safetyReportQueueConnected,
    safetyReportsLoading,
  ]);

  const homeBoundaryItems = useMemo<readonly AdminHomeBoundaryItem[]>(() => [
    {
      body: canManagePrivilegedWrites
        ? "Channel owners manage channel-level systems; platform operators review platform-wide safety, legal, audit, and ops queues here."
        : "Channel ownership alone never opens this private operator surface.",
      label: "Owner / Operator Split",
      proofLabel: canManagePrivilegedWrites ? "Backed Role" : "Scope Limited",
      tone: canManagePrivilegedWrites ? "success" : "locked",
    },
    {
      body: "This route does not grant authority from profile ownership, channel ownership, Rachi identity, or local helper status.",
      label: "Authority Boundary",
      proofLabel: "Backend Role",
      tone: "info",
    },
    {
      body: canAccessLiveOps
        ? "Live recovery posture is queue-first and approval-gated. Home links to review; it does not execute remediation."
        : "Live recovery controls are hidden unless Owner or live_ops permission is backed.",
      label: "Recovery Posture",
      proofLabel: canAccessLiveOps ? "Queue Ready" : "Operator Only",
      tone: canAccessLiveOps ? "manual" : "locked",
    },
    {
      body: "Rachi is the official platform presence and can be managed where backed, but it never grants platform roles or moderation power.",
      label: "Rachi Boundary",
      proofLabel: "Critical Presence",
      tone: "info",
    },
  ], [canAccessLiveOps, canManagePrivilegedWrites]);

  const homeRecentActivity = useMemo<readonly AdminHomeActivityItem[]>(() => {
    if (!adminImmutableAuditReadModel.connected) return [];
    return adminImmutableAuditReadModel.latestRows.slice(0, 5).map((entry) => ({
      id: entry.id,
      meta: `${entry.createdAt ? formatModerationTimestamp(entry.createdAt) : "Time unknown"} · ${formatImmutableAuditActor(entry)}`,
      target: formatImmutableAuditTarget(entry),
      title: `${formatModerationToken(entry.actionCategory)} · ${formatModerationToken(entry.action)}`,
      tone: entry.severity === "critical" || entry.severity === "high" ? "danger" : entry.foundationProof ? "locked" : "info",
    }));
  }, [adminImmutableAuditReadModel.connected, adminImmutableAuditReadModel.latestRows]);

  const homeQuickActions = useMemo<readonly AdminHomeQuickAction[]>(() => {
    const isVisible = (destination: OperatorTabKey) => visibleOperatorTabs.some((tab) => tab.key === destination);
    const actions: AdminHomeQuickAction[] = [
      {
        body: "Review backed safety queue.",
        destination: "reports",
        label: "Open Reports",
        tone: "manual" as AdminHomeTone,
      },
      {
        body: "Review copyright cases.",
        destination: "dmca",
        label: "Open DMCA",
        tone: "manual" as AdminHomeTone,
      },
      {
        body: "Inspect immutable rows.",
        destination: "audit",
        label: "Open Audit",
        tone: "info" as AdminHomeTone,
      },
      {
        body: "Review live incident cards.",
        destination: "live-ops-fix-center",
        label: "Open Live Ops",
        tone: "manual" as AdminHomeTone,
      },
      {
        body: "Check owner security state.",
        destination: "owner-security",
        label: "Open Owner Security",
        tone: "info" as AdminHomeTone,
      },
      {
        body: "Inspect runtime setup.",
        destination: "system",
        label: "Open System",
        tone: "info" as AdminHomeTone,
      },
    ];
    return actions.filter((action) => isVisible(action.destination));
  }, [visibleOperatorTabs]);

  const systemStatusCards = useMemo<readonly AdminDashboardCard[]>(() => {
    const hasRevenueCatPublicKey = !!(
      runtimeConfig.revenueCat.androidPublicSdkKey
      || runtimeConfig.revenueCat.androidDebugPublicSdkKey
      || runtimeConfig.revenueCat.iosPublicSdkKey
    );
    const hasLegalUrls = !!(
      runtimeConfig.legal.privacyPolicyUrl
      && runtimeConfig.legal.termsOfServiceUrl
      && runtimeConfig.legal.accountDeletionUrl
      && runtimeConfig.legal.copyrightReportUrl
    );

    return [
      {
        label: "App Config",
        value: configLoading ? "Loading" : appConfigConnected ? "Connected" : "Not connected yet",
        body: "Existing app_configurations read path only. This is not a server health check.",
        tone: appConfigConnected ? "default" : "unavailable",
      },
      {
        label: "Runtime Config",
        value: runtimeConfigIssues.length ? "Needs setup" : "Ready",
        body: runtimeConfigIssues.length
          ? "Base public runtime config has missing values."
          : "Base public runtime config values are present without exposing secrets.",
        tone: runtimeConfigIssues.length ? "unavailable" : "default",
      },
      {
        label: "Feature Flags",
        value: "Foundation only",
        body: "Static app flags and client Remote Config defaults are readable; Admin write controls are not connected yet.",
        tone: "unavailable",
      },
      {
        label: "Supabase Setup",
        value: runtimeConfig.supabaseUrl && runtimeConfig.supabaseAnonKey ? "Ready" : "Not connected yet",
        body: "Presence check only. No Supabase remote state was touched.",
        tone: runtimeConfig.supabaseUrl && runtimeConfig.supabaseAnonKey ? "default" : "unavailable",
      },
      {
        label: "Immutable Audit",
        value: adminImmutableAuditReadModel.loading
          ? "Loading"
          : adminImmutableAuditReadModel.connected
            ? "Connected"
            : "Not connected yet",
        body: adminImmutableAuditReadModel.connected
          ? "Read-only append-only audit log foundation is readable from Admin."
          : "Immutable admin audit logs are not connected yet.",
        tone: adminImmutableAuditReadModel.connected ? "default" : "unavailable",
      },
      {
        label: "RevenueCat Public Setup",
        value: hasRevenueCatPublicKey ? "Ready" : "Not connected yet",
        body: "Public SDK-key presence only. RevenueCat dashboard/setup is not changed here.",
        tone: hasRevenueCatPublicKey ? "default" : "unavailable",
      },
      {
        label: "LiveKit URL Setup",
        value: liveKitConfigured ? "Ready" : "Not connected yet",
        body: "URL/token-endpoint presence only. This is not a LiveKit server status ping.",
        tone: liveKitConfigured ? "default" : "unavailable",
      },
      {
        label: "Legal URLs",
        value: hasLegalUrls ? "Ready" : "Not connected yet",
        body: "Privacy, Terms, and account-deletion URL presence only.",
        tone: hasLegalUrls ? "default" : "unavailable",
      },
      {
        label: "Readiness Docs",
        value: "Ready",
        body: "PUBLIC_V1_READINESS_CHECKLIST and EXTERNAL_SETUP_PUBLIC_V1_CHECKLIST exist for manual proof lanes.",
      },
    ];
  }, [
    adminImmutableAuditReadModel.connected,
    adminImmutableAuditReadModel.loading,
    appConfigConnected,
    configLoading,
    liveKitConfigured,
    runtimeConfig,
    runtimeConfigIssues.length,
  ]);

  const rachiManagementCards = useMemo<readonly AdminDashboardCard[]>(() => [
    {
      label: "Official Account",
      value: RACHI_OFFICIAL_ACCOUNT.displayName,
      body: `${RACHI_OFFICIAL_ACCOUNT.handle} carries the ${RACHI_OFFICIAL_ACCOUNT.officialBadgeLabel} marker and platform-owned identity.`,
    },
    {
      label: "Profile Status",
      value: "Canonical",
      body: `Public profile uses /profile/${RACHI_OFFICIAL_ACCOUNT.userId} with protected official-account semantics.`,
    },
    {
      label: "Chat Starter",
      value: "Backed",
      body: "Chi'lly Chat exposes Rachi as the official starter presence on canonical inbox and thread paths.",
    },
    {
      label: "Support / Onboarding",
      value: "Bounded",
      body: "Rachi may appear as the official concierge where backed; editable support automation is not faked here.",
    },
  ], []);

  const staffAndAuditCards = useMemo<readonly AdminDashboardCard[]>(() => {
    const canViewAudit = canManagePrivilegedWrites || canReviewSafetyReports;
    const roleSummary = platformRoleRosterSummary;
    const auditSummary = adminAuditLogSummary;

    return [
      {
        label: "Staff & Roles",
        value: canViewStaffRoles
          ? roleSummary
            ? `${roleSummary.activeCount} active`
            : platformRoleRosterLoading
              ? "Loading"
              : "No records"
          : "Locked",
        body: canViewStaffRoles
          ? roleSummary
            ? `${roleSummary.ownerCount} owner · ${roleSummary.operatorCount} admin · ${roleSummary.moderatorCount} moderator records are currently visible.`
            : "Current staff visibility is bounded to role-record truth already stored in platform memberships."
          : "Staff-role visibility stays behind active Owner or scoped staff-management permission truth.",
        tone: canViewStaffRoles ? "default" : "unavailable",
      },
      {
        label: "Audit Visibility",
        value: canViewAudit
          ? auditSummary
            ? `${auditSummary.totalItems} recent`
            : adminAuditLogLoading
              ? "Loading"
              : "No records"
          : "Locked",
        body: canViewAudit
          ? auditSummary
            ? `${auditSummary.roleRecordCount} role record${auditSummary.roleRecordCount === 1 ? "" : "s"} · ${auditSummary.safetyReportCount} safety item${auditSummary.safetyReportCount === 1 ? "" : "s"} in the current bounded audit slice.`
            : "Current audit visibility is limited to role records and safety-report context already backed in repo truth."
          : "Audit visibility stays unavailable until this signed-in identity has active owner/operator or review-capable admin truth.",
        tone: canViewAudit ? "default" : "unavailable",
      },
    ];
  }, [
    adminAuditLogLoading,
    adminAuditLogSummary,
    canManagePrivilegedWrites,
    canReviewSafetyReports,
    canViewStaffRoles,
    platformRoleRosterLoading,
    platformRoleRosterSummary,
  ]);

  const editorPublicationPreview = useMemo(() => {
    const rawReleaseInput = form.release_at.trim();
    const parsedReleaseAt = hasReleaseControl ? fromDatetimeLocalValue(form.release_at) : null;
    const publicationState = normalizePublicationState({
      status: hasStatusControl ? normalizeStatus(form.status, form.status === "published") : "draft",
      releaseAt: parsedReleaseAt,
      hasStatusControl,
      hasReleaseControl,
    });

    return {
      ...publicationState,
      hasTypedReleaseInput: rawReleaseInput.length > 0,
      hasUsableReleaseInput: parsedReleaseAt !== null,
    };
  }, [form.release_at, form.status, hasReleaseControl, hasStatusControl]);

  useEffect(() => {
    if (!canAccessAdmin) return;
    if (loading) {
      reportDebugQuery({ name: "admin.titles", status: "loading", error: null });
      return;
    }
    if (notice?.type === "error") {
      reportDebugQuery({ name: "admin.titles", status: "error", error: notice.text });
      return;
    }
    reportDebugQuery({ name: "admin.titles", status: "success", error: null });
  }, [canAccessAdmin, loading, notice]);

  useEffect(() => {
    if (!canAccessAdmin) return;
    reportDebugError(notice?.type === "error" ? notice.text : null);
  }, [canAccessAdmin, notice]);

  const probeColumn = useCallback(async (column: string) => {
    const { error } = await supabase.from("titles").select(column).limit(1);
    return !error;
  }, []);

  const detectCapabilities = useCallback(async (): Promise<AdminCapabilities> => {
    const [
      hasIsHero,
      hasHero,
      hasIsTrending,
      hasTrending,
      hasPinTop,
      hasTopRow,
      hasReleaseAt,
      hasReleaseDate,
      hasStatus,
      hasThumb,
      hasPreview,
      hasContentAccess,
      hasAdsEnabled,
      hasSponsorPlacement,
      hasSponsorLabel,
    ] = await Promise.all([
      probeColumn("is_hero"),
      probeColumn("hero"),
      probeColumn("is_trending"),
      probeColumn("trending"),
      probeColumn("pin_to_top_row"),
      probeColumn("top_row"),
      probeColumn("release_at"),
      probeColumn("release_date"),
      probeColumn("status"),
      probeColumn("thumbnail_url"),
      probeColumn("preview_video_url"),
      probeColumn("content_access_rule"),
      probeColumn("ads_enabled"),
      probeColumn("sponsor_placement"),
      probeColumn("sponsor_label"),
    ]);

    return {
      heroCol: hasIsHero ? "is_hero" : hasHero ? "hero" : null,
      trendingCol: hasIsTrending ? "is_trending" : hasTrending ? "trending" : null,
      topRowCol: hasPinTop ? "pin_to_top_row" : hasTopRow ? "top_row" : null,
      releaseCol: hasReleaseAt ? "release_at" : hasReleaseDate ? "release_date" : null,
      statusCol: hasStatus ? "status" : null,
      thumbnailCol: hasThumb ? "thumbnail_url" : null,
      previewCol: hasPreview ? "preview_video_url" : null,
      contentAccessCol: hasContentAccess ? "content_access_rule" : null,
      adsEnabledCol: hasAdsEnabled ? "ads_enabled" : null,
      sponsorPlacementCol: hasSponsorPlacement ? "sponsor_placement" : null,
      sponsorLabelCol: hasSponsorLabel ? "sponsor_label" : null,
    };
  }, [probeColumn]);

  const loadExperienceConfig = useCallback(async () => {
    try {
      setConfigLoading(true);
      setAppConfigConnected(false);
      setAppConfigSource(null);
      const adminConfig = await readAdminContentConfigRpc();
      const config = normalizeAppConfig(adminConfig?.config ?? DEFAULT_APP_CONFIG);
      setExperienceConfig(config);
      setSavedExperienceConfig(config);
      setAppConfigConnected(adminConfig?.connected === true);
      setAppConfigSource(adminConfig?.source ?? "app_configurations");
      setAppConfigSavedAt(adminConfig?.updatedAt ?? null);
      setContentLastRefreshedAt(new Date().toISOString());
    } catch (err: any) {
      setExperienceConfig(DEFAULT_APP_CONFIG);
      setSavedExperienceConfig(DEFAULT_APP_CONFIG);
      setAppConfigConnected(false);
      setAppConfigSource(null);
      setAppConfigSavedAt(null);
      setNotice({ type: "error", text: formatAdminOperationFailure(err, "Failed to load experience config.") });
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const loadContentAuditEvents = useCallback(async () => {
    try {
      setContentAuditLoading(true);
      const rows = await listAdminContentAuditEventsRpc(10);
      setContentAuditRows(rows);
      setContentAuditConnected(true);
    } catch {
      setContentAuditRows([]);
      setContentAuditConnected(false);
    } finally {
      setContentAuditLoading(false);
    }
  }, []);

  const loadPlatformRoles = useCallback(async () => {
    try {
      setPlatformRolesLoading(true);
      setPlatformRolesChecked(false);
      setModerationNotice(null);
      const memberships = await readMyPlatformRoleMemberships();
      setPlatformRoles(memberships);
    } catch {
      setPlatformRoles([]);
      setModerationNotice("Unable to verify platform moderation roles.");
    } finally {
      setPlatformRolesLoading(false);
      setPlatformRolesChecked(true);
    }
  }, []);

  const loadSafetyReports = useCallback(async () => {
    try {
      setSafetyReportsLoading(true);
      setModerationNotice(null);
      const queue = await readSafetyReportQueue({ filter: "all", limit: 25 });
      setSafetyReports(queue.items);
      setSafetyReportQueueSummary(queue.summary);
      setSafetyReportsLastLoadedAt(queue.generatedAt);
    } catch (err: any) {
      setSafetyReports([]);
      setSafetyReportQueueSummary(null);
      setSafetyReportsLastLoadedAt(null);
      setSelectedReportAuditRows([]);
      setModerationNotice(formatAdminOperationFailure(err, "Failed to load the safety review queue."));
    } finally {
      setSafetyReportsLoading(false);
    }
  }, []);

  const resetCounterNoticeForm = useCallback(() => {
    setCounterSubmitterName("");
    setCounterSubmitterEmail("");
    setCounterSubmitterPhone("");
    setCounterSubmitterAddress("");
    setCounterRemovedDescription("");
    setCounterRemovedLocation("");
    setCounterGoodFaith(false);
    setCounterJurisdiction(false);
    setCounterService(false);
    setCounterSignature("");
    setCounterForwardedNow(false);
  }, []);

  const updateDmcaIntakeForm = useCallback(<Key extends keyof DmcaNoticeFormState,>(
    key: Key,
    value: DmcaNoticeFormState[Key],
  ) => {
    setDmcaIntakeForm((current) => ({ ...current, [key]: value }));
  }, []);

  const openDmcaIntake = useCallback(() => {
    if (!canAccessDmca) {
      setDmcaNotice("Formal notice intake requires Owner or scoped Admin/Operator copyright access.");
      return;
    }
    setDmcaIntakeVisible(true);
  }, [canAccessDmca]);

  const openPublicDmcaForm = useCallback(async () => {
    const publicUrl = runtimeConfig.legal.copyrightReportUrl;
    if (!publicUrl) {
      router.push("/copyright-report");
      return;
    }

    try {
      const supported = await Linking.canOpenURL(publicUrl);
      if (!supported) {
        setDmcaNotice(`Public DMCA form setup required: cannot open configured URL ${publicUrl}.`);
        return;
      }
      await Linking.openURL(publicUrl);
    } catch {
      setDmcaNotice(`Public DMCA form setup required: cannot open configured URL ${publicUrl}.`);
    }
  }, [router, runtimeConfig.legal.copyrightReportUrl]);

  const applyDmcaDetailDefaults = useCallback((detail: DmcaCaseDetail) => {
    setDmcaContentType(detail.case.contentType);
    setDmcaContentId(detail.case.contentId ?? "");
    setDmcaStrikeUserId(detail.case.uploaderUserId ?? "");
    setDmcaAdminNotes(detail.case.adminNotes ?? "");
    setCounterRemovedLocation(detail.case.contentUrl ?? detail.case.contentId ?? "");
  }, []);

  const loadDmcaCases = useCallback(async () => {
    if (!canAccessDmca) {
      setDmcaCases([]);
      setDmcaCasesLoading(false);
      setDmcaCaseSummary(null);
      return;
    }

    try {
      setDmcaCasesLoading(true);
      setDmcaNotice(null);
      const [cases, summary] = await Promise.all([
        readAdminDmcaCases({ limit: 50, search: dmcaSearchQuery, status: dmcaStatusFilter }),
        readAdminDmcaCaseSummary(),
      ]);
      setDmcaCases(cases);
      setDmcaCaseSummary(summary);
    } catch (err: any) {
      setDmcaCases([]);
      setDmcaCaseSummary(null);
      setDmcaNotice(formatDmcaOperationFailure(err, "Failed to load DMCA cases."));
    } finally {
      setDmcaCasesLoading(false);
    }
  }, [canAccessDmca, dmcaSearchQuery, dmcaStatusFilter]);

  const loadDmcaCaseDetail = useCallback(async (caseId: string) => {
    if (!canAccessDmca) {
      setDmcaNotice("DMCA case details require Owner or scoped Admin/Operator copyright access.");
      return;
    }

    try {
      setDmcaActionBusy(`detail-${caseId}`);
      setDmcaNotice(null);
      setDmcaSelectedCaseId(caseId);
      const detail = await readAdminDmcaCaseDetail(caseId);
      setDmcaCaseDetail(detail);
      setDmcaDetailVisible(true);
      applyDmcaDetailDefaults(detail);
    } catch (err: any) {
      setDmcaCaseDetail(null);
      setDmcaDetailVisible(false);
      setDmcaNotice(formatDmcaOperationFailure(err, "Failed to load DMCA case detail."));
    } finally {
      setDmcaActionBusy(null);
    }
  }, [applyDmcaDetailDefaults, canAccessDmca]);

  const submitAdminDmcaIntake = useCallback(async () => {
    if (dmcaIntakeBusy) return;
    const workUrls = dmcaIntakeForm.copyrightedWorkUrls
      .split(/\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    try {
      setDmcaIntakeBusy(true);
      setDmcaNotice(null);
      const created = await adminDmcaCreateCase({
        reporterName: dmcaIntakeForm.reporterName,
        reporterCompany: dmcaIntakeForm.reporterCompany,
        reporterEmail: dmcaIntakeForm.reporterEmail,
        reporterPhone: dmcaIntakeForm.reporterPhone,
        reporterAddress: dmcaIntakeForm.reporterAddress,
        reporterIsOwner: dmcaIntakeForm.reporterIsOwner,
        authorizedAgentName: dmcaIntakeForm.authorizedAgentName,
        copyrightOwnerName: dmcaIntakeForm.copyrightOwnerName,
        copyrightedWorkDescription: dmcaIntakeForm.copyrightedWorkDescription,
        copyrightedWorkUrls: workUrls,
        infringingMaterialDescription: dmcaIntakeForm.infringingMaterialDescription,
        contentType: dmcaIntakeForm.contentType,
        contentId: dmcaIntakeForm.contentId,
        contentUrl: dmcaIntakeForm.contentUrl,
        source: dmcaIntakeForm.source,
        goodFaithStatement: dmcaIntakeForm.goodFaithStatement,
        accuracyPenaltyPerjuryStatement: dmcaIntakeForm.authorityStatement,
        electronicSignature: dmcaIntakeForm.electronicSignature,
      });
      setDmcaNotice(`Formal notice intake recorded: ${created.caseNumber}.`);
      setDmcaIntakeForm(createDmcaNoticeFormState());
      setDmcaIntakeVisible(false);
      await loadDmcaCases();
      await loadDmcaCaseDetail(created.id);
    } catch (err: any) {
      setDmcaNotice(formatDmcaOperationFailure(err, "Failed to record formal DMCA notice intake."));
    } finally {
      setDmcaIntakeBusy(false);
    }
  }, [dmcaIntakeBusy, dmcaIntakeForm, loadDmcaCaseDetail, loadDmcaCases]);

  useEffect(() => {
    if (!canAccessAdmin || !canAccessDmca) {
      setDmcaCases([]);
      setDmcaCasesLoading(false);
      setDmcaCaseSummary(null);
      setDmcaCaseDetail(null);
      setDmcaDetailVisible(false);
      setDmcaSelectedCaseId(null);
      setDmcaNotice(null);
      setDmcaActionBusy(null);
      return;
    }
    void loadDmcaCases();
  }, [canAccessAdmin, canAccessDmca, loadDmcaCases]);

  const refreshDmcaAfterAction = useCallback(async (caseId: string) => {
    await loadDmcaCases();
    await loadDmcaCaseDetail(caseId);
  }, [loadDmcaCaseDetail, loadDmcaCases]);

  const runDmcaStatusUpdate = useCallback(async (status: DmcaCaseStatus) => {
    const selectedCaseId = dmcaCaseDetail?.case.id ?? dmcaSelectedCaseId;
    if (!selectedCaseId || dmcaActionBusy) return;
    if (!canAccessDmca) {
      setDmcaNotice("DMCA admin actions require Owner or scoped Admin/Operator copyright access.");
      return;
    }

    const reason = dmcaActionReason.trim() || `Marked ${formatModerationToken(status).toLowerCase()} by admin.`;
    try {
      setDmcaActionBusy(`status-${status}`);
      setDmcaNotice(null);
      await adminDmcaSetCaseStatus({
        caseId: selectedCaseId,
        status,
        reason,
        adminNotes: dmcaAdminNotes.trim() || undefined,
      });
      setDmcaNotice(`DMCA case marked ${formatModerationToken(status).toLowerCase()}.`);
      await refreshDmcaAfterAction(selectedCaseId);
    } catch (err: any) {
      setDmcaNotice(formatDmcaOperationFailure(err, "Failed to update DMCA case status."));
    } finally {
      setDmcaActionBusy(null);
    }
  }, [
    canAccessDmca,
    dmcaActionBusy,
    dmcaActionReason,
    dmcaAdminNotes,
    dmcaCaseDetail?.case.id,
    dmcaSelectedCaseId,
    refreshDmcaAfterAction,
  ]);

  const runDmcaContentAction = useCallback(async () => {
    const selectedCaseId = dmcaCaseDetail?.case.id ?? dmcaSelectedCaseId;
    const contentId = dmcaContentId.trim();
    const reason = dmcaActionReason.trim();
    if (!selectedCaseId || dmcaActionBusy) return;
    if (!canAccessDmca) {
      setDmcaNotice("DMCA admin actions require Owner or scoped Admin/Operator copyright access.");
      return;
    }
    if (!contentId) {
      setDmcaNotice("Enter a content id before recording a DMCA content action.");
      return;
    }
    if (!reason) {
      setDmcaNotice("Add an action reason before recording a DMCA content action.");
      return;
    }
    if (
      ["disabled", "hidden", "restored"].includes(dmcaContentAction)
      && !dmcaSupportedStateContentTypes.has(dmcaContentType)
    ) {
      setDmcaNotice(`Missing backend piece: ${formatModerationToken(dmcaContentType)} does not have a safe DMCA disable/restore route yet.`);
      return;
    }

    try {
      setDmcaActionBusy(`content-${dmcaContentAction}`);
      setDmcaNotice(null);
      await adminDmcaRecordContentAction({
        caseId: selectedCaseId,
        contentType: dmcaContentType,
        contentId,
        action: dmcaContentAction,
        reason,
      });
      setDmcaNotice(`DMCA content action recorded: ${formatModerationToken(dmcaContentAction)}.`);
      await refreshDmcaAfterAction(selectedCaseId);
    } catch (err: any) {
      setDmcaNotice(formatDmcaOperationFailure(err, "Failed to record DMCA content action."));
    } finally {
      setDmcaActionBusy(null);
    }
  }, [
    canAccessDmca,
    dmcaActionBusy,
    dmcaActionReason,
    dmcaCaseDetail?.case.id,
    dmcaContentAction,
    dmcaContentId,
    dmcaContentType,
    dmcaSelectedCaseId,
    refreshDmcaAfterAction,
  ]);

  const runDmcaAddStrike = useCallback(async () => {
    const selectedCaseId = dmcaCaseDetail?.case.id ?? dmcaSelectedCaseId;
    const userId = dmcaStrikeUserId.trim();
    const contentId = dmcaContentId.trim();
    const reason = dmcaActionReason.trim();
    if (!selectedCaseId || dmcaActionBusy) return;
    if (!canAccessDmca) {
      setDmcaNotice("DMCA strike actions require Owner or scoped Admin/Operator copyright access.");
      return;
    }
    if (!userId || !contentId || !reason) {
      setDmcaNotice("Add user id, content id, and reason before adding a copyright strike.");
      return;
    }
    if (dmcaCaseDetail?.case.status && ![
      "content_disabled",
      "uploader_notified",
      "counter_notice_received",
      "waiting_rightsholder_response",
      "eligible_for_restore",
      "restored",
      "repeat_infringer_review",
      "preserved_evidence",
      "closed",
    ].includes(dmcaCaseDetail.case.status)) {
      setDmcaNotice("Strike disabled: only valid completed takedowns or preserved-evidence cases can receive active strikes.");
      return;
    }

    try {
      setDmcaActionBusy("strike-add");
      setDmcaNotice(null);
      await adminDmcaAddStrike({
        caseId: selectedCaseId,
        userId,
        channelId: dmcaCaseDetail?.case.uploaderChannelId ?? null,
        contentType: dmcaContentType,
        contentId,
        severity: dmcaStrikeSeverity,
        reason,
      });
      setDmcaNotice("Copyright strike added. Repeat-infringer review opens at threshold or severe severity.");
      await refreshDmcaAfterAction(selectedCaseId);
    } catch (err: any) {
      setDmcaNotice(formatDmcaOperationFailure(err, "Failed to add copyright strike."));
    } finally {
      setDmcaActionBusy(null);
    }
  }, [
    canAccessDmca,
    dmcaActionBusy,
    dmcaActionReason,
    dmcaCaseDetail?.case.id,
    dmcaCaseDetail?.case.status,
    dmcaCaseDetail?.case.uploaderChannelId,
    dmcaContentId,
    dmcaContentType,
    dmcaSelectedCaseId,
    dmcaStrikeSeverity,
    dmcaStrikeUserId,
    refreshDmcaAfterAction,
  ]);

  const runDmcaUpdateStrike = useCallback(async (strikeId: string, status: "removed" | "disputed" | "resolved") => {
    const selectedCaseId = dmcaCaseDetail?.case.id ?? dmcaSelectedCaseId;
    const reason = dmcaActionReason.trim();
    if (!selectedCaseId || dmcaActionBusy) return;
    if (!canAccessDmca) {
      setDmcaNotice("DMCA strike actions require Owner or scoped Admin/Operator copyright access.");
      return;
    }
    if (!reason) {
      setDmcaNotice("Add a reason before updating a copyright strike.");
      return;
    }

    try {
      setDmcaActionBusy(`strike-${status}-${strikeId}`);
      setDmcaNotice(null);
      await adminDmcaUpdateStrikeStatus({ strikeId, status, reason });
      setDmcaNotice(`Copyright strike marked ${formatModerationToken(status).toLowerCase()}.`);
      await refreshDmcaAfterAction(selectedCaseId);
    } catch (err: any) {
      setDmcaNotice(formatDmcaOperationFailure(err, "Failed to update copyright strike."));
    } finally {
      setDmcaActionBusy(null);
    }
  }, [
    canAccessDmca,
    dmcaActionBusy,
    dmcaActionReason,
    dmcaCaseDetail?.case.id,
    dmcaSelectedCaseId,
    refreshDmcaAfterAction,
  ]);

  const runDmcaRecordCounterNotice = useCallback(async () => {
    const selectedCaseId = dmcaCaseDetail?.case.id ?? dmcaSelectedCaseId;
    if (!selectedCaseId || dmcaActionBusy) return;
    if (!canAccessDmca) {
      setDmcaNotice("Counter-notice recording requires Owner or scoped Admin/Operator copyright access.");
      return;
    }
    if (!counterSubmitterName.trim() || !counterSubmitterEmail.trim() || !counterRemovedDescription.trim() || !counterRemovedLocation.trim() || !counterSignature.trim()) {
      setDmcaNotice("Counter-notice needs submitter, email, removed material, location, and signature.");
      return;
    }
    if (!counterGoodFaith || !counterJurisdiction || !counterService) {
      setDmcaNotice("Confirm all counter-notice statements before recording.");
      return;
    }

    try {
      setDmcaActionBusy("counter-record");
      setDmcaNotice(null);
      await adminDmcaRecordCounterNotice({
        caseId: selectedCaseId,
        submitterUserId: dmcaCaseDetail?.case.uploaderUserId ?? undefined,
        submitterName: counterSubmitterName,
        submitterEmail: counterSubmitterEmail,
        submitterPhone: counterSubmitterPhone,
        submitterAddress: counterSubmitterAddress,
        removedMaterialDescription: counterRemovedDescription,
        removedMaterialUrlOrLocation: counterRemovedLocation,
        goodFaithMistakeStatement: counterGoodFaith,
        jurisdictionConsentStatement: counterJurisdiction,
        serviceAcceptanceStatement: counterService,
        electronicSignature: counterSignature,
        forwardedToClaimant: counterForwardedNow,
      });
      setDmcaNotice(counterForwardedNow
        ? "Counter-notice recorded and claimant forwarding window started."
        : "Counter-notice recorded. Forwarding is still manual/pending.");
      resetCounterNoticeForm();
      await refreshDmcaAfterAction(selectedCaseId);
    } catch (err: any) {
      setDmcaNotice(formatDmcaOperationFailure(err, "Failed to record counter-notice."));
    } finally {
      setDmcaActionBusy(null);
    }
  }, [
    canAccessDmca,
    counterForwardedNow,
    counterGoodFaith,
    counterJurisdiction,
    counterRemovedDescription,
    counterRemovedLocation,
    counterService,
    counterSignature,
    counterSubmitterAddress,
    counterSubmitterEmail,
    counterSubmitterName,
    counterSubmitterPhone,
    dmcaActionBusy,
    dmcaCaseDetail?.case.id,
    dmcaCaseDetail?.case.uploaderUserId,
    dmcaSelectedCaseId,
    refreshDmcaAfterAction,
    resetCounterNoticeForm,
  ]);

  const runDmcaForwardCounterNotice = useCallback(async (counterNoticeId: string) => {
    const selectedCaseId = dmcaCaseDetail?.case.id ?? dmcaSelectedCaseId;
    const reason = dmcaActionReason.trim() || "Counter-notice forwarding to claimant recorded.";
    if (!selectedCaseId || dmcaActionBusy) return;
    if (!canAccessDmca) {
      setDmcaNotice("Counter-notice actions require Owner or scoped Admin/Operator copyright access.");
      return;
    }
    try {
      setDmcaActionBusy(`counter-forward-${counterNoticeId}`);
      setDmcaNotice(null);
      await adminDmcaForwardCounterNotice({ counterNoticeId, reason });
      setDmcaNotice("Counter-notice forwarding recorded. The 10-14 business-day window is stored.");
      await refreshDmcaAfterAction(selectedCaseId);
    } catch (err: any) {
      setDmcaNotice(formatDmcaOperationFailure(err, "Failed to forward counter-notice record."));
    } finally {
      setDmcaActionBusy(null);
    }
  }, [
    canAccessDmca,
    dmcaActionBusy,
    dmcaActionReason,
    dmcaCaseDetail?.case.id,
    dmcaSelectedCaseId,
    refreshDmcaAfterAction,
  ]);

  const runDmcaRecordCourtAction = useCallback(async (counterNoticeId: string) => {
    const selectedCaseId = dmcaCaseDetail?.case.id ?? dmcaSelectedCaseId;
    const reason = dmcaActionReason.trim() || "Court action notice received from claimant.";
    if (!selectedCaseId || dmcaActionBusy) return;
    if (!canAccessDmca) {
      setDmcaNotice("Counter-notice actions require Owner or scoped Admin/Operator copyright access.");
      return;
    }
    try {
      setDmcaActionBusy(`court-${counterNoticeId}`);
      setDmcaNotice(null);
      await adminDmcaRecordCourtAction({ counterNoticeId, reason });
      setDmcaNotice("Court action notice recorded. Restore is blocked for this counter-notice.");
      await refreshDmcaAfterAction(selectedCaseId);
    } catch (err: any) {
      setDmcaNotice(formatDmcaOperationFailure(err, "Failed to record court action notice."));
    } finally {
      setDmcaActionBusy(null);
    }
  }, [
    canAccessDmca,
    dmcaActionBusy,
    dmcaActionReason,
    dmcaCaseDetail?.case.id,
    dmcaSelectedCaseId,
    refreshDmcaAfterAction,
  ]);

  const runDmcaMarkRestoreEligible = useCallback(async (counterNoticeId: string) => {
    const selectedCaseId = dmcaCaseDetail?.case.id ?? dmcaSelectedCaseId;
    const reason = dmcaActionReason.trim() || "No court action notice recorded within the review window.";
    if (!selectedCaseId || dmcaActionBusy) return;
    if (!canAccessDmca) {
      setDmcaNotice("Counter-notice actions require Owner or scoped Admin/Operator copyright access.");
      return;
    }
    try {
      setDmcaActionBusy(`restore-eligible-${counterNoticeId}`);
      setDmcaNotice(null);
      await adminDmcaMarkRestoreEligible({ caseId: selectedCaseId, counterNoticeId, reason });
      setDmcaNotice("DMCA case marked eligible for restore. Admin must still restore content explicitly.");
      await refreshDmcaAfterAction(selectedCaseId);
    } catch (err: any) {
      setDmcaNotice(formatDmcaOperationFailure(err, "Failed to mark restore eligibility."));
    } finally {
      setDmcaActionBusy(null);
    }
  }, [
    canAccessDmca,
    dmcaActionBusy,
    dmcaActionReason,
    dmcaCaseDetail?.case.id,
    dmcaSelectedCaseId,
    refreshDmcaAfterAction,
  ]);

  const selectedDmcaDetail = dmcaCaseDetail;
  const selectedDmcaCase = selectedDmcaDetail?.case ?? null;
  const dmcaCompleteness = useMemo(
    () => selectedDmcaCase ? getDmcaNoticeCompleteness(selectedDmcaCase) : null,
    [selectedDmcaCase],
  );
  const dmcaOpenCount = dmcaCaseSummary?.open ?? 0;
  const dmcaPriorityCount = dmcaCaseSummary?.priority ?? 0;
  const dmcaRepeatReviewCount = dmcaCaseSummary?.repeatInfringerReview ?? 0;
  const dmcaContentActionDisabledReason = useMemo(() => {
    if (!selectedDmcaCase) return "Open a case before recording content actions.";
    if (!dmcaContentId.trim()) return "Content id is required.";
    if (!dmcaActionReason.trim()) return "Action reason is required.";
    if (
      ["disabled", "hidden", "restored"].includes(dmcaContentAction)
      && !dmcaSupportedStateContentTypes.has(dmcaContentType)
    ) {
      return `Missing backend piece: safe DMCA disable/restore route for ${formatModerationToken(dmcaContentType)}.`;
    }
    return null;
  }, [dmcaActionReason, dmcaContentAction, dmcaContentId, dmcaContentType, selectedDmcaCase]);
  const dmcaCounterDisabledReason = useMemo(() => {
    if (!selectedDmcaCase) return "Open a case before recording a counter-notice.";
    if (!counterSubmitterName.trim() || !counterSubmitterEmail.trim()) return "Submitter name and email are required.";
    if (!counterRemovedDescription.trim() || !counterRemovedLocation.trim()) return "Removed material description and location are required.";
    if (!counterSignature.trim()) return "Electronic signature is required.";
    if (!counterGoodFaith || !counterJurisdiction || !counterService) return "All counter-notice statements must be confirmed.";
    return null;
  }, [
    counterGoodFaith,
    counterJurisdiction,
    counterRemovedDescription,
    counterRemovedLocation,
    counterService,
    counterSignature,
    counterSubmitterEmail,
    counterSubmitterName,
    selectedDmcaCase,
  ]);
  const dmcaIntakeDisabledReason = useMemo(() => {
    const form = dmcaIntakeForm;
    if (!form.reporterName.trim()) return "Claimant/reporter name is required.";
    if (!form.reporterEmail.trim()) return "Claimant/reporter email is required.";
    if (!form.copyrightOwnerName.trim()) return "Copyright owner name is required.";
    if (!form.contentId.trim() && !form.contentUrl.trim()) return "Content URL or content id is required.";
    if (!form.copyrightedWorkDescription.trim()) return "Description of copyrighted work is required.";
    if (!form.infringingMaterialDescription.trim()) return "Description of allegedly infringing material is required.";
    if (!form.goodFaithStatement || !form.authorityStatement) return "Good-faith and authority statements must be confirmed.";
    if (!form.electronicSignature.trim()) return "Electronic signature is required.";
    return null;
  }, [dmcaIntakeForm]);
  const dmcaStrikeDisabledReason = useMemo(() => {
    if (!selectedDmcaCase) return "Open a case before adding strikes.";
    if (!dmcaStrikeUserId.trim() || !dmcaContentId.trim()) return "Uploader user id and content id are required.";
    if (!dmcaActionReason.trim()) return "Strike reason/source is required.";
    if (![
      "content_disabled",
      "uploader_notified",
      "counter_notice_received",
      "waiting_rightsholder_response",
      "eligible_for_restore",
      "restored",
      "repeat_infringer_review",
      "preserved_evidence",
      "closed",
    ].includes(selectedDmcaCase.status)) {
      return "Only valid completed takedowns or preserved-evidence cases can receive active strikes.";
    }
    return null;
  }, [dmcaActionReason, dmcaContentId, dmcaStrikeUserId, selectedDmcaCase]);

  const loadAdminV1ReadModel = useCallback(async () => {
    setAdminV1ReadModel((current) => ({ ...current, loading: true }));

    const usageReadModel = await readAdminUsageReadModel();
    setAdminV1ReadModel({ ...usageReadModel, loading: false });
  }, []);

  const loadAdminFinanceReadModel = useCallback(async () => {
    setAdminFinanceReadModel((current) => ({ ...current, loading: true }));

    const financeReadModel = await readAdminFinanceReadModel();
    setAdminFinanceReadModel({ ...financeReadModel, loading: false });
  }, []);

  const loadAdminImmutableAuditReadModel = useCallback(async () => {
    setAdminImmutableAuditReadModel((current) => ({ ...current, loading: true }));

    const immutableAuditReadModel = await readAdminImmutableAuditReadModel({ limit: 8 });
    setAdminImmutableAuditReadModel({ ...immutableAuditReadModel, loading: false });
  }, []);

  const loadLiveCostGuard = useCallback(async () => {
    if (!canAccessLiveOps) {
      setLiveCostGuardSettingsReadModel(null);
      setLiveCostGuardSettingsForm(DEFAULT_LIVE_COST_GUARD_SETTINGS);
      setLiveCostGuardEvents([]);
      setLiveCostGuardActions([]);
      setLiveCostGuardLoading(false);
      return;
    }

    try {
      setLiveCostGuardLoading(true);
      setLiveCostGuardNotice(null);
      const [settingsReadModel, events, actions] = await Promise.all([
        getLiveCostGuardSettings(),
        listLiveCostGuardEvents(25),
        listLiveCostGuardActions(25),
      ]);
      setLiveCostGuardSettingsReadModel(settingsReadModel);
      setLiveCostGuardSettingsForm(settingsReadModel.settings);
      setLiveCostGuardEvents(events);
      setLiveCostGuardActions(actions);
    } catch (err: any) {
      setLiveCostGuardNotice(formatAdminOperationFailure(err, "Failed to load Live Cost Guard."));
      setLiveCostGuardSettingsReadModel(null);
      setLiveCostGuardSettingsForm(DEFAULT_LIVE_COST_GUARD_SETTINGS);
      setLiveCostGuardEvents([]);
      setLiveCostGuardActions([]);
    } finally {
      setLiveCostGuardLoading(false);
    }
  }, [canAccessLiveOps]);

  useEffect(() => {
    if (!canAccessAdmin || !canAccessLiveOps) {
      setLiveCostGuardSettingsReadModel(null);
      setLiveCostGuardSettingsForm(DEFAULT_LIVE_COST_GUARD_SETTINGS);
      setLiveCostGuardEvents([]);
      setLiveCostGuardActions([]);
      setLiveCostGuardLoading(false);
      setLiveCostGuardSaving(false);
      setLiveCostGuardNotice(null);
      setLiveCostGuardActionBusy(null);
      return;
    }
    void loadLiveCostGuard();
  }, [canAccessAdmin, canAccessLiveOps, loadLiveCostGuard]);

  const loadLiveOpsFixCenter = useCallback(async () => {
    if (!canAccessLiveOps) {
      setLiveOpsReadModel(null);
      setLiveOpsLoading(false);
      return;
    }

    try {
      setLiveOpsLoading(true);
      setLiveOpsNotice(null);
      setLiveOpsReadModel(await readLiveOpsFixCenter(25));
    } catch (err: any) {
      setLiveOpsNotice(formatAdminOperationFailure(err, "Failed to load Live Ops Fix Center."));
      setLiveOpsReadModel(null);
    } finally {
      setLiveOpsLoading(false);
    }
  }, [canAccessLiveOps]);

  useEffect(() => {
    if (!canAccessAdmin || !canAccessLiveOps) {
      setLiveOpsReadModel(null);
      setLiveOpsLoading(false);
      setLiveOpsNotice(null);
      setLiveOpsActionBusy(null);
      return;
    }
    void loadLiveOpsFixCenter();
  }, [canAccessAdmin, canAccessLiveOps, loadLiveOpsFixCenter]);

  const runLiveOpsAction = useCallback((incident: LiveOpsIncident, action: LiveOpsFixCenterAction) => {
    if (!canAccessLiveOps || liveOpsActionBusy) {
      setLiveOpsNotice("Live Ops Fix Center actions require active Owner or live_ops permission truth.");
      return;
    }

    const actionLabel = action === "create_pr_only" ? "Create PR only" : formatLiveOpsToken(action);
    const copy = action === "reject"
      ? "This records a rejection audit entry. It does not touch LiveKit, GitHub, rooms, or production infrastructure."
      : action === "create_pr_only"
        ? "This asks the server-side ops proxy to create only a draft PR from an existing fix branch. It never merges or deploys."
        : "This asks the server-side ops proxy to approve the planned remediation. Dry-run and safety env flags still gate execution.";

    Alert.alert(
      `Confirm ${actionLabel}`,
      `${incident.title}\n\nRisk: ${formatLiveOpsToken(incident.riskLevel)}\nRollback: ${incident.rollbackNote}\n\n${copy}`,
      [
        { style: "cancel", text: "Cancel" },
        {
          style: action === "reject" ? "default" : incident.riskLevel === "low" ? "default" : "destructive",
          text: actionLabel,
          onPress: () => {
            void (async () => {
              try {
                setLiveOpsActionBusy(`${incident.id}:${action}`);
                setLiveOpsNotice(null);
                setLiveOpsReadModel(await requestLiveOpsFixCenterAction({
                  action,
                  incidentId: incident.id,
                  reason: `${actionLabel} from mobile Admin Live Ops Fix Center.`,
                }));
                setLiveOpsNotice(`Live Ops action recorded: ${actionLabel}.`);
              } catch (err: any) {
                setLiveOpsNotice(formatAdminOperationFailure(err, `Failed to ${actionLabel.toLowerCase()}.`));
                await loadLiveOpsFixCenter();
              } finally {
                setLiveOpsActionBusy(null);
              }
            })();
          },
        },
      ],
    );
  }, [canAccessLiveOps, liveOpsActionBusy, loadLiveOpsFixCenter]);

  const openLiveOpsRunbook = useCallback((incident: LiveOpsIncident) => {
    if (incident.runbookUrl) {
      void Linking.openURL(incident.runbookUrl).catch(() => {
        Alert.alert("Runbook", incident.runbookPath);
      });
      return;
    }
    Alert.alert("Runbook", incident.runbookPath);
  }, []);

  const refreshLegalRequestAfterEvidence = useCallback(async (requestId: string) => {
    if (!requestId || (!canAccessLegalIntake && !canAccessLegalEvidence)) return;
    const [requests, detail] = await Promise.all([
      listLegalRequests({ limit: 100 }),
      readLegalRequestDetail({ id: requestId }),
    ]);
    setLegalRequests(requests);
    setSelectedLegalRequestDetail(detail);
  }, [canAccessLegalEvidence, canAccessLegalIntake]);

  const runLegalEvidenceAction = useCallback(async (action: "preview" | "export" | "hold") => {
    if (!canAccessLegalEvidence || legalBusy) {
      setLegalNotice("Legal evidence actions require Owner or scoped legal_review/evidence_export permission.");
      return;
    }

    const reason = legalReason.trim();
    if (!isOwnerStaff && reason.length < 6) {
      setLegalNotice("Enter an audit reason before using Legal Review.");
      return;
    }

    if (legalTargetType !== "date_range" && !legalTargetId.trim()) {
      setLegalNotice("Enter a target id before using Legal Review.");
      return;
    }
    if (action === "hold" && legalTargetType === "date_range") {
      setLegalNotice("Legal hold disabled for date range: hold requires a concrete user, content, room, thread, report, DMCA case, or attachment target.");
      return;
    }

    try {
      setLegalBusy(action);
      setLegalNotice(null);
      const result = await requestLegalEvidenceAction({
        action: action === "hold" ? "place_hold" : action,
        dateFrom: legalDateFrom.trim() || null,
        dateTo: legalDateTo.trim() || null,
        legalRequestId: selectedLegalRequestId,
        reason,
        targetId: legalTargetId.trim() || null,
        targetType: legalTargetType,
      });
      if (result.preview && Object.keys(result.preview).length) setLegalPreviewResult(result.preview);
      if (result.exportRecord && Object.keys(result.exportRecord).length) setLegalExportResult(result.exportRecord);
      if (result.hold && Object.keys(result.hold).length) setLegalHoldResult(result.hold);
      setLegalNotice(
        action === "export"
          ? (isOwnerStaff ? "Evidence export record created." : "Evidence export record created with an audit row.")
          : action === "hold"
            ? (isOwnerStaff ? "Legal hold placed." : "Legal hold placed with an audit row.")
            : (isOwnerStaff ? "Evidence preview created." : "Evidence preview created with an audit row."),
      );
      if (selectedLegalRequestId) {
        await refreshLegalRequestAfterEvidence(selectedLegalRequestId);
      }
    } catch (err: any) {
      setLegalNotice(formatAdminOperationFailure(err, "Legal evidence action failed."));
    } finally {
      setLegalBusy(null);
    }
  }, [
    canAccessLegalEvidence,
    legalBusy,
    legalDateFrom,
    legalDateTo,
    legalReason,
    legalTargetId,
    legalTargetType,
    refreshLegalRequestAfterEvidence,
    selectedLegalRequestId,
    isOwnerStaff,
  ]);

  const loadAuditExplorer = useCallback(async () => {
    if (!canAccessAuditExplorer) return;
    try {
      setOwnerControlLoading(true);
      setOwnerControlNotice(null);
      const result = await listOwnerControlAudit({
        actionType: auditExplorerActionFilter.trim() || undefined,
        breakGlassOnly: auditExplorerBreakGlassOnly,
        limit: 80,
        targetId: auditExplorerTargetFilter.trim() || undefined,
      });
      setAuditExplorerRows(result.rows);
    } catch (err: any) {
      setAuditExplorerRows([]);
      setOwnerControlNotice(formatAdminOperationFailure(err, "Failed to load Audit Explorer."));
    } finally {
      setOwnerControlLoading(false);
    }
  }, [auditExplorerActionFilter, auditExplorerBreakGlassOnly, auditExplorerTargetFilter, canAccessAuditExplorer]);

  const loadPermissionTemplates = useCallback(async () => {
    if (!canManagePermissionTemplates) return;
    try {
      setOwnerControlLoading(true);
      setOwnerControlNotice(null);
      const templates = await listPermissionTemplates();
      setPermissionTemplates(templates);
      if (templates.length && !templates.some((template) => template.key === permissionTemplateKey)) {
        setPermissionTemplateKey(templates[0].key);
      }
    } catch (err: any) {
      setOwnerControlNotice(formatAdminOperationFailure(err, "Failed to load permission templates."));
    } finally {
      setOwnerControlLoading(false);
    }
  }, [canManagePermissionTemplates, permissionTemplateKey]);

  const runPermissionTemplateAction = useCallback(async (action: "apply" | "revoke") => {
    const email = permissionTemplateEmail.trim().toLowerCase();
    if (!canManagePermissionTemplates || permissionTemplateBusy) {
      setOwnerControlNotice("Permission templates require Owner or scoped staff_permission_templates/admin_grants permission.");
      return;
    }
    if (!email) {
      setOwnerControlNotice("Enter an Admin email before applying a permission template.");
      return;
    }
    if (permissionTemplateReason.trim().length < 6) {
      setOwnerControlNotice("Audit reason is required before applying or revoking templates.");
      return;
    }

    try {
      setPermissionTemplateBusy(action);
      setOwnerControlNotice(null);
      if (action === "apply") {
        await applyPermissionTemplate({
          duration: permissionTemplateDuration,
          reason: permissionTemplateReason.trim() || null,
          targetEmail: email,
          templateKey: permissionTemplateKey,
        });
      } else {
        await revokePermissionTemplate({
          reason: permissionTemplateReason.trim() || null,
          targetEmail: email,
          templateKey: permissionTemplateKey,
        });
      }
      setOwnerControlNotice(`Permission template ${action === "apply" ? "applied" : "revoked"} for ${maskOperatorIdentity(email)}.`);
      await Promise.all([loadPermissionTemplates(), loadPlatformRoles()]);
    } catch (err: any) {
      setOwnerControlNotice(formatAdminOperationFailure(err, `Failed to ${action} permission template.`));
    } finally {
      setPermissionTemplateBusy(null);
    }
  }, [
    canManagePermissionTemplates,
    loadPermissionTemplates,
    loadPlatformRoles,
    permissionTemplateBusy,
    permissionTemplateDuration,
    permissionTemplateEmail,
    permissionTemplateKey,
    permissionTemplateReason,
  ]);

  const loadBreakGlass = useCallback(async () => {
    if (!canAccessBreakGlass) return;
    try {
      setOwnerControlLoading(true);
      setOwnerControlNotice(null);
      const status = await readBreakGlassStatus();
      setBreakGlassActiveSessionId(status.activeSessionId);
      setBreakGlassSessions(status.sessions);
    } catch (err: any) {
      setOwnerControlNotice(formatAdminOperationFailure(err, "Failed to load Break Glass status."));
    } finally {
      setOwnerControlLoading(false);
    }
  }, [canAccessBreakGlass]);

  const runBreakGlassActivate = useCallback(async () => {
    if (!canAccessBreakGlass || breakGlassBusy) return;
    if (breakGlassReason.trim().length < 6) {
      setOwnerControlNotice("Break Glass activation requires a reason.");
      return;
    }
    try {
      setBreakGlassBusy("activate");
      setOwnerControlNotice(null);
      await activateBreakGlass({
        caseId: breakGlassCaseId.trim() || null,
        duration: breakGlassDuration,
        reason: breakGlassReason.trim(),
        reportId: breakGlassReportId.trim() || null,
      });
      setOwnerControlNotice("Break Glass activated. Owner/admin actions now emit Break Glass audit rows until ended or expired.");
      setBreakGlassReason("");
      await loadBreakGlass();
    } catch (err: any) {
      setOwnerControlNotice(formatAdminOperationFailure(err, "Failed to activate Break Glass."));
    } finally {
      setBreakGlassBusy(null);
    }
  }, [breakGlassBusy, breakGlassCaseId, breakGlassDuration, breakGlassReason, breakGlassReportId, canAccessBreakGlass, loadBreakGlass]);

  const runBreakGlassEnd = useCallback(async () => {
    if (!canAccessBreakGlass || breakGlassBusy) return;
    try {
      setBreakGlassBusy("end");
      setOwnerControlNotice(null);
      await endBreakGlass({ sessionId: breakGlassActiveSessionId });
      setOwnerControlNotice("Break Glass session ended.");
      await loadBreakGlass();
      await loadPlatformRoles();
    } catch (err: any) {
      setOwnerControlNotice(formatAdminOperationFailure(err, "Failed to end Break Glass."));
    } finally {
      setBreakGlassBusy(null);
    }
  }, [breakGlassActiveSessionId, breakGlassBusy, canAccessBreakGlass, loadBreakGlass, loadPlatformRoles]);

  const loadLegalIntake = useCallback(async () => {
    if (!canAccessLegalIntake && !canAccessLegalEvidence) return;
    try {
      setOwnerControlLoading(true);
      setOwnerControlNotice(null);
      setLegalRequests(await listLegalRequests({ limit: 100 }));
    } catch (err: any) {
      setLegalRequests([]);
      setOwnerControlNotice(formatAdminOperationFailure(err, "Failed to load legal request intake."));
    } finally {
      setOwnerControlLoading(false);
    }
  }, [canAccessLegalEvidence, canAccessLegalIntake]);

  const openLegalRequestDetail = useCallback(async (requestId: string) => {
    if (!requestId || (!canAccessLegalIntake && !canAccessLegalEvidence)) return;
    try {
      setLegalRequestDetailBusy(true);
      setOwnerControlNotice(null);
      setSelectedLegalRequestId(requestId);
      const detail = await readLegalRequestDetail({ id: requestId });
      setSelectedLegalRequestDetail(detail);
      setLegalRequestStatusUpdate((detail.request?.status as LegalRequestStatusFilter) || "under_review");
      setLegalRequestNote("");
    } catch (err: any) {
      setOwnerControlNotice(formatAdminOperationFailure(err, "Failed to open legal request detail."));
    } finally {
      setLegalRequestDetailBusy(false);
    }
  }, [canAccessLegalEvidence, canAccessLegalIntake]);

  const runLegalIntakeCreate = useCallback(async () => {
    if (!canAccessLegalIntake || legalRequestBusy) return;
    if (legalRequestAgency.trim().length < 2 || legalRequestReason.trim().length < 6) {
      setOwnerControlNotice("Legal request intake needs an agency and request reason.");
      return;
    }
    if (!isOwnerStaff && legalRequestReason.trim().length < 6) {
      setOwnerControlNotice("Admins need a reason for legal request intake.");
      return;
    }
    const targetPatch: Record<string, string> = {};
    if (legalRequestTargetId.trim()) targetPatch[legalRequestTargetType] = legalRequestTargetId.trim();
    try {
      setLegalRequestBusy(true);
      setOwnerControlNotice(null);
      await createLegalRequest({
        contactName: legalRequestContact.trim() || null,
        contactEmail: legalRequestContactEmail.trim() || null,
        contactPhone: legalRequestContactPhone.trim() || null,
        caseNumber: legalRequestCaseNumber.trim() || null,
        dateFrom: legalRequestDateFrom.trim() || null,
        dateTo: legalRequestDateTo.trim() || null,
        dueAt: legalRequestDueAt.trim() || null,
        notes: legalRequestNotes.trim() || null,
        requestReason: legalRequestReason.trim(),
        requestType: legalRequestType,
        requestingAgency: legalRequestAgency.trim(),
        ...targetPatch,
      });
      setOwnerControlNotice("Legal request intake record created.");
      setLegalRequestAgency("");
      setLegalRequestContact("");
      setLegalRequestContactEmail("");
      setLegalRequestContactPhone("");
      setLegalRequestCaseNumber("");
      setLegalRequestDateFrom("");
      setLegalRequestDateTo("");
      setLegalRequestDueAt("");
      setLegalRequestNotes("");
      setLegalRequestReason("");
      setLegalRequestTargetId("");
      await loadLegalIntake();
    } catch (err: any) {
      setOwnerControlNotice(formatAdminOperationFailure(err, "Failed to create legal request intake."));
    } finally {
      setLegalRequestBusy(false);
    }
  }, [
    canAccessLegalIntake,
    isOwnerStaff,
    legalRequestAgency,
    legalRequestBusy,
    legalRequestCaseNumber,
    legalRequestContact,
    legalRequestContactEmail,
    legalRequestContactPhone,
    legalRequestDateFrom,
    legalRequestDateTo,
    legalRequestDueAt,
    legalRequestNotes,
    legalRequestReason,
    legalRequestTargetId,
    legalRequestTargetType,
    legalRequestType,
    loadLegalIntake,
  ]);

  const updateSelectedLegalRequestStatus = useCallback(async (requestId: string, status: LegalRequestStatusFilter) => {
    if (!canAccessLegalIntake) return;
    if (!requestId || status === "all") {
      setOwnerControlNotice("Choose a legal request and status first.");
      return;
    }
    try {
      setOwnerControlNotice(null);
      await updateLegalRequest({
        id: requestId,
        reason: isOwnerStaff ? null : `Admin marked legal request ${formatLegalStatus(status)}.`,
        status,
      });
      await loadLegalIntake();
      await openLegalRequestDetail(requestId);
    } catch (err: any) {
      setOwnerControlNotice(formatAdminOperationFailure(err, "Failed to update legal request intake."));
    }
  }, [canAccessLegalIntake, isOwnerStaff, loadLegalIntake, openLegalRequestDetail]);

  const addLegalRequestNote = useCallback(async () => {
    const requestId = selectedLegalRequestId;
    if (!canAccessLegalIntake || !requestId) return;
    if (legalRequestNote.trim().length < 3) {
      setOwnerControlNotice("Add a note before recording it.");
      return;
    }
    try {
      setOwnerControlNotice(null);
      await updateLegalRequest({
        id: requestId,
        notes: legalRequestNote.trim(),
        reason: isOwnerStaff ? null : "Admin added Legal Intake note.",
      });
      setLegalRequestNote("");
      await loadLegalIntake();
      await openLegalRequestDetail(requestId);
    } catch (err: any) {
      setOwnerControlNotice(formatAdminOperationFailure(err, "Failed to add legal request note."));
    }
  }, [canAccessLegalIntake, isOwnerStaff, legalRequestNote, loadLegalIntake, openLegalRequestDetail, selectedLegalRequestId]);

  const linkLegalRequestToEvidence = useCallback((request: OwnerControlLegalRequest) => {
    const target = legalRequestPrimaryTarget(request);
    setSelectedLegalRequestId(String(request.id ?? ""));
    setSelectedLegalRequestDetail((prev) => prev?.request?.id === request.id ? prev : null);
    setLegalSubsection("evidence");
    if (target.id) {
      setLegalTargetType(target.targetType);
      setLegalTargetId(target.id);
    }
    setLegalNotice(`Evidence actions will be linked to request ${formatCompactIdentifier(request.id)}.`);
  }, []);

  const applyLegalHoldForRequest = useCallback(async (request: OwnerControlLegalRequest) => {
    if (!canAccessLegalEvidence || legalBusy) return;
    const target = legalRequestPrimaryTarget(request);
    if (!target.id) {
      setLegalNotice("Legal hold disabled: this request has no concrete target id.");
      return;
    }
    const reason = legalReason.trim();
    if (!isOwnerStaff && reason.length < 6) {
      setLegalNotice("Enter an audit reason before applying a legal hold.");
      return;
    }
    try {
      setLegalBusy("hold");
      setLegalNotice(null);
      const result = await requestLegalEvidenceAction({
        action: "place_hold",
        legalRequestId: String(request.id ?? ""),
        reason,
        targetId: target.id,
        targetType: target.targetType,
      });
      setLegalHoldResult(result.hold);
      setLegalNotice(isOwnerStaff ? "Legal hold placed." : "Legal hold placed with an audit row.");
      await loadLegalIntake();
      await openLegalRequestDetail(String(request.id ?? ""));
    } catch (err: any) {
      setLegalNotice(formatAdminOperationFailure(err, "Legal hold action failed."));
    } finally {
      setLegalBusy(null);
    }
  }, [canAccessLegalEvidence, isOwnerStaff, legalBusy, legalReason, loadLegalIntake, openLegalRequestDetail]);

  const loadOwnerSecurity = useCallback(async () => {
    if (!canAccessOwnerSecurity) return;
    try {
      setOwnerControlLoading(true);
      setOwnerControlNotice(null);
      const result = await readOwnerSecurityStatus();
      setOwnerSecurityStatus(result.security);
      setOwnerSafetyDashboard(result.safetyDashboard);
    } catch (err: any) {
      setOwnerControlNotice(formatAdminOperationFailure(err, "Failed to load owner security panel."));
    } finally {
      setOwnerControlLoading(false);
    }
  }, [canAccessOwnerSecurity]);

  const runOwnerSecurityTrustCurrentDevice = useCallback(async () => {
    if (!canAccessOwnerSecurity || ownerSecurityActionBusy) return;
    try {
      setOwnerSecurityActionBusy("trust-device");
      setOwnerControlNotice(null);
      await trustCurrentOwnerDevice();
      await loadOwnerSecurity();
      setOwnerControlNotice("Current device trusted.");
    } catch (err: any) {
      setOwnerControlNotice(formatAdminOperationFailure(err, "Failed to trust current device."));
    } finally {
      setOwnerSecurityActionBusy(null);
    }
  }, [canAccessOwnerSecurity, loadOwnerSecurity, ownerSecurityActionBusy]);

  const runOwnerSecurityRevokeDevice = useCallback(async (deviceId: string, isCurrentDevice = false) => {
    if (!canAccessOwnerSecurity || ownerSecurityActionBusy || !deviceId) return;
    const apply = async () => {
      try {
        setOwnerSecurityActionBusy(`revoke-device-${deviceId}`);
        setOwnerControlNotice(null);
        await revokeOwnerDevice(deviceId);
        await loadOwnerSecurity();
        setOwnerControlNotice(isCurrentDevice ? "Current device marked untrusted." : "Device trust revoked.");
      } catch (err: any) {
        setOwnerControlNotice(formatAdminOperationFailure(err, "Failed to revoke device trust."));
      } finally {
        setOwnerSecurityActionBusy(null);
      }
    };
    if (isCurrentDevice) {
      Alert.alert(
        "Mark current device untrusted?",
        "This keeps you signed in, but this device will be listed as untrusted until you trust it again.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Mark Untrusted", style: "destructive", onPress: () => void apply() },
        ],
      );
      return;
    }
    await apply();
  }, [canAccessOwnerSecurity, loadOwnerSecurity, ownerSecurityActionBusy]);

  const runOwnerSecurityRevokeGrant = useCallback(async (grantId: string) => {
    if (!canAccessOwnerSecurity || ownerSecurityActionBusy || !grantId) return;
    try {
      setOwnerSecurityActionBusy(`revoke-grant-${grantId}`);
      setOwnerControlNotice(null);
      await revokeTemporaryOwnerGrant(grantId);
      await loadOwnerSecurity();
      setOwnerControlNotice("Temporary grant revoked and recorded.");
    } catch (err: any) {
      setOwnerControlNotice(formatAdminOperationFailure(err, "Failed to revoke temporary grant."));
    } finally {
      setOwnerSecurityActionBusy(null);
    }
  }, [canAccessOwnerSecurity, loadOwnerSecurity, ownerSecurityActionBusy]);

  const runOwnerSecurityChecklistRefresh = useCallback(async () => {
    if (!canAccessOwnerSecurity || ownerSecurityActionBusy) return;
    try {
      setOwnerSecurityActionBusy("checklist-refresh");
      setOwnerControlNotice(null);
      const checklist = await runOwnerSecurityChecklist();
      setOwnerSecurityStatus((prev) => prev ? { ...prev, checklist } : { checklist });
      setOwnerControlNotice("Security checklist refreshed.");
    } catch (err: any) {
      setOwnerControlNotice(formatAdminOperationFailure(err, "Failed to refresh security checklist."));
    } finally {
      setOwnerSecurityActionBusy(null);
    }
  }, [canAccessOwnerSecurity, ownerSecurityActionBusy]);

  const runOwnerSecurityBulkRevoke = useCallback(async () => {
    if (!canAccessOwnerSecurity || ownerSecurityActionBusy) return;
    try {
      setOwnerSecurityActionBusy("bulk-revoke-grants");
      setOwnerControlNotice(null);
      const result = await revokeAllTemporaryOwnerGrants(ownerSecurityConfirmText.trim());
      await loadOwnerSecurity();
      setOwnerSecurityConfirmVisible(false);
      setOwnerSecurityConfirmText("");
      setOwnerControlNotice(`Temporary grant revoke complete (${String(result.revokedCount ?? 0)} revoked).`);
    } catch (err: any) {
      setOwnerControlNotice(formatAdminOperationFailure(err, "Failed to revoke all temporary grants."));
    } finally {
      setOwnerSecurityActionBusy(null);
    }
  }, [canAccessOwnerSecurity, loadOwnerSecurity, ownerSecurityActionBusy, ownerSecurityConfirmText]);

  const loadCanaries = useCallback(async () => {
    if (!canAccessCanaryChecks) return;
    try {
      setOwnerControlLoading(true);
      setOwnerControlNotice(null);
      setCanaryRuns(await listOwnerControlCanaries());
    } catch (err: any) {
      setCanaryRuns([]);
      setOwnerControlNotice(formatAdminOperationFailure(err, "Failed to load canary checks."));
    } finally {
      setOwnerControlLoading(false);
    }
  }, [canAccessCanaryChecks]);

  const runCanaryChecks = useCallback(async () => {
    if (!canAccessCanaryChecks || canaryBusy) return;
    try {
      setCanaryBusy(true);
      setOwnerControlNotice(null);
      const run = await runOwnerControlCanary();
      setCanaryRuns((prev) => [run, ...prev].slice(0, 10));
      setOwnerControlNotice("Canary checks completed. Unknown means manual proof is required, not pass.");
    } catch (err: any) {
      setOwnerControlNotice(formatAdminOperationFailure(err, "Failed to run canary checks."));
    } finally {
      setCanaryBusy(false);
    }
  }, [canAccessCanaryChecks, canaryBusy]);

  const toggleOwnerControlRow = useCallback((key: string) => {
    setExpandedOwnerControlRows((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleCanaryRow = useCallback((key: string) => {
    setExpandedCanaryRows((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const latestCanaryRun = canaryRuns[0] ?? null;
  const latestCanarySummary = useMemo(() => summarizeCanaryRun(latestCanaryRun), [latestCanaryRun]);
  const latestCanaryResults = useMemo(
    () => (Array.isArray(latestCanaryRun?.results) ? latestCanaryRun.results : []),
    [latestCanaryRun],
  );
  const filteredCanaryResults = useMemo(
    () => latestCanaryResults.filter((result) => canaryStatusFilter === "all" || normalizeCanaryStatus(result.status) === canaryStatusFilter),
    [canaryStatusFilter, latestCanaryResults],
  );
  const groupedCanaryResults = useMemo(
    () => canarySectionOrder
      .map((section) => ({
        results: filteredCanaryResults.filter((result) => resolveCanarySection(result) === section),
        section,
      }))
      .filter((group) => group.results.length > 0),
    [filteredCanaryResults],
  );
  const ownerSecurityOverview = ownerSecurityStatus?.overview ?? null;
  const ownerSecurityCurrentDevice = ownerSecurityStatus?.currentDevice ?? null;
  const ownerSecurityDevices = ownerSecurityStatus?.devices ?? [];
  const ownerSecurityTemporaryGrants = ownerSecurityStatus?.temporaryGrants ?? [];
  const ownerSecurityAuditEvents = ownerSecurityStatus?.auditEvents ?? [];
  const ownerSecurityLiveOpsFlags = ownerSecurityStatus?.liveOpsFlags ?? [];
  const ownerSecurityChecklist = ownerSecurityStatus?.checklist ?? [];
  const ownerSecurityLoaded = !!ownerSecurityStatus;
  const filteredOwnerSecurityAuditEvents = useMemo(
    () => ownerSecurityAuditEvents.filter((event) => matchesOwnerSecurityAuditFilter(event, ownerSecurityAuditFilter)),
    [ownerSecurityAuditEvents, ownerSecurityAuditFilter],
  );
  const ownerSecurityOpenAlerts = ownerSecurityOverview?.openSecurityAlertsCount;
  const ownerSecurityActiveGrantsCount = ownerSecurityStatus?.activeTemporaryGrantsCount ?? ownerSecurityOverview?.activeTemporaryGrantsCount;
  const ownerSecurityHighRiskActions = ownerSecurityOverview?.recentHighRiskActionsCount;
  const ownerSecurityLastRefresh = ownerSecurityOverview?.lastSecurityRefreshAt ?? null;

  useEffect(() => {
    if (!canAccessAdmin) return;
    if (operatorTab === "audit-explorer" && canAccessAuditExplorer) void loadAuditExplorer();
    if (operatorTab === "permission-templates" && canManagePermissionTemplates) void loadPermissionTemplates();
    if (operatorTab === "break-glass" && canAccessBreakGlass) void loadBreakGlass();
    if (operatorTab === "legal" && (canAccessLegalIntake || canAccessLegalEvidence)) void loadLegalIntake();
    if ((operatorTab === "owner-security" || operatorTab === "safety-dashboard") && canAccessOwnerSecurity) void loadOwnerSecurity();
    if (operatorTab === "canary" && canAccessCanaryChecks) void loadCanaries();
  }, [
    canAccessAdmin,
    canAccessAuditExplorer,
    canAccessBreakGlass,
    canAccessCanaryChecks,
    canAccessLegalEvidence,
    canAccessLegalIntake,
    canAccessOwnerSecurity,
    canManagePermissionTemplates,
    loadAuditExplorer,
    loadBreakGlass,
    loadCanaries,
    loadLegalIntake,
    loadOwnerSecurity,
    loadPermissionTemplates,
    operatorTab,
  ]);

  const saveLiveCostGuardSettings = useCallback(async () => {
    if (!canAccessLiveOps || liveCostGuardSaving) {
      setLiveCostGuardNotice("Live Cost Guard settings require Owner or live_ops permission truth.");
      return;
    }

    try {
      setLiveCostGuardSaving(true);
      setLiveCostGuardNotice(null);
      const settingsReadModel = await updateLiveCostGuardSettings(liveCostGuardSettingsForm);
      setLiveCostGuardSettingsReadModel(settingsReadModel);
      setLiveCostGuardSettingsForm(settingsReadModel.settings);
      setLiveCostGuardNotice("Live Cost Guard settings saved.");
      await loadLiveCostGuard();
    } catch (err: any) {
      setLiveCostGuardNotice(formatAdminOperationFailure(err, "Failed to save Live Cost Guard settings."));
    } finally {
      setLiveCostGuardSaving(false);
    }
  }, [canAccessLiveOps, liveCostGuardSaving, liveCostGuardSettingsForm, loadLiveCostGuard]);

  const logLiveCostGuardTestWarning = useCallback(async () => {
    if (!canAccessLiveOps || liveCostGuardActionBusy) {
      setLiveCostGuardNotice("Live Cost Guard actions require Owner or live_ops permission truth.");
      return;
    }

    try {
      setLiveCostGuardActionBusy("manual-warning");
      setLiveCostGuardNotice(null);
      await createManualLiveCostGuardEvent({
        actionStatus: "logged_manual_test",
        estimatedUsdPerHour: null,
        metricSnapshot: { proof: "manual_admin_test", fakeMetrics: false },
        recommendedAction: "shorten_token_ttl",
        roomName: liveCostGuardRoomName.trim() || null,
        severity: "warning",
      });
      setLiveCostGuardNotice("Manual Live Cost Guard warning event logged.");
      await loadLiveCostGuard();
    } catch (err: any) {
      setLiveCostGuardNotice(formatAdminOperationFailure(err, "Failed to log manual Live Cost Guard event."));
    } finally {
      setLiveCostGuardActionBusy(null);
    }
  }, [canAccessLiveOps, liveCostGuardActionBusy, liveCostGuardRoomName, loadLiveCostGuard]);

  const runLiveCostGuardAction = useCallback((actionType: LiveCostGuardActionType) => {
    if (!canAccessLiveOps || liveCostGuardActionBusy) {
      setLiveCostGuardNotice("Live Cost Guard actions require Owner or live_ops permission truth.");
      return;
    }

    const reason = liveCostGuardActionReason.trim();
    const roomName = liveCostGuardRoomName.trim();
    const participantIdentity = liveCostGuardParticipantIdentity.trim();
    if (!reason) {
      setLiveCostGuardNotice("Add an audit reason before requesting a Live Cost Guard action.");
      return;
    }
    if ((actionType === "restrict_publish" || actionType === "remove_participant") && (!roomName || !participantIdentity)) {
      setLiveCostGuardNotice("Room name and participant identity are required for participant-targeted actions.");
      return;
    }

    const mode = liveCostGuardSettingsForm.mode;
    const enabled = liveCostGuardSettingsForm.enabled;
    const observeOnlyCopy = mode === "observe_only"
      ? "Observe-only mode will only record what would have happened. No LiveKit or room behavior will change."
      : "This request is server-side, audited, and gated by the saved Live Cost Guard mode.";

    Alert.alert(
      "Confirm Live Cost Guard action",
      `${formatModerationToken(actionType)}\n\n${observeOnlyCopy}`,
      [
        { style: "cancel", text: "Cancel" },
        {
          style: actionType === "shorten_token_ttl" || actionType === "restore_normal_mode" ? "default" : "destructive",
          text: "Confirm",
          onPress: () => {
            void (async () => {
              try {
                setLiveCostGuardActionBusy(actionType);
                setLiveCostGuardNotice(null);
                await requestLiveCostGuardAction({
                  actionType,
                  participantIdentity: participantIdentity || null,
                  reason,
                  roomName: roomName || null,
                });
                setLiveCostGuardNotice(enabled || mode === "observe_only"
                  ? "Live Cost Guard action recorded."
                  : "Live Cost Guard action recorded as disabled because the guard is not enabled.");
                await loadLiveCostGuard();
              } catch (err: any) {
                setLiveCostGuardNotice(formatAdminOperationFailure(err, "Failed to request Live Cost Guard action."));
              } finally {
                setLiveCostGuardActionBusy(null);
              }
            })();
          },
        },
      ],
    );
  }, [
    canManagePrivilegedWrites,
    liveCostGuardActionBusy,
    liveCostGuardActionReason,
    liveCostGuardParticipantIdentity,
    liveCostGuardRoomName,
    liveCostGuardSettingsForm.enabled,
    liveCostGuardSettingsForm.mode,
    loadLiveCostGuard,
  ]);

  const queueReportTargetModerationForTarget = useCallback((
    status: ReportTargetModerationStatus,
    targetType: SafetyReportQueueItem["targetType"],
    targetIdInput: string,
    reasonInput: string,
    report?: SafetyReportQueueItem | null,
  ) => {
    const targetId = targetIdInput.trim();
    const reason = reasonInput.trim();
    if (!targetId || creatorVideoModerationBusy) return;

    if (!canApplyReportTargetActions) {
      setModerationNotice("Target visibility actions require Owner or scoped content_moderation permission.");
      return;
    }

    if (!reason) {
      setModerationNotice("Add a short safety reason before changing public visibility.");
      return;
    }

    setPendingCreatorVideoModeration({
      status,
      targetType,
      targetId,
      reason,
      reportId: report?.id ?? null,
      reportSourceSurface: report?.sourceSurface ?? null,
    });
  }, [
    canApplyReportTargetActions,
    creatorVideoModerationBusy,
  ]);

  const applyCreatorVideoModeration = useCallback(async () => {
    const action = pendingCreatorVideoModeration;
    if (!action || creatorVideoModerationBusy) return;

    if (!canApplyReportTargetActions) {
      setPendingCreatorVideoModeration(null);
      setModerationNotice("Target visibility actions require Owner or scoped content_moderation permission.");
      return;
    }

    if (!action.reportId) {
      setPendingCreatorVideoModeration(null);
      setModerationNotice("Manual target action is disabled because immutable report-linked audit requires a selected report.");
      return;
    }

    try {
      setCreatorVideoModerationBusy(action.status);
      setModerationNotice(null);
      const updatedReport = await applyAdminReportTargetAction({
        action: action.status,
        reason: action.reason,
        reportId: action.reportId,
        targetId: action.targetId,
        targetType: action.targetType,
      });
      setSafetyReports((current) => current.map((report) => (
        report.id === updatedReport.id ? updatedReport : report
      )));
      const auditRows = await listAdminReportAuditEvents(action.reportId).catch(() => []);
      setSelectedReportAuditRows(auditRows);
      setCreatorVideoModerationReason("");
      setModerationNotice(
        `Report ${formatCompactIdentifier(action.reportId)} target ${formatCompactIdentifier(action.targetId)} is now ${formatModerationToken(action.status).toLowerCase()}; immutable audit row written and report status updated.`,
      );
      if (canReviewSafetyReports) {
        void loadSafetyReports();
      }
    } catch (err: any) {
      setModerationNotice(formatReportModerationFailure(err));
    } finally {
      setCreatorVideoModerationBusy(null);
      setPendingCreatorVideoModeration(null);
    }
  }, [
    canApplyReportTargetActions,
    canReviewSafetyReports,
    creatorVideoModerationBusy,
    loadSafetyReports,
    pendingCreatorVideoModeration,
  ]);

  const updateSelectedReportStatus = useCallback(async (
    action: "mark_reviewed" | "dismiss" | "escalate",
  ) => {
    if (!selectedSafetyReport || reportStatusActionBusy) return;
    const reason = creatorVideoModerationReason.trim();
    if (!reason) {
      setModerationNotice("Add a short report action reason before updating status.");
      return;
    }
    if (!canReviewSafetyReports) {
      setModerationNotice("Report status actions require backed report-review permission.");
      return;
    }

    try {
      setReportStatusActionBusy(action);
      setModerationNotice(null);
      const updatedReport = await updateAdminReportStatusAction({
        action,
        reason,
        reportId: selectedSafetyReport.id,
      });
      setSafetyReports((current) => current.map((report) => (
        report.id === updatedReport.id ? updatedReport : report
      )));
      const auditRows = await listAdminReportAuditEvents(updatedReport.id).catch(() => []);
      setSelectedReportAuditRows(auditRows);
      setCreatorVideoModerationReason("");
      setModerationNotice(`Report ${formatCompactIdentifier(updatedReport.id)} ${formatModerationToken(updatedReport.status).toLowerCase()}; immutable audit row written.`);
      void loadSafetyReports();
    } catch (err: any) {
      setModerationNotice(formatReportModerationFailure(err));
    } finally {
      setReportStatusActionBusy(null);
    }
  }, [
    canReviewSafetyReports,
    creatorVideoModerationReason,
    loadSafetyReports,
    reportStatusActionBusy,
    selectedSafetyReport,
  ]);

  const loadStaffAndAuditVisibility = useCallback(async () => {
    const canViewAudit = canManagePrivilegedWrites || canReviewSafetyReports;

    if (!canViewStaffRoles) {
      setPlatformRoleRoster([]);
      setPlatformRoleRosterSummary(null);
      setPlatformRoleRosterGeneratedAt(null);
      setPlatformRoleRosterLoading(false);
      setRoleAuditEvents([]);
      setRoleAuditLoading(false);
    }

    if (!canViewAudit) {
      setAdminAuditLog([]);
      setAdminAuditLogSummary(null);
      setAdminAuditLogLoading(false);
    }

    if (!canViewStaffRoles && !canViewAudit) {
      setAdminOpsNotice(null);
      return;
    }

    setAdminOpsNotice(null);
    setPlatformRoleRosterLoading(canViewStaffRoles);
    setRoleAuditLoading(canViewStaffRoles);
    setAdminAuditLogLoading(canViewAudit);

    const partialFailures: string[] = [];

    try {
      if (canViewStaffRoles) {
        const rosterResult = await readPlatformRoleRoster({
          includePermissionGrants: isOwnerStaff,
          includeRevoked: true,
          limit: 16,
        });
        setPlatformRoleRoster(rosterResult.items);
        setPlatformRoleRosterSummary(rosterResult.summary);
        setPlatformRoleRosterGeneratedAt(rosterResult.generatedAt);
      }
    } catch (err: any) {
      setPlatformRoleRoster([]);
      setPlatformRoleRosterSummary(null);
      setPlatformRoleRosterGeneratedAt(null);
      partialFailures.push(formatAdminOperationFailure(err, "Staff roster not connected."));
    } finally {
      if (canViewStaffRoles) setPlatformRoleRosterLoading(false);
    }

    try {
      if (canViewAudit) {
        const auditLogResult = await readAdminAuditLog({ limit: 8 });
        setAdminAuditLog(auditLogResult.items);
        setAdminAuditLogSummary(auditLogResult.summary);
      }
    } catch (err: any) {
      setAdminAuditLog([]);
      setAdminAuditLogSummary(null);
      partialFailures.push(formatAdminOperationFailure(err, "Admin audit feed not connected."));
    } finally {
      if (canViewAudit) setAdminAuditLogLoading(false);
    }

    try {
      if (canViewStaffRoles) {
        const roleAuditResult = await listAdminRoleAuditEvents({ filter: roleAuditFilter, limit: 12 });
        setRoleAuditEvents(roleAuditResult);
      }
    } catch (err: any) {
      setRoleAuditEvents([]);
      partialFailures.push(formatAdminOperationFailure(err, "Role audit timeline not connected."));
    } finally {
      if (canViewStaffRoles) setRoleAuditLoading(false);
    }

    setAdminOpsNotice(partialFailures.length ? partialFailures.join(" ") : null);
  }, [canManagePrivilegedWrites, canReviewSafetyReports, canViewStaffRoles, isOwnerStaff, roleAuditFilter]);

  const refreshStaffRoleState = useCallback(async () => {
    await Promise.all([
      loadPlatformRoles(),
      loadStaffAndAuditVisibility(),
    ]);
  }, [loadPlatformRoles, loadStaffAndAuditVisibility]);

  const runStaffRoleGrant = useCallback(async () => {
    const email = staffRoleEmail.trim().toLowerCase();
    if (staffRoleBusy) return;
    if (!email) {
      setAdminOpsNotice("Enter an email before granting a staff role.");
      return;
    }
    if (staffRoleReason.trim().length < 6) {
      setAdminOpsNotice("Audit reason is required before granting a staff role.");
      return;
    }
    if (staffRoleTarget === "admin" && !canManageAdminStaff) {
      setAdminOpsNotice("Only Owner or an Admin with admin_grants can add Admins.");
      return;
    }
    if (staffRoleTarget === "moderator" && !canManageModeratorStaff) {
      setAdminOpsNotice("Only Owner or an Admin with manage_moderators can add Moderators.");
      return;
    }

    try {
      setStaffRoleBusy("grant");
      setAdminOpsNotice(null);
      const result = await grantPlatformStaffRoleByEmail({
        email,
        role: staffRoleTarget,
        reason: staffRoleReason.trim() || null,
      });
      setAdminOpsNotice(`${formatPlatformRoleDisplayLabel(result.role)} granted for ${maskOperatorIdentity(result.email)}.`);
      setStaffRoleReason("");
      await refreshStaffRoleState();
    } catch (err: any) {
      setAdminOpsNotice(formatAdminOperationFailure(err, "Failed to grant staff role."));
    } finally {
      setStaffRoleBusy(null);
    }
  }, [
    canManageAdminStaff,
    canManageModeratorStaff,
    refreshStaffRoleState,
    staffRoleBusy,
    staffRoleEmail,
    staffRoleReason,
    staffRoleTarget,
  ]);

  const runStaffRoleRevoke = useCallback(async (emailInput?: string | null, roleInput?: PlatformStaffManagementRole) => {
    const email = (emailInput ?? staffRoleEmail).trim().toLowerCase();
    const role = roleInput ?? staffRoleTarget;
    if (staffRoleBusy) return;
    if (!email) {
      setAdminOpsNotice("Enter an email before removing a staff role.");
      return;
    }
    if (staffRoleReason.trim().length < 6) {
      setAdminOpsNotice("Audit reason is required before removing a staff role.");
      return;
    }
    if (role === "admin" && !canManageAdminStaff) {
      setAdminOpsNotice("Only Owner or an Admin with admin_grants can remove Admins.");
      return;
    }
    if (role === "moderator" && !canManageModeratorStaff) {
      setAdminOpsNotice("Only Owner or an Admin with manage_moderators can remove Moderators.");
      return;
    }

    try {
      setStaffRoleBusy("revoke");
      setAdminOpsNotice(null);
      const result = await revokePlatformStaffRoleByEmail({
        email,
        role,
        reason: staffRoleReason.trim() || null,
      });
      setAdminOpsNotice(`${formatPlatformRoleDisplayLabel(result.role)} removed for ${maskOperatorIdentity(result.email)}.`);
      setStaffRoleReason("");
      await refreshStaffRoleState();
    } catch (err: any) {
      setAdminOpsNotice(formatAdminOperationFailure(err, "Failed to remove staff role."));
    } finally {
      setStaffRoleBusy(null);
    }
  }, [
    canManageAdminStaff,
    canManageModeratorStaff,
    refreshStaffRoleState,
    staffRoleBusy,
    staffRoleEmail,
    staffRoleReason,
    staffRoleTarget,
  ]);

  const confirmStaffRoleRevoke = useCallback((emailInput?: string | null, roleInput?: PlatformStaffManagementRole) => {
    const email = (emailInput ?? staffRoleEmail).trim().toLowerCase();
    const role = roleInput ?? staffRoleTarget;
    if (!email) {
      setAdminOpsNotice("Enter an email before removing a staff role.");
      return;
    }

    setRoleConfirm({
      kind: "revoke_role",
      email,
      role,
      title: "Remove Staff Role",
      body: `Remove ${formatPlatformRoleDisplayLabel(role)} from ${maskOperatorIdentity(email)}. This writes backed staff role audit and cannot remove a protected Owner flow from this panel.`,
    });
  }, [staffRoleEmail, staffRoleTarget]);

  const loadStaffPermissionSet = useCallback(async (emailInput?: string | null, seedKeys?: readonly PlatformStaffPermissionKey[]) => {
    const email = (emailInput ?? staffPermissionEmail).trim().toLowerCase();
    if (staffPermissionBusy) return;
    if (!canManageStaffPermissions) {
      setAdminOpsNotice("Scoped permission details are Owner-only. Admins can see role-management status but cannot load another staff member's permission set.");
      return;
    }
    if (!email) {
      setAdminOpsNotice("Enter an Admin or Moderator email before loading scoped permissions.");
      return;
    }

    try {
      setStaffPermissionBusy("load");
      setAdminOpsNotice(null);
      setStaffPermissionEmail(email);
      const permissions = seedKeys ? sortPermissionKeys(seedKeys) : await readPlatformStaffPermissionsByEmail({ email });
      setStaffPermissionSavedKeys(permissions);
      setStaffPermissionSelectedKeys(permissions);
      setStaffPermissionLoadedEmail(email);
      setAdminOpsNotice(`Loaded ${permissions.length} scoped permissions for ${maskOperatorIdentity(email)}.`);
    } catch (err: any) {
      setStaffPermissionSavedKeys(null);
      setStaffPermissionSelectedKeys([]);
      setStaffPermissionLoadedEmail("");
      setAdminOpsNotice(formatAdminOperationFailure(err, "Failed to load staff permissions."));
    } finally {
      setStaffPermissionBusy(null);
    }
  }, [
    canManageStaffPermissions,
    staffPermissionBusy,
    staffPermissionEmail,
  ]);

  const toggleStaffPermissionDraft = useCallback((permissionKey: PlatformStaffPermissionKey) => {
    if (staffPermissionBusy !== null || !canManageStaffPermissions) return;
    setStaffPermissionSelectedKeys((current) => (
      current.includes(permissionKey)
        ? current.filter((key) => key !== permissionKey)
        : sortPermissionKeys([...current, permissionKey])
    ));
  }, [canManageStaffPermissions, staffPermissionBusy]);

  const resetStaffPermissionDraft = useCallback(() => {
    if (staffPermissionSavedKeys === null) return;
    setStaffPermissionSelectedKeys(staffPermissionSavedKeys);
  }, [staffPermissionSavedKeys]);

  const queueStaffPermissionSave = useCallback(() => {
    const email = staffPermissionEmail.trim().toLowerCase();
    if (!canManageStaffPermissions) {
      setAdminOpsNotice("Only Owner can save scoped staff permission sets.");
      return;
    }
    if (!email || email !== staffPermissionLoadedEmail || staffPermissionSavedKeys === null) {
      setAdminOpsNotice("Load the current backed permission set before saving changes.");
      return;
    }
    if (!staffPermissionDraftChanged) {
      setAdminOpsNotice("No scoped permission changes are selected.");
      return;
    }
    if (staffPermissionReason.trim().length < 6) {
      setAdminOpsNotice("Audit reason is required before saving permission changes.");
      return;
    }

    setRoleConfirm({
      kind: "save_permissions",
      email,
      selectedPermissions: sortPermissionKeys(staffPermissionSelectedKeys),
      title: "Save Permission Set",
      body: `${staffPermissionGrantDelta.length} permissions will be granted and ${staffPermissionRevokeDelta.length} will be revoked for ${maskOperatorIdentity(email)}.`,
    });
  }, [
    canManageStaffPermissions,
    staffPermissionDraftChanged,
    staffPermissionEmail,
    staffPermissionGrantDelta.length,
    staffPermissionLoadedEmail,
    staffPermissionReason,
    staffPermissionRevokeDelta.length,
    staffPermissionSavedKeys,
    staffPermissionSelectedKeys,
  ]);

  const applyStaffPermissionSave = useCallback(async () => {
    if (!roleConfirm || roleConfirm.kind !== "save_permissions" || staffPermissionBusy) return;
    try {
      setStaffPermissionBusy("save");
      setAdminOpsNotice(null);
      const result = await updatePlatformStaffPermissionsByEmail({
        email: roleConfirm.email,
        expiresAt: staffPermissionExpiresAt.trim() || null,
        permissionKeys: roleConfirm.selectedPermissions,
        reason: staffPermissionReason.trim(),
      });
      setStaffPermissionSavedKeys(result.newPermissions);
      setStaffPermissionSelectedKeys(result.newPermissions);
      setStaffPermissionLoadedEmail(result.email);
      setStaffPermissionReason("");
      setRoleConfirm(null);
      setAdminOpsNotice(
        `Saved ${result.newPermissions.length} scoped permissions for ${maskOperatorIdentity(result.email)}; audit written.`,
      );
      await refreshStaffRoleState();
    } catch (err: any) {
      setAdminOpsNotice(formatAdminOperationFailure(err, "Failed to save staff permissions."));
    } finally {
      setStaffPermissionBusy(null);
    }
  }, [
    refreshStaffRoleState,
    roleConfirm,
    staffPermissionBusy,
    staffPermissionExpiresAt,
    staffPermissionReason,
  ]);

  const applyRoleConfirmation = useCallback(async () => {
    if (!roleConfirm) return;
    if (roleConfirm.kind === "revoke_role") {
      await runStaffRoleRevoke(roleConfirm.email, roleConfirm.role);
      setRoleConfirm(null);
      return;
    }
    await applyStaffPermissionSave();
  }, [applyStaffPermissionSave, roleConfirm, runStaffRoleRevoke]);

  const toDbPatch = useCallback(
    (patch: Partial<TitleRow>): Record<string, any> => {
      const payload: Record<string, any> = {};

      if (patch.title !== undefined) payload.title = patch.title;
      if (patch.category !== undefined) payload.category = patch.category;
      if (patch.year !== undefined) payload.year = patch.year;
      if (patch.runtime !== undefined) payload.runtime = patch.runtime;
      if (patch.synopsis !== undefined) payload.synopsis = patch.synopsis;
      if (patch.poster_url !== undefined) payload.poster_url = patch.poster_url;
      if (patch.video_url !== undefined) payload.video_url = patch.video_url;
      if (patch.featured !== undefined) payload.featured = patch.featured;
      if (patch.is_published !== undefined) payload.is_published = patch.is_published;
      if (patch.sort_order !== undefined) payload.sort_order = patch.sort_order;

      if (patch.thumbnail_url !== undefined && capabilities.thumbnailCol) {
        payload[capabilities.thumbnailCol] = patch.thumbnail_url;
      }
      if (patch.preview_video_url !== undefined && capabilities.previewCol) {
        payload[capabilities.previewCol] = patch.preview_video_url;
      }
      if (patch.is_hero !== undefined && capabilities.heroCol) {
        payload[capabilities.heroCol] = patch.is_hero;
      }
      if (patch.is_trending !== undefined && capabilities.trendingCol) {
        payload[capabilities.trendingCol] = patch.is_trending;
      }
      if (patch.pin_to_top_row !== undefined && capabilities.topRowCol) {
        payload[capabilities.topRowCol] = patch.pin_to_top_row;
      }
      if (patch.status !== undefined && capabilities.statusCol) {
        payload[capabilities.statusCol] = patch.status;
      }
      if (patch.release_at !== undefined && capabilities.releaseCol) {
        payload[capabilities.releaseCol] = patch.release_at;
      }
      if (patch.content_access_rule !== undefined && capabilities.contentAccessCol) {
        payload[capabilities.contentAccessCol] = normalizeTitleAccessRule(patch.content_access_rule);
      }
      if (patch.ads_enabled !== undefined && capabilities.adsEnabledCol) {
        payload[capabilities.adsEnabledCol] = !!patch.ads_enabled;
      }
      if (patch.sponsor_placement !== undefined && capabilities.sponsorPlacementCol) {
        payload[capabilities.sponsorPlacementCol] = normalizeSponsorPlacement(patch.sponsor_placement);
      }
      if (patch.sponsor_label !== undefined && capabilities.sponsorLabelCol) {
        payload[capabilities.sponsorLabelCol] = patch.sponsor_label;
      }

      return payload;
    },
    [capabilities],
  );

  const loadTitles = useCallback(async () => {
    try {
      setLoading(true);
      setTitlesConnected(false);
      setNotice(null);

      const detected = await detectCapabilities();
      setCapabilities(detected);

      const selectParts = new Set<string>(BASE_SELECT.split(","));
      if (detected.heroCol) selectParts.add(detected.heroCol);
      if (detected.trendingCol) selectParts.add(detected.trendingCol);
      if (detected.topRowCol) selectParts.add(detected.topRowCol);
      if (detected.statusCol) selectParts.add(detected.statusCol);
      if (detected.releaseCol) selectParts.add(detected.releaseCol);
      if (detected.thumbnailCol) selectParts.add(detected.thumbnailCol);
      if (detected.previewCol) selectParts.add(detected.previewCol);
      if (detected.contentAccessCol) selectParts.add(detected.contentAccessCol);
      if (detected.adsEnabledCol) selectParts.add(detected.adsEnabledCol);
      if (detected.sponsorPlacementCol) selectParts.add(detected.sponsorPlacementCol);
      if (detected.sponsorLabelCol) selectParts.add(detected.sponsorLabelCol);

      const query = await supabase
        .from("titles")
        .select(Array.from(selectParts).join(","))
        .order("sort_order", { ascending: true });

      if (query.error) throw query.error;

      const rows = ((query.data as Record<string, any>[] | null) ?? []).map(canonicalizeRow);
      setTitles(normalizeRows(rows));
      setTitlesConnected(true);
      setContentLastRefreshedAt(new Date().toISOString());
    } catch (err: any) {
      setTitlesConnected(false);
      setNotice({ type: "error", text: formatAdminOperationFailure(err, "Failed to load titles.") });
    } finally {
      setLoading(false);
    }
  }, [detectCapabilities]);

  const updateExperienceConfig = useCallback((updater: (prev: AppConfig) => AppConfig) => {
    setExperienceConfig((prev) => updater(prev));
  }, []);

  const loadCreatorGrantTarget = useCallback(async () => {
    if (!canAccessContentProgramming) {
      setNotice({ type: "error", text: "Active owner or operator role required to load creator grants." });
      return;
    }

    const targetUserId = creatorGrantUserId.trim();
    if (!targetUserId) {
      setCreatorGrantForm(normalizeCreatorPermissionSet(null));
      return;
    }

    try {
      setCreatorGrantLoading(true);
      const resolved = await readCreatorPermissions(targetUserId);
      setCreatorGrantForm(resolved);
      setNotice({ type: "success", text: `Loaded creator grants for ${targetUserId}.` });
    } catch (err: any) {
      setCreatorGrantForm(normalizeCreatorPermissionSet(null, targetUserId));
      setNotice({ type: "error", text: formatAdminOperationFailure(err, "Unable to load creator grants.") });
    } finally {
      setCreatorGrantLoading(false);
    }
  }, [canAccessContentProgramming, creatorGrantUserId]);

  const saveCreatorGrantTarget = useCallback(async () => {
    if (!canAccessContentProgramming) {
      setNotice({ type: "error", text: "Active owner or operator role required to save creator grants." });
      return;
    }

    const targetUserId = creatorGrantUserId.trim();
    if (!targetUserId) {
      setNotice({ type: "error", text: "Enter a creator user id before saving grants." });
      return;
    }

    setContentConfirm({
      kind: "creator_grants",
      title: "Save Creator Grants",
      body: `Creator monetization grants for ${formatCompactIdentifier(targetUserId)} affect which backed premium, Party Pass, sponsor, and player-ad defaults can stay enabled.`,
      actionLabel: "Save Grants",
      tone: "manual",
    });
    setContentConfirmReason("");
  }, [canAccessContentProgramming, creatorGrantUserId]);

  const runCreatorGrantSave = useCallback(async (reason: string) => {
    const targetUserId = creatorGrantUserId.trim();
    if (!targetUserId) {
      setNotice({ type: "error", text: "Enter a creator user id before saving grants." });
      return;
    }

    try {
      setCreatorGrantSaving(true);
      await saveAdminCreatorGrantsRpc({ targetUserId, grants: creatorGrantForm, reason });
      const saved = await readCreatorPermissions(targetUserId);
      setCreatorGrantForm(saved);
      setNotice({ type: "success", text: `Creator grants saved for ${targetUserId}. Audit written.` });
      await loadContentAuditEvents();
    } catch (err: any) {
      setNotice({ type: "error", text: formatAdminOperationFailure(err, "Unable to save creator grants.") });
    } finally {
      setCreatorGrantSaving(false);
    }
  }, [creatorGrantForm, creatorGrantUserId, loadContentAuditEvents]);

  const moveRail = useCallback((railKey: HomeRailKey, direction: -1 | 1) => {
    updateExperienceConfig((prev) => {
      const nextOrder = [...prev.home.railOrder];
      const currentIndex = nextOrder.indexOf(railKey);
      if (currentIndex < 0) return prev;
      const targetIndex = currentIndex + direction;
      if (targetIndex < 0 || targetIndex >= nextOrder.length) return prev;
      const [entry] = nextOrder.splice(currentIndex, 1);
      nextOrder.splice(targetIndex, 0, entry);
      return {
        ...prev,
        home: {
          ...prev.home,
          railOrder: nextOrder,
        },
      };
    });
  }, [updateExperienceConfig]);

  const saveExperienceConfigChanges = useCallback(async () => {
    if (!canAccessContentProgramming) {
      setNotice({ type: "error", text: "Active owner or operator role required to save global config." });
      return;
    }

    if (stringifyConfig(experienceConfig) === stringifyConfig(savedExperienceConfig)) {
      setNotice({ type: "success", text: "No unsaved Content config changes to save." });
      return;
    }

    setContentConfirm({
      kind: "save_config",
      title: "Save Public Programming Config",
      body: "This can change homepage presentation, hero strategy, rail order, feature visibility, monetization copy, and room defaults. The save will use the backend Content RPC and write immutable audit.",
      actionLabel: "Save Config",
      tone: "manual",
    });
    setContentConfirmReason("");
  }, [canAccessContentProgramming, experienceConfig, savedExperienceConfig]);

  const runExperienceConfigSave = useCallback(async (reason: string) => {
    if (!canAccessContentProgramming) {
      setNotice({ type: "error", text: "Active owner or operator role required to save global config." });
      return;
    }

    try {
      setConfigSaving(true);
      const { nextConfig, adjustments } = applyExperienceConfigGuardrails(experienceConfig, titles);
      const result = await saveAdminContentConfigRpc(nextConfig, reason);
      const saved = normalizeAppConfig(result?.config ?? nextConfig);
      setExperienceConfig(saved);
      setSavedExperienceConfig(saved);
      setAppConfigConnected(true);
      setAppConfigSource("app_configurations");
      setAppConfigSavedAt(result?.updatedAt ?? new Date().toISOString());
      setNotice({
        type: "success",
        text: adjustments.length > 0
          ? `Experience config saved with audit. ${adjustments.join("; ")}.`
          : "Experience config saved with audit.",
      });
      await loadContentAuditEvents();
    } catch (err: any) {
      setNotice({ type: "error", text: formatAdminOperationFailure(err, "Failed to save experience config.") });
    } finally {
      setConfigSaving(false);
    }
  }, [canAccessContentProgramming, experienceConfig, loadContentAuditEvents, titles]);

  const openCreate = useCallback(() => {
    if (!canAccessContentProgramming) {
      setNotice({ type: "error", text: "Active owner or operator role required to create platform titles." });
      return;
    }
    const nextSort = titles.reduce((acc, item) => Math.max(acc, item.sort_order ?? 0), 0) + 1;
    setEditorMode("create");
    setForm({
      title: "",
      category: "Drama",
      year: "",
      runtime: "",
      synopsis: "",
      poster_url: "",
      thumbnail_url: "",
      video_url: "",
      preview_video_url: "",
      featured: false,
      is_hero: false,
      is_trending: false,
      pin_to_top_row: false,
      status: "draft",
      release_at: "",
      sort_order: String(nextSort),
      content_access_rule: "open",
      ads_enabled: false,
      sponsor_placement: "none",
      sponsor_label: "",
    });
    setEditorVisible(true);
  }, [canAccessContentProgramming, titles]);

  const openEdit = useCallback((item: TitleRow) => {
    const publicationState = normalizePublicationState({
      status: normalizeStatus(item.status, item.is_published),
      releaseAt: item.release_at ?? null,
      hasStatusControl,
      hasReleaseControl,
    });

    setEditorMode("edit");
    setForm({
      id: item.id,
      title: item.title ?? "",
      category: item.category ?? "",
      year: item.year != null ? String(item.year) : "",
      runtime: item.runtime ?? "",
      synopsis: item.synopsis ?? "",
      poster_url: item.poster_url ?? "",
      thumbnail_url: item.thumbnail_url ?? "",
      video_url: item.video_url ?? "",
      preview_video_url: item.preview_video_url ?? "",
      featured: item.featured === true,
      is_hero: item.is_hero === true,
      is_trending: item.is_trending === true,
      pin_to_top_row: item.pin_to_top_row === true,
      status: publicationState.status,
      release_at: toDatetimeLocalValue(publicationState.releaseAt),
      sort_order: item.sort_order != null ? String(item.sort_order) : "0",
      content_access_rule: normalizeTitleAccessRule(item.content_access_rule),
      ads_enabled: item.ads_enabled === true,
      sponsor_placement: normalizeSponsorPlacement(item.sponsor_placement),
      sponsor_label: item.sponsor_label ?? "",
    });
    setEditorVisible(true);
  }, [hasReleaseControl, hasStatusControl]);

  const queueTitleProgrammingAction = useCallback((
    item: TitleRow,
    actionType: ContentProgrammingActionType,
    patch: Partial<TitleRow>,
    successText: string,
  ) => {
    if (!canAccessContentProgramming) {
      setNotice({ type: "error", text: "Active owner or operator role required to update platform titles." });
      return;
    }

    const riskyActions = new Set<ContentProgrammingActionType>([
      "set_hero",
      "remove_hero",
      "publish",
      "unpublish",
      "archive",
      "restore",
    ]);

    setContentConfirm({
      kind: "title_action",
      title: contentActionLabels[actionType],
      body: `${item.title || "Untitled"} will receive a backed Content programming action. Public-impacting changes require this reason and write immutable audit.`,
      actionLabel: contentActionLabels[actionType],
      tone: riskyActions.has(actionType) ? "danger" : "manual",
      titleId: item.id,
      actionType,
      patch,
      successText,
    });
    setContentConfirmReason("");
  }, [canAccessContentProgramming]);

  const runTitleProgrammingAction = useCallback(async (
    pending: Extract<ContentConfirmState, { kind: "title_action" }>,
    reason: string,
  ) => {
    if (!canAccessContentProgramming) {
      setNotice({ type: "error", text: "Active owner or operator role required to update platform titles." });
      return;
    }

    try {
      setSaving(true);
      const payload = toDbPatch(pending.patch);
      await applyAdminTitleProgrammingActionRpc({
        actionType: pending.actionType,
        patch: payload,
        reason,
        titleId: pending.titleId,
      });
      await loadTitles();
      await loadContentAuditEvents();
      setNotice({ type: "success", text: `${pending.successText} Audit written.` });
    } catch (err: any) {
      setNotice({ type: "error", text: formatAdminOperationFailure(err, "Update failed.") });
    } finally {
      setSaving(false);
    }
  }, [canAccessContentProgramming, loadContentAuditEvents, loadTitles, toDbPatch]);

  const patchTitle = useCallback((id: TitleId, patch: Partial<TitleRow>, successText: string) => {
    const item = titles.find((entry) => toIdString(entry.id) === toIdString(id));
    if (!item) {
      setNotice({ type: "error", text: "Content not found or no longer available." });
      return;
    }
    let actionType: ContentProgrammingActionType = "update_title";
    if (patch.featured !== undefined) actionType = patch.featured ? "feature" : "unfeature";
    else if (patch.pin_to_top_row !== undefined) actionType = patch.pin_to_top_row ? "pin_top_row" : "unpin_top_row";
    else if (patch.is_trending !== undefined) actionType = patch.is_trending ? "trend" : "untrend";
    else if (patch.status === "published" || patch.is_published === true) actionType = "publish";
    else if (patch.status === "draft" || patch.is_published === false) actionType = "unpublish";
    else if (typeof patch.sort_order === "number" && patch.sort_order > (item.sort_order ?? 0)) actionType = "sort_increment";
    else if (patch.sort_order !== undefined) actionType = "sort_decrement";
    queueTitleProgrammingAction(item, actionType, patch, successText);
  }, [queueTitleProgrammingAction, titles]);

  const setHeroExclusive = useCallback((item: TitleRow) => {
    if (!capabilities.heroCol) {
      setNotice({ type: "error", text: "Hero control is unavailable for this schema." });
      return;
    }
    queueTitleProgrammingAction(item, "set_hero", {}, `${item.title} is now Home Hero.`);
  }, [capabilities.heroCol, queueTitleProgrammingAction]);

  const saveEditor = useCallback(() => {
    if (!canAccessContentProgramming) {
      setNotice({ type: "error", text: "Active owner or operator role required to save platform titles." });
      return;
    }

    if (!form.title.trim()) {
      Alert.alert("Title required", "Please enter a title before saving.");
      return;
    }

    if (!form.video_url.trim() && editorMode === "create") {
      Alert.alert("Video URL required", "Please add a playable video URL to preview content in app.");
      return;
    }

    setContentConfirm({
      kind: "save_editor",
      title: editorMode === "create" ? "Create Platform Title" : "Save Title Changes",
      body: editorMode === "create"
        ? "This creates a backed platform title row and writes immutable content audit."
        : "This updates backed title programming, visibility, scheduling, and monetization fields where supported, then writes immutable content audit.",
      actionLabel: editorMode === "create" ? "Create Title" : "Save Title",
      tone: form.status === "published" || form.is_hero ? "danger" : "manual",
    });
    setContentConfirmReason("");
  }, [canAccessContentProgramming, editorMode, form.is_hero, form.status, form.title, form.video_url]);

  const runEditorSave = useCallback(async (reason: string) => {
    if (!canAccessContentProgramming) {
      setNotice({ type: "error", text: "Active owner or operator role required to save platform titles." });
      return;
    }

    const yearNum = form.year.trim() ? Number.parseInt(form.year.trim(), 10) : null;
    const sortOrderNum = form.sort_order.trim() ? Number.parseInt(form.sort_order.trim(), 10) : null;
    const publicationState = normalizePublicationState({
      status: hasStatusControl ? normalizeStatus(form.status, form.status === "published") : "draft",
      releaseAt: hasReleaseControl ? fromDatetimeLocalValue(form.release_at) : null,
      hasStatusControl,
      hasReleaseControl,
    });

    const operatorPermissions = await readCreatorPermissions().catch(() => normalizeCreatorPermissionSet(null));
    const sanitizedMonetization = sanitizeCreatorTitleMonetization({
      contentAccessRule: form.content_access_rule,
      adsEnabled: form.ads_enabled,
      sponsorPlacement: form.sponsor_placement,
      sponsorLabel: form.sponsor_label.trim() || null,
      permissions: operatorPermissions,
    });

    let payload: Record<string, any> = {
      title: form.title.trim(),
      category: form.category.trim() || null,
      year: Number.isNaN(yearNum as number) ? null : yearNum,
      runtime: form.runtime.trim() || null,
      synopsis: form.synopsis.trim() || null,
      poster_url: form.poster_url.trim() || null,
      video_url: form.video_url.trim() || null,
      featured: !!form.featured,
      is_published: publicationState.isPublished,
      sort_order: Number.isNaN(sortOrderNum as number) ? null : sortOrderNum,
    };

    payload = {
      ...payload,
      ...toDbPatch({
        thumbnail_url: form.thumbnail_url.trim() || null,
        preview_video_url: form.preview_video_url.trim() || null,
        is_hero: !!form.is_hero,
        is_trending: !!form.is_trending,
        pin_to_top_row: !!form.pin_to_top_row,
        status: publicationState.status,
        release_at: publicationState.releaseAt,
        content_access_rule: sanitizedMonetization.contentAccessRule,
        ads_enabled: sanitizedMonetization.adsEnabled,
        sponsor_placement: sanitizedMonetization.sponsorPlacement,
        sponsor_label: sanitizedMonetization.sponsorLabel,
      }),
    };

    try {
      setSaving(true);
      if (editorMode !== "create" && !form.id) throw new Error("Missing title id.");
      await applyAdminTitleProgrammingActionRpc({
        actionType: editorMode === "create" ? "create_title" : form.is_hero ? "set_hero" : "update_title",
        patch: payload,
        reason,
        titleId: editorMode === "create" ? null : form.id ?? null,
      });
      setNotice({
        type: "success",
        text: publicationState.adjustments.length > 0
          ? `Title ${editorMode === "create" ? "created" : "updated"} with audit. ${publicationState.adjustments.join("; ")}.`
          : `Title ${editorMode === "create" ? "created" : "updated"} with audit.`,
      });

      setEditorVisible(false);
      await loadTitles();
      await loadContentAuditEvents();
    } catch (err: any) {
      setNotice({ type: "error", text: formatAdminOperationFailure(err, "Save failed.") });
    } finally {
      setSaving(false);
    }
  }, [canAccessContentProgramming, editorMode, form, hasReleaseControl, hasStatusControl, loadContentAuditEvents, loadTitles, toDbPatch]);

  const refreshAdminHome = useCallback(async () => {
    if (!canAccessAdmin) return;

    const tasks: Promise<unknown>[] = [loadPlatformRoles()];

    if (canReviewSafetyReports) tasks.push(loadSafetyReports());
    if (canAccessDmca) tasks.push(loadDmcaCases());
    if (canManagePrivilegedWrites) {
      tasks.push(
        loadExperienceConfig(),
        loadAdminV1ReadModel(),
        loadAdminFinanceReadModel(),
        loadAdminImmutableAuditReadModel(),
      );
    }
    if (canManagePrivilegedWrites || canReviewSafetyReports || canViewStaffRoles) tasks.push(loadStaffAndAuditVisibility());
    if (canAccessLiveOps) {
      tasks.push(
        loadLiveCostGuard(),
        loadLiveOpsFixCenter(),
      );
    }

    await Promise.all(tasks);
  }, [
    canAccessAdmin,
    canAccessDmca,
    canAccessLiveOps,
    canManagePrivilegedWrites,
    canReviewSafetyReports,
    canViewStaffRoles,
    loadAdminFinanceReadModel,
    loadAdminImmutableAuditReadModel,
    loadAdminV1ReadModel,
    loadDmcaCases,
    loadExperienceConfig,
    loadLiveCostGuard,
    loadLiveOpsFixCenter,
    loadPlatformRoles,
    loadSafetyReports,
    loadStaffAndAuditVisibility,
  ]);

  const refreshAdminContent = useCallback(async () => {
    if (!canAccessContentProgramming) return;
    await Promise.all([
      loadTitles(),
      loadExperienceConfig(),
      loadContentAuditEvents(),
    ]);
    setContentLastRefreshedAt(new Date().toISOString());
  }, [canAccessContentProgramming, loadContentAuditEvents, loadExperienceConfig, loadTitles]);

  const renderContentProgrammingCenter = () => (
    <>
      <View style={styles.contentHeroPanel}>
        <View style={styles.ownerPanelTitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.ownerPanelKicker}>CONTENT PROGRAMMING</Text>
            <Text style={styles.ownerPanelTitle}>Content Programming</Text>
            <Text style={styles.ownerPanelSubtitle}>
              Control homepage presentation, rails, titles, and launch programming with backed save flows.
            </Text>
          </View>
          <OwnerStatusPill label={contentCommandStatus.label} tone={contentCommandStatus.tone} />
        </View>
        <Text style={styles.ownerPanelMeta}>{contentCommandStatus.body}</Text>
        <View style={styles.contentHeroPills}>
          <OwnerStatusPill label={`Operator ${formatModerationToken(resolvedActorRole)}`} tone={canAccessContentProgramming ? "info" : "locked"} />
          <OwnerStatusPill label={appConfigConnected ? "Config Backed" : "Config Not Connected"} tone={appConfigConnected ? "success" : "locked"} />
          <OwnerStatusPill label={contentConfigDirty ? "Unsaved Draft" : "Saved State"} tone={contentConfigDirty ? "manual" : "success"} />
          <OwnerStatusPill label={contentAuditConnected ? "Audit Feed Connected" : "Audit Feed Not Connected"} tone={contentAuditConnected ? "success" : "locked"} />
        </View>
        <View style={styles.ownerPanelActions}>
          <TouchableOpacity
            style={[styles.adminHomeRefreshButton, contentLoading && styles.configSaveBtnDisabled]}
            onPress={() => void refreshAdminContent()}
            disabled={contentLoading}
          >
            {contentLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.adminHomeRefreshText}>Refresh</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.configSaveBtn,
              { backgroundColor: themePalette.accent },
              (!contentConfigDirty || configSaving || configLoading || !canAccessContentProgramming) && styles.configSaveBtnDisabled,
            ]}
            onPress={saveExperienceConfigChanges}
            disabled={!contentConfigDirty || configSaving || configLoading || !canAccessContentProgramming}
          >
            {configSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.configSaveBtnText}>Save Config</Text>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.orderBtn, (!contentConfigDirty || configSaving) && styles.configSaveBtnDisabled]}
            onPress={() => {
              setExperienceConfig(savedExperienceConfig);
              setNotice({ type: "success", text: "Content draft reset to the saved config." });
            }}
            disabled={!contentConfigDirty || configSaving}
          >
            <Text style={styles.orderBtnText}>Reset Draft</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.ownerPanelMeta}>
          {contentLastCheckedAt ? `Last Checked ${formatModerationTimestamp(contentLastCheckedAt)}` : "Last Checked Not Connected"}
          {appConfigSavedAt ? ` · Last Saved ${formatModerationTimestamp(appConfigSavedAt)}` : " · Last Saved Not Connected"}
          {appConfigSource ? ` · Source ${formatProgrammingToken(appConfigSource)}` : ""}
        </Text>
      </View>

      <View style={styles.adminHomeMetricGrid}>
        {contentSnapshotTiles.map((tile) => (
          <View key={tile.label} style={[styles.adminHomeMetricTile, ownerMetricToneStyle(tile.tone)]}>
            <View style={styles.adminHomeTileHeader}>
              <Text style={styles.adminHomeTileLabel}>{tile.label}</Text>
              <OwnerStatusPill label={tile.qualifier} tone={tile.tone} />
            </View>
            <Text style={styles.adminHomeTileValue}>{tile.value}</Text>
            <Text style={styles.adminHomeTileBody}>{tile.body}</Text>
          </View>
        ))}
      </View>

      <View style={styles.contentPanel}>
        <View style={styles.ownerSectionHeaderRow}>
          <Text style={styles.ownerSectionTitle}>Theme Preset Gallery</Text>
          <OwnerStatusPill label="Backed Config" tone={appConfigConnected ? "success" : "locked"} />
        </View>
        <View style={styles.themePresetGrid}>
          {themePresetOptions.map((preset) => {
            const palette = getThemePresetPalette(preset.key);
            const isSaved = savedExperienceConfig.theme.preset === preset.key;
            const isSelected = experienceConfig.theme.preset === preset.key;
            const isUnsaved = isSelected && !isSaved;
            return (
              <TouchableOpacity
                key={preset.key}
                style={[
                  styles.themePresetTile,
                  isSelected && styles.themePresetTileSelected,
                  isUnsaved && styles.themePresetTileUnsaved,
                ]}
                onPress={() =>
                  updateExperienceConfig((prev) => ({
                    ...prev,
                    theme: { ...prev.theme, preset: preset.key },
                  }))
                }
              >
                <View style={[styles.themePresetSwatch, { backgroundColor: palette.accent }]}>
                  <View style={[styles.themePresetSwatchInner, { backgroundColor: palette.surfaceTint }]} />
                </View>
                <Text style={styles.themePresetTitle}>{preset.label}</Text>
                <Text style={styles.themePresetCue}>{preset.cue}</Text>
                <Text style={styles.themePresetBody} numberOfLines={2}>{preset.body}</Text>
                <View style={styles.badgesRow}>
                  {isSaved ? <OwnerStatusPill label="Saved" tone="success" /> : null}
                  {isUnsaved ? <OwnerStatusPill label="Unsaved" tone="manual" /> : null}
                  {!isSaved && !isUnsaved ? <OwnerStatusPill label="Preview" tone="info" /> : null}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <View style={styles.contentSegmentRow}>
          {backgroundModeOptions.map((mode) => (
            <TouchableOpacity
              key={mode.key}
              style={[styles.contentSegment, experienceConfig.theme.backgroundMode === mode.key && styles.contentSegmentActive]}
              onPress={() =>
                updateExperienceConfig((prev) => ({
                  ...prev,
                  theme: { ...prev.theme, backgroundMode: mode.key },
                }))
              }
            >
              <Text style={[styles.contentSegmentText, experienceConfig.theme.backgroundMode === mode.key && styles.contentSegmentTextActive]}>{mode.label}</Text>
              <Text style={styles.contentSegmentBody}>{mode.body}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.contentPanel}>
        <View style={styles.ownerSectionHeaderRow}>
          <Text style={styles.ownerSectionTitle}>Homepage Programming Console</Text>
          <OwnerStatusPill label={titlesConnected ? "Backed Titles" : "Not Connected"} tone={titlesConnected ? "success" : "locked"} />
        </View>
        <Text style={styles.configHint}>Hero and Top Picks resolve against real title rows. Unbacked sources are shown as fallbacks, not fake confidence.</Text>
        <Text style={styles.sectionLabel}>Hero Strategy</Text>
        <View style={styles.contentSegmentRow}>
          {(["latest", "hero_flag", "manual_title"] as const).map((heroMode) => (
            <TouchableOpacity
              key={heroMode}
              style={[styles.contentSegment, experienceConfig.home.heroMode === heroMode && styles.contentSegmentActive]}
              onPress={() =>
                updateExperienceConfig((prev) => ({
                  ...prev,
                  home: {
                    ...prev.home,
                    heroMode,
                    manualHeroTitleId: heroMode === "manual_title" ? prev.home.manualHeroTitleId : null,
                  },
                }))
              }
            >
              <Text style={[styles.contentSegmentText, experienceConfig.home.heroMode === heroMode && styles.contentSegmentTextActive]}>
                {formatProgrammingToken(heroMode)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {experienceConfig.home.heroMode === "manual_title" ? (
          <View style={styles.contentSubPanel}>
            <TextInput
              style={styles.input}
              placeholder="Search titles, category, or status"
              placeholderTextColor="#8d8d8d"
              value={manualHeroQuery}
              onChangeText={setManualHeroQuery}
            />
            {manualHeroSelection.selectedTitle ? (
              <OwnerControlRow
                expanded
                message={`${manualHeroSelection.selectedTitle.category ?? "Uncategorized"} · ${normalizeStatus(
                  manualHeroSelection.selectedTitle.status,
                  manualHeroSelection.selectedTitle.is_published,
                ).toUpperCase()} · Sort ${manualHeroSelection.selectedTitle.sort_order ?? "not set"}`}
                statusLabel="Selected"
                title={`Manual target: ${manualHeroSelection.selectedTitle.title}`}
                tone="success"
              />
            ) : (
              <OwnerDisabledReason reason="Manual Title requires a real title target before save; guardrails will normalize it otherwise." />
            )}
            {manualHeroSelection.visibleTitles.slice(0, 8).map((item) => {
              const isSelected = manualHeroSelection.selectedId.length > 0 && hasTitleId(item, manualHeroSelection.selectedId);
              return (
                <OwnerControlRow
                  key={toIdString(item.id)}
                  message={`${item.category ?? "Uncategorized"} · ${normalizeStatus(item.status, item.is_published).toUpperCase()}`}
                  statusLabel={isSelected ? "Selected" : "Choose"}
                  title={item.title || "Untitled"}
                  tone={isSelected ? "success" : "info"}
                  onPress={() => {
                    updateExperienceConfig((prev) => ({
                      ...prev,
                      home: { ...prev.home, manualHeroTitleId: String(item.id) },
                    }));
                    setManualHeroQuery("");
                  }}
                />
              );
            })}
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Top Picks Source</Text>
        <View style={styles.contentSegmentRow}>
          {(["recent", "top_row", "featured", "trending"] as const).map((source) => (
            <TouchableOpacity
              key={source}
              style={[styles.contentSegment, experienceConfig.home.topPicksSource === source && styles.contentSegmentActive]}
              onPress={() =>
                updateExperienceConfig((prev) => ({
                  ...prev,
                  home: { ...prev.home, topPicksSource: source },
                }))
              }
            >
              <Text style={[styles.contentSegmentText, experienceConfig.home.topPicksSource === source && styles.contentSegmentTextActive]}>
                {formatProgrammingToken(source)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.dashboardGrid}>
          <OwnerMetricTile label="Resolved Hero" value={programmingSnapshot.resolvedHeroItem?.title || "Not Connected"} tone={programmingSnapshot.resolvedHeroItem ? "success" : "locked"} />
          <OwnerMetricTile label="Hero Source" value={formatProgrammingToken(programmingSnapshot.resolvedHeroSource)} tone="info" />
          <OwnerMetricTile label="Top Picks Backing" value={titlesConnected ? programmingSnapshot.configuredTopPicksCount : "Not Connected"} tone={titlesConnected && programmingSnapshot.configuredTopPicksCount > 0 ? "success" : "manual"} />
          <OwnerMetricTile label="Confidence" value={programmingSnapshot.guardrailAdjustments.length ? "Needs Review" : "Backed"} tone={programmingSnapshot.guardrailAdjustments.length ? "manual" : "success"} />
        </View>
        {programmingSnapshot.guardrailAdjustments.length ? (
          <View style={styles.ownerControlList}>
            {programmingSnapshot.guardrailAdjustments.map((adjustment) => (
              <OwnerDisabledReason key={adjustment} reason={adjustment} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={styles.contentPanel}>
        <View style={styles.ownerSectionHeaderRow}>
          <Text style={styles.ownerSectionTitle}>Homepage Rails Manager</Text>
          <OwnerStatusPill label="Persist On Save" tone={contentConfigDirty ? "manual" : "success"} />
        </View>
        <View style={styles.ownerControlList}>
          {contentRailRows.map((rail) => (
            <View key={rail.key} style={[styles.contentRailRow, !rail.visible && styles.contentRailRowHidden]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ownerRowTitle}>{rail.label}</Text>
                <Text style={styles.ownerRowMessage}>{`Position ${rail.position} · ${rail.visible ? "Visible" : "Hidden"} · ${rail.backing}`}</Text>
                <Text style={styles.ownerRowMeta}>
                  {rail.itemCount === null ? rail.body : `${rail.body} Items ${rail.itemCount}.`}
                </Text>
              </View>
              <View style={styles.configListActions}>
                <TouchableOpacity
                  style={styles.orderBtn}
                  onPress={() =>
                    updateExperienceConfig((prev) => ({
                      ...prev,
                      home: {
                        ...prev.home,
                        enabledRails: {
                          ...prev.home.enabledRails,
                          [rail.key]: !prev.home.enabledRails[rail.key],
                        },
                      },
                    }))
                  }
                >
                  <Text style={styles.orderBtnText}>{rail.visible ? "Hide" : "Show"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.orderBtn} onPress={() => moveRail(rail.key, -1)} disabled={rail.position === 1}>
                  <Text style={styles.orderBtnText}>Up</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.orderBtn} onPress={() => moveRail(rail.key, 1)} disabled={rail.position === contentRailRows.length}>
                  <Text style={styles.orderBtnText}>Down</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
        <View style={styles.inlineInputs}>
          <TextInput
            style={[styles.input, styles.inputHalf]}
            placeholder="Browse rail label"
            placeholderTextColor="#8d8d8d"
            value={experienceConfig.home.browseCategoryLabel}
            onChangeText={(text) =>
              updateExperienceConfig((prev) => ({ ...prev, home: { ...prev.home, browseCategoryLabel: text } }))
            }
          />
          <TextInput
            style={[styles.input, styles.inputHalf]}
            placeholder="Browse category query"
            placeholderTextColor="#8d8d8d"
            value={experienceConfig.home.browseCategoryQuery}
            onChangeText={(text) =>
              updateExperienceConfig((prev) => ({ ...prev, home: { ...prev.home, browseCategoryQuery: text } }))
            }
          />
        </View>
        <TextInput
          style={styles.input}
          placeholder="Max items per rail"
          placeholderTextColor="#8d8d8d"
          keyboardType="numeric"
          value={String(experienceConfig.home.maxItemsPerRail)}
          onChangeText={(text) =>
            updateExperienceConfig((prev) => ({
              ...prev,
              home: { ...prev.home, maxItemsPerRail: Number.parseInt(text || "0", 10) || prev.home.maxItemsPerRail },
            }))
          }
        />
      </View>

      <View style={styles.contentPanel}>
        <View style={styles.ownerSectionHeaderRow}>
          <Text style={styles.ownerSectionTitle}>Title Inventory / Scheduling Board</Text>
          <TouchableOpacity style={styles.actionBtnPrimary} onPress={openCreate}>
            <Text style={styles.actionTextPrimary}>Create Title</Text>
          </TouchableOpacity>
        </View>
        {hasReleaseControl ? (
          <View style={styles.contentSubPanel}>
            <View style={styles.ownerSectionHeaderRow}>
              <Text style={styles.configListTitle}>Upcoming Scheduled Titles</Text>
              <OwnerStatusPill label={scheduledTitleCount === null ? "Not Connected" : `${scheduledTitleCount}`} tone={scheduledTitleCount === null ? "locked" : scheduledTitleCount > 0 ? "manual" : "success"} />
            </View>
            {loading ? (
              <View style={styles.configLoadingRow}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.configLoadingText}>Loading scheduled queue...</Text>
              </View>
            ) : upcomingScheduledSnapshot.visibleItems.length ? (
              upcomingScheduledSnapshot.visibleItems.map(({ item, releaseAt }, index) => (
                <OwnerControlRow
                  key={toIdString(item.id)}
                  message={`Queue #${index + 1} · Publishes ${formatRelease(releaseAt)}`}
                  statusLabel="Scheduled"
                  title={item.title || "Untitled"}
                  tone="manual"
                />
              ))
            ) : (
              <OwnerEmptyState title="No real upcoming scheduled titles" body="Only titles with a valid future release_at appear here." />
            )}
          </View>
        ) : (
          <OwnerDisabledReason reason="Scheduling board is read-only unavailable because release_at/release_date is not connected in this schema." />
        )}

        <View style={styles.searchWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by title, category, or status"
            placeholderTextColor="#9b9b9b"
            style={styles.searchInput}
          />
        </View>
        <View style={styles.filterRow}>
          {([
            { key: "all", label: "All" },
            { key: "published", label: "Published" },
            { key: "scheduled", label: "Scheduled" },
            { key: "draft", label: "Draft" },
            { key: "archived", label: "Archived" },
            { key: "featured", label: "Featured" },
            ...(hasHeroControl ? [{ key: "hero", label: "Hero" } as const] : []),
            ...(hasTrendingControl ? [{ key: "trending", label: "Trending" } as const] : []),
            ...(hasTopRowControl ? [{ key: "top-row", label: "Top Row" } as const] : []),
          ] as const).map((chip) => (
            <TouchableOpacity
              key={chip.key}
              onPress={() => setFilter(chip.key)}
              style={[styles.filterChip, filter === chip.key && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, filter === chip.key && styles.filterChipTextActive]}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          renderSkeleton()
        ) : !titlesConnected ? (
          <OwnerEmptyState title="Title inventory not connected" body="The board will not show zero counts until the titles query succeeds." />
        ) : filteredTitles.length === 0 ? (
          <OwnerEmptyState title="No titles match this view" body="Adjust search or filters to inspect backed title rows." />
        ) : (
          <View style={styles.cardsList}>
            {filteredTitles.map((item) => {
              const status = normalizeStatus(item.status, item.is_published);
              return (
                <View key={toIdString(item.id)} style={styles.contentTitleCard}>
                  <View style={styles.thumbWrap}>
                    <ImageBackground source={getCompactArtSource(item)} style={styles.thumb} resizeMode="cover" />
                  </View>
                  <View style={styles.cardBody}>
                    <View style={styles.cardTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>{item.title || "Untitled"}</Text>
                        <Text style={styles.cardMeta} numberOfLines={1}>
                          {(item.category ?? "Uncategorized").toString()} • {item.year ?? "—"} • {item.runtime ?? "—"}
                        </Text>
                      </View>
                      <TouchableOpacity style={styles.previewBtn} onPress={() => router.push({ pathname: "/player/[id]", params: { id: String(toIdString(item.id)) } })}>
                        <Text style={styles.previewBtnText}>Preview</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.badgesRow}>
                      <View style={[styles.badge, getStatusTone(status)]}><Text style={styles.badgeText}>{status.toUpperCase()}</Text></View>
                      <View style={[styles.badge, item.featured ? styles.badgeOn : styles.badgeOff]}><Text style={styles.badgeText}>{item.featured ? "FEATURED" : "STANDARD"}</Text></View>
                      {hasHeroControl ? <View style={[styles.badge, item.is_hero ? styles.badgeOn : styles.badgeOff]}><Text style={styles.badgeText}>{item.is_hero ? "HERO" : "NOT HERO"}</Text></View> : null}
                      {hasTrendingControl ? <View style={[styles.badge, item.is_trending ? styles.badgeOn : styles.badgeOff]}><Text style={styles.badgeText}>{item.is_trending ? "TRENDING" : "NORMAL"}</Text></View> : null}
                      {hasTopRowControl ? <View style={[styles.badge, item.pin_to_top_row ? styles.badgeOn : styles.badgeOff]}><Text style={styles.badgeText}>{item.pin_to_top_row ? "TOP ROW" : "UNPINNED"}</Text></View> : null}
                      <View style={styles.badge}><Text style={styles.badgeText}>SORT {item.sort_order ?? "—"}</Text></View>
                      {hasReleaseControl ? <View style={styles.badge}><Text style={styles.badgeText}>Release {formatRelease(item.release_at)}</Text></View> : null}
                    </View>
                    <View style={styles.actionsRow}>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => queueTitleProgrammingAction(item, item.featured ? "unfeature" : "feature", {}, item.featured ? "Title unfeatured." : "Title featured.")}>
                        <Text style={styles.actionText}>{item.featured ? "Unfeature" : "Feature"}</Text>
                      </TouchableOpacity>
                      {hasTopRowControl ? (
                        <TouchableOpacity style={styles.actionBtn} onPress={() => queueTitleProgrammingAction(item, item.pin_to_top_row ? "unpin_top_row" : "pin_top_row", {}, item.pin_to_top_row ? "Top row pin removed." : "Title pinned to Top Row.")}>
                          <Text style={styles.actionText}>{item.pin_to_top_row ? "Unpin" : "Pin Top Row"}</Text>
                        </TouchableOpacity>
                      ) : null}
                      {hasTrendingControl ? (
                        <TouchableOpacity style={styles.actionBtn} onPress={() => queueTitleProgrammingAction(item, item.is_trending ? "untrend" : "trend", {}, item.is_trending ? "Trending removed." : "Title marked trending.")}>
                          <Text style={styles.actionText}>{item.is_trending ? "Untrend" : "Trend"}</Text>
                        </TouchableOpacity>
                      ) : null}
                      {hasHeroControl ? (
                        <TouchableOpacity style={styles.actionBtn} onPress={() => queueTitleProgrammingAction(item, item.is_hero ? "remove_hero" : "set_hero", {}, item.is_hero ? "Hero flag removed." : "Title set as Home Hero.")}>
                          <Text style={styles.actionText}>{item.is_hero ? "Remove Hero" : "Set Hero"}</Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity style={styles.actionBtn} onPress={() => queueTitleProgrammingAction(item, "sort_decrement", {}, "Sort order updated.")}>
                        <Text style={styles.actionText}>Sort -</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => queueTitleProgrammingAction(item, "sort_increment", {}, "Sort order updated.")}>
                        <Text style={styles.actionText}>Sort +</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit({ ...item, status })}>
                        <Text style={styles.actionText}>Edit</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={status === "published" ? styles.actionBtn : styles.actionBtnPrimary}
                        onPress={() => queueTitleProgrammingAction(item, status === "published" ? "unpublish" : "publish", {}, status === "published" ? "Title unpublished." : "Title published.")}
                      >
                        <Text style={status === "published" ? styles.actionText : styles.actionTextPrimary}>{status === "published" ? "Unpublish" : "Publish"}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={status === "archived" ? styles.actionBtn : styles.actionBtnDanger}
                        onPress={() => queueTitleProgrammingAction(item, status === "archived" ? "restore" : "archive", {}, status === "archived" ? "Title restored as draft." : "Title archived.")}
                      >
                        <Text style={status === "archived" ? styles.actionText : styles.actionTextDanger}>{status === "archived" ? "Restore" : "Archive"}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.contentPanel}>
        <View style={styles.ownerSectionHeaderRow}>
          <Text style={styles.ownerSectionTitle}>Feature + Monetization Runtime</Text>
          <OwnerStatusPill label="Config Only" tone="info" />
        </View>
        <Text style={styles.configHint}>Feature and monetization controls persist as config. Premium entitlement, RevenueCat, and real ad provider behavior are not changed here.</Text>
        <Text style={styles.sectionLabel}>Feature Toggles</Text>
        <View style={styles.contentSignalGrid}>
          {([
            ["watchPartyEnabled", "Watch Party", "Public UI config"],
            ["communicationEnabled", "Communication", "Public UI config"],
            ["favoritesEnabled", "Favorites", "Public UI config"],
            ["continueWatchingEnabled", "Continue Watching", "Public UI config"],
            ["creatorSettingsEnabled", "Creator Settings", "Public UI config"],
          ] as const).map(([key, label, body]) => (
            <TouchableOpacity
              key={key}
              style={[styles.contentSignalTile, experienceConfig.features[key] && styles.contentSignalTileActive]}
              onPress={() => updateExperienceConfig((prev) => ({ ...prev, features: { ...prev.features, [key]: !prev.features[key] } }))}
            >
              <OwnerStatusPill label={experienceConfig.features[key] ? "Active" : "Inactive"} tone={experienceConfig.features[key] ? "success" : "locked"} />
              <Text style={styles.contentSignalTitle}>{label}</Text>
              <Text style={styles.contentSignalBody}>{body}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.sectionLabel}>Monetization Runtime</Text>
        <View style={styles.contentSignalGrid}>
          {([
            ["premiumEnabled", "Premium", "Config; RevenueCat remains entitlement truth."],
            ["partyPassEnabled", "Party Pass", "Config foundation for later access products."],
            ["sponsorPlacementsEnabled", "Sponsor Placements", "Foundation Only until sponsor execution is backed."],
            ["playerBannerEnabled", "Player Banner", "Foundation Only; no ad provider activation here."],
            ["playerMidRollEnabled", "Player Mid-Roll", "Foundation Only; no ad provider activation here."],
          ] as const).map(([key, label, body]) => (
            <TouchableOpacity
              key={key}
              style={[styles.contentSignalTile, experienceConfig.monetization[key] && styles.contentSignalTileActive]}
              onPress={() => updateExperienceConfig((prev) => ({ ...prev, monetization: { ...prev.monetization, [key]: !prev.monetization[key] } }))}
            >
              <OwnerStatusPill label={label.includes("Sponsor") || label.includes("Banner") || label.includes("Mid-Roll") ? "Foundation Only" : "Config"} tone={label.includes("Sponsor") || label.includes("Banner") || label.includes("Mid-Roll") ? "locked" : "info"} />
              <Text style={styles.contentSignalTitle}>{label}</Text>
              <Text style={styles.contentSignalBody}>{body}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput style={styles.input} placeholder="Default sponsor label" placeholderTextColor="#8d8d8d" value={experienceConfig.monetization.defaultSponsorLabel} onChangeText={(text) => updateExperienceConfig((prev) => ({ ...prev, monetization: { ...prev.monetization, defaultSponsorLabel: text } }))} />
        <TextInput style={styles.input} placeholder="Premium access title" placeholderTextColor="#8d8d8d" value={experienceConfig.monetization.premiumUpsellTitle} onChangeText={(text) => updateExperienceConfig((prev) => ({ ...prev, monetization: { ...prev.monetization, premiumUpsellTitle: text } }))} />
        <TextInput style={[styles.input, styles.multiline]} placeholder="Premium access body" placeholderTextColor="#8d8d8d" multiline value={experienceConfig.monetization.premiumUpsellBody} onChangeText={(text) => updateExperienceConfig((prev) => ({ ...prev, monetization: { ...prev.monetization, premiumUpsellBody: text } }))} />
      </View>

      <View style={styles.contentPanel}>
        <View style={styles.ownerSectionHeaderRow}>
          <Text style={styles.ownerSectionTitle}>Branding + Copy Locks</Text>
          <OwnerStatusPill label="Doctrine Locked" tone="info" />
        </View>
        <View style={styles.ownerControlList}>
          <OwnerControlRow expanded message="Core product naming is code-owned by doctrine and sanitized by the app config layer." statusLabel="Locked by doctrine" title={`App Display Name · ${experienceConfig.branding.appDisplayName}`} tone="locked" />
          <OwnerControlRow expanded message="Watch-Party Live, Live Watch-Party, Party Room, and Live Room labels remain canonical and are not runtime experiments." statusLabel="Locked by doctrine" title="Canonical Room Labels" tone="locked" />
        </View>
        <TextInput style={styles.input} placeholder="Home hero kicker" placeholderTextColor="#8d8d8d" value={experienceConfig.branding.homeHeroKicker} onChangeText={(text) => updateExperienceConfig((prev) => ({ ...prev, branding: { ...prev.branding, homeHeroKicker: text } }))} />
        <View style={styles.inlineInputs}>
          <TextInput style={[styles.input, styles.inputHalf]} placeholder="Operator center label" placeholderTextColor="#8d8d8d" value={experienceConfig.branding.adminTitle} onChangeText={(text) => updateExperienceConfig((prev) => ({ ...prev, branding: { ...prev.branding, adminTitle: text } }))} />
          <TextInput style={[styles.input, styles.inputHalf, styles.inputDisabled]} placeholder="Watch Party label" placeholderTextColor="#8d8d8d" value={experienceConfig.branding.watchPartyLabel} editable={false} selectTextOnFocus={false} />
        </View>
        <TextInput style={[styles.input, styles.multiline]} placeholder="Operator center helper copy" placeholderTextColor="#8d8d8d" multiline value={experienceConfig.branding.adminSubtitle} onChangeText={(text) => updateExperienceConfig((prev) => ({ ...prev, branding: { ...prev.branding, adminSubtitle: text } }))} />
      </View>

      <View style={styles.contentPanel}>
        <View style={styles.ownerSectionHeaderRow}>
          <Text style={styles.ownerSectionTitle}>Defaults + Grants</Text>
          <OwnerStatusPill label="Config Defaults" tone="info" />
        </View>
        <Text style={styles.configHint}>Room defaults save config only. This lane does not touch room implementation, LiveKit behavior, waiting-room separation, or token issuance.</Text>
        <Text style={styles.sectionLabel}>New Watch Party Defaults</Text>
        <View style={styles.contentSegmentRow}>
          {(["open", "locked"] as const).map((value) => (
            <TouchableOpacity key={`watch-join-${value}`} style={[styles.contentSegment, experienceConfig.roomDefaults.watchParty.joinPolicy === value && styles.contentSegmentActive]} onPress={() => updateExperienceConfig((prev) => ({ ...prev, roomDefaults: { ...prev.roomDefaults, watchParty: { ...prev.roomDefaults.watchParty, joinPolicy: value } } }))}>
              <Text style={[styles.contentSegmentText, experienceConfig.roomDefaults.watchParty.joinPolicy === value && styles.contentSegmentTextActive]}>Join {formatProgrammingToken(value)}</Text>
            </TouchableOpacity>
          ))}
          {(["enabled", "muted"] as const).map((value) => (
            <TouchableOpacity key={`watch-reactions-${value}`} style={[styles.contentSegment, experienceConfig.roomDefaults.watchParty.reactionsPolicy === value && styles.contentSegmentActive]} onPress={() => updateExperienceConfig((prev) => ({ ...prev, roomDefaults: { ...prev.roomDefaults, watchParty: { ...prev.roomDefaults.watchParty, reactionsPolicy: value } } }))}>
              <Text style={[styles.contentSegmentText, experienceConfig.roomDefaults.watchParty.reactionsPolicy === value && styles.contentSegmentTextActive]}>Reactions {formatProgrammingToken(value)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.contentSegmentRow}>
          {(["open", "party_pass", "premium"] as const).map((value) => (
            <TouchableOpacity key={`watch-access-${value}`} style={[styles.contentSegment, experienceConfig.roomDefaults.watchParty.contentAccessRule === value && styles.contentSegmentActive]} onPress={() => updateExperienceConfig((prev) => ({ ...prev, roomDefaults: { ...prev.roomDefaults, watchParty: { ...prev.roomDefaults.watchParty, contentAccessRule: value } } }))}>
              <Text style={[styles.contentSegmentText, experienceConfig.roomDefaults.watchParty.contentAccessRule === value && styles.contentSegmentTextActive]}>{formatProgrammingToken(value)}</Text>
            </TouchableOpacity>
          ))}
          {(["best_effort", "host_managed"] as const).map((value) => (
            <TouchableOpacity key={`watch-capture-${value}`} style={[styles.contentSegment, experienceConfig.roomDefaults.watchParty.capturePolicy === value && styles.contentSegmentActive]} onPress={() => updateExperienceConfig((prev) => ({ ...prev, roomDefaults: { ...prev.roomDefaults, watchParty: { ...prev.roomDefaults.watchParty, capturePolicy: value } } }))}>
              <Text style={[styles.contentSegmentText, experienceConfig.roomDefaults.watchParty.capturePolicy === value && styles.contentSegmentTextActive]}>{formatProgrammingToken(value)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.sectionLabel}>New Communication Defaults</Text>
        <View style={styles.contentSegmentRow}>
          {(["open", "party_pass", "premium"] as const).map((value) => (
            <TouchableOpacity key={`comm-access-${value}`} style={[styles.contentSegment, experienceConfig.roomDefaults.communication.contentAccessRule === value && styles.contentSegmentActive]} onPress={() => updateExperienceConfig((prev) => ({ ...prev, roomDefaults: { ...prev.roomDefaults, communication: { ...prev.roomDefaults.communication, contentAccessRule: value } } }))}>
              <Text style={[styles.contentSegmentText, experienceConfig.roomDefaults.communication.contentAccessRule === value && styles.contentSegmentTextActive]}>{formatProgrammingToken(value)}</Text>
            </TouchableOpacity>
          ))}
          {(["best_effort", "host_managed"] as const).map((value) => (
            <TouchableOpacity key={`comm-capture-${value}`} style={[styles.contentSegment, experienceConfig.roomDefaults.communication.capturePolicy === value && styles.contentSegmentActive]} onPress={() => updateExperienceConfig((prev) => ({ ...prev, roomDefaults: { ...prev.roomDefaults, communication: { ...prev.roomDefaults.communication, capturePolicy: value } } }))}>
              <Text style={[styles.contentSegmentText, experienceConfig.roomDefaults.communication.capturePolicy === value && styles.contentSegmentTextActive]}>{formatProgrammingToken(value)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.contentSubPanel}>
          <View style={styles.ownerSectionHeaderRow}>
            <Text style={styles.configListTitle}>Creator Grants</Text>
            <OwnerStatusPill label="Audited Save" tone="manual" />
          </View>
          <View style={styles.inlineInputs}>
            <TextInput style={[styles.input, styles.inputHalf]} placeholder="Creator user id" placeholderTextColor="#8d8d8d" value={creatorGrantUserId} onChangeText={setCreatorGrantUserId} autoCapitalize="none" />
            <TouchableOpacity style={[styles.orderBtn, (creatorGrantLoading || !canAccessContentProgramming) && styles.configSaveBtnDisabled]} onPress={loadCreatorGrantTarget} disabled={creatorGrantLoading || !canAccessContentProgramming}>
              {creatorGrantLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.orderBtnText}>Load</Text>}
            </TouchableOpacity>
          </View>
          <View style={styles.contentSignalGrid}>
            {([
              ["canUsePartyPassRooms", "Party Pass Rooms", "Grant type"],
              ["canUsePremiumRooms", "Premium Rooms", "Grant type"],
              ["canPublishPremiumTitles", "Premium Titles", "Grant type"],
              ["canUseSponsorPlacements", "Sponsor Placements", "Foundation grant"],
              ["canUsePlayerAds", "Player Ads", "Foundation grant"],
            ] as const).map(([key, label, body]) => (
              <TouchableOpacity
                key={key}
                style={[styles.contentSignalTile, creatorGrantForm[key] && styles.contentSignalTileActive]}
                onPress={() => setCreatorGrantForm((prev) => ({ ...prev, [key]: !prev[key] }))}
              >
                <OwnerStatusPill label={creatorGrantForm[key] ? "Active" : "Inactive"} tone={creatorGrantForm[key] ? "success" : "locked"} />
                <Text style={styles.contentSignalTitle}>{label}</Text>
                <Text style={styles.contentSignalBody}>{body}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.configSaveBtn, { backgroundColor: themePalette.accent }, (creatorGrantSaving || !canAccessContentProgramming) && styles.configSaveBtnDisabled]}
            onPress={saveCreatorGrantTarget}
            disabled={creatorGrantSaving || !canAccessContentProgramming}
          >
            {creatorGrantSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.configSaveBtnText}>Save Grants</Text>}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.contentPanel}>
        <View style={styles.ownerSectionHeaderRow}>
          <Text style={styles.ownerSectionTitle}>Recent Content Audit Timeline</Text>
          <OwnerStatusPill label={contentAuditConnected ? `${contentAuditRows.length} loaded` : "Not Connected"} tone={contentAuditConnected ? "info" : "locked"} />
        </View>
        {contentAuditLoading ? (
          <View style={styles.configLoadingRow}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.configLoadingText}>Loading content audit feed...</Text>
          </View>
        ) : contentAuditVisibleRows.length ? (
          <View style={styles.reportTimeline}>
            {contentAuditVisibleRows.map((row) => (
              <View key={row.id} style={styles.reportTimelineRow}>
                <View style={[styles.reportTimelineDot, row.severity === "critical" || row.severity === "warning" ? styles.reportTimelineDotDanger : styles.reportTimelineDotInfo]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.reportTimelineTitle}>{formatProgrammingToken(row.action)}</Text>
                  <Text style={styles.reportTimelineMeta}>
                    {`${row.created_at ? formatModerationTimestamp(row.created_at) : "Time unknown"} · ${formatContentAuditActor(row)} · ${formatContentAuditTarget(row)}`}
                  </Text>
                  {row.reason ? <Text style={styles.reportBody}>{row.reason}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <OwnerEmptyState title="Content audit feed not connected yet" body="Config saves and public-impacting title/grant actions will appear here after the RPC feed returns rows." />
        )}
      </View>
    </>
  );

  const renderSkeleton = () => (
    <View style={{ gap: 12 }}>
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={index} style={styles.skeletonCard} />
      ))}
    </View>
  );

  if (authLoading || betaLoading) {
    return (
      <BetaAccessScreen
        title="Loading operator access"
        body="Checking whether your signed-in account has backend platform-role membership."
        operatorOnly
        loadingOverride
      />
    );
  }

  if (!isSignedIn) {
    return (
      <BetaAccessScreen
        title="Sign in to access the Operator Center"
        body="This private surface is limited to signed-in backend owner, operator, or moderator platform roles."
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

  if (platformRoleCheckPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#fff" />
        <Text style={styles.loadingText}>Checking platform admin role…</Text>
      </View>
    );
  }

  if (!canAccessAdmin) {
    return (
      <BetaAccessScreen
        title="This account does not have an active admin role"
        body={
          moderationAccess.isLocalTestHelper
            ? "This account is recognized by the local test helper, but Admin access requires an active owner, operator, or moderator platform role."
            : "Admin access requires an active owner, operator, or moderator platform role."
        }
        operatorOnly
      />
    );
  }

  return (
    <ImageBackground
      source={require("../assets/images/chicago-skyline.jpg")}
      resizeMode="cover"
      style={styles.background}
    >
      <View style={[styles.overlay, { backgroundColor: themePalette.screenOverlay }]} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerBlock}>
          <View>
            <Text style={styles.kicker}>PRIVATE PLATFORM SURFACE</Text>
            <Text style={styles.title}>Admin Command Center</Text>
            <Text style={styles.subtitle}>
              {"Operate Chi'llywood, review platform risk, and monitor launch readiness."}
            </Text>
          </View>

          {canManagePrivilegedWrites ? (
            <TouchableOpacity style={[styles.newBtn, { backgroundColor: themePalette.accent }]} onPress={openCreate}>
              <Text style={styles.newBtnText}>New Title</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {notice && (
          <View style={[styles.notice, notice.type === "error" ? styles.noticeError : styles.noticeSuccess]}>
            <Text style={styles.noticeText}>{notice.text}</Text>
          </View>
        )}

        <View style={styles.tabBar}>
          {visibleOperatorTabs.map((tab) => {
            const active = operatorTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tabButton, active && styles.tabButtonActive]}
                onPress={() => setOperatorTab(tab.key)}
              >
                <Text style={[styles.tabButtonText, active && styles.tabButtonTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {operatorTab === "home" ? (
        <View style={styles.adminHomeSurface}>
          <View style={styles.adminHomeHero}>
            <View style={styles.adminHomeHeroTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.configKicker}>COMMAND OVERVIEW</Text>
                <Text style={styles.adminHomeHeroTitle}>Platform Snapshot</Text>
                <Text style={styles.adminHomeHeroBody}>
                  Backed launch-control summary for queues, connected systems, estimates, and foundation-only boundaries.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.adminHomeRefreshButton, homeRefreshing && styles.configSaveBtnDisabled]}
                onPress={() => void refreshAdminHome()}
                disabled={homeRefreshing}
              >
                {homeRefreshing ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.adminHomeRefreshText}>Refresh</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.adminHomeStatusBand}>
              <View style={[styles.adminHomeSummaryStatus, ownerMetricToneStyle(homeCommandStatus.tone)]}>
                <Text style={styles.adminHomeSummaryLabel}>Summary Status</Text>
                <Text style={styles.adminHomeSummaryValue}>{homeCommandStatus.label}</Text>
                <Text style={styles.adminHomeSummaryBody}>{homeCommandStatus.body}</Text>
              </View>
              <View style={styles.adminHomeHeroPills}>
                <OwnerStatusPill label={`Operator ${formatModerationToken(resolvedActorRole)}`} tone={canAccessAdmin ? "info" : "locked"} />
                <OwnerStatusPill label={appConfigConnected ? "App Config Connected" : "App Config Not Connected"} tone={appConfigConnected ? "success" : "locked"} />
                <OwnerStatusPill label={adminImmutableAuditReadModel.connected ? "Audit Connected" : "Audit Not Connected"} tone={adminImmutableAuditReadModel.connected ? "success" : "locked"} />
                <OwnerStatusPill
                  label={homeLastCheckedAt ? `Last Checked ${formatModerationTimestamp(homeLastCheckedAt)}` : "Last Checked Not Connected"}
                  tone={homeLastCheckedAt ? "info" : "locked"}
                />
              </View>
            </View>
          </View>

          {homeRefreshing && !homeLastCheckedAt ? (
            <View style={styles.adminHomeSkeletonGrid}>
              {[0, 1, 2, 3].map((item) => (
                <View key={item} style={styles.adminHomeSkeletonTile}>
                  <View style={styles.reportSkeletonLineWide} />
                  <View style={styles.reportSkeletonLine} />
                  <View style={styles.reportSkeletonPill} />
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.adminHomeMetricGrid}>
            {homeSnapshotMetrics.map((tile) => {
              const canOpenTile = !!tile.destination && visibleOperatorTabs.some((tab) => tab.key === tile.destination);
              const content = (
                <>
                  <View style={styles.adminHomeTileHeader}>
                    <Text style={styles.adminHomeTileLabel}>{tile.label}</Text>
                    <OwnerStatusPill label={tile.qualifier} tone={tile.tone} />
                  </View>
                  <Text style={styles.adminHomeTileValue}>{tile.value}</Text>
                  <Text style={styles.adminHomeTileBody}>{tile.body}</Text>
                </>
              );
              const tileStyle = [styles.adminHomeMetricTile, ownerMetricToneStyle(tile.tone)];
              return canOpenTile ? (
                <TouchableOpacity
                  key={tile.label}
                  style={tileStyle}
                  activeOpacity={0.84}
                  onPress={() => setOperatorTab(tile.destination as OperatorTabKey)}
                >
                  {content}
                </TouchableOpacity>
              ) : (
                <View key={tile.label} style={tileStyle}>
                  {content}
                </View>
              );
            })}
          </View>

          <View style={styles.adminHomePanel}>
            <View style={styles.adminHomeSectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.configKicker}>NEEDS ATTENTION</Text>
                <Text style={styles.adminHomeSectionTitle}>Priority Rail</Text>
              </View>
              <OwnerStatusPill
                label={homeAttentionItems.length ? `${homeAttentionItems.length} signal${homeAttentionItems.length === 1 ? "" : "s"}` : "Calm"}
                tone={homeAttentionItems.length ? "manual" : "success"}
              />
            </View>

            {homeAttentionItems.length ? (
              <View style={styles.adminHomeAttentionRail}>
                {homeAttentionItems.map((item) => {
                  const canOpenItem = !!item.destination && visibleOperatorTabs.some((tab) => tab.key === item.destination);
                  const content = (
                    <>
                      <View style={styles.adminHomePriorityStripe} />
                      <View style={styles.adminHomeAttentionCopy}>
                        <Text style={styles.adminHomeAttentionTitle}>{item.label}</Text>
                        <Text style={styles.adminHomeAttentionBody}>{item.body}</Text>
                      </View>
                      <View style={styles.adminHomeAttentionMeta}>
                        <OwnerStatusPill label={item.priorityLabel} tone={item.tone} />
                        <Text style={styles.adminHomeAttentionValue}>{item.value}</Text>
                        {canOpenItem ? <Text style={styles.adminHomeDrillText}>Open</Text> : null}
                      </View>
                    </>
                  );
                  return canOpenItem ? (
                    <TouchableOpacity
                      key={`${item.label}-${item.value}`}
                      style={[styles.adminHomeAttentionRow, ownerMetricToneStyle(item.tone)]}
                      activeOpacity={0.84}
                      onPress={() => setOperatorTab(item.destination as OperatorTabKey)}
                    >
                      {content}
                    </TouchableOpacity>
                  ) : (
                    <View key={`${item.label}-${item.value}`} style={[styles.adminHomeAttentionRow, ownerMetricToneStyle(item.tone)]}>
                      {content}
                    </View>
                  );
                })}
              </View>
            ) : (
              <OwnerEmptyState
                title="No urgent admin issues detected"
                body={homeCommandStatus.label === "Partial Visibility"
                  ? "No urgent backed queue is visible, but partial visibility and foundation-only systems remain clearly labeled below."
                  : "Backed report, DMCA, audit, and live-ops signals are calm in the current snapshot."}
              />
            )}
          </View>

          <View style={styles.adminHomePanel}>
            <View style={styles.adminHomeSectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.configKicker}>CONNECTED SYSTEMS</Text>
                <Text style={styles.adminHomeSectionTitle}>System Signal Grid</Text>
              </View>
              <OwnerStatusPill label="Truth-labeled" tone="info" />
            </View>

            <View style={styles.adminHomeSystemGrid}>
              {homeSystemTiles.map((tile) => {
                const canOpenTile = !!tile.destination && visibleOperatorTabs.some((tab) => tab.key === tile.destination);
                const content = (
                  <>
                    <View style={styles.adminHomeTileHeader}>
                      <Text style={styles.adminHomeSystemLabel}>{tile.label}</Text>
                      <OwnerStatusPill label={tile.qualifier} tone={tile.tone} />
                    </View>
                    <Text style={styles.adminHomeSystemValue}>{tile.value}</Text>
                    <Text style={styles.adminHomeSystemBody}>{tile.body}</Text>
                  </>
                );
                return canOpenTile ? (
                  <TouchableOpacity
                    key={tile.label}
                    style={[styles.adminHomeSystemTile, ownerMetricToneStyle(tile.tone)]}
                    activeOpacity={0.84}
                    onPress={() => setOperatorTab(tile.destination as OperatorTabKey)}
                  >
                    {content}
                  </TouchableOpacity>
                ) : (
                  <View key={tile.label} style={[styles.adminHomeSystemTile, ownerMetricToneStyle(tile.tone)]}>
                    {content}
                  </View>
                );
              })}
            </View>
          </View>

          <View style={styles.adminHomePanel}>
            <View style={styles.adminHomeSectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.configKicker}>OPERATIONAL TRUTH</Text>
                <Text style={styles.adminHomeSectionTitle}>Boundaries</Text>
              </View>
              <OwnerStatusPill label="Scope Limited" tone="info" />
            </View>

            <View style={styles.adminHomeBoundaryGrid}>
              {homeBoundaryItems.map((item) => (
                <View key={item.label} style={[styles.adminHomeBoundaryItem, ownerMetricToneStyle(item.tone)]}>
                  <View style={styles.adminHomeTileHeader}>
                    <Text style={styles.adminHomeBoundaryTitle}>{item.label}</Text>
                    <OwnerStatusPill label={item.proofLabel} tone={item.tone} />
                  </View>
                  <Text style={styles.adminHomeBoundaryBody}>{item.body}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.adminHomePanel}>
            <View style={styles.adminHomeSectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.configKicker}>RECENT SIGNALS</Text>
                <Text style={styles.adminHomeSectionTitle}>Audit Activity</Text>
              </View>
              <OwnerStatusPill
                label={adminImmutableAuditReadModel.connected ? "Backed Feed" : "Not Connected"}
                tone={adminImmutableAuditReadModel.connected ? "success" : "locked"}
              />
            </View>

            {adminImmutableAuditReadModel.loading ? (
              <View style={styles.reportSkeletonPanel}>
                <View style={styles.reportSkeletonLineWide} />
                <View style={styles.reportSkeletonLine} />
              </View>
            ) : homeRecentActivity.length ? (
              <View style={styles.adminHomeActivityList}>
                {homeRecentActivity.map((item) => (
                  <View key={item.id} style={styles.adminHomeActivityRow}>
                    <View style={[styles.adminHomeActivityDot, ownerMetricToneStyle(item.tone)]} />
                    <View style={styles.adminHomeAttentionCopy}>
                      <Text style={styles.adminHomeActivityTitle}>{item.title}</Text>
                      <Text style={styles.adminHomeActivityMeta}>{item.meta}</Text>
                      <Text style={styles.adminHomeActivityTarget}>{item.target}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <OwnerEmptyState
                title={adminImmutableAuditReadModel.connected ? "No recent audit rows returned" : "Recent activity feed not connected yet"}
                body={adminImmutableAuditReadModel.connected
                  ? "The immutable audit query succeeded but returned no rows in the current slice."
                  : "Home does not fake activity. The feed appears only when immutable audit rows are readable."}
              />
            )}
          </View>

          <View style={styles.adminHomeQuickSurface}>
            <View style={styles.adminHomeSectionHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.configKicker}>QUICK DRILL-DOWN</Text>
                <Text style={styles.adminHomeSectionTitle}>Go Next</Text>
              </View>
              <OwnerStatusPill label="Non-destructive" tone="info" />
            </View>
            <View style={styles.adminHomeQuickGrid}>
              {homeQuickActions.map((action) => (
                <TouchableOpacity
                  key={action.destination}
                  style={[styles.adminHomeQuickAction, ownerMetricToneStyle(action.tone)]}
                  activeOpacity={0.84}
                  onPress={() => setOperatorTab(action.destination)}
                >
                  <Text style={styles.adminHomeQuickTitle}>{action.label}</Text>
                  <Text style={styles.adminHomeQuickBody}>{action.body}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
        ) : null}

        {operatorTab === "reports" ? (
        <View style={styles.reportTriageSurface}>
          <View style={styles.reportHeroPanel}>
            <View style={styles.reportHeroTopRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.configKicker}>REPORTS</Text>
                <Text style={styles.ownerPanelTitle}>Reports Triage</Text>
                <Text style={styles.ownerPanelSubtitle}>
                  Review platform reports and apply backed safety actions without exposing private operator data.
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.ownerSecondaryButton, (!canReviewSafetyReports || safetyReportsLoading) && styles.configSaveBtnDisabled]}
                onPress={() => void loadSafetyReports()}
                disabled={!canReviewSafetyReports || safetyReportsLoading}
              >
                {safetyReportsLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.ownerSecondaryButtonText}>Refresh</Text>}
              </TouchableOpacity>
            </View>

            <View style={styles.badgesRow}>
              <OwnerStatusPill label={`Role ${formatModerationToken(resolvedActorRole)}`} tone={canAccessAdmin ? "info" : "locked"} />
              <OwnerStatusPill label={canReviewSafetyReports ? "Queue Connected" : "Queue Locked"} tone={canReviewSafetyReports ? "success" : "locked"} />
              <OwnerStatusPill
                label={safetyReportsLastLoadedAt ? `Last ${formatModerationTimestamp(safetyReportsLastLoadedAt)}` : "Last Not Connected"}
                tone={safetyReportsLastLoadedAt ? "info" : "locked"}
              />
            </View>
          </View>

          {platformRolesLoading ? (
            <View style={styles.reportSkeletonPanel}>
              <View style={styles.reportSkeletonLineWide} />
              <View style={styles.reportSkeletonLine} />
            </View>
          ) : null}

          {moderationNotice ? (
            <View style={[styles.notice, styles.noticeWarn]}>
              <Text style={styles.noticeText}>{moderationNotice}</Text>
            </View>
          ) : null}

          {!canReviewSafetyReports ? (
            <OwnerDisabledReason reason="Reports Triage is locked because this account lacks backed Owner/Admin/Moderator report-review permission. The queue also fails closed through Supabase RLS." />
          ) : null}

          <View style={styles.reportMetricGrid}>
            {reportTriageMetrics.map((metric) => (
              <View key={metric.label} style={[styles.reportMetricTile, ownerMetricToneStyle(metric.tone)]}>
                <Text style={styles.ownerMetricLabel}>{metric.label}</Text>
                <Text style={styles.reportMetricValue}>{metric.value}</Text>
                <Text style={styles.reportMetricBody}>{metric.body}</Text>
              </View>
            ))}
          </View>

          <View style={styles.reportToolbarPanel}>
            <Text style={styles.ownerSectionTitle}>Queue Filters</Text>
            <View style={styles.ownerFilterRow}>
              {REPORT_TRIAGE_FILTERS.map((option) => {
                const active = safetyReportFilter === option.key;
                return (
                  <TouchableOpacity
                    key={option.key}
                    accessibilityRole="button"
                    style={[
                      styles.ownerFilterChip,
                      active && styles.ownerFilterChipActive,
                    ]}
                    onPress={() => {
                      setSafetyReportFilter(option.key);
                    }}
                  >
                    <Text style={[
                      styles.ownerFilterChipText,
                      active && styles.ownerFilterChipTextActive,
                    ]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.reportQueueGrid}>
            <View style={styles.reportQueuePanel}>
              <View style={styles.ownerSectionHeaderRow}>
                <View>
                  <Text style={styles.ownerSectionTitle}>Report Queue</Text>
                  <Text style={styles.ownerPanelMeta}>
                    {safetyReportQueueConnected
                      ? `${filteredSafetyReports.length} visible from ${safetyReportQueueCount} loaded`
                      : "Queue source not connected"}
                  </Text>
                </View>
                <OwnerStatusPill
                  label={safetyReportQueueConnected ? "Backed Query" : "Not Connected"}
                  tone={safetyReportQueueConnected ? "success" : "locked"}
                />
              </View>

              {safetyReportsLoading ? (
                <View style={styles.ownerControlList}>
                  {[0, 1, 2].map((item) => (
                    <View key={item} style={styles.reportSkeletonCard}>
                      <View style={styles.reportSkeletonLineWide} />
                      <View style={styles.reportSkeletonLine} />
                      <View style={styles.reportSkeletonPillRow}>
                        <View style={styles.reportSkeletonPill} />
                        <View style={styles.reportSkeletonPill} />
                      </View>
                    </View>
                  ))}
                </View>
              ) : canReviewSafetyReports && safetyReports.length && !filteredSafetyReports.length ? (
                <OwnerEmptyState
                  title="No matching reports"
                  body="The selected filter has no reports in the current backed recent queue slice."
                />
              ) : canReviewSafetyReports && filteredSafetyReports.length ? (
                <View style={styles.ownerControlList}>
                  {filteredSafetyReports.map((report) => {
                    const targetActionDisabledReason = getReportTargetActionDisabledReason(report, canApplyReportTargetActions);
                    const targetActionReady = !targetActionDisabledReason;
                    return (
                      <View key={report.id} style={styles.reportCard}>
                        <View style={styles.reportHeaderRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.reportKicker}>
                              {`Report ${formatCompactIdentifier(report.id)} · ${formatReportSourceSurface(report.sourceSurface)}`}
                            </Text>
                            <Text style={styles.reportTitle}>{buildReportTargetLine(report)}</Text>
                            <Text style={styles.reportMeta}>{formatModerationTimestamp(report.createdAt)}</Text>
                          </View>
                          <TouchableOpacity
                            style={styles.orderBtn}
                            onPress={() => {
                              setSelectedSafetyReportId(report.id);
                              setSafetyReportDetailVisible(true);
                            }}
                          >
                            <Text style={styles.orderBtnText}>Review</Text>
                          </TouchableOpacity>
                        </View>

                        <View style={styles.badgesRow}>
                          <OwnerStatusPill label={formatReportRiskLabel(report)} tone={getReportSeverityTone(report.severity)} />
                          <OwnerStatusPill label={formatReportReviewState(report.status)} tone={getReportReviewTone(report.status)} />
                          <OwnerStatusPill label={formatReportResolution(report)} tone={report.resolutionType ? "info" : "locked"} />
                          <OwnerStatusPill label={formatReportSourceSurface(report.sourceSurface)} tone={report.sourceSurface === "unknown" ? "locked" : "info"} />
                          {report.platformOwnedTarget ? <OwnerStatusPill label="Platform Target" tone="success" /> : null}
                        </View>

                        <Text style={styles.reportMeta}>{buildReportActorLine(report)}</Text>
                        {report.note ? <Text style={styles.reportBody} numberOfLines={3}>{formatAuditDisplayText(report.note)}</Text> : null}

                        <View style={styles.reportRowActions}>
                          {targetActionReady ? (
                            <TouchableOpacity
                              style={styles.reportTargetButton}
                              onPress={() => {
                                setSelectedSafetyReportId(report.id);
                                setSafetyReportDetailVisible(true);
                                setModerationNotice(`Report ${formatCompactIdentifier(report.id)} target loaded for backed ${formatModerationToken(report.targetType).toLowerCase()} action.`);
                              }}
                            >
                              <Text style={styles.reportTargetButtonText}>Use Target</Text>
                            </TouchableOpacity>
                          ) : (
                            <Text style={styles.reportActionHint}>
                              {targetActionDisabledReason}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ) : canReviewSafetyReports ? (
                <OwnerEmptyState
                  title="No reports need review"
                  body="The backed recent report queue returned zero rows. This is a proven empty state from the successful query."
                />
              ) : null}
            </View>

            <View style={styles.reportQueuePanel}>
              <View style={styles.ownerSectionHeaderRow}>
                <View>
                  <Text style={styles.ownerSectionTitle}>Recent Queue Scope</Text>
                  <Text style={styles.ownerPanelMeta}>
                    {safetyReportsLastLoadedAt ? `Last query ${formatModerationTimestamp(safetyReportsLastLoadedAt)}` : "Last query not connected"}
                  </Text>
                </View>
                <OwnerStatusPill label={safetyReportQueueConnected ? "Connected" : "Fail Closed"} tone={safetyReportQueueConnected ? "success" : "locked"} />
              </View>
              <OwnerDetailGrid
                rows={[
                  { label: "Sources", value: safetyReportSourceSummary },
                  {
                    label: "Loaded Count",
                    value: safetyReportQueueConnected ? String(safetyReportQueueCount) : "not connected",
                  },
                  {
                    label: "Platform Targets",
                    value: safetyReportQueueConnected ? String(safetyReportQueueSummary?.platformOwnedTargetCount ?? 0) : "not connected",
                  },
                  {
                    label: "Resolution Status",
                    value: safetyReportQueueConnected ? "backed by safety_reports.status/resolution_type" : "not connected",
                  },
                ]}
              />
            </View>
          </View>

          <View style={styles.reportManualPanel}>
            <TouchableOpacity
              style={styles.reportManualHeader}
              onPress={() => setManualReportActionOpen((current) => !current)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.ownerSectionTitle}>Manual Target Action</Text>
                <Text style={styles.ownerPanelMeta}>Report-linked actions are backed; standalone manual mutation stays locked.</Text>
              </View>
              <OwnerStatusPill label={manualReportActionOpen ? "Open" : "Collapsed"} tone={manualReportActionOpen ? "manual" : "locked"} />
            </TouchableOpacity>

            {manualReportActionOpen ? (
              <OwnerDisabledReason reason={
                canApplyReportTargetActions
                  ? "Manual target action without a selected report is disabled because immutable report-linked audit requires a safety_reports row. Use Review or Use Target from the queue."
                  : "Manual target actions require Owner or scoped content_moderation permission and are hidden from regular report reviewers."
              } />
            ) : null}
          </View>
        </View>
        ) : null}

        {operatorTab === "dmca" ? (
        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>DMCA / COPYRIGHT</Text>
              <Text style={styles.configTitle}>Copyright case management</Text>
              <Text style={styles.configBody}>
                Owner and scoped Admin/Operator workflow for notices, content actions, strikes, counter-notices, preservation, and case history. Manual email intake enabled. Automated email ingestion not configured.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.orderBtn, (!canAccessDmca || dmcaCasesLoading) && styles.configSaveBtnDisabled]}
              disabled={!canAccessDmca || dmcaCasesLoading}
              onPress={() => void loadDmcaCases()}
            >
              <Text style={styles.orderBtnText}>{dmcaCasesLoading ? "Loading" : "Refresh"}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.badgesRow}>
            <View style={[styles.badge, canAccessDmca ? styles.badgeOn : styles.badgeOff]}>
              <Text style={styles.badgeText}>{canAccessDmca ? "Scoped access verified" : "Permission denied"}</Text>
            </View>
            <View style={[styles.badge, styles.badgeScheduled]}>
              <Text style={styles.badgeText}>Manual email intake enabled</Text>
            </View>
            <View style={[styles.badge, styles.badgeOff]}>
              <Text style={styles.badgeText}>No auto-termination</Text>
            </View>
          </View>

          {dmcaNotice ? (
            <View style={[styles.notice, styles.noticeWarn]}>
              <Text style={styles.noticeText}>{dmcaNotice}</Text>
            </View>
          ) : null}

          {!canAccessDmca ? (
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>DMCA tooling is locked</Text>
                <Text style={styles.configListBody}>
                  Admin DMCA requires Owner, or an approved Admin/Operator with dmca_review, copyright_review, or legal_review. Moderators and regular users are denied by backend RLS/RPC checks.
                </Text>
              </View>
            </View>
          ) : (
            <>
              <View style={styles.dashboardGrid}>
                <OwnerMetricTile label="All Cases" value={dmcaCaseSummary?.total ?? dmcaCases.length} />
                <OwnerMetricTile label="Open" tone={ownerAttentionCountTone(dmcaOpenCount)} value={dmcaOpenCount} />
                <OwnerMetricTile label="Priority" tone={ownerAttentionCountTone(dmcaPriorityCount)} value={dmcaPriorityCount} />
                <OwnerMetricTile label="Repeat Review" tone={ownerAttentionCountTone(dmcaRepeatReviewCount)} value={dmcaRepeatReviewCount} />
              </View>

              <View style={styles.ownerToolbarPanel}>
                <Text style={styles.ownerSectionTitle}>Case Workflows</Text>
                <Text style={styles.configListBody}>Every action opens a backed workflow. Manual email intake remains supported; automated email ingestion is not configured.</Text>
                <View style={styles.configListActions}>
                  <TouchableOpacity style={styles.actionBtnPrimary} onPress={openDmcaIntake}>
                    <Text style={styles.actionTextPrimary}>Formal Notice Intake</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => void openPublicDmcaForm()}>
                    <Text style={styles.actionText}>Open Public Form</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.ownerToolbarPanel}>
                <Text style={styles.ownerSectionTitle}>Find Cases</Text>
                <Text style={styles.configListBody}>Search and filters are backed by the loaded case list; no proof/demo cases are shown in production mode.</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Search case id, content id, reporter email, uploader id, URL, or status"
                    placeholderTextColor="#8d8d8d"
                    value={dmcaSearchQuery}
                    onChangeText={setDmcaSearchQuery}
                    autoCapitalize="none"
                  />
                  <View style={styles.toggleRowWrap}>
                    {dmcaStatusFilters.map((status) => (
                      <TouchableOpacity
                        key={status}
                        style={[styles.toggleChip, dmcaStatusFilter === status && styles.toggleChipActive]}
                        onPress={() => setDmcaStatusFilter(status)}
                      >
                        <Text style={[styles.toggleChipText, dmcaStatusFilter === status && styles.toggleChipTextActive]}>
                          {status === "all" ? "ALL" : formatModerationToken(status)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
              </View>

              {dmcaCaseSummary ? (
                <View style={styles.toggleRowWrap}>
                  {dmcaStatusFilters.filter((status) => status !== "all").map((status) => (
                    <View key={status} style={styles.badge}>
                      <Text style={styles.badgeText}>{`${formatModerationToken(status)} ${dmcaCaseSummary.byStatus[status] ?? 0}`}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {dmcaCasesLoading ? (
                <View style={styles.configLoadingRow}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.configLoadingText}>Loading DMCA cases...</Text>
                </View>
              ) : dmcaCases.length ? (
                <View style={styles.configList}>
                  {dmcaCases.map((dmcaCase) => (
                    <View key={dmcaCase.id} style={styles.reportCard}>
                      <View style={styles.reportHeaderRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.reportKicker}>
                            {`${dmcaCase.caseNumber || dmcaCase.id} · ${formatModerationToken(dmcaCase.contentType)}`}
                          </Text>
                          <Text style={styles.reportTitle}>{formatAuditDisplayText(dmcaCase.reporterName)}</Text>
                          <Text style={styles.reportMeta}>{`Reporter ${formatAuditDisplayText(dmcaCase.reporterEmail)}`}</Text>
                          <Text style={styles.reportMeta}>{`Submitted ${formatModerationTimestamp(dmcaCase.createdAt)}`}</Text>
                        </View>
                        <TouchableOpacity
                          style={[styles.orderBtn, dmcaActionBusy === `detail-${dmcaCase.id}` && styles.configSaveBtnDisabled]}
                          disabled={dmcaActionBusy === `detail-${dmcaCase.id}`}
                          onPress={() => void loadDmcaCaseDetail(dmcaCase.id)}
                        >
                          <Text style={styles.orderBtnText}>
                            {dmcaActionBusy === `detail-${dmcaCase.id}` ? "Loading" : "Open"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.badgesRow}>
                        <View style={[styles.badge, styles.badgeScheduled]}>
                          <Text style={styles.badgeText}>{formatModerationToken(dmcaCase.status)}</Text>
                        </View>
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>{formatModerationToken(dmcaCase.source)}</Text>
                        </View>
                        {dmcaCase.isTestCase && __DEV__ ? (
                          <View style={[styles.badge, styles.badgeDraft]}>
                            <Text style={styles.badgeText}>DEV/TEST</Text>
                          </View>
                        ) : null}
                        <View style={[styles.badge, dmcaCase.activeStrikeCount > 0 ? styles.badgeDraft : styles.badgeOff]}>
                          <Text style={styles.badgeText}>{`${dmcaCase.activeStrikeCount} active strike${dmcaCase.activeStrikeCount === 1 ? "" : "s"}`}</Text>
                        </View>
                      </View>
                      <Text style={styles.reportMeta}>{`Content ${formatCompactIdentifier(dmcaCase.contentId)} · Uploader ${formatCompactIdentifier(dmcaCase.uploaderUserId)}`}</Text>
                      <Text style={styles.reportMeta}>
                        {dmcaCase.lastAction
                          ? `Last action ${formatModerationToken(dmcaCase.lastAction)} · ${formatModerationTimestamp(dmcaCase.lastActionAt)}`
                          : `Last action ${formatModerationToken(dmcaCase.status)} · ${formatModerationTimestamp(dmcaCase.updatedAt)}`}
                      </Text>
                      {dmcaCase.contentUrl ? (
                        <Text style={styles.reportBody} numberOfLines={2}>{formatAuditDisplayText(dmcaCase.contentUrl)}</Text>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : (
                <OwnerEmptyState
                  body={dmcaSearchQuery.trim() || dmcaStatusFilter !== "all"
                    ? "Adjust search or filters to find a case."
                    : "Formal notices from the public form, Support, email, or admin manual intake will appear here."}
                  title={dmcaSearchQuery.trim() || dmcaStatusFilter !== "all" ? "No Matching DMCA Cases" : "No DMCA Cases Yet"}
                />
              )}
            </>
          )}
        </View>
        ) : null}

        {operatorTab === "roles" || operatorTab === "audit" ? (
        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>{operatorTab === "roles" ? "ROLES" : "AUDIT"}</Text>
                <Text style={styles.configTitle}>
                  {operatorTab === "roles" ? "Platform role visibility" : "Immutable admin audit log"}
                </Text>
                <Text style={styles.configBody}>
                {operatorTab === "roles"
                  ? "Platform role records are backend staff truth. Owner can manage Admins and Moderators; Admins need scoped grants."
                  : adminImmutableAuditReadModel.connected
                    ? "Immutable admin audit log foundation is connected. The derived role/safety summary stays separate below."
                    : "Immutable admin audit logs are not connected yet. The derived role/safety summary stays separate below where permitted."}
              </Text>
            </View>
          </View>

          <View style={styles.dashboardGrid}>
            {staffAndAuditCards
              .filter((card) => operatorTab === "roles" ? card.label === "Staff & Roles" : card.label === "Audit Visibility")
              .map((card) => (
              <View
                key={card.label}
                style={[
                  styles.dashboardMetricCard,
                  card.tone === "unavailable" && styles.dashboardMetricCardUnavailable,
                ]}
              >
                <Text style={styles.dashboardMetricLabel}>{card.label}</Text>
                <Text style={styles.dashboardMetricValue}>{card.value}</Text>
                <Text style={styles.dashboardMetricBody}>{card.body}</Text>
              </View>
            ))}
          </View>

          <View style={styles.badgesRow}>
            {operatorTab === "roles" ? (
              <View style={[styles.badge, canViewStaffRoles ? styles.badgeOn : styles.badgeOff]}>
                <Text style={styles.badgeText}>{canViewStaffRoles ? "Role Roster Visible" : "Role Roster Locked"}</Text>
              </View>
            ) : (
              <View
                style={[
                  styles.badge,
                  canManagePrivilegedWrites || canReviewSafetyReports ? styles.badgeScheduled : styles.badgeOff,
                ]}
              >
                <Text style={styles.badgeText}>
                  {canManagePrivilegedWrites || canReviewSafetyReports ? "Audit Context Visible" : "Audit Context Locked"}
                </Text>
              </View>
            )}
          </View>

          {adminOpsNotice ? (
            <View style={[styles.notice, styles.noticeWarn]}>
              <Text style={styles.noticeText}>{adminOpsNotice}</Text>
            </View>
          ) : null}

          <View style={styles.configList}>
            {operatorTab === "roles" ? (
              <>
                <OwnerControlPanelHeader
                  actions={(
                    <TouchableOpacity
                      style={[styles.ownerSecondaryButton, platformRoleRosterLoading && styles.configSaveBtnDisabled]}
                      onPress={() => void refreshStaffRoleState()}
                      disabled={platformRoleRosterLoading}
                    >
                      <Text style={styles.ownerSecondaryButtonText}>{platformRoleRosterLoading ? "Refreshing" : "Refresh"}</Text>
                    </TouchableOpacity>
                  )}
                  badgeLabel={canManageAdminStaff || canManageModeratorStaff ? "Manage Enabled" : canViewStaffRoles ? "View Only" : "Denied"}
                  badgeTone={canManageAdminStaff || canManageModeratorStaff ? "success" : canViewStaffRoles ? "manual" : "locked"}
                  kicker="ROLES CONTROL"
                  lastRunLabel={platformRoleRosterGeneratedAt ? `Last refreshed ${formatModerationTimestamp(platformRoleRosterGeneratedAt)}` : "Last refreshed not connected"}
                  subtitle="Manage platform staff access, scoped permissions, and audit-backed grants."
                  title="Roles & Permissions"
                />

                <View style={styles.ownerMetricGrid}>
                  <OwnerMetricTile
                    label="Active Staff"
                    tone={staffSnapshotSummary ? "info" : "locked"}
                    value={platformRoleRosterLoading ? "Loading" : staffSnapshotSummary ? staffSnapshotSummary.activeCount : "Not Connected"}
                  />
                  <OwnerMetricTile
                    label="Owners"
                    tone={staffSnapshotSummary ? "success" : "locked"}
                    value={platformRoleRosterLoading ? "Loading" : staffSnapshotSummary ? staffSnapshotSummary.ownerCount : "Not Connected"}
                  />
                  <OwnerMetricTile
                    label="Admins"
                    tone={staffSnapshotSummary ? "info" : "locked"}
                    value={platformRoleRosterLoading ? "Loading" : staffSnapshotSummary ? staffSnapshotSummary.operatorCount : "Not Connected"}
                  />
                  <OwnerMetricTile
                    label="Moderators"
                    tone={staffSnapshotSummary ? "manual" : "locked"}
                    value={platformRoleRosterLoading ? "Loading" : staffSnapshotSummary ? staffSnapshotSummary.moderatorCount : "Not Connected"}
                  />
                </View>

                <View style={styles.contentPanel}>
                  <View style={styles.ownerSectionHeaderRow}>
                    <Text style={styles.ownerSectionTitle}>Active Role Roster</Text>
                    <OwnerStatusPill
                      label={canViewStaffRoles ? `${activePlatformRoleRoster.length} active` : "Locked"}
                      tone={canViewStaffRoles ? "info" : "locked"}
                    />
                  </View>
                  {!canViewStaffRoles ? (
                    <OwnerDisabledReason reason="Staff-role roster visibility requires Owner, admin_grants, or manage_moderators truth. Normal users cannot load roster rows or staff emails." />
                  ) : platformRoleRosterLoading ? (
                    <View style={styles.configLoadingRow}>
                      <ActivityIndicator color="#fff" />
                      <Text style={styles.configLoadingText}>Loading platform role roster...</Text>
                    </View>
                  ) : activePlatformRoleRoster.length ? (
                    <View style={styles.ownerControlList}>
                      {activePlatformRoleRoster.map((entry) => {
                        const canRemoveEntry = entry.role === "operator" ? canManageAdminStaff : entry.role === "moderator" ? canManageModeratorStaff : false;
                        return (
                          <OwnerControlRow
                            key={`active-staff-role-${entry.id}`}
                            expanded
                            message={`${entry.grantedAt ? `Granted ${formatModerationTimestamp(entry.grantedAt)}` : "Grant timestamp unavailable"} · ${entry.grantedBy ? `Granted by ${formatAuditDisplayText(entry.grantedBy)}` : "Grant actor not returned"} · ${isOwnerStaff ? `${entry.permissionKeys.length} scoped permissions` : "Permission detail Owner-only"}`}
                            meta={entry.notes ? formatAuditDisplayText(entry.notes) : undefined}
                            statusLabel={entry.role === "owner" ? "Protected Owner" : formatPlatformRoleDisplayLabel(entry.role)}
                            title={maskOperatorIdentity(entry.identityLabel)}
                            tone={entry.role === "owner" ? "success" : "info"}
                          >
                            <View style={styles.badgesRow}>
                              <OwnerStatusPill label={formatModerationToken(entry.status)} tone="success" />
                              <OwnerStatusPill label={isOwnerStaff ? `${entry.permissionKeys.length} permissions` : "Owner-only permissions"} tone={isOwnerStaff ? "info" : "locked"} />
                            </View>
                            {isOwnerStaff && entry.permissionKeys.length ? (
                              <Text style={styles.ownerDetailText}>{formatPermissionSummary(entry.permissionKeys)}</Text>
                            ) : null}
                            {entry.role === "owner" ? (
                              <OwnerDisabledReason reason="Owner records are protected. At least one active Owner must always remain, and Owner removal is not exposed from this generic staff panel." />
                            ) : entry.email ? (
                              <View style={styles.configListActions}>
                                {isOwnerStaff ? (
                                  <TouchableOpacity
                                    style={[styles.orderBtn, staffPermissionBusy !== null && styles.configSaveBtnDisabled]}
                                    onPress={() => void loadStaffPermissionSet(entry.email, entry.permissionKeys)}
                                    disabled={staffPermissionBusy !== null}
                                  >
                                    <Text style={styles.orderBtnText}>Manage Permissions</Text>
                                  </TouchableOpacity>
                                ) : null}
                                {canRemoveEntry ? (
                                  <TouchableOpacity
                                    style={[styles.orderBtn, staffRoleBusy !== null && styles.configSaveBtnDisabled]}
                                    onPress={() => confirmStaffRoleRevoke(entry.email, entry.role === "operator" ? "admin" : "moderator")}
                                    disabled={staffRoleBusy !== null}
                                  >
                                    <Text style={styles.orderBtnText}>{entry.role === "operator" ? "Remove Admin" : "Remove Moderator"}</Text>
                                  </TouchableOpacity>
                                ) : (
                                  <OwnerDisabledReason reason={entry.role === "operator" ? "Admin removal requires Owner or admin_grants." : "Moderator removal requires Owner or manage_moderators."} />
                                )}
                              </View>
                            ) : null}
                          </OwnerControlRow>
                        );
                      })}
                    </View>
                  ) : (
                    <OwnerEmptyState
                      body="The backed roster query succeeded, but no active staff records are visible in this slice."
                      title="No Active Staff Rows"
                    />
                  )}
                  {revokedPlatformRoleRoster.length ? (
                    <View style={styles.ownerNestedProofPanel}>
                      <View style={styles.ownerSectionHeaderRow}>
                        <Text style={styles.ownerSectionTitle}>Revoked / History Rows</Text>
                        <OwnerStatusPill label={`${revokedPlatformRoleRoster.length} rows`} tone="locked" />
                      </View>
                      {revokedPlatformRoleRoster.slice(0, 4).map((entry) => (
                        <OwnerControlRow
                          key={`revoked-staff-role-${entry.id}`}
                          message={`${formatPlatformRoleDisplayLabel(entry.role)} · ${entry.grantedAt ? formatModerationTimestamp(entry.grantedAt) : "time unknown"}`}
                          statusLabel="Revoked"
                          title={maskOperatorIdentity(entry.identityLabel)}
                          tone="locked"
                        />
                      ))}
                    </View>
                  ) : null}
                </View>

                <View style={styles.contentPanel}>
                  <View style={styles.ownerSectionHeaderRow}>
                    <Text style={styles.ownerSectionTitle}>Grant / Revoke Staff Access</Text>
                    <OwnerStatusPill label={canManageAdminStaff || canManageModeratorStaff ? "Backed RPC" : "Locked"} tone={canManageAdminStaff || canManageModeratorStaff ? "success" : "locked"} />
                  </View>
                  <Text style={styles.contentSignalBody}>Emails normalize to lowercase. Admin is stored as internal operator. Owner grants are not available from this generic panel.</Text>
                  {canManageAdminStaff || canManageModeratorStaff ? (
                    <>
                      <TextInput
                        value={staffRoleEmail}
                        onChangeText={setStaffRoleEmail}
                        placeholder="staff@example.com"
                        placeholderTextColor="#788196"
                        autoCapitalize="none"
                        keyboardType="email-address"
                        style={styles.input}
                      />
                      <View style={styles.toggleRowWrap}>
                        {staffRoleOptions.map((option) => (
                          <TouchableOpacity
                            key={option.key}
                            style={[styles.toggleChip, staffRoleTarget === option.key && styles.toggleChipActive]}
                            onPress={() => setStaffRoleTarget(option.key)}
                            disabled={staffRoleBusy !== null}
                          >
                            <Text style={[styles.toggleChipText, staffRoleTarget === option.key && styles.toggleChipTextActive]}>
                              {option.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TextInput
                        value={staffRoleReason}
                        onChangeText={setStaffRoleReason}
                        placeholder="Audit reason required"
                        placeholderTextColor="#788196"
                        style={styles.input}
                      />
                      <View style={styles.configListActions}>
                        <TouchableOpacity
                          style={[styles.orderBtn, (staffRoleBusy !== null || staffRoleReason.trim().length < 6) && styles.configSaveBtnDisabled]}
                          onPress={() => void runStaffRoleGrant()}
                          disabled={staffRoleBusy !== null || staffRoleReason.trim().length < 6}
                        >
                          <Text style={styles.orderBtnText}>{staffRoleBusy === "grant" ? "Granting..." : "Grant Role"}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.orderBtn, (staffRoleBusy !== null || staffRoleReason.trim().length < 6) && styles.configSaveBtnDisabled]}
                          onPress={() => confirmStaffRoleRevoke()}
                          disabled={staffRoleBusy !== null || staffRoleReason.trim().length < 6}
                        >
                          <Text style={styles.orderBtnText}>{staffRoleBusy === "revoke" ? "Removing..." : "Remove Role"}</Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <OwnerDisabledReason reason="Staff management actions require active Owner, admin_grants, or manage_moderators. Moderators cannot add or remove staff." />
                  )}
                </View>

                <View style={styles.contentPanel}>
                  <View style={styles.ownerSectionHeaderRow}>
                    <Text style={styles.ownerSectionTitle}>Scoped Permission Matrix</Text>
                    <OwnerStatusPill label={staffPermissionLoadState} tone={staffPermissionDraftChanged ? "manual" : staffPermissionSavedKeys ? "success" : "locked"} />
                  </View>
                  <Text style={styles.contentSignalBody}>Tap any permission to toggle it. Multiple permissions can stay selected before saving the full backed set.</Text>
                  {canManageStaffPermissions ? (
                    <>
                      <TextInput
                        value={staffPermissionEmail}
                        onChangeText={setStaffPermissionEmail}
                        placeholder="admin-or-moderator@example.com"
                        placeholderTextColor="#788196"
                        autoCapitalize="none"
                        keyboardType="email-address"
                        style={styles.input}
                      />
                      <View style={styles.configListActions}>
                        <TouchableOpacity
                          style={[styles.orderBtn, staffPermissionBusy !== null && styles.configSaveBtnDisabled]}
                          onPress={() => void loadStaffPermissionSet()}
                          disabled={staffPermissionBusy !== null}
                        >
                          <Text style={styles.orderBtnText}>{staffPermissionBusy === "load" ? "Loading..." : "Load Current"}</Text>
                        </TouchableOpacity>
                        <OwnerStatusPill label={selectedPermissionCountLabel} tone={staffPermissionSelectedKeys.length ? "info" : "locked"} />
                      </View>
                      <View style={styles.contentSignalGrid}>
                        {staffPermissionGroups.map((group) => (
                          <View key={group.key} style={styles.contentSignalTile}>
                            <Text style={styles.contentSignalTitle}>{group.label}</Text>
                            <Text style={styles.contentSignalBody}>{group.body}</Text>
                            <View style={styles.toggleRowWrap}>
                              {group.permissions.map((permissionKey) => {
                                const selected = staffPermissionSelectedKeys.includes(permissionKey);
                                return (
                                  <TouchableOpacity
                                    key={permissionKey}
                                    style={[
                                      styles.toggleChip,
                                      selected && styles.toggleChipActive,
                                      (staffPermissionSavedKeys === null || staffPermissionBusy !== null) && styles.toggleChipDisabled,
                                    ]}
                                    onPress={() => toggleStaffPermissionDraft(permissionKey)}
                                    disabled={staffPermissionSavedKeys === null || staffPermissionBusy !== null}
                                  >
                                    <Text style={[styles.toggleChipText, selected && styles.toggleChipTextActive]}>
                                      {staffPermissionLabelByKey[permissionKey]}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>
                          </View>
                        ))}
                      </View>
                      <OwnerDetailGrid
                        rows={[
                          { label: "Saved Set", value: staffPermissionSavedKeys ? formatPermissionSummary(staffPermissionSavedKeys) : "load current permissions first" },
                          { label: "Draft Set", value: formatPermissionSummary(staffPermissionSelectedKeys) },
                          { label: "Will Grant", value: formatPermissionSummary(staffPermissionGrantDelta) },
                          { label: "Will Revoke", value: formatPermissionSummary(staffPermissionRevokeDelta) },
                        ]}
                      />
                      <TextInput
                        value={staffPermissionExpiresAt}
                        onChangeText={setStaffPermissionExpiresAt}
                        placeholder="Expires at ISO date/time, optional"
                        placeholderTextColor="#788196"
                        style={styles.input}
                        autoCapitalize="none"
                      />
                      <TextInput
                        value={staffPermissionReason}
                        onChangeText={setStaffPermissionReason}
                        placeholder="Audit reason required"
                        placeholderTextColor="#788196"
                        style={styles.input}
                      />
                      <View style={styles.configListActions}>
                        <TouchableOpacity
                          style={[styles.orderBtn, (!staffPermissionDraftChanged || staffPermissionBusy !== null) && styles.configSaveBtnDisabled]}
                          onPress={resetStaffPermissionDraft}
                          disabled={!staffPermissionDraftChanged || staffPermissionBusy !== null}
                        >
                          <Text style={styles.orderBtnText}>Reset Draft</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.ownerPrimaryButton, !canSaveStaffPermissions && styles.configSaveBtnDisabled]}
                          onPress={queueStaffPermissionSave}
                          disabled={!canSaveStaffPermissions}
                        >
                          {staffPermissionBusy === "save" ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.ownerPrimaryButtonText}>Save Permissions</Text>}
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <OwnerDisabledReason reason="Scoped permission editing is Owner-only in the current backend. Admins can manage roles only when separately granted admin_grants or manage_moderators." />
                  )}
                </View>

                <View style={styles.contentPanel}>
                  <View style={styles.ownerSectionHeaderRow}>
                    <Text style={styles.ownerSectionTitle}>Permission Templates Shortcut</Text>
                    <OwnerStatusPill label={canManagePermissionTemplates ? "Connected" : "Not Connected"} tone={canManagePermissionTemplates ? "info" : "locked"} />
                  </View>
                  <Text style={styles.contentSignalBody}>Templates apply permission bundles only. They never create platform roles and are managed from the dedicated Permission Templates tab.</Text>
                  <TouchableOpacity
                    style={[styles.orderBtn, !canManagePermissionTemplates && styles.configSaveBtnDisabled]}
                    onPress={() => setOperatorTab("permission-templates")}
                    disabled={!canManagePermissionTemplates}
                  >
                    <Text style={styles.orderBtnText}>{canManagePermissionTemplates ? "Open Permission Templates" : "Template application not connected"}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.contentPanel}>
                  <View style={styles.ownerSectionHeaderRow}>
                    <Text style={styles.ownerSectionTitle}>Protected Owner Rules</Text>
                    <OwnerStatusPill label="Fail Closed" tone="success" />
                  </View>
                  <OwnerDetailGrid
                    rows={[
                      { label: "Owner Records", value: "Protected; at least one active Owner must remain" },
                      { label: "Owner Grants", value: "Dedicated bootstrap/protected flow only" },
                      { label: "Admin Grants", value: "Owner or admin_grants; never self-grant" },
                      { label: "Moderator Grants", value: "Owner or manage_moderators" },
                      { label: "Moderator Boundary", value: "Moderators cannot grant roles or permissions" },
                    ]}
                  />
                </View>

                <View style={styles.contentPanel}>
                  <View style={styles.ownerSectionHeaderRow}>
                    <Text style={styles.ownerSectionTitle}>Role Audit Timeline</Text>
                    <OwnerStatusPill label={roleAuditLoading ? "Loading" : roleAuditEvents.length ? `${roleAuditEvents.length} rows` : "No Rows"} tone={roleAuditEvents.length ? "info" : "locked"} />
                  </View>
                  <OwnerFilterChips options={roleAuditFilterOptions} value={roleAuditFilter} onChange={setRoleAuditFilter} />
                  {roleAuditLoading ? (
                    <View style={styles.configLoadingRow}>
                      <ActivityIndicator color="#fff" />
                      <Text style={styles.configLoadingText}>Loading role audit timeline...</Text>
                    </View>
                  ) : roleAuditEvents.length ? (
                    <View style={styles.ownerControlList}>
                      {roleAuditEvents.map((entry) => (
                        <OwnerControlRow
                          key={`role-audit-${entry.auditKind}-${entry.id}`}
                          message={`${entry.createdAt ? formatModerationTimestamp(entry.createdAt) : "Time unknown"} · Target ${maskOperatorIdentity(entry.targetEmail ?? entry.targetUserId ?? "unknown")}`}
                          meta={entry.reason ? formatAuditDisplayText(entry.reason) : "Reason not returned"}
                          statusLabel={entry.auditKind === "permission" ? formatModerationToken(entry.permissionKey) : formatPlatformRoleDisplayLabel(entry.role ?? "moderator")}
                          title={formatModerationToken(entry.action)}
                          tone={roleAuditTone(entry)}
                        />
                      ))}
                    </View>
                  ) : (
                    <OwnerEmptyState
                      body="Role history exists only when the backed staff audit feed returns rows for this filter. No synthetic proof rows are shown."
                      title="No Role Audit Rows"
                    />
                  )}
                </View>
              </>
            ) : null}

            {operatorTab === "audit" ? (
            <>
              <View style={styles.configListRow}>
                <View style={styles.configListCopy}>
                  <Text style={styles.configListTitle}>Immutable admin audit log foundation</Text>
                  <Text style={styles.configListBody}>
                    {adminImmutableAuditReadModel.connected
                      ? "Immutable admin audit log foundation is connected."
                      : "Immutable admin audit logs are not connected yet."}
                  </Text>
                  <Text style={styles.configListBody}>
                    {formatImmutableAuditCount(
                      adminImmutableAuditReadModel.auditLogCount,
                      adminImmutableAuditReadModel.loading,
                    )}
                  </Text>
                  <Text style={styles.configListBody}>Audit rows are append-only.</Text>
                  <Text style={styles.configListBody}>Dangerous money/fraud actions are still not active.</Text>
                </View>
                <View style={[styles.badge, adminImmutableAuditReadModel.connected ? styles.badgeOn : styles.badgeOff]}>
                  <Text style={styles.badgeText}>
                    {adminImmutableAuditReadModel.connected ? "Connected" : "Not connected"}
                  </Text>
                </View>
              </View>

              {adminImmutableAuditReadModel.loading ? (
                <View style={styles.configLoadingRow}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.configLoadingText}>Loading immutable audit rows…</Text>
                </View>
              ) : adminImmutableAuditReadModel.connected && adminImmutableAuditReadModel.latestRows.length ? (
                adminImmutableAuditReadModel.latestRows.map((entry) => (
                  <View key={`immutable-audit-${entry.id}`} style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>{formatModerationToken(entry.action)}</Text>
                      <Text style={styles.configListBody}>
                        {entry.createdAt ? formatModerationTimestamp(entry.createdAt) : "Audit timestamp unavailable"}
                      </Text>
                      <Text style={styles.configListBody}>{`Category ${formatModerationToken(entry.actionCategory)}`}</Text>
                      <Text style={styles.configListBody}>{`Actor ${formatImmutableAuditActor(entry)}`}</Text>
                      <Text style={styles.configListBody}>{`Target ${formatImmutableAuditTarget(entry)}`}</Text>
                      {entry.reason ? (
                        <Text style={styles.configListBody}>{formatAuditDisplayText(entry.reason)}</Text>
                      ) : null}
                    </View>

                    <View style={styles.badgesRow}>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{formatModerationToken(entry.severity)}</Text>
                      </View>
                      {entry.foundationProof ? (
                        <View style={[styles.badge, styles.badgeDraft]}>
                          <Text style={styles.badgeText}>Proof-only</Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))
              ) : adminImmutableAuditReadModel.connected ? (
                <View style={styles.configListRow}>
                  <View style={styles.configListCopy}>
                    <Text style={styles.configListTitle}>No immutable audit rows visible</Text>
                    <Text style={styles.configListBody}>
                      The immutable audit table is readable, but no rows are visible in the latest slice yet.
                    </Text>
                  </View>
                </View>
              ) : null}

              <View style={styles.configListRow}>
                <View style={styles.configListCopy}>
                  <Text style={styles.configListTitle}>Derived audit summary</Text>
                  <Text style={styles.configListBody}>
                    This summary is separate from immutable audit logs. It is limited to current role-record metadata and safety-report audit context.
                  </Text>
                </View>
              </View>
            </>
            ) : null}

            {operatorTab === "audit" && (canManagePrivilegedWrites || canReviewSafetyReports) ? (
              adminAuditLogLoading ? (
                <View style={styles.configLoadingRow}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.configLoadingText}>Loading derived audit summary…</Text>
                </View>
              ) : adminAuditLog.length ? (
	                adminAuditLog.map((entry) => (
	                  <View key={entry.id} style={styles.configListRow}>
	                    <View style={styles.configListCopy}>
	                      <Text style={styles.configListTitle}>{entry.title}</Text>
                      <Text style={styles.configListBody}>
                        {entry.occurredAt ? formatModerationTimestamp(entry.occurredAt) : "Audit timestamp unavailable"}
                      </Text>
	                      <Text style={styles.configListBody}>{formatAuditDisplayText(entry.detail)}</Text>
	                      {entry.actorLabel ? (
	                        <Text style={styles.configListBody}>{`Actor ${formatAuditDisplayText(entry.actorLabel)}`}</Text>
	                      ) : null}
	                      {entry.auditOwnerKey ? (
	                        <Text style={styles.configListBody}>{`Audit owner ${formatCompactIdentifier(entry.auditOwnerKey)}`}</Text>
	                      ) : null}
                    </View>

                    <View style={styles.badgesRow}>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{formatModerationToken(entry.kind)}</Text>
                      </View>
                      <View style={[styles.badge, entry.tone === "review" ? styles.badgeScheduled : styles.badgeDraft]}>
                        <Text style={styles.badgeText}>{entry.tone === "review" ? "Review Context" : "Role Record"}</Text>
                      </View>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.configListRow}>
                  <View style={styles.configListCopy}>
                    <Text style={styles.configListTitle}>No recent derived audit visibility records</Text>
                    <Text style={styles.configListBody}>
                      Current bounded audit visibility is ready, but there are no recent role-record or safety-report audit entries in this slice yet.
                    </Text>
                  </View>
                </View>
              )
            ) : operatorTab === "audit" ? (
              <View style={styles.configListRow}>
                <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Audit visibility stays permission-bound</Text>
                <Text style={styles.configListBody}>
                    Audit visibility requires privileged Owner access or a review-capable moderation role. No fake admin audit dashboard is shown otherwise.
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>
        ) : null}

        {operatorTab === "rachi" ? (
        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>RACHI / OFFICIAL ACCOUNT</Text>
              <Text style={styles.configTitle}>Official platform presence</Text>
              <Text style={styles.configBody}>
                Manage backed Rachi visibility from the Operator Center without turning Rachi into Admin. Backend platform roles control this surface.
              </Text>
            </View>
          </View>

          <View style={styles.badgesRow}>
            <View style={[styles.badge, styles.badgePublished]}>
              <Text style={styles.badgeText}>Backend Protected</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{RACHI_OFFICIAL_ACCOUNT.platformOwnershipLabel}</Text>
            </View>
            <View style={[styles.badge, styles.badgeScheduled]}>
              <Text style={styles.badgeText}>{RACHI_OFFICIAL_ACCOUNT.platformRoleLabel}</Text>
            </View>
            <View style={[styles.badge, styles.badgeOff]}>
              <Text style={styles.badgeText}>Not Admin Authority</Text>
            </View>
          </View>

          <View style={styles.dashboardGrid}>
            {rachiManagementCards.map((card) => (
              <View key={card.label} style={styles.dashboardMetricCard}>
                <Text style={styles.dashboardMetricLabel}>{card.label}</Text>
                <Text style={styles.dashboardMetricValue}>{card.value}</Text>
                <Text style={styles.dashboardMetricBody}>{card.body}</Text>
              </View>
            ))}
          </View>

          <View style={styles.configList}>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Operator boundary</Text>
                <Text style={styles.configListBody}>
                  {"Rachi is Chi'llywood's official concierge account. Rachi does not grant operator permissions, self-authorize moderation, or replace backend platform roles."}
                </Text>
              </View>
            </View>

            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Public-facing presence</Text>
                <Text style={styles.configListBody}>{RACHI_OFFICIAL_ACCOUNT.conciergeHeadline}</Text>
                <Text style={styles.configListBody}>{RACHI_OFFICIAL_ACCOUNT.trustSummary}</Text>
                <Text style={styles.configListBody}>
                  {`Audit owner ${RACHI_OFFICIAL_ACCOUNT.auditOwnerKey} · User ${formatCompactIdentifier(RACHI_OFFICIAL_ACCOUNT.userId)}`}
                </Text>
              </View>
            </View>

            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Backed guidance topics</Text>
                <Text style={styles.configListBody}>{RACHI_OFFICIAL_ACCOUNT.guidanceTopics.join(" · ")}</Text>
              </View>
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() =>
                    router.push({
                      pathname: "/profile/[userId]",
                      params: { userId: RACHI_OFFICIAL_ACCOUNT.userId },
                    })
                  }
                >
                  <Text style={styles.actionText}>Open Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => router.push("/chat")}>
                  <Text style={styles.actionText}>Open Chat</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
        ) : null}

        {operatorTab === "users" ? (
        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>USERS</Text>
              <Text style={styles.configTitle}>Users</Text>
              <Text style={styles.configBody}>
                Future admin user tools will show account, profile, channel, Premium, and restriction status here.
              </Text>
            </View>
            <View style={[styles.badge, styles.badgeOff]}>
              <Text style={styles.badgeText}>Foundation only</Text>
            </View>
          </View>
          <View style={styles.configListRow}>
            <View style={styles.configListCopy}>
              <Text style={styles.configListTitle}>User search is not connected yet.</Text>
              <Text style={styles.configListBody}>
                No user ban, suspend, upload-disable, live-disable, reset-password, entitlement-edit, or deletion action is exposed in V1A.
              </Text>
            </View>
          </View>
        </View>
        ) : null}

        {operatorTab === "premium" ? (
        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>PREMIUM</Text>
              <Text style={styles.configTitle}>Premium / Entitlements</Text>
              <Text style={styles.configBody}>
                RevenueCat remains Premium truth. V1A only reads backed entitlement signals when the current admin role can safely read them.
              </Text>
            </View>
            <View style={[styles.badge, styles.badgeScheduled]}>
              <Text style={styles.badgeText}>Read-only</Text>
            </View>
          </View>
          <View style={styles.dashboardGrid}>
            <View style={[
              styles.dashboardMetricCard,
              adminV1ReadModel.premiumActiveCount === null && styles.dashboardMetricCardUnavailable,
            ]}>
              <Text style={styles.dashboardMetricLabel}>Active Premium</Text>
              <Text style={styles.dashboardMetricValue}>
                {formatAdminV1Count(adminV1ReadModel.premiumActiveCount, adminV1ReadModel.loading)}
              </Text>
              <Text style={styles.dashboardMetricBody}>
                {adminV1ReadModel.premiumActiveCount === null
                  ? "Entitlement counts are not connected yet."
                  : "Count comes from active, trialing, and grace-period user_entitlements rows."}
              </Text>
            </View>
            <View style={styles.dashboardMetricCard}>
              <Text style={styles.dashboardMetricLabel}>Manual Premium Toggles</Text>
              <Text style={styles.dashboardMetricValue}>Not available</Text>
              <Text style={styles.dashboardMetricBody}>Manual Premium toggles are not available in V1A.</Text>
            </View>
          </View>
        </View>
        ) : null}

        {operatorTab === "kill-switches" ? (
        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>KILL SWITCHES</Text>
              <Text style={styles.configTitle}>Kill Switches</Text>
              <Text style={styles.configBody}>
                Typed runtimeControls defaults now live under app_configurations.config. These rows are read-only foundation, not working toggles.
              </Text>
            </View>
            <View style={[styles.badge, styles.badgeScheduled]}>
              <Text style={styles.badgeText}>Configured foundation</Text>
            </View>
          </View>
          <View style={styles.configList}>
            {plannedKillSwitchRows.map((row) => {
              const configuredValue = row.controlKey
                ? experienceConfig.runtimeControls[row.controlKey]
                : null;
              const isConfiguredFoundation = configuredValue !== null;

              return (
                <View key={row.label} style={styles.configListRow}>
                  <View style={styles.configListCopy}>
                    <Text style={styles.configListTitle}>{row.label}</Text>
                    <Text style={styles.configListBody}>
                      {isConfiguredFoundation
                        ? `${formatRuntimeControlValue(configuredValue)}. ${row.body}`
                        : row.body}
                    </Text>
                  </View>
                  <View style={[
                    styles.badge,
                    isConfiguredFoundation ? styles.badgeScheduled : styles.badgeOff,
                  ]}>
                    <Text style={styles.badgeText}>
                      {isConfiguredFoundation ? row.badgeLabel ?? "Configured foundation" : "Not connected yet"}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
        ) : null}

        {operatorTab === "usage" ? (
        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>USAGE</Text>
              <Text style={styles.configTitle}>Usage</Text>
              <Text style={styles.configBody}>
                Usage combines existing room/upload DB estimates with 37-39 metering foundations. No value here is billing or cost truth.
              </Text>
            </View>
            <View style={[styles.badge, styles.badgeScheduled]}>
              <Text style={styles.badgeText}>Read-only</Text>
            </View>
          </View>
          <View style={styles.configList}>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Internal Usage Metering</Text>
                <Text style={styles.configListBody}>
                  {adminV1ReadModel.internalUsageSchemaConnected
                    ? `Schema connected. ${adminV1ReadModel.usageMeterEventsCount ?? 0} raw event row${adminV1ReadModel.usageMeterEventsCount === 1 ? "" : "s"}, ${adminV1ReadModel.usageDailySummariesCount ?? 0} daily summary row${adminV1ReadModel.usageDailySummariesCount === 1 ? "" : "s"}, ${adminV1ReadModel.usageMonthlySummariesCount ?? 0} monthly summary row${adminV1ReadModel.usageMonthlySummariesCount === 1 ? "" : "s"}.`
                    : "Schema added, admin read not connected yet."}
                </Text>
                <Text style={styles.configListBody}>
                  Read-only foundation. Creator video upload usage writer is active; broader app usage writers are not connected yet.
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Provider Usage Imports</Text>
                <Text style={styles.configListBody}>
                  {adminV1ReadModel.providerUsageSchemaConnected
                    ? `Schema connected. ${adminV1ReadModel.providerUsageImportsCount ?? 0} import record${adminV1ReadModel.providerUsageImportsCount === 1 ? "" : "s"} and ${adminV1ReadModel.providerUsageDailyCount ?? 0} provider usage row${adminV1ReadModel.providerUsageDailyCount === 1 ? "" : "s"} are readable.`
                    : "Provider import schema is not connected yet."}
                </Text>
                <Text style={styles.configListBody}>Provider imports are server-side only.</Text>
                <Text style={styles.configListBody}>
                  Provider imports are not customer billing, overage, payout, revenue, or invoice truth.
                </Text>
                <Text style={styles.configListBody}>Cloudflare R2 import uses provider analytics when configured.</Text>
                <Text style={styles.configListBody}>
                  Hetzner Object Storage import uses S3 bucket inventory metadata when configured.
                </Text>
                <Text style={styles.configListBody}>Hetzner server import uses provider server metrics when configured.</Text>
                <Text style={styles.configListBody}>
                  Hetzner Object Storage storage values are metadata estimates, not Hetzner traffic or billing truth.
                </Text>
                <Text style={styles.configListBody}>
                  OVH imports need a later exact provider API lane.
                </Text>
                <View style={styles.providerUsageGrid}>
                  {adminV1ReadModel.providerImportStatuses.map((providerStatus) => (
                    <View key={providerStatus.provider} style={styles.providerUsageCard}>
                      <View style={styles.providerUsageHeader}>
                        <View style={styles.providerUsageTitleCopy}>
                          <Text style={styles.configListTitle}>{providerStatus.label}</Text>
                          <Text style={styles.configListBody}>{formatProviderUsageSummary(providerStatus)}</Text>
                        </View>
                        <View style={[styles.badge, getProviderUsageStatusStyle(providerStatus.status)]}>
                          <Text style={styles.badgeText}>
                            {formatProviderUsageStatusLabel(providerStatus.status)}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.configListBody}>
                        {`Latest import: ${providerStatus.latestImportStatus ?? "none"} · ${formatProviderImportDate(providerStatus.latestImportAt)}`}
                      </Text>
                      {providerStatus.latestImportRecords !== null ? (
                        <Text style={styles.configListBody}>
                          {`Latest import records: ${providerStatus.latestImportRecords}`}
                        </Text>
                      ) : null}
                      {providerStatus.last7DaysRowsCount !== null ? (
                        <Text style={styles.configListBody}>
                          {`Last 7 days rows: ${providerStatus.last7DaysRowsCount} · Provider import`}
                        </Text>
                      ) : null}
                      {providerStatus.storageBytesLast7Days !== null ? (
                        <Text style={styles.configListBody}>
                          {`Last 7 days storage: ${formatUsageBytes(providerStatus.storageBytesLast7Days)} · Provider import, not billing truth`}
                        </Text>
                      ) : null}
                      {providerStatus.requestCountLast7Days !== null ? (
                        <Text style={styles.configListBody}>
                          {`Last 7 days requests: ${providerStatus.requestCountLast7Days} · Provider import`}
                        </Text>
                      ) : null}
                      {providerStatus.providerMetricCountLast7Days !== null ? (
                        <Text style={styles.configListBody}>
                          {`Last 7 days network metric: ${providerStatus.providerMetricCountLast7Days} · Provider import, not billing truth`}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                </View>
                {adminV1ReadModel.providerImportedStorageBytes !== null ? (
                  <Text style={styles.configListBody}>
                    {`Provider imported storage, last 7 days: ${formatUsageBytes(adminV1ReadModel.providerImportedStorageBytes)}. This is provider import data only.`}
                  </Text>
                ) : null}
                {adminV1ReadModel.providerImportedRequestCount !== null ? (
                  <Text style={styles.configListBody}>
                    {`Provider imported requests, last 7 days: ${adminV1ReadModel.providerImportedRequestCount}. This is not billing or revenue truth.`}
                  </Text>
                ) : null}
                {adminV1ReadModel.providerImportedNetworkMetricCount !== null ? (
                  <Text style={styles.configListBody}>
                    {`Provider imported network metrics, last 7 days: ${adminV1ReadModel.providerImportedNetworkMetricCount}. Units remain provider metrics unless normalized later.`}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Reconciliation</Text>
                <Text style={styles.configListBody}>
                  Provider billing reconciliation is backend-only foundation. It compares already-backed provider usage rows with internal summaries; it does not import provider bills.
                </Text>
                {adminV1ReadModel.providerUsageReconciliationCount !== null ? (
                  <Text style={styles.configListBody}>
                    {`${adminV1ReadModel.providerUsageReconciliationCount} reconciliation foundation row${adminV1ReadModel.providerUsageReconciliationCount === 1 ? "" : "s"} readable. Pending: ${adminV1ReadModel.providerUsageReconciliationPendingCount ?? 0}; matched: ${adminV1ReadModel.providerUsageReconciliationMatchedCount ?? 0}; variance: ${adminV1ReadModel.providerUsageReconciliationVarianceCount ?? 0}.`}
                  </Text>
                ) : null}
                {adminV1ReadModel.latestProviderUsageReconciliationStatus ? (
                  <Text style={styles.configListBody}>
                    {`Latest reconciliation: ${adminV1ReadModel.latestProviderUsageReconciliationStatus} · ${formatProviderImportDate(adminV1ReadModel.latestProviderUsageReconciliationAt)}`}
                  </Text>
                ) : null}
                <Text style={styles.configListBody}>
                  Imported provider billing snapshots: {adminV1ReadModel.providerBillingSnapshotImportedCount ?? 0}. No provider billing total is customer billing truth.
                </Text>
                <Text style={styles.configListBody}>No invoice send, customer charge, payment link, overage billing, or fake provider bill is active.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Live Now</Text>
                <Text style={styles.configListBody}>
                  {adminV1ReadModel.activeLiveRoomCount === null
                    ? "Live usage is not connected yet."
                    : `${adminV1ReadModel.activeLiveRoomCount} active live room record${adminV1ReadModel.activeLiveRoomCount === 1 ? "" : "s"} · DB estimate`}
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Watch-Parties</Text>
                <Text style={styles.configListBody}>
                  {adminV1ReadModel.activeWatchPartyCount === null
                    ? "Watch-party usage is not connected yet."
                    : `${adminV1ReadModel.activeWatchPartyCount} active watch-party room record${adminV1ReadModel.activeWatchPartyCount === 1 ? "" : "s"} · DB estimate`}
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Uploads / Media</Text>
                <Text style={styles.configListBody}>
                  {adminV1ReadModel.uploadsTodayCount === null
                    ? "Upload counts are not connected yet."
                    : `${adminV1ReadModel.uploadsTodayCount} creator video upload record${adminV1ReadModel.uploadsTodayCount === 1 ? "" : "s"} created today.`}
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Storage Metadata Estimate</Text>
                <Text style={styles.configListBody}>
                  {adminV1ReadModel.storageMetadataEstimateBytes === null
                    ? "Storage metadata estimate is not connected yet."
                    : `${formatUsageBytes(adminV1ReadModel.storageMetadataEstimateBytes)} · Metadata estimate from creator-video and social-attachment records.`}
                </Text>
                {adminV1ReadModel.storageMetadataRowsRead !== null ? (
                  <Text style={styles.configListBody}>
                    {`${adminV1ReadModel.storageMetadataRowsRead} metadata row${adminV1ReadModel.storageMetadataRowsRead === 1 ? "" : "s"} read. This is not storage billing truth.`}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Participant-Minutes DB Estimate</Text>
                <Text style={styles.configListBody}>
                  {adminV1ReadModel.participantMinutesEstimate === null
                    ? "Participant-minute estimate is not connected yet."
                    : `${formatUsageMinutes(adminV1ReadModel.participantMinutesEstimate)} today · DB estimate from room membership records.`}
                </Text>
                {adminV1ReadModel.participantMembershipRowsRead !== null ? (
                  <Text style={styles.configListBody}>
                    {`${adminV1ReadModel.participantMembershipRowsRead} membership row${adminV1ReadModel.participantMembershipRowsRead === 1 ? "" : "s"} read. This is not LiveKit billing truth.`}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Bandwidth Metering</Text>
                <Text style={styles.configListBody}>
                  {adminV1ReadModel.bandwidthMeteringBytes === null
                    ? "Bandwidth metering is not connected yet."
                    : `${formatUsageBytes(adminV1ReadModel.bandwidthMeteringBytes)} today · Backed metering-event foundation.`}
                </Text>
                {adminV1ReadModel.bandwidthMeteringRowsRead !== null && adminV1ReadModel.bandwidthMeteringRowsRead > 0 ? (
                  <Text style={styles.configListBody}>
                    {`${adminV1ReadModel.bandwidthMeteringRowsRead} bandwidth event row${adminV1ReadModel.bandwidthMeteringRowsRead === 1 ? "" : "s"} read. This is not ad, payout, or creator revenue truth.`}
                  </Text>
                ) : null}
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Cost Risk Flags</Text>
                <Text style={styles.configListBody}>LiveKit metering is not connected yet.</Text>
                <Text style={styles.configListBody}>Provider-side storage and bandwidth billing are not connected yet.</Text>
              </View>
            </View>
          </View>
        </View>
        ) : null}

        {operatorTab === "ads" ? (
        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>ADS</Text>
              <Text style={styles.configTitle}>Ads</Text>
              <Text style={styles.configBody}>Provider: placeholder / not connected. No real ads are live.</Text>
            </View>
            <View style={[styles.badge, styles.badgeOff]}>
              <Text style={styles.badgeText}>Foundation only</Text>
            </View>
          </View>
          <View style={styles.configList}>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Planned provider</Text>
                <Text style={styles.configListBody}>
                  {`Current foundation provider: ${adsProviderStatus.provider} / ${adsProviderStatus.isConnected ? "connected" : "not connected"}`}
                </Text>
                <Text style={styles.configListBody}>{adsProviderStatus.message}</Text>
                <Text style={styles.configListBody}>Primary: AppLovin MAX</Text>
                <Text style={styles.configListBody}>Unity LevelPlay / Unity Ads may be added through AppLovin MAX later.</Text>
                <Text style={styles.configListBody}>No AdMob-only system.</Text>
                <Text style={styles.configListBody}>
                  {FEATURE_FLAGS.monetization.ads
                    ? "Static app ad flag exists, but provider/caps are not connected yet."
                    : "Static app ad flag is off; provider/caps are not connected yet."}
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Ads Launch config source</Text>
                <Text style={styles.configListBody}>app_config.adsLaunch is normalized through code-owned defaults.</Text>
                <Text style={styles.configListBody}>
                  Native/feed and interstitial runtime owners read this normalized source with default-disabled fallback.
                </Text>
                <Text style={styles.configListBody}>This is read-only foundation copy; no Admin ad toggles are live.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>V1A config values</Text>
                <Text style={styles.configListBody}>{`ads_enabled: ${String(adsLaunchConfig.ads_enabled)}`}</Text>
                <Text style={styles.configListBody}>{`ads_provider: ${adsLaunchConfig.ads_provider}`}</Text>
                <Text style={styles.configListBody}>{`interstitial_enabled: ${String(adsLaunchConfig.interstitial_enabled)}`}</Text>
                <Text style={styles.configListBody}>{`native_feed_enabled: ${String(adsLaunchConfig.native_feed_enabled)}`}</Text>
                <Text style={styles.configListBody}>{`premium_users_ad_free: ${String(adsLaunchConfig.premium_users_ad_free)}`}</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Native/feed placement</Text>
                <Text style={styles.configListBody}>Native/feed placement: Home placeholder foundation</Text>
                <Text style={styles.configListBody}>This is read-only foundation copy; real ads are not serving.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Interstitial placement</Text>
                <Text style={styles.configListBody}>Interstitial placement: placeholder controller foundation</Text>
                <Text style={styles.configListBody}>No real interstitial ads are live.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Launch caps</Text>
                <Text style={styles.configListBody}>
                  {`Base active session: ${adsLaunchConfig.session_interstitial_base_cap} interstitial + ${adsLaunchConfig.session_native_base_cap} native/feed`}
                </Text>
                <Text style={styles.configListBody}>
                  {`After ${adsLaunchConfig.long_use_minutes} active browsing minutes: +${adsLaunchConfig.long_use_interstitial_extra_cap} interstitial + ${adsLaunchConfig.long_use_native_extra_cap} native/feed`}
                </Text>
                <Text style={styles.configListBody}>
                  {`Daily hard cap: ${adsLaunchConfig.daily_interstitial_cap} interstitial + ${adsLaunchConfig.daily_native_cap} native/feed`}
                </Text>
                <Text style={styles.configListBody}>Premium users: zero ads</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Timing guardrails</Text>
                <Text style={styles.configListBody}>
                  {`No interstitial before ${adsLaunchConfig.min_seconds_before_first_interstitial} active browsing seconds.`}
                </Text>
                <Text style={styles.configListBody}>
                  {`At least ${adsLaunchConfig.min_seconds_between_interstitials} seconds between interstitials.`}
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Forbidden contexts</Text>
                <Text style={styles.configListBody}>No ads inside active LiveKit rooms</Text>
                <Text style={styles.configListBody}>No ads during active video playback</Text>
                <Text style={styles.configListBody}>No ads while typing/commenting</Text>
                <Text style={styles.configListBody}>No ads during upload</Text>
                <Text style={styles.configListBody}>No ads on subscribe/payment screens</Text>
                <Text style={styles.configListBody}>No ads immediately at app launch</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>CTV future</Text>
                <Text style={styles.configListBody}>CTV ads are not active yet.</Text>
                <Text style={styles.configListBody}>{"Future inventory: Chi'llywood Originals and network-style content."}</Text>
                <Text style={styles.configListBody}>
                  {`ctv_ads_enabled_later: ${String(adsLaunchConfig.ctv_ads_enabled_later)}`}
                </Text>
                <Text style={styles.configListBody}>
                  {`creator_page_ads_enabled_later: ${String(adsLaunchConfig.creator_page_ads_enabled_later)}`}
                </Text>
                <Text style={styles.configListBody}>
                  {`sponsor_slots_enabled_later: ${String(adsLaunchConfig.sponsor_slots_enabled_later)}`}
                </Text>
              </View>
            </View>
          </View>
        </View>
        ) : null}

        {operatorTab === "revenue" ? (
        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>REVENUE</Text>
              <Text style={styles.configTitle}>Revenue</Text>
              <Text style={styles.configBody}>
                Finance ledger foundation is read-only. Money totals are not shown unless real provider-backed ledger data is reconciled.
              </Text>
            </View>
            <View style={[styles.badge, styles.badgeOff]}>
              <Text style={styles.badgeText}>Foundation only</Text>
            </View>
          </View>
          <View style={styles.configList}>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Finance ledger events</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.financeLedgerEventCount,
                    adminFinanceReadModel.loading,
                    "foundation event",
                    "foundation events",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Counts only. This is not a live revenue total, ad money, sponsor money, or creator-facing money total.
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Real Source Revenue Imports</Text>
                <Text style={styles.configListBody}>
                  Import records: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorRevenueSourceImportRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation import record",
                    "foundation import records",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Foundation-only rows: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorRevenueSourceImportFoundationCount,
                    adminFinanceReadModel.loading,
                    "foundation row",
                    "foundation rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Source not connected rows: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorRevenueSourceImportSourceNotConnectedCount,
                    adminFinanceReadModel.loading,
                    "source-not-connected row",
                    "source-not-connected rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Imported-later labels: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorRevenueSourceImportImportedLaterCount,
                    adminFinanceReadModel.loading,
                    "imported-later row",
                    "imported-later rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>Real source revenue imports are not connected yet.</Text>
                <Text style={styles.configListBody}>AppLovin, Stripe sponsor, tips, paid content, and network billing imports remain future lanes.</Text>
                <Text style={styles.configListBody}>No real source money has been imported.</Text>
                <Text style={styles.configListBody}>No creator earnings, payable balances, or payout ledger entries are created from source import foundation rows.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Creator Revenue Share Foundation</Text>
                <Text style={styles.configListBody}>
                  Rules: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorRevenueShareRuleCount,
                    adminFinanceReadModel.loading,
                    "foundation rule",
                    "foundation rules",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Ledger rows: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorRevenueShareLedgerEntryCount,
                    adminFinanceReadModel.loading,
                    "foundation row",
                    "foundation rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Foundation-only rows: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorRevenueShareLedgerFoundationCount,
                    adminFinanceReadModel.loading,
                    "foundation row",
                    "foundation rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>Creator revenue sharing is not active yet.</Text>
                <Text style={styles.configListBody}>Ledger rows are foundation-only.</Text>
                <Text style={styles.configListBody}>No source money has been imported.</Text>
                <Text style={styles.configListBody}>No creator earnings are payable.</Text>
                <Text style={styles.configListBody}>No payout ledger entries are created from these rows.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Premium entitlement counts</Text>
                <Text style={styles.configListBody}>
                  {adminV1ReadModel.premiumActiveCount === null
                    ? "Entitlement counts are not connected yet."
                    : `${adminV1ReadModel.premiumActiveCount} active Premium entitlement${adminV1ReadModel.premiumActiveCount === 1 ? "" : "s"} found.`}
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Creator Monetization Foundation</Text>
                <Text style={styles.configListBody}>
                  Monetization profiles: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorMonetizationProfileCount,
                    adminFinanceReadModel.loading,
                    "profile",
                    "profiles",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Paid content prices: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorContentPriceCount,
                    adminFinanceReadModel.loading,
                    "price row",
                    "price rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Purchases/access grants: {formatAdminFinanceCount(
                    adminFinanceReadModel.paidContentPurchaseCount,
                    adminFinanceReadModel.loading,
                    "purchase row",
                    "purchase rows",
                  )} / {formatAdminFinanceCount(
                    adminFinanceReadModel.contentAccessGrantCount,
                    adminFinanceReadModel.loading,
                    "access grant",
                    "access grants",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Products/orders: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorProductCount,
                    adminFinanceReadModel.loading,
                    "product",
                    "products",
                  )} / {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorProductOrderCount,
                    adminFinanceReadModel.loading,
                    "order",
                    "orders",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Tip transactions: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorTipTransactionCount,
                    adminFinanceReadModel.loading,
                    "tip row",
                    "tip rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  These are foundation/control-plane records only. No checkout success, payout release, fake purchase, fake order, fake tip, or live money action can be created from Admin.
                </Text>
              </View>
            </View>
            {[
              "Subscription money is not connected yet unless real finance ledger rows exist.",
              "Ads revenue is not connected yet.",
              "Creator revenue is not active yet.",
              "Sponsor revenue is not active yet.",
              "Network revenue is not active yet.",
            ].map((copy) => (
              <View key={copy} style={styles.configListRow}>
                <View style={styles.configListCopy}>
                  <Text style={styles.configListTitle}>{copy}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        ) : null}

        {operatorTab === "payouts" ? (
        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>PAYOUTS</Text>
              <Text style={styles.configTitle}>Payouts</Text>
              <Text style={styles.configBody}>
                Creator payouts are not active yet. Payout review queue is foundation-only. Payout batch workflow is draft-only. No payout can be approved. No payout can be processed. No transfers can be created.
              </Text>
            </View>
            <View style={[styles.badge, styles.badgeOff]}>
              <Text style={styles.badgeText}>Not active yet</Text>
            </View>
          </View>
          <View style={styles.configList}>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Creator payout ledger entries</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutLedgerEntryCount,
                    adminFinanceReadModel.loading,
                    "foundation entry",
                    "foundation entries",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  No withdrawal button, payout approval, payout provider integration, KYC flow, creator-facing balance, fake payable balance, or fake earnings are active.
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Creator earnings and cash-out foundation</Text>
                <Text style={styles.configListBody}>
                  Immutable earnings ledger rows: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorEarningsLedgerCount,
                    adminFinanceReadModel.loading,
                    "ledger row",
                    "ledger rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Payout/cash-out requests: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutRequestCount,
                    adminFinanceReadModel.loading,
                    "request",
                    "requests",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Monetization webhook/audit rows: {formatAdminFinanceCount(
                    adminFinanceReadModel.monetizationWebhookEventCount,
                    adminFinanceReadModel.loading,
                    "webhook row",
                    "webhook rows",
                  )} / {formatAdminFinanceCount(
                    adminFinanceReadModel.monetizationAuditLogCount,
                    adminFinanceReadModel.loading,
                    "audit row",
                    "audit rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Scheduled payouts are free later. Optional instant cash-out is planned at 1.5% with no default cap, but cash-out and payout execution remain disabled.
                </Text>
                <Text style={styles.configListBody}>
                  Preproduction testing can preview scheduled payout fee $0 and instant cash-out fee examples of $1.50 on $100 or $15.00 on $1,000. These previews do not create payable balances.
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Payout provider accounts</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutAccountCount,
                    adminFinanceReadModel.loading,
                    "foundation account",
                    "foundation accounts",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Creator-facing Connect Stripe setup is test-mode only from Platform Studio. Admin remains read-only here; no payout release or money movement is active.
                </Text>
                <Text style={styles.configListBody}>
                  Test-mode accounts: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutAccountTestModeCount,
                    adminFinanceReadModel.loading,
                    "account",
                    "accounts",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Action required: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutAccountActionRequiredCount,
                    adminFinanceReadModel.loading,
                    "account",
                    "accounts",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Provider-ready later: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutAccountReadyLaterCount,
                    adminFinanceReadModel.loading,
                    "account",
                    "accounts",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Payouts enabled at provider: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutAccountPayoutsEnabledCount,
                    adminFinanceReadModel.loading,
                    "account",
                    "accounts",
                  )}. This still does not make creator payouts active.
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Provider onboarding sessions</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutOnboardingSessionCount,
                    adminFinanceReadModel.loading,
                    "foundation session",
                    "foundation sessions",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Links created: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutOnboardingLinkCreatedCount,
                    adminFinanceReadModel.loading,
                    "session",
                    "sessions",
                  )}. Admin cannot create onboarding links from this panel.
                </Text>
                <Text style={styles.configListBody}>
                  Onboarding URLs are short-lived backend outputs only and are not stored long-term here.
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Payout eligibility readiness</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutEligibilityRecordCount,
                    adminFinanceReadModel.loading,
                    "readiness record",
                    "readiness records",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Provider ready: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutEligibilityProviderReadyCount,
                    adminFinanceReadModel.loading,
                    "record",
                    "records",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Eligible for payouts: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutEligibilityEligibleCount,
                    adminFinanceReadModel.loading,
                    "record",
                    "records",
                  )}. Eligibility rows are not payable balances and do not release money.
                </Text>
                <Text style={styles.configListBody}>
                  Provider readiness, KYC, tax/1099 readiness, hold clearance, and legal/accounting approval must all pass before any payout can be called available.
                </Text>
                <Text style={styles.configListBody}>
                  Admin can review readiness only. Owner approval is required before any later payout execution workflow, and production execution remains blocked while live money is off.
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Stripe Connect webhook events</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutProviderWebhookEventCount,
                    adminFinanceReadModel.loading,
                    "provider event",
                    "provider events",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Processed: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutProviderWebhookProcessedCount,
                    adminFinanceReadModel.loading,
                    "event",
                    "events",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Ignored safely: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutProviderWebhookIgnoredCount,
                    adminFinanceReadModel.loading,
                    "event",
                    "events",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Failed: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutProviderWebhookFailedCount,
                    adminFinanceReadModel.loading,
                    "event",
                    "events",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Webhooks are backend-only and test-mode proved. Transfer, payout, and checkout events do not move money in this build.
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Payout review records</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutReviewRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation review record",
                    "foundation review records",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Payout review queue is foundation-only. No approve, reject, release, or payable-balance action exists.
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Payout review notes</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutReviewNoteCount,
                    adminFinanceReadModel.loading,
                    "foundation review note",
                    "foundation review notes",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Notes are read-only foundation context. They do not approve, reject, or release payouts.
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Payout batches</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutBatchCount,
                    adminFinanceReadModel.loading,
                    "foundation batch",
                    "foundation batches",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Draft batch foundation only. No approval, processing, transfer, or payout execution is active.
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Payout batch items</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutBatchItemCount,
                    adminFinanceReadModel.loading,
                    "foundation batch item",
                    "foundation batch items",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Batch items group draft foundation rows only. No provider transfer ID or Stripe payout is created here.
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Provider transfer records</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutProviderTransferCount,
                    adminFinanceReadModel.loading,
                    "foundation transfer",
                    "foundation transfers",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Provider transfer sync is test/foundation only. Provider status imports do not move money.
                </Text>
                <Text style={styles.configListBody}>
                  Sync required: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutProviderTransferSyncRequiredCount,
                    adminFinanceReadModel.loading,
                    "foundation transfer",
                    "foundation transfers",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Synced/test: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutProviderTransferSyncedTestCount,
                    adminFinanceReadModel.loading,
                    "foundation transfer",
                    "foundation transfers",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Failed sync: {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutProviderTransferSyncFailedCount,
                    adminFinanceReadModel.loading,
                    "foundation transfer",
                    "foundation transfers",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  No transfers can be created from Admin. No payouts can be released. No manual money movement is available.
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Payout holds</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutHoldCount,
                    adminFinanceReadModel.loading,
                    "foundation hold",
                    "foundation holds",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Hold records are foundation only and do not pause payouts, uploads, live access, or monetization.
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Payout audit log</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.creatorPayoutAuditLogCount,
                    adminFinanceReadModel.loading,
                    "foundation audit row",
                    "foundation audit rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Immutable audit foundation only. Dangerous payout writes still require a later dedicated lane.
                </Text>
              </View>
            </View>
            {[
              "Payout batch workflow is draft-only.",
              "No payout can be approved.",
              "No payout can be processed.",
              "No transfers can be created.",
              "Future requirements: payout account, KYC, tax forms, fraud review.",
              "Planned hold period: 7-30 days.",
              "Minimum payout: undecided.",
            ].map((copy) => (
              <View key={copy} style={styles.configListRow}>
                <View style={styles.configListCopy}>
                  <Text style={styles.configListTitle}>{copy}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        ) : null}

        {operatorTab === "networks" ? (
        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>NETWORKS</Text>
              <Text style={styles.configTitle}>Network Billing Foundation</Text>
              <Text style={styles.configBody}>
                Network billing is not active yet. Foundation rows are proof-only; draft invoices are internal and overage warnings are read-only.
              </Text>
            </View>
            <View style={[styles.badge, styles.badgeOff]}>
              <Text style={styles.badgeText}>Foundation only</Text>
            </View>
          </View>
          <View style={styles.configList}>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Network Billing Foundation</Text>
                <Text style={styles.configListBody}>No invoice can be sent, no customer can be charged, and no payment links exist.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Network billing accounts</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.networkBillingAccountCount,
                    adminFinanceReadModel.loading,
                    "foundation account",
                    "foundation accounts",
                  )}
                </Text>
                <Text style={styles.configListBody}>Read-only customer/network account foundation. No billing action is connected.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Plan records</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.networkPlanRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation plan",
                    "foundation plans",
                  )}
                </Text>
                <Text style={styles.configListBody}>Network Starter, Network Pro, and Enterprise remain planning tiers only.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Plan assignments</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.networkAccountPlanAssignmentCount,
                    adminFinanceReadModel.loading,
                    "foundation assignment",
                    "foundation assignments",
                  )}
                </Text>
                <Text style={styles.configListBody}>Assignment rows do not activate billing, quotas, or invoices.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Quota records</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.networkQuotaRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation quota",
                    "foundation quotas",
                  )}
                </Text>
                <Text style={styles.configListBody}>Planned quota types: storage, bandwidth, live participant-minutes, team seats.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Invoice drafts</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.networkInvoiceRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation invoice draft",
                    "foundation invoice drafts",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Draft rows: {formatAdminFinanceCount(
                    adminFinanceReadModel.networkInvoiceDraftCount,
                    adminFinanceReadModel.loading,
                    "internal draft",
                    "internal drafts",
                  )}
                </Text>
                <Text style={styles.configListBody}>Draft invoices are internal only. No invoices can be sent.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Invoice line items</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.networkInvoiceLineItemCount,
                    adminFinanceReadModel.loading,
                    "foundation line item",
                    "foundation line items",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Draft line items: {formatAdminFinanceCount(
                    adminFinanceReadModel.networkInvoiceLineItemDraftCount,
                    adminFinanceReadModel.loading,
                    "internal draft line",
                    "internal draft lines",
                  )}
                </Text>
                <Text style={styles.configListBody}>Line items are proof-only and do not create a payable balance or customer obligation.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Invoice Draft Workflow</Text>
                <Text style={styles.configListBody}>Draft invoices are internal only.</Text>
                <Text style={styles.configListBody}>No invoices can be sent.</Text>
                <Text style={styles.configListBody}>No customers can be charged.</Text>
                <Text style={styles.configListBody}>No payment links exist.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Overage events</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.networkOverageEventCount,
                    adminFinanceReadModel.loading,
                    "foundation overage event",
                    "foundation overage events",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Quota-risk warnings: {formatAdminFinanceCount(
                    adminFinanceReadModel.networkOverageWarningOnlyCount,
                    adminFinanceReadModel.loading,
                    "warning-only row",
                    "warning-only rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Review-required rows: {formatAdminFinanceCount(
                    adminFinanceReadModel.networkOverageReviewRequiredCount,
                    adminFinanceReadModel.loading,
                    "review row",
                    "review rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>Overages are warning/foundation only and cannot be approved or billed.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Overage Warning Readout</Text>
                <Text style={styles.configListBody}>Warning thresholds: 50% · 75% · 90% · 100%.</Text>
                <Text style={styles.configListBody}>Overage warnings are read-only.</Text>
                <Text style={styles.configListBody}>Billing execution is not active.</Text>
                <Text style={styles.configListBody}>Provider reconciliation is required before real billing.</Text>
                <Text style={styles.configListBody}>Usage metering must be trusted before charging.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Provider Reconciliation</Text>
                <Text style={styles.configListBody}>Provider reconciliation is backend-only foundation and may read already-imported provider usage rows.</Text>
                <Text style={styles.configListBody}>
                  {adminV1ReadModel.providerUsageReconciliationCount === null
                    ? "Provider reconciliation rows are not connected yet."
                    : `${adminV1ReadModel.providerUsageReconciliationCount} reconciliation row${adminV1ReadModel.providerUsageReconciliationCount === 1 ? "" : "s"} readable. Pending: ${adminV1ReadModel.providerUsageReconciliationPendingCount ?? 0}; matched: ${adminV1ReadModel.providerUsageReconciliationMatchedCount ?? 0}; variance: ${adminV1ReadModel.providerUsageReconciliationVarianceCount ?? 0}.`}
                </Text>
                <Text style={styles.configListBody}>No provider billing totals are shown as customer billing truth.</Text>
                <Text style={styles.configListBody}>No invoices can be sent, no customers can be charged, and no payment links exist.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Billing audit logs</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.networkBillingAuditLogCount,
                    adminFinanceReadModel.loading,
                    "foundation audit row",
                    "foundation audit rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>Audit rows are read-only foundation; no charge, invoice, or plan activation writes are exposed.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Future model</Text>
                <Text style={styles.configListBody}>Monthly platform fee + included quotas + reviewed overages.</Text>
                <Text style={styles.configListBody}>Stripe Billing or Checkout is later and is not connected in this build.</Text>
                <Text style={styles.configListBody}>No fake revenue, unpaid balance, or real customer obligation is shown.</Text>
              </View>
            </View>
          </View>
        </View>
        ) : null}

        {operatorTab === "sponsors" ? (
        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>SPONSORS</Text>
              <Text style={styles.configTitle}>Sponsor Monetization Foundations</Text>
              <Text style={styles.configBody}>
                Sponsor tools are not active yet. Review, disclosure, moderation, and payment rows are foundation-only. No sponsor checkout exists, no brand can pay, and no creator payout split can execute.
              </Text>
            </View>
            <View style={[styles.badge, styles.badgeOff]}>
              <Text style={styles.badgeText}>Foundation only</Text>
            </View>
          </View>
          <View style={styles.configList}>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Sponsor Review Queue</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.sponsorReviewQueueRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation queue record",
                    "foundation queue records",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Foundation/pending rows: {formatAdminFinanceCount(
                    adminFinanceReadModel.sponsorReviewQueueFoundationCount,
                    adminFinanceReadModel.loading,
                    "foundation review",
                    "foundation reviews",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Disclosure review required: {formatAdminFinanceCount(
                    adminFinanceReadModel.sponsorReviewQueueDisclosureRequiredCount,
                    adminFinanceReadModel.loading,
                    "foundation row",
                    "foundation rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Safety/scam review required: {formatAdminFinanceCount(
                    adminFinanceReadModel.sponsorReviewQueueSafetyRequiredCount,
                    adminFinanceReadModel.loading,
                    "foundation row",
                    "foundation rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Payment readiness review: {formatAdminFinanceCount(
                    adminFinanceReadModel.sponsorReviewQueuePaymentReadinessCount,
                    adminFinanceReadModel.loading,
                    "foundation row",
                    "foundation rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>Review queue is read-only. No sponsor can be approved, activated, charged, or run from Admin.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Sponsor Disclosure / Moderation</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.sponsorSafetyReviewRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation safety review",
                    "foundation safety reviews",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Required disclosures: {formatAdminFinanceCount(
                    adminFinanceReadModel.sponsorDisclosureRequiredCount,
                    adminFinanceReadModel.loading,
                    "foundation disclosure",
                    "foundation disclosures",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Unsafe product review rows: {formatAdminFinanceCount(
                    adminFinanceReadModel.sponsorSafetyReviewUnsafeProductCount,
                    adminFinanceReadModel.loading,
                    "foundation row",
                    "foundation rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Scam review rows: {formatAdminFinanceCount(
                    adminFinanceReadModel.sponsorSafetyReviewScamCount,
                    adminFinanceReadModel.loading,
                    "foundation row",
                    "foundation rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>Disclosure and safety review are required before sponsor deals can go live later. No enforcement action is active.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Sponsor Brands</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.sponsorBrandRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation brand",
                    "foundation brands",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Brand/customer records only. No card, bank, checkout, payment-method, or provider-secret data is stored.
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Sponsor Deals</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.sponsorDealRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation record",
                    "foundation records",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Planned/foundation deals only. No sponsor approval action, checkout URL, payment link, paid status, or live sponsor money is active.
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Creatives</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.sponsorCreativeRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation creative",
                    "foundation creatives",
                  )}
                </Text>
                <Text style={styles.configListBody}>Metadata rows only. No sponsor asset upload or storage path is connected.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Placements</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.sponsorPlacementRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation placement",
                    "foundation placements",
                  )}
                </Text>
                <Text style={styles.configListBody}>Placement planning only. No ads system, CTV, native feed, or public rendering is connected.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Disclosures</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.sponsorDisclosureRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation disclosure",
                    "foundation disclosures",
                  )}
                </Text>
                <Text style={styles.configListBody}>Paid partnership disclosure required before this sponsor deal can go live.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Review Logs</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.sponsorReviewLogCount,
                    adminFinanceReadModel.loading,
                    "foundation review log",
                    "foundation review logs",
                  )}
                </Text>
                <Text style={styles.configListBody}>Audit trail foundation only. Review notes do not approve, reject, activate, or run sponsors.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Payment Records</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.sponsorPaymentRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation payment record",
                    "foundation payment records",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Test-mode foundation records: {formatAdminFinanceCount(
                    adminFinanceReadModel.sponsorPaymentTestModePlannedCount,
                    adminFinanceReadModel.loading,
                    "foundation payment record",
                    "foundation payment records",
                  )}
                </Text>
                <Text style={styles.configListBody}>Sponsor payment foundation is not checkout. No Stripe Checkout, payment link, provider API call, card data, paid status, or receivable is active.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Payout Splits</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.sponsorPayoutSplitRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation split",
                    "foundation splits",
                  )}
                </Text>
                <Text style={styles.configListBody}>Split rows are calculation foundation only. No payable creator balance or payout execution can happen here.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Sponsor Guardrails</Text>
                <Text style={styles.configListBody}>Sponsor tools are not active yet.</Text>
                <Text style={styles.configListBody}>Sponsor review is foundation-only.</Text>
                <Text style={styles.configListBody}>No sponsor can be approved.</Text>
                <Text style={styles.configListBody}>No sponsor can be activated.</Text>
                <Text style={styles.configListBody}>No brand can be charged.</Text>
                <Text style={styles.configListBody}>No checkout exists.</Text>
                <Text style={styles.configListBody}>No payment link exists.</Text>
                <Text style={styles.configListBody}>No creator payout split can execute.</Text>
                <Text style={styles.configListBody}>Disclosure and safety review are required before sponsor deals can go live later.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Future sponsor model</Text>
                <Text style={styles.configListBody}>{"Brand pays Chi'llywood first."}</Text>
                <Text style={styles.configListBody}>{"Creator-sold sponsor slots: creator 80% net / Chi'llywood 20% net"}</Text>
                <Text style={styles.configListBody}>{"Platform-served creator-page ads: creator 70% net / Chi'llywood 30% net"}</Text>
                <Text style={styles.configListBody}>Platform review, disclosure review, safe product review, scam/fraud review, payout hold/review, and audit trail are required later.</Text>
              </View>
            </View>
          </View>
        </View>
        ) : null}

        {operatorTab === "fraud" ? (
        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>FRAUD</Text>
              <Text style={styles.configTitle}>Fraud Enforcement Foundation</Text>
              <Text style={styles.configBody}>Fraud enforcement is not active yet. Foundation rows are proof-only and runtime hooks are not connected.</Text>
            </View>
            <View style={[styles.badge, styles.badgeOff]}>
              <Text style={styles.badgeText}>Foundation only</Text>
            </View>
          </View>
          <View style={styles.configList}>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Fraud Holds</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.platformFraudHoldCount,
                    adminFinanceReadModel.loading,
                    "foundation hold",
                    "foundation holds",
                  )}
                </Text>
                <Text style={styles.configListBody}>No payout pause is active.</Text>
                <Text style={styles.configListBody}>No account restriction is active.</Text>
                <Text style={styles.configListBody}>No upload or live restriction is active.</Text>
                <Text style={styles.configListBody}>No monetization disable is active.</Text>
                <Text style={styles.configListBody}>No fraud risk score exists.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Fraud Reasons</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.fraudReasonRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation reason",
                    "foundation reasons",
                  )}
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Evidence Records</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.fraudEvidenceRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation evidence record",
                    "foundation evidence records",
                  )}
                </Text>
                <Text style={styles.configListBody}>Evidence metadata only. No sensitive raw evidence or secrets are stored here.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Planned Actions</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.fraudActionRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation planned-action row",
                    "foundation planned-action rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>Planned-action rows are not executable controls.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Fraud Enforcement Foundation</Text>
                <Text style={styles.configListBody}>
                  Policies: {formatAdminFinanceCount(
                    adminFinanceReadModel.fraudEnforcementPolicyCount,
                    adminFinanceReadModel.loading,
                    "foundation policy",
                    "foundation policies",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Foundation policies: {formatAdminFinanceCount(
                    adminFinanceReadModel.fraudEnforcementPolicyFoundationCount,
                    adminFinanceReadModel.loading,
                    "foundation policy",
                    "foundation policies",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Planned enforcement actions: {formatAdminFinanceCount(
                    adminFinanceReadModel.fraudActionRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation action",
                    "foundation actions",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Non-executable proof actions: {formatAdminFinanceCount(
                    adminFinanceReadModel.fraudActionNotExecutableCount,
                    adminFinanceReadModel.loading,
                    "proof action",
                    "proof actions",
                  )}
                </Text>
                <Text style={styles.configListBody}>Fraud enforcement policies/actions are foundation-only.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Enforcement Readiness</Text>
                <Text style={styles.configListBody}>
                  {`Audit log: ${adminImmutableAuditReadModel.connected ? "connected" : "not connected yet"}`}
                </Text>
                <Text style={styles.configListBody}>
                  {`Fraud review: ${adminFinanceReadModel.fraudReviewNoteCount === null ? "not connected yet" : "connected"}`}
                </Text>
                <Text style={styles.configListBody}>
                  {`Appeal placeholder: ${adminFinanceReadModel.fraudAppealRecordCount === null ? "not connected yet" : "connected"}`}
                </Text>
                <Text style={styles.configListBody}>
                  {`Payout review: ${adminFinanceReadModel.creatorPayoutReviewRecordCount === null ? "not connected yet" : "connected"}`}
                </Text>
                <Text style={styles.configListBody}>Runtime enforcement hooks: not connected</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Fraud Review Queue</Text>
                <Text style={styles.configListBody}>
                  Queue records: {formatAdminFinanceCount(
                    adminFinanceReadModel.fraudReviewQueueRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation queue row",
                    "foundation queue rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Pending later: {formatAdminFinanceCount(
                    adminFinanceReadModel.fraudReviewQueuePendingCount,
                    adminFinanceReadModel.loading,
                    "pending-later row",
                    "pending-later rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Needs evidence later: {formatAdminFinanceCount(
                    adminFinanceReadModel.fraudReviewQueueNeedsEvidenceCount,
                    adminFinanceReadModel.loading,
                    "needs-evidence row",
                    "needs-evidence rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Escalated later: {formatAdminFinanceCount(
                    adminFinanceReadModel.fraudReviewQueueEscalatedCount,
                    adminFinanceReadModel.loading,
                    "escalated row",
                    "escalated rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Enforcement planned later: {formatAdminFinanceCount(
                    adminFinanceReadModel.fraudReviewQueueEnforcementPlannedCount,
                    adminFinanceReadModel.loading,
                    "planned row",
                    "planned rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>
                  Appealed later: {formatAdminFinanceCount(
                    adminFinanceReadModel.fraudReviewQueueAppealedCount,
                    adminFinanceReadModel.loading,
                    "appeal-linked row",
                    "appeal-linked rows",
                  )}
                </Text>
                <Text style={styles.configListBody}>Fraud review queue is read-only/foundation and cannot enforce restrictions.</Text>
                <Text style={styles.configListBody}>No payout pause, monetization disable, upload restriction, live restriction, strike, ban, or fake risk score is active.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Enforcement Guardrails</Text>
                <Text style={styles.configListBody}>Fraud enforcement is not active yet.</Text>
                <Text style={styles.configListBody}>No payouts are paused.</Text>
                <Text style={styles.configListBody}>No monetization is disabled.</Text>
                <Text style={styles.configListBody}>No uploads are restricted.</Text>
                <Text style={styles.configListBody}>No live access is restricted.</Text>
                <Text style={styles.configListBody}>No sponsor deals are restricted.</Text>
                <Text style={styles.configListBody}>No account restrictions are active.</Text>
                <Text style={styles.configListBody}>Runtime hooks are not connected.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Review Notes</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.fraudReviewNoteCount,
                    adminFinanceReadModel.loading,
                    "foundation review note",
                    "foundation review notes",
                  )}
                </Text>
                <Text style={styles.configListBody}>Review workflow is not active yet.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Appeals</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.fraudAppealRecordCount,
                    adminFinanceReadModel.loading,
                    "foundation appeal placeholder",
                    "foundation appeal placeholders",
                  )}
                </Text>
                <Text style={styles.configListBody}>Appeal UI and appeal workflow are not active yet.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Fraud Audit Logs</Text>
                <Text style={styles.configListBody}>
                  {formatAdminFinanceCount(
                    adminFinanceReadModel.fraudAuditLogCount,
                    adminFinanceReadModel.loading,
                    "foundation audit log",
                    "foundation audit logs",
                  )}
                </Text>
                <Text style={styles.configListBody}>Audit rows are foundation-only; immutable admin audit logs are still a separate future lane.</Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Planned reasons list</Text>
                <Text style={styles.configListBody}>
                  invalid traffic · fake engagement · fake followers · fake views · fake ad activity · scams · undisclosed sponsorship · stolen content · chargebacks · refund abuse · policy violation · illegal conduct · suspicious payout behavior · network overage abuse
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Future requirements</Text>
                <Text style={styles.configListBody}>Fraud enforcement must require reason, evidence, admin notes, audit trail, review state, confirmation for dangerous actions, and an appeal/review path later.</Text>
              </View>
            </View>
          </View>
        </View>
        ) : null}

        {operatorTab === "live-cost-guard" ? (
        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>LIVE COST GUARD</Text>
              <Text style={styles.configTitle}>LiveKit / TURN runaway cost guard</Text>
              <Text style={styles.configBody}>
                Owner/operator-only controls for observing LiveKit/TURN cost pressure. Observe-only mode logs events and actions without kicking, throttling, blocking rooms, or changing normal live behavior.
              </Text>
            </View>
            <View style={[styles.badge, getLiveCostGuardSeverityStyle(liveCostGuardSnapshot.activeSeverity)]}>
              <Text style={styles.badgeText}>{formatModerationToken(liveCostGuardSnapshot.activeSeverity)}</Text>
            </View>
          </View>

          {liveCostGuardNotice ? (
            <View style={[styles.notice, styles.noticeWarn]}>
              <Text style={styles.noticeText}>{liveCostGuardNotice}</Text>
            </View>
          ) : null}

          <View style={styles.dashboardGrid}>
            <View style={styles.dashboardMetricCard}>
              <Text style={styles.dashboardMetricLabel}>Mode</Text>
              <Text style={styles.dashboardMetricValue}>{formatModerationToken(liveCostGuardSettingsForm.mode)}</Text>
              <Text style={styles.dashboardMetricBody}>
                {liveCostGuardSettingsForm.enabled
                  ? "Enabled settings are saved, but auto-protect runs only in Auto Protect mode."
                  : "Disabled by default. Normal live behavior is unchanged."}
              </Text>
            </View>
            <View style={[styles.dashboardMetricCard, styles.dashboardMetricCardUnavailable]}>
              <Text style={styles.dashboardMetricLabel}>LiveKit Metrics</Text>
              <Text style={styles.dashboardMetricValue}>Not connected</Text>
              <Text style={styles.dashboardMetricBody}>
                Metrics not connected yet. This page does not show fake TURN Mbps, fake participants, or fake burn rate.
              </Text>
            </View>
            <View style={[styles.dashboardMetricCard, styles.dashboardMetricCardUnavailable]}>
              <Text style={styles.dashboardMetricLabel}>Estimated Burn</Text>
              <Text style={styles.dashboardMetricValue}>{formatEstimatedLiveCost(null)}</Text>
              <Text style={styles.dashboardMetricBody}>
                Prometheus/provider cost metrics are pending; existing DB usage estimates are not treated as cost truth.
              </Text>
            </View>
            <View style={styles.dashboardMetricCard}>
              <Text style={styles.dashboardMetricLabel}>Events / Actions 24h</Text>
              <Text style={styles.dashboardMetricValue}>{`${liveCostGuardSnapshot.eventsLast24h} / ${liveCostGuardSnapshot.actionsLast24h}`}</Text>
              <Text style={styles.dashboardMetricBody}>
                Backed rows from the Live Cost Guard tables only.
              </Text>
            </View>
            <View style={[styles.dashboardMetricCard, styles.dashboardMetricCardUnavailable]}>
              <Text style={styles.dashboardMetricLabel}>Alertmanager Webhook</Text>
              <Text style={styles.dashboardMetricValue}>
                {liveCostGuardSettingsReadModel?.alertmanagerWebhookStatus === "configured" ? "Configured" : "Not configured"}
              </Text>
              <Text style={styles.dashboardMetricBody}>
                Webhook requires `LIVE_COST_GUARD_WEBHOOK_SECRET`; no secret is stored in the mobile app.
              </Text>
            </View>
            <View style={styles.dashboardMetricCard}>
              <Text style={styles.dashboardMetricLabel}>TURN Cap</Text>
              <Text style={styles.dashboardMetricValue}>Request only</Text>
              <Text style={styles.dashboardMetricBody}>
                No SSH, firewall, coturn, or host mutation runs from this build.
              </Text>
            </View>
          </View>

          <View style={styles.configList}>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Settings</Text>
                <Text style={styles.configListBody}>
                  Settings persist through owner/operator RLS. Save does not enable automatic action unless the mode and enabled toggle explicitly allow it.
                </Text>
              </View>
              <View style={styles.toggleRowWrap}>
                <TouchableOpacity
                  style={[
                    styles.toggleChip,
                    liveCostGuardSettingsForm.enabled && styles.toggleChipActive,
                    !canAccessLiveOps && styles.toggleChipDisabled,
                  ]}
                  onPress={() => {
                    if (!canAccessLiveOps) return;
                    setLiveCostGuardSettingsForm((prev) => ({ ...prev, enabled: !prev.enabled }));
                  }}
                  disabled={!canAccessLiveOps}
                >
                  <Text style={[styles.toggleChipText, liveCostGuardSettingsForm.enabled && styles.toggleChipTextActive]}>
                    {liveCostGuardSettingsForm.enabled ? "Enabled" : "Disabled"}
                  </Text>
                </TouchableOpacity>
                {LIVE_COST_GUARD_MODES.map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[
                      styles.toggleChip,
                      liveCostGuardSettingsForm.mode === mode && styles.toggleChipActive,
                      !canAccessLiveOps && styles.toggleChipDisabled,
                    ]}
                    onPress={() => {
                      if (!canAccessLiveOps) return;
                      setLiveCostGuardSettingsForm((prev) => ({ ...prev, mode: mode as LiveCostGuardMode }));
                    }}
                    disabled={!canAccessLiveOps}
                  >
                    <Text style={[styles.toggleChipText, liveCostGuardSettingsForm.mode === mode && styles.toggleChipTextActive]}>
                      {formatModerationToken(mode)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.inlineInputs}>
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Warning Mbps"
                  placeholderTextColor="#8d8d8d"
                  keyboardType="numeric"
                  value={liveCostGuardSettingsForm.warningThresholdMbps === null ? "" : String(liveCostGuardSettingsForm.warningThresholdMbps)}
                  onChangeText={(text) => setLiveCostGuardSettingsForm((prev) => ({
                    ...prev,
                    warningThresholdMbps: Number.isFinite(Number(text)) && text.trim() ? Number(text) : null,
                  }))}
                />
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Critical Mbps"
                  placeholderTextColor="#8d8d8d"
                  keyboardType="numeric"
                  value={liveCostGuardSettingsForm.criticalThresholdMbps === null ? "" : String(liveCostGuardSettingsForm.criticalThresholdMbps)}
                  onChangeText={(text) => setLiveCostGuardSettingsForm((prev) => ({
                    ...prev,
                    criticalThresholdMbps: Number.isFinite(Number(text)) && text.trim() ? Number(text) : null,
                  }))}
                />
              </View>
              <View style={styles.inlineInputs}>
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Emergency Mbps"
                  placeholderTextColor="#8d8d8d"
                  keyboardType="numeric"
                  value={liveCostGuardSettingsForm.emergencyThresholdMbps === null ? "" : String(liveCostGuardSettingsForm.emergencyThresholdMbps)}
                  onChangeText={(text) => setLiveCostGuardSettingsForm((prev) => ({
                    ...prev,
                    emergencyThresholdMbps: Number.isFinite(Number(text)) && text.trim() ? Number(text) : null,
                  }))}
                />
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Max USD / hour"
                  placeholderTextColor="#8d8d8d"
                  keyboardType="numeric"
                  value={liveCostGuardSettingsForm.maxEstimatedUsdPerHour === null ? "" : String(liveCostGuardSettingsForm.maxEstimatedUsdPerHour)}
                  onChangeText={(text) => setLiveCostGuardSettingsForm((prev) => ({
                    ...prev,
                    maxEstimatedUsdPerHour: Number.isFinite(Number(text)) && text.trim() ? Number(text) : null,
                  }))}
                />
              </View>
              <View style={styles.inlineInputs}>
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Warning token TTL seconds"
                  placeholderTextColor="#8d8d8d"
                  keyboardType="numeric"
                  value={String(liveCostGuardSettingsForm.tokenTtlWarningSeconds)}
                  onChangeText={(text) => setLiveCostGuardSettingsForm((prev) => ({
                    ...prev,
                    tokenTtlWarningSeconds: Math.max(1, Math.trunc(Number(text) || 300)),
                  }))}
                />
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Critical token TTL seconds"
                  placeholderTextColor="#8d8d8d"
                  keyboardType="numeric"
                  value={String(liveCostGuardSettingsForm.tokenTtlCriticalSeconds)}
                  onChangeText={(text) => setLiveCostGuardSettingsForm((prev) => ({
                    ...prev,
                    tokenTtlCriticalSeconds: Math.max(1, Math.trunc(Number(text) || 60)),
                  }))}
                />
              </View>
              <View style={styles.inlineInputs}>
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Cooldown seconds"
                  placeholderTextColor="#8d8d8d"
                  keyboardType="numeric"
                  value={String(liveCostGuardSettingsForm.cooldownSeconds)}
                  onChangeText={(text) => setLiveCostGuardSettingsForm((prev) => ({
                    ...prev,
                    cooldownSeconds: Math.max(0, Math.trunc(Number(text) || 0)),
                  }))}
                />
                <TouchableOpacity
                  style={[
                    styles.configSaveBtn,
                    { backgroundColor: themePalette.accent },
                    (liveCostGuardSaving || liveCostGuardLoading || !canAccessLiveOps) && styles.configSaveBtnDisabled,
                  ]}
                  onPress={() => void saveLiveCostGuardSettings()}
                  disabled={liveCostGuardSaving || liveCostGuardLoading || !canAccessLiveOps}
                >
                  {liveCostGuardSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.configSaveBtnText}>Save Guard</Text>}
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Manual Controls</Text>
                <Text style={styles.configListBody}>
                  Dangerous controls require confirmation and are server-side/audited. Observe-only logs what would happen without applying it.
                </Text>
              </View>
              <TextInput
                style={styles.input}
                placeholder="Room name (required for room/participant actions)"
                placeholderTextColor="#8d8d8d"
                value={liveCostGuardRoomName}
                onChangeText={setLiveCostGuardRoomName}
                autoCapitalize="characters"
              />
              <TextInput
                style={styles.input}
                placeholder="Participant identity (required for participant actions)"
                placeholderTextColor="#8d8d8d"
                value={liveCostGuardParticipantIdentity}
                onChangeText={setLiveCostGuardParticipantIdentity}
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="Audit reason"
                placeholderTextColor="#8d8d8d"
                value={liveCostGuardActionReason}
                onChangeText={setLiveCostGuardActionReason}
                multiline
              />
              <View style={styles.configListActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, liveCostGuardActionBusy !== null && styles.configSaveBtnDisabled]}
                  onPress={() => void logLiveCostGuardTestWarning()}
                  disabled={liveCostGuardActionBusy !== null}
                >
                  <Text style={styles.actionText}>Log test warning event</Text>
                </TouchableOpacity>
                {LIVE_COST_GUARD_ACTION_TYPES.map((actionType) => (
                  <TouchableOpacity
                    key={actionType}
                    style={[
                      actionType === "shorten_token_ttl" || actionType === "restore_normal_mode"
                        ? styles.actionBtn
                        : styles.actionBtnDanger,
                      liveCostGuardActionBusy !== null && styles.configSaveBtnDisabled,
                    ]}
                    onPress={() => runLiveCostGuardAction(actionType)}
                    disabled={liveCostGuardActionBusy !== null}
                  >
                    <Text style={actionType === "shorten_token_ttl" || actionType === "restore_normal_mode" ? styles.actionText : styles.actionTextDanger}>
                      {liveCostGuardActionBusy === actionType ? "Working..." : formatModerationToken(actionType)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Event Log</Text>
                <Text style={styles.configListBody}>Newest Live Cost Guard events first.</Text>
              </View>
              {liveCostGuardLoading ? (
                <View style={styles.configLoadingRow}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.configLoadingText}>Loading Live Cost Guard events...</Text>
                </View>
              ) : liveCostGuardEvents.length ? liveCostGuardEvents.map((event) => (
                <View key={event.id} style={styles.configListRowSubtle}>
                  <Text style={styles.configListTitle}>{`${formatModerationToken(event.severity)} · ${formatModerationToken(event.source)}`}</Text>
                  <Text style={styles.configListBody}>{formatModerationTimestamp(event.createdAt)}</Text>
                  <Text style={styles.configListBody}>{`Room ${event.roomName || "not set"} · Participant ${formatCompactIdentifier(event.participantIdentity)}`}</Text>
                  <Text style={styles.configListBody}>{`Estimated burn ${formatEstimatedLiveCost(event.estimatedUsdPerHour)} · Action ${event.recommendedAction ? formatModerationToken(event.recommendedAction) : "None"} · ${event.actionStatus}`}</Text>
                </View>
              )) : (
                <Text style={styles.configListBody}>No Live Cost Guard events recorded yet.</Text>
              )}
            </View>

            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Action Audit Log</Text>
                <Text style={styles.configListBody}>Every manual/system request is recorded here, including blocked observe-only attempts.</Text>
              </View>
              {liveCostGuardActions.length ? liveCostGuardActions.map((action) => (
                <View key={action.id} style={styles.configListRowSubtle}>
                  <Text style={styles.configListTitle}>{formatModerationToken(action.actionType)}</Text>
                  <Text style={styles.configListBody}>{`${formatModerationTimestamp(action.createdAt)} · ${formatModerationToken(action.actorType)} · ${action.success ? "success" : "not applied"}`}</Text>
                  <Text style={styles.configListBody}>{`Room ${action.roomName || "not set"} · Participant ${formatCompactIdentifier(action.participantIdentity)}`}</Text>
                  <Text style={styles.configListBody}>{`Reason: ${formatAuditDisplayText(action.reason) || "No reason"}`}</Text>
                  {action.errorMessage ? <Text style={styles.configListBody}>{`Result: ${formatAuditDisplayText(action.errorMessage)}`}</Text> : null}
                </View>
              )) : (
                <Text style={styles.configListBody}>No Live Cost Guard actions recorded yet.</Text>
              )}
            </View>
          </View>
        </View>
        ) : null}

        {operatorTab === "live-ops-fix-center" ? (
        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>LIVE OPS FIX CENTER</Text>
              <Text style={styles.configTitle}>Owner/Admin Live remediation approvals</Text>
              <Text style={styles.configBody}>
                Real incident cards for Live Stage, Watch-Party Live, and Chi'lly Chat call reliability only. Approvals go through the server-side proxy; this screen never holds ops approval tokens.
              </Text>
            </View>
            <View style={[styles.badge, getLiveOpsRiskStyle(liveOpsHighestRisk)]}>
              <Text style={styles.badgeText}>{formatLiveOpsToken(liveOpsHighestRisk)}</Text>
            </View>
          </View>

          {liveOpsNotice ? (
            <View style={[styles.notice, styles.noticeWarn]}>
              <Text style={styles.noticeText}>{liveOpsNotice}</Text>
            </View>
          ) : null}

          <View style={styles.dashboardGrid}>
            <View style={styles.dashboardMetricCard}>
              <Text style={styles.dashboardMetricLabel}>Open Incidents</Text>
              <Text style={styles.dashboardMetricValue}>{liveOpsLoading ? "Loading" : String(liveOpsOpenCount)}</Text>
              <Text style={styles.dashboardMetricBody}>
                Backed by `admin_live_ops_incidents`; empty means no real incident card has been mirrored.
              </Text>
            </View>
            <View style={styles.dashboardMetricCard}>
              <Text style={styles.dashboardMetricLabel}>Highest Risk</Text>
              <Text style={styles.dashboardMetricValue}>{formatLiveOpsToken(liveOpsHighestRisk)}</Text>
              <Text style={styles.dashboardMetricBody}>
                Risk comes from the ops classifier and never from fabricated health or participant data.
              </Text>
            </View>
            <View style={styles.dashboardMetricCard}>
              <Text style={styles.dashboardMetricLabel}>Proxy</Text>
              <Text style={styles.dashboardMetricValue}>{liveOpsReadModel?.connected ? "Connected" : "Not connected"}</Text>
              <Text style={styles.dashboardMetricBody}>
                Owner or live_ops permission is enforced by the Supabase function before any ops request.
              </Text>
            </View>
            <View style={styles.dashboardMetricCard}>
              <Text style={styles.dashboardMetricLabel}>Audit Rows</Text>
              <Text style={styles.dashboardMetricValue}>{String(liveOpsAudits.length)}</Text>
              <Text style={styles.dashboardMetricBody}>
                Detect, dry-run, approval, rejection, execution, and failure events are append-only.
              </Text>
            </View>
          </View>

          <View style={styles.configList}>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Incident Cards</Text>
                <Text style={styles.configListBody}>
                  Cards are created only from sanitized ops alerts mirrored to Supabase. No sample rooms, fake participants, fake TURN bytes, or fake health are rendered.
                </Text>
              </View>
              <View style={styles.configListActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, liveOpsLoading && styles.configSaveBtnDisabled]}
                  onPress={() => void loadLiveOpsFixCenter()}
                  disabled={liveOpsLoading}
                >
                  <Text style={styles.actionText}>{liveOpsLoading ? "Refreshing..." : "Refresh"}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {liveOpsLoading ? (
              <View style={styles.configLoadingRow}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.configLoadingText}>Loading Live Ops incidents...</Text>
              </View>
            ) : liveOpsIncidents.length ? liveOpsIncidents.map((incident) => {
              const busy = liveOpsActionBusy?.startsWith(`${incident.id}:`) === true;
              const actionLocked = busy || !canAccessLiveOps || !incident.opsJobId || incident.status === "executed" || incident.status === "rejected";
              const incidentAudits = liveOpsAuditsByIncident[incident.id] ?? [];
              const callTargets = [
                incident.affectedThreadId ? `Thread ${formatCompactIdentifier(incident.affectedThreadId)}` : "",
                incident.affectedCallId ? `Call ${formatCompactIdentifier(incident.affectedCallId)}` : "",
                incident.callMode ? `Mode ${formatLiveOpsToken(incident.callMode)}` : "",
              ].filter(Boolean).join(" · ");

              return (
                <View key={incident.id} style={styles.configListRowSubtle}>
                  <View style={styles.configHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.configListTitle}>{incident.title}</Text>
                      <Text style={styles.configListBody}>
                        {`${formatLiveOpsToken(incident.affectedPurpose)} · ${incident.affectedRoute} · ${incident.affectedPlatform} · ${formatLiveOpsToken(incident.status)}`}
                      </Text>
                    </View>
                    <View style={[styles.badge, getLiveOpsRiskStyle(incident.riskLevel)]}>
                      <Text style={styles.badgeText}>{formatLiveOpsToken(incident.riskLevel)}</Text>
                    </View>
                  </View>
                  <Text style={styles.configListBody}>
                    {`Rooms: ${incident.affectedRooms.length ? incident.affectedRooms.join(", ") : "Not supplied"} · Server: ${incident.affectedServerId || "Not supplied"}`}
                  </Text>
                  {callTargets ? (
                    <Text style={styles.configListBody}>{callTargets}</Text>
                  ) : null}
                  <Text style={styles.configListBody}>{`Symptoms: ${incident.detectedSymptoms.length ? incident.detectedSymptoms.join(" · ") : "Real signal not supplied"}`}</Text>
                  <Text style={styles.configListBody}>{`Likely cause: ${incident.likelyCause}`}</Text>
                  <Text style={styles.configListBody}>{`Confidence: ${formatLiveOpsToken(incident.confidence)} · Suggested fix: ${incident.suggestedFix}`}</Text>
                  <Text style={styles.configListBody}>{`Dry-run: ${formatLiveOpsDryRunResult(incident.dryRunResult)}`}</Text>
                  <Text style={styles.configListBody}>{`Rollback: ${incident.rollbackNote}`}</Text>
                  <Text style={styles.configListBody}>{`Last action: ${formatLiveOpsTimestamp(incident.lastActionAt || incident.updatedAt)}`}</Text>
                  <View style={styles.configListActions}>
                    <TouchableOpacity
                      style={[styles.actionBtn, actionLocked && styles.configSaveBtnDisabled]}
                      onPress={() => runLiveOpsAction(incident, "approve")}
                      disabled={actionLocked}
                    >
                      <Text style={styles.actionText}>{busy ? "Working..." : "Approve"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtnDanger, actionLocked && styles.configSaveBtnDisabled]}
                      onPress={() => runLiveOpsAction(incident, "reject")}
                      disabled={actionLocked}
                    >
                      <Text style={styles.actionTextDanger}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, actionLocked && styles.configSaveBtnDisabled]}
                      onPress={() => runLiveOpsAction(incident, "create_pr_only")}
                      disabled={actionLocked}
                    >
                      <Text style={styles.actionText}>Create PR only</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.actionBtn}
                      onPress={() => openLiveOpsRunbook(incident)}
                    >
                      <Text style={styles.actionText}>Open runbook</Text>
                    </TouchableOpacity>
                  </View>
                  {incidentAudits.length ? (
                    <View style={styles.configListRowSubtle}>
                      <Text style={styles.configListTitle}>Audit log</Text>
                      {incidentAudits.slice(0, 4).map((audit) => (
                        <Text key={audit.id} style={styles.configListBody}>
                          {`${formatLiveOpsTimestamp(audit.createdAt)} · ${formatLiveOpsToken(audit.eventType)} · ${formatLiveOpsToken(audit.actionType)} · ${audit.success ? "success" : "not applied"}${audit.errorMessage ? ` · ${audit.errorMessage}` : ""}`}
                        </Text>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.configListBody}>No audit rows mirrored for this incident yet.</Text>
                  )}
                </View>
              );
            }) : (
              <Text style={styles.configListBody}>No Live Ops reliability incidents are currently recorded.</Text>
            )}
          </View>
        </View>
        ) : null}

        {operatorTab === "legal" ? (
        <View style={styles.configCard}>
          <OwnerControlPanelHeader
            actions={(
              <TouchableOpacity
                style={[styles.ownerPrimaryButton, (!canAccessLegalIntake || legalRequestBusy) && styles.configSaveBtnDisabled]}
                onPress={() => {
                  setLegalSubsection("intake");
                  setOwnerControlNotice(null);
                }}
                disabled={!canAccessLegalIntake || legalRequestBusy}
              >
                <Text style={styles.ownerPrimaryButtonText}>Create Legal Request</Text>
              </TouchableOpacity>
            )}
            badgeLabel={canAccessLegalEvidence || canAccessLegalIntake ? "Authorized" : "Locked"}
            badgeTone={canAccessLegalEvidence || canAccessLegalIntake ? "success" : "locked"}
            kicker="LEGAL"
            subtitle="Owner access authorized. Approved admins require scoped legal permission and reason-based records."
            title="Legal Intake and Evidence"
          />

          {ownerControlNotice ? (
            <View style={[styles.notice, styles.noticeWarn]}>
              <Text style={styles.noticeText}>{ownerControlNotice}</Text>
            </View>
          ) : null}

          {legalNotice ? (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>{legalNotice}</Text>
            </View>
          ) : null}

          <View style={styles.ownerMetricGrid}>
            <OwnerMetricTile label="Open Requests" value={legalRequestSummary.open} tone={legalRequestSummary.open ? "manual" : "success"} />
            <OwnerMetricTile label="Under Review" value={legalRequestSummary.underReview} tone={legalRequestSummary.underReview ? "info" : "default"} />
            <OwnerMetricTile label="Evidence Prepared" value={legalRequestSummary.evidencePrepared} tone={legalRequestSummary.evidencePrepared ? "success" : "default"} />
            <OwnerMetricTile label="Legal Holds Active" value={legalRequestSummary.holds} tone={legalRequestSummary.holds ? "manual" : "success"} />
            <OwnerMetricTile label="Closed Requests" value={legalRequestSummary.closed} tone="locked" />
          </View>

          <View style={styles.toggleRowWrap}>
            {legalSubsectionOptions.map((option) => (
              <TouchableOpacity
                key={option.key}
                style={[styles.toggleChip, legalSubsection === option.key && styles.toggleChipActive]}
                onPress={() => setLegalSubsection(option.key)}
              >
                <Text style={[styles.toggleChipText, legalSubsection === option.key && styles.toggleChipTextActive]}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.configList}>
            {legalSubsection === "intake" ? (
            <View style={styles.ownerToolbarPanel}>
              <Text style={styles.ownerSectionTitle}>Create request</Text>
              <View style={styles.ownerInputGroup}>
                <View style={styles.toggleRowWrap}>
                  {legalRequestTypeOptions.map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[styles.toggleChip, legalRequestType === type && styles.toggleChipActive]}
                      onPress={() => setLegalRequestType(type)}
                    >
                      <Text style={[styles.toggleChipText, legalRequestType === type && styles.toggleChipTextActive]}>{formatModerationToken(type)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput value={legalRequestAgency} onChangeText={setLegalRequestAgency} placeholder="Requesting agency" placeholderTextColor="#788196" style={styles.input} />
                <TextInput value={legalRequestContact} onChangeText={setLegalRequestContact} placeholder="Officer/contact name" placeholderTextColor="#788196" style={styles.input} />
                <TextInput value={legalRequestContactEmail} onChangeText={setLegalRequestContactEmail} placeholder="Contact email" placeholderTextColor="#788196" style={styles.input} autoCapitalize="none" keyboardType="email-address" />
                <TextInput value={legalRequestContactPhone} onChangeText={setLegalRequestContactPhone} placeholder="Contact phone optional" placeholderTextColor="#788196" style={styles.input} autoCapitalize="none" />
                <TextInput value={legalRequestCaseNumber} onChangeText={setLegalRequestCaseNumber} placeholder="Case number" placeholderTextColor="#788196" style={styles.input} autoCapitalize="none" />
                <TextInput value={legalRequestReason} onChangeText={setLegalRequestReason} placeholder="Request reason / description" placeholderTextColor="#788196" style={[styles.input, styles.multiline]} multiline />
                <View style={styles.toggleRowWrap}>
                  {[
                    ["targetUserId", "User"],
                    ["targetContentId", "Content"],
                    ["targetThreadId", "Thread"],
                    ["targetRoomId", "Room"],
                    ["targetReportId", "Report"],
                  ].map(([key, label]) => (
                    <TouchableOpacity
                      key={key}
                      style={[styles.toggleChip, legalRequestTargetType === key && styles.toggleChipActive]}
                      onPress={() => setLegalRequestTargetType(key as typeof legalRequestTargetType)}
                    >
                      <Text style={[styles.toggleChipText, legalRequestTargetType === key && styles.toggleChipTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput value={legalRequestTargetId} onChangeText={setLegalRequestTargetId} placeholder="Target id optional" placeholderTextColor="#788196" style={styles.input} autoCapitalize="none" />
                <TextInput value={legalRequestDateFrom} onChangeText={setLegalRequestDateFrom} placeholder="Date range from ISO optional" placeholderTextColor="#788196" style={styles.input} autoCapitalize="none" />
                <TextInput value={legalRequestDateTo} onChangeText={setLegalRequestDateTo} placeholder="Date range to ISO optional" placeholderTextColor="#788196" style={styles.input} autoCapitalize="none" />
                <TextInput value={legalRequestDueAt} onChangeText={setLegalRequestDueAt} placeholder="Due date ISO optional" placeholderTextColor="#788196" style={styles.input} autoCapitalize="none" />
                <TextInput value={legalRequestNotes} onChangeText={setLegalRequestNotes} placeholder="Internal notes optional" placeholderTextColor="#788196" style={[styles.input, styles.multiline]} multiline />
                <TouchableOpacity
                  style={[styles.ownerPrimaryButton, (legalRequestBusy || !canAccessLegalIntake) && styles.configSaveBtnDisabled]}
                  onPress={() => void runLegalIntakeCreate()}
                  disabled={legalRequestBusy || !canAccessLegalIntake}
                >
                  <Text style={styles.ownerPrimaryButtonText}>{legalRequestBusy ? "Creating..." : canAccessLegalIntake ? "Create Request" : "Disabled: legal_request_intake required"}</Text>
                </TouchableOpacity>
                {!canAccessLegalIntake ? (
                  <OwnerDisabledReason reason="Create Request is disabled because this account lacks legal_request_intake, legal_review, or legal_ops permission." />
                ) : null}
              </View>
            </View>
            ) : null}

            {legalSubsection === "evidence" ? (
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Evidence target</Text>
                <Text style={styles.configListBody}>
                  Search by backed target type. Linked request: {selectedLegalRequest ? formatCompactIdentifier(selectedLegalRequest.id) : "none"}.
                </Text>
              </View>

              <View style={styles.toggleRowWrap}>
                {legalEvidenceTargetOptions.map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.toggleChip, legalTargetType === option.key && styles.toggleChipActive]}
                    onPress={() => setLegalTargetType(option.key)}
                    disabled={legalBusy !== null}
                  >
                    <Text style={[styles.toggleChipText, legalTargetType === option.key && styles.toggleChipTextActive]}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {legalTargetType === "date_range" ? (
                <>
                  <TextInput
                    value={legalDateFrom}
                    onChangeText={setLegalDateFrom}
                    placeholder="From ISO date/time"
                    placeholderTextColor="#788196"
                    style={styles.input}
                    autoCapitalize="none"
                  />
                  <TextInput
                    value={legalDateTo}
                    onChangeText={setLegalDateTo}
                    placeholder="To ISO date/time"
                    placeholderTextColor="#788196"
                    style={styles.input}
                    autoCapitalize="none"
                  />
                </>
              ) : (
                <TextInput
                  value={legalTargetId}
                  onChangeText={setLegalTargetId}
                  placeholder="Target id"
                  placeholderTextColor="#788196"
                  style={styles.input}
                  autoCapitalize="none"
                />
              )}

              <TextInput
                value={legalReason}
                onChangeText={setLegalReason}
                placeholder={isOwnerStaff ? "Owner note optional unless Break Glass is active" : "Required legal/audit reason"}
                placeholderTextColor="#788196"
                style={styles.input}
                multiline
              />

              <View style={styles.configListActions}>
                <TouchableOpacity
                  style={[styles.orderBtn, (legalBusy !== null || !canAccessLegalEvidence) && styles.configSaveBtnDisabled]}
                  onPress={() => void runLegalEvidenceAction("preview")}
                  disabled={legalBusy !== null || !canAccessLegalEvidence}
                >
                  <Text style={styles.orderBtnText}>{legalBusy === "preview" ? "Previewing..." : canAccessLegalEvidence ? "Preview Evidence" : "Disabled: evidence_preview required"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.orderBtn, (legalBusy !== null || !canAccessLegalEvidence) && styles.configSaveBtnDisabled]}
                  onPress={() => void runLegalEvidenceAction("export")}
                  disabled={legalBusy !== null || !canAccessLegalEvidence}
                >
                  <Text style={styles.orderBtnText}>{legalBusy === "export" ? "Exporting..." : canAccessLegalEvidence ? "Export Evidence" : "Disabled: evidence_export required"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.orderBtn, (legalBusy !== null || legalTargetType === "date_range" || !canAccessLegalEvidence) && styles.configSaveBtnDisabled]}
                  onPress={() => void runLegalEvidenceAction("hold")}
                  disabled={legalBusy !== null || legalTargetType === "date_range" || !canAccessLegalEvidence}
                >
                  <Text style={styles.orderBtnText}>{legalBusy === "hold" ? "Holding..." : !canAccessLegalEvidence ? "Disabled: legal_hold required" : legalTargetType === "date_range" ? "Disabled: target required" : "Apply Legal Hold"}</Text>
                </TouchableOpacity>
              </View>
              {!canAccessLegalEvidence ? (
                <OwnerDisabledReason reason="Evidence actions require legal_review, evidence_preview/evidence_export/legal_hold, or legal_ops permission and are enforced by the protected Edge Function." />
              ) : legalTargetType === "date_range" ? (
                <OwnerDisabledReason reason="Legal Hold is disabled for date-range searches. Choose a concrete user, content, thread, room, report, or DMCA target first." />
              ) : null}
            </View>
            ) : null}

            {legalSubsection === "evidence" ? (
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Evidence result</Text>
                <Text style={styles.configListBody}>
                  Results come from the protected Edge Function. Service-role keys and legal tooling tokens are never shipped to the app.
                </Text>
              </View>
              <View style={styles.configListRowSubtle}>
                <Text style={styles.configListTitle}>Preview</Text>
                <Text style={styles.configListBody}>{summarizeLegalPreview(legalPreviewResult)}</Text>
                <Text style={styles.configListTitle}>Export</Text>
                <Text style={styles.configListBody}>{legalExportResult?.id ? `Export ${formatCompactIdentifier(legalExportResult.id)} · ${formatAuditDisplayText(legalExportResult.status)}` : "No export record generated in this session."}</Text>
                <Text style={styles.configListTitle}>Hold</Text>
                <Text style={styles.configListBody}>{legalHoldResult?.id ? `Hold ${formatCompactIdentifier(legalHoldResult.id)} · ${formatAuditDisplayText(legalHoldResult.status)}` : "No hold placed in this session."}</Text>
              </View>
            </View>
            ) : null}

            {["intake", "requests"].includes(legalSubsection) ? (
            <View style={styles.ownerToolbarPanel}>
              <Text style={styles.ownerSectionTitle}>Requests</Text>
              <TextInput value={legalRequestSearch} onChangeText={setLegalRequestSearch} placeholder="Search id, case number, agency, officer, target, status" placeholderTextColor="#788196" style={styles.input} autoCapitalize="none" />
              <View style={styles.toggleRowWrap}>
                {legalRequestStatusOptions.map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={[styles.toggleChip, legalRequestStatusFilter === option.key && styles.toggleChipActive]}
                    onPress={() => setLegalRequestStatusFilter(option.key)}
                  >
                    <Text style={[styles.toggleChipText, legalRequestStatusFilter === option.key && styles.toggleChipTextActive]}>{option.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {ownerControlLoading ? (
                <View style={styles.configLoadingRow}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.configLoadingText}>Loading legal requests...</Text>
                </View>
              ) : filteredLegalRequests.length ? filteredLegalRequests.map((request) => (
                <OwnerControlRow
                  key={String(request.id)}
                  expanded={selectedLegalRequestId === request.id}
                  message={`${formatModerationToken(request.request_type || "legal_request")} · Case ${formatAuditDisplayText(request.case_number) || "not supplied"} · Target ${legalRequestPrimaryTarget(request).label} ${formatCompactIdentifier(legalRequestPrimaryTarget(request).id)}`}
                  meta={request.created_at ? formatModerationTimestamp(String(request.created_at)) : "Time unknown"}
                  statusLabel={formatLegalStatus(request.status)}
                  title={formatAuditDisplayText(request.requesting_agency) || `Request ${formatCompactIdentifier(request.id)}`}
                  tone={legalStatusTone(request.status)}
                >
                  <View style={styles.ownerPanelActions}>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => void openLegalRequestDetail(String(request.id ?? ""))}>
                      <Text style={styles.actionText}>{legalRequestDetailBusy && selectedLegalRequestId === request.id ? "Opening..." : "Open Request"}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.actionBtn} onPress={() => linkLegalRequestToEvidence(request)}>
                      <Text style={styles.actionText}>Link Evidence</Text>
                    </TouchableOpacity>
                  </View>
                </OwnerControlRow>
              )) : (
                <OwnerEmptyState
                  body={legalRequestSearch.trim() || legalRequestStatusFilter !== "all" ? "No legal requests match the current search/filter." : "No legal requests have been created yet."}
                  title={legalRequestSearch.trim() || legalRequestStatusFilter !== "all" ? "No Matching Requests" : "No Legal Requests"}
                />
              )}
            </View>
            ) : null}

            {selectedLegalRequestDetail && (legalSubsection === "intake" || legalSubsection === "requests" || legalSubsection === "timeline") ? (
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Request detail</Text>
                <Text style={styles.configListBody}>
                  {formatAuditDisplayText(selectedLegalRequestDetail.request?.requesting_agency)} · {formatLegalStatus(selectedLegalRequestDetail.request?.status)} · {formatCompactIdentifier(selectedLegalRequestDetail.request?.id)}
                </Text>
              </View>
              <View style={styles.configListRowSubtle}>
                <Text style={styles.configListBody}>Contact: {formatAuditDisplayText(selectedLegalRequestDetail.request?.contact_name) || "not supplied"} · {formatAuditDisplayText(selectedLegalRequestDetail.request?.contact_email) || "email not supplied"}</Text>
                <Text style={styles.configListBody}>Target: {selectedLegalTarget.label} {formatCompactIdentifier(selectedLegalTarget.id)}</Text>
                <Text style={styles.configListBody}>Reviewed: {formatAuditDisplayText(selectedLegalRequestDetail.request?.reviewed_summary) || "none recorded"}</Text>
                <Text style={styles.configListBody}>Exported: {formatAuditDisplayText(selectedLegalRequestDetail.request?.exported_summary) || "none recorded"}</Text>
                <Text style={styles.configListBody}>Hold: {formatModerationToken(selectedLegalRequestDetail.request?.legal_hold_status || "none")}</Text>
                <View style={styles.toggleRowWrap}>
                  {legalRequestStatusOptions.filter((option) => option.key !== "all").map((option) => (
                    <TouchableOpacity
                      key={option.key}
                      style={[styles.toggleChip, legalRequestStatusUpdate === option.key && styles.toggleChipActive]}
                      onPress={() => setLegalRequestStatusUpdate(option.key)}
                    >
                      <Text style={[styles.toggleChipText, legalRequestStatusUpdate === option.key && styles.toggleChipTextActive]}>{option.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput value={legalRequestNote} onChangeText={setLegalRequestNote} placeholder="Internal note" placeholderTextColor="#788196" style={[styles.input, styles.multiline]} multiline />
                <View style={styles.configListActions}>
                  <TouchableOpacity
                    style={[styles.actionBtn, !canAccessLegalIntake && styles.configSaveBtnDisabled]}
                    disabled={!canAccessLegalIntake}
                    onPress={() => void updateSelectedLegalRequestStatus(String(selectedLegalRequestDetail.request?.id ?? ""), legalRequestStatusUpdate)}
                  >
                    <Text style={styles.actionText}>{canAccessLegalIntake ? "Update Status" : "Disabled: legal_request_intake required"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, (!canAccessLegalIntake || legalRequestNote.trim().length < 3) && styles.configSaveBtnDisabled]}
                    disabled={!canAccessLegalIntake || legalRequestNote.trim().length < 3}
                    onPress={() => void addLegalRequestNote()}
                  >
                    <Text style={styles.actionText}>{legalRequestNote.trim().length < 3 ? "Disabled: note required" : "Add Note"}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => linkLegalRequestToEvidence(selectedLegalRequestDetail.request!)}>
                    <Text style={styles.actionText}>Preview Evidence</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.actionBtn, (!selectedLegalTarget.id || !canAccessLegalEvidence || legalBusy !== null) && styles.configSaveBtnDisabled]}
                    disabled={!selectedLegalTarget.id || !canAccessLegalEvidence || legalBusy !== null}
                    onPress={() => void applyLegalHoldForRequest(selectedLegalRequestDetail.request!)}
                  >
                    <Text style={styles.actionText}>{selectedLegalTarget.id ? (canAccessLegalEvidence ? "Apply Legal Hold" : "Disabled: legal_hold required") : "Disabled: target id required"}</Text>
                  </TouchableOpacity>
                </View>
                {!canAccessLegalIntake ? (
                  <OwnerDisabledReason reason="Status updates and notes require legal_request_intake, legal_review, or legal_ops permission." />
                ) : null}
                {!selectedLegalTarget.id ? (
                  <OwnerDisabledReason reason="Legal Hold is disabled because this request has no concrete linked target id." />
                ) : !canAccessLegalEvidence ? (
                  <OwnerDisabledReason reason="Legal Hold requires legal_hold, legal_review, or legal_ops permission through the protected legal evidence workflow." />
                ) : null}
              </View>
            </View>
            ) : null}

            {["timeline", "holds", "exports"].includes(legalSubsection) ? (
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>{legalSubsection === "timeline" ? "Timeline / History" : legalSubsection === "holds" ? "Legal Holds" : "Exports"}</Text>
                <Text style={styles.configListBody}>Open a request from Intake or Requests to inspect linked legal records.</Text>
              </View>
              {selectedLegalRequestDetail ? (
                <View style={styles.configListRowSubtle}>
                  {legalSubsection === "timeline" ? (
                    selectedLegalRequestDetail.events.length ? selectedLegalRequestDetail.events.map((event: OwnerControlLegalRequestEvent) => (
                      <Text key={String(event.id)} style={styles.configListBody}>{`${formatModerationTimestamp(String(event.created_at ?? ""))} · ${formatModerationToken(event.event_type)} · ${formatAuditDisplayText(event.message) || "Event recorded"}`}</Text>
                    )) : <Text style={styles.configListBody}>No timeline events recorded yet.</Text>
                  ) : legalSubsection === "holds" ? (
                    selectedLegalRequestDetail.holds.length ? selectedLegalRequestDetail.holds.map((hold) => (
                      <Text key={String(hold.id)} style={styles.configListBody}>{`Hold ${formatCompactIdentifier(hold.id)} · ${formatModerationToken(hold.status)} · ${formatModerationToken(hold.target_type)} ${formatCompactIdentifier(hold.target_id)}`}</Text>
                    )) : <Text style={styles.configListBody}>No legal holds linked to this request.</Text>
                  ) : (
                    selectedLegalRequestDetail.evidenceRequests.filter((row) => String(row.request_kind) === "export").length ? selectedLegalRequestDetail.evidenceRequests.filter((row) => String(row.request_kind) === "export").map((row) => (
                      <Text key={String(row.id)} style={styles.configListBody}>{`Export ${formatCompactIdentifier(row.id)} · ${formatAuditDisplayText(row.export_hash) || "hash pending"} · ${formatModerationTimestamp(String(row.created_at ?? ""))}`}</Text>
                    )) : <Text style={styles.configListBody}>No exports linked to this request.</Text>
                  )}
                </View>
              ) : (
                <OwnerEmptyState body="Open a Legal Intake request to view this section." title="No Request Open" />
              )}
            </View>
            ) : null}
          </View>
        </View>
        ) : null}

        {operatorTab === "audit-explorer" ? (
        <View style={styles.configCard}>
          <OwnerControlPanelHeader
            badgeLabel={canAccessAuditExplorer ? "Authorized" : "Locked"}
            badgeTone={canAccessAuditExplorer ? "success" : "locked"}
            kicker="AUDIT EXPLORER"
            subtitle="Staff, legal, Live Ops, Break Glass, intake, canary, and system/security rows. Normal owner actions stay hidden unless Break Glass was active."
            title="Search Admin Audit"
          />

          {ownerControlNotice ? (
            <View style={[styles.notice, styles.noticeWarn]}>
              <Text style={styles.noticeText}>{ownerControlNotice}</Text>
            </View>
          ) : null}

          <View style={styles.ownerToolbarPanel}>
            <View style={styles.ownerSectionHeaderRow}>
              <Text style={styles.ownerSectionTitle}>Search Filters</Text>
              <OwnerStatusPill label="Server Checked" tone="info" />
            </View>
            <Text style={styles.ownerPanelMeta}>Search only returns rows allowed by the protected audit explorer path.</Text>
            <View style={styles.ownerInputGroup}>
              <TextInput
                value={auditExplorerActionFilter}
                onChangeText={setAuditExplorerActionFilter}
                placeholder="Action filter"
                placeholderTextColor="#788196"
                style={styles.input}
                autoCapitalize="none"
              />
              <TextInput
                value={auditExplorerTargetFilter}
                onChangeText={setAuditExplorerTargetFilter}
                placeholder="Target, user, content, room, thread, report, legal request id"
                placeholderTextColor="#788196"
                style={styles.input}
                autoCapitalize="none"
              />
              <View style={styles.ownerPanelActions}>
                <TouchableOpacity
                  style={[styles.toggleChip, auditExplorerBreakGlassOnly && styles.toggleChipActive]}
                  onPress={() => setAuditExplorerBreakGlassOnly((prev) => !prev)}
                >
                  <Text style={[styles.toggleChipText, auditExplorerBreakGlassOnly && styles.toggleChipTextActive]}>Break Glass only</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, (ownerControlLoading || !canAccessAuditExplorer) && styles.configSaveBtnDisabled]}
                  onPress={() => void loadAuditExplorer()}
                  disabled={ownerControlLoading || !canAccessAuditExplorer}
                >
                  <Text style={styles.actionText}>{ownerControlLoading ? "Searching..." : canAccessAuditExplorer ? "Search" : "Locked"}</Text>
                </TouchableOpacity>
              </View>
              {!canAccessAuditExplorer ? (
                <OwnerDisabledReason reason="Audit Explorer requires Owner, audit_explorer, legal_ops, or admin_audit_review permission and is enforced server-side." />
              ) : null}
            </View>
          </View>

          <View style={styles.ownerControlList}>
            {auditExplorerRows.length ? auditExplorerRows.map((row) => {
              const rowKey = `${row.source}-${row.id}`;
              const expanded = !!expandedOwnerControlRows[rowKey];
              const statusLabel = row.breakGlassActive ? "Break Glass" : row.dryRun ? "Dry Run" : "Audit";
              return (
                <OwnerControlRow
                  key={rowKey}
                  expanded={expanded}
                  message={row.reason ? formatAuditDisplayText(row.reason) : row.summary || "Audit row recorded."}
                  meta={`${row.occurredAt ? formatModerationTimestamp(row.occurredAt) : "Time unknown"} - ${formatModerationToken(row.actorRole || "unknown")}`}
                  onPress={() => toggleOwnerControlRow(rowKey)}
                  statusLabel={statusLabel}
                  title={`${formatModerationToken(row.source)} - ${formatModerationToken(row.action)}`}
                  tone={row.breakGlassActive ? "manual" : row.dryRun ? "info" : "default"}
                >
                  <OwnerDetailGrid
                    rows={[
                      { label: "Actor", value: row.actorEmail ? maskOperatorIdentity(row.actorEmail) : formatCompactIdentifier(row.actorUserId) },
                      { label: "Target", value: `${formatModerationToken(row.targetType)} ${formatCompactIdentifier(row.targetId)}` },
                      { label: "Permission", value: row.permissionKey ? formatModerationToken(row.permissionKey) : "not supplied" },
                    ]}
                  />
                </OwnerControlRow>
              );
            }) : (
              <OwnerEmptyState
                body={ownerControlLoading ? "Audit rows are loading." : "Try changing filters or run a search after privileged activity exists."}
                title={ownerControlLoading ? "Loading Audit Explorer" : "No audit rows matched"}
              />
            )}
          </View>
        </View>
        ) : null}

        {operatorTab === "permission-templates" ? (
        <View style={styles.configCard}>
          <OwnerControlPanelHeader
            badgeLabel={canManagePermissionTemplates ? "Authorized" : "Locked"}
            badgeTone={canManagePermissionTemplates ? "success" : "locked"}
            kicker="PERMISSION TEMPLATES"
            subtitle="Permission-only bundles. Templates never create platform roles, and Admins cannot apply templates to themselves."
            title="Scoped Staff Templates"
          />

          {ownerControlNotice ? (
            <View style={[styles.notice, styles.noticeWarn]}>
              <Text style={styles.noticeText}>{ownerControlNotice}</Text>
            </View>
          ) : null}

          <View style={styles.ownerToolbarPanel}>
            <View style={styles.ownerSectionHeaderRow}>
              <Text style={styles.ownerSectionTitle}>Apply or Revoke</Text>
              <OwnerStatusPill label="Scoped" tone="info" />
            </View>
            <Text style={styles.ownerPanelMeta}>Applies permission bundles only; it does not create platform roles or let admins self-grant.</Text>
            <View style={styles.ownerInputGroup}>
              <TextInput
                value={permissionTemplateEmail}
                onChangeText={setPermissionTemplateEmail}
                placeholder="admin@example.com"
                placeholderTextColor="#788196"
                autoCapitalize="none"
                keyboardType="email-address"
                style={styles.input}
              />
              <View style={styles.toggleRowWrap}>
                {permissionTemplates.map((template) => (
                  <TouchableOpacity
                    key={template.key}
                    style={[styles.toggleChip, permissionTemplateKey === template.key && styles.toggleChipActive]}
                    onPress={() => setPermissionTemplateKey(template.key)}
                    disabled={permissionTemplateBusy !== null}
                  >
                    <Text style={[styles.toggleChipText, permissionTemplateKey === template.key && styles.toggleChipTextActive]}>
                      {template.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.toggleRowWrap}>
                {[
                  ["1h", "1 hour"],
                  ["24h", "24 hours"],
                  ["7d", "7 days"],
                  ["until_revoked", "Until revoked"],
                ].map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.toggleChip, permissionTemplateDuration === key && styles.toggleChipActive]}
                    onPress={() => setPermissionTemplateDuration(key)}
                    disabled={permissionTemplateBusy !== null}
                  >
                    <Text style={[styles.toggleChipText, permissionTemplateDuration === key && styles.toggleChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                value={permissionTemplateReason}
                onChangeText={setPermissionTemplateReason}
                placeholder="Audit reason required"
                placeholderTextColor="#788196"
                style={styles.input}
              />
              <View style={styles.ownerPanelActions}>
                <TouchableOpacity
                  style={[styles.ownerPrimaryButton, (permissionTemplateBusy !== null || !canManagePermissionTemplates || permissionTemplateReason.trim().length < 6) && styles.configSaveBtnDisabled]}
                  onPress={() => void runPermissionTemplateAction("apply")}
                  disabled={permissionTemplateBusy !== null || !canManagePermissionTemplates || permissionTemplateReason.trim().length < 6}
                >
                  <Text style={styles.ownerPrimaryButtonText}>{permissionTemplateBusy === "apply" ? "Applying..." : canManagePermissionTemplates ? "Apply Template" : "Locked"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.ownerSecondaryButton, (permissionTemplateBusy !== null || !canManagePermissionTemplates || permissionTemplateReason.trim().length < 6) && styles.configSaveBtnDisabled]}
                  onPress={() => void runPermissionTemplateAction("revoke")}
                  disabled={permissionTemplateBusy !== null || !canManagePermissionTemplates || permissionTemplateReason.trim().length < 6}
                >
                  <Text style={styles.ownerSecondaryButtonText}>{permissionTemplateBusy === "revoke" ? "Revoking..." : canManagePermissionTemplates ? "Revoke Template" : "Locked"}</Text>
                </TouchableOpacity>
              </View>
              {!canManagePermissionTemplates ? (
                <OwnerDisabledReason reason="Template actions require Owner or staff_permission_template_manage permission. Admins cannot apply templates to themselves." />
              ) : null}
            </View>
          </View>

          <View style={styles.ownerControlList}>
            <View style={styles.ownerSectionHeaderRow}>
              <Text style={styles.ownerSectionTitle}>Template Permissions</Text>
              <OwnerStatusPill label={`${permissionTemplates.length} templates`} tone="info" />
            </View>
            {permissionTemplates.map((template) => (
              <OwnerControlRow
                key={`template-${template.key}`}
                message={template.permissions.map(formatModerationToken).join(" · ")}
                statusLabel={`${template.permissions.length} permissions`}
                title={template.label}
                tone={permissionTemplateKey === template.key ? "info" : "default"}
              />
            ))}
          </View>
        </View>
        ) : null}

        {operatorTab === "break-glass" ? (
        <View style={styles.configCard}>
          <OwnerControlPanelHeader
            badgeLabel={breakGlassActiveSessionId ? "Active" : "Off"}
            badgeTone={breakGlassActiveSessionId ? "manual" : "locked"}
            kicker="BREAK GLASS"
            subtitle="Emergency audit mode. Owner normal use stays unaudited unless this is manually activated."
            title="Emergency Owner Mode"
          />

          {ownerControlNotice ? (
            <View style={[styles.notice, styles.noticeWarn]}>
              <Text style={styles.noticeText}>{ownerControlNotice}</Text>
            </View>
          ) : null}

          <View style={styles.ownerToolbarPanel}>
            <View style={styles.ownerSectionHeaderRow}>
              <Text style={styles.ownerSectionTitle}>Activation</Text>
              <OwnerStatusPill label={breakGlassActiveSessionId ? "Active" : "Confirmation Required"} tone={breakGlassActiveSessionId ? "manual" : "locked"} />
            </View>
            <Text style={styles.ownerPanelMeta}>Use only for emergency owner-sensitive review. Normal owner legal/admin work elsewhere stays outside Break Glass.</Text>
            <View style={styles.ownerInputGroup}>
              <TextInput
                value={breakGlassReason}
                onChangeText={setBreakGlassReason}
                placeholder="Emergency reason"
                placeholderTextColor="#788196"
                style={styles.input}
                multiline
              />
              <View style={styles.inlineInputs}>
                <TextInput
                  value={breakGlassCaseId}
                  onChangeText={setBreakGlassCaseId}
                  placeholder="Case id optional"
                  placeholderTextColor="#788196"
                  style={[styles.input, styles.inputHalf]}
                  autoCapitalize="none"
                />
                <TextInput
                  value={breakGlassReportId}
                  onChangeText={setBreakGlassReportId}
                  placeholder="Report id optional"
                  placeholderTextColor="#788196"
                  style={[styles.input, styles.inputHalf]}
                  autoCapitalize="none"
                />
              </View>
              <View style={styles.toggleRowWrap}>
                {[
                  ["1h", "1 hour"],
                  ["24h", "24 hours"],
                  ["7d", "7 days"],
                  ["until_revoked", "Until ended"],
                ].map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.toggleChip, breakGlassDuration === key && styles.toggleChipActive]}
                    onPress={() => setBreakGlassDuration(key)}
                    disabled={breakGlassBusy !== null}
                  >
                    <Text style={[styles.toggleChipText, breakGlassDuration === key && styles.toggleChipTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.ownerPanelActions}>
                <TouchableOpacity
                  style={[styles.actionBtnDanger, (breakGlassBusy !== null || !!breakGlassActiveSessionId || !canAccessBreakGlass) && styles.configSaveBtnDisabled]}
                  onPress={() => void runBreakGlassActivate()}
                  disabled={breakGlassBusy !== null || !!breakGlassActiveSessionId || !canAccessBreakGlass}
                >
                  <Text style={styles.actionTextDanger}>{breakGlassBusy === "activate" ? "Activating..." : !canAccessBreakGlass ? "Locked" : breakGlassActiveSessionId ? "Already Active" : "Activate"}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, (breakGlassBusy !== null || !breakGlassActiveSessionId || !canAccessBreakGlass) && styles.configSaveBtnDisabled]}
                  onPress={() => void runBreakGlassEnd()}
                  disabled={breakGlassBusy !== null || !breakGlassActiveSessionId || !canAccessBreakGlass}
                >
                  <Text style={styles.actionText}>{breakGlassBusy === "end" ? "Ending..." : !canAccessBreakGlass ? "Locked" : breakGlassActiveSessionId ? "End Active Session" : "No Active Session"}</Text>
                </TouchableOpacity>
              </View>
              {!canAccessBreakGlass ? (
                <OwnerDisabledReason reason="Break Glass actions require Owner or emergency_break_glass permission. Normal owner work elsewhere does not require Break Glass." />
              ) : breakGlassActiveSessionId ? (
                <OwnerDisabledReason reason="A Break Glass session is already active. End the active session before starting another one." />
              ) : (
                <OwnerDisabledReason reason="Activation requires a short emergency reason and writes Break Glass audit rows until the session ends or expires." />
              )}
            </View>
          </View>

          <View style={styles.ownerControlList}>
            <View style={styles.ownerSectionHeaderRow}>
              <Text style={styles.ownerSectionTitle}>Recent Sessions</Text>
              <OwnerStatusPill label={`${breakGlassSessions.length} loaded`} tone={breakGlassSessions.length ? "manual" : "success"} />
            </View>
            {breakGlassSessions.length ? breakGlassSessions.map((session) => (
              <OwnerControlRow
                key={String(session.id)}
                message={formatAuditDisplayText(session.reason) || "Reason not available."}
                meta={`Expires: ${session.expires_at ? formatModerationTimestamp(String(session.expires_at)) : "Manual end"}`}
                statusLabel={formatModerationToken(String(session.status ?? "unknown"))}
                title={`Session ${formatCompactIdentifier(session.id)}`}
                tone={String(session.status ?? "").toLowerCase() === "active" ? "manual" : "default"}
              />
            )) : (
              <OwnerEmptyState body="No recent Break Glass sessions loaded." title="Break Glass is quiet" />
            )}
          </View>
        </View>
        ) : null}

        {operatorTab === "owner-security" ? (
        <View style={styles.ownerSecurityShell}>
          <View style={styles.ownerSecurityHero}>
            <View style={styles.ownerSecurityHeroTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ownerPanelKicker}>OWNER SECURITY</Text>
                <Text style={styles.ownerSecurityHeroTitle}>Owner Security Center</Text>
                <Text style={styles.ownerSecurityHeroSubtitle}>
                  Owner access authorized. Approved operators require scoped permission and reason-based records.
                </Text>
              </View>
              <OwnerStatusPill
                label={ownerSecurityStatusLabel(ownerSecurityOverview?.ownerAccessStatus ?? (canAccessOwnerSecurity ? "verified" : "not_verified"))}
                tone={ownerSecurityToneForStatus(ownerSecurityOverview?.ownerAccessStatus ?? (canAccessOwnerSecurity ? "verified" : "not_verified"))}
              />
            </View>
            <View style={styles.ownerSecurityHeroMetaRow}>
              <Text style={styles.ownerSecurityHeroMeta}>
                {ownerSecurityLastRefresh ? `Last checked ${formatModerationTimestamp(ownerSecurityLastRefresh)}` : ownerControlLoading ? "Refreshing security state..." : "Last checked: Not connected"}
              </Text>
              <TouchableOpacity
                style={[styles.ownerSecurityIconButton, ownerControlLoading && styles.configSaveBtnDisabled]}
                onPress={() => void loadOwnerSecurity()}
                disabled={ownerControlLoading}
              >
                <Text style={styles.ownerSecurityIconButtonText}>{ownerControlLoading ? "Refreshing" : "Refresh"}</Text>
              </TouchableOpacity>
            </View>
            {ownerSecurityLoaded && Number(ownerSecurityOpenAlerts ?? 0) > 0 ? (
              <View style={styles.ownerSecurityAlertRibbon}>
                <Text style={styles.ownerSecurityAlertRibbonText}>
                  {`${ownerSecurityOpenAlerts} security item${Number(ownerSecurityOpenAlerts) === 1 ? "" : "s"} need review today.`}
                </Text>
              </View>
            ) : null}
          </View>

          {ownerControlNotice ? (
            <View style={[styles.notice, styles.noticeWarn]}>
              <Text style={styles.noticeText}>{ownerControlNotice}</Text>
            </View>
          ) : null}

          <View style={styles.ownerSecurityMetricGrid}>
            <OwnerMetricTile
              label="Device Trust"
              tone={ownerSecurityToneForStatus(ownerSecurityOverview?.currentDeviceStatus ?? ownerSecurityCurrentDevice?.trustStatus)}
              value={ownerSecurityStatusLabel(ownerSecurityOverview?.currentDeviceStatus ?? ownerSecurityCurrentDevice?.trustStatus)}
            />
            <OwnerMetricTile
              label="Open Alerts"
              tone={ownerSecurityRiskTone(ownerSecurityOpenAlerts)}
              value={ownerSecurityMetricValue(ownerSecurityOpenAlerts)}
            />
            <OwnerMetricTile
              label="Temporary Grants"
              tone={ownerSecurityCountTone(ownerSecurityActiveGrantsCount)}
              value={ownerSecurityMetricValue(ownerSecurityActiveGrantsCount)}
            />
            <OwnerMetricTile
              label="High-Risk Actions"
              tone={ownerSecurityRiskTone(ownerSecurityHighRiskActions)}
              value={ownerSecurityMetricValue(ownerSecurityHighRiskActions)}
            />
          </View>

          {ownerControlLoading && !ownerSecurityLoaded ? (
            <View style={styles.ownerSecurityPanel}>
              <View style={styles.configLoadingRow}>
                <ActivityIndicator color="#DC143C" />
                <Text style={styles.configLoadingText}>Loading backed Owner Security state...</Text>
              </View>
            </View>
          ) : null}

          <View style={[styles.ownerSecurityPassport, ownerSecurityToneForStatus(ownerSecurityCurrentDevice?.trustStatus) === "success" && styles.ownerSecurityPassportTrusted, ownerSecurityToneForStatus(ownerSecurityCurrentDevice?.trustStatus) === "danger" && styles.ownerSecurityPassportDanger]}>
            <View style={styles.ownerSecurityPanelHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ownerSecuritySectionKicker}>CURRENT DEVICE TRUST</Text>
                <Text style={styles.ownerSecuritySectionTitle}>{ownerSecurityCurrentDevice?.deviceLabel || "Current Device"}</Text>
                <Text style={styles.ownerSecuritySectionBody}>
                  {ownerSecurityCurrentDevice ? formatDeviceMeta(ownerSecurityCurrentDevice) : "Device trust table is not connected yet."}
                </Text>
              </View>
              <OwnerStatusPill
                label={ownerSecurityStatusLabel(ownerSecurityCurrentDevice?.trustStatus)}
                tone={ownerSecurityToneForStatus(ownerSecurityCurrentDevice?.trustStatus)}
              />
            </View>
            <View style={styles.ownerSecurityIdentityGrid}>
              <View style={styles.ownerSecurityIdentityCell}>
                <Text style={styles.ownerSecurityMiniLabel}>Signed-in user</Text>
                <Text style={styles.ownerSecurityMiniValue}>{formatAuditDisplayText(user?.email) || "Email unavailable"}</Text>
                <Text style={styles.ownerSecurityMiniMeta}>{formatCompactIdentifier(user?.id)}</Text>
              </View>
              <View style={styles.ownerSecurityIdentityCell}>
                <Text style={styles.ownerSecurityMiniLabel}>Last seen</Text>
                <Text style={styles.ownerSecurityMiniValue}>{ownerSecurityCurrentDevice?.lastSeenAt ? formatModerationTimestamp(ownerSecurityCurrentDevice.lastSeenAt) : "Not connected"}</Text>
                <Text style={styles.ownerSecurityMiniMeta}>{ownerSecurityCurrentDevice?.trustedAt ? `Trusted ${formatModerationTimestamp(ownerSecurityCurrentDevice.trustedAt)}` : "Trust not recorded"}</Text>
              </View>
            </View>
            <View style={styles.ownerSecurityActionRow}>
              {ownerSecurityCurrentDevice && ownerSecurityCurrentDevice.trustStatus !== "trusted" ? (
                <TouchableOpacity
                  style={[styles.ownerPrimaryButton, ownerSecurityActionBusy === "trust-device" && styles.configSaveBtnDisabled]}
                  onPress={() => void runOwnerSecurityTrustCurrentDevice()}
                  disabled={ownerSecurityActionBusy === "trust-device"}
                >
                  <Text style={styles.ownerPrimaryButtonText}>{ownerSecurityActionBusy === "trust-device" ? "Trusting..." : "Trust this device"}</Text>
                </TouchableOpacity>
              ) : null}
              {ownerSecurityCurrentDevice?.id && ownerSecurityCurrentDevice.trustStatus !== "revoked" ? (
                <TouchableOpacity
                  style={[styles.ownerSecondaryButton, ownerSecurityActionBusy === `revoke-device-${ownerSecurityCurrentDevice.id}` && styles.configSaveBtnDisabled]}
                  onPress={() => void runOwnerSecurityRevokeDevice(String(ownerSecurityCurrentDevice.id), true)}
                  disabled={ownerSecurityActionBusy === `revoke-device-${ownerSecurityCurrentDevice.id}`}
                >
                  <Text style={styles.ownerSecondaryButtonText}>Mark untrusted</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.ownerSecondaryButton} onPress={() => void loadOwnerSecurity()}>
                <Text style={styles.ownerSecondaryButtonText}>Refresh Security</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.ownerSecurityPanel}>
            <View style={styles.ownerSecurityPanelHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ownerSecuritySectionKicker}>ACTIVE SESSIONS / DEVICES</Text>
                <Text style={styles.ownerSecuritySectionTitle}>Trusted Device Ledger</Text>
                <Text style={styles.ownerSecuritySectionBody}>
                  App-level owner device sessions are backend-backed. Supabase Auth session force logout remains manual until a reviewed Admin API lane is added.
                </Text>
              </View>
              <OwnerStatusPill label={ownerSecurityLoaded ? `${ownerSecurityDevices.length}` : "Not Connected"} tone={ownerSecurityLoaded ? "info" : "locked"} />
            </View>
            {ownerSecurityDevices.length ? (
              <View style={styles.ownerSecurityDeviceList}>
                {ownerSecurityDevices.map((device) => (
                  <View key={String(device.id ?? device.deviceLabel)} style={styles.ownerSecurityDeviceRow}>
                    <View style={{ flex: 1 }}>
                      <View style={styles.ownerSecurityDeviceTitleRow}>
                        <Text style={styles.ownerSecurityDeviceTitle}>{device.isCurrentDevice ? "Current device" : (device.deviceLabel || "Owner device")}</Text>
                        {device.isCurrentDevice ? <OwnerStatusPill label="Pinned" tone="info" /> : null}
                      </View>
                      <Text style={styles.ownerSecuritySectionBody}>{formatDeviceMeta(device)}</Text>
                      <Text style={styles.ownerSecurityMiniMeta}>{device.lastSeenAt ? `Last seen ${formatModerationTimestamp(device.lastSeenAt)}` : "Last seen not connected"}</Text>
                    </View>
                    <View style={styles.ownerSecurityRowActions}>
                      <OwnerStatusPill label={ownerSecurityStatusLabel(device.trustStatus)} tone={ownerSecurityToneForStatus(device.trustStatus)} />
                      {device.id && device.trustStatus !== "revoked" ? (
                        <TouchableOpacity
                          style={[styles.ownerSecuritySmallButton, ownerSecurityActionBusy === `revoke-device-${device.id}` && styles.configSaveBtnDisabled]}
                          onPress={() => void runOwnerSecurityRevokeDevice(String(device.id), !!device.isCurrentDevice)}
                          disabled={ownerSecurityActionBusy === `revoke-device-${device.id}`}
                        >
                          <Text style={styles.ownerSecuritySmallButtonText}>Revoke</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <OwnerEmptyState
                body={ownerSecurityLoaded ? "No app-level device session rows were returned." : "Owner device trust is not connected yet."}
                title={ownerSecurityLoaded ? "No devices loaded" : "Device ledger unavailable"}
              />
            )}
          </View>

          <View style={styles.ownerSecurityPanel}>
            <View style={styles.ownerSecurityPanelHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ownerSecuritySectionKicker}>TEMPORARY GRANTS</Text>
                <Text style={styles.ownerSecuritySectionTitle}>Proof Access Control</Text>
                <Text style={styles.ownerSecuritySectionBody}>Temporary proof grants must expire and can be revoked here. Permanent hidden grants are not allowed.</Text>
              </View>
              <OwnerStatusPill
                label={ownerSecurityLoaded ? `${ownerSecurityTemporaryGrants.filter((grant) => grant.state === "active").length} Active` : "Not Connected"}
                tone={ownerSecurityCountTone(ownerSecurityActiveGrantsCount)}
              />
            </View>
            {ownerSecurityTemporaryGrants.length ? (
              <View style={styles.ownerSecurityGrantList}>
                {ownerSecurityTemporaryGrants.map((grant) => {
                  const activeGrant = grant.state === "active";
                  return (
                    <View key={String(grant.id)} style={styles.ownerSecurityGrantRow}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.ownerSecurityDeviceTitleRow}>
                          <Text style={styles.ownerSecurityDeviceTitle}>{formatAuditDisplayText(grant.targetEmail) || `User ${formatCompactIdentifier(grant.targetUserId)}`}</Text>
                          <OwnerStatusPill label={formatModerationToken(grant.grantType || "Grant")} tone={grant.isProofGrant ? "manual" : "info"} />
                        </View>
                        <Text style={styles.ownerSecuritySectionBody}>{formatAuditDisplayText(grant.reason) || "No reason recorded."}</Text>
                        <Text style={styles.ownerSecurityMiniMeta}>
                          {`${formatGrantExpiration(grant)} · Created ${grant.createdAt ? formatModerationTimestamp(grant.createdAt) : "time unknown"}`}
                        </Text>
                      </View>
                      <View style={styles.ownerSecurityRowActions}>
                        <OwnerStatusPill label={formatModerationToken(grant.state || "unknown")} tone={activeGrant ? "manual" : "locked"} />
                        {activeGrant && grant.id ? (
                          <TouchableOpacity
                            style={[styles.ownerSecuritySmallButton, ownerSecurityActionBusy === `revoke-grant-${grant.id}` && styles.configSaveBtnDisabled]}
                            onPress={() => void runOwnerSecurityRevokeGrant(String(grant.id))}
                            disabled={ownerSecurityActionBusy === `revoke-grant-${grant.id}`}
                          >
                            <Text style={styles.ownerSecuritySmallButtonText}>Revoke</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <OwnerEmptyState
                body={ownerSecurityLoaded ? "No active temporary grants were proven by the backend." : "Temporary grant data has not loaded."}
                title={ownerSecurityLoaded ? "No Active Grants" : "Grants Not Connected"}
              />
            )}
          </View>

          <View style={styles.ownerSecurityPanel}>
            <View style={styles.ownerSecurityPanelHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ownerSecuritySectionKicker}>SECURITY AUDIT</Text>
                <Text style={styles.ownerSecuritySectionTitle}>Recent Security Timeline</Text>
                <Text style={styles.ownerSecuritySectionBody}>Device trust, proof grants, role changes, Live Ops actions, and blocked access events when logged.</Text>
              </View>
              <OwnerStatusPill label={ownerSecurityLoaded ? `${filteredOwnerSecurityAuditEvents.length}` : "Not Connected"} tone={ownerSecurityLoaded ? "info" : "locked"} />
            </View>
            <OwnerFilterChips options={ownerSecurityAuditFilterOptions} value={ownerSecurityAuditFilter} onChange={setOwnerSecurityAuditFilter} />
            {filteredOwnerSecurityAuditEvents.length ? (
              <View style={styles.ownerSecurityTimeline}>
                {filteredOwnerSecurityAuditEvents.map((event, index) => (
                  <View key={String(event.id ?? `${event.eventType}-${index}`)} style={styles.ownerSecurityTimelineRow}>
                    <View style={[styles.ownerSecurityTimelineDot, ownerToneBadgeStyle(ownerSecurityToneForStatus(event.severity))]} />
                    <View style={styles.ownerSecurityTimelineCopy}>
                      <View style={styles.ownerSecurityDeviceTitleRow}>
                        <Text style={styles.ownerSecurityTimelineTitle}>{formatModerationToken(event.eventType || "security_event")}</Text>
                        <OwnerStatusPill label={ownerSecurityStatusLabel(event.severity || "low")} tone={ownerSecurityToneForStatus(event.severity)} />
                      </View>
                      <Text style={styles.ownerSecuritySectionBody}>{`${formatOwnerSecurityActor(event)} -> ${formatOwnerSecurityTarget(event)}`}</Text>
                      {event.reason ? <Text style={styles.ownerSecuritySectionBody}>{formatAuditDisplayText(event.reason)}</Text> : null}
                      {summarizeOwnerSecurityMetadata(event.metadata) ? (
                        <Text style={styles.ownerSecurityMiniMeta}>{summarizeOwnerSecurityMetadata(event.metadata)}</Text>
                      ) : null}
                      <Text style={styles.ownerSecurityMiniMeta}>{event.createdAt ? formatModerationTimestamp(event.createdAt) : "Timestamp unavailable"}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <OwnerEmptyState
                body={ownerSecurityLoaded ? "No audit events match this filter." : "Security audit feed is not connected yet."}
                title={ownerSecurityLoaded ? "No Events In Filter" : "Audit Not Connected"}
              />
            )}
          </View>

          <View style={styles.ownerSecurityPanel}>
            <View style={styles.ownerSecurityPanelHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ownerSecuritySectionKicker}>LIVE OPS FLAGS</Text>
                <Text style={styles.ownerSecuritySectionTitle}>Launch Operations Signals</Text>
                <Text style={styles.ownerSecuritySectionBody}>Read-only signals from backed registry, incident, cost guard, and exposure models. No remediation runs here.</Text>
              </View>
              <OwnerStatusPill label={ownerSecurityLoaded ? `${ownerSecurityLiveOpsFlags.length}` : "Not Connected"} tone={ownerSecurityLoaded ? "info" : "locked"} />
            </View>
            {ownerSecurityLiveOpsFlags.length ? (
              <View style={styles.ownerSecurityOpsGrid}>
                {ownerSecurityLiveOpsFlags.map((flag: OwnerSecurityLiveOpsFlag) => (
                  <View key={String(flag.key ?? flag.title)} style={styles.ownerSecurityOpsTile}>
                    <View style={styles.ownerSecurityDeviceTitleRow}>
                      <Text style={styles.ownerSecurityOpsTitle}>{flag.title || "Live Ops flag"}</Text>
                      <OwnerStatusPill label={ownerSecurityStatusLabel(flag.status)} tone={ownerSecurityToneForStatus(flag.status)} />
                    </View>
                    <Text style={styles.ownerSecuritySectionBody}>{flag.meaning || "Status meaning unavailable."}</Text>
                    <Text style={styles.ownerSecurityMiniMeta}>{flag.lastCheckedAt ? `Last checked ${formatModerationTimestamp(flag.lastCheckedAt)}` : "Last checked not connected"}</Text>
                    <Text style={styles.ownerSecuritySectionBody}>{flag.recommendedAction || "Manual review required."}</Text>
                    <TouchableOpacity
                      style={[styles.ownerSecuritySmallButton, !canAccessLiveOps && styles.configSaveBtnDisabled]}
                      onPress={() => setOperatorTab("live-ops-fix-center")}
                      disabled={!canAccessLiveOps}
                    >
                      <Text style={styles.ownerSecuritySmallButtonText}>{canAccessLiveOps ? "Open Live Ops" : "Live Ops permission required"}</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : (
              <OwnerEmptyState
                body={ownerSecurityLoaded ? "No Live Ops flags were returned." : "Live Ops flags are not connected yet."}
                title={ownerSecurityLoaded ? "No Flags Loaded" : "Flags Not Connected"}
              />
            )}
          </View>

          <View style={styles.ownerSecurityPanel}>
            <View style={styles.ownerSecurityPanelHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ownerSecuritySectionKicker}>SECURITY CHECKLIST</Text>
                <Text style={styles.ownerSecuritySectionTitle}>Backed Guardrail Proof</Text>
                <Text style={styles.ownerSecuritySectionBody}>Rows show the proof source and never report green when the backend cannot prove it.</Text>
              </View>
              <TouchableOpacity
                style={[styles.ownerSecondaryButton, ownerSecurityActionBusy === "checklist-refresh" && styles.configSaveBtnDisabled]}
                onPress={() => void runOwnerSecurityChecklistRefresh()}
                disabled={ownerSecurityActionBusy === "checklist-refresh"}
              >
                <Text style={styles.ownerSecondaryButtonText}>{ownerSecurityActionBusy === "checklist-refresh" ? "Checking..." : "Run Checklist"}</Text>
              </TouchableOpacity>
            </View>
            {ownerSecurityChecklist.length ? (
              <View style={styles.ownerControlList}>
                {ownerSecurityChecklist.map((item) => (
                  <OwnerControlRow
                    key={String(item.key ?? item.title)}
                    message={`${formatAuditDisplayText(item.whatItMeans) || "No detail supplied."} Proof: ${formatAuditDisplayText(item.proofSource) || "not supplied"}.`}
                    meta={item.lastCheckedAt ? `Last checked ${formatModerationTimestamp(item.lastCheckedAt)}` : "Last checked not connected"}
                    statusLabel={ownerSecurityStatusLabel(item.status)}
                    title={String(item.title ?? "Security checklist item")}
                    tone={ownerSecurityToneForStatus(item.status)}
                  />
                ))}
              </View>
            ) : (
              <OwnerEmptyState
                body={ownerSecurityLoaded ? "Checklist returned no rows." : "Run or refresh Owner Security to load checklist proof."}
                title={ownerSecurityLoaded ? "Checklist Empty" : "Checklist Not Connected"}
              />
            )}
          </View>

          <View style={styles.ownerSecurityEmergency}>
            <View style={styles.ownerSecurityPanelHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.ownerSecuritySectionKicker}>EMERGENCY ACTIONS</Text>
                <Text style={styles.ownerSecuritySectionTitle}>Owner Safety Controls</Text>
                <Text style={styles.ownerSecuritySectionBody}>Only backend-backed actions appear here. Dangerous actions require confirmation and write security events.</Text>
              </View>
              <OwnerStatusPill label="Careful" tone="danger" />
            </View>
            <View style={styles.ownerSecurityActionRow}>
              <TouchableOpacity
                style={[styles.ownerPrimaryButton, (!Number(ownerSecurityActiveGrantsCount ?? 0) || ownerSecurityActionBusy === "bulk-revoke-grants") && styles.configSaveBtnDisabled]}
                onPress={() => {
                  setOwnerSecurityConfirmText("");
                  setOwnerSecurityConfirmVisible(true);
                }}
                disabled={!Number(ownerSecurityActiveGrantsCount ?? 0) || ownerSecurityActionBusy === "bulk-revoke-grants"}
              >
                <Text style={styles.ownerPrimaryButtonText}>{Number(ownerSecurityActiveGrantsCount ?? 0) ? "Revoke all grants" : "No grants to revoke"}</Text>
              </TouchableOpacity>
              {ownerSecurityCurrentDevice?.id && ownerSecurityCurrentDevice.trustStatus !== "revoked" ? (
                <TouchableOpacity
                  style={styles.ownerSecondaryButton}
                  onPress={() => void runOwnerSecurityRevokeDevice(String(ownerSecurityCurrentDevice.id), true)}
                >
                  <Text style={styles.ownerSecondaryButtonText}>Mark current untrusted</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[styles.ownerSecondaryButton, styles.configSaveBtnDisabled]} disabled>
                  <Text style={styles.ownerSecondaryButtonText}>No trusted current device</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.ownerSecondaryButton} onPress={() => void loadOwnerSecurity()}>
                <Text style={styles.ownerSecondaryButtonText}>Refresh state</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ownerSecondaryButton} onPress={() => setOperatorTab("live-ops-fix-center")}>
                <Text style={styles.ownerSecondaryButtonText}>Open incident checklist</Text>
              </TouchableOpacity>
            </View>
            {!Number(ownerSecurityActiveGrantsCount ?? 0) ? (
              <OwnerDisabledReason reason="Bulk grant revoke is disabled because the backend reports no active temporary grants." />
            ) : null}
            {!(ownerSecurityCurrentDevice?.id && ownerSecurityCurrentDevice.trustStatus !== "revoked") ? (
              <OwnerDisabledReason reason="Mark current untrusted is disabled until a trusted current device record is connected." />
            ) : null}
          </View>
        </View>
        ) : null}

        {operatorTab === "canary" ? (
        <View style={styles.configCard}>
          <OwnerControlPanelHeader
            actions={(
              <>
                <TouchableOpacity
                  style={[styles.ownerPrimaryButton, (canaryBusy || !canAccessCanaryChecks) && styles.configSaveBtnDisabled]}
                  onPress={() => void runCanaryChecks()}
                  disabled={canaryBusy || !canAccessCanaryChecks}
                >
                  <Text style={styles.ownerPrimaryButtonText}>{canaryBusy ? "Running..." : canAccessCanaryChecks ? "Run Canary Checks" : "Locked"}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ownerSecondaryButton} onPress={() => void loadCanaries()}>
                  <Text style={styles.ownerSecondaryButtonText}>Refresh</Text>
                </TouchableOpacity>
              </>
            )}
            badgeLabel={canAccessCanaryChecks ? "Authorized" : "Locked"}
            badgeTone={canAccessCanaryChecks ? "success" : "locked"}
            kicker="CANARY CHECKS"
            lastRunLabel={latestCanaryRun?.created_at ? `Last run ${formatModerationTimestamp(String(latestCanaryRun.created_at))}` : "No canary run yet"}
            subtitle="Real checks only; manual required is never treated as green."
            title="Public Launch Safety Checks"
          />

          {ownerControlNotice ? (
            <View style={[styles.notice, styles.noticeWarn]}>
              <Text style={styles.noticeText}>{ownerControlNotice}</Text>
            </View>
          ) : null}

          {!canAccessCanaryChecks ? (
            <OwnerDisabledReason reason="Canary run is disabled because this account lacks Owner, canary_run, or launch_safety permission. Refresh remains read-only." />
          ) : null}

          <View style={styles.ownerRunBanner}>
            <View style={styles.ownerSectionHeaderRow}>
              <Text style={styles.ownerRunBannerTitle}>Latest Run Snapshot</Text>
              <OwnerStatusPill
                label={latestCanaryRun?.status ? formatModerationToken(String(latestCanaryRun.status)) : "Not Run"}
                tone={latestCanarySummary.fail > 0 ? "danger" : latestCanarySummary.manualRequired > 0 ? "manual" : latestCanaryRun ? "success" : "locked"}
              />
            </View>
            <Text style={styles.ownerRunBannerBody}>
              {latestCanaryRun
                ? latestCanarySummary.fail > 0
                  ? "Failed checks need review before launch. The UI keeps them visible and actionable."
                  : latestCanarySummary.manualRequired > 0
                    ? "Manual Required checks are surfaced as warnings, never green proof."
                    : "All available checks from the latest run passed."
                : "No production canary run is loaded yet. Run or refresh to load backed proof rows."}
            </Text>
          </View>

          <View style={styles.dashboardGrid}>
            <OwnerMetricTile label="Passed" tone="success" value={latestCanarySummary.pass} />
            <OwnerMetricTile label="Manual Required" tone="manual" value={latestCanarySummary.manualRequired} />
            <OwnerMetricTile label="Failed" tone={latestCanarySummary.fail > 0 ? "danger" : "success"} value={latestCanarySummary.fail} />
          </View>

          <View style={styles.ownerToolbarPanel}>
            <View style={styles.ownerSectionHeaderRow}>
              <Text style={styles.ownerSectionTitle}>Check Filters</Text>
              <OwnerStatusPill label={`${filteredCanaryResults.length} visible`} tone="info" />
            </View>
            <Text style={styles.ownerPanelMeta}>Filter by proof status without hiding failed or manual-required checks behind a pass count.</Text>
            <OwnerFilterChips options={canaryFilterOptions} value={canaryStatusFilter} onChange={setCanaryStatusFilter} />
          </View>

          {canaryBusy ? (
            <OwnerEmptyState body="The check run is using real backend proof paths and will refresh the grouped proof panels when it finishes." title="Running checks" />
          ) : !latestCanaryRun ? (
            <OwnerEmptyState
              body={ownerControlLoading ? "Canary history is loading from the backend." : "Run the first production canary when ready; no placeholder proof is shown."}
              title={ownerControlLoading ? "Loading Canary" : "No canary run yet"}
            />
          ) : filteredCanaryResults.length === 0 ? (
            <OwnerEmptyState body="Choose another filter to see available checks." title="No checks in this filter" />
          ) : (
            <View style={styles.ownerControlList}>
              {groupedCanaryResults.map((group) => (
                <View key={group.section} style={styles.ownerSectionGroup}>
                  <View style={styles.ownerSectionHeaderRow}>
                    <Text style={styles.ownerSectionTitle}>{group.section}</Text>
                    <OwnerStatusPill label={`${group.results.length} checks`} tone="info" />
                  </View>
                  {group.results.map((result, resultIndex) => {
                    const status = normalizeCanaryStatus(result.status);
                    const rowKey = `${latestCanaryRun.id ?? "latest"}-${String(result.key ?? "result")}-${resultIndex}`;
                    const expanded = !!expandedCanaryRows[rowKey];
                    return (
                      <OwnerControlRow
                        key={rowKey}
                        expanded={expanded}
                        message={formatAuditDisplayText(result.actual || result.message) || "Canary check returned no message."}
                        meta={formatAuditDisplayText(result.testedSurface) || "No tested surface supplied"}
                        onPress={() => toggleCanaryRow(rowKey)}
                        statusLabel={ownerStatusLabel(status)}
                        title={result.label}
                        tone={ownerToneForStatus(status)}
                      >
                        <CanaryProofDetails result={result} status={status} />
                      </OwnerControlRow>
                    );
                  })}
                </View>
              ))}
            </View>
          )}

          {canaryRuns.length > 1 ? (
            <View style={styles.ownerHistoryStrip}>
              <Text style={styles.ownerSectionTitle}>Recent history</Text>
              {canaryRuns.slice(1, 4).map((run) => {
                const summary = summarizeCanaryRun(run);
                return (
                  <View key={String(run.id)} style={styles.ownerHistoryRow}>
                    <Text style={styles.ownerHistoryText}>{run.created_at ? formatModerationTimestamp(String(run.created_at)) : "Time unknown"}</Text>
                    <Text style={styles.ownerHistoryText}>{`${summary.pass} pass · ${summary.manualRequired} manual · ${summary.fail} failed`}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>
        ) : null}

        {operatorTab === "safety-dashboard" ? (
        <View style={styles.configCard}>
          <OwnerControlPanelHeader
            badgeLabel={canAccessOwnerSecurity ? "Owner" : "Locked"}
            badgeTone={canAccessOwnerSecurity ? "success" : "locked"}
            kicker="OWNER SAFETY"
            subtitle="Real counts only. Missing aggregations show Manual Required instead of fake zeroes."
            title="Safety Dashboard"
          />
          <View style={styles.dashboardGrid}>
            <OwnerMetricTile label="Open Reports" tone={ownerAttentionCountTone(ownerSafetyDashboard?.openReports)} value={ownerMetricValue(ownerSafetyDashboard?.openReports)} />
            <OwnerMetricTile label="Legal Holds" tone={ownerAttentionCountTone(ownerSafetyDashboard?.activeLegalHolds)} value={ownerMetricValue(ownerSafetyDashboard?.activeLegalHolds)} />
            <OwnerMetricTile label="Legal Requests" tone={ownerAttentionCountTone(ownerSafetyDashboard?.unresolvedLegalRequests)} value={ownerMetricValue(ownerSafetyDashboard?.unresolvedLegalRequests)} />
            <OwnerMetricTile label="Repeated Reports" tone="manual" value="Manual" />
          </View>
          <View style={styles.ownerToolbarPanel}>
            <View style={styles.ownerSectionHeaderRow}>
              <Text style={styles.ownerSectionTitle}>Attention Signals</Text>
              <OwnerStatusPill label="Read Only" tone="info" />
            </View>
            <Text style={styles.ownerPanelMeta}>Counts come from backed safety/legal sources. Missing aggregations stay warning-colored with an exact reason.</Text>
          </View>
          <View style={styles.ownerControlList}>
            <OwnerControlRow
              expanded
              message={formatAuditDisplayText(ownerSafetyDashboard?.repeatedReportTargets?.message) || "Repeated-report aggregation is not configured."}
              statusLabel="Manual Required"
              title="Repeated-report targets"
              tone="manual"
            >
              <OwnerDisabledReason reason="Repeated-report target aggregation is not connected in the backend yet, so this row cannot be marked passed or zero." />
            </OwnerControlRow>
          </View>
        </View>
        ) : null}

        {operatorTab === "ops-alerts" ? (
        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>OPS ALERTS</Text>
              <Text style={styles.configTitle}>Ops alert automation</Text>
              <Text style={styles.configBody}>
                Read-only contract for the backend Alertmanager safety gate. Live reliability approvals now belong in the Live Ops Fix Center proxy lane.
              </Text>
            </View>
            <View style={[styles.badge, styles.badgeScheduled]}>
              <Text style={styles.badgeText}>Operator-only</Text>
            </View>
          </View>

          <View style={styles.dashboardGrid}>
            <View style={styles.dashboardMetricCard}>
              <Text style={styles.dashboardMetricLabel}>Safety Model</Text>
              <Text style={styles.dashboardMetricValue}>Dry-run first</Text>
              <Text style={styles.dashboardMetricBody}>
                Webhook receipt can create jobs and audit plans, but destructive actions require backend approval plus explicit safety flags.
              </Text>
            </View>
            <View style={styles.dashboardMetricCard}>
              <Text style={styles.dashboardMetricLabel}>Email</Text>
              <Text style={styles.dashboardMetricValue}>Default off</Text>
              <Text style={styles.dashboardMetricBody}>
                SMTP notifications are optional, notify-only, and cannot approve or execute ops jobs.
              </Text>
            </View>
            <View style={[styles.dashboardMetricCard, styles.dashboardMetricCardUnavailable]}>
              <Text style={styles.dashboardMetricLabel}>Approve / Deny</Text>
              <Text style={styles.dashboardMetricValue}>Fix Center</Text>
              <Text style={styles.dashboardMetricBody}>
                Owner/operator approval for Live reliability incidents goes through `admin-live-ops-fix-center`; tokens still never ship in client code.
              </Text>
            </View>
            <View style={styles.dashboardMetricCard}>
              <Text style={styles.dashboardMetricLabel}>Read API</Text>
              <Text style={styles.dashboardMetricValue}>Backend-owned</Text>
              <Text style={styles.dashboardMetricBody}>
                The ops service exposes sanitized job list/detail endpoints for a trusted admin backend or internal operator network.
              </Text>
            </View>
          </View>

          <View style={styles.configList}>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Admin visibility scope</Text>
                <Text style={styles.configListBody}>
                  This tab records the general automation contract only. Live and chat-call incident cards are read through the dedicated Fix Center proxy.
                </Text>
              </View>
              <View style={styles.badgesRow}>
                <View style={[styles.badge, styles.badgeScheduled]}>
                  <Text style={styles.badgeText}>Read-only</Text>
                </View>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Approval path</Text>
                <Text style={styles.configListBody}>
                  Approve/Deny for Live reliability incidents is available in Live Ops Fix Center. Other ops jobs remain backend-only unless a separate proxy is added.
                </Text>
              </View>
              <View style={styles.configListActions}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => setOperatorTab("live-ops-fix-center")}>
                  <Text style={styles.actionText}>Open Fix Center</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtnDanger, styles.configSaveBtnDisabled]} disabled>
                  <Text style={styles.actionTextDanger}>Dangerous ops still gated</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Production action gates</Text>
                <Text style={styles.configListBody}>
                  LiveKit DeleteRoom/RemoveParticipant still require approval, `ALLOW_LIVE_ACTIONS=true`, and `DRY_RUN=false`. Network shaping still requires approval, `ALLOW_NET_SHAPING=true`, and `DRY_RUN=false`.
                </Text>
              </View>
            </View>
            <View style={styles.configListRow}>
              <View style={styles.configListCopy}>
                <Text style={styles.configListTitle}>Secrets boundary</Text>
                <Text style={styles.configListBody}>
                  Approval tokens, SMTP credentials, LiveKit API secrets, provider secrets, HLS URLs, service-role keys, and raw device tokens must never appear in this mobile Admin panel.
                </Text>
              </View>
            </View>
          </View>
        </View>
        ) : null}

        {operatorTab === "system" ? (
        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>SYSTEM</Text>
              <Text style={styles.configTitle}>System</Text>
              <Text style={styles.configBody}>
                Read-only setup status only. Missing health checks stay labeled Not connected yet.
              </Text>
            </View>
            <View style={[styles.badge, styles.badgeScheduled]}>
              <Text style={styles.badgeText}>Read-only</Text>
            </View>
          </View>
          <View style={styles.dashboardGrid}>
            {systemStatusCards.map((card) => (
              <View
                key={card.label}
                style={[
                  styles.dashboardMetricCard,
                  card.tone === "unavailable" && styles.dashboardMetricCardUnavailable,
                ]}
              >
                <Text style={styles.dashboardMetricLabel}>{card.label}</Text>
                <Text style={styles.dashboardMetricValue}>{card.value}</Text>
                <Text style={styles.dashboardMetricBody}>{card.body}</Text>
              </View>
            ))}
          </View>
        </View>
        ) : null}

        {operatorTab === "content" ? renderContentProgrammingCenter() : null}

        {false ? (
        <>
        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>EXPERIENCE CONFIG</Text>
              <Text style={styles.configTitle}>Global presentation and feature controls</Text>
              <Text style={styles.configBody}>
                Tune homepage, feature visibility, and safe presentation defaults here. Locked product naming stays code-owned, and saving requires an active owner or operator role.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.configSaveBtn,
                { backgroundColor: themePalette.accent },
                (configSaving || configLoading || platformRolesLoading || !canManagePrivilegedWrites) && styles.configSaveBtnDisabled,
              ]}
              onPress={saveExperienceConfigChanges}
              disabled={configSaving || configLoading || platformRolesLoading || !canManagePrivilegedWrites}
            >
              {configSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.configSaveBtnText}>Save Config</Text>}
            </TouchableOpacity>
          </View>

          {configLoading ? (
            <View style={styles.configLoadingRow}>
              <ActivityIndicator color="#fff" />
              <Text style={styles.configLoadingText}>Loading current config…</Text>
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>Theme Preset</Text>
              <View style={styles.toggleRowWrap}>
                {(["city_night", "lake_glow", "steel_day"] as const).map((preset) => (
                  <TouchableOpacity
                    key={preset}
                    style={[styles.toggleChip, experienceConfig.theme.preset === preset && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        theme: {
                          ...prev.theme,
                          preset,
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.theme.preset === preset && styles.toggleChipTextActive]}>
                      {preset.replace("_", " ").toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Background Mode</Text>
              <View style={styles.toggleRowWrap}>
                {(["hero_art", "skyline"] as const).map((mode) => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.toggleChip, experienceConfig.theme.backgroundMode === mode && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        theme: {
                          ...prev.theme,
                          backgroundMode: mode,
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.theme.backgroundMode === mode && styles.toggleChipTextActive]}>
                      {mode.replace("_", " ").toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Hero Strategy</Text>
              <View style={styles.toggleRowWrap}>
                {(["latest", "hero_flag", "manual_title"] as const).map((heroMode) => (
                  <TouchableOpacity
                    key={heroMode}
                    style={[styles.toggleChip, experienceConfig.home.heroMode === heroMode && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        home: {
                          ...prev.home,
                          heroMode,
                          manualHeroTitleId: heroMode === "manual_title" ? prev.home.manualHeroTitleId : null,
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.home.heroMode === heroMode && styles.toggleChipTextActive]}>
                      {heroMode.replace("_", " ").toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {experienceConfig.home.heroMode === "manual_title" ? (
                <>
                  <Text style={styles.sectionLabel}>Manual Hero Title</Text>
                  <Text style={styles.configBody}>
                    Search the real title set here and choose the exact title Home should use as the manual hero target.
                  </Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Search titles, category, or status"
                    placeholderTextColor="#8d8d8d"
                    value={manualHeroQuery}
                    onChangeText={setManualHeroQuery}
                  />

                  {manualHeroSelection.selectedTitle ? (
                    <View style={styles.configListRow}>
                      <View style={styles.configListCopy}>
                        <Text style={styles.configListTitle}>Current manual hero target</Text>
                        <Text style={styles.configListBody}>{manualHeroSelection.selectedTitle!.title}</Text>
                        <Text style={styles.configListBody}>
                          {`${manualHeroSelection.selectedTitle!.category ?? "Uncategorized"} · ${normalizeStatus(
                            manualHeroSelection.selectedTitle!.status,
                            manualHeroSelection.selectedTitle!.is_published,
                          ).toUpperCase()} · Sort ${manualHeroSelection.selectedTitle!.sort_order ?? "—"}`}
                        </Text>
                      </View>
                      <View style={styles.badgesRow}>
                        <View style={[styles.badge, styles.badgePublished]}>
                          <Text style={styles.badgeText}>SELECTED</Text>
                        </View>
                      </View>
                    </View>
                  ) : null}

                  <View style={styles.configList}>
                    {manualHeroSelection.visibleTitles.map((item) => {
                      const isSelected = manualHeroSelection.selectedId.length > 0 && hasTitleId(item, manualHeroSelection.selectedId);
                      const status = normalizeStatus(item.status, item.is_published);

                      return (
                        <View key={toIdString(item.id)} style={styles.configListRow}>
                          <View style={styles.configListCopy}>
                            <Text style={styles.configListTitle}>{item.title}</Text>
                            <Text style={styles.configListBody}>
                              {`${item.category ?? "Uncategorized"} · ${status.toUpperCase()} · Sort ${item.sort_order ?? "—"}`}
                            </Text>
                            <Text style={styles.configListBody}>
                              {item.featured ? "Featured" : "Standard"}
                              {item.is_hero ? " · Hero Flag" : ""}
                              {item.is_trending ? " · Trending" : ""}
                              {item.pin_to_top_row ? " · Top Row" : ""}
                            </Text>
                          </View>

                          <View style={styles.configListActions}>
                            <TouchableOpacity
                              style={styles.orderBtn}
                              onPress={() => {
                                updateExperienceConfig((prev) => ({
                                  ...prev,
                                  home: {
                                    ...prev.home,
                                    manualHeroTitleId: String(item.id),
                                  },
                                }));
                                setManualHeroQuery("");
                              }}
                            >
                              <Text style={styles.orderBtnText}>{isSelected ? "Selected" : "Choose"}</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>

                  {!manualHeroSelection.visibleTitles.length ? (
                    <View style={styles.configListRow}>
                      <View style={styles.configListCopy}>
                        <Text style={styles.configListTitle}>No titles match this manual hero search</Text>
                        <Text style={styles.configListBody}>
                          Refine the search to target the exact title you want Home to resolve as the manual hero.
                        </Text>
                      </View>
                    </View>
                  ) : null}

                  {manualHeroSelection.totalMatches > manualHeroSelection.visibleTitles.length ? (
                    <Text style={styles.configListBody}>
                      {`Showing ${manualHeroSelection.visibleTitles.length} of ${manualHeroSelection.totalMatches} matching titles. Refine the search to narrow the manual hero target.`}
                    </Text>
                  ) : null}
                </>
              ) : null}

              <Text style={styles.sectionLabel}>Top Picks Source</Text>
              <View style={styles.toggleRowWrap}>
                {(["recent", "top_row", "featured", "trending"] as const).map((source) => (
                  <TouchableOpacity
                    key={source}
                    style={[styles.toggleChip, experienceConfig.home.topPicksSource === source && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        home: {
                          ...prev.home,
                          topPicksSource: source,
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.home.topPicksSource === source && styles.toggleChipTextActive]}>
                      {source.replace("_", " ").toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Current Programming Snapshot</Text>
              {loading ? (
                <View style={styles.configLoadingRow}>
                  <ActivityIndicator color="#fff" />
                  <Text style={styles.configLoadingText}>Loading current title programming state…</Text>
                </View>
              ) : (
                <View style={styles.configList}>
                  <View style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>Resolved Home hero</Text>
                      <Text style={styles.configListBody}>
                        {programmingSnapshot.resolvedHeroItem
                          ? `${programmingSnapshot.resolvedHeroItem.title} is the current hero outcome.`
                          : "No real title currently resolves as the Home hero."}
                      </Text>
                      <Text style={styles.configListBody}>
                        {`Configured ${formatProgrammingToken(programmingSnapshot.configuredHeroMode)} · Resolved from ${formatProgrammingToken(programmingSnapshot.resolvedHeroSource)}`}
                      </Text>
                      {programmingSnapshot.configuredHeroMode === "manual_title" ? (
                        <Text style={styles.configListBody}>
                          {programmingSnapshot.manualHeroItem
                            ? `Manual target: ${programmingSnapshot.manualHeroItem!.title}`
                            : "Manual target is currently unavailable, so Home would fall through to a real backup hero source."}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.badgesRow}>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{`Configured ${formatProgrammingToken(programmingSnapshot.configuredHeroMode)}`}</Text>
                      </View>
                      <View style={[styles.badge, styles.badgePublished]}>
                        <Text style={styles.badgeText}>{`Resolved ${formatProgrammingToken(programmingSnapshot.resolvedHeroSource)}`}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>Top Picks backing truth</Text>
                      <Text style={styles.configListBody}>
                        {`${formatProgrammingToken(programmingSnapshot.configuredTopPicksSource)} currently has ${programmingSnapshot.configuredTopPicksCount} real backing title${programmingSnapshot.configuredTopPicksCount === 1 ? "" : "s"}.`}
                      </Text>
                      <Text style={styles.configListBody}>
                        {programmingSnapshot.effectiveTopPicksSource === programmingSnapshot.configuredTopPicksSource
                          ? `${formatProgrammingToken(programmingSnapshot.effectiveTopPicksSource)} is backed and will stay active.`
                          : `${formatProgrammingToken(programmingSnapshot.configuredTopPicksSource)} is unbacked right now, so Home would fall back to ${formatProgrammingToken(programmingSnapshot.effectiveTopPicksSource)} with ${programmingSnapshot.effectiveTopPicksCount} real title${programmingSnapshot.effectiveTopPicksCount === 1 ? "" : "s"}.`}
                      </Text>
                    </View>

                    <View style={styles.badgesRow}>
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>{`Configured ${formatProgrammingToken(programmingSnapshot.configuredTopPicksSource)}`}</Text>
                      </View>
                      <View
                        style={[
                          styles.badge,
                          programmingSnapshot.effectiveTopPicksSource === programmingSnapshot.configuredTopPicksSource
                            ? styles.badgePublished
                            : styles.badgeScheduled,
                        ]}
                      >
                        <Text style={styles.badgeText}>{`Backing ${programmingSnapshot.configuredTopPicksCount}`}</Text>
                      </View>
                      <View style={[styles.badge, styles.badgeOn]}>
                        <Text style={styles.badgeText}>{`Active ${formatProgrammingToken(programmingSnapshot.effectiveTopPicksSource)}`}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>Programming confidence</Text>
                      {programmingSnapshot.guardrailAdjustments.length ? (
                        programmingSnapshot.guardrailAdjustments.map((adjustment) => (
                          <Text key={adjustment} style={styles.configListBody}>
                            {adjustment}
                          </Text>
                        ))
                      ) : (
                        <Text style={styles.configListBody}>
                          Hero strategy and top picks are both backed by current title truth, so saving this config would preserve the current programming state without normalization.
                        </Text>
                      )}
                    </View>
                  </View>
                </View>
              )}

              <Text style={styles.sectionLabel}>Homepage Rails</Text>
              <View style={styles.configList}>
                {experienceConfig.home.railOrder.map((railKey, index) => (
                  <View key={railKey} style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>{railLabels[railKey]}</Text>
                      <Text style={styles.configListBody}>
                        Position {index + 1} · {experienceConfig.home.enabledRails[railKey] ? "Visible" : "Hidden"}
                      </Text>
                    </View>
                    <View style={styles.configListActions}>
                      <TouchableOpacity
                        style={styles.orderBtn}
                        onPress={() =>
                          updateExperienceConfig((prev) => ({
                            ...prev,
                            home: {
                              ...prev.home,
                              enabledRails: {
                                ...prev.home.enabledRails,
                                [railKey]: !prev.home.enabledRails[railKey],
                              },
                            },
                          }))
                        }
                      >
                        <Text style={styles.orderBtnText}>
                          {experienceConfig.home.enabledRails[railKey] ? "Hide" : "Show"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.orderBtn} onPress={() => moveRail(railKey, -1)} disabled={index === 0}>
                        <Text style={styles.orderBtnText}>Up</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.orderBtn}
                        onPress={() => moveRail(railKey, 1)}
                        disabled={index === experienceConfig.home.railOrder.length - 1}
                      >
                        <Text style={styles.orderBtnText}>Down</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>

              <View style={styles.inlineInputs}>
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Browse rail label"
                  placeholderTextColor="#8d8d8d"
                  value={experienceConfig.home.browseCategoryLabel}
                  onChangeText={(text) =>
                    updateExperienceConfig((prev) => ({
                      ...prev,
                      home: {
                        ...prev.home,
                        browseCategoryLabel: text,
                      },
                    }))
                  }
                />
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Browse category query"
                  placeholderTextColor="#8d8d8d"
                  value={experienceConfig.home.browseCategoryQuery}
                  onChangeText={(text) =>
                    updateExperienceConfig((prev) => ({
                      ...prev,
                      home: {
                        ...prev.home,
                        browseCategoryQuery: text,
                      },
                    }))
                  }
                />
              </View>

              <TextInput
                style={styles.input}
                placeholder="Max items per rail"
                placeholderTextColor="#8d8d8d"
                keyboardType="numeric"
                value={String(experienceConfig.home.maxItemsPerRail)}
                onChangeText={(text) =>
                  updateExperienceConfig((prev) => ({
                    ...prev,
                    home: {
                      ...prev.home,
                      maxItemsPerRail: Number.parseInt(text || "0", 10) || prev.home.maxItemsPerRail,
                    },
                  }))
                }
              />

              <Text style={styles.sectionLabel}>Feature Toggles</Text>
              <View style={styles.toggleRowWrap}>
                {([
                  ["watchPartyEnabled", "Watch Party"],
                  ["communicationEnabled", "Communication"],
                  ["favoritesEnabled", "Favorites"],
                  ["continueWatchingEnabled", "Continue Watching"],
                  ["creatorSettingsEnabled", "Creator Settings"],
                ] as const).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.toggleChip, experienceConfig.features[key] && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        features: {
                          ...prev.features,
                          [key]: !prev.features[key],
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.features[key] && styles.toggleChipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Monetization Runtime</Text>
              <View style={styles.toggleRowWrap}>
                {([
                  ["premiumEnabled", "Premium"],
                  ["partyPassEnabled", "Party Pass"],
                  ["sponsorPlacementsEnabled", "Sponsor Placements"],
                  ["playerBannerEnabled", "Player Banner"],
                  ["playerMidRollEnabled", "Player Mid-Roll"],
                ] as const).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[styles.toggleChip, experienceConfig.monetization[key] && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        monetization: {
                          ...prev.monetization,
                          [key]: !prev.monetization[key],
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.monetization[key] && styles.toggleChipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput
                style={styles.input}
                placeholder="Default sponsor label"
                placeholderTextColor="#8d8d8d"
                value={experienceConfig.monetization.defaultSponsorLabel}
                onChangeText={(text) =>
                  updateExperienceConfig((prev) => ({
                    ...prev,
                    monetization: {
                      ...prev.monetization,
                      defaultSponsorLabel: text,
                    },
                  }))
                }
              />
              <TextInput
                style={styles.input}
                placeholder="Premium access title"
                placeholderTextColor="#8d8d8d"
                value={experienceConfig.monetization.premiumUpsellTitle}
                onChangeText={(text) =>
                  updateExperienceConfig((prev) => ({
                    ...prev,
                    monetization: {
                      ...prev.monetization,
                      premiumUpsellTitle: text,
                    },
                  }))
                }
              />
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="Premium access body"
                placeholderTextColor="#8d8d8d"
                multiline
                value={experienceConfig.monetization.premiumUpsellBody}
                onChangeText={(text) =>
                  updateExperienceConfig((prev) => ({
                    ...prev,
                    monetization: {
                      ...prev.monetization,
                      premiumUpsellBody: text,
                    },
                  }))
                }
              />

              <Text style={styles.sectionLabel}>Branding</Text>
              <Text style={styles.configHint}>
                Core product naming is locked by doctrine. Only safe presentation copy like the hero kicker and admin labels persists here.
              </Text>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                placeholder="App display name"
                placeholderTextColor="#8d8d8d"
                value={experienceConfig.branding.appDisplayName}
                editable={false}
                selectTextOnFocus={false}
              />
              <TextInput
                style={styles.input}
                placeholder="Home hero kicker"
                placeholderTextColor="#8d8d8d"
                value={experienceConfig.branding.homeHeroKicker}
                onChangeText={(text) =>
                  updateExperienceConfig((prev) => ({
                    ...prev,
                    branding: {
                      ...prev.branding,
                      homeHeroKicker: text,
                    },
                  }))
                }
              />
              <View style={styles.inlineInputs}>
                <TextInput
                  style={[styles.input, styles.inputHalf, styles.inputDisabled]}
                  placeholder="Watch Party label"
                  placeholderTextColor="#8d8d8d"
                  value={experienceConfig.branding.watchPartyLabel}
                  editable={false}
                  selectTextOnFocus={false}
                />
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Operator center label"
                  placeholderTextColor="#8d8d8d"
                  value={experienceConfig.branding.adminTitle}
                  onChangeText={(text) =>
                    updateExperienceConfig((prev) => ({
                      ...prev,
                      branding: {
                        ...prev.branding,
                        adminTitle: text,
                      },
                    }))
                  }
                />
              </View>
              <View style={styles.inlineInputs}>
                <TextInput
                  style={[styles.input, styles.inputHalf, styles.inputDisabled]}
                  placeholder="Live waiting room title"
                  placeholderTextColor="#8d8d8d"
                  value={experienceConfig.branding.liveWaitingRoomTitle}
                  editable={false}
                  selectTextOnFocus={false}
                />
                <TextInput
                  style={[styles.input, styles.inputHalf, styles.inputDisabled]}
                  placeholder="Party waiting room title"
                  placeholderTextColor="#8d8d8d"
                  value={experienceConfig.branding.partyWaitingRoomTitle}
                  editable={false}
                  selectTextOnFocus={false}
                />
              </View>
              <View style={styles.inlineInputs}>
                <TextInput
                  style={[styles.input, styles.inputHalf, styles.inputDisabled]}
                  placeholder="Live room title"
                  placeholderTextColor="#8d8d8d"
                  value={experienceConfig.branding.liveRoomTitle}
                  editable={false}
                  selectTextOnFocus={false}
                />
                <TextInput
                  style={[styles.input, styles.inputHalf, styles.inputDisabled]}
                  placeholder="Party room title"
                  placeholderTextColor="#8d8d8d"
                  value={experienceConfig.branding.partyRoomTitle}
                  editable={false}
                  selectTextOnFocus={false}
                />
              </View>
              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="Operator center helper copy"
                placeholderTextColor="#8d8d8d"
                multiline
                value={experienceConfig.branding.adminSubtitle}
                onChangeText={(text) =>
                  updateExperienceConfig((prev) => ({
                    ...prev,
                    branding: {
                      ...prev.branding,
                      adminSubtitle: text,
                    },
                  }))
                }
              />

              <Text style={styles.sectionLabel}>New Watch Party Defaults</Text>
              <View style={styles.toggleRowWrap}>
                {(["open", "locked"] as const).map((value) => (
                  <TouchableOpacity
                    key={`watch-join-${value}`}
                    style={[styles.toggleChip, experienceConfig.roomDefaults.watchParty.joinPolicy === value && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        roomDefaults: {
                          ...prev.roomDefaults,
                          watchParty: {
                            ...prev.roomDefaults.watchParty,
                            joinPolicy: value,
                          },
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.roomDefaults.watchParty.joinPolicy === value && styles.toggleChipTextActive]}>
                      JOIN {value.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
                {(["enabled", "muted"] as const).map((value) => (
                  <TouchableOpacity
                    key={`watch-reactions-${value}`}
                    style={[styles.toggleChip, experienceConfig.roomDefaults.watchParty.reactionsPolicy === value && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        roomDefaults: {
                          ...prev.roomDefaults,
                          watchParty: {
                            ...prev.roomDefaults.watchParty,
                            reactionsPolicy: value,
                          },
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.roomDefaults.watchParty.reactionsPolicy === value && styles.toggleChipTextActive]}>
                      REACTIONS {value.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.toggleRowWrap}>
                {(["open", "party_pass", "premium"] as const).map((value) => (
                  <TouchableOpacity
                    key={`watch-access-${value}`}
                    style={[styles.toggleChip, experienceConfig.roomDefaults.watchParty.contentAccessRule === value && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        roomDefaults: {
                          ...prev.roomDefaults,
                          watchParty: {
                            ...prev.roomDefaults.watchParty,
                            contentAccessRule: value,
                          },
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.roomDefaults.watchParty.contentAccessRule === value && styles.toggleChipTextActive]}>
                      {value.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
                {(["best_effort", "host_managed"] as const).map((value) => (
                  <TouchableOpacity
                    key={`watch-capture-${value}`}
                    style={[styles.toggleChip, experienceConfig.roomDefaults.watchParty.capturePolicy === value && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        roomDefaults: {
                          ...prev.roomDefaults,
                          watchParty: {
                            ...prev.roomDefaults.watchParty,
                            capturePolicy: value,
                          },
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.roomDefaults.watchParty.capturePolicy === value && styles.toggleChipTextActive]}>
                      {value.replace("_", " ").toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>New Communication Defaults</Text>
              <View style={styles.toggleRowWrap}>
                {(["open", "party_pass", "premium"] as const).map((value) => (
                  <TouchableOpacity
                    key={`comm-access-${value}`}
                    style={[styles.toggleChip, experienceConfig.roomDefaults.communication.contentAccessRule === value && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        roomDefaults: {
                          ...prev.roomDefaults,
                          communication: {
                            ...prev.roomDefaults.communication,
                            contentAccessRule: value,
                          },
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.roomDefaults.communication.contentAccessRule === value && styles.toggleChipTextActive]}>
                      {value.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
                {(["best_effort", "host_managed"] as const).map((value) => (
                  <TouchableOpacity
                    key={`comm-capture-${value}`}
                    style={[styles.toggleChip, experienceConfig.roomDefaults.communication.capturePolicy === value && styles.toggleChipActive]}
                    onPress={() =>
                      updateExperienceConfig((prev) => ({
                        ...prev,
                        roomDefaults: {
                          ...prev.roomDefaults,
                          communication: {
                            ...prev.roomDefaults.communication,
                            capturePolicy: value,
                          },
                        },
                      }))
                    }
                  >
                    <Text style={[styles.toggleChipText, experienceConfig.roomDefaults.communication.capturePolicy === value && styles.toggleChipTextActive]}>
                      {value.replace("_", " ").toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>

        <View style={styles.configCard}>
          <View style={styles.configHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.configKicker}>CREATOR GRANTS</Text>
              <Text style={styles.configTitle}>Backend creator monetization permissions</Text>
              <Text style={styles.configBody}>
                Load a creator user id, then decide whether that creator can use premium rooms, Party Pass rooms, premium titles, and sponsor/ad hooks. Active owner or operator role required.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.configSaveBtn,
                { backgroundColor: themePalette.accent },
                (creatorGrantSaving || platformRolesLoading || !canManagePrivilegedWrites) && styles.configSaveBtnDisabled,
              ]}
              onPress={saveCreatorGrantTarget}
              disabled={creatorGrantSaving || platformRolesLoading || !canManagePrivilegedWrites}
            >
              {creatorGrantSaving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.configSaveBtnText}>Save Grants</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.inlineInputs}>
            <TextInput
              style={[styles.input, styles.inputHalf]}
              placeholder="Creator user id"
              placeholderTextColor="#8d8d8d"
              value={creatorGrantUserId}
              onChangeText={setCreatorGrantUserId}
              autoCapitalize="none"
            />
            <TouchableOpacity
              style={[
                styles.orderBtn,
                (creatorGrantLoading || platformRolesLoading || !canManagePrivilegedWrites) && styles.configSaveBtnDisabled,
              ]}
              onPress={loadCreatorGrantTarget}
              disabled={creatorGrantLoading || platformRolesLoading || !canManagePrivilegedWrites}
            >
              {creatorGrantLoading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.orderBtnText}>Load</Text>}
            </TouchableOpacity>
          </View>

          <View style={styles.toggleRowWrap}>
            {([
              ["canUsePartyPassRooms", "Party Pass Rooms"],
              ["canUsePremiumRooms", "Premium Rooms"],
              ["canPublishPremiumTitles", "Premium Titles"],
              ["canUseSponsorPlacements", "Sponsor Placements"],
              ["canUsePlayerAds", "Player Ads"],
            ] as const).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                  style={[
                    styles.toggleChip,
                    creatorGrantForm[key] && styles.toggleChipActive,
                    !canManagePrivilegedWrites && styles.toggleChipDisabled,
                  ]}
                  onPress={() => {
                  if (!canManagePrivilegedWrites) return;
                  setCreatorGrantForm((prev) => ({ ...prev, [key]: !prev[key] }));
                }}
                disabled={!canManagePrivilegedWrites}
              >
                <Text style={[styles.toggleChipText, creatorGrantForm[key] && styles.toggleChipTextActive]}>
                  {label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.total}</Text>
            <Text style={styles.statLabel}>Total Titles</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.published}</Text>
            <Text style={styles.statLabel}>Published</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.scheduled}</Text>
            <Text style={styles.statLabel}>Scheduled</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{stats.draft}</Text>
            <Text style={styles.statLabel}>Draft</Text>
          </View>
          <View style={styles.statCardWide}>
            <Text style={styles.statNumber}>{stats.hero}</Text>
            <Text style={styles.statLabel}>Hero Picks (target: 1)</Text>
          </View>
        </View>

        {hasReleaseControl ? (
          <View style={styles.configCard}>
            <Text style={styles.configKicker}>SCHEDULED SNAPSHOT</Text>
            <Text style={styles.configTitle}>Upcoming scheduled titles</Text>
            <Text style={styles.configBody}>
              See what publishes next without switching filters. Only titles with a real future release time appear here.
            </Text>

            {loading ? (
              <View style={styles.configLoadingRow}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.configLoadingText}>Loading scheduled queue…</Text>
              </View>
            ) : upcomingScheduledSnapshot.totalUpcoming ? (
              <View style={styles.configList}>
                <View style={styles.configListRow}>
                  <View style={styles.configListCopy}>
                    <Text style={styles.configListTitle}>Next publish</Text>
                    <Text style={styles.configListBody}>
                      {upcomingScheduledSnapshot.nextItem
                        ? `${upcomingScheduledSnapshot.nextItem.title} is next in the scheduled queue.`
                        : "A real scheduled title will appear here once a future release is set."}
                    </Text>
                    <Text style={styles.configListBody}>
                      {upcomingScheduledSnapshot.nextReleaseAt
                        ? `Publishes ${formatRelease(upcomingScheduledSnapshot.nextReleaseAt)}`
                        : "No upcoming publish time is currently scheduled."}
                    </Text>
                  </View>

                  <View style={styles.badgesRow}>
                    <View style={[styles.badge, styles.badgeScheduled]}>
                      <Text style={styles.badgeText}>{`Upcoming ${upcomingScheduledSnapshot.totalUpcoming}`}</Text>
                    </View>
                  </View>
                </View>

                {upcomingScheduledSnapshot.visibleItems.map(({ item, releaseAt }, index) => (
                  <View key={toIdString(item.id)} style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>{item.title || "Untitled"}</Text>
                      <Text style={styles.configListBody}>
                        {`Queue #${index + 1} · ${(item.category ?? "Uncategorized").toString()} · Sort ${item.sort_order ?? "—"}`}
                      </Text>
                      <Text style={styles.configListBody}>{`Publishes ${formatRelease(releaseAt)}`}</Text>
                    </View>

                    <View style={styles.badgesRow}>
                      <View style={[styles.badge, styles.badgeScheduled]}>
                        <Text style={styles.badgeText}>SCHEDULED</Text>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.configListRow}>
                <View style={styles.configListCopy}>
                  <Text style={styles.configListTitle}>No real upcoming scheduled titles</Text>
                  <Text style={styles.configListBody}>
                    Future scheduled titles will appear here once they have a valid upcoming `release_at`.
                  </Text>
                </View>
              </View>
            )}
          </View>
        ) : null}

        <View style={styles.searchWrap}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by title, category, or status"
            placeholderTextColor="#9b9b9b"
            style={styles.searchInput}
          />
        </View>

        <View style={styles.filterRow}>
            {([
            { key: "all", label: "All" },
            { key: "published", label: "Published" },
            { key: "scheduled", label: "Scheduled" },
            { key: "draft", label: "Draft" },
            { key: "archived", label: "Archived" },
            { key: "featured", label: "Featured" },
            ...(hasHeroControl ? [{ key: "hero", label: "Hero" } as const] : []),
            ...(hasTrendingControl ? [{ key: "trending", label: "Trending" } as const] : []),
            ...(hasTopRowControl ? [{ key: "top-row", label: "Top Row" } as const] : []),
          ] as const).map((chip) => (
            <TouchableOpacity
              key={chip.key}
              onPress={() => setFilter(chip.key)}
              style={[styles.filterChip, filter === chip.key && styles.filterChipActive]}
            >
              <Text style={[styles.filterChipText, filter === chip.key && styles.filterChipTextActive]}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          renderSkeleton()
        ) : filteredTitles.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No titles match this view</Text>
            <Text style={styles.emptyText}>Adjust filters, or create a new title to populate this section.</Text>
          </View>
        ) : (
          <View style={styles.cardsList}>
            {filteredTitles.map((item) => {
              const status = normalizeStatus(item.status, item.is_published);

              return (
                <View key={toIdString(item.id)} style={styles.card}>
                  <View style={styles.thumbWrap}>
                    <ImageBackground source={getCompactArtSource(item)} style={styles.thumb} resizeMode="cover" />
                  </View>

                  <View style={styles.cardBody}>
                    <View style={styles.cardTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {item.title || "Untitled"}
                        </Text>
                        <Text style={styles.cardMeta} numberOfLines={1}>
                          {(item.category ?? "Uncategorized").toString()} • {item.year ?? "—"} • {item.runtime ?? "—"}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.previewBtn}
                        onPress={() => router.push({ pathname: "/player/[id]", params: { id: String(toIdString(item.id)) } })}
                      >
                        <Text style={styles.previewBtnText}>Preview</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.badgesRow}>
                      <View style={[styles.badge, getStatusTone(status)]}>
                        <Text style={styles.badgeText}>{status.toUpperCase()}</Text>
                      </View>
                      <View style={[styles.badge, item.featured ? styles.badgeOn : styles.badgeOff]}>
                        <Text style={styles.badgeText}>{item.featured ? "FEATURED" : "STANDARD"}</Text>
                      </View>
                      {hasHeroControl ? (
                        <View style={[styles.badge, item.is_hero ? styles.badgeOn : styles.badgeOff]}>
                          <Text style={styles.badgeText}>{item.is_hero ? "HERO" : "NOT HERO"}</Text>
                        </View>
                      ) : null}
                      {hasTrendingControl ? (
                        <View style={[styles.badge, item.is_trending ? styles.badgeOn : styles.badgeOff]}>
                          <Text style={styles.badgeText}>{item.is_trending ? "TRENDING" : "NORMAL"}</Text>
                        </View>
                      ) : null}
                      {hasTopRowControl ? (
                        <View style={[styles.badge, item.pin_to_top_row ? styles.badgeOn : styles.badgeOff]}>
                          <Text style={styles.badgeText}>{item.pin_to_top_row ? "TOP ROW" : "UNPINNED"}</Text>
                        </View>
                      ) : null}
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>SORT {item.sort_order ?? "—"}</Text>
                      </View>
                      {hasReleaseControl ? (
                        <View style={styles.badge}>
                          <Text style={styles.badgeText}>Release {formatRelease(item.release_at)}</Text>
                        </View>
                      ) : null}
                    </View>

	                    {canManagePrivilegedWrites ? (
	                    <View style={styles.actionsRow}>
	                      <TouchableOpacity
	                        style={styles.actionBtn}
	                        onPress={() => patchTitle(item.id, { featured: !(item.featured === true) }, "Featured updated.")}
	                      >
	                        <Text style={styles.actionText}>{item.featured ? "Unfeature" : "Feature"}</Text>
	                      </TouchableOpacity>

                      {hasTopRowControl ? (
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() =>
                            patchTitle(
                              item.id,
                              { pin_to_top_row: !(item.pin_to_top_row === true) },
                              "Top row updated.",
                            )
                          }
                        >
                          <Text style={styles.actionText}>{item.pin_to_top_row ? "Unpin" : "Pin Top Row"}</Text>
                        </TouchableOpacity>
                      ) : null}

                      {hasTrendingControl ? (
                        <TouchableOpacity
                          style={styles.actionBtn}
                          onPress={() =>
                            patchTitle(item.id, { is_trending: !(item.is_trending === true) }, "Trending updated.")
                          }
                        >
                          <Text style={styles.actionText}>{item.is_trending ? "Untrend" : "Trend"}</Text>
                        </TouchableOpacity>
                      ) : null}

                      {hasHeroControl ? (
                        <TouchableOpacity style={styles.actionBtn} onPress={() => setHeroExclusive(item)}>
                          <Text style={styles.actionText}>Set as Hero</Text>
                        </TouchableOpacity>
                      ) : null}

                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() =>
                          patchTitle(
                            item.id,
                            { sort_order: Math.max(0, (item.sort_order ?? 0) - 1) },
                            "Sort order updated.",
                          )
                        }
                      >
                        <Text style={styles.actionText}>Sort -</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() =>
                          patchTitle(item.id, { sort_order: (item.sort_order ?? 0) + 1 }, "Sort order updated.")
                        }
                      >
                        <Text style={styles.actionText}>Sort +</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={() =>
                          openEdit({
                            ...item,
                            status,
                          })
                        }
                      >
                        <Text style={styles.actionText}>Edit</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.actionBtnPrimary}
                        onPress={() =>
                          patchTitle(
                            item.id,
                            {
                              status: item.is_published ? "draft" : "published",
                              is_published: !item.is_published,
                            },
                            "Publication state updated.",
                          )
                        }
                      >
                        <Text style={styles.actionTextPrimary}>
                          {item.is_published ? "Unpublish" : "Publish"}
                        </Text>
                      </TouchableOpacity>
	                    </View>
	                    ) : (
	                      <View style={styles.configListRowSubtle}>
	                        <Text style={styles.configListBody}>
	                          Platform title programming is read-only for review-only roles.
	                        </Text>
	                      </View>
	                    )}
                  </View>
                </View>
              );
            })}
          </View>
        )}
        </>
        ) : null}
      </ScrollView>

      <Modal
        visible={roleConfirm !== null}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (!staffRoleBusy && !staffPermissionBusy) setRoleConfirm(null);
        }}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmSheet}>
            <Text style={styles.confirmKicker}>Roles & Permissions</Text>
            <Text style={styles.confirmTitle}>{roleConfirm?.title ?? "Confirm Role Action"}</Text>
            <Text style={styles.confirmBody}>
              {roleConfirm?.body ?? "Confirm this backed role action before continuing."}
            </Text>
            <View style={styles.confirmMetaBox}>
              <Text style={styles.confirmMetaText}>
                {roleConfirm?.kind === "save_permissions"
                  ? `Selected set: ${formatPermissionSummary(roleConfirm.selectedPermissions)}`
                  : `Target role: ${roleConfirm ? formatPlatformRoleDisplayLabel(roleConfirm.role) : "Unknown"}`}
              </Text>
              <Text style={styles.confirmMetaText}>Audit reason is required and server-side role protection remains enforced.</Text>
              <Text style={styles.confirmMetaText}>No room, LiveKit, Premium, Player, upload, chat, or payment behavior changes.</Text>
            </View>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setRoleConfirm(null)}
                disabled={staffRoleBusy !== null || staffPermissionBusy !== null}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  roleConfirm?.kind === "revoke_role" ? styles.dangerConfirmBtn : styles.saveBtn,
                  (staffRoleBusy !== null || staffPermissionBusy !== null) && styles.configSaveBtnDisabled,
                ]}
                onPress={() => void applyRoleConfirmation()}
                disabled={staffRoleBusy !== null || staffPermissionBusy !== null}
              >
                {staffRoleBusy !== null || staffPermissionBusy !== null ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveText}>{roleConfirm?.kind === "save_permissions" ? "Save Permissions" : "Remove Role"}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={contentConfirm !== null}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (!contentConfirmBusy) {
            setContentConfirm(null);
            setContentConfirmReason("");
          }
        }}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmSheet}>
            <Text style={styles.confirmKicker}>Content Programming</Text>
            <Text style={styles.confirmTitle}>{contentConfirm?.title ?? "Confirm Content Action"}</Text>
            <Text style={styles.confirmBody}>
              {contentConfirm?.body ?? "Confirm this backed content programming change before continuing."}
            </Text>
            <View style={styles.confirmMetaBox}>
              <Text style={styles.confirmMetaText}>Reason is required for audit proof.</Text>
              <Text style={styles.confirmMetaText}>No media files, room behavior, LiveKit lifecycle, or token issuance are changed by this action.</Text>
            </View>
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Audit reason"
              placeholderTextColor="#8d8d8d"
              multiline
              value={contentConfirmReason}
              onChangeText={setContentConfirmReason}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setContentConfirm(null);
                  setContentConfirmReason("");
                }}
                disabled={contentConfirmBusy}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  contentConfirm?.tone === "danger" ? styles.dangerConfirmBtn : styles.saveBtn,
                  (!contentConfirmReason.trim() || contentConfirmBusy) && styles.configSaveBtnDisabled,
                ]}
                onPress={() => {
                  const pending = contentConfirm;
                  const reason = contentConfirmReason.trim();
                  if (!pending || !reason) return;
                  setContentConfirm(null);
                  setContentConfirmReason("");
                  if (pending.kind === "save_config") void runExperienceConfigSave(reason);
                  if (pending.kind === "title_action") void runTitleProgrammingAction(pending, reason);
                  if (pending.kind === "save_editor") void runEditorSave(reason);
                  if (pending.kind === "creator_grants") void runCreatorGrantSave(reason);
                }}
                disabled={!contentConfirmReason.trim() || contentConfirmBusy}
              >
                {contentConfirmBusy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveText}>{contentConfirm?.actionLabel ?? "Confirm"}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={ownerSecurityConfirmVisible}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (!ownerSecurityActionBusy) {
            setOwnerSecurityConfirmVisible(false);
            setOwnerSecurityConfirmText("");
          }
        }}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmSheet}>
            <Text style={styles.confirmKicker}>Owner Security</Text>
            <Text style={styles.confirmTitle}>Revoke all temporary grants?</Text>
            <Text style={styles.confirmBody}>
              This revokes every active temporary/proof grant returned by the backed staff-permission table and writes security audit events.
            </Text>
            <View style={styles.confirmMetaBox}>
              <Text style={styles.confirmMetaText}>Type REVOKE GRANTS to continue.</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="REVOKE GRANTS"
              placeholderTextColor="#8d8d8d"
              autoCapitalize="characters"
              value={ownerSecurityConfirmText}
              onChangeText={setOwnerSecurityConfirmText}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => {
                  setOwnerSecurityConfirmVisible(false);
                  setOwnerSecurityConfirmText("");
                }}
                disabled={ownerSecurityActionBusy === "bulk-revoke-grants"}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.dangerConfirmBtn, (ownerSecurityConfirmText.trim() !== "REVOKE GRANTS" || ownerSecurityActionBusy === "bulk-revoke-grants") && styles.configSaveBtnDisabled]}
                onPress={() => void runOwnerSecurityBulkRevoke()}
                disabled={ownerSecurityConfirmText.trim() !== "REVOKE GRANTS" || ownerSecurityActionBusy === "bulk-revoke-grants"}
              >
                {ownerSecurityActionBusy === "bulk-revoke-grants" ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Revoke Grants</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={dmcaDetailVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDmcaDetailVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.configKicker}>DMCA CASE DETAIL</Text>
                <Text style={styles.modalTitle}>
                  {selectedDmcaCase?.caseNumber || selectedDmcaCase?.id || "Case detail"}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDmcaDetailVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </View>

            {selectedDmcaDetail ? (
              <ScrollView contentContainerStyle={{ paddingBottom: 26 }}>
                <View style={styles.badgesRow}>
                  <View style={[styles.badge, styles.badgeScheduled]}>
                    <Text style={styles.badgeText}>{formatModerationToken(selectedDmcaDetail.case.status)}</Text>
                  </View>
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{formatModerationToken(selectedDmcaDetail.case.contentType)}</Text>
                  </View>
                  <View style={[styles.badge, selectedDmcaDetail.case.activeStrikeCount > 0 ? styles.badgeDraft : styles.badgeOff]}>
                    <Text style={styles.badgeText}>{`${selectedDmcaDetail.case.activeStrikeCount} active strikes`}</Text>
                  </View>
                  {selectedDmcaDetail.case.isTestCase && __DEV__ ? (
                    <View style={[styles.badge, styles.badgeDraft]}>
                      <Text style={styles.badgeText}>DEV/TEST</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.configList}>
                  <View style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>Claimant / Reporter</Text>
                      <Text style={styles.configListBody}>{`Name: ${formatAuditDisplayText(selectedDmcaDetail.case.reporterName)}`}</Text>
                      <Text style={styles.configListBody}>{`Email: ${formatAuditDisplayText(selectedDmcaDetail.case.reporterEmail)}`}</Text>
                      <Text style={styles.configListBody}>{`Company: ${formatAuditDisplayText(selectedDmcaDetail.case.reporterCompany)}`}</Text>
                      <Text style={styles.configListBody}>{`Phone: ${formatAuditDisplayText(selectedDmcaDetail.case.reporterPhone)}`}</Text>
                      <Text style={styles.configListBody}>{`Address: ${formatAuditDisplayText(selectedDmcaDetail.case.reporterAddress)}`}</Text>
                      <Text style={styles.configListBody}>{`Copyright owner: ${formatAuditDisplayText(selectedDmcaDetail.case.copyrightOwnerName)}`}</Text>
                      <Text style={styles.configListBody}>{`Authorized agent: ${formatAuditDisplayText(selectedDmcaDetail.case.authorizedAgentName)}`}</Text>
                      <Text style={styles.configListBody}>{`Reporter owner statement: ${selectedDmcaDetail.case.reporterIsOwner ? "Owner or authorized party" : "Reporter marked not owner"}`}</Text>
                    </View>
                  </View>

                  <View style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>Notice Details</Text>
                      <Text style={styles.configListBody}>{`Source: ${formatModerationToken(selectedDmcaDetail.case.source)} · Received ${formatModerationTimestamp(selectedDmcaDetail.case.receivedAt)}`}</Text>
                      <Text style={styles.reportBody}>{selectedDmcaDetail.case.copyrightedWorkDescription || "No copyrighted work description recorded."}</Text>
                      <Text style={styles.configListBody}>{`Work URLs: ${selectedDmcaDetail.case.copyrightedWorkUrls.length ? selectedDmcaDetail.case.copyrightedWorkUrls.map(formatAuditDisplayText).join(", ") : "None recorded"}`}</Text>
                      <Text style={styles.reportBody}>{selectedDmcaDetail.case.infringingMaterialDescription || "No allegedly infringing material description recorded."}</Text>
                      {dmcaCompleteness?.complete ? (
                        <Text style={styles.configListBody}>Notice completeness: complete</Text>
                      ) : (
                        <Text style={styles.configListBody}>
                          {`Notice completeness: missing ${dmcaCompleteness?.missing.join(", ") || "unknown fields"}`}
                        </Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>Content / Uploader</Text>
                      <Text style={styles.configListBody}>{`Content type: ${formatModerationToken(selectedDmcaDetail.case.contentType)}`}</Text>
                      <Text style={styles.configListBody}>{`Content id: ${formatCompactIdentifier(selectedDmcaDetail.case.contentId)}`}</Text>
                      <Text style={styles.configListBody}>{`Content URL/path: ${formatAuditDisplayText(selectedDmcaDetail.case.contentUrl)}`}</Text>
                      <Text style={styles.configListBody}>{`Uploader id: ${formatCompactIdentifier(selectedDmcaDetail.case.uploaderUserId)}`}</Text>
                      <Text style={styles.configListBody}>{`Uploader channel: ${formatCompactIdentifier(selectedDmcaDetail.case.uploaderChannelId)}`}</Text>
                      {selectedDmcaDetail.case.contentUrl && /^https?:\/\//i.test(selectedDmcaDetail.case.contentUrl) ? (
                        <View style={styles.actionsRow}>
                          <TouchableOpacity
                            style={styles.actionBtn}
                            onPress={() => {
                              if (selectedDmcaDetail.case.contentUrl) void Linking.openURL(selectedDmcaDetail.case.contentUrl);
                            }}
                          >
                            <Text style={styles.actionText}>Open Content URL</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>Public Availability State</Text>
                      {selectedDmcaDetail.contentState ? (
                        <>
                          <Text style={styles.configListBody}>{`State: ${formatModerationToken(selectedDmcaDetail.contentState.publicAvailability)}`}</Text>
                          <Text style={styles.configListBody}>{`Backend: ${formatAuditDisplayText(selectedDmcaDetail.contentState.backend)}`}</Text>
                          <Text style={styles.configListBody}>{`Visibility: ${formatAuditDisplayText(selectedDmcaDetail.contentState.visibility)}`}</Text>
                          <Text style={styles.configListBody}>{`Moderation: ${formatAuditDisplayText(selectedDmcaDetail.contentState.moderationStatus)}`}</Text>
                          {selectedDmcaDetail.contentState.missingBackendPiece ? (
                            <Text style={styles.configListBody}>{`Missing backend piece: ${selectedDmcaDetail.contentState.missingBackendPiece}`}</Text>
                          ) : null}
                        </>
                      ) : (
                        <Text style={styles.configListBody}>Availability state not found for this content id/type.</Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>Evidence / Attachments / Legal Hold</Text>
                      <Text style={styles.configListBody}>
                        {selectedDmcaDetail.case.status === "preserved_evidence"
                          || selectedDmcaDetail.contentActions.some((action) => action.action === "preserved_evidence")
                          ? "Evidence preservation has been recorded on this DMCA case."
                          : "No DMCA evidence preservation action recorded yet."}
                      </Text>
                      {selectedDmcaDetail.attachments.length ? (
                        <View style={styles.configList}>
                          {selectedDmcaDetail.attachments.map((attachment) => (
                            <View key={attachment.id} style={styles.configListRowSubtle}>
                              <Text style={styles.configListTitle}>{formatAuditDisplayText(attachment.originalFilename)}</Text>
                              <Text style={styles.configListBody}>
                                {`${formatModerationToken(attachment.source)} · ${formatAuditDisplayText(attachment.mimeType)} · ${(attachment.sizeBytes / 1024).toFixed(1)} KB`}
                              </Text>
                              <Text style={styles.configListBody}>
                                {`Scan: ${formatModerationToken(attachment.scanStatus)} · Retention: ${formatModerationToken(attachment.retentionStatus)}`}
                              </Text>
                              <Text style={styles.configListBody}>
                                {attachment.scanNotes || "No scan notes recorded."}
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.configListBody}>No private evidence attachments are recorded on this case yet.</Text>
                      )}
                      <Text style={styles.configListBody}>Legal hold state is recorded through case timeline/evidence actions and the Legal Evidence tooling where applicable.</Text>
                    </View>
                  </View>

                  <View style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>Owner / Operator Notes</Text>
                      <TextInput
                        style={[styles.input, styles.multiline]}
                        placeholder="Internal case notes"
                        placeholderTextColor="#8d8d8d"
                        multiline
                        value={dmcaAdminNotes}
                        onChangeText={setDmcaAdminNotes}
                      />
                      <TextInput
                        style={[styles.input, styles.multiline]}
                        placeholder="Action reason/source required for content actions, strikes, and status changes"
                        placeholderTextColor="#8d8d8d"
                        multiline
                        value={dmcaActionReason}
                        onChangeText={setDmcaActionReason}
                      />
                    </View>
                  </View>

                  <View style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>Case Status Actions</Text>
                      <View style={styles.toggleRowWrap}>
                        {dmcaStatusActionOptions.map((status) => (
                          <TouchableOpacity
                            key={status}
                            style={[styles.toggleChip, dmcaActionBusy !== null && styles.toggleChipDisabled]}
                            disabled={dmcaActionBusy !== null}
                            onPress={() => void runDmcaStatusUpdate(status)}
                          >
                            <Text style={styles.toggleChipText}>{formatModerationToken(status)}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  </View>

                  <View style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>Record Content Action</Text>
                      <Text style={styles.configListBody}>Supported actions never silently delete content. Disable/hidden/restore update backed moderation state where the backend route exists.</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Content id"
                        placeholderTextColor="#8d8d8d"
                        value={dmcaContentId}
                        onChangeText={setDmcaContentId}
                        autoCapitalize="none"
                      />
                      <View style={styles.toggleRowWrap}>
                        {DMCA_CONTENT_TYPES.map((type) => (
                          <TouchableOpacity
                            key={type}
                            style={[styles.toggleChip, dmcaContentType === type && styles.toggleChipActive]}
                            onPress={() => setDmcaContentType(type)}
                          >
                            <Text style={[styles.toggleChipText, dmcaContentType === type && styles.toggleChipTextActive]}>
                              {formatModerationToken(type)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <View style={styles.toggleRowWrap}>
                        {DMCA_CONTENT_ACTIONS.map((action) => (
                          <TouchableOpacity
                            key={action}
                            style={[styles.toggleChip, dmcaContentAction === action && styles.toggleChipActive]}
                            onPress={() => setDmcaContentAction(action)}
                          >
                            <Text style={[styles.toggleChipText, dmcaContentAction === action && styles.toggleChipTextActive]}>
                              {formatModerationToken(action)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {dmcaContentActionDisabledReason ? (
                        <Text style={styles.configListBody}>{dmcaContentActionDisabledReason}</Text>
                      ) : null}
                      <View style={styles.actionsRow}>
                        <TouchableOpacity
                          style={[styles.actionBtnPrimary, (dmcaActionBusy !== null || !!dmcaContentActionDisabledReason) && styles.configSaveBtnDisabled]}
                          disabled={dmcaActionBusy !== null || !!dmcaContentActionDisabledReason}
                          onPress={() => void runDmcaContentAction()}
                        >
                          <Text style={styles.actionTextPrimary}>
                            {dmcaActionBusy?.startsWith("content-") ? "Recording" : "Record Content Action"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  <View style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>Copyright Strikes</Text>
                      <TextInput
                        style={styles.input}
                        placeholder="Target uploader/user id"
                        placeholderTextColor="#8d8d8d"
                        value={dmcaStrikeUserId}
                        onChangeText={setDmcaStrikeUserId}
                        autoCapitalize="none"
                      />
                      <View style={styles.toggleRowWrap}>
                        {(["standard", "severe"] as const).map((severity) => (
                          <TouchableOpacity
                            key={severity}
                            style={[styles.toggleChip, dmcaStrikeSeverity === severity && styles.toggleChipActive]}
                            onPress={() => setDmcaStrikeSeverity(severity)}
                          >
                            <Text style={[styles.toggleChipText, dmcaStrikeSeverity === severity && styles.toggleChipTextActive]}>
                              {formatModerationToken(severity)}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      {dmcaStrikeDisabledReason ? (
                        <Text style={styles.configListBody}>{dmcaStrikeDisabledReason}</Text>
                      ) : null}
                      <View style={styles.actionsRow}>
                        <TouchableOpacity
                          style={[styles.actionBtnPrimary, (dmcaActionBusy !== null || !!dmcaStrikeDisabledReason) && styles.configSaveBtnDisabled]}
                          disabled={dmcaActionBusy !== null || !!dmcaStrikeDisabledReason}
                          onPress={() => void runDmcaAddStrike()}
                        >
                          <Text style={styles.actionTextPrimary}>{dmcaActionBusy === "strike-add" ? "Adding" : "Add Strike"}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <View style={styles.configList}>
                      {selectedDmcaDetail.strikes.length ? selectedDmcaDetail.strikes.map((strike) => {
                        const strikeUpdateLocked = dmcaActionBusy !== null || !dmcaActionReason.trim();
                        return (
                          <View key={strike.id} style={styles.configListRowSubtle}>
                            <Text style={styles.configListTitle}>{`${formatModerationToken(strike.severity)} strike · ${formatModerationToken(strike.strikeStatus)}`}</Text>
                            <Text style={styles.configListBody}>{`User ${formatCompactIdentifier(strike.userId)} · Content ${formatCompactIdentifier(strike.contentId)}`}</Text>
                            <Text style={styles.configListBody}>{`Created ${formatModerationTimestamp(strike.createdAt)} · Reason ${formatAuditDisplayText(strike.reason)}`}</Text>
                            {!dmcaActionReason.trim() && strike.strikeStatus !== "removed" && strike.strikeStatus !== "resolved" ? (
                              <Text style={styles.configListBody}>Strike updates require Action reason/source.</Text>
                            ) : null}
                            <View style={styles.actionsRow}>
                              {strike.strikeStatus === "active" ? (
                                <>
                                  <TouchableOpacity
                                    style={[styles.actionBtn, strikeUpdateLocked && styles.configSaveBtnDisabled]}
                                    disabled={strikeUpdateLocked}
                                    onPress={() => void runDmcaUpdateStrike(strike.id, "disputed")}
                                  >
                                    <Text style={styles.actionText}>Dispute Strike</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    style={[styles.actionBtnDanger, strikeUpdateLocked && styles.configSaveBtnDisabled]}
                                    disabled={strikeUpdateLocked}
                                    onPress={() => void runDmcaUpdateStrike(strike.id, "removed")}
                                  >
                                    <Text style={styles.actionTextDanger}>Remove Strike</Text>
                                  </TouchableOpacity>
                                </>
                              ) : strike.strikeStatus === "disputed" ? (
                                <TouchableOpacity
                                  style={[styles.actionBtn, strikeUpdateLocked && styles.configSaveBtnDisabled]}
                                  disabled={strikeUpdateLocked}
                                  onPress={() => void runDmcaUpdateStrike(strike.id, "resolved")}
                                >
                                  <Text style={styles.actionText}>Resolve Strike</Text>
                                </TouchableOpacity>
                              ) : (
                                <Text style={styles.configListBody}>No strike action available for this status.</Text>
                              )}
                            </View>
                          </View>
                        );
                      }) : (
                        <Text style={styles.configListBody}>No strike records on this case yet.</Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>Counter-Notice Recording</Text>
                      <Text style={styles.configListBody}>Uploader-facing counter-notice self-service is live for authenticated uploaders whose user id matches this case. Admin manual recording remains supported.</Text>
                      <TextInput style={styles.input} placeholder="Submitter name" placeholderTextColor="#8d8d8d" value={counterSubmitterName} onChangeText={setCounterSubmitterName} />
                      <TextInput style={styles.input} placeholder="Submitter email" placeholderTextColor="#8d8d8d" value={counterSubmitterEmail} onChangeText={setCounterSubmitterEmail} keyboardType="email-address" autoCapitalize="none" />
                      <TextInput style={styles.input} placeholder="Phone optional" placeholderTextColor="#8d8d8d" value={counterSubmitterPhone} onChangeText={setCounterSubmitterPhone} />
                      <TextInput style={[styles.input, styles.multiline]} placeholder="Address if legally required" placeholderTextColor="#8d8d8d" value={counterSubmitterAddress} onChangeText={setCounterSubmitterAddress} multiline />
                      <TextInput style={[styles.input, styles.multiline]} placeholder="Statement / removed material description" placeholderTextColor="#8d8d8d" value={counterRemovedDescription} onChangeText={setCounterRemovedDescription} multiline />
                      <TextInput style={styles.input} placeholder="Content id, URL, or removed location" placeholderTextColor="#8d8d8d" value={counterRemovedLocation} onChangeText={setCounterRemovedLocation} autoCapitalize="none" />
                      <TextInput style={styles.input} placeholder="Electronic signature" placeholderTextColor="#8d8d8d" value={counterSignature} onChangeText={setCounterSignature} />
                      <View style={styles.toggleRowWrap}>
                        <TouchableOpacity style={[styles.toggleChip, counterGoodFaith && styles.toggleChipActive]} onPress={() => setCounterGoodFaith((value) => !value)}>
                          <Text style={[styles.toggleChipText, counterGoodFaith && styles.toggleChipTextActive]}>Good-faith mistake statement</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.toggleChip, counterJurisdiction && styles.toggleChipActive]} onPress={() => setCounterJurisdiction((value) => !value)}>
                          <Text style={[styles.toggleChipText, counterJurisdiction && styles.toggleChipTextActive]}>Jurisdiction consent</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.toggleChip, counterService && styles.toggleChipActive]} onPress={() => setCounterService((value) => !value)}>
                          <Text style={[styles.toggleChipText, counterService && styles.toggleChipTextActive]}>Service acceptance</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.toggleChip, counterForwardedNow && styles.toggleChipActive]} onPress={() => setCounterForwardedNow((value) => !value)}>
                          <Text style={[styles.toggleChipText, counterForwardedNow && styles.toggleChipTextActive]}>Mark forwarded now</Text>
                        </TouchableOpacity>
                      </View>
                      {dmcaCounterDisabledReason ? (
                        <Text style={styles.configListBody}>{dmcaCounterDisabledReason}</Text>
                      ) : null}
                      <View style={styles.actionsRow}>
                        <TouchableOpacity
                          style={[styles.actionBtnPrimary, (dmcaActionBusy !== null || !!dmcaCounterDisabledReason) && styles.configSaveBtnDisabled]}
                          disabled={dmcaActionBusy !== null || !!dmcaCounterDisabledReason}
                          onPress={() => void runDmcaRecordCounterNotice()}
                        >
                          <Text style={styles.actionTextPrimary}>{dmcaActionBusy === "counter-record" ? "Recording" : "Record Counter-Notice"}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  <View style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>Counter-Notice History</Text>
                      {selectedDmcaDetail.counterNotices.length ? selectedDmcaDetail.counterNotices.map((notice) => {
                        const forwarded = !!notice.forwardedToClaimantAt;
                        const courtAction = !!notice.courtActionNoticeReceivedAt;
                        const eligible = notice.status === "restore_eligible" || selectedDmcaDetail.case.status === "eligible_for_restore";
                        return (
                          <View key={notice.id} style={styles.configListRowSubtle}>
                            <Text style={styles.configListTitle}>{`${formatModerationToken(notice.status)} · ${formatAuditDisplayText(notice.submitterName)}`}</Text>
                            <Text style={styles.configListBody}>{`Email ${formatAuditDisplayText(notice.submitterEmail)} · Received ${formatModerationTimestamp(notice.receivedAt)}`}</Text>
                            <Text style={styles.configListBody}>{`Forwarded ${notice.forwardedToClaimantAt ? formatModerationTimestamp(notice.forwardedToClaimantAt) : "not yet"} · Restore window ${notice.restoreNotBeforeAt ? formatModerationTimestamp(notice.restoreNotBeforeAt) : "not started"} to ${notice.restoreNotAfterAt ? formatModerationTimestamp(notice.restoreNotAfterAt) : "not started"}`}</Text>
                            <View style={styles.actionsRow}>
                              {!forwarded ? (
                                <TouchableOpacity
                                  style={[styles.actionBtn, dmcaActionBusy !== null && styles.configSaveBtnDisabled]}
                                  disabled={dmcaActionBusy !== null}
                                  onPress={() => void runDmcaForwardCounterNotice(notice.id)}
                                >
                                  <Text style={styles.actionText}>Mark Forwarded</Text>
                                </TouchableOpacity>
                              ) : null}
                              {forwarded && !courtAction && !eligible ? (
                                <TouchableOpacity
                                  style={[styles.actionBtn, dmcaActionBusy !== null && styles.configSaveBtnDisabled]}
                                  disabled={dmcaActionBusy !== null}
                                  onPress={() => void runDmcaMarkRestoreEligible(notice.id)}
                                >
                                  <Text style={styles.actionText}>Mark Eligible For Restore</Text>
                                </TouchableOpacity>
                              ) : !forwarded ? (
                                <Text style={styles.configListBody}>Restore eligibility disabled: forward the counter-notice first.</Text>
                              ) : null}
                              {!courtAction && !eligible ? (
                                <TouchableOpacity
                                  style={[styles.actionBtnDanger, dmcaActionBusy !== null && styles.configSaveBtnDisabled]}
                                  disabled={dmcaActionBusy !== null}
                                  onPress={() => void runDmcaRecordCourtAction(notice.id)}
                                >
                                  <Text style={styles.actionTextDanger}>Record Court Action</Text>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          </View>
                        );
                      }) : (
                        <Text style={styles.configListBody}>No counter-notice records on this case yet.</Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>Timeline / History</Text>
                      {selectedDmcaDetail.auditLog.length ? selectedDmcaDetail.auditLog.map((entry) => (
                        <View key={entry.id} style={styles.configListRowSubtle}>
                          <Text style={styles.configListTitle}>{formatModerationToken(entry.eventType)}</Text>
                          <Text style={styles.configListBody}>{`${formatModerationTimestamp(entry.createdAt)} · ${formatModerationToken(entry.actorRole)}`}</Text>
                          {entry.reason ? <Text style={styles.configListBody}>{formatAuditDisplayText(entry.reason)}</Text> : null}
                        </View>
                      )) : (
                        <Text style={styles.configListBody}>No case timeline rows returned.</Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>Content Actions</Text>
                      {selectedDmcaDetail.contentActions.length ? selectedDmcaDetail.contentActions.map((action) => (
                        <View key={action.id} style={styles.configListRowSubtle}>
                          <Text style={styles.configListTitle}>{formatModerationToken(action.action)}</Text>
                          <Text style={styles.configListBody}>{`${formatModerationTimestamp(action.createdAt)} · ${formatModerationToken(action.contentType)} ${formatCompactIdentifier(action.contentId)}`}</Text>
                          <Text style={styles.configListBody}>{formatAuditDisplayText(action.reason)}</Text>
                        </View>
                      )) : (
                        <Text style={styles.configListBody}>No content action records on this case yet.</Text>
                      )}
                    </View>
                  </View>

                  <View style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>Notice Templates</Text>
                      <Text style={styles.configListBody}>Template inventory is visible for workflow context. Sending automation is not configured in this mobile client.</Text>
                      <View style={styles.toggleRowWrap}>
                        {DMCA_NOTIFICATION_TEMPLATES.map((template) => (
                          <View key={template.key} style={styles.badge}>
                            <Text style={styles.badgeText}>{template.label}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </View>
                </View>
              </ScrollView>
            ) : (
              <View style={styles.configLoadingRow}>
                <ActivityIndicator color="#fff" />
                <Text style={styles.configLoadingText}>Loading DMCA case detail...</Text>
              </View>
            )}
          </View>
        </View>
      </Modal>

      <Modal
        visible={dmcaIntakeVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setDmcaIntakeVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.configKicker}>FORMAL NOTICE INTAKE</Text>
                <Text style={styles.modalTitle}>New copyright notice</Text>
              </View>
              <TouchableOpacity
                onPress={() => setDmcaIntakeVisible(false)}
                style={styles.closeBtn}
                disabled={dmcaIntakeBusy}
              >
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 26 }}>
              <View style={[styles.notice, styles.noticeWarn]}>
                <Text style={styles.noticeText}>Manual email intake enabled. Automated email ingestion not configured.</Text>
              </View>

              <Text style={styles.sectionLabel}>Submitted Source</Text>
              <View style={styles.toggleRowWrap}>
                {dmcaNoticeSourceOptions.map((source) => (
                  <TouchableOpacity
                    key={source.key}
                    style={[styles.toggleChip, dmcaIntakeForm.source === source.key && styles.toggleChipActive]}
                    onPress={() => updateDmcaIntakeForm("source", source.key)}
                  >
                    <Text style={[styles.toggleChipText, dmcaIntakeForm.source === source.key && styles.toggleChipTextActive]}>
                      {source.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionLabel}>Claimant / Reporter</Text>
              <TextInput style={styles.input} placeholder="Claimant name" placeholderTextColor="#8d8d8d" value={dmcaIntakeForm.reporterName} onChangeText={(text) => updateDmcaIntakeForm("reporterName", text)} />
              <TextInput style={styles.input} placeholder="Claimant email" placeholderTextColor="#8d8d8d" keyboardType="email-address" autoCapitalize="none" value={dmcaIntakeForm.reporterEmail} onChangeText={(text) => updateDmcaIntakeForm("reporterEmail", text)} />
              <TextInput style={styles.input} placeholder="Company / organization if any" placeholderTextColor="#8d8d8d" value={dmcaIntakeForm.reporterCompany} onChangeText={(text) => updateDmcaIntakeForm("reporterCompany", text)} />
              <TextInput style={styles.input} placeholder="Phone optional" placeholderTextColor="#8d8d8d" value={dmcaIntakeForm.reporterPhone} onChangeText={(text) => updateDmcaIntakeForm("reporterPhone", text)} />
              <TextInput style={[styles.input, styles.multiline]} placeholder="Address if supplied" placeholderTextColor="#8d8d8d" multiline value={dmcaIntakeForm.reporterAddress} onChangeText={(text) => updateDmcaIntakeForm("reporterAddress", text)} />
              <View style={styles.toggleRowWrap}>
                <TouchableOpacity
                  style={[styles.toggleChip, dmcaIntakeForm.reporterIsOwner && styles.toggleChipActive]}
                  onPress={() => updateDmcaIntakeForm("reporterIsOwner", !dmcaIntakeForm.reporterIsOwner)}
                >
                  <Text style={[styles.toggleChipText, dmcaIntakeForm.reporterIsOwner && styles.toggleChipTextActive]}>
                    Reporter is owner/agent
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput style={styles.input} placeholder="Authorized agent name if different" placeholderTextColor="#8d8d8d" value={dmcaIntakeForm.authorizedAgentName} onChangeText={(text) => updateDmcaIntakeForm("authorizedAgentName", text)} />
              <TextInput style={styles.input} placeholder="Copyright owner name" placeholderTextColor="#8d8d8d" value={dmcaIntakeForm.copyrightOwnerName} onChangeText={(text) => updateDmcaIntakeForm("copyrightOwnerName", text)} />

              <Text style={styles.sectionLabel}>Content</Text>
              <View style={styles.toggleRowWrap}>
                {DMCA_CONTENT_TYPES.map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[styles.toggleChip, dmcaIntakeForm.contentType === type && styles.toggleChipActive]}
                    onPress={() => updateDmcaIntakeForm("contentType", type)}
                  >
                    <Text style={[styles.toggleChipText, dmcaIntakeForm.contentType === type && styles.toggleChipTextActive]}>
                      {formatModerationToken(type)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TextInput style={styles.input} placeholder="Content URL/path" placeholderTextColor="#8d8d8d" autoCapitalize="none" value={dmcaIntakeForm.contentUrl} onChangeText={(text) => updateDmcaIntakeForm("contentUrl", text)} />
              <TextInput style={styles.input} placeholder="Content id" placeholderTextColor="#8d8d8d" autoCapitalize="none" value={dmcaIntakeForm.contentId} onChangeText={(text) => updateDmcaIntakeForm("contentId", text)} />
              <TextInput style={[styles.input, styles.multiline]} placeholder="Description of copyrighted work" placeholderTextColor="#8d8d8d" multiline value={dmcaIntakeForm.copyrightedWorkDescription} onChangeText={(text) => updateDmcaIntakeForm("copyrightedWorkDescription", text)} />
              <TextInput style={[styles.input, styles.multiline]} placeholder="Copyrighted work URLs, one per line" placeholderTextColor="#8d8d8d" multiline autoCapitalize="none" value={dmcaIntakeForm.copyrightedWorkUrls} onChangeText={(text) => updateDmcaIntakeForm("copyrightedWorkUrls", text)} />
              <TextInput style={[styles.input, styles.multiline]} placeholder="Description of allegedly infringing material" placeholderTextColor="#8d8d8d" multiline value={dmcaIntakeForm.infringingMaterialDescription} onChangeText={(text) => updateDmcaIntakeForm("infringingMaterialDescription", text)} />

              <View style={styles.configListRow}>
                <View style={styles.configListCopy}>
                  <Text style={styles.configListTitle}>Attachments</Text>
                  <Text style={styles.configListBody}>Public notice and uploader counter-notice evidence files upload to the private dmca-evidence bucket and appear on the case detail after submission. Manual admin file upload still uses the legal evidence workflow.</Text>
                </View>
              </View>

              <Text style={styles.sectionLabel}>Statements</Text>
              <View style={styles.toggleRowWrap}>
                <TouchableOpacity
                  style={[styles.toggleChip, dmcaIntakeForm.goodFaithStatement && styles.toggleChipActive]}
                  onPress={() => updateDmcaIntakeForm("goodFaithStatement", !dmcaIntakeForm.goodFaithStatement)}
                >
                  <Text style={[styles.toggleChipText, dmcaIntakeForm.goodFaithStatement && styles.toggleChipTextActive]}>
                    Good-faith statement
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.toggleChip, dmcaIntakeForm.authorityStatement && styles.toggleChipActive]}
                  onPress={() => updateDmcaIntakeForm("authorityStatement", !dmcaIntakeForm.authorityStatement)}
                >
                  <Text style={[styles.toggleChipText, dmcaIntakeForm.authorityStatement && styles.toggleChipTextActive]}>
                    Authority / penalty statement
                  </Text>
                </TouchableOpacity>
              </View>
              <TextInput style={styles.input} placeholder="Electronic signature" placeholderTextColor="#8d8d8d" value={dmcaIntakeForm.electronicSignature} onChangeText={(text) => updateDmcaIntakeForm("electronicSignature", text)} />

              {dmcaIntakeDisabledReason ? (
                <Text style={styles.configListBody}>{dmcaIntakeDisabledReason}</Text>
              ) : null}

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={() => setDmcaIntakeVisible(false)}
                  disabled={dmcaIntakeBusy}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, (dmcaIntakeBusy || !!dmcaIntakeDisabledReason) && styles.configSaveBtnDisabled]}
                  onPress={() => void submitAdminDmcaIntake()}
                  disabled={dmcaIntakeBusy || !!dmcaIntakeDisabledReason}
                >
                  {dmcaIntakeBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Record Notice</Text>}
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal
        visible={safetyReportDetailVisible && selectedSafetyReport !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSafetyReportDetailVisible(false)}
      >
        <View style={styles.reportDetailBackdrop}>
          <View style={styles.reportDetailSheet}>
            {selectedSafetyReport ? (
              <ScrollView contentContainerStyle={styles.reportDetailContent}>
                <View style={styles.reportDetailHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.confirmKicker}>Review Report</Text>
                    <Text style={styles.confirmTitle}>{buildReportTargetLine(selectedSafetyReport)}</Text>
                    <Text style={styles.confirmBody}>
                      {`Report ${formatCompactIdentifier(selectedSafetyReport.id)} · ${formatReportSourceSurface(selectedSafetyReport.sourceSurface)} · ${formatModerationTimestamp(selectedSafetyReport.createdAt)}`}
                    </Text>
                  </View>
                  <TouchableOpacity style={styles.closeBtn} onPress={() => setSafetyReportDetailVisible(false)}>
                    <Text style={styles.closeText}>Close</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.badgesRow}>
                  <OwnerStatusPill label={formatReportRiskLabel(selectedSafetyReport)} tone={getReportSeverityTone(selectedSafetyReport.severity)} />
                  <OwnerStatusPill label={formatReportReviewState(selectedSafetyReport.status)} tone={getReportReviewTone(selectedSafetyReport.status)} />
                  <OwnerStatusPill label={formatReportResolution(selectedSafetyReport)} tone={selectedSafetyReport.resolutionType ? "info" : "locked"} />
                  <OwnerStatusPill label={formatReportSourceSurface(selectedSafetyReport.sourceSurface)} tone={selectedSafetyReport.sourceSurface === "unknown" ? "locked" : "info"} />
                </View>

                <View style={styles.reportDetailPanel}>
                  <Text style={styles.ownerSectionTitle}>Target Context</Text>
                  <OwnerDetailGrid
                    rows={[
                      { label: "Report Id", value: String(selectedSafetyReport.id) },
                      { label: "Target Type", value: formatModerationToken(selectedSafetyReport.targetType) },
                      { label: "Target Id", value: formatCompactIdentifier(selectedSafetyReport.targetId) },
                      { label: "Reporter", value: formatModerationToken(selectedSafetyReport.reporterRole) },
                      { label: "Category", value: formatModerationToken(selectedSafetyReport.category) },
                      { label: "Severity", value: formatModerationToken(selectedSafetyReport.severity) },
                      { label: "Status", value: formatModerationToken(selectedSafetyReport.status) },
                      { label: "Resolution", value: formatReportResolution(selectedSafetyReport) },
                      { label: "Source Route", value: formatAuditDisplayText(selectedSafetyReport.sourceRoute) || "not supplied" },
                      { label: "Current Moderation", value: isReportVisibilityTargetSupported(selectedSafetyReport.targetType) ? "backed public visibility moderation" : "status-only target in Reports" },
                    ]}
                  />
                  {selectedSafetyReport.note ? (
                    <Text style={styles.reportBody}>{formatAuditDisplayText(selectedSafetyReport.note)}</Text>
                  ) : (
                    <Text style={styles.reportMeta}>No reporter note was supplied with this report.</Text>
                  )}
                </View>

                <View style={styles.reportDetailPanel}>
                  <View style={styles.ownerSectionHeaderRow}>
                    <View>
                      <Text style={styles.ownerSectionTitle}>Safety Action</Text>
                      <Text style={styles.ownerPanelMeta}>Target is auto-filled from the selected report when backed.</Text>
                    </View>
                    <OwnerStatusPill
                      label={selectedReportTargetActionDisabledReason ? "Disabled" : "Backed"}
                      tone={selectedReportTargetActionDisabledReason ? "locked" : "success"}
                    />
                  </View>
                  {selectedReportTargetActionDisabledReason ? (
                    <OwnerDisabledReason reason={selectedReportTargetActionDisabledReason} />
                  ) : (
                    <>
                      <TextInput
                        style={[styles.input, styles.multiline]}
                        placeholder="Action reason for immutable audit"
                        placeholderTextColor="#8d8d8d"
                        value={creatorVideoModerationReason}
                        onChangeText={setCreatorVideoModerationReason}
                        multiline
                      />
                      <View style={styles.actionsRow}>
                        {(["hidden", "removed", "clean"] as const).map((status) => {
                          const busy = creatorVideoModerationBusy === status;
                          const disabled = creatorVideoModerationBusy !== null;
                          return (
                            <TouchableOpacity
                              key={status}
                              style={[
                                status === "clean" ? styles.actionBtn : styles.actionBtnDanger,
                                disabled && styles.configSaveBtnDisabled,
                              ]}
                              onPress={() => queueReportTargetModerationForTarget(
                                status,
                                selectedSafetyReport.targetType,
                                selectedSafetyReport.targetId,
                                creatorVideoModerationReason,
                                selectedSafetyReport,
                              )}
                              disabled={disabled}
                            >
                              {busy ? (
                                <ActivityIndicator color="#fff" size="small" />
                              ) : (
                                <Text style={status === "clean" ? styles.actionText : styles.actionTextDanger}>
                                  {getCreatorVideoModerationActionLabel(status)}
                                </Text>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </>
                  )}
                </View>

                <View style={styles.reportDetailPanel}>
                  <Text style={styles.ownerSectionTitle}>Report Status Actions</Text>
                  <View style={styles.actionsRow}>
                    {([
                      ["mark_reviewed", "Mark Reviewed"],
                      ["dismiss", "Dismiss Report"],
                      ["escalate", "Escalate"],
                    ] as const).map(([action, label]) => {
                      const busy = reportStatusActionBusy === action;
                      const closed = selectedSafetyReport.status === "actioned" || selectedSafetyReport.status === "dismissed";
                      const disabled = busy || reportStatusActionBusy !== null || closed;
                      return (
                      <TouchableOpacity
                        key={action}
                        style={[styles.orderBtn, disabled && styles.configSaveBtnDisabled]}
                        disabled={disabled}
                        onPress={() => void updateSelectedReportStatus(action)}
                      >
                        {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.orderBtnText}>{label}</Text>}
                      </TouchableOpacity>
                      );
                    })}
                  </View>
                  {selectedSafetyReport.status === "actioned" || selectedSafetyReport.status === "dismissed" ? (
                    <OwnerDisabledReason reason="This report is already closed. Reopen is not backed in this lane." />
                  ) : (
                    <OwnerDisabledReason reason="Report status actions require an action reason and write immutable audit rows." />
                  )}
                </View>

                <View style={styles.reportDetailPanel}>
                  <View style={styles.ownerSectionHeaderRow}>
                    <Text style={styles.ownerSectionTitle}>Audit Timeline</Text>
                    <OwnerStatusPill
                      label={selectedReportAuditLoading ? "Loading" : visibleSelectedReportAuditRows.length ? `${visibleSelectedReportAuditRows.length} rows` : "Recent Only"}
                      tone={visibleSelectedReportAuditRows.length ? "info" : "locked"}
                    />
                  </View>
                  <View style={styles.reportTimeline}>
                    <View style={styles.reportTimelineRow}>
                      <View style={[styles.reportTimelineDot, styles.reportTimelineDotManual]} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.reportTimelineTitle}>Report created</Text>
                        <Text style={styles.reportTimelineMeta}>
                          {`${formatModerationTimestamp(selectedSafetyReport.createdAt)} · ${formatReportSourceSurface(selectedSafetyReport.sourceSurface)}`}
                        </Text>
                      </View>
                    </View>
                    {visibleSelectedReportAuditRows.map((entry) => (
                      <View key={entry.id} style={styles.reportTimelineRow}>
                        <View style={[styles.reportTimelineDot, entry.severity === "warning" || entry.severity === "critical" ? styles.reportTimelineDotDanger : styles.reportTimelineDotInfo]} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.reportTimelineTitle}>{formatModerationToken(entry.action)}</Text>
                          <Text style={styles.reportTimelineMeta}>
                            {`${entry.createdAt ? formatModerationTimestamp(entry.createdAt) : "Time unknown"} · ${formatImmutableAuditActor(entry)}`}
                          </Text>
                          {entry.reason ? <Text style={styles.reportBody}>{formatAuditDisplayText(entry.reason)}</Text> : null}
                        </View>
                      </View>
                    ))}
                  </View>
                  {!visibleSelectedReportAuditRows.length && !selectedReportAuditLoading ? <OwnerDisabledReason reason={REPORT_AUDIT_UNAVAILABLE_REASON} /> : null}
                </View>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>

      <Modal
        visible={pendingCreatorVideoModeration !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setPendingCreatorVideoModeration(null)}
      >
        <View style={styles.confirmBackdrop}>
          <View style={styles.confirmSheet}>
            <Text style={styles.confirmKicker}>Report Target Safety</Text>
            <Text style={styles.confirmTitle}>
              {pendingCreatorVideoModeration
                ? getCreatorVideoModerationActionLabel(pendingCreatorVideoModeration.status)
                : "Confirm action"}
            </Text>
            <Text style={styles.confirmBody}>
              {pendingCreatorVideoModeration
                ? getReportTargetActionConfirmCopy(pendingCreatorVideoModeration.status, pendingCreatorVideoModeration.targetType)
                : "Confirm this operator action before continuing."}
            </Text>
            {pendingCreatorVideoModeration ? (
              <View style={styles.confirmMetaBox}>
                <Text style={styles.confirmMetaText}>
                  {`${formatModerationToken(pendingCreatorVideoModeration.targetType)} ${formatCompactIdentifier(pendingCreatorVideoModeration.targetId)}`}
                </Text>
                {pendingCreatorVideoModeration.reportId ? (
                  <Text style={styles.confirmMetaText}>
                    {`Report ${formatCompactIdentifier(pendingCreatorVideoModeration.reportId)}`}
                  </Text>
                ) : null}
                <Text style={styles.confirmMetaText}>
                  {pendingCreatorVideoModeration.reason
                    ? `Reason: ${pendingCreatorVideoModeration.reason}`
                    : "Reason: restore without additional note"}
                </Text>
              </View>
            ) : null}
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setPendingCreatorVideoModeration(null)}
                disabled={creatorVideoModerationBusy !== null}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  pendingCreatorVideoModeration?.status === "clean" ? styles.saveBtn : styles.dangerConfirmBtn,
                  creatorVideoModerationBusy !== null && styles.configSaveBtnDisabled,
                ]}
                onPress={() => void applyCreatorVideoModeration()}
                disabled={creatorVideoModerationBusy !== null}
              >
                {creatorVideoModerationBusy !== null ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveText}>Confirm</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editorVisible} animationType="slide" transparent onRequestClose={() => setEditorVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>{editorMode === "create" ? "Create Title" : "Edit Title"}</Text>
              <TouchableOpacity onPress={() => setEditorVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeText}>Close</Text>
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ paddingBottom: 26 }}>
              <TextInput
                style={styles.input}
                placeholder="Title"
                placeholderTextColor="#8d8d8d"
                value={form.title}
                onChangeText={(text) => setForm((prev) => ({ ...prev, title: text }))}
              />

              <TextInput
                style={styles.input}
                placeholder="Category (type any custom category)"
                placeholderTextColor="#8d8d8d"
                value={form.category}
                onChangeText={(text) => setForm((prev) => ({ ...prev, category: text }))}
              />

              {categoryOptions.length > 0 ? (
                <View style={styles.suggestedCategories}>
                  {categoryOptions.slice(0, 8).map((category) => (
                    <TouchableOpacity
                      key={category}
                      style={styles.categoryChip}
                      onPress={() => setForm((prev) => ({ ...prev, category }))}
                    >
                      <Text style={styles.categoryChipText}>{category}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              <View style={styles.inlineInputs}>
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Year"
                  placeholderTextColor="#8d8d8d"
                  keyboardType="numeric"
                  value={form.year}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, year: text }))}
                />
                <TextInput
                  style={[styles.input, styles.inputHalf]}
                  placeholder="Runtime"
                  placeholderTextColor="#8d8d8d"
                  value={form.runtime}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, runtime: text }))}
                />
              </View>

              <TextInput
                style={[styles.input, styles.multiline]}
                placeholder="Synopsis"
                placeholderTextColor="#8d8d8d"
                multiline
                value={form.synopsis}
                onChangeText={(text) => setForm((prev) => ({ ...prev, synopsis: text }))}
              />

              <TextInput
                style={styles.input}
                placeholder="Poster URL"
                placeholderTextColor="#8d8d8d"
                value={form.poster_url}
                onChangeText={(text) => setForm((prev) => ({ ...prev, poster_url: text }))}
              />

              {capabilities.thumbnailCol ? (
                <TextInput
                  style={styles.input}
                  placeholder="Thumbnail URL (compact cards)"
                  placeholderTextColor="#8d8d8d"
                  value={form.thumbnail_url}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, thumbnail_url: text }))}
                />
              ) : null}

              <TextInput
                style={styles.input}
                placeholder="Video URL"
                placeholderTextColor="#8d8d8d"
                value={form.video_url}
                onChangeText={(text) => setForm((prev) => ({ ...prev, video_url: text }))}
              />

              {capabilities.previewCol ? (
                <TextInput
                  style={styles.input}
                  placeholder="Preview Video URL"
                  placeholderTextColor="#8d8d8d"
                  value={form.preview_video_url}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, preview_video_url: text }))}
                />
              ) : null}

              {hasReleaseControl ? (
                <TextInput
                  style={styles.input}
                  placeholder="Release At (YYYY-MM-DDTHH:mm)"
                  placeholderTextColor="#8d8d8d"
                  value={form.release_at}
                  onChangeText={(text) => setForm((prev) => ({ ...prev, release_at: text }))}
                />
              ) : null}

              <TextInput
                style={styles.input}
                placeholder="Sort Order"
                placeholderTextColor="#8d8d8d"
                keyboardType="numeric"
                value={form.sort_order}
                onChangeText={(text) => setForm((prev) => ({ ...prev, sort_order: text }))}
              />

              <Text style={styles.sectionLabel}>Status</Text>
              <View style={styles.toggleRowWrap}>
                {(hasStatusControl ? statusOptions : (["draft", "published"] as StatusType[])).map((itemStatus) => (
                  <TouchableOpacity
                    key={itemStatus}
                    style={[styles.toggleChip, form.status === itemStatus && styles.toggleChipActive]}
                    onPress={() => setForm((prev) => ({ ...prev, status: itemStatus }))}
                  >
                    <Text style={[styles.toggleChipText, form.status === itemStatus && styles.toggleChipTextActive]}>
                      {itemStatus.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {(hasStatusControl || hasReleaseControl) ? (
                <>
                  <Text style={styles.sectionLabel}>Scheduling Preview</Text>
                  <View style={styles.configListRow}>
                    <View style={styles.configListCopy}>
                      <Text style={styles.configListTitle}>Effective publication outcome</Text>
                      <Text style={styles.configListBody}>
                        {editorPublicationPreview.isPublished
                          ? `Save will persist ${editorPublicationPreview.status.toUpperCase()} and this title will remain live.`
                          : `Save will persist ${editorPublicationPreview.status.toUpperCase()} and this title will stay off the live catalog.`}
                      </Text>
                      <Text style={styles.configListBody}>
                        {editorPublicationPreview.releaseAt
                          ? `Effective scheduled time: ${formatRelease(editorPublicationPreview.releaseAt)}`
                          : editorPublicationPreview.hasTypedReleaseInput
                            ? "No scheduled time will persist from the current input."
                            : "No scheduled time is currently set."}
                      </Text>
                      {editorPublicationPreview.hasTypedReleaseInput && !editorPublicationPreview.hasUsableReleaseInput ? (
                        <Text style={styles.configListBody}>
                          The typed release time is not usable yet, so save would normalize away the schedule.
                        </Text>
                      ) : null}
                      {editorPublicationPreview.adjustments.map((adjustment) => (
                        <Text key={adjustment} style={styles.configListBody}>
                          {adjustment}
                        </Text>
                      ))}
                    </View>

                    <View style={styles.badgesRow}>
                      <View style={[styles.badge, getStatusTone(editorPublicationPreview.status)]}>
                        <Text style={styles.badgeText}>{`Will Save ${editorPublicationPreview.status.toUpperCase()}`}</Text>
                      </View>
                      {hasReleaseControl ? (
                        <View
                          style={[
                            styles.badge,
                            editorPublicationPreview.releaseAt ? styles.badgeScheduled : styles.badgeOff,
                          ]}
                        >
                          <Text style={styles.badgeText}>
                            {editorPublicationPreview.releaseAt ? "Schedule Ready" : "No Schedule"}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </View>
                </>
              ) : null}

              {hasTitleMonetizationControls ? (
                <>
                  <Text style={styles.sectionLabel}>Monetization</Text>
                  <View style={styles.toggleRowWrap}>
                    {(["open", "premium"] as const).map((value) => (
                      <TouchableOpacity
                        key={value}
                        style={[styles.toggleChip, form.content_access_rule === value && styles.toggleChipActive]}
                        onPress={() => setForm((prev) => ({ ...prev, content_access_rule: value }))}
                      >
                        <Text style={[styles.toggleChipText, form.content_access_rule === value && styles.toggleChipTextActive]}>
                          {value.toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                      style={[styles.toggleChip, form.ads_enabled && styles.toggleChipActive]}
                      onPress={() => setForm((prev) => ({ ...prev, ads_enabled: !prev.ads_enabled }))}
                    >
                      <Text style={[styles.toggleChipText, form.ads_enabled && styles.toggleChipTextActive]}>
                        {form.ads_enabled ? "Ads Enabled" : "Ads Off"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View style={styles.toggleRowWrap}>
                    {(["none", "detail_banner", "player_banner"] as SponsorPlacement[]).map((placement) => (
                      <TouchableOpacity
                        key={placement}
                        style={[styles.toggleChip, form.sponsor_placement === placement && styles.toggleChipActive]}
                        onPress={() => setForm((prev) => ({ ...prev, sponsor_placement: placement }))}
                      >
                        <Text style={[styles.toggleChipText, form.sponsor_placement === placement && styles.toggleChipTextActive]}>
                          {placement.replace("_", " ").toUpperCase()}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Sponsor label"
                    placeholderTextColor="#8d8d8d"
                    value={form.sponsor_label}
                    onChangeText={(text) => setForm((prev) => ({ ...prev, sponsor_label: text }))}
                  />
                  <Text style={styles.configLoadingText}>
                    Unsupported premium or sponsor settings are normalized to open/off if the current creator grants do not allow them.
                  </Text>
                </>
              ) : null}

              <Text style={styles.sectionLabel}>Flags</Text>
              <View style={styles.toggleRowWrap}>
                <TouchableOpacity
                  style={[styles.toggleChip, form.featured && styles.toggleChipActive]}
                  onPress={() => setForm((prev) => ({ ...prev, featured: !prev.featured }))}
                >
                  <Text style={[styles.toggleChipText, form.featured && styles.toggleChipTextActive]}>
                    {form.featured ? "Featured" : "Standard"}
                  </Text>
                </TouchableOpacity>

                {hasHeroControl ? (
                  <TouchableOpacity
                    style={[styles.toggleChip, form.is_hero && styles.toggleChipActive]}
                    onPress={() => setForm((prev) => ({ ...prev, is_hero: !prev.is_hero }))}
                  >
                    <Text style={[styles.toggleChipText, form.is_hero && styles.toggleChipTextActive]}>
                      {form.is_hero ? "Hero" : "Not Hero"}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {hasTrendingControl ? (
                  <TouchableOpacity
                    style={[styles.toggleChip, form.is_trending && styles.toggleChipActive]}
                    onPress={() => setForm((prev) => ({ ...prev, is_trending: !prev.is_trending }))}
                  >
                    <Text style={[styles.toggleChipText, form.is_trending && styles.toggleChipTextActive]}>
                      {form.is_trending ? "Trending" : "Normal"}
                    </Text>
                  </TouchableOpacity>
                ) : null}

                {hasTopRowControl ? (
                  <TouchableOpacity
                    style={[styles.toggleChip, form.pin_to_top_row && styles.toggleChipActive]}
                    onPress={() => setForm((prev) => ({ ...prev, pin_to_top_row: !prev.pin_to_top_row }))}
                  >
                    <Text style={[styles.toggleChipText, form.pin_to_top_row && styles.toggleChipTextActive]}>
                      {form.pin_to_top_row ? "Top Row" : "Unpinned"}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditorVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={saveEditor} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Save Title</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.78)",
  },
  content: {
    paddingTop: 54,
    paddingBottom: 44,
    paddingHorizontal: 18,
    gap: 16,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#06070B",
  },
  loadingText: {
    color: "#D6DCE8",
    fontSize: 13,
    fontWeight: "700",
    marginTop: 12,
  },
  headerBlock: {
    gap: 12,
  },
  kicker: {
    color: "#9a9a9a",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0,
    marginBottom: 5,
  },
  title: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900",
    letterSpacing: 0,
  },
  subtitle: {
    color: "#b7b7b7",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
    marginTop: 4,
    maxWidth: "95%",
  },
  newBtn: {
    alignSelf: "flex-start",
    backgroundColor: "#DC143C",
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  newBtnText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 12,
    letterSpacing: 0,
  },
  notice: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  noticeSuccess: {
    backgroundColor: "rgba(45,153,92,0.2)",
    borderColor: "rgba(45,153,92,0.45)",
  },
  noticeError: {
    backgroundColor: "rgba(209,64,64,0.2)",
    borderColor: "rgba(209,64,64,0.45)",
  },
  noticeWarn: {
    backgroundColor: "rgba(220,170,20,0.16)",
    borderColor: "rgba(220,170,20,0.4)",
  },
  noticeText: {
    color: "#f0f0f0",
    fontWeight: "700",
    fontSize: 12,
  },
  ownerPanelHeader: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(5,8,14,0.82)",
    padding: 14,
    gap: 9,
  },
  ownerPanelTitleRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  ownerPanelKicker: {
    color: "#9AA4B9",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0,
  },
  ownerPanelTitle: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
    lineHeight: 29,
    marginTop: 4,
  },
  ownerPanelSubtitle: {
    color: "#C8D0DF",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  ownerPanelMeta: {
    color: "#8F9AAF",
    fontSize: 12,
    fontWeight: "800",
  },
  ownerPanelActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ownerPrimaryButton: {
    alignItems: "center",
    backgroundColor: "#DC143C",
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 132,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ownerPrimaryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  ownerSecondaryButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.18)",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 104,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ownerSecondaryButtonText: {
    color: "#F4F7FB",
    fontSize: 12,
    fontWeight: "900",
  },
  ownerPill: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 28,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  ownerPillDefault: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.16)",
  },
  ownerPillSuccess: {
    backgroundColor: "rgba(31,148,83,0.22)",
    borderColor: "rgba(69,204,127,0.45)",
  },
  ownerPillDanger: {
    backgroundColor: "rgba(210,54,72,0.24)",
    borderColor: "rgba(255,96,116,0.5)",
  },
  ownerPillManual: {
    backgroundColor: "rgba(220,170,20,0.2)",
    borderColor: "rgba(220,170,20,0.5)",
  },
  ownerPillLocked: {
    backgroundColor: "rgba(120,128,144,0.16)",
    borderColor: "rgba(168,176,192,0.3)",
  },
  ownerPillInfo: {
    backgroundColor: "rgba(87,124,255,0.18)",
    borderColor: "rgba(116,146,255,0.4)",
  },
  ownerPillText: {
    color: "#F7FAFF",
    fontSize: 10.5,
    fontWeight: "900",
  },
  ownerMetricTile: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
    flexBasis: "30%",
    flexGrow: 1,
    minHeight: 82,
    minWidth: 96,
    padding: 12,
    gap: 8,
  },
  ownerMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  ownerMetricSuccess: {
    borderColor: "rgba(69,204,127,0.32)",
    backgroundColor: "rgba(31,148,83,0.12)",
  },
  ownerMetricDanger: {
    borderColor: "rgba(255,96,116,0.38)",
    backgroundColor: "rgba(210,54,72,0.14)",
  },
  ownerMetricManual: {
    borderColor: "rgba(220,170,20,0.38)",
    backgroundColor: "rgba(220,170,20,0.12)",
  },
  ownerMetricLocked: {
    borderColor: "rgba(168,176,192,0.22)",
    backgroundColor: "rgba(120,128,144,0.08)",
  },
  ownerMetricLabel: {
    color: "#9AA4B9",
    fontSize: 11,
    fontWeight: "900",
  },
  ownerMetricValue: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
  },
  ownerFilterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ownerFilterChip: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  ownerFilterChipActive: {
    backgroundColor: "rgba(220,20,60,0.2)",
    borderColor: "rgba(220,20,60,0.5)",
  },
  ownerFilterChipText: {
    color: "#C8D0DF",
    fontSize: 11,
    fontWeight: "900",
  },
  ownerFilterChipTextActive: {
    color: "#FFFFFF",
  },
  ownerToolbarPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.035)",
    padding: 12,
    gap: 10,
  },
  ownerDisabledReason: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(214,168,79,0.28)",
    backgroundColor: "rgba(214,168,79,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  ownerDisabledReasonText: {
    color: "#E2C878",
    fontSize: 11.5,
    fontWeight: "800",
    lineHeight: 16,
  },
  ownerInputGroup: {
    gap: 9,
  },
  ownerControlList: {
    gap: 10,
  },
  ownerSectionGroup: {
    gap: 8,
  },
  ownerSectionHeaderRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  ownerSectionTitle: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 0,
    marginTop: 2,
  },
  ownerControlRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(8,11,18,0.74)",
    minHeight: 58,
    padding: 11,
    gap: 7,
  },
  ownerRowHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  ownerRowTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 19,
  },
  ownerRowMeta: {
    color: "#8F9AAF",
    fontSize: 11,
    fontWeight: "800",
    marginTop: 3,
  },
  ownerRowMessage: {
    color: "#C4CCDA",
    fontSize: 12.5,
    fontWeight: "700",
    lineHeight: 18,
  },
  ownerRowHint: {
    color: "#8F9AAF",
    fontSize: 11,
    fontWeight: "800",
  },
  ownerRowDetails: {
    borderTopColor: "rgba(255,255,255,0.08)",
    borderTopWidth: 1,
    gap: 6,
    paddingTop: 8,
  },
  ownerDetailText: {
    color: "#DCE3EF",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 18,
  },
  ownerDetailGrid: {
    gap: 8,
  },
  ownerDetailGridRow: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.035)",
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 3,
  },
  ownerDetailLabel: {
    color: "#8F9AAF",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  ownerDetailValue: {
    color: "#E5ECF8",
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
  },
  ownerNestedProofPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(113,142,255,0.16)",
    backgroundColor: "rgba(88,116,255,0.06)",
    gap: 8,
    padding: 10,
  },
  ownerEmptyState: {
    borderRadius: 8,
    borderStyle: "dashed",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    backgroundColor: "rgba(255,255,255,0.025)",
    padding: 14,
    gap: 6,
  },
  ownerEmptyTitle: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "900",
  },
  ownerEmptyBody: {
    color: "#AEB8C9",
    fontSize: 12.5,
    fontWeight: "700",
    lineHeight: 18,
  },
  ownerRunBanner: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
    gap: 4,
  },
  ownerRunBannerTitle: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "900",
  },
  ownerRunBannerBody: {
    color: "#C8D0DF",
    fontSize: 12.5,
    fontWeight: "700",
    lineHeight: 18,
  },
  ownerHistoryStrip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    gap: 8,
    padding: 12,
  },
  ownerHistoryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  ownerHistoryText: {
    color: "#AEB8C9",
    flexShrink: 1,
    fontSize: 11.5,
    fontWeight: "800",
  },
  ownerSecurityShell: {
    gap: 12,
  },
  ownerSecurityHero: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(116,146,255,0.26)",
    backgroundColor: "rgba(7,10,18,0.9)",
    padding: 16,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  ownerSecurityHeroTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  ownerSecurityHeroTitle: {
    color: "#FFFFFF",
    fontSize: 27,
    fontWeight: "900",
    lineHeight: 32,
    marginTop: 5,
  },
  ownerSecurityHeroSubtitle: {
    color: "#C9D3E6",
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 19,
    marginTop: 6,
  },
  ownerSecurityHeroMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  ownerSecurityHeroMeta: {
    color: "#9EABC3",
    flexShrink: 1,
    fontSize: 11.5,
    fontWeight: "800",
  },
  ownerSecurityIconButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.08)",
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ownerSecurityIconButtonText: {
    color: "#F7FAFF",
    fontSize: 11.5,
    fontWeight: "900",
  },
  ownerSecurityAlertRibbon: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(220,170,20,0.45)",
    backgroundColor: "rgba(220,170,20,0.14)",
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  ownerSecurityAlertRibbonText: {
    color: "#FFE7A6",
    fontSize: 12.5,
    fontWeight: "900",
  },
  ownerSecurityMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  ownerSecurityPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    backgroundColor: "rgba(8,11,18,0.82)",
    padding: 13,
    gap: 12,
  },
  ownerSecurityPassport: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(8,11,18,0.88)",
    padding: 13,
    gap: 12,
  },
  ownerSecurityPassportTrusted: {
    borderColor: "rgba(69,204,127,0.44)",
    backgroundColor: "rgba(31,148,83,0.1)",
  },
  ownerSecurityPassportDanger: {
    borderColor: "rgba(255,96,116,0.46)",
    backgroundColor: "rgba(210,54,72,0.12)",
  },
  ownerSecurityPanelHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "space-between",
  },
  ownerSecuritySectionKicker: {
    color: "#8FA0C3",
    fontSize: 10.5,
    fontWeight: "900",
    letterSpacing: 0,
  },
  ownerSecuritySectionTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 22,
    marginTop: 3,
  },
  ownerSecuritySectionBody: {
    color: "#B8C2D4",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
    marginTop: 3,
  },
  ownerSecurityIdentityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  ownerSecurityIdentityCell: {
    backgroundColor: "rgba(255,255,255,0.045)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 140,
    padding: 10,
    gap: 4,
  },
  ownerSecurityMiniLabel: {
    color: "#8F9AAF",
    fontSize: 10.5,
    fontWeight: "900",
  },
  ownerSecurityMiniValue: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
  },
  ownerSecurityMiniMeta: {
    color: "#9EA9BB",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
  },
  ownerSecurityActionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ownerSecurityDeviceList: {
    gap: 9,
  },
  ownerSecurityDeviceRow: {
    alignItems: "flex-start",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 10,
  },
  ownerSecurityDeviceTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  ownerSecurityDeviceTitle: {
    color: "#FFFFFF",
    flexShrink: 1,
    fontSize: 13.5,
    fontWeight: "900",
    lineHeight: 18,
  },
  ownerSecurityRowActions: {
    alignItems: "flex-end",
    gap: 7,
  },
  ownerSecuritySmallButton: {
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.07)",
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  ownerSecuritySmallButtonText: {
    color: "#F4F7FB",
    fontSize: 10.5,
    fontWeight: "900",
  },
  ownerSecurityGrantList: {
    gap: 9,
  },
  ownerSecurityGrantRow: {
    alignItems: "flex-start",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 10,
  },
  ownerSecurityTimeline: {
    gap: 0,
  },
  ownerSecurityTimelineRow: {
    flexDirection: "row",
    gap: 10,
    paddingBottom: 13,
  },
  ownerSecurityTimelineDot: {
    borderRadius: 999,
    height: 13,
    marginTop: 4,
    width: 13,
  },
  ownerSecurityTimelineCopy: {
    borderBottomColor: "rgba(255,255,255,0.08)",
    borderBottomWidth: 1,
    flex: 1,
    gap: 4,
    paddingBottom: 11,
  },
  ownerSecurityTimelineTitle: {
    color: "#FFFFFF",
    flexShrink: 1,
    fontSize: 13.5,
    fontWeight: "900",
    lineHeight: 18,
  },
  ownerSecurityOpsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  ownerSecurityOpsTile: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderColor: "rgba(255,255,255,0.08)",
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    minWidth: 150,
    padding: 10,
    gap: 7,
  },
  ownerSecurityOpsTitle: {
    color: "#FFFFFF",
    flexShrink: 1,
    fontSize: 13,
    fontWeight: "900",
    lineHeight: 18,
  },
  ownerSecurityEmergency: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,96,116,0.36)",
    backgroundColor: "rgba(58,12,22,0.48)",
    padding: 13,
    gap: 12,
  },
  adminHomeSurface: {
    gap: 12,
  },
  adminHomeHero: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(118,146,255,0.28)",
    backgroundColor: "rgba(7,11,18,0.88)",
    padding: 14,
    gap: 12,
  },
  adminHomeHeroTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  adminHomeHeroTitle: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 3,
  },
  adminHomeHeroBody: {
    color: "#C0C9DB",
    fontSize: 12.5,
    fontWeight: "600",
    lineHeight: 18,
    marginTop: 6,
    maxWidth: "96%",
  },
  adminHomeRefreshButton: {
    alignItems: "center",
    backgroundColor: "rgba(220,20,60,0.24)",
    borderColor: "rgba(220,20,60,0.44)",
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 96,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  adminHomeRefreshText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "900",
  },
  adminHomeStatusBand: {
    alignItems: "stretch",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  adminHomeSummaryStatus: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    flexBasis: 190,
    flexGrow: 1,
    gap: 5,
    minHeight: 96,
    padding: 12,
  },
  adminHomeSummaryLabel: {
    color: "#9AA4B9",
    fontSize: 10.5,
    fontWeight: "900",
  },
  adminHomeSummaryValue: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  adminHomeSummaryBody: {
    color: "#B8C2D4",
    fontSize: 11.5,
    fontWeight: "700",
    lineHeight: 16,
  },
  adminHomeHeroPills: {
    alignContent: "flex-start",
    flexBasis: 180,
    flexDirection: "row",
    flexGrow: 1,
    flexWrap: "wrap",
    gap: 7,
  },
  adminHomeSkeletonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  adminHomeSkeletonTile: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    flexBasis: "47%",
    flexGrow: 1,
    gap: 9,
    minHeight: 112,
    minWidth: 142,
    padding: 12,
  },
  adminHomeMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  adminHomeMetricTile: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
    flexBasis: "47%",
    flexGrow: 1,
    gap: 8,
    minHeight: 132,
    minWidth: 146,
    padding: 12,
  },
  adminHomeTileHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 8,
    justifyContent: "space-between",
  },
  adminHomeTileLabel: {
    color: "#A9B3C7",
    flex: 1,
    fontSize: 11,
    fontWeight: "900",
  },
  adminHomeTileValue: {
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
  },
  adminHomeTileBody: {
    color: "#B8C2D4",
    fontSize: 11.5,
    fontWeight: "700",
    lineHeight: 16,
  },
  adminHomePanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(8,11,18,0.76)",
    gap: 11,
    padding: 12,
  },
  adminHomeSectionHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    justifyContent: "space-between",
  },
  adminHomeSectionTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 3,
  },
  adminHomeAttentionRail: {
    gap: 8,
  },
  adminHomeAttentionRow: {
    alignItems: "stretch",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    flexDirection: "row",
    gap: 10,
    minHeight: 86,
    padding: 10,
  },
  adminHomePriorityStripe: {
    backgroundColor: "rgba(220,20,60,0.72)",
    borderRadius: 999,
    width: 3,
  },
  adminHomeAttentionCopy: {
    flex: 1,
    gap: 4,
  },
  adminHomeAttentionTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  adminHomeAttentionBody: {
    color: "#B5C0D2",
    fontSize: 11.5,
    fontWeight: "700",
    lineHeight: 16,
  },
  adminHomeAttentionMeta: {
    alignItems: "flex-end",
    gap: 5,
    minWidth: 68,
  },
  adminHomeAttentionValue: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  adminHomeDrillText: {
    color: "#AFC0FF",
    fontSize: 10.5,
    fontWeight: "900",
  },
  adminHomeSystemGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  adminHomeSystemTile: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.035)",
    flexBasis: "47%",
    flexGrow: 1,
    gap: 7,
    minHeight: 124,
    minWidth: 142,
    padding: 11,
  },
  adminHomeSystemLabel: {
    color: "#A9B3C7",
    flex: 1,
    fontSize: 10.8,
    fontWeight: "900",
  },
  adminHomeSystemValue: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
  adminHomeSystemBody: {
    color: "#B4BED0",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
  },
  adminHomeBoundaryGrid: {
    gap: 8,
  },
  adminHomeBoundaryItem: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.035)",
    gap: 7,
    padding: 11,
  },
  adminHomeBoundaryTitle: {
    color: "#FFFFFF",
    flex: 1,
    fontSize: 12.5,
    fontWeight: "900",
  },
  adminHomeBoundaryBody: {
    color: "#B9C3D4",
    fontSize: 11.5,
    fontWeight: "700",
    lineHeight: 16,
  },
  adminHomeActivityList: {
    gap: 9,
  },
  adminHomeActivityRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  adminHomeActivityDot: {
    borderRadius: 999,
    borderWidth: 1,
    height: 10,
    marginTop: 5,
    width: 10,
  },
  adminHomeActivityTitle: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "900",
  },
  adminHomeActivityMeta: {
    color: "#AAB5C8",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 15,
  },
  adminHomeActivityTarget: {
    color: "#8793A8",
    fontSize: 10.8,
    fontWeight: "800",
    lineHeight: 15,
  },
  adminHomeQuickSurface: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(118,146,255,0.2)",
    backgroundColor: "rgba(7,11,18,0.72)",
    gap: 11,
    padding: 12,
  },
  adminHomeQuickGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  adminHomeQuickAction: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 72,
    minWidth: 136,
    padding: 10,
    gap: 5,
  },
  adminHomeQuickTitle: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "900",
  },
  adminHomeQuickBody: {
    color: "#AEB9CC",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
  },
  configCard: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: "rgba(168,192,245,0.14)",
    backgroundColor: "rgba(12,12,18,0.95)",
    padding: 16,
    gap: 11,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  configHeaderRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  configKicker: {
    color: "#9AA4B9",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0,
  },
  configTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 4,
  },
  configBody: {
    color: "#BAC3D5",
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 6,
    maxWidth: "92%",
  },
  configHint: {
    color: "#9AA4B9",
    fontSize: 11.5,
    lineHeight: 17,
    marginBottom: 10,
    marginTop: -2,
  },
  configSaveBtn: {
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 108,
  },
  configSaveBtnDisabled: {
    opacity: 0.6,
  },
  configSaveBtnText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
  },
  configLoadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 4,
  },
  configLoadingText: {
    color: "#D6DCE8",
    fontSize: 12.5,
    fontWeight: "700",
  },
  configList: {
    gap: 8,
    marginBottom: 10,
  },
  contentHeroPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(6,9,16,0.9)",
    padding: 14,
    gap: 10,
  },
  contentHeroPills: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  contentPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(7,10,16,0.78)",
    padding: 13,
    gap: 12,
  },
  themePresetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  themePresetTile: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 164,
    minWidth: 142,
    padding: 11,
    gap: 7,
  },
  themePresetTileSelected: {
    borderColor: "rgba(220,20,60,0.56)",
    backgroundColor: "rgba(220,20,60,0.12)",
  },
  themePresetTileUnsaved: {
    borderColor: "rgba(220,170,20,0.58)",
    backgroundColor: "rgba(220,170,20,0.12)",
  },
  themePresetSwatch: {
    borderRadius: 7,
    height: 42,
    justifyContent: "center",
    overflow: "hidden",
    padding: 8,
  },
  themePresetSwatchInner: {
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    flex: 1,
  },
  themePresetTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  themePresetCue: {
    color: "#D8E0EE",
    fontSize: 11,
    fontWeight: "800",
  },
  themePresetBody: {
    color: "#AEB8CA",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
  },
  contentSegmentRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  contentSegment: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.11)",
    backgroundColor: "rgba(255,255,255,0.045)",
    flexBasis: 132,
    flexGrow: 1,
    minHeight: 44,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 3,
  },
  contentSegmentActive: {
    borderColor: "rgba(220,20,60,0.52)",
    backgroundColor: "rgba(220,20,60,0.16)",
  },
  contentSegmentText: {
    color: "#D8E0EE",
    fontSize: 12,
    fontWeight: "900",
  },
  contentSegmentTextActive: {
    color: "#FFFFFF",
  },
  contentSegmentBody: {
    color: "#98A4B8",
    fontSize: 10.5,
    fontWeight: "700",
    lineHeight: 14,
  },
  contentSubPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.035)",
    padding: 10,
    gap: 9,
  },
  contentRailRow: {
    alignItems: "flex-start",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    padding: 11,
  },
  contentRailRowHidden: {
    borderColor: "rgba(168,176,192,0.18)",
    backgroundColor: "rgba(120,128,144,0.08)",
    opacity: 0.78,
  },
  contentTitleCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
    flexDirection: "row",
    gap: 10,
    padding: 10,
  },
  contentSignalGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
  },
  contentSignalTile: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 104,
    minWidth: 132,
    padding: 10,
    gap: 7,
  },
  contentSignalTileActive: {
    borderColor: "rgba(69,204,127,0.38)",
    backgroundColor: "rgba(31,148,83,0.12)",
  },
  contentSignalTitle: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
  },
  contentSignalBody: {
    color: "#AEB8CA",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
  },
  operatorSummaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  tabBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "rgba(5,8,12,0.8)",
    padding: 6,
  },
  tabButton: {
    flexGrow: 1,
    flexBasis: 92,
    minHeight: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  tabButtonActive: {
    backgroundColor: "rgba(220,20,60,0.24)",
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.46)",
  },
  tabButtonText: {
    color: "#B7C1D4",
    fontSize: 12,
    fontWeight: "800",
  },
  tabButtonTextActive: {
    color: "#FFFFFF",
  },
  roleBoundaryPanel: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(7,9,14,0.78)",
    padding: 10,
    gap: 8,
  },
  boundaryRow: {
    gap: 8,
  },
  dashboardGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  dashboardMetricCard: {
    minWidth: 150,
    flexGrow: 1,
    flexBasis: "47%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.05)",
    padding: 13,
    gap: 7,
  },
  dashboardMetricCardUnavailable: {
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.025)",
  },
  dashboardMetricLabel: {
    color: "#9AA4B9",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0,
  },
  dashboardMetricValue: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "900",
  },
  dashboardMetricBody: {
    color: "#BAC3D5",
    fontSize: 12,
    lineHeight: 17,
  },
  configListRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 10,
    gap: 10,
  },
  configListRowSubtle: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.06)",
    backgroundColor: "rgba(255,255,255,0.025)",
    padding: 10,
  },
  providerUsageGrid: {
    gap: 8,
    marginTop: 8,
  },
  providerUsageCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
    backgroundColor: "rgba(5,8,12,0.42)",
    padding: 9,
    gap: 5,
  },
  providerUsageHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  providerUsageTitleCopy: {
    flex: 1,
    gap: 2,
  },
  configListCopy: {
    gap: 2,
  },
  configListTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
  },
  configListBody: {
    color: "#B3BDD0",
    fontSize: 11.5,
    fontWeight: "600",
  },
  configListActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  orderBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  orderBtnText: {
    color: "#ECECEC",
    fontSize: 11,
    fontWeight: "700",
  },
  reportCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(255,255,255,0.055)",
    padding: 13,
    gap: 9,
  },
  reportHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  reportKicker: {
    color: "#9AA4B9",
    fontSize: 11,
    fontWeight: "800",
  },
  reportTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 3,
  },
  reportMeta: {
    color: "#B5C0D2",
    fontSize: 11.5,
    fontWeight: "700",
    lineHeight: 17,
  },
  reportBody: {
    color: "#E2E7F2",
    fontSize: 12.5,
    fontWeight: "600",
    lineHeight: 18,
  },
  reportTriageSurface: {
    gap: 14,
  },
  reportHeroPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(118,146,255,0.24)",
    backgroundColor: "rgba(10,14,24,0.86)",
    padding: 14,
    gap: 12,
  },
  reportHeroTopRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  reportMetricGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  reportMetricTile: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.045)",
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 112,
    minWidth: 138,
    padding: 12,
    gap: 7,
  },
  reportMetricValue: {
    color: "#FFFFFF",
    fontSize: 23,
    fontWeight: "900",
  },
  reportMetricBody: {
    color: "#AEB9CC",
    fontSize: 11,
    fontWeight: "700",
    lineHeight: 15,
  },
  reportToolbarPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.035)",
    padding: 12,
    gap: 10,
  },
  reportFilterChipDisabled: {
    opacity: 0.72,
    backgroundColor: "rgba(120,128,144,0.1)",
    borderColor: "rgba(168,176,192,0.22)",
  },
  reportFilterChipTextDisabled: {
    color: "#9AA4B9",
  },
  reportQueueGrid: {
    gap: 10,
  },
  reportQueuePanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(8,11,18,0.72)",
    padding: 12,
    gap: 12,
  },
  reportRowActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "space-between",
  },
  reportTargetButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(87,124,255,0.5)",
    backgroundColor: "rgba(87,124,255,0.18)",
    paddingHorizontal: 11,
    paddingVertical: 8,
  },
  reportTargetButtonText: {
    color: "#F7FAFF",
    fontSize: 11,
    fontWeight: "900",
  },
  reportActionHint: {
    color: "#8F9AAF",
    fontSize: 11,
    fontWeight: "800",
  },
  reportManualPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(214,168,79,0.24)",
    backgroundColor: "rgba(214,168,79,0.07)",
    padding: 12,
    gap: 10,
  },
  reportManualHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  reportSkeletonPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.035)",
    padding: 12,
    gap: 8,
  },
  reportSkeletonCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 12,
    gap: 9,
  },
  reportSkeletonLineWide: {
    width: "82%",
    height: 12,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  reportSkeletonLine: {
    width: "54%",
    height: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  reportSkeletonPillRow: {
    flexDirection: "row",
    gap: 8,
  },
  reportSkeletonPill: {
    width: 72,
    height: 24,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.09)",
  },
  reportDetailBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  reportDetailSheet: {
    maxHeight: "88%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    backgroundColor: "#090D16",
    overflow: "hidden",
  },
  reportDetailContent: {
    padding: 16,
    gap: 12,
  },
  reportDetailHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
  },
  reportDetailPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.035)",
    padding: 12,
    gap: 10,
  },
  reportTimeline: {
    gap: 10,
  },
  reportTimelineRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  reportTimelineDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    marginTop: 5,
  },
  reportTimelineDotManual: {
    backgroundColor: "#E2C878",
  },
  reportTimelineDotInfo: {
    backgroundColor: "#83A0FF",
  },
  reportTimelineDotDanger: {
    backgroundColor: "#FF6074",
  },
  reportTimelineTitle: {
    color: "#FFFFFF",
    fontSize: 12.5,
    fontWeight: "900",
  },
  reportTimelineMeta: {
    color: "#9AA4B9",
    fontSize: 11,
    fontWeight: "800",
    lineHeight: 16,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statCard: {
    width: "48%",
    backgroundColor: "rgba(14,14,14,0.95)",
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  statCardWide: {
    width: "100%",
    backgroundColor: "rgba(14,14,14,0.95)",
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  statNumber: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 3,
  },
  statLabel: {
    color: "#b7b7b7",
    fontSize: 12,
    fontWeight: "700",
  },
  searchWrap: {
    marginTop: 2,
  },
  searchInput: {
    backgroundColor: "rgba(17,17,17,0.98)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    color: "#fff",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "600",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterChip: {
    backgroundColor: "rgba(20,20,20,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    borderColor: "#DC143C",
    backgroundColor: "rgba(220,20,60,0.2)",
  },
  filterChipText: {
    color: "#dadada",
    fontSize: 12,
    fontWeight: "700",
  },
  filterChipTextActive: {
    color: "#fff",
  },
  cardsList: {
    gap: 12,
  },
  card: {
    flexDirection: "row",
    backgroundColor: "rgba(12,12,12,0.96)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    borderRadius: 18,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 7 },
  },
  thumbWrap: {
    width: 98,
    height: 146,
    backgroundColor: "#121212",
  },
  thumb: {
    flex: 1,
  },
  cardBody: {
    flex: 1,
    padding: 12,
    gap: 8,
  },
  cardTopRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  cardTitle: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "900",
  },
  cardMeta: {
    color: "#bfbfbf",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },
  previewBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.24)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  previewBtnText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  badgesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  badge: {
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeOn: {
    backgroundColor: "rgba(220,20,60,0.2)",
    borderColor: "rgba(220,20,60,0.45)",
  },
  badgeOff: {
    backgroundColor: "rgba(120,120,120,0.16)",
    borderColor: "rgba(160,160,160,0.36)",
  },
  badgePublished: {
    backgroundColor: "rgba(45,153,92,0.24)",
    borderColor: "rgba(45,153,92,0.48)",
  },
  badgeScheduled: {
    backgroundColor: "rgba(87,124,255,0.24)",
    borderColor: "rgba(87,124,255,0.48)",
  },
  badgeDraft: {
    backgroundColor: "rgba(220,170,20,0.2)",
    borderColor: "rgba(220,170,20,0.42)",
  },
  badgeArchived: {
    backgroundColor: "rgba(120,120,120,0.22)",
    borderColor: "rgba(160,160,160,0.4)",
  },
  badgeText: {
    color: "#f1f1f1",
    fontSize: 10,
    fontWeight: "800",
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  actionBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  actionText: {
    color: "#efefef",
    fontSize: 11,
    fontWeight: "700",
  },
  actionBtnPrimary: {
    borderRadius: 999,
    backgroundColor: "#DC143C",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionBtnDanger: {
    borderRadius: 999,
    backgroundColor: "rgba(220,20,60,0.22)",
    borderWidth: 1,
    borderColor: "rgba(220,20,60,0.5)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  actionTextPrimary: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  actionTextDanger: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800",
  },
  skeletonCard: {
    height: 146,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  emptyState: {
    borderRadius: 16,
    padding: 18,
    backgroundColor: "rgba(15,15,15,0.9)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  emptyTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    marginBottom: 6,
  },
  emptyText: {
    color: "#c2c2c2",
    fontSize: 13,
    lineHeight: 18,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  confirmBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.64)",
    paddingHorizontal: 18,
  },
  confirmSheet: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.14)",
    backgroundColor: "#10131A",
    padding: 16,
    gap: 10,
  },
  confirmKicker: {
    color: "#9AA4B9",
    fontSize: 11,
    fontWeight: "800",
  },
  confirmTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "900",
  },
  confirmBody: {
    color: "#C7D0DF",
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 19,
  },
  confirmMetaBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.09)",
    backgroundColor: "rgba(255,255,255,0.04)",
    padding: 10,
    gap: 4,
  },
  confirmMetaText: {
    color: "#DCE3EF",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 17,
  },
  modalSheet: {
    maxHeight: "90%",
    backgroundColor: "#0E0E0E",
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
  },
  modalTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
  },
  closeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  closeText: {
    color: "#ddd",
    fontSize: 11,
    fontWeight: "700",
  },
  input: {
    backgroundColor: "rgba(255,255,255,0.08)",
    color: "#fff",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 10,
    fontSize: 14,
    fontWeight: "600",
  },
  inputDisabled: {
    opacity: 0.55,
  },
  inlineInputs: {
    flexDirection: "row",
    gap: 10,
  },
  inputHalf: {
    flex: 1,
  },
  multiline: {
    minHeight: 88,
    textAlignVertical: "top",
  },
  sectionLabel: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0,
    marginBottom: 8,
    marginTop: 2,
  },
  toggleRowWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  toggleChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingVertical: 8,
    paddingHorizontal: 11,
    alignItems: "center",
  },
  toggleChipActive: {
    borderColor: "#DC143C",
    backgroundColor: "rgba(220,20,60,0.2)",
  },
  toggleChipText: {
    color: "#dcdcdc",
    fontWeight: "700",
    fontSize: 11,
  },
  toggleChipTextActive: {
    color: "#fff",
  },
  toggleChipDisabled: {
    opacity: 0.55,
  },
  suggestedCategories: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    marginBottom: 10,
    marginTop: -2,
  },
  categoryChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    backgroundColor: "rgba(255,255,255,0.07)",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  categoryChipText: {
    color: "#e5e5e5",
    fontSize: 11,
    fontWeight: "700",
  },
  modalActions: {
    flexDirection: "row",
    gap: 10,
    paddingVertical: 12,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  cancelText: {
    color: "#ececec",
    fontWeight: "700",
  },
  saveBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#DC143C",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  dangerConfirmBtn: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#B91C32",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  saveText: {
    color: "#fff",
    fontWeight: "800",
  },
});
