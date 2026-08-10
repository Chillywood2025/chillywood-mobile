import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildExactHeadReceipt,
  detectLateReview,
  evaluateExactHeadReceipt,
  exactReceiptHash,
  paginateGraphConnection,
  parseLateReviewIssue,
  readOpenLateReviewIssues,
  recordLateReviewIssue
} from "../../scripts/assurance/codex-review-exact-head.mjs";
import { readDurableLateReviewSentinels, unresolvedLateReviewSentinels, validateLateReviewSentinelState } from "../../scripts/assurance/late-review-sentinel.mjs";

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
  body: "P0: 0 P1: 0 P2: 0 P3: 0",
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
const issueComment = ({ id = 2, severity = "P2", commit = headA, createdAt = "2026-08-09T12:05:00Z", marker = true } = {}) => ({
  commentId: id,
  commentNodeId: `ISSUE_COMMENT_${id}`,
  author: "chatgpt-codex-connector",
  body: `${severity} finding${marker ? `\n<!-- codex-review-reviewed-commit:${commit} -->` : ""}`,
  createdAt,
  updatedAt: createdAt
});

test("exact-head no-suggestion review produces a valid current receipt", () => {
  const receipt = buildExactHeadReceipt({ contract, current: baseCurrent, review: exactReview, threads: [] });
  const result = evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt });
  assert.equal(result.ok, true, result.codes.join(","));
  assert.equal(receipt.receiptHash, exactReceiptHash(receipt));
  assert.equal(receipt.reviewedCommit, headA);
  assert.equal(receipt.prHeadTree, treeA);
  assert.equal(receipt.reviewSubmissions[0].bodyHash.length, 64);
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
  const reviewWithFinding = { ...exactReview, body: "P1 body-hash tamper check" };
  const tampered = buildExactHeadReceipt({ contract, current: baseCurrent, review: reviewWithFinding, reviews: [reviewWithFinding], threads: [] });
  tampered.reviewFindings[0].bodyHash = "0".repeat(64);
  assert(evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt: tampered }).codes.includes("CODEX_REVIEW_RECEIPT_INVALID"));
  const cleanBodyTampered = buildExactHeadReceipt({ contract, current: baseCurrent, review: exactReview, reviews: [exactReview], threads: [] });
  cleanBodyTampered.reviewSubmissions[0].bodyHash = "0".repeat(64);
  assert(evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt: cleanBodyTampered }).codes.includes("CODEX_REVIEW_RECEIPT_INVALID"));
});

test("an unresolved P2 thread blocks both the conversation and finding gates", () => {
  const receipt = buildExactHeadReceipt({ contract, current: baseCurrent, review: exactReview, threads: [thread({ resolved: false })] });
  const result = evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt });
  assert.equal(result.ok, false);
  assert(result.codes.includes("CODEX_REVIEW_BLOCKING_THREAD_OPEN"));
  assert(result.codes.includes("CODEX_REVIEW_UNRESOLVED_FINDING"));
});

test("top-level review P0-P2 findings block while P3 remains nonblocking", () => {
  const p1Review = { ...exactReview, body: "P1 top-level finding" };
  const p1Receipt = buildExactHeadReceipt({ contract, current: baseCurrent, review: p1Review, reviews: [p1Review], threads: [] });
  const p1Result = evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt: p1Receipt });
  assert.equal(p1Result.ok, false);
  assert(p1Result.codes.includes("CODEX_REVIEW_UNRESOLVED_FINDING"));
  assert.deepEqual(p1Receipt.reviewFindings.map(({ sourceType, severity, reviewedCommit, disposition }) => ({ sourceType, severity, reviewedCommit, disposition })), [{
    sourceType: "REVIEW_BODY",
    severity: "P1",
    reviewedCommit: headA,
    disposition: "UNRESOLVED"
  }]);
  assert.equal(p1Receipt.reviewFindings[0].bodyHash.length, 64);

  const p3Review = { ...exactReview, body: "P3 nonblocking observation" };
  const p3Receipt = buildExactHeadReceipt({ contract, current: baseCurrent, review: p3Review, reviews: [p3Review], threads: [] });
  assert.equal(evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt: p3Receipt }).ok, true);
});

test("provider issue comments require an exact reviewed-commit marker and block on P0-P2", () => {
  const bound = issueComment();
  const receipt = buildExactHeadReceipt({ contract, current: baseCurrent, review: exactReview, reviews: [exactReview], threads: [], issueComments: [bound] });
  const result = evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt });
  assert.equal(result.ok, false);
  assert(result.codes.includes("CODEX_REVIEW_UNRESOLVED_FINDING"));
  assert.deepEqual(receipt.reviewFindings.map(({ sourceType, severity, reviewedCommit, threadId, affectedPaths }) => ({ sourceType, severity, reviewedCommit, threadId, affectedPaths })), [{
    sourceType: "ISSUE_COMMENT",
    severity: "P2",
    reviewedCommit: headA,
    threadId: null,
    affectedPaths: []
  }]);
  assert.equal(receipt.providerIssueComments[0].bodyHash.length, 64);

  const unbound = issueComment({ id: 3, marker: false });
  const unboundReceipt = buildExactHeadReceipt({ contract, current: baseCurrent, review: exactReview, reviews: [exactReview], threads: [], issueComments: [unbound] });
  const unboundResult = evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt: unboundReceipt });
  assert(unboundResult.codes.includes("CODEX_REVIEW_PROVIDER_COMMENT_HEAD_UNBOUND"));
});

