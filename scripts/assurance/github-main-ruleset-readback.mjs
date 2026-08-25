import { spawnSync } from "node:child_process";
import { ROOT, git, sha256, stableJson } from "./lib.mjs";

export const exactHeadCheck = "Chi'llywood / Codex Review Exact Head";
export const phase1Checks = [
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
  "Phase 1 / iOS Configuration"
];
export const requiredChecks = [...phase1Checks];
export const historicalRequiredChecks = [exactHeadCheck, ...phase1Checks];
export const githubActionsIntegrationId = 15368;
export const requiredCheckBindings = requiredChecks.map((context) => ({ context, integration_id: githubActionsIntegrationId }));
export const mainBranchCondition = { ref_name: { exclude: [], include: ["refs/heads/main"] } };
export const repositoryRulesetSource = {
  sourceType: "Repository",
  source: "Chillywood2025/chillywood-mobile"
};
export const requiredCheckPublisherBoundary = {
  expectedGitHubApp: "github-actions",
  expectedGitHubAppIntegrationId: githubActionsIntegrationId,
  repositoryOwnerType: "User",
  rootAuthority: "Chillywood2025",
  trustedRepositoryWriteActors: ["Chillywood2025"],
  unexpectedWriteActorResult: "CODEX_REVIEW_UNTRUSTED_WRITE_ACTOR",
  forkWorkflowWriteTokensAllowed: false
};
export const pullRequestRequirements = {
  allowedMergeMethods: ["merge", "squash", "rebase"],
  requiredApprovingReviewCount: 0,
  requiredReviewThreadResolution: false,
  dismissStaleReviewsOnPush: true,
  requireCodeOwnerReview: false,
  requireLastPushApproval: false,
  requiredReviewers: [],
  preventDeletion: true,
  preventNonFastForward: true,
  bypassActors: []
};
export const bootstrapPullRequestRequirements = {
  allowedMergeMethods: ["merge", "squash", "rebase"],
  requiredApprovingReviewCount: 0,
  requiredReviewThreadResolution: true,
  dismissStaleReviewsOnPush: true,
  requireCodeOwnerReview: false,
  requireLastPushApproval: false,
  requiredReviewers: []
};
const effectiveRuleIdentity = (type, parameters) => ({
  type,
  rulesetId: 18940814,
  rulesetSourceType: repositoryRulesetSource.sourceType,
  rulesetSource: repositoryRulesetSource.source,
  ...(parameters ? { parameters } : {})
});
export const effectiveMainRules = [
  effectiveRuleIdentity("pull_request", {
    allowedMergeMethods: pullRequestRequirements.allowedMergeMethods,
    dismissStaleReviewsOnPush: pullRequestRequirements.dismissStaleReviewsOnPush,
    requireCodeOwnerReview: pullRequestRequirements.requireCodeOwnerReview,
    requireLastPushApproval: pullRequestRequirements.requireLastPushApproval,
    requiredApprovingReviewCount: pullRequestRequirements.requiredApprovingReviewCount,
    requiredReviewThreadResolution: pullRequestRequirements.requiredReviewThreadResolution,
    requiredReviewers: pullRequestRequirements.requiredReviewers
  }),
  effectiveRuleIdentity("non_fast_forward"),
  effectiveRuleIdentity("deletion"),
  effectiveRuleIdentity("required_status_checks", {
    doNotEnforceOnCreate: false,
    requiredStatusChecks: requiredCheckBindings,
    strictRequiredStatusChecksPolicy: true
  })
];
export const normalizedRulesetPayload = {
  rulesetId: 18940814,
  rulesetName: "main-pr-review-protection",
  target: "branch",
  enforcement: "active",
  conditions: mainBranchCondition,
  bypassActors: [],
  currentUserCanBypass: "never",
  rules: effectiveMainRules,
};
const bootstrapPolicySnapshot = (checks) => ({
  rulesetId: 18940814,
  rulesetName: "main-pr-review-protection",
  sourceType: repositoryRulesetSource.sourceType,
  source: repositoryRulesetSource.source,
  target: "branch",
  enforcement: "active",
  currentUserCanBypass: "never",
  conditions: mainBranchCondition,
  bypassActors: [],
  pullRequest: bootstrapPullRequestRequirements,
  preventNonFastForward: true,
  preventDeletion: true,
  requiredStatusChecks: {
    doNotEnforceOnCreate: false,
    contexts: checks.map((context) => ({ context })),
    publisherBindingState: "CONTEXT_ONLY_NO_INTEGRATION_ID_IN_PROVIDER_HISTORY",
    strictRequiredStatusChecksPolicy: true
  }
});
export const bootstrapWindowPolicies = {
  preRemoval: bootstrapPolicySnapshot(historicalRequiredChecks),
  removal: bootstrapPolicySnapshot(phase1Checks),
  restoration: bootstrapPolicySnapshot(historicalRequiredChecks)
};
export const bootstrapPhase1CheckRuns = [
  { id: 93351858559, name: "Phase 1 / Android Regression Guards", externalId: "7787b136-cccd-5b17-bfc3-e74575911ad7", checkSuiteId: 85044313814, appId: 15368, appSlug: "github-actions", startedAt: "2026-08-10T04:09:20Z", completedAt: "2026-08-10T04:09:56Z", status: "completed", conclusion: "success" },
  { id: 93351858389, name: "Phase 1 / Autonomous Systems All-Platform Contract", externalId: "27d9ff2f-46c1-5079-8ce4-9d1fd2076fbe", checkSuiteId: 85044313814, appId: 15368, appSlug: "github-actions", startedAt: "2026-08-10T04:09:13Z", completedAt: "2026-08-10T04:10:29Z", status: "completed", conclusion: "success" },
  { id: 93351858448, name: "Phase 1 / Autonomous Systems iOS Contract", externalId: "af314a5a-e2bb-5280-a8fb-ab2ac45d36eb", checkSuiteId: 85044313814, appId: 15368, appSlug: "github-actions", startedAt: "2026-08-10T04:09:14Z", completedAt: "2026-08-10T04:09:46Z", status: "completed", conclusion: "success" },
  { id: 93351858455, name: "Phase 1 / Cognitive Execution Safety", externalId: "9e27f680-9707-5fc1-a0b9-b70d729634cd", checkSuiteId: 85044313814, appId: 15368, appSlug: "github-actions", startedAt: "2026-08-10T04:09:14Z", completedAt: "2026-08-10T04:10:46Z", status: "completed", conclusion: "success" },
  { id: 93351858432, name: "Phase 1 / Cognitive Intelligence Contract", externalId: "65644c83-a708-5f35-9fa9-8ffb9e8f6ded", checkSuiteId: 85044313814, appId: 15368, appSlug: "github-actions", startedAt: "2026-08-10T04:09:14Z", completedAt: "2026-08-10T04:09:50Z", status: "completed", conclusion: "success" },
  { id: 93351858561, name: "Phase 1 / Expo Doctor", externalId: "72a7e901-96e9-5fb2-954b-54468d1eebd7", checkSuiteId: 85044313814, appId: 15368, appSlug: "github-actions", startedAt: "2026-08-10T04:09:14Z", completedAt: "2026-08-10T04:09:48Z", status: "completed", conclusion: "success" },
  { id: 93351858538, name: "Phase 1 / Repository Lint", externalId: "2f0bf503-f895-543c-87ac-6cdff9ac5ca5", checkSuiteId: 85044313814, appId: 15368, appSlug: "github-actions", startedAt: "2026-08-10T04:09:14Z", completedAt: "2026-08-10T04:09:57Z", status: "completed", conclusion: "success" },
  { id: 93351858438, name: "Phase 1 / Research and Memory Integrity", externalId: "7a3ba917-2115-5712-8853-822943f8fb47", checkSuiteId: 85044313814, appId: 15368, appSlug: "github-actions", startedAt: "2026-08-10T04:09:14Z", completedAt: "2026-08-10T04:14:05Z", status: "completed", conclusion: "success" },
  { id: 93351858525, name: "Phase 1 / Route Contracts", externalId: "f713a837-4392-5d08-b873-7f18c84bb21f", checkSuiteId: 85044313814, appId: 15368, appSlug: "github-actions", startedAt: "2026-08-10T04:09:20Z", completedAt: "2026-08-10T04:09:56Z", status: "completed", conclusion: "success" },
  { id: 93351858562, name: "Phase 1 / Runtime Validation", externalId: "6b2a8f8a-9452-5570-8848-4e037d7d767f", checkSuiteId: 85044313814, appId: 15368, appSlug: "github-actions", startedAt: "2026-08-10T04:09:19Z", completedAt: "2026-08-10T04:09:50Z", status: "completed", conclusion: "success" },
  { id: 93351858456, name: "Phase 1 / Supabase Database Integration", externalId: "37546964-7c41-5f91-a23e-4e4a833811c9", checkSuiteId: 85044313814, appId: 15368, appSlug: "github-actions", startedAt: "2026-08-10T04:09:14Z", completedAt: "2026-08-10T04:14:23Z", status: "completed", conclusion: "success" },
  { id: 93351858572, name: "Phase 1 / TypeScript", externalId: "a6568e09-af81-52b9-a524-ca8c86a4a918", checkSuiteId: 85044313814, appId: 15368, appSlug: "github-actions", startedAt: "2026-08-10T04:09:14Z", completedAt: "2026-08-10T04:10:01Z", status: "completed", conclusion: "success" },
  { id: 93351858558, name: "Phase 1 / iOS Configuration", externalId: "2ec1c1c8-7cbb-5f62-852f-4aceab65f0ae", checkSuiteId: 85044313814, appId: 15368, appSlug: "github-actions", startedAt: "2026-08-10T04:09:14Z", completedAt: "2026-08-10T04:09:57Z", status: "completed", conclusion: "success" }
];
export const bootstrapPhase1GithubReadbackPath = "config/assurance/a1-bootstrap-phase1-github-readback-v1.json";
export const ownerAuthorizationReceiptPath = "config/assurance/a1-owner-bootstrap-authorization-v1.json";
export const ownerFinalCarrierBindingReceiptPath = "config/assurance/a1-owner-final-carrier-binding-v1.json";
export const ownerFinalCarrierGithubReadbackPath = "config/assurance/a1-owner-final-carrier-github-readback-v1.json";
export const repositorySourceReadbackHours = 24;
export const canonicalOwnerAuthorizationReceipt = {
  schemaVersion: 1,
  contractId: "a1-owner-bootstrap-authorization-v1",
  schemaRef: "config/assurance/schemas-v1.json#/$defs/a1OwnerBootstrapAuthorizationReceipt",
  repository: "Chillywood2025/chillywood-mobile",
  prNumber: 205,
  commentId: 5235753938,
  commentUrl: "https://github.com/Chillywood2025/chillywood-mobile/issues/205#issuecomment-5235753938",
  author: "Chillywood2025",
  authorAssociation: "OWNER",
  createdAt: "2026-08-10T04:08:34Z",
  updatedAt: "2026-08-10T04:08:34Z",
  bodySha256: "f7733b9190d9b8eac12c8cee3ca587e7b240908e0aba7e5b639c7bfc65be247c",
  subjectHash: "d2d96e2316692e33972c2a3f7e0340a9bf1ede0e8c8c4a38164ba4b33cfb02fe",
  receiptHash: "13a97809e2f84a86e8958e607e2d132ef2b6e3c6829c83f566fcca9a547e0744"
};
export const canonicalOwnerFinalCarrierBindingReceipt = {
  schemaVersion: 1,
  contractId: "a1-owner-final-carrier-binding-v1",
  schemaRef: "config/assurance/schemas-v1.json#/$defs/a1OwnerFinalCarrierBindingReceipt",
  repository: "Chillywood2025/chillywood-mobile",
  prNumber: 205,
  sourceAuthorizationReceiptHash: "13a97809e2f84a86e8958e607e2d132ef2b6e3c6829c83f566fcca9a547e0744",
  closureCommentId: 5235796564,
  closureCommentUrl: "https://github.com/Chillywood2025/chillywood-mobile/issues/205#issuecomment-5235796564",
  author: "Chillywood2025",
  authorAssociation: "OWNER",
  createdAt: "2026-08-10T04:16:26Z",
  updatedAt: "2026-08-10T04:16:26Z",
  bodySha256: "1c034d5b7f50644fef11a383c62ceb2dfee0ccbd6a5f3a12a09fa14a86367a14",
  authorizedSourceHead: "100170bb0fead748eb01ee767d6f4f2151281955",
  authorizedSourceTree: "77ea8d5dcdc43c92e94d0163db1b5c7713c78b2d",
  admittedCarrierHead: "9ed2ba65eff7658f13329bc3ea118d533c96c2b6",
  admittedCarrierTree: "2d22874811e87af621a7b9d1ca69891b005c780d",
  carrierDeltaClassification: "CURRENT_TRUTH_BINDING_ONLY",
  carrierDeltaPaths: ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"],
  packetSha256: "b6a7020335baee6f833bec31d28e2d345b7365c0ab7bbe297766bb2925a0f61a",
  phase1RunId: 31354601386,
  phase1Jobs: "13/13",
  closureClassification: "REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED",
  receiptHash: "2f10c3848885bc5ae78fe3125ba148cfbb651f0a83c0fa951741e1463439ea1c"
};
export const protectedMainReadback = {
  ref: "refs/heads/main",
  observedHead: "085960ba2d26ad14c44d758cbaf1924ec80a1e5d",
  observedAt: "2026-08-11T04:18:14Z",
  evidenceMode: "github-read-only",
  bootstrapMergeReachable: true
};

