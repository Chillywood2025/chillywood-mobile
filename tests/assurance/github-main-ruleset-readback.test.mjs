import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildPhase1RulesetRecoveryReceipt, evaluatePhase1AdmissionRulesetCutoverState, formatPhase1RulesetRecoveryReceiptComment, mainBranchCondition, phase1AdmissionCheck, phase1AdmissionRulesetCutoverAggregateValid, phase1AdmissionRulesetCutoverStateValid, phase1PublisherAnchorStructurallyValid, phase1RulesetGenesis, phase1RulesetRecoveryPolicy, phase1RulesetRecoveryPolicyHash, phase1RulesetRecoveryReceiptMarker, readBootstrapMergeIdentity, requiredCheckBindings, validateBootstrapPhase1GithubReadback, validateGithubMainRulesetReadback } from "../../scripts/assurance/github-main-ruleset-readback.mjs";
import { readJson, sha256, stableJson } from "../../scripts/assurance/lib.mjs";
import { runReceipt } from "../../scripts/assurance/receipt.mjs";

const contract = readJson("config/assurance/github-main-ruleset-codex-review-v1.json");
const authorizationReceipt = readJson("config/assurance/a1-owner-bootstrap-authorization-v1.json");
const finalCarrierBindingReceipt = readJson("config/assurance/a1-owner-final-carrier-binding-v1.json");
const finalCarrierGithubReadback = readJson("config/assurance/a1-owner-final-carrier-github-readback-v1.json");
const bootstrapPhase1GithubReadback = readJson("config/assurance/a1-bootstrap-phase1-github-readback-v1.json");
const mergeIdentity = readBootstrapMergeIdentity(contract.authorizedBootstrapException.mergeSha);
const validate = (candidate, identity = mergeIdentity, receipt = authorizationReceipt, carrierReceipt = finalCarrierBindingReceipt, githubReadback = finalCarrierGithubReadback, now = "2026-08-11T04:20:00Z", freshnessMode = "CURRENT_CLAIM", phase1Readback = bootstrapPhase1GithubReadback) => validateGithubMainRulesetReadback({ contract: candidate, authorizationReceipt: receipt, finalCarrierBindingReceipt: carrierReceipt, finalCarrierGithubReadback: githubReadback, bootstrapPhase1GithubReadback: phase1Readback, mergeIdentity: identity, now, freshnessMode });

