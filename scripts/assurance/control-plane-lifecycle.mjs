import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseCanonicalMarkedComment } from "./jurisdiction-policy.mjs";

export const CONTROL_PLANE_LIFECYCLE_CONTRACT = "ASSURANCE_CONTROL_PLANE_LIFECYCLE_V2";
export const EXCEPTIONAL_MERGE_CLASSIFICATION = "MERGED_BY_EXPLICIT_OWNER_BYPASS_AT_EXACT_FROZEN_SOURCE";
export const OWNER_DEFERRED_CLASSIFICATION = "OWNER_DEFERRED";
export const NORMAL_MERGE_CLASSIFICATION = "MERGED_NORMAL_VERIFIED";
export const EXCEPTIONAL_OWNER_TERMINAL_MARKER = "<!-- chillywood-exceptional-owner-bypass-terminal-v2 -->";

export const LIFECYCLE_STATES = Object.freeze([
  "NO_ACTIVE_TASK", "OWNER_INTENT", "FINITE_TASK_ADMISSION", "AUTHORIZED_IMPLEMENTATION",
  "FROZEN_CANDIDATE", "NORMAL_MERGE_READY", "MERGED_NORMAL_VERIFIED",
  EXCEPTIONAL_MERGE_CLASSIFICATION, OWNER_DEFERRED_CLASSIFICATION, "TERMINAL_TRUTH",
]);

export const APPLICABILITY = Object.freeze({
  APPLICABLE: "APPLICABLE",
  NOT_APPLICABLE_YET: "NOT_APPLICABLE_YET",
  NOT_APPLICABLE_TO_RISK: "NOT_APPLICABLE_TO_RISK",
  DEFERRED_UNFINISHED_ARCHITECTURE: "DEFERRED_UNFINISHED_ARCHITECTURE",
  RETIRED_DUPLICATE: "RETIRED_DUPLICATE",
});

export const GATE_RESULTS = Object.freeze({
  PASS: "PASS", FAIL: "FAIL", NOT_RUN: "NOT_RUN", NOT_PRODUCED: "NOT_PRODUCED",
  HISTORICAL: "HISTORICAL", STALE: "STALE", PENDING: "PENDING",
});

export const RISK_CLASSES = Object.freeze({
  PRESENTATION: "LOW_RISK_PRESENTATION_ONLY",
  ASSURANCE: "ASSURANCE_CONTROL_PLANE_HIGH_RISK",
  HIGH: "SECURITY_SENSITIVE_HIGH_RISK",
  UNKNOWN: "UNKNOWN_RISK",
});

export const CANONICAL_GENERATED_ASSURANCE_COMPANION_PATHS = Object.freeze([
  "CURRENT_STATE.md",
  "NEXT_TASK.md",
  "config/assurance/current-truth-v1.json",
]);

const canonicalGeneratedCompanionRiskContexts = new WeakSet();

const sha40 = /^[0-9a-f]{40}$/u;
const sha256 = /^[0-9a-f]{64}$/u;
const stableValue = (value) => Array.isArray(value)
  ? value.map(stableValue)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
    : value;
export const stableLifecycleJson = (value) => JSON.stringify(stableValue(value));
export const lifecycleHash = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : stableLifecycleJson(value)).digest("hex");

const exactKeys = (value, keys) => value && typeof value === "object"
  && stableLifecycleJson(Object.keys(value).sort()) === stableLifecycleJson([...keys].sort());
const pathMatchesPolicyEntry = (file, entry) => typeof entry === "string"
  && (entry.endsWith("/") ? file.startsWith(entry) : file === entry);
const exactPathSet = (actual, expected) => stableLifecycleJson([...new Set(actual ?? [])].sort()) === stableLifecycleJson([...expected].sort());
const exactDiffIdentityValid = (exactDiff, paths) => exactKeys(exactDiff, ["repository", "implementationPr", "baseSha", "headSha", "sourceTree", "changedPathSha256", "patchSha256"])
  && exactDiff?.repository === "Chillywood2025/chillywood-mobile"
  && Number.isInteger(exactDiff?.implementationPr) && exactDiff.implementationPr > 0
  && [exactDiff?.baseSha, exactDiff?.headSha, exactDiff?.sourceTree].every((value) => sha40.test(value ?? ""))
  && exactDiff?.changedPathSha256 === lifecycleHash([...new Set(paths ?? [])].sort().join("\n") + "\n")
  && sha256.test(exactDiff?.patchSha256 ?? "");
const closedAuthority = Object.freeze({ providerMutation: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false, money: false });
export const CLOSED_EXTERNAL_AUTHORITY = closedAuthority;
const allowedTransition = new Map([
  ["NO_ACTIVE_TASK", new Set(["OWNER_INTENT"])],
  ["OWNER_INTENT", new Set(["FINITE_TASK_ADMISSION", OWNER_DEFERRED_CLASSIFICATION])],
  ["FINITE_TASK_ADMISSION", new Set(["AUTHORIZED_IMPLEMENTATION", OWNER_DEFERRED_CLASSIFICATION])],
  ["AUTHORIZED_IMPLEMENTATION", new Set(["FROZEN_CANDIDATE", OWNER_DEFERRED_CLASSIFICATION])],
  ["FROZEN_CANDIDATE", new Set(["NORMAL_MERGE_READY", EXCEPTIONAL_MERGE_CLASSIFICATION, OWNER_DEFERRED_CLASSIFICATION])],
  ["NORMAL_MERGE_READY", new Set(["MERGED_NORMAL_VERIFIED", EXCEPTIONAL_MERGE_CLASSIFICATION])],
  ["MERGED_NORMAL_VERIFIED", new Set(["TERMINAL_TRUTH"])],
  [EXCEPTIONAL_MERGE_CLASSIFICATION, new Set(["TERMINAL_TRUTH"])],
  [OWNER_DEFERRED_CLASSIFICATION, new Set(["TERMINAL_TRUTH"])],
]);

