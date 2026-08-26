#!/usr/bin/env node
import assert from "node:assert/strict";
import { finiteTaskEffectiveReservationAuthorityValid, resolveFiniteTaskEffectiveReservation, stableJson, validateEngineeringDoctrineTruth, validateFiniteTaskLeaseRegistry, validateOwnerJurisdictionPolicyTruth, verifyCurrentTruthSynchronization } from "../../scripts/assurance/lib.mjs";
import { architectureDependencyBaselinePolicyV1 } from "../../scripts/assurance/engineering-closure.mjs";
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
const prScopePolicy = JSON.parse((await import("node:fs")).readFileSync("config/assurance/pr-scope-policy-v1.json", "utf8"));
const featureRegistry = JSON.parse((await import("node:fs")).readFileSync("config/assurance/feature-registry-v1.json", "utf8"));
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
assert.deepEqual(
  [
    "config/assurance/pr-scope-policy-v1.json",
    "scripts/assurance/pr-scope-lib.mjs",
    "scripts/assurance/pr-scope.mjs",
  ].filter((file) => !truthContract.rollingProtectedMain.authorityControlPaths.includes(file)),
  []
);
assert.equal(schemas.$defs.ownerJurisdictionPolicyBinding.additionalProperties, false);
assert.deepEqual(schemas.$defs.ownerJurisdictionPolicyBinding.properties.policySource.properties.decisionVersion.enum, ["OWNER_JURISDICTION_DECISION_V2", "OWNER_JURISDICTION_POLICY_CHAIN_DECISION_V2"]);
assert.equal(schemas.$defs.ownerJurisdictionPolicyBinding.properties.coverage.properties.coveredDomainIds.minItems, undefined);
assert.deepEqual(schemas.$defs.finiteTaskAdmissionSupersessionV2.properties.predecessor.properties.version.enum, [1, 2]);
assert.equal(JSON.stringify(schemas.$defs.ownerJurisdictionPolicyBinding).includes("standingPolicyBody"), false);

const dependencyBaselinePolicy = truthContract.architectureDependencyBaselineAmendmentPolicy;
const dependencyBaselinePolicySchema = schemas.$defs.currentTruthContract.properties.architectureDependencyBaselineAmendmentPolicy;
const dependencyPolicyValid = (contract) => !Object.hasOwn(contract, "architectureDependencyBaselineAmendmentPolicy")
  ? !schemas.$defs.currentTruthContract.required.includes("architectureDependencyBaselineAmendmentPolicy")
  : stableJson(contract.architectureDependencyBaselineAmendmentPolicy) === stableJson(dependencyBaselinePolicySchema.const);
assert.deepEqual(dependencyBaselinePolicy, architectureDependencyBaselinePolicyV1);
assert.deepEqual(dependencyBaselinePolicySchema.const, architectureDependencyBaselinePolicyV1);
assert.equal(schemas.$defs.currentTruthContract.required.includes("architectureDependencyBaselineAmendmentPolicy"), false);
assert.equal(dependencyPolicyValid(truthContract), true);
const historicalNoDependencyBaselinePolicy = structuredClone(truthContract);
delete historicalNoDependencyBaselinePolicy.architectureDependencyBaselineAmendmentPolicy;
assert.equal(dependencyPolicyValid(historicalNoDependencyBaselinePolicy), true);
for (const mutate of [
  (value) => { value.maximumFinalFiles = 16; },
  (value) => { value.maximumFinalNetLines = 4501; },
  (value) => { value.exactAddedPaths[0] = "package*.json"; },
  (value) => { value.exactAddedPaths.push("app.json"); },
  (value) => { value.sameMajorMinorPatchOnly = false; },
  (value) => { value.reactOrReactNativeMayChange = true; },
  (value) => { value.authority.build = true; },
]) {
  const malformed = structuredClone(truthContract);
  mutate(malformed.architectureDependencyBaselineAmendmentPolicy);
  assert.equal(dependencyPolicyValid(malformed), false);
}