test("resolving a provider finding requires a later exact-head provider rereview", () => {
  const resolvedThread = thread({ resolved: true });
  const premature = buildExactHeadReceipt({ contract, current: baseCurrent, review: exactReview, reviews: [exactReview], threads: [resolvedThread] });
  const prematureResult = evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt: premature });
  assert.equal(prematureResult.ok, false);
  assert(prematureResult.codes.includes("CODEX_REVIEW_UNRESOLVED_FINDING"));
  assert.equal(premature.reviewFindings[0].disposition, "THREAD_RESOLVED_REREVIEW_REQUIRED");

  const rereview = {
    ...exactReview,
    reviewId: 9002,
    body: "No blocking findings",
    startedAt: "2026-08-09T12:10:00Z",
    submittedAt: "2026-08-09T12:15:00Z"
  };
  const closed = buildExactHeadReceipt({ contract, current: baseCurrent, review: rereview, reviews: [exactReview, rereview], threads: [resolvedThread] });
  const closedResult = evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt: closed });
  assert.equal(closedResult.ok, true, closedResult.codes.join(","));
  assert.equal(closed.reviewFindings[0].disposition, "RESOLVED_BY_LATER_PROVIDER_REREVIEW");
});

test("an unread provider metadata page has one exact fail-closed code", () => {
  const receipt = buildExactHeadReceipt({ contract, current: baseCurrent, review: exactReview, threads: [] });
  assert.deepEqual(evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt, readbackIncomplete: true }).codes, [
    "CODEX_REVIEW_READBACK_PAGINATION_INCOMPLETE"
  ]);
});

