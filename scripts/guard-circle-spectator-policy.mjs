#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const fail = (message) => {
  console.error(`Circle spectator policy guard failed: ${message}`);
  process.exitCode = 1;
};
const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} missing ${needle}`);
};
const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const migration = read("supabase/migrations/20260622230809_circle_spectator_feed_v1.sql");
const discovery = read("_lib/discoveryFeed.ts");
const circleFeed = read("_lib/circleSpectatorFeed.ts");
const access = read("_lib/spectatorAccess.ts");
const playback = read("_lib/spectatorPlayback.ts");
const startRoom = read("supabase/functions/spectator-start-room/index.ts");
const playbackFunction = read("supabase/functions/spectator-playback/index.ts");
const spectateRoute = read("app/spectate/[itemId].tsx");
const home = read("app/(tabs)/index.tsx");
const explore = read("app/(tabs)/explore.tsx");
const docs = read("docs/SPECTATOR_CHILD_ROOM_FLOW.md");
const packageJson = read("package.json");

[
  "circle_spectator_feed_items",
  "enable row level security",
  "can_read_circle_spectator_feed_item",
  "can_read_circle_spectator_playback_record",
  "is_active_chilly_circle_member",
  "channel_audience_blocks",
  "spectator_hls_playback_records_circle_member_select",
  "'circle'",
  "circle_spectator_approved",
  "circle_safe_available",
].forEach((needle) => assertIncludes(migration, needle, "Circle spectator migration"));

assertNotIncludes(migration, "insert into public.\"discovery_feed_items\"", "Circle spectator migration");
assertNotIncludes(migration, "is_publicly_discoverable\" = true", "Circle spectator migration");
assertIncludes(discovery, "isCircleSpectatorFeedItemEligibleForRanking", "_lib/discoveryFeed.ts");
assertIncludes(discovery, "rankCircleSpectatorFeedItems", "_lib/discoveryFeed.ts");
assertIncludes(discovery, '.eq("visibility", "public")', "public discovery read");
assertIncludes(circleFeed, "CIRCLE_SPECTATOR_FEED_ITEMS_TABLE", "_lib/circleSpectatorFeed.ts");
assertIncludes(circleFeed, "readRankedCircleSpectatorFeedItems", "_lib/circleSpectatorFeed.ts");
assertIncludes(circleFeed, "rankCircleSpectatorFeedItems", "_lib/circleSpectatorFeed.ts");
assertIncludes(access, "circle_member_required", "_lib/spectatorAccess.ts");
assertIncludes(access, "This item is private to the creator's Chi'lly Circle.", "_lib/spectatorAccess.ts");
assertIncludes(playback, "Authorization: `Bearer ${accessToken}`", "_lib/spectatorPlayback.ts");
assertIncludes(playback, "isCircleSpectatorItem", "_lib/spectatorPlayback.ts");

[
  "canReadCircleSpectatorItem",
  "isCircleSafePlayback",
  "isCircleSafeBroadcastSession",
  "isCircleSafeItem",
  "readCircleSpectatorItem",
  "full_room_token_for_spectators: false",
  "original_room_publish_permission: false",
].forEach((needle) => assertIncludes(startRoom, needle, "spectator-start-room"));

[
  "controlledCirclePlaylistUrl",
  "verifyCirclePlaybackToken",
  "canReadCirclePlaybackRecord",
  "readCircleSpectatorItem",
  "circleBlockState",
  "rawHlsUrlReturned: false",
  "fullRoomTokenForSpectators: false",
].forEach((needle) => assertIncludes(playbackFunction, needle, "spectator-playback"));

assertIncludes(spectateRoute, "readPublicDiscoveryFeedItem", "/spectate route");
assertIncludes(spectateRoute, "readCircleSpectatorFeedItem", "/spectate route");
assertIncludes(spectateRoute, "circleAccess: nextLane === \"circle\" ? \"allowed\" : undefined", "/spectate route");
assertIncludes(home, "readRankedCircleSpectatorFeedItems", "Home");
assertIncludes(home, "Circle Live Now", "Home");
assertIncludes(home, "Circle Watch-Party Ready", "Home");
assertNotIncludes(explore, "readRankedCircleSpectatorFeedItems", "Explore public-only surface");
assertNotIncludes(explore, "circle_spectator_feed_items", "Explore public-only surface");

[
  "Circle Spectator",
  "circle_spectator_feed_items",
  "Private to approved Chi'lly Circle members",
  "does not write Circle-private rows to discovery_feed_items",
].forEach((needle) => assertIncludes(docs, needle, "Spectator doc"));

[
  "Chi’lly",
  "Ticketed public playback needs",
  "Get ticket",
  "Get Ticket",
  "AI picked this",
  "everybody's feed",
  "posted to all profiles",
].forEach((needle) => {
  for (const [label, source] of [
    ["_lib/spectatorChildRooms.ts", read("_lib/spectatorChildRooms.ts")],
    ["_lib/spectatorAccess.ts", access],
    ["_lib/spectatorPlayback.ts", playback],
    ["app/spectate/[itemId].tsx", spectateRoute],
    ["app/(tabs)/index.tsx", home],
    ["app/(tabs)/explore.tsx", explore],
  ]) {
    assertNotIncludes(source, needle, label);
  }
});

assertIncludes(packageJson, "guard:circle-spectator-policy", "package.json");

if (process.exitCode) process.exit();
console.log("Circle spectator policy guard passed.");