const publisherAnchor = contract.phase1AdmissionPublisherImmutableAnchor;
const cutoverIdentity = { repository: contract.repository, baseRef: "main", baseSha: publisherAnchor.sourceMergeSha };
const cutoverActor = { id: 210200794, type: "User" };
const genesisState = {
  id: 18940814,
  name: "main-pr-review-protection",
  target: "branch",
  source_type: "Repository",
  source: contract.repository,
  enforcement: "active",
  conditions: mainBranchCondition,
  rules: [
    { type: "pull_request", parameters: { required_approving_review_count: 0, dismiss_stale_reviews_on_push: true, required_reviewers: [], require_code_owner_review: false, require_last_push_approval: false, required_review_thread_resolution: false, require_extra_approval_for_unattributed_changes: true, allowed_merge_methods: ["merge", "squash", "rebase"] } },
    { type: "non_fast_forward" },
    { type: "deletion" },
    { type: "required_status_checks", parameters: { strict_required_status_checks_policy: true, do_not_enforce_on_create: false, required_status_checks: requiredCheckBindings } },
  ],
  bypass_actors: [],
};
const stageState = (stage) => {
  const state = structuredClone(genesisState);
  const status = state.rules.find(({ type }) => type === "required_status_checks");
  const aggregate = { context: phase1AdmissionCheck, integration_id: publisherAnchor.aggregateCheckIntegrationId };
  if (stage === "STAGE1_AGGREGATE_PLUS_13_RAW") status.parameters.required_status_checks = [...requiredCheckBindings, aggregate];
  if (stage === "FINAL_AGGREGATE_ONLY") {
    status.parameters.required_status_checks = [aggregate];
    state.rules.unshift({ type: "update", parameters: { update_allows_fetch_and_merge: false } });
    state.bypass_actors = [{ actor_id: publisherAnchor.aggregateCheckIntegrationId, actor_type: "Integration", bypass_mode: "pull_request" }];
  }
  return state;
};
const historyEntry = (stage, versionId, updatedAt) => ({ version_id: versionId, updated_at: updatedAt, actor: cutoverActor, state: stageState(stage) });
const preEntry = historyEntry("PRE_CUTOVER_13_RAW", phase1RulesetGenesis.versionId, phase1RulesetGenesis.updatedAt);
const stage1Entry = historyEntry("STAGE1_AGGREGATE_PLUS_13_RAW", 47545239, "2026-08-24T22:59:53.294-05:00");
const finalEntry = historyEntry("FINAL_AGGREGATE_ONLY", 47545277, "2026-08-24T23:00:33.818-05:00");
const normalizedFinalUpdateRule = finalEntry.state.rules.shift();
delete normalizedFinalUpdateRule.parameters;
finalEntry.state.rules.push(normalizedFinalUpdateRule);
const recoveryCandidateState = () => {
  const state = structuredClone(finalEntry.state);
  state.bypass_actors.push({ actor_id: phase1RulesetRecoveryPolicy.owner.id, actor_type: phase1RulesetRecoveryPolicy.owner.type, bypass_mode: "pull_request" });
  return state;
};
const recoveryEntry = (state, versionId, updatedAt) => ({ version_id: versionId, updated_at: updatedAt, actor: cutoverActor, state: structuredClone(state) });
const bootstrapOpenedAt = "2026-08-25T13:00:01.000Z";
const bootstrapSuitePushedAt = "2026-08-25T13:00:02.000Z";
const bootstrapMergedAt = "2026-08-25T13:00:03.000Z";
const bootstrapRestoredAt = "2026-08-25T13:00:05.000Z";
const bootstrapHeadSha = "13edd40edd8a862d7d300880201d848dc28417be";
const bootstrapMergeSha = "a".repeat(40);
const recoveryHistory = [
  recoveryEntry(recoveryCandidateState(), phase1RulesetRecoveryPolicy.windows[0].openedVersionId, phase1RulesetRecoveryPolicy.windows[0].openedAt),
  recoveryEntry(finalEntry.state, phase1RulesetRecoveryPolicy.windows[0].restoredVersionId, phase1RulesetRecoveryPolicy.windows[0].restoredAt),
  recoveryEntry(recoveryCandidateState(), phase1RulesetRecoveryPolicy.windows[1].openedVersionId, phase1RulesetRecoveryPolicy.windows[1].openedAt),
  recoveryEntry(finalEntry.state, phase1RulesetRecoveryPolicy.windows[1].restoredVersionId, phase1RulesetRecoveryPolicy.windows[1].restoredAt),
  recoveryEntry(recoveryCandidateState(), 47590001, bootstrapOpenedAt),
  recoveryEntry(finalEntry.state, 47590002, bootstrapRestoredAt),
];
const recoveryPullRequest = (window, { headSha = window.headSha, mergeSha = window.mergeSha, mergedAt = window.mergedAt, changedFiles = 0 } = {}) => ({
  number: window.pr,
  state: "closed",
  merged: true,
  merge_commit_sha: mergeSha,
  merged_at: mergedAt,
  merged_by: { login: phase1RulesetRecoveryPolicy.owner.login, type: phase1RulesetRecoveryPolicy.owner.type },
  user: { id: phase1RulesetRecoveryPolicy.owner.id, login: phase1RulesetRecoveryPolicy.owner.login, type: phase1RulesetRecoveryPolicy.owner.type },
  base: { ref: "main", sha: window.baseSha, repo: { full_name: phase1RulesetRecoveryPolicy.repository } },
  head: { ref: window.headRef, sha: headSha, repo: { full_name: phase1RulesetRecoveryPolicy.repository } },
  changed_files: changedFiles,
});
const recoveryRuleSuite = (window, { mergeSha = window.mergeSha, id = window.ruleSuiteId, pushedAt = window.ruleSuitePushedAt } = {}) => ({
  id,
  actor_id: phase1RulesetRecoveryPolicy.owner.id,
  actor_name: phase1RulesetRecoveryPolicy.owner.login,
  before_sha: window.baseSha,
  after_sha: mergeSha,
  ref: "refs/heads/main",
  repository_id: phase1RulesetRecoveryPolicy.repositoryId,
  repository_name: "chillywood-mobile",
  pushed_at: pushedAt,
  result: "bypass",
  evaluation_result: null,
});
const recoveryRuleSuiteDetail = (ruleSuite) => ({
  ...structuredClone(ruleSuite),
  rule_evaluations: [
    { rule_type: "required_status_checks", result: "fail", enforcement: "active", details: 'Required status check "Phase 1 / Admission Decision" is in progress.', rule_source: { id: 18940814, name: "main-pr-review-protection", type: "ruleset" } },
    { rule_type: "update", result: "fail", enforcement: "active", details: "Cannot update this protected ref.", rule_source: { id: 18940814, name: "main-pr-review-protection", type: "ruleset" } },
    { rule_type: "deletion", result: "pass", enforcement: "active", rule_source: { id: 18940814, name: "main-pr-review-protection", type: "ruleset" } },
    { rule_type: "non_fast_forward", result: "pass", enforcement: "active", rule_source: { id: 18940814, name: "main-pr-review-protection", type: "ruleset" } },
    { rule_type: "pull_request", result: "pass", enforcement: "active", rule_source: { id: 18940814, name: "main-pr-review-protection", type: "ruleset" } },
  ],
});
const recoveryMergeIdentity = (window, { headSha = window.headSha, mergeSha = window.mergeSha, committedAt = window.ruleSuitePushedAt, changedPaths = [] } = {}) => ({
  sha: mergeSha,
  parents: [window.baseSha, headSha],
  tree: `${window.ordinal}`.repeat(40),
  headTree: `${window.ordinal}`.repeat(40),
  committedAt,
  subject: `Merge pull request #${window.pr} from Chillywood2025/${window.headRef}`,
  changedPaths,
  currentBaseContainsMerge: true,
});
const historicalRecoveryEvidence = phase1RulesetRecoveryPolicy.windows.slice(0, 2).map((window) => {
  const ruleSuite = recoveryRuleSuite(window);
  return {
    pr: window.pr,
    pullRequest: recoveryPullRequest(window),
    files: [],
    filesPaginationComplete: true,
    matchingRuleSuiteCount: 1,
    ruleSuite,
    ruleSuiteDetail: recoveryRuleSuiteDetail(ruleSuite),
    mergeIdentity: recoveryMergeIdentity(window),
  };
});
const bootstrapWindow = phase1RulesetRecoveryPolicy.windows[2];
const bootstrapFiles = bootstrapWindow.allowedPaths.map((filename) => ({ filename, status: "modified" }));
const bootstrapRecoveryEvidence = {
  pr: bootstrapWindow.pr,
  pullRequest: recoveryPullRequest(bootstrapWindow, { headSha: bootstrapHeadSha, mergeSha: bootstrapMergeSha, mergedAt: bootstrapMergedAt, changedFiles: bootstrapWindow.allowedPaths.length }),
  files: bootstrapFiles,
  filesPaginationComplete: true,
  matchingRuleSuiteCount: 1,
  ruleSuite: recoveryRuleSuite(bootstrapWindow, { mergeSha: bootstrapMergeSha, id: 3812000000, pushedAt: bootstrapSuitePushedAt }),
  mergeIdentity: recoveryMergeIdentity(bootstrapWindow, { headSha: bootstrapHeadSha, mergeSha: bootstrapMergeSha, committedAt: bootstrapSuitePushedAt, changedPaths: bootstrapWindow.allowedPaths }),
};
bootstrapRecoveryEvidence.ruleSuiteDetail = recoveryRuleSuiteDetail(bootstrapRecoveryEvidence.ruleSuite);
const exactRecoveryEvidence = [...historicalRecoveryEvidence, bootstrapRecoveryEvidence];
const exactRecoveryRuleSuites = exactRecoveryEvidence.map(({ ruleSuite }) => structuredClone(ruleSuite));
const finalProviderUpdatedAt = "2026-08-24T23:00:33.629-05:00";
const liveProvisioning = (stage, providerUpdatedAt) => {
  const value = structuredClone(publisherAnchor.provisioningReadback);
  value.observedAt = providerUpdatedAt;
  value.ruleset.providerUpdatedAt = providerUpdatedAt;
  value.ruleset.stage = stage;
  value.ruleset.bypassReadback = stage === "FINAL_AGGREGATE_ONLY" ? "EXPLICIT_APP_PULL_REQUEST_ONLY" : "EXPLICIT_EMPTY";
  value.ruleset.currentPutPayloadSha256 = { PRE_CUTOVER_13_RAW: publisherAnchor.prestatePutPayloadSha256, STAGE1_AGGREGATE_PLUS_13_RAW: publisherAnchor.stage1PutPayloadSha256, FINAL_AGGREGATE_ONLY: publisherAnchor.finalPutPayloadSha256 }[stage];
  delete value.readbackHash;
  value.readbackHash = sha256(stableJson(value));
  return value;
};
const currentRuleset = (entry, providerUpdatedAt) => ({ ...structuredClone(entry.state), node_id: publisherAnchor.rulesetNodeId, updated_at: providerUpdatedAt, current_user_can_bypass: "never" });
const receiptSourceHistory = [preEntry, stage1Entry, finalEntry, ...recoveryHistory];
const exactRecoveryReceipt = buildPhase1RulesetRecoveryReceipt({
  historySummaries: receiptSourceHistory,
  historyDetails: receiptSourceHistory,
  ruleSuiteSummaries: exactRecoveryRuleSuites,
  ruleSuiteDetails: exactRecoveryEvidence.map(({ ruleSuiteDetail }) => ruleSuiteDetail),
  currentRuleset: currentRuleset(finalEntry, bootstrapRestoredAt),
});
const exactRecoveredEntries = exactRecoveryReceipt.postGenesisHistory;
const exactRecoveryReceiptComment = {
  id: 5237000000,
  user: { id: phase1RulesetRecoveryPolicy.owner.id, login: phase1RulesetRecoveryPolicy.owner.login, type: phase1RulesetRecoveryPolicy.owner.type },
  author_association: "OWNER",
  created_at: "2026-08-25T13:00:06Z",
  updated_at: "2026-08-25T13:00:06Z",
  body: formatPhase1RulesetRecoveryReceiptComment(exactRecoveryReceipt),
};
const evaluateCutover = ({ stage = "PRE_CUTOVER_13_RAW", entries = [preEntry], currentEntry = entries.at(-1), paginationComplete = true, recoveryEvidence = [], recoveryPaginationComplete = true, ruleSuites = [], recoveryReceipt = null, recoveryReceiptComment = null, recoveryReceiptMarkerCommentCount = 0, currentUserCanBypass = "never", currentOverrides = {}, anchor = publisherAnchor, live = null, providerUpdatedAt = stage === "PRE_CUTOVER_13_RAW" ? publisherAnchor.rulesetProviderUpdatedAt : currentEntry.updated_at } = {}) => {
  return evaluatePhase1AdmissionRulesetCutoverState({
    repository: contract.repository,
    identity: cutoverIdentity,
    anchor,
    liveProvisioningReadback: live ?? liveProvisioning(stage, providerUpdatedAt),
    contract: { ...contract, phase1AdmissionPublisherImmutableAnchor: anchor },
    observation: { current: { ...currentRuleset(currentEntry, providerUpdatedAt), current_user_can_bypass: currentUserCanBypass, ...currentOverrides }, history: entries, paginationComplete, recoveryEvidence, recoveryPaginationComplete, ruleSuites, recoveryReceipt, recoveryReceiptComment, recoveryReceiptMarkerCommentCount },
    protectedSourceVerified: true,
  });
};
const evaluateRecoveredCutover = (overrides = {}) => evaluateCutover({
  stage: "FINAL_AGGREGATE_ONLY",
  entries: exactRecoveredEntries,
  recoveryEvidence: exactRecoveryEvidence,
  ruleSuites: exactRecoveryRuleSuites,
  recoveryReceipt: exactRecoveryReceipt,
  recoveryReceiptComment: exactRecoveryReceiptComment,
  recoveryReceiptMarkerCommentCount: 1,
  providerUpdatedAt: bootstrapRestoredAt,
  ...overrides,
});

