#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  baseSynchronizationFirstParentDistance,
  baseSynchronizationReviewReceiptHash,
  git,
  implementationRemoteRef,
  isValidGitBranchName,
  readJson,
  rel,
  sha256,
  stableJson,
  verifyBaseSynchronizedImplementationHead,
  verifyCurrentTruthBindingSynchronization,
  verifyCurrentTruthHeadBindings,
  verifyProviderImplementationSnapshot,
  verifyCurrentTruthSynchronization
} from "../../scripts/assurance/lib.mjs";

const main = "a".repeat(40);
const pr52Head = "b".repeat(40);
const pr64Recorded = "c".repeat(40);
const pr64Observed = "d".repeat(40);
const advancedCheckout = "e".repeat(40);
const pr52Branch = "codex/cognitive-level01-livekit-sentinel-live-activation";
const pr64Branch = "codex/first-pass-assurance-models";
const headBindingBranch = git(["branch", "--show-current"]) || "codex/first-pass-assurance-current-truth-head-binding";
const headBindingHead = git(["rev-parse", "HEAD"]);
assert.equal(isValidGitBranchName(headBindingBranch), true);
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

matrix.mainBehind = verify({ head: "f".repeat(40) });
assert.equal(matrix.mainBehind.ok, false);
assert(ids(matrix.mainBehind).includes("ASSURANCE_CURRENT_TRUTH_MAIN_CHECKOUT_STALE"));

matrix.mainAhead = verify({ head: advancedCheckout });
assert.equal(matrix.mainAhead.ok, false);
assert(ids(matrix.mainAhead).includes("ASSURANCE_CURRENT_TRUTH_MAIN_CHECKOUT_STALE"));

matrix.detachedExactMain = verify({ branch: "" });
assert.equal(matrix.detachedExactMain.ok, true);
assert.equal(matrix.detachedExactMain.context, "detached-main");

matrix.detachedExplicitMainExact = verify({
  branch: "",
  head: main,
  explicitBranch: "main",
  explicitHead: main
});
assert.equal(matrix.detachedExplicitMainExact.ok, true);
assert.equal(matrix.detachedExplicitMainExact.context, "detached-main");

for (const [label, checkout] of [["Behind", "f".repeat(40)], ["Ahead", advancedCheckout], ["Feature", pr64Recorded]]) {
  const result = verify({
    branch: "",
    head: checkout,
    explicitBranch: "main",
    explicitHead: checkout
  });
  matrix[`detachedExplicitMain${label}`] = result;
  assert.equal(result.ok, false);
  assert.equal(result.context, "invalid-main-context");
  assert(ids(result).includes("ASSURANCE_CURRENT_TRUTH_MAIN_CHECKOUT_STALE"));
}

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

