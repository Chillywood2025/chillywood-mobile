#!/usr/bin/env node
import {
  args,
  emit,
  lateReviewAllowedOwners,
  lateReviewFindingSetEqual,
  lateReviewResolutionStructureValid,
  lateReviewResolutionSubjectHash,
  lateReviewSentinelResolved,
  mergeLateReviewSentinelRecords,
  readJson,
  readText,
  sha256,
  stableValue
} from "./lib.mjs";

const contractPath = "config/assurance/codex-review-exact-head-v1.json";
const paginationIncompleteCode = "CODEX_REVIEW_READBACK_PAGINATION_INCOMPLETE";
const providerCommentHeadUnboundCode = "CODEX_REVIEW_PROVIDER_COMMENT_HEAD_UNBOUND";
const severityOrder = new Map([["P0", 0], ["P1", 1], ["P2", 2], ["P3", 3]]);
export const lateReviewIssueLabel = "codex-review-late-sentinel";
export const lateReviewIssueTitlePrefix = "[Codex Review Late Sentinel]";
export const reviewOnlyLabel = "assurance-review-only";
export const sourcePushLeaseCheckName = "Chi'llywood / Codex Review Source Push Lease";
export const providerFindingLedgerCheckName = "Chi'llywood / Codex Review Finding Ledger";
export const reviewOnlyLeaseCheckName = "Chi'llywood / Review Only Never Merge";
export const reviewOnlyBranchPrefix = "codex/assurance-review-only/";

export function isReviewOnlyPullRequest({ headBranch, reviewOnlyLeasePresent = false, truthEntries = [], prNumber }) {
  return String(headBranch ?? "").startsWith(reviewOnlyBranchPrefix)
    || reviewOnlyLeasePresent === true
    || truthEntries.some(({ number, disposition }) => number === prNumber && String(disposition).includes("never-merge"));
}

function validInstant(value) {
  return typeof value === "string" && Number.isFinite(new Date(value).valueOf());
}

function validGitSha(value) {
  return typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
}

function highestSeverity(values) {
  return values
    .filter((value) => severityOrder.has(value))
    .sort((left, right) => severityOrder.get(left) - severityOrder.get(right))[0] ?? null;
}

function severityFromBody(body) {
  return highestSeverity([...String(body ?? "").matchAll(/\bP([0-3])\b(?!\s*[:=]\s*0\b)/gu)].map((match) => `P${match[1]}`));
}

function issueCommentReviewedCommit(body) {
  const matches = [...String(body ?? "").matchAll(/<!--\s*codex-review-reviewed-commit:([0-9a-f]{40})\s*-->/gu)]
    .map((match) => match[1]);
  return matches.length === 1 ? matches[0] : null;
}

function reviewCleanDispositionCommit(review) {
  if (review?.state === "APPROVED" && validGitSha(review.commit)) return review.commit;
  const matches = [...String(review?.body ?? "").matchAll(/<!--\s*codex-review-disposition:blocking-findings-resolved\s+reviewed-commit:([0-9a-f]{40})\s*-->/gu)]
    .map((match) => match[1]);
  return matches.length === 1 ? matches[0] : null;
}

function findingTimestamp(value) {
  return [value.updatedAt, value.submittedAt, value.createdAt].filter(validInstant).sort().at(-1) ?? null;
}

function normalizedFinding({ sourceType, provider, id, nodeId, body, createdAt, updatedAt, submittedAt = null, edited = false, reviewedCommit, threadId = null, threadResolutionState = "NOT_APPLICABLE", disposition, paths = [] }) {
  return {
    findingId: `${sourceType}:${nodeId ?? id}`,
    sourceType,
    sourceId: id,
    sourceNodeId: nodeId ?? null,
    provider,
    bodyHash: sha256(String(body ?? "")),
    severity: severityFromBody(body),
    createdAt,
    updatedAt: updatedAt ?? createdAt,
    submittedAt,
    edited,
    reviewedCommit: reviewedCommit ?? null,
    headBound: validGitSha(reviewedCommit),
    threadId,
    threadResolutionState,
    disposition,
    affectedPaths: [...new Set(paths.filter(Boolean))].sort()
  };
}

function validPersistentProviderFinding(finding, contract) {
  const sourceTypes = new Set(["REVIEW_BODY", "INLINE_THREAD", "ISSUE_COMMENT"]);
  return sourceTypes.has(finding?.sourceType)
    && Number.isInteger(finding.sourceId)
    && finding.sourceId > 0
    && typeof finding.findingId === "string"
    && finding.findingId.length > 0
    && (contract?.reviewProviders ?? []).includes(finding.provider)
    && (contract?.blockingSeverities ?? []).includes(finding.severity)
    && /^[0-9a-f]{64}$/u.test(finding.bodyHash ?? "")
    && validInstant(finding.createdAt)
    && validInstant(finding.updatedAt)
    && (finding.submittedAt === null || validInstant(finding.submittedAt))
    && (finding.reviewedCommit === null || validGitSha(finding.reviewedCommit))
    && finding.headBound === validGitSha(finding.reviewedCommit)
    && ["RESOLVED", "UNRESOLVED", "NOT_APPLICABLE"].includes(finding.threadResolutionState)
    && finding.disposition === "UNRESOLVED"
    && Array.isArray(finding.affectedPaths)
    && finding.affectedPaths.every((path) => typeof path === "string" && path.length > 0);
}

export function normalizeLateReviewEvent({ eventName, event, contract, observedAt = new Date().toISOString() }) {
  const providers = new Set(contract?.reviewProviders ?? []);
  let sourceType;
  let value;
  if (eventName === "pull_request_review") {
    sourceType = "REVIEW_BODY";
    value = event?.review;
  } else if (eventName === "pull_request_review_comment") {
    sourceType = "INLINE_THREAD";
    value = event?.comment;
  } else if (eventName === "issue_comment") {
    sourceType = "ISSUE_COMMENT";
    value = event?.comment;
  } else return null;
  const provider = value?.user?.login ?? null;
  if (!providers.has(provider)) return null;
  const previousBody = event?.changes?.body?.from;
  const body = severityFromBody(previousBody) ? previousBody : value?.body;
  const severity = severityFromBody(body);
  if (!severity || !(contract.blockingSeverities ?? []).includes(severity)) return null;
  const reviewedCommit = sourceType === "REVIEW_BODY"
    ? value?.commit_id
    : (sourceType === "INLINE_THREAD" ? (value?.pull_request_review?.commit_id ?? value?.commit_id) : issueCommentReviewedCommit(body));
  const nativeTime = sourceType === "REVIEW_BODY"
    ? value?.submitted_at
    : (value?.updated_at ?? value?.created_at);
  const mutableAction = ["edited", "deleted", "dismissed"].includes(event?.action);
  const updatedAt = (mutableAction ? [nativeTime, observedAt] : [nativeTime])
    .filter(validInstant)
    .sort()
    .at(-1) ?? null;
  return normalizedFinding({
    sourceType,
    provider,
    id: value?.id,
    nodeId: value?.node_id,
    body,
    createdAt: value?.created_at ?? value?.submitted_at ?? updatedAt,
    updatedAt,
    submittedAt: sourceType === "REVIEW_BODY" ? value?.submitted_at : value?.pull_request_review?.submitted_at,
    edited: mutableAction,
    reviewedCommit,
    threadId: null,
    threadResolutionState: sourceType === "INLINE_THREAD" ? "UNRESOLVED" : "NOT_APPLICABLE",
    disposition: "UNRESOLVED",
    paths: value?.path ? [value.path] : []
  });
}

