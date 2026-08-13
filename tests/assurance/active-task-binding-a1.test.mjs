import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  activeTask,
  ownerBootstrapAuthorizationCommentBody,
  ownerBootstrapBindingSubject,
  validateEngineeringTaskAuthority,
  validateStructuredBinding,
  verifyOwnerBootstrapAuthorization
} from "../../scripts/assurance/active-task.mjs";
import {
  ASSURANCE_RECURSIVE_BOOTSTRAP_CYCLE,
  controlMaintenanceAuthorizationCommentBody,
  controlMaintenanceAuthorizationSubject,
  detectAssuranceRecursion,
  evaluateFiniteTaskCandidate,
  evaluateFiniteTaskLeaseRuntime,
  evaluateProtectedMainAdvancement,
  exactExternalSourceProvenance,
  finiteTaskFinalReceiptBody,
  finiteTaskFinalReceiptSubject,
  finiteTaskLeaseFor,
  HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1,
  PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1,
  PENDING_TERMINAL_TRUTH_TRANSITION_V1,
  renderCurrentState,
  renderNextTask,
  resolveCurrentProtectedBase,
  stableJson,
  TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS,
  taskLeaseAmendmentCommentBody,
  taskLeaseAmendmentSubject,
  transitionFiniteTaskState,
  validateFiniteTaskLeaseRegistry,
  validateEngineeringDoctrineTruth,
  validateProofTierStatuses,
  validateTerminalTaskEvidence,
  verifyCommittedClaimEvidence,
  verifyCompletedImplementationMergeIdentity,
  verifyControlMaintenanceAuthorization,
  verifyCurrentTruthSynchronization,
  verifyFiniteTaskFinalReceipt,
  verifyFiniteTaskMergeProvenance,
  verifyTaskLeaseAmendment
} from "../../scripts/assurance/lib.mjs";
import { DOCTRINE_BASE, TYPED_CONTEXT_ARCHITECTURE_PATHS, affectedDomainClosure, contentSnapshotSubject, deriveCurrentTreeObservation, deriveDoctrineArtifactDependencyClosure, deriveEngineeringClosureExecutionMode, generateCurrentEngineeringTaskReport, generateDomainGraph, hashValue, makeTaskPacket, resolveEngineeringClosureTaskContext, structuralGraphSubject, validateDoctrineBaselineArtifacts } from "../../scripts/assurance/engineering-closure.mjs";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const canonicalTruth = read("config/assurance/current-truth-v1.json");
const registry = read("config/assurance/feature-registry-v1.json");
const allowlist = read("config/assurance/command-allowlist-v1.json");
const gateCatalog = read("config/assurance/gate-catalog-v1.json");
const currentTruthContract = read("config/assurance/current-truth-contract-v1.json");
const historicalPr214Truth = JSON.parse(spawnSync("git", [
  "show",
  "d6afdf1d2df65f341355e98e91cf2300296a80ad:config/assurance/current-truth-v1.json"
], { encoding: "utf8" }).stdout);
const e0Feature = registry.features.find(({ featureId }) => featureId === "assurance-efficiency-e0");
const callFeature = registry.features.find(({ featureId }) => featureId === "chilly-chat-call-lifecycle");
const creatorFeature = registry.features.find(({ featureId }) => featureId === "creator-money-ledger");
const cognitiveFeature = registry.features.find(({ featureId }) => featureId === "autonomous-cognitive-governance");
const completedProofTierStatuses = {
  T0_REQUIREMENT: "REQUIREMENTS_CLEAR",
  T1_SOURCE: "SOURCE_CLEAR",
  T2_MODEL: "MODEL_CLEAR",
  T3_INTEGRATION: "INTEGRATION_CLEAR",
  T4_NATIVE_PROVIDER: "NOT_APPLICABLE",
  T5_SIGNED_ARTIFACT: "NOT_APPLICABLE",
  T6_INSTALLED_PHYSICAL: "NOT_APPLICABLE",
  T7_PUBLIC_CANARY: "NOT_APPLICABLE"
};
const e0CompletionFacts = [
  "repository.assurance-control.a1.requirements",
  "repository.assurance-control.a1.source",
  "repository.assurance-control.a1.model",
  "repository.assurance-control.a1.integration"
];
const binding = {
  schemaVersion: 1,
  featureId: "chilly-chat-call-lifecycle",
  implementationPr: 194,
  implementationBranch: "codex/d2a-livekit-mic-membership-convergence-correction",
  implementationBindingId: "d2a-microphone-correction-pr194-v1",
  immutableSourceHead: "c15a58039b67d65eabdcaa03a9422ebc8d6dd95e",
  immutableSourceTree: "4ce01fa17e4184f2523b82a10401e3b3f59dd641",
  currentImplementationHead: "ada396a437e40a98acea75bf016c36fc3ea86739",
  currentImplementationTree: "662dc601bf54b8abdc78cc915d757a6c55c2b39d",
  phase: "FORMAL_REVIEW",
  executionState: "D2A_FROZEN",
  requiredFreshnessClasses: ["REPOSITORY_SOURCE"],
  requiredFreshnessClaims: [{
    freshnessClass: "REPOSITORY_SOURCE",
    platform: "NONE",
    evidenceSourceId: "d2a-microphone-correction-merge-closeout-20260809-1805",
    authorityAllowed: "REPOSITORY_ONLY",
    requiredFacts: ["repository.active-implementation.immutable-synchronized-source"],
    subjectHead: "c15a58039b67d65eabdcaa03a9422ebc8d6dd95e",
    subjectTree: "4ce01fa17e4184f2523b82a10401e3b3f59dd641"
  }],
  proofTiersUnderEvaluation: ["T1_SOURCE"]
};
const e0CompletionClaims = () => binding.requiredFreshnessClaims.map((claim) => ({
  ...claim,
  provider: "NONE",
  requiredFacts: e0CompletionFacts
}));
const latestMergedFor = (candidate) => ({
  number: candidate.implementationPr,
  state: "merged",
  head: candidate.currentImplementationHead,
  mergeSha: "e".repeat(40),
  title: "Exact completed implementation"
});
const truth = {
  ...canonicalTruth,
  engineeringDoctrine: undefined,
  taskContextArchitecture: undefined,
  lateReviewSentinels: [],
  activeTaskBinding: binding,
  assuranceProgram: { ...canonicalTruth.assuranceProgram, active: binding.featureId },
  openImplementationPrs: [{
    number: binding.implementationPr,
    branch: binding.implementationBranch,
    head: binding.currentImplementationHead,
    state: "open"
  }]
};
const identity = {
  branch: binding.implementationBranch,
  head: binding.currentImplementationHead,
  tree: binding.currentImplementationTree,
  originMainHead: DOCTRINE_BASE,
  originMainTree: "4".repeat(40),
  baseHead: DOCTRINE_BASE,
  baseTree: "4".repeat(40),
  diffHash: "5".repeat(64),
  pathHash: "6".repeat(64),
  changedFiles: ["scripts/assurance/active-task.mjs"]
};
const implementationObservations = {
  remoteHead: binding.currentImplementationHead,
  immutableTree: binding.immutableSourceTree,
  currentTree: binding.currentImplementationTree,
  immutableSourceIsAncestor: true,
  providerPrHead: binding.currentImplementationHead
};
const facts = {
  currentTruth: truth,
  protectedMainTruth: truth,
  registry,
  allowlist,
  truthCheck: { ok: true },
  identity,
  implementationObservations,
  sourceChanging: false,
  readOnlyDiagnostic: true,
  directlyAffectedSymbols: ["scripts/assurance/active-task.mjs#activeTask"]
};
const withTruth = (change) => ({ ...facts, currentTruth: change(truth) });
const digest = (value) => createHash("sha256").update(value).digest("hex");

function authorizeOwnerBootstrap(value) {
  const createdAt = "2026-08-10T02:30:00Z";
  const authorization = {
    schemaVersion: 1,
    repository: "Chillywood2025/chillywood-mobile",
    prNumber: value.implementationPr,
    commentId: 4001,
    author: "Chillywood2025",
    authorAssociation: "OWNER",
    createdAt,
    updatedAt: createdAt,
    bodySha256: "0".repeat(64),
    subjectHash: digest(stableJson(ownerBootstrapBindingSubject(value)))
  };
  value.ownerBootstrapAuthorization = authorization;
  const body = ownerBootstrapAuthorizationCommentBody(value);
  authorization.bodySha256 = digest(body);
  return {
    commentId: authorization.commentId,
    author: authorization.author,
    authorAssociation: authorization.authorAssociation,
    body,
    createdAt,
    updatedAt: createdAt,
    issueUrl: `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${value.implementationPr}`
  };
}

test("frozen formal review resolves the structured feature and exact PR 194 source", () => {
  const result = activeTask(facts);
  assert.equal(result.ok, true, result.findings?.join(","));
  assert.equal(result.packet.featureId, "chilly-chat-call-lifecycle");
  assert.equal(result.packet.implementation.pr, 194);
  assert.deepEqual(result.packet.implementation.immutableSource, {
    head: "c15a58039b67d65eabdcaa03a9422ebc8d6dd95e",
    tree: "4ce01fa17e4184f2523b82a10401e3b3f59dd641"
  });
  assert.deepEqual(result.packet.implementation.currentSynchronizedSource, {
    head: "ada396a437e40a98acea75bf016c36fc3ea86739",
    tree: "662dc601bf54b8abdc78cc915d757a6c55c2b39d"
  });
  assert.equal(JSON.stringify(result.packet).includes("8c47a3a9bff9f9630ba14837652ec31c14be0629"), false);
  assert.equal(result.packet.activeBlockers.some(({ freshnessClass, status }) => freshnessClass === "PROVIDER_CRITICAL" && status === "STALE_BLOCKED"), true);
});

test("matching feature override succeeds but cannot bypass canonical truth", () => {
  assert.equal(activeTask({ ...facts, featureId: binding.featureId }).ok, true);
  const malformed = { ...binding };
  delete malformed.currentImplementationTree;
  const result = activeTask({ ...withTruth((value) => ({ ...value, activeTaskBinding: malformed })), featureId: binding.featureId });
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings, ["ACTIVE_TASK_BINDING_MALFORMED"]);
});

test("branch-local structured authority cannot replace protected-main truth outside the exact bootstrap registry", () => {
  const substituted = structuredClone(truth);
  substituted.activeTaskBinding = {
    ...substituted.activeTaskBinding,
    featureId: "assurance-efficiency-e0",
    implementationPr: 999,
    implementationBranch: "codex/unrelated-self-authorized",
    implementationBindingId: "self-authored-task-substitution",
    executionState: "SELF_AUTHORED"
  };
  substituted.openImplementationPrs = [{
    number: 999,
    branch: "codex/unrelated-self-authorized",
    head: substituted.activeTaskBinding.currentImplementationHead,
    state: "open"
  }];
  const result = activeTask({ ...facts, currentTruth: substituted, protectedMainTruth: truth });
  assert.deepEqual(result.findings, ["ACTIVE_TASK_AUTHORITY_UNVERIFIED"]);
});

test("the exact owner-authorized A1 bootstrap identity is narrow and cannot widen feature, PR, branch or execution state", () => {
  const a1 = structuredClone(truth);
  a1.activeTaskBinding = {
    ...a1.activeTaskBinding,
    featureId: "assurance-efficiency-e0",
    implementationPr: 201,
    implementationBranch: "codex/assurance-active-task-and-claim-freshness-a1",
    implementationBindingId: "assurance-active-task-claim-freshness-a1-pr201-v1",
    executionState: "ASSURANCE_CONTROL_A1"
  };
  a1.assuranceProgram.active = a1.activeTaskBinding.featureId;
  const ownerBootstrapAuthorizationObservation = authorizeOwnerBootstrap(a1.activeTaskBinding);
  a1.openImplementationPrs = [{
    number: 201,
    branch: a1.activeTaskBinding.implementationBranch,
    head: a1.activeTaskBinding.currentImplementationHead,
    state: "open"
  }];
  const a1Identity = { ...identity, branch: a1.activeTaskBinding.implementationBranch };
  assert.equal(activeTask({ ...facts, currentTruth: a1, protectedMainTruth: canonicalTruth, identity: a1Identity, ownerBootstrapAuthorizationObservation }).ok, true);
  for (const [field, value] of [
    ["featureId", "chilly-chat-call-lifecycle"],
    ["implementationPr", 999],
    ["implementationBranch", "codex/unrelated"],
    ["executionState", "UNRELATED"]
  ]) {
    const forged = structuredClone(a1);
    forged.activeTaskBinding[field] = value;
    const result = activeTask({ ...facts, currentTruth: forged, protectedMainTruth: canonicalTruth, identity: a1Identity, ownerBootstrapAuthorizationObservation });
    assert.equal(result.ok, false, field);
    assert(result.findings.some((finding) => ["ACTIVE_TASK_AUTHORITY_UNVERIFIED", "ACTIVE_TASK_BINDING_MALFORMED"].includes(finding)), field);
  }

  const forgedSource = structuredClone(a1);
  Object.assign(forgedSource.activeTaskBinding, {
    immutableSourceHead: "a".repeat(40),
    immutableSourceTree: "b".repeat(40),
    currentImplementationHead: "a".repeat(40),
    currentImplementationTree: "b".repeat(40),
    phase: "MERGE_ELIGIBLE"
  });
  Object.assign(forgedSource.activeTaskBinding.requiredFreshnessClaims[0], {
    subjectHead: "a".repeat(40),
    subjectTree: "b".repeat(40)
  });
  forgedSource.activeTaskBinding.ownerBootstrapAuthorization.subjectHash = digest(stableJson(ownerBootstrapBindingSubject(forgedSource.activeTaskBinding)));
  forgedSource.activeTaskBinding.ownerBootstrapAuthorization.bodySha256 = digest(ownerBootstrapAuthorizationCommentBody(forgedSource.activeTaskBinding));
  assert.deepEqual(activeTask({ ...facts, currentTruth: forgedSource, protectedMainTruth: canonicalTruth, identity: a1Identity, ownerBootstrapAuthorizationObservation }).findings, ["ACTIVE_TASK_AUTHORITY_UNVERIFIED"]);

  const editedObservation = { ...ownerBootstrapAuthorizationObservation, body: `${ownerBootstrapAuthorizationObservation.body}\nedited` };
  assert.deepEqual(activeTask({ ...facts, currentTruth: a1, protectedMainTruth: canonicalTruth, identity: a1Identity, ownerBootstrapAuthorizationObservation: editedObservation }).findings, ["ACTIVE_TASK_AUTHORITY_UNVERIFIED"]);

});

test("the exact Owner-authorized S0 bootstrap identity is narrow and cannot widen feature, PR, branch or execution state", () => {
  const s0 = structuredClone(truth);
  s0.activeTaskBinding = {
    ...s0.activeTaskBinding,
    featureId: "codex-security-scan-reliability-s0",
    implementationPr: 206,
    implementationBranch: "codex/assurance-codex-security-scan-reliability-s0",
    implementationBindingId: "assurance-codex-security-scan-reliability-s0-pr206-v1",
    executionState: "CODEX_SECURITY_SCAN_RELIABILITY_S0_BOOTSTRAP"
  };
  s0.assuranceProgram.active = s0.activeTaskBinding.featureId;
  const ownerBootstrapAuthorizationObservation = authorizeOwnerBootstrap(s0.activeTaskBinding);
  s0.openImplementationPrs = [{
    number: 206,
    branch: s0.activeTaskBinding.implementationBranch,
    head: s0.activeTaskBinding.currentImplementationHead,
    state: "open-draft-current"
  }];
  const s0Identity = { ...identity, branch: s0.activeTaskBinding.implementationBranch };
  assert.equal(activeTask({ ...facts, currentTruth: s0, protectedMainTruth: canonicalTruth, identity: s0Identity, ownerBootstrapAuthorizationObservation }).ok, true);
  for (const [field, value] of [
    ["featureId", "assurance-efficiency-e0"],
    ["implementationPr", 999],
    ["implementationBranch", "codex/unrelated"],
    ["executionState", "UNRELATED"]
  ]) {
    const forged = structuredClone(s0);
    forged.activeTaskBinding[field] = value;
    const result = activeTask({ ...facts, currentTruth: forged, protectedMainTruth: canonicalTruth, identity: s0Identity, ownerBootstrapAuthorizationObservation });
    assert.equal(result.ok, false, field);
    assert(result.findings.some((finding) => ["ACTIVE_TASK_AUTHORITY_UNVERIFIED", "ACTIVE_TASK_BINDING_MALFORMED"].includes(finding)), field);
  }
});

test("the exact Owner-authorized PR 210 bootstrap identity is narrow and cannot widen feature, PR, branch or execution state", () => {
  const correction = structuredClone(truth);
  correction.activeTaskBinding = {
    ...correction.activeTaskBinding,
    featureId: "chilly-chat-call-lifecycle",
    implementationPr: 210,
    implementationBranch: "codex/d2a-livekit-mic-post-merge-review-correction",
    implementationBindingId: "d2a-livekit-mic-post-merge-review-correction-pr210-v1",
    executionState: "LIVEKIT_MIC_POST_MERGE_CORRECTION_REVIEW_D2A_FROZEN"
  };
  correction.assuranceProgram.active = correction.activeTaskBinding.featureId;
  const ownerBootstrapAuthorizationObservation = authorizeOwnerBootstrap(correction.activeTaskBinding);
  correction.openImplementationPrs = [{
    number: 210,
    branch: correction.activeTaskBinding.implementationBranch,
    head: correction.activeTaskBinding.currentImplementationHead,
    state: "open-draft-current"
  }];
  const correctionIdentity = { ...identity, branch: correction.activeTaskBinding.implementationBranch };
  assert.equal(activeTask({
    ...facts,
    currentTruth: correction,
    protectedMainTruth: canonicalTruth,
    identity: correctionIdentity,
    ownerBootstrapAuthorizationObservation
  }).ok, true);
  for (const [field, value] of [
    ["featureId", "assurance-efficiency-e0"],
    ["implementationPr", 999],
    ["implementationBranch", "codex/unrelated"],
    ["implementationBindingId", "unrelated-binding"],
    ["executionState", "UNRELATED"]
  ]) {
    const forged = structuredClone(correction);
    forged.activeTaskBinding[field] = value;
    const result = activeTask({
      ...facts,
      currentTruth: forged,
      protectedMainTruth: canonicalTruth,
      identity: correctionIdentity,
      ownerBootstrapAuthorizationObservation
    });
    assert.equal(result.ok, false, field);
    assert(result.findings.some((finding) => ["ACTIVE_TASK_AUTHORITY_UNVERIFIED", "ACTIVE_TASK_BINDING_MALFORMED"].includes(finding)), field);
  }
});

test("conflicting feature override fails closed", () => {
  const result = activeTask({ ...facts, featureId: "assurance-efficiency-e0" });
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings, ["FEATURE_OVERRIDE_CONFLICT"]);
});

test("legacy fallback requires exactly one open implementation owner", () => {
  const withoutBinding = structuredClone(truth);
  delete withoutBinding.activeTaskBinding;
  assert.deepEqual(activeTask({ ...facts, currentTruth: { ...withoutBinding, openImplementationPrs: [] } }).findings, ["ACTIVE_TASK_NONE"]);
  assert.deepEqual(activeTask({
    ...facts,
    currentTruth: {
      ...withoutBinding,
      openImplementationPrs: [
        { number: 194, branch: binding.implementationBranch, head: binding.currentImplementationHead, state: "open" },
        { number: 201, branch: "codex/competing", head: "7".repeat(40), state: "open" }
      ]
    }
  }).findings, ["MULTIPLE_ACTIVE_IMPLEMENTATIONS"]);

  const legacy = { ...withoutBinding, openImplementationPrs: [{
    number: binding.implementationPr,
    branch: binding.implementationBranch,
    head: binding.currentImplementationHead,
    state: "open",
    featureId: binding.featureId
  }] };
  assert.equal(activeTask({ ...facts, currentTruth: legacy }).ok, true);
  const wrongHead = activeTask({ ...facts, currentTruth: legacy, identity: { ...identity, head: "d".repeat(40) } });
  assert.equal(wrongHead.ok, false);
  assert.equal(wrongHead.findings.includes("ACTIVE_IMPLEMENTATION_LOCAL_HEAD_MISMATCH"), true);
  const falseOpen = activeTask({ ...facts, currentTruth: { ...legacy, openImplementationPrs: [{ ...legacy.openImplementationPrs[0], state: "closed-unopened" }] } });
  assert.deepEqual(falseOpen.findings, ["IMPLEMENTATION_INVENTORY_STATE_MALFORMED"]);
});

