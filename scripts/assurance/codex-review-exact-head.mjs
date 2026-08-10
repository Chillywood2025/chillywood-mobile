#!/usr/bin/env node
import { args, emit, readJson, readText, sha256, stableValue } from "./lib.mjs";

const contractPath = "config/assurance/codex-review-exact-head-v1.json";
const paginationIncompleteCode = "CODEX_REVIEW_READBACK_PAGINATION_INCOMPLETE";
const providerCommentHeadUnboundCode = "CODEX_REVIEW_PROVIDER_COMMENT_HEAD_UNBOUND";
const severityOrder = new Map([["P0", 0], ["P1", 1], ["P2", 2], ["P3", 3]]);
export const lateReviewIssueLabel = "codex-review-late-sentinel";
export const lateReviewIssueTitlePrefix = "[Codex Review Late Sentinel]";
export const reviewOnlyLabel = "assurance-review-only";

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

function normalizeProviderFindings({ contract, current, reviews = [], threads = [], issueComments = [] }) {
  const providers = new Set(contract.reviewProviders ?? []);
  const acceptableStates = new Set(contract.acceptableReviewStates ?? []);
  const providerReviews = reviews.filter(({ author }) => providers.has(author));
  const laterExactProviderReview = (after) => validInstant(after) && providerReviews.some((candidate) => candidate.commit === current.headSha
    && acceptableStates.has(candidate.state)
    && validInstant(candidate.submittedAt)
    && new Date(candidate.submittedAt) > new Date(after));
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
        updatedAt: comment.updatedAt,
        edited: validInstant(comment.updatedAt) && validInstant(comment.createdAt) && comment.updatedAt !== comment.createdAt,
        reviewedCommit: comment.commit,
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
    if (!reviewedCommit) unboundProviderCommentIds.push(comment.commentNodeId ?? comment.commentId);
    const severity = severityFromBody(comment.body);
    if (!severity && reviewedCommit) continue;
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

  return {
    findings: findings.sort((left, right) => left.findingId.localeCompare(right.findingId)),
    unboundProviderCommentIds: [...new Set(unboundProviderCommentIds)].sort()
  };
}

export function exactReceiptHash(receipt) {
  const payload = structuredClone(receipt ?? {});
  delete payload.receiptHash;
  return sha256(stableValue(payload));
}

export function buildExactHeadReceipt({ contract, current, review, reviews = null, threads, issueComments = [] }) {
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
  const exactProviderComments = providerComments.filter(({ commit }) => commit === current.headSha);
  const startedCandidates = [review.startedAt, ...exactProviderComments.map(({ createdAt }) => createdAt), review.submittedAt]
    .filter(validInstant)
    .sort();
  const normalized = normalizeProviderFindings({ contract, current, reviews: allReviews, threads, issueComments });
  const receipt = {
    schemaVersion: 1,
    contractId: contract.contractId,
    repository: current.repository,
    prNumber: current.prNumber,
    prHeadSha: current.headSha,
    prHeadTree: current.headTree,
    reviewProvider: review.author,
    reviewId: review.reviewId,
    reviewState: review.state,
    reviewedCommit: review.commit,
    reviewStartedAt: startedCandidates[0] ?? review.submittedAt,
    reviewCompletedAt: review.submittedAt,
    latestSourcePushAt: current.latestSourcePushAt,
    reviewSubmissions,
    reviewComments: providerComments,
    reviewThreads: normalizedThreads,
    providerIssueComments,
    reviewFindings: normalized.findings,
    providerCommentHeadUnbound: normalized.unboundProviderCommentIds
  };
  receipt.receiptHash = exactReceiptHash(receipt);
  return receipt;
}

