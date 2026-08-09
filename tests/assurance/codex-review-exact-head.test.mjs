import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildExactHeadReceipt,
  detectLateReview,
  evaluateExactHeadReceipt,
  exactReceiptHash
} from "../../scripts/assurance/codex-review-exact-head.mjs";
import { unresolvedLateReviewSentinels, validateLateReviewSentinelState } from "../../scripts/assurance/late-review-sentinel.mjs";

const contract = JSON.parse(fs.readFileSync("config/assurance/codex-review-exact-head-v1.json", "utf8"));
const headA = "a".repeat(40);
const headB = "b".repeat(40);
const treeA = "c".repeat(40);
const treeB = "d".repeat(40);
const baseCurrent = {
  repository: "Chillywood2025/chillywood-mobile",
  prNumber: 201,
  headSha: headA,
  headTree: treeA,
  latestSourcePushAt: "2026-08-09T11:00:00Z",
  mergedAt: null,
  mergeSha: null,
  providerReviewsExist: true,
  reviewOnly: false
};
const exactReview = {
  reviewId: 9001,
  author: "chatgpt-codex-connector",
  state: "COMMENTED",
  startedAt: "2026-08-09T11:30:00Z",
  submittedAt: "2026-08-09T12:00:00Z",
  commit: headA
};
const comment = ({ id = 1, severity = "P2", commit = headA, createdAt = exactReview.submittedAt, path = "scripts/assurance/lib.mjs" } = {}) => ({
  commentId: id,
  commentNodeId: `COMMENT_${id}`,
  author: "chatgpt-codex-connector",
  body: `${severity} finding`,
  createdAt,
  path,
  commit
});
const thread = ({ id = "THREAD_1", resolved = true, comments = [comment()] } = {}) => ({ threadId: id, isResolved: resolved, comments });

test("exact-head no-suggestion review produces a valid current receipt", () => {
  const receipt = buildExactHeadReceipt({ contract, current: baseCurrent, review: exactReview, threads: [] });
  const result = evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt });
  assert.equal(result.ok, true, result.codes.join(","));
  assert.equal(receipt.receiptHash, exactReceiptHash(receipt));
  assert.equal(receipt.reviewedCommit, headA);
  assert.equal(receipt.prHeadTree, treeA);
});

test("old-head review and a new source commit invalidate the receipt immediately", () => {
  const receipt = buildExactHeadReceipt({ contract, current: baseCurrent, review: exactReview, threads: [] });
  const advanced = { ...baseCurrent, headSha: headB, headTree: treeB, latestSourcePushAt: "2026-08-09T12:30:00Z" };
  const result = evaluateExactHeadReceipt({ contract, current: advanced, receipt });
  assert.equal(result.ok, false);
  assert(result.codes.includes("CODEX_REVIEW_STALE_HEAD"));
  assert(result.codes.includes("CODEX_REVIEW_INCOMPLETE"));
});

test("dismissed or malformed review receipts fail closed", () => {
  const dismissed = buildExactHeadReceipt({ contract, current: baseCurrent, review: { ...exactReview, state: "DISMISSED" }, threads: [] });
  assert.deepEqual(evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt: dismissed }).codes, ["CODEX_REVIEW_RECEIPT_INVALID"]);
  const malformed = { ...buildExactHeadReceipt({ contract, current: baseCurrent, review: exactReview, threads: [] }), prHeadTree: null };
  malformed.receiptHash = exactReceiptHash(malformed);
  assert.deepEqual(evaluateExactHeadReceipt({ contract, current: { ...baseCurrent, headTree: null }, receipt: malformed }).codes, ["CODEX_REVIEW_RECEIPT_INVALID"]);
});

test("an unresolved P2 thread blocks both the conversation and finding gates", () => {
  const receipt = buildExactHeadReceipt({ contract, current: baseCurrent, review: exactReview, threads: [thread({ resolved: false })] });
  const result = evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt });
  assert.equal(result.ok, false);
  assert(result.codes.includes("CODEX_REVIEW_BLOCKING_THREAD_OPEN"));
  assert(result.codes.includes("CODEX_REVIEW_UNRESOLVED_FINDING"));
});

test("resolving an old thread does not substitute for rereview after source changes", () => {
  const oldReceipt = buildExactHeadReceipt({ contract, current: baseCurrent, review: exactReview, threads: [thread({ resolved: true })] });
  const advanced = { ...baseCurrent, headSha: headB, headTree: treeB, latestSourcePushAt: "2026-08-09T12:30:00Z" };
  const result = evaluateExactHeadReceipt({ contract, current: advanced, receipt: oldReceipt });
  assert.equal(result.ok, false);
  assert(result.codes.includes("CODEX_REVIEW_STALE_HEAD"));
});

test("review-only PRs never become merge eligible", () => {
  const current = { ...baseCurrent, reviewOnly: true };
  const receipt = buildExactHeadReceipt({ contract, current, review: exactReview, threads: [] });
  const result = evaluateExactHeadReceipt({ contract, current, receipt });
  assert.equal(result.ok, false);
  assert(result.codes.includes("CODEX_REVIEW_RECEIPT_INVALID"));
});

