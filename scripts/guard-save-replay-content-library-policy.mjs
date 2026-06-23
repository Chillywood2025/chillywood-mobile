import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const assertIncludes = (haystack, needle, label) => {
  if (!haystack.includes(needle)) {
    throw new Error(`${label} must include: ${needle}`);
  }
};
const assertNotIncludes = (haystack, needle, label) => {
  if (haystack.includes(needle)) {
    throw new Error(`${label} must not include: ${needle}`);
  }
};

const packageJson = read("package.json");
const tabLayout = read("app/(tabs)/_layout.tsx");
const viewerLibrary = read("app/(tabs)/my-list.tsx");
const studio = read("app/channel-settings.tsx");
const watchParty = read("app/watch-party/[partyId].tsx");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx");
const replayLib = read("_lib/creatorReplays.ts");
const migration = read("supabase/migrations/20260623025334_save_replay_content_library_v1.sql");
const saveReplayFunction = read("supabase/functions/request-save-replay/index.ts");
const replayPlayerRoute = read("app/player/replay/[replayId].tsx");
const replayPlaybackFunction = read("supabase/functions/creator-replay-playback/index.ts");

assertIncludes(tabLayout, "title: 'Saved'", "bottom tab viewer Library label");
assertIncludes(viewerLibrary, "My Library", "viewer Library screen header");
assertIncludes(viewerLibrary, "Saved titles, watch progress, followed Platforms, and saved replays live here.", "viewer Library scope copy");
assertIncludes(studio, "Content Library", "Platform Studio Content Library copy");
assertIncludes(studio, "Save Replay sends host replays here first.", "Save Replay Content Library destination copy");
assertIncludes(studio, 'pathname: "/player/replay/[replayId]"', "Content Library replay Open route");

[watchParty, liveStage].forEach((source, index) => {
  const label = index === 0 ? "Watch-Party Live host ending flow" : "Live Stage host ending flow";
  assertIncludes(source, "Save Replay?", label);
  assertIncludes(source, "End & Save Replay", label);
  assertIncludes(source, "End Without Saving", label);
  assertIncludes(source, "Replay was not recording for this session. End without saving?", label);
  assertIncludes(source, "requestSaveReplay", label);
});

[
  'create table if not exists public."creator_replay_library_items"',
  '"save_status" in (',
  "'recording_not_started'::text",
  "'recording_active'::text",
  "'recording_stopping'::text",
  "'processing_replay'::text",
  "'ready'::text",
  "'failed'::text",
  '"visibility" in (\'draft\'::text, \'circle\'::text, \'public\'::text)',
  "can_read_creator_replay_library_item",
  "is_active_chilly_circle_member",
  "creator_replay_library_items_no_raw_media_metadata_check",
].forEach((needle) => assertIncludes(migration, needle, "Save Replay migration"));

[
  "host_required",
  "replay_rights_blocked",
  "recording_not_started",
  "creator_replay_library_items",
  "playback_record_id",
  "rawHlsUrlReturned: false",
  "fullRoomTokenForSpectators: false",
  "liveKitPublishAuthorityGranted: false",
].forEach((needle) => assertIncludes(saveReplayFunction, needle, "request-save-replay function"));

assertIncludes(saveReplayFunction, 'sourceType === "watch_party_live" && toText(room.source_type) === "platform_title"', "Watch-Party Live protected title replay block");
assertIncludes(replayLib, "CREATOR_REPLAY_LIBRARY_ITEMS_TABLE", "creator replay helper");
assertIncludes(replayLib, "readCreatorReplayLibraryItems", "Content Library replay reads");
assertIncludes(replayLib, "updateCreatorReplayLibraryItem", "Content Library replay actions");
assertIncludes(replayLib, "resolveCreatorReplayPlayback", "creator replay playback resolver");
assertIncludes(replayLib, "creator-replay-playback", "controlled replay playback function route");
assertIncludes(packageJson, "guard:save-replay-content-library-policy", "package.json script");

[
  "resolveCreatorReplayPlayback",
  "VideoView",
  "Controlled replay playback only.",
  "No raw HLS URL, storage path, LiveKit token, full-room token, publish authority, or host controls",
].forEach((needle) => assertIncludes(replayPlayerRoute, needle, "replay Player route"));

[
  "creator_replay_library_items",
  "can_read_creator_replay_library_item",
  "is_creator_replay_viewer_blocked",
  "creator-replay-playback",
  "rawHlsUrlReturned: false",
  "fullRoomTokenForSpectators: false",
  "liveKitPublishAuthorityGranted: false",
  "sourceType === \"watch_party_live\" && toText(room.source_type) === \"platform_title\"",
].forEach((needle) => {
  if (needle.includes("sourceType")) return;
  assertIncludes(replayPlaybackFunction, needle, "creator replay playback function");
});

[
  "participantToken",
  "livekitToken",
  "roomToken",
  "publishAuthority",
  "hostControls",
].forEach((needle) => {
  assertNotIncludes(replayLib, needle, "creator replay mobile helper");
  assertNotIncludes(studio, needle, "Content Library UI");
  assertNotIncludes(replayPlayerRoute, needle, "replay Player route");
});

[
  "Draft Post",
  "Save Draft Post",
  "Unpublished Post",
  "Posted to all Profiles",
  "AI picked this",
].forEach((needle) => {
  assertNotIncludes(viewerLibrary, needle, "viewer Library copy");
  assertNotIncludes(studio, needle, "Content Library copy");
});

assertNotIncludes(studio, "raw_hls_url", "Content Library UI");
assertNotIncludes(replayLib, "hls_playback_url", "creator replay helper");
assertNotIncludes(replayPlayerRoute, "hls_playback_url", "replay Player route");

console.log("Save Replay Content Library policy guard passed.");
