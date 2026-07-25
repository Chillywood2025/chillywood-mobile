import {
  canonicalize,
  hashJson,
  sha256Hex,
} from "../contracts.mjs";

export const GITHUB_PROVIDER_NO_MERGE_SCHEMA_VERSION =
  "github-provider-no-merge-v1";
export const GITHUB_PROVIDER_RULESET_NAME =
  "chillywood-cognitive-draft-pr-no-merge";
export const GITHUB_PROVIDER_REPOSITORY =
  "Chillywood2025/chillywood-mobile";
export const GITHUB_PROVIDER_BASE_BRANCH =
  "codex/cognitive-level01-operationalization";
export const GITHUB_PROVIDER_BASE_REF =
  `refs/heads/${GITHUB_PROVIDER_BASE_BRANCH}`;
export const GITHUB_PROVIDER_SCOPE_MANIFEST_HASH =
  "ccb0b53a380c2a14bae99680105c60aa1c78267f3a96dff3cb22aaa258588554";

const PERMISSIONS = Object.freeze({
  contents: "write",
  metadata: "read",
  pull_requests: "write",
});
const PROOF_KEYS = Object.freeze([
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
]);
const HASH = /^[a-f0-9]{64}$/u;
const SHA = /^[a-f0-9]{40}$/u;
const CHECK_CONTEXT = /^[A-Za-z0-9][A-Za-z0-9 .:/_()[\]-]{1,120}$/u;
const MAXIMUM_PROOF_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const MAXIMUM_DENIAL_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const MERGE_DENIAL_REASON =
  /(?:approval|branch protection|not mergeable|required|review|rule|status check)/iu;
const DRAFT_ONLY_REASON = /(?:draft|work in progress|\bwip\b)/iu;

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const text = (value) => typeof value === "string" ? value.trim() : "";

const exactKeys = (value, expected) => {
  if (!isRecord(value)) return false;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index]);
};

const canonicalTimestamp = (value) => {
  if (typeof value !== "string") return null;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis) || new Date(millis).toISOString() !== value) {
    return null;
  }
  return { millis, value };
};

const positiveInteger = (value) =>
  Number.isSafeInteger(value) && value > 0;

const sameJson = (left, right) =>
  JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));

const normalizeStatusChecks = (checks) => {
  if (!Array.isArray(checks) || checks.length < 1 || checks.length > 32) {
    return null;
  }
  const normalized = checks.map((entry) => {
    if (!isRecord(entry)) return null;
    const context = text(entry.context);
    const integrationId = entry.integration_id ?? entry.integrationId ?? null;
    if (
      !CHECK_CONTEXT.test(context) ||
      !(integrationId === null || positiveInteger(integrationId))
    ) {
      return null;
    }
    return {
      context,
      integration_id: integrationId,
    };
  });
  if (normalized.some((entry) => entry === null)) return null;
  normalized.sort((left, right) =>
    left.context.localeCompare(right.context) ||
    (left.integration_id ?? 0) - (right.integration_id ?? 0)
  );
  if (
    normalized.some((entry, index) =>
      index > 0 &&
      entry.context === normalized[index - 1].context &&
      entry.integration_id === normalized[index - 1].integration_id
    )
  ) {
    return null;
  }
  return normalized;
};

const expectedPullRequestParameters = (ownerTeamId) => ({
  allowed_merge_methods: ["merge", "squash", "rebase"],
  dismiss_stale_reviews_on_push: true,
  require_code_owner_review: false,
  require_last_push_approval: true,
  required_approving_review_count: 1,
  required_review_thread_resolution: true,
  required_reviewers: [{
    file_patterns: ["**/*"],
    minimum_approvals: 1,
    reviewer: {
      id: ownerTeamId,
      type: "Team",
    },
  }],
});

export const buildGitHubNoMergeRulesetRequest = ({
  ownerTeamId,
  requiredStatusChecks,
}) => {
  if (!positiveInteger(ownerTeamId)) {
    throw new Error("github_owner_reviewer_team_rejected");
  }
  const checks = normalizeStatusChecks(requiredStatusChecks);
  if (!checks) throw new Error("github_required_status_checks_rejected");
  return Object.freeze({
    bypass_actors: [],
    conditions: {
      ref_name: {
        exclude: [],
        include: [GITHUB_PROVIDER_BASE_REF],
      },
    },
    enforcement: "active",
    name: GITHUB_PROVIDER_RULESET_NAME,
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      {
        parameters: expectedPullRequestParameters(ownerTeamId),
        type: "pull_request",
      },
      {
        parameters: {
          do_not_enforce_on_create: false,
          required_status_checks: checks,
          strict_required_status_checks_policy: true,
        },
        type: "required_status_checks",
      },
    ],
    target: "branch",
  });
};

