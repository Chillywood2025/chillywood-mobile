import assert from "node:assert/strict";
import test from "node:test";
import {
  GITHUB_AUTHORITY_INVENTORY_V2,
  PROVIDER_CLASSIFICATIONS,
  canReuseEvidence,
  classifyProviderFailure,
  controlPlaneHash,
  enumerateCompletePages,
  exactEvidenceIdentity,
  readGitHubJsonSync,
  resolveFiniteTaskAmendmentState,
  resolveLifecycle,
  resolveTerminalAmendmentState,
} from "../../scripts/assurance/control-plane-v2.mjs";
import { runControlPlaneQualification } from "../../scripts/assurance/control-plane-qualification.mjs";

const sha = (character) => character.repeat(40);
const hash = (character) => character.repeat(64);

test("the full control-plane qualification passes every mandatory adversarial variant", async () => {
  const result = await runControlPlaneQualification();
  assert.equal(result.ok, true, JSON.stringify({ variants: result.variants.filter(({ ok }) => !ok), negative: result.negativeControls.filter(({ ok }) => !ok) }));
  assert.equal(result.metrics.adversarialVariants, 31);
  assert.equal(result.metrics.adversarialPassed, 31);
  assert.equal(result.metrics.negativeControls, 29);
  assert.equal(result.metrics.negativeControlsPassed, 29);
  assert.equal(result.metrics.terminalSynchronizationSecondRunMutations, 0);
});

test("BASE_ONLY accepts optional amendment authority when no amendment was consumed", () => {
  const baseLease = { paths: ["a"] };
  for (const maximumAmendments of [0, 1]) {
    const result = resolveFiniteTaskAmendmentState({ maximumAmendments, amendmentsConsumed: 0, amendmentReceipt: null, baseLease, effectiveLease: structuredClone(baseLease) });
    assert.equal(result.ok, true);
    assert.equal(result.status, "BASE_ONLY");
  }
});

test("amendment state rejects missing, excessive, wrong and wildcard-like authority states", () => {
  const baseLease = { paths: ["a"] };
  const changed = { paths: ["a", "b"] };
  assert.equal(resolveFiniteTaskAmendmentState({ maximumAmendments: 1, amendmentsConsumed: 1, amendmentReceipt: null, baseLease, effectiveLease: changed }).ok, false);
  assert.equal(resolveFiniteTaskAmendmentState({ maximumAmendments: 1, amendmentsConsumed: 2, amendmentReceipt: { id: 1 }, baseLease, effectiveLease: changed }).ok, false);
  assert.equal(resolveFiniteTaskAmendmentState({ maximumAmendments: 1, amendmentsConsumed: 0, amendmentReceipt: null, baseLease, effectiveLease: changed }).ok, false);
  assert.equal(resolveFiniteTaskAmendmentState({ maximumAmendments: 1, amendmentsConsumed: 0, amendmentReceipt: { id: 1 }, baseLease, effectiveLease: baseLease }).ok, false);
});

test("exact unchanged evidence reuses only the complete immutable identity", () => {
  const request = {
    repository: "Chillywood2025/chillywood-mobile", pr: 1, taskId: "task", leaseHash: hash("1"), headSha: sha("2"), tree: sha("3"), baseSha: sha("4"),
    changedPathHash: hash("5"), sourceIdentityHash: hash("6"), lifecycleGeneration: "READY-1", rulesetStage: "FINAL", reviewIdentity: "review",
  };
  const identity = exactEvidenceIdentity(request);
  assert.equal(identity.ok, true);
  assert.equal(canReuseEvidence({ evidence: { immutable: true, key: identity.key, identity: identity.identity }, request }), true);
  assert.equal(canReuseEvidence({ evidence: { immutable: true, key: identity.key, identity: identity.identity }, request: { ...request, headSha: sha("7") } }), false);
  assert.equal(canReuseEvidence({ evidence: { immutable: false, key: identity.key, identity: identity.identity }, request }), false);
});

