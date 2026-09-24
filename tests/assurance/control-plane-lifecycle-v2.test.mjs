import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";
import {
  APPLICABILITY,
  CANONICAL_GENERATED_ASSURANCE_COMPANION_PATHS,
  CLOSED_EXTERNAL_AUTHORITY,
  EXCEPTIONAL_MERGE_CLASSIFICATION,
  GATE_RESULTS,
  RISK_CLASSES,
  aggregateApplicablePhase1,
  authorizeCanonicalGeneratedAssuranceCompanionTransition,
  authorizeExceptionalMergeOutcome,
  classifyDiffRisk,
  evidenceInvalidation,
  evaluateLifecycleAuthority,
  fixedPointAcceptsAdvancement,
  lifecycleHash,
  phase1LaneApplicability,
  projectExceptionalTerminalTruth,
  stableLifecycleJson,
  terminalLeaseOutcome,
  transitionLifecycle,
  validateAssuranceSelfMaintenance,
  validateDeferredOutcome,
  validateExceptionalMergeOutcome,
  validateExceptionalHostedSecurityReadback,
  validateExceptionalRepositoryReviewReadback,
  validateLifecyclePolicy,
  EXCEPTIONAL_OWNER_TERMINAL_MARKER,
  EXCEPTIONAL_OWNER_TERMINAL_MARKER_V3,
} from "../../scripts/assurance/control-plane-lifecycle.mjs";
import { parseCanonicalMarkedComment } from "../../scripts/assurance/jurisdiction-policy.mjs";

const policy = JSON.parse(fs.readFileSync("config/assurance/control-plane-lifecycle-v2.json", "utf8"));
const prScopePolicy = JSON.parse(fs.readFileSync("config/assurance/pr-scope-policy-v1.json", "utf8"));
const sha = (character) => character.repeat(40);
const digest = (character) => character.repeat(64);
const lease = { leaseId: "synthetic-lifecycle-task-v1", implementationPr: 700, implementationBranch: "codex/synthetic-lifecycle-task-v1" };
const normalMissing = { exactHeadReview: "NOT_PRODUCED", phase1: "NOT_SUCCESSFUL", finalSourceReceipt: "NOT_PRODUCED" };

function ownerSubject() {
  return {
    repository: "Chillywood2025/chillywood-mobile", implementationPr: 700, leaseId: lease.leaseId,
    protectedBase: sha("1"), sourceHead: sha("2"), sourceTree: sha("3"), patchSha256: digest("4"), changedPathSha256: digest("5"),
    mergeSha: sha("6"), mergeTree: sha("3"), mergeParents: [sha("1"), sha("2")], classification: EXCEPTIONAL_MERGE_CLASSIFICATION,
    normalPathEvidence: normalMissing,
  };
}

