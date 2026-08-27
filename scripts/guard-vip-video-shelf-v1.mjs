#!/usr/bin/env node
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const migration = read("supabase/migrations/20260827171500_creator_vip_video_shelf_v1.sql");
const authorityClosure = read("supabase/migrations/20260827210000_creator_video_protected_authority_closure.sql");
const videos = read("_lib/creatorVideos.ts");
const vip = read("_lib/creatorVipPasses.ts");
const studio = read("app/channel-settings.tsx");
const platform = read("app/channel/[userId].tsx");
const cards = read("supabase/functions/public-creator-video-cards/index.ts");
const sheet = read("components/creator-media/CreatorContentActionSheet.tsx");

const need = (src, text, label) => { if (!src.includes(text)) throw new Error(`${label}: missing ${text}`); };

[
  '"vip_access_required" boolean not null default false',
  'resolve_creator_vip_video_access',
  'set_creator_video_vip_access',
  'block_paid_price_on_vip_video',
  'vip_video_cannot_be_paid_per_video',
  'creator_vip_passes',
  "vip.\"status\" = 'active'",
  'vip.\"revoked_at\" is null',
  'vip.\"refunded_at\" is null',
].forEach((x) => need(migration, x, "VIP migration"));
[
  'resolve_creator_content_access',
  'resolve_creator_vip_pass_access',
  'wave1_current_caller_authority_internal',
  'wave1_assert_current_creator_money_authority_internal',
  'creator_video_commerce_access_allowed',
  'media_renditions_select_public_safe_metadata',
  'block_unsigned_public_rendition_on_protected_video',
  'protected_video_public_rendition_must_be_revoked',
  'creator_video_vip_authority_server_owned',
].forEach((x) => need(authorityClosure, x, "VIP protected-source authority closure"));
need(vip, 'resolveCreatorVipVideoAccess', "VIP client authority");
need(vip, 'setCreatorVideoVipAccess', "VIP owner setter");
need(videos, 'vipAccessRequired: boolean', "CreatorVideo model");
need(videos, 'resolveCreatorVipVideoAccess(normalizedVideoId)', "Player VIP pre-row authority");
const vipAuthorityIndex = videos.indexOf('resolveCreatorVipVideoAccess(normalizedVideoId)');
const protectedRowReadIndex = videos.indexOf('.from("videos")', vipAuthorityIndex);
if (vipAuthorityIndex < 0 || protectedRowReadIndex < 0 || vipAuthorityIndex > protectedRowReadIndex) {
  throw new Error("VIP authority must resolve before protected creator-video row selection");
}
need(videos, 'playbackUrl: ""', "Player fail-closed playback");
need(cards, 'vip_access_required', "Public card metadata");
need(cards, 'vipAccessRequired: row.vip_access_required === true', "Public card VIP classification mapping");
need(cards, 'isPublicCreatorVideoRowSafe', "Public card parent visibility/quarantine gate");
need(cards, 'isPublicCreatorVideoThumbnailSafe', "Public card thumbnail scan gate");
need(cards, 'PUBLIC_SCAN_STATUSES.includes(toText(row.thumb_scan_status))', "Public card clean-thumbnail requirement");
need(cards, '!toText(row.thumb_quarantined_at)', "Public card thumbnail quarantine denial");
need(cards, '.is("quarantined_at", null)', "Public card parent quarantine query denial");
need(cards, 'readMediaOriginStorageConfig', "Public card exact media-origin configuration");
need(cards, 'rowProvider !== originConfig.provider || rowBucket !== originConfig.bucket', "Public card provider/bucket binding");
need(cards, 'filterRowsWithCurrentOwnerAuthority', "Public card restricted-owner denial");
need(cards, 'adminClient.rpc("is_account_access_restricted"', "Public card canonical account restriction check");
need(studio, 'title: "VIP"', "Studio VIP shelf");
need(studio, 'setCreatorVideoVipAccess', "Studio VIP assignment");
need(platform, 'title="VIP"', "Public Platform VIP shelf");
need(platform, 'VIP · Locked', "Public Platform locked presentation");
need(sheet, 'Add to VIP shelf', "Content action VIP assignment");
need(sheet, 'Remove from VIP shelf', "Content action VIP removal");
need(sheet, 'video.vipAccessRequired', "Paid/VIP exclusivity UI");
if (cards.includes('playback_url')) throw new Error("Public VIP metadata endpoint must not expose playback_url");
if (cards.includes('"mime_type"') || cards.includes('"file_size_bytes"')) {
  throw new Error("Public VIP metadata endpoint must not select protected source MIME/size metadata");
}
if (cards.includes("adminClient.storage")) {
  throw new Error("Public thumbnails must be signed by their exact configured origin provider, never a fallback store");
}
console.log("VIP video shelf authority guard passed.");