function normalizeProviderFindings({ contract, current, reviews = [], threads = [], issueComments = [], persistentFindings = [] }) {
  const providers = new Set(contract.reviewProviders ?? []);
  const acceptableStates = new Set(contract.acceptableReviewStates ?? []);
  const providerReviews = reviews.filter(({ author }) => providers.has(author));
  const laterExactProviderReview = (after) => validInstant(after) && providerReviews.some((candidate) => candidate.commit === current.headSha
    && acceptableStates.has(candidate.state)
    && reviewCleanDispositionCommit(candidate) === current.headSha
    && validInstant(candidate.submittedAt)
    && new Date(candidate.submittedAt) > new Date(after)
    && (!validInstant(current.mergedAt) || new Date(candidate.submittedAt) <= new Date(current.mergedAt)));
  const findings = [];
  const unboundProviderCommentIds = [];

  for (const review of providerReviews) {
    const severity = severityFromBody(review.body);
    if (!severity) continue;
    const timestamp = findingTimestamp(review);
    findings.push(normalizedFinding({
      sourceType: "REVIEW_BODY",
      provider: review.author,
      id: review.reviewId,
      nodeId: review.reviewNodeId,
      body: review.body,
      createdAt: review.createdAt ?? review.startedAt,
      updatedAt: timestamp,
      submittedAt: review.submittedAt,
      edited: validInstant(review.updatedAt) && validInstant(review.submittedAt) && new Date(review.updatedAt) > new Date(review.submittedAt),
      reviewedCommit: review.commit,
      disposition: laterExactProviderReview(timestamp) ? "RESOLVED_BY_LATER_PROVIDER_REREVIEW" : "UNRESOLVED",
      paths: []
    }));
  }

  for (const thread of threads) {
    for (const comment of thread.comments ?? []) {
      if (!providers.has(comment.author)) continue;
      const severity = severityFromBody(comment.body);
      if (!severity) continue;
      const timestamp = findingTimestamp(comment);
      const providerRereviewed = laterExactProviderReview(timestamp);
      findings.push(normalizedFinding({
        sourceType: "INLINE_THREAD",
        provider: comment.author,
        id: comment.commentId,
        nodeId: comment.commentNodeId,
        body: comment.body,
        createdAt: comment.createdAt,
        updatedAt: timestamp,
        submittedAt: comment.submittedAt,
        edited: validInstant(comment.updatedAt) && validInstant(comment.createdAt) && comment.updatedAt !== comment.createdAt,
        reviewedCommit: comment.reviewCommit ?? comment.commit,
        threadId: thread.threadId,
        threadResolutionState: thread.isResolved === true ? "RESOLVED" : "UNRESOLVED",
        disposition: thread.isResolved === true && providerRereviewed
          ? "RESOLVED_BY_LATER_PROVIDER_REREVIEW"
          : (thread.isResolved === true ? "THREAD_RESOLVED_REREVIEW_REQUIRED" : "UNRESOLVED"),
        paths: comment.path ? [comment.path] : []
      }));
    }
  }

  for (const comment of issueComments) {
    if (!providers.has(comment.author)) continue;
    const reviewedCommit = issueCommentReviewedCommit(comment.body);
    const severity = severityFromBody(comment.body);
    if (!severity) continue;
    if (!reviewedCommit && (contract.blockingSeverities ?? []).includes(severity)) {
      unboundProviderCommentIds.push(comment.commentNodeId ?? comment.commentId);
    }
    const timestamp = findingTimestamp(comment);
    findings.push(normalizedFinding({
      sourceType: "ISSUE_COMMENT",
      provider: comment.author,
      id: comment.commentId,
      nodeId: comment.commentNodeId,
      body: comment.body,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      edited: validInstant(comment.updatedAt) && validInstant(comment.createdAt) && comment.updatedAt !== comment.createdAt,
      reviewedCommit,
      disposition: reviewedCommit && laterExactProviderReview(timestamp) ? "RESOLVED_BY_LATER_PROVIDER_REREVIEW" : "UNRESOLVED",
      paths: []
    }));
  }

  for (const finding of persistentFindings) {
    if (!validPersistentProviderFinding(finding, contract)) continue;
    const timestamp = findingTimestamp(finding);
    const disposition = laterExactProviderReview(timestamp) ? "RESOLVED_BY_LATER_PROVIDER_REREVIEW" : "UNRESOLVED";
    if (finding.sourceType === "ISSUE_COMMENT" && finding.headBound !== true && disposition === "UNRESOLVED") {
      unboundProviderCommentIds.push(finding.sourceNodeId ?? finding.sourceId);
    }
    findings.push({
      ...finding,
      updatedAt: timestamp,
      disposition
    });
  }

  const uniqueFindings = new Map(findings.map((finding) => [`${finding.findingId}:${finding.bodyHash}`, finding]));
  return {
    findings: [...uniqueFindings.values()].sort((left, right) => left.findingId.localeCompare(right.findingId)),
    unboundProviderCommentIds: [...new Set(unboundProviderCommentIds)].sort()
  };
}

export function exactReceiptHash(receipt) {
  const payload = structuredClone(receipt ?? {});
  delete payload.receiptHash;
  return sha256(stableValue(payload));
}

function normalizedSuccessorFiles(files) {
  return (files ?? []).map((file) => ({
    path: file?.filename,
    status: file?.status,
    blobSha: file?.sha,
    additions: file?.additions,
    deletions: file?.deletions,
    changes: file?.changes
  })).sort((left, right) => String(left.path).localeCompare(String(right.path)));
}

export function lateReviewCorrectionEvidenceHash({ repository, successorPr, baseSha, successorHead, successorTree, successorMergeSha, files }) {
  return sha256(stableValue({
    schemaVersion: 1,
    repository,
    successorPr,
    baseSha,
    successorHead,
    successorTree,
    successorMergeSha,
    files: normalizedSuccessorFiles(files)
  }));
}

export function lateReviewDispositionEvidenceHash({ repository, sentinel, exactHeadReceiptHash, resolvedThreadIds }) {
  return sha256(stableValue({
    schemaVersion: 1,
    repository,
    originalPr: sentinel?.prNumber,
    originalMergeSha: sentinel?.mergeSha,
    findings: (sentinel?.findings ?? []).map(({ sourceType, sourceId, bodyHash, severity, threadId, disposition, threadResolutionState }) => ({
      sourceType,
      sourceId,
      bodyHash,
      severity,
      threadId: threadId ?? null,
      disposition,
      threadResolutionState
    })).sort((left, right) => `${left.sourceType}:${left.sourceId}`.localeCompare(`${right.sourceType}:${right.sourceId}`)),
    exactHeadReceiptHash,
    resolvedThreadIds: [...new Set(resolvedThreadIds ?? [])].sort()
  }));
}

export function buildExactHeadReceipt({ contract, current, review, reviews = null, threads, issueComments = [], persistentFindings = [] }) {
  const allReviews = Array.isArray(reviews) ? reviews : [review];
  const providerNames = new Set(contract.reviewProviders ?? []);
  const reviewSubmissions = allReviews
    .filter(({ author }) => providerNames.has(author))
    .map((entry) => ({
      reviewId: entry.reviewId,
      reviewNodeId: entry.reviewNodeId ?? null,
      author: entry.author,
      state: entry.state,
      bodyHash: sha256(String(entry.body ?? "")),
      commit: entry.commit,
      createdAt: entry.createdAt ?? entry.startedAt,
      submittedAt: entry.submittedAt,
      updatedAt: entry.updatedAt ?? entry.submittedAt
    }))
    .sort((left, right) => left.reviewId - right.reviewId);
  const providerIssueComments = issueComments
    .filter(({ author }) => providerNames.has(author))
    .map((entry) => ({
      commentId: entry.commentId,
      commentNodeId: entry.commentNodeId ?? null,
      author: entry.author,
      bodyHash: sha256(String(entry.body ?? "")),
      reviewedCommit: issueCommentReviewedCommit(entry.body),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt ?? entry.createdAt,
      edited: validInstant(entry.updatedAt) && validInstant(entry.createdAt) && entry.updatedAt !== entry.createdAt
    }))
    .sort((left, right) => left.commentId - right.commentId);
  const normalizedThreads = (Array.isArray(threads) ? threads : [])
    .map((thread) => {
      const comments = (thread.comments ?? []).map((comment) => ({
        commentId: comment.commentId,
        commentNodeId: comment.commentNodeId,
        author: comment.author,
        bodyHash: sha256(String(comment.body ?? "")),
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt ?? comment.createdAt,
        reviewId: comment.reviewId ?? null,
        reviewSubmittedAt: comment.submittedAt ?? null,
        reviewCommit: comment.reviewCommit ?? null,
        commit: comment.commit,
        path: comment.path ?? null
      }));
      const providerComments = (thread.comments ?? []).filter(({ author }) => providerNames.has(author));
      const severity = highestSeverity(providerComments.map(({ body }) => severityFromBody(body)));
      return {
        threadId: thread.threadId,
        resolutionState: thread.isResolved === true ? "RESOLVED" : "UNRESOLVED",
        findingSeverity: severity,
        affectedPaths: [...new Set(providerComments.map(({ path }) => path).filter(Boolean))].sort(),
        comments
      };
    })
    .sort((left, right) => left.threadId.localeCompare(right.threadId));
  const providerComments = normalizedThreads
    .flatMap(({ comments }) => comments)
    .filter(({ author }) => providerNames.has(author))
    .sort((left, right) => left.commentId - right.commentId);
  const exactProviderComments = providerComments.filter(({ commit, reviewCommit }) => (reviewCommit ?? commit) === current.headSha);
  const startedCandidates = [review.startedAt, ...exactProviderComments.map(({ createdAt }) => createdAt), review.submittedAt]
    .filter(validInstant)
    .sort();
  const normalized = normalizeProviderFindings({ contract, current, reviews: allReviews, threads, issueComments, persistentFindings });
  const receipt = {
    schemaVersion: 1,
    contractId: contract.contractId,
    repository: current.repository,
    prNumber: current.prNumber,
    prHeadSha: current.headSha,
    prHeadTree: current.headTree,
    prBaseBranch: current.baseBranch,
    prBaseSha: current.baseSha,
    reviewProvider: review.author,
    reviewId: review.reviewId,
    reviewState: review.state,
    reviewedCommit: review.commit,
    reviewStartedAt: startedCandidates[0] ?? review.submittedAt,
    reviewCompletedAt: review.submittedAt,
    latestSourcePushAt: current.latestSourcePushAt,
    sourcePushLeaseHashes: current.sourcePushLeaseHashes ?? [],
    reviewSubmissions,
    reviewComments: providerComments,
    reviewThreads: normalizedThreads,
    providerIssueComments,
    reviewFindings: normalized.findings,
    providerCommentHeadUnbound: normalized.unboundProviderCommentIds,
    sharedHeadOpenPrNumbers: [...(current.sharedHeadOpenPrNumbers ?? [])].sort((left, right) => left - right),
    repositoryWriteActors: [...(current.repositoryWriteActors ?? [])].sort()
  };
  receipt.receiptHash = exactReceiptHash(receipt);
  return receipt;
}

