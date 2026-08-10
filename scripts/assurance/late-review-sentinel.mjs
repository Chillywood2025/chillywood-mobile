#!/usr/bin/env node
import { args, emit, git, lateReviewAllowedOwners, lateReviewFindingSetEqual, lateReviewRegistryCoverageFindings, lateReviewResolutionTombstoneValid, lateReviewSentinelResolved, lateReviewSentinelValidationState, lateReviewSuccessorCorrectionOwner, mergeLateReviewSentinelRecords, readJson, repositoryReadbackEvidenceHash, stableJson } from "./lib.mjs";
import { parseLateReviewIssue, readMergedLateReviewLedgerSentinels, readOpenLateReviewIssues, verifyLateReviewResolutionGithub } from "./codex-review-exact-head.mjs";

export { lateReviewSentinelResolved } from "./lib.mjs";

const requiredBlocks = ["post-merge-completion-claim", "next-implementation", "release", "proof-tier-promotion"];
const currentTruthPath = "config/assurance/current-truth-v1.json";
const carrierEvidenceCover = "repository.assurance-control.late-review-tombstone-admission-carrier";

function protectedMainRecord(options = {}) {
  if (Object.hasOwn(options, "protectedMainRecord")) return options.protectedMainRecord;
  try { return JSON.parse(git(["show", `origin/main:${currentTruthPath}`])); } catch { return null; }
}

export function tombstoneAdmissionCarrierGitIdentityValid(tombstone, options = {}) {
  const runGit = options.gitRunner ?? git;
  const carrier = tombstone?.admissionCarrier;
  const anchorSha = options.anchorSha;
  const firstAppearance = options.firstAppearance;
  try {
    const parents = runGit(["show", "-s", "--format=%P", carrier.mergeSha]).split(/\s+/u).filter(Boolean);
    const firstParentCommits = options.firstParentCommits
      ?? runGit(["rev-list", "--first-parent", "--reverse", "origin/main"]).split(/\r?\n/u).filter(Boolean);
    const mergeIndex = firstParentCommits.indexOf(carrier.mergeSha);
    const appearanceIndex = firstParentCommits.indexOf(firstAppearance);
    if (parents.length !== 2
      || parents[1] !== carrier.head
      || mergeIndex < 1
      || appearanceIndex <= mergeIndex
      || firstParentCommits[mergeIndex - 1] !== parents[0]
      || runGit(["rev-parse", `${carrier.head}^{tree}`]) !== carrier.tree) return false;
    runGit(["merge-base", "--is-ancestor", anchorSha, parents[0]]);
    return true;
  } catch { return false; }
}

export function tombstoneAdmissionCarrierReadbackValid(tombstone, admittedRecord, firstAppearance, options = {}) {
  const runGit = options.gitRunner ?? git;
  const carrier = tombstone?.admissionCarrier;
  const sources = (admittedRecord?.evidenceSources ?? []).filter(({ id }) => id === carrier?.verificationEvidenceSourceId);
  if (sources.length !== 1) return false;
  const source = sources[0];
  const facts = source.readbackFacts;
  try {
    const parents = runGit(["show", "-s", "--format=%P", carrier.mergeSha]).split(/\s+/u).filter(Boolean);
    const expectedFacts = {
      schemaVersion: 1,
      repository: tombstone.repository,
      observedAt: facts?.observedAt,
      provider: "github-read-only",
      prNumber: carrier.prNumber,
      branch: carrier.branch,
      baseBranch: "main",
      currentPrHead: carrier.head,
      currentPrTree: carrier.tree,
      reviewedCommit: carrier.head,
      latestSourcePushAt: carrier.latestSourcePushAt,
      exactHeadReviewCompletedAt: carrier.exactHeadReviewCompletedAt,
      exactHeadReviewReceiptHash: carrier.exactHeadReviewReceiptHash,
      exactHeadCheckRunId: carrier.exactHeadCheckRunId,
      exactHeadCheckName: "Chi'llywood / Codex Review Exact Head",
      exactHeadCheckConclusion: "success",
      checkExternalId: carrier.exactHeadReviewReceiptHash,
      merged: true,
      mergeSha: carrier.mergeSha,
      mergeParents: parents,
      mergedAt: carrier.mergedAt,
      allConversationsResolved: true,
      noSourceCommitAfterReview: true
    };
    const sourceCommit = source?.sourceCommit;
    if (!/^[0-9a-f]{40}$/u.test(sourceCommit ?? "")
      || source.mode !== "github-read-only"
      || source.readbackSha256 !== carrier.repositoryVerificationHash
      || source.readbackSha256 !== repositoryReadbackEvidenceHash(source)
      || stableJson(facts) !== stableJson(expectedFacts)
      || source.observedAt !== facts.observedAt
      || source.freshnessClass !== "REPOSITORY_SOURCE"
      || source.authorityAllowed !== "REPOSITORY_ONLY"
      || source.platform !== "NONE"
      || source.provider !== "NONE"
      || source.subjectHead !== sourceCommit
      || source.subjectTree !== runGit(["rev-parse", `${sourceCommit}^{tree}`])
      || !Array.isArray(source.covers)
      || !source.covers.includes(carrierEvidenceCover)
      || new Date(carrier.latestSourcePushAt).valueOf() >= new Date(carrier.exactHeadReviewCompletedAt).valueOf()
      || new Date(carrier.exactHeadReviewCompletedAt).valueOf() > new Date(carrier.mergedAt).valueOf()
      || new Date(carrier.mergedAt).valueOf() > new Date(facts.observedAt).valueOf()) return false;
    runGit(["merge-base", "--is-ancestor", sourceCommit, firstAppearance]);
    const committedRecord = JSON.parse(runGit(["show", `${sourceCommit}:${currentTruthPath}`]));
    const committedSources = (committedRecord.evidenceSources ?? []).filter(({ id }) => id === source.id);
    const committedSource = committedSources[0];
    const introducedHere = runGit(["show", "-s", "--format=%P", sourceCommit]).split(/\s+/u).filter(Boolean).every((parent) => {
      try {
        const parentRecord = JSON.parse(runGit(["show", `${parent}:${currentTruthPath}`]));
        return !(parentRecord.evidenceSources ?? []).some(({ id }) => id === source.id);
      } catch { return true; }
    });
    return committedRecord.timestamp === facts.observedAt
      && committedSources.length === 1
      && committedSource.mode === source.mode
      && committedSource.readbackSha256 === source.readbackSha256
      && stableJson(committedSource.readbackFacts) === stableJson(facts)
      && stableJson(committedSource.covers) === stableJson(source.covers)
      && introducedHere;
  } catch { return false; }
}

