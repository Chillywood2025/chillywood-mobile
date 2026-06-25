import type { Json, TablesInsert } from "../supabase/database.types";
import { trackEvent } from "./analytics";
import { getOfficialPlatformAccount } from "./officialAccounts";
import type { PlatformAdminAuditLogRow } from "./platformAudit";
import { isBetaOperatorIdentity } from "./runtimeConfig";
import { supabase } from "./supabase";

export const SAFETY_REPORTS_TABLE = "safety_reports";
export const PLATFORM_ROLE_MEMBERSHIPS_TABLE = "platform_role_memberships";

export type SafetyReportTargetType =
  | "participant"
  | "room"
  | "title"
  | "creator_video"
  | "profile_post"
  | "profile_post_comment"
  | "profile_media"
  | "creator_video_comment"
  | "social_attachment";
export type SafetyReportCategory = "abuse" | "harassment" | "impersonation" | "copyright" | "safety" | "other";
export type SafetyReportSeverity = "low" | "medium" | "high" | "critical" | "unknown";
export type SafetyReportStatus = "needs_review" | "reviewing" | "actioned" | "dismissed" | "escalated";
export type SafetyReportResolutionType =
  | "marked_reviewed"
  | "dismissed"
  | "escalated"
  | "target_hidden"
  | "target_removed"
  | "target_restored"
  | "no_action_needed"
  | "duplicate"
  | "unsupported_target";
export type SafetyReportCategoryCopy = {
  label: string;
  description: string;
};
export type ModerationActorRole = "member" | "official_platform" | "operator" | "owner" | "moderator";
export type PlatformRole = "owner" | "operator" | "moderator";
export type PlatformStaffManagementRole = "admin" | "operator" | "moderator";
export type PlatformStaffPermissionKey =
  | "support_inbox"
  | "user_lookup"
  | "content_moderation"
  | "reports_review"
  | "live_ops"
  | "billing_support_read"
  | "creator_support"
  | "legal_review"
  | "evidence_preview"
  | "dmca_review"
  | "copyright_review"
  | "evidence_export"
  | "legal_hold"
  | "legal_ops"
  | "emergency_break_glass"
  | "admin_grants"
  | "manage_moderators"
  | "audit_review"
  | "security_review"
  | "staff_permission_templates"
  | "legal_request_intake"
  | "admin.user.search"
  | "admin.user.view"
  | "admin.user.suspend"
  | "admin.user.restore"
  | "admin.support.view"
  | "admin.support.manage"
  | "admin.dmca.view"
  | "admin.dmca.manage"
  | "admin.payment_status.view"
  | "admin.refund_status.record"
  | "admin.profile_private.view"
  | "admin.room_private.view"
  | "admin.chat_evidence.view"
  | "admin.content.hide"
  | "admin.content.restore"
  | "admin.content.remove"
  | "admin.comment.moderate"
  | "admin.room.moderate"
  | "admin.live.force_end"
  | "admin.audit.view"
  | "admin.lower_role.manage";

export type ModerationAccess = {
  actorRole: ModerationActorRole;
  canAccessAdmin: boolean;
  canReviewSafetyReports: boolean;
  auditOwnerKey: string | null;
  isPlatformOwned: boolean;
  isLocalTestHelper: boolean;
};

export type SafetyReportInput = {
  targetType: SafetyReportTargetType;
  targetId: string;
  category: SafetyReportCategory;
  note?: string;
  roomId?: string | null;
  titleId?: string | null;
  context?: Record<string, unknown>;
};

export type PlatformRoleMembership = {
  id: number;
  role: PlatformRole;
  userId: string | null;
  email: string | null;
  status: string;
  grantedAt: string | null;
  permissionKeys: PlatformStaffPermissionKey[];
};

export type PlatformRoleRosterEntry = PlatformRoleMembership & {
  grantedBy: string | null;
  notes: string | null;
  identityLabel: string;
};

export type PlatformRoleRosterReadModel = {
  generatedAt: string;
  items: PlatformRoleRosterEntry[];
  summary: {
    totalVisibleRoles: number;
    activeCount: number;
    ownerCount: number;
    operatorCount: number;
    moderatorCount: number;
  };
};

export type PlatformStaffRoleActionResult = {
  id: number | null;
  email: string;
  role: PlatformRole;
  displayRole: "owner" | "admin" | "moderator";
  status: "active" | "revoked";
};

export type PlatformStaffPermissionActionResult = {
  id: string | null;
  email: string;
  expiresAt: string | null;
  permissionKey: PlatformStaffPermissionKey;
  status: "active" | "revoked";
};

export type PlatformStaffPermissionUpdateResult = {
  email: string;
  oldPermissions: PlatformStaffPermissionKey[];
  newPermissions: PlatformStaffPermissionKey[];
  grantedPermissions: PlatformStaffPermissionKey[];
  revokedPermissions: PlatformStaffPermissionKey[];
  unchangedPermissions: PlatformStaffPermissionKey[];
  auditWritten: boolean;
  updatedAt: string | null;
};

export type PlatformRoleAuditEvent = {
  id: string;
  auditKind: "role" | "permission";
  action: string;
  role: PlatformRole | null;
  permissionKey: PlatformStaffPermissionKey | null;
  actorEmail: string | null;
  actorRole: string | null;
  actorUserId: string | null;
  targetEmail: string | null;
  targetUserId: string | null;
  reason: string | null;
  createdAt: string | null;
  metadata: Record<string, unknown>;
};

