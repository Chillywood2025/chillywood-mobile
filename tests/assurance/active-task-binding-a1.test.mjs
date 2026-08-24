import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  activeTask,
  admittedFiniteTaskCommandRule,
  evaluatePreAdmissionEngineeringSeed,
  OWNER_PRE_ADMISSION_ENGINEERING_SEED_V1,
  ownerBootstrapAuthorizationCommentBody,
  ownerBootstrapBindingSubject,
  redactActiveTaskPacket,
  resolveEngineeringArtifactInput,
  resolveFiniteTaskImplementation,
  validateEngineeringTaskAuthority,
  validateStructuredBinding,
  verifyActiveTaskOwnerJurisdictionPolicy,
  verifyOwnerBootstrapAuthorization
} from "../../scripts/assurance/active-task.mjs";
import {
  ASSURANCE_RECURSIVE_BOOTSTRAP_CYCLE,
  classifyGitHubExecutionIdentity,
  controlMaintenanceAuthorizationCommentBody,
  controlMaintenanceAuthorizationSubject,
  createTerminalVerifierRepairInstance,
  detectAssuranceRecursion,
  deriveFiniteTaskCandidateObservation,
  evaluateFiniteTaskCandidate,
  evaluateFiniteTaskLeaseRuntime,
  evaluateProtectedMainAdvancement,
  exactExternalSourceProvenance,
  finiteTaskEffectiveReservationAuthorityValid,
  finiteTaskFinalReceiptBody,
  finiteTaskFinalReceiptSubject,
  finiteTaskImplementationLifecycleAuthorityValid,
  finiteTaskPostMergeTransitionAuthorityValid,
  finiteTaskTerminalReservationMatchesOutcome,
  HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_HISTORY,
  HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_INSTANCE,
  finiteTaskTestAdaptationCommentBody,
  finiteTaskTestAdaptationSubject,
  finiteTaskLeaseEffectivelyTerminal,
  finiteTaskLeaseFor,
  HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1,
  implementationRemoteRef,
  observeLiveFiniteTaskEffectiveReservation,
  PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1,
  PENDING_TERMINAL_TRUTH_TRANSITION_V1,
  projectFiniteTaskTerminalTruth,
  redact,
  registerVerifiedFiniteTaskImplementationLifecycle,
  registerVerifiedFiniteTaskPostMergeTransition,
  renderCurrentState,
  renderNextTask,
  resolveCurrentProtectedBase,
  resolveFiniteTaskCurrentTruthCandidateLease,
  resolveFiniteTaskEffectiveReservation,
  stableJson,
  TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_CLASSIFICATION,
  TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_HISTORY_POLICY_ID,
  TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS,
  TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PROFILE,
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
  verifyCurrentTruthHeadBindings,
  verifyCurrentTruthSynchronization,
  verifyFiniteTaskFinalReceipt,
  verifyFiniteTaskMergeProvenance,
  verifyFiniteTaskTestAdaptationReceipt,
  verifyTaskLeaseAmendment
} from "../../scripts/assurance/lib.mjs";
import { AUTHORITY_CONTROL_CURRENT_TRUTH_COMPANION_V2, DOCTRINE_BASE, FINITE_TASK_IMPLEMENTATION_EFFECTIVE_RESERVATION_V1, FINITE_TASK_TERMINAL_TRUTH_V1, PHASE1_REQUIRED_JOB_NAMES, TYPED_CONTEXT_ARCHITECTURE_PATHS, affectedDomainClosure, architectureFinalSourceOwnerCommentBody, architectureFinalSourceSubject, architectureMaintenanceOwnerCommentBody, architectureMaintenanceSubject, architectureRepositoryReviewCommentBody, architectureRepositoryReviewSubject, contentSnapshotSubject, createImplementationIdentityObservation, deriveCurrentTreeObservation, deriveDoctrineArtifactDependencyClosure, deriveEngineeringClosureExecutionMode, deriveTrustedImplementationScopeObservation, evaluateAdmittedFiniteTaskArtifactV2, evaluateFrozenFiniteTaskArtifactV2, evaluatePreimplementationGate, finiteTaskJurisdictionEvidenceV2, finiteTaskTerminalTruthFinalSourceOwnerCommentBody, finiteTaskTerminalTruthFinalSourceSubject, finiteTaskTerminalTruthOwnerCommentBody, finiteTaskTerminalTruthSubject, generateCurrentEngineeringTaskReport, generateDomainGraph, hashValue, makeTaskPacket, observeCandidateScopeFromGit, observePhase1RunEvidence, readGitHubApi, readTaskArtifactAtGitHead, resolveEngineeringClosureTaskContext, structuralGraphSubject, terminalTruthSuccessorVerifierRepairOwnerCommentBody, terminalTruthSuccessorVerifierRepairSubject, validateDoctrineBaselineArtifacts, verifyArchitectureMaintenanceAuthority, verifyFiniteTaskImplementationLifecycle, verifyFiniteTaskTerminalBaseAdvancement, verifyFiniteTaskTerminalTruthAuthority, verifyOwnerJurisdictionAuthorityV2, verifyPhase1RunEvidence, verifyTerminalTruthSuccessorAuthority } from "../../scripts/assurance/engineering-closure.mjs";
import { deriveTaskJurisdictionBindingV2, preflightOwnerJurisdictionDecisionV2, resolveOwnerJurisdictionPolicyChainV2 } from "../../scripts/assurance/jurisdiction-policy.mjs";

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

const preAdmissionFixture = () => {
  const seedHead = "1".repeat(40); const seedTree = "2".repeat(40); const planningHead = "3".repeat(40); const planningTree = "4".repeat(40);
  const taskArtifactPath = "docs/assurance/tasks/pre-release-identity-entitlement-authority-v1.json";
  const defectIds = ["WAPR-P1-AUTH-REDIRECT-001", "WAPR-P1-LEGAL-ACCEPTANCE-002", "WAPR-P1-PREMIUM-UNKNOWN-004", "WAPR-P1-PREMIUM-ACCOUNT-RACE-007", "WAPR-P1-PUSH-REVOCATION-008", "WAPR-CM-P1-CREATOR-ELIGIBILITY-014"];
  const subject = { repository: "Chillywood2025/chillywood-mobile", implementationPr: 229, implementationBranch: "codex/pre-release-identity-entitlement-authority-v1", admittedSeed: { head: seedHead, tree: seedTree }, taskArtifact: taskArtifactPath, primaryFeature: "auth-session-password-recovery", leaseId: "pre-release-identity-entitlement-authority-v1", defectIds, scopeBudget: { initial: { maximumFiles: 30, maximumHandAuthoredNetLines: 3600 } } };
  const payloadBase = { repository: subject.repository, pr: "229", subject, subjectHash: hashValue(subject) };
  const payload = { ...payloadBase, bodyHash: hashValue(payloadBase) };
  const body = `<!-- chillywood-pre-release-plan-wave1-owner-approval-v1 -->\n${stableJson(payload)}`;
  const facts = {
    requestedPr: 229, requestedOwnerComment: 5285464582, taskArtifactPath,
    currentTruth: { ...structuredClone(canonicalTruth), engineeringDoctrine: { ...canonicalTruth.engineeringDoctrine, status: "ACTIVE", taskLeaseState: "NO_ACTIVE_TASK" }, finiteTaskLeases: { ...canonicalTruth.finiteTaskLeases, tasks: canonicalTruth.finiteTaskLeases.tasks.map((task) => ({ ...task, taskState: "MERGED_VERIFIED" })) }, taskContextArchitecture: { ...canonicalTruth.taskContextArchitecture, pendingTransitionCountAfterSynchronization: 0 } },
    registry, pullRequest: { number: 229, repository: subject.repository, branch: subject.implementationBranch, headSha: planningHead, baseRef: "main", baseSha: "5".repeat(40), state: "open", draft: true },
    ownerComment: { id: 5285464582, author: "Chillywood2025", authorAssociation: "OWNER", createdAt: "2026-08-13T19:32:32Z", updatedAt: "2026-08-13T19:32:32Z", body, bodyHash: hashValue(body) },
    taskArtifact: { taskId: subject.leaseId, repository: subject.repository, implementation: { branch: subject.implementationBranch, pullRequest: 229, seedHead, seedTree }, primaryDomain: subject.primaryFeature, authorizationStatus: "PRODUCT_SOURCE_EDITING_NOT_YET_AUTHORIZED", rootDefects: defectIds, provisionalPathBudget: { maximumFiles: 30, maximumHandAuthoredNetLines: 3600 } },
    taskArtifactHash: "6".repeat(64), seedHead, seedTree, observedSeedTree: seedTree, seedIsAncestor: true, baseIsAncestor: true, currentProtectedMain: "5".repeat(40), currentPlanningHead: planningHead, currentPlanningTree: planningTree, observedPlanningTree: planningTree, changedPaths: [taskArtifactPath], productChangedFiles: 0, openPreAdmissionSeeds: [229], graph: generateDomainGraph()
  };
  return facts;
};

const preAdmissionMutation = (mutate) => { const facts = preAdmissionFixture(); mutate(facts); return evaluatePreAdmissionEngineeringSeed(facts); };
test("pre-admission 01: exact governed seed passes without product authority", () => { const result = evaluatePreAdmissionEngineeringSeed(preAdmissionFixture()); assert.equal(result.ok, true); assert.equal(result.packet.classification, OWNER_PRE_ADMISSION_ENGINEERING_SEED_V1); assert.equal(result.packet.productSourceMutationAllowed, false); });
test("pre-admission 02: terminal history does not block explicit seed mode", () => { const facts = preAdmissionFixture(); facts.currentTruth.activeTaskBinding = canonicalTruth.activeTaskBinding; assert.equal(evaluatePreAdmissionEngineeringSeed(facts).ok, true); });
test("pre-admission 03: normal active-task terminal history remains unchanged", () => { assert.equal(canonicalTruth.activeTaskBinding.implementationPr, 229); assert.deepEqual(validateStructuredBinding(canonicalTruth.activeTaskBinding, gateCatalog, registry, canonicalTruth.openImplementationPrs, canonicalTruth.latestMergedImplementationPr), []); });
test("pre-admission 04: normal feature conflict stays denied", () => assert.deepEqual(activeTask({ currentTruth: canonicalTruth, truthCheck: { ok: true }, registry, featureId: "auth-session-password-recovery" }).findings, ["FEATURE_OVERRIDE_CONFLICT"]));
test("pre-admission 05: feature derives from Owner and artifact", () => assert.equal(evaluatePreAdmissionEngineeringSeed(preAdmissionFixture()).packet.featureId, "auth-session-password-recovery"));
test("pre-admission 06: caller feature is rejected", () => assert.equal(preAdmissionMutation((facts) => { facts.callerFeature = "auth-session-password-recovery"; }).ok, false));
test("pre-admission 07: wrong PR fails", () => assert.equal(preAdmissionMutation((facts) => { facts.requestedPr = 230; }).ok, false));
test("pre-admission 08: wrong branch fails", () => assert.equal(preAdmissionMutation((facts) => { facts.pullRequest.branch = "codex/wrong"; }).ok, false));
test("pre-admission 09: wrong seed head fails", () => assert.equal(preAdmissionMutation((facts) => { facts.seedHead = "7".repeat(40); }).ok, false));
test("pre-admission 10: wrong seed tree fails", () => assert.equal(preAdmissionMutation((facts) => { facts.seedTree = "7".repeat(40); }).ok, false));
test("pre-admission 11: rewritten seed fails", () => assert.equal(preAdmissionMutation((facts) => { facts.seedIsAncestor = false; }).ok, false));
test("pre-admission 12: edited Owner comment fails", () => assert.equal(preAdmissionMutation((facts) => { facts.ownerComment.body += " "; }).ok, false));
test("pre-admission 13: wrong Owner association fails", () => assert.equal(preAdmissionMutation((facts) => { facts.ownerComment.authorAssociation = "MEMBER"; }).ok, false));
test("pre-admission 14: product source in diff fails", () => assert.equal(preAdmissionMutation((facts) => { facts.changedPaths.push("app/index.tsx"); facts.productChangedFiles = 1; }).ok, false));
test("pre-admission 15: task-artifact-only descendant succeeds", () => { const facts = preAdmissionFixture(); facts.currentPlanningHead = "8".repeat(40); facts.pullRequest.headSha = facts.currentPlanningHead; assert.equal(evaluatePreAdmissionEngineeringSeed(facts).ok, true); });
test("pre-admission 16: second changed path fails", () => assert.equal(preAdmissionMutation((facts) => { facts.changedPaths.push("tests/x.mjs"); }).ok, false));
test("pre-admission 17: competing seed fails", () => assert.equal(preAdmissionMutation((facts) => { facts.openPreAdmissionSeeds.push(230); }).ok, false));
test("pre-admission 18: mutation authority is false on failure", () => assert.equal(preAdmissionMutation((facts) => { facts.seedIsAncestor = false; }).productSourceMutationAllowed, false));
test("pre-admission 19: clearance cannot issue before admission", () => { const packet = evaluatePreAdmissionEngineeringSeed(preAdmissionFixture()).packet; assert.equal(packet.highestPermittedState, "ENGINEERING_PLAN_DRAFTED"); assert.equal(packet.finiteLeasePresent, false); });
test("pre-admission 20: packet is deterministic 3 of 3", () => assert.equal(new Set([1, 2, 3].map(() => stableJson(evaluatePreAdmissionEngineeringSeed(preAdmissionFixture()).packet))).size, 1));

const jurisdictionActiveTaskFixture = ({
  domainIds = ["creator-money-ledger", "payouts-stripe-connect"],
  inherited = false,
  taskId = "active-task-jurisdiction-fixture",
} = {}) => {
  const sortedDomains = [...domainIds].sort();
  const implementationPr = 229;
  const implementationBranch = "codex/pre-release-identity-entitlement-authority-v1";
  const originalSeedHead = "1".repeat(40);
  const originalSeedTree = "2".repeat(40);
  const planningHead = "3".repeat(40);
  const planningTree = "4".repeat(40);
  const ownerApprovalCommentId = 5285464582;
  const taskArtifactPath = `docs/assurance/tasks/${taskId}.json`;
  const scope = {
    launchProgram: "chillywood-united-states-pre-release",
    product: "chillywood-mobile",
    repository: "Chillywood2025/chillywood-mobile",
  };
  const taskEvidence = {
    closurePacketHash: "a".repeat(64),
    completenessCertificateHash: "b".repeat(64),
    taskArtifactHash: "c".repeat(64),
    taskLocalEdgeClosureHash: "d".repeat(64),
    taskLocalEdgeEvidenceHash: "e".repeat(64),
    taskLocalModelHash: "f".repeat(64),
  };
  const taskIdentity = {
    implementationBranch,
    implementationPr,
    leaseId: taskId,
    originalSeedHead,
    originalSeedTree,
    ownerApprovalCommentId,
    planningHead,
    planningTree,
    taskArtifactPath,
    taskId,
  };
  const domainApplications = sortedDomains.map((domainId) => ({
    decision: `Exact task-specific United States application for ${domainId}.`,
    domainId,
    jurisdictionDecisionOwner: "Chillywood2025",
    market: "UNITED_STATES_ONLY",
    minimumCreatorAge: ["creator-money-ledger", "payouts-stripe-connect"].includes(domainId) ? 18 : null,
  }));
  const rendered = preflightOwnerJurisdictionDecisionV2({
    domainApplications,
    domainIds: sortedDomains,
    owner: { association: "OWNER", login: "Chillywood2025" },
    registry,
    scope,
    taskEvidence,
    taskIdentity,
  });
  assert.equal(rendered.ok, true, rendered.findings?.join(","));
  const commentId = 9901;
  const createdAt = "2026-08-14T12:00:00Z";
  const receipt = {
    authorAssociation: "OWNER",
    authorLogin: "Chillywood2025",
    body: rendered.body,
    createdAt,
    id: commentId,
    updatedAt: createdAt,
  };
  const policyResolution = resolveOwnerJurisdictionPolicyChainV2({ completeDiscovery: true, expectedScope: scope, receipts: [receipt], registry });
  const inheritedTaskBinding = inherited ? deriveTaskJurisdictionBindingV2({ domainIds: sortedDomains, policyReceipt: policyResolution, registry, scope, taskEvidence, taskIdentity }) : null;
  const closedAuthority = {
    productMutation: false,
    providerMutation: false,
    databaseDeployment: false,
    build: false,
    submission: false,
    ota: false,
    publicRelease: false,
  };
  const projection = {
    schemaVersion: 2,
    contract: "OWNER_JURISDICTION_POLICY_BINDING_V2",
    repository: scope.repository,
    product: scope.product,
    launchProgram: scope.launchProgram,
    policySource: {
      commentId,
      ...(inherited ? { referenceScope: "STANDING_POLICY_SUBRECORD_ONLY" } : { referenceScope: "TASK_BOUND_COMPOSITE", decisionVersion: "OWNER_JURISDICTION_DECISION_V2", subjectHash: rendered.payload.subjectHash, bodyHash: rendered.payload.bodyHash, envelopeHash: rendered.envelopeHash }),
      standingPolicyType: "OWNER_JURISDICTION_STANDING_POLICY_V2",
      standingPolicyVersion: 2,
      status: "ACTIVE_UNTIL_OWNER_SUPERSESSION_OR_REVOCATION",
      sequence: 0,
      standingPolicyHash: rendered.standingPolicyHash,
    },
    taskBinding: {
      taskId,
      prNumber: implementationPr,
      planningHead,
      planningTree,
      standingPolicyCommentId: commentId,
      standingPolicyHash: rendered.standingPolicyHash,
      bindingType: "OWNER_JURISDICTION_TASK_BINDING_V2",
      bindingVersion: 2,
      domainIds: sortedDomains,
      bindingHash: inheritedTaskBinding?.bindingHash ?? rendered.taskBindingHash,
      conflictStatus: "NONE",
    },
    coverage: {
      status: "EXACT_TASK_DOMAINS_BOUND",
      coveredDomainIds: sortedDomains,
      coveredCount: sortedDomains.length,
      unresolvedDomainIds: [],
    },
    externalProofInherited: false,
    operationalOwnershipPreserved: true,
    authority: closedAuthority,
  };
  const activeBinding = {
    featureId: sortedDomains[0],
    implementationBindingId: taskId,
    implementationBranch,
    implementationPr,
    immutableSourceHead: originalSeedHead,
    immutableSourceTree: originalSeedTree,
    currentImplementationHead: planningHead,
    currentImplementationTree: planningTree,
    phase: "PREIMPLEMENTATION_ENGINEERING_CLEAR",
  };
  const lease = {
    admittedSeedHead: originalSeedHead,
    admittedSeedTree: originalSeedTree,
    artifactReservation: { allowedDomains: sortedDomains, closureArtifactPath: taskArtifactPath },
    closure: {
      artifactHash: taskEvidence.taskArtifactHash,
      packetHash: taskEvidence.closurePacketHash,
      certificateHash: taskEvidence.completenessCertificateHash,
      edgeClosureHash: taskEvidence.taskLocalEdgeClosureHash,
      edgeEvidenceHash: taskEvidence.taskLocalEdgeEvidenceHash,
      modelDeltaHash: taskEvidence.taskLocalModelHash,
    },
    implementationBranch,
    implementationPr,
    leaseId: taskId,
    ownerAuthorizationCommentId: ownerApprovalCommentId,
  };
  const fixtureTruth = {
    ...structuredClone(canonicalTruth),
    ownerJurisdictionPolicyBinding: projection,
  };
  return {
    activeBinding,
    lease,
    policyObservation: { complete: true, receipts: [receipt], ...(inheritedTaskBinding ? { taskBinding: inheritedTaskBinding } : {}) },
    projection,
    rendered,
    taskEvidence,
    truth: fixtureTruth,
  };
};

const verifyJurisdictionFixture = (fixture) => verifyActiveTaskOwnerJurisdictionPolicy({
  activeBinding: fixture.activeBinding,
  currentTruthContract,
  lease: fixture.lease,
  policyObservation: fixture.policyObservation,
  registry,
  truth: fixture.truth,
});

test("active-task jurisdiction 01: exact V2 projection resolves immutable policy and task-specific creator age", () => {
  const result = verifyJurisdictionFixture(jurisdictionActiveTaskFixture());
  assert.equal(result.ok, true, result.findings?.join(","));
  assert.equal(result.evidence.marketJurisdictionOwnerCoverage, "2/2");
  assert.equal(result.evidence.launchMarket, "UNITED_STATES_ONLY");
  assert.equal(result.evidence.initialRollout, "CONTROLLED_1_PERCENT_UNITED_STATES");
  assert.equal(result.evidence.creatorMinimumAge, 18);
  assert.deepEqual(result.evidence.domainMinimumCreatorAges, { "creator-money-ledger": 18, "payouts-stripe-connect": 18 });
  assert.equal(result.evidence.domainBinding.domainCoverageReusable, false);
  assert.equal(result.evidence.externalProofInherited, false);
  assert.deepEqual(result.evidence.authority, {
    productMutation: false,
    providerMutation: false,
    databaseDeployment: false,
    build: false,
    submission: false,
    ota: false,
    publicRelease: false,
  });
});

test("active-task jurisdiction 02: creator age is absent without task-specific age evidence", () => {
  const result = verifyJurisdictionFixture(jurisdictionActiveTaskFixture({ domainIds: ["auth-session-password-recovery"] }));
  assert.equal(result.ok, true, result.findings?.join(","));
  assert.equal(Object.hasOwn(result.evidence, "creatorMinimumAge"), false);
  assert.equal(Object.hasOwn(result.evidence, "domainMinimumCreatorAges"), false);
});

test("active-task jurisdiction 03: absent optional binding preserves legacy behavior", () => {
  const result = verifyActiveTaskOwnerJurisdictionPolicy({ truth: canonicalTruth, currentTruthContract, registry });
  assert.deepEqual(result, { ok: true, evidence: null, findings: [] });
});

test("active-task jurisdiction 04: wildcard projection fails closed", () => {
  const fixture = jurisdictionActiveTaskFixture();
  fixture.truth.ownerJurisdictionPolicyBinding.taskBinding.domainIds = ["*"];
  fixture.truth.ownerJurisdictionPolicyBinding.coverage.coveredDomainIds = ["*"];
  fixture.truth.ownerJurisdictionPolicyBinding.coverage.coveredCount = 1;
  assert.equal(verifyJurisdictionFixture(fixture).ok, false);
});

test("active-task jurisdiction 05: task domains cannot be borrowed from a different lease", () => {
  const fixture = jurisdictionActiveTaskFixture();
  fixture.lease.artifactReservation.allowedDomains = ["creator-money-ledger"];
  assert.deepEqual(verifyJurisdictionFixture(fixture).findings, ["ACTIVE_TASK_OWNER_JURISDICTION_EXACT_DOMAIN_MISMATCH"]);
});

test("active-task jurisdiction 06: planning identity mismatch fails closed", () => {
  const fixture = jurisdictionActiveTaskFixture();
  fixture.activeBinding.currentImplementationHead = "9".repeat(40);
  assert.deepEqual(verifyJurisdictionFixture(fixture).findings, ["ACTIVE_TASK_OWNER_JURISDICTION_TASK_IDENTITY_MISMATCH"]);
});

test("active-task jurisdiction 07: closure evidence mismatch fails closed", () => {
  const fixture = jurisdictionActiveTaskFixture();
  fixture.lease.closure.modelDeltaHash = "0".repeat(64);
  assert.deepEqual(verifyJurisdictionFixture(fixture).findings, ["ACTIVE_TASK_OWNER_JURISDICTION_TASK_EVIDENCE_MISMATCH"]);
});

test("active-task jurisdiction 08: incomplete policy discovery is never current-tip proof", () => {
  const fixture = jurisdictionActiveTaskFixture();
  fixture.policyObservation.complete = false;
  assert.deepEqual(verifyJurisdictionFixture(fixture).findings, ["ACTIVE_TASK_OWNER_JURISDICTION_COMPLETE_DISCOVERY_REQUIRED"]);
});

test("active-task jurisdiction 09: edited immutable receipt fails chain verification", () => {
  const fixture = jurisdictionActiveTaskFixture();
  fixture.policyObservation.receipts[0].body += " ";
  assert.equal(verifyJurisdictionFixture(fixture).ok, false);
});

test("active-task jurisdiction 10: prohibited authority in truth fails closed", () => {
  const fixture = jurisdictionActiveTaskFixture();
  fixture.truth.ownerJurisdictionPolicyBinding.authority.build = true;
  assert.equal(verifyJurisdictionFixture(fixture).ok, false);
});
test("active-task jurisdiction 11: active-task consumes a nonembedded inherited binding as task-specific evidence", () => {
  const result = verifyJurisdictionFixture(jurisdictionActiveTaskFixture({ domainIds: ["auth-session-password-recovery"], inherited: true, taskId: "later-wave-exact-binding" }));
  assert.equal(result.ok, true, result.findings?.join(","));
  assert.equal(result.evidence.domainBinding.taskSpecific, true);
  assert.equal(result.evidence.domainBinding.domainCoverageReusable, false);
});

const activeTaskCorrectionMaintenanceFixture = (mutate = () => {}) => {
  const identity = { repository: "Chillywood2025/chillywood-mobile", pr: 236, branch: "codex/wave1-active-task-frozen-model-correction-v1", headSha: "7".repeat(40), baseSha: "8".repeat(40) };
  const tree = "9".repeat(40);
  const scope = { files: ["scripts/assurance/active-task.mjs", "scripts/assurance/engineering-closure.mjs", "tests/assurance/active-task-binding-a1.test.mjs"], additions: 120, deletions: 8, netChangedLines: 112 };
  const subject = architectureMaintenanceSubject({ identity, tree, scope, profile: "OWNER_JURISDICTION_CANONICAL_MODEL_V2" });
  mutate(subject);
  const body = architectureMaintenanceOwnerCommentBody(subject);
  const raw = { id: 799001, node_id: "IC_active_task_correction", user: { login: "Chillywood2025" }, author_association: "OWNER", body, created_at: "2026-08-14T20:00:00Z", updated_at: "2026-08-14T20:00:00Z", issue_url: `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${identity.pr}`, html_url: `https://github.com/Chillywood2025/chillywood-mobile/pull/${identity.pr}#issuecomment-799001` };
  return { identity, tree, scope, raw };
};

test("active-task correction maintenance 01: assurance-only empty objective domain remains valid beside the active product task", () => {
  const fixture = activeTaskCorrectionMaintenanceFixture();
  const result = verifyArchitectureMaintenanceAuthority({ ...fixture, allComments: [fixture.raw], paginationComplete: true, ancestryVerified: true, noCompetingDomainOwner: false });
  assert.equal(result.ok, true, result.findings?.join(","));
});

test("active-task correction maintenance 02: objective-domain expansion cannot borrow the assurance-only exception", () => {
  const fixture = activeTaskCorrectionMaintenanceFixture((subject) => { subject.objectiveDomains = ["auth-session-password-recovery"]; });
  const result = verifyArchitectureMaintenanceAuthority({ ...fixture, allComments: [fixture.raw], paginationComplete: true, ancestryVerified: true, noCompetingDomainOwner: false });
  assert.equal(result.ok, false);
});

test("active-task correction maintenance 03: product authority cannot borrow the assurance-only exception", () => {
  const fixture = activeTaskCorrectionMaintenanceFixture((subject) => { subject.authority.product = true; });
  const result = verifyArchitectureMaintenanceAuthority({ ...fixture, allComments: [fixture.raw], paginationComplete: true, ancestryVerified: true, noCompetingDomainOwner: false });
  assert.equal(result.ok, false);
});

test("active-task correction maintenance 04: only the exact canonical closed-authority profile can coexist with the active task", () => {
  const mutations = [
    (subject) => { subject.authority = {}; },
    (subject) => { delete subject.ownerIdentity; },
    (subject) => { subject.currentTruthCompanionIncluded = false; },
    (subject) => { subject.expiresOn = "NEVER"; },
    (subject) => { subject.authority.unlisted = false; },
  ];
  for (const mutate of mutations) {
    const fixture = activeTaskCorrectionMaintenanceFixture(mutate);
    const result = verifyArchitectureMaintenanceAuthority({ ...fixture, allComments: [fixture.raw], paginationComplete: true, ancestryVerified: true, noCompetingDomainOwner: false });
    assert.equal(result.ok, false);
  }
});

const currentTruthCompanionV2Fixture = ({ files, mutateSubject = () => {} } = {}) => {
  const committedHead = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  const identity = {
    repository: "Chillywood2025/chillywood-mobile",
    pr: 400,
    branch: "codex/authority-control-current-truth-companion-v2",
    headSha: committedHead,
    baseSha: "928a9734f5bda16c90bb4fc95cb96e81ae9dd131",
  };
  const tree = "b".repeat(40);
  const scope = {
    files: files ?? [
      "CURRENT_STATE.md",
      "config/assurance/current-truth-v1.json",
      "scripts/assurance/engineering-closure.mjs",
      "tests/assurance/active-task-binding-a1.test.mjs",
    ],
    additions: 160,
    deletions: 12,
    netChangedLines: 148,
    diffHash: "c".repeat(64),
  };
  const subject = architectureMaintenanceSubject({ identity, tree, scope, profile: "OWNER_JURISDICTION_CANONICAL_MODEL_V2" });
  mutateSubject(subject);
  const body = architectureMaintenanceOwnerCommentBody(subject);
  const raw = {
    id: 800001,
    node_id: "IC_authority_companion_v2",
    user: { login: "Chillywood2025" },
    author_association: "OWNER",
    body,
    created_at: "2026-08-14T22:00:00Z",
    updated_at: "2026-08-14T22:00:00Z",
    issue_url: `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${identity.pr}`,
    html_url: `https://github.com/Chillywood2025/chillywood-mobile/pull/${identity.pr}#issuecomment-800001`,
  };
  return { identity, tree, scope, subject, raw };
};

test("active-task correction maintenance 05: legacy V1 receipts retain their original no-companion semantics", () => {
  const fixture = activeTaskCorrectionMaintenanceFixture();
  assert.equal(JSON.parse(fixture.raw.body.split("\n")[1]).subject.currentTruthCompanion, undefined);
  const result = verifyArchitectureMaintenanceAuthority({ ...fixture, allComments: [fixture.raw], paginationComplete: true, ancestryVerified: true, noCompetingDomainOwner: false });
  assert.equal(result.ok, true, result.findings?.join(","));
});

test("active-task correction maintenance 06: post-cutover authority maintenance binds the exact V2 current-truth companion", () => {
  const fixture = currentTruthCompanionV2Fixture();
  assert.equal(fixture.subject.currentTruthCompanion.contractId, AUTHORITY_CONTROL_CURRENT_TRUTH_COMPANION_V2);
  assert.deepEqual(fixture.subject.currentTruthCompanion.requiredChangedPaths, ["CURRENT_STATE.md", "config/assurance/current-truth-v1.json"]);
  assert.equal(fixture.subject.currentTruthCompanion.currentTruth.checkpointSha, fixture.identity.baseSha);
  const result = verifyArchitectureMaintenanceAuthority({ ...fixture, allComments: [fixture.raw], paginationComplete: true, ancestryVerified: true, noCompetingDomainOwner: false });
  assert.equal(result.ok, true, result.findings?.join(","));
  assert.equal(result.checks.currentTruthCompanion, true);
});

test("active-task correction maintenance 07: a post-cutover missing or substituted companion fails closed", () => {
  const omitted = currentTruthCompanionV2Fixture({ files: ["CURRENT_STATE.md", "scripts/assurance/engineering-closure.mjs", "tests/assurance/active-task-binding-a1.test.mjs"] });
  assert.deepEqual(
    verifyArchitectureMaintenanceAuthority({ ...omitted, allComments: [omitted.raw], paginationComplete: true, ancestryVerified: true, noCompetingDomainOwner: false }).findings,
    ["OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_INVALID:currentTruthCompanion"],
  );
  const substituted = currentTruthCompanionV2Fixture({ mutateSubject: (subject) => { subject.currentTruthCompanion.currentTruth.sha256 = "0".repeat(64); } });
  assert.deepEqual(
    verifyArchitectureMaintenanceAuthority({ ...substituted, allComments: [substituted.raw], paginationComplete: true, ancestryVerified: true, noCompetingDomainOwner: false }).findings,
    ["OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_INVALID:currentTruthCompanion"],
  );
  assert.throws(() => architectureMaintenanceSubject({
    identity: { ...omitted.identity, pr: 237, baseSha: "f".repeat(40) },
    tree: omitted.tree,
    scope: omitted.scope,
    profile: "OWNER_JURISDICTION_CANONICAL_MODEL_V2",
  }), /AUTHORITY_CONTROL_CURRENT_TRUTH_COMPANION_INVALID/u);
});

test("active-task correction maintenance 08: final-source lifecycle carries the exact V2 companion", () => {
  const fixture = currentTruthCompanionV2Fixture();
  const reviewSubject = architectureRepositoryReviewSubject(fixture);
  const reviewRaw = {
    ...fixture.raw,
    id: 800002,
    node_id: "IC_authority_companion_review",
    body: architectureRepositoryReviewCommentBody(reviewSubject),
    html_url: `https://github.com/Chillywood2025/chillywood-mobile/pull/${fixture.identity.pr}#issuecomment-800002`,
  };
  const phase1Evidence = { runId: 400001, runAttempt: 1, sourceHead: fixture.identity.headSha, sourceTree: fixture.tree, requiredJobs: 13, passedJobs: 13, result: "PASS_13_OF_13", evidenceHash: "d".repeat(64), valid: true };
  const finalSubject = architectureFinalSourceSubject({ ...fixture, originalRaw: fixture.raw, repositoryReviewRaw: reviewRaw, phase1Evidence });
  assert.deepEqual(finalSubject.currentTruthCompanion, fixture.subject.currentTruthCompanion);
  const finalRaw = {
    ...fixture.raw,
    id: 800003,
    node_id: "IC_authority_companion_final",
    body: architectureFinalSourceOwnerCommentBody(finalSubject),
    html_url: `https://github.com/Chillywood2025/chillywood-mobile/pull/${fixture.identity.pr}#issuecomment-800003`,
  };
  const result = verifyArchitectureMaintenanceAuthority({
    ...fixture,
    allComments: [fixture.raw, reviewRaw, finalRaw],
    paginationComplete: true,
    ancestryVerified: true,
    noCompetingDomainOwner: false,
    phase1EvidenceResolver: () => phase1Evidence,
  });
  assert.equal(result.mergeEligible, true, [...(result.findings ?? []), ...(result.mergeFindings ?? [])].join(","));
});

