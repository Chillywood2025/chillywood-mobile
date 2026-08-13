import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import { sha256, stableJson, validateProofTierStatuses } from "../../scripts/assurance/lib.mjs";
import { governedReceiptIdentityHash, governedReceiptRule } from "../../scripts/assurance/receipt.mjs";
import { repositorySnapshotDigest, targetDescriptor } from "../../scripts/assurance/codex-security-target.mjs";
import { deriveTaskScopeContext } from "../../scripts/assurance/pr-scope-lib.mjs";
import {
  beginDiscovery,
  benchmark,
  completeSourceReview,
  createLifecycle,
  descriptorValid,
  finalize,
  invalidateChangedSourceEvidence,
  lease,
  leaseCurrent,
  preflight,
  repositoryClosure,
  repositoryClosureFindingEvidenceHash,
  repositoryClosureRequiredFindingIds,
  repositoryClosureTestIds,
  reusable,
  sanitizeIncident,
  states,
  transition,
} from "../../scripts/assurance/codex-security-reliability.mjs";

const contractTexts = {
  "config/assurance/codex-security-reliability-s0-v1.json": "policy-v1",
  "config/assurance/escaped-defect-catalog-v1.json": "threat-v1",
  "config/assurance/feature-registry-v1.json": "feature-registry-v1",
};

function descriptor() {
  const value = {
    schemaVersion: 1,
    kind: "codex-security-target-v1",
    repository: { slug: "Chillywood2025/chillywood-mobile", originUrlSha256: sha256("https://github.com/Chillywood2025/chillywood-mobile.git") },
    base: { ref: "origin/main", head: "2".repeat(40), tree: "3".repeat(40) },
    target: { ref: "HEAD", head: "4".repeat(40), tree: "5".repeat(40) },
    changedPaths: [
      { status: "A", path: "added.mjs", beforeBlob: null, afterBlob: "6".repeat(40) },
      { status: "D", path: "deleted.mjs", beforeBlob: "7".repeat(40), afterBlob: null },
      { status: "M", path: "modified.mjs", beforeBlob: "8".repeat(40), afterBlob: "9".repeat(40) },
    ],
    changedPathWorklistSha256: "",
    contractHashes: {
      policySha256: sha256(contractTexts["config/assurance/codex-security-reliability-s0-v1.json"]),
      threatSha256: sha256(contractTexts["config/assurance/escaped-defect-catalog-v1.json"]),
      featureRegistrySha256: sha256(contractTexts["config/assurance/feature-registry-v1.json"]),
    },
    repositorySourceSnapshotDigest: "",
  };
  value.changedPathWorklistSha256 = sha256(value.changedPaths);
  value.repositorySourceSnapshotDigest = repositorySnapshotDigest(value);
  return value;
}

function changedDescriptor(original = descriptor()) {
  const value = structuredClone(original);
  value.target.head = "d".repeat(40);
  value.target.tree = "e".repeat(40);
  value.changedPaths[2].afterBlob = "f".repeat(40);
  value.changedPathWorklistSha256 = sha256(value.changedPaths);
  value.repositorySourceSnapshotDigest = repositorySnapshotDigest(value);
  return value;
}

function hostFor(value, overrides = {}) {
  const host = {
    scanId: "scan-s0-1",
    scanState: "RUNNING",
    repository: value.repository.slug,
    base: { head: value.base.head, tree: value.base.tree },
    target: { head: value.target.head, tree: value.target.tree, snapshotDigest: "f".repeat(64) },
    snapshotDigestExposed: true,
  };
  return { ...host, ...overrides };
}

function gitFor(value, replacement = value) {
  return (args) => {
    if (stableJson(args) === stableJson(["remote", "get-url", "origin"])) {
      return "https://github.com/Chillywood2025/chillywood-mobile.git";
    }
    if (args[0] === "rev-parse" && args[1] === "--verify") {
      const revision = args[2];
      if (revision === `${value.base.ref}^{commit}`) return replacement.base.head;
      if (revision === `${value.base.ref}^{tree}` || revision === `${replacement.base.head}^{tree}`) return replacement.base.tree;
      if (revision === `${value.target.ref}^{commit}`) return replacement.target.head;
      if (revision === `${value.target.ref}^{tree}` || revision === `${replacement.target.head}^{tree}`) return replacement.target.tree;
      for (const row of replacement.changedPaths) {
        if (revision === `${replacement.base.head}:${row.path}` && row.beforeBlob) return row.beforeBlob;
        if (revision === `${replacement.target.head}:${row.path}` && row.afterBlob) return row.afterBlob;
      }
    }
    if (stableJson(args.slice(0, 5)) === stableJson(["diff", "--no-ext-diff", "--name-status", "--no-renames", "-z"])
      && args[5] === `${replacement.base.head}..${replacement.target.head}`) {
      return `${replacement.changedPaths.map(({ status, path }) => `${status}\0${path}\0`).join("")}`;
    }
    if (args[0] === "show") {
      const [commit, file] = args[1].split(":");
      if (commit === replacement.target.head && Object.hasOwn(contractTexts, file)) return contractTexts[file];
    }
    throw new Error(`unexpected git read: ${args.join(" ")}`);
  };
}

function lifecycleFor(value = descriptor()) {
  const result = createLifecycle({ descriptor: value, scanId: `scan-s0-test:${crypto.randomUUID()}`, scanState: "RUNNING" });
  assert.equal(result.ok, true);
  return result.lifecycle;
}

function finalizeFor(input) {
  return finalize(input);
}

function sourceReviewFor(value, tests) {
  const review = {
    classification: "INDEPENDENT_EXACT_HEAD_REPOSITORY_SECURITY_REVIEW",
    target: value.target,
    coveredPaths: value.changedPaths.map(({ path }) => path),
    changedPathWorklistSha256: value.changedPathWorklistSha256,
    p0: 0,
    p1: 0,
    deferredFindings: [],
    findingDispositions: repositoryClosureRequiredFindingIds.map((findingId) => ({
      findingId,
      disposition: "CLOSED",
      evidenceHash: repositoryClosureFindingEvidenceHash(findingId, value, tests),
    })),
    exactReviewHash: "",
  };
  const { exactReviewHash: _ignored, ...payload } = review;
  review.exactReviewHash = sha256(payload);
  return review;
}

function rehashReview(review) {
  const { exactReviewHash: _ignored, ...payload } = review;
  review.exactReviewHash = sha256(payload);
}

function governedReceiptFor(id, value) {
  const rule = governedReceiptRule(id);
  assert.ok(rule, id);
  const receipt = {
    commandId: id,
    exactCommand: [rule.file, ...rule.args],
    sourceHead: value.target.head,
    sourceTree: value.target.tree,
    toolchainIdentity: { runnerNode: "v22.15.0", executable: rule.file },
    platform: "test-x64",
    configurationHash: sha256(rule),
    startedAtMs: 1,
    endedAtMs: 2,
    durationMs: 1,
    exitStatus: 0,
    signal: null,
    resultTotals: 1,
    assertionTotals: 1,
    result: { ok: true },
    failureCategory: null,
    outputHashes: {
      stdoutSha256: sha256(`stdout:${id}`),
      stderrSha256: sha256(""),
      combinedSha256: sha256(`result:${id}`),
    },
    cleanupState: "SYNCHRONOUS_CHILD_EXITED",
  };
  receipt.identityHash = governedReceiptIdentityHash(receipt);
  return receipt;
}