function tombstoneFirstProtectedMainAdmission(tombstone, admittedRecord, options = {}) {
  if (typeof options.tombstoneAdmissionVerifier === "function") {
    try { return options.tombstoneAdmissionVerifier(tombstone) === true; } catch { return false; }
  }
  const policy = options.tombstoneAdmissionPolicy ?? readJson("config/assurance/current-truth-contract-v1.json").lateReviewTombstoneAdmission;
  if (policy?.policyId !== "EXACT_HEAD_PROTECTED_MAIN_V1"
    || !/^[0-9a-f]{40}$/u.test(policy?.protectedMainAnchorSha ?? "")
    || policy.originalSentinelRetentionRequired !== true
    || policy.firstParentAdmissionRequired !== true
    || policy.carrierExactMergeParentsRequired !== true
    || policy.carrierGithubReadbackRequired !== true
    || policy.carrierExactHeadReceiptRequired !== true
    || policy.carrierLatestSourcePushInvalidationRequired !== true
    || policy.carrierEvidenceMode !== "github-read-only"
    || policy.branchLocalAdmissionAllowed !== false
    || policy.networkRequiredAfterAdmission !== false) return false;
  try {
    const commits = git(["log", "--first-parent", "--reverse", "--format=%H", "origin/main", "--", currentTruthPath]).split(/\r?\n/u).filter(Boolean);
    const expected = stableJson(tombstone);
    const firstAppearance = commits.find((commit) => {
      try {
        const record = JSON.parse(git(["show", `${commit}:${currentTruthPath}`]));
        return (record.lateReviewResolutionTombstones ?? []).some((candidate) => stableJson(candidate) === expected);
      } catch { return false; }
    });
    if (!firstAppearance || firstAppearance === policy.protectedMainAnchorSha) return false;
    git(["merge-base", "--is-ancestor", policy.protectedMainAnchorSha, firstAppearance]);
    return tombstoneAdmissionCarrierGitIdentityValid(tombstone, {
      anchorSha: policy.protectedMainAnchorSha,
      firstAppearance
    }) && tombstoneAdmissionCarrierReadbackValid(tombstone, admittedRecord, firstAppearance, options);
  } catch { return false; }
}

function protectedTombstoneResolves(record, sentinel, options = {}) {
  const tombstones = (record?.lateReviewResolutionTombstones ?? []).filter((tombstone) => tombstone?.repository === sentinel?.repository
    && tombstone?.prNumber === sentinel?.prNumber
    && tombstone?.mergeSha === sentinel?.mergeSha);
  if (tombstones.length !== 1 || !lateReviewResolutionTombstoneValid(sentinel, tombstones[0])) return false;
  const admittedRecord = protectedMainRecord(options);
  const admitted = admittedRecord?.lateReviewResolutionTombstones ?? [];
  if (!admitted.some((candidate) => stableJson(candidate) === stableJson(tombstones[0]))) return false;
  return tombstoneFirstProtectedMainAdmission(tombstones[0], admittedRecord, options);
}