export function evaluateExactHeadReceipt({ contract, current, receipt, readbackIncomplete = false }) {
  const codes = [];
  if (readbackIncomplete) codes.push(paginationIncompleteCode);
  if (current.sourceReadbackIncomplete === true) codes.push(current.sourceReadbackCode ?? "CODEX_REVIEW_INCOMPLETE");
  if (current.reviewOnly === true) codes.push("CODEX_REVIEW_RECEIPT_INVALID");
  if (current.lateReviewBlocked === true) codes.push("CODEX_REVIEW_LATE_SENTINEL_BLOCKED");
  if (!receipt) {
    codes.push(current.providerReviewsExist ? "CODEX_REVIEW_STALE_HEAD" : "CODEX_REVIEW_MISSING");
    return { ok: false, codes: [...new Set(codes)].sort(), receipt: null };
  }
  const missing = (contract.receiptRequiredFields ?? []).filter((field) => !Object.hasOwn(receipt, field));
  if (missing.length
    || receipt.schemaVersion !== 1
    || receipt.contractId !== contract.contractId
    || receipt.repository !== current.repository
    || receipt.prNumber !== current.prNumber
    || !validGitSha(current.headSha)
    || !validGitSha(current.headTree)
    || !validGitSha(receipt.prHeadSha)
    || !validGitSha(receipt.prHeadTree)
    || typeof receipt.prBaseBranch !== "string"
    || !validGitSha(receipt.prBaseSha)
    || !validGitSha(receipt.reviewedCommit)
    || !(contract.reviewProviders ?? []).includes(receipt.reviewProvider)
    || !Number.isInteger(receipt.reviewId)
    || receipt.reviewId < 1
    || !(contract.acceptableReviewStates ?? []).includes(receipt.reviewState)
    || !validInstant(receipt.reviewStartedAt)
    || !validInstant(receipt.reviewCompletedAt)
    || !validInstant(receipt.latestSourcePushAt)
    || !Array.isArray(receipt.sourcePushLeaseHashes)
    || !receipt.sourcePushLeaseHashes.every((hash) => /^[0-9a-f]{64}$/u.test(hash))
    || !Array.isArray(receipt.reviewComments)
    || !Array.isArray(receipt.reviewSubmissions)
    || !Array.isArray(receipt.reviewThreads)
    || !Array.isArray(receipt.providerIssueComments)
    || !Array.isArray(receipt.reviewFindings)
    || !Array.isArray(receipt.providerCommentHeadUnbound)
    || !Array.isArray(receipt.sharedHeadOpenPrNumbers)
    || !receipt.sharedHeadOpenPrNumbers.every((number) => Number.isInteger(number) && number > 0)
    || !Array.isArray(receipt.repositoryWriteActors)
    || receipt.receiptHash !== exactReceiptHash(receipt)) {
    codes.push("CODEX_REVIEW_RECEIPT_INVALID");
  }
  if (receipt.reviewedCommit !== current.headSha || receipt.prHeadSha !== current.headSha || receipt.prHeadTree !== current.headTree) {
    codes.push("CODEX_REVIEW_STALE_HEAD");
  }
  if (current.baseBranch !== contract.protectedBaseBranch
    || receipt.prBaseBranch !== current.baseBranch
    || receipt.prBaseSha !== current.baseSha) codes.push("CODEX_REVIEW_STALE_BASE");
  if (!Array.isArray(current.sourcePushLeaseHashes)
    || current.sourcePushLeaseHashes.length === 0
    || receipt.latestSourcePushAt !== current.latestSourcePushAt
    || JSON.stringify(receipt.sourcePushLeaseHashes) !== JSON.stringify(current.sourcePushLeaseHashes ?? [])
    || new Date(receipt.reviewCompletedAt).valueOf() <= new Date(current.latestSourcePushAt).valueOf()) {
    codes.push("CODEX_REVIEW_INCOMPLETE");
  }
  if ((receipt.providerCommentHeadUnbound ?? []).length) codes.push(providerCommentHeadUnboundCode);
  const expectedSharedHeadPrs = [current.prNumber];
  if (JSON.stringify(receipt.sharedHeadOpenPrNumbers ?? []) !== JSON.stringify(expectedSharedHeadPrs)
    || JSON.stringify([...(current.sharedHeadOpenPrNumbers ?? [])].sort((left, right) => left - right)) !== JSON.stringify(expectedSharedHeadPrs)) {
    codes.push("CODEX_REVIEW_SHARED_HEAD_AMBIGUOUS");
  }
  const trustedWriteActors = [...(contract.trustedRepositoryWriteActors ?? [])].sort();
  if (JSON.stringify(receipt.repositoryWriteActors ?? []) !== JSON.stringify(trustedWriteActors)
    || JSON.stringify([...(current.repositoryWriteActors ?? [])].sort()) !== JSON.stringify(trustedWriteActors)) {
    codes.push("CODEX_REVIEW_UNTRUSTED_WRITE_ACTOR");
  }
  const unresolvedThreads = (receipt.reviewThreads ?? []).filter(({ resolutionState }) => resolutionState !== "RESOLVED");
  if (unresolvedThreads.length) codes.push("CODEX_REVIEW_BLOCKING_THREAD_OPEN");
  const blocking = new Set(contract.blockingSeverities ?? []);
  if ((receipt.reviewFindings ?? []).some(({ severity, disposition }) => blocking.has(severity) && disposition !== "RESOLVED_BY_LATER_PROVIDER_REREVIEW")) {
    codes.push("CODEX_REVIEW_UNRESOLVED_FINDING");
  }
  return { ok: codes.length === 0, codes: [...new Set(codes)].sort(), receipt };
}

export function detectLateReview({ contract, current, review = null, reviews = null, threads = [], issueComments = [], eventFindings = [], persistentFindings = [] }) {
  if (!validInstant(current.mergedAt)) return null;
  const allReviews = Array.isArray(reviews) ? reviews : (review ? [review] : []);
  const normalized = normalizeProviderFindings({ contract, current, reviews: allReviews, threads, issueComments, persistentFindings });
  const blocking = new Set(contract.blockingSeverities ?? []);
  const uniqueFindings = new Map([...normalized.findings, ...(eventFindings ?? [])]
    .map((finding) => [`${finding.findingId}:${finding.bodyHash}`, finding]));
  const findings = [...uniqueFindings.values()]
    .filter((finding) => validInstant(finding.updatedAt)
      && new Date(finding.updatedAt) > new Date(current.mergedAt)
      && finding.disposition !== "RESOLVED_BY_LATER_PROVIDER_REREVIEW"
      && blocking.has(finding.severity))
    .map((finding) => ({
      commentId: finding.sourceType === "REVIEW_BODY" ? null : finding.sourceId,
      sourceId: finding.sourceId,
      commentNodeId: finding.sourceType === "REVIEW_BODY" ? null : finding.sourceNodeId,
      threadId: finding.threadId,
      sourceType: finding.sourceType,
      provider: finding.provider,
      bodyHash: finding.bodyHash,
      severity: finding.severity,
      timestamp: finding.updatedAt,
      reviewedSha: finding.reviewedCommit,
      reviewedHeadClassification: finding.headBound !== true
        ? "UNBOUND"
        : (finding.reviewedCommit === current.headSha ? "CURRENT_HEAD" : "STALE_HEAD"),
      threadResolutionState: finding.threadResolutionState,
      affectedPaths: finding.affectedPaths,
      disposition: "UNRESOLVED"
    }));
  if (!findings.length) return null;
  return {
    classification: contract.lateReviewClassification,
    repository: current.repository,
    prNumber: current.prNumber,
    mergedAt: current.mergedAt,
    mergeSha: current.mergeSha,
    reviewedSha: findings[0].reviewedSha,
    reviewId: findings.find(({ sourceType }) => sourceType === "REVIEW_BODY")?.sourceId ?? review?.reviewId ?? null,
    reviewCompletedAt: review?.submittedAt ?? findings.map(({ timestamp }) => timestamp).sort().at(-1),
    findings,
    successorCorrectionOwner: current.successorCorrectionOwner ?? "UNASSIGNED_BLOCKED",
    blocks: contract.lateReviewBlocks
  };
}

async function githubRequestPage(url, token, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {})
    }
  });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = { message: text }; }
  if (!response.ok) {
    const error = new Error(`GITHUB_HTTP_${response.status}:${body?.message ?? "unknown"}`);
    error.status = response.status;
    throw error;
  }
  return { body, link: response.headers.get("link") ?? "" };
}

async function githubRequest(url, token, init = {}) {
  return (await githubRequestPage(url, token, init)).body;
}

function paginationError() {
  return new Error(paginationIncompleteCode);
}

async function graphRequest(query, variables, token) {
  const graph = await githubRequest("https://api.github.com/graphql", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables })
  });
  if (graph.errors?.length) throw new Error(`GITHUB_GRAPHQL:${graph.errors.map(({ message }) => message).join("|")}`);
  return graph.data;
}

export async function paginateGraphConnection({ query, variables, select, token, maxPages, request = graphRequest, initialAfter = null }) {
  const nodes = [];
  let after = initialAfter;
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await request(query, { ...variables, after }, token);
    const connection = select(data);
    const pageInfo = connection?.pageInfo;
    if (!connection
      || !Array.isArray(connection.nodes)
      || !pageInfo
      || typeof pageInfo !== "object"
      || Array.isArray(pageInfo)
      || typeof pageInfo.hasNextPage !== "boolean"
      || (pageInfo.endCursor !== null && pageInfo.endCursor !== undefined && typeof pageInfo.endCursor !== "string")) throw paginationError();
    nodes.push(...connection.nodes);
    if (pageInfo.hasNextPage !== true) return nodes;
    if (typeof pageInfo.endCursor !== "string" || !pageInfo.endCursor || page === maxPages) throw paginationError();
    after = pageInfo.endCursor;
  }
  throw paginationError();
}

function hasNextRestPage(link) {
  return /<[^>]+>;\s*rel="next"/u.test(link ?? "");
}

