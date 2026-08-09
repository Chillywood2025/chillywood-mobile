#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { ROOT, emit, readJson } from "./lib.mjs";
import { git, sha40, sha64, sha256, strictOptions } from "./efficiency-lib.mjs";

function severityCounts(value, output = { p0: [], p1: [] }) {
  if (Array.isArray(value)) value.forEach((child) => severityCounts(child, output));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (/^p0(?:Open)?$/iu.test(key) && Number.isInteger(child)) output.p0.push(child);
      else if (/^p1(?:Open)?$/iu.test(key) && Number.isInteger(child)) output.p1.push(child);
      else severityCounts(child, output);
    }
  }
  return output;
}

function unresolvedFindingCounts(findings) {
  if (!Array.isArray(findings)) return null;
  const counts = { p0: 0, p1: 0 };
  for (const finding of findings) {
    if (!finding || typeof finding !== "object" || !/^P[0-3]$/u.test(finding.severity) || typeof finding.status !== "string") return null;
    if (finding.status !== "resolved" && finding.severity === "P0") counts.p0 += 1;
    if (finding.status !== "resolved" && finding.severity === "P1") counts.p1 += 1;
  }
  return counts;
}

function gitEvidence(review, dependencies) {
  const runGit = dependencies.git ?? git;
  const readObject = dependencies.readObject ?? ((head, file) => execFileSync("git", ["show", `${head}:${file}`], { cwd: ROOT, encoding: "utf8" }));
  let paths; let content; let remoteHead;
  try {
    paths = runGit(["show", "--format=", "--name-only", review.head]).split("\n").filter(Boolean);
    if (paths.length !== 1 || !/^docs\/reviews\/.+\.json$/u.test(paths[0])) return { ok: false, finding: "REVIEW_EVIDENCE_PATH_AMBIGUOUS" };
    content = readObject(review.head, paths[0]);
    remoteHead = runGit(["show-ref", "--verify", "--hash", `refs/remotes/origin/${review.branch}`]);
  } catch { return { ok: false, finding: "REVIEW_EVIDENCE_OR_BRANCH_MISSING" }; }
  let parsed;
  try { parsed = JSON.parse(content); } catch { return { ok: false, finding: "REVIEW_EVIDENCE_UNPARSEABLE" }; }
  const pending = review.state === "open-draft-stale-pending-corrected-final-review";
  const status = parsed.status ?? parsed.state ?? "";
  const counts = severityCounts(parsed);
  if (pending ? (typeof status !== "string" || !/^PENDING_/u.test(status) || counts.p0.length !== 0 || counts.p1.length !== 0) : counts.p0.length !== 1 || counts.p1.length !== 1) return { ok: false, finding: pending ? "PENDING_REVIEW_STATUS_OR_COUNTS_INVALID" : "REVIEW_P0_P1_AMBIGUOUS" };
  let branchRetained = false;
  try { branchRetained = pending ? runGit(["merge-base", "--is-ancestor", review.head, remoteHead]) === "" : remoteHead === review.head; } catch { return { ok: false, finding: "REVIEW_BRANCH_ANCESTRY_INVALID" }; }
  const semanticCounts = unresolvedFindingCounts(parsed.findings);
  if (!pending && (!semanticCounts || semanticCounts.p0 !== counts.p0[0] || semanticCounts.p1 !== counts.p1[0])) {
    return { ok: false, finding: "REVIEW_DECLARED_FINDING_COUNTS_MISMATCH" };
  }
  return {
    ok: true,
    file: paths[0],
    evidenceSha256: sha256(content),
    p0: pending ? null : counts.p0[0],
    p1: pending ? null : counts.p1[0],
    pending,
    implementationHead: parsed.implementationHead ?? null,
    implementationTree: parsed.implementationTree ?? null,
    implementationPr: parsed.implementationPrNumber ?? null,
    branchRetained
  };
}