const synchronizedTree = "1".repeat(40);
const sourceDeltaHash = "2".repeat(64);
const changedFileHash = "3".repeat(64);
const synchronizedPaths = ["config/assurance/example.json", "scripts/assurance/example.mjs"];
const baseSyncReviewEvidence = {
  reviewId: "pr64-base-sync-review-v1",
  classification: "BASE_SYNCHRONIZED_IMPLEMENTATION_BRANCH",
  implementationPrNumber: 64,
  implementationBranch: pr64Branch,
  immutableSourceHead: pr64Recorded,
  synchronizedBranchHead: pr64Observed,
  currentBase: main,
  synchronizedTree,
  canonicalSyntheticTree: synchronizedTree,
  sourceDeltaHash,
  changedFileHash,
  scopeStatus: "pass",
  reviewOnly: true,
  mergePermitted: false,
  criticalFindingCounts: { P0: 0, P1: 0 },
  reviewProvider: "INDEPENDENT_REPOSITORY_REVIEW",
  reviewerId: "independent-lane-1",
  reviewedCommit: pr64Observed,
  reviewedTree: synchronizedTree,
  reviewRef: "refs/remotes/origin/codex/pr64-review",
  reviewRefHead: "4".repeat(40),
  reviewRefTree: "5".repeat(40),
  reviewTimestamp: "2026-08-01T20:00:00Z"
};
baseSyncReviewEvidence.reviewReceiptHash = baseSynchronizationReviewReceiptHash(baseSyncReviewEvidence);
const baseSyncFacts = {
  sourceIsAncestor: true,
  commitDistance: 1,
  parents: [pr64Recorded, main],
  observedTree: synchronizedTree,
  canonicalTree: synchronizedTree,
  mergeConflict: false,
  reviewedSourceDeltaHash: sourceDeltaHash,
  synchronizedSourceDeltaHash: sourceDeltaHash,
  reviewedChangedFileHash: changedFileHash,
  synchronizedChangedFileHash: changedFileHash,
  reviewedChangedPaths: synchronizedPaths,
  synchronizedChangedPaths: [...synchronizedPaths].reverse(),
  providerHead: pr64Observed,
  reviewEvidence: [baseSyncReviewEvidence],
  reviewFreshnessHours: 24,
  evaluationTime: "2026-08-01T20:30:00Z"
};
const verifyBaseSync = (facts = {}) => verify({
  evaluationTime: baseSyncFacts.evaluationTime,
  observedRefs: { ...exactRefs, [implementationRemoteRef(pr64Branch)]: pr64Observed },
  baseSynchronizations: {
    [implementationRemoteRef(pr64Branch)]: { ...baseSyncFacts, ...facts }
  }
});

matrix.baseSynchronized = verifyBaseSync();
assert.equal(matrix.baseSynchronized.ok, true);
const synchronizedBinding = matrix.baseSynchronized.bindings.find(({ number }) => number === 64);
assert.equal(synchronizedBinding.classification, "BASE_SYNCHRONIZED_IMPLEMENTATION_BRANCH");
assert.equal(synchronizedBinding.recordedHead, pr64Recorded);
assert.equal(synchronizedBinding.observedHead, pr64Observed);

const currentTruthBinding = verifyCurrentTruthBindingSynchronization({
  sourceHead: pr64Recorded,
  synchronizedHead: pr64Observed,
  synchronizedTree: "f".repeat(40),
  currentMain: main,
  parents: [pr64Recorded],
  commitDistance: 1,
  changedPaths: ["NEXT_TASK.md", "config/assurance/current-truth-v1.json", "CURRENT_STATE.md"]
});
assert.equal(currentTruthBinding.ok, true);
assert.equal(currentTruthBinding.classification, "CURRENT_TRUTH_BINDING_COMMIT");
assert.equal(verifyCurrentTruthBindingSynchronization({
  ...currentTruthBinding,
  parents: [pr64Recorded],
  commitDistance: 1,
  changedPaths: ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json", "scripts/assurance/lib.mjs"]
}).ok, false);