async function readOpenPullRequestNumbersForHead(repository, headSha, token, { request = githubRequestPage, maxPages = 20 } = {}) {
  const numbers = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const response = await request(`https://api.github.com/repos/${repository}/commits/${headSha}/pulls?per_page=100&page=${page}`, token, { method: "GET" });
    if (!Array.isArray(response?.body)) throw paginationError();
    numbers.push(...response.body
      .filter((candidate) => candidate?.state === "open" && candidate?.head?.sha === headSha)
      .map(({ number }) => number));
    if (!hasNextRestPage(response.link)) {
      return [...new Set(numbers)].filter((number) => Number.isInteger(number) && number > 0).sort((left, right) => left - right);
    }
    if (page === maxPages) throw paginationError();
  }
  throw paginationError();
}

function sourcePushLeaseDigest(payload) {
  return sha256(stableValue(payload));
}

export async function recordSourcePushLease({ repository, prNumber, headSha, baseBranch, baseSha, pushedAt, token, request = githubRequestPage }) {
  if (!/^[^/]+\/[^/]+$/u.test(repository ?? "")
    || !Number.isInteger(prNumber)
    || prNumber < 1
    || !validGitSha(headSha)
    || typeof baseBranch !== "string"
    || !baseBranch
    || !validGitSha(baseSha)
    || !validInstant(pushedAt)) throw new Error("CODEX_REVIEW_SOURCE_PUSH_LEASE_INVALID");
  const payload = { schemaVersion: 1, repository, prNumber, headSha, baseBranch, baseSha, pushedAt };
  payload.digest = sourcePushLeaseDigest(payload);
  const result = await request(`https://api.github.com/repos/${repository}/check-runs`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: sourcePushLeaseCheckName,
      head_sha: headSha,
      status: "completed",
      conclusion: "neutral",
      external_id: `codex-review-source-push:v1:pr=${prNumber}:head=${headSha}:digest=${payload.digest}`,
      output: {
        title: `Source push lease for PR #${prNumber}`,
        summary: JSON.stringify(payload)
      }
    })
  });
  return { payload, checkRun: result.body };
}

function parseSourcePushLease(check, { repository, prNumber, headSha }) {
  if (check?.name !== sourcePushLeaseCheckName) return null;
  let payload;
  try { payload = JSON.parse(check.output?.summary); } catch { return false; }
  const unsigned = structuredClone(payload ?? {});
  delete unsigned.digest;
  const external = String(check.external_id ?? "").match(/^codex-review-source-push:v1:pr=(\d+):head=([0-9a-f]{40}):digest=([0-9a-f]{64})$/u);
  if (!external
    || check.status !== "completed"
    || check.conclusion !== "neutral"
    || check.head_sha !== headSha
    || check.app?.slug !== "github-actions"
    || payload?.schemaVersion !== 1
    || payload.repository !== repository
    || payload.prNumber !== prNumber
    || payload.headSha !== headSha
    || typeof payload.baseBranch !== "string"
    || !payload.baseBranch
    || !validGitSha(payload.baseSha)
    || !validInstant(payload.pushedAt)
    || payload.digest !== sourcePushLeaseDigest(unsigned)
    || external[1] !== String(prNumber)
    || external[2] !== headSha
    || external[3] !== payload.digest) return false;
  return payload;
}

export async function readSourcePushLeases(repository, prNumber, headSha, token, options = {}) {
  const request = options.request ?? githubRequestPage;
  const maxPages = options.maxPages ?? 20;
  const runs = [];
  let totalCount = null;
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await request(`https://api.github.com/repos/${repository}/commits/${headSha}/check-runs?check_name=${encodeURIComponent(sourcePushLeaseCheckName)}&filter=all&per_page=100&page=${page}`, token, { method: "GET" });
    if (!result?.body
      || !Number.isInteger(result.body.total_count)
      || !Array.isArray(result.body.check_runs)
      || (totalCount !== null && totalCount !== result.body.total_count)) throw paginationError();
    totalCount = result.body.total_count;
    runs.push(...result.body.check_runs);
    if (!hasNextRestPage(result.link)) {
      if (runs.length !== totalCount) throw paginationError();
      const parsed = runs.map((check) => {
        let payload;
        try { payload = JSON.parse(check?.output?.summary); } catch { return false; }
        if (!Number.isInteger(payload?.prNumber) || payload.prNumber < 1) return false;
        return parseSourcePushLease(check, { repository, prNumber: payload.prNumber, headSha });
      });
      if (parsed.some((entry) => entry === false)) throw new Error("CODEX_REVIEW_SOURCE_PUSH_LEASE_INVALID");
      return parsed.filter((entry) => entry?.prNumber === prNumber).sort((left, right) => left.pushedAt.localeCompare(right.pushedAt));
    }
    if (page === maxPages) throw paginationError();
  }
  throw paginationError();
}

async function readNamedCheckRuns(repository, headSha, checkName, token, options = {}) {
  const request = options.request ?? githubRequestPage;
  const maxPages = options.maxPages ?? 20;
  const runs = [];
  let totalCount = null;
  for (let page = 1; page <= maxPages; page += 1) {
    const result = await request(`https://api.github.com/repos/${repository}/commits/${headSha}/check-runs?check_name=${encodeURIComponent(checkName)}&filter=all&per_page=100&page=${page}`, token, { method: "GET" });
    if (!result?.body
      || !Number.isInteger(result.body.total_count)
      || !Array.isArray(result.body.check_runs)
      || (totalCount !== null && totalCount !== result.body.total_count)) throw paginationError();
    totalCount = result.body.total_count;
    runs.push(...result.body.check_runs);
    if (!hasNextRestPage(result.link)) {
      if (runs.length !== totalCount) throw paginationError();
      return runs;
    }
    if (page === maxPages) throw paginationError();
  }
  throw paginationError();
}

function checkLedgerDigest(payload) {
  const unsigned = structuredClone(payload ?? {});
  delete unsigned.digest;
  return sha256(stableValue(unsigned));
}

async function recordCheckLedger({ repository, headSha, checkName, externalPrefix, payload, token, request = githubRequestPage }) {
  const value = { ...payload, schemaVersion: 1, repository, headSha };
  value.digest = checkLedgerDigest(value);
  const result = await request(`https://api.github.com/repos/${repository}/check-runs`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: checkName,
      head_sha: headSha,
      status: "completed",
      conclusion: "neutral",
      external_id: `${externalPrefix}:${value.digest}`,
      output: { title: checkName, summary: JSON.stringify(value) }
    })
  });
  return { payload: value, checkRun: result.body };
}

function parseCheckLedger(check, { repository, prNumber, headSha, checkName, externalPrefix }) {
  let payload;
  try { payload = JSON.parse(check?.output?.summary); } catch { return false; }
  if (check?.name !== checkName
    || check.status !== "completed"
    || check.conclusion !== "neutral"
    || check.head_sha !== headSha
    || check.app?.slug !== "github-actions"
    || check.external_id !== `${externalPrefix}:${payload?.digest}`
    || payload?.schemaVersion !== 1
    || payload.repository !== repository
    || payload.prNumber !== prNumber
    || payload.headSha !== headSha
    || !/^[0-9a-f]{64}$/u.test(payload.digest ?? "")
    || payload.digest !== checkLedgerDigest(payload)) return false;
  return payload;
}

export async function recordProviderFindingLedger({ repository, prNumber, headSha, finding, token, request = githubRequestPage }) {
  const contract = readJson(contractPath);
  if (!Number.isInteger(prNumber)
    || !validGitSha(headSha)
    || !validPersistentProviderFinding(finding, contract)) throw new Error("CODEX_REVIEW_FINDING_LEDGER_INVALID");
  return recordCheckLedger({
    repository,
    headSha,
    checkName: providerFindingLedgerCheckName,
    externalPrefix: `codex-review-finding:v1:pr=${prNumber}:source=${finding.sourceType}:${finding.sourceId}`,
    payload: { prNumber, finding },
    token,
    request
  });
}

export async function readProviderFindingLedger(repository, prNumber, headSha, token, options = {}) {
  const contract = options.contract ?? readJson(contractPath);
  const checks = await readNamedCheckRuns(repository, headSha, providerFindingLedgerCheckName, token, options);
  const parsed = checks.map((check) => {
    let payload;
    try { payload = JSON.parse(check.output?.summary); } catch { return false; }
    const source = payload?.finding;
    if (!Number.isInteger(payload?.prNumber) || payload.prNumber < 1) return false;
    return parseCheckLedger(check, {
      repository,
      prNumber: payload.prNumber,
      headSha,
      checkName: providerFindingLedgerCheckName,
      externalPrefix: `codex-review-finding:v1:pr=${payload.prNumber}:source=${source?.sourceType}:${source?.sourceId}`
    });
  });
  if (parsed.some((entry) => entry === false || !validPersistentProviderFinding(entry?.finding, contract))) {
    throw new Error("CODEX_REVIEW_FINDING_LEDGER_INVALID");
  }
  return [...new Map(parsed
    .filter((entry) => entry.prNumber === prNumber)
    .map(({ finding }) => [`${finding.findingId}:${finding.bodyHash}`, finding])).values()];
}

export async function recordReviewOnlyLease({ repository, prNumber, headSha, headBranch, token, request = githubRequestPage }) {
  if (!Number.isInteger(prNumber) || !validGitSha(headSha) || typeof headBranch !== "string" || !headBranch) {
    throw new Error("CODEX_REVIEW_RECEIPT_INVALID");
  }
  const registryAnchorSha = readJson(contractPath).reviewOnlyClassification?.registryAnchorSha;
  if (!validGitSha(registryAnchorSha)) throw new Error("CODEX_REVIEW_RECEIPT_INVALID");
  return recordCheckLedger({
    repository,
    headSha: registryAnchorSha,
    checkName: reviewOnlyLeaseCheckName,
    externalPrefix: `codex-review-only:v1:pr=${prNumber}`,
    payload: { prNumber, headBranch, classifiedHeadSha: headSha },
    token,
    request
  });
}

