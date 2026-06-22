#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Creator feed fan-out policy guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const migration = read("supabase/migrations/20260622223300_creator_feed_fanout_v1.sql");
const creatorFeed = read("_lib/creatorFeed.ts");
const creatorVideos = read("_lib/creatorVideos.ts");
const profilePosts = read("_lib/profilePosts.ts");
const officialRachi = read("_lib/officialRachi.ts");
const discoveryFeed = read("_lib/discoveryFeed.ts");
const home = read("app/(tabs)/index.tsx");
const explore = read("app/(tabs)/explore.tsx");
const profile = read("app/profile/[userId].tsx");
const platform = read("app/channel/[userId].tsx");
const circlePlan = read("docs/CREATOR_CONTENT_CIRCLE_VISIBILITY_PLAN.md");

[
  'create table if not exists public."creator_feed_items"',
  '"target_scope" in (\'followers\'::text, \'circle\'::text)',
  '"visibility" in (\'public\'::text, \'circle\'::text)',
  '"status" in (\'active\'::text, \'removed\'::text, \'hidden\'::text)',
  "can_read_creator_feed_item",
  "creator_feed_items_select_relationship_gated",
  "channel_followers",
  "is_active_chilly_circle_member",
  "can_read_creator_video_row",
  "channel_audience_blocks",
  "sync_creator_video_feed_items_after_change",
  "sync_profile_post_feed_items_after_change",
  '"source_type" in (\'creator_video\'::text, \'profile_post\'::text)',
  "\"visibility\" = 'draft'::text",
  "\"deleted_at\" = coalesce(\"deleted_at\"",
  "\"visibility\" = 'public'::text",
  "public.can_view_profile_content",
].forEach((needle) => assertIncludes(migration, needle, "creator feed fan-out migration"));

assertIncludes(migration, "v_visibility = 'public'::text", "public fan-out branch");
assertIncludes(migration, "'followers'", "follower target scope");
assertIncludes(migration, "'circle'", "Circle target scope");
assertIncludes(migration, "v_visibility = 'circle'::text", "Circle-private fan-out branch");
assertIncludes(migration, '"target_scope" = \'followers\'::text and not v_active_followers', "draft removes follower feed rows");
assertIncludes(migration, '"target_scope" = \'circle\'::text and not v_active_circle', "draft removes Circle feed rows");
assertIncludes(migration, 'p_target_scope = \'followers\'::text', "follower read gate");
assertIncludes(migration, 'p_visibility = \'public\'::text', "follower public-only gate");
assertIncludes(migration, 'p_target_scope = \'circle\'::text', "Circle read gate");
assertIncludes(migration, "public.\"is_active_chilly_circle_member\"", "Circle membership source of truth");
assertNotIncludes(migration, "discovery_feed_items", "relationship feed must not write public discovery rows");

[
  "readCreatorRelationshipFeedItems",
  "readCreatorRelationshipFeedVideos",
  "target_scope",
  "status\", \"active\"",
  "readCreatorVideosByIds",
  "readProfilePostsByIds",
  "profilePosts",
].forEach((needle) => assertIncludes(creatorFeed, needle, "_lib/creatorFeed.ts"));

assertIncludes(creatorVideos, "sync_creator_video_feed_items", "creator video feed sync RPC");
assertIncludes(creatorVideos, "readCreatorVideosByIds", "creator video feed source loader");
assertIncludes(profilePosts, 'export type ProfilePostVisibility = "public"', "Profile posts posted-only type");
assertIncludes(profilePosts, 'visibility: "public"', "Profile post create path posts only");
assertIncludes(profilePosts, ".eq(\"visibility\", \"public\")", "Profile post reads exclude legacy drafts");
assertIncludes(profilePosts, "readProfilePostsByIds", "Profile post feed source loader");
assertNotIncludes(profilePosts, 'ProfilePostVisibility = "public" | "draft"', "Profile posts must not expose draft type");
assertNotIncludes(officialRachi, 'p_visibility: normalizeVisibility(input.visibility)', "Official Rachi must not create draft Profile posts");

assertIncludes(home, "readCreatorRelationshipFeedVideos", "Home backed relationship feed helper");
assertIncludes(home, "From Creators You Follow", "Home follower feed copy");
assertIncludes(home, "From Your Chi'lly Circle", "Home Circle feed copy");
assertIncludes(home, "Only backed posted updates and public creator content from Platforms you follow appear here.", "Home follower feed honest loading copy");
assertIncludes(home, "Only backed posted updates, public creator videos, or Circle-private videos allowed by your Circle relationship appear here.", "Home Circle feed honest loading copy");

assertIncludes(discoveryFeed, '.eq("visibility", "public")', "public discovery guard through shared helper");
assertNotIncludes(explore, "readCreatorRelationshipFeedVideos", "Explore must not read private relationship feed items");

[
  "No Profile post appears on every user Profile feed.",
  "Profile remains personal/social",
  "Platform remains creator media/business",
  "Draft Profile posts must not exist as a normal state and must never fan out.",
  "Profile remains personal/social",
  "Platform remains creator media/business",
].forEach((needle) => assertIncludes(circlePlan, needle, "Circle visibility plan fan-out truth"));

[
  "Draft Post",
  "Save Draft",
  "Unpublished Post",
  "Everybody's feed",
  "everybody's feed",
  "Posted to all Profiles",
  "posted to all Profiles",
  "AI picked this",
].forEach((needle) => {
  assertNotIncludes(home, needle, "Home relationship feed copy");
  assertNotIncludes(explore, needle, "Explore relationship feed copy");
  assertNotIncludes(profile, needle, "Profile relationship feed copy");
  assertNotIncludes(platform, needle, "Platform relationship feed copy");
});

if (process.exitCode) process.exit();
console.log("Creator feed fan-out policy guard passed.");