test("active-task correction maintenance 09: immutable companion verification ignores later working-tree truth", () => {
  const fixture = currentTruthCompanionV2Fixture();
  const temporaryParent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "authority-companion-history-"));
  const clonedRoot = path.join(temporaryParent, "repository");
  try {
    assert.equal(spawnSync("git", ["clone", "--quiet", "--local", process.cwd(), clonedRoot], { encoding: "utf8" }).status, 0);
    fs.writeFileSync(path.join(clonedRoot, "config/assurance/current-truth-v1.json"), "{}\n");
    fs.writeFileSync(path.join(clonedRoot, "CURRENT_STATE.md"), "later current state\n");
    fs.writeFileSync(path.join(clonedRoot, "NEXT_TASK.md"), "later next task\n");
    const result = verifyArchitectureMaintenanceAuthority({ ...fixture, allComments: [fixture.raw], paginationComplete: true, ancestryVerified: true, noCompetingDomainOwner: false, root: clonedRoot });
    assert.equal(result.authorizationOk, true, result.findings?.join(","));
    assert.equal(result.checks.currentTruthCompanion, true);
  } finally {
    fs.rmSync(temporaryParent, { recursive: true, force: true });
  }
});
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
const historicalSyntheticMergeHead = "b".repeat(40);
const historicalRepository = "Chillywood2025/chillywood-mobile";
const historicalPullRequest = { number: 214, state: "open", draft: false, merge_commit_sha: historicalSyntheticMergeHead, head: { ref: pr214Lease.implementationBranch, sha: f252Head, repo: { full_name: historicalRepository } }, base: { ref: "main", sha: protectedMain, repo: { full_name: historicalRepository } } };
const historicalEvent = { action: "synchronize", number: 214, repository: { full_name: historicalRepository }, pull_request: { ...historicalPullRequest, html_url: `https://github.com/${historicalRepository}/pull/214` } };
const historicalEnvironment = { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request", GITHUB_REF: "refs/pull/214/merge", GITHUB_SHA: historicalSyntheticMergeHead };
const historicalRuntimeGit = (args) => {
  if (args[0] === "rev-parse" && args[1] === "HEAD") return historicalSyntheticMergeHead;
  if (args[0] === "rev-parse" && args[1] === `${historicalSyntheticMergeHead}^{tree}` || args[0] === "merge-tree") return f252Tree;
  if (args[0] === "show" && args[1] === "-s" && args[2] === "--format=%P" && args[3] === historicalSyntheticMergeHead) return `${protectedMain} ${f252Head}`;
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout.trim();
};
const runtimeAtF252 = (now = new Date("2026-08-11T22:00:00Z")) => evaluateFiniteTaskLeaseRuntime({
  record: historicalPr214Truth,
  contract: currentTruthContract,
  now,
  currentProtectedBase: protectedMain,
  githubEvent: historicalEvent,
  checkoutHead: historicalSyntheticMergeHead,
  gitCommand: historicalRuntimeGit,
  environment: historicalEnvironment,
  effectiveReservationObservation: { comments: [], commentsPaginationComplete: true, pullRequest: historicalPullRequest, commits: [], commitsPaginationComplete: true, requireCompleteDiscovery: false, observationMode: "SYNTHETIC_NO_WRITE" }
});
const historicalExecutionIdentity = ({ event = historicalEvent, live = historicalPullRequest, environment = historicalEnvironment, checkout = historicalSyntheticMergeHead, parents = [live.base.sha, live.head.sha], mergeTree = f252Tree, expectedTree = f252Tree, sourceTree = f252Tree, identity = { repository: historicalRepository, pr: 214, branch: pr214Lease.implementationBranch, headSha: f252Head, baseRef: "main", baseSha: protectedMain } } = {}) => classifyGitHubExecutionIdentity({ event, livePullRequest: live, authoritativeSourceIdentity: identity, checkoutHead: checkout, environment, gitCommand: (args) => args[0] === "rev-parse" && args[1] === "HEAD" ? checkout : args[0] === "rev-parse" && args[1] === `${identity.headSha}^{tree}` ? sourceTree : args[0] === "rev-parse" && args[1] === `${live.merge_commit_sha}^{tree}` ? mergeTree : args[0] === "rev-parse" ? mergeTree : args[0] === "show" ? parents.join(" ") : args[0] === "merge-tree" ? expectedTree : "" });
const pullRequestCandidate = (overrides = {}) => finiteCandidate(pr214Lease, 400, {
  head: f252Head,
  tree: f252Tree,
  observationSource: "GITHUB_PULL_REQUEST_EVENT",
  currentProtectedBase: protectedMain,
  eventBase: protectedMain,
  executionIdentity: historicalExecutionIdentity(),
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

test("finite runtime matrix 19-23: malformed, wrong-parent, wrong-tree, and octopus executions fail through the shared identity model", () => {
  for (const executionIdentity of [historicalExecutionIdentity({ parents: [protectedMain] }), historicalExecutionIdentity({ parents: ["a".repeat(40), f252Head] }), historicalExecutionIdentity({ parents: [protectedMain, "a".repeat(40)] }), historicalExecutionIdentity({ mergeTree: "a".repeat(40) }), historicalExecutionIdentity({ parents: [protectedMain, f252Head, "a".repeat(40)] })]) assert.ok(evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: pullRequestCandidate({ executionIdentity }) }).findings.includes("FINITE_TASK_GITHUB_EXECUTION_IDENTITY_INVALID"));
});

test("GitHub PR source/execution classifier permanently separates authority from exact merge-ref execution", () => {
  const cloneEvent = () => structuredClone(historicalEvent); const clonePull = () => structuredClone(historicalPullRequest); const exactHead = historicalExecutionIdentity({ checkout: f252Head }); const exactMerge = historicalExecutionIdentity();
  assert.deepEqual([exactHead.ok, exactHead.eventType, exactMerge.ok, exactMerge.eventType, exactMerge.authoritativeSource.headSha === f252Head, exactMerge.execution.sha !== f252Head], [true, "PULL_REQUEST_HEAD_CHECKOUT", true, "PULL_REQUEST_MERGE_REF", true, true]);
  const wrongHead = cloneEvent(); wrongHead.pull_request.head.sha = "c".repeat(40); const wrongBase = cloneEvent(); wrongBase.pull_request.base.sha = "d".repeat(40); const wrongLiveHead = clonePull(); wrongLiveHead.head.sha = "e".repeat(40); const wrongLiveBase = clonePull(); wrongLiveBase.base.sha = "f".repeat(40); const wrongPr = cloneEvent(); wrongPr.number = wrongPr.pull_request.number = 215; const wrongRepo = cloneEvent(); wrongRepo.repository.full_name = "attacker/repository"; const wrongDraft = clonePull(); wrongDraft.draft = true; const wrongMerge = cloneEvent(); wrongMerge.pull_request.merge_commit_sha = "9".repeat(40); const missingMerge = cloneEvent(); delete missingMerge.pull_request.merge_commit_sha; const movedLiveMerge = clonePull(); movedLiveMerge.merge_commit_sha = "8".repeat(40); const otherEvent = cloneEvent(); otherEvent.number = otherEvent.pull_request.number = 215; const otherPull = clonePull(); otherPull.number = 215; const otherExecution = historicalExecutionIdentity({ event: otherEvent, live: otherPull, identity: { repository: historicalRepository, pr: 215, branch: pr214Lease.implementationBranch, headSha: f252Head, baseRef: "main", baseSha: protectedMain } });
  const invalid = [historicalExecutionIdentity({ parents: [protectedMain, "0".repeat(40)] }), historicalExecutionIdentity({ checkout: "1".repeat(40) }), historicalExecutionIdentity({ event: wrongHead }), historicalExecutionIdentity({ event: wrongBase }), historicalExecutionIdentity({ live: wrongLiveHead }), historicalExecutionIdentity({ live: wrongLiveBase }), historicalExecutionIdentity({ event: wrongPr }), historicalExecutionIdentity({ event: wrongRepo }), historicalExecutionIdentity({ live: wrongDraft }), historicalExecutionIdentity({ environment: { ...historicalEnvironment, GITHUB_REF: "refs/pull/999/merge" } }), historicalExecutionIdentity({ environment: { ...historicalEnvironment, GITHUB_ACTIONS: "false" } }), historicalExecutionIdentity({ environment: { ...historicalEnvironment, GITHUB_EVENT_NAME: "workflow_dispatch" } })];
  assert.equal(invalid.every(({ ok }) => !ok) && historicalExecutionIdentity({ event: missingMerge }).ok && historicalExecutionIdentity({ event: wrongMerge }).ok && historicalExecutionIdentity({ live: movedLiveMerge }).ok && evaluateFiniteTaskCandidate({ lease: pr214Lease, registry: finiteRegistry, candidate: pullRequestCandidate({ executionIdentity: otherExecution }) }).findings.includes("FINITE_TASK_GITHUB_EXECUTION_IDENTITY_INVALID"), true);
  const movedBase = "2".repeat(40); const movedMerge = "3".repeat(40); const movedTree = "4".repeat(40); const movedPull = clonePull(); Object.assign(movedPull, { merge_commit_sha: movedMerge }); movedPull.base.sha = movedBase; const movedEvent = cloneEvent(); Object.assign(movedEvent.pull_request, movedPull); const movedIdentity = { repository: historicalRepository, pr: 214, branch: pr214Lease.implementationBranch, headSha: f252Head, baseRef: "main", baseSha: movedBase }; const movedEnvironment = { ...historicalEnvironment, GITHUB_SHA: movedMerge };
  const moved = historicalExecutionIdentity({ event: movedEvent, live: movedPull, identity: movedIdentity, environment: movedEnvironment, checkout: movedMerge, parents: [movedBase, f252Head], mergeTree: movedTree, expectedTree: movedTree }); const stale = historicalExecutionIdentity({ event: movedEvent, live: movedPull, identity: movedIdentity, environment: historicalEnvironment, parents: [protectedMain, f252Head], mergeTree: f252Tree, expectedTree: movedTree }); const readyEvent = cloneEvent(); readyEvent.action = "ready_for_review"; const staleReady = cloneEvent(); staleReady.action = "ready_for_review"; staleReady.pull_request.draft = true;
  assert.deepEqual([moved.ok, moved.authoritativeSource.headSha, moved.execution.sha, stale.ok, historicalExecutionIdentity({ event: readyEvent }).ok, historicalExecutionIdentity({ event: staleReady, live: staleReady.pull_request }).ok], [true, f252Head, movedMerge, false, true, false]);
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

const wave1Lease = finiteTaskLeaseFor(canonicalTruth.finiteTaskLeases, {
  implementationPr: 229,
  implementationBranch: "codex/pre-release-identity-entitlement-authority-v1",
  featureId: "auth-session-password-recovery"
});
const wave1BoundBase = "1".repeat(40);
const wave1BoundBaseTree = "2".repeat(40);
const wave1BoundStart = "3".repeat(40);
const wave1BoundStartTree = "4".repeat(40);
const wave1Descendant = "5".repeat(40);
const wave1DescendantTree = "6".repeat(40);
const wave1AdvancedBase = "8".repeat(40);
const wave1AdvancedBaseTree = "9".repeat(40);
const wave1AddedPaths = ["_lib/accessEntitlements.ts", "_lib/roomRules.ts"];
const wave1AuthorityEvidence = {
  taskArtifactHash: wave1Lease.closure.artifactHash,
  ownerApproval: structuredClone(wave1Lease.ownerApproval),
  jurisdictionDecision: {
    commentId: canonicalTruth.ownerJurisdictionPolicyBinding.policySource.commentId,
    subjectHash: canonicalTruth.ownerJurisdictionPolicyBinding.policySource.subjectHash,
    bodyHash: canonicalTruth.ownerJurisdictionPolicyBinding.policySource.bodyHash,
    envelopeHash: canonicalTruth.ownerJurisdictionPolicyBinding.policySource.envelopeHash
  }
};
const wave1AmendmentSubject = (overrides = {}) => taskLeaseAmendmentSubject({
  schemaVersion: 2,
  policyId: "ASSURANCE_FINITE_TASK_LEASE_AMENDMENT_V2",
  repository: "Chillywood2025/chillywood-mobile",
  pr: 229,
  branch: wave1Lease.implementationBranch,
  taskId: wave1Lease.leaseId,
  leaseId: wave1Lease.leaseId,
  domain: wave1Lease.domain,
  baseLeaseHash: digest(stableJson(wave1Lease)),
  boundStartingBaseHead: wave1BoundBase,
  boundStartingBaseTree: wave1BoundBaseTree,
  boundStartingHead: wave1BoundStart,
  boundStartingTree: wave1BoundStartTree,
  taskArtifactHash: wave1Lease.closure.artifactHash,
  ownerApproval: structuredClone(wave1Lease.ownerApproval),
  jurisdictionDecision: structuredClone(wave1AuthorityEvidence.jurisdictionDecision),
  addedPaths: wave1AddedPaths,
  pathReasons: [
    { path: "_lib/accessEntitlements.ts", reason: "Add entitlement_unknown to AccessReason and preserve honest fail-closed block-source rendering." },
    { path: "_lib/roomRules.ts", reason: "Add entitlement_unknown to RoomAccessReason; the runtime result is assigned directly to this closed union." }
  ],
  affectedDefect: "WAPR-P1-PREMIUM-UNKNOWN-004",
  affectedInvariants: ["W1-I-13", "W1-I-14", "W1-I-19", "W1-I-20", "W1-I-32"],
  effectiveReservation: { eligiblePathCount: 32, maximumFiles: 32, maximumLines: 4500 },
  amendmentUse: { consumed: 1, maximum: 1 },
  applicability: { exactTaskOnly: true, nonReusable: true },
  authority: { providerMutation: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false },
  ...overrides
});
const wave1Candidate = (overrides = {}) => ({
  pr: 229,
  branch: wave1Lease.implementationBranch,
  prState: "open",
  head: wave1Descendant,
  tree: wave1DescendantTree,
  scopeBase: wave1BoundBase,
  changedPaths: [...wave1Lease.allowedPaths, ...wave1AddedPaths].sort(),
  changedLines: 4500,
  ...overrides
});
const wave1Git = ({ descendant = true, mergeBase = wave1BoundBase, startingPaths = [wave1Lease.artifactReservation.closureArtifactPath], startingLines = 1 } = {}) => (gitArgs) => {
  if (gitArgs[0] === "rev-parse") {
    const trees = new Map([
      [`${wave1BoundBase}^{tree}`, wave1BoundBaseTree],
      [`${wave1BoundStart}^{tree}`, wave1BoundStartTree],
      [`${wave1Descendant}^{tree}`, wave1DescendantTree]
    ]);
    if (trees.has(gitArgs[1])) return trees.get(gitArgs[1]);
  }
  if (gitArgs[0] === "merge-base" && gitArgs[1] === "--is-ancestor" && descendant) return "";
  if (gitArgs[0] === "merge-base" && gitArgs[1] !== "--is-ancestor") return mergeBase;
  if (gitArgs[0] === "diff" && gitArgs[1] === "--name-only") return startingPaths.join("\n");
  if (gitArgs[0] === "diff" && gitArgs[1] === "--numstat") return `${startingLines}\t0\t${startingPaths[0]}`;
  throw new Error("synthetic git rejection");
};
function wave1AmendmentResolution({ subject = wave1AmendmentSubject(), candidate = wave1Candidate(), raw = {}, resolver = {}, gitOptions = {} } = {}) {
  const comment = {
    id: 810001,
    user: { login: "Chillywood2025" },
    author_association: "OWNER",
    created_at: "2026-08-14T22:00:00Z",
    updated_at: "2026-08-14T22:00:00Z",
    issue_url: "https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/229",
    body: taskLeaseAmendmentCommentBody(subject),
    ...raw
  };
  return resolveFiniteTaskEffectiveReservation({
    registry: canonicalTruth.finiteTaskLeases,
    lease: wave1Lease,
    candidate,
    comments: [comment],
    commentsPaginationComplete: true,
    pullRequest: {
      number: 229,
      state: "open",
      head: { ref: wave1Lease.implementationBranch, sha: candidate.head, repo: { full_name: "Chillywood2025/chillywood-mobile" } },
      base: { sha: wave1BoundBase, repo: { full_name: "Chillywood2025/chillywood-mobile" } }
    },
    commits: [
      { sha: wave1BoundStart, commit: { tree: { sha: wave1BoundStartTree } } },
      { sha: candidate.head, commit: { tree: { sha: candidate.tree } } }
    ],
    commitsPaginationComplete: true,
    gitCommand: wave1Git(gitOptions),
    requireCompleteDiscovery: true,
    authorityEvidence: wave1AuthorityEvidence,
    ...resolver
  });
}

const wave1FixturePath = "supabase/tests/revenuecat_atomic_transactions_test.sql";
const wave1FixtureBaselineText = "begin;\nselect plan(62);\n-- unchanged direct creator purchase-intent fixture\nrollback;\n";
const wave1FixtureCandidateText = "begin;\nselect plan(62);\n-- adapted creator eligibility fixture\nrollback;\n";
const wave1GitBlobOid = (text) => {
  const bytes = Buffer.from(text);
  return createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex");
};
const wave1FixtureBaselineBlob = wave1GitBlobOid(wave1FixtureBaselineText);
const wave1FixtureCandidateBlob = wave1GitBlobOid(wave1FixtureCandidateText);
const wave1TaskArtifactPath = wave1Lease.artifactReservation.closureArtifactPath;
const wave1TaskArtifactText = spawnSync("git", ["show", `14e6d3a05bc4110712f88de11c76968cb610dae1:${wave1TaskArtifactPath}`], { encoding: "utf8" }).stdout;
assert.equal(digest(wave1TaskArtifactText), wave1Lease.closure.artifactHash);
const wave1TaskArtifactBlob = wave1GitBlobOid(wave1TaskArtifactText);
const wave1FixtureBaselineSha256 = digest(wave1FixtureBaselineText);
const wave1ImplementationPaths = [...wave1Lease.allowedPaths, ...wave1AddedPaths].sort();
const wave1OverlayPaths = [...wave1ImplementationPaths, wave1FixturePath].sort();
const wave1TestAdaptationAuthority = { providerMutation: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false };
const wave1Reservation = (paths, maximumFiles, maximumLines) => {
  const allowedPaths = [...new Set(paths)].sort();
  const projection = { allowedPaths, pathGlobs: allowedPaths, maximumFiles, maximumLines, eligiblePathCount: allowedPaths.length };
  return { ...projection, reservationHash: digest(stableJson(projection)) };
};
const wave1PartitionRows = ({ implementationLines = 4500, fixtureLines = 500, fixturePath = wave1FixturePath } = {}) => {
  const minimumImplementationLines = Math.max(0, wave1ImplementationPaths.length - 1);
  return [
    ...wave1ImplementationPaths.map((file, index) => `${index === 0 ? Math.max(0, implementationLines - minimumImplementationLines) : implementationLines > minimumImplementationLines ? 1 : 0}\t0\t${file}`),
    `${fixtureLines}\t0\t${fixturePath}`
  ].join("\n");
};
const wave1OverlayGit = ({
  candidate = wave1Candidate({ changedPaths: wave1OverlayPaths, changedLines: 5000 }),
  currentBase = wave1BoundBase,
  currentBaseTree = currentBase === wave1BoundBase ? wave1BoundBaseTree : wave1AdvancedBaseTree,
  candidateNumstat = wave1PartitionRows(),
  startingPaths = [wave1Lease.artifactReservation.closureArtifactPath],
  startingLines = 1,
  baselineText = wave1FixtureBaselineText,
  baselineBlob = wave1FixtureBaselineBlob,
  startBlob = wave1FixtureBaselineBlob,
  candidateFixtureText = wave1FixtureCandidateText,
  candidateFixtureBlob = wave1FixtureCandidateBlob,
  candidateFixturePresent = true,
  candidateFixtureMode = "100644",
  currentBaseFixtureBlob = wave1FixtureBaselineBlob,
  taskArtifactText = wave1TaskArtifactText,
  taskArtifactBlob = wave1TaskArtifactBlob,
  taskArtifactPresent = true,
  taskArtifactMode = "100644",
  startDescends = true,
  candidateDescends = true,
  candidateDescendsCurrentBase = true,
  protectedMainTree = wave1BoundBaseTree,
  boundStartingTree = wave1BoundStartTree,
  candidateTree = candidate.tree
} = {}) => (gitArgs) => {
  const startingRange = `${wave1BoundBase}...${wave1BoundStart}`;
  const candidateRange = `${currentBase}...${candidate.head}`;
  if (gitArgs[0] === "rev-parse") {
    const trees = new Map([
      [`${currentBase}^{tree}`, currentBaseTree],
      [`${wave1BoundBase}^{tree}`, protectedMainTree],
      [`${wave1BoundStart}^{tree}`, boundStartingTree],
      [`${candidate.head}^{tree}`, candidateTree],
      [`${currentBase}:${wave1FixturePath}`, currentBaseFixtureBlob],
      [`${wave1BoundBase}:${wave1FixturePath}`, baselineBlob],
      [`${wave1BoundStart}:${wave1FixturePath}`, startBlob],
    ]);
    if (trees.has(gitArgs[1])) return trees.get(gitArgs[1]);
  }
  if (gitArgs[0] === "merge-base" && gitArgs[1] === "--is-ancestor") {
    const [, , ancestor, descendant] = gitArgs;
    if (ancestor === wave1BoundBase && descendant === wave1BoundStart && startDescends) return "";
    if (ancestor === wave1BoundBase && [wave1BoundBase, currentBase].includes(descendant)) return "";
    if (ancestor === wave1BoundStart && descendant === candidate.head && candidateDescends) return "";
    if (ancestor === currentBase && descendant === candidate.head && candidateDescendsCurrentBase) return "";
    throw new Error("synthetic non-descendant");
  }
  if (gitArgs[0] === "merge-base") return wave1BoundBase;
  if (gitArgs[0] === "diff" && gitArgs[1] === "--name-only") {
    if (gitArgs.at(-1) === startingRange) return startingPaths.join("\n");
    if (gitArgs.at(-1) === candidateRange) return candidate.changedPaths.join("\n");
  }
  if (gitArgs[0] === "diff" && gitArgs[1] === "--numstat") {
    if (gitArgs.at(-1) === startingRange) return `${startingLines}\t0\t${startingPaths[0]}`;
    if (gitArgs.at(-1) === candidateRange) return candidateNumstat;
  }
  if (gitArgs[0] === "ls-tree" && gitArgs[1] === wave1BoundBase && gitArgs.at(-1) === wave1FixturePath) return `100644 blob ${baselineBlob}\t${wave1FixturePath}`;
  if (gitArgs[0] === "ls-tree" && gitArgs[1] === candidate.head && gitArgs.at(-1) === wave1FixturePath) return candidateFixturePresent ? `${candidateFixtureMode} blob ${candidateFixtureBlob}\t${wave1FixturePath}` : "";
  if (gitArgs[0] === "ls-tree" && gitArgs[1] === wave1BoundStart && gitArgs.at(-1) === wave1TaskArtifactPath) return taskArtifactPresent ? `${taskArtifactMode} blob ${taskArtifactBlob}\t${wave1TaskArtifactPath}` : "";
  if (gitArgs[0] === "show" && gitArgs[1] === `${wave1BoundBase}:${wave1FixturePath}`) return baselineText;
  if (gitArgs[0] === "show" && gitArgs[1] === `${candidate.head}:${wave1FixturePath}` && candidateFixturePresent) return candidateFixtureText;
  if (gitArgs[0] === "show" && gitArgs[1] === `${wave1BoundStart}:${wave1TaskArtifactPath}` && taskArtifactPresent) return taskArtifactText;
  if (gitArgs[0] === "cat-file" && gitArgs[1] === "-s" && gitArgs[2] === baselineBlob) return String(Buffer.byteLength(baselineText));
  if (gitArgs[0] === "cat-file" && gitArgs[1] === "-s" && gitArgs[2] === candidateFixtureBlob) return String(Buffer.byteLength(candidateFixtureText));
  if (gitArgs[0] === "cat-file" && gitArgs[1] === "-s" && gitArgs[2] === taskArtifactBlob) return String(Buffer.byteLength(taskArtifactText));
  throw new Error(`unexpected overlay git command: ${gitArgs.join(" ")}`);
};
const wave1TestAdaptationSubject = ({ amendmentReceipt, implementationReservation, overrides = {} } = {}) => {
  const fixtureReservation = wave1Reservation([wave1FixturePath], 1, 500);
  return finiteTaskTestAdaptationSubject({
    schemaVersion: 1,
    policyId: canonicalTruth.finiteTaskLeases.testAdaptationPolicy.policyId,
    capability: canonicalTruth.finiteTaskLeases.testAdaptationPolicy.capability,
    classification: canonicalTruth.finiteTaskLeases.testAdaptationPolicy.classification,
    repository: "Chillywood2025/chillywood-mobile",
    implementationPr: wave1Lease.implementationPr,
    implementationBranch: wave1Lease.implementationBranch,
    taskId: wave1Lease.leaseId,
    leaseId: wave1Lease.leaseId,
    baseLeaseHash: digest(stableJson(wave1Lease)),
    amendmentReceipt,
    boundStartingHead: wave1BoundStart,
    boundStartingTree: wave1BoundStartTree,
    protectedMainHead: wave1BoundBase,
    protectedMainTree: wave1BoundBaseTree,
    taskArtifactHash: wave1Lease.closure.artifactHash,
    fixturePaths: [wave1FixturePath],
    fixtureBaselines: [{ path: wave1FixturePath, blob: wave1FixtureBaselineBlob, sha256: wave1FixtureBaselineSha256, plan: "plan(62)" }],
    fixtureBudget: { maximumFiles: 1, maximumCanonicalLines: 500 },
    implementationPartition: implementationReservation,
    aggregateProjection: wave1Reservation([...implementationReservation.allowedPaths, ...fixtureReservation.allowedPaths], 33, 5000),
    causalClassification: {
      classification: "TEST_ADAPTATION_REQUIRED",
      unchangedFixtureFailedUnderStricterCorrectGate: true,
      productionGateIndependentlyReviewed: true,
      fixtureAdaptationSufficient: true,
      productionWeakeningAllowed: false,
      failureCode: "42501",
      failureMessage: "creator_eligibility_required"
    },
    causativePaths: ["supabase/migrations/202608140001_wave1_identity_entitlement_authority.sql"],
    affectedDefect: "WAPR-CM-P1-CREATOR-ELIGIBILITY-014",
    affectedInvariants: ["W1-I-25", "W1-I-27", "W1-I-29"],
    causalEntitySets: [
      {
        kind: "creator",
        ids: [
          "65555555-5555-5555-5555-555555555555",
          "75555555-5555-5555-5555-555555555555",
          "95555555-5555-5555-5555-555555555555"
        ]
      },
      {
        kind: "purchase_intent",
        ids: [
          "60000000-0000-0000-0000-000000000001",
          "61000000-0000-0000-0000-000000000001",
          "70000000-0000-0000-0000-000000000001",
          "90000000-0000-0000-0000-000000000001"
        ]
      }
    ],
    ownerIdentity: { login: "Chillywood2025", association: "OWNER" },
    immutability: { immutableCommentRequired: true, createdAtEqualsUpdatedAtRequired: true },
    applicability: { exactTaskOnly: true, descendantOnly: true, expiresAtTaskTerminal: true, reusableByAnotherTaskOrPr: false },
    authority: wave1TestAdaptationAuthority,
    ...overrides
  });
};
function wave1TestAdaptationResolution({
  candidate = wave1Candidate({ changedPaths: wave1OverlayPaths, changedLines: 5000 }),
  currentBase = wave1BoundBase,
  subjectOverrides = {},
  mutateSubject = () => {},
  adaptationRaw = {},
  mutateComments = () => {},
  resolver = {},
  gitOptions = {}
} = {}) {
  const amendment = wave1AmendmentResolution();
  assert.equal(amendment.ok, true, stableJson(amendment.findings));
  const subject = wave1TestAdaptationSubject({ amendmentReceipt: amendment.amendmentReceipt, implementationReservation: amendment.effectiveReservation, overrides: subjectOverrides });
  mutateSubject(subject);
  const amendmentComment = {
    id: 810001,
    user: { login: "Chillywood2025" },
    author_association: "OWNER",
    created_at: "2026-08-14T22:00:00Z",
    updated_at: "2026-08-14T22:00:00Z",
    issue_url: "https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/229",
    body: taskLeaseAmendmentCommentBody(wave1AmendmentSubject())
  };
  const adaptationComment = {
    id: 810101,
    user: { login: "Chillywood2025" },
    author_association: "OWNER",
    created_at: "2026-08-15T00:00:00Z",
    updated_at: "2026-08-15T00:00:00Z",
    issue_url: "https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/229",
    body: finiteTaskTestAdaptationCommentBody(subject),
    ...adaptationRaw
  };
  const comments = [amendmentComment, adaptationComment];
  mutateComments(comments, { amendmentComment, adaptationComment, subject });
  const commits = [
    { sha: wave1BoundStart, commit: { tree: { sha: wave1BoundStartTree } } },
    { sha: candidate.head, commit: { tree: { sha: candidate.tree } } }
  ];
  const gitCommand = wave1OverlayGit({ candidate, currentBase, ...gitOptions });
  const result = resolveFiniteTaskEffectiveReservation({
    registry: canonicalTruth.finiteTaskLeases,
    lease: wave1Lease,
    candidate,
    comments,
    commentsPaginationComplete: true,
    pullRequest: {
      number: 229,
      state: "open",
      head: { ref: wave1Lease.implementationBranch, sha: candidate.head, repo: { full_name: "Chillywood2025/chillywood-mobile" } },
      base: { sha: currentBase, repo: { full_name: "Chillywood2025/chillywood-mobile" } }
    },
    commits,
    commitsPaginationComplete: true,
    gitCommand,
    requireCompleteDiscovery: true,
    authorityEvidence: wave1AuthorityEvidence,
    ...resolver
  });
  return { result, subject, candidate, amendment, comments, commits, gitCommand };
}

const wave1ImmutableComment = (id, body, createdAt) => ({
  id,
  node_id: `IC_wave1_test_adaptation_${id}`,
  user: { login: "Chillywood2025" },
  author_association: "OWNER",
  created_at: createdAt,
  updated_at: createdAt,
  issue_url: "https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/229",
  html_url: `https://github.com/Chillywood2025/chillywood-mobile/pull/229#issuecomment-${id}`,
  body
});

function observeWave1TestAdaptationLive({ comments, candidate, currentBase = wave1BoundBase, pullRequestOverrides = {} }) {
  const pullRequest = {
    number: wave1Lease.implementationPr,
    state: "open",
    head: { ref: wave1Lease.implementationBranch, sha: candidate.head, repo: { full_name: "Chillywood2025/chillywood-mobile" } },
    base: { ref: "main", sha: currentBase, repo: { full_name: "Chillywood2025/chillywood-mobile" } },
    ...pullRequestOverrides,
  };
  const commits = [
    { sha: wave1BoundStart, commit: { tree: { sha: wave1BoundStartTree } } },
    { sha: candidate.head, commit: { tree: { sha: candidate.tree } } }
  ];
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "finite-task-test-adaptation-live-"));
  const fakeGh = path.join(temporary, "gh");
  const commentsOutput = JSON.stringify([comments]);
  const commitsOutput = JSON.stringify([commits]);
  const pullOutput = JSON.stringify(pullRequest);
  fs.writeFileSync(fakeGh, `#!/usr/bin/env node\nconst endpoint = process.argv.at(-1);\nif (endpoint.includes("/comments?")) process.stdout.write(${JSON.stringify(commentsOutput)});\nelse if (endpoint.includes("/commits?")) process.stdout.write(${JSON.stringify(commitsOutput)});\nelse process.stdout.write(${JSON.stringify(pullOutput)});\n`);
  fs.chmodSync(fakeGh, 0o755);
  const originalPath = process.env.PATH;
  let liveObservation;
  try {
    process.env.PATH = `${temporary}:${originalPath}`;
    liveObservation = observeLiveFiniteTaskEffectiveReservation({
      repository: "Chillywood2025/chillywood-mobile",
      pr: wave1Lease.implementationPr,
      authorityEvidence: wave1AuthorityEvidence
    });
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  return { liveObservation, pullRequest, commits };
}

function wave1CurrentValidLifecycleFixture({
  candidate = wave1Candidate({
    changedPaths: wave1OverlayPaths,
    changedLines: 5000,
    diffHash: "a".repeat(64),
    changedPathHash: digest(stableJson(wave1OverlayPaths)),
  }),
  currentBase = wave1BoundBase,
  historicalEvidence = () => [],
  includeCurrentReview = true,
  includeCurrentFinal = true,
  commentsPaginationComplete = true,
  reviewId = 820201,
  finalId = 820202,
  reviewCreatedAt = "2026-08-15T01:00:00Z",
  finalCreatedAt = "2026-08-15T01:01:00Z",
} = {}) {
  const gitCommand = wave1OverlayGit({ candidate, currentBase });
  const implementationCandidate = { ...candidate, changedPaths: wave1ImplementationPaths, changedLines: 4500 };
  const implementationGitCommand = wave1OverlayGit({ candidate: implementationCandidate, currentBase });
  const amendmentComment = wave1ImmutableComment(810001, taskLeaseAmendmentCommentBody(wave1AmendmentSubject()), "2026-08-14T22:00:00Z");
  const amendmentLive = observeWave1TestAdaptationLive({ comments: [amendmentComment], candidate: implementationCandidate, currentBase });
  const amendmentResolution = resolveFiniteTaskEffectiveReservation({
    registry: canonicalTruth.finiteTaskLeases,
    lease: wave1Lease,
    candidate: implementationCandidate,
    liveObservation: amendmentLive.liveObservation,
    gitCommand: implementationGitCommand,
  });
  assert.equal(amendmentResolution.status, "AMENDED", stableJson(amendmentResolution.findings));
  const adaptationSubject = wave1TestAdaptationSubject({
    amendmentReceipt: amendmentResolution.amendmentReceipt,
    implementationReservation: amendmentResolution.effectiveReservation,
  });
  const adaptationComment = wave1ImmutableComment(810101, finiteTaskTestAdaptationCommentBody(adaptationSubject), "2026-08-15T00:00:00Z");
  const reservationLive = observeWave1TestAdaptationLive({ comments: [amendmentComment, adaptationComment], candidate, currentBase });
  const initialResolution = resolveFiniteTaskEffectiveReservation({
    registry: canonicalTruth.finiteTaskLeases,
    lease: wave1Lease,
    candidate,
    liveObservation: reservationLive.liveObservation,
    gitCommand,
  });
  assert.equal(initialResolution.status, "AMENDED_WITH_TEST_ADAPTATION", stableJson(initialResolution.findings));
  assert.equal(finiteTaskEffectiveReservationAuthorityValid(initialResolution), true);
  const identity = {
    repository: "Chillywood2025/chillywood-mobile",
    pr: wave1Lease.implementationPr,
    branch: wave1Lease.implementationBranch,
    baseSha: currentBase,
    headSha: candidate.head,
  };
  const scope = { files: candidate.changedPaths, additions: 2500, deletions: 2500, netChangedLines: 0, diffHash: candidate.diffHash };
  const reviewSubject = architectureRepositoryReviewSubject({
    identity,
    tree: candidate.tree,
    scope,
    profile: FINITE_TASK_IMPLEMENTATION_EFFECTIVE_RESERVATION_V1,
    effectiveReservationResolution: initialResolution,
  });
  const phaseBody = { runId: 900201, sourceHead: candidate.head, sourceTree: candidate.tree, result: "PASS_13_OF_13" };
  const phase1Evidence = { ...phaseBody, valid: true, evidenceHash: hashValue(phaseBody) };
  const finalSubject = finiteTaskFinalReceiptSubject({
    schemaVersion: 3,
    policyId: "ASSURANCE_FINITE_TASK_LEASE_V1",
    repository: identity.repository,
    featureId: wave1Lease.featureId,
    implementationPr: wave1Lease.implementationPr,
    implementationBranch: wave1Lease.implementationBranch,
    admittedSeedHead: wave1Lease.admittedSeedHead,
    finalHead: candidate.head,
    finalTree: candidate.tree,
    diffHash: candidate.diffHash,
    changedPathHash: candidate.changedPathHash,
    scopeResult: "PASS",
    callDomainClosureLedgerHash: "b".repeat(64),
    focusedTestHash: "c".repeat(64),
    mutationNegativeControlHash: "d".repeat(64),
    repositoryReviewHash: hashValue(reviewSubject),
    phase1RunId: phase1Evidence.runId,
    phase1Head: candidate.head,
    baseLeaseHash: initialResolution.baseLeaseHash,
    baseReservation: initialResolution.baseReservation,
    effectiveReservation: initialResolution.effectiveReservation,
    amendmentReceipt: initialResolution.amendmentReceipt,
    scopeBase: initialResolution.scopeBase,
    testAdaptationReservation: initialResolution.testAdaptationReservation,
    aggregateReservation: initialResolution.aggregateReservation,
    scopePartitions: initialResolution.scopePartitions,
    testAdaptationReceipt: initialResolution.testAdaptationReceipt,
    finiteTaskPrRiskAuthority: reviewSubject.finiteTaskEffectiveReservation.finiteTaskPrRiskAuthority,
    authority: wave1TestAdaptationAuthority,
  });
  const reviewReceipt = ({ id, createdAt, mutateSubject = () => {}, raw = {} }) => {
    const subject = structuredClone(reviewSubject);
    mutateSubject(subject);
    return { ...wave1ImmutableComment(id, architectureRepositoryReviewCommentBody(subject), createdAt), ...raw };
  };
  const finalReceipt = ({ id, createdAt, mutateSubject = () => {}, raw = {} }) => {
    const subject = structuredClone(finalSubject);
    mutateSubject(subject);
    return { ...wave1ImmutableComment(id, finiteTaskFinalReceiptBody(subject), createdAt), ...raw };
  };
  const currentReview = reviewReceipt({ id: reviewId, createdAt: reviewCreatedAt });
  const currentFinal = finalReceipt({ id: finalId, createdAt: finalCreatedAt });
  const retained = historicalEvidence({ currentReview, currentFinal, reviewReceipt, finalReceipt, reviewSubject, finalSubject });
  const comments = [
    amendmentComment,
    adaptationComment,
    ...retained,
    ...(includeCurrentReview ? [currentReview] : []),
    ...(includeCurrentFinal ? [currentFinal] : []),
  ];
  const finalLive = observeWave1TestAdaptationLive({ comments, candidate, currentBase });
  const resolution = resolveFiniteTaskEffectiveReservation({
    registry: canonicalTruth.finiteTaskLeases,
    lease: wave1Lease,
    candidate,
    liveObservation: finalLive.liveObservation,
    gitCommand,
  });
  assert.equal(finiteTaskEffectiveReservationAuthorityValid(resolution), true, stableJson(resolution.findings));
  const lifecycle = verifyFiniteTaskImplementationLifecycle({
    identity,
    tree: candidate.tree,
    scope,
    finiteTaskAuthority: { ok: true, candidate, baseLease: wave1Lease, effectiveReservationResolution: resolution },
    comments: finalLive.liveObservation.comments,
    commentsPaginationComplete,
    phase1EvidenceResolver: () => phase1Evidence,
  });
  registerVerifiedFiniteTaskImplementationLifecycle({ lifecycle, effectiveReservationResolution: resolution, liveObservation: finalLive.liveObservation });
  return {
    amendmentComment,
    adaptationComment,
    candidate,
    comments,
    currentFinal,
    currentReview,
    finalLive,
    finalSubject,
    gitCommand,
    identity,
    lifecycle,
    phase1Evidence,
    resolution,
    reviewSubject,
    scope,
  };
}

test("finite test-adaptation resolver: exact immutable receipt produces independent 32/4500 plus 1/500 partitions", () => {
  const { result, subject } = wave1TestAdaptationResolution();
  assert.equal(result.ok, true, stableJson(result.findings));
  assert.equal(result.status, "AMENDED_WITH_TEST_ADAPTATION");
  assert.deepEqual(result.effectiveReservation, subject.implementationPartition);
  assert.equal(result.effectiveReservation.maximumFiles, 32);
  assert.equal(result.effectiveReservation.maximumLines, 4500);
  assert.deepEqual(result.testAdaptationReservation, wave1Reservation([wave1FixturePath], 1, 500));
  assert.deepEqual(result.aggregateReservation, subject.aggregateProjection);
  assert.equal(result.aggregateReservation.maximumFiles, 33);
  assert.equal(result.aggregateReservation.maximumLines, 5000);
  assert.deepEqual(result.scopePartitions.implementation.actualPaths, wave1ImplementationPaths);
  assert.equal(result.scopePartitions.implementation.canonicalChangedLines, 4500);
  assert.deepEqual(result.scopePartitions.testAdaptation.actualPaths, [wave1FixturePath]);
  assert.equal(result.scopePartitions.testAdaptation.canonicalChangedLines, 500);
  assert.equal(result.scopePartitions.aggregate.canonicalChangedLines, 5000);
  assert.equal(result.amendmentsConsumed, 1);
  assert.equal(result.testAdaptationsConsumed, 1);
  assert.equal(result.testAdaptationReceipt.commentId, 810101);
  assert.equal(result.testAdaptationReceipt.boundStartingHead, wave1BoundStart);
  assert.equal(result.testAdaptationReceipt.boundStartingTree, wave1BoundStartTree);
  assert.deepEqual(result.testAdaptationReceipt.fixtureBaselines, subject.fixtureBaselines);
  assert.equal(result.testAdaptationReceipt.authorityClassification, "SYNTHETIC_NON_AUTHORITY");
  assert.equal(finiteTaskEffectiveReservationAuthorityValid(result), false);
  for (const hash of [result.testAdaptationReceipt.subjectHash, result.testAdaptationReceipt.bodyHash, result.testAdaptationReceipt.rawBodyHash]) assert.match(hash, /^[0-9a-f]{64}$/u);
});

test("finite test-adaptation active-task scope: only a trusted layered resolution can derive the implementation observation", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "finite-task-adapted-scope-"));
  const run = (args) => spawnSync("git", args, { cwd: temporary, encoding: "utf8", shell: false });
  try {
    assert.equal(run(["init", "--quiet"]).status, 0);
    assert.equal(run(["config", "user.name", "Assurance Test"]).status, 0);
    assert.equal(run(["config", "user.email", "assurance@example.invalid"]).status, 0);
    const implementationPath = wave1TaskArtifactPath;
    const fixtureAbsolute = path.join(temporary, wave1FixturePath);
    const implementationAbsolute = path.join(temporary, implementationPath);
    fs.mkdirSync(path.dirname(fixtureAbsolute), { recursive: true });
    fs.mkdirSync(path.dirname(implementationAbsolute), { recursive: true });
    fs.writeFileSync(fixtureAbsolute, wave1FixtureBaselineText);
    fs.writeFileSync(implementationAbsolute, "{\"baseline\":true}\n");
    assert.equal(run(["add", "--", implementationPath, wave1FixturePath]).status, 0);
    assert.equal(run(["commit", "--quiet", "-m", "baseline"]).status, 0);
    const base = run(["rev-parse", "HEAD"]).stdout.trim();
    const baseTree = run(["rev-parse", "HEAD^{tree}"]).stdout.trim();
    fs.writeFileSync(fixtureAbsolute, wave1FixtureCandidateText);
    fs.writeFileSync(implementationAbsolute, "{}\n");
    assert.equal(run(["add", "--", implementationPath, wave1FixturePath]).status, 0);
    assert.equal(run(["commit", "--quiet", "-m", "adapt fixture"]).status, 0);
    const head = run(["rev-parse", "HEAD"]).stdout.trim();
    const tree = run(["rev-parse", "HEAD^{tree}"]).stdout.trim();
    const range = `${base}...${head}`;
    const candidateNumstat = run(["diff", "--numstat", range]).stdout.trim();
    const changedPaths = run(["diff", "--name-only", range]).stdout.split(/\r?\n/gu).filter(Boolean).sort();
    const changedLines = candidateNumstat.split(/\r?\n/gu).filter(Boolean).reduce((total, row) => total + row.split("\t").slice(0, 2).reduce((sum, value) => sum + Number(value), 0), 0);
    const candidate = wave1Candidate({ head, tree, scopeBase: base, changedPaths, changedLines });
    const amendmentComment = wave1ImmutableComment(810001, taskLeaseAmendmentCommentBody(wave1AmendmentSubject()), "2026-08-14T22:00:00Z");
    const implementationCandidate = wave1Candidate();
    const initialLive = observeWave1TestAdaptationLive({ comments: [amendmentComment], candidate: implementationCandidate });
    const initialResolution = resolveFiniteTaskEffectiveReservation({
      registry: canonicalTruth.finiteTaskLeases,
      lease: wave1Lease,
      candidate: implementationCandidate,
      liveObservation: initialLive.liveObservation,
      gitCommand: wave1OverlayGit({ candidate: implementationCandidate })
    });
    assert.equal(finiteTaskEffectiveReservationAuthorityValid(initialResolution), true);
    const adaptationSubject = wave1TestAdaptationSubject({
      amendmentReceipt: initialResolution.amendmentReceipt,
      implementationReservation: initialResolution.effectiveReservation
    });
    const adaptationComment = wave1ImmutableComment(810101, finiteTaskTestAdaptationCommentBody(adaptationSubject), "2026-08-15T00:00:00Z");
    const adaptedLive = observeWave1TestAdaptationLive({ comments: [amendmentComment, adaptationComment], candidate, currentBase: base });
    const resolution = resolveFiniteTaskEffectiveReservation({
      registry: canonicalTruth.finiteTaskLeases,
      lease: wave1Lease,
      candidate,
      liveObservation: adaptedLive.liveObservation,
      gitCommand: wave1OverlayGit({ candidate, currentBase: base, candidateNumstat, currentBaseTree: baseTree, candidateTree: tree })
    });
    assert.equal(finiteTaskEffectiveReservationAuthorityValid(resolution), true, stableJson(resolution.findings));
    const aggregateScope = observeCandidateScopeFromGit(base, head, temporary);
    assert.ok(aggregateScope);
    assert.equal(aggregateScope.tree, tree);
    const implementationScope = deriveTrustedImplementationScopeObservation(aggregateScope, resolution);
    assert.ok(implementationScope);
    assert.deepEqual(implementationScope.paths, [implementationPath]);
    assert.equal(implementationScope.changedLines, resolution.scopePartitions.implementation.canonicalChangedLines);
    assert.deepEqual(implementationScope.aggregateScope.paths, changedPaths);
    assert.equal(deriveTrustedImplementationScopeObservation(aggregateScope, resolution.scopePartitions), null);
    assert.equal(deriveTrustedImplementationScopeObservation(aggregateScope, structuredClone(resolution)), null);
    const implementationIdentity = createImplementationIdentityObservation({
      repository: "Chillywood2025/chillywood-mobile",
      workflowPr: wave1Lease.implementationPr,
      implementationPr: wave1Lease.implementationPr,
      implementationBranch: wave1Lease.implementationBranch,
      implementationHead: head,
      implementationTree: tree,
      originalSeedHead: wave1Lease.admittedSeedHead,
      originalSeedTree: wave1Lease.admittedSeedTree,
      protectedBase: base,
      currentProtectedMain: base,
      finiteLeaseId: wave1Lease.leaseId,
      taskArtifactPath: implementationPath,
      taskArtifactHash: wave1Lease.closure.artifactHash,
      implementationChangedPaths: implementationScope.paths,
      seedIsAncestor: true,
      protectedBaseIsAncestor: true,
      ownerApprovalValid: true,
      artifactFrozen: true,
      prospectiveLeasePresent: true,
      admissionMerged: true
    });
    assert.equal(implementationIdentity.candidateEligible, true);
    const admitted = evaluateAdmittedFiniteTaskArtifactV2({}, {
      taskArtifactBytes: "{}\n",
      taskArtifactHash: wave1Lease.closure.artifactHash,
      implementationIdentity,
      authoritativeLease: wave1Lease,
      ownerJurisdictionAuthority: null,
      actualScope: implementationScope
    });
    assert.equal(admitted.derivedChecks.scopeObservation, true);
    assert.equal(admitted.findings.includes("FINITE_TASK_SCOPE_MEASUREMENT_MISSING"), false);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("A1 terminal repair receipt: exact preliminary receipt round-trips only as the history-bound stale predecessor of one final receipt", () => {
  const priorTruth = structuredClone(canonicalTruth);
  priorTruth.taskContextArchitecture.terminalVerifierRepair.history = structuredClone(HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_HISTORY);
  const identity = { repository: "Chillywood2025/chillywood-mobile", pr: 731, branch: "codex/generic-terminal-verifier-repair-v2", baseSha: "5e595e684f4dcc9454eee5065066e1b48d20e3eb", headSha: "b".repeat(40) };
  const preliminaryIdentity = { ...identity, headSha: "a".repeat(40) };
  const predecessor = { valid: true, protectedBaseAncestor: true, pr: 243, mergeSha: "f74a6d53948a37fc35ef3dbb87e3741ede5c8d76", firstParent: "406a776a697c3a786fd37911b6e2160906fb9121", sourceHead: "5e44d1fd2a84f51b322eb40ca147c0882d1d664f", sourceTree: "e1f6c2f2455bcf4dad747261e0b6e10ab7619dbc" };
  const predecessorAuthority = {
    ok: true, authorizationOk: true, mergeEligible: true,
    commentId: 5362647294, subjectHash: "1".repeat(64), commentBodyHash: "2".repeat(64),
    currentHead: predecessor.sourceHead, currentTree: predecessor.sourceTree, currentFinalSourceReceiptId: 5363013036,
    canonicalFinalSourceReceipt: { commentId: 5363013036, subjectHash: "3".repeat(64), commentBodyHash: "4".repeat(64), diffHash: "5".repeat(64) },
  };
  const consumedPendingTransitions = [{ pr: predecessor.pr, mergeSha: predecessor.mergeSha, sourceHead: predecessor.sourceHead, sourceTree: predecessor.sourceTree, authorityCommentId: predecessorAuthority.commentId, status: "CONSUMED_BY_THIS_TERMINAL_TRUTH" }];
  const priorTruthHash = "6".repeat(64);
  const preliminaryScope = { files: [...TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS], netChangedLines: 500, diffHash: "7".repeat(64) };
  const finalScope = { files: [...TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS], netChangedLines: 650, diffHash: "8".repeat(64) };
  const rawComment = (id, body) => ({ id, node_id: `IC_terminal_repair_${id}`, user: { login: "Chillywood2025" }, author_association: "OWNER", body, created_at: "2026-08-24T12:00:00Z", updated_at: "2026-08-24T12:00:00Z", issue_url: `https://api.github.com/repos/${identity.repository}/issues/${identity.pr}`, html_url: `https://github.com/${identity.repository}/pull/${identity.pr}#issuecomment-${id}` });
  const preliminarySubject = terminalTruthSuccessorVerifierRepairSubject({ identity: preliminaryIdentity, tree: "c".repeat(40), scope: preliminaryScope, predecessor, predecessorAuthority, priorTruthHash, repairProfile: TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PROFILE, consumedPendingTransitions, historicalRepair: false, preliminaryReceipt: true }); const preliminaryBody = terminalTruthSuccessorVerifierRepairOwnerCommentBody(preliminarySubject); const preliminaryPayload = JSON.parse(preliminaryBody.slice(preliminaryBody.indexOf("\n") + 1)); const preliminaryRaw = rawComment(9000000731, preliminaryBody);
  assert.equal(preliminarySubject.receiptStage, "PRELIMINARY_HISTORY_BINDING"); assert.equal(Object.hasOwn(preliminarySubject, "originalTerminalReceipt"), false); assert.equal(Object.hasOwn(preliminarySubject, "terminalVerifierRepairInstanceId"), false); assert.deepEqual(JSON.parse(stableJson(preliminarySubject)), preliminarySubject);

  const closedAuthority = { product: false, nativeProduct: false, database: false, providerMutation: false, build: false, submission: false, ota: false, publicRelease: false };
  const repairInstance = createTerminalVerifierRepairInstance({
    schemaVersion: 1, ordinal: 2, classification: TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_CLASSIFICATION,
    repository: identity.repository, pullRequest: identity.pr, branch: identity.branch, protectedBase: identity.baseSha,
    priorCurrentTruthHash: priorTruthHash, priorInstanceId: HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_INSTANCE.instanceId,
    predecessor: { pullRequest: predecessor.pr, mergeSha: predecessor.mergeSha, firstParent: predecessor.firstParent, sourceHead: predecessor.sourceHead, sourceTree: predecessor.sourceTree, authorityCommentId: predecessorAuthority.commentId, authoritySubjectHash: predecessorAuthority.subjectHash, authorityBodyHash: predecessorAuthority.commentBodyHash },
    receiptBindings: {
      historicalTerminalReceipt: { commentId: preliminaryRaw.id, subjectHash: preliminaryPayload.subjectHash, commentBodyHash: hashValue(preliminaryBody), disposition: "HISTORICAL_STALE_TERMINAL_RECEIPT" },
      predecessorReceipts: [
        { commentId: predecessorAuthority.commentId, subjectHash: predecessorAuthority.subjectHash, commentBodyHash: predecessorAuthority.commentBodyHash, disposition: "OWNER_ARCHITECTURE_AUTHORITY" },
        { commentId: predecessorAuthority.canonicalFinalSourceReceipt.commentId, subjectHash: predecessorAuthority.canonicalFinalSourceReceipt.subjectHash, commentBodyHash: predecessorAuthority.canonicalFinalSourceReceipt.commentBodyHash, diffHash: predecessorAuthority.canonicalFinalSourceReceipt.diffHash, disposition: "CANONICAL_CURRENT" },
      ],
    },
    pendingTransitionPolicyId: PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1.policyId,
    pendingTransitions: [{ pr: predecessor.pr, mergeSha: predecessor.mergeSha, status: "CONSUMED_BY_THIS_TERMINAL_TRUTH" }],
    expectedNextTask: "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE", profile: TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PROFILE,
    singleUse: true, authority: closedAuthority,
  });
  const truthRecord = structuredClone(priorTruth); truthRecord.engineeringDoctrine = { status: "ACTIVE", nextPermittedAction: "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE" }; truthRecord.openImplementationPrs = [];
  truthRecord.taskContextArchitecture = {
    ...truthRecord.taskContextArchitecture,
    architecturePr: predecessor.pr, sourceHead: predecessor.sourceHead, sourceTree: predecessor.sourceTree, mergeSha: predecessor.mergeSha,
    authorityCommentId: predecessorAuthority.commentId, authoritySubjectHash: predecessorAuthority.subjectHash, authorityBodyHash: predecessorAuthority.commentBodyHash,
    terminalTransitionConsumed: true, pendingTransitionPolicyId: PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1.policyId, pendingTransitionCountAfterSynchronization: 0,
    pendingTransitions: [
      { pr: 226, mergeSha: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.mergeSha, status: "CONSUMED_BY_THIS_TERMINAL_TRUTH" },
      { pr: predecessor.pr, mergeSha: predecessor.mergeSha, status: "CONSUMED_BY_THIS_TERMINAL_TRUTH" },
    ],
    terminalVerifierRepair: { ...truthRecord.taskContextArchitecture.terminalVerifierRepair, history: { schemaVersion: 1, policyId: TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_HISTORY_POLICY_ID, profile: TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PROFILE, instances: [...HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_HISTORY.instances, repairInstance] } },
    authority: closedAuthority,
  };
  const finalSubject = terminalTruthSuccessorVerifierRepairSubject({ identity, tree: "d".repeat(40), scope: finalScope, predecessor, predecessorAuthority, priorTruthHash, originalRaw: preliminaryRaw, terminalVerifierRepairInstanceId: repairInstance.instanceId, repairProfile: TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PROFILE, consumedPendingTransitions, historicalRepair: false }); const finalRaw = rawComment(9000000732, terminalTruthSuccessorVerifierRepairOwnerCommentBody(finalSubject)); const args = { raw: preliminaryRaw, allComments: [preliminaryRaw, finalRaw], paginationComplete: true, identity, tree: "d".repeat(40), scope: finalScope, predecessor, predecessorAuthority, priorTruthHash, priorTruth, truthRecord, currentStateText: renderCurrentState(truthRecord), nextTaskText: renderNextTask(truthRecord), currentMain: identity.baseSha, openTerminalSuccessorCount: 1, transitionPreviouslyConsumed: false }; const exact = verifyTerminalTruthSuccessorAuthority(args);
  assert.equal(exact.ok, true, exact.findings.join(","));
  assert.deepEqual(finalSubject.pendingTransitions.map(({ pr }) => pr), [predecessor.pr], "ordinal-2 receipt consumption remains PR243-only");
  assert.deepEqual(truthRecord.taskContextArchitecture.pendingTransitions.map(({ pr }) => pr), [226, predecessor.pr], "top-level compatibility history remains exactly PR226 then PR243");
  assert.deepEqual(exact.historicalTerminalReceiptIds, [preliminaryRaw.id]);
  assert.equal(exact.currentTerminalReceiptId, finalRaw.id);
  assert.equal(verifyTerminalTruthSuccessorAuthority({ ...args, allComments: [preliminaryRaw] }).ok, false, "the preliminary receipt cannot authorize without one exact current final receipt");
  const verifyTopLevelMutation = (mutate) => {
    const candidate = structuredClone(args);
    mutate(candidate.truthRecord.taskContextArchitecture.pendingTransitions);
    candidate.currentStateText = renderCurrentState(candidate.truthRecord);
    candidate.nextTaskText = renderNextTask(candidate.truthRecord);
    return verifyTerminalTruthSuccessorAuthority(candidate);
  };
  for (const [label, mutate] of [
    ["missing", (pending) => { pending.shift(); }],
    ["wrong", (pending) => { pending[0].mergeSha = "0".repeat(40); }],
    ["extra", (pending) => { pending.push({ pr: 244, mergeSha: "9".repeat(40), status: "CONSUMED_BY_THIS_TERMINAL_TRUTH" }); }],
  ]) {
    const invalid = verifyTopLevelMutation(mutate);
    assert.equal(invalid.ok, false, `${label} top-level compatibility history must fail closed`);
    assert.ok(invalid.findings.includes("TERMINAL_TRUTH_SUCCESSOR_INVALID:generatedTruth"), label);
  }
  const observerSource = fs.readFileSync("scripts/assurance/engineering-closure.mjs", "utf8");
  assert.match(observerSource, /terminalSuccessorScope = currentRepairScope \? TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS : TERMINAL_TRUTH_PATHS/u, "repair and terminal-truth successor cardinality must remain scope-specific");
  assert.match(observerSource, /paginationComplete: commentsRead\.complete && openPullsRead\.complete && openTerminalSuccessorFilesComplete/u, "incomplete competing-PR file pagination must fail closed");
  assert.throws(() => terminalTruthSuccessorVerifierRepairSubject({ identity: preliminaryIdentity, tree: "c".repeat(40), scope: { ...preliminaryScope, files: preliminaryScope.files.slice(1) }, predecessor, predecessorAuthority, priorTruthHash, repairProfile: TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PROFILE, consumedPendingTransitions, historicalRepair: false, preliminaryReceipt: true }), /ASSURANCE_TERMINAL_REPAIR_PRELIMINARY_RECEIPT_INVALID/u);
});

test("finite test-adaptation resolver: implementation and fixture line ceilings cannot pool", () => {
  const implementationOverflow = wave1TestAdaptationResolution({
    candidate: wave1Candidate({ changedPaths: wave1OverlayPaths, changedLines: 5001 }),
    gitOptions: { candidateNumstat: wave1PartitionRows({ implementationLines: 4501, fixtureLines: 500 }) }
  }).result;
  assert.ok(implementationOverflow.findings.includes("FINITE_TASK_IMPLEMENTATION_PARTITION_SCOPE_OVERFLOW"), stableJson(implementationOverflow.findings));
  assert.equal(implementationOverflow.findings.includes("FINITE_TASK_TEST_ADAPTATION_PARTITION_SCOPE_OVERFLOW"), false);
  const fixtureOverflow = wave1TestAdaptationResolution({
    candidate: wave1Candidate({ changedPaths: wave1OverlayPaths, changedLines: 5001 }),
    gitOptions: { candidateNumstat: wave1PartitionRows({ implementationLines: 4500, fixtureLines: 501 }) }
  }).result;
  assert.ok(fixtureOverflow.findings.includes("FINITE_TASK_TEST_ADAPTATION_PARTITION_SCOPE_OVERFLOW"), stableJson(fixtureOverflow.findings));
  assert.equal(fixtureOverflow.findings.includes("FINITE_TASK_IMPLEMENTATION_PARTITION_SCOPE_OVERFLOW"), false);
});

test("finite test-adaptation resolver: wrong second wildcard and overlapping fixture paths fail closed", () => {
  const wrong = wave1TestAdaptationResolution({ subjectOverrides: { fixturePaths: ["tests/unrelated.test.mjs"] } }).result;
  const second = wave1TestAdaptationResolution({ subjectOverrides: { fixturePaths: [wave1FixturePath, "tests/second.test.mjs"] } }).result;
  const wildcard = wave1TestAdaptationResolution({ subjectOverrides: { fixturePaths: ["supabase/tests/*.sql"] } }).result;
  const overlap = wave1TestAdaptationResolution({ subjectOverrides: { fixturePaths: [wave1ImplementationPaths[0]] } }).result;
  for (const result of [wrong, second, wildcard, overlap]) {
    assert.equal(result.ok, false);
    assert.ok(result.findings.includes("FINITE_TASK_TEST_ADAPTATION_RECEIPT_MALFORMED"), stableJson(result.findings));
  }
});

test("finite test-adaptation resolver: malformed binary duplicate and underreported numstat partitions fail closed", () => {
  const malformed = wave1TestAdaptationResolution({ gitOptions: { candidateNumstat: `not-a-number\t0\t${wave1ImplementationPaths[0]}` } }).result;
  const binary = wave1TestAdaptationResolution({ gitOptions: { candidateNumstat: `-\t-\t${wave1FixturePath}` } }).result;
  const duplicate = wave1TestAdaptationResolution({ gitOptions: { candidateNumstat: `${wave1PartitionRows()}\n1\t0\t${wave1FixturePath}` } }).result;
  const underreported = wave1TestAdaptationResolution({ candidate: wave1Candidate({ changedPaths: wave1OverlayPaths, changedLines: 4999 }) }).result;
  for (const result of [malformed, binary, duplicate, underreported]) {
    assert.equal(result.ok, false);
    assert.ok(result.findings.includes("FINITE_TASK_TEST_ADAPTATION_PARTITION_INVALID"), stableJson(result.findings));
  }
});

test("finite test-adaptation resolver: baseline blob tree plan and pre-adaptation history are immutable", () => {
  const malformedBaselines = [
    [null],
    [[]],
    [{ path: wave1FixturePath, blob: wave1FixtureBaselineBlob, sha256: wave1FixtureBaselineSha256, plan: "plan(62)", unexpected: true }]
  ];
  for (const fixtureBaselines of malformedBaselines) {
    const malformed = wave1TestAdaptationResolution({ subjectOverrides: { fixtureBaselines } }).result;
    assert.equal(malformed.ok, false);
    assert.ok(malformed.findings.includes("FINITE_TASK_TEST_ADAPTATION_RECEIPT_MALFORMED"), stableJson(malformed.findings));
  }
  const wrongBlob = wave1TestAdaptationResolution({ gitOptions: { baselineBlob: "a".repeat(40) } }).result;
  const wrongStartBlob = wave1TestAdaptationResolution({ gitOptions: { startBlob: "b".repeat(40) } }).result;
  const wrongTree = wave1TestAdaptationResolution({ gitOptions: { protectedMainTree: "c".repeat(40) } }).result;
  const wrongPlan = wave1TestAdaptationResolution({ gitOptions: { baselineText: "begin;\nselect plan(61);\nrollback;\n" } }).result;
  const fixtureAlreadyChanged = wave1TestAdaptationResolution({ gitOptions: { startingPaths: [wave1Lease.artifactReservation.closureArtifactPath, wave1FixturePath] } }).result;
  for (const result of [wrongBlob, wrongStartBlob, wrongPlan, fixtureAlreadyChanged]) {
    assert.equal(result.ok, false);
    assert.ok(result.findings.includes("FINITE_TASK_TEST_ADAPTATION_BASELINE_MISMATCH") || result.findings.includes("FINITE_TASK_TEST_ADAPTATION_HISTORY_INVALID"), stableJson(result.findings));
  }
  assert.ok(wrongTree.findings.includes("FINITE_TASK_TEST_ADAPTATION_TREE_MISMATCH"), stableJson(wrongTree.findings));
});

test("finite test-adaptation resolver: immutable receipt baseline survives only a synchronized clean main advance", () => {
  const advanced = wave1TestAdaptationResolution({ currentBase: wave1AdvancedBase }).result;
  assert.equal(advanced.ok, true, stableJson(advanced.findings));
  assert.equal(advanced.status, "AMENDED_WITH_TEST_ADAPTATION");
  assert.equal(advanced.testAdaptationReceipt.protectedMainHead, wave1BoundBase);
  assert.equal(advanced.scopePartitions.aggregate.canonicalChangedLines, 5000);
  const unsynchronized = wave1TestAdaptationResolution({
    currentBase: wave1AdvancedBase,
    gitOptions: { candidateDescendsCurrentBase: false }
  }).result;
  assert.ok(unsynchronized.findings.includes("FINITE_TASK_TEST_ADAPTATION_HISTORY_INVALID"), stableJson(unsynchronized.findings));
  const mainFixtureDrift = wave1TestAdaptationResolution({
    currentBase: wave1AdvancedBase,
    gitOptions: { currentBaseFixtureBlob: wave1FixtureCandidateBlob }
  }).result;
  assert.ok(mainFixtureDrift.findings.includes("FINITE_TASK_TEST_ADAPTATION_BASELINE_MISMATCH"), stableJson(mainFixtureDrift.findings));
});

test("finite test-adaptation resolver: defect invariant path and artifact bytes stay bound to the frozen task", () => {
  const mutatedArtifactValue = JSON.parse(wave1TaskArtifactText);
  mutatedArtifactValue.taskId = "other-task";
  const mutatedArtifact = stableJson(mutatedArtifactValue);
  const cases = [
    wave1TestAdaptationResolution({ subjectOverrides: { affectedDefect: "WAPR-NOT-IN-FROZEN-TASK" } }).result,
    wave1TestAdaptationResolution({ subjectOverrides: { affectedInvariants: ["W1-I-NOT-IN-FROZEN-TASK"] } }).result,
    wave1TestAdaptationResolution({ subjectOverrides: { causativePaths: [wave1AddedPaths[0]] } }).result,
    wave1TestAdaptationResolution({ gitOptions: { taskArtifactText: mutatedArtifact, taskArtifactBlob: wave1GitBlobOid(mutatedArtifact) } }).result
  ];
  for (const [index, result] of cases.entries()) {
    assert.equal(result.ok, false, `causal case ${index}: ${stableJson(result.findings)}`);
    assert.ok(result.findings.includes("FINITE_TASK_TEST_ADAPTATION_CAUSAL_BINDING_INVALID"), `causal case ${index}: ${stableJson(result.findings)}`);
  }
});

test("finite test-adaptation resolver: task-neutral causal entity sets are exact sorted and nonempty", () => {
  const cases = [
    [{ kind: "creator", ids: [] }],
    [{ kind: "creator", ids: ["duplicate", "duplicate"] }],
    [{ kind: "purchase_intent", ids: ["b", "a"] }],
    [{ kind: "z", ids: ["one"] }, { kind: "a", ids: ["two"] }],
    [{ kind: "creator", ids: ["one"] }, { kind: "creator", ids: ["two"] }],
    [null],
    [[]],
    [{ kind: "creator", ids: ["one"], unexpected: true }]
  ];
  for (const causalEntitySets of cases) {
    const result = wave1TestAdaptationResolution({ subjectOverrides: { causalEntitySets } }).result;
    assert.equal(result.ok, false);
    assert.ok(result.findings.includes("FINITE_TASK_TEST_ADAPTATION_RECEIPT_MALFORMED"), stableJson(result.findings));
  }
});

test("finite test-adaptation resolver: candidate fixture stays a modified tracked 100644 blob with the exact plan", () => {
  const changedPlanText = wave1FixtureCandidateText.replace("plan(62)", "plan(61)");
  const missingPlanText = wave1FixtureCandidateText.replace("select plan(62);\n", "");
  const commentDecoyText = wave1FixtureCandidateText.replace("select plan(62);", "-- plan(62)\nselect plan(1);");
  const cases = [
    wave1TestAdaptationResolution({ gitOptions: { candidateFixturePresent: false } }).result,
    wave1TestAdaptationResolution({ gitOptions: { candidateFixtureMode: "120000" } }).result,
    wave1TestAdaptationResolution({ gitOptions: { candidateFixtureText: wave1FixtureBaselineText, candidateFixtureBlob: wave1FixtureBaselineBlob } }).result,
    wave1TestAdaptationResolution({ gitOptions: { candidateFixtureText: changedPlanText, candidateFixtureBlob: wave1GitBlobOid(changedPlanText) } }).result,
    wave1TestAdaptationResolution({ gitOptions: { candidateFixtureText: missingPlanText, candidateFixtureBlob: wave1GitBlobOid(missingPlanText) } }).result,
    wave1TestAdaptationResolution({ gitOptions: { candidateFixtureText: commentDecoyText, candidateFixtureBlob: wave1GitBlobOid(commentDecoyText) } }).result
  ];
  for (const result of cases) {
    assert.equal(result.ok, false);
    assert.ok(result.findings.includes("FINITE_TASK_TEST_ADAPTATION_FIXTURE_INTEGRITY_INVALID"), stableJson(result.findings));
  }
});

test("finite test-adaptation resolver: start commit cardinality and descendant-only history fail closed", () => {
  const missingStart = wave1TestAdaptationResolution({ resolver: { commits: [{ sha: wave1Descendant, commit: { tree: { sha: wave1DescendantTree } } }] } }).result;
  assert.ok(missingStart.findings.includes("FINITE_TASK_TEST_ADAPTATION_START_NOT_ON_PR"), stableJson(missingStart.findings));
  const duplicateStart = wave1TestAdaptationResolution({ resolver: { commits: [
    { sha: wave1BoundStart, commit: { tree: { sha: wave1BoundStartTree } } },
    { sha: wave1BoundStart, commit: { tree: { sha: wave1BoundStartTree } } },
    { sha: wave1Descendant, commit: { tree: { sha: wave1DescendantTree } } }
  ] } }).result;
  assert.ok(duplicateStart.findings.includes("FINITE_TASK_TEST_ADAPTATION_START_NOT_ON_PR"), stableJson(duplicateStart.findings));
  const sibling = wave1TestAdaptationResolution({ gitOptions: { candidateDescends: false } }).result;
  assert.ok(sibling.findings.includes("FINITE_TASK_TEST_ADAPTATION_HISTORY_INVALID"), stableJson(sibling.findings));
});

test("finite test-adaptation resolver: comment cardinality pagination editing and Owner identity fail closed", () => {
  const duplicate = wave1TestAdaptationResolution({ mutateComments: (comments, { adaptationComment }) => { comments.push({ ...adaptationComment, id: 810102 }); } }).result;
  assert.ok(duplicate.findings.includes("FINITE_TASK_TEST_ADAPTATION_CARDINALITY_EXCEEDED"), stableJson(duplicate.findings));
  const incomplete = wave1TestAdaptationResolution({ resolver: { commentsPaginationComplete: false } }).result;
  assert.ok(incomplete.findings.includes("FINITE_TASK_LEASE_AMENDMENT_COMMENT_DISCOVERY_INCOMPLETE"), stableJson(incomplete.findings));
  const edited = wave1TestAdaptationResolution({ adaptationRaw: { updated_at: "2026-08-15T00:01:00Z" } }).result;
  const wrongOwner = wave1TestAdaptationResolution({ adaptationRaw: { user: { login: "not-owner" } } }).result;
  const wrongAssociation = wave1TestAdaptationResolution({ adaptationRaw: { author_association: "MEMBER" } }).result;
  for (const result of [edited, wrongOwner, wrongAssociation]) assert.ok(result.findings.includes("FINITE_TASK_TEST_ADAPTATION_COMMENT_INVALID"), stableJson(result.findings));
});

test("finite test-adaptation resolver: no overlay receipt preserves historical amended behavior", () => {
  const historical = wave1AmendmentResolution();
  assert.equal(historical.ok, true, stableJson(historical.findings));
  assert.equal(historical.status, "AMENDED");
  for (const overlayOnlyField of ["scopeBase", "testAdaptationReservation", "testAdaptationReceipt", "testAdaptationsConsumed", "aggregateReservation", "scopePartitions"]) {
    assert.equal(Object.hasOwn(historical, overlayOnlyField), false, overlayOnlyField);
  }
  const legacyV2 = finiteTaskFinalReceiptSubject({ schemaVersion: 2, effectiveReservation: historical.effectiveReservation, amendmentReceipt: historical.amendmentReceipt });
  assert.equal(legacyV2.schemaVersion, 2);
  assert.equal(legacyV2.testAdaptationReceipt, undefined);
});

test("finite test-adaptation terminal expiry: schema and reservation status cannot cross generations", () => {
  const amended = wave1AmendmentResolution();
  const adapted = wave1TestAdaptationResolution().result;
  const legacyOutcome = {
    schemaVersion: 1,
    classification: "FINITE_TASK_AMENDED_POST_MERGE_TERMINAL_EVIDENCE_V1",
    baseLeaseHash: amended.baseLeaseHash,
    baseReservation: amended.baseReservation,
    effectiveReservation: amended.effectiveReservation,
    amendmentReceipt: amended.amendmentReceipt
  };
  const adaptedOutcome = {
    schemaVersion: 2,
    classification: "FINITE_TASK_AMENDED_TEST_ADAPTATION_POST_MERGE_TERMINAL_EVIDENCE_V2",
    baseLeaseHash: adapted.baseLeaseHash,
    baseReservation: adapted.baseReservation,
    effectiveReservation: adapted.effectiveReservation,
    amendmentReceipt: adapted.amendmentReceipt,
    testAdaptationReservation: adapted.testAdaptationReservation,
    aggregateReservation: adapted.aggregateReservation,
    scopePartitions: adapted.scopePartitions,
    testAdaptationReceipt: adapted.testAdaptationReceipt,
    mergeParents: [adapted.scopeBase, adapted.candidateHead],
    finalSourceReceipt: { subject: { scopeBase: adapted.scopeBase } }
  };
  assert.equal(finiteTaskTerminalReservationMatchesOutcome({ terminalOutcome: legacyOutcome, reservationResolution: amended }), true);
  assert.equal(finiteTaskTerminalReservationMatchesOutcome({ terminalOutcome: adaptedOutcome, reservationResolution: adapted }), false);
  assert.equal(finiteTaskTerminalReservationMatchesOutcome({ terminalOutcome: legacyOutcome, reservationResolution: adapted }), false);
  assert.equal(finiteTaskTerminalReservationMatchesOutcome({ terminalOutcome: adaptedOutcome, reservationResolution: amended }), false);
  for (const [field, value] of [
    ["aggregateReservationHash", adapted.aggregateReservation.reservationHash],
    ["testAdaptationCommentId", adapted.testAdaptationReceipt.commentId],
    ["subject", { schemaVersion: 3 }]
  ]) {
    const expiredLegacy = structuredClone(legacyOutcome);
    expiredLegacy.finalSourceReceipt = { [field]: value };
    assert.equal(finiteTaskTerminalReservationMatchesOutcome({ terminalOutcome: expiredLegacy, reservationResolution: amended }), false, field);
  }
});

test("finite test-adaptation lifecycle: trusted live overlay binds final receipt v3, merge, and terminal v2", () => {
  const implementationCandidate = wave1Candidate({
    seedTree: wave1Lease.admittedSeedTree,
    seedIsAncestor: true,
    baseIsAncestor: true,
    findings: { P0: 0, P1: 0, launchImpactingP2: 0 }
  });
  const amendmentComment = wave1ImmutableComment(810001, taskLeaseAmendmentCommentBody(wave1AmendmentSubject()), "2026-08-14T22:00:00Z");
  const initialLive = observeWave1TestAdaptationLive({ comments: [amendmentComment], candidate: implementationCandidate });
  const initialResolution = resolveFiniteTaskEffectiveReservation({
    registry: canonicalTruth.finiteTaskLeases,
    lease: wave1Lease,
    candidate: implementationCandidate,
    liveObservation: initialLive.liveObservation,
    gitCommand: wave1OverlayGit({ candidate: implementationCandidate })
  });
  assert.equal(initialResolution.status, "AMENDED");
  assert.equal(finiteTaskEffectiveReservationAuthorityValid(initialResolution), true);
  const ordinaryBinding = {
    ...structuredClone(canonicalTruth.activeTaskBinding),
    implementationPr: wave1Lease.implementationPr,
    implementationBranch: wave1Lease.implementationBranch,
    currentImplementationHead: implementationCandidate.head,
    currentImplementationTree: implementationCandidate.tree,
    phase: "IMPLEMENTATION"
  };
  const ordinaryImplementation = resolveFiniteTaskImplementation(canonicalTruth, {
    branch: implementationCandidate.branch,
    head: implementationCandidate.head,
    tree: implementationCandidate.tree
  }, {
    finiteTaskEffectiveReservationResolution: initialResolution,
    finiteTaskCandidateObservation: implementationCandidate
  }, ordinaryBinding, wave1Lease);
  assert.equal(ordinaryImplementation.ok, true, stableJson(ordinaryImplementation.findings));
  assert.equal(ordinaryImplementation.value.finiteLease.reservationStatus, "AMENDED");

  const candidate = wave1Candidate({
    changedPaths: wave1OverlayPaths,
    changedLines: 5000,
    diffHash: "a".repeat(64),
    changedPathHash: digest(stableJson(wave1OverlayPaths)),
    findings: { P0: 0, P1: 0, launchImpactingP2: 0 }
  });
  const adaptationSubject = wave1TestAdaptationSubject({
    amendmentReceipt: initialResolution.amendmentReceipt,
    implementationReservation: initialResolution.effectiveReservation
  });
  const adaptationComment = wave1ImmutableComment(810101, finiteTaskTestAdaptationCommentBody(adaptationSubject), "2026-08-15T00:00:00Z");
  const gitCommand = wave1OverlayGit({ candidate });
  const orphanedLive = observeWave1TestAdaptationLive({ comments: [adaptationComment], candidate });
  const orphanedResolution = resolveFiniteTaskEffectiveReservation({
    registry: canonicalTruth.finiteTaskLeases,
    lease: wave1Lease,
    candidate,
    liveObservation: orphanedLive.liveObservation,
    gitCommand
  });
  assert.equal(orphanedResolution.ok, false);
  assert.notEqual(orphanedResolution.status, "BASE_ONLY");
  assert.ok(orphanedResolution.findings.includes("FINITE_TASK_TEST_ADAPTATION_EFFECTIVE_LEASE_REQUIRED"), stableJson(orphanedResolution.findings));
  assert.equal(finiteTaskEffectiveReservationAuthorityValid(orphanedResolution), false);
  const adaptedLive = observeWave1TestAdaptationLive({ comments: [amendmentComment, adaptationComment], candidate });
  let resolution = resolveFiniteTaskEffectiveReservation({
    registry: canonicalTruth.finiteTaskLeases,
    lease: wave1Lease,
    candidate,
    liveObservation: adaptedLive.liveObservation,
    gitCommand
  });
  assert.equal(resolution.ok, true, stableJson(resolution.findings));
  assert.equal(resolution.status, "AMENDED_WITH_TEST_ADAPTATION");
  assert.equal(finiteTaskEffectiveReservationAuthorityValid(resolution), true);
  assert.equal(resolution.amendmentReceipt.authorityClassification, "LIVE_IMMUTABLE_OWNER_RECEIPT");
  assert.equal(resolution.testAdaptationReceipt.authorityClassification, "LIVE_IMMUTABLE_OWNER_RECEIPT");
  const currentTruthLease = resolveFiniteTaskCurrentTruthCandidateLease({
    baseLease: wave1Lease,
    effectiveReservationResolution: resolution,
    observedHead: candidate.head,
    observedTree: candidate.tree,
    remoteMain: resolution.scopeBase,
    implementationPr: wave1Lease.implementationPr,
    implementationBranch: wave1Lease.implementationBranch
  });
  assert.deepEqual(currentTruthLease.resolvedLease, resolution.effectiveLease);
  assert.equal(currentTruthLease.overlayScopeBaseMismatch, false);
  const staleCurrentTruthLease = resolveFiniteTaskCurrentTruthCandidateLease({
    baseLease: wave1Lease,
    effectiveReservationResolution: resolution,
    observedHead: candidate.head,
    observedTree: candidate.tree,
    remoteMain: "f".repeat(40),
    implementationPr: wave1Lease.implementationPr,
    implementationBranch: wave1Lease.implementationBranch
  });
  assert.equal(staleCurrentTruthLease.resolvedLease, null);
  assert.equal(staleCurrentTruthLease.overlayScopeBaseMismatch, true);
  assert.equal(resolveFiniteTaskCurrentTruthCandidateLease({
    baseLease: wave1Lease,
    effectiveReservationResolution: structuredClone(resolution),
    observedHead: candidate.head,
    observedTree: candidate.tree,
    remoteMain: resolution.scopeBase,
    implementationPr: wave1Lease.implementationPr,
    implementationBranch: wave1Lease.implementationBranch
  }).resolvedLease, null);
  const layeredCandidate = {
    ...candidate,
    seedTree: wave1Lease.admittedSeedTree,
    seedIsAncestor: true,
    baseIsAncestor: true,
    findings: { P0: 0, P1: 0, launchImpactingP2: 0 }
  };
  const layeredEvaluation = evaluateFiniteTaskCandidate({
    lease: resolution.effectiveLease,
    registry: canonicalTruth.finiteTaskLeases,
    candidate: layeredCandidate,
    effectiveReservationResolution: resolution
  });
  assert.equal(layeredEvaluation.ok, true, stableJson(layeredEvaluation.findings));
  const staleBaseEvaluation = evaluateFiniteTaskCandidate({
    lease: resolution.effectiveLease,
    registry: canonicalTruth.finiteTaskLeases,
    candidate: { ...layeredCandidate, scopeBase: "f".repeat(40), changedPaths: wave1ImplementationPaths, changedLines: 4500 },
    effectiveReservationResolution: resolution
  });
  assert.ok(staleBaseEvaluation.findings.includes("FINITE_TASK_TEST_ADAPTATION_CANDIDATE_SCOPE_MISMATCH"), stableJson(staleBaseEvaluation.findings));
  const omittedFixtureEvaluation = evaluateFiniteTaskCandidate({
    lease: resolution.effectiveLease,
    registry: canonicalTruth.finiteTaskLeases,
    candidate: { ...layeredCandidate, changedPaths: wave1ImplementationPaths, changedLines: 4500 },
    effectiveReservationResolution: resolution
  });
  assert.ok(omittedFixtureEvaluation.findings.includes("FINITE_TASK_SCOPE_OVERFLOW"), stableJson(omittedFixtureEvaluation.findings));
  const protectedRecord = structuredClone(canonicalTruth);
  const checkpoint = protectedRecord.protectedMainAuthority.checkpointSha;
  const protectedMerge = "e".repeat(40);
  const protectedAdvance = evaluateProtectedMainAdvancement({
    record: protectedRecord,
    contract: currentTruthContract,
    observedProtectedMainSha: protectedMerge,
    candidateHead: candidate.head,
    finiteTaskRuntime: {
      sourceOnlyEligible: true,
      providerDependentEligible: false,
      effectiveReservation: resolution.effectiveReservation,
      effectiveReservationResolution: resolution
    },
    advancementObservations: [{
      commit: protectedMerge,
      parents: [checkpoint, "d".repeat(40)],
      tree: "c".repeat(40),
      subject: "Merge pull request #999 from Chillywood2025/codex/fixture-drift",
      changedPaths: [wave1FixturePath]
    }],
    checkpointTreeObservation: protectedRecord.protectedMainAuthority.checkpointTree,
    checkpointIsAncestor: true,
    candidateContainsObservedMain: true,
    gitCommand: (args) => args[0] === "rev-parse" ? "b".repeat(40) : ""
  });
  assert.ok(protectedAdvance.advancementClassifications[0].classifications.includes("ACTIVE_TASK_AUTHORITATIVE_INPUT"));
  assert.ok(protectedAdvance.activeTaskInputsInvalidated.includes(wave1FixturePath));
  const directAdaptation = verifyFiniteTaskTestAdaptationReceipt({
    registry: canonicalTruth.finiteTaskLeases,
    lease: wave1Lease,
    candidate,
    implementationReservation: resolution.effectiveReservation,
    amendmentReceipt: resolution.amendmentReceipt,
    subject: adaptationSubject,
    observation: adaptationComment,
    pullRequest: adaptedLive.pullRequest,
    commits: adaptedLive.commits,
    commitsPaginationComplete: true,
    gitCommand,
    authorityEvidence: wave1AuthorityEvidence,
    observationMode: "LIVE_GITHUB_COMPLETE_READBACK"
  });
  assert.equal(directAdaptation.ok, true, stableJson(directAdaptation.findings));

  const identity = {
    repository: "Chillywood2025/chillywood-mobile",
    pr: wave1Lease.implementationPr,
    branch: wave1Lease.implementationBranch,
    baseSha: wave1BoundBase,
    headSha: candidate.head
  };
  const scope = { files: candidate.changedPaths, additions: 2500, deletions: 2500, netChangedLines: 0, diffHash: candidate.diffHash };
  const reviewSubject = architectureRepositoryReviewSubject({
    identity,
    tree: candidate.tree,
    scope,
    profile: FINITE_TASK_IMPLEMENTATION_EFFECTIVE_RESERVATION_V1,
    effectiveReservationResolution: resolution
  });
  const finiteTaskPrRiskAuthority = reviewSubject.finiteTaskEffectiveReservation.finiteTaskPrRiskAuthority;
  assert.equal(finiteTaskPrRiskAuthority.ok, true, stableJson(finiteTaskPrRiskAuthority.findings));
  const phaseBody = { runId: 900101, sourceHead: candidate.head, sourceTree: candidate.tree, result: "PASS_13_OF_13" };
  const phase1Evidence = { ...phaseBody, valid: true, evidenceHash: hashValue(phaseBody) };
  const finalSubject = finiteTaskFinalReceiptSubject({
    schemaVersion: 3,
    policyId: "ASSURANCE_FINITE_TASK_LEASE_V1",
    repository: identity.repository,
    featureId: wave1Lease.featureId,
    implementationPr: wave1Lease.implementationPr,
    implementationBranch: wave1Lease.implementationBranch,
    admittedSeedHead: wave1Lease.admittedSeedHead,
    finalHead: candidate.head,
    finalTree: candidate.tree,
    diffHash: candidate.diffHash,
    changedPathHash: candidate.changedPathHash,
    scopeResult: "PASS",
    callDomainClosureLedgerHash: "b".repeat(64),
    focusedTestHash: "c".repeat(64),
    mutationNegativeControlHash: "d".repeat(64),
    repositoryReviewHash: hashValue(reviewSubject),
    phase1RunId: phase1Evidence.runId,
    phase1Head: candidate.head,
    baseLeaseHash: resolution.baseLeaseHash,
    baseReservation: resolution.baseReservation,
    effectiveReservation: resolution.effectiveReservation,
    amendmentReceipt: resolution.amendmentReceipt,
    scopeBase: resolution.scopeBase,
    testAdaptationReservation: resolution.testAdaptationReservation,
    aggregateReservation: resolution.aggregateReservation,
    scopePartitions: resolution.scopePartitions,
    testAdaptationReceipt: resolution.testAdaptationReceipt,
    finiteTaskPrRiskAuthority,
    authority: wave1TestAdaptationAuthority
  });
  assert.equal(finalSubject.schemaVersion, 3);
  const reviewComment = wave1ImmutableComment(810201, architectureRepositoryReviewCommentBody(reviewSubject), "2026-08-15T01:00:00Z");
  const finalComment = wave1ImmutableComment(810202, finiteTaskFinalReceiptBody(finalSubject), "2026-08-15T01:01:00Z");
  const staleReviewSubject = structuredClone(reviewSubject);
  staleReviewSubject.reviewedHead = "0".repeat(40);
  staleReviewSubject.reviewedTree = "1".repeat(40);
  const staleFinalSubject = finiteTaskFinalReceiptSubject({ ...finalSubject, finalHead: "0".repeat(40), finalTree: "1".repeat(40) });
  const retainedLifecycleEvidence = [
    wave1ImmutableComment(810190, architectureRepositoryReviewCommentBody(staleReviewSubject), "2026-08-14T23:00:00Z"),
    wave1ImmutableComment(810191, finiteTaskFinalReceiptBody(staleFinalSubject), "2026-08-14T23:01:00Z"),
    wave1ImmutableComment(810203, "<!-- chillywood-assurance-repository-review-v1 -->\n{malformed", "2026-08-15T01:02:00Z"),
    wave1ImmutableComment(810204, "<!-- chillywood-assurance-final-task-receipt-v1 -->\n{malformed", "2026-08-15T01:03:00Z"),
  ];
  const lifecycleComments = [amendmentComment, adaptationComment, ...retainedLifecycleEvidence, reviewComment, finalComment];
  const finalLive = observeWave1TestAdaptationLive({ comments: lifecycleComments, candidate });
  resolution = resolveFiniteTaskEffectiveReservation({
    registry: canonicalTruth.finiteTaskLeases,
    lease: wave1Lease,
    candidate,
    liveObservation: finalLive.liveObservation,
    gitCommand
  });
  assert.equal(finiteTaskEffectiveReservationAuthorityValid(resolution), true);
  const lifecycle = registerVerifiedFiniteTaskImplementationLifecycle({
    lifecycle: verifyFiniteTaskImplementationLifecycle({
      identity,
      tree: candidate.tree,
      scope,
      finiteTaskAuthority: { ok: true, candidate, baseLease: wave1Lease, effectiveReservationResolution: resolution },
      comments: finalLive.liveObservation.comments,
      commentsPaginationComplete: true,
      phase1EvidenceResolver: () => phase1Evidence
    }),
    effectiveReservationResolution: resolution,
    liveObservation: finalLive.liveObservation
  });
  assert.equal(lifecycle.mergeEligible, true, stableJson(lifecycle.findings));
  assert.equal(lifecycle.finalSourceSubject.schemaVersion, 3);
  assert.equal(lifecycle.finalSourceSubject.diffHash, lifecycle.repositoryReview.diffHash);
  assert.equal(lifecycle.finalSourceSubject.changedPathHash, lifecycle.repositoryReview.changedPathHash);
  assert.equal(lifecycle.finalSourceSubject.changedPathHash, lifecycle.finiteTaskPrRiskAuthority.observedChangedPathHash);
  assert.equal(finiteTaskImplementationLifecycleAuthorityValid(lifecycle), true);
  assert.equal(lifecycle.repositoryReviewClassifications.find(({ commentId }) => commentId === 810190)?.disposition, "HISTORICAL_STALE_EXACT_HEAD_REVIEW");
  assert.equal(lifecycle.finalSource.receiptClassifications.find(({ commentId }) => commentId === 810191)?.disposition, "HISTORICAL_STALE_OR_WRONG_CONTEXT");
  const mismatchedStatusLifecycle = verifyFiniteTaskImplementationLifecycle({
    identity,
    tree: candidate.tree,
    scope,
    finiteTaskAuthority: { ok: true, candidate, baseLease: wave1Lease, effectiveReservationResolution: resolution },
    comments: finalLive.liveObservation.comments,
    commentsPaginationComplete: true,
    phase1EvidenceResolver: () => phase1Evidence,
  });
  mismatchedStatusLifecycle.reservationStatus = "AMENDED";
  registerVerifiedFiniteTaskImplementationLifecycle({
    lifecycle: mismatchedStatusLifecycle,
    effectiveReservationResolution: resolution,
    liveObservation: finalLive.liveObservation,
  });
  assert.equal(finiteTaskImplementationLifecycleAuthorityValid(mismatchedStatusLifecycle), false);
  for (const [label, candidateChanges] of [
    ["forged diff hash", { diffHash: "e".repeat(64) }],
    ["forged changed-path hash", { changedPathHash: "f".repeat(64) }],
  ]) {
    const forgedCandidate = { ...candidate, ...candidateChanges };
    const forgedSubject = finiteTaskFinalReceiptSubject({ ...finalSubject, ...candidateChanges });
    const forgedFinalComment = wave1ImmutableComment(810210, finiteTaskFinalReceiptBody(forgedSubject), "2026-08-15T01:02:00Z");
    const forgedLifecycle = verifyFiniteTaskImplementationLifecycle({
      identity,
      tree: candidate.tree,
      scope,
      finiteTaskAuthority: { ok: true, candidate: forgedCandidate, baseLease: wave1Lease, effectiveReservationResolution: resolution },
      comments: [reviewComment, forgedFinalComment],
      commentsPaginationComplete: true,
      phase1EvidenceResolver: () => phase1Evidence,
    });
    assert.equal(forgedLifecycle.mergeEligible, false, label);
    assert.ok(forgedLifecycle.findings.includes("FINITE_TASK_FINAL_SOURCE_RECEIPT_INVALID"), label);
  }

  const mergeTree = candidate.tree;
  const mergeRef = {
    pr: wave1Lease.implementationPr,
    branch: wave1Lease.implementationBranch,
    parents: [wave1BoundBase, candidate.head],
    sourceTree: candidate.tree,
    tree: mergeTree
  };
  const merge = verifyFiniteTaskMergeProvenance({
    lease: wave1Lease,
    receiptSubject: lifecycle.finalSourceSubject,
    currentProtectedBase: wave1BoundBase,
    mergeRef,
    actualMerge: { parents: mergeRef.parents, tree: mergeTree },
    effectiveReservationResolution: resolution,
    finiteTaskPrRiskAuthority: lifecycle.finiteTaskPrRiskAuthority
  });
  assert.equal(merge.ok, true, stableJson(merge.findings));
  const mismatchedSubject = structuredClone(lifecycle.finalSourceSubject);
  mismatchedSubject.testAdaptationReservation.maximumLines -= 1;
  assert.ok(verifyFiniteTaskMergeProvenance({
    lease: wave1Lease,
    receiptSubject: mismatchedSubject,
    currentProtectedBase: wave1BoundBase,
    mergeRef,
    actualMerge: { parents: mergeRef.parents, tree: mergeTree },
    effectiveReservationResolution: resolution,
    finiteTaskPrRiskAuthority: lifecycle.finiteTaskPrRiskAuthority
  }).findings.includes("FINITE_MERGE_TEST_ADAPTATION_RESERVATION_MISMATCH"));
  for (const [label, mutate] of [
    ["schema downgrade", (subject) => { subject.schemaVersion = 2; }],
    ["feature mismatch", (subject) => { subject.featureId = "notifications-fcm"; }],
    ["changed-path mismatch", (subject) => { subject.changedPathHash = "f".repeat(64); }],
  ]) {
    const altered = structuredClone(lifecycle.finalSourceSubject);
    mutate(altered);
    const result = verifyFiniteTaskMergeProvenance({
      lease: wave1Lease,
      receiptSubject: altered,
      currentProtectedBase: wave1BoundBase,
      mergeRef,
      actualMerge: { parents: mergeRef.parents, tree: mergeTree },
      effectiveReservationResolution: resolution,
      finiteTaskPrRiskAuthority: lifecycle.finiteTaskPrRiskAuthority,
    });
    assert.equal(result.ok, false, label);
  }

  const postMergeSha = "5e595e684f4dcc9454eee5065066e1b48d20e3eb";
  const closedPull = {
    state: "closed",
    merged: true,
    merged_at: "2026-08-15T02:00:00Z",
    merge_commit_sha: postMergeSha,
  };
  const postMergeLive = observeWave1TestAdaptationLive({ comments: lifecycleComments, candidate, pullRequestOverrides: closedPull });
  const postMergeResolution = resolveFiniteTaskEffectiveReservation({
    registry: canonicalTruth.finiteTaskLeases,
    lease: wave1Lease,
    candidate,
    liveObservation: postMergeLive.liveObservation,
    gitCommand,
  });
  assert.equal(finiteTaskEffectiveReservationAuthorityValid(postMergeResolution), true);
  const postMergeLifecycle = registerVerifiedFiniteTaskImplementationLifecycle({
    lifecycle: verifyFiniteTaskImplementationLifecycle({
      identity,
      tree: candidate.tree,
      scope,
      finiteTaskAuthority: { ok: true, candidate, baseLease: wave1Lease, effectiveReservationResolution: postMergeResolution },
      comments: postMergeLive.liveObservation.comments,
      commentsPaginationComplete: true,
      phase1EvidenceResolver: () => phase1Evidence,
    }),
    effectiveReservationResolution: postMergeResolution,
    liveObservation: postMergeLive.liveObservation,
  });
  assert.equal(finiteTaskImplementationLifecycleAuthorityValid(postMergeLifecycle), true, stableJson(postMergeLifecycle.findings));
  const postMergeProvenance = verifyFiniteTaskMergeProvenance({
    lease: wave1Lease,
    receiptSubject: postMergeLifecycle.finalSourceSubject,
    currentProtectedBase: wave1BoundBase,
    mergeRef,
    actualMerge: { parents: mergeRef.parents, tree: mergeTree },
    effectiveReservationResolution: postMergeResolution,
    finiteTaskPrRiskAuthority: postMergeLifecycle.finiteTaskPrRiskAuthority,
  });
  assert.equal(postMergeProvenance.ok, true, stableJson(postMergeProvenance.findings));
  const terminalBase = {
    schemaVersion: 2,
    classification: "FINITE_TASK_AMENDED_TEST_ADAPTATION_POST_MERGE_TERMINAL_EVIDENCE_V2",
    repository: identity.repository,
    taskId: wave1Lease.leaseId,
    leaseId: wave1Lease.leaseId,
    implementationPr: wave1Lease.implementationPr,
    implementationBranch: wave1Lease.implementationBranch,
    baseLeaseHash: postMergeResolution.baseLeaseHash,
    baseReservation: postMergeResolution.baseReservation,
    effectiveReservation: postMergeResolution.effectiveReservation,
    amendmentReceipt: postMergeResolution.amendmentReceipt,
    testAdaptationReservation: postMergeResolution.testAdaptationReservation,
    aggregateReservation: postMergeResolution.aggregateReservation,
    scopePartitions: postMergeResolution.scopePartitions,
    testAdaptationReceipt: postMergeResolution.testAdaptationReceipt,
    finiteTaskPrRiskAuthority: postMergeLifecycle.finiteTaskPrRiskAuthority,
    finalSourceReceipt: { ...postMergeLifecycle.finalSource.receipt, subject: postMergeLifecycle.finalSource.subject },
    sourceHead: candidate.head,
    sourceTree: candidate.tree,
    mergeSha: postMergeSha,
    mergeTree,
    mergeParents: [wave1BoundBase, candidate.head],
    nextTask: canonicalTruth.engineeringDoctrine.nextPermittedAction,
    authority: wave1TestAdaptationAuthority
  };
  const terminalEvidence = { ...terminalBase, evidenceHash: hashValue(terminalBase) };
  assert.equal(finiteTaskTerminalReservationMatchesOutcome({
    terminalOutcome: terminalEvidence,
    reservationResolution: postMergeResolution,
  }), true);
  const terminalTransition = {
    applicable: true,
    ok: true,
    consumed: false,
    baseLeaseUnchanged: true,
    lifecycle: postMergeLifecycle,
    mergeProvenance: { ...postMergeProvenance, syntheticMergeTree: mergeTree },
    terminalEvidence,
    findings: [],
  };
  registerVerifiedFiniteTaskPostMergeTransition({ lease: wave1Lease, liveObservation: postMergeLive.liveObservation, postMergeTransition: terminalTransition });
  assert.equal(finiteTaskPostMergeTransitionAuthorityValid(terminalTransition), true);
  const crossSnapshotTransition = { ...terminalTransition, lifecycle };
  registerVerifiedFiniteTaskPostMergeTransition({ lease: wave1Lease, liveObservation: postMergeLive.liveObservation, postMergeTransition: crossSnapshotTransition });
  assert.equal(finiteTaskPostMergeTransitionAuthorityValid(crossSnapshotTransition), false);
  const duplicateReview = { ...reviewComment, id: 810205, node_id: "IC_wave1_test_adaptation_810205", html_url: "https://github.com/Chillywood2025/chillywood-mobile/pull/229#issuecomment-810205" };
  const duplicatePostMergeLive = observeWave1TestAdaptationLive({ comments: [...lifecycleComments, duplicateReview], candidate, pullRequestOverrides: closedPull });
  const duplicateSnapshotTransition = { ...terminalTransition };
  registerVerifiedFiniteTaskPostMergeTransition({ lease: wave1Lease, liveObservation: duplicatePostMergeLive.liveObservation, postMergeTransition: duplicateSnapshotTransition });
  assert.equal(finiteTaskPostMergeTransitionAuthorityValid(duplicateSnapshotTransition), false);
  const duplicateAdaptation = { ...adaptationComment, id: 810206, node_id: "IC_wave1_test_adaptation_810206", html_url: "https://github.com/Chillywood2025/chillywood-mobile/pull/229#issuecomment-810206" };
  const duplicateAuthorityLive = observeWave1TestAdaptationLive({ comments: [...lifecycleComments, duplicateAdaptation], candidate, pullRequestOverrides: closedPull });
  const crossResolutionLifecycle = verifyFiniteTaskImplementationLifecycle({
    identity,
    tree: candidate.tree,
    scope,
    finiteTaskAuthority: { ok: true, candidate, baseLease: wave1Lease, effectiveReservationResolution: postMergeResolution },
    comments: duplicateAuthorityLive.liveObservation.comments,
    commentsPaginationComplete: true,
    phase1EvidenceResolver: () => phase1Evidence,
  });
  assert.equal(crossResolutionLifecycle.mergeEligible, true, stableJson(crossResolutionLifecycle.findings));
  registerVerifiedFiniteTaskImplementationLifecycle({ lifecycle: crossResolutionLifecycle, effectiveReservationResolution: postMergeResolution, liveObservation: duplicateAuthorityLive.liveObservation });
  assert.equal(finiteTaskImplementationLifecycleAuthorityValid(crossResolutionLifecycle), false);
  const duplicateAuthorityResolution = resolveFiniteTaskEffectiveReservation({ registry: canonicalTruth.finiteTaskLeases, lease: wave1Lease, candidate, liveObservation: duplicateAuthorityLive.liveObservation, gitCommand });
  assert.equal(finiteTaskEffectiveReservationAuthorityValid(duplicateAuthorityResolution), false);
  const terminalFeatureMismatch = structuredClone(terminalEvidence);
  terminalFeatureMismatch.finalSourceReceipt.subject.featureId = "notifications-fcm";
  assert.equal(finiteTaskTerminalReservationMatchesOutcome({
    terminalOutcome: terminalFeatureMismatch,
    reservationResolution: postMergeResolution,
  }), false);
  const activeFeature = registry.features.find(({ featureId }) => featureId === canonicalTruth.activeTaskBinding.featureId);
  const projected = projectFiniteTaskTerminalTruth({
    record: canonicalTruth,
    terminalEvidence,
    proofTierApplicabilityHash: digest(stableJson(activeFeature.proofTierApplicability)),
    implementationTitle: "Wave 1 test-adaptation lifecycle"
  });
  assert.deepEqual(projected.finiteTaskRuntime.terminalOutcome, terminalEvidence);
  assert.deepEqual(validateTerminalTaskEvidence(projected.activeTaskBinding, projected.latestMergedImplementationPr), []);
  assert.equal(finiteTaskLeaseEffectivelyTerminal(projected.finiteTaskLeases, wave1Lease), true);
  assert.equal(projected.engineeringDoctrine.nextPermittedAction, "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE");
  const terminalIdentity = { repository: terminalEvidence.repository, pr: 999, branch: "codex/finite-task-terminal-truth-v1", baseRef: "main", baseSha: terminalEvidence.mergeSha, headSha: "9".repeat(40) };
  const terminalTree = "a".repeat(40);
  const terminalScope = { files: ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"], additions: 40, deletions: 10, netChangedLines: 30, diffHash: "b".repeat(64) };
  const priorTruthHash = hashValue(stableJson(canonicalTruth));
  const terminalComment = (id, body) => ({ id, node_id: `IC_terminal_v2_${id}`, user: { login: "Chillywood2025" }, author_association: "OWNER", body, created_at: "2026-08-15T05:00:00Z", updated_at: "2026-08-15T05:00:00Z", issue_url: `https://api.github.com/repos/${terminalIdentity.repository}/issues/${terminalIdentity.pr}`, html_url: `https://github.com/${terminalIdentity.repository}/pull/${terminalIdentity.pr}#issuecomment-${id}` });
  const terminalOwnerSubject = finiteTaskTerminalTruthSubject({ identity: terminalIdentity, tree: terminalTree, scope: terminalScope, terminalTransition, priorTruthHash });
  const terminalOwner = terminalComment(830101, finiteTaskTerminalTruthOwnerCommentBody(terminalOwnerSubject));
  const terminalReviewSubject = architectureRepositoryReviewSubject({ identity: terminalIdentity, tree: terminalTree, scope: terminalScope, profile: FINITE_TASK_TERMINAL_TRUTH_V1 });
  const terminalReview = terminalComment(830102, architectureRepositoryReviewCommentBody(terminalReviewSubject));
  const terminalRun = { id: 930101, run_attempt: 1, name: "Phase 1 CI", event: "pull_request", status: "completed", conclusion: "success", head_sha: terminalIdentity.headSha, head_branch: terminalIdentity.branch, pull_requests: [{ number: terminalIdentity.pr, head: { sha: terminalIdentity.headSha }, base: { sha: terminalIdentity.baseSha } }] };
  const terminalJobs = PHASE1_REQUIRED_JOB_NAMES.map((name, index) => ({ id: index + 1, name, status: "completed", conclusion: "success", head_sha: terminalIdentity.headSha }));
  const terminalPhase1 = verifyPhase1RunEvidence({ run: terminalRun, jobs: terminalJobs, identity: terminalIdentity, tree: terminalTree });
  const terminalFinalSubject = finiteTaskTerminalTruthFinalSourceSubject({ identity: terminalIdentity, tree: terminalTree, scope: terminalScope, ownerRaw: terminalOwner, repositoryReviewRaw: terminalReview, phase1Evidence: terminalPhase1, terminalTransition });
  const terminalFinal = terminalComment(830103, finiteTaskTerminalTruthFinalSourceOwnerCommentBody(terminalFinalSubject));
  const terminalAuthority = verifyFiniteTaskTerminalTruthAuthority({ raw: terminalOwner, allComments: [terminalOwner, terminalReview, terminalFinal], paginationComplete: true, identity: terminalIdentity, tree: terminalTree, scope: terminalScope, terminalTransition, priorTruthHash, priorTruth: canonicalTruth, truthRecord: projected, currentStateText: renderCurrentState(projected), nextTaskText: renderNextTask(projected), currentMain: terminalEvidence.mergeSha, openTerminalSuccessorCount: 1, transitionPreviouslyConsumed: false, ancestryVerified: true, phase1EvidenceResolver: () => terminalPhase1 });
  assert.equal(terminalAuthority.authorizationOk, true, stableJson(terminalAuthority.findings));
  assert.equal(terminalAuthority.mergeEligible, true, stableJson(terminalAuthority.mergeFindings));
  assert.equal(terminalAuthority.currentFinalSourceReceiptId, terminalFinal.id);
  const terminalGit = (gitArgs) => {
    if (gitArgs[0] === "merge-base" && gitArgs[1] === "--is-ancestor") {
      const [, , ancestor, descendant] = gitArgs;
      if ((ancestor === candidate.head && descendant === terminalEvidence.mergeSha)
        || (ancestor === terminalEvidence.mergeSha && descendant === terminalEvidence.mergeSha)) return "";
    }
    if (gitArgs[0] === "rev-list" && gitArgs[1] === "--first-parent" && gitArgs[2] === terminalEvidence.mergeSha) {
      return `${terminalEvidence.mergeSha}\n${wave1BoundBase}`;
    }
    return gitCommand(gitArgs);
  };
  const terminalRuntimeFor = (effectiveReservationObservation) => evaluateFiniteTaskLeaseRuntime({
    record: projected,
    contract: currentTruthContract,
    now: new Date("2026-08-15T01:00:00Z"),
    currentProtectedBase: terminalEvidence.mergeSha,
    effectiveReservationObservation,
    gitCommand: terminalGit,
    environment: {}
  });
  const terminalRuntime = terminalRuntimeFor(postMergeLive.liveObservation);
  assert.equal(terminalRuntime.scopeResult, "PASS", stableJson(terminalRuntime.findings));
  assert.equal(terminalRuntime.candidateEligible, true, stableJson(terminalRuntime.findings));
  assert.deepEqual(terminalRuntime.scopePartitions, terminalEvidence.scopePartitions);
  const untrustedFinalRuntime = terminalRuntimeFor(structuredClone(postMergeLive.liveObservation));
  assert.equal(untrustedFinalRuntime.scopeResult, "FAIL");
  assert.ok(untrustedFinalRuntime.findings.includes("FINITE_TASK_TERMINAL_EFFECTIVE_RESERVATION_MISMATCH"));
  const terminalPacket = resolveFiniteTaskImplementation(projected, {
    branch: projected.activeTaskBinding.implementationBranch,
    head: projected.activeTaskBinding.currentImplementationHead,
    tree: projected.activeTaskBinding.currentImplementationTree
  }, {
    finiteTaskEffectiveReservationResolution: terminalRuntime.effectiveReservationResolution
  }, projected.activeTaskBinding, wave1Lease);
  assert.equal(terminalPacket.ok, true, stableJson(terminalPacket.findings));
  assert.equal(terminalPacket.value.finiteLease.reservationStatus, "AMENDED_WITH_TEST_ADAPTATION");
  assert.deepEqual(terminalPacket.value.finiteLease.scopePartitions, terminalEvidence.scopePartitions);
  const tamperedFinalLive = observeWave1TestAdaptationLive({
    comments: [amendmentComment, adaptationComment, ...retainedLifecycleEvidence, reviewComment, { ...finalComment, body: `${finalComment.body}\n` }],
    candidate,
    pullRequestOverrides: closedPull,
  });
  const tamperedFinalRuntime = terminalRuntimeFor(tamperedFinalLive.liveObservation);
  assert.equal(tamperedFinalRuntime.scopeResult, "FAIL");
  assert.ok(tamperedFinalRuntime.findings.includes("FINITE_TASK_TERMINAL_EFFECTIVE_RESERVATION_MISMATCH"));
  const rehashTerminal = (evidence) => {
    const body = Object.fromEntries(Object.entries(evidence).filter(([key]) => key !== "evidenceHash"));
    return { ...body, evidenceHash: hashValue(body) };
  };
  const rehashFinalReceipt = (receipt) => {
    receipt.subject = finiteTaskFinalReceiptSubject(receipt.subject);
    receipt.subjectHash = hashValue(receipt.subject);
    receipt.bodyHash = hashValue({ subject: receipt.subject, subjectHash: receipt.subjectHash });
    receipt.rawBodyHash = hashValue(finiteTaskFinalReceiptBody(receipt.subject));
  };
  const rehashFiniteTaskPrRiskAuthority = (authority) => {
    const projectionSubject = Object.fromEntries(Object.entries(authority).filter(([key]) => !["ok", "findings", "projectionHash"].includes(key)));
    authority.projectionHash = hashValue(projectionSubject);
  };
  const rehashAdaptationReceipt = (receipt) => {
    receipt.subject = finiteTaskTestAdaptationSubject(receipt.subject);
    const body = finiteTaskTestAdaptationCommentBody(receipt.subject);
    const envelope = JSON.parse(body.slice(body.indexOf("\n") + 1));
    receipt.subjectHash = envelope.subjectHash;
    receipt.bodyHash = envelope.bodyHash;
    receipt.rawBodyHash = hashValue(body);
  };
  const coherentlyMutateAdaptationReceipt = (evidence, mutate) => {
    mutate(evidence.testAdaptationReceipt);
    rehashAdaptationReceipt(evidence.testAdaptationReceipt);
    evidence.finalSourceReceipt.subject.testAdaptationReceipt = structuredClone(evidence.testAdaptationReceipt);
    rehashFinalReceipt(evidence.finalSourceReceipt);
  };
  const coherentlyMutateFinalReceiptSubject = (evidence, mutate) => {
    mutate(evidence.finalSourceReceipt.subject);
    rehashFinalReceipt(evidence.finalSourceReceipt);
  };
  const coherentlyReplaceFixturePath = (evidence, fixturePath) => {
    const fixtureReservation = wave1Reservation([fixturePath], 1, 500);
    const aggregateReservation = wave1Reservation([...evidence.effectiveReservation.allowedPaths, fixturePath], 33, 5000);
    evidence.testAdaptationReservation = fixtureReservation;
    evidence.aggregateReservation = aggregateReservation;
    evidence.scopePartitions.testAdaptation.reservation = fixtureReservation;
    evidence.scopePartitions.testAdaptation.actualPaths = [fixturePath];
    evidence.scopePartitions.aggregate.reservation = aggregateReservation;
    evidence.scopePartitions.aggregate.actualPaths = [...evidence.scopePartitions.implementation.actualPaths, fixturePath].sort();
    evidence.testAdaptationReceipt.fixturePaths = [fixturePath];
    evidence.testAdaptationReceipt.fixtureBaselines[0].path = fixturePath;
    evidence.testAdaptationReceipt.subject.fixturePaths = [fixturePath];
    evidence.testAdaptationReceipt.subject.fixtureBaselines[0].path = fixturePath;
    evidence.testAdaptationReceipt.subject.aggregateProjection = aggregateReservation;
    rehashAdaptationReceipt(evidence.testAdaptationReceipt);
    evidence.finalSourceReceipt.aggregateReservationHash = aggregateReservation.reservationHash;
    Object.assign(evidence.finalSourceReceipt.subject, {
      changedPathHash: hashValue(evidence.scopePartitions.aggregate.actualPaths),
      testAdaptationReservation: fixtureReservation,
      aggregateReservation,
      scopePartitions: evidence.scopePartitions,
      testAdaptationReceipt: evidence.testAdaptationReceipt
    });
    rehashFinalReceipt(evidence.finalSourceReceipt);
  };
  for (const [label, mutate] of [
    ["changed-path hash", (subject) => { subject.changedPathHash = "f".repeat(64); }],
    ["admitted seed", (subject) => { subject.admittedSeedHead = "f".repeat(40); }],
    ["effective reservation", (subject) => { subject.effectiveReservation.maximumLines -= 1; }],
    ["test-adaptation receipt", (subject) => { subject.testAdaptationReceipt.commentId += 1; }],
  ]) {
    const altered = structuredClone(terminalEvidence);
    coherentlyMutateFinalReceiptSubject(altered, mutate);
    assert.equal(finiteTaskTerminalReservationMatchesOutcome({
      terminalOutcome: altered,
      reservationResolution: resolution,
    }), false, label);
  }
  const terminalPartitionMutations = [
    ["implementation line overflow", (evidence) => { evidence.scopePartitions.implementation.canonicalChangedLines = 4501; }],
    ["fixture line overflow", (evidence) => { evidence.scopePartitions.testAdaptation.canonicalChangedLines = 501; }],
    ["aggregate line sum mismatch", (evidence) => { evidence.scopePartitions.aggregate.canonicalChangedLines = 4999; }],
    ["overlapping actual path", (evidence) => { evidence.scopePartitions.implementation.actualPaths = [...evidence.scopePartitions.implementation.actualPaths, wave1FixturePath].sort(); }],
    ["missing aggregate actual path", (evidence) => { evidence.scopePartitions.aggregate.actualPaths = evidence.scopePartitions.aggregate.actualPaths.filter((file) => file !== wave1FixturePath); }],
    ["coordinated actual-path omission", (evidence) => {
      const omitted = evidence.scopePartitions.implementation.actualPaths[0];
      evidence.scopePartitions.implementation.actualPaths = evidence.scopePartitions.implementation.actualPaths.filter((file) => file !== omitted);
      evidence.scopePartitions.aggregate.actualPaths = evidence.scopePartitions.aggregate.actualPaths.filter((file) => file !== omitted);
      evidence.finalSourceReceipt.subject.scopePartitions.implementation.actualPaths = evidence.finalSourceReceipt.subject.scopePartitions.implementation.actualPaths.filter((file) => file !== omitted);
      evidence.finalSourceReceipt.subject.scopePartitions.aggregate.actualPaths = evidence.finalSourceReceipt.subject.scopePartitions.aggregate.actualPaths.filter((file) => file !== omitted);
      rehashFinalReceipt(evidence.finalSourceReceipt);
    }],
    ["pooled aggregate maximum", (evidence) => {
      evidence.aggregateReservation = wave1Reservation(evidence.aggregateReservation.allowedPaths, 33, 5500);
      evidence.scopePartitions.aggregate.reservation = evidence.aggregateReservation;
      evidence.finalSourceReceipt.aggregateReservationHash = evidence.aggregateReservation.reservationHash;
    }],
    ["fixture baseline digest", (evidence) => { evidence.testAdaptationReceipt.fixtureBaselines[0].sha256 = "f".repeat(64); }],
    ["fixture baseline path", (evidence) => { evidence.testAdaptationReceipt.fixtureBaselines[0].path = "supabase/tests/other.sql"; }],
    ["fixture baseline null", (evidence) => coherentlyMutateAdaptationReceipt(evidence, (receipt) => { receipt.fixtureBaselines = [null]; receipt.subject.fixtureBaselines = [null]; })],
    ["fixture baseline array", (evidence) => coherentlyMutateAdaptationReceipt(evidence, (receipt) => { receipt.fixtureBaselines = [[]]; receipt.subject.fixtureBaselines = [[]]; })],
    ["fixture baseline extra key", (evidence) => coherentlyMutateAdaptationReceipt(evidence, (receipt) => { receipt.fixtureBaselines[0].unexpected = true; receipt.subject.fixtureBaselines[0].unexpected = true; })],
    ["causal entity null", (evidence) => coherentlyMutateAdaptationReceipt(evidence, (receipt) => { receipt.subject.causalEntitySets = [null]; })],
    ["causal entity array", (evidence) => coherentlyMutateAdaptationReceipt(evidence, (receipt) => { receipt.subject.causalEntitySets = [[]]; })],
    ["causal entity extra key", (evidence) => coherentlyMutateAdaptationReceipt(evidence, (receipt) => { receipt.subject.causalEntitySets[0].unexpected = true; })],
    ["adaptation authority escalation", (evidence) => coherentlyMutateAdaptationReceipt(evidence, (receipt) => { receipt.subject.authority.providerMutation = true; })],
    ["adaptation repository", (evidence) => coherentlyMutateAdaptationReceipt(evidence, (receipt) => { receipt.subject.repository = "Other/repository"; })],
    ["adaptation PR", (evidence) => coherentlyMutateAdaptationReceipt(evidence, (receipt) => { receipt.subject.implementationPr = 230; })],
    ["adaptation task", (evidence) => coherentlyMutateAdaptationReceipt(evidence, (receipt) => { receipt.subject.taskId = "other-task"; })],
    ["adaptation lease", (evidence) => coherentlyMutateAdaptationReceipt(evidence, (receipt) => { receipt.subject.leaseId = "other-lease"; })],
    ["adaptation policy", (evidence) => coherentlyMutateAdaptationReceipt(evidence, (receipt) => { receipt.subject.policyId = "OTHER_POLICY"; })],
    ["adaptation classification", (evidence) => coherentlyMutateAdaptationReceipt(evidence, (receipt) => { receipt.subject.classification = "OTHER_CLASSIFICATION"; })],
    ["adaptation non-SQL fixture", (evidence) => coherentlyReplaceFixturePath(evidence, "supabase/tests/not-sql.test.mjs")],
    ["final authority escalation", (evidence) => coherentlyMutateFinalReceiptSubject(evidence, (subject) => { subject.authority.providerMutation = true; })],
    ["final scope base", (evidence) => coherentlyMutateFinalReceiptSubject(evidence, (subject) => { subject.scopeBase = "f".repeat(40); })],
    ["final repository", (evidence) => coherentlyMutateFinalReceiptSubject(evidence, (subject) => { subject.repository = "Other/repository"; })],
    ["final feature", (evidence) => coherentlyMutateFinalReceiptSubject(evidence, (subject) => { subject.featureId = "notifications-fcm"; })],
    ["final admitted seed", (evidence) => coherentlyMutateFinalReceiptSubject(evidence, (subject) => { subject.admittedSeedHead = "f".repeat(40); })],
    ["final PR", (evidence) => coherentlyMutateFinalReceiptSubject(evidence, (subject) => { subject.implementationPr = 230; })],
    ["final branch", (evidence) => coherentlyMutateFinalReceiptSubject(evidence, (subject) => { subject.implementationBranch = "codex/other"; })],
    ["final policy", (evidence) => coherentlyMutateFinalReceiptSubject(evidence, (subject) => { subject.policyId = "OTHER_POLICY"; })],
    ["final scope result", (evidence) => coherentlyMutateFinalReceiptSubject(evidence, (subject) => { subject.scopeResult = "FAIL"; })],
    ["final Phase 1 head", (evidence) => coherentlyMutateFinalReceiptSubject(evidence, (subject) => { subject.phase1Head = "f".repeat(40); })],
    ["final repository-review hash shape", (evidence) => coherentlyMutateFinalReceiptSubject(evidence, (subject) => { subject.repositoryReviewHash = "not-a-sha256"; })],
    ["coherent finite-task risk-authority transplant", (evidence) => {
      const authority = structuredClone(evidence.finiteTaskPrRiskAuthority);
      authority.primaryFeatureId = authority.affectedFeatureIds.find((featureId) => featureId !== wave1Lease.featureId);
      rehashFiniteTaskPrRiskAuthority(authority);
      evidence.finiteTaskPrRiskAuthority = authority;
      evidence.finalSourceReceipt.subject.finiteTaskPrRiskAuthority = structuredClone(authority);
      rehashFinalReceipt(evidence.finalSourceReceipt);
    }],
    ["coherent finite-task risk partition hash mismatch", (evidence) => {
      const authority = structuredClone(evidence.finiteTaskPrRiskAuthority);
      authority.implementationPartition.actualPathHash = "f".repeat(64);
      rehashFiniteTaskPrRiskAuthority(authority);
      evidence.finiteTaskPrRiskAuthority = authority;
      evidence.finalSourceReceipt.subject.finiteTaskPrRiskAuthority = structuredClone(authority);
      rehashFinalReceipt(evidence.finalSourceReceipt);
    }]
  ];
  const assertTerminalRejected = (invalidEvidence, label) => {
    const invalidBinding = { ...projected.activeTaskBinding, terminalEvidence: invalidEvidence };
    assert.deepEqual(validateTerminalTaskEvidence(invalidBinding, projected.latestMergedImplementationPr), [
      { id: "ASSURANCE_FINITE_TASK_TERMINAL_EVIDENCE_MALFORMED", status: "BLOCKED_INTERNAL" }
    ], label);
    const terminalRegistry = structuredClone(canonicalTruth.finiteTaskLeases);
    terminalRegistry.completedLeaseOutcomes = [invalidEvidence];
    assert.equal(finiteTaskLeaseEffectivelyTerminal(terminalRegistry, wave1Lease), false, label);
    assert.throws(() => projectFiniteTaskTerminalTruth({
      record: canonicalTruth,
      terminalEvidence: invalidEvidence,
      proofTierApplicabilityHash: digest(stableJson(activeFeature.proofTierApplicability))
    }), /FINITE_TASK_TERMINAL_PROJECTION_INVALID/u, label);
  };
  for (const [label, mutate] of terminalPartitionMutations) {
    const altered = structuredClone(terminalEvidence);
    mutate(altered);
    assertTerminalRejected(rehashTerminal(altered), label);
  }
  const legacyTerminalBase = structuredClone(terminalBase);
  legacyTerminalBase.schemaVersion = 1;
  legacyTerminalBase.classification = "FINITE_TASK_AMENDED_POST_MERGE_TERMINAL_EVIDENCE_V1";
  for (const field of ["testAdaptationReservation", "aggregateReservation", "scopePartitions", "testAdaptationReceipt", "finiteTaskPrRiskAuthority"]) delete legacyTerminalBase[field];
  for (const field of ["aggregateReservationHash", "testAdaptationCommentId", "subject"]) delete legacyTerminalBase.finalSourceReceipt[field];
  const legacyTerminalEvidence = rehashTerminal(legacyTerminalBase);
  const legacyBinding = { ...projected.activeTaskBinding, terminalEvidence: legacyTerminalEvidence };
  assert.deepEqual(validateTerminalTaskEvidence(legacyBinding, projected.latestMergedImplementationPr), []);
  const legacyRegistry = structuredClone(canonicalTruth.finiteTaskLeases);
  legacyRegistry.completedLeaseOutcomes = [legacyTerminalEvidence];
  assert.equal(finiteTaskLeaseEffectivelyTerminal(legacyRegistry, wave1Lease), true);
  for (const [field, value] of [
    ["aggregateReservationHash", terminalEvidence.aggregateReservation.reservationHash],
    ["testAdaptationCommentId", terminalEvidence.testAdaptationReceipt.commentId],
    ["subject", terminalEvidence.finalSourceReceipt.subject]
  ]) {
    const altered = structuredClone(legacyTerminalEvidence);
    altered.finalSourceReceipt[field] = structuredClone(value);
    assertTerminalRejected(rehashTerminal(altered), `legacy nested ${field}`);
  }
  const tamperedTerminal = structuredClone(terminalEvidence);
  tamperedTerminal.testAdaptationReceipt.commentId += 1;
  tamperedTerminal.evidenceHash = hashValue(Object.fromEntries(Object.entries(tamperedTerminal).filter(([key]) => key !== "evidenceHash")));
  assert.throws(() => projectFiniteTaskTerminalTruth({
    record: canonicalTruth,
    terminalEvidence: tamperedTerminal,
    proofTierApplicabilityHash: digest(stableJson(activeFeature.proofTierApplicability))
  }), /FINITE_TASK_TERMINAL_PROJECTION_INVALID/u);
});

test("finite lifecycle current-valid evidence ignores retained history but rejects zero or duplicate current receipts", () => {
  const none = wave1CurrentValidLifecycleFixture({ includeCurrentReview: false, includeCurrentFinal: false });
  assert.equal(none.lifecycle.mergeEligible, false);
  assert.equal(finiteTaskImplementationLifecycleAuthorityValid(none.lifecycle), false);

  const oneCurrent = wave1CurrentValidLifecycleFixture();
  assert.equal(oneCurrent.lifecycle.mergeEligible, true, stableJson(oneCurrent.lifecycle.findings));
  assert.equal(oneCurrent.lifecycle.repositoryReview.commentId, oneCurrent.currentReview.id);
  assert.equal(oneCurrent.lifecycle.finalSource.receipt.commentId, oneCurrent.currentFinal.id);
  assert.equal(finiteTaskImplementationLifecycleAuthorityValid(oneCurrent.lifecycle), true);
  assert.equal(oneCurrent.comments.filter(({ body }) => body.startsWith("<!-- chillywood-assurance-task-lease-amendment-v1 -->\n")).length, 1);
  assert.equal(oneCurrent.comments.filter(({ body }) => body.startsWith("<!-- chillywood-assurance-task-test-adaptation-v1 -->\n")).length, 1);

  const staleAndCurrent = wave1CurrentValidLifecycleFixture({
    historicalEvidence: ({ reviewReceipt, finalReceipt }) => [
      reviewReceipt({ id: 820101, createdAt: "2026-08-14T23:00:00Z", mutateSubject: (subject) => { subject.reviewedHead = "0".repeat(40); } }),
      finalReceipt({ id: 820102, createdAt: "2026-08-14T23:01:00Z", mutateSubject: (subject) => { subject.finalHead = "0".repeat(40); } }),
    ],
  });
  assert.equal(staleAndCurrent.lifecycle.mergeEligible, true, stableJson(staleAndCurrent.lifecycle.findings));
  assert.equal(staleAndCurrent.lifecycle.repositoryReview.commentId, staleAndCurrent.currentReview.id, "caller/order-selected stale review is ignored");
  assert.equal(staleAndCurrent.lifecycle.finalSource.receipt.commentId, staleAndCurrent.currentFinal.id, "caller/order-selected stale final is ignored");
  assert.equal(finiteTaskImplementationLifecycleAuthorityValid(staleAndCurrent.lifecycle), true);

  const multipleStaleAndCurrent = wave1CurrentValidLifecycleFixture({
    historicalEvidence: ({ currentReview, currentFinal, reviewReceipt, finalReceipt }) => [
      reviewReceipt({ id: 820111, createdAt: "2026-08-14T22:00:00Z", mutateSubject: (subject) => { subject.reviewedHead = "1".repeat(40); } }),
      reviewReceipt({ id: 820112, createdAt: "2026-08-14T22:01:00Z", mutateSubject: (subject) => { subject.reviewedTree = "2".repeat(40); } }),
      finalReceipt({ id: 820113, createdAt: "2026-08-14T22:02:00Z", mutateSubject: (subject) => { subject.finalHead = "3".repeat(40); } }),
      finalReceipt({ id: 820114, createdAt: "2026-08-14T22:03:00Z", mutateSubject: (subject) => { subject.finalTree = "4".repeat(40); } }),
      wave1ImmutableComment(820115, `${currentReview.body.slice(0, currentReview.body.indexOf("\n"))}\n{`, "2026-08-14T22:04:00Z"),
      wave1ImmutableComment(820116, `${currentFinal.body.slice(0, currentFinal.body.indexOf("\n"))}\n{`, "2026-08-14T22:05:00Z"),
    ],
  });
  assert.equal(multipleStaleAndCurrent.lifecycle.mergeEligible, true, stableJson(multipleStaleAndCurrent.lifecycle.findings));
  assert.equal(finiteTaskImplementationLifecycleAuthorityValid(multipleStaleAndCurrent.lifecycle), true);

  const duplicateReview = wave1CurrentValidLifecycleFixture({
    historicalEvidence: ({ reviewReceipt }) => [reviewReceipt({ id: 820301, createdAt: "2026-08-15T01:02:00Z" })],
  });
  assert.equal(duplicateReview.lifecycle.mergeEligible, false);
  assert.equal(finiteTaskImplementationLifecycleAuthorityValid(duplicateReview.lifecycle), false);
  const duplicateFinal = wave1CurrentValidLifecycleFixture({
    historicalEvidence: ({ finalReceipt }) => [finalReceipt({ id: 820302, createdAt: "2026-08-15T01:02:00Z" })],
  });
  assert.equal(duplicateFinal.lifecycle.mergeEligible, false);
  assert.equal(finiteTaskImplementationLifecycleAuthorityValid(duplicateFinal.lifecycle), false);

  const incomplete = wave1CurrentValidLifecycleFixture({ commentsPaginationComplete: false });
  assert.equal(incomplete.lifecycle.mergeEligible, false);
  assert.equal(finiteTaskImplementationLifecycleAuthorityValid(incomplete.lifecycle), false);
});

test("finite lifecycle current-valid evidence classifies newer malformed edited and wrong-context receipts as historical", () => {
  const invalidHistoricalCases = [
    ["stale newer", ({ reviewReceipt, finalReceipt }) => [
      reviewReceipt({ id: 820401, createdAt: "2026-08-15T03:00:00Z", mutateSubject: (subject) => { subject.reviewedHead = "0".repeat(40); } }),
      finalReceipt({ id: 820402, createdAt: "2026-08-15T03:01:00Z", mutateSubject: (subject) => { subject.finalHead = "0".repeat(40); } }),
    ]],
    ["malformed newer", ({ currentReview, currentFinal }) => [
      wave1ImmutableComment(820403, `${currentReview.body.slice(0, currentReview.body.indexOf("\n"))}\n{not-json`, "2026-08-15T03:02:00Z"),
      wave1ImmutableComment(820404, `${currentFinal.body.slice(0, currentFinal.body.indexOf("\n"))}\n{not-json`, "2026-08-15T03:03:00Z"),
    ]],
    ["edited", ({ currentReview, currentFinal }) => [
      { ...structuredClone(currentReview), id: 820405, updated_at: "2026-08-15T03:04:00Z" },
      { ...structuredClone(currentFinal), id: 820406, updated_at: "2026-08-15T03:05:00Z" },
    ]],
    ["wrong Owner", ({ currentFinal }) => [{ ...structuredClone(currentFinal), id: 820407, user: { login: "attacker" } }]],
    ["wrong association", ({ currentReview }) => [{ ...structuredClone(currentReview), id: 820408, author_association: "MEMBER" }]],
    ["wrong PR", ({ reviewReceipt }) => [reviewReceipt({ id: 820409, createdAt: "2026-08-15T03:09:00Z", mutateSubject: (subject) => { subject.pr = 230; }, raw: { issue_url: "https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/230" } })]],
    ["wrong branch", ({ reviewReceipt }) => [reviewReceipt({ id: 820410, createdAt: "2026-08-15T03:10:00Z", mutateSubject: (subject) => { subject.branch = "attacker/branch"; } })]],
    ["wrong head", ({ reviewReceipt }) => [reviewReceipt({ id: 820411, createdAt: "2026-08-15T03:11:00Z", mutateSubject: (subject) => { subject.reviewedHead = "1".repeat(40); } })]],
    ["wrong tree", ({ reviewReceipt }) => [reviewReceipt({ id: 820412, createdAt: "2026-08-15T03:12:00Z", mutateSubject: (subject) => { subject.reviewedTree = "2".repeat(40); } })]],
    ["wrong authority", ({ finalReceipt }) => [finalReceipt({ id: 820413, createdAt: "2026-08-15T03:13:00Z", mutateSubject: (subject) => { subject.authority.build = true; } })]],
    ["wrong lease", ({ finalReceipt }) => [finalReceipt({ id: 820414, createdAt: "2026-08-15T03:14:00Z", mutateSubject: (subject) => { subject.baseLeaseHash = "0".repeat(64); } })]],
    ["wrong schema", ({ finalReceipt }) => [finalReceipt({ id: 820415, createdAt: "2026-08-15T03:15:00Z", mutateSubject: (subject) => { subject.schemaVersion = 2; } })]],
    ["wrong profile", ({ reviewReceipt }) => [reviewReceipt({ id: 820416, createdAt: "2026-08-15T03:16:00Z", mutateSubject: (subject) => { subject.reviewProfile = "FINITE_TASK_TERMINAL_TRUTH_V1"; } })]],
    ["unrelated historical", ({ reviewReceipt, finalReceipt }) => [
      reviewReceipt({ id: 820417, createdAt: "2026-08-15T03:17:00Z", mutateSubject: (subject) => { subject.pr = 214; subject.branch = "codex/unrelated-history"; } }),
      finalReceipt({ id: 820418, createdAt: "2026-08-15T03:18:00Z", mutateSubject: (subject) => { subject.implementationPr = 214; subject.implementationBranch = "codex/unrelated-history"; } }),
    ]],
  ];
  for (const [label, historicalEvidence] of invalidHistoricalCases) {
    const fixture = wave1CurrentValidLifecycleFixture({ historicalEvidence });
    assert.equal(fixture.lifecycle.mergeEligible, true, `${label}: ${stableJson(fixture.lifecycle.findings)}`);
    assert.equal(fixture.lifecycle.repositoryReview.commentId, fixture.currentReview.id, label);
    assert.equal(fixture.lifecycle.finalSource.receipt.commentId, fixture.currentFinal.id, label);
    assert.equal(finiteTaskImplementationLifecycleAuthorityValid(fixture.lifecycle), true, label);
  }
});

test("finite lifecycle protected-main synchronization retains the old generation and selects the replacement", () => {
  const prior = wave1CurrentValidLifecycleFixture({
    reviewId: 5361274094,
    finalId: 5361290776,
    historicalEvidence: ({ reviewReceipt }) => [
      reviewReceipt({ id: 5360505240, createdAt: "2026-08-19T18:00:00Z", mutateSubject: (subject) => { subject.reviewedHead = "0".repeat(40); subject.reviewedTree = "1".repeat(40); } }),
    ],
  });
  assert.equal(prior.lifecycle.repositoryReviewClassifications.find(({ commentId }) => commentId === 5360505240)?.disposition, "HISTORICAL_STALE_EXACT_HEAD_REVIEW");
  assert.equal(prior.lifecycle.repositoryReviewClassifications.find(({ commentId }) => commentId === 5361274094)?.disposition, "CURRENT_VALID");
  assert.equal(prior.lifecycle.finalSource.receiptClassifications.find(({ commentId }) => commentId === 5361290776)?.disposition, "CURRENT_VALID");
  const synchronizedCandidate = wave1Candidate({
    head: "a".repeat(40),
    tree: "b".repeat(40),
    scopeBase: wave1AdvancedBase,
    changedPaths: wave1OverlayPaths,
    changedLines: 5000,
    diffHash: "e".repeat(64),
    changedPathHash: digest(stableJson(wave1OverlayPaths)),
  });
  const synchronized = wave1CurrentValidLifecycleFixture({
    candidate: synchronizedCandidate,
    currentBase: wave1AdvancedBase,
    reviewId: 820503,
    finalId: 820504,
    reviewCreatedAt: "2026-08-15T04:00:00Z",
    finalCreatedAt: "2026-08-15T04:01:00Z",
    historicalEvidence: () => prior.comments
      .filter(({ id }) => [5360505240, 5361274094, 5361290776].includes(id))
      .map((comment) => structuredClone(comment)),
  });
  assert.equal(synchronized.lifecycle.mergeEligible, true, stableJson(synchronized.lifecycle.findings));
  assert.equal(synchronized.lifecycle.repositoryReview.commentId, synchronized.currentReview.id);
  assert.equal(synchronized.lifecycle.finalSource.receipt.commentId, synchronized.currentFinal.id);
  assert.equal(finiteTaskImplementationLifecycleAuthorityValid(synchronized.lifecycle), true);
  assert.equal(synchronized.comments.includes(prior.currentFinal), false, "history is retained by value, not trusted by object identity");
  assert.equal(synchronized.comments.some(({ id }) => id === prior.currentFinal.id), true);
  const reviewDisposition = (commentId) => synchronized.lifecycle.repositoryReviewClassifications.find((item) => item.commentId === commentId);
  const finalDisposition = (commentId) => synchronized.lifecycle.finalSource.receiptClassifications.find((item) => item.commentId === commentId);
  assert.equal(reviewDisposition(5360505240)?.disposition, "HISTORICAL_STALE_EXACT_HEAD_REVIEW");
  assert.equal(reviewDisposition(5361274094)?.disposition, "HISTORICAL_STALE_EXACT_HEAD_REVIEW");
  assert.equal(finalDisposition(5361290776)?.disposition, "HISTORICAL_STALE_OR_WRONG_CONTEXT");
  assert.equal(reviewDisposition(820503)?.disposition, "CURRENT_VALID");
  assert.equal(finalDisposition(820504)?.disposition, "CURRENT_VALID");
  assert.equal(synchronized.comments.filter(({ body }) => body.startsWith("<!-- chillywood-assurance-task-lease-amendment-v1 -->\n")).length, 1);
  assert.equal(synchronized.comments.filter(({ body }) => body.startsWith("<!-- chillywood-assurance-task-test-adaptation-v1 -->\n")).length, 1);
  const mergeRef = { pr: 229, branch: wave1Lease.implementationBranch, parents: [wave1AdvancedBase, synchronizedCandidate.head], sourceTree: synchronizedCandidate.tree, tree: synchronizedCandidate.tree };
  assert.equal(verifyFiniteTaskMergeProvenance({
    lease: wave1Lease,
    receiptSubject: synchronized.lifecycle.finalSourceSubject,
    currentProtectedBase: wave1AdvancedBase,
    mergeRef,
    actualMerge: { parents: mergeRef.parents, tree: mergeRef.tree },
    effectiveReservationResolution: synchronized.resolution,
    finiteTaskPrRiskAuthority: synchronized.lifecycle.finiteTaskPrRiskAuthority,
  }).ok, true);
  const record = historicalRollingRecord();
  const advancement = evaluateProtectedMainAdvancement({
    record,
    contract: currentTruthContract,
    observedProtectedMainSha: record.mainSha,
    candidateHead: synchronizedCandidate.head,
    finiteTaskRuntime: { sourceOnlyEligible: true, providerDependentEligible: false, candidateTree: synchronizedCandidate.tree },
    finiteTaskFinalSourceEligibility: synchronized.lifecycle,
    checkpointTreeObservation: record.protectedMainAuthority.checkpointTree,
    checkpointIsAncestor: true,
    candidateContainsObservedMain: true,
  });
  assert.equal(advancement.mergeEligible, true, stableJson(advancement.findings));
});

test("finite amendment resolver: base-only Wave 1 rejects both unamended paths", () => {
  const result = resolveFiniteTaskEffectiveReservation({
    registry: canonicalTruth.finiteTaskLeases,
    lease: wave1Lease,
    candidate: wave1Candidate(),
    comments: [],
    commentsPaginationComplete: true,
    requireCompleteDiscovery: true
  });
  assert.equal(result.ok, false);
  assert.ok(result.findings.includes("FINITE_TASK_EFFECTIVE_RESERVATION_PATH_VIOLATION"));
});
test("finite amendment resolver: exact Wave 1 delta overlays every reservation field at 32/4500", () => {
  const result = wave1AmendmentResolution();
  assert.equal(result.ok, true, result.findings.join(","));
  assert.equal(result.status, "AMENDED");
  assert.equal(result.baseReservation.eligiblePathCount, 30);
  assert.deepEqual(result.effectiveReservation.allowedPaths, [...wave1Lease.allowedPaths, ...wave1AddedPaths].sort());
  assert.deepEqual(result.effectiveLease.artifactReservation.pathGlobs, result.effectiveReservation.allowedPaths);
  assert.equal(result.effectiveLease.artifactReservation.maximumFiles, 32);
  assert.equal(result.effectiveLease.artifactReservation.maximumLines, 4500);
  assert.deepEqual(result.effectiveLease.scopeBudget, { maximumFiles: 32, maximumChangedLines: 4500 });
  assert.equal(result.amendmentReceipt.authorityClassification, "SYNTHETIC_NON_AUTHORITY");
  assert.equal(result.authority.liveReceipt, false);
  assert.equal(finiteTaskEffectiveReservationAuthorityValid(result), false);
  assert.equal(wave1AmendmentResolution({ resolver: { observationMode: "LIVE_GITHUB_COMPLETE_READBACK" } }).authority.liveReceipt, false);
  for (const hash of [result.effectiveReservation.reservationHash, result.amendmentReceipt.subjectHash, result.amendmentReceipt.bodyHash, result.amendmentReceipt.rawBodyHash]) assert.match(hash, /^[0-9a-f]{64}$/u);
});
test("finite amendment resolver: a reserved amendment requires V2 while the legacy V1 fixture remains valid", () => {
  const legacyWave1 = taskLeaseAmendmentSubject({
    schemaVersion: 1,
    repository: "Chillywood2025/chillywood-mobile",
    leaseId: wave1Lease.leaseId,
    pr: wave1Lease.implementationPr,
    branch: wave1Lease.implementationBranch,
    currentCandidateHead: wave1Descendant,
    currentLeaseHash: digest(stableJson(wave1Lease)),
    addedPaths: [wave1AddedPaths[0]],
    registeredDomain: wave1Lease.domain,
    reason: "legacy receipt must not bypass the descendant-persistent contract",
    newScopeMaximum: { maximumFiles: 32, maximumChangedLines: 4500 },
    excludedAuthority: { product: false, native: false, database: false, provider: false, build: false, release: false, money: false, authRls: false, credentials: false }
  });
  const legacyWave1Observation = {
    id: 810010,
    author: "Chillywood2025",
    authorAssociation: "OWNER",
    createdAt: "2026-08-14T22:00:00Z",
    updatedAt: "2026-08-14T22:00:00Z",
    issueUrl: "https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/229",
    body: taskLeaseAmendmentCommentBody(legacyWave1)
  };
  assert.ok(verifyTaskLeaseAmendment({ registry: canonicalTruth.finiteTaskLeases, lease: wave1Lease, candidate: { head: wave1Descendant }, subject: legacyWave1, observation: legacyWave1Observation }).findings.includes("FINITE_TASK_LEASE_AMENDMENT_SCHEMA_UNSUPPORTED"));
  const historical = amendmentSubject();
  assert.equal(verifyTaskLeaseAmendment({ registry: finiteRegistry, lease: pr214Lease, candidate: { head: f252Head }, subject: historical, observation: amendmentObservation(historical) }).ok, true);
});
test("finite amendment resolver: only resolver-branded structurally unchanged base scope is authoritative", () => {
  assert.equal(finiteTaskEffectiveReservationAuthorityValid({ ok: true, status: "BASE_ONLY", effectiveLease: { allowedPaths: ["package.json"] } }), false);
  const syntheticReserved = resolveFiniteTaskEffectiveReservation({
    registry: canonicalTruth.finiteTaskLeases,
    lease: wave1Lease,
    candidate: wave1Candidate({ changedPaths: [...wave1Lease.allowedPaths], changedLines: 3600 }),
    comments: [],
    commentsPaginationComplete: true,
    requireCompleteDiscovery: true
  });
  assert.equal(syntheticReserved.status, "BASE_ONLY");
  assert.equal(finiteTaskEffectiveReservationAuthorityValid(syntheticReserved), false);
  const legacySynthetic = resolveFiniteTaskEffectiveReservation({
    registry: finiteRegistry,
    lease: pr214Lease,
    comments: [],
    commentsPaginationComplete: true
  });
  assert.equal(legacySynthetic.status, "BASE_ONLY");
  assert.equal(finiteTaskEffectiveReservationAuthorityValid(legacySynthetic), true);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "finite-task-live-base-only-"));
  const fakeGh = path.join(temporary, "gh");
  const pull = {
    number: wave1Lease.implementationPr,
    state: "open",
    head: { ref: wave1Lease.implementationBranch, sha: wave1Descendant, repo: { full_name: "Chillywood2025/chillywood-mobile" } },
    base: { sha: wave1BoundBase, repo: { full_name: "Chillywood2025/chillywood-mobile" } }
  };
  fs.writeFileSync(fakeGh, `#!/usr/bin/env node\nconst endpoint = process.argv.at(-1);\nif (endpoint.includes("/comments?") || endpoint.includes("/commits?")) process.stdout.write("[[]]");\nelse process.stdout.write(${JSON.stringify(JSON.stringify(pull))});\n`);
  fs.chmodSync(fakeGh, 0o755);
  const originalPath = process.env.PATH;
  let liveObservation;
  try {
    process.env.PATH = `${temporary}:${originalPath}`;
    liveObservation = observeLiveFiniteTaskEffectiveReservation({
      repository: "Chillywood2025/chillywood-mobile",
      pr: wave1Lease.implementationPr,
      authorityEvidence: wave1AuthorityEvidence
    });
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  const baseOnlyCandidate = wave1Candidate({ changedPaths: [...wave1Lease.allowedPaths], changedLines: 3600 });
  const liveReserved = resolveFiniteTaskEffectiveReservation({
    registry: canonicalTruth.finiteTaskLeases,
    lease: wave1Lease,
    candidate: baseOnlyCandidate,
    liveObservation
  });
  assert.equal(liveReserved.status, "BASE_ONLY");
  assert.equal(finiteTaskEffectiveReservationAuthorityValid(liveReserved), true);
  const baseOnlyMergeRef = {
    pr: wave1Lease.implementationPr,
    branch: wave1Lease.implementationBranch,
    parents: [wave1BoundBase, baseOnlyCandidate.head],
    sourceTree: baseOnlyCandidate.tree,
    tree: baseOnlyCandidate.tree,
  };
  const baseOnlyV1 = finiteTaskFinalReceiptSubject({
    schemaVersion: 1,
    finalHead: baseOnlyCandidate.head,
    finalTree: baseOnlyCandidate.tree,
  });
  assert.equal(verifyFiniteTaskMergeProvenance({
    lease: wave1Lease,
    receiptSubject: baseOnlyV1,
    currentProtectedBase: wave1BoundBase,
    mergeRef: baseOnlyMergeRef,
    effectiveReservationResolution: liveReserved,
  }).ok, true);
  const baseOnlyV2 = finiteTaskFinalReceiptSubject({
    ...baseOnlyV1,
    schemaVersion: 2,
    baseLeaseHash: liveReserved.baseLeaseHash,
    baseReservation: liveReserved.baseReservation,
    effectiveReservation: liveReserved.effectiveReservation,
    amendmentReceipt: liveReserved.amendmentReceipt,
  });
  assert.ok(verifyFiniteTaskMergeProvenance({
    lease: wave1Lease,
    receiptSubject: baseOnlyV2,
    currentProtectedBase: wave1BoundBase,
    mergeRef: baseOnlyMergeRef,
    effectiveReservationResolution: liveReserved,
  }).findings.includes("FINITE_MERGE_EFFECTIVE_RESERVATION_MISMATCH"));
  liveReserved.effectiveLease.allowedPaths.push("package.json");
  assert.equal(finiteTaskEffectiveReservationAuthorityValid(liveReserved), false);
});
test("finite amendment resolver: path 33 and changed line 4501 fail", () => {
  const path33 = wave1AmendmentResolution({ candidate: wave1Candidate({ changedPaths: [...wave1Candidate().changedPaths, "_lib/not-authorized.ts"] }) });
  assert.ok(path33.findings.includes("FINITE_TASK_EFFECTIVE_RESERVATION_PATH_VIOLATION"));
  const line4501 = wave1AmendmentResolution({ candidate: wave1Candidate({ changedLines: 4501 }) });
  assert.ok(line4501.findings.includes("FINITE_TASK_EFFECTIVE_RESERVATION_SCOPE_OVERFLOW"));
});
test("finite amendment resolver: malformed binding matrix fails closed", () => {
  const cases = [
    wave1AmendmentSubject({ addedPaths: [wave1AddedPaths[0]] }),
    wave1AmendmentSubject({ addedPaths: [...wave1AddedPaths, wave1AddedPaths[0]] }),
    wave1AmendmentSubject({ addedPaths: [...wave1AddedPaths, "_lib/*.ts"] }),
    wave1AmendmentSubject({ addedPaths: [...wave1AddedPaths, "_lib/extra.ts"] }),
    wave1AmendmentSubject({ repository: "Other/repository" }),
    wave1AmendmentSubject({ pr: 230 }),
    wave1AmendmentSubject({ taskId: "other-task" }),
    wave1AmendmentSubject({ leaseId: "other-lease" }),
    wave1AmendmentSubject({ domain: "other-domain" }),
    wave1AmendmentSubject({ branch: "codex/other" }),
    wave1AmendmentSubject({ baseLeaseHash: "f".repeat(64) }),
    wave1AmendmentSubject({ taskArtifactHash: "f".repeat(64) }),
    wave1AmendmentSubject({ effectiveReservation: { eligiblePathCount: 32, maximumFiles: 33, maximumLines: 4500 } }),
    wave1AmendmentSubject({ authority: { providerMutation: true, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false } })
  ];
  assert.equal(cases.every((subject) => !wave1AmendmentResolution({ subject }).ok), true);
  assert.equal(wave1AmendmentResolution({ raw: { user: { login: "other" } } }).ok, false);
  assert.equal(wave1AmendmentResolution({ raw: { author_association: "MEMBER" } }).ok, false);
  assert.equal(wave1AmendmentResolution({ raw: { updated_at: "2026-08-14T22:01:00Z" } }).ok, false);
});
test("finite amendment resolver: edited duplicate incomplete and unregistered observations fail", () => {
  assert.equal(wave1AmendmentResolution({ raw: { body: `${taskLeaseAmendmentCommentBody(wave1AmendmentSubject())}\nedited` } }).ok, false);
  assert.equal(wave1AmendmentResolution({ resolver: { commentsPaginationComplete: false } }).ok, false);
  const exact = wave1AmendmentSubject();
  const body = taskLeaseAmendmentCommentBody(exact);
  assert.equal(wave1AmendmentResolution({ resolver: { comments: [
    { id: 810001, user: { login: "Chillywood2025" }, author_association: "OWNER", created_at: "2026-08-14T22:00:00Z", updated_at: "2026-08-14T22:00:00Z", issue_url: "https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/229", body },
    { id: 810002, user: { login: "Chillywood2025" }, author_association: "OWNER", created_at: "2026-08-14T22:01:00Z", updated_at: "2026-08-14T22:01:00Z", issue_url: "https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/229", body }
  ] } }).ok, false);
  const unregistered = structuredClone(canonicalTruth.finiteTaskLeases);
  unregistered.amendmentPolicy.domains = unregistered.amendmentPolicy.domains.filter(({ id }) => id !== wave1Lease.domain);
  assert.equal(wave1AmendmentResolution({ resolver: { registry: unregistered } }).ok, false);
});
test("finite amendment resolver: missing timestamps, missing start trees, and duplicate path reasons fail", () => {
  assert.equal(wave1AmendmentResolution({ raw: { created_at: null, updated_at: null } }).ok, false);
  assert.ok(wave1AmendmentResolution({ resolver: { commits: [
    { sha: wave1BoundStart },
    { sha: wave1Descendant, commit: { tree: { sha: wave1DescendantTree } } }
  ] } }).findings.includes("FINITE_TASK_LEASE_AMENDMENT_START_NOT_ON_PR"));
  const duplicateReason = wave1AmendmentSubject({ pathReasons: [
    { path: wave1AddedPaths[0], reason: "first" },
    { path: wave1AddedPaths[0], reason: "duplicate" }
  ] });
  assert.equal(wave1AmendmentResolution({ subject: duplicateReason }).ok, false);
});
test("finite amendment resolver: bound start must pass base scope and remain an ancestor on the same PR", () => {
  assert.ok(wave1AmendmentResolution({ gitOptions: { startingPaths: ["_lib/not-authorized.ts"] } }).findings.includes("FINITE_TASK_LEASE_AMENDMENT_START_OUTSIDE_BASE_RESERVATION"));
  assert.ok(wave1AmendmentResolution({ gitOptions: { startingLines: 3601 } }).findings.includes("FINITE_TASK_LEASE_AMENDMENT_START_OUTSIDE_BASE_RESERVATION"));
  assert.equal(wave1AmendmentResolution().ok, true);
  assert.ok(wave1AmendmentResolution({ gitOptions: { descendant: false } }).findings.includes("FINITE_TASK_LEASE_AMENDMENT_HISTORY_INVALID"));
  assert.ok(wave1AmendmentResolution({ resolver: { commits: [{ sha: wave1Descendant, commit: { tree: { sha: wave1DescendantTree } } }] } }).findings.includes("FINITE_TASK_LEASE_AMENDMENT_START_NOT_ON_PR"));
});
test("finite amendment resolver: starting base is the exact merge base and tolerates later protected-base descendants", () => {
  const advancedBase = "7".repeat(40);
  const advanced = wave1AmendmentResolution({ resolver: { pullRequest: {
    number: 229,
    state: "open",
    head: { ref: wave1Lease.implementationBranch, sha: wave1Descendant, repo: { full_name: "Chillywood2025/chillywood-mobile" } },
    base: { sha: advancedBase, repo: { full_name: "Chillywood2025/chillywood-mobile" } }
  } } });
  assert.equal(advanced.ok, true, advanced.findings.join(","));
  const wrongMergeBase = wave1AmendmentResolution({ gitOptions: { mergeBase: "8".repeat(40) } });
  assert.ok(wrongMergeBase.findings.includes("FINITE_TASK_LEASE_AMENDMENT_START_BASE_MISMATCH"));
});
test("finite amendment resolver: sibling, rebased, force-pushed replacement, and unrelated histories all fail", () => {
  const sibling = wave1AmendmentResolution({ gitOptions: { descendant: false } });
  const rebased = wave1AmendmentResolution({
    resolver: { commits: [{ sha: wave1Descendant, commit: { tree: { sha: wave1DescendantTree } } }] },
    gitOptions: { descendant: false }
  });
  const forcePushedReplacement = wave1AmendmentResolution({
    resolver: { commits: [{ sha: "9".repeat(40), commit: { tree: { sha: "a".repeat(40) } } }, { sha: wave1Descendant, commit: { tree: { sha: wave1DescendantTree } } }] },
    gitOptions: { descendant: false }
  });
  const unrelated = wave1AmendmentResolution({ gitOptions: { descendant: false, mergeBase: "0".repeat(40) } });
  assert.ok(sibling.findings.includes("FINITE_TASK_LEASE_AMENDMENT_HISTORY_INVALID"));
  for (const result of [rebased, forcePushedReplacement]) assert.ok(result.findings.includes("FINITE_TASK_LEASE_AMENDMENT_START_NOT_ON_PR"));
  assert.ok(unrelated.findings.includes("FINITE_TASK_LEASE_AMENDMENT_HISTORY_INVALID"));
});
test("finite amendment resolver: future reserved amendments require one bounded registered policy", () => {
  const missing = structuredClone(canonicalTruth.finiteTaskLeases);
  missing.amendmentPolicy.domains = missing.amendmentPolicy.domains.filter(({ id }) => id !== wave1Lease.domain);
  assert.ok(validateFiniteTaskLeaseRegistry(missing).includes("FINITE_TASK_LEASE_AMENDMENT_POLICY_UNAVAILABLE"));
  const duplicate = structuredClone(canonicalTruth.finiteTaskLeases);
  duplicate.amendmentPolicy.domains.push(structuredClone(duplicate.amendmentPolicy.domains.find(({ id }) => id === wave1Lease.domain)));
  assert.ok(validateFiniteTaskLeaseRegistry(duplicate).includes("FINITE_TASK_LEASE_AMENDMENT_POLICY_DUPLICATE"));
  const excessive = structuredClone(canonicalTruth.finiteTaskLeases);
  excessive.amendmentPolicy.domains.find(({ id }) => id === wave1Lease.domain).maximumFiles = 37;
  assert.ok(validateFiniteTaskLeaseRegistry(excessive).includes("FINITE_TASK_LEASE_AMENDMENT_POLICY_UNAVAILABLE"));
  const wildcard = structuredClone(canonicalTruth.finiteTaskLeases);
  wildcard.amendmentPolicy.domains.find(({ id }) => id === wave1Lease.domain).amendablePaths = ["_lib/accessEntitlements[.]ts"];
  assert.ok(validateFiniteTaskLeaseRegistry(wildcard).includes("FINITE_TASK_LEASE_AMENDMENT_POLICY_MALFORMED"));
  const reservedBaseWildcard = structuredClone(canonicalTruth.finiteTaskLeases);
  const reservedLease = reservedBaseWildcard.tasks.find(({ implementationPr }) => implementationPr === wave1Lease.implementationPr);
  const replacedPath = reservedLease.allowedPaths[0];
  reservedLease.allowedPaths[0] = "_lib/**";
  reservedLease.artifactReservation.pathGlobs[reservedLease.artifactReservation.pathGlobs.indexOf(replacedPath)] = "_lib/**";
  assert.ok(validateFiniteTaskLeaseRegistry(reservedBaseWildcard).includes("FINITE_TASK_LEASE_MALFORMED"));
  reservedLease.allowedPaths[0] = "_lib/@(accessEntitlements).ts";
  reservedLease.artifactReservation.pathGlobs[reservedLease.artifactReservation.pathGlobs.indexOf("_lib/**")] = "_lib/@(accessEntitlements).ts";
  assert.ok(validateFiniteTaskLeaseRegistry(reservedBaseWildcard).includes("FINITE_TASK_LEASE_MALFORMED"));
  reservedLease.amendmentMaximum.maximumAmendments = 0;
  assert.equal(validateFiniteTaskLeaseRegistry(reservedBaseWildcard).includes("FINITE_TASK_LEASE_MALFORMED"), false);
  const unusableCapacity = structuredClone(canonicalTruth.finiteTaskLeases);
  unusableCapacity.amendmentPolicy.domains.find(({ id }) => id === wave1Lease.domain).maximumFiles = 30;
  assert.ok(validateFiniteTaskLeaseRegistry(unusableCapacity).includes("FINITE_TASK_LEASE_AMENDMENT_POLICY_UNAVAILABLE"));
});
test("finite amendment resolver: frozen Wave 1 evidence remains byte-identical", () => {
  assert.equal(wave1Lease.closure.artifactHash, "0cc09e1a908c2520e22652c8e258babb862166875bb449db2648a10f54e01361");
  assert.equal(wave1Lease.closure.packetHash, "0b238a3fb3b73cd5022dd5f571653d0cd4af4067569181062376d56a49c0839e");
  assert.equal(wave1Lease.closure.certificateHash, "4ad770781b04e2af860b2c0da0ec9cdd9ce16ecf911322c389f92429408c3845");
  assert.equal(wave1Lease.closure.edgeClosureHash, "8c4e81388574b1c8ae28bc5af7d6effb5b5fde9f3ff4e08115e1241677dfe6aa");
  assert.equal(wave1Lease.closure.edgeEvidenceHash, "693abd32e7cd5c80fd43c6358cf13470d8aa73fcc7c3e9e87515ff7ec804d61a");
  assert.equal(wave1Lease.closure.modelDeltaHash, "5ca0cdb63f64f9d77edfc5b5929c68e78806b1f47710c798c49b8853104217ef");
});
test("finite lifecycle: amendment-capable tasks require supplied live final-source evidence for merge eligibility", () => {
  const record = historicalRollingRecord();
  record.finiteTaskRuntime.finalEvidence = { ownerReceipt: true, repositoryReview: true, phase1: true, mergeEligible: true };
  const observed = trustedWave1PostMergeFixture();
  const candidateHead = observed.candidate.head;
  const candidateTree = observed.candidate.tree;
  const shared = {
    record,
    contract: currentTruthContract,
    observedProtectedMainSha: record.mainSha,
    candidateHead,
    finiteTaskRuntime: { sourceOnlyEligible: true, providerDependentEligible: false, candidateTree },
    checkpointTreeObservation: record.protectedMainAuthority.checkpointTree,
    checkpointIsAncestor: true,
    candidateContainsObservedMain: true,
  };
  const omitted = evaluateProtectedMainAdvancement(shared);
  assert.equal(omitted.liveFinalEvidenceRequired, true);
  assert.equal(omitted.mergeEligible, false);
  const honestlyIneligible = evaluateProtectedMainAdvancement({ ...shared, finiteTaskFinalSourceEligibility: { mergeEligible: false, candidateHead, candidateTree } });
  assert.equal(honestlyIneligible.mergeEligible, false);
  assert.equal(honestlyIneligible.findings.includes("FINITE_TASK_IMPLEMENTATION_LIFECYCLE_AUTHORITY_INVALID"), false);
  const plain = { mergeEligible: true, candidateHead, candidateTree };
  assert.equal(evaluateProtectedMainAdvancement({ ...shared, finiteTaskFinalSourceEligibility: plain }).mergeEligible, false);
  assert.equal(evaluateProtectedMainAdvancement({ ...shared, finiteTaskFinalSourceEligibility: observed.transition.lifecycle }).mergeEligible, true);
  assert.equal(evaluateProtectedMainAdvancement({ ...shared, finiteTaskFinalSourceEligibility: structuredClone(observed.transition.lifecycle) }).mergeEligible, false);
  observed.transition.lifecycle.candidateHead = "f".repeat(40);
  assert.equal(evaluateProtectedMainAdvancement({ ...shared, finiteTaskFinalSourceEligibility: observed.transition.lifecycle }).mergeEligible, false);
  assert.equal(evaluateProtectedMainAdvancement({ ...shared, finiteTaskFinalSourceEligibility: { mergeEligible: true, candidateHead: "f".repeat(40), candidateTree } }).mergeEligible, false);
  const legacyRecord = structuredClone(record);
  const legacyLease = finiteTaskLeaseFor(legacyRecord.finiteTaskLeases, {
    implementationPr: legacyRecord.activeTaskBinding.implementationPr,
    implementationBranch: legacyRecord.activeTaskBinding.implementationBranch,
    featureId: legacyRecord.activeTaskBinding.featureId,
  });
  legacyLease.amendmentMaximum = { maximumAmendments: 0, maximumFiles: 0, maximumLines: 0 };
  const legacy = evaluateProtectedMainAdvancement({ ...shared, record: legacyRecord });
  assert.equal(legacy.liveFinalEvidenceRequired, false);
  assert.equal(legacy.mergeEligible, true);
});
test("finite lifecycle: verified post-merge evidence requires exactly one finite-task terminal truth", () => {
  const record = historicalRollingRecord();
  const observed = trustedWave1PostMergeFixture();
  const args = {
    record,
    contract: currentTruthContract,
    observedProtectedMainSha: record.mainSha,
    candidateHead: observed.candidate.head,
    finiteTaskRuntime: { sourceOnlyEligible: true, providerDependentEligible: false, candidateTree: observed.candidate.tree },
    finiteTaskFinalSourceEligibility: observed.transition.lifecycle,
    finiteTaskPostMergeTransition: observed.transition,
    checkpointTreeObservation: record.protectedMainAuthority.checkpointTree,
    checkpointIsAncestor: true,
    candidateContainsObservedMain: false,
  };
  const result = evaluateProtectedMainAdvancement(args);
  assert.equal(result.candidateBaseStatus, "FINITE_TASK_MERGE_VERIFIED_TERMINAL_TRUTH_REQUIRED");
  assert.equal(result.nextRequiredAction, "CREATE_EXACT_FINITE_TASK_TERMINAL_TRUTH");
  assert.equal(result.pendingTransitionCount, 1);
  assert.equal(result.terminalSuccessorRequired, true);
  assert.equal(result.mergeEligible, false);
  assert.ok(evaluateProtectedMainAdvancement({ ...args, finiteTaskPostMergeTransition: structuredClone(observed.transition) }).findings.includes("FINITE_TASK_POST_MERGE_TRANSITION_AUTHORITY_INVALID"));
  observed.transition.findings.push("forged-after-observation");
  assert.ok(evaluateProtectedMainAdvancement(args).findings.includes("FINITE_TASK_POST_MERGE_TRANSITION_AUTHORITY_INVALID"));
});
test("finite lifecycle: terminal projection preserves the immutable base lease and derives the canonical next task", () => {
  const resolution = wave1AmendmentResolution();
  const base = {
    schemaVersion: 1,
    classification: "FINITE_TASK_AMENDED_POST_MERGE_TERMINAL_EVIDENCE_V1",
    repository: "Chillywood2025/chillywood-mobile",
    taskId: wave1Lease.leaseId,
    leaseId: wave1Lease.leaseId,
    implementationPr: wave1Lease.implementationPr,
    implementationBranch: wave1Lease.implementationBranch,
    baseLeaseHash: digest(stableJson(wave1Lease)),
    baseReservation: resolution.baseReservation,
    effectiveReservation: resolution.effectiveReservation,
    amendmentReceipt: { ...resolution.amendmentReceipt, authorityClassification: "LIVE_IMMUTABLE_OWNER_RECEIPT" },
    finalSourceReceipt: { commentId: 820001, createdAt: "2026-08-14T23:00:00Z", subjectHash: "7".repeat(64), bodyHash: "8".repeat(64), rawBodyHash: "9".repeat(64), finalHead: wave1Descendant, finalTree: wave1DescendantTree, effectiveReservationHash: resolution.effectiveReservation.reservationHash, amendmentCommentId: resolution.amendmentReceipt.commentId },
    sourceHead: wave1Descendant,
    sourceTree: wave1DescendantTree,
    mergeSha: "a".repeat(40),
    mergeTree: wave1DescendantTree,
    mergeParents: ["b".repeat(40), wave1Descendant],
    nextTask: canonicalTruth.engineeringDoctrine.nextPermittedAction,
    authority: { providerMutation: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false },
  };
  const evidence = { ...base, evidenceHash: hashValue(base) };
  const originalLease = stableJson(wave1Lease);
  const feature = registry.features.find(({ featureId }) => featureId === canonicalTruth.activeTaskBinding.featureId);
  const projected = projectFiniteTaskTerminalTruth({ record: canonicalTruth, terminalEvidence: evidence, proofTierApplicabilityHash: digest(stableJson(feature.proofTierApplicability)), implementationTitle: "Wave 1" });
  assert.equal(stableJson(finiteTaskLeaseFor(projected.finiteTaskLeases, { implementationPr: 229, implementationBranch: wave1Lease.implementationBranch, featureId: wave1Lease.featureId })), originalLease);
  assert.equal(projected.activeTaskBinding.phase, "TERMINAL");
  assert.equal(projected.finiteTaskRuntime.terminalOutcome.effectiveReservation.reservationHash, resolution.effectiveReservation.reservationHash);
  assert.deepEqual(projected.finiteTaskLeases.completedLeaseOutcomes, [evidence]);
  assert.equal(finiteTaskLeaseEffectivelyTerminal(projected.finiteTaskLeases, wave1Lease), true);
  assert.ok(evaluateFiniteTaskCandidate({ lease: wave1Lease, registry: projected.finiteTaskLeases, candidate: finiteCandidate(wave1Lease, 90) }).findings.includes("FINITE_TASK_TERMINAL"));
  const reorderedPolicy = structuredClone(projected.finiteTaskLeases); reorderedPolicy.amendmentPolicy.domains.find(({ id }) => id === wave1Lease.domain).amendablePaths.reverse(); assert.deepEqual(validateFiniteTaskLeaseRegistry(reorderedPolicy), []);
  assert.match(renderCurrentState(projected), /state `MERGED_VERIFIED`/u);
  assert.deepEqual(projectFiniteTaskTerminalTruth({ record: projected, terminalEvidence: evidence, proofTierApplicabilityHash: digest(stableJson(feature.proofTierApplicability)) }).finiteTaskLeases.completedLeaseOutcomes, [evidence]);
  const conflict = { ...evidence, nextTask: "CONFLICT" }; conflict.evidenceHash = hashValue(Object.fromEntries(Object.entries(conflict).filter(([key]) => key !== "evidenceHash")));
  assert.throws(() => projectFiniteTaskTerminalTruth({ record: projected, terminalEvidence: conflict, proofTierApplicabilityHash: digest(stableJson(feature.proofTierApplicability)) }), /FINITE_TASK_TERMINAL_PROJECTION_CONFLICT/u);
  const preAdmission = preAdmissionFixture(); preAdmission.currentTruth = projected;
  assert.equal(evaluatePreAdmissionEngineeringSeed(preAdmission).ok, true);
  const rebound = structuredClone(projected); rebound.activeTaskBinding = { ...rebound.activeTaskBinding, implementationPr: 230, implementationBranch: "codex/future-task", phase: "PREIMPLEMENTATION_ENGINEERING_CLEAR" };
  assert.equal(finiteTaskLeaseEffectivelyTerminal(rebound.finiteTaskLeases, wave1Lease), true);
  const futureLease = { ...structuredClone(wave1Lease), leaseId: "future-same-domain-v1", implementationPr: 230, implementationBranch: "codex/future-same-domain-v1" };
  const futureRegistry = { ...rebound.finiteTaskLeases, tasks: [...rebound.finiteTaskLeases.tasks, futureLease] };
  assert.equal(evaluateFiniteTaskCandidate({ lease: futureLease, registry: futureRegistry, candidate: finiteCandidate(futureLease, 91) }).ok, true);
  rebound.finiteTaskLeases = futureRegistry; rebound.activeTaskBinding.implementationBranch = futureLease.implementationBranch;
  const futureSourceHead = "c".repeat(40); const futureBase = { ...evidence, taskId: futureLease.leaseId, leaseId: futureLease.leaseId, implementationPr: futureLease.implementationPr, implementationBranch: futureLease.implementationBranch, baseLeaseHash: hashValue(futureLease), amendmentReceipt: { ...evidence.amendmentReceipt, commentId: 810002, subjectHash: "a".repeat(64), bodyHash: "b".repeat(64), rawBodyHash: "c".repeat(64) }, finalSourceReceipt: { ...evidence.finalSourceReceipt, commentId: 820002, subjectHash: "d".repeat(64), bodyHash: "e".repeat(64), rawBodyHash: "f".repeat(64), amendmentCommentId: 810002, finalHead: futureSourceHead }, sourceHead: futureSourceHead, mergeSha: "d".repeat(40), mergeParents: ["e".repeat(40), futureSourceHead] };
  const futureEvidence = { ...futureBase, evidenceHash: hashValue(Object.fromEntries(Object.entries(futureBase).filter(([key]) => key !== "evidenceHash"))) };
  assert.deepEqual(projectFiniteTaskTerminalTruth({ record: rebound, terminalEvidence: futureEvidence, proofTierApplicabilityHash: digest(stableJson(feature.proofTierApplicability)) }).finiteTaskLeases.completedLeaseOutcomes, [evidence, futureEvidence]);
  const replayBase = Object.fromEntries(Object.entries({ ...futureEvidence, amendmentReceipt: evidence.amendmentReceipt, finalSourceReceipt: evidence.finalSourceReceipt, sourceHead: evidence.sourceHead, sourceTree: evidence.sourceTree, mergeSha: evidence.mergeSha, mergeTree: evidence.mergeTree, mergeParents: evidence.mergeParents }).filter(([key]) => key !== "evidenceHash")); const replayEvidence = { ...replayBase, evidenceHash: hashValue(replayBase) };
  const replayedRegistry = structuredClone(futureRegistry); replayedRegistry.completedLeaseOutcomes = [evidence, replayEvidence]; assert.ok(validateFiniteTaskLeaseRegistry(replayedRegistry).includes("FINITE_TASK_COMPLETION_LEDGER_IDENTITY_REUSED")); assert.throws(() => projectFiniteTaskTerminalTruth({ record: rebound, terminalEvidence: replayEvidence, proofTierApplicabilityHash: digest(stableJson(feature.proofTierApplicability)) }), /FINITE_TASK_TERMINAL_PROJECTION_IDENTITY_REUSED/u);
  const tampered = structuredClone(projected); tampered.finiteTaskLeases.completedLeaseOutcomes[0].evidenceHash = "f".repeat(64); preAdmission.currentTruth = tampered;
  assert.equal(finiteTaskLeaseEffectivelyTerminal(tampered.finiteTaskLeases, wave1Lease), false);
  assert.ok(validateFiniteTaskLeaseRegistry(tampered.finiteTaskLeases).includes("FINITE_TASK_COMPLETION_LEDGER_MALFORMED"));
  assert.equal(evaluatePreAdmissionEngineeringSeed(preAdmission).findings.includes("PRE_ADMISSION_ACTIVE_FINITE_TASK"), true);
  const duplicated = structuredClone(projected.finiteTaskLeases); duplicated.completedLeaseOutcomes.push(conflict);
  assert.ok(validateFiniteTaskLeaseRegistry(duplicated).includes("FINITE_TASK_COMPLETION_LEDGER_DUPLICATE"));
  assert.equal(validateTerminalTaskEvidence(projected.activeTaskBinding, projected.latestMergedImplementationPr).length, 0);
  assert.match(renderNextTask(projected), new RegExp(canonicalTruth.engineeringDoctrine.nextPermittedAction, "u"));
  assert.doesNotMatch(renderNextTask(projected), /IMPLEMENT_PRE_RELEASE_WAVE_1_IDENTITY_ENTITLEMENT_AUTHORITY/u);
});
test("finite lifecycle: every real evaluator derives one byte-identical Wave 1 effective reservation", () => {
  const resolution = wave1AmendmentResolution();
  const expectedReservation = stableJson(resolution.effectiveReservation);
  const expectedHash = resolution.effectiveReservation.reservationHash;
  const closedAuthority = { providerMutation: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false };
  const candidate = wave1Candidate({
    repository: "Chillywood2025/chillywood-mobile",
    diffHash: "a".repeat(64),
    changedPathHash: "b".repeat(64),
    findings: { P0: 0, P1: 0, launchImpactingP2: 0 }
  });
  const runtimeGit = (gitArgs) => {
    if (gitArgs[0] === "show-ref" && gitArgs[1] === "--verify" && gitArgs[2] === "--hash") return candidate.head;
    if (gitArgs[0] === "rev-parse") {
      const trees = new Map([
        [`${candidate.head}^{tree}`, candidate.tree],
        [`${wave1Lease.admittedSeedHead}^{tree}`, wave1Lease.admittedSeedTree]
      ]);
      if (trees.has(gitArgs[1])) return trees.get(gitArgs[1]);
    }
    if (gitArgs[0] === "merge-base" && gitArgs[1] === "--is-ancestor") return "";
    if (gitArgs[0] === "diff" && gitArgs[1] === "--name-only") return candidate.changedPaths.join("\n");
    if (gitArgs[0] === "diff" && gitArgs[1] === "--numstat") return `4500\t0\t${candidate.changedPaths[0]}`;
    if (gitArgs[0] === "diff" && gitArgs[1] === "--binary" && gitArgs[2] === "--no-ext-diff") return "synthetic canonical Wave 1 diff";
    throw new Error(`unexpected synthetic runtime git command: ${gitArgs.join(" ")}`);
  };
  const runtime = evaluateFiniteTaskLeaseRuntime({
    record: canonicalTruth,
    contract: currentTruthContract,
    now: new Date("2026-08-14T07:00:00Z"),
    suppliedObservation: candidate,
    currentProtectedBase: wave1BoundBase,
    effectiveReservationResolution: resolution,
    gitCommand: runtimeGit
  });
  assert.ok(runtime.effectiveReservation, stableJson(runtime));
  assert.equal(runtime.effectiveReservation.reservationHash, expectedHash);
  assert.equal(stableJson(runtime.effectiveReservation), expectedReservation);

  const identity = {
    repository: "Chillywood2025/chillywood-mobile",
    pr: wave1Lease.implementationPr,
    branch: wave1Lease.implementationBranch,
    baseSha: wave1BoundBase,
    headSha: candidate.head
  };
  const scope = {
    files: candidate.changedPaths,
    additions: 2250,
    deletions: 2250,
    netChangedLines: 0,
    diffHash: candidate.diffHash
  };
  const reviewSubject = architectureRepositoryReviewSubject({
    identity,
    tree: candidate.tree,
    scope,
    profile: FINITE_TASK_IMPLEMENTATION_EFFECTIVE_RESERVATION_V1,
    effectiveReservationResolution: resolution
  });
  assert.equal(reviewSubject.finiteTaskEffectiveReservation.effectiveReservation.reservationHash, expectedHash);
  assert.deepEqual(reviewSubject.finiteTaskEffectiveReservation.effectiveReservation, {
    reservationHash: expectedHash,
    pathSetHash: hashValue(resolution.effectiveReservation.allowedPaths),
    eligiblePathCount: 32,
    maximumFiles: 32,
    maximumLines: 4500
  });

  const phase1Evidence = {
    runId: 900050,
    runAttempt: 1,
    sourceHead: candidate.head,
    sourceTree: candidate.tree,
    requiredJobs: 13,
    passedJobs: 13,
    result: "PASS_13_OF_13",
    evidenceHash: "c".repeat(64),
    valid: true
  };
  const finalSubject = finiteTaskFinalReceiptSubject({
    schemaVersion: 2,
    policyId: "ASSURANCE_FINITE_TASK_LEASE_V1",
    repository: identity.repository,
    featureId: wave1Lease.featureId,
    implementationPr: wave1Lease.implementationPr,
    implementationBranch: wave1Lease.implementationBranch,
    admittedSeedHead: wave1Lease.admittedSeedHead,
    finalHead: candidate.head,
    finalTree: candidate.tree,
    diffHash: candidate.diffHash,
    changedPathHash: candidate.changedPathHash,
    scopeResult: "PASS",
    callDomainClosureLedgerHash: "d".repeat(64),
    focusedTestHash: "e".repeat(64),
    mutationNegativeControlHash: "f".repeat(64),
    repositoryReviewHash: hashValue(reviewSubject),
    phase1RunId: phase1Evidence.runId,
    phase1Head: candidate.head,
    baseLeaseHash: resolution.baseLeaseHash,
    baseReservation: resolution.baseReservation,
    effectiveReservation: resolution.effectiveReservation,
    amendmentReceipt: resolution.amendmentReceipt,
    authority: closedAuthority
  });
  const rawComment = (id, body) => ({
    id,
    node_id: `IC_wave1_convergence_${id}`,
    user: { login: "Chillywood2025" },
    author_association: "OWNER",
    created_at: "2026-08-14T23:00:00Z",
    updated_at: "2026-08-14T23:00:00Z",
    issue_url: `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${wave1Lease.implementationPr}`,
    html_url: `https://github.com/Chillywood2025/chillywood-mobile/pull/${wave1Lease.implementationPr}#issuecomment-${id}`,
    body
  });
  const lifecycle = verifyFiniteTaskImplementationLifecycle({
    identity,
    tree: candidate.tree,
    scope,
    finiteTaskAuthority: {
      ok: true,
      candidate,
      baseLease: wave1Lease,
      effectiveReservationResolution: resolution
    },
    comments: [
      rawComment(820050, architectureRepositoryReviewCommentBody(reviewSubject)),
      rawComment(820051, finiteTaskFinalReceiptBody(finalSubject))
    ],
    commentsPaginationComplete: true,
    phase1EvidenceResolver: () => phase1Evidence
  });
  assert.equal(lifecycle.mergeEligible, false);
  assert.ok(lifecycle.findings.includes("FINITE_TASK_LIFECYCLE_EFFECTIVE_RESERVATION_INVALID"));
  assert.equal(lifecycle.effectiveReservationHash, expectedHash);
  assert.equal(stableJson(lifecycle.effectiveReservation), expectedReservation);
  assert.equal(lifecycle.finalSourceSubject.effectiveReservation.reservationHash, expectedHash);
  assert.equal(stableJson(lifecycle.finalSourceSubject.effectiveReservation), expectedReservation);

  const mergeTree = "7".repeat(40);
  const mergeProvenance = verifyFiniteTaskMergeProvenance({
    lease: wave1Lease,
    receiptSubject: lifecycle.finalSourceSubject,
    currentProtectedBase: wave1BoundBase,
    mergeRef: {
      pr: wave1Lease.implementationPr,
      branch: wave1Lease.implementationBranch,
      parents: [wave1BoundBase, candidate.head],
      sourceTree: candidate.tree,
      tree: mergeTree
    },
    actualMerge: { parents: [wave1BoundBase, candidate.head], tree: mergeTree },
    effectiveReservationResolution: resolution
  });
  assert.equal(lifecycle.finalSourceSubject.effectiveReservation.reservationHash, expectedHash);
  assert.deepEqual(mergeProvenance.findings, ["FINITE_MERGE_EFFECTIVE_RESERVATION_MISMATCH"]);

  const terminalBase = {
    schemaVersion: 1,
    classification: "FINITE_TASK_AMENDED_POST_MERGE_TERMINAL_EVIDENCE_V1",
    repository: identity.repository,
    taskId: wave1Lease.leaseId,
    leaseId: wave1Lease.leaseId,
    implementationPr: wave1Lease.implementationPr,
    implementationBranch: wave1Lease.implementationBranch,
    baseLeaseHash: resolution.baseLeaseHash,
    baseReservation: resolution.baseReservation,
    effectiveReservation: resolution.effectiveReservation,
    amendmentReceipt: { ...resolution.amendmentReceipt, authorityClassification: "LIVE_IMMUTABLE_OWNER_RECEIPT" },
    finalSourceReceipt: { commentId: 820051, createdAt: "2026-08-14T23:00:00Z", subjectHash: "8".repeat(64), bodyHash: "9".repeat(64), rawBodyHash: "0".repeat(64), finalHead: candidate.head, finalTree: candidate.tree, effectiveReservationHash: expectedHash, amendmentCommentId: resolution.amendmentReceipt.commentId },
    sourceHead: candidate.head,
    sourceTree: candidate.tree,
    mergeSha: "1".repeat(40),
    mergeTree: candidate.tree,
    mergeParents: [wave1BoundBase, candidate.head],
    nextTask: canonicalTruth.engineeringDoctrine.nextPermittedAction,
    authority: closedAuthority
  };
  const terminalEvidence = { ...terminalBase, evidenceHash: hashValue(terminalBase) };
  const feature = registry.features.find(({ featureId }) => featureId === canonicalTruth.activeTaskBinding.featureId);
  const terminalTruth = projectFiniteTaskTerminalTruth({
    record: canonicalTruth,
    terminalEvidence,
    proofTierApplicabilityHash: digest(stableJson(feature.proofTierApplicability)),
    implementationTitle: "Wave 1"
  });
  assert.equal(terminalTruth.finiteTaskRuntime.terminalOutcome.effectiveReservation.reservationHash, expectedHash);
  assert.equal(stableJson(terminalTruth.finiteTaskRuntime.terminalOutcome.effectiveReservation), expectedReservation);

  const consumerHashes = [
    resolution.effectiveReservation.reservationHash,
    runtime.effectiveReservation.reservationHash,
    reviewSubject.finiteTaskEffectiveReservation.effectiveReservation.reservationHash,
    lifecycle.effectiveReservationHash,
    lifecycle.finalSourceSubject.effectiveReservation.reservationHash,
    terminalTruth.finiteTaskRuntime.terminalOutcome.effectiveReservation.reservationHash
  ];
  assert.deepEqual([...new Set(consumerHashes)], [expectedHash]);
  assert.equal(finiteTaskEffectiveReservationAuthorityValid(resolution), false);
});

const wave1AmendmentBodyMutation = (mutate) => {
  const body = taskLeaseAmendmentCommentBody(wave1AmendmentSubject());
  const separator = body.indexOf("\n");
  const marker = body.slice(0, separator);
  const envelope = JSON.parse(body.slice(separator + 1));
  mutate(envelope);
  return `${marker}\n${stableJson(envelope)}`;
};

test("finite amendment resolver: subject body and raw comment hash corruption fail explicitly", () => {
  const corruptedBodies = [
    wave1AmendmentBodyMutation((envelope) => { envelope.subjectHash = "f".repeat(64); }),
    wave1AmendmentBodyMutation((envelope) => { envelope.bodyHash = "f".repeat(64); }),
    `${taskLeaseAmendmentCommentBody(wave1AmendmentSubject())} `
  ];
  for (const body of corruptedBodies) {
    const result = wave1AmendmentResolution({ raw: { body } });
    assert.equal(result.ok, false);
    assert.ok(result.findings.includes("FINITE_TASK_LEASE_AMENDMENT_COMMENT_INVALID"));
  }
});

test("finite amendment resolver: every prohibited authority flag fails closed", () => {
  const closed = { providerMutation: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false };
  for (const flag of Object.keys(closed)) {
    const result = wave1AmendmentResolution({
      subject: wave1AmendmentSubject({ authority: { ...closed, [flag]: true } })
    });
    assert.equal(result.ok, false, flag);
    assert.ok(result.findings.includes("FINITE_TASK_LEASE_AMENDMENT_MALFORMED"), flag);
  }
});

test("finite amendment resolver: frozen admission Owner approval and jurisdiction receipts remain byte-identical", () => {
  assert.equal(wave1Lease.protectedAdmissionPr, 233);
  assert.equal(canonicalTruth.preReleaseWave1Admission.admissionPr, 233);
  assert.equal(canonicalTruth.preReleaseWave1Admission.leaseHash, "2fda855fda70c08a038afe72e4ad7e5240c38bb484e44010e735b017a254152a");
  assert.deepEqual(wave1Lease.ownerApproval, {
    commentId: 5285464582,
    subjectHash: "65123660102dc13aa1a0583b2acd497d221dfefdb9224ca2e12f08bb98224e43",
    rawBodyHash: "b7eca07028b1837df1bc87dad6d4b78fe91aecf4b47fcdddab833f50dc22c77f"
  });
  assert.deepEqual(wave1AuthorityEvidence.jurisdictionDecision, {
    commentId: 5296932596,
    subjectHash: "b3813943515ca3086583f3bb48c149977a885235aed3ba84565da2d1cac28eb2",
    bodyHash: "6f454d6e18babcdbf581fd41b0ae54f7aa30cef26cf1ace1d925997be61f01eb",
    envelopeHash: "0ddb3d068284e21ca3aae9d3d277db8bc557674123ce8c6224e02456bda3c43c"
  });
});

function trustedWave1PostMergeFixture({ pullState = "closed", retainedEvidence = () => [] } = {}) {
  const mergeSha = "5e595e684f4dcc9454eee5065066e1b48d20e3eb";
  const candidate = wave1Candidate({
    prState: "closed",
    diffHash: "a".repeat(64),
    changedPathHash: digest(stableJson(wave1ImplementationPaths)),
  });
  const mergeTree = candidate.tree;
  const amendmentComment = {
    id: 810001,
    user: { login: "Chillywood2025" },
    author_association: "OWNER",
    created_at: "2026-08-14T22:00:00Z",
    updated_at: "2026-08-14T22:00:00Z",
    issue_url: "https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/229",
    body: taskLeaseAmendmentCommentBody(wave1AmendmentSubject())
  };
  const pullRequest = {
    number: wave1Lease.implementationPr,
    state: pullState,
    merged: pullState === "closed",
    merged_at: pullState === "closed" ? "2026-08-14T23:30:00Z" : null,
    merge_commit_sha: pullState === "closed" ? mergeSha : null,
    head: { ref: wave1Lease.implementationBranch, sha: candidate.head, repo: { full_name: "Chillywood2025/chillywood-mobile" } },
    base: { ref: "main", sha: wave1BoundBase, repo: { full_name: "Chillywood2025/chillywood-mobile" } }
  };
  const commits = [
    { sha: wave1BoundStart, commit: { tree: { sha: wave1BoundStartTree } } },
    { sha: candidate.head, commit: { tree: { sha: candidate.tree } } }
  ];
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "finite-task-post-merge-live-"));
  const fakeGh = path.join(temporary, "gh");
  const commitsOutput = JSON.stringify([commits]);
  const pullOutput = JSON.stringify(pullRequest);
  const writeGh = (comments) => { fs.writeFileSync(fakeGh, `#!/usr/bin/env node\nconst endpoint = process.argv.at(-1);\nif (endpoint.includes("/comments?")) process.stdout.write(${JSON.stringify(JSON.stringify([comments]))});\nelse if (endpoint.includes("/commits?")) process.stdout.write(${JSON.stringify(commitsOutput)});\nelse process.stdout.write(${JSON.stringify(pullOutput)});\n`); fs.chmodSync(fakeGh, 0o755); };
  writeGh([amendmentComment]);
  const originalPath = process.env.PATH;
  let liveObservation;
  try {
    process.env.PATH = `${temporary}:${originalPath}`;
    liveObservation = observeLiveFiniteTaskEffectiveReservation({
      repository: "Chillywood2025/chillywood-mobile",
      pr: wave1Lease.implementationPr,
      authorityEvidence: wave1AuthorityEvidence
    });
  } finally {
    process.env.PATH = originalPath;
  }
  const gitCommand = (gitArgs) => {
    if (gitArgs[0] === "show-ref") throw new Error("implementation branch deleted after merge");
    if (gitArgs[0] === "rev-parse") {
      const trees = new Map([
        [`${wave1BoundBase}^{tree}`, wave1BoundBaseTree],
        [`${wave1BoundStart}^{tree}`, wave1BoundStartTree],
        [`${wave1Lease.admittedSeedHead}^{tree}`, wave1Lease.admittedSeedTree],
        [`${wave1Descendant}^{tree}`, wave1DescendantTree]
      ]);
      if (trees.has(gitArgs[1])) return trees.get(gitArgs[1]);
    }
    if (gitArgs[0] === "merge-base" && gitArgs[1] === "--is-ancestor") return "";
    if (gitArgs[0] === "merge-base") return wave1BoundBase;
    if (gitArgs[0] === "diff" && gitArgs[1] === "--name-only") {
      return gitArgs.at(-1) === `${wave1BoundBase}...${wave1BoundStart}`
        ? wave1Lease.artifactReservation.closureArtifactPath
        : candidate.changedPaths.join("\n");
    }
    if (gitArgs[0] === "diff" && gitArgs[1] === "--numstat") {
      return gitArgs.at(-1) === `${wave1BoundBase}...${wave1BoundStart}`
        ? `1\t0\t${wave1Lease.artifactReservation.closureArtifactPath}`
        : `4500\t0\t${candidate.changedPaths[0]}`;
    }
    if (gitArgs[0] === "diff" && gitArgs[1] === "--binary") return "verified post-merge Wave 1 source diff";
    throw new Error(`unexpected post-merge git command: ${gitArgs.join(" ")}`);
  };
  let resolution = resolveFiniteTaskEffectiveReservation({
    registry: canonicalTruth.finiteTaskLeases,
    lease: wave1Lease,
    candidate,
    liveObservation,
    gitCommand
  });
  const identity = { repository: "Chillywood2025/chillywood-mobile", pr: 229, branch: wave1Lease.implementationBranch, baseSha: wave1BoundBase, headSha: candidate.head };
  const scope = { files: candidate.changedPaths, additions: 2250, deletions: 2250, netChangedLines: 0, diffHash: "a".repeat(64) };
  const reviewSubject = architectureRepositoryReviewSubject({ identity, tree: candidate.tree, scope, profile: FINITE_TASK_IMPLEMENTATION_EFFECTIVE_RESERVATION_V1, effectiveReservationResolution: resolution });
  const phaseBody = { runId: 900060, sourceHead: candidate.head, sourceTree: candidate.tree, result: "PASS_13_OF_13" };
  const phase1Evidence = { ...phaseBody, valid: true, evidenceHash: hashValue(phaseBody) };
  const finalSourceSubject = finiteTaskFinalReceiptSubject({
    schemaVersion: 2,
    policyId: "ASSURANCE_FINITE_TASK_LEASE_V1",
    repository: identity.repository,
    featureId: wave1Lease.featureId,
    implementationPr: wave1Lease.implementationPr,
    implementationBranch: wave1Lease.implementationBranch,
    admittedSeedHead: wave1Lease.admittedSeedHead,
    finalHead: candidate.head,
    finalTree: candidate.tree,
    diffHash: candidate.diffHash,
    changedPathHash: candidate.changedPathHash,
    scopeResult: "PASS",
    callDomainClosureLedgerHash: "b".repeat(64),
    focusedTestHash: "c".repeat(64),
    mutationNegativeControlHash: "d".repeat(64),
    repositoryReviewHash: hashValue(reviewSubject),
    phase1RunId: phaseBody.runId,
    phase1Head: candidate.head,
    baseLeaseHash: resolution.baseLeaseHash,
    baseReservation: resolution.baseReservation,
    effectiveReservation: resolution.effectiveReservation,
    amendmentReceipt: resolution.amendmentReceipt,
    authority: { providerMutation: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false },
  });
  const immutable = (id, body) => wave1ImmutableComment(id, body, "2026-08-14T23:00:00Z");
  const reviewComment = immutable(810002, architectureRepositoryReviewCommentBody(reviewSubject));
  const finalComment = immutable(810003, finiteTaskFinalReceiptBody(finalSourceSubject));
  const retainedComments = retainedEvidence({ immutable, reviewComment, finalComment, reviewSubject, finalSourceSubject });
  writeGh([amendmentComment, ...retainedComments, reviewComment, finalComment]);
  try { process.env.PATH = `${temporary}:${originalPath}`; liveObservation = observeLiveFiniteTaskEffectiveReservation({ repository: "Chillywood2025/chillywood-mobile", pr: 229, authorityEvidence: wave1AuthorityEvidence }); }
  finally { process.env.PATH = originalPath; fs.rmSync(temporary, { recursive: true, force: true }); }
  resolution = resolveFiniteTaskEffectiveReservation({ registry: canonicalTruth.finiteTaskLeases, lease: wave1Lease, candidate, liveObservation, gitCommand });
  const lifecycle = verifyFiniteTaskImplementationLifecycle({
    identity,
    tree: candidate.tree,
    scope,
    finiteTaskAuthority: { ok: true, candidate, baseLease: wave1Lease, effectiveReservationResolution: resolution },
    comments: liveObservation.comments,
    commentsPaginationComplete: true,
    phase1EvidenceResolver: () => phase1Evidence,
  });
  const normalizedFinalReceipt = lifecycle.finalSource.receipt;
  const terminalBase = {
    schemaVersion: 1,
    classification: "FINITE_TASK_AMENDED_POST_MERGE_TERMINAL_EVIDENCE_V1",
    repository: "Chillywood2025/chillywood-mobile",
    taskId: wave1Lease.leaseId,
    leaseId: wave1Lease.leaseId,
    implementationPr: wave1Lease.implementationPr,
    implementationBranch: wave1Lease.implementationBranch,
    baseLeaseHash: resolution.baseLeaseHash,
    baseReservation: resolution.baseReservation,
    effectiveReservation: resolution.effectiveReservation,
    amendmentReceipt: resolution.amendmentReceipt,
    finalSourceReceipt: normalizedFinalReceipt,
    sourceHead: candidate.head,
    sourceTree: candidate.tree,
    mergeSha,
    mergeTree,
    mergeParents: [wave1BoundBase, candidate.head],
    nextTask: canonicalTruth.engineeringDoctrine.nextPermittedAction,
    authority: { providerMutation: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false }
  };
  const terminalEvidence = { ...terminalBase, evidenceHash: hashValue(terminalBase) };
  const transition = {
    applicable: true,
    ok: true,
    consumed: false,
    baseLeaseUnchanged: true,
    lifecycle,
    mergeProvenance: { ok: true, syntheticMergeTree: mergeTree, findings: [] },
    terminalEvidence,
    findings: []
  };
  registerVerifiedFiniteTaskImplementationLifecycle({ lifecycle: transition.lifecycle, effectiveReservationResolution: resolution, liveObservation });
  registerVerifiedFiniteTaskPostMergeTransition({ lease: wave1Lease, liveObservation, postMergeTransition: transition });
  return {
    candidate,
    currentFinal: finalComment,
    currentReview: reviewComment,
    gitCommand,
    liveObservation,
    retainedComments,
    resolution,
    transition
  };
}

