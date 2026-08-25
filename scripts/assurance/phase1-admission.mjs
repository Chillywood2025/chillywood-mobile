import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PHASE1_ADMISSION_CHECK_NAME = "Phase 1 / Admission Decision";
export const PHASE1_ADMISSION_PRODUCER = "PROTECTED_MAIN_PHASE1_ADMISSION_V1";
export const PHASE1_PUBLISHER_APP = Object.freeze({
  name: "Chillywood Phase1 Admission App",
  slug: "chillywood-phase1-admission-app",
});

export const PHASE1_REQUIRED_LANES = Object.freeze([
  "Phase 1 / Android Regression Guards",
  "Phase 1 / Autonomous Systems All-Platform Contract",
  "Phase 1 / Autonomous Systems iOS Contract",
  "Phase 1 / Cognitive Execution Safety",
  "Phase 1 / Cognitive Intelligence Contract",
  "Phase 1 / Expo Doctor",
  "Phase 1 / Repository Lint",
  "Phase 1 / Research and Memory Integrity",
  "Phase 1 / Route Contracts",
  "Phase 1 / Runtime Validation",
  "Phase 1 / Supabase Database Integration",
  "Phase 1 / TypeScript",
  "Phase 1 / iOS Configuration",
]);

export const PHASE1_ADMISSION_RESULTS = Object.freeze({
  ACCEPTABLE: "PHASE_1_ACCEPTABLE",
  BLOCKED: "PHASE_1_BLOCKED",
  SOURCE_READINESS_ACCEPTABLE: "PHASE_1_SOURCE_READINESS_ACCEPTABLE",
  MAINTENANCE_REQUIRED: "PHASE_1_NON_BLOCKING_ASSURANCE_MAINTENANCE_REQUIRED",
});

export const PHASE1_LANE_RESULTS = Object.freeze({
  PASS: "PASS",
  BLOCKING: "BLOCKING_FAILURE",
  NON_BLOCKING: "NON_BLOCKING_ASSURANCE_FAILURE",
  DEFERRED_EXTERNAL: "DEFERRED_EXTERNAL",
});

export const PHASE1_MODES = Object.freeze({
  DRAFT: "DRAFT_SOURCE_READINESS",
  READY: "READY_MERGE_AUTHORITY",
});

export const PHASE1_EVIDENCE_STAGES = Object.freeze({
  SOURCE: "SOURCE_EVIDENCE",
  FINAL: "FINAL_ADMISSION",
});

export const validGitHubAppClientId = (value) => typeof value === "string"
  && /^(?:Iv[0-9A-Za-z]{18}|Iv1\.[0-9a-f]{16})$/u.test(value);

const PHASE1_CANDIDATE_REMOTE_IDENTITIES = new Set([
  "https://github.com/Chillywood2025/chillywood-mobile",
  "https://github.com/Chillywood2025/chillywood-mobile.git",
  "git@github.com:Chillywood2025/chillywood-mobile.git",
]);
export const validPhase1CandidateRemoteIdentity = (value) => typeof value === "string"
  && PHASE1_CANDIDATE_REMOTE_IDENTITIES.has(value);

const SHA_RE = /^[0-9a-f]{40}$/u;
const DIGEST_RE = /^[0-9a-f]{64}$/u;
const REPOSITORY = "Chillywood2025/chillywood-mobile";
const WORKFLOW_PATH = ".github/workflows/phase1-ci.yml";
const WORKFLOW_FILE = "phase1-ci.yml";
const WORKFLOW_NAME = "Phase 1 CI";
const CONTEXT_PREFIX = "Phase 1 Context / ";
const CONTEXT_RE = /^Phase 1 Context \/ (DRAFT_SOURCE_READINESS|READY_MERGE_AUTHORITY) \/ PR-([1-9][0-9]*) \/ BASE-([0-9a-f]{40}) \/ ACT-([a-z_]+) \/ GEN-([0-9TZ:.-]+)$/u;
const MAINTENANCE_STEP = "Validate non-authoritative assurance display projection";
const MAINTENANCE_LANES = new Set(["Phase 1 / Autonomous Systems All-Platform Contract", "Phase 1 / Autonomous Systems iOS Contract", "Phase 1 / Cognitive Intelligence Contract"]);
const GENERATED_SUFFIX_STEP_RE = /^(?:Post (?:Setup Deno|Setup Node\.js|Checkout)|Complete job)$/u;
const aggregateEvidenceBrand = new WeakSet();
const mergeEligibilityBrand = new WeakSet();
const appMergeDecisionBrand = new WeakSet();
const maintenanceProofBrand = new WeakSet();
const publisherRuntimeIdentityBrand = new WeakSet();
const publisherProvisioningBrand = new WeakSet();
const publisherAppPrivacyBrand = new WeakSet();
const publisherAnchorBrand = new WeakSet();
const sourceAuthorityBrand = new WeakSet();
const lifecycleActions = new Set(["opened", "synchronize", "reopened", "edited", "ready_for_review", "converted_to_draft"]);

const knownBlockingCodes = new Set([
  "P0_SECURITY_FINDING",
  "P1_SECURITY_FINDING",
  "LAUNCH_IMPACTING_P2_SECURITY_FINDING",
  "CHANGED_DOMAIN_PRODUCT_CORRECTNESS_FAILURE",
  "CHANGED_DOMAIN_DATABASE_INTEGRATION_FAILURE",
  "RLS_RPC_SECURITY_DEFINER_FAILURE",
  "AUTH_SESSION_IDENTITY_FAILURE",
  "MONEY_LEDGER_PAYOUT_SETTLEMENT_ENTITLEMENT_FAILURE",
  "PREMIUM_ENTITLEMENT_FAIL_OPEN",
  "CROSS_USER_CREATOR_ISOLATION_FAILURE",
  "SECRET_EXPOSURE",
  "SOURCE_IDENTITY_AMBIGUITY",
  "EXACT_HEAD_AUTHORITY_MISMATCH",
  "UNAUTHORIZED_SCOPE_MUTATION",
  "REAL_MIGRATION_FAILURE",
  "REAL_NATIVE_STORE_AUTHORITY_FAILURE",
  "FINANCIAL_REPLAY_CONCURRENCY_IDEMPOTENCY_FAILURE",
  "CURRENT_SOURCE_CORRECTNESS_FAILURE",
  "PHASE1_REQUIRED_LANE_MISSING",
  "PHASE1_REQUIRED_LANE_DUPLICATE",
  "PHASE1_LANE_EXECUTION_FAILURE",
  "PHASE1_EVIDENCE_INCOMPLETE",
  "PHASE1_WORKFLOW_INTEGRITY_INVALID",
  "PHASE1_RUN_IDENTITY_INVALID",
  "PHASE1_LIFECYCLE_INVALID",
  "PHASE1_UNCLASSIFIED_FAILURE",
]);

const knownNonBlockingCodes = new Set([
  "STALE_HISTORICAL_FIXTURE",
  "HISTORICAL_CURRENT_RECEIPT_SELECTION_MAINTENANCE",
  "TERMINAL_TRUTH_PROJECTION_BOOKKEEPING",
  "CURRENT_TRUTH_DISPLAY_PROJECTION_MISMATCH",
  "HISTORICAL_EVIDENCE_CARDINALITY_MAINTENANCE",
  "HISTORICAL_OWNER_COMMENT_SELECTION_MAINTENANCE",
  "MUTABLE_GITHUB_METADATA_DRIFT",
  "STALE_MERGE_MESSAGE_PARSER_FIXTURE",
  "CONTROL_PLANE_LIFECYCLE_METADATA_MAINTENANCE",
  "ASSURANCE_DOCUMENT_PROJECTION_MISMATCH",
  "HISTORICAL_IMPLEMENTATION_BASE_ANCESTRY_MAINTENANCE",
  "NON_SECURITY_REVIEW_PROFILE_BOOKKEEPING",
  "NON_AUTHORITATIVE_DISPLAY_PROJECTION_MISMATCH",
  "ASSURANCE_HISTORY_PROJECTION_MAINTENANCE_FAILED",
  "ASSURANCE_CURRENT_STATE_DISPLAY_PROJECTION_MISMATCH",
  "ASSURANCE_NEXT_TASK_DISPLAY_PROJECTION_MISMATCH",
]);

const knownDeferredCodes = new Set([
  "BLOCKED_EXTERNAL_PROVIDER",
  "BLOCKED_EXTERNAL_DEVICE",
  "BLOCKED_EXTERNAL_LEGAL",
]);

const riskDomainByLane = Object.freeze({
  "Phase 1 / Android Regression Guards": "NATIVE_PRODUCT",
  "Phase 1 / Autonomous Systems All-Platform Contract": "AUTHORITY_AND_PRODUCT",
  "Phase 1 / Autonomous Systems iOS Contract": "NATIVE_AND_AUTHORITY",
  "Phase 1 / Cognitive Execution Safety": "EXECUTION_SECURITY",
  "Phase 1 / Cognitive Intelligence Contract": "COGNITIVE_PRODUCT",
  "Phase 1 / Expo Doctor": "BUILD_CONFIGURATION",
  "Phase 1 / Repository Lint": "SOURCE_CORRECTNESS",
  "Phase 1 / Research and Memory Integrity": "DATABASE_AND_RESEARCH",
  "Phase 1 / Route Contracts": "PRODUCT_ROUTING",
  "Phase 1 / Runtime Validation": "RUNTIME_AND_OTA",
  "Phase 1 / Supabase Database Integration": "DATABASE_RLS_AUTH_MONEY",
  "Phase 1 / TypeScript": "SOURCE_CORRECTNESS",
  "Phase 1 / iOS Configuration": "NATIVE_COMMERCE_RELEASE",
});

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
};

const stableJson = (value) => JSON.stringify(stableValue(value));
const hashValue = (value) => crypto.createHash("sha256").update(stableJson(value)).digest("hex");
const validSha = (value) => typeof value === "string" && SHA_RE.test(value);
const validTimestamp = (value) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value));
const uniqueSorted = (values) => [...new Set(values)].sort();
const runGit = (args, cwd = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..")) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) throw new Error("PHASE1_CANDIDATE_GIT_READ_FAILED");
  return result.stdout.trim();
};
async function withCandidateWorktree(identity, callback) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "chillywood-phase1-source-"));
  let added = false;
  try {
    const remote = runGit(["remote", "get-url", "origin"]);
    if (!validPhase1CandidateRemoteIdentity(remote)) throw new Error("PHASE1_CANDIDATE_REMOTE_IDENTITY_INVALID");
    runGit(["fetch", "--no-tags", "origin", identity.headSha, identity.baseSha, "+refs/heads/main:refs/remotes/origin/main"]);
    if (runGit(["rev-parse", `${identity.headSha}^{commit}`]) !== identity.headSha
      || runGit(["rev-parse", `${identity.headSha}^{tree}`]) !== identity.sourceTree
      || runGit(["rev-parse", `${identity.baseSha}^{commit}`]) !== identity.baseSha
      || runGit(["rev-parse", "refs/remotes/origin/main^{commit}"]) !== identity.baseSha) throw new Error("PHASE1_CANDIDATE_FETCH_IDENTITY_INVALID");
    runGit(["worktree", "add", "--detach", directory, identity.headSha]);
    added = true;
    if (runGit(["rev-parse", "HEAD"], directory) !== identity.headSha
      || runGit(["rev-parse", "HEAD^{tree}"], directory) !== identity.sourceTree) throw new Error("PHASE1_CANDIDATE_WORKTREE_IDENTITY_INVALID");
    return await callback(directory);
  } finally {
    if (added) runGit(["worktree", "remove", "--force", directory]);
    fs.rmSync(directory, { recursive: true, force: true });
  }
}
export const derivePhase1LifecycleGeneration = ({ identity, mode, action, eventUpdatedAt }) => hashValue({
  schemaVersion: "PHASE1_LIFECYCLE_GENERATION_V1",
  repository: identity?.repository,
  pr: identity?.pr,
  headSha: identity?.headSha,
  baseSha: identity?.baseSha,
  mode,
  action,
  eventUpdatedAt,
});

function finding(code, lane, details = {}) {
  return {
    code,
    producer: PHASE1_ADMISSION_PRODUCER,
    evidenceSource: "GITHUB_ACTIONS_JOB_STEPS",
    lane: lane ?? null,
    step: details.step ?? null,
    message: details.message ?? null,
  };
}

export function classifyPhase1Finding(observed, { trustedContext = false } = {}) {
  const code = typeof observed?.code === "string" ? observed.code : "PHASE1_UNCLASSIFIED_FAILURE";
  const provenanceTrusted = trustedContext
    && observed?.producer === PHASE1_ADMISSION_PRODUCER
    && observed?.evidenceSource === "GITHUB_ACTIONS_JOB_STEPS";
  if (knownBlockingCodes.has(code)) return { ...observed, code, classification: PHASE1_LANE_RESULTS.BLOCKING };
  if (knownDeferredCodes.has(code) && provenanceTrusted) return { ...observed, code, classification: PHASE1_LANE_RESULTS.DEFERRED_EXTERNAL };
  if (knownNonBlockingCodes.has(code) && provenanceTrusted) return { ...observed, code, classification: PHASE1_LANE_RESULTS.NON_BLOCKING };
  return {
    ...observed,
    code: knownNonBlockingCodes.has(code) || knownDeferredCodes.has(code) ? "PHASE1_UNCLASSIFIED_FAILURE" : code,
    originalCode: code,
    classification: PHASE1_LANE_RESULTS.BLOCKING,
  };
}

// This pure policy reducer is intentionally non-authoritative. It supports
// deterministic doctrine regression tests; only protected live readback can
// produce evidence accepted by verifyPhase1AggregateEvidence.
export function decidePhase1Policy({ mode, lanes } = {}) {
  const supplied = Array.isArray(lanes) ? lanes : [];
  const names = supplied.map(({ name }) => name);
  const exact = supplied.length === PHASE1_REQUIRED_LANES.length
    && new Set(names).size === names.length
    && stableJson([...names].sort()) === stableJson([...PHASE1_REQUIRED_LANES]);
  const laneResults = PHASE1_REQUIRED_LANES.map((name) => {
    const lane = supplied.find((candidate) => candidate?.name === name);
    if (!exact || !lane || !["PASS", "FAILURE"].includes(lane.status)) return { name, result: PHASE1_LANE_RESULTS.BLOCKING, findings: [{ code: "PHASE1_UNCLASSIFIED_FAILURE", classification: PHASE1_LANE_RESULTS.BLOCKING }] };
    if (lane.status === "PASS" && (!Array.isArray(lane.diagnosticCodes) || lane.diagnosticCodes.length === 0)) return { name, result: PHASE1_LANE_RESULTS.PASS, findings: [] };
    const codes = Array.isArray(lane.diagnosticCodes) && lane.diagnosticCodes.length > 0 ? lane.diagnosticCodes : ["PHASE1_UNCLASSIFIED_FAILURE"];
    const findings = codes.map((code) => classifyPhase1Finding(finding(code, name), { trustedContext: true }));
    const result = findings.some(({ classification }) => classification === PHASE1_LANE_RESULTS.BLOCKING)
      ? PHASE1_LANE_RESULTS.BLOCKING
      : (findings.some(({ classification }) => classification === PHASE1_LANE_RESULTS.DEFERRED_EXTERNAL)
        ? PHASE1_LANE_RESULTS.DEFERRED_EXTERNAL
        : PHASE1_LANE_RESULTS.NON_BLOCKING);
    return { name, result, findings };
  });
  const findings = laneResults.flatMap((lane) => lane.findings);
  const blocking = findings.filter(({ classification }) => classification === PHASE1_LANE_RESULTS.BLOCKING);
  const nonBlocking = findings.filter(({ classification }) => classification === PHASE1_LANE_RESULTS.NON_BLOCKING);
  const deferred = findings.filter(({ classification }) => classification === PHASE1_LANE_RESULTS.DEFERRED_EXTERNAL);
  if (mode === PHASE1_MODES.READY) blocking.push(...deferred.map((value) => ({ ...value, classification: PHASE1_LANE_RESULTS.BLOCKING })));
  const acceptable = blocking.length === 0;
  return {
    authoritative: false,
    acceptable,
    result: acceptable
      ? (mode === PHASE1_MODES.DRAFT ? PHASE1_ADMISSION_RESULTS.SOURCE_READINESS_ACCEPTABLE : PHASE1_ADMISSION_RESULTS.ACCEPTABLE)
      : PHASE1_ADMISSION_RESULTS.BLOCKED,
    maintenanceStatus: nonBlocking.length > 0 ? PHASE1_ADMISSION_RESULTS.MAINTENANCE_REQUIRED : null,
    mergeAuthorityGranted: false,
    rawPassedLanes: laneResults.filter(({ result }) => result === PHASE1_LANE_RESULTS.PASS).length,
    rawFailedLanes: laneResults.filter(({ result }) => result !== PHASE1_LANE_RESULTS.PASS).length,
    laneResults,
    blockingFindings: blocking,
    nonBlockingAssuranceFindings: nonBlocking,
    deferredExternalFindings: deferred,
  };
}