test("exact ruleset readback and bounded bootstrap window pass", () => {
  assert.deepEqual(validate(contract), []);
  assert.equal(contract.applicationReadback.requiredStatusCheckPresent, false);
  assert.equal(contract.applicationReadback.requiredStatusChecks.includes("Chi'llywood / Codex Review Exact Head"), false);
  assert.equal(contract.applicationReadback.requiredStatusChecks.length, 13);
  assert.equal(contract.applicationReadback.requiredApprovingReviewCount, 0);
  assert.equal(contract.applicationReadback.requireLastPushApproval, false);
  assert.equal(contract.applicationReadback.requiredReviewThreadResolution, false);
  assert.deepEqual(contract.applicationReadback.bypassActors, []);
  assert.match(contract.applicationReadback.normalizedRulesetPayloadSha256, /^[0-9a-f]{64}$/u);
});

test("Codex Review cannot re-enter required checks and all 13 Phase 1 bindings remain exact", () => {
  const restoredCodexGate = structuredClone(contract);
  restoredCodexGate.applicationReadback.requiredStatusChecks[0] = "Chi'llywood / Codex Review Exact Head";
  assert.ok(validate(restoredCodexGate).some((error) => error.includes("status-check identities")));
  const droppedPhase1 = structuredClone(contract);
  droppedPhase1.applicationReadback.requiredStatusChecks.pop();
  droppedPhase1.applicationReadback.requiredStatusCheckBindings.pop();
  assert.ok(validate(droppedPhase1).some((error) => error.includes("status-check")));
});

test("same-count status-check substitution fails", () => {
  const candidate = structuredClone(contract);
  candidate.applicationReadback.requiredStatusChecks[1] = "Unrelated / Green Check";
  assert.ok(validate(candidate).some((error) => error.includes("status-check identities")));
});

test("required context integration identity substitution fails", () => {
  const candidate = structuredClone(contract);
  candidate.applicationReadback.requiredStatusCheckBindings[0].integration_id = 1;
  assert.ok(validate(candidate).some((error) => error.includes("integration identities")));
});

test("ruleset source and every effective main rule remain repository-bound", () => {
  for (const mutate of [
    (candidate) => { candidate.applicationReadback.rulesetSource.sourceType = "Organization"; },
    (candidate) => { candidate.applicationReadback.rulesetSource.source = "Chillywood2025"; },
    (candidate) => { candidate.applicationReadback.effectiveMainRules[0].rulesetId = 1; },
    (candidate) => { candidate.applicationReadback.effectiveMainRules[1].rulesetSourceType = "Organization"; },
    (candidate) => { candidate.applicationReadback.effectiveMainRules[2].rulesetSource = "Chillywood2025"; },
    (candidate) => { candidate.applicationReadback.effectiveMainRules.pop(); }
  ]) {
    const candidate = structuredClone(contract);
    mutate(candidate);
    assert.ok(validate(candidate).some((error) => error.includes("effective repository ruleset")));
  }
});

test("ruleset condition substitution away from main fails", () => {
  const candidate = structuredClone(contract);
  candidate.conditions.ref_name.include = ["refs/heads/not-main"];
  assert.ok(validate(candidate).some((error) => error.includes("protected main condition")));
});

test("publisher authority and pull-request policy widening fail", () => {
  for (const mutate of [
    (candidate) => { candidate.requiredCheckPublisherBoundary.expectedGitHubAppIntegrationId = 1; },
    (candidate) => candidate.requiredCheckPublisherBoundary.trustedRepositoryWriteActors.push("attacker"),
    (candidate) => { candidate.requiredCheckPublisherBoundary.forkWorkflowWriteTokensAllowed = true; },
    (candidate) => candidate.pullRequestRequirements.bypassActors.push("attacker"),
    (candidate) => { candidate.pullRequestRequirements.requiredReviewThreadResolution = true; },
    (candidate) => { candidate.pullRequestRequirements.requiredApprovingReviewCount = 1; },
    (candidate) => { candidate.pullRequestRequirements.requireLastPushApproval = true; },
    (candidate) => { candidate.pullRequestRequirements.preventDeletion = false; },
    (candidate) => { candidate.pullRequestRequirements.preventNonFastForward = false; },
    (candidate) => { candidate.applicationReadback.requiredApprovingReviewCount = 1; },
    (candidate) => { candidate.applicationReadback.requireLastPushApproval = true; },
    (candidate) => { candidate.applicationReadback.requiredReviewThreadResolution = true; },
    (candidate) => { candidate.applicationReadback.normalizedRulesetPayloadSha256 = "0".repeat(64); },
    (candidate) => { candidate.applicationReadback.ruleTypes = ["pull_request", "required_status_checks"]; }
  ]) {
    const candidate = structuredClone(contract);
    mutate(candidate);
    assert.notDeepEqual(validate(candidate), []);
  }
});

test("owner authorization substitution fails", () => {
  const receipt = structuredClone(authorizationReceipt);
  receipt.bodySha256 = "0".repeat(64);
  assert.ok(validate(contract, mergeIdentity, receipt).some((error) => error.includes("owner authorization receipt")));
});

test("owner final-carrier binding must equal the admitted head and tree", () => {
  for (const mutate of [
    (receipt) => { receipt.admittedCarrierHead = "0".repeat(40); },
    (receipt) => { receipt.admittedCarrierTree = "0".repeat(40); },
    (receipt) => { receipt.sourceAuthorizationReceiptHash = "0".repeat(64); },
    (receipt) => { receipt.bodySha256 = "0".repeat(64); }
  ]) {
    const receipt = structuredClone(finalCarrierBindingReceipt);
    mutate(receipt);
    assert.ok(validate(contract, mergeIdentity, authorizationReceipt, receipt).some((error) => error.includes("final-carrier binding")));
  }
  for (const mutate of [
    (identity) => { identity.authorizedSourceIsAncestorOfCarrier = false; },
    (identity) => { identity.authorizedSourceTree = "0".repeat(40); },
    (identity) => identity.carrierDeltaPaths.push("scripts/assurance/unreviewed-source.mjs")
  ]) {
    const identity = structuredClone(mergeIdentity);
    mutate(identity);
    assert.ok(validate(contract, identity).some((error) => error.includes("final-carrier binding")));
  }
});

