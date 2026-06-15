#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Platform Brand Studio policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const assertNotMatches = (source, pattern, label) => {
  if (pattern.test(source)) fail(`${label} matched forbidden pattern ${pattern}`);
};

const brandAssetsMigration = read("supabase/migrations/202605240001_platform_brand_studio_assets.sql");
const reviewMigration = read("supabase/migrations/202605240002_platform_brand_studio_review_workflow.sql");
const reviewQueueMigration = read("supabase/migrations/202605240004_platform_brand_studio_review_queue_access.sql");
const reviewContextMigration = read("supabase/migrations/202605240007_platform_brand_review_rpc_trigger_context.sql");
const ownerPublishReviewRepairMigration = read("supabase/migrations/20260603033000_platform_brand_owner_publish_review_repair.sql");
const ownerPublishAssetsMigration = read("supabase/migrations/20260615142151_platform_brand_owner_publish_assets_rpc.sql");
const cleanupMigration = [
  read("supabase/migrations/202605240005_platform_brand_asset_cleanup_candidates.sql"),
  read("supabase/migrations/202605240006_platform_brand_cleanup_service_role_guard.sql"),
].join("\n");
const platformBranding = read("_lib/platformBranding.ts");
const channelSettings = read("app/channel-settings.tsx");
const publicChannel = read("app/channel/[userId].tsx");
const docs = read("docs/PLATFORM_BRAND_STUDIO.md");

[
  "hero_image_asset_id",
  "hero_video_asset_id",
  "hero_poster_asset_id",
  "background_image_asset_id",
  "avatar_asset_id",
  "logo_asset_id",
  "watermark_asset_id",
].forEach((column) => {
  assertIncludes(reviewMigration, `public.platform_brand_asset_public_safe(profile."${column}"`, `public profile sanitizer for ${column}`);
  assertIncludes(cleanupMigration, `profile."${column}"`, `cleanup reference exclusion for ${column}`);
});

assertIncludes(reviewMigration, `asset."asset_state" = 'published'`, "public-safe asset state check");
assertIncludes(reviewMigration, `asset."moderation_status" in ('clean', 'reported')`, "public-safe moderation check");
assertIncludes(reviewMigration, `asset."deleted_at" is null`, "public-safe deleted check");
assertIncludes(reviewMigration, `where profile."owner_user_id" = nullif`, "public profile owner filter");
assertIncludes(reviewMigration, `and profile."published_at" is not null`, "public profile published filter");
assertIncludes(reviewMigration, `video."id"::text = profile."spotlight_video_id"`, "public profile spotlight video public-safe check");
assertIncludes(platformBranding, `.eq("asset_state", "published")`, "client public asset state filter");
assertIncludes(platformBranding, `.in("moderation_status", ["clean", "reported"])`, "client public moderation filter");
assertIncludes(platformBranding, `PLATFORM_BRAND_PUBLIC_SCAN_STATUSES`, "client public scan-safe status constant");
assertIncludes(platformBranding, `.in("scan_status", PLATFORM_BRAND_PUBLIC_SCAN_STATUSES)`, "client public scan-safe filter");
assertIncludes(platformBranding, `.is("deleted_at", null)`, "client public deleted filter");
assertIncludes(platformBranding, `return "Ready to publish";`, "creator-facing pending Brand Studio status copy");
assertNotIncludes(platformBranding, `return "Needs review";`, "creator Brand Studio must not label owned pending assets as Needs review");
assertIncludes(platformBranding, `spotlight_video_id: patch.spotlightVideoId === undefined ? undefined : patch.spotlightVideoId`, "Brand Studio spotlight clear support");
assertIncludes(publicChannel, `readCreatorVideos(routeUserId, { includeDrafts: false`, "public Platform draft exclusion");
assertIncludes(publicChannel, `spotlightVideoId ? videos.find`, "public Platform preferred Spotlight video");
assertIncludes(publicChannel, `const showOwnerControls = isOwner && !publicPreviewMode`, "public preview owner-control hide");