const setHash = (values) => sha256(stableJson([...values].sort()));
const bindingSetHash = (values) => sha256(stableJson([...values].sort((left, right) => left.context.localeCompare(right.context))));
const same = (left, right) => stableJson(left) === stableJson(right);
const receiptHash = (receipt) => {
  const payload = structuredClone(receipt ?? {});
  delete payload.receiptHash;
  return sha256(stableJson(payload));
};
const observationHash = (observation) => {
  const payload = structuredClone(observation ?? {});
  delete payload.observationHash;
  return sha256(stableJson(payload));
};

export const phase1AdmissionCheck = "Phase 1 / Admission Decision";
export const phase1RulesetStages = Object.freeze(["PRE_CUTOVER_13_RAW", "STAGE1_AGGREGATE_PLUS_13_RAW", "FINAL_AGGREGATE_ONLY"]);
export const phase1RulesetGenesis = Object.freeze({ versionId: 46160124, updatedAt: "2026-08-10T23:16:54.635-05:00" });
export const phase1PublisherAnchorFields = Object.freeze([
  "schemaVersion", "contract", "sourcePr", "sourceBranch", "sourceHead", "sourceTree", "sourceBase", "sourceMergeSha", "sourceMergeTree",
  "originalIntentCommentId", "originalIntentBodyHash", "originalIntentSubjectHash", "finalSourceCommentId", "finalSourceBodyHash", "finalSourceSubjectHash",
  "provisioningReadback", "provisioningReadbackHash", "appId", "clientId", "installationId", "environmentId", "aggregateCheckIntegrationId",
  "rulesetNodeId", "rulesetProviderUpdatedAt", "prestatePutPayloadSha256", "stage1PutPayloadSha256", "finalPutPayloadSha256",
  "rollbackPutPayloadSha256", "currentRulesetStage", "anchorHash",
]);
const digest = (value) => /^[0-9a-f]{64}$/u.test(value ?? "");
const sha = (value) => /^[0-9a-f]{40}$/u.test(value ?? "");
const positiveInteger = (value) => Number.isSafeInteger(value) && value > 0;
const cutoverStateBrand = new WeakSet();

