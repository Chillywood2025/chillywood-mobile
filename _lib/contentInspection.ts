import "react-native-get-random-values";
import { captureAccountBoundSupabaseMutationSubject, invokeAccountBoundSupabaseMutationRpc } from "./accountBoundSupabaseMutation";
import { sameAccountSessionAuthority, type AccountSessionAuthorityBinding } from "./accountSessionAuthority";

export const INSPECTION_TARGET_TYPES = ["profile_post", "profile_post_comment", "creator_video_comment", "chat_message", "room_message", "creator_video", "social_attachment"] as const;
export type InspectionTargetType = typeof INSPECTION_TARGET_TYPES[number];
export type InspectionTarget = { targetType: InspectionTargetType; targetId: string };
export type InspectionContext = { contextId: string; purpose: string; status: string; createdAt: string };
export type InspectionCursor = { createdAt: string; id: string };
export type InspectionContexts = { contexts: InspectionContext[]; hasMore: boolean; nextCursor: InspectionCursor | null; canCreateContext: boolean; canDelegate: boolean; canBrowseUsers: boolean; accessAuditMode: "owner_view_exempt" | "staff_view_logged" };
export type InspectionSubjectTargets = {
  subjectUserId: string; targetType: InspectionTargetType;
  targets: (InspectionTarget & { createdAt: string; label: string })[];
  hasMore: boolean; nextCursor: InspectionCursor | null;
};
export type InspectionGrant = InspectionTarget & { grantId: string; granteeUserId: string; expiresAt: string; revokedAt: string | null; revision: number };
export type InspectionScope = { targets: InspectionTarget[]; grants: InspectionGrant[]; grantsHasMore: boolean };
export type InspectionContent = InspectionTarget & {
  contextId: string; availability: "available" | "available_deleted" | "unavailable_current" | "media_only";
  storedVersion: string | null; sourceUpdatedAt: string | null;
  content: { body: string } | { title: string | null; description: string | null } | null;
  deletedRetentionAvailability: "not_implemented" | "available" | "unavailable";
  deletedAt?: string | null; retentionExpiresAt?: string | null; retainedMediaAvailability?: "unsupported" | "prepare_required";
  mediaAvailability: "unsupported_media_inspection" | "prepare_required"; restrictionLabels: string[];
};
export type InspectionErrorCode = "disabled" | "denied" | "invalid" | "account_changed" | "unavailable";
export class ContentInspectionError extends Error {
  constructor(readonly code: InspectionErrorCode) {
    super({ disabled: "Content inspection is disabled. Separate activation approval is required.", denied: "Access denied. Your role, context or scoped grant is no longer valid.", invalid: "Check the exact IDs, reason and expiry before continuing.", account_changed: "Your session changed. Reopen inspection to continue.", unavailable: "The request could not be verified. Refresh the scope before retrying any change." }[code]);
  }
}
export const isInspectionUuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const isInspectionReason = (value: string) => value.trim().length >= 6 && value.trim().length <= 500;
function requestId() {
  const bytes = new Uint8Array(16); globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 15) | 64; bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function valid(condition: unknown): asserts condition { if (!condition) throw new ContentInspectionError("invalid"); }
