#!/usr/bin/env python3
from pathlib import Path

choices = {
    '_lib/creatorMonetization.ts': 'ours',
    '_lib/creatorVideos.ts': 'theirs',
    '_lib/creatorVipPasses.ts': 'ours',
    '_lib/watchParty.ts': 'theirs',
    'scripts/test-cognitive-db-concurrency.mjs': 'theirs',
    'supabase/functions/livekit-token/index.ts': 'theirs',
    'supabase/tests/room_host_participant_block_check_test.sql': 'theirs',
}

def resolve_markers(path: str, choice: str):
    p = Path(path)
    text = p.read_text()
    out, pos = [], 0
    while True:
        start = text.find('<<<<<<< HEAD\n', pos)
        if start < 0:
            out.append(text[pos:]); break
        out.append(text[pos:start])
        mid = text.find('=======\n', start)
        end = text.find('>>>>>>> ', mid)
        if mid < 0 or end < 0: raise RuntimeError(f'malformed markers in {path}')
        endline = text.find('\n', end)
        if endline < 0: endline = len(text) - 1
        ours = text[start + len('<<<<<<< HEAD\n'):mid]
        theirs = text[mid + len('=======\n'):end]
        out.append(ours if choice == 'ours' else theirs)
        pos = endline + 1
    resolved = ''.join(out)
    if '<<<<<<< ' in resolved or '\n=======\n' in resolved or '>>>>>>> ' in resolved:
        raise RuntimeError(f'unresolved markers in {path}')
    p.write_text(resolved)

for path, choice in choices.items():
    resolve_markers(path, choice)

# Keep #245 strict VIP purchase authority and add today's video-scoped VIP authority.
p = Path('_lib/creatorVipPasses.ts'); s = p.read_text()
if 'export type CreatorVipVideoAccess' not in s:
    anchor = 'export type CreatorVipTransaction = {\n'
    block = 'export type CreatorVipVideoAccess = {\n  allowed: boolean;\n  reason: string;\n  vipRequired: boolean;\n  creatorId: string | null;\n};\n\n'
    if anchor not in s: raise RuntimeError('VIP type anchor missing')
    s = s.replace(anchor, block + anchor, 1)
if 'export async function resolveCreatorVipVideoAccess' not in s:
    anchor = 'export async function createCreatorVipPassPurchaseIntent(\n'
    block = '''export async function resolveCreatorVipVideoAccess(videoId: string): Promise<CreatorVipVideoAccess> {
  const normalizedVideoId = accessText(videoId);
  if (!ACCESS_UUID_PATTERN.test(normalizedVideoId)) {
    return { allowed: false, reason: "invalid_video_id", vipRequired: true, creatorId: null };
  }
  const { data, error } = await rpcClient.rpc("resolve_creator_vip_video_access", { p_video_id: normalizedVideoId });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return { allowed: false, reason: "access_check_failed", vipRequired: true, creatorId: null };
  }
  const row = data as Record<string, unknown>;
  if (typeof row.allowed !== "boolean" || typeof row.vipRequired !== "boolean") {
    return { allowed: false, reason: "malformed_access_response", vipRequired: true, creatorId: null };
  }
  const creatorId = accessText(row.creatorId);
  if (creatorId && !ACCESS_UUID_PATTERN.test(creatorId)) {
    return { allowed: false, reason: "malformed_access_response", vipRequired: true, creatorId: null };
  }
  const reason = accessText(row.reason);
  if (!reason) return { allowed: false, reason: "malformed_access_response", vipRequired: true, creatorId: null };
  return { allowed: row.allowed, reason, vipRequired: row.vipRequired, creatorId: creatorId || null };
}

export async function setCreatorVideoVipAccess(videoId: string, required: boolean) {
  const normalizedVideoId = accessText(videoId);
  if (!ACCESS_UUID_PATTERN.test(normalizedVideoId)) throw new Error("VIP video access could not be updated.");
  const { data, error } = await rpcClient.rpc("set_creator_video_vip_access", { p_video_id: normalizedVideoId, p_required: required });
  if (error) throw new Error("VIP video access could not be updated.");
  const row = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
  if (accessText(row.status) !== "ok") {
    if (accessText(row.reason) === "vip_video_must_be_public") throw new Error("Make this video Public before adding it to the VIP shelf.");
    throw new Error("VIP video access could not be updated.");
  }
  const returnedVideoId = accessText(row.videoId);
  if (returnedVideoId !== normalizedVideoId || typeof row.vipRequired !== "boolean") throw new Error("VIP video access could not be verified.");
  return { videoId: returnedVideoId, vipRequired: row.vipRequired };
}

'''
    if anchor not in s: raise RuntimeError('VIP helper anchor missing')
    s = s.replace(anchor, block + anchor, 1)