function exceptionalFixture() {
  const subject = ownerSubject();
  const payloadBody = { marker: EXCEPTIONAL_OWNER_TERMINAL_MARKER, schemaVersion: 2, subject, subjectHash: lifecycleHash(subject), type: "OWNER_EXCEPTIONAL_BYPASS_TERMINAL_ACKNOWLEDGEMENT_V2" };
  const receipt = { commentId: 9001, author: "Chillywood2025", authorAssociation: "OWNER", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", subject, subjectHash: lifecycleHash(subject), bodyHash: lifecycleHash(payloadBody) };
  const gitEvidence = { protectedBase: subject.protectedBase, sourceHead: subject.sourceHead, sourceTree: subject.sourceTree, mergeSha: subject.mergeSha, mergeTree: subject.mergeTree, mergeParents: subject.mergeParents, patchSha256: subject.patchSha256, changedPathSha256: subject.changedPathSha256 };
  const rulesetEvidence = { before: { onlyIntegration: true }, bypass: { userPresent: true, updatedAt: "2026-01-01T00:00:30Z" }, restored: { onlyIntegration: true, integrationId: 4707730, updatedAt: "2026-01-01T00:01:30Z" } };
  const body = {
    schemaVersion: 2, classification: EXCEPTIONAL_MERGE_CLASSIFICATION, repository: subject.repository, taskId: lease.leaseId, leaseId: lease.leaseId,
    implementationPr: 700, implementationBranch: lease.implementationBranch, protectedBase: subject.protectedBase, sourceHead: subject.sourceHead,
    sourceTree: subject.sourceTree, patchSha256: subject.patchSha256, changedPathSha256: subject.changedPathSha256, mergeSha: subject.mergeSha,
    mergeTree: subject.mergeTree, mergeParents: subject.mergeParents, normalPathEvidence: normalMissing, hostedSecurity: "NOT_APPLICABLE_PRESENTATION_ONLY",
    physicalProof: "PENDING", ownerReceipt: receipt, gitEvidence,
    ruleset: { id: 18940814, temporaryActor: { actorId: 210200794, actorType: "User", bypassMode: "pull_request" }, mergeAt: "2026-01-01T00:01:00Z", evidence: rulesetEvidence },
    authority: CLOSED_EXTERNAL_AUTHORITY,
  };
  const outcome = { ...body, evidenceHash: lifecycleHash(body) };
  const payload = { ...payloadBody, bodyHash: lifecycleHash(payloadBody) };
  const ownerReceiptReadback = { id: receipt.commentId, user: { login: receipt.author }, author_association: receipt.authorAssociation, created_at: receipt.createdAt, updated_at: receipt.updatedAt, body: `${EXCEPTIONAL_OWNER_TERMINAL_MARKER}\n${stableLifecycleJson(payload)}` };
  return { outcome, receipt, gitEvidence, rulesetEvidence, ownerReceiptReadback };
}

function exceptionalFixtureV3({ review = false, security = false } = {}) {
  const fixture = exceptionalFixture();
  const changedPaths = ["scripts/example.mjs", "tests/example.test.mjs"];
  const gitEvidence = {
    ...fixture.gitEvidence,
    changedPaths,
    reviewChangedPathHash: lifecycleHash(changedPaths),
    diffHash: digest("d"),
    additions: 12,
    deletions: 3,
  };
  const reviewSubject = {
    type: "REPOSITORY_OWNED_EXACT_HEAD_REVIEW_V1",
    repository: fixture.outcome.repository,
    pr: fixture.outcome.implementationPr,
    branch: fixture.outcome.implementationBranch,
    protectedBase: fixture.outcome.protectedBase,
    reviewedHead: fixture.outcome.sourceHead,
    reviewedTree: fixture.outcome.sourceTree,
    changedPaths,
    changedPathHash: gitEvidence.reviewChangedPathHash,
    diffHash: gitEvidence.diffHash,
    additions: gitEvidence.additions,
    deletions: gitEvidence.deletions,
    netChangedLines: gitEvidence.additions - gitEvidence.deletions,
    disposition: { P0: 0, P1: 0, launchImpactingP2: 0 },
    finiteTaskEffectiveReservation: {
      authorityValid: true,
      implementationPr: fixture.outcome.implementationPr,
      implementationBranch: fixture.outcome.implementationBranch,
      leaseId: lease.leaseId,
      candidateHead: fixture.outcome.sourceHead,
      candidateTree: fixture.outcome.sourceTree,
    },
  };
  const reviewPayloadBody = {
    schemaVersion: 1,
    evidenceClass: "REPOSITORY_EXACT_HEAD_REVIEW",
    type: reviewSubject.type,
    repository: reviewSubject.repository,
    pr: reviewSubject.pr,
    subject: reviewSubject,
    subjectHash: lifecycleHash(reviewSubject),
  };
  const reviewPayload = { ...reviewPayloadBody, bodyHash: lifecycleHash(reviewPayloadBody) };
  const reviewBody = `<!-- chillywood-assurance-repository-review-v1 -->\n${stableLifecycleJson(reviewPayload)}`;
  const repositoryReviewReadback = {
    id: 9100,
    user: { login: "Chillywood2025" },
    author_association: "OWNER",
    created_at: "2026-01-01T00:00:05Z",
    updated_at: "2026-01-01T00:00:05Z",
    issue_url: `https://api.github.com/repos/${fixture.outcome.repository}/issues/${fixture.outcome.implementationPr}`,
    body: reviewBody,
  };
  const reviewEvidence = review ? {
    commentId: repositoryReviewReadback.id,
    author: repositoryReviewReadback.user.login,
    authorAssociation: repositoryReviewReadback.author_association,
    createdAt: repositoryReviewReadback.created_at,
    updatedAt: repositoryReviewReadback.updated_at,
    canonicalBodyHash: lifecycleHash(reviewBody),
    subjectHash: reviewPayload.subjectHash,
    repository: reviewSubject.repository,
    implementationPr: reviewSubject.pr,
    leaseId: lease.leaseId,
    protectedBase: reviewSubject.protectedBase,
    reviewedHead: reviewSubject.reviewedHead,
    reviewedTree: reviewSubject.reviewedTree,
    changedPathHash: reviewSubject.changedPathHash,
    diffHash: reviewSubject.diffHash,
    disposition: reviewSubject.disposition,
  } : null;

  const findingsDocument = { documentType: "codex-security.findings", findings: [], scanId: "scan-1", schemaVersion: "1.0" };
  const coverageDocument = { completeness: "complete", deferred: [], documentType: "codex-security.coverage", openQuestions: [], scanId: "scan-1", schemaVersion: "1.0", surfaces: changedPaths.map((label) => ({ label, disposition: "no_issue_found" })) };
  const findingsText = `${stableLifecycleJson(findingsDocument)}\n`;
  const coverageText = `${stableLifecycleJson(coverageDocument)}\n`;
  const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
  const manifestDocument = {
    documentType: "codex-security.scan-manifest",
    schemaVersion: "1.0",
    scan: {
      id: "scan-1",
      status: "completed",
      completedAt: "2026-01-01T00:00:10Z",
      sealedAt: "2026-01-01T00:00:10Z",
      findingsRef: "findings.json",
      coverageRef: "coverage.json",
      artifacts: [
        { path: "findings.json", sha256: hash(findingsText) },
        { path: "coverage.json", sha256: hash(coverageText) },
      ],
      target: {
        kind: "git_diff",
        targetId: "target-1",
        baseRevision: fixture.outcome.protectedBase,
        headRevision: fixture.outcome.sourceHead,
        snapshotDigest: `codex-security-snapshot/v1:sha256:${digest("f")}`,
      },
    },
  };
  const manifestText = `${stableLifecycleJson(manifestDocument)}\n`;
  const hostedSecurityReadback = { manifestText, findingsText, coverageText };
  const securityEvidence = security ? {
    scanId: "scan-1",
    targetId: "target-1",
    baseRevision: fixture.outcome.protectedBase,
    headRevision: fixture.outcome.sourceHead,
    snapshotDigest: `codex-security-snapshot/v1:sha256:${digest("f")}`,
    status: "completed",
    completedAt: "2026-01-01T00:00:10Z",
    sealedAt: "2026-01-01T00:00:10Z",
    findingsCount: 0,
    coverageCompleteness: "complete",
    findingsSha256: hash(findingsText),
    coverageSha256: hash(coverageText),
    manifestSha256: hash(manifestText),
  } : null;

  const normalPathEvidence = { exactHeadReview: review ? "PRODUCED_VALID" : "NOT_PRODUCED", phase1: "NOT_SUCCESSFUL", finalSourceReceipt: "NOT_PRODUCED" };
  const independentEvidence = { exactHeadReview: reviewEvidence, hostedSecurity: securityEvidence };
  const subject = { ...ownerSubject(), normalPathEvidence, hostedSecurity: security ? "SEALED_PASS" : "NOT_PRODUCED", independentEvidence };
  const ownerPayloadBody = { marker: EXCEPTIONAL_OWNER_TERMINAL_MARKER_V3, schemaVersion: 3, subject, subjectHash: lifecycleHash(subject), type: "OWNER_EXCEPTIONAL_BYPASS_TERMINAL_ACKNOWLEDGEMENT_V3" };
  const ownerReceipt = { ...fixture.receipt, subject, subjectHash: lifecycleHash(subject), bodyHash: lifecycleHash(ownerPayloadBody) };
  const ownerPayload = { ...ownerPayloadBody, bodyHash: lifecycleHash(ownerPayloadBody) };
  const ownerReceiptReadback = { ...fixture.ownerReceiptReadback, body: `${EXCEPTIONAL_OWNER_TERMINAL_MARKER_V3}\n${stableLifecycleJson(ownerPayload)}` };
  const body = {
    ...Object.fromEntries(Object.entries(fixture.outcome).filter(([key]) => key !== "evidenceHash")),
    schemaVersion: 3,
    normalPathEvidence,
    hostedSecurity: security ? "SEALED_PASS" : "NOT_PRODUCED",
    independentEvidence,
    ownerReceipt,
    gitEvidence,
    ruleset: {
      ...fixture.outcome.ruleset,
      evidence: {
        before: { onlyIntegration: true, version: 1, updatedAt: "2025-12-31T23:59:00Z" },
        bypass: { ...fixture.rulesetEvidence.bypass, version: 2 },
        restored: { ...fixture.rulesetEvidence.restored, version: 3 },
      },
    },
  };
  const rulesetEvidence = body.ruleset.evidence;
  const outcome = { ...body, evidenceHash: lifecycleHash(body) };
  return { ...fixture, outcome, gitEvidence, ownerReceipt, ownerReceiptReadback, repositoryReviewReadback, hostedSecurityReadback, rulesetEvidence };
}

const strictRulesetReadback = () => ({
  id: 18940814,
  enforcement: "active",
  bypass_actors: [{ actor_id: 4707730, actor_type: "Integration", bypass_mode: "pull_request" }],
  rules: [{ type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, required_status_checks: [{ context: "Phase 1 / Admission Decision", integration_id: 4707730 }] } }],
});

