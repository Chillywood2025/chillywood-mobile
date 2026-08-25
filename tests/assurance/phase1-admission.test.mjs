import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  PHASE1_ADMISSION_CHECK_NAME,
  PHASE1_ADMISSION_PRODUCER,
  PHASE1_ADMISSION_RESULTS,
  PHASE1_EVIDENCE_STAGES,
  PHASE1_LANE_RESULTS,
  PHASE1_MODES,
  PHASE1_PUBLISHER_APP,
  PHASE1_REQUIRED_LANES,
  classifyPhase1Finding,
  classifyProtectedPhase1RulesetBypassReadback,
  decidePhase1Policy,
  derivePhase1LifecycleGeneration,
  evaluateAppOnlyMergeGateSnapshot,
  evaluateAppOnlyMergePostcondition,
  evaluatePhase1Admission,
  evaluateRepositoryActionsQuiescence,
  inspectPhase1AggregateEvidence,
  normalizePhase1PublisherAppPrivacyAndWebhookReadback,
  parsePhase1AdmissionCheckReadback,
  partitionProtectedAdmissionChecks,
  resolveProtectedPhase1PublisherProvisioningReadback,
  selectDurablePhase1PullRequest,
  verifyPhase1AggregateEvidence,
  verifyProtectedPhase1PublisherProvisioningReadback,
  validGitHubAppClientId,
} from "../../scripts/assurance/phase1-admission.mjs";
import {
  ARCHITECTURE_FINAL_SOURCE_MARKER,
  ARCHITECTURE_MAINTENANCE_MARKER,
  PHASE1_ADMISSION_PUBLISHER_PROVISIONING_V1,
  PHASE1_RISK_BASED_ADMISSION_REFORM_ARCHITECTURE_PATHS,
  PHASE1_RISK_BASED_ADMISSION_REFORM_V1,
  architectureFinalSourceOwnerCommentBody,
  architectureMaintenanceOwnerCommentBody,
  architectureMaintenanceSubject,
  hashValue,
  phase1AdmissionPublisherProvisioningReadback,
  verifyPhase1AdmissionPublisherImmutableAnchor,
} from "../../scripts/assurance/engineering-closure.mjs";

const HEAD = "1".repeat(40);
const TREE = "2".repeat(40);
const BASE = "3".repeat(40);
const BLOB = "4".repeat(40);
const REPOSITORY = "Chillywood2025/chillywood-mobile";
const PUBLISHER_KEY_READBACK = Object.freeze({ keyFingerprint: "a".repeat(64), jwtAppReadbackHash: "b".repeat(64), webhookConfigHash: "c".repeat(64), secretCreatedAt: "2026-08-24T12:00:00Z", secretUpdatedAt: "2026-08-24T12:00:00Z" });
const maintenanceLanes = [
  "Phase 1 / Autonomous Systems All-Platform Contract",
  "Phase 1 / Autonomous Systems iOS Contract",
  "Phase 1 / Cognitive Intelligence Contract",
];
const identity = Object.freeze({
  repository: REPOSITORY,
  pr: 247,
  headRef: "codex/finite-task-terminal-truth-receipt-lifecycle-v1",
  headSha: HEAD,
  sourceTree: TREE,
  baseRef: "main",
  baseSha: BASE,
});

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
};
const stableJson = (value) => JSON.stringify(stableValue(value));

test("private App and disabled webhook normalize the live omitted-field/404 shape without accepting public or active hooks", () => {
  const omitted = normalizePhase1PublisherAppPrivacyAndWebhookReadback({ app: {}, publicAppStatus: 404, webhookStatus: 404, webhookConfig: null });
  assert.deepEqual(omitted, { public: false, publicEvidence: "ANONYMOUS_EXACT_SLUG_404", publicAppStatus: 404, webhook: { evidence: "JWT_DISABLED_HOOK_CONFIG_404", httpStatus: 404, url: null, contentType: null, insecureSsl: null } });
  const explicit = normalizePhase1PublisherAppPrivacyAndWebhookReadback({ app: { public: false, hook_attributes: { active: false } }, publicAppStatus: 404, webhookStatus: 404, webhookConfig: null });
  assert.equal(explicit.webhook.url, null);
  assert.throws(() => normalizePhase1PublisherAppPrivacyAndWebhookReadback({ app: { public: true }, publicAppStatus: 404, webhookStatus: 404, webhookConfig: null }), /PHASE1_PUBLISHER_APP_PRIVACY_OR_WEBHOOK_INVALID/u);
  assert.throws(() => normalizePhase1PublisherAppPrivacyAndWebhookReadback({ app: { public: null }, publicAppStatus: 404, webhookStatus: 404, webhookConfig: null }), /PHASE1_PUBLISHER_APP_PRIVACY_OR_WEBHOOK_INVALID/u);
  assert.throws(() => normalizePhase1PublisherAppPrivacyAndWebhookReadback({ app: { public: undefined }, publicAppStatus: 404, webhookStatus: 404, webhookConfig: null }), /PHASE1_PUBLISHER_APP_PRIVACY_OR_WEBHOOK_INVALID/u);
  assert.throws(() => normalizePhase1PublisherAppPrivacyAndWebhookReadback({ app: {}, publicAppStatus: 200, webhookStatus: 404, webhookConfig: null }), /PHASE1_PUBLISHER_APP_PRIVACY_OR_WEBHOOK_INVALID/u);
  assert.throws(() => normalizePhase1PublisherAppPrivacyAndWebhookReadback({ app: { hook_attributes: { active: true } }, publicAppStatus: 404, webhookStatus: 404, webhookConfig: null }), /PHASE1_PUBLISHER_APP_PRIVACY_OR_WEBHOOK_INVALID/u);
  assert.throws(() => normalizePhase1PublisherAppPrivacyAndWebhookReadback({ app: { hook_attributes: {} }, publicAppStatus: 404, webhookStatus: 404, webhookConfig: null }), /PHASE1_PUBLISHER_APP_PRIVACY_OR_WEBHOOK_INVALID/u);
  assert.throws(() => normalizePhase1PublisherAppPrivacyAndWebhookReadback({ app: { hook_attributes: { active: false, url: "https://example.invalid/hook" } }, publicAppStatus: 404, webhookStatus: 404, webhookConfig: null }), /PHASE1_PUBLISHER_APP_PRIVACY_OR_WEBHOOK_INVALID/u);
  assert.throws(() => normalizePhase1PublisherAppPrivacyAndWebhookReadback({ app: {}, publicAppStatus: 404, webhookStatus: 500, webhookConfig: null }), /PHASE1_PUBLISHER_APP_PRIVACY_OR_WEBHOOK_INVALID/u);
  assert.throws(() => normalizePhase1PublisherAppPrivacyAndWebhookReadback({ app: {}, publicAppStatus: 404, webhookStatus: 200, webhookConfig: null }), /PHASE1_PUBLISHER_APP_PRIVACY_OR_WEBHOOK_INVALID/u);
  assert.throws(() => normalizePhase1PublisherAppPrivacyAndWebhookReadback({ app: {}, publicAppStatus: 404, webhookStatus: 404, webhookConfig: { url: "https://example.invalid/hook" } }), /PHASE1_PUBLISHER_APP_PRIVACY_OR_WEBHOOK_INVALID/u);
  for (const webhookStatus of [204, 401, 403, 422, 500, undefined]) assert.throws(() => normalizePhase1PublisherAppPrivacyAndWebhookReadback({ app: {}, publicAppStatus: 404, webhookStatus, webhookConfig: null }), /PHASE1_PUBLISHER_APP_PRIVACY_OR_WEBHOOK_INVALID/u);
  for (const publicAppStatus of [200, 403, 500, undefined]) assert.throws(() => normalizePhase1PublisherAppPrivacyAndWebhookReadback({ app: {}, publicAppStatus, webhookStatus: 404, webhookConfig: null }), /PHASE1_PUBLISHER_APP_PRIVACY_OR_WEBHOOK_INVALID/u);
  assert.equal(hashValue(omitted), hashValue(normalizePhase1PublisherAppPrivacyAndWebhookReadback({ app: {}, publicAppStatus: 404, webhookStatus: 404, webhookConfig: null })));
});

