#!/usr/bin/env node
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const migration = read("supabase/migrations/20260827171500_creator_vip_video_shelf_v1.sql");
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
need(studio, 'title: "VIP"', "Studio VIP shelf");
need(studio, 'setCreatorVideoVipAccess', "Studio VIP assignment");
need(platform, 'title="VIP"', "Public Platform VIP shelf");
need(platform, 'VIP · Locked', "Public Platform locked presentation");
need(sheet, 'Add to VIP shelf', "Content action VIP assignment");
need(sheet, 'Remove from VIP shelf', "Content action VIP removal");
need(sheet, 'video.vipAccessRequired', "Paid/VIP exclusivity UI");
if (cards.includes('playback_url')) throw new Error("Public VIP metadata endpoint must not expose playback_url");
console.log("VIP video shelf authority guard passed.");
