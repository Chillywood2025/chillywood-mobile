import { git, sha256, stableJson } from "./lib.mjs";

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
export const requiredChecks = [exactHeadCheck, ...phase1Checks];
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
  requiredApprovingReviewCount: 1,
  requiredReviewThreadResolution: true,
  dismissStaleReviewsOnPush: true,
  requireCodeOwnerReview: false,
  requireLastPushApproval: true,
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
    strictRequiredStatusChecksPolicy: true
  }
});
export const bootstrapWindowPolicies = {
  preRemoval: bootstrapPolicySnapshot(requiredChecks),
  removal: bootstrapPolicySnapshot(phase1Checks),
  restoration: bootstrapPolicySnapshot(requiredChecks)
};
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
  observedHead: "a9bd887606f74996a9f5920e6fad922e7f20598b",
  observedAt: "2026-08-10T07:24:55Z",
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

export function validateGithubMainRulesetReadback({ contract, authorizationReceipt, finalCarrierBindingReceipt, finalCarrierGithubReadback, mergeIdentity, now = new Date(), freshnessMode }) {
  const errors = [];
  const readback = contract?.applicationReadback;
  const exception = contract?.authorizedBootstrapException;
  const window = exception?.protectionWindow;
  const freshness = readback?.repositorySourceFreshness;
  const add = (id) => errors.push(`github ruleset readback: ${id}`);

  if (contract?.applicationState !== "APPLIED_AND_READ_BACK_POST_A1_MERGE") add("application state mismatch");
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
  if (readback?.rulesetVersionId !== 46047691
    || readback?.rulesetUpdatedAt !== "2026-08-10T00:32:55.241-05:00"
    || readback?.changeClassification !== "ENFORCED_CANONICAL_PULL_REQUEST_POLICY_AND_PRESERVED_EXACT_CHECK_BINDINGS") add("current ruleset identity mismatch");
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
    || protectedMainReadback.observedHead !== exception?.mergeSha) add("protected main readback mismatch");
  if (readback?.enforcement !== "active"
    || readback?.strictRequiredStatusChecksPolicy !== true
    || readback?.doNotEnforceOnCreate !== false
    || !same(readback?.ruleTypes, ["deletion", "non_fast_forward", "pull_request", "required_status_checks"])
    || !same(readback?.allowedMergeMethods, pullRequestRequirements.allowedMergeMethods)
    || readback?.requiredApprovingReviewCount !== pullRequestRequirements.requiredApprovingReviewCount
    || readback?.requiredReviewThreadResolution !== true
    || readback?.dismissStaleReviewsOnPush !== true
    || readback?.requireCodeOwnerReview !== false
    || readback?.requireLastPushApproval !== true
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
  if (window?.preRemovalStatusCheckSetSha256 !== setHash(requiredChecks)
    || window?.removalStatusCheckSetSha256 !== setHash(phase1Checks)
    || window?.restoredStatusCheckSetSha256 !== setHash(requiredChecks)) add("protection-window digest mismatch");
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