function exactJobIdentity(job, { identity, run } = {}) {
  return Number.isInteger(job?.id) && job.id > 0
    && job?.run_id === run?.id && job?.head_sha === identity?.headSha;
}

function exactMaintenanceJob(job, { identity, run } = {}) {
  if (!exactJobIdentity(job, { identity, run }) || job?.status !== "completed" || job?.conclusion !== "failure" || !MAINTENANCE_LANES.has(job?.name)) return false;
  const steps = Array.isArray(job.steps) ? job.steps : [];
  const index = steps.findIndex(({ name }) => name === MAINTENANCE_STEP);
  return index > 0 && steps.filter(({ name }) => name === MAINTENANCE_STEP).length === 1
    && steps.slice(0, index).every(({ status, conclusion }) => status === "completed" && conclusion === "success")
    && steps[index]?.status === "completed" && steps[index]?.conclusion === "failure"
    && steps.slice(index + 1).length > 0
    && steps.slice(index + 1).every(({ name, status, conclusion }) => status === "completed" && GENERATED_SUFFIX_STEP_RE.test(name ?? "") && ["success", "skipped"].includes(conclusion));
}

function exactSuccessfulLane(job, context) {
  if (!exactJobIdentity(job, context) || job?.status !== "completed" || job?.conclusion !== "success") return false;
  if (!MAINTENANCE_LANES.has(job?.name)) return true;
  const steps = Array.isArray(job.steps) ? job.steps : [];
  const matching = steps.filter(({ name }) => name === MAINTENANCE_STEP);
  return matching.length === 1 && matching[0]?.status === "completed" && matching[0]?.conclusion === "success";
}

function classifyLane(job, trustedContext, certificateContext) {
  if (exactSuccessfulLane(job, certificateContext)) {
    return { name: job.name, result: PHASE1_LANE_RESULTS.PASS, findings: [] };
  }
  const proof = certificateContext?.maintenanceProof;
  if (trustedContext && maintenanceProofBrand.has(proof) && proof.jobIds.includes(job?.id) && exactMaintenanceJob(job, certificateContext)) {
    const findings = proof.codes.map((code) => classifyPhase1Finding(finding(code, job.name, { step: MAINTENANCE_STEP, message: proof.fingerprint }), { trustedContext: true }));
    return { name: job.name, result: PHASE1_LANE_RESULTS.NON_BLOCKING, findings };
  }
  const observed = finding("PHASE1_LANE_EXECUTION_FAILURE", job?.name, {
    message: `status=${job?.status ?? "missing"};conclusion=${job?.conclusion ?? "missing"}`,
  });
  return { name: job?.name ?? null, result: PHASE1_LANE_RESULTS.BLOCKING, findings: [classifyPhase1Finding(observed, { trustedContext })] };
}

function decisionProjection(decision) {
  return {
    schemaVersion: "PHASE1_ADMISSION_EVIDENCE_V1",
    checkName: decision.checkName,
    result: decision.result,
    maintenanceStatus: decision.maintenanceStatus,
    mode: decision.mode,
    acceptable: decision.acceptable,
    mergeAuthorityGranted: decision.mergeAuthorityGranted,
    repository: decision.repository,
    pr: decision.pr,
    headRef: decision.headRef,
    headSha: decision.headSha,
    sourceTree: decision.sourceTree,
    baseRef: decision.baseRef,
    baseSha: decision.baseSha,
    evaluatorSha: decision.evaluatorSha,
    action: decision.action,
    eventUpdatedAt: decision.eventUpdatedAt,
    draft: decision.draft,
    runId: decision.runId,
    runAttempt: decision.runAttempt,
    lifecycleGeneration: decision.lifecycleGeneration,
    requiredLanes: decision.requiredLanes,
    rawPassedLanes: decision.rawPassedLanes,
    rawFailedLanes: decision.rawFailedLanes,
    blockingFindingCount: decision.blockingFindings.length,
    nonBlockingAssuranceFindingCount: decision.nonBlockingAssuranceFindings.length,
    deferredExternalCount: decision.deferredExternalFindings.length,
    affectedRiskDomains: decision.affectedRiskDomains,
    currentRulesetStage: decision.currentRulesetStage,
    publisherAnchorHash: decision.publisherAnchorHash,
    publisherProvisioningReadbackHash: decision.publisherProvisioningReadbackHash,
    phase1SourceDecisionHash: decision.phase1SourceDecisionHash,
    decisionHash: decision.decisionHash,
  };
}

function brandPublisherAnchor(proof, { repository, identity, provisioningReadback } = {}) {
  const bootstrap = proof?.anchorType === "R1_CURRENT_PR_BOOTSTRAP";
  const r2Bootstrap = proof?.anchorType === "R2_ANCHOR_INSTALLATION_PR_BOOTSTRAP";
  if (proof?.schemaVersion !== 1 || proof?.contract !== "PHASE1_ADMISSION_PUBLISHER_ANCHOR_RESOLUTION_V1"
    || proof?.producer !== "PROTECTED_MAIN_ENGINEERING_CLOSURE_V1" || proof?.repository !== repository
    || !["R1_CURRENT_PR_BOOTSTRAP", "R2_ANCHOR_INSTALLATION_PR_BOOTSTRAP", "R2_INSTALLED"].includes(proof?.anchorType)
    || !DIGEST_RE.test(proof?.anchorHash ?? "") || proof?.provisioningReadbackHash !== provisioningReadback?.readbackHash
    || proof?.currentRulesetStage !== provisioningReadback?.ruleset?.stage
    || proof?.appId !== provisioningReadback?.app?.id || proof?.clientId !== provisioningReadback?.app?.clientId
    || proof?.installationId !== provisioningReadback?.installation?.id || proof?.environmentId !== provisioningReadback?.environment?.id
    || proof?.aggregateCheckIntegrationId !== provisioningReadback?.aggregate?.integrationId
    || proof?.paginationComplete !== true || proof?.immutableOwnerEvidence !== true
    || (bootstrap ? (proof?.sourcePr !== identity?.pr || proof?.sourceBranch !== identity?.headRef || proof?.configurationSourceVerified !== false) : r2Bootstrap ? proof?.configurationSourceVerified !== false : proof?.configurationSourceVerified !== true)
    || !verifyProtectedPhase1PublisherProvisioningReadback(provisioningReadback)
    || !Array.isArray(proof?.findings) || proof.findings.length !== 0) throw new Error("PHASE1_PUBLISHER_ANCHOR_INVALID");
  publisherAnchorBrand.add(proof);
  return proof;
}

function brandMergeEligibility(proof, { identity, phase1SourceDecisionHash, publisherAnchorHash, publisherProvisioningReadbackHash, currentRulesetStage } = {}) {
  if (proof?.schemaVersion !== "PHASE1_MERGE_ELIGIBILITY_V1"
    || proof?.producer !== "PROTECTED_MAIN_ENGINEERING_CLOSURE_V1"
    || proof?.repository !== identity?.repository || proof?.pr !== identity?.pr
    || proof?.headSha !== identity?.headSha || proof?.sourceTree !== identity?.sourceTree
    || proof?.baseSha !== identity?.baseSha || proof?.phase1SourceDecisionHash !== phase1SourceDecisionHash
    || proof?.publisherAnchorHash !== publisherAnchorHash || proof?.publisherProvisioningReadbackHash !== publisherProvisioningReadbackHash || proof?.currentRulesetStage !== currentRulesetStage
    || proof?.ownerScopeValid !== true || proof?.exactHeadReviewValid !== true
    || proof?.finalSourceValid !== true || proof?.lifecycleValid !== true
    || proof?.paginationComplete !== true || proof?.ambiguous !== false
    || !Array.isArray(proof?.findings) || proof.findings.length !== 0) throw new Error("PHASE1_MERGE_ELIGIBILITY_INVALID");
  mergeEligibilityBrand.add(proof);
  return proof;
}

export function verifyPhase1SourceAuthorityProof(proof, { identity, lifecycle } = {}) {
  const mode = lifecycle?.draft === true ? PHASE1_MODES.DRAFT : PHASE1_MODES.READY;
  const lifecycleValid = lifecycle?.mode === mode
    && lifecycleActions.has(lifecycle?.action)
    && validTimestamp(lifecycle?.eventUpdatedAt)
    && lifecycle?.generation === derivePhase1LifecycleGeneration({
      identity,
      mode,
      action: lifecycle?.action,
      eventUpdatedAt: lifecycle?.eventUpdatedAt,
    });
  const common = proof?.schemaVersion === 1
    && proof?.contract === "PHASE1_SOURCE_AUTHORITY_RESOLUTION_V2"
    && proof?.producer === "PROTECTED_MAIN_ENGINEERING_CLOSURE_V1"
    && proof?.repository === identity?.repository
    && proof?.pr === identity?.pr
    && proof?.headRef === identity?.headRef
    && proof?.headSha === identity?.headSha
    && proof?.sourceTree === identity?.sourceTree
    && proof?.baseRef === identity?.baseRef
    && proof?.baseSha === identity?.baseSha
    && proof?.authorityMode === mode
    && proof?.lifecycleAction === lifecycle?.action
    && proof?.lifecycleEventUpdatedAt === lifecycle?.eventUpdatedAt
    && proof?.lifecycleGeneration === lifecycle?.generation
    && proof?.mergeAuthorityGranted === false
    && DIGEST_RE.test(proof?.scopeHash ?? "")
    && Array.isArray(proof?.findings) && proof.findings.length === 0
    && lifecycleValid;
  if (!common) return false;
  if (mode === PHASE1_MODES.DRAFT) return proof?.authorityType === "DRAFT_SOURCE_SCOPE" && proof?.draftSourceOnly === true;
  return ["ARCHITECTURE", "TERMINAL_TRUTH", "FINITE_TASK_ADMISSION", "FINITE_TASK_IMPLEMENTATION"].includes(proof?.authorityType)
    && proof?.draftSourceOnly === false;
}

function brandSourceAuthority(proof, { identity, lifecycle } = {}) {
  if (!verifyPhase1SourceAuthorityProof(proof, { identity, lifecycle })) throw new Error("PHASE1_SOURCE_AUTHORITY_INVALID");
  sourceAuthorityBrand.add(proof); return proof;
}

