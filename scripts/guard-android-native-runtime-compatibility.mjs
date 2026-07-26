#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { computeAndroidNativeCompatibility } from "./android-native-compatibility.mjs";

const root = process.cwd();
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const manifest = readJson("config/release/android-production.json");
const appJson = readJson("app.json").expo;
const packageJson = readJson("package.json");
const expoImageManipulatorModuleConfig = readJson("node_modules/expo-image-manipulator/expo-module.config.json");
const compatibility = computeAndroidNativeCompatibility();

assert.equal(manifest.platform, "android");
assert.equal(manifest.packageIdentifier, "com.chillywood.mobile");
assert.equal(manifest.runtimeVersion, "1.0.0-android-imagemanipulator-v1");
assert.notEqual(manifest.runtimeVersion, manifest.legacyBuild?.runtimeVersion);
assert.equal(manifest.legacyBuild?.nativeBuild, "80");
assert.equal(manifest.legacyBuild?.runtimeVersion, "1.0.0");
assert.equal(manifest.legacyBuild?.protectionState, "protected_by_existing_android_safety_ota");
assert.ok(Number.parseInt(manifest.nativeBuild, 10) > 82, "the replacement native build must be greater than consumed versionCode 82");
assert.match(manifest.expectedBinarySourceCommit, /^[0-9a-f]{40}$/u);
assert.equal(manifest.releaseStatus, "android_image_manipulator_incident_closed_internal_only");
assert.equal(manifest.distributionSource, "google_play_internal");
assert.equal(appJson.runtimeVersion, "1.0.0", "the shared/iOS runtime baseline must remain unchanged");
assert.equal(packageJson.dependencies?.["expo-image-manipulator"], "~14.0.8");
assert.equal(compatibility.summary.expoImageManipulatorVersion, "14.0.8");
assert.equal(compatibility.summary.expoImageManipulatorIntegrityPresent, true);
assert.ok(expoImageManipulatorModuleConfig.platforms?.includes("android"));
assert.ok(expoImageManipulatorModuleConfig.android?.modules?.includes("expo.modules.imagemanipulator.ImageManipulatorModule"));
assert.deepEqual(expoImageManipulatorModuleConfig.android?.publication, {
  groupId: "host.exp.exponent",
  artifactId: "expo.modules.imagemanipulator",
  version: "14.0.8",
  repository: "local-maven-repo",
});
assert.equal(manifest.nativeCompatibility?.schemaVersion, 1);
assert.equal(manifest.nativeCompatibility?.digest, compatibility.digest,
  "Android native compatibility inputs changed without reviewing the manifest digest and runtime boundary");

const reviewedBinding = (manifest.nativeCompatibility?.runtimeBindings ?? [])
  .find((binding) => binding.digest === compatibility.digest);
assert.ok(reviewedBinding, "the current Android native digest must have a reviewed runtime binding");
assert.equal(reviewedBinding.runtimeVersion, manifest.runtimeVersion);
const digestBindings = (manifest.nativeCompatibility?.runtimeBindings ?? [])
  .filter((binding) => binding.digest === compatibility.digest);
assert.equal(digestBindings.length, 1, "a native digest may bind to only one reviewed Android runtime");

const artifactEvidence = manifest.artifactEvidence ?? {};
for (const field of ["productionAabSha256", "qaApksSha256", "qaInstallArtifactSha256"]) {
  assert.match(artifactEvidence[field], /^[0-9a-f]{64}$/u, `${field} must contain an observed SHA-256`);
}
assert.match(artifactEvidence.signingCertificateSha256,
  /^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/u,
  "the release manifest may contain only the public signing-certificate SHA-256 fingerprint");
assert.equal(artifactEvidence.bundletoolValidationPassed, true);
assert.equal(artifactEvidence.manifestValidationPassed, true);
assert.equal(artifactEvidence.modulePackagingProved, true);
assert.equal(artifactEvidence.moduleRegistrationProved, true);
assert.equal(artifactEvidence.moduleClass, "expo.modules.imagemanipulator.ImageManipulatorModule");
assert.equal(artifactEvidence.moduleName, "ExpoImageManipulator");
assert.equal(artifactEvidence.runtimeModuleProved, true);
assert.equal(artifactEvidence.nativePathUsed, true);
assert.equal(artifactEvidence.fallbackUsed, false);
assert.equal(artifactEvidence.cleanInstallPassed, true);
assert.equal(artifactEvidence.inPlaceUpgradeState, "google_play_build_80_to_84_pass");
assert.equal(manifest.signingIncident?.compromisedEasCredentialRemoved, true);
assert.equal(manifest.signingIncident?.googlePlayAppSigningKeyChanged, false);
assert.equal(manifest.signingIncident?.replacementBackupsVerified, true);
assert.equal(manifest.signingIncident?.googleUploadKeyResetStatus, "upload_key_reset_effective");
assert.equal(manifest.signingIncident?.googlePlaySubmissionState, "internal_testing_available");
assert.equal(manifest.signingIncident?.replacementEasCredentialSynchronized, true);
assert.equal(manifest.signingIncident?.fourWayPublicCertificateMatch, true);