test("every GraphQL provider surface follows all pages and fails closed at the bound", async () => {
  for (const sourceType of ["REVIEW_BODY", "INLINE_THREAD", "ISSUE_COMMENT"]) {
    const requests = [];
    const nodes = await paginateGraphConnection({
      query: sourceType,
      variables: { first: 100 },
      select: (data) => data.connection,
      token: "token",
      maxPages: 2,
      request: async (_query, variables) => {
        requests.push(variables.after);
        return variables.after === null
          ? { connection: { nodes: [{ id: `${sourceType}:1` }], pageInfo: { hasNextPage: true, endCursor: "page-2" } } }
          : { connection: { nodes: [{ id: `${sourceType}:2` }], pageInfo: { hasNextPage: false, endCursor: null } } };
      }
    });
    assert.deepEqual(nodes.map(({ id }) => id), [`${sourceType}:1`, `${sourceType}:2`]);
    assert.deepEqual(requests, [null, "page-2"]);
  }
  await assert.rejects(
    paginateGraphConnection({
      query: "reviews",
      variables: { first: 100 },
      select: (data) => data.connection,
      token: "token",
      maxPages: 1,
      request: async () => ({ connection: { nodes: [], pageInfo: { hasNextPage: true, endCursor: "truncated" } } })
    }),
    { message: "CODEX_REVIEW_READBACK_PAGINATION_INCOMPLETE" }
  );
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

test("late review detection covers review bodies, inline threads and issue comments", () => {
  const current = {
    ...baseCurrent,
    mergedAt: "2026-08-09T11:45:00Z",
    mergeSha: "e".repeat(40)
  };
  const topLevel = { ...exactReview, body: "P1 top-level late finding" };
  const inline = thread({ resolved: false, comments: [comment({ severity: "P2" })] });
  const general = issueComment({ severity: "P1" });
  const sentinel = detectLateReview({ contract, current, review: topLevel, reviews: [topLevel], threads: [inline], issueComments: [general] });
  assert.deepEqual(sentinel.findings.map(({ sourceType }) => sourceType).sort(), ["INLINE_THREAD", "ISSUE_COMMENT", "REVIEW_BODY"]);
  assert(sentinel.findings.every(({ bodyHash }) => /^[0-9a-f]{64}$/u.test(bodyHash)));
});

test("a review created before merge but submitted after merge is a late finding", () => {
  const current = { ...baseCurrent, mergedAt: "2026-08-09T11:45:00Z", mergeSha: "e".repeat(40) };
  const lateSubmission = {
    ...exactReview,
    body: "P1 submitted after merge",
    createdAt: "2026-08-09T11:30:00Z",
    updatedAt: "2026-08-09T11:30:00Z",
    submittedAt: "2026-08-09T12:00:00Z"
  };
  const sentinel = detectLateReview({ contract, current, review: lateSubmission, reviews: [lateSubmission] });
  assert.equal(sentinel.findings.length, 1);
  assert.equal(sentinel.findings[0].timestamp, lateSubmission.submittedAt);
});

test("durable late-review issue readback includes every state, paginates and fails closed at its bound", async () => {
  const requests = [];
  const request = async (url) => {
    requests.push(url);
    return requests.length === 1
      ? { body: [{ number: 1, title: "first", body: "one", state: "open" }], link: '<https://api.github.test/issues?page=2>; rel="next"' }
      : { body: [{ number: 2, title: "second", body: "two", state: "open" }], link: "" };
  };
  const issues = await readOpenLateReviewIssues("owner/repository", "token", { request, maxPages: 2 });
  assert.deepEqual(issues.map(({ number }) => number), [1, 2]);
  assert(requests.every((url) => url.includes("state=all")));

  await assert.rejects(
    readOpenLateReviewIssues("owner/repository", "token", {
      request: async () => ({ body: [], link: '<https://api.github.test/issues?page=2>; rel="next"' }),
      maxPages: 1
    }),
    { message: "CODEX_REVIEW_READBACK_PAGINATION_INCOMPLETE" }
  );
});

test("durable late-review issue recording is idempotent and never closes issues", async () => {
  const sentinel = {
    prNumber: 201,
    mergeSha: "f".repeat(40),
    findings: [{ sourceType: "REVIEW_BODY", severity: "P1" }]
  };
  const calls = [];
  const request = async (url, _token, init) => {
    calls.push({ url, method: init.method, body: init.body ?? null });
    if (init.method === "GET") return { body: [], link: "" };
    if (url.endsWith("/labels")) return { body: { name: "codex-review-late-sentinel" }, link: "" };
    return { body: { number: 44, title: "created", state: "open" }, link: "" };
  };
  const first = await recordLateReviewIssue({ repository: "owner/repository", token: "token", sentinel, request });
  assert.equal(first.created, true);
  assert.equal(calls.some(({ method }) => method === "PATCH" || method === "DELETE"), false);
  const posted = JSON.parse(calls.find(({ url, method }) => url.endsWith("/issues") && method === "POST").body);
  assert.match(posted.title, /^\[Codex Review Late Sentinel\] PR #201/u);
  assert.deepEqual(posted.labels, ["codex-review-late-sentinel"]);

  const marker = `<!-- codex-review-late-sentinel:v1 pr=201 merge=${sentinel.mergeSha} -->`;
  const idempotentCalls = [];
  const existing = await recordLateReviewIssue({
    repository: "owner/repository",
    token: "token",
    sentinel,
    request: async (_url, _token, init) => {
      idempotentCalls.push(init.method);
      return { body: [{ number: 44, title: "existing", body: marker, state: "open" }], link: "" };
    }
  });
  assert.equal(existing.created, false);
  assert.deepEqual(idempotentCalls, ["GET"]);
});

test("durable sentinel payloads are marker-bound and malformed payloads fail closed", async () => {
  const sentinel = {
    classification: "MERGED_WITH_UNRESOLVED_EXACT_HEAD_REVIEW",
    prNumber: 194,
    mergeSha: "4ee283aa851bb2042a7559a54a1664d6eebcb446",
    findings: [{ disposition: "UNRESOLVED" }]
  };
  const body = `<!-- codex-review-late-sentinel:v1 pr=194 merge=${sentinel.mergeSha} -->\n\n\`\`\`json\n${JSON.stringify(sentinel)}\n\`\`\``;
  assert.deepEqual(parseLateReviewIssue({ body }), sentinel);
  assert.equal(parseLateReviewIssue({ body: body.replace("pr=194", "pr=195") }), null);
  await assert.rejects(
    readDurableLateReviewSentinels("owner/repository", "token", {
      request: async () => ({ body: [{ number: 1, title: "malformed", body: "not a sentinel", state: "open" }], link: "" })
    }),
    { message: "CODEX_REVIEW_RECEIPT_INVALID" }
  );
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
  assert.match(workflow, /pull_request_target:/u);
  assert.doesNotMatch(workflow, /^\s*pull_request:/mu);
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.doesNotMatch(workflow, /github\.event\.pull_request\.head/u);
  assert.match(workflow, /issues: write/u);
});

test("every build and release entrypoint requires durable GitHub late-sentinel readback", () => {
  for (const path of [
    ".github/workflows/ios-production-testflight.yml",
    ".github/workflows/manual-public-v1-release.yml",
    ".github/workflows/ios-preview-build.yml",
    ".github/workflows/phase3a-manual-preview.yml"
  ]) {
    const workflow = fs.readFileSync(path, "utf8");
    assert.match(workflow, /issues: read/u, path);
    assert.match(workflow, /late-review-sentinel\.mjs --require-github/u, path);
    assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/u, path);
  }
});