export function evaluatePhase1Admission(input = {}) {
  const identity = input.identity ?? {};
  const lifecycle = input.lifecycle ?? {};
  const run = input.run ?? {};
  const workflowIntegrity = input.workflowIntegrity ?? {};
  const evaluatorIdentity = input.evaluatorIdentity ?? {};
  const publisherAnchor = input.publisherAnchor ?? {};
  const required = [...PHASE1_REQUIRED_LANES];
  const suppliedJobs = Array.isArray(input.jobs) ? input.jobs : [];
  const matchingJobs = suppliedJobs.filter((job) => required.includes(job?.name));
  const contextJobs = suppliedJobs.filter((job) => typeof job?.name === "string" && job.name.startsWith(CONTEXT_PREFIX));
  const contextMatch = contextJobs.length === 1 ? CONTEXT_RE.exec(contextJobs[0].name) : null;
  const identityValid = identity.repository === REPOSITORY
    && Number.isInteger(identity.pr) && identity.pr > 0
    && typeof identity.headRef === "string" && identity.headRef.length > 0
    && validSha(identity.headSha) && validSha(identity.sourceTree)
    && identity.baseRef === "main"
    && validSha(identity.baseSha);
  const mode = lifecycle.draft === true ? PHASE1_MODES.DRAFT : PHASE1_MODES.READY;
  const lifecycleValid = (lifecycle.draft === true || lifecycle.draft === false)
    && lifecycleActions.has(lifecycle.action) && validTimestamp(lifecycle.eventUpdatedAt)
    && DIGEST_RE.test(lifecycle.generation ?? "");
  const contextValid = Boolean(contextMatch
    && contextMatch[1] === mode && Number(contextMatch[2]) === identity.pr && contextMatch[3] === identity.baseSha
    && contextMatch[4] === lifecycle.action && contextMatch[5] === lifecycle.eventUpdatedAt
    && lifecycle.generation === derivePhase1LifecycleGeneration({ identity, mode, action: contextMatch[4], eventUpdatedAt: contextMatch[5] })
    && contextJobs[0]?.status === "completed" && contextJobs[0]?.conclusion === "success"
    && Number.isInteger(contextJobs[0]?.id) && contextJobs[0].id > 0
    && contextJobs[0]?.run_id === run.id && contextJobs[0]?.head_sha === identity.headSha);
  const runValid = Number.isInteger(run.id) && run.id > 0
    && Number.isInteger(run.runAttempt) && run.runAttempt > 0
    && run.name === WORKFLOW_NAME && run.path === WORKFLOW_PATH
    && run.event === "pull_request" && run.status === "completed"
    && run.repository === identity.repository && run.pr === identity.pr
    && run.headRef === identity.headRef && run.headSha === identity.headSha
    && run.baseRef === identity.baseRef && run.baseSha === identity.baseSha
    && run.lifecycleMode === mode && run.durableAssociation === true && contextValid;
  const evaluatorValid = evaluatorIdentity.sha === identity.baseSha
    && validSha(evaluatorIdentity.sha)
    && evaluatorIdentity.workflowBlobSha === workflowIntegrity.protectedBlobSha;
  const trustedContext = identityValid && lifecycleValid && runValid && evaluatorValid
    && input.evidenceComplete === true && input.paginationComplete === true
    && workflowIntegrity.trusted === true && workflowIntegrity.complete === true
    && typeof workflowIntegrity.candidateBlobSha === "string"
    && workflowIntegrity.candidateBlobSha === workflowIntegrity.protectedBlobSha;
  const publisherAnchorValid = publisherAnchorBrand.has(publisherAnchor)
    && publisherAnchor.repository === identity.repository
    && DIGEST_RE.test(publisherAnchor.anchorHash ?? "")
    && ["PRE_CUTOVER_13_RAW", "STAGE1_AGGREGATE_PLUS_13_RAW", "FINAL_AGGREGATE_ONLY"].includes(publisherAnchor.currentRulesetStage)
    && publisherAnchor.paginationComplete === true && publisherAnchor.immutableOwnerEvidence === true
    && Array.isArray(publisherAnchor.findings) && publisherAnchor.findings.length === 0;

  const preflight = [];
  if (!identityValid || !runValid || !evaluatorValid) preflight.push(finding("PHASE1_RUN_IDENTITY_INVALID", null));
  if (!lifecycleValid) preflight.push(finding("PHASE1_LIFECYCLE_INVALID", null));
  if (input.publisherAnchorRequired === true && !publisherAnchorValid) preflight.push(finding("SOURCE_IDENTITY_AMBIGUITY", null, { message: "publisher immutable anchor invalid" }));
  if (input.sourceAuthorityRequired === true && !sourceAuthorityBrand.has(input.sourceAuthorityProof)) preflight.push(finding("SOURCE_IDENTITY_AMBIGUITY", null, { message: "protected source authority invalid" }));
  if (input.evidenceComplete !== true || input.paginationComplete !== true) preflight.push(finding("PHASE1_EVIDENCE_INCOMPLETE", null));
  const jobIds = suppliedJobs.map(({ id }) => id);
  if (jobIds.some((id) => !Number.isInteger(id) || id < 1) || jobIds.length !== new Set(jobIds).size) preflight.push(finding("PHASE1_EVIDENCE_INCOMPLETE", null));
  if (workflowIntegrity.trusted !== true || workflowIntegrity.complete !== true
    || !workflowIntegrity.candidateBlobSha || workflowIntegrity.candidateBlobSha !== workflowIntegrity.protectedBlobSha) {
    preflight.push(finding("PHASE1_WORKFLOW_INTEGRITY_INVALID", null));
  }
  const lanes = [];
  for (const name of required) {
    const jobs = matchingJobs.filter((job) => job?.name === name);
    if (jobs.length === 0) {
      const observed = finding("PHASE1_REQUIRED_LANE_MISSING", name);
      lanes.push({ name, result: PHASE1_LANE_RESULTS.BLOCKING, findings: [classifyPhase1Finding(observed, { trustedContext })] });
    } else if (jobs.length > 1) {
      const observed = finding("PHASE1_REQUIRED_LANE_DUPLICATE", name);
      lanes.push({ name, result: PHASE1_LANE_RESULTS.BLOCKING, findings: [classifyPhase1Finding(observed, { trustedContext })] });
    } else lanes.push(classifyLane(jobs[0], trustedContext, { identity, run, maintenanceProof: input.maintenanceProof }));
  }

  const extraFindings = Array.isArray(input.findings) ? input.findings : [];
  const classified = [
    ...preflight.map((value) => classifyPhase1Finding(value, { trustedContext })),
    ...lanes.flatMap((lane) => lane.findings),
    // Free-form/caller-supplied classification is never trusted. Maintenance
    // exceptions must arrive as exact protected-main certificates above.
    ...extraFindings.map((value) => classifyPhase1Finding(value, { trustedContext: false })),
  ];
  const blockingFindings = classified.filter(({ classification }) => classification === PHASE1_LANE_RESULTS.BLOCKING);
  const nonBlockingAssuranceFindings = classified.filter(({ classification }) => classification === PHASE1_LANE_RESULTS.NON_BLOCKING);
  const deferredExternalFindings = classified.filter(({ classification }) => classification === PHASE1_LANE_RESULTS.DEFERRED_EXTERNAL);
  if (mode === PHASE1_MODES.READY && deferredExternalFindings.length > 0) {
    for (const value of deferredExternalFindings) blockingFindings.push({ ...value, classification: PHASE1_LANE_RESULTS.BLOCKING });
  }
  const acceptable = blockingFindings.length === 0;
  const result = acceptable
    ? (mode === PHASE1_MODES.DRAFT ? PHASE1_ADMISSION_RESULTS.SOURCE_READINESS_ACCEPTABLE : PHASE1_ADMISSION_RESULTS.ACCEPTABLE)
    : PHASE1_ADMISSION_RESULTS.BLOCKED;
  const maintenanceStatus = nonBlockingAssuranceFindings.length > 0 ? PHASE1_ADMISSION_RESULTS.MAINTENANCE_REQUIRED : null;
  const rawPassedLanes = lanes.filter(({ result: laneResult }) => laneResult === PHASE1_LANE_RESULTS.PASS).length;
  const rawFailedLanes = required.length - rawPassedLanes;
  const affectedRiskDomains = uniqueSorted(lanes
    .filter(({ result: laneResult }) => laneResult !== PHASE1_LANE_RESULTS.PASS)
    .map(({ name }) => riskDomainByLane[name] ?? "UNKNOWN"));
  const sourceBody = {
    schemaVersion: "PHASE1_ADMISSION_DECISION_V1",
    checkName: PHASE1_ADMISSION_CHECK_NAME,
    result,
    maintenanceStatus,
    acceptable,
    repository: identity.repository ?? null,
    pr: identity.pr ?? null,
    headRef: identity.headRef ?? null,
    headSha: identity.headSha ?? null,
    sourceTree: identity.sourceTree ?? null,
    baseRef: identity.baseRef ?? null,
    baseSha: identity.baseSha ?? null,
    evaluatorSha: evaluatorIdentity.sha ?? null,
    action: lifecycle.action ?? null,
    eventUpdatedAt: lifecycle.eventUpdatedAt ?? null,
    lifecycleGeneration: lifecycle.generation ?? null,
    draft: lifecycle.draft ?? null,
    mode,
    runId: run.id ?? null,
    runAttempt: run.runAttempt ?? null,
    requiredLanes: required.length,
    rawPassedLanes,
    rawFailedLanes,
    affectedRiskDomains,
    currentRulesetStage: publisherAnchorValid ? publisherAnchor.currentRulesetStage : null,
    publisherAnchorHash: publisherAnchorValid ? publisherAnchor.anchorHash : null,
    publisherProvisioningReadbackHash: publisherAnchorValid ? publisherAnchor.provisioningReadbackHash : null,
    laneResults: lanes,
    blockingFindings,
    nonBlockingAssuranceFindings,
    deferredExternalFindings,
  };
  const phase1SourceDecisionHash = hashValue(sourceBody);
  const mergeEligibility = input.mergeEligibility ?? {};
  const mergeAuthorityGranted = acceptable && mode === PHASE1_MODES.READY
    && mergeEligibilityBrand.has(mergeEligibility)
    && mergeEligibility.schemaVersion === "PHASE1_MERGE_ELIGIBILITY_V1"
    && mergeEligibility.producer === "PROTECTED_MAIN_ENGINEERING_CLOSURE_V1"
    && mergeEligibility.repository === identity.repository && mergeEligibility.pr === identity.pr
    && mergeEligibility.headSha === identity.headSha && mergeEligibility.sourceTree === identity.sourceTree
    && mergeEligibility.baseSha === identity.baseSha
    && mergeEligibility.phase1SourceDecisionHash === phase1SourceDecisionHash
    && mergeEligibility.publisherAnchorHash === sourceBody.publisherAnchorHash
    && mergeEligibility.publisherProvisioningReadbackHash === sourceBody.publisherProvisioningReadbackHash
    && mergeEligibility.currentRulesetStage === sourceBody.currentRulesetStage
    && mergeEligibility.ownerScopeValid === true && mergeEligibility.exactHeadReviewValid === true
    && mergeEligibility.finalSourceValid === true && mergeEligibility.lifecycleValid === true
    && mergeEligibility.paginationComplete === true && mergeEligibility.ambiguous === false
    && Array.isArray(mergeEligibility.findings) && mergeEligibility.findings.length === 0;
  const body = { ...sourceBody, phase1SourceDecisionHash, mergeAuthorityGranted };
  const decisionHash = hashValue(body);
  const decision = { ...body, decisionHash };
  const output = { ...decision, evidence: decisionProjection(decision) };
  if (mergeAuthorityGranted) appMergeDecisionBrand.add(output);
  return output;
}

export function inspectPhase1AggregateEvidence({ aggregate, identity = {}, mode, stage = PHASE1_EVIDENCE_STAGES.FINAL, expectedRulesetStage, expectedPublisherAnchorHash, expectedPublisherProvisioningReadbackHash, requirePublisherAnchor = false } = {}) {
  const fullDecision = aggregate?.schemaVersion === "PHASE1_ADMISSION_DECISION_V1";
  const value = fullDecision ? decisionProjection(aggregate) : aggregate;
  const findings = [];
  if (value?.schemaVersion !== "PHASE1_ADMISSION_EVIDENCE_V1") findings.push("PHASE1_ADMISSION_SCHEMA_INVALID");
  if (value?.checkName !== PHASE1_ADMISSION_CHECK_NAME) findings.push("PHASE1_ADMISSION_CHECK_NAME_INVALID");
  if (value?.repository !== identity.repository || value?.pr !== identity.pr
    || value?.headSha !== identity.headSha || value?.baseSha !== identity.baseSha) findings.push("PHASE1_ADMISSION_IDENTITY_MISMATCH");
  if (value?.evaluatorSha !== value?.baseSha) findings.push("PHASE1_ADMISSION_EVALUATOR_IDENTITY_MISMATCH");
  const expectedTree = identity.tree ?? identity.sourceTree;
  if (expectedTree !== undefined && value?.sourceTree !== expectedTree) findings.push("PHASE1_ADMISSION_SOURCE_TREE_MISMATCH");
  if (mode !== undefined && value?.mode !== mode) findings.push("PHASE1_ADMISSION_MODE_MISMATCH");
  if (![PHASE1_EVIDENCE_STAGES.SOURCE, PHASE1_EVIDENCE_STAGES.FINAL].includes(stage)) findings.push("PHASE1_ADMISSION_STAGE_INVALID");
  if (!DIGEST_RE.test(value?.decisionHash ?? "") || !DIGEST_RE.test(value?.phase1SourceDecisionHash ?? "")
    || !validSha(value?.headSha) || !validSha(value?.baseSha) || !validSha(value?.sourceTree)) findings.push("PHASE1_ADMISSION_HASH_MALFORMED");
  const rulesetStagePresent = value?.currentRulesetStage !== null && value?.currentRulesetStage !== undefined;
  const anchorHashPresent = value?.publisherAnchorHash !== null && value?.publisherAnchorHash !== undefined;
  const provisioningHashPresent = value?.publisherProvisioningReadbackHash !== null && value?.publisherProvisioningReadbackHash !== undefined;
  const publisherAnchorPresent = rulesetStagePresent && anchorHashPresent && provisioningHashPresent;
  if (new Set([rulesetStagePresent, anchorHashPresent, provisioningHashPresent]).size !== 1) findings.push("PHASE1_ADMISSION_PUBLISHER_ANCHOR_INVALID");
  if ((requirePublisherAnchor || publisherAnchorPresent)
    && (!["PRE_CUTOVER_13_RAW", "STAGE1_AGGREGATE_PLUS_13_RAW", "FINAL_AGGREGATE_ONLY"].includes(value?.currentRulesetStage)
      || !DIGEST_RE.test(value?.publisherAnchorHash ?? "")
      || !DIGEST_RE.test(value?.publisherProvisioningReadbackHash ?? "")
      || (expectedRulesetStage !== undefined && value.currentRulesetStage !== expectedRulesetStage)
      || (expectedPublisherAnchorHash !== undefined && value.publisherAnchorHash !== expectedPublisherAnchorHash)
      || (expectedPublisherProvisioningReadbackHash !== undefined && value.publisherProvisioningReadbackHash !== expectedPublisherProvisioningReadbackHash))) findings.push("PHASE1_ADMISSION_PUBLISHER_ANCHOR_INVALID");
  if (!Number.isInteger(value?.runId) || value.runId < 1 || !Number.isInteger(value?.runAttempt) || value.runAttempt < 1) findings.push("PHASE1_ADMISSION_RUN_INVALID");
  if (!lifecycleActions.has(value?.action) || !validTimestamp(value?.eventUpdatedAt)
    || typeof value?.draft !== "boolean"
    || value?.lifecycleGeneration !== derivePhase1LifecycleGeneration({ identity: value, mode: value?.mode, action: value?.action, eventUpdatedAt: value?.eventUpdatedAt })) findings.push("PHASE1_ADMISSION_LIFECYCLE_INVALID");
  if (value?.requiredLanes !== PHASE1_REQUIRED_LANES.length
    || !Number.isInteger(value?.rawPassedLanes) || !Number.isInteger(value?.rawFailedLanes)
    || value.rawPassedLanes + value.rawFailedLanes !== PHASE1_REQUIRED_LANES.length) findings.push("PHASE1_ADMISSION_LANE_ACCOUNTING_INVALID");
  const expectedResult = value?.mode === PHASE1_MODES.DRAFT ? PHASE1_ADMISSION_RESULTS.SOURCE_READINESS_ACCEPTABLE : PHASE1_ADMISSION_RESULTS.ACCEPTABLE;
  if (value?.acceptable !== true || value?.result !== expectedResult || value?.blockingFindingCount !== 0) findings.push("PHASE1_ADMISSION_NOT_ACCEPTABLE");
  if (value?.mode === PHASE1_MODES.DRAFT && value?.mergeAuthorityGranted !== false) findings.push("PHASE1_DRAFT_MERGE_AUTHORITY_INVALID");
  if (stage === PHASE1_EVIDENCE_STAGES.SOURCE && value?.mergeAuthorityGranted !== false) findings.push("PHASE1_SOURCE_EVIDENCE_AUTHORITY_INVALID");
  if (stage === PHASE1_EVIDENCE_STAGES.FINAL && (value?.mode !== PHASE1_MODES.READY || value?.mergeAuthorityGranted !== true)) findings.push("PHASE1_FINAL_ADMISSION_AUTHORITY_INVALID");
  if (fullDecision) {
    const { decisionHash: suppliedHash, evidence: _evidence, ...body } = aggregate;
    if (hashValue(body) !== suppliedHash) findings.push("PHASE1_ADMISSION_DECISION_HASH_MISMATCH");
  }
  return { ok: findings.length === 0, findings, evidence: value ?? null };
}

export function verifyPhase1AggregateEvidence(options = {}) {
  const value = options.aggregate?.schemaVersion === "PHASE1_ADMISSION_DECISION_V1"
    ? decisionProjection(options.aggregate)
    : options.aggregate;
  const inspected = inspectPhase1AggregateEvidence(options);
  const findings = [...inspected.findings];
  if (!aggregateEvidenceBrand.has(value)) findings.unshift("PHASE1_ADMISSION_PROTECTED_READBACK_REQUIRED");
  return { ok: findings.length === 0, findings, evidence: inspected.evidence };
}