const playEvidence = manifest.playDistributionEvidence ?? {};
assert.equal(playEvidence.track, "internal");
assert.equal(playEvidence.nativeBuild, manifest.nativeBuild);
assert.equal(playEvidence.processingState, "available_to_internal_testers");
assert.equal(playEvidence.testerLane, "existing_bounded_email_list");
assert.ok(Number.isInteger(playEvidence.testerCount) && playEvidence.testerCount > 0 && playEvidence.testerCount <= 100);
assert.equal(playEvidence.productionTrackChanged, false);
assert.equal(playEvidence.openTestingTrackChanged, false);
assert.equal(playEvidence.closedTestingTrackChanged, false);
assert.equal(playEvidence.playDeliveredUpgradeState, "pass");
assert.equal(playEvidence.sessionPreservationState, "pass");
assert.equal(playEvidence.settingsPreservationState, "pass");
assert.equal(playEvidence.physicalNativeModuleState, "available");
assert.equal(playEvidence.physicalHeicState, "native_conversion_pass");
assert.match(playEvidence.submissionIdentifierSha256, /^[0-9a-f]{64}$/u);

const playUpgradeEvidence = manifest.playUpgradeEvidence ?? {};
assert.equal(playUpgradeEvidence.startingNativeBuild, "80");
assert.equal(playUpgradeEvidence.replacementNativeBuild, manifest.nativeBuild);
assert.equal(playUpgradeEvidence.installationSource, "google_play_internal");
assert.equal(playUpgradeEvidence.inPlaceWithoutDataClear, true);
assert.equal(playUpgradeEvidence.playAppSigningCertificateMatch, true);
assert.equal(playUpgradeEvidence.sessionPreserved, true);
assert.equal(playUpgradeEvidence.settingsPreserved, true);
assert.equal(playUpgradeEvidence.runtimeIsolationPassed, true);
assert.equal(playUpgradeEvidence.nativeModuleAvailable, true);
assert.equal(playUpgradeEvidence.nativePathUsed, true);
assert.equal(playUpgradeEvidence.fallbackUsed, false);
assert.equal(playUpgradeEvidence.heic, "native_conversion_saved_once");
assert.equal(playUpgradeEvidence.heif, "native_conversion_saved_once");
assert.equal(playUpgradeEvidence.corruptedHeic, "failed_safely_without_process_exit");
assert.equal(playUpgradeEvidence.backgroundForeground, "review_resumed_and_saved_once");
assert.equal(playUpgradeEvidence.historicalFatalObservedCount, 0);
assert.equal(playUpgradeEvidence.javascriptFatalObservedCount, 0);

const appConfig = read("app.config.ts");
assert.match(appConfig, /ANDROID_RELEASE_MANIFEST_PATH/u);
assert.match(appConfig, /runtimeVersion:\s*androidRuntimeVersion/u);
assert.match(appConfig, /"config",\s*"release",\s*"android-production\.json"/u);
assert.doesNotMatch(appConfig, /1\.0\.0-android-imagemanipulator-v1/u,
  "the Android runtime must be sourced from the canonical release manifest, not duplicated in app.config.ts");

const ci = read(".github/workflows/phase1-ci.yml");
assert.match(ci, /npm run guard:android-native-runtime-compatibility/u);
assert.equal(packageJson.scripts?.["guard:android-native-runtime-compatibility"],
  "node ./scripts/guard-android-native-runtime-compatibility.mjs");

const generatedContract = await import("../supabase/functions/_shared/release-manifest-contract.generated.mjs");
assert.equal(generatedContract.ANDROID_PRODUCTION_RELEASE_MANIFEST.runtimeVersion, manifest.runtimeVersion);
assert.equal(generatedContract.ANDROID_PRODUCTION_RELEASE_MANIFEST.nativeCompatibilityDigest, compatibility.digest);
assert.equal(generatedContract.IOS_QA_RELEASE_MANIFEST.runtimeVersion, "1.0.0-iosqa1");
assert.equal(generatedContract.IOS_QA_RELEASE_MANIFEST.nativeBuild, "8");

console.log(`Android native runtime compatibility guard passed (${compatibility.summary.nativePackageCount} native packages; digest ${compatibility.digest.slice(0, 12)}…).`);
