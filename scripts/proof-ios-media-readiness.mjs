import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const repoRoot = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
const includes = (source, expected, label) => {
  assert.ok(source.includes(expected), `${label}: missing ${JSON.stringify(expected)}`);
};
const excludes = (source, unexpected, label) => {
  assert.ok(!source.includes(unexpected), `${label}: found forbidden ${JSON.stringify(unexpected)}`);
};

const permissionSource = read("_lib/mediaPermissions.ts");
const permissionJavaScript = ts.transpileModule(permissionSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const permissionModule = await import(`data:text/javascript;base64,${Buffer.from(permissionJavaScript).toString("base64")}`);

assert.deepEqual(permissionModule.resolveMediaPermission(null), {
  canAskAgain: true,
  shouldOpenSettings: false,
  state: "undetermined",
});
assert.equal(permissionModule.resolveMediaPermission({ granted: true, status: "granted" }).state, "granted");
assert.deepEqual(permissionModule.resolveMediaPermission({ granted: false, status: "denied", canAskAgain: true }), {
  canAskAgain: true,
  shouldOpenSettings: false,
  state: "denied",
});
assert.deepEqual(permissionModule.resolveMediaPermission({ granted: false, status: "denied", canAskAgain: false }), {
  canAskAgain: false,
  shouldOpenSettings: true,
  state: "denied",
});
assert.equal(permissionModule.resolveMediaPermission({ status: "restricted" }).state, "restricted");
assert.match(
  permissionModule.getMediaPermissionRecoveryMessage("camera", {
    canAskAgain: false,
    shouldOpenSettings: true,
    state: "denied",
  }),
  /Open Settings/u,
);

const lifecycleJavaScript = ts.transpileModule(read("_lib/mediaSessionLifecycle.ts"), {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const lifecycleModule = await import(`data:text/javascript;base64,${Buffer.from(lifecycleJavaScript).toString("base64")}`);
const observedStopReasons = [];
const unregisterHealthyStopper = lifecycleModule.registerActiveMediaSessionStopper((reason) => {
  observedStopReasons.push(reason);
});
const unregisterFailingStopper = lifecycleModule.registerActiveMediaSessionStopper(() => {
  throw new Error("expected_test_failure");
});
await lifecycleModule.stopActiveMediaSessions("sign_out");
assert.deepEqual(observedStopReasons, ["sign_out"]);
unregisterHealthyStopper();
unregisterFailingStopper();

const imageNormalization = read("_lib/imageUploadNormalization.ts");
[
  "isHeicOrHeifImage",
  "requireOptionalNativeModule(IMAGE_MANIPULATOR_NATIVE_MODULE_NAME)",
  'await import("expo-image-manipulator")',
  "runImageManipulatorConversion",
  "SaveFormat.JPEG",
  'mimeType: "image/jpeg"',
  "FileSystem.deleteAsync",
].forEach((expected) => includes(imageNormalization, expected, "HEIC/HEIF normalization"));
excludes(
  imageNormalization,
  'import { ImageManipulator, SaveFormat } from "expo-image-manipulator"',
  "HEIC/HEIF eager native-package evaluation",
);
const imageManipulatorBoundary = read("_lib/imageManipulatorNativeBoundary.mjs");
[
  "native_module_unavailable",
  "package_runtime_invalid",
  "renderedImage?.release()",
  "context?.release()",
].forEach((expected) => includes(imageManipulatorBoundary, expected, "HEIC/HEIF native boundary"));

const imagePolicyJavaScript = ts.transpileModule(read("_lib/imageUploadPolicy.ts"), {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const imagePolicyModule = await import(`data:text/javascript;base64,${Buffer.from(imagePolicyJavaScript).toString("base64")}`);
assert.equal(imagePolicyModule.isHeicOrHeifImage({ uri: "file:///photo.HEIC" }), true);
assert.equal(imagePolicyModule.isHeicOrHeifImage({ uri: "file:///asset", mimeType: "image/heif" }), true);
assert.equal(imagePolicyModule.isHeicOrHeifImage({ uri: "file:///asset", mimeType: "image/heic-sequence" }), true);
assert.equal(imagePolicyModule.isHeicOrHeifImage({ uri: "file:///photo.jpg", mimeType: "image/jpeg" }), false);

const profileMedia = read("_lib/profileMedia.ts");
const socialPicker = read("_lib/socialAttachmentPicker.ts");
const socialAttachments = read("_lib/socialAttachments.ts");
for (const [label, source] of [
  ["profile picker", profileMedia],
  ["social picker", socialPicker],
]) {
  includes(source, "legacy: false", label);
  includes(source, "if (result.canceled) return null", label);
  excludes(source, "requestMediaLibraryPermissionsAsync", label);
}
includes(profileMedia, "normalizeImageUploadFile(file)", "profile upload conversion");
includes(profileMedia, "await normalized.cleanup()", "profile temporary-file cleanup");
includes(socialAttachments, "normalizeImageUploadFile(input.file)", "social upload conversion");
includes(socialAttachments, "await normalized.cleanup()", "social temporary-file cleanup");

const communicationHook = read("hooks/use-communication-room-session.ts");
[
  "pauseLocalMediaCapture",
  "stopLocalMediaKind",
  "cameraEnabled: false",
  "micEnabled: false",
  'ensureTrackKind("video", {',
  "attachToPeers: false",
  "expectedGeneration: generation",
  "discardRecoveredTrack",
  "registerActiveMediaSessionStopper",
  "getMediaPermissionRecoveryMessage",
  "Linking.openSettings",
].forEach((expected) => includes(communicationHook, expected, "communication media lifecycle"));

// Camera switching on the pinned native SDK requires video-only reacquisition.
// These narrow source checks protect that boundary; mounted/installed-SDK
// tests below prove behavior under controlled native receipts, not physical
// lens movement or delivered frames on an installed iPhone.
const assertSupportedCameraSwitch = (source) => {
  const start = source.indexOf("  const switchCamera = useCallback(");
  const end = source.indexOf("  const participants = useMemo", start);
  assert.ok(start >= 0 && end > start, "supported camera switch callback must be present");
  const cameraSwitch = source.slice(start, end);
  [
    "oldTrack.stop()",
    "await acquireOwnedLegacyMedia({ audio: false, video: true, facingMode })",
    "nextTrack.getSettings?.().facingMode !== facingMode",
    "await senders[0].replaceTrack(nextTrack)",
    "senders[0].track !== nextTrack",
    "!ownsIntent() || !ownsPeers()",
    "captureReservation?.adopt()",
  ].forEach((expected) => includes(cameraSwitch, expected, "supported owned video-only camera switch"));
  for (const unsupported of ["._switchCamera(", ".applyConstraints(", "stopCommunicationStream(", "setMicrophoneEnabled("]) {
    excludes(cameraSwitch, unsupported, "camera switch preserves audio and uses supported capture replacement");
  }
};
assertSupportedCameraSwitch(communicationHook);
// A source guard that accepted these mutations would only bless its own text.
// Both changes violate boundaries also exercised by the behavioral runners.
assert.throws(() => assertSupportedCameraSwitch(communicationHook.replace(
  "await acquireOwnedLegacyMedia({ audio: false, video: true, facingMode })",
  "await acquireOwnedLegacyMedia({ audio: true, video: true, facingMode })",
)), /supported owned video-only camera switch/u, "camera guard rejects opening the microphone during a lens change");
assert.throws(() => assertSupportedCameraSwitch(communicationHook.replace(
  "senders[0].track !== nextTrack", "false /* sender receipt check removed */",
)), /supported owned video-only camera switch/u, "camera guard rejects an unverified native sender replacement");

// A transport reconnect retains the recovery supervisor, but its heartbeat
// cannot re-publish a captured camera/microphone intent or revive a left row.
const communicationSource = read("_lib/communication.ts");
const heartbeatSource = communicationSource.slice(
  communicationSource.indexOf("export async function heartbeatCommunicationRoomSession"),
  communicationSource.indexOf("export async function getLinkedCommunicationRoom"),
);
[
  "expectedMembershipGeneration: string",
  "return touchCommunicationRoomSession(options)",
].forEach((expected) => includes(heartbeatSource, expected, "ownership-preserving liveness heartbeat"));
for (const mediaField of ["cameraEnabled:", "micEnabled:", "membershipState:", "camera_enabled:", "mic_enabled:", "membership_state:", "left_at:"]) {
  excludes(heartbeatSource, mediaField, "heartbeat cannot overwrite media or admission state");
}
const touchSource = communicationSource.slice(
  communicationSource.indexOf("export async function touchCommunicationRoomSession"),
  communicationSource.indexOf("export async function leaveCommunicationRoomSession"),
);
[
  "runExactSessionAccountBoundSupabaseMutationRpc",
  '>("touch_owned_communication_room_session", {',
  "p_expected_membership_generation: generation",
  "p_membership_state: options.membershipState === undefined ? null",
  "p_camera_enabled: options.cameraEnabled === undefined ? null",
  "p_mic_enabled: options.micEnabled === undefined ? null",
  "membership.membershipGeneration !== generation",
  "row?.left_at !== null",
].forEach((expected) => includes(touchSource, expected, "generation-bound owned heartbeat RPC"));
const reconnectSource = communicationHook.slice(
  communicationHook.indexOf('if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")'),
  communicationHook.indexOf("void init().catch"),
);
[
  'setChannelState("reconnecting")',
  'requestLegacySessionRestart(status === "CHANNEL_ERROR"',
  "await heartbeatCommunicationRoomSession({",
  "if (!isActiveGeneration()) return",
].forEach((expected) => includes(reconnectSource, expected, "generation-bound transport recovery"));
excludes(reconnectSource, "touchCommunicationRoomSession({", "reconnect cannot replay captured media state");

// Execute the current API, mounted-hook, and SQL regressions instead of treating
// source markers as proof of asynchronous or database behavior. These runners
// use controlled local transports and disposable PostgreSQL, never providers.
const runLivenessProof = (args, label) => {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 120_000,
    killSignal: "SIGKILL",
    maxBuffer: 8 * 1024 * 1024,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${label} failed:\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
};
const cameraProof = runLivenessProof([
  "--test", "--test-reporter=tap", "--test-name-pattern",
  "legacy supported camera flip|legacy camera retry|legacy foreground camera restore|installed RTC SDK",
  "tests/assurance/chat-call-native-state-mounted.test.mjs",
  "tests/assurance/chat-call-sdk-contract.test.mjs",
], "actual camera lifecycle and installed SDK boundary regressions");
for (const title of [
  "legacy supported camera flip reacquires video only and replaces senders while preserving microphone and call",
  "legacy camera retry cannot acknowledge SDK-swallowed sender replacement failure",
  "installed RTC SDK native sender rejection resolves but leaves old track: callers must verify the postcondition",
]) {
  assert.ok(cameraProof.split("\n").some((line) => /^ok \d+ - /u.test(line) && line.endsWith(` - ${title}`)),
    `camera selection must execute the behavioral assertion: ${title}`);
}
const passedCameraCases = Number(cameraProof.match(/^# pass (\d+)$/mu)?.[1] ?? 0);
console.log(`Camera replacement proof passed: ${passedCameraCases} actual-hook and installed-SDK cases with controlled native receipts.`);

const heartbeatProof = runLivenessProof([
  "--test", "--test-reporter=tap", "--test-name-pattern", "heartbeat",
  "tests/assurance/communication-operation-error-truth.test.mjs",
  "tests/assurance/android-chat-call-mic-control.test.mjs",
], "actual API and mounted heartbeat regressions");
const passedHeartbeatCases = Number(heartbeatProof.match(/^# pass (\d+)$/mu)?.[1] ?? 0);
assert.ok(passedHeartbeatCases > 0, "heartbeat selection must execute behavioral assertions");
runLivenessProof(["scripts/test-communication-terminal-postgres.mjs"], "actual SQL membership ownership regressions");
console.log(`Owned heartbeat proof passed: ${passedHeartbeatCases} actual API/mounted cases and the actual-SQL ownership suite.`);

const sessionProvider = read("_lib/session.tsx");
includes(sessionProvider, 'stopActiveMediaSessions("sign_out")', "sign-out media teardown");

const watchPartyRoomRoute = read("app/watch-party/[partyId].tsx");
[
  "partyRoomCameraPreviewIntent",
  'partyRoomAppState === "active"',
  "onTogglePartyRoomCameraPreview",
  'testID={partyRoomCameraPreviewIntent ? "watch-party-stop-camera-preview" : "watch-party-start-camera-preview"}',
  "Camera and mic publishing happen in the shared Player",
  "cameraEnabled: false",
  "micEnabled: false",
].forEach((expected) => includes(watchPartyRoomRoute, expected, "watch-party room explicit media intent"));
excludes(watchPartyRoomRoute, "Audio.requestPermissionsAsync", "watch-party room automatic microphone permission");
excludes(watchPartyRoomRoute, "new Audio.Recording", "watch-party room automatic microphone recording");
excludes(watchPartyRoomRoute, "requestCameraPermission().catch(() => {});", "watch-party room automatic camera permission");
assert.ok(
  watchPartyRoomRoute.indexOf("await requestCameraPermission()") > watchPartyRoomRoute.indexOf("const onTogglePartyRoomCameraPreview"),
  "watch-party room camera permission must remain inside the explicit preview handler",
);

const sharedPlayerRoute = read("app/player/[id].tsx");
[
  "watchPartyLocalMediaIntent",
  "watchPartyCameraPermissionGranted",
  "requestWatchPartyLocalMediaPermissions",
  "onToggleWatchPartyLocalMedia",
  "playerMediaIsInteractive",
  "shouldAutoStartAuthorizedNativeLiveKitMedia(Platform.OS)",
  "watchPartyLiveKitAutoStartedLocalMediaKeyRef",
  'testID={watchPartyLocalMediaIntent ? "shared-player-stop-local-media" : "shared-player-start-local-media"}',
  "publishWatchPartyLiveKitAudio = watchPartyLocalMediaIntent",
  "publishWatchPartyLiveKitVideo = watchPartyLocalMediaIntent",
].forEach((expected) => includes(sharedPlayerRoute, expected, "shared Player explicit LiveKit media intent"));
excludes(sharedPlayerRoute, "requestCameraPermission().catch(() => {});", "shared Player automatic camera permission");
const explicitSharedPlayerPermissionStart = sharedPlayerRoute.indexOf("const requestWatchPartyLocalMediaPermissions");
const explicitSharedPlayerPermissionEnd = sharedPlayerRoute.indexOf("const onToggleWatchPartyLocalMedia", explicitSharedPlayerPermissionStart);
const microphonePromptIndex = sharedPlayerRoute.indexOf("Audio.requestPermissionsAsync");
const cameraPromptIndex = sharedPlayerRoute.indexOf("await requestCameraPermission()");
assert.ok(
  explicitSharedPlayerPermissionStart >= 0
    && explicitSharedPlayerPermissionEnd > explicitSharedPlayerPermissionStart
    && microphonePromptIndex > explicitSharedPlayerPermissionStart
    && microphonePromptIndex < explicitSharedPlayerPermissionEnd
    && cameraPromptIndex > explicitSharedPlayerPermissionStart
    && cameraPromptIndex < explicitSharedPlayerPermissionEnd,
  "shared Player permission prompts must remain inside the explicit local-media handler",
);

const stageRoute = read("app/watch-party/live-stage/[partyId].tsx");
excludes(stageRoute, "useCameraPermissions", "live-stage explicit camera intent");
excludes(stageRoute, "Audio.requestPermissionsAsync", "live-stage automatic microphone permission");
excludes(stageRoute, "new Audio.Recording", "live-stage automatic microphone recording");
[
  'liveSurface !== "stage"',
  "legacyStageCanPublishLocalMedia",
  "stageLocalMediaIntent",
  "shouldAutoStartAuthorizedNativeLiveKitMedia(Platform.OS)",
  'mediaAppState === "active"',
  'testID={stageLocalMediaIntent ? "live-stage-stop-local-media" : "live-stage-start-local-media"}',
  "connect={shouldConnectRoom}",
  "effectivePublishLocalAudio",
  "effectivePublishLocalCamera",
  "registerActiveMediaSessionStopper",
].forEach((expected) => includes(stageRoute, expected, "live-stage native media lifecycle"));
includes(
  stageRoute.slice(
    stageRoute.indexOf("const renderStageTopChrome = () => ("),
    stageRoute.indexOf("const renderStageControlsSheet = () => {"),
  ),
  "isLiveFirstMode && shouldRenderStageLocalMediaControl",
  "live-stage Live-First local media stop/restart control reachability",
);

const stageSurface = read("components/watch-party-live/livekit-stage-media-surface.tsx");
[
  'appState === "active"',
  "connect={shouldConnectRoom}",
  "disableLocalMediaQuietly",
  "registerActiveMediaSessionStopper",
].forEach((expected) => includes(stageSurface, expected, "shared LiveKit stage lifecycle"));

const audioRouting = read("_lib/livekit/audioRouting.ts");
[
  "getAudioOutputs",
  "selectAudioOutput",
  "showAudioRoutePicker",
  'Platform.OS !== "ios"',
].forEach((expected) => includes(audioRouting, expected, "LiveKit audio routing"));

const packageJson = JSON.parse(read("package.json"));
assert.equal(packageJson.dependencies["expo-image-manipulator"], "~14.0.8");

const twoClientHarness = read("scripts/local-run-two-client-livekit-ios-readiness.mjs");
[
  "--live",
  "--self-test",
  "CHILLYWOOD_LIVEKIT_HARNESS_",
  "synthetic",
  "reconnect",
].forEach((expected) => includes(twoClientHarness, expected, "two-client LiveKit harness"));
excludes(twoClientHarness, "Object.keys(process.env)", "two-client LiveKit harness secret isolation");
excludes(twoClientHarness, "Object.entries(process.env)", "two-client LiveKit harness secret isolation");
excludes(twoClientHarness, "...process.env", "two-client LiveKit harness secret isolation");

console.log("iOS media readiness proof passed: permissions, HEIC uploads, teardown, routing, and bounded two-client harness are source-covered.");
