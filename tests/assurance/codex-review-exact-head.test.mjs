import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildExactHeadReceipt,
  detectLateReview,
  evaluateExactHeadReceipt,
  exactReceiptHash,
  isReviewOnlyPullRequest,
  lateReviewCorrectionEvidenceHash,
  lateReviewDispositionEvidenceHash,
  normalizeLateReviewEvent,
  paginateGraphConnection,
  parseLateReviewIssue,
  readOpenLateReviewIssues,
  readMergedLateReviewLedgerSentinels,
  readProviderFindingLedger,
  readReviewOnlyLeases,
  readSourcePushLeases,
  recordLateReviewIssue,
  recordProviderFindingLedger,
  recordReviewOnlyLease,
  reviewOnlyLeaseEventAuthorized,
  recordSourcePushLease,
  sourcePushLeaseCheckName,
  verifyLateReviewResolutionGithub
} from "../../scripts/assurance/codex-review-exact-head.mjs";
import { mergeUnresolvedLateReviewSentinels, readDurableLateReviewSentinels, unresolvedLateReviewSentinels, validateLateReviewSentinelState } from "../../scripts/assurance/late-review-sentinel.mjs";
import { createLateReviewResolutionTombstone, lateReviewAllowedOwners, lateReviewResolutionSubjectHash, lateReviewResolutionTombstoneHash } from "../../scripts/assurance/lib.mjs";

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
  baseBranch: "main",
  baseSha: "e".repeat(40),
  latestSourcePushAt: "2026-08-09T11:00:00Z",
  sourcePushLeaseHashes: ["9".repeat(64)],
  mergedAt: null,
  mergeSha: null,
  providerReviewsExist: true,
  reviewOnly: false,
  sharedHeadOpenPrNumbers: [201],
  repositoryWriteActors: ["Chillywood2025"]
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

test("repository write authority is exact and a newly admitted writer fails closed", () => {
  const receipt = buildExactHeadReceipt({ contract, current: baseCurrent, review: exactReview, threads: [] });
  const expanded = { ...baseCurrent, repositoryWriteActors: ["Chillywood2025", "unexpected-writer"] };
  const result = evaluateExactHeadReceipt({ contract, current: expanded, receipt });
  assert.equal(result.ok, false);
  assert(result.codes.includes("CODEX_REVIEW_UNTRUSTED_WRITE_ACTOR"));
});

test("old-head review and a new source commit invalidate the receipt immediately", () => {
  const receipt = buildExactHeadReceipt({ contract, current: baseCurrent, review: exactReview, threads: [] });
  const advanced = { ...baseCurrent, headSha: headB, headTree: treeB, latestSourcePushAt: "2026-08-09T12:30:00Z" };
  const result = evaluateExactHeadReceipt({ contract, current: advanced, receipt });
  assert.equal(result.ok, false);
  assert(result.codes.includes("CODEX_REVIEW_STALE_HEAD"));
  assert(result.codes.includes("CODEX_REVIEW_INCOMPLETE"));
});

test("missing source admission and a changed diff base invalidate review eligibility", () => {
  const receipt = buildExactHeadReceipt({ contract, current: baseCurrent, review: exactReview, threads: [] });
  const missingLease = evaluateExactHeadReceipt({ contract, current: { ...baseCurrent, sourcePushLeaseHashes: [] }, receipt });
  assert.equal(missingLease.ok, false);
  assert(missingLease.codes.includes("CODEX_REVIEW_INCOMPLETE"));
  const changedBase = evaluateExactHeadReceipt({
    contract,
    current: { ...baseCurrent, baseSha: "f".repeat(40) },
    receipt
  });
  assert.equal(changedBase.ok, false);
  assert(changedBase.codes.includes("CODEX_REVIEW_STALE_BASE"));
});

test("exact-head PASS requires one open PR to own the head", () => {
  const singletonReceipt = buildExactHeadReceipt({ contract, current: baseCurrent, review: exactReview, threads: [] });
  assert.equal(evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt: singletonReceipt }).ok, true);

  const ambiguous = { ...baseCurrent, sharedHeadOpenPrNumbers: [201, 999] };
  const ambiguousReceipt = buildExactHeadReceipt({ contract, current: ambiguous, review: exactReview, threads: [] });
  const result = evaluateExactHeadReceipt({ contract, current: ambiguous, receipt: ambiguousReceipt });
  assert.equal(result.ok, false);
  assert(result.codes.includes("CODEX_REVIEW_SHARED_HEAD_AMBIGUOUS"));
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

  const informational = { ...unbound, commentId: 4, commentNodeId: "IC_4", body: "Review queued; no disposition yet." };
  const informationalReceipt = buildExactHeadReceipt({ contract, current: baseCurrent, review: exactReview, reviews: [exactReview], threads: [], issueComments: [informational] });
  assert.equal(evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt: informationalReceipt }).ok, true);
  const p3 = { ...unbound, commentId: 5, commentNodeId: "IC_5", body: "P3 informational note" };
  const p3Receipt = buildExactHeadReceipt({ contract, current: baseCurrent, review: exactReview, reviews: [exactReview], threads: [], issueComments: [p3] });
  assert.equal(evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt: p3Receipt }).ok, true);
});

test("an append-only unbound provider issue finding cannot disappear from mutable issue-comment readback", () => {
  const persistent = normalizeLateReviewEvent({
    eventName: "issue_comment",
    event: {
      action: "created",
      comment: {
        id: 6001,
        node_id: "ISSUE_6001",
        user: { login: "chatgpt-codex-connector" },
        body: "P1 provider issue finding without a reviewed-head marker",
        created_at: "2026-08-09T11:45:00Z",
        updated_at: "2026-08-09T11:45:00Z"
      }
    },
    contract
  });
  const receipt = buildExactHeadReceipt({
    contract,
    current: baseCurrent,
    review: exactReview,
    reviews: [exactReview],
    threads: [],
    issueComments: [],
    persistentFindings: [persistent]
  });
  const result = evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt });
  assert.equal(result.ok, false);
  assert(result.codes.includes("CODEX_REVIEW_PROVIDER_COMMENT_HEAD_UNBOUND"));
  assert(result.codes.includes("CODEX_REVIEW_UNRESOLVED_FINDING"));
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
    body: `<!-- codex-review-disposition:blocking-findings-resolved reviewed-commit:${headA} -->`,
    startedAt: "2026-08-09T12:10:00Z",
    submittedAt: "2026-08-09T12:15:00Z"
  };
  const closed = buildExactHeadReceipt({ contract, current: baseCurrent, review: rereview, reviews: [exactReview, rereview], threads: [resolvedThread] });
  const closedResult = evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt: closed });
  assert.equal(closedResult.ok, true, closedResult.codes.join(","));
  assert.equal(closed.reviewFindings[0].disposition, "RESOLVED_BY_LATER_PROVIDER_REREVIEW");

  const ambiguousRereview = { ...rereview, body: "Review still in progress; disposition not established." };
  const ambiguous = buildExactHeadReceipt({ contract, current: baseCurrent, review: ambiguousRereview, reviews: [exactReview, ambiguousRereview], threads: [resolvedThread] });
  const ambiguousResult = evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt: ambiguous });
  assert.equal(ambiguousResult.ok, false);
  assert(ambiguousResult.codes.includes("CODEX_REVIEW_UNRESOLVED_FINDING"));
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
  for (const pageInfo of [undefined, {}, { hasNextPage: null, endCursor: null }]) {
    await assert.rejects(
      paginateGraphConnection({
        query: "reviews",
        variables: { first: 100 },
        select: (data) => data.connection,
        token: "token",
        maxPages: 2,
        request: async () => ({ connection: { nodes: [{ id: 1 }], ...(pageInfo === undefined ? {} : { pageInfo }) } })
      }),
      { message: "CODEX_REVIEW_READBACK_PAGINATION_INCOMPLETE" }
    );
  }
});