export function reviewHistory(config, truth, dependencies = {}) {
  const findings = [];
  const current = Array.isArray(truth?.openReviewOnlyPrs) ? truth.openReviewOnlyPrs : [];
  if (!Array.isArray(truth?.openReviewOnlyPrs)) findings.push("CURRENT_REVIEW_INVENTORY_MALFORMED");
  const candidateByPr = new Map((config?.safeStaleCandidates ?? []).map((candidate) => [candidate.pr, candidate]));
  if (candidateByPr.size !== (config?.safeStaleCandidates ?? []).length) findings.push("STALE_CANDIDATE_DUPLICATE");
  const currentByPr = new Map();
  for (const review of current) {
    if (currentByPr.has(review.number)) findings.push(`CURRENT_REVIEW_DUPLICATE:${review.number}`);
    currentByPr.set(review.number, review);
  }

  const records = [];
  const all = [...current];
  for (const candidate of config?.safeStaleCandidates ?? []) {
    if (!currentByPr.has(candidate.pr)) all.push({
      number: candidate.pr,
      branch: candidate.branch,
      head: candidate.head,
      reviewedImplementationHead: candidate.reviewedImplementationHead,
      state: "not-open-in-current-truth",
      disposition: "never-merge"
    });
  }

  for (const review of all) {
    if (!Number.isInteger(review.number) || !sha40(review.head) || !sha40(review.reviewedImplementationHead)) {
      findings.push(`REVIEW_IDENTITY_INVALID:${review.number ?? "unknown"}`);
      continue;
    }
    const evidence = gitEvidence(review, dependencies);
    if (!evidence.ok) {
      findings.push(`${evidence.finding}:${review.number}`);
      continue;
    }
    const candidate = candidateByPr.get(review.number);
    const pending = evidence.pending === true;
    if (pending && candidate) findings.push(`PENDING_REVIEW_STALE_CANDIDATE_COLLISION:${review.number}`);
    const protectedHead = (config?.protectedImplementationHeads ?? []).includes(review.reviewedImplementationHead);
    const implementationDisposition = candidate ? config?.implementationDispositions?.[candidate.implementationPr] : null;
    const unresolvedPreserved = candidate?.p1 === 0
      ? candidate?.unresolvedDisposition === "none"
      : ["historical-p1-preserved-implementation-merged", "historical-p1-preserved-implementation-superseded"].includes(candidate?.unresolvedDisposition);
    let reviewedTree = null;
    try { reviewedTree = (dependencies.git ?? git)(["rev-parse", `${review.reviewedImplementationHead}^{tree}`]); } catch { reviewedTree = null; }
    const identityBound = !candidate || (
      evidence.implementationHead === review.reviewedImplementationHead
      && (evidence.implementationPr == null || evidence.implementationPr === candidate.implementationPr)
      && typeof evidence.implementationTree === "string"
      && evidence.implementationTree === reviewedTree
      && (!candidate.reviewedImplementationTree || evidence.implementationTree === candidate.reviewedImplementationTree)
    );
    const exactCandidate = !candidate || [
      candidate.branch === review.branch,
      candidate.head === review.head,
      candidate.reviewedImplementationHead === review.reviewedImplementationHead,
      candidate.evidenceSha256 === evidence.evidenceSha256,
      candidate.p0 === evidence.p0,
      candidate.p1 === evidence.p1,
      unresolvedPreserved
    ].every(Boolean);
    if (!identityBound) findings.push(`REVIEWED_IDENTITY_EVIDENCE_MISMATCH:${review.number}`);
    if (candidate?.reviewedImplementationTree && evidence.implementationTree !== candidate.reviewedImplementationTree) findings.push(`REVIEWED_TREE_EVIDENCE_MISMATCH:${review.number}`);
    if (!exactCandidate) findings.push(`STALE_CANDIDATE_MISMATCH:${review.number}`);
    if (candidate && (!implementationDisposition || !["merged", "superseded"].includes(implementationDisposition.state) || !sha40(implementationDisposition.mergeSha))) {
      findings.push(`IMPLEMENTATION_DISPOSITION_UNRESOLVED:${review.number}`);
    }
    let dispositionBound = false;
    if (implementationDisposition?.state === "merged") try {
      dispositionBound = runGitAncestor(review.reviewedImplementationHead, implementationDisposition.mergeSha, dependencies);
      if (!dispositionBound) findings.push(`IMPLEMENTATION_MERGE_ANCESTRY_INVALID:${review.number}`);
    } catch { findings.push(`IMPLEMENTATION_MERGE_SHA_INVALID:${review.number}`); }
    else if (implementationDisposition?.state === "superseded") findings.push(`IMPLEMENTATION_SUPERSESSION_PROOF_MISSING:${review.number}`);
    if (!evidence.branchRetained) findings.push(`REVIEW_BRANCH_NOT_RETAINED:${review.number}`);
    if (review.disposition !== "never-merge") findings.push(`REVIEW_MERGE_DISPOSITION_INVALID:${review.number}`);
    if (review.state === "open-draft-stale" && !candidate) findings.push(`STALE_REVIEW_UNCLASSIFIED:${review.number}`);
    if (candidate && protectedHead) findings.push(`PROTECTED_REVIEW_CANNOT_ARCHIVE:${review.number}`);
    const closureEligible = Boolean(
      candidate
      && currentByPr.has(review.number)
      && review.state === "open-draft-stale"
      && review.disposition === "never-merge"
      && evidence.branchRetained
      && !pending
      && evidence.p0 === 0
      && unresolvedPreserved
      && exactCandidate
      && identityBound
      && !protectedHead
      && dispositionBound
    );
    records.push({
      pr: review.number,
      branch: review.branch,
      head: review.head,
      reviewedImplementationHead: review.reviewedImplementationHead,
      evidenceFile: evidence.file,
      evidenceSha256: evidence.evidenceSha256,
      p0: evidence.p0,
      p1: evidence.p1,
      implementationDisposition: implementationDisposition?.state ?? "active-or-canonical-current",
      unresolvedDisposition: candidate?.unresolvedDisposition ?? "none",
      state: review.state,
      classification: candidate ? "historical" : "active",
      pending,
      neverMerge: review.disposition === "never-merge",
      branchRetained: evidence.branchRetained,
      closureEligible
    });
  }
  const sorted = records.sort((left, right) => left.pr - right.pr);
  const closureList = sorted.filter(({ closureEligible }) => closureEligible).map(({ pr, branch, evidenceSha256, p0, p1, unresolvedDisposition }) => ({ pr, branch, evidenceSha256, p0, p1, unresolvedDisposition }));
  if (current.some(({ state }) => state === "open-draft-stale") && closureList.length !== current.filter(({ state }) => state === "open-draft-stale").length) {
    findings.push("STALE_CLOSURE_LIST_INCOMPLETE");
  }
  return {
    ok: findings.length === 0,
    canonicalSource: config.canonicalSource,
    records: sorted,
    activeCount: sorted.filter(({ classification }) => classification === "active").length,
    historicalCount: sorted.filter(({ classification }) => classification === "historical").length,
    closureList,
    closureHash: sha256(closureList),
    manifestHash: sha256(sorted),
    findings: findings.sort()
  };
}