const withoutHash = (value, field) => Object.fromEntries(Object.entries(value ?? {}).filter(([key]) => key !== field));
const stableProvisioningProjection = (readback) => ({
  schemaVersion: readback?.schemaVersion,
  contract: readback?.contract,
  repository: readback?.repository,
  owner: readback?.owner,
  originalContractHash: readback?.originalContractHash,
  app: readback?.app,
  installation: readback?.installation,
  environment: readback?.environment,
  aggregate: readback?.aggregate,
  ruleset: {
    id: readback?.ruleset?.id,
    nodeId: readback?.ruleset?.nodeId,
    prestatePutPayloadSha256: readback?.ruleset?.prestatePutPayloadSha256,
    stage1PutPayloadSha256: readback?.ruleset?.stage1PutPayloadSha256,
    finalPutPayloadSha256: readback?.ruleset?.finalPutPayloadSha256,
    rollbackPutPayloadSha256: readback?.ruleset?.rollbackPutPayloadSha256,
  },
  authority: readback?.authority,
});

export function phase1PublisherAnchorStructurallyValid(anchor) {
  const readback = anchor?.provisioningReadback;
  const ruleset = readback?.ruleset;
  return Boolean(anchor && typeof anchor === "object" && !Array.isArray(anchor)
    && same(Object.keys(anchor).sort(), [...phase1PublisherAnchorFields].sort())
    && anchor.schemaVersion === 1 && anchor.contract === "PHASE1_ADMISSION_PUBLISHER_IMMUTABLE_ANCHOR_V1"
    && positiveInteger(anchor.sourcePr) && typeof anchor.sourceBranch === "string" && anchor.sourceBranch.length > 0
    && [anchor.sourceHead, anchor.sourceTree, anchor.sourceBase, anchor.sourceMergeSha, anchor.sourceMergeTree].every(sha)
    && anchor.sourceTree === anchor.sourceMergeTree
    && [anchor.originalIntentCommentId, anchor.finalSourceCommentId, anchor.appId, anchor.installationId, anchor.environmentId, anchor.aggregateCheckIntegrationId].every(positiveInteger)
    && [anchor.originalIntentBodyHash, anchor.originalIntentSubjectHash, anchor.finalSourceBodyHash, anchor.finalSourceSubjectHash,
      anchor.provisioningReadbackHash, anchor.prestatePutPayloadSha256, anchor.stage1PutPayloadSha256, anchor.finalPutPayloadSha256,
      anchor.rollbackPutPayloadSha256, anchor.anchorHash].every(digest)
    && anchor.anchorHash === sha256(stableJson(withoutHash(anchor, "anchorHash")))
    && readback?.schemaVersion === 1 && readback?.contract === "PHASE1_ADMISSION_PUBLISHER_PROVISIONING_READBACK_V1"
    && readback?.repository === "Chillywood2025/chillywood-mobile" && readback?.owner === "Chillywood2025"
    && readback?.readbackHash === sha256(stableJson(withoutHash(readback, "readbackHash")))
    && anchor.provisioningReadbackHash === readback.readbackHash
    && anchor.appId === readback?.app?.id && anchor.clientId === readback?.app?.clientId
    && anchor.installationId === readback?.installation?.id && anchor.environmentId === readback?.environment?.id
    && anchor.aggregateCheckIntegrationId === readback?.aggregate?.integrationId && anchor.aggregateCheckIntegrationId === anchor.appId
    && anchor.rulesetNodeId === ruleset?.nodeId && anchor.rulesetProviderUpdatedAt === ruleset?.providerUpdatedAt
    && anchor.prestatePutPayloadSha256 === ruleset?.prestatePutPayloadSha256
    && anchor.stage1PutPayloadSha256 === ruleset?.stage1PutPayloadSha256
    && anchor.finalPutPayloadSha256 === ruleset?.finalPutPayloadSha256
    && anchor.rollbackPutPayloadSha256 === ruleset?.rollbackPutPayloadSha256
    && anchor.currentRulesetStage === "PRE_CUTOVER_13_RAW" && ruleset?.stage === anchor.currentRulesetStage
    && ruleset?.currentPutPayloadSha256 === anchor.prestatePutPayloadSha256 && ruleset?.bypassReadback === "EXPLICIT_EMPTY"
    && ruleset?.id === 18940814 && readback?.aggregate?.context === phase1AdmissionCheck
    && readback?.aggregate?.displayOnlyNeverPassing === true && readback?.aggregate?.integrationId === anchor.appId);
}

function liveProvisioningReadbackValid(anchor, readback) {
  const ruleset = readback?.ruleset;
  const expectedCurrentHash = {
    PRE_CUTOVER_13_RAW: anchor?.prestatePutPayloadSha256,
    STAGE1_AGGREGATE_PLUS_13_RAW: anchor?.stage1PutPayloadSha256,
    FINAL_AGGREGATE_ONLY: anchor?.finalPutPayloadSha256,
  }[ruleset?.stage];
  return Boolean(phase1PublisherAnchorStructurallyValid(anchor)
    && readback && typeof readback === "object" && !Array.isArray(readback)
    && readback.schemaVersion === 1 && readback.contract === "PHASE1_ADMISSION_PUBLISHER_PROVISIONING_READBACK_V1"
    && readback.readbackHash === sha256(stableJson(withoutHash(readback, "readbackHash")))
    && same(stableProvisioningProjection(readback), stableProvisioningProjection(anchor.provisioningReadback))
    && phase1RulesetStages.includes(ruleset?.stage) && ruleset?.currentPutPayloadSha256 === expectedCurrentHash
    && (ruleset.stage === "FINAL_AGGREGATE_ONLY"
      ? ["EXPLICIT_APP_PULL_REQUEST_ONLY", "OWNER_IMMUTABLE_STAGE_RECEIPT_REQUIRED"].includes(ruleset.bypassReadback)
      : ruleset.bypassReadback === "EXPLICIT_EMPTY"));
}

