#!/usr/bin/env python3
from pathlib import Path


def one(s, old, new, label):
    c = s.count(old)
    if c != 1:
        raise RuntimeError(f"{label}: expected 1 match, found {c}")
    return s.replace(old, new, 1)

# creatorVipPasses helper
p = Path("_lib/creatorVipPasses.ts")
s = p.read_text()
s = one(s, 'export type CreatorVipTransaction = {\n', '''export type CreatorVipVideoAccess = {\n  allowed: boolean;\n  reason: string;\n  vipRequired: boolean;\n  creatorId: string | null;\n};\n\nexport type CreatorVipTransaction = {\n''', 'vip video type')
s = one(s, 'export async function createCreatorVipPassPurchaseIntent(offerId: string) {\n', '''export async function resolveCreatorVipVideoAccess(videoId: string): Promise<CreatorVipVideoAccess> {\n  const { data, error } = await rpcClient.rpc("resolve_creator_vip_video_access", { p_video_id: videoId });\n  if (error || !data || typeof data !== "object" || Array.isArray(data)) {\n    return { allowed: false, reason: "access_check_failed", vipRequired: true, creatorId: null };\n  }\n  const row = data as Record<string, unknown>;\n  return {\n    allowed: row.allowed === true,\n    reason: toText(row.reason) || "access_check_failed",\n    vipRequired: row.vipRequired === true,\n    creatorId: toText(row.creatorId) || null,\n  };\n}\n\nexport async function setCreatorVideoVipAccess(videoId: string, required: boolean) {\n  const { data, error } = await rpcClient.rpc("set_creator_video_vip_access", {\n    p_video_id: videoId,\n    p_required: required,\n  });\n  if (error) throw new Error("VIP video access could not be updated.");\n  const row = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};\n  if (toText(row.status) !== "ok") {\n    if (toText(row.reason) === "vip_video_must_be_public") {\n      throw new Error("Make this video Public before adding it to the VIP shelf.");\n    }\n    throw new Error("VIP video access could not be updated.");\n  }\n  return { videoId: toText(row.videoId) || videoId, vipRequired: row.vipRequired === true };\n}\n\nexport async function createCreatorVipPassPurchaseIntent(offerId: string) {\n''', 'vip video helpers')
p.write_text(s)