function runGitAncestor(head, merge, dependencies) { const run = dependencies.git ?? git; return run(["merge-base", "--is-ancestor", head, merge]) === ""; }

export function archive(input) {
  const findings = [];
  const records = input?.reviews ?? [];
  for (const review of records) {
    if (!review.lane || !sha40(review.head) || !sha40(review.tree) || !sha64(review.evidenceSha256)) findings.push(`REVIEW_INVALID:${review.lane ?? "unknown"}`);
    if (review.state !== "CLOSED_UNMERGED" || review.retained !== true || review.mergePermitted !== false) findings.push(`REVIEW_NOT_ARCHIVABLE:${review.lane ?? "unknown"}`);
  }
  if (records.length !== 4 || new Set(records.map(({ lane }) => lane)).size !== 4) findings.push("FOUR_LANES_REQUIRED");
  return { ok: findings.length === 0, records: [...records].sort((left, right) => left.lane.localeCompare(right.lane)), findings: findings.sort() };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const parsed = strictOptions(process.argv.slice(2), {});
  const result = parsed.ok
    ? reviewHistory(readJson("config/assurance/review-history-v1.json"), readJson("config/assurance/current-truth-v1.json"))
    : { ok: false, findings: parsed.findings };
  emit("assurance:review-history", result.ok, result);
}