test("owner final-carrier authority requires the exact raw GitHub observation", () => {
  for (const mutate of [
    (observation) => { observation.commentId = 1; },
    (observation) => { observation.author = "attacker"; },
    (observation) => { observation.body = observation.body.replace(finalCarrierBindingReceipt.admittedCarrierHead, "0".repeat(40)); },
    (observation) => { observation.body = observation.body.replace("13/13 PASS", "12/13 PASS"); }
  ]) {
    const observation = structuredClone(finalCarrierGithubReadback);
    mutate(observation);
    observation.bodySha256 = sha256(observation.body);
    const payload = structuredClone(observation);
    delete payload.observationHash;
    observation.observationHash = sha256(stableJson(payload));
    assert.ok(validate(contract, mergeIdentity, authorizationReceipt, finalCarrierBindingReceipt, observation).some((error) => error.includes("GitHub observation")));
  }
});

test("owner final-carrier observation chronology is fail closed", () => {
  for (const observedAt of [undefined, "2026-08-10T04:16:25Z", "2036-08-10T06:30:00Z"]) {
    const observation = structuredClone(finalCarrierGithubReadback);
    if (observedAt === undefined) delete observation.observedAt;
    else observation.observedAt = observedAt;
    const payload = structuredClone(observation);
    delete payload.observationHash;
    observation.observationHash = sha256(stableJson(payload));
    const candidate = structuredClone(contract);
    candidate.authorizedBootstrapException.ownerFinalCarrierGithubObservationHash = observation.observationHash;
    assert.ok(validate(candidate, mergeIdentity, authorizationReceipt, finalCarrierBindingReceipt, observation).some((error) => error.includes("GitHub observation")));
  }
});

test("repository ruleset readback expires after its claim-scoped 24-hour window", () => {
  assert.ok(validate(contract, mergeIdentity, authorizationReceipt, finalCarrierBindingReceipt, finalCarrierGithubReadback, "2036-08-10T06:30:00Z").some((error) => error.includes("ruleset readback stale")));
  assert.deepEqual(validate(contract, mergeIdentity, authorizationReceipt, finalCarrierBindingReceipt, finalCarrierGithubReadback, "2036-08-10T06:30:00Z", "STRUCTURAL"), []);
  const candidate = structuredClone(contract);
  candidate.applicationReadback.repositorySourceFreshness.expiresAt = "2036-08-11T05:33:01Z";
  assert.ok(validate(candidate, mergeIdentity, authorizationReceipt, finalCarrierBindingReceipt, finalCarrierGithubReadback, "2026-08-10T06:30:00Z").some((error) => error.includes("ruleset readback malformed")));
  assert.ok(validate(contract, mergeIdentity, authorizationReceipt, finalCarrierBindingReceipt, finalCarrierGithubReadback, "2026-08-10T06:30:00Z", null).some((error) => error.includes("freshness validation mode")));
});

test("owner authorization must predate protection removal", () => {
  const candidate = structuredClone(contract);
  candidate.authorizedBootstrapException.protectionWindow.removedAt = authorizationReceipt.createdAt;
  assert.ok(validate(candidate).some((error) => error.includes("authorization and readback chronology")));
});

test("unbounded removal chronology fails", () => {
  const candidate = structuredClone(contract);
  candidate.authorizedBootstrapException.protectionWindow.removedAt = "2026-08-10T04:18:00Z";
  assert.ok(validate(candidate).some((error) => error.includes("chronology")));
});

test("additional admitted merge fails", () => {
  const candidate = structuredClone(contract);
  candidate.authorizedBootstrapException.protectionWindow.additionalMergesAdmitted = 1;
  candidate.authorizedBootstrapException.protectionWindow.admittedMergeShas.push("0".repeat(40));
  assert.ok(validate(candidate).some((error) => error.includes("main-history interval")));
});

test("protection-window provider version identities are exact", () => {
  const candidate = structuredClone(contract);
  candidate.authorizedBootstrapException.protectionWindow.preRemovalVersionId = 1;
  candidate.authorizedBootstrapException.protectionWindow.removalVersionId = 2;
  candidate.authorizedBootstrapException.protectionWindow.restorationVersionId = 3;
  assert.ok(validate(candidate).some((error) => error.includes("ruleset version identity")));
});

test("every protection-window version binds its complete provider policy", () => {
  for (const mutate of [
    (candidate) => { candidate.authorizedBootstrapException.protectionWindow.policySnapshots.removal.pullRequest.requiredApprovingReviewCount = 1; },
    (candidate) => { candidate.authorizedBootstrapException.protectionWindow.policySnapshots.removal.pullRequest.requireLastPushApproval = true; },
    (candidate) => { candidate.authorizedBootstrapException.protectionWindow.policySnapshots.removal.preventDeletion = false; },
    (candidate) => { candidate.authorizedBootstrapException.protectionWindow.policySnapshots.removal.preventNonFastForward = false; },
    (candidate) => candidate.authorizedBootstrapException.protectionWindow.policySnapshots.removal.bypassActors.push({ actorId: 1 }),
    (candidate) => { candidate.authorizedBootstrapException.protectionWindow.policySnapshots.removal.conditions.ref_name.include = ["refs/heads/not-main"]; },
    (candidate) => { candidate.authorizedBootstrapException.protectionWindow.policySnapshots.removal.requiredStatusChecks.publisherBindingState = "INTEGRATION_BOUND"; },
    (candidate) => { candidate.authorizedBootstrapException.protectionWindow.policySnapshots.removal.requiredStatusChecks.contexts[0].integration_id = 1; },
    (candidate) => { candidate.authorizedBootstrapException.protectionWindow.policySnapshotHashes.removal = "0".repeat(64); }
  ]) {
    const candidate = structuredClone(contract);
    mutate(candidate);
    assert.ok(validate(candidate).some((error) => error.includes("protection-window")));
  }
});

test("the historical context-only ruleset state is separated from exact GitHub Actions check-run evidence", () => {
  assert.equal(contract.authorizedBootstrapException.protectionWindow.policySnapshots.removal.requiredStatusChecks.publisherBindingState, "CONTEXT_ONLY_NO_INTEGRATION_ID_IN_PROVIDER_HISTORY");
  for (const mutate of [
    (readback) => { readback.checkRuns[0].appId = 1; },
    (readback) => { readback.workflowHeadSha = "0".repeat(40); },
    (readback) => { readback.checkSuiteHeadSha = "0".repeat(40); },
    (readback) => { readback.checkRuns[0].appSlug = "attacker"; },
    (readback) => { readback.checkRuns[0].name = "Unrelated / Green Check"; },
    (readback) => { readback.checkRuns[0].checkSuiteId = 1; },
    (readback) => { readback.checkRuns[0].conclusion = "neutral"; },
    (readback) => { readback.unexpectedPhase1NamedCheckRuns = 1; },
    (readback) => { readback.totalCheckRunsOnHead = 19; },
    (readback) => { readback.returnedCheckRuns = 17; },
    (readback) => { readback.checkRunReadbackComplete = false; },
    (readback) => { readback.historicalRulesetPublisherBinding = "INTEGRATION_BOUND"; },
    (readback) => readback.checkRuns.pop()
  ]) {
    const readback = structuredClone(bootstrapPhase1GithubReadback);
    mutate(readback);
    const errors = validate(contract, mergeIdentity, authorizationReceipt, finalCarrierBindingReceipt, finalCarrierGithubReadback, "2026-08-10T07:36:00Z", "CURRENT_CLAIM", readback);
    assert.ok(errors.some((error) => error.includes("bootstrap Phase 1 GitHub observation")));
  }
});

