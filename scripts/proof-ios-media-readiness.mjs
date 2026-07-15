import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
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
  "ImageManipulator.manipulate",
  "SaveFormat.JPEG",
  'mimeType: "image/jpeg"',
  "FileSystem.deleteAsync",
].forEach((expected) => includes(imageNormalization, expected, "HEIC/HEIF normalization"));

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
  'membershipState: "reconnecting"',
  "cameraEnabled: false",
  "micEnabled: false",
  "ensureInitialLocalStream(false)",
  "registerActiveMediaSessionStopper",
  "getMediaPermissionRecoveryMessage",
  "Linking.openSettings",
  "_switchCamera",
].forEach((expected) => includes(communicationHook, expected, "communication media lifecycle"));

const sessionProvider = read("_lib/session.tsx");
includes(sessionProvider, 'stopActiveMediaSessions("sign_out")', "sign-out media teardown");

const stageRoute = read("app/watch-party/live-stage/[partyId].tsx");
excludes(stageRoute, "useCameraPermissions", "live-stage explicit camera intent");
[
  'liveSurface !== "stage"',
  'mediaAppState !== "active"',
  "mayPublishLegacyStageAudio",
  "legacyStageCanPublishLocalMedia",
  "connect={shouldConnectRoom}",
  "effectivePublishLocalAudio",
  "effectivePublishLocalCamera",
  "registerActiveMediaSessionStopper",
].forEach((expected) => includes(stageRoute, expected, "live-stage media lifecycle"));

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