# creatorVideos model + player authority
p = Path("_lib/creatorVideos.ts")
s = p.read_text()
s = one(s, 'import { recordCreatorVideoUploadUsage } from "./platformUsage";\n', 'import { recordCreatorVideoUploadUsage } from "./platformUsage";\nimport { resolveCreatorVipVideoAccess, type CreatorVipVideoAccess } from "./creatorVipPasses";\n', 'creatorVideos vip import')
s = one(s, '  paidContentAccess: CreatorContentAccessResolution | null;\n', '  paidContentAccess: CreatorContentAccessResolution | null;\n  vipAccessRequired: boolean;\n  vipAccess: CreatorVipVideoAccess | null;\n', 'creator video fields')
s = one(s, '  clip_metadata_public?: unknown;\n', '  vipAccessRequired?: unknown;\n  clip_metadata_public?: unknown;\n', 'public row vip field')
s = one(s, '"id,owner_id,title,description,playback_url,thumb_url,created_at,visibility,moderation_status,moderation_reason,moderated_at,moderated_by,storage_provider,storage_bucket,storage_object_key,storage_path,thumb_storage_path,mime_type,file_size_bytes,updated_at";', '"id,owner_id,title,description,playback_url,thumb_url,created_at,visibility,moderation_status,moderation_reason,moderated_at,moderated_by,storage_provider,storage_bucket,storage_object_key,storage_path,thumb_storage_path,mime_type,file_size_bytes,updated_at,vip_access_required";', 'creator select vip')
s = one(s, '    paidContentAccess: null,\n    visibilityAccess: null,\n', '    paidContentAccess: null,\n    vipAccessRequired: row.vip_access_required === true,\n    vipAccess: null,\n    visibilityAccess: null,\n', 'parse creator vip')
s = one(s, '  paidContentAccess: null,\n  visibilityAccess: null,\n', '  paidContentAccess: null,\n  vipAccessRequired: row.vipAccessRequired === true,\n  vipAccess: null,\n  visibilityAccess: null,\n', 'parse public vip')
s = one(s, '    paidContentAccess: null,\n    visibilityAccess: access,\n', '    paidContentAccess: null,\n    vipAccessRequired: false,\n    vipAccess: null,\n    visibilityAccess: access,\n', 'locked vip defaults')
needle = '''  const paidContentAccess = await resolveCreatorContentAccess({\n    contentType: "creator_video",\n    contentId: parsedWithAccess.id,\n  });\n  if (paidContentAccess.resolverStatus !== "resolved" || paidContentAccess.allowed !== true) {\n    return {\n      ...parsedWithAccess,\n      playbackUrl: "",\n      playbackResolution: createUnavailableVodPlaybackResolution(parsedWithAccess.id, paidContentAccess.reason),\n      playbackQualityLabel: null,\n      playbackDelivery: null,\n      paidContentAccess,\n    };\n  }\n'''
replacement = '''  const vipAccess = parsedWithAccess.vipAccessRequired\n    ? await resolveCreatorVipVideoAccess(parsedWithAccess.id).catch(() => ({\n      allowed: false, reason: "access_check_failed", vipRequired: true, creatorId: parsedWithAccess.ownerId || null,\n    }))\n    : null;\n  if (parsedWithAccess.vipAccessRequired && vipAccess?.allowed !== true) {\n    return {\n      ...parsedWithAccess,\n      playbackUrl: "",\n      playbackResolution: createUnavailableVodPlaybackResolution(parsedWithAccess.id, vipAccess?.reason ?? "vip_required"),\n      playbackQualityLabel: null,\n      playbackDelivery: null,\n      paidContentAccess: null,\n      vipAccess,\n    };\n  }\n\n  const paidContentAccess = parsedWithAccess.vipAccessRequired\n    ? null\n    : await resolveCreatorContentAccess({ contentType: "creator_video", contentId: parsedWithAccess.id });\n  if (paidContentAccess && (paidContentAccess.resolverStatus !== "resolved" || paidContentAccess.allowed !== true)) {\n    return {\n      ...parsedWithAccess,\n      playbackUrl: "",\n      playbackResolution: createUnavailableVodPlaybackResolution(parsedWithAccess.id, paidContentAccess.reason),\n      playbackQualityLabel: null,\n      playbackDelivery: null,\n      paidContentAccess,\n      vipAccess,\n    };\n  }\n'''
s = one(s, needle, replacement, 'player vip gate')
# carry vipAccess into final parsed return by changing common spread before playback resolution if present
s = s.replace('    ...parsedWithAccess,\n    playbackUrl: playbackResolution.defaultPlaybackUrl', '    ...parsedWithAccess,\n    vipAccess,\n    playbackUrl: playbackResolution.defaultPlaybackUrl', 1)
p.write_text(s)

# public creator cards edge function metadata only; never playback URL
p = Path("supabase/functions/public-creator-video-cards/index.ts")
s = p.read_text()
s = one(s, '  updated_at: string | null;\n};\n', '  updated_at: string | null;\n  vip_access_required: boolean | null;\n};\n', 'edge row vip')
s = one(s, '  "updated_at",\n].join(",");\n', '  "updated_at",\n  "vip_access_required",\n].join(",");\n', 'edge select vip')
# add public response field next to updatedAt if exact mapper text exists
s = s.replace('updatedAt: toText(row.updated_at),', 'updatedAt: toText(row.updated_at),\n    vipAccessRequired: row.vip_access_required === true,')
p.write_text(s)

# action sheet
p = Path("components/creator-media/CreatorContentActionSheet.tsx")
s = p.read_text()
s = one(s, '  onSetPrice: (video: CreatorVideo) => void;\n', '  onSetPrice: (video: CreatorVideo) => void;\n  onSetVipAccess: (video: CreatorVideo, required: boolean) => void;\n', 'sheet vip prop')
s = one(s, '  onSetPrice,\n  onCreateEvent,\n', '  onSetPrice,\n  onSetVipAccess,\n  onCreateEvent,\n', 'sheet vip destructure')
s = one(s, '            <SheetAction label="Set price / manage paid unlock" disabled={!video || busy} onPress={() => run(onSetPrice)} />\n', '''            <SheetAction\n              label={video?.vipAccessRequired ? "Remove from VIP shelf" : "Add to VIP shelf"}\n              disabled={!video || busy || (!video.vipAccessRequired && video.visibility !== "public")}\n              detail={!video?.vipAccessRequired && video?.visibility !== "public" ? "Make this video Public first" : "VIP replaces per-video paid unlock for this item"}\n              onPress={() => run((selected) => onSetVipAccess(selected, !selected.vipAccessRequired))}\n            />\n            <SheetAction label="Set price / manage paid unlock" disabled={!video || busy || video.vipAccessRequired} detail={video?.vipAccessRequired ? "Remove VIP access first; VIP and per-video purchase are separate tiers" : undefined} onPress={() => run(onSetPrice)} />\n''', 'sheet vip action')
p.write_text(s)