test("finite post-merge and terminal runtime retain stale review/final history while duplicate current evidence fails closed", () => {
  const fixture = trustedWave1PostMergeFixture({
    retainedEvidence: ({ immutable, reviewSubject, finalSourceSubject }) => {
      const staleReview = structuredClone(reviewSubject);
      staleReview.reviewedHead = "0".repeat(40);
      staleReview.reviewedTree = "1".repeat(40);
      const staleFinal = structuredClone(finalSourceSubject);
      staleFinal.finalHead = "0".repeat(40);
      staleFinal.finalTree = "1".repeat(40);
      return [
        immutable(810010, architectureRepositoryReviewCommentBody(staleReview)),
        immutable(810011, finiteTaskFinalReceiptBody(staleFinal)),
        immutable(810012, "<!-- chillywood-assurance-repository-review-v1 -->\n{malformed"),
        immutable(810013, "<!-- chillywood-assurance-final-task-receipt-v1 -->\n{malformed"),
      ];
    },
  });
  assert.equal(fixture.retainedComments.length, 4);
  assert.equal(fixture.transition.lifecycle.mergeEligible, true, stableJson({
    findings: fixture.transition.lifecycle.findings,
    reviews: fixture.transition.lifecycle.repositoryReviewClassifications,
    finals: fixture.transition.lifecycle.finalSource.receiptClassifications,
  }));
  assert.equal(fixture.transition.lifecycle.repositoryReview.commentId, fixture.currentReview.id);
  assert.equal(fixture.transition.lifecycle.finalSource.receipt.commentId, fixture.currentFinal.id);
  assert.equal(finiteTaskImplementationLifecycleAuthorityValid(fixture.transition.lifecycle), true);
  assert.equal(finiteTaskPostMergeTransitionAuthorityValid(fixture.transition), true);
  assert.equal(finiteTaskTerminalReservationMatchesOutcome({ terminalOutcome: fixture.transition.terminalEvidence, reservationResolution: fixture.resolution }), true);
  const mergeRef = {
    pr: wave1Lease.implementationPr,
    branch: wave1Lease.implementationBranch,
    parents: fixture.transition.terminalEvidence.mergeParents,
    sourceTree: fixture.transition.terminalEvidence.sourceTree,
    tree: fixture.transition.terminalEvidence.mergeTree,
  };
  assert.equal(verifyFiniteTaskMergeProvenance({
    lease: wave1Lease,
    receiptSubject: fixture.transition.lifecycle.finalSourceSubject,
    currentProtectedBase: fixture.transition.terminalEvidence.mergeParents[0],
    mergeRef,
    effectiveReservationResolution: fixture.resolution,
  }).ok, true);
  const runtime = evaluateFiniteTaskLeaseRuntime({
    record: canonicalTruth,
    lease: wave1Lease,
    suppliedObservation: { pr: 229, branch: wave1Lease.implementationBranch, prState: "open", head: wave1BoundStart },
    currentProtectedBase: fixture.transition.terminalEvidence.mergeSha,
    effectiveReservationObservation: fixture.liveObservation,
    finiteTaskPostMergeTransition: fixture.transition,
    gitCommand: fixture.gitCommand,
    contract: currentTruthContract,
    now: new Date("2026-08-14T07:00:00Z"),
  });
  assert.equal(runtime.candidateEligible, true, stableJson(runtime.findings));

  const terminalEvidence = fixture.transition.terminalEvidence;
  const feature = registry.features.find(({ featureId }) => featureId === wave1Lease.featureId);
  const terminalTruth = projectFiniteTaskTerminalTruth({ record: canonicalTruth, terminalEvidence, proofTierApplicabilityHash: digest(stableJson(feature.proofTierApplicability)), implementationTitle: "Wave 1 immutable-evidence convergence" });
  const terminalIdentity = { repository: terminalEvidence.repository, pr: 999, branch: "codex/finite-task-terminal-truth-v1", baseRef: "main", baseSha: terminalEvidence.mergeSha, headSha: "9".repeat(40) };
  const terminalTree = "a".repeat(40);
  const terminalScope = { files: ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"], additions: 40, deletions: 10, netChangedLines: 30, diffHash: "b".repeat(64) };
  const priorTruthHash = hashValue(stableJson(canonicalTruth));
  const terminalComment = (id, body) => ({ id, node_id: `IC_terminal_${id}`, user: { login: "Chillywood2025" }, author_association: "OWNER", body, created_at: "2026-08-15T05:00:00Z", updated_at: "2026-08-15T05:00:00Z", issue_url: `https://api.github.com/repos/${terminalIdentity.repository}/issues/${terminalIdentity.pr}`, html_url: `https://github.com/${terminalIdentity.repository}/pull/${terminalIdentity.pr}#issuecomment-${id}` });
  const terminalOwnerSubject = finiteTaskTerminalTruthSubject({ identity: terminalIdentity, tree: terminalTree, scope: terminalScope, terminalTransition: fixture.transition, priorTruthHash });
  const terminalOwner = terminalComment(830001, finiteTaskTerminalTruthOwnerCommentBody(terminalOwnerSubject));
  const terminalReviewSubject = architectureRepositoryReviewSubject({ identity: terminalIdentity, tree: terminalTree, scope: terminalScope, profile: FINITE_TASK_TERMINAL_TRUTH_V1 });
  const terminalReview = terminalComment(830002, architectureRepositoryReviewCommentBody(terminalReviewSubject));
  const terminalRun = { id: 930001, run_attempt: 1, name: "Phase 1 CI", event: "pull_request", status: "completed", conclusion: "success", head_sha: terminalIdentity.headSha, head_branch: terminalIdentity.branch, pull_requests: [{ number: terminalIdentity.pr, head: { sha: terminalIdentity.headSha }, base: { sha: terminalIdentity.baseSha } }] };
  const terminalJobs = PHASE1_REQUIRED_JOB_NAMES.map((name, index) => ({ id: index + 1, name, status: "completed", conclusion: "success", head_sha: terminalIdentity.headSha }));
  const terminalPhase1 = verifyPhase1RunEvidence({ run: terminalRun, jobs: terminalJobs, identity: terminalIdentity, tree: terminalTree });
  const terminalFinalSubject = finiteTaskTerminalTruthFinalSourceSubject({ identity: terminalIdentity, tree: terminalTree, scope: terminalScope, ownerRaw: terminalOwner, repositoryReviewRaw: terminalReview, phase1Evidence: terminalPhase1, terminalTransition: fixture.transition });
  const terminalFinal = terminalComment(830003, finiteTaskTerminalTruthFinalSourceOwnerCommentBody(terminalFinalSubject));
  const terminalAuthority = verifyFiniteTaskTerminalTruthAuthority({ raw: terminalOwner, allComments: [terminalOwner, terminalReview, terminalFinal], paginationComplete: true, identity: terminalIdentity, tree: terminalTree, scope: terminalScope, terminalTransition: fixture.transition, priorTruthHash, priorTruth: canonicalTruth, truthRecord: terminalTruth, currentStateText: renderCurrentState(terminalTruth), nextTaskText: renderNextTask(terminalTruth), currentMain: terminalEvidence.mergeSha, openTerminalSuccessorCount: 1, transitionPreviouslyConsumed: false, ancestryVerified: true, phase1EvidenceResolver: () => terminalPhase1 });
  assert.equal(terminalAuthority.authorizationOk, true, stableJson(terminalAuthority.findings));
  assert.equal(terminalAuthority.mergeEligible, true, stableJson(terminalAuthority.mergeFindings));
  assert.equal(terminalAuthority.currentFinalSourceReceiptId, terminalFinal.id);
  assert.equal(finiteTaskLeaseEffectivelyTerminal(terminalTruth.finiteTaskLeases, wave1Lease), true);
  assert.deepEqual(validateTerminalTaskEvidence(terminalTruth.activeTaskBinding, terminalTruth.latestMergedImplementationPr), []);
  assert.equal(terminalTruth.engineeringDoctrine.nextPermittedAction, "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE");

  const duplicate = trustedWave1PostMergeFixture({
    retainedEvidence: ({ immutable, reviewSubject, finalSourceSubject }) => [
      immutable(810020, architectureRepositoryReviewCommentBody(reviewSubject)),
      immutable(810021, finiteTaskFinalReceiptBody(finalSourceSubject)),
    ],
  });
  assert.equal(finiteTaskImplementationLifecycleAuthorityValid(duplicate.transition.lifecycle), false);
  assert.equal(finiteTaskPostMergeTransitionAuthorityValid(duplicate.transition), false);
});

test("finite runtime post-merge: a deleted implementation ref retains only the verified normal-merge source", () => {
  const fixture = trustedWave1PostMergeFixture();
  assert.equal(finiteTaskEffectiveReservationAuthorityValid(fixture.resolution), true, stableJson(fixture.resolution));
  assert.equal(finiteTaskPostMergeTransitionAuthorityValid(fixture.transition), true);
  const amendedMergeRef = {
    pr: wave1Lease.implementationPr,
    branch: wave1Lease.implementationBranch,
    parents: fixture.transition.terminalEvidence.mergeParents,
    sourceTree: fixture.transition.terminalEvidence.sourceTree,
    tree: fixture.transition.terminalEvidence.mergeTree,
  };
  assert.equal(verifyFiniteTaskMergeProvenance({
    lease: wave1Lease,
    receiptSubject: fixture.transition.lifecycle.finalSourceSubject,
    currentProtectedBase: fixture.transition.terminalEvidence.mergeParents[0],
    mergeRef: amendedMergeRef,
    effectiveReservationResolution: fixture.resolution,
  }).ok, true);
  const amendedV1 = finiteTaskFinalReceiptSubject({
    ...fixture.transition.lifecycle.finalSourceSubject,
    schemaVersion: 1,
  });
  assert.ok(verifyFiniteTaskMergeProvenance({
    lease: wave1Lease,
    receiptSubject: amendedV1,
    currentProtectedBase: fixture.transition.terminalEvidence.mergeParents[0],
    mergeRef: amendedMergeRef,
    effectiveReservationResolution: fixture.resolution,
  }).findings.includes("FINITE_MERGE_EFFECTIVE_RESERVATION_MISMATCH"));
  const rehashTransitionEvidence = (evidence) => {
    const body = Object.fromEntries(Object.entries(evidence).filter(([key]) => key !== "evidenceHash"));
    return { ...body, evidenceHash: hashValue(body) };
  };
  const crossGenerationEvidence = rehashTransitionEvidence({ ...fixture.transition.terminalEvidence, schemaVersion: 2 });
  const crossGenerationTransition = {
    ...fixture.transition,
    lifecycle: fixture.transition.lifecycle,
    terminalEvidence: crossGenerationEvidence,
  };
  registerVerifiedFiniteTaskPostMergeTransition({
    lease: wave1Lease,
    liveObservation: fixture.liveObservation,
    postMergeTransition: crossGenerationTransition,
  });
  assert.equal(finiteTaskPostMergeTransitionAuthorityValid(crossGenerationTransition), false);
  const substitutedReceiptEvidence = structuredClone(fixture.transition.terminalEvidence);
  substitutedReceiptEvidence.finalSourceReceipt.commentId += 1;
  const substitutedReceiptTransition = {
    ...fixture.transition,
    lifecycle: fixture.transition.lifecycle,
    terminalEvidence: rehashTransitionEvidence(substitutedReceiptEvidence),
  };
  registerVerifiedFiniteTaskPostMergeTransition({
    lease: wave1Lease,
    liveObservation: fixture.liveObservation,
    postMergeTransition: substitutedReceiptTransition,
  });
  assert.equal(finiteTaskPostMergeTransitionAuthorityValid(substitutedReceiptTransition), false);
  const substitutedMergeTreeEvidence = rehashTransitionEvidence({
    ...fixture.transition.terminalEvidence,
    mergeTree: "f".repeat(40),
  });
  const substitutedMergeTreeTransition = {
    ...fixture.transition,
    lifecycle: fixture.transition.lifecycle,
    terminalEvidence: substitutedMergeTreeEvidence,
  };
  registerVerifiedFiniteTaskPostMergeTransition({
    lease: wave1Lease,
    liveObservation: fixture.liveObservation,
    postMergeTransition: substitutedMergeTreeTransition,
  });
  assert.equal(finiteTaskPostMergeTransitionAuthorityValid(substitutedMergeTreeTransition), false);
  const input = {
    record: canonicalTruth,
    lease: wave1Lease,
    suppliedObservation: { pr: 229, branch: wave1Lease.implementationBranch, prState: "open", head: wave1BoundStart },
    currentProtectedBase: fixture.transition.terminalEvidence.mergeSha,
    effectiveReservationObservation: fixture.liveObservation,
    finiteTaskPostMergeTransition: fixture.transition,
    gitCommand: fixture.gitCommand
  };
  const derived = deriveFiniteTaskCandidateObservation(input);
  assert.equal(derived.ok, true, stableJson(derived));
  assert.equal(derived.candidate.observationSource, "LIVE_GITHUB_VERIFIED_POST_MERGE_SOURCE");
  assert.equal(derived.candidate.prState, "closed");
  assert.equal(derived.candidate.head, wave1Descendant);
  assert.equal(derived.candidate.scopeBase, wave1BoundBase);
  assert.equal(evaluateFiniteTaskCandidate({ lease: fixture.resolution.effectiveLease, registry: canonicalTruth.finiteTaskLeases, candidate: derived.candidate }).ok, true);
  const runtime = evaluateFiniteTaskLeaseRuntime({
    ...input,
    contract: currentTruthContract,
    now: new Date("2026-08-14T07:00:00Z")
  });
  assert.equal(runtime.candidateEligible, true, stableJson(runtime.findings));
  assert.equal(runtime.candidateHead, wave1Descendant);
  const entry = {
    number: wave1Lease.implementationPr,
    branch: wave1Lease.implementationBranch,
    head: wave1BoundStart,
    featureId: wave1Lease.featureId,
    state: "open-draft-current"
  };
  const headBindingInput = {
    openImplementationPrs: [entry],
    observedRefs: { [implementationRemoteRef(wave1Lease.implementationBranch)]: null },
    finiteTaskLeases: canonicalTruth.finiteTaskLeases,
    branch: "main",
    head: fixture.transition.terminalEvidence.mergeSha,
    remoteMain: fixture.transition.terminalEvidence.mergeSha,
    effectiveReservationResolution: runtime.effectiveReservationResolution,
    effectiveReservationObservation: fixture.liveObservation,
    finiteTaskPostMergeTransition: fixture.transition
  };
  const headBindings = verifyCurrentTruthHeadBindings(headBindingInput);
  assert.equal(headBindings.ok, true, stableJson(headBindings.findings));
  assert.equal(headBindings.bindings[0].classification, "FINITE_TASK_VERIFIED_POST_MERGE_SOURCE");
  assert.equal(headBindings.bindings[0].remoteRefHead, null);
  assert.equal(headBindings.bindings[0].observedHead, wave1Descendant);

  const clonedObservation = structuredClone(fixture.liveObservation);
  const synthetic = deriveFiniteTaskCandidateObservation({ ...input, effectiveReservationObservation: clonedObservation });
  assert.equal(synthetic.ok, false);
  assert.ok(synthetic.findings.includes("FINITE_TASK_LOCAL_OBSERVATION_MALFORMED"));
  const syntheticBinding = verifyCurrentTruthHeadBindings({ ...headBindingInput, effectiveReservationObservation: clonedObservation });
  assert.equal(syntheticBinding.ok, false);
  assert.ok(syntheticBinding.findings.some(({ id }) => id === "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_REF_MISSING"));

  const forgedTransition = structuredClone(fixture.transition);
  forgedTransition.terminalEvidence.sourceHead = "a".repeat(40);
  forgedTransition.terminalEvidence.mergeParents[1] = forgedTransition.terminalEvidence.sourceHead;
  forgedTransition.lifecycle.candidateHead = forgedTransition.terminalEvidence.sourceHead;
  forgedTransition.lifecycle.finalSourceSubject.finalHead = forgedTransition.terminalEvidence.sourceHead;
  const forgedBody = { ...forgedTransition.terminalEvidence };
  delete forgedBody.evidenceHash;
  forgedTransition.terminalEvidence.evidenceHash = hashValue(forgedBody);
  const unrelated = deriveFiniteTaskCandidateObservation({ ...input, finiteTaskPostMergeTransition: forgedTransition });
  assert.equal(unrelated.ok, false);
  assert.ok(unrelated.findings.includes("FINITE_TASK_LOCAL_OBSERVATION_MALFORMED"));
  const unrelatedBinding = verifyCurrentTruthHeadBindings({ ...headBindingInput, finiteTaskPostMergeTransition: forgedTransition });
  assert.equal(unrelatedBinding.ok, false);
  assert.ok(unrelatedBinding.findings.some(({ id }) => id === "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_REF_MISSING"));

  const openFixture = trustedWave1PostMergeFixture({ pullState: "open" });
  const openMissingRef = deriveFiniteTaskCandidateObservation({
    ...input,
    effectiveReservationObservation: openFixture.liveObservation,
    finiteTaskPostMergeTransition: openFixture.transition,
    gitCommand: openFixture.gitCommand
  });
  assert.equal(openMissingRef.ok, false);
  assert.ok(openMissingRef.findings.includes("FINITE_TASK_LOCAL_OBSERVATION_MALFORMED"));
  const openBinding = verifyCurrentTruthHeadBindings({
    ...headBindingInput,
    effectiveReservationObservation: openFixture.liveObservation,
    finiteTaskPostMergeTransition: openFixture.transition
  });
  assert.equal(openBinding.ok, false);
  assert.ok(openBinding.findings.some(({ id }) => id === "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_REF_MISSING"));
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
  assert.equal(result.sourceOnlyEligible && result.candidateTree === f252Tree, true, stableJson(result));
});

test("finite runtime matrix 31: provider-dependent work remains denied", () => {
  assert.equal(runtimeAtF252().providerDependentEligible, false);
});

test("unrelated repository-source expiry does not invalidate finite lease authority", () => {
  const runtime = runtimeAtF252(new Date("2026-08-12T05:00:00Z"));
  assert.equal(runtime.claimFreshness.ok, false, "the unrelated S0 claim is stale at this time");
  assert.equal(runtime.leaseAuthorityEligible, true);
  assert.equal(runtime.candidateEligible, true);
  assert.equal(runtime.sourceOnlyEligible, true, stableJson(runtime));
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
              history: structuredClone(HISTORICAL_TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_HISTORY),
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
test("fabricated combined terminal verifier repair cannot consume historical pending transitions", () => {
  const result = pendingTransitionEvaluation({ recovery: true, repair: true });
  assert.equal(result.pendingTransitionCount, 2, result.findings.join(","));
  assert.equal(result.pendingTransitionConsumptionCount, 0);
  assert.deepEqual(result.findings, ["CURRENT_TRUTH_PENDING_TERMINAL_SUCCESSOR_REQUIRED", "CURRENT_TRUTH_PENDING_TRANSITION_AUTHORITY_INVALID"]);
  assert.equal(result.advancementClassifications.at(-1).terminalVerifierRepair, false);
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

test("terminal task context preserves historical implementation identity across exact protected-main advancement", () => {
  const historicalImplementationMerge = "5e595e684f4dcc9454eee5065066e1b48d20e3eb";
  const correctedProtectedMain = "8aa74d0442eb9797900005d3c2dca9709b43c0c8";
  const advancement = verifyFiniteTaskTerminalBaseAdvancement({ repository: "Chillywood2025/chillywood-mobile", baseRef: "main", historicalImplementationMerge, currentProtectedBase: correctedProtectedMain, expectedCurrentProtectedBase: correctedProtectedMain });
  assert.equal(advancement.ok, true, stableJson(advancement.findings));
  assert.equal(advancement.relationship, "FIRST_PARENT_ANCESTOR");
  assert.equal(deriveEngineeringClosureExecutionMode({ taskContext: { ok: true, type: "TERMINAL_TRUTH_SUCCESSOR" }, changedPaths: ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"] }).mode, "TERMINAL_TRUTH_SUCCESSOR");
});

test("engineering closure inherits one exact typed terminal context from GitHub event readback", () => {
  const sourceHead = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
  const sourceTree = spawnSync("git", ["rev-parse", "HEAD^{tree}"], { encoding: "utf8" }).stdout.trim();
  const baseSha = spawnSync("git", ["rev-parse", "origin/main"], { encoding: "utf8" }).stdout.trim();
  const branch = spawnSync("git", ["branch", "--show-current"], { encoding: "utf8" }).stdout.trim();
  const mergeSha = "f".repeat(40); const repository = "Chillywood2025/chillywood-mobile";
  const event = { action: "reopened", repository: { full_name: repository }, number: 228, pull_request: { number: 228, state: "open", draft: false, merge_commit_sha: mergeSha, html_url: `https://github.com/${repository}/pull/228`, base: { ref: "main", sha: baseSha, repo: { full_name: repository } }, head: { ref: branch, sha: sourceHead, repo: { full_name: repository } } } };
  const readback = { number: 228, repository, baseRepository: repository, baseRef: "main", baseSha, headRepository: repository, headRef: branch, headSha: sourceHead, mergeCommitSha: mergeSha, draft: false, htmlUrl: event.pull_request.html_url, state: "open" };
  const taskContext = { ok: true, type: "TERMINAL_TRUTH_SUCCESSOR", authoritySource: "TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_V1" };
  const input = { event, environment: { GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request", GITHUB_REF: "refs/pull/228/merge", GITHUB_SHA: mergeSha }, gitCommand: (argv) => argv[0] === "rev-parse" && argv[1] === "HEAD" ? sourceHead : argv[0] === "rev-parse" ? sourceTree : argv[0] === "show" ? `${baseSha} ${sourceHead}` : argv[0] === "merge-tree" ? sourceTree : "", localIdentity: { branch, head: sourceHead, tree: sourceTree, base: baseSha }, scope: { files: [...TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS], netChangedLines: 500 }, currentTruth: canonicalTruth, readPull: () => readback, sourceAncestryVerified: true };
  const exact = resolveEngineeringClosureTaskContext({ ...input, observeAuthorities: () => ({ architectureAuthority: null, terminalTruthAuthority: taskContext, finiteTaskAuthority: null }) });
  const exactMerge = resolveEngineeringClosureTaskContext({ ...input, gitCommand: (argv) => argv[0] === "rev-parse" && argv[1] === "HEAD" ? mergeSha : argv[0] === "rev-parse" ? sourceTree : argv[0] === "show" ? `${baseSha} ${sourceHead}` : argv[0] === "merge-tree" ? sourceTree : "", localIdentity: { branch: "", head: mergeSha, tree: sourceTree, base: baseSha }, observeAuthorities: () => ({ architectureAuthority: null, terminalTruthAuthority: taskContext, finiteTaskAuthority: null }) });
  const wrongReadback = resolveEngineeringClosureTaskContext({ ...input, readPull: () => ({ ...readback, headSha: "0".repeat(40) }), observeAuthorities: () => ({ architectureAuthority: null, terminalTruthAuthority: taskContext, finiteTaskAuthority: null }) });
  const ambiguous = resolveEngineeringClosureTaskContext({ ...input, observeAuthorities: () => ({ architectureAuthority: { ok: true }, terminalTruthAuthority: taskContext, finiteTaskAuthority: null }) });
  assert.equal(exact.ok && exactMerge.ok, true);
  assert.equal(exact.taskContext.authoritySource, "TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_V1");
  assert.deepEqual(wrongReadback.findings, ["ENGINEERING_CLOSURE_ASSURANCE_PR_EVENT_READBACK_MISMATCH"]);
  assert.deepEqual(ambiguous.findings, ["ENGINEERING_CLOSURE_TASK_CONTEXT_AMBIGUOUS"]);
  assert.equal(deriveEngineeringClosureExecutionMode({ taskContext: exact.taskContext, changedPaths: TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS }).mode, "TERMINAL_TRUTH_SUCCESSOR");
});

test("engineering closure uses bounded public readback when a contract job has no GH token", () => {
  const calls = [];
  const run = (command, commandArgs) => {
    calls.push([command, commandArgs]);
    if (command === "gh") return { status: 4, stdout: "", stderr: "authentication required" };
    const page = new URL(commandArgs.at(-1)).searchParams.get("page");
    return { status: 0, stdout: JSON.stringify(page === "1" ? Array.from({ length: 100 }, (_, index) => ({ id: index + 1 })) : [{ id: 101 }]), stderr: "" };
  };
  const result = readGitHubApi({ args: ["--paginate", "--slurp", "repos/Chillywood2025/chillywood-mobile/issues/228/comments?per_page=100"], run });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(result.stdout).flat().length, 101);
  assert.equal(calls.filter(([command]) => command === "curl").length, 2);
  assert.equal(calls.every(([, commandArgs]) => !commandArgs.some((value) => /^Authorization:/u.test(value))), true);
  assert.equal(readGitHubApi({ args: ["--paginate", "--slurp", `repos/Chillywood2025/chillywood-mobile/commits/${"a".repeat(40)}/pulls?per_page=100`], run }).status, 0);
  assert.equal(readGitHubApi({ args: ["--paginate", "--slurp", "repos/Chillywood2025/chillywood-mobile/pulls?state=open&base=main&per_page=100"], run }).status, 0);
  assert.notEqual(readGitHubApi({ args: ["--paginate", "--slurp", "repos/other/repository/issues/228/comments"], run }).status, 0);
});

test("finite task live observation uses bounded public readback when a contract job has no GH token", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "finite-task-public-readback-"));
  const originalPath = process.env.PATH;
  fs.writeFileSync(path.join(temporary, "gh"), "#!/bin/sh\nexit 4\n");
  fs.chmodSync(path.join(temporary, "gh"), 0o755);
  try {
    process.env.PATH = `${temporary}:${originalPath}`;
    const observed = observeLiveFiniteTaskEffectiveReservation({ repository: "Chillywood2025/chillywood-mobile", pr: 229, authorityEvidence: wave1AuthorityEvidence });
    assert.equal(observed.observationMode, "LIVE_GITHUB_COMPLETE_READBACK");
    assert.equal(observed.commentsPaginationComplete, true);
    assert.equal(observed.commitsPaginationComplete, true);
    assert.equal(observed.pullRequest.number, 229);
    assert.equal(observed.commits.at(-1).sha, observed.pullRequest.head.sha);
    assert.equal(observed.comments.every(({ node_id }) => typeof node_id === "string"), true);
    assert.equal(observeLiveFiniteTaskEffectiveReservation({ repository: "Chillywood2025/chillywood-mobile", pr: 206 }).commentsPaginationComplete, false);
    assert.equal(observeLiveFiniteTaskEffectiveReservation({ repository: "Chillywood2025/chillywood-mobile", pr: 214 }).comments.some(({ id, created_at, updated_at }) => id === 5255923464 && created_at !== updated_at), true);
  } finally {
    process.env.PATH = originalPath;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
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
    implementationPr: 212,
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

let admittedWave1ArtifactFixtureCache = null;
const admittedWave1ArtifactFixture = () => {
  if (admittedWave1ArtifactFixtureCache) return admittedWave1ArtifactFixtureCache;
  const artifactPath = "docs/assurance/tasks/pre-release-identity-entitlement-authority-v1.json";
  const artifactSource = spawnSync("git", ["show", `14e6d3a05bc4110712f88de11c76968cb610dae1:${artifactPath}`], { encoding: "utf8" }).stdout;
  const taskArtifact = JSON.parse(artifactSource);
  const taskArtifactHash = digest(artifactSource);
  const lease = structuredClone(canonicalTruth.finiteTaskLeases.tasks.find(({ implementationPr }) => implementationPr === 229));
  const activeBinding = canonicalTruth.activeTaskBinding;
  const domainIds = [...taskArtifact.closure.affectedDomainClosure.domains];
  const scope = { launchProgram: "chillywood-united-states-pre-release", product: "chillywood-mobile", repository: "Chillywood2025/chillywood-mobile" };
  const taskEvidence = finiteTaskJurisdictionEvidenceV2(taskArtifact, taskArtifactHash);
  const taskIdentity = {
    implementationBranch: lease.implementationBranch,
    implementationPr: lease.implementationPr,
    leaseId: lease.leaseId,
    originalSeedHead: lease.admittedSeedHead,
    originalSeedTree: lease.admittedSeedTree,
    ownerApprovalCommentId: lease.ownerAuthorizationCommentId,
    planningHead: activeBinding.currentImplementationHead,
    planningTree: activeBinding.currentImplementationTree,
    taskArtifactPath: artifactPath,
    taskId: lease.leaseId,
  };
  const rendered = preflightOwnerJurisdictionDecisionV2({
    domainApplications: domainIds.map((domainId) => ({ decision: `Exact Wave 1 United States application for ${domainId}.`, domainId, jurisdictionDecisionOwner: "Chillywood2025", market: "UNITED_STATES_ONLY", minimumCreatorAge: ["creator-money-ledger", "payouts-stripe-connect"].includes(domainId) ? 18 : null })),
    domainIds,
    owner: { association: "OWNER", login: "Chillywood2025" },
    registry,
    scope,
    taskEvidence,
    taskIdentity,
  });
  assert.equal(rendered.ok, true, rendered.findings?.join(","));
  const raw = { id: 799101, node_id: "IC_admitted_wave1", user: { login: "Chillywood2025" }, author_association: "OWNER", body: rendered.body, created_at: "2026-08-14T20:01:00Z", updated_at: "2026-08-14T20:01:00Z", issue_url: `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${lease.implementationPr}`, html_url: `https://github.com/Chillywood2025/chillywood-mobile/pull/${lease.implementationPr}#issuecomment-799101` };
  const ownerJurisdictionAuthority = verifyOwnerJurisdictionAuthorityV2({ raw, policyRaws: [raw], paginationComplete: true, repository: scope.repository, pr: lease.implementationPr, registry, expected: { ...scope, domainIds, ownerLogin: "Chillywood2025", task: lease.leaseId }, expectedTaskIdentity: taskIdentity, expectedTaskEvidence: taskEvidence });
  assert.equal(ownerJurisdictionAuthority.ok, true, ownerJurisdictionAuthority.findings?.join(","));
  const actualScope = observeCandidateScopeFromGit(lease.admittedBase, activeBinding.currentImplementationHead);
  assert.ok(actualScope);
  const implementationIdentity = createImplementationIdentityObservation({
    repository: scope.repository,
    workflowPr: lease.implementationPr,
    implementationPr: lease.implementationPr,
    implementationBranch: lease.implementationBranch,
    implementationHead: activeBinding.currentImplementationHead,
    implementationTree: activeBinding.currentImplementationTree,
    originalSeedHead: lease.admittedSeedHead,
    originalSeedTree: lease.admittedSeedTree,
    protectedBase: lease.admittedBase,
    currentProtectedMain: lease.admittedBase,
    finiteLeaseId: lease.leaseId,
    taskArtifactPath: artifactPath,
    taskArtifactHash,
    implementationChangedPaths: actualScope.paths,
    seedIsAncestor: true,
    protectedBaseIsAncestor: true,
    ownerApprovalValid: true,
    artifactFrozen: true,
    prospectiveLeasePresent: true,
    admissionMerged: true,
  });
  assert.equal(implementationIdentity.candidateEligible, true);
  admittedWave1ArtifactFixtureCache = { actualScope, implementationIdentity, lease, ownerJurisdictionAuthority, taskArtifact, taskArtifactBytes: artifactSource, taskArtifactHash };
  return admittedWave1ArtifactFixtureCache;
};

test("active-task frozen artifact 01: malformed generic state models fail closed without throwing", () => {
  for (const malformed of [
    { sections: { F_STATE_MODEL: { domainModels: [{ domain: "auth-session-password-recovery", states: ["ACTIVE"], transitions: ["W1-T-01"] }] } } },
    { sections: { F_STATE_MODEL: { domainModels: [null] } } },
    { sections: { F_STATE_MODEL: { domainModels: [{ domain: "auth-session-password-recovery", transitionContracts: [null] }] } } },
  ]) {
    let result;
    assert.doesNotThrow(() => { result = evaluatePreimplementationGate(malformed); });
    assert.equal(result.clear, false);
    assert.ok(result.findings.includes("PREIMPLEMENTATION_STATE_MODEL_INCOMPLETE"));
  }
  assert.doesNotThrow(() => evaluateFrozenFiniteTaskArtifactV2({ certificate: { invariants: {} }, closure: {} }));
  assert.doesNotThrow(() => evaluateFrozenFiniteTaskArtifactV2({ certificate: { invariants: [], mutants: [], positiveWitnesses: [], negativeWitnesses: [], reachableStates: [], transitions: [] }, closure: {}, invariants: [null], mutants: [], stateTransitionModel: {} }));
  assert.doesNotThrow(() => evaluateAdmittedFiniteTaskArtifactV2({ certificate: { invariants: {} }, closure: {} }));
  assert.doesNotThrow(() => evaluateAdmittedFiniteTaskArtifactV2({ certificate: {}, closure: { affectedDomainClosure: { domains: [] }, sections: {} }, taskLocalEdgeEvidence: { modelDeltas: [null] } }));
});

test("active-task frozen artifact 01a: the leased artifact is read from the exact regular Git blob", () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "wave1-artifact-hash-"));
  const artifactPath = "docs/assurance/tasks/hash-fixture.json";
  try {
    fs.mkdirSync(path.join(parent, path.dirname(artifactPath)), { recursive: true });
    const bytes = `${JSON.stringify({ z: 1, a: [2, 3] })}\n`;
    fs.writeFileSync(path.join(parent, artifactPath), bytes);
    for (const args of [["init", "--quiet"], ["config", "user.email", "test@example.com"], ["config", "user.name", "Test"], ["add", artifactPath], ["commit", "--quiet", "-m", "fixture"]]) assert.equal(spawnSync("git", args, { cwd: parent }).status, 0);
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: parent, encoding: "utf8" }).stdout.trim();
    const exact = readTaskArtifactAtGitHead(artifactPath, head, parent);
    assert.equal(exact.artifactHash, digest(bytes));
    assert.deepEqual(exact.artifact, { z: 1, a: [2, 3] });
    fs.writeFileSync(path.join(parent, artifactPath), `${JSON.stringify({ substituted: true })}\n`);
    assert.equal(readTaskArtifactAtGitHead(artifactPath, head, parent).artifactHash, digest(bytes));
    assert.equal(readTaskArtifactAtGitHead("../outside.json", head, parent), null);
    fs.rmSync(path.join(parent, artifactPath));
    fs.symlinkSync("outside.json", path.join(parent, artifactPath));
    assert.equal(spawnSync("git", ["add", artifactPath], { cwd: parent }).status, 0);
    assert.equal(spawnSync("git", ["commit", "--quiet", "-m", "symlink substitution"], { cwd: parent }).status, 0);
    const symlinkHead = spawnSync("git", ["rev-parse", "HEAD"], { cwd: parent, encoding: "utf8" }).stdout.trim();
    assert.equal(readTaskArtifactAtGitHead(artifactPath, symlinkHead, parent), null);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("active-task frozen artifact 01b: the admitted lease selects and reconciles the immutable full wrapper", () => {
  const fixture = admittedWave1ArtifactFixture();
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "wave1-artifact-input-"));
  const artifactPath = fixture.lease.artifactReservation.closureArtifactPath;
  try {
    fs.mkdirSync(path.join(parent, path.dirname(artifactPath)), { recursive: true });
    fs.writeFileSync(path.join(parent, artifactPath), fixture.taskArtifactBytes);
    for (const args of [["init", "--quiet"], ["config", "user.email", "test@example.com"], ["config", "user.name", "Test"], ["add", artifactPath], ["commit", "--quiet", "-m", "fixture"]]) assert.equal(spawnSync("git", args, { cwd: parent }).status, 0);
    const head = spawnSync("git", ["rev-parse", "HEAD"], { cwd: parent, encoding: "utf8" }).stdout.trim();
    const promoted = resolveEngineeringArtifactInput({ lease: fixture.lease, suppliedPacket: fixture.taskArtifact.closure, suppliedCertificate: fixture.taskArtifact.certificate, head, root: parent });
    assert.equal(promoted.ok, true);
    assert.deepEqual(promoted.packet, fixture.taskArtifact);
    assert.deepEqual(promoted.certificate, fixture.taskArtifact.certificate);
    const mutated = structuredClone(fixture.taskArtifact.closure);
    mutated.completionStatus = "BLOCKED";
    assert.deepEqual(resolveEngineeringArtifactInput({ lease: fixture.lease, suppliedPacket: mutated, head, root: parent }).findings, ["PREIMPLEMENTATION_ADMITTED_ARTIFACT_CONTRACT_UNSUPPORTED"]);
    assert.deepEqual(resolveEngineeringArtifactInput({ lease: fixture.lease, suppliedPacket: fixture.taskArtifact.closure, suppliedCertificate: { ...fixture.taskArtifact.certificate, status: "BLOCKED" }, head, root: parent }).findings, ["PREIMPLEMENTATION_ADMITTED_ARTIFACT_CONTRACT_UNSUPPORTED"]);
    assert.deepEqual(resolveEngineeringArtifactInput({ lease: fixture.lease, head, root: path.join(parent, "missing") }).findings, ["PREIMPLEMENTATION_ADMITTED_ARTIFACT_CONTRACT_UNSUPPORTED"]);
    const legacy = structuredClone(fixture.lease);
    delete legacy.closure;
    assert.equal(resolveEngineeringArtifactInput({ lease: legacy, suppliedPacket: fixture.taskArtifact.closure, root: parent }).packet, fixture.taskArtifact.closure);
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test("active-task frozen artifact 01c: boundary-aware redaction preserves canonical identifiers and every protected secret class", () => {
  const identifiers = [
    "ASSURANCE_TASK_CONTEXT_DOMAIN_UNKNOWN",
    "FINITE_TASK_TEST_ADAPTATION_PARTITION_SCOPE_OVERFLOW",
    "FINITE_TASK_TEST_ADAPTATION_PARTITION_INVALID",
    "TASK_BOUND_COMPOSITE",
  ];
  for (const identifier of identifiers) assert.equal(redact(identifier), identifier);

  const tokenSuffix = "syntheticcredential123456";
  const secretValues = [
    "Bearer synthetic.credential-123456",
    `sk_${tokenSuffix}`,
    `pk_${tokenSuffix}`,
    `gho_${tokenSuffix}`,
    `ghp_${tokenSuffix}`,
    `ghs_${tokenSuffix}`,
    `ghu_${tokenSuffix}`,
    `service_role_${tokenSuffix}`,
    "owner@example.invalid",
  ];
  for (const value of secretValues) assert.equal(redact(value), "[REDACTED]");

  const secretKeyValues = {
    secret: "synthetic",
    password: "synthetic",
    credential: "synthetic",
    authorization: "synthetic",
    privateKey: "synthetic",
    rawPayload: "synthetic",
    deviceId: "synthetic",
    deviceSerial: "synthetic",
    udid: "synthetic",
    signedUrl: "https://example.invalid/object?X-Amz-Signature=synthetic",
  };
  assert.deepEqual(redact(secretKeyValues), Object.fromEntries(Object.keys(secretKeyValues).map((key) => [key, "[REDACTED]"])));

  const signedUrls = [
    "https://example.invalid/object?x-amz-signature=synthetic",
    "https://example.invalid/object?x-goog-signature=synthetic",
    "https://example.invalid/object?signature=synthetic",
    "https://example.invalid/object?sig=synthetic",
    "https://example.invalid/object?token=synthetic",
  ];
  for (const signedUrl of signedUrls) {
    assert.equal(redact(signedUrl), "[REDACTED]");
    assert.deepEqual(redact({ reference: signedUrl }), { reference: "[REDACTED]" });
  }

  const packet = { ownerJurisdictionPolicy: { policySource: { referenceScope: "TASK_BOUND_COMPOSITE" } }, status: "CLEAR" };
  assert.deepEqual(redactActiveTaskPacket(packet), packet);
  const appendedSecret = { ownerJurisdictionPolicy: { policySource: { referenceScope: `TASK_BOUND_COMPOSITE_sk_${tokenSuffix}` } } };
  assert.equal(redactActiveTaskPacket(appendedSecret).ownerJurisdictionPolicy.policySource.referenceScope, "TASK_BOUND_COMPOSITE_[REDACTED]");
});

test("active-task frozen artifact 02: the exact admitted Wave 1 wrapper uses its canonical split-model verifier", () => {
  const fixture = admittedWave1ArtifactFixture();
  const result = evaluateAdmittedFiniteTaskArtifactV2(fixture.taskArtifact, { taskArtifactBytes: fixture.taskArtifactBytes, taskArtifactHash: fixture.taskArtifactHash, implementationIdentity: fixture.implementationIdentity, authoritativeLease: fixture.lease, ownerJurisdictionAuthority: fixture.ownerJurisdictionAuthority, actualScope: fixture.actualScope });
  assert.equal(result.clear, true, JSON.stringify(result));
  assert.equal(result.status, "PREIMPLEMENTATION_ENGINEERING_CLEAR");
  const engineeringAuthority = { ok: true, classification: result.status, derivedGate: result };
  const focused = admittedFiniteTaskCommandRule({ contractCommand: "focused auth/RLS suite", featureId: fixture.taskArtifact.primaryDomain, engineeringAuthority, taskArtifact: fixture.taskArtifact, taskArtifactHash: fixture.taskArtifactHash, lease: fixture.lease });
  assert.equal(focused.resultContract.executable, false);
  assert.deepEqual(focused.resultContract.testEvidencePaths, fixture.taskArtifact.implementationPlan.tests);
  const plan = admittedFiniteTaskCommandRule({ contractCommand: "assurance:plan", featureId: fixture.taskArtifact.primaryDomain, engineeringAuthority, taskArtifact: fixture.taskArtifact, taskArtifactHash: fixture.taskArtifactHash, lease: fixture.lease });
  assert.deepEqual(plan.args, ["scripts/assurance/plan.mjs", "--feature=auth-session-password-recovery"]);
  const mismatchedLease = structuredClone(fixture.lease);
  mismatchedLease.artifactReservation.testEvidencePaths = ["tests/substituted.test.mjs"];
  assert.equal(admittedFiniteTaskCommandRule({ contractCommand: "focused auth/RLS suite", featureId: fixture.taskArtifact.primaryDomain, engineeringAuthority, taskArtifact: fixture.taskArtifact, taskArtifactHash: fixture.taskArtifactHash, lease: mismatchedLease }), null);
});

test("active-task frozen artifact 03: artifact-byte substitution fails closed", () => {
  const fixture = admittedWave1ArtifactFixture();
  const result = evaluateAdmittedFiniteTaskArtifactV2(fixture.taskArtifact, { taskArtifactBytes: fixture.taskArtifactBytes, taskArtifactHash: "0".repeat(64), implementationIdentity: fixture.implementationIdentity, authoritativeLease: fixture.lease, ownerJurisdictionAuthority: fixture.ownerJurisdictionAuthority, actualScope: fixture.actualScope });
  assert.equal(result.clear, false);
});

test("active-task frozen artifact 04: missing immutable Owner jurisdiction authority fails closed", () => {
  const fixture = admittedWave1ArtifactFixture();
  const result = evaluateAdmittedFiniteTaskArtifactV2(fixture.taskArtifact, { taskArtifactBytes: fixture.taskArtifactBytes, taskArtifactHash: fixture.taskArtifactHash, implementationIdentity: fixture.implementationIdentity, authoritativeLease: fixture.lease, ownerJurisdictionAuthority: null, actualScope: fixture.actualScope });
  assert.equal(result.clear, false);
});

test("active-task frozen artifact 05: full wrappers and legacy direct packets stay on distinct evaluator paths", () => {
  const source = fs.readFileSync("scripts/assurance/active-task.mjs", "utf8");
  assert.match(source, /admittedFiniteTaskArtifact[\s\S]+evaluateAdmittedFiniteTaskArtifactV2\(admittedFiniteTaskArtifact/u);
  assert.match(source, /PREIMPLEMENTATION_ADMITTED_ARTIFACT_CONTRACT_UNSUPPORTED/u);
  assert.match(source, /else \{[\s\S]+evaluatePreimplementationGate\(effectivePacket/u);
  const fixture = admittedWave1ArtifactFixture();
  const args = {
    doctrineTruth: { status: "ACTIVE" },
    featureId: fixture.taskArtifact.primaryDomain,
    phase: "PREIMPLEMENTATION_ENGINEERING_CLEAR",
    lease: fixture.lease,
    certificate: fixture.taskArtifact.certificate,
    branch: fixture.lease.implementationBranch,
    currentMain: fixture.implementationIdentity.currentProtectedMain,
    currentHead: fixture.implementationIdentity.implementationHead,
    implementationPr: fixture.lease.implementationPr,
    scopeObservation: fixture.actualScope,
    implementationIdentity: fixture.implementationIdentity,
    ownerJurisdictionAuthority: fixture.ownerJurisdictionAuthority,
  };
  const unwrapped = validateEngineeringTaskAuthority({ ...args, closurePacket: fixture.taskArtifact.closure });
  assert.equal(unwrapped.ok, false);
  assert.ok(unwrapped.findings.includes("PREIMPLEMENTATION_ADMITTED_ARTIFACT_CONTRACT_UNSUPPORTED"));
  const hybrid = structuredClone(fixture.taskArtifact);
  delete hybrid.closure.sections;
  hybrid.sections = fixture.taskArtifact.closure.sections;
  const partial = validateEngineeringTaskAuthority({ ...args, closurePacket: hybrid });
  assert.equal(partial.ok, false);
  assert.ok(partial.findings.includes("PREIMPLEMENTATION_ADMITTED_ARTIFACT_CONTRACT_UNSUPPORTED"));
});

test("active-task frozen artifact 05a: a forged amended-resolution object cannot authorize an artifact path", () => {
  const fixture = admittedWave1ArtifactFixture();
  const forgedPath = "_lib/not-authorized-by-live-amendment.ts";
  const forgedLease = structuredClone(fixture.lease);
  forgedLease.allowedPaths = [...forgedLease.allowedPaths, forgedPath].sort();
  forgedLease.artifactReservation.pathGlobs = [...forgedLease.artifactReservation.pathGlobs, forgedPath].sort();
  forgedLease.artifactReservation.maximumFiles = 32;
  forgedLease.artifactReservation.maximumLines = 4500;
  forgedLease.scopeBudget = { maximumFiles: 32, maximumChangedLines: 4500 };
  const forgedResolution = {
    ok: true,
    status: "AMENDED",
    baseLease: fixture.lease,
    effectiveLease: forgedLease,
    amendmentReceipt: { addedPaths: [forgedPath] },
    amendmentsConsumed: 1,
    authority: { providerMutation: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false, amendmentEffective: true, liveReceipt: true }
  };
  const result = validateEngineeringTaskAuthority({
    doctrineTruth: { status: "ACTIVE" },
    featureId: fixture.taskArtifact.primaryDomain,
    phase: "PREIMPLEMENTATION_ENGINEERING_CLEAR",
    lease: forgedLease,
    baseLease: fixture.lease,
    effectiveReservationResolution: forgedResolution,
    closurePacket: fixture.taskArtifact,
    certificate: fixture.taskArtifact.certificate,
    taskArtifactBytes: fixture.taskArtifactBytes,
    branch: fixture.lease.implementationBranch,
    currentMain: fixture.implementationIdentity.currentProtectedMain,
    currentHead: fixture.implementationIdentity.implementationHead,
    implementationPr: fixture.lease.implementationPr,
    scopeObservation: fixture.actualScope,
    implementationIdentity: fixture.implementationIdentity,
    ownerJurisdictionAuthority: fixture.ownerJurisdictionAuthority
  });
  assert.equal(finiteTaskEffectiveReservationAuthorityValid(forgedResolution), false);
  assert.ok(result.findings.includes("FINITE_TASK_ARTIFACT_RESERVATION_SCOPE_VIOLATION"));
});

test("active-task frozen artifact 06: frozen edge evidence is reverified at the immutable planning snapshot", () => {
  const fixture = admittedWave1ArtifactFixture();
  const temporaryParent = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "wave1-mutable-root-"));
  const root = path.join(temporaryParent, "repository");
  try {
    assert.equal(spawnSync("git", ["clone", "--quiet", "--local", process.cwd(), root], { encoding: "utf8" }).status, 0);
    fs.appendFileSync(path.join(root, "_lib/notifications.ts"), "\n// temporary authorized implementation mutation\n");
    const result = evaluateAdmittedFiniteTaskArtifactV2(fixture.taskArtifact, { root, taskArtifactBytes: fixture.taskArtifactBytes, taskArtifactHash: fixture.taskArtifactHash, implementationIdentity: fixture.implementationIdentity, authoritativeLease: fixture.lease, ownerJurisdictionAuthority: fixture.ownerJurisdictionAuthority, actualScope: fixture.actualScope });
    assert.equal(result.clear, true, JSON.stringify(result));
  } finally {
    fs.rmSync(temporaryParent, { recursive: true, force: true });
  }
});

const coordinatedAdmittedWave1Mutation = (mutate, commentId) => {
  const base = admittedWave1ArtifactFixture();
  const taskArtifact = structuredClone(base.taskArtifact);
  mutate(taskArtifact);
  const domainIds = [...taskArtifact.closure.affectedDomainClosure.domains].sort();
  const packetFacts = Object.fromEntries(Object.entries(taskArtifact.closure.sections).filter(([key]) => key !== "L_COMPLETENESS_CERTIFICATE"));
  taskArtifact.certificate.packetFactsHash = hashValue(packetFacts);
  const certificateBody = { ...taskArtifact.certificate }; delete certificateBody.certificateHash;
  taskArtifact.certificate.certificateHash = hashValue(certificateBody);
  taskArtifact.closure.sections.L_COMPLETENESS_CERTIFICATE = structuredClone(taskArtifact.certificate);
  const closureBody = { ...taskArtifact.closure }; delete closureBody.packetHash;
  taskArtifact.closure.packetHash = hashValue(closureBody);
  const taskArtifactBytes = Buffer.from(`${JSON.stringify(taskArtifact)}\n`);
  const taskArtifactHash = digest(taskArtifactBytes);
  const taskEvidence = finiteTaskJurisdictionEvidenceV2(taskArtifact, taskArtifactHash);
  const lease = structuredClone(base.lease);
  lease.artifactReservation.allowedDomains = domainIds;
  lease.closure = { artifactHash: taskEvidence.taskArtifactHash, packetHash: taskEvidence.closurePacketHash, certificateHash: taskEvidence.completenessCertificateHash, edgeClosureHash: taskEvidence.taskLocalEdgeClosureHash, edgeEvidenceHash: taskEvidence.taskLocalEdgeEvidenceHash, modelDeltaHash: taskEvidence.taskLocalModelHash };
  const taskIdentity = structuredClone(base.ownerJurisdictionAuthority.taskBinding.taskIdentity);
  const scope = structuredClone(base.ownerJurisdictionAuthority.taskBinding.scope);
  const rendered = preflightOwnerJurisdictionDecisionV2({ domainApplications: domainIds.map((domainId) => ({ decision: `Exact test application for ${domainId}.`, domainId, jurisdictionDecisionOwner: "Chillywood2025", market: "UNITED_STATES_ONLY", minimumCreatorAge: null })), domainIds, owner: { association: "OWNER", login: "Chillywood2025" }, registry, scope, taskEvidence, taskIdentity });
  assert.equal(rendered.ok, true, rendered.findings?.join(","));
  const raw = { id: commentId, node_id: `IC_admitted_wave1_mutation_${commentId}`, user: { login: "Chillywood2025" }, author_association: "OWNER", body: rendered.body, created_at: "2026-08-14T20:02:00Z", updated_at: "2026-08-14T20:02:00Z", issue_url: `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${lease.implementationPr}`, html_url: `https://github.com/Chillywood2025/chillywood-mobile/pull/${lease.implementationPr}#issuecomment-${commentId}` };
  const ownerJurisdictionAuthority = verifyOwnerJurisdictionAuthorityV2({ raw, policyRaws: [raw], paginationComplete: true, repository: scope.repository, pr: lease.implementationPr, registry, expected: { ...scope, domainIds, ownerLogin: "Chillywood2025", task: lease.leaseId }, expectedTaskIdentity: taskIdentity, expectedTaskEvidence: taskEvidence });
  assert.equal(ownerJurisdictionAuthority.ok, true, ownerJurisdictionAuthority.findings?.join(","));
  const original = base.implementationIdentity;
  const implementationIdentity = createImplementationIdentityObservation({ repository: original.repository, workflowPr: original.implementationPr, implementationPr: original.implementationPr, implementationBranch: original.implementationBranch, implementationHead: original.implementationHead, implementationTree: original.implementationTree, originalSeedHead: original.originalSeedHead, originalSeedTree: original.originalSeedTree, protectedBase: original.protectedBase, currentProtectedMain: original.currentProtectedMain, finiteLeaseId: original.finiteLeaseId, taskArtifactPath: original.taskArtifactPath, taskArtifactHash, implementationChangedPaths: original.implementationChangedPaths, seedIsAncestor: true, protectedBaseIsAncestor: true, ownerApprovalValid: true, artifactFrozen: true, prospectiveLeasePresent: true, admissionMerged: true });
  assert.equal(implementationIdentity.candidateEligible, true);
  return evaluateAdmittedFiniteTaskArtifactV2(taskArtifact, { taskArtifactBytes, taskArtifactHash, implementationIdentity, authoritativeLease: lease, ownerJurisdictionAuthority, actualScope: base.actualScope });
};

test("active-task frozen artifact 07: exact task domains cannot exceed the frozen edge-closure domains", () => {
  const result = coordinatedAdmittedWave1Mutation((taskArtifact) => {
    const domains = [...taskArtifact.closure.affectedDomainClosure.domains, "chilly-chat-call-lifecycle"].sort();
    taskArtifact.closure.affectedDomainClosure.domains = domains;
    taskArtifact.closure.sections.C_AFFECTED_DOMAIN_CLOSURE.includedDependencies = domains.filter((domain) => domain !== taskArtifact.primaryDomain);
  }, 799102);
  assert.equal(result.clear, false);
  assert.ok(result.findings.includes("PREIMPLEMENTATION_TASK_LOCAL_EDGE_CLOSURE_INCOMPLETE"));
});

test("active-task frozen artifact 08: packet edge summaries cannot contradict independently verified edge evidence", () => {
  const result = coordinatedAdmittedWave1Mutation((taskArtifact) => {
    taskArtifact.closure.sections.C_AFFECTED_DOMAIN_CLOSURE.taskLocalGoverningEdgeClosure.classification = "TASK_LOCAL_GOVERNING_EDGE_CLOSURE_BLOCKED";
  }, 799103);
  assert.equal(result.clear, false);
  assert.ok(result.findings.includes("PREIMPLEMENTATION_TASK_LOCAL_EDGE_CLOSURE_INCOMPLETE"));
});

test("A1 Phase 1 evidence survives post-merge association loss only through complete unique exact GitHub provenance", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "phase1-durable-provenance-"));
  const fakeGitHub = path.join(temporary, "gh");
  const callsPath = path.join(temporary, "calls.jsonl");
  fs.writeFileSync(fakeGitHub, `#!/usr/bin/env node
const fs = require("node:fs");
const fixture = JSON.parse(process.env.A1_PHASE1_GITHUB_FIXTURE);
const endpoint = process.argv.at(-1);
fs.appendFileSync(fixture.callsPath, JSON.stringify({ endpoint, args: process.argv.slice(2) }) + "\\n");
if (endpoint.includes("/actions/runs/") && endpoint.endsWith("/jobs?per_page=100")) {
  process.stdout.write(JSON.stringify({ total_count: fixture.jobsComplete === false ? fixture.jobs.length + 1 : fixture.jobs.length, jobs: fixture.jobs }));
} else if (endpoint.includes("/actions/runs/")) {
  process.stdout.write(JSON.stringify(fixture.run));
} else if (/\\/pulls\\/[1-9]\\d*$/u.test(endpoint)) {
  process.stdout.write(JSON.stringify(fixture.directPullRequest ?? null));
} else if (/\\/commits\\/[0-9a-f]{40}\\/pulls\\?per_page=100$/u.test(endpoint)) {
  process.stdout.write(JSON.stringify(fixture.commitAssociationPaginationComplete === false ? { incomplete: true } : [fixture.commitAssociatedPullRequests]));
} else {
  process.stderr.write("unexpected endpoint: " + endpoint);
  process.exitCode = 1;
}
`);
  fs.chmodSync(fakeGitHub, 0o755);
  const originalPath = process.env.PATH;
  const originalFixture = process.env.A1_PHASE1_GITHUB_FIXTURE;
  const identity = {
    repository: "Chillywood2025/chillywood-mobile",
    pr: 731,
    branch: "codex/generic-phase1-durable-provenance-v1",
    baseRef: "main",
    baseSha: "b".repeat(40),
    headSha: "a".repeat(40),
  };
  const tree = "c".repeat(40);
  const runId = 910731;
  const exactPullRequest = {
    number: identity.pr,
    head: { ref: identity.branch, sha: identity.headSha, repo: { full_name: identity.repository } },
    base: { ref: identity.baseRef, sha: identity.baseSha, repo: { full_name: identity.repository } },
  };
  const successfulRun = {
    id: runId,
    run_attempt: 1,
    name: "Phase 1 CI",
    path: ".github/workflows/phase1-ci.yml",
    event: "pull_request",
    status: "completed",
    conclusion: "success",
    repository: { full_name: identity.repository },
    head_sha: identity.headSha,
    head_branch: identity.branch,
    pull_requests: [],
  };
  const jobs = PHASE1_REQUIRED_JOB_NAMES.map((name, index) => ({ id: index + 1, name, status: "completed", conclusion: "success", head_sha: identity.headSha }));
  const baselineFixture = {
    callsPath,
    run: successfulRun,
    jobs,
    jobsComplete: true,
    directPullRequest: exactPullRequest,
    commitAssociationPaginationComplete: true,
    commitAssociatedPullRequests: [exactPullRequest],
  };
  const observe = ({ fixtureOverrides = {}, identityOverrides = {}, observedRunId = runId } = {}) => {
    const fixture = structuredClone(baselineFixture);
    Object.assign(fixture, structuredClone(fixtureOverrides));
    process.env.A1_PHASE1_GITHUB_FIXTURE = JSON.stringify(fixture);
    return observePhase1RunEvidence({ runId: observedRunId, identity: { ...identity, ...identityOverrides }, tree, root: process.cwd() });
  };
  try {
    process.env.PATH = `${temporary}:${originalPath}`;

    const durable = observe();
    assert.equal(durable.valid, true, "empty run.pull_requests must recover from the exact direct PR and complete unique commit association");

    const directRun = {
      ...Object.fromEntries(Object.entries(successfulRun).filter(([key]) => !["path", "repository"].includes(key))),
      pull_requests: [{ number: identity.pr, head: { sha: identity.headSha }, base: { sha: identity.baseSha } }],
    };
    const direct = verifyPhase1RunEvidence({ run: directRun, jobs, identity, tree });
    const historicalBody = {
      classification: "PHASE1_EXACT_HEAD_EVIDENCE_V1",
      repository: identity.repository,
      pr: identity.pr,
      branch: identity.branch,
      runId,
      runAttempt: 1,
      sourceHead: identity.headSha,
      sourceTree: tree,
      status: "completed",
      conclusion: "success",
      requiredJobs: PHASE1_REQUIRED_JOB_NAMES.length,
      passedJobs: PHASE1_REQUIRED_JOB_NAMES.length,
      jobNames: [...PHASE1_REQUIRED_JOB_NAMES],
      result: "PASS_13_OF_13",
    };
    assert.deepEqual(direct, { ...historicalBody, valid: true, evidenceHash: hashValue(historicalBody) }, "ordinary one-linked-PR evidence must retain its historical authoritative result and hash");
    assert.deepEqual(durable, direct, "durable recovery substitutes only the exact linked PR before canonical evidence hashing");

    assert.equal(observe({ fixtureOverrides: { commitAssociatedPullRequests: [] } }).valid, false, "zero commit-associated PRs must fail closed");
    const wrongPr = { ...exactPullRequest, number: identity.pr + 1 };
    assert.equal(observe({ fixtureOverrides: { directPullRequest: wrongPr, commitAssociatedPullRequests: [wrongPr] } }).valid, false, "wrong PR must fail closed");
    const wrongHead = { ...exactPullRequest, head: { ...exactPullRequest.head, sha: "d".repeat(40) } };
    assert.equal(observe({ fixtureOverrides: { directPullRequest: wrongHead, commitAssociatedPullRequests: [wrongHead] } }).valid, false, "wrong head must fail closed");
    const wrongBase = { ...exactPullRequest, base: { ...exactPullRequest.base, sha: "e".repeat(40) } };
    assert.equal(observe({ fixtureOverrides: { directPullRequest: wrongBase, commitAssociatedPullRequests: [wrongBase] } }).valid, false, "wrong base must fail closed");
    const wrongBranch = { ...exactPullRequest, head: { ...exactPullRequest.head, ref: "codex/unrelated-branch" } };
    assert.equal(observe({ fixtureOverrides: { directPullRequest: wrongBranch, commitAssociatedPullRequests: [wrongBranch] } }).valid, false, "wrong branch must fail closed");
    const unrelatedPullRequest = { ...exactPullRequest, number: identity.pr + 2 };
    assert.equal(observe({ fixtureOverrides: { commitAssociatedPullRequests: [exactPullRequest, unrelatedPullRequest] } }).valid, false, "multiple commit-associated candidates, including an unrelated PR for the same commit, must fail closed");
    assert.equal(observe({ fixtureOverrides: { commitAssociationPaginationComplete: false } }).valid, false, "incomplete commit-to-pulls pagination must fail closed");
    assert.equal(observe({ fixtureOverrides: { directPullRequest: null } }).valid, false, "an incomplete exact-PR read must fail closed");
    assert.equal(observe({ fixtureOverrides: { commitAssociatedPullRequests: [wrongBranch] } }).valid, false, "direct PR and commit association disagreement must fail closed");
    const wrongRepository = { ...exactPullRequest, head: { ...exactPullRequest.head, repo: { full_name: "Chillywood2025/unrelated" } } };
    assert.equal(observe({ fixtureOverrides: { directPullRequest: wrongRepository, commitAssociatedPullRequests: [wrongRepository] } }).valid, false, "wrong repository must fail closed");
    assert.equal(observe({ fixtureOverrides: { run: { ...successfulRun, event: "workflow_dispatch" } } }).valid, false, "a non-pull_request event must fail closed");
    assert.equal(observe({ fixtureOverrides: { run: { ...successfulRun, conclusion: "failure" } } }).valid, false, "an unsuccessful run must fail closed");
    assert.equal(observe({ identityOverrides: { pr: identity.pr + 1 } }).valid, false, "one PR's run must not authorize another PR");
    assert.equal(observe({ fixtureOverrides: { run: { ...successfulRun, id: runId + 1 } } }).valid, false, "the fetched run ID must equal the receipt-bound run ID");
    assert.equal(observe({ fixtureOverrides: { run: { ...successfulRun, repository: { full_name: "Chillywood2025/unrelated" } } } }).valid, false, "the live workflow run repository must match the expected repository");
    assert.equal(observe({ fixtureOverrides: { run: { ...successfulRun, path: ".github/workflows/unrelated.yml" } } }).valid, false, "the live workflow run must come from the canonical Phase 1 workflow path");
    assert.equal(observe({ fixtureOverrides: { run: { ...successfulRun, pull_requests: [directRun.pull_requests[0], { number: identity.pr + 1 }] } } }).valid, false, "multiple direct run associations must not enter durable recovery");
    assert.equal(verifyPhase1RunEvidence({
      run: successfulRun,
      jobs,
      identity,
      tree,
      durablePullRequestProvenance: {
        directPullRequestReadComplete: true,
        directPullRequest: exactPullRequest,
        commitAssociationPaginationComplete: true,
        commitAssociatedPullRequests: [exactPullRequest],
      },
    }).valid, false, "caller-supplied provenance that was not gathered by the live observer must not be trusted");

    const endpoints = fs.readFileSync(callsPath, "utf8").trim().split("\n").map((line) => JSON.parse(line).endpoint);
    assert.equal(endpoints.some((endpoint) => endpoint === `repos/${identity.repository}/pulls/${identity.pr}`), true);
    assert.equal(endpoints.some((endpoint) => endpoint === `repos/${identity.repository}/commits/${identity.headSha}/pulls?per_page=100`), true);
  } finally {
    process.env.PATH = originalPath;
    if (originalFixture === undefined) delete process.env.A1_PHASE1_GITHUB_FIXTURE;
    else process.env.A1_PHASE1_GITHUB_FIXTURE = originalFixture;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
