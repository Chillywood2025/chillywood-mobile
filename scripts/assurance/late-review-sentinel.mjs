#!/usr/bin/env node
import { args, emit, readJson } from "./lib.mjs";
import { parseLateReviewIssue, readOpenLateReviewIssues } from "./codex-review-exact-head.mjs";

const requiredBlocks = ["post-merge-completion-claim", "next-implementation", "release", "proof-tier-promotion"];
const gitSha = /^[0-9a-f]{40}$/u;
const sha256 = /^[0-9a-f]{64}$/u;

function sameValues(left, right) {
  return Array.isArray(left)
    && Array.isArray(right)
    && new Set(left).size === left.length
    && new Set(right).size === right.length
    && JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
}

function validInstant(value) {
  return typeof value === "string" && Number.isFinite(new Date(value).valueOf());
}

export function lateReviewSentinelResolved(sentinel) {
  const findings = Array.isArray(sentinel?.findings) ? sentinel.findings : [];
  if (!findings.length || findings.some(({ disposition, threadResolutionState }) => disposition !== "RESOLVED"
    || (threadResolutionState !== "RESOLVED" && threadResolutionState !== "NOT_APPLICABLE"))) return false;
  const evidence = sentinel.resolutionEvidence;
  const sourceIds = findings.map(({ sourceId }) => sourceId);
  const threadIds = findings.map(({ threadId }) => threadId).filter(Boolean);
  return evidence?.schemaVersion === 1
    && Number.isInteger(evidence.successorPr)
    && evidence.successorPr > 0
    && evidence.successorBranch === sentinel.successorCorrectionOwner
    && gitSha.test(evidence.successorHead ?? "")
    && gitSha.test(evidence.successorTree ?? "")
    && gitSha.test(evidence.successorMergeSha ?? "")
    && evidence.exactHeadReviewedCommit === evidence.successorHead
    && evidence.exactHeadReviewedTree === evidence.successorTree
    && sha256.test(evidence.exactHeadReviewReceiptHash ?? "")
    && sha256.test(evidence.correctionEvidenceHash ?? "")
    && sha256.test(evidence.dispositionEvidenceHash ?? "")
    && evidence.allThreadsResolved === true
    && validInstant(evidence.githubThreadResolutionReadbackAt)
    && validInstant(evidence.completedAt)
    && sameValues(evidence.correctedSourceIds, sourceIds)
    && sameValues(evidence.resolvedThreadIds, threadIds);
}

export function unresolvedLateReviewSentinels(record) {
  return (record?.lateReviewSentinels ?? []).filter((sentinel) => !lateReviewSentinelResolved(sentinel));
}

export function validateLateReviewSentinelState(record) {
  const findings = [];
  for (const sentinel of record?.lateReviewSentinels ?? []) {
    const dispositions = (sentinel.findings ?? []).map(({ disposition }) => disposition);
    const claimsResolution = dispositions.some((disposition) => disposition === "RESOLVED");
    const resolved = lateReviewSentinelResolved(sentinel);
    if (claimsResolution && !resolved) findings.push({ id: "LATE_REVIEW_RESOLUTION_EVIDENCE_INVALID", prNumber: sentinel.prNumber });
    if (resolved) continue;
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

export async function readDurableLateReviewSentinels(repository, token, options = {}) {
  const issues = await readOpenLateReviewIssues(repository, token, options);
  const parsed = issues.map((issue) => ({ issue, sentinel: parseLateReviewIssue(issue) }));
  if (parsed.some(({ sentinel }) => !sentinel)) throw new Error("CODEX_REVIEW_RECEIPT_INVALID");
  return parsed;
}

async function main() {
  const options = args();
  const record = readJson("config/assurance/current-truth-v1.json");
  const sentinels = unresolvedLateReviewSentinels(record);
  const findings = validateLateReviewSentinelState(record);
  const requireGithub = options.requireGithub === true || options.requireGithub === "true";
  let durable = [];
  if (requireGithub) {
    const repository = options.repository ?? process.env.GITHUB_REPOSITORY;
    const token = process.env.GITHUB_TOKEN;
    if (!repository || !token) throw new Error("CODEX_REVIEW_INPUT_MISSING");
    durable = await readDurableLateReviewSentinels(repository, token, { maxPages: 20 });
  }
  const durableSentinels = durable.map(({ sentinel }) => sentinel);
  const allSentinels = [...sentinels, ...durableSentinels];
  emit("assurance:late-review-sentinel", allSentinels.length === 0 && findings.length === 0, {
    classification: allSentinels.length ? "MERGED_WITH_UNRESOLVED_EXACT_HEAD_REVIEW" : "NO_UNRESOLVED_LATE_REVIEW",
    findings,
    githubReadbackRequired: requireGithub,
    durableIssueNumbers: durable.map(({ issue }) => issue.number),
    blocks: allSentinels.flatMap(({ blocks }) => blocks ?? []),
    pullRequests: allSentinels.map(({ prNumber, reviewedSha, successorCorrectionOwner, findings: sentinelFindings }) => ({
      prNumber,
      reviewedSha,
      successorCorrectionOwner,
      unresolvedFindings: sentinelFindings.filter(({ disposition }) => disposition !== "RESOLVED").length
    }))
  }, [`late review sentinel: ${allSentinels.length ? "FAIL" : "PASS"} — ${allSentinels.length} unresolved merged review${allSentinels.length === 1 ? "" : "s"}`]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => emit("assurance:late-review-sentinel", false, {
    classification: "MERGED_WITH_UNRESOLVED_EXACT_HEAD_REVIEW",
    findings: [{ id: error.message }],
    blocks: requiredBlocks
  }, [`late review sentinel: FAIL — ${error.message}`]));
}