export function evaluateExactHeadReceipt({ contract, current, receipt, readbackIncomplete = false }) {
  const codes = [];
  if (readbackIncomplete) codes.push(paginationIncompleteCode);
  if (current.sourceReadbackIncomplete === true) codes.push("CODEX_REVIEW_INCOMPLETE");
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
    || !validGitSha(receipt.reviewedCommit)
    || !(contract.reviewProviders ?? []).includes(receipt.reviewProvider)
    || !Number.isInteger(receipt.reviewId)
    || receipt.reviewId < 1
    || !(contract.acceptableReviewStates ?? []).includes(receipt.reviewState)
    || !validInstant(receipt.reviewStartedAt)
    || !validInstant(receipt.reviewCompletedAt)
    || !validInstant(receipt.latestSourcePushAt)
    || !Array.isArray(receipt.reviewComments)
    || !Array.isArray(receipt.reviewSubmissions)
    || !Array.isArray(receipt.reviewThreads)
    || !Array.isArray(receipt.providerIssueComments)
    || !Array.isArray(receipt.reviewFindings)
    || !Array.isArray(receipt.providerCommentHeadUnbound)
    || receipt.receiptHash !== exactReceiptHash(receipt)) {
    codes.push("CODEX_REVIEW_RECEIPT_INVALID");
  }
  if (receipt.reviewedCommit !== current.headSha || receipt.prHeadSha !== current.headSha || receipt.prHeadTree !== current.headTree) {
    codes.push("CODEX_REVIEW_STALE_HEAD");
  }
  if (receipt.latestSourcePushAt !== current.latestSourcePushAt
    || new Date(receipt.reviewCompletedAt).valueOf() <= new Date(current.latestSourcePushAt).valueOf()) {
    codes.push("CODEX_REVIEW_INCOMPLETE");
  }
  if ((receipt.providerCommentHeadUnbound ?? []).length) codes.push(providerCommentHeadUnboundCode);
  const unresolvedThreads = (receipt.reviewThreads ?? []).filter(({ resolutionState }) => resolutionState !== "RESOLVED");
  if (unresolvedThreads.length) codes.push("CODEX_REVIEW_BLOCKING_THREAD_OPEN");
  const blocking = new Set(contract.blockingSeverities ?? []);
  if ((receipt.reviewFindings ?? []).some(({ severity, disposition }) => blocking.has(severity) && disposition !== "RESOLVED_BY_LATER_PROVIDER_REREVIEW")) {
    codes.push("CODEX_REVIEW_UNRESOLVED_FINDING");
  }
  return { ok: codes.length === 0, codes: [...new Set(codes)].sort(), receipt };
}

export function detectLateReview({ contract, current, review = null, reviews = null, threads = [], issueComments = [] }) {
  if (!validInstant(current.mergedAt)) return null;
  const allReviews = Array.isArray(reviews) ? reviews : (review ? [review] : []);
  const normalized = normalizeProviderFindings({ contract, current, reviews: allReviews, threads, issueComments });
  const blocking = new Set(contract.blockingSeverities ?? []);
  const findings = normalized.findings
    .filter((finding) => validInstant(finding.updatedAt)
      && new Date(finding.updatedAt) > new Date(current.mergedAt)
      && finding.disposition !== "RESOLVED_BY_LATER_PROVIDER_REREVIEW"
      && blocking.has(finding.severity))
    .map((finding) => ({
      commentId: finding.sourceType === "REVIEW_BODY" ? null : finding.sourceId,
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
    reviewId: review?.reviewId ?? null,
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

export async function paginateGraphConnection({ query, variables, select, token, maxPages, request = graphRequest }) {
  const nodes = [];
  let after = null;
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await request(query, { ...variables, after }, token);
    const connection = select(data);
    if (!connection || !Array.isArray(connection.nodes)) throw paginationError();
    nodes.push(...connection.nodes);
    if (connection.pageInfo?.hasNextPage !== true) return nodes;
    if (typeof connection.pageInfo?.endCursor !== "string" || !connection.pageInfo.endCursor || page === maxPages) throw paginationError();
    after = connection.pageInfo.endCursor;
  }
  throw paginationError();
}

function hasNextRestPage(link) {
  return /<[^>]+>;\s*rel="next"/u.test(link ?? "");
}

function lateReviewIssueMarker(sentinel) {
  return `<!-- codex-review-late-sentinel:v1 pr=${sentinel.prNumber} merge=${sentinel.mergeSha} -->`;
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
      || !sentinel.findings.some(({ disposition }) => disposition !== "RESOLVED")) return null;
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

export async function recordLateReviewIssue({ repository, token, sentinel, request = githubRequestPage, maxPages = 20 }) {
  const marker = lateReviewIssueMarker(sentinel);
  const existing = (await readOpenLateReviewIssues(repository, token, { request, maxPages }))
    .find(({ body }) => body.includes(marker));
  if (existing) return { created: false, issue: existing };
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
  const title = `${lateReviewIssueTitlePrefix} PR #${sentinel.prNumber} at ${String(sentinel.mergeSha).slice(0, 12)}`;
  const body = `${marker}\n\nThis issue is a durable fail-closed sentinel. Do not auto-close it.\n\n\`\`\`json\n${JSON.stringify(sentinel, null, 2)}\n\`\`\`\n`;
  try {
    const created = await request(`https://api.github.com/repos/${repository}/issues`, token, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body, labels: [lateReviewIssueLabel] })
    });
    return { created: true, issue: created.body };
  } catch (error) {
    const raced = (await readOpenLateReviewIssues(repository, token, { request, maxPages }))
      .find((issue) => issue.body.includes(marker));
    if (raced) return { created: false, issue: raced };
    throw error;
  }
}