# Platform Studio: setter import, VIP shelf, action handler
p = Path("app/channel-settings.tsx")
s = p.read_text()
s = one(s, '  saveCreatorVipPassOffer,\n', '  saveCreatorVipPassOffer,\n  setCreatorVideoVipAccess,\n', 'studio vip setter import')
s = one(s, '    const paidVideos = sortedVideos.filter((video) => {\n', '    const vipVideos = sortedVideos.filter((video) => video.vipAccessRequired);\n    const paidVideos = sortedVideos.filter((video) => {\n', 'studio vip filter')
s = one(s, '      { key: "paid", title: "Paid Videos", items: paidVideos },\n', '      { key: "paid", title: "Paid Videos", items: paidVideos },\n      { key: "vip", title: "VIP", items: vipVideos },\n', 'studio vip shelf')
anchor = '''  const onSetContentActionPrice = (video: CreatorVideo) => {\n'''
handler = '''  const onSetContentActionVipAccess = async (video: CreatorVideo, required: boolean) => {\n    setSelectedContentActionVideo(null);\n    setVideoSaving(true);\n    setVideoNotice(null);\n    try {\n      await setCreatorVideoVipAccess(video.id, required);\n      await refreshCreatorVideos();\n      setVideoNotice(required ? "Added to the VIP shelf. Per-video paid unlock was disabled for this video." : "Removed from the VIP shelf.");\n    } catch (error) {\n      setVideoNotice(error instanceof Error ? error.message : "VIP video access could not be updated.");\n    } finally {\n      setVideoSaving(false);\n    }\n  };\n\n'''
s = one(s, anchor, handler + anchor, 'studio vip handler')
s = one(s, '      onSetPrice={onSetContentActionPrice}\n', '      onSetPrice={onSetContentActionPrice}\n      onSetVipAccess={onSetContentActionVipAccess}\n', 'studio sheet vip wire')
p.write_text(s)

# Public Platform: separate VIP shelf and remove VIP from normal latest row.
p = Path("app/channel/[userId].tsx")
s = p.read_text()
s = one(s, '  const latestUploadVideos = useMemo(() => {\n    if (!featuredVideo) return videos;\n    const withoutFeatured = videos.filter((video) => video.id !== featuredVideo.id);\n    return withoutFeatured.length ? withoutFeatured : videos;\n  }, [featuredVideo, videos]);\n', '''  const vipVideos = useMemo(() => videos.filter((video) => video.vipAccessRequired), [videos]);\n  const latestUploadVideos = useMemo(() => {\n    const standardVideos = videos.filter((video) => !video.vipAccessRequired);\n    if (!featuredVideo || featuredVideo.vipAccessRequired) return standardVideos;\n    const withoutFeatured = standardVideos.filter((video) => video.id !== featuredVideo.id);\n    return withoutFeatured.length ? withoutFeatured : standardVideos;\n  }, [featuredVideo, videos]);\n''', 'platform vip arrays')
# label compact shared cards in platform branch source
s = s.replace('mode={showOwnerControls ? "owner" : "public"}\n        testID="platform-content-open-button"', 'mode={showOwnerControls ? "owner" : "public"}\n        accessLabel={video.vipAccessRequired ? (vipAccess?.allowed ? "VIP" : "VIP · Locked") : undefined}\n        testID="platform-content-open-button"')
# insert VIP section before Live Now render if marker exists
marker = '  const renderLiveNow = () => (\n'
vip_render = '''  const renderVipVideos = () => (\n    vipVideos.length ? (\n      <AppSection title="VIP" statusLabel={vipAccess?.allowed ? "Unlocked" : "VIP"} statusTone={vipAccess?.allowed ? "success" : "warning"}>\n        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.shelfScroll} contentContainerStyle={styles.shelfRow}>\n          {vipVideos.map((video) => renderLatestUploadCard(video))}\n        </ScrollView>\n      </AppSection>\n    ) : null\n  );\n\n'''
s = one(s, marker, vip_render + marker, 'platform vip render')
# render after latest uploads wherever renderLatestUploads is invoked
s = s.replace('{renderLatestUploads()}\n', '{renderLatestUploads()}\n        {renderVipVideos()}\n', 1)
p.write_text(s)

print("Applied VIP video shelf, owner assignment, metadata discovery, and fail-closed playback gate.")
