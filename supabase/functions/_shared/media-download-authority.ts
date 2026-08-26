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
]);

export const creatorContentResolutionAllowed = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const resolution = value as Record<string, unknown>;
  return resolution.allowed === true
    && resolution.requiresPurchase === false
    && CREATOR_CONTENT_ALLOW_REASONS.has(String(resolution.reason ?? "").trim());
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
}) => (
  input.exactObjectScanClean
  && input.exactSourceScanClean
  && input.visibilityAllowed
  && (input.objectKind === "thumbnail" || input.contentAccessAllowed)
  && (input.objectKind !== "rendition" || input.renditionTierAllowed === true)
);

export const canIssueSocialAttachmentDownload = (input: {
  exactAttachmentScanClean: boolean;
  surfaceAuthorityAllowed: boolean;
}) => input.exactAttachmentScanClean && input.surfaceAuthorityAllowed;
