import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260730230022_cognitive_livekit_final_source_identity_cross_binding.sql";
const deployedPath =
  "supabase/migrations/20260730142519_cognitive_livekit_final_chat_source_identity_binding.sql";
const concurrencyPath =
  "scripts/test-cognitive-livekit-platform-authorization-concurrency.mjs";
const [migration, deployed, concurrency] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(deployedPath),
  readFile(concurrencyPath, "utf8"),
]);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

const common = {
  finalSourceCommit: "fcf45ab8d450e4d51e0e2a18c7c2d195d055a2b6",
  finalSourceTree: "1abcd5e765a0dcac4ef0b40a2a90efb06f508fec",
  deploymentHash:
    "7651ae1756b9b760ed7a710ca52b9d51748e353e77205248239b19f6f786c1e0",
  applicationIdentifier: "com.chillywood.mobile",
};
const bindings = {
  android: {
    ...common,
    distribution: "google_play_internal_testing",
    buildNumber: "86",
    runtime: "1.0.0-android-chat-call-action-v1",
    channel: "android-chat-livekit-qa",
    updateId: "e3379ac9-61f0-40db-a014-81975be123e5",
    artifactHash:
      "fba73b6e57c6d945ba598de207c5474475f696572c9ffbac8f6d2f908b036c44",
    deliveredSourceCommit: "0cd2d981c79640199a02236abff6c79cbe0790ea",
    sourceBuildHash:
      "d890810f04d3f3228113a9c3cfaa3ca6b285dd4eb4ceee61db4a5577ede9a050",
    runtimeIdentityHash:
      "5df93c17fa23805618391c54fb57ffd8da073083fd5de30a3814006562c365e0",
  },
  ios: {
    ...common,
    distribution: "internal_testflight",
    buildNumber: "8",
    runtime: "1.0.0-iosqa1",
    channel: "ios-qa",
    updateId: "019fb099-f7c3-7130-97aa-a4bb1c49792f",
    artifactHash:
      "24a951d58302dd73e13e4adc899fc28680472eb78f37cac04639ee95896e36d8",
    deliveredSourceCommit: "36c5d34e5db508112241651ff2a80056d594a797",
    sourceBuildHash:
      "73792a29b2de5445bc7fc718abd6463d812ffec6b566b00ab930045a32d266cb",
    runtimeIdentityHash:
      "17d0bf8d12eed354ab5784cc94a3373620c4a9dc09b9aeda81bdb13103351bcf",
  },
};
const matches = (platform, candidate) =>
  Object.entries(bindings[platform]).every(
    ([key, expected]) => candidate[key] === expected,
  );

test("the deployed migration remains byte-identical", () => {
  assert.equal(
    sha256(deployed),
    "af519609a5097be7b39ac7a7672884402c03ad2d69c1233018134b985a5bd204",
  );
  assert.ok(migrationPath > deployedPath);
});

test("the successor binds both exact platform identity tuples", () => {
  for (const [platform, binding] of Object.entries(bindings)) {
    assert.equal(matches(platform, binding), true);
    assert.equal(
      sha256(binding.deliveredSourceCommit),
      binding.sourceBuildHash,
    );
    for (const key of [
      "finalSourceCommit",
      "finalSourceTree",
      "deploymentHash",
      "runtime",
      "channel",
      "updateId",
      "artifactHash",
      "deliveredSourceCommit",
      "sourceBuildHash",
      "runtimeIdentityHash",
    ]) {
      assert.match(migration, new RegExp(binding[key]));
      assert.equal(
        matches(platform, { ...binding, [key]: `${binding[key]}-stale` }),
        false,
        `${platform} ${key} mismatch must fail`,
      );
    }
  }
});

test("enabled finalization joins authorization, receipt, and run identities", () => {
  assert.doesNotMatch(migration, /authorizations authorization\b/u);
  for (const required of [
    "authorization_value.preflight_receipt_id",
    "authorization_value.source_commit <> receipt_value.source_commit",
    "authorization_value.source_tree_hash <> receipt_value.source_tree_hash",
    "authorization_value.deployment_hash <> receipt_value.deployment_hash",
    "authorization_value.rollback_hash <> receipt_value.rollback_hash",
    "receipt_value.internal_update_id",
    "receipt_value.installed_artifact_hash",
    "run.source_build_hash",
    "run.runtime_identity_hash",
    "expected_pair_count <> 9",
  ]) {
    assert.ok(migration.includes(required), required);
  }
  assert.match(
    migration,
    /drop trigger if exists cognitive_livekit_platform_run_identity_v2/u,
  );
  assert.match(
    migration,
    /create trigger cognitive_livekit_platform_run_identity_v3/u,
  );
});

test("the concurrency fixture uses frozen receipt identity and provider proof", () => {
  for (const required of [
    common.finalSourceCommit,
    common.finalSourceTree,
    common.deploymentHash,
    bindings.android.artifactHash,
    bindings.ios.artifactHash,
    "cognitive_livekit_sandbox_premium_proof_v1",
  ]) {
    assert.ok(concurrency.includes(required), required);
  }
  assert.doesNotMatch(concurrency, /const sourceCommit = "a"\.repeat\(40\)/u);
  assert.doesNotMatch(concurrency, /const sourceTree = "b"\.repeat\(40\)/u);
});