const rejectionCases = [
  ["arbitraryCommit", { parents: [pr64Recorded] }, "ASSURANCE_BASE_SYNC_PARENT_SHAPE_INVALID"],
  ["emptyCommit", { parents: [pr64Recorded] }, "ASSURANCE_BASE_SYNC_PARENT_SHAPE_INVALID"],
  ["rebase", { parents: [main] }, "ASSURANCE_BASE_SYNC_PARENT_SHAPE_INVALID"],
  ["squash", { parents: [main] }, "ASSURANCE_BASE_SYNC_PARENT_SHAPE_INVALID"],
  ["cherryPick", { parents: [main] }, "ASSURANCE_BASE_SYNC_PARENT_SHAPE_INVALID"],
  ["firstParentChanged", { parents: ["5".repeat(40), main] }, "ASSURANCE_BASE_SYNC_FIRST_PARENT_INVALID"],
  ["otherBranchMerge", { parents: [pr64Recorded, "6".repeat(40)] }, "ASSURANCE_BASE_SYNC_SECOND_PARENT_INVALID"],
  ["oldMainMerge", { parents: [pr64Recorded, "7".repeat(40)] }, "ASSURANCE_BASE_SYNC_SECOND_PARENT_INVALID"],
  ["octopusMerge", { parents: [pr64Recorded, main, "8".repeat(40)] }, "ASSURANCE_BASE_SYNC_PARENT_SHAPE_INVALID"],
  ["canonicalConflict", { mergeConflict: true }, "ASSURANCE_BASE_SYNC_CANONICAL_MERGE_CONFLICT"],
  ["manualResolution", { observedTree: "9".repeat(40) }, "ASSURANCE_BASE_SYNC_TREE_MISMATCH"],
  ["alteredImplementation", { observedTree: "a".repeat(40) }, "ASSURANCE_BASE_SYNC_TREE_MISMATCH"],
  ["alteredMigrationBody", { observedTree: "b".repeat(40) }, "ASSURANCE_BASE_SYNC_TREE_MISMATCH"],
  ["sourceDeltaChanged", { synchronizedSourceDeltaHash: "c".repeat(64) }, "ASSURANCE_BASE_SYNC_SOURCE_DELTA_MISMATCH"],
  ["scopeHashChanged", { synchronizedChangedFileHash: "d".repeat(64) }, "ASSURANCE_BASE_SYNC_CHANGED_FILE_HASH_MISMATCH"],
  ["scopePathChanged", { synchronizedChangedPaths: [...synchronizedPaths, "src/unapproved.ts"] }, "ASSURANCE_BASE_SYNC_CHANGED_PATHS_MISMATCH"],
  ["sourceNotAncestor", { sourceIsAncestor: false }, "ASSURANCE_BASE_SYNC_SOURCE_NOT_ANCESTOR"],
  ["repeatedMergeChain", { commitDistance: 2 }, "ASSURANCE_BASE_SYNC_COMMIT_DISTANCE_INVALID"],
  ["providerMismatch", { providerHead: "e".repeat(40) }, "ASSURANCE_BASE_SYNC_PROVIDER_HEAD_MISMATCH"],
  ["missingReview", { reviewEvidence: [] }, "ASSURANCE_BASE_SYNC_REVIEW_EVIDENCE_MISSING_OR_STALE"],
  ["staleReview", { reviewEvidence: [{ ...baseSyncReviewEvidence, currentBase: "f".repeat(40) }] }, "ASSURANCE_BASE_SYNC_REVIEW_EVIDENCE_MISSING_OR_STALE"],
  ["expiredReview", { reviewEvidence: [{ ...baseSyncReviewEvidence, reviewTimestamp: "2026-07-30T20:00:00Z" }] }, "ASSURANCE_BASE_SYNC_REVIEW_EVIDENCE_MISSING_OR_STALE"],
  ["futureReview", { reviewEvidence: [{ ...baseSyncReviewEvidence, reviewTimestamp: "2026-08-02T20:00:00Z" }] }, "ASSURANCE_BASE_SYNC_REVIEW_EVIDENCE_MISSING_OR_STALE"],
  ["reviewAllowsMerge", { reviewEvidence: [{ ...baseSyncReviewEvidence, mergePermitted: true }] }, "ASSURANCE_BASE_SYNC_REVIEW_EVIDENCE_MISSING_OR_STALE"],
  ["reviewCriticalFinding", { reviewEvidence: [{ ...baseSyncReviewEvidence, criticalFindingCounts: { P0: 0, P1: 1 } }] }, "ASSURANCE_BASE_SYNC_REVIEW_EVIDENCE_MISSING_OR_STALE"],
  ["reviewProviderForged", { reviewEvidence: [{ ...baseSyncReviewEvidence, reviewProvider: "SELF_ATTESTED" }] }, "ASSURANCE_BASE_SYNC_REVIEW_EVIDENCE_MISSING_OR_STALE"],
  ["reviewReceiptAltered", { reviewEvidence: [{ ...baseSyncReviewEvidence, reviewReceiptHash: "6".repeat(64) }] }, "ASSURANCE_BASE_SYNC_REVIEW_EVIDENCE_MISSING_OR_STALE"]
];
for (const [label, facts, findingId] of rejectionCases) {
  const result = verifyBaseSync(facts);
  matrix[`baseSyncReject${label}`] = result;
  assert.equal(result.ok, false, label);
  assert(ids(result).includes("ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_HEAD_STALE"), label);
  assert(ids(result).includes(findingId), label);
}

