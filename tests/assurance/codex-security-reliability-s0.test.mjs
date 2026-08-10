import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { sha256, stableJson, validateProofTierStatuses } from "../../scripts/assurance/lib.mjs";
import { repositorySnapshotDigest, targetDescriptor } from "../../scripts/assurance/codex-security-target.mjs";
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
  reusable,
  sanitizeIncident,
  states,
  transition,
} from "../../scripts/assurance/codex-security-reliability.mjs";

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
      policySha256: "a".repeat(64),
      threatSha256: "b".repeat(64),
      featureRegistrySha256: "c".repeat(64),
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
    const revision = args[2];
    if (revision === `${value.base.ref}^{commit}`) return replacement.base.head;
    if (revision === `${value.base.ref}^{tree}`) return replacement.base.tree;
    if (revision === `${value.target.ref}^{commit}`) return replacement.target.head;
    if (revision === `${value.target.ref}^{tree}`) return replacement.target.tree;
    throw new Error(`unexpected git read: ${args.join(" ")}`);
  };
}

function lifecycleFor(value = descriptor()) {
  const result = createLifecycle({ descriptor: value, scanId: "scan-s0-1", scanState: "RUNNING" });
  assert.equal(result.ok, true);
  return result.lifecycle;
}

function sourceReviewFor(value) {
  const review = {
    classification: "INDEPENDENT_EXACT_HEAD_REPOSITORY_SECURITY_REVIEW",
    target: value.target,
    coveredPaths: value.changedPaths.map(({ path }) => path),
    changedPathWorklistSha256: value.changedPathWorklistSha256,
    p0: 0,
    p1: 0,
    deferredFindings: [],
    findingDispositions: [],
    exactReviewHash: "",
  };
  const { exactReviewHash: _ignored, ...payload } = review;
  review.exactReviewHash = sha256(payload);
  return review;
}

function testsFor(value) {
  return [{
    id: "s0-focused",
    target: value.target,
    commandSha256: sha256("node --test tests/assurance/codex-security-reliability-s0.test.mjs"),
    resultSha256: sha256("pass:codex-security-reliability-s0"),
    passed: true,
  }];
}

function closureInput(value = descriptor()) {
  return {
    descriptor: value,
    activeLease: lease(value),
    lifecycle: null,
    classification: "REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED",
    requestedStatus: "REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED",
    reason: "HOSTED_SECURITY_SELF_APPROVAL_PROHIBITED",
    hostedSealingUsed: false,
    hostScanStarted: false,
    review: sourceReviewFor(value),
    tests: testsFor(value),
    priorFindingsClosed: true,
    noDeferredWork: true,
  };
}

function reachSourceReviewComplete(value = descriptor()) {
  const host = hostFor(value);
  const clear = preflight({ lifecycle: lifecycleFor(value), descriptor: value, host, runGit: gitFor(value) });
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
  const unavailable = preflight({ lifecycle, descriptor: value, host: hostFor(value, { snapshotDigestExposed: false }), runGit: gitFor(value) });
  assert.equal(unavailable.status, "HOST_SNAPSHOT_DIGEST_NOT_PREFLIGHTABLE");
  assert.equal(unavailable.workersStarted, false);
  assert.equal(unavailable.lifecycle.state, "HOST_PREFLIGHT_BLOCKED");
  assert.equal(unavailable.lifecycle.terminal, true);

  for (const snapshotDigest of [undefined, null, "", "not-a-digest"]) {
    const host = hostFor(value);
    host.target.snapshotDigest = snapshotDigest;
    const missing = preflight({ lifecycle, descriptor: value, host, runGit: gitFor(value) });
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
    const host = structuredClone(hostFor(value));
    attack(host);
    const result = preflight({ lifecycle: lifecycleFor(value), descriptor: value, host, runGit: gitFor(value) });
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

  const clear = preflight({ lifecycle, descriptor: value, host: hostFor(value), runGit: gitFor(value) });
  assert.equal(clear.ok, true);
  assert.equal(clear.workersStarted, false);
  const started = beginDiscovery({ lifecycle: clear.lifecycle, descriptor: value, runGit: gitFor(value) });
  assert.equal(started.ok, true);
  assert.equal(started.workersStarted, true);

  const drifted = beginDiscovery({ lifecycle: clear.lifecycle, descriptor: changedDescriptor(value), runGit: gitFor(value) });
  assert.equal(drifted.status, "CODEX_SECURITY_SOURCE_LEASE_CHANGED");
  assert.equal(drifted.workersStarted, false);
  assert.equal(drifted.lifecycle.terminal, true);

  const pushed = beginDiscovery({ lifecycle: clear.lifecycle, descriptor: value, runGit: gitFor(value, changedDescriptor(value)) });
  assert.equal(pushed.status, "CODEX_SECURITY_SOURCE_LEASE_CHANGED");
  assert.equal(pushed.workersStarted, false);
  assert.equal(pushed.lifecycle.terminal, true);
});

