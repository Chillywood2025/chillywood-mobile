import {
  canDeliverExternalMediaObject,
  canIssueCreatorVideoDownload,
  canIssueSocialAttachmentDownload,
  creatorContentResolutionAllowed,
  creatorVideoParentResolutionAllowed,
  isCrossOwnerCreatorContentStaffAccess,
  visibilityResolutionAllowed,
} from "./media-download-authority.ts";

const assertEquals = (actual: unknown, expected: unknown, label: string) => {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
};

Deno.test("creator source and renditions require exact scan, visibility, and paid access", () => {
  const base = {
    contentAccessAllowed: true,
    exactObjectScanClean: true,
    exactSourceScanClean: true,
    visibilityAllowed: true,
  };
  assertEquals(canIssueCreatorVideoDownload({ ...base, objectKind: "source" }), true, "source allowed");
  assertEquals(canIssueCreatorVideoDownload({ ...base, objectKind: "source", contentAccessAllowed: false }), false, "purchase revoked");
  assertEquals(canIssueCreatorVideoDownload({ ...base, objectKind: "source", exactSourceScanClean: false }), false, "source scan missing");
  assertEquals(canIssueCreatorVideoDownload({ ...base, objectKind: "rendition", renditionTierAllowed: true }), true, "rendition allowed");
  assertEquals(canIssueCreatorVideoDownload({ ...base, objectKind: "rendition", renditionTierAllowed: false }), false, "rendition tier denied");
});

Deno.test("creator rendition review requires an exact scoped staff alternative", () => {
  const base = {
    contentAccessAllowed: false,
    exactObjectScanClean: true,
    exactSourceScanClean: true,
    objectKind: "rendition" as const,
    renditionTierAllowed: false,
    visibilityAllowed: true,
  };
  assertEquals(
    canIssueCreatorVideoDownload({ ...base, scopedStaffAllowed: true }),
    true,
    "scoped moderator may inspect an exact safe rendition",
  );
  assertEquals(
    canIssueCreatorVideoDownload({ ...base, scopedStaffAllowed: false }),
    false,
    "unscoped caller cannot replace commerce authority",
  );
  assertEquals(
    canIssueCreatorVideoDownload({ ...base, scopedStaffAllowed: true, exactObjectScanClean: false }),
    false,
    "staff scope cannot replace rendition scan proof",
  );
  assertEquals(
    canIssueCreatorVideoDownload({ ...base, scopedStaffAllowed: true, visibilityAllowed: false }),
    false,
    "staff scope cannot replace current visibility authority",
  );
});

Deno.test("thumbnail scan is independent and does not inherit source authority", () => {
  const base = {
    contentAccessAllowed: false,
    exactObjectScanClean: true,
    exactSourceScanClean: true,
    objectKind: "thumbnail" as const,
    visibilityAllowed: true,
  };
  assertEquals(canIssueCreatorVideoDownload(base), true, "public clean cover may be shown without purchase");
  assertEquals(canIssueCreatorVideoDownload({ ...base, exactObjectScanClean: false }), false, "source clean cannot authorize cover");
  assertEquals(canIssueCreatorVideoDownload({ ...base, exactSourceScanClean: false }), false, "cover clean cannot authorize unsafe source row");
  assertEquals(canIssueCreatorVideoDownload({ ...base, visibilityAllowed: false }), false, "block or visibility revocation denies cover");
});

Deno.test("authority resolver responses fail closed", () => {
  assertEquals(visibilityResolutionAllowed({
    allowed: true,
    reason: "public_allowed",
    visibility: "public",
    is_blocked: false,
  }), true, "recognized visibility allow");
  assertEquals(visibilityResolutionAllowed({ allowed: true }), false, "bare visibility allow");
  assertEquals(visibilityResolutionAllowed({
    allowed: "true",
    reason: "public_allowed",
  }), false, "string visibility claim");
  assertEquals(visibilityResolutionAllowed({ reason: "timeout" }), false, "missing visibility allow");
  assertEquals(visibilityResolutionAllowed(null), false, "missing visibility response");
  const exactVisibility = {
    allowed: true,
    reason: "public_allowed",
    visibility: "public",
    is_blocked: false,
    owner_user_id: "owner-1",
    viewer_user_id: "viewer-1",
  };
  assertEquals(visibilityResolutionAllowed(exactVisibility, {
    ownerUserId: "owner-1",
    viewerUserId: "viewer-1",
  }), true, "exact viewer and owner visibility binding");
  assertEquals(visibilityResolutionAllowed(exactVisibility, {
    ownerUserId: "owner-1",
    viewerUserId: "viewer-2",
  }), false, "wrong viewer visibility binding");
  assertEquals(visibilityResolutionAllowed({ ...exactVisibility, is_blocked: true }, {
    ownerUserId: "owner-1",
    viewerUserId: "viewer-1",
  }), false, "blocked visibility cannot allow");

  for (const reason of ["owner", "free_content", "purchase_grant", "active_grant", "sandbox_grant", "vip_active"]) {
    assertEquals(creatorContentResolutionAllowed({
      allowed: true,
      reason,
      requiresPurchase: false,
    }), true, `recognized creator-content reason ${reason}`);
  }
  assertEquals(creatorContentResolutionAllowed({ allowed: true }), false, "bare allow");
  assertEquals(creatorContentResolutionAllowed({
    allowed: true,
    reason: "purchase_required",
    requiresPurchase: false,
  }), false, "unrecognized reason");
  assertEquals(creatorContentResolutionAllowed({
    allowed: false,
    reason: "vip_required",
    requiresPurchase: true,
  }), false, "missing creator VIP authority");
  assertEquals(creatorContentResolutionAllowed({
    allowed: true,
    reason: "vip_required",
    requiresPurchase: false,
  }), false, "VIP-required denial reason cannot be upgraded by an allow flag");
  assertEquals(creatorContentResolutionAllowed({
    allowed: true,
    reason: "vip_active",
    requiresPurchase: true,
  }), false, "contradictory VIP purchase flag");
  assertEquals(creatorContentResolutionAllowed({
    allowed: true,
    reason: "purchase_grant",
    requiresPurchase: true,
  }), false, "contradictory purchase flag");
});