test("malformed structured binding and display disagreement fail closed", () => {
  const malformed = { ...binding, implementationPr: "194" };
  assert.deepEqual(activeTask(withTruth((value) => ({ ...value, activeTaskBinding: malformed }))).findings, ["ACTIVE_TASK_BINDING_MALFORMED"]);
  const conflict = activeTask(withTruth((value) => ({
    ...value,
    assuranceProgram: { ...value.assuranceProgram, active: "assurance-efficiency-e0" }
  })));
  assert.equal(conflict.ok, false);
  assert.deepEqual(conflict.findings, ["ACTIVE_TASK_STRUCTURED_DISPLAY_CONFLICT"]);
});

test("PR, branch and synchronized identity substitutions fail closed", () => {
  const prMismatch = activeTask(withTruth((value) => ({
    ...value,
    openImplementationPrs: [{ ...value.openImplementationPrs[0], number: 999 }]
  })));
  assert.equal(prMismatch.findings.includes("ACTIVE_IMPLEMENTATION_OWNERSHIP_MISMATCH"), true);
  const branchMismatch = activeTask({ ...facts, identity: { ...identity, branch: "codex/substitute" } });
  assert.equal(branchMismatch.findings.includes("ACTIVE_IMPLEMENTATION_LOCAL_BRANCH_MISMATCH"), true);
  const remoteMismatch = activeTask({ ...facts, implementationObservations: { ...implementationObservations, remoteHead: "8".repeat(40) } });
  assert.equal(remoteMismatch.findings.includes("ACTIVE_IMPLEMENTATION_REMOTE_HEAD_MISMATCH"), true);
  const providerMismatch = activeTask({ ...facts, implementationObservations: { ...implementationObservations, providerPrHead: "9".repeat(40) } });
  assert.equal(providerMismatch.findings.includes("ACTIVE_IMPLEMENTATION_PROVIDER_HEAD_MISMATCH"), true);
});

test("tree and immutable ancestry substitutions fail closed", () => {
  const immutableTree = activeTask({ ...facts, implementationObservations: { ...implementationObservations, immutableTree: "a".repeat(40) } });
  assert.equal(immutableTree.findings.includes("ACTIVE_IMPLEMENTATION_IMMUTABLE_TREE_MISMATCH"), true);
  const currentTree = activeTask({ ...facts, implementationObservations: { ...implementationObservations, currentTree: "b".repeat(40) } });
  assert.equal(currentTree.findings.includes("ACTIVE_IMPLEMENTATION_CURRENT_TREE_MISMATCH"), true);
  const ancestry = activeTask({ ...facts, implementationObservations: { ...implementationObservations, immutableSourceIsAncestor: false } });
  assert.equal(ancestry.findings.includes("ACTIVE_IMPLEMENTATION_IMMUTABLE_ANCESTRY_MISMATCH"), true);
});

test("a current-truth-verified base synchronization becomes the exact packet identity", () => {
  const synchronizedHead = "7".repeat(40);
  const synchronizedTree = "8".repeat(40);
  const accepted = {
    ok: true,
    classification: "BASE_SYNCHRONIZED_IMPLEMENTATION_BRANCH",
    sourceHead: binding.currentImplementationHead,
    synchronizedHead,
    synchronizedTree,
    currentMain: identity.originMainHead
  };
  const result = activeTask({
    ...facts,
    truthCheck: { ok: true, headBindings: { acceptedBaseSynchronizations: { [binding.implementationPr]: accepted } } },
    identity: { ...identity, head: synchronizedHead, tree: synchronizedTree },
    implementationObservations: {
      ...implementationObservations,
      remoteHead: synchronizedHead,
      currentTree: synchronizedTree,
      providerPrHead: synchronizedHead
    }
  });
  assert.equal(result.ok, true, result.findings?.join(","));
  assert.deepEqual(result.packet.implementation.immutableSource, {
    head: binding.immutableSourceHead,
    tree: binding.immutableSourceTree
  });
  assert.deepEqual(result.packet.implementation.currentSynchronizedSource, {
    head: synchronizedHead,
    tree: synchronizedTree
  });
});

test("one exact generated three-file current-truth binding commit becomes the packet identity", () => {
  const synchronizedHead = "b".repeat(40);
  const synchronizedTree = "c".repeat(40);
  const accepted = {
    ok: true,
    classification: "CURRENT_TRUTH_BINDING_COMMIT",
    sourceHead: binding.currentImplementationHead,
    synchronizedHead,
    synchronizedTree,
    currentMain: identity.originMainHead
  };
  const result = activeTask({
    ...facts,
    truthCheck: { ok: true, headBindings: { acceptedBaseSynchronizations: { [binding.implementationPr]: accepted } } },
    identity: { ...identity, head: synchronizedHead, tree: synchronizedTree },
    implementationObservations: {
      ...implementationObservations,
      remoteHead: synchronizedHead,
      currentTree: synchronizedTree,
      providerPrHead: synchronizedHead
    }
  });
  assert.equal(result.ok, true, result.findings?.join(","));
  assert.equal(result.packet.implementation.currentSynchronizedHead, synchronizedHead);
  assert.equal(result.packet.implementation.currentSynchronizedTree, synchronizedTree);
});

test("unverified or substituted base synchronization identities fail closed", () => {
  const synchronizedHead = "7".repeat(40);
  const synchronizedTree = "8".repeat(40);
  const accepted = {
    ok: true,
    classification: "BASE_SYNCHRONIZED_IMPLEMENTATION_BRANCH",
    sourceHead: binding.currentImplementationHead,
    synchronizedHead,
    synchronizedTree,
    currentMain: identity.originMainHead
  };
  const synchronizedFacts = {
    ...facts,
    identity: { ...identity, head: synchronizedHead, tree: synchronizedTree },
    implementationObservations: {
      ...implementationObservations,
      remoteHead: synchronizedHead,
      currentTree: synchronizedTree,
      providerPrHead: synchronizedHead
    }
  };
  for (const substituted of [
    { ...accepted, sourceHead: "9".repeat(40) },
    { ...accepted, currentMain: "a".repeat(40) },
    { ...accepted, synchronizedTree: "b".repeat(40) },
    { ...accepted, classification: "EXACT_SOURCE_HEAD" }
  ]) {
    const result = activeTask({
      ...synchronizedFacts,
      truthCheck: { ok: true, headBindings: { acceptedBaseSynchronizations: { [binding.implementationPr]: substituted } } }
    });
    assert.equal(result.ok, false);
    assert.equal(result.findings.includes("ACTIVE_IMPLEMENTATION_LOCAL_HEAD_MISMATCH"), true);
  }
});

test("formal review requires a synchronized identity", () => {
  const incomplete = { ...binding };
  delete incomplete.currentImplementationHead;
  const result = activeTask(withTruth((value) => ({ ...value, activeTaskBinding: incomplete })));
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings, ["ACTIVE_TASK_BINDING_MALFORMED"]);
});

test("freshness claim scopes must match declared classes and proof tiers", () => {
  const missingScope = { ...binding };
  delete missingScope.requiredFreshnessClaims;
  assert.deepEqual(activeTask(withTruth((value) => ({ ...value, activeTaskBinding: missingScope }))).findings, ["ACTIVE_TASK_BINDING_MALFORMED"]);

  const proofSubstitution = {
    ...binding,
    proofTiersUnderEvaluation: ["T5_SIGNED_ARTIFACT"]
  };
  assert.deepEqual(activeTask(withTruth((value) => ({ ...value, activeTaskBinding: proofSubstitution }))).findings, ["ACTIVE_TASK_BINDING_MALFORMED"]);
});

test("a completed binding is not an active task and no override can revive it", () => {
  const completedBinding = {
    ...binding,
    featureId: "assurance-efficiency-e0",
    phase: "COMPLETE",
    proofTierStatuses: completedProofTierStatuses,
    proofTierApplicabilityHash: digest(stableJson(e0Feature.proofTierApplicability)),
    proofTiersUnderEvaluation: ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION"],
    requiredFreshnessClaims: e0CompletionClaims()
  };
  const completeTruth = {
    ...truth,
    activeTaskBinding: completedBinding,
    latestMergedImplementationPr: latestMergedFor(completedBinding),
    openImplementationPrs: []
  };
  const completeIdentity = {
    ...identity,
    branch: binding.implementationBranch
  };
  const competing = activeTask({
    ...facts,
    protectedMainTruth: completeTruth,
    currentTruth: {
      ...completeTruth,
      openImplementationPrs: [{
        number: 201,
        branch: completeIdentity.branch,
        head: "c".repeat(40),
        state: "open"
      }]
    },
    identity: completeIdentity
  });
  assert.equal(competing.ok, false);
  assert.deepEqual(competing.findings, ["COMPLETED_IMPLEMENTATION_COMPETING_OPEN_IMPLEMENTATION"]);
  assert.deepEqual(activeTask({ ...facts, currentTruth: completeTruth, protectedMainTruth: completeTruth, featureId: completedBinding.featureId }).findings, ["ACTIVE_TASK_NONE"]);
  const unrelatedSentinelTruth = {
    ...completeTruth,
    lateReviewSentinels: canonicalTruth.lateReviewSentinels
  };
  assert.deepEqual(activeTask({
    ...facts,
    currentTruth: unrelatedSentinelTruth,
    protectedMainTruth: unrelatedSentinelTruth,
    featureId: completedBinding.featureId
  }).findings, ["ACTIVE_TASK_NONE"], "exact protected tombstones keep the historical incidents visible without reviving their blocker");
  const assuranceBootstrapBinding = {
    ...completedBinding,
    implementationBranch: "codex/assurance-codex-security-scan-reliability-s0"
  };
  const assuranceBootstrapTruth = {
    ...completeTruth,
    activeTaskBinding: assuranceBootstrapBinding,
    latestMergedImplementationPr: latestMergedFor(assuranceBootstrapBinding),
    lateReviewSentinels: canonicalTruth.lateReviewSentinels
  };
  assert.deepEqual(activeTask({
    ...facts,
    currentTruth: assuranceBootstrapTruth,
    protectedMainTruth: assuranceBootstrapTruth,
    featureId: assuranceBootstrapBinding.featureId
  }).findings, ["ACTIVE_TASK_NONE"]);
  const sentinelBlockedTruth = {
    ...completeTruth,
    lateReviewSentinels: [{
      ...canonicalTruth.lateReviewSentinels[0],
      successorCorrectionOwner: completedBinding.implementationBranch
    }]
  };
  assert.deepEqual(activeTask({
    ...facts,
    currentTruth: sentinelBlockedTruth,
    protectedMainTruth: sentinelBlockedTruth,
    featureId: completedBinding.featureId
  }).findings, ["LATE_REVIEW_COMPLETION_CLAIM_BLOCKED"], "a known finding set with branch-local owner drift must remain blocking");
  const discoverySentinel = structuredClone(canonicalTruth.lateReviewSentinels.find(({ prNumber }) => prNumber === 195));
  discoverySentinel.successorCorrectionOwner = "UNASSIGNED_BLOCKED";
  delete discoverySentinel.assuranceControlOwner;
  delete discoverySentinel.authorizedBootstrapOwners;
  const assuranceCorrectionBinding = {
    ...completedBinding,
    implementationBranch: "codex/assurance-active-task-and-claim-freshness-a1"
  };
  const discoveryBlockedTruth = {
    ...completeTruth,
    activeTaskBinding: assuranceCorrectionBinding,
    latestMergedImplementationPr: latestMergedFor(assuranceCorrectionBinding),
    lateReviewSentinels: [discoverySentinel]
  };
  assert.deepEqual(activeTask({
    ...facts,
    currentTruth: discoveryBlockedTruth,
    protectedMainTruth: discoveryBlockedTruth,
    featureId: assuranceCorrectionBinding.featureId
  }).findings, ["LATE_REVIEW_COMPLETION_CLAIM_BLOCKED"]);
});