const overlayContract = truthContract.finiteTaskTestAdaptationOverlayPolicy;
const overlayPolicy = truthRecord.finiteTaskLeases.testAdaptationPolicy;
const overlayPolicySchema = schemas.$defs.currentTruthRecord.properties.finiteTaskLeases.properties.testAdaptationPolicy;
assert.deepEqual(validateFiniteTaskLeaseRegistry(truthRecord.finiteTaskLeases), []);
assert.deepEqual(schemas.$defs.currentTruthContract.properties.finiteTaskTestAdaptationOverlayPolicy.const, overlayContract);
assert.equal(schemas.$defs.currentTruthContract.required.includes("finiteTaskTestAdaptationOverlayPolicy"), false);
assert.equal(schemas.$defs.currentTruthRecord.properties.finiteTaskLeases.required.includes("testAdaptationPolicy"), false);
assert.equal(overlayPolicySchema.additionalProperties, false);
assert.equal(overlayPolicy.capability, overlayContract.capability);
assert.equal(overlayPolicy.policyId, overlayContract.policyId);
assert.equal(overlayPolicy.classification, overlayContract.classification);
assert.equal(overlayPolicy.maximumFiles, overlayContract.maximumFiles);
assert.equal(overlayPolicy.maximumChangedLines, overlayContract.maximumCanonicalChangedLines);
assert.deepEqual(overlayPolicy.fixtureRoots, overlayContract.fixtureClass.roots);
assert.deepEqual(overlayPolicy.fixtureExtensions, overlayContract.fixtureClass.extensions);
assert.equal(overlayContract.fixtureClass.assertionContract, "EXACTLY_ONE_EXECUTABLE_PGTAP_PLAN_DECLARATION_PRESERVED");
assert.equal(overlayPolicy.liveEffectiveAmendmentReceiptRequired, true);
assert.equal(overlayPolicy.ordinaryAmendmentUsePreserved, true);
assert.equal(overlayContract.implementationPartitionSource, "VERIFIED_LIVE_EFFECTIVE_AMENDMENT_RESERVATION");
assert.equal(overlayContract.liveEffectiveAmendmentReceiptRequired, true);
assert.equal(overlayContract.ordinaryAmendmentUsePreserved, true);
assert.deepEqual(overlayPolicy.authority, overlayContract.authority);
assert.deepEqual(overlayContract.partitionAccounting, {
  implementationAndFixtureBudgetsIndependent: true,
  budgetPoolingAllowed: false,
  pathOverlapAllowed: false,
  binaryOrMalformedNumstatAllowed: false,
  aggregateProjectionCompatibilityOnly: true,
});
assert.deepEqual(overlayContract.canonicalConsumerSet, [
  "current-truth",
  "active-task",
  "engineering-closure",
  "pr-scope",
  "exact-head-repository-review",
  "final-source-attestation",
  "merge-eligibility",
  "merge-provenance",
  "post-merge-readback",
  "terminal-truth",
]);
const projectionPolicy = overlayContract.finiteTaskFeatureRiskProjection;
assert.deepEqual(projectionPolicy, prScopePolicy.finiteTaskFeatureRiskProjection);
assert.equal(projectionPolicy.contractId, "FINITE_TASK_FEATURE_TO_PR_RISK_PROJECTION_V1");
assert.equal(projectionPolicy.classification, "ACTIVE_FINITE_TASK_PR_RISK_AUTHORITY_V1");
assert.equal(projectionPolicy.projectionSource, "VERIFIED_IMMUTABLE_FINITE_TASK_AUTHORITY");
assert.equal(projectionPolicy.policySource, "PROTECTED_PR_SCOPE_POLICY_FINITE_TASK_FEATURE_RISK_PROJECTION");
assert.equal(projectionPolicy.currentDiffCreatesAuthority, false);
assert.equal(projectionPolicy.callerInputCreatesAuthority, false);
assert.equal(projectionPolicy.wildcardOrUniversalAuthorityAllowed, false);
assert.equal(projectionPolicy.unauthorizedObservedHighRiskFailsClosed, true);
assert.equal(projectionPolicy.pathReservationRequiredIndependently, true);
const registeredFeatureIds = new Set(featureRegistry.features.map(({ featureId }) => featureId));
const highRiskDomainIds = new Set(prScopePolicy.domains.filter(({ risk }) => risk === "high").map(({ id }) => id));
const mappedFeatureIds = projectionPolicy.featureRiskMappings.map(({ featureId }) => featureId);
assert.equal(new Set(mappedFeatureIds).size, mappedFeatureIds.length);
assert.equal(projectionPolicy.featureRiskMappings.every(({ featureId, authorizedPrRiskDomains }) => registeredFeatureIds.has(featureId)
  && authorizedPrRiskDomains.length > 0
  && authorizedPrRiskDomains.length < highRiskDomainIds.size
  && authorizedPrRiskDomains.every((domain) => domain !== "*" && highRiskDomainIds.has(domain))), true);