test("caller-supplied 404 claims cannot acquire protected publisher readback provenance", async () => {
  const appPrivacy = normalizePhase1PublisherAppPrivacyAndWebhookReadback({ app: {}, publicAppStatus: 404, webhookStatus: 404, webhookConfig: null });
  await assert.rejects(resolveProtectedPhase1PublisherProvisioningReadback({ repository: REPOSITORY, environmentToken: "untrusted", readToken: "untrusted", app: {}, appPrivacy, installation: {}, clientId: "Iv1.untrusted", keyFingerprint: "a".repeat(64), jwtAppReadbackHash: "b".repeat(64), webhookConfigHash: hashValue(appPrivacy.webhook) }), /PHASE1_PUBLISHER_APP_READBACK_PROVENANCE_INVALID/u);
});

test("omitted ruleset bypass actors with current-user never require immutable stage-receipt authority", () => {
  const publisherAppId = 4707730;
  const appBypass = [{ actor_id: publisherAppId, actor_type: "Integration", bypass_mode: "pull_request" }];
  assert.equal(classifyProtectedPhase1RulesetBypassReadback({ ruleset: { current_user_can_bypass: "never" }, publisherAppId }), "OWNER_IMMUTABLE_STAGE_RECEIPT_REQUIRED");
  assert.equal(classifyProtectedPhase1RulesetBypassReadback({ ruleset: {}, publisherAppId }), "OWNER_IMMUTABLE_STAGE_RECEIPT_REQUIRED");
  assert.equal(classifyProtectedPhase1RulesetBypassReadback({ ruleset: { bypass_actors: [], current_user_can_bypass: "never" }, publisherAppId }), "EXPLICIT_EMPTY");
  assert.equal(classifyProtectedPhase1RulesetBypassReadback({ ruleset: { bypass_actors: appBypass, current_user_can_bypass: "never" }, publisherAppId }), "EXPLICIT_APP_PULL_REQUEST_ONLY");
  for (const current_user_can_bypass of ["always", "pull_requests_only", true]) {
    assert.equal(classifyProtectedPhase1RulesetBypassReadback({ ruleset: { current_user_can_bypass }, publisherAppId }), null);
  }
  assert.equal(classifyProtectedPhase1RulesetBypassReadback({ ruleset: { bypass_actors: [{ actor_id: 1, actor_type: "Integration", bypass_mode: "pull_request" }], current_user_can_bypass: "never" }, publisherAppId }), null);
  assert.equal(classifyProtectedPhase1RulesetBypassReadback({ ruleset: { bypass_actors: [], current_user_can_bypass: "always" }, publisherAppId }), null);
  assert.equal(classifyProtectedPhase1RulesetBypassReadback({ ruleset: { bypass_actors: appBypass, current_user_can_bypass: "never" }, publisherAppId: null }), null);
});

test("GitHub App client IDs accept current and documented exact shapes only", () => {
  assert.equal(validGitHubAppClientId("Iv23liJtjp7stElgO1T2"), true);
  assert.equal(validGitHubAppClientId("Iv1.0123456789abcdef"), true);
  for (const value of ["Iv1.abcdef", "4707730", "Iv23liJtjp7stElgO1T2-extra", "iv23liJtjp7stElgO1T2", "", null]) assert.equal(validGitHubAppClientId(value), false);
});

const successSteps = () => [
  { number: 1, name: "Checkout", status: "completed", conclusion: "success" },
  { number: 2, name: "Run safety and correctness coverage", status: "completed", conclusion: "success" },
];
const successJob = (name, id) => ({
  id, run_id: 8001, head_sha: HEAD, name, status: "completed", conclusion: "success",
  steps: maintenanceLanes.includes(name)
    ? [...successSteps(), { number: 3, name: "Validate non-authoritative assurance display projection", status: "completed", conclusion: "success" }]
    : successSteps(),
});
const failedJob = (name, id) => ({
  id,
  run_id: 8001,
  head_sha: HEAD,
  name,
  status: "completed",
  conclusion: "failure",
  steps: [...successSteps(),
    { number: 3, name: "Validate non-authoritative assurance display projection", status: "completed", conclusion: "failure" },
    { number: 8, name: "Post Setup Node.js", status: "completed", conclusion: "skipped" },
    { number: 9, name: "Post Checkout", status: "completed", conclusion: "success" },
    { number: 10, name: "Complete job", status: "completed", conclusion: "success" }],
});