Deno.test("social attachment signing rechecks current surface authority", () => {
  assertEquals(canIssueSocialAttachmentDownload({
    exactAttachmentScanClean: true,
    exactAttachmentNotQuarantined: true,
    surfaceAuthorityAllowed: true,
  }), true, "current visible surface");
  assertEquals(canIssueSocialAttachmentDownload({
    exactAttachmentScanClean: true,
    exactAttachmentNotQuarantined: true,
    surfaceAuthorityAllowed: false,
  }), false, "block or visibility change after cached key");
  assertEquals(canIssueSocialAttachmentDownload({
    exactAttachmentScanClean: false,
    exactAttachmentNotQuarantined: true,
    surfaceAuthorityAllowed: true,
  }), false, "surface authority cannot replace exact scan proof");
  assertEquals(canIssueSocialAttachmentDownload({
    exactAttachmentScanClean: true,
    exactAttachmentNotQuarantined: false,
    surfaceAuthorityAllowed: true,
  }), false, "an owner cannot bypass attachment quarantine with current parent authority");
});

Deno.test("Premium creator-video metadata requires a current safe exact parent", () => {
  const sourceId = "8f921fcc-1d55-4b14-8fe4-cf929c9fd827";
  const ownerId = "24d93cc2-408f-4a43-8dd0-267f2f08fa8e";
  const parent = {
    id: sourceId,
    owner_id: ownerId,
    moderation_status: "clean",
    scan_status: "clean",
    quarantined_at: null,
  };
  const ownerAccess = { allowed: true, reason: "owner", requiresPurchase: false };
  const premiumViewerAccess = { allowed: true, reason: "free_content", requiresPurchase: false };
  assertEquals(creatorVideoParentResolutionAllowed({
    sourceAccessResolution: ownerAccess,
    requestedSourceId: sourceId,
    parent,
  }), true, "safe exact owner parent");
  assertEquals(creatorVideoParentResolutionAllowed({
    sourceAccessResolution: premiumViewerAccess,
    requestedSourceId: sourceId,
    parent,
  }), true, "safe exact Premium viewer parent");
  assertEquals(creatorVideoParentResolutionAllowed({
    sourceAccessResolution: ownerAccess,
    requestedSourceId: sourceId,
    parent: { ...parent, quarantined_at: "2026-08-27T12:00:00Z" },
  }), false, "owner cannot bypass parent quarantine");
  assertEquals(creatorVideoParentResolutionAllowed({
    sourceAccessResolution: premiumViewerAccess,
    requestedSourceId: sourceId,
    parent: { ...parent, scan_status: "pending_scan" },
  }), false, "Premium cannot bypass an unresolved parent scan");
  assertEquals(creatorVideoParentResolutionAllowed({
    sourceAccessResolution: ownerAccess,
    requestedSourceId: sourceId,
    parent: { ...parent, moderation_status: "blocked" },
  }), false, "owner cannot bypass parent moderation");
  assertEquals(creatorVideoParentResolutionAllowed({
    sourceAccessResolution: premiumViewerAccess,
    requestedSourceId: sourceId,
    parent: { ...parent, id: "1317d4e8-52c2-4878-a60f-ff5895c89807" },
  }), false, "neighboring parent cannot authorize a rendition");
  assertEquals(creatorVideoParentResolutionAllowed({
    sourceAccessResolution: { ...premiumViewerAccess, creatorId: "1317d4e8-52c2-4878-a60f-ff5895c89807" },
    requestedSourceId: sourceId,
    parent,
  }), false, "creator-bound resolution cannot cross parent owners");
  assertEquals(isCrossOwnerCreatorContentStaffAccess({
    sourceAccessResolution: ownerAccess,
    viewerUserId: "1317d4e8-52c2-4878-a60f-ff5895c89807",
    parentOwnerId: ownerId,
  }), true, "cross-owner privileged access is recognized for mandatory audit");
  assertEquals(isCrossOwnerCreatorContentStaffAccess({
    sourceAccessResolution: ownerAccess,
    viewerUserId: ownerId,
    parentOwnerId: ownerId,
  }), false, "creator ownership is not mislabeled as staff access");
});

Deno.test("external delivery requires an attached verified reservation or exact migration receipt", () => {
  const base = {
    exactAuditedLegacyProvenance: false,
    requestedRecordId: "video-1",
    reservationAttachedAt: "2026-08-25T12:00:00.000Z",
    reservationAttachedRecordId: "video-1",
    reservationStatus: "verified",
    reservationVerifiedAt: "2026-08-25T11:59:00.000Z",
  };
  assertEquals(canDeliverExternalMediaObject(base), true, "exact attached verified reservation");
  assertEquals(canDeliverExternalMediaObject({ ...base, reservationStatus: "deleted" }), false, "revoked before physical delete");
  assertEquals(canDeliverExternalMediaObject({ ...base, reservationAttachedRecordId: "video-2" }), false, "wrong attached row");
  assertEquals(canDeliverExternalMediaObject({ ...base, reservationAttachedAt: null }), false, "unattached reservation");
  assertEquals(canDeliverExternalMediaObject({
    exactAuditedLegacyProvenance: true,
    requestedRecordId: "video-1",
  }), true, "exact active migrated legacy receipt");
});
