#!/usr/bin/env node
import assert from "node:assert/strict";
import { validateEngineeringDoctrineTruth, validateOwnerJurisdictionPolicyTruth, verifyCurrentTruthSynchronization } from "../../scripts/assurance/lib.mjs";
import { STANDING_POLICY_INHERITANCE_ALLOWLIST, STANDING_POLICY_INHERITANCE_DENYLIST } from "../../scripts/assurance/jurisdiction-policy.mjs";

const recordedMain = "a".repeat(40);
const remoteMain = "b".repeat(40);
const requiredChangedPaths = [
  "config/assurance/current-truth-v1.json",
  "CURRENT_STATE.md",
  "NEXT_TASK.md"
];
const allowedChangedPaths = [
  ...requiredChangedPaths
];
const bootstrapChangedPaths = [...requiredChangedPaths, "scripts/assurance/lib.mjs"];
const bootstrapMerge = {
  mergeSha: remoteMain,
  firstParent: recordedMain,
  changedPaths: bootstrapChangedPaths
};
const verify = (overrides = {}) => verifyCurrentTruthSynchronization({
  recordedMain,
  remoteMain,
  parents: [recordedMain, "c".repeat(40)],
  changedPaths: requiredChangedPaths,
  requiredChangedPaths,
  allowedChangedPaths,
  bootstrapMerge,
  ...overrides
});

assert.deepEqual(verify({ remoteMain: recordedMain }), { ok: true, mode: "exact-main" });
assert.equal(verify().ok, true);
assert.equal(verify({ changedPaths: bootstrapChangedPaths }).ok, true);
assert.equal(verify({ changedPaths: bootstrapChangedPaths, remoteMain: "e".repeat(40) }).ok, false);
assert.equal(verify({ changedPaths: [...bootstrapChangedPaths, "app/index.tsx"] }).ok, false);
assert.equal(verify({ parents: [recordedMain] }).ok, false);
assert.equal(verify({ parents: ["d".repeat(40), "c".repeat(40)] }).ok, false);
assert.equal(verify({ changedPaths: requiredChangedPaths.slice(1) }).ok, false);
assert.equal(verify({ changedPaths: [...requiredChangedPaths, "app/index.tsx"] }).ok, false);

const truthContract = JSON.parse((await import("node:fs")).readFileSync("config/assurance/current-truth-contract-v1.json", "utf8"));
const truthRecord = JSON.parse((await import("node:fs")).readFileSync("config/assurance/current-truth-v1.json", "utf8"));
const schemas = JSON.parse((await import("node:fs")).readFileSync("config/assurance/schemas-v1.json", "utf8"));
assert.equal(validateEngineeringDoctrineTruth({}, truthContract, { currentMain: "8bf6459c3ae1cec62e26a1694f03063e4291b9f8", implementationMerged: false }).length, 0);
assert.equal(validateEngineeringDoctrineTruth({}, truthContract).some(({ id }) => id === "ASSURANCE_ENGINEERING_DOCTRINE_MISSING"), true);
assert.equal(validateEngineeringDoctrineTruth({}, truthContract, { currentMain: "f".repeat(40), implementationMerged: true }).some(({ id }) => id === "ASSURANCE_ENGINEERING_DOCTRINE_MISSING"), true);
assert.equal(validateEngineeringDoctrineTruth({ engineeringDoctrine: { status: "ACTIVE", boundedDefinition: "COMPLETE" } }, truthContract).some(({ id }) => id === "ASSURANCE_UNIVERSAL_COMPLETENESS_CLAIM_REJECTED"), true);
assert.deepEqual(truthContract.engineeringDoctrinePolicy.postMergeTruthPaths, requiredChangedPaths);
assert.equal(truthContract.engineeringDoctrinePolicy.postMergeNextTask, "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE");

assert.deepEqual(validateOwnerJurisdictionPolicyTruth(truthRecord, truthContract), []);
const capabilityMutation = structuredClone(truthRecord);
capabilityMutation.ownerJurisdictionPolicyCapability.domainCoverageReusable = true;
assert.equal(validateOwnerJurisdictionPolicyTruth(capabilityMutation, truthContract).some(({ id }) => id === "ASSURANCE_OWNER_JURISDICTION_CAPABILITY_INVALID"), true);