test("a COMPLETE binding records every tier with exact gate-catalog vocabulary", () => {
  const complete = {
    ...binding,
    featureId: "assurance-efficiency-e0",
    phase: "COMPLETE",
    proofTierStatuses: completedProofTierStatuses,
    proofTierApplicabilityHash: digest(stableJson(e0Feature.proofTierApplicability)),
    proofTiersUnderEvaluation: ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION"],
    requiredFreshnessClaims: e0CompletionClaims()
  };
  assert.deepEqual(validateProofTierStatuses(complete, gateCatalog, registry), []);

  assert.equal(validateProofTierStatuses({ ...binding, proofTierStatuses: completedProofTierStatuses }, gateCatalog, registry).some(({ id }) => id === "ASSURANCE_PROOF_TIER_STATUSES_PREMATURE"), true);
  assert.equal(validateProofTierStatuses({ ...binding, proofTierApplicabilityHash: "f".repeat(64) }, gateCatalog, registry).some(({ id }) => id === "ASSURANCE_PROOF_TIER_STATUSES_PREMATURE"), true);

  const missingMap = { ...binding, phase: "COMPLETE" };
  assert.deepEqual(validateProofTierStatuses(missingMap, gateCatalog, registry), [{
    id: "ASSURANCE_PROOF_TIER_STATUSES_MISSING",
    status: "BLOCKED_INTERNAL"
  }]);
  assert.deepEqual(activeTask(withTruth((value) => ({
    ...value,
    activeTaskBinding: missingMap,
    latestMergedImplementationPr: latestMergedFor(missingMap),
    openImplementationPrs: []
  }))).findings, ["ACTIVE_TASK_BINDING_MALFORMED"]);

  for (const [label, mutate, expectedId] of [
    ["missing tier", (statuses) => { delete statuses.T7_PUBLIC_CANARY; }, "ASSURANCE_PROOF_TIER_STATUS_MISSING"],
    ["extra tier", (statuses) => { statuses.T8_UNKNOWN = "NOT_APPLICABLE"; }, "ASSURANCE_PROOF_TIER_STATUS_UNKNOWN"],
    ["free-form status", (statuses) => { statuses.T4_NATIVE_PROVIDER = "METADATA_BOUNDARY_CLEAR"; }, "ASSURANCE_PROOF_TIER_STATUS_INVALID"],
    ["cross-tier status", (statuses) => { statuses.T1_SOURCE = "MODEL_CLEAR"; }, "ASSURANCE_PROOF_TIER_STATUS_INVALID"],
    ["partial composite pass", (statuses) => { statuses.T4_NATIVE_PROVIDER = "NATIVE_CLEAR"; }, "ASSURANCE_PROOF_TIER_STATUS_INVALID"],
    ["blocked completion", (statuses) => { statuses.T1_SOURCE = "BLOCKED_INTERNAL"; }, "ASSURANCE_COMPLETED_PROOF_TIER_BLOCKED"]
  ]) {
    const candidate = structuredClone(complete);
    mutate(candidate.proofTierStatuses);
    const findings = validateProofTierStatuses(candidate, gateCatalog, registry);
    assert.equal(findings.some(({ id }) => id === expectedId), true, label);
  }

  const allNotApplicable = structuredClone(complete);
  allNotApplicable.proofTierStatuses = Object.fromEntries(Object.keys(completedProofTierStatuses).map((tier) => [tier, "NOT_APPLICABLE"]));
  const applicabilityFindings = validateProofTierStatuses(allNotApplicable, gateCatalog, registry);
  for (const tier of ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION"]) {
    assert.equal(applicabilityFindings.some(({ id, tier: findingTier }) => id === "ASSURANCE_REQUIRED_PROOF_TIER_NOT_CLEAR" && findingTier === tier), true, tier);
  }
  assert.deepEqual(activeTask({
    ...facts,
    currentTruth: { ...truth, activeTaskBinding: allNotApplicable, latestMergedImplementationPr: latestMergedFor(allNotApplicable), openImplementationPrs: [] },
    protectedMainTruth: { ...truth, activeTaskBinding: allNotApplicable, latestMergedImplementationPr: latestMergedFor(allNotApplicable), openImplementationPrs: [] }
  }).findings, ["ACTIVE_TASK_BINDING_MALFORMED"]);

  const promotedNotApplicableTier = structuredClone(complete);
  promotedNotApplicableTier.proofTierStatuses.T4_NATIVE_PROVIDER = ["NATIVE_CLEAR", "PROVIDER_CLEAR"];
  assert.equal(validateProofTierStatuses(promotedNotApplicableTier, gateCatalog, registry).some(({ id }) => id === "ASSURANCE_NOT_APPLICABLE_PROOF_TIER_PROMOTED"), true);

  const unboundEvaluation = structuredClone(complete);
  unboundEvaluation.proofTiersUnderEvaluation = ["T1_SOURCE"];
  assert.equal(validateProofTierStatuses(unboundEvaluation, gateCatalog, registry).some(({ id }) => id === "ASSURANCE_PROOF_TIER_EVALUATION_MISMATCH"), true);

  const compositeRequired = {
    ...binding,
    phase: "COMPLETE",
    proofTierApplicabilityHash: digest(stableJson(callFeature.proofTierApplicability)),
    proofTiersUnderEvaluation: ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION", "T4_NATIVE_PROVIDER", "T5_SIGNED_ARTIFACT", "T6_INSTALLED_PHYSICAL"],
    requiredFreshnessClasses: ["REPOSITORY_SOURCE", "PROVIDER_CRITICAL", "SIGNED_ARTIFACT", "INSTALLED_DEVICE", "PHYSICAL_DEVICE"],
    requiredFreshnessClaims: ["REPOSITORY_SOURCE", "PROVIDER_CRITICAL", "SIGNED_ARTIFACT", "INSTALLED_DEVICE", "PHYSICAL_DEVICE"].map((freshnessClass) => ({ freshnessClass })),
    proofTierStatuses: {
      T0_REQUIREMENT: "REQUIREMENTS_CLEAR",
      T1_SOURCE: "SOURCE_CLEAR",
      T2_MODEL: "MODEL_CLEAR",
      T3_INTEGRATION: "INTEGRATION_CLEAR",
      T4_NATIVE_PROVIDER: ["NATIVE_CLEAR", "PROVIDER_CLEAR"],
      T5_SIGNED_ARTIFACT: "ARTIFACT_CLEAR",
      T6_INSTALLED_PHYSICAL: ["INSTALLED_CLEAR", "PHYSICAL_CLEAR"],
      T7_PUBLIC_CANARY: "NOT_APPLICABLE"
    }
  };
  const compositeFindings = validateProofTierStatuses(compositeRequired, gateCatalog, registry);
  assert.equal(compositeFindings.some(({ id }) => id === "ASSURANCE_PROOF_TIER_STATUS_INVALID"), false);
  assert.equal(compositeFindings.some(({ id }) => id === "ASSURANCE_COMPLETED_PROOF_TIER_FACT_UNAUTHORIZED"), true);
  assert.equal(validateProofTierStatuses(compositeRequired, gateCatalog, { features: [] }).some(({ id }) => id === "ASSURANCE_PROOF_TIER_APPLICABILITY_MISSING"), true);

  const sourceOnlyHigherTierClaim = structuredClone(compositeRequired);
  sourceOnlyHigherTierClaim.requiredFreshnessClasses = ["REPOSITORY_SOURCE"];
  sourceOnlyHigherTierClaim.requiredFreshnessClaims = [{ freshnessClass: "REPOSITORY_SOURCE" }];
  const sourceOnlyFindings = validateProofTierStatuses(sourceOnlyHigherTierClaim, gateCatalog, registry);
  for (const freshnessClass of ["PROVIDER_CRITICAL", "SIGNED_ARTIFACT", "INSTALLED_DEVICE", "PHYSICAL_DEVICE"]) {
    assert.equal(sourceOnlyFindings.some(({ id, freshnessClass: findingClass }) => id === "ASSURANCE_COMPLETED_PROOF_TIER_FRESHNESS_MISSING" && findingClass === freshnessClass), true, freshnessClass);
  }

  const providerRequiredNotApplicable = {
    ...complete,
    featureId: creatorFeature.featureId,
    proofTierApplicabilityHash: digest(stableJson(creatorFeature.proofTierApplicability)),
    proofTierStatuses: { ...completedProofTierStatuses },
    proofTiersUnderEvaluation: ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION"]
  };
  assert.equal(validateProofTierStatuses(providerRequiredNotApplicable, gateCatalog, registry).some(({ id, tier }) => id === "ASSURANCE_REQUIRED_PROOF_TIER_NOT_CLEAR" && tier === "T4_NATIVE_PROVIDER"), true);

  const conditionalNotApplicable = {
    ...providerRequiredNotApplicable,
    featureId: cognitiveFeature.featureId,
    proofTierApplicabilityHash: digest(stableJson(cognitiveFeature.proofTierApplicability))
  };
  assert.equal(validateProofTierStatuses(conditionalNotApplicable, gateCatalog, registry).some(({ id, tier }) => id === "ASSURANCE_REQUIRED_PROOF_TIER_NOT_CLEAR" && tier === "T4_NATIVE_PROVIDER"), true);

  const unrelatedFactCompletion = structuredClone(complete);
  unrelatedFactCompletion.requiredFreshnessClaims[0].requiredFacts = ["provider.supabase.b3.live-acl"];
  const unrelatedFactFindings = validateProofTierStatuses(unrelatedFactCompletion, gateCatalog, registry);
  for (const tier of ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION"]) {
    assert.equal(unrelatedFactFindings.some(({ id, tier: findingTier }) => id === "ASSURANCE_COMPLETED_PROOF_TIER_FACT_UNAUTHORIZED" && findingTier === tier), true, tier);
  }

  for (const [tier, omittedFact] of [
    ["T0_REQUIREMENT", "repository.assurance-control.a1.requirements"],
    ["T1_SOURCE", "repository.assurance-control.a1.source"],
    ["T2_MODEL", "repository.assurance-control.a1.model"],
    ["T3_INTEGRATION", "repository.assurance-control.a1.integration"]
  ]) {
    const omitted = structuredClone(complete);
    omitted.requiredFreshnessClaims[0].requiredFacts = e0CompletionFacts.filter((factId) => factId !== omittedFact);
    assert.equal(validateProofTierStatuses(omitted, gateCatalog, registry).some(({ id, tier: findingTier }) =>
      id === "ASSURANCE_COMPLETED_PROOF_TIER_FACT_UNAUTHORIZED" && findingTier === tier), true, `${tier} requires ${omittedFact}`);
  }

  for (const [field, value] of [["authorityAllowed", "PROVIDER_READBACK_ONLY"], ["provider", "SUPABASE"]]) {
    const crossover = structuredClone(complete);
    crossover.requiredFreshnessClaims[0][field] = value;
    assert.equal(validateProofTierStatuses(crossover, gateCatalog, registry).some(({ id }) => id === "ASSURANCE_COMPLETED_PROOF_TIER_FACT_UNAUTHORIZED"), true, field);
  }

  const mismatchedRepositorySubject = structuredClone(complete);
  mismatchedRepositorySubject.immutableSourceHead = "d".repeat(40);
  assert.deepEqual(validateStructuredBinding(mismatchedRepositorySubject, gateCatalog, registry, [], latestMergedFor(mismatchedRepositorySubject)), ["ACTIVE_TASK_BINDING_MALFORMED"]);
  assert.deepEqual(validateStructuredBinding(complete, gateCatalog, registry, [{ number: 208 }], latestMergedFor(complete)), ["COMPLETED_IMPLEMENTATION_COMPETING_OPEN_IMPLEMENTATION"]);
  assert.deepEqual(validateStructuredBinding(complete, gateCatalog, registry, [], latestMergedFor({ ...complete, implementationPr: 999 })), ["COMPLETED_IMPLEMENTATION_MERGE_IDENTITY_MISMATCH"]);
  assert.equal(fs.readFileSync("scripts/assurance/current-truth.mjs", "utf8").includes("validateStructuredBinding("), true, "canonical truth reuses exact structured binding validation");

  const validMergeGit = (argv) => {
    if (argv[0] === "show" && argv.includes("--format=%P")) return `${"a".repeat(40)} ${complete.currentImplementationHead}`;
    if (argv[0] === "show" && argv.includes("--format=%s")) return `Merge pull request #${complete.implementationPr} from Chillywood2025/${complete.implementationBranch}`;
    if (argv[0] === "rev-parse") return complete.currentImplementationTree;
    if (argv[0] === "rev-list") return `${"f".repeat(40)}\n${latestMergedFor(complete).mergeSha}\n${"a".repeat(40)}`;
    if (argv[0] === "merge-base") return "";
    throw new Error("unexpected git command");
  };
  assert.deepEqual(verifyCompletedImplementationMergeIdentity({
    activeTaskBinding: complete,
    latestMergedImplementationPr: latestMergedFor(complete),
    remoteMain: "f".repeat(40),
    gitCommand: validMergeGit
  }), []);
  assert.equal(verifyCompletedImplementationMergeIdentity({
    activeTaskBinding: complete,
    latestMergedImplementationPr: latestMergedFor(complete),
    remoteMain: "f".repeat(40),
    gitCommand: (argv) => argv[0] === "show" ? `${"a".repeat(40)} ${"b".repeat(40)}` : validMergeGit(argv)
  }).some(({ id }) => id === "ASSURANCE_COMPLETED_IMPLEMENTATION_MERGE_PARENT_MISMATCH"), true);
  assert.equal(verifyCompletedImplementationMergeIdentity({
    activeTaskBinding: complete,
    latestMergedImplementationPr: latestMergedFor(complete),
    remoteMain: "f".repeat(40),
    gitCommand: (argv) => argv[0] === "rev-parse" ? "c".repeat(40) : validMergeGit(argv)
  }).some(({ id }) => id === "ASSURANCE_COMPLETED_IMPLEMENTATION_MERGE_TREE_MISMATCH"), true);
  assert.equal(verifyCompletedImplementationMergeIdentity({
    activeTaskBinding: complete,
    latestMergedImplementationPr: latestMergedFor(complete),
    remoteMain: "f".repeat(40),
    gitCommand: (argv) => argv[0] === "rev-parse" && argv[1] === `${complete.currentImplementationHead}^{tree}` ? "d".repeat(40) : validMergeGit(argv)
  }).some(({ id }) => id === "ASSURANCE_COMPLETED_IMPLEMENTATION_HEAD_TREE_MISMATCH"), true);
  assert.equal(verifyCompletedImplementationMergeIdentity({
    activeTaskBinding: complete,
    latestMergedImplementationPr: latestMergedFor(complete),
    remoteMain: "f".repeat(40),
    gitCommand: (argv) => argv.includes("--format=%s") ? "Merge pull request #999 from Chillywood2025/codex/substitution" : validMergeGit(argv)
  }).some(({ id }) => id === "ASSURANCE_COMPLETED_IMPLEMENTATION_MERGE_PR_BRANCH_MISMATCH"), true);
  assert.equal(verifyCompletedImplementationMergeIdentity({
    activeTaskBinding: complete,
    latestMergedImplementationPr: latestMergedFor(complete),
    remoteMain: "f".repeat(40),
    gitCommand: (argv) => argv[0] === "rev-list" ? `${"f".repeat(40)}\n${"a".repeat(40)}` : validMergeGit(argv)
  }).some(({ id }) => id === "ASSURANCE_COMPLETED_IMPLEMENTATION_MERGE_NOT_ON_PROTECTED_MAIN_FIRST_PARENT"), true);

  const applicabilitySubstitution = structuredClone(complete);
  const substitutedRegistry = structuredClone(registry);
  substitutedRegistry.features.find(({ featureId }) => featureId === complete.featureId).proofTierApplicability.T0_REQUIREMENT = "not-applicable";
  applicabilitySubstitution.proofTierApplicabilityHash = digest(stableJson(substitutedRegistry.features.find(({ featureId }) => featureId === complete.featureId).proofTierApplicability));
  applicabilitySubstitution.proofTierStatuses.T0_REQUIREMENT = "NOT_APPLICABLE";
  applicabilitySubstitution.proofTiersUnderEvaluation = applicabilitySubstitution.proofTiersUnderEvaluation.filter((tier) => tier !== "T0_REQUIREMENT");
  applicabilitySubstitution.requiredFreshnessClaims[0].requiredFacts = applicabilitySubstitution.requiredFreshnessClaims[0].requiredFacts
    .filter((factId) => factId !== "repository.assurance-control.a1.requirements");
  assert.equal(validateProofTierStatuses(applicabilitySubstitution, gateCatalog, substitutedRegistry).some(({ id }) => id === "ASSURANCE_PROOF_TIER_APPLICABILITY_HASH_MISMATCH"), true);

  for (const mutateCatalog of [
    (catalog) => { catalog.gates.find(({ id }) => id === "T4_NATIVE_PROVIDER").completionFreshnessClasses = ["REPOSITORY_SOURCE"]; },
    (catalog) => { catalog.applicabilityPolicies.REQUIRE_CLEAR = catalog.applicabilityPolicies.REQUIRE_CLEAR.filter((value) => value !== "provider-required"); },
    (catalog) => { catalog.completionFeatureApplicability["assurance-efficiency-e0"].T0_REQUIREMENT = "not-applicable"; },
    (catalog) => { catalog.completionFactAuthorities[0].platform = "IOS"; },
    (catalog) => { catalog.completionFactAuthorities[0].factId = "provider.supabase.b3.live-acl"; },
    (catalog) => { catalog.completionFactAuthorities[0].authorityAllowed = "PROVIDER_READBACK_ONLY"; },
    (catalog) => { catalog.completionFactAuthorities[0].provider = "SUPABASE"; }
  ]) {
    const substitutedCatalog = structuredClone(gateCatalog);
    mutateCatalog(substitutedCatalog);
    assert.equal(validateProofTierStatuses(complete, substitutedCatalog, registry).some(({ id }) => id === "ASSURANCE_GATE_CATALOG_MALFORMED"), true);
  }
});

test("Owner task authority binds the complete proof status and applicability subject", () => {
  const completed = {
    ...binding,
    featureId: e0Feature.featureId,
    phase: "COMPLETE",
    proofTierStatuses: completedProofTierStatuses,
    proofTierApplicabilityHash: digest(stableJson(e0Feature.proofTierApplicability)),
    proofTiersUnderEvaluation: ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION"],
    requiredFreshnessClaims: e0CompletionClaims()
  };
  const observation = authorizeOwnerBootstrap(completed);
  assert.equal(verifyOwnerBootstrapAuthorization(completed, observation), true);
  for (const mutate of [
    (candidate) => { candidate.proofTierStatuses.T1_SOURCE = "BLOCKED_INTERNAL"; },
    (candidate) => { candidate.proofTierApplicabilityHash = "f".repeat(64); }
  ]) {
    const substituted = structuredClone(completed);
    mutate(substituted);
    assert.equal(verifyOwnerBootstrapAuthorization(substituted, observation), false);
  }
});

test("canonical rendering exposes every recorded proof-tier status separately", () => {
  const rendered = renderCurrentState({
    ...canonicalTruth,
    activeTaskBinding: {
      ...canonicalTruth.activeTaskBinding,
      phase: "COMPLETE",
      proofTierStatuses: completedProofTierStatuses
    }
  });
  for (const [tier, status] of Object.entries(completedProofTierStatuses)) {
    assert.equal(rendered.includes(`\`${tier}\`=\`${status}\``), true, tier);
  }
  assert.equal(rendered.includes("METADATA_BOUNDARY_CLEAR"), false);
});

test("protected legacy correction authority is the finite lease and not a descendant head", () => {
  const correction = historicalPr214Truth.activeTaskBinding;
  assert.deepEqual(correction.requiredFreshnessClasses, ["REPOSITORY_TASK_LEASE"]);
  assert.equal(correction.immutableSourceHead, historicalPr214Truth.finiteTaskLeases.tasks.find(({ implementationPr }) => implementationPr === 214).admittedSeedHead);
  assert.equal(correction.currentImplementationHead, correction.immutableSourceHead);
  assert.equal(historicalPr214Truth.finiteTaskRuntime.candidateObservation.head, "f2525c0e6dd695c638533bc9c4544729a57280e6");
  assert.equal(historicalPr214Truth.finiteTaskRuntime.candidateObservation.classification, "NON_AUTHORITATIVE_READ_ONLY_OBSERVATION");
  assert.equal(historicalPr214Truth.finiteTaskRuntime.finalEvidence.ownerReceipt, false);
  assert.equal(historicalPr214Truth.d2aMicrophoneCorrectionBinding.mayProceed.d2aResume, false);
  assert.equal(historicalPr214Truth.d2aMicrophoneCorrectionBinding.mayProceed.buildOrOta, false);
  assert.equal(historicalPr214Truth.d2aMicrophoneCorrectionBinding.mayProceed.providerOrProductionMutation, false);
});

test("finite task lease committed evidence is exact and fails closed on lease substitution", () => {
  const claim = historicalPr214Truth.freshnessClaims.find(({ id }) => id === "repository-task-lease-d2a-legacy-webrtc-correction");
  const source = historicalPr214Truth.evidenceSources.find(({ id }) => id === claim.evidenceSourceId);
  const verify = (candidate) => verifyCommittedClaimEvidence({
    claim,
    source: candidate,
    factRegistry: currentTruthContract.freshness.factRegistry,
    gitCommand: (args) => {
      if (args[0] === "merge-base") return "";
      if (args[0] === "rev-parse") return source.subjectTree;
      if (args[0] === "show") return JSON.stringify(historicalPr214Truth);
      throw new Error("unexpected git command");
    }
  });
  assert.equal(verify(source), true);
  for (const [field, value] of [
    ["sourceCommit", "f".repeat(40)],
    ["subjectTree", "e".repeat(40)],
    ["leaseId", "unrelated-lease"],
    ["leaseHash", "f".repeat(64)]
  ]) {
    assert.equal(verify({ ...source, [field]: value }), false, field);
  }
});

test("historical exact final source primitive accepts only remote branch or own-PR merge second parent", () => {
  const source = canonicalTruth.evidenceSources.find(({ id }) => id === "d2a-legacy-webrtc-correction-final-source-e76831f2edb2");
  const expectedSources = [Object.fromEntries([
    "exactExternalSourcePolicy",
    "id",
    "sourceCommit",
    "subjectTree",
    "implementationPr",
    "implementationBranch",
    "protectedAdmissionPr",
    "ownerFinalTaskBindingCommentId"
  ].map((field) => [field, source[field]]))];
  const verify = (overrides = {}) => exactExternalSourceProvenance({
    source,
    expectedSources,
    remoteImplementationHead: null,
    headParents: ["a".repeat(40), source.sourceCommit],
    sourceTree: source.subjectTree,
    ...overrides
  });
  assert.equal(verify({ remoteImplementationHead: source.sourceCommit, headParents: [] }), true, "exact remote branch");
  assert.equal(verify(), true, "own-PR exact second parent");
  assert.equal(verify({ headParents: [source.sourceCommit, "a".repeat(40)] }), false, "source cannot be first parent");
  assert.equal(verify({ headParents: ["a".repeat(40), "b".repeat(40), source.sourceCommit] }), false, "octopus merge denied");
  assert.equal(verify({ headParents: ["a".repeat(40), "b".repeat(40)] }), false, "wrong second parent denied");
  assert.equal(verify({ sourceTree: "b".repeat(40) }), false, "wrong tree denied");
  assert.equal(verify({ source: { ...source, implementationPr: 999 } }), false, "tuple substitution denied");
});

test("protected correction admission and final-source synchronizations are exact", () => {
  for (const prNumber of [215, 216, 217]) {
    const successor = currentTruthContract.synchronizationMerge.bootstrapMerge.successors.find(({ prNumber: candidate }) => candidate === prNumber);
    const mergeSha = "b".repeat(40);
    const secondParent = "c".repeat(40);
    const exactSubject = `Merge pull request #${successor.prNumber} from Chillywood2025/${successor.branch}`;
    const verify = ({
      recordedMain = successor.firstParent,
      parents = [successor.firstParent, secondParent],
      changedPaths = successor.changedPaths,
      subject = exactSubject,
      ancestorAllowed = true
    } = {}) => verifyCurrentTruthSynchronization({
      recordedMain,
      remoteMain: mergeSha,
      parents,
      changedPaths,
      requiredChangedPaths: currentTruthContract.synchronizationMerge.requiredChangedPaths,
      allowedChangedPaths: currentTruthContract.synchronizationMerge.allowedChangedPaths,
      bootstrapMerge: currentTruthContract.synchronizationMerge.bootstrapMerge,
      gitCommand: (args) => {
        if (args[0] === "show") return subject;
        if (args[0] === "merge-base" && ancestorAllowed && args[2] === successor.requiredSecondParentAncestor && args[3] === secondParent) return "";
        throw new Error("denied");
      }
    });
    assert.equal(verify().ok, true, `PR #${prNumber}`);
    assert.equal(verify({ recordedMain: "d".repeat(40) }).ok, false);
    assert.equal(verify({ parents: [successor.firstParent, "d".repeat(40)] }).ok, false);
    assert.equal(verify({ changedPaths: successor.changedPaths.slice(1) }).ok, false);
    assert.equal(verify({ changedPaths: [...successor.changedPaths, "hooks/use-communication-room-session.ts"] }).ok, false);
    assert.equal(verify({ subject: exactSubject.replace(`#${prNumber}`, "#999") }).ok, false);
    assert.equal(verify({ ancestorAllowed: false }).ok, false);
  }
});

test("active-task CLI rejects caller-selected diff bases", () => {
  const cli = spawnSync(process.execPath, ["scripts/assurance/active-task.mjs", "--base=HEAD"], { encoding: "utf8" });
  assert.notEqual(cli.status, 0);
  const output = JSON.parse(cli.stdout);
  assert.equal(output.ok, false);
  assert.equal(JSON.stringify(output).includes("UNKNOWN_FLAG:--base"), true);
});

const finiteRegistry = historicalPr214Truth.finiteTaskLeases;
const pr214Lease = finiteTaskLeaseFor(finiteRegistry, {
  implementationPr: 214,
  implementationBranch: "codex/d2a-legacy-webrtc-first-track-renegotiation-correction",
  featureId: "chilly-chat-call-lifecycle"
});
const descendantHead = (generation) => generation.toString(16).padStart(40, "a").slice(-40);
const finiteCandidate = (lease, generation = 1, overrides = {}) => {
  const head = descendantHead(generation);
  return {
    pr: lease.implementationPr,
    branch: lease.implementationBranch,
    prState: "open",
    head,
    tree: descendantHead(generation + 1000),
    seedTree: lease.admittedSeedTree,
    seedIsAncestor: true,
    baseIsAncestor: true,
    changedPaths: [lease.allowedPaths[0]],
    changedLines: 10,
    diffHash: "1".repeat(64),
    changedPathHash: "2".repeat(64),
    finalReceiptHead: null,
    repositoryReviewHead: null,
    phase1Head: null,
    findings: { P0: 0, P1: 0, launchImpactingP2: 0 },
    ...overrides
  };
};
const finalEvidence = (candidate) => ({
  scopeResult: "PASS",
  callDomainClosureLedgerHash: "3".repeat(64),
  focusedTestHash: "4".repeat(64),
  mutationNegativeControlHash: "5".repeat(64),
  repositoryReviewHash: "6".repeat(64),
  phase1RunId: 12345,
  phase1Head: candidate.head
});
function exactFinalReceipt(lease, candidate) {
  const evidence = finalEvidence(candidate);
  const subject = finiteTaskFinalReceiptSubject({
    schemaVersion: 1,
    policyId: "ASSURANCE_FINITE_TASK_LEASE_V1",
    repository: "Chillywood2025/chillywood-mobile",
    featureId: lease.featureId,
    implementationPr: lease.implementationPr,
    implementationBranch: lease.implementationBranch,
    admittedSeedHead: lease.admittedSeedHead,
    finalHead: candidate.head,
    finalTree: candidate.tree,
    diffHash: candidate.diffHash,
    changedPathHash: candidate.changedPathHash,
    ...evidence
  });
  const body = finiteTaskFinalReceiptBody(subject);
  const receipt = { commentId: 9001, author: "Chillywood2025", authorAssociation: "OWNER", subjectHash: digest(stableJson(subject)), bodySha256: digest(body) };
  const observation = { commentId: 9001, author: "Chillywood2025", authorAssociation: "OWNER", createdAt: "2026-08-11T18:00:00Z", updatedAt: "2026-08-11T18:00:00Z", issueUrl: `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${lease.implementationPr}`, body };
  return { evidence, receipt, observation, subject };
}

test("finite closure 1: PR 214 advances one descendant without another admission", () => {
  const result = evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, 1) });
  assert.equal(result.ok, true);
  assert.equal(pr214Lease.protectedAdmissionPr, 215);
  assert.equal(pr214Lease.recursionBudget.maximumAdmissionPrs, 1);
});