assert.equal(new Set(projectionPolicy.featureRiskMappings.flatMap(({ authorizedPrRiskDomains }) => authorizedPrRiskDomains)).size < highRiskDomainIds.size, true);
assert.deepEqual(schemas.$defs.currentTruthContract.properties.finiteTaskTestAdaptationOverlayPolicy.const, overlayContract);
assert.equal(schemas.$defs.finiteTaskPrRiskAuthority.additionalProperties, false);
assert.equal(schemas.$defs.finiteTaskPrRiskAuthority.properties.classification.const, projectionPolicy.classification);
assert.equal(schemas.$defs.finiteTaskPrRiskAuthority.properties.projectionSource.const, projectionPolicy.projectionSource);
assert.equal(schemas.$defs.finiteTaskPrRiskAuthority.properties.currentDiffCreatesAuthority.const, false);
assert.equal(schemas.$defs.finiteTaskPrRiskAuthority.properties.unauthorizedObservedPrRiskDomains.maxItems, 0);
assert.equal(schemas.$defs.finiteTaskTerminalOutcome.properties.finiteTaskPrRiskAuthority.$ref, "#/$defs/finiteTaskPrRiskAuthority");
assert.equal(schemas.$defs.finiteTaskTerminalOutcome.allOf[0].then.required.includes("finiteTaskPrRiskAuthority"), true);
assert.equal(schemas.$defs.finiteTaskTerminalOutcome.allOf[0].else.not.anyOf.some(({ required }) => required?.includes("finiteTaskPrRiskAuthority")), true);
assert.ok(schemas.$defs.finiteTaskTerminalOutcome.properties.classification.enum.includes("FINITE_TASK_BASE_ONLY_POST_MERGE_TERMINAL_EVIDENCE_V1"));
assert.ok(schemas.$defs.finiteTaskTerminalOutcome.properties.amendmentReceipt.oneOf.some(({ type }) => type === "null"));
assert.ok(schemas.$defs.finiteTaskTerminalOutcome.properties.finalSourceReceipt.properties.amendmentCommentId.oneOf.some(({ type }) => type === "null"));
assert.equal(schemas.$defs.finiteTaskTerminalOutcome.allOf[1].if.properties.classification.const, "FINITE_TASK_BASE_ONLY_POST_MERGE_TERMINAL_EVIDENCE_V1");
const finiteTaskLeaseSchema = schemas.$defs.currentTruthRecord.properties.finiteTaskLeases.properties.tasks.items;
assert.deepEqual(finiteTaskLeaseSchema.allOf[0].if, { required: ["amendmentMaximum"] });
assert.ok(finiteTaskLeaseSchema.allOf[0].then.required.includes("artifactReservation"));
const malformedProjectionPolicy = structuredClone(projectionPolicy);
malformedProjectionPolicy.currentDiffCreatesAuthority = true;
assert.notDeepEqual(malformedProjectionPolicy, prScopePolicy.finiteTaskFeatureRiskProjection);
const invalidOverlayRegistry = structuredClone(truthRecord.finiteTaskLeases);
invalidOverlayRegistry.testAdaptationPolicy.maximumFiles = 2;
assert.equal(validateFiniteTaskLeaseRegistry(invalidOverlayRegistry).includes("FINITE_TASK_TEST_ADAPTATION_POLICY_MALFORMED"), true);
const historicalNoOverlayRegistry = structuredClone(truthRecord.finiteTaskLeases);
delete historicalNoOverlayRegistry.testAdaptationPolicy;
historicalNoOverlayRegistry.completedLeaseOutcomes = [];
assert.deepEqual(validateFiniteTaskLeaseRegistry(historicalNoOverlayRegistry), []);