function closureFixture(value = descriptor()) {
  const receipts = new Map();
  const tests = repositoryClosureTestIds.map((id) => {
    const receipt = governedReceiptFor(id, value);
    const artifactLocation = `memory:${receipt.identityHash}`;
    receipts.set(artifactLocation, receipt);
    return {
      id,
      target: value.target,
      commandSha256: sha256(receipt.exactCommand),
      resultSha256: receipt.outputHashes.combinedSha256,
      passed: true,
      receiptIdentityHash: receipt.identityHash,
      artifactLocation,
    };
  });
  const input = {
    descriptor: value,
    activeLease: lease(value),
    lifecycle: null,
    classification: "REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED",
    requestedStatus: "REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED",
    reason: "HOSTED_SECURITY_SELF_APPROVAL_PROHIBITED",
    hostedSealingUsed: false,
    hostScanStarted: false,
    review: sourceReviewFor(value, tests),
    tests,
    noDeferredWork: true,
  };
  const dependencies = {
    runGit: gitFor(value),
    receiptArtifactDirectory: (identityHash) => `memory:${identityHash}`,
    readReceipt: (location) => structuredClone(receipts.get(location)),
  };
  return { input, dependencies, receipts };
}

function reachSourceReviewComplete(value = descriptor()) {
  const lifecycle = lifecycleFor(value);
  const host = hostFor(value, { scanId: lifecycle.scanId });
  const clear = preflight({ lifecycle, descriptor: value, host, runGit: gitFor(value) });
  assert.equal(clear.ok, true);
  const discovery = beginDiscovery({ lifecycle: clear.lifecycle, descriptor: value, runGit: gitFor(value) });
  assert.equal(discovery.ok, true);
  const completed = completeSourceReview({ lifecycle: discovery.lifecycle, descriptor: value, complete: true, runGit: gitFor(value) });
  assert.equal(completed.ok, true);
  return { lifecycle: completed.lifecycle, host };
}

test("target descriptor is deterministic and binds repository, trees, worklist, and source digest", () => {
  const first = targetDescriptor();
  const second = targetDescriptor();
  const third = targetDescriptor();
  assert.equal(first.ok, true);
  assert.deepEqual(first, second);
  assert.deepEqual(second, third);
  assert.equal(first.descriptor.repository.slug, "Chillywood2025/chillywood-mobile");
  assert.equal(first.descriptor.changedPathWorklistSha256, sha256(first.descriptor.changedPaths));
  assert.equal(first.descriptor.repositorySourceSnapshotDigest, repositorySnapshotDigest(first.descriptor));
  assert.equal(descriptorValid(first.descriptor), true);
});

test("descriptor validation fails closed on every exact identity class", () => {
  const baseline = descriptor();
  const attacks = [
    (value) => { value.repository.slug = "attacker/repository"; },
    (value) => { value.base.head = "0".repeat(40); },
    (value) => { value.target.tree = "0".repeat(40); },
    (value) => { value.changedPaths.reverse(); },
    (value) => { value.changedPaths[0].path = "../escape"; },
    (value) => { value.changedPaths[0].beforeBlob = "0".repeat(40); },
    (value) => { value.changedPathWorklistSha256 = "0".repeat(64); },
    (value) => { value.contractHashes.policySha256 = "0".repeat(64); },
    (value) => { value.repositorySourceSnapshotDigest = "0".repeat(64); },
    (value) => { value.unbound = true; },
  ];
  assert.equal(descriptorValid(baseline), true);
  for (const attack of attacks) {
    const candidate = structuredClone(baseline);
    attack(candidate);
    assert.equal(descriptorValid(candidate), false);
  }
});

test("preflight stops before discovery when host snapshot digest is unavailable", () => {
  const value = descriptor();
  const lifecycle = lifecycleFor(value);
  const unavailable = preflight({ lifecycle, descriptor: value, host: hostFor(value, { scanId: lifecycle.scanId, snapshotDigestExposed: false }), runGit: gitFor(value) });
  assert.equal(unavailable.status, "HOST_SNAPSHOT_DIGEST_NOT_PREFLIGHTABLE");
  assert.equal(unavailable.workersStarted, false);
  assert.equal(unavailable.lifecycle.state, "HOST_PREFLIGHT_BLOCKED");
  assert.equal(unavailable.lifecycle.terminal, true);
  const replayedPreflight = preflight({ lifecycle, descriptor: value, host: hostFor(value, { scanId: lifecycle.scanId }), runGit: gitFor(value) });
  assert.equal(replayedPreflight.status, "CODEX_SECURITY_ILLEGAL_TRANSITION");
  assert.equal(replayedPreflight.workersStarted, false);

  for (const snapshotDigest of [undefined, null, "", "not-a-digest"]) {
    const candidateLifecycle = lifecycleFor(value);
    const host = hostFor(value, { scanId: candidateLifecycle.scanId });
    host.target.snapshotDigest = snapshotDigest;
    const missing = preflight({ lifecycle: candidateLifecycle, descriptor: value, host, runGit: gitFor(value) });
    assert.equal(missing.status, "BLOCKED_TOOLING_CODEX_SECURITY_SNAPSHOT_DIGEST_PREFLIGHT");
    assert.equal(missing.discoveryAuthorized, false);
    assert.equal(missing.workersStarted, false);
  }
});

test("preflight requires exact repository, scan, base, target, state, and separated digests", () => {
  const value = descriptor();
  const attacks = [
    (host) => { host.repository = "attacker/repository"; },
    (host) => { host.scanId = "another-scan"; },
    (host) => { host.scanState = "QUEUED"; },
    (host) => { host.base.head = "0".repeat(40); },
    (host) => { host.base.tree = "0".repeat(40); },
    (host) => { host.target.head = "0".repeat(40); },
    (host) => { host.target.tree = "0".repeat(40); },
    (host) => { host.target.snapshotDigest = value.repositorySourceSnapshotDigest; },
  ];
  for (const attack of attacks) {
    const lifecycle = lifecycleFor(value);
    const host = structuredClone(hostFor(value, { scanId: lifecycle.scanId }));
    attack(host);
    const result = preflight({ lifecycle, descriptor: value, host, runGit: gitFor(value) });
    assert.equal(result.ok, false);
    assert.equal(result.workersStarted, false);
    assert.equal(result.lifecycle.terminal, true);
  }
});

