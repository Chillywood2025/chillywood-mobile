#!/usr/bin/env node
import crypto from "node:crypto";
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
  return execFileSync("git", gitArgs, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...options }).trim();
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
  "ACTIVE_IMPLEMENTATION",
  "BLOCKED_PRODUCT_FINDING",
  "MERGE_ELIGIBLE",
  "MERGED_VERIFIED",
  "ABANDONED_BY_OWNER"
];
const finiteTaskActiveStates = new Set(finiteTaskStates.slice(0, 3));
const finiteTaskTerminalStates = new Set(finiteTaskStates.slice(3));
const sha256Pattern = /^[0-9a-f]{64}$/u;

export function finiteTaskLeaseFor(registry, { implementationPr, implementationBranch, featureId } = {}) {
  const matches = (registry?.tasks ?? []).filter((task) => task?.implementationPr === implementationPr
    && task?.implementationBranch === implementationBranch
    && (featureId === undefined || task?.featureId === featureId));
  return matches.length === 1 ? matches[0] : null;
}

export function validateFiniteTaskLeaseRegistry(registry) {
  const findings = [];
  const tasks = Array.isArray(registry?.tasks) ? registry.tasks : [];
  const amendmentDomains = Array.isArray(registry?.amendmentPolicy?.domains) ? registry.amendmentPolicy.domains : [];
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
    || tasks.length < 1) findings.push("FINITE_TASK_LEASE_REGISTRY_MALFORMED");
  for (const domain of amendmentDomains) {
    if (typeof domain?.id !== "string" || !domain.id
      || !Array.isArray(domain.amendablePaths) || !domain.amendablePaths.length
      || new Set(domain.amendablePaths).size !== domain.amendablePaths.length
      || domain.amendablePaths.some((file) => typeof file !== "string" || !file || file.includes("*") || file.startsWith("/") || file.includes("..") || file.endsWith("lock") || file === "package.json")
      || !Number.isInteger(domain.maximumFiles) || domain.maximumFiles < 1
      || !Number.isInteger(domain.maximumChangedLines) || domain.maximumChangedLines < 1) findings.push("FINITE_TASK_LEASE_AMENDMENT_POLICY_MALFORMED");
  }
  const seenPrs = new Set();
  const seenBranches = new Set();
  for (const task of tasks) {
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
      || stableJson(task.recursionBudget) !== stableJson({ maximumAdmissionPrs: 1, maximumFinalSourceBindingPrs: 0, maximumMergeProvenancePrs: 0, maximumPostMergeTruthPrs: 1 })) {
      findings.push("FINITE_TASK_LEASE_MALFORMED");
    }
    if (seenPrs.has(task?.implementationPr) || seenBranches.has(task?.implementationBranch)) findings.push("FINITE_TASK_LEASE_DUPLICATE");
    seenPrs.add(task?.implementationPr);
    seenBranches.add(task?.implementationBranch);
  }
  return [...new Set(findings)].sort();
}