assertIncludes(reviewMigration, `raise exception 'brand_review_forbidden'`, "review forbidden guard");
assertIncludes(reviewMigration, `if v_action in ('reject', 'archive') and length`, "review reason guard");
assertIncludes(reviewMigration, `insert into public."platform_brand_asset_review_events"`, "review event insert");
assertIncludes(reviewMigration, `insert into public."platform_admin_audit_logs"`, "admin audit insert");
assertIncludes(reviewMigration, `'fake_approval', false`, "no fake approval audit marker");
assertIncludes(reviewContextMigration, `set_config('app.platform_brand_review_context', 'review_platform_brand_asset', true)`, "review RPC trigger context set");
assertIncludes(reviewContextMigration, `v_review_context <> 'review_platform_brand_asset'`, "asset trigger context gate");
assertIncludes(ownerPublishReviewRepairMigration, `v_is_asset_owner := v_before."owner_user_id" = v_actor_user_id`, "owner-owned Brand Studio review gate");
assertIncludes(ownerPublishReviewRepairMigration, `if not (v_has_reviewer_access or v_is_asset_owner) then`, "owner-or-reviewer Brand Studio review authorization");
assertIncludes(ownerPublishReviewRepairMigration, `raise exception 'brand_review_forbidden'`, "wrong-account Brand Studio review denial");
assertIncludes(ownerPublishReviewRepairMigration, `v_before."scan_status" in ('malware_detected', 'scan_failed', 'quarantined')`, "scan-blocked owner approval denial");
assertIncludes(ownerPublishReviewRepairMigration, `'self_review', v_is_asset_owner`, "Brand Studio self-review audit marker");
assertIncludes(ownerPublishAssetsMigration, `publish_platform_brand_profile_assets`, "owner publish selected assets RPC");
assertIncludes(ownerPublishAssetsMigration, `asset."owner_user_id" = v_actor_user_id`, "owner publish selected assets ownership gate");
assertIncludes(ownerPublishAssetsMigration, `asset."deleted_at" is null`, "owner publish selected assets deleted gate");
assertIncludes(ownerPublishAssetsMigration, `v_before."scan_status" in ('clean', 'manual_review')`, "owner publish selected assets scan-safe review gate");
assertIncludes(ownerPublishAssetsMigration, `asset."moderation_status" in ('clean', 'reported')`, "owner publish selected assets moderation-safe publish gate");
assertIncludes(ownerPublishAssetsMigration, `asset."scan_status" in ('clean', 'manual_review')`, "owner publish selected assets scan-safe publish gate");
assertIncludes(ownerPublishAssetsMigration, `'fake_approval', false`, "owner publish selected assets no fake approval audit marker");
assertIncludes(ownerPublishAssetsMigration, `'self_review', true`, "owner publish selected assets self-review audit marker");
assertIncludes(platformBranding, `Approved by the creator during Brand Studio publish.`, "creator publish approves selected owned assets");
assertIncludes(platformBranding, `publish_platform_brand_profile_assets`, "client publish selected assets RPC");
assertIncludes(platformBranding, `selectedReviewAssetIds`, "creator publish filters selected self-review assets");
assertNotIncludes(platformBranding, `reviewPlatformBrandAsset(\n      assetId,\n      "approve",\n      "Approved by the creator during Brand Studio publish.",\n    ).catch`, "Brand Studio selected publish must not swallow self-review failures");
assertIncludes(platformBranding, `resolveBrandPublishReadbackStatus`, "Brand Studio publish public readback helper");
assertIncludes(platformBranding, `publicReadbackMissingCount`, "Brand Studio public readback mismatch classification");
assertIncludes(platformBranding, `return savePlatformBrandProfileDraft(normalizedOwnerId, {\n    ...profile,\n    publishedAt,`, "Brand Studio publish marks profile published after asset repair");
assertNotIncludes(platformBranding, `...assetIds,\n    ...((waitingAssetRows`, "Brand Studio publish self-review must not include unfiltered selected assets");
assertIncludes(reviewQueueMigration, `public.has_platform_permission('content_moderation')`, "review queue content moderation access");
assertIncludes(reviewQueueMigration, `public.has_platform_permission('reports_review')`, "review queue reports access");
assertIncludes(channelSettings, `Publishing Status`, "creator Brand Studio publishing status panel");
assertIncludes(channelSettings, `Ready to publish`, "creator Brand Studio ready-to-publish copy");
assertIncludes(channelSettings, `Draft, safety, and public state`, "creator Brand Studio non-review publishing status copy");
assertNotIncludes(channelSettings, `waiting for review before public display`, "creator Brand Studio must not send creators into a review waiting state");
assertNotIncludes(channelSettings, `Public media appears only after review`, "creator Brand Studio save copy must not require creator-facing review");
assertNotIncludes(channelSettings, `Draft, safety, review, and public state`, "creator Brand Studio publishing panel must not mention review as a creator step");
assertNotIncludes(channelSettings, `title: "Review & Publish"`, "creator Brand Studio must not expose review queue sheet");
assertNotIncludes(channelSettings, `readPlatformBrandReviewQueue`, "creator Brand Studio must not load reviewer queue");
assertNotIncludes(channelSettings, `reviewPlatformBrandAsset`, "creator Brand Studio must not call reviewer mutation");
assertNotIncludes(channelSettings, `handleReviewPlatformBrandAsset`, "creator Brand Studio must not render reviewer actions");
assertNotIncludes(channelSettings, `brandReviewQueueAssets`, "creator Brand Studio must not hold reviewer queue state");
assertIncludes(channelSettings, `createInitialBrandSections(routeParams.tab, routeParams.focus)`, "collapsed Brand Studio first view");
assertIncludes(channelSettings, `activeBrandSheetSection`, "Brand Studio bottom sheet state");
assertIncludes(channelSettings, `styles.assetManagerSheet`, "Brand Studio modal bottom sheet");
assertIncludes(channelSettings, `setActiveBrandSheetSection(id)`, "asset card opens bottom sheet");
assertIncludes(channelSettings, `platformBranding?.heroImage ? (`, "hero adjustment controls require media");
assertIncludes(channelSettings, `platformBranding?.backgroundImage ? (`, "background adjustment controls require media");
assertIncludes(channelSettings, `title: "Adjust Hero Image"`, "hero post-selection adjust step");
assertIncludes(channelSettings, `title: "Adjust Background"`, "background post-selection adjust step");
assertIncludes(channelSettings, `thumbnailAsset: platformBranding?.heroImage`, "hero collapsed thumbnail");
assertIncludes(channelSettings, `These appear on your public Platform, separate from your Profile photo.`, "Profile/Platform media separation copy");
assertIncludes(channelSettings, `formatPlatformBrandScanStatus`, "Brand Studio scan status readout");
assertIncludes(channelSettings, `Preview Brand Draft`, "owner-only Brand Studio draft preview action");
assertIncludes(channelSettings, `preview: "brand-draft"`, "Brand Studio draft preview route");
assertIncludes(channelSettings, `Preview Platform is the reviewed visitor view`, "Brand Studio public preview copy");
assertIncludes(channelSettings, `Save Draft keeps media owner-only`, "Brand Studio draft/public separation copy");
assertIncludes(channelSettings, `brand-hero-choose-image-button`, "Brand Studio Hero Image selector");
assertIncludes(channelSettings, `brand-save-draft-button`, "Brand Studio Save Draft selector");
assertIncludes(channelSettings, `brand-publish-changes-button`, "Brand Studio Publish Changes selector");
assertIncludes(channelSettings, `brand-preview-draft-platform-button`, "Brand Studio draft preview selector");
assertIncludes(channelSettings, `brand-preview-public-platform-button`, "Brand Studio public preview selector");
assertIncludes(channelSettings, `saveBrandStudioDraftAndProfile`, "Brand Studio controlled draft/profile save handler");
assertIncludes(channelSettings, `publishBrandStudioAndProfile`, "Brand Studio controlled publish/profile save handler");
assertIncludes(channelSettings, `await persistBrandDraftPatch();`, "Brand Studio draft save is awaited");
assertIncludes(channelSettings, `await persistBrandPublish();`, "Brand Studio publish is awaited");
assertIncludes(channelSettings, `resolveBrandPublishReadbackStatus(ownerUserId, selectedAssetIds)`, "Brand Studio publish reloads public readback");
assertIncludes(channelSettings, `Saved, but safety scan is still pending.`, "Brand Studio scan-pending publish notice");
assertIncludes(channelSettings, `Saved, but Publish Changes could not apply this safe asset yet.`, "Brand Studio publish/apply retry notice");
assertNotIncludes(channelSettings, `Saved, but review is still pending.`, "creator Brand Studio must not imply another review after Publish Changes");
assertIncludes(channelSettings, `Saved, but this asset is not publishable yet.`, "Brand Studio non-publishable publish notice");
assertIncludes(channelSettings, `Published, but public Platform did not return the asset.`, "Brand Studio public readback mismatch notice");
assertIncludes(channelSettings, `await saveCurrentProfileSettings();`, "Brand Studio profile save is awaited");
assertIncludes(channelSettings, `brandProfileSaveInFlightRef`, "Brand Studio duplicate mutation guard");
assertNotMatches(
  channelSettings,
  /void\s+saveBrandDraftPatch\([^)]*\);\s*void\s+onSave\(\)/s,
  "Brand Studio Save Draft must not fire unawaited parallel brand/profile mutations",
);
assertNotMatches(
  channelSettings,
  /void\s+publishBrandDraft\([^)]*\);\s*void\s+onSave\(\)/s,
  "Brand Studio Publish Changes must not fire unawaited parallel brand/profile mutations",
);
assertIncludes(publicChannel, `brandDraftPreviewMode`, "public Platform owner draft preview mode");
assertIncludes(publicChannel, `showDraftBranding = isOwner && brandDraftPreviewMode`, "draft preview owner guard");
assertIncludes(publicChannel, `readPlatformBrandStudio(routeUserId)`, "owner draft preview Brand Studio reader");
assertIncludes(platformBranding, `preparePlatformBrandUploadUri`, "Android content URI staging");
assertIncludes(platformBranding, `FileSystem.uploadAsync`, "Brand Studio robust Android upload");
assertIncludes(platformBranding, `assertPlatformBrandUploadReadable`, "Brand Studio upload read-back verification");
assertIncludes(platformBranding, `.eq("asset_state", "published")`, "public asset state filter");
assertIncludes(platformBranding, `formatPlatformBrandScanStatus`, "scan status formatter");
assertIncludes(platformBranding, `scanStatus: normalizeScanStatus`, "scan status parsing");

