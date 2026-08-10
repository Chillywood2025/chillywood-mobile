import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readBootstrapMergeIdentity, validateBootstrapPhase1GithubReadback, validateGithubMainRulesetReadback } from "../../scripts/assurance/github-main-ruleset-readback.mjs";
import { readJson, sha256, stableJson } from "../../scripts/assurance/lib.mjs";
import { runReceipt } from "../../scripts/assurance/receipt.mjs";

const contract = readJson("config/assurance/github-main-ruleset-codex-review-v1.json");
const authorizationReceipt = readJson("config/assurance/a1-owner-bootstrap-authorization-v1.json");
const finalCarrierBindingReceipt = readJson("config/assurance/a1-owner-final-carrier-binding-v1.json");
const finalCarrierGithubReadback = readJson("config/assurance/a1-owner-final-carrier-github-readback-v1.json");
const bootstrapPhase1GithubReadback = readJson("config/assurance/a1-bootstrap-phase1-github-readback-v1.json");
const mergeIdentity = readBootstrapMergeIdentity(contract.authorizedBootstrapException.mergeSha);
const validate = (candidate, identity = mergeIdentity, receipt = authorizationReceipt, carrierReceipt = finalCarrierBindingReceipt, githubReadback = finalCarrierGithubReadback, now = "2026-08-10T12:50:00Z", freshnessMode = "CURRENT_CLAIM", phase1Readback = bootstrapPhase1GithubReadback) => validateGithubMainRulesetReadback({ contract: candidate, authorizationReceipt: receipt, finalCarrierBindingReceipt: carrierReceipt, finalCarrierGithubReadback: githubReadback, bootstrapPhase1GithubReadback: phase1Readback, mergeIdentity: identity, now, freshnessMode });

test("exact ruleset readback and bounded bootstrap window pass", () => {
  assert.deepEqual(validate(contract), []);
  assert.equal(contract.applicationReadback.requiredStatusCheckPresent, false);
  assert.equal(contract.applicationReadback.requiredStatusChecks.includes("Chi'llywood / Codex Review Exact Head"), false);
  assert.equal(contract.applicationReadback.requiredStatusChecks.length, 13);
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
    (candidate) => { candidate.pullRequestRequirements.requiredReviewThreadResolution = false; },
    (candidate) => { candidate.pullRequestRequirements.requiredApprovingReviewCount = 0; },
    (candidate) => { candidate.pullRequestRequirements.requireLastPushApproval = false; },
    (candidate) => { candidate.pullRequestRequirements.preventDeletion = false; },
    (candidate) => { candidate.pullRequestRequirements.preventNonFastForward = false; },
    (candidate) => { candidate.applicationReadback.requiredApprovingReviewCount = 0; },
    (candidate) => { candidate.applicationReadback.requireLastPushApproval = false; },
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
  assert.match(workflow, /Validate exact GitHub review and ruleset controls\n\s+run: \|\n\s+node --test tests\/assurance\/github-main-ruleset-readback\.test\.mjs\n\s+node --test tests\/assurance\/codex-review-exact-head\.test\.mjs/u);
});