const rulesetState = (value) => ({
  id: value?.id,
  name: value?.name,
  target: value?.target,
  source_type: value?.source_type,
  source: value?.source,
  enforcement: value?.enforcement,
  conditions: value?.conditions,
  rules: value?.rules,
  bypass_actors: value?.bypass_actors,
});
const splitRules = (state) => ({
  common: (state?.rules ?? []).filter(({ type }) => !["required_status_checks", "update"].includes(type)),
  status: (state?.rules ?? []).filter(({ type }) => type === "required_status_checks"),
  update: (state?.rules ?? []).filter(({ type }) => type === "update"),
});
const stagePayload = ({ genesis, checks, bypassActors, restrictUpdates }) => {
  const parts = splitRules(genesis);
  return {
    name: genesis?.name,
    target: genesis?.target,
    enforcement: genesis?.enforcement,
    bypass_actors: bypassActors,
    conditions: genesis?.conditions,
    rules: [
      ...(restrictUpdates ? [{ type: "update", parameters: { update_allows_fetch_and_merge: false } }] : []),
      ...parts.common,
      { ...parts.status[0], parameters: { ...parts.status[0]?.parameters, required_status_checks: checks } },
    ],
  };
};

function classifyRulesetStage(state, genesis, anchor, { allowHiddenFinal = false } = {}) {
  const parts = splitRules(state);
  const genesisParts = splitRules(genesis);
  const raw = requiredCheckBindings;
  const aggregate = { context: phase1AdmissionCheck, integration_id: anchor?.aggregateCheckIntegrationId };
  const exactBypass = [{ actor_id: anchor?.aggregateCheckIntegrationId, actor_type: "Integration", bypass_mode: "pull_request" }];
  const identityValid = state?.id === 18940814 && state?.name === "main-pr-review-protection" && state?.target === "branch"
    && state?.source_type === "Repository" && state?.source === "Chillywood2025/chillywood-mobile" && state?.enforcement === "active"
    && same(state?.conditions, mainBranchCondition) && same(parts.common, genesisParts.common)
    && parts.status.length === 1 && genesisParts.status.length === 1
    && same(withoutHash(parts.status[0]?.parameters, "required_status_checks"), withoutHash(genesisParts.status[0]?.parameters, "required_status_checks"));
  if (!identityValid) return null;
  const checks = parts.status[0]?.parameters?.required_status_checks;
  const updateRule = parts.update.length === 1 && (same(parts.update[0], { type: "update" })
    || same(parts.update[0], { type: "update", parameters: { update_allows_fetch_and_merge: false } }));
  if (same(checks, raw) && parts.update.length === 0 && same(state?.bypass_actors, [])) return "PRE_CUTOVER_13_RAW";
  if (same(checks, [...raw, aggregate]) && parts.update.length === 0 && same(state?.bypass_actors, [])) return "STAGE1_AGGREGATE_PLUS_13_RAW";
  if (same(checks, [aggregate]) && updateRule
    && (same(state?.bypass_actors, exactBypass) || (allowHiddenFinal && state?.bypass_actors == null))) return "FINAL_AGGREGATE_ONLY";
  return null;
}

function cutoverReceipt({ anchor, entry, stage, putPayloadSha256, previousReceiptHash }) {
  const body = {
    schemaVersion: 1,
    contract: "PHASE1_ADMISSION_RULESET_STAGE_RECEIPT_V1",
    repository: "Chillywood2025/chillywood-mobile",
    anchorHash: anchor.anchorHash,
    rulesetId: 18940814,
    stage,
    versionId: entry.version_id,
    providerUpdatedAt: entry.updated_at,
    actor: entry.actor,
    putPayloadSha256,
    providerStateHash: sha256(stableJson(rulesetState(entry.state))),
    previousReceiptHash,
  };
  return { ...body, receiptHash: sha256(stableJson(body)) };
}

const invalidCutoverState = ({ repository, anchor, liveProvisioningReadback, paginationComplete, findings }) => ({
  schemaVersion: 1,
  contract: "PHASE1_ADMISSION_RULESET_CUTOVER_STATE_V1",
  producer: "PROTECTED_MAIN_RULESET_READBACK_V1",
  repository,
  anchorHash: anchor?.anchorHash ?? null,
  rulesetId: 18940814,
  currentRulesetStage: liveProvisioningReadback?.ruleset?.stage ?? null,
  publisherProvisioningReadbackHash: liveProvisioningReadback?.readbackHash ?? null,
  stageReceiptChainHash: null,
  cutoverLock: "CLOSED",
  paginationComplete: paginationComplete === true,
  findings: [...new Set(findings)].sort(),
});