test("every synchronize event creates an exact append-only source-push lease", async () => {
  let posted;
  const recorded = await recordSourcePushLease({
    repository: baseCurrent.repository,
    prNumber: baseCurrent.prNumber,
    headSha: headA,
    baseBranch: baseCurrent.baseBranch,
    baseSha: baseCurrent.baseSha,
    pushedAt: "2026-08-09T12:20:00Z",
    token: "token",
    request: async (_url, _token, init) => {
      posted = JSON.parse(init.body);
      return { body: { id: 55 }, link: "" };
    }
  });
  assert.equal(posted.name, sourcePushLeaseCheckName);
  assert.equal(posted.head_sha, headA);
  assert.equal(posted.conclusion, "neutral");
  const check = {
    ...posted,
    head_sha: posted.head_sha,
    app: { slug: "github-actions" }
  };
  const leases = await readSourcePushLeases(baseCurrent.repository, baseCurrent.prNumber, headA, "token", {
    request: async () => ({ body: { total_count: 1, check_runs: [check] }, link: "" })
  });
  assert.deepEqual(leases, [recorded.payload]);

  const repeated = { ...recorded.payload, pushedAt: "2026-08-09T12:30:00Z" };
  const receipt = buildExactHeadReceipt({ contract, current: { ...baseCurrent, latestSourcePushAt: recorded.payload.pushedAt, sourcePushLeaseHashes: [recorded.payload.digest] }, review: exactReview, threads: [] });
  const invalidated = evaluateExactHeadReceipt({
    contract,
    current: { ...baseCurrent, latestSourcePushAt: repeated.pushedAt, sourcePushLeaseHashes: ["f".repeat(64)] },
    receipt
  });
  assert.equal(invalidated.ok, false);
  assert(invalidated.codes.includes("CODEX_REVIEW_INCOMPLETE"));

  await assert.rejects(
    readSourcePushLeases(baseCurrent.repository, baseCurrent.prNumber, headA, "token", {
      request: async () => ({ body: { total_count: 2, check_runs: [check] }, link: "" })
    }),
    { message: "CODEX_REVIEW_READBACK_PAGINATION_INCOMPLETE" }
  );
  const altered = structuredClone(check);
  altered.output.summary = altered.output.summary.replace(recorded.payload.pushedAt, "2026-08-09T12:21:00Z");
  await assert.rejects(
    readSourcePushLeases(baseCurrent.repository, baseCurrent.prNumber, headA, "token", {
      request: async () => ({ body: { total_count: 1, check_runs: [altered] }, link: "" })
    }),
    { message: "CODEX_REVIEW_SOURCE_PUSH_LEASE_INVALID" }
  );
});

test("source-push leases isolate two PRs sharing the same head", async () => {
  const checks = [];
  for (const prNumber of [201, 999]) {
    await recordSourcePushLease({
      repository: baseCurrent.repository,
      prNumber,
      headSha: headA,
      baseBranch: baseCurrent.baseBranch,
      baseSha: baseCurrent.baseSha,
      pushedAt: `2026-08-09T12:${prNumber === 201 ? "20" : "21"}:00Z`,
      token: "token",
      request: async (_url, _token, init) => {
        checks.push({ ...JSON.parse(init.body), app: { slug: "github-actions" } });
        return { body: { id: prNumber }, link: "" };
      }
    });
  }
  const leases = await readSourcePushLeases(baseCurrent.repository, 201, headA, "token", {
    request: async () => ({ body: { total_count: checks.length, check_runs: checks }, link: "" })
  });
  assert.equal(leases.length, 1);
  assert.equal(leases[0].prNumber, 201);
});

test("provider finding events persist in a hash-bound append-only ledger until explicit exact-head rereview", async () => {
  const finding = normalizeLateReviewEvent({
    eventName: "pull_request_review",
    event: {
      action: "submitted",
      review: {
        id: 7001,
        node_id: "REVIEW_7001",
        user: { login: "chatgpt-codex-connector" },
        state: "commented",
        body: "P1 original blocking review",
        commit_id: headA,
        submitted_at: "2026-08-09T11:30:00Z"
      }
    },
    contract,
    observedAt: "2026-08-09T11:30:00Z"
  });
  let posted;
  const recorded = await recordProviderFindingLedger({
    repository: baseCurrent.repository,
    prNumber: baseCurrent.prNumber,
    headSha: headA,
    finding,
    token: "token",
    request: async (_url, _token, init) => {
      posted = JSON.parse(init.body);
      return { body: { id: 81 }, link: "" };
    }
  });
  const check = { ...posted, app: { slug: "github-actions" } };
  const ledger = await readProviderFindingLedger(baseCurrent.repository, baseCurrent.prNumber, headA, "token", {
    request: async () => ({ body: { total_count: 1, check_runs: [check] }, link: "" })
  });
  assert.deepEqual(ledger, [recorded.payload.finding]);

  const mutableCleanReview = { ...exactReview, reviewId: finding.sourceId, body: "clean replacement" };
  const blockedReceipt = buildExactHeadReceipt({
    contract,
    current: baseCurrent,
    review: mutableCleanReview,
    reviews: [mutableCleanReview],
    threads: [],
    persistentFindings: ledger
  });
  assert(evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt: blockedReceipt }).codes.includes("CODEX_REVIEW_UNRESOLVED_FINDING"));

  const rereview = {
    ...exactReview,
    reviewId: 7002,
    state: "APPROVED",
    body: "Exact-head blocking findings resolved",
    submittedAt: "2026-08-09T12:30:00Z"
  };
  const resolvedReceipt = buildExactHeadReceipt({
    contract,
    current: baseCurrent,
    review: rereview,
    reviews: [mutableCleanReview, rereview],
    threads: [],
    persistentFindings: ledger
  });
  assert.equal(evaluateExactHeadReceipt({ contract, current: baseCurrent, receipt: resolvedReceipt }).ok, true);

  const tampered = structuredClone(check);
  tampered.output.summary = tampered.output.summary.replace(finding.bodyHash, "0".repeat(64));
  await assert.rejects(
    readProviderFindingLedger(baseCurrent.repository, baseCurrent.prNumber, headA, "token", {
      request: async () => ({ body: { total_count: 1, check_runs: [tampered] }, link: "" })
    }),
    { message: "CODEX_REVIEW_FINDING_LEDGER_INVALID" }
  );
});

