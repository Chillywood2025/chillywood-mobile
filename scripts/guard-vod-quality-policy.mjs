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

const assertNotMatches = (content, pattern, label) => {
  const match = content.match(pattern);
  if (match) {
    throw new Error(`${label}: unexpected ${match[0]}`);
  }
};

const migration = read("supabase/migrations/202605140010_vod_quality_ladder_resolver.sql");
const scanSafeResolverMigration = read("supabase/migrations/20260623170000_creator_media_scan_safe_playback_resolver.sql");
const vodDoc = read("docs/VOD_QUALITY_LADDER_AND_PLAYBACK_RESOLVER.md");
const vodLib = read("_lib/vodQuality.ts");
const mediaRenditionMetadata = read("_lib/mediaRenditionMetadata.ts");
const creatorVideos = read("_lib/creatorVideos.ts");
const mediaStorageFunction = read("supabase/functions/media-storage/index.ts");
const player = read("app/player/[id].tsx");
const performancePolicy = read("_lib/performancePolicy.ts");
const packageJson = read("package.json");
const mediaRenditionMetadataProof = read("scripts/proof-media-rendition-metadata.mjs");

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
assertIncludes(vodLib, "publicPlaybackSafe: false", "production VOD signed-origin fallback");

assertIncludes(vodDoc, "Trusted rendition metadata foundation:", "VOD doc trusted rendition foundation");
assertIncludes(vodDoc, "Existing `video_renditions` rows are a live schema foundation, but they are not yet trusted production Cloudflare R2/HLS playback rows.", "VOD doc trusted row boundary");
assertIncludes(vodDoc, "`_lib/mediaRenditionMetadata.ts` defines the source-only `TrustedMediaRenditionMetadata` contract", "VOD doc trusted source model");
assertIncludes(vodDoc, "Original/master rows are private processing sources and cannot be marked normal playback.", "VOD doc original/master CDN boundary");
assertIncludes(vodDoc, "Premium/private rows still require signed/token CDN access later and cannot use public CDN while `MEDIA_CDN_SIGNING_MODE=off`.", "VOD doc Premium/private CDN boundary");
assertIncludes(vodDoc, "`npm run proof:media-rendition-metadata` uses proof-only City Lights HLS fixture rows for 360p and 480p", "VOD doc trusted fixture proof");
assertIncludes(vodDoc, "No production `video_renditions` writes are live.", "VOD doc no production writes");

assertIncludes(mediaRenditionMetadata, "TrustedMediaRenditionMetadata", "trusted media rendition metadata model");
assertIncludes(mediaRenditionMetadata, "delivery_format", "trusted media rendition delivery format field");
assertIncludes(mediaRenditionMetadata, "delivery_provider", "trusted media rendition delivery provider field");
assertIncludes(mediaRenditionMetadata, "storage_provider", "trusted media rendition storage provider field");
assertIncludes(mediaRenditionMetadata, "bucket_role", "trusted media rendition bucket role field");
assertIncludes(mediaRenditionMetadata, "public_playback_path", "trusted media rendition public playback path field");
assertIncludes(mediaRenditionMetadata, "manifest_path", "trusted media rendition manifest path field");
assertIncludes(mediaRenditionMetadata, "variant_playlist_path", "trusted media rendition variant playlist field");
assertIncludes(mediaRenditionMetadata, "cache_policy", "trusted media rendition cache policy field");
assertIncludes(mediaRenditionMetadata, "scan_status", "trusted media rendition scan status field");
assertIncludes(mediaRenditionMetadata, "moderation_status", "trusted media rendition moderation status field");
assertIncludes(mediaRenditionMetadata, "is_public_playback_safe", "trusted media rendition public safety flag");
assertIncludes(mediaRenditionMetadata, "is_original", "trusted media rendition original flag");
assertIncludes(mediaRenditionMetadata, "is_ready", "trusted media rendition readiness flag");
assertIncludes(mediaRenditionMetadata, "canUseTrustedRenditionForPublicCdn", "trusted media rendition CDN gate");
assertIncludes(mediaRenditionMetadata, "buildMediaDeliveryAssetFromTrustedRendition", "trusted media rendition resolver bridge");
assertIncludes(mediaRenditionMetadata, "buildCityLightsTrustedHlsRenditionFixtures", "trusted media rendition City Lights proof fixture");
assertIncludes(mediaRenditionMetadata, "original_or_master_blocked", "trusted media rendition original/master block");
assertIncludes(mediaRenditionMetadata, "premium_requires_token_cdn", "trusted media rendition Premium block");
assertIncludes(mediaRenditionMetadata, "private_requires_token_cdn", "trusted media rendition private block");
assertIncludes(mediaRenditionMetadata, "scan_not_clean", "trusted media rendition scan block");
assertIncludes(mediaRenditionMetadata, "moderation_not_allowed", "trusted media rendition moderation block");
assertIncludes(mediaRenditionMetadata, "wrong_bucket_role", "trusted media rendition bucket role block");
assertIncludes(mediaRenditionMetadata, "non_playback_prefix", "trusted media rendition prefix block");
assertNotMatches(mediaRenditionMetadata, /\b(?:supabase\.from|insert\s*\(|upsert\s*\(|fetch\s*\(|XMLHttpRequest|createClient)\b/, "trusted media rendition metadata helper must not perform network or database writes");

assertIncludes(packageJson, "\"proof:media-rendition-metadata\"", "trusted media rendition metadata proof script");
assertIncludes(mediaRenditionMetadataProof, "trusted-media-rendition-metadata", "trusted media rendition metadata proof mode");
assertIncludes(mediaRenditionMetadataProof, "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1", "trusted media rendition City Lights source id");
assertIncludes(mediaRenditionMetadataProof, "360p", "trusted media rendition 360p fixture proof");
assertIncludes(mediaRenditionMetadataProof, "480p", "trusted media rendition 480p fixture proof");
assertIncludes(mediaRenditionMetadataProof, "not_ready", "trusted media rendition not-ready proof");
assertIncludes(mediaRenditionMetadataProof, "original_or_master_blocked", "trusted media rendition original/master proof");
assertIncludes(mediaRenditionMetadataProof, "premium_requires_token_cdn", "trusted media rendition Premium proof");
assertIncludes(mediaRenditionMetadataProof, "private_requires_token_cdn", "trusted media rendition private proof");
assertIncludes(mediaRenditionMetadataProof, "scan_not_clean", "trusted media rendition scan proof");
assertIncludes(mediaRenditionMetadataProof, "moderation_not_allowed", "trusted media rendition moderation proof");
assertIncludes(mediaRenditionMetadataProof, "wrong_bucket_role", "trusted media rendition bucket role proof");
assertIncludes(mediaRenditionMetadataProof, "non_playback_prefix", "trusted media rendition non-public prefix proof");
assertIncludes(mediaRenditionMetadataProof, "not_in_public_playback_allowlist", "trusted media rendition allowlist proof");
assertIncludes(mediaRenditionMetadataProof, "default production creator-video path should keep signed-origin fallback", "trusted media rendition production fallback proof");
assertIncludes(mediaRenditionMetadataProof, "productionVideoRenditionWritesLive: false", "trusted media rendition no production row writes");
assertIncludes(mediaRenditionMetadataProof, "productionDbWritesEnabled: false", "trusted media rendition no production DB writes");
assertIncludes(mediaRenditionMetadataProof, "productionPlaybackSwitched: false", "trusted media rendition no production playback switch");
assertNotMatches(mediaRenditionMetadataProof, /\bsupabase\.from\b|\bcreateClient\b/i, "trusted rendition metadata proof must not write production DB or create a Supabase client");

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