export function evaluatePhase1AdmissionRulesetCutoverState({ repository, identity, anchor, liveProvisioningReadback, contract, observation, protectedSourceVerified = false } = {}) {
  const findings = [];
  const paginationComplete = observation?.paginationComplete === true;
  if (repository !== "Chillywood2025/chillywood-mobile" || identity?.repository !== repository || identity?.baseRef !== "main" || !sha(identity?.baseSha)) findings.push("PHASE1_RULESET_CUTOVER_IDENTITY_INVALID");
  if (!protectedSourceVerified || !phase1PublisherAnchorStructurallyValid(anchor) || !same(contract?.phase1AdmissionPublisherImmutableAnchor, anchor)) findings.push("PHASE1_RULESET_CUTOVER_PROTECTED_ANCHOR_INVALID");
  if (!liveProvisioningReadbackValid(anchor, liveProvisioningReadback)) findings.push("PHASE1_RULESET_CUTOVER_LIVE_PROVISIONING_INVALID");
  if (!paginationComplete || !Array.isArray(observation?.history)) findings.push("PHASE1_RULESET_CUTOVER_HISTORY_PAGINATION_INCOMPLETE");
  const current = observation?.current;
  if (current?.id !== 18940814 || current?.node_id !== anchor?.rulesetNodeId || current?.updated_at !== liveProvisioningReadback?.ruleset?.providerUpdatedAt) findings.push("PHASE1_RULESET_CUTOVER_CURRENT_RULESET_IDENTITY_INVALID");
  const history = Array.isArray(observation?.history) ? observation.history : [];
  const completeHistory = history.every((entry) => positiveInteger(entry?.version_id) && Number.isFinite(Date.parse(entry?.updated_at ?? ""))
    && positiveInteger(entry?.actor?.id) && entry?.actor?.type === "User" && entry?.state && typeof entry.state === "object");
  if (!completeHistory || new Set(history.map(({ version_id: versionId }) => versionId)).size !== history.length) findings.push("PHASE1_RULESET_CUTOVER_HISTORY_MALFORMED");
  const genesisVersionId = phase1RulesetGenesis.versionId;
  const ordered = [...history].sort((left, right) => Date.parse(left.updated_at) - Date.parse(right.updated_at) || left.version_id - right.version_id);
  const genesisIndex = ordered.findIndex(({ version_id: versionId }) => versionId === genesisVersionId);
  const chain = genesisIndex >= 0 ? ordered.slice(genesisIndex) : [];
  if (contract?.applicationReadback?.rulesetVersionId !== phase1RulesetGenesis.versionId
    || contract?.applicationReadback?.rulesetUpdatedAt !== phase1RulesetGenesis.updatedAt
    || genesisIndex < 0 || chain.length === 0 || chain[0]?.updated_at !== phase1RulesetGenesis.updatedAt) findings.push("PHASE1_RULESET_CUTOVER_PRE_GENESIS_MISSING");
  const genesis = chain[0]?.state;
  const hashes = genesis ? {
    PRE_CUTOVER_13_RAW: sha256(stableJson(stagePayload({ genesis, checks: requiredCheckBindings, bypassActors: [], restrictUpdates: false }))),
    STAGE1_AGGREGATE_PLUS_13_RAW: sha256(stableJson(stagePayload({ genesis, checks: [...requiredCheckBindings, { context: phase1AdmissionCheck, integration_id: anchor?.aggregateCheckIntegrationId }], bypassActors: [], restrictUpdates: false }))),
    FINAL_AGGREGATE_ONLY: sha256(stableJson(stagePayload({ genesis, checks: [{ context: phase1AdmissionCheck, integration_id: anchor?.aggregateCheckIntegrationId }], bypassActors: [{ actor_id: anchor?.aggregateCheckIntegrationId, actor_type: "Integration", bypass_mode: "pull_request" }], restrictUpdates: true }))),
  } : {};
  if (hashes.PRE_CUTOVER_13_RAW !== anchor?.prestatePutPayloadSha256 || hashes.STAGE1_AGGREGATE_PLUS_13_RAW !== anchor?.stage1PutPayloadSha256
    || hashes.FINAL_AGGREGATE_ONLY !== anchor?.finalPutPayloadSha256 || anchor?.rollbackPutPayloadSha256 !== anchor?.prestatePutPayloadSha256) findings.push("PHASE1_RULESET_CUTOVER_PAYLOAD_HASH_INVALID");
  const stages = chain.map(({ state }) => classifyRulesetStage(state, genesis, anchor));
  const currentStage = classifyRulesetStage(rulesetState(current), genesis, anchor, { allowHiddenFinal: liveProvisioningReadback?.ruleset?.bypassReadback === "OWNER_IMMUTABLE_STAGE_RECEIPT_REQUIRED" });
  const expectedSequence = {
    PRE_CUTOVER_13_RAW: ["PRE_CUTOVER_13_RAW"],
    STAGE1_AGGREGATE_PLUS_13_RAW: ["PRE_CUTOVER_13_RAW", "STAGE1_AGGREGATE_PLUS_13_RAW"],
    FINAL_AGGREGATE_ONLY: ["PRE_CUTOVER_13_RAW", "STAGE1_AGGREGATE_PLUS_13_RAW", "FINAL_AGGREGATE_ONLY"],
  }[liveProvisioningReadback?.ruleset?.stage];
  if (!expectedSequence || !same(stages, expectedSequence)) findings.push("PHASE1_RULESET_CUTOVER_STAGE_CHAIN_INVALID");
  if (currentStage !== liveProvisioningReadback?.ruleset?.stage || !chain.length
    || !same({ ...rulesetState(current), bypass_actors: chain.at(-1)?.state?.bypass_actors }, rulesetState(chain.at(-1)?.state))) findings.push("PHASE1_RULESET_CUTOVER_LIVE_STAGE_INVALID");
  const genesisActor = chain[0]?.actor;
  if (!genesisActor || chain.some(({ actor }) => !same(actor, genesisActor))) findings.push("PHASE1_RULESET_CUTOVER_ACTOR_CHAIN_INVALID");
  if (findings.length) return invalidCutoverState({ repository, anchor, liveProvisioningReadback, paginationComplete, findings });
  const receipts = [];
  for (let index = 0; index < chain.length; index += 1) receipts.push(cutoverReceipt({
    anchor,
    entry: chain[index],
    stage: stages[index],
    putPayloadSha256: hashes[stages[index]],
    previousReceiptHash: receipts.at(-1)?.receiptHash ?? null,
  }));
  const result = {
    schemaVersion: 1,
    contract: "PHASE1_ADMISSION_RULESET_CUTOVER_STATE_V1",
    producer: "PROTECTED_MAIN_RULESET_READBACK_V1",
    repository,
    anchorHash: anchor.anchorHash,
    rulesetId: 18940814,
    currentRulesetStage: currentStage,
    publisherProvisioningReadbackHash: liveProvisioningReadback.readbackHash,
    stageReceiptChainHash: sha256(stableJson(receipts)),
    cutoverLock: "OPEN",
    paginationComplete: true,
    findings: [],
  };
  cutoverStateBrand.add(result);
  return result;
}

export function phase1AdmissionRulesetCutoverStateValid(value) {
  return cutoverStateBrand.has(value) && value?.schemaVersion === 1
    && value?.contract === "PHASE1_ADMISSION_RULESET_CUTOVER_STATE_V1" && value?.producer === "PROTECTED_MAIN_RULESET_READBACK_V1"
    && value?.repository === "Chillywood2025/chillywood-mobile" && value?.rulesetId === 18940814
    && phase1RulesetStages.includes(value?.currentRulesetStage) && digest(value?.anchorHash) && digest(value?.publisherProvisioningReadbackHash)
    && digest(value?.stageReceiptChainHash) && value?.cutoverLock === "OPEN" && value?.paginationComplete === true
    && Array.isArray(value?.findings) && value.findings.length === 0;
}

export function phase1AdmissionRulesetCutoverAggregateValid(value) {
  const body = withoutHash(value, "aggregateHash");
  return Boolean(value?.schemaVersion === 1
    && value?.contract === "PHASE1_ADMISSION_RULESET_CUTOVER_LIVE_AGGREGATE_V1"
    && value?.producer === "CURRENT_TRUTH_PROTECTED_LIVE_AGGREGATE_V1"
    && value?.upstreamContract === "PHASE1_ADMISSION_RULESET_CUTOVER_STATE_V1"
    && value?.upstreamProducer === "PROTECTED_MAIN_RULESET_READBACK_V1"
    && value?.repository === "Chillywood2025/chillywood-mobile" && value?.rulesetId === 18940814
    && phase1RulesetStages.includes(value?.currentRulesetStage) && digest(value?.anchorHash)
    && digest(value?.publisherProvisioningReadbackHash) && digest(value?.stageReceiptChainHash)
    && value?.cutoverLock === "OPEN" && value?.paginationComplete === true && value?.live === true
    && value?.mergeAuthority === false && Array.isArray(value?.findings) && value.findings.length === 0
    && digest(value?.aggregateHash) && value.aggregateHash === sha256(stableJson(body)));
}

function readGitHubJson(args) {
  const run = spawnSync("gh", ["api", "--method=GET", ...args], { cwd: ROOT, encoding: "utf8", shell: false, maxBuffer: 32 * 1024 * 1024 });
  if (run.status !== 0) return null;
  try { return JSON.parse(run.stdout); } catch { return null; }
}

export function observePhase1AdmissionRulesetHistory(repository = "Chillywood2025/chillywood-mobile") {
  if (repository !== "Chillywood2025/chillywood-mobile") return { current: null, history: [], paginationComplete: false };
  const endpoint = `repos/${repository}/rulesets/18940814`;
  const current = readGitHubJson([endpoint]);
  const pages = readGitHubJson(["--paginate", "--slurp", `${endpoint}/history?per_page=100`]);
  if (!current || !Array.isArray(pages) || !pages.every(Array.isArray)) return { current, history: [], paginationComplete: false };
  const summaries = pages.flat();
  const history = summaries.map((summary) => readGitHubJson([`${endpoint}/history/${summary?.version_id}`]));
  const paginationComplete = history.every((entry, index) => entry && entry.version_id === summaries[index]?.version_id
    && entry.updated_at === summaries[index]?.updated_at && same(entry.actor, summaries[index]?.actor));
  return { current, history: history.filter(Boolean), paginationComplete };
}