export function transitionLifecycle(current, next) {
  if (!LIFECYCLE_STATES.includes(current) || !LIFECYCLE_STATES.includes(next)) return { ok: false, state: current, finding: "LIFECYCLE_STATE_INVALID" };
  if (!allowedTransition.get(current)?.has(next)) return { ok: false, state: current, finding: "LIFECYCLE_TRANSITION_INVALID" };
  return { ok: true, state: next, finding: null };
}

export function validateLifecyclePolicy(policy) {
  const findings = [];
  if (policy?.schemaVersion !== 2 || policy?.contractId !== CONTROL_PLANE_LIFECYCLE_CONTRACT || policy?.repository !== "Chillywood2025/chillywood-mobile") findings.push("LIFECYCLE_POLICY_IDENTITY_INVALID");
  if (stableLifecycleJson(policy?.states) !== stableLifecycleJson(LIFECYCLE_STATES)) findings.push("LIFECYCLE_POLICY_STATES_INVALID");
  const lanes = policy?.phase1?.lanes ?? [];
  if (lanes.length !== 13 || new Set(lanes.map(({ name }) => name)).size !== 13) findings.push("LIFECYCLE_PHASE1_LANES_INVALID");
  if (stableLifecycleJson(policy?.exceptionalMerge?.authority) !== stableLifecycleJson(closedAuthority)) findings.push("LIFECYCLE_EXCEPTIONAL_AUTHORITY_INVALID");
  return { ok: findings.length === 0, findings };
}

/**
 * Authenticates the otherwise-unclassified root generated companions as one
 * finite-task admission/current-truth transition. The returned context is an
 * in-process capability: callers cannot construct an equivalent plain object
 * and use it to influence risk classification.
 *
 * Canonical rendering is deliberately supplied by the current-truth engine,
 * which owns renderCurrentState/renderNextTask. This module verifies the
 * authenticated transition and exact byte equality without duplicating those
 * renderers or turning the two root documents into general assurance roots.
 */
export function authorizeCanonicalGeneratedAssuranceCompanionTransition({
  changedPaths = [],
  exactDiff = null,
  sourceAuthorityProof = null,
  currentTruth = null,
  currentStateText = null,
  nextTaskText = null,
  canonicalCurrentStateText = null,
  canonicalNextTaskText = null,
} = {}) {
  const findings = [];
  const paths = [...new Set(changedPaths)].sort();
  if (!exactPathSet(paths, CANONICAL_GENERATED_ASSURANCE_COMPANION_PATHS)) findings.push("CANONICAL_GENERATED_COMPANION_SCOPE_INVALID");
  if (!exactDiffIdentityValid(exactDiff, paths)) findings.push("CANONICAL_GENERATED_COMPANION_DIFF_IDENTITY_INVALID");

  const proofIdentityMatches = sourceAuthorityProof?.schemaVersion === 1
    && sourceAuthorityProof?.contract === "PHASE1_SOURCE_AUTHORITY_RESOLUTION_V2"
    && sourceAuthorityProof?.producer === "PROTECTED_MAIN_ENGINEERING_CLOSURE_V1"
    && sourceAuthorityProof?.authorityType === "FINITE_TASK_ADMISSION"
    && sourceAuthorityProof?.draftSourceOnly === false
    && sourceAuthorityProof?.mergeAuthorityGranted === false
    && Array.isArray(sourceAuthorityProof?.findings) && sourceAuthorityProof.findings.length === 0
    && sha256.test(sourceAuthorityProof?.scopeHash ?? "")
    && sourceAuthorityProof?.repository === exactDiff?.repository
    && sourceAuthorityProof?.pr === exactDiff?.implementationPr
    && sourceAuthorityProof?.baseRef === "main"
    && sourceAuthorityProof?.baseSha === exactDiff?.baseSha
    && sourceAuthorityProof?.headSha === exactDiff?.headSha
    && sourceAuthorityProof?.sourceTree === exactDiff?.sourceTree;
  if (!proofIdentityMatches) findings.push("CANONICAL_GENERATED_COMPANION_SOURCE_AUTHORITY_INVALID");

  const active = currentTruth?.activeTaskBinding;
  const lifecycle = currentTruth?.controlPlaneLifecycle;
  const matchingLeases = (currentTruth?.finiteTaskLeases?.tasks ?? []).filter(({ leaseId }) => leaseId === active?.implementationBindingId);
  const lease = matchingLeases[0];
  const activeAuthorityClosed = [active?.providerMutationAllowed, active?.databaseDeploymentAllowed, active?.buildAllowed, active?.submissionAllowed, active?.otaAllowed, active?.publicReleaseAllowed].every((value) => value === false);
  const leaseAuthorityClosed = [lease?.authority?.providerMutation, lease?.authority?.databaseDeployment, lease?.authority?.build, lease?.authority?.submission, lease?.authority?.ota, lease?.authority?.publicRelease].every((value) => value === false);
  const truthIdentityMatches = currentTruth?.mainSha === exactDiff?.baseSha
    && currentTruth?.protectedMainAuthority?.checkpointSha === exactDiff?.baseSha
    && sha40.test(currentTruth?.protectedMainAuthority?.checkpointTree ?? "")
    && lifecycle?.contractId === CONTROL_PLANE_LIFECYCLE_CONTRACT
    && lifecycle?.currentStage === "AUTHORIZED_IMPLEMENTATION"
    && lifecycle?.terminalClassification === null
    && lifecycle?.pendingTransitionCount === 0
    && lifecycle?.mergeAuthority === false
    && lifecycle?.providerBuildOtaReleaseAuthority === false
    && lifecycle?.activeLeaseId === active?.implementationBindingId
    && matchingLeases.length === 1
    && lease?.leaseId === active?.implementationBindingId
    && lease?.protectedAdmissionPr === exactDiff?.implementationPr
    && lease?.taskState === "ACTIVE_IMPLEMENTATION"
    && active?.implementationPr === lease?.implementationPr
    && active?.implementationBranch === lease?.implementationBranch
    && active?.featureId === lease?.featureId
    && active?.immutableSourceHead === lease?.admittedSeedHead
    && active?.immutableSourceTree === lease?.admittedSeedTree
    && active?.productSourceMutationAllowed === true
    && activeAuthorityClosed
    && leaseAuthorityClosed;
  if (!truthIdentityMatches) findings.push("CANONICAL_GENERATED_COMPANION_TASK_TRANSITION_INVALID");

  const generatedBytesMatch = typeof currentStateText === "string"
    && typeof nextTaskText === "string"
    && typeof canonicalCurrentStateText === "string"
    && typeof canonicalNextTaskText === "string"
    && currentStateText === canonicalCurrentStateText
    && nextTaskText === canonicalNextTaskText;
  if (!generatedBytesMatch) findings.push("CANONICAL_GENERATED_COMPANION_RENDER_INVALID");

  if (findings.length) return { ok: false, findings: [...new Set(findings)].sort(), context: null };
  const body = {
    schemaVersion: 1,
    classification: "AUTHENTICATED_CANONICAL_GENERATED_ASSURANCE_COMPANION_TRANSITION_V1",
    repository: exactDiff.repository,
    admissionPr: exactDiff.implementationPr,
    baseSha: exactDiff.baseSha,
    headSha: exactDiff.headSha,
    sourceTree: exactDiff.sourceTree,
    changedPathSha256: exactDiff.changedPathSha256,
    patchSha256: exactDiff.patchSha256,
    leaseId: lease.leaseId,
    implementationPr: lease.implementationPr,
    currentTruthHash: lifecycleHash(currentTruth),
    currentStateHash: lifecycleHash(currentStateText),
    nextTaskHash: lifecycleHash(nextTaskText),
    sourceAuthorityScopeHash: sourceAuthorityProof.scopeHash,
  };
  const context = Object.freeze({ ...body, contextHash: lifecycleHash(body) });
  canonicalGeneratedCompanionRiskContexts.add(context);
  return { ok: true, findings: [], context };
}