assertIncludes(cleanupMigration, `grant execute on function public."platform_brand_asset_cleanup_candidates"(integer, integer) to service_role`, "cleanup service-role grant");
assertIncludes(cleanupMigration, `platform_brand_cleanup_service_role_required`, "cleanup runtime service-role guard");
assertIncludes(cleanupMigration, `asset."asset_state" <> 'published'`, "cleanup published exclusion");
assertIncludes(cleanupMigration, `referenced_assets`, "cleanup reference exclusion CTE");
assertIncludes(cleanupMigration, `left join referenced_assets`, "cleanup reference join");
assertIncludes(cleanupMigration, `cleanup_reason is not null`, "cleanup reason filter");
assertIncludes(docs, "Cleanup must be service-role/admin-only", "cleanup docs service-role rule");
assertIncludes(docs, "never delete currently published assets", "cleanup docs published rule");

assertIncludes(channelSettings, `Hero Reel not available yet`, "Hero Reel honest unavailable copy");
assertIncludes(channelSettings, `Watermark not available yet`, "watermark honest unavailable copy");
assertIncludes(docs, "Current support is Level 1", "cropper level doc");
assertIncludes(docs, "Do not claim drag crop", "cropper no-fake doc");

[
  "Mini Platform",
  "mini platform",
  "foundation rows",
  "not wired",
  "proof missing",
  "backend not connected",
  "raw storage",
  "signed URL",
  "RPC failed",
  "no rows returned",
].forEach((forbidden) => {
  assertNotIncludes(channelSettings, forbidden, "Platform Studio user-facing UI");
  assertNotIncludes(publicChannel, forbidden, "public Platform user-facing UI");
});

assertIncludes(brandAssetsMigration, `"asset_state" text not null default 'draft'`, "draft default");
assertIncludes(brandAssetsMigration, `"moderation_status" text not null default 'pending_review'`, "pending review default");
assertIncludes(brandAssetsMigration, `and old."moderation_status" not in ('clean', 'reported')`, "publish reviewed-assets trigger guard");

if (process.exitCode) {
  process.exit();
}

console.log("Platform Brand Studio policy guard passed.");
