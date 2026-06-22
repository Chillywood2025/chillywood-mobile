#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Creator video Circle visibility guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const creatorVideos = read("_lib/creatorVideos.ts");
const actionSheet = read("components/creator-media/CreatorContentActionSheet.tsx");
const channel = read("app/channel/[userId].tsx");
const studio = read("app/channel-settings.tsx");
const player = read("app/player/[id].tsx");
const discoveryFeed = read("_lib/discoveryFeed.ts");
const migration = read("supabase/migrations/20260622193918_creator_video_circle_visibility.sql");

assertIncludes(creatorVideos, 'export type CreatorVideoVisibility = "draft" | "circle" | "public"', "creator video visibility type");
assertIncludes(creatorVideos, "resolve_creator_video_visibility_access", "creator video access resolver");
assertIncludes(creatorVideos, "readCreatorVideoForPlayer", "Player creator video read helper");
assertIncludes(creatorVideos, "paidContentAccess", "visibility-before-paid access helper");
assertIncludes(creatorVideos, "visibilityAccess", "creator video locked-shell access state");
assertIncludes(creatorVideos, "circle_member_required", "Circle member denial reason");
assertIncludes(creatorVideos, "draft_owner_only", "draft owner-only denial reason");

assertIncludes(actionSheet, 'CreatorContentActionSheetVisibilityAction = "draft" | "circle" | "public"', "shared action-sheet visibility actions");
assertIncludes(actionSheet, "label=\"Make Private for Chi'lly Circle\"", "Make Private action");
assertIncludes(actionSheet, 'onSetVisibility(selected, "circle")', "Make Private live action");
assertNotIncludes(actionSheet, "circleOnlyBacked", "Make Private disabled backing prop");
assertNotIncludes(actionSheet, "Needs backed Circle-only video access", "Make Private disabled detail");

assertIncludes(channel, "Private to your Chi'lly Circle. Circle members can see it where Circle content is backed. It is not public discovery.", "Platform Circle readback");
assertIncludes(channel, "includeDrafts: showOwnerControls", "owner Platform draft/circle/public read");
assertIncludes(studio, "Private to your Chi'lly Circle. Circle members can see it where Circle content is backed. It is not public discovery.", "Studio Circle readback");
assertIncludes(studio, '["draft", "circle", "public"]', "Studio visibility options");
assertIncludes(studio, "member-only, not public discovery", "Studio Circle distribution copy");
assertIncludes(player, "Private to Chi'lly Circle", "Player Circle locked title");
assertIncludes(player, "Approved Circle members can watch it where Circle content is backed.", "Player Circle locked body");

assertIncludes(discoveryFeed, '.eq("visibility", "public")', "public discovery visibility filter");
assertIncludes(discoveryFeed, 'item.visibility === "public"', "public discovery item eligibility");
assertNotIncludes(discoveryFeed, 'visibility", "circle"', "public discovery Circle leakage");

assertIncludes(migration, "check (\"visibility\" in ('draft'::text, 'circle'::text, 'public'::text))", "videos visibility constraint");
assertIncludes(migration, "is_active_chilly_circle_member", "Circle membership helper");
assertIncludes(migration, "can_read_creator_video_row", "creator video RLS helper");
assertIncludes(migration, "videos_select_visibility_access", "creator video select RLS policy");
assertIncludes(migration, "creator_videos_storage_select_visibility_access", "creator video storage RLS policy");
assertIncludes(migration, "resolve_creator_video_visibility_access", "safe locked-shell access RPC");
assertIncludes(migration, "user_friendships", "Circle membership source of truth");
assertIncludes(migration, "channel_audience_blocks", "blocked viewer exclusion");
assertNotIncludes(migration, "discovery_feed_items", "no Circle-private public discovery writes");

[
  "Private means only me",
  "Private is owner-only",
  "private means owner-only",
  "appears on every profile",
].forEach((needle) => {
  assertNotIncludes(actionSheet, needle, "action-sheet private/draft copy");
  assertNotIncludes(channel, needle, "Platform private/draft copy");
  assertNotIncludes(studio, needle, "Studio private/draft copy");
});

if (process.exitCode) {
  process.exit();
}

console.log("Creator video Circle visibility guard passed.");
