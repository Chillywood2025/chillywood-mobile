#!/usr/bin/env node
import assert from "node:assert/strict";
import { verifyCurrentTruthSynchronization } from "../../scripts/assurance/lib.mjs";

const recordedMain = "a".repeat(40);
const remoteMain = "b".repeat(40);
const requiredChangedPaths = [
  "config/assurance/current-truth-v1.json",
  "CURRENT_STATE.md",
  "NEXT_TASK.md"
];
const allowedChangedPaths = [
  ...requiredChangedPaths
];
const bootstrapChangedPaths = [...requiredChangedPaths, "scripts/assurance/lib.mjs"];
const bootstrapMerge = {
  mergeSha: remoteMain,
  firstParent: recordedMain,
  changedPaths: bootstrapChangedPaths
};
const verify = (overrides = {}) => verifyCurrentTruthSynchronization({
  recordedMain,
  remoteMain,
  parents: [recordedMain, "c".repeat(40)],
  changedPaths: requiredChangedPaths,
  requiredChangedPaths,
  allowedChangedPaths,
  bootstrapMerge,
  ...overrides
});

assert.deepEqual(verify({ remoteMain: recordedMain }), { ok: true, mode: "exact-main" });
assert.equal(verify().ok, true);
assert.equal(verify({ changedPaths: bootstrapChangedPaths }).ok, true);
assert.equal(verify({ changedPaths: bootstrapChangedPaths, remoteMain: "e".repeat(40) }).ok, false);
assert.equal(verify({ changedPaths: [...bootstrapChangedPaths, "app/index.tsx"] }).ok, false);
assert.equal(verify({ parents: [recordedMain] }).ok, false);
assert.equal(verify({ parents: ["d".repeat(40), "c".repeat(40)] }).ok, false);
assert.equal(verify({ changedPaths: requiredChangedPaths.slice(1) }).ok, false);
assert.equal(verify({ changedPaths: [...requiredChangedPaths, "app/index.tsx"] }).ok, false);

process.stdout.write("current-truth synchronization contract: PASS (9 cases)\n");
