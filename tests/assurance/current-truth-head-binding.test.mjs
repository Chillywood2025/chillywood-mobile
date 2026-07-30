#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  implementationRemoteRef,
  sha256,
  stableJson,
  verifyCurrentTruthHeadBindings,
  verifyCurrentTruthSynchronization
} from "../../scripts/assurance/lib.mjs";

const main = "a".repeat(40);
const pr52Head = "b".repeat(40);
const pr64Recorded = "c".repeat(40);
const pr64Observed = "d".repeat(40);
const advancedCheckout = "e".repeat(40);
const pr52Branch = "codex/cognitive-level01-livekit-sentinel-live-activation";
const pr64Branch = "codex/first-pass-assurance-models";
const entries = [
  { number: 52, branch: pr52Branch, head: pr52Head, state: "open-draft", disposition: "reconcile" },
  { number: 64, branch: pr64Branch, head: pr64Recorded, state: "open-draft", disposition: "exact-review" }
];
const exactRefs = {
  [implementationRemoteRef(pr52Branch)]: pr52Head,
  [implementationRemoteRef(pr64Branch)]: pr64Recorded
};

const verify = (overrides = {}) => verifyCurrentTruthHeadBindings({
  openImplementationPrs: entries,
  observedRefs: exactRefs,
  branch: "main",
  head: main,
  remoteMain: main,
  ...overrides
});
const ids = (result) => result.findings.map(({ id }) => id);
const matrix = {};

matrix.exactMain = verify();
assert.equal(matrix.exactMain.ok, true);
assert.equal(matrix.exactMain.context, "main");

matrix.exactListedBranch = verify({
  branch: pr64Branch,
  head: pr64Recorded
});
assert.equal(matrix.exactListedBranch.ok, true);
assert.equal(matrix.exactListedBranch.context, "listed-implementation-branch");

matrix.pr64Stale = verify({
  observedRefs: { ...exactRefs, [implementationRemoteRef(pr64Branch)]: pr64Observed }
});
assert.equal(matrix.pr64Stale.ok, false);
assert(ids(matrix.pr64Stale).includes("ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_HEAD_STALE"));

matrix.listedBranchAdvanced = verify({
  branch: pr64Branch,
  head: advancedCheckout,
  observedRefs: { ...exactRefs, [implementationRemoteRef(pr64Branch)]: advancedCheckout }
});
assert.equal(matrix.listedBranchAdvanced.ok, false);
assert(ids(matrix.listedBranchAdvanced).includes("ASSURANCE_CURRENT_TRUTH_CHECKOUT_HEAD_STALE"));
assert(ids(matrix.listedBranchAdvanced).includes("ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_HEAD_STALE"));

matrix.missingRef = verify({
  observedRefs: { [implementationRemoteRef(pr52Branch)]: pr52Head }
});
assert.equal(matrix.missingRef.ok, false);
assert(ids(matrix.missingRef).includes("ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_REF_MISSING"));

matrix.duplicates = verify({
  openImplementationPrs: [
    ...entries,
    { ...entries[1], number: 52 }
  ]
});
assert.equal(matrix.duplicates.ok, false);
assert.equal(ids(matrix.duplicates).filter((id) => id === "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_DUPLICATE").length, 2);

matrix.malformedSha = verify({
  openImplementationPrs: [{ ...entries[0], head: "not-a-sha" }],
  observedRefs: { [implementationRemoteRef(pr52Branch)]: pr52Head }
});
assert.equal(matrix.malformedSha.ok, false);
assert(ids(matrix.malformedSha).includes("ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_HEAD_MALFORMED"));

matrix.detachedExplicit = verify({
  branch: "",
  head: pr64Recorded,
  explicitBranch: pr64Branch,
  explicitHead: pr64Recorded
});
assert.equal(matrix.detachedExplicit.ok, true);
assert.equal(matrix.detachedExplicit.context, "listed-implementation-branch");

matrix.detachedUnresolved = verify({
  branch: "",
  head: advancedCheckout
});
assert.equal(matrix.detachedUnresolved.ok, false);
assert(ids(matrix.detachedUnresolved).includes("ASSURANCE_CURRENT_TRUTH_DETACHED_CONTEXT_UNRESOLVED"));

const synchronization = verifyCurrentTruthSynchronization({
  recordedMain: main,
  remoteMain: advancedCheckout,
  parents: [main, pr52Head],
  changedPaths: ["config/assurance/current-truth-v1.json", "CURRENT_STATE.md", "NEXT_TASK.md"],
  requiredChangedPaths: ["config/assurance/current-truth-v1.json", "CURRENT_STATE.md", "NEXT_TASK.md"],
  allowedChangedPaths: ["config/assurance/current-truth-v1.json", "CURRENT_STATE.md", "NEXT_TASK.md"]
});
assert.equal(synchronization.ok, true);
matrix.mergeAwareMainWithStaleBinding = {
  synchronization,
  headBindings: matrix.pr64Stale
};
assert.equal(matrix.mergeAwareMainWithStaleBinding.synchronization.ok, true);
assert.equal(matrix.mergeAwareMainWithStaleBinding.headBindings.ok, false);

const hashes = Array.from({ length: 3 }, () => sha256(stableJson(matrix)));
assert.equal(new Set(hashes).size, 1);

process.stdout.write(`current-truth head binding: PASS (10 cases, deterministic 3/3, ${hashes[0]})\n`);
