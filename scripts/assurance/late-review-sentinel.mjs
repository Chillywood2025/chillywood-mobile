#!/usr/bin/env node
import { args, emit, lateReviewAllowedOwners, lateReviewFindingSetEqual, lateReviewRegistryCoverageFindings, lateReviewSentinelResolved, mergeLateReviewSentinelRecords, readJson } from "./lib.mjs";
import { parseLateReviewIssue, readMergedLateReviewLedgerSentinels, readOpenLateReviewIssues, verifyLateReviewResolutionGithub } from "./codex-review-exact-head.mjs";

export { lateReviewSentinelResolved } from "./lib.mjs";

const requiredBlocks = ["post-merge-completion-claim", "next-implementation", "release", "proof-tier-promotion"];
export function unresolvedLateReviewSentinels(record, options = {}) {
  return (record?.lateReviewSentinels ?? []).filter((sentinel) => !lateReviewSentinelResolved(sentinel, options));
}

export function validateLateReviewSentinelState(record, options = {}) {
  const findings = lateReviewRegistryCoverageFindings(record?.lateReviewSentinels);
  for (const sentinel of record?.lateReviewSentinels ?? []) {
    const dispositions = (sentinel.findings ?? []).map(({ disposition }) => disposition);
    const claimsResolution = dispositions.some((disposition) => disposition === "RESOLVED");
    const resolved = lateReviewSentinelResolved(sentinel, options);
    if (lateReviewAllowedOwners(sentinel).length === 0) findings.push({ id: "LATE_REVIEW_OWNER_POLICY_INVALID", prNumber: sentinel.prNumber });
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
  for (const entry of parsed) {
    const claimsResolution = entry.sentinel.findings?.every(({ disposition }) => disposition === "RESOLVED");
    if (!claimsResolution) continue;
    const verified = typeof options.verifyResolution === "function"
      ? await options.verifyResolution({ repository, token, ...entry })
      : null;
    if (!lateReviewSentinelResolved(entry.sentinel, { resolutionVerifier: () => verified })) {
      throw new Error("CODEX_REVIEW_RECEIPT_INVALID");
    }
    entry.resolutionVerified = true;
  }
  return parsed;
}

export function mergeUnresolvedLateReviewSentinels({ globalLedgerSentinels = [], canonicalSentinels = [], durable = [] }) {
  const durableSentinels = durable.filter(({ resolutionVerified }) => resolutionVerified !== true).map(({ sentinel }) => sentinel);
  const authoritative = mergeLateReviewSentinelRecords([...globalLedgerSentinels, ...canonicalSentinels, ...durableSentinels]);
  return authoritative.filter((sentinel) => !durable.some((entry) => entry.resolutionVerified === true
    && entry.sentinel?.repository === sentinel.repository
    && entry.sentinel?.prNumber === sentinel.prNumber
    && entry.sentinel?.mergeSha === sentinel.mergeSha
    && lateReviewFindingSetEqual(entry.sentinel.findings, sentinel.findings)));
}

async function main() {
  const options = args();
  const record = readJson("config/assurance/current-truth-v1.json");
  const sentinels = unresolvedLateReviewSentinels(record);
  const findings = validateLateReviewSentinelState(record);
  const requireGithub = options.requireGithub === true || options.requireGithub === "true";
  let durable = [];
  let globalLedgerSentinels = [];
  if (requireGithub) {
    const repository = options.repository ?? process.env.GITHUB_REPOSITORY;
    const token = process.env.GITHUB_TOKEN;
    if (!repository || !token) throw new Error("CODEX_REVIEW_INPUT_MISSING");
    durable = await readDurableLateReviewSentinels(repository, token, {
      maxPages: 20,
      verifyResolution: ({ sentinel }) => verifyLateReviewResolutionGithub({ repository, token, sentinel, maxPages: 20 })
    });
    globalLedgerSentinels = await readMergedLateReviewLedgerSentinels(repository, token, { maxPages: 20 });
  }
  const allSentinels = mergeUnresolvedLateReviewSentinels({ globalLedgerSentinels, canonicalSentinels: sentinels, durable });
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