export async function readReviewOnlyLeases(repository, prNumber, _headSha, token, options = {}) {
  const registryAnchorSha = (options.contract ?? readJson(contractPath)).reviewOnlyClassification?.registryAnchorSha;
  if (!validGitSha(registryAnchorSha)) throw new Error("CODEX_REVIEW_RECEIPT_INVALID");
  const checks = await readNamedCheckRuns(repository, registryAnchorSha, reviewOnlyLeaseCheckName, token, options);
  const parsed = checks.map((check) => {
    let payload;
    try { payload = JSON.parse(check?.output?.summary); } catch { return false; }
    if (!Number.isInteger(payload?.prNumber) || payload.prNumber < 1) return false;
    return parseCheckLedger(check, {
      repository,
      prNumber: payload.prNumber,
      headSha: registryAnchorSha,
      checkName: reviewOnlyLeaseCheckName,
      externalPrefix: `codex-review-only:v1:pr=${payload.prNumber}`
    });
  });
  if (parsed.some((entry) => entry === false || !validGitSha(entry?.classifiedHeadSha) || typeof entry?.headBranch !== "string" || !entry.headBranch)) {
    throw new Error("CODEX_REVIEW_RECEIPT_INVALID");
  }
  return parsed.filter((entry) => entry.prNumber === prNumber);
}

export function reviewOnlyLeaseEventAuthorized({ repository, event, current, contract }) {
  const trustedActors = contract?.trustedRepositoryWriteActors;
  const rootAuthority = Array.isArray(trustedActors) && trustedActors.length === 1 ? trustedActors[0] : null;
  return typeof rootAuthority === "string"
    && event?.pull_request?.head?.repo?.full_name === repository
    && event?.pull_request?.head?.repo?.owner?.login === rootAuthority
    && event?.pull_request?.user?.login === rootAuthority
    && Array.isArray(current?.repositoryWriteActors)
    && current.repositoryWriteActors.length === 1
    && current.repositoryWriteActors[0] === rootAuthority;
}

export async function readMergedLateReviewLedgerSentinels(repository, token, options = {}) {
  const contract = options.contract ?? readJson(contractPath);
  const graphRequestFn = options.graphRequestFn ?? graphRequest;
  const maxPages = options.maxPages ?? contract.boundedReadback?.maxPages ?? 20;
  const [owner, name] = repository.split("/");
  const pullsQuery = `query($owner:String!,$name:String!,$first:Int!,$after:String){repository(owner:$owner,name:$name){pullRequests(states:MERGED,first:$first,after:$after,orderBy:{field:CREATED_AT,direction:DESC}){pageInfo{hasNextPage endCursor}nodes{number mergedAt mergeCommit{oid} headRefName headRefOid commits(last:1){nodes{commit{oid tree{oid}}}}}}}}`;
  const pulls = await paginateGraphConnection({
    query: pullsQuery,
    variables: { owner, name, first: 100 },
    select: (data) => data?.repository?.pullRequests,
    token,
    maxPages,
    request: graphRequestFn
  });
  const minimumPr = contract.providerFindingLedger?.minimumTrackedMergedPr ?? Number.MAX_SAFE_INTEGER;
  const sentinels = [];
  for (const pr of pulls.filter(({ number }) => number >= minimumPr)) {
    const commit = pr.commits?.nodes?.[0]?.commit;
    const headSha = pr.headRefOid ?? commit?.oid;
    if (!validGitSha(headSha)) throw new Error("CODEX_REVIEW_FINDING_LEDGER_INVALID");
    const [persistentFindings, surfaces] = await Promise.all([
      readProviderFindingLedger(repository, pr.number, headSha, token, { maxPages, request: options.request }),
      readProviderReviewSurfaces(repository, pr.number, token, { maxPages, graphRequestFn })
    ]);
    const sentinel = detectLateReview({
      contract,
      current: {
        repository,
        prNumber: pr.number,
        headSha,
        headTree: commit?.tree?.oid ?? null,
        mergedAt: pr.mergedAt,
        mergeSha: pr.mergeCommit?.oid ?? null,
        successorCorrectionOwner: "UNASSIGNED_BLOCKED"
      },
      reviews: surfaces.reviews,
      threads: surfaces.threads,
      issueComments: surfaces.issueComments,
      persistentFindings
    });
    if (sentinel) sentinels.push(sentinel);
  }
  return sentinels;
}

function lateReviewIssueMarker(sentinel) {
  return `<!-- codex-review-late-sentinel:v1 pr=${sentinel.prNumber} merge=${sentinel.mergeSha} -->`;
}

function lateReviewIssueDocument(sentinel) {
  const marker = lateReviewIssueMarker(sentinel);
  return {
    title: `${lateReviewIssueTitlePrefix} PR #${sentinel.prNumber} at ${String(sentinel.mergeSha).slice(0, 12)}`,
    body: `${marker}\n\nThis issue is a durable fail-closed sentinel. Do not auto-close it.\n\n\`\`\`json\n${JSON.stringify(sentinel, null, 2)}\n\`\`\`\n`
  };
}

export function parseLateReviewIssue(issue) {
  const marker = String(issue?.body ?? "").match(/<!--\s*codex-review-late-sentinel:v1\s+pr=(\d+)\s+merge=([0-9a-f]{40})\s*-->/u);
  const payload = String(issue?.body ?? "").match(/```json\s*([\s\S]*?)\s*```/u);
  if (!marker || !payload) return null;
  try {
    const sentinel = JSON.parse(payload[1]);
    if (sentinel?.classification !== "MERGED_WITH_UNRESOLVED_EXACT_HEAD_REVIEW"
      || sentinel?.prNumber !== Number(marker[1])
      || sentinel?.mergeSha !== marker[2]
      || !Array.isArray(sentinel?.findings)
      || (sentinel.findings.every(({ disposition }) => disposition === "RESOLVED") && !lateReviewResolutionStructureValid(sentinel))) return null;
    return sentinel;
  } catch {
    return null;
  }
}

export async function readOpenLateReviewIssues(repository, token, options = {}) {
  const request = options.request ?? githubRequestPage;
  const maxPages = options.maxPages ?? 20;
  const issues = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const url = `https://api.github.com/repos/${repository}/issues?state=all&labels=${encodeURIComponent(lateReviewIssueLabel)}&per_page=100&page=${page}`;
    const result = await request(url, token, { method: "GET" });
    if (!Array.isArray(result?.body)) throw paginationError();
    issues.push(...result.body.map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "",
      htmlUrl: issue.html_url ?? null,
      state: issue.state
    })));
    if (!hasNextRestPage(result.link)) return issues;
    if (page === maxPages) throw paginationError();
  }
  throw paginationError();
}

export async function recordLateReviewIssue({ repository, token, sentinel, request = githubRequestPage, maxPages = 20, resolutionVerifier = verifyLateReviewResolutionGithub }) {
  const marker = lateReviewIssueMarker(sentinel);
  let recordedSentinel = sentinel;
  const existing = (await readOpenLateReviewIssues(repository, token, { request, maxPages }))
    .find(({ body }) => body.includes(marker));
  let document = lateReviewIssueDocument(sentinel);
  if (existing) {
    const claimsResolution = (sentinel.findings ?? []).length > 0
      && sentinel.findings.every(({ disposition }) => disposition === "RESOLVED");
    if (claimsResolution) {
      const verified = typeof resolutionVerifier === "function"
        ? await resolutionVerifier({ repository, token, sentinel, request, maxPages })
        : null;
      if (!lateReviewSentinelResolved(sentinel, { resolutionVerifier: () => verified })) {
        throw new Error("CODEX_REVIEW_RECEIPT_INVALID");
      }
    } else {
      const existingSentinel = parseLateReviewIssue(existing);
      if (!existingSentinel) throw new Error("CODEX_REVIEW_RECEIPT_INVALID");
      const combined = new Map([...(existingSentinel.findings ?? []), ...(sentinel.findings ?? [])]
        .map((finding) => [`${finding.sourceType}:${finding.sourceId}:${finding.bodyHash}`, finding]));
      if (combined.size === (existingSentinel.findings ?? []).length) {
        return { created: false, updated: false, issue: existing };
      }
      recordedSentinel = { ...existingSentinel, ...sentinel, findings: [...combined.values()] };
      delete recordedSentinel.resolutionEvidence;
      document = lateReviewIssueDocument(recordedSentinel);
    }
    const updated = await request(`https://api.github.com/repos/${repository}/issues/${existing.number}`, token, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(document)
    });
    return { created: false, updated: true, issue: updated.body };
  }
  try {
    await request(`https://api.github.com/repos/${repository}/labels`, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: lateReviewIssueLabel,
        color: "b60205",
        description: "Durable fail-closed sentinel for late blocking Codex Review findings"
      })
    });
  } catch (error) {
    if (error.status !== 422) throw error;
  }
  try {
    const created = await request(`https://api.github.com/repos/${repository}/issues`, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...document, labels: [lateReviewIssueLabel] })
    });
    return { created: true, issue: created.body };
  } catch (error) {
    const raced = (await readOpenLateReviewIssues(repository, token, { request, maxPages }))
      .find((issue) => issue.body.includes(marker));
    if (raced) return { created: false, issue: raced };
    throw error;
  }
}