test("workflow and check-suite readback bind the exact carrier even after observation rehashing", () => {
  for (const field of ["workflowHeadSha", "checkSuiteHeadSha"]) {
    const readback = structuredClone(bootstrapPhase1GithubReadback);
    readback[field] = "0".repeat(40);
    delete readback.observationHash;
    readback.observationHash = sha256(stableJson(readback));
    assert.ok(validateBootstrapPhase1GithubReadback(readback, "2026-08-10T07:36:00Z").some((error) => error.includes("bootstrap Phase 1 GitHub observation")));
  }
});

test("status checks remain enforced when a protected branch is created", () => {
  const candidate = structuredClone(contract);
  candidate.applicationReadback.doNotEnforceOnCreate = true;
  assert.ok(validate(candidate).some((error) => error.includes("required protection state")));
});

test("fake one-parent bootstrap merge fails", () => {
  const identity = structuredClone(mergeIdentity);
  identity.parents = [mergeIdentity.parents[0]];
  identity.parentTrees = [mergeIdentity.parentTrees[0]];
  assert.ok(validate(contract, identity).some((error) => error.includes("main-history interval")));
});

test("wrong exact carrier second parent or tree fails", () => {
  const wrongParent = structuredClone(mergeIdentity);
  wrongParent.parents[1] = "0".repeat(40);
  assert.ok(validate(contract, wrongParent).some((error) => error.includes("main-history interval")));
  const wrongTree = structuredClone(mergeIdentity);
  wrongTree.parentTrees[1] = "0".repeat(40);
  assert.ok(validate(contract, wrongTree).some((error) => error.includes("main-history interval")));
});

test("bootstrap merge must remain reachable from protected main", () => {
  const identity = structuredClone(mergeIdentity);
  identity.protectedMainContainsMerge = false;
  assert.ok(validate(contract, identity).some((error) => error.includes("main-history interval")));
});

test("missing bootstrap history becomes a deterministic validation error", () => {
  const identity = readBootstrapMergeIdentity(contract.authorizedBootstrapException.mergeSha, () => {
    throw new Error("missing object");
  });
  assert.deepEqual(identity.errors, ["github ruleset readback: bootstrap merge history unavailable"]);
  assert.ok(validate(contract, identity).some((error) => error.includes("bootstrap merge history unavailable")));
});

test("R2 immutable publisher anchor is exact, self-hashed, and schema-bound", () => {
  assert.equal(phase1PublisherAnchorStructurallyValid(publisherAnchor), true);
  assert.equal(publisherAnchor.anchorHash, "b59479e0fb714e11c941cf2b7a2304fb1ca721ed930327611be289d3a3260cd2");
  assert.equal(publisherAnchor.provisioningReadbackHash, "99a60cd198b972f630e5bccc9024721b1482f2d54bed9706009ff8e383a4beee");
  for (const mutate of [
    (candidate) => { candidate.appId = 1; },
    (candidate) => { candidate.sourceMergeSha = "0".repeat(40); },
    (candidate) => { candidate.provisioningReadback.ruleset.stage1PutPayloadSha256 = "0".repeat(64); },
    (candidate) => { candidate.extraAuthority = true; },
  ]) {
    const candidate = structuredClone(contract);
    mutate(candidate.phase1AdmissionPublisherImmutableAnchor);
    assert.equal(phase1PublisherAnchorStructurallyValid(candidate.phase1AdmissionPublisherImmutableAnchor), false);
    assert.ok(validate(candidate).some((error) => error.includes("immutable publisher anchor")));
  }
});

test("R2 stage resolver accepts strict PRE/STAGE1/initial-FINAL history and only the receipt-bound recovered FINAL", () => {
  const pre = evaluateCutover();
  const stage1 = evaluateCutover({ stage: "STAGE1_AGGREGATE_PLUS_13_RAW", entries: [preEntry, stage1Entry] });
  const initialFinal = evaluateCutover({ stage: "FINAL_AGGREGATE_ONLY", entries: [preEntry, stage1Entry, finalEntry], providerUpdatedAt: finalProviderUpdatedAt });
  const recoveredFinal = evaluateRecoveredCutover();
  for (const state of [pre, stage1, initialFinal, recoveredFinal]) {
    assert.equal(phase1AdmissionRulesetCutoverStateValid(state), true);
    assert.equal(state.cutoverLock, "OPEN");
    assert.equal(state.paginationComplete, true);
    assert.deepEqual(state.findings, []);
  }
  const currentFinalWithoutReceipt = evaluateRecoveredCutover({ recoveryReceipt: null, recoveryReceiptComment: null, recoveryReceiptMarkerCommentCount: 0 });
  assert.equal(phase1AdmissionRulesetCutoverStateValid(currentFinalWithoutReceipt), false);
  assert.equal(currentFinalWithoutReceipt.cutoverLock, "CLOSED");
  assert.ok(currentFinalWithoutReceipt.findings.includes("PHASE1_RULESET_RECOVERY_RECEIPT_INVALID"));
  assert.equal(pre.currentRulesetStage, "PRE_CUTOVER_13_RAW");
  assert.equal(stage1.currentRulesetStage, "STAGE1_AGGREGATE_PLUS_13_RAW");
  assert.equal(initialFinal.currentRulesetStage, "FINAL_AGGREGATE_ONLY");
  assert.equal(recoveredFinal.currentRulesetStage, "FINAL_AGGREGATE_ONLY");
  assert.equal(new Set([pre.stageReceiptChainHash, stage1.stageReceiptChainHash, recoveredFinal.stageReceiptChainHash]).size, 3);
});

test("ruleset recovery binds the exact jq-style writable-state hashes including its canonical newline", () => {
  const writable = (state) => ({ name: state.name, target: state.target, enforcement: state.enforcement, bypass_actors: state.bypass_actors, conditions: state.conditions, rules: state.rules });
  assert.equal(sha256(`${stableJson(writable(recoveryCandidateState()))}\n`), phase1RulesetRecoveryPolicy.candidateWritableStateHash);
  assert.equal(sha256(`${stableJson(writable(finalEntry.state))}\n`), phase1RulesetRecoveryPolicy.restoredWritableStateHash);
  assert.equal(phase1RulesetRecoveryPolicyHash, sha256(stableJson(phase1RulesetRecoveryPolicy)));
});

test("ruleset recovery receipt is canonical, policy-bound, immutable, and below the GitHub comment limit", () => {
  const body = formatPhase1RulesetRecoveryReceiptComment(exactRecoveryReceipt);
  assert.equal(body.split("\n").length, 2);
  assert.equal(body.split("\n")[0], phase1RulesetRecoveryReceiptMarker);
  assert.equal(body.split("\n")[1], stableJson(exactRecoveryReceipt));
  assert.ok(Buffer.byteLength(body, "utf8") < 65_536);
  assert.equal(exactRecoveryReceipt.policyHash, phase1RulesetRecoveryPolicyHash);
  assert.equal(exactRecoveryReceipt.receiptHash, sha256(stableJson(Object.fromEntries(Object.entries(exactRecoveryReceipt).filter(([key]) => key !== "receiptHash")))));
  assert.ok(Object.values(exactRecoveryReceipt.evidenceHashes).every((value) => /^[0-9a-f]{64}$/u.test(value)));
  assert.equal(evaluateRecoveredCutover().cutoverLock, "OPEN");
});