function exactDiff(paths) {
  return {
    repository: "Chillywood2025/chillywood-mobile", implementationPr: 700,
    baseSha: sha("1"), headSha: sha("2"), sourceTree: sha("3"),
    changedPathSha256: lifecycleHash([...paths].sort().join("\n") + "\n"), patchSha256: digest("a"),
  };
}

function boundaryAssessment(paths, source = exactDiff(paths)) {
  const boundaries = Object.fromEntries(policy.security.sensitiveBoundaries.map((key) => [key, false]));
  const body = { schemaVersion: 1, classification: "EXACT_DIFF_BOUNDARY_ASSESSMENT_V1", ...source, boundaries };
  return { ...body, assessmentHash: lifecycleHash(body) };
}

function canonicalCompanionFixture() {
  const paths = [...CANONICAL_GENERATED_ASSURANCE_COMPANION_PATHS];
  const source = exactDiff(paths);
  const leaseId = "synthetic-admitted-task-v1";
  const taskLease = {
    leaseId,
    implementationPr: 701,
    implementationBranch: "codex/synthetic-admitted-task-v1",
    featureId: "synthetic-feature",
    admittedSeedHead: sha("6"),
    admittedSeedTree: sha("7"),
    protectedAdmissionPr: source.implementationPr,
    taskState: "ACTIVE_IMPLEMENTATION",
    authority: { providerMutation: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false },
  };
  const currentTruth = {
    mainSha: source.baseSha,
    protectedMainAuthority: { checkpointSha: source.baseSha, checkpointTree: sha("8") },
    activeTaskBinding: {
      implementationBindingId: leaseId,
      implementationPr: taskLease.implementationPr,
      implementationBranch: taskLease.implementationBranch,
      featureId: taskLease.featureId,
      immutableSourceHead: taskLease.admittedSeedHead,
      immutableSourceTree: taskLease.admittedSeedTree,
      productSourceMutationAllowed: true,
      providerMutationAllowed: false,
      databaseDeploymentAllowed: false,
      buildAllowed: false,
      submissionAllowed: false,
      otaAllowed: false,
      publicReleaseAllowed: false,
    },
    controlPlaneLifecycle: {
      contractId: "ASSURANCE_CONTROL_PLANE_LIFECYCLE_V2",
      currentStage: "AUTHORIZED_IMPLEMENTATION",
      terminalClassification: null,
      pendingTransitionCount: 0,
      mergeAuthority: false,
      providerBuildOtaReleaseAuthority: false,
      activeLeaseId: leaseId,
    },
    finiteTaskLeases: { tasks: [taskLease] },
  };
  const sourceAuthorityProof = {
    schemaVersion: 1,
    contract: "PHASE1_SOURCE_AUTHORITY_RESOLUTION_V2",
    producer: "PROTECTED_MAIN_ENGINEERING_CLOSURE_V1",
    repository: source.repository,
    pr: source.implementationPr,
    headRef: "codex/synthetic-admission-v1",
    headSha: source.headSha,
    sourceTree: source.sourceTree,
    baseRef: "main",
    baseSha: source.baseSha,
    authorityType: "FINITE_TASK_ADMISSION",
    authorityMode: null,
    draftSourceOnly: false,
    mergeAuthorityGranted: false,
    lifecycleAction: null,
    lifecycleEventUpdatedAt: null,
    lifecycleGeneration: null,
    scopeHash: digest("9"),
    findings: [],
  };
  return {
    changedPaths: paths,
    exactDiff: source,
    sourceAuthorityProof,
    currentTruth,
    currentStateText: "canonical current state\n",
    nextTaskText: "canonical next task\n",
    canonicalCurrentStateText: "canonical current state\n",
    canonicalNextTaskText: "canonical next task\n",
  };
}

test("lifecycle policy and transitions cover normal, exceptional, and deferred convergence [1-4,5-10,18-20,23-27,31,34-36,47-54]", () => {
  assert.deepEqual(validateLifecyclePolicy(policy), { ok: true, findings: [] });
  const normal = ["NO_ACTIVE_TASK", "OWNER_INTENT", "FINITE_TASK_ADMISSION", "AUTHORIZED_IMPLEMENTATION", "FROZEN_CANDIDATE", "NORMAL_MERGE_READY", "MERGED_NORMAL_VERIFIED", "TERMINAL_TRUTH"];
  for (let index = 1; index < normal.length; index += 1) assert.equal(transitionLifecycle(normal[index - 1], normal[index]).ok, true);
  const exceptional = ["NO_ACTIVE_TASK", "OWNER_INTENT", "FINITE_TASK_ADMISSION", "AUTHORIZED_IMPLEMENTATION", "FROZEN_CANDIDATE", EXCEPTIONAL_MERGE_CLASSIFICATION, "TERMINAL_TRUTH"];
  for (let index = 1; index < exceptional.length; index += 1) assert.equal(transitionLifecycle(exceptional[index - 1], exceptional[index]).ok, true);
  const deferred = ["NO_ACTIVE_TASK", "OWNER_INTENT", "FINITE_TASK_ADMISSION", "OWNER_DEFERRED", "TERMINAL_TRUTH"];
  for (let index = 1; index < deferred.length; index += 1) assert.equal(transitionLifecycle(deferred[index - 1], deferred[index]).ok, true);
  assert.equal(transitionLifecycle("NO_ACTIVE_TASK", "AUTHORIZED_IMPLEMENTATION").ok, false);
  assert.equal(transitionLifecycle("TERMINAL_TRUTH", "AUTHORIZED_IMPLEMENTATION").ok, false);
  const beforeAdmission = evaluateLifecycleAuthority({ stage: "OWNER_INTENT" });
  assert.deepEqual(beforeAdmission, { implementation: false, normalMerge: false, exceptionalMerge: false, ...CLOSED_EXTERNAL_AUTHORITY });
  assert.equal(evaluateLifecycleAuthority({ stage: "AUTHORIZED_IMPLEMENTATION", admissionValid: true }).implementation, true);
  assert.equal(evaluateLifecycleAuthority({ stage: "NORMAL_MERGE_READY", admissionValid: true, candidateFrozen: true, qualificationValid: true }).normalMerge, true);
});

