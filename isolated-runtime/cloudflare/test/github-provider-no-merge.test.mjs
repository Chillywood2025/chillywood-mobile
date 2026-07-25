import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGitHubNoMergeRulesetRequest,
  createGitHubProviderNoMergeAttestation,
  GITHUB_PROVIDER_BASE_BRANCH,
  GITHUB_PROVIDER_BASE_REF,
  GITHUB_PROVIDER_REPOSITORY,
  GITHUB_PROVIDER_RULESET_NAME,
  validateGitHubProviderNoMergeProof,
} from "../src/adapters/github-provider-no-merge.mjs";

const NOW = Date.parse("2026-07-24T20:00:00.000Z");
const OWNER_TEAM_ID = 4567;
const RULESET_ID = 7654;
const PULL_NUMBER = 321;
const HEAD_SHA = "a".repeat(40);
const STATUS_CHECKS = [
  { context: "Phase 1 / Cognitive Execution Safety", integration_id: 15368 },
  { context: "Phase 1 / Research and Memory Integrity", integration_id: 15368 },
];

const ruleset = () => ({
  ...buildGitHubNoMergeRulesetRequest({
    ownerTeamId: OWNER_TEAM_ID,
    requiredStatusChecks: STATUS_CHECKS,
  }),
  id: RULESET_ID,
  source: GITHUB_PROVIDER_REPOSITORY,
  source_type: "Repository",
});

const effectiveRules = () =>
  ["deletion", "non_fast_forward", "pull_request", "required_status_checks"]
    .map((type) => ({
      ruleset_id: RULESET_ID,
      ruleset_source: GITHUB_PROVIDER_REPOSITORY,
      ruleset_source_type: "Repository",
      type,
    }));

const installation = () => ({
  appId: 12345,
  installationId: 23456,
  permissions: {
    contents: "write",
    metadata: "read",
    pull_requests: "write",
  },
  repositories: [{
    full_name: GITHUB_PROVIDER_REPOSITORY,
    id: 34567,
  }],
  repositoryId: 34567,
});

const pullRequest = () => ({
  base: {
    ref: GITHUB_PROVIDER_BASE_BRANCH,
    repo: { full_name: GITHUB_PROVIDER_REPOSITORY },
  },
  draft: false,
  head: { sha: HEAD_SHA },
  mergeable: true,
  mergeable_state: "blocked",
  merged: false,
  number: PULL_NUMBER,
  state: "open",
});

const mergeAttempt = () => ({
  actorInstallationId: 23456,
  attemptedAt: new Date(NOW).toISOString(),
  endpoint:
    `/repos/${GITHUB_PROVIDER_REPOSITORY}/pulls/${PULL_NUMBER}/merge`,
  method: "PUT",
  pullNumber: PULL_NUMBER,
  response: {
    merged: false,
    message:
      "Required approving review and status checks have not passed.",
  },
  sha: HEAD_SHA,
  status: 405,
});

const attestation = (overrides = {}) =>
  createGitHubProviderNoMergeAttestation({
    effectiveRules: effectiveRules(),
    expiresAt: new Date(NOW + 20 * 60_000).toISOString(),
    installation: installation(),
    mergeAttempt: mergeAttempt(),
    ownerTeamId: OWNER_TEAM_ID,
    pullRequest: pullRequest(),
    requiredStatusChecks: STATUS_CHECKS,
    ruleset: ruleset(),
    verifiedAt: new Date(NOW).toISOString(),
    ...overrides,
  });

test("provider ruleset request is exact, active, and has no bypass actor", () => {
  const request = buildGitHubNoMergeRulesetRequest({
    ownerTeamId: OWNER_TEAM_ID,
    requiredStatusChecks: [...STATUS_CHECKS].reverse(),
  });
  assert.equal(request.name, GITHUB_PROVIDER_RULESET_NAME);
  assert.equal(request.enforcement, "active");
  assert.equal(request.target, "branch");
  assert.deepEqual(request.bypass_actors, []);
  assert.deepEqual(request.conditions.ref_name, {
    exclude: [],
    include: [GITHUB_PROVIDER_BASE_REF],
  });
  assert.deepEqual(
    request.rules.map((entry) => entry.type),
    [
      "deletion",
      "non_fast_forward",
      "pull_request",
      "required_status_checks",
    ],
  );
  const pullRule = request.rules.find((entry) =>
    entry.type === "pull_request"
  );
  assert.equal(pullRule.parameters.required_approving_review_count, 1);
  assert.equal(pullRule.parameters.require_last_push_approval, true);
  assert.deepEqual(pullRule.parameters.required_reviewers, [{
    file_patterns: ["**/*"],
    minimum_approvals: 1,
    reviewer: { id: OWNER_TEAM_ID, type: "Team" },
  }]);
  const checks = request.rules.find((entry) =>
    entry.type === "required_status_checks"
  );
  assert.equal(checks.parameters.strict_required_status_checks_policy, true);
});