test("ruleset recovery canonicalizes equivalent provider timestamps and accepts receipt-bound hidden public bypass fields", () => {
  const asChicagoOffset = (value) => {
    const shifted = new Date(Date.parse(value) - 5 * 60 * 60 * 1_000).toISOString();
    return `${shifted.slice(0, -1)}-05:00`;
  };
  const offsetHistory = receiptSourceHistory.map((entry) => ({ ...structuredClone(entry), updated_at: asChicagoOffset(entry.updated_at) }));
  const offsetSuiteSummaries = exactRecoveryRuleSuites.map((entry) => ({ ...structuredClone(entry), pushed_at: asChicagoOffset(entry.pushed_at) }));
  const offsetSuiteDetails = exactRecoveryEvidence.map(({ ruleSuiteDetail }) => ({ ...structuredClone(ruleSuiteDetail), pushed_at: asChicagoOffset(ruleSuiteDetail.pushed_at) }));
  const offsetCurrent = currentRuleset(finalEntry, asChicagoOffset(bootstrapRestoredAt));
  assert.deepEqual(buildPhase1RulesetRecoveryReceipt({
    historySummaries: offsetHistory,
    historyDetails: offsetHistory,
    ruleSuiteSummaries: offsetSuiteSummaries,
    ruleSuiteDetails: offsetSuiteDetails,
    currentRuleset: offsetCurrent,
  }), exactRecoveryReceipt);
  const offsetPublicEvidence = structuredClone(exactRecoveryEvidence);
  for (const proof of offsetPublicEvidence) {
    proof.pullRequest.merged_at = asChicagoOffset(proof.pullRequest.merged_at);
    proof.mergeIdentity.committedAt = asChicagoOffset(proof.mergeIdentity.committedAt);
  }
  assert.equal(evaluateRecoveredCutover({ recoveryEvidence: offsetPublicEvidence }).cutoverLock, "OPEN");
  assert.equal(evaluateRecoveredCutover({ providerUpdatedAt: asChicagoOffset(bootstrapRestoredAt) }).cutoverLock, "OPEN");
  assert.equal(evaluateRecoveredCutover({ currentOverrides: { bypass_actors: null, current_user_can_bypass: null } }).cutoverLock, "OPEN");
});