test("admission and implementation bindings fail closed under identity and scope mutations [11-17,21-22,24,28-30]", () => {
  const authority = evaluateLifecycleAuthority({ stage: "AUTHORIZED_IMPLEMENTATION", admissionValid: true });
  assert.equal(authority.implementation, true);
  for (const admissionValid of [false, null, undefined, 0, "true"]) assert.equal(evaluateLifecycleAuthority({ stage: "AUTHORIZED_IMPLEMENTATION", admissionValid }).implementation, false);
  assert.equal(evaluateLifecycleAuthority({ stage: "FROZEN_CANDIDATE", admissionValid: true, candidateFrozen: false }).normalMerge, false);
  assert.equal(evaluateLifecycleAuthority({ stage: "NORMAL_MERGE_READY", admissionValid: true, candidateFrozen: true, qualificationValid: false }).normalMerge, false);
});

test("Phase 1 asks applicability separately from result and counts only applicable lanes [8,23,25-27,65-71]", () => {
  const preAdmission = phase1LaneApplicability({ policy, lifecycleStage: "OWNER_INTENT", riskClassification: RISK_CLASSES.ASSURANCE });
  assert.equal(preAdmission.every(({ applicability, result }) => applicability === APPLICABILITY.NOT_APPLICABLE_YET && result === GATE_RESULTS.NOT_RUN), true);
  const applicable = phase1LaneApplicability({ policy, lifecycleStage: "FROZEN_CANDIDATE", riskClassification: RISK_CLASSES.ASSURANCE });
  const names = applicable.filter(({ applicability }) => applicability === APPLICABILITY.APPLICABLE).map(({ name }) => name);
  assert.deepEqual(names.sort(), ["Phase 1 / Autonomous Systems All-Platform Contract", "Phase 1 / Repository Lint", "Phase 1 / TypeScript"].sort());
  const jobs = names.map((name) => ({ name, conclusion: "success" }));
  const aggregate = aggregateApplicablePhase1({ policy, lifecycleStage: "FROZEN_CANDIDATE", riskClassification: RISK_CLASSES.ASSURANCE, jobs });
  assert.deepEqual([aggregate.applicable, aggregate.passed, aggregate.failed, aggregate.deferred, aggregate.mergeAuthorityEligible], [3, 3, 0, 10, true]);
  assert.notEqual(aggregate.passed, aggregate.discovered);
  const failed = aggregateApplicablePhase1({ policy, lifecycleStage: "FROZEN_CANDIDATE", riskClassification: RISK_CLASSES.ASSURANCE, jobs: jobs.map((job, index) => index ? job : { ...job, conclusion: "failure" }) });
  assert.equal(failed.mergeAuthorityEligible, false);
  assert.equal(failed.failed, 1);
  const later = aggregateApplicablePhase1({ policy, lifecycleStage: "NORMAL_MERGE_READY", riskClassification: RISK_CLASSES.ASSURANCE, jobs: [] });
  assert.equal(later.failed, later.applicable);
});

test("historical three lanes inventory retains product checks and defers unfinished companions", () => {
  const historical = policy.phase1.lanes.filter(({ name }) => ["Phase 1 / Cognitive Intelligence Contract", "Phase 1 / Autonomous Systems iOS Contract", "Phase 1 / Autonomous Systems All-Platform Contract"].includes(name));
  assert.equal(historical.length, 3);
  for (const lane of historical) {
    assert.equal(lane.components.some(({ classification }) => classification === "READY_AND_APPLICABLE"), true);
    assert.equal(lane.components.some(({ classification }) => classification === "UNFINISHED_ARCHITECTURE"), true);
  }
});

test("presentation-only risk requires exact boundary proof and high/unknown risk requires hosted security [72-75]", () => {
  const paths = ["app/example.tsx", "components/ui/example.tsx", "tests/example.test.mjs"];
  const source = exactDiff(paths);
  const presentation = classifyDiffRisk({ changedPaths: paths, boundaryAssessment: boundaryAssessment(paths, source), exactDiff: source, policy });
  assert.deepEqual([presentation.classification, presentation.hostedSecurity], [RISK_CLASSES.PRESENTATION, "NOT_APPLICABLE_PRESENTATION_ONLY"]);
  const mutated = boundaryAssessment(paths, source); mutated.boundaries.authSessionAuthority = true;
  assert.equal(classifyDiffRisk({ changedPaths: paths, boundaryAssessment: mutated, exactDiff: source, policy }).hostedSecurity, "HOSTED_SECURITY_REQUIRED");
  const stalePatch = boundaryAssessment(paths, { ...source, patchSha256: digest("b") });
  assert.equal(classifyDiffRisk({ changedPaths: paths, boundaryAssessment: stalePatch, exactDiff: source, policy }).hostedSecurity, "HOSTED_SECURITY_REQUIRED");
  const staleHead = boundaryAssessment(paths, { ...source, headSha: sha("4") });
  assert.equal(classifyDiffRisk({ changedPaths: paths, boundaryAssessment: staleHead, exactDiff: source, policy }).hostedSecurity, "HOSTED_SECURITY_REQUIRED");
  assert.equal(classifyDiffRisk({ changedPaths: paths, boundaryAssessment: boundaryAssessment(paths, source), policy }).hostedSecurity, "HOSTED_SECURITY_REQUIRED");
  assert.equal(classifyDiffRisk({ changedPaths: ["supabase/migrations/example.sql"], policy }).classification, RISK_CLASSES.HIGH);
  assert.equal(classifyDiffRisk({ changedPaths: ["unknown.txt"], policy }).classification, RISK_CLASSES.UNKNOWN);
  assert.equal(classifyDiffRisk({ changedPaths: ["scripts/assurance/example.mjs"], policy }).classification, RISK_CLASSES.ASSURANCE);
});