function fixture({ draft = false, action = "synchronize", eventUpdatedAt = "2026-08-24T12:00:00Z", failed = [], findings = [], evidenceComplete = true } = {}) {
  const mode = draft ? PHASE1_MODES.DRAFT : PHASE1_MODES.READY;
  const generation = derivePhase1LifecycleGeneration({ identity, mode, action, eventUpdatedAt });
  const run = {
    id: 8001,
    runAttempt: 1,
    name: "Phase 1 CI",
    path: ".github/workflows/phase1-ci.yml",
    event: "pull_request",
    status: "completed",
    conclusion: failed.length > 0 ? "failure" : "success",
    repository: REPOSITORY,
    pr: identity.pr,
    headRef: identity.headRef,
    headSha: identity.headSha,
    baseRef: identity.baseRef,
    baseSha: identity.baseSha,
    lifecycleMode: mode,
    lifecycleAction: action,
    lifecycleEventUpdatedAt: eventUpdatedAt,
    lifecycleGeneration: generation,
    durableAssociation: true,
  };
  const failedNames = new Set(failed);
  const jobs = PHASE1_REQUIRED_LANES.map((name, index) => failedNames.has(name) ? failedJob(name, 100 + index) : successJob(name, 100 + index));
  jobs.push({
    id: 500,
    run_id: run.id,
    head_sha: identity.headSha,
    name: `Phase 1 Context / ${mode} / PR-${identity.pr} / BASE-${identity.baseSha} / ACT-${action} / GEN-${eventUpdatedAt}`,
    status: "completed",
    conclusion: "success",
    steps: [{ number: 1, name: "Record immutable workflow lifecycle context", status: "completed", conclusion: "success" }],
  });
  return {
    identity,
    lifecycle: { draft, action, eventUpdatedAt, generation },
    run,
    jobs,
    findings,
    evidenceComplete,
    paginationComplete: evidenceComplete,
    workflowIntegrity: { trusted: true, complete: true, candidateBlobSha: BLOB, protectedBlobSha: BLOB },
    evaluatorIdentity: { sha: BASE, workflowBlobSha: BLOB },
  };
}

function policy({ mode = PHASE1_MODES.READY, failures = {} } = {}) {
  return decidePhase1Policy({
    mode,
    lanes: PHASE1_REQUIRED_LANES.map((name) => failures[name]
      ? { name, status: "FAILURE", diagnosticCodes: failures[name] }
      : { name, status: "PASS", diagnosticCodes: [] }),
  });
}

const blockingFinding = (code) => ({
  code,
  producer: PHASE1_ADMISSION_PRODUCER,
  evidenceSource: "GITHUB_ACTIONS_JOB_STEPS",
  classification: PHASE1_LANE_RESULTS.NON_BLOCKING,
});

test("1: 13/13 pass is acceptable without granting authority from the pure reducer", () => {
  const decision = policy();
  assert.equal(decision.result, PHASE1_ADMISSION_RESULTS.ACCEPTABLE);
  assert.equal(decision.rawPassedLanes, 13);
  assert.equal(decision.authoritative, false);
  assert.equal(decision.mergeAuthorityGranted, false);
});

test("2: 12/13 with one proven stale historical fixture is policy-acceptable", () => {
  const decision = policy({ failures: { [maintenanceLanes[0]]: ["STALE_HISTORICAL_FIXTURE"] } });
  assert.equal(decision.acceptable, true);
  assert.equal(decision.rawPassedLanes, 12);
  assert.equal(decision.maintenanceStatus, PHASE1_ADMISSION_RESULTS.MAINTENANCE_REQUIRED);
});

test("3: 10/13 with three instances of one proven maintenance defect is policy-acceptable", () => {
  const failures = Object.fromEntries(maintenanceLanes.map((name) => [name, ["HISTORICAL_CURRENT_RECEIPT_SELECTION_MAINTENANCE"]]));
  const decision = policy({ failures });
  assert.equal(decision.acceptable, true);
  assert.equal(decision.rawPassedLanes, 10);
  assert.equal(decision.nonBlockingAssuranceFindings.length, 3);
});

for (const [number, label, code] of [
  [4, "P1", "P1_SECURITY_FINDING"],
  [5, "money", "MONEY_LEDGER_PAYOUT_SETTLEMENT_ENTITLEMENT_FAILURE"],
  [6, "RLS cross-user", "RLS_RPC_SECURITY_DEFINER_FAILURE"],
  [7, "source identity ambiguity", "SOURCE_IDENTITY_AMBIGUITY"],
]) test(`${number}: ${label} remains blocking`, () => {
  const decision = policy({ failures: { [PHASE1_REQUIRED_LANES[0]]: [code] } });
  assert.equal(decision.result, PHASE1_ADMISSION_RESULTS.BLOCKED);
});

test("8: a display-only current-truth mismatch can be policy non-blocking", () => {
  const decision = policy({ failures: { [maintenanceLanes[0]]: ["CURRENT_TRUTH_DISPLAY_PROJECTION_MISMATCH"] } });
  assert.equal(decision.acceptable, true);
  assert.equal(decision.nonBlockingAssuranceFindings[0].code, "CURRENT_TRUTH_DISPLAY_PROJECTION_MISMATCH");
});

test("9: draft 13/13 is source-readiness acceptable and grants no merge authority", () => {
  const decision = evaluatePhase1Admission(fixture({ draft: true, action: "opened" }));
  assert.equal(decision.result, PHASE1_ADMISSION_RESULTS.SOURCE_READINESS_ACCEPTABLE);
  assert.equal(decision.mergeAuthorityGranted, false);
});

test("10: ready_for_review requires a fresh lifecycle generation", () => {
  const stale = fixture({ draft: true, action: "opened" });
  stale.lifecycle = { ...stale.lifecycle, draft: false, action: "ready_for_review" };
  assert.equal(evaluatePhase1Admission(stale).acceptable, false);
  assert.equal(evaluatePhase1Admission(fixture({ action: "ready_for_review", eventUpdatedAt: "2026-08-24T12:01:00Z" })).acceptable, true);
});

test("11: converted_to_draft removes a ready result", () => {
  const stale = fixture();
  stale.lifecycle = { ...stale.lifecycle, draft: true, action: "converted_to_draft" };
  assert.equal(evaluatePhase1Admission(stale).acceptable, false);
});

test("12: synchronize invalidates old-head and old-base results", () => {
  const oldHead = fixture();
  oldHead.identity = { ...identity, headSha: "5".repeat(40), sourceTree: "6".repeat(40) };
  assert.equal(evaluatePhase1Admission(oldHead).acceptable, false);
  const oldBase = fixture();
  oldBase.identity = { ...identity, baseSha: "7".repeat(40) };
  assert.equal(evaluatePhase1Admission(oldBase).acceptable, false);
});

test("13: PR free-form text cannot assign a non-blocking classification", () => {
  const decision = evaluatePhase1Admission(fixture({ findings: [blockingFinding("STALE_HISTORICAL_FIXTURE")] }));
  assert.equal(decision.acceptable, false);
  assert.equal(decision.blockingFindings.at(-1).code, "PHASE1_UNCLASSIFIED_FAILURE");
});

test("14: only canonical code mapping assigns policy classes and remains non-authoritative", () => {
  const forged = policy({ failures: { [maintenanceLanes[0]]: ["PR_CONTROLLED_NON_BLOCKING"] } });
  assert.equal(forged.acceptable, false);
  assert.equal(forged.authoritative, false);
});