const wave1Lease = truthRecord.finiteTaskLeases.tasks.find(({ implementationPr }) => implementationPr === 229);
const baseOnlyRuns = Array.from({ length: 3 }, () => resolveFiniteTaskEffectiveReservation({
  registry: truthRecord.finiteTaskLeases,
  lease: wave1Lease,
  comments: [],
  commentsPaginationComplete: true,
  commits: [],
  commitsPaginationComplete: true,
  requireCompleteDiscovery: true,
  observationMode: "LIVE_GITHUB_COMPLETE_READBACK"
}));
assert.equal(baseOnlyRuns.every(({ ok, status }) => ok && status === "BASE_ONLY"), true);
assert.equal(new Set(baseOnlyRuns.map((result) => stableJson(result))).size, 1);
assert.deepEqual(baseOnlyRuns[0].baseReservation, baseOnlyRuns[0].effectiveReservation);
assert.equal(baseOnlyRuns[0].effectiveReservation.eligiblePathCount, 30);
assert.equal(baseOnlyRuns[0].amendmentReceipt, null);
assert.equal(Object.hasOwn(baseOnlyRuns[0], "aggregateReservation"), false);
assert.equal(Object.hasOwn(baseOnlyRuns[0], "testAdaptationReservation"), false);
assert.equal(Object.hasOwn(baseOnlyRuns[0], "scopePartitions"), false);
assert.equal(Object.hasOwn(baseOnlyRuns[0], "testAdaptationsConsumed"), false);
assert.equal(Object.hasOwn(baseOnlyRuns[0], "testAdaptationReceipt"), false);
assert.deepEqual(baseOnlyRuns[0].authority, {
  providerMutation: false,
  databaseDeployment: false,
  build: false,
  submission: false,
  ota: false,
  publicRelease: false,
  amendmentEffective: false,
  liveReceipt: false
});
assert.equal(finiteTaskEffectiveReservationAuthorityValid(baseOnlyRuns[0]), false);
assert.equal(finiteTaskEffectiveReservationAuthorityValid({ ok: true, status: "AMENDED", authority: { liveReceipt: true } }), false);
const incompleteCommentDiscovery = resolveFiniteTaskEffectiveReservation({
  registry: truthRecord.finiteTaskLeases,
  lease: wave1Lease,
  comments: [],
  commentsPaginationComplete: false,
  commits: [],
  commitsPaginationComplete: true,
  requireCompleteDiscovery: true,
  observationMode: "LIVE_GITHUB_COMPLETE_READBACK"
});
assert.equal(incompleteCommentDiscovery.ok, false);
assert.equal(incompleteCommentDiscovery.findings.includes("FINITE_TASK_LEASE_AMENDMENT_COMMENT_DISCOVERY_INCOMPLETE"), true);
const historicalNoOverlay = resolveFiniteTaskEffectiveReservation({
  registry: historicalNoOverlayRegistry,
  lease: historicalNoOverlayRegistry.tasks.find(({ implementationPr }) => implementationPr === 229),
  comments: [],
  commentsPaginationComplete: true,
  commits: [],
  commitsPaginationComplete: true,
  requireCompleteDiscovery: true,
  observationMode: "LIVE_GITHUB_COMPLETE_READBACK"
});
assert.equal(historicalNoOverlay.ok, true);
assert.equal(historicalNoOverlay.status, "BASE_ONLY");
assert.equal(Object.hasOwn(historicalNoOverlay, "aggregateReservation"), false);
assert.equal(Object.hasOwn(historicalNoOverlay, "testAdaptationReservation"), false);
assert.equal(Object.hasOwn(historicalNoOverlay, "testAdaptationReceipt"), false);
const currentTruthSource = (await import("node:fs")).readFileSync("scripts/assurance/current-truth.mjs", "utf8");
assert.match(currentTruthSource, /effectiveReservationObservation/u);
assert.match(currentTruthSource, /observeLiveFiniteTaskEffectiveReservation/u);
assert.match(currentTruthSource, /baseReservation: finiteTaskRuntime\.baseReservation/u);
assert.match(currentTruthSource, /effectiveReservation: finiteTaskRuntime\.effectiveReservation/u);
assert.match(currentTruthSource, /finiteTaskRuntime\.effectiveReservationResolution\?\.status === "AMENDED_WITH_TEST_ADAPTATION"/u);
assert.match(currentTruthSource, /aggregateReservation: finiteTaskRuntime\.effectiveReservationResolution\.aggregateReservation/u);
assert.match(currentTruthSource, /testAdaptationReservation: finiteTaskRuntime\.effectiveReservationResolution\.testAdaptationReservation/u);
assert.match(currentTruthSource, /scopePartitions: finiteTaskRuntime\.effectiveReservationResolution\.scopePartitions/u);
assert.match(currentTruthSource, /testAdaptationReceipt: finiteTaskRuntime\.effectiveReservationResolution\.testAdaptationReceipt/u);
assert.match(currentTruthSource, /stableJson\(currentTruthContract\.finiteTaskTestAdaptationOverlayPolicy\?\.finiteTaskFeatureRiskProjection\)/u);
assert.match(currentTruthSource, /stableJson\(prScopePolicy\.finiteTaskFeatureRiskProjection\)/u);
assert.match(currentTruthSource, /finiteTaskFinalSourceEligibility\?\.finiteTaskPrRiskAuthority/u);
assert.match(currentTruthSource, /finiteTaskPrRiskAuthorityMatchesResolution\(/u);
assert.match(currentTruthSource, /ASSURANCE_FINITE_TASK_PR_RISK_PROJECTION_POLICY_INVALID/u);
assert.match(currentTruthSource, /ASSURANCE_FINITE_TASK_PR_RISK_AUTHORITY_INVALID/u);
assert.match(currentTruthSource, /stableJson\(currentTruthContract\.architectureDependencyBaselineAmendmentPolicy\) === stableJson\(architectureDependencyBaselinePolicyV1\)/u);
assert.match(currentTruthSource, /ASSURANCE_ARCHITECTURE_DEPENDENCY_BASELINE_POLICY_INVALID/u);

process.stdout.write("current-truth synchronization contract: PASS (generic overlay, dependency baseline policy, and historical compatibility)\n");
