import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveActiveTaskAdmissionImplementationEvidence } from "../../scripts/assurance/active-task.mjs";

import {
  ACTIVE_POLICY_STATUS,
  FINITE_TASK_ADMISSION_FINAL_SOURCE_V2_MARKER,
  FINITE_TASK_ADMISSION_V2_MARKER,
  LEGACY_FINITE_TASK_ADMISSION_V1_MARKER,
  LEGACY_OWNER_AUTHORIZATION_V1_MARKER,
  MAX_CANONICAL_COMMENT_BYTES,
  OWNER_JURISDICTION_DECISION_V2_MARKER,
  OWNER_JURISDICTION_POLICY_CHAIN_V2_MARKER,
  canonicalJson,
  deriveTaskJurisdictionBindingV2,
  evaluateStandingPolicyInheritanceV2,
  jurisdictionHashDomains,
  parseCanonicalMarkedComment,
  preflightOwnerJurisdictionDecisionV2,
  renderFiniteTaskAdmissionV2,
  renderFiniteTaskAdmissionFinalSourceV2,
  renderOwnerJurisdictionDecisionV2,
  renderOwnerJurisdictionPolicyChainDecisionV2,
  resolveFiniteTaskAdmissionChainV2,
  resolveOwnerJurisdictionPolicyChainV2,
  standardUnitedStatesStandingPolicyV2,
  typeSeparatedHash,
  verifyFiniteTaskAdmissionV2,
  verifyFiniteTaskAdmissionFinalSourceV2,
  verifyLegacyFiniteTaskAdmissionV1,
  verifyLegacyOwnerJurisdictionDecisionV1,
  verifyOwnerJurisdictionDecisionV2,
  verifyTaskJurisdictionBindingV2,
} from "../../scripts/assurance/jurisdiction-policy.mjs";
import { ARCHITECTURE_REPOSITORY_REVIEW_MARKER, STRUCTURED_OWNER_RECEIPT_TRANSPORT_CANONICALIZATION_ARCHITECTURE_PATHS, STRUCTURED_OWNER_RECEIPT_TRANSPORT_CANONICALIZATION_V1, architectureMaintenanceOwnerCommentBody, architectureMaintenanceSubject, architectureRepositoryReviewCommentBody, architectureRepositoryReviewSubject, canonicalPhase1FinalSourceWireProjection, classifyFiniteTaskAdmissionFinalSourceReceiptV2, FINITE_TASK_ADMISSION_LEASE_STATE, finiteTaskAdmissionHistoryValidV2, finiteTaskAdmissionLeaseStateValid, finiteTaskAdmissionSubject, finiteTaskEngineeringSourceLineageValid, finiteTaskFinalSourceOwnerJurisdictionV2, finiteTaskJurisdictionEvidenceV2, finiteTaskScopeV2, hashValue, normalizeGitHubCommentIdentity, ownerJurisdictionPolicyBindingTruthV2, resolveFiniteTaskAdmissionTaskBindingV2, stableJson, verifyArchitectureMaintenanceAuthority, verifyFiniteTaskAdmissionFinalSourceEligibilityV2, verifyFiniteTaskAdmissionSynchronizationLineage, verifyFiniteTaskOwnerApprovalV2, verifyOwnerJurisdictionAuthorityV2, verifyTaskJurisdictionAuthorityV2 } from "../../scripts/assurance/engineering-closure.mjs";
import { finiteTaskLiveContextCheckoutEligible, renderCurrentState, renderNextTask, resolveAssuranceControlSourceOnlyProfile } from "../../scripts/assurance/lib.mjs";

const DOMAINS = Object.freeze([
  "auth-session-password-recovery",
  "chilly-chat-inbox-thread",
  "creator-money-ledger",
  "moderation-reporting",
  "notifications-fcm",
  "payouts-stripe-connect",
  "revenuecat-premium",
  "storekit-google-play-billing",
  "supabase-migrations-rls",
]);
const EXTRA_DOMAIN = "synthetic-later-wave-domain";
const sha40 = (character) => character.repeat(40);
const sha64 = (character) => character.repeat(64);
const scope = Object.freeze({ launchProgram: "chillywood-united-states-pre-release", product: "chillywood-mobile", repository: "Chillywood2025/chillywood-mobile" });
const owner = Object.freeze({ association: "OWNER", login: "Chillywood2025" });
const taskIdentity = Object.freeze({
  implementationBranch: "codex/pre-release-identity-entitlement-authority-v1",
  implementationPr: 229,
  leaseId: "pre-release-identity-entitlement-authority-v1",
  originalSeedHead: sha40("1"),
  originalSeedTree: sha40("2"),
  ownerApprovalCommentId: 5285464582,
  planningHead: sha40("3"),
  planningTree: sha40("4"),
  taskArtifactPath: "docs/assurance/tasks/pre-release-identity-entitlement-authority-v1.json",
  taskId: "pre-release-identity-entitlement-authority-v1",
});
const taskEvidence = Object.freeze({ closurePacketHash: sha64("e"), completenessCertificateHash: sha64("a"), taskArtifactHash: sha64("b"), taskLocalEdgeClosureHash: sha64("c"), taskLocalEdgeEvidenceHash: sha64("f"), taskLocalModelHash: sha64("d") });
const taskScope = Object.freeze({
  allowedPaths: ["_lib/session.tsx", "app/(auth)/login.tsx", "docs/assurance/tasks/pre-release-identity-entitlement-authority-v1.json"].sort(),
  amendmentMaximum: { maximumAmendments: 1, maximumChangedLines: 4500, maximumFiles: 36 },
  packageChanges: false,
  recursion: { admissionPrMaximum: 1, postAdmissionClearancePrMaximum: 0, provenancePrMaximum: 0, sourceBindingPrMaximum: 0, terminalTruthPrMaximum: 1 },
  scopeBudget: { maximumChangedLines: 3600, maximumFiles: 30 },
  tests: ["tests/wave1/identity-entitlement-authority-mutants.test.mjs", "tests/wave1/identity-entitlement-authority.test.mjs"].sort(),
});
const registry = Object.freeze({
  features: [...DOMAINS, EXTRA_DOMAIN].map((featureId, index) => ({
    authority: { mutableStateOwner: `mutable-${index}`, owner: `authority-${index}` },
    cleanup: { owner: `rollback-${index}` },
    featureId,
    observability: { owner: `observability-${index}` },
    ownerSystems: [`system-${index}`, `security-${index}`],
    productOwner: `product-${index}`,
    providers: [`provider-${index}`],
  })),
});

const runGit = (root, args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const writeFixture = (root, file, value) => {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, value);
};

function canonicalAdmissionSynchronizationFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-admission-lineage-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  runGit(root, ["init", "--initial-branch=main"]);
  runGit(root, ["config", "user.name", "Synthetic Assurance"]);
  runGit(root, ["config", "user.email", "assurance@example.invalid"]);
  writeFixture(root, "config/assurance/current-truth-v1.json", "{}\n");
  writeFixture(root, "config/assurance/current-truth-contract-v1.json", fs.readFileSync(new URL("../../config/assurance/current-truth-contract-v1.json", import.meta.url), "utf8"));
  writeFixture(root, "config/assurance/control-plane-lifecycle-v2.json", fs.readFileSync(new URL("../../config/assurance/control-plane-lifecycle-v2.json", import.meta.url), "utf8"));
  writeFixture(root, "CURRENT_STATE.md", "synthetic base\n");
  writeFixture(root, "NEXT_TASK.md", "synthetic base\n");
  runGit(root, ["add", "."]);
  runGit(root, ["commit", "--no-gpg-sign", "-m", "Synthetic protected base"]);
  const anchorBase = runGit(root, ["rev-parse", "HEAD"]);
  const anchorBaseTree = runGit(root, ["rev-parse", "HEAD^{tree}"]);

  runGit(root, ["checkout", "-b", "admission"]);
  const record = JSON.parse(fs.readFileSync(new URL("../../config/assurance/current-truth-v1.json", import.meta.url), "utf8"));
  record.mainSha = anchorBase;
  record.protectedMainAuthority.checkpointSha = anchorBase;
  record.protectedMainAuthority.checkpointTree = anchorBaseTree;
  writeFixture(root, "config/assurance/current-truth-v1.json", `${JSON.stringify(record, null, 2)}\n`);
  writeFixture(root, "CURRENT_STATE.md", renderCurrentState(record));
  writeFixture(root, "NEXT_TASK.md", renderNextTask(record));
  runGit(root, ["add", "CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"]);
  runGit(root, ["commit", "--no-gpg-sign", "-m", "Canonical finite-task admission"]);
  const anchorHead = runGit(root, ["rev-parse", "HEAD"]);
  const anchorTree = runGit(root, ["rev-parse", "HEAD^{tree}"]);

  runGit(root, ["checkout", "main"]);
  runGit(root, ["checkout", "-b", "unrelated"]);
  writeFixture(root, "docs/synthetic-unrelated.md", "unrelated protected advancement\n");
  runGit(root, ["add", "docs/synthetic-unrelated.md"]);
  runGit(root, ["commit", "--no-gpg-sign", "-m", "Synthetic unrelated source"]);
  runGit(root, ["checkout", "main"]);
  runGit(root, ["merge", "--no-ff", "--no-gpg-sign", "unrelated", "-m", "Merge pull request #777 from owner/unrelated"]);
  const currentBase = runGit(root, ["rev-parse", "HEAD"]);
  runGit(root, ["checkout", "admission"]);
  runGit(root, ["merge", "--no-ff", "--no-gpg-sign", "main", "-m", "Synchronize protected main"]);
  const currentHead = runGit(root, ["rev-parse", "HEAD"]);
  const currentTree = runGit(root, ["rev-parse", "HEAD^{tree}"]);
  const currentTruth = JSON.parse(fs.readFileSync(path.join(root, "config/assurance/current-truth-v1.json"), "utf8"));
  const currentAdmission = { admissionIdentity: { branch: "admission", head: anchorHead, tree: anchorTree } };
  const identity = { repository: "Chillywood2025/chillywood-mobile", pr: 777, branch: "admission", baseRef: "main", baseSha: currentBase, headSha: currentHead };
  return { root, record, currentTruth, currentAdmission, identity, tree: currentTree, anchorHead, anchorTree, currentBase };
}

test("admission lease state matches the canonical current-truth schema and contract", () => {
  const schemas = JSON.parse(fs.readFileSync(new URL("../../config/assurance/schemas-v1.json", import.meta.url), "utf8"));
  const contract = JSON.parse(fs.readFileSync(new URL("../../config/assurance/current-truth-contract-v1.json", import.meta.url), "utf8"));
  const schemaStates = schemas.$defs.currentTruthRecord.properties.finiteTaskLeases.properties.tasks.items.properties.taskState.enum;
  assert.equal(FINITE_TASK_ADMISSION_LEASE_STATE, "ACTIVE_IMPLEMENTATION");
  assert.equal(schemaStates.includes(FINITE_TASK_ADMISSION_LEASE_STATE), true);
  assert.equal(contract.finiteTaskLeasePolicy.taskStates.includes(FINITE_TASK_ADMISSION_LEASE_STATE), true);
  assert.equal(finiteTaskAdmissionLeaseStateValid({ taskState: FINITE_TASK_ADMISSION_LEASE_STATE }), true);
  assert.equal(finiteTaskAdmissionLeaseStateValid({ taskState: "PREIMPLEMENTATION_ENGINEERING_CLEAR" }), false);
});
const decisions = Object.freeze(DOMAINS.map((domainId) => ({
  decision: `United States Wave 1 market application for ${domainId}; external evidence remains fail closed.`,
  domainId,
  jurisdictionDecisionOwner: owner.login,
  market: "UNITED_STATES_ONLY",
  minimumCreatorAge: ["creator-money-ledger", "payouts-stripe-connect"].includes(domainId) ? 18 : null,
})));
const baseInput = Object.freeze({ domainApplications: decisions, domainIds: DOMAINS, owner, registry, scope, taskEvidence, taskIdentity });

const receipt = (id, body, createdAt, overrides = {}) => ({ authorAssociation: "OWNER", authorLogin: owner.login, body, createdAt, id, updatedAt: createdAt, ...overrides });
const githubReceipt = (id, pr, body, createdAt) => ({ id, node_id: `IC_${id}`, body, created_at: createdAt, updated_at: createdAt, user: { login: owner.login }, author_association: "OWNER", issue_url: `https://api.github.com/repos/${scope.repository}/issues/${pr}`, html_url: `https://github.com/${scope.repository}/pull/${pr}#issuecomment-${id}` });
const payloadFrom = (body, marker) => JSON.parse(body.slice(marker.length + 1));
const withPayload = (marker, payload) => `${marker}\n${canonicalJson(payload)}`;

test("structured Owner receipt transport repair has an exact non-product maintenance profile", () => {
  const identity = { repository: scope.repository, pr: 486, branch: "codex/owner-receipt-transport-normalization-v1", baseSha: sha40("a"), headSha: sha40("b") };
  const maintenanceScope = { files: [...STRUCTURED_OWNER_RECEIPT_TRANSPORT_CANONICALIZATION_ARCHITECTURE_PATHS], additions: 500, deletions: 100, netChangedLines: 400 };
  const subject = architectureMaintenanceSubject({ identity, tree: sha40("c"), scope: maintenanceScope, profile: "OWNER_JURISDICTION_CANONICAL_MODEL_V2", objective: STRUCTURED_OWNER_RECEIPT_TRANSPORT_CANONICALIZATION_V1 });
  assert.equal(subject.objective, STRUCTURED_OWNER_RECEIPT_TRANSPORT_CANONICALIZATION_V1);
  assert.deepEqual(subject.changedPaths, STRUCTURED_OWNER_RECEIPT_TRANSPORT_CANONICALIZATION_ARCHITECTURE_PATHS);
  assert.equal(subject.currentTruthCompanionIncluded, false);
  assert.equal(Object.hasOwn(subject, "currentTruthCompanion"), false);
  assert.equal(Object.values(subject.authority).every((value) => value === false), true);
  assert.equal(resolveAssuranceControlSourceOnlyProfile({ changedPaths: maintenanceScope.files, budget: { maximumFiles: 5, maximumChangedLines: 900, maximumHandAuthoredNetLines: 900 }, changedFiles: 5 })?.profileId, STRUCTURED_OWNER_RECEIPT_TRANSPORT_CANONICALIZATION_V1);
  const raw = githubReceipt(1, identity.pr, architectureMaintenanceOwnerCommentBody(subject), "2026-09-20T00:00:00Z");
  const authority = verifyArchitectureMaintenanceAuthority({ raw, allComments: [raw], paginationComplete: true, identity, tree: subject.currentTree, scope: maintenanceScope, ancestryVerified: true });
  assert.equal(authority.authorizationOk, true, authority.findings.join(","));
  assert.equal(authority.mergeEligible, false);
  assert.throws(() => architectureMaintenanceSubject({ identity, tree: sha40("c"), scope: { ...maintenanceScope, files: maintenanceScope.files.slice(1) }, profile: "OWNER_JURISDICTION_CANONICAL_MODEL_V2", objective: STRUCTURED_OWNER_RECEIPT_TRANSPORT_CANONICALIZATION_V1 }), /OWNER_ASSURANCE_ARCHITECTURE_MAINTENANCE_SCOPE_INVALID/u);
});

