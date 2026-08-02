#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { directImportGrammar, evaluateParity, extractDirectModuleSpecifiers } from "../../scripts/assurance/release-parity.mjs";

const root = process.cwd();
const first = evaluateParity();
const second = evaluateParity();
const third = evaluateParity();
assert.equal(JSON.stringify(first), JSON.stringify(second));
assert.equal(JSON.stringify(second), JSON.stringify(third));
assert.equal(first.targets.length, 3);
assert.equal(first.dependencyIntegrity.status, "EXACT_LOCKED_DEPENDENCY_SET");
assert.equal(first.dependencyIntegrity.directPackages, 66);
assert.equal(first.dependencyIntegrity.fullTreeValidated, true);
assert.deepEqual(first.dependencyIntegrity.fullTreeProblems, []);
assert.match(first.dependencyIntegrity.packageSha256, /^[a-f0-9]{64}$/u);
assert.match(first.dependencyIntegrity.lockSha256, /^[a-f0-9]{64}$/u);
assert.deepEqual(first.directImportClosure, {
  discovered: 42, nativeMapped: 34, reviewedJsOnly: 8, unclassified: 0,
  grammarCounts: { STATIC_IMPORT_FROM: 451, SIDE_EFFECT_IMPORT: 2, DYNAMIC_IMPORT: 13, COMMONJS_REQUIRE: 7, EXPORT_FROM: 2 },
});
assert.deepEqual(directImportGrammar, ["STATIC_IMPORT_FROM", "SIDE_EFFECT_IMPORT", "DYNAMIC_IMPORT", "COMMONJS_REQUIRE", "EXPORT_FROM"]);
assert.deepEqual(extractDirectModuleSpecifiers(`
  import value from "expo-device";
  import "react-native-get-random-values";
  const dynamic = import("expo-updates");
  const commonJs = require("expo-camera");
  export { readAsStringAsync } from "expo-file-system";
`), [
  { grammar: "COMMONJS_REQUIRE", specifier: "expo-camera" },
  { grammar: "DYNAMIC_IMPORT", specifier: "expo-updates" },
  { grammar: "EXPORT_FROM", specifier: "expo-file-system" },
  { grammar: "SIDE_EFFECT_IMPORT", specifier: "react-native-get-random-values" },
  { grammar: "STATIC_IMPORT_FROM", specifier: "expo-device" },
]);

const registry = JSON.parse(fs.readFileSync("config/assurance/native-capability-registry-v1.json", "utf8"));
assert.deepEqual(registry.importCoverage.mappings["react-native-get-random-values"], { android: "android.random-values-native", ios: "ios.random-values-native" });
assert.equal(registry.importCoverage.excludedPackages["react-native-url-polyfill"].classification, "REVIEWED_JS_ONLY");
assert.deepEqual(registry.importCoverage.excludedPackages["react-native-url-polyfill"].coveredBy, { android: "android.react-native-core", ios: "ios.react-native-core" });
assert.equal(first.reviewedJsOnlySourceProof.length, 1);
assert.deepEqual(first.reviewedJsOnlySourceProof[0].entrypoints, ["index.js", "auto.js"]);
assert.equal(first.reviewedJsOnlySourceProof[0].nativeIndicators, 0);
assert.match(first.reviewedJsOnlySourceProof[0].sourceDigest, /^[a-f0-9]{64}$/u);

const byId = Object.fromEntries(first.targets.map((target) => [target.targetId, target]));
assert.equal(byId["android-chat-livekit-qa-build-86"].classification, "ACTIVE_INTERNAL_TARGET");
assert.equal(byId["ios-qa-build-8"].classification, "ACTIVE_INTERNAL_TARGET");
assert.equal(byId["android-production-build-84-historical"].classification, "HISTORICAL_ARTIFACT");
assert.equal(byId["android-chat-livekit-qa-build-86"].requiredCapabilities.length, 21);
assert.equal(byId["ios-qa-build-8"].requiredCapabilities.length, 26);
assert.equal(byId["android-production-build-84-historical"].requiredCapabilities.length, 21);
assert.ok(byId["android-chat-livekit-qa-build-86"].requiredCapabilities.includes("android.random-values-native"));
assert.ok(byId["ios-qa-build-8"].requiredCapabilities.includes("ios.random-values-native"));
for (const target of first.targets) {
  assert.equal(target.generatedNative.runs, "3/3");
  assert.equal(target.generatedNative.proofTier, "T1_SOURCE");
  assert.equal(target.generatedNative.compiledNativeProof, false);
  assert.equal(target.generatedNative.signedArtifactProof, false);
  assert.match(target.generatedNative.digest, /^[a-f0-9]{64}$/u);
  assert.deepEqual(target.missingCapabilities, []);
  assert.equal(target.profileDistribution, "store");
  assert.equal(target.directImportClosure.unclassified, 0);
  assert.ok(target.requiredCapabilities.every((capability) => target.providedCapabilities.includes(capability)));
  assert.equal(target.releaseIdentity.classification, "HISTORICAL_RECORDED_INPUT");
  assert.equal(target.releaseIdentity.currentlyReproved, false);
  assert.equal(target.rollback.classification, "ROLLBACK_INCOMPATIBLE");
  assert.equal(target.rollback.accepted, false);
  assert.deepEqual(target.mayProceed, { nativeCompilation: false, signedArtifactInspection: false, updatePublication: false, release: false });
  assert.deepEqual(target.proofTiers, {
    T0_REQUIREMENT: "REQUIREMENTS_CLEAR", T1_SOURCE: "SOURCE_CLEAR", T2_MODEL: "MODEL_CLEAR", T3_INTEGRATION: "BLOCKED_INTERNAL",
    T4_NATIVE_PROVIDER: "BLOCKED_EXTERNAL", T5_SIGNED_ARTIFACT: "HISTORICAL_INPUT_NOT_REPROVED",
    T6_INSTALLED_PHYSICAL: "HISTORICAL_INPUT_NOT_REPROVED", T7_PUBLIC_CANARY: "BLOCKED_EXTERNAL",
  });
}
assert.equal(byId["android-chat-livekit-qa-build-86"].rollback.identityStatus, "MISSING_HISTORICAL_ARTIFACT_IDENTITY");
assert.equal(byId["ios-qa-build-8"].rollback.identityStatus, "MISSING");
assert.equal(byId["android-production-build-84-historical"].rollback.missingCapabilities.length, 21);
assert.ok(byId["android-production-build-84-historical"].rollback.missingCapabilities.includes("android.image-manipulator"));
assert.equal(byId["android-chat-livekit-qa-build-86"].runtimeBinding.key, "ANDROID_CHAT_LIVEKIT_QA_RUNTIME_VERSION");
assert.equal(byId["ios-qa-build-8"].runtimeBinding.key, "IOS_QA_RUNTIME_VERSION");
assert.equal(byId["android-production-build-84-historical"].generatedNative.classification, "CURRENT_SOURCE_PROFILE_REPLAY_T1_ONLY_NOT_HISTORICAL_BUILD_84_PROOF");
assert.equal(byId["android-production-build-84-historical"].historicalArtifactEquivalentToCurrentReplay, false);
assert.equal(byId["android-production-build-84-historical"].historicalArtifactSource, "8c426f4e74de61de7d4529d32d124744833912dc");