export type SafetyReportRecord = {
  id: number;
  reporterUserId: string;
  targetType: SafetyReportTargetType;
  targetId: string;
  category: SafetyReportCategory;
  severity: SafetyReportSeverity;
  status: SafetyReportStatus;
  resolutionType: SafetyReportResolutionType | null;
  resolutionReason: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  escalatedAt: string | null;
  actionedAt: string | null;
  note: string | null;
  roomId: string | null;
  titleId: string | null;
  context: Record<string, unknown>;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SafetyReportQueueSourceSurface =
  | "profile"
  | "player"
  | "title-detail"
  | "chat-thread"
  | "watch-party-room"
  | "live-stage"
  | "communication-room"
  | "unknown";

export type SafetyReportQueueReviewState = "pending_review" | "operator_visible" | "unknown";

export type SafetyReportQueueItem = SafetyReportRecord & {
  sourceSurface: SafetyReportQueueSourceSurface;
  sourceRoute: string | null;
  targetLabel: string;
  targetRoleLabel: string | null;
  reporterRole: ModerationActorRole;
  reporterAuditOwnerKey: string | null;
  reporterPlatformOwned: boolean;
  reporterCanReviewSafetyReports: boolean;
  reviewState: SafetyReportQueueReviewState;
  targetAuditOwnerKey: string | null;
  platformOwnedTarget: boolean;
};

export type SafetyReportQueueSummary = {
  totalReports: number;
  needsReviewCount: number | null;
  criticalHighRiskCount: number | null;
  actionedTodayCount: number | null;
  queueHealth: "connected" | "not_connected";
  platformOwnedTargetCount: number;
  sourceSurfaces: SafetyReportQueueSourceSurface[];
};

export type SafetyReportQueueReadModel = {
  generatedAt: string;
  items: SafetyReportQueueItem[];
  summary: SafetyReportQueueSummary;
};

export type AdminAuditLogEntry = {
  id: string;
  kind: "platform_role_record" | "safety_report";
  occurredAt: string | null;
  title: string;
  detail: string;
  actorLabel: string | null;
  auditOwnerKey: string | null;
  tone: "default" | "review";
};

export type AdminAuditLogReadModel = {
  generatedAt: string;
  items: AdminAuditLogEntry[];
  summary: {
    totalItems: number;
    roleRecordCount: number;
    safetyReportCount: number;
    platformOwnedTargetCount: number;
  };
};

export const SAFETY_REPORT_CATEGORIES: SafetyReportCategory[] = [
  "abuse",
  "harassment",
  "impersonation",
  "copyright",
  "safety",
  "other",
];

export const SAFETY_REPORT_TARGET_TYPES: SafetyReportTargetType[] = [
  "participant",
  "room",
  "title",
  "creator_video",
  "profile_post",
  "profile_post_comment",
  "profile_media",
  "creator_video_comment",
  "social_attachment",
];

export const SAFETY_REPORT_CATEGORY_COPY: Record<SafetyReportCategory, SafetyReportCategoryCopy> = {
  abuse: {
    label: "Abuse",
    description: "Threats, doxxing, coercion, hate, exploitation, or targeted harm.",
  },
  harassment: {
    label: "Harassment",
    description: "Bullying, stalking, repeated unwanted contact, or hostile behavior.",
  },
  impersonation: {
    label: "Impersonation",
    description: "Fake creator, operator, official account, affiliation, or identity claims.",
  },
  copyright: {
    label: "Copyright",
    description: "Stolen uploads, unauthorized media, DMCA/copyright concerns, or rights misuse.",
  },
  safety: {
    label: "Safety",
    description: "Illegal content, scams/fraud, unsafe product or ad concerns, spam, malware, or platform abuse.",
  },
  other: {
    label: "Other",
    description: "Anything else, including undisclosed sponsorship or context the current categories do not cover.",
  },
};

type SafetyReportInsert = TablesInsert<"safety_reports">;

type ReportsRpcError = {
  code?: string | null;
  message?: string | null;
};

type ReportsRpcResult = {
  data: unknown;
  error: ReportsRpcError | null;
};

const reportsRpcClient = supabase as unknown as {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<ReportsRpcResult>;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

const normalizePositiveLimit = (value: unknown, fallback: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(parsed)));
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === "object" && !Array.isArray(value)
);

const toJsonValue = (value: unknown): Json => {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toJsonValue(entry));
  }

  if (typeof value === "object") {
    const normalized: { [key: string]: Json | undefined } = {};
    for (const [key, entry] of Object.entries(value)) {
      normalized[key] = entry === undefined ? undefined : toJsonValue(entry);
    }
    return normalized;
  }

  return String(value);
};

const normalizePlatformRole = (value: unknown): PlatformRole | null => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "owner" || normalized === "operator" || normalized === "moderator") {
    return normalized;
  }
  return null;
};

const normalizePlatformStaffPermissionKey = (value: unknown): PlatformStaffPermissionKey | null => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "moderator_grants") return "manage_moderators";
  if (
    normalized === "support_inbox"
    || normalized === "user_lookup"
    || normalized === "content_moderation"
    || normalized === "reports_review"
    || normalized === "live_ops"
    || normalized === "billing_support_read"
    || normalized === "creator_support"
    || normalized === "legal_review"
    || normalized === "evidence_preview"
    || normalized === "dmca_review"
    || normalized === "copyright_review"
    || normalized === "evidence_export"
    || normalized === "legal_hold"
    || normalized === "legal_ops"
    || normalized === "emergency_break_glass"
    || normalized === "admin_grants"
    || normalized === "manage_moderators"
    || normalized === "audit_review"
    || normalized === "security_review"
    || normalized === "staff_permission_templates"
    || normalized === "legal_request_intake"
    || normalized === "admin.user.search"
    || normalized === "admin.user.view"
    || normalized === "admin.user.suspend"
    || normalized === "admin.user.restore"
    || normalized === "admin.support.view"
    || normalized === "admin.support.manage"
    || normalized === "admin.dmca.view"
    || normalized === "admin.dmca.manage"
    || normalized === "admin.payment_status.view"
    || normalized === "admin.refund_status.record"
    || normalized === "admin.profile_private.view"
    || normalized === "admin.room_private.view"
    || normalized === "admin.chat_evidence.view"
    || normalized === "admin.content.hide"
    || normalized === "admin.content.restore"
    || normalized === "admin.content.remove"
    || normalized === "admin.comment.moderate"
    || normalized === "admin.room.moderate"
    || normalized === "admin.live.force_end"
    || normalized === "admin.audit.view"
    || normalized === "admin.lower_role.manage"
  ) {
    return normalized;
  }
  return null;
};

const normalizePlatformRoleStatus = (value: unknown) => {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === "revoked" ? "revoked" : "active";
};

export const formatPlatformRoleDisplayLabel = (role: PlatformRole | PlatformStaffManagementRole) => {
  const normalized = normalizeText(role).toLowerCase();
  if (normalized === "operator" || normalized === "admin") return "Admin";
  if (normalized === "owner") return "Owner";
  if (normalized === "moderator") return "Moderator";
  return "Unknown";
};

const formatPlatformRoleToken = (role: PlatformRole) => formatPlatformRoleDisplayLabel(role).toUpperCase();

const buildRoleIdentityLabel = (entry: {
  user_id?: unknown;
  email?: unknown;
}) => {
  const userId = normalizeText(entry.user_id);
  const email = normalizeText(entry.email).toLowerCase();
  if (email) return email;
  if (userId) return `USER ${userId}`;
  return "UNKNOWN IDENTITY";
};

const normalizePlatformStaffManagementRole = (value: unknown): PlatformStaffManagementRole | null => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "admin" || normalized === "operator") return "admin";
  if (normalized === "moderator") return "moderator";
  return null;
};

const normalizeSafetyReportTargetType = (value: unknown): SafetyReportTargetType => {
  const normalized = normalizeText(value).toLowerCase();
  if (
    normalized === "room"
    || normalized === "title"
    || normalized === "creator_video"
    || normalized === "profile_post"
    || normalized === "profile_post_comment"
    || normalized === "profile_media"
    || normalized === "creator_video_comment"
    || normalized === "social_attachment"
  ) {
    return normalized;
  }
  return "participant";
};