export function evaluateFiniteTaskCandidate({ lease, registry, candidate }) {
  const findings = validateFiniteTaskLeaseRegistry(registry);
  if (!lease || !candidate) return { ok: false, leaseRetained: false, findings: [...new Set([...findings, "FINITE_TASK_CANDIDATE_MALFORMED"])].sort() };
  if (candidate.pr !== lease.implementationPr) findings.push("FINITE_TASK_WRONG_PR");
  if (candidate.branch !== lease.implementationBranch) findings.push("FINITE_TASK_WRONG_BRANCH");
  if (candidate.prState !== "open") findings.push("FINITE_TASK_PR_NOT_OPEN");
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
  } else if (candidate.observationSource !== undefined && candidate.observationSource !== "LOCAL_REMOTE_IMPLEMENTATION_BRANCH") {
    findings.push("FINITE_TASK_CANDIDATE_OBSERVATION_SOURCE_INVALID");
  }
  const changedPaths = Array.isArray(candidate.changedPaths) ? candidate.changedPaths : [];
  if (changedPaths.some((entry) => !lease.allowedPaths.includes(entry))) findings.push("FINITE_TASK_UNAUTHORIZED_PATH");
  if (changedPaths.length > lease.scopeBudget.maximumFiles
    || !Number.isInteger(candidate.changedLines)
    || candidate.changedLines < 0
    || candidate.changedLines > lease.scopeBudget.maximumChangedLines) findings.push("FINITE_TASK_SCOPE_OVERFLOW");
  const competitors = (registry?.tasks ?? []).filter((task) => task.leaseId !== lease.leaseId
    && task.domain === lease.domain
    && task.domainOwnership === "ACTIVE"
    && !finiteTaskTerminalStates.has(task.taskState));
  if (competitors.length) findings.push("FINITE_TASK_COMPETING_DOMAIN_OWNER");
  if (!finiteTaskActiveStates.has(lease.taskState)) findings.push("FINITE_TASK_TERMINAL");
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
  "phase1RunId", "phase1Head"
];
const finalReceiptMarker = "<!-- chillywood-assurance-final-task-receipt-v1 -->";

export function finiteTaskFinalReceiptSubject(value) {
  return Object.fromEntries(finalReceiptFields.map((field) => [field, structuredClone(value?.[field])]));
}

export function finiteTaskFinalReceiptBody(value) {
  const subject = finiteTaskFinalReceiptSubject(value);
  return `${finalReceiptMarker}\n${stableJson({ subject, subjectHash: sha256(subject) })}`;
}