test("ruleset recovery rejects omission, truncation, replay, drift, extra writes, and malformed evidence", () => {
  const evaluateMutation = (mutate) => {
    const candidate = {
      entries: structuredClone(exactRecoveredEntries),
      recoveryEvidence: structuredClone(exactRecoveryEvidence),
      recoveryPaginationComplete: true,
      ruleSuites: structuredClone(exactRecoveryRuleSuites),
      recoveryReceipt: structuredClone(exactRecoveryReceipt),
      recoveryReceiptComment: structuredClone(exactRecoveryReceiptComment),
      recoveryReceiptMarkerCommentCount: 1,
      providerUpdatedAt: bootstrapRestoredAt,
      currentUserCanBypass: "never",
    };
    mutate(candidate);
    if (candidate.rebuildReceipt === true) {
      candidate.ruleSuites.sort((left, right) => {
        const leftTimestamp = Date.parse(left?.pushed_at ?? "");
        const rightTimestamp = Date.parse(right?.pushed_at ?? "");
        return (Number.isFinite(leftTimestamp) ? leftTimestamp : 0) - (Number.isFinite(rightTimestamp) ? rightTimestamp : 0)
          || (left?.id ?? 0) - (right?.id ?? 0);
      });
      candidate.recoveryReceipt = buildPhase1RulesetRecoveryReceipt({
        historySummaries: candidate.entries,
        historyDetails: candidate.entries,
        ruleSuiteSummaries: candidate.ruleSuites,
        ruleSuiteDetails: candidate.recoveryEvidence.map(({ ruleSuiteDetail }) => ruleSuiteDetail),
        currentRuleset: currentRuleset(candidate.entries.at(-1), candidate.providerUpdatedAt),
      });
      candidate.recoveryReceiptComment.body = formatPhase1RulesetRecoveryReceiptComment(candidate.recoveryReceipt);
    }
    return evaluateCutover({
      stage: "FINAL_AGGREGATE_ONLY",
      entries: candidate.entries,
      recoveryEvidence: candidate.recoveryEvidence,
      recoveryPaginationComplete: candidate.recoveryPaginationComplete,
      ruleSuites: candidate.ruleSuites,
      recoveryReceipt: candidate.recoveryReceipt,
      recoveryReceiptComment: candidate.recoveryReceiptComment,
      recoveryReceiptMarkerCommentCount: candidate.recoveryReceiptMarkerCommentCount,
      currentUserCanBypass: candidate.currentUserCanBypass,
      providerUpdatedAt: candidate.providerUpdatedAt,
    });
  };
  const cases = [
    ["omitted suffix", (value) => { value.entries = value.entries.slice(0, 3); }, "PHASE1_RULESET_RECOVERY_WINDOW_CARDINALITY_INVALID"],
    ["two historical pairs only", (value) => { value.entries = value.entries.slice(0, 7); }, "PHASE1_RULESET_RECOVERY_WINDOW_CARDINALITY_INVALID"],
    ["missing final restoration", (value) => { value.entries.pop(); }, "PHASE1_RULESET_RECOVERY_WINDOW_CARDINALITY_INVALID"],
    ["future fourth pair", (value) => {
      value.entries.push(recoveryEntry(recoveryCandidateState(), 47590003, "2026-08-25T08:01:01.000-05:00"));
      value.entries.push(recoveryEntry(finalEntry.state, 47590004, "2026-08-25T08:01:05.000-05:00"));
    }, "PHASE1_RULESET_RECOVERY_WINDOW_CARDINALITY_INVALID"],
    ["candidate policy drift", (value) => { value.entries[3].state.enforcement = "evaluate"; }, "PHASE1_RULESET_RECOVERY_STATE_INVALID"],
    ["restoration policy drift", (value) => { value.entries[4].state.bypass_actors.push({ actor_id: 1, actor_type: "User", bypass_mode: "pull_request" }); }, "PHASE1_RULESET_RECOVERY_STATE_INVALID"],
    ["wrong transition actor", (value) => { value.entries[5].actor.id = 1; }, "PHASE1_RULESET_RECOVERY_STATE_INVALID"],
    ["non-monotone unique version", (value) => { value.entries[7].version_id = 47585580; }, "PHASE1_RULESET_CUTOVER_HISTORY_MALFORMED"],
    ["malformed null history entry", (value) => { value.entries[4] = null; }, "PHASE1_RULESET_CUTOVER_HISTORY_MALFORMED"],
    ["null evidence entry", (value) => { value.recoveryEvidence[1] = null; }, "PHASE1_RULESET_RECOVERY_EVIDENCE_CARDINALITY_INVALID"],
    ["duplicate evidence identity", (value) => { value.recoveryEvidence[2].pr = 263; }, "PHASE1_RULESET_RECOVERY_EVIDENCE_CARDINALITY_INVALID"],
    ["recovery pagination incomplete", (value) => { value.recoveryPaginationComplete = false; }, "PHASE1_RULESET_RECOVERY_EVIDENCE_CARDINALITY_INVALID"],
    ["live owner bypass remains", (value) => { value.currentUserCanBypass = "pull_requests_only"; }, "PHASE1_RULESET_CUTOVER_LIVE_STAGE_INVALID"],
    ["wrong PR author", (value) => { value.recoveryEvidence[2].pullRequest.user.id = 1; }, "PHASE1_RULESET_RECOVERY_PULL_REQUEST_INVALID"],
    ["wrong merge actor", (value) => { value.recoveryEvidence[2].pullRequest.merged_by.login = "attacker"; }, "PHASE1_RULESET_RECOVERY_PULL_REQUEST_INVALID"],
    ["wrong protected base", (value) => { value.recoveryEvidence[2].pullRequest.base.sha = "b".repeat(40); }, "PHASE1_RULESET_RECOVERY_PULL_REQUEST_INVALID"],
    ["wrong second parent", (value) => { value.recoveryEvidence[2].mergeIdentity.parents[1] = "b".repeat(40); }, "PHASE1_RULESET_RECOVERY_MERGE_IDENTITY_INVALID"],
    ["merge not reachable", (value) => { value.recoveryEvidence[2].mergeIdentity.currentBaseContainsMerge = false; }, "PHASE1_RULESET_RECOVERY_MERGE_IDENTITY_INVALID"],
    ["rule suite did not bypass", (value) => { value.recoveryEvidence[2].ruleSuite.result = "pass"; }, "PHASE1_RULESET_RECOVERY_RULE_SUITE_INVALID"],
    ["wrong rule-suite actor", (value) => { value.recoveryEvidence[2].ruleSuite.actor_id = 1; }, "PHASE1_RULESET_RECOVERY_RULE_SUITE_INVALID"],
    ["duplicate matching suite", (value) => { value.recoveryEvidence[2].matchingRuleSuiteCount = 2; }, "PHASE1_RULESET_RECOVERY_RULE_SUITE_INVALID"],
    ["wrong detailed rule source", (value) => { value.recoveryEvidence[2].ruleSuiteDetail.rule_evaluations[0].rule_source.id = 1; }, "PHASE1_RULESET_RECOVERY_RULE_SUITE_DETAIL_INVALID"],
    ["required status check did not fail", (value) => { value.recoveryEvidence[2].ruleSuiteDetail.rule_evaluations[0].result = "pass"; }, "PHASE1_RULESET_RECOVERY_RULE_SUITE_DETAIL_INVALID"],
    ["second main write in open window", (value) => { value.ruleSuites.push({ ...structuredClone(value.ruleSuites[2]), id: 3812000001, pushed_at: "2026-08-25T08:00:04-05:00" }); }, "PHASE1_RULESET_RECOVERY_INTERVAL_WRITE_CARDINALITY_INVALID"],
    ["second main write at open boundary", (value) => {
      value.ruleSuites.push({ ...structuredClone(value.ruleSuites[2]), id: 3812000002, pushed_at: bootstrapOpenedAt });
      value.rebuildReceipt = true;
    }, "PHASE1_RULESET_RECOVERY_INTERVAL_WRITE_CARDINALITY_INVALID"],
    ["second main write at restore boundary", (value) => {
      value.ruleSuites.push({ ...structuredClone(value.ruleSuites[2]), id: 3812000003, pushed_at: bootstrapRestoredAt });
      value.rebuildReceipt = true;
    }, "PHASE1_RULESET_RECOVERY_INTERVAL_WRITE_CARDINALITY_INVALID"],
    ["malformed main write timestamp", (value) => {
      value.ruleSuites.push({ ...structuredClone(value.ruleSuites[2]), id: 3812000004, pushed_at: "not-a-date" });
      value.rebuildReceipt = true;
    }, "PHASE1_RULESET_RECOVERY_RECEIPT_EVIDENCE_INVALID"],
    ["missing provider file", (value) => { value.recoveryEvidence[2].files.pop(); }, "PHASE1_RULESET_RECOVERY_SELF_BOOTSTRAP_SCOPE_INVALID"],
    ["non-modified provider file", (value) => { value.recoveryEvidence[2].files[0].status = "added"; }, "PHASE1_RULESET_RECOVERY_SELF_BOOTSTRAP_SCOPE_INVALID"],
    ["merge diff path omitted", (value) => { value.recoveryEvidence[2].mergeIdentity.changedPaths.pop(); }, "PHASE1_RULESET_RECOVERY_SELF_BOOTSTRAP_SCOPE_INVALID"],
    ["provider file pagination incomplete", (value) => { value.recoveryEvidence[2].filesPaginationComplete = false; }, "PHASE1_RULESET_RECOVERY_SELF_BOOTSTRAP_SCOPE_INVALID"],
    ["self-bootstrap window exceeds five minutes", (value) => { value.entries[8].updated_at = "2026-08-25T08:06:02.000-05:00"; }, "PHASE1_RULESET_RECOVERY_SELF_BOOTSTRAP_DURATION_INVALID"],
    ["historical version substitution", (value) => { value.entries[3].version_id += 1; }, "PHASE1_RULESET_RECOVERY_HISTORICAL_BINDING_INVALID"],
    ["historical suite substitution", (value) => { value.recoveryEvidence[0].ruleSuite.id += 1; }, "PHASE1_RULESET_RECOVERY_HISTORICAL_BINDING_INVALID"],
    ["missing Owner receipt", (value) => { value.recoveryReceipt = null; value.recoveryReceiptComment = null; value.recoveryReceiptMarkerCommentCount = 0; }, "PHASE1_RULESET_RECOVERY_RECEIPT_INVALID"],
    ["duplicate marker comment", (value) => { value.recoveryReceiptMarkerCommentCount = 2; }, "PHASE1_RULESET_RECOVERY_RECEIPT_COMMENT_INVALID"],
    ["wrong receipt author", (value) => { value.recoveryReceiptComment.user.id = 1; }, "PHASE1_RULESET_RECOVERY_RECEIPT_COMMENT_INVALID"],
    ["edited receipt comment", (value) => { value.recoveryReceiptComment.updated_at = "2026-08-25T13:00:07Z"; }, "PHASE1_RULESET_RECOVERY_RECEIPT_COMMENT_INVALID"],
    ["noncanonical receipt body", (value) => { value.recoveryReceiptComment.body += "\n"; }, "PHASE1_RULESET_RECOVERY_RECEIPT_COMMENT_INVALID"],
    ["wrong receipt policy hash", (value) => { value.recoveryReceipt.policyHash = "0".repeat(64); }, "PHASE1_RULESET_RECOVERY_RECEIPT_INVALID"],
    ["tampered receipt evidence hash", (value) => { value.recoveryReceipt.evidenceHashes.ruleSuiteDetailsHash = "0".repeat(64); }, "PHASE1_RULESET_RECOVERY_RECEIPT_EVIDENCE_INVALID"],
    ["future restored current timestamp", (value) => { value.providerUpdatedAt = "2026-08-25T08:01:05.000-05:00"; }, "PHASE1_RULESET_RECOVERY_RECEIPT_FINAL_RESTORATION_INVALID"],
  ];
  for (const [name, mutate, finding] of cases) {
    const result = evaluateMutation(mutate);
    assert.equal(phase1AdmissionRulesetCutoverStateValid(result), false, name);
    assert.equal(result.cutoverLock, "CLOSED", name);
    assert.equal(result.stageReceiptChainHash, null, name);
    assert.ok(result.findings.includes(finding), `${name}: ${stableJson(result.findings)}`);
  }
});