test("discovery begins only after clear exact preflight and a current source lease", () => {
  const value = descriptor();
  const lifecycle = lifecycleFor(value);
  assert.equal(beginDiscovery({ lifecycle, descriptor: value }).status, "CODEX_SECURITY_ILLEGAL_TRANSITION");
  assert.equal(transition(lifecycle, "DISCOVERY_RUNNING").status, "CODEX_SECURITY_ILLEGAL_TRANSITION");

  const clear = preflight({ lifecycle, descriptor: value, host: hostFor(value, { scanId: lifecycle.scanId }), runGit: gitFor(value) });
  assert.equal(clear.ok, true);
  assert.equal(clear.workersStarted, false);
  const started = beginDiscovery({ lifecycle: clear.lifecycle, descriptor: value, runGit: gitFor(value) });
  assert.equal(started.ok, true);
  assert.equal(started.workersStarted, true);

  const driftLifecycle = lifecycleFor(value);
  const driftClear = preflight({ lifecycle: driftLifecycle, descriptor: value, host: hostFor(value, { scanId: driftLifecycle.scanId }), runGit: gitFor(value) });
  const drifted = beginDiscovery({ lifecycle: driftClear.lifecycle, descriptor: changedDescriptor(value), runGit: gitFor(value) });
  assert.equal(drifted.status, "CODEX_SECURITY_SOURCE_LEASE_CHANGED");
  assert.equal(drifted.workersStarted, false);
  assert.equal(drifted.lifecycle.terminal, true);

  const pushLifecycle = lifecycleFor(value);
  const pushClear = preflight({ lifecycle: pushLifecycle, descriptor: value, host: hostFor(value, { scanId: pushLifecycle.scanId }), runGit: gitFor(value) });
  const pushed = beginDiscovery({ lifecycle: pushClear.lifecycle, descriptor: value, runGit: gitFor(value, changedDescriptor(value)) });
  assert.equal(pushed.status, "CODEX_SECURITY_SOURCE_LEASE_CHANGED");
  assert.equal(pushed.workersStarted, false);
  assert.equal(pushed.lifecycle.terminal, true);
});

test("one exact completion attempt seals and cannot be retried", () => {
  const value = descriptor();
  const reached = reachSourceReviewComplete(value);
  const result = finalizeFor({
    lifecycle: reached.lifecycle,
    descriptor: value,
    host: reached.host,
    sourceReviewComplete: true,
    coverageComplete: true,
    deferredFindings: [],
    ledger: { discovery: true, validation: true, attackPath: true, policy: true },
    runGit: gitFor(value),
  });
  assert.equal(result.ok, true);
  assert.equal(result.lifecycle.state, "SEALED");
  assert.equal(result.lifecycle.completionAttempts, 1);
  assert.equal(result.lifecycle.terminal, true);
  assert.equal(finalizeFor({ lifecycle: result.lifecycle, descriptor: value, host: reached.host }).status, "CODEX_SECURITY_COMPLETION_ALREADY_ATTEMPTED");
  assert.equal(transition(result.lifecycle, "CANCELED").status, "CODEX_SECURITY_ILLEGAL_TRANSITION");
});

test("scan registration and state versions reject duplicate or stale lifecycle snapshots", () => {
  const value = descriptor();
  const input = { descriptor: value, scanId: `scan-duplicate-s0:${crypto.randomUUID()}`, scanState: "RUNNING" };
  const first = createLifecycle(input);
  assert.equal(first.ok, true);
  assert.equal(first.lifecycle.stateVersion, 0);
  assert.equal(createLifecycle(input).status, "CODEX_SECURITY_SCAN_ALREADY_REGISTERED");

  const host = hostFor(value, { scanId: input.scanId });
  const clear = preflight({ lifecycle: first.lifecycle, descriptor: value, host, runGit: gitFor(value) });
  assert.equal(clear.lifecycle.stateVersion, 1);
  const stale = structuredClone(clear.lifecycle);
  stale.stateVersion = 0;
  assert.equal(beginDiscovery({ lifecycle: stale, descriptor: value, runGit: gitFor(value) }).status, "CODEX_SECURITY_ILLEGAL_TRANSITION");
});

test("failed finalization is terminal and consumes the sole completion attempt", () => {
  const value = descriptor();
  const reached = reachSourceReviewComplete(value);
  const lateMissing = structuredClone(reached.host);
  lateMissing.target.snapshotDigest = "";
  const failure = finalizeFor({
    lifecycle: reached.lifecycle,
    descriptor: value,
    host: lateMissing,
    sourceReviewComplete: true,
    coverageComplete: true,
    deferredFindings: [],
    ledger: { discovery: true, validation: true, attackPath: true, policy: true },
    runGit: gitFor(value),
  });
  assert.equal(failure.ok, false);
  assert.equal(failure.lifecycle.state, "SOURCE_REVIEW_COMPLETE_SEAL_BLOCKED_TOOLING");
  assert.equal(failure.lifecycle.completionAttempts, 1);
  assert.equal(failure.lifecycle.terminal, true);
  assert.equal(finalizeFor({ lifecycle: failure.lifecycle, descriptor: value, host: reached.host }).status, "CODEX_SECURITY_COMPLETION_ALREADY_ATTEMPTED");

  const replay = finalizeFor({
    lifecycle: reached.lifecycle,
    descriptor: value,
    host: reached.host,
    sourceReviewComplete: true,
    coverageComplete: true,
    deferredFindings: [],
    ledger: { discovery: true, validation: true, attackPath: true, policy: true },
    runGit: gitFor(value),
  });
  assert.equal(replay.status, "CODEX_SECURITY_COMPLETION_ALREADY_ATTEMPTED");
  const recreated = createLifecycle({ descriptor: value, scanId: reached.lifecycle.scanId, scanState: "RUNNING" });
  assert.equal(recreated.status, "CODEX_SECURITY_SCAN_ALREADY_REGISTERED");

  const pushed = reachSourceReviewComplete(value);
  const changedDuringReview = finalizeFor({
    lifecycle: pushed.lifecycle,
    descriptor: value,
    host: pushed.host,
    sourceReviewComplete: true,
    coverageComplete: true,
    deferredFindings: [],
    ledger: { discovery: true, validation: true, attackPath: true, policy: true },
    runGit: gitFor(value, changedDescriptor(value)),
  });
  assert.equal(changedDuringReview.status, "CODEX_SECURITY_FINALIZATION_GUARD");
  assert.equal(changedDuringReview.lifecycle.state, "TERMINAL_FAILED");
  assert.equal(changedDuringReview.lifecycle.completionAttempts, 1);
});

test("source-drift finalization persists terminal invalidation before returning", () => {
  const value = descriptor();
  const reached = reachSourceReviewComplete(value);
  const drifted = finalizeFor({
    lifecycle: reached.lifecycle,
    descriptor: changedDescriptor(value),
    host: reached.host,
    sourceReviewComplete: true,
    coverageComplete: true,
    deferredFindings: [],
    ledger: { discovery: true, validation: true, attackPath: true, policy: true },
    runGit: gitFor(value),
  });
  assert.equal(drifted.status, "CODEX_SECURITY_SOURCE_LEASE_CHANGED");
  assert.equal(drifted.lifecycle.state, "TERMINAL_FAILED");
  assert.equal(drifted.lifecycle.terminal, true);
  assert.equal(drifted.lifecycle.stateVersion, 4);
  assert.equal(finalizeFor({ lifecycle: drifted.lifecycle, descriptor: value, host: reached.host }).status, "CODEX_SECURITY_COMPLETION_ALREADY_ATTEMPTED");
  const originalDescriptorReplay = finalizeFor({
    lifecycle: reached.lifecycle,
    descriptor: value,
    host: reached.host,
    sourceReviewComplete: true,
    coverageComplete: true,
    deferredFindings: [],
    ledger: { discovery: true, validation: true, attackPath: true, policy: true },
    runGit: gitFor(value),
  });
  assert.equal(originalDescriptorReplay.status, "CODEX_SECURITY_COMPLETION_ALREADY_ATTEMPTED", "the pre-drift snapshot cannot later seal");
});