export async function resolvePhase1AdmissionRulesetCutoverState({ repository, identity, anchor, liveProvisioningReadback } = {}) {
  let contract = null;
  let protectedSourceVerified = false;
  try {
    contract = JSON.parse(git(["show", `${identity?.baseSha}:config/assurance/github-main-ruleset-codex-review-v1.json`]));
    git(["merge-base", "--is-ancestor", anchor?.sourceMergeSha, identity?.baseSha]);
    protectedSourceVerified = same(contract?.phase1AdmissionPublisherImmutableAnchor, anchor);
  } catch {}
  const observation = protectedSourceVerified ? observePhase1AdmissionRulesetHistory(repository) : { current: null, history: [], paginationComplete: false };
  return evaluatePhase1AdmissionRulesetCutoverState({ repository, identity, anchor, liveProvisioningReadback, contract, observation, protectedSourceVerified });
}

export function validateBootstrapPhase1GithubReadback(observation, now = new Date()) {
  const errors = [];
  const observedAt = Date.parse(observation?.observedAt ?? "");
  const validationNow = now instanceof Date ? now.valueOf() : Date.parse(now ?? "");
  const names = observation?.checkRuns?.map(({ name }) => name);
  if (observation?.contractId !== "a1-bootstrap-phase1-github-readback-v1"
    || observation?.repository !== "Chillywood2025/chillywood-mobile"
    || observation?.carrierHead !== canonicalOwnerFinalCarrierBindingReceipt.admittedCarrierHead
    || observation?.historicalRulesetPublisherBinding !== "CONTEXT_ONLY_NO_INTEGRATION_ID_IN_PROVIDER_HISTORY"
    || observation?.evidenceMode !== "github-read-only"
    || observation?.workflowRunId !== canonicalOwnerFinalCarrierBindingReceipt.phase1RunId
    || observation?.workflowId !== 251388000
    || observation?.workflowPath !== ".github/workflows/phase1-ci.yml"
    || observation?.workflowEvent !== "pull_request"
    || observation?.workflowHeadBranch !== "codex/assurance-active-task-and-claim-freshness-a1"
    || observation?.workflowHeadSha !== observation?.carrierHead
    || observation?.workflowStatus !== "completed"
    || observation?.workflowConclusion !== "success"
    || observation?.runAttempt !== 1
    || observation?.checkSuiteId !== 85044313814
    || observation?.checkSuiteHeadSha !== observation?.carrierHead
    || observation?.checkSuiteAppId !== githubActionsIntegrationId
    || observation?.checkSuiteAppSlug !== "github-actions"
    || observation?.checkSuiteStatus !== "completed"
    || observation?.checkSuiteConclusion !== "success"
    || observation?.checkRunQueryPageSize !== 100
    || observation?.totalCheckRunsOnHead !== 18
    || observation?.returnedCheckRuns !== observation?.totalCheckRunsOnHead
    || observation?.checkRunReadbackComplete !== true
    || observation?.totalPhase1NamedCheckRuns !== phase1Checks.length
    || observation?.unexpectedPhase1NamedCheckRuns !== 0
    || !same(names, phase1Checks)
    || !same(observation?.checkRuns, bootstrapPhase1CheckRuns)
    || !bootstrapPhase1CheckRuns.every(({ appId, appSlug, checkSuiteId, status, conclusion }) => appId === githubActionsIntegrationId && appSlug === "github-actions" && checkSuiteId === 85044313814 && status === "completed" && conclusion === "success")
    || ![observedAt, validationNow].every(Number.isFinite)
    || observedAt < Date.parse("2026-08-10T04:14:24Z")
    || observedAt > validationNow
    || observation?.observationHash !== observationHash(observation)) errors.push("github ruleset readback: bootstrap Phase 1 GitHub observation mismatch");
  return errors;
}

export function validateOwnerFinalCarrierGithubReadback(bindingReceipt, observation, now = new Date()) {
  const errors = [];
  const body = String(observation?.body ?? "");
  const updatedAt = Date.parse(observation?.updatedAt ?? "");
  const observedAt = Date.parse(observation?.observedAt ?? "");
  const validationNow = now instanceof Date ? now.valueOf() : Date.parse(now ?? "");
  const requiredBodyLines = [
    bindingReceipt?.closureClassification,
    `Exact target: ${bindingReceipt?.admittedCarrierHead}`,
    `Exact tree: ${bindingReceipt?.admittedCarrierTree}`,
    `Immutable source: ${bindingReceipt?.authorizedSourceHead}`,
    `Immutable tree: ${bindingReceipt?.authorizedSourceTree}`,
    `Packet SHA-256: ${bindingReceipt?.packetSha256}`,
    `- Phase 1 CI run ${bindingReceipt?.phase1RunId}: ${bindingReceipt?.phase1Jobs} PASS at the exact target`
  ];
  const exactLineOnce = (line) => typeof line === "string" && body.split("\n").filter((candidate) => candidate === line).length === 1;
  if (observation?.contractId !== "a1-owner-final-carrier-github-readback-v1"
    || observation?.repository !== bindingReceipt?.repository
    || observation?.prNumber !== bindingReceipt?.prNumber
    || observation?.commentId !== bindingReceipt?.closureCommentId
    || observation?.nodeId !== "IC_kwDORRwZUc8AAAABOBPqVA"
    || observation?.htmlUrl !== "https://github.com/Chillywood2025/chillywood-mobile/pull/205#issuecomment-5235796564"
    || observation?.issueUrl !== "https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/205"
    || observation?.author !== bindingReceipt?.author
    || observation?.authorAssociation !== bindingReceipt?.authorAssociation
    || observation?.createdAt !== bindingReceipt?.createdAt
    || observation?.updatedAt !== bindingReceipt?.updatedAt
    || observation?.bodySha256 !== bindingReceipt?.bodySha256
    || observation?.bodySha256 !== sha256(body)
    || observation?.evidenceMode !== "github-read-only"
    || ![updatedAt, observedAt, validationNow].every(Number.isFinite)
    || observedAt < updatedAt
    || observedAt > validationNow
    || observation?.observationHash !== observationHash(observation)
    || !requiredBodyLines.every(exactLineOnce)) errors.push("github ruleset readback: owner final-carrier GitHub observation mismatch");
  return errors;
}

export function readBootstrapMergeIdentity(mergeSha, gitRead = git) {
  try {
    const [parentsLine, mergeTree] = gitRead(["show", "-s", "--format=%P%n%T", mergeSha]).split(/\n/u);
    const parents = parentsLine.split(/\s+/u).filter(Boolean);
    const parentTrees = parents.map((parent) => gitRead(["show", "-s", "--format=%T", parent]));
    const protectedMainHead = gitRead(["rev-parse", "refs/remotes/origin/main"]);
    const authorizedSourceTree = gitRead(["rev-parse", `${canonicalOwnerFinalCarrierBindingReceipt.authorizedSourceHead}^{tree}`]);
    gitRead(["merge-base", "--is-ancestor", canonicalOwnerFinalCarrierBindingReceipt.authorizedSourceHead, canonicalOwnerFinalCarrierBindingReceipt.admittedCarrierHead]);
    const carrierDeltaPaths = gitRead(["diff", "--name-only", `${canonicalOwnerFinalCarrierBindingReceipt.authorizedSourceHead}..${canonicalOwnerFinalCarrierBindingReceipt.admittedCarrierHead}`])
      .split(/\n/u)
      .filter(Boolean);
    let protectedMainContainsMerge = false;
    try {
      gitRead(["merge-base", "--is-ancestor", mergeSha, protectedMainHead]);
      protectedMainContainsMerge = true;
    } catch {}
    return { errors: [], parents, parentTrees, mergeTree, protectedMainHead, protectedMainContainsMerge, authorizedSourceTree, authorizedSourceIsAncestorOfCarrier: true, carrierDeltaPaths };
  } catch {
    return {
      errors: ["github ruleset readback: bootstrap merge history unavailable"],
      parents: [],
      parentTrees: [],
      mergeTree: null,
      protectedMainHead: null,
      protectedMainContainsMerge: false,
      authorizedSourceTree: null,
      authorizedSourceIsAncestorOfCarrier: false,
      carrierDeltaPaths: []
    };
  }
}