const normalizeSafetyReportCategory = (value: unknown): SafetyReportCategory => {
  const normalized = normalizeText(value).toLowerCase();
  if (
    normalized === "abuse"
    || normalized === "harassment"
    || normalized === "impersonation"
    || normalized === "copyright"
    || normalized === "other"
  ) {
    return normalized;
  }
  if (
    normalized === "illegal"
    || normalized === "scam"
    || normalized === "fraud"
    || normalized === "spam"
    || normalized === "malware"
    || normalized === "unsafe_product"
    || normalized === "unsafe_product_ad"
  ) {
    return "safety";
  }
  if (normalized === "undisclosed_sponsorship" || normalized === "sponsorship_disclosure") {
    return "other";
  }
  return "safety";
};

const normalizeSafetyReportSeverity = (value: unknown): SafetyReportSeverity => {
  const normalized = normalizeText(value).toLowerCase();
  if (
    normalized === "low"
    || normalized === "medium"
    || normalized === "high"
    || normalized === "critical"
  ) {
    return normalized;
  }
  return "unknown";
};

const normalizeSafetyReportStatus = (value: unknown): SafetyReportStatus => {
  const normalized = normalizeText(value).toLowerCase();
  if (
    normalized === "reviewing"
    || normalized === "actioned"
    || normalized === "dismissed"
    || normalized === "escalated"
  ) {
    return normalized;
  }
  return "needs_review";
};

const normalizeSafetyReportResolutionType = (value: unknown): SafetyReportResolutionType | null => {
  const normalized = normalizeText(value).toLowerCase();
  if (
    normalized === "marked_reviewed"
    || normalized === "dismissed"
    || normalized === "escalated"
    || normalized === "target_hidden"
    || normalized === "target_removed"
    || normalized === "target_restored"
    || normalized === "no_action_needed"
    || normalized === "duplicate"
    || normalized === "unsupported_target"
  ) {
    return normalized;
  }
  return null;
};

const isMissingReportsRpcError = (error: ReportsRpcError | null) => {
  const searchable = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return (
    searchable.includes("pgrst202")
    || searchable.includes("could not find the function")
    || searchable.includes("function public.list_admin_reports")
    || searchable.includes("function public.get_admin_reports_overview")
  );
};

const readContextText = (value: unknown) => normalizeText(value) || null;

const normalizeModerationActorRole = (value: unknown): ModerationActorRole => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "official_platform" || normalized === "operator" || normalized === "owner" || normalized === "moderator") {
    return normalized;
  }
  return "member";
};

const normalizeSafetyReportQueueSourceSurface = (value: unknown): SafetyReportQueueSourceSurface => {
  const normalized = normalizeText(value).toLowerCase();
  switch (normalized) {
    case "profile":
    case "player":
    case "title-detail":
    case "chat-thread":
    case "watch-party-room":
    case "live-stage":
    case "communication-room":
      return normalized;
    default:
      return "unknown";
  }
};

const normalizeSafetyReportQueueReviewState = (value: unknown): SafetyReportQueueReviewState => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "pending_review" || normalized === "operator_visible") {
    return normalized;
  }
  return "unknown";
};

export function getModerationAccess(identity?: {
  userId?: string | null;
  email?: string | null;
}): ModerationAccess {
  const userId = normalizeText(identity?.userId);
  const email = normalizeText(identity?.email);
  const officialAccount = getOfficialPlatformAccount(userId);
  const isOperator = isBetaOperatorIdentity({
    userId,
    email,
  });

  if (officialAccount) {
    return {
      actorRole: "official_platform",
      canAccessAdmin: false,
      canReviewSafetyReports: false,
      auditOwnerKey: officialAccount.auditOwnerKey,
      isPlatformOwned: true,
      isLocalTestHelper: isOperator,
    };
  }

  if (isOperator) {
    return {
      actorRole: "member",
      canAccessAdmin: false,
      canReviewSafetyReports: false,
      auditOwnerKey: userId ? `dev-helper:${userId}` : email ? `dev-helper:${email}` : "dev-helper:allowlist",
      isPlatformOwned: false,
      isLocalTestHelper: true,
    };
  }

  return {
    actorRole: "member",
    canAccessAdmin: false,
    canReviewSafetyReports: false,
    auditOwnerKey: null,
    isPlatformOwned: false,
    isLocalTestHelper: false,
  };
}

export function buildSafetyReportContext(input: {
  sourceSurface: string;
  sourceRoute?: string | null;
  targetLabel?: string | null;
  targetRoleLabel?: string | null;
  targetAuditOwnerKey?: string | null;
  platformOwnedTarget?: boolean;
  context?: Record<string, unknown>;
}) {
  const baseContext: Record<string, unknown> = {
    sourceSurface: normalizeText(input.sourceSurface) || "unknown",
    sourceRoute: normalizeText(input.sourceRoute) || null,
    targetLabel: normalizeText(input.targetLabel) || null,
    targetRoleLabel: normalizeText(input.targetRoleLabel) || null,
    targetAuditOwnerKey: normalizeText(input.targetAuditOwnerKey) || null,
    platformOwnedTarget: input.platformOwnedTarget === true,
    requiresModeratorReview: true,
  };

  if (!isPlainObject(input.context)) {
    return baseContext;
  }

  return {
    ...baseContext,
    ...input.context,
  };
}

export function trackModerationActionUsed(payload: {
  surface: string;
  action: string;
  targetType?: SafetyReportTargetType | null;
  targetId?: string | null;
  actorRole?: ModerationActorRole | null;
  roomId?: string | null;
  titleId?: string | null;
  threadId?: string | null;
  sourceRoute?: string | null;
  targetAuditOwnerKey?: string | null;
  platformOwnedTarget?: boolean;
}) {
  trackEvent("moderation_action_used", {
    surface: normalizeText(payload.surface) || "unknown",
    action: normalizeText(payload.action) || "unknown_action",
    targetType: normalizeText(payload.targetType) || null,
    targetId: normalizeText(payload.targetId) || null,
    actorRole: normalizeText(payload.actorRole) || null,
    roomId: normalizeText(payload.roomId) || null,
    titleId: normalizeText(payload.titleId) || null,
    threadId: normalizeText(payload.threadId) || null,
    sourceRoute: normalizeText(payload.sourceRoute) || null,
    targetAuditOwnerKey: normalizeText(payload.targetAuditOwnerKey) || null,
    platformOwnedTarget: payload.platformOwnedTarget === true,
  });
}

export function hasPlatformRoleMembership(
  memberships: PlatformRoleMembership[],
  requiredRoles: readonly PlatformRole[],
) {
  if (!memberships.length || !requiredRoles.length) return false;
  return memberships.some((membership) => membership.status === "active" && requiredRoles.includes(membership.role));
}

export function resolvePlatformActorRole(
  moderationAccess: ModerationAccess,
  memberships: PlatformRoleMembership[],
): ModerationActorRole {
  if (hasPlatformRoleMembership(memberships, ["owner"])) {
    return "owner";
  }
  if (hasPlatformRoleMembership(memberships, ["operator"])) {
    return "operator";
  }
  if (hasPlatformRoleMembership(memberships, ["moderator"])) {
    return "moderator";
  }
  if (moderationAccess.actorRole === "official_platform") {
    return "official_platform";
  }
  return "member";
}