p.write_text(s)

# Main's current video model wins; restore #245 pre-row paid metadata protection and add VIP preflight.
p = Path('_lib/creatorVideos.ts'); s = p.read_text()
if 'function createPaidContentLockedCreatorVideo(' in s:
    # Existing #245 helper came through outside the conflicted hunk; make it fit the current CreatorVideo shape.
    s = s.replace('    paidContentAccess: access,\n    visibilityAccess: null,', '    paidContentAccess: access,\n    vipAccessRequired: false,\n    vipAccess: null,\n    visibilityAccess: null,', 1)
else:
    anchor = 'export async function readCreatorVideoForPlayer(videoId: string): Promise<CreatorVideo | null> {\n'
    paid = '''function createPaidContentLockedCreatorVideo(videoId: string, access: CreatorContentAccessResolution): CreatorVideo {
  const purchaseRequired = access.resolverStatus === "resolved" && access.allowed === false && access.reason === "purchase_required" && access.requiresPurchase === true;
  const now = new Date().toISOString();
  return { id: videoId, ownerId: purchaseRequired ? access.creatorId ?? "" : "", title: purchaseRequired ? "Paid creator video" : "Creator video unavailable", description: purchaseRequired ? "Purchase access must be verified before this creator video can play." : "Playback remains blocked until paid-content access can be verified.", visibility: "public", moderationStatus: "clean", moderationReason: null, moderatedAt: null, moderatedBy: null, playbackUrl: "", thumbnailUrl: "", storageProvider: "supabase", storageBucket: "", storageObjectKey: "", storagePath: "", thumbStoragePath: "", mimeType: "", fileSizeBytes: null, playbackResolution: createUnavailableVodPlaybackResolution(videoId, access.reason), playbackQualityLabel: null, playbackDelivery: null, paidContentAccess: access, vipAccessRequired: false, vipAccess: null, visibilityAccess: null, renditionStatuses: [], publicClipMetadata: null, createdAt: now, updatedAt: now };
}

'''
    if anchor not in s: raise RuntimeError('paid helper anchor missing')
    s = s.replace(anchor, paid + anchor, 1)
if 'function createVipLockedCreatorVideo(' not in s:
    anchor = 'export async function readCreatorVideoForPlayer(videoId: string): Promise<CreatorVideo | null> {\n'
    vip = '''function createVipLockedCreatorVideo(videoId: string, access: CreatorVipVideoAccess): CreatorVideo {
  const now = new Date().toISOString();
  return { id: videoId, ownerId: access.creatorId ?? "", title: "VIP creator video", description: "Active VIP access for this creator is required before this video can play.", visibility: "public", moderationStatus: "clean", moderationReason: null, moderatedAt: null, moderatedBy: null, playbackUrl: "", thumbnailUrl: "", storageProvider: "supabase", storageBucket: "", storageObjectKey: "", storagePath: "", thumbStoragePath: "", mimeType: "", fileSizeBytes: null, playbackResolution: createUnavailableVodPlaybackResolution(videoId, access.reason), playbackQualityLabel: null, playbackDelivery: null, paidContentAccess: null, vipAccessRequired: true, vipAccess: access, visibilityAccess: null, renditionStatuses: [], publicClipMetadata: null, createdAt: now, updatedAt: now };
}

'''
    if anchor not in s: raise RuntimeError('VIP locked helper anchor missing')
    s = s.replace(anchor, vip + anchor, 1)
