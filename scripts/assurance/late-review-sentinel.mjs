#!/usr/bin/env node
import { args, emit, readJson } from "./lib.mjs";
import { parseLateReviewIssue, readOpenLateReviewIssues } from "./codex-review-exact-head.mjs";

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
