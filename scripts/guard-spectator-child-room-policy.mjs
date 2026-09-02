#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

const checks = [];
const assertIncludes = (label, haystack, needle) => {
  if (!haystack.includes(needle)) {
    checks.push(`Missing ${label}: ${needle}`);
  }
};
const assertNotIncludes = (label, haystack, needle) => {
  if (haystack.includes(needle)) {
    checks.push(`Unexpected ${label}: ${needle}`);
  }
};
const assertMatch = (label, haystack, pattern) => {
  if (!pattern.test(haystack)) {
    checks.push(`Missing ${label}: ${pattern}`);
  }
};

const migration = read("supabase/migrations/202605260003_spectator_child_room_source_links.sql");
const replayFixtureMigration = read("supabase/migrations/202605260006_spectator_replay_archive_fixture.sql");
const startRoomFunction = read("supabase/functions/spectator-start-room/index.ts");
const spectatorEntryRoute = read("app/spectate/[itemId].tsx");
const spectatorMetadataRoute = read("app/spectate-metadata/[itemId].tsx");
const spectatorLiveRoute = read("app/spectate-live/[itemId].tsx");
const discovery = read("_lib/discoveryFeed.ts");
const home = read("app/(tabs)/index.tsx");
const live = read("app/(tabs)/live.tsx");
const explore = read("app/(tabs)/explore.tsx");
const watchPartyRoute = read("app/watch-party/[partyId].tsx");
const liveStageRoute = read("app/watch-party/live-stage/[partyId].tsx");
const playerRoute = read("app/player/[id].tsx");
const sourceResolver = read("_lib/watchPartyContentSources.ts");
const launchHelper = read("_lib/spectatorChildRooms.ts");

[
  "allow_spectator_view",
  "allow_watch_party_from_spectator",
  "allow_live_reaction_rooms",
  "allow_public_share",
  "allow_replay_watch_party",
  "spectator_child_room_sources",
  "spectator_child_room_audit_log",
  "spectator_playback",
].forEach((needle) => assertIncludes("spectator migration contract", migration, needle));

[
  "participantToken",
  "raw_hls",
  "hls_playback_url",
  "storage_path",
  "speaker_credentials",
  "host_controls",
  "secret",
].forEach((needle) => assertIncludes("sensitive metadata constraint", migration, needle));

[
  "sign_in_required",
  "premium_required",
  "source_not_public",
  "source_reuse_disabled",
  "source_not_found",
  "source_ended",
  "blocked",
  "rate_limited",
].forEach((needle) => assertIncludes("clean Edge Function error", startRoomFunction, needle));

[
  "isPublicSafeItem",
  "readViewerBlock",
  "isPublicSafePlayback",
  "isPublicSafeBroadcastSession",
  "allow_watch_party_from_spectator",
  "allow_live_reaction_rooms",
  "spectator_child_room_sources",
  "spectator_child_room_audit_log",
].forEach((needle) => assertIncludes("server-side eligibility", startRoomFunction, needle));

assertNotIncludes("Premium proof-hold bypass", startRoomFunction, "PREMIUM_LIVE_GATE_PROOF_HOLD");
assertIncludes("no full original token response", startRoomFunction, "fullRoomTokenForSpectators: false");
assertIncludes("no original room token response", startRoomFunction, "originalRoomTokenReturned: false");
assertIncludes("no original publish response", startRoomFunction, "originalRoomPublishPermission: false");
assertNotIncludes("returned participant token", startRoomFunction, "participantToken:");
assertNotIncludes("returned raw HLS URL", startRoomFunction, "hlsPlaybackUrl");

const spectatorLaunchCopySurface = `${spectatorMetadataRoute}\n${spectatorLiveRoute}\n${launchHelper}`;
[
  "Start Watch-Party Live",
  "Start Live Watch-Party",
  "React with Friends",
  "Source live has ended",
  "This live can’t be used for a watch party",
  "Share",
  "View Platform",
  "Report",
].forEach((needle) => assertIncludes("Spectator CTA copy", spectatorLaunchCopySurface, needle));
assertNotIncludes("duplicate Circle launch CTA", spectatorLaunchCopySurface, "Watch with your Chi'lly Circle");
assertNotIncludes("duplicate reaction CTA", spectatorLaunchCopySurface, "Start Reaction Room");