const hash = "1".repeat(64);
const otherHash = "2".repeat(64);
const validPolicyBinding = {
  schemaVersion: 2,
  contract: "OWNER_JURISDICTION_POLICY_BINDING_V2",
  repository: "Chillywood2025/chillywood-mobile",
  product: "chillywood-mobile",
  launchProgram: "united-states-pre-release",
  policySource: {
    commentId: 1,
    referenceScope: "TASK_BOUND_COMPOSITE",
    decisionVersion: "OWNER_JURISDICTION_DECISION_V2",
    standingPolicyType: "OWNER_JURISDICTION_STANDING_POLICY_V2",
    standingPolicyVersion: 2,
    status: "ACTIVE_UNTIL_OWNER_SUPERSESSION_OR_REVOCATION",
    sequence: 0,
    subjectHash: hash,
    bodyHash: otherHash,
    standingPolicyHash: hash,
    envelopeHash: otherHash,
  },
  taskBinding: {
    taskId: "pre-release-fixture",
    prNumber: 229,
    planningHead: "a".repeat(40),
    planningTree: "b".repeat(40),
    standingPolicyCommentId: 1,
    standingPolicyHash: hash,
    bindingType: "OWNER_JURISDICTION_TASK_BINDING_V2",
    bindingVersion: 2,
    domainIds: ["auth-session-password-recovery", "notifications-fcm"],
    bindingHash: otherHash,
    conflictStatus: "NONE",
  },
  coverage: {
    status: "EXACT_TASK_DOMAINS_BOUND",
    coveredDomainIds: ["auth-session-password-recovery", "notifications-fcm"],
    coveredCount: 2,
    unresolvedDomainIds: [],
  },
  externalProofInherited: false,
  operationalOwnershipPreserved: true,
  authority: {
    productMutation: false,
    providerMutation: false,
    databaseDeployment: false,
    build: false,
    submission: false,
    ota: false,
    publicRelease: false,
  },
};
const withBinding = structuredClone(truthRecord);
withBinding.ownerJurisdictionPolicyBinding = validPolicyBinding;
assert.deepEqual(validateOwnerJurisdictionPolicyTruth(withBinding, truthContract), []);
const activePartialCoverage = structuredClone(withBinding);
activePartialCoverage.ownerJurisdictionPolicyBinding.coverage.coveredDomainIds = ["auth-session-password-recovery"];
activePartialCoverage.ownerJurisdictionPolicyBinding.coverage.coveredCount = 1;
activePartialCoverage.ownerJurisdictionPolicyBinding.coverage.unresolvedDomainIds = ["notifications-fcm"];
assert.notDeepEqual(validateOwnerJurisdictionPolicyTruth(activePartialCoverage, truthContract), []);
const activeConflict = structuredClone(withBinding);
activeConflict.ownerJurisdictionPolicyBinding.taskBinding.conflictStatus = "REQUIRES_NEW_OWNER_DECISION";
assert.notDeepEqual(validateOwnerJurisdictionPolicyTruth(activeConflict, truthContract), []);