test("provider finding ledgers isolate two PRs sharing the same head", async () => {
  const checks = [];
  for (const prNumber of [201, 999]) {
    const finding = normalizeLateReviewEvent({
      eventName: "pull_request_review",
      event: {
        action: "submitted",
        review: {
          id: 8000 + prNumber,
          node_id: `REVIEW_${prNumber}`,
          user: { login: "chatgpt-codex-connector" },
          state: "commented",
          body: `P1 finding for PR ${prNumber}`,
          commit_id: headA,
          submitted_at: "2026-08-09T11:30:00Z"
        }
      },
      contract,
      observedAt: "2026-08-09T11:30:00Z"
    });
    await recordProviderFindingLedger({
      repository: baseCurrent.repository,
      prNumber,
      headSha: headA,
      finding,
      token: "token",
      request: async (_url, _token, init) => {
        checks.push({ ...JSON.parse(init.body), app: { slug: "github-actions" } });
        return { body: { id: prNumber }, link: "" };
      }
    });
  }
  const findings = await readProviderFindingLedger(baseCurrent.repository, 201, headA, "token", {
    request: async () => ({ body: { total_count: checks.length, check_runs: checks }, link: "" })
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].sourceId, 8201);
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
  assert.equal(isReviewOnlyPullRequest({
    headBranch: "codex/ordinary",
    labels: [],
    reviewOnlyLeasePresent: true,
    truthEntries: [],
    prNumber: 300
  }), true, "removing the mutable label cannot clear the append-only lease");
  assert.equal(isReviewOnlyPullRequest({
    headBranch: "codex/assurance-review-only/final-a1-lane",
    labels: [],
    reviewOnlyLeasePresent: false,
    truthEntries: [],
    prNumber: 301
  }), true, "the canonical review-only branch prefix is independently fail closed");
});

test("review-only classification remains PR-scoped across a branch rename and every future head", async () => {
  let posted;
  const recorded = await recordReviewOnlyLease({
    repository: baseCurrent.repository,
    prNumber: 301,
    headSha: headA,
    headBranch: "codex/assurance-review-only/a1-lane",
    token: "token",
    request: async (_url, _token, init) => {
      posted = JSON.parse(init.body);
      return { body: { id: 82 }, link: "" };
    }
  });
  assert.equal(posted.head_sha, contract.reviewOnlyClassification.registryAnchorSha);
  const leases = await readReviewOnlyLeases(baseCurrent.repository, 301, headB, "token", {
    request: async () => ({ body: { total_count: 1, check_runs: [{ ...posted, app: { slug: "github-actions" } }] }, link: "" })
  });
  assert.deepEqual(leases, [recorded.payload]);
  assert.equal(isReviewOnlyPullRequest({
    headBranch: "codex/renamed-ordinary-looking-branch",
    reviewOnlyLeasePresent: leases.length > 0,
    truthEntries: [],
    prNumber: 301
  }), true);
});