test("protected PR-scope high-risk domains drive lifecycle risk without allowing unknown paths to ride along", () => {
  const releasePaths = [
    "docs/assurance/tasks/synthetic-release-control-v1.json",
    "docs/release/CONTROL_PLANE_RUNBOOK.md",
    "scripts/ios-delivery-control.mjs",
    "scripts/physical-automation-control.mjs",
    "tests/release-control-plane.test.mjs",
  ];
  assert.deepEqual(classifyDiffRisk({ changedPaths: releasePaths, policy, prScopePolicy }), {
    classification: RISK_CLASSES.HIGH,
    hostedSecurity: "HOSTED_SECURITY_REQUIRED",
    findings: [],
  });
  const malformed = structuredClone(prScopePolicy);
  malformed.contractId = "forged-pr-scope-policy";
  assert.equal(classifyDiffRisk({ changedPaths: releasePaths, policy, prScopePolicy: malformed }).classification, RISK_CLASSES.UNKNOWN);
  assert.equal(classifyDiffRisk({ changedPaths: [...releasePaths, "unregistered/runtime-boundary.bin"], policy, prScopePolicy }).classification, RISK_CLASSES.UNKNOWN);
  assert.equal(classifyDiffRisk({ changedPaths: ["scripts/ios-delivery-control.mjs"], policy, prScopePolicy }).classification, RISK_CLASSES.UNKNOWN);
  assert.equal(classifyDiffRisk({ changedPaths: ["docs/release/CONTROL_PLANE_RUNBOOK.md", "app/(auth)/login.tsx"], policy, prScopePolicy }).classification, RISK_CLASSES.HIGH);
  const downgraded = structuredClone(prScopePolicy);
  downgraded.domains.find(({ id }) => id === "release-OTA").risk = "medium";
  assert.equal(classifyDiffRisk({ changedPaths: releasePaths, policy, prScopePolicy: downgraded }).classification, RISK_CLASSES.UNKNOWN);
});

test("authenticated generated current-truth companions classify as assurance-control high risk", () => {
  const fixture = canonicalCompanionFixture();
  const authorized = authorizeCanonicalGeneratedAssuranceCompanionTransition(fixture);
  assert.deepEqual([authorized.ok, authorized.findings], [true, []]);
  const risk = classifyDiffRisk({ changedPaths: fixture.changedPaths, exactDiff: fixture.exactDiff, assuranceTransitionContext: authorized.context, policy });
  assert.deepEqual(risk, { classification: RISK_CLASSES.ASSURANCE, hostedSecurity: "HOSTED_SECURITY_REQUIRED", findings: [] });
  assert.notEqual(risk.classification, RISK_CLASSES.PRESENTATION);
});

test("authenticated generated companions accept a verified rolling protected-main base without weakening task identity", () => {
  const fixture = canonicalCompanionFixture();
  const checkpoint = sha("b");
  fixture.currentTruth.mainSha = checkpoint;
  fixture.currentTruth.protectedMainAuthority.checkpointSha = checkpoint;
  fixture.protectedMainLineage = {
    checkpointSha: checkpoint,
    checkpointTree: fixture.currentTruth.protectedMainAuthority.checkpointTree,
    observedProtectedMainSha: fixture.exactDiff.baseSha,
    mainRelation: "PROTECTED_MAIN_ADVANCED",
    currentTruthStatus: "CURRENT",
    authorityCheckpointEligible: true,
    authorityControlEligible: true,
    pendingTransitionCount: 0,
    activeTaskModelInvalidated: false,
    activeTaskInputsInvalidated: [],
    protectedAdvancementChainHash: digest("c"),
    findings: [],
  };
  assert.equal(authorizeCanonicalGeneratedAssuranceCompanionTransition(fixture).ok, true);
  for (const [name, mutate] of [
    ["wrong observed base", (value) => { value.protectedMainLineage.observedProtectedMainSha = sha("d"); }],
    ["broken checkpoint", (value) => { value.protectedMainLineage.checkpointSha = sha("e"); }],
    ["pending transition", (value) => { value.protectedMainLineage.pendingTransitionCount = 1; }],
    ["task input invalidation", (value) => { value.protectedMainLineage.activeTaskInputsInvalidated = ["package.json"]; }],
    ["unresolved lineage finding", (value) => { value.protectedMainLineage.findings = ["CURRENT_TRUTH_PROTECTED_MAIN_CHAIN_INVALID"]; }],
  ]) {
    const candidate = structuredClone(fixture);
    mutate(candidate);
    assert.equal(authorizeCanonicalGeneratedAssuranceCompanionTransition(candidate).ok, false, name);
  }
});

test("generated companion mutations and forged contexts remain UNKNOWN_RISK", () => {
  const mutations = [
    ["manual CURRENT_STATE edit", (value) => { value.currentStateText = "manual edit\n"; }],
    ["manual NEXT_TASK edit", (value) => { value.nextTaskText = "manual edit\n"; }],
    ["noncanonical current-state generation", (value) => { value.canonicalCurrentStateText = "different canonical output\n"; }],
    ["noncanonical next-task generation", (value) => { value.canonicalNextTaskText = "different canonical output\n"; }],
    ["missing companion", (value) => {
      value.changedPaths = value.changedPaths.filter((file) => file !== "NEXT_TASK.md");
      value.exactDiff = exactDiff(value.changedPaths);
    }],
    ["product-path mixing", (value) => {
      value.changedPaths = [...value.changedPaths, "app/example.tsx"];
      value.exactDiff = exactDiff(value.changedPaths);
    }],
    ["wrong task identity", (value) => { value.currentTruth.activeTaskBinding.implementationBindingId = "different-task"; }],
    ["wrong protected admission PR", (value) => { value.currentTruth.finiteTaskLeases.tasks[0].protectedAdmissionPr += 1; }],
    ["wrong authority type", (value) => { value.sourceAuthorityProof.authorityType = "FINITE_TASK_IMPLEMENTATION"; }],
    ["wrong authority producer", (value) => { value.sourceAuthorityProof.producer = "UNTRUSTED"; }],
    ["wrong authority head", (value) => { value.sourceAuthorityProof.headSha = sha("0"); }],
    ["wrong repository", (value) => { value.sourceAuthorityProof.repository = "example/other"; }],
  ];
  for (const [name, mutate] of mutations) {
    const fixture = canonicalCompanionFixture();
    mutate(fixture);
    const authorized = authorizeCanonicalGeneratedAssuranceCompanionTransition(fixture);
    assert.equal(authorized.ok, false, name);
    const risk = classifyDiffRisk({ changedPaths: fixture.changedPaths, exactDiff: fixture.exactDiff, assuranceTransitionContext: authorized.context, policy });
    assert.equal(risk.classification, RISK_CLASSES.UNKNOWN, name);
    assert.equal(risk.hostedSecurity, "HOSTED_SECURITY_REQUIRED", name);
  }

  const fixture = canonicalCompanionFixture();
  const real = authorizeCanonicalGeneratedAssuranceCompanionTransition(fixture);
  const forged = structuredClone(real.context);
  assert.equal(classifyDiffRisk({ changedPaths: fixture.changedPaths, exactDiff: fixture.exactDiff, assuranceTransitionContext: forged, policy }).classification, RISK_CLASSES.UNKNOWN);

  const changedDiff = { ...fixture.exactDiff, patchSha256: digest("b") };
  assert.equal(classifyDiffRisk({ changedPaths: fixture.changedPaths, exactDiff: changedDiff, assuranceTransitionContext: real.context, policy }).classification, RISK_CLASSES.UNKNOWN);
});