const ineligibleBinding = (status) => {
  const candidate = structuredClone(withBinding);
  candidate.ownerJurisdictionPolicyBinding.policySource.decisionVersion = "OWNER_JURISDICTION_POLICY_CHAIN_DECISION_V2";
  candidate.ownerJurisdictionPolicyBinding.policySource.status = status;
  candidate.ownerJurisdictionPolicyBinding.policySource.sequence = 1;
  candidate.ownerJurisdictionPolicyBinding.taskBinding.conflictStatus = "REQUIRES_NEW_OWNER_DECISION";
  candidate.ownerJurisdictionPolicyBinding.coverage = {
    status: "INELIGIBLE_REEVALUATION_REQUIRED",
    coveredDomainIds: [],
    coveredCount: 0,
    unresolvedDomainIds: [...candidate.ownerJurisdictionPolicyBinding.taskBinding.domainIds],
  };
  return candidate;
};
for (const status of ["SUPERSEDED_REEVALUATION_REQUIRED", "REVOKED_NO_AUTHORITY"]) {
  const candidate = ineligibleBinding(status);
  assert.deepEqual(validateOwnerJurisdictionPolicyTruth(candidate, truthContract), []);
  const retainedCoverage = structuredClone(candidate);
  retainedCoverage.ownerJurisdictionPolicyBinding.coverage.coveredDomainIds = [...retainedCoverage.ownerJurisdictionPolicyBinding.taskBinding.domainIds];
  retainedCoverage.ownerJurisdictionPolicyBinding.coverage.coveredCount = retainedCoverage.ownerJurisdictionPolicyBinding.taskBinding.domainIds.length;
  assert.notDeepEqual(validateOwnerJurisdictionPolicyTruth(retainedCoverage, truthContract), []);
  const missingUnresolved = structuredClone(candidate);
  missingUnresolved.ownerJurisdictionPolicyBinding.coverage.unresolvedDomainIds = [];
  assert.notDeepEqual(validateOwnerJurisdictionPolicyTruth(missingUnresolved, truthContract), []);
  const noConflict = structuredClone(candidate);
  noConflict.ownerJurisdictionPolicyBinding.taskBinding.conflictStatus = "NONE";
  assert.notDeepEqual(validateOwnerJurisdictionPolicyTruth(noConflict, truthContract), []);
}
const completedHistoricalProjection = structuredClone(withBinding); completedHistoricalProjection.ownerJurisdictionPolicyBinding.policySource.status = "HISTORICAL_COMPLETED_TASK"; assert.notDeepEqual(validateOwnerJurisdictionPolicyTruth(completedHistoricalProjection, truthContract), []); delete completedHistoricalProjection.ownerJurisdictionPolicyBinding; assert.deepEqual(validateOwnerJurisdictionPolicyTruth(completedHistoricalProjection, truthContract), []);
for (const mutate of [
  (value) => { value.taskBinding.domainIds = ["*"]; value.coverage.coveredDomainIds = ["*"]; value.coverage.coveredCount = 1; },
  (value) => { value.taskBinding.domainIds = ["notifications-fcm", "notifications-fcm"]; value.coverage.coveredDomainIds = [...value.taskBinding.domainIds]; },
  (value) => { value.coverage.coveredCount = 1; },
  (value) => { value.policySource.policyBody = {}; },
  (value) => { value.taskBinding.standingPolicyHash = otherHash; },
  (value) => { value.externalProofInherited = true; },
  (value) => { value.operationalOwnershipPreserved = false; },
  (value) => { value.authority.build = true; },
]) {
  const candidate = structuredClone(withBinding);
  mutate(candidate.ownerJurisdictionPolicyBinding);
  assert.notDeepEqual(validateOwnerJurisdictionPolicyTruth(candidate, truthContract), []);
}
assert.deepEqual(schemas.$defs.ownerJurisdictionPolicyCapability.const, truthContract.ownerJurisdictionPolicyCapability);
assert.deepEqual(truthContract.ownerJurisdictionPolicyCapability.inheritanceAllowlist, [...STANDING_POLICY_INHERITANCE_ALLOWLIST]);
assert.deepEqual(truthContract.ownerJurisdictionPolicyCapability.inheritanceDenylist, [...STANDING_POLICY_INHERITANCE_DENYLIST]);
assert.equal(truthContract.rollingProtectedMain.authorityControlPaths.includes("scripts/assurance/jurisdiction-policy.mjs"), true);
assert.equal(schemas.$defs.ownerJurisdictionPolicyBinding.additionalProperties, false);
assert.deepEqual(schemas.$defs.ownerJurisdictionPolicyBinding.properties.policySource.properties.decisionVersion.enum, ["OWNER_JURISDICTION_DECISION_V2", "OWNER_JURISDICTION_POLICY_CHAIN_DECISION_V2"]);
assert.equal(schemas.$defs.ownerJurisdictionPolicyBinding.properties.coverage.properties.coveredDomainIds.minItems, undefined);
assert.deepEqual(schemas.$defs.finiteTaskAdmissionSupersessionV2.properties.predecessor.properties.version.enum, [1, 2]);
assert.equal(JSON.stringify(schemas.$defs.ownerJurisdictionPolicyBinding).includes("standingPolicyBody"), false);

process.stdout.write("current-truth synchronization contract: PASS (44 cases)\n");