test("PR 194 late-review timeline denies merge, post-truth closure, and successor work", () => {
  const current = {
    ...baseCurrent,
    prNumber: 194,
    headSha: "c15a58039b67d65eabdcaa03a9422ebc8d6dd95e",
    headTree: "4ce01fa17e4184f2523b82a10401e3b3f59dd641",
    latestSourcePushAt: "2026-08-09T17:30:00Z",
    mergedAt: "2026-08-09T18:04:06Z",
    mergeSha: "4ee283aa851bb2042a7559a54a1664d6eebcb446",
    successorCorrectionOwner: "codex/d2a-livekit-mic-post-merge-review-correction"
  };
  const beforeReview = evaluateExactHeadReceipt({ contract, current: { ...current, providerReviewsExist: false }, receipt: null });
  assert.equal(beforeReview.ok, false, "implementation merge must be denied before review completion");
  assert(beforeReview.codes.includes("CODEX_REVIEW_MISSING"));

  const review = { ...exactReview, reviewId: 4892095448, commit: current.headSha, submittedAt: "2026-08-09T18:11:34Z" };
  const comments = [
    comment({ id: 3744746865, severity: "P1", commit: current.headSha, createdAt: review.submittedAt, path: "hooks/use-livekit-chat-call-session.ts" }),
    comment({ id: 3744746868, severity: "P2", commit: current.headSha, createdAt: review.submittedAt, path: "hooks/use-livekit-chat-call-session.ts" }),
    comment({ id: 3744746869, severity: "P1", commit: current.headSha, createdAt: review.submittedAt, path: "docs/assurance/pr-d2a-livekit-mic-membership-convergence-correction-v1.json" }),
    comment({ id: 3744746872, severity: "P2", commit: current.headSha, createdAt: review.submittedAt, path: "hooks/use-livekit-chat-call-session.ts" }),
    comment({ id: 3744746873, severity: "P2", commit: current.headSha, createdAt: review.submittedAt, path: "hooks/use-livekit-chat-call-session.ts" })
  ];
  const threads = comments.map((entry, index) => thread({ id: `PR194_THREAD_${index + 1}`, resolved: false, comments: [entry] }));
  const receipt = buildExactHeadReceipt({ contract, current, review, threads });
  const postTruthAttempt = evaluateExactHeadReceipt({ contract, current, receipt });
  assert.equal(postTruthAttempt.ok, false, "post-truth one minute later must remain denied");
  assert(postTruthAttempt.codes.includes("CODEX_REVIEW_UNRESOLVED_FINDING"));

  const sentinel = detectLateReview({ contract, current, review, threads });
  assert.equal(sentinel.classification, "MERGED_WITH_UNRESOLVED_EXACT_HEAD_REVIEW");
  assert.equal(sentinel.findings.length, 5);
  assert.deepEqual(sentinel.blocks, ["post-merge-completion-claim", "next-implementation", "release", "proof-tier-promotion"]);
});

test("canonical PR 194 sentinel blocks release and preserves every unresolved thread identity", () => {
  const truth = JSON.parse(fs.readFileSync("config/assurance/current-truth-v1.json", "utf8"));
  const sentinels = unresolvedLateReviewSentinels(truth);
  assert.equal(sentinels.length, 1);
  assert.deepEqual(validateLateReviewSentinelState(truth), []);
  assert.deepEqual(sentinels[0].findings.map(({ commentId, threadId, severity }) => ({ commentId, threadId, severity })), [
    { commentId: 3744746865, threadId: "PRRT_kwDORRwZUc6XqB8L", severity: "P1" },
    { commentId: 3744746868, threadId: "PRRT_kwDORRwZUc6XqB8O", severity: "P2" },
    { commentId: 3744746869, threadId: "PRRT_kwDORRwZUc6XqB8P", severity: "P1" },
    { commentId: 3744746872, threadId: "PRRT_kwDORRwZUc6XqB8S", severity: "P2" },
    { commentId: 3744746873, threadId: "PRRT_kwDORRwZUc6XqB8T", severity: "P2" }
  ]);
  const promoted = structuredClone(truth);
  promoted.d2aMicrophoneCorrectionBinding.state = "CORRECTION_MERGED_S0_NEXT_D2A_FROZEN";
  promoted.d2aMicrophoneCorrectionBinding.mayProceed.merge = true;
  assert.deepEqual(validateLateReviewSentinelState(promoted).map(({ id }) => id).sort(), ["LATE_REVIEW_COMPLETION_CLAIM_BLOCKED", "LATE_REVIEW_SUCCESSOR_GATES_INVALID"]);
});

test("workflow executes only the protected default-branch evaluator", () => {
  const workflow = fs.readFileSync(".github/workflows/codex-review-exact-head.yml", "utf8");
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.doesNotMatch(workflow, /github\.event\.pull_request\.head/u);
});
