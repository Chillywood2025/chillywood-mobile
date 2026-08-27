import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const premiumIssuer = fs.readFileSync(
  "supabase/functions/premium-media-playback-token/index.ts",
  "utf8",
);
const mediaStorage = fs.readFileSync("supabase/functions/media-storage/index.ts", "utf8");

const between = (source, start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0 && endIndex > startIndex, `missing source slice ${start} -> ${end}`);
  return source.slice(startIndex, endIndex);
};

test("Premium rendition metadata is parent-safe and exactly bound before disclosure", () => {
  const handler = premiumIssuer.slice(premiumIssuer.indexOf("Deno.serve(async (req) =>"));
  const sourceAuthority = handler.indexOf('"resolve_creator_content_access"');
  const parentSafety = handler.indexOf("await readCreatorVideoParent(adminClient, sourceId)");
  const scopedStaffGate = handler.indexOf("await hasScopedCrossOwnerPlaybackAuthority(actorClient)");
  const staffAudit = handler.indexOf('from("platform_admin_audit_logs").insert');
  const renditionRead = handler.indexOf("await readPremiumRendition(adminClient, payload, parent)");
  assert.ok(sourceAuthority >= 0 && parentSafety > sourceAuthority);
  assert.ok(scopedStaffGate > parentSafety && scopedStaffGate < renditionRead);
  assert.ok(staffAudit > parentSafety && staffAudit < renditionRead);
  assert.ok(renditionRead > parentSafety);

  const parentReader = between(
    premiumIssuer,
    "const readCreatorVideoParent = async",
    "const readPremiumRendition = async",
  );
  assert.match(parentReader, /select\("id,owner_id,moderation_status,scan_status,quarantined_at"\)/u);
  assert.doesNotMatch(parentReader, /playback_url|storage_(?:path|object_key)|protected_playback_path/u);

  const renditionValidator = between(
    premiumIssuer,
    "const validateRenditionRow = (",
    "const readCreatorVideoParent = async",
  );
  assert.match(renditionValidator, /row\.video_id[^\n]+sourceId/u);
  assert.match(renditionValidator, /row\.creator_id[^\n]+parent\.owner_id/u);
});

test("Premium cross-owner playback requires scoped permission and rechecks it before signing", () => {
  const permissionHelper = between(
    premiumIssuer,
    "const hasScopedCrossOwnerPlaybackAuthority = async",
    "const normalizeTtlSeconds =",
  );
  assert.match(permissionHelper, /has_platform_permission/u);
  assert.match(permissionHelper, /content_moderation/u);
  assert.match(permissionHelper, /reports_review/u);
  assert.match(permissionHelper, /moderation\.error \|\| reports\.error/u);

  const handler = premiumIssuer.slice(premiumIssuer.indexOf("Deno.serve(async (req) =>"));
  const firstScopeGate = handler.indexOf("await hasScopedCrossOwnerPlaybackAuthority(actorClient)");
  const protectedRenditionRead = handler.indexOf("await readPremiumRendition(adminClient, payload, parent)");
  const permissionRecheck = handler.lastIndexOf("await hasScopedCrossOwnerPlaybackAuthority(actorClient)");
  const exactRenditionReread = handler.indexOf("await rereadExactPremiumRendition(");
  assert.ok(firstScopeGate > 0 && firstScopeGate < protectedRenditionRead);
  assert.ok(permissionRecheck > protectedRenditionRead && permissionRecheck < exactRenditionReread);
  assert.match(handler, /scoped_staff_permission_required/u);
});

test("Premium parent safety and exact binding are rechecked before token signing", () => {
  const handler = premiumIssuer.slice(premiumIssuer.indexOf("Deno.serve(async (req) =>"));
  const renditionRead = handler.indexOf("await readPremiumRendition(adminClient, payload, parent)");
  const parentRecheck = handler.indexOf("readCreatorVideoParent(adminClient, sourceId)", renditionRead);
  const parentGateRecheck = handler.indexOf("creatorVideoParentResolutionAllowed({", parentRecheck);
  const renditionRecheck = handler.indexOf("await rereadExactPremiumRendition(", parentRecheck);
  const freshRow = handler.indexOf("const latestRow = latestRenditionRead.row", renditionRecheck);
  const signing = handler.indexOf("await signPremiumCdnToken");
  assert.ok(parentRecheck > renditionRead);
  assert.ok(parentGateRecheck > parentRecheck && parentGateRecheck < signing);
  assert.ok(renditionRecheck > parentGateRecheck && renditionRecheck < signing);
  assert.ok(freshRow > renditionRecheck && freshRow < signing);
  const signingPhase = handler.slice(freshRow, signing);
  assert.match(signingPhase, /latestRow\.protected_playback_path \|\| latestRow\.manifest_path/u);
  assert.match(signingPhase, /sourceId: toText\(latestRow\.source_id\)/u);
  assert.doesNotMatch(signingPhase, /sourceId: toText\(row\.source_id\)/u);
});