test("one exact completion attempt seals and cannot be retried", () => {
  const value = descriptor();
  const reached = reachSourceReviewComplete(value);
  const result = finalize({
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
  assert.equal(finalize({ lifecycle: result.lifecycle, descriptor: value, host: reached.host }).status, "CODEX_SECURITY_COMPLETION_ALREADY_ATTEMPTED");
  assert.equal(transition(result.lifecycle, "CANCELED").status, "CODEX_SECURITY_ILLEGAL_TRANSITION");
});

test("failed finalization is terminal and consumes the sole completion attempt", () => {
  const value = descriptor();
  const reached = reachSourceReviewComplete(value);
  const lateMissing = structuredClone(reached.host);
  lateMissing.target.snapshotDigest = "";
  const failure = finalize({
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
  assert.equal(finalize({ lifecycle: failure.lifecycle, descriptor: value, host: reached.host }).status, "CODEX_SECURITY_COMPLETION_ALREADY_ATTEMPTED");

  const pushed = reachSourceReviewComplete(value);
  const changedDuringReview = finalize({
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

test("incomplete source review and every terminal lifecycle are no-retry", () => {
  const value = descriptor();
  const clear = preflight({ lifecycle: lifecycleFor(value), descriptor: value, host: hostFor(value), runGit: gitFor(value) });
  const running = beginDiscovery({ lifecycle: clear.lifecycle, descriptor: value, runGit: gitFor(value) });
  const incomplete = completeSourceReview({ lifecycle: running.lifecycle, descriptor: value, complete: false, runGit: gitFor(value) });
  assert.equal(incomplete.lifecycle.state, "SOURCE_REVIEW_INCOMPLETE");
  assert.equal(beginDiscovery({ lifecycle: incomplete.lifecycle, descriptor: value }).ok, false);
  for (const state of states.filter((candidate) => ["SEALED", "HOST_PREFLIGHT_BLOCKED", "SOURCE_REVIEW_INCOMPLETE", "SOURCE_REVIEW_COMPLETE_SEAL_BLOCKED_TOOLING", "TERMINAL_FAILED", "CANCELED"].includes(candidate))) {
    const lifecycle = { ...lifecycleFor(value), state, terminal: true };
    assert.equal(transition(lifecycle, "CANCELED").ok, false, state);
  }
});

test("unchanged source evidence is reusable and any source or contract drift invalidates it", () => {
  const value = descriptor();
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
    evidenceHash: "f".repeat(64),
  };
  assert.equal(reusable(entry, value).status, "EXACT_UNCHANGED_SOURCE_REUSE");
  assert.equal(reusable(entry, changedDescriptor(value)).status, "MISS_SOURCE_OR_CONTRACT_CHANGED");
  for (const evidenceClass of ["PROVIDER_CRITICAL", "SIGNED_ARTIFACT", "INSTALLED_DEVICE", "PHYSICAL_DEVICE", "PUBLIC_CANARY", "time-limited"]) {
    assert.equal(reusable({ ...entry, evidenceClass }, value).status, "MISS_DENIED_EVIDENCE_CLASS");
  }
  const ledger = invalidateChangedSourceEvidence([entry], changedDescriptor(value));
  assert.deepEqual(ledger.reusable, []);
  assert.deepEqual(ledger.invalidated, [{ id: "closure-1", status: "MISS_SOURCE_OR_CONTRACT_CHANGED" }]);
});

test("repository closure is exact, independently reviewed, fully covered, and never Codex sealed", () => {
  const value = descriptor();
  const input = closureInput(value);
  const result = repositoryClosure(input, { runGit: gitFor(value) });
  assert.equal(result.ok, true);
  assert.equal(result.sealed, false);
  assert.equal(result.status, "REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED");
  assert.equal(result.closure.target.head, value.target.head);
  assert.equal(result.closure.target.tree, value.target.tree);
  assert.equal(result.closure.p0, 0);
  assert.equal(result.closure.p1, 0);
  assert.match(result.closure.closureHash, /^[0-9a-f]{64}$/u);
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
    (value) => { value.priorFindingsClosed = false; },
    (value) => { value.noDeferredWork = false; },
  ];
  for (const attack of attacks) {
    const candidate = closureInput();
    attack(candidate);
    assert.equal(repositoryClosure(candidate, { runGit: gitFor(candidate.descriptor) }).ok, false);
  }
});

test("tooling-preflight closure requires a matching terminal preflight reason", () => {
  const value = descriptor();
  const blocked = preflight({ lifecycle: lifecycleFor(value), descriptor: value, host: hostFor(value, { snapshotDigestExposed: false }), runGit: gitFor(value) });
  const input = closureInput(value);
  input.reason = "HOST_SNAPSHOT_DIGEST_NOT_PREFLIGHTABLE";
  input.lifecycle = blocked.lifecycle;
  const accepted = repositoryClosure(input, { runGit: gitFor(value) });
  assert.equal(accepted.ok, true);
  const forged = structuredClone(input);
  forged.reason = "BLOCKED_TOOLING_CODEX_SECURITY_SNAPSHOT_DIGEST_PREFLIGHT";
  assert.equal(repositoryClosure(forged, { runGit: gitFor(value) }).ok, false);
  forged.lifecycle.terminal = false;
  assert.equal(repositoryClosure(forged, { runGit: gitFor(value) }).ok, false);
});

test("known recurring incidents are sanitized and unrecognized or sensitive payloads fail", () => {
  for (const scanId of ["508c30b1-cf43-4902-96f1-92563d490149", "a64456db-438c-4857-8f01-c40fcc965936"]) {
    const result = sanitizeIncident({
      scanId,
      error: "scan.target.snapshotDigest: expected a non-empty string",
      sourceReviewCompletionState: "SOURCE_REVIEW_COMPLETE",
      finalizationState: "HOST_PREFLIGHT_BLOCKED",
      mitigation: "strict repository closure",
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
    finalizationState: "HOST_PREFLIGHT_BLOCKED",
    mitigation: "strict repository closure",
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

test("S0 contract, incident ledger, skill, and Phase 1 integration agree", () => {
  const contract = JSON.parse(fs.readFileSync("config/assurance/codex-security-reliability-s0-v1.json", "utf8"));
  const incidents = JSON.parse(fs.readFileSync("config/assurance/codex-security-scan-incidents-v1.json", "utf8"));
  const scopeWaiver = JSON.parse(fs.readFileSync("config/assurance/codex-security-reliability-s0-scope-waiver-v1.json", "utf8"));
  const workflow = fs.readFileSync(".github/workflows/phase1-ci.yml", "utf8");
  const skill = fs.readFileSync(".agents/skills/chillywood-assurance/SKILL.md", "utf8");
  assert.deepEqual(contract.states, states);
  assert.equal(contract.repository, "Chillywood2025/chillywood-mobile");
  assert.equal(contract.hostPreflight.snapshotDigestField, "scan.target.snapshotDigest");
  assert.equal(contract.hostPreflight.workersStartedOnFailure, false);
  assert.equal(contract.completion.maximumAttempts, 1);
  assert.equal(contract.completion.terminalRetryAllowed, false);
  assert.equal(contract.repositoryClosure.classification, "REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED");
  assert.equal(contract.repositoryClosure.sealed, false);
  assert.equal(scopeWaiver.reviewer, "s0-four-compact-independent-exact-head-review-lanes");
  assert.equal(scopeWaiver.secondHighRiskDomain, false);
  assert.equal(scopeWaiver.newTimeboxHours, 8);
  assert.deepEqual(scopeWaiver.supportingDomains, ["CI-test-infrastructure", "documentation-metadata"]);
  assert.deepEqual(scopeWaiver.fileBudget, { default: 15, waivedMaximum: 24 });
  assert.deepEqual(scopeWaiver.lineBudget, { default: 1200, waivedMaximum: 2200 });

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
  for (const command of [
    "node scripts/assurance/codex-security-target.mjs --base=origin/main --target=HEAD",
    "node scripts/assurance/pr-scope.mjs --feature=codex-security-scan-reliability-s0 --waiver=config/assurance/codex-security-reliability-s0-scope-waiver-v1.json",
    "node scripts/assurance/codex-security-reliability.mjs --benchmark=all",
    "node --test tests/assurance/codex-security-reliability-s0.test.mjs",
  ]) {
    assert.equal(workflow.includes(command), true, command);
  }
  for (const requiredText of [
    "HOST_SNAPSHOT_DIGEST_NOT_PREFLIGHTABLE",
    "BLOCKED_TOOLING_CODEX_SECURITY_SNAPSHOT_DIGEST_PREFLIGHT",
    "workersStarted=false",
    "REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED",
  ]) {
    assert.equal(skill.includes(requiredText), true, requiredText);
  }
});
