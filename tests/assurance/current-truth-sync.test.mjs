#!/usr/bin/env node
import assert from "node:assert/strict";
import { validateEngineeringDoctrineTruth, verifyCurrentTruthSynchronization } from "../../scripts/assurance/lib.mjs";

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

const truthContract = JSON.parse((await import("node:fs")).readFileSync("config/assurance/current-truth-contract-v1.json", "utf8"));
assert.equal(validateEngineeringDoctrineTruth({}, truthContract, { currentMain: "8bf6459c3ae1cec62e26a1694f03063e4291b9f8", implementationMerged: false }).length, 0);
assert.equal(validateEngineeringDoctrineTruth({}, truthContract).some(({ id }) => id === "ASSURANCE_ENGINEERING_DOCTRINE_MISSING"), true);
assert.equal(validateEngineeringDoctrineTruth({}, truthContract, { currentMain: "f".repeat(40), implementationMerged: true }).some(({ id }) => id === "ASSURANCE_ENGINEERING_DOCTRINE_MISSING"), true);
assert.equal(validateEngineeringDoctrineTruth({ engineeringDoctrine: { status: "ACTIVE", boundedDefinition: "COMPLETE" } }, truthContract).some(({ id }) => id === "ASSURANCE_UNIVERSAL_COMPLETENESS_CLAIM_REJECTED"), true);
assert.deepEqual(truthContract.engineeringDoctrinePolicy.postMergeTruthPaths, requiredChangedPaths);
assert.equal(truthContract.engineeringDoctrinePolicy.postMergeNextTask, "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE");

process.stdout.write("current-truth synchronization contract: PASS (15 cases)\n");
