#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { evaluateParity } from "../../scripts/assurance/release-parity.mjs";

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

const byId = Object.fromEntries(first.targets.map((target) => [target.targetId, target]));
assert.equal(byId["android-chat-livekit-qa-build-86"].classification, "ACTIVE_INTERNAL_TARGET");
assert.equal(byId["ios-qa-build-8"].classification, "ACTIVE_INTERNAL_TARGET");
assert.equal(byId["android-production-build-84-historical"].classification, "HISTORICAL_ARTIFACT");
for (const target of first.targets) {
  assert.equal(target.generatedNative.runs, "3/3");
  assert.equal(target.generatedNative.proofTier, "T1_SOURCE");
  assert.equal(target.generatedNative.compiledNativeProof, false);
  assert.equal(target.generatedNative.signedArtifactProof, false);
  assert.match(target.generatedNative.digest, /^[a-f0-9]{64}$/u);
  assert.deepEqual(target.missingCapabilities, []);
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
assert.deepEqual(byId["android-production-build-84-historical"].rollback.missingCapabilities, ["android.image-manipulator"]);

const mandatory = {
  "wrong-environment": "ENVIRONMENT_MISMATCH", "runtime-channel-cross-bound": "RUNTIME_CHANNEL_MISMATCH",
  "platform-profile-cross-bound": "PLATFORM_PROFILE_MISMATCH", "required-capability-omitted": "REQUIRED_NATIVE_CAPABILITY_MISSING",
  "generated-native-digest-stale": "GENERATED_NATIVE_DIGEST_STALE", "signed-identity-falsely-proved": "SIGNED_ARTIFACT_PROOF_MISSING",
  "incompatible-rollback-accepted": "ROLLBACK_INCOMPATIBLE", "proof-substitution": "PROOF_SUBSTITUTION_REJECTED",
};
const controls = Object.fromEntries(first.negativeControls.results.map((result) => [result.fixtureId, result.observed]));
for (const [fixture, code] of Object.entries(mandatory)) assert.equal(controls[fixture], code);
assert.equal(first.negativeControls.required, 8);
assert.equal(first.negativeControls.total, 14);
assert.equal(first.negativeControls.passed, 14);
for (const fixture of ["source-tree-mismatch", "package-bundle-mismatch", "duplicate-target", "unknown-capability", "cross-platform-evidence", "unsafe-normalization"]) {
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