test("finite closure 2: PR 214 advances ten descendants without another admission", () => {
  for (let generation = 1; generation <= 10; generation += 1) {
    assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, generation) }).ok, true);
  }
  assert.equal(pr214Lease.protectedAdmissionPr, 215);
});

test("finite closure 3: one hundred descendants can reach MERGED_VERIFIED", () => {
  let state = "BLOCKED_PRODUCT_FINDING";
  for (let generation = 1; generation <= 100; generation += 1) {
    assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, generation) }).ok, true);
    state = transitionFiniteTaskState(state, "SOURCE_PUSH").state;
  }
  state = transitionFiniteTaskState(state, "EVIDENCE_CLEAR").state;
  state = transitionFiniteTaskState(state, "MERGE_VERIFIED").state;
  assert.equal(state, "MERGED_VERIFIED");
});

test("finite closure 4: a P1 invalidates final evidence but retains the task lease", () => {
  const candidate = finiteCandidate(pr214Lease, 4, { findings: { P0: 0, P1: 1, launchImpactingP2: 0 } });
  Object.assign(candidate, { finalReceiptHead: candidate.head, repositoryReviewHead: candidate.head, phase1Head: candidate.head });
  const result = evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate });
  assert.equal(result.taskState, "BLOCKED_PRODUCT_FINDING");
  assert.equal(result.leaseRetained, true);
  assert.deepEqual(result.invalidated, { ownerFinalReceipt: true, repositoryReview: true, phase1: true, mergeEligibility: true });
});

test("finite closure 5: wrong PR fails", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, 5, { pr: 999 }) }).findings.includes("FINITE_TASK_WRONG_PR"), true);
});

test("finite closure 6: wrong branch fails", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, 6, { branch: "codex/substitute" }) }).findings.includes("FINITE_TASK_WRONG_BRANCH"), true);
});

test("finite closure 7: non-descendant head fails", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, 7, { seedIsAncestor: false }) }).findings.includes("FINITE_TASK_NON_DESCENDANT_HEAD"), true);
});

test("finite closure 8: rewritten admitted ancestry fails", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, 8, { seedTree: "f".repeat(40) }) }).findings.includes("FINITE_TASK_ADMITTED_ANCESTRY_REWRITTEN"), true);
});

test("finite closure 9: unauthorized path fails", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, 9, { changedPaths: ["package.json"] }) }).findings.includes("FINITE_TASK_UNAUTHORIZED_PATH"), true);
});

test("finite closure 10: scope overflow fails", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, 10, { changedLines: pr214Lease.scopeBudget.maximumChangedLines + 1 }) }).findings.includes("FINITE_TASK_SCOPE_OVERFLOW"), true);
});

test("finite closure 11: competing domain owner fails", () => {
  const competing = structuredClone(finiteRegistry);
  competing.tasks.find(({ implementationPr }) => implementationPr === 212).domainOwnership = "ACTIVE";
  competing.tasks.find(({ implementationPr }) => implementationPr === 212).taskState = "ACTIVE_IMPLEMENTATION";
  const lease = competing.tasks.find(({ implementationPr }) => implementationPr === 214);
  assert.equal(evaluateFiniteTaskCandidate({ lease, registry: competing, candidate: finiteCandidate(lease, 11) }).findings.includes("FINITE_TASK_COMPETING_DOMAIN_OWNER"), true);
});

test("finite closure 12: edited Owner receipt fails", () => {
  const candidate = finiteCandidate(pr214Lease, 12);
  const fixture = exactFinalReceipt(pr214Lease, candidate);
  fixture.observation.body += "\nedited";
  assert.equal(verifyFiniteTaskFinalReceipt({ lease: pr214Lease, candidate, ...fixture }).ok, false);
});

test("finite closure 13: stale Owner receipt fails", () => {
  const candidate = finiteCandidate(pr214Lease, 13);
  const fixture = exactFinalReceipt(pr214Lease, candidate);
  const advanced = finiteCandidate(pr214Lease, 14);
  const result = verifyFiniteTaskFinalReceipt({ lease: pr214Lease, candidate: advanced, ...fixture });
  assert.equal(result.ok, false);
  assert.equal(result.stale, true);
});

test("finite closure 14: exact final Owner receipt succeeds", () => {
  const candidate = finiteCandidate(pr214Lease, 14);
  const fixture = exactFinalReceipt(pr214Lease, candidate);
  assert.equal(verifyFiniteTaskFinalReceipt({ lease: pr214Lease, candidate, ...fixture }).ok, true);
});

test("finite closure 15: exact two-parent merge succeeds", () => {
  const candidate = finiteCandidate(pr214Lease, 15);
  const { subject } = exactFinalReceipt(pr214Lease, candidate);
  const base = "b".repeat(40);
  const mergeRef = { pr: 214, branch: pr214Lease.implementationBranch, parents: [base, candidate.head], sourceTree: candidate.tree, tree: "c".repeat(40) };
  assert.equal(verifyFiniteTaskMergeProvenance({ lease: pr214Lease, receiptSubject: subject, currentProtectedBase: base, mergeRef, actualMerge: { parents: [base, candidate.head], tree: mergeRef.tree } }).ok, true);
});

test("finite closure 16: wrong first parent fails", () => {
  const candidate = finiteCandidate(pr214Lease, 16);
  const { subject } = exactFinalReceipt(pr214Lease, candidate);
  const result = verifyFiniteTaskMergeProvenance({ lease: pr214Lease, receiptSubject: subject, currentProtectedBase: "b".repeat(40), mergeRef: { pr: 214, branch: pr214Lease.implementationBranch, parents: ["d".repeat(40), candidate.head], sourceTree: candidate.tree, tree: "c".repeat(40) } });
  assert.equal(result.findings.includes("FINITE_MERGE_WRONG_FIRST_PARENT"), true);
});

test("finite closure 17: wrong second parent fails", () => {
  const candidate = finiteCandidate(pr214Lease, 17);
  const { subject } = exactFinalReceipt(pr214Lease, candidate);
  const result = verifyFiniteTaskMergeProvenance({ lease: pr214Lease, receiptSubject: subject, currentProtectedBase: "b".repeat(40), mergeRef: { pr: 214, branch: pr214Lease.implementationBranch, parents: ["b".repeat(40), "d".repeat(40)], sourceTree: candidate.tree, tree: "c".repeat(40) } });
  assert.equal(result.findings.includes("FINITE_MERGE_WRONG_SECOND_PARENT"), true);
});

test("finite closure 18: wrong source tree fails", () => {
  const candidate = finiteCandidate(pr214Lease, 18);
  const { subject } = exactFinalReceipt(pr214Lease, candidate);
  const result = verifyFiniteTaskMergeProvenance({ lease: pr214Lease, receiptSubject: subject, currentProtectedBase: "b".repeat(40), mergeRef: { pr: 214, branch: pr214Lease.implementationBranch, parents: ["b".repeat(40), candidate.head], sourceTree: "d".repeat(40), tree: "c".repeat(40) } });
  assert.equal(result.findings.includes("FINITE_MERGE_WRONG_SOURCE_TREE"), true);
});

test("finite closure 19: octopus squash and rebase substitutions fail", () => {
  const candidate = finiteCandidate(pr214Lease, 19);
  const { subject } = exactFinalReceipt(pr214Lease, candidate);
  const base = "b".repeat(40);
  for (const parents of [[base], [base, "d".repeat(40)], [base, candidate.head, "e".repeat(40)]]) {
    assert.equal(verifyFiniteTaskMergeProvenance({ lease: pr214Lease, receiptSubject: subject, currentProtectedBase: base, mergeRef: { pr: 214, branch: pr214Lease.implementationBranch, parents, sourceTree: candidate.tree, tree: "c".repeat(40) } }).ok, false);
  }
});

test("finite closure 20: PR 214 reaches MERGED_VERIFIED without PR 218", () => {
  let state = transitionFiniteTaskState("BLOCKED_PRODUCT_FINDING", "SOURCE_PUSH").state;
  state = transitionFiniteTaskState(state, "EVIDENCE_CLEAR").state;
  state = transitionFiniteTaskState(state, "MERGE_VERIFIED").state;
  assert.equal(state, "MERGED_VERIFIED");
  assert.deepEqual(detectAssuranceRecursion({ lease: pr214Lease, requestedDependency: "FINAL_SOURCE_BINDING_PR", counts: { finalSourceBindingPrs: 0 } }), { ok: false, code: ASSURANCE_RECURSIVE_BOOTSTRAP_CYCLE });
});

test("finite closure 21: one post-merge truth transition reactivates PR 212", () => {
  const transitioned = structuredClone(finiteRegistry);
  Object.assign(transitioned.tasks.find(({ implementationPr }) => implementationPr === 214), { taskState: "MERGED_VERIFIED", domainOwnership: "PRESERVED_DEPENDENT" });
  Object.assign(transitioned.tasks.find(({ implementationPr }) => implementationPr === 212), { taskState: "ACTIVE_IMPLEMENTATION", domainOwnership: "ACTIVE" });
  const lease = transitioned.tasks.find(({ implementationPr }) => implementationPr === 212);
  assert.equal(evaluateFiniteTaskCandidate({ lease, registry: transitioned, candidate: finiteCandidate(lease, 21) }).ok, true);
});

test("finite closure 22: PR 212 advances without another admission", () => {
  const transitioned = structuredClone(finiteRegistry);
  Object.assign(transitioned.tasks.find(({ implementationPr }) => implementationPr === 214), { taskState: "MERGED_VERIFIED", domainOwnership: "PRESERVED_DEPENDENT" });
  Object.assign(transitioned.tasks.find(({ implementationPr }) => implementationPr === 212), { taskState: "ACTIVE_IMPLEMENTATION", domainOwnership: "ACTIVE" });
  const lease = transitioned.tasks.find(({ implementationPr }) => implementationPr === 212);
  assert.equal(evaluateFiniteTaskCandidate({ lease, registry: transitioned, candidate: finiteCandidate(lease, 22) }).ok, true);
  assert.equal(lease.protectedAdmissionPr, 213);
});

test("finite closure 23: recursive control dependency emits the terminal cycle code", () => {
  assert.deepEqual(detectAssuranceRecursion({ lease: pr214Lease, requestedDependency: "ADMISSION_PR", counts: { admissionPrs: 1 }, controlDependsOnControl: true }), { ok: false, code: "ASSURANCE_RECURSIVE_BOOTSTRAP_CYCLE" });
  assert.deepEqual(detectAssuranceRecursion({ lease: pr214Lease, requestedDependency: "ADMISSION_PR" }), { ok: false, code: "ASSURANCE_RECURSIVE_BOOTSTRAP_CYCLE" });
});

test("finite closure 24: provider Codex Review remains optional advisory", () => {
  assert.equal(validateFiniteTaskLeaseRegistry(finiteRegistry).length, 0);
  assert.equal(finiteRegistry.providerCodexReview, "OPTIONAL_ADVISORY");
  assert.equal(canonicalTruth.reviewPolicy.requiredStatusCheck, false);
});

test("finite closure 25: build provider database and public authority remain closed", () => {
  assert.deepEqual(finiteRegistry.authority, { build: false, provider: false, database: false, publicRelease: false });
});

const f252Head = "f2525c0e6dd695c638533bc9c4544729a57280e6";
const f252Tree = "7174d34d2a8552874a74e5094dc172a5b5bec756";
const e768Head = "e76831f2edb2c17e9b827587594573bfef7c6fef";
const e768Tree = "6a4d48c29e5e083e6e43e85dcbf93771b2ff99a3";
const protectedMain = "68d2f2b745425296fae2753e8a0cba9cc1137067";
const historicalSyntheticMergeHead = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
const historicalRuntimeGit = (args) => {
  if (args[0] === "show" && args[1] === "-s" && args[2] === "--format=%P" && args[3] === historicalSyntheticMergeHead) {
    return `${protectedMain} ${f252Head}`;
  }
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
};
const runtimeAtF252 = (now = new Date("2026-08-11T22:00:00Z")) => evaluateFiniteTaskLeaseRuntime({
  record: historicalPr214Truth,
  contract: currentTruthContract,
  now,
  currentProtectedBase: protectedMain,
  githubEvent: {
    number: 214,
    pull_request: {
      number: 214,
      state: "open",
      head: { ref: pr214Lease.implementationBranch, sha: f252Head },
      base: { sha: protectedMain }
    }
  },
  checkoutHead: historicalSyntheticMergeHead,
  gitCommand: historicalRuntimeGit
});
const pullRequestCandidate = (overrides = {}) => finiteCandidate(pr214Lease, 400, {
  head: f252Head,
  tree: f252Tree,
  observationSource: "GITHUB_PULL_REQUEST_EVENT",
  currentProtectedBase: protectedMain,
  eventBase: protectedMain,
  mergeRefParents: [protectedMain, f252Head],
  mergeRefSourceTree: f252Tree,
  ...overrides
});
const maintenancePaths = currentTruthContract.synchronizationMerge.terminalControlMaintenance.allowedChangedPaths;
const maintenanceSubject = (overrides = {}) => controlMaintenanceAuthorizationSubject({
  schemaVersion: 1,
  repository: "Chillywood2025/chillywood-mobile",
  pr: 300,
  branch: "codex/finite-task-lease-runtime-freshness-correction",
  startingMain: protectedMain,
  allowedChangedPaths: maintenancePaths,
  maximumFiles: maintenancePaths.length,
  maximumNetLines: 4500,
  objective: "Complete finite-task lease runtime provenance without another control dependency",
  prohibitedAuthorities: { product: false, native: false, database: false, provider: false, build: false, release: false, money: false, authRls: false, credentials: false },
  nestedControlDependency: false,
  secondMaintenancePrAllowed: false,
  ...overrides
});
const maintenanceObservation = (subject, overrides = {}) => ({
  id: 7001,
  commentId: 7001,
  author: "Chillywood2025",
  authorAssociation: "OWNER",
  createdAt: "2026-08-11T22:30:00Z",
  updatedAt: "2026-08-11T22:30:00Z",
  issueUrl: `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${subject.pr}`,
  body: controlMaintenanceAuthorizationCommentBody(subject),
  ...overrides
});
const amendmentSubject = (addedPaths = ["plugins/withChillyChatNativeCallNotifications.js"], overrides = {}) => taskLeaseAmendmentSubject({
  schemaVersion: 1,
  repository: "Chillywood2025/chillywood-mobile",
  leaseId: pr214Lease.leaseId,
  pr: pr214Lease.implementationPr,
  branch: pr214Lease.implementationBranch,
  currentCandidateHead: f252Head,
  currentLeaseHash: digest(stableJson(pr214Lease)),
  addedPaths,
  registeredDomain: pr214Lease.domain,
  reason: "Classify and correct the same-domain native Answer action path if executable evidence requires it",
  newScopeMaximum: { maximumFiles: 12, maximumChangedLines: 6000 },
  excludedAuthority: { product: false, native: false, database: false, provider: false, build: false, release: false, money: false, authRls: false, credentials: false },
  ...overrides
});
const amendmentObservation = (subject, overrides = {}) => ({
  id: 7002,
  commentId: 7002,
  author: "Chillywood2025",
  authorAssociation: "OWNER",
  createdAt: "2026-08-11T22:35:00Z",
  updatedAt: "2026-08-11T22:35:00Z",
  issueUrl: "https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/214",
  body: taskLeaseAmendmentCommentBody(subject),
  ...overrides
});

test("terminal control maintenance accepts one exact immutable Owner authorization", () => {
  const subject = maintenanceSubject();
  const result = verifyControlMaintenanceAuthorization({
    subject,
    observation: maintenanceObservation(subject),
    changedPaths: maintenancePaths,
    netLines: 679
  });
  assert.equal(result.ok, true, result.findings.join(","));
  assert.match(result.subjectHash, /^[0-9a-f]{64}$/u);
  assert.match(result.bodyHash, /^[0-9a-f]{64}$/u);
});

test("terminal control maintenance merge is accepted once with its embedded exact contract", () => {
  const secondParent = "c".repeat(40);
  const merge = "d".repeat(40);
  const result = verifyCurrentTruthSynchronization({
    recordedMain: protectedMain,
    remoteMain: merge,
    parents: [protectedMain, secondParent],
    changedPaths: maintenancePaths,
    requiredChangedPaths: currentTruthContract.synchronizationMerge.requiredChangedPaths,
    allowedChangedPaths: currentTruthContract.synchronizationMerge.allowedChangedPaths,
    bootstrapMerge: currentTruthContract.synchronizationMerge.bootstrapMerge,
    terminalControlMaintenance: currentTruthContract.synchronizationMerge.terminalControlMaintenance,
    gitCommand: (args) => args[0] === "show" && args[1] === "-s"
      ? "Merge pull request #300 from Chillywood2025/codex/finite-task-lease-runtime-freshness-correction"
      : JSON.stringify(currentTruthContract)
  });
  assert.equal(result.ok, true);
  assert.equal(result.mode, "terminal-control-maintenance-synchronization-merge");
});

test("finite runtime matrix 1: admitted PR 214 seed head passes", () => {
  const candidate = finiteCandidate(pr214Lease, 1, { head: pr214Lease.admittedSeedHead, tree: pr214Lease.admittedSeedTree });
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate }).ok, true);
});

test("finite runtime matrix 2: PR 214 e768 descendant passes", () => {
  const candidate = finiteCandidate(pr214Lease, 2, { head: e768Head, tree: e768Tree });
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate }).ok, true);
});

test("finite runtime matrix 3: PR 214 f252 dynamic descendant passes", () => {
  const runtime = runtimeAtF252();
  assert.deepEqual({ ok: runtime.candidateEligible, head: runtime.candidateHead, tree: runtime.candidateTree, scope: runtime.scopeResult }, { ok: true, head: f252Head, tree: f252Tree, scope: "PASS" });
});

test("finite runtime matrix 4: one descendant passes", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, 1) }).ok, true);
});

test("finite runtime matrix 5: ten descendants pass", () => {
  assert.equal(Array.from({ length: 10 }, (_, index) => evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, index + 1) }).ok).every(Boolean), true);
});

test("finite runtime matrix 6: one hundred descendants pass", () => {
  assert.equal(Array.from({ length: 100 }, (_, index) => evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, index + 1) }).ok).every(Boolean), true);
});

test("finite runtime matrix 7: no protected current-truth source-head update is required", () => {
  assert.equal(historicalPr214Truth.activeTaskBinding.currentImplementationHead, pr214Lease.admittedSeedHead);
  assert.equal(runtimeAtF252().candidateHead, f252Head);
  assert.notEqual(historicalPr214Truth.activeTaskBinding.currentImplementationHead, runtimeAtF252().candidateHead);
});

test("finite runtime matrix 8: old final evidence becomes stale after every source push", () => {
  for (let generation = 2; generation <= 4; generation += 1) {
    const prior = finiteCandidate(pr214Lease, generation - 1).head;
    const candidate = finiteCandidate(pr214Lease, generation, { finalReceiptHead: prior, repositoryReviewHead: prior, phase1Head: prior });
    assert.deepEqual(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate }).invalidated, { ownerFinalReceipt: true, repositoryReview: true, phase1: true, mergeEligibility: true });
  }
});

test("finite runtime matrix 9: lease authority remains valid after each source push", () => {
  assert.equal(runtimeAtF252().leaseAuthorityEligible, true);
  assert.equal(historicalPr214Truth.freshnessClaims.find(({ freshnessClass }) => freshnessClass === "REPOSITORY_TASK_LEASE").leaseHash, digest(stableJson(pr214Lease)));
});

test("finite runtime matrix 10: wrong PR fails", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, 10, { pr: 999 }) }).findings.includes("FINITE_TASK_WRONG_PR"), true);
});

test("finite runtime matrix 11: wrong branch fails", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, 11, { branch: "codex/unrelated" }) }).findings.includes("FINITE_TASK_WRONG_BRANCH"), true);
});

test("finite runtime matrix 12: non-descendant fails", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, 12, { seedIsAncestor: false }) }).findings.includes("FINITE_TASK_NON_DESCENDANT_HEAD"), true);
});

test("finite runtime matrix 13: rewritten admitted seed fails", () => {
  const candidate = finiteCandidate(pr214Lease, 13, { seedIsAncestor: false, seedTree: "f".repeat(40) });
  const findings = evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate }).findings;
  assert.equal(findings.includes("FINITE_TASK_NON_DESCENDANT_HEAD") && findings.includes("FINITE_TASK_ADMITTED_ANCESTRY_REWRITTEN"), true);
});