test("the exact rendition re-read rejects every mutable safety and binding race", () => {
  const reread = between(
    premiumIssuer,
    "const rereadExactPremiumRendition = async",
    "Deno.serve(async (req) =>",
  );
  for (const exactBinding of [
    '.eq("id", renditionId)',
    '.eq("source_type", "creator_video")',
    '.eq("source_id", parent.id)',
    '.eq("video_id", parent.id)',
    '.eq("creator_id", parent.owner_id)',
  ]) assert.ok(reread.includes(exactBinding), `missing exact re-read binding ${exactBinding}`);
  assert.match(reread, /validateRenditionRow\(row, requestedPath, parent\) !== null/u);
  for (const mutableSafetyField of [
    '"scan_status"',
    '"moderation_status"',
    '"is_ready"',
    '"is_public_playback_safe"',
    '"is_protected_playback_safe"',
    '"protected_playback_path"',
    '"manifest_path"',
  ]) assert.ok(reread.includes(mutableSafetyField), `missing fresh safety field ${mutableSafetyField}`);
});

test("ordinary social-attachment owners cannot bypass scan or quarantine", () => {
  const reader = between(
    mediaStorage,
    "const readSocialAttachmentForObject = async",
    "const canReadSocialAttachmentSurface = async",
  );
  assert.match(reader, /scan_status,quarantined_at,deleted_at/u);

  const gate = between(
    mediaStorage,
    "const canReadSocialAttachment = async",
    "const canDeleteSocialAttachment = async",
  );
  const scanGate = gate.indexOf("if (!exactAttachmentScanClean || !exactAttachmentNotQuarantined)");
  const ownerShortcut = gate.indexOf("if (ownerUserId === user.id)");
  const parentCheck = gate.indexOf("return canReadSocialAttachmentSurface", ownerShortcut);
  assert.ok(scanGate >= 0 && ownerShortcut > scanGate && parentCheck > ownerShortcut);
  const unsafeBranch = gate.slice(scanGate, ownerShortcut);
  assert.match(unsafeBranch, /userHasScopedStaffPermission/u);
  assert.match(unsafeBranch, /writePrivateMediaAccessAudit/u);
  assert.ok(unsafeBranch.indexOf("writePrivateMediaAccessAudit") < unsafeBranch.indexOf("return true"));
});

test("creator-video comment attachments inherit the parent quarantine boundary", () => {
  const surfaceGate = between(
    mediaStorage,
    "const canReadSocialAttachmentSurface = async",
    "const canReadSocialAttachment = async",
  );
  const creatorVideoBranch = between(
    surfaceGate,
    'if (surfaceType === "creator_video_comment")',
    'if (surfaceType === "chat_message")',
  );
  assert.match(creatorVideoBranch, /select\("id,owner_id,scan_status,quarantined_at"\)/u);
  assert.match(creatorVideoBranch, /video\.data\.quarantined_at != null/u);
  assert.ok(
    creatorVideoBranch.indexOf("video.data.quarantined_at != null")
      < creatorVideoBranch.indexOf("resolveCreatorContentAccessAllowed"),
  );
});

test("creator-video object signing binds safe parents and separates owners from scoped staff", () => {
  const parentReader = between(
    mediaStorage,
    "const readCreatorVideoParentAuthority = async",
    "const resolveProfileVisibilityAllowed = async",
  );
  assert.match(parentReader, /id,owner_id,moderation_status,scan_status,quarantined_at/u);
  assert.doesNotMatch(parentReader, /storage_(?:path|object_key)|playback_url/u);

  const sourceReader = between(
    mediaStorage,
    "const readCreatorVideoForObject = async",
    "const readCreatorVideoRenditionForObject = async",
  );
  assert.match(sourceReader, /thumb_scan_status,thumb_quarantined_at/u);
  assert.match(sourceReader, /data\.quarantined_at != null/u);
  assert.match(sourceReader, /data\.thumb_quarantined_at != null/u);
  assert.match(sourceReader, /if \(requireActiveObjectProvenance\)/u);

  const renditionReader = between(
    mediaStorage,
    "const readCreatorVideoRenditionForObject = async",
    "const hasExactDeleteObjectProvenance = async",
  );
  assert.match(renditionReader, /scan_status,quarantined_at,storage_bucket/u);
  assert.match(renditionReader, /videoScanStatus[\s\S]+videoQuarantinedAt/u);

  const gate = between(
    mediaStorage,
    "const canReadCreatorVideo = async (",
    "const canDeleteCreatorVideo = async (",
  );
  const authority = gate.indexOf("await resolveCreatorContentAccess(");
  const parent = gate.indexOf("await readCreatorVideoParentAuthority(");
  const parentGate = gate.indexOf("creatorVideoParentResolutionAllowed({");
  const staffClassification = gate.indexOf("isCrossOwnerCreatorContentStaffAccess({");
  const privilegedRendition = gate.indexOf("await canReadCreatorVideoRendition(");
  const privilegedSource = gate.indexOf("await readCreatorVideoForObject(");
  assert.ok(authority >= 0 && parent > authority && parentGate > parent);
  assert.ok(staffClassification > parentGate && staffClassification < privilegedRendition);
  assert.ok(privilegedRendition < privilegedSource);
  assert.match(gate, /const contentAccessAllowed = !crossOwnerStaffAccess/u);
  assert.match(gate, /const scopedStaffAllowed = crossOwnerStaffAccess[\s\S]+userHasScopedStaffPermission/u);
  assert.match(gate, /scopedStaffAllowed,[\s\S]+visibilityAllowed/u);
  assert.ok(gate.indexOf("if (!allowed) return false") < gate.indexOf("writePrivateMediaAccessAudit"));
});
