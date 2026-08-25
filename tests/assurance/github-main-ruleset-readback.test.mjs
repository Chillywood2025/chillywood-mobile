import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluatePhase1AdmissionRulesetCutoverState, mainBranchCondition, phase1AdmissionCheck, phase1AdmissionRulesetCutoverAggregateValid, phase1AdmissionRulesetCutoverStateValid, phase1PublisherAnchorStructurallyValid, phase1RulesetGenesis, readBootstrapMergeIdentity, requiredCheckBindings, validateBootstrapPhase1GithubReadback, validateGithubMainRulesetReadback } from "../../scripts/assurance/github-main-ruleset-readback.mjs";
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
const stage1Entry = historyEntry("STAGE1_AGGREGATE_PLUS_13_RAW", 50000001, "2026-08-25T03:00:00.001-05:00");
const finalEntry = historyEntry("FINAL_AGGREGATE_ONLY", 50000002, "2026-08-25T03:01:00.001-05:00");
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
const currentRuleset = (entry, providerUpdatedAt) => ({ ...structuredClone(entry.state), node_id: publisherAnchor.rulesetNodeId, updated_at: providerUpdatedAt, current_user_can_bypass: entry.state.bypass_actors.length ? "always" : "never" });
const evaluateCutover = ({ stage = "PRE_CUTOVER_13_RAW", entries = [preEntry], currentEntry = entries.at(-1), paginationComplete = true, anchor = publisherAnchor, live = null } = {}) => {
  const providerUpdatedAt = stage === "PRE_CUTOVER_13_RAW" ? publisherAnchor.rulesetProviderUpdatedAt : currentEntry.updated_at;
  return evaluatePhase1AdmissionRulesetCutoverState({
    repository: contract.repository,
    identity: cutoverIdentity,
    anchor,
    liveProvisioningReadback: live ?? liveProvisioning(stage, providerUpdatedAt),
    contract: { ...contract, phase1AdmissionPublisherImmutableAnchor: anchor },
    observation: { current: currentRuleset(currentEntry, providerUpdatedAt), history: entries, paginationComplete },
    protectedSourceVerified: true,
  });
};

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

test("R2 stage resolver accepts only contiguous PRE, STAGE1, and FINAL prefixes", () => {
  const pre = evaluateCutover();
  const stage1 = evaluateCutover({ stage: "STAGE1_AGGREGATE_PLUS_13_RAW", entries: [preEntry, stage1Entry] });
  const final = evaluateCutover({ stage: "FINAL_AGGREGATE_ONLY", entries: [preEntry, stage1Entry, finalEntry] });
  for (const state of [pre, stage1, final]) {
    assert.equal(phase1AdmissionRulesetCutoverStateValid(state), true);
    assert.equal(state.cutoverLock, "OPEN");
    assert.equal(state.paginationComplete, true);
    assert.deepEqual(state.findings, []);
  }
  assert.equal(pre.currentRulesetStage, "PRE_CUTOVER_13_RAW");
  assert.equal(stage1.currentRulesetStage, "STAGE1_AGGREGATE_PLUS_13_RAW");
  assert.equal(final.currentRulesetStage, "FINAL_AGGREGATE_ONLY");
  assert.equal(new Set([pre.stageReceiptChainHash, stage1.stageReceiptChainHash, final.stageReceiptChainHash]).size, 3);
});

test("R2 stage resolver closes on incomplete, skipped, replayed, substituted, or drifting history", () => {
  const wrongActor = structuredClone(stage1Entry);
  wrongActor.actor.id = 1;
  const policyDrift = structuredClone(finalEntry);
  policyDrift.state.rules.find(({ type }) => type === "pull_request").parameters.required_approving_review_count = 1;
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
  const state = evaluateCutover({ stage: "FINAL_AGGREGATE_ONLY", entries: [preEntry, stage1Entry, finalEntry] });
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
  const schema = readJson("config/assurance/schemas-v1.json");
  assert.match(currentTruthSource, /resolvePhase1AdmissionRulesetCutoverState/u);
  assert.match(currentTruthSource, /CURRENT_TRUTH_PROTECTED_LIVE_AGGREGATE_V1/u);
  assert.match(activeTaskSource, /phase1AdmissionRulesetCutoverAggregateValid/u);
  assert.match(activeTaskSource, /--provider-snapshot/u);
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