test("finite runtime matrix 14: wrong admitted seed tree fails", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, 14, { seedTree: "e".repeat(40) }) }).findings.includes("FINITE_TASK_ADMITTED_ANCESTRY_REWRITTEN"), true);
});

test("finite runtime matrix 15: unauthorized path fails", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, 15, { changedPaths: ["package.json"] }) }).findings.includes("FINITE_TASK_UNAUTHORIZED_PATH"), true);
});

test("finite runtime matrix 16: scope overflow fails", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, 16, { changedLines: pr214Lease.scopeBudget.maximumChangedLines + 1 }) }).findings.includes("FINITE_TASK_SCOPE_OVERFLOW"), true);
});

test("finite runtime matrix 17: competing active domain owner fails", () => {
  const competing = structuredClone(finiteRegistry);
  const other = competing.tasks.find(({ implementationPr }) => implementationPr === 212);
  Object.assign(other, { taskState: "ACTIVE_IMPLEMENTATION", domainOwnership: "ACTIVE" });
  const lease = competing.tasks.find(({ implementationPr }) => implementationPr === 214);
  assert.equal(evaluateFiniteTaskCandidate({ lease, registry: competing, candidate: finiteCandidate(lease, 17) }).findings.includes("FINITE_TASK_COMPETING_DOMAIN_OWNER"), true);
});

test("finite runtime matrix 18: closed PR fails", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: finiteCandidate(pr214Lease, 18, { prState: "closed" }) }).findings.includes("FINITE_TASK_PR_NOT_OPEN"), true);
});

test("finite runtime matrix 19: malformed merge ref fails", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: pullRequestCandidate({ mergeRefParents: [protectedMain] }) }).findings.includes("FINITE_TASK_MERGE_REF_MALFORMED"), true);
});

test("finite runtime matrix 20: wrong merge-ref first parent fails", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: pullRequestCandidate({ mergeRefParents: ["a".repeat(40), f252Head] }) }).findings.includes("FINITE_TASK_MERGE_REF_WRONG_FIRST_PARENT"), true);
});

test("finite runtime matrix 21: wrong merge-ref second parent fails", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: pullRequestCandidate({ mergeRefParents: [protectedMain, "a".repeat(40)] }) }).findings.includes("FINITE_TASK_MERGE_REF_WRONG_SECOND_PARENT"), true);
});

test("finite runtime matrix 22: wrong merge-ref source tree fails", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: pullRequestCandidate({ mergeRefSourceTree: "a".repeat(40) }) }).findings.includes("FINITE_TASK_MERGE_REF_WRONG_SOURCE_TREE"), true);
});

test("finite runtime matrix 23: octopus merge ref fails", () => {
  assert.equal(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: pullRequestCandidate({ mergeRefParents: [protectedMain, f252Head, "a".repeat(40)] }) }).findings.includes("FINITE_TASK_MERGE_REF_MALFORMED"), true);
});

test("finite runtime matrix 24: edited Owner maintenance comment fails", () => {
  const subject = maintenanceSubject();
  const observation = maintenanceObservation(subject, { body: `${controlMaintenanceAuthorizationCommentBody(subject)}\nedited` });
  assert.equal(verifyControlMaintenanceAuthorization({ subject, observation, changedPaths: maintenancePaths, netLines: 100 }).findings.includes("ASSURANCE_CONTROL_MAINTENANCE_COMMENT_INVALID"), true);
});

test("finite runtime matrix 25: unauthorized control-maintenance path fails", () => {
  const subject = maintenanceSubject({ allowedChangedPaths: [...maintenancePaths, "hooks/use-communication-room-session.ts"], maximumFiles: maintenancePaths.length + 1 });
  const observation = maintenanceObservation(subject);
  assert.equal(verifyControlMaintenanceAuthorization({ subject, observation, changedPaths: subject.allowedChangedPaths, netLines: 100 }).findings.includes("ASSURANCE_CONTROL_MAINTENANCE_SUBJECT_MALFORMED"), true);
});

test("finite runtime matrix 26: valid in-place same-domain amendment succeeds", () => {
  const subject = amendmentSubject();
  const result = verifyTaskLeaseAmendment({ registry: finiteRegistry, lease: pr214Lease, candidate: { head: f252Head }, subject, observation: amendmentObservation(subject) });
  assert.equal(result.ok, true, result.findings.join(","));
  assert.equal(result.amendedLease.allowedPaths.includes("plugins/withChillyChatNativeCallNotifications.js"), true);
});

test("finite runtime matrix 27: unrelated-domain amendment fails", () => {
  const subject = amendmentSubject(["package.json"]);
  assert.equal(verifyTaskLeaseAmendment({ registry: finiteRegistry, lease: pr214Lease, candidate: { head: f252Head }, subject, observation: amendmentObservation(subject) }).ok, false);
});

test("finite runtime matrix 28: source-only Cognitive contract passes for f252", () => {
  const result = runtimeAtF252();
  assert.equal(result.sourceOnlyEligible && result.candidateHead === f252Head, true);
});

test("finite runtime matrix 29: source-only Autonomous All-Platform contract passes for f252", () => {
  const result = runtimeAtF252();
  assert.equal(result.sourceOnlyEligible && result.scopeResult === "PASS", true);
});

test("finite runtime matrix 30: source-only Autonomous iOS contract passes for f252", () => {
  const result = runtimeAtF252();
  assert.equal(result.sourceOnlyEligible && result.candidateTree === f252Tree, true);
});

test("finite runtime matrix 31: provider-dependent work remains denied", () => {
  assert.equal(runtimeAtF252().providerDependentEligible, false);
});

test("unrelated repository-source expiry does not invalidate finite lease authority", () => {
  const runtime = runtimeAtF252(new Date("2026-08-12T05:00:00Z"));
  assert.equal(runtime.claimFreshness.ok, false, "the unrelated S0 claim is stale at this time");
  assert.equal(runtime.leaseAuthorityEligible, true);
  assert.equal(runtime.candidateEligible, true);
  assert.equal(runtime.sourceOnlyEligible, true);
  assert.equal(runtime.providerDependentEligible, false);
});

test("finite runtime matrix 32: no current-truth PR is required for descendant f252", () => {
  const runtime = runtimeAtF252();
  assert.equal(runtime.sourceOnlyEligible, true);
  assert.equal(historicalPr214Truth.finiteTaskLeases.tasks.find(({ implementationPr }) => implementationPr === 214).recursionBudget.maximumFinalSourceBindingPrs, 0);
});

test("finite runtime matrix 33: another requested binding PR emits recursive bootstrap cycle", () => {
  const subject = maintenanceSubject();
  const result = verifyControlMaintenanceAuthorization({ subject, observation: maintenanceObservation(subject), changedPaths: maintenancePaths, netLines: 100, requestedDependency: "SOURCE_BINDING_PR" });
  assert.equal(result.findings.includes(ASSURANCE_RECURSIVE_BOOTSTRAP_CYCLE), true);
});

test("finite runtime matrix 34: current-truth generation is deterministic three of three", () => {
  const renders = Array.from({ length: 3 }, () => stableJson({ current: renderCurrentState(canonicalTruth), next: renderNextTask(canonicalTruth), runtime: runtimeAtF252() }));
  assert.equal(new Set(renders).size, 1);
});

test("finite runtime matrix 35: all thirteen Phase 1 checks remain required", () => {
  assert.equal(canonicalTruth.reviewPolicy.requiredPhase1Checks, 13);
  assert.equal(currentTruthContract.reviewPolicy.requiredPhase1Checks, 13);
});

test("finite runtime matrix 36: provider Codex Review remains optional advisory", () => {
  assert.equal(canonicalTruth.reviewPolicy.classification, "OPTIONAL_ADVISORY");
  assert.equal(canonicalTruth.reviewPolicy.requiredStatusCheck, false);
  assert.equal(finiteRegistry.providerCodexReview, "OPTIONAL_ADVISORY");
});

const historicalCheckpoint = "40f57256500b05f083c71acc77c8b020609692cf";
const historicalCheckpointTree = "8b9e4082a96b7a83cfa86559c01ea955fb35717b";
const dependencyMain = "93d0bdc8604f32ff09ccb59986ee34015f2ca5cd";
const beforeDependencyCandidate = "28b1a7b9dd26e7e0a1cf2bb1bb07247fe721e7d9";
const afterDependencyCandidate = "eafd5697cc05b68e193d9e00c268b993ba5f376d";

function historicalRollingRecord() {
  const record = structuredClone(canonicalTruth);
  record.mainSha = historicalCheckpoint;
  record.protectedMainAuthority = {
    ...record.protectedMainAuthority,
    checkpointSha: historicalCheckpoint,
    checkpointTree: historicalCheckpointTree
  };
  return record;
}

function syntheticRollingEvaluation(count, {
  changedPath = "docs/unrelated.md",
  changedPaths,
  subject,
  candidateCurrent = true,
  authorityUpdateBound,
  parentCount = 2,
  breakFirstParent = false,
  providerDependentEligible = false,
  finalEvidence = false
} = {}) {
  const record = structuredClone(canonicalTruth);
  record.finiteTaskRuntime.finalEvidence = { ownerReceipt: finalEvidence, repositoryReview: finalEvidence, phase1: finalEvidence, mergeEligible: finalEvidence };
  const checkpoint = record.protectedMainAuthority.checkpointSha;
  let prior = checkpoint;
  const observations = Array.from({ length: count }, (_, index) => {
    const commit = digest(`rolling-main-${count}-${index}`).slice(0, 40);
    const secondParent = digest(`rolling-side-${count}-${index}`).slice(0, 40);
    const parents = [breakFirstParent && index === count - 1 ? "f".repeat(40) : prior, secondParent];
    if (parentCount === 3 && index === count - 1) parents.push("e".repeat(40));
    const observation = {
      commit,
      parents,
      tree: digest(`rolling-tree-${count}-${index}`).slice(0, 40),
      subject: subject ?? `Merge pull request #${300 + index} from Chillywood2025/codex/rolling-fixture-${index}`,
      changedPaths: changedPaths ?? [changedPath]
    };
    if (authorityUpdateBound !== undefined) observation.authorityUpdateBound = authorityUpdateBound;
    prior = commit;
    return observation;
  });
  const observed = observations.at(-1)?.commit ?? checkpoint;
  return evaluateProtectedMainAdvancement({
    record,
    contract: currentTruthContract,
    observedProtectedMainSha: observed,
    candidateHead: "d".repeat(40),
    finiteTaskRuntime: { sourceOnlyEligible: true, providerDependentEligible },
    advancementObservations: observations,
    checkpointTreeObservation: record.protectedMainAuthority.checkpointTree,
    checkpointIsAncestor: true,
    candidateContainsObservedMain: candidateCurrent,
    gitCommand: (argv) => argv[0] === "rev-parse" ? digest(argv.join(":" )).slice(0, 40) : ""
  });
}

test("rolling main matrix 1: exact historical checkpoint is eligible", () => {
  const result = evaluateProtectedMainAdvancement({
    record: historicalRollingRecord(),
    contract: currentTruthContract,
    observedProtectedMainSha: historicalCheckpoint,
    candidateHead: beforeDependencyCandidate,
    finiteTaskRuntime: { sourceOnlyEligible: true, providerDependentEligible: false }
  });
  assert.equal(result.mainRelation, "EXACT_CHECKPOINT");
  assert.equal(result.authorityCheckpointEligible, true, result.findings.join(","));
});

test("rolling main matrix 2: real PR 220 advancement invalidates D2A inputs without invalidating authority", () => {
  const result = evaluateProtectedMainAdvancement({
    record: historicalRollingRecord(),
    contract: currentTruthContract,
    observedProtectedMainSha: dependencyMain,
    candidateHead: afterDependencyCandidate,
    finiteTaskRuntime: { sourceOnlyEligible: true, providerDependentEligible: false }
  });
  const dependency = result.advancementClassifications.find(({ mergeSha }) => mergeSha === dependencyMain);
  assert.equal(result.authorityCheckpointEligible, true, result.findings.join(","));
  assert.equal(dependency.classifications.includes("ACTIVE_TASK_AUTHORITATIVE_INPUT"), true);
  assert.deepEqual(result.activeTaskInputsInvalidated.filter((file) => file.startsWith("package")), ["package-lock.json", "package.json"]);
  assert.equal(result.evidenceInvalidation.affectedEvidenceClasses.includes("GENERATED_NATIVE"), true);
});

test("rolling main matrix 3: candidate before dependency base sync receives usable BASE_SYNC_REQUIRED packet state", () => {
  const result = evaluateProtectedMainAdvancement({
    record: historicalRollingRecord(),
    contract: currentTruthContract,
    observedProtectedMainSha: dependencyMain,
    candidateHead: beforeDependencyCandidate,
    finiteTaskRuntime: { sourceOnlyEligible: true, providerDependentEligible: false }
  });
  assert.equal(result.candidateBaseStatus, "BASE_SYNC_REQUIRED");
  assert.equal(result.sourceOnlyEligible, true);
  assert.equal(result.mergeEligible, false);
  assert.equal(result.nextRequiredAction, "MERGE_CURRENT_PROTECTED_MAIN_NORMALLY");
});

test("rolling main matrix 4: candidate after dependency base sync proceeds without truth PR", () => {
  const result = evaluateProtectedMainAdvancement({
    record: historicalRollingRecord(),
    contract: currentTruthContract,
    observedProtectedMainSha: dependencyMain,
    candidateHead: afterDependencyCandidate,
    finiteTaskRuntime: { sourceOnlyEligible: true, providerDependentEligible: false }
  });
  assert.equal(result.candidateBaseStatus, "CURRENT_WITH_PROTECTED_MAIN");
  assert.equal(result.sourceOnlyEligible, true);
  assert.equal(result.providerDependentEligible, false);
});

test("rolling main matrix 5: one unrelated protected merge passes", () => {
  const result = syntheticRollingEvaluation(1);
  assert.equal(result.findings.length, 0);
  assert.equal(result.advancementClassifications[0].classifications.includes("UNRELATED_PROTECTED_ADVANCEMENT"), true);
});

test("rolling main matrix 6: one active-input merge passes with affected-layer invalidation", () => {
  const result = syntheticRollingEvaluation(1, { changedPath: "package-lock.json" });
  assert.equal(result.authorityCheckpointEligible, true);
  assert.equal(result.evidenceInvalidation.requiredReruns.includes("GRADLE_SIX_TASKS"), true);
});

test("rolling main matrix 7: ten valid protected merges pass", () => {
  assert.equal(syntheticRollingEvaluation(10).findings.length, 0);
});

test("rolling main matrix 8: one hundred valid protected merges pass", () => {
  const result = syntheticRollingEvaluation(100);
  assert.equal(result.protectedAdvancementCount, 100);
  assert.equal(result.findings.length, 0);
});

test("rolling main matrix 9: no truth PR is required for ordinary advancement", () => {
  assert.equal(syntheticRollingEvaluation(100).nextRequiredAction, "CONTINUE_ACTIVE_TASK");
  assert.equal(currentTruthContract.rollingProtectedMain.recursiveFailureCode, ASSURANCE_RECURSIVE_BOOTSTRAP_CYCLE);
});

test("rolling main matrix 10: behind candidate remains source eligible but not merge eligible", () => {
  const result = syntheticRollingEvaluation(1, { candidateCurrent: false, finalEvidence: true });
  assert.equal(result.candidateBaseStatus, "BASE_SYNC_REQUIRED");
  assert.equal(result.sourceOnlyEligible, true);
  assert.equal(result.mergeEligible, false);
});

test("rolling main matrix 11: exact final merge requires current protected base", () => {
  assert.equal(syntheticRollingEvaluation(1, { candidateCurrent: true, finalEvidence: true }).mergeEligible, true);
  assert.equal(syntheticRollingEvaluation(1, { candidateCurrent: false, finalEvidence: true }).mergeEligible, false);
});

test("rolling main matrix 12: unbound authority-control mutation fails closed", () => {
  const result = syntheticRollingEvaluation(1, { changedPath: "scripts/assurance/lib.mjs", authorityUpdateBound: false });
  assert.equal(result.findings.includes("CURRENT_TRUTH_AUTHORITY_CONTROL_DRIFT"), true);
});

test("rolling main matrix 13: non-ancestor checkpoint fails closed", () => {
  const record = structuredClone(canonicalTruth);
  const result = evaluateProtectedMainAdvancement({
    record,
    contract: currentTruthContract,
    observedProtectedMainSha: "a".repeat(40),
    candidateHead: "b".repeat(40),
    finiteTaskRuntime: { sourceOnlyEligible: true, providerDependentEligible: false },
    checkpointTreeObservation: record.protectedMainAuthority.checkpointTree,
    checkpointIsAncestor: false,
    candidateContainsObservedMain: false,
    gitCommand: () => "c".repeat(40)
  });
  assert.equal(result.findings.includes("CURRENT_TRUTH_PROTECTED_MAIN_CHECKPOINT_NOT_ANCESTOR"), true);
});

test("rolling main matrix 14: octopus advancement fails", () => {
  assert.equal(syntheticRollingEvaluation(1, { parentCount: 3 }).findings.includes("CURRENT_TRUTH_PROTECTED_MAIN_CHAIN_INVALID"), true);
});

test("rolling main matrix 15: broken first-parent chain fails", () => {
  assert.equal(syntheticRollingEvaluation(2, { breakFirstParent: true }).findings.includes("CURRENT_TRUTH_PROTECTED_MAIN_CHAIN_INVALID"), true);
});

test("rolling main matrix 16: stale task-input evidence fails only affected layers", () => {
  const result = syntheticRollingEvaluation(1, { changedPath: "package.json" });
  assert.equal(result.evidenceInvalidation.affectedEvidenceClasses.includes("DEPENDENCY_IDENTITY"), true);
  assert.equal(result.evidenceInvalidation.affectedEvidenceClasses.includes("CALL_DOMAIN"), false);
});

test("rolling main matrix 17: unrelated evidence remains reusable", () => {
  const result = syntheticRollingEvaluation(1);
  assert.equal(result.evidenceInvalidation.affectedEvidenceClasses.length, 0);
  assert.equal(result.evidenceInvalidation.reusableEvidence.includes("LOCAL_EMULATOR_LIFECYCLE"), true);
});

test("rolling main matrix 18: document deadline does not block source-only finite lease", () => {
  const finite = evaluateFiniteTaskLeaseRuntime({ record: canonicalTruth, contract: currentTruthContract, now: new Date("2030-01-01T00:00:00Z"), currentProtectedBase: dependencyMain });
  const rolling = syntheticRollingEvaluation(0);
  assert.equal(finite.leaseAuthorityEligible, true);
  assert.equal(rolling.sourceOnlyEligible, true);
});

test("rolling main matrix 19: stale provider evidence independently blocks provider work", () => {
  assert.equal(syntheticRollingEvaluation(0, { providerDependentEligible: false }).providerDependentEligible, false);
});

test("rolling main matrix 20: proof-tier promotion requires canonical synchronization", () => {
  assert.equal(canonicalTruth.protectedMainAuthority.terminalSynchronizationRequiredFor.includes("proof-tier-promotion"), true);
});

test("rolling main matrix 21: active-task identity and terminal state require canonical synchronization", () => {
  assert.equal(canonicalTruth.protectedMainAuthority.terminalSynchronizationRequiredFor.includes("active-task-identity-change"), true);
  assert.equal(canonicalTruth.protectedMainAuthority.terminalSynchronizationRequiredFor.includes("task-terminal-state"), true);
});

test("rolling main matrix 22: architecture synthetic merge is accepted without post-merge truth", () => {
  const result = syntheticRollingEvaluation(1, { changedPaths: ["scripts/assurance/lib.mjs", "config/assurance/current-truth-v1.json"], authorityUpdateBound: true, candidateCurrent: false });
  assert.equal(result.authorityCheckpointEligible, true, result.findings.join(","));
  assert.equal(result.candidateBaseStatus, "BASE_SYNC_REQUIRED");
});

test("rolling main matrix 23: requested truth-only dependency emits recursion cycle", () => {
  assert.equal(currentTruthContract.rollingProtectedMain.recursiveFailureCode, "ASSURANCE_RECURSIVE_BOOTSTRAP_CYCLE");
  assert.equal(detectAssuranceRecursion({ requestedDependency: "CURRENT_TRUTH_BINDING_PR" }).code, ASSURANCE_RECURSIVE_BOOTSTRAP_CYCLE);
});

