import assert from "node:assert/strict";
import test from "node:test";
import { validateGithubMainRulesetReadback } from "../../scripts/assurance/github-main-ruleset-readback.mjs";
import { git, readJson } from "../../scripts/assurance/lib.mjs";

const contract = readJson("config/assurance/github-main-ruleset-codex-review-v1.json");
const currentTruth = readJson("config/assurance/current-truth-v1.json");
const mergeParents = git(["show", "-s", "--format=%P", contract.authorizedBootstrapException.mergeSha]).split(/\s+/u).filter(Boolean);
const validate = (candidate, parents = mergeParents) => validateGithubMainRulesetReadback({ contract: candidate, currentTruth, mergeParents: parents });

test("exact ruleset readback and bounded bootstrap window pass", () => {
  assert.deepEqual(validate(contract), []);
});

test("same-count status-check substitution fails", () => {
  const candidate = structuredClone(contract);
  candidate.applicationReadback.requiredStatusChecks[1] = "Unrelated / Green Check";
  assert.ok(validate(candidate).some((error) => error.includes("status-check identities")));
});

test("owner authorization substitution fails", () => {
  const candidate = structuredClone(contract);
  candidate.authorizedBootstrapException.ownerAuthorization.bodySha256 = "0".repeat(64);
  assert.ok(validate(candidate).some((error) => error.includes("owner authorization")));
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
  assert.ok(validate(contract, [mergeParents[0]]).some((error) => error.includes("main-history interval")));
});