const normalizeRulesetPolicy = ({
  ownerTeamId,
  requiredStatusChecks,
  ruleset,
  requireAdministrativeBypassReadback,
}) => {
  if (
    !isRecord(ruleset) ||
    !positiveInteger(ruleset.id) ||
    ruleset.name !== GITHUB_PROVIDER_RULESET_NAME ||
    ruleset.target !== "branch" ||
    ruleset.source_type !== "Repository" ||
    ruleset.source !== GITHUB_PROVIDER_REPOSITORY ||
    ruleset.enforcement !== "active"
  ) {
    return null;
  }
  if (
    requireAdministrativeBypassReadback &&
    (!Object.hasOwn(ruleset, "bypass_actors") ||
      !Array.isArray(ruleset.bypass_actors) ||
      ruleset.bypass_actors.length !== 0)
  ) {
    return null;
  }
  const refName = isRecord(ruleset.conditions)
    ? ruleset.conditions.ref_name
    : null;
  if (
    !isRecord(refName) ||
    !Array.isArray(refName.include) ||
    refName.include.length !== 1 ||
    refName.include[0] !== GITHUB_PROVIDER_BASE_REF ||
    !Array.isArray(refName.exclude) ||
    refName.exclude.length !== 0
  ) {
    return null;
  }
  if (!Array.isArray(ruleset.rules) || ruleset.rules.length !== 4) return null;
  const byType = new Map();
  for (const rule of ruleset.rules) {
    if (
      !isRecord(rule) ||
      typeof rule.type !== "string" ||
      byType.has(rule.type)
    ) {
      return null;
    }
    byType.set(rule.type, rule);
  }
  if (
    !byType.has("deletion") ||
    !byType.has("non_fast_forward") ||
    !byType.has("pull_request") ||
    !byType.has("required_status_checks")
  ) {
    return null;
  }
  const pullRequest = byType.get("pull_request").parameters;
  const expectedPullRequest = expectedPullRequestParameters(ownerTeamId);
  if (
    !isRecord(pullRequest) ||
    !sameJson(pullRequest, expectedPullRequest)
  ) {
    return null;
  }
  const statusCheckRule = byType.get("required_status_checks").parameters;
  const checks = normalizeStatusChecks(requiredStatusChecks);
  const actualChecks = isRecord(statusCheckRule)
    ? normalizeStatusChecks(statusCheckRule.required_status_checks)
    : null;
  if (
    !checks ||
    !actualChecks ||
    JSON.stringify(actualChecks) !== JSON.stringify(checks) ||
    statusCheckRule.strict_required_status_checks_policy !== true ||
    statusCheckRule.do_not_enforce_on_create === true
  ) {
    return null;
  }
  return Object.freeze({
    conditions: {
      exclude: [],
      include: [GITHUB_PROVIDER_BASE_REF],
    },
    enforcement: "active",
    name: GITHUB_PROVIDER_RULESET_NAME,
    rules: [
      { type: "deletion" },
      { type: "non_fast_forward" },
      {
        parameters: expectedPullRequest,
        type: "pull_request",
      },
      {
        parameters: {
          do_not_enforce_on_create: false,
          required_status_checks: checks,
          strict_required_status_checks_policy: true,
        },
        type: "required_status_checks",
      },
    ],
    source: GITHUB_PROVIDER_REPOSITORY,
    sourceType: "Repository",
    target: "branch",
  });
};

const effectiveRulesMatch = (effectiveRules, rulesetId) => {
  if (!Array.isArray(effectiveRules)) return false;
  const applicable = effectiveRules.filter((entry) =>
    isRecord(entry) && entry.ruleset_id === rulesetId
  );
  const types = applicable.map((entry) => entry.type).sort();
  return JSON.stringify(types) === JSON.stringify([
    "deletion",
    "non_fast_forward",
    "pull_request",
    "required_status_checks",
  ]);
};