test("rolling main matrix 24: current-truth rendering is deterministic three of three", () => {
  const rendered = Array.from({ length: 3 }, () => stableJson({ current: renderCurrentState(canonicalTruth), next: renderNextTask(canonicalTruth) }));
  assert.equal(new Set(rendered).size, 1);
});

test("rolling main matrix 25: protected checks and advisory provider review remain unchanged", () => {
  assert.equal(canonicalTruth.reviewPolicy.requiredPhase1Checks, 13);
  assert.equal(canonicalTruth.reviewPolicy.classification, "OPTIONAL_ADVISORY");
  assert.equal(canonicalTruth.reviewPolicy.requiredStatusCheck, false);
});

test("rolling main matrix 26: actual PR 221 title-suffix merge subject is accepted", () => {
  const historicalRecord = structuredClone(canonicalTruth);
  historicalRecord.mainSha = "93d0bdc8604f32ff09ccb59986ee34015f2ca5cd";
  historicalRecord.protectedMainAuthority.checkpointSha = "93d0bdc8604f32ff09ccb59986ee34015f2ca5cd";
  historicalRecord.protectedMainAuthority.checkpointTree = "18c61a3d94de63e3d57cc777a34247c31f7263af";
  const result = evaluateProtectedMainAdvancement({
    record: historicalRecord,
    contract: currentTruthContract,
    observedProtectedMainSha: "d3871b008ddb16898c114037c26605bf35b433f9",
    candidateHead: afterDependencyCandidate,
    finiteTaskRuntime: { sourceOnlyEligible: true, providerDependentEligible: false }
  });
  const architectureMerge = result.advancementClassifications.find(({ mergeSha }) => mergeSha === "d3871b008ddb16898c114037c26605bf35b433f9");
  assert.equal(result.findings.length, 0, result.findings.join(","));
  assert.equal(architectureMerge.subject, "Allow canonical truth to follow protected-main advancement (#221)");
  assert.equal(architectureMerge.pullRequestNumber, 221);
  assert.equal(architectureMerge.mergeSubjectFormat, "GITHUB_TITLE_WITH_PR_SUFFIX");
});

test("rolling main matrix 27: classic GitHub merge subject remains accepted", () => {
  const result = syntheticRollingEvaluation(1);
  assert.equal(result.findings.length, 0, result.findings.join(","));
  assert.equal(result.advancementClassifications[0].pullRequestNumber, 300);
  assert.equal(result.advancementClassifications[0].mergeSubjectFormat, "GITHUB_CLASSIC_MERGE_PULL_REQUEST");
});

test("rolling main matrix 28: malformed or unregistered merge subjects fail closed", () => {
  for (const subject of ["direct push", "Title (#0)", "Title #221", " (#221)", "Title (#221) trailing"]) {
    const result = syntheticRollingEvaluation(1, { subject });
    assert.equal(result.findings.includes("CURRENT_TRUTH_PROTECTED_MAIN_CHAIN_INVALID"), true, subject);
  }
});

const recoveryPaths = [...TYPED_CONTEXT_ARCHITECTURE_PATHS].sort();
const recoveryContract = JSON.parse(fs.readFileSync(["config", "assurance", "pr-scope-policy-v1.json"].join("/"), "utf8")).ownerArchitectureMaintenance.pendingTerminalTruthTransition;
const recoveryMerge = digest("typed-context-recovery-merge").slice(0, 40);
const recoverySource = digest("typed-context-recovery-source").slice(0, 40);
const recoveryTree = digest("typed-context-recovery-tree").slice(0, 40);

function pendingTransitionEvaluation({ recovery = false, terminal = false, repair = false, mutateHistorical, mutateRecovery, mutateTerminal, append = [] } = {}) {
  const record = structuredClone(canonicalTruth);
  record.mainSha = HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.firstParent;
  record.protectedMainAuthority.checkpointSha = record.mainSha;
  record.protectedMainAuthority.checkpointTree = "64c3f8d56d93b08e5c3d3abbed11e707be1ede2b";
  const pendingTransitionPolicy = {
    state: structuredClone(PENDING_TERMINAL_TRUTH_TRANSITION_V1),
    historical: structuredClone(HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1),
    chain: structuredClone(PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1)
  };
  mutateHistorical?.(pendingTransitionPolicy.historical);
  const observations = [{
    commit: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.mergeSha,
    parents: [HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.firstParent, HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.sourceHead],
    tree: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.sourceTree,
    subject: "Merge pull request #226 from Chillywood2025/codex/whole-app-engineering-doctrine-v1",
    changedPaths: ["scripts/assurance/lib.mjs"]
  }];
  if (recovery) {
    const value = {
      commit: recoveryMerge,
      parents: [observations.at(-1).commit, recoverySource],
      tree: recoveryTree,
      sourceTree: recoveryTree,
      subject: "Derive terminal truth scope from protected predecessor authority (#227)",
      changedPaths: [...recoveryPaths],
      pendingMaintenanceContract: structuredClone(recoveryContract)
    };
    mutateRecovery?.(value);
    observations.push(value);
  }
  if (terminal || repair) {
    const value = {
      commit: digest("terminal-successor-merge").slice(0, 40),
      parents: [observations.at(-1).commit, digest("terminal-successor-source").slice(0, 40)],
      tree: digest("terminal-successor-tree").slice(0, 40),
      subject: repair ? "Activate whole-app engineering doctrine (#228)" : "Activate whole-app engineering doctrine (#902)",
      changedPaths: repair ? [...TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS] : ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"],
      terminalSuccessor: true,
      terminalRepair: repair
    };
    mutateTerminal?.(value);
    observations.push(value);
  }
  observations.push(...append);
  const observed = observations.at(-1).commit;
  return evaluateProtectedMainAdvancement({
    record,
    contract: currentTruthContract,
    observedProtectedMainSha: observed,
    candidateHead: "d".repeat(40),
    finiteTaskRuntime: { sourceOnlyEligible: true, providerDependentEligible: true },
    advancementObservations: observations,
    pendingTransitionPolicy,
    checkpointTreeObservation: record.protectedMainAuthority.checkpointTree,
    checkpointIsAncestor: true,
    candidateContainsObservedMain: true,
    gitCommand: (argv) => {
      if (argv[0] === "rev-parse") return recoveryTree;
      if (argv[0] === "show" && String(argv[1]).endsWith(`:${["config", "assurance", "pr-scope-policy-v1.json"].join("/")}`)) {
        const source = String(argv[1]).split(":", 1)[0];
        const matching = observations.find(({ parents }) => parents?.[1] === source);
        return matching?.pendingMaintenanceContract ? JSON.stringify({ ownerArchitectureMaintenance: { pendingTerminalTruthTransition: matching.pendingMaintenanceContract } }) : "";
      }
      if (argv[0] === "show" && String(argv[1]).endsWith(":config/assurance/current-truth-v1.json")) {
        const commit = String(argv[1]).split(":", 1)[0];
        const matching = observations.find(({ commit: candidate }) => candidate === commit);
        if (!matching?.terminalSuccessor) return "";
        const transitionMerges = observations.slice(0, observations.indexOf(matching)).filter(({ commit: candidate }) => candidate === HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.mergeSha || candidate === recoveryMerge);
        return JSON.stringify({
          protectedMainAuthority: { schemaVersion: 1, policyId: "ROLLING_PROTECTED_MAIN_AUTHORITY_V1", allowProtectedAdvancement: true, checkpointSha: record.mainSha, checkpointTree: record.protectedMainAuthority.checkpointTree },
          engineeringDoctrine: { status: "ACTIVE", nextPermittedAction: matching.terminalExpectedNextTask ?? "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE" },
          taskContextArchitecture: {
            pendingTransitionPolicyId: "PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1",
            pendingTransitionCountAfterSynchronization: 0,
            terminalTransitionConsumed: true,
            pendingTransitions: transitionMerges.map(({ commit: mergeSha }, index) => ({ ...(matching.terminalRepair ? { pr: index === 0 ? 226 : 227 } : {}), mergeSha, status: "CONSUMED_BY_THIS_TERMINAL_TRUTH" })),
            ...(matching.terminalRepair ? { terminalVerifierRepair: {
              classification: "CANONICAL_PREDECESSOR_RECEIPT_SELECTION_REPAIR_V1",
              historicalTerminalReceipt: 5280368893,
              rejectedPredecessorReceipt: 5277679438,
              canonicalPredecessorReceipt: 5280109323,
              rawPredecessorDiffHash: "ea1b96e5c6515b05b7499ff7a528c0440a409e064d65fe0a7e65d44ec64b619b",
              canonicalPredecessorDiffHash: "ce2b3dd4004f7fb8a8a2af4e1a6d83a6c2e17453f714b1eb9ff26a62588490ea",
              singleUse: true,
              authority: { product: false, nativeProduct: false, database: false, providerMutation: false, build: false, submission: false, ota: false, publicRelease: false }
            } } : {}),
            authority: matching.terminalAuthority ?? { providerMutation: false, build: false, submission: false, ota: false, publicRelease: false }
          }
        });
      }
      return "";
    }
  });
}