test("assurance self-maintenance is bounded and product mixing remains forbidden [60-64]", () => {
  const valid = validateAssuranceSelfMaintenance({ changedPaths: ["scripts/assurance/example.mjs", "tests/assurance/example.test.mjs"], policy });
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.authority, CLOSED_EXTERNAL_AUTHORITY);
  assert.equal(validateAssuranceSelfMaintenance({ changedPaths: ["scripts/assurance/example.mjs", "app/example.tsx"], policy }).ok, false);
  assert.equal(validateAssuranceSelfMaintenance({ changedPaths: [".github/workflows/phase1-ci.yml.backup"], policy }).ok, false);
  assert.equal(validateAssuranceSelfMaintenance({ changedPaths: [".agents/skills/chillywood-assurance/SKILL.md.backup"], policy }).ok, false);
  assert.equal(validateAssuranceSelfMaintenance({ changedPaths: ["scripts/assurance/example.mjs"], policy, productAuthority: true }).ok, false);
});

test("exceptional exact-source merge preserves missing normal evidence and releases only the implementation lease [36-49]", () => {
  const fixture = exceptionalFixture();
  const result = validateExceptionalMergeOutcome(fixture.outcome, { lease, ownerReceipt: fixture.receipt, gitEvidence: fixture.gitEvidence, rulesetEvidence: fixture.rulesetEvidence });
  assert.deepEqual(result, { ok: true, findings: [] });
  const rulesetReadback = { id: 18940814, enforcement: "active", bypass_actors: [{ actor_id: 4707730, actor_type: "Integration", bypass_mode: "pull_request" }] };
  assert.deepEqual(authorizeExceptionalMergeOutcome(fixture.outcome, { lease, ownerReceiptReadback: fixture.ownerReceiptReadback, gitEvidence: fixture.gitEvidence, rulesetReadback }), { ok: true, findings: [] });
  assert.deepEqual(fixture.outcome.normalPathEvidence, normalMissing);
  assert.deepEqual(fixture.outcome.authority, CLOSED_EXTERNAL_AUTHORITY);
  const registry = { tasks: [lease], completedLeaseOutcomes: [], exceptionalLeaseOutcomes: [fixture.outcome], deferredLeaseOutcomes: [] };
  assert.equal(terminalLeaseOutcome(registry, lease)?.classification, EXCEPTIONAL_MERGE_CLASSIFICATION);
  const record = { mainSha: sha("1"), activeTaskBinding: { implementationPr: 700 }, finiteTaskLeases: { tasks: [lease], completedLeaseOutcomes: [] }, finiteTaskRuntime: {}, engineeringDoctrine: {}, openImplementationPrs: [{ number: 700 }] };
  const projected = projectExceptionalTerminalTruth(record, fixture.outcome);
  assert.equal(projected.activeTaskBinding, null);
  assert.equal(projected.controlPlaneLifecycle.currentStage, "TERMINAL_TRUTH");
  assert.equal(projected.finiteTaskRuntime.finalEvidence.phase1, false);
});

test("exceptional terminal v3 preserves every independently verified review/security subset without promoting Phase 1 or final-source", () => {
  const rulesetReadback = strictRulesetReadback();
  for (const combination of [
    { review: false, security: false },
    { review: true, security: false },
    { review: false, security: true },
    { review: true, security: true },
  ]) {
    const fixture = exceptionalFixtureV3(combination);
    const structural = validateExceptionalMergeOutcome(fixture.outcome, { lease, ownerReceipt: fixture.ownerReceipt, gitEvidence: fixture.gitEvidence, rulesetEvidence: fixture.rulesetEvidence });
    assert.deepEqual(structural, { ok: true, findings: [] }, JSON.stringify(combination));
    const authorized = authorizeExceptionalMergeOutcome(fixture.outcome, {
      lease,
      ownerReceiptReadback: fixture.ownerReceiptReadback,
      repositoryReviewReadback: fixture.repositoryReviewReadback,
      hostedSecurityReadback: fixture.hostedSecurityReadback,
      gitEvidence: fixture.gitEvidence,
      rulesetReadback,
    });
    assert.deepEqual(authorized, { ok: true, findings: [] }, JSON.stringify(combination));
    assert.equal(fixture.outcome.normalPathEvidence.phase1, "NOT_SUCCESSFUL");
    assert.equal(fixture.outcome.normalPathEvidence.finalSourceReceipt, "NOT_PRODUCED");
    const record = { mainSha: sha("1"), activeTaskBinding: { implementationPr: 700 }, finiteTaskLeases: { tasks: [lease], completedLeaseOutcomes: [] }, finiteTaskRuntime: {}, engineeringDoctrine: {}, openImplementationPrs: [{ number: 700 }] };
    const projected = projectExceptionalTerminalTruth(record, fixture.outcome);
    assert.equal(projected.finiteTaskRuntime.finalEvidence.repositoryReview, combination.review);
    assert.equal(projected.finiteTaskRuntime.finalEvidence.hostedSecurity, combination.security);
    assert.equal(projected.finiteTaskRuntime.finalEvidence.phase1, false);
    assert.equal(projected.finiteTaskRuntime.finalEvidence.ownerReceipt, false);
    assert.equal(projected.controlPlaneLifecycle.mergeAuthority, false);
    assert.deepEqual(projected.finiteTaskRuntime.exceptionalTerminalOutcome.authority, CLOSED_EXTERNAL_AUTHORITY);
  }
});

