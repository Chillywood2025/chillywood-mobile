import { sha256, stableJson } from "./lib.mjs";

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

const setHash = (values) => sha256(stableJson([...values].sort()));
const same = (left, right) => stableJson(left) === stableJson(right);

export function validateGithubMainRulesetReadback({ contract, currentTruth, mergeParents }) {
  const errors = [];
  const readback = contract?.applicationReadback;
  const exception = contract?.authorizedBootstrapException;
  const authorization = exception?.ownerAuthorization;
  const canonicalAuthorization = currentTruth?.activeTaskBinding?.ownerBootstrapAuthorization;
  const window = exception?.protectionWindow;
  const add = (id) => errors.push(`github ruleset readback: ${id}`);

  if (contract?.applicationState !== "APPLIED_AND_READ_BACK_POST_A1_MERGE") add("application state mismatch");
  if (!same(readback?.requiredStatusChecks, requiredChecks)) add("required status-check identities mismatch");
  if (readback?.requiredStatusCheckCount !== requiredChecks.length) add("required status-check count mismatch");
  if (readback?.requiredStatusCheckPresent !== readback?.requiredStatusChecks?.includes(exactHeadCheck)) add("exact-head presence derivation mismatch");
  if (readback?.requiredStatusCheckSetSha256 !== setHash(requiredChecks)) add("required status-check digest mismatch");
  if (readback?.rulesetVersionId !== window?.restorationVersionId || readback?.rulesetUpdatedAt !== window?.restoredAt) add("restored ruleset identity mismatch");
  if (readback?.enforcement !== "active"
    || readback?.strictRequiredStatusChecksPolicy !== true
    || readback?.requiredReviewThreadResolution !== true
    || readback?.dismissStaleReviewsOnPush !== true
    || !Array.isArray(readback?.bypassActors)
    || readback.bypassActors.length !== 0) add("required protection state mismatch");

  const authorizationFields = ["prNumber", "commentId", "author", "authorAssociation", "bodySha256", "subjectHash"];
  if (!authorizationFields.every((field) => authorization?.[field] === canonicalAuthorization?.[field])) add("owner authorization mismatch");
  if (exception?.pullRequest !== authorization?.prNumber || exception?.mergeSha !== window?.mainAfterRestoration) add("bootstrap subject mismatch");
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
  if (![preAt, removedAt, mergedAt, restoredAt].every(Number.isFinite)
    || !(preAt < removedAt && removedAt < mergedAt && mergedAt < restoredAt)) add("bootstrap chronology mismatch");
  if (!(Number.isInteger(window?.preRemovalVersionId)
    && Number.isInteger(window?.removalVersionId)
    && Number.isInteger(window?.restorationVersionId)
    && window.preRemovalVersionId < window.removalVersionId
    && window.removalVersionId < window.restorationVersionId)) add("ruleset version order mismatch");
  if (window?.preRemovalStatusCheckSetSha256 !== setHash(requiredChecks)
    || window?.removalStatusCheckSetSha256 !== setHash(phase1Checks)
    || window?.restoredStatusCheckSetSha256 !== setHash(requiredChecks)) add("protection-window digest mismatch");
  if (!Array.isArray(mergeParents)
    || mergeParents.length !== 2
    || window?.mainBeforeRemoval !== mergeParents[0]
    || window?.mainAfterRestoration !== exception?.mergeSha
    || !same(window?.admittedMergeShas, [exception?.mergeSha])
    || window?.additionalMergesAdmitted !== 0) add("admitted main-history interval mismatch");

  return errors;
}
