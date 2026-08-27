import type { CreatorVideoObjectKind } from "./creator-video-object-authority.ts";

export type CreatorVideoDownloadObjectKind = CreatorVideoObjectKind | "rendition";

const VISIBILITY_ALLOW_REASONS = new Set([
  "owner_allowed",
  "operator_allowed",
  "public_allowed",
  "circle_member_allowed",
  "subscriber_allowed",
]);

export const visibilityResolutionAllowed = (
  value: unknown,
  expected?: { ownerUserId: string; viewerUserId: string },
) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const resolution = value as Record<string, unknown>;
  const allowed = resolution.allowed === true
    && resolution.is_blocked !== true
    && typeof resolution.visibility === "string"
    && String(resolution.visibility).trim().length > 0
    && VISIBILITY_ALLOW_REASONS.has(String(resolution.reason ?? "").trim());
  if (!allowed || !expected) return allowed;
  return String(resolution.viewer_user_id ?? "").trim() === expected.viewerUserId.trim()
    && String(resolution.owner_user_id ?? "").trim() === expected.ownerUserId.trim();
};

const CREATOR_CONTENT_ALLOW_REASONS = new Set([
  "owner",
  "free_content",
  "purchase_grant",
  "active_grant",
  "sandbox_grant",
  "vip_active",
]);

export const creatorContentResolutionAllowed = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const resolution = value as Record<string, unknown>;
  return resolution.allowed === true
    && resolution.requiresPurchase === false
    && CREATOR_CONTENT_ALLOW_REASONS.has(String(resolution.reason ?? "").trim());
};

export const creatorVideoParentResolutionAllowed = (input: {
  sourceAccessResolution: unknown;
  requestedSourceId: string;
  parent: {
    id?: unknown;
    owner_id?: unknown;
    moderation_status?: unknown;
    scan_status?: unknown;
    quarantined_at?: unknown;
  } | null;
}) => {
  if (!creatorContentResolutionAllowed(input.sourceAccessResolution) || !input.parent) return false;
  const requestedSourceId = String(input.requestedSourceId ?? "").trim();
  const parentId = String(input.parent.id ?? "").trim();
  const parentOwnerId = String(input.parent.owner_id ?? "").trim();
  if (!requestedSourceId || parentId !== requestedSourceId || !parentOwnerId) return false;
  if (input.parent.quarantined_at != null && String(input.parent.quarantined_at).trim()) return false;
  if (String(input.parent.scan_status ?? "").trim().toLowerCase() !== "clean") return false;
  if (!["clean", "reported"].includes(String(input.parent.moderation_status ?? "").trim().toLowerCase())) {
    return false;
  }
  const resolution = input.sourceAccessResolution as Record<string, unknown>;
  const resolvedCreatorId = String(resolution.creatorId ?? "").trim();
  return !resolvedCreatorId || resolvedCreatorId === parentOwnerId;
};

export const isCrossOwnerCreatorContentStaffAccess = (input: {
  sourceAccessResolution: unknown;
  viewerUserId: string;
  parentOwnerId: string;
}) => {
  if (!creatorContentResolutionAllowed(input.sourceAccessResolution)) return false;
  const resolution = input.sourceAccessResolution as Record<string, unknown>;
  return String(resolution.reason ?? "").trim() === "owner"
    && !!input.viewerUserId.trim()
    && !!input.parentOwnerId.trim()
    && input.viewerUserId.trim() !== input.parentOwnerId.trim();
};

export const canDeliverExternalMediaObject = (input: {
  exactAuditedLegacyProvenance: boolean;
  reservationAttachedAt?: string | null;
  reservationAttachedRecordId?: string | null;
  reservationStatus?: string | null;
  reservationVerifiedAt?: string | null;
  requestedRecordId: string;
}) => {
  if (input.exactAuditedLegacyProvenance) return true;
  const requestedRecordId = input.requestedRecordId.trim();
  return requestedRecordId.length > 0
    && input.reservationStatus === "verified"
    && !!String(input.reservationVerifiedAt ?? "").trim()
    && !!String(input.reservationAttachedAt ?? "").trim()
    && String(input.reservationAttachedRecordId ?? "").trim() === requestedRecordId;
};

export const canIssueCreatorVideoDownload = (input: {
  objectKind: CreatorVideoDownloadObjectKind;
  exactObjectScanClean: boolean;
  exactSourceScanClean: boolean;
  visibilityAllowed: boolean;
  contentAccessAllowed: boolean;
  renditionTierAllowed?: boolean;
  scopedStaffAllowed?: boolean;
}) => (
  input.exactObjectScanClean
  && input.exactSourceScanClean
  && input.visibilityAllowed
  && (
    input.objectKind === "thumbnail"
    || input.contentAccessAllowed
    || input.scopedStaffAllowed === true
  )
  && (
    input.objectKind !== "rendition"
    || input.renditionTierAllowed === true
    || input.scopedStaffAllowed === true
  )
);

export const canIssueSocialAttachmentDownload = (input: {
  exactAttachmentScanClean: boolean;
  exactAttachmentNotQuarantined: boolean;
  surfaceAuthorityAllowed: boolean;
}) => input.exactAttachmentScanClean
  && input.exactAttachmentNotQuarantined
  && input.surfaceAuthorityAllowed;