export function parsePhase1AdmissionCheckReadback({ checks, paginationComplete, identity, stage, publisherAppId = null, expectedRulesetStage, expectedPublisherAnchorHash, expectedPublisherProvisioningReadbackHash } = {}) {
  if (paginationComplete !== true || !Array.isArray(checks) || checks.length !== 1) throw new Error("PHASE1_ADMISSION_CHECK_READBACK_CARDINALITY_INVALID");
  const check = checks[0];
  if (!validAdmissionCheckAnyGeneration(check, identity, publisherAppId) || check?.status !== "completed") throw new Error("PHASE1_ADMISSION_CHECK_READBACK_PROVENANCE_INVALID");
  const expectedConclusion = [PHASE1_EVIDENCE_STAGES.SOURCE, PHASE1_EVIDENCE_STAGES.FINAL].includes(stage) ? "action_required" : null;
  if (!expectedConclusion || check?.conclusion !== expectedConclusion) throw new Error("PHASE1_ADMISSION_CHECK_READBACK_STAGE_INVALID");
  const summary = check?.output?.summary;
  const marker = "\n\nDecision: ";
  if (typeof summary !== "string" || summary.split(marker).length !== 2) throw new Error("PHASE1_ADMISSION_CHECK_OUTPUT_INVALID");
  let evidence;
  try {
    evidence = JSON.parse(summary.split(marker)[1]);
  } catch {
    throw new Error("PHASE1_ADMISSION_CHECK_OUTPUT_INVALID");
  }
  if (summary.split(marker)[1] !== stableJson(evidence)) throw new Error("PHASE1_ADMISSION_CHECK_OUTPUT_NONCANONICAL");
  const exactExternalId = `phase1-admission:v1:${identity.pr}:${identity.headSha}:${evidence?.lifecycleGeneration}:${evidence?.runId}:${evidence?.decisionHash}`;
  if (check.external_id !== exactExternalId || check?.output?.title !== evidence?.result) throw new Error("PHASE1_ADMISSION_CHECK_OUTPUT_BINDING_INVALID");
  const verified = inspectPhase1AggregateEvidence({ aggregate: evidence, identity, stage, mode: evidence?.mode, expectedRulesetStage, expectedPublisherAnchorHash, expectedPublisherProvisioningReadbackHash, requirePublisherAnchor: expectedRulesetStage !== undefined || expectedPublisherAnchorHash !== undefined || expectedPublisherProvisioningReadbackHash !== undefined });
  if (!verified.ok) throw new Error(`PHASE1_ADMISSION_CHECK_EVIDENCE_INVALID:${verified.findings.join(",")}`);
  return verified.evidence;
}

function parseArgs(argv) {
  return Object.fromEntries(argv.slice(2).filter((arg) => arg.startsWith("--")).map((arg) => {
    const [key, ...parts] = arg.slice(2).split("=");
    return [key, parts.length === 0 ? true : parts.join("=")];
  }));
}

async function githubRawRequest(apiPath, token, options = {}) {
  return fetch(`https://api.github.com${apiPath}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      ...(typeof token === "string" && token ? { Authorization: `Bearer ${token}` } : {}),
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers ?? {}),
    },
  });
}

async function githubRequest(apiPath, token, options = {}) {
  const response = await githubRawRequest(apiPath, token, options);
  if (!response.ok) throw new Error(`GITHUB_API_${response.status}:${apiPath}`);
  if (response.status === 204) return null;
  return response.json();
}
async function githubBytesRequest(apiPath, token) {
  const response = await fetch(`https://api.github.com${apiPath}`, { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" } });
  if (!response.ok) throw new Error(`GITHUB_API_${response.status}:${apiPath}`);
  return Buffer.from(await response.arrayBuffer());
}

export function verifyProtectedPhase1PublisherRuntimeIdentity(value) {
  return publisherRuntimeIdentityBrand.has(value) && value?.schemaVersion === 1
    && value?.contract === "PHASE1_ADMISSION_PUBLISHER_RUNTIME_IDENTITY_V1"
    && value?.runtimeIdentityHash === hashValue(Object.fromEntries(Object.entries(value).filter(([key]) => key !== "runtimeIdentityHash")));
}

export function verifyProtectedPhase1PublisherProvisioningReadback(value) {
  return publisherProvisioningBrand.has(value) && value?.schemaVersion === 1
    && value?.contract === "PHASE1_ADMISSION_PUBLISHER_PROVISIONING_READBACK_V1"
    && value?.readbackHash === hashValue(Object.fromEntries(Object.entries(value).filter(([key]) => key !== "readbackHash")));
}

export function normalizePhase1PublisherAppPrivacyAndWebhookReadback({ app, publicAppStatus, webhookStatus, webhookConfig } = {}) {
  const hasPublicField = app && typeof app === "object" && Object.hasOwn(app, "public");
  const hasHookAttributes = app && typeof app === "object" && Object.hasOwn(app, "hook_attributes");
  const hookAttributes = app?.hook_attributes;
  const explicitHookDisabled = !hasHookAttributes || (hookAttributes && typeof hookAttributes === "object" && !Array.isArray(hookAttributes)
    && hookAttributes.active === false && [undefined, null, ""].includes(hookAttributes.url));
  const webhookNotConfigured = webhookStatus === 404 && webhookConfig == null;
  const webhookProjection = {
    evidence: "JWT_DISABLED_HOOK_CONFIG_404",
    httpStatus: webhookStatus,
    url: [null, ""].includes(webhookConfig?.url ?? null) ? null : webhookConfig.url,
    contentType: webhookConfig?.content_type ?? null,
    insecureSsl: webhookConfig?.insecure_ssl ?? null,
  };
  if ((hasPublicField && app.public !== false) || publicAppStatus !== 404
    || !explicitHookDisabled || !webhookNotConfigured
    || webhookProjection.url !== null) throw new Error("PHASE1_PUBLISHER_APP_PRIVACY_OR_WEBHOOK_INVALID");
  return Object.freeze({ public: false, publicEvidence: "ANONYMOUS_EXACT_SLUG_404", publicAppStatus, webhook: Object.freeze(webhookProjection) });
}

async function githubCollection(apiPath, key, token) {
  const values = [];
  for (let page = 1; page <= 20; page += 1) {
    const separator = apiPath.includes("?") ? "&" : "?";
    const pageValue = await githubRequest(`${apiPath}${separator}per_page=100&page=${page}`, token);
    if (!Number.isInteger(pageValue?.total_count) || !Array.isArray(pageValue?.[key])) throw new Error("PHASE1_PUBLISHER_READBACK_PAGINATION_MALFORMED");
    values.push(...pageValue[key]);
    if (values.length >= pageValue.total_count) return values;
    if (pageValue[key].length === 0) break;
  }
  throw new Error("PHASE1_PUBLISHER_READBACK_PAGINATION_INCOMPLETE");
}

const rulesetStagePayload = ({ ruleset, commonRules, statusRule, checks, bypassActors, restrictUpdates }) => ({
  name: ruleset?.name, target: ruleset?.target, enforcement: ruleset?.enforcement,
  bypass_actors: bypassActors, conditions: ruleset?.conditions,
  rules: [...(restrictUpdates ? [{ type: "update", parameters: { update_allows_fetch_and_merge: false } }] : []), ...commonRules, { ...statusRule, parameters: { ...statusRule.parameters, required_status_checks: checks } }],
});

export function normalizeProtectedPhase1RulesetUpdateReadback(rules) {
  if (!Array.isArray(rules)) return null;
  const updates = rules.filter((rule) => rule?.type === "update");
  if (updates.length !== 1) return null;
  const update = updates[0];
  if (!update || typeof update !== "object" || Array.isArray(update)
    || ![["type"], ["parameters", "type"]].some((keys) => stableJson(Object.keys(update).sort()) === stableJson(keys))) return null;
  if (Object.hasOwn(update, "parameters") && (update.parameters === null || typeof update.parameters !== "object" || Array.isArray(update.parameters)
    || stableJson(Object.keys(update.parameters)) !== stableJson(["update_allows_fetch_and_merge"])
    || update.parameters.update_allows_fetch_and_merge !== false)) return null;
  return Object.freeze({ type: "update", parameters: Object.freeze({ update_allows_fetch_and_merge: false }) });
}

export function classifyProtectedPhase1RulesetBypassReadback({ ruleset, publisherAppId } = {}) {
  const appBypass = [{ actor_id: publisherAppId, actor_type: "Integration", bypass_mode: "pull_request" }];
  if (stableJson(ruleset?.bypass_actors) === "[]" && ruleset?.current_user_can_bypass === "never") return "EXPLICIT_EMPTY";
  if (Number.isInteger(publisherAppId) && publisherAppId > 0 && stableJson(ruleset?.bypass_actors) === stableJson(appBypass)) return "EXPLICIT_APP_PULL_REQUEST_ONLY";
  if (ruleset?.bypass_actors == null && [undefined, null, "never"].includes(ruleset?.current_user_can_bypass)) return "OWNER_IMMUTABLE_STAGE_RECEIPT_REQUIRED";
  return null;
}

export async function resolveProtectedPhase1PublisherProvisioningReadback({ repository, environmentToken, readToken, app, appPrivacy, installation, clientId, keyFingerprint, jwtAppReadbackHash, webhookConfigHash } = {}) {
  if (repository !== REPOSITORY || typeof environmentToken !== "string" || !environmentToken || typeof readToken !== "string" || !readToken) throw new Error("PHASE1_PUBLISHER_READBACK_INPUT_INVALID");
  const exactJwtReadbackHash = hashValue({ id: app?.id, clientId: app?.client_id, name: app?.name, slug: app?.slug, owner: app?.owner?.login, public: appPrivacy?.public, publicEvidence: appPrivacy?.publicEvidence, publicAppStatus: appPrivacy?.publicAppStatus, permissions: app?.permissions, events: app?.events, hook: appPrivacy?.webhook });
  if (!publisherAppPrivacyBrand.has(appPrivacy) || appPrivacy?.public !== false || appPrivacy?.publicAppStatus !== 404
    || appPrivacy?.publicEvidence !== "ANONYMOUS_EXACT_SLUG_404" || appPrivacy?.webhook?.evidence !== "JWT_DISABLED_HOOK_CONFIG_404"
    || webhookConfigHash !== hashValue(appPrivacy.webhook) || jwtAppReadbackHash !== exactJwtReadbackHash) throw new Error("PHASE1_PUBLISHER_APP_READBACK_PROVENANCE_INVALID");
  const environmentName = "phase1-admission-publisher";
  const environment = await githubRequest(`/repos/${repository}/environments/${environmentName}`, readToken);
  const branches = await githubCollection(`/repos/${repository}/environments/${environmentName}/deployment-branch-policies`, "branch_policies", readToken);
  const variables = await githubCollection(`/repos/${repository}/environments/${environmentName}/variables`, "variables", environmentToken);
  const secrets = await githubCollection(`/repos/${repository}/environments/${environmentName}/secrets`, "secrets", environmentToken);
  const ruleset = await githubRequest(`/repos/${repository}/rulesets/18940814`, readToken);
  const requiredRules = Array.isArray(ruleset?.rules) ? ruleset.rules.filter(({ type }) => type === "required_status_checks") : [];
  const commonRules = Array.isArray(ruleset?.rules) ? ruleset.rules.filter(({ type }) => !["required_status_checks", "update"].includes(type)) : [];
  const currentChecks = requiredRules[0]?.parameters?.required_status_checks;
  const raw = PHASE1_REQUIRED_LANES.map((context) => ({ context, integration_id: 15368 }));
  const aggregate = { context: PHASE1_ADMISSION_CHECK_NAME, integration_id: app?.id };
  const stage1Checks = [...raw, aggregate];
  const appBypass = [{ actor_id: app?.id, actor_type: "Integration", bypass_mode: "pull_request" }];
  const updateRules = Array.isArray(ruleset?.rules) ? ruleset.rules.filter(({ type }) => type === "update") : [];
  const updateRule = normalizeProtectedPhase1RulesetUpdateReadback(ruleset?.rules);
  const bypassReadback = classifyProtectedPhase1RulesetBypassReadback({ ruleset, publisherAppId: app?.id });
  const bypassExact = bypassReadback === "EXPLICIT_APP_PULL_REQUEST_ONLY";
  const bypassHidden = bypassReadback === "OWNER_IMMUTABLE_STAGE_RECEIPT_REQUIRED";
  const stage = stableJson(currentChecks) === stableJson(raw) && updateRules.length === 0 && stableJson(ruleset?.bypass_actors ?? []) === "[]" ? "PRE_CUTOVER_13_RAW"
    : stableJson(currentChecks) === stableJson(stage1Checks) && updateRules.length === 0 && stableJson(ruleset?.bypass_actors ?? []) === "[]" ? "STAGE1_AGGREGATE_PLUS_13_RAW"
    : stableJson(currentChecks) === stableJson([aggregate]) && stableJson(updateRule) === stableJson({ type: "update", parameters: { update_allows_fetch_and_merge: false } }) && (bypassExact || bypassHidden) ? "FINAL_AGGREGATE_ONLY" : null;
  const variableMap = Object.fromEntries(variables.map(({ name, value }) => [name, value]));
  if (environment?.name !== environmentName || !Number.isInteger(environment?.id) || environment.id < 1 || environment?.can_admins_bypass !== false
    || stableJson(environment?.deployment_branch_policy) !== stableJson({ protected_branches: false, custom_branch_policies: true })
    || !Array.isArray(environment?.protection_rules) || environment.protection_rules.length !== 1 || environment.protection_rules[0]?.type !== "branch_policy"
    || branches.length !== 1 || branches[0]?.name !== "main" || branches[0]?.type !== "branch"
    || stableJson(Object.keys(variableMap).sort()) !== stableJson(["PHASE1_ADMISSION_APP_CLIENT_ID", "PHASE1_ADMISSION_APP_INSTALLATION_ID", "PHASE1_ADMISSION_APP_INTEGRATION_ID", "PHASE1_ADMISSION_APP_KEY_FINGERPRINT"])
    || variableMap.PHASE1_ADMISSION_APP_CLIENT_ID !== clientId || variableMap.PHASE1_ADMISSION_APP_INSTALLATION_ID !== String(installation?.id) || variableMap.PHASE1_ADMISSION_APP_INTEGRATION_ID !== String(app?.id)
    || variableMap.PHASE1_ADMISSION_APP_KEY_FINGERPRINT !== keyFingerprint
    || stableJson(secrets.map(({ name }) => name).sort()) !== stableJson(["PHASE1_ADMISSION_APP_PRIVATE_KEY"])
    || !secrets.every(({ created_at: createdAt, updated_at: updatedAt }) => validTimestamp(createdAt) && validTimestamp(updatedAt))
    || ruleset?.id !== 18940814 || typeof ruleset?.node_id !== "string" || !ruleset.node_id || !validTimestamp(ruleset?.updated_at)
    || ruleset?.name !== "main-pr-review-protection" || ruleset?.target !== "branch" || ruleset?.enforcement !== "active"
    || stableJson(commonRules.map(({ type }) => type)) !== stableJson(["pull_request", "non_fast_forward", "deletion"])
    || !bypassReadback || requiredRules.length !== 1 || !stage) throw new Error("PHASE1_PUBLISHER_PROVISIONING_READBACK_INVALID");
  const stageInput = { ruleset, commonRules, statusRule: requiredRules[0] };
  const prestate = rulesetStagePayload({ ...stageInput, checks: raw, bypassActors: [], restrictUpdates: false });
  const stage1 = rulesetStagePayload({ ...stageInput, checks: stage1Checks, bypassActors: [], restrictUpdates: false });
  const final = rulesetStagePayload({ ...stageInput, checks: [aggregate], bypassActors: appBypass, restrictUpdates: true });
  if (hashValue(prestate) !== "1bf616541bc6a87b7b559374a99e1478fe229087466b998e59c5b1cecfa1cb09") throw new Error("PHASE1_RULESET_PRESTATE_IDENTITY_INVALID");
  const engine = await import("./engineering-closure.mjs");
  const body = {
    schemaVersion: 1, contract: "PHASE1_ADMISSION_PUBLISHER_PROVISIONING_READBACK_V1", repository, owner: "Chillywood2025",
    originalContractHash: engine.hashValue(engine.PHASE1_ADMISSION_PUBLISHER_PROVISIONING_V1),
    observedAt: [environment?.updated_at, ruleset?.updated_at].filter(validTimestamp).sort((left, right) => Date.parse(left) - Date.parse(right)).at(-1),
    app: { id: app.id, clientId, name: app.name, slug: app.slug, public: false, permissions: { checks: "write", contents: "write", environments: "read", statuses: "write", metadata: "read" }, events: app.events, webhook: { active: false, url: null, configReadbackHash: webhookConfigHash }, ownerUiSettingsProjection: engine.PHASE1_ADMISSION_PUBLISHER_PROVISIONING_V1.app.ownerUiSettingsProjection, jwtSelfReadbackHash: jwtAppReadbackHash, key: { publicKeySpkiSha256: keyFingerprint } },
    installation: { id: installation.id, appId: app.id, repositorySelection: installation.repository_selection, repositories: [repository], suspended: installation.suspended_at != null },
    environment: { id: environment.id, name: environmentName, protectedBranches: false, customBranchPolicies: true, deploymentBranches: ["main"], requiredReviewers: [], preventSelfReview: false, allowAdministratorsToBypass: false, variableNames: Object.keys(variableMap).sort(), secretNames: secrets.map(({ name }) => name).sort(), secretMetadata: secrets.map(({ name, created_at: createdAt, updated_at: updatedAt }) => ({ name, createdAt, updatedAt })).sort((a, b) => a.name.localeCompare(b.name)), secretValuesIncluded: false },
    aggregate: { context: PHASE1_ADMISSION_CHECK_NAME, publisher: "DEDICATED_GITHUB_APP_ONLY", rawLaneExecutionCount: 13, displayOnlyNeverPassing: true, mergeAuthoritySource: "APP_ONLY_SHA_BOUND_MERGE_API", integrationId: app.id },
    ruleset: { id: ruleset.id, nodeId: ruleset.node_id, providerUpdatedAt: ruleset.updated_at, bypassReadback, prestatePutPayloadSha256: hashValue(prestate), stage1PutPayloadSha256: hashValue(stage1), finalPutPayloadSha256: hashValue(final), rollbackPutPayloadSha256: hashValue(prestate), stage, currentPutPayloadSha256: stage === "PRE_CUTOVER_13_RAW" ? hashValue(prestate) : stage === "STAGE1_AGGREGATE_PLUS_13_RAW" ? hashValue(stage1) : hashValue(final) },
    authority: { repositoryMerge: true, product: false, providerMutationBeyondThisContract: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false },
  };
  const value = { ...body, readbackHash: hashValue(body) };
  publisherProvisioningBrand.add(value);
  return value;
}

const base64url = (value) => Buffer.from(value).toString("base64url");

function githubAppJwt(clientId, privateKey) {
  if (!validGitHubAppClientId(clientId)
    || typeof privateKey !== "string" || !privateKey.includes("PRIVATE KEY")) throw new Error("PHASE1_PUBLISHER_CREDENTIAL_INPUT_INVALID");
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 540, iss: clientId }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), privateKey.replace(/\\n/gu, "\n")).toString("base64url");
  return `${signingInput}.${signature}`;
}

