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
export const ownerAuthorizationReceiptPath = "config/assurance/a1-owner-bootstrap-authorization-v1.json";
export const ownerFinalCarrierBindingReceiptPath = "config/assurance/a1-owner-final-carrier-binding-v1.json";
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
  observedAt: "2026-08-10T05:33:01Z",
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

export function validateGithubMainRulesetReadback({ contract, authorizationReceipt, finalCarrierBindingReceipt, mergeIdentity }) {
  const errors = [];
  const readback = contract?.applicationReadback;
  const exception = contract?.authorizedBootstrapException;
  const window = exception?.protectionWindow;
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
  if (readback?.rulesetVersionId !== 46047691
    || readback?.rulesetUpdatedAt !== "2026-08-10T00:32:55.241-05:00"
    || readback?.changeClassification !== "ENFORCED_CANONICAL_PULL_REQUEST_POLICY_AND_PRESERVED_EXACT_CHECK_BINDINGS") add("current ruleset identity mismatch");
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
