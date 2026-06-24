#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const assertIncludes = (content, needle, label) => {
  if (!content.includes(needle)) {
    throw new Error(`${label}: missing ${needle}`);
  }
};

const assertNotIncludes = (content, needle, label) => {
  if (content.includes(needle)) {
    throw new Error(`${label}: unexpected ${needle}`);
  }
};

const migration = read("supabase/migrations/202605140010_vod_quality_ladder_resolver.sql");
const scanSafeResolverMigration = read("supabase/migrations/20260623170000_creator_media_scan_safe_playback_resolver.sql");
const vodLib = read("_lib/vodQuality.ts");
const creatorVideos = read("_lib/creatorVideos.ts");
const mediaStorageFunction = read("supabase/functions/media-storage/index.ts");
const player = read("app/player/[id].tsx");
const performancePolicy = read("_lib/performancePolicy.ts");

assertIncludes(performancePolicy, "VOD_FREE_MAX_HEIGHT_V1 = 480", "performance policy");
assertIncludes(performancePolicy, "VOD_PREMIUM_MAX_HEIGHT_V1 = 1080", "performance policy");

assertIncludes(migration, 'create table if not exists public."video_renditions"', "VOD migration");
assertIncludes(migration, '"quality_label" in (\'original\', \'360p\', \'480p\', \'720p\', \'1080p\')', "VOD migration");
assertIncludes(migration, '"quality_label" <> \'original\'', "resolver excludes original");
assertIncludes(migration, '"access_tier" = \'free\'', "resolver free tier");
assertIncludes(migration, '"access_tier" = \'premium\' and v_has_premium', "resolver premium entitlement");
assertIncludes(migration, "public.user_has_active_entitlement(v_viewer_id::text, array['premium'::text])", "resolver premium check");
assertIncludes(migration, "'pending_renditions'", "legacy fallback truth");
assertIncludes(migration, "video_renditions_select_owner_operator", "rendition RLS");
assertIncludes(migration, "video_renditions_no_direct_client_insert", "no direct client insert");
assertIncludes(migration, "creator_videos_storage_select_premium_renditions", "premium storage policy");
assertIncludes(scanSafeResolverMigration, "public.media_scan_public_safe(v_video.\"scan_status\")", "scan-safe resolver");
assertIncludes(scanSafeResolverMigration, "public.media_scan_public_safe(rendition.\"scan_status\")", "scan-safe resolver");

assertIncludes(vodLib, "VOD_FREE_PLAYBACK_QUALITY_LABELS = [\"360p\", \"480p\"]", "VOD lib");
assertIncludes(vodLib, "VOD_PREMIUM_PLAYBACK_QUALITY_LABELS = [\"720p\", \"1080p\"]", "VOD lib");
assertIncludes(vodLib, "resolveVideoPlayback", "VOD resolver helper");
assertIncludes(vodLib, "resolveSignedVideoPlaybackSource", "signed resolver helper");
assertIncludes(vodLib, "recordOriginalVideoRendition", "original rendition helper");

assertIncludes(creatorVideos, "resolveSignedVideoPlaybackSource", "creator video player resolver integration");
assertIncludes(creatorVideos, "recordOriginalVideoRendition(id)", "creator upload original status");
assertIncludes(creatorVideos, "legacyQualityEnforcement === \"resolver_unavailable\"", "legacy resolver fallback");

assertIncludes(mediaStorageFunction, "readCreatorVideoRenditionForObject", "media storage rendition authorization");
assertIncludes(mediaStorageFunction, "userHasActiveEntitlement", "media storage premium entitlement");
assertIncludes(mediaStorageFunction, "rendition.qualityLabel === \"original\"", "media storage original guard");

assertIncludes(player, "readCreatorVideoForPlayer", "Player stays on creator video resolver path");
assertNotIncludes(player, "720p", "Player must not hardcode HD access");
assertNotIncludes(player, "1080p", "Player must not hardcode HD access");

console.log("VOD quality ladder/resolver guard passed.");