test("live assurance-control observation admits only the exact source head or checked-out head", () => {
  const sourceHead = sha40("a");
  const mergeHead = sha40("b");
  const event = { pull_request: { head: { sha: sourceHead } } };
  assert.equal(finiteTaskLiveContextCheckoutEligible({ checkoutHead: sourceHead, actualCheckoutHead: mergeHead, githubEvent: event }), true);
  assert.equal(finiteTaskLiveContextCheckoutEligible({ checkoutHead: mergeHead, actualCheckoutHead: mergeHead, githubEvent: event }), true);
  assert.equal(finiteTaskLiveContextCheckoutEligible({ actualCheckoutHead: mergeHead, githubEvent: event }), true);
  assert.equal(finiteTaskLiveContextCheckoutEligible({ checkoutHead: sha40("c"), actualCheckoutHead: mergeHead, githubEvent: event }), false);
  assert.equal(finiteTaskLiveContextCheckoutEligible({ checkoutHead: sourceHead, actualCheckoutHead: mergeHead, githubEvent: { ref: "refs/heads/main" } }), false);
});
const legacyHash = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : canonicalJson(value)).digest("hex");
const aggregatePhase1Evidence = ({ repository = scope.repository, pr, branch, head, tree, base, runId = 35515008863 } = {}) => {
  const mode = "READY_MERGE_AUTHORITY";
  const action = "ready_for_review";
  const eventUpdatedAt = "2026-09-20T12:00:00Z";
  return {
    schemaVersion: "PHASE1_ADMISSION_EVIDENCE_V1", checkName: "Phase 1 / Admission Decision", result: "PHASE_1_ACCEPTABLE", maintenanceStatus: null,
    mode, acceptable: true, mergeAuthorityGranted: false, repository, pr, headRef: branch, headSha: head, sourceTree: tree, baseRef: "main", baseSha: base,
    evaluatorSha: base, action, eventUpdatedAt, draft: false, runId, runAttempt: 1,
    lifecycleGeneration: legacyHash({ schemaVersion: "PHASE1_LIFECYCLE_GENERATION_V1", repository, pr, headSha: head, baseSha: base, mode, action, eventUpdatedAt }),
    requiredLanes: 13, rawPassedLanes: 13, rawFailedLanes: 0, blockingFindingCount: 0, nonBlockingAssuranceFindingCount: 0, deferredExternalCount: 0,
    affectedRiskDomains: [], currentRulesetStage: "FINAL_AGGREGATE_ONLY", publisherAnchorHash: sha64("a"), publisherProvisioningReadbackHash: sha64("b"),
    phase1SourceDecisionHash: sha64("c"), decisionHash: sha64("d"),
  };
};
const legacyBody = (marker, base) => {
  const withSubjectHash = { ...base, subjectHash: legacyHash(base.subject) };
  return `${marker}\n${canonicalJson({ ...withSubjectHash, bodyHash: legacyHash(withSubjectHash) })}`;
};
const legacyAdmissionSubject = (overrides = {}) => {
  const changedPaths = ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"];
  return {
    admissionBranch: "codex/pre-release-identity-entitlement-authority-admission-v1",
    admissionHead: "830de90f44dffd6ae8bda5ea5c76aeae248556d7",
    admissionPr: 233,
    admissionTree: "069360ec85bf440b8eea18f57a541179ba9cbeab",
    allowedDomains: [...DOMAINS],
    allowedPaths: [...taskScope.allowedPaths],
    amendmentMaximum: { maximumAmendments: 1, maximumFiles: 36, maximumHandAuthoredNetLines: 4500 },
    authority: { build: false, ota: false, providerMutation: false, publicRelease: false, submission: false },
    certificateHash: taskEvidence.completenessCertificateHash,
    changedPathHash: legacyHash(changedPaths),
    changedPaths,
    closurePacketHash: taskEvidence.closurePacketHash,
    createdAtEqualsUpdatedAtRequired: true,
    currentPlanningHead: taskIdentity.planningHead,
    currentPlanningTree: taskIdentity.planningTree,
    featureId: DOMAINS[0],
    immutableCommentRequired: true,
    implementationBranch: taskIdentity.implementationBranch,
    implementationPr: taskIdentity.implementationPr,
    originalSeedHead: taskIdentity.originalSeedHead,
    originalSeedTree: taskIdentity.originalSeedTree,
    ownerApprovalComment: taskIdentity.ownerApprovalCommentId,
    ownerIdentity: owner,
    packageChanges: false,
    pr: 233,
    protectedBase: sha40("9"),
    recursion: { admissionPrMaximum: 1, postAdmissionClearancePrMaximum: 0, provenancePrMaximum: 0, sourceBindingPrMaximum: 0, terminalTruthPrMaximum: 1 },
    repository: scope.repository,
    scope: { maximumFiles: 30, maximumHandAuthoredNetLines: 3600 },
    taskArtifactHash: taskEvidence.taskArtifactHash,
    taskArtifactPath: taskIdentity.taskArtifactPath,
    taskLocalEdgeClosureHash: taskEvidence.taskLocalEdgeClosureHash,
    taskLocalEdgeEvidenceHash: taskEvidence.taskLocalEdgeEvidenceHash,
    taskLocalModelDeltaHash: taskEvidence.taskLocalModelHash,
    tests: [...taskScope.tests],
    type: "FINITE_TASK_ADMISSION_TO_CLEARANCE_V1",
    ...overrides,
  };
};

test("one deterministic V2 Owner comment preflights as standing policy plus exact Wave 1 9/9 binding", () => {
  const first = preflightOwnerJurisdictionDecisionV2(baseInput);
  const second = preflightOwnerJurisdictionDecisionV2(baseInput);
  assert.equal(first.ok, true, first.findings?.join(","));
  assert.equal(first.body, second.body);
  assert.equal(first.verification.coverage.result, "9/9");
  assert.deepEqual(first.verification.taskBinding.domainIds, DOMAINS);
  assert.equal(first.verification.taskBinding.domainIds.includes("*"), false);
  assert.equal(first.verification.taskBinding.domainIds.includes("OWNER_JURISDICTION_STANDING_POLICY_V2"), false);
  assert.equal(first.verification.taskBinding.domainCoverageReusable, false);
  assert.equal(first.verification.taskBinding.externalProofInherited, false);
  assert.equal(first.verification.standingPolicy.inheritance.policyIsDomain, false);
  assert.equal(first.verification.standingPolicy.inheritance.policyIsWildcard, false);
  assert.equal(first.verification.standingPolicy.inheritance.wave1TaskBindingReusable, false);
  assert.notEqual(first.standingPolicyHash, first.taskBindingHash);
  assert.notEqual(first.standingPolicyHash, first.envelopeHash);
  assert.notEqual(first.taskBindingHash, first.envelopeHash);
  const raw = githubReceipt(9001, 229, first.body, "2026-08-14T12:00:00Z");
  assert.equal(verifyTaskJurisdictionAuthorityV2({ binding: first.verification.taskBinding, expectedScope: scope, paginationComplete: true, policyRaws: [raw], registry }).ok, false);
});

test("exact domain validation rejects empty, wildcard, duplicate, unknown, case and Unicode-confusable IDs", () => {
  assert.equal(preflightOwnerJurisdictionDecisionV2({ ...baseInput, taskIdentity: { ...taskIdentity, taskId: "../x", leaseId: "../x", taskArtifactPath: "docs/assurance/tasks/../x.json" } }).ok, false);
  const cases = [
    { domainApplications: [], domainIds: [] },
    { domainApplications: [{ ...decisions[0], domainId: "*" }], domainIds: ["*"] },
    { domainApplications: [decisions[0], decisions[0]], domainIds: [DOMAINS[0], DOMAINS[0]] },
    { domainApplications: [{ ...decisions[0], domainId: "unknown-domain" }], domainIds: ["unknown-domain"] },
    { domainApplications: [{ ...decisions[0], domainId: DOMAINS[0].toUpperCase() }], domainIds: [DOMAINS[0].toUpperCase()] },
    { domainApplications: [{ ...decisions[0], domainId: "auth-sessiοn-password-recovery" }], domainIds: ["auth-sessiοn-password-recovery"] },
  ];
  for (const changed of cases) assert.equal(preflightOwnerJurisdictionDecisionV2({ ...baseInput, ...changed }).ok, false);
});

test("Wave 1 expected set rejects omission and an extra registered domain", () => {
  const omitted = renderOwnerJurisdictionDecisionV2({ ...baseInput, domainApplications: decisions.slice(0, -1), domainIds: DOMAINS.slice(0, -1) });
  assert.equal(verifyOwnerJurisdictionDecisionV2({ body: omitted.body, registry, expected: { domainIds: DOMAINS } }).ok, false);
  const extraDecision = { decision: "Synthetic future application.", domainId: EXTRA_DOMAIN, jurisdictionDecisionOwner: owner.login, market: "UNITED_STATES_ONLY", minimumCreatorAge: null };
  const extra = renderOwnerJurisdictionDecisionV2({ ...baseInput, domainApplications: [...decisions, extraDecision], domainIds: [...DOMAINS, EXTRA_DOMAIN].sort() });
  assert.equal(verifyOwnerJurisdictionDecisionV2({ body: extra.body, registry, expected: { domainIds: DOMAINS } }).ok, false);
});

test("identity, immutable receipt, subject/body/envelope hashes and exact types are fail closed", () => {
  const rendered = renderOwnerJurisdictionDecisionV2(baseInput);
  const goodReceipt = receipt(9001, rendered.body, "2026-08-14T12:00:00Z");
  const expected = { domainIds: DOMAINS, launchProgram: scope.launchProgram, ownerLogin: owner.login, pr: 229, product: scope.product, repository: scope.repository, task: taskIdentity.taskId };
  assert.equal(verifyOwnerJurisdictionDecisionV2({ body: rendered.body, registry, receipt: goodReceipt, expected }).ok, true);
  for (const changed of [
    { repository: "Elsewhere/repo" },
    { product: "other-product" },
    { launchProgram: "other-program" },
    { pr: 230 },
    { task: "other-task" },
    { ownerLogin: "NotOwner" },
  ]) assert.equal(verifyOwnerJurisdictionDecisionV2({ body: rendered.body, registry, expected: { ...expected, ...changed } }).ok, false);
  assert.equal(verifyOwnerJurisdictionDecisionV2({ body: rendered.body, registry, receipt: { ...goodReceipt, updatedAt: "2026-08-14T12:00:01Z" } }).ok, false);
  assert.equal(verifyOwnerJurisdictionDecisionV2({ body: rendered.body, registry, receipt: { ...goodReceipt, authorAssociation: "MEMBER" } }).ok, false);
  const payload = payloadFrom(rendered.body, OWNER_JURISDICTION_DECISION_V2_MARKER);
  for (const key of ["subjectHash", "bodyHash", "envelopeHash", "standingPolicyHash", "taskBindingHash"]) {
    const corrupted = { ...payload, [key]: sha64("0") };
    assert.equal(verifyOwnerJurisdictionDecisionV2({ body: withPayload(OWNER_JURISDICTION_DECISION_V2_MARKER, corrupted), registry }).ok, false, key);
  }
  const typeConfused = { ...payload, type: "FINITE_TASK_ADMISSION_V2" };
  assert.equal(verifyOwnerJurisdictionDecisionV2({ body: withPayload(OWNER_JURISDICTION_DECISION_V2_MARKER, typeConfused), registry }).ok, false);
});

test("Owner identity, exact task evidence, and all domain applications are cross-bound", () => {
  const otherOwner = { association: "OWNER", login: "OtherOwner" };
  assert.throws(() => renderOwnerJurisdictionDecisionV2({ ...baseInput, standingPolicy: standardUnitedStatesStandingPolicyV2({ owner: otherOwner, scope }) }), /STANDING_POLICY_INVALID/u);
  const rendered = renderOwnerJurisdictionDecisionV2(baseInput);
  const exactExpected = { domainApplications: decisions, domainIds: DOMAINS, jurisdictionDecisionOwner: owner.login, launchProgram: scope.launchProgram, ownerLogin: owner.login, pr: taskIdentity.implementationPr, product: scope.product, repository: scope.repository, standingPolicy: standardUnitedStatesStandingPolicyV2({ owner, scope }), task: taskIdentity.taskId, taskEvidence, taskIdentity };
  assert.equal(verifyOwnerJurisdictionDecisionV2({ body: rendered.body, expected: exactExpected, registry }).ok, true);
  assert.equal(verifyOwnerJurisdictionDecisionV2({ body: rendered.body, expected: { ...exactExpected, taskEvidence: { ...taskEvidence, taskArtifactHash: sha64("0") } }, registry }).ok, false);
  assert.equal(verifyOwnerJurisdictionDecisionV2({ body: rendered.body, expected: { ...exactExpected, domainApplications: decisions.map((item, index) => index === 2 ? { ...item, minimumCreatorAge: 21 } : item) }, registry }).ok, false);
});

test("structurally malformed canonical V2 payloads fail closed without throwing", () => {
  const ownerMalformed = `${OWNER_JURISDICTION_DECISION_V2_MARKER}\n${canonicalJson({ bodyHash: sha64("0") })}`;
  const admissionMalformed = `${FINITE_TASK_ADMISSION_V2_MARKER}\n${canonicalJson({ bodyHash: sha64("0") })}`;
  assert.doesNotThrow(() => verifyOwnerJurisdictionDecisionV2({ body: ownerMalformed, registry }));
  assert.equal(verifyOwnerJurisdictionDecisionV2({ body: ownerMalformed, registry }).ok, false);
  assert.doesNotThrow(() => verifyFiniteTaskAdmissionV2({ body: admissionMalformed }));
  assert.equal(verifyFiniteTaskAdmissionV2({ body: admissionMalformed }).ok, false);
});

test("strict marked parser rejects duplicate/unknown keys, whitespace, multiple markers, trailing content, depth and size", () => {
  assert.equal(parseCanonicalMarkedComment(`${OWNER_JURISDICTION_DECISION_V2_MARKER}\n{"a":1,"a":2}`, OWNER_JURISDICTION_DECISION_V2_MARKER).ok, false);
  assert.equal(parseCanonicalMarkedComment(`${OWNER_JURISDICTION_DECISION_V2_MARKER}\n {"a":1}`, OWNER_JURISDICTION_DECISION_V2_MARKER).ok, false);
  assert.equal(parseCanonicalMarkedComment(`${OWNER_JURISDICTION_DECISION_V2_MARKER}\n{"a":1}\nunsigned`, OWNER_JURISDICTION_DECISION_V2_MARKER).ok, false);
  assert.equal(parseCanonicalMarkedComment(`${OWNER_JURISDICTION_DECISION_V2_MARKER}\n{}\n${OWNER_JURISDICTION_DECISION_V2_MARKER}\n{}`, OWNER_JURISDICTION_DECISION_V2_MARKER).ok, false);
  assert.equal(parseCanonicalMarkedComment(`${OWNER_JURISDICTION_DECISION_V2_MARKER}\n${"[".repeat(30)}0${"]".repeat(30)}`, OWNER_JURISDICTION_DECISION_V2_MARKER).ok, false);
  assert.equal(parseCanonicalMarkedComment(`${OWNER_JURISDICTION_DECISION_V2_MARKER}\n${JSON.stringify("x".repeat(MAX_CANONICAL_COMMENT_BYTES))}`, OWNER_JURISDICTION_DECISION_V2_MARKER).ok, false);
  const rendered = renderOwnerJurisdictionDecisionV2(baseInput);
  const payload = payloadFrom(rendered.body, OWNER_JURISDICTION_DECISION_V2_MARKER);
  assert.equal(verifyOwnerJurisdictionDecisionV2({ body: withPayload(OWNER_JURISDICTION_DECISION_V2_MARKER, { ...payload, unknownCriticalField: true }), registry }).ok, false);
});

test("structured Owner receipt transport canonicalizes only the marker separator and one terminal newline", () => {
  const marker = OWNER_JURISDICTION_DECISION_V2_MARKER;
  const lf = `${marker}\n{"a":1}`;
  const crlf = `${marker}\r\n{"a":1}`;
  const parsedLf = parseCanonicalMarkedComment(lf, marker);
  const parsedCrlf = parseCanonicalMarkedComment(crlf, marker);
  assert.equal(parsedLf.ok, true);
  assert.equal(parsedCrlf.ok, true);
  assert.equal(parsedLf.canonicalBody, lf);
  assert.equal(parsedCrlf.canonicalBody, lf);
  assert.equal(parsedLf.canonicalBodyHash, parsedCrlf.canonicalBodyHash);
  assert.notEqual(parsedLf.rawBodyHash, parsedCrlf.rawBodyHash);
  assert.equal(parseCanonicalMarkedComment(`${lf}\n`, marker).canonicalBodyHash, parsedLf.canonicalBodyHash);
  assert.equal(parseCanonicalMarkedComment(`${crlf}\r\n`, marker).canonicalBodyHash, parsedLf.canonicalBodyHash);
  assert.equal(parseCanonicalMarkedComment(`${marker}\r\n{"a":1}\r\nunsigned`, marker).ok, false);
  assert.equal(parseCanonicalMarkedComment(`${marker}-mutated\n{"a":1}`, marker).ok, false);
  assert.equal(parseCanonicalMarkedComment(`${marker}\n{"a":1`, marker).ok, false);
  assert.equal(parseCanonicalMarkedComment(`${marker}\n{"a":1}\n{"b":2}`, marker).ok, false);
  assert.equal(parseCanonicalMarkedComment(`${marker}\r\n{"a":1}\r\n${marker}\n{"a":1}`, marker).ok, false);
  const changed = parseCanonicalMarkedComment(`${marker}\n{"a":2}`, marker);
  assert.equal(changed.ok, true);
  assert.notEqual(changed.canonicalBodyHash, parsedLf.canonicalBodyHash);
});