test("15: unknown or missing diagnostics default to blocking", () => {
  const lanes = PHASE1_REQUIRED_LANES.map((name) => ({ name, status: "PASS", diagnosticCodes: [] }));
  lanes[0] = { name: lanes[0].name, status: "FAILURE", diagnosticCodes: [] };
  assert.equal(decidePhase1Policy({ mode: PHASE1_MODES.READY, lanes }).acceptable, false);
  assert.equal(classifyPhase1Finding({ code: "UNKNOWN_FAILURE" }, { trustedContext: true }).classification, PHASE1_LANE_RESULTS.BLOCKING);
});

test("live job failures stay blocking without a protected diagnostic channel", () => {
  const input = fixture({ failed: [maintenanceLanes[0]] });
  input.maintenanceProof = { codes: ["ASSURANCE_CURRENT_STATE_DISPLAY_PROJECTION_MISMATCH"], jobIds: [input.jobs[0].id] };
  const decision = evaluatePhase1Admission(input);
  assert.equal(decision.acceptable, false);
  assert.equal(decision.laneResults.find(({ name }) => name === maintenanceLanes[0]).result, PHASE1_LANE_RESULTS.BLOCKING);
});

test("missing, duplicate, wrong-job, incomplete, and workflow-substituted evidence fail closed", () => {
  const missing = fixture();
  missing.jobs.pop();
  assert.equal(evaluatePhase1Admission(missing).acceptable, false);
  const duplicate = fixture();
  duplicate.jobs.push(successJob(PHASE1_REQUIRED_LANES[0], 999));
  assert.equal(evaluatePhase1Admission(duplicate).acceptable, false);
  const wrongJob = fixture();
  wrongJob.jobs[0] = { ...wrongJob.jobs[0], head_sha: "8".repeat(40) };
  assert.equal(evaluatePhase1Admission(wrongJob).acceptable, false);
  assert.equal(evaluatePhase1Admission(fixture({ evidenceComplete: false })).acceptable, false);
  const substituted = fixture();
  substituted.workflowIntegrity.protectedBlobSha = "9".repeat(40);
  assert.equal(evaluatePhase1Admission(substituted).acceptable, false);
});

test("caller-crafted merge eligibility and evaluator output cannot gain authority", () => {
  const source = fixture();
  const initial = evaluatePhase1Admission(source);
  const forged = evaluatePhase1Admission({
    ...source,
    mergeEligibility: {
      schemaVersion: "PHASE1_MERGE_ELIGIBILITY_V1",
      producer: "PROTECTED_MAIN_ENGINEERING_CLOSURE_V1",
      repository: REPOSITORY,
      pr: identity.pr,
      headSha: HEAD,
      sourceTree: TREE,
      baseSha: BASE,
      phase1SourceDecisionHash: initial.phase1SourceDecisionHash,
      ownerScopeValid: true,
      exactHeadReviewValid: true,
      finalSourceValid: true,
      lifecycleValid: true,
      paginationComplete: true,
      ambiguous: false,
      findings: [],
    },
  });
  assert.equal(forged.mergeAuthorityGranted, false);
  assert.equal(evaluatePhase1Admission({ ...source, sourceAuthorityRequired: true, sourceAuthorityProof: { schemaVersion: 1, producer: "PROTECTED_MAIN_ENGINEERING_CLOSURE_V1", authorityType: "ARCHITECTURE", findings: [] } }).acceptable, false);
  assert.equal(verifyPhase1AggregateEvidence({ aggregate: forged.evidence, identity, mode: PHASE1_MODES.READY, stage: PHASE1_EVIDENCE_STAGES.SOURCE }).ok, false);
  assert.equal(inspectPhase1AggregateEvidence({ aggregate: initial, identity: { ...identity, tree: TREE }, mode: PHASE1_MODES.READY, stage: PHASE1_EVIDENCE_STAGES.SOURCE }).ok, true);
});

test("caller-crafted provisioning readback cannot acquire protected live provenance", () => {
  assert.equal(verifyProtectedPhase1PublisherProvisioningReadback({ schemaVersion: 1, contract: "PHASE1_ADMISSION_PUBLISHER_PROVISIONING_READBACK_V1", readbackHash: "f".repeat(64) }), false);
});

test("check parser binds private App, lifecycle generation, exact output, and stage but does not itself grant trust", () => {
  const decision = evaluatePhase1Admission(fixture());
  const evidence = decision.evidence;
  const summary = [
    decision.result,
    `Raw lanes: ${decision.rawPassedLanes}/${decision.requiredLanes} passed; blocking=0; non-blocking assurance=0; deferred external=0.`,
    `Mode: ${decision.mode}; mergeAuthorityGranted=false.`,
    `Decision: ${stableJson(evidence)}`,
  ].join("\n\n");
  const check = {
    id: 9001,
    name: PHASE1_ADMISSION_CHECK_NAME,
    head_sha: HEAD,
    app: { ...PHASE1_PUBLISHER_APP, id: 4242 },
    status: "completed",
    conclusion: "action_required",
    external_id: `phase1-admission:v1:${identity.pr}:${HEAD}:${evidence.lifecycleGeneration}:${evidence.runId}:${evidence.decisionHash}`,
    output: { title: evidence.result, summary },
  };
  const parsed = parsePhase1AdmissionCheckReadback({ checks: [check], paginationComplete: true, identity, stage: PHASE1_EVIDENCE_STAGES.SOURCE, publisherAppId: 4242 });
  assert.deepEqual(parsed, evidence);
  assert.equal(verifyPhase1AggregateEvidence({ aggregate: parsed, identity, stage: PHASE1_EVIDENCE_STAGES.SOURCE, mode: PHASE1_MODES.READY }).ok, false);
  assert.throws(() => parsePhase1AdmissionCheckReadback({ checks: [{ ...check, app: { id: 15368, name: "GitHub Actions", slug: "github-actions" } }], paginationComplete: true, identity, stage: PHASE1_EVIDENCE_STAGES.SOURCE }), /PROVENANCE_INVALID/u);
});

test("a private-App success for another PR at the same commit is foreign and cannot satisfy current admission", () => {
  const evidence = evaluatePhase1Admission(fixture()).evidence;
  const foreign = { id: 9002, name: PHASE1_ADMISSION_CHECK_NAME, head_sha: HEAD, app: { ...PHASE1_PUBLISHER_APP, id: 4242 }, external_id: `phase1-admission:v1:246:${HEAD}:${evidence.lifecycleGeneration}:${evidence.runId}:${evidence.decisionHash}` };
  const partition = partitionProtectedAdmissionChecks({ checks: [foreign], identity, publisherAppId: 4242 });
  assert.deepEqual([partition.publisher.length, partition.current.length, partition.foreign.length], [1, 0, 1]);
});