export async function verifyLateReviewResolutionGithub({ repository, token, sentinel, request = githubRequestPage, graphRequestFn = graphRequest, maxPages = 20 }) {
  const failed = (reason) => ({ ok: false, reason, subjectHash: lateReviewResolutionSubjectHash(sentinel), repositoryVerificationHash: null });
  if (!lateReviewResolutionStructureValid(sentinel) || lateReviewAllowedOwners(sentinel).length === 0) return failed("STRUCTURE_OR_OWNER_POLICY");
  const evidence = sentinel.resolutionEvidence;
  if (repository !== sentinel.repository || evidence.successorBranch !== sentinel.successorCorrectionOwner) return failed("REPOSITORY_OR_OWNER");
  try {
    const successor = (await request(`https://api.github.com/repos/${repository}/pulls/${evidence.successorPr}`, token, { method: "GET" })).body;
    if (successor?.merged !== true
      || successor?.head?.ref !== evidence.successorBranch
      || successor?.head?.sha !== evidence.successorHead
      || successor?.merge_commit_sha !== evidence.successorMergeSha
      || successor?.merged_at !== evidence.successorMergedAt) return failed("SUCCESSOR_PR_IDENTITY");
    const commit = (await request(`https://api.github.com/repos/${repository}/git/commits/${evidence.successorHead}`, token, { method: "GET" })).body;
    if (commit?.tree?.sha !== evidence.successorTree) return failed("SUCCESSOR_TREE");

    const successorFiles = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const response = await request(`https://api.github.com/repos/${repository}/pulls/${evidence.successorPr}/files?per_page=100&page=${page}`, token, { method: "GET" });
      if (!Array.isArray(response?.body)
        || response.body.some((file) => typeof file?.filename !== "string"
          || !file.filename
          || typeof file?.status !== "string"
          || !validGitSha(file?.sha)
          || !Number.isInteger(file?.additions)
          || !Number.isInteger(file?.deletions)
          || !Number.isInteger(file?.changes))) return failed("SUCCESSOR_FILES");
      successorFiles.push(...response.body);
      if (!hasNextRestPage(response.link)) break;
      if (page === maxPages) return failed("SUCCESSOR_FILES_PAGINATION");
    }
    if (!successorFiles.length) return failed("SUCCESSOR_FILES");
    const correctionEvidenceHash = lateReviewCorrectionEvidenceHash({
      repository,
      successorPr: evidence.successorPr,
      baseSha: successor?.base?.sha,
      successorHead: evidence.successorHead,
      successorTree: evidence.successorTree,
      successorMergeSha: evidence.successorMergeSha,
      files: successorFiles
    });
    if (evidence.correctionEvidenceHash !== correctionEvidenceHash) return failed("CORRECTION_EVIDENCE");

    const checkRuns = [];
    let totalCount = null;
    for (let page = 1; page <= maxPages; page += 1) {
      const response = await request(`https://api.github.com/repos/${repository}/commits/${evidence.successorHead}/check-runs?check_name=${encodeURIComponent(readJson(contractPath).checkName)}&filter=all&per_page=100&page=${page}`, token, { method: "GET" });
      if (!response?.body
        || !Number.isInteger(response.body.total_count)
        || !Array.isArray(response.body.check_runs)
        || (totalCount !== null && totalCount !== response.body.total_count)) return failed("CHECK_READBACK");
      totalCount = response.body.total_count;
      checkRuns.push(...response.body.check_runs);
      if (!hasNextRestPage(response.link)) {
        if (checkRuns.length !== totalCount) return failed("CHECK_PAGINATION");
        break;
      }
      if (page === maxPages) return failed("CHECK_PAGINATION");
    }
    const exactChecks = checkRuns.filter((check) => check.name === readJson(contractPath).checkName
      && check.status === "completed"
      && check.conclusion === "success"
      && check.head_sha === evidence.successorHead
      && check.app?.slug === "github-actions"
      && check.external_id === evidence.exactHeadReviewReceiptHash
      && check.id === evidence.exactHeadCheckRunId);
    if (exactChecks.length !== 1) return failed("EXACT_HEAD_CHECK");
    let checkPayload;
    try { checkPayload = JSON.parse(exactChecks[0].output?.text); } catch { return failed("EXACT_HEAD_CHECK_PAYLOAD"); }
    const receipt = checkPayload?.receipt;
    if (checkPayload?.codes?.length
      || receipt?.receiptHash !== evidence.exactHeadReviewReceiptHash
      || receipt?.receiptHash !== exactReceiptHash(receipt)
      || receipt?.repository !== repository
      || receipt?.prNumber !== evidence.successorPr
      || receipt?.prHeadSha !== evidence.successorHead
      || receipt?.prHeadTree !== evidence.successorTree
      || receipt?.reviewedCommit !== evidence.successorHead
      || receipt?.reviewCompletedAt !== evidence.exactHeadReviewCompletedAt) return failed("EXACT_HEAD_RECEIPT");

    const sourcePushLeases = await readSourcePushLeases(repository, evidence.successorPr, evidence.successorHead, token, { request, maxPages });
    const sourcePushLeaseHashes = sourcePushLeases.map(({ digest }) => digest).sort();
    const latestSourcePushAt = sourcePushLeases.map(({ pushedAt }) => pushedAt).sort().at(-1);
    const sharedHeadOpenPrNumbers = await readOpenPullRequestNumbersForHead(repository, evidence.successorHead, token, { request, maxPages });
    const receiptEvaluation = evaluateExactHeadReceipt({
      contract: readJson(contractPath),
      current: {
        repository,
        prNumber: evidence.successorPr,
        headSha: evidence.successorHead,
        headTree: evidence.successorTree,
        baseBranch: successor?.base?.ref,
        baseSha: successor?.base?.sha,
        latestSourcePushAt,
        sourcePushLeaseHashes,
        mergedAt: evidence.successorMergedAt,
        mergeSha: evidence.successorMergeSha,
        providerReviewsExist: true,
        reviewOnly: false,
        lateReviewBlocked: false,
        sharedHeadOpenPrNumbers,
        repositoryWriteActors: readJson(contractPath).trustedRepositoryWriteActors
      },
      receipt
    });
    if (!receiptEvaluation.ok) return failed(`EXACT_HEAD_RECEIPT_EVALUATION:${receiptEvaluation.codes.join(",")}`);

    const [owner, name] = repository.split("/");
    const query = `query($owner:String!,$name:String!,$number:Int!,$first:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:$first,after:$after){pageInfo{hasNextPage endCursor}nodes{id isResolved}}}}}`;
    const threads = await paginateGraphConnection({
      query,
      variables: { owner, name, number: sentinel.prNumber, first: 100 },
      select: (data) => data?.repository?.pullRequest?.reviewThreads,
      token,
      maxPages,
      request: graphRequestFn
    });
    const requiredThreads = [...new Set((evidence.resolvedThreadIds ?? []))].sort();
    const resolvedThreads = threads.filter(({ id, isResolved }) => requiredThreads.includes(id) && isResolved === true).map(({ id }) => id).sort();
    if (JSON.stringify(requiredThreads) !== JSON.stringify(resolvedThreads)) return failed("ORIGINAL_THREADS");
    const dispositionEvidenceHash = lateReviewDispositionEvidenceHash({
      repository,
      sentinel,
      exactHeadReceiptHash: receipt.receiptHash,
      resolvedThreadIds: resolvedThreads
    });
    if (evidence.dispositionEvidenceHash !== dispositionEvidenceHash) return failed("DISPOSITION_EVIDENCE");
    const subjectHash = lateReviewResolutionSubjectHash(sentinel);
    const repositoryVerificationHash = sha256(stableValue({
      schemaVersion: 1,
      subjectHash,
      repository,
      originalPr: sentinel.prNumber,
      originalMergeSha: sentinel.mergeSha,
      successorPr: evidence.successorPr,
      successorHead: evidence.successorHead,
      successorTree: evidence.successorTree,
      successorMergeSha: evidence.successorMergeSha,
      successorMergedAt: evidence.successorMergedAt,
      exactHeadCheckRunId: exactChecks[0].id,
      exactHeadReceiptHash: receipt.receiptHash,
      exactHeadReviewCompletedAt: receipt.reviewCompletedAt,
      resolvedThreadIds: resolvedThreads,
      correctionEvidenceHash,
      dispositionEvidenceHash
    }));
    return { ok: true, subjectHash, repositoryVerificationHash };
  } catch (error) {
    return failed(`READBACK:${error.message}`);
  }
}