test("provider attestation emits only deterministic hashes and validates", async () => {
  const proof = await attestation();
  assert.deepEqual(
    Object.keys(proof).sort(),
    [
      "appPublicFingerprintHash",
      "baseBranch",
      "bypassManifestHash",
      "deniedMergeEvidenceHash",
      "expiresAt",
      "permissionManifestHash",
      "proofHash",
      "providerStatus",
      "repository",
      "repositorySelectionHash",
      "rulesetIdHash",
      "rulesetPolicyHash",
      "schemaVersion",
      "scopeManifestHash",
      "verifiedAt",
    ],
  );
  for (
    const key of [
      "appPublicFingerprintHash",
      "bypassManifestHash",
      "deniedMergeEvidenceHash",
      "permissionManifestHash",
      "proofHash",
      "repositorySelectionHash",
      "rulesetIdHash",
      "rulesetPolicyHash",
      "scopeManifestHash",
    ]
  ) {
    assert.match(proof[key], /^[a-f0-9]{64}$/u);
  }
  assert.equal(Object.hasOwn(proof, "installationId"), false);
  assert.equal(Object.hasOwn(proof, "pullNumber"), false);
  assert.equal(Object.hasOwn(proof, "ownerTeamId"), false);
  assert.ok(
    await validateGitHubProviderNoMergeProof(proof, {
      expectedAppPublicFingerprintHash: proof.appPublicFingerprintHash,
      now: NOW + 1,
    }),
  );
});

test("provider attestation fails closed on bypass, broad scope, or inactive rules", async () => {
  const withBypass = ruleset();
  withBypass.bypass_actors = [{
    actor_id: 23456,
    actor_type: "Integration",
    bypass_mode: "always",
  }];
  await assert.rejects(
    attestation({ ruleset: withBypass }),
    /github_provider_ruleset_rejected/u,
  );

  const broad = installation();
  broad.permissions.administration = "write";
  await assert.rejects(
    attestation({ installation: broad }),
    /github_installation_scope_rejected/u,
  );

  const inactive = ruleset();
  inactive.enforcement = "evaluate";
  await assert.rejects(
    attestation({ ruleset: inactive }),
    /github_provider_ruleset_rejected/u,
  );
});

test("provider attestation rejects draft-only or caller-relabeled denial", async () => {
  const draft = pullRequest();
  draft.draft = true;
  await assert.rejects(
    attestation({ pullRequest: draft }),
    /github_provider_merge_denial_rejected/u,
  );

  const draftReason = mergeAttempt();
  draftReason.response.message = "Pull Request is still a draft";
  await assert.rejects(
    attestation({ mergeAttempt: draftReason }),
    /github_provider_merge_denial_rejected/u,
  );

  const claimedDenial = mergeAttempt();
  claimedDenial.status = 200;
  await assert.rejects(
    attestation({ mergeAttempt: claimedDenial }),
    /github_provider_merge_denial_rejected/u,
  );

  const conflict = pullRequest();
  conflict.mergeable = false;
  conflict.mergeable_state = "dirty";
  await assert.rejects(
    attestation({ pullRequest: conflict }),
    /github_provider_merge_denial_rejected/u,
  );
});

test("provider proof rejects tampering and expiry", async () => {
  const proof = await attestation();
  assert.equal(
    await validateGitHubProviderNoMergeProof(
      { ...proof, rulesetPolicyHash: "f".repeat(64) },
      { now: NOW + 1 },
    ),
    null,
  );
  assert.equal(
    await validateGitHubProviderNoMergeProof(
      proof,
      { now: Date.parse(proof.expiresAt) },
    ),
    null,
  );
});
