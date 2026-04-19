import type { Json, Tables, TablesInsert } from "../supabase/database.types";
import { trackEvent } from "./analytics";
import { getOfficialPlatformAccount } from "./officialAccounts";
import { isBetaOperatorIdentity } from "./runtimeConfig";
import { supabase } from "./supabase";

export const SAFETY_REPORTS_TABLE = "safety_reports";
export const PLATFORM_ROLE_MEMBERSHIPS_TABLE = "platform_role_memberships";

export type SafetyReportTargetType = "participant" | "room" | "title";
export type SafetyReportCategory = "abuse" | "harassment" | "impersonation" | "copyright" | "safety" | "other";
export type ModerationActorRole = "member" | "official_platform" | "operator";
export type PlatformRole = "operator" | "moderator";

export type ModerationAccess = {
  actorRole: ModerationActorRole;
  canAccessAdmin: boolean;
  canReviewSafetyReports: boolean;
  auditOwnerKey: string | null;
  isPlatformOwned: boolean;
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
  if (normalized === "operator" || normalized === "moderator") {
    return normalized;
  }
  return null;
};

const normalizeSafetyReportTargetType = (value: unknown): SafetyReportTargetType => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "room" || normalized === "title") {
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
      canAccessAdmin: isOperator,
      canReviewSafetyReports: isOperator,
      auditOwnerKey: officialAccount.auditOwnerKey,
      isPlatformOwned: true,
    };
  }

  if (isOperator) {
    return {
      actorRole: "operator",
      canAccessAdmin: true,
      canReviewSafetyReports: true,
      auditOwnerKey: userId ? `operator:${userId}` : email ? `operator:${email}` : "operator:allowlist",
      isPlatformOwned: false,
    };
  }

  return {
    actorRole: "member",
    canAccessAdmin: false,
    canReviewSafetyReports: false,
    auditOwnerKey: null,
    isPlatformOwned: false,
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

export async function readMyPlatformRoleMemberships() {
  const { data, error } = await supabase
    .from(PLATFORM_ROLE_MEMBERSHIPS_TABLE)
    .select("id,role,user_id,email,status,granted_at")
    .eq("status", "active")
    .order("granted_at", { ascending: false });

  if (error) throw error;

  return (data ?? [])
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