function targetArgs(target: InspectionTarget) {
  valid(INSPECTION_TARGET_TYPES.includes(target.targetType) && isInspectionUuid(target.targetId));
  return { p_target_type: target.targetType, p_target_id: target.targetId };
}
function contextArgs(contextId: string, reason: string) {
  valid(isInspectionUuid(contextId) && isInspectionReason(reason));
  return { p_context_id: contextId, p_reason: reason.trim() };
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const nullableText = (value: unknown) => value === null || typeof value === "string";
const uuid = (value: unknown) => typeof value === "string" && isInspectionUuid(value);
const targetShape = (value: unknown) => record(value) && INSPECTION_TARGET_TYPES.includes(value.targetType as InspectionTargetType) && uuid(value.targetId);
function contentBodyMatches(value: Record<string, unknown>) {
  if (value.targetType === "social_attachment") return value.content === null;
  if (!record(value.content)) return false;
  if (value.targetType === "creator_video") return nullableText(value.content.title) && nullableText(value.content.description) && !("body" in value.content);
  return typeof value.content.body === "string" && !("title" in value.content) && !("description" in value.content);
}
export function isInspectionContentResponse(value: unknown): value is InspectionContent {
  if (!record(value) || !targetShape(value) || !uuid(value.contextId)
    || !["available", "available_deleted", "unavailable_current", "media_only"].includes(String(value.availability))
    || !nullableText(value.storedVersion) || !nullableText(value.sourceUpdatedAt)
    || !["not_implemented", "available", "unavailable"].includes(String(value.deletedRetentionAvailability))
    || !["unsupported_media_inspection", "prepare_required"].includes(String(value.mediaAvailability))
    || (value.retainedMediaAvailability !== undefined && !["unsupported", "prepare_required"].includes(String(value.retainedMediaAvailability)))
    || !Array.isArray(value.restrictionLabels) || !value.restrictionLabels.every(label => typeof label === "string")) return false;
  if (value.availability === "available_deleted") {
    const mediaPrepared = value.mediaAvailability === "prepare_required";
    if (mediaPrepared !== (value.retainedMediaAvailability === "prepare_required")
      || (mediaPrepared && !["creator_video", "social_attachment"].includes(String(value.targetType)))) return false;
    const deleted = typeof value.deletedAt === "string" ? Date.parse(value.deletedAt) : NaN;
    const expires = typeof value.retentionExpiresAt === "string" ? Date.parse(value.retentionExpiresAt) : NaN;
    return value.deletedRetentionAvailability === "available" && Number.isFinite(deleted) && Number.isFinite(expires)
      && deleted <= Date.now() && expires > Date.now() && expires - deleted === 30 * 86400000 && contentBodyMatches(value);
  }
  if (value.deletedRetentionAvailability === "available" || value.deletedAt != null || value.retentionExpiresAt != null
    || value.mediaAvailability === "prepare_required" || value.retainedMediaAvailability === "prepare_required") return false;
  if (value.availability === "available") return value.targetType !== "social_attachment" && contentBodyMatches(value);
  return value.content === null && (value.availability !== "media_only" || value.targetType === "social_attachment");
}
function responseIsValid(name: string, value: unknown): boolean {
  if (!record(value)) return false;
  if (name === "admin_list_content_inspection_contexts") return Array.isArray(value.contexts) && value.contexts.length <= 50
    && value.contexts.every(row => record(row) && uuid(row.contextId) && typeof row.purpose === "string" && ["open", "closed"].includes(String(row.status)) && typeof row.createdAt === "string")
    && typeof value.canCreateContext === "boolean" && typeof value.canDelegate === "boolean" && typeof value.hasMore === "boolean"
    && typeof value.canBrowseUsers === "boolean"
    && ["owner_view_exempt", "staff_view_logged"].includes(String(value.accessAuditMode))
    && (value.nextCursor === null ? !value.hasMore : record(value.nextCursor) && typeof value.nextCursor.createdAt === "string" && uuid(value.nextCursor.id));
  if (name === "admin_list_content_inspection_scope") return Array.isArray(value.targets) && value.targets.length <= 50 && value.targets.every(targetShape)
    && typeof value.grantsHasMore === "boolean" && Array.isArray(value.grants) && value.grants.every(row => targetShape(row) && record(row) && uuid(row.grantId) && uuid(row.granteeUserId) && typeof row.expiresAt === "string" && Number.isFinite(Date.parse(row.expiresAt)) && nullableText(row.revokedAt) && typeof row.revision === "number");
  if (name === "admin_list_content_inspection_subject_targets") return uuid(value.subjectUserId)
    && Array.isArray(value.targets) && value.targets.length <= 50 && value.targets.every(row => targetShape(row) && record(row) && typeof row.createdAt === "string" && typeof row.label === "string")
    && typeof value.hasMore === "boolean"
    && (value.nextCursor === null ? !value.hasMore : record(value.nextCursor) && typeof value.nextCursor.createdAt === "string" && uuid(value.nextCursor.id));
  if (name === "admin_read_content_inspection") return isInspectionContentResponse(value);
  if (name === "admin_create_content_inspection_context") return uuid(value.contextId);
  if (name === "admin_close_content_inspection_context") return uuid(value.contextId) && value.status === "closed";
  if (name === "admin_grant_content_inspection_access") return uuid(value.grantId);
  if (name === "admin_revoke_content_inspection_access") return uuid(value.grantId) && value.revoked === true;
  return false;
}
// Freeze the initiating token, and verify the complete generation, not only user ID.
// Never retry automatically: a transport failure may follow a committed grant.
async function rpc<T>(authority: AccountSessionAuthorityBinding, name: string, args: Record<string, unknown>): Promise<T> {
  try {
    const subject = await captureAccountBoundSupabaseMutationSubject(authority.userId);
    if (authority.restoreOnly || !sameAccountSessionAuthority(authority, subject.authority)) throw new ContentInspectionError("account_changed");
    const result = await invokeAccountBoundSupabaseMutationRpc<T>(subject, name, { ...args, p_request_id: requestId() });
    if (result.error) {
      const message = result.error.message ?? "";
      throw new ContentInspectionError(message.includes("content_inspection_disabled") ? "disabled" : result.error.code === "42501" ? "denied" : result.error.code === "22023" ? "invalid" : "unavailable");
    }
    if (!result.data || !responseIsValid(name, result.data)) throw new ContentInspectionError("unavailable");
    return result.data;
  } catch (error) {
    if (error instanceof ContentInspectionError) throw error;
    throw new ContentInspectionError(error && typeof error === "object" && "code" in error && error.code === "account_changed" ? "account_changed" : "unavailable");
  }
}
export const contentInspection = {
  async listSubjectTargets(authority: AccountSessionAuthorityBinding, subjectUserId: string, targetType: InspectionTargetType, reason: string, cursor: InspectionCursor | null = null) {
    valid(isInspectionUuid(subjectUserId) && INSPECTION_TARGET_TYPES.includes(targetType) && isInspectionReason(reason));
    const result = await rpc<Omit<InspectionSubjectTargets, "targetType">>(authority, "admin_list_content_inspection_subject_targets", { p_subject_user_id: subjectUserId, p_target_type: targetType, p_reason: reason.trim(), p_before: cursor?.createdAt ?? null, p_before_id: cursor?.id ?? null });
    if (result.subjectUserId !== subjectUserId || result.targets.some(item => item.targetType !== targetType)) throw new ContentInspectionError("unavailable");
    return { ...result, targetType };
  },
  listContexts(authority: AccountSessionAuthorityBinding, reason: string, cursor: InspectionCursor | null = null) {
    valid(isInspectionReason(reason));
    return rpc<InspectionContexts>(authority, "admin_list_content_inspection_contexts", { p_reason: reason.trim(), p_before: cursor?.createdAt ?? null, p_before_id: cursor?.id ?? null });
  },
  createContext(authority: AccountSessionAuthorityBinding, purpose: string, target: InspectionTarget) {
    valid(isInspectionReason(purpose)); targetArgs(target);
    return rpc<{ contextId: string }>(authority, "admin_create_content_inspection_context", { p_purpose: purpose.trim(), p_targets: [{ targetType: target.targetType, targetId: target.targetId }] });
  },
  scope(authority: AccountSessionAuthorityBinding, contextId: string, reason: string) {
    return rpc<InspectionScope>(authority, "admin_list_content_inspection_scope", contextArgs(contextId, reason));
  },
  async read(authority: AccountSessionAuthorityBinding, contextId: string, target: InspectionTarget, reason: string) {
    const value = await rpc<InspectionContent>(authority, "admin_read_content_inspection", { ...contextArgs(contextId, reason), ...targetArgs(target) });
    if (value.contextId !== contextId || value.targetType !== target.targetType || value.targetId !== target.targetId) throw new ContentInspectionError("unavailable");
    return value;
  },
  grant(authority: AccountSessionAuthorityBinding, contextId: string, target: InspectionTarget, granteeUserId: string, expiresAt: string, reason: string) {
    const duration = Date.parse(expiresAt) - Date.now();
    valid(isInspectionUuid(granteeUserId) && /(?:Z|[+-]\d{2}:\d{2})$/.test(expiresAt) && duration > 0 && duration <= 24 * 60 * 60 * 1000);
    return rpc<{ grantId: string }>(authority, "admin_grant_content_inspection_access", { ...contextArgs(contextId, reason), ...targetArgs(target), p_grantee_user_id: granteeUserId, p_expires_at: expiresAt });
  },
  revoke(authority: AccountSessionAuthorityBinding, grantId: string, reason: string) {
    valid(isInspectionUuid(grantId) && isInspectionReason(reason));
    return rpc<{ grantId: string; revoked: boolean }>(authority, "admin_revoke_content_inspection_access", { p_grant_id: grantId, p_reason: reason.trim() });
  },
  closeContext(authority: AccountSessionAuthorityBinding, contextId: string, reason: string) {
    return rpc<{ contextId: string; status: "closed" }>(authority, "admin_close_content_inspection_context", contextArgs(contextId, reason));
  },
};