const mandatory = {
  "wrong-environment": "ENVIRONMENT_MISMATCH", "runtime-channel-cross-bound": "RUNTIME_CHANNEL_MISMATCH",
  "platform-profile-cross-bound": "PLATFORM_PROFILE_MISMATCH", "required-capability-omitted": "REQUIRED_NATIVE_CAPABILITY_MISSING",
  "generated-native-digest-stale": "GENERATED_NATIVE_DIGEST_STALE", "signed-identity-falsely-proved": "SIGNED_ARTIFACT_PROOF_MISSING",
  "incompatible-rollback-accepted": "ROLLBACK_INCOMPATIBLE", "proof-substitution": "PROOF_SUBSTITUTION_REJECTED",
};
const controls = Object.fromEntries(first.negativeControls.results.map((result) => [result.fixtureId, result.observed]));
for (const [fixture, code] of Object.entries(mandatory)) assert.equal(controls[fixture], code);
assert.equal(first.negativeControls.required, 8);
assert.equal(first.negativeControls.total, 24);
assert.equal(first.negativeControls.passed, 24);
for (const fixture of ["source-tree-mismatch", "package-bundle-mismatch", "duplicate-target", "unknown-capability", "cross-platform-evidence", "unsafe-normalization"]) {
  assert.equal(first.negativeControls.results.find((result) => result.fixtureId === fixture)?.result, "FAIL_CLOSED");
}
for (const fixture of ["unqualified-target-classification", "unknown-fail-closed-target-classification", "current-release-identity-unproved", "profile-runtime-env-cross-bound", "profile-distribution-cross-bound", "direct-import-capability-omitted", "direct-import-mapping-omitted", "direct-import-wrong-platform", "direct-import-grammar-omitted", "historical-source-substitution"]) {
  assert.equal(first.negativeControls.results.find((result) => result.fixtureId === fixture)?.result, "FAIL_CLOSED");
}

const cli = (...args) => spawnSync(process.execPath, ["scripts/assurance/release-parity.mjs", ...args, "--json"], { cwd: root, encoding: "utf8" });
for (const [args, expected] of [
  [["--not-a-flag"], "UNKNOWN_FLAG"], [["--target=not-a-target"], "UNKNOWN_TARGET"], [["--fixture=not-a-fixture"], "UNKNOWN_FIXTURE"],
]) {
  const result = cli(...args);
  assert.notEqual(result.status, 0);
  assert.equal(JSON.parse(result.stdout).findings[0].code, expected);
}
const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-pr-d1-output-"));
try {
  const output = path.join(outputDir, "evidence.json");
  fs.writeFileSync(output, "preserve\n", { mode: 0o600 });
  const overwrite = cli("--target=android-production-build-84-historical", `--write-evidence=${output}`);
  assert.notEqual(overwrite.status, 0);
  assert.equal(JSON.parse(overwrite.stdout).findings[0].code, "EVIDENCE_OUTPUT_EXISTS");
  assert.equal(fs.readFileSync(output, "utf8"), "preserve\n");
} finally {
  fs.rmSync(outputDir, { recursive: true, force: true });
}
assert.equal(first.networkAccess, false);
assert.equal(first.providerContact, false);
assert.equal(first.buildPerformed, false);
assert.equal(first.otaPublished, false);
console.log(`release parity tests passed (3 targets; generated source 9/9; deterministic evidence 3/3; negative controls ${first.negativeControls.passed}/${first.negativeControls.total}).`);