test("Owner approval and finite-task receipts preserve semantic bindings across LF and CRLF", () => {
  const implementation = { branch: taskIdentity.implementationBranch, pr: taskIdentity.implementationPr, seedHead: taskIdentity.originalSeedHead, seedTree: taskIdentity.originalSeedTree, taskArtifactPath: taskIdentity.taskArtifactPath };
  const taskArtifact = { primaryDomain: "auth-session-password-recovery", taskId: taskIdentity.taskId };
  const subject = {
    admittedSeed: { head: implementation.seedHead, tree: implementation.seedTree },
    authority: { build: false, database: false, money: false, ota: false, product: false, provider: false, publicRelease: false, submission: false },
    implementationBranch: implementation.branch,
    implementationPr: implementation.pr,
    leaseId: taskArtifact.taskId,
    ownerIdentity: owner,
    primaryFeature: taskArtifact.primaryDomain,
    repository: scope.repository,
    taskArtifact: implementation.taskArtifactPath,
  };
  const base = { currentHead: implementation.seedHead, evidenceClass: "OWNER_INTENT", leaseId: taskArtifact.taskId, pr: implementation.pr, repository: scope.repository, subject, subjectHash: hashValue(subject), type: "REGISTERED_OWNER_DECISION" };
  const payload = { ...base, bodyHash: hashValue(base) };
  const marker = LEGACY_OWNER_AUTHORIZATION_V1_MARKER;
  const lfBody = `${marker}\n${stableJson(payload)}`;
  const crlfBody = `${marker}\r\n${stableJson(payload)}`;
  const raw = (id, body, overrides = {}) => ({ id, node_id: `IC_${id}`, user: { login: owner.login }, author_association: owner.association, body, created_at: "2026-09-20T12:00:00Z", updated_at: "2026-09-20T12:00:00Z", issue_url: `https://api.github.com/repos/${scope.repository}/issues/${implementation.pr}`, html_url: `https://github.com/${scope.repository}/pull/${implementation.pr}#issuecomment-${id}`, ...overrides });
  const normalize = (value) => normalizeGitHubCommentIdentity(value, { repository: scope.repository, pr: implementation.pr, commentId: value.id });
  const args = { identity: { repository: scope.repository }, implementation, taskArtifact, binding: { taskIdentity: { ownerApprovalCommentId: 7001 } } };
  assert.equal(verifyFiniteTaskOwnerApprovalV2({ approval: normalize(raw(7001, lfBody)), ...args }), true);
  assert.equal(verifyFiniteTaskOwnerApprovalV2({ approval: normalize(raw(7001, crlfBody)), ...args }), true);
  assert.equal(verifyFiniteTaskOwnerApprovalV2({ approval: normalize(raw(7001, crlfBody, { updated_at: "2026-09-20T12:00:01Z" })), ...args }), false);
  assert.equal(verifyFiniteTaskOwnerApprovalV2({ approval: normalize(raw(7001, crlfBody, { user: { login: "NotOwner" } })), ...args }), false);
  const rendered = admissionFixture().v2;
  const browserBody = rendered.body.replace("\n", "\r\n");
  const lfVerified = verifyFiniteTaskAdmissionV2({ body: rendered.body, expected: { repository: scope.repository, pr: rendered.payload.pr, head: rendered.payload.subject.admissionIdentity.head, tree: rendered.payload.subject.admissionIdentity.tree } });
  const crlfVerified = verifyFiniteTaskAdmissionV2({ body: browserBody, expected: { repository: scope.repository, pr: rendered.payload.pr, head: rendered.payload.subject.admissionIdentity.head, tree: rendered.payload.subject.admissionIdentity.tree } });
  assert.equal(lfVerified.ok, true);
  assert.equal(crlfVerified.ok, true);
  assert.equal(lfVerified.canonicalBodyHash, crlfVerified.canonicalBodyHash);
  assert.notEqual(lfVerified.rawBodyHash, crlfVerified.rawBodyHash);
  assert.equal(verifyFiniteTaskAdmissionV2({ body: rendered.body, expected: { repository: "Elsewhere/repo" } }).ok, false);
  assert.equal(verifyFiniteTaskAdmissionV2({ body: rendered.body, expected: { pr: rendered.payload.pr + 1 } }).ok, false);
  assert.equal(verifyFiniteTaskAdmissionV2({ body: rendered.body, expected: { head: sha40("f") } }).ok, false);
  assert.equal(verifyFiniteTaskAdmissionV2({ body: rendered.body, expected: { tree: sha40("e") } }).ok, false);
  const mutatedValue = structuredClone(rendered.payload); mutatedValue.subject.supersessionReason += " ";
  assert.equal(verifyFiniteTaskAdmissionV2({ body: withPayload(FINITE_TASK_ADMISSION_V2_MARKER, mutatedValue) }).ok, false);
  const mutatedString = structuredClone(rendered.payload); mutatedString.subject.supersessionReason += "\\n";
  assert.equal(verifyFiniteTaskAdmissionV2({ body: withPayload(FINITE_TASK_ADMISSION_V2_MARKER, mutatedString) }).ok, false);
  assert.equal(verifyFiniteTaskAdmissionV2({ body: withPayload(FINITE_TASK_ADMISSION_V2_MARKER, { ...rendered.payload, subjectHash: sha64("0") }) }).ok, false);
});

test("type-separated hashes reject cross-object substitution", () => {
  const value = { exact: "same bytes" };
  const hashes = Object.values(jurisdictionHashDomains).map((domain) => typeSeparatedHash(domain, value));
  assert.equal(new Set(hashes).size, hashes.length);
  assert.throws(() => typeSeparatedHash("unregistered/domain", value), /UNKNOWN_HASH_DOMAIN/u);
});

test("future wave inherits only allowlisted standing fields and binds its own exact domains", () => {
  const rendered = renderOwnerJurisdictionDecisionV2(baseInput);
  const firstReceipt = receipt(9001, rendered.body, "2026-08-14T12:00:00Z");
  const policyResolution = resolveOwnerJurisdictionPolicyChainV2({ completeDiscovery: true, expectedScope: scope, receipts: [firstReceipt], registry });
  assert.equal(policyResolution.ok, true);
  assert.throws(() => { policyResolution.commentId = 999; }, TypeError);
  const inheritance = evaluateStandingPolicyInheritanceV2({ domainIds: [EXTRA_DOMAIN], policyResolution, registry, scope });
  assert.deepEqual(inheritance, { externalEvidenceDoesNotTriggerRestatement: true, identicalOwnerPolicyRestatementRequired: false, inheritable: true, reasons: [], requiresNewOwnerDecision: false });
  const laterIdentity = { ...taskIdentity, implementationBranch: "codex/later-wave", implementationPr: 300, leaseId: "later-wave", ownerApprovalCommentId: 6000000000, planningHead: sha40("5"), planningTree: sha40("6"), taskArtifactPath: "docs/assurance/tasks/later-wave.json", taskId: "later-wave" };
  const binding = deriveTaskJurisdictionBindingV2({ domainIds: [EXTRA_DOMAIN], policyReceipt: policyResolution, registry, scope, taskEvidence, taskIdentity: laterIdentity });
  assert.deepEqual(binding.domainIds, [EXTRA_DOMAIN]);
  assert.equal(binding.domainApplications.some(({ domainId }) => DOMAINS.includes(domainId)), false);
  assert.equal(binding.externalProofInherited, false);
  assert.equal(binding.domainCoverageReusable, false);
  assert.deepEqual(Object.keys(binding.policyReference), ["commentId", "source", "standingPolicyHash", "standingPolicySequence", "standingPolicyStatus", "standingPolicyType", "standingPolicyVersion"]);
  assert.deepEqual(binding.domainApplications, [{ decision: "INHERITED_STANDING_OWNER_LAUNCH_MARKET_POLICY_ONLY", domainId: EXTRA_DOMAIN, jurisdictionDecisionOwner: owner.login, market: "UNITED_STATES_ONLY", minimumCreatorAge: null }]);
  const inheritedAdmissionBinding = { domainIds: [EXTRA_DOMAIN], ownerDecisionCommentId: 9001, standingPolicyHash: policyResolution.standingPolicyHash, standingPolicySequence: 0, standingPolicyStatus: ACTIVE_POLICY_STATUS, standingPolicyType: "OWNER_JURISDICTION_STANDING_POLICY_V2", standingPolicyVersion: 2, taskBinding: binding, taskBindingHash: binding.bindingHash };
  const inheritedAdmission = renderFiniteTaskAdmissionV2({ scope, owner, admissionIdentity: { branch: laterIdentity.implementationBranch, head: laterIdentity.planningHead, pr: 301, taskId: laterIdentity.taskId, tree: laterIdentity.planningTree }, ownerJurisdictionBinding: inheritedAdmissionBinding, taskEvidence, taskScope, changedPaths: ["CURRENT_STATE.md"], scopeBudget: { maximumChangedLines: 10, maximumFiles: 1 } });
  assert.equal(verifyFiniteTaskAdmissionV2({ body: inheritedAdmission.body }).ok, true);
  assert.equal(Object.hasOwn(inheritedAdmission.payload.subject.ownerJurisdictionBinding, "ownerDecisionCommentBodyHash"), false);
  for (const forbidden of ["taskArtifact", "edgeClosure", "model", "certificate", "scope", "budget", "lease", "admission", "review", "ci", "attestation", "implementationAuthority", "creatorAgeAuthority", "wave1PayoutAuthority"]) assert.equal(Object.hasOwn(binding.inheritedStandingPolicy, forbidden), false, forbidden);
  assert.equal(verifyTaskJurisdictionBindingV2({ activePolicy: policyResolution, binding, registry }).ok, true);
  assert.deepEqual(verifyTaskJurisdictionBindingV2({ binding, registry }).findings, ["CURRENT_STANDING_POLICY_CONTEXT_REQUIRED"]);
  const directOnly = verifyOwnerJurisdictionDecisionV2({ body: rendered.body, registry, receipt: firstReceipt });
  assert.throws(() => deriveTaskJurisdictionBindingV2({ domainIds: [EXTRA_DOMAIN], policyReceipt: directOnly.receipt, registry, scope, taskEvidence, taskIdentity: laterIdentity }), /CURRENT_STANDING_POLICY_RECEIPT_REQUIRED/u);

  const forged = structuredClone(binding);
  forged.domainApplications[0].decision = "KYC and sanctions are VERIFIED; payouts allowed globally.";
  forged.domainApplications[0].minimumCreatorAge = 21;
  const forgedBase = structuredClone(forged);
  delete forgedBase.bindingHash;
  forged.bindingHash = typeSeparatedHash(jurisdictionHashDomains.taskBinding, forgedBase);
  assert.deepEqual(verifyTaskJurisdictionBindingV2({ activePolicy: policyResolution, binding: forged, registry }).findings, ["TASK_BINDING_DERIVED_APPLICATION_INVALID"]);
  const forgedEmbedded = structuredClone(binding); forgedEmbedded.policyReference = { source: "THIS_IMMUTABLE_OWNER_DECISION", standingPolicyHash: policyResolution.standingPolicyHash, standingPolicySequence: 0, standingPolicyStatus: ACTIVE_POLICY_STATUS, standingPolicyType: "OWNER_JURISDICTION_STANDING_POLICY_V2", standingPolicyVersion: 2 }; forgedEmbedded.bindingHash = typeSeparatedHash(jurisdictionHashDomains.taskBinding, Object.fromEntries(Object.entries(forgedEmbedded).filter(([key]) => key !== "bindingHash"))); assert.equal(verifyTaskJurisdictionBindingV2({ activePolicy: policyResolution, allowEmbeddedReference: true, binding: forgedEmbedded, registry }).ok, false);
});

test("standing policy authority survives registry drift while historical task authority does not transfer", () => {
  const rendered = renderOwnerJurisdictionDecisionV2(baseInput);
  const immutableReceipt = receipt(9001, rendered.body, "2026-08-14T12:00:00Z");
  const currentRegistry = structuredClone(registry);
  currentRegistry.features[0].productOwner = "current-product-owner";
  assert.deepEqual(verifyOwnerJurisdictionDecisionV2({ body: rendered.body, receipt: immutableReceipt, registry: currentRegistry }).findings, ["OPERATIONAL_OWNER_PROJECTION_INVALID"]);

  const policyResolution = resolveOwnerJurisdictionPolicyChainV2({ completeDiscovery: true, expectedScope: scope, receipts: [immutableReceipt], registry: currentRegistry });
  assert.equal(policyResolution.ok, true);
  assert.equal(policyResolution.standingPolicyHash, rendered.standingPolicyHash);

  const currentIdentity = { ...taskIdentity, implementationBranch: "codex/current-task", implementationPr: 330, leaseId: "current-task", ownerApprovalCommentId: 6000000330, planningHead: sha40("7"), planningTree: sha40("8"), taskArtifactPath: "docs/assurance/tasks/current-task.json", taskId: "current-task" };
  const currentBinding = deriveTaskJurisdictionBindingV2({ domainIds: [DOMAINS[0]], policyReceipt: policyResolution, registry: currentRegistry, scope, taskEvidence, taskIdentity: currentIdentity });
  assert.equal(currentBinding.operationalOwnerProjection[0].productOwner, "current-product-owner");
  assert.equal(verifyTaskJurisdictionBindingV2({ activePolicy: policyResolution, binding: currentBinding, registry: currentRegistry }).ok, true);
  assert.notEqual(currentBinding.bindingHash, rendered.taskBindingHash);

  const mutatedReceipt = structuredClone(immutableReceipt);
  mutatedReceipt.body = mutatedReceipt.body.replace("UNITED_STATES_ONLY", "GLOBAL");
  assert.equal(resolveOwnerJurisdictionPolicyChainV2({ completeDiscovery: true, expectedScope: scope, receipts: [mutatedReceipt], registry: currentRegistry }).ok, false);
});

test("genuine changes require a new Owner choice but unavailable external proof does not", () => {
  const rendered = renderOwnerJurisdictionDecisionV2(baseInput);
  const policyResolution = resolveOwnerJurisdictionPolicyChainV2({ completeDiscovery: true, expectedScope: scope, receipts: [receipt(9001, rendered.body, "2026-08-14T12:00:00Z")], registry });
  const changes = [
    { requestedPrimaryMarket: "GLOBAL" },
    { includeUnitedStatesTerritories: true },
    { requestedInitialRollout: "100_PERCENT" },
    { explicitPolicyChange: true },
    { capabilitySpecificConflicts: [{ domainId: EXTRA_DOMAIN }] },
  ];
  for (const changed of changes) {
    const result = evaluateStandingPolicyInheritanceV2({ domainIds: [EXTRA_DOMAIN], policyResolution, registry, scope, ...changed });
    assert.equal(result.inheritable, false);
    assert.equal(result.requiresNewOwnerDecision, true);
  }
  for (const externalEvidenceStatus of ["BLOCKED_EXTERNAL", "PENDING_VERIFICATION", "UNKNOWN", "STALE", "UNAVAILABLE"]) {
    const result = evaluateStandingPolicyInheritanceV2({ domainIds: [EXTRA_DOMAIN], externalEvidenceStatus, policyResolution, registry, scope });
    assert.equal(result.inheritable, true, externalEvidenceStatus);
    assert.equal(result.identicalOwnerPolicyRestatementRequired, false);
  }
  assert.equal(evaluateStandingPolicyInheritanceV2({ capabilitySpecificConflicts: "not-an-array", domainIds: [EXTRA_DOMAIN], policyResolution, registry, scope }).inheritable, false);
  assert.equal(evaluateStandingPolicyInheritanceV2({ domainIds: [EXTRA_DOMAIN], policyResolution: { ...policyResolution }, registry, scope }).inheritable, false);
});

test("registered operational/data/rollback/provider ownership is projected exactly and cannot be replaced", () => {
  const verified = preflightOwnerJurisdictionDecisionV2(baseInput).verification;
  assert.deepEqual(verified.taskBinding.operationalOwnerProjection[0], {
    authorityOwner: "authority-0",
    cleanupOwner: "rollback-0",
    domainId: DOMAINS[0],
    mutableStateOwner: "mutable-0",
    observabilityOwner: "observability-0",
    ownerSystems: ["security-0", "system-0"],
    productOwner: "product-0",
    providers: ["provider-0"],
  });
  const tampered = structuredClone(verified.taskBinding);
  tampered.operationalOwnerProjection[0].authorityOwner = owner.login;
  assert.equal(verifyTaskJurisdictionBindingV2({ binding: tampered, registry, allowEmbeddedReference: true }).ok, false);
});