test("R2 stage resolver closes on incomplete, skipped, replayed, substituted, or drifting history", () => {
  const wrongActor = structuredClone(stage1Entry);
  wrongActor.actor.id = 1;
  const policyDrift = structuredClone(finalEntry);
  policyDrift.state.rules.find(({ type }) => type === "pull_request").parameters.required_approving_review_count = 1;
  const broaderUpdate = structuredClone(finalEntry);
  broaderUpdate.state.rules.find(({ type }) => type === "update").parameters = { update_allows_fetch_and_merge: true };
  const rollback = historyEntry("PRE_CUTOVER_13_RAW", 50000003, "2026-08-25T03:02:00.001-05:00");
  const currentDrift = structuredClone(finalEntry);
  currentDrift.state.enforcement = "evaluate";
  const mutableGenesisContract = structuredClone(contract);
  mutableGenesisContract.applicationReadback.rulesetVersionId = rollback.version_id;
  const cases = [
    evaluateCutover({ paginationComplete: false }),
    evaluateCutover({ stage: "FINAL_AGGREGATE_ONLY", entries: [preEntry, finalEntry] }),
    evaluateCutover({ stage: "PRE_CUTOVER_13_RAW", entries: [preEntry, stage1Entry, finalEntry, rollback] }),
    evaluateCutover({ stage: "STAGE1_AGGREGATE_PLUS_13_RAW", entries: [preEntry, wrongActor] }),
    evaluateCutover({ stage: "FINAL_AGGREGATE_ONLY", entries: [preEntry, stage1Entry, policyDrift] }),
    evaluateCutover({ stage: "FINAL_AGGREGATE_ONLY", entries: [preEntry, stage1Entry, broaderUpdate] }),
    evaluateCutover({ stage: "FINAL_AGGREGATE_ONLY", entries: [preEntry, stage1Entry, finalEntry], currentEntry: currentDrift }),
    evaluatePhase1AdmissionRulesetCutoverState({ repository: contract.repository, identity: cutoverIdentity, anchor: publisherAnchor, liveProvisioningReadback: liveProvisioning("PRE_CUTOVER_13_RAW", publisherAnchor.rulesetProviderUpdatedAt), contract: mutableGenesisContract, observation: { current: currentRuleset(preEntry, publisherAnchor.rulesetProviderUpdatedAt), history: [preEntry], paginationComplete: true }, protectedSourceVerified: true }),
  ];
  for (const state of cases) {
    assert.equal(phase1AdmissionRulesetCutoverStateValid(state), false);
    assert.equal(state.cutoverLock, "CLOSED");
    assert.equal(state.stageReceiptChainHash, null);
    assert.ok(state.findings.length > 0);
  }
});

test("R2 current-truth aggregate is hash-bound, live-only, and never merge authority", () => {
  const state = evaluateRecoveredCutover();
  const body = {
    ...state,
    contract: "PHASE1_ADMISSION_RULESET_CUTOVER_LIVE_AGGREGATE_V1",
    producer: "CURRENT_TRUTH_PROTECTED_LIVE_AGGREGATE_V1",
    upstreamContract: state.contract,
    upstreamProducer: state.producer,
    live: true,
    mergeAuthority: false,
  };
  const aggregate = { ...body, aggregateHash: sha256(stableJson(body)) };
  assert.equal(phase1AdmissionRulesetCutoverAggregateValid(aggregate), true);
  for (const mutate of [
    (candidate) => { candidate.currentRulesetStage = "PRE_CUTOVER_13_RAW"; },
    (candidate) => { candidate.stageReceiptChainHash = "0".repeat(64); },
    (candidate) => { candidate.mergeAuthority = true; },
    (candidate) => { candidate.live = false; },
    (candidate) => { candidate.aggregateHash = "0".repeat(64); },
  ]) {
    const candidate = structuredClone(aggregate);
    mutate(candidate);
    assert.equal(phase1AdmissionRulesetCutoverAggregateValid(candidate), false);
  }
});

test("R2 live aggregate plumbing remains protected-source, explicit-provider, and fail-closed", () => {
  const currentTruthSource = readFileSync("scripts/assurance/current-truth.mjs", "utf8");
  const activeTaskSource = readFileSync("scripts/assurance/active-task.mjs", "utf8");
  const rulesetReadbackSource = readFileSync("scripts/assurance/github-main-ruleset-readback.mjs", "utf8");
  const schema = readJson("config/assurance/schemas-v1.json");
  assert.match(currentTruthSource, /resolvePhase1AdmissionRulesetCutoverState/u);
  assert.match(currentTruthSource, /CURRENT_TRUTH_PROTECTED_LIVE_AGGREGATE_V1/u);
  assert.match(activeTaskSource, /phase1AdmissionRulesetCutoverAggregateValid/u);
  assert.match(activeTaskSource, /--provider-snapshot/u);
  assert.match(rulesetReadbackSource, /issues\/\$\{recoveryPr\}\/comments\?per_page=100/u);
  assert.doesNotMatch(rulesetReadbackSource, /rulesets\/rule-suites|rulesets\/18940814\/history|\$\{endpoint\}\/history/u);
  assert.equal(schema.$defs.githubMainRulesetReadbackContract.required.includes("phase1AdmissionPublisherImmutableAnchor"), true);
  assert.equal(schema.$defs.githubMainRulesetReadbackContract.properties.phase1AdmissionPublisherImmutableAnchor.$ref, "#/$defs/phase1AdmissionPublisherImmutableAnchor");
});

test("focused readback regressions are mandatory Level A and Phase 1 inputs", () => {
  const commands = [
    ["github-main-ruleset-readback-test", "node --test tests/assurance/github-main-ruleset-readback.test.mjs"],
    ["codex-review-exact-head-test", "node --test tests/assurance/codex-review-exact-head.test.mjs"]
  ];
  const allowlist = readJson("config/assurance/command-allowlist-v1.json");
  const impact = readJson("config/assurance/test-impact-map-v1.json");
  const feature = readJson("config/assurance/feature-registry-v1.json").features.find(({ featureId }) => featureId === "assurance-efficiency-e0");
  const workflow = readFileSync(".github/workflows/phase1-ci.yml", "utf8");
  for (const [commandId, command] of commands) {
    const rule = allowlist.commands.find(({ id }) => id === commandId);
    assert.equal(rule?.contractCommand, command);
    assert.ok(impact.riskCommands.A.includes(command));
    assert.ok(feature.commands.includes(command));
    let clock = 0;
    const receipt = runReceipt(allowlist, commandId, rule.args, {
      sourceHead: "a".repeat(40),
      sourceTree: "b".repeat(40),
      clock: () => clock++,
      spawn: () => ({ status: 0, stdout: "TAP version 13\n1..1\n# tests 1\n# pass 1\n# fail 0\n", stderr: "" }),
      artifactWriter: () => "/tmp/assurance-receipt-test"
    });
    assert.equal(receipt.ok, true, `${commandId} must execute through the governed receipt runner`);
  }
  assert.match(workflow, /Validate exact GitHub review and ruleset controls\n[\s\S]*?run: \|\n\s+node --test tests\/assurance\/github-main-ruleset-readback\.test\.mjs\n\s+node --test tests\/assurance\/codex-review-exact-head\.test\.mjs/u);
});
