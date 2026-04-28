import type { Json, Tables, TablesInsert } from "../supabase/database.types";
import { trackEvent } from "./analytics";
import { getOfficialPlatformAccount } from "./officialAccounts";
import { isBetaOperatorIdentity } from "./runtimeConfig";
import { supabase } from "./supabase";

export const SAFETY_REPORTS_TABLE = "safety_reports";
export const PLATFORM_ROLE_MEMBERSHIPS_TABLE = "platform_role_memberships";

export type SafetyReportTargetType = "participant" | "room" | "title" | "creator_video";
export type SafetyReportCategory = "abuse" | "harassment" | "impersonation" | "copyright" | "safety" | "other";
export type ModerationActorRole = "member" | "official_platform" | "operator" | "owner" | "moderator";
export type PlatformRole = "owner" | "operator" | "moderator";

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

export type SafetyReportRecord = {
  id: number;
  reporterUserId: string;
  targetType: SafetyReportTargetType;
  targetId: string;
  category: SafetyReportCategory;
  note: string | null;
  roomId: string | null;
  titleId: string | null;
  context: Record<string, unknown>;
  createdAt: string | null;
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

type SafetyReportInsert = TablesInsert<"safety_reports">;

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

const normalizePlatformRoleStatus = (value: unknown) => {
  const normalized = normalizeText(value).toLowerCase();
  return normalized === "revoked" ? "revoked" : "active";
};

const formatPlatformRoleToken = (role: PlatformRole) => role.replaceAll("_", " ").toUpperCase();

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

const normalizeSafetyReportTargetType = (value: unknown): SafetyReportTargetType => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "room" || normalized === "title" || normalized === "creator_video") {
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
  return "safety";
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
  return hasPlatformRoleMembership(memberships, ["owner", "operator", "moderator"]);
}

export function canManagePrivilegedAdminWrites(
  _moderationAccess: ModerationAccess,
  memberships: PlatformRoleMembership[],
) {
  return hasPlatformRoleMembership(memberships, ["owner", "operator"]);
}

const platformMembershipMatchesIdentity = (
  entry: { user_id?: unknown; email?: unknown },
  identity: { userId: string; email: string },
) => {
  const rowUserId = normalizeText(entry.user_id);
  const rowEmail = normalizeText(entry.email).toLowerCase();
  return (!!identity.userId && rowUserId === identity.userId) || (!!identity.email && rowEmail === identity.email);
};

export async function readMyPlatformRoleMemberships() {
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
      } satisfies PlatformRoleMembership;
    })
    .filter((entry): entry is PlatformRoleMembership => !!entry);
}

export async function readPlatformRoleRoster(options?: {
  limit?: number;
  includeRevoked?: boolean;
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
    .map((entry) => {
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
        grantedBy: normalizeText(entry.granted_by) || null,
        notes: normalizeText(entry.notes) || null,
        identityLabel: buildRoleIdentityLabel(entry),
      } satisfies PlatformRoleRosterEntry;
    })
    .filter((entry): entry is PlatformRoleRosterEntry => !!entry);

  const activeItems = items.filter((entry) => entry.status === "active");

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

export async function readSafetyReports(options?: {
  limit?: number;
}) {
  const limit = Number.isFinite(options?.limit) ? Math.max(1, Math.min(50, Math.floor(Number(options?.limit)))) : 8;
  const { data, error } = await supabase
    .from(SAFETY_REPORTS_TABLE)
    .select("id,reporter_user_id,target_type,target_id,category,note,room_id,title_id,context,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data ?? []).map((entry) => ({
    id: Number(entry.id ?? 0),
    reporterUserId: normalizeText(entry.reporter_user_id),
    targetType: normalizeSafetyReportTargetType(entry.target_type),
    targetId: normalizeText(entry.target_id),
    category: normalizeSafetyReportCategory(entry.category),
    note: normalizeText(entry.note) || null,
    roomId: normalizeText(entry.room_id) || null,
    titleId: normalizeText(entry.title_id) || null,
    context: isPlainObject(entry.context) ? entry.context : {},
    createdAt: normalizeText(entry.created_at) || null,
  })) satisfies SafetyReportRecord[];
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
    platformOwnedTargetCount: items.filter((item) => item.platformOwnedTarget).length,
    sourceSurfaces: Array.from(new Set(items.map((item) => item.sourceSurface))),
  };
}

export async function readSafetyReportQueue(options?: {
  limit?: number;
}): Promise<SafetyReportQueueReadModel> {
  const items = (await readSafetyReports(options)).map(toSafetyReportQueueItem);
  return {
    generatedAt: new Date().toISOString(),
    items,
    summary: summarizeSafetyReportQueue(items),
  };
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