async function publisherInstallationToken(repository, readToken, clientId, privateKey, expectedAppId, expectedInstallationId, expectedKeyFingerprint, mode = "publisher") {
  const jwt = githubAppJwt(clientId, privateKey);
  const app = await githubRequest("/app", jwt);
  const keyFingerprint = crypto.createHash("sha256").update(crypto.createPublicKey(privateKey.replace(/\\n/gu, "\n")).export({ type: "spki", format: "der" })).digest("hex");
  if (!Number.isInteger(expectedAppId) || expectedAppId < 1 || app?.id !== expectedAppId
    || app?.name !== PHASE1_PUBLISHER_APP.name || app?.slug !== PHASE1_PUBLISHER_APP.slug
    || app?.owner?.login !== "Chillywood2025" || app?.client_id !== clientId
    || stableJson(app?.permissions) !== stableJson({ checks: "write", contents: "write", environments: "read", metadata: "read", statuses: "write" })
    || !Array.isArray(app?.events) || app.events.length !== 0
    || expectedKeyFingerprint !== keyFingerprint) throw new Error("PHASE1_PUBLISHER_APP_CONTRACT_INVALID");
  const publicAppResponse = await githubRawRequest(`/apps/${encodeURIComponent(PHASE1_PUBLISHER_APP.slug)}`, null, { redirect: "error" });
  const hookResponse = await githubRawRequest("/app/hook/config", jwt, { redirect: "error" });
  const hookConfig = null;
  const appPrivacy = normalizePhase1PublisherAppPrivacyAndWebhookReadback({ app, publicAppStatus: publicAppResponse.status, webhookStatus: hookResponse.status, webhookConfig: hookConfig });
  publisherAppPrivacyBrand.add(appPrivacy);
  const hookProjection = appPrivacy.webhook;
  const webhookConfigHash = hashValue(hookProjection);
  const jwtAppReadbackHash = hashValue({ id: app?.id, clientId: app?.client_id, name: app?.name, slug: app?.slug, owner: app?.owner?.login, public: appPrivacy.public, publicEvidence: appPrivacy.publicEvidence, publicAppStatus: appPrivacy.publicAppStatus, permissions: app?.permissions, events: app?.events, hook: hookProjection });
  const installations = [];
  for (let page = 1; page <= 20; page += 1) {
    const values = await githubRequest(`/app/installations?per_page=100&page=${page}`, jwt);
    if (!Array.isArray(values)) throw new Error("PHASE1_PUBLISHER_INSTALLATION_PAGINATION_MALFORMED");
    installations.push(...values);
    if (values.length < 100) break;
    if (page === 20) throw new Error("PHASE1_PUBLISHER_INSTALLATION_PAGINATION_INCOMPLETE");
  }
  const eligible = installations.filter((installation) => installation?.account?.login === "Chillywood2025"
    && installation?.repository_selection === "selected" && installation?.suspended_at == null
    && stableJson(installation?.permissions) === stableJson({ checks: "write", contents: "write", environments: "read", metadata: "read", statuses: "write" }));
  if (eligible.length !== 1 || !Number.isInteger(expectedInstallationId) || expectedInstallationId < 1 || eligible[0]?.id !== expectedInstallationId) throw new Error("PHASE1_PUBLISHER_INSTALLATION_CARDINALITY_INVALID");
  const requestedPermissions = mode === "merge" ? { contents: "write" } : mode === "publisher" ? { checks: "write", environments: "read" } : null;
  if (!requestedPermissions) throw new Error("PHASE1_PUBLISHER_TOKEN_MODE_INVALID");
  const access = await githubRequest(`/app/installations/${eligible[0].id}/access_tokens`, jwt, {
    method: "POST",
    body: JSON.stringify({ repositories: ["chillywood-mobile"], permissions: requestedPermissions }),
  });
  if (typeof access?.token !== "string" || access.token.length < 1) throw new Error("PHASE1_PUBLISHER_TOKEN_INVALID");
  try {
    if (stableJson(access?.permissions) !== stableJson({ ...requestedPermissions, metadata: "read" })) throw new Error("PHASE1_PUBLISHER_TOKEN_INVALID");
    const installed = await githubRequest("/installation/repositories?per_page=100&page=1", access.token);
    if (installed?.total_count !== 1 || !Array.isArray(installed?.repositories) || installed.repositories.length !== 1
      || installed.repositories[0]?.full_name !== repository) throw new Error("PHASE1_PUBLISHER_REPOSITORY_SCOPE_INVALID");
    const runtimeBody = { schemaVersion: 1, contract: "PHASE1_ADMISSION_PUBLISHER_RUNTIME_IDENTITY_V1", repository, owner: "Chillywood2025", appId: app.id, clientId, installationId: eligible[0].id, appName: app.name, appSlug: app.slug, repositorySelection: eligible[0].repository_selection, repositories: [repository], permissions: { checks: "write", contents: "write", environments: "read", statuses: "write", metadata: "read" }, suspended: false };
    const runtimeIdentity = { ...runtimeBody, runtimeIdentityHash: hashValue(runtimeBody) };
    publisherRuntimeIdentityBrand.add(runtimeIdentity);
    const provisioningReadback = mode === "publisher" ? await resolveProtectedPhase1PublisherProvisioningReadback({ repository, environmentToken: access.token, readToken, app, appPrivacy, installation: eligible[0], clientId, keyFingerprint, jwtAppReadbackHash, webhookConfigHash }) : null;
    return { token: access.token, mode, appId: app.id, installationId: eligible[0].id, clientId, app, appPrivacy, installation: eligible[0], jwtAppReadbackHash, webhookConfigHash, runtimeIdentity, provisioningReadback };
  } catch (error) {
    await revokePublisherToken(access.token);
    throw error;
  }
}

const revokePublisherToken = (token) => githubRequest("/installation/token", token, { method: "DELETE" });

async function readProtectedEvaluatorSha(repository, token) {
  const metadata = await githubRequest(`/repos/${repository}`, token);
  if (metadata?.default_branch !== "main") throw new Error("PHASE1_PROTECTED_DEFAULT_BRANCH_INVALID");
  const ref = await githubRequest(`/repos/${repository}/git/ref/heads/main`, token);
  if (!validSha(ref?.object?.sha)) throw new Error("PHASE1_PROTECTED_DEFAULT_BRANCH_SHA_INVALID");
  return ref.object.sha;
}

async function readPr(repository, pr, token) {
  return githubRequest(`/repos/${repository}/pulls/${pr}`, token);
}

async function readCommitTree(repository, sha, token) {
  const commit = await githubRequest(`/repos/${repository}/git/commits/${sha}`, token);
  if (!validSha(commit?.tree?.sha)) throw new Error("PHASE1_SOURCE_TREE_UNAVAILABLE");
  return commit.tree.sha;
}

async function readCommit(repository, sha, token) {
  const value = await githubRequest(`/repos/${repository}/commits/${sha}`, token);
  const message = value?.commit?.message;
  const commit = { sha: value?.sha, tree: value?.commit?.tree?.sha, parents: (value?.parents ?? []).map(({ sha: parent }) => parent), subject: typeof message === "string" ? message.split("\n", 1)[0] : null };
  if (!validSha(commit.sha) || !validSha(commit.tree) || !commit.parents.every(validSha) || typeof commit.subject !== "string" || !commit.subject) throw new Error("PHASE1_GIT_COMMIT_READBACK_INVALID");
  return commit;
}

const ACTIVE_ACTIONS_STATUSES = Object.freeze(["requested", "queued", "in_progress", "waiting", "pending"]);
const APP_ONLY_MERGE_JOB_NAME = "Execute protected App-only merge gate";

export function evaluateRepositoryActionsQuiescence({ runs, recentRuns, paginationComplete, recentPaginationComplete, currentRunId, currentRunAttempt, evaluatorSha, gateStartedAt } = {}) {
  const values = Array.isArray(runs) ? runs : [];
  const recent = Array.isArray(recentRuns) ? recentRuns : [];
  const current = values.filter(({ id }) => id === currentRunId);
  const recentCurrent = recent.filter(({ id }) => id === currentRunId);
  const findings = [];
  if (paginationComplete !== true || recentPaginationComplete !== true || !Number.isInteger(currentRunId) || currentRunId < 1 || !Number.isInteger(currentRunAttempt) || currentRunAttempt < 1 || !validSha(evaluatorSha) || !validTimestamp(gateStartedAt)) findings.push("PHASE1_APP_MERGE_ACTIONS_PAGINATION_INVALID");
  if (current.length !== 1 || recentCurrent.length !== 1 || recent.length !== 1 || current[0]?.event !== "workflow_dispatch" || current[0]?.path !== ".github/workflows/phase1-admission.yml" || current[0]?.run_attempt !== currentRunAttempt || current[0]?.created_at !== gateStartedAt || current[0]?.head_sha !== evaluatorSha || current[0]?.head_branch !== "main" || current[0]?.actor?.login !== "Chillywood2025" || current[0]?.status !== "in_progress") findings.push("PHASE1_APP_MERGE_CURRENT_RUN_INVALID");
  if (values.some((run) => run?.id !== currentRunId)) findings.push("PHASE1_APP_MERGE_ACTIONS_NOT_QUIESCENT");
  const jobs = current[0]?.jobs;
  const activeJobs = Array.isArray(jobs) ? jobs.filter(({ status }) => status !== "completed") : [];
  if (current[0]?.jobsPaginationComplete !== true || activeJobs.length !== 1 || activeJobs[0]?.name !== APP_ONLY_MERGE_JOB_NAME || !["queued", "in_progress"].includes(activeJobs[0]?.status)) findings.push("PHASE1_APP_MERGE_CURRENT_JOB_INVALID");
  return { ok: findings.length === 0, findings: uniqueSorted(findings) };
}

async function readRepositoryActionsQuiescence({ repository, token, currentRunId, currentRunAttempt, evaluatorSha, gateStartedAt = null }) {
  const active = [];
  for (const status of ACTIVE_ACTIONS_STATUSES) {
    const values = await githubCollection(`/repos/${repository}/actions/runs?status=${status}`, "workflow_runs", token);
    active.push(...values);
  }
  const unique = [...new Map(active.map((run) => [run?.id, run])).values()];
  const current = unique.find(({ id }) => id === currentRunId);
  const startedAt = gateStartedAt ?? current?.created_at;
  const recent = validTimestamp(startedAt)
    ? await githubCollection(`/repos/${repository}/actions/runs?created=${encodeURIComponent(`>=${startedAt}`)}`, "workflow_runs", token)
    : [];
  if (current) {
    const jobs = await readRunJobs(repository, current, token);
    current.jobs = jobs.jobs;
    current.jobsPaginationComplete = jobs.complete;
  }
  const result = evaluateRepositoryActionsQuiescence({ runs: unique, recentRuns: recent, paginationComplete: true, recentPaginationComplete: true, currentRunId, currentRunAttempt, evaluatorSha, gateStartedAt: startedAt });
  if (!result.ok) throw new Error(result.findings.join(","));
  return { ...result, gateStartedAt: startedAt };
}