test("review-only registry validates every PR independently and rejects fork-prefix poisoning", async () => {
  const posted = [];
  for (const [prNumber, classifiedHeadSha] of [[301, headA], [302, headB]]) {
    await recordReviewOnlyLease({
      repository: baseCurrent.repository,
      prNumber,
      headSha: classifiedHeadSha,
      headBranch: `codex/assurance-review-only/lane-${prNumber}`,
      token: "token",
      request: async (_url, _token, init) => {
        posted.push({ ...JSON.parse(init.body), app: { slug: "github-actions" } });
        return { body: { id: prNumber }, link: "" };
      }
    });
  }
  const leases = await readReviewOnlyLeases(baseCurrent.repository, 301, headA, "token", {
    request: async () => ({ body: { total_count: 2, check_runs: posted }, link: "" })
  });
  assert.equal(leases.length, 1);
  assert.equal(leases[0].prNumber, 301);

  const trustedEvent = {
    pull_request: {
      user: { login: "Chillywood2025" },
      head: { repo: { full_name: baseCurrent.repository, owner: { login: "Chillywood2025" } } }
    }
  };
  assert.equal(reviewOnlyLeaseEventAuthorized({
    repository: baseCurrent.repository,
    event: trustedEvent,
    current: { repositoryWriteActors: ["Chillywood2025"] },
    contract
  }), true);
  assert.equal(reviewOnlyLeaseEventAuthorized({
    repository: baseCurrent.repository,
    event: {
      pull_request: {
        user: { login: "fork-author" },
        head: { repo: { full_name: "fork-author/chillywood-mobile", owner: { login: "fork-author" } } }
      }
    },
    current: { repositoryWriteActors: ["Chillywood2025"] },
    contract
  }), false);
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

test("a pending inline finding becomes late when its parent review is submitted after merge", () => {
  const current = { ...baseCurrent, mergedAt: "2026-08-09T11:45:00Z", mergeSha: "e".repeat(40) };
  const pendingComment = {
    ...comment({ severity: "P1", createdAt: "2026-08-09T11:30:00Z" }),
    updatedAt: "2026-08-09T11:30:00Z",
    submittedAt: "2026-08-09T12:00:00Z",
    reviewCommit: headA,
    reviewId: 999
  };
  const sentinel = detectLateReview({ contract, current, threads: [thread({ resolved: false, comments: [pendingComment] })] });
  assert.equal(sentinel.findings.length, 1);
  assert.equal(sentinel.findings[0].timestamp, pendingComment.submittedAt);
});

test("edited or deleted late event bodies remain append-only sentinel evidence", () => {
  const current = { ...baseCurrent, mergedAt: "2026-08-09T11:45:00Z", mergeSha: "e".repeat(40) };
  for (const action of ["edited", "deleted"]) {
    const event = {
      action,
      changes: action === "edited" ? { body: { from: "P1 late event finding" } } : undefined,
      comment: {
        id: 88,
        node_id: `NODE_${action}`,
        user: { login: "chatgpt-codex-connector" },
        body: action === "edited" ? "clean replacement" : "P1 late event finding",
        created_at: "2026-08-09T11:30:00Z",
        updated_at: "2026-08-09T11:40:00Z",
        commit_id: headA,
        path: "scripts/assurance/lib.mjs"
      }
    };
    const eventFinding = normalizeLateReviewEvent({
      eventName: "pull_request_review_comment",
      event,
      contract,
      observedAt: "2026-08-09T12:01:00Z"
    });
    const sentinel = detectLateReview({ contract, current, eventFindings: [eventFinding] });
    assert.equal(sentinel.findings.length, 1, action);
    assert.equal(sentinel.findings[0].bodyHash, eventFinding.bodyHash);
  }
});

test("merged-PR recovery reads inline and issue-comment surfaces even when the event ledger is empty", async () => {
  const mergedAt = "2026-08-09T11:45:00Z";
  const graphRequestFn = async (query) => {
    if (query.includes("pullRequests(states:MERGED")) {
      return { repository: { pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{
        number: 201,
        mergedAt,
        mergeCommit: { oid: "e".repeat(40) },
        headRefName: baseCurrent.headBranch,
        headRefOid: headA,
        commits: { nodes: [{ commit: { oid: headA, tree: { oid: treeA } } }] }
      }] } } };
    }
    if (query.includes("reviewThreads")) {
      return { repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{
        id: "THREAD_GLOBAL",
        isResolved: false,
        comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{
          databaseId: 8101,
          id: "INLINE_GLOBAL",
          author: { login: "chatgpt-codex-connector" },
          body: "P1 global inline recovery",
          createdAt: "2026-08-09T12:00:00Z",
          updatedAt: "2026-08-09T12:00:00Z",
          path: "scripts/assurance/lib.mjs",
          commit: { oid: headA },
          pullRequestReview: { databaseId: 8100, submittedAt: "2026-08-09T12:00:00Z", commit: { oid: headA } }
        }] }
      }] } } } };
    }
    if (query.includes("reviews(first")) {
      return { repository: { pullRequest: { reviews: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] } } } };
    }
    if (query.includes("comments(first")) {
      return { repository: { pullRequest: { comments: { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [{
        databaseId: 8201,
        id: "ISSUE_GLOBAL",
        author: { login: "chatgpt-codex-connector" },
        body: `P2 global issue recovery\n<!-- codex-review-reviewed-commit:${headA} -->`,
        createdAt: "2026-08-09T12:01:00Z",
        updatedAt: "2026-08-09T12:01:00Z"
      }] } } } };
    }
    throw new Error(`unexpected graph query: ${query}`);
  };
  const sentinels = await readMergedLateReviewLedgerSentinels(baseCurrent.repository, "token", {
    contract,
    graphRequestFn,
    request: async () => ({ body: { total_count: 0, check_runs: [] }, link: "" })
  });
  assert.equal(sentinels.length, 1);
  assert.deepEqual(sentinels[0].findings.map(({ sourceType, severity }) => ({ sourceType, severity })), [
    { sourceType: "INLINE_THREAD", severity: "P1" },
    { sourceType: "ISSUE_COMMENT", severity: "P2" }
  ]);
});

test("a clean review submitted after merge cannot erase an append-only late finding on the merged PR", () => {
  const current = { ...baseCurrent, mergedAt: "2026-08-09T11:45:00Z", mergeSha: "e".repeat(40) };
  const persistent = normalizeLateReviewEvent({
    eventName: "pull_request_review",
    event: {
      action: "submitted",
      review: {
        id: 8301,
        node_id: "REVIEW_8301",
        user: { login: "chatgpt-codex-connector" },
        body: "P1 late immutable finding",
        commit_id: headA,
        submitted_at: "2026-08-09T12:00:00Z"
      }
    },
    contract
  });
  const postMergeClean = { ...exactReview, reviewId: 8302, state: "APPROVED", submittedAt: "2026-08-09T12:30:00Z" };
  const sentinel = detectLateReview({ contract, current, reviews: [postMergeClean], persistentFindings: [persistent] });
  assert.equal(sentinel.findings.length, 1);
  assert.equal(sentinel.findings[0].disposition, "UNRESOLVED");
});

test("delivery delay alone cannot relabel a pre-merge finding as post-merge", () => {
  const current = { ...baseCurrent, mergedAt: "2026-08-09T11:45:00Z", mergeSha: "e".repeat(40) };
  const eventFinding = normalizeLateReviewEvent({
    eventName: "issue_comment",
    event: {
      action: "created",
      comment: {
        id: 91,
        node_id: "NODE_DELAYED_CREATED",
        user: { login: "chatgpt-codex-connector" },
        body: `P1 pre-merge finding\n<!-- codex-review-reviewed-commit:${headA} -->`,
        created_at: "2026-08-09T11:40:00Z",
        updated_at: "2026-08-09T11:40:00Z"
      }
    },
    contract,
    observedAt: "2026-08-09T12:01:00Z"
  });
  assert.equal(eventFinding.updatedAt, "2026-08-09T11:40:00Z");
  assert.equal(detectLateReview({ contract, current, eventFindings: [eventFinding] }), null);
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
    classification: "MERGED_WITH_UNRESOLVED_EXACT_HEAD_REVIEW",
    prNumber: 201,
    mergeSha: "f".repeat(40),
    findings: [{ sourceType: "REVIEW_BODY", sourceId: 91, bodyHash: "1".repeat(64), severity: "P1", disposition: "UNRESOLVED" }]
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
  const existingBody = `${marker}\n\n\`\`\`json\n${JSON.stringify(sentinel)}\n\`\`\``;
  const idempotentCalls = [];
  const existing = await recordLateReviewIssue({
    repository: "owner/repository",
    token: "token",
    sentinel,
    request: async (_url, _token, init) => {
      idempotentCalls.push(init.method);
      return { body: [{ number: 44, title: "existing", body: existingBody, state: "open" }], link: "" };
    }
  });
  assert.equal(existing.created, false);
  assert.deepEqual(idempotentCalls, ["GET"]);

  const appended = {
    ...sentinel,
    findings: [{ sourceType: "ISSUE_COMMENT", sourceId: 92, bodyHash: "2".repeat(64), severity: "P2", disposition: "UNRESOLVED" }]
  };
  const appendCalls = [];
  const appendedResult = await recordLateReviewIssue({
    repository: "owner/repository",
    token: "token",
    sentinel: appended,
    request: async (_url, _token, init) => {
      appendCalls.push({ method: init.method, body: init.body ?? null });
      if (init.method === "GET") return { body: [{ number: 44, title: "existing", body: existingBody, state: "open" }], link: "" };
      return { body: { number: 44, title: "updated", body: JSON.parse(init.body).body, state: "open" }, link: "" };
    }
  });
  assert.equal(appendedResult.updated, true);
  assert.equal(parseLateReviewIssue({ body: appendedResult.issue.body }).findings.length, 2);
  assert.equal(appendCalls.some(({ method }) => method === "PATCH"), true);
});

