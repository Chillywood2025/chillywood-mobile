import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  activeTask,
  ownerBootstrapAuthorizationCommentBody,
  ownerBootstrapBindingSubject,
  validateStructuredBinding,
  verifyOwnerBootstrapAuthorization
} from "../../scripts/assurance/active-task.mjs";
import { renderCurrentState, stableJson, validateProofTierStatuses, verifyCommittedClaimEvidence, verifyCompletedImplementationMergeIdentity, verifyCurrentTruthSynchronization } from "../../scripts/assurance/lib.mjs";

const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const canonicalTruth = read("config/assurance/current-truth-v1.json");
const registry = read("config/assurance/feature-registry-v1.json");
const allowlist = read("config/assurance/command-allowlist-v1.json");
const gateCatalog = read("config/assurance/gate-catalog-v1.json");
const currentTruthContract = read("config/assurance/current-truth-contract-v1.json");
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
  originMainHead: "3".repeat(40),
  originMainTree: "4".repeat(40),
  baseHead: "3".repeat(40),
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

test("protected legacy correction bootstrap is exact, unique, deterministic, freezes D2A, and opens no build authority", () => {
  const correctionTruth = structuredClone(canonicalTruth);
  const correction = correctionTruth.activeTaskBinding;
  const expectedBody = ownerBootstrapAuthorizationCommentBody(correction);
  const ownerBootstrapAuthorizationObservation = {
    commentId: correction.ownerBootstrapAuthorization.commentId,
    author: correction.ownerBootstrapAuthorization.author,
    authorAssociation: correction.ownerBootstrapAuthorization.authorAssociation,
    body: expectedBody,
    createdAt: correction.ownerBootstrapAuthorization.createdAt,
    updatedAt: correction.ownerBootstrapAuthorization.updatedAt,
    issueUrl: `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${correction.implementationPr}`
  };
  const protectedOld = structuredClone(canonicalTruth);
  protectedOld.activeTaskBinding = binding;
  const correctionFacts = {
    ...facts,
    currentTruth: correctionTruth,
    protectedMainTruth: protectedOld,
    identity: {
      ...identity,
      branch: correction.implementationBranch,
      head: correction.currentImplementationHead,
      tree: correction.currentImplementationTree
    },
    implementationObservations: {
      remoteHead: correction.currentImplementationHead,
      immutableTree: correction.immutableSourceTree,
      currentTree: correction.currentImplementationTree,
      immutableSourceIsAncestor: true,
      providerPrHead: correction.currentImplementationHead
    },
    ownerBootstrapAuthorizationObservation
  };
  const packets = [0, 1, 2].map(() => activeTask({ ...correctionFacts, featureId: "chilly-chat-call-lifecycle" }));
  assert.equal(packets.every(({ ok }) => ok), true, packets.flatMap(({ findings = [] }) => findings).join(","));
  assert.equal(new Set(packets.map(({ packet }) => stableJson(packet))).size, 1, "packet generation is byte-identical 3/3");
  assert.equal(packets[0].packet.authority.contractId, "current-truth-record-v1");
  assert.equal(packets[0].packet.implementation.pr, 214);
  assert.equal(packets[0].packet.implementation.branch, "codex/d2a-legacy-webrtc-first-track-renegotiation-correction");
  assert.equal(packets[0].packet.activeBlockers.some(({ freshnessClass, status }) => freshnessClass === "PROVIDER_CRITICAL" && status === "STALE_BLOCKED"), true);
  assert.deepEqual(correctionTruth.d2aMicrophoneCorrectionBinding.preservedD2A, {
    implementationPr: 212,
    head: "4f5fa3937ac506bcd3626d15a2815839df620789",
    tree: "96795e544dc9d41f06086f248576d38f92d3be9a",
    state: "OPEN_DRAFT_BLOCKED_PRODUCT_P1",
    finding: "ANDROID_MIC_LEGACY_NEW_STREAM_NOT_ATTACHED_TO_EXISTING_PEERS"
  });
  assert.equal(correctionTruth.d2aMicrophoneCorrectionBinding.mayProceed.d2aResume, false);
  assert.equal(correctionTruth.d2aMicrophoneCorrectionBinding.mayProceed.buildOrOta, false);
  assert.equal(correctionTruth.d2aMicrophoneCorrectionBinding.mayProceed.providerOrProductionMutation, false);
  assert.equal(correctionTruth.lateReviewResolutionTombstones.some(({ prNumber }) => prNumber === 194), true);
  assert.equal(correctionTruth.lateReviewResolutionTombstones.some(({ prNumber }) => prNumber === 195), true);
  assert.deepEqual(activeTask({ ...correctionFacts, featureId: "creator-money-ledger" }).findings, ["FEATURE_OVERRIDE_CONFLICT"]);
  for (const branch of [
    "codex/first-pass-assurance-android-generated-native-lifecycle-instrumentation",
    "codex/d2a-livekit-mic-membership-convergence-correction",
    "codex/d2a-livekit-mic-post-merge-review-correction",
    "codex/unrelated-next"
  ]) {
    assert.equal(activeTask({ ...correctionFacts, identity: { ...correctionFacts.identity, branch } }).ok, false, `${branch} remains ineligible`);
  }

  for (const mutate of [
    (candidate) => { candidate.activeTaskBinding.implementationPr = 999; },
    (candidate) => { candidate.activeTaskBinding.implementationBranch = "codex/unrelated"; },
    (candidate) => { candidate.activeTaskBinding.currentImplementationHead = "f".repeat(40); },
    (candidate) => { candidate.activeTaskBinding.currentImplementationTree = "e".repeat(40); }
  ]) {
    const forged = structuredClone(correctionTruth);
    mutate(forged);
    assert.equal(activeTask({ ...correctionFacts, currentTruth: forged }).ok, false);
  }
  assert.equal(activeTask({
    ...correctionFacts,
    ownerBootstrapAuthorizationObservation: { ...ownerBootstrapAuthorizationObservation, body: `${expectedBody}\nsubstitution` }
  }).ok, false, "mismatched Owner comment fails");
});

test("legacy correction final repository source is exact and fails closed on tuple substitution", () => {
  const claim = canonicalTruth.freshnessClaims.find(({ id }) => id === "repository-source-d2a-legacy-webrtc-correction-final-freeze");
  const source = canonicalTruth.evidenceSources.find(({ id }) => id === claim.evidenceSourceId);
  const verify = (candidate) => verifyCommittedClaimEvidence({
    claim,
    source: candidate,
    factRegistry: currentTruthContract.freshness.factRegistry
  });
  assert.equal(verify(source), true);
  for (const [field, value] of [
    ["implementationPr", 999],
    ["implementationBranch", "codex/unrelated"],
    ["sourceCommit", "f".repeat(40)],
    ["subjectTree", "e".repeat(40)],
    ["protectedAdmissionPr", 999],
    ["ownerFinalTaskBindingCommentId", 999],
    ["exactExternalSourcePolicy", "UNRELATED"]
  ]) {
    assert.equal(verify({ ...source, [field]: value }), false, field);
  }
});

test("protected correction admission and final-source synchronizations are exact", () => {
  for (const prNumber of [215, 216]) {
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
