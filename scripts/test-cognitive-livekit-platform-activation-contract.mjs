#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readJson = (relativePath) =>
  JSON.parse(fs.readFileSync(path.join(root, relativePath), "utf8"));
const read = (relativePath) =>
  fs.readFileSync(path.join(root, relativePath), "utf8");
const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [
        key,
        canonicalize(value[key]),
      ]),
    );
  }
  return value;
};
const sha256 = (value) =>
  crypto.createHash("sha256").update(value).digest("hex");
const canonicalHash = (value) =>
  sha256(JSON.stringify(canonicalize(value)));

const contract = readJson(
  "config/intelligence/cognitive-livekit-platform-activation-v1.json",
);
const androidRelease = readJson(
  "config/release/android-chat-livekit-qa.json",
);
const iosRelease = readJson("config/release/ios-qa.json");
const migration = read(
  "supabase/migrations/20260730140101_cognitive_livekit_final_chat_source_identity_binding.sql",
);

const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

assert.equal(contract.schemaVersion, 1);
assert.equal(contract.contractId, "cognitive-livekit-platform-activation-v1");
assert.equal(contract.repository, "Chillywood2025/chillywood-mobile");
assert.equal(contract.environment, "production");
assert.equal(contract.applicationIdentifier, "com.chillywood.mobile");

for (const value of Object.values(contract.chatCallSource)) {
  assert.match(value, SHA1);
}
assert.equal(
  contract.chatCallSource.sourceTreeHash,
  "1abcd5e765a0dcac4ef0b40a2a90efb06f508fec",
);

const android = contract.platforms.android;
assert.equal(android.buildNumber, androidRelease.expectedNativeBuild);
assert.equal(android.runtimeVersion, androidRelease.runtimeVersion);
assert.equal(android.channel, androidRelease.channel);
assert.equal(
  android.installedSourceCommit,
  androidRelease.deliveryReadback.builtSourceCommit,
);
assert.equal(
  android.internalUpdateId,
  androidRelease.deliveryReadback.embeddedUpdateId,
);
assert.equal(
  android.installedArtifactSha256,
  androidRelease.deliveryReadback.aabSha256,
);
assert.equal(
  android.rollback.buildNumber,
  androidRelease.rollback.nativeBuild,
);
assert.equal(
  android.rollback.runtimeVersion,
  androidRelease.rollback.runtimeVersion,
);
assert.equal(android.rollback.updateId, androidRelease.rollback.updateId);
assert.equal(android.rollback.updateGroup, androidRelease.rollback.updateGroup);
assert.equal(android.rollback.sourceCommit, androidRelease.rollback.sourceCommit);

const ios = contract.platforms.ios;
assert.equal(ios.buildNumber, iosRelease.nativeBuild);
assert.equal(ios.runtimeVersion, iosRelease.runtimeVersion);
assert.equal(ios.channel, iosRelease.channel);
assert.equal(ios.installedArtifactSha256, iosRelease.binarySha256);

for (const platform of [android, ios]) {
  assert.equal(platform.appVersion, "1.0.0");
  assert.match(platform.installedSourceCommit, SHA1);
  assert.match(platform.internalUpdateId, UUID);
  assert.match(platform.installedArtifactSha256, SHA256);
  assert.match(platform.rollback.sourceCommit, SHA1);
  assert.match(platform.rollback.updateId, UUID);
  assert.match(platform.rollback.updateGroup, UUID);
  assert.match(platform.evidenceBinding.sourceBuildHash, SHA256);
  assert.match(platform.evidenceBinding.runtimeIdentityHash, SHA256);
  assert.equal(
    platform.evidenceBinding.sourceBuildHash,
    sha256(platform.installedSourceCommit),
  );
  assert.equal(
    platform.evidenceBinding.runtimeIdentityHash,
    canonicalHash({
      applicationIdentifier: contract.applicationIdentifier,
      appVersion: platform.appVersion,
      buildNumber: platform.buildNumber,
      channel: platform.channel,
      installedArtifactSha256: platform.installedArtifactSha256,
      installedSourceCommit: platform.installedSourceCommit,
      internalUpdateId: platform.internalUpdateId,
      runtimeVersion: platform.runtimeVersion,
    }),
  );
}

assert.deepEqual(contract.canary.routes, [
  "live-stage",
  "watch-party-live",
  "chat-call",
]);
assert.deepEqual(contract.canary.scenarios, [
  "success_baseline",
  "bounded_failure_fixture",
  "background_foreground_recovery",
]);
assert.equal(contract.canary.accountCount, 2);
assert.equal(contract.canary.roleFree, true);
assert.deepEqual(contract.canary.premiumProof, {
  source: "revenuecat",
  environment: "sandbox",
  accessGrantStatus: "sandbox_only",
  requiredUserCount: 2,
  activeManualGrantCount: 0,
  appliesToRoutes: ["live-stage", "watch-party-live"],
  chatCallRemainsRoleFree: true,
});
assert.equal(
  contract.canary.formalPlatformPassRequiredBeforeLiveSwitch,
  true,
);
assert.equal(contract.finalPolicies.sharedLiveKitEnabled, false);
assert.equal(contract.finalPolicies.recurringSchedulesEnabled, 0);

const deploymentHash = canonicalHash(contract);
assert.equal(
  deploymentHash,
  "7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0",
);
const rollbackHashes = Object.fromEntries(
  Object.entries(contract.platforms).map(([platform, identity]) => [
    platform,
    canonicalHash(identity.rollback),
  ]),
);
assert.deepEqual(rollbackHashes, {
  android:
    "0fbe0c0d5bf2fe593b23f8970fe03e85c2e32e9195ec93ac9533d254b9014759",
  ios:
    "37d14e930e6787973866b0a5f38c28e1484dac0cb187f4ecb5de363147528e48",
});

for (const required of [
  contract.chatCallSource.mergedMainCommit,
  contract.chatCallSource.sourceTreeHash,
  deploymentHash,
  android.buildNumber,
  android.runtimeVersion,
  android.channel,
  android.internalUpdateId,
  android.installedArtifactSha256,
  android.evidenceBinding.sourceBuildHash,
  android.evidenceBinding.runtimeIdentityHash,
  rollbackHashes.android,
  ios.buildNumber,
  ios.runtimeVersion,
  ios.channel,
  ios.internalUpdateId,
  ios.installedArtifactSha256,
  ios.evidenceBinding.sourceBuildHash,
  ios.evidenceBinding.runtimeIdentityHash,
  rollbackHashes.ios,
  "cognitive_livekit_platform_identity_v2",
  "cognitive_livekit_platform_run_identity_v2",
  "cognitive_require_livekit_platform_run_identity_v2",
  "cognitive_livekit_sandbox_premium_proof_v1",
  "governance_read_livekit_sandbox_premium_proof",
  "livekit_sandbox_premium_proof_rejected",
  "livekit_platform_identity_binding_requires_zero_state",
  "livekit_platform_run_identity_rejected",
]) {
  assert.ok(migration.includes(required), `migration missing ${required}`);
}

for (const forbidden of [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
  "DATABASE_URL",
  "access_token",
  "refresh_token",
  "LIVEKIT_API_SECRET",
  "LIVEKIT_API_KEY",
]) {
  assert.ok(!migration.includes(forbidden));
  assert.ok(!JSON.stringify(contract).includes(forbidden));
}

process.stdout.write(JSON.stringify({
  contractHash: deploymentHash,
  platformCount: Object.keys(contract.platforms).length,
  rollbackHashes,
  routeScenarioPairs:
    contract.canary.routes.length * contract.canary.scenarios.length,
  status: "pass",
}) + "\n");
