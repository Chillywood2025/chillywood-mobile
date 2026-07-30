#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";

const manifest = JSON.parse(
  fs.readFileSync("config/release/chilly-chat-livekit-migration-readback.json", "utf8"),
);
const sha256File = (relativePath) => createHash("sha256")
  .update(fs.readFileSync(relativePath))
  .digest("hex");

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.scope, "chilly_chat_livekit_part_a");
assert.deepEqual(manifest.policy, {
  deployedMigrationRewritten: false,
  deployedMigrationRenamed: false,
  deployedMigrationDeleted: false,
  deployedMigrationReappliedByReconciliation: false,
});
assert.ok(Array.isArray(manifest.bindings));
assert.equal(manifest.bindings.length, 7);

const remoteVersions = new Set();
manifest.bindings.forEach((binding) => {
  assert.match(binding.remoteVersion, /^\d{14}$/u);
  assert.match(binding.remoteName, /^chilly_chat_[a-z0-9_]+$/u);
  assert.match(binding.localSource, /^supabase\/migrations\/\d{14}_chilly_chat_[a-z0-9_]+\.sql$/u);
  assert.match(binding.localSourceSha256, /^[0-9a-f]{64}$/u);
  assert.equal(remoteVersions.has(binding.remoteVersion), false);
  remoteVersions.add(binding.remoteVersion);
  assert.equal(
    sha256File(binding.localSource),
    binding.localSourceSha256,
    `${binding.localSource} changed after linked migration readback`,
  );
});

for (const requiredRemoteVersion of [
  "20260728141417",
  "20260728172910",
  "20260729020612",
  "20260729175447",
  "20260729204336",
  "20260730034533",
  "20260730040727",
]) {
  assert.ok(remoteVersions.has(requiredRemoteVersion));
}

const repeatedActiveThreadGuard = manifest.bindings.filter(
  (binding) => binding.remoteName === "chilly_chat_active_thread_clear_race_guard",
);
assert.equal(repeatedActiveThreadGuard.length, 2);
assert.deepEqual(
  repeatedActiveThreadGuard.map((binding) => binding.remoteDeploymentSequence),
  [1, 2],
);
assert.equal(
  new Set(repeatedActiveThreadGuard.map((binding) => binding.localSourceSha256)).size,
  1,
);

console.log("Chi'lly Chat linked migration readback guard passed.");
