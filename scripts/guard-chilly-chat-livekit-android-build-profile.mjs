#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";

const readJson = (relativePath) => JSON.parse(fs.readFileSync(relativePath, "utf8"));

const easJson = readJson("eas.json");
const appJson = readJson("app.json").expo;
const packageLock = readJson("package-lock.json");
const releaseManifest = readJson("config/release/android-production.json");
const profile = easJson.build?.["android-chat-livekit-qa"];
const lockedVersion = (packageName) => (
  packageLock.packages?.[`node_modules/${packageName}`]?.version
);

assert.equal(profile?.extends, "android-production-local-recovery");
assert.equal(profile?.channel, "android-chat-livekit-qa");
assert.equal(profile?.distribution, "store");
assert.equal(profile?.environment, "production");
assert.deepEqual(profile?.android, {
  buildType: "app-bundle",
  credentialsSource: "local",
});

assert.equal(easJson.build?.production?.channel, "production");
assert.equal(easJson.build?.production?.distribution, "store");
assert.equal(easJson.build?.production?.autoIncrement, true);
assert.equal(easJson.submit?.production?.android?.track, "internal");
assert.equal(easJson.submit?.closed?.android?.track, "alpha");

assert.equal(appJson.android?.package, "com.chillywood.mobile");
assert.equal(releaseManifest.runtimeVersion, "1.0.0-android-imagemanipulator-v1");
assert.equal(lockedVersion("@livekit/react-native"), "2.10.0");
assert.equal(lockedVersion("@livekit/react-native-expo-plugin"), "1.0.2");
assert.equal(lockedVersion("@livekit/react-native-webrtc"), "144.0.0");
assert.equal(lockedVersion("livekit-client"), "2.18.3");

console.log("Chi'lly Chat LiveKit Android internal build profile guard passed.");