test("pending transition 1: exact historical PR 226 is pending without authority drift or chain invalid", () => {
  const result = pendingTransitionEvaluation();
  assert.equal(result.pendingTransitionCount, 1);
  assert.equal(result.pendingTransitions[0].transitionId, "HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1");
  assert.equal(result.findings.includes("CURRENT_TRUTH_AUTHORITY_CONTROL_DRIFT"), false);
  assert.equal(result.findings.includes("CURRENT_TRUTH_PROTECTED_MAIN_CHAIN_INVALID"), false);
});
test("pending transitions 2-10: every historical identity and closed-authority mutation fails", () => {
  const mutations = [
    (v) => { v.sourceHead = "1".repeat(40); }, (v) => { v.sourceTree = "1".repeat(40); },
    (v) => { v.mergeSha = "1".repeat(40); }, (v) => { v.firstParent = "1".repeat(40); },
    (v) => { v.ownerCommentIds = [5274614505]; }, (v) => { v.repositoryReviewCommentId += 1; },
    (v) => { v.phase1RunId += 1; }, (v) => { v.authority.build = true; }, (v) => { v.pullRequest = 999; }
  ];
  for (const mutateHistorical of mutations) assert.ok(pendingTransitionEvaluation({ mutateHistorical }).findings.length > 0);
});
test("pending transition 11: exact PR 227 recovery forms the sole two-transition bootstrap chain", () => {
  const result = pendingTransitionEvaluation({ recovery: true });
  assert.equal(result.pendingTransitionCount, 2, result.findings.join(","));
  assert.equal(result.findings.length, 0);
});
test("pending transitions 12-15: recovery requires exact Owner contract, objective, eight paths, and no product path", () => {
  const mutations = [
    (v) => { v.pendingMaintenanceContract.authoritySource = "LOCAL"; },
    (v) => { v.pendingMaintenanceContract.objective = "wrong"; },
    (v) => { v.changedPaths.push("README.md"); },
    (v) => { v.changedPaths = [...v.changedPaths.slice(0, -1), "app/index.tsx"]; }
  ];
  for (const mutateRecovery of mutations) assert.ok(pendingTransitionEvaluation({ recovery: true, mutateRecovery }).findings.length > 0);
});
test("pending transitions 16-17: a second recovery or third pending transition overflows", () => {
  const third = {
    commit: digest("third-recovery").slice(0, 40), parents: [recoveryMerge, digest("third-source").slice(0, 40)], tree: digest("third-tree").slice(0, 40), sourceTree: digest("third-tree").slice(0, 40),
    subject: "Third recovery (#903)", changedPaths: [...recoveryPaths], pendingMaintenanceContract: structuredClone(recoveryContract)
  };
  const result = pendingTransitionEvaluation({ recovery: true, append: [third] });
  assert.ok(result.findings.includes("CURRENT_TRUTH_PENDING_TRANSITION_CHAIN_OVERFLOW"));
});
test("pending transition 18: exact three-file successor consumes PR 226 and PR 227 together", () => {
  const result = pendingTransitionEvaluation({ recovery: true, terminal: true });
  assert.equal(result.pendingTransitionCount, 0, result.findings.join(","));
  assert.equal(result.pendingTransitionConsumptionCount, 1);
  assert.equal(result.findings.length, 0);
});
test("combined terminal verifier repair consumes both pending transitions without creating a third", () => {
  const result = pendingTransitionEvaluation({ recovery: true, repair: true });
  assert.equal(result.pendingTransitionCount, 0, result.findings.join(","));
  assert.equal(result.pendingTransitionConsumptionCount, 1);
  assert.equal(result.findings.length, 0);
  assert.equal(result.advancementClassifications.at(-1).terminalVerifierRepair, true);
  assert.equal(result.providerDependentEligible, false);
  assert.equal(result.buildEligible, false);
  assert.equal(result.submissionEligible, false);
  assert.equal(result.otaEligible, false);
  assert.equal(result.publicReleaseEligible, false);
});
test("combined terminal verifier repair is exact, single-use, and authority-closed", () => {
  const mutations = [
    (value) => { value.changedPaths.push("README.md"); },
    (value) => { value.changedPaths = [...value.changedPaths.slice(0, -1), "app/index.tsx"]; },
    (value) => { value.subject = "Activate whole-app engineering doctrine (#229)"; },
    (value) => { value.terminalAuthority = { build: true }; },
  ];
  for (const mutateTerminal of mutations) assert.ok(pendingTransitionEvaluation({ recovery: true, repair: true, mutateTerminal }).findings.length > 0);
  const duplicate = { commit: digest("duplicate-repair").slice(0, 40), parents: [digest("terminal-successor-merge").slice(0, 40), digest("duplicate-repair-source").slice(0, 40)], tree: digest("duplicate-repair-tree").slice(0, 40), subject: "Activate whole-app engineering doctrine (#228)", changedPaths: [...TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS], terminalSuccessor: true, terminalRepair: true };
  const duplicateResult = pendingTransitionEvaluation({ recovery: true, repair: true, append: [duplicate] });
  assert.ok(duplicateResult.findings.length > 0, stableJson(duplicateResult));
  assert.equal(new Set(Array.from({ length: 3 }, () => stableJson(pendingTransitionEvaluation({ recovery: true, repair: true })))).size, 1);
});
test("pending transitions 19-23: successor rejects fourth path, wrong predecessor/next task, build, and provider authority", () => {
  const mutations = [
    (v) => { v.changedPaths.push("README.md"); },
    (v) => { v.parents[0] = "1".repeat(40); },
    (v) => { v.terminalExpectedNextTask = "WRONG"; },
    (v) => { v.terminalAuthority = { build: true }; },
    (v) => { v.terminalAuthority = { providerMutation: true }; }
  ];
  for (const mutateTerminal of mutations) assert.ok(pendingTransitionEvaluation({ recovery: true, terminal: true, mutateTerminal }).findings.length > 0);
});
test("pending transitions 24-25: duplicate or post-consumption successor fails", () => {
  const duplicate = { commit: digest("duplicate-terminal").slice(0, 40), parents: [digest("terminal-successor-merge").slice(0, 40), digest("duplicate-source").slice(0, 40)], tree: digest("duplicate-tree").slice(0, 40), subject: "Duplicate truth (#904)", changedPaths: ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"], terminalSuccessor: true };
  assert.ok(pendingTransitionEvaluation({ recovery: true, terminal: true, append: [duplicate] }).findings.includes("CURRENT_TRUTH_PENDING_TRANSITION_ORDER_INVALID"));
});
test("pending transitions 26-34: shared result is fail-closed, source-only, authority-closed, and deterministic", () => {
  const pending = pendingTransitionEvaluation();
  assert.equal(pending.authorityCheckpointEligible, true);
  assert.equal(pending.authorityControlEligible, true);
  assert.equal(pending.sourceOnlyEligible, true);
  assert.equal(pending.providerDependentEligible, false);
  assert.equal(pending.buildEligible, false);
  assert.equal(pending.submissionEligible, false);
  assert.equal(pending.otaEligible, false);
  assert.equal(pending.publicReleaseEligible, false);
  assert.equal(new Set(Array.from({ length: 3 }, () => stableJson(pendingTransitionEvaluation({ recovery: true, terminal: true })))).size, 1);
  const product = { commit: digest("product-after-pending").slice(0, 40), parents: [HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.mergeSha, digest("product-source").slice(0, 40)], tree: digest("product-tree").slice(0, 40), subject: "Product work (#905)", changedPaths: ["app/index.tsx"] };
  const blockedProduct = pendingTransitionEvaluation({ append: [product] });
  assert.ok(blockedProduct.findings.includes("CURRENT_TRUTH_PENDING_TERMINAL_SUCCESSOR_REQUIRED"));
  assert.equal(blockedProduct.sourceOnlyEligible, false);
});
test("pending transitions 35-37: consumption is deterministic and protected/advisory policy is unchanged", () => {
  const outputs = Array.from({ length: 3 }, () => stableJson(pendingTransitionEvaluation({ recovery: true, terminal: true })));
  assert.equal(new Set(outputs).size, 1);
  assert.equal(canonicalTruth.reviewPolicy.requiredPhase1Checks, 13);
  assert.equal(canonicalTruth.reviewPolicy.classification, "OPTIONAL_ADVISORY");
  assert.equal(canonicalTruth.reviewPolicy.requiredStatusCheck, false);
});
test("pending transition source-only interval defers only the missing doctrine truth assertion", () => {
  const pending = pendingTransitionEvaluation();
  assert.deepEqual(validateEngineeringDoctrineTruth({}, currentTruthContract, { currentMain: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.mergeSha, implementationMerged: true, protectedMainRuntime: pending }), []);
  const invalid = { ...pending, buildEligible: true };
  assert.ok(validateEngineeringDoctrineTruth({}, currentTruthContract, { currentMain: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.mergeSha, implementationMerged: true, protectedMainRuntime: invalid }).some(({ id }) => id === "ASSURANCE_ENGINEERING_DOCTRINE_MISSING"));
});

test("doctrine baseline/current delta controls 1-19: historical artifacts and structural/content identity are separated", () => {
  const baseline = validateDoctrineBaselineArtifacts();
  const graphPath = "config/assurance/whole-app-domain-graph-v1.json";
  const reportPath = "docs/assurance/whole-app-engineering-doctrine-v1-report.json";
  const tamperedGraph = validateDoctrineBaselineArtifacts(undefined, { currentBlobs: { [graphPath]: Buffer.from("{}") } });
  const wrongHead = validateDoctrineBaselineArtifacts(undefined, { identity: { sourceHead: "a".repeat(40) } });
  const wrongMerge = validateDoctrineBaselineArtifacts(undefined, { identity: { mergeSha: "a".repeat(40) } });
  const wrongReview = validateDoctrineBaselineArtifacts(undefined, { identity: { reviewCommentId: 1 } });
  const wrongPhase1 = validateDoctrineBaselineArtifacts(undefined, { identity: { phase1RunId: 1 } });
  const contentGraph = structuredClone(baseline.graph); const contentMember = contentGraph.inventory.groups.find(({ id }) => id === "governingControlSources").members.find(({ path: name }) => name === "scripts/assurance/engineering-closure.mjs"); contentMember.contentSha256 = "a".repeat(64);
  const contentObservation = deriveCurrentTreeObservation({ baseline, currentGraph: contentGraph, changedPaths: [contentMember.path] });
  const ownershipGraph = structuredClone(baseline.graph); ownershipGraph.nodes[0].owner = "changed-owner";
  const ownershipClosure = deriveDoctrineArtifactDependencyClosure({ baseline, currentGraph: ownershipGraph, changedPaths: ["config/assurance/feature-registry-v1.json"] });
  const edgeGraph = structuredClone(baseline.graph); edgeGraph.edges[0].authorityDirection = "DESTINATION_TO_SOURCE";
  const edgeClosure = deriveDoctrineArtifactDependencyClosure({ baseline, currentGraph: edgeGraph, changedPaths: ["config/assurance/feature-registry-v1.json"] });
  const controls = [baseline.ok, baseline.graphStatus === "DOCTRINE_DOMAIN_GRAPH_BASELINE_VALID", baseline.reportStatus === "DOCTRINE_IMPLEMENTATION_REPORT_BASELINE_VALID", baseline.artifacts[graphPath].sourceMatchesMerge, baseline.artifacts[graphPath].laterHistoryUnmodified, baseline.artifacts[reportPath].sourceMatchesMerge, baseline.artifacts[reportPath].laterHistoryUnmodified, /^[0-9a-f]{64}$/u.test(baseline.artifacts[graphPath].blobSha256), /^[0-9a-f]{64}$/u.test(baseline.artifacts[reportPath].blobSha256), !tamperedGraph.ok, tamperedGraph.graphStatus === "WHOLE_APP_DOMAIN_GRAPH_BASELINE_INVALID", !wrongHead.ok, !wrongMerge.ok, !wrongReview.ok, !wrongPhase1.ok, contentObservation.currentStructuralGraphHash === baseline.baselineStructuralGraphHash, contentObservation.currentContentSnapshotHash !== baseline.baselineContentSnapshotHash, ownershipClosure.modelRevisionRequired, edgeClosure.modelRevisionRequired];
  assert.equal(controls.length, 19); assert.equal(controls.every(Boolean), true);
});

test("doctrine baseline/current delta controls 20-38: inventory deltas and dependency closure are exact", () => {
  const baseline = validateDoctrineBaselineArtifacts();
  const graph = structuredClone(baseline.graph); const routes = graph.inventory.groups.find(({ id }) => id === "routes");
  routes.members.push({ id: "app/new-unmapped.tsx", path: "app/new-unmapped.tsx", contentSha256: "b".repeat(64), ownerDomains: [], ownershipStatus: "ORPHAN", sharedContract: null });
  const added = deriveCurrentTreeObservation({ baseline, currentGraph: graph, changedPaths: ["app/new-unmapped.tsx"] });
  const deletedGraph = structuredClone(baseline.graph); const deleted = deletedGraph.inventory.groups.find(({ id }) => id === "routes").members.pop();
  const removed = deriveCurrentTreeObservation({ baseline, currentGraph: deletedGraph, changedPaths: [deleted.path] });
  const current = deriveCurrentTreeObservation({ baseline, changedPaths: TYPED_CONTEXT_ARCHITECTURE_PATHS });
  const semantic = deriveDoctrineArtifactDependencyClosure({ baseline, currentGraph: baseline.graph, changedPaths: ["scripts/assurance/engineering-closure.mjs"], generatorSemanticHash: "c".repeat(64) });
  const product = deriveDoctrineArtifactDependencyClosure({ baseline, currentGraph: baseline.graph, changedPaths: ["app/index.tsx"] });
  const deterministic = Array.from({ length: 3 }, () => stableJson(deriveCurrentTreeObservation({ baseline, changedPaths: TYPED_CONTEXT_ARCHITECTURE_PATHS })));
  const controls = [added.taskDelta.addedAssets.includes("routes:app/new-unmapped.tsx"), added.taskDelta.canonicalModelRevisionRequired === false, added.currentStructuralGraphHash === baseline.baselineStructuralGraphHash, removed.taskDelta.removedAssets.includes(`routes:${deleted.path ?? deleted.id}`), current.dependencyClosure.classification === "DOCTRINE_ARTIFACT_DEPENDENCY_CLOSURE_V1", current.dependencyClosure.structuralGraphInputs.length === 0, current.dependencyClosure.verificationOnlyInputs.length === 8, current.dependencyClosure.doctrineImplementationReportInputs.length === 0, current.dependencyClosure.modelRevisionRequired === false, current.taskDelta.changedPaths.length === 8, current.taskDelta.changedAuthorityEdges.length === 0, current.taskDelta.changedStateTransitionBindings.length === 0, semantic.generatorSemanticChanged, semantic.modelRevisionRequired, product.contentOnlyInputs.includes("app/index.tsx"), !product.verificationOnlyInputs.includes("app/index.tsx"), new Set(deterministic).size === 1, hashValue(structuralGraphSubject(baseline.graph)) === baseline.baselineStructuralGraphHash, hashValue(contentSnapshotSubject(baseline.graph)) === baseline.baselineContentSnapshotHash];
  assert.equal(controls.length, 19); assert.equal(controls.every(Boolean), true);
});

test("doctrine baseline/current delta controls 39-48: modes, reports, callers, and closed authority remain deterministic", () => {
  const identity = { repository: "Chillywood2025/chillywood-mobile", pr: 227, branch: "codex/typed-task-context-terminal-successor-v1", head: "d".repeat(40), tree: "e".repeat(40), base: "c1f9ec1f71cc8bc4448afd2327c4341cac309573" };
  const architecture = deriveEngineeringClosureExecutionMode({ identity, changedPaths: TYPED_CONTEXT_ARCHITECTURE_PATHS, pendingTerminalTruth: true });
  const bootstrap = deriveEngineeringClosureExecutionMode({ identity: { head: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.sourceHead }, changedPaths: [] });
  const product = deriveEngineeringClosureExecutionMode({ taskContext: { type: "ACTIVE_FINITE_TASK_LEASE" }, changedPaths: ["app/index.tsx"] });
  const terminal = deriveEngineeringClosureExecutionMode({ taskContext: { type: "TERMINAL_TRUTH_SUCCESSOR" }, changedPaths: ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"] });
  const injected = deriveEngineeringClosureExecutionMode({ callerMode: "POST_DOCTRINE_ARCHITECTURE_MAINTENANCE" });
  const reports = Array.from({ length: 3 }, () => generateCurrentEngineeringTaskReport({ identity, taskContext: { type: architecture.mode }, changedPaths: TYPED_CONTEXT_ARCHITECTURE_PATHS }));
  const source = fs.readFileSync("scripts/assurance/engineering-closure.mjs", "utf8");
  const controls = [architecture.mode === "POST_DOCTRINE_ARCHITECTURE_MAINTENANCE", bootstrap.mode === "DOCTRINE_BOOTSTRAP_SELF_HOST", product.mode === "PRODUCT_DOMAIN_TASK", terminal.mode === "TERMINAL_TRUTH_SUCCESSOR", !injected.ok, new Set(reports.map(({ currentTaskReportHash }) => currentTaskReportHash)).size === 1, reports[0].classification === "CURRENT_ENGINEERING_TASK_REPORT_V1", Object.values(reports[0].authority).every((value) => value === false), !source.includes("WHOLE_APP_DOMAIN_GRAPH_STALE"), !source.includes("WHOLE_APP_DOCTRINE_REPORT_STALE")];
  assert.equal(controls.length, 10); assert.equal(controls.every(Boolean), true);
});

test("engineering closure inherits one exact typed terminal context from GitHub event readback", () => {
  const sourceHead = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  const sourceTree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).stdout.trim();
  const baseSha = spawnSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).stdout.trim();
  const branch = spawnSync("git", ["branch", "--show-current"], { encoding: "utf8" }).stdout.trim();
  const event = { repository: { full_name: "Chillywood2025/chillywood-mobile" }, number: 228, pull_request: { number: 228, state: "open", html_url: "https://github.com/Chillywood2025/chillywood-mobile/pull/228", base: { ref: "main", sha: baseSha }, head: { ref: branch, sha: sourceHead } } };
  const readback = { number: 228, repository: event.repository.full_name, baseRef: "main", baseSha, headRef: branch, headSha: sourceHead, htmlUrl: event.pull_request.html_url, state: "open" };
  const taskContext = { ok: true, type: "TERMINAL_TRUTH_SUCCESSOR", authoritySource: "TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_V1" };
  const input = { event, localIdentity: { branch, head: sourceHead, tree: sourceTree, base: baseSha }, scope: { files: [...TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS], netChangedLines: 500 }, currentTruth: canonicalTruth, readPull: () => readback, sourceAncestryVerified: true };
  const exact = resolveEngineeringClosureTaskContext({ ...input, observeAuthorities: () => ({ architectureAuthority: null, terminalTruthAuthority: taskContext, finiteTaskAuthority: null }) });
  const wrongReadback = resolveEngineeringClosureTaskContext({ ...input, readPull: () => ({ ...readback, headSha: "0".repeat(40) }), observeAuthorities: () => ({ architectureAuthority: null, terminalTruthAuthority: taskContext, finiteTaskAuthority: null }) });
  const ambiguous = resolveEngineeringClosureTaskContext({ ...input, observeAuthorities: () => ({ architectureAuthority: { ok: true }, terminalTruthAuthority: taskContext, finiteTaskAuthority: null }) });
  assert.equal(exact.ok, true);
  assert.equal(exact.taskContext.authoritySource, "TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_V1");
  assert.deepEqual(wrongReadback.findings, ["ENGINEERING_CLOSURE_ASSURANCE_PR_EVENT_READBACK_MISMATCH"]);
  assert.deepEqual(ambiguous.findings, ["ENGINEERING_CLOSURE_TASK_CONTEXT_AMBIGUOUS"]);
  assert.equal(deriveEngineeringClosureExecutionMode({ taskContext: exact.taskContext, changedPaths: TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS }).mode, "TERMINAL_TRUTH_SUCCESSOR");
});

const d2aTerminalStatuses = {
  T0_REQUIREMENT: "REQUIREMENTS_CLEAR",
  T1_SOURCE: "SOURCE_CLEAR",
  T2_MODEL: "MODEL_CLEAR",
  T3_INTEGRATION: "INTEGRATION_CLEAR",
  T4_NATIVE_PROVIDER: "BLOCKED_INTERNAL",
  T5_SIGNED_ARTIFACT: "BLOCKED_EXTERNAL",
  T6_INSTALLED_PHYSICAL: "BLOCKED_EXTERNAL",
  T7_PUBLIC_CANARY: "BLOCKED_EXTERNAL"
};

function terminalD2aTruth() {
  const value = structuredClone(canonicalTruth);
  const sourceHead = "50b5f0498a59961278bb5afbca443c6e35cd5bb6";
  const sourceTree = "cdbfcba71edfd1a6967e1fa2173696c6f2f524a0";
  const mergeSha = "fe775c12b0857aa50d986d24179ae9588049b6a1";
  Object.assign(value.activeTaskBinding, {
    currentImplementationHead: sourceHead,
    currentImplementationTree: sourceTree,
    phase: "TERMINAL",
    executionState: "D2A_BOUND_COMPLETE_FOR_REGISTERED_NATIVE_LIFECYCLE_SCOPE",
    completionScope: "D2A_BOUND_COMPLETE_FOR_REGISTERED_NATIVE_LIFECYCLE_SCOPE",
    proofTierStatuses: structuredClone(d2aTerminalStatuses),
    proofTierApplicabilityHash: digest(stableJson(callFeature.proofTierApplicability)),
    terminalEvidence: {
      schemaVersion: 1,
      completionScope: "D2A_BOUND_COMPLETE_FOR_REGISTERED_NATIVE_LIFECYCLE_SCOPE",
      sourceHead,
      sourceTree,
      mergeSha,
      mergeTree: sourceTree,
      ownerReceiptCommentId: 5268095229,
      repositoryReviewCommentId: 5268063533,
      repositoryReview: { P0: 0, P1: 0, launchImpactingP2: 0 },
      phase1: { runId: 31605891078, head: sourceHead, result: "PASS_13_OF_13" },
      proofLimitations: {
        T4_NATIVE_PROVIDER: "LOCAL_ANDROID_ONLY_PROVIDER_NOT_CONTACTED",
        backupClassification: "BLOCKED_LOCAL_ANDROID_BACKUP_TRANSPORT",
        T5_SIGNED_ARTIFACT: "NOT_CURRENT",
        T6_INSTALLED_PHYSICAL: "NOT_CURRENT",
        T7_PUBLIC_CANARY: "BLOCKED_EXTERNAL"
      },
      publicReleaseAuthorized: false,
      otaAuthorized: false
    }
  });
  value.openImplementationPrs = [];
  value.latestMergedImplementationPr = {
    number: 212,
    state: "merged",
    head: sourceHead,
    mergeSha,
    title: "First-pass assurance: Android generated native lifecycle instrumentation"
  };
  Object.assign(value.finiteTaskLeases.tasks.find(({ implementationPr }) => implementationPr === 212), {
    taskState: "MERGED_VERIFIED",
    domainOwnership: "PRESERVED_DEPENDENT"
  });
  value.finiteTaskRuntime.candidateObservation = {
    pr: 212,
    branch: value.activeTaskBinding.implementationBranch,
    prState: "merged",
    head: sourceHead,
    tree: sourceTree,
    classification: "TERMINAL_MERGED_VERIFIED_OBSERVATION",
    observedAt: "2026-08-12T12:00:00Z"
  };
  value.assuranceProgram.active = "chilly-chat-call-lifecycle";
  return value;
}

test("terminal D2A binding records bounded completion without promoting T4 through T7", () => {
  const value = terminalD2aTruth();
  assert.deepEqual(validateProofTierStatuses(value.activeTaskBinding, gateCatalog, registry), []);
  assert.deepEqual(validateTerminalTaskEvidence(value.activeTaskBinding, value.latestMergedImplementationPr), []);
  assert.deepEqual(validateStructuredBinding(value.activeTaskBinding, gateCatalog, registry, [], value.latestMergedImplementationPr), []);
  assert.equal(value.activeTaskBinding.proofTierStatuses.T4_NATIVE_PROVIDER, "BLOCKED_INTERNAL");
  assert.equal(value.activeTaskBinding.proofTierStatuses.T5_SIGNED_ARTIFACT, "BLOCKED_EXTERNAL");
  assert.equal(value.activeTaskBinding.terminalEvidence.publicReleaseAuthorized, false);
  assert.equal(value.activeTaskBinding.terminalEvidence.otaAuthorized, false);
});

test("terminal D2A evidence substitutions fail closed", () => {
  for (const mutate of [
    (value) => { value.activeTaskBinding.terminalEvidence.mergeSha = "a".repeat(40); },
    (value) => { value.activeTaskBinding.terminalEvidence.repositoryReview.P1 = 1; },
    (value) => { value.activeTaskBinding.terminalEvidence.phase1.result = "FAIL"; },
    (value) => { value.activeTaskBinding.proofTierStatuses.T5_SIGNED_ARTIFACT = "ARTIFACT_CLEAR"; }
  ]) {
    const value = terminalD2aTruth();
    mutate(value);
    assert.equal(validateStructuredBinding(value.activeTaskBinding, gateCatalog, registry, [], value.latestMergedImplementationPr).includes("ACTIVE_TASK_BINDING_MALFORMED"), true);
  }
});

test("terminal finite lease uses merged provenance and never asks for an open PR", () => {
  const value = terminalD2aTruth();
  const runtime = evaluateFiniteTaskLeaseRuntime({
    record: value,
    contract: currentTruthContract,
    currentProtectedBase: "fe775c12b0857aa50d986d24179ae9588049b6a1"
  });
  assert.equal(runtime.candidateEligible, true, runtime.findings.join(","));
  assert.equal(runtime.terminal, true);
  assert.equal(runtime.taskState, "MERGED_VERIFIED");
  assert.equal(runtime.candidate.observationSource, "PROTECTED_MAIN_TERMINAL_MERGE");
  assert.equal(runtime.candidate.prState, "merged");
});

test("terminal active-task packet is authorized by the protected active-to-terminal transition", () => {
  const value = terminalD2aTruth();
  const result = activeTask({
    currentTruth: value,
    protectedMainTruth: canonicalTruth,
    registry,
    allowlist,
    truthCheck: { ok: true, protectedMainRuntime: { candidateBaseStatus: "TERMINAL_MERGED_VERIFIED" } },
    identity: {
      branch: value.activeTaskBinding.implementationBranch,
      head: value.activeTaskBinding.currentImplementationHead,
      tree: value.activeTaskBinding.currentImplementationTree,
      originMainHead: value.latestMergedImplementationPr.mergeSha,
      originMainTree: value.activeTaskBinding.currentImplementationTree,
      baseHead: value.latestMergedImplementationPr.mergeSha,
      baseTree: value.activeTaskBinding.currentImplementationTree,
      diffHash: "1".repeat(64),
      pathHash: "2".repeat(64),
      changedFiles: []
    },
    directlyAffectedSymbols: []
  });
  assert.equal(result.ok, true, result.findings?.join(","));
  assert.equal(result.packet.implementation.state, "MERGED_VERIFIED");
  assert.equal(result.packet.implementation.finiteLease.terminal, true);
  assert.equal(result.packet.protectedMainRuntime.candidateBaseStatus, "TERMINAL_MERGED_VERIFIED");
});

test("terminal rolling-main state is source-valid but never merge-eligible again", () => {
  const value = terminalD2aTruth();
  const result = evaluateProtectedMainAdvancement({
    record: value,
    contract: currentTruthContract,
    observedProtectedMainSha: value.latestMergedImplementationPr.mergeSha,
    candidateHead: value.activeTaskBinding.currentImplementationHead,
    finiteTaskRuntime: { terminal: true, taskState: "MERGED_VERIFIED", sourceOnlyEligible: true, providerDependentEligible: false },
    checkpointTreeObservation: value.protectedMainAuthority.checkpointTree,
    checkpointIsAncestor: true,
    candidateContainsObservedMain: false,
    advancementObservations: []
  });
  assert.equal(result.candidateBaseStatus, "TERMINAL_MERGED_VERIFIED");
  assert.equal(result.sourceOnlyEligible, true);
  assert.equal(result.providerDependentEligible, false);
  assert.equal(result.mergeEligible, false);
  assert.equal(result.nextRequiredAction, "CONTINUE_TERMINAL_HANDOFF");
});

test("terminal contract is finite and preserves the thirteen protected checks", () => {
  const policy = currentTruthContract.terminalTaskTransitionPolicy;
  assert.equal(policy.completionScope, "D2A_BOUND_COMPLETE_FOR_REGISTERED_NATIVE_LIFECYCLE_SCOPE");
  assert.equal(policy.additionalControlPrRequired, false);
  assert.equal(policy.publicReleaseAuthorized, false);
  assert.equal(policy.otaAuthorized, false);
  assert.equal(policy.phase1PassCount, 13);
  assert.equal(currentTruthContract.reviewPolicy.requiredPhase1Checks, 13);
});

const terminalProtectedBase = "f4718f3e4ace89bd469468e30325789b5d43ef17";
const terminalMerge = "fe775c12b0857aa50d986d24179ae9588049b6a1";
const exactGit = (gitArgs) => {
  const result = spawnSync("git", gitArgs, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
};
const evaluateTerminalD2a = (overrides = {}) => evaluateFiniteTaskLeaseRuntime({
  record: terminalD2aTruth(),
  contract: currentTruthContract,
  now: new Date("2026-08-12T18:30:00Z"),
  environment: {},
  ...overrides
});
const callerUsesCentralResolution = (file) => {
  const source = fs.readFileSync(file, "utf8");
  assert.match(source, /evaluateFiniteTaskLeaseRuntime\(\{ record: currentTruth, contract: currentTruthContract \}\)/u);
  return evaluateTerminalD2a();
};

test("terminal protected-base resolution 1: explicit valid SHA wins", () => {
  assert.deepEqual(resolveCurrentProtectedBase({ currentProtectedBase: terminalProtectedBase }), {
    ok: true, protectedBase: terminalProtectedBase, source: "EXPLICIT_ARGUMENT", findings: []
  });
});

test("terminal protected-base resolution 2: malformed explicit SHA fails closed", () => {
  const result = resolveCurrentProtectedBase({ currentProtectedBase: "not-a-sha", gitCommand: () => terminalProtectedBase });
  assert.equal(result.ok, false);
  assert.equal(result.findings.includes("FINITE_TASK_CURRENT_PROTECTED_BASE_INVALID_EXPLICIT"), true);
  assert.equal(result.findings.includes("FINITE_TASK_CURRENT_PROTECTED_BASE_UNAVAILABLE"), true);
});

test("terminal protected-base resolution 3: GitHub pull-request base is exact", () => {
  const result = resolveCurrentProtectedBase({
    githubEvent: { pull_request: { base: { sha: terminalProtectedBase } } },
    gitCommand: () => { throw new Error("event must win"); },
    environment: {}
  });
  assert.equal(result.protectedBase, terminalProtectedBase);
  assert.equal(result.source, "GITHUB_PULL_REQUEST_EVENT");
});

test("terminal protected-base resolution 4: GitHub push to main uses after SHA", () => {
  const result = resolveCurrentProtectedBase({
    githubEvent: { ref: "refs/heads/main", after: terminalProtectedBase },
    gitCommand: () => { throw new Error("event must win"); },
    environment: { GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/main" }
  });
  assert.equal(result.protectedBase, terminalProtectedBase);
  assert.equal(result.source, "GITHUB_PUSH_TO_PROTECTED_MAIN");
});

test("terminal protected-base resolution 5: origin/main is the exact local remote", () => {
  const result = resolveCurrentProtectedBase({ githubEvent: null, environment: {}, gitCommand: (args) => {
    if (args.join(" ") === "rev-parse origin/main") return terminalProtectedBase;
    throw new Error("unexpected Git call");
  } });
  assert.equal(result.protectedBase, terminalProtectedBase);
  assert.equal(result.source, "EXACT_LOCAL_REMOTE");
});

test("terminal protected-base resolution 6: exact main checkout is the final fallback", () => {
  const result = resolveCurrentProtectedBase({ githubEvent: null, environment: {}, gitCommand: (args) => {
    if (args.join(" ") === "rev-parse origin/main") throw new Error("no remote");
    if (args.join(" ") === "branch --show-current") return "main";
    if (args.join(" ") === "rev-parse HEAD") return terminalProtectedBase;
    throw new Error("unexpected Git call");
  } });
  assert.equal(result.protectedBase, terminalProtectedBase);
  assert.equal(result.source, "MAIN_CHECKOUT_FALLBACK");
});

test("terminal protected-base resolution 7: no resolvable base emits the exact finding", () => {
  const result = resolveCurrentProtectedBase({ githubEvent: null, environment: {}, gitCommand: () => { throw new Error("unavailable"); } });
  assert.deepEqual(result.findings, ["FINITE_TASK_CURRENT_PROTECTED_BASE_UNAVAILABLE"]);
});

test("terminal protected-base resolution 8: canonical checkpoint is never a runtime-base fallback", () => {
  const value = terminalD2aTruth();
  value.protectedMainAuthority.checkpointSha = "a".repeat(40);
  const result = resolveCurrentProtectedBase({ githubEvent: null, environment: {}, gitCommand: () => { throw new Error("unavailable"); } });
  assert.equal(result.protectedBase, null);
  assert.notEqual(result.protectedBase, value.protectedMainAuthority.checkpointSha);
});

test("terminal protected-base resolution 9: terminal source is an ancestor of its merge", () => {
  const result = evaluateTerminalD2a({ currentProtectedBase: terminalProtectedBase });
  assert.equal(result.findings.includes("FINITE_TASK_TERMINAL_SOURCE_ANCESTRY_INVALID"), false);
  assert.equal(result.candidateEligible, true, result.findings.join(","));
});

test("terminal protected-base resolution 10: terminal merge is on protected first-parent history", () => {
  const result = evaluateTerminalD2a({ currentProtectedBase: terminalProtectedBase });
  assert.equal(result.findings.includes("FINITE_TASK_TERMINAL_MERGE_ANCESTRY_INVALID"), false);
  assert.equal(result.findings.includes("FINITE_TASK_TERMINAL_MERGE_NOT_ON_FIRST_PARENT"), false);
});

test("terminal protected-base resolution 11: source outside merge ancestry fails", () => {
  const value = terminalD2aTruth();
  const unrelatedHead = terminalProtectedBase;
  const unrelatedTree = exactGit(["rev-parse", `${unrelatedHead}^{tree}`]);
  value.activeTaskBinding.currentImplementationHead = unrelatedHead;
  value.activeTaskBinding.currentImplementationTree = unrelatedTree;
  value.finiteTaskRuntime.candidateObservation.head = unrelatedHead;
  value.finiteTaskRuntime.candidateObservation.tree = unrelatedTree;
  value.latestMergedImplementationPr.head = unrelatedHead;
  const result = evaluateTerminalD2a({ record: value, currentProtectedBase: terminalProtectedBase });
  assert.equal(result.findings.includes("FINITE_TASK_TERMINAL_SOURCE_ANCESTRY_INVALID"), true);
});

test("terminal protected-base resolution 12: merge outside protected-base ancestry fails", () => {
  const result = evaluateTerminalD2a({ currentProtectedBase: "50b5f0498a59961278bb5afbca443c6e35cd5bb6" });
  assert.equal(result.findings.includes("FINITE_TASK_TERMINAL_MERGE_ANCESTRY_INVALID"), true);
});

test("terminal protected-base resolution 13: wrong terminal source tree fails", () => {
  const value = terminalD2aTruth();
  value.activeTaskBinding.currentImplementationTree = "a".repeat(40);
  value.finiteTaskRuntime.candidateObservation.tree = "a".repeat(40);
  const result = evaluateTerminalD2a({ record: value, currentProtectedBase: terminalProtectedBase });
  assert.equal(result.findings.includes("FINITE_TASK_TERMINAL_SOURCE_TREE_MISMATCH"), true);
});

test("terminal protected-base resolution 14: wrong merged PR fails", () => {
  const value = terminalD2aTruth();
  value.latestMergedImplementationPr.number = 999;
  const result = evaluateTerminalD2a({ record: value, currentProtectedBase: terminalProtectedBase });
  assert.equal(result.findings.includes("FINITE_TASK_TERMINAL_MERGE_IDENTITY_MISMATCH"), true);
});

test("terminal protected-base resolution 15: current-truth explicit-base caller passes", () => {
  const source = fs.readFileSync("scripts/assurance/current-truth.mjs", "utf8");
  assert.match(source, /currentProtectedBase: remoteMain/u);
  const result = evaluateTerminalD2a({ currentProtectedBase: terminalProtectedBase });
  assert.equal(result.currentProtectedBaseResolution.source, "EXPLICIT_ARGUMENT");
  assert.equal(result.candidateEligible, true);
});

test("terminal protected-base resolution 16: autonomous guard omitted-base caller resolves centrally", () => {
  const result = callerUsesCentralResolution("scripts/guard-autonomous-systems-contract.mjs");
  assert.equal(result.currentProtectedBaseResolution.source, "EXACT_LOCAL_REMOTE");
  assert.equal(result.candidateEligible, true, result.findings.join(","));
});

test("terminal protected-base resolution 17: autonomous proof omitted-base caller resolves centrally", () => {
  const result = callerUsesCentralResolution("scripts/proof-autonomous-systems-contract.mjs");
  assert.equal(result.currentProtectedBaseResolution.source, "EXACT_LOCAL_REMOTE");
  assert.equal(result.candidateEligible, true, result.findings.join(","));
});

test("terminal protected-base resolution 18: assurance report omitted-base caller resolves centrally", () => {
  const result = callerUsesCentralResolution("scripts/assurance/report.mjs");
  assert.equal(result.currentProtectedBaseResolution.source, "EXACT_LOCAL_REMOTE");
  assert.equal(result.candidateEligible, true, result.findings.join(","));
});

test("terminal protected-base resolution 19: nonterminal finite-task behavior is retained", () => {
  const result = evaluateFiniteTaskLeaseRuntime({ record: historicalPr214Truth, contract: currentTruthContract, currentProtectedBase: terminalProtectedBase });
  assert.equal(result.terminal, false);
  assert.equal(result.currentProtectedBaseResolution.source, "EXPLICIT_ARGUMENT");
  assert.equal(result.leaseAuthorityEligible, true);
});

test("terminal protected-base resolution 20: provider-dependent authority remains closed", () => {
  assert.equal(evaluateTerminalD2a().providerDependentEligible, false);
});

test("terminal protected-base resolution 21: document freshness remains claim scoped", () => {
  const result = evaluateTerminalD2a({ now: new Date("2030-01-01T00:00:00Z") });
  assert.equal(result.sourceOnlyEligible, true, result.findings.join(","));
  assert.equal(result.providerDependentEligible, false);
});

test("terminal protected-base resolution 22: exact PR 224 terminal state passes against origin/main f471", () => {
  const result = evaluateTerminalD2a({ gitCommand: (args) => (
    args.join(" ") === "rev-parse origin/main" ? terminalProtectedBase : exactGit(args)
  ) });
  assert.equal(result.currentProtectedBaseResolution.source, "EXACT_LOCAL_REMOTE");
  assert.equal(result.currentProtectedBaseResolution.protectedBase, terminalProtectedBase);
  assert.equal(result.candidate.mergeSha, terminalMerge);
  assert.equal(result.candidateEligible, true, result.findings.join(","));
});

test("terminal protected-base resolution 23: undefined base never reaches a Git argument", () => {
  const result = evaluateTerminalD2a({ gitCommand: (args) => {
    assert.equal(args.some((entry) => entry === undefined || entry === null), false, args.join(" "));
    return exactGit(args);
  } });
  assert.equal(result.candidateEligible, true, result.findings.join(","));
  const source = fs.readFileSync("scripts/assurance/lib.mjs", "utf8");
  const terminalSource = source.slice(source.indexOf("if (terminalTask)"), source.indexOf("const derived = deriveFiniteTaskCandidateObservation"));
  assert.doesNotMatch(terminalSource, /latest\.mergeSha, currentProtectedBase/u);
  assert.match(terminalSource, /latest\.mergeSha, resolvedProtectedBase/u);
});

test("terminal protected-base resolution 24: resolution is deterministic three of three", () => {
  const results = Array.from({ length: 3 }, () => stableJson(resolveCurrentProtectedBase({ currentProtectedBase: terminalProtectedBase })));
  assert.equal(new Set(results).size, 1);
});

test("terminal protected-base resolution 25: all thirteen Phase 1 checks remain required", () => {
  assert.equal(currentTruthContract.reviewPolicy.requiredPhase1Checks, 13);
  assert.equal(canonicalTruth.reviewPolicy.requiredPhase1Checks, 13);
});

test("terminal protected-base resolution 26: provider Codex Review remains optional advisory", () => {
  assert.equal(canonicalTruth.reviewPolicy.classification, "OPTIONAL_ADVISORY");
  assert.equal(canonicalTruth.reviewPolicy.requiredStatusCheck, false);
});

test("terminal protected-base resolution 27: no second control or truth PR is required", () => {
  assert.equal(currentTruthContract.terminalTaskTransitionPolicy.additionalControlPrRequired, false);
  assert.equal(detectAssuranceRecursion({ requestedDependency: "TRUTH_ONLY_PR" }).code, ASSURANCE_RECURSIVE_BOOTSTRAP_CYCLE);
});

test("whole-app doctrine phase admission reserves discovery artifacts and blocks product mutation before derived clear", () => {
  const packet = { id: "ENGINEERING_CLOSURE_PACKET_V1", checks: Object.fromEntries(["boundaryExplicit", "affectedDomainClosureComplete"].map((key) => [key, true])) };
  const reservation = { closureArtifactPath: "docs/assurance/task.json", allowedDomains: ["chilly-chat-inbox-thread"], pathGlobs: ["app/chat/**"], testEvidencePaths: ["tests/assurance/chat.test.mjs"], maximumFiles: 4, maximumLines: 200, excludedHighRiskPaths: [] };
  const lease = { artifactReservation: reservation, allowedPaths: ["app/chat/index.tsx"] };
  const discovery = validateEngineeringTaskAuthority({ doctrineTruth: { status: "ACTIVE" }, featureId: "chilly-chat-inbox-thread", phase: "DOMAIN_DISCOVERY", lease, changedPaths: [reservation.closureArtifactPath], sourcePushed: true });
  assert.equal(discovery.ok, false); assert.ok(discovery.findings.includes("FINITE_TASK_SCOPE_MEASUREMENT_MISSING"));
  assert.equal(validateEngineeringTaskAuthority({ doctrineTruth: { status: "ACTIVE" }, featureId: "chilly-chat-inbox-thread", phase: "DOMAIN_DISCOVERY", lease, changedPaths: ["app/chat/index.tsx"] }).ok, false);
  assert.equal(validateEngineeringTaskAuthority({ doctrineTruth: { status: "ACTIVE" }, featureId: "chilly-chat-inbox-thread", phase: "IMPLEMENTATION", lease, closurePacket: packet, certificate: { id: "BOUNDED_ENGINEERING_COMPLETENESS_CERTIFICATE_V1" }, changedPaths: ["app/chat/index.tsx"] }).ok, false);
  assert.equal(validateEngineeringTaskAuthority({ doctrineTruth: { status: "ACTIVE" }, featureId: "chilly-chat-inbox-thread", lease: {} }).ok, false);
});

test("activeTask forwards the binding phase so reserved discovery can start without recursive admission", () => {
  const closureArtifactPath = "docs/assurance/chilly-chat-call-discovery.json";
  const discoveryBinding = { ...binding, phase: "DOMAIN_DISCOVERY" };
  const reservation = { closureArtifactPath, allowedDomains: [binding.featureId], pathGlobs: ["app/+native-intent.tsx"], testEvidencePaths: ["tests/assurance/chilly-chat-call-discovery.test.mjs"], maximumFiles: 4, maximumLines: 400, excludedHighRiskPaths: ["supabase/migrations/**"] };
  const lease = { leaseId: "discovery-test-v1", featureId: binding.featureId, implementationPr: binding.implementationPr, implementationBranch: binding.implementationBranch, admittedSeedHead: binding.immutableSourceHead, admittedSeedTree: binding.immutableSourceTree, admittedBase: "3".repeat(40), protectedAdmissionPr: 1, ownerAuthorizationCommentId: 1, domain: "chilly-chat-call-media", domainOwnership: "ACTIVE", taskState: "ACTIVE_IMPLEMENTATION", allowedPaths: [closureArtifactPath], scopeBudget: { maximumFiles: 4, maximumChangedLines: 400 }, recursionBudget: { maximumAdmissionPrs: 1, maximumFinalSourceBindingPrs: 0, maximumMergeProvenancePrs: 0, maximumPostMergeTruthPrs: 1 }, artifactReservation: reservation };
  const discoveryTruth = { ...truth, engineeringDoctrine: { status: "ACTIVE" }, activeTaskBinding: discoveryBinding, finiteTaskLeases: { ...truth.finiteTaskLeases, tasks: [...truth.finiteTaskLeases.tasks, lease] } };
  const candidate = { pr: binding.implementationPr, branch: binding.implementationBranch, prState: "open", head: binding.currentImplementationHead, tree: binding.currentImplementationTree, seedTree: binding.immutableSourceTree, seedIsAncestor: true, baseIsAncestor: true, changedPaths: [closureArtifactPath], changedLines: 1, diffHash: "1".repeat(64), changedPathHash: "2".repeat(64), finalReceiptHead: null, repositoryReviewHead: null, phase1Head: null, findings: { P0: 0, P1: 0, launchImpactingP2: 0 } };
  const result = activeTask({ ...facts, currentTruth: discoveryTruth, protectedMainTruth: discoveryTruth, finiteTaskCandidateObservation: candidate, identity: { ...identity, changedFiles: [closureArtifactPath] } });
  assert.equal(result.ok, true, result.findings?.join(","));
});

test("activeTask rejects generic product auto-clear and ignores caller-supplied Owner observations", () => {
  const implementationBinding = { ...binding, phase: "IMPLEMENTATION" }; const task = "FUTURE_BOUNDED_TASK"; const leaseId = "future-active-task-v1"; const graph = generateDomainGraph(); const domains = affectedDomainClosure(graph, binding.featureId).domains; const nodes = graph.nodes.filter(({ domain }) => domains.includes(domain)); const duplicateStates = [...new Set(nodes.flatMap((node) => node.sharedMutableState.map(({ stateId }) => stateId)).filter((stateId) => new Set(nodes.flatMap((node) => node.sharedMutableState.filter((state) => state.stateId === stateId).map(({ owner }) => owner))).size > 1))].sort(); const references = {}; const comments = duplicateStates.map((stateId, index) => { const canonicalOwners = [...new Set(nodes.flatMap((node) => node.sharedMutableState.filter((state) => state.stateId === stateId).map(({ owner }) => owner)))].sort(); const resolvedOwner = canonicalOwners[0]; const subject = { type: "REGISTERED_OWNER_DECISION", task, leaseId, currentHead: binding.currentImplementationHead, stateId, canonicalOwners, chosenOwner: resolvedOwner }; const id = 9300 + index; references[stateId] = { resolvedOwner, ownerAuthorization: { authorizationId: `github-comment-${id}`, subjectHash: digest(stableJson(subject)) } }; const payload = { authorizationId: `github-comment-${id}`, repository: "Chillywood2025/chillywood-mobile", pr: String(binding.implementationPr), task, leaseId, currentHead: binding.currentImplementationHead, type: "REGISTERED_OWNER_DECISION", subject, subjectHash: digest(stableJson(subject)) }; payload.bodyHash = digest(stableJson(payload)); return { id, url: `https://github.com/Chillywood2025/chillywood-mobile/issues/comments/${id}`, author: { login: "Chillywood2025" }, authorAssociation: "OWNER", createdAt: "2026-08-12T12:00:00Z", updatedAt: "2026-08-12T12:00:00Z", body: `<!-- chillywood-engineering-owner-authorization-v1 -->\n${JSON.stringify(payload)}` }; }); const future = makeTaskPacket({ primaryDomain: binding.featureId, evidencePath: "tests/assurance/engineering-doctrine.test.mjs", technicalResolutionSource: "tests/assurance/engineering-doctrine.test.mjs", ownerDecisionReferences: references, task, pr: binding.implementationPr, leaseId });
  const lease = { leaseId: future.certificate.leaseId, featureId: binding.featureId, implementationPr: binding.implementationPr, implementationBranch: binding.implementationBranch, admittedSeedHead: binding.immutableSourceHead, admittedSeedTree: binding.immutableSourceTree, admittedBase: "3".repeat(40), protectedAdmissionPr: 1, ownerAuthorizationCommentId: 1, engineeringOwnerAuthorizationCommentIds: [comments[0].id], domain: "chilly-chat-call-media", domainOwnership: "ACTIVE", taskState: "ACTIVE_IMPLEMENTATION", allowedPaths: future.actualScope.paths, scopeBudget: { maximumFiles: future.reservation.maximumFiles, maximumChangedLines: future.reservation.maximumLines }, recursionBudget: { maximumAdmissionPrs: 1, maximumFinalSourceBindingPrs: 0, maximumMergeProvenancePrs: 0, maximumPostMergeTruthPrs: 1 }, artifactReservation: future.reservation };
  const activeTruth = { ...truth, engineeringDoctrine: { status: "ACTIVE" }, activeTaskBinding: implementationBinding, finiteTaskLeases: { ...truth.finiteTaskLeases, tasks: [...truth.finiteTaskLeases.tasks, lease] } }; const candidate = { pr: binding.implementationPr, branch: binding.implementationBranch, prState: "open", head: binding.currentImplementationHead, tree: binding.currentImplementationTree, seedTree: binding.immutableSourceTree, seedIsAncestor: true, baseIsAncestor: true, changedPaths: future.actualScope.paths, changedLines: future.actualScope.changedLines, diffHash: "1".repeat(64), changedPathHash: "2".repeat(64), finalReceiptHead: null, repositoryReviewHead: null, phase1Head: null, findings: { P0: 0, P1: 0, launchImpactingP2: 0 } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doctrine-gh-")); const log = path.join(dir, "readback.log"); const raw = { id: comments[0].id, html_url: comments[0].url, user: comments[0].author, author_association: comments[0].authorAssociation, created_at: comments[0].createdAt, updated_at: comments[0].updatedAt, body: comments[0].body }; const fakeGh = path.join(dir, "gh"); fs.writeFileSync(fakeGh, `#!/usr/bin/env node\nrequire("fs").appendFileSync(${JSON.stringify(log)}, process.argv.slice(2).join(" ")+"\\n");process.stdout.write(${JSON.stringify(JSON.stringify(raw))});\n`); fs.chmodSync(fakeGh, 0o755); const originalPath = process.env.PATH; process.env.PATH = `${dir}:${originalPath}`;
  try { const result = activeTask({ ...facts, currentTruth: activeTruth, protectedMainTruth: activeTruth, finiteTaskCandidateObservation: candidate, engineeringClosurePacket: future.packet, engineeringCertificate: future.certificate, engineeringOwnerAuthorizationComments: comments, autonomousEngineeringRequest: {}, identity: { ...identity, changedFiles: future.actualScope.paths }, changedLines: future.actualScope.changedLines }); assert.equal(result.ok, false); assert.ok(result.findings.includes("PREIMPLEMENTATION_DEPENDENCY_CLOSURE_INCOMPLETE")); assert.ok(result.findings.includes("PREIMPLEMENTATION_STATE_MODEL_INCOMPLETE")); assert.match(fs.readFileSync(log, "utf8"), new RegExp(`issues/comments/${comments[0].id}$`, "mu")); } finally { process.env.PATH = originalPath; fs.rmSync(dir, { recursive: true, force: true }); }
});
