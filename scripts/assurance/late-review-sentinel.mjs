#!/usr/bin/env node
import { emit, readJson } from "./lib.mjs";

const requiredBlocks = ["post-merge-completion-claim", "next-implementation", "release", "proof-tier-promotion"];

export function unresolvedLateReviewSentinels(record) {
  return (record?.lateReviewSentinels ?? []).filter((sentinel) => (sentinel.findings ?? [])
    .some(({ disposition }) => disposition !== "RESOLVED"));
}

export function validateLateReviewSentinelState(record) {
  const findings = [];
  for (const sentinel of unresolvedLateReviewSentinels(record)) {
    const binding = typeof sentinel.bindingPath === "string" ? record?.[sentinel.bindingPath] : null;
    if (JSON.stringify(sentinel.blocks) !== JSON.stringify(requiredBlocks)) findings.push({ id: "LATE_REVIEW_BLOCK_SET_INVALID", prNumber: sentinel.prNumber });
    if (!binding || binding.implementationPr !== sentinel.prNumber) findings.push({ id: "LATE_REVIEW_AFFECTED_BINDING_MISSING", prNumber: sentinel.prNumber });
    if (binding?.state !== sentinel.classification) findings.push({ id: "LATE_REVIEW_COMPLETION_CLAIM_BLOCKED", prNumber: sentinel.prNumber });
    if (binding?.mayProceed?.formalReviews !== false
      || binding?.mayProceed?.merge !== false
      || binding?.mayProceed?.postMergeProductSuccessorRequired !== true
      || binding?.mayProceed?.d2aResume !== false
      || binding?.mayProceed?.buildOrOta !== false
      || binding?.mayProceed?.providerOrProductionMutation !== false) {
      findings.push({ id: "LATE_REVIEW_SUCCESSOR_GATES_INVALID", prNumber: sentinel.prNumber });
    }
    if (!String(record?.assuranceProgram?.active ?? "").includes(sentinel.classification)) {
      findings.push({ id: "LATE_REVIEW_CLASSIFICATION_HIDDEN", prNumber: sentinel.prNumber });
    }
  }
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const record = readJson("config/assurance/current-truth-v1.json");
  const sentinels = unresolvedLateReviewSentinels(record);
  const findings = validateLateReviewSentinelState(record);
  emit("assurance:late-review-sentinel", sentinels.length === 0 && findings.length === 0, {
    classification: sentinels.length ? "MERGED_WITH_UNRESOLVED_EXACT_HEAD_REVIEW" : "NO_UNRESOLVED_LATE_REVIEW",
    findings,
    blocks: sentinels.flatMap(({ blocks }) => blocks ?? []),
    pullRequests: sentinels.map(({ prNumber, reviewedSha, successorCorrectionOwner, findings }) => ({
      prNumber,
      reviewedSha,
      successorCorrectionOwner,
      unresolvedFindings: findings.filter(({ disposition }) => disposition !== "RESOLVED").length
    }))
  }, [`late review sentinel: ${sentinels.length ? "FAIL" : "PASS"} — ${sentinels.length} unresolved merged review${sentinels.length === 1 ? "" : "s"}`]);
}