export async function readProviderReviewSurfaces(repository, prNumber, token, options = {}) {
  const [owner, name] = repository.split("/");
  const maxPages = options.maxPages ?? 20;
  const request = options.graphRequestFn ?? graphRequest;
  const baseVariables = { owner, name, number: prNumber, first: 100 };
  const reviewsQuery = `query($owner:String!,$name:String!,$number:Int!,$first:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviews(first:$first,after:$after){pageInfo{hasNextPage endCursor}nodes{databaseId id author{login}state body createdAt updatedAt submittedAt commit{oid}}}}}}`;
  const threadQuery = `query($owner:String!,$name:String!,$number:Int!,$first:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:$first,after:$after){pageInfo{hasNextPage endCursor}nodes{id isResolved comments(first:$first){pageInfo{hasNextPage endCursor}nodes{databaseId id author{login}body createdAt updatedAt path commit{oid}pullRequestReview{databaseId submittedAt commit{oid}}}}}}}}}`;
  const issueCommentsQuery = `query($owner:String!,$name:String!,$number:Int!,$first:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){comments(first:$first,after:$after){pageInfo{hasNextPage endCursor}nodes{databaseId id author{login}body createdAt updatedAt}}}}}`;
  const [reviewNodes, threadNodes, issueCommentNodes] = await Promise.all([
    paginateGraphConnection({ query: reviewsQuery, variables: baseVariables, select: (data) => data?.repository?.pullRequest?.reviews, token, maxPages, request }),
    paginateGraphConnection({ query: threadQuery, variables: baseVariables, select: (data) => data?.repository?.pullRequest?.reviewThreads, token, maxPages, request }),
    paginateGraphConnection({ query: issueCommentsQuery, variables: baseVariables, select: (data) => data?.repository?.pullRequest?.comments, token, maxPages, request })
  ]);
  const threadCommentsQuery = `query($id:ID!,$first:Int!,$after:String){node(id:$id){... on PullRequestReviewThread{comments(first:$first,after:$after){pageInfo{hasNextPage endCursor}nodes{databaseId id author{login}body createdAt updatedAt path commit{oid}pullRequestReview{databaseId submittedAt commit{oid}}}}}}`;
  for (const thread of threadNodes) {
    const pageInfo = thread.comments?.pageInfo;
    if (!thread.comments
      || !Array.isArray(thread.comments.nodes)
      || !pageInfo
      || typeof pageInfo.hasNextPage !== "boolean"
      || (pageInfo.endCursor !== null && pageInfo.endCursor !== undefined && typeof pageInfo.endCursor !== "string")) throw paginationError();
    if (pageInfo.hasNextPage !== true) continue;
    if (typeof pageInfo.endCursor !== "string" || !pageInfo.endCursor) throw paginationError();
    const remaining = await paginateGraphConnection({
      query: threadCommentsQuery,
      variables: { id: thread.id, first: 100 },
      select: (data) => data?.node?.comments,
      token,
      maxPages: maxPages - 1,
      initialAfter: pageInfo.endCursor,
      request
    });
    const firstPageIds = new Set((thread.comments.nodes ?? []).map(({ id }) => id));
    thread.comments.nodes.push(...remaining.filter(({ id }) => !firstPageIds.has(id)));
  }
  return {
    threads: threadNodes.map((thread) => ({
      threadId: thread.id,
      isResolved: thread.isResolved,
      comments: (thread.comments?.nodes ?? []).map((comment) => ({
        commentId: comment.databaseId,
        commentNodeId: comment.id,
        author: comment.author?.login ?? null,
        body: comment.body,
        createdAt: comment.createdAt,
        updatedAt: comment.updatedAt,
        submittedAt: comment.pullRequestReview?.submittedAt ?? null,
        reviewId: comment.pullRequestReview?.databaseId ?? null,
        reviewCommit: comment.pullRequestReview?.commit?.oid ?? null,
        path: comment.path,
        commit: comment.commit?.oid ?? null
      }))
    })),
    reviews: reviewNodes.map((review) => ({
      reviewId: review.databaseId,
      reviewNodeId: review.id,
      author: review.author?.login ?? null,
      state: review.state,
      body: review.body,
      createdAt: review.createdAt,
      updatedAt: review.updatedAt,
      startedAt: review.createdAt,
      submittedAt: review.submittedAt,
      commit: review.commit?.oid ?? null
    })),
    issueComments: issueCommentNodes.map((comment) => ({
      commentId: comment.databaseId,
      commentNodeId: comment.id,
      author: comment.author?.login ?? null,
      body: comment.body,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt
    }))
  };
}

async function readPullRequest(repository, prNumber, token, contract, sourcePushFloorAt = null) {
  const [owner, name] = repository.split("/");
  const maxPages = contract.boundedReadback?.maxPages ?? 20;
  const metadataQuery = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){number merged mergedAt mergeCommit{oid} headRefName headRefOid baseRefName baseRefOid commits(last:1){nodes{commit{oid committedDate tree{oid}}}}}}}`;
  const metadata = await graphRequest(metadataQuery, { owner, name, number: prNumber }, token);
  const pr = metadata?.repository?.pullRequest;
  if (!pr) throw new Error("GITHUB_PULL_REQUEST_MISSING");
  const baseVariables = { owner, name, number: prNumber, first: 100 };
  const labelsQuery = `query($owner:String!,$name:String!,$number:Int!,$first:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){labels(first:$first,after:$after){pageInfo{hasNextPage endCursor}nodes{name}}}}}`;
  const writeActorsPromise = (async () => {
    const actors = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const response = await githubRequestPage(`https://api.github.com/repos/${repository}/collaborators?affiliation=all&per_page=100&page=${page}`, token, { method: "GET" });
      if (!Array.isArray(response?.body)) throw paginationError();
      actors.push(...response.body.filter((actor) => actor?.permissions?.push === true || actor?.permissions?.maintain === true || actor?.permissions?.admin === true));
      if (!hasNextRestPage(response.link)) return [...new Set(actors.map(({ login }) => login).filter(Boolean))].sort();
      if (page === maxPages) throw paginationError();
    }
    throw paginationError();
  })();
  const sharedHeadPullsPromise = readOpenPullRequestNumbersForHead(repository, pr.headRefOid, token, { maxPages });
  const [labelNodes, surfaces, repositoryWriteActors, sharedHeadOpenPrNumbers] = await Promise.all([
    paginateGraphConnection({ query: labelsQuery, variables: baseVariables, select: (data) => data?.repository?.pullRequest?.labels, token, maxPages }),
    readProviderReviewSurfaces(repository, prNumber, token, { maxPages }),
    writeActorsPromise,
    sharedHeadPullsPromise
  ]);
  const commit = pr.commits?.nodes?.[0]?.commit;
  let sourcePushLeases = [];
  let persistentProviderFindings = [];
  let reviewOnlyLeases = [];
  let sourceReadbackIncomplete = false;
  let sourceReadbackCode = null;
  try {
    sourcePushLeases = (await readSourcePushLeases(repository, prNumber, pr.headRefOid, token, { maxPages }))
      .filter((lease) => lease.baseBranch === pr.baseRefName && lease.baseSha === pr.baseRefOid);
  } catch (error) {
    if (String(error.message).startsWith("GITHUB_HTTP_404:")) sourcePushLeases = [];
    else if ([paginationIncompleteCode, "CODEX_REVIEW_SOURCE_PUSH_LEASE_INVALID"].includes(error.message)) {
      sourceReadbackIncomplete = true;
      sourceReadbackCode = error.message;
    }
    else throw error;
  }
  try {
    persistentProviderFindings = await readProviderFindingLedger(repository, prNumber, pr.headRefOid, token, { maxPages });
    reviewOnlyLeases = await readReviewOnlyLeases(repository, prNumber, pr.headRefOid, token, { maxPages });
  } catch (error) {
    if ([paginationIncompleteCode, "CODEX_REVIEW_FINDING_LEDGER_INVALID", "CODEX_REVIEW_RECEIPT_INVALID"].includes(error.message)) {
      sourceReadbackIncomplete = true;
      sourceReadbackCode = error.message;
    } else throw error;
  }
  const latestSourcePushAt = [commit?.committedDate, sourcePushFloorAt, ...sourcePushLeases.map(({ pushedAt }) => pushedAt)]
    .filter(validInstant)
    .sort()
    .at(-1);
  const { reviews, threads, issueComments } = surfaces;
  return {
    current: {
      repository,
      prNumber,
      headSha: pr.headRefOid,
      headBranch: pr.headRefName,
      headTree: commit?.tree?.oid ?? null,
      baseBranch: pr.baseRefName,
      baseSha: pr.baseRefOid,
      latestSourcePushAt,
      sourcePushLeaseHashes: sourcePushLeases.map(({ digest }) => digest).sort(),
      mergedAt: pr.mergedAt,
      mergeSha: pr.mergeCommit?.oid ?? null,
      providerReviewsExist: false,
      labels: labelNodes.map(({ name: label }) => label).filter(Boolean).sort(),
      reviewOnlyLeasePresent: reviewOnlyLeases.length > 0,
      sourceReadbackIncomplete,
      sourceReadbackCode,
      repositoryWriteActors,
      sharedHeadOpenPrNumbers
    },
    reviews,
    threads,
    issueComments,
    persistentProviderFindings,
    readbackIncomplete: false
  };
}

async function publishCheck({ repository, headSha, checkName, evaluation, token }) {
  const summary = evaluation.ok
    ? `PASS ${evaluation.receipt.receiptHash}`
    : `FAIL ${evaluation.codes.join(",")}`;
  return githubRequest(`https://api.github.com/repos/${repository}/check-runs`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: checkName,
      head_sha: headSha,
      status: "completed",
      conclusion: evaluation.ok ? "success" : "failure",
      external_id: evaluation.receipt?.receiptHash ?? evaluation.codes.join(","),
      output: {
        title: evaluation.ok ? "Exact-head Codex Review is current" : "Exact-head Codex Review is blocked",
        summary,
        text: JSON.stringify({ codes: evaluation.codes, receipt: evaluation.receipt }, null, 2).slice(0, 60000)
      }
    })
  });
}