test("exceptional v3 produced evidence is independently verified and fails closed on stale, incomplete, or blocking proof", () => {
  const rulesetReadback = strictRulesetReadback();
  const authorize = (fixture) => authorizeExceptionalMergeOutcome(fixture.outcome, {
    lease,
    ownerReceiptReadback: fixture.ownerReceiptReadback,
    repositoryReviewReadback: fixture.repositoryReviewReadback,
    hostedSecurityReadback: fixture.hostedSecurityReadback,
    gitEvidence: fixture.gitEvidence,
    rulesetReadback,
  });
  for (const [name, mutate] of [
    ["review missing", (value) => { value.repositoryReviewReadback = null; }],
    ["review wrong source", (value) => { value.repositoryReviewReadback.body = value.repositoryReviewReadback.body.replace(value.outcome.sourceHead, sha("9")); }],
    ["review wrong tree", (value) => { value.repositoryReviewReadback.body = value.repositoryReviewReadback.body.replace(value.outcome.sourceTree, sha("8")); }],
    ["review wrong PR", (value) => { value.repositoryReviewReadback.issue_url = `https://api.github.com/repos/${value.outcome.repository}/issues/701`; }],
    ["review wrong branch", (value) => { value.repositoryReviewReadback.body = value.repositoryReviewReadback.body.replace(value.outcome.implementationBranch, "codex/wrong-branch"); }],
    ["review wrong subject type", (value) => { value.repositoryReviewReadback.body = value.repositoryReviewReadback.body.replace('"type":"REPOSITORY_OWNED_EXACT_HEAD_REVIEW_V1"', '"type":"WRONG_REVIEW_TYPE"'); }],
    ["review edited", (value) => { value.repositoryReviewReadback.updated_at = "2026-01-01T00:00:06Z"; }],
    ["review blocking severity", (value) => { value.repositoryReviewReadback.body = value.repositoryReviewReadback.body.replace('"P0":0', '"P0":1'); }],
    ["security unsealed", (value) => { value.hostedSecurityReadback.manifestText = value.hostedSecurityReadback.manifestText.replace('"sealedAt":"2026-01-01T00:00:10Z"', '"sealedAt":null'); }],
    ["security wrong source", (value) => { value.hostedSecurityReadback.manifestText = value.hostedSecurityReadback.manifestText.replace(value.outcome.sourceHead, sha("9")); }],
    ["security incomplete", (value) => { value.hostedSecurityReadback.manifestText = value.hostedSecurityReadback.manifestText.replace('"status":"completed"', '"status":"running"'); }],
    ["security missing seal digest", (value) => { value.hostedSecurityReadback.manifestText = value.hostedSecurityReadback.manifestText.replace(/codex-security-snapshot\/v1:sha256:[0-9a-f]{64}/u, ""); }],
    ["security finding", (value) => { value.hostedSecurityReadback.findingsText = value.hostedSecurityReadback.findingsText.replace('"findings":[]', '"findings":[{"severity":"high"}]'); }],
    ["security stale artifact", (value) => { value.hostedSecurityReadback.coverageText += " "; }],
  ]) {
    const fixture = exceptionalFixtureV3({ review: true, security: true });
    mutate(fixture);
    assert.equal(authorize(fixture).ok, false, name);
  }
  const phase1 = exceptionalFixtureV3({ review: true, security: true });
  phase1.outcome.normalPathEvidence.phase1 = "PASS";
  assert.equal(validateExceptionalMergeOutcome(phase1.outcome, { lease, ownerReceipt: phase1.ownerReceipt, gitEvidence: phase1.gitEvidence, rulesetEvidence: phase1.rulesetEvidence }).ok, false);
  const finalSource = exceptionalFixtureV3({ review: true, security: true });
  finalSource.outcome.normalPathEvidence.finalSourceReceipt = "PRODUCED_VALID";
  assert.equal(validateExceptionalMergeOutcome(finalSource.outcome, { lease, ownerReceipt: finalSource.ownerReceipt, gitEvidence: finalSource.gitEvidence, rulesetEvidence: finalSource.rulesetEvidence }).ok, false);
  const noStrictProtection = exceptionalFixtureV3({ review: true, security: true });
  assert.equal(authorize(noStrictProtection).ok, true);
  const invalidRuleset = strictRulesetReadback();
  invalidRuleset.rules[0].parameters.strict_required_status_checks_policy = false;
  assert.equal(authorizeExceptionalMergeOutcome(noStrictProtection.outcome, { lease, ownerReceiptReadback: noStrictProtection.ownerReceiptReadback, repositoryReviewReadback: noStrictProtection.repositoryReviewReadback, hostedSecurityReadback: noStrictProtection.hostedSecurityReadback, gitEvidence: noStrictProtection.gitEvidence, rulesetReadback: invalidRuleset }).ok, false);
  const nonMonotonicRulesetHistory = exceptionalFixtureV3({ review: true, security: true });
  nonMonotonicRulesetHistory.outcome.ruleset.evidence.restored.version = nonMonotonicRulesetHistory.outcome.ruleset.evidence.bypass.version;
  assert.equal(validateExceptionalMergeOutcome(nonMonotonicRulesetHistory.outcome, { lease, ownerReceipt: nonMonotonicRulesetHistory.ownerReceipt, gitEvidence: nonMonotonicRulesetHistory.gitEvidence, rulesetEvidence: nonMonotonicRulesetHistory.outcome.ruleset.evidence }).ok, false);
});

test("exceptional merge mutations cannot become authority [37-46,49]", () => {
  const keys = ["implementationPr", "protectedBase", "sourceHead", "sourceTree", "patchSha256", "changedPathSha256", "mergeSha", "mergeTree", "mergeParents", "normalPathEvidence", "hostedSecurity", "authority"];
  for (const key of keys) {
    const fixture = exceptionalFixture();
    if (key === "mergeParents") fixture.outcome[key] = [fixture.outcome.sourceHead, fixture.outcome.protectedBase];
    else if (key === "normalPathEvidence") fixture.outcome[key] = { ...normalMissing, phase1: "PASS" };
    else if (key === "authority") fixture.outcome[key] = { ...CLOSED_EXTERNAL_AUTHORITY, ota: true };
    else if (key === "hostedSecurity") fixture.outcome[key] = "PASS";
    else if (typeof fixture.outcome[key] === "number") fixture.outcome[key] += 1;
    else fixture.outcome[key] = typeof fixture.outcome[key] === "string" && fixture.outcome[key].length === 64 ? digest("0") : sha("0");
    assert.equal(validateExceptionalMergeOutcome(fixture.outcome, { lease, ownerReceipt: fixture.receipt, gitEvidence: fixture.gitEvidence, rulesetEvidence: fixture.rulesetEvidence }).ok, false, key);
  }
  for (const mutation of [
    (value) => { value.receipt.author = "codex-bot"; },
    (value) => { value.receipt.authorAssociation = "MEMBER"; },
    (value) => { value.receipt.updatedAt = "2026-01-01T00:02:00Z"; },
    (value) => { value.rulesetEvidence.restored.onlyIntegration = false; },
    (value) => { value.rulesetEvidence.restored.integrationId = 1; },
  ]) {
    const fixture = exceptionalFixture(); mutation(fixture);
    assert.equal(validateExceptionalMergeOutcome(fixture.outcome, { lease, ownerReceipt: fixture.receipt, gitEvidence: fixture.gitEvidence, rulesetEvidence: fixture.rulesetEvidence }).ok, false);
  }
  const rulesetReadback = { id: 18940814, enforcement: "active", bypass_actors: [{ actor_id: 4707730, actor_type: "Integration", bypass_mode: "pull_request" }] };
  for (const mutation of [
    (value) => { value.ownerReceiptReadback.user.login = "codex-bot"; },
    (value) => { value.ownerReceiptReadback.updated_at = "2026-01-01T00:02:00Z"; },
    (value) => { value.ownerReceiptReadback.body += `\n${EXCEPTIONAL_OWNER_TERMINAL_MARKER}\n{}`; },
    (value) => { value.gitEvidence.sourceTree = sha("0"); },
  ]) {
    const fixture = exceptionalFixture(); mutation(fixture);
    assert.equal(authorizeExceptionalMergeOutcome(fixture.outcome, { lease, ownerReceiptReadback: fixture.ownerReceiptReadback, gitEvidence: fixture.gitEvidence, rulesetReadback }).ok, false);
  }
  const fixture = exceptionalFixture();
  assert.equal(authorizeExceptionalMergeOutcome(fixture.outcome, { lease, ownerReceiptReadback: fixture.ownerReceiptReadback, gitEvidence: fixture.gitEvidence, rulesetReadback: { ...rulesetReadback, bypass_actors: [{ actor_id: 210200794, actor_type: "User", bypass_mode: "pull_request" }] } }).ok, false);
});