export function unresolvedLateReviewSentinels(record, options = {}) {
  return (record?.lateReviewSentinels ?? []).filter((sentinel) => lateReviewSentinelValidationState(sentinel) === "INTERNALLY_VALIDATED_BLOCKING"
    && !lateReviewSentinelResolved(sentinel, options)
    && !protectedTombstoneResolves(record, sentinel, options));
}

export function validateLateReviewSentinelState(record, options = {}) {
  const findings = lateReviewRegistryCoverageFindings(record?.lateReviewSentinels);
  const tombstoneKeys = new Set();
  for (const tombstone of record?.lateReviewResolutionTombstones ?? []) {
    const key = `${tombstone?.repository ?? ""}:${tombstone?.prNumber}:${tombstone?.mergeSha}`;
    if (tombstoneKeys.has(key)) findings.push({ id: "LATE_REVIEW_TOMBSTONE_DUPLICATE", prNumber: tombstone?.prNumber });
    tombstoneKeys.add(key);
    const matches = (record?.lateReviewSentinels ?? []).filter((sentinel) => sentinel?.repository === tombstone?.repository
      && sentinel?.prNumber === tombstone?.prNumber
      && sentinel?.mergeSha === tombstone?.mergeSha);
    if (matches.length !== 1 || !lateReviewResolutionTombstoneValid(matches[0], tombstone)) {
      findings.push({ id: "LATE_REVIEW_TOMBSTONE_INVALID", prNumber: tombstone?.prNumber });
    }
  }
  for (const sentinel of record?.lateReviewSentinels ?? []) {
    if (lateReviewSentinelValidationState(sentinel) !== "INTERNALLY_VALIDATED_BLOCKING") continue;
    const dispositions = (sentinel.findings ?? []).map(({ disposition }) => disposition);
    const claimsResolution = dispositions.some((disposition) => disposition === "RESOLVED");
    const resolved = lateReviewSentinelResolved(sentinel, options) || protectedTombstoneResolves(record, sentinel, options);
    if (lateReviewAllowedOwners(sentinel).length === 0) findings.push({ id: "LATE_REVIEW_OWNER_POLICY_INVALID", prNumber: sentinel.prNumber });
    if (claimsResolution && !resolved) findings.push({ id: "LATE_REVIEW_RESOLUTION_EVIDENCE_INVALID", prNumber: sentinel.prNumber });
    if (resolved) continue;
    const activeImplementationBranch = record?.activeTaskBinding?.implementationBranch;
    if (record?.activeTaskBinding?.phase === "COMPLETE"
      && (lateReviewSuccessorCorrectionOwner(sentinel) === activeImplementationBranch
        || !lateReviewAllowedOwners(sentinel).includes(activeImplementationBranch))) {
      findings.push({ id: "LATE_REVIEW_COMPLETION_CLAIM_BLOCKED", prNumber: sentinel.prNumber });
    }
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
  const blockingCandidates = [...canonicalSentinels, ...globalLedgerSentinels, ...durableSentinels]
    .filter((sentinel) => lateReviewSentinelValidationState(sentinel) === "INTERNALLY_VALIDATED_BLOCKING");
  const authoritative = mergeLateReviewSentinelRecords(blockingCandidates);
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
  const advisoryCandidates = mergeLateReviewSentinelRecords([
    ...globalLedgerSentinels,
    ...durable.filter(({ resolutionVerified }) => resolutionVerified !== true).map(({ sentinel }) => sentinel)
  ]).filter((sentinel) => lateReviewSentinelValidationState(sentinel) === "OPTIONAL_ADVISORY_PENDING_TRIAGE");
  emit("assurance:late-review-sentinel", allSentinels.length === 0 && findings.length === 0, {
    classification: allSentinels.length ? "INTERNALLY_VALIDATED_LATE_REVIEW_BLOCKED" : "NO_INTERNALLY_VALIDATED_LATE_REVIEW_BLOCKER",
    codexReviewPolicy: "OPTIONAL_ADVISORY",
    advisoryTriageCount: advisoryCandidates.length,
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
    classification: "LATE_REVIEW_READBACK_FAILED_CLOSED",
    findings: [{ id: error.message }],
    blocks: requiredBlocks
  }, [`late review sentinel: FAIL — ${error.message}`]));
}