test("legacy one-domain Owner receipts remain valid only under legacy non-reusable semantics", () => {
  const subject = { chosenOwner: owner.login, currentHead: taskIdentity.planningHead, domain: DOMAINS[0], leaseId: taskIdentity.leaseId, marketsJurisdictions: ["UNITED_STATES_ONLY"], task: taskIdentity.taskId, type: "OWNER_JURISDICTION_DECISION", unknown: "market/jurisdiction owner" };
  const body = legacyBody(LEGACY_OWNER_AUTHORIZATION_V1_MARKER, { authorizationId: "github-comment-8999", currentHead: taskIdentity.planningHead, evidenceClass: "OWNER_INTENT", leaseId: taskIdentity.leaseId, pr: 229, repository: scope.repository, schemaVersion: 1, subject, task: taskIdentity.taskId, type: "OWNER_JURISDICTION_DECISION" });
  const result = verifyLegacyOwnerJurisdictionDecisionV1({ body, receipt: receipt(8999, body, "2026-08-13T12:00:00Z") });
  assert.equal(result.ok, true);
  assert.equal(result.reusableStandingPolicy, false);
  assert.deepEqual(result.domainIds, [DOMAINS[0]]);
  const invalid = body.replace("UNITED_STATES_ONLY", "GLOBAL");
  assert.equal(verifyLegacyOwnerJurisdictionDecisionV1({ body: invalid }).ok, false);
  const permissiveV1 = legacyBody(LEGACY_OWNER_AUTHORIZATION_V1_MARKER, { evidenceClass: "OWNER_INTENT", repository: scope.repository, schemaVersion: 1, subject: { domain: DOMAINS[0] }, type: "OWNER_JURISDICTION_DECISION" });
  assert.equal(verifyLegacyOwnerJurisdictionDecisionV1({ body: permissiveV1 }).ok, false);
  assert.equal(verifyOwnerJurisdictionDecisionV2({ body, registry }).ok, false);
});

test("policy chain resolves a single hash-bound tip, rejects forks/gaps/cross-scope, and revocation removes authority", () => {
  const initial = renderOwnerJurisdictionDecisionV2(baseInput);
  assert.throws(() => renderOwnerJurisdictionPolicyChainDecisionV2({ standingPolicy: standardUnitedStatesStandingPolicyV2({ action: "SUPERSEDE", owner, predecessor: { commentId: 9001, standingPolicyHash: initial.standingPolicyHash }, reason: "ZERO_SEQUENCE", scope, sequence: 0 }) }), /POLICY_CHAIN_DECISION_INVALID/u);
  const firstReceipt = receipt(9001, initial.body, "2026-08-14T12:00:00Z");
  const supersedingPolicy = standardUnitedStatesStandingPolicyV2({ action: "SUPERSEDE", owner, predecessor: { commentId: 9001, standingPolicyHash: initial.standingPolicyHash }, reason: "OWNER_REAFFIRMS_AND_SUPERSEDES", scope, sequence: 1 });
  assert.throws(() => renderOwnerJurisdictionPolicyChainDecisionV2({ standingPolicy: { ...supersedingPolicy, applicability: { ...supersedingPolicy.applicability, conflictRequirement: "CONFLICTS_AUTOMATICALLY_ALLOWED" } } }), /POLICY_CHAIN_DECISION_INVALID/u);
  const supersession = renderOwnerJurisdictionPolicyChainDecisionV2({ standingPolicy: supersedingPolicy });
  const secondReceipt = receipt(9002, supersession.body, "2026-08-14T12:01:00Z");
  const resolved = resolveOwnerJurisdictionPolicyChainV2({ completeDiscovery: true, expectedScope: scope, receipts: [secondReceipt, firstReceipt], registry });
  assert.equal(resolved.ok, true, resolved.findings.join(","));
  assert.equal(resolved.commentId, 9002);
  assert.equal(resolved.pendingBindingsRequireReevaluation, true);
  for (const outerMutation of [{ owner: { association: "OWNER", login: "DifferentOwner" } }, { repository: "OtherOrg/OtherRepo" }]) {
    const payload = { ...payloadFrom(supersession.body, OWNER_JURISDICTION_POLICY_CHAIN_V2_MARKER), ...outerMutation };
    payload.bodyHash = typeSeparatedHash(jurisdictionHashDomains.policyChainBody, Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "bodyHash")));
    assert.equal(resolveOwnerJurisdictionPolicyChainV2({ completeDiscovery: true, expectedScope: scope, receipts: [firstReceipt, receipt(9090, withPayload(OWNER_JURISDICTION_POLICY_CHAIN_V2_MARKER, payload), "2026-08-14T12:01:00Z")], registry }).ok, false);
  }
  const oldVerified = verifyOwnerJurisdictionDecisionV2({ body: initial.body, registry, receipt: firstReceipt });
  assert.equal(verifyTaskJurisdictionBindingV2({ activePolicy: resolved, allowEmbeddedReference: true, binding: oldVerified.taskBinding, registry }).ok, false);
  const forkPolicy = standardUnitedStatesStandingPolicyV2({ action: "SUPERSEDE", owner, predecessor: { commentId: 9001, standingPolicyHash: initial.standingPolicyHash }, reason: "FORK", scope, sequence: 1 });
  const fork = renderOwnerJurisdictionPolicyChainDecisionV2({ standingPolicy: forkPolicy });
  assert.equal(resolveOwnerJurisdictionPolicyChainV2({ completeDiscovery: true, expectedScope: scope, receipts: [firstReceipt, secondReceipt, receipt(9003, fork.body, "2026-08-14T12:02:00Z")], registry }).ok, false);
  const gapPolicy = standardUnitedStatesStandingPolicyV2({ action: "SUPERSEDE", owner, predecessor: { commentId: 9002, standingPolicyHash: supersession.standingPolicyHash }, reason: "GAP", scope, sequence: 3 });
  const gap = renderOwnerJurisdictionPolicyChainDecisionV2({ standingPolicy: gapPolicy });
  assert.equal(resolveOwnerJurisdictionPolicyChainV2({ completeDiscovery: true, expectedScope: scope, receipts: [firstReceipt, secondReceipt, receipt(9004, gap.body, "2026-08-14T12:03:00Z")], registry }).ok, false);
  const otherScope = { ...scope, product: "other-product" };
  const otherGenesis = renderOwnerJurisdictionDecisionV2({ ...baseInput, scope: otherScope });
  assert.equal(resolveOwnerJurisdictionPolicyChainV2({ completeDiscovery: true, expectedScope: scope, receipts: [firstReceipt, secondReceipt, receipt(9010, otherGenesis.body, "2026-08-14T12:02:00Z")], registry }).ok, true);
  const crossPolicy = standardUnitedStatesStandingPolicyV2({ action: "SUPERSEDE", owner, predecessor: { commentId: 9002, standingPolicyHash: supersession.standingPolicyHash }, reason: "CROSS", scope: otherScope, sequence: 2 });
  const cross = renderOwnerJurisdictionPolicyChainDecisionV2({ standingPolicy: crossPolicy });
  assert.equal(resolveOwnerJurisdictionPolicyChainV2({ completeDiscovery: true, expectedScope: scope, receipts: [firstReceipt, secondReceipt, receipt(9005, cross.body, "2026-08-14T12:03:00Z")], registry }).ok, false);
  const revokedPolicy = standardUnitedStatesStandingPolicyV2({ action: "REVOKE", owner, predecessor: { commentId: 9002, standingPolicyHash: supersession.standingPolicyHash }, reason: "OWNER_REVOKES", scope, sequence: 2 });
  const revoked = renderOwnerJurisdictionPolicyChainDecisionV2({ standingPolicy: revokedPolicy });
  const revokedResult = resolveOwnerJurisdictionPolicyChainV2({ completeDiscovery: true, expectedScope: scope, receipts: [firstReceipt, secondReceipt, receipt(9006, revoked.body, "2026-08-14T12:03:00Z")], registry });
  assert.equal(revokedResult.ok, true, revokedResult.findings.join(","));
  assert.equal(revokedResult.suppliesAuthority, false);
  assert.equal(resolveOwnerJurisdictionPolicyChainV2({ expectedScope: scope, receipts: [firstReceipt], registry }).ok, false);
  assert.equal(resolveOwnerJurisdictionPolicyChainV2({ completeDiscovery: true, expectedScope: scope, receipts: [{ ...firstReceipt, createdAt: "not-a-timestamp", updatedAt: "not-a-timestamp" }], registry }).ok, false);
});

test("a genuine market or rollout change is representable only as a hash-bound superseding Owner receipt", () => {
  const initial = renderOwnerJurisdictionDecisionV2(baseInput);
  const genesisPolicy = standardUnitedStatesStandingPolicyV2({ owner, scope });
  const changedValues = { ...genesisPolicy.policy, initialRollout: "CONTROLLED_5_PERCENT_UNITED_STATES", nonUnitedStatesAvailability: "AUTHORIZED_ONLY_AS_EXPLICITLY_NAMED_IN_PRIMARY_MARKET", primaryMarket: "UNITED_STATES_AND_CANADA" };
  assert.throws(() => renderOwnerJurisdictionPolicyChainDecisionV2({ standingPolicy: standardUnitedStatesStandingPolicyV2({ action: "SUPERSEDE", owner, policy: { ...changedValues, nonUnitedStatesAvailability: "NOT_AUTHORIZED" }, predecessor: { commentId: 9001, standingPolicyHash: initial.standingPolicyHash }, reason: "CONTRADICTORY", scope, sequence: 1 }) }), /POLICY_CHAIN_DECISION_INVALID/u);
  assert.throws(() => renderOwnerJurisdictionPolicyChainDecisionV2({ standingPolicy: standardUnitedStatesStandingPolicyV2({ action: "SUPERSEDE", owner, policy: { ...changedValues, authoritativeRestrictions: "FAIL_OPEN_CLIENT_OVERRIDE" }, predecessor: { commentId: 9001, standingPolicyHash: initial.standingPolicyHash }, reason: "UNSAFE", scope, sequence: 1 }) }), /POLICY_CHAIN_DECISION_INVALID/u);
  assert.throws(() => renderOwnerJurisdictionDecisionV2({ ...baseInput, standingPolicy: standardUnitedStatesStandingPolicyV2({ owner, policy: changedValues, scope }) }), /STANDING_POLICY_INVALID/u);
  const successorPolicy = standardUnitedStatesStandingPolicyV2({ action: "SUPERSEDE", owner, policy: changedValues, predecessor: { commentId: 9001, standingPolicyHash: initial.standingPolicyHash }, reason: "OWNER_AUTHORIZES_MARKET_AND_ROLLOUT_CHANGE", scope, sequence: 1 });
  const successor = renderOwnerJurisdictionPolicyChainDecisionV2({ standingPolicy: successorPolicy });
  const resolved = resolveOwnerJurisdictionPolicyChainV2({ completeDiscovery: true, expectedScope: scope, receipts: [receipt(9001, initial.body, "2026-08-14T12:00:00Z"), receipt(9002, successor.body, "2026-08-14T12:01:00Z")], registry });
  assert.equal(resolved.ok, true, resolved.findings.join(","));
  assert.equal(resolved.standingPolicy.policy.primaryMarket, "UNITED_STATES_AND_CANADA");
  assert.equal(resolved.standingPolicy.policy.initialRollout, "CONTROLLED_5_PERCENT_UNITED_STATES");
  assert.equal(resolved.pendingBindingsRequireReevaluation, true);
  assert.equal(evaluateStandingPolicyInheritanceV2({ domainIds: [EXTRA_DOMAIN], policyResolution: resolved, registry, scope }).inheritable, true);
  const changedIdentity = { ...taskIdentity, implementationBranch: "codex/changed-policy", implementationPr: 301, leaseId: "changed-policy", ownerApprovalCommentId: 6000000001, planningHead: sha40("5"), planningTree: sha40("6"), taskArtifactPath: "docs/assurance/tasks/changed-policy.json", taskId: "changed-policy" };
  const changedBinding = deriveTaskJurisdictionBindingV2({ domainIds: [EXTRA_DOMAIN], policyReceipt: resolved, registry, scope, taskEvidence, taskIdentity: changedIdentity });
  assert.equal(verifyTaskJurisdictionBindingV2({ activePolicy: resolved, binding: changedBinding, registry }).ok, true);
  const taskAuthority = verifyTaskJurisdictionAuthorityV2({ binding: changedBinding, policyRaws: [githubReceipt(9001, 229, initial.body, "2026-08-14T12:00:00Z"), githubReceipt(9002, 229, successor.body, "2026-08-14T12:01:00Z")], paginationComplete: true, repository: scope.repository, registry, expectedScope: scope, expectedTaskIdentity: changedIdentity, expectedTaskEvidence: taskEvidence, expectedDomainIds: [EXTRA_DOMAIN] });
  assert.equal(taskAuthority.ok, true, taskAuthority.findings.join(","));
  assert.throws(() => { taskAuthority.taskBinding.scope.product = "forged"; }, TypeError);
  assert.equal(Object.hasOwn(finiteTaskFinalSourceOwnerJurisdictionV2(taskAuthority), "commentBodyHash"), false);
  assert.equal(taskAuthority.sourceDecisionType, "OWNER_JURISDICTION_POLICY_CHAIN_DECISION_V2");
  assert.equal(taskAuthority.subjectHash, resolved.subjectHash);
  assert.equal(taskAuthority.envelopeHash, resolved.envelopeHash);
  assert.deepEqual(Object.keys(ownerJurisdictionPolicyBindingTruthV2(taskAuthority).policySource).sort(), ["commentId", "referenceScope", "sequence", "standingPolicyHash", "standingPolicyType", "standingPolicyVersion", "status"]);

  const compositeSuccessor = renderOwnerJurisdictionDecisionV2({
    domainApplications: [{ decision: "Owner applies the superseding market policy to this exact task.", domainId: EXTRA_DOMAIN, jurisdictionDecisionOwner: owner.login, market: "UNITED_STATES_AND_CANADA", minimumCreatorAge: null }],
    domainIds: [EXTRA_DOMAIN],
    owner,
    registry,
    scope,
    standingPolicy: successorPolicy,
    taskEvidence,
    taskIdentity: changedIdentity,
  });
  const compositeResolution = resolveOwnerJurisdictionPolicyChainV2({ completeDiscovery: true, expectedScope: scope, receipts: [receipt(9001, initial.body, "2026-08-14T12:00:00Z"), receipt(9003, compositeSuccessor.body, "2026-08-14T12:02:00Z")], registry });
  assert.equal(compositeResolution.ok, true, compositeResolution.findings.join(","));
  assert.equal(compositeResolution.sequence, 1);
  assert.equal(verifyOwnerJurisdictionDecisionV2({ body: compositeSuccessor.body, registry, receipt: receipt(9003, compositeSuccessor.body, "2026-08-14T12:02:00Z") }).coverage.result, "1/1");
  const compositeRaw = githubReceipt(9003, changedIdentity.implementationPr, compositeSuccessor.body, "2026-08-14T12:02:00Z");
  const compositeAuthority = verifyOwnerJurisdictionAuthorityV2({ raw: compositeRaw, policyRaws: [githubReceipt(9001, taskIdentity.implementationPr, initial.body, "2026-08-14T12:00:00Z"), compositeRaw], paginationComplete: true, repository: scope.repository, pr: changedIdentity.implementationPr, registry, expected: { ...scope, domainIds: [EXTRA_DOMAIN], ownerLogin: owner.login, task: changedIdentity.taskId } });
  assert.equal(compositeAuthority.ok, true, compositeAuthority.findings.join(","));
  assert.equal(compositeAuthority.sourceDecisionType, "OWNER_JURISDICTION_DECISION_V2");
  assert.equal(ownerJurisdictionPolicyBindingTruthV2(compositeAuthority).policySource.decisionVersion, "OWNER_JURISDICTION_DECISION_V2");
});