export function canAccessAdminConsole(
  _moderationAccess: ModerationAccess,
  memberships: PlatformRoleMembership[],
) {
  return hasPlatformRoleMembership(memberships, ["owner", "operator", "moderator"]);
}

export function canReviewSafetyQueue(
  _moderationAccess: ModerationAccess,
  memberships: PlatformRoleMembership[],
) {
  return hasPlatformStaffPermission(memberships, ["reports_review", "content_moderation"]);
}

export function canManagePrivilegedAdminWrites(
  _moderationAccess: ModerationAccess,
  memberships: PlatformRoleMembership[],
) {
  return hasPlatformRoleMembership(memberships, ["owner"]);
}

export function canManageAdminRoleAssignments(memberships: PlatformRoleMembership[]) {
  return hasPlatformRoleMembership(memberships, ["owner"])
    || hasPlatformStaffPermission(memberships, ["admin_grants"]);
}

export function canManageModeratorRoleAssignments(memberships: PlatformRoleMembership[]) {
  return hasPlatformRoleMembership(memberships, ["owner"])
    || hasPlatformStaffPermission(memberships, ["manage_moderators"]);
}

export function hasPlatformStaffPermission(
  memberships: PlatformRoleMembership[],
  requiredPermissionKeys: readonly (PlatformStaffPermissionKey | "moderator_grants")[],
) {
  if (hasPlatformRoleMembership(memberships, ["owner"])) return true;
  const normalizedRequired = new Set(
    requiredPermissionKeys
      .map(normalizePlatformStaffPermissionKey)
      .filter((entry): entry is PlatformStaffPermissionKey => !!entry),
  );
  if (!normalizedRequired.size) return false;

  for (const membership of memberships) {
    for (const key of membership.permissionKeys ?? []) {
      if (normalizedRequired.has(key)) return true;
    }
  }
  return false;
}

export function canAccessLiveOpsTools(memberships: PlatformRoleMembership[]) {
  return hasPlatformStaffPermission(memberships, ["live_ops"]);
}

export function canAccessLegalEvidenceTools(memberships: PlatformRoleMembership[]) {
  return hasPlatformStaffPermission(memberships, [
    "legal_review",
    "evidence_preview",
    "evidence_export",
    "legal_hold",
    "legal_ops",
    "admin.chat_evidence.view",
  ]);
}

export function canAccessDmcaTools(memberships: PlatformRoleMembership[]) {
  return hasPlatformStaffPermission(memberships, [
    "dmca_review",
    "copyright_review",
    "legal_review",
    "admin.dmca.view",
    "admin.dmca.manage",
  ]);
}

export function canAccessAuditExplorerTools(memberships: PlatformRoleMembership[]) {
  return hasPlatformStaffPermission(memberships, ["audit_review", "security_review"]);
}

export function canManageStaffPermissionTemplates(memberships: PlatformRoleMembership[]) {
  return hasPlatformStaffPermission(memberships, ["staff_permission_templates", "admin_grants"]);
}

export function canAccessBreakGlassTools(memberships: PlatformRoleMembership[]) {
  return hasPlatformStaffPermission(memberships, ["emergency_break_glass"]);
}

export function canAccessLegalRequestIntakeTools(memberships: PlatformRoleMembership[]) {
  return hasPlatformStaffPermission(memberships, ["legal_request_intake", "legal_review", "legal_ops"]);
}

const platformMembershipMatchesIdentity = (
  entry: { user_id?: unknown; email?: unknown },
  identity: { userId: string; email: string },
) => {
  const rowUserId = normalizeText(entry.user_id);
  const rowEmail = normalizeText(entry.email).toLowerCase();
  return (!!identity.userId && rowUserId === identity.userId) || (!!identity.email && rowEmail === identity.email);
};

async function readMyPlatformStaffPermissionKeys(): Promise<PlatformStaffPermissionKey[]> {
  const rpc = supabase.rpc as unknown as (
    fn: string,
    args?: Record<string, never>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;

  const { data, error } = await rpc("read_my_platform_staff_permission_keys", {});
  if (error) return [];

  const values = Array.isArray(data) ? data : [];
  return Array.from(new Set(
    values
      .map(normalizePlatformStaffPermissionKey)
      .filter((entry): entry is PlatformStaffPermissionKey => !!entry),
  ));
}

export async function readMyPlatformRoleMemberships(): Promise<PlatformRoleMembership[]> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = normalizeText(sessionData.session?.user?.id);
  const email = normalizeText(sessionData.session?.user?.email).toLowerCase();

  if (!userId && !email) return [];

  const { data, error } = await supabase
    .from(PLATFORM_ROLE_MEMBERSHIPS_TABLE)
    .select("id,role,user_id,email,status,granted_at")
    .eq("status", "active")
    .order("granted_at", { ascending: false });

  if (error) throw error;

  const permissionKeys: PlatformStaffPermissionKey[] = await readMyPlatformStaffPermissionKeys().catch(() => []);

  return (data ?? [])
    .filter((entry) => platformMembershipMatchesIdentity(entry, { userId, email }))
    .map((entry) => {
      const role = normalizePlatformRole(entry.role);
      if (!role) return null;
      return {
        id: Number(entry.id ?? 0),
        role,
        userId: normalizeText(entry.user_id) || null,
        email: normalizeText(entry.email) || null,
        status: normalizeText(entry.status) || "active",
        grantedAt: normalizeText(entry.granted_at) || null,
        permissionKeys: [...permissionKeys],
      } satisfies PlatformRoleMembership;
    })
    .filter((entry): entry is PlatformRoleMembership => !!entry);
}

