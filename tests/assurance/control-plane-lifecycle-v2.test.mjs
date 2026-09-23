import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  APPLICABILITY,
  CLOSED_EXTERNAL_AUTHORITY,
  EXCEPTIONAL_MERGE_CLASSIFICATION,
  GATE_RESULTS,
  RISK_CLASSES,
  aggregateApplicablePhase1,
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
  validateLifecyclePolicy,
} from "../../scripts/assurance/control-plane-lifecycle.mjs";
import { parseCanonicalMarkedComment } from "../../scripts/assurance/jurisdiction-policy.mjs";

const policy = JSON.parse(fs.readFileSync("config/assurance/control-plane-lifecycle-v2.json", "utf8"));
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
  const receipt = { commentId: 9001, author: "Chillywood2025", authorAssociation: "OWNER", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z", subject, subjectHash: lifecycleHash(subject), bodyHash: digest("7") };
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
  return { outcome, receipt, gitEvidence, rulesetEvidence };
}

function boundaryAssessment(paths, patchSha256 = digest("a")) {
  const boundaries = Object.fromEntries(policy.security.sensitiveBoundaries.map((key) => [key, false]));
  const body = { schemaVersion: 1, classification: "EXACT_DIFF_BOUNDARY_ASSESSMENT_V1", changedPathSha256: lifecycleHash([...paths].sort().join("\n") + "\n"), patchSha256, boundaries };
  return { ...body, assessmentHash: lifecycleHash(body) };
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
  const presentation = classifyDiffRisk({ changedPaths: paths, boundaryAssessment: boundaryAssessment(paths), policy });
  assert.deepEqual([presentation.classification, presentation.hostedSecurity], [RISK_CLASSES.PRESENTATION, "NOT_APPLICABLE_PRESENTATION_ONLY"]);
  const mutated = boundaryAssessment(paths); mutated.boundaries.authSessionAuthority = true;
  assert.equal(classifyDiffRisk({ changedPaths: paths, boundaryAssessment: mutated, policy }).hostedSecurity, "HOSTED_SECURITY_REQUIRED");
  assert.equal(classifyDiffRisk({ changedPaths: ["supabase/migrations/example.sql"], policy }).classification, RISK_CLASSES.HIGH);
  assert.equal(classifyDiffRisk({ changedPaths: ["unknown.txt"], policy }).classification, RISK_CLASSES.UNKNOWN);
  assert.equal(classifyDiffRisk({ changedPaths: ["scripts/assurance/example.mjs"], policy }).classification, RISK_CLASSES.ASSURANCE);
});

test("assurance self-maintenance is bounded and product mixing remains forbidden [60-64]", () => {
  const valid = validateAssuranceSelfMaintenance({ changedPaths: ["scripts/assurance/example.mjs", "tests/assurance/example.test.mjs"], policy });
  assert.equal(valid.ok, true);
  assert.deepEqual(valid.authority, CLOSED_EXTERNAL_AUTHORITY);
  assert.equal(validateAssuranceSelfMaintenance({ changedPaths: ["scripts/assurance/example.mjs", "app/example.tsx"], policy }).ok, false);
  assert.equal(validateAssuranceSelfMaintenance({ changedPaths: ["scripts/assurance/example.mjs"], policy, productAuthority: true }).ok, false);
});

test("exceptional exact-source merge preserves missing normal evidence and releases only the implementation lease [36-49]", () => {
  const fixture = exceptionalFixture();
  const result = validateExceptionalMergeOutcome(fixture.outcome, { lease, ownerReceipt: fixture.receipt, gitEvidence: fixture.gitEvidence, rulesetEvidence: fixture.rulesetEvidence });
  assert.deepEqual(result, { ok: true, findings: [] });
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