export function evaluateAppOnlyMergeGateSnapshot({ identity, decision, latestEvidence, pullRequest, defaultMainSha, sourceTree, execution, provisioningReadback, publisherAppId } = {}) {
  const findings = [];
  let liveIdentity = null;
  try { requireOpenPullRequest(pullRequest); liveIdentity = identityFromPr(identity?.repository, pullRequest); } catch { findings.push("PHASE1_APP_MERGE_PR_IDENTITY_INVALID"); }
  if (identity?.repository !== REPOSITORY || pullRequest?.draft !== false || stableJson(liveIdentity) !== stableJson({ repository: identity?.repository, pr: identity?.pr, headRef: identity?.headRef, headSha: identity?.headSha, baseRef: identity?.baseRef, baseSha: identity?.baseSha })) findings.push("PHASE1_APP_MERGE_PR_LIFECYCLE_INVALID");
  if (sourceTree !== identity?.sourceTree || defaultMainSha !== identity?.baseSha) findings.push("PHASE1_APP_MERGE_SOURCE_OR_BASE_STALE");
  if (decision?.repository !== identity?.repository || decision?.pr !== identity?.pr || decision?.headSha !== identity?.headSha || decision?.sourceTree !== identity?.sourceTree || decision?.baseSha !== identity?.baseSha || decision?.mode !== PHASE1_MODES.READY || decision?.draft !== false || decision?.acceptable !== true || decision?.mergeAuthorityGranted !== true || decision?.blockingFindings?.length !== 0 || decision?.requiredLanes !== 13 || decision?.rawPassedLanes + decision?.rawFailedLanes !== 13 || decision?.currentRulesetStage !== "FINAL_AGGREGATE_ONLY" || !DIGEST_RE.test(decision?.publisherAnchorHash ?? "") || stableJson(decision?.evidence) !== stableJson(latestEvidence)) findings.push("PHASE1_APP_MERGE_ADMISSION_INVALID");
  if (provisioningReadback?.schemaVersion !== 1 || provisioningReadback?.contract !== "PHASE1_ADMISSION_PUBLISHER_PROVISIONING_READBACK_V1" || provisioningReadback?.app?.id !== publisherAppId || provisioningReadback?.app?.slug !== PHASE1_PUBLISHER_APP.slug || provisioningReadback?.installation?.suspended !== false || provisioningReadback?.installation?.repositories?.length !== 1 || provisioningReadback.installation.repositories[0] !== identity?.repository || provisioningReadback?.ruleset?.stage !== "FINAL_AGGREGATE_ONLY" || !["EXPLICIT_APP_PULL_REQUEST_ONLY", "OWNER_IMMUTABLE_STAGE_RECEIPT_REQUIRED"].includes(provisioningReadback?.ruleset?.bypassReadback) || provisioningReadback?.aggregate?.displayOnlyNeverPassing !== true || provisioningReadback?.aggregate?.mergeAuthoritySource !== "APP_ONLY_SHA_BOUND_MERGE_API" || provisioningReadback?.readbackHash !== decision?.publisherProvisioningReadbackHash) findings.push("PHASE1_APP_MERGE_PROVIDER_GATE_INVALID");
  if (execution?.ref !== `refs/pull/${identity?.pr}/merge` || !validSha(execution?.sha) || !validSha(execution?.tree) || stableJson(execution?.parents) !== stableJson([identity?.baseSha, identity?.headSha])) findings.push("PHASE1_APP_MERGE_EXECUTION_INVALID");
  return {
    ok: findings.length === 0,
    findings: [...new Set(findings)].sort(),
    request: findings.length ? null : {
      sha: identity.headSha,
      merge_method: "merge",
      commit_title: `Merge pull request #${identity.pr} from Chillywood2025/${identity.headRef}`,
      commit_message: `Protected App-only merge of ${identity.headSha} into ${identity.baseSha}.`,
    },
    expected: findings.length ? null : { repository: identity.repository, pr: identity.pr, baseSha: identity.baseSha, headSha: identity.headSha, tree: execution.tree, executionSha: execution.sha, commitSubject: `Merge pull request #${identity.pr} from Chillywood2025/${identity.headRef}`, appLogin: `${PHASE1_PUBLISHER_APP.slug}[bot]` },
  };
}

export function evaluateAppOnlyMergePostcondition({ expected, response, pullRequest, mainSha, commit } = {}) {
  const ok = response?.merged === true && validSha(response?.sha) && response.sha === mainSha && pullRequest?.merged === true && pullRequest?.state === "closed" && pullRequest?.merge_commit_sha === response.sha && pullRequest?.merged_by?.login === expected?.appLogin && commit?.sha === response.sha && commit?.tree === expected?.tree && commit?.subject === expected?.commitSubject && stableJson(commit?.parents) === stableJson([expected?.baseSha, expected?.headSha]);
  return { ok, findings: ok ? [] : ["PHASE1_APP_MERGE_POSTCONDITION_INVALID"] };
}

async function readWorkflowBlob(repository, sha, token) {
  const value = await githubRequest(`/repos/${repository}/contents/${WORKFLOW_PATH}?ref=${sha}`, token);
  if (value?.type !== "file" || typeof value?.sha !== "string") throw new Error("PHASE1_WORKFLOW_BLOB_UNAVAILABLE");
  return value.sha;
}

async function readAssociatedPullRequests(repository, sha, token) {
  const pulls = [];
  for (let page = 1; page <= 20; page += 1) {
    const value = await githubRequest(`/repos/${repository}/commits/${sha}/pulls?per_page=100&page=${page}`, token);
    if (!Array.isArray(value)) throw new Error("PHASE1_COMMIT_PR_ASSOCIATION_MALFORMED");
    pulls.push(...value);
    if (value.length < 100) return { pulls, complete: true };
  }
  return { pulls, complete: false };
}

export function selectDurablePhase1PullRequest({ repository, run, associatedPullRequests, paginationComplete } = {}) {
  const linked = Array.isArray(run?.pull_requests) ? run.pull_requests : [];
  const associated = Array.isArray(associatedPullRequests) ? associatedPullRequests : [];
  const exactRun = repository === REPOSITORY && run?.repository?.full_name === repository
    && run?.event === "pull_request" && validSha(run?.head_sha);
  const exactAssociation = associated.length === 1
    && associated[0]?.head?.sha === run?.head_sha
    && associated[0]?.head?.repo?.full_name === repository
    && associated[0]?.base?.repo?.full_name === repository
    && associated[0]?.base?.ref === "main" && validSha(associated[0]?.base?.sha);
  const linkedConsistent = linked.length === 0 || (linked.length === 1
    && linked[0]?.number === associated[0]?.number
    && linked[0]?.head?.sha === associated[0]?.head?.sha
    && linked[0]?.base?.sha === associated[0]?.base?.sha);
  if (!exactRun || paginationComplete !== true || !exactAssociation || !linkedConsistent || linked.length > 1) {
    return { ok: false, finding: "PHASE1_RUN_PR_ASSOCIATION_AMBIGUOUS", pr: null };
  }
  return { ok: true, finding: null, pr: associated[0] };
}

async function resolveDurableRunPullRequest(repository, run, token) {
  if (run?.repository?.full_name !== repository || run?.event !== "pull_request" || !validSha(run?.head_sha)) throw new Error("PHASE1_RUN_IDENTITY_INVALID");
  const association = await readAssociatedPullRequests(repository, run.head_sha, token);
  const selected = selectDurablePhase1PullRequest({
    repository,
    run,
    associatedPullRequests: association.pulls,
    paginationComplete: association.complete,
  });
  if (!selected.ok) throw new Error(selected.finding);
  return { pr: selected.pr, complete: true, linkedCount: Array.isArray(run.pull_requests) ? run.pull_requests.length : 0 };
}

async function readRunJobs(repository, run, token) {
  const jobs = [];
  const attempt = Number(run.run_attempt ?? 1);
  let totalCount = null;
  for (let page = 1; page <= 20; page += 1) {
    const value = await githubRequest(`/repos/${repository}/actions/runs/${run.id}/attempts/${attempt}/jobs?per_page=100&page=${page}`, token);
    if (!Number.isInteger(value?.total_count) || !Array.isArray(value.jobs)) throw new Error("PHASE1_JOB_PAGINATION_MALFORMED");
    totalCount = value.total_count;
    jobs.push(...value.jobs);
    if (jobs.length >= totalCount) return { jobs, complete: jobs.length === totalCount };
    if (value.jobs.length === 0) break;
  }
  return { jobs, complete: false };
}

