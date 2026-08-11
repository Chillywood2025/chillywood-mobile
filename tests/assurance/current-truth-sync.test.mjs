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

const successorChangedPaths = [...bootstrapChangedPaths, "docs/assurance/admission.json"];
const successor = {
  prNumber: 213,
  branch: "codex/d2a-release-critical-active-task-admission",
  firstParent: recordedMain,
  requiredSecondParentAncestor: "f".repeat(40),
  changedPaths: successorChangedPaths
};
const successorGit = (argv) => {
  if (argv[0] === "show") return "Merge pull request #213 from Chillywood2025/codex/d2a-release-critical-active-task-admission";
  if (argv[0] === "merge-base") return "";
  throw new Error(`unexpected git command: ${argv.join(" ")}`);
};
const admitted = verify({
  remoteMain: "e".repeat(40),
  changedPaths: successorChangedPaths,
  bootstrapMerge: { ...bootstrapMerge, successors: [successor] },
  gitCommand: successorGit
});
assert.equal(admitted.ok, true);
assert.equal(admitted.mode, "protected-successor-bootstrap-synchronization-merge");
assert.equal(verify({
  remoteMain: "e".repeat(40),
  changedPaths: successorChangedPaths,
  bootstrapMerge: { ...bootstrapMerge, successors: [successor] },
  gitCommand: (argv) => argv[0] === "show" ? "Merge pull request #999 from Chillywood2025/codex/unrelated" : ""
}).ok, false);
assert.equal(verify({
  remoteMain: "e".repeat(40),
  changedPaths: successorChangedPaths,
  bootstrapMerge: { ...bootstrapMerge, successors: [successor] },
  gitCommand: (argv) => { if (argv[0] === "show") return "Merge pull request #213 from Chillywood2025/codex/d2a-release-critical-active-task-admission"; throw new Error("not ancestor"); }
}).ok, false);
assert.equal(verify({
  remoteMain: "e".repeat(40),
  changedPaths: [...successorChangedPaths, "app/index.tsx"],
  bootstrapMerge: { ...bootstrapMerge, successors: [successor] },
  gitCommand: successorGit
}).ok, false);

process.stdout.write("current-truth synchronization contract: PASS (14 cases)\n");