async function readPullRequest(repository, prNumber, token, contract) {
  const [owner, name] = repository.split("/");
  const maxPages = contract.boundedReadback?.maxPages ?? 20;
  const metadataQuery = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){number merged mergedAt mergeCommit{oid} headRefName headRefOid commits(last:1){nodes{commit{oid committedDate tree{oid}}}}}}}`;
  const metadata = await graphRequest(metadataQuery, { owner, name, number: prNumber }, token);
  const pr = metadata?.repository?.pullRequest;
  if (!pr) throw new Error("GITHUB_PULL_REQUEST_MISSING");
  const baseVariables = { owner, name, number: prNumber, first: 100 };
  const labelsQuery = `query($owner:String!,$name:String!,$number:Int!,$first:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){labels(first:$first,after:$after){pageInfo{hasNextPage endCursor}nodes{name}}}}}`;
  const reviewsQuery = `query($owner:String!,$name:String!,$number:Int!,$first:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviews(first:$first,after:$after){pageInfo{hasNextPage endCursor}nodes{databaseId id author{login}state body createdAt updatedAt submittedAt commit{oid}}}}}}`;
  const threadQuery = `query($owner:String!,$name:String!,$number:Int!,$first:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:$first,after:$after){pageInfo{hasNextPage endCursor}nodes{id isResolved comments(first:$first){pageInfo{hasNextPage endCursor}nodes{databaseId id author{login}body createdAt updatedAt path commit{oid}}}}}}}}`;
  const issueCommentsQuery = `query($owner:String!,$name:String!,$number:Int!,$first:Int!,$after:String){repository(owner:$owner,name:$name){pullRequest(number:$number){comments(first:$first,after:$after){pageInfo{hasNextPage endCursor}nodes{databaseId id author{login}body createdAt updatedAt}}}}}`;
  const [labelNodes, reviewNodes, threadNodes, issueCommentNodes] = await Promise.all([
    paginateGraphConnection({ query: labelsQuery, variables: baseVariables, select: (data) => data?.repository?.pullRequest?.labels, token, maxPages }),
    paginateGraphConnection({ query: reviewsQuery, variables: baseVariables, select: (data) => data?.repository?.pullRequest?.reviews, token, maxPages }),
    paginateGraphConnection({ query: threadQuery, variables: baseVariables, select: (data) => data?.repository?.pullRequest?.reviewThreads, token, maxPages }),
    paginateGraphConnection({ query: issueCommentsQuery, variables: baseVariables, select: (data) => data?.repository?.pullRequest?.comments, token, maxPages })
  ]);
  const threadCommentsQuery = `query($id:ID!,$first:Int!,$after:String){node(id:$id){... on PullRequestReviewThread{comments(first:$first,after:$after){pageInfo{hasNextPage endCursor}nodes{databaseId id author{login}body createdAt updatedAt path commit{oid}}}}}}`;
  for (const thread of threadNodes) {
    if (thread.comments?.pageInfo?.hasNextPage !== true) continue;
    const remaining = await paginateGraphConnection({
      query: threadCommentsQuery,
      variables: { id: thread.id, first: 100 },
      select: (data) => data?.node?.comments,
      token,
      maxPages
    });
    const firstPageIds = new Set((thread.comments.nodes ?? []).map(({ id }) => id));
    thread.comments.nodes.push(...remaining.filter(({ id }) => !firstPageIds.has(id)));
  }
  const commit = pr.commits?.nodes?.[0]?.commit;
  let workflowRuns = { total_count: 0, workflow_runs: [] };
  try {
    workflowRuns = await githubRequest(`https://api.github.com/repos/${repository}/actions/workflows/codex-review-exact-head.yml/runs?head_sha=${pr.headRefOid}&per_page=100`, token);
  } catch (error) {
    if (!String(error.message).startsWith("GITHUB_HTTP_404:")) throw error;
  }
  const sourceGateStarts = (workflowRuns.workflow_runs ?? [])
    .filter(({ event }) => event === "pull_request_target")
    .map(({ created_at: createdAt }) => createdAt)
    .filter(validInstant);
  let sourceReadbackIncomplete = false;
  if (process.env.GITHUB_EVENT_NAME === "pull_request_target" && /^\d+$/u.test(process.env.GITHUB_RUN_ID ?? "")) {
    try {
      const currentRun = await githubRequest(`https://api.github.com/repos/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`, token);
      if (validInstant(currentRun.created_at)) sourceGateStarts.push(currentRun.created_at);
    } catch {
      sourceReadbackIncomplete = true;
    }
  }
  const latestSourcePushAt = [commit?.committedDate, ...sourceGateStarts].filter(validInstant).sort().at(-1);
  const threads = threadNodes.map((thread) => ({
    threadId: thread.id,
    isResolved: thread.isResolved,
    comments: (thread.comments?.nodes ?? []).map((comment) => ({
      commentId: comment.databaseId,
      commentNodeId: comment.id,
      author: comment.author?.login ?? null,
      body: comment.body,
      createdAt: comment.createdAt,
      updatedAt: comment.updatedAt,
      path: comment.path,
      commit: comment.commit?.oid ?? null
    }))
  }));
  const reviews = reviewNodes.map((review) => ({
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
  }));
  const issueComments = issueCommentNodes.map((comment) => ({
    commentId: comment.databaseId,
    commentNodeId: comment.id,
    author: comment.author?.login ?? null,
    body: comment.body,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt
  }));
  return {
    current: {
      repository,
      prNumber,
      headSha: pr.headRefOid,
      headBranch: pr.headRefName,
      headTree: commit?.tree?.oid ?? null,
      latestSourcePushAt,
      mergedAt: pr.mergedAt,
      mergeSha: pr.mergeCommit?.oid ?? null,
      providerReviewsExist: false,
      labels: labelNodes.map(({ name: label }) => label).filter(Boolean).sort(),
      sourceReadbackIncomplete
    },
    reviews,
    threads,
    issueComments,
    readbackIncomplete: (workflowRuns.total_count ?? 0) > 100
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
  let readbackIncomplete = false;
  let token = null;
  if (options.fixture) {
    ({ current, reviews = [], threads = [], issueComments = [], readbackIncomplete = false } = JSON.parse(readText(options.fixture)));
  } else {
    const repository = options.repository ?? process.env.GITHUB_REPOSITORY;
    token = process.env.GITHUB_TOKEN;
    const event = options.event ? JSON.parse(readText(options.event)) : {};
    const prNumber = Number(options.prNumber ?? event.pull_request?.number ?? (event.issue?.pull_request ? event.issue.number : null));
    if (!repository || !Number.isInteger(prNumber) || prNumber < 1 || !token) throw new Error("CODEX_REVIEW_INPUT_MISSING");
    ({ current, reviews, threads, issueComments, readbackIncomplete } = await readPullRequest(repository, prNumber, token, contract));
    const truth = readJson("config/assurance/current-truth-v1.json");
    current.reviewOnly = current.labels.includes(reviewOnlyLabel)
      || (truth.openReviewOnlyPrs ?? []).some(({ number, disposition }) => number === prNumber && String(disposition).includes("never-merge"));
    const matchingLateSentinel = (truth.lateReviewSentinels ?? []).find(({ prNumber: mergedPr }) => mergedPr === prNumber);
    current.successorCorrectionOwner = matchingLateSentinel?.successorCorrectionOwner ?? null;
    let durableLateSentinels = [];
    try {
      const durableIssues = await readOpenLateReviewIssues(repository, token, { maxPages: contract.lateReviewIssue?.maxReadPages ?? 20 });
      durableLateSentinels = durableIssues.map(parseLateReviewIssue);
      if (durableLateSentinels.some((sentinel) => !sentinel)) readbackIncomplete = true;
      durableLateSentinels = durableLateSentinels.filter(Boolean);
    } catch (error) {
      if (error.message === paginationIncompleteCode) readbackIncomplete = true;
      else throw error;
    }
    current.openDurableLateReviewSentinels = durableLateSentinels;
    current.lateReviewBlocked = [...(truth.lateReviewSentinels ?? []), ...durableLateSentinels].some((sentinel) => {
      const unresolved = (sentinel.findings ?? []).some(({ disposition }) => disposition !== "RESOLVED");
      const allowedOwners = [sentinel.successorCorrectionOwner, sentinel.assuranceControlOwner, ...(sentinel.authorizedBootstrapOwners ?? [])];
      return unresolved && !allowedOwners.includes(current.headBranch);
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
  const receipt = selectedReview ? buildExactHeadReceipt({ contract, current, review: selectedReview, reviews, threads, issueComments }) : null;
  const evaluation = evaluateExactHeadReceipt({ contract, current, receipt, readbackIncomplete });
  const lateReviewSentinel = detectLateReview({ contract, current, review: latestProviderReview, reviews, threads, issueComments });
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
    codes: [error.message === paginationIncompleteCode ? paginationIncompleteCode : "CODEX_REVIEW_RECEIPT_INVALID"],
    error: error.message
  }));
}
