#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`LiveKit simulcast/dynacast guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const count = (source, needle) => source.split(needle).length - 1;

const performancePolicy = read("_lib/performancePolicy.ts");
const livekitSurface = read("components/watch-party-live/livekit-stage-media-surface.tsx");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx");
const partyRoom = read("app/watch-party/[partyId].tsx");
const player = read("app/player/[id].tsx");
const spectator = read("app/spectate/[itemId].tsx");
const chatThread = read("app/chat/[threadId].tsx");
const communicationHook = read("hooks/use-communication-room-session.ts");
const communicationLib = read("_lib/communication.ts");
const tokenIssuer = read("supabase/functions/livekit-token/index.ts");
const oldRoomGuard = read("scripts/guard-old-room-handling.mjs");
const audioMixGuard = read("scripts/guard-watch-party-live-audio-mix.mjs");
const sharedRoom = read("_lib/watch-party/room-shared.ts");

assertIncludes(performancePolicy, "publishDefaults: {", "LiveKit v1 publish defaults");
assertIncludes(performancePolicy, "simulcast: true", "LiveKit v1 camera simulcast default");
assertIncludes(performancePolicy, "videoCaptureDefaults: LIVE_VIDEO_CAPTURE_OPTIONS", "LiveKit v1 capture defaults");
assertIncludes(performancePolicy, "maxBitrate: LIVE_VIDEO_ENCODING_MAX_BITRATE_BPS", "LiveKit v1 mobile bitrate cap");
assertNotIncludes(performancePolicy, "simulcast: false", "LiveKit v1 publish defaults");

assertIncludes(
  livekitSurface,
  "new Room(createLiveKitV1RoomOptions({ adaptiveStream: true, dynacast: true }))",
  "Watch-Party Live camera room options",
);
assertIncludes(
  liveStage,
  "new Room(createLiveKitV1RoomOptions({ adaptiveStream: true, dynacast: true }))",
  "Live Watch-Party / Live Stage camera room options",
);
assertIncludes(
  livekitSurface,
  "setCameraEnabled?.(shouldPublishLocalCamera, LIVE_VIDEO_CAPTURE_OPTIONS)",
  "Watch-Party Live camera publish toggle",
);
assertIncludes(
  liveStage,
  "video={publishLocalCamera ? LIVE_VIDEO_CAPTURE_OPTIONS : false}",
  "Live Stage camera publish prop",
);
assertNotIncludes(livekitSurface, "dynacast: false", "Watch-Party Live dynacast disable");
assertNotIncludes(liveStage, "dynacast: false", "Live Stage dynacast disable");

const cameraRoomOptionCalls = [
  livekitSurface,
  liveStage,
  partyRoom,
  player,
  spectator,
].reduce((total, source) => total + count(source, "createLiveKitV1RoomOptions({"), 0);
if (cameraRoomOptionCalls !== 2) {
  fail(`expected exactly two camera-scoped LiveKit v1 room option call sites; found ${cameraRoomOptionCalls}`);
}

assertNotIncludes(partyRoom, "createLiveKitV1RoomOptions", "Party Room direct LiveKit room options");
assertNotIncludes(partyRoom, "new Room(", "Party Room direct LiveKit Room creation");
assertNotIncludes(partyRoom, "LiveKitRoom", "Party Room direct LiveKitRoom ownership");
assertNotIncludes(player, "createLiveKitV1RoomOptions", "standalone/shared Player direct LiveKit room options");
assertNotIncludes(player, "new Room(", "standalone/shared Player direct LiveKit Room creation");
assertNotIncludes(spectator, "createLiveKitV1RoomOptions", "Spectator LiveKit room options");
assertNotIncludes(spectator, "LiveKitRoom", "Spectator LiveKit room ownership");
assertNotIncludes(chatThread, "createLiveKitV1RoomOptions", "Chi'lly Chat thread LiveKit room options");
assertNotIncludes(chatThread, "LiveKitRoom", "Chi'lly Chat thread LiveKit room ownership");
assertNotIncludes(chatThread, "prepareLiveKitJoinBoundary", "Chi'lly Chat thread LiveKit join boundary");
assertNotIncludes(communicationHook, "createLiveKitV1RoomOptions", "Chi'lly Chat communication hook LiveKit room options");
assertNotIncludes(communicationHook, "LiveKitRoom", "Chi'lly Chat communication hook LiveKit room ownership");
assertNotIncludes(communicationHook, "new Room(", "Chi'lly Chat communication hook LiveKit Room creation");
assertIncludes(communicationHook, "new rtc.RTCPeerConnection({", "Chi'lly Chat direct RTC peer connection");
assertIncludes(communicationHook, "peerConnection.addTrack(track, localStream)", "Chi'lly Chat direct RTC media publish");
assertIncludes(communicationLib, "export const COMMUNICATION_ROOM_MAX_PARTICIPANTS = 4;", "Chi'lly Chat conservative participant cap");
assertIncludes(communicationLib, "width: { ideal: 640, max: 1280 }", "Chi'lly Chat conservative video width");
assertIncludes(communicationLib, "height: { ideal: 480, max: 720 }", "Chi'lly Chat conservative video height");
assertIncludes(communicationLib, "frameRate: { ideal: 15, max: 24 }", "Chi'lly Chat conservative video frame rate");

[
  "createLocalAudioTrack",
  "createAudioTrack",
  "Track.Source.Microphone",
  "publishTrack",
  "publishVideoAudio",
  "videoAudioPublisher",
].forEach((needle) => assertNotIncludes(player, needle, "Watch-Party Live video-audio publisher"));

assertIncludes(sharedRoom, "export const LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS = 4;", "conservative live speaker seat cap");
assertIncludes(oldRoomGuard, "livekit-token/index.ts", "old-room guard token coverage");
assertIncludes(audioMixGuard, "supabase/functions/livekit-token/index.ts", "audio-mix guard token coverage");
assertNotIncludes(tokenIssuer, "adaptiveStream", "LiveKit token issuer room option");
assertNotIncludes(tokenIssuer, "dynacast", "LiveKit token issuer room option");
assertNotIncludes(tokenIssuer, "simulcast", "LiveKit token issuer publish option");

if (process.exitCode) process.exit(process.exitCode);
console.log("LiveKit simulcast/dynacast guard passed.");