matrix.baseSyncDirect = verifyBaseSynchronizedImplementationHead({
  number: 64,
  branch: pr64Branch,
  sourceHead: pr64Recorded,
  synchronizedHead: pr64Observed,
  currentMain: main,
  ...baseSyncFacts
});
assert.equal(matrix.baseSyncDirect.ok, true);

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

matrix.pseudoHeadBranch = verify({
  openImplementationPrs: [{ ...entries[0], branch: "HEAD" }],
  observedRefs: {}
});
assert.equal(matrix.pseudoHeadBranch.ok, false);
assert(ids(matrix.pseudoHeadBranch).includes("ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_BRANCH_MALFORMED"));
assert.equal(isValidGitBranchName("HEAD"), false);
assert.equal(implementationRemoteRef("HEAD"), null);

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

matrix.providerExact = verifyProviderImplementationSnapshot(entries, [...entries].reverse());
assert.equal(matrix.providerExact.ok, true);

matrix.providerEmpty = verifyProviderImplementationSnapshot(entries, []);
assert.equal(matrix.providerEmpty.ok, false);
assert.equal(ids(matrix.providerEmpty).filter((id) => id === "ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_MISSING").length, entries.length);

matrix.providerMismatch = verifyProviderImplementationSnapshot(entries, [
  { ...entries[0], state: "closed" },
  entries[1]
]);
assert.equal(matrix.providerMismatch.ok, false);
assert(ids(matrix.providerMismatch).includes("ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_MISMATCH"));

matrix.providerBaseSynchronized = verifyProviderImplementationSnapshot(entries, [
  entries[0],
  { ...entries[1], head: pr64Observed }
], matrix.baseSynchronized.acceptedBaseSynchronizations);
assert.equal(matrix.providerBaseSynchronized.ok, true);

matrix.providerBaseSynchronizedUnverified = verifyProviderImplementationSnapshot(entries, [
  entries[0],
  { ...entries[1], head: pr64Observed }
]);
assert.equal(matrix.providerBaseSynchronizedUnverified.ok, false);
assert(ids(matrix.providerBaseSynchronizedUnverified).includes("ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_MISMATCH"));

matrix.providerExtra = verifyProviderImplementationSnapshot(entries, [
  ...entries,
  { number: 99, branch: "codex/extra", head: "f".repeat(40), state: "open-draft" }
]);
assert.equal(matrix.providerExtra.ok, false);
assert(ids(matrix.providerExtra).includes("ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_EXTRA"));

matrix.providerMalformedDuplicate = verifyProviderImplementationSnapshot(entries, [
  entries[0],
  { ...entries[0], number: 0 }
]);
assert.equal(matrix.providerMalformedDuplicate.ok, false);
assert(ids(matrix.providerMalformedDuplicate).includes("ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_ENTRY_MALFORMED"));
assert(ids(matrix.providerMalformedDuplicate).includes("ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_DUPLICATE"));

matrix.providerDuplicateNumberAndBranch = verifyProviderImplementationSnapshot(entries, [
  ...entries,
  entries[0]
]);
assert.equal(matrix.providerDuplicateNumberAndBranch.ok, false);
assert.equal(ids(matrix.providerDuplicateNumberAndBranch).filter((id) => id === "ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_DUPLICATE").length, 2);

for (const [label, state] of [["Whitespace", "   "], ["Untrimmed", " open-draft "]]) {
  const result = verifyProviderImplementationSnapshot(entries, [
    { ...entries[0], state },
    entries[1]
  ]);
  matrix[`providerState${label}`] = result;
  assert.equal(result.ok, false);
  assert(ids(result).includes("ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_ENTRY_MALFORMED"));
}

