#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const readJson = (relativePath) => JSON.parse(fs.readFileSync(relativePath, "utf8"));

const easJson = readJson("eas.json");
const appJson = readJson("app.json").expo;
const packageLock = readJson("package-lock.json");
const releaseManifest = readJson("config/release/android-production.json");
const chatQaReleaseManifest = readJson("config/release/android-chat-livekit-qa.json");
const profile = easJson.build?.["android-chat-livekit-qa"];
const lockedVersion = (packageName) => (
  packageLock.packages?.[`node_modules/${packageName}`]?.version
);

assert.equal(profile?.extends, "production");
assert.equal(profile?.channel, "android-chat-livekit-qa");
assert.equal(profile?.distribution, "store");
assert.equal(profile?.environment, "production");
assert.deepEqual(profile?.env, {
  ANDROID_CHAT_LIVEKIT_QA_RUNTIME_VERSION: "1.0.0-android-chat-call-action-v1",
});
assert.deepEqual(profile?.android, {
  buildType: "app-bundle",
});

assert.equal(easJson.build?.production?.channel, "production");
assert.equal(easJson.build?.production?.distribution, "store");
assert.equal(easJson.build?.production?.autoIncrement, true);
assert.equal(easJson.submit?.production?.android?.track, "internal");
assert.equal(easJson.submit?.closed?.android?.track, "alpha");

assert.equal(appJson.android?.package, "com.chillywood.mobile");
assert.equal(releaseManifest.runtimeVersion, "1.0.0-android-imagemanipulator-v1");
assert.equal(chatQaReleaseManifest.packageIdentifier, appJson.android?.package);
assert.equal(
  chatQaReleaseManifest.runtimeVersion,
  profile.env.ANDROID_CHAT_LIVEKIT_QA_RUNTIME_VERSION,
);
assert.equal(chatQaReleaseManifest.channel, profile.channel);
assert.equal(chatQaReleaseManifest.buildProfile, "android-chat-livekit-qa");
assert.equal(chatQaReleaseManifest.distributionSource, "google_play_internal");
assert.equal(chatQaReleaseManifest.expectedNativeBuild, "86");
assert.equal(chatQaReleaseManifest.status, "installed_verified");
assert.ok(
  Number(chatQaReleaseManifest.expectedNativeBuild)
    > Number(chatQaReleaseManifest.rollback?.nativeBuild),
);
assert.equal(chatQaReleaseManifest.authorizationScope, "one_replacement_internal_android_binary");
assert.deepEqual(chatQaReleaseManifest.deliveryReadback, {
  builtSourceCommit: "0cd2d981c79640199a02236abff6c79cbe0790ea",
  easBuildId: "f3220259-1209-411b-85fe-28891931bfa4",
  easSubmissionId: "69ced363-a94e-41fc-b3d6-7fb0c8a0ca93",
  embeddedUpdateId: "e3379ac9-61f0-40db-a014-81975be123e5",
  aabSha256: "fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44",
  playTrack: "internal",
  playReleaseStatus: "COMPLETED",
  playReleaseIdentity: "internal/versionCode/86",
  installer: "com.android.vending",
  inPlaceUpgrade: true,
  authenticatedSessionPreserved: true,
  embeddedBundleMatchedReviewedAab: true,
  embeddedManifestMatchedReviewedAab: true,
  newRuntimePublishedOtaCount: 0,
});
assert.equal(chatQaReleaseManifest.deliveryConstraints?.androidUninstallOrReset, false);
assert.equal(chatQaReleaseManifest.deliveryConstraints?.iosBinary, false);
assert.equal(chatQaReleaseManifest.deliveryConstraints?.publicRelease, false);
assert.equal(chatQaReleaseManifest.deliveryConstraints?.additionalOta, false);
assert.equal(lockedVersion("@livekit/react-native"), "2.10.0");
assert.equal(lockedVersion("@livekit/react-native-expo-plugin"), "1.0.2");
assert.equal(lockedVersion("@livekit/react-native-webrtc"), "144.0.0");
assert.equal(lockedVersion("livekit-client"), "2.18.3");

console.log("Chi'lly Chat LiveKit Android internal build profile guard passed.");