test("authoritative lifecycle snapshot binding rejects caller-mutated finalization state", () => {
  const value = descriptor();
  const reached = reachSourceReviewComplete(value);
  const mutated = structuredClone(reached.lifecycle);
  mutated.hostBinding.target.snapshotDigest = "e".repeat(64);
  const result = finalizeFor({
    lifecycle: mutated,
    descriptor: value,
    host: { ...reached.host, target: { ...reached.host.target, snapshotDigest: "e".repeat(64) } },
    sourceReviewComplete: true,
    coverageComplete: true,
    deferredFindings: [],
    ledger: { discovery: true, validation: true, attackPath: true, policy: true },
    runGit: gitFor(value),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, "CODEX_SECURITY_COMPLETION_ALREADY_ATTEMPTED");
});

test("incomplete source review and every terminal lifecycle are no-retry", () => {
  const value = descriptor();
  const lifecycle = lifecycleFor(value);
  const clear = preflight({ lifecycle, descriptor: value, host: hostFor(value, { scanId: lifecycle.scanId }), runGit: gitFor(value) });
  const running = beginDiscovery({ lifecycle: clear.lifecycle, descriptor: value, runGit: gitFor(value) });
  const incomplete = completeSourceReview({ lifecycle: running.lifecycle, descriptor: value, complete: false, runGit: gitFor(value) });
  assert.equal(incomplete.lifecycle.state, "SOURCE_REVIEW_INCOMPLETE");
  assert.equal(beginDiscovery({ lifecycle: incomplete.lifecycle, descriptor: value }).ok, false);
  assert.equal(completeSourceReview({ lifecycle: running.lifecycle, descriptor: value, complete: true, runGit: gitFor(value) }).status, "CODEX_SECURITY_ILLEGAL_TRANSITION");
  for (const state of states.filter((candidate) => ["SEALED", "HOST_PREFLIGHT_BLOCKED", "SOURCE_REVIEW_INCOMPLETE", "SOURCE_REVIEW_COMPLETE_SEAL_BLOCKED_TOOLING", "TERMINAL_FAILED", "CANCELED"].includes(candidate))) {
    const lifecycle = { ...lifecycleFor(value), state, terminal: true };
    assert.equal(transition(lifecycle, "CANCELED").ok, false, state);
  }
});

test("unchanged source evidence is reusable and any source or contract drift invalidates it", () => {
  const value = descriptor();
  const fixture = closureFixture(value);
  const closureResult = repositoryClosure(fixture.input, fixture.dependencies);
  assert.equal(closureResult.ok, true);
  const entry = {
    id: "closure-1",
    classification: "REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED",
    evidenceClass: "REPOSITORY_SOURCE_SECURITY",
    sourceLease: lease(value),
    terminal: true,
    terminalState: "SOURCE_REVIEW_COMPLETE_SEAL_BLOCKED_TOOLING",
    p0: 0,
    p1: 0,
    deferredFindings: [],
    evidenceHash: closureResult.closure.closureHash,
    closure: closureResult.closure,
  };
  assert.equal(reusable(entry, value).status, "EXACT_UNCHANGED_SOURCE_REUSE");
  const changedSource = changedDescriptor(value);
  assert.equal(reusable(entry, changedSource).status, "MISS_SOURCE_OR_CONTRACT_CHANGED");
  for (const evidenceClass of ["PROVIDER_CRITICAL", "SIGNED_ARTIFACT", "INSTALLED_DEVICE", "PHYSICAL_DEVICE", "PUBLIC_CANARY", "time-limited"]) {
    assert.equal(reusable({ ...entry, evidenceClass }, value).status, "MISS_DENIED_EVIDENCE_CLASS");
  }
  assert.equal(reusable({ ...entry, classification: "CODEX_SECURITY_SEALED", terminalState: "SEALED" }, value).ok, false);
  assert.equal(reusable({ ...entry, evidenceHash: "f".repeat(64) }, value).ok, false);

  const missingClosure = structuredClone(entry); delete missingClosure.closure;
  assert.equal(reusable(missingClosure, value).ok, false);
  assert.equal(reusable(missingClosure, changedSource).status, "MISS_SOURCE_OR_CONTRACT_CHANGED", "source drift is classified before old-closure validation");
  const partialClosure = structuredClone(entry); delete partialClosure.closure.exactReviewHash;
  assert.equal(reusable(partialClosure, value).ok, false);
  const staleClosure = structuredClone(entry); staleClosure.sourceLease = lease(changedSource);
  assert.equal(reusable(staleClosure, changedSource).ok, false, "a new source lease cannot promote an old repository closure");
  const changedTestHash = structuredClone(entry); changedTestHash.closure.testResultHashes[0].resultSha256 = "a".repeat(64);
  assert.equal(reusable(changedTestHash, value).ok, false);
  const omittedFinding = structuredClone(entry);
  omittedFinding.closure.findingDispositions.pop();
  const { closureHash: _ignored, ...closurePayload } = omittedFinding.closure;
  omittedFinding.closure.closureHash = sha256(closurePayload);
  omittedFinding.evidenceHash = omittedFinding.closure.closureHash;
  assert.equal(reusable(omittedFinding, value).ok, false);

  const mismatchedClosureHash = structuredClone(entry); mismatchedClosureHash.closure.closureHash = "b".repeat(64);
  mismatchedClosureHash.evidenceHash = mismatchedClosureHash.closure.closureHash;
  assert.equal(reusable(mismatchedClosureHash, value).ok, false);
  const wrongHead = structuredClone(value); wrongHead.target.head = "a".repeat(40);
  wrongHead.repositorySourceSnapshotDigest = repositorySnapshotDigest(wrongHead);
  assert.equal(descriptorValid(wrongHead), true);
  assert.equal(reusable(entry, wrongHead).status, "MISS_SOURCE_OR_CONTRACT_CHANGED");
  const wrongTree = structuredClone(value); wrongTree.target.tree = "b".repeat(40);
  wrongTree.repositorySourceSnapshotDigest = repositorySnapshotDigest(wrongTree);
  assert.equal(descriptorValid(wrongTree), true);
  assert.equal(reusable(entry, wrongTree).status, "MISS_SOURCE_OR_CONTRACT_CHANGED");
  const changedWorklist = structuredClone(value); changedWorklist.changedPaths[2].afterBlob = "c".repeat(40);
  changedWorklist.changedPathWorklistSha256 = sha256(changedWorklist.changedPaths);
  changedWorklist.repositorySourceSnapshotDigest = repositorySnapshotDigest(changedWorklist);
  assert.equal(descriptorValid(changedWorklist), true);
  assert.equal(reusable(entry, changedWorklist).status, "MISS_SOURCE_OR_CONTRACT_CHANGED");

  const changedPolicy = structuredClone(value); changedPolicy.contractHashes.policySha256 = sha256("policy-v2");
  changedPolicy.repositorySourceSnapshotDigest = repositorySnapshotDigest(changedPolicy);
  assert.equal(descriptorValid(changedPolicy), true);
  assert.equal(reusable(entry, changedPolicy).status, "MISS_SOURCE_OR_CONTRACT_CHANGED");

  const changedSnapshotDigest = structuredClone(value); changedSnapshotDigest.repositorySourceSnapshotDigest = "d".repeat(64);
  assert.equal(reusable(entry, changedSnapshotDigest).status, "MISS_SOURCE_OR_CONTRACT_CHANGED");

  const ledger = invalidateChangedSourceEvidence([entry], changedSource);
  assert.deepEqual(ledger.reusable, []);
  assert.deepEqual(ledger.invalidated, [{ id: "closure-1", status: "MISS_SOURCE_OR_CONTRACT_CHANGED" }]);
});

test("repository closure is exact, independently reviewed, fully covered, and never Codex sealed", () => {
  const value = descriptor();
  const { input, dependencies } = closureFixture(value);
  const result = repositoryClosure(input, dependencies);
  assert.equal(result.ok, true);
  assert.equal(result.sealed, false);
  assert.equal(result.status, "REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED");
  assert.equal(result.closure.target.head, value.target.head);
  assert.equal(result.closure.target.tree, value.target.tree);
  assert.equal(result.closure.p0, 0);
  assert.equal(result.closure.p1, 0);
  assert.deepEqual(result.closure.findingDispositions.map(({ findingId }) => findingId), repositoryClosureRequiredFindingIds);
  assert.match(result.closure.closureHash, /^[0-9a-f]{64}$/u);
});

test("repository closure requires the exact known finding set and governed correction evidence", () => {
  const attacks = [
    (review) => { review.findingDispositions = []; },
    (review) => { review.findingDispositions.pop(); },
    (review) => { review.findingDispositions.push(structuredClone(review.findingDispositions[0])); },
    (review) => { review.findingDispositions.reverse(); },
    (review) => { review.findingDispositions[0].findingId = "ATTACKER_OMITS_KNOWN_FINDINGS"; },
    (review) => { review.findingDispositions[0].evidenceHash = "f".repeat(64); },
  ];
  for (const attack of attacks) {
    const { input, dependencies } = closureFixture();
    attack(input.review);
    rehashReview(input.review);
    assert.equal(repositoryClosure(input, dependencies).ok, false);
  }
  const { input, dependencies } = closureFixture();
  input.review.findingDispositions = [];
  input.priorFindingsClosed = true;
  rehashReview(input.review);
  assert.equal(repositoryClosure(input, dependencies).ok, false, "boolean cannot replace required finding dispositions");
});

test("repository closure rejects sealed labels, coverage, review, test, lease, and deferred substitutions", () => {
  const attacks = [
    (value) => { value.requestedStatus = "SEALED"; },
    (value) => { value.classification = "CODEX_SECURITY_SEALED"; },
    (value) => { value.hostedSealingUsed = true; },
    (value) => { value.hostScanStarted = true; },
    (value) => { value.reason = "UNBOUNDED_FALLBACK"; },
    (value) => { value.activeLease.target.head = "0".repeat(40); },
    (value) => { value.review.coveredPaths.pop(); value.review.exactReviewHash = sha256(Object.fromEntries(Object.entries(value.review).filter(([key]) => key !== "exactReviewHash"))); },
    (value) => { value.review.p0 = 1; },
    (value) => { value.review.p1 = 1; },
    (value) => { value.review.deferredFindings.push("later"); },
    (value) => { value.review.target.head = "0".repeat(40); },
    (value) => { value.review.exactReviewHash = "0".repeat(64); },
    (value) => { value.tests[0].target.tree = "0".repeat(40); },
    (value) => { value.tests[0].resultSha256 = "not-a-hash"; },
    (value) => { value.tests[0].passed = false; },
    (value) => { value.priorFindingsClosed = true; },
    (value) => { value.noDeferredWork = false; },
  ];
  for (const attack of attacks) {
    const { input, dependencies } = closureFixture();
    attack(input);
    assert.equal(repositoryClosure(input, dependencies).ok, false);
  }
});

test("repository closure independently reconstructs the descriptor and governed receipt evidence", () => {
  const { input, dependencies, receipts } = closureFixture();
  const fabricated = structuredClone(input);
  fabricated.descriptor.changedPaths = [{
    status: "M",
    path: "AGENTS.md",
    beforeBlob: "1".repeat(40),
    afterBlob: "2".repeat(40),
  }];
  fabricated.descriptor.changedPathWorklistSha256 = sha256(fabricated.descriptor.changedPaths);
  fabricated.descriptor.contractHashes.policySha256 = "3".repeat(64);
  fabricated.descriptor.repositorySourceSnapshotDigest = repositorySnapshotDigest(fabricated.descriptor);
  fabricated.activeLease = lease(fabricated.descriptor);
  fabricated.review = sourceReviewFor(fabricated.descriptor, fabricated.tests);
  fabricated.tests = fabricated.tests.map((item) => ({ ...item, target: fabricated.descriptor.target }));
  assert.equal(repositoryClosure(fabricated, dependencies).ok, false, "caller-rehashed descriptor denied by Git reconstruction");

  const attacks = [
    (fixture) => { fixture.input.tests.pop(); },
    (fixture) => { fixture.input.tests.push(structuredClone(fixture.input.tests[0])); },
    (fixture) => { fixture.input.tests[1].id = fixture.input.tests[0].id; },
    (fixture) => { fixture.input.tests[0].id = "attacker-claims-pass"; },
    (fixture) => { fixture.input.tests[0].commandSha256 = "4".repeat(64); },
    (fixture) => { fixture.input.tests[0].resultSha256 = "5".repeat(64); },
    (fixture) => { fixture.input.tests[0].receiptIdentityHash = "6".repeat(64); },
    (fixture) => { fixture.input.tests[0].artifactLocation = "memory:attacker"; },
    (fixture) => {
      const location = fixture.input.tests[0].artifactLocation;
      fixture.receipts.get(location).resultTotals = 0;
    },
    (fixture) => {
      const location = fixture.input.tests[0].artifactLocation;
      fixture.receipts.get(location).exactCommand = ["node", "attacker.mjs"];
    },
  ];
  for (const attack of attacks) {
    const fixture = closureFixture();
    attack(fixture);
    assert.equal(repositoryClosure(fixture.input, fixture.dependencies).ok, false);
  }

  const missingReceipt = closureFixture();
  missingReceipt.receipts.delete(missingReceipt.input.tests[0].artifactLocation);
  assert.equal(repositoryClosure(missingReceipt.input, missingReceipt.dependencies).ok, false);

  assert.equal(receipts.size, repositoryClosureTestIds.length);
});

test("tooling-preflight closure requires a matching terminal preflight reason", () => {
  const value = descriptor();
  const lifecycle = lifecycleFor(value);
  const blocked = preflight({ lifecycle, descriptor: value, host: hostFor(value, { scanId: lifecycle.scanId, snapshotDigestExposed: false }), runGit: gitFor(value) });
  const { input, dependencies } = closureFixture(value);
  input.reason = "HOST_SNAPSHOT_DIGEST_NOT_PREFLIGHTABLE";
  input.lifecycle = blocked.lifecycle;
  const accepted = repositoryClosure(input, dependencies);
  assert.equal(accepted.ok, true);
  const forged = structuredClone(input);
  forged.reason = "BLOCKED_TOOLING_CODEX_SECURITY_SNAPSHOT_DIGEST_PREFLIGHT";
  assert.equal(repositoryClosure(forged, dependencies).ok, false);
  forged.lifecycle.terminal = false;
  assert.equal(repositoryClosure(forged, dependencies).ok, false);

  const selfAttested = structuredClone(input);
  selfAttested.lifecycle.lifecycleIdentityHash = "f".repeat(64);
  assert.equal(repositoryClosure(selfAttested, dependencies).ok, false);

  const anotherSource = changedDescriptor(value);
  const anotherLifecycle = lifecycleFor(anotherSource);
  const anotherBlocked = preflight({
    lifecycle: anotherLifecycle,
    descriptor: anotherSource,
    host: hostFor(anotherSource, { scanId: anotherLifecycle.scanId, snapshotDigestExposed: false }),
    runGit: gitFor(anotherSource),
  });
  const crossSource = structuredClone(input);
  crossSource.lifecycle = anotherBlocked.lifecycle;
  assert.equal(repositoryClosure(crossSource, dependencies).ok, false);
});

test("known recurring incidents are sanitized and unrecognized or sensitive payloads fail", () => {
  for (const scanId of ["508c30b1-cf43-4902-96f1-92563d490149", "a64456db-438c-4857-8f01-c40fcc965936"]) {
    const result = sanitizeIncident({
      scanId,
      error: "scan.target.snapshotDigest: expected a non-empty string",
      sourceReviewCompletionState: "SOURCE_REVIEW_COMPLETE",
      finalizationState: "SOURCE_REVIEW_COMPLETE_SEAL_BLOCKED_TOOLING",
      mitigation: "S0 preflight would prevent the expensive scan from starting",
    });
    assert.equal(result.ok, true);
    assert.equal(Object.hasOwn(result.record, "error"), false);
    assert.equal(result.record.tokenValues, null);
    assert.equal(result.record.wallValues, null);
    assert.match(result.record.incidentHash, /^[0-9a-f]{64}$/u);
  }
  const baseline = {
    scanId: "508c30b1-cf43-4902-96f1-92563d490149",
    error: "scan.target.snapshotDigest: expected a non-empty string",
    sourceReviewCompletionState: "SOURCE_REVIEW_COMPLETE",
    finalizationState: "SOURCE_REVIEW_COMPLETE_SEAL_BLOCKED_TOOLING",
    mitigation: "S0 preflight would prevent the expensive scan from starting",
  };
  assert.equal(sanitizeIncident({ ...baseline, token: "secret" }).ok, false);
  assert.equal(sanitizeIncident({ ...baseline, privatePath: "/tmp/private" }).ok, false);
  assert.equal(sanitizeIncident({ ...baseline, scanId: "unknown" }).ok, false);
  assert.equal(sanitizeIncident({ ...baseline, error: "different" }).ok, false);
  assert.equal(sanitizeIncident({ ...baseline, sourceReviewCompletionState: "UNKNOWN" }).ok, false);
  assert.equal(sanitizeIncident({ ...baseline, finalizationState: "SEALED" }).ok, false);
  assert.equal(sanitizeIncident({ ...baseline, mitigation: "free-form" }).ok, false);
});

test("benchmark proves both recurring digest failures stop before expensive work", () => {
  const result = benchmark();
  assert.equal(result.ok, true);
  assert.equal(result.expensiveScanWorkAvoided, 2);
  assert.deepEqual(result.preflightResults, [
    "HOST_SNAPSHOT_DIGEST_NOT_PREFLIGHTABLE",
    "BLOCKED_TOOLING_CODEX_SECURITY_SNAPSHOT_DIGEST_PREFLIGHT",
  ]);
  assert.equal(result.incidentHashes.length, 2);
  assert.equal(result.incidentHashes.every((value) => /^[0-9a-f]{64}$/u.test(value)), true);
  assert.equal(result.cleanupComplete, true);
  assert.equal(result.retainedMutableArtifacts, 0);
});

test("lease hash cannot be forged independently of exact source identity", () => {
  const value = descriptor();
  const active = lease(value);
  assert.equal(leaseCurrent(active, value), true);
  const attacks = [
    (candidate) => { candidate.target.head = "0".repeat(40); },
    (candidate) => { candidate.changedPathWorklistSha256 = "0".repeat(64); },
    (candidate) => { candidate.contractHashes.policySha256 = "0".repeat(64); },
    (candidate) => { candidate.repositorySourceSnapshotDigest = "0".repeat(64); },
    (candidate) => { candidate.sourceLeaseHash = sha256(candidate); },
  ];
  for (const attack of attacks) {
    const candidate = structuredClone(active);
    attack(candidate);
    assert.equal(leaseCurrent(candidate, value), false);
  }
});

test("S0 completion tiers require four distinct feature-scoped repository facts", () => {
  const gateCatalog = JSON.parse(fs.readFileSync("config/assurance/gate-catalog-v1.json", "utf8"));
  const featureRegistry = JSON.parse(fs.readFileSync("config/assurance/feature-registry-v1.json", "utf8"));
  const feature = featureRegistry.features.find(({ featureId }) => featureId === "codex-security-scan-reliability-s0");
  const binding = {
    schemaVersion: 1,
    featureId: feature.featureId,
    implementationPr: 206,
    implementationBranch: "codex/assurance-codex-security-scan-reliability-s0",
    implementationBindingId: "assurance-codex-security-scan-reliability-s0-pr206-v1",
    immutableSourceHead: "1".repeat(40),
    immutableSourceTree: "2".repeat(40),
    currentImplementationHead: "1".repeat(40),
    currentImplementationTree: "2".repeat(40),
    phase: "COMPLETE",
    executionState: "CODEX_SECURITY_SCAN_RELIABILITY_S0_COMPLETE",
    requiredFreshnessClasses: ["REPOSITORY_SOURCE"],
    requiredFreshnessClaims: [{
      freshnessClass: "REPOSITORY_SOURCE",
      platform: "NONE",
      evidenceSourceId: "s0-exact-head-closure",
      authorityAllowed: "REPOSITORY_ONLY",
      provider: "NONE",
      requiredFacts: [
        "repository.assurance-control.s0.requirements",
        "repository.assurance-control.s0.source",
        "repository.assurance-control.s0.model",
        "repository.assurance-control.s0.integration",
      ],
      subjectHead: "1".repeat(40),
      subjectTree: "2".repeat(40),
    }],
    proofTiersUnderEvaluation: ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION"],
    proofTierStatuses: {
      T0_REQUIREMENT: "REQUIREMENTS_CLEAR",
      T1_SOURCE: "SOURCE_CLEAR",
      T2_MODEL: "MODEL_CLEAR",
      T3_INTEGRATION: "INTEGRATION_CLEAR",
      T4_NATIVE_PROVIDER: "NOT_APPLICABLE",
      T5_SIGNED_ARTIFACT: "NOT_APPLICABLE",
      T6_INSTALLED_PHYSICAL: "NOT_APPLICABLE",
      T7_PUBLIC_CANARY: "NOT_APPLICABLE",
    },
    proofTierApplicabilityHash: sha256(stableJson(feature.proofTierApplicability)),
  };
  assert.deepEqual(validateProofTierStatuses(binding, gateCatalog, featureRegistry), []);

  const oneFactForAllTiers = structuredClone(binding);
  oneFactForAllTiers.requiredFreshnessClaims[0].requiredFacts = ["repository.assurance-control.s0.source"];
  const missingFacts = validateProofTierStatuses(oneFactForAllTiers, gateCatalog, featureRegistry);
  for (const tier of ["T0_REQUIREMENT", "T2_MODEL", "T3_INTEGRATION"]) {
    assert.equal(missingFacts.some(({ id, tier: findingTier }) => id === "ASSURANCE_COMPLETED_PROOF_TIER_FACT_UNAUTHORIZED" && findingTier === tier), true, tier);
  }

  const unrelatedFact = structuredClone(binding);
  unrelatedFact.requiredFreshnessClaims[0].requiredFacts = [
    "repository.assurance-control.a1.requirements",
    "repository.assurance-control.a1.source",
    "repository.assurance-control.a1.model",
    "repository.assurance-control.a1.integration",
  ];
  assert.equal(validateProofTierStatuses(unrelatedFact, gateCatalog, featureRegistry)
    .some(({ id }) => id === "ASSURANCE_COMPLETED_PROOF_TIER_FACT_UNAUTHORIZED"), true);

  const selfConsistentDowngrade = structuredClone(binding);
  const forgedRegistry = structuredClone(featureRegistry);
  const forgedFeature = forgedRegistry.features.find(({ featureId }) => featureId === binding.featureId);
  forgedFeature.proofTierApplicability.T2_MODEL = "not-applicable";
  selfConsistentDowngrade.proofTierStatuses.T2_MODEL = "NOT_APPLICABLE";
  selfConsistentDowngrade.proofTiersUnderEvaluation = selfConsistentDowngrade.proofTiersUnderEvaluation.filter((tier) => tier !== "T2_MODEL");
  selfConsistentDowngrade.requiredFreshnessClaims[0].requiredFacts = selfConsistentDowngrade.requiredFreshnessClaims[0].requiredFacts.filter((fact) => fact !== "repository.assurance-control.s0.model");
  selfConsistentDowngrade.proofTierApplicabilityHash = sha256(stableJson(forgedFeature.proofTierApplicability));
  assert.equal(validateProofTierStatuses(selfConsistentDowngrade, gateCatalog, forgedRegistry)
    .some(({ id }) => id === "ASSURANCE_PROOF_TIER_APPLICABILITY_HASH_MISMATCH"), true);
});

test("S0 contract, incident ledger, skill, and task-aware Phase 1 integration agree", () => {
  const contract = JSON.parse(fs.readFileSync("config/assurance/codex-security-reliability-s0-v1.json", "utf8"));
  const incidents = JSON.parse(fs.readFileSync("config/assurance/codex-security-scan-incidents-v1.json", "utf8"));
  const scopeWaiver = JSON.parse(fs.readFileSync("config/assurance/codex-security-reliability-s0-scope-waiver-v1.json", "utf8"));
  const scopePolicy = JSON.parse(fs.readFileSync("config/assurance/pr-scope-policy-v1.json", "utf8"));
  const featureRegistry = JSON.parse(fs.readFileSync("config/assurance/feature-registry-v1.json", "utf8"));
  const workflow = fs.readFileSync(".github/workflows/phase1-ci.yml", "utf8");
  const skill = fs.readFileSync(".agents/skills/chillywood-assurance/SKILL.md", "utf8");
  const pullFixture = ({ pr, branch, head = "a".repeat(40), base = "b".repeat(40), repository = "Chillywood2025/chillywood-mobile", title = "fixture" }) => ({
    event: { number: pr, repository: { full_name: repository }, pull_request: { number: pr, title, html_url: `https://github.com/${repository}/pull/${pr}`, base: { ref: "main", sha: base }, head: { ref: branch, sha: head } } },
    readback: { number: pr, repository, baseRef: "main", baseSha: base, headRef: branch, headSha: head, htmlUrl: `https://github.com/${repository}/pull/${pr}`, state: "open" },
  });
  const resolveScope = (fixture, extra = {}) => deriveTaskScopeContext({ event: fixture.event, readback: fixture.readback, policy: scopePolicy, registry: featureRegistry, currentTruth: { finiteTaskLeases: { tasks: [] } }, ...extra });
  assert.deepEqual(contract.states, states);
  assert.equal(contract.repository, "Chillywood2025/chillywood-mobile");
  assert.equal(contract.hostPreflight.snapshotDigestField, "scan.target.snapshotDigest");
  assert.equal(contract.hostPreflight.workersStartedOnFailure, false);
  assert.equal(contract.completion.maximumAttempts, 1);
  assert.equal(contract.completion.terminalRetryAllowed, false);
  assert.deepEqual(contract.lifecycleAuthority, {
    storage: "PRIVATE_UID_OWNED_ATOMIC_O_EXCL",
    identityKey: ["repository", "scanId", "sourceLeaseHash"],
    snapshotBinding: "SHA256_STABLE_JSON_FULL_LIFECYCLE",
    initialStateVersion: 0,
    completionSourceStateVersion: 3,
    completionAttemptConsumedBeforeFinalizationGuards: true,
    sourceDriftTerminalTransitionPersistedBeforeReturn: true,
    newerTransitionInvalidatesPriorSnapshot: true,
    duplicateScanCode: "CODEX_SECURITY_SCAN_ALREADY_REGISTERED",
    staleOrReplayedCompletionCode: "CODEX_SECURITY_COMPLETION_ALREADY_ATTEMPTED",
  });
  assert.equal(contract.repositoryClosure.classification, "REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED");
  assert.equal(contract.repositoryClosure.sealed, false);
  assert.deepEqual(contract.repositoryClosure.requiredFindingIds, repositoryClosureRequiredFindingIds);
  assert.deepEqual(contract.reviewGovernance, {
    providerCodexReview: "OPTIONAL_ADVISORY",
    ownerTriggeredOnly: true,
    automaticRequestAllowed: false,
    automaticRetryAllowed: false,
    providerReceiptRequired: false,
    providerFailureBlocks: [],
    requiredPhase1Checks: 13,
    repositoryOwnedIndependentExactHeadReviewRequired: true,
    p0P1StopLineRequired: true,
    lateProviderFindingDisposition: "ADVISORY_UNTIL_INDEPENDENT_REPOSITORY_VALIDATION",
    protectedMainFindingSetRegistryRequiredForBlocking: true,
    requiredStatusCheckExcluded: "Chi'llywood / Codex Review Exact Head",
    rulesetStrict: true,
    conversationResolutionRequired: false,
    staleReviewDismissalRequired: true,
    bypassActors: [],
  });
  assert.equal(scopeWaiver.reviewer, "repository-owned-assurance-coordinator");
  assert.equal(scopeWaiver.reviewerRole, "SOLO_OWNER_REPOSITORY_ASSURANCE_COORDINATOR");
  assert.equal(scopeWaiver.secondHighRiskDomain, false);
  assert.equal(scopeWaiver.newTimeboxHours, 8);
  assert.deepEqual(scopeWaiver.supportingDomains, ["CI-test-infrastructure", "documentation-metadata"]);
  assert.deepEqual(scopeWaiver.fileBudget, { default: 15, waivedMaximum: 35 });
  assert.deepEqual(scopeWaiver.lineBudget, { default: 1200, waivedMaximum: 3000 });
  assert.equal(scopeWaiver.reviewStatus, "ONE_COMBINED_EXACT_HEAD_REPOSITORY_REVIEW_BUNDLE_REQUIRED_BEFORE_MERGE");

  for (const record of incidents.incidents) {
    const sanitized = sanitizeIncident({
      scanId: record.scanId,
      error: "scan.target.snapshotDigest: expected a non-empty string",
      sourceReviewCompletionState: record.sourceReviewCompletionState,
      finalizationState: record.finalizationState,
      mitigation: record.mitigation,
    });
    assert.equal(sanitized.ok, true);
    assert.deepEqual(sanitized.record, record);
  }
  const genericInvocation = 'node scripts/assurance/pr-scope.mjs --github-event="$GITHUB_EVENT_PATH"';
  assert.equal(workflow.includes(genericInvocation), true, genericInvocation);
  const genericLine = workflow.split("\n").find((line) => line.includes("node scripts/assurance/pr-scope.mjs"));
  assert.equal(genericLine?.includes("--feature=codex-security-scan-reliability-s0"), false);
  assert.equal(genericLine?.includes("--waiver=config/assurance/codex-security-reliability-s0-scope-waiver-v1.json"), false);
  const permissionsBlock = /^permissions:\n(?:(?:  [^\n]+\n)+)/mu.exec(workflow)?.[0] ?? "";
  assert.equal(permissionsBlock.includes("  actions: read"), true, "task-aware scope may read the exact failed-run verification dependency");
  assert.equal(permissionsBlock.includes("  actions: write"), false, "task-aware scope never gains Actions mutation authority");

  const s0 = pullFixture({ pr: 206, branch: "codex/assurance-codex-security-scan-reliability-s0" });
  const s0Context = resolveScope(s0);
  assert.equal(s0Context.ok, true);
  assert.equal(s0Context.featureId, "codex-security-scan-reliability-s0");
  assert.equal(s0Context.historicalWaiverPath, "config/assurance/codex-security-reliability-s0-scope-waiver-v1.json");
  assert.equal(s0Context.source, "PROTECTED_TASK_REGISTRY");

  const doctrine = pullFixture({ pr: 226, branch: "codex/whole-app-engineering-doctrine-v1", head: "c".repeat(40) });
  const doctrineContext = resolveScope(doctrine, { ownerAuthority: { ok: true, repository: doctrine.readback.repository, pr: 226, branch: doctrine.readback.headRef, currentHead: doctrine.readback.headSha, budget: { maximumFiles: 32, maximumHandAuthoredNetLines: 7000, maximumGeneratedGraphLines: 12000 } } });
  assert.equal(doctrineContext.ok, true);
  assert.equal(doctrineContext.featureId, "assurance-efficiency-e0");
  assert.deepEqual(doctrineContext.objectiveDomains, ["autonomous-operators"]);
  assert.deepEqual(doctrineContext.supportingDomains, ["CI-test-infrastructure"]);
  assert.equal(doctrineContext.historicalWaiverPath, null);
  assert.deepEqual(doctrineContext.budget, { maximumFiles: 32, maximumHandAuthoredNetLines: 7000, maximumGeneratedGraphLines: 12000 });

  const branchSpoof = resolveScope(pullFixture({ pr: 999, branch: s0.event.pull_request.head.ref }));
  assert.ok(branchSpoof.findings.includes("ASSURANCE_TASK_CONTEXT_UNBOUND"));
  const titleSpoof = resolveScope(pullFixture({ pr: 999, branch: "codex/unbound", title: "Codex Security reliability S0" }));
  assert.ok(titleSpoof.findings.includes("ASSURANCE_TASK_CONTEXT_UNBOUND"));
  const injected = resolveScope(s0, { requestedFeature: "codex-security-scan-reliability-s0", requestedWaiver: "config/assurance/codex-security-reliability-s0-scope-waiver-v1.json" });
  assert.ok(injected.findings.includes("ASSURANCE_CALLER_FEATURE_INJECTION_REJECTED"));
  assert.ok(injected.findings.includes("ASSURANCE_CALLER_WAIVER_INJECTION_REJECTED"));
  const wrongRepository = pullFixture({ pr: 206, branch: s0.event.pull_request.head.ref, repository: "Evil/chillywood-mobile" });
  assert.ok(resolveScope(wrongRepository).findings.includes("ASSURANCE_PR_EVENT_IDENTITY_INVALID"));
  const wrongPr = structuredClone(s0); wrongPr.event.number = 207;
  assert.ok(resolveScope(wrongPr).findings.includes("ASSURANCE_PR_EVENT_IDENTITY_INVALID"));
  const wrongHead = structuredClone(s0); wrongHead.event.pull_request.head.sha = "d".repeat(40);
  assert.ok(resolveScope(wrongHead).findings.includes("ASSURANCE_PR_EVENT_READBACK_MISMATCH"));
  const unrelated = resolveScope(pullFixture({ pr: 999, branch: "codex/unrelated" }));
  assert.equal(unrelated.historicalWaiverPath, null);
  assert.ok(unrelated.findings.includes("ASSURANCE_TASK_CONTEXT_UNBOUND"));

  for (const command of [
    "node scripts/assurance/codex-security-reliability.mjs --benchmark=all",
    "node --test tests/assurance/codex-security-reliability-s0.test.mjs",
  ]) {
    assert.equal(workflow.includes(command), true, command);
  }
  for (const mainPushControl of [
    "S0_EVENT_BEFORE: ${{ github.event.before }}",
    "S0_BASE_REF=\"$S0_EVENT_BEFORE\"",
    "S0_BASE_REF=\"$S0_TARGET_REF^1\"",
    "git diff-tree --root --no-commit-id --name-only -r",
    "test \"$(git rev-parse \"$S0_BASE_REF^{commit}\")\" != \"$(git rev-parse \"$S0_TARGET_REF^{commit}\")\"",
    "--base=\"$S0_BASE_REF\" --target=\"$S0_TARGET_REF\"",
  ]) assert.equal(workflow.includes(mainPushControl), true, mainPushControl);
  for (const requiredText of [
    "HOST_SNAPSHOT_DIGEST_NOT_PREFLIGHTABLE",
    "BLOCKED_TOOLING_CODEX_SECURITY_SNAPSHOT_DIGEST_PREFLIGHT",
    "workersStarted=false",
    "REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED",
    "OPTIONAL_ADVISORY",
    "Never request, retry, or poll",
    "exactly the 13 Phase 1 checks",
  ]) {
    assert.equal(skill.includes(requiredText), true, requiredText);
  }
});
