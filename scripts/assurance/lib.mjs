#!/usr/bin/env node
import crypto from "node:crypto";
import { Buffer } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const rel = (...parts) => path.join(ROOT, ...parts);
export const readText = (file) => fs.readFileSync(path.isAbsolute(file) ? file : rel(file), "utf8");
export const readJson = (file) => JSON.parse(readText(file));
export const exists = (file) => fs.existsSync(path.isAbsolute(file) ? file : rel(file));
export const sha256 = (value) => crypto.createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
export const stableValue = (value) => Array.isArray(value)
  ? value.map(stableValue)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
    : value;
export const stableJson = (value, space = 0) => JSON.stringify(stableValue(value), null, space);
export const normalizeSql = (value) => value.replace(/\r\n/gu, "\n").replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
export function canonicalGitText(value) {
  if (typeof value !== "string") throw new TypeError("ASSURANCE_CANONICAL_GIT_TEXT_REQUIRES_STRING");
  return value.replace(/\r\n?|\n/gu, "\n").trim();
}

export const TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS = Object.freeze([
  "CURRENT_STATE.md",
  "NEXT_TASK.md",
  "config/assurance/current-truth-v1.json",
  "scripts/assurance/engineering-closure.mjs",
  "scripts/assurance/lib.mjs",
  "scripts/assurance/pr-scope.mjs",
  "tests/assurance/active-task-binding-a1.test.mjs",
  "tests/assurance/pr-scope-feature-bundles.test.mjs",
]);

export function args(argv = process.argv.slice(2)) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const [rawKey, inline] = item.slice(2).split(/=(.*)/su);
    const key = rawKey.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (inline !== undefined) result[key] = inline;
    else if (argv[i + 1] && !argv[i + 1].startsWith("--")) result[key] = argv[++i];
    else result[key] = true;
  }
  return result;
}

export function git(gitArgs, options = {}) {
  return canonicalGitText(execFileSync("git", gitArgs, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }));
}

export function baseSynchronizationFirstParentDistance(sourceHead, observedHead, runGit = git) {
  if (!gitShaPattern.test(sourceHead ?? "") || !gitShaPattern.test(observedHead ?? "")) return null;
  try {
    const distance = runGit(["rev-list", "--first-parent", "--count", `${sourceHead}..${observedHead}`]);
    return /^\d+$/u.test(distance ?? "") ? Number(distance) : null;
  } catch {
    return null;
  }
}

const secretKey = /(secret|password|credential|authorization|private.?key|raw.?payload|device.?id|device.?serial|udid|signed.?url)/iu;
const secretString = /(bearer\s+[a-z0-9._-]+|(?:service_role|sk|pk|gh[opsu])_[a-z0-9_-]{12,}|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/giu;
export function redact(value, key = "") {
  if (secretKey.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((entry) => redact(entry));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, redact(child, childKey)]));
  if (typeof value === "string") return value.replace(secretString, "[REDACTED]");
  return value;
}

export function providerMode(options) {
  const mode = options.providerMode ?? "offline";
  if (!["offline", "read-only"].includes(mode)) throw new Error(`ASSURANCE_PROVIDER_MODE_FORBIDDEN:${mode}`);
  if (mode === "read-only" && !options.providerSnapshot && !options.snapshot) {
    throw new Error("ASSURANCE_PROVIDER_SNAPSHOT_REQUIRED");
  }
  return mode;
}

export function emit(command, ok, payload = {}, human = []) {
  const output = redact({ schemaVersion: 1, command, ok, ...payload });
  const lines = human.length ? human : [`${command}: ${ok ? "PASS" : "FAIL"}`];
  process.stderr.write(`${lines.join("\n")}\n`);
  process.stdout.write(`${stableJson(output)}\n`);
  if (!ok) process.exitCode = 1;
  return output;
}

export function requiredKeys(value, keys, label) {
  return keys.flatMap((key) => Object.hasOwn(value, key) ? [] : [`${label} missing ${key}`]);
}

const claimRequiredFields = [
  "id",
  "status",
  "observedAt",
  "expiresAt",
  "evidenceSourceId",
  "evidenceMode",
  "factsCovered",
  "freshnessClass",
  "authorityAllowed",
  "platform",
  "provider"
];
const claimStatuses = new Set(["CURRENT", "STALE_BLOCKED"]);
const claimPlatforms = new Set(["ANDROID", "IOS", "NONE"]);
export const HISTORICAL_PROVIDER_FACT = "HISTORICAL_PROVIDER_FACT";
export const optionalCodexReviewPolicy = {
  classification: "OPTIONAL_ADVISORY",
  requiredStatusCheck: false,
  blocksProgress: false,
  blocksMerge: false,
  ownerTriggeredOnly: true,
  automaticReviewRequests: false,
  quotaRetryAllowed: false,
  providerReceiptRequired: false,
  independentRepositoryValidationRequiredBeforeBlocking: true,
  repositoryOwnedExactHeadReviewRequired: true,
  requiredPhase1Checks: 13,
  historicalIncidentsRetained: true
};
export function optionalCodexReviewPolicyValid(policy) {
  return stableJson(policy) === stableJson(optionalCodexReviewPolicy);
}
const canonicalLateReviewOwnerRegistry = [{
  repository: "Chillywood2025/chillywood-mobile",
  prNumber: 194,
  mergeSha: "4ee283aa851bb2042a7559a54a1664d6eebcb446",
  findingSetHash: "9474ccab70621250acc32aaa8bb765f0aba7423b44fa5fd073d2318f12701c99",
  successorCorrectionOwner: "codex/d2a-livekit-mic-post-merge-review-correction",
  assuranceControlOwner: "codex/assurance-active-task-and-claim-freshness-a1",
  authorizedBootstrapOwners: [
    "codex/assurance-active-task-and-claim-freshness-a1",
    "codex/assurance-codex-security-scan-reliability-s0"
  ]
}, {
  repository: "Chillywood2025/chillywood-mobile",
  prNumber: 195,
  mergeSha: "9f4f2d0c49160a0944c774bcf4175d9899bc01f7",
  findingSetHash: "6aa0de5907c7b504712a502b3072fcd06dd026801425aa5ff6912a67ffcb6b10",
  successorCorrectionOwner: "codex/assurance-active-task-and-claim-freshness-a1",
  assuranceControlOwner: "codex/assurance-active-task-and-claim-freshness-a1",
  authorizedBootstrapOwners: [
    "codex/assurance-active-task-and-claim-freshness-a1",
    "codex/assurance-codex-security-scan-reliability-s0",
    "codex/d2a-livekit-mic-post-merge-review-correction"
  ]
}];
const claimClassPolicy = {
  REPOSITORY_TASK_LEASE: {
    evidenceModes: ["protected-finite-task-lease"],
    authorityAllowed: "REPOSITORY_ONLY",
    maximumHours: 87600,
    allowedPlatforms: ["NONE"],
    requiresCommittedEvidence: true,
    requiresExternalReceipt: false
  },
  REPOSITORY_SOURCE: {
    evidenceModes: ["local-source", "git-read-only", "github-read-only", "exact-ci", "local-offline", "local-read-only", "local-and-github-read-only", "local-offline-and-github-read-only"],
    authorityAllowed: "REPOSITORY_ONLY",
    maximumHours: 24,
    allowedPlatforms: ["NONE", "ANDROID", "IOS"],
    requiresCommittedEvidence: true,
    requiresExternalReceipt: false
  },
  PROVIDER_CRITICAL: {
    evidenceModes: ["local-and-linked-read-only"],
    authorityAllowed: "PROVIDER_READBACK_ONLY",
    maximumHours: 8,
    allowedPlatforms: ["NONE", "ANDROID", "IOS"],
    requiresCommittedEvidence: true,
    requiresExternalReceipt: true
  },
  SIGNED_ARTIFACT: {
    evidenceModes: ["signed-artifact-inspection"],
    authorityAllowed: "SIGNED_ARTIFACT_ONLY",
    maximumHours: 24,
    allowedPlatforms: ["ANDROID", "IOS"],
    requiresCommittedEvidence: true,
    requiresExternalReceipt: true
  },
  INSTALLED_DEVICE: {
    evidenceModes: ["installed-device-readback"],
    authorityAllowed: "INSTALLED_DEVICE_ONLY",
    maximumHours: 24,
    allowedPlatforms: ["ANDROID", "IOS"],
    requiresCommittedEvidence: true,
    requiresExternalReceipt: true
  },
  PHYSICAL_DEVICE: {
    evidenceModes: ["physical-device-observation"],
    authorityAllowed: "PHYSICAL_DEVICE_ONLY",
    maximumHours: 24,
    allowedPlatforms: ["ANDROID", "IOS"],
    requiresCommittedEvidence: true,
    requiresExternalReceipt: true
  },
  PUBLIC_CANARY: {
    evidenceModes: ["public-canary-readback"],
    authorityAllowed: "PUBLIC_CANARY_ONLY",
    maximumHours: 24,
    allowedPlatforms: ["ANDROID", "IOS"],
    requiresCommittedEvidence: true,
    requiresExternalReceipt: true
  }
};
const canonicalFactRegistry = [
  { factId: "repository.active-task.finite-lease-authority", freshnessClass: "REPOSITORY_TASK_LEASE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "Protected main authorizes the finite task lease; current candidate identity is derived read-only and is not written back after every descendant push" },
  { factId: "repository.assurance-control.a1.requirements", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "A1 Owner control requirements, prohibited mutations, review-gate, claim-freshness, and bootstrap boundaries are recorded as executable assurance requirements" },
  { factId: "repository.assurance-control.a1.source", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "A1 assurance-control source implements structured active-task authority, exact-head review gating, late-review detection, claim-scoped freshness, and fail-closed external receipt verification" },
  { factId: "repository.assurance-control.a1.model", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "A1 executable focused regressions reject task, head, review-surface, pagination, freshness, receipt, and proof-status substitutions" },
  { factId: "repository.assurance-control.a1.integration", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "A1 integration contracts connect active-task and current-truth validation with the exact-head review gate and Phase 1 workflow" },
  { factId: "repository.assurance-control.a1.post-merge-control-readback", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", requiresReadbackHash: true, historicalEvidence: "A1 PR 201 merge, exact Phase 1 run 31350394428, ruleset 18940814 protection, and durable PR 194 sentinel issue 203 were read back from GitHub" },
  { factId: "repository.assurance-control.a1.complete-late-sentinel-inventory", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", requiresReadbackHash: true, historicalEvidence: "Canonical late-review owner registry and sentinel inventory include exact unresolved PR 194 and PR 195 records" },
  { factId: "repository.assurance-control.a1.late-review-tombstone-admission", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", requiresReadbackHash: true, historicalEvidence: "Late-review resolution tombstones retain original sentinels, preserve the canonical correction owner, and require exact-head GitHub readback plus an exact two-parent protected-main carrier merge after the ruleset anchor" },
  { factId: "repository.assurance-control.s0.requirements", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "S0 machine-readable contract pins exact target identity, digest preflight, lifecycle, evidence reuse, repository closure, and incident-sanitization requirements" },
  { factId: "repository.assurance-control.s0.source", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "S0 source implements fail-closed Codex Security snapshot-digest preflight, exact source leasing, bounded lifecycle finalization, terminal no-retry, evidence invalidation, repository fallback, and sanitized incident recording" },
  { factId: "repository.assurance-control.s0.model", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "S0 executable model and adversarial fixtures prove preflight stops before discovery, one completion attempt, terminal no-retry, exact reuse, invalidation, closure integrity, and sanitized recurring incidents" },
  { factId: "repository.assurance-control.s0.integration", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "S0 integration evidence binds the exact target descriptor, repository closure, governed commands, independent exact-head review, and Phase 1 CI to one frozen source" },
  { factId: "repository.active-implementation.immutable-synchronized-source", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "PR #194 immutable correction c15a58039b67d65eabdcaa03a9422ebc8d6dd95e tree 4ce01fa17e4184f2523b82a10401e3b3f59dd641 remained byte-exact through synchronized head ada396a437e40a98acea75bf016c36fc3ea86739 tree 662dc601bf54b8abdc78cc915d757a6c55c2b39d" },
  { factId: "repository.active-implementation.merge-identity", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "PR #194 merged normally as 4ee283aa851bb2042a7559a54a1664d6eebcb446 with exact synchronized tree" },
  { factId: "repository.review-only-pr.disposition", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "review PRs #196 #197 #198 and #199 report aggregate P0=0 P1=0 and closed unmerged with branches retained" },
  { factId: "repository.phase1-ci.identity", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "Phase 1 CI run 31327771533 passed 13/13 at synchronized head ada396a437e40a98acea75bf016c36fc3ea86739" },
  { factId: "repository.d2a.frozen-state", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "D2A blocked evidence ebb0ac5e2dc6ba9005208b7e6b10474292e0972d tree c41a4d688e799483b67f35c956f1c95b273bf072 remains frozen and not resumed" },
  { factId: "provider.supabase.b3.deployed-predecessor", freshnessClass: "PROVIDER_CRITICAL", authorityAllowed: "PROVIDER_READBACK_ONLY", platform: "NONE", provider: "SUPABASE", historicalEvidence: "exact deployed 20260730161737 source SHA-256 6cb22f9719c5c1325ac4ee814998a39e50318d92499504e8f4ece52717d5a765" },
  { factId: "provider.supabase.b3.forward-correction", freshnessClass: "PROVIDER_CRITICAL", authorityAllowed: "PROVIDER_READBACK_ONLY", platform: "NONE", provider: "SUPABASE", historicalEvidence: "undeployed forward correction 20260730230031 SHA-256 0d610a322fa54ae411609736d2db30031944e1d77ac9fc8ac722bd4cd6d70d38" },
  { factId: "provider.supabase.b3.live-acl", freshnessClass: "PROVIDER_CRITICAL", authorityAllowed: "PROVIDER_READBACK_ONLY", platform: "NONE", provider: "SUPABASE", historicalEvidence: "live pre-correction ACL explicitly includes anon but source correction revokes it" }
];

function sameStringSet(left, right) {
  return Array.isArray(left)
    && left.length === right.length
    && new Set(left).size === left.length
    && left.every((entry) => right.includes(entry));
}

function validInstant(value) {
  return typeof value === "string" && value.length > 0 && Number.isFinite(new Date(value).valueOf());
}

function claimFinding(id, claimId, detail = {}) {
  return { id, status: "BLOCKED_INTERNAL", claimId: claimId ?? null, ...detail };
}

function canonicalLateReviewIdentityEntry(sentinel) {
  const matches = canonicalLateReviewOwnerRegistry.filter((entry) => entry.repository === sentinel?.repository
    && entry.prNumber === sentinel?.prNumber
    && entry.mergeSha === sentinel?.mergeSha);
  return matches.length === 1 ? matches[0] : null;
}

function canonicalLateReviewOwnerEntry(sentinel) {
  const entry = canonicalLateReviewIdentityEntry(sentinel);
  if (!entry) return null;
  const registryBoundDiscovery = sentinel.successorCorrectionOwner === "UNASSIGNED_BLOCKED"
    && sentinel.assuranceControlOwner === undefined
    && sentinel.authorizedBootstrapOwners === undefined;
  if (!registryBoundDiscovery && (sentinel.successorCorrectionOwner !== entry.successorCorrectionOwner
    || sentinel.assuranceControlOwner !== entry.assuranceControlOwner
    || !sameStringSet(sentinel.authorizedBootstrapOwners, entry.authorizedBootstrapOwners))) return null;
  return entry;
}

export function lateReviewSentinelValidationState(sentinel) {
  const identityEntry = canonicalLateReviewIdentityEntry(sentinel);
  const entry = canonicalLateReviewOwnerEntry(sentinel);
  if (!identityEntry || lateReviewFindingSetHash(sentinel?.findings) !== identityEntry.findingSetHash) {
    return "OPTIONAL_ADVISORY_PENDING_TRIAGE";
  }
  return entry ? "INTERNALLY_VALIDATED_BLOCKING" : "INTERNALLY_VALIDATED_OWNER_POLICY_INVALID";
}

export function lateReviewSuccessorCorrectionOwner(sentinel) {
  return canonicalLateReviewOwnerEntry(sentinel)?.successorCorrectionOwner ?? null;
}

export function lateReviewAllowedOwners(sentinel) {
  const entry = canonicalLateReviewOwnerEntry(sentinel);
  if (!entry) return [];
  return [...new Set([entry.successorCorrectionOwner, entry.assuranceControlOwner, ...entry.authorizedBootstrapOwners])].sort();
}

export function lateReviewRegistryCoverageFindings(sentinels) {
  const records = Array.isArray(sentinels) ? sentinels : [];
  return canonicalLateReviewOwnerRegistry.flatMap((entry) => {
    const matches = records.filter((sentinel) => sentinel?.repository === entry.repository
      && sentinel?.prNumber === entry.prNumber
      && sentinel?.mergeSha === entry.mergeSha);
    if (matches.length === 0) return [{ id: "LATE_REVIEW_REQUIRED_SENTINEL_MISSING", prNumber: entry.prNumber }];
    if (matches.length > 1) return [{ id: "LATE_REVIEW_REQUIRED_SENTINEL_DUPLICATE", prNumber: entry.prNumber }];
    if (lateReviewFindingSetHash(matches[0]?.findings) !== entry.findingSetHash) {
      return [{ id: "LATE_REVIEW_REQUIRED_SENTINEL_FINDING_SET_MISMATCH", prNumber: entry.prNumber }];
    }
    if (canonicalLateReviewOwnerEntry(matches[0]) === null) {
      return [{ id: "LATE_REVIEW_OWNER_POLICY_INVALID", prNumber: entry.prNumber }];
    }
    return [];
  });
}

export function lateReviewResolutionStructureValid(sentinel) {
  const findings = Array.isArray(sentinel?.findings) ? sentinel.findings : [];
  const evidence = sentinel?.resolutionEvidence;
  const sourceIds = findings.map(({ sourceId }) => sourceId).sort((left, right) => left - right);
  const resolvedSourceIds = Array.isArray(evidence?.correctedSourceIds) ? [...evidence.correctedSourceIds].sort((left, right) => left - right) : [];
  const threadIds = findings.map(({ threadId }) => threadId).filter(Boolean).sort();
  const resolvedThreadIds = Array.isArray(evidence?.resolvedThreadIds) ? [...evidence.resolvedThreadIds].sort() : [];
  const reviewAt = new Date(evidence?.exactHeadReviewCompletedAt).valueOf();
  const mergedAt = new Date(evidence?.successorMergedAt).valueOf();
  const readbackAt = new Date(evidence?.githubThreadResolutionReadbackAt).valueOf();
  const completedAt = new Date(evidence?.completedAt).valueOf();
  return findings.length > 0
    && findings.every(({ disposition, threadResolutionState }) => disposition === "RESOLVED"
      && (threadResolutionState === "RESOLVED" || threadResolutionState === "NOT_APPLICABLE"))
    && evidence?.schemaVersion === 1
    && Number.isInteger(evidence.successorPr)
    && evidence.successorPr > 0
    && evidence.successorBranch === lateReviewSuccessorCorrectionOwner(sentinel)
    && gitShaPattern.test(evidence.successorHead ?? "")
    && gitShaPattern.test(evidence.successorTree ?? "")
    && gitShaPattern.test(evidence.successorMergeSha ?? "")
    && evidence.exactHeadReviewedCommit === evidence.successorHead
    && evidence.exactHeadReviewedTree === evidence.successorTree
    && /^[0-9a-f]{64}$/u.test(evidence.exactHeadReviewReceiptHash ?? "")
    && /^[0-9a-f]{64}$/u.test(evidence.correctionEvidenceHash ?? "")
    && /^[0-9a-f]{64}$/u.test(evidence.dispositionEvidenceHash ?? "")
    && /^[0-9a-f]{64}$/u.test(evidence.verificationSubjectHash ?? "")
    && /^[0-9a-f]{64}$/u.test(evidence.repositoryVerificationHash ?? "")
    && evidence.allThreadsResolved === true
    && [reviewAt, mergedAt, readbackAt, completedAt].every(Number.isFinite)
    && reviewAt <= mergedAt
    && mergedAt <= readbackAt
    && readbackAt <= completedAt
    && JSON.stringify(sourceIds) === JSON.stringify(resolvedSourceIds)
    && JSON.stringify(threadIds) === JSON.stringify(resolvedThreadIds);
}

export function lateReviewResolutionSubjectHash(sentinel) {
  const evidence = structuredClone(sentinel?.resolutionEvidence ?? {});
  delete evidence.verificationSubjectHash;
  delete evidence.repositoryVerificationHash;
  return sha256(stableValue({
    repository: sentinel?.repository ?? null,
    prNumber: sentinel?.prNumber ?? null,
    mergeSha: sentinel?.mergeSha ?? null,
    successorCorrectionOwner: sentinel?.successorCorrectionOwner ?? null,
    findings: (sentinel?.findings ?? []).map(({ sourceType, sourceId, bodyHash, severity, threadId, disposition, threadResolutionState }) => ({
      sourceType,
      sourceId,
      bodyHash,
      severity,
      threadId,
      disposition,
      threadResolutionState
    })).sort((left, right) => String(left.sourceId).localeCompare(String(right.sourceId))),
    resolutionEvidence: evidence
  }));
}

export function lateReviewSentinelResolved(sentinel, options = {}) {
  if (!lateReviewResolutionStructureValid(sentinel)) return false;
  const subjectHash = lateReviewResolutionSubjectHash(sentinel);
  if (sentinel.resolutionEvidence.verificationSubjectHash !== subjectHash
    || typeof options.resolutionVerifier !== "function") return false;
  let verified;
  try { verified = options.resolutionVerifier({ sentinel, subjectHash }); } catch { return false; }
  return verified?.ok === true
    && verified.subjectHash === subjectHash
    && verified.repositoryVerificationHash === sentinel.resolutionEvidence.repositoryVerificationHash;
}

export function lateReviewFindingIdentity(finding) {
  return stableJson({
    sourceType: finding?.sourceType ?? null,
    sourceId: finding?.sourceId ?? null,
    bodyHash: finding?.bodyHash ?? null,
    threadId: finding?.threadId ?? null,
    severity: finding?.severity ?? null
  });
}

export function lateReviewFindingSetEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const leftIds = left.map(lateReviewFindingIdentity);
  const rightIds = right.map(lateReviewFindingIdentity);
  return new Set(leftIds).size === leftIds.length
    && new Set(rightIds).size === rightIds.length
    && leftIds.length === rightIds.length
    && leftIds.every((identity) => rightIds.includes(identity));
}

export function lateReviewFindingSetHash(findings) {
  if (!Array.isArray(findings)) return null;
  const identities = findings.map(lateReviewFindingIdentity).sort();
  if (new Set(identities).size !== identities.length) return null;
  return sha256(stableValue(identities));
}

export function lateReviewResolutionTombstoneHash(tombstone) {
  if (!tombstone || typeof tombstone !== "object" || Array.isArray(tombstone)) return null;
  const value = structuredClone(tombstone);
  delete value.tombstoneHash;
  return sha256(stableValue(value));
}

export function lateReviewExactSuccessorCorrectionEvidenceHash(evidence) {
  return sha256(stableValue({
    schemaVersion: evidence?.schemaVersion ?? null,
    successorPr: evidence?.successorPr ?? null,
    successorBranch: evidence?.successorBranch ?? null,
    successorHead: evidence?.successorHead ?? null,
    successorTree: evidence?.successorTree ?? null,
    successorMergeSha: evidence?.successorMergeSha ?? null,
    successorMergedAt: evidence?.successorMergedAt ?? null,
    exactHeadReviewedCommit: evidence?.exactHeadReviewedCommit ?? null,
    exactHeadReviewedTree: evidence?.exactHeadReviewedTree ?? null,
    exactHeadReviewReceiptHash: evidence?.exactHeadReviewReceiptHash ?? null,
    exactHeadReviewCompletedAt: evidence?.exactHeadReviewCompletedAt ?? null,
    reviewClassification: evidence?.reviewClassification ?? null,
    repositoryReviewP0: evidence?.repositoryReviewP0 ?? null,
    repositoryReviewP1: evidence?.repositoryReviewP1 ?? null,
    repositoryReviewBlockingP2: evidence?.repositoryReviewBlockingP2 ?? null,
    phase1RunId: evidence?.phase1RunId ?? null,
    phase1Head: evidence?.phase1Head ?? null,
    phase1Conclusion: evidence?.phase1Conclusion ?? null,
    phase1JobsPassed: evidence?.phase1JobsPassed ?? null,
    phase1JobsTotal: evidence?.phase1JobsTotal ?? null
  }));
}

export function lateReviewExactSuccessorDispositionEvidenceHash(sentinel) {
  return sha256(stableValue((sentinel?.findings ?? []).map((finding) => ({
    sourceType: finding.sourceType,
    sourceId: finding.sourceId,
    bodyHash: finding.bodyHash,
    severity: finding.severity,
    threadId: finding.threadId ?? null,
    historicalDisposition: finding.disposition,
    historicalThreadResolutionState: finding.threadResolutionState,
    closureDisposition: "RESOLVED_BY_EXACT_SUCCESSOR"
  })).sort((left, right) => String(left.sourceId).localeCompare(String(right.sourceId)))));
}

export function lateReviewExactSuccessorRepositoryVerificationHash(sentinel) {
  const evidence = sentinel?.resolutionEvidence ?? {};
  return sha256(stableValue({
    repository: sentinel?.repository ?? null,
    prNumber: sentinel?.prNumber ?? null,
    mergeSha: sentinel?.mergeSha ?? null,
    verificationSubjectHash: evidence.verificationSubjectHash ?? null,
    correctionEvidenceHash: evidence.correctionEvidenceHash ?? null,
    dispositionEvidenceHash: evidence.dispositionEvidenceHash ?? null,
    exactHeadReviewReceiptHash: evidence.exactHeadReviewReceiptHash ?? null,
    phase1RunId: evidence.phase1RunId ?? null,
    phase1Head: evidence.phase1Head ?? null,
    phase1Conclusion: evidence.phase1Conclusion ?? null,
    phase1JobsPassed: evidence.phase1JobsPassed ?? null,
    phase1JobsTotal: evidence.phase1JobsTotal ?? null
  }));
}

function lateReviewExactSuccessorResolutionValid(sentinel, tombstone) {
  const evidence = tombstone?.resolutionEvidence;
  const admission = tombstone?.protectedAdmission;
  const exactSuccessor = ({
    194: {
      successorPr: 210,
      successorBranch: "codex/d2a-livekit-mic-post-merge-review-correction",
      successorHead: "19c0b5eed34a03f33f48a955dbefc483e3d2d71d",
      successorTree: "820aae7845919268b3ed489cfa4ed2fddecdbdae",
      successorMergeSha: "31087f37290f521d956e125e518f92c3c65a736e",
      exactHeadReviewReceiptHash: "4b4da6c0b2c359348098a7f0167dd0d739e541a3b643be8e7c0c6aabe9fa6c96",
      phase1RunId: 31470393389
    },
    195: {
      successorPr: 205,
      successorBranch: "codex/assurance-active-task-and-claim-freshness-a1",
      successorHead: "9ed2ba65eff7658f13329bc3ea118d533c96c2b6",
      successorTree: "2d22874811e87af621a7b9d1ca69891b005c780d",
      successorMergeSha: "a9bd887606f74996a9f5920e6fad922e7f20598b",
      exactHeadReviewReceiptHash: "2f10c3848885bc5ae78fe3125ba148cfbb651f0a83c0fa951741e1463439ea1c",
      phase1RunId: 31354601386
    }
  })[sentinel?.prNumber];
  const subject = { ...sentinel, resolutionEvidence: evidence };
  const sourceIds = (sentinel?.findings ?? []).map(({ sourceId }) => sourceId).sort((left, right) => left - right);
  const correctedSourceIds = Array.isArray(evidence?.correctedSourceIds) ? [...evidence.correctedSourceIds].sort((left, right) => left - right) : [];
  const historicalThreadIds = (sentinel?.findings ?? []).map(({ threadId }) => threadId).filter(Boolean).sort();
  const resolvedThreadIds = Array.isArray(evidence?.resolvedThreadIds) ? [...evidence.resolvedThreadIds].sort() : [];
  const expectedResolvedThreadIds = sentinel?.prNumber === 195 ? historicalThreadIds : [];
  const expectedAllThreadsResolved = sentinel?.prNumber === 195;
  const reviewAt = new Date(evidence?.exactHeadReviewCompletedAt).valueOf();
  const mergedAt = new Date(evidence?.successorMergedAt).valueOf();
  const readbackAt = new Date(evidence?.githubThreadResolutionReadbackAt).valueOf();
  const completedAt = new Date(evidence?.completedAt).valueOf();
  return admission?.prNumber === 213
    && admission?.branch === "codex/d2a-release-critical-active-task-admission"
    && evidence?.reviewClassification === "REPOSITORY_OWNED_EXACT_HEAD"
    && evidence?.repositoryReviewP0 === 0
    && evidence?.repositoryReviewP1 === 0
    && evidence?.repositoryReviewBlockingP2 === 0
    && exactSuccessor !== undefined
    && Object.entries(exactSuccessor).every(([field, expected]) => evidence?.[field] === expected)
    && evidence?.schemaVersion === 1
    && Number.isInteger(evidence?.successorPr)
    && evidence.successorPr > 0
    && evidence.successorBranch === lateReviewSuccessorCorrectionOwner(sentinel)
    && gitShaPattern.test(evidence.successorHead ?? "")
    && gitShaPattern.test(evidence.successorTree ?? "")
    && gitShaPattern.test(evidence.successorMergeSha ?? "")
    && evidence.exactHeadReviewedCommit === evidence.successorHead
    && evidence.exactHeadReviewedTree === evidence.successorTree
    && /^[0-9a-f]{64}$/u.test(evidence.exactHeadReviewReceiptHash ?? "")
    && evidence.threadDisposition === "RESOLVED_BY_EXACT_SUCCESSOR_HISTORICAL_THREAD_STATE_RETAINED"
    && evidence.allThreadsResolved === expectedAllThreadsResolved
    && JSON.stringify(sourceIds) === JSON.stringify(correctedSourceIds)
    && JSON.stringify(resolvedThreadIds) === JSON.stringify(expectedResolvedThreadIds)
    && [reviewAt, mergedAt, readbackAt, completedAt].every(Number.isFinite)
    && reviewAt <= mergedAt
    && mergedAt <= readbackAt
    && readbackAt <= completedAt
    && Number.isInteger(evidence?.phase1RunId)
    && evidence.phase1RunId > 0
    && evidence.phase1Head === evidence.successorHead
    && evidence.phase1Conclusion === "success"
    && evidence.phase1JobsPassed === 13
    && evidence.phase1JobsTotal === 13
    && evidence.exactHeadCheckRunId === evidence.phase1RunId
    && evidence.correctionEvidenceHash === lateReviewExactSuccessorCorrectionEvidenceHash(evidence)
    && evidence.dispositionEvidenceHash === lateReviewExactSuccessorDispositionEvidenceHash(sentinel)
    && evidence.repositoryVerificationHash === lateReviewExactSuccessorRepositoryVerificationHash(subject)
    && lateReviewResolutionSubjectHash(subject) === tombstone.verificationSubjectHash;
}

export function lateReviewResolutionTombstoneValid(sentinel, tombstone) {
  if (!sentinel || !tombstone || tombstone.schemaVersion !== 1
    || tombstone.repository !== sentinel.repository
    || tombstone.prNumber !== sentinel.prNumber
    || tombstone.mergeSha !== sentinel.mergeSha
    || tombstone.findingSetHash !== lateReviewFindingSetHash(sentinel.findings)
    || tombstone.verificationSubjectHash !== tombstone.resolutionEvidence?.verificationSubjectHash
    || tombstone.tombstoneHash !== lateReviewResolutionTombstoneHash(tombstone)) return false;
  if (tombstone.admissionPolicyId === "EXACT_SUCCESSOR_PROTECTED_MAIN_V2") {
    return lateReviewExactSuccessorResolutionValid(sentinel, tombstone);
  }
  if (tombstone.admissionPolicyId !== "EXACT_HEAD_PROTECTED_MAIN_V1") return false;
  const allowedOwners = lateReviewAllowedOwners(sentinel);
  const carrier = tombstone.admissionCarrier;
  const carrierLatestPushAt = new Date(carrier?.latestSourcePushAt).valueOf();
  const carrierReviewedAt = new Date(carrier?.exactHeadReviewCompletedAt).valueOf();
  const carrierMergedAt = new Date(carrier?.mergedAt).valueOf();
  const correctionCompletedAt = new Date(tombstone.resolutionEvidence?.completedAt).valueOf();
  if (tombstone.resolutionEvidence?.successorBranch !== lateReviewSuccessorCorrectionOwner(sentinel)
    || !allowedOwners.includes(carrier?.branch)
    || !Number.isInteger(carrier?.prNumber)
    || carrier.prNumber < 1
    || !gitShaPattern.test(carrier?.head ?? "")
    || !gitShaPattern.test(carrier?.tree ?? "")
    || !gitShaPattern.test(carrier?.mergeSha ?? "")
    || !/^[0-9a-f]{64}$/u.test(carrier?.exactHeadReviewReceiptHash ?? "")
    || !/^[0-9a-f]{64}$/u.test(carrier?.repositoryVerificationHash ?? "")
    || !/^[a-z0-9][a-z0-9._-]*$/u.test(carrier?.verificationEvidenceSourceId ?? "")
    || !Number.isInteger(carrier?.exactHeadCheckRunId)
    || carrier.exactHeadCheckRunId < 1
    || !Number.isFinite(carrierLatestPushAt)
    || !Number.isFinite(carrierReviewedAt)
    || !Number.isFinite(carrierMergedAt)
    || !Number.isFinite(correctionCompletedAt)
    || carrierLatestPushAt >= carrierReviewedAt
    || correctionCompletedAt > carrierReviewedAt
    || carrierReviewedAt > carrierMergedAt) return false;
  const virtual = {
    ...sentinel,
    findings: (sentinel.findings ?? []).map((finding) => ({
      ...finding,
      disposition: "RESOLVED",
      threadResolutionState: finding.threadId ? "RESOLVED" : "NOT_APPLICABLE"
    })),
    resolutionEvidence: tombstone.resolutionEvidence
  };
  return lateReviewResolutionStructureValid(virtual)
    && lateReviewResolutionSubjectHash(virtual) === tombstone.verificationSubjectHash;
}

export function createLateReviewResolutionTombstone(resolvedSentinel, admissionCarrier) {
  const tombstone = {
    schemaVersion: 1,
    repository: resolvedSentinel?.repository,
    prNumber: resolvedSentinel?.prNumber,
    mergeSha: resolvedSentinel?.mergeSha,
    findingSetHash: lateReviewFindingSetHash(resolvedSentinel?.findings),
    resolutionEvidence: structuredClone(resolvedSentinel?.resolutionEvidence),
    verificationSubjectHash: resolvedSentinel?.resolutionEvidence?.verificationSubjectHash,
    admissionCarrier: structuredClone(admissionCarrier),
    admissionPolicyId: "EXACT_HEAD_PROTECTED_MAIN_V1"
  };
  tombstone.tombstoneHash = lateReviewResolutionTombstoneHash(tombstone);
  return tombstone;
}

export function createLateReviewExactSuccessorTombstone(resolvedSentinel, protectedAdmission) {
  const tombstone = {
    schemaVersion: 1,
    repository: resolvedSentinel?.repository,
    prNumber: resolvedSentinel?.prNumber,
    mergeSha: resolvedSentinel?.mergeSha,
    findingSetHash: lateReviewFindingSetHash(resolvedSentinel?.findings),
    resolutionEvidence: structuredClone(resolvedSentinel?.resolutionEvidence),
    verificationSubjectHash: resolvedSentinel?.resolutionEvidence?.verificationSubjectHash,
    protectedAdmission: structuredClone(protectedAdmission),
    admissionPolicyId: "EXACT_SUCCESSOR_PROTECTED_MAIN_V2"
  };
  tombstone.tombstoneHash = lateReviewResolutionTombstoneHash(tombstone);
  return tombstone;
}

export function mergeLateReviewSentinelRecords(sentinels) {
  const merged = new Map();
  for (const sentinel of Array.isArray(sentinels) ? sentinels : []) {
    const key = `${sentinel?.repository ?? ""}:${sentinel?.prNumber}:${sentinel?.mergeSha}`;
    const prior = merged.get(key);
    if (!prior) {
      merged.set(key, { ...sentinel, findings: [...(sentinel?.findings ?? [])] });
      continue;
    }
    const findings = [...(prior.findings ?? [])];
    const identities = new Set(findings.map(lateReviewFindingIdentity));
    for (const finding of sentinel?.findings ?? []) {
      const identity = lateReviewFindingIdentity(finding);
      if (!identities.has(identity)) {
        findings.push(finding);
        identities.add(identity);
      }
    }
    merged.set(key, { ...prior, ...sentinel, findings });
  }
  return [...merged.values()];
}

function factRegistryEntryMatchesClaim(entry, claim) {
  return entry?.freshnessClass === claim?.freshnessClass
    && entry?.authorityAllowed === claim?.authorityAllowed
    && entry?.platform === claim?.platform
    && entry?.provider === claim?.provider;
}

export function repositoryReadbackEvidenceHash(source) {
  if (!source?.readbackFacts || typeof source.readbackFacts !== "object" || Array.isArray(source.readbackFacts)) return null;
  return sha256(stableValue(source.readbackFacts));
}

function repositoryReadbackEvidenceBound({ claim, source, committedSource, required }) {
  const present = source?.readbackFacts !== undefined
    || source?.readbackSha256 !== undefined
    || committedSource?.readbackFacts !== undefined
    || committedSource?.readbackSha256 !== undefined;
  if (!present) return required !== true;
  const expectedHash = repositoryReadbackEvidenceHash(source);
  return /^[0-9a-f]{64}$/u.test(expectedHash ?? "")
    && source.readbackSha256 === expectedHash
    && committedSource?.readbackSha256 === expectedHash
    && stableJson(committedSource?.readbackFacts) === stableJson(source.readbackFacts)
    && source.readbackFacts?.observedAt === claim?.observedAt;
}

export function exactExternalSourceProvenance({ source, expectedSources, remoteImplementationHead, headParents, sourceTree }) {
  const exactTuple = expectedSources.some((expected) => Object.entries(expected)
    .every(([field, value]) => source?.[field] === value));
  const exactRemoteBranch = remoteImplementationHead === source?.sourceCommit;
  const exactPullRequestMerge = Array.isArray(headParents)
    && headParents.length === 2
    && headParents[1] === source?.sourceCommit
    && sourceTree === source?.subjectTree;
  return exactTuple
    && source?.subjectHead === source?.sourceCommit
    && (exactRemoteBranch || exactPullRequestMerge);
}

export const ASSURANCE_RECURSIVE_BOOTSTRAP_CYCLE = "ASSURANCE_RECURSIVE_BOOTSTRAP_CYCLE";
export const finiteTaskStates = [
  "INTENT_CAPTURED",
  "DOMAIN_DISCOVERY",
  "ARCHITECTURE_DESIGNED",
  "DEFECT_LEDGER_STABLE",
  "PREIMPLEMENTATION_ENGINEERING_CLEAR",
  "ACTIVE_IMPLEMENTATION",
  "BLOCKED_PRODUCT_FINDING",
  "MERGE_ELIGIBLE",
  "MERGED_VERIFIED",
  "ABANDONED_BY_OWNER"
];
const finiteTaskTerminalStates = new Set(["MERGED_VERIFIED", "ABANDONED_BY_OWNER"]);
const finiteTaskActiveStates = new Set(finiteTaskStates.filter((state) => !finiteTaskTerminalStates.has(state)));
const sha256Pattern = /^[0-9a-f]{64}$/u;
const finiteTaskPathHasWildcard = (file) => typeof file === "string"
  && (/[?*{}]/u.test(file) || /(?:!|@|\+)\(/u.test(file));
const finiteTaskAmendmentPathHasWildcard = (file) => finiteTaskPathHasWildcard(file)
  || /[\[\]]/u.test(file.replace(/(^|\/)\[[A-Za-z][A-Za-z0-9_]*\](?=\/|\.|$)/gu, "$1"));
const finiteTaskTerminalOutcomeIdentity = (outcome) => [outcome?.amendmentReceipt?.commentId, outcome?.testAdaptationReceipt?.commentId, outcome?.finalSourceReceipt?.commentId, outcome?.sourceHead, outcome?.mergeSha];

export function finiteTaskLeaseFor(registry, { implementationPr, implementationBranch, featureId } = {}) {
  const matches = (registry?.tasks ?? []).filter((task) => task?.implementationPr === implementationPr
    && task?.implementationBranch === implementationBranch
    && (featureId === undefined || task?.featureId === featureId));
  return matches.length === 1 ? matches[0] : null;
}

export function validateFiniteTaskLeaseRegistry(registry) {
  const findings = [];
  const tasks = Array.isArray(registry?.tasks) ? registry.tasks : [];
  const completedLeaseOutcomes = Array.isArray(registry?.completedLeaseOutcomes) ? registry.completedLeaseOutcomes : [];
  const amendmentDomains = Array.isArray(registry?.amendmentPolicy?.domains) ? registry.amendmentPolicy.domains : [];
  const adaptation = registry?.testAdaptationPolicy;
  if (registry?.schemaVersion !== 1
    || registry?.policyId !== "ASSURANCE_FINITE_TASK_LEASE_V1"
    || registry?.terminalMetaPr !== 217
    || registry?.recursiveFailureCode !== ASSURANCE_RECURSIVE_BOOTSTRAP_CYCLE
    || registry?.providerCodexReview !== "OPTIONAL_ADVISORY"
    || registry?.authority?.build !== false
    || registry?.authority?.provider !== false
    || registry?.authority?.database !== false
    || registry?.authority?.publicRelease !== false
    || registry?.amendmentPolicy?.marker !== "chillywood-assurance-task-lease-amendment-v1"
    || registry?.amendmentPolicy?.protectedMainUpdateRequired !== false
    || registry?.amendmentPolicy?.ownerCommentRequired !== true
    || amendmentDomains.length < 1
    || tasks.length < 1
    || (registry?.completedLeaseOutcomes !== undefined && !Array.isArray(registry.completedLeaseOutcomes))) findings.push("FINITE_TASK_LEASE_REGISTRY_MALFORMED");
  if (adaptation !== undefined && (adaptation?.capability !== "FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1"
    || adaptation?.policyId !== "ASSURANCE_FINITE_TASK_TEST_ADAPTATION_V1"
    || adaptation?.marker !== "chillywood-assurance-task-test-adaptation-v1"
    || adaptation?.classification !== "TEST_ADAPTATION_REQUIRED"
    || adaptation?.ownerCommentRequired !== true
    || adaptation?.liveEffectiveAmendmentReceiptRequired !== true
    || adaptation?.ordinaryAmendmentUsePreserved !== true
    || adaptation?.maximumReceiptsPerTask !== 1
    || adaptation?.maximumFiles !== 1
    || adaptation?.maximumChangedLines !== 500
    || stableJson(adaptation?.fixtureRoots) !== stableJson(["supabase/tests/"])
    || stableJson(adaptation?.fixtureExtensions) !== stableJson([".sql"])
    || !Array.isArray(adaptation?.prohibitedRoots) || adaptation.prohibitedRoots.some((root) => typeof root !== "string" || !root)
    || adaptation?.baselineTrackedRequired !== true
    || adaptation?.completePaginationRequired !== true
    || adaptation?.descendantOnly !== true
    || adaptation?.taskTerminalExpiry !== true
    || adaptation?.reusableByAnotherTaskOrPr !== false
    || stableJson(adaptation?.authority) !== stableJson(finiteTaskTestAdaptationClosedAuthority))) findings.push("FINITE_TASK_TEST_ADAPTATION_POLICY_MALFORMED");
  const amendmentDomainIds = new Set();
  for (const domain of amendmentDomains) {
    if (typeof domain?.id !== "string" || !domain.id
      || !Array.isArray(domain.amendablePaths) || !domain.amendablePaths.length
      || new Set(domain.amendablePaths).size !== domain.amendablePaths.length
      || domain.amendablePaths.some((file) => typeof file !== "string" || !file || finiteTaskAmendmentPathHasWildcard(file) || file.startsWith("/") || file.includes("..") || file.endsWith("lock") || file === "package.json")
      || !Number.isInteger(domain.maximumFiles) || domain.maximumFiles < 1
      || !Number.isInteger(domain.maximumChangedLines) || domain.maximumChangedLines < 1) findings.push("FINITE_TASK_LEASE_AMENDMENT_POLICY_MALFORMED");
    if (amendmentDomainIds.has(domain?.id)) findings.push("FINITE_TASK_LEASE_AMENDMENT_POLICY_DUPLICATE");
    amendmentDomainIds.add(domain?.id);
  }
  const seenPrs = new Set();
  const seenBranches = new Set();
  for (const task of tasks) {
    const basePaths = Array.isArray(task?.allowedPaths) ? task.allowedPaths : [];
    const artifactPaths = task?.artifactReservation?.pathGlobs;
    const amendmentMaximum = task?.amendmentMaximum;
    if (!task || typeof task !== "object"
      || typeof task.leaseId !== "string" || !task.leaseId
      || typeof task.featureId !== "string" || !task.featureId
      || !Number.isInteger(task.implementationPr) || task.implementationPr < 1
      || !isValidGitBranchName(task.implementationBranch)
      || !gitShaPattern.test(task.admittedSeedHead ?? "")
      || !gitShaPattern.test(task.admittedSeedTree ?? "")
      || !gitShaPattern.test(task.admittedBase ?? "")
      || !Number.isInteger(task.protectedAdmissionPr) || task.protectedAdmissionPr < 1
      || !Number.isInteger(task.ownerAuthorizationCommentId) || task.ownerAuthorizationCommentId < 1
      || typeof task.domain !== "string" || !task.domain
      || !["ACTIVE", "PRESERVED_DEPENDENT"].includes(task.domainOwnership)
      || !finiteTaskStates.includes(task.taskState)
      || !Array.isArray(task.allowedPaths) || task.allowedPaths.length < 1
      || new Set(task.allowedPaths).size !== task.allowedPaths.length
      || task.allowedPaths.some((entry) => typeof entry !== "string" || !entry || entry.startsWith("/") || entry.includes(".."))
      || !Number.isInteger(task.scopeBudget?.maximumFiles) || task.scopeBudget.maximumFiles < 1
      || !Number.isInteger(task.scopeBudget?.maximumChangedLines) || task.scopeBudget.maximumChangedLines < 1
      || task.scopeBudget?.maximumFiles < basePaths.length
      || (amendmentMaximum?.maximumAmendments > 0 && (
        !Array.isArray(artifactPaths)
        || basePaths.some(finiteTaskPathHasWildcard)
        || artifactPaths.some(finiteTaskPathHasWildcard)
        || stableJson([...artifactPaths].sort()) !== stableJson([...basePaths].sort())
        || task.artifactReservation?.maximumFiles !== task.scopeBudget?.maximumFiles
        || task.artifactReservation?.maximumLines !== task.scopeBudget?.maximumChangedLines
      ))
      || stableJson(task.recursionBudget) !== stableJson({ maximumAdmissionPrs: 1, maximumFinalSourceBindingPrs: 0, maximumMergeProvenancePrs: 0, maximumPostMergeTruthPrs: 1 })) {
      findings.push("FINITE_TASK_LEASE_MALFORMED");
    }
    if (amendmentMaximum !== undefined) {
      const compatibleDomains = amendmentDomains.filter(({ id }) => id === task?.domain);
      const amendmentMaximumValid = Number.isInteger(amendmentMaximum?.maximumFiles)
        && amendmentMaximum.maximumFiles >= task.scopeBudget?.maximumFiles
        && Number.isInteger(amendmentMaximum?.maximumChangedLines)
        && amendmentMaximum.maximumChangedLines >= task.scopeBudget?.maximumChangedLines
        && Number.isInteger(amendmentMaximum?.maximumAmendments)
        && amendmentMaximum.maximumAmendments >= 0
        && amendmentMaximum.maximumAmendments <= 1
        && (amendmentMaximum.maximumAmendments === 0 || task?.artifactReservation && typeof task.artifactReservation === "object");
      if (!amendmentMaximumValid) findings.push("FINITE_TASK_LEASE_AMENDMENT_RESERVATION_MALFORMED");
      if (amendmentMaximum?.maximumAmendments > 0) {
        const policy = compatibleDomains[0];
        const effectivePathCount = new Set([...basePaths, ...(policy?.amendablePaths ?? [])]).size;
        if (compatibleDomains.length !== 1
          || policy?.maximumFiles > amendmentMaximum.maximumFiles
          || policy?.maximumChangedLines > amendmentMaximum.maximumChangedLines
          || policy?.maximumFiles < effectivePathCount
          || amendmentMaximum.maximumFiles < effectivePathCount
          || policy?.maximumChangedLines < task.scopeBudget?.maximumChangedLines
          || policy?.amendablePaths?.some((file) => basePaths.includes(file))) {
          findings.push("FINITE_TASK_LEASE_AMENDMENT_POLICY_UNAVAILABLE");
        }
      }
    }
    if (seenPrs.has(task?.implementationPr) || seenBranches.has(task?.implementationBranch)) findings.push("FINITE_TASK_LEASE_DUPLICATE");
    seenPrs.add(task?.implementationPr);
    seenBranches.add(task?.implementationBranch);
  }
  if (new Set(completedLeaseOutcomes.map((outcome) => outcome?.leaseId)).size !== completedLeaseOutcomes.length
    || new Set(completedLeaseOutcomes.map((outcome) => outcome?.implementationPr)).size !== completedLeaseOutcomes.length) findings.push("FINITE_TASK_COMPLETION_LEDGER_DUPLICATE");
  const completionIdentities = completedLeaseOutcomes.map(finiteTaskTerminalOutcomeIdentity);
  if (completionIdentities.some((identity, index) => identity.some((value, field) => value != null && completionIdentities.some((other, otherIndex) => otherIndex !== index && other[field] === value)))) findings.push("FINITE_TASK_COMPLETION_LEDGER_IDENTITY_REUSED");
  for (const outcome of completedLeaseOutcomes) {
    const leases = tasks.filter(({ leaseId }) => leaseId === outcome?.leaseId);
    if (leases.length !== 1 || !finiteTaskTerminalOutcomeMatchesLease(registry, leases[0], outcome)) findings.push("FINITE_TASK_COMPLETION_LEDGER_MALFORMED");
  }
  return [...new Set(findings)].sort();
}

export function evaluateFiniteTaskCandidate({ lease, registry, candidate, effectiveReservationResolution = null }) {
  const findings = validateFiniteTaskLeaseRegistry(registry);
  if (!lease || !candidate) return { ok: false, leaseRetained: false, findings: [...new Set([...findings, "FINITE_TASK_CANDIDATE_MALFORMED"])].sort() };
  const verifiedPostMergeSource = finiteTaskPostMergeCandidateValid(candidate);
  if (candidate.pr !== lease.implementationPr) findings.push("FINITE_TASK_WRONG_PR");
  if (candidate.branch !== lease.implementationBranch) findings.push("FINITE_TASK_WRONG_BRANCH");
  if (candidate.prState !== "open" && !verifiedPostMergeSource) findings.push("FINITE_TASK_PR_NOT_OPEN");
  if (!gitShaPattern.test(candidate.head ?? "") || !gitShaPattern.test(candidate.tree ?? "")) findings.push("FINITE_TASK_CANDIDATE_MALFORMED");
  if (candidate.seedTree !== lease.admittedSeedTree) findings.push("FINITE_TASK_ADMITTED_ANCESTRY_REWRITTEN");
  if (candidate.seedIsAncestor !== true) findings.push("FINITE_TASK_NON_DESCENDANT_HEAD");
  if (candidate.baseIsAncestor !== true) findings.push("FINITE_TASK_ADMITTED_BASE_MISSING");
  if (candidate.observationSource === "GITHUB_PULL_REQUEST_EVENT") {
    if (!Array.isArray(candidate.mergeRefParents) || candidate.mergeRefParents.length !== 2) findings.push("FINITE_TASK_MERGE_REF_MALFORMED");
    else {
      if (candidate.mergeRefParents[0] !== candidate.currentProtectedBase || candidate.eventBase !== candidate.currentProtectedBase) findings.push("FINITE_TASK_MERGE_REF_WRONG_FIRST_PARENT");
      if (candidate.mergeRefParents[1] !== candidate.head) findings.push("FINITE_TASK_MERGE_REF_WRONG_SECOND_PARENT");
    }
    if (candidate.mergeRefSourceTree !== candidate.tree) findings.push("FINITE_TASK_MERGE_REF_WRONG_SOURCE_TREE");
  } else if (candidate.observationSource !== undefined
    && candidate.observationSource !== "LOCAL_REMOTE_IMPLEMENTATION_BRANCH"
    && !(candidate.observationSource === "LIVE_GITHUB_VERIFIED_POST_MERGE_SOURCE" && verifiedPostMergeSource)) {
    findings.push("FINITE_TASK_CANDIDATE_OBSERVATION_SOURCE_INVALID");
  }
  const changedPaths = Array.isArray(candidate.changedPaths) ? candidate.changedPaths : [];
  const trustedOverlayResolution = finiteTaskEffectiveReservationAuthorityValid(effectiveReservationResolution)
    && effectiveReservationResolution?.status === "AMENDED_WITH_TEST_ADAPTATION";
  const layeredScope = trustedOverlayResolution
    && effectiveReservationResolution?.scopeBase === candidate.scopeBase
    && effectiveReservationResolution?.candidateHead === candidate.head
    && effectiveReservationResolution?.candidateTree === candidate.tree;
  if (trustedOverlayResolution && !layeredScope) findings.push("FINITE_TASK_TEST_ADAPTATION_CANDIDATE_SCOPE_MISMATCH");
  const allowedPaths = layeredScope ? effectiveReservationResolution.aggregateReservation.allowedPaths : lease.allowedPaths;
  if (changedPaths.some((entry) => !allowedPaths.includes(entry))) findings.push("FINITE_TASK_UNAUTHORIZED_PATH");
  const scopeInvalid = layeredScope
    ? stableJson(changedPaths) !== stableJson(effectiveReservationResolution?.scopePartitions?.aggregate?.actualPaths)
      || effectiveReservationResolution?.scopePartitions?.aggregate?.canonicalChangedLines !== candidate.changedLines
    : changedPaths.length > lease.scopeBudget.maximumFiles
      || !Number.isInteger(candidate.changedLines)
      || candidate.changedLines < 0
      || candidate.changedLines > lease.scopeBudget.maximumChangedLines;
  if (scopeInvalid) findings.push("FINITE_TASK_SCOPE_OVERFLOW");
  const competitors = (registry?.tasks ?? []).filter((task) => task.leaseId !== lease.leaseId
    && task.domain === lease.domain
    && task.domainOwnership === "ACTIVE"
    && !finiteTaskLeaseEffectivelyTerminal(registry, task));
  if (competitors.length) findings.push("FINITE_TASK_COMPETING_DOMAIN_OWNER");
  if (!finiteTaskActiveStates.has(lease.taskState) || finiteTaskLeaseEffectivelyTerminal(registry, lease)) findings.push("FINITE_TASK_TERMINAL");
  const blockingFinding = candidate.findings?.P0 > 0
    || candidate.findings?.P1 > 0
    || candidate.findings?.launchImpactingP2 > 0;
  const invalidated = {
    ownerFinalReceipt: blockingFinding || candidate.finalReceiptHead !== candidate.head,
    repositoryReview: blockingFinding || candidate.repositoryReviewHead !== candidate.head,
    phase1: blockingFinding || candidate.phase1Head !== candidate.head,
    mergeEligibility: blockingFinding
      || candidate.finalReceiptHead !== candidate.head
      || candidate.repositoryReviewHead !== candidate.head
      || candidate.phase1Head !== candidate.head
  };
  const taskState = blockingFinding
    ? "BLOCKED_PRODUCT_FINDING"
    : invalidated.mergeEligibility
      ? "ACTIVE_IMPLEMENTATION"
      : "MERGE_ELIGIBLE";
  const unique = [...new Set(findings)].sort();
  return { ok: unique.length === 0, leaseRetained: !unique.includes("FINITE_TASK_TERMINAL"), taskState, invalidated, findings: unique };
}

const finalReceiptFields = [
  "schemaVersion", "policyId", "repository", "featureId", "implementationPr", "implementationBranch",
  "admittedSeedHead", "finalHead", "finalTree", "diffHash", "changedPathHash", "scopeResult",
  "callDomainClosureLedgerHash", "focusedTestHash", "mutationNegativeControlHash", "repositoryReviewHash",
  "phase1RunId", "phase1Head", "baseLeaseHash", "baseReservation", "effectiveReservation",
  "amendmentReceipt", "authority"
];
const testAdaptationFinalReceiptFields = ["scopeBase", "testAdaptationReservation", "aggregateReservation", "scopePartitions", "testAdaptationReceipt"];
export const finalReceiptMarker = "<!-- chillywood-assurance-final-task-receipt-v1 -->";

export function finiteTaskFinalReceiptSubject(value) {
  const fields = value?.schemaVersion === 3 ? [...finalReceiptFields, ...testAdaptationFinalReceiptFields] : finalReceiptFields;
  return Object.fromEntries(fields.map((field) => [field, structuredClone(value?.[field])]));
}

export function finiteTaskFinalReceiptBody(value) {
  const subject = finiteTaskFinalReceiptSubject(value);
  const payload = { subject, subjectHash: sha256(subject) };
  return `${finalReceiptMarker}\n${stableJson(subject.schemaVersion >= 2 ? { ...payload, bodyHash: sha256(payload) } : payload)}`;
}

export function verifyFiniteTaskFinalReceipt({ lease, candidate, evidence, receipt, observation, effectiveReservationResolution = null }) {
  const amendmentBound = effectiveReservationResolution?.status === "AMENDED"
    || effectiveReservationResolution?.status === "AMENDED_WITH_TEST_ADAPTATION"
    || evidence?.effectiveReservation !== undefined
    || evidence?.amendmentReceipt !== undefined;
  const resolvedAuthority = effectiveReservationResolution ? {
    providerMutation: effectiveReservationResolution.authority?.providerMutation,
    databaseDeployment: effectiveReservationResolution.authority?.databaseDeployment,
    build: effectiveReservationResolution.authority?.build,
    submission: effectiveReservationResolution.authority?.submission,
    ota: effectiveReservationResolution.authority?.ota,
    publicRelease: effectiveReservationResolution.authority?.publicRelease
  } : evidence?.authority;
  const testAdaptationBound = effectiveReservationResolution?.status === "AMENDED_WITH_TEST_ADAPTATION";
  const subject = finiteTaskFinalReceiptSubject({
    schemaVersion: testAdaptationBound ? 3 : amendmentBound ? 2 : 1,
    policyId: "ASSURANCE_FINITE_TASK_LEASE_V1",
    repository: "Chillywood2025/chillywood-mobile",
    featureId: lease?.featureId,
    implementationPr: lease?.implementationPr,
    implementationBranch: lease?.implementationBranch,
    admittedSeedHead: lease?.admittedSeedHead,
    finalHead: candidate?.head,
    finalTree: candidate?.tree,
    diffHash: candidate?.diffHash,
    changedPathHash: candidate?.changedPathHash,
    scopeResult: evidence?.scopeResult,
    callDomainClosureLedgerHash: evidence?.callDomainClosureLedgerHash,
    focusedTestHash: evidence?.focusedTestHash,
    mutationNegativeControlHash: evidence?.mutationNegativeControlHash,
    repositoryReviewHash: evidence?.repositoryReviewHash,
    phase1RunId: evidence?.phase1RunId,
    phase1Head: evidence?.phase1Head,
    baseLeaseHash: amendmentBound ? effectiveReservationResolution?.baseLeaseHash ?? evidence?.baseLeaseHash : undefined,
    baseReservation: amendmentBound ? effectiveReservationResolution?.baseReservation ?? evidence?.baseReservation : undefined,
    effectiveReservation: amendmentBound ? effectiveReservationResolution?.effectiveReservation ?? evidence?.effectiveReservation : undefined,
    amendmentReceipt: amendmentBound ? effectiveReservationResolution?.amendmentReceipt ?? evidence?.amendmentReceipt : undefined,
    scopeBase: testAdaptationBound ? effectiveReservationResolution?.scopeBase : undefined,
    testAdaptationReservation: testAdaptationBound ? effectiveReservationResolution?.testAdaptationReservation : undefined,
    aggregateReservation: testAdaptationBound ? effectiveReservationResolution?.aggregateReservation : undefined,
    scopePartitions: testAdaptationBound ? effectiveReservationResolution?.scopePartitions : undefined,
    testAdaptationReceipt: testAdaptationBound ? effectiveReservationResolution?.testAdaptationReceipt : undefined,
    authority: amendmentBound ? resolvedAuthority : undefined
  });
  const hashesValid = [subject.diffHash, subject.changedPathHash, subject.callDomainClosureLedgerHash,
    subject.focusedTestHash, subject.mutationNegativeControlHash, subject.repositoryReviewHash]
    .every((value) => sha256Pattern.test(value ?? ""));
  const body = finiteTaskFinalReceiptBody(subject);
  const subjectHash = sha256(subject);
  const payloadBodyHash = sha256({ subject, subjectHash });
  const rawBodyHash = sha256(body);
  const receiptHashesValid = subject.schemaVersion >= 2
    ? receipt?.subjectHash === subjectHash
      && receipt?.bodyHash === payloadBodyHash
      && receipt?.rawBodyHash === rawBodyHash
    : receipt?.subjectHash === subjectHash && receipt?.bodySha256 === rawBodyHash;
  const ok = hashesValid
    && subject.scopeResult === "PASS"
    && Number.isInteger(subject.phase1RunId) && subject.phase1RunId > 0
    && subject.phase1Head === candidate?.head
    && (!amendmentBound || (
      evidence?.repositoryReview?.valid === true
      && evidence.repositoryReview.reviewedHead === candidate?.head
      && evidence.repositoryReview.reviewedTree === candidate?.tree
      && stableJson(evidence.repositoryReview.disposition) === stableJson({ P0: 0, P1: 0, launchImpactingP2: 0 })
      && subject.repositoryReviewHash === evidence.repositoryReview.subjectHash
      && evidence?.phase1Evidence?.valid === true
      && evidence.phase1Evidence.result === "PASS_13_OF_13"
      && evidence.phase1Evidence.sourceHead === candidate?.head
      && evidence.phase1Evidence.sourceTree === candidate?.tree
      && subject.phase1RunId === evidence.phase1Evidence.runId
      && subject.phase1Head === evidence.phase1Evidence.sourceHead
    ))
    && (!amendmentBound || (
      finiteTaskEffectiveReservationAuthorityValid(effectiveReservationResolution)
      && ["AMENDED", "AMENDED_WITH_TEST_ADAPTATION"].includes(effectiveReservationResolution?.status)
      && effectiveReservationResolution?.authority?.liveReceipt === true
      && effectiveReservationResolution?.candidateHead === candidate?.head
      && effectiveReservationResolution?.candidateTree === candidate?.tree
      && subject.baseLeaseHash === sha256(lease)
      && subject.baseReservation?.reservationHash === sha256({
        allowedPaths: subject.baseReservation?.allowedPaths,
        pathGlobs: subject.baseReservation?.pathGlobs,
        maximumFiles: subject.baseReservation?.maximumFiles,
        maximumLines: subject.baseReservation?.maximumLines,
        eligiblePathCount: subject.baseReservation?.eligiblePathCount
      })
      && subject.effectiveReservation?.reservationHash === sha256({
        allowedPaths: subject.effectiveReservation?.allowedPaths,
        pathGlobs: subject.effectiveReservation?.pathGlobs,
        maximumFiles: subject.effectiveReservation?.maximumFiles,
        maximumLines: subject.effectiveReservation?.maximumLines,
        eligiblePathCount: subject.effectiveReservation?.eligiblePathCount
      })
      && Number.isInteger(subject.amendmentReceipt?.commentId)
      && subject.amendmentReceipt.commentId > 0
      && [subject.amendmentReceipt.subjectHash, subject.amendmentReceipt.bodyHash, subject.amendmentReceipt.rawBodyHash]
        .every((value) => sha256Pattern.test(value ?? ""))
      && stableJson(subject.authority) === stableJson({
        providerMutation: false,
        databaseDeployment: false,
        build: false,
        submission: false,
        ota: false,
        publicRelease: false
      })
      && (!testAdaptationBound || (
        subject.schemaVersion === 3
        && subject.scopeBase === effectiveReservationResolution.scopeBase
        && candidate?.scopeBase === effectiveReservationResolution.scopeBase
        && stableJson(subject.testAdaptationReservation) === stableJson(effectiveReservationResolution.testAdaptationReservation)
        && stableJson(subject.aggregateReservation) === stableJson(effectiveReservationResolution.aggregateReservation)
        && stableJson(subject.scopePartitions) === stableJson(effectiveReservationResolution.scopePartitions)
        && stableJson(subject.testAdaptationReceipt) === stableJson(effectiveReservationResolution.testAdaptationReceipt)
        && Number.isInteger(subject.testAdaptationReceipt?.commentId)
        && [subject.testAdaptationReceipt?.subjectHash, subject.testAdaptationReceipt?.bodyHash, subject.testAdaptationReceipt?.rawBodyHash].every((value) => sha256Pattern.test(value ?? ""))
      ))
    ))
    && receiptHashesValid
    && Number.isInteger(receipt?.commentId) && receipt.commentId > 0
    && receipt?.commentId === observation?.commentId
    && receipt?.author === "Chillywood2025"
    && receipt?.authorAssociation === "OWNER"
    && observation?.author === receipt.author
    && observation?.authorAssociation === receipt.authorAssociation
    && typeof observation?.createdAt === "string"
    && observation.createdAt === observation.updatedAt
    && observation.issueUrl === `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${lease?.implementationPr}`
    && observation.body === body;
  return { ok, stale: typeof receipt?.subjectHash === "string" && receipt.subjectHash !== subjectHash, subject, subjectHash, bodyHash: subject.schemaVersion >= 2 ? payloadBodyHash : rawBodyHash, rawBodyHash };
}
export function verifyFiniteTaskFinalSourceEligibility({
  lease,
  candidate,
  evidence,
  effectiveReservationResolution,
  comments = [],
  commentsPaginationComplete = false
} = {}) {
  const findings = [];
  if (!Array.isArray(comments) || commentsPaginationComplete !== true) findings.push("FINITE_TASK_FINAL_SOURCE_DISCOVERY_INCOMPLETE");
  const matches = (Array.isArray(comments) ? comments : []).filter(({ body }) => typeof body === "string" && body.includes(finalReceiptMarker));
  if (matches.length !== 1) findings.push("FINITE_TASK_FINAL_SOURCE_CARDINALITY_INVALID");
  let verified = null;
  let normalizedReceipt = null;
  if (matches.length === 1) {
    const observation = normalizeIssueComment(matches[0]);
    let envelope = null;
    try {
      envelope = observation.body.startsWith(`${finalReceiptMarker}\n`)
        ? JSON.parse(observation.body.slice(finalReceiptMarker.length + 1))
        : null;
    } catch {}
    const receipt = {
      commentId: observation.commentId,
      author: observation.author,
      authorAssociation: observation.authorAssociation,
      subjectHash: envelope?.subjectHash,
      bodyHash: envelope?.bodyHash,
      rawBodyHash: sha256(observation.body ?? ""),
      bodySha256: sha256(observation.body ?? "")
    };
    verified = verifyFiniteTaskFinalReceipt({ lease, candidate, evidence, receipt, observation, effectiveReservationResolution });
    if (!verified.ok) findings.push("FINITE_TASK_FINAL_SOURCE_RECEIPT_INVALID");
    normalizedReceipt = verified.ok ? {
      commentId: observation.commentId,
      createdAt: observation.createdAt,
      subjectHash: verified.subjectHash,
      bodyHash: verified.bodyHash,
      rawBodyHash: verified.rawBodyHash,
      finalHead: verified.subject.finalHead,
      finalTree: verified.subject.finalTree,
      effectiveReservationHash: verified.subject.effectiveReservation?.reservationHash ?? null,
      amendmentCommentId: verified.subject.amendmentReceipt?.commentId ?? null,
      ...(verified.subject.schemaVersion === 3 ? {
        aggregateReservationHash: verified.subject.aggregateReservation?.reservationHash ?? null,
        testAdaptationCommentId: verified.subject.testAdaptationReceipt?.commentId ?? null
      } : {})
    } : null;
  }
  const unique = [...new Set(findings)].sort();
  return {
    ok: unique.length === 0,
    mergeEligible: unique.length === 0,
    findings: unique,
    receipt: normalizedReceipt,
    subject: verified?.subject ?? null
  };
}

export function transitionFiniteTaskState(currentState, event) {
  if (!finiteTaskStates.includes(currentState)) return { ok: false, state: currentState, finding: "FINITE_TASK_STATE_MALFORMED" };
  if (finiteTaskTerminalStates.has(currentState)) return { ok: false, state: currentState, finding: "FINITE_TASK_TERMINAL" };
  const transitions = {
    SOURCE_PUSH: "ACTIVE_IMPLEMENTATION",
    PRODUCT_FINDING: "BLOCKED_PRODUCT_FINDING",
    EVIDENCE_CLEAR: "MERGE_ELIGIBLE",
    OWNER_ABANDONED: "ABANDONED_BY_OWNER"
  };
  if (event === "MERGE_VERIFIED") {
    return currentState === "MERGE_ELIGIBLE"
      ? { ok: true, state: "MERGED_VERIFIED", finding: null }
      : { ok: false, state: currentState, finding: "FINITE_TASK_MERGE_NOT_ELIGIBLE" };
  }
  const state = transitions[event];
  return state ? { ok: true, state, finding: null } : { ok: false, state: currentState, finding: "FINITE_TASK_EVENT_MALFORMED" };
}

export function verifyFiniteTaskMergeProvenance({ lease, receiptSubject, currentProtectedBase, mergeRef, actualMerge = null, effectiveReservationResolution = null }) {
  const findings = [];
  if (mergeRef?.pr !== lease?.implementationPr) findings.push("FINITE_MERGE_WRONG_PR");
  if (mergeRef?.branch !== lease?.implementationBranch) findings.push("FINITE_MERGE_WRONG_BRANCH");
  if (!Array.isArray(mergeRef?.parents) || mergeRef.parents.length !== 2) findings.push("FINITE_MERGE_NOT_TWO_PARENT");
  else {
    if (mergeRef.parents[0] !== currentProtectedBase) findings.push("FINITE_MERGE_WRONG_FIRST_PARENT");
    if (mergeRef.parents[1] !== receiptSubject?.finalHead) findings.push("FINITE_MERGE_WRONG_SECOND_PARENT");
  }
  if (mergeRef?.sourceTree !== receiptSubject?.finalTree) findings.push("FINITE_MERGE_WRONG_SOURCE_TREE");
  if (!gitShaPattern.test(mergeRef?.tree ?? "")) findings.push("FINITE_MERGE_TREE_MALFORMED");
  if (receiptSubject?.schemaVersion >= 2 && (
    !finiteTaskEffectiveReservationAuthorityValid(effectiveReservationResolution)
    || receiptSubject.baseLeaseHash !== effectiveReservationResolution?.baseLeaseHash
    || receiptSubject.baseReservation?.reservationHash !== effectiveReservationResolution?.baseReservation?.reservationHash
    || receiptSubject.effectiveReservation?.reservationHash !== effectiveReservationResolution?.effectiveReservation?.reservationHash
    || stableJson(receiptSubject.amendmentReceipt) !== stableJson(effectiveReservationResolution?.amendmentReceipt)
  )) findings.push("FINITE_MERGE_EFFECTIVE_RESERVATION_MISMATCH");
  if (receiptSubject?.schemaVersion === 3 && (
    effectiveReservationResolution?.status !== "AMENDED_WITH_TEST_ADAPTATION"
    || effectiveReservationResolution?.scopeBase !== currentProtectedBase
    || receiptSubject.scopeBase !== currentProtectedBase
    || stableJson(receiptSubject.testAdaptationReservation) !== stableJson(effectiveReservationResolution?.testAdaptationReservation)
    || stableJson(receiptSubject.aggregateReservation) !== stableJson(effectiveReservationResolution?.aggregateReservation)
    || stableJson(receiptSubject.scopePartitions) !== stableJson(effectiveReservationResolution?.scopePartitions)
    || stableJson(receiptSubject.testAdaptationReceipt) !== stableJson(effectiveReservationResolution?.testAdaptationReceipt)
  )) findings.push("FINITE_MERGE_TEST_ADAPTATION_RESERVATION_MISMATCH");
  if (actualMerge) {
    if (!Array.isArray(actualMerge.parents) || actualMerge.parents.length !== 2) findings.push("FINITE_ACTUAL_MERGE_NOT_TWO_PARENT");
    else {
      if (actualMerge.parents[0] !== currentProtectedBase) findings.push("FINITE_ACTUAL_MERGE_WRONG_FIRST_PARENT");
      if (actualMerge.parents[1] !== receiptSubject?.finalHead) findings.push("FINITE_ACTUAL_MERGE_WRONG_SECOND_PARENT");
    }
    if (actualMerge.tree !== mergeRef?.tree) findings.push("FINITE_ACTUAL_MERGE_TREE_MISMATCH");
  }
  const unique = [...new Set(findings)].sort();
  return { ok: unique.length === 0, syntheticMergeTree: mergeRef?.tree ?? null, findings: unique };
}

export function detectAssuranceRecursion({ lease, requestedDependency, counts = {}, controlDependsOnControl = false }) {
  const budget = lease?.recursionBudget ?? {};
  const admissionPrs = counts.admissionPrs ?? (Number.isInteger(lease?.protectedAdmissionPr) ? 1 : 0);
  const exceeds = requestedDependency === "ADMISSION_PR" && admissionPrs >= budget.maximumAdmissionPrs
    || requestedDependency === "FINAL_SOURCE_BINDING_PR" && (counts.finalSourceBindingPrs ?? 0) >= budget.maximumFinalSourceBindingPrs
    || requestedDependency === "MERGE_PROVENANCE_PR" && (counts.mergeProvenancePrs ?? 0) >= budget.maximumMergeProvenancePrs
    || requestedDependency === "POST_MERGE_TRUTH_PR" && (counts.postMergeTruthPrs ?? 0) >= budget.maximumPostMergeTruthPrs
    || ["CURRENT_TRUTH_BINDING_PR", "TRUTH_ONLY_PR"].includes(requestedDependency);
  return controlDependsOnControl || exceeds
    ? { ok: false, code: ASSURANCE_RECURSIVE_BOOTSTRAP_CYCLE }
    : { ok: true, code: null };
}

function safeRuntimeGit(gitCommand, argv, fallback = null) {
  try { return gitCommand(argv); } catch { return fallback; }
}

function readGithubEvent(environment = process.env) {
  const eventPath = environment?.GITHUB_EVENT_PATH;
  if (typeof eventPath !== "string" || !eventPath) return null;
  try { return JSON.parse(fs.readFileSync(eventPath, "utf8")); } catch { return null; }
}

export function resolveCurrentProtectedBase({
  currentProtectedBase,
  githubEvent,
  gitCommand = git,
  environment = process.env
} = {}) {
  const resolved = (protectedBase, source) => ({ ok: true, protectedBase, source, findings: [] });
  const unavailable = (findings = []) => ({
    ok: false,
    protectedBase: null,
    source: null,
    findings: [...new Set(["FINITE_TASK_CURRENT_PROTECTED_BASE_UNAVAILABLE", ...findings])].sort()
  });
  if (currentProtectedBase !== undefined && currentProtectedBase !== null) {
    return gitShaPattern.test(currentProtectedBase)
      ? resolved(currentProtectedBase, "EXPLICIT_ARGUMENT")
      : unavailable(["FINITE_TASK_CURRENT_PROTECTED_BASE_INVALID_EXPLICIT"]);
  }
  const event = githubEvent === undefined ? readGithubEvent(environment) : githubEvent;
  if (event?.pull_request) {
    const pullRequestBase = event.pull_request?.base?.sha;
    return gitShaPattern.test(pullRequestBase ?? "")
      ? resolved(pullRequestBase, "GITHUB_PULL_REQUEST_EVENT")
      : unavailable(["FINITE_TASK_CURRENT_PROTECTED_BASE_INVALID_PULL_REQUEST_EVENT"]);
  }
  const eventName = environment?.GITHUB_EVENT_NAME;
  const eventRef = event?.ref ?? environment?.GITHUB_REF;
  if ((eventName === "push" || (!eventName && event?.after)) && eventRef === "refs/heads/main") {
    return gitShaPattern.test(event?.after ?? "")
      ? resolved(event.after, "GITHUB_PUSH_TO_PROTECTED_MAIN")
      : unavailable(["FINITE_TASK_CURRENT_PROTECTED_BASE_INVALID_MAIN_PUSH_EVENT"]);
  }
  const remoteMain = safeRuntimeGit(gitCommand, ["rev-parse", "origin/main"]);
  if (gitShaPattern.test(remoteMain ?? "")) return resolved(remoteMain, "EXACT_LOCAL_REMOTE");
  const branch = safeRuntimeGit(gitCommand, ["branch", "--show-current"]);
  if (branch === "main" || eventRef === "refs/heads/main") {
    const head = safeRuntimeGit(gitCommand, ["rev-parse", "HEAD"]);
    if (gitShaPattern.test(head ?? "")) return resolved(head, "MAIN_CHECKOUT_FALLBACK");
  }
  return unavailable();
}

function runtimeChangedLines(gitCommand, range) {
  const output = gitCommand(["diff", "--numstat", range]);
  return output.split(/\r?\n/gu).filter(Boolean).reduce((total, line) => total + line.split("\t").slice(0, 2)
    .reduce((sum, value) => sum + (/^\d+$/u.test(value) ? Number(value) : 0), 0), 0);
}

export function deriveFiniteTaskCandidateObservation({
  record,
  lease,
  suppliedObservation,
  githubEvent,
  checkoutHead,
  currentProtectedBase,
  effectiveReservationObservation = null,
  finiteTaskPostMergeTransition = null,
  gitCommand = git,
  environment = process.env
} = {}) {
  const findings = [];
  if (!lease) return { ok: false, candidate: null, findings: ["FINITE_TASK_LEASE_NOT_FOUND"] };
  const event = githubEvent === undefined ? readGithubEvent(environment) : githubEvent;
  const protectedBase = currentProtectedBase ?? safeRuntimeGit(gitCommand, ["rev-parse", "origin/main"]);
  if (!gitShaPattern.test(protectedBase ?? "")) findings.push("FINITE_TASK_PROTECTED_BASE_UNAVAILABLE");
  const eventPr = event?.pull_request;
  const eventNumber = eventPr?.number ?? event?.number;
  const matchingPullRequestEvent = eventNumber === lease.implementationPr;
  const verifiedClosedSource = verifiedFiniteTaskClosedSource({
    lease,
    liveObservation: effectiveReservationObservation,
    postMergeTransition: finiteTaskPostMergeTransition
  });
  let identity;
  if (matchingPullRequestEvent && eventPr?.state === "open") {
    identity = {
      pr: eventNumber,
      branch: eventPr?.head?.ref,
      prState: eventPr?.state,
      head: eventPr?.head?.sha,
      eventBase: eventPr?.base?.sha,
      observationSource: "GITHUB_PULL_REQUEST_EVENT"
    };
    if (!Number.isInteger(identity.pr)
      || !isValidGitBranchName(identity.branch)
      || identity.prState !== "open"
      || !gitShaPattern.test(identity.head ?? "")
      || !gitShaPattern.test(identity.eventBase ?? "")) findings.push("FINITE_TASK_GITHUB_EVENT_MALFORMED");
  } else if (matchingPullRequestEvent && verifiedClosedSource) {
    identity = {
      pr: verifiedClosedSource.pr,
      branch: verifiedClosedSource.branch,
      prState: "closed",
      head: verifiedClosedSource.head,
      eventBase: protectedBase,
      scopeBase: verifiedClosedSource.scopeBase,
      mergeSha: verifiedClosedSource.mergeSha,
      observationSource: "LIVE_GITHUB_VERIFIED_POST_MERGE_SOURCE"
    };
  } else if (matchingPullRequestEvent) {
    findings.push("FINITE_TASK_GITHUB_EVENT_MALFORMED");
  } else {
    const observed = suppliedObservation ?? record?.finiteTaskRuntime?.candidateObservation;
    const remoteHead = safeRuntimeGit(gitCommand, ["show-ref", "--verify", "--hash", implementationRemoteRef(lease.implementationBranch)]);
    const postMergeFallback = !gitShaPattern.test(remoteHead ?? "") ? verifiedClosedSource : null;
    identity = {
      pr: postMergeFallback?.pr ?? observed?.pr,
      branch: postMergeFallback?.branch ?? observed?.branch,
      prState: postMergeFallback ? "closed" : observed?.prState,
      head: postMergeFallback?.head ?? remoteHead,
      eventBase: protectedBase,
      scopeBase: postMergeFallback?.scopeBase ?? protectedBase,
      mergeSha: postMergeFallback?.mergeSha ?? null,
      observationSource: postMergeFallback ? "LIVE_GITHUB_VERIFIED_POST_MERGE_SOURCE" : "LOCAL_REMOTE_IMPLEMENTATION_BRANCH",
      recordedObservationHead: observed?.head ?? null
    };
    if (!Number.isInteger(identity.pr)
      || !isValidGitBranchName(identity.branch)
      || (!postMergeFallback && identity.prState !== "open")
      || (postMergeFallback && identity.prState !== "closed")
      || !gitShaPattern.test(identity.head ?? "")) findings.push("FINITE_TASK_LOCAL_OBSERVATION_MALFORMED");
  }
  if (findings.length) return { ok: false, candidate: null, findings: [...new Set(findings)].sort() };
  try {
    const head = identity.head;
    const tree = gitCommand(["rev-parse", `${head}^{tree}`]);
    const seedTree = gitCommand(["rev-parse", `${lease.admittedSeedHead}^{tree}`]);
    const seedIsAncestor = safeRuntimeGit(gitCommand, ["merge-base", "--is-ancestor", lease.admittedSeedHead, head], null) !== null;
    const baseIsAncestor = safeRuntimeGit(gitCommand, ["merge-base", "--is-ancestor", lease.admittedBase, head], null) !== null;
    const range = `${identity.scopeBase ?? protectedBase}...${head}`;
    const changedPaths = gitCommand(["diff", "--name-only", range]).split(/\r?\n/gu).filter(Boolean).sort();
    const changedLines = runtimeChangedLines(gitCommand, range);
    const candidate = {
      pr: identity.pr,
      branch: identity.branch,
      prState: identity.prState,
      head,
      tree,
      seedTree,
      seedIsAncestor,
      baseIsAncestor,
      changedPaths,
      changedLines,
      diffHash: sha256(gitCommand(["diff", "--binary", "--no-ext-diff", range])),
      changedPathHash: sha256(changedPaths),
      findings: lease.taskState === "BLOCKED_PRODUCT_FINDING"
        ? { P0: 0, P1: 1, launchImpactingP2: 0 }
        : { P0: 0, P1: 0, launchImpactingP2: 0 },
      observationSource: identity.observationSource,
      currentProtectedBase: protectedBase,
      postMergeSha: identity.mergeSha ?? null,
      scopeBase: identity.scopeBase ?? protectedBase,
      recordedObservationHead: identity.recordedObservationHead ?? null
    };
    if (matchingPullRequestEvent && identity.observationSource === "GITHUB_PULL_REQUEST_EVENT") {
      const mergeHead = checkoutHead ?? environment?.GITHUB_SHA ?? "HEAD";
      candidate.mergeRefParents = gitCommand(["show", "-s", "--format=%P", mergeHead]).split(/\s+/u).filter(Boolean);
      candidate.mergeRefSourceTree = gitCommand(["rev-parse", `${candidate.mergeRefParents[1] ?? "missing"}^{tree}`]);
      candidate.eventBase = identity.eventBase;
    }
    if (identity.observationSource === "LIVE_GITHUB_VERIFIED_POST_MERGE_SOURCE") {
      trustedFiniteTaskPostMergeCandidates.set(candidate, finiteTaskPostMergeCandidateFingerprint(candidate));
    }
    return { ok: true, candidate, findings: [] };
  } catch {
    return { ok: false, candidate: null, findings: ["FINITE_TASK_RUNTIME_GIT_OBSERVATION_FAILED"] };
  }
}

const providerCriticalRuntimeRequirement = [{
  freshnessClass: "PROVIDER_CRITICAL",
  platform: "NONE",
  evidenceSourceId: "b3-immutable-source-binding-20260802-0600",
  authorityAllowed: "PROVIDER_READBACK_ONLY",
  requiredFacts: ["provider.supabase.b3.live-acl"]
}];

const finiteTaskOverlayRuntimeProjection = (resolution) => resolution?.status === "AMENDED_WITH_TEST_ADAPTATION" ? {
  scopeBase: resolution.scopeBase,
  aggregateReservation: resolution.aggregateReservation,
  testAdaptationReservation: resolution.testAdaptationReservation,
  scopePartitions: resolution.scopePartitions,
  testAdaptationReceipt: resolution.testAdaptationReceipt
} : {};

export function finiteTaskTerminalReservationMatchesOutcome({ terminalOutcome, reservationResolution } = {}) {
  const common = reservationResolution?.baseLeaseHash === terminalOutcome?.baseLeaseHash
    && reservationResolution?.effectiveReservation?.reservationHash === terminalOutcome?.effectiveReservation?.reservationHash
    && stableJson(reservationResolution?.amendmentReceipt) === stableJson(terminalOutcome?.amendmentReceipt);
  if (!common) return false;
  if (terminalOutcome?.schemaVersion === 1
    && terminalOutcome.classification === "FINITE_TASK_AMENDED_POST_MERGE_TERMINAL_EVIDENCE_V1") {
    return reservationResolution?.status === "AMENDED"
      && (reservationResolution?.testAdaptationsConsumed ?? 0) === 0
      && reservationResolution?.testAdaptationReceipt == null
      && reservationResolution?.testAdaptationReservation == null
      && reservationResolution?.aggregateReservation == null
      && reservationResolution?.scopePartitions == null
      && terminalOutcome?.testAdaptationReceipt == null
      && terminalOutcome?.testAdaptationReservation == null
      && terminalOutcome?.aggregateReservation == null
      && terminalOutcome?.scopePartitions == null
      && terminalOutcome?.finalSourceReceipt?.aggregateReservationHash == null
      && terminalOutcome?.finalSourceReceipt?.testAdaptationCommentId == null
      && terminalOutcome?.finalSourceReceipt?.subject == null;
  }
  return terminalOutcome?.schemaVersion === 2
    && terminalOutcome.classification === "FINITE_TASK_AMENDED_TEST_ADAPTATION_POST_MERGE_TERMINAL_EVIDENCE_V2"
    && reservationResolution?.status === "AMENDED_WITH_TEST_ADAPTATION"
    && reservationResolution?.scopeBase === terminalOutcome?.mergeParents?.[0]
    && terminalOutcome?.finalSourceReceipt?.subject?.scopeBase === terminalOutcome?.mergeParents?.[0]
    && reservationResolution?.testAdaptationsConsumed === 1
    && stableJson(reservationResolution?.testAdaptationReservation) === stableJson(terminalOutcome.testAdaptationReservation)
    && stableJson(reservationResolution?.aggregateReservation) === stableJson(terminalOutcome.aggregateReservation)
    && stableJson(reservationResolution?.scopePartitions) === stableJson(terminalOutcome.scopePartitions)
    && stableJson(reservationResolution?.testAdaptationReceipt) === stableJson(terminalOutcome.testAdaptationReceipt);
}

export function evaluateFiniteTaskLeaseRuntime({
  record,
  contract,
  now = new Date(),
  suppliedObservation,
  githubEvent,
  checkoutHead,
  currentProtectedBase,
  effectiveReservationObservation = null,
  effectiveReservationResolution = null,
  finiteTaskPostMergeTransition = null,
  gitCommand = git,
  environment = process.env
} = {}) {
  const binding = record?.activeTaskBinding;
  const lease = finiteTaskLeaseFor(record?.finiteTaskLeases, {
    implementationPr: binding?.implementationPr,
    implementationBranch: binding?.implementationBranch,
    featureId: binding?.featureId
  });
  const event = githubEvent === undefined ? readGithubEvent(environment) : githubEvent;
  const currentProtectedBaseResolution = resolveCurrentProtectedBase({
    currentProtectedBase,
    githubEvent: event,
    gitCommand,
    environment
  });
  const claimFreshness = evaluateFreshnessClaims({
    claims: record?.freshnessClaims,
    evidenceSources: record?.evidenceSources,
    freshness: contract?.freshness,
    now,
    evidenceSourceVerifier: ({ claim, source }) => verifyCommittedClaimEvidence({
      claim,
      source,
      factRegistry: contract?.freshness?.factRegistry,
      head: checkoutHead ?? "HEAD"
    })
  });
  const scopedFreshness = (requirements) => {
    const sourceIds = new Set((requirements ?? []).map(({ evidenceSourceId }) => evidenceSourceId));
    const claimIds = new Set((claimFreshness.claims ?? [])
      .filter(({ evidenceSourceId }) => sourceIds.has(evidenceSourceId))
      .map(({ id }) => id));
    const relevantFindings = (claimFreshness.findings ?? []).filter(({ claimId }) => !claimId || claimIds.has(claimId));
    const invalidClaimIds = new Set(relevantFindings.map(({ claimId }) => claimId).filter(Boolean));
    return evaluateTaskFreshness({
      ok: relevantFindings.length === 0,
      currentClaims: (claimFreshness.claims ?? []).filter(({ id, evidenceSourceId, derivedStatus }) => sourceIds.has(evidenceSourceId)
        && derivedStatus === "CURRENT"
        && !invalidClaimIds.has(id))
    }, requirements);
  };
  const leaseFreshness = scopedFreshness(binding?.requiredFreshnessClaims ?? []);
  const providerFreshness = scopedFreshness(providerCriticalRuntimeRequirement);
  const declaredAuthorityEvidence = effectiveReservationObservation?.authorityEvidence ?? {
    taskArtifactHash: lease?.closure?.artifactHash,
    ownerApproval: lease?.ownerApproval,
    jurisdictionDecision: record?.ownerJurisdictionPolicyBinding?.policySource ? {
      commentId: record.ownerJurisdictionPolicyBinding.policySource.commentId,
      subjectHash: record.ownerJurisdictionPolicyBinding.policySource.subjectHash,
      bodyHash: record.ownerJurisdictionPolicyBinding.policySource.bodyHash,
      envelopeHash: record.ownerJurisdictionPolicyBinding.policySource.envelopeHash
    } : undefined
  };
  const reservationObservation = effectiveReservationObservation ?? (lease?.amendmentMaximum?.maximumAmendments > 0
    ? observeLiveFiniteTaskEffectiveReservation({ pr: lease.implementationPr, authorityEvidence: declaredAuthorityEvidence })
    : null);
  const authorityEvidence = reservationObservation?.authorityEvidence ?? declaredAuthorityEvidence;
  const resolveEffectiveReservation = (candidate) => {
    const supplied = effectiveReservationResolution;
    if (supplied?.baseLeaseHash === (lease ? sha256(lease) : null)
      && (supplied?.status !== "AMENDED_WITH_TEST_ADAPTATION"
        || supplied?.scopeBase === (candidate?.scopeBase ?? reservationObservation?.pullRequest?.base?.sha))
      && supplied?.candidateHead === (candidate?.head ?? null)
      && supplied?.candidateTree === (candidate?.tree ?? null)) return supplied;
    return resolveFiniteTaskEffectiveReservation({
      registry: record?.finiteTaskLeases,
      lease,
      candidate,
      comments: reservationObservation?.comments ?? [],
      commentsPaginationComplete: reservationObservation?.commentsPaginationComplete ?? false,
      pullRequest: reservationObservation?.pullRequest ?? null,
      commits: reservationObservation?.commits ?? [],
      commitsPaginationComplete: reservationObservation?.commitsPaginationComplete ?? false,
      gitCommand,
      requireCompleteDiscovery: reservationObservation?.requireCompleteDiscovery
        ?? reservationObservation?.observationMode === "LIVE_GITHUB_COMPLETE_READBACK",
      observationMode: reservationObservation?.observationMode ?? "SYNTHETIC_NO_WRITE",
      authorityEvidence,
      liveObservation: reservationObservation
    });
  };
  const terminalTask = binding?.phase === "TERMINAL" || finiteTaskTerminalStates.has(lease?.taskState);
  if (!currentProtectedBaseResolution.ok) {
    const reservationResolution = resolveEffectiveReservation(null);
    const findings = [...new Set([
      ...leaseFreshness.blockers.map(({ id }) => id),
      ...reservationResolution.findings,
      ...(finiteTaskEffectiveReservationAuthorityValid(reservationResolution) ? [] : ["FINITE_TASK_EFFECTIVE_RESERVATION_LIVE_AUTHORITY_REQUIRED"]),
      ...currentProtectedBaseResolution.findings
    ])].sort();
    return {
      leaseAuthorityEligible: leaseFreshness.eligible,
      candidateEligible: false,
      candidateHead: null,
      candidateTree: null,
      scopeResult: "FAIL",
      findings,
      providerDependentEligible: false,
      sourceOnlyEligible: false,
      claimFreshness,
      leaseFreshness,
      providerFreshness,
      candidate: null,
      candidateEvaluation: {
        ok: false,
        leaseRetained: true,
        taskState: lease?.taskState ?? null,
        invalidated: null,
        findings
      },
      currentProtectedBaseResolution,
      effectiveReservationResolution: reservationResolution,
      baseReservation: reservationResolution.baseReservation,
      effectiveReservation: reservationResolution.effectiveReservation,
      amendmentReceipt: reservationResolution.amendmentReceipt,
      ...finiteTaskOverlayRuntimeProjection(reservationResolution),
      effectiveLease: reservationResolution.effectiveLease,
      taskState: lease?.taskState ?? null,
      terminal: terminalTask
    };
  }
  const resolvedProtectedBase = currentProtectedBaseResolution.protectedBase;
  if (terminalTask) {
    const observation = record?.finiteTaskRuntime?.candidateObservation;
    const latest = record?.latestMergedImplementationPr;
    const terminalOutcome = record?.finiteTaskRuntime?.terminalOutcome;
    const amendedTerminalProjection = binding?.phase === "TERMINAL"
      && ["FINITE_TASK_AMENDED_POST_MERGE_TERMINAL_EVIDENCE_V1", "FINITE_TASK_AMENDED_TEST_ADAPTATION_POST_MERGE_TERMINAL_EVIDENCE_V2"].includes(terminalOutcome?.classification)
      && stableJson(binding?.terminalEvidence) === stableJson(terminalOutcome)
      && terminalOutcome?.baseLeaseHash === sha256(lease)
      && finiteTaskLeaseEffectivelyTerminal(record?.finiteTaskLeases, lease)
      && finiteTaskActiveStates.has(lease?.taskState)
      && lease?.domainOwnership === "ACTIVE";
    const legacyTerminalProjection = lease?.taskState === "MERGED_VERIFIED"
      && lease?.domainOwnership === "PRESERVED_DEPENDENT";
    const terminalFindings = [];
    if (binding?.phase !== "TERMINAL"
      || (!legacyTerminalProjection && !amendedTerminalProjection)) terminalFindings.push("FINITE_TASK_TERMINAL_STATE_MISMATCH");
    if (observation?.pr !== lease?.implementationPr
      || observation?.branch !== lease?.implementationBranch
      || observation?.prState !== "merged"
      || observation?.head !== binding?.currentImplementationHead
      || observation?.tree !== binding?.currentImplementationTree) terminalFindings.push("FINITE_TASK_TERMINAL_OBSERVATION_MISMATCH");
    if (latest?.state !== "merged"
      || latest?.number !== lease?.implementationPr
      || latest?.head !== binding?.currentImplementationHead
      || !gitShaPattern.test(latest?.mergeSha ?? "")) terminalFindings.push("FINITE_TASK_TERMINAL_MERGE_IDENTITY_MISMATCH");
    try {
      if (gitCommand(["rev-parse", `${binding.currentImplementationHead}^{tree}`]) !== binding.currentImplementationTree) {
        terminalFindings.push("FINITE_TASK_TERMINAL_SOURCE_TREE_MISMATCH");
      }
    } catch {
      terminalFindings.push("FINITE_TASK_TERMINAL_SOURCE_TREE_MISMATCH");
    }
    try {
      gitCommand(["merge-base", "--is-ancestor", binding.currentImplementationHead, latest.mergeSha]);
    } catch {
      terminalFindings.push("FINITE_TASK_TERMINAL_SOURCE_ANCESTRY_INVALID");
    }
    try {
      gitCommand(["merge-base", "--is-ancestor", latest.mergeSha, resolvedProtectedBase]);
      const firstParentHistory = gitCommand(["rev-list", "--first-parent", resolvedProtectedBase]).split(/\r?\n/gu).filter(Boolean);
      if (!firstParentHistory.includes(latest.mergeSha)) terminalFindings.push("FINITE_TASK_TERMINAL_MERGE_NOT_ON_FIRST_PARENT");
    } catch {
      terminalFindings.push("FINITE_TASK_TERMINAL_MERGE_ANCESTRY_INVALID");
    }
    const terminalCandidate = {
      pr: lease?.implementationPr,
      branch: lease?.implementationBranch,
      prState: "closed",
      head: binding?.currentImplementationHead,
      tree: binding?.currentImplementationTree,
      ...(amendedTerminalProjection && terminalOutcome?.schemaVersion === 2 ? {
        changedPaths: structuredClone(terminalOutcome.scopePartitions.aggregate.actualPaths),
        changedLines: terminalOutcome.scopePartitions.aggregate.canonicalChangedLines
      } : {})
    };
    const reservationResolution = resolveEffectiveReservation(terminalCandidate);
    if (amendedTerminalProjection && (
      !finiteTaskTerminalReservationMatchesOutcome({ terminalOutcome, reservationResolution })
      || terminalOutcome?.finalSourceReceipt?.effectiveReservationHash !== terminalOutcome.effectiveReservation?.reservationHash
      || (terminalOutcome?.schemaVersion === 2 && !finiteTaskOverlayFinalReceiptMatchesLiveObservation(
        terminalOutcome.finalSourceReceipt,
        reservationObservation,
        lease?.implementationPr
      ))
    )) terminalFindings.push("FINITE_TASK_TERMINAL_EFFECTIVE_RESERVATION_MISMATCH");
    const findings = [...new Set([
      ...leaseFreshness.blockers.map(({ id }) => id),
      ...reservationResolution.findings,
      ...(finiteTaskEffectiveReservationAuthorityValid(reservationResolution) ? [] : ["FINITE_TASK_EFFECTIVE_RESERVATION_LIVE_AUTHORITY_REQUIRED"]),
      ...terminalFindings
    ])].sort();
    const terminalEligible = leaseFreshness.eligible && findings.length === 0;
    return {
      leaseAuthorityEligible: leaseFreshness.eligible,
      candidateEligible: terminalEligible,
      candidateHead: binding?.currentImplementationHead ?? null,
      candidateTree: binding?.currentImplementationTree ?? null,
      scopeResult: terminalEligible ? "PASS" : "FAIL",
      findings,
      providerDependentEligible: false,
      sourceOnlyEligible: terminalEligible,
      claimFreshness,
      leaseFreshness,
      providerFreshness,
      currentProtectedBaseResolution,
      effectiveReservationResolution: reservationResolution,
      baseReservation: reservationResolution.baseReservation,
      effectiveReservation: reservationResolution.effectiveReservation,
      amendmentReceipt: reservationResolution.amendmentReceipt,
      ...finiteTaskOverlayRuntimeProjection(reservationResolution),
      effectiveLease: reservationResolution.effectiveLease,
      candidate: terminalEligible ? {
        pr: lease.implementationPr,
        branch: lease.implementationBranch,
        prState: "merged",
        head: binding.currentImplementationHead,
        tree: binding.currentImplementationTree,
        mergeSha: latest.mergeSha,
        observationSource: "PROTECTED_MAIN_TERMINAL_MERGE"
      } : null,
      candidateEvaluation: {
        ok: terminalEligible,
        leaseRetained: true,
        taskState: amendedTerminalProjection ? "MERGED_VERIFIED" : lease?.taskState ?? null,
        invalidated: { ownerFinalReceipt: false, repositoryReview: false, phase1: false, mergeEligibility: true },
        findings
      },
      taskState: amendedTerminalProjection ? "MERGED_VERIFIED" : lease?.taskState ?? null,
      terminalProjectionVerified: amendedTerminalProjection && terminalEligible,
      terminal: true
    };
  }
  const derived = deriveFiniteTaskCandidateObservation({
    record,
    lease,
    suppliedObservation,
    githubEvent: event,
    checkoutHead,
    currentProtectedBase: resolvedProtectedBase,
    effectiveReservationObservation: reservationObservation,
    finiteTaskPostMergeTransition,
    gitCommand,
    environment
  });
  const reservationResolution = resolveEffectiveReservation(derived.candidate);
  const effectiveLease = reservationResolution.effectiveLease ?? lease;
  const candidateEvaluation = derived.candidate
    ? evaluateFiniteTaskCandidate({ lease: effectiveLease, registry: record?.finiteTaskLeases, candidate: derived.candidate, effectiveReservationResolution: reservationResolution })
    : { ok: false, findings: derived.findings, invalidated: null, taskState: lease?.taskState ?? null };
  const findings = [...new Set([
    ...leaseFreshness.blockers.map(({ id }) => id),
    ...reservationResolution.findings,
    ...(finiteTaskEffectiveReservationAuthorityValid(reservationResolution) ? [] : ["FINITE_TASK_EFFECTIVE_RESERVATION_LIVE_AUTHORITY_REQUIRED"]),
    ...derived.findings,
    ...candidateEvaluation.findings
  ])].sort();
  const sourceOnlyEligible = leaseFreshness.eligible
    && derived.ok
    && reservationResolution.ok
    && finiteTaskEffectiveReservationAuthorityValid(reservationResolution)
    && candidateEvaluation.ok;
  return {
    leaseAuthorityEligible: leaseFreshness.eligible,
    candidateEligible: derived.ok && candidateEvaluation.ok && finiteTaskEffectiveReservationAuthorityValid(reservationResolution),
    candidateHead: derived.candidate?.head ?? null,
    candidateTree: derived.candidate?.tree ?? null,
    scopeResult: candidateEvaluation.ok ? "PASS" : "FAIL",
    findings,
    providerDependentEligible: providerFreshness.eligible,
    sourceOnlyEligible,
    claimFreshness,
    leaseFreshness,
    providerFreshness,
    currentProtectedBaseResolution,
    effectiveReservationResolution: reservationResolution,
    baseReservation: reservationResolution.baseReservation,
    effectiveReservation: reservationResolution.effectiveReservation,
    amendmentReceipt: reservationResolution.amendmentReceipt,
    ...finiteTaskOverlayRuntimeProjection(reservationResolution),
    effectiveLease: reservationResolution.effectiveLease,
    candidate: derived.candidate,
    candidateEvaluation,
    taskState: lease?.taskState ?? null,
    terminal: false
  };
}

const protectedMainClasses = Object.freeze({
  authority: "AUTHORITY_CONTROL_PLANE",
  model: "ACTIVE_TASK_MODEL",
  input: "ACTIVE_TASK_AUTHORITATIVE_INPUT",
  unrelated: "UNRELATED_PROTECTED_ADVANCEMENT",
  terminal: "TERMINAL_TRUTH_CHANGE"
});

export const HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1 = Object.freeze({
  schemaVersion: 1,
  transitionId: "HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1",
  repository: "Chillywood2025/chillywood-mobile",
  pullRequest: 226,
  branch: "codex/whole-app-engineering-doctrine-v1",
  sourceHead: "eae8ed8b6ebced31e0ddc4013fb420a8c4be1bcc",
  sourceTree: "122c391496e0db2be61ac40078d460f1ecba1342",
  mergeSha: "c1f9ec1f71cc8bc4448afd2327c4341cac309573",
  firstParent: "8bf6459c3ae1cec62e26a1694f03063e4291b9f8",
  ownerCommentIds: Object.freeze([5274614505, 5274913577, 5275618260]),
  repositoryReviewCommentId: 5275455730,
  phase1RunId: 31666180747,
  phase1RequiredChecks: 13,
  successorPaths: Object.freeze(["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"]),
  expectedTerminalNextTask: "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE",
  authority: Object.freeze({ product: false, nativeProduct: false, database: false, providerMutation: false, build: false, submission: false, ota: false, publicRelease: false }),
  singleUse: true
});

export const PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1 = Object.freeze({
  schemaVersion: 1,
  policyId: "PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1",
  historicalTransitionId: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.transitionId,
  bootstrapMaximumPendingDepth: 2,
  normalMaximumPendingDepth: 1,
  expectedTerminalNextTask: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.expectedTerminalNextTask
});

export const PENDING_TERMINAL_TRUTH_TRANSITION_V1 = Object.freeze({
  schemaVersion: 1,
  policyId: "PENDING_TERMINAL_TRUTH_TRANSITION_V1",
  maintenanceContractPath: "config/assurance/pr-scope-policy-v1.json",
  maintenanceContractKey: "ownerArchitectureMaintenance.pendingTerminalTruthTransition",
  authorityControlPathsRequired: true,
  terminalSuccessorPaths: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.successorPaths,
  expectedTerminalNextTask: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1.expectedTerminalNextTask,
  sourceOnlyEligible: true,
  providerDependentEligible: false,
  buildEligible: false,
  submissionEligible: false,
  otaEligible: false,
  publicReleaseEligible: false
});

function protectedMainEvidenceInvalidation(paths) {
  const changed = new Set(paths);
  const packageChanged = changed.has("package.json") || changed.has("package-lock.json");
  const nativeInputChanged = packageChanged
    || [...changed].some((file) => file === "app.json"
      || file === "app.config.ts"
      || file === "eas.json"
      || file.startsWith("plugins/")
      || file.includes("android-generated-native-lifecycle")
      || file.startsWith("tools/android-native-call-harness/"));
  const callInputChanged = [...changed].some((file) => file.includes("chat-call")
    || file.includes("communication-room-session")
    || file.includes("legacy-mic-permission-recovery"));
  const affectedEvidenceClasses = [];
  const requiredReruns = [];
  if (packageChanged) {
    affectedEvidenceClasses.push("DEPENDENCY_IDENTITY");
    requiredReruns.push("CLEAN_DEPENDENCY_IDENTITY");
  }
  if (nativeInputChanged) {
    affectedEvidenceClasses.push("GENERATED_NATIVE", "GRADLE_COMPILE", "JVM_NATIVE_MODEL", "LOCAL_EMULATOR_LIFECYCLE");
    requiredReruns.push("GENERATED_NATIVE", "GRADLE_SIX_TASKS", "JVM_7_OF_7", "LIFECYCLE_AND_MIC_INSTRUMENTATION");
  }
  if (callInputChanged) {
    affectedEvidenceClasses.push("CALL_DOMAIN");
    requiredReruns.push("AFFECTED_CALL_DOMAIN_MATRIX");
  }
  return {
    affectedEvidenceClasses: [...new Set(affectedEvidenceClasses)].sort(),
    changedPaths: [...changed].sort(),
    reason: changed.size ? "PROTECTED_MAIN_ADVANCED_ACTIVE_TASK_INPUTS" : "NO_ACTIVE_TASK_INPUT_ADVANCEMENT",
    requiredReruns: [...new Set(requiredReruns)].sort(),
    reusableEvidence: [
      ...(nativeInputChanged ? [] : ["GENERATED_NATIVE", "GRADLE_COMPILE", "JVM_NATIVE_MODEL", "LOCAL_EMULATOR_LIFECYCLE"]),
      ...(callInputChanged ? [] : ["CALL_DOMAIN"]),
      "PROVIDER_EVIDENCE_REMAINS_CLAIM_SCOPED"
    ].sort()
  };
}

function classifyProtectedMainPaths(paths, policy, activeLeasePaths) {
  const authorityPaths = new Set(policy.authorityControlPaths ?? []);
  const modelPaths = new Set(policy.activeTaskModelPaths ?? []);
  const inputPaths = new Set([...(policy.activeTaskAuthoritativeInputs ?? []), ...activeLeasePaths]);
  const terminalPaths = new Set(policy.terminalTruthPaths ?? []);
  const changesAuthorityLogic = paths.some((file) => authorityPaths.has(file));
  return paths.map((file) => {
    let classification = protectedMainClasses.unrelated;
    if (authorityPaths.has(file) || (changesAuthorityLogic && file === "config/assurance/current-truth-v1.json")) {
      classification = protectedMainClasses.authority;
    } else if (terminalPaths.has(file)) {
      classification = protectedMainClasses.terminal;
    } else if (modelPaths.has(file)) {
      classification = protectedMainClasses.model;
    } else if (inputPaths.has(file)) {
      classification = protectedMainClasses.input;
    }
    return { path: file, classification };
  });
}

function readProtectedAdvancementObservations(checkpoint, observed, gitCommand) {
  const commits = gitCommand(["rev-list", "--first-parent", "--reverse", `${checkpoint}..${observed}`])
    .split(/\r?\n/gu).filter(Boolean);
  return commits.map((commit) => ({
    commit,
    parents: gitCommand(["show", "-s", "--format=%P", commit]).split(/\s+/u).filter(Boolean),
    tree: gitCommand(["rev-parse", `${commit}^{tree}`]),
    subject: gitCommand(["show", "-s", "--format=%s", commit]),
    changedPaths: gitCommand(["diff", "--name-only", `${commit}^1`, commit]).split(/\r?\n/gu).filter(Boolean)
  }));
}

function embeddedRollingAuthorityBound(commit, checkpoint, gitCommand) {
  try {
    const embedded = JSON.parse(gitCommand(["show", `${commit}:config/assurance/current-truth-v1.json`]));
    const authority = embedded.protectedMainAuthority;
    gitCommand(["merge-base", "--is-ancestor", authority.checkpointSha, commit]);
    return authority.schemaVersion === 1
      && authority.policyId === "ROLLING_PROTECTED_MAIN_AUTHORITY_V1"
      && authority.allowProtectedAdvancement === true
      && gitShaPattern.test(authority.checkpointSha ?? "")
      && gitShaPattern.test(authority.checkpointTree ?? "")
      && (authority.checkpointSha === checkpoint || authority.checkpointSha === commit || authority.checkpointSha === embedded.mainSha);
  } catch {
    return false;
  }
}

function parseProtectedPullRequestMergeSubject(subject) {
  const patterns = [
    ["GITHUB_CLASSIC_MERGE_PULL_REQUEST", /^Merge pull request #([1-9][0-9]*) from [^/\s]+\/.+$/u],
    ["GITHUB_TITLE_WITH_PR_SUFFIX", /^\S(?:.*\S)? \(#([1-9][0-9]*)\)$/u]
  ];
  for (const [format, pattern] of patterns) {
    const match = pattern.exec(subject ?? "");
    if (match) return { ok: true, format, prNumber: Number(match[1]) };
  }
  return { ok: false, format: null, prNumber: null };
}

const closedPendingAuthority = (authority) => stableJson(authority) === stableJson({
  product: false,
  nativeProduct: false,
  database: false,
  providerMutation: false,
  build: false,
  submission: false,
  ota: false,
  publicRelease: false
});

function historicalPendingDoctrineTransition(observation, parsedMergeSubject, migration) {
  return migration?.schemaVersion === 1
    && migration?.transitionId === "HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1"
    && migration?.repository === "Chillywood2025/chillywood-mobile"
    && parsedMergeSubject?.prNumber === migration.pullRequest
    && migration.branch === "codex/whole-app-engineering-doctrine-v1"
    && observation?.commit === migration.mergeSha
    && observation?.parents?.length === 2
    && observation.parents[0] === migration.firstParent
    && observation.parents[1] === migration.sourceHead
    && observation.tree === migration.sourceTree
    && stableJson(migration.ownerCommentIds) === stableJson([5274614505, 5274913577, 5275618260])
    && migration.repositoryReviewCommentId === 5275455730
    && migration.phase1RunId === 31666180747
    && migration.phase1RequiredChecks === 13
    && stableJson(migration.successorPaths) === stableJson(["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"])
    && migration.expectedTerminalNextTask === "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE"
    && migration.singleUse === true
    && closedPendingAuthority(migration.authority);
}

function readPendingMaintenanceContract(observation, gitCommand) {
  try {
    const policy = JSON.parse(gitCommand(["show", `${observation.parents[1]}:config/assurance/pr-scope-policy-v1.json`]));
    return policy?.ownerArchitectureMaintenance?.pendingTerminalTruthTransition ?? null;
  } catch {
    return null;
  }
}

function genericPendingMaintenanceTransition(observation, authorityChanged, gitCommand) {
  const value = readPendingMaintenanceContract(observation, gitCommand);
  const paths = [...new Set(observation?.changedPaths ?? [])].sort();
  const allowed = [...new Set(value?.allowedChangedPaths ?? [])].sort();
  let sourceTree = observation?.sourceTree ?? null;
  if (!sourceTree) {
    try { sourceTree = gitCommand(["rev-parse", `${observation.parents[1]}^{tree}`]); } catch { sourceTree = null; }
  }
  const valid = authorityChanged
    && observation?.parents?.length === 2
    && gitShaPattern.test(observation.parents[1] ?? "")
    && gitShaPattern.test(sourceTree ?? "")
    && value?.schemaVersion === 1
    && value?.contractId === "PENDING_TERMINAL_TRUTH_TRANSITION_V1"
    && value?.authoritySource === "IMMUTABLE_OWNER_ARCHITECTURE_MAINTENANCE"
    && value?.objective === "shared rolling-main evaluator must support the already-required bounded terminal-truth interval"
    && stableJson(paths) === stableJson(allowed)
    && paths.length === 8
    && value?.maximumFiles === 8
    && value?.maximumNetLines === 1800
    && value?.terminalTruthRequired === true
    && value?.expectedTerminalNextTask === "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE"
    && closedPendingAuthority(value?.authority);
  return valid ? {
    transitionId: "PENDING_TERMINAL_TRUTH_TRANSITION_V1",
    mergeSha: observation.commit,
    sourceHead: observation.parents[1],
    sourceTree,
    expectedTerminalNextTask: value.expectedTerminalNextTask,
    authoritySource: value.authoritySource,
    historical: false
  } : null;
}

function embeddedTerminalTransitionConsumption(observation, pending, gitCommand) {
  try {
    const embedded = JSON.parse(gitCommand(["show", `${observation.commit}:config/assurance/current-truth-v1.json`]));
    const architecture = embedded?.taskContextArchitecture;
    const consumed = architecture?.pendingTransitions;
    return architecture?.pendingTransitionPolicyId === "PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1"
      && architecture?.pendingTransitionCountAfterSynchronization === 0
      && architecture?.terminalTransitionConsumed === true
      && embedded?.engineeringDoctrine?.nextPermittedAction === "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE"
      && stableJson(architecture?.authority) === stableJson({ providerMutation: false, build: false, submission: false, ota: false, publicRelease: false })
      && Array.isArray(consumed)
      && stableJson(consumed.map(({ mergeSha, status }) => ({ mergeSha, status }))) === stableJson(pending.map(({ mergeSha }) => ({ mergeSha, status: "CONSUMED_BY_THIS_TERMINAL_TRUTH" })));
  } catch {
    return false;
  }
}

function embeddedTerminalVerifierRepairConsumption(observation, pending, gitCommand) {
  try {
    const embedded = JSON.parse(gitCommand(["show", `${observation.commit}:config/assurance/current-truth-v1.json`]));
    const architecture = embedded?.taskContextArchitecture;
    const repair = architecture?.terminalVerifierRepair;
    const consumed = architecture?.pendingTransitions?.map(({ pr, mergeSha, status }) => ({ pr, mergeSha, status }));
    const expectedConsumed = pending.length
      ? pending.map(({ mergeSha }, index) => ({ pr: index === 0 ? 226 : 227, mergeSha, status: "CONSUMED_BY_THIS_TERMINAL_TRUTH" }))
      : [
          { pr: 226, mergeSha: "c1f9ec1f71cc8bc4448afd2327c4341cac309573", status: "CONSUMED_BY_THIS_TERMINAL_TRUTH" },
          { pr: 227, mergeSha: "5506f1c2c227c0d3383131db7f818fef1aae2541", status: "CONSUMED_BY_THIS_TERMINAL_TRUTH" },
        ];
    return parseProtectedPullRequestMergeSubject(observation.subject).prNumber === 228
      && stableJson([...(observation.changedPaths ?? [])].sort()) === stableJson(TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS)
      && repair?.classification === "CANONICAL_PREDECESSOR_RECEIPT_SELECTION_REPAIR_V1"
      && repair?.historicalTerminalReceipt === 5280368893
      && repair?.rejectedPredecessorReceipt === 5277679438
      && repair?.canonicalPredecessorReceipt === 5280109323
      && repair?.rawPredecessorDiffHash === "ea1b96e5c6515b05b7499ff7a528c0440a409e064d65fe0a7e65d44ec64b619b"
      && repair?.canonicalPredecessorDiffHash === "ce2b3dd4004f7fb8a8a2af4e1a6d83a6c2e17453f714b1eb9ff26a62588490ea"
      && repair?.singleUse === true
      && closedPendingAuthority(repair?.authority)
      && architecture?.pendingTransitionPolicyId === "PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1"
      && architecture?.pendingTransitionCountAfterSynchronization === 0
      && architecture?.terminalTransitionConsumed === true
      && stableJson(consumed) === stableJson(expectedConsumed)
      && embedded?.engineeringDoctrine?.status === "ACTIVE"
      && embedded?.engineeringDoctrine?.nextPermittedAction === "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE"
      && stableJson(architecture?.authority) === stableJson({ providerMutation: false, build: false, submission: false, ota: false, publicRelease: false });
  } catch {
    return false;
  }
}

export function evaluateProtectedMainAdvancement({
  record,
  contract,
  observedProtectedMainSha,
  candidateHead,
  finiteTaskRuntime,
  finiteTaskFinalSourceEligibility,
  finiteTaskPostMergeTransition,
  gitCommand = git,
  advancementObservations,
  pendingTransitionPolicy = {
    state: PENDING_TERMINAL_TRUTH_TRANSITION_V1,
    historical: HISTORICAL_PENDING_DOCTRINE_TRANSITION_V1,
    chain: PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1
  },
  checkpointTreeObservation,
  checkpointIsAncestor,
  candidateContainsObservedMain
} = {}) {
  const policy = contract?.rollingProtectedMain ?? {};
  const authority = record?.protectedMainAuthority ?? {};
  const checkpointSha = authority.checkpointSha ?? record?.mainSha ?? null;
  const observedSha = observedProtectedMainSha ?? (() => {
    try { return gitCommand(["rev-parse", "origin/main"]); } catch { return null; }
  })();
  const findings = [];
  const pendingPolicyValid = stableJson(pendingTransitionPolicy?.state) === stableJson(PENDING_TERMINAL_TRUTH_TRANSITION_V1)
    && stableJson(pendingTransitionPolicy?.chain) === stableJson(PENDING_TERMINAL_TRANSITION_CHAIN_BOOTSTRAP_V1);
  if (!pendingPolicyValid) findings.push("CURRENT_TRUTH_PENDING_TRANSITION_AUTHORITY_INVALID");
  const identityValid = policy.policyId === "ROLLING_PROTECTED_MAIN_AUTHORITY_V1"
    && authority.schemaVersion === 1
    && authority.policyId === policy.policyId
    && authority.allowProtectedAdvancement === true
    && stableJson(authority.acceptedMergeSubjectFormats) === stableJson(policy.ordinaryAdvancement?.acceptedMergeSubjectFormats)
    && authority.checkpointSha === record?.mainSha
    && gitShaPattern.test(checkpointSha ?? "")
    && gitShaPattern.test(authority.checkpointTree ?? "")
    && gitShaPattern.test(observedSha ?? "");
  if (!identityValid) findings.push("CURRENT_TRUTH_PROTECTED_MAIN_AUTHORITY_MALFORMED");
  let observedTree = null;
  let actualCheckpointTree = checkpointTreeObservation ?? null;
  if (identityValid) {
    try {
      observedTree = gitCommand(["rev-parse", `${observedSha}^{tree}`]);
      actualCheckpointTree ??= gitCommand(["rev-parse", `${checkpointSha}^{tree}`]);
    } catch {
      findings.push("CURRENT_TRUTH_PROTECTED_MAIN_IDENTITY_UNRESOLVED");
    }
  }
  if (actualCheckpointTree && actualCheckpointTree !== authority.checkpointTree) {
    findings.push("CURRENT_TRUTH_PROTECTED_MAIN_CHECKPOINT_TREE_MISMATCH");
  }
  let ancestor = checkpointIsAncestor;
  if (identityValid && checkpointSha === observedSha) ancestor = true;
  if (identityValid && checkpointSha !== observedSha && ancestor === undefined) {
    try {
      gitCommand(["merge-base", "--is-ancestor", checkpointSha, observedSha]);
      ancestor = true;
    } catch {
      ancestor = false;
    }
  }
  if (identityValid && ancestor !== true) findings.push("CURRENT_TRUTH_PROTECTED_MAIN_CHECKPOINT_NOT_ANCESTOR");
  const mainRelation = checkpointSha === observedSha
    ? "EXACT_CHECKPOINT"
    : ancestor === true
      ? "PROTECTED_MAIN_ADVANCED"
      : "BLOCKED_HISTORY_REWRITE";
  let observations = [];
  if (identityValid && ancestor === true && checkpointSha !== observedSha) {
    try {
      observations = advancementObservations ?? readProtectedAdvancementObservations(checkpointSha, observedSha, gitCommand);
    } catch {
      findings.push("CURRENT_TRUTH_PROTECTED_MAIN_CHAIN_INVALID");
    }
  }
  const activeLease = finiteTaskLeaseFor(record?.finiteTaskLeases, {
    implementationPr: record?.activeTaskBinding?.implementationPr,
    implementationBranch: record?.activeTaskBinding?.implementationBranch,
    featureId: record?.activeTaskBinding?.featureId
  });
  const trustedAdaptedResolution = finiteTaskEffectiveReservationAuthorityValid(finiteTaskRuntime?.effectiveReservationResolution)
    && finiteTaskRuntime.effectiveReservationResolution.status === "AMENDED_WITH_TEST_ADAPTATION"
    ? finiteTaskRuntime.effectiveReservationResolution
    : null;
  const activeLeasePaths = new Set(
    trustedAdaptedResolution?.aggregateReservation?.allowedPaths
    ?? finiteTaskRuntime?.effectiveReservation?.allowedPaths
    ?? finiteTaskRuntime?.effectiveReservationResolution?.effectiveReservation?.allowedPaths
    ?? activeLease?.allowedPaths
    ?? []
  );
  let prior = checkpointSha;
  const advancements = [];
  const pendingTransitions = [];
  let pendingConsumptionCount = 0;
  for (const observation of observations) {
    const pathClassifications = classifyProtectedMainPaths(observation.changedPaths ?? [], policy, activeLeasePaths);
    const classifications = [...new Set(pathClassifications.map(({ classification }) => classification))].sort();
    const parsedMergeSubject = parseProtectedPullRequestMergeSubject(observation.subject);
    const subjectFormatAllowed = policy.ordinaryAdvancement?.acceptedMergeSubjectFormats?.includes(parsedMergeSubject.format);
    const normalPrMerge = observation.parents?.length === policy.ordinaryAdvancement?.parentCount
      && observation.parents[0] === prior
      && parsedMergeSubject.ok
      && subjectFormatAllowed
      && gitShaPattern.test(observation.commit ?? "")
      && gitShaPattern.test(observation.tree ?? "");
    if (!normalPrMerge) findings.push("CURRENT_TRUTH_PROTECTED_MAIN_CHAIN_INVALID");
    const authorityChanged = classifications.includes(protectedMainClasses.authority);
    const terminalChanged = classifications.includes(protectedMainClasses.terminal) && !authorityChanged;
    const terminalRepairScope = stableJson([...(observation.changedPaths ?? [])].sort()) === stableJson(TERMINAL_TRUTH_SUCCESSOR_VERIFIER_REPAIR_PATHS);
    const terminalRepairChanged = normalPrMerge && authorityChanged && embeddedTerminalVerifierRepairConsumption(observation, pendingTransitions, gitCommand);
    const companionPresent = (policy.authorityRequiredCompanionPaths ?? []).every((file) => (observation.changedPaths ?? []).includes(file));
    const authorityBound = observation.authorityUpdateBound === true
      || (observation.authorityUpdateBound !== false && authorityChanged && embeddedRollingAuthorityBound(observation.commit, checkpointSha, gitCommand));
    const historicalPending = normalPrMerge && authorityChanged && historicalPendingDoctrineTransition(observation, parsedMergeSubject, pendingTransitionPolicy?.historical)
      ? { transitionId: pendingTransitionPolicy.historical.transitionId, mergeSha: observation.commit, sourceHead: observation.parents[1], sourceTree: observation.tree, expectedTerminalNextTask: pendingTransitionPolicy.historical.expectedTerminalNextTask, authoritySource: "HISTORICAL_EXACT_OWNER_DOCTRINE_AUTHORITY", historical: true }
      : null;
    const genericPending = normalPrMerge && !historicalPending
      ? genericPendingMaintenanceTransition(observation, authorityChanged, gitCommand)
      : null;
    const pendingCandidate = historicalPending ?? genericPending;
    if (pendingCandidate) {
      const bootstrapSecond = pendingTransitions.length === 1
        && pendingTransitions[0].transitionId === pendingTransitionPolicy?.chain?.historicalTransitionId
        && genericPending !== null;
      const maximumDepth = bootstrapSecond ? pendingTransitionPolicy?.chain?.bootstrapMaximumPendingDepth : pendingTransitionPolicy?.chain?.normalMaximumPendingDepth;
      if (pendingTransitions.length >= maximumDepth) {
        findings.push("CURRENT_TRUTH_PENDING_TRANSITION_CHAIN_OVERFLOW");
      } else if (pendingTransitions.some(({ expectedTerminalNextTask }) => expectedTerminalNextTask !== pendingCandidate.expectedTerminalNextTask)) {
        findings.push("CURRENT_TRUTH_PENDING_TRANSITION_ORDER_INVALID");
      } else {
        pendingTransitions.push(pendingCandidate);
      }
    }
    if (authorityChanged && (!companionPresent || !authorityBound) && !pendingCandidate) findings.push("CURRENT_TRUTH_AUTHORITY_CONTROL_DRIFT");
    if (terminalChanged && !(policy.terminalTruthPaths ?? []).every((file) => (observation.changedPaths ?? []).includes(file))) {
      findings.push("CURRENT_TRUTH_TERMINAL_SYNCHRONIZATION_INCOMPLETE");
    }
    const exactTerminalSuccessorPaths = stableJson([...(observation.changedPaths ?? [])].sort()) === stableJson(pendingTransitionPolicy?.state?.terminalSuccessorPaths);
    const exactTerminalRepairPaths = terminalRepairScope;
    const terminalSynchronization = terminalChanged || terminalRepairChanged;
    if (terminalSynchronization && pendingTransitions.length) {
      if ((exactTerminalSuccessorPaths && embeddedTerminalTransitionConsumption(observation, pendingTransitions, gitCommand))
        || (exactTerminalRepairPaths && terminalRepairChanged)) {
        pendingTransitions.splice(0);
        pendingConsumptionCount += 1;
      }
      else findings.push("CURRENT_TRUTH_PENDING_TRANSITION_AUTHORITY_INVALID");
    } else if ((terminalSynchronization || terminalRepairScope) && pendingConsumptionCount > 0) {
      findings.push("CURRENT_TRUTH_PENDING_TRANSITION_ORDER_INVALID");
    } else if (terminalRepairChanged && pendingTransitions.length === 0) {
      pendingConsumptionCount += 1;
    } else if (pendingTransitions.length && !pendingCandidate) {
      findings.push("CURRENT_TRUTH_PENDING_TERMINAL_SUCCESSOR_REQUIRED");
    }
    advancements.push({
      mergeSha: observation.commit,
      tree: observation.tree,
      firstParent: observation.parents?.[0] ?? null,
      secondParent: observation.parents?.[1] ?? null,
      subject: observation.subject,
      pullRequestNumber: parsedMergeSubject.prNumber,
      mergeSubjectFormat: parsedMergeSubject.format,
      changedPaths: [...(observation.changedPaths ?? [])].sort(),
      changedPathHash: sha256([...(observation.changedPaths ?? [])].sort()),
      pathClassifications,
      classifications,
      authorityBound: authorityChanged ? authorityBound : null,
      pendingTerminalTruth: Boolean(pendingCandidate),
      terminalVerifierRepair: terminalRepairChanged,
      pendingTransitionId: pendingCandidate?.transitionId ?? null
    });
    prior = observation.commit;
  }
  if (observations.length && prior !== observedSha) findings.push("CURRENT_TRUTH_PROTECTED_MAIN_CHAIN_INVALID");
  const activeTaskInputsInvalidated = [...new Set(advancements.flatMap(({ pathClassifications }) => pathClassifications
    .filter(({ classification }) => classification === protectedMainClasses.input)
    .map(({ path: file }) => file)))].sort();
  const activeTaskModelInvalidated = advancements.some(({ classifications }) => classifications.includes(protectedMainClasses.model));
  let candidateCurrent = candidateContainsObservedMain;
  if (candidateHead && candidateCurrent === undefined) {
    try {
      gitCommand(["merge-base", "--is-ancestor", observedSha, candidateHead]);
      candidateCurrent = true;
    } catch {
      candidateCurrent = false;
    }
  }
  const verifiedAmendedTerminal = finiteTaskPostMergeTransitionAuthorityValid(finiteTaskPostMergeTransition);
  const terminalTask = finiteTaskRuntime?.terminal === true
    && (finiteTaskRuntime?.taskState === "MERGED_VERIFIED" || finiteTaskRuntime?.terminalProjectionVerified === true);
  const candidateBaseStatus = verifiedAmendedTerminal
    ? "FINITE_TASK_MERGE_VERIFIED_TERMINAL_TRUTH_REQUIRED"
    : terminalTask
    ? "TERMINAL_MERGED_VERIFIED"
    : candidateCurrent === true ? "CURRENT_WITH_PROTECTED_MAIN" : "BASE_SYNC_REQUIRED";
  const aggregateChangedPaths = [...new Set(advancements.flatMap(({ changedPaths }) => changedPaths))].sort();
  let aggregateDiffHash = sha256("");
  if (identityValid && ancestor === true && checkpointSha !== observedSha) {
    try { aggregateDiffHash = sha256(gitCommand(["diff", "--binary", checkpointSha, observedSha], { maxBuffer: 128 * 1024 * 1024 })); } catch { findings.push("CURRENT_TRUTH_PROTECTED_MAIN_CHAIN_INVALID"); }
  }
  const authorityControlEligible = !findings.includes("CURRENT_TRUTH_AUTHORITY_CONTROL_DRIFT")
    && !findings.includes("CURRENT_TRUTH_PROTECTED_MAIN_CHAIN_INVALID")
    && !findings.includes("CURRENT_TRUTH_PENDING_TRANSITION_CHAIN_OVERFLOW")
    && !findings.includes("CURRENT_TRUTH_PENDING_TRANSITION_AUTHORITY_INVALID")
    && !findings.includes("CURRENT_TRUTH_PENDING_TRANSITION_ORDER_INVALID")
    && !findings.includes("CURRENT_TRUTH_PENDING_TERMINAL_SUCCESSOR_REQUIRED")
    && !findings.includes("CURRENT_TRUTH_TERMINAL_SYNCHRONIZATION_INCOMPLETE");
  const authorityCheckpointEligible = identityValid && ancestor === true
    && actualCheckpointTree === authority.checkpointTree
    && authorityControlEligible;
  const sourceOnlyEligible = authorityCheckpointEligible
    && (finiteTaskRuntime?.sourceOnlyEligible ?? true);
  const providerDependentEligible = sourceOnlyEligible
    && pendingTransitions.length === 0
    && pendingConsumptionCount === 0
    && (finiteTaskRuntime?.providerDependentEligible ?? false);
  const legacyFinalEvidence = record?.finiteTaskRuntime?.finalEvidence ?? {};
  const legacyFinalEvidenceCurrent = ["ownerReceipt", "repositoryReview", "phase1", "mergeEligible"].every((key) => legacyFinalEvidence[key] === true);
  const liveFinalEvidenceSupplied = finiteTaskFinalSourceEligibility !== undefined;
  const liveFinalEvidenceRequired = Number(activeLease?.amendmentMaximum?.maximumAmendments ?? 0) > 0;
  const finalEvidenceCurrent = liveFinalEvidenceSupplied
    ? (!liveFinalEvidenceRequired || finiteTaskImplementationLifecycleAuthorityValid(finiteTaskFinalSourceEligibility))
      && finiteTaskFinalSourceEligibility?.mergeEligible === true
      && finiteTaskFinalSourceEligibility?.candidateHead === candidateHead
      && finiteTaskFinalSourceEligibility?.candidateTree === finiteTaskRuntime?.candidateTree
    : !liveFinalEvidenceRequired && legacyFinalEvidenceCurrent;
  if (liveFinalEvidenceRequired && liveFinalEvidenceSupplied
    && finiteTaskFinalSourceEligibility?.mergeEligible === true
    && !finiteTaskImplementationLifecycleAuthorityValid(finiteTaskFinalSourceEligibility)) findings.push("FINITE_TASK_IMPLEMENTATION_LIFECYCLE_AUTHORITY_INVALID");
  if (finiteTaskPostMergeTransition?.applicable === true && !verifiedAmendedTerminal) {
    findings.push(...(finiteTaskPostMergeTransition.findings ?? ["FINITE_TASK_POST_MERGE_TRANSITION_INVALID"]));
    findings.push("FINITE_TASK_POST_MERGE_TRANSITION_AUTHORITY_INVALID");
  } else if (finiteTaskPostMergeTransition !== undefined
    && finiteTaskPostMergeTransition?.applicable !== true
    && finiteTaskPostMergeTransition?.applicable !== false) {
    findings.push(...(finiteTaskPostMergeTransition?.findings ?? ["FINITE_TASK_POST_MERGE_DISCOVERY_INCOMPLETE"]));
  }
  const mergeEligible = !terminalTask
    && finiteTaskPostMergeTransition?.applicable !== true
    && sourceOnlyEligible
    && candidateCurrent === true
    && finalEvidenceCurrent;
  const evidenceInvalidation = protectedMainEvidenceInvalidation(activeTaskInputsInvalidated);
  return {
    authorityCheckpointEligible,
    checkpointSha,
    checkpointTree: authority.checkpointTree ?? null,
    observedProtectedMainSha: observedSha,
    observedProtectedMainTree: observedTree,
    mainRelation,
    protectedAdvancementCount: advancements.length,
    protectedAdvancementChainHash: sha256(advancements.map(({ mergeSha, firstParent, secondParent, tree, changedPathHash }) => ({ mergeSha, firstParent, secondParent, tree, changedPathHash }))),
    aggregateChangedPathHash: sha256(aggregateChangedPaths),
    aggregateDiffHash,
    advancementClassifications: advancements,
    authorityControlEligible,
    activeTaskModelInvalidated,
    activeTaskInputsInvalidated,
    evidenceInvalidation,
    candidateBaseStatus,
    nextRequiredAction: verifiedAmendedTerminal
      ? "CREATE_EXACT_FINITE_TASK_TERMINAL_TRUTH"
      : pendingTransitions.length
      ? "CREATE_EXACT_TERMINAL_TRUTH_SUCCESSOR"
      : terminalTask
      ? "CONTINUE_TERMINAL_HANDOFF"
      : candidateBaseStatus === "BASE_SYNC_REQUIRED" ? "MERGE_CURRENT_PROTECTED_MAIN_NORMALLY" : "CONTINUE_ACTIVE_TASK",
    sourceOnlyEligible,
    providerDependentEligible,
    buildEligible: false,
    submissionEligible: false,
    otaEligible: false,
    publicReleaseEligible: false,
    pendingTerminalTruth: verifiedAmendedTerminal || pendingTransitions.length > 0,
    pendingTransitionCount: pendingTransitions.length + (verifiedAmendedTerminal ? 1 : 0),
    pendingTransitionConsumptionCount: pendingConsumptionCount,
    pendingTransitions,
    terminalSuccessorRequired: verifiedAmendedTerminal || pendingTransitions.length > 0,
    currentTruthStatus: verifiedAmendedTerminal
      ? "PENDING_FINITE_TASK_TERMINAL_TRUTH"
      : pendingTransitions.length ? "PENDING_TERMINAL_TRUTH_SUCCESSOR" : "CURRENT",
    finiteTaskFinalSourceEligibility: liveFinalEvidenceSupplied ? finiteTaskFinalSourceEligibility : null,
    liveFinalEvidenceRequired,
    finiteTaskPostMergeTransition: finiteTaskPostMergeTransition ?? null,
    mergeEligible,
    findings: [...new Set(findings)].sort()
  };
}

const controlMaintenanceMarker = "<!-- chillywood-assurance-control-maintenance-v1 -->";
const terminalControlBranch = "codex/finite-task-lease-runtime-freshness-correction";
const terminalControlStartingMain = "68d2f2b745425296fae2753e8a0cba9cc1137067";
const closedMaintenanceAuthority = { product: false, native: false, database: false, provider: false, build: false, release: false, money: false, authRls: false, credentials: false };
const maintenanceSubjectFields = ["schemaVersion", "repository", "pr", "branch", "startingMain", "allowedChangedPaths", "maximumFiles", "maximumNetLines", "objective", "prohibitedAuthorities", "nestedControlDependency", "secondMaintenancePrAllowed"];

export function controlMaintenanceAuthorizationSubject(value) {
  return Object.fromEntries(maintenanceSubjectFields.map((field) => [field, structuredClone(value?.[field])]));
}

export function controlMaintenanceAuthorizationCommentBody(value) {
  const subject = controlMaintenanceAuthorizationSubject(value);
  return `${controlMaintenanceMarker}\n${stableJson({ subject, subjectHash: sha256(subject) })}`;
}

function unsafeMaintenancePath(file) {
  const exactControlPaths = new Set([
    "CURRENT_STATE.md",
    "NEXT_TASK.md",
    "config/assurance/current-truth-contract-v1.json",
    "config/assurance/current-truth-v1.json",
    "config/assurance/schemas-v1.json",
    "scripts/assurance/active-task.mjs",
    "scripts/assurance/current-truth.mjs",
    "scripts/assurance/lib.mjs",
    "scripts/guard-autonomous-systems-contract.mjs",
    "scripts/proof-autonomous-systems-contract.mjs",
    "tests/assurance/active-task-binding-a1.test.mjs"
  ]);
  return !exactControlPaths.has(file);
}

export function verifyControlMaintenanceAuthorization({ subject: input, observation, changedPaths, netLines, requestedDependency = null } = {}) {
  const subject = controlMaintenanceAuthorizationSubject(input);
  const body = controlMaintenanceAuthorizationCommentBody(subject);
  const findings = [];
  const paths = Array.isArray(subject.allowedChangedPaths) ? [...new Set(subject.allowedChangedPaths)].sort() : [];
  const actualPaths = Array.isArray(changedPaths) ? [...new Set(changedPaths)].sort() : [];
  if (subject.schemaVersion !== 1
    || subject.repository !== "Chillywood2025/chillywood-mobile"
    || !Number.isInteger(subject.pr) || subject.pr < 1
    || subject.branch !== terminalControlBranch
    || subject.startingMain !== terminalControlStartingMain
    || !paths.length
    || paths.some(unsafeMaintenancePath)
    || !Number.isInteger(subject.maximumFiles) || subject.maximumFiles < paths.length
    || !Number.isInteger(subject.maximumNetLines) || subject.maximumNetLines < 1
    || typeof subject.objective !== "string" || !subject.objective
    || stableJson(subject.prohibitedAuthorities) !== stableJson(closedMaintenanceAuthority)
    || subject.nestedControlDependency !== false
    || subject.secondMaintenancePrAllowed !== false) findings.push("ASSURANCE_CONTROL_MAINTENANCE_SUBJECT_MALFORMED");
  if (stableJson(paths) !== stableJson(actualPaths)
    || actualPaths.length > subject.maximumFiles
    || !Number.isInteger(netLines)
    || Math.abs(netLines) > subject.maximumNetLines) findings.push("ASSURANCE_CONTROL_MAINTENANCE_SCOPE_VIOLATION");
  if (requestedDependency !== null) findings.push(ASSURANCE_RECURSIVE_BOOTSTRAP_CYCLE);
  if (observation?.commentId !== observation?.id
    || !Number.isInteger(observation?.commentId) || observation.commentId < 1
    || observation.author !== "Chillywood2025"
    || observation.authorAssociation !== "OWNER"
    || observation.createdAt !== observation.updatedAt
    || observation.issueUrl !== `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${subject.pr}`
    || observation.body !== body) findings.push("ASSURANCE_CONTROL_MAINTENANCE_COMMENT_INVALID");
  return {
    ok: findings.length === 0,
    findings: [...new Set(findings)].sort(),
    subject,
    subjectHash: sha256(subject),
    bodyHash: sha256(body)
  };
}

export const taskLeaseAmendmentMarker = "<!-- chillywood-assurance-task-lease-amendment-v1 -->";
export const finiteTaskTestAdaptationMarker = "<!-- chillywood-assurance-task-test-adaptation-v1 -->";
const amendmentSubjectFieldsV1 = ["schemaVersion", "repository", "leaseId", "pr", "branch", "currentCandidateHead", "currentLeaseHash", "addedPaths", "registeredDomain", "reason", "newScopeMaximum", "excludedAuthority"];
const amendmentSubjectFieldsV2 = [
  "schemaVersion", "policyId", "repository", "pr", "branch", "taskId", "leaseId", "domain",
  "baseLeaseHash", "boundStartingBaseHead", "boundStartingBaseTree", "boundStartingHead", "boundStartingTree",
  "taskArtifactHash", "ownerApproval", "jurisdictionDecision", "addedPaths", "pathReasons", "affectedDefect",
  "affectedInvariants", "effectiveReservation", "amendmentUse", "applicability", "authority"
];
const finiteTaskAmendmentClosedAuthority = Object.freeze({
  providerMutation: false,
  databaseDeployment: false,
  build: false,
  submission: false,
  ota: false,
  publicRelease: false
});
const testAdaptationSubjectFields = [
  "schemaVersion", "policyId", "capability", "classification", "repository", "implementationPr",
  "implementationBranch", "taskId", "leaseId", "baseLeaseHash", "amendmentReceipt",
  "boundStartingHead", "boundStartingTree", "protectedMainHead", "protectedMainTree", "taskArtifactHash",
  "fixturePaths", "fixtureBaselines", "fixtureBudget", "implementationPartition", "aggregateProjection",
  "causalClassification", "causativePaths", "affectedDefect", "affectedInvariants", "causalEntitySets",
  "ownerIdentity", "immutability", "applicability", "authority"
];
const finiteTaskTestAdaptationClosedAuthority = Object.freeze({
  providerMutation: false,
  databaseDeployment: false,
  build: false,
  submission: false,
  ota: false,
  publicRelease: false
});
const finiteTaskTestAdaptationPolicyIdentity = Object.freeze({
  policyId: "ASSURANCE_FINITE_TASK_TEST_ADAPTATION_V1",
  capability: "FINITE_TASK_TEST_ADAPTATION_OVERLAY_V1",
  classification: "TEST_ADAPTATION_REQUIRED"
});
const trustedFiniteTaskLiveObservations = new WeakMap();
const trustedFiniteTaskResolutionFingerprints = new WeakMap();
const trustedFiniteTaskPostMergeCandidates = new WeakMap();
const trustedFiniteTaskPostMergeTransitions = new WeakMap();
const trustedFiniteTaskImplementationLifecycles = new WeakMap();
const finiteTaskImplementationLifecycleFingerprint = (value) => sha256(value);
export function finiteTaskImplementationLifecycleAuthorityValid(value) {
  return value?.mergeEligible === true
    && trustedFiniteTaskImplementationLifecycles.get(value) === finiteTaskImplementationLifecycleFingerprint(value);
}
export function registerVerifiedFiniteTaskImplementationLifecycle({ lifecycle: value, effectiveReservationResolution: resolution, liveObservation } = {}) {
  const trustedLive = liveObservation && trustedFiniteTaskLiveObservations.get(liveObservation) === sha256(liveObservation)
    && liveObservation.commentsPaginationComplete === true && liveObservation.commitsPaginationComplete === true
    && liveObservation.requireCompleteDiscovery === true && liveObservation.observationMode === "LIVE_GITHUB_COMPLETE_READBACK";
  const readEnvelope = (marker) => {
    const matches = (liveObservation?.comments ?? []).filter(({ body }) => typeof body === "string" && body.startsWith(`${marker}\n`));
    if (matches.length !== 1) return null;
    const raw = matches[0]; let envelope;
    try { envelope = JSON.parse(raw.body.slice(marker.length + 1)); } catch { return null; }
    const body = Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== "bodyHash"));
    return raw.user?.login === "Chillywood2025" && raw.author_association === "OWNER" && raw.created_at === raw.updated_at
      && envelope.subjectHash === sha256(envelope.subject) && envelope.bodyHash === sha256(body) ? { raw, envelope } : null;
  };
  const review = readEnvelope("<!-- chillywood-assurance-repository-review-v1 -->"); const final = readEnvelope(finalReceiptMarker);
  const phase = value?.phase1Evidence; const { valid: _valid, evidenceHash: _hash, ...phaseBody } = phase ?? {};
  if (trustedLive && finiteTaskEffectiveReservationAuthorityValid(resolution)
    && value?.ok === true && value?.authorizationOk === true && value?.mergeEligible === true && value?.findings?.length === 0
    && value?.effectiveReservationHash === resolution.effectiveReservation?.reservationHash
    && value.candidateHead === resolution.candidateHead && value.candidateTree === resolution.candidateTree
    && value.baseLeaseHash === resolution.baseLeaseHash && stableJson(value.baseReservation) === stableJson(resolution.baseReservation)
    && stableJson(value.effectiveReservation) === stableJson(resolution.effectiveReservation) && stableJson(value.amendmentReceipt) === stableJson(resolution.amendmentReceipt)
    && stableJson(value.aggregateReservation) === stableJson(resolution.aggregateReservation)
    && stableJson(value.testAdaptationReservation) === stableJson(resolution.testAdaptationReservation)
    && stableJson(value.scopePartitions) === stableJson(resolution.scopePartitions)
    && stableJson(value.testAdaptationReceipt) === stableJson(resolution.testAdaptationReceipt)
    && (resolution.status !== "AMENDED_WITH_TEST_ADAPTATION" || value.scopeBase === resolution.scopeBase)
    && liveObservation.pullRequest?.number === resolution.baseLease?.implementationPr && liveObservation.pullRequest?.head?.ref === resolution.baseLease?.implementationBranch
    && (resolution.status !== "AMENDED_WITH_TEST_ADAPTATION" || liveObservation.pullRequest?.base?.sha === resolution.scopeBase)
    && liveObservation.pullRequest?.head?.sha === value.candidateHead && liveObservation.pullRequest?.head?.repo?.full_name === "Chillywood2025/chillywood-mobile"
    && value?.repositoryReview?.valid === true && value?.finalSource?.mergeEligible === true && value?.finalSourceSubject
    && phase?.valid === true && phase.result === "PASS_13_OF_13" && phase.evidenceHash === sha256(phaseBody)
    && value.candidateHead === value.finalSourceSubject.finalHead && value.candidateTree === value.finalSourceSubject.finalTree
    && (resolution.status !== "AMENDED_WITH_TEST_ADAPTATION" || value.finalSourceSubject.scopeBase === resolution.scopeBase)
    && value.finalSourceSubject.repositoryReviewHash === value.repositoryReview.subjectHash
    && value.finalSourceSubject.phase1RunId === phase.runId && value.finalSourceSubject.phase1Head === phase.sourceHead
    && review?.raw.id === value.repositoryReview.commentId && review.envelope.subjectHash === value.repositoryReview.subjectHash
    && review.envelope.subject?.reviewedHead === value.candidateHead && review.envelope.subject?.reviewedTree === value.candidateTree
    && final?.raw.id === value.finalSource.receipt?.commentId && stableJson(final.envelope.subject) === stableJson(value.finalSourceSubject)) {
    trustedFiniteTaskImplementationLifecycles.set(value, finiteTaskImplementationLifecycleFingerprint(value));
  }
  return value;
}
export function finiteTaskPostMergeTransitionAuthorityValid(value) {
  return value?.applicable === true && value?.ok === true
    && trustedFiniteTaskPostMergeTransitions.get(value) === sha256(value);
}
function finiteTaskPostMergeCandidateFingerprint(candidate) {
  return sha256({
    pr: candidate?.pr,
    branch: candidate?.branch,
    prState: candidate?.prState,
    head: candidate?.head,
    tree: candidate?.tree,
    seedTree: candidate?.seedTree,
    seedIsAncestor: candidate?.seedIsAncestor,
    baseIsAncestor: candidate?.baseIsAncestor,
    changedPaths: candidate?.changedPaths,
    changedLines: candidate?.changedLines,
    diffHash: candidate?.diffHash,
    changedPathHash: candidate?.changedPathHash,
    findings: candidate?.findings,
    observationSource: candidate?.observationSource,
    currentProtectedBase: candidate?.currentProtectedBase,
    postMergeSha: candidate?.postMergeSha,
    scopeBase: candidate?.scopeBase,
    recordedObservationHead: candidate?.recordedObservationHead
  });
}
function finiteTaskPostMergeCandidateValid(candidate) {
  return candidate?.prState === "closed"
    && candidate?.observationSource === "LIVE_GITHUB_VERIFIED_POST_MERGE_SOURCE"
    && trustedFiniteTaskPostMergeCandidates.get(candidate) === finiteTaskPostMergeCandidateFingerprint(candidate);
}
function finiteTaskClosedSourceProjection({ lease, liveObservation, postMergeTransition } = {}) {
  const observationTrusted = liveObservation && typeof liveObservation === "object"
    && trustedFiniteTaskLiveObservations.get(liveObservation) === sha256(liveObservation);
  if (!observationTrusted
    || liveObservation.commentsPaginationComplete !== true
    || liveObservation.commitsPaginationComplete !== true
    || liveObservation.requireCompleteDiscovery !== true
    || liveObservation.observationMode !== "LIVE_GITHUB_COMPLETE_READBACK") return null;
  const pullRequest = liveObservation.pullRequest;
  const terminal = postMergeTransition?.terminalEvidence;
  const lifecycle = postMergeTransition?.lifecycle;
  const finalSource = lifecycle?.finalSourceSubject ?? lifecycle?.finalSource?.subject;
  const evidenceBody = terminal && typeof terminal === "object" ? { ...terminal } : null;
  if (evidenceBody) delete evidenceBody.evidenceHash;
  const repository = "Chillywood2025/chillywood-mobile";
  const closedAuthority = stableJson(terminal?.authority) === stableJson(finiteTaskAmendmentClosedAuthority);
  const sourceValid = postMergeTransition?.applicable === true
    && postMergeTransition?.ok === true
    && postMergeTransition?.consumed === false
    && postMergeTransition?.baseLeaseUnchanged === true
    && lifecycle?.mergeEligible === true
    && postMergeTransition?.mergeProvenance?.ok === true
    && ["FINITE_TASK_AMENDED_POST_MERGE_TERMINAL_EVIDENCE_V1", "FINITE_TASK_AMENDED_TEST_ADAPTATION_POST_MERGE_TERMINAL_EVIDENCE_V2"].includes(terminal?.classification)
    && terminal?.repository === repository
    && terminal?.taskId === lease?.leaseId
    && terminal?.leaseId === lease?.leaseId
    && terminal?.implementationPr === lease?.implementationPr
    && terminal?.implementationBranch === lease?.implementationBranch
    && terminal?.baseLeaseHash === sha256(lease)
    && gitShaPattern.test(terminal?.sourceHead ?? "")
    && gitShaPattern.test(terminal?.sourceTree ?? "")
    && gitShaPattern.test(terminal?.mergeSha ?? "")
    && gitShaPattern.test(terminal?.mergeTree ?? "")
    && Array.isArray(terminal?.mergeParents)
    && terminal.mergeParents.length === 2
    && terminal.mergeParents[1] === terminal.sourceHead
    && terminal.evidenceHash === sha256(evidenceBody)
    && closedAuthority
    && lifecycle?.candidateHead === terminal.sourceHead
    && lifecycle?.candidateTree === terminal.sourceTree
    && lifecycle?.effectiveReservationHash === terminal?.effectiveReservation?.reservationHash
    && finalSource?.finalHead === terminal.sourceHead
    && finalSource?.finalTree === terminal.sourceTree
    && finalSource?.effectiveReservation?.reservationHash === terminal?.effectiveReservation?.reservationHash
    && (terminal.schemaVersion !== 2 || (
      finalSource?.scopeBase === terminal.mergeParents[0]
      && stableJson(finalSource?.testAdaptationReservation) === stableJson(terminal.testAdaptationReservation)
      && stableJson(finalSource?.aggregateReservation) === stableJson(terminal.aggregateReservation)
      && stableJson(finalSource?.scopePartitions) === stableJson(terminal.scopePartitions)
      && stableJson(finalSource?.testAdaptationReceipt) === stableJson(terminal.testAdaptationReceipt)
    ));
  const pullRequestValid = pullRequest?.number === lease?.implementationPr
    && pullRequest?.state === "closed"
    && pullRequest?.merged === true
    && typeof pullRequest?.merged_at === "string"
    && Number.isFinite(new Date(pullRequest.merged_at).valueOf())
    && pullRequest?.merge_commit_sha === terminal?.mergeSha
    && pullRequest?.head?.ref === lease?.implementationBranch
    && pullRequest?.head?.sha === terminal?.sourceHead
    && pullRequest?.head?.repo?.full_name === repository
    && pullRequest?.base?.ref === "main"
    && pullRequest?.base?.sha === terminal?.mergeParents?.[0]
    && pullRequest?.base?.repo?.full_name === repository;
  return sourceValid && pullRequestValid ? {
    pr: lease.implementationPr,
    branch: lease.implementationBranch,
    head: terminal.sourceHead,
    tree: terminal.sourceTree,
    scopeBase: terminal.mergeParents[0],
    mergeSha: terminal.mergeSha
  } : null;
}
export function registerVerifiedFiniteTaskPostMergeTransition({ lease, liveObservation, postMergeTransition } = {}) {
  if (finiteTaskImplementationLifecycleAuthorityValid(postMergeTransition?.lifecycle)
    && finiteTaskClosedSourceProjection({ lease, liveObservation, postMergeTransition })) {
    trustedFiniteTaskPostMergeTransitions.set(postMergeTransition, sha256(postMergeTransition));
  }
  return postMergeTransition;
}
function verifiedFiniteTaskClosedSource({ lease, liveObservation, postMergeTransition } = {}) {
  if (!finiteTaskPostMergeTransitionAuthorityValid(postMergeTransition)) return null;
  return finiteTaskClosedSourceProjection({ lease, liveObservation, postMergeTransition });
}
function finiteTaskResolutionAuthorityFingerprint(resolution) {
  return sha256({
    ok: resolution?.ok,
    findings: resolution?.findings,
    status: resolution?.status,
    baseLease: resolution?.baseLease,
    baseLeaseHash: resolution?.baseLeaseHash,
    baseReservation: resolution?.baseReservation,
    effectiveLease: resolution?.effectiveLease,
    effectiveReservation: resolution?.effectiveReservation,
    aggregateReservation: resolution?.aggregateReservation,
    testAdaptationReservation: resolution?.testAdaptationReservation,
    scopePartitions: resolution?.scopePartitions,
    amendmentsConsumed: resolution?.amendmentsConsumed,
    amendmentReceipt: resolution?.amendmentReceipt,
    testAdaptationsConsumed: resolution?.testAdaptationsConsumed,
    testAdaptationReceipt: resolution?.testAdaptationReceipt,
    scopeBase: resolution?.scopeBase,
    candidateHead: resolution?.candidateHead,
    candidateTree: resolution?.candidateTree,
    authority: resolution?.authority
  });
}
export function finiteTaskEffectiveReservationAuthorityValid(resolution) {
  if (resolution?.ok !== true
    || trustedFiniteTaskResolutionFingerprints.get(resolution) !== finiteTaskResolutionAuthorityFingerprint(resolution)) return false;
  if (resolution.status === "BASE_ONLY") {
    return resolution.amendmentsConsumed === 0
      && resolution.amendmentReceipt === null
      && stableJson(resolution.baseLease) === stableJson(resolution.effectiveLease)
      && stableJson(resolution.baseReservation) === stableJson(resolution.effectiveReservation)
      && stableJson(resolution.authority) === stableJson({
        ...finiteTaskAmendmentClosedAuthority,
        amendmentEffective: false,
        liveReceipt: false
      });
  }
  if (resolution.status === "AMENDED") return (resolution.testAdaptationsConsumed ?? 0) === 0
    && resolution.testAdaptationReceipt == null
    && resolution.amendmentsConsumed === 1
    && resolution.amendmentReceipt !== null
    && stableJson(resolution.authority) === stableJson({
      ...finiteTaskAmendmentClosedAuthority,
      amendmentEffective: true,
      liveReceipt: true
    });
  return resolution.status === "AMENDED_WITH_TEST_ADAPTATION"
    && resolution.amendmentsConsumed === 1
    && resolution.amendmentReceipt !== null
    && resolution.testAdaptationsConsumed === 1
    && resolution.testAdaptationReceipt !== null
    && resolution.testAdaptationReservation !== null
    && resolution.aggregateReservation !== null
    && gitShaPattern.test(resolution.scopeBase ?? "")
    && resolution.authority?.amendmentEffective === true
    && resolution.authority?.liveReceipt === true
    && resolution.authority?.testAdaptationEffective === true
    && resolution.authority?.testAdaptationLiveReceipt === true;
}
function readCompleteGitHubApiPages(endpoint) {
  try {
    const pages = JSON.parse(execFileSync("gh", ["api", "--method=GET", "--paginate", "--slurp", endpoint], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024
    }));
    return Array.isArray(pages) && pages.every(Array.isArray)
      ? { complete: true, items: pages.flat() }
      : { complete: false, items: [] };
  } catch { return { complete: false, items: [] }; }
}
const decodeGitHubHtml = (value) => value.replace(/&#x([0-9a-f]+);/giu, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16))).replace(/&#(\d+);/gu, (_, decimal) => String.fromCodePoint(Number(decimal))).replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&#39;", "'").replaceAll("&amp;", "&");
const finiteTaskGitValue = (args) => { try { return execFileSync("git", args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); } catch { return null; } };
export function observePublicGitHubPullRequest({ repository = "Chillywood2025/chillywood-mobile", pr } = {}) {
  const invalid = { comments: [], commentsPaginationComplete: false, commits: [], commitsPaginationComplete: false, pullRequest: null };
  if (repository !== "Chillywood2025/chillywood-mobile" || !Number.isInteger(pr) || pr < 1) return invalid;
  let html;
  try { html = execFileSync("curl", ["--fail", "--silent", "--show-error", "--connect-timeout", "5", "--max-time", "20", "--header", "User-Agent: chillywood-assurance-readonly", `https://github.com/${repository}/pull/${pr}`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 32 * 1024 * 1024 }); } catch { return invalid; }
  let pull;
  for (const match of html.matchAll(/<script type="application\/json" data-target="react-app\.embeddedData">([\s\S]*?)<\/script>/gu)) {
    try { const payload = JSON.parse(match[1])?.payload; pull = payload?.pullRequestsLayoutRoute?.pullRequest ?? payload?.pullRequestsConversationsRoute?.pullRequestsLayoutRoute?.pullRequest; } catch {}
    if (pull?.number === pr) break;
  }
  if (pull?.number !== pr || pull.headRepositoryOwnerLogin !== "Chillywood2025" || pull.headRepositoryName !== "chillywood-mobile") return invalid;
  let mergeCommitSha = null;
  let baseSha = finiteTaskGitValue(["rev-parse", `origin/${pull.baseBranch}`]);
  if (["OPEN", "DRAFT"].includes(pull.state) && finiteTaskGitValue(["show-ref", "--verify", "--hash", `refs/remotes/origin/${pull.headBranch}`]) !== pull.headSha) return invalid;
  if (pull.state === "MERGED") for (const candidate of new Set([...html.matchAll(/href="\/Chillywood2025\/chillywood-mobile\/commit\/([0-9a-f]{40})"/gu)].map((match) => match[1]))) {
    const parents = finiteTaskGitValue(["rev-list", "--parents", "-n", "1", candidate])?.split(/\s+/u) ?? [];
    if (parents.length === 3 && parents[2] === pull.headSha) { [mergeCommitSha, baseSha] = [candidate, parents[1]]; break; }
  }
  const starts = [...html.matchAll(/data-url="\/Chillywood2025\/chillywood-mobile\/comments\/([^/"?]+)\/partials\/timeline_issue_comment"[\s\S]*?<div class=" timeline-comment-group[^>]*id="issuecomment-(\d+)">/gu)];
  const comments = starts.map((start, index) => {
    const block = html.slice(start.index, starts[index + 1]?.index ?? html.length);
    const bodyMatch = /<clipboard-copy role="menuitem" value="([\s\S]*?)" data-view-component/gu.exec(block);
    const time = /<relative-time datetime="([^"]+)"/gu.exec(block)?.[1];
    const login = /data-hovercard-url="\/users\/([^/"?]+)\/hovercard"/gu.exec(block)?.[1];
    const body = bodyMatch ? decodeGitHubHtml(bodyMatch[1]) : null;
    const version = /data-body-version="([0-9a-f]{64})"/gu.exec(block)?.[1];
    if (!body || !time || !login || version !== sha256(body)) return null;
    return { id: Number(start[2]), node_id: start[1], user: { login }, author_association: block.includes("This user is the owner of the chillywood-mobile repository.") ? "OWNER" : "NONE", body, created_at: time, updated_at: block.includes("js-comment-edit-history") ? "EDITED" : time, issue_url: `https://api.github.com/repos/${repository}/issues/${pr}`, html_url: `https://github.com/${repository}/pull/${pr}#issuecomment-${start[2]}` };
  }).filter(Boolean);
  const commentsPaginationComplete = html.includes('id="partial-timeline"') && html.includes("</html>") && !html.includes("ajax-pagination-btn") && comments.length === starts.length && new Set(comments.flatMap(({ id, node_id }) => [id, node_id])).size === comments.length * 2;
  const rangeBase = finiteTaskGitValue(["merge-base", baseSha ?? `origin/${pull.baseBranch}`, pull.headSha]);
  const commitShas = finiteTaskGitValue(["rev-list", "--reverse", `${rangeBase}..${pull.headSha}`])?.split(/\r?\n/gu).filter(Boolean) ?? [];
  const commits = commitShas.map((sha) => ({ sha, commit: { tree: { sha: finiteTaskGitValue(["rev-parse", `${sha}^{tree}`]) } } }));
  const commitsPaginationComplete = commitShas.length === pull.commitsCount && commitShas.at(-1) === pull.headSha && commits.every(({ commit }) => gitShaPattern.test(commit.tree.sha ?? ""));
  const state = ["MERGED", "CLOSED"].includes(pull.state) ? "closed" : ["OPEN", "DRAFT"].includes(pull.state) ? "open" : null;
  const pullRequest = state && gitShaPattern.test(baseSha ?? "") ? { number: pr, state, draft: pull.state === "DRAFT", merged: pull.state === "MERGED", merged_at: pull.mergedTime, merge_commit_sha: mergeCommitSha, head: { ref: pull.headBranch, sha: pull.headSha, repo: { full_name: `${pull.headRepositoryOwnerLogin}/${pull.headRepositoryName}` } }, base: { ref: pull.baseBranch, sha: baseSha, repo: { full_name: repository } } } : null;
  return { comments, commentsPaginationComplete, commits, commitsPaginationComplete, pullRequest };
}
export function observeLiveFiniteTaskEffectiveReservation({ repository = "Chillywood2025/chillywood-mobile", pr, authorityEvidence = null } = {}) {
  const invalid = {
    comments: [],
    commentsPaginationComplete: false,
    pullRequest: null,
    commits: [],
    commitsPaginationComplete: false,
    authorityEvidence,
    observationMode: "LIVE_GITHUB_READBACK_FAILED",
    requireCompleteDiscovery: true
  };
  if (repository !== "Chillywood2025/chillywood-mobile" || !Number.isInteger(pr) || pr < 1) return invalid;
  const comments = readCompleteGitHubApiPages(`repos/${repository}/issues/${pr}/comments?per_page=100`);
  const commits = readCompleteGitHubApiPages(`repos/${repository}/pulls/${pr}/commits?per_page=100`);
  let pullRequest = null;
  try {
    pullRequest = JSON.parse(execFileSync("gh", ["api", "--method=GET", `repos/${repository}/pulls/${pr}`], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024
    }));
  } catch {}
  if (!comments.complete || !commits.complete || !pullRequest) {
    const fallback = observePublicGitHubPullRequest({ repository, pr });
    if (!comments.complete && fallback.commentsPaginationComplete) Object.assign(comments, { complete: true, items: fallback.comments });
    if (!commits.complete && fallback.commitsPaginationComplete) Object.assign(commits, { complete: true, items: fallback.commits });
    pullRequest ??= fallback.pullRequest;
  }
  const observation = {
    comments: comments.items,
    commentsPaginationComplete: comments.complete,
    pullRequest,
    commits: commits.items,
    commitsPaginationComplete: commits.complete,
    authorityEvidence,
    observationMode: "LIVE_GITHUB_COMPLETE_READBACK",
    requireCompleteDiscovery: true
  };
  if (comments.complete && commits.complete && pullRequest) trustedFiniteTaskLiveObservations.set(observation, sha256(observation));
  return observation;
}

export function taskLeaseAmendmentSubject(value) {
  const fields = value?.schemaVersion === 2 ? amendmentSubjectFieldsV2 : amendmentSubjectFieldsV1;
  return Object.fromEntries(fields.map((field) => [field, structuredClone(value?.[field])]));
}

function taskLeaseAmendmentEnvelope(value) {
  const subject = taskLeaseAmendmentSubject(value);
  const subjectHash = sha256(subject);
  if (subject.schemaVersion !== 2) return { subject, subjectHash };
  const payload = { subject, subjectHash };
  return { ...payload, bodyHash: sha256(payload) };
}
export function taskLeaseAmendmentCommentBody(value) {
  return `${taskLeaseAmendmentMarker}\n${stableJson(taskLeaseAmendmentEnvelope(value))}`;
}
export function finiteTaskTestAdaptationSubject(value) {
  return Object.fromEntries(testAdaptationSubjectFields.map((field) => [field, structuredClone(value?.[field])]));
}
function finiteTaskTestAdaptationEnvelope(value) {
  const subject = finiteTaskTestAdaptationSubject(value);
  const payload = { subject, subjectHash: sha256(subject) };
  return { ...payload, bodyHash: sha256(payload) };
}
export function finiteTaskTestAdaptationCommentBody(value) {
  return `${finiteTaskTestAdaptationMarker}\n${stableJson(finiteTaskTestAdaptationEnvelope(value))}`;
}
function normalizeIssueComment(raw) {
  return {
    id: raw?.id ?? raw?.commentId ?? null,
    commentId: raw?.id ?? raw?.commentId ?? null,
    author: raw?.user?.login ?? raw?.author ?? null,
    authorAssociation: raw?.author_association ?? raw?.authorAssociation ?? null,
    createdAt: raw?.created_at ?? raw?.createdAt ?? null,
    updatedAt: raw?.updated_at ?? raw?.updatedAt ?? null,
    issueUrl: raw?.issue_url ?? raw?.issueUrl ?? null,
    body: raw?.body ?? null
  };
}
function parseTaskLeaseAmendmentBody(body) {
  if (typeof body !== "string" || !body.startsWith(`${taskLeaseAmendmentMarker}\n`)) return null;
  try {
    const envelope = JSON.parse(body.slice(taskLeaseAmendmentMarker.length + 1));
    if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) return null;
    return envelope;
  } catch {
    return null;
  }
}
function parseFiniteTaskTestAdaptationBody(body) {
  if (typeof body !== "string" || !body.startsWith(`${finiteTaskTestAdaptationMarker}\n`)) return null;
  try {
    const envelope = JSON.parse(body.slice(finiteTaskTestAdaptationMarker.length + 1));
    return envelope && typeof envelope === "object" && !Array.isArray(envelope) ? envelope : null;
  } catch { return null; }
}
function normalizedPullRequest(raw) {
  return {
    repository: raw?.head?.repo?.full_name ?? raw?.repository ?? null,
    baseRepository: raw?.base?.repo?.full_name ?? raw?.baseRepository ?? null,
    pr: raw?.number ?? raw?.pr ?? null,
    state: raw?.state ?? raw?.prState ?? null,
    branch: raw?.head?.ref ?? raw?.branch ?? null,
    head: raw?.head?.sha ?? raw?.headSha ?? raw?.head ?? null,
    base: raw?.base?.sha ?? raw?.baseSha ?? raw?.base ?? null
  };
}
function normalizedPullCommit(raw) {
  if (typeof raw === "string") return { sha: raw, tree: null };
  return { sha: raw?.sha ?? null, tree: raw?.commit?.tree?.sha ?? raw?.tree?.sha ?? raw?.tree ?? null };
}
function gitChangedLines(gitCommand, range) {
  return gitCommand(["diff", "--numstat", range]).split(/\r?\n/gu).filter(Boolean)
    .reduce((total, line) => total + line.split("\t").slice(0, 2)
      .reduce((sum, value) => sum + (/^\d+$/u.test(value) ? Number(value) : 0), 0), 0);
}
function gitChangedLineMap(gitCommand, range) {
  const rows = gitCommand(["diff", "--numstat", range]).split(/\r?\n/gu).filter(Boolean);
  const result = {};
  for (const row of rows) {
    const [added, deleted, file, ...extra] = row.split("\t");
    if (extra.length || !file || !/^\d+$/u.test(added) || !/^\d+$/u.test(deleted) || Object.hasOwn(result, file)) return null;
    result[file] = Number(added) + Number(deleted);
  }
  return Object.fromEntries(Object.entries(result).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0));
}
export function finiteTaskReservationProjection(lease) {
  const allowedPaths = [...new Set(Array.isArray(lease?.allowedPaths) ? lease.allowedPaths : [])].sort();
  const pathGlobs = [...new Set(Array.isArray(lease?.artifactReservation?.pathGlobs)
    ? lease.artifactReservation.pathGlobs
    : allowedPaths)].sort();
  const projection = {
    allowedPaths,
    pathGlobs,
    maximumFiles: lease?.artifactReservation?.maximumFiles ?? lease?.scopeBudget?.maximumFiles ?? null,
    maximumLines: lease?.artifactReservation?.maximumLines ?? lease?.scopeBudget?.maximumChangedLines ?? null,
    eligiblePathCount: allowedPaths.length
  };
  return { ...projection, reservationHash: sha256(projection) };
}

function finiteTaskReservationFromPaths(paths, maximumFiles, maximumLines) {
  const allowedPaths = [...new Set(paths)].sort();
  const projection = { allowedPaths, pathGlobs: allowedPaths, maximumFiles, maximumLines, eligiblePathCount: allowedPaths.length };
  return { ...projection, reservationHash: sha256(projection) };
}

const finiteTaskReservationRecordValid = (reservation) => {
  const { reservationHash, ...projection } = reservation ?? {}; const paths = reservation?.allowedPaths;
  return Array.isArray(paths) && paths.length > 0 && stableJson(paths) === stableJson([...new Set(paths)].sort()) && stableJson(reservation.pathGlobs) === stableJson(paths)
    && reservation.eligiblePathCount === paths.length && Number.isInteger(reservation.maximumFiles) && reservation.maximumFiles >= paths.length && Number.isInteger(reservation.maximumLines) && reservation.maximumLines > 0 && reservationHash === sha256(projection);
};
const finiteTaskActualPathsValid = (actualPaths, reservation) => Array.isArray(actualPaths)
  && stableJson(actualPaths) === stableJson([...new Set(actualPaths)].sort())
  && actualPaths.length <= reservation.maximumFiles
  && actualPaths.every((file) => reservation.allowedPaths.includes(file));
function finiteTaskScopePartitionsValid({ implementationReservation, testAdaptationReservation, aggregateReservation, scopePartitions } = {}) {
  if (![implementationReservation, testAdaptationReservation, aggregateReservation].every(finiteTaskReservationRecordValid)) return false;
  const implementation = scopePartitions?.implementation;
  const fixture = scopePartitions?.testAdaptation;
  const aggregate = scopePartitions?.aggregate;
  const expectedEligiblePaths = [...new Set([...implementationReservation.allowedPaths, ...testAdaptationReservation.allowedPaths])].sort();
  const actualImplementation = implementation?.actualPaths;
  const actualFixture = fixture?.actualPaths;
  const expectedActualPaths = Array.isArray(actualImplementation) && Array.isArray(actualFixture)
    ? [...new Set([...actualImplementation, ...actualFixture])].sort()
    : [];
  return stableJson(implementation?.reservation) === stableJson(implementationReservation)
    && stableJson(fixture?.reservation) === stableJson(testAdaptationReservation)
    && stableJson(aggregate?.reservation) === stableJson(aggregateReservation)
    && stableJson(expectedEligiblePaths) === stableJson(aggregateReservation.allowedPaths)
    && implementationReservation.allowedPaths.every((file) => !testAdaptationReservation.allowedPaths.includes(file))
    && aggregateReservation.maximumFiles === implementationReservation.maximumFiles + testAdaptationReservation.maximumFiles
    && aggregateReservation.maximumLines === implementationReservation.maximumLines + testAdaptationReservation.maximumLines
    && finiteTaskActualPathsValid(actualImplementation, implementationReservation)
    && finiteTaskActualPathsValid(actualFixture, testAdaptationReservation)
    && actualImplementation.every((file) => !actualFixture.includes(file))
    && finiteTaskActualPathsValid(aggregate?.actualPaths, aggregateReservation)
    && stableJson(aggregate.actualPaths) === stableJson(expectedActualPaths)
    && Number.isInteger(implementation?.canonicalChangedLines) && implementation.canonicalChangedLines >= 0 && implementation.canonicalChangedLines <= implementationReservation.maximumLines
    && Number.isInteger(fixture?.canonicalChangedLines) && fixture.canonicalChangedLines >= 0 && fixture.canonicalChangedLines <= testAdaptationReservation.maximumLines
    && aggregate?.canonicalChangedLines === implementation.canonicalChangedLines + fixture.canonicalChangedLines
    && aggregate.canonicalChangedLines <= aggregateReservation.maximumLines;
}
const finiteTaskTestAdaptationReceiptRecordValid = (receipt, reservation, {
  implementationReservation = null,
  aggregateReservation = null,
  baseLeaseHash = null,
  amendmentReceipt = null,
  policy = null,
  lease = null,
  identity = null
} = {}) => {
  const paths = receipt?.fixturePaths;
  const baselines = receipt?.fixtureBaselines;
  const subject = finiteTaskTestAdaptationSubject(receipt?.subject);
  return exactObjectFields(receipt, [
    "commentId", "createdAt", "subjectHash", "bodyHash", "rawBodyHash", "boundStartingHead",
    "boundStartingTree", "protectedMainHead", "protectedMainTree", "fixturePaths", "fixtureBaselines",
    "subject", "authorityClassification"
  ])
    && Number.isInteger(receipt?.commentId) && receipt.commentId > 0
    && validInstant(receipt.createdAt)
    && [receipt.subjectHash, receipt.bodyHash, receipt.rawBodyHash].every((hash) => sha256Pattern.test(hash ?? ""))
    && [receipt.boundStartingHead, receipt.boundStartingTree, receipt.protectedMainHead, receipt.protectedMainTree].every((sha) => gitShaPattern.test(sha ?? ""))
    && Array.isArray(paths) && stableJson(paths) === stableJson(reservation?.allowedPaths)
    && finiteTaskTestAdaptationBaselinesValid(baselines) && baselines.length === paths.length
    && stableJson(baselines.map(({ path: file }) => file)) === stableJson(paths)
    && finiteTaskTestAdaptationSubjectSemanticsValid(subject, {
      policy,
      lease,
      fixtureReservation: reservation,
      implementationReservation,
      aggregateReservation,
      baseLeaseHash,
      amendmentReceipt,
      identity
    })
    && stableJson(receipt?.subject) === stableJson(subject)
    && sha256(subject) === receipt.subjectHash
    && finiteTaskTestAdaptationEnvelope(subject).bodyHash === receipt.bodyHash
    && sha256(finiteTaskTestAdaptationCommentBody(subject)) === receipt.rawBodyHash
    && receipt.boundStartingHead === subject.boundStartingHead
    && receipt.boundStartingTree === subject.boundStartingTree
    && receipt.protectedMainHead === subject.protectedMainHead
    && receipt.protectedMainTree === subject.protectedMainTree
    && stableJson(subject.fixturePaths) === stableJson(paths)
    && stableJson(subject.fixtureBaselines) === stableJson(baselines)
    && receipt.authorityClassification === "LIVE_IMMUTABLE_OWNER_RECEIPT";
};
const finiteTaskOverlayFinalReceiptRecordValid = (receipt, outcome, lease = null) => {
  const subject = finiteTaskFinalReceiptSubject(receipt?.subject);
  const aggregateActualPaths = outcome?.scopePartitions?.aggregate?.actualPaths;
  return exactObjectFields(receipt, [
    "commentId", "createdAt", "subjectHash", "bodyHash", "rawBodyHash", "finalHead", "finalTree",
    "effectiveReservationHash", "amendmentCommentId", "aggregateReservationHash", "testAdaptationCommentId", "subject"
  ])
    && Number.isInteger(receipt.commentId) && receipt.commentId > 0
    && validInstant(receipt.createdAt)
    && [receipt.subjectHash, receipt.bodyHash, receipt.rawBodyHash].every((hash) => sha256Pattern.test(hash ?? ""))
    && subject.schemaVersion === 3
    && subject.policyId === "ASSURANCE_FINITE_TASK_LEASE_V1"
    && subject.repository === outcome?.repository
    && subject.repository === "Chillywood2025/chillywood-mobile"
    && subject.featureId === (lease?.featureId ?? subject.featureId)
    && typeof subject.featureId === "string" && subject.featureId.length > 0
    && subject.implementationPr === outcome?.implementationPr
    && subject.implementationBranch === outcome?.implementationBranch
    && subject.admittedSeedHead === (lease?.admittedSeedHead ?? subject.admittedSeedHead)
    && gitShaPattern.test(subject.admittedSeedHead ?? "")
    && stableJson(receipt?.subject) === stableJson(subject)
    && sha256(subject) === receipt?.subjectHash
    && sha256({ subject, subjectHash: receipt.subjectHash }) === receipt?.bodyHash
    && sha256(finiteTaskFinalReceiptBody(subject)) === receipt?.rawBodyHash
    && subject.finalHead === outcome?.sourceHead
    && subject.finalTree === outcome?.sourceTree
    && subject.scopeBase === outcome?.mergeParents?.[0]
    && [subject.finalHead, subject.finalTree, subject.phase1Head].every((sha) => gitShaPattern.test(sha ?? ""))
    && [subject.diffHash, subject.changedPathHash, subject.callDomainClosureLedgerHash, subject.focusedTestHash,
      subject.mutationNegativeControlHash, subject.repositoryReviewHash].every((hash) => sha256Pattern.test(hash ?? ""))
    && subject.scopeResult === "PASS"
    && Number.isInteger(subject.phase1RunId) && subject.phase1RunId > 0
    && subject.phase1Head === outcome?.sourceHead
    && subject.baseLeaseHash === outcome?.baseLeaseHash
    && stableJson(subject.baseReservation) === stableJson(outcome?.baseReservation)
    && stableJson(subject.effectiveReservation) === stableJson(outcome?.effectiveReservation)
    && stableJson(subject.amendmentReceipt) === stableJson(outcome?.amendmentReceipt)
    && stableJson(subject.testAdaptationReservation) === stableJson(outcome?.testAdaptationReservation)
    && stableJson(subject.aggregateReservation) === stableJson(outcome?.aggregateReservation)
    && stableJson(subject.scopePartitions) === stableJson(outcome?.scopePartitions)
    && stableJson(subject.testAdaptationReceipt) === stableJson(outcome?.testAdaptationReceipt)
    && Array.isArray(aggregateActualPaths)
    && subject.changedPathHash === sha256(aggregateActualPaths)
    && stableJson(subject.authority) === stableJson(finiteTaskTestAdaptationClosedAuthority)
    && receipt.finalHead === subject.finalHead
    && receipt.finalTree === subject.finalTree
    && receipt.effectiveReservationHash === outcome?.effectiveReservation?.reservationHash
    && receipt.amendmentCommentId === outcome?.amendmentReceipt?.commentId
    && receipt.aggregateReservationHash === outcome?.aggregateReservation?.reservationHash
    && receipt.testAdaptationCommentId === outcome?.testAdaptationReceipt?.commentId;
};
const finiteTaskOverlayFinalReceiptMatchesLiveObservation = (receipt, liveObservation, implementationPr) => {
  const matches = (liveObservation?.comments ?? []).filter(({ body }) => typeof body === "string" && body.startsWith(`${finalReceiptMarker}\n`));
  if (trustedFiniteTaskLiveObservations.get(liveObservation) !== sha256(liveObservation)
    || liveObservation?.commentsPaginationComplete !== true
    || liveObservation?.commitsPaginationComplete !== true
    || liveObservation?.requireCompleteDiscovery !== true
    || liveObservation?.observationMode !== "LIVE_GITHUB_COMPLETE_READBACK"
    || matches.length !== 1) return false;
  const observed = normalizeIssueComment(matches[0]);
  return observed.commentId === receipt?.commentId
    && observed.author === "Chillywood2025"
    && observed.authorAssociation === "OWNER"
    && observed.createdAt === receipt?.createdAt
    && observed.createdAt === observed.updatedAt
    && observed.issueUrl === `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${implementationPr}`
    && observed.body === finiteTaskFinalReceiptBody(receipt?.subject);
};
function finiteTaskTerminalOutcomeMatchesLease(registry, lease, outcome) {
  const receipt = outcome?.amendmentReceipt; const final = outcome?.finalSourceReceipt;
  const added = receipt?.addedPaths; const policy = (registry?.amendmentPolicy?.domains ?? []).filter(({ id }) => id === lease?.domain);
  const effectivePaths = Array.isArray(added) ? [...new Set([...(lease?.allowedPaths ?? []), ...added])].sort() : [];
  const unhashed = Object.fromEntries(Object.entries(outcome ?? {}).filter(([key]) => key !== "evidenceHash"));
  const overlay = outcome?.schemaVersion === 2 && outcome.classification === "FINITE_TASK_AMENDED_TEST_ADAPTATION_POST_MERGE_TERMINAL_EVIDENCE_V2";
  const legacy = outcome?.schemaVersion === 1 && outcome.classification === "FINITE_TASK_AMENDED_POST_MERGE_TERMINAL_EVIDENCE_V1";
  const adaptation = outcome?.testAdaptationReceipt;
  const legacyOverlayFieldsAbsent = !legacy || (
    outcome?.testAdaptationReservation == null
    && outcome?.aggregateReservation == null
    && outcome?.scopePartitions == null
    && outcome?.testAdaptationReceipt == null
    && outcome?.finalSourceReceipt?.aggregateReservationHash == null
    && outcome?.finalSourceReceipt?.testAdaptationCommentId == null
    && outcome?.finalSourceReceipt?.subject == null
  );
  const overlayValid = !overlay || (finiteTaskScopePartitionsValid({
      implementationReservation: outcome.effectiveReservation,
      testAdaptationReservation: outcome.testAdaptationReservation,
      aggregateReservation: outcome.aggregateReservation,
      scopePartitions: outcome.scopePartitions
    })
    && outcome.testAdaptationReservation.maximumFiles === registry?.testAdaptationPolicy?.maximumFiles
    && outcome.testAdaptationReservation.maximumLines === registry?.testAdaptationPolicy?.maximumChangedLines
    && finiteTaskTestAdaptationReceiptRecordValid(adaptation, outcome.testAdaptationReservation, {
      implementationReservation: outcome.effectiveReservation,
      aggregateReservation: outcome.aggregateReservation,
      baseLeaseHash: outcome.baseLeaseHash,
      amendmentReceipt: outcome.amendmentReceipt,
      policy: registry?.testAdaptationPolicy,
      lease,
      identity: outcome
    })
    && finiteTaskOverlayFinalReceiptRecordValid(final, outcome, lease)
    && final?.testAdaptationCommentId === adaptation.commentId
    && final?.aggregateReservationHash === outcome.aggregateReservation.reservationHash
    && stableJson(outcome.aggregateReservation.allowedPaths) === stableJson([...new Set([...effectivePaths, ...adaptation.fixturePaths])].sort()));
  return (legacy || overlay) && legacyOverlayFieldsAbsent && overlayValid
    && outcome.repository === "Chillywood2025/chillywood-mobile" && outcome.taskId === lease?.leaseId && outcome.leaseId === lease?.leaseId && outcome.implementationPr === lease?.implementationPr && outcome.implementationBranch === lease?.implementationBranch
    && outcome.baseLeaseHash === sha256(lease) && stableJson(outcome.baseReservation) === stableJson(finiteTaskReservationProjection(lease))
    && policy.length === 1 && finiteTaskReservationRecordValid(outcome.effectiveReservation) && stableJson(outcome.effectiveReservation.allowedPaths) === stableJson(effectivePaths) && outcome.effectiveReservation.maximumFiles === effectivePaths.length
    && outcome.effectiveReservation.maximumFiles <= lease?.amendmentMaximum?.maximumFiles && outcome.effectiveReservation.maximumFiles <= policy[0]?.maximumFiles && outcome.effectiveReservation.maximumLines >= outcome.baseReservation.maximumLines && outcome.effectiveReservation.maximumLines <= lease?.amendmentMaximum?.maximumChangedLines && outcome.effectiveReservation.maximumLines <= policy[0]?.maximumChangedLines
    && Array.isArray(added) && added.length > 0 && stableJson(added) === stableJson([...(policy[0]?.amendablePaths ?? [])].sort()) && added.every((file) => !finiteTaskAmendmentPathHasWildcard(file))
    && Number.isInteger(receipt?.commentId) && receipt.commentId > 0 && validInstant(receipt.createdAt) && [receipt.subjectHash, receipt.bodyHash, receipt.rawBodyHash].every((hash) => sha256Pattern.test(hash ?? "")) && receipt.domain === lease.domain && receipt.authorityClassification === "LIVE_IMMUTABLE_OWNER_RECEIPT" && gitShaPattern.test(receipt.boundStartingHead ?? "") && gitShaPattern.test(receipt.boundStartingTree ?? "")
    && Number.isInteger(final?.commentId) && final.commentId > 0 && validInstant(final.createdAt) && [final.subjectHash, final.bodyHash, final.rawBodyHash].every((hash) => sha256Pattern.test(hash ?? ""))
    && final.amendmentCommentId === receipt.commentId && final.effectiveReservationHash === outcome.effectiveReservation.reservationHash && final.finalHead === outcome.sourceHead && final.finalTree === outcome.sourceTree
    && [outcome.sourceHead, outcome.sourceTree, outcome.mergeSha, outcome.mergeTree].every((sha) => gitShaPattern.test(sha ?? "")) && outcome.mergeTree === outcome.sourceTree && Array.isArray(outcome.mergeParents) && outcome.mergeParents.length === 2 && outcome.mergeParents.every((sha) => gitShaPattern.test(sha ?? "")) && outcome.mergeParents[1] === outcome.sourceHead
    && typeof outcome.nextTask === "string" && outcome.nextTask.length > 0 && stableJson(outcome.authority) === stableJson({ providerMutation: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false }) && outcome.evidenceHash === sha256(unhashed);
}
export function finiteTaskLeaseEffectivelyTerminal(registry, lease) {
  if (finiteTaskTerminalStates.has(lease?.taskState)) return true;
  const matches = (registry?.completedLeaseOutcomes ?? []).filter(({ leaseId }) => leaseId === lease?.leaseId);
  return matches.length === 1 && finiteTaskTerminalOutcomeMatchesLease(registry, lease, matches[0]);
}

function amendFiniteTaskLease(lease, addedPaths, maximum) {
  const allowedPaths = [...new Set([...(lease?.allowedPaths ?? []), ...addedPaths])].sort();
  const artifactReservation = lease?.artifactReservation
    ? {
        ...structuredClone(lease.artifactReservation),
        pathGlobs: allowedPaths,
        maximumFiles: maximum.maximumFiles,
        maximumLines: maximum.maximumChangedLines
      }
    : undefined;
  const amended = {
    ...structuredClone(lease),
    allowedPaths,
    scopeBudget: {
      maximumFiles: maximum.maximumFiles,
      maximumChangedLines: maximum.maximumChangedLines
    }
  };
  if (artifactReservation) amended.artifactReservation = artifactReservation;
  return amended;
}
function exactAuthorityEvidence(lease, authorityEvidence) {
  const owner = authorityEvidence?.ownerApproval ?? lease?.ownerApproval;
  const jurisdiction = authorityEvidence?.jurisdictionDecision;
  return {
    taskArtifactHash: authorityEvidence?.taskArtifactHash ?? lease?.closure?.artifactHash,
    ownerApproval: {
      commentId: owner?.commentId ?? owner?.id,
      subjectHash: owner?.subjectHash,
      rawBodyHash: owner?.rawBodyHash
    },
    jurisdictionDecision: {
      commentId: jurisdiction?.commentId ?? jurisdiction?.id,
      subjectHash: jurisdiction?.subjectHash,
      bodyHash: jurisdiction?.bodyHash,
      envelopeHash: jurisdiction?.envelopeHash
    }
  };
}
export function verifyTaskLeaseAmendment({
  registry,
  lease,
  candidate,
  subject: input,
  observation: rawObservation,
  pullRequest: rawPullRequest = null,
  commits = [],
  commitsPaginationComplete = false,
  gitCommand = git,
  authorityEvidence = null,
  observationMode = "SYNTHETIC_NO_WRITE"
} = {}) {
  const observation = normalizeIssueComment(rawObservation);
  const parsed = parseTaskLeaseAmendmentBody(observation.body);
  const subject = taskLeaseAmendmentSubject(input ?? parsed?.subject);
  const body = taskLeaseAmendmentCommentBody(subject);
  const envelope = taskLeaseAmendmentEnvelope(subject);
  const findings = [];
  const domains = (registry?.amendmentPolicy?.domains ?? []).filter(({ id }) => id === lease?.domain);
  const domain = domains.length === 1 ? domains[0] : null;
  const addedPaths = Array.isArray(subject.addedPaths) ? [...new Set(subject.addedPaths)].sort() : [];
  const competitor = (registry?.tasks ?? []).some((task) => task.leaseId !== lease?.leaseId
    && task.domain === lease?.domain
    && task.domainOwnership === "ACTIVE"
    && !finiteTaskLeaseEffectivelyTerminal(registry, task));
  if ((lease?.amendmentMaximum?.maximumAmendments ?? 0) > 0 && subject.schemaVersion !== 2) {
    findings.push("FINITE_TASK_LEASE_AMENDMENT_SCHEMA_UNSUPPORTED");
  }
  if (subject.schemaVersion === 1) {
    const authorizedPaths = new Set(domain?.amendablePaths ?? []);
    if (!lease || !candidate
      || subject.repository !== "Chillywood2025/chillywood-mobile"
      || subject.leaseId !== lease.leaseId
      || subject.pr !== lease.implementationPr
      || subject.branch !== lease.implementationBranch
      || subject.currentCandidateHead !== candidate.head
      || subject.currentLeaseHash !== sha256(lease)
      || subject.registeredDomain !== lease.domain
      || typeof subject.reason !== "string" || !subject.reason
      || !addedPaths.length
      || addedPaths.some((file) => !authorizedPaths.has(file) || finiteTaskAmendmentPathHasWildcard(file) || file.endsWith("lock") || file === "package.json")
      || stableJson(subject.excludedAuthority) !== stableJson(closedMaintenanceAuthority)
      || !Number.isInteger(subject.newScopeMaximum?.maximumFiles)
      || !Number.isInteger(subject.newScopeMaximum?.maximumChangedLines)
      || subject.newScopeMaximum.maximumFiles < new Set([...lease.allowedPaths, ...addedPaths]).size
      || subject.newScopeMaximum.maximumFiles > domain?.maximumFiles
      || subject.newScopeMaximum.maximumChangedLines < lease.scopeBudget.maximumChangedLines
      || subject.newScopeMaximum.maximumChangedLines > domain?.maximumChangedLines) findings.push("FINITE_TASK_LEASE_AMENDMENT_MALFORMED");
  } else if (subject.schemaVersion === 2) {
    const expectedEvidence = exactAuthorityEvidence(lease, authorityEvidence);
    const pullRequest = normalizedPullRequest(rawPullRequest);
    const commitEntries = Array.isArray(commits) ? commits.map(normalizedPullCommit) : [];
    const unionCount = new Set([...(lease?.allowedPaths ?? []), ...addedPaths]).size;
    const baseScopeMaximum = lease?.scopeBudget ?? {};
    const reservedMaximum = lease?.amendmentMaximum ?? {};
    const expectedPathReasons = Array.isArray(subject.pathReasons)
      ? [...subject.pathReasons].sort((left, right) => String(left?.path).localeCompare(String(right?.path)))
      : [];
    const subjectPathsSafe = addedPaths.length > 0
      && addedPaths.every((file) => typeof file === "string" && file && !finiteTaskAmendmentPathHasWildcard(file) && !file.startsWith("/") && !file.includes("..") && !file.endsWith("lock") && file !== "package.json");
    if (!lease || !candidate
      || subject.policyId !== "ASSURANCE_FINITE_TASK_LEASE_AMENDMENT_V2"
      || subject.repository !== "Chillywood2025/chillywood-mobile"
      || subject.pr !== lease.implementationPr
      || subject.branch !== lease.implementationBranch
      || subject.taskId !== lease.leaseId
      || subject.leaseId !== lease.leaseId
      || subject.domain !== lease.domain
      || subject.baseLeaseHash !== sha256(lease)
      || !gitShaPattern.test(subject.boundStartingBaseHead ?? "")
      || !gitShaPattern.test(subject.boundStartingBaseTree ?? "")
      || !gitShaPattern.test(subject.boundStartingHead ?? "")
      || !gitShaPattern.test(subject.boundStartingTree ?? "")
      || subject.taskArtifactHash !== expectedEvidence.taskArtifactHash
      || !sha256Pattern.test(subject.taskArtifactHash ?? "")
      || stableJson(subject.ownerApproval) !== stableJson(expectedEvidence.ownerApproval)
      || stableJson(subject.jurisdictionDecision) !== stableJson(expectedEvidence.jurisdictionDecision)
      || domains.length !== 1
      || !subjectPathsSafe
      || stableJson(subject.addedPaths) !== stableJson(addedPaths)
      || stableJson(addedPaths) !== stableJson([...(domain?.amendablePaths ?? [])].sort())
      || expectedPathReasons.length !== addedPaths.length
      || expectedPathReasons.some(({ path: file, reason }) => !addedPaths.includes(file) || typeof reason !== "string" || !reason)
      || stableJson(expectedPathReasons.map(({ path: file }) => file)) !== stableJson(addedPaths)
      || stableJson(subject.pathReasons) !== stableJson(expectedPathReasons)
      || typeof subject.affectedDefect !== "string" || !subject.affectedDefect
      || !Array.isArray(subject.affectedInvariants) || !subject.affectedInvariants.length
      || new Set(subject.affectedInvariants).size !== subject.affectedInvariants.length
      || subject.affectedInvariants.some((value) => typeof value !== "string" || !value)
      || subject.effectiveReservation?.eligiblePathCount !== unionCount
      || subject.effectiveReservation?.maximumFiles !== unionCount
      || !Number.isInteger(subject.effectiveReservation?.maximumLines)
      || subject.effectiveReservation.maximumLines < baseScopeMaximum.maximumChangedLines
      || subject.effectiveReservation.maximumFiles > domain?.maximumFiles
      || subject.effectiveReservation.maximumFiles > reservedMaximum.maximumFiles
      || subject.effectiveReservation.maximumLines > domain?.maximumChangedLines
      || subject.effectiveReservation.maximumLines > reservedMaximum.maximumChangedLines
      || stableJson(subject.amendmentUse) !== stableJson({ consumed: 1, maximum: reservedMaximum.maximumAmendments })
      || stableJson(subject.applicability) !== stableJson({ exactTaskOnly: true, nonReusable: true })
      || stableJson(subject.authority) !== stableJson(finiteTaskAmendmentClosedAuthority)) {
      findings.push("FINITE_TASK_LEASE_AMENDMENT_MALFORMED");
    }
    if (!commitsPaginationComplete || !Array.isArray(commits)) findings.push("FINITE_TASK_LEASE_AMENDMENT_COMMIT_DISCOVERY_INCOMPLETE");
    const startCommitMatches = commitEntries.filter(({ sha }) => sha === subject.boundStartingHead);
    if (startCommitMatches.length !== 1
      || startCommitMatches[0]?.tree !== subject.boundStartingTree) {
      findings.push("FINITE_TASK_LEASE_AMENDMENT_START_NOT_ON_PR");
    }
    if (pullRequest.repository !== subject.repository
      || pullRequest.baseRepository !== subject.repository
      || pullRequest.pr !== subject.pr
      || pullRequest.branch !== subject.branch
      || pullRequest.head !== candidate?.head
      || !gitShaPattern.test(pullRequest.base ?? "")
      || !["open", "closed"].includes(pullRequest.state)
      || candidate?.pr !== subject.pr
      || candidate?.branch !== subject.branch
      || candidate?.head !== pullRequest.head) {
      findings.push("FINITE_TASK_LEASE_AMENDMENT_PR_IDENTITY_MISMATCH");
    }
    try {
      if (gitCommand(["rev-parse", `${subject.boundStartingBaseHead}^{tree}`]) !== subject.boundStartingBaseTree
        || gitCommand(["rev-parse", `${subject.boundStartingHead}^{tree}`]) !== subject.boundStartingTree
        || gitCommand(["rev-parse", `${candidate.head}^{tree}`]) !== candidate.tree) {
        findings.push("FINITE_TASK_LEASE_AMENDMENT_TREE_MISMATCH");
      }
      gitCommand(["merge-base", "--is-ancestor", subject.boundStartingBaseHead, subject.boundStartingHead]);
      gitCommand(["merge-base", "--is-ancestor", subject.boundStartingBaseHead, pullRequest.base]);
      if (gitCommand(["merge-base", subject.boundStartingHead, pullRequest.base]) !== subject.boundStartingBaseHead) {
        findings.push("FINITE_TASK_LEASE_AMENDMENT_START_BASE_MISMATCH");
      }
      gitCommand(["merge-base", "--is-ancestor", subject.boundStartingHead, candidate.head]);
      const startingRange = `${subject.boundStartingBaseHead}...${subject.boundStartingHead}`;
      const startingPaths = gitCommand(["diff", "--name-only", startingRange]).split(/\r?\n/gu).filter(Boolean).sort();
      const startingLines = gitChangedLines(gitCommand, startingRange);
      if (startingPaths.some((file) => !lease.allowedPaths.includes(file))
        || startingPaths.length > lease.scopeBudget.maximumFiles
        || startingLines > lease.scopeBudget.maximumChangedLines) {
        findings.push("FINITE_TASK_LEASE_AMENDMENT_START_OUTSIDE_BASE_RESERVATION");
      }
    } catch {
      findings.push("FINITE_TASK_LEASE_AMENDMENT_HISTORY_INVALID");
    }
  } else {
    findings.push("FINITE_TASK_LEASE_AMENDMENT_MALFORMED");
  }
  if (competitor) findings.push("FINITE_TASK_COMPETING_DOMAIN_OWNER");
  if (observation.commentId !== observation.id
    || !Number.isInteger(observation.commentId) || observation.commentId < 1
    || observation.author !== "Chillywood2025"
    || observation.authorAssociation !== "OWNER"
    || typeof observation.createdAt !== "string" || !observation.createdAt
    || typeof observation.updatedAt !== "string" || !observation.updatedAt
    || observation.createdAt !== observation.updatedAt
    || !Number.isFinite(new Date(observation.createdAt).valueOf())
    || observation.issueUrl !== `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${lease?.implementationPr}`
    || observation.body !== body
    || stableJson(parsed) !== stableJson(envelope)) findings.push("FINITE_TASK_LEASE_AMENDMENT_COMMENT_INVALID");
  const unique = [...new Set(findings)].sort();
  const maximum = subject.schemaVersion === 2
    ? { maximumFiles: subject.effectiveReservation?.maximumFiles, maximumChangedLines: subject.effectiveReservation?.maximumLines }
    : subject.newScopeMaximum;
  const amendedLease = unique.length ? null : amendFiniteTaskLease(lease, addedPaths, maximum);
  const result = {
    ok: unique.length === 0,
    findings: unique,
    subject,
    subjectHash: sha256(subject),
    bodyHash: subject.schemaVersion === 2 ? envelope.bodyHash : sha256(body),
    rawBodyHash: sha256(body),
    liveAuthority: unique.length === 0 && observationMode === "LIVE_GITHUB_COMPLETE_READBACK",
    amendedLease
  };
  return result;
}

const finiteTaskTestFixturePathValid = (policy, file) => typeof file === "string"
  && file.length > 0
  && !file.startsWith("/")
  && !file.includes("\\")
  && !file.split("/").includes("..")
  && !finiteTaskAmendmentPathHasWildcard(file)
  && Array.isArray(policy?.fixtureRoots) && policy.fixtureRoots.some((root) => file.startsWith(root))
  && Array.isArray(policy?.fixtureExtensions) && policy.fixtureExtensions.some((extension) => file.endsWith(extension))
  && Array.isArray(policy?.prohibitedRoots) && !policy.prohibitedRoots.some((root) => file.startsWith(root));

function exactGitBlobText(gitCommand, head, file, expectedBlob) {
  try {
    const listing = gitCommand(["ls-tree", head, "--", file]);
    const match = /^(100644) blob ([0-9a-f]{40})\t(.+)$/u.exec(listing);
    if (!match || match[2] !== expectedBlob || match[3] !== file) return null;
    const shown = gitCommand(["show", `${head}:${file}`]);
    const size = Number(gitCommand(["cat-file", "-s", expectedBlob]));
    for (const text of [shown, `${shown}\n`]) {
      const bytes = Buffer.from(text);
      const oid = crypto.createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest("hex");
      if (bytes.length === size && oid === expectedBlob) return text;
    }
  } catch {}
  return null;
}

function exactTrackedGitBlob(gitCommand, head, file) {
  try {
    const listing = gitCommand(["ls-tree", head, "--", file]);
    const match = /^(100644) blob ([0-9a-f]{40})\t(.+)$/u.exec(listing);
    if (!match || match[3] !== file) return null;
    const text = exactGitBlobText(gitCommand, head, file, match[2]);
    return text === null ? null : { blob: match[2], text };
  } catch { return null; }
}

function fixturePlanCount(text, contract) {
  const match = /^plan\(([1-9]\d*)\)$/u.exec(contract ?? "");
  if (!match || typeof text !== "string") return -1;
  const declarations = [...text.matchAll(/^\s*select\s+plan\s*\(\s*([1-9]\d*)\s*\)\s*;\s*(?:--.*)?$/gimu)];
  return declarations.length === 1 && declarations[0][1] === match[1] ? 1 : -1;
}

const finiteTaskTestAdaptationBaselinesValid = (baselines) => Array.isArray(baselines)
  && baselines.every((baseline) => exactObjectFields(baseline, ["path", "blob", "sha256", "plan"])
    && typeof baseline.path === "string" && baseline.path.length > 0
    && gitShaPattern.test(baseline.blob ?? "")
    && sha256Pattern.test(baseline.sha256 ?? "")
    && /^plan\([1-9]\d*\)$/u.test(baseline.plan ?? ""));
const finiteTaskTestAdaptationCausalEntitySetsValid = (sets) => Array.isArray(sets)
  && sets.length > 0
  && sets.every((set) => exactObjectFields(set, ["kind", "ids"])
    && typeof set.kind === "string" && /^[a-z][a-z0-9_-]*$/u.test(set.kind)
    && Array.isArray(set.ids) && set.ids.length > 0 && new Set(set.ids).size === set.ids.length
    && stableJson(set.ids) === stableJson([...set.ids].sort())
    && set.ids.every((value) => typeof value === "string" && value.length > 0 && value.length <= 256))
  && new Set(sets.map(({ kind }) => kind)).size === sets.length
  && stableJson(sets) === stableJson([...sets].sort((left, right) => left.kind.localeCompare(right.kind)));

const finiteTaskTestAdaptationCausalClassificationValid = (value) => exactObjectFields(value, [
  "classification", "unchangedFixtureFailedUnderStricterCorrectGate", "productionGateIndependentlyReviewed",
  "fixtureAdaptationSufficient", "productionWeakeningAllowed", "failureCode", "failureMessage"
])
  && value.classification === "TEST_ADAPTATION_REQUIRED"
  && value.unchangedFixtureFailedUnderStricterCorrectGate === true
  && value.productionGateIndependentlyReviewed === true
  && value.fixtureAdaptationSufficient === true
  && value.productionWeakeningAllowed === false
  && typeof value.failureCode === "string" && value.failureCode.length > 0
  && typeof value.failureMessage === "string" && value.failureMessage.length > 0;

function finiteTaskTestAdaptationSubjectSemanticsValid(subject, {
  policy = null,
  lease = null,
  fixtureReservation = null,
  implementationReservation = null,
  aggregateReservation = null,
  baseLeaseHash = null,
  amendmentReceipt = null,
  identity = null
} = {}) {
  const fixturePaths = subject?.fixturePaths;
  const baselines = subject?.fixtureBaselines;
  const causativePaths = subject?.causativePaths;
  const affectedInvariants = subject?.affectedInvariants;
  const fixturePolicy = policy ?? {
    ...finiteTaskTestAdaptationPolicyIdentity,
    maximumFiles: fixtureReservation?.maximumFiles,
    maximumChangedLines: fixtureReservation?.maximumLines,
    fixtureRoots: ["supabase/tests/"],
    fixtureExtensions: [".sql"],
    prohibitedRoots: []
  };
  const expectedRepository = identity?.repository ?? "Chillywood2025/chillywood-mobile";
  const expectedPr = identity?.implementationPr ?? lease?.implementationPr;
  const expectedBranch = identity?.implementationBranch ?? lease?.implementationBranch;
  const expectedTaskId = identity?.taskId ?? lease?.leaseId;
  const expectedLeaseId = identity?.leaseId ?? lease?.leaseId;
  return exactObjectFields(subject, testAdaptationSubjectFields)
    && subject.schemaVersion === 1
    && subject.policyId === finiteTaskTestAdaptationPolicyIdentity.policyId
    && subject.capability === finiteTaskTestAdaptationPolicyIdentity.capability
    && subject.classification === finiteTaskTestAdaptationPolicyIdentity.classification
    && subject.policyId === fixturePolicy.policyId
    && subject.capability === fixturePolicy.capability
    && subject.classification === fixturePolicy.classification
    && subject.repository === expectedRepository
    && Number.isInteger(subject.implementationPr) && subject.implementationPr > 0
    && (expectedPr === undefined || subject.implementationPr === expectedPr)
    && typeof subject.implementationBranch === "string" && subject.implementationBranch.length > 0
    && (expectedBranch === undefined || subject.implementationBranch === expectedBranch)
    && typeof subject.taskId === "string" && subject.taskId.length > 0
    && typeof subject.leaseId === "string" && subject.leaseId === subject.taskId
    && (expectedTaskId === undefined || subject.taskId === expectedTaskId)
    && (expectedLeaseId === undefined || subject.leaseId === expectedLeaseId)
    && sha256Pattern.test(subject.baseLeaseHash ?? "")
    && (baseLeaseHash === null || subject.baseLeaseHash === baseLeaseHash)
    && (amendmentReceipt === null || stableJson(subject.amendmentReceipt) === stableJson(amendmentReceipt))
    && [subject.boundStartingHead, subject.boundStartingTree, subject.protectedMainHead, subject.protectedMainTree].every((sha) => gitShaPattern.test(sha ?? ""))
    && sha256Pattern.test(subject.taskArtifactHash ?? "")
    && (lease === null || subject.taskArtifactHash === lease?.closure?.artifactHash)
    && Array.isArray(fixturePaths) && fixturePaths.length > 0
    && stableJson(fixturePaths) === stableJson([...new Set(fixturePaths)].sort())
    && fixturePaths.length <= fixturePolicy.maximumFiles
    && fixturePaths.every((file) => finiteTaskTestFixturePathValid(fixturePolicy, file))
    && finiteTaskTestAdaptationBaselinesValid(baselines) && baselines.length === fixturePaths.length
    && stableJson(baselines.map(({ path: file }) => file)) === stableJson(fixturePaths)
    && finiteTaskReservationRecordValid(fixtureReservation)
    && stableJson(fixtureReservation.allowedPaths) === stableJson(fixturePaths)
    && stableJson(subject.fixtureBudget) === stableJson({
      maximumFiles: fixturePolicy.maximumFiles,
      maximumCanonicalLines: fixturePolicy.maximumChangedLines
    })
    && finiteTaskReservationRecordValid(subject.implementationPartition)
    && finiteTaskReservationRecordValid(subject.aggregateProjection)
    && (implementationReservation === null || stableJson(subject.implementationPartition) === stableJson(implementationReservation))
    && (aggregateReservation === null || stableJson(subject.aggregateProjection) === stableJson(aggregateReservation))
    && subject.implementationPartition.allowedPaths.every((file) => !fixturePaths.includes(file))
    && stableJson(subject.aggregateProjection.allowedPaths) === stableJson([...new Set([...subject.implementationPartition.allowedPaths, ...fixturePaths])].sort())
    && subject.aggregateProjection.maximumFiles === subject.implementationPartition.maximumFiles + fixtureReservation.maximumFiles
    && subject.aggregateProjection.maximumLines === subject.implementationPartition.maximumLines + fixtureReservation.maximumLines
    && finiteTaskTestAdaptationCausalClassificationValid(subject.causalClassification)
    && Array.isArray(causativePaths) && causativePaths.length > 0
    && stableJson(causativePaths) === stableJson([...new Set(causativePaths)].sort())
    && causativePaths.every((file) => subject.implementationPartition.allowedPaths.includes(file))
    && typeof subject.affectedDefect === "string" && subject.affectedDefect.length > 0
    && Array.isArray(affectedInvariants) && affectedInvariants.length > 0
    && stableJson(affectedInvariants) === stableJson([...new Set(affectedInvariants)].sort())
    && affectedInvariants.every((value) => typeof value === "string" && value.length > 0)
    && finiteTaskTestAdaptationCausalEntitySetsValid(subject.causalEntitySets)
    && stableJson(subject.ownerIdentity) === stableJson({ login: "Chillywood2025", association: "OWNER" })
    && stableJson(subject.immutability) === stableJson({ immutableCommentRequired: true, createdAtEqualsUpdatedAtRequired: true })
    && stableJson(subject.applicability) === stableJson({ exactTaskOnly: true, descendantOnly: true, expiresAtTaskTerminal: true, reusableByAnotherTaskOrPr: false })
    && stableJson(subject.authority) === stableJson(finiteTaskTestAdaptationClosedAuthority);
}

export function verifyFiniteTaskTestAdaptationReceipt({
  registry,
  lease,
  candidate,
  implementationReservation,
  amendmentReceipt,
  subject: input,
  observation: rawObservation,
  pullRequest: rawPullRequest = null,
  commits = [],
  commitsPaginationComplete = false,
  gitCommand = git,
  authorityEvidence = null,
  observationMode = "SYNTHETIC_NO_WRITE"
} = {}) {
  const policy = registry?.testAdaptationPolicy;
  const observation = normalizeIssueComment(rawObservation);
  const parsed = parseFiniteTaskTestAdaptationBody(observation.body);
  const subject = finiteTaskTestAdaptationSubject(input ?? parsed?.subject);
  const envelope = finiteTaskTestAdaptationEnvelope(subject);
  const body = finiteTaskTestAdaptationCommentBody(subject);
  const findings = [];
  const pullRequest = normalizedPullRequest(rawPullRequest);
  const commitEntries = Array.isArray(commits) ? commits.map(normalizedPullCommit) : [];
  const fixturePaths = Array.isArray(subject.fixturePaths) ? [...new Set(subject.fixturePaths)].sort() : [];
  const baselines = Array.isArray(subject.fixtureBaselines)
    ? [...subject.fixtureBaselines].sort((left, right) => String(left?.path).localeCompare(String(right?.path)))
    : [];
  const baselinesWellFormed = finiteTaskTestAdaptationBaselinesValid(baselines);
  const causalEntitySets = Array.isArray(subject.causalEntitySets) ? subject.causalEntitySets : [];
  const causalEntitySetsWellFormed = finiteTaskTestAdaptationCausalEntitySetsValid(causalEntitySets);
  const implementationPaths = implementationReservation?.allowedPaths ?? [];
  const aggregateProjection = finiteTaskReservationFromPaths(
    [...implementationPaths, ...fixturePaths],
    Number(implementationReservation?.maximumFiles ?? 0) + Number(subject.fixtureBudget?.maximumFiles ?? 0),
    Number(implementationReservation?.maximumLines ?? 0) + Number(subject.fixtureBudget?.maximumCanonicalLines ?? 0)
  );
  const fixtureReservation = finiteTaskReservationFromPaths(
    fixturePaths,
    Number(policy?.maximumFiles ?? 0),
    Number(policy?.maximumChangedLines ?? 0)
  );
  const expectedAuthority = lease?.closure?.artifactHash ?? null;
  const causal = subject.causalClassification;
  if (!policy || !lease || !candidate
    || !finiteTaskTestAdaptationSubjectSemanticsValid(subject, {
      policy,
      lease,
      fixtureReservation,
      implementationReservation,
      aggregateReservation: aggregateProjection,
      baseLeaseHash: sha256(lease),
      amendmentReceipt
    })
    || subject.schemaVersion !== 1
    || subject.policyId !== policy?.policyId
    || subject.capability !== policy?.capability
    || subject.classification !== policy?.classification
    || subject.repository !== "Chillywood2025/chillywood-mobile"
    || subject.implementationPr !== lease.implementationPr
    || subject.implementationBranch !== lease.implementationBranch
    || subject.taskId !== lease.leaseId
    || subject.leaseId !== lease.leaseId
    || subject.baseLeaseHash !== sha256(lease)
    || stableJson(subject.amendmentReceipt) !== stableJson(amendmentReceipt)
    || !gitShaPattern.test(subject.boundStartingHead ?? "")
    || !gitShaPattern.test(subject.boundStartingTree ?? "")
    || !gitShaPattern.test(subject.protectedMainHead ?? "")
    || !gitShaPattern.test(subject.protectedMainTree ?? "")
    || subject.taskArtifactHash !== expectedAuthority
    || (authorityEvidence?.taskArtifactHash !== undefined && authorityEvidence.taskArtifactHash !== expectedAuthority)
    || !sha256Pattern.test(subject.taskArtifactHash ?? "")
    || fixturePaths.length < 1 || fixturePaths.length > policy?.maximumFiles
    || stableJson(subject.fixturePaths) !== stableJson(fixturePaths)
    || fixturePaths.some((file) => !finiteTaskTestFixturePathValid(policy, file) || implementationPaths.includes(file))
    || baselines.length !== fixturePaths.length
    || stableJson(subject.fixtureBaselines) !== stableJson(baselines)
    || !baselinesWellFormed
    || stableJson(baselines.map(({ path: file }) => file)) !== stableJson(fixturePaths)
    || stableJson(subject.fixtureBudget) !== stableJson({ maximumFiles: policy?.maximumFiles, maximumCanonicalLines: policy?.maximumChangedLines })
    || stableJson(subject.implementationPartition) !== stableJson(implementationReservation)
    || stableJson(subject.aggregateProjection) !== stableJson(aggregateProjection)
    || causal?.classification !== "TEST_ADAPTATION_REQUIRED"
    || causal?.unchangedFixtureFailedUnderStricterCorrectGate !== true
    || causal?.productionGateIndependentlyReviewed !== true
    || causal?.fixtureAdaptationSufficient !== true
    || causal?.productionWeakeningAllowed !== false
    || typeof causal?.failureCode !== "string" || !causal.failureCode
    || typeof causal?.failureMessage !== "string" || !causal.failureMessage
    || !Array.isArray(subject.causativePaths) || !subject.causativePaths.length || new Set(subject.causativePaths).size !== subject.causativePaths.length
    || subject.causativePaths.some((file) => typeof file !== "string" || !implementationPaths.includes(file))
    || typeof subject.affectedDefect !== "string" || !subject.affectedDefect
    || !Array.isArray(subject.affectedInvariants) || !subject.affectedInvariants.length || new Set(subject.affectedInvariants).size !== subject.affectedInvariants.length
    || subject.affectedInvariants.some((value) => typeof value !== "string" || !value)
    || !causalEntitySetsWellFormed
    || stableJson(subject.ownerIdentity) !== stableJson({ login: "Chillywood2025", association: "OWNER" })
    || stableJson(subject.immutability) !== stableJson({ immutableCommentRequired: true, createdAtEqualsUpdatedAtRequired: true })
    || stableJson(subject.applicability) !== stableJson({ exactTaskOnly: true, descendantOnly: true, expiresAtTaskTerminal: true, reusableByAnotherTaskOrPr: false })
    || stableJson(subject.authority) !== stableJson(finiteTaskTestAdaptationClosedAuthority)) findings.push("FINITE_TASK_TEST_ADAPTATION_RECEIPT_MALFORMED");
  if (!commitsPaginationComplete || !Array.isArray(commits)) findings.push("FINITE_TASK_TEST_ADAPTATION_COMMIT_DISCOVERY_INCOMPLETE");
  const startMatches = commitEntries.filter(({ sha }) => sha === subject.boundStartingHead);
  if (startMatches.length !== 1 || startMatches[0]?.tree !== subject.boundStartingTree) findings.push("FINITE_TASK_TEST_ADAPTATION_START_NOT_ON_PR");
  if (pullRequest.repository !== subject.repository
    || pullRequest.baseRepository !== subject.repository
    || pullRequest.pr !== subject.implementationPr
    || pullRequest.branch !== subject.implementationBranch
    || pullRequest.head !== candidate?.head
    || !gitShaPattern.test(pullRequest.base ?? "")
    || candidate?.pr !== subject.implementationPr
    || candidate?.branch !== subject.implementationBranch) findings.push("FINITE_TASK_TEST_ADAPTATION_IDENTITY_MISMATCH");
  try {
    if (gitCommand(["rev-parse", `${subject.protectedMainHead}^{tree}`]) !== subject.protectedMainTree
      || gitCommand(["rev-parse", `${subject.boundStartingHead}^{tree}`]) !== subject.boundStartingTree
      || gitCommand(["rev-parse", `${candidate.head}^{tree}`]) !== candidate.tree) findings.push("FINITE_TASK_TEST_ADAPTATION_TREE_MISMATCH");
    gitCommand(["merge-base", "--is-ancestor", subject.protectedMainHead, subject.boundStartingHead]);
    gitCommand(["merge-base", "--is-ancestor", subject.protectedMainHead, pullRequest.base]);
    gitCommand(["merge-base", "--is-ancestor", subject.boundStartingHead, candidate.head]);
    gitCommand(["merge-base", "--is-ancestor", pullRequest.base, candidate.head]);
    if (gitCommand(["merge-base", subject.boundStartingHead, pullRequest.base]) !== subject.protectedMainHead) findings.push("FINITE_TASK_TEST_ADAPTATION_HISTORY_INVALID");
    const startingChangedPaths = gitCommand(["diff", "--name-only", `${subject.protectedMainHead}...${subject.boundStartingHead}`]).split(/\r?\n/gu).filter(Boolean);
    if (fixturePaths.some((file) => startingChangedPaths.includes(file))) findings.push("FINITE_TASK_TEST_ADAPTATION_BASELINE_MISMATCH");
    for (const baseline of baselines) {
      const content = exactGitBlobText(gitCommand, subject.protectedMainHead, baseline.path, baseline.blob);
      const startBlob = gitCommand(["rev-parse", `${subject.boundStartingHead}:${baseline.path}`]);
      const currentBaseBlob = gitCommand(["rev-parse", `${pullRequest.base}:${baseline.path}`]);
      if (content === null || startBlob !== baseline.blob || currentBaseBlob !== baseline.blob || sha256(content) !== baseline.sha256 || !content.includes(baseline.plan)) {
        findings.push("FINITE_TASK_TEST_ADAPTATION_BASELINE_MISMATCH");
      }
    }
    const artifactPath = lease?.artifactReservation?.closureArtifactPath;
    const artifact = exactTrackedGitBlob(gitCommand, subject.boundStartingHead, artifactPath);
    let frozenTask = null;
    try { frozenTask = artifact ? JSON.parse(artifact.text) : null; } catch {}
    const invariantIds = new Set(Array.isArray(frozenTask?.invariants) ? frozenTask.invariants.map(({ id }) => id) : []);
    if (!artifact
      || sha256(artifact.text) !== subject.taskArtifactHash
      || frozenTask?.taskId !== subject.taskId
      || !Array.isArray(frozenTask?.rootDefects) || !frozenTask.rootDefects.includes(subject.affectedDefect)
      || subject.affectedInvariants.some((id) => !invariantIds.has(id))
      || !Array.isArray(frozenTask?.implementationPlan?.allowedPaths)
      || subject.causativePaths.some((file) => !frozenTask.implementationPlan.allowedPaths.includes(file))) {
      findings.push("FINITE_TASK_TEST_ADAPTATION_CAUSAL_BINDING_INVALID");
    }
  } catch { findings.push("FINITE_TASK_TEST_ADAPTATION_HISTORY_INVALID"); }
  if (observation.commentId !== observation.id
    || !Number.isInteger(observation.commentId) || observation.commentId < 1
    || observation.author !== "Chillywood2025"
    || observation.authorAssociation !== "OWNER"
    || typeof observation.createdAt !== "string" || !Number.isFinite(new Date(observation.createdAt).valueOf())
    || observation.createdAt !== observation.updatedAt
    || observation.issueUrl !== `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${lease?.implementationPr}`
    || observation.body !== body
    || stableJson(parsed) !== stableJson(envelope)) findings.push("FINITE_TASK_TEST_ADAPTATION_COMMENT_INVALID");
  const unique = [...new Set(findings)].sort();
  return {
    ok: unique.length === 0,
    findings: unique,
    subject,
    subjectHash: sha256(subject),
    bodyHash: envelope.bodyHash,
    rawBodyHash: sha256(body),
    liveAuthority: unique.length === 0 && observationMode === "LIVE_GITHUB_COMPLETE_READBACK",
    aggregateProjection
  };
}

export function resolveFiniteTaskEffectiveReservation({
  registry,
  lease,
  candidate = null,
  comments = [],
  commentsPaginationComplete = false,
  pullRequest = null,
  commits = [],
  commitsPaginationComplete = false,
  gitCommand = git,
  requireCompleteDiscovery = false,
  observationMode = "SYNTHETIC_NO_WRITE",
  authorityEvidence = null,
  liveObservation = null
} = {}) {
  const observation = liveObservation && typeof liveObservation === "object" ? liveObservation : null;
  const trustedLiveObservation = observation !== null
    && trustedFiniteTaskLiveObservations.get(observation) === sha256(observation);
  if (observation) {
    comments = observation.comments;
    commentsPaginationComplete = observation.commentsPaginationComplete;
    pullRequest = observation.pullRequest;
    commits = observation.commits;
    commitsPaginationComplete = observation.commitsPaginationComplete;
    requireCompleteDiscovery = observation.requireCompleteDiscovery;
    authorityEvidence = observation.authorityEvidence ?? authorityEvidence;
  }
  observationMode = trustedLiveObservation ? "LIVE_GITHUB_COMPLETE_READBACK" : "SYNTHETIC_NO_WRITE";
  const findings = [...validateFiniteTaskLeaseRegistry(registry)];
  const baseLease = lease ? structuredClone(lease) : null;
  const baseLeaseHash = lease ? sha256(lease) : null;
  const baseReservation = finiteTaskReservationProjection(lease);
  const rawComments = Array.isArray(comments) ? comments : [];
  const marked = rawComments.filter(({ body }) => typeof body === "string" && body.includes(taskLeaseAmendmentMarker));
  const adaptationMarked = rawComments.filter(({ body }) => typeof body === "string" && body.includes(finiteTaskTestAdaptationMarker));
  const maximumAmendments = lease?.amendmentMaximum?.maximumAmendments ?? 0;
  if (!lease) findings.push("FINITE_TASK_EFFECTIVE_RESERVATION_LEASE_MISSING");
  if (!Array.isArray(comments) || ((requireCompleteDiscovery || maximumAmendments > 0 || marked.length > 0 || adaptationMarked.length > 0) && commentsPaginationComplete !== true)) {
    findings.push("FINITE_TASK_LEASE_AMENDMENT_COMMENT_DISCOVERY_INCOMPLETE");
  }
  if (marked.length > maximumAmendments || marked.length > 1) findings.push("FINITE_TASK_LEASE_AMENDMENT_CARDINALITY_EXCEEDED");
  if (adaptationMarked.length > (registry?.testAdaptationPolicy?.maximumReceiptsPerTask ?? 0) || adaptationMarked.length > 1) findings.push("FINITE_TASK_TEST_ADAPTATION_CARDINALITY_EXCEEDED");
  let verification = null;
  let effectiveLease = baseLease;
  if (marked.length === 1) {
    const observation = normalizeIssueComment(marked[0]);
    const parsed = parseTaskLeaseAmendmentBody(observation.body);
    verification = verifyTaskLeaseAmendment({
      registry,
      lease,
      candidate,
      subject: parsed?.subject,
      observation,
      pullRequest,
      commits,
      commitsPaginationComplete,
      gitCommand,
      authorityEvidence,
      observationMode
    });
    findings.push(...verification.findings);
    if (verification.ok) effectiveLease = verification.amendedLease;
  }
  const effectiveReservation = finiteTaskReservationProjection(effectiveLease);
  const verifiedAmendmentReceipt = verification?.ok ? {
    commentId: normalizeIssueComment(marked[0]).commentId,
    createdAt: normalizeIssueComment(marked[0]).createdAt,
    subjectHash: verification.subjectHash,
    bodyHash: verification.bodyHash,
    rawBodyHash: verification.rawBodyHash,
    boundStartingHead: verification.subject.boundStartingHead ?? verification.subject.currentCandidateHead,
    boundStartingTree: verification.subject.boundStartingTree ?? null,
    addedPaths: [...verification.subject.addedPaths].sort(),
    domain: verification.subject.domain ?? verification.subject.registeredDomain,
    authorityClassification: verification.liveAuthority ? "LIVE_IMMUTABLE_OWNER_RECEIPT" : "SYNTHETIC_NON_AUTHORITY"
  } : null;
  if ((lease?.amendmentMaximum?.maximumAmendments ?? 0) > 0 && (stableJson(baseReservation.allowedPaths) !== stableJson(baseReservation.pathGlobs)
    || baseReservation.maximumFiles !== lease?.scopeBudget?.maximumFiles
    || baseReservation.maximumLines !== lease?.scopeBudget?.maximumChangedLines)) {
    findings.push("FINITE_TASK_BASE_RESERVATION_INCONSISTENT");
  }
  if (verification?.ok && (stableJson(effectiveReservation.allowedPaths) !== stableJson(effectiveReservation.pathGlobs)
    || effectiveReservation.maximumFiles !== effectiveLease?.scopeBudget?.maximumFiles
    || effectiveReservation.maximumLines !== effectiveLease?.scopeBudget?.maximumChangedLines)) {
    findings.push("FINITE_TASK_EFFECTIVE_RESERVATION_INCONSISTENT");
  }
  let adaptationVerification = null;
  if (adaptationMarked.length === 1) {
    const adaptationObservation = normalizeIssueComment(adaptationMarked[0]);
    adaptationVerification = verifyFiniteTaskTestAdaptationReceipt({
      registry,
      lease,
      candidate,
      implementationReservation: effectiveReservation,
      amendmentReceipt: verifiedAmendmentReceipt,
      subject: parseFiniteTaskTestAdaptationBody(adaptationObservation.body)?.subject,
      observation: adaptationObservation,
      pullRequest,
      commits,
      commitsPaginationComplete,
      gitCommand,
      authorityEvidence,
      observationMode
    });
    findings.push(...adaptationVerification.findings);
  }
  const adaptationAuthorized = adaptationMarked.length === 1 && adaptationVerification?.ok === true;
  const ordinaryAmendmentAuthorized = marked.length === 1 && verification?.ok === true;
  if (adaptationMarked.length === 1 && !ordinaryAmendmentAuthorized) findings.push("FINITE_TASK_TEST_ADAPTATION_EFFECTIVE_LEASE_REQUIRED");
  if (adaptationMarked.length === 1 && lease && finiteTaskLeaseEffectivelyTerminal(registry, lease)) {
    const terminalMatches = (registry?.completedLeaseOutcomes ?? []).filter(({ leaseId }) => leaseId === lease.leaseId);
    const carriedReceipt = terminalMatches.length === 1 ? terminalMatches[0]?.testAdaptationReceipt : null;
    const adaptationObservation = normalizeIssueComment(adaptationMarked[0]);
    const currentReceipt = adaptationAuthorized ? {
      commentId: adaptationObservation.commentId,
      createdAt: adaptationObservation.createdAt,
      subjectHash: adaptationVerification.subjectHash,
      bodyHash: adaptationVerification.bodyHash,
      rawBodyHash: adaptationVerification.rawBodyHash,
      boundStartingHead: adaptationVerification.subject.boundStartingHead,
      boundStartingTree: adaptationVerification.subject.boundStartingTree,
      protectedMainHead: adaptationVerification.subject.protectedMainHead,
      protectedMainTree: adaptationVerification.subject.protectedMainTree,
      fixturePaths: [...adaptationVerification.subject.fixturePaths],
      fixtureBaselines: adaptationVerification.subject.fixtureBaselines,
      subject: adaptationVerification.subject,
      authorityClassification: adaptationVerification.liveAuthority ? "LIVE_IMMUTABLE_OWNER_RECEIPT" : "SYNTHETIC_NON_AUTHORITY"
    } : null;
    if (stableJson(currentReceipt) !== stableJson(carriedReceipt)) findings.push("FINITE_TASK_TEST_ADAPTATION_TERMINAL_EXPIRED");
  }
  const fixturePaths = adaptationAuthorized ? [...adaptationVerification.subject.fixturePaths] : [];
  const fixtureReservation = adaptationAuthorized
    ? finiteTaskReservationFromPaths(fixturePaths, registry.testAdaptationPolicy.maximumFiles, registry.testAdaptationPolicy.maximumChangedLines)
    : null;
  const aggregateReservation = adaptationAuthorized ? adaptationVerification.aggregateProjection : effectiveReservation;
  let scopePartitions = null;
  if (candidate && (candidate.changedPaths !== undefined || candidate.changedLines !== undefined)) {
    const candidatePaths = Array.isArray(candidate.changedPaths) ? candidate.changedPaths : [];
    const uniqueCandidatePaths = [...new Set(candidatePaths)].sort();
    if (!Array.isArray(candidate.changedPaths)
      || uniqueCandidatePaths.length !== candidatePaths.length
      || uniqueCandidatePaths.some((file) => !aggregateReservation.allowedPaths.includes(file))) {
      findings.push("FINITE_TASK_EFFECTIVE_RESERVATION_PATH_VIOLATION");
    }
    if (adaptationAuthorized) {
      let changedLineByPath = null;
      const currentProtectedBase = normalizedPullRequest(pullRequest).base;
      try { changedLineByPath = gitChangedLineMap(gitCommand, `${currentProtectedBase}...${candidate.head}`); } catch {}
      const linePaths = changedLineByPath ? Object.keys(changedLineByPath) : [];
      const implementationActualPaths = uniqueCandidatePaths.filter((file) => effectiveReservation.allowedPaths.includes(file));
      const fixtureActualPaths = uniqueCandidatePaths.filter((file) => fixturePaths.includes(file));
      const implementationLines = implementationActualPaths.reduce((sum, file) => sum + Number(changedLineByPath?.[file] ?? 0), 0);
      const fixtureLines = fixtureActualPaths.reduce((sum, file) => sum + Number(changedLineByPath?.[file] ?? 0), 0);
      const canonicalLines = implementationLines + fixtureLines;
      if (!changedLineByPath
        || stableJson(linePaths) !== stableJson(uniqueCandidatePaths)
        || uniqueCandidatePaths.length > aggregateReservation.maximumFiles
        || canonicalLines !== candidate.changedLines
        || implementationActualPaths.some((file) => fixtureActualPaths.includes(file))) findings.push("FINITE_TASK_TEST_ADAPTATION_PARTITION_INVALID");
      if (implementationActualPaths.length > effectiveReservation.maximumFiles || implementationLines > effectiveReservation.maximumLines) findings.push("FINITE_TASK_IMPLEMENTATION_PARTITION_SCOPE_OVERFLOW");
      if (fixtureActualPaths.length > fixtureReservation.maximumFiles || fixtureLines > fixtureReservation.maximumLines) findings.push("FINITE_TASK_TEST_ADAPTATION_PARTITION_SCOPE_OVERFLOW");
      for (const baseline of adaptationVerification.subject.fixtureBaselines) {
        const candidateFixture = exactTrackedGitBlob(gitCommand, candidate.head, baseline.path);
        const baselinePlanCount = fixturePlanCount(exactGitBlobText(gitCommand, adaptationVerification.subject.protectedMainHead, baseline.path, baseline.blob), baseline.plan);
        const candidatePlanCount = fixturePlanCount(candidateFixture?.text, baseline.plan);
        const changed = fixtureActualPaths.includes(baseline.path);
        if (!candidateFixture
          || baselinePlanCount < 1
          || candidatePlanCount !== baselinePlanCount
          || (changed && candidateFixture.blob === baseline.blob)
          || (!changed && candidateFixture.blob !== baseline.blob)) findings.push("FINITE_TASK_TEST_ADAPTATION_FIXTURE_INTEGRITY_INVALID");
      }
      scopePartitions = {
        implementation: { reservation: effectiveReservation, actualPaths: implementationActualPaths, canonicalChangedLines: implementationLines },
        testAdaptation: { reservation: fixtureReservation, actualPaths: fixtureActualPaths, canonicalChangedLines: fixtureLines },
        aggregate: { reservation: aggregateReservation, actualPaths: uniqueCandidatePaths, canonicalChangedLines: canonicalLines }
      };
    } else if (uniqueCandidatePaths.length > effectiveReservation.maximumFiles
      || !Number.isInteger(candidate.changedLines)
      || candidate.changedLines < 0
      || candidate.changedLines > effectiveReservation.maximumLines) {
      findings.push("FINITE_TASK_EFFECTIVE_RESERVATION_SCOPE_OVERFLOW");
    }
  }
  const unique = [...new Set(findings)].sort();
  const amended = ordinaryAmendmentAuthorized && unique.length === 0;
  const amendmentReceipt = verification?.ok ? verifiedAmendmentReceipt : null;
  const testAdaptationReceipt = adaptationAuthorized && unique.length === 0 ? {
    commentId: normalizeIssueComment(adaptationMarked[0]).commentId,
    createdAt: normalizeIssueComment(adaptationMarked[0]).createdAt,
    subjectHash: adaptationVerification.subjectHash,
    bodyHash: adaptationVerification.bodyHash,
    rawBodyHash: adaptationVerification.rawBodyHash,
    boundStartingHead: adaptationVerification.subject.boundStartingHead,
    boundStartingTree: adaptationVerification.subject.boundStartingTree,
    protectedMainHead: adaptationVerification.subject.protectedMainHead,
    protectedMainTree: adaptationVerification.subject.protectedMainTree,
    fixturePaths,
    fixtureBaselines: adaptationVerification.subject.fixtureBaselines,
    subject: adaptationVerification.subject,
    authorityClassification: adaptationVerification.liveAuthority ? "LIVE_IMMUTABLE_OWNER_RECEIPT" : "SYNTHETIC_NON_AUTHORITY"
  } : null;
  const adapted = amended && adaptationAuthorized && unique.length === 0;
  const result = {
    ok: unique.length === 0,
    findings: unique,
    status: unique.length ? "INVALID" : adapted ? "AMENDED_WITH_TEST_ADAPTATION" : amended ? "AMENDED" : "BASE_ONLY",
    baseLease,
    baseLeaseHash,
    baseReservation,
    effectiveLease: unique.length ? null : effectiveLease,
    effectiveReservation: unique.length ? null : effectiveReservation,
    amendmentsConsumed: amended ? 1 : 0,
    amendmentReceipt,
    ...(adapted ? {
      aggregateReservation,
      testAdaptationReservation: fixtureReservation,
      scopePartitions,
      scopeBase: normalizedPullRequest(pullRequest).base,
      testAdaptationsConsumed: 1,
      testAdaptationReceipt
    } : {}),
    candidateHead: candidate?.head ?? null,
    candidateTree: candidate?.tree ?? null,
    authority: {
      ...finiteTaskAmendmentClosedAuthority,
      amendmentEffective: amended,
      liveReceipt: verification?.liveAuthority === true,
      ...(adapted ? {
        testAdaptationEffective: true,
        testAdaptationLiveReceipt: adaptationVerification?.liveAuthority === true
      } : {})
    }
  };
  const baseOnlyAuthorityEligible = result.ok
    && result.status === "BASE_ONLY"
    && (maximumAmendments === 0 || trustedLiveObservation);
  if (baseOnlyAuthorityEligible) {
    trustedFiniteTaskResolutionFingerprints.set(result, finiteTaskResolutionAuthorityFingerprint(result));
  } else if (amended && trustedLiveObservation && verification?.liveAuthority === true
    && (!adaptationAuthorized || adaptationVerification?.liveAuthority === true)) {
    trustedFiniteTaskResolutionFingerprints.set(result, finiteTaskResolutionAuthorityFingerprint(result));
  }
  return result;
}

export function verifyCommittedClaimEvidence({ claim, source, factRegistry, head = "HEAD" }) {
  if (!/^[0-9a-f]{40}$/u.test(source?.sourceCommit ?? "") || !Array.isArray(factRegistry)) return false;
  try {
    git(["merge-base", "--is-ancestor", source.sourceCommit, head]);
    const sourceTree = git(["rev-parse", `${source.sourceCommit}^{tree}`]);
    if (claim?.freshnessClass === "REPOSITORY_TASK_LEASE") {
      if (source.subjectHead !== source.sourceCommit
        || source.subjectTree !== sourceTree
        || source.leaseId !== claim.leaseId
        || source.leaseHash !== claim.leaseHash
        || !sha256Pattern.test(source.leaseHash ?? "")) return false;
      const committedRecord = JSON.parse(git(["show", `${source.sourceCommit}:config/assurance/current-truth-v1.json`]));
      const committedLease = (committedRecord.finiteTaskLeases?.tasks ?? []).find(({ leaseId }) => leaseId === source.leaseId);
      const factsBound = Array.isArray(source.covers)
        && claim.factsCovered.every((factId) => {
          const entries = factRegistry.filter(({ factId: registered }) => registered === factId);
          return entries.length === 1
            && factRegistryEntryMatchesClaim(entries[0], claim)
            && source.covers.includes(factId);
        });
      return claim.observedAt === source.observedAt
        && source.mode === claim.evidenceMode
        && source.freshnessClass === claim.freshnessClass
        && source.authorityAllowed === claim.authorityAllowed
        && source.platform === claim.platform
        && source.provider === claim.provider
        && committedLease?.leaseId === claim.leaseId
        && sha256(committedLease) === claim.leaseHash
        && factsBound;
    }
    if (claim?.freshnessClass === "REPOSITORY_SOURCE") {
      if (!/^[0-9a-f]{40}$/u.test(claim?.subjectHead ?? "")
        || !/^[0-9a-f]{40}$/u.test(claim?.subjectTree ?? "")
        || source.sourceCommit !== claim.subjectHead
        || source.subjectHead !== claim.subjectHead
        || source.subjectTree !== claim.subjectTree
        || git(["rev-parse", `${claim.subjectHead}^{tree}`]) !== claim.subjectTree) return false;
    }
    const committedRecord = JSON.parse(git(["show", `${source.sourceCommit}:config/assurance/current-truth-v1.json`]));
    const committedSources = (committedRecord.evidenceSources ?? []).filter(({ id }) => id === source.id);
    const committedSource = committedSources[0];
    const factsBound = Array.isArray(source.covers)
      && Array.isArray(committedSource?.covers)
      && claim.factsCovered.every((factId) => {
        const entries = factRegistry.filter(({ factId: registered }) => registered === factId);
        if (entries.length !== 1 || !factRegistryEntryMatchesClaim(entries[0], claim)) return false;
        const historicalEvidence = entries[0].historicalEvidence ?? factId;
        return source.covers.includes(factId) && committedSource.covers.includes(historicalEvidence);
      });
    const readbackHashRequired = claim.factsCovered.some((factId) => factRegistry.find(({ factId: registered }) => registered === factId)?.requiresReadbackHash === true);
    const readbackHashBound = repositoryReadbackEvidenceBound({ claim, source, committedSource, required: readbackHashRequired });
    const parents = git(["show", "-s", "--format=%P", source.sourceCommit]).split(/\s+/u).filter(Boolean);
    const introducedHere = parents.every((parent) => {
      try {
        const parentRecord = JSON.parse(git(["show", `${parent}:config/assurance/current-truth-v1.json`]));
        return !(parentRecord.evidenceSources ?? []).some(({ id }) => id === source.id);
      } catch {
        return true;
      }
    });
    return committedRecord.timestamp === claim.observedAt
      && committedSources.length === 1
      && committedSource.mode === claim.evidenceMode
      && source.freshnessClass === claim.freshnessClass
      && source.authorityAllowed === claim.authorityAllowed
      && source.platform === claim.platform
      && source.provider === claim.provider
      && (claim.freshnessClass === "REPOSITORY_SOURCE" || committedRecord.liveProviderReadback === true)
      && factsBound
      && readbackHashBound
      && introducedHere;
  } catch {
    return false;
  }
}

const externalReceiptHashPattern = /^[0-9a-f]{64}$/u;
const externalReceiptRequiredFields = [
  "schemaVersion",
  "receiptId",
  "evidenceClass",
  "provider",
  "platform",
  "observedAt",
  "expiresAt",
  "receiptIssuer",
  "receiptSchema",
  "receiptHash",
  "payloadHash",
  "evidenceHash",
  "collectionCommand",
  "selfAttested"
];
const canonicalExternalEvidencePolicy = {
  schemaVersion: 1,
  contractId: "external-evidence-receipt-v1",
  schemaRef: "config/assurance/schemas-v1.json#/$defs/externalEvidenceReceiptContract",
  approvedEvidenceClasses: ["PROVIDER_CRITICAL", "SIGNED_ARTIFACT", "INSTALLED_DEVICE", "PHYSICAL_DEVICE", "PUBLIC_CANARY"],
  approvedReceiptIssuers: ["SYNTHETIC_ASSURANCE_FIXTURE_ISSUER"],
  approvedReceiptSchemas: ["synthetic-assurance-external-evidence-v1"],
  approvedCollectionCommands: {
    PROVIDER_CRITICAL: ["synthetic:provider-readback"],
    SIGNED_ARTIFACT: ["synthetic:signed-artifact-inspection"],
    INSTALLED_DEVICE: ["synthetic:installed-device-readback"],
    PHYSICAL_DEVICE: ["synthetic:physical-device-observation"],
    PUBLIC_CANARY: ["synthetic:public-canary-readback"]
  },
  selfAttestedEvidenceAllowed: false,
  currentProductionVerifier: "UNAVAILABLE_FAIL_CLOSED",
  trustedVerifierBoundary: "injected-receipt-issuer-verifier",
  hashAlgorithm: "sha256",
  classAndPlatformCrossoverAllowed: false
};

export function externalEvidenceReceiptHash(receipt) {
  const payload = structuredClone(receipt ?? {});
  delete payload.receiptHash;
  return sha256(stableValue(payload));
}

export function externalEvidenceBindingHash({ claim, source }) {
  return sha256(stableValue({
    evidenceSourceId: claim?.evidenceSourceId ?? null,
    evidenceClass: claim?.freshnessClass ?? null,
    provider: claim?.provider ?? source?.provider ?? null,
    platform: claim?.platform ?? null,
    observedAt: claim?.observedAt ?? null,
    expiresAt: claim?.expiresAt ?? null,
    factsCovered: claim?.factsCovered ?? null
  }));
}

export function verifyExternalEvidenceReceipt({ claim, source, receipt, policy, verifyIssuerReceipt, syntheticFixtureMode = false }) {
  const findings = [];
  const add = (id) => findings.push({ id, status: "BLOCKED_INTERNAL" });
  const missing = receipt && typeof receipt === "object" && !Array.isArray(receipt)
    ? externalReceiptRequiredFields.filter((field) => !Object.hasOwn(receipt, field))
    : externalReceiptRequiredFields;
  if (missing.length) return { ok: false, findings: [{ id: "ASSURANCE_EXTERNAL_EVIDENCE_RECEIPT_MISSING", status: "BLOCKED_INTERNAL", fields: missing }] };
  if (receipt.schemaVersion !== 1
    || typeof receipt.receiptId !== "string"
    || !/^[a-z0-9][a-z0-9._:-]{0,127}$/u.test(receipt.receiptId)
    || typeof receipt.evidenceClass !== "string"
    || typeof receipt.provider !== "string"
    || receipt.provider.length < 1
    || receipt.provider.length > 128
    || !claimPlatforms.has(receipt.platform)
    || !validInstant(receipt.observedAt)
    || !validInstant(receipt.expiresAt)
    || typeof receipt.receiptIssuer !== "string"
    || typeof receipt.receiptSchema !== "string"
    || typeof receipt.collectionCommand !== "string"
    || typeof receipt.selfAttested !== "boolean"
    || !sameStringSet(Object.keys(receipt), externalReceiptRequiredFields)) add("ASSURANCE_EXTERNAL_EVIDENCE_RECEIPT_MALFORMED");
  const approvedClasses = policy?.approvedEvidenceClasses;
  const approvedIssuers = policy?.approvedReceiptIssuers;
  const approvedSchemas = policy?.approvedReceiptSchemas;
  const approvedCommands = policy?.approvedCollectionCommands?.[claim?.freshnessClass];
  if (JSON.stringify(stableValue(policy)) !== JSON.stringify(stableValue(canonicalExternalEvidencePolicy))
    || !Array.isArray(approvedClasses)
    || !Array.isArray(approvedIssuers)
    || !Array.isArray(approvedSchemas)
    || !Array.isArray(approvedCommands)) add("ASSURANCE_EXTERNAL_EVIDENCE_POLICY_INVALID");
  if (syntheticFixtureMode !== true || policy?.currentProductionVerifier !== "UNAVAILABLE_FAIL_CLOSED") {
    add("ASSURANCE_EXTERNAL_EVIDENCE_SYNTHETIC_FIXTURE_BOUNDARY_INVALID");
  }
  if (!approvedClasses?.includes(receipt.evidenceClass) || receipt.evidenceClass !== claim?.freshnessClass) add("ASSURANCE_EXTERNAL_EVIDENCE_CLASS_MISMATCH");
  if (receipt.platform !== claim?.platform || receipt.platform !== source?.platform) add("ASSURANCE_EXTERNAL_EVIDENCE_PLATFORM_MISMATCH");
  const expectedProvider = claim?.provider ?? source?.provider;
  if (typeof expectedProvider !== "string" || !expectedProvider || receipt.provider !== expectedProvider || source?.provider !== expectedProvider) add("ASSURANCE_EXTERNAL_EVIDENCE_PROVIDER_MISMATCH");
  if (receipt.observedAt !== claim?.observedAt || receipt.observedAt !== source?.observedAt || receipt.expiresAt !== claim?.expiresAt) add("ASSURANCE_EXTERNAL_EVIDENCE_TIME_MISMATCH");
  if (!approvedIssuers?.includes(receipt.receiptIssuer)) add("ASSURANCE_EXTERNAL_EVIDENCE_ISSUER_UNAPPROVED");
  if (!approvedSchemas?.includes(receipt.receiptSchema)) add("ASSURANCE_EXTERNAL_EVIDENCE_SCHEMA_UNAPPROVED");
  if (!approvedCommands?.includes(receipt.collectionCommand)) add("ASSURANCE_EXTERNAL_EVIDENCE_COMMAND_UNAPPROVED");
  if (receipt.selfAttested !== false) add("ASSURANCE_EXTERNAL_EVIDENCE_SELF_ATTESTED_DENIED");
  if (!externalReceiptHashPattern.test(receipt.payloadHash) || receipt.payloadHash !== source?.payloadHash) add("ASSURANCE_EXTERNAL_EVIDENCE_PAYLOAD_HASH_MISMATCH");
  if (!externalReceiptHashPattern.test(receipt.evidenceHash) || receipt.evidenceHash !== externalEvidenceBindingHash({ claim, source })) add("ASSURANCE_EXTERNAL_EVIDENCE_BINDING_HASH_MISMATCH");
  if (!externalReceiptHashPattern.test(receipt.receiptHash) || receipt.receiptHash !== externalEvidenceReceiptHash(receipt)) add("ASSURANCE_EXTERNAL_EVIDENCE_RECEIPT_HASH_MISMATCH");
  let issuerVerified = false;
  try {
    issuerVerified = typeof verifyIssuerReceipt === "function"
      && verifyIssuerReceipt({ claim, source, receipt, canonicalReceiptHash: externalEvidenceReceiptHash(receipt) }) === true;
  } catch {
    issuerVerified = false;
  }
  if (!issuerVerified) add("ASSURANCE_EXTERNAL_EVIDENCE_ISSUER_VERIFICATION_FAILED");
  return { ok: findings.length === 0, findings };
}

export function evaluateFreshnessClaims({ claims, evidenceSources, freshness, now = new Date(), evidenceSourceVerifier = null, externalEvidenceVerifier = null, allowSyntheticFactRegistry = false, allowSyntheticExternalEvidence = false }) {
  const findings = [];
  const evaluated = [];
  const seenClaimIds = new Set();
  const sources = Array.isArray(evidenceSources) ? evidenceSources : [];
  const classRules = freshness?.classes;
  const factRegistry = freshness?.factRegistry;
  const evaluationTime = now instanceof Date ? now : new Date(now);
  if (!Array.isArray(claims)) findings.push(claimFinding("ASSURANCE_FRESHNESS_CLAIMS_MALFORMED"));
  if (!Array.isArray(evidenceSources)) findings.push(claimFinding("ASSURANCE_EVIDENCE_SOURCES_MALFORMED"));
  if (!classRules || typeof classRules !== "object" || Array.isArray(classRules)) {
    findings.push(claimFinding("ASSURANCE_FRESHNESS_CLASS_RULES_MALFORMED"));
  }
  if (!Array.isArray(factRegistry) || factRegistry.length === 0) {
    findings.push(claimFinding("ASSURANCE_FRESHNESS_FACT_REGISTRY_MALFORMED"));
  } else {
    if (!allowSyntheticFactRegistry
      && JSON.stringify(stableValue(factRegistry)) !== JSON.stringify(stableValue(canonicalFactRegistry))) {
      findings.push(claimFinding("ASSURANCE_FRESHNESS_FACT_REGISTRY_POLICY_MISMATCH"));
    }
    const seenFactIds = new Set();
    for (const entry of factRegistry) {
      const factId = typeof entry?.factId === "string" ? entry.factId : "";
      const classPolicy = claimClassPolicy[entry?.freshnessClass];
      const malformed = !factId
        || seenFactIds.has(factId)
        || !classPolicy
        || entry.authorityAllowed !== classPolicy.authorityAllowed
        || !classPolicy.allowedPlatforms.includes(entry.platform)
        || typeof entry.provider !== "string"
        || !entry.provider
        || (entry.requiresReadbackHash !== undefined && entry.requiresReadbackHash !== true)
        || (["REPOSITORY_SOURCE", "REPOSITORY_TASK_LEASE"].includes(entry.freshnessClass) && entry.provider !== "NONE")
        || (!["REPOSITORY_SOURCE", "REPOSITORY_TASK_LEASE"].includes(entry.freshnessClass) && entry.provider === "NONE");
      if (malformed) findings.push(claimFinding("ASSURANCE_FRESHNESS_FACT_REGISTRY_ENTRY_INVALID", null, { factId: factId || null }));
      seenFactIds.add(factId);
    }
  }
  if (freshness?.defaultHours !== 24
    || freshness?.providerCriticalHours !== 8
    || freshness?.clock !== "UTC"
    || freshness?.failClosed !== true
    || !sameStringSet(Object.keys(classRules ?? {}), Object.keys(claimClassPolicy))) {
    findings.push(claimFinding("ASSURANCE_FRESHNESS_POLICY_MISMATCH"));
  }
  for (const [freshnessClass, expected] of Object.entries(claimClassPolicy)) {
    const rule = classRules?.[freshnessClass];
    if (!rule
      || rule.maximumHours !== expected.maximumHours
      || rule.authorityAllowed !== expected.authorityAllowed
      || !sameStringSet(rule.allowedEvidenceModes, expected.evidenceModes)
      || (rule.requiresCommittedEvidence === true) !== expected.requiresCommittedEvidence) {
      findings.push(claimFinding("ASSURANCE_FRESHNESS_CLASS_RULE_MISMATCH", null, { freshnessClass }));
    }
  }
  if (!Number.isFinite(evaluationTime.valueOf())) findings.push(claimFinding("ASSURANCE_FRESHNESS_EVALUATION_TIME_MALFORMED"));

  for (const claim of Array.isArray(claims) ? claims : []) {
    const claimId = typeof claim?.id === "string" ? claim.id : null;
    const missing = claim && typeof claim === "object" && !Array.isArray(claim)
      ? claimRequiredFields.filter((field) => !Object.hasOwn(claim, field))
      : claimRequiredFields;
    if (missing.length) {
      findings.push(claimFinding("ASSURANCE_FRESHNESS_CLAIM_REQUIRED_FIELD_MISSING", claimId, { fields: missing }));
      continue;
    }
    if (seenClaimIds.has(claimId)) {
      findings.push(claimFinding("ASSURANCE_FRESHNESS_CLAIM_DUPLICATE", claimId));
      continue;
    }
    seenClaimIds.add(claimId);
    const rule = classRules?.[claim.freshnessClass];
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      findings.push(claimFinding("ASSURANCE_FRESHNESS_CLASS_UNKNOWN", claimId, { freshnessClass: claim.freshnessClass }));
      continue;
    }
    const observedAt = new Date(claim.observedAt);
    const expiresAt = new Date(claim.expiresAt);
    if (!validInstant(claim.observedAt) || !validInstant(claim.expiresAt)) {
      findings.push(claimFinding("ASSURANCE_FRESHNESS_CLAIM_TIME_MALFORMED", claimId));
      continue;
    }
    if (claim.freshnessClass === "REPOSITORY_SOURCE"
      && (!/^[0-9a-f]{40}$/u.test(claim.subjectHead ?? "") || !/^[0-9a-f]{40}$/u.test(claim.subjectTree ?? ""))) {
      findings.push(claimFinding("ASSURANCE_FRESHNESS_REPOSITORY_SUBJECT_MISSING", claimId));
    }
    if (claim.freshnessClass === "REPOSITORY_TASK_LEASE"
      && (typeof claim.leaseId !== "string" || !claim.leaseId || !sha256Pattern.test(claim.leaseHash ?? ""))) {
      findings.push(claimFinding("ASSURANCE_FRESHNESS_TASK_LEASE_SUBJECT_MISSING", claimId));
    }
    if (observedAt > evaluationTime) findings.push(claimFinding("ASSURANCE_FRESHNESS_CLAIM_OBSERVED_IN_FUTURE", claimId));
    const maximumHours = Number(rule.maximumHours);
    const maximumExpiry = Number.isFinite(maximumHours)
      ? new Date(observedAt.valueOf() + maximumHours * 60 * 60 * 1000)
      : null;
    if (!maximumExpiry || expiresAt.valueOf() !== maximumExpiry.valueOf()) {
      findings.push(claimFinding("ASSURANCE_FRESHNESS_CLAIM_EXPIRY_INVALID", claimId, {
        expected: maximumExpiry?.toISOString() ?? null,
        recorded: claim.expiresAt
      }));
    }
    if (!Array.isArray(rule.allowedEvidenceModes) || !rule.allowedEvidenceModes.includes(claim.evidenceMode)) {
      findings.push(claimFinding("ASSURANCE_FRESHNESS_CLASS_CROSSOVER", claimId, {
        freshnessClass: claim.freshnessClass,
        evidenceMode: claim.evidenceMode
      }));
    }
    if (claim.authorityAllowed !== rule.authorityAllowed) {
      findings.push(claimFinding("ASSURANCE_FRESHNESS_AUTHORITY_MISMATCH", claimId));
    }
    if (!claimPlatforms.has(claim.platform) || !expectedPlatformAllowed(rule, claim.freshnessClass, claim.platform)) {
      findings.push(claimFinding("ASSURANCE_FRESHNESS_PLATFORM_MALFORMED", claimId));
    }
    if (!Array.isArray(claim.factsCovered) || claim.factsCovered.length === 0 || claim.factsCovered.some((fact) => typeof fact !== "string" || !fact.trim())) {
      findings.push(claimFinding("ASSURANCE_FRESHNESS_FACTS_MALFORMED", claimId));
    } else {
      for (const factId of claim.factsCovered) {
        const registered = Array.isArray(factRegistry) ? factRegistry.filter(({ factId: candidate }) => candidate === factId) : [];
        if (registered.length !== 1) {
          findings.push(claimFinding("ASSURANCE_FRESHNESS_FACT_UNKNOWN", claimId, { factId }));
        } else if (!factRegistryEntryMatchesClaim(registered[0], claim)) {
          findings.push(claimFinding("ASSURANCE_FRESHNESS_FACT_BINDING_MISMATCH", claimId, { factId }));
        }
      }
    }
    const matchingSources = sources.filter(({ id }) => id === claim.evidenceSourceId);
    if (matchingSources.length !== 1) {
      findings.push(claimFinding("ASSURANCE_FRESHNESS_EVIDENCE_SOURCE_UNRESOLVED", claimId));
    } else {
      const [source] = matchingSources;
      const sourceFactsBound = Array.isArray(source.covers)
        && Array.isArray(claim.factsCovered)
        && claim.factsCovered.every((fact) => source.covers.includes(fact));
      if (source.observedAt !== claim.observedAt
        || source.mode !== claim.evidenceMode
        || source.freshnessClass !== claim.freshnessClass
        || source.authorityAllowed !== claim.authorityAllowed
        || source.platform !== claim.platform
        || source.provider !== claim.provider
        || (claim.freshnessClass === "REPOSITORY_SOURCE" && (source.subjectHead !== claim.subjectHead || source.subjectTree !== claim.subjectTree))
        || (claim.freshnessClass === "REPOSITORY_TASK_LEASE" && (source.leaseId !== claim.leaseId || source.leaseHash !== claim.leaseHash))
        || !sourceFactsBound) {
        findings.push(claimFinding("ASSURANCE_FRESHNESS_EVIDENCE_SOURCE_BINDING_MISMATCH", claimId));
      }
      if (rule.requiresCommittedEvidence === true) {
        let verified = false;
        try {
          verified = typeof evidenceSourceVerifier === "function" && evidenceSourceVerifier({ claim, source }) === true;
        } catch {
          verified = false;
        }
        if (!verified) findings.push(claimFinding("ASSURANCE_FRESHNESS_EVIDENCE_PROVENANCE_UNVERIFIED", claimId));
      }
      const derivedStatus = evaluationTime <= expiresAt ? "CURRENT" : "STALE_BLOCKED";
      if (derivedStatus === "CURRENT" && claimClassPolicy[claim.freshnessClass]?.requiresExternalReceipt === true) {
        let externalResult = { ok: false, findings: [{ id: "ASSURANCE_EXTERNAL_EVIDENCE_RECEIPT_MISSING", status: "BLOCKED_INTERNAL" }] };
        try {
          const receipt = typeof externalEvidenceVerifier?.receiptFor === "function"
            ? externalEvidenceVerifier.receiptFor({ claim, source })
            : null;
          externalResult = verifyExternalEvidenceReceipt({
            claim,
            source,
            receipt,
            policy: externalEvidenceVerifier?.policy,
            verifyIssuerReceipt: externalEvidenceVerifier?.verifyIssuerReceipt,
            syntheticFixtureMode: allowSyntheticExternalEvidence
          });
        } catch {
          externalResult = { ok: false, findings: [{ id: "ASSURANCE_EXTERNAL_EVIDENCE_RECEIPT_MALFORMED", status: "BLOCKED_INTERNAL" }] };
        }
        if (!externalResult.ok) findings.push(claimFinding("ASSURANCE_FRESHNESS_EXTERNAL_RECEIPT_UNVERIFIED", claimId, {
          receiptFindings: externalResult.findings.map(({ id }) => id)
        }));
      }
    }
    const derivedStatus = evaluationTime <= expiresAt ? "CURRENT" : "STALE_BLOCKED";
    if (!claimStatuses.has(claim.status) || claim.status !== derivedStatus) {
      findings.push(claimFinding("ASSURANCE_FRESHNESS_CLAIM_STATUS_MISMATCH", claimId, {
        expected: derivedStatus,
        recorded: claim.status
      }));
    }
    evaluated.push({ ...claim, derivedStatus });
  }

  const invalidClaimIds = new Set(findings.map(({ claimId }) => claimId).filter(Boolean));
  const usableClaims = evaluated.filter(({ id }) => !invalidClaimIds.has(id));
  const currentClaims = findings.length === 0
    ? usableClaims.filter(({ derivedStatus }) => derivedStatus === "CURRENT")
    : [];
  const blockedClaims = usableClaims.filter(({ derivedStatus }) => derivedStatus !== "CURRENT");
  return {
    ok: findings.length === 0,
    findings,
    claims: evaluated,
    currentClaims,
    blockedClaims,
    liveProviderReadback: currentClaims.some(({ freshnessClass }) => freshnessClass === "PROVIDER_CRITICAL")
  };
}

function expectedPlatformAllowed(_rule, freshnessClass, platform) {
  return claimClassPolicy[freshnessClass]?.allowedPlatforms.includes(platform) === true;
}

export function evaluateTaskFreshness(claimEvaluation, requirements) {
  const blockers = [];
  if (!Array.isArray(requirements) || requirements.length === 0) {
    return {
      eligible: false,
      blockers: [{ id: "ASSURANCE_REQUIRED_FRESHNESS_SCOPE_MISSING", status: "BLOCKED_INTERNAL" }]
    };
  }
  for (const requirement of requirements) {
    const requiredFacts = requirement?.requiredFacts;
    const scoped = requirement
      && typeof requirement === "object"
      && !Array.isArray(requirement)
      && claimClassPolicy[requirement.freshnessClass]
      && claimPlatforms.has(requirement.platform)
      && typeof requirement.evidenceSourceId === "string"
      && requirement.evidenceSourceId.length > 0
      && requirement.authorityAllowed === claimClassPolicy[requirement.freshnessClass].authorityAllowed
      && Array.isArray(requiredFacts)
      && requiredFacts.length > 0
      && requiredFacts.every((fact) => typeof fact === "string" && fact.length > 0)
      && (requirement.freshnessClass !== "REPOSITORY_SOURCE"
        || (/^[0-9a-f]{40}$/u.test(requirement.subjectHead ?? "") && /^[0-9a-f]{40}$/u.test(requirement.subjectTree ?? "")))
      && (requirement.freshnessClass !== "REPOSITORY_TASK_LEASE"
        || (typeof requirement.leaseId === "string" && requirement.leaseId.length > 0 && sha256Pattern.test(requirement.leaseHash ?? "")));
    if (!scoped) {
      blockers.push({ id: "ASSURANCE_REQUIRED_FRESHNESS_SCOPE_MALFORMED", status: "BLOCKED_INTERNAL" });
      continue;
    }
    const matched = (claimEvaluation?.currentClaims ?? []).some((claim) => claim.freshnessClass === requirement?.freshnessClass
      && claim.platform === requirement.platform
      && claim.evidenceSourceId === requirement.evidenceSourceId
      && claim.authorityAllowed === requirement.authorityAllowed
      && (requirement.freshnessClass !== "REPOSITORY_SOURCE"
        || (claim.subjectHead === requirement.subjectHead && claim.subjectTree === requirement.subjectTree))
      && (requirement.freshnessClass !== "REPOSITORY_TASK_LEASE"
        || (claim.leaseId === requirement.leaseId && claim.leaseHash === requirement.leaseHash))
      && requiredFacts.every((fact) => claim.factsCovered.includes(fact)));
    if (!matched) blockers.push({
      id: "ASSURANCE_REQUIRED_FRESHNESS_CLASS_BLOCKED",
      status: "BLOCKED_INTERNAL",
      freshnessClass: requirement?.freshnessClass ?? null,
      platform: requirement?.platform ?? null,
      evidenceSourceId: requirement?.evidenceSourceId ?? null
    });
  }
  return { eligible: Boolean(claimEvaluation?.ok) && blockers.length === 0, blockers };
}

const gitShaPattern = /^[0-9a-f]{40}$/u;
const forbiddenGitBranchCharacters = /[\u0000-\u0020~^:?*[\]\\\u007f]/u;

export function isValidGitBranchName(value) {
  return typeof value === "string"
    && value.length > 0
    && value !== "@"
    && value !== "HEAD"
    && !value.startsWith("-")
    && !value.startsWith("/")
    && !value.endsWith("/")
    && !value.endsWith(".")
    && !value.includes("..")
    && !value.includes("//")
    && !value.includes("@{")
    && value.split("/").every((component) => !component.startsWith(".") && !component.endsWith(".lock"))
    && !forbiddenGitBranchCharacters.test(value);
}

export function implementationRemoteRef(branch) {
  return isValidGitBranchName(branch) ? `refs/remotes/origin/${branch}` : null;
}

function sortStable(values) {
  return [...values].sort((left, right) => {
    const leftJson = stableJson(left);
    const rightJson = stableJson(right);
    return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
  });
}

function normalizeImplementationInventory(value, subject, findings) {
  const entries = Array.isArray(value) ? value : [];
  const normalized = [];
  const seenNumbers = new Set();
  const seenBranches = new Set();

  if (!Array.isArray(value)) {
    findings.push({
      id: "ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_LIST_MALFORMED",
      status: "BLOCKED_INTERNAL",
      subject
    });
  }

  for (const entry of entries) {
    const numberValid = Number.isInteger(entry?.number) && entry.number > 0;
    const branchValid = isValidGitBranchName(entry?.branch);
    const headValid = typeof entry?.head === "string" && gitShaPattern.test(entry.head);
    const stateValid = typeof entry?.state === "string"
      && entry.state.length > 0
      && entry.state === entry.state.trim();

    if (!numberValid || !branchValid || !headValid || !stateValid) {
      findings.push({
        id: "ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_ENTRY_MALFORMED",
        status: "BLOCKED_INTERNAL",
        number: numberValid ? entry.number : null,
        subject
      });
    }
    if (numberValid && seenNumbers.has(entry.number)) {
      findings.push({
        id: "ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_DUPLICATE",
        status: "BLOCKED_INTERNAL",
        field: "number",
        subject,
        value: entry.number
      });
    }
    if (branchValid && seenBranches.has(entry.branch)) {
      findings.push({
        id: "ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_DUPLICATE",
        status: "BLOCKED_INTERNAL",
        field: "branch",
        subject,
        value: entry.branch
      });
    }
    if (numberValid) seenNumbers.add(entry.number);
    if (branchValid) seenBranches.add(entry.branch);
    if (numberValid && branchValid && headValid && stateValid) {
      normalized.push({
        branch: entry.branch,
        head: entry.head,
        number: entry.number,
        state: entry.state
      });
    }
  }

  return sortStable(normalized);
}

export function verifyProviderImplementationSnapshot(recordEntries, snapshotEntries, acceptedBaseSynchronizations = {}) {
  const findings = [];
  const record = normalizeImplementationInventory(recordEntries, "record", findings);
  const snapshot = normalizeImplementationInventory(snapshotEntries, "snapshot", findings);
  const recordByNumber = new Map(record.map((entry) => [entry.number, entry]));
  const snapshotByNumber = new Map(snapshot.map((entry) => [entry.number, entry]));

  for (const expected of record) {
    const observed = snapshotByNumber.get(expected.number);
    if (!observed) {
      findings.push({
        id: "ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_MISSING",
        status: "BLOCKED_INTERNAL",
        branch: expected.branch,
        number: expected.number
      });
      continue;
    }
    const acceptedSynchronization = acceptedBaseSynchronizations?.[expected.number];
    const synchronizedHeadAccepted = acceptedSynchronization?.ok === true
      && acceptedSynchronization.classification === "BASE_SYNCHRONIZED_IMPLEMENTATION_BRANCH"
      && acceptedSynchronization.sourceHead === expected.head
      && acceptedSynchronization.synchronizedHead === observed.head;
    const mismatchedFields = ["branch", "state"].filter((field) => expected[field] !== observed[field]);
    if (expected.head !== observed.head && !synchronizedHeadAccepted) mismatchedFields.push("head");
    if (mismatchedFields.length) {
      findings.push({
        id: "ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_MISMATCH",
        status: "BLOCKED_INTERNAL",
        fields: mismatchedFields,
        number: expected.number,
        observed,
        recorded: expected
      });
    }
  }

  for (const observed of snapshot) {
    if (!recordByNumber.has(observed.number)) {
      findings.push({
        id: "ASSURANCE_CURRENT_TRUTH_PROVIDER_IMPLEMENTATION_EXTRA",
        status: "BLOCKED_INTERNAL",
        branch: observed.branch,
        number: observed.number
      });
    }
  }

  const sortedFindings = sortStable(findings);
  return {
    ok: sortedFindings.length === 0,
    findings: sortedFindings,
    record,
    snapshot
  };
}

function baseSynchronizationFinding(id, details = {}) {
  return { id, status: "BLOCKED_INTERNAL", ...details };
}

export function baseSynchronizationReviewReceiptHash(manifest) {
  const receipt = structuredClone(manifest ?? {});
  delete receipt.reviewReceiptHash;
  delete receipt.reviewRefHead;
  delete receipt.reviewRefTree;
  return sha256(stableValue(receipt));
}

export function verifyCurrentTruthBindingSynchronization({ sourceHead, synchronizedHead, synchronizedTree, currentMain, parents, commitDistance, changedPaths }) {
  const findings = [];
  const allowedPaths = ["CURRENT_STATE.md", "NEXT_TASK.md", "config/assurance/current-truth-v1.json"];
  if (!gitShaPattern.test(sourceHead ?? "")
    || !gitShaPattern.test(synchronizedHead ?? "")
    || !gitShaPattern.test(synchronizedTree ?? "")
    || !gitShaPattern.test(currentMain ?? "")) findings.push(baseSynchronizationFinding("ASSURANCE_CURRENT_TRUTH_BINDING_IDENTITY_MALFORMED"));
  if (commitDistance !== 1) findings.push(baseSynchronizationFinding("ASSURANCE_CURRENT_TRUTH_BINDING_DISTANCE_INVALID"));
  if (!Array.isArray(parents) || parents.length !== 1 || parents[0] !== sourceHead) {
    findings.push(baseSynchronizationFinding("ASSURANCE_CURRENT_TRUTH_BINDING_PARENT_INVALID"));
  }
  const normalizedPaths = Array.isArray(changedPaths) ? [...new Set(changedPaths)].sort() : null;
  if (!normalizedPaths || stableJson(normalizedPaths) !== stableJson(allowedPaths)) {
    findings.push(baseSynchronizationFinding("ASSURANCE_CURRENT_TRUTH_BINDING_SCOPE_INVALID", { changedPaths: normalizedPaths }));
  }
  const sortedFindings = sortStable(findings);
  return {
    ok: sortedFindings.length === 0,
    classification: "CURRENT_TRUTH_BINDING_COMMIT",
    sourceHead,
    synchronizedHead,
    synchronizedTree,
    currentMain,
    findings: sortedFindings
  };
}

export function verifyBaseSynchronizedImplementationHead({
  number,
  branch,
  sourceHead,
  synchronizedHead,
  currentMain,
  sourceIsAncestor,
  commitDistance,
  parents,
  observedTree,
  canonicalTree,
  mergeConflict,
  reviewedSourceDeltaHash,
  synchronizedSourceDeltaHash,
  reviewedChangedFileHash,
  synchronizedChangedFileHash,
  reviewedChangedPaths,
  synchronizedChangedPaths,
  providerHead,
  reviewEvidence,
  minimumReviewEvidence = 1,
  reviewFreshnessHours = 24,
  evaluationTime = new Date()
}) {
  const findings = [];
  const shaFields = { sourceHead, synchronizedHead, currentMain, observedTree, canonicalTree };
  for (const [field, value] of Object.entries(shaFields)) {
    if (typeof value !== "string" || !gitShaPattern.test(value)) {
      findings.push(baseSynchronizationFinding("ASSURANCE_BASE_SYNC_GIT_IDENTITY_MALFORMED", { field, value: value ?? null }));
    }
  }

  if (sourceIsAncestor !== true) findings.push(baseSynchronizationFinding("ASSURANCE_BASE_SYNC_SOURCE_NOT_ANCESTOR"));
  if (commitDistance !== 1) findings.push(baseSynchronizationFinding("ASSURANCE_BASE_SYNC_COMMIT_DISTANCE_INVALID", { actual: commitDistance ?? null, expected: 1 }));
  if (!Array.isArray(parents) || parents.length !== 2) {
    findings.push(baseSynchronizationFinding("ASSURANCE_BASE_SYNC_PARENT_SHAPE_INVALID", { parents: Array.isArray(parents) ? parents : null }));
  } else {
    if (parents[0] !== sourceHead) findings.push(baseSynchronizationFinding("ASSURANCE_BASE_SYNC_FIRST_PARENT_INVALID", { actual: parents[0], expected: sourceHead }));
    if (parents[1] !== currentMain) findings.push(baseSynchronizationFinding("ASSURANCE_BASE_SYNC_SECOND_PARENT_INVALID", { actual: parents[1], expected: currentMain }));
  }
  if (mergeConflict !== false) findings.push(baseSynchronizationFinding("ASSURANCE_BASE_SYNC_CANONICAL_MERGE_CONFLICT"));
  if (observedTree !== canonicalTree) findings.push(baseSynchronizationFinding("ASSURANCE_BASE_SYNC_TREE_MISMATCH", { canonicalTree, observedTree }));
  if (!/^[0-9a-f]{64}$/u.test(reviewedSourceDeltaHash ?? "") || reviewedSourceDeltaHash !== synchronizedSourceDeltaHash) {
    findings.push(baseSynchronizationFinding("ASSURANCE_BASE_SYNC_SOURCE_DELTA_MISMATCH", { reviewedSourceDeltaHash: reviewedSourceDeltaHash ?? null, synchronizedSourceDeltaHash: synchronizedSourceDeltaHash ?? null }));
  }
  if (!/^[0-9a-f]{64}$/u.test(reviewedChangedFileHash ?? "") || reviewedChangedFileHash !== synchronizedChangedFileHash) {
    findings.push(baseSynchronizationFinding("ASSURANCE_BASE_SYNC_CHANGED_FILE_HASH_MISMATCH", { reviewedChangedFileHash: reviewedChangedFileHash ?? null, synchronizedChangedFileHash: synchronizedChangedFileHash ?? null }));
  }
  const reviewedPaths = Array.isArray(reviewedChangedPaths) ? [...reviewedChangedPaths].sort() : null;
  const synchronizedPaths = Array.isArray(synchronizedChangedPaths) ? [...synchronizedChangedPaths].sort() : null;
  if (!reviewedPaths || !synchronizedPaths || stableJson(reviewedPaths) !== stableJson(synchronizedPaths)) {
    findings.push(baseSynchronizationFinding("ASSURANCE_BASE_SYNC_CHANGED_PATHS_MISMATCH", { reviewedChangedPaths: reviewedPaths, synchronizedChangedPaths: synchronizedPaths }));
  }
  if (providerHead !== synchronizedHead) findings.push(baseSynchronizationFinding("ASSURANCE_BASE_SYNC_PROVIDER_HEAD_MISMATCH", { providerHead: providerHead ?? null, synchronizedHead }));

  const evidence = Array.isArray(reviewEvidence) ? reviewEvidence : [];
  const evaluatedAt = new Date(evaluationTime);
  const evaluationTimeValid = Number.isFinite(evaluatedAt.valueOf());
  if (!evaluationTimeValid) findings.push(baseSynchronizationFinding("ASSURANCE_BASE_SYNC_EVALUATION_TIME_INVALID"));
  const matchingEvidence = evidence.filter((manifest) => manifest
    && manifest.classification === "BASE_SYNCHRONIZED_IMPLEMENTATION_BRANCH"
    && manifest.implementationPrNumber === number
    && manifest.implementationBranch === branch
    && manifest.immutableSourceHead === sourceHead
    && manifest.synchronizedBranchHead === synchronizedHead
    && manifest.currentBase === currentMain
    && manifest.synchronizedTree === observedTree
    && manifest.canonicalSyntheticTree === canonicalTree
    && manifest.sourceDeltaHash === synchronizedSourceDeltaHash
    && manifest.changedFileHash === synchronizedChangedFileHash
    && manifest.scopeStatus === "pass"
    && manifest.reviewOnly === true
    && manifest.mergePermitted === false
    && manifest.criticalFindingCounts?.P0 === 0
    && manifest.criticalFindingCounts?.P1 === 0
    && manifest.reviewProvider === "INDEPENDENT_REPOSITORY_REVIEW"
    && typeof manifest.reviewerId === "string"
    && manifest.reviewerId.length > 0
    && manifest.reviewedCommit === synchronizedHead
    && manifest.reviewedTree === observedTree
    && /^[0-9a-f]{64}$/u.test(manifest.reviewReceiptHash ?? "")
    && manifest.reviewReceiptHash === baseSynchronizationReviewReceiptHash(manifest)
    && typeof manifest.reviewRef === "string"
    && gitShaPattern.test(manifest.reviewRefHead ?? "")
    && gitShaPattern.test(manifest.reviewRefTree ?? "")
    && Number.isFinite(new Date(manifest.reviewTimestamp).valueOf())
    && evaluationTimeValid
    && new Date(manifest.reviewTimestamp) <= new Date(evaluatedAt.valueOf() + 5 * 60000)
    && new Date(manifest.reviewTimestamp) >= new Date(evaluatedAt.valueOf() - reviewFreshnessHours * 3600000));
  if (matchingEvidence.length < minimumReviewEvidence) {
    findings.push(baseSynchronizationFinding("ASSURANCE_BASE_SYNC_REVIEW_EVIDENCE_MISSING_OR_STALE", { actual: matchingEvidence.length, expectedMinimum: minimumReviewEvidence }));
  }

  const sortedFindings = sortStable(findings);
  return {
    ok: sortedFindings.length === 0,
    classification: "BASE_SYNCHRONIZED_IMPLEMENTATION_BRANCH",
    sourceHead,
    synchronizedHead,
    synchronizedTree: observedTree,
    currentMain,
    matchingReviewEvidence: sortStable(matchingEvidence.map(({ reviewId, reviewProvider, reviewerId, reviewReceiptHash, reviewRef, reviewRefHead, reviewRefTree }) => ({
      reviewId,
      reviewProvider,
      reviewerId,
      reviewReceiptHash,
      reviewRef,
      reviewRefHead,
      reviewRefTree
    }))),
    findings: sortedFindings
  };
}

export function resolveFiniteTaskCurrentTruthCandidateLease({
  baseLease,
  effectiveReservationResolution,
  observedHead,
  observedTree,
  remoteMain,
  implementationPr,
  implementationBranch
} = {}) {
  const trusted = finiteTaskEffectiveReservationAuthorityValid(effectiveReservationResolution);
  const identityMatches = trusted
    && effectiveReservationResolution?.baseLeaseHash === (baseLease ? sha256(baseLease) : null)
    && effectiveReservationResolution?.candidateHead === observedHead
    && effectiveReservationResolution?.candidateTree === observedTree
    && effectiveReservationResolution?.effectiveLease?.implementationPr === implementationPr
    && effectiveReservationResolution?.effectiveLease?.implementationBranch === implementationBranch;
  const applicableTrustedOverlay = identityMatches
    && effectiveReservationResolution?.status === "AMENDED_WITH_TEST_ADAPTATION";
  const overlayScopeBaseMismatch = applicableTrustedOverlay
    && effectiveReservationResolution.scopeBase !== remoteMain;
  return {
    applicableTrustedOverlay,
    overlayScopeBaseMismatch,
    resolvedLease: identityMatches && !overlayScopeBaseMismatch
      ? effectiveReservationResolution.effectiveLease
      : null
  };
}

export function verifyCurrentTruthHeadBindings({
  openImplementationPrs,
  observedRefs,
  finiteTaskLeases = null,
  branch,
  head,
  remoteMain,
  explicitBranch = "",
  explicitHead = "",
  effectiveReservationResolution = null,
  effectiveReservationObservation = null,
  finiteTaskPostMergeTransition = null,
  baseSynchronizations = {},
  minimumBaseSynchronizationReviewEvidence = 1,
  baseSynchronizationReviewFreshnessHours = 24,
  evaluationTime = new Date()
}) {
  const findings = [];
  const bindings = [];
  const entries = Array.isArray(openImplementationPrs) ? openImplementationPrs : [];
  const observations = observedRefs && typeof observedRefs === "object" ? observedRefs : {};
  const seenNumbers = new Set();
  const seenBranches = new Set();

  if (!Array.isArray(openImplementationPrs)) {
    findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_LIST_MALFORMED", status: "BLOCKED_INTERNAL" });
  }

  for (const entry of entries) {
    const numberValid = Number.isInteger(entry?.number) && entry.number > 0;
    const branchValid = isValidGitBranchName(entry?.branch);
    const headValid = typeof entry?.head === "string" && gitShaPattern.test(entry.head);

    if (!numberValid) {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_PR_MALFORMED", status: "BLOCKED_INTERNAL", number: entry?.number ?? null });
    } else if (seenNumbers.has(entry.number)) {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_DUPLICATE", status: "BLOCKED_INTERNAL", field: "number", value: entry.number });
    } else {
      seenNumbers.add(entry.number);
    }

    if (!branchValid) {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_BRANCH_MALFORMED", status: "BLOCKED_INTERNAL", branch: entry?.branch ?? null, number: numberValid ? entry.number : null });
    } else if (seenBranches.has(entry.branch)) {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_DUPLICATE", status: "BLOCKED_INTERNAL", field: "branch", value: entry.branch });
    } else {
      seenBranches.add(entry.branch);
    }

    if (!headValid) {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_HEAD_MALFORMED", status: "BLOCKED_INTERNAL", head: entry?.head ?? null, number: numberValid ? entry.number : null });
    }

    if (!branchValid) continue;
    const ref = implementationRemoteRef(entry.branch);
    const observed = Object.hasOwn(observations, ref) ? observations[ref] : null;
    const observedValid = typeof observed === "string" && gitShaPattern.test(observed);
    const baseLease = finiteTaskLeaseFor(finiteTaskLeases, {
      implementationPr: entry.number,
      implementationBranch: entry.branch,
      featureId: entry.featureId
    });
    const postMergeSource = (observed === null || observed === undefined || observed === "")
      ? verifiedFiniteTaskClosedSource({
          lease: baseLease,
          liveObservation: effectiveReservationObservation,
          postMergeTransition: finiteTaskPostMergeTransition
        })
      : null;
    let classification = postMergeSource
      ? "FINITE_TASK_VERIFIED_POST_MERGE_SOURCE"
      : observed === entry?.head ? "EXACT_SOURCE_HEAD" : "UNVERIFIED_HEAD";
    let synchronization = null;
    let finiteLeaseCandidate = null;
    if (observedValid && headValid && observed !== entry.head) {
      const observedTree = finiteTaskGitValue(["rev-parse", `${observed}^{tree}`]);
      const { resolvedLease, overlayScopeBaseMismatch } = resolveFiniteTaskCurrentTruthCandidateLease({
        baseLease,
        effectiveReservationResolution,
        observedHead: observed,
        observedTree,
        remoteMain,
        implementationPr: entry.number,
        implementationBranch: entry.branch
      });
      const lease = overlayScopeBaseMismatch ? null : resolvedLease ?? baseLease;
      if (overlayScopeBaseMismatch) finiteLeaseCandidate = { ok: false, findings: ["FINITE_TASK_TEST_ADAPTATION_CANDIDATE_SCOPE_MISMATCH"] };
      if (lease) {
        const isAncestor = (ancestor, descendant) => {
          try { git(["merge-base", "--is-ancestor", ancestor, descendant]); return true; } catch { return false; }
        };
        const candidateRange = `${remoteMain}...${observed}`;
        const changedPaths = git(["diff", "--name-only", candidateRange]).split(/\r?\n/gu).filter(Boolean).sort();
        const changedLines = git(["diff", "--numstat", candidateRange]).split(/\r?\n/gu).filter(Boolean)
          .reduce((total, line) => total + line.split("\t").slice(0, 2)
            .reduce((sum, value) => sum + (/^\d+$/u.test(value) ? Number(value) : 0), 0), 0);
        finiteLeaseCandidate = evaluateFiniteTaskCandidate({
          lease,
          registry: finiteTaskLeases,
          candidate: {
            pr: entry.number,
            branch: entry.branch,
            prState: "open",
            head: observed,
            tree: observedTree,
            seedTree: git(["rev-parse", `${lease.admittedSeedHead}^{tree}`]),
            seedIsAncestor: isAncestor(lease.admittedSeedHead, observed),
            baseIsAncestor: isAncestor(lease.admittedBase, observed),
            changedPaths,
            changedLines,
            scopeBase: remoteMain,
            findings: lease.taskState === "BLOCKED_PRODUCT_FINDING" ? { P0: 0, P1: 1, launchImpactingP2: 0 } : { P0: 0, P1: 0, launchImpactingP2: 0 }
          },
          effectiveReservationResolution: resolvedLease ? effectiveReservationResolution : null
        });
        if (finiteLeaseCandidate.ok) classification = "FINITE_TASK_LEASE_CANDIDATE";
      }
      if (!finiteLeaseCandidate?.ok) {
        if (overlayScopeBaseMismatch) {
          synchronization = { ok: false, findings: [{ id: "ASSURANCE_CURRENT_TRUTH_FINITE_TASK_SCOPE_BASE_MISMATCH", status: "BLOCKED_INTERNAL" }] };
        } else {
          const inspection = baseSynchronizations?.[ref] ?? {};
          const truthBinding = inspection.currentTruthBinding
            ? verifyCurrentTruthBindingSynchronization({
              ...inspection.currentTruthBinding,
              sourceHead: entry.head,
              synchronizedHead: observed,
              currentMain: remoteMain
            })
            : null;
          synchronization = truthBinding?.ok ? truthBinding : verifyBaseSynchronizedImplementationHead({
            ...inspection,
            number: entry.number,
            branch: entry.branch,
            sourceHead: entry.head,
            synchronizedHead: observed,
            currentMain: remoteMain,
            minimumReviewEvidence: minimumBaseSynchronizationReviewEvidence,
            reviewFreshnessHours: baseSynchronizationReviewFreshnessHours,
            evaluationTime
          });
        }
        if (synchronization.ok) classification = synchronization.classification;
      }
    }
    bindings.push({
      branch: entry.branch,
      classification,
      number: numberValid ? entry.number : null,
      observedHead: postMergeSource?.head ?? observed,
      remoteRefHead: observed,
      recordedHead: entry?.head ?? null,
      ref,
      verifiedPostMergeSource: postMergeSource,
      synchronization,
      finiteLeaseCandidate
    });

    if ((observed === null || observed === undefined || observed === "") && !postMergeSource) {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_REF_MISSING", status: "BLOCKED_INTERNAL", branch: entry.branch, number: numberValid ? entry.number : null, ref });
    } else if (!observedValid && !postMergeSource) {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_OBSERVED_HEAD_MALFORMED", status: "BLOCKED_INTERNAL", branch: entry.branch, number: numberValid ? entry.number : null, observed });
    } else if (headValid && observed !== entry.head && !postMergeSource && !synchronization?.ok && !finiteLeaseCandidate?.ok) {
      findings.push({
        id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_HEAD_STALE",
        status: "BLOCKED_INTERNAL",
        branch: entry.branch,
        number: numberValid ? entry.number : null,
        observed,
        recorded: entry.head
      });
      findings.push(...(synchronization?.findings ?? []));
    }
  }

  const namedBranch = typeof branch === "string" ? branch : "";
  const checkoutHeadValid = typeof head === "string" && gitShaPattern.test(head);
  const remoteMainValid = typeof remoteMain === "string" && gitShaPattern.test(remoteMain);
  const hasExplicitContext = explicitBranch !== "" || explicitHead !== "";

  if (!checkoutHeadValid) findings.push({ id: "ASSURANCE_CURRENT_TRUTH_CHECKOUT_HEAD_MALFORMED", status: "BLOCKED_INTERNAL", head: head ?? null });
  if (!remoteMainValid) findings.push({ id: "ASSURANCE_CURRENT_TRUTH_MAIN_HEAD_MALFORMED", status: "BLOCKED_INTERNAL", remoteMain: remoteMain ?? null });

  if (hasExplicitContext) {
    if (!isValidGitBranchName(explicitBranch) || !gitShaPattern.test(explicitHead)) {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_EXPLICIT_CONTEXT_MALFORMED", status: "BLOCKED_INTERNAL" });
    }
    if (namedBranch && explicitBranch && namedBranch !== explicitBranch) {
      findings.push({
        id: "ASSURANCE_CURRENT_TRUTH_EXPLICIT_CONTEXT_MISMATCH",
        status: "BLOCKED_INTERNAL",
        branch: namedBranch,
        explicitBranch
      });
    }
    if (checkoutHeadValid && gitShaPattern.test(explicitHead) && head !== explicitHead) {
      findings.push({
        id: "ASSURANCE_CURRENT_TRUTH_CHECKOUT_HEAD_STALE",
        status: "BLOCKED_INTERNAL",
        actual: head,
        expected: explicitHead
      });
    }
  }

  const contextBranch = explicitBranch || namedBranch;
  const claimsMain = contextBranch === "main";
  const mainCheckoutCurrent = checkoutHeadValid
    && remoteMainValid
    && head === remoteMain
    && (explicitBranch !== "main" || explicitHead === remoteMain);
  const detachedMain = !namedBranch
    && (!hasExplicitContext || explicitBranch === "main")
    && mainCheckoutCurrent;
  if (claimsMain && !mainCheckoutCurrent) {
    findings.push({
      id: "ASSURANCE_CURRENT_TRUTH_MAIN_CHECKOUT_STALE",
      status: "BLOCKED_INTERNAL",
      actual: head,
      expected: remoteMain,
      explicitHead: explicitHead || null
    });
  }
  if (!namedBranch && !detachedMain && !hasExplicitContext) {
    findings.push({ id: "ASSURANCE_CURRENT_TRUTH_DETACHED_CONTEXT_UNRESOLVED", status: "BLOCKED_INTERNAL", head: checkoutHeadValid ? head : null });
  }

  const currentEntry = entries.find((entry) => entry?.branch === contextBranch);
  const currentRef = currentEntry && isValidGitBranchName(currentEntry.branch) ? implementationRemoteRef(currentEntry.branch) : null;
  const currentBinding = bindings.find((binding) => binding.ref === currentRef);
  const acceptedCheckoutHead = ["BASE_SYNCHRONIZED_IMPLEMENTATION_BRANCH", "CURRENT_TRUTH_BINDING_COMMIT", "FINITE_TASK_VERIFIED_POST_MERGE_SOURCE"].includes(currentBinding?.classification)
    || currentBinding?.classification === "FINITE_TASK_LEASE_CANDIDATE"
    ? currentBinding.observedHead
    : currentEntry?.head;
  if (currentEntry && checkoutHeadValid && gitShaPattern.test(currentEntry.head) && head !== acceptedCheckoutHead) {
    findings.push({
      id: "ASSURANCE_CURRENT_TRUTH_CHECKOUT_HEAD_STALE",
      status: "BLOCKED_INTERNAL",
      actual: head,
      branch: contextBranch,
      expected: acceptedCheckoutHead,
      number: Number.isInteger(currentEntry.number) ? currentEntry.number : null
    });
  }

  const sortedFindings = sortStable(findings);
  const mainContext = claimsMain || detachedMain;
  return {
    ok: sortedFindings.length === 0,
    bindings: sortStable(bindings),
    context: claimsMain && !mainCheckoutCurrent
      ? "invalid-main-context"
      : detachedMain
      ? "detached-main"
      : mainContext
        ? "main"
        : currentEntry
          ? "listed-implementation-branch"
          : contextBranch
            ? "unlisted-control-branch"
            : "detached-unresolved",
    findings: sortedFindings,
    acceptedBaseSynchronizations: Object.fromEntries(bindings
      .filter(({ synchronization }) => synchronization?.ok)
      .map(({ number, synchronization }) => [number, synchronization])),
    unlistedBranchPolicy: "deferred-to-pr-e"
  };
}

export function verifyCurrentTruthSynchronization({
  recordedMain,
  remoteMain,
  parents,
  changedPaths,
  requiredChangedPaths,
  allowedChangedPaths,
  bootstrapMerge,
  terminalControlMaintenance,
  gitCommand = git
}) {
  if (recordedMain === remoteMain) return { ok: true, mode: "exact-main" };
  const required = new Set(requiredChangedPaths);
  const allowed = new Set(allowedChangedPaths);
  const changed = new Set(changedPaths);
  const parentShapeMatches = parents.length === 2 && parents[0] === recordedMain;
  const requiredPathsPresent = [...required].every((file) => changed.has(file));
  const changedPathsAllowed = [...changed].every((file) => allowed.has(file));
  const normalSynchronization = parentShapeMatches && requiredPathsPresent && changedPathsAllowed;
  const bootstrapSynchronization = Boolean(
    bootstrapMerge
    && remoteMain === bootstrapMerge.mergeSha
    && recordedMain === bootstrapMerge.firstParent
    && parentShapeMatches
    && JSON.stringify([...changed].sort()) === JSON.stringify([...bootstrapMerge.changedPaths].sort())
  );
  const successorCandidates = (bootstrapMerge?.successors ?? []).filter((candidate) => candidate
    && Number.isInteger(candidate.prNumber)
    && candidate.prNumber > 0
    && isValidGitBranchName(candidate.branch)
    && gitShaPattern.test(candidate.firstParent ?? "")
    && gitShaPattern.test(candidate.requiredSecondParentAncestor ?? "")
    && candidate.firstParent === recordedMain
    && parentShapeMatches
    && JSON.stringify([...changed].sort()) === JSON.stringify([...(candidate.changedPaths ?? [])].sort()));
  let successorBootstrapSynchronization = false;
  if (successorCandidates.length === 1) {
    const candidate = successorCandidates[0];
    try {
      const subject = gitCommand(["show", "-s", "--format=%s", remoteMain]);
      gitCommand(["merge-base", "--is-ancestor", candidate.requiredSecondParentAncestor, parents[1]]);
      successorBootstrapSynchronization = subject === `Merge pull request #${candidate.prNumber} from Chillywood2025/${candidate.branch}`;
    } catch {
      successorBootstrapSynchronization = false;
    }
  }
  let terminalControlMaintenanceSynchronization = false;
  if (terminalControlMaintenance
    && terminalControlMaintenance.startingMain === recordedMain
    && parentShapeMatches
    && Array.isArray(terminalControlMaintenance.allowedChangedPaths)
    && terminalControlMaintenance.allowedChangedPaths.length <= terminalControlMaintenance.maximumFiles
    && JSON.stringify([...changed].sort()) === JSON.stringify([...terminalControlMaintenance.allowedChangedPaths].sort())) {
    try {
      const subject = gitCommand(["show", "-s", "--format=%s", remoteMain]);
      const embeddedContract = JSON.parse(gitCommand(["show", `${parents[1]}:config/assurance/current-truth-contract-v1.json`]));
      const embedded = embeddedContract.synchronizationMerge?.terminalControlMaintenance;
      terminalControlMaintenanceSynchronization = new RegExp(`^Merge pull request #[1-9][0-9]* from Chillywood2025/${terminalControlMaintenance.branch.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "u").test(subject)
        && embedded?.marker === "chillywood-assurance-control-maintenance-v1"
        && embedded?.branch === terminalControlMaintenance.branch
        && embedded?.startingMain === terminalControlMaintenance.startingMain
        && embedded?.nestedControlDependency === false
        && embedded?.secondMaintenancePrAllowed === false
        && stableJson(embedded?.allowedChangedPaths) === stableJson(terminalControlMaintenance.allowedChangedPaths);
    } catch {
      terminalControlMaintenanceSynchronization = false;
    }
  }
  return {
    ok: normalSynchronization || bootstrapSynchronization || successorBootstrapSynchronization || terminalControlMaintenanceSynchronization,
    mode: bootstrapSynchronization
      ? "bootstrap-synchronization-merge"
      : successorBootstrapSynchronization
        ? "protected-successor-bootstrap-synchronization-merge"
        : terminalControlMaintenanceSynchronization
          ? "terminal-control-maintenance-synchronization-merge"
          : "synchronization-merge",
    parentShapeMatches,
    requiredPathsPresent,
    changedPathsAllowed,
    bootstrapSynchronization,
    successorBootstrapSynchronization,
    terminalControlMaintenanceSynchronization
  };
}

export function verifyCompletedImplementationMergeIdentity({ activeTaskBinding, latestMergedImplementationPr, remoteMain, gitCommand = git }) {
  if (!["COMPLETE", "TERMINAL"].includes(activeTaskBinding?.phase)) return [];
  const finding = (id, extra = {}) => ({ id, status: "BLOCKED_INTERNAL", ...extra });
  if (latestMergedImplementationPr?.state !== "merged"
    || latestMergedImplementationPr.number !== activeTaskBinding.implementationPr
    || latestMergedImplementationPr.head !== activeTaskBinding.currentImplementationHead
    || !gitShaPattern.test(latestMergedImplementationPr.mergeSha ?? "")
    || !gitShaPattern.test(remoteMain ?? "")) {
    return [finding("ASSURANCE_COMPLETED_IMPLEMENTATION_MERGE_IDENTITY_MISMATCH")];
  }
  try {
    const mergeSha = latestMergedImplementationPr.mergeSha;
    const parents = gitCommand(["show", "-s", "--format=%P", mergeSha]).split(/\s+/u).filter(Boolean);
    const mergeSubject = gitCommand(["show", "-s", "--format=%s", mergeSha]);
    const mergeTree = gitCommand(["rev-parse", `${mergeSha}^{tree}`]);
    const implementationHeadTree = gitCommand(["rev-parse", `${activeTaskBinding.currentImplementationHead}^{tree}`]);
    const protectedMainFirstParent = gitCommand(["rev-list", "--first-parent", remoteMain]).split(/\r?\n/u).filter(Boolean);
    gitCommand(["merge-base", "--is-ancestor", activeTaskBinding.currentImplementationHead, mergeSha]);
    gitCommand(["merge-base", "--is-ancestor", mergeSha, remoteMain]);
    const findings = [];
    if (parents.length !== 2 || parents[1] !== activeTaskBinding.currentImplementationHead) {
      findings.push(finding("ASSURANCE_COMPLETED_IMPLEMENTATION_MERGE_PARENT_MISMATCH", { parents }));
    }
    const expectedSubject = `Merge pull request #${activeTaskBinding.implementationPr} from Chillywood2025/${activeTaskBinding.implementationBranch}`;
    if (mergeSubject !== expectedSubject) {
      findings.push(finding("ASSURANCE_COMPLETED_IMPLEMENTATION_MERGE_PR_BRANCH_MISMATCH", { expected: expectedSubject, recorded: mergeSubject }));
    }
    if (!protectedMainFirstParent.includes(mergeSha)) {
      findings.push(finding("ASSURANCE_COMPLETED_IMPLEMENTATION_MERGE_NOT_ON_PROTECTED_MAIN_FIRST_PARENT"));
    }
    if (mergeTree !== activeTaskBinding.currentImplementationTree) {
      findings.push(finding("ASSURANCE_COMPLETED_IMPLEMENTATION_MERGE_TREE_MISMATCH", { expected: activeTaskBinding.currentImplementationTree, recorded: mergeTree }));
    }
    if (implementationHeadTree !== activeTaskBinding.currentImplementationTree) {
      findings.push(finding("ASSURANCE_COMPLETED_IMPLEMENTATION_HEAD_TREE_MISMATCH", { expected: activeTaskBinding.currentImplementationTree, recorded: implementationHeadTree }));
    }
    return findings;
  } catch {
    return [finding("ASSURANCE_COMPLETED_IMPLEMENTATION_MERGE_ANCESTRY_INVALID")];
  }
}

export const tierIds = ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION", "T4_NATIVE_PROVIDER", "T5_SIGNED_ARTIFACT", "T6_INSTALLED_PHYSICAL", "T7_PUBLIC_CANARY"];

export function validateTerminalTaskEvidence(binding, latestMergedImplementationPr) {
  if (binding?.phase !== "TERMINAL") return [];
  const evidence = binding?.terminalEvidence;
  const findings = [];
  if (["FINITE_TASK_AMENDED_POST_MERGE_TERMINAL_EVIDENCE_V1", "FINITE_TASK_AMENDED_TEST_ADAPTATION_POST_MERGE_TERMINAL_EVIDENCE_V2"].includes(evidence?.classification)) {
    const adapted = evidence.classification === "FINITE_TASK_AMENDED_TEST_ADAPTATION_POST_MERGE_TERMINAL_EVIDENCE_V2";
    const legacyOverlayFieldsAbsent = adapted || (
      evidence.testAdaptationReservation == null
      && evidence.aggregateReservation == null
      && evidence.scopePartitions == null
      && evidence.testAdaptationReceipt == null
      && evidence.finalSourceReceipt?.aggregateReservationHash == null
      && evidence.finalSourceReceipt?.testAdaptationCommentId == null
      && evidence.finalSourceReceipt?.subject == null
    );
    if (evidence.schemaVersion !== (adapted ? 2 : 1)
      || !legacyOverlayFieldsAbsent
      || binding?.completionScope !== "FINITE_TASK_SOURCE_MERGED_VERIFIED"
      || evidence.sourceHead !== binding.currentImplementationHead
      || evidence.sourceTree !== binding.currentImplementationTree
      || evidence.mergeSha !== latestMergedImplementationPr?.mergeSha
      || evidence.mergeTree !== latestMergedImplementationPr?.mergeTree
      || evidence.implementationPr !== binding.implementationPr
      || evidence.implementationBranch !== binding.implementationBranch
      || !sha256Pattern.test(evidence.baseLeaseHash ?? "")
      || !sha256Pattern.test(evidence.baseReservation?.reservationHash ?? "")
      || !sha256Pattern.test(evidence.effectiveReservation?.reservationHash ?? "")
      || !Number.isInteger(evidence.amendmentReceipt?.commentId) || evidence.amendmentReceipt.commentId < 1
      || !Number.isInteger(evidence.finalSourceReceipt?.commentId) || evidence.finalSourceReceipt.commentId < 1
      || (adapted && (!finiteTaskScopePartitionsValid({
        implementationReservation: evidence.effectiveReservation,
        testAdaptationReservation: evidence.testAdaptationReservation,
        aggregateReservation: evidence.aggregateReservation,
        scopePartitions: evidence.scopePartitions
      }) || !finiteTaskTestAdaptationReceiptRecordValid(evidence.testAdaptationReceipt, evidence.testAdaptationReservation, {
        implementationReservation: evidence.effectiveReservation,
        aggregateReservation: evidence.aggregateReservation,
        baseLeaseHash: evidence.baseLeaseHash,
        amendmentReceipt: evidence.amendmentReceipt,
        identity: evidence
      }) || !finiteTaskOverlayFinalReceiptRecordValid(evidence.finalSourceReceipt, evidence)))
      || !Array.isArray(evidence.mergeParents) || evidence.mergeParents.length !== 2
      || evidence.mergeParents[1] !== evidence.sourceHead
      || typeof evidence.nextTask !== "string" || !evidence.nextTask
      || stableJson(evidence.authority) !== stableJson({ providerMutation: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false })
      || evidence.evidenceHash !== sha256(Object.fromEntries(Object.entries(evidence).filter(([key]) => key !== "evidenceHash")))) {
      findings.push({ id: "ASSURANCE_FINITE_TASK_TERMINAL_EVIDENCE_MALFORMED", status: "BLOCKED_INTERNAL" });
    }
    return findings;
  }
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)
    || evidence.schemaVersion !== 1
    || evidence.completionScope !== binding.completionScope
    || evidence.sourceHead !== binding.currentImplementationHead
    || evidence.sourceTree !== binding.currentImplementationTree
    || evidence.mergeSha !== latestMergedImplementationPr?.mergeSha
    || evidence.mergeTree !== binding.currentImplementationTree
    || !Number.isInteger(evidence.ownerReceiptCommentId) || evidence.ownerReceiptCommentId < 1
    || !Number.isInteger(evidence.repositoryReviewCommentId) || evidence.repositoryReviewCommentId < 1
    || evidence.repositoryReview?.P0 !== 0
    || evidence.repositoryReview?.P1 !== 0
    || evidence.repositoryReview?.launchImpactingP2 !== 0
    || !Number.isInteger(evidence.phase1?.runId) || evidence.phase1.runId < 1
    || evidence.phase1?.head !== binding.currentImplementationHead
    || evidence.phase1?.result !== "PASS_13_OF_13"
    || evidence.proofLimitations?.T4_NATIVE_PROVIDER !== "LOCAL_ANDROID_ONLY_PROVIDER_NOT_CONTACTED"
    || evidence.proofLimitations?.backupClassification !== "BLOCKED_LOCAL_ANDROID_BACKUP_TRANSPORT"
    || evidence.proofLimitations?.T5_SIGNED_ARTIFACT !== "NOT_CURRENT"
    || evidence.proofLimitations?.T6_INSTALLED_PHYSICAL !== "NOT_CURRENT"
    || evidence.proofLimitations?.T7_PUBLIC_CANARY !== "BLOCKED_EXTERNAL"
    || evidence.publicReleaseAuthorized !== false
    || evidence.otaAuthorized !== false) {
    findings.push({ id: "ASSURANCE_TERMINAL_TASK_EVIDENCE_MALFORMED", status: "BLOCKED_INTERNAL" });
  }
  return findings;
}

export const featureRequired = ["featureId", "currentState", "ownerSystems", "productOwner", "routes", "components", "edgeFunctions", "tablesRpcs", "nativeModulesPlugins", "providers", "platformScope", "environments", "riskLevel", "requirements", "nonGoals", "states", "transitions", "invariants", "knownDefectTags", "threatFailureModes", "proofTierApplicability", "commands", "artifactRequirements", "installedRequirements", "physicalGoldenCases", "rollback", "emergencyStop", "evidenceRetention", "reviewRequirements", "unresolvedBlockers"];
export const proofTierApplicabilityPolicies = {
  REQUIRE_CLEAR: ["admin-display-only", "control-ui-only", "layout-matrix", "provider-required", "provider-when-used", "release-only", "required", "required-for-public-release", "required-for-release", "required-shadow-workflow", "setup-display-only", "store-flow-only", "when-delivered"],
  REQUIRE_NOT_APPLICABLE: ["metadata-boundary-only-no-new-native-or-provider-proof", "not-applicable", "not-applicable-no-artifact-change", "not-applicable-no-installed-change", "not-applicable-no-release"]
};
export const proofTierCompletionFeatureApplicability = {
  "assurance-efficiency-e0": {
    T0_REQUIREMENT: "required",
    T1_SOURCE: "required",
    T2_MODEL: "required",
    T3_INTEGRATION: "required-shadow-workflow",
    T4_NATIVE_PROVIDER: "metadata-boundary-only-no-new-native-or-provider-proof",
    T5_SIGNED_ARTIFACT: "not-applicable-no-artifact-change",
    T6_INSTALLED_PHYSICAL: "not-applicable-no-installed-change",
    T7_PUBLIC_CANARY: "not-applicable-no-release"
  },
  "codex-security-scan-reliability-s0": {
    T0_REQUIREMENT: "required",
    T1_SOURCE: "required",
    T2_MODEL: "required",
    T3_INTEGRATION: "required",
    T4_NATIVE_PROVIDER: "metadata-boundary-only-no-new-native-or-provider-proof",
    T5_SIGNED_ARTIFACT: "not-applicable",
    T6_INSTALLED_PHYSICAL: "not-applicable",
    T7_PUBLIC_CANARY: "not-applicable"
  }
};
const proofTierCompletionPolicies = {
  T0_REQUIREMENT: { passStatus: "REQUIREMENTS_CLEAR", missingStatus: "BLOCKED_INTERNAL", freshnessClasses: ["REPOSITORY_SOURCE"] },
  T1_SOURCE: { passStatus: "SOURCE_CLEAR", missingStatus: "BLOCKED_INTERNAL", freshnessClasses: ["REPOSITORY_SOURCE"] },
  T2_MODEL: { passStatus: "MODEL_CLEAR", missingStatus: "BLOCKED_INTERNAL", freshnessClasses: ["REPOSITORY_SOURCE"] },
  T3_INTEGRATION: { passStatus: "INTEGRATION_CLEAR", missingStatus: "BLOCKED_INTERNAL", freshnessClasses: ["REPOSITORY_SOURCE"] },
  T4_NATIVE_PROVIDER: { passStatus: ["NATIVE_CLEAR", "PROVIDER_CLEAR"], missingStatus: "BLOCKED_INTERNAL", freshnessClasses: ["PROVIDER_CRITICAL"] },
  T5_SIGNED_ARTIFACT: { passStatus: "ARTIFACT_CLEAR", missingStatus: "BLOCKED_EXTERNAL", freshnessClasses: ["SIGNED_ARTIFACT"] },
  T6_INSTALLED_PHYSICAL: { passStatus: ["INSTALLED_CLEAR", "PHYSICAL_CLEAR"], missingStatus: "BLOCKED_EXTERNAL", freshnessClasses: ["INSTALLED_DEVICE", "PHYSICAL_DEVICE"] },
  T7_PUBLIC_CANARY: { passStatus: "RELEASE_CLEAR", missingStatus: "BLOCKED_EXTERNAL", freshnessClasses: ["PUBLIC_CANARY"] }
};
export const proofTierCompletionFactAuthorities = [
  {
    featureId: "assurance-efficiency-e0",
    factId: "repository.assurance-control.a1.requirements",
    proofTiers: ["T0_REQUIREMENT"],
    freshnessClass: "REPOSITORY_SOURCE",
    authorityAllowed: "REPOSITORY_ONLY",
    platform: "NONE",
    provider: "NONE"
  },
  {
    featureId: "assurance-efficiency-e0",
    factId: "repository.assurance-control.a1.source",
    proofTiers: ["T1_SOURCE"],
    freshnessClass: "REPOSITORY_SOURCE",
    authorityAllowed: "REPOSITORY_ONLY",
    platform: "NONE",
    provider: "NONE"
  },
  {
    featureId: "assurance-efficiency-e0",
    factId: "repository.assurance-control.a1.model",
    proofTiers: ["T2_MODEL"],
    freshnessClass: "REPOSITORY_SOURCE",
    authorityAllowed: "REPOSITORY_ONLY",
    platform: "NONE",
    provider: "NONE"
  },
  {
    featureId: "assurance-efficiency-e0",
    factId: "repository.assurance-control.a1.integration",
    proofTiers: ["T3_INTEGRATION"],
    freshnessClass: "REPOSITORY_SOURCE",
    authorityAllowed: "REPOSITORY_ONLY",
    platform: "NONE",
    provider: "NONE"
  },
  {
    featureId: "codex-security-scan-reliability-s0",
    factId: "repository.assurance-control.s0.requirements",
    proofTiers: ["T0_REQUIREMENT"],
    freshnessClass: "REPOSITORY_SOURCE",
    authorityAllowed: "REPOSITORY_ONLY",
    platform: "NONE",
    provider: "NONE"
  },
  {
    featureId: "codex-security-scan-reliability-s0",
    factId: "repository.assurance-control.s0.source",
    proofTiers: ["T1_SOURCE"],
    freshnessClass: "REPOSITORY_SOURCE",
    authorityAllowed: "REPOSITORY_ONLY",
    platform: "NONE",
    provider: "NONE"
  },
  {
    featureId: "codex-security-scan-reliability-s0",
    factId: "repository.assurance-control.s0.model",
    proofTiers: ["T2_MODEL"],
    freshnessClass: "REPOSITORY_SOURCE",
    authorityAllowed: "REPOSITORY_ONLY",
    platform: "NONE",
    provider: "NONE"
  },
  {
    featureId: "codex-security-scan-reliability-s0",
    factId: "repository.assurance-control.s0.integration",
    proofTiers: ["T3_INTEGRATION"],
    freshnessClass: "REPOSITORY_SOURCE",
    authorityAllowed: "REPOSITORY_ONLY",
    platform: "NONE",
    provider: "NONE"
  }
];

export function validateProofTierStatuses(binding, gateCatalog, featureRegistry) {
  const value = binding?.proofTierStatuses;
  const terminalTask = binding?.phase === "TERMINAL";
  const completionPhase = binding?.phase === "COMPLETE";
  const statusPhase = completionPhase || terminalTask;
  if (value === undefined) {
    if (binding?.proofTierApplicabilityHash !== undefined) {
      return [{ id: "ASSURANCE_PROOF_TIER_STATUSES_PREMATURE", status: "BLOCKED_INTERNAL", phase: binding?.phase ?? null }];
    }
    return statusPhase
      ? [{ id: "ASSURANCE_PROOF_TIER_STATUSES_MISSING", status: "BLOCKED_INTERNAL" }]
      : [];
  }
  if (!statusPhase) {
    return [{ id: "ASSURANCE_PROOF_TIER_STATUSES_PREMATURE", status: "BLOCKED_INTERNAL", phase: binding?.phase ?? null }];
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [{ id: "ASSURANCE_PROOF_TIER_STATUSES_MALFORMED", status: "BLOCKED_INTERNAL" }];
  }
  const gates = new Map((gateCatalog?.gates ?? []).map((gate) => [gate?.id, gate]));
  const catalogStatuses = new Set(gateCatalog?.statuses ?? []);
  const gatePolicyExact = tierIds.every((tier) => {
    const gate = gates.get(tier);
    const expected = proofTierCompletionPolicies[tier];
    return stableJson(gate?.passStatus) === stableJson(expected.passStatus)
      && gate?.missingStatus === expected.missingStatus
      && stableJson(gate?.completionFreshnessClasses) === stableJson(expected.freshnessClasses);
  });
  if (gates.size !== tierIds.length
    || catalogStatuses.size === 0
    || !gatePolicyExact
    || stableJson(gateCatalog?.applicabilityPolicies) !== stableJson(proofTierApplicabilityPolicies)
    || stableJson(gateCatalog?.completionFeatureApplicability) !== stableJson(proofTierCompletionFeatureApplicability)
    || stableJson(gateCatalog?.completionFactAuthorities) !== stableJson(proofTierCompletionFactAuthorities)) {
    return [{ id: "ASSURANCE_GATE_CATALOG_MALFORMED", status: "BLOCKED_INTERNAL" }];
  }
  const registeredFeatures = Array.isArray(featureRegistry) ? featureRegistry : featureRegistry?.features;
  const featureMatches = (registeredFeatures ?? []).filter(({ featureId }) => featureId === binding?.featureId);
  const feature = featureMatches.length === 1 ? featureMatches[0] : null;
  if (statusPhase && !feature) {
    return [{ id: "ASSURANCE_PROOF_TIER_APPLICABILITY_MISSING", status: "BLOCKED_INTERNAL", featureId: binding?.featureId ?? null }];
  }
  const findings = [];
  const authoritativeApplicability = terminalTask
    ? feature?.proofTierApplicability
    : proofTierCompletionFeatureApplicability[binding?.featureId];
  if (statusPhase
    && (!authoritativeApplicability
      || (completionPhase && stableJson(feature.proofTierApplicability) !== stableJson(authoritativeApplicability))
      || binding.proofTierApplicabilityHash !== sha256(stableJson(authoritativeApplicability)))) {
    findings.push({ id: "ASSURANCE_PROOF_TIER_APPLICABILITY_HASH_MISMATCH", status: "BLOCKED_INTERNAL", featureId: binding.featureId });
  }
  const keys = Object.keys(value);
  const clearTiers = [];
  for (const tier of tierIds) {
    if (!Object.hasOwn(value, tier)) {
      findings.push({ id: "ASSURANCE_PROOF_TIER_STATUS_MISSING", status: "BLOCKED_INTERNAL", tier });
      continue;
    }
    const gate = gates.get(tier);
    const passStatuses = Array.isArray(gate?.passStatus) ? gate.passStatus : [gate?.passStatus];
    const proofStatus = value[tier];
    const compositePass = passStatuses.length > 1;
    const completePass = compositePass
      ? Array.isArray(proofStatus)
        && proofStatus.length === passStatuses.length
        && new Set(proofStatus).size === proofStatus.length
        && passStatuses.every((status) => proofStatus.includes(status))
      : proofStatus === passStatuses[0];
    const scalarNonPass = typeof proofStatus === "string"
      && [gate?.missingStatus, "NOT_APPLICABLE", "SUPERSEDED"].includes(proofStatus);
    const statusShapeValid = completePass || scalarNonPass;
    const catalogValuesValid = (Array.isArray(proofStatus) ? proofStatus : [proofStatus])
      .every((status) => typeof status === "string" && catalogStatuses.has(status));
    if (completePass) clearTiers.push(tier);
    if (!statusShapeValid || !catalogValuesValid) {
      findings.push({ id: "ASSURANCE_PROOF_TIER_STATUS_INVALID", status: "BLOCKED_INTERNAL", tier, value: proofStatus ?? null });
    } else if (completionPhase && !completePass && proofStatus !== "NOT_APPLICABLE") {
      findings.push({ id: "ASSURANCE_COMPLETED_PROOF_TIER_BLOCKED", status: "BLOCKED_INTERNAL", tier, value: proofStatus });
    } else if (completionPhase) {
      const applicability = (authoritativeApplicability ?? feature?.proofTierApplicability)?.[tier];
      const modes = Object.entries(proofTierApplicabilityPolicies)
        .filter(([, values]) => values.includes(applicability))
        .map(([mode]) => mode);
      if (modes.length !== 1) {
        findings.push({ id: "ASSURANCE_PROOF_TIER_APPLICABILITY_UNKNOWN", status: "BLOCKED_INTERNAL", tier, applicability: applicability ?? null });
        continue;
      }
      const required = modes[0] === "REQUIRE_CLEAR";
      const notApplicable = modes[0] === "REQUIRE_NOT_APPLICABLE";
      if (required && !completePass) {
        findings.push({ id: "ASSURANCE_REQUIRED_PROOF_TIER_NOT_CLEAR", status: "BLOCKED_INTERNAL", tier, value: proofStatus, applicability });
      } else if (notApplicable && proofStatus !== "NOT_APPLICABLE") {
        findings.push({ id: "ASSURANCE_NOT_APPLICABLE_PROOF_TIER_PROMOTED", status: "BLOCKED_INTERNAL", tier, value: proofStatus, applicability });
      }
    }
  }
  for (const tier of keys) {
    if (!tierIds.includes(tier)) findings.push({ id: "ASSURANCE_PROOF_TIER_STATUS_UNKNOWN", status: "BLOCKED_INTERNAL", tier });
  }
  if (terminalTask) {
    const finiteTaskTerminal = ["FINITE_TASK_AMENDED_POST_MERGE_TERMINAL_EVIDENCE_V1", "FINITE_TASK_AMENDED_TEST_ADAPTATION_POST_MERGE_TERMINAL_EVIDENCE_V2"].includes(binding?.terminalEvidence?.classification);
    const expected = {
      T0_REQUIREMENT: "REQUIREMENTS_CLEAR",
      T1_SOURCE: "SOURCE_CLEAR",
      T2_MODEL: "MODEL_CLEAR",
      T3_INTEGRATION: "INTEGRATION_CLEAR",
      T4_NATIVE_PROVIDER: "BLOCKED_INTERNAL",
      T5_SIGNED_ARTIFACT: "BLOCKED_EXTERNAL",
      T6_INSTALLED_PHYSICAL: "BLOCKED_EXTERNAL",
      T7_PUBLIC_CANARY: "BLOCKED_EXTERNAL"
    };
    if (binding?.completionScope !== (finiteTaskTerminal ? "FINITE_TASK_SOURCE_MERGED_VERIFIED" : "D2A_BOUND_COMPLETE_FOR_REGISTERED_NATIVE_LIFECYCLE_SCOPE")
      || stableJson(value) !== stableJson(expected)) {
      findings.push({ id: "ASSURANCE_TERMINAL_TASK_SCOPE_STATUS_MISMATCH", status: "BLOCKED_INTERNAL" });
    }
    const clearTiersExpected = ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION"];
    const underEvaluation = Array.isArray(binding.proofTiersUnderEvaluation) ? binding.proofTiersUnderEvaluation : [];
    if (stableJson([...underEvaluation].sort()) !== stableJson([...clearTiersExpected].sort())) {
      findings.push({ id: "ASSURANCE_TERMINAL_TASK_PROOF_TIER_EVALUATION_MISMATCH", status: "BLOCKED_INTERNAL" });
    }
  }
  if (completionPhase) {
    const underEvaluation = Array.isArray(binding.proofTiersUnderEvaluation) ? binding.proofTiersUnderEvaluation : [];
    if (new Set(underEvaluation).size !== underEvaluation.length
      || stableJson([...underEvaluation].sort()) !== stableJson([...clearTiers].sort())) {
      findings.push({
        id: "ASSURANCE_PROOF_TIER_EVALUATION_MISMATCH",
        status: "BLOCKED_INTERNAL",
        proofTiersUnderEvaluation: underEvaluation,
        clearTiers
      });
    }
    const declaredClasses = Array.isArray(binding.requiredFreshnessClasses) ? binding.requiredFreshnessClasses : [];
    const claimClasses = Array.isArray(binding.requiredFreshnessClaims)
      ? [...new Set(binding.requiredFreshnessClaims.map(({ freshnessClass }) => freshnessClass))]
      : [];
    if (new Set(declaredClasses).size !== declaredClasses.length
      || stableJson([...declaredClasses].sort()) !== stableJson([...claimClasses].sort())) {
      findings.push({ id: "ASSURANCE_COMPLETION_FRESHNESS_SCOPE_MISMATCH", status: "BLOCKED_INTERNAL" });
    }
    const requiredCompletionClasses = [...new Set(clearTiers.flatMap((tier) => proofTierCompletionPolicies[tier].freshnessClasses))];
    for (const freshnessClass of requiredCompletionClasses) {
      if (!declaredClasses.includes(freshnessClass)) {
        findings.push({ id: "ASSURANCE_COMPLETED_PROOF_TIER_FRESHNESS_MISSING", status: "BLOCKED_INTERNAL", freshnessClass });
      }
    }
    for (const tier of clearTiers) {
      const authorities = proofTierCompletionFactAuthorities
        .filter(({ featureId, proofTiers: authorizedTiers }) => featureId === binding.featureId && authorizedTiers.includes(tier));
      const factAuthorized = authorities.some((authority) => (binding.requiredFreshnessClaims ?? []).some((claim) =>
        claim?.freshnessClass === authority.freshnessClass
        && claim?.authorityAllowed === authority.authorityAllowed
        && claim?.platform === authority.platform
        && claim?.provider === authority.provider
        && Array.isArray(claim.requiredFacts)
        && claim.requiredFacts.includes(authority.factId)));
      if (!factAuthorized) {
        findings.push({ id: "ASSURANCE_COMPLETED_PROOF_TIER_FACT_UNAUTHORIZED", status: "BLOCKED_INTERNAL", tier, featureId: binding.featureId });
      }
    }
  }
  return findings;
}

const OWNER_JURISDICTION_POLICY_BINDING_V2 = "OWNER_JURISDICTION_POLICY_BINDING_V2";
const ownerJurisdictionAuthorityClosed = Object.freeze({
  productMutation: false,
  providerMutation: false,
  databaseDeployment: false,
  build: false,
  submission: false,
  ota: false,
  publicRelease: false,
});

function exactObjectFields(value, fields) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && stableJson(Object.keys(value).sort()) === stableJson([...fields].sort());
}

/**
 * Validates the current-truth projection only. The immutable receipt, policy
 * chain, and type-separated hashes are verified by jurisdiction-policy.mjs;
 * this projection intentionally contains no standing-policy body.
 */
export function validateOwnerJurisdictionPolicyTruth(record, contract) {
  const finding = (id, detail = {}) => ({ id, status: "BLOCKED_INTERNAL", ...detail });
  const findings = [];
  const capability = record?.ownerJurisdictionPolicyCapability;
  if (stableJson(capability) !== stableJson(contract?.ownerJurisdictionPolicyCapability)) {
    findings.push(finding("ASSURANCE_OWNER_JURISDICTION_CAPABILITY_INVALID"));
  }
  const binding = record?.ownerJurisdictionPolicyBinding;
  if (binding === undefined) return findings;

  const sha256Value = (value) => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
  const gitSha = (value) => typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
  const domainId = (value) => typeof value === "string"
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value)
    && value.normalize("NFC") === value
    && !value.includes("*");
  const bindingFields = ["schemaVersion", "contract", "repository", "product", "launchProgram", "policySource", "taskBinding", "coverage", "externalProofInherited", "operationalOwnershipPreserved", "authority"];
  const policyCommonFields = ["commentId", "referenceScope", "standingPolicyType", "standingPolicyVersion", "status", "sequence", "standingPolicyHash"];
  const taskFields = ["taskId", "prNumber", "planningHead", "planningTree", "standingPolicyCommentId", "standingPolicyHash", "bindingType", "bindingVersion", "domainIds", "bindingHash", "conflictStatus"];
  const coverageFields = ["status", "coveredDomainIds", "coveredCount", "unresolvedDomainIds"];
  const policy = binding?.policySource;
  const task = binding?.taskBinding;
  const coverage = binding?.coverage;
  const domains = task?.domainIds;
  const covered = coverage?.coveredDomainIds;

  if (!exactObjectFields(binding, bindingFields)
    || binding.schemaVersion !== 2
    || binding.contract !== OWNER_JURISDICTION_POLICY_BINDING_V2
    || binding.repository !== "Chillywood2025/chillywood-mobile"
    || typeof binding.product !== "string" || binding.product.length === 0 || binding.product.trim() !== binding.product
    || typeof binding.launchProgram !== "string" || binding.launchProgram.length === 0 || binding.launchProgram.trim() !== binding.launchProgram) {
    findings.push(finding("ASSURANCE_OWNER_JURISDICTION_BINDING_FIELDS_INVALID"));
  }
  const embeddedPolicySource = policy?.referenceScope === "TASK_BOUND_COMPOSITE";
  if (!exactObjectFields(policy, embeddedPolicySource ? [...policyCommonFields, "decisionVersion", "subjectHash", "bodyHash", "envelopeHash"] : policyCommonFields)
    || !Number.isSafeInteger(policy?.commentId) || policy.commentId < 1
    || !["TASK_BOUND_COMPOSITE", "STANDING_POLICY_SUBRECORD_ONLY"].includes(policy?.referenceScope)
    || (embeddedPolicySource && (!["OWNER_JURISDICTION_DECISION_V2", "OWNER_JURISDICTION_POLICY_CHAIN_DECISION_V2"].includes(policy?.decisionVersion) || ![policy?.subjectHash, policy?.bodyHash, policy?.envelopeHash].every(sha256Value)))
    || policy?.standingPolicyType !== "OWNER_JURISDICTION_STANDING_POLICY_V2"
    || policy?.standingPolicyVersion !== 2
    || !["ACTIVE_UNTIL_OWNER_SUPERSESSION_OR_REVOCATION", "SUPERSEDED_REEVALUATION_REQUIRED", "REVOKED_NO_AUTHORITY"].includes(policy?.status)
    || !Number.isSafeInteger(policy?.sequence) || policy.sequence < 0
    || !sha256Value(policy?.standingPolicyHash)) {
    findings.push(finding("ASSURANCE_OWNER_JURISDICTION_POLICY_SOURCE_INVALID"));
  }
  if (!exactObjectFields(task, taskFields)
    || typeof task?.taskId !== "string" || !/^[a-z0-9][a-z0-9_.:-]*$/u.test(task.taskId)
    || !Number.isSafeInteger(task?.prNumber) || task.prNumber < 1
    || !gitSha(task?.planningHead) || !gitSha(task?.planningTree)
    || task?.standingPolicyCommentId !== policy?.commentId
    || task?.standingPolicyHash !== policy?.standingPolicyHash
    || task?.bindingType !== "OWNER_JURISDICTION_TASK_BINDING_V2"
    || task?.bindingVersion !== 2
    || !sha256Value(task?.bindingHash)
    || !["NONE", "REQUIRES_NEW_OWNER_DECISION"].includes(task?.conflictStatus)) {
    findings.push(finding("ASSURANCE_OWNER_JURISDICTION_TASK_BINDING_INVALID"));
  }
  const exactDomains = Array.isArray(domains)
    && domains.length > 0
    && domains.length <= 256
    && domains.every(domainId)
    && new Set(domains).size === domains.length
    && stableJson(domains) === stableJson([...domains].sort());
  if (!exactDomains) findings.push(finding("ASSURANCE_OWNER_JURISDICTION_EXACT_DOMAINS_INVALID"));
  const policyActive = policy?.status === "ACTIVE_UNTIL_OWNER_SUPERSESSION_OR_REVOCATION";
  const activeCoverage = coverage?.status === "EXACT_TASK_DOMAINS_BOUND"
    && stableJson(covered) === stableJson(domains)
    && coverage?.coveredCount === domains?.length
    && coverage?.unresolvedDomainIds?.length === 0
    && task?.conflictStatus === "NONE";
  const inactiveCoverage = coverage?.status === "INELIGIBLE_REEVALUATION_REQUIRED"
    && covered?.length === 0
    && coverage?.coveredCount === 0
    && stableJson(coverage?.unresolvedDomainIds) === stableJson(domains)
    && task?.conflictStatus === "REQUIRES_NEW_OWNER_DECISION";
  if (!exactObjectFields(coverage, coverageFields)
    || !Array.isArray(covered)
    || !Array.isArray(coverage?.unresolvedDomainIds)
    || [...covered, ...coverage.unresolvedDomainIds].some((domain) => !domainId(domain))
    || new Set(covered).size !== covered.length
    || new Set(coverage.unresolvedDomainIds).size !== coverage.unresolvedDomainIds.length
    || (policyActive ? !activeCoverage : !inactiveCoverage)) {
    findings.push(finding("ASSURANCE_OWNER_JURISDICTION_COVERAGE_INVALID"));
  }
  if (binding?.externalProofInherited !== false
    || binding?.operationalOwnershipPreserved !== true
    || stableJson(binding?.authority) !== stableJson(ownerJurisdictionAuthorityClosed)) {
    findings.push(finding("ASSURANCE_OWNER_JURISDICTION_AUTHORITY_BOUNDARY_INVALID"));
  }
  if (policyActive && !activeCoverage) findings.push(finding("ASSURANCE_OWNER_JURISDICTION_ACTIVE_BINDING_INELIGIBLE"));
  return findings;
}

export function validateEngineeringDoctrineTruth(record, contract, sources = {}) {
  const doctrine = record?.engineeringDoctrine;
  if (doctrine === undefined) {
    const pending = sources.protectedMainRuntime;
    const boundedPending = pending?.pendingTerminalTruth === true
      && [1, 2].includes(pending?.pendingTransitionCount)
      && pending?.terminalSuccessorRequired === true
      && pending?.authorityCheckpointEligible === true
      && pending?.authorityControlEligible === true
      && pending?.sourceOnlyEligible === true
      && pending?.providerDependentEligible === false
      && pending?.buildEligible === false
      && pending?.submissionEligible === false
      && pending?.otaEligible === false
      && pending?.publicReleaseEligible === false
      && pending?.nextRequiredAction === "CREATE_EXACT_TERMINAL_TRUTH_SUCCESSOR"
      && (pending?.findings ?? []).length === 0;
    return (contract?.engineeringDoctrinePolicy?.optionalBeforeImplementationMerge === true && sources.currentMain === "8bf6459c3ae1cec62e26a1694f03063e4291b9f8" && sources.implementationMerged === false) || boundedPending ? [] : [{ id: "ASSURANCE_ENGINEERING_DOCTRINE_MISSING", status: "BLOCKED_INTERNAL" }];
  }
  const finding = (id, detail = {}) => ({ id, status: "BLOCKED_INTERNAL", ...detail });
  const validText = (value) => typeof value === "string" && value.length > 0;
  const validPath = (value) => typeof value === "string" && !value.startsWith("/") && !value.includes("..") && value.endsWith(".json");
  const required = contract?.engineeringDoctrinePolicy?.requiredActiveFields ?? [];
  const findings = [];
  if (doctrine.doctrineId !== "WHOLE_APP_ENGINEERING_BEFORE_IMPLEMENTATION_DOCTRINE_V1" || doctrine.version !== 1) findings.push(finding("ASSURANCE_ENGINEERING_DOCTRINE_IDENTITY_INVALID"));
  if (doctrine.status === "ACTIVE" && required.some((field) => !Object.hasOwn(doctrine, field))) findings.push(finding("ASSURANCE_ENGINEERING_DOCTRINE_ACTIVE_FIELDS_MISSING"));
  if (doctrine.status !== "ACTIVE" && doctrine.status !== "BOOTSTRAP_SELF_HOSTED_PENDING_MERGE") findings.push(finding("ASSURANCE_ENGINEERING_DOCTRINE_STATUS_INVALID"));
  const bounded = new Set(["BOUND_COMPLETE_FOR_REGISTERED_SCOPE", "BOUND_COMPLETE_SOURCE_ONLY", "BOUND_COMPLETE_WITH_EXTERNAL_PROOF_BLOCKED", "BOUND_INCOMPLETE", "BOUND_BLOCKED_NOVEL_DIMENSION", "BOUND_BLOCKED_EXTERNAL_CONTRACT_DRIFT"]);
  if (!bounded.has(doctrine.boundedDefinition)) findings.push(finding("ASSURANCE_UNIVERSAL_COMPLETENESS_CLAIM_REJECTED"));
  if (doctrine.status === "ACTIVE") {
    const registry = sources.registry ?? readJson("config/assurance/feature-registry-v1.json");
    const readiness = doctrine.domainReadiness;
    const hashes = ["doctrineHash", "doctrineReportHash", "evidenceAuthorityHash", "inventoryHash", "graphHash", "transitionModelHash", "authoritativeReplayHash", "taxonomyHash", "platformProviderContractHash", "featureRegistryHash", "activePacketHash", "certificateHash", "defectLedgerHash"];
    const counters = ["discoveryPasses", "reconciliationPasses", "predictableOmissionCount", "novelDimensionCount", "contractDriftCount", "modelRevisionCount", "verificationCycles"];
    const coverage = ["invariantCoverage", "transitionCoverage", "authorityCoverage", "mutationCoverage", "pairwiseCoverage", "highRiskThreeWayCoverage"];
    const leaseStates = new Set(["NO_ACTIVE_TASK", "INTENT_CAPTURED", "DOMAIN_DISCOVERY", "ARCHITECTURE_DESIGNED", "DEFECT_LEDGER_STABLE", "PREIMPLEMENTATION_ENGINEERING_CLEAR", "IMPLEMENTATION", "VERIFY", "NATIVE_PROVIDER_PROOF", "MERGE_ELIGIBLE", "ACTIVE_IMPLEMENTATION", "MERGED_VERIFIED", "CLOSED"]);
    if (hashes.some((field) => !/^[0-9a-f]{64}$/u.test(doctrine[field] ?? "")) || counters.some((field) => !Number.isInteger(doctrine[field]) || doctrine[field] < 0) || doctrine.discoveryPasses < 2 || doctrine.reconciliationPasses > 1 || coverage.some((field) => typeof doctrine[field] !== "number" || doctrine[field] < 0 || doctrine[field] > 1) || !leaseStates.has(doctrine.taskLeaseState) || !Array.isArray(doctrine.blockers) || doctrine.blockers.some((item) => !validText(item)) || doctrine.nextPermittedAction !== "WHOLE_APP_PRE_RELEASE_ENGINEERING_CLOSURE" || doctrine.doctrineReportPath !== "docs/assurance/whole-app-engineering-doctrine-v1-report.json" || !validPath(doctrine.activePacketPath)) findings.push(finding("ASSURANCE_ENGINEERING_DOCTRINE_ACTIVE_FIELDS_MALFORMED"));
    const tierStatuses = new Set(readJson("config/assurance/gate-catalog-v1.json").statuses); const tierIds = ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION", "T4_NATIVE_PROVIDER", "T5_SIGNED_ARTIFACT", "T6_INSTALLED_PHYSICAL", "T7_PUBLIC_CANARY"];
    const readinessValid = Array.isArray(readiness) && readiness.length === registry.features.length && stableJson(readiness.map(({ featureId }) => featureId).sort()) === stableJson(registry.features.map(({ featureId }) => featureId).sort()) && readiness.every((row) => row && ["architectureStatus", "sourceStatus", "integrationStatus", "nativeProviderStatus", "signedInstalledPhysicalPublicStatus", "lastEvidence", "disposition"].every((field) => validText(row[field]) && row[field] !== "COMPLETE") && Array.isArray(row.blockers) && row.blockers.every(validText) && row.proofTiers && tierIds.every((tier) => tierStatuses.has(row.proofTiers[tier])));
    if (!readinessValid) findings.push(finding("ASSURANCE_DOMAIN_READINESS_INCOMPLETE"));
    const receiptPolicy = record?.receiptLifecyclePolicy;
    const receiptContract = contract?.receiptLifecyclePolicy;
    const receiptPolicyValid = receiptPolicy?.contract === "ASSURANCE_RECEIPT_LIFECYCLE_V2"
      && receiptContract?.contract === receiptPolicy.contract
      && [
        "ownerAuthorizationRequiredBeforeDevelopment",
        "ownerAuthorizationSurvivesInScopeDescendants",
        "finalSourceAttestationIssuedAfterReviewAndPhase1",
        "finalSourceAttestationRequiredForMerge",
        "historicalInvalidAttestationsNonBlocking",
        "appendOnlyEvidenceCorrectionAllowed",
        "sourceChangeInvalidatesAttestationNotOwnerAuthority",
      ].every((field) => receiptPolicy[field] === true && receiptContract[field] === true)
      && [
        "finalSourceAttestationRequiredDuringDevelopment",
        "finalSourceAttestationRequiredForSelfHost",
        "finalSourceAttestationRequiredForRepositoryReview",
        "finalSourceAttestationRequiredForPhase1",
      ].every((field) => receiptPolicy[field] === false && receiptContract[field] === false)
      && Object.values(receiptPolicy?.authority ?? {}).every((value) => value === false);
    if (!receiptPolicyValid) findings.push(finding("ASSURANCE_RECEIPT_LIFECYCLE_POLICY_INVALID"));
    if (stableJson(doctrine).includes('"COMPLETE"')) findings.push(finding("ASSURANCE_UNIVERSAL_COMPLETENESS_CLAIM_REJECTED"));
    try {
      const report = sources.report ?? readJson(doctrine.doctrineReportPath); const graph = sources.graph ?? readJson("config/assurance/whole-app-domain-graph-v1.json"); const noActive = doctrine.activeTaskSentinel === "NO_ACTIVE_PRODUCT_IMPLEMENTATION";
      const packet = noActive ? report.bootstrap?.packet : sources.packet ?? readJson(doctrine.activePacketPath); const certificate = packet?.sections?.L_COMPLETENESS_CERTIFICATE; const packetDomains = packet?.sections?.C_AFFECTED_DOMAIN_CLOSURE ? [packet.sections.C_AFFECTED_DOMAIN_CLOSURE.primaryDomain, ...packet.sections.C_AFFECTED_DOMAIN_CLOSURE.includedDependencies].sort() : [];
      const expected = { doctrineHash: report.hashes?.doctrine, doctrineReportHash: sha256(report), evidenceAuthorityHash: report.hashes?.evidenceAuthority, inventoryHash: graph.inventory?.sourceInventoryHash, graphHash: graph.contentHash, transitionModelHash: report.hashes?.transitionModel, authoritativeReplayHash: report.hashes?.authoritativeReplay, taxonomyHash: report.hashes?.taxonomy, platformProviderContractHash: report.hashes?.platformProviderContracts, featureRegistryHash: report.hashes?.featureRegistry, activePacketHash: sha256(packet), certificateHash: sha256(certificate), defectLedgerHash: packet?.sections?.J_STABLE_DEFECT_LEDGER?.hash };
      for (const [field, value] of Object.entries(expected)) if (doctrine[field] !== value) findings.push(finding("ASSURANCE_ENGINEERING_DOCTRINE_HASH_STALE", { field }));
      const review = certificate?.revisionCounters ?? {}; const packetDiscovery = packet?.sections?.J_STABLE_DEFECT_LEDGER?.discovery; const reportCounters = noActive ? { discoveryPasses: report.discoveryPasses, reconciliationPasses: report.reconciliationPasses, predictableOmissionCount: report.predictableOmissionCount, novelDimensionCount: report.novelDimensionCount, contractDriftCount: report.contractDriftCount, modelRevisionCount: report.modelRevisionCount, verificationCycles: report.verificationCycleCount } : { discoveryPasses: certificate?.discoveryPasses, reconciliationPasses: packetDiscovery?.reconciliationPassC, predictableOmissionCount: review.predictableOmissionCount, novelDimensionCount: review.novelDimensionCount, contractDriftCount: review.contractDriftCount, modelRevisionCount: review.modelRevisionCount, verificationCycles: review.verificationCycleCount }; const expectedCoverage = noActive ? report.coverage ?? {} : certificate?.coverage ?? {};
      if (Object.entries(reportCounters).some(([field, value]) => doctrine[field] !== value) || coverage.some((field) => doctrine[field] !== expectedCoverage[field])) findings.push(finding("ASSURANCE_ENGINEERING_DOCTRINE_REPORT_BINDING_INVALID"));
      if (noActive) { if (doctrine.taskLeaseState !== "NO_ACTIVE_TASK" || doctrine.affectedDomains?.length !== 0 || doctrine.activePacketPath !== doctrine.doctrineReportPath) findings.push(finding("ASSURANCE_ENGINEERING_DOCTRINE_ACTIVE_TASK_BINDING_INVALID")); }
      else {
        const lease = record?.finiteTaskLeases?.tasks?.find((item) => String(item.leaseId) === String(certificate?.leaseId));
        if (!Array.isArray(doctrine.affectedDomains) || doctrine.affectedDomains.length === 0 || stableJson(doctrine.affectedDomains.slice().sort()) !== stableJson(packetDomains) || !lease || doctrine.taskLeaseState !== lease.taskState || doctrine.activePacketPath !== lease.artifactReservation?.closureArtifactPath) findings.push(finding("ASSURANCE_ENGINEERING_DOCTRINE_ACTIVE_TASK_BINDING_INVALID"));
      }
    } catch { findings.push(finding("ASSURANCE_ENGINEERING_DOCTRINE_ARTIFACT_UNREADABLE")); }
  }
  return findings;
}

export function renderCurrentState(record) {
  const protectedMainAuthority = record.protectedMainAuthority;
  const enabled = record.enabledCognitiveSwitches.length ? record.enabledCognitiveSwitches.map((entry) => `\`${entry}\``).join(", ") : "none";
  const blocked = record.blockedProviders.length
    ? record.blockedProviders.map((entry) => `- ${entry.provider}: ${entry.status} — ${entry.scope}. Resume: ${entry.resumptionAction}`).join("\n")
    : "- None.";
  const implementations = record.openImplementationPrs.length
    ? record.openImplementationPrs.map((entry) => `- PR #${entry.number} at \`${entry.head}\`: ${entry.state}; ${entry.disposition}.`).join("\n")
    : "- None.";
  const reviews = record.openReviewOnlyPrs.length
    ? record.openReviewOnlyPrs.map((entry) => `- PR #${entry.number} at \`${entry.head}\`: ${entry.state}, reviews \`${entry.reviewedImplementationHead}\`; ${entry.disposition}.`).join("\n")
    : "- None.";
  const installedQa = record.operationalClosures.installedProductQa;
  const revenueCat = record.operationalClosures.revenueCat;
  const active = record.activeTaskBinding;
  const activeLease = finiteTaskLeaseFor(record.finiteTaskLeases, {
    implementationPr: active.implementationPr,
    implementationBranch: active.implementationBranch,
    featureId: active.featureId
  });
  const leaseLine = activeLease
    ? `\n- Finite task lease: \`${record.finiteTaskLeases.policyId}\`, admitted seed \`${activeLease.admittedSeedHead}\` / \`${activeLease.admittedSeedTree}\`, protected admission PR #${activeLease.protectedAdmissionPr}, state \`${finiteTaskLeaseEffectivelyTerminal(record.finiteTaskLeases, activeLease) ? "MERGED_VERIFIED" : activeLease.taskState}\`; descendant heads do not require another admission, source binding, or merge-provenance PR.`
    : "";
  const runtimeObservation = record.finiteTaskRuntime?.candidateObservation;
  const implementationBindingLine = active.phase === "TERMINAL"
    ? `- Structured terminal task binding: feature \`${active.featureId}\`, PR #${active.implementationPr}, admitted seed \`${active.immutableSourceHead}\` / \`${active.immutableSourceTree}\`, final source \`${active.currentImplementationHead}\` / \`${active.currentImplementationTree}\`, phase \`TERMINAL\`, completion scope \`${active.completionScope}\`. The finite lease remains retained as historical authority; later signed, installed, physical, and public tiers remain independently gated.`
    : active.requiredFreshnessClasses?.includes("REPOSITORY_TASK_LEASE")
    ? `- Structured task-lease binding: feature \`${active.featureId}\`, PR #${active.implementationPr}, admitted seed \`${active.immutableSourceHead}\` / \`${active.immutableSourceTree}\`, phase \`${active.phase}\`, execution \`${active.executionState}\`. Current candidate${runtimeObservation ? ` \`${runtimeObservation.head}\` / \`${runtimeObservation.tree}\`` : ""} is a non-authoritative read-only observation; final receipt, review, Phase 1, and merge provenance bind the frozen final head.`
    : `- Structured implementation binding: feature \`${active.featureId}\`, PR #${active.implementationPr}, immutable \`${active.immutableSourceHead}\` / \`${active.immutableSourceTree}\`, synchronized \`${active.currentImplementationHead}\` / \`${active.currentImplementationTree}\`, phase \`${active.phase}\`, execution \`${active.executionState}\`.`;
  const proofTierStatusLine = active.proofTierStatuses
    ? `\n- Proof-tier statuses: ${tierIds.map((tier) => {
      const status = active.proofTierStatuses[tier];
      return `\`${tier}\`=\`${Array.isArray(status) ? status.join("+") : status}\``;
    }).join(", ")}.`
    : "";
  const currentClaims = record.freshnessClaims
    .filter(({ status }) => status === "CURRENT")
    .map(({ id, freshnessClass, expiresAt }) => `\`${id}\` (${freshnessClass}, expires \`${expiresAt}\`)`)
    .join(", ") || "none";
  const blockedClaims = record.freshnessClaims
    .filter(({ status }) => status !== "CURRENT")
    .map(({ id, freshnessClass, expiresAt }) => `\`${id}\` (${freshnessClass}, ${record.freshnessClaims.find((claim) => claim.id === id).status}, expired \`${expiresAt}\`)`)
    .join(", ") || "none";
  const lateReviews = (record.lateReviewSentinels ?? [])
    .map(({ prNumber, reviewedSha, findings, successorCorrectionOwner }) => `PR #${prNumber} reviewed \`${reviewedSha}\` after merge with ${(findings ?? []).filter(({ disposition }) => disposition !== "RESOLVED").length} unresolved findings; successor \`${successorCorrectionOwner}\``)
    .join("; ") || "none";
  const engineering = record.engineeringDoctrine ? `\n## Engineering doctrine\n\n- \`${record.engineeringDoctrine.doctrineId}\` is \`${record.engineeringDoctrine.status}\`; bounded definition \`${record.engineeringDoctrine.boundedDefinition}\`.\n- Graph \`${record.engineeringDoctrine.graphHash}\`; active packet \`${record.engineeringDoctrine.activePacketHash}\`; task lease \`${record.engineeringDoctrine.taskLeaseState}\`.\n- Next permitted action: \`${record.engineeringDoctrine.nextPermittedAction}\`. No domain readiness entry is a universal app-completion claim.\n` : "";
  const taskContextArchitecture = record.taskContextArchitecture ? `\n## Typed task-context architecture\n\n- Contract \`${record.taskContextArchitecture.contractId}\`; architecture PR #${record.taskContextArchitecture.architecturePr}, source \`${record.taskContextArchitecture.sourceHead}\` / \`${record.taskContextArchitecture.sourceTree}\`, merge \`${record.taskContextArchitecture.mergeSha}\`.\n- Pending terminal transitions: ${record.taskContextArchitecture.pendingTransitions?.map(({ pr, status }) => `PR #${pr}=\`${status}\``).join(", ") || "none"}; count after synchronization \`${record.taskContextArchitecture.pendingTransitionCountAfterSynchronization}\`.\n- Product, provider, build, submission, OTA, and public-release authority remain closed.\n` : "";
  const admissionClearanceCapability = record.finiteTaskAdmissionClearanceCapability ? `\n## Finite-task admission-to-clearance capability\n\n- Contract \`${record.finiteTaskAdmissionClearanceCapability.contract}\` is \`${record.finiteTaskAdmissionClearanceCapability.status}\`; admission and computed clearance share one protected transition: \`${record.finiteTaskAdmissionClearanceCapability.admissionAndClearanceSameProtectedTransition}\`.\n- Product mutation before admission merge is \`${record.finiteTaskAdmissionClearanceCapability.productMutationBeforeAdmissionMerge}\`; a post-admission clearance PR is required: \`${record.finiteTaskAdmissionClearanceCapability.postAdmissionClearancePrRequired}\`. Source descendants retain the finite lease: \`${record.finiteTaskAdmissionClearanceCapability.sourceDescendantsRetainLease}\`.\n` : "";
  const taskLocalEdgeCapability = record.taskLocalGoverningEdgeClosureCapability ? `\n## Task-local governing-edge closure capability\n\n- Contract \`${record.taskLocalGoverningEdgeClosureCapability.contract}\` is \`${record.taskLocalGoverningEdgeClosureCapability.status}\`; the baseline graph remains immutable: \`${record.taskLocalGoverningEdgeClosureCapability.baselineGraphRemainsImmutable}\`.\n- Task-local evidence requires independent verification: \`${record.taskLocalGoverningEdgeClosureCapability.independentVerificationRequired}\`; static edge allowlists and exclusion combinations are not required. Product mutation before admission remains \`${record.taskLocalGoverningEdgeClosureCapability.productMutationBeforeAdmission}\`.\n` : "";
  const receiptLifecycle = record.receiptLifecyclePolicy ? `\n## Assurance receipt lifecycle\n\n- Contract \`${record.receiptLifecyclePolicy.contract}\`; Owner task authorization survives exact in-scope descendants: \`${record.receiptLifecyclePolicy.ownerAuthorizationSurvivesInScopeDescendants}\`.\n- Final-source attestation is required during development/self-host/review/Phase 1: \`${record.receiptLifecyclePolicy.finalSourceAttestationRequiredDuringDevelopment}\`/\`${record.receiptLifecyclePolicy.finalSourceAttestationRequiredForSelfHost}\`/\`${record.receiptLifecyclePolicy.finalSourceAttestationRequiredForRepositoryReview}\`/\`${record.receiptLifecyclePolicy.finalSourceAttestationRequiredForPhase1}\`; it is issued after review and Phase 1 and required for merge. Historical invalid attestations are non-blocking when exactly one valid current attestation exists.\n` : "";
  const testAdaptationOverlay = record.finiteTaskLeases?.testAdaptationPolicy ? `\n## Finite-task test-adaptation overlay\n\n- Capability \`${record.finiteTaskLeases.testAdaptationPolicy.capability}\` permits at most one immutable Owner receipt for one exact pre-existing fixture path and \`${record.finiteTaskLeases.testAdaptationPolicy.maximumChangedLines}\` fixture-only canonical changed lines.\n- The implementation reservation remains independent; budget pooling, wildcard paths, product mutation, provider mutation, database deployment, build, submission, OTA, and public-release authority remain forbidden.\n` : "";
  const jurisdictionCapability = record.ownerJurisdictionPolicyCapability ? `\n## Owner jurisdiction policy capability\n\n- Contract \`${record.ownerJurisdictionPolicyCapability.contract}\` is \`${record.ownerJurisdictionPolicyCapability.status}\`; standing policy may be reused: \`${record.ownerJurisdictionPolicyCapability.standingPolicyReusable}\`; domain coverage may be reused: \`${record.ownerJurisdictionPolicyCapability.domainCoverageReusable}\`. Every task must enumerate exact domains: \`${record.ownerJurisdictionPolicyCapability.exactTaskDomainsRequired}\`.\n- Legacy receipts retain their original semantics. External proof is never inherited, operational ownership is preserved, and this capability grants no product, provider, database-deployment, build, submission, OTA, or public-release authority.${record.ownerJurisdictionPolicyBinding ? `\n- Current immutable policy source: comment #${record.ownerJurisdictionPolicyBinding.policySource.commentId}, standing-policy hash \`${record.ownerJurisdictionPolicyBinding.policySource.standingPolicyHash}\`, status \`${record.ownerJurisdictionPolicyBinding.policySource.status}\`; task binding \`${record.ownerJurisdictionPolicyBinding.taskBinding.bindingHash}\` covers \`${record.ownerJurisdictionPolicyBinding.coverage.coveredCount}/${record.ownerJurisdictionPolicyBinding.taskBinding.domainIds.length}\` exact domains.` : "\n- No immutable standing-policy receipt is bound in current truth yet."}\n` : "";
  const preAdmissionCapability = `${record.preAdmissionEngineeringSeedCapability ? `\n## Pre-admission engineering seed capability\n\n- Contract \`${record.preAdmissionEngineeringSeedCapability.contract}\` is \`${record.preAdmissionEngineeringSeedCapability.status}\`; product mutation is \`${record.preAdmissionEngineeringSeedCapability.productMutationAllowed}\` until finite lease admission through \`${record.preAdmissionEngineeringSeedCapability.admissionContext}\`.\n- Static PR binding, source-binding PR, and provenance PR are not required. Immediate next action: \`${record.preAdmissionEngineeringSeedCapability.nextAction}\`.\n` : ""}${admissionClearanceCapability}${taskLocalEdgeCapability}${jurisdictionCapability}${receiptLifecycle}${testAdaptationOverlay}`;
  return `# CURRENT STATE\n\nGenerated from \`config/assurance/current-truth-v1.json\`. Do not hand-edit.\n\n- Protected authority checkpoint: \`${protectedMainAuthority.checkpointSha}\` / tree \`${protectedMainAuthority.checkpointTree}\`.\n- Protected-main advancement is evaluated dynamically from exact Git history; the runtime-observed protected main is derived at execution and is not committed as authority after every merge.\n- Ordinary protected advancement invalidates only affected task evidence. Terminal task or authority transitions require canonical synchronization.\n- Latest merged implementation: PR #${record.latestMergedImplementationPr.number}, \`${record.latestMergedImplementationPr.head}\`; merge \`${record.latestMergedImplementationPr.mergeSha}\`.\n${implementationBindingLine}${proofTierStatusLine}${leaseLine}\n- Review policy: provider Codex Review is \`${record.reviewPolicy.classification}\`, is not a required status check, does not block progress or merge, and may become blocking only after independent repository validation; all ${record.reviewPolicy.requiredPhase1Checks} Phase 1 checks and repository-owned exact-head review remain required.\n- Assurance program display text: ${record.assuranceProgram.active}; completed: ${record.assuranceProgram.completed.join(", ") || "none"}.\n- Android internal: build ${record.android.buildNumber}, runtime \`${record.android.runtime}\`, channel \`${record.android.channel}\`, update \`${record.android.updateId}\`.\n- iOS internal: build ${record.ios.buildNumber}, runtime \`${record.ios.runtime}\`, channel \`${record.ios.channel}\`, update \`${record.ios.updateId}\`.\n- Historical provider value only: remote migration head \`${record.remoteMigrationHead}\`; current provider proof is not claimed.\n- Historical provider snapshot only: enabled Cognitive switches recorded as ${enabled}; no current switch proof is claimed.\n- Historical provider snapshot only: Cognitive schedules recorded as ${record.scheduleState.enabled}/${record.scheduleState.total} enabled; effective baseline count recorded as ${record.effectiveBaselineCount}.\n- Historical provider snapshot only: Cognitive LiveKit recorded ${record.safety.livekitSentinelRuns} formal runs, ${record.safety.livekitFindings} findings, and ${record.safety.livekitSwitchesEnabled} enabled switches.\n- Historical provider/safety snapshot only: PUBLIC schema \`net\` USAGE recorded as ${record.safety.publicSchemaNetUsage}; user-derived memory recorded as ${record.safety.userDerivedMemory}; Level 2 repair recorded as ${record.safety.level2Repair}. None is current provider proof.\n- Chi'llywood autonomous app operating model is now documented and guarded at \`${record.operatingPolicy.modelDocument}\`; Level 0/1 work does not require owner approval, while Level 3/4 boundaries do.\n- Installed Product QA closure is retained as historical evidence only: ${installedQa.schedulerStatus}; proof rows ${installedQa.proofRowIds.map((id) => `\`${id}\``).join(", ")}; last recorded matrix state \`${installedQa.currentMatrixState}\`. It is not fresh installed or physical proof.\n- RevenueCat closure values are historical only, not current provider proof: dashboard TEST recorded HTTP \`${revenueCat.dashboardTest.httpStatus}\` / \`${revenueCat.dashboardTest.result}\` with \`premiumGranted=${revenueCat.premiumGranted}\`, \`liveMoneyAction=${revenueCat.liveMoneyAction}\`, and \`moneyMoved=${revenueCat.moneyMoved}\`.\n- Current freshness claims: ${currentClaims}.\n- Blocked freshness claims: ${blockedClaims}.\n- Internally validated historical review sentinels: ${lateReviews}. Only protected-main registered finding sets block post-merge completion claims, unrelated successor work, release, and proof-tier promotion; unvalidated Codex commentary remains advisory triage.\n- Document rendered at \`${record.timestamp}\`; document deadline \`${record.freshnessDeadline}\` is diagnostic only and grants no universal implementation authority. Claim-scoped freshness remains mandatory. Derived live provider readback: ${record.liveProviderReadback}.\n${engineering}${taskContextArchitecture}${preAdmissionCapability}\n## Open implementation PRs\n\n${implementations}\n\n## Open review-only PRs\n\n${reviews}\n\n## Current external blockers\n\n${blocked}\n\nHistorical proof belongs in Git history and scoped reports, not this hot path.\n`;
}

export function renderNextTask(record) {
  const finiteTaskTerminalNext = record?.activeTaskBinding?.phase === "TERMINAL"
    && ["FINITE_TASK_AMENDED_POST_MERGE_TERMINAL_EVIDENCE_V1", "FINITE_TASK_AMENDED_TEST_ADAPTATION_POST_MERGE_TERMINAL_EVIDENCE_V2"].includes(record?.finiteTaskRuntime?.terminalOutcome?.classification)
    ? record.finiteTaskRuntime.terminalOutcome.nextTask
    : null;
  const nextActions = finiteTaskTerminalNext
    ? [finiteTaskTerminalNext]
    : record.preAdmissionEngineeringSeedCapability?.status === "ACTIVE" && record.engineeringDoctrine?.taskLeaseState === "NO_ACTIVE_TASK"
    ? [record.preAdmissionEngineeringSeedCapability.nextAction]
    : record.engineeringDoctrine?.status === "ACTIVE" ? [record.engineeringDoctrine.nextPermittedAction] : record.assuranceProgram.nextActions;
  const actions = nextActions.map((entry, index) => `${index + 1}. ${entry}`).join("\n");
  return `# NEXT TASK\n\nGenerated from \`config/assurance/current-truth-v1.json\`. Do not hand-edit.\n\n${actions}\n\nOrdinary protected-main advancement never requires a truth-only prerequisite PR. If the active candidate is behind, merge current protected main normally and regenerate the packet. Canonical synchronization remains required for terminal task or authority transitions.\n\nDo not ask owner approval for Level 0/1 autonomous operations. Keep Level 3/4 owner approval and external-confirmation boundaries intact.\n\n${record.assuranceProgram.prohibitions.join("\n")}\n`;
}

export function projectFiniteTaskTerminalTruth({ record, terminalEvidence, proofTierApplicabilityHash, implementationTitle = null } = {}) {
  const projected = structuredClone(record);
  const binding = projected?.activeTaskBinding;
  const lease = finiteTaskLeaseFor(projected?.finiteTaskLeases, {
    implementationPr: terminalEvidence?.implementationPr,
    implementationBranch: terminalEvidence?.implementationBranch,
    featureId: binding?.featureId
  });
  if (!lease
    || sha256(lease) !== terminalEvidence?.baseLeaseHash
    || !["FINITE_TASK_AMENDED_POST_MERGE_TERMINAL_EVIDENCE_V1", "FINITE_TASK_AMENDED_TEST_ADAPTATION_POST_MERGE_TERMINAL_EVIDENCE_V2"].includes(terminalEvidence?.classification)
    || !finiteTaskTerminalOutcomeMatchesLease(projected?.finiteTaskLeases, lease, terminalEvidence)
    || !sha256Pattern.test(proofTierApplicabilityHash ?? "")) throw new Error("FINITE_TASK_TERMINAL_PROJECTION_INVALID");
  const priorOutcomes = projected.finiteTaskLeases.completedLeaseOutcomes ?? [];
  const sameLease = priorOutcomes.filter(({ leaseId }) => leaseId === lease.leaseId);
  if (sameLease.length > 1 || (sameLease.length === 1 && stableJson(sameLease[0]) !== stableJson(terminalEvidence))) throw new Error("FINITE_TASK_TERMINAL_PROJECTION_CONFLICT");
  if (!sameLease.length && priorOutcomes.some((outcome) => finiteTaskTerminalOutcomeIdentity(outcome).some((value, index) => value != null && value === finiteTaskTerminalOutcomeIdentity(terminalEvidence)[index]))) throw new Error("FINITE_TASK_TERMINAL_PROJECTION_IDENTITY_REUSED");
  projected.finiteTaskLeases.completedLeaseOutcomes = sameLease.length ? priorOutcomes : [...priorOutcomes, structuredClone(terminalEvidence)];
  projected.mainSha = terminalEvidence.mergeSha;
  projected.protectedMainAuthority.checkpointSha = terminalEvidence.mergeSha;
  projected.protectedMainAuthority.checkpointTree = terminalEvidence.mergeTree;
  projected.latestMergedImplementationPr = {
    number: terminalEvidence.implementationPr,
    state: "merged",
    head: terminalEvidence.sourceHead,
    mergeSha: terminalEvidence.mergeSha,
    mergeTree: terminalEvidence.mergeTree,
    title: implementationTitle ?? `Finite task ${terminalEvidence.taskId}`
  };
  projected.openImplementationPrs = (projected.openImplementationPrs ?? []).filter(({ number }) => number !== terminalEvidence.implementationPr);
  projected.activeTaskBinding = {
    ...projected.activeTaskBinding,
    currentImplementationHead: terminalEvidence.sourceHead,
    currentImplementationTree: terminalEvidence.sourceTree,
    phase: "TERMINAL",
    executionState: "FINITE_TASK_SOURCE_MERGED_VERIFIED",
    completionScope: "FINITE_TASK_SOURCE_MERGED_VERIFIED",
    proofTiersUnderEvaluation: ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION"],
    proofTierStatuses: {
      T0_REQUIREMENT: "REQUIREMENTS_CLEAR",
      T1_SOURCE: "SOURCE_CLEAR",
      T2_MODEL: "MODEL_CLEAR",
      T3_INTEGRATION: "INTEGRATION_CLEAR",
      T4_NATIVE_PROVIDER: "BLOCKED_INTERNAL",
      T5_SIGNED_ARTIFACT: "BLOCKED_EXTERNAL",
      T6_INSTALLED_PHYSICAL: "BLOCKED_EXTERNAL",
      T7_PUBLIC_CANARY: "BLOCKED_EXTERNAL"
    },
    proofTierApplicabilityHash,
    productSourceMutationAllowed: false,
    providerMutationAllowed: false,
    databaseDeploymentAllowed: false,
    buildAllowed: false,
    submissionAllowed: false,
    otaAllowed: false,
    publicReleaseAllowed: false,
    terminalEvidence: structuredClone(terminalEvidence)
  };
  projected.finiteTaskRuntime = {
    ...projected.finiteTaskRuntime,
    candidateObservation: {
      pr: terminalEvidence.implementationPr,
      branch: terminalEvidence.implementationBranch,
      prState: "merged",
      head: terminalEvidence.sourceHead,
      tree: terminalEvidence.sourceTree,
      classification: "MERGED_VERIFIED",
      observedAt: projected.timestamp
    },
    terminalOutcome: structuredClone(terminalEvidence)
  };
  if (sha256(lease) !== terminalEvidence.baseLeaseHash) throw new Error("FINITE_TASK_TERMINAL_BASE_LEASE_MUTATED");
  return projected;
}

export function classifyMigration(remote, source) {
  if (!source) return "REMOTE_ONLY";
  if (!remote) return "SOURCE_ONLY";
  if (remote.version !== source.version || remote.name !== source.name) return "VERSION_MISMATCH";
  if (remote.hash !== source.hash) return "BODY_MISMATCH";
  return "REMOTE_AND_SOURCE_MATCH";
}