const presentationRoots = ["app/", "components/", "tests/", "docs/assurance/tasks/"];
const forbiddenPresentationRoots = [".github/", ".agents/", "config/", "scripts/", "supabase/", "android/", "ios/", "plugins/", "package.json", "package-lock.json", "app.config.ts", "app.json", "eas.json"];
export function classifyDiffRisk({ changedPaths = [], boundaryAssessment = null, exactDiff = null, assuranceTransitionContext = null, policy } = {}) {
  const paths = [...new Set(changedPaths)].sort();
  const assuranceRoots = policy?.security?.assuranceRoots ?? [];
  if (paths.length === 0) return { classification: RISK_CLASSES.UNKNOWN, hostedSecurity: "HOSTED_SECURITY_REQUIRED", findings: ["RISK_CHANGED_PATHS_EMPTY"] };
  const canonicalCompanionTransition = canonicalGeneratedCompanionRiskContexts.has(assuranceTransitionContext)
    && exactPathSet(paths, CANONICAL_GENERATED_ASSURANCE_COMPANION_PATHS)
    && exactDiffIdentityValid(exactDiff, paths)
    && assuranceTransitionContext?.repository === exactDiff.repository
    && assuranceTransitionContext?.admissionPr === exactDiff.implementationPr
    && assuranceTransitionContext?.baseSha === exactDiff.baseSha
    && assuranceTransitionContext?.headSha === exactDiff.headSha
    && assuranceTransitionContext?.sourceTree === exactDiff.sourceTree
    && assuranceTransitionContext?.changedPathSha256 === exactDiff.changedPathSha256
    && assuranceTransitionContext?.patchSha256 === exactDiff.patchSha256
    && assuranceTransitionContext?.contextHash === lifecycleHash(Object.fromEntries(Object.entries(assuranceTransitionContext).filter(([key]) => key !== "contextHash")));
  if (canonicalCompanionTransition) {
    return { classification: RISK_CLASSES.ASSURANCE, hostedSecurity: "HOSTED_SECURITY_REQUIRED", findings: [] };
  }
  if (paths.every((file) => assuranceRoots.some((root) => file === root || file.startsWith(root)))) {
    return { classification: RISK_CLASSES.ASSURANCE, hostedSecurity: "HOSTED_SECURITY_REQUIRED", findings: [] };
  }
  const sensitive = policy?.security?.sensitiveBoundaries ?? [];
  const exactDiffValid = exactDiffIdentityValid(exactDiff, paths);
  const expectedAssessmentKeys = ["schemaVersion", "classification", "repository", "implementationPr", "baseSha", "headSha", "sourceTree", "changedPathSha256", "patchSha256", "boundaries", "assessmentHash"];
  const exactAssessment = exactDiffValid
    && exactKeys(boundaryAssessment, expectedAssessmentKeys)
    && boundaryAssessment?.schemaVersion === 1
    && boundaryAssessment?.classification === "EXACT_DIFF_BOUNDARY_ASSESSMENT_V1"
    && ["repository", "implementationPr", "baseSha", "headSha", "sourceTree", "changedPathSha256", "patchSha256"].every((key) => boundaryAssessment?.[key] === exactDiff[key])
    && sensitive.every((key) => boundaryAssessment?.boundaries?.[key] === false)
    && boundaryAssessment?.assessmentHash === lifecycleHash(Object.fromEntries(Object.entries(boundaryAssessment).filter(([key]) => key !== "assessmentHash")));
  const presentationPaths = paths.every((file) => presentationRoots.some((root) => file.startsWith(root)))
    && paths.every((file) => !forbiddenPresentationRoots.some((root) => file === root || file.startsWith(root)));
  if (exactAssessment && presentationPaths) return { classification: RISK_CLASSES.PRESENTATION, hostedSecurity: "NOT_APPLICABLE_PRESENTATION_ONLY", findings: [] };
  const obviousSensitive = paths.some((file) => /^(?:supabase|android|ios|plugins)\//u.test(file) || ["app.config.ts", "app.json", "eas.json", "package.json", "package-lock.json"].includes(file));
  return obviousSensitive
    ? { classification: RISK_CLASSES.HIGH, hostedSecurity: "HOSTED_SECURITY_REQUIRED", findings: [] }
    : { classification: RISK_CLASSES.UNKNOWN, hostedSecurity: "HOSTED_SECURITY_REQUIRED", findings: ["RISK_BOUNDARY_ASSESSMENT_REQUIRED"] };
}

export function phase1LaneApplicability({ policy, lifecycleStage, riskClassification } = {}) {
  const lanes = policy?.phase1?.lanes ?? [];
  return lanes.map((lane) => {
    const unfinished = (lane.components ?? []).filter(({ classification }) => classification === "UNFINISHED_ARCHITECTURE").map(({ id }) => id);
    const ready = (lane.components ?? []).filter(({ classification }) => classification === "READY_AND_APPLICABLE").map(({ id }) => id);
    let applicability = APPLICABILITY.APPLICABLE;
    let reason = "LIFECYCLE_AND_RISK_MATCH";
    if (!(lane.stages ?? []).includes(lifecycleStage)) {
      applicability = APPLICABILITY.NOT_APPLICABLE_YET;
      reason = "LIFECYCLE_STAGE_NOT_REACHED";
    } else if (!(lane.risk ?? []).includes(riskClassification)) {
      applicability = APPLICABILITY.NOT_APPLICABLE_TO_RISK;
      reason = "RISK_DOMAIN_NOT_AFFECTED";
    }
    return { name: lane.name, applicability, result: GATE_RESULTS.NOT_RUN, reason, requiredAt: lane.stages, readyComponents: ready, deferredComponents: unfinished };
  });
}

export function aggregateApplicablePhase1({ policy, lifecycleStage, riskClassification, jobs = [] } = {}) {
  const decisions = phase1LaneApplicability({ policy, lifecycleStage, riskClassification });
  const duplicateNames = jobs.map(({ name }) => name).filter((name, index, all) => all.indexOf(name) !== index);
  const laneResults = decisions.map((decision) => {
    const matches = jobs.filter(({ name }) => name === decision.name);
    if (decision.applicability !== APPLICABILITY.APPLICABLE) return decision;
    if (matches.length !== 1) return { ...decision, result: GATE_RESULTS.FAIL, reason: matches.length ? "DUPLICATE_APPLICABLE_LANE" : "APPLICABLE_LANE_NOT_RUN" };
    return matches[0].conclusion === "success"
      ? { ...decision, result: GATE_RESULTS.PASS, reason: "APPLICABLE_LANE_PASSED" }
      : { ...decision, result: GATE_RESULTS.FAIL, reason: "APPLICABLE_LANE_FAILED" };
  });
  const applicable = laneResults.filter(({ applicability }) => applicability === APPLICABILITY.APPLICABLE);
  const failed = applicable.filter(({ result }) => result !== GATE_RESULTS.PASS);
  const deferred = laneResults.filter(({ applicability }) => applicability !== APPLICABILITY.APPLICABLE);
  const body = {
    schemaVersion: 2,
    classification: "LIFECYCLE_RISK_AWARE_PHASE1_AGGREGATE_V2",
    lifecycleStage,
    riskClassification,
    discovered: policy?.phase1?.lanes?.length ?? 0,
    applicable: applicable.length,
    passed: applicable.filter(({ result }) => result === GATE_RESULTS.PASS).length,
    failed: failed.length,
    deferred: deferred.length,
    laneResults,
    mergeAuthorityEligible: applicable.length > 0 && failed.length === 0 && duplicateNames.length === 0 && ["FROZEN_CANDIDATE", "NORMAL_MERGE_READY"].includes(lifecycleStage),
  };
  return { ...body, aggregateHash: lifecycleHash(body) };
}

export function evidenceInvalidation({ previous = {}, next = {}, evidence = [] } = {}) {
  const keys = ["repository", "taskId", "implementationPr", "baseSha", "headSha", "sourceTree", "changedPathSha256", "patchSha256", "lifecycleStage", "authorityVersion", "providerState", "contractVersion"];
  const changedKeys = keys.filter((key) => previous?.[key] !== next?.[key]);
  const invalidated = evidence.filter((entry) => (entry?.dependsOn ?? []).some((key) => changedKeys.includes(key))).map(({ id }) => id).sort();
  const reusable = evidence.filter((entry) => !(entry?.dependsOn ?? []).some((key) => changedKeys.includes(key))).map(({ id }) => id).sort();
  return { changedKeys, invalidated, reusable };
}

export function evaluateLifecycleAuthority({ stage, admissionValid = false, candidateFrozen = false, qualificationValid = false, exceptionalBypassValid = false } = {}) {
  const implementation = stage === "AUTHORIZED_IMPLEMENTATION" && admissionValid === true;
  const normalMerge = stage === "NORMAL_MERGE_READY" && admissionValid === true && candidateFrozen === true && qualificationValid === true;
  const exceptionalMerge = ["FROZEN_CANDIDATE", "NORMAL_MERGE_READY"].includes(stage) && admissionValid === true && candidateFrozen === true && exceptionalBypassValid === true;
  return {
    implementation,
    normalMerge,
    exceptionalMerge,
    providerMutation: false,
    databaseDeployment: false,
    build: false,
    submission: false,
    ota: false,
    publicRelease: false,
    money: false,
  };
}

export function validateAssuranceSelfMaintenance({ changedPaths = [], policy, productAuthority = false } = {}) {
  const paths = [...new Set(changedPaths)].sort();
  const allowed = policy?.selfMaintenance?.allowedRoots ?? [];
  const forbidden = policy?.selfMaintenance?.forbiddenRoots ?? [];
  const findings = [];
  if (policy?.selfMaintenance?.classification !== "BOUNDED_ASSURANCE_SELF_MAINTENANCE_V2"
    || policy?.selfMaintenance?.requiresExactFrozenSource !== true
    || policy?.selfMaintenance?.allowsProductAuthority !== false) findings.push("ASSURANCE_SELF_MAINTENANCE_POLICY_INVALID");
  if (!paths.length || !paths.every((file) => allowed.some((root) => pathMatchesPolicyEntry(file, root)))) findings.push("ASSURANCE_SELF_MAINTENANCE_SCOPE_INVALID");
  if (paths.some((file) => forbidden.some((root) => pathMatchesPolicyEntry(file, root)))) findings.push("ASSURANCE_SELF_MAINTENANCE_PRODUCT_PATH_PRESENT");
  if (productAuthority !== false) findings.push("ASSURANCE_SELF_MAINTENANCE_PRODUCT_AUTHORITY_FORBIDDEN");
  return { ok: findings.length === 0, classification: "BOUNDED_ASSURANCE_SELF_MAINTENANCE_V2", findings, authority: closedAuthority };
}

export function validateExceptionalMergeOutcome(outcome, { lease, ownerReceipt, gitEvidence, rulesetEvidence } = {}) {
  const findings = [];
  const required = ["schemaVersion", "classification", "repository", "taskId", "leaseId", "implementationPr", "implementationBranch", "protectedBase", "sourceHead", "sourceTree", "patchSha256", "changedPathSha256", "mergeSha", "mergeTree", "mergeParents", "normalPathEvidence", "hostedSecurity", "physicalProof", "ownerReceipt", "gitEvidence", "ruleset", "authority", "evidenceHash"];
  if (!exactKeys(outcome, required) || outcome?.schemaVersion !== 2 || outcome?.classification !== EXCEPTIONAL_MERGE_CLASSIFICATION || outcome?.repository !== "Chillywood2025/chillywood-mobile") findings.push("EXCEPTIONAL_OUTCOME_SCHEMA_INVALID");
  if (!lease || outcome?.taskId !== lease.leaseId || outcome?.leaseId !== lease.leaseId || outcome?.implementationPr !== lease.implementationPr || outcome?.implementationBranch !== lease.implementationBranch) findings.push("EXCEPTIONAL_OUTCOME_LEASE_BINDING_INVALID");
  if (![outcome?.protectedBase, outcome?.sourceHead, outcome?.sourceTree, outcome?.mergeSha, outcome?.mergeTree].every((value) => sha40.test(value ?? "")) || ![outcome?.patchSha256, outcome?.changedPathSha256].every((value) => sha256.test(value ?? ""))) findings.push("EXCEPTIONAL_OUTCOME_SOURCE_IDENTITY_INVALID");
  if (stableLifecycleJson(outcome?.mergeParents) !== stableLifecycleJson([outcome?.protectedBase, outcome?.sourceHead]) || outcome?.mergeTree !== outcome?.sourceTree) findings.push("EXCEPTIONAL_OUTCOME_MERGE_IDENTITY_INVALID");
  gitEvidence ??= outcome?.gitEvidence;
  ownerReceipt ??= outcome?.ownerReceipt;
  rulesetEvidence ??= outcome?.ruleset?.evidence;
  if (stableLifecycleJson(gitEvidence) !== stableLifecycleJson({ protectedBase: outcome?.protectedBase, sourceHead: outcome?.sourceHead, sourceTree: outcome?.sourceTree, mergeSha: outcome?.mergeSha, mergeTree: outcome?.mergeTree, mergeParents: outcome?.mergeParents, patchSha256: outcome?.patchSha256, changedPathSha256: outcome?.changedPathSha256 })) findings.push("EXCEPTIONAL_OUTCOME_GIT_READBACK_INVALID");
  const normal = outcome?.normalPathEvidence;
  if (stableLifecycleJson(normal) !== stableLifecycleJson({ exactHeadReview: "NOT_PRODUCED", phase1: "NOT_SUCCESSFUL", finalSourceReceipt: "NOT_PRODUCED" })) findings.push("EXCEPTIONAL_OUTCOME_NORMAL_EVIDENCE_INVALID");
  if (!["NOT_PRODUCED", "NOT_APPLICABLE_PRESENTATION_ONLY"].includes(outcome?.hostedSecurity) || outcome?.physicalProof !== "PENDING") findings.push("EXCEPTIONAL_OUTCOME_PROOF_STATUS_INVALID");
  if (stableLifecycleJson(outcome?.authority) !== stableLifecycleJson(closedAuthority)) findings.push("EXCEPTIONAL_OUTCOME_AUTHORITY_INVALID");
  const expectedOwnerSubject = {
    repository: outcome?.repository,
    implementationPr: outcome?.implementationPr,
    leaseId: outcome?.leaseId,
    protectedBase: outcome?.protectedBase,
    sourceHead: outcome?.sourceHead,
    sourceTree: outcome?.sourceTree,
    patchSha256: outcome?.patchSha256,
    changedPathSha256: outcome?.changedPathSha256,
    mergeSha: outcome?.mergeSha,
    mergeTree: outcome?.mergeTree,
    mergeParents: outcome?.mergeParents,
    classification: EXCEPTIONAL_MERGE_CLASSIFICATION,
    normalPathEvidence: outcome?.normalPathEvidence,
  };
  if (!ownerReceipt || ownerReceipt?.author !== "Chillywood2025" || ownerReceipt?.authorAssociation !== "OWNER" || ownerReceipt?.createdAt !== ownerReceipt?.updatedAt || stableLifecycleJson(ownerReceipt?.subject) !== stableLifecycleJson(expectedOwnerSubject) || ownerReceipt?.subjectHash !== lifecycleHash(expectedOwnerSubject) || !sha256.test(ownerReceipt?.bodyHash ?? "")) findings.push("EXCEPTIONAL_OUTCOME_OWNER_RECEIPT_INVALID");
  const rules = outcome?.ruleset;
  if (!rulesetEvidence || rules?.id !== 18940814 || rules?.temporaryActor?.actorId !== 210200794 || rules?.temporaryActor?.actorType !== "User" || rules?.temporaryActor?.bypassMode !== "pull_request" || rulesetEvidence?.before?.onlyIntegration !== true || rulesetEvidence?.bypass?.userPresent !== true || rulesetEvidence?.restored?.onlyIntegration !== true || rulesetEvidence?.restored?.integrationId !== 4707730 || !(Date.parse(rulesetEvidence.bypass.updatedAt) <= Date.parse(rules.mergeAt) && Date.parse(rules.mergeAt) <= Date.parse(rulesetEvidence.restored.updatedAt))) findings.push("EXCEPTIONAL_OUTCOME_RULESET_RESTORATION_INVALID");
  const unhashed = Object.fromEntries(Object.entries(outcome ?? {}).filter(([key]) => key !== "evidenceHash"));
  if (outcome?.evidenceHash !== lifecycleHash(unhashed)) findings.push("EXCEPTIONAL_OUTCOME_HASH_INVALID");
  return { ok: findings.length === 0, findings };
}

export function validateExceptionalOwnerReceiptReadback(outcome, raw) {
  const parsed = parseCanonicalMarkedComment(raw?.body, EXCEPTIONAL_OWNER_TERMINAL_MARKER);
  const payload = parsed?.payload;
  const unhashedPayload = payload && Object.fromEntries(Object.entries(payload).filter(([key]) => key !== "bodyHash"));
  const projected = {
    commentId: raw?.id,
    author: raw?.user?.login,
    authorAssociation: raw?.author_association,
    createdAt: raw?.created_at,
    updatedAt: raw?.updated_at,
    subjectHash: payload?.subjectHash,
    bodyHash: payload?.bodyHash,
    subject: payload?.subject,
  };
  const findings = [];
  if (!parsed?.ok || !exactKeys(payload, ["bodyHash", "marker", "schemaVersion", "subject", "subjectHash", "type"])) findings.push("EXCEPTIONAL_OWNER_RECEIPT_PARSE_INVALID");
  if (payload?.schemaVersion !== 2 || payload?.type !== "OWNER_EXCEPTIONAL_BYPASS_TERMINAL_ACKNOWLEDGEMENT_V2" || payload?.marker !== EXCEPTIONAL_OWNER_TERMINAL_MARKER) findings.push("EXCEPTIONAL_OWNER_RECEIPT_TYPE_INVALID");
  if (!payload || payload?.subjectHash !== lifecycleHash(payload.subject) || payload?.bodyHash !== lifecycleHash(unhashedPayload)) findings.push("EXCEPTIONAL_OWNER_RECEIPT_HASH_INVALID");
  if (raw?.user?.login !== "Chillywood2025" || raw?.author_association !== "OWNER" || raw?.created_at !== raw?.updated_at) findings.push("EXCEPTIONAL_OWNER_RECEIPT_IDENTITY_INVALID");
  if (stableLifecycleJson(projected) !== stableLifecycleJson(outcome?.ownerReceipt)) findings.push("EXCEPTIONAL_OWNER_RECEIPT_PROJECTION_INVALID");
  return { ok: findings.length === 0, findings, receipt: findings.length === 0 ? projected : null };
}

export function deriveExceptionalGitEvidence(outcome, { root } = {}) {
  const git = (args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  try {
    const mergeParents = git(["show", "-s", "--format=%P", outcome.mergeSha]).split(/\s+/u).filter(Boolean);
    const patch = execFileSync("git", ["diff", "--binary", outcome.protectedBase, outcome.sourceHead], { cwd: root });
    const paths = git(["diff", "--name-only", outcome.protectedBase, outcome.sourceHead]).split(/\r?\n/gu).filter(Boolean).sort();
    return {
      protectedBase: outcome.protectedBase,
      sourceHead: outcome.sourceHead,
      sourceTree: git(["rev-parse", `${outcome.sourceHead}^{tree}`]),
      mergeSha: outcome.mergeSha,
      mergeTree: git(["rev-parse", `${outcome.mergeSha}^{tree}`]),
      mergeParents,
      patchSha256: crypto.createHash("sha256").update(patch).digest("hex"),
      changedPathSha256: crypto.createHash("sha256").update(`${paths.join("\n")}\n`).digest("hex"),
    };
  } catch {
    return null;
  }
}

export function authorizeExceptionalMergeOutcome(outcome, { lease, ownerReceiptReadback, gitEvidence, rulesetReadback } = {}) {
  const receipt = validateExceptionalOwnerReceiptReadback(outcome, ownerReceiptReadback);
  const structural = validateExceptionalMergeOutcome(outcome, {
    lease,
    ownerReceipt: receipt.receipt,
    gitEvidence,
    rulesetEvidence: outcome?.ruleset?.evidence,
  });
  const bypassActors = rulesetReadback?.bypass_actors ?? [];
  const rulesetRestored = rulesetReadback?.id === 18940814
    && rulesetReadback?.enforcement === "active"
    && bypassActors.length === 1
    && bypassActors[0]?.actor_type === "Integration"
    && bypassActors[0]?.actor_id === 4707730
    && bypassActors[0]?.bypass_mode === "pull_request";
  const findings = [...receipt.findings, ...structural.findings];
  if (stableLifecycleJson(gitEvidence) !== stableLifecycleJson(outcome?.gitEvidence)) findings.push("EXCEPTIONAL_GIT_EVIDENCE_LIVE_MISMATCH");
  if (!rulesetRestored) findings.push("EXCEPTIONAL_RULESET_LIVE_RESTORATION_INVALID");
  return { ok: findings.length === 0, findings: [...new Set(findings)].sort() };
}

export function validateDeferredOutcome(outcome, { lease } = {}) {
  const unhashed = Object.fromEntries(Object.entries(outcome ?? {}).filter(([key]) => key !== "evidenceHash"));
  const findings = [];
  if (outcome?.schemaVersion !== 2 || outcome?.classification !== OWNER_DEFERRED_CLASSIFICATION || outcome?.implementationStatus !== "NOT_IMPLEMENTED") findings.push("DEFERRED_OUTCOME_CLASSIFICATION_INVALID");
  if (!lease || outcome?.leaseId !== lease.leaseId || outcome?.taskId !== lease.leaseId || outcome?.implementationPr !== lease.implementationPr) findings.push("DEFERRED_OUTCOME_LEASE_BINDING_INVALID");
  if (stableLifecycleJson(outcome?.authority) !== stableLifecycleJson(closedAuthority)) findings.push("DEFERRED_OUTCOME_AUTHORITY_INVALID");
  if (!Array.isArray(outcome?.defectIds) || outcome.defectIds.length === 0 || outcome.defectIds.some((value) => typeof value !== "string" || !value)) findings.push("DEFERRED_OUTCOME_DEFECTS_INVALID");
  if (outcome?.evidenceHash !== lifecycleHash(unhashed)) findings.push("DEFERRED_OUTCOME_HASH_INVALID");
  return { ok: findings.length === 0, findings };
}

export function terminalLeaseOutcome(registry, lease) {
  const normal = (registry?.completedLeaseOutcomes ?? []).filter(({ leaseId }) => leaseId === lease?.leaseId);
  const exceptional = (registry?.exceptionalLeaseOutcomes ?? []).filter(({ leaseId }) => leaseId === lease?.leaseId);
  const deferred = (registry?.deferredLeaseOutcomes ?? []).filter(({ leaseId }) => leaseId === lease?.leaseId);
  if (normal.length + exceptional.length + deferred.length !== 1) return null;
  if (normal.length === 1) return { classification: NORMAL_MERGE_CLASSIFICATION, outcome: normal[0] };
  if (exceptional.length === 1 && exceptional[0]?.classification === EXCEPTIONAL_MERGE_CLASSIFICATION) return { classification: EXCEPTIONAL_MERGE_CLASSIFICATION, outcome: exceptional[0] };
  if (deferred.length === 1 && deferred[0]?.classification === OWNER_DEFERRED_CLASSIFICATION && deferred[0]?.implementationStatus === "NOT_IMPLEMENTED") return { classification: OWNER_DEFERRED_CLASSIFICATION, outcome: deferred[0] };
  return null;
}

export function projectExceptionalTerminalTruth(record, outcome) {
  const next = structuredClone(record);
  const lease = (next?.finiteTaskLeases?.tasks ?? []).find(({ leaseId }) => leaseId === outcome?.leaseId);
  if (!lease) throw new Error("EXCEPTIONAL_TERMINAL_LEASE_MISSING");
  const existing = next.finiteTaskLeases.exceptionalLeaseOutcomes ?? [];
  const sameLease = existing.filter(({ leaseId }) => leaseId === lease.leaseId);
  if (sameLease.length > 1 || (sameLease.length === 1 && stableLifecycleJson(sameLease[0]) !== stableLifecycleJson(outcome))) throw new Error("EXCEPTIONAL_TERMINAL_OUTCOME_CONFLICT");
  next.finiteTaskLeases.exceptionalLeaseOutcomes = sameLease.length === 1 ? existing : [...existing, structuredClone(outcome)];
  next.mainSha = outcome.mergeSha;
  next.protectedMainAuthority ??= {};
  next.protectedMainAuthority.checkpointSha = outcome.mergeSha;
  next.protectedMainAuthority.checkpointTree = outcome.mergeTree;
  const priorImplementation = (next.openImplementationPrs ?? []).find(({ number }) => number === outcome.implementationPr);
  next.latestMergedImplementationPr = { number: outcome.implementationPr, state: "merged", head: outcome.sourceHead, mergeSha: outcome.mergeSha, mergeTree: outcome.mergeTree, title: priorImplementation?.title ?? `Finite task ${outcome.taskId}` };
  next.openImplementationPrs = (next.openImplementationPrs ?? []).filter(({ number }) => number !== outcome.implementationPr);
  next.activeTaskBinding = null;
  next.finiteTaskRuntime = {
    ...next.finiteTaskRuntime,
    candidateObservation: { pr: outcome.implementationPr, branch: outcome.implementationBranch, prState: "merged", head: outcome.sourceHead, tree: outcome.sourceTree, classification: EXCEPTIONAL_MERGE_CLASSIFICATION, observedAt: outcome.ruleset.mergeAt },
    finalEvidence: { ownerReceipt: false, repositoryReview: false, phase1: false, mergeEligible: false },
    exceptionalTerminalOutcome: structuredClone(outcome),
  };
  next.engineeringDoctrine = { ...next.engineeringDoctrine, activeTaskSentinel: "NO_ACTIVE_PRODUCT_IMPLEMENTATION", taskLeaseState: "NO_ACTIVE_TASK", blockers: [], nextPermittedAction: "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE" };
  next.controlPlaneLifecycle = {
    schemaVersion: 2,
    contractId: CONTROL_PLANE_LIFECYCLE_CONTRACT,
    currentStage: "TERMINAL_TRUTH",
    terminalClassification: EXCEPTIONAL_MERGE_CLASSIFICATION,
    activeLeaseId: null,
    pendingTransitionCount: 0,
    mergeAuthority: false,
    providerBuildOtaReleaseAuthority: false,
    physicalProof: "PENDING",
  };
  return next;
}

export function fixedPointAcceptsAdvancement({ record, observation, policy, expectedFirstParent = record?.mainSha } = {}) {
  const terminal = record?.finiteTaskRuntime?.exceptionalTerminalOutcome;
  const selfMaintenance = validateAssuranceSelfMaintenance({ changedPaths: observation?.changedPaths ?? [], policy, productAuthority: false });
  const ok = record?.controlPlaneLifecycle?.contractId === CONTROL_PLANE_LIFECYCLE_CONTRACT
    && record?.controlPlaneLifecycle?.currentStage === "TERMINAL_TRUTH"
    && record?.activeTaskBinding === null
    && terminal?.mergeSha === record?.mainSha
    && observation?.parents?.length === 2
    && observation.parents[0] === expectedFirstParent
    && observation?.parents?.[1] === observation?.sourceHead
    && observation?.tree === observation?.sourceTree
    && selfMaintenance.ok;
  return { ok, classification: ok ? "ASSURANCE_SELF_MAINTENANCE_FIXED_POINT_ADVANCEMENT" : "FIXED_POINT_ADVANCEMENT_INVALID", findings: ok ? [] : ["FIXED_POINT_ADVANCEMENT_INVALID"] };
}

function cliOptions(argv) {
  return Object.fromEntries(argv.map((entry) => {
    const [key, value = true] = entry.replace(/^--/u, "").split("=", 2);
    return [key, value];
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const options = cliOptions(process.argv.slice(2));
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const taskPath = typeof options["project-exceptional"] === "string" ? path.resolve(root, options["project-exceptional"]) : null;
  if (!taskPath || options.write !== true || Object.keys(options).some((key) => !["project-exceptional", "write"].includes(key))) {
    process.stderr.write("usage: node scripts/assurance/control-plane-lifecycle.mjs --project-exceptional=<task.json> --write\n");
    process.exitCode = 1;
  } else {
    const truthPath = path.join(root, "config/assurance/current-truth-v1.json");
    const record = JSON.parse(fs.readFileSync(truthPath, "utf8"));
    const task = JSON.parse(fs.readFileSync(taskPath, "utf8"));
    const outcome = task.exceptionalOutcome484;
    const lease = (record?.finiteTaskLeases?.tasks ?? []).find(({ leaseId }) => leaseId === outcome?.leaseId);
    let ownerReceiptReadback = null;
    let rulesetReadback = null;
    try {
      ownerReceiptReadback = JSON.parse(execFileSync("gh", ["api", `repos/${outcome.repository}/issues/comments/${outcome.ownerReceipt.commentId}`], { cwd: root, encoding: "utf8" }));
      rulesetReadback = JSON.parse(execFileSync("gh", ["api", `repos/${outcome.repository}/rulesets/${outcome.ruleset.id}`], { cwd: root, encoding: "utf8" }));
    } catch {}
    const verification = authorizeExceptionalMergeOutcome(outcome, { lease, ownerReceiptReadback, gitEvidence: deriveExceptionalGitEvidence(outcome, { root }), rulesetReadback });
    if (!verification.ok) {
      process.stderr.write(`${JSON.stringify(verification)}\n`);
      process.exitCode = 1;
    } else {
      const projected = projectExceptionalTerminalTruth(record, outcome);
      fs.writeFileSync(truthPath, `${JSON.stringify(projected, null, 2)}\n`);
      process.stdout.write(`${JSON.stringify({ ok: true, classification: outcome.classification, leaseId: outcome.leaseId, mergeSha: outcome.mergeSha })}\n`);
    }
  }
}