test("a durable sentinel accepts only a typed exact-head correction transition", async () => {
  const successorHead = "1".repeat(40);
  const successorTree = "2".repeat(40);
  const sentinel = {
    classification: "MERGED_WITH_UNRESOLVED_EXACT_HEAD_REVIEW",
    prNumber: 194,
    mergeSha: "3".repeat(40),
    successorCorrectionOwner: "codex/product-successor",
    findings: [{
      sourceId: 77,
      threadId: "THREAD_77",
      disposition: "RESOLVED",
      threadResolutionState: "RESOLVED"
    }],
    resolutionEvidence: {
      schemaVersion: 1,
      successorPr: 203,
      successorBranch: "codex/product-successor",
      successorHead,
      successorTree,
      successorMergeSha: "4".repeat(40),
      successorMergedAt: "2026-08-10T02:45:00Z",
      correctedSourceIds: [77],
      resolvedThreadIds: ["THREAD_77"],
      allThreadsResolved: true,
      githubThreadResolutionReadbackAt: "2026-08-10T03:00:00Z",
      exactHeadReviewedCommit: successorHead,
      exactHeadReviewedTree: successorTree,
      exactHeadReviewReceiptHash: "5".repeat(64),
      exactHeadCheckRunId: 9002,
      exactHeadReviewCompletedAt: "2026-08-10T02:30:00Z",
      correctionEvidenceHash: "6".repeat(64),
      dispositionEvidenceHash: "7".repeat(64),
      verificationSubjectHash: "8".repeat(64),
      repositoryVerificationHash: "9".repeat(64),
      completedAt: "2026-08-10T03:05:00Z"
    }
  };
  sentinel.resolutionEvidence.verificationSubjectHash = lateReviewResolutionSubjectHash(sentinel);
  const resolutionVerifier = async ({ sentinel: candidate }) => ({
    ok: true,
    subjectHash: lateReviewResolutionSubjectHash(candidate),
    repositoryVerificationHash: candidate.resolutionEvidence.repositoryVerificationHash
  });
  const marker = `<!-- codex-review-late-sentinel:v1 pr=194 merge=${sentinel.mergeSha} -->`;
  const calls = [];
  const result = await recordLateReviewIssue({
    repository: "owner/repository",
    token: "token",
    sentinel,
    resolutionVerifier,
    request: async (url, _token, init) => {
      calls.push({ url, method: init.method, body: init.body ?? null });
      if (init.method === "GET") return { body: [{ number: 77, title: "existing", body: marker, state: "open" }], link: "" };
      return { body: { number: 77, title: "updated", body: JSON.parse(init.body).body, state: "open" }, link: "" };
    }
  });
  assert.equal(result.updated, true);
  const patchCall = calls.find(({ method }) => method === "PATCH");
  assert(patchCall);
  assert.equal(Object.hasOwn(JSON.parse(patchCall.body), "state"), false);
  assert.deepEqual(parseLateReviewIssue({ body: result.issue.body }), sentinel);

  const forged = structuredClone(sentinel);
  forged.resolutionEvidence.exactHeadReviewedCommit = headA;
  await assert.rejects(
    recordLateReviewIssue({
      repository: "owner/repository",
      token: "token",
      sentinel: forged,
      resolutionVerifier,
      request: async (_url, _token, init) => ({ body: init.method === "GET" ? [{ number: 77, title: "existing", body: marker, state: "open" }] : {}, link: "" })
    }),
    { message: "CODEX_REVIEW_RECEIPT_INVALID" }
  );
});

