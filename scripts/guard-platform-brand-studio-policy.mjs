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

const brandAssetsMigration = read("supabase/migrations/202605240001_platform_brand_studio_assets.sql");
const reviewMigration = read("supabase/migrations/202605240002_platform_brand_studio_review_workflow.sql");
const reviewQueueMigration = read("supabase/migrations/202605240004_platform_brand_studio_review_queue_access.sql");
const reviewContextMigration = read("supabase/migrations/202605240007_platform_brand_review_rpc_trigger_context.sql");
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
assertIncludes(platformBranding, `.eq("asset_state", "published")`, "client public asset state filter");
assertIncludes(platformBranding, `.in("moderation_status", ["clean", "reported"])`, "client public moderation filter");
assertIncludes(platformBranding, `.is("deleted_at", null)`, "client public deleted filter");
assertIncludes(publicChannel, `readCreatorVideos(routeUserId, { includeDrafts: false`, "public Platform draft exclusion");
assertIncludes(publicChannel, `const showOwnerControls = isOwner && !publicPreviewMode`, "public preview owner-control hide");

assertIncludes(reviewMigration, `raise exception 'brand_review_forbidden'`, "review forbidden guard");
assertIncludes(reviewMigration, `if v_action in ('reject', 'archive') and length`, "review reason guard");
assertIncludes(reviewMigration, `insert into public."platform_brand_asset_review_events"`, "review event insert");
assertIncludes(reviewMigration, `insert into public."platform_admin_audit_logs"`, "admin audit insert");
assertIncludes(reviewMigration, `'fake_approval', false`, "no fake approval audit marker");
assertIncludes(reviewContextMigration, `set_config('app.platform_brand_review_context', 'review_platform_brand_asset', true)`, "review RPC trigger context set");
assertIncludes(reviewContextMigration, `v_review_context <> 'review_platform_brand_asset'`, "asset trigger context gate");
assertIncludes(reviewQueueMigration, `public.has_platform_permission('content_moderation')`, "review queue content moderation access");
assertIncludes(reviewQueueMigration, `public.has_platform_permission('reports_review')`, "review queue reports access");
assertIncludes(channelSettings, `canReviewPlatformBrandAssets ? renderBrandAccordion({`, "review accordion role gate");
assertIncludes(channelSettings, `title: "Review and Publishing"`, "review accordion title");

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