const normalizeInstallation = (installation) => {
  if (
    !isRecord(installation) ||
    !positiveInteger(installation.appId) ||
    !positiveInteger(installation.installationId) ||
    !positiveInteger(installation.repositoryId) ||
    !isRecord(installation.permissions) ||
    !sameJson(installation.permissions, PERMISSIONS) ||
    !Array.isArray(installation.repositories) ||
    installation.repositories.length !== 1
  ) {
    return null;
  }
  const repository = installation.repositories[0];
  if (
    !isRecord(repository) ||
    repository.id !== installation.repositoryId ||
    repository.full_name !== GITHUB_PROVIDER_REPOSITORY
  ) {
    return null;
  }
  return Object.freeze({
    appId: installation.appId,
    installationId: installation.installationId,
    permissions: PERMISSIONS,
    repository: {
      fullName: repository.full_name,
      id: repository.id,
    },
    repositoryId: installation.repositoryId,
  });
};

const normalizeDeniedMerge = ({
  installationId,
  mergeAttempt,
  pullRequest,
  verifiedAt,
}) => {
  if (
    !isRecord(pullRequest) ||
    !positiveInteger(pullRequest.number) ||
    pullRequest.state !== "open" ||
    pullRequest.draft !== false ||
    pullRequest.merged !== false ||
    pullRequest.mergeable !== true ||
    !["blocked", "unstable"].includes(pullRequest.mergeable_state) ||
    !isRecord(pullRequest.base) ||
    pullRequest.base.ref !== GITHUB_PROVIDER_BASE_BRANCH ||
    !isRecord(pullRequest.base.repo) ||
    pullRequest.base.repo.full_name !== GITHUB_PROVIDER_REPOSITORY ||
    !isRecord(pullRequest.head) ||
    !SHA.test(text(pullRequest.head.sha)) ||
    !isRecord(mergeAttempt) ||
    mergeAttempt.method !== "PUT" ||
    mergeAttempt.endpoint !==
      `/repos/${GITHUB_PROVIDER_REPOSITORY}/pulls/${pullRequest.number}/merge` ||
    mergeAttempt.pullNumber !== pullRequest.number ||
    mergeAttempt.actorInstallationId !== installationId ||
    mergeAttempt.sha !== pullRequest.head.sha ||
    ![403, 405].includes(mergeAttempt.status) ||
    !isRecord(mergeAttempt.response) ||
    mergeAttempt.response.merged !== false
  ) {
    return null;
  }
  const attemptedAt = canonicalTimestamp(mergeAttempt.attemptedAt);
  const message = text(mergeAttempt.response.message);
  if (
    !attemptedAt ||
    message.length < 3 ||
    message.length > 256 ||
    !MERGE_DENIAL_REASON.test(message) ||
    DRAFT_ONLY_REASON.test(message) ||
    Math.abs(attemptedAt.millis - verifiedAt.millis) >
      MAXIMUM_DENIAL_CLOCK_SKEW_MS
  ) {
    return null;
  }
  return Object.freeze({
    attemptedAt: attemptedAt.value,
    baseBranch: GITHUB_PROVIDER_BASE_BRANCH,
    endpointHashInput:
      `/repos/${GITHUB_PROVIDER_REPOSITORY}/pulls/{proof}/merge`,
    headSha: pullRequest.head.sha,
    method: "PUT",
    providerMessageClass: "protected_branch_requirements_unsatisfied",
    pullNumber: pullRequest.number,
    status: mergeAttempt.status,
  });
};