async function main() {
  const options = args();
  const contract = readJson(contractPath);
  let current;
  let reviews;
  let threads;
  let issueComments;
  let persistentProviderFindings = [];
  let readbackIncomplete = false;
  let token = null;
  let event = {};
  let eventName = options.eventName ?? process.env.GITHUB_EVENT_NAME ?? "";
  if (options.fixture) {
    ({ current, reviews = [], threads = [], issueComments = [], persistentProviderFindings = [], readbackIncomplete = false } = JSON.parse(readText(options.fixture)));
  } else {
    const repository = options.repository ?? process.env.GITHUB_REPOSITORY;
    token = process.env.GITHUB_TOKEN;
    event = options.event ? JSON.parse(readText(options.event)) : {};
    const prNumber = Number(options.prNumber ?? event.pull_request?.number ?? (event.issue?.pull_request ? event.issue.number : null));
    if (!repository || !Number.isInteger(prNumber) || prNumber < 1 || !token) throw new Error("CODEX_REVIEW_INPUT_MISSING");
    let sourcePushFloorAt = null;
    let admissionHead = null;
    const sourceAdmissionEvent = eventName === "pull_request_target"
      && (["opened", "synchronize", "reopened", "ready_for_review"].includes(event.action)
        || (event.action === "edited" && event.changes?.base));
    if (sourceAdmissionEvent) {
      const eventHead = event.pull_request?.head?.sha;
      const eventBaseBranch = event.pull_request?.base?.ref;
      const eventBaseSha = event.pull_request?.base?.sha;
      if (!validGitSha(eventHead)
        || typeof eventBaseBranch !== "string"
        || !validGitSha(eventBaseSha)
        || !/^\d+$/u.test(process.env.GITHUB_RUN_ID ?? "")) {
        throw new Error("CODEX_REVIEW_SOURCE_PUSH_LEASE_INVALID");
      }
      const currentRun = await githubRequest(`https://api.github.com/repos/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`, token);
      if (!validInstant(currentRun?.created_at)) throw new Error("CODEX_REVIEW_SOURCE_PUSH_LEASE_INVALID");
      sourcePushFloorAt = currentRun.created_at;
      admissionHead = eventHead;
      await recordSourcePushLease({
        repository,
        prNumber,
        headSha: eventHead,
        baseBranch: eventBaseBranch,
        baseSha: eventBaseSha,
        pushedAt: sourcePushFloorAt,
        token
      });
    }
    ({ current, reviews, threads, issueComments, persistentProviderFindings, readbackIncomplete } = await readPullRequest(repository, prNumber, token, contract, sourcePushFloorAt));
    if (admissionHead && (current.headSha !== admissionHead
      || current.baseBranch !== event.pull_request?.base?.ref
      || current.baseSha !== event.pull_request?.base?.sha)) throw new Error("CODEX_REVIEW_SOURCE_PUSH_LEASE_INVALID");
    const truth = readJson("config/assurance/current-truth-v1.json");
    const eventCreatesReviewOnlyLease = eventName === "pull_request_target"
      && current.headBranch.startsWith(reviewOnlyBranchPrefix)
      && reviewOnlyLeaseEventAuthorized({ repository, event, current, contract })
      && (sourceAdmissionEvent || (event.action === "labeled" && event.label?.name === reviewOnlyLabel));
    if (eventCreatesReviewOnlyLease) {
      await recordReviewOnlyLease({ repository, prNumber, headSha: current.headSha, headBranch: current.headBranch, token });
      current.reviewOnlyLeasePresent = true;
    }
    current.reviewOnly = isReviewOnlyPullRequest({
      headBranch: current.headBranch,
      reviewOnlyLeasePresent: current.reviewOnlyLeasePresent,
      truthEntries: truth.openReviewOnlyPrs ?? [],
      prNumber
    });
    const matchingLateSentinel = (truth.lateReviewSentinels ?? []).find(({ prNumber: mergedPr }) => mergedPr === prNumber);
    current.successorCorrectionOwner = matchingLateSentinel?.successorCorrectionOwner ?? null;
    let durableLateSentinels = [];
    let globalLateLedgerSentinels = [];
    const verifiedDurableResolutions = [];
    try {
      const durableIssues = await readOpenLateReviewIssues(repository, token, { maxPages: contract.lateReviewIssue?.maxReadPages ?? 20 });
      durableLateSentinels = durableIssues.map(parseLateReviewIssue);
      if (durableLateSentinels.some((sentinel) => !sentinel)) readbackIncomplete = true;
      durableLateSentinels = durableLateSentinels.filter(Boolean);
      for (const sentinel of durableLateSentinels) {
        if (!sentinel.findings?.every(({ disposition }) => disposition === "RESOLVED")) continue;
        const verified = await verifyLateReviewResolutionGithub({ repository, token, sentinel, maxPages: contract.lateReviewIssue?.maxReadPages ?? 20 });
        verifiedDurableResolutions.push({ sentinel, verified });
      }
      globalLateLedgerSentinels = await readMergedLateReviewLedgerSentinels(repository, token, {
        contract,
        maxPages: contract.lateReviewIssue?.maxReadPages ?? 20
      });
    } catch (error) {
      if (error.message === paginationIncompleteCode) readbackIncomplete = true;
      else throw error;
    }
    current.openDurableLateReviewSentinels = durableLateSentinels;
    current.globalLateLedgerSentinels = globalLateLedgerSentinels;
    const unresolvedDurable = durableLateSentinels.filter((sentinel) => !sentinel.findings?.every(({ disposition }) => disposition === "RESOLVED"));
    const allLateSentinels = mergeLateReviewSentinelRecords([...globalLateLedgerSentinels, ...(truth.lateReviewSentinels ?? []), ...unresolvedDurable]);
    current.lateReviewBlocked = allLateSentinels.some((sentinel) => {
      const resolved = verifiedDurableResolutions.some(({ sentinel: resolution, verified }) => resolution.repository === sentinel.repository
        && resolution.prNumber === sentinel.prNumber
        && resolution.mergeSha === sentinel.mergeSha
        && lateReviewFindingSetEqual(resolution.findings, sentinel.findings)
        && lateReviewSentinelResolved(resolution, { resolutionVerifier: () => verified }));
      const allowedOwners = lateReviewAllowedOwners(sentinel);
      return !resolved && !allowedOwners.includes(current.headBranch);
    });
  }
  const providers = new Set(contract.reviewProviders);
  const providerReviews = reviews.filter(({ author }) => providers.has(author));
  current.providerReviewsExist = providerReviews.length > 0;
  const exactReviews = providerReviews
    .filter(({ commit, submittedAt }) => commit === current.headSha && validInstant(submittedAt))
    .sort((left, right) => left.submittedAt.localeCompare(right.submittedAt));
  const selectedReview = exactReviews.at(-1) ?? null;
  const latestProviderReview = providerReviews.filter(({ submittedAt }) => validInstant(submittedAt)).sort((left, right) => left.submittedAt.localeCompare(right.submittedAt)).at(-1) ?? null;
  const eventFinding = normalizeLateReviewEvent({ eventName, event, contract });
  if (eventFinding && token) {
    try {
      await recordProviderFindingLedger({ repository: current.repository, prNumber: current.prNumber, headSha: current.headSha, finding: eventFinding, token });
      persistentProviderFindings = [...persistentProviderFindings, eventFinding];
    } catch (error) {
      readbackIncomplete = true;
      current.sourceReadbackIncomplete = true;
      current.sourceReadbackCode = error.message === paginationIncompleteCode ? paginationIncompleteCode : "CODEX_REVIEW_FINDING_LEDGER_INVALID";
    }
  }
  const receipt = selectedReview ? buildExactHeadReceipt({ contract, current, review: selectedReview, reviews, threads, issueComments, persistentFindings: persistentProviderFindings }) : null;
  const evaluation = evaluateExactHeadReceipt({ contract, current, receipt, readbackIncomplete });
  const lateReviewSentinel = detectLateReview({
    contract,
    current,
    review: latestProviderReview,
    reviews,
    threads,
    issueComments,
    eventFindings: eventFinding ? [eventFinding] : [],
    persistentFindings: persistentProviderFindings
  });
  let durableLateReviewIssue = null;
  if (lateReviewSentinel) {
    evaluation.ok = false;
    evaluation.codes = [...new Set([...evaluation.codes, "CODEX_REVIEW_LATE_POST_MERGE"])].sort();
    if (token) {
      try {
        durableLateReviewIssue = await recordLateReviewIssue({ repository: current.repository, token, sentinel: lateReviewSentinel });
      } catch (error) {
        evaluation.codes = [...new Set([...evaluation.codes, error.message === paginationIncompleteCode ? paginationIncompleteCode : "CODEX_REVIEW_RECEIPT_INVALID"])].sort();
        evaluation.durableLateReviewIssueError = error.message;
      }
    }
  }
  if (token && options.publish !== "false") {
    try {
      const check = await publishCheck({ repository: current.repository, headSha: current.headSha, checkName: contract.checkName, evaluation, token });
      evaluation.checkRunId = check.id;
    } catch (error) {
      evaluation.ok = false;
      evaluation.codes = [...new Set([...evaluation.codes, "CODEX_REVIEW_RECEIPT_INVALID"])].sort();
      evaluation.publishError = error.message;
    }
  }
  emit("assurance:codex-review-exact-head", evaluation.ok, {
    classification: lateReviewSentinel?.classification ?? (evaluation.ok ? "EXACT_HEAD_REVIEW_COMPLETE" : "EXACT_HEAD_REVIEW_BLOCKED"),
    codes: evaluation.codes,
    receipt: evaluation.receipt,
    lateReviewSentinel,
    durableLateReviewIssue,
    durableLateReviewIssueError: evaluation.durableLateReviewIssueError ?? null,
    checkRunId: evaluation.checkRunId ?? null,
    publishError: evaluation.publishError ?? null
  }, [`${contract.checkName}: ${evaluation.ok ? "PASS" : "FAIL"} — ${evaluation.codes.join(",") || evaluation.receipt.receiptHash}`]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => emit("assurance:codex-review-exact-head", false, {
    classification: "EXACT_HEAD_REVIEW_BLOCKED",
    codes: [[paginationIncompleteCode, "CODEX_REVIEW_SOURCE_PUSH_LEASE_INVALID", "CODEX_REVIEW_FINDING_LEDGER_INVALID"].includes(error.message)
      ? error.message
      : "CODEX_REVIEW_RECEIPT_INVALID"],
    error: error.message
  }));
}