export function verifyFiniteTaskFinalReceipt({ lease, candidate, evidence, receipt, observation }) {
  const subject = finiteTaskFinalReceiptSubject({
    schemaVersion: 1,
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
    phase1Head: evidence?.phase1Head
  });
  const hashesValid = [subject.diffHash, subject.changedPathHash, subject.callDomainClosureLedgerHash,
    subject.focusedTestHash, subject.mutationNegativeControlHash, subject.repositoryReviewHash]
    .every((value) => sha256Pattern.test(value ?? ""));
  const body = finiteTaskFinalReceiptBody(subject);
  const subjectHash = sha256(subject);
  const bodyHash = sha256(body);
  const ok = hashesValid
    && subject.scopeResult === "PASS"
    && Number.isInteger(subject.phase1RunId) && subject.phase1RunId > 0
    && subject.phase1Head === candidate?.head
    && receipt?.subjectHash === subjectHash
    && receipt?.bodySha256 === bodyHash
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
  return { ok, stale: typeof receipt?.subjectHash === "string" && receipt.subjectHash !== subjectHash, subject, subjectHash, bodyHash };
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

export function verifyFiniteTaskMergeProvenance({ lease, receiptSubject, currentProtectedBase, mergeRef, actualMerge = null }) {
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
  let identity;
  if (matchingPullRequestEvent) {
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
  } else {
    const observed = suppliedObservation ?? record?.finiteTaskRuntime?.candidateObservation;
    const remoteHead = safeRuntimeGit(gitCommand, ["show-ref", "--verify", "--hash", implementationRemoteRef(lease.implementationBranch)]);
    identity = {
      pr: observed?.pr,
      branch: observed?.branch,
      prState: observed?.prState,
      head: remoteHead,
      eventBase: protectedBase,
      observationSource: "LOCAL_REMOTE_IMPLEMENTATION_BRANCH",
      recordedObservationHead: observed?.head ?? null
    };
    if (!Number.isInteger(identity.pr)
      || !isValidGitBranchName(identity.branch)
      || identity.prState !== "open"
      || !gitShaPattern.test(identity.head ?? "")) findings.push("FINITE_TASK_LOCAL_OBSERVATION_MALFORMED");
  }
  if (findings.length) return { ok: false, candidate: null, findings: [...new Set(findings)].sort() };
  try {
    const head = identity.head;
    const tree = gitCommand(["rev-parse", `${head}^{tree}`]);
    const seedTree = gitCommand(["rev-parse", `${lease.admittedSeedHead}^{tree}`]);
    const seedIsAncestor = safeRuntimeGit(gitCommand, ["merge-base", "--is-ancestor", lease.admittedSeedHead, head], null) !== null;
    const baseIsAncestor = safeRuntimeGit(gitCommand, ["merge-base", "--is-ancestor", lease.admittedBase, head], null) !== null;
    const range = `${protectedBase}...${head}`;
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
      recordedObservationHead: identity.recordedObservationHead ?? null
    };
    if (matchingPullRequestEvent) {
      const mergeHead = checkoutHead ?? environment?.GITHUB_SHA ?? "HEAD";
      candidate.mergeRefParents = gitCommand(["show", "-s", "--format=%P", mergeHead]).split(/\s+/u).filter(Boolean);
      candidate.mergeRefSourceTree = gitCommand(["rev-parse", `${candidate.mergeRefParents[1] ?? "missing"}^{tree}`]);
      candidate.eventBase = identity.eventBase;
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

export function evaluateFiniteTaskLeaseRuntime({
  record,
  contract,
  now = new Date(),
  suppliedObservation,
  githubEvent,
  checkoutHead,
  currentProtectedBase,
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
  const terminalTask = binding?.phase === "TERMINAL" || finiteTaskTerminalStates.has(lease?.taskState);
  if (!currentProtectedBaseResolution.ok) {
    const findings = [...new Set([
      ...leaseFreshness.blockers.map(({ id }) => id),
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
      taskState: lease?.taskState ?? null,
      terminal: terminalTask
    };
  }
  const resolvedProtectedBase = currentProtectedBaseResolution.protectedBase;
  if (terminalTask) {
    const observation = record?.finiteTaskRuntime?.candidateObservation;
    const latest = record?.latestMergedImplementationPr;
    const terminalFindings = [];
    if (binding?.phase !== "TERMINAL"
      || lease?.taskState !== "MERGED_VERIFIED"
      || lease?.domainOwnership !== "PRESERVED_DEPENDENT") terminalFindings.push("FINITE_TASK_TERMINAL_STATE_MISMATCH");
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
    const findings = [...new Set([
      ...leaseFreshness.blockers.map(({ id }) => id),
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
        taskState: lease?.taskState ?? null,
        invalidated: { ownerFinalReceipt: false, repositoryReview: false, phase1: false, mergeEligibility: true },
        findings
      },
      taskState: lease?.taskState ?? null,
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
    gitCommand,
    environment
  });
  const candidateEvaluation = derived.candidate
    ? evaluateFiniteTaskCandidate({ lease, registry: record?.finiteTaskLeases, candidate: derived.candidate })
    : { ok: false, findings: derived.findings, invalidated: null, taskState: lease?.taskState ?? null };
  const findings = [...new Set([
    ...leaseFreshness.blockers.map(({ id }) => id),
    ...derived.findings,
    ...candidateEvaluation.findings
  ])].sort();
  const sourceOnlyEligible = leaseFreshness.eligible
    && derived.ok
    && candidateEvaluation.ok;
  return {
    leaseAuthorityEligible: leaseFreshness.eligible,
    candidateEligible: derived.ok && candidateEvaluation.ok,
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

export function evaluateProtectedMainAdvancement({
  record,
  contract,
  observedProtectedMainSha,
  candidateHead,
  finiteTaskRuntime,
  gitCommand = git,
  advancementObservations,
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
  const activeLeasePaths = new Set(activeLease?.allowedPaths ?? []);
  let prior = checkpointSha;
  const advancements = [];
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
    const companionPresent = (policy.authorityRequiredCompanionPaths ?? []).every((file) => (observation.changedPaths ?? []).includes(file));
    const authorityBound = observation.authorityUpdateBound === true
      || (observation.authorityUpdateBound !== false && authorityChanged && embeddedRollingAuthorityBound(observation.commit, checkpointSha, gitCommand));
    if (authorityChanged && (!companionPresent || !authorityBound)) findings.push("CURRENT_TRUTH_AUTHORITY_CONTROL_DRIFT");
    if (terminalChanged && !(policy.terminalTruthPaths ?? []).every((file) => (observation.changedPaths ?? []).includes(file))) {
      findings.push("CURRENT_TRUTH_TERMINAL_SYNCHRONIZATION_INCOMPLETE");
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
      authorityBound: authorityChanged ? authorityBound : null
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
  const terminalTask = finiteTaskRuntime?.terminal === true && finiteTaskRuntime?.taskState === "MERGED_VERIFIED";
  const candidateBaseStatus = terminalTask
    ? "TERMINAL_MERGED_VERIFIED"
    : candidateCurrent === true ? "CURRENT_WITH_PROTECTED_MAIN" : "BASE_SYNC_REQUIRED";
  const authorityControlEligible = !findings.includes("CURRENT_TRUTH_AUTHORITY_CONTROL_DRIFT")
    && !findings.includes("CURRENT_TRUTH_PROTECTED_MAIN_CHAIN_INVALID");
  const authorityCheckpointEligible = identityValid && ancestor === true
    && actualCheckpointTree === authority.checkpointTree
    && authorityControlEligible;
  const sourceOnlyEligible = authorityCheckpointEligible
    && (finiteTaskRuntime?.sourceOnlyEligible ?? true);
  const providerDependentEligible = sourceOnlyEligible
    && (finiteTaskRuntime?.providerDependentEligible ?? false);
  const finalEvidence = record?.finiteTaskRuntime?.finalEvidence ?? {};
  const finalEvidenceCurrent = ["ownerReceipt", "repositoryReview", "phase1", "mergeEligible"].every((key) => finalEvidence[key] === true);
  const mergeEligible = !terminalTask && sourceOnlyEligible && candidateCurrent === true && finalEvidenceCurrent;
  const aggregateChangedPaths = [...new Set(advancements.flatMap(({ changedPaths }) => changedPaths))].sort();
  let aggregateDiffHash = sha256("");
  if (identityValid && ancestor === true && checkpointSha !== observedSha) {
    try { aggregateDiffHash = sha256(gitCommand(["diff", "--binary", checkpointSha, observedSha])); } catch { findings.push("CURRENT_TRUTH_PROTECTED_MAIN_CHAIN_INVALID"); }
  }
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
    nextRequiredAction: terminalTask
      ? "CONTINUE_TERMINAL_HANDOFF"
      : candidateBaseStatus === "BASE_SYNC_REQUIRED" ? "MERGE_CURRENT_PROTECTED_MAIN_NORMALLY" : "CONTINUE_ACTIVE_TASK",
    sourceOnlyEligible,
    providerDependentEligible,
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

const taskLeaseAmendmentMarker = "<!-- chillywood-assurance-task-lease-amendment-v1 -->";
const amendmentSubjectFields = ["schemaVersion", "repository", "leaseId", "pr", "branch", "currentCandidateHead", "currentLeaseHash", "addedPaths", "registeredDomain", "reason", "newScopeMaximum", "excludedAuthority"];

export function taskLeaseAmendmentSubject(value) {
  return Object.fromEntries(amendmentSubjectFields.map((field) => [field, structuredClone(value?.[field])]));
}

export function taskLeaseAmendmentCommentBody(value) {
  const subject = taskLeaseAmendmentSubject(value);
  return `${taskLeaseAmendmentMarker}\n${stableJson({ subject, subjectHash: sha256(subject) })}`;
}

export function verifyTaskLeaseAmendment({ registry, lease, candidate, subject: input, observation } = {}) {
  const subject = taskLeaseAmendmentSubject(input);
  const body = taskLeaseAmendmentCommentBody(subject);
  const findings = [];
  const domain = (registry?.amendmentPolicy?.domains ?? []).find(({ id }) => id === lease?.domain);
  const addedPaths = Array.isArray(subject.addedPaths) ? [...new Set(subject.addedPaths)].sort() : [];
  const authorizedPaths = new Set(domain?.amendablePaths ?? []);
  const competitor = (registry?.tasks ?? []).some((task) => task.leaseId !== lease?.leaseId
    && task.domain === lease?.domain
    && task.domainOwnership === "ACTIVE"
    && !finiteTaskTerminalStates.has(task.taskState));
  if (!lease || !candidate || subject.schemaVersion !== 1
    || subject.repository !== "Chillywood2025/chillywood-mobile"
    || subject.leaseId !== lease.leaseId
    || subject.pr !== lease.implementationPr
    || subject.branch !== lease.implementationBranch
    || subject.currentCandidateHead !== candidate.head
    || subject.currentLeaseHash !== sha256(lease)
    || subject.registeredDomain !== lease.domain
    || typeof subject.reason !== "string" || !subject.reason
    || !addedPaths.length
    || addedPaths.some((file) => !authorizedPaths.has(file) || file.includes("*") || file.endsWith("lock") || file === "package.json")
    || stableJson(subject.excludedAuthority) !== stableJson(closedMaintenanceAuthority)
    || !Number.isInteger(subject.newScopeMaximum?.maximumFiles)
    || !Number.isInteger(subject.newScopeMaximum?.maximumChangedLines)
    || subject.newScopeMaximum.maximumFiles < new Set([...lease.allowedPaths, ...addedPaths]).size
    || subject.newScopeMaximum.maximumFiles > domain?.maximumFiles
    || subject.newScopeMaximum.maximumChangedLines < lease.scopeBudget.maximumChangedLines
    || subject.newScopeMaximum.maximumChangedLines > domain?.maximumChangedLines) findings.push("FINITE_TASK_LEASE_AMENDMENT_MALFORMED");
  if (competitor) findings.push("FINITE_TASK_COMPETING_DOMAIN_OWNER");
  if (observation?.commentId !== observation?.id
    || !Number.isInteger(observation?.commentId) || observation.commentId < 1
    || observation.author !== "Chillywood2025"
    || observation.authorAssociation !== "OWNER"
    || observation.createdAt !== observation.updatedAt
    || observation.issueUrl !== `https://api.github.com/repos/Chillywood2025/chillywood-mobile/issues/${lease?.implementationPr}`
    || observation.body !== body) findings.push("FINITE_TASK_LEASE_AMENDMENT_COMMENT_INVALID");
  const unique = [...new Set(findings)].sort();
  return {
    ok: unique.length === 0,
    findings: unique,
    subject,
    subjectHash: sha256(subject),
    bodyHash: sha256(body),
    amendedLease: unique.length ? null : {
      ...structuredClone(lease),
      allowedPaths: [...new Set([...lease.allowedPaths, ...addedPaths])].sort(),
      scopeBudget: structuredClone(subject.newScopeMaximum)
    }
  };
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

export function verifyCurrentTruthHeadBindings({
  openImplementationPrs,
  observedRefs,
  finiteTaskLeases = null,
  branch,
  head,
  remoteMain,
  explicitBranch = "",
  explicitHead = "",
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
    let classification = observed === entry?.head ? "EXACT_SOURCE_HEAD" : "UNVERIFIED_HEAD";
    let synchronization = null;
    let finiteLeaseCandidate = null;
    if (observedValid && headValid && observed !== entry.head) {
      const lease = finiteTaskLeaseFor(finiteTaskLeases, {
        implementationPr: entry.number,
        implementationBranch: entry.branch,
        featureId: entry.featureId
      });
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
            tree: git(["rev-parse", `${observed}^{tree}`]),
            seedTree: git(["rev-parse", `${lease.admittedSeedHead}^{tree}`]),
            seedIsAncestor: isAncestor(lease.admittedSeedHead, observed),
            baseIsAncestor: isAncestor(lease.admittedBase, observed),
            changedPaths,
            changedLines,
            findings: lease.taskState === "BLOCKED_PRODUCT_FINDING" ? { P0: 0, P1: 1, launchImpactingP2: 0 } : { P0: 0, P1: 0, launchImpactingP2: 0 }
          }
        });
        if (finiteLeaseCandidate.ok) classification = "FINITE_TASK_LEASE_CANDIDATE";
      }
      if (!finiteLeaseCandidate?.ok) {
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
        if (synchronization.ok) classification = synchronization.classification;
      }
    }
    bindings.push({
      branch: entry.branch,
      classification,
      number: numberValid ? entry.number : null,
      observedHead: observed,
      recordedHead: entry?.head ?? null,
      ref,
      synchronization,
      finiteLeaseCandidate
    });

    if (observed === null || observed === undefined || observed === "") {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_REF_MISSING", status: "BLOCKED_INTERNAL", branch: entry.branch, number: numberValid ? entry.number : null, ref });
    } else if (!observedValid) {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_OBSERVED_HEAD_MALFORMED", status: "BLOCKED_INTERNAL", branch: entry.branch, number: numberValid ? entry.number : null, observed });
    } else if (headValid && observed !== entry.head && !synchronization?.ok && !finiteLeaseCandidate?.ok) {
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
  const acceptedCheckoutHead = ["BASE_SYNCHRONIZED_IMPLEMENTATION_BRANCH", "CURRENT_TRUTH_BINDING_COMMIT"].includes(currentBinding?.classification)
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
    if (binding?.completionScope !== "D2A_BOUND_COMPLETE_FOR_REGISTERED_NATIVE_LIFECYCLE_SCOPE"
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

export function validateEngineeringDoctrineTruth(record, contract, sources = {}) {
  const doctrine = record?.engineeringDoctrine;
  if (doctrine === undefined) return contract?.engineeringDoctrinePolicy?.optionalBeforeImplementationMerge === true && sources.currentMain === "8bf6459c3ae1cec62e26a1694f03063e4291b9f8" && sources.implementationMerged === false ? [] : [{ id: "ASSURANCE_ENGINEERING_DOCTRINE_MISSING", status: "BLOCKED_INTERNAL" }];
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
    ? `\n- Finite task lease: \`${record.finiteTaskLeases.policyId}\`, admitted seed \`${activeLease.admittedSeedHead}\` / \`${activeLease.admittedSeedTree}\`, protected admission PR #${activeLease.protectedAdmissionPr}, state \`${activeLease.taskState}\`; descendant heads do not require another admission, source binding, or merge-provenance PR.`
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
  return `# CURRENT STATE\n\nGenerated from \`config/assurance/current-truth-v1.json\`. Do not hand-edit.\n\n- Protected authority checkpoint: \`${protectedMainAuthority.checkpointSha}\` / tree \`${protectedMainAuthority.checkpointTree}\`.\n- Protected-main advancement is evaluated dynamically from exact Git history; the runtime-observed protected main is derived at execution and is not committed as authority after every merge.\n- Ordinary protected advancement invalidates only affected task evidence. Terminal task or authority transitions require canonical synchronization.\n- Latest merged implementation: PR #${record.latestMergedImplementationPr.number}, \`${record.latestMergedImplementationPr.head}\`; merge \`${record.latestMergedImplementationPr.mergeSha}\`.\n${implementationBindingLine}${proofTierStatusLine}${leaseLine}\n- Review policy: provider Codex Review is \`${record.reviewPolicy.classification}\`, is not a required status check, does not block progress or merge, and may become blocking only after independent repository validation; all ${record.reviewPolicy.requiredPhase1Checks} Phase 1 checks and repository-owned exact-head review remain required.\n- Assurance program display text: ${record.assuranceProgram.active}; completed: ${record.assuranceProgram.completed.join(", ") || "none"}.\n- Android internal: build ${record.android.buildNumber}, runtime \`${record.android.runtime}\`, channel \`${record.android.channel}\`, update \`${record.android.updateId}\`.\n- iOS internal: build ${record.ios.buildNumber}, runtime \`${record.ios.runtime}\`, channel \`${record.ios.channel}\`, update \`${record.ios.updateId}\`.\n- Historical provider value only: remote migration head \`${record.remoteMigrationHead}\`; current provider proof is not claimed.\n- Historical provider snapshot only: enabled Cognitive switches recorded as ${enabled}; no current switch proof is claimed.\n- Historical provider snapshot only: Cognitive schedules recorded as ${record.scheduleState.enabled}/${record.scheduleState.total} enabled; effective baseline count recorded as ${record.effectiveBaselineCount}.\n- Historical provider snapshot only: Cognitive LiveKit recorded ${record.safety.livekitSentinelRuns} formal runs, ${record.safety.livekitFindings} findings, and ${record.safety.livekitSwitchesEnabled} enabled switches.\n- Historical provider/safety snapshot only: PUBLIC schema \`net\` USAGE recorded as ${record.safety.publicSchemaNetUsage}; user-derived memory recorded as ${record.safety.userDerivedMemory}; Level 2 repair recorded as ${record.safety.level2Repair}. None is current provider proof.\n- Chi'llywood autonomous app operating model is now documented and guarded at \`${record.operatingPolicy.modelDocument}\`; Level 0/1 work does not require owner approval, while Level 3/4 boundaries do.\n- Installed Product QA closure is retained as historical evidence only: ${installedQa.schedulerStatus}; proof rows ${installedQa.proofRowIds.map((id) => `\`${id}\``).join(", ")}; last recorded matrix state \`${installedQa.currentMatrixState}\`. It is not fresh installed or physical proof.\n- RevenueCat closure values are historical only, not current provider proof: dashboard TEST recorded HTTP \`${revenueCat.dashboardTest.httpStatus}\` / \`${revenueCat.dashboardTest.result}\` with \`premiumGranted=${revenueCat.premiumGranted}\`, \`liveMoneyAction=${revenueCat.liveMoneyAction}\`, and \`moneyMoved=${revenueCat.moneyMoved}\`.\n- Current freshness claims: ${currentClaims}.\n- Blocked freshness claims: ${blockedClaims}.\n- Internally validated historical review sentinels: ${lateReviews}. Only protected-main registered finding sets block post-merge completion claims, unrelated successor work, release, and proof-tier promotion; unvalidated Codex commentary remains advisory triage.\n- Document rendered at \`${record.timestamp}\`; document deadline \`${record.freshnessDeadline}\` is diagnostic only and grants no universal implementation authority. Claim-scoped freshness remains mandatory. Derived live provider readback: ${record.liveProviderReadback}.\n${engineering}\n## Open implementation PRs\n\n${implementations}\n\n## Open review-only PRs\n\n${reviews}\n\n## Current external blockers\n\n${blocked}\n\nHistorical proof belongs in Git history and scoped reports, not this hot path.\n`;
}

export function renderNextTask(record) {
  const nextActions = record.engineeringDoctrine?.status === "ACTIVE" ? [record.engineeringDoctrine.nextPermittedAction] : record.assuranceProgram.nextActions;
  const actions = nextActions.map((entry, index) => `${index + 1}. ${entry}`).join("\n");
  return `# NEXT TASK\n\nGenerated from \`config/assurance/current-truth-v1.json\`. Do not hand-edit.\n\n${actions}\n\nOrdinary protected-main advancement never requires a truth-only prerequisite PR. If the active candidate is behind, merge current protected main normally and regenerate the packet. Canonical synchronization remains required for terminal task or authority transitions.\n\nDo not ask owner approval for Level 0/1 autonomous operations. Keep Level 3/4 owner approval and external-confirmation boundaries intact.\n\n${record.assuranceProgram.prohibitions.join("\n")}\n`;
}

export function classifyMigration(remote, source) {
  if (!source) return "REMOTE_ONLY";
  if (!remote) return "SOURCE_ONLY";
  if (remote.version !== source.version || remote.name !== source.name) return "VERSION_MISMATCH";
  if (remote.hash !== source.hash) return "BODY_MISMATCH";
  return "REMOTE_AND_SOURCE_MATCH";
}
