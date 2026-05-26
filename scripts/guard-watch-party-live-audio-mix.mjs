#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Watch-Party Live audio mix guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const player = read("app/player/[id].tsx");
const watchPartyWaitingRoom = read("app/watch-party/index.tsx");
const partyRoom = read("app/watch-party/[partyId].tsx");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx");
const livekitToken = read("supabase/functions/livekit-token/index.ts");
const livekitSurface = read("components/watch-party-live/livekit-stage-media-surface.tsx");

[
  "const isSharedPartyPlayback = inWatchParty && !isLiveModeFlag;",
  "WATCH_PARTY_LIVE_VIDEO_VOLUME_DEFAULT = 0.85",
  "WATCH_PARTY_LIVE_VOICE_VOLUME_DEFAULT = 1",
  "WATCH_PARTY_LIVE_DUCKED_VIDEO_VOLUME_DEFAULT = 0.3",
  "WATCH_PARTY_LIVE_DUCK_DOWN_MILLIS = 250",
  "WATCH_PARTY_LIVE_RESTORE_MILLIS = 700",
  "watchPartyLiveVoiceDetected",
  "effectiveVideoVolume",
  "isSharedPartyPlayback ? effectiveVideoVolume : 1",
  "applySharedVideoPlayerVolume",
  "Audio Mix",
  "Auto-duck",
  "Lower video when people talk",
  "AudioMixSlider label=\"Video\"",
].forEach((needle) => assertIncludes(player, needle, "Watch-Party Live player audio mix"));

[
  "Audio Mix",
  "Auto-duck",
  "Lower video when people talk",
  "WATCH_PARTY_LIVE_VIDEO_VOLUME_DEFAULT",
  "effectiveVideoVolume",
].forEach((needle) => {
  assertNotIncludes(watchPartyWaitingRoom, needle, "Watch-Party waiting room audio mix");
  assertNotIncludes(partyRoom, needle, "Party Room audio mix");
  assertNotIncludes(liveStage, needle, "Live Watch-Party / Live Stage audio mix");
});

[
  "createLocalAudioTrack",
  "createAudioTrack",
  "Track.Source.Microphone",
  "publishTrack",
  "publishVideoAudio",
  "videoAudioPublisher",
].forEach((needle) => assertNotIncludes(player, needle, "Watch-Party Live video audio publishing"));

[
  "Audio Mix",
  "Auto-duck",
  "effectiveVideoVolume",
  "WATCH_PARTY_LIVE_DUCKED_VIDEO_VOLUME_DEFAULT",
].forEach((needle) => {
  assertNotIncludes(livekitToken, needle, "LiveKit token issuer audio mix");
  assertNotIncludes(livekitSurface, needle, "shared LiveKit media surface audio mix");
});

assertNotIncludes(`${player}\n${watchPartyWaitingRoom}\n${partyRoom}\n${liveStage}`, "Mini Platform", "user-facing Mini Platform copy");

if (process.exitCode) process.exit(process.exitCode);
console.log("Watch-Party Live audio mix guard passed.");