test("durable PR association recovers pull_requests:[] and rejects ambiguity", () => {
  const pr = {
    number: identity.pr,
    head: { sha: HEAD, ref: identity.headRef, repo: { full_name: REPOSITORY } },
    base: { sha: BASE, ref: "main", repo: { full_name: REPOSITORY } },
  };
  const run = { event: "pull_request", head_sha: HEAD, repository: { full_name: REPOSITORY }, pull_requests: [] };
  assert.equal(selectDurablePhase1PullRequest({ repository: REPOSITORY, run, associatedPullRequests: [pr], paginationComplete: true }).ok, true);
  assert.equal(selectDurablePhase1PullRequest({ repository: REPOSITORY, run, associatedPullRequests: [], paginationComplete: true }).ok, false);
  assert.equal(selectDurablePhase1PullRequest({ repository: REPOSITORY, run, associatedPullRequests: [pr, { ...pr, number: 248 }], paginationComplete: true }).ok, false);
  assert.equal(selectDurablePhase1PullRequest({ repository: REPOSITORY, run: { ...run, pull_requests: [{ ...pr, number: 248 }] }, associatedPullRequests: [pr], paginationComplete: true }).ok, false);
});

test("privileged workflow is main-owned, private-App isolated, and never grants checks:write to GITHUB_TOKEN", () => {
  const workflow = fs.readFileSync(new URL("../../.github/workflows/phase1-admission.yml", import.meta.url), "utf8");
  assert.match(workflow, /environment: phase1-admission-publisher/gu);
  assert.equal((workflow.match(/environment: phase1-admission-publisher/gu) ?? []).length, 4);
  assert.match(workflow, /checks: read/u);
  assert.doesNotMatch(workflow, /checks: write/u);
  assert.equal((workflow.match(/ref: \$\{\{ github\.workflow_sha \}\}/gu) ?? []).length, 4);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.event\.pull_request\.(?:base|head)\.sha/u);
  assert.match(workflow, /PHASE1_ADMISSION_APP_CLIENT_ID/u);
  assert.match(workflow, /PHASE1_ADMISSION_APP_INTEGRATION_ID/u);
  assert.match(workflow, /PHASE1_ADMISSION_APP_INSTALLATION_ID/u);
  assert.match(workflow, /PHASE1_ADMISSION_APP_KEY_FINGERPRINT/u);
  assert.match(workflow, /PHASE1_ADMISSION_APP_PRIVATE_KEY/u);
  assert.match(workflow, /base\.ref == github\.event\.repository\.default_branch/u);
  assert.match(workflow, /converted_to_draft, closed/u);
  assert.doesNotMatch(workflow, /^concurrency:/mu, "security lifecycle events must not be dropped by GitHub's one-pending-run concurrency semantics");
  assert.match(workflow, /--initialize/u);
  assert.match(workflow, /workflow_dispatch:[\s\S]*type: number/u);
  assert.match(workflow, /group: phase1-app-only-merge[\s\S]*cancel-in-progress: false/u);
  assert.match(workflow, /github\.actor == 'Chillywood2025' && github\.triggering_actor == 'Chillywood2025'/u, "both the original dispatcher and re-run initiator must be the Owner");
  assert.match(workflow, /PHASE1_MERGE_TRIGGERING_ACTOR: \$\{\{ github\.triggering_actor \}\}/u);
  assert.doesNotMatch(workflow, /queue:\s*\n\s*max:/u);
  assert.match(workflow, /--merge[\s\S]*\$\{\{ inputs\.pr \}\}/u);
  const publisher = fs.readFileSync(new URL("../../scripts/assurance/phase1-admission.mjs", import.meta.url), "utf8");
  assert.match(publisher, /await invalidateTrustedChecksAtHead\(\{ repository, headSha: event\?\.pull_request\?\.head\?\.sha, publisher \}\);\s*if \(event\?\.action === "closed"\) return;/u);
  assert.match(publisher, /PHASE1_PR_NOT_OPEN_UNMERGED/u);
  assert.match(publisher, /delete process\.env\.PHASE1_ADMISSION_APP_PRIVATE_KEY/u);
  assert.match(publisher, /mode === "merge" \? \{ contents: "write" \} : mode === "publisher" \? \{ checks: "write", environments: "read" \}/u);
  assert.match(publisher, /githubRawRequest\(`\/apps\/\$\{encodeURIComponent\(PHASE1_PUBLISHER_APP\.slug\)\}`, null, \{ redirect: "error" \}\)/u);
  assert.match(publisher, /githubRawRequest\("\/app\/hook\/config", jwt, \{ redirect: "error" \}\)/u);
  assert.match(publisher, /environments\/\$\{environmentName\}`, readToken/u, "Actions-read environment discovery uses the protected workflow token");
  assert.match(publisher, /deployment-branch-policies`, "branch_policies", readToken/u, "Actions-read branch policy discovery uses the protected workflow token, not the App environment token");
  assert.doesNotMatch(publisher, /keyRecordId/u, "the runtime proves the private key by its SPKI fingerprint, never by an unreadable key record ID");
  assert.match(publisher, /if \(!appMergeDecisionBrand\.has\(decision\)/u);
  assert.match(publisher, /PHASE1_MERGE_ACTOR !== "Chillywood2025" \|\| process\.env\.PHASE1_MERGE_TRIGGERING_ACTOR !== "Chillywood2025"/u, "runtime revalidates the original dispatcher and re-run initiator");
  assert.match(publisher, /decision\?\.acceptable \? "action_required" : "failure"/u, "the aggregate is display-only and can never be the merge primitive");
  assert.match(publisher, /executeProtectedPhase1AppOnlyMergeGate\([\s\S]*mergeExact: async \(mergeGate\)[\s\S]*publisherInstallationToken\([^)]*"merge"\)/u, "the Contents token is minted only inside the protected one-shot R2 callback");
  const engine = fs.readFileSync(new URL("../../scripts/assurance/engineering-closure.mjs", import.meta.url), "utf8");
  assert.match(engine, /anchor\?\.anchorType !== "R2_INSTALLED"[\s\S]*anchor\?\.currentRulesetStage !== "FINAL_AGGREGATE_ONLY"[\s\S]*anchor\?\.cutoverLock !== "OPEN"/u);
  assert.match(engine, /mergeExact\(Object\.freeze\([\s\S]*invokeOnce\(\)/u);
});

test("App-only gate binds PR identity, lifecycle, source, base, execution, provider stage, and exact admission", () => {
  const source = evaluatePhase1Admission(fixture());
  let evidence = { ...source.evidence, mergeAuthorityGranted: true };
  let decision = { ...source, mergeAuthorityGranted: true, evidence };
  const pullRequest = {
    number: identity.pr, state: "open", merged: false, merged_at: null, draft: false,
    head: { ref: identity.headRef, sha: HEAD, repo: { full_name: REPOSITORY } },
    base: { ref: "main", sha: BASE, repo: { full_name: REPOSITORY } },
  };
  const provisioningReadback = phase1AdmissionPublisherProvisioningReadback({
    ...PUBLISHER_KEY_READBACK,
    appId: 4242, clientId: "Iv1.0123456789abcdef", installationId: 55, environmentId: 66,
    aggregateCheckIntegrationId: 4242, observedAt: "2026-08-24T12:00:00Z", rulesetNodeId: "RRS_gate",
    rulesetProviderUpdatedAt: "2026-08-24T12:00:00-05:00", bypassReadback: "EXPLICIT_APP_PULL_REQUEST_ONLY",
    stage1PutPayloadSha256: "5".repeat(64), finalPutPayloadSha256: "6".repeat(64), rollbackPutPayloadSha256: "7".repeat(64),
    stage: "FINAL_AGGREGATE_ONLY",
  });
  const execution = { ref: `refs/pull/${identity.pr}/merge`, sha: "8".repeat(40), tree: "9".repeat(40), parents: [BASE, HEAD] };
  evidence = { ...evidence, currentRulesetStage: "FINAL_AGGREGATE_ONLY", publisherAnchorHash: "4".repeat(64), publisherProvisioningReadbackHash: provisioningReadback.readbackHash };
  decision = { ...decision, currentRulesetStage: evidence.currentRulesetStage, publisherAnchorHash: evidence.publisherAnchorHash, publisherProvisioningReadbackHash: evidence.publisherProvisioningReadbackHash, evidence };
  const input = { identity, decision, latestEvidence: evidence, pullRequest, defaultMainSha: BASE, sourceTree: TREE, execution, provisioningReadback, publisherAppId: 4242 };
  const accepted = evaluateAppOnlyMergeGateSnapshot(input);
  assert.equal(accepted.ok, true);
  assert.deepEqual(accepted.request, { sha: HEAD, merge_method: "merge", commit_title: `Merge pull request #${identity.pr} from Chillywood2025/${identity.headRef}`, commit_message: `Protected App-only merge of ${HEAD} into ${BASE}.` });

  const reject = (replacement, finding) => assert.ok(evaluateAppOnlyMergeGateSnapshot({ ...input, ...replacement }).findings.includes(finding));
  reject({ pullRequest: { ...pullRequest, number: 248 } }, "PHASE1_APP_MERGE_PR_LIFECYCLE_INVALID");
  reject({ pullRequest: { ...pullRequest, draft: true } }, "PHASE1_APP_MERGE_PR_LIFECYCLE_INVALID");
  reject({ pullRequest: { ...pullRequest, head: { ...pullRequest.head, repo: { full_name: "attacker/fork" } } } }, "PHASE1_APP_MERGE_PR_IDENTITY_INVALID");
  reject({ defaultMainSha: "a".repeat(40) }, "PHASE1_APP_MERGE_SOURCE_OR_BASE_STALE");
  reject({ latestEvidence: { ...evidence, lifecycleGeneration: "b".repeat(64) } }, "PHASE1_APP_MERGE_ADMISSION_INVALID");
  reject({ decision: { ...decision, mergeAuthorityGranted: false } }, "PHASE1_APP_MERGE_ADMISSION_INVALID");
  reject({ decision: { ...decision, rawFailedLanes: 1, rawPassedLanes: 11 } }, "PHASE1_APP_MERGE_ADMISSION_INVALID");
  reject({ execution: { ...execution, parents: [BASE, "c".repeat(40)] } }, "PHASE1_APP_MERGE_EXECUTION_INVALID");
  reject({ execution: { ...execution, ref: "refs/pull/248/merge" } }, "PHASE1_APP_MERGE_EXECUTION_INVALID");
  reject({ provisioningReadback: { ...provisioningReadback, ruleset: { ...provisioningReadback.ruleset, stage: "STAGE1_AGGREGATE_PLUS_13_RAW" } } }, "PHASE1_APP_MERGE_PROVIDER_GATE_INVALID");
});

test("App-only merge quiescence rejects hidden pagination, old-head work, and every concurrent run", () => {
  const gateStartedAt = "2026-08-24T12:00:00Z";
  const current = { id: 7001, run_attempt: 1, created_at: gateStartedAt, event: "workflow_dispatch", path: ".github/workflows/phase1-admission.yml", head_sha: BASE, head_branch: "main", actor: { login: "Chillywood2025" }, status: "in_progress", jobsPaginationComplete: true, jobs: [{ id: 8001, name: "Execute protected App-only merge gate", status: "in_progress" }] };
  const options = { runs: [current], recentRuns: [current], paginationComplete: true, recentPaginationComplete: true, currentRunId: current.id, currentRunAttempt: 1, evaluatorSha: BASE, gateStartedAt };
  assert.equal(evaluateRepositoryActionsQuiescence(options).ok, true);
  assert.equal(evaluateRepositoryActionsQuiescence({ ...options, paginationComplete: false }).ok, false);
  assert.equal(evaluateRepositoryActionsQuiescence({ ...options, runs: [current, { id: 7000, event: "pull_request", head_sha: "d".repeat(40), head_branch: "old-force-pushed-head", status: "in_progress" }] }).ok, false);
  assert.equal(evaluateRepositoryActionsQuiescence({ ...options, recentRuns: [current, { id: 7002, run_attempt: 1, created_at: "2026-08-24T12:00:01Z", event: "pull_request", path: ".github/workflows/attacker.yml", head_sha: "d".repeat(40), head_branch: "old-force-pushed-head", status: "completed" }] }).ok, false, "a parent that completes and dispatches a child between active-status sweeps remains visible in the since-gate-start census");
  assert.equal(evaluateRepositoryActionsQuiescence({ ...options, recentPaginationComplete: false }).ok, false);
  assert.equal(evaluateRepositoryActionsQuiescence({ ...options, runs: [{ ...current, head_sha: "e".repeat(40) }] }).ok, false);
  assert.equal(evaluateRepositoryActionsQuiescence({ ...options, runs: [{ ...current, actor: { login: "write-collaborator" } }] }).ok, false);
});

test("App-only merge postcondition requires the exact bot, subject, merge parents, tree, PR, and main readback", () => {
  const expected = { appLogin: `${PHASE1_PUBLISHER_APP.slug}[bot]`, baseSha: BASE, headSha: HEAD, tree: TREE, commitSubject: `Merge pull request #${identity.pr} from Chillywood2025/${identity.headRef}` };
  const mergeSha = "f".repeat(40);
  const response = { merged: true, sha: mergeSha };
  const pullRequest = { state: "closed", merged: true, merge_commit_sha: mergeSha, merged_by: { login: expected.appLogin } };
  const commit = { sha: mergeSha, tree: TREE, parents: [BASE, HEAD], subject: expected.commitSubject };
  assert.equal(evaluateAppOnlyMergePostcondition({ expected, response, pullRequest, mainSha: mergeSha, commit }).ok, true);
  assert.equal(evaluateAppOnlyMergePostcondition({ expected, response, pullRequest: { ...pullRequest, merged_by: { login: "human" } }, mainSha: mergeSha, commit }).ok, false);
  assert.equal(evaluateAppOnlyMergePostcondition({ expected, response, pullRequest, mainSha: mergeSha, commit: { ...commit, parents: [HEAD, BASE] } }).ok, false);
  assert.equal(evaluateAppOnlyMergePostcondition({ expected, response, pullRequest, mainSha: mergeSha, commit: { ...commit, subject: `Merge pull request #${identity.pr} from attacker/${identity.headRef}` } }).ok, false);
  assert.equal(evaluateAppOnlyMergePostcondition({ expected, response, pullRequest, mainSha: "0".repeat(40), commit }).ok, false);
});

test("raw Phase 1 deterministically cuts over its three narrow maintenance projections from protected main", () => {
  const workflow = fs.readFileSync(new URL("../../.github/workflows/phase1-ci.yml", import.meta.url), "utf8");
  const guard = fs.readFileSync(new URL("../../scripts/guard-autonomous-systems-contract.mjs", import.meta.url), "utf8");
  const library = fs.readFileSync(new URL("../../scripts/assurance/lib.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(workflow, /PHASE1_RISK_ADMISSION_ACTIVE/u);
  assert.equal((workflow.match(/git cat-file -e "\$PHASE1_PROTECTED_BASE_SHA":\.github\/workflows\/phase1-admission\.yml/gu) ?? []).length, 6);
  assert.equal((workflow.match(/LEGACY_PRE_CUTOVER/gu) ?? []).length, 3);
  assert.equal((workflow.match(/Validate non-authoritative assurance display projection/gu) ?? []).length, 3);
  assert.equal((workflow.match(/node "\$PHASE1_EVALUATOR_ROOT\/scripts\/guard-autonomous-systems-contract\.mjs" --maintenance-projection-only/gu) ?? []).length, 3);
  assert.equal((workflow.match(/node "\$PHASE1_STRICT_EVALUATOR_ROOT\/scripts\/guard-autonomous-systems-contract\.mjs"; SOURCE_GUARD=\$\?/gu) ?? []).length, 3);
  assert.equal((workflow.match(/node \.\/scripts\/guard-autonomous-systems-contract\.mjs; SOURCE_GUARD=\$\?/gu) ?? []).length, 3, "candidate evaluator is bootstrap-only; protected main owns post-cutover classification");
  assert.doesNotMatch(workflow, /node \.\/scripts\/guard-autonomous-systems-contract\.mjs --maintenance-projection-only/u);
  assert.match(guard, /const subjectGit = \(argv, options = \{\}\) => execFileSync\("git", argv, \{\s*cwd: root,/u);
  assert.equal((guard.match(/gitCommand: subjectGit/gu) ?? []).length, 2, "protected code must evaluate the candidate checkout, not its own base worktree");
  assert.match(library, /const candidateRoot = process\.cwd\(\);[\s\S]*validateUntrustedAssuranceControlTaskContextObservation/u);
});

test("immutable publisher anchor requires exact R1 Owner receipts and exact separately observed provisioning", () => {
  const sourcePr = 900;
  const sourceBranch = "codex/phase1-risk-based-admission-r1";
  const comment = (id, body) => ({
    id,
    node_id: `IC_${id}`,
    body,
    user: { login: "Chillywood2025" },
    author_association: "OWNER",
    created_at: "2026-08-24T12:00:00Z",
    updated_at: "2026-08-24T12:00:00Z",
    issue_url: `${"https://api.github.com/repos"}/${REPOSITORY}/issues/${sourcePr}`,
    html_url: `${"https://github.com"}/${REPOSITORY}/pull/${sourcePr}#issuecomment-${id}`,
  });
  const sourceHead = "a".repeat(40); const sourceTree = "b".repeat(40); const sourceBase = "8aa74d0442eb9797900005d3c2dca9709b43c0c8";
  const sourceScope = { files: [...PHASE1_RISK_BASED_ADMISSION_REFORM_ARCHITECTURE_PATHS], additions: 1500, deletions: 900, netChangedLines: 600 };
  const intentSubject = architectureMaintenanceSubject({ identity: { repository: REPOSITORY, pr: sourcePr, branch: sourceBranch, headSha: sourceHead, baseSha: sourceBase }, tree: sourceTree, scope: sourceScope, profile: "OWNER_JURISDICTION_CANONICAL_MODEL_V2", objective: PHASE1_RISK_BASED_ADMISSION_REFORM_V1 });
  const intentRaw = comment(9001, architectureMaintenanceOwnerCommentBody(intentSubject));
  const live = phase1AdmissionPublisherProvisioningReadback({
    ...PUBLISHER_KEY_READBACK,
    appId: 101,
    clientId: "Iv1.0123456789abcdef",
    installationId: 202,
    environmentId: 303,
    aggregateCheckIntegrationId: 101,
    observedAt: "2026-08-24T12:00:00Z",
    rulesetNodeId: "RRS_fixture",
    rulesetProviderUpdatedAt: "2026-08-24T12:00:00Z",
    stage1PutPayloadSha256: "c".repeat(64),
    finalPutPayloadSha256: "d".repeat(64),
    rollbackPutPayloadSha256: "e".repeat(64),
    stage: "STAGE1_AGGREGATE_PLUS_13_RAW",
  });
  const finalSubject = { type: "OWNER_ASSURANCE_ARCHITECTURE_FINAL_SOURCE_V1", repository: REPOSITORY, pr: sourcePr, branch: sourceBranch, protectedBase: sourceBase, objective: PHASE1_RISK_BASED_ADMISSION_REFORM_V1, originalCommentId: intentRaw.id, currentHead: sourceHead, currentTree: sourceTree, finalHead: sourceHead, finalTree: sourceTree, changedPaths: [...PHASE1_RISK_BASED_ADMISSION_REFORM_ARCHITECTURE_PATHS], budget: intentSubject.budget, repositoryReview: { valid: true, profile: PHASE1_RISK_BASED_ADMISSION_REFORM_V1 }, admissionPublisherProvisioningReadback: live, ownerIdentity: { login: "Chillywood2025", association: "OWNER" }, immutableCommentRequired: true, createdAtEqualsUpdatedAtRequired: true };
  const finalRaw = comment(9002, architectureFinalSourceOwnerCommentBody(finalSubject));
  const payload = (raw, marker) => JSON.parse(raw.body.slice(marker.length + 1));
  const intentPayload = payload(intentRaw, ARCHITECTURE_MAINTENANCE_MARKER); const finalPayload = payload(finalRaw, ARCHITECTURE_FINAL_SOURCE_MARKER);
  const anchorBody = {
    schemaVersion: 1,
    contract: PHASE1_ADMISSION_PUBLISHER_PROVISIONING_V1.r2ImmutableAnchor.contract,
    sourcePr,
    sourceBranch,
    sourceHead,
    sourceTree,
    sourceBase,
    sourceMergeSha: "c".repeat(40),
    sourceMergeTree: sourceTree,
    originalIntentCommentId: intentRaw.id,
    originalIntentBodyHash: hashValue(intentRaw.body),
    originalIntentSubjectHash: intentPayload.subjectHash,
    finalSourceCommentId: finalRaw.id,
    finalSourceBodyHash: hashValue(finalRaw.body),
    finalSourceSubjectHash: finalPayload.subjectHash,
    provisioningReadback: live,
    provisioningReadbackHash: live.readbackHash,
    appId: live.app.id,
    clientId: live.app.clientId,
    installationId: live.installation.id,
    environmentId: live.environment.id,
    aggregateCheckIntegrationId: live.aggregate.integrationId,
    rulesetNodeId: live.ruleset.nodeId,
    rulesetProviderUpdatedAt: live.ruleset.providerUpdatedAt,
    prestatePutPayloadSha256: live.ruleset.prestatePutPayloadSha256,
    stage1PutPayloadSha256: live.ruleset.stage1PutPayloadSha256,
    finalPutPayloadSha256: live.ruleset.finalPutPayloadSha256,
    rollbackPutPayloadSha256: live.ruleset.rollbackPutPayloadSha256,
    currentRulesetStage: live.ruleset.stage,
  };
  const anchor = { ...anchorBody, anchorHash: hashValue(anchorBody) };
  const verify = (value, observed = live, comments = [intentRaw, finalRaw]) => verifyPhase1AdmissionPublisherImmutableAnchor({ anchor: value, liveProvisioningReadback: observed, comments, paginationComplete: true, repository: REPOSITORY });
  assert.equal(verify(anchor).ok, true);
  const advancedLive = phase1AdmissionPublisherProvisioningReadback({
    ...PUBLISHER_KEY_READBACK,
    appId: live.app.id,
    clientId: live.app.clientId,
    installationId: live.installation.id,
    environmentId: live.environment.id,
    aggregateCheckIntegrationId: live.aggregate.integrationId,
    observedAt: "2026-08-24T13:00:00Z",
    rulesetNodeId: live.ruleset.nodeId,
    rulesetProviderUpdatedAt: "2026-08-24T13:00:00Z",
    stage1PutPayloadSha256: live.ruleset.stage1PutPayloadSha256,
    finalPutPayloadSha256: live.ruleset.finalPutPayloadSha256,
    rollbackPutPayloadSha256: live.ruleset.rollbackPutPayloadSha256,
    stage: "FINAL_AGGREGATE_ONLY",
  });
  assert.equal(verify(anchor, advancedLive).ok, true, "a lawful stage/version observation advances without rewriting the stable immutable anchor");
  assert.equal(verify(null).ok, false, "a prospective contract or live readback cannot replace the installed anchor");
  assert.equal(verify(anchor, live, []).ok, false, "Owner intent/final-source history is mandatory");
  for (const [field, replacement] of [
    ["appId", 999], ["clientId", "Iv1.deadbeef"], ["installationId", 999], ["environmentId", 999],
    ["aggregateCheckIntegrationId", 999], ["rulesetNodeId", "RRS_substituted"],
    ["rulesetProviderUpdatedAt", "2026-08-24T13:00:00Z"], ["currentRulesetStage", "FINAL_AGGREGATE_ONLY"],
    ["stage1PutPayloadSha256", "f".repeat(64)], ["finalPutPayloadSha256", "f".repeat(64)],
  ]) {
    const changedBody = { ...anchorBody, [field]: replacement };
    assert.equal(verify({ ...changedBody, anchorHash: hashValue(changedBody) }).ok, false, `${field} substitution must fail`);
  }
  const wrongIntentBody = { ...anchorBody, originalIntentCommentId: 9999 };
  assert.equal(verify({ ...wrongIntentBody, anchorHash: hashValue(wrongIntentBody) }).ok, false);
  const wrongFinalBody = { ...anchorBody, finalSourceCommentId: 9999 };
  assert.equal(verify({ ...wrongFinalBody, anchorHash: hashValue(wrongFinalBody) }).ok, false);

  const sourceEvidence = {
    ...evaluatePhase1Admission(fixture()).evidence,
    currentRulesetStage: "STAGE1_AGGREGATE_PLUS_13_RAW",
    publisherAnchorHash: anchor.anchorHash,
    publisherProvisioningReadbackHash: live.readbackHash,
  };
  assert.equal(inspectPhase1AggregateEvidence({
    aggregate: sourceEvidence,
    identity,
    mode: PHASE1_MODES.READY,
    stage: PHASE1_EVIDENCE_STAGES.SOURCE,
    expectedRulesetStage: "STAGE1_AGGREGATE_PLUS_13_RAW",
    expectedPublisherAnchorHash: anchor.anchorHash,
    expectedPublisherProvisioningReadbackHash: live.readbackHash,
    requirePublisherAnchor: true,
  }).ok, true);
  assert.equal(inspectPhase1AggregateEvidence({
    aggregate: sourceEvidence,
    identity,
    mode: PHASE1_MODES.READY,
    stage: PHASE1_EVIDENCE_STAGES.SOURCE,
    expectedRulesetStage: "FINAL_AGGREGATE_ONLY",
    expectedPublisherAnchorHash: anchor.anchorHash,
    expectedPublisherProvisioningReadbackHash: advancedLive.readbackHash,
    requirePublisherAnchor: true,
  }).ok, false, "a STAGE1 source decision cannot replay after the provider advances to FINAL");
});
