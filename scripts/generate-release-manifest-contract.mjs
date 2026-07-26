#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const ios = readJson("config/release/ios-qa.json");
const android = readJson("config/release/android-production.json");
const freeze = (value) => `Object.freeze(${JSON.stringify(value, null, 2)})`;
const iosContract = {
  manifestVersion: ios.manifestVersion,
  platform: ios.platform,
  appId: ios.appStoreAppId,
  bundleIdentifier: ios.bundleIdentifier,
  appVersion: ios.appVersion,
  nativeBuild: ios.nativeBuild,
  runtimeVersion: ios.runtimeVersion,
  channel: ios.channel,
  distributionSource: ios.distributionSource,
  sourceCommit: ios.expectedBinarySourceCommit,
  binarySha256: ios.binarySha256,
  appStoreConnectBuildId: ios.appStoreConnectBuildId,
  clientCapabilities: ios.clientCapabilities,
};
const androidContract = {
  manifestVersion: android.manifestVersion,
  platform: android.platform,
  packageIdentifier: android.packageIdentifier,
  appVersion: android.appVersion,
  nativeBuild: android.nativeBuild,
  runtimeVersion: android.runtimeVersion,
  channel: android.channel,
  distributionSource: android.distributionSource,
  sourceCommit: android.expectedBinarySourceCommit,
  nativeCompatibilityDigest: android.nativeCompatibility?.digest ?? null,
};
const output = `// Generated from config/release/ios-qa.json and config/release/android-production.json.\n// Run npm run generate:release-manifest-contract; CI fails when these values drift.\nexport const IOS_QA_RELEASE_MANIFEST = ${freeze(iosContract)};\n\nexport const ANDROID_PRODUCTION_RELEASE_MANIFEST = ${freeze(androidContract)};\n`;
fs.writeFileSync(path.join(root, "supabase/functions/_shared/release-manifest-contract.generated.mjs"), output);
console.log("Generated release manifest contract.");