export const createGitHubProviderNoMergeAttestation = async ({
  effectiveRules,
  expiresAt,
  installation,
  mergeAttempt,
  ownerTeamId,
  pullRequest,
  requiredStatusChecks,
  ruleset,
  verifiedAt,
}) => {
  const verified = canonicalTimestamp(verifiedAt);
  const expires = canonicalTimestamp(expiresAt);
  if (
    !verified ||
    !expires ||
    expires.millis <= verified.millis ||
    expires.millis - verified.millis > MAXIMUM_PROOF_LIFETIME_MS
  ) {
    throw new Error("github_provider_proof_expiry_rejected");
  }
  if (!positiveInteger(ownerTeamId)) {
    throw new Error("github_owner_reviewer_team_rejected");
  }
  const normalizedInstallation = normalizeInstallation(installation);
  if (!normalizedInstallation) {
    throw new Error("github_installation_scope_rejected");
  }
  const rulesetPolicy = normalizeRulesetPolicy({
    ownerTeamId,
    requiredStatusChecks,
    requireAdministrativeBypassReadback: true,
    ruleset,
  });
  if (!rulesetPolicy || !effectiveRulesMatch(effectiveRules, ruleset.id)) {
    throw new Error("github_provider_ruleset_rejected");
  }
  const deniedMerge = normalizeDeniedMerge({
    installationId: normalizedInstallation.installationId,
    mergeAttempt,
    pullRequest,
    verifiedAt: verified,
  });
  if (!deniedMerge) throw new Error("github_provider_merge_denial_rejected");
  const unsigned = {
    appPublicFingerprintHash: await sha256Hex(
      `github-app-installation|${normalizedInstallation.appId}|${
        normalizedInstallation.installationId
      }|${normalizedInstallation.repositoryId}`,
    ),
    baseBranch: GITHUB_PROVIDER_BASE_BRANCH,
    bypassManifestHash: await hashJson([]),
    deniedMergeEvidenceHash: await hashJson(deniedMerge),
    expiresAt: expires.value,
    permissionManifestHash: await hashJson(PERMISSIONS),
    providerStatus: "provider_enforced_no_merge",
    repository: GITHUB_PROVIDER_REPOSITORY,
    repositorySelectionHash: await hashJson([
      normalizedInstallation.repository,
    ]),
    rulesetIdHash: await hashJson({ id: ruleset.id }),
    rulesetPolicyHash: await hashJson(rulesetPolicy),
    schemaVersion: GITHUB_PROVIDER_NO_MERGE_SCHEMA_VERSION,
    scopeManifestHash: GITHUB_PROVIDER_SCOPE_MANIFEST_HASH,
    verifiedAt: verified.value,
  };
  return Object.freeze({
    ...unsigned,
    proofHash: await hashJson(unsigned),
  });
};

export const validateGitHubProviderNoMergeProof = async (
  proof,
  {
    expectedAppPublicFingerprintHash,
    expectedPermissionManifestHash,
    expectedRepositorySelectionHash,
    expectedScopeManifestHash = GITHUB_PROVIDER_SCOPE_MANIFEST_HASH,
    now = Date.now(),
  } = {},
) => {
  if (!exactKeys(proof, PROOF_KEYS)) return null;
  const verified = canonicalTimestamp(proof.verifiedAt);
  const expires = canonicalTimestamp(proof.expiresAt);
  if (
    proof.schemaVersion !== GITHUB_PROVIDER_NO_MERGE_SCHEMA_VERSION ||
    proof.repository !== GITHUB_PROVIDER_REPOSITORY ||
    proof.baseBranch !== GITHUB_PROVIDER_BASE_BRANCH ||
    proof.providerStatus !== "provider_enforced_no_merge" ||
    proof.scopeManifestHash !== expectedScopeManifestHash ||
    !verified ||
    !expires ||
    expires.millis <= verified.millis ||
    expires.millis - verified.millis > MAXIMUM_PROOF_LIFETIME_MS ||
    now < verified.millis - MAXIMUM_DENIAL_CLOCK_SKEW_MS ||
    now >= expires.millis ||
    ![
      "appPublicFingerprintHash",
      "bypassManifestHash",
      "deniedMergeEvidenceHash",
      "permissionManifestHash",
      "proofHash",
      "repositorySelectionHash",
      "rulesetIdHash",
      "rulesetPolicyHash",
      "scopeManifestHash",
    ].every((key) => HASH.test(proof[key])) ||
    (
      expectedAppPublicFingerprintHash !== undefined &&
      proof.appPublicFingerprintHash !== expectedAppPublicFingerprintHash
    ) ||
    (
      expectedPermissionManifestHash !== undefined &&
      proof.permissionManifestHash !== expectedPermissionManifestHash
    ) ||
    (
      expectedRepositorySelectionHash !== undefined &&
      proof.repositorySelectionHash !== expectedRepositorySelectionHash
    )
  ) {
    return null;
  }
  const unsigned = Object.fromEntries(
    Object.entries(proof).filter(([key]) => key !== "proofHash"),
  );
  if (await hashJson(unsigned) !== proof.proofHash) return null;
  if (
    proof.permissionManifestHash !== await hashJson(PERMISSIONS) ||
    proof.bypassManifestHash !== await hashJson([])
  ) {
    return null;
  }
  return Object.freeze({ ...proof });
};