export async function readPlatformRoleRoster(options?: {
  limit?: number;
  includeRevoked?: boolean;
  includePermissionGrants?: boolean;
}): Promise<PlatformRoleRosterReadModel> {
  const limit = normalizePositiveLimit(options?.limit, 12, 50);
  let query = supabase
    .from(PLATFORM_ROLE_MEMBERSHIPS_TABLE)
    .select("id,role,user_id,email,status,granted_at,granted_by,notes")
    .order("granted_at", { ascending: false })
    .limit(limit);

  if (options?.includeRevoked !== true) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;

  if (error) throw error;

  const items = (data ?? [])
    .map((entry): PlatformRoleRosterEntry | null => {
      const role = normalizePlatformRole(entry.role);
      if (!role) return null;
      const status = normalizePlatformRoleStatus(entry.status);
      return {
        id: Number(entry.id ?? 0),
        role,
        userId: normalizeText(entry.user_id) || null,
        email: normalizeText(entry.email).toLowerCase() || null,
        status,
        grantedAt: normalizeText(entry.granted_at) || null,
        permissionKeys: [] as PlatformStaffPermissionKey[],
        grantedBy: normalizeText(entry.granted_by) || null,
        notes: normalizeText(entry.notes) || null,
        identityLabel: buildRoleIdentityLabel(entry),
      } satisfies PlatformRoleRosterEntry;
    })
    .filter((entry): entry is PlatformRoleRosterEntry => !!entry);

  const activeItems = items.filter((entry) => entry.status === "active");

  if (options?.includePermissionGrants === true && items.length) {
    const emails = Array.from(new Set(
      items
        .map((entry) => normalizeText(entry.email).toLowerCase())
        .filter(Boolean),
    ));

    if (emails.length) {
      const permissionClient = supabase as unknown as {
        from: (table: string) => {
          select: (columns: string) => {
            eq: (column: string, value: unknown) => {
              in: (column: string, values: string[]) => {
                limit: (limit: number) => Promise<{ data: unknown[] | null; error: { message?: string } | null }>;
              };
            };
          };
        };
      };

      const { data: permissionRows, error: permissionError } = await permissionClient
        .from("platform_staff_permission_grants")
        .select("target_email,permission_key,status,expires_at")
        .eq("status", "active")
        .in("target_email", emails)
        .limit(500);

      if (!permissionError) {
        const permissionMap = new Map<string, Set<PlatformStaffPermissionKey>>();
        for (const row of permissionRows ?? []) {
          if (!isPlainObject(row)) continue;
          const expiresAt = normalizeText(row.expires_at);
          if (expiresAt && Date.parse(expiresAt) <= Date.now()) continue;
          const email = normalizeText(row.target_email).toLowerCase();
          const permissionKey = normalizePlatformStaffPermissionKey(row.permission_key);
          if (!email || !permissionKey) continue;
          const existing = permissionMap.get(email) ?? new Set<PlatformStaffPermissionKey>();
          existing.add(permissionKey);
          permissionMap.set(email, existing);
        }

        for (const item of items) {
          const email = normalizeText(item.email).toLowerCase();
          item.permissionKeys = email ? Array.from(permissionMap.get(email) ?? []).sort() : [];
        }
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    items,
    summary: {
      totalVisibleRoles: items.length,
      activeCount: activeItems.length,
      ownerCount: activeItems.filter((entry) => entry.role === "owner").length,
      operatorCount: activeItems.filter((entry) => entry.role === "operator").length,
      moderatorCount: activeItems.filter((entry) => entry.role === "moderator").length,
    },
  };
}

const parsePermissionKeyArray = (value: unknown): PlatformStaffPermissionKey[] => {
  const values = Array.isArray(value) ? value : [];
  return Array.from(new Set(
    values
      .map(normalizePlatformStaffPermissionKey)
      .filter((entry): entry is PlatformStaffPermissionKey => !!entry),
  )).sort();
};

const readStaffRoleActionResult = (value: unknown): PlatformStaffRoleActionResult => {
  const payload = isPlainObject(value) ? value : {};
  const role = normalizePlatformRole(payload.role) ?? "moderator";
  const status = normalizePlatformRoleStatus(payload.status) === "revoked" ? "revoked" : "active";
  return {
    id: Number.isFinite(Number(payload.id)) ? Number(payload.id) : null,
    email: normalizeText(payload.email).toLowerCase(),
    role,
    displayRole: role === "operator" ? "admin" : role,
    status,
  };
};

const readStaffPermissionActionResult = (value: unknown): PlatformStaffPermissionActionResult => {
  const payload = isPlainObject(value) ? value : {};
  const permissionKey = normalizePlatformStaffPermissionKey(payload.permissionKey ?? payload.permission_key) ?? "manage_moderators";
  const status = normalizePlatformRoleStatus(payload.status) === "revoked" ? "revoked" : "active";
  return {
    id: normalizeText(payload.id) || null,
    email: normalizeText(payload.email).toLowerCase(),
    expiresAt: normalizeText(payload.expiresAt ?? payload.expires_at) || null,
    permissionKey,
    status,
  };
};

export async function grantPlatformStaffRoleByEmail(input: {
  email: string;
  role: PlatformStaffManagementRole;
  reason?: string | null;
}) {
  const email = normalizeText(input.email).toLowerCase();
  const role = normalizePlatformStaffManagementRole(input.role);
  if (!email) throw new Error("Enter a staff email.");
  if (!role) throw new Error("Choose a supported staff role.");

  const { data, error } = await supabase.rpc("admin_grant_platform_role_by_email", {
    p_reason: normalizeText(input.reason) || undefined,
    p_role: role,
    p_target_email: email,
  });

  if (error) throw error;
  return readStaffRoleActionResult(data);
}

export async function grantPlatformStaffPermissionByEmail(input: {
  email: string;
  permissionKey: PlatformStaffPermissionKey | "moderator_grants";
  reason?: string | null;
  expiresAt?: string | null;
}) {
  const email = normalizeText(input.email).toLowerCase();
  const permissionKey = normalizePlatformStaffPermissionKey(input.permissionKey);
  if (!email) throw new Error("Enter a staff email.");
  if (!permissionKey) throw new Error("Choose a supported staff permission.");

  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  const { data, error } = await rpc("admin_grant_platform_staff_permission_by_email", {
    p_expires_at: normalizeText(input.expiresAt) || null,
    p_permission_key: permissionKey,
    p_reason: normalizeText(input.reason) || null,
    p_target_email: email,
  });

  if (error) throw error;
  return readStaffPermissionActionResult(data);
}

export async function revokePlatformStaffRoleByEmail(input: {
  email: string;
  role: PlatformStaffManagementRole;
  reason?: string | null;
}) {
  const email = normalizeText(input.email).toLowerCase();
  const role = normalizePlatformStaffManagementRole(input.role);
  if (!email) throw new Error("Enter a staff email.");
  if (!role) throw new Error("Choose a supported staff role.");

  const { data, error } = await supabase.rpc("admin_revoke_platform_role_by_email", {
    p_reason: normalizeText(input.reason) || undefined,
    p_role: role,
    p_target_email: email,
  });

  if (error) throw error;
  return readStaffRoleActionResult(data);
}

export async function revokePlatformStaffPermissionByEmail(input: {
  email: string;
  permissionKey: PlatformStaffPermissionKey | "moderator_grants";
  reason?: string | null;
}) {
  const email = normalizeText(input.email).toLowerCase();
  const permissionKey = normalizePlatformStaffPermissionKey(input.permissionKey);
  if (!email) throw new Error("Enter a staff email.");
  if (!permissionKey) throw new Error("Choose a supported staff permission.");

  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  const { data, error } = await rpc("admin_revoke_platform_staff_permission_by_email", {
    p_permission_key: permissionKey,
    p_reason: normalizeText(input.reason) || null,
    p_target_email: email,
  });

  if (error) throw error;
  return readStaffPermissionActionResult(data);
}

export async function readPlatformStaffPermissionsByEmail(input: {
  email: string;
}): Promise<PlatformStaffPermissionKey[]> {
  const email = normalizeText(input.email).toLowerCase();
  if (!email) throw new Error("Enter a staff email.");

  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  const { data, error } = await rpc("list_staff_scoped_permissions_by_email", {
    p_target_email: email,
  });

  if (error) throw error;
  return parsePermissionKeyArray(data);
}

const readStaffPermissionUpdateResult = (value: unknown): PlatformStaffPermissionUpdateResult => {
  const payload = isPlainObject(value) ? value : {};
  return {
    email: normalizeText(payload.email).toLowerCase(),
    oldPermissions: parsePermissionKeyArray(payload.oldPermissions ?? payload.old_permissions),
    newPermissions: parsePermissionKeyArray(payload.newPermissions ?? payload.new_permissions),
    grantedPermissions: parsePermissionKeyArray(payload.grantedPermissions ?? payload.granted_permissions),
    revokedPermissions: parsePermissionKeyArray(payload.revokedPermissions ?? payload.revoked_permissions),
    unchangedPermissions: parsePermissionKeyArray(payload.unchangedPermissions ?? payload.unchanged_permissions),
    auditWritten: payload.auditWritten === true || payload.audit_written === true,
    updatedAt: normalizeText(payload.updatedAt ?? payload.updated_at) || null,
  };
};

export async function updatePlatformStaffPermissionsByEmail(input: {
  email: string;
  permissionKeys: readonly PlatformStaffPermissionKey[];
  reason: string;
  expiresAt?: string | null;
}): Promise<PlatformStaffPermissionUpdateResult> {
  const email = normalizeText(input.email).toLowerCase();
  const reason = normalizeText(input.reason);
  const permissionKeys = Array.from(new Set(
    input.permissionKeys
      .map(normalizePlatformStaffPermissionKey)
      .filter((entry): entry is PlatformStaffPermissionKey => !!entry),
  )).sort();

  if (!email) throw new Error("Enter a staff email.");
  if (reason.length < 6) throw new Error("Audit reason is required for permission changes.");

  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  const { data, error } = await rpc("admin_update_platform_staff_permissions_by_email", {
    p_expires_at: normalizeText(input.expiresAt) || null,
    p_permission_keys: permissionKeys,
    p_reason: reason,
    p_target_email: email,
  });

  if (error) throw error;
  return readStaffPermissionUpdateResult(data);
}

const readRoleAuditEvent = (value: unknown): PlatformRoleAuditEvent | null => {
  if (!isPlainObject(value)) return null;
  const id = normalizeText(value.id);
  const auditKind = normalizeText(value.audit_kind) === "permission" ? "permission" : "role";
  if (!id) return null;
  return {
    id,
    auditKind,
    action: normalizeText(value.action) || "unknown",
    role: normalizePlatformRole(value.role),
    permissionKey: normalizePlatformStaffPermissionKey(value.permission_key),
    actorEmail: normalizeText(value.actor_email) || null,
    actorRole: normalizeText(value.actor_role) || null,
    actorUserId: normalizeText(value.actor_user_id) || null,
    targetEmail: normalizeText(value.target_email).toLowerCase() || null,
    targetUserId: normalizeText(value.target_user_id) || null,
    reason: normalizeText(value.reason) || null,
    createdAt: normalizeText(value.created_at) || null,
    metadata: isPlainObject(value.metadata) ? value.metadata : {},
  };
};

export async function listAdminRoleAuditEvents(options?: {
  filter?: string;
  limit?: number;
}): Promise<PlatformRoleAuditEvent[]> {
  const rpc = supabase.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>;
  const { data, error } = await rpc("list_admin_role_audit_events", {
    p_filter: normalizeText(options?.filter) || "all",
    p_limit: normalizePositiveLimit(options?.limit, 12, 50),
  });

  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  return rows
    .map(readRoleAuditEvent)
    .filter((entry): entry is PlatformRoleAuditEvent => !!entry);
}

type SafetyReportDbRow = {
  id?: unknown;
  reporter_user_id?: unknown;
  target_type?: unknown;
  target_id?: unknown;
  category?: unknown;
  severity?: unknown;
  status?: unknown;
  resolution_type?: unknown;
  resolution_reason?: unknown;
  resolved_by?: unknown;
  resolved_at?: unknown;
  escalated_at?: unknown;
  actioned_at?: unknown;
  note?: unknown;
  room_id?: unknown;
  title_id?: unknown;
  context?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
};

type AdminReportsOverview = {
  connected: boolean;
  generatedAt: string | null;
  totalReports: number | null;
  needsReviewCount: number | null;
  criticalHighRiskCount: number | null;
  actionedTodayCount: number | null;
  queueHealth: "connected" | "not_connected";
  sourceSurfaces: SafetyReportQueueSourceSurface[];
};

const toSafetyReportRecord = (entry: SafetyReportDbRow): SafetyReportRecord => ({
  id: Number(entry.id ?? 0),
  reporterUserId: normalizeText(entry.reporter_user_id),
  targetType: normalizeSafetyReportTargetType(entry.target_type),
  targetId: normalizeText(entry.target_id),
  category: normalizeSafetyReportCategory(entry.category),
  severity: normalizeSafetyReportSeverity(entry.severity),
  status: normalizeSafetyReportStatus(entry.status),
  resolutionType: normalizeSafetyReportResolutionType(entry.resolution_type),
  resolutionReason: normalizeText(entry.resolution_reason) || null,
  resolvedBy: normalizeText(entry.resolved_by) || null,
  resolvedAt: normalizeText(entry.resolved_at) || null,
  escalatedAt: normalizeText(entry.escalated_at) || null,
  actionedAt: normalizeText(entry.actioned_at) || null,
  note: normalizeText(entry.note) || null,
  roomId: normalizeText(entry.room_id) || null,
  titleId: normalizeText(entry.title_id) || null,
  context: isPlainObject(entry.context) ? entry.context : {},
  createdAt: normalizeText(entry.created_at) || null,
  updatedAt: normalizeText(entry.updated_at) || null,
});

const parseReportRows = (value: unknown): SafetyReportRecord[] => {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  return rows
    .filter(isPlainObject)
    .map((entry) => toSafetyReportRecord(entry as SafetyReportDbRow));
};

const parseAdminReportsOverview = (value: unknown): AdminReportsOverview | null => {
  if (!isPlainObject(value)) return null;
  const sourceValues = Array.isArray(value.sourceSurfaces) ? value.sourceSurfaces : [];
  return {
    connected: value.connected === true,
    generatedAt: normalizeText(value.generatedAt) || normalizeText(value.generated_at) || null,
    totalReports: Number.isFinite(Number(value.totalReports)) ? Number(value.totalReports) : null,
    needsReviewCount: Number.isFinite(Number(value.needsReviewCount)) ? Number(value.needsReviewCount) : null,
    criticalHighRiskCount: Number.isFinite(Number(value.criticalHighRiskCount)) ? Number(value.criticalHighRiskCount) : null,
    actionedTodayCount: Number.isFinite(Number(value.actionedTodayCount)) ? Number(value.actionedTodayCount) : null,
    queueHealth: value.queueHealth === "connected" ? "connected" : "not_connected",
    sourceSurfaces: sourceValues.map(normalizeSafetyReportQueueSourceSurface),
  };
};

const toAdminAuditLogRow = (row: Record<string, unknown>): PlatformAdminAuditLogRow | null => {
  const id = normalizeText(row.id);
  const action = normalizeText(row.action);
  const actionCategory = normalizeText(row.action_category);
  if (!id || !action || !actionCategory) return null;

  const metadata = isPlainObject(row.metadata) ? row.metadata : {};
  return {
    id,
    actorUserId: normalizeText(row.actor_user_id) || null,
    actorEmail: normalizeText(row.actor_email) || null,
    actorRole: normalizeText(row.actor_role) || null,
    action,
    actionCategory,
    targetType: normalizeText(row.target_type) || null,
    targetId: normalizeText(row.target_id) || null,
    targetUserId: normalizeText(row.target_user_id) || null,
    targetChannelUserId: normalizeText(row.target_channel_user_id) || null,
    reason: normalizeText(row.reason) || null,
    severity: normalizeText(row.severity) || "info",
    metadata,
    createdAt: normalizeText(row.created_at) || null,
    foundationProof: metadata.admin_audit_foundation_proof === true || metadata.foundation_only === true,
  };
};

export async function readSafetyReports(options?: {
  limit?: number;
  filter?: string;
}) {
  const limit = Number.isFinite(options?.limit) ? Math.max(1, Math.min(50, Math.floor(Number(options?.limit)))) : 8;
  const filter = normalizeText(options?.filter) || "all";

  const rpcResult = await reportsRpcClient.rpc("list_admin_reports", {
    p_cursor: null,
    p_filter: filter,
    p_limit: limit,
    p_severity: null,
    p_status: null,
    p_target_type: null,
  });

  if (!rpcResult.error) {
    return parseReportRows(rpcResult.data);
  }

  if (!isMissingReportsRpcError(rpcResult.error)) {
    throw rpcResult.error;
  }

  const { data, error } = await supabase
    .from(SAFETY_REPORTS_TABLE)
    .select("id,reporter_user_id,target_type,target_id,category,note,room_id,title_id,context,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((entry) => toSafetyReportRecord(entry as SafetyReportDbRow)) satisfies SafetyReportRecord[];
}

export function toSafetyReportQueueItem(report: SafetyReportRecord): SafetyReportQueueItem {
  return {
    ...report,
    sourceSurface: normalizeSafetyReportQueueSourceSurface(report.context.sourceSurface),
    sourceRoute: readContextText(report.context.sourceRoute),
    targetLabel: readContextText(report.context.targetLabel) ?? report.targetId,
    targetRoleLabel: readContextText(report.context.targetRoleLabel),
    reporterRole: normalizeModerationActorRole(report.context.reporterRole),
    reporterAuditOwnerKey: readContextText(report.context.reporterAuditOwnerKey),
    reporterPlatformOwned: report.context.reporterPlatformOwned === true,
    reporterCanReviewSafetyReports: report.context.reporterCanReviewSafetyReports === true,
    reviewState: normalizeSafetyReportQueueReviewState(report.context.moderationReviewState),
    targetAuditOwnerKey: readContextText(report.context.targetAuditOwnerKey),
    platformOwnedTarget: report.context.platformOwnedTarget === true,
  };
}

export function summarizeSafetyReportQueue(items: SafetyReportQueueItem[]): SafetyReportQueueSummary {
  return {
    totalReports: items.length,
    needsReviewCount: items.filter((item) => item.status === "needs_review" || item.status === "reviewing").length,
    criticalHighRiskCount: items.filter((item) => (
      (item.severity === "critical" || item.severity === "high")
      && item.status !== "actioned"
      && item.status !== "dismissed"
    )).length,
    actionedTodayCount: null,
    queueHealth: "connected",
    platformOwnedTargetCount: items.filter((item) => item.platformOwnedTarget).length,
    sourceSurfaces: Array.from(new Set(items.map((item) => item.sourceSurface))),
  };
}

export async function readAdminReportsOverview(): Promise<AdminReportsOverview> {
  const { data, error } = await reportsRpcClient.rpc("get_admin_reports_overview", {});
  if (error) throw error;
  return parseAdminReportsOverview(data) ?? {
    connected: false,
    generatedAt: null,
    totalReports: null,
    needsReviewCount: null,
    criticalHighRiskCount: null,
    actionedTodayCount: null,
    queueHealth: "not_connected",
    sourceSurfaces: [],
  };
}

export async function readSafetyReportQueue(options?: {
  limit?: number;
  filter?: string;
}): Promise<SafetyReportQueueReadModel> {
  const [reports, overview] = await Promise.all([
    readSafetyReports(options),
    readAdminReportsOverview().catch(() => null),
  ]);
  const items = reports.map(toSafetyReportQueueItem);
  const fallbackSummary = summarizeSafetyReportQueue(items);
  return {
    generatedAt: overview?.generatedAt ?? new Date().toISOString(),
    items,
    summary: overview
      ? {
        totalReports: overview.totalReports ?? fallbackSummary.totalReports,
        needsReviewCount: overview.needsReviewCount ?? fallbackSummary.needsReviewCount,
        criticalHighRiskCount: overview.criticalHighRiskCount ?? fallbackSummary.criticalHighRiskCount,
        actionedTodayCount: overview.actionedTodayCount,
        queueHealth: overview.queueHealth,
        platformOwnedTargetCount: fallbackSummary.platformOwnedTargetCount,
        sourceSurfaces: overview.sourceSurfaces.length ? overview.sourceSurfaces : fallbackSummary.sourceSurfaces,
      }
      : fallbackSummary,
  };
}

export async function updateAdminReportStatusAction(input: {
  reportId: number;
  action: "mark_reviewed" | "dismiss" | "escalate";
  reason: string;
}): Promise<SafetyReportQueueItem> {
  const reason = normalizeText(input.reason);
  if (!Number.isFinite(input.reportId) || input.reportId <= 0) {
    throw new Error("Select a report before updating status.");
  }
  if (!reason) {
    throw new Error("Add an action reason before updating report status.");
  }

  const { data, error } = await reportsRpcClient.rpc("update_admin_report_status", {
    p_reason: reason,
    p_report_id: input.reportId,
    p_status_action: input.action,
  });
  if (error) throw error;

  const [report] = parseReportRows(data);
  if (!report) throw new Error("Report status updated, but no report row was returned.");
  return toSafetyReportQueueItem(report);
}

export async function applyAdminReportTargetAction(input: {
  reportId: number;
  targetType: SafetyReportTargetType;
  targetId: string;
  action: "hidden" | "removed" | "clean";
  reason: string;
}): Promise<SafetyReportQueueItem> {
  const reason = normalizeText(input.reason);
  const targetId = normalizeText(input.targetId);
  if (!Number.isFinite(input.reportId) || input.reportId <= 0) {
    throw new Error("Select a report before applying a target action.");
  }
  if (!targetId) {
    throw new Error("Report target id is missing.");
  }
  if (!reason) {
    throw new Error("Add an action reason before applying report target moderation.");
  }

  const { data, error } = await reportsRpcClient.rpc("apply_admin_report_target_action", {
    p_action_type: input.action,
    p_reason: reason,
    p_report_id: input.reportId,
    p_target_id: targetId,
    p_target_type: input.targetType,
  });
  if (error) throw error;

  const [report] = parseReportRows(data);
  if (!report) throw new Error("Target action completed, but no report row was returned.");
  return toSafetyReportQueueItem(report);
}

export async function listAdminReportAuditEvents(reportId: number): Promise<PlatformAdminAuditLogRow[]> {
  if (!Number.isFinite(reportId) || reportId <= 0) return [];
  const { data, error } = await reportsRpcClient.rpc("list_admin_report_audit_events", {
    p_report_id: reportId,
  });
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  return rows
    .filter(isPlainObject)
    .map((row) => toAdminAuditLogRow(row))
    .filter((row): row is PlatformAdminAuditLogRow => !!row);
}

const toAuditTimestamp = (value: string | null) => {
  const parsed = Date.parse(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function readAdminAuditLog(options?: {
  limit?: number;
}): Promise<AdminAuditLogReadModel> {
  const limit = normalizePositiveLimit(options?.limit, 12, 50);
  const [roleRoster, safetyQueue] = await Promise.all([
    readPlatformRoleRoster({ limit, includeRevoked: true }).catch(() => null),
    readSafetyReportQueue({ limit }).catch(() => null),
  ]);

  const roleEntries = (roleRoster?.items ?? []).map((entry) => ({
    id: `role-${entry.id}`,
    kind: "platform_role_record" as const,
    occurredAt: entry.grantedAt,
    title: `${formatPlatformRoleToken(entry.role)} role record`,
    detail: [
      entry.identityLabel,
      entry.status === "active" ? "ACTIVE" : "REVOKED",
      entry.grantedBy ? `GRANTED BY ${entry.grantedBy}` : null,
      entry.notes ? entry.notes : null,
    ].filter(Boolean).join(" · "),
    actorLabel: entry.grantedBy,
    auditOwnerKey: null,
    tone: "default" as const,
  }));

  const safetyEntries = (safetyQueue?.items ?? []).map((entry) => ({
    id: `report-${entry.id}`,
    kind: "safety_report" as const,
    occurredAt: entry.createdAt,
    title: `Safety report · ${entry.targetLabel}`,
    detail: [
      entry.sourceSurface.replaceAll("-", " ").toUpperCase(),
      `REPORTER ${entry.reporterRole.replaceAll("_", " ").toUpperCase()}`,
      entry.reviewState.replaceAll("_", " ").toUpperCase(),
    ].join(" · "),
    actorLabel: entry.reporterAuditOwnerKey,
    auditOwnerKey: entry.targetAuditOwnerKey,
    tone: "review" as const,
  }));

  const items = [...roleEntries, ...safetyEntries]
    .sort((left, right) => toAuditTimestamp(right.occurredAt) - toAuditTimestamp(left.occurredAt))
    .slice(0, limit);

  return {
    generatedAt: new Date().toISOString(),
    items,
    summary: {
      totalItems: items.length,
      roleRecordCount: roleEntries.length,
      safetyReportCount: safetyEntries.length,
      platformOwnedTargetCount: safetyQueue?.summary.platformOwnedTargetCount ?? 0,
    },
  };
}

export async function submitSafetyReport(input: SafetyReportInput) {
  const { data: sessionData } = await supabase.auth.getSession();
  const reporterUserId = normalizeText(sessionData.session?.user?.id);
  const moderationAccess = getModerationAccess({
    userId: reporterUserId,
    email: sessionData.session?.user?.email ?? null,
  });

  if (!reporterUserId) {
    throw new Error("Sign in is required before you can send a safety report.");
  }

  const targetId = normalizeText(input.targetId);
  if (!targetId) {
    throw new Error("Missing report target.");
  }

  if (!SAFETY_REPORT_TARGET_TYPES.includes(input.targetType)) {
    throw new Error("This report target is not supported.");
  }

  if (!SAFETY_REPORT_CATEGORIES.includes(input.category)) {
    throw new Error("Choose a supported report category.");
  }

  const duplicateWindowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data: duplicateRows, error: duplicateError } = await supabase
    .from(SAFETY_REPORTS_TABLE)
    .select("id")
    .eq("reporter_user_id", reporterUserId)
    .eq("target_type", input.targetType)
    .eq("target_id", targetId)
    .eq("category", input.category)
    .gte("created_at", duplicateWindowStart)
    .in("status", ["needs_review", "reviewing", "escalated"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (!duplicateError && duplicateRows?.[0]?.id) {
    trackModerationActionUsed({
      surface: isPlainObject(input.context) ? String(input.context.sourceSurface ?? "unknown") : "unknown",
      action: "dedupe_safety_report",
      targetType: input.targetType,
      targetId,
      actorRole: moderationAccess.actorRole,
      roomId: normalizeText(input.roomId) || null,
      titleId: normalizeText(input.titleId) || null,
      sourceRoute: isPlainObject(input.context) ? String(input.context.sourceRoute ?? "") : "",
      targetAuditOwnerKey: isPlainObject(input.context) ? String(input.context.targetAuditOwnerKey ?? "") : "",
      platformOwnedTarget: isPlainObject(input.context) && input.context.platformOwnedTarget === true,
    });
    return duplicateRows[0];
  }

  const payloadContext: Record<string, unknown> = {
    reporterRole: moderationAccess.actorRole,
    reporterAuditOwnerKey: moderationAccess.auditOwnerKey,
    reporterPlatformOwned: moderationAccess.isPlatformOwned,
    reporterCanReviewSafetyReports: moderationAccess.canReviewSafetyReports,
    moderationReviewState: moderationAccess.canReviewSafetyReports ? "operator_visible" : "pending_review",
    ...(isPlainObject(input.context) ? input.context : {}),
  };

  const payload = {
    reporter_user_id: reporterUserId,
    target_type: input.targetType,
    target_id: targetId,
    category: input.category,
    note: normalizeText(input.note) || null,
    room_id: normalizeText(input.roomId) || null,
    title_id: normalizeText(input.titleId) || null,
    context: toJsonValue(payloadContext),
    created_at: new Date().toISOString(),
  } satisfies SafetyReportInsert;

  const { data, error } = await supabase
    .from(SAFETY_REPORTS_TABLE)
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;

  trackModerationActionUsed({
    surface: String(payloadContext.sourceSurface ?? "unknown"),
    action: "submit_safety_report",
    targetType: input.targetType,
    targetId,
    actorRole: moderationAccess.actorRole,
    roomId: payload.room_id,
    titleId: payload.title_id,
    sourceRoute: String(payloadContext.sourceRoute ?? ""),
    targetAuditOwnerKey: String(payloadContext.targetAuditOwnerKey ?? ""),
    platformOwnedTarget: payloadContext.platformOwnedTarget === true,
  });

  return data;
}