async function deriveProtectedMaintenanceProof({ repository, identity, run, jobs, token, root }) {
  const failed = jobs.filter((job) => PHASE1_REQUIRED_LANES.includes(job?.name) && job?.conclusion !== "success");
  if (failed.length < 1 || failed.length > MAINTENANCE_LANES.size
    || new Set(failed.map(({ name }) => name)).size !== failed.length
    || !failed.every((job) => exactMaintenanceJob(job, { identity, run }))) return null;
  const command = spawnSync(process.execPath, [path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../guard-autonomous-systems-contract.mjs"), "--maintenance-projection-only"], { cwd: root, encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"] });
  let observation = null;
  try { observation = JSON.parse(command.stdout.trim().split(/\r?\n/gu).at(-1)); } catch {}
  const expectedProof = { sourceAuthority: false, userCreatorAuthority: false, premiumPaidAccess: false, moneyLedgerPayout: false, rlsAuthModeration: false, providerDatabaseBuildRelease: false, sourceCorrectness: false, assuranceDisplayOnly: true };
  const codes = Array.isArray(observation?.findings) ? [...new Set(observation.findings)].sort() : [];
  const observationBody = { schemaVersion: observation?.schemaVersion, classification: observation?.classification, findings: observation?.findings, proof: observation?.proof };
  if (command.status !== 1 || observation?.schemaVersion !== 1 || observation?.classification !== "PROTECTED_ASSURANCE_DISPLAY_PROJECTION_V1"
    || stableJson(observation?.proof) !== stableJson(expectedProof) || codes.length === 0
    || observation?.fingerprint !== crypto.createHash("sha256").update(JSON.stringify(observationBody)).digest("hex")
    || codes.some((code) => !["ASSURANCE_CURRENT_STATE_DISPLAY_PROJECTION_MISMATCH", "ASSURANCE_NEXT_TASK_DISPLAY_PROJECTION_MISMATCH"].includes(code))) return null;
  const logDigests = (await Promise.all(failed.map(async (job) => {
    const bytes = await githubBytesRequest(`/repos/${repository}/actions/jobs/${job.id}/logs`, token);
    const records = bytes.toString("utf8").split(/\r?\n/gu).flatMap((line) => {
      const start = line.indexOf('{"schemaVersion":1,"classification":"PROTECTED_ASSURANCE_DISPLAY_PROJECTION_V1"');
      if (start < 0) return [];
      try { return [JSON.parse(line.slice(start).replace(/\x1b\[[0-9;]*m/gu, "").trim())]; } catch { return [null]; }
    });
    if (records.length !== 1 || stableJson(records[0]) !== stableJson(observation)) throw new Error("PHASE1_MAINTENANCE_LOG_DIAGNOSTIC_MISMATCH");
    return { jobId: job.id, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
  }))).sort((a, b) => a.jobId - b.jobId);
  const body = { schemaVersion: "PHASE1_PROTECTED_MAINTENANCE_PROOF_V1", repository, pr: identity.pr, headSha: identity.headSha, sourceTree: identity.sourceTree, baseSha: identity.baseSha, runId: run.id, runAttempt: run.runAttempt, evaluatorSha: identity.baseSha, jobIds: failed.map(({ id }) => id).sort((a, b) => a - b), logDigests, codes, proof: expectedProof };
  const proof = { ...body, fingerprint: hashValue(body) };
  maintenanceProofBrand.add(proof);
  return proof;
}

async function latestExactRun(repository, identity, token) {
  const matches = [];
  for (let page = 1; page <= 20; page += 1) {
    const value = await githubRequest(`/repos/${repository}/actions/workflows/${encodeURIComponent(WORKFLOW_FILE)}/runs?event=pull_request&per_page=100&page=${page}`, token);
    if (!Array.isArray(value?.workflow_runs)) throw new Error("PHASE1_RUN_PAGINATION_MALFORMED");
    matches.push(...value.workflow_runs.filter((run) => run?.head_sha === identity.headSha && run?.head_branch === identity.headRef));
    if (value.workflow_runs.length < 100) break;
    if (page === 20) throw new Error("PHASE1_RUN_PAGINATION_INCOMPLETE");
  }
  const ordered = matches.sort((left, right) => Number(right.id) - Number(left.id));
  if (ordered.length === 0) throw new Error("PHASE1_EXACT_HEAD_RUN_MISSING");
  if (ordered[0]?.status !== "completed") throw new Error("PHASE1_LATEST_EXACT_HEAD_RUN_INCOMPLETE");
  return ordered[0];
}

function identityFromPr(repository, pr) {
  if (pr?.base?.repo?.full_name !== repository || pr?.head?.repo?.full_name !== repository
    || pr?.base?.ref !== "main" || !Number.isInteger(pr?.number)
    || !validSha(pr?.head?.sha) || !validSha(pr?.base?.sha)) throw new Error("PHASE1_PR_IDENTITY_INVALID");
  return {
    repository,
    pr: pr.number,
    headRef: pr.head.ref,
    headSha: pr.head.sha,
    baseRef: pr.base.ref,
    baseSha: pr.base.sha,
  };
}

function requireOpenPullRequest(pr) {
  if (pr?.state !== "open" || pr?.merged === true || pr?.merged_at != null) {
    throw new Error("PHASE1_PR_NOT_OPEN_UNMERGED");
  }
}

async function normalizeRun(run, identity, jobs, durableAssociation) {
  const contexts = (Array.isArray(jobs) ? jobs : []).filter((job) => typeof job?.name === "string" && job.name.startsWith(CONTEXT_PREFIX));
  const context = contexts.length === 1 ? CONTEXT_RE.exec(contexts[0].name) : null;
  const mode = context?.[1] ?? null;
  const action = context?.[4] ?? null;
  const eventUpdatedAt = context?.[5] ?? null;
  return {
    id: Number(run?.id),
    runAttempt: Number(run?.run_attempt ?? 0),
    name: run?.name,
    path: run?.path,
    event: run?.event,
    status: run?.status,
    conclusion: run?.conclusion,
    repository: run?.repository?.full_name,
    pr: context ? Number(context[2]) : null,
    headRef: run?.head_branch,
    headSha: run?.head_sha,
    baseRef: context ? identity.baseRef : null,
    baseSha: context?.[3] ?? null,
    lifecycleMode: mode,
    lifecycleAction: action,
    lifecycleEventUpdatedAt: eventUpdatedAt,
    lifecycleGeneration: context ? derivePhase1LifecycleGeneration({ identity, mode, action, eventUpdatedAt }) : null,
    durableAssociation: durableAssociation === true,
  };
}

async function findAdmissionChecks(repository, headSha, token) {
  const checks = [];
  for (let page = 1; page <= 20; page += 1) {
    const value = await githubRequest(`/repos/${repository}/commits/${headSha}/check-runs?check_name=${encodeURIComponent(PHASE1_ADMISSION_CHECK_NAME)}&filter=all&per_page=100&page=${page}`, token);
    if (!Number.isInteger(value?.total_count) || !Array.isArray(value.check_runs)) throw new Error("PHASE1_CHECK_PAGINATION_MALFORMED");
    checks.push(...value.check_runs);
    if (checks.length >= value.total_count) return checks;
    if (value.check_runs.length === 0) break;
  }
  throw new Error("PHASE1_CHECK_PAGINATION_INCOMPLETE");
}

function validTrustedPublisherCheck(check, headSha, publisherAppId = null) {
  return Number.isInteger(check?.id) && check.id > 0
    && check?.name === PHASE1_ADMISSION_CHECK_NAME
    && check?.head_sha === headSha
    && check?.app?.slug === PHASE1_PUBLISHER_APP.slug
    && check?.app?.name === PHASE1_PUBLISHER_APP.name
    && (publisherAppId === null || check?.app?.id === publisherAppId);
}
function validAdmissionCheckAnyGeneration(check, identity, publisherAppId = null) {
  return validTrustedPublisherCheck(check, identity.headSha, publisherAppId)
    && typeof check?.external_id === "string"
    && check.external_id.startsWith(`phase1-admission:v1:${identity.pr}:${identity.headSha}:`);
}
const trustedAdmissionChecks = (checks, identity, publisherAppId) => checks.filter((check) => validAdmissionCheckAnyGeneration(check, identity, publisherAppId));
const trustedPublisherChecks = (checks, headSha, publisherAppId) => checks.filter((check) => validTrustedPublisherCheck(check, headSha, publisherAppId));
export const partitionProtectedAdmissionChecks = ({ checks = [], identity, publisherAppId }) => {
  const publisher = trustedPublisherChecks(checks, identity?.headSha, publisherAppId);
  return { publisher, current: trustedAdmissionChecks(publisher, identity, publisherAppId), foreign: publisher.filter((check) => !validAdmissionCheckAnyGeneration(check, identity, publisherAppId)) };
};

export async function resolveProtectedPhase1AdmissionEvidence({ repository, identity, stage, token, publisherAppId = Number(process.env.PHASE1_ADMISSION_APP_INTEGRATION_ID), expectedRulesetStage, expectedPublisherAnchorHash, expectedPublisherProvisioningReadbackHash } = {}) {
  if (repository !== REPOSITORY || identity?.repository !== repository || typeof token !== "string" || token.length < 1) throw new Error("PHASE1_ADMISSION_READBACK_INPUT_INVALID");
  if (!Number.isInteger(publisherAppId) || publisherAppId < 1) throw new Error("PHASE1_PUBLISHER_APP_ID_INVALID");
  const pull = await readPr(repository, identity.pr, token);
  requireOpenPullRequest(pull);
  const liveIdentity = identityFromPr(repository, pull);
  const sourceTree = await readCommitTree(repository, liveIdentity.headSha, token);
  if (stableJson({ ...liveIdentity, sourceTree }) !== stableJson({
    repository: identity.repository, pr: identity.pr, headRef: identity.headRef, headSha: identity.headSha,
    baseRef: identity.baseRef, baseSha: identity.baseSha, sourceTree: identity.sourceTree ?? identity.tree,
  })) throw new Error("PHASE1_ADMISSION_LIVE_PR_IDENTITY_MISMATCH");
  const run = await latestExactRun(repository, liveIdentity, token);
  const durable = await resolveDurableRunPullRequest(repository, run, token);
  if (stableJson(identityFromPr(repository, durable.pr)) !== stableJson(liveIdentity)) throw new Error("PHASE1_DURABLE_PR_ASSOCIATION_MISMATCH");
  const jobs = await readRunJobs(repository, run, token);
  const normalized = await normalizeRun(run, liveIdentity, jobs.jobs, durable.complete);
  const partition = partitionProtectedAdmissionChecks({ checks: await findAdmissionChecks(repository, identity.headSha, token), identity, publisherAppId });
  const allTrusted = partition.publisher; const checks = partition.current;
  if (allTrusted.length !== 1 || checks.length !== 1) throw new Error("PHASE1_ADMISSION_CROSS_PR_OR_DUPLICATE_CHECK_INVALID");
  const evidence = parsePhase1AdmissionCheckReadback({ checks, paginationComplete: true, identity, stage, publisherAppId, expectedRulesetStage, expectedPublisherAnchorHash, expectedPublisherProvisioningReadbackHash });
  if (!jobs.complete || evidence.runId !== normalized.id || evidence.runAttempt !== normalized.runAttempt
    || evidence.lifecycleGeneration !== normalized.lifecycleGeneration || evidence.action !== normalized.lifecycleAction
    || evidence.eventUpdatedAt !== normalized.lifecycleEventUpdatedAt
    || evidence.mode !== normalized.lifecycleMode || evidence.draft !== (pull.draft === true)) throw new Error("PHASE1_ADMISSION_LIVE_LIFECYCLE_MISMATCH");
  aggregateEvidenceBrand.add(evidence);
  const verified = verifyPhase1AggregateEvidence({ aggregate: evidence, identity, stage, mode: evidence.mode });
  if (!verified.ok) throw new Error(`PHASE1_ADMISSION_PROTECTED_READBACK_INVALID:${verified.findings.join(",")}`);
  return verified;
}

function validAdmissionCheck(check, identity, generation) {
  return validAdmissionCheckAnyGeneration(check, identity)
    && check.external_id.startsWith(`phase1-admission:v1:${identity.pr}:${identity.headSha}:${generation}:`);
}

async function ensureAdmissionCheck({ repository, identity, token, publisherAppId, generation, allowPriorGeneration = false }) {
  let allTrusted = partitionProtectedAdmissionChecks({ checks: await findAdmissionChecks(repository, identity.headSha, token), identity, publisherAppId }).publisher;
  if (allTrusted.length > 1) {
    await Promise.all(allTrusted.map((check) => githubRequest(`/repos/${repository}/check-runs/${check.id}`, token, { method: "PATCH", body: JSON.stringify({ name: PHASE1_ADMISSION_CHECK_NAME, status: "in_progress", external_id: check.external_id, output: { title: "Phase 1 admission blocked", summary: "Duplicate or cross-PR trusted publisher checks require fail-closed repair." } }) })));
    throw new Error("PHASE1_ADMISSION_CHECK_CARDINALITY_OR_PROVENANCE_INVALID");
  }
  let checks = trustedAdmissionChecks(allTrusted, identity, publisherAppId);
  if (allTrusted.length === 1 && checks.length === 0) {
    await githubRequest(`/repos/${repository}/check-runs/${allTrusted[0].id}`, token, { method: "PATCH", body: JSON.stringify({ name: PHASE1_ADMISSION_CHECK_NAME, status: "in_progress", external_id: `phase1-admission:v1:${identity.pr}:${identity.headSha}:${generation}:pending`, output: { title: "Phase 1 admission pending", summary: "A new PR identity reused this commit; prior admission was invalidated." } }) });
    allTrusted = trustedPublisherChecks(await findAdmissionChecks(repository, identity.headSha, token), identity.headSha, publisherAppId);
    checks = trustedAdmissionChecks(allTrusted, identity, publisherAppId);
  }
  if (checks.length === 0) {
    await githubRequest(`/repos/${repository}/check-runs`, token, {
      method: "POST",
      body: JSON.stringify({
        name: PHASE1_ADMISSION_CHECK_NAME,
        head_sha: identity.headSha,
        status: "in_progress",
        external_id: `phase1-admission:v1:${identity.pr}:${identity.headSha}:${generation}:pending`,
        output: { title: "Phase 1 admission pending", summary: "Protected-main admission evidence is being resolved." },
      }),
    });
    checks = trustedAdmissionChecks(await findAdmissionChecks(repository, identity.headSha, token), identity, publisherAppId);
  }
  if (checks.length !== 1 || checks[0]?.app?.id !== publisherAppId || (allowPriorGeneration
    ? !validAdmissionCheckAnyGeneration(checks[0], identity, publisherAppId)
    : !validAdmissionCheck(checks[0], identity, generation))) throw new Error("PHASE1_ADMISSION_CHECK_CARDINALITY_OR_PROVENANCE_INVALID");
  return checks[0];
}

async function publishCheck({ repository, identity, token, publisherAppId, check, generation, decision, initialize = false, allowPriorGeneration = false }) {
  if (check?.app?.id !== publisherAppId || (allowPriorGeneration ? !validAdmissionCheckAnyGeneration(check, identity, publisherAppId) : !validAdmissionCheck(check, identity, generation))) throw new Error("PHASE1_ADMISSION_CHECK_PROVENANCE_INVALID");
  const evidence = decision?.evidence ?? null;
  const status = initialize ? "in_progress" : "completed";
  const conclusion = initialize ? undefined : (decision?.acceptable ? "action_required" : "failure");
  const summary = initialize
    ? `Awaiting a complete Phase 1 CI run for PR #${identity.pr} at ${identity.headSha}.`
    : [
      `${decision.result}${decision.maintenanceStatus ? `; ${decision.maintenanceStatus}` : ""}`,
      `Raw lanes: ${decision.rawPassedLanes}/${decision.requiredLanes} passed; blocking=${decision.blockingFindings.length}; non-blocking assurance=${decision.nonBlockingAssuranceFindings.length}; deferred external=${decision.deferredExternalFindings.length}.`,
      `Mode: ${decision.mode}; mergeAuthorityGranted=${decision.mergeAuthorityGranted}.`,
      `Decision: ${stableJson(evidence)}`,
    ].join("\n\n").slice(0, 65000);
  const body = {
    name: PHASE1_ADMISSION_CHECK_NAME,
    status,
    external_id: initialize
      ? `phase1-admission:v1:${identity.pr}:${identity.headSha}:${generation}:pending`
      : `phase1-admission:v1:${identity.pr}:${identity.headSha}:${generation}:${decision.runId}:${decision.decisionHash}`,
    output: {
      title: initialize ? "Phase 1 admission pending" : decision.result,
      summary,
    },
    ...(conclusion ? { conclusion, completed_at: new Date().toISOString() } : {}),
  };
  await githubRequest(`/repos/${repository}/check-runs/${check.id}`, token, { method: "PATCH", body: JSON.stringify(body) });
  const allReadback = trustedPublisherChecks(await findAdmissionChecks(repository, identity.headSha, token), identity.headSha, publisherAppId);
  const readback = trustedAdmissionChecks(allReadback, identity, publisherAppId);
  if (allReadback.length !== 1 || readback.length !== 1 || !validAdmissionCheck(readback[0], identity, generation)
    || readback[0].id !== check.id || readback[0].status !== status
    || readback[0].external_id !== body.external_id
    || (status === "completed" && readback[0].conclusion !== conclusion)
    || readback[0]?.output?.title !== body.output.title
    || readback[0]?.output?.summary !== body.output.summary) throw new Error("PHASE1_ADMISSION_CHECK_READBACK_INVALID");
  return readback[0];
}

async function initializeAdmission({ repository, prNumber, readToken, publisher, evaluatorSha, lifecycle }) {
  const pr = await readPr(repository, prNumber, readToken);
  requireOpenPullRequest(pr);
  const identity = identityFromPr(repository, pr);
  if (evaluatorSha !== identity.baseSha) throw new Error("PHASE1_ADMISSION_EVALUATOR_IDENTITY_INVALID");
  if (!lifecycleActions.has(lifecycle?.action) || !validTimestamp(lifecycle?.eventUpdatedAt)) throw new Error("PHASE1_ADMISSION_LIFECYCLE_GENERATION_INVALID");
  const mode = pr.draft ? PHASE1_MODES.DRAFT : PHASE1_MODES.READY;
  const generation = derivePhase1LifecycleGeneration({ identity, mode, action: lifecycle?.action, eventUpdatedAt: lifecycle?.eventUpdatedAt });
  const check = await ensureAdmissionCheck({ repository, identity, token: publisher.token, publisherAppId: publisher.appId, generation, allowPriorGeneration: true });
  if (validAdmissionCheck(check, identity, generation) && check.status === "completed") return check;
  return publishCheck({ repository, identity, token: publisher.token, publisherAppId: publisher.appId, check, generation, initialize: true, allowPriorGeneration: true });
}

async function invalidateTrustedChecksAtHead({ repository, headSha, publisher }) {
  if (!validSha(headSha)) throw new Error("PHASE1_ADMISSION_INVALIDATION_HEAD_INVALID");
  const trusted = trustedPublisherChecks(await findAdmissionChecks(repository, headSha, publisher.token), headSha, publisher.appId);
  await Promise.all(trusted.map((check) => githubRequest(`/repos/${repository}/check-runs/${check.id}`, publisher.token, { method: "PATCH", body: JSON.stringify({ name: PHASE1_ADMISSION_CHECK_NAME, status: "in_progress", external_id: check.external_id, output: { title: "Phase 1 admission revalidation required", summary: "New lifecycle evidence requires fail-closed revalidation." } }) })));
  if (trusted.length > 1) throw new Error("PHASE1_ADMISSION_INVALIDATION_CARDINALITY_INVALID");
}

async function invalidateAdmissionForRefresh({ repository, prNumber, readToken, publisher }) {
  const identity = identityFromPr(repository, await readPr(repository, prNumber, readToken));
  const checks = trustedPublisherChecks(await findAdmissionChecks(repository, identity.headSha, publisher.token), identity.headSha, publisher.appId);
  if (checks.length === 0) return;
  await Promise.all(checks.map((check) => githubRequest(`/repos/${repository}/check-runs/${check.id}`, publisher.token, { method: "PATCH", body: JSON.stringify({ name: PHASE1_ADMISSION_CHECK_NAME, status: "in_progress", external_id: check.external_id, output: { title: "Phase 1 admission revalidation required", summary: "Immutable evidence changed; prior final admission is no longer current." } }) })));
  if (checks.length !== 1) throw new Error("PHASE1_ADMISSION_REFRESH_INVALIDATION_PROVENANCE_INVALID");
  const body = {
    name: PHASE1_ADMISSION_CHECK_NAME,
    status: "in_progress",
    external_id: checks[0].external_id,
    output: { title: "Phase 1 admission revalidation required", summary: "Immutable evidence changed; prior final admission is no longer current." },
  };
  const readback = trustedPublisherChecks(await findAdmissionChecks(repository, identity.headSha, publisher.token), identity.headSha, publisher.appId);
  if (readback.length !== 1 || readback[0]?.id !== checks[0].id || readback[0]?.status !== "in_progress"
    || readback[0]?.external_id !== body.external_id || readback[0]?.output?.title !== body.output.title
    || readback[0]?.output?.summary !== body.output.summary) throw new Error("PHASE1_ADMISSION_REFRESH_INVALIDATION_READBACK_INVALID");
}

async function finalizeAdmission({ repository, prNumber, readToken, publisher, suppliedRun, evaluatorSha, resolveMergeEligibility = false }) {
  const pr = await readPr(repository, prNumber, readToken);
  requireOpenPullRequest(pr);
  const baseIdentity = identityFromPr(repository, pr);
  const identity = { ...baseIdentity, sourceTree: await readCommitTree(repository, baseIdentity.headSha, readToken) };
  const currentRun = await latestExactRun(repository, identity, readToken);
  if (suppliedRun && (suppliedRun.id !== currentRun.id || suppliedRun.run_attempt !== currentRun.run_attempt)) throw new Error("PHASE1_STALE_RUN_PUBLICATION_REFUSED");
  const run = currentRun;
  const durable = await resolveDurableRunPullRequest(repository, run, readToken);
  const associatedIdentity = identityFromPr(repository, durable.pr);
  if (stableJson(associatedIdentity) !== stableJson(baseIdentity)) throw new Error("PHASE1_DURABLE_PR_ASSOCIATION_MISMATCH");
  const jobRead = await readRunJobs(repository, run, readToken);
  const normalizedRun = await normalizeRun(run, identity, jobRead.jobs, durable.complete);
  const lifecycle = {
    mode: normalizedRun.lifecycleMode,
    action: normalizedRun.lifecycleAction,
    draft: pr.draft === true,
    eventUpdatedAt: normalizedRun.lifecycleEventUpdatedAt,
    generation: normalizedRun.lifecycleGeneration,
  };
  const candidateBlobSha = await readWorkflowBlob(repository, identity.headSha, readToken);
  const protectedBlobSha = await readWorkflowBlob(repository, identity.baseSha, readToken);
  const hasFailures = jobRead.jobs.some((job) => PHASE1_REQUIRED_LANES.includes(job?.name) && job?.conclusion !== "success");
  const maintenanceProof = hasFailures
    ? await withCandidateWorktree(identity, (root) => deriveProtectedMaintenanceProof({ repository, identity, run: normalizedRun, jobs: jobRead.jobs, token: readToken, root }))
    : null;
  const engine = await import("./engineering-closure.mjs");
  if (typeof engine.resolvePhase1AdmissionPublisherAnchor !== "function") throw new Error("PHASE1_PUBLISHER_ANCHOR_RESOLVER_MISSING");
  const publisherAnchor = brandPublisherAnchor(await withCandidateWorktree(identity, (root) => engine.resolvePhase1AdmissionPublisherAnchor({
    repository, identity, publisherProvisioningReadback: publisher.provisioningReadback, requireFinalSource: false, root,
  })), { repository, identity, provisioningReadback: publisher.provisioningReadback });
  if (typeof engine.resolvePhase1SourceAuthorityEligibility !== "function") throw new Error("PHASE1_SOURCE_AUTHORITY_RESOLVER_MISSING");
  const sourceAuthorityProof = brandSourceAuthority(await withCandidateWorktree(identity, (root) => engine.resolvePhase1SourceAuthorityEligibility({ repository, identity, lifecycle, root })), { identity, lifecycle });
  const input = {
    identity,
    lifecycle,
    run: normalizedRun,
    jobs: jobRead.jobs,
    evidenceComplete: true,
    paginationComplete: jobRead.complete,
    workflowIntegrity: { trusted: true, complete: true, candidateBlobSha, protectedBlobSha },
    evaluatorIdentity: { sha: evaluatorSha, workflowBlobSha: protectedBlobSha },
    maintenanceProof,
    publisherAnchor,
    publisherAnchorRequired: true,
    sourceAuthorityProof,
    sourceAuthorityRequired: true,
  };
  const sourceDecision = evaluatePhase1Admission(input);
  const generation = normalizedRun.lifecycleGeneration;
  const check = await ensureAdmissionCheck({ repository, identity, token: publisher.token, publisherAppId: publisher.appId, generation });
  await publishCheck({ repository, identity, token: publisher.token, publisherAppId: publisher.appId, check, generation, decision: sourceDecision });
  let decision = sourceDecision;
  if (resolveMergeEligibility && sourceDecision.acceptable && sourceDecision.mode === PHASE1_MODES.READY) {
    const protectedSource = (await resolveProtectedPhase1AdmissionEvidence({
      repository,
      identity,
      stage: PHASE1_EVIDENCE_STAGES.SOURCE,
      token: readToken,
      publisherAppId: publisher.appId,
      expectedRulesetStage: publisherAnchor.currentRulesetStage,
      expectedPublisherAnchorHash: publisherAnchor.anchorHash,
      expectedPublisherProvisioningReadbackHash: publisherAnchor.provisioningReadbackHash,
    })).evidence;
    if (stableJson(protectedSource) !== stableJson(sourceDecision.evidence)) throw new Error("PHASE1_PROTECTED_SOURCE_DECISION_MISMATCH");
    if (typeof engine.resolvePhase1AdmissionMergeEligibility !== "function") throw new Error("PHASE1_MERGE_ELIGIBILITY_RESOLVER_MISSING");
    const observed = await withCandidateWorktree(identity, (root) => engine.resolvePhase1AdmissionMergeEligibility({
      repository, pr: identity.pr, identity, phase1Evidence: protectedSource, publisherProvisioningReadback: publisher.provisioningReadback, token: readToken, root,
    }));
    const mergeEligibility = brandMergeEligibility(observed, { identity, phase1SourceDecisionHash: sourceDecision.phase1SourceDecisionHash, publisherAnchorHash: publisherAnchor.anchorHash, publisherProvisioningReadbackHash: publisherAnchor.provisioningReadbackHash, currentRulesetStage: publisherAnchor.currentRulesetStage });
    decision = evaluatePhase1Admission({ ...input, mergeEligibility });
    const finalPull = await readPr(repository, prNumber, readToken);
    requireOpenPullRequest(finalPull);
    if (stableJson(identityFromPr(repository, finalPull)) !== stableJson(baseIdentity) || finalPull.draft === true) throw new Error("PHASE1_FINAL_PUBLICATION_LIVE_PR_MISMATCH");
    await publishCheck({ repository, identity, token: publisher.token, publisherAppId: publisher.appId, check, generation, decision });
  }
  process.stdout.write(`${JSON.stringify(decision)}\n`);
  return decision;
}

async function readSyntheticMergeExecution(repository, pr, token) {
  const ref = await githubRequest(`/repos/${repository}/git/ref/pull/${pr}/merge`, token);
  if (ref?.ref !== `refs/pull/${pr}/merge` || !validSha(ref?.object?.sha) || ref?.object?.type !== "commit") throw new Error("PHASE1_APP_MERGE_REF_INVALID");
  return { ref: ref.ref, ...(await readCommit(repository, ref.object.sha, token)) };
}

async function performAppOnlyMerge({ repository, identity, decision, readToken, publisher, merger, evaluatorSha, currentRunId, currentRunAttempt, gateStartedAt, mergeGate }) {
  if (!appMergeDecisionBrand.has(decision) || !verifyProtectedPhase1PublisherRuntimeIdentity(merger?.runtimeIdentity)
    || merger?.mode !== "merge" || merger?.appId !== publisher?.appId || merger?.installationId !== publisher?.installationId
    || merger?.jwtAppReadbackHash !== publisher?.provisioningReadback?.app?.jwtSelfReadbackHash
    || merger?.webhookConfigHash !== publisher?.provisioningReadback?.app?.webhook?.configReadbackHash
    || !verifyProtectedPhase1PublisherProvisioningReadback(publisher?.provisioningReadback)
    || mergeGate?.contract !== "PHASE1_APP_ONLY_MERGE_EXACT_CALLBACK_V1" || mergeGate?.repository !== repository
    || mergeGate?.pr !== identity?.pr || mergeGate?.headSha !== identity?.headSha || mergeGate?.sourceTree !== identity?.sourceTree
    || mergeGate?.baseSha !== identity?.baseSha || mergeGate?.publisherAnchorHash !== decision?.publisherAnchorHash
    || mergeGate?.publisherProvisioningReadbackHash !== decision?.publisherProvisioningReadbackHash
    || !DIGEST_RE.test(mergeGate?.stageReceiptChainHash ?? "")
    || typeof mergeGate?.invokeOnce !== "function" || mergeGate.invokeOnce() !== true) throw new Error("PHASE1_APP_MERGE_PRIVATE_AUTHORITY_INVALID");
  const currentProvisioning = await resolveProtectedPhase1PublisherProvisioningReadback({
    repository,
    environmentToken: publisher.token,
    readToken,
    app: merger.app,
    appPrivacy: merger.appPrivacy,
    installation: merger.installation,
    clientId: merger.clientId,
    keyFingerprint: publisher.provisioningReadback.app.key.publicKeySpkiSha256,
    jwtAppReadbackHash: merger.jwtAppReadbackHash,
    webhookConfigHash: merger.webhookConfigHash,
  });
  if (currentProvisioning.readbackHash !== publisher.provisioningReadback.readbackHash) throw new Error("PHASE1_APP_MERGE_PROVIDER_DRIFT");
  const protectedFinal = (await resolveProtectedPhase1AdmissionEvidence({
    repository,
    identity,
    stage: PHASE1_EVIDENCE_STAGES.FINAL,
    token: readToken,
    publisherAppId: publisher.appId,
    expectedRulesetStage: currentProvisioning.ruleset.stage,
    expectedPublisherAnchorHash: decision.publisherAnchorHash,
    expectedPublisherProvisioningReadbackHash: currentProvisioning.readbackHash,
  })).evidence;
  if (stableJson(protectedFinal) !== stableJson(decision.evidence)) throw new Error("PHASE1_APP_MERGE_FINAL_EVIDENCE_STALE");
  await readRepositoryActionsQuiescence({ repository, token: readToken, currentRunId, currentRunAttempt, evaluatorSha, gateStartedAt });
  const pullRequest = await readPr(repository, identity.pr, readToken);
  const defaultMainSha = await readProtectedEvaluatorSha(repository, readToken);
  const sourceTree = await readCommitTree(repository, identity.headSha, readToken);
  const execution = await readSyntheticMergeExecution(repository, identity.pr, readToken);
  const snapshot = evaluateAppOnlyMergeGateSnapshot({ identity, decision, latestEvidence: protectedFinal, pullRequest, defaultMainSha, sourceTree, execution, provisioningReadback: currentProvisioning, publisherAppId: publisher.appId });
  if (!snapshot.ok) throw new Error(snapshot.findings.join(","));
  await readRepositoryActionsQuiescence({ repository, token: readToken, currentRunId, currentRunAttempt, evaluatorSha, gateStartedAt });
  const finalSnapshot = evaluateAppOnlyMergeGateSnapshot({ identity, decision, latestEvidence: protectedFinal, pullRequest: await readPr(repository, identity.pr, readToken), defaultMainSha: await readProtectedEvaluatorSha(repository, readToken), sourceTree, execution: await readSyntheticMergeExecution(repository, identity.pr, readToken), provisioningReadback: currentProvisioning, publisherAppId: publisher.appId });
  if (!finalSnapshot.ok || stableJson(finalSnapshot.request) !== stableJson(snapshot.request) || stableJson(finalSnapshot.expected) !== stableJson(snapshot.expected)) throw new Error("PHASE1_APP_MERGE_FINAL_REREAD_INVALID");
  const response = await githubRequest(`/repos/${repository}/pulls/${identity.pr}/merge`, merger.token, { method: "PUT", body: JSON.stringify(finalSnapshot.request) });
  const mergedPull = await readPr(repository, identity.pr, readToken);
  const mainSha = await readProtectedEvaluatorSha(repository, readToken);
  const commit = validSha(response?.sha) ? await readCommit(repository, response.sha, readToken) : null;
  const postcondition = evaluateAppOnlyMergePostcondition({ expected: finalSnapshot.expected, response, pullRequest: mergedPull, mainSha, commit });
  if (!postcondition.ok) throw new Error(postcondition.findings.join(","));
  return { schemaVersion: 1, contract: "PHASE1_APP_ONLY_MERGE_RESULT_V1", repository, pr: identity.pr, headSha: identity.headSha, baseSha: identity.baseSha, mergeSha: response.sha, mergeTree: commit.tree, executionSha: finalSnapshot.expected.executionSha, appId: publisher.appId };
}

async function main() {
  const args = parseArgs(process.argv);
  const eventPath = String(args.event ?? process.env.GITHUB_EVENT_PATH ?? "");
  const readToken = process.env.GITHUB_TOKEN;
  const evaluatorSha = process.env.PHASE1_EVALUATOR_SHA;
  if (!eventPath || !readToken) throw new Error("PHASE1_ADMISSION_RUNTIME_INPUT_MISSING");
  const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  const repository = event?.repository?.full_name;
  if (repository !== REPOSITORY) throw new Error("PHASE1_ADMISSION_REPOSITORY_INVALID");
  if (!validSha(evaluatorSha) || await readProtectedEvaluatorSha(repository, readToken) !== evaluatorSha) throw new Error("PHASE1_ADMISSION_PROTECTED_EVALUATOR_STALE");
  const privateKey = process.env.PHASE1_ADMISSION_APP_PRIVATE_KEY;
  delete process.env.PHASE1_ADMISSION_APP_PRIVATE_KEY;
  const publisher = await publisherInstallationToken(
    repository,
    readToken,
    process.env.PHASE1_ADMISSION_APP_CLIENT_ID,
    privateKey,
    Number(process.env.PHASE1_ADMISSION_APP_INTEGRATION_ID),
    Number(process.env.PHASE1_ADMISSION_APP_INSTALLATION_ID),
    process.env.PHASE1_ADMISSION_APP_KEY_FINGERPRINT,
  );
  try {
    if (args.initialize) {
      const prNumber = Number(args["pr-number"] ?? event?.pull_request?.number);
      await invalidateTrustedChecksAtHead({ repository, headSha: event?.pull_request?.head?.sha, publisher });
      if (event?.action === "closed") return;
      await initializeAdmission({ repository, prNumber, readToken, publisher, evaluatorSha,
        lifecycle: { action: event?.action, eventUpdatedAt: event?.pull_request?.updated_at } });
      return;
    }
    if (args.finalize) {
      const run = event?.workflow_run;
      if (run?.event !== "pull_request") return;
      await invalidateTrustedChecksAtHead({ repository, headSha: run.head_sha, publisher });
      const durable = await resolveDurableRunPullRequest(repository, run, readToken);
      await finalizeAdmission({ repository, prNumber: Number(durable.pr.number), readToken, publisher, suppliedRun: run, evaluatorSha });
      return;
    }
    if (args.refresh) {
      const prNumber = Number(args["pr-number"] ?? event?.issue?.number);
      if (!event?.issue?.pull_request) return;
      await invalidateAdmissionForRefresh({ repository, prNumber, readToken, publisher });
      await finalizeAdmission({ repository, prNumber, readToken, publisher, evaluatorSha, resolveMergeEligibility: true });
      return;
    }
    if (args.merge) {
      const prNumber = Number(args["pr-number"] ?? event?.inputs?.pr);
      const currentRunId = Number(process.env.PHASE1_MERGE_WORKFLOW_RUN_ID);
      const currentRunAttempt = Number(process.env.PHASE1_MERGE_WORKFLOW_RUN_ATTEMPT);
      if (event?.ref !== "refs/heads/main" || event?.sender?.login !== "Chillywood2025"
        || process.env.PHASE1_MERGE_ACTOR !== "Chillywood2025" || process.env.PHASE1_MERGE_TRIGGERING_ACTOR !== "Chillywood2025"
        || event?.repository?.default_branch !== "main"
        || !Number.isInteger(prNumber) || prNumber < 1 || !Number.isInteger(currentRunId) || currentRunId < 1
        || !Number.isInteger(currentRunAttempt) || currentRunAttempt < 1) throw new Error("PHASE1_APP_MERGE_DISPATCH_INVALID");
      const fence = await readRepositoryActionsQuiescence({ repository, token: readToken, currentRunId, currentRunAttempt, evaluatorSha });
      const decision = await finalizeAdmission({ repository, prNumber, readToken, publisher, evaluatorSha, resolveMergeEligibility: true });
      const identity = { repository, pr: decision.pr, headRef: decision.headRef, headSha: decision.headSha, sourceTree: decision.sourceTree, baseRef: decision.baseRef, baseSha: decision.baseSha };
      await readRepositoryActionsQuiescence({ repository, token: readToken, currentRunId, currentRunAttempt, evaluatorSha, gateStartedAt: fence.gateStartedAt });
      const engine = await import("./engineering-closure.mjs");
      if (typeof engine.executeProtectedPhase1AppOnlyMergeGate !== "function") throw new Error("PHASE1_APP_MERGE_R2_BRIDGE_MISSING");
      const result = await engine.executeProtectedPhase1AppOnlyMergeGate({
        repository,
        identity,
        publisherProvisioningReadback: publisher.provisioningReadback,
        mergeExact: async (mergeGate) => {
          const merger = await publisherInstallationToken(repository, readToken, publisher.clientId, privateKey, publisher.appId, publisher.installationId, process.env.PHASE1_ADMISSION_APP_KEY_FINGERPRINT, "merge");
          try { return await performAppOnlyMerge({ repository, identity, decision, readToken, publisher, merger, evaluatorSha, currentRunId, currentRunAttempt, gateStartedAt: fence.gateStartedAt, mergeGate }); }
          finally { await revokePublisherToken(merger.token); }
        },
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return;
    }
    throw new Error("PHASE1_ADMISSION_MODE_REQUIRED");
  } finally {
    await revokePublisherToken(publisher.token);
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : null;
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
