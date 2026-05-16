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

const sliceBetween = (source, startNeedle, endNeedle, label) => {
  const startIndex = source.indexOf(startNeedle);
  const endIndex = source.indexOf(endNeedle, startIndex + startNeedle.length);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    fail(label);
    return "";
  }
  return source.slice(startIndex, endIndex);
};

const livekitSurface = readSource("components/watch-party-live/livekit-stage-media-surface.tsx");
const partyRoom = readSource("app/watch-party/[partyId].tsx");
const liveStage = readSource("app/watch-party/live-stage/[partyId].tsx");
const player = readSource("app/player/[id].tsx");
const partyRoomWatchTogether = sliceBetween(
  partyRoom,
  "const onWatchTogether = useCallback(async () => {",
  "const onPickPartyRoomCommentAttachment = useCallback(async () => {",
  "Party Room Watch Together handler boundary",
);

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
  livekitSurface,
  "const publishedLocalCameraTrackRef = useMemo(",
  "LiveKit media surface must render the published local camera track from useTracks before showing fallback",
);
assertIncludes(
  liveStage,
  "const publishedLocalCameraTrackRef = useMemo(",
  "Live Stage hero must render the published local LiveKit camera track from useTracks before showing fallback",
);
assertIncludes(
  liveStage,
  "const shouldAllowLegacyStageRtcModule = Platform.OS === \"web\" || !shouldRenderLiveKitStage;",
  "Live Stage must allow legacy camera RTC fallback when native LiveKit is not actively rendering",
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
  partyRoomWatchTogether,
  "const joinResult = await prepareLiveKitJoinBoundary({",
  "setPartyRoomCameraPreviewSuppressed(true);",
  "Party Room must not suppress expo-camera preview before the LiveKit handoff is ready.",
);
assertBefore(
  partyRoomWatchTogether,
  "setPartyRoomCameraPreviewSuppressed(false);",
  "Alert.alert(\n        \"Live feed unavailable\"",
  "Party Room must restore expo-camera preview before reporting an unavailable LiveKit handoff.",
);
assertBefore(
  partyRoomWatchTogether,
  "setPartyRoomCameraPreviewSuppressed(true);",
  "router.push({",
  "Party Room must suppress expo-camera preview only before routing into the LiveKit Player.",
);
assertIncludes(
  partyRoom,
  "liveKitIdentity: participantIdentity",
  "Party Room must pass the prepared LiveKit participant identity through the Player route handoff",
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
assertIncludes(
  player,
  "const liveKitParticipantIdentity = watchPartyLiveKitIdentity || trackedUserId;",
  "Player must consume the prepared Watch-Party LiveKit contract with the route handoff identity",
);

if (process.exitCode) {
  process.exit();
}

console.log("Watch-Party LiveKit camera guard passed.");
