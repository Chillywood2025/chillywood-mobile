import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

const readSource = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`Watch-Party LiveKit camera guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) {
    fail(`${label} is missing.`);
  }
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) {
    fail(`${label} must not be present.`);
  }
};

const assertBefore = (source, firstNeedle, secondNeedle, label) => {
  const firstIndex = source.indexOf(firstNeedle);
  const secondIndex = source.indexOf(secondNeedle);
  if (firstIndex < 0 || secondIndex < 0 || firstIndex > secondIndex) {
    fail(label);
  }
};

const livekitSurface = readSource("components/watch-party-live/livekit-stage-media-surface.tsx");
const partyRoom = readSource("app/watch-party/[partyId].tsx");
const player = readSource("app/player/[id].tsx");

assertNotIncludes(
  livekitSurface,
  "expo-camera",
  "LiveKit media surface importing expo-camera",
);
assertNotIncludes(
  livekitSurface,
  "<CameraView",
  "LiveKit media surface rendering a separate CameraView",
);
assertIncludes(
  livekitSurface,
  "mirror={isLocalParticipant}",
  "LiveKit bubble grid mirrored local VideoTrack rendering",
);

assertIncludes(
  partyRoom,
  "partyRoomCameraPreviewSuppressed",
  "Party Room handoff camera-preview suppression state",
);
assertIncludes(
  partyRoom,
  "const allowLocalCameraPreview = isNativeCameraPlatform && isFocused && !partyRoomCameraPreviewSuppressed;",
  "Party Room local preview focus/suppression gate",
);
assertBefore(
  partyRoom,
  "setPartyRoomCameraPreviewSuppressed(true);",
  "const joinResult = await prepareLiveKitJoinBoundary({",
  "Party Room must suppress expo-camera preview before preparing the LiveKit handoff.",
);
assertIncludes(
  partyRoom,
  "allowCameraPreview={allowLocalCameraPreview}",
  "Party Room bottom strip preview gate",
);
assertIncludes(
  partyRoom,
  "const showLocalCameraPreview = allowLocalCameraPreview && isCurrentUser && !!cameraPermission?.granted;",
  "Party Room live-grid preview gate",
);
assertNotIncludes(
  partyRoom,
  "allowCameraPreview={isNativeCameraPlatform}",
  "Party Room bottom strip raw native camera gate",
);
assertNotIncludes(
  partyRoom,
  "const showLocalCameraPreview = isNativeCameraPlatform && isCurrentUser && !!cameraPermission?.granted;",
  "Party Room live-grid raw native camera gate",
);

assertIncludes(
  player,
  "&& !shouldRenderWatchPartyLiveKit",
  "Player participant strip must disable expo-camera preview while Watch-Party LiveKit is rendered",
);

if (process.exitCode) {
  process.exit();
}

console.log("Watch-Party LiveKit camera guard passed.");
