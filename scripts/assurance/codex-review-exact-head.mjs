#!/usr/bin/env node
import { args, emit, readJson, readText, sha256, stableValue } from "./lib.mjs";

const contractPath = "config/assurance/codex-review-exact-head-v1.json";
const severityOrder = new Map([["P0", 0], ["P1", 1], ["P2", 2], ["P3", 3]]);

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
  return highestSeverity([...String(body ?? "").matchAll(/\bP([0-3])\b/gu)].map((match) => `P${match[1]}`));
}

export function exactReceiptHash(receipt) {
  const payload = structuredClone(receipt ?? {});
  delete payload.receiptHash;
  return sha256(stableValue(payload));
}

export function buildExactHeadReceipt({ contract, current, review, threads }) {
  const providerNames = new Set(contract.reviewProviders ?? []);
  const normalizedThreads = (Array.isArray(threads) ? threads : [])
    .map((thread) => {
      const comments = (thread.comments ?? []).map((comment) => ({
        commentId: comment.commentId,
        commentNodeId: comment.commentNodeId,
        author: comment.author,
        createdAt: comment.createdAt,
        commit: comment.commit,
        path: comment.path ?? null
      }));
      const providerComments = (thread.comments ?? []).filter(({ author }) => providerNames.has(author));
      const severity = highestSeverity(providerComments.map(({ body }) => severityFromBody(body)));
      return {
        threadId: thread.threadId,
        resolutionState: thread.isResolved === true ? "RESOLVED" : "UNRESOLVED",
        findingSeverity: severity,
        findingDisposition: thread.isResolved === true ? "RESOLVED" : "UNRESOLVED",
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
    reviewComments: providerComments,
    reviewThreads: normalizedThreads
  };
  receipt.receiptHash = exactReceiptHash(receipt);
  return receipt;
}

export function evaluateExactHeadReceipt({ contract, current, receipt, readbackIncomplete = false }) {
  const codes = [];
  if (readbackIncomplete) codes.push("CODEX_REVIEW_INCOMPLETE");
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
    || !Array.isArray(receipt.reviewThreads)
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
  const unresolvedThreads = (receipt.reviewThreads ?? []).filter(({ resolutionState }) => resolutionState !== "RESOLVED");
  if (unresolvedThreads.length) codes.push("CODEX_REVIEW_BLOCKING_THREAD_OPEN");
  if (unresolvedThreads.some(({ findingSeverity, findingDisposition }) => (contract.blockingSeverities ?? []).includes(findingSeverity) && findingDisposition !== "RESOLVED")) {
    codes.push("CODEX_REVIEW_UNRESOLVED_FINDING");
  }
  return { ok: codes.length === 0, codes: [...new Set(codes)].sort(), receipt };
}

export function detectLateReview({ contract, current, review = null, threads }) {
  if (!validInstant(current.mergedAt)) return null;
  const providers = new Set(contract.reviewProviders ?? []);
  const findings = (threads ?? []).flatMap((thread) => (thread.comments ?? [])
    .filter(({ author, createdAt }) => providers.has(author)
      && validInstant(createdAt)
      && new Date(createdAt) > new Date(current.mergedAt)
      && thread.isResolved !== true)
    .map((comment) => ({
      commentId: comment.commentId,
      commentNodeId: comment.commentNodeId,
      threadId: thread.threadId,
      severity: severityFromBody(comment.body),
      timestamp: comment.createdAt,
      reviewedSha: comment.commit,
      affectedPaths: comment.path ? [comment.path] : [],
      disposition: "UNRESOLVED"
    })));
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

async function githubRequest(url, token, init = {}) {
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
  if (!response.ok) throw new Error(`GITHUB_HTTP_${response.status}:${body?.message ?? "unknown"}`);
  return body;
}

async function readPullRequest(repository, prNumber, token) {
  const [owner, name] = repository.split("/");
  const query = `query($owner:String!,$name:String!,$number:Int!){repository(owner:$owner,name:$name){pullRequest(number:$number){number merged mergedAt mergeCommit{oid} headRefName headRefOid reviews(first:100){pageInfo{hasNextPage}nodes{databaseId author{login}state createdAt submittedAt commit{oid}}}reviewThreads(first:100){pageInfo{hasNextPage}nodes{id isResolved comments(first:100){pageInfo{hasNextPage}nodes{databaseId id author{login}body createdAt path commit{oid}}}}}commits(last:1){nodes{commit{oid committedDate tree{oid}}}}}}}`;
  const graph = await githubRequest("https://api.github.com/graphql", token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables: { owner, name, number: prNumber } })
  });
  if (graph.errors?.length) throw new Error(`GITHUB_GRAPHQL:${graph.errors.map(({ message }) => message).join("|")}`);
  const pr = graph.data?.repository?.pullRequest;
  if (!pr) throw new Error("GITHUB_PULL_REQUEST_MISSING");
  const commit = pr.commits?.nodes?.[0]?.commit;
  let workflowRuns = { total_count: 0, workflow_runs: [] };
  try {
    workflowRuns = await githubRequest(`https://api.github.com/repos/${repository}/actions/workflows/codex-review-exact-head.yml/runs?head_sha=${pr.headRefOid}&per_page=100`, token);
  } catch (error) {
    if (!String(error.message).startsWith("GITHUB_HTTP_404:")) throw error;
  }
  const sourceGateStarts = (workflowRuns.workflow_runs ?? [])
    .filter(({ event }) => event === "pull_request")
    .map(({ created_at: createdAt }) => createdAt)
    .filter(validInstant);
  let currentRunReadbackIncomplete = false;
  if (process.env.GITHUB_EVENT_NAME === "pull_request" && /^\d+$/u.test(process.env.GITHUB_RUN_ID ?? "")) {
    try {
      const currentRun = await githubRequest(`https://api.github.com/repos/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}`, token);
      if (validInstant(currentRun.created_at)) sourceGateStarts.push(currentRun.created_at);
    } catch {
      currentRunReadbackIncomplete = true;
    }
  }
  const latestSourcePushAt = [commit?.committedDate, ...sourceGateStarts].filter(validInstant).sort().at(-1);
  const threads = (pr.reviewThreads?.nodes ?? []).map((thread) => ({
    threadId: thread.id,
    isResolved: thread.isResolved,
    comments: (thread.comments?.nodes ?? []).map((comment) => ({
      commentId: comment.databaseId,
      commentNodeId: comment.id,
      author: comment.author?.login ?? null,
      body: comment.body,
      createdAt: comment.createdAt,
      path: comment.path,
      commit: comment.commit?.oid ?? null
    }))
  }));
  const reviews = (pr.reviews?.nodes ?? []).map((review) => ({
    reviewId: review.databaseId,
    author: review.author?.login ?? null,
    state: review.state,
    startedAt: review.createdAt,
    submittedAt: review.submittedAt,
    commit: review.commit?.oid ?? null
  }));
  const readbackIncomplete = Boolean(currentRunReadbackIncomplete
    || pr.reviews?.pageInfo?.hasNextPage
    || pr.reviewThreads?.pageInfo?.hasNextPage
    || threads.some((thread, index) => pr.reviewThreads.nodes[index]?.comments?.pageInfo?.hasNextPage)
    || (workflowRuns.total_count ?? 0) > 100);
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
      providerReviewsExist: false
    },
    reviews,
    threads,
    readbackIncomplete
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
  let readbackIncomplete = false;
  let token = null;
  if (options.fixture) {
    ({ current, reviews = [], threads = [], readbackIncomplete = false } = JSON.parse(readText(options.fixture)));
  } else {
    const repository = options.repository ?? process.env.GITHUB_REPOSITORY;
    token = process.env[options.tokenEnv ?? "GITHUB_TOKEN"];
    const event = options.event ? JSON.parse(readText(options.event)) : {};
    const prNumber = Number(options.prNumber ?? event.pull_request?.number ?? (event.issue?.pull_request ? event.issue.number : null));
    if (!repository || !Number.isInteger(prNumber) || prNumber < 1 || !token) throw new Error("CODEX_REVIEW_INPUT_MISSING");
    ({ current, reviews, threads, readbackIncomplete } = await readPullRequest(repository, prNumber, token));
    const truth = readJson("config/assurance/current-truth-v1.json");
    current.reviewOnly = (truth.openReviewOnlyPrs ?? []).some(({ number, disposition }) => number === prNumber && String(disposition).includes("never-merge"));
    const matchingLateSentinel = (truth.lateReviewSentinels ?? []).find(({ prNumber: mergedPr }) => mergedPr === prNumber);
    current.successorCorrectionOwner = matchingLateSentinel?.successorCorrectionOwner ?? null;
    current.lateReviewBlocked = (truth.lateReviewSentinels ?? []).some((sentinel) => {
      const unresolved = (sentinel.findings ?? []).some(({ disposition }) => disposition !== "RESOLVED");
      return unresolved && ![sentinel.successorCorrectionOwner, sentinel.assuranceControlOwner].includes(current.headBranch);
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
  const receipt = selectedReview ? buildExactHeadReceipt({ contract, current, review: selectedReview, threads }) : null;
  const evaluation = evaluateExactHeadReceipt({ contract, current, receipt, readbackIncomplete });
  const lateReviewSentinel = detectLateReview({ contract, current, review: latestProviderReview, threads });
  if (lateReviewSentinel) {
    evaluation.ok = false;
    evaluation.codes = [...new Set([...evaluation.codes, "CODEX_REVIEW_LATE_POST_MERGE"])].sort();
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
    checkRunId: evaluation.checkRunId ?? null,
    publishError: evaluation.publishError ?? null
  }, [`${contract.checkName}: ${evaluation.ok ? "PASS" : "FAIL"} — ${evaluation.codes.join(",") || evaluation.receipt.receiptHash}`]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => emit("assurance:codex-review-exact-head", false, {
    classification: "EXACT_HEAD_REVIEW_BLOCKED",
    codes: ["CODEX_REVIEW_RECEIPT_INVALID"],
    error: error.message
  }));
}