test("draft proof is source-readiness only and never merge authority", () => {
  const identity = { headSha: sha("1"), tree: sha("3"), baseSha: sha("2") };
  const draft = resolveLifecycle({ state: "DRAFT", event: "SOURCE_READINESS", identity });
  assert.equal(draft.ok, true);
  assert.equal(draft.sourceReadinessOnly, true);
  assert.equal(draft.mergeAuthorityGranted, false);
  const denied = resolveLifecycle({ state: "DRAFT", event: "MERGE", identity, evidence: { reviewCurrent: true, phase1Current: true, finalSourceCurrent: true, ...identity } });
  assert.equal(denied.ok, false);
  assert.ok(denied.findings.includes("DRAFT_MERGE_FORBIDDEN"));
});

test("ready merge binds exact head, base, review, Phase 1 and final source", () => {
  const identity = { headSha: sha("1"), tree: sha("3"), baseSha: sha("2") };
  const evidence = { ...identity, reviewCurrent: true, phase1Current: true, finalSourceCurrent: true };
  assert.equal(resolveLifecycle({ state: "READY", event: "MERGE", identity, evidence }).mergeAuthorityGranted, true);
  assert.equal(resolveLifecycle({ state: "READY", event: "MERGE", identity, evidence: { ...evidence, baseSha: sha("3") } }).ok, false);
  assert.equal(resolveLifecycle({ state: "READY", event: "MERGE", identity, evidence: { ...evidence, tree: sha("4") } }).ok, false);
  assert.equal(resolveLifecycle({ state: "READY", event: "MERGE", identity, evidence: { ...evidence, reviewCurrent: false } }).ok, false);
});

test("provider failures retain source, provider and retry semantics", () => {
  assert.deepEqual(classifyProviderFailure({ status: 500 }, { operation: "read" }), { classification: PROVIDER_CLASSIFICATIONS.TRANSIENT_FAILURE, retryable: true });
  assert.deepEqual(classifyProviderFailure({ status: 500 }, { operation: "dispatch" }), { classification: PROVIDER_CLASSIFICATIONS.DISPATCH_UNAVAILABLE, retryable: true });
  assert.deepEqual(classifyProviderFailure({ status: 403 }), { classification: PROVIDER_CLASSIFICATIONS.AUTHORITY_MISSING, retryable: false });
  assert.deepEqual(classifyProviderFailure(new Error("missing page")), { classification: PROVIDER_CLASSIFICATIONS.READ_INCOMPLETE, retryable: false });
  assert.deepEqual(classifyProviderFailure(new Error("ruleset configuration changed")), { classification: PROVIDER_CLASSIFICATIONS.CONFIGURATION_DRIFT, retryable: false });
});

test("GitHub CLI HTTP status wins over its generic process exit status", () => {
  let calls = 0;
  const transient = readGitHubJsonSync({
    root: process.cwd(),
    endpoint: "repos/Chillywood2025/chillywood-mobile",
    run: () => { calls += 1; return { status: 1, stdout: "", stderr: "gh: upstream unavailable (HTTP 500)" }; },
  });
  assert.equal(transient.classification, PROVIDER_CLASSIFICATIONS.TRANSIENT_FAILURE);
  assert.equal(transient.attempts, 3);
  assert.equal(calls, 3);
  const denied = readGitHubJsonSync({
    root: process.cwd(),
    endpoint: "repos/Chillywood2025/chillywood-mobile",
    run: () => ({ status: 1, stdout: "", stderr: "gh: forbidden (HTTP 403)" }),
  });
  assert.equal(denied.classification, PROVIDER_CLASSIFICATIONS.AUTHORITY_MISSING);
  assert.equal(denied.attempts, 1);
  const malformed = readGitHubJsonSync({
    root: process.cwd(),
    endpoint: "repos/Chillywood2025/chillywood-mobile",
    run: () => ({ status: 0, stdout: "{", stderr: "" }),
  });
  assert.equal(malformed.classification, PROVIDER_CLASSIFICATIONS.READ_INCOMPLETE);
  const unbounded = readGitHubJsonSync({ root: process.cwd(), endpoint: "x", attempts: 4, run: () => ({ status: 0, stdout: "{}", stderr: "" }) });
  assert.equal(unbounded.classification, PROVIDER_CLASSIFICATIONS.VALIDATION_FAILURE);
  assert.equal(unbounded.attempts, 0);
});

