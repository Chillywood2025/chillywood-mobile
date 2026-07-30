#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  implementationRemoteRef,
  isValidGitBranchName,
  readJson,
  rel,
  sha256,
  stableJson,
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
const statePattern = new RegExp(schemas.$defs.currentTruthRecord.properties.openImplementationPrs.items.properties.state.pattern, "u");
for (const validState of ["open", "open-draft", "open draft"]) assert.equal(statePattern.test(validState), true);
for (const invalidState of ["", " ", " open", "open ", "\topen"]) assert.equal(statePattern.test(invalidState), false);

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
      "--now=2026-07-30T20:00:00Z"
    ], { cwd: rel(), encoding: "utf8" });
    assert.notEqual(cli.status, 0);
    return JSON.parse(cli.stdout.trim().split(/\r?\n/u).at(-1));
  };

  const payload = runSnapshotCli("empty-open-implementation-inventory.json", `${JSON.stringify({ openImplementationPrs: [] })}\n`);
  assert.equal(payload.headBindings.ok, true);
  assert.equal(payload.providerImplementationSnapshot.ok, false);
  assert(payload.findings.some(({ id }) => id === "ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_MISSING"));

  const invalidJsonPayload = runSnapshotCli("invalid.json", "{");
  assert.equal(invalidJsonPayload.ok, false);
  assert(invalidJsonPayload.findings.some(({ id }) => id === "ASSURANCE_PROVIDER_SNAPSHOT_READ_FAILED"));

  const invalidRootPayload = runSnapshotCli("invalid-root.json", "[]\n");
  assert.equal(invalidRootPayload.ok, false);
  assert(invalidRootPayload.findings.some(({ id }) => id === "ASSURANCE_PROVIDER_SNAPSHOT_ROOT_MALFORMED"));
} finally {
  fs.rmSync(tempDirectory, { recursive: true });
}

process.stdout.write(`current-truth head binding: PASS (29 cases, provider CLI fail-closed, deterministic 3/3, ${hashes[0]})\n`);