const schemas = readJson("config/assurance/schemas-v1.json");
const branchPattern = new RegExp(schemas.$defs.gitBranch.pattern, "u");
for (const valid of [pr52Branch, pr64Branch]) assert.equal(branchPattern.test(valid), isValidGitBranchName(valid));
for (const hostile of ["HEAD", "@", ".hidden", "bad.lock", "bad branch", "bad\u0001branch", "bad\u007fbranch", "bad[branch", "bad]branch", "bad\\branch"]) {
  assert.equal(branchPattern.test(hostile), false, `schema accepted hostile branch ${JSON.stringify(hostile)}`);
  assert.equal(isValidGitBranchName(hostile), false, `runtime accepted hostile branch ${JSON.stringify(hostile)}`);
}
for (const codePoint of [...Array.from({ length: 33 }, (_, index) => index), 127]) {
  const hostile = `bad${String.fromCodePoint(codePoint)}branch`;
  assert.equal(branchPattern.test(hostile), false, `schema accepted control code ${codePoint}`);
  assert.equal(isValidGitBranchName(hostile), false, `runtime accepted control code ${codePoint}`);
}
const numberSchema = schemas.$defs.currentTruthRecord.properties.openImplementationPrs.items.properties.number;
assert.deepEqual(numberSchema, { type: "integer", minimum: 1 });
const stateValues = schemas.$defs.currentTruthRecord.properties.openImplementationPrs.items.properties.state.enum;
assert.deepEqual(stateValues, ["open", "open-draft-current"]);
for (const invalidState of ["", " ", " open", "open ", "\topen", "closed-unopened", "open-draft-stale"]) {
  assert.equal(stateValues.includes(invalidState), false);
}

const baseSyncContract = readJson("config/assurance/current-truth-contract-v1.json").implementationHeadBinding.baseSynchronization;
assert.equal(baseSyncContract.classification, "BASE_SYNCHRONIZED_IMPLEMENTATION_BRANCH");
assert.equal(baseSyncContract.exactHeadMatchingRemainsDefault, true);
assert.equal(baseSyncContract.commitDistance, 1);
assert.equal(baseSyncContract.commitDistanceTraversal, "first-parent");
assert.equal(baseSyncContract.ordinaryMergeParentCount, 2);
assert.equal(baseSyncContract.firstParent, "recorded-source-head");
assert.equal(baseSyncContract.secondParent, "exact-origin-main");
assert.equal(baseSyncContract.canonicalMergeTreeRequired, true);
assert.equal(baseSyncContract.sourceDeltaMustBeByteEquivalent, true);
assert.equal(baseSyncContract.changedPathSetMustBeEquivalent, true);
assert.equal(baseSyncContract.providerRemoteRefMustMatch, true);
assert.equal(baseSyncContract.reviewFreshnessHours, 24);
assert.equal(baseSyncContract.reviewProvider, "INDEPENDENT_REPOSITORY_REVIEW");
assert.equal(baseSyncContract.reviewReceiptHashAlgorithm, "sha256");
assert.equal(baseSyncContract.repeatedMergeChainAllowed, false);
assert.equal(baseSyncContract.manualResolutionAllowed, false);
assert.deepEqual(baseSyncContract.criticalFindingMaximum, { P0: 0, P1: 0 });

const topologyDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-base-sync-topology-"));
try {
  const runTopologyGit = (gitArgs) => {
    const result = spawnSync("git", gitArgs, { cwd: topologyDirectory, encoding: "utf8" });
    assert.equal(result.status, 0, `${gitArgs.join(" ")} failed: ${result.stderr}`);
    return result.stdout.trim();
  };
  runTopologyGit(["init", "--quiet"]);
  runTopologyGit(["config", "user.name", "Chi'llywood Assurance"]);
  runTopologyGit(["config", "user.email", "assurance@example.invalid"]);
  fs.writeFileSync(path.join(topologyDirectory, "base.txt"), "base\n");
  runTopologyGit(["add", "base.txt"]);
  runTopologyGit(["commit", "--quiet", "-m", "base"]);
  const baseHead = runTopologyGit(["rev-parse", "HEAD"]);

  runTopologyGit(["switch", "--quiet", "-c", "reviewed-source"]);
  fs.writeFileSync(path.join(topologyDirectory, "implementation.txt"), "reviewed source\n");
  runTopologyGit(["add", "implementation.txt"]);
  runTopologyGit(["commit", "--quiet", "-m", "reviewed source"]);
  const reviewedSourceHead = runTopologyGit(["rev-parse", "HEAD"]);

  runTopologyGit(["switch", "--quiet", "-c", "current-main", baseHead]);
  for (const version of [1, 2]) {
    fs.writeFileSync(path.join(topologyDirectory, "main.txt"), `main ${version}\n`);
    runTopologyGit(["add", "main.txt"]);
    runTopologyGit(["commit", "--quiet", "-m", `main ${version}`]);
  }
  runTopologyGit(["switch", "--quiet", "reviewed-source"]);
  runTopologyGit(["merge", "--quiet", "--no-ff", "--no-edit", "current-main"]);
  const synchronizedHead = runTopologyGit(["rev-parse", "HEAD"]);

  assert.equal(Number(runTopologyGit(["rev-list", "--count", `${reviewedSourceHead}..${synchronizedHead}`])), 3);
  assert.equal(baseSynchronizationFirstParentDistance(reviewedSourceHead, synchronizedHead, runTopologyGit), 1);
  assert.equal(baseSynchronizationFirstParentDistance("not-a-sha", synchronizedHead, runTopologyGit), null);
} finally {
  fs.rmSync(topologyDirectory, { recursive: true });
}

const hashes = Array.from({ length: 3 }, () => sha256(stableJson(matrix)));
assert.equal(new Set(hashes).size, 1);

const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-current-truth-provider-"));
try {
  const runSnapshotCli = (name, contents) => {
    const snapshotPath = path.join(tempDirectory, name);
    fs.writeFileSync(snapshotPath, contents, { mode: 0o600 });
    const cli = spawnSync(process.execPath, [
      rel("scripts/assurance/current-truth.mjs"),
      "--provider-mode=read-only",
      `--snapshot=${snapshotPath}`,
      `--implementation-branch=${headBindingBranch}`,
      `--implementation-head=${headBindingHead}`,
      "--now=2026-07-30T20:00:00Z"
    ], { cwd: rel(), encoding: "utf8" });
    assert.notEqual(cli.status, 0);
    return JSON.parse(cli.stdout.trim().split(/\r?\n/u).at(-1));
  };

  const payload = runSnapshotCli("unexpected-open-implementation-inventory.json", `${JSON.stringify({
    openImplementationPrs: [{ number: 999, branch: "codex/unexpected-provider-implementation", head: "9".repeat(40), state: "open-draft" }]
  })}\n`);
  assert.equal(payload.headBindings.context, "listed-implementation-branch");
  assert.equal(payload.providerImplementationSnapshot.ok, false);
  assert(payload.findings.some(({ id }) => id === "ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_EXTRA"));

  const invalidJsonPayload = runSnapshotCli("invalid.json", "{");
  assert.equal(invalidJsonPayload.ok, false);
  assert(invalidJsonPayload.findings.some(({ id }) => id === "ASSURANCE_PROVIDER_SNAPSHOT_READ_FAILED"));

  const invalidRootPayload = runSnapshotCli("invalid-root.json", "[]\n");
  assert.equal(invalidRootPayload.ok, false);
  assert(invalidRootPayload.findings.some(({ id }) => id === "ASSURANCE_PROVIDER_SNAPSHOT_ROOT_MALFORMED"));
} finally {
  fs.rmSync(tempDirectory, { recursive: true });
}

process.stdout.write(`current-truth head binding: PASS (exact-head cases unchanged; first-parent base-sync acceptance plus ${rejectionCases.length} fail-closed rejection cases; provider CLI fail-closed; deterministic 3/3; ${hashes[0]})\n`);