assertIncludes("Spectator entry metadata resolver", spectatorEntryRoute, "LegacySpectatorMetadataScreen");
assertIncludes("Spectator entry live resolver", spectatorEntryRoute, "/spectate-live/");
assertIncludes("Metadata signed-in handoff", spectatorMetadataRoute, "/(auth)/login");
assertIncludes("Metadata launch helper", spectatorMetadataRoute, "startSpectatorChildRoom");
assertIncludes("Live signed-in handoff", spectatorLiveRoute, "/(auth)/login");
assertIncludes("Live launch helper", spectatorLiveRoute, "startSpectatorChildRoom");
assertIncludes("safe share link", launchHelper, "chillywoodmobile://spectate/");
assertIncludes("client token assertion", launchHelper, "originalRoomTokenReturned !== false");
assertIncludes("resolver supports spectator source", sourceResolver, "spectator_playback");
assertIncludes("resolver reads spectator playback", sourceResolver, "readSpectatorPlaybackReadout");
assertIncludes("Watch-Party player spectator route param", watchPartyRoute, "source: \"spectator-playback\"");
assertIncludes("Watch-Party source attribution", watchPartyRoute, "sourceAttribution");
assertIncludes("Live Watch-Party source attribution", liveStageRoute, "sourceAttribution");
assertIncludes("Player spectator source", playerRoute, "expectsSpectatorPlayback");
assertIncludes("Player source mismatch guard", playerRoute, "different spectator source");
assertIncludes("Player source ended copy", playerRoute, "Source live has ended");
assertIncludes("replay archive fixture", replayFixtureMigration, "spectator_fixture_replay_archive_20260526");
assertIncludes("replay source state", replayFixtureMigration, "replay_available_later");
assertIncludes("replay child link source type", startRoomFunction, "return \"replay\"");
assertIncludes("replay fixture not live", replayFixtureMigration, "'source_is_live', false");
assertIncludes("replay fixture safe playback", replayFixtureMigration, "'raw_hls_url_visible_to_public', false");
assertNotIncludes("replay fixture live-stage claim", replayFixtureMigration, "'source_kind', 'live_stage'");

assertMatch("Watch-Party route ownership", watchPartyRoute, /pathname:\s*"\/player\/\[id\]"/);
assertMatch("Live Watch-Party route ownership", liveStageRoute, /export default function WatchPartyLiveStageScreen/);

[
  ["Home", home],
  ["Live", live],
  ["Explore", explore],
].forEach(([label, source]) => {
  assertIncludes(`${label} exact discovery routing`, source, "getDiscoveryItemDestination(item)");
  assertIncludes(`${label} exact Event routing`, source, "openEvent(event.id)");
  assertNotIncludes(`${label} Event-to-Platform routing`, source, "openChannel(event.hostUserId)");
  assertNotIncludes(`${label} Event-to-Platform routing`, source, "openPlatform(event.hostUserId)");
  assertNotIncludes(
    `${label} mixed Event and Platform discovery routing`,
    source,
    'item.item_type === "channel_update" || item.item_type === "creator_event"',
  );
});
assertIncludes("exact Event destination", discovery, "/event/${encodeURIComponent(eventId)}");
assertIncludes("exact creator-video destination", discovery, "/player/${encodeURIComponent(mediaId)}?source=creator-video");
assertIncludes("Event Pass public label", discovery, 'return "Event Pass"');
assertIncludes("Party Room Pass public label", discovery, 'return "Party Room Pass"');
assertIncludes("Live Stage Pass public label", discovery, 'return "Live Stage Pass"');
assertNotIncludes("generic ticketed discovery label", discovery, 'return "Ticketed"');
assertNotIncludes("implicit Event-to-Live pass relationship", discovery, "|| item.event_id");
assertIncludes("exact discovery target identity gate", discovery, "hasDiscoveryDestinationIdentity");
assertIncludes("public discovery identity filtering", discovery, "data.filter(isDiscoveryFeedItemEligibleForRanking)");
assertIncludes("Live Event destination label", live, ">Open Event</Text>");
assertNotIncludes("stale Live Event destination label", live, ">Open Platform</Text>");

const combinedUserFacing = `${spectatorEntryRoute}\n${spectatorMetadataRoute}\n${spectatorLiveRoute}\n${watchPartyRoute}\n${liveStageRoute}\n${playerRoute}`;
assertNotIncludes("user-facing Mini Platform copy", combinedUserFacing, "Mini Platform");
assertNotIncludes("user-facing backend copy", combinedUserFacing, "backend");
assertNotIncludes("user-facing RPC copy", combinedUserFacing, '"RPC"');
assertNotIncludes("user-facing source rows copy", combinedUserFacing, "source rows");
assertNotIncludes("user-facing not wired copy", combinedUserFacing, "not wired");
assertNotIncludes("unfinished access-pass copy", combinedUserFacing, "required later");
assertNotIncludes("raw access enum formatting", spectatorMetadataRoute, 'accessType.replaceAll("_", " ")');
assertNotIncludes("raw rights enum formatting", spectatorMetadataRoute, 'rightsStatus.replaceAll("_", " ")');
assertNotIncludes("raw playback enum formatting", spectatorMetadataRoute, 'playback.state.replaceAll("_", " ")');

if (checks.length) {
  console.error("Spectator child-room guard failed:");
  checks.forEach((check) => console.error(`- ${check}`));
  process.exit(1);
}

console.log("Spectator child-room policy guard passed.");