function admissionFixture() {
  const ownerRendered = renderOwnerJurisdictionDecisionV2(baseInput);
  const ownerVerification = verifyOwnerJurisdictionDecisionV2({ body: ownerRendered.body, registry, receipt: receipt(9001, ownerRendered.body, "2026-08-14T12:00:00Z") });
  // Live comment 5290645158 has this V1 identity shape: the task is intentionally
  // absent and is derived without rewriting the receipt from taskArtifactPath.
  const v1Subject = legacyAdmissionSubject();
  const v1Body = legacyBody(LEGACY_FINITE_TASK_ADMISSION_V1_MARKER, { authorizationId: "finite_task_admission_to_clearance_v1", evidenceClass: "OWNER_INTENT", pr: 233, repository: scope.repository, schemaVersion: 1, subject: v1Subject, type: "FINITE_TASK_ADMISSION_TO_CLEARANCE_V1" });
  const v1 = verifyLegacyFiniteTaskAdmissionV1({ body: v1Body });
  const admissionIdentity = { branch: "codex/admission", head: sha40("7"), pr: 233, taskId: taskIdentity.taskId, tree: sha40("8") };
  const predecessor = { bodyHash: v1.bodyHash, commentId: 5290645158, sequence: 0, subjectHash: v1.subjectHash, version: 1 };
  const ownerJurisdictionBinding = { domainIds: DOMAINS, ownerDecisionCommentBodyHash: ownerVerification.commentBodyHash, ownerDecisionCommentId: 9001, standingPolicyHash: ownerVerification.standingPolicyHash, standingPolicySequence: 0, standingPolicyStatus: ACTIVE_POLICY_STATUS, standingPolicyType: "OWNER_JURISDICTION_STANDING_POLICY_V2", standingPolicyVersion: 2, taskBinding: ownerVerification.taskBinding, taskBindingHash: ownerVerification.taskBindingHash };
  const v2 = renderFiniteTaskAdmissionV2({ admissionIdentity, changedPaths: ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"].sort(), owner, ownerJurisdictionBinding, predecessor, scope, scopeBudget: { maximumChangedLines: 3600, maximumFiles: 3 }, taskEvidence, taskScope });
  return { admissionIdentity, ownerJurisdictionBinding, ownerRendered, predecessor, v1, v1Body, v1Subject, v2 };
}
const admissionExpected = (fixture, overrides = {}) => ({
  changedPaths: ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"],
  head: fixture.admissionIdentity.head,
  launchProgram: scope.launchProgram,
  legacyV1Subject: fixture.v1Subject,
  ownerJurisdictionBinding: fixture.ownerJurisdictionBinding,
  ownerLogin: owner.login,
  pr: 233,
  product: scope.product,
  repository: scope.repository,
  scopeBudget: { maximumChangedLines: 3600, maximumFiles: 3 },
  task: taskIdentity.taskId,
  taskEvidence,
  taskScope,
  tree: fixture.admissionIdentity.tree,
  ...overrides,
});

test("immutable V1 admission is sequence-0 history and one V2 successor is the exact current tip", () => {
  const fixture = admissionFixture();
  assert.equal(fixture.v1.ok, true);
  assert.equal(fixture.v1.task, "pre-release-identity-entitlement-authority-v1");
  const v2Verified = verifyFiniteTaskAdmissionV2({ body: fixture.v2.body, expected: { head: fixture.admissionIdentity.head, launchProgram: scope.launchProgram, pr: 233, product: scope.product, repository: scope.repository, task: taskIdentity.taskId, tree: fixture.admissionIdentity.tree }, receipt: receipt(5291000000, fixture.v2.body, "2026-08-14T13:01:00Z") });
  assert.equal(v2Verified.ok, true, v2Verified.findings.join(","));
  assert.equal(v2Verified.subject.sequence, 1);
  assert.deepEqual(v2Verified.subject.predecessor, fixture.predecessor);
  assert.deepEqual(v2Verified.subject.ownerJurisdictionBinding.domainIds, DOMAINS);
  assert.deepEqual(v2Verified.subject.taskEvidence, taskEvidence);
  assert.deepEqual(v2Verified.subject.taskScope, taskScope);
  assert.equal(v2Verified.subject.productMutationAllowedBeforeAdmissionMerge, false);
  assert.deepEqual(Object.values(v2Verified.subject.prohibitedAuthority), [false, false, false, false, false, false]);
  const chain = resolveFiniteTaskAdmissionChainV2({ completeDiscovery: true, expected: admissionExpected(fixture), receipts: [receipt(5291000000, fixture.v2.body, "2026-08-14T13:01:00Z"), receipt(5290645158, fixture.v1Body, "2026-08-14T13:00:00Z")] });
  assert.equal(chain.ok, true, chain.findings.join(","));
  assert.equal(chain.currentCommentId, 5291000000);
  assert.equal(chain.currentSequence, 1);
  assert.deepEqual(chain.historical, [{ commentId: 5290645158, disposition: "HISTORICAL_ADMISSION_INTENT_PRE_JURISDICTION_BINDING", sequence: 0, version: 1 }]);
  assert.equal(finiteTaskAdmissionHistoryValidV2(chain, { id: 5290645158 }), true);
  assert.equal(finiteTaskAdmissionHistoryValidV2(chain, { id: 5290645159 }), false);
});

test("native V2 admission genesis works without historical V1 while minimalist V1 is rejected", () => {
  const fixture = admissionFixture();
  const genesis = renderFiniteTaskAdmissionV2({ admissionIdentity: fixture.admissionIdentity, changedPaths: ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"], owner, ownerJurisdictionBinding: fixture.ownerJurisdictionBinding, scope, scopeBudget: { maximumChangedLines: 3600, maximumFiles: 3 }, taskEvidence, taskScope });
  assert.equal(genesis.payload.subject.sequence, 0);
  assert.equal(genesis.payload.subject.predecessor, null);
  const chain = resolveFiniteTaskAdmissionChainV2({ completeDiscovery: true, expected: { ...admissionExpected(fixture), legacyV1Subject: undefined }, receipts: [receipt(5292000000, genesis.body, "2026-08-14T14:00:00Z")] });
  assert.equal(chain.ok, true, chain.findings.join(","));
  assert.equal(finiteTaskAdmissionHistoryValidV2(chain), true);
  const genesisVerified = verifyFiniteTaskAdmissionV2({ body: genesis.body }); const successor = renderFiniteTaskAdmissionV2({ admissionIdentity: fixture.admissionIdentity, changedPaths: ["CURRENT_STATE.md"], owner, ownerJurisdictionBinding: fixture.ownerJurisdictionBinding, predecessor: { bodyHash: genesisVerified.bodyHash, commentId: 5292000000, sequence: 0, subjectHash: genesisVerified.subjectHash, version: 2 }, scope, scopeBudget: { maximumChangedLines: 10, maximumFiles: 1 }, taskEvidence, taskScope });
  const successorChain = resolveFiniteTaskAdmissionChainV2({ completeDiscovery: true, expected: { ownerLogin: owner.login, pr: 233, repository: scope.repository, task: taskIdentity.taskId }, receipts: [receipt(5292000000, genesis.body, "2026-08-14T14:00:00Z"), receipt(5292000001, successor.body, "2026-08-14T14:01:00Z")] }); assert.equal(successorChain.ok, true, successorChain.findings.join(",")); assert.equal(finiteTaskAdmissionHistoryValidV2(successorChain), true);
  const boundedScope = { ...taskScope, scopeBudget: { maximumChangedLines: 800, maximumFiles: 12 }, amendmentMaximum: { maximumAmendments: 1, maximumChangedLines: 900, maximumFiles: 15 } };
  assert.equal(verifyFiniteTaskAdmissionV2({ body: renderFiniteTaskAdmissionV2({ admissionIdentity: fixture.admissionIdentity, changedPaths: ["CURRENT_STATE.md"], owner, ownerJurisdictionBinding: fixture.ownerJurisdictionBinding, scope, scopeBudget: { maximumChangedLines: 10, maximumFiles: 1 }, taskEvidence, taskScope: boundedScope }).body }).ok, true);
  const baseOnlyScope = { ...boundedScope, amendmentMaximum: { maximumAmendments: 0, maximumChangedLines: 800, maximumFiles: 12 } };
  assert.equal(verifyFiniteTaskAdmissionV2({ body: renderFiniteTaskAdmissionV2({ admissionIdentity: fixture.admissionIdentity, changedPaths: ["CURRENT_STATE.md"], owner, ownerJurisdictionBinding: fixture.ownerJurisdictionBinding, scope, scopeBudget: { maximumChangedLines: 10, maximumFiles: 1 }, taskEvidence, taskScope: baseOnlyScope }).body }).ok, true);
  for (const amendmentMaximum of [
    { maximumAmendments: 0, maximumChangedLines: 801, maximumFiles: 12 },
    { maximumAmendments: 0, maximumChangedLines: 800, maximumFiles: 13 },
    { maximumAmendments: 2, maximumChangedLines: 900, maximumFiles: 15 },
  ]) assert.throws(() => renderFiniteTaskAdmissionV2({ admissionIdentity: fixture.admissionIdentity, changedPaths: ["CURRENT_STATE.md"], owner, ownerJurisdictionBinding: fixture.ownerJurisdictionBinding, scope, scopeBudget: { maximumChangedLines: 10, maximumFiles: 1 }, taskEvidence, taskScope: { ...boundedScope, amendmentMaximum } }), /SUBJECT_INVALID/u);
  assert.throws(() => renderFiniteTaskAdmissionV2({ admissionIdentity: fixture.admissionIdentity, changedPaths: ["CURRENT_STATE.md"], owner, ownerJurisdictionBinding: fixture.ownerJurisdictionBinding, scope, scopeBudget: { maximumChangedLines: 10, maximumFiles: 1 }, taskEvidence, taskScope: { ...boundedScope, amendmentMaximum: { maximumAmendments: 1, maximumChangedLines: 700, maximumFiles: 11 } } }), /SUBJECT_INVALID/u);
  const minimalSubject = { admissionHead: sha40("1"), admissionPr: 233, admissionTree: sha40("2"), repository: scope.repository, taskArtifactPath: taskIdentity.taskArtifactPath, type: "FINITE_TASK_ADMISSION_TO_CLEARANCE_V1" };
  const minimal = legacyBody(LEGACY_FINITE_TASK_ADMISSION_V1_MARKER, { authorizationId: "finite_task_admission_to_clearance_v1", evidenceClass: "OWNER_INTENT", pr: 233, repository: scope.repository, schemaVersion: 1, subject: minimalSubject, type: "FINITE_TASK_ADMISSION_TO_CLEARANCE_V1" });
  assert.equal(verifyLegacyFiniteTaskAdmissionV1({ body: minimal }).ok, false);
  assert.equal(resolveFiniteTaskAdmissionChainV2({ expected: admissionExpected(fixture), receipts: [receipt(5290645158, fixture.v1Body, "2026-08-14T13:00:00Z")] }).ok, false);
});

test("production admission binding resolver bridges V1 and selects the hash-chain V2 tip", (t) => {
  const synchronized = canonicalAdmissionSynchronizationFixture(t);
  const head = synchronized.anchorHead; const tree = synchronized.anchorTree; const parent = synchronized.record.mainSha; const files = ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"];
  const receiptIdentity = { repository: scope.repository, pr: 233, branch: "admission", baseRef: "main", baseSha: parent, headSha: head }; const identity = { ...synchronized.identity, pr: 233 }; const taskId = "admission-bridge-fixture"; const artifactPath = `docs/assurance/tasks/${taskId}.json`;
  const edge = { closureHash: sha64("1"), evidenceHash: sha64("2"), modelDeltaEdges: [] }; const taskArtifact = { taskId, primaryDomain: DOMAINS[0], closure: { packetHash: sha64("3"), affectedDomainClosure: { domains: [DOMAINS[0]] }, sections: { C_AFFECTED_DOMAIN_CLOSURE: { taskLocalGoverningEdgeClosure: edge } } }, certificate: { certificateHash: sha64("4") }, taskLocalGoverningEdgeClosure: edge, implementationPlan: { allowedPaths: [artifactPath], tests: ["tests/bridge.test.mjs"], scope: { amendmentMaximumFiles: 2, amendmentMaximumHandAuthoredNetLines: 20, maximumAmendments: 1, maximumFiles: 1, maximumHandAuthoredNetLines: 10, packageChanges: false } } }; const taskArtifactHash = sha64("5");
  const implementation = { pr: 229, branch: "codex/bridge", seedHead: head, seedTree: tree, planningHead: head, planningTree: tree, ownerCommentId: 5285464582, taskArtifactPath: artifactPath }; const bridgeIdentity = { taskId, implementationPr: 229, implementationBranch: implementation.branch, leaseId: taskId, originalSeedHead: head, originalSeedTree: tree, planningHead: head, planningTree: tree, ownerApprovalCommentId: implementation.ownerCommentId, taskArtifactPath: artifactPath }; const evidence = finiteTaskJurisdictionEvidenceV2(taskArtifact, taskArtifactHash);
  const ownerRendered = renderOwnerJurisdictionDecisionV2({ domainApplications: [{ decision: "Exact bridge task market application.", domainId: DOMAINS[0], jurisdictionDecisionOwner: owner.login, market: "UNITED_STATES_ONLY", minimumCreatorAge: null }], domainIds: [DOMAINS[0]], owner, registry, scope, taskEvidence: evidence, taskIdentity: bridgeIdentity }); const ownerVerified = verifyOwnerJurisdictionDecisionV2({ body: ownerRendered.body, registry, receipt: receipt(9100, ownerRendered.body, "2026-08-14T12:00:00Z") });
  const v1Subject = finiteTaskAdmissionSubject({ identity: receiptIdentity, tree, scope: { files }, implementation, taskArtifact, taskArtifactHash }); const v1Body = legacyBody(LEGACY_FINITE_TASK_ADMISSION_V1_MARKER, { authorizationId: "finite_task_admission_to_clearance_v1", evidenceClass: "OWNER_INTENT", pr: 233, repository: scope.repository, schemaVersion: 1, subject: v1Subject, type: "FINITE_TASK_ADMISSION_TO_CLEARANCE_V1" }); const v1 = verifyLegacyFiniteTaskAdmissionV1({ body: v1Body });
  const ownerJurisdictionBinding = { domainIds: [DOMAINS[0]], ownerDecisionCommentBodyHash: ownerVerified.commentBodyHash, ownerDecisionCommentId: 9100, standingPolicyHash: ownerVerified.standingPolicyHash, standingPolicySequence: 0, standingPolicyStatus: ACTIVE_POLICY_STATUS, standingPolicyType: "OWNER_JURISDICTION_STANDING_POLICY_V2", standingPolicyVersion: 2, taskBinding: ownerVerified.taskBinding, taskBindingHash: ownerVerified.taskBindingHash }; const admissionIdentity = { branch: receiptIdentity.branch, head, pr: 233, taskId, tree }; const common = { admissionIdentity, changedPaths: files, owner, ownerJurisdictionBinding, scope, scopeBudget: { maximumChangedLines: 3600, maximumFiles: 3 }, taskEvidence: evidence, taskScope: finiteTaskScopeV2(taskArtifact) };
  const first = renderFiniteTaskAdmissionV2({ ...common, predecessor: { bodyHash: v1.bodyHash, commentId: 9200, sequence: 0, subjectHash: v1.subjectHash, version: 1 } }); const firstVerified = verifyFiniteTaskAdmissionV2({ body: first.body }); const tip = renderFiniteTaskAdmissionV2({ ...common, predecessor: { bodyHash: firstVerified.bodyHash, commentId: 9201, sequence: 1, subjectHash: firstVerified.subjectHash, version: 2 } });
  const resolved = resolveFiniteTaskAdmissionTaskBindingV2({ admissionRaws: [githubReceipt(9200, 233, v1Body, "2026-08-14T13:00:00Z"), githubReceipt(9201, 233, first.body, "2026-08-14T13:01:00Z"), githubReceipt(9202, 233, tip.body, "2026-08-14T13:02:00Z")], paginationComplete: true, identity, tree: synchronized.tree, implementation, taskArtifact, taskArtifactHash, expectedScope: scope, expectedDomainIds: [DOMAINS[0]], currentTruth: synchronized.currentTruth, root: synchronized.root });
  assert.equal(resolved.ok, true, resolved.findings.join(",")); assert.equal(resolved.chain.currentCommentId, 9202); assert.equal(resolved.taskBinding.bindingHash, ownerVerified.taskBindingHash);
});

test("admission chain rejects zero-current, fork/two-current, broken predecessor, cycle-shaped reference, wrong head, replay, and edits", () => {
  const fixture = admissionFixture();
  const v1Receipt = receipt(5290645158, fixture.v1Body, "2026-08-14T13:00:00Z");
  const v2Receipt = receipt(5291000000, fixture.v2.body, "2026-08-14T13:01:00Z");
  const expected = admissionExpected(fixture);
  assert.equal(resolveFiniteTaskAdmissionChainV2({ completeDiscovery: true, expected, receipts: [v1Receipt] }).ok, false);
  const fork = renderFiniteTaskAdmissionV2({ admissionIdentity: { ...fixture.admissionIdentity, head: sha40("9"), tree: sha40("0") }, changedPaths: ["CURRENT_STATE.md"], owner, ownerJurisdictionBinding: fixture.ownerJurisdictionBinding, predecessor: fixture.predecessor, scope, scopeBudget: { maximumChangedLines: 10, maximumFiles: 1 }, taskEvidence, taskScope });
  assert.equal(resolveFiniteTaskAdmissionChainV2({ completeDiscovery: true, expected, receipts: [v1Receipt, v2Receipt, receipt(5291000001, fork.body, "2026-08-14T13:02:00Z")] }).ok, false);
  const broken = renderFiniteTaskAdmissionV2({ admissionIdentity: fixture.admissionIdentity, changedPaths: ["CURRENT_STATE.md"], owner, ownerJurisdictionBinding: fixture.ownerJurisdictionBinding, predecessor: { ...fixture.predecessor, commentId: 123 }, scope, scopeBudget: { maximumChangedLines: 10, maximumFiles: 1 }, taskEvidence, taskScope });
  assert.equal(resolveFiniteTaskAdmissionChainV2({ completeDiscovery: true, expected, receipts: [v1Receipt, receipt(5291000002, broken.body, "2026-08-14T13:02:00Z")] }).ok, false);
  const cycleShaped = renderFiniteTaskAdmissionV2({ admissionIdentity: fixture.admissionIdentity, changedPaths: ["CURRENT_STATE.md"], owner, ownerJurisdictionBinding: fixture.ownerJurisdictionBinding, predecessor: { ...fixture.predecessor, commentId: 5291000003 }, scope, scopeBudget: { maximumChangedLines: 10, maximumFiles: 1 }, taskEvidence, taskScope });
  assert.equal(resolveFiniteTaskAdmissionChainV2({ completeDiscovery: true, expected, receipts: [v1Receipt, receipt(5291000003, cycleShaped.body, "2026-08-14T13:02:00Z")] }).ok, false);
  assert.equal(resolveFiniteTaskAdmissionChainV2({ completeDiscovery: true, expected: { ...expected, head: sha40("f") }, receipts: [v1Receipt, v2Receipt] }).ok, false);
  assert.equal(resolveFiniteTaskAdmissionChainV2({ completeDiscovery: true, expected: { ...expected, repository: "Elsewhere/repo" }, receipts: [v1Receipt, v2Receipt] }).ok, false);
  assert.equal(resolveFiniteTaskAdmissionChainV2({ completeDiscovery: true, expected, receipts: [v1Receipt, { ...v2Receipt, updatedAt: "2026-08-14T13:01:01Z" }] }).ok, false);

  const nativeGenesis = renderFiniteTaskAdmissionV2({ admissionIdentity: fixture.admissionIdentity, changedPaths: ["CURRENT_STATE.md"], owner, ownerJurisdictionBinding: fixture.ownerJurisdictionBinding, scope, scopeBudget: { maximumChangedLines: 10, maximumFiles: 1 }, taskEvidence, taskScope });
  const nativeVerified = verifyFiniteTaskAdmissionV2({ body: nativeGenesis.body });
  const changedScope = { ...scope, product: "different-product" };
  const changedBinding = structuredClone(fixture.ownerJurisdictionBinding.taskBinding);
  changedBinding.scope = changedScope;
  const changedBindingBase = structuredClone(changedBinding);
  delete changedBindingBase.bindingHash;
  changedBinding.bindingHash = typeSeparatedHash(jurisdictionHashDomains.taskBinding, changedBindingBase);
  const changedOuterBinding = { ...fixture.ownerJurisdictionBinding, taskBinding: changedBinding, taskBindingHash: changedBinding.bindingHash };
  const crossScope = renderFiniteTaskAdmissionV2({ admissionIdentity: fixture.admissionIdentity, changedPaths: ["CURRENT_STATE.md"], owner, ownerJurisdictionBinding: changedOuterBinding, predecessor: { bodyHash: nativeVerified.bodyHash, commentId: 5292000000, sequence: 0, subjectHash: nativeVerified.subjectHash, version: 2 }, scope: changedScope, scopeBudget: { maximumChangedLines: 10, maximumFiles: 1 }, taskEvidence, taskScope });
  const crossScopeResult = resolveFiniteTaskAdmissionChainV2({ completeDiscovery: true, expected: { ownerLogin: owner.login, pr: 233, repository: scope.repository, task: taskIdentity.taskId }, receipts: [receipt(5292000000, nativeGenesis.body, "2026-08-14T14:00:00Z"), receipt(5292000001, crossScope.body, "2026-08-14T14:01:00Z")] });
  assert.equal(crossScopeResult.ok, false);
  assert.equal(crossScopeResult.findings.includes("ADMISSION_CHAIN_CROSS_SCOPE_REPLAY_INVALID"), true);
});

test("admission unknown fields, hash substitution and wrong exact head/tree fail", () => {
  const { admissionIdentity, ownerJurisdictionBinding, predecessor, v2 } = admissionFixture();
  assert.equal(verifyFiniteTaskAdmissionV2({ body: v2.body, expected: { head: admissionIdentity.head, tree: admissionIdentity.tree } }).ok, true);
  const payload = payloadFrom(v2.body, FINITE_TASK_ADMISSION_V2_MARKER);
  assert.equal(verifyFiniteTaskAdmissionV2({ body: withPayload(FINITE_TASK_ADMISSION_V2_MARKER, { ...payload, extra: true }) }).ok, false);
  assert.equal(verifyFiniteTaskAdmissionV2({ body: withPayload(FINITE_TASK_ADMISSION_V2_MARKER, { ...payload, subjectHash: payload.subject.ownerJurisdictionBinding.taskBindingHash }) }).ok, false);
  assert.equal(verifyFiniteTaskAdmissionV2({ body: v2.body, expected: { head: sha40("e") } }).ok, false);
  assert.equal(verifyFiniteTaskAdmissionV2({ body: v2.body, expected: { tree: sha40("e") } }).ok, false);
  assert.throws(() => renderFiniteTaskAdmissionV2({ admissionIdentity, changedPaths: ["CURRENT_STATE.md"], owner, ownerJurisdictionBinding: { ...ownerJurisdictionBinding, taskBinding: { bindingHash: ownerJurisdictionBinding.taskBindingHash, domainIds: DOMAINS } }, predecessor, scope, scopeBudget: { maximumChangedLines: 10, maximumFiles: 1 }, taskEvidence, taskScope }), /FINITE_TASK_ADMISSION_SUBJECT_INVALID/u);
});

test("final-source V2 binds exact review, Phase 1, admission, policy, clearance, and immutable receipt", () => {
  const fixture = admissionFixture();
  const v2 = verifyFiniteTaskAdmissionV2({ body: fixture.v2.body });
  const ownerJurisdiction = { commentBodyHash: fixture.ownerJurisdictionBinding.ownerDecisionCommentBodyHash, commentId: fixture.ownerJurisdictionBinding.ownerDecisionCommentId, domainIds: DOMAINS, referenceScope: "TASK_BOUND_COMPOSITE", standingPolicyHash: fixture.ownerJurisdictionBinding.standingPolicyHash, standingPolicySequence: 0, standingPolicyStatus: ACTIVE_POLICY_STATUS, standingPolicyType: "OWNER_JURISDICTION_STANDING_POLICY_V2", standingPolicyVersion: 2, taskBindingHash: fixture.ownerJurisdictionBinding.taskBindingHash };
  const currentAdmission = { bodyHash: v2.bodyHash, commentId: 5291000000, sequence: v2.subject.sequence, subjectHash: v2.subjectHash };
  const repositoryReview = { bodyHash: sha64("7"), commentId: 5293000000, disposition: { P0: 0, P1: 0, launchImpactingP2: 0 }, subjectHash: sha64("8") };
  const phase1 = { head: fixture.admissionIdentity.head, passedJobs: 13, requiredJobs: 13, result: "PASS", runId: 31790000000, tree: fixture.admissionIdentity.tree };
  const prospective = { classification: "PREIMPLEMENTATION_ENGINEERING_CLEAR", externalProofInherited: false, marketJurisdictionOwnerCoverage: { covered: 9, required: 9, result: "9/9" }, productMutationAllowedAfterAdmissionMerge: true, productMutationAllowedBeforeAdmissionMerge: false, taskLocalGoverningEdgeClosure: "CLEAR" };
  const rendered = renderFiniteTaskAdmissionFinalSourceV2({ admissionIdentity: fixture.admissionIdentity, currentAdmission, diffHash: sha64("9"), owner, ownerJurisdiction, phase1, prospective, repositoryReview, scope });
  const exact = { head: fixture.admissionIdentity.head, launchProgram: scope.launchProgram, ownerLogin: owner.login, pr: 233, product: scope.product, repository: scope.repository, task: taskIdentity.taskId, tree: fixture.admissionIdentity.tree };
  assert.equal(verifyFiniteTaskAdmissionFinalSourceV2({ body: rendered.body, expected: exact, receipt: receipt(5294000000, rendered.body, "2026-08-14T15:00:00Z") }).ok, true);
  assert.equal(rendered.body.startsWith(`${FINITE_TASK_ADMISSION_FINAL_SOURCE_V2_MARKER}\n`), true);
  assert.equal(verifyFiniteTaskAdmissionFinalSourceV2({ body: rendered.body, receipt: { ...receipt(5294000000, rendered.body, "invalid"), updatedAt: "invalid" } }).ok, false);
  const payload = payloadFrom(rendered.body, FINITE_TASK_ADMISSION_FINAL_SOURCE_V2_MARKER);
  assert.equal(verifyFiniteTaskAdmissionFinalSourceV2({ body: withPayload(FINITE_TASK_ADMISSION_FINAL_SOURCE_V2_MARKER, { ...payload, envelopeHash: payload.subject.taskBindingHash ?? sha64("0") }) }).ok, false);
  const oneDomainOwner = { ...ownerJurisdiction, domainIds: [DOMAINS[0]] };
  const oneDomainProspective = { ...prospective, marketJurisdictionOwnerCoverage: { covered: 1, required: 1, result: "1/1" } };
  assert.equal(verifyFiniteTaskAdmissionFinalSourceV2({ body: renderFiniteTaskAdmissionFinalSourceV2({ admissionIdentity: fixture.admissionIdentity, currentAdmission, diffHash: sha64("9"), owner, ownerJurisdiction: oneDomainOwner, phase1, prospective: oneDomainProspective, repositoryReview, scope }).body }).ok, true);
});

test("aggregate final-source representation, transport, and historical lifecycle remain exact 20/20", async (t) => {
  const fixture = admissionFixture();
  const admission = verifyFiniteTaskAdmissionV2({ body: fixture.v2.body });
  const identity = { repository: scope.repository, pr: fixture.admissionIdentity.pr, branch: fixture.admissionIdentity.branch, headSha: fixture.admissionIdentity.head, baseSha: sha40("9") };
  const tree = fixture.admissionIdentity.tree;
  const ownerJurisdiction = { commentBodyHash: fixture.ownerJurisdictionBinding.ownerDecisionCommentBodyHash, commentId: fixture.ownerJurisdictionBinding.ownerDecisionCommentId, domainIds: DOMAINS, referenceScope: "TASK_BOUND_COMPOSITE", standingPolicyHash: fixture.ownerJurisdictionBinding.standingPolicyHash, standingPolicySequence: 0, standingPolicyStatus: ACTIVE_POLICY_STATUS, standingPolicyType: "OWNER_JURISDICTION_STANDING_POLICY_V2", standingPolicyVersion: 2, taskBindingHash: fixture.ownerJurisdictionBinding.taskBindingHash };
  const currentAdmission = { bodyHash: admission.bodyHash, commentId: 5291000000, sequence: admission.subject.sequence, subjectHash: admission.subjectHash };
  const repositoryReview = { bodyHash: sha64("7"), commentId: 5293000000, disposition: { P0: 0, P1: 0, launchImpactingP2: 0 }, subjectHash: sha64("8") };
  const prospective = { classification: "PREIMPLEMENTATION_ENGINEERING_CLEAR", externalProofInherited: false, marketJurisdictionOwnerCoverage: { covered: DOMAINS.length, required: DOMAINS.length, result: `${DOMAINS.length}/${DOMAINS.length}` }, productMutationAllowedAfterAdmissionMerge: true, productMutationAllowedBeforeAdmissionMerge: false, taskLocalGoverningEdgeClosure: "CLEAR" };
  const render = ({ admissionIdentity = fixture.admissionIdentity, phase1, scopeValue = scope } = {}) => renderFiniteTaskAdmissionFinalSourceV2({ admissionIdentity, currentAdmission, diffHash: sha64("9"), owner, ownerJurisdiction, phase1, prospective, repositoryReview, scope: scopeValue });
  const currentPhase1 = aggregatePhase1Evidence({ pr: identity.pr, branch: identity.branch, head: identity.headSha, tree, base: identity.baseSha });
  const current = render({ phase1: currentPhase1 });
  const currentRaw = githubReceipt(5294100000, identity.pr, current.body, "2026-09-20T12:10:00Z");
  const requiredKey = { repository: identity.repository, pr: identity.pr, branch: identity.branch, head: identity.headSha, tree, base: identity.baseSha, task: taskIdentity.taskId };
  const stableExpected = { repository: identity.repository, product: scope.product, launchProgram: scope.launchProgram, pr: identity.pr, task: taskIdentity.taskId, ownerLogin: owner.login };
  const classify = (item, overrides = {}) => classifyFiniteTaskAdmissionFinalSourceReceiptV2({ item, identity: overrides.identity ?? identity, tree: overrides.tree ?? tree, stableExpected, requiredKey: overrides.requiredKey ?? requiredKey, aggregatePolicy: true });
  const oldBase = sha40("6");
  const oldBasePhase1 = aggregatePhase1Evidence({ pr: identity.pr, branch: identity.branch, head: identity.headSha, tree, base: oldBase, runId: currentPhase1.runId - 1 });
  const oldBaseRendered = render({ phase1: oldBasePhase1 });
  const oldBaseRaw = githubReceipt(5294099999, identity.pr, oldBaseRendered.body, "2026-09-20T11:00:00Z");
  const oldHeadIdentity = { ...fixture.admissionIdentity, head: sha40("5"), tree: sha40("4") };
  const oldHeadRendered = render({ admissionIdentity: oldHeadIdentity, phase1: aggregatePhase1Evidence({ pr: identity.pr, branch: identity.branch, head: oldHeadIdentity.head, tree: oldHeadIdentity.tree, base: identity.baseSha, runId: currentPhase1.runId - 2 }) });
  const oldHeadRaw = githubReceipt(5294099998, identity.pr, oldHeadRendered.body, "2026-09-20T10:00:00Z");
  const malformedRaw = githubReceipt(5294100001, identity.pr, `${FINITE_TASK_ADMISSION_FINAL_SOURCE_V2_MARKER}\n{}`, "2026-09-20T12:20:00Z");
  const cases = [
    ["01 canonical wrapped Phase 1 evidence projects to the exact renderer payload", () => assert.deepEqual(canonicalPhase1FinalSourceWireProjection({ value: currentPhase1, identity: { ...identity, tree } }), currentPhase1)],
    ["02 canonical aggregate payload renders and verifies", () => assert.equal(verifyFiniteTaskAdmissionFinalSourceV2({ body: current.body, receipt: receipt(currentRaw.id, current.body, currentRaw.created_at), expected: { ...stableExpected, head: identity.headSha, tree, baseSha: identity.baseSha } }).ok, true)],
    ["03 omitted canonical maintenance field fails renderer exactness", () => { const omitted = structuredClone(currentPhase1); delete omitted.maintenanceStatus; assert.throws(() => render({ phase1: omitted }), /FINITE_TASK_ADMISSION_FINAL_SOURCE_SUBJECT_INVALID/u); }],
    ["04 exact-current receipt is structurally current", () => assert.equal(classify(currentRaw).disposition, "CURRENT_STRUCTURALLY_VALID_FINITE_TASK_ADMISSION_FINAL_SOURCE")],
    ["05 exact-current key includes protected base", () => assert.deepEqual(classify(currentRaw).key, requiredKey)],
    ["06 valid old-base receipt is historical rather than malformed", () => { const result = classify(oldBaseRaw); assert.equal(result.valid, true); assert.equal(result.disposition, "HISTORICAL_STALE_FINITE_TASK_ADMISSION_FINAL_SOURCE"); }],
    ["07 valid old-head receipt is historical rather than current", () => { const result = classify(oldHeadRaw); assert.equal(result.valid, true); assert.equal(result.disposition, "HISTORICAL_STALE_FINITE_TASK_ADMISSION_FINAL_SOURCE"); }],
    ["08 historical base cannot acquire the current key", () => { const result = classify(oldBaseRaw); assert.notDeepEqual(result.key, requiredKey); assert.equal(result.key.base, oldBase); }],
    ["09 structural verification accepts valid history before current-base selection", () => assert.equal(verifyFiniteTaskAdmissionFinalSourceV2({ body: oldBaseRendered.body, receipt: receipt(oldBaseRaw.id, oldBaseRendered.body, oldBaseRaw.created_at), expected: stableExpected }).ok, true)],
    ["10 exact-current verification still rejects the old base", () => assert.equal(verifyFiniteTaskAdmissionFinalSourceV2({ body: oldBaseRendered.body, receipt: receipt(oldBaseRaw.id, oldBaseRendered.body, oldBaseRaw.created_at), expected: { ...stableExpected, baseSha: identity.baseSha } }).ok, false)],
    ["11 malformed receipt remains malformed invalid", () => assert.equal(classify(malformedRaw).disposition, "MALFORMED_INVALID")],
    ["12 immutable receipt edit remains malformed invalid", () => assert.equal(classify({ ...currentRaw, updated_at: "2026-09-20T12:10:01Z" }).disposition, "MALFORMED_INVALID")],
    ["13 forged body hash remains malformed invalid", () => { const payload = payloadFrom(current.body, FINITE_TASK_ADMISSION_FINAL_SOURCE_V2_MARKER); assert.equal(classify({ ...currentRaw, body: withPayload(FINITE_TASK_ADMISSION_FINAL_SOURCE_V2_MARKER, { ...payload, bodyHash: sha64("0") }) }).disposition, "MALFORMED_INVALID"); }],
    ["14 cross-task evidence remains malformed and cannot transfer authority", () => { const other = render({ admissionIdentity: { ...fixture.admissionIdentity, taskId: "other-task" }, phase1: currentPhase1 }); assert.equal(classify(githubReceipt(5294100002, identity.pr, other.body, "2026-09-20T12:30:00Z")).disposition, "MALFORMED_INVALID"); }],
    ["15 protected-base advancement never rewrites the historical immutable body", () => { const before = oldBaseRaw.body; classify(oldBaseRaw); assert.equal(oldBaseRaw.body, before); assert.equal(oldBaseRaw.created_at, oldBaseRaw.updated_at); }],
    ["16 history plus current remains order-independent at the classification boundary", () => { const forward = [oldBaseRaw, oldHeadRaw, currentRaw].map((item) => classify(item).disposition); const reverse = [currentRaw, oldHeadRaw, oldBaseRaw].map((item) => classify(item).disposition).sort(); assert.deepEqual([...forward].sort(), reverse); }],
    ["17 browser CRLF separator retains the same semantic receipt identity", () => { const lf = verifyFiniteTaskAdmissionFinalSourceV2({ body: current.body }); const crlf = verifyFiniteTaskAdmissionFinalSourceV2({ body: current.body.replace("\n", "\r\n") }); assert.equal(crlf.ok, true); assert.equal(crlf.canonicalBodyHash, lf.canonicalBodyHash); assert.notEqual(crlf.rawBodyHash, lf.rawBodyHash); }],
    ["18 one optional terminal newline retains semantic identity", () => { const exact = verifyFiniteTaskAdmissionFinalSourceV2({ body: current.body }); const terminal = verifyFiniteTaskAdmissionFinalSourceV2({ body: `${current.body}\r\n` }); assert.equal(terminal.ok, true); assert.equal(terminal.canonicalBodyHash, exact.canonicalBodyHash); }],
    ["19 wrong protected base remains rejected", () => assert.equal(verifyFiniteTaskAdmissionFinalSourceV2({ body: current.body, expected: { ...stableExpected, baseSha: sha40("0") } }).ok, false)],
    ["20 transport normalization cannot smuggle a second payload", () => assert.equal(verifyFiniteTaskAdmissionFinalSourceV2({ body: `${current.body}\r\n{}` }).ok, false)],
  ];
  assert.equal(cases.length, 20);
  for (const [name, assertion] of cases) await t.test(name, assertion);
});

test("production final-source eligibility readback binds exact review, Phase 1, admission, and Owner policy", () => {
  const fixture = admissionFixture(); const policyRaw = githubReceipt(9001, 229, fixture.ownerRendered.body, "2026-08-14T12:00:00Z");
  const authority = verifyOwnerJurisdictionAuthorityV2({ raw: policyRaw, policyRaws: [policyRaw], paginationComplete: true, repository: scope.repository, pr: 229, registry, expected: { ...scope, domainIds: DOMAINS, ownerLogin: owner.login, task: taskIdentity.taskId }, expectedTaskIdentity: taskIdentity, expectedTaskEvidence: taskEvidence });
  const legacyPhase1Base = execFileSync("git", ["rev-list", "--max-parents=0", "HEAD"], { encoding: "utf8" }).trim();
  const identity = { repository: scope.repository, pr: 233, branch: fixture.admissionIdentity.branch, baseSha: legacyPhase1Base, headSha: fixture.admissionIdentity.head }; const reviewScope = { files: ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"], diffHash: sha64("9"), additions: 3, deletions: 1, netChangedLines: 2 };
  const reviewSubject = architectureRepositoryReviewSubject({ identity, tree: fixture.admissionIdentity.tree, scope: reviewScope, profile: "FINITE_TASK_ADMISSION_JURISDICTION_V2" }); const reviewRaw = githubReceipt(5293000000, 233, architectureRepositoryReviewCommentBody(reviewSubject), "2026-08-14T14:00:00Z");
  assert.equal(reviewSubject.reviewProfile, "FINITE_TASK_ADMISSION_JURISDICTION_V2"); assert.equal(reviewSubject.lanes.length, 5);
  const remediationReview = architectureRepositoryReviewSubject({ identity: { ...identity, branch: "codex/owner-jurisdiction-canonical-model-v1" }, tree: fixture.admissionIdentity.tree, scope: reviewScope }); assert.equal(remediationReview.lanes.some((lane) => lane.includes("RC-1 through RC-5")), true); assert.equal(remediationReview.lanes.some((lane) => lane.includes("Cognitive Intelligence Contract") && lane.includes("RC-4 integration")), true);
  const admission = verifyFiniteTaskAdmissionV2({ body: fixture.v2.body }); const admissionAuthority = { ok: true, commentId: 5291000000, commentBodyHash: admission.bodyHash, subjectHash: admission.subjectHash, subject: admission.subject, finiteLeaseId: taskIdentity.taskId, futureTaskStatus: "PREIMPLEMENTATION_ENGINEERING_CLEAR", futureProductSourceMutationAllowed: true, checks: { artifact: true } };
  const phase1 = { head: identity.headSha, passedJobs: 13, requiredJobs: 13, result: "PASS", runId: 31790000000, tree: fixture.admissionIdentity.tree };
  const liveLegacyPhase1 = { valid: true, classification: "PHASE1_EXACT_HEAD_EVIDENCE_V1", result: "PASS_13_OF_13", requiredJobs: 13, passedJobs: 13, repository: identity.repository, pr: identity.pr, branch: identity.branch, baseSha: identity.baseSha, sourceHead: identity.headSha, sourceTree: fixture.admissionIdentity.tree, runId: phase1.runId };
  const phase1Resolver = () => structuredClone(liveLegacyPhase1);
  const final = renderFiniteTaskAdmissionFinalSourceV2({ scope, owner, admissionIdentity: fixture.admissionIdentity, diffHash: reviewScope.diffHash, ownerJurisdiction: finiteTaskFinalSourceOwnerJurisdictionV2(authority), currentAdmission: { bodyHash: admission.bodyHash, commentId: admissionAuthority.commentId, sequence: admission.subject.sequence, subjectHash: admission.subjectHash }, repositoryReview: { bodyHash: hashValue(reviewRaw.body), commentId: reviewRaw.id, disposition: reviewSubject.disposition, subjectHash: hashValue(reviewSubject) }, phase1, prospective: { classification: "PREIMPLEMENTATION_ENGINEERING_CLEAR", externalProofInherited: false, marketJurisdictionOwnerCoverage: { covered: 9, required: 9, result: "9/9" }, productMutationAllowedAfterAdmissionMerge: true, productMutationAllowedBeforeAdmissionMerge: false, taskLocalGoverningEdgeClosure: "CLEAR" } });
  const finalRaw = githubReceipt(5294000000, 233, final.body, "2026-08-14T15:00:00Z"); const args = { allComments: [reviewRaw, finalRaw], paginationComplete: true, identity, tree: fixture.admissionIdentity.tree, scope: reviewScope, admissionAuthority, ownerJurisdictionAuthority: authority, phase1EvidenceResolver: phase1Resolver };
  const exactEligibility = verifyFiniteTaskAdmissionFinalSourceEligibilityV2(args);
  assert.equal(exactEligibility.mergeEligible, true, JSON.stringify(exactEligibility)); assert.equal(verifyFiniteTaskAdmissionFinalSourceEligibilityV2({ ...args, allComments: [reviewRaw] }).mergeEligible, false); assert.equal(verifyFiniteTaskAdmissionFinalSourceEligibilityV2({ ...args, phase1EvidenceResolver: () => ({ ...liveLegacyPhase1, valid: false }) }).mergeEligible, false);

  const staleIdentity = { ...identity, headSha: sha40("6") };
  const staleTree = sha40("5");
  const staleReviewSubject = architectureRepositoryReviewSubject({ identity: staleIdentity, tree: staleTree, scope: reviewScope, profile: "FINITE_TASK_ADMISSION_JURISDICTION_V2" });
  const staleReviewRaw = githubReceipt(5292999998, 233, architectureRepositoryReviewCommentBody(staleReviewSubject), "2026-08-14T13:00:00Z");
  const staleFinal = renderFiniteTaskAdmissionFinalSourceV2({ scope, owner, admissionIdentity: { ...fixture.admissionIdentity, head: staleIdentity.headSha, tree: staleTree }, diffHash: reviewScope.diffHash, ownerJurisdiction: finiteTaskFinalSourceOwnerJurisdictionV2(authority), currentAdmission: { bodyHash: admission.bodyHash, commentId: admissionAuthority.commentId, sequence: admission.subject.sequence, subjectHash: admission.subjectHash }, repositoryReview: { bodyHash: hashValue(staleReviewRaw.body), commentId: staleReviewRaw.id, disposition: staleReviewSubject.disposition, subjectHash: hashValue(staleReviewSubject) }, phase1: { ...phase1, head: staleIdentity.headSha, tree: staleTree }, prospective: { classification: "PREIMPLEMENTATION_ENGINEERING_CLEAR", externalProofInherited: false, marketJurisdictionOwnerCoverage: { covered: 9, required: 9, result: "9/9" }, productMutationAllowedAfterAdmissionMerge: true, productMutationAllowedBeforeAdmissionMerge: false, taskLocalGoverningEdgeClosure: "CLEAR" } });
  const staleFinalRaw = githubReceipt(5293999998, 233, staleFinal.body, "2026-08-14T13:30:00Z");
  const malformedReviewRaw = githubReceipt(5293000002, 233, `${ARCHITECTURE_REPOSITORY_REVIEW_MARKER}\n{}`, "2026-08-14T16:00:00Z");
  const malformedFinalRaw = githubReceipt(5294000002, 233, `${FINITE_TASK_ADMISSION_FINAL_SOURCE_V2_MARKER}\n{}`, "2026-08-14T16:01:00Z");
  const retainedHistory = [staleFinalRaw, malformedReviewRaw, reviewRaw, staleReviewRaw, finalRaw];
  const retained = verifyFiniteTaskAdmissionFinalSourceEligibilityV2({ ...args, allComments: retainedHistory });
  assert.equal(retained.mergeEligible, true, retained.findings.join(","));
  assert.equal(verifyFiniteTaskAdmissionFinalSourceEligibilityV2({ ...args, allComments: [...retainedHistory].reverse() }).commentId, finalRaw.id);
  assert.equal(verifyFiniteTaskAdmissionFinalSourceEligibilityV2({ ...args, paginationComplete: false }).mergeEligible, false);
  assert.equal(verifyFiniteTaskAdmissionFinalSourceEligibilityV2({ ...args, allComments: [...retainedHistory, malformedFinalRaw] }).mergeEligible, false);

  const duplicateReviewRaw = { ...reviewRaw, id: 5293000003, node_id: "IC_5293000003", html_url: `https://github.com/${scope.repository}/pull/233#issuecomment-5293000003` };
  assert.equal(verifyFiniteTaskAdmissionFinalSourceEligibilityV2({ ...args, allComments: [reviewRaw, duplicateReviewRaw, finalRaw] }).mergeEligible, false);
  const duplicateFinalRaw = { ...finalRaw, id: 5294000003, node_id: "IC_5294000003", html_url: `https://github.com/${scope.repository}/pull/233#issuecomment-5294000003` };
  assert.equal(verifyFiniteTaskAdmissionFinalSourceEligibilityV2({ ...args, allComments: [reviewRaw, finalRaw, duplicateFinalRaw] }).mergeEligible, false);
  const browserTransportDuplicate = { ...finalRaw, id: 5294000005, node_id: "IC_5294000005", body: finalRaw.body.replace("\n", "\r\n"), html_url: `https://github.com/${scope.repository}/pull/233#issuecomment-5294000005` };
  const transportEquivalent = verifyFiniteTaskAdmissionFinalSourceEligibilityV2({ ...args, allComments: [reviewRaw, finalRaw, browserTransportDuplicate] });
  assert.equal(transportEquivalent.mergeEligible, true, transportEquivalent.findings.join(","));
  assert.equal(transportEquivalent.commentId, finalRaw.id);

  const staleSelectedFinal = renderFiniteTaskAdmissionFinalSourceV2({ scope, owner, admissionIdentity: fixture.admissionIdentity, diffHash: reviewScope.diffHash, ownerJurisdiction: finiteTaskFinalSourceOwnerJurisdictionV2(authority), currentAdmission: { bodyHash: admission.bodyHash, commentId: admissionAuthority.commentId, sequence: admission.subject.sequence, subjectHash: admission.subjectHash }, repositoryReview: { bodyHash: hashValue(staleReviewRaw.body), commentId: staleReviewRaw.id, disposition: staleReviewSubject.disposition, subjectHash: hashValue(staleReviewSubject) }, phase1, prospective: { classification: "PREIMPLEMENTATION_ENGINEERING_CLEAR", externalProofInherited: false, marketJurisdictionOwnerCoverage: { covered: 9, required: 9, result: "9/9" }, productMutationAllowedAfterAdmissionMerge: true, productMutationAllowedBeforeAdmissionMerge: false, taskLocalGoverningEdgeClosure: "CLEAR" } });
  const staleSelectedFinalRaw = githubReceipt(5294000004, 233, staleSelectedFinal.body, "2026-08-14T16:02:00Z");
  assert.equal(verifyFiniteTaskAdmissionFinalSourceEligibilityV2({ ...args, allComments: [staleReviewRaw, reviewRaw, staleSelectedFinalRaw] }).mergeEligible, false);

  const finalForIdentity = (id, admissionIdentity, createdAt = "2026-08-14T16:10:00Z") => {
    const alternatePhase1 = { ...phase1, head: admissionIdentity.head, tree: admissionIdentity.tree };
    const alternate = renderFiniteTaskAdmissionFinalSourceV2({ scope, owner, admissionIdentity, diffHash: reviewScope.diffHash, ownerJurisdiction: finiteTaskFinalSourceOwnerJurisdictionV2(authority), currentAdmission: { bodyHash: admission.bodyHash, commentId: admissionAuthority.commentId, sequence: admission.subject.sequence, subjectHash: admission.subjectHash }, repositoryReview: { bodyHash: hashValue(reviewRaw.body), commentId: reviewRaw.id, disposition: reviewSubject.disposition, subjectHash: hashValue(reviewSubject) }, phase1: alternatePhase1, prospective: { classification: "PREIMPLEMENTATION_ENGINEERING_CLEAR", externalProofInherited: false, marketJurisdictionOwnerCoverage: { covered: 9, required: 9, result: "9/9" }, productMutationAllowedAfterAdmissionMerge: true, productMutationAllowedBeforeAdmissionMerge: false, taskLocalGoverningEdgeClosure: "CLEAR" } });
    return githubReceipt(id, 233, alternate.body, createdAt);
  };
  const staleBranch = finalForIdentity(5294000010, { ...fixture.admissionIdentity, branch: "codex/historical-admission" });
  const staleHead = finalForIdentity(5294000011, { ...fixture.admissionIdentity, head: sha40("4") });
  const staleTreeReceipt = finalForIdentity(5294000012, { ...fixture.admissionIdentity, tree: sha40("3") }, "2026-08-14T17:00:00Z");
  assert.equal(verifyFiniteTaskAdmissionFinalSourceEligibilityV2({ ...args, allComments: [staleTreeReceipt, staleHead, reviewRaw, staleBranch, finalRaw] }).mergeEligible, true);

  const coherentPayloadMutation = (id, mutate) => {
    const payload = structuredClone(final.payload);
    mutate(payload);
    payload.commentContextHash = typeSeparatedHash(jurisdictionHashDomains.admissionFinalSourceContext, { marker: FINITE_TASK_ADMISSION_FINAL_SOURCE_V2_MARKER, owner: payload.owner, pr: payload.pr, repository: payload.repository, task: payload.task, type: "FINITE_TASK_ADMISSION_FINAL_SOURCE_V2" });
    payload.subjectHash = typeSeparatedHash(jurisdictionHashDomains.admissionFinalSourceSubject, payload.subject);
    payload.envelopeHash = typeSeparatedHash(jurisdictionHashDomains.admissionFinalSourceEnvelope, { admissionBodyHash: payload.subject.currentAdmission.bodyHash, commentContextHash: payload.commentContextHash, finalHead: payload.subject.admissionIdentity.head, finalTree: payload.subject.admissionIdentity.tree, phase1RunId: payload.subject.phase1.runId, repositoryReviewBodyHash: payload.subject.repositoryReview.bodyHash, subjectHash: payload.subjectHash });
    const withoutBodyHash = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "bodyHash"));
    payload.bodyHash = typeSeparatedHash(jurisdictionHashDomains.admissionFinalSourceBody, withoutBodyHash);
    return githubReceipt(id, 233, withPayload(FINITE_TASK_ADMISSION_FINAL_SOURCE_V2_MARKER, payload), "2026-08-14T17:10:00Z");
  };
  const invalidHistorical = [
    ["edited", { ...finalRaw, id: 5294000020, node_id: "IC_5294000020", html_url: `https://github.com/${scope.repository}/pull/233#issuecomment-5294000020`, updated_at: "2026-08-14T15:00:01Z" }],
    ["wrong Owner", { ...githubReceipt(5294000021, 233, final.body, "2026-08-14T17:11:00Z"), user: { login: "not-owner" } }],
    ["wrong association", { ...githubReceipt(5294000022, 233, final.body, "2026-08-14T17:12:00Z"), author_association: "MEMBER" }],
    ["wrong PR", githubReceipt(5294000023, 232, final.body, "2026-08-14T17:13:00Z")],
    ["wrong authority", coherentPayloadMutation(5294000024, (payload) => { payload.subject.authority.build = true; })],
    ["wrong schema", coherentPayloadMutation(5294000025, (payload) => { payload.schemaVersion = 1; })],
    ["wrong classification", coherentPayloadMutation(5294000026, (payload) => { payload.evidenceClass = "UNRELATED_EVIDENCE"; })],
  ];
  for (const [label, historical] of invalidHistorical) {
    assert.equal(verifyFiniteTaskAdmissionFinalSourceEligibilityV2({ ...args, allComments: [reviewRaw, historical, finalRaw] }).mergeEligible, false, `${label} malformed/forged evidence blocks`);
    assert.equal(verifyFiniteTaskAdmissionFinalSourceEligibilityV2({ ...args, allComments: [reviewRaw, historical] }).mergeEligible, false, `${label} cannot become current`);
  }
  assert.equal(verifyFiniteTaskAdmissionFinalSourceEligibilityV2({ ...args, raw: staleHead, allComments: [reviewRaw, staleHead, finalRaw] }).mergeEligible, false);

  const synchronizedIdentity = { ...identity, headSha: sha40("4") };
  const synchronizedTree = sha40("3");
  const synchronizedReviewSubject = architectureRepositoryReviewSubject({ identity: synchronizedIdentity, tree: synchronizedTree, scope: reviewScope, profile: "FINITE_TASK_ADMISSION_JURISDICTION_V2" });
  const synchronizedReviewRaw = githubReceipt(5293000030, 233, architectureRepositoryReviewCommentBody(synchronizedReviewSubject), "2026-08-14T18:00:00Z");
  const synchronizedPhase1 = { ...phase1, head: synchronizedIdentity.headSha, tree: synchronizedTree, runId: 31790000001 };
  const synchronizedLivePhase1 = { ...liveLegacyPhase1, sourceHead: synchronizedIdentity.headSha, sourceTree: synchronizedTree, runId: synchronizedPhase1.runId };
  const synchronizedFinal = renderFiniteTaskAdmissionFinalSourceV2({ scope, owner, admissionIdentity: { ...fixture.admissionIdentity, head: synchronizedIdentity.headSha, tree: synchronizedTree }, diffHash: reviewScope.diffHash, ownerJurisdiction: finiteTaskFinalSourceOwnerJurisdictionV2(authority), currentAdmission: { bodyHash: admission.bodyHash, commentId: admissionAuthority.commentId, sequence: admission.subject.sequence, subjectHash: admission.subjectHash }, repositoryReview: { bodyHash: hashValue(synchronizedReviewRaw.body), commentId: synchronizedReviewRaw.id, disposition: synchronizedReviewSubject.disposition, subjectHash: hashValue(synchronizedReviewSubject) }, phase1: synchronizedPhase1, prospective: { classification: "PREIMPLEMENTATION_ENGINEERING_CLEAR", externalProofInherited: false, marketJurisdictionOwnerCoverage: { covered: 9, required: 9, result: "9/9" }, productMutationAllowedAfterAdmissionMerge: true, productMutationAllowedBeforeAdmissionMerge: false, taskLocalGoverningEdgeClosure: "CLEAR" } });
  const synchronizedFinalRaw = githubReceipt(5294000030, 233, synchronizedFinal.body, "2026-08-14T18:01:00Z");
  const synchronized = verifyFiniteTaskAdmissionFinalSourceEligibilityV2({ ...args, identity: synchronizedIdentity, tree: synchronizedTree, allComments: [reviewRaw, finalRaw, synchronizedReviewRaw, synchronizedFinalRaw], phase1EvidenceResolver: () => structuredClone(synchronizedLivePhase1) });
  assert.equal(synchronized.mergeEligible, true, synchronized.findings.join(","));
  assert.equal(synchronized.commentId, synchronizedFinalRaw.id);
  assert.equal(synchronized.classifications.find(({ commentId }) => commentId === finalRaw.id).status, "HISTORICAL_STALE_FINITE_TASK_ADMISSION_FINAL_SOURCE");
});

test("finite-task engineering evidence remains source-bound across canonical admission synchronization", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-engineering-source-lineage-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  runGit(root, ["init", "--initial-branch=main"]);
  runGit(root, ["config", "user.name", "Synthetic Assurance"]);
  runGit(root, ["config", "user.email", "assurance@example.invalid"]);
  writeFixture(root, "closure.txt", "historical bounded engineering analysis\n");
  runGit(root, ["add", "closure.txt"]);
  runGit(root, ["commit", "--no-gpg-sign", "-m", "Historical engineering closure"]);
  const closureHead = runGit(root, ["rev-parse", "HEAD"]);
  const closureTree = runGit(root, ["rev-parse", "HEAD^{tree}"]);

  writeFixture(root, "edge.txt", "task-local edge evidence\n");
  runGit(root, ["add", "edge.txt"]);
  runGit(root, ["commit", "--no-gpg-sign", "-m", "Task-local edge evidence"]);
  const edgeHead = runGit(root, ["rev-parse", "HEAD"]);
  const edgeTree = runGit(root, ["rev-parse", "HEAD^{tree}"]);

  writeFixture(root, "planning.txt", "canonical planning snapshot\n");
  runGit(root, ["add", "planning.txt"]);
  runGit(root, ["commit", "--no-gpg-sign", "-m", "Canonical planning snapshot"]);
  const planningHead = runGit(root, ["rev-parse", "HEAD"]);
  const planningTree = runGit(root, ["rev-parse", "HEAD^{tree}"]);
  const exact = {
    edgeSourceIdentity: { head: edgeHead, tree: edgeTree },
    closureSourceIdentity: { head: closureHead, tree: closureTree },
    planningHead,
    planningTree,
    root,
  };
  assert.equal(finiteTaskEngineeringSourceLineageValid(exact), true);

  const wrongEdgeTree = structuredClone(exact);
  wrongEdgeTree.edgeSourceIdentity.tree = sha40("f");
  assert.equal(finiteTaskEngineeringSourceLineageValid(wrongEdgeTree), false);
  const wrongClosureTree = structuredClone(exact);
  wrongClosureTree.closureSourceIdentity.tree = sha40("e");
  assert.equal(finiteTaskEngineeringSourceLineageValid(wrongClosureTree), false);
  const wrongPlanningTree = structuredClone(exact);
  wrongPlanningTree.planningTree = sha40("d");
  assert.equal(finiteTaskEngineeringSourceLineageValid(wrongPlanningTree), false);

  runGit(root, ["checkout", "--detach", closureHead]);
  writeFixture(root, "unrelated-edge.txt", "not part of planning lineage\n");
  runGit(root, ["add", "unrelated-edge.txt"]);
  runGit(root, ["commit", "--no-gpg-sign", "-m", "Unrelated forged edge"]);
  const unrelatedEdge = structuredClone(exact);
  unrelatedEdge.edgeSourceIdentity = {
    head: runGit(root, ["rev-parse", "HEAD"]),
    tree: runGit(root, ["rev-parse", "HEAD^{tree}"]),
  };
  assert.equal(finiteTaskEngineeringSourceLineageValid(unrelatedEdge), false);
});

test("finite-task Owner authority survives only canonical protected-main synchronization lineage", (t) => {
  const fixture = canonicalAdmissionSynchronizationFixture(t);
  const result = verifyFiniteTaskAdmissionSynchronizationLineage(fixture);
  assert.equal(result.ok, true, result.findings.join(","));
  assert.equal(result.synchronizationCount, 1);
  assert.equal(result.anchorHead, fixture.anchorHead);
  assert.equal(result.currentBase, fixture.currentBase);
  assert.equal(result.protectedMainRuntime.currentTruthStatus, "CURRENT");
  assert.equal(result.protectedMainRuntime.pendingTransitionCount, 0);
});

test("active-task admission resolves the immutable artifact from the exact implementation head", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-active-task-admission-artifact-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  runGit(root, ["init", "--initial-branch=main"]);
  runGit(root, ["config", "user.name", "Synthetic Assurance"]);
  runGit(root, ["config", "user.email", "assurance@example.invalid"]);
  const taskId = "generic-admission-implementation-artifact";
  const artifactPath = `docs/assurance/tasks/${taskId}.json`;
  const implementationPr = 701;
  const implementationBranch = "codex/generic-admission-implementation";
  const repository = "Chillywood2025/chillywood-mobile";
  const artifact = { taskId, repository, implementation: { branch: implementationBranch, pullRequest: implementationPr } };
  const artifactSource = `${JSON.stringify(artifact, null, 2)}\n`;
  writeFixture(root, artifactPath, artifactSource);
  runGit(root, ["add", artifactPath]);
  runGit(root, ["commit", "--no-gpg-sign", "-m", "Synthetic implementation artifact"]);
  const planningHead = runGit(root, ["rev-parse", "HEAD"]);
  const planningTree = runGit(root, ["rev-parse", "HEAD^{tree}"]);
  const artifactHash = crypto.createHash("sha256").update(artifactSource).digest("hex");
  const activeBinding = { closureArtifactPath: artifactPath, currentImplementationHead: planningHead, currentImplementationTree: planningTree, implementationBranch, implementationPr };
  const lease = { admittedSeedHead: planningHead, admittedSeedTree: planningTree, artifactReservation: { closureArtifactPath: artifactPath }, closure: { artifactHash }, implementationBranch, implementationPr, leaseId: taskId, ownerAuthorizationCommentId: 9001 };
  const projection = { repository, taskBinding: { planningHead, planningTree, prNumber: implementationPr, taskId } };
  const implementationPull = { number: implementationPr, state: "open", merged: false, base: { ref: "main", repo: { full_name: repository } }, head: { ref: implementationBranch, sha: planningHead, repo: { full_name: repository } } };
  const exact = { activeBinding, lease, projection, implementationPull, root };
  const result = resolveActiveTaskAdmissionImplementationEvidence(exact);
  assert.equal(result.ok, true, result.findings.join(","));
  assert.equal(result.artifactRead.artifactHash, artifactHash);
  assert.deepEqual(result.implementation, { pr: implementationPr, branch: implementationBranch, planningHead, planningTree, seedHead: planningHead, seedTree: planningTree, ownerCommentId: 9001, taskArtifactPath: artifactPath });

  writeFixture(root, "implementation.txt", "authorized descendant\n");
  runGit(root, ["add", "implementation.txt"]);
  runGit(root, ["commit", "--no-gpg-sign", "-m", "Authorized implementation descendant"]);
  const descendant = structuredClone(exact);
  descendant.implementationPull.head.sha = runGit(root, ["rev-parse", "HEAD"]);
  assert.equal(resolveActiveTaskAdmissionImplementationEvidence(descendant).ok, true, "an implementation descendant preserves the immutable artifact anchor");

  for (const [name, mutate] of [
    ["wrong PR", (value) => { value.implementationPull.number += 1; }],
    ["closed implementation", (value) => { value.implementationPull.state = "closed"; }],
    ["wrong repository", (value) => { value.implementationPull.head.repo.full_name = "forged/repository"; }],
    ["wrong branch", (value) => { value.implementationPull.head.ref = "codex/forged"; }],
    ["unrelated head", (value) => { value.implementationPull.head.sha = "f".repeat(40); }],
    ["wrong bound tree", (value) => { value.activeBinding.currentImplementationTree = "e".repeat(40); }],
    ["wrong artifact hash", (value) => { value.lease.closure.artifactHash = "d".repeat(64); }],
    ["wrong task identity", (value) => { value.projection.taskBinding.taskId = "forged-task"; }],
    ["unbound artifact path", (value) => { value.activeBinding.closureArtifactPath = "docs/assurance/tasks/other.json"; }],
  ]) {
    const candidate = structuredClone(exact);
    mutate(candidate);
    assert.equal(resolveActiveTaskAdmissionImplementationEvidence(candidate).ok, false, name);
  }
});

test("finite-task admission synchronization rejects identity, semantic, scope, ancestry, and generated-companion mutations", (t) => {
  const identityMutations = [
    ["wrong current tree", (fixture) => ({ ...fixture, tree: sha40("f") })],
    ["wrong protected base", (fixture) => ({ ...fixture, identity: { ...fixture.identity, baseSha: fixture.anchorHead } })],
    ["wrong branch", (fixture) => ({ ...fixture, identity: { ...fixture.identity, branch: "forged-admission" } })],
    ["forged refreshed head", (fixture) => ({ ...fixture, identity: { ...fixture.identity, headSha: fixture.currentBase }, tree: runGit(fixture.root, ["rev-parse", `${fixture.currentBase}^{tree}`]) })],
  ];
  for (const [name, mutate] of identityMutations) {
    const fixture = canonicalAdmissionSynchronizationFixture(t);
    assert.equal(verifyFiniteTaskAdmissionSynchronizationLineage(mutate(fixture)).ok, false, name);
  }

  const semanticMutations = [
    ["changed task identity", (record) => { record.activeTaskBinding = { implementationBindingId: "different-task" }; }],
    ["changed scope", (record) => { record.finiteTaskLeases.policyId = "forged-scope-policy"; }],
    ["changed authority", (record) => { record.ownerJurisdictionPolicyCapability.status = "FORGED"; }],
    ["changed implementation target", (record) => { record.openImplementationPrs = [{ number: 999, head: sha40("9"), state: "open", disposition: "forged" }]; }],
  ];
  for (const [name, mutate] of semanticMutations) {
    const fixture = canonicalAdmissionSynchronizationFixture(t);
    const forged = structuredClone(fixture.currentTruth);
    mutate(forged);
    const result = verifyFiniteTaskAdmissionSynchronizationLineage({ ...fixture, currentTruth: forged });
    assert.equal(result.ok, false, name);
    assert.ok(result.findings.includes("ADMISSION_SYNCHRONIZATION_SEMANTIC_TRUTH_CHANGED"), name);
  }

  for (const [name, file, content] of [
    ["arbitrary descendant", "docs/arbitrary-descendant.md", "not a synchronization\n"],
    ["product path addition", "app/forged-product.tsx", "export default null;\n"],
    ["manual generated companion", "CURRENT_STATE.md", "manually edited\n"],
  ]) {
    const fixture = canonicalAdmissionSynchronizationFixture(t);
    writeFixture(fixture.root, file, content);
    runGit(fixture.root, ["add", file]);
    runGit(fixture.root, ["commit", "--no-gpg-sign", "-m", name]);
    const headSha = runGit(fixture.root, ["rev-parse", "HEAD"]);
    const tree = runGit(fixture.root, ["rev-parse", "HEAD^{tree}"]);
    const result = verifyFiniteTaskAdmissionSynchronizationLineage({ ...fixture, identity: { ...fixture.identity, headSha }, tree });
    assert.equal(result.ok, false, name);
  }
});
