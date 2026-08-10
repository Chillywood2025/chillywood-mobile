import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readBootstrapMergeIdentity, validateGithubMainRulesetReadback } from "../../scripts/assurance/github-main-ruleset-readback.mjs";
import { readJson } from "../../scripts/assurance/lib.mjs";

const contract = readJson("config/assurance/github-main-ruleset-codex-review-v1.json");
const authorizationReceipt = readJson("config/assurance/a1-owner-bootstrap-authorization-v1.json");
const mergeIdentity = readBootstrapMergeIdentity(contract.authorizedBootstrapException.mergeSha);
const validate = (candidate, identity = mergeIdentity, receipt = authorizationReceipt) => validateGithubMainRulesetReadback({ contract: candidate, authorizationReceipt: receipt, mergeIdentity: identity });

test("exact ruleset readback and bounded bootstrap window pass", () => {
  assert.deepEqual(validate(contract), []);
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
    (candidate) => { candidate.pullRequestRequirements.requiredReviewThreadResolution = false; }
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
  const command = "node --test tests/assurance/github-main-ruleset-readback.test.mjs";
  const allowlist = readJson("config/assurance/command-allowlist-v1.json");
  const impact = readJson("config/assurance/test-impact-map-v1.json");
  const feature = readJson("config/assurance/feature-registry-v1.json").features.find(({ featureId }) => featureId === "assurance-efficiency-e0");
  const workflow = readFileSync(".github/workflows/phase1-ci.yml", "utf8");
  assert.ok(allowlist.commands.some(({ contractCommand }) => contractCommand === command));
  assert.ok(impact.riskCommands.A.includes(command));
  assert.ok(feature.commands.includes(command));
  assert.match(workflow, /Validate exact GitHub ruleset readback controls\n\s+run: node --test tests\/assurance\/github-main-ruleset-readback\.test\.mjs/u);
});