test("Owner-deferred terminal truth keeps defects NOT_IMPLEMENTED and releases the lease [50-54]", () => {
  const body = { schemaVersion: 2, classification: "OWNER_DEFERRED", repository: "Chillywood2025/chillywood-mobile", taskId: lease.leaseId, leaseId: lease.leaseId, implementationPr: 700, implementationStatus: "NOT_IMPLEMENTED", defectIds: ["GENERIC-DEFECT-1"], authority: CLOSED_EXTERNAL_AUTHORITY };
  const outcome = { ...body, evidenceHash: lifecycleHash(body) };
  assert.equal(validateDeferredOutcome(outcome, { lease }).ok, true);
  const registry = { tasks: [lease], completedLeaseOutcomes: [], exceptionalLeaseOutcomes: [], deferredLeaseOutcomes: [outcome] };
  assert.equal(terminalLeaseOutcome(registry, lease)?.classification, "OWNER_DEFERRED");
  const forged = { ...outcome, implementationStatus: "PASS" };
  assert.equal(validateDeferredOutcome(forged, { lease }).ok, false);
});

test("ordinary evidence invalidation follows only declared binding dependencies", () => {
  const evidence = [
    { id: "source", dependsOn: ["headSha", "sourceTree"] },
    { id: "owner-intent", dependsOn: ["repository", "taskId"] },
    { id: "provider", dependsOn: ["providerState"] },
  ];
  const previous = { repository: "r", taskId: "t", headSha: sha("1"), sourceTree: sha("2"), providerState: "stable" };
  const next = { ...previous, headSha: sha("3"), sourceTree: sha("4") };
  assert.deepEqual(evidenceInvalidation({ previous, next, evidence }), { changedKeys: ["headSha", "sourceTree"], invalidated: ["source"], reusable: ["owner-intent", "provider"] });
});

test("a bounded assurance installation merge reaches a fixed point [55-59]", () => {
  const fixture = exceptionalFixture();
  const record = projectExceptionalTerminalTruth({ mainSha: sha("1"), activeTaskBinding: {}, finiteTaskLeases: { tasks: [lease], completedLeaseOutcomes: [] }, finiteTaskRuntime: {}, engineeringDoctrine: {}, openImplementationPrs: [] }, fixture.outcome);
  const first = { commit: sha("9"), parents: [record.mainSha, sha("8")], sourceHead: sha("8"), tree: sha("a"), sourceTree: sha("a"), changedPaths: ["scripts/assurance/control-plane-lifecycle.mjs", "tests/assurance/control-plane-lifecycle-v2.test.mjs"] };
  const second = { commit: sha("b"), parents: [first.commit, sha("c")], sourceHead: sha("c"), tree: sha("d"), sourceTree: sha("d"), changedPaths: ["config/assurance/control-plane-lifecycle-v2.json"] };
  assert.equal(fixedPointAcceptsAdvancement({ record, observation: first, policy }).ok, true);
  assert.equal(fixedPointAcceptsAdvancement({ record, observation: second, policy, expectedFirstParent: first.commit }).ok, true);
  assert.equal(fixedPointAcceptsAdvancement({ record, observation: { ...second, parents: [record.mainSha, second.sourceHead] }, policy, expectedFirstParent: first.commit }).ok, false);
  assert.equal(fixedPointAcceptsAdvancement({ record, observation: { ...first, changedPaths: [...first.changedPaths, "app/example.tsx"] }, policy }).ok, false);
});

test("LF/CRLF semantic authority remains canonical while meaningful payload changes differ [83-90]", () => {
  const marker = "<!-- synthetic-owner-receipt-v1 -->";
  const payload = { repository: "Chillywood2025/chillywood-mobile", pr: 700, owner: "Chillywood2025", markerAudit: marker, text: "inside string\nremains meaningful" };
  const parse = (body) => parseCanonicalMarkedComment(body, marker);
  const lf = `${marker}\n${stableLifecycleJson(payload)}`;
  const crlf = `${marker}\r\n${stableLifecycleJson(payload)}\r\n`;
  assert.equal(parse(lf).ok, true, "a canonical payload may audit its marker as JSON string data");
  assert.deepEqual(parse(lf).payload, parse(crlf).payload);
  assert.equal(parse(lf).canonicalBodyHash, parse(crlf).canonicalBodyHash);
  assert.equal(parse(lf.replace(marker, `${marker}-changed`)).ok, false);
  assert.equal(parse(`${marker}\n{malformed`).ok, false);
  assert.equal(parse(`${lf}\n${marker}\n${stableLifecycleJson(payload)}`).ok, false);
  assert.notEqual(lifecycleHash(payload), lifecycleHash({ ...payload, pr: 701 }));
  assert.notEqual(lifecycleHash(payload), lifecycleHash({ ...payload, owner: "bot" }));
  assert.notEqual(lifecycleHash(payload), lifecycleHash({ ...payload, text: "inside string remains meaningful" }));
});