start = s.index('export async function readCreatorVideoForPlayer(videoId: string): Promise<CreatorVideo | null> {')
end = s.index('\nexport async function uploadCreatorVideo(', start)
new = '''export async function readCreatorVideoForPlayer(videoId: string): Promise<CreatorVideo | null> {
  const normalizedVideoId = toText(videoId);
  if (!normalizedVideoId) return null;
  const visibilityAccess = await resolveCreatorVideoVisibilityAccess(normalizedVideoId).catch(() => null);
  if (visibilityAccess && !visibilityAccess.allowed) return createLockedCreatorVideo(normalizedVideoId, visibilityAccess);

  const vipAccess = await resolveCreatorVipVideoAccess(normalizedVideoId).catch(() => ({ allowed: false, reason: "access_check_failed", vipRequired: true, creatorId: null }));
  if (vipAccess.vipRequired && vipAccess.allowed !== true) return createVipLockedCreatorVideo(normalizedVideoId, vipAccess);

  const paidContentAccess = vipAccess.vipRequired ? null : await resolveCreatorContentAccess({ contentType: "creator_video", contentId: normalizedVideoId });
  if (paidContentAccess && (paidContentAccess.resolverStatus !== "resolved" || paidContentAccess.allowed !== true)) return createPaidContentLockedCreatorVideo(normalizedVideoId, paidContentAccess);

  const { data, error } = await supabase.from("videos").select(CREATOR_VIDEO_SELECT).eq("id", normalizedVideoId).in("moderation_status", ["clean", "reported"]).returns<CreatorVideoRow>().maybeSingle();
  if (error || !data) return null;
  const row = data as CreatorVideoRow;
  const parsed = await parseCreatorVideo(row, { resolveLegacyPlaybackUrl: false });
  if (parsed.vipAccessRequired !== vipAccess.vipRequired) return createVipLockedCreatorVideo(normalizedVideoId, { allowed: false, reason: "vip_classification_changed", vipRequired: true, creatorId: parsed.ownerId || vipAccess.creatorId });
  const parsedWithAccess = { ...parsed, visibilityAccess: visibilityAccess ?? { allowed: true, visibility: parsed.visibility, reason: parsed.visibility === "circle" ? "circle_member_allowed" as const : "public_allowed" as const, isOwner: false, isBlocked: false, isCircleMember: parsed.visibility === "circle", hasPlayableSource: !!(parsed.storagePath || parsed.storageObjectKey), viewerUserId: null, ownerUserId: parsed.ownerId } };
  const { data: authData } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));
  const viewerUserId = toText(authData.user?.id);
  if (parsedWithAccess.visibility === "draft" && (!viewerUserId || viewerUserId !== parsedWithAccess.ownerId)) return createLockedCreatorVideo(normalizedVideoId, { allowed: false, visibility: "draft", reason: "draft_owner_only", isOwner: false, isBlocked: false, isCircleMember: false, hasPlayableSource: false, viewerUserId: viewerUserId || null, ownerUserId: parsedWithAccess.ownerId });
  const playbackResolution = await resolveSignedVideoPlaybackSource({ videoId: parsedWithAccess.id, storageProvider: parsedWithAccess.storageProvider, fallbackBucket: parsedWithAccess.storageBucket });
  const legacyPlaybackUrl = !playbackResolution.defaultPlaybackUrl && (playbackResolution.legacyPlaybackAllowed || playbackResolution.legacyQualityEnforcement === "resolver_unavailable") ? await createCreatorVideoPlaybackUrl({ id: parsedWithAccess.id, storageProvider: parsedWithAccess.storageProvider, storageBucket: parsedWithAccess.storageBucket, storageObjectKey: parsedWithAccess.storageObjectKey, storagePath: parsedWithAccess.storagePath, playbackUrl: toText(row.playback_url) }) : "";
  return { ...parsedWithAccess, vipAccess: vipAccess.vipRequired ? vipAccess : null, playbackUrl: playbackResolution.defaultPlaybackUrl || legacyPlaybackUrl, playbackResolution, playbackQualityLabel: playbackResolution.defaultPlaybackQuality ?? (legacyPlaybackUrl ? "legacy_single_file" : null), playbackDelivery: playbackResolution.deliveryMetadata, paidContentAccess, renditionStatuses: playbackResolution.renditionStatuses.length ? playbackResolution.renditionStatuses : parsed.renditionStatuses };
}
'''
s = s[:start] + new + s[end:]
p.write_text(s)

# Player must not misclassify VIP lock as paid-content resolver failure.
p = Path('app/player/[id].tsx'); s = p.read_text()
needle = '  const creatorVideoPaidContentLocked = isCreatorVideoPlayback\n'
if needle in s and 'const creatorVideoVipLocked' not in s:
    s = s.replace(needle, '  const creatorVideoVipLocked = isCreatorVideoPlayback\n    && creatorVideo?.vipAccessRequired === true\n    && creatorVideo.vipAccess?.allowed !== true;\n  const creatorVideoPaidContentLocked = isCreatorVideoPlayback\n    && creatorVideo?.vipAccessRequired !== true\n', 1)
generic = '? "Playback is blocked because paid-content access could not be verified."\n'
if generic in s and 'VIP access for this creator is required to play this video.' not in s:
    s = s.replace(generic, '? "Playback is blocked because paid-content access could not be verified."\n                        : creatorVideoVipLocked\n                          ? "VIP access for this creator is required to play this video."\n', 1)
p.write_text(s)
