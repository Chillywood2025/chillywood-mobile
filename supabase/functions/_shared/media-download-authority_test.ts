import {
  canDeliverExternalMediaObject,
  canIssueCreatorVideoDownload,
  canIssueSocialAttachmentDownload,
  creatorContentResolutionAllowed,
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

  for (const reason of ["owner", "free_content", "purchase_grant", "active_grant", "sandbox_grant"]) {
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
    allowed: true,
    reason: "purchase_grant",
    requiresPurchase: true,
  }), false, "contradictory purchase flag");
});

Deno.test("social attachment signing rechecks current surface authority", () => {
  assertEquals(canIssueSocialAttachmentDownload({
    exactAttachmentScanClean: true,
    surfaceAuthorityAllowed: true,
  }), true, "current visible surface");
  assertEquals(canIssueSocialAttachmentDownload({
    exactAttachmentScanClean: true,
    surfaceAuthorityAllowed: false,
  }), false, "block or visibility change after cached key");
  assertEquals(canIssueSocialAttachmentDownload({
    exactAttachmentScanClean: false,
    surfaceAuthorityAllowed: true,
  }), false, "surface authority cannot replace exact scan proof");
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