export function validateGithubMainRulesetReadback({ contract, authorizationReceipt, finalCarrierBindingReceipt, finalCarrierGithubReadback, bootstrapPhase1GithubReadback, mergeIdentity, now = new Date(), freshnessMode }) {
  const errors = [];
  const readback = contract?.applicationReadback;
  const exception = contract?.authorizedBootstrapException;
  const window = exception?.protectionWindow;
  const freshness = readback?.repositorySourceFreshness;
  const add = (id) => errors.push(`github ruleset readback: ${id}`);

  const anchor = contract?.phase1AdmissionPublisherImmutableAnchor;
  if (!phase1PublisherAnchorStructurallyValid(anchor)
    || anchor?.anchorHash !== "b59479e0fb714e11c941cf2b7a2304fb1ca721ed930327611be289d3a3260cd2"
    || anchor?.sourcePr !== 254 || anchor?.sourceBranch !== "codex/phase1-risk-based-admission-v7"
    || anchor?.sourceHead !== "c1aca873f55b45c72c4932e130dfd2ce8350a601"
    || anchor?.sourceTree !== "4b6a65c52eb1cd12d0f2a191cfb7064a297fe10f"
    || anchor?.sourceBase !== "8aa74d0442eb9797900005d3c2dca9709b43c0c8"
    || anchor?.sourceMergeSha !== "2d40bc75cfad9a28d7534f3dd8593dab63318769"
    || anchor?.originalIntentCommentId !== 5404284190 || anchor?.finalSourceCommentId !== 5404381682) add("Phase 1 immutable publisher anchor mismatch");

  if (contract?.applicationState !== "SOLO_OWNER_OPTIONAL_ADVISORY_APPLIED_AND_READ_BACK_S0"
    || contract?.advisoryStatusCheckExcluded !== exactHeadCheck
    || contract?.requiredStatusCheckToAdd !== undefined) add("application state mismatch");
  if (!same(contract?.conditions, mainBranchCondition)) add("protected main condition mismatch");
  if (!same(contract?.requiredCheckPublisherBoundary, requiredCheckPublisherBoundary)) add("required-check publisher boundary mismatch");
  if (!same(contract?.pullRequestRequirements, pullRequestRequirements)) add("pull-request protection requirements mismatch");
  if (!same(readback?.requiredStatusChecks, requiredChecks)) add("required status-check identities mismatch");
  if (!same(readback?.requiredStatusCheckBindings, requiredCheckBindings)) add("required status-check integration identities mismatch");
  if (readback?.requiredStatusCheckCount !== requiredChecks.length) add("required status-check count mismatch");
  if (readback?.requiredStatusCheckPresent !== readback?.requiredStatusChecks?.includes(exactHeadCheck)) add("exact-head presence derivation mismatch");
  if (readback?.requiredStatusCheckSetSha256 !== setHash(requiredChecks)) add("required status-check digest mismatch");
  if (readback?.requiredStatusCheckBindingSetSha256 !== bindingSetHash(requiredCheckBindings)) add("required status-check integration digest mismatch");
  if (!same(readback?.rulesetSource, repositoryRulesetSource)
    || !same(readback?.effectiveMainRules, effectiveMainRules)
    || readback?.effectiveMainRulesSha256 !== sha256(stableJson(effectiveMainRules))) add("effective repository ruleset mismatch");
  if (readback?.normalizedRulesetPayloadSha256 !== sha256(stableJson(normalizedRulesetPayload))) add("normalized ruleset payload mismatch");
  if (readback?.rulesetVersionId !== 46160124
    || readback?.rulesetUpdatedAt !== "2026-08-10T23:16:54.635-05:00"
    || readback?.changeClassification !== "SOLO_OWNER_REPOSITORY_REVIEW_PHASE1_13_REQUIRED") add("current ruleset identity mismatch");
  const freshnessObservedAt = Date.parse(freshness?.observedAt ?? "");
  const freshnessExpiresAt = Date.parse(freshness?.expiresAt ?? "");
  const validationNow = now instanceof Date ? now.valueOf() : Date.parse(now ?? "");
  if (!["STRUCTURAL", "CURRENT_CLAIM"].includes(freshnessMode)) add("freshness validation mode missing");
  if (freshness?.status !== "CURRENT"
    || freshness?.freshnessClass !== "REPOSITORY_SOURCE"
    || freshness?.evidenceMode !== "github-read-only"
    || !same(freshness?.factsCovered, ["repository.github.main-ruleset", "repository.github.main-ruleset-effective-rules", "repository.github.main-head"])
    || freshness?.observedAt !== readback?.protectedMainReadback?.observedAt
    || ![freshnessObservedAt, freshnessExpiresAt].every(Number.isFinite)
    || freshnessExpiresAt - freshnessObservedAt !== repositorySourceReadbackHours * 60 * 60 * 1000) add("repository ruleset readback malformed");
  if (freshnessMode === "CURRENT_CLAIM"
    && (!Number.isFinite(validationNow) || validationNow < freshnessObservedAt || validationNow > freshnessExpiresAt)) add("repository ruleset readback stale");
  if (!same(readback?.protectedMainReadback, protectedMainReadback)
    || protectedMainReadback.bootstrapMergeReachable !== true) add("protected main readback mismatch");
  if (readback?.enforcement !== "active"
    || readback?.strictRequiredStatusChecksPolicy !== true
    || readback?.doNotEnforceOnCreate !== false
    || !same(readback?.ruleTypes, ["deletion", "non_fast_forward", "pull_request", "required_status_checks"])
    || !same(readback?.allowedMergeMethods, pullRequestRequirements.allowedMergeMethods)
    || readback?.requiredApprovingReviewCount !== pullRequestRequirements.requiredApprovingReviewCount
    || readback?.requiredReviewThreadResolution !== false
    || readback?.dismissStaleReviewsOnPush !== true
    || readback?.requireCodeOwnerReview !== false
    || readback?.requireLastPushApproval !== false
    || !same(readback?.requiredReviewers, [])
    || readback?.preventDeletion !== true
    || readback?.preventNonFastForward !== true
    || !Array.isArray(readback?.bypassActors)
    || readback.bypassActors.length !== 0) add("required protection state mismatch");

  if (contract?.ownerBootstrapAuthorizationReceipt !== ownerAuthorizationReceiptPath
    || !same(authorizationReceipt, canonicalOwnerAuthorizationReceipt)
    || authorizationReceipt?.receiptHash !== receiptHash(authorizationReceipt)
    || exception?.ownerAuthorizationReceiptHash !== authorizationReceipt?.receiptHash) add("owner authorization receipt mismatch");
  if (contract?.ownerFinalCarrierBindingReceipt !== ownerFinalCarrierBindingReceiptPath
    || !same(finalCarrierBindingReceipt, canonicalOwnerFinalCarrierBindingReceipt)
    || finalCarrierBindingReceipt?.receiptHash !== receiptHash(finalCarrierBindingReceipt)
    || finalCarrierBindingReceipt?.sourceAuthorizationReceiptHash !== authorizationReceipt?.receiptHash
    || exception?.ownerFinalCarrierBindingReceiptHash !== finalCarrierBindingReceipt?.receiptHash
    || finalCarrierBindingReceipt?.prNumber !== exception?.pullRequest
    || finalCarrierBindingReceipt?.admittedCarrierHead !== exception?.carrierHead
    || finalCarrierBindingReceipt?.admittedCarrierTree !== exception?.carrierTree
    || mergeIdentity?.authorizedSourceTree !== finalCarrierBindingReceipt?.authorizedSourceTree
    || mergeIdentity?.authorizedSourceIsAncestorOfCarrier !== true
    || !same(mergeIdentity?.carrierDeltaPaths, finalCarrierBindingReceipt?.carrierDeltaPaths)) add("owner final-carrier binding receipt mismatch");
  if (contract?.ownerFinalCarrierGithubReadback !== ownerFinalCarrierGithubReadbackPath
    || exception?.ownerFinalCarrierGithubObservationHash !== finalCarrierGithubReadback?.observationHash) add("owner final-carrier GitHub observation binding mismatch");
  errors.push(...validateOwnerFinalCarrierGithubReadback(finalCarrierBindingReceipt, finalCarrierGithubReadback, now));
  if (contract?.bootstrapPhase1GithubReadback !== bootstrapPhase1GithubReadbackPath
    || exception?.bootstrapPhase1GithubObservationHash !== bootstrapPhase1GithubReadback?.observationHash) add("bootstrap Phase 1 GitHub observation binding mismatch");
  errors.push(...validateBootstrapPhase1GithubReadback(bootstrapPhase1GithubReadback, now));
  if (exception?.pullRequest !== authorizationReceipt?.prNumber || exception?.mergeSha !== window?.mainAfterRestoration) add("bootstrap subject mismatch");
  if (exception?.temporarilyRemovedStatusCheck !== exactHeadCheck
    || exception?.phase1ChecksPreserved !== phase1Checks.length
    || exception?.strictPolicyPreserved !== true
    || exception?.conversationResolutionPreserved !== true
    || exception?.staleReviewDismissalPreserved !== true
    || exception?.bypassActorsPreservedEmpty !== true
    || exception?.restoredImmediatelyAfterMerge !== true
    || exception?.restoredRulesetUpdatedAt !== window?.restoredAt) add("bootstrap invariant mismatch");

  const preAt = Date.parse(window?.preRemovalUpdatedAt ?? "");
  const removedAt = Date.parse(window?.removedAt ?? "");
  const mergedAt = Date.parse(exception?.mergedAt ?? "");
  const restoredAt = Date.parse(window?.restoredAt ?? "");
  const authorizationCreatedAt = Date.parse(authorizationReceipt?.createdAt ?? "");
  const authorizationUpdatedAt = Date.parse(authorizationReceipt?.updatedAt ?? "");
  const finalCarrierBindingCreatedAt = Date.parse(finalCarrierBindingReceipt?.createdAt ?? "");
  const finalCarrierBindingUpdatedAt = Date.parse(finalCarrierBindingReceipt?.updatedAt ?? "");
  const currentRulesetAt = Date.parse(readback?.rulesetUpdatedAt ?? "");
  const mainReadbackAt = Date.parse(readback?.protectedMainReadback?.observedAt ?? "");
  if (![preAt, removedAt, mergedAt, restoredAt].every(Number.isFinite)
    || !(preAt < removedAt && removedAt < mergedAt && mergedAt < restoredAt)) add("bootstrap chronology mismatch");
  if (![authorizationCreatedAt, authorizationUpdatedAt, finalCarrierBindingCreatedAt, finalCarrierBindingUpdatedAt, currentRulesetAt, mainReadbackAt].every(Number.isFinite)
    || authorizationCreatedAt !== authorizationUpdatedAt
    || finalCarrierBindingCreatedAt !== finalCarrierBindingUpdatedAt
    || !(authorizationCreatedAt < finalCarrierBindingCreatedAt
      && finalCarrierBindingCreatedAt < removedAt
      && restoredAt < currentRulesetAt
      && currentRulesetAt < mainReadbackAt)) add("authorization and readback chronology mismatch");
  if (window?.preRemovalVersionId !== 46039477
    || window?.removalVersionId !== 46044242
    || window?.restorationVersionId !== 46044257) add("ruleset version identity mismatch");
  if (window?.preRemovalStatusCheckSetSha256 !== setHash(historicalRequiredChecks)
    || window?.removalStatusCheckSetSha256 !== setHash(phase1Checks)
    || window?.restoredStatusCheckSetSha256 !== setHash(historicalRequiredChecks)) add("protection-window digest mismatch");
  if (!same(window?.policySnapshots?.preRemoval, bootstrapWindowPolicies.preRemoval)
    || !same(window?.policySnapshots?.removal, bootstrapWindowPolicies.removal)
    || !same(window?.policySnapshots?.restoration, bootstrapWindowPolicies.restoration)
    || window?.policySnapshotHashes?.preRemoval !== sha256(stableJson(bootstrapWindowPolicies.preRemoval))
    || window?.policySnapshotHashes?.removal !== sha256(stableJson(bootstrapWindowPolicies.removal))
    || window?.policySnapshotHashes?.restoration !== sha256(stableJson(bootstrapWindowPolicies.restoration))) add("protection-window complete policy mismatch");
  const nonStatusPolicy = (policy) => {
    const copy = structuredClone(policy ?? {});
    delete copy.requiredStatusChecks;
    return copy;
  };
  if (!same(nonStatusPolicy(window?.policySnapshots?.preRemoval), nonStatusPolicy(window?.policySnapshots?.removal))
    || !same(nonStatusPolicy(window?.policySnapshots?.removal), nonStatusPolicy(window?.policySnapshots?.restoration))) add("protection-window non-status policy changed");
  errors.push(...(mergeIdentity?.errors ?? ["github ruleset readback: bootstrap merge history unavailable"]));
  const mergeParents = mergeIdentity?.parents;
  const parentTrees = mergeIdentity?.parentTrees;
  if (!Array.isArray(mergeParents)
    || mergeParents.length !== 2
    || window?.mainBeforeRemoval !== mergeParents[0]
    || exception?.carrierHead !== mergeParents[1]
    || !Array.isArray(parentTrees)
    || parentTrees.length !== 2
    || exception?.carrierTree !== parentTrees[1]
    || exception?.carrierTree !== mergeIdentity?.mergeTree
    || mergeIdentity?.protectedMainContainsMerge !== true
    || window?.mainAfterRestoration !== exception?.mergeSha
    || !same(window?.admittedMergeShas, [exception?.mergeSha])
    || window?.additionalMergesAdmitted !== 0) add("admitted main-history interval mismatch");

  return errors;
}