test("terminal amendment binding separates optional capacity from consumed authority", () => {
  const reservation = (paths, maximumFiles, maximumLines) => {
    const value = { allowedPaths: paths, pathGlobs: paths, maximumFiles, maximumLines, eligiblePathCount: paths.length };
    return { ...value, reservationHash: controlPlaneHash(value) };
  };
  const lease = { domain: "ci-test-infrastructure", allowedPaths: ["a"], scopeBudget: { maximumFiles: 1, maximumChangedLines: 10 }, amendmentMaximum: { maximumAmendments: 1, maximumFiles: 2, maximumChangedLines: 20 } };
  const base = reservation(["a"], 1, 10);
  assert.equal(resolveTerminalAmendmentState({ lease, baseReservation: base, effectiveReservation: structuredClone(base), amendmentReceipt: null }).status, "BASE_ONLY");
  const effective = reservation(["a", "b"], 2, 20);
  const receipt = { commentId: 1, createdAt: "2026-09-11T00:00:00.000Z", subjectHash: hash("1"), bodyHash: hash("2"), rawBodyHash: hash("3"), boundStartingHead: sha("4"), boundStartingTree: sha("5"), addedPaths: ["b"], domain: lease.domain, authorityClassification: "LIVE_IMMUTABLE_OWNER_RECEIPT" };
  assert.equal(resolveTerminalAmendmentState({ lease, baseReservation: base, effectiveReservation: effective, amendmentReceipt: receipt }).status, "AMENDED");
  assert.equal(resolveTerminalAmendmentState({ lease, baseReservation: base, effectiveReservation: effective, amendmentReceipt: { ...receipt, domain: "wrong-task-domain" } }).ok, false);
  assert.equal(resolveTerminalAmendmentState({ lease, baseReservation: base, effectiveReservation: effective, amendmentReceipt: { ...receipt, addedPaths: ["*"] } }).ok, false);
});

test("pagination proves zero, page-boundary, final partial and cycle cases", async () => {
  const zero = await enumerateCompletePages({ fetchPage: async () => ({ items: [], complete: true }) });
  assert.equal(zero.ok, true);
  assert.equal(zero.pages, 1);
  const boundary = await enumerateCompletePages({ fetchPage: async ({ page }) => page === 1 ? { items: Array(100).fill(1), complete: false, nextCursor: "next" } : { items: [], complete: true } });
  assert.equal(boundary.ok, true);
  assert.equal(boundary.items.length, 100);
  const partial = await enumerateCompletePages({ fetchPage: async ({ page }) => page === 1 ? { items: Array(100).fill(1), complete: false, nextCursor: "next" } : { items: [2], complete: true } });
  assert.equal(partial.items.length, 101);
  const cycle = await enumerateCompletePages({ fetchPage: async () => ({ items: [1], complete: false, nextCursor: "same" }) });
  assert.equal(cycle.ok, false);
  assert.equal(cycle.classification, PROVIDER_CLASSIFICATIONS.READ_INCOMPLETE);
});

test("GitHub authority inventory declares each endpoint and minimum permission", () => {
  assert.deepEqual(Object.keys(GITHUB_AUTHORITY_INVENTORY_V2).sort(), ["appReadback", "checks", "issueComments", "pullCommits", "pullRequest", "repositoryMetadata", "rulesets", "workflowRuns"]);
  for (const value of Object.values(GITHUB_AUTHORITY_INVENTORY_V2)) {
    assert.match(value.endpoint, /^(GET|POST) /u);
    assert.match(value.permission, /read/u);
  }
  assert.match(GITHUB_AUTHORITY_INVENTORY_V2.issueComments.permission, /^issues:read$/u);
});

test("canonical hashing is key-order independent and evidence-sensitive", () => {
  assert.equal(controlPlaneHash({ a: 1, b: 2 }), controlPlaneHash({ b: 2, a: 1 }));
  assert.notEqual(controlPlaneHash({ a: 1 }), controlPlaneHash({ a: 2 }));
});