test("GitHub resolution readback recomputes the successor diff, full exact-head receipt and original dispositions", async () => {
  const repository = "Chillywood2025/chillywood-mobile";
  const successorPr = 203;
  const successorHead = "1".repeat(40);
  const successorTree = "2".repeat(40);
  const successorMergeSha = "3".repeat(40);
  const successorBase = "4".repeat(40);
  const pushedAt = "2026-08-10T01:00:00Z";
  let sourceLeaseBody;
  const recordedLease = await recordSourcePushLease({
    repository,
    prNumber: successorPr,
    headSha: successorHead,
    baseBranch: "main",
    baseSha: successorBase,
    pushedAt,
    token: "token",
    request: async (_url, _token, init) => {
      sourceLeaseBody = JSON.parse(init.body);
      return { body: { id: 9100, ...sourceLeaseBody, app: { slug: "github-actions" } }, link: "" };
    }
  });
  const successorCurrent = {
    repository,
    prNumber: successorPr,
    headSha: successorHead,
    headTree: successorTree,
    baseBranch: "main",
    baseSha: successorBase,
    latestSourcePushAt: pushedAt,
    sourcePushLeaseHashes: [recordedLease.payload.digest],
    mergedAt: "2026-08-10T02:45:00Z",
    mergeSha: successorMergeSha,
    providerReviewsExist: true,
    reviewOnly: false,
    lateReviewBlocked: false,
    sharedHeadOpenPrNumbers: [successorPr],
    repositoryWriteActors: ["Chillywood2025"]
  };
  const successorReview = {
    ...exactReview,
    reviewId: 9200,
    commit: successorHead,
    startedAt: "2026-08-10T01:30:00Z",
    submittedAt: "2026-08-10T02:00:00Z"
  };
  const receipt = buildExactHeadReceipt({ contract, current: successorCurrent, review: successorReview, threads: [] });
  const files = [{
    filename: "hooks/use-livekit-chat-call-session.ts",
    status: "modified",
    sha: "5".repeat(40),
    additions: 20,
    deletions: 5,
    changes: 25
  }];
  const sentinel = {
    classification: "MERGED_WITH_UNRESOLVED_EXACT_HEAD_REVIEW",
    repository,
    prNumber: 194,
    mergeSha: "4ee283aa851bb2042a7559a54a1664d6eebcb446",
    successorCorrectionOwner: "codex/d2a-livekit-mic-post-merge-review-correction",
    assuranceControlOwner: "codex/assurance-active-task-and-claim-freshness-a1",
    authorizedBootstrapOwners: [
      "codex/assurance-active-task-and-claim-freshness-a1",
      "codex/assurance-codex-security-scan-reliability-s0"
    ],
    findings: [{
      sourceType: "INLINE_THREAD",
      sourceId: 3744746865,
      bodyHash: "6".repeat(64),
      severity: "P1",
      threadId: "THREAD_ORIGINAL",
      disposition: "RESOLVED",
      threadResolutionState: "RESOLVED"
    }],
    resolutionEvidence: {
      schemaVersion: 1,
      successorPr,
      successorBranch: "codex/d2a-livekit-mic-post-merge-review-correction",
      successorHead,
      successorTree,
      successorMergeSha,
      successorMergedAt: successorCurrent.mergedAt,
      correctedSourceIds: [3744746865],
      resolvedThreadIds: ["THREAD_ORIGINAL"],
      allThreadsResolved: true,
      githubThreadResolutionReadbackAt: "2026-08-10T03:00:00Z",
      exactHeadReviewedCommit: successorHead,
      exactHeadReviewedTree: successorTree,
      exactHeadReviewReceiptHash: receipt.receiptHash,
      exactHeadCheckRunId: 9300,
      exactHeadReviewCompletedAt: receipt.reviewCompletedAt,
      correctionEvidenceHash: lateReviewCorrectionEvidenceHash({
        repository,
        successorPr,
        baseSha: successorBase,
        successorHead,
        successorTree,
        successorMergeSha,
        files
      }),
      dispositionEvidenceHash: "7".repeat(64),
      verificationSubjectHash: "8".repeat(64),
      repositoryVerificationHash: "9".repeat(64),
      completedAt: "2026-08-10T03:05:00Z"
    }
  };
  sentinel.resolutionEvidence.dispositionEvidenceHash = lateReviewDispositionEvidenceHash({
    repository,
    sentinel,
    exactHeadReceiptHash: receipt.receiptHash,
    resolvedThreadIds: ["THREAD_ORIGINAL"]
  });
  sentinel.resolutionEvidence.verificationSubjectHash = lateReviewResolutionSubjectHash(sentinel);
  const exactCheck = {
    id: 9300,
    name: contract.checkName,
    status: "completed",
    conclusion: "success",
    head_sha: successorHead,
    app: { slug: "github-actions" },
    external_id: receipt.receiptHash,
    output: { text: JSON.stringify({ codes: [], receipt }) }
  };
  const sourceLeaseCheck = { id: 9100, ...sourceLeaseBody, app: { slug: "github-actions" } };
  const request = async (url) => {
    if (url.endsWith(`/pulls/${successorPr}`)) return { body: {
      merged: true,
      head: { ref: sentinel.successorCorrectionOwner, sha: successorHead },
      base: { ref: "main", sha: successorBase },
      merge_commit_sha: successorMergeSha,
      merged_at: successorCurrent.mergedAt
    }, link: "" };
    if (url.endsWith(`/git/commits/${successorHead}`)) return { body: { tree: { sha: successorTree } }, link: "" };
    if (url.includes(`/pulls/${successorPr}/files`)) return { body: files, link: "" };
    if (url.includes(`/commits/${successorHead}/pulls`)) return { body: [], link: "" };
    if (url.includes(encodeURIComponent(contract.checkName))) return { body: { total_count: 1, check_runs: [exactCheck] }, link: "" };
    if (url.includes(encodeURIComponent(sourcePushLeaseCheckName))) return { body: { total_count: 1, check_runs: [sourceLeaseCheck] }, link: "" };
    throw new Error(`unexpected request ${url}`);
  };
  const graphRequestFn = async () => ({ repository: { pullRequest: { reviewThreads: {
    pageInfo: { hasNextPage: false, endCursor: null },
    nodes: [{ id: "THREAD_ORIGINAL", isResolved: true }]
  } } } });
  const verified = await verifyLateReviewResolutionGithub({ repository, token: "token", sentinel, request, graphRequestFn });
  assert.equal(verified.ok, true, verified.reason);
  sentinel.resolutionEvidence.repositoryVerificationHash = verified.repositoryVerificationHash;
  assert.equal(lateReviewResolutionSubjectHash(sentinel), sentinel.resolutionEvidence.verificationSubjectHash);

  const forgedCorrection = structuredClone(sentinel);
  forgedCorrection.resolutionEvidence.correctionEvidenceHash = "a".repeat(64);
  assert.equal((await verifyLateReviewResolutionGithub({ repository, token: "token", sentinel: forgedCorrection, request, graphRequestFn })).reason, "CORRECTION_EVIDENCE");
  const forgedDisposition = structuredClone(sentinel);
  forgedDisposition.resolutionEvidence.dispositionEvidenceHash = "b".repeat(64);
  assert.equal((await verifyLateReviewResolutionGithub({ repository, token: "token", sentinel: forgedDisposition, request, graphRequestFn })).reason, "DISPOSITION_EVIDENCE");
  const minimalReceipt = structuredClone(exactCheck);
  minimalReceipt.output.text = JSON.stringify({ codes: [], receipt: {
    receiptHash: receipt.receiptHash,
    repository,
    prNumber: successorPr,
    prHeadSha: successorHead,
    prHeadTree: successorTree,
    reviewedCommit: successorHead,
    reviewCompletedAt: receipt.reviewCompletedAt
  } });
  const minimalRequest = async (url) => url.includes(encodeURIComponent(contract.checkName))
    ? { body: { total_count: 1, check_runs: [minimalReceipt] }, link: "" }
    : request(url);
  assert.equal((await verifyLateReviewResolutionGithub({ repository, token: "token", sentinel, request: minimalRequest, graphRequestFn })).reason, "EXACT_HEAD_RECEIPT");
  const aliasRequest = async (url) => url.includes(`/commits/${successorHead}/pulls`)
    ? { body: [{ number: 999, state: "open", head: { sha: successorHead } }], link: "" }
    : request(url);
  assert.match(
    (await verifyLateReviewResolutionGithub({ repository, token: "token", sentinel, request: aliasRequest, graphRequestFn })).reason,
    /CODEX_REVIEW_SHARED_HEAD_AMBIGUOUS/u
  );
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

test("only an independently verified durable resolution clears the same canonical and global sentinel", () => {
  const finding = { sourceType: "INLINE_THREAD", sourceId: 1, bodyHash: "a".repeat(64), threadId: "thread-1", severity: "P1", disposition: "RESOLVED" };
  const sentinel = { repository: "owner/repository", prNumber: 194, mergeSha: "4".repeat(40), findings: [finding] };
  assert.equal(mergeUnresolvedLateReviewSentinels({
    globalLedgerSentinels: [sentinel],
    canonicalSentinels: [sentinel],
    durable: [{ sentinel, resolutionVerified: true }]
  }).length, 0);
  assert.equal(mergeUnresolvedLateReviewSentinels({
    globalLedgerSentinels: [sentinel],
    canonicalSentinels: [sentinel],
    durable: [{ sentinel, resolutionVerified: false }]
  }).length, 1);
  const authoritative = { ...sentinel, findings: [finding, { ...finding, sourceId: 2, threadId: "thread-2" }] };
  assert.equal(mergeUnresolvedLateReviewSentinels({
    globalLedgerSentinels: [authoritative],
    canonicalSentinels: [authoritative],
    durable: [{ sentinel, resolutionVerified: true }]
  }).length, 1, "a verified subset cannot clear the authoritative finding union");
});

test("canonical PR 194 sentinel blocks release and preserves every unresolved thread identity", () => {
  const truth = JSON.parse(fs.readFileSync("config/assurance/current-truth-v1.json", "utf8"));
  const sentinels = unresolvedLateReviewSentinels(truth);
  assert.equal(sentinels.length, 2);
  assert.deepEqual(validateLateReviewSentinelState(truth), []);
  const pr194 = sentinels.find(({ prNumber }) => prNumber === 194);
  assert.deepEqual(pr194.findings.map(({ commentId, threadId, severity }) => ({ commentId, threadId, severity })), [
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

test("every immutable late-review owner entry permanently retains one canonical sentinel", () => {
  const truth = JSON.parse(fs.readFileSync("config/assurance/current-truth-v1.json", "utf8"));
  assert.deepEqual(validateLateReviewSentinelState(truth), []);
  for (const prNumber of [194, 195]) {
    const removed = structuredClone(truth);
    removed.lateReviewSentinels = removed.lateReviewSentinels.filter(({ prNumber: candidate }) => candidate !== prNumber);
    assert(validateLateReviewSentinelState(removed).some((finding) => finding.id === "LATE_REVIEW_REQUIRED_SENTINEL_MISSING" && finding.prNumber === prNumber));
  }
  const duplicated = structuredClone(truth);
  duplicated.lateReviewSentinels.push(structuredClone(duplicated.lateReviewSentinels.find(({ prNumber }) => prNumber === 195)));
  assert(validateLateReviewSentinelState(duplicated).some((finding) => finding.id === "LATE_REVIEW_REQUIRED_SENTINEL_DUPLICATE" && finding.prNumber === 195));
});

test("only a byte-exact post-anchor protected-main tombstone can retire a retained sentinel offline", () => {
  const truth = JSON.parse(fs.readFileSync("config/assurance/current-truth-v1.json", "utf8"));
  const original = truth.lateReviewSentinels.find(({ prNumber }) => prNumber === 195);
  const resolved = structuredClone(original);
  resolved.successorCorrectionOwner = "codex/assurance-codex-security-scan-reliability-s0";
  resolved.findings = resolved.findings.map((finding) => ({ ...finding, disposition: "RESOLVED", threadResolutionState: "RESOLVED" }));
  const successorHead = "8".repeat(40);
  const successorTree = "9".repeat(40);
  resolved.resolutionEvidence = {
    schemaVersion: 1,
    successorPr: 206,
    successorBranch: resolved.successorCorrectionOwner,
    successorHead,
    successorTree,
    successorMergeSha: "a".repeat(40),
    successorMergedAt: "2026-08-10T04:20:00Z",
    correctedSourceIds: resolved.findings.map(({ sourceId }) => sourceId),
    resolvedThreadIds: resolved.findings.map(({ threadId }) => threadId),
    allThreadsResolved: true,
    githubThreadResolutionReadbackAt: "2026-08-10T04:25:00Z",
    exactHeadReviewedCommit: successorHead,
    exactHeadReviewedTree: successorTree,
    exactHeadReviewReceiptHash: "b".repeat(64),
    exactHeadCheckRunId: 9206,
    exactHeadReviewCompletedAt: "2026-08-10T04:15:00Z",
    correctionEvidenceHash: "c".repeat(64),
    dispositionEvidenceHash: "d".repeat(64),
    verificationSubjectHash: "e".repeat(64),
    repositoryVerificationHash: "f".repeat(64),
    completedAt: "2026-08-10T04:30:00Z"
  };
  resolved.resolutionEvidence.verificationSubjectHash = lateReviewResolutionSubjectHash(resolved);
  const tombstone = createLateReviewResolutionTombstone(resolved);
  const candidate = structuredClone(truth);
  candidate.lateReviewResolutionTombstones = [tombstone];

  assert.deepEqual(validateLateReviewSentinelState(candidate), [], "a valid branch candidate remains pending, not invalid");
  assert.equal(unresolvedLateReviewSentinels(candidate, { protectedMainRecord: truth, tombstoneAdmissionVerifier: () => true }).length, 2, "branch-local tombstone cannot authorize itself");
  const protectedMainRecord = structuredClone(candidate);
  const admittedOptions = { protectedMainRecord, tombstoneAdmissionVerifier: () => true };
  assert.equal(unresolvedLateReviewSentinels(candidate, admittedOptions).length, 1);
  assert.deepEqual(validateLateReviewSentinelState(candidate, admittedOptions), []);
  assert.equal(unresolvedLateReviewSentinels(candidate, { protectedMainRecord, tombstoneAdmissionVerifier: () => false }).length, 2, "pre-anchor or unverifiable admission remains blocked");

  const altered = structuredClone(candidate);
  altered.lateReviewResolutionTombstones[0].resolutionEvidence.correctedSourceIds.pop();
  altered.lateReviewResolutionTombstones[0].tombstoneHash = lateReviewResolutionTombstoneHash(altered.lateReviewResolutionTombstones[0]);
  assert(validateLateReviewSentinelState(altered, { protectedMainRecord: altered, tombstoneAdmissionVerifier: () => true }).some(({ id }) => id === "LATE_REVIEW_TOMBSTONE_INVALID"));
  assert.equal(unresolvedLateReviewSentinels(altered, { protectedMainRecord: altered, tombstoneAdmissionVerifier: () => true }).length, 2);

  const deletedOriginal = structuredClone(candidate);
  deletedOriginal.lateReviewSentinels = deletedOriginal.lateReviewSentinels.filter(({ prNumber }) => prNumber !== 195);
  const deletionFindings = validateLateReviewSentinelState(deletedOriginal, { protectedMainRecord: deletedOriginal, tombstoneAdmissionVerifier: () => true });
  assert(deletionFindings.some(({ id }) => id === "LATE_REVIEW_REQUIRED_SENTINEL_MISSING"));
  assert(deletionFindings.some(({ id }) => id === "LATE_REVIEW_TOMBSTONE_INVALID"));

  const duplicate = structuredClone(candidate);
  duplicate.lateReviewResolutionTombstones.push(structuredClone(tombstone));
  assert(validateLateReviewSentinelState(duplicate, { protectedMainRecord: duplicate, tombstoneAdmissionVerifier: () => true }).some(({ id }) => id === "LATE_REVIEW_TOMBSTONE_DUPLICATE"));
});

test("a late-review sentinel cannot authorize its own branch exceptions", () => {
  const truth = JSON.parse(fs.readFileSync("config/assurance/current-truth-v1.json", "utf8"));
  const forged = structuredClone(truth);
  forged.lateReviewSentinels.find(({ prNumber }) => prNumber === 194).authorizedBootstrapOwners.push("codex/unrelated-next");
  assert.equal(unresolvedLateReviewSentinels(forged).length, 2);
  assert(validateLateReviewSentinelState(forged).some(({ id }) => id === "LATE_REVIEW_OWNER_POLICY_INVALID"));
});

test("known unassigned discovery sentinels derive owners only from the immutable registry", () => {
  const discovery = {
    repository: "Chillywood2025/chillywood-mobile",
    prNumber: 195,
    mergeSha: "9f4f2d0c49160a0944c774bcf4175d9899bc01f7",
    successorCorrectionOwner: "UNASSIGNED_BLOCKED"
  };
  assert.deepEqual(lateReviewAllowedOwners(discovery), [
    "codex/assurance-active-task-and-claim-freshness-a1",
    "codex/assurance-codex-security-scan-reliability-s0"
  ]);
  assert.deepEqual(lateReviewAllowedOwners({
    ...discovery,
    successorCorrectionOwner: "codex/unrelated-next",
    assuranceControlOwner: "codex/unrelated-next",
    authorizedBootstrapOwners: ["codex/unrelated-next"]
  }), []);
  assert.deepEqual(lateReviewAllowedOwners({ ...discovery, prNumber: 999 }), []);
});

test("free-form resolved dispositions cannot clear a late-review sentinel", () => {
  const truth = JSON.parse(fs.readFileSync("config/assurance/current-truth-v1.json", "utf8"));
  const forged = structuredClone(truth);
  const sentinel = forged.lateReviewSentinels.find(({ prNumber }) => prNumber === 194);
  for (const finding of sentinel.findings) finding.disposition = "RESOLVED";
  assert.equal(unresolvedLateReviewSentinels(forged).length, 2);
  assert.equal(validateLateReviewSentinelState(forged).some(({ id }) => id === "LATE_REVIEW_RESOLUTION_EVIDENCE_INVALID"), true);

  for (const finding of sentinel.findings) finding.threadResolutionState = "RESOLVED";
  const successorHead = "e".repeat(40);
  const successorTree = "f".repeat(40);
  sentinel.resolutionEvidence = {
    schemaVersion: 1,
    successorPr: 203,
    successorBranch: sentinel.successorCorrectionOwner,
    successorHead,
    successorTree,
    successorMergeSha: "1".repeat(40),
    successorMergedAt: "2026-08-10T02:45:00Z",
    correctedSourceIds: sentinel.findings.map(({ sourceId }) => sourceId),
    resolvedThreadIds: sentinel.findings.map(({ threadId }) => threadId),
    allThreadsResolved: true,
    githubThreadResolutionReadbackAt: "2026-08-10T03:00:00Z",
    exactHeadReviewedCommit: successorHead,
    exactHeadReviewedTree: successorTree,
    exactHeadReviewReceiptHash: "2".repeat(64),
    exactHeadCheckRunId: 9003,
    exactHeadReviewCompletedAt: "2026-08-10T02:30:00Z",
    correctionEvidenceHash: "3".repeat(64),
    dispositionEvidenceHash: "4".repeat(64),
    verificationSubjectHash: "5".repeat(64),
    repositoryVerificationHash: "6".repeat(64),
    completedAt: "2026-08-10T03:05:00Z"
  };
  sentinel.resolutionEvidence.verificationSubjectHash = lateReviewResolutionSubjectHash(sentinel);
  assert.equal(unresolvedLateReviewSentinels(forged).length, 2, "a structurally perfect self-attestation remains blocked");
  const verifiedOptions = {
    resolutionVerifier: ({ subjectHash }) => ({
      ok: true,
      subjectHash,
      repositoryVerificationHash: sentinel.resolutionEvidence.repositoryVerificationHash
    })
  };
  assert.equal(unresolvedLateReviewSentinels(forged, verifiedOptions).length, 1);
  assert.deepEqual(validateLateReviewSentinelState(forged, verifiedOptions), []);
  sentinel.resolutionEvidence.exactHeadReviewedCommit = "7".repeat(40);
  assert.equal(unresolvedLateReviewSentinels(forged).length, 2);
});

test("workflow executes only the protected default-branch evaluator", () => {
  const workflow = fs.readFileSync(".github/workflows/codex-review-exact-head.yml", "utf8");
  assert.match(workflow, /pull_request_target:/u);
  assert.doesNotMatch(workflow, /^\s*pull_request:/mu);
  assert.match(workflow, /ref: \$\{\{ github\.event\.repository\.default_branch \}\}/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.doesNotMatch(workflow, /github\.event\.pull_request\.head/u);
  assert.match(workflow, /issues: write/u);
  assert.match(workflow, /cancel-in-progress: false/u);
  assert.match(workflow, /pull_request_target:\s*\n\s*types: \[opened, synchronize, reopened, ready_for_review, edited, labeled, unlabeled\]/u);
  assert.match(workflow, /pull_request_review:\s*\n\s*types: \[submitted, edited, dismissed\]/u);
  assert.match(workflow, /pull_request_review_comment:\s*\n\s*types: \[created, edited, deleted\]/u);
  assert.match(workflow, /issue_comment:\s*\n\s*types: \[created, edited, deleted\]/u);
  assert.doesNotMatch(workflow, /pull_request_review_thread:/u, "unsupported webhook-only events cannot make the Actions workflow invalid");
});

test("every build and release entrypoint requires durable GitHub late-sentinel readback", () => {
  for (const path of [
    ".github/workflows/ios-production-testflight.yml",
    ".github/workflows/manual-public-v1-release.yml",
    ".github/workflows/ios-preview-build.yml",
    ".github/workflows/phase3a-manual-preview.yml"
  ]) {
    const workflow = fs.readFileSync(path, "utf8");
    assert.match(workflow, /checks: read/u, path);
    assert.match(workflow, /issues: read/u, path);
    assert.match(workflow, /pull-requests: read/u, path);
    assert.match(workflow, /late-review-sentinel\.mjs --require-github/u, path);
    assert.match(workflow, /GITHUB_TOKEN: \$\{\{ github\.token \}\}/u, path);
  }
});
