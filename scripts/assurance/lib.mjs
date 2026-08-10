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
const canonicalLateReviewOwnerRegistry = [{
  repository: "Chillywood2025/chillywood-mobile",
  prNumber: 194,
  mergeSha: "4ee283aa851bb2042a7559a54a1664d6eebcb446",
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
  successorCorrectionOwner: "codex/assurance-active-task-and-claim-freshness-a1",
  assuranceControlOwner: "codex/assurance-active-task-and-claim-freshness-a1",
  authorizedBootstrapOwners: [
    "codex/assurance-active-task-and-claim-freshness-a1",
    "codex/assurance-codex-security-scan-reliability-s0"
  ]
}];
const claimClassPolicy = {
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
  { factId: "repository.assurance-control.a1.requirements", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "A1 Owner control requirements, prohibited mutations, review-gate, claim-freshness, and bootstrap boundaries are recorded as executable assurance requirements" },
  { factId: "repository.assurance-control.a1.source", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "A1 assurance-control source implements structured active-task authority, exact-head review gating, late-review detection, claim-scoped freshness, and fail-closed external receipt verification" },
  { factId: "repository.assurance-control.a1.model", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "A1 executable focused regressions reject task, head, review-surface, pagination, freshness, receipt, and proof-status substitutions" },
  { factId: "repository.assurance-control.a1.integration", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "A1 integration contracts connect active-task and current-truth validation with the exact-head review gate and Phase 1 workflow" },
  { factId: "repository.assurance-control.a1.post-merge-control-readback", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", requiresReadbackHash: true, historicalEvidence: "A1 PR 201 merge, exact Phase 1 run 31350394428, ruleset 18940814 protection, and durable PR 194 sentinel issue 203 were read back from GitHub" },
  { factId: "repository.assurance-control.a1.complete-late-sentinel-inventory", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", requiresReadbackHash: true, historicalEvidence: "Canonical late-review owner registry and sentinel inventory include exact unresolved PR 194 and PR 195 records" },
  { factId: "repository.assurance-control.a1.late-review-tombstone-admission", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", requiresReadbackHash: true, historicalEvidence: "Late-review resolution tombstones retain original sentinels, preserve the canonical correction owner, and require exact-head GitHub readback plus an exact two-parent protected-main carrier merge after the ruleset anchor" },
  { factId: "repository.assurance-control.s0.source", freshnessClass: "REPOSITORY_SOURCE", authorityAllowed: "REPOSITORY_ONLY", platform: "NONE", provider: "NONE", historicalEvidence: "S0 source implements fail-closed Codex Security snapshot-digest preflight, exact source leasing, bounded lifecycle finalization, terminal no-retry, evidence invalidation, repository fallback, and sanitized incident recording" },
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

function canonicalLateReviewOwnerEntry(sentinel) {
  const matches = canonicalLateReviewOwnerRegistry.filter((entry) => entry.repository === sentinel?.repository
    && entry.prNumber === sentinel?.prNumber
    && entry.mergeSha === sentinel?.mergeSha);
  if (matches.length !== 1) return null;
  const [entry] = matches;
  const registryBoundDiscovery = sentinel.successorCorrectionOwner === "UNASSIGNED_BLOCKED"
    && sentinel.assuranceControlOwner === undefined
    && sentinel.authorizedBootstrapOwners === undefined;
  if (!registryBoundDiscovery && (sentinel.successorCorrectionOwner !== entry.successorCorrectionOwner
    || sentinel.assuranceControlOwner !== entry.assuranceControlOwner
    || !sameStringSet(sentinel.authorizedBootstrapOwners, entry.authorizedBootstrapOwners))) return null;
  return entry;
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

export function lateReviewResolutionTombstoneValid(sentinel, tombstone) {
  if (!sentinel || !tombstone || tombstone.schemaVersion !== 1
    || tombstone.repository !== sentinel.repository
    || tombstone.prNumber !== sentinel.prNumber
    || tombstone.mergeSha !== sentinel.mergeSha
    || tombstone.admissionPolicyId !== "EXACT_HEAD_PROTECTED_MAIN_V1"
    || tombstone.findingSetHash !== lateReviewFindingSetHash(sentinel.findings)
    || tombstone.verificationSubjectHash !== tombstone.resolutionEvidence?.verificationSubjectHash
    || tombstone.tombstoneHash !== lateReviewResolutionTombstoneHash(tombstone)) return false;
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

export function verifyCommittedClaimEvidence({ claim, source, factRegistry, head = "HEAD" }) {
  if (!/^[0-9a-f]{40}$/u.test(source?.sourceCommit ?? "") || !Array.isArray(factRegistry)) return false;
  try {
    git(["merge-base", "--is-ancestor", source.sourceCommit, head]);
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
        || (entry.freshnessClass === "REPOSITORY_SOURCE" && entry.provider !== "NONE")
        || (entry.freshnessClass !== "REPOSITORY_SOURCE" && entry.provider === "NONE");
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
        || (/^[0-9a-f]{40}$/u.test(requirement.subjectHead ?? "") && /^[0-9a-f]{40}$/u.test(requirement.subjectTree ?? "")));
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
    if (observedValid && headValid && observed !== entry.head) {
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
    bindings.push({
      branch: entry.branch,
      classification,
      number: numberValid ? entry.number : null,
      observedHead: observed,
      recordedHead: entry?.head ?? null,
      ref,
      synchronization
    });

    if (observed === null || observed === undefined || observed === "") {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_REF_MISSING", status: "BLOCKED_INTERNAL", branch: entry.branch, number: numberValid ? entry.number : null, ref });
    } else if (!observedValid) {
      findings.push({ id: "ASSURANCE_CURRENT_TRUTH_IMPLEMENTATION_OBSERVED_HEAD_MALFORMED", status: "BLOCKED_INTERNAL", branch: entry.branch, number: numberValid ? entry.number : null, observed });
    } else if (headValid && observed !== entry.head && !synchronization?.ok) {
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
  bootstrapMerge
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
  return {
    ok: normalSynchronization || bootstrapSynchronization,
    mode: bootstrapSynchronization ? "bootstrap-synchronization-merge" : "synchronization-merge",
    parentShapeMatches,
    requiredPathsPresent,
    changedPathsAllowed,
    bootstrapSynchronization
  };
}

export function verifyCompletedImplementationMergeIdentity({ activeTaskBinding, latestMergedImplementationPr, remoteMain, gitCommand = git }) {
  if (activeTaskBinding?.phase !== "COMPLETE") return [];
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
  }
];

export function validateProofTierStatuses(binding, gateCatalog, featureRegistry) {
  const value = binding?.proofTierStatuses;
  if (value === undefined) {
    if (binding?.proofTierApplicabilityHash !== undefined) {
      return [{ id: "ASSURANCE_PROOF_TIER_STATUSES_PREMATURE", status: "BLOCKED_INTERNAL", phase: binding?.phase ?? null }];
    }
    return binding?.phase === "COMPLETE"
      ? [{ id: "ASSURANCE_PROOF_TIER_STATUSES_MISSING", status: "BLOCKED_INTERNAL" }]
      : [];
  }
  if (binding?.phase !== "COMPLETE") {
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
  if (binding?.phase === "COMPLETE" && !feature) {
    return [{ id: "ASSURANCE_PROOF_TIER_APPLICABILITY_MISSING", status: "BLOCKED_INTERNAL", featureId: binding?.featureId ?? null }];
  }
  const findings = [];
  const authoritativeApplicability = proofTierCompletionFeatureApplicability[binding?.featureId];
  if (binding?.phase === "COMPLETE"
    && (!authoritativeApplicability
      || stableJson(feature.proofTierApplicability) !== stableJson(authoritativeApplicability)
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
    } else if (binding?.phase === "COMPLETE" && !completePass && proofStatus !== "NOT_APPLICABLE") {
      findings.push({ id: "ASSURANCE_COMPLETED_PROOF_TIER_BLOCKED", status: "BLOCKED_INTERNAL", tier, value: proofStatus });
    } else if (binding?.phase === "COMPLETE") {
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
  if (binding?.phase === "COMPLETE") {
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

export function renderCurrentState(record) {
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
  return `# CURRENT STATE\n\nGenerated from \`config/assurance/current-truth-v1.json\`. Do not hand-edit.\n\n- Main SHA observed at this assurance checkpoint: \`${record.mainSha}\`.\n- Latest merged implementation: PR #${record.latestMergedImplementationPr.number}, \`${record.latestMergedImplementationPr.head}\`; merge \`${record.latestMergedImplementationPr.mergeSha}\`.\n- Structured implementation binding: feature \`${active.featureId}\`, PR #${active.implementationPr}, immutable \`${active.immutableSourceHead}\` / \`${active.immutableSourceTree}\`, synchronized \`${active.currentImplementationHead}\` / \`${active.currentImplementationTree}\`, phase \`${active.phase}\`, execution \`${active.executionState}\`.${proofTierStatusLine}\n- Assurance program display text: ${record.assuranceProgram.active}; completed: ${record.assuranceProgram.completed.join(", ") || "none"}.\n- Android internal: build ${record.android.buildNumber}, runtime \`${record.android.runtime}\`, channel \`${record.android.channel}\`, update \`${record.android.updateId}\`.\n- iOS internal: build ${record.ios.buildNumber}, runtime \`${record.ios.runtime}\`, channel \`${record.ios.channel}\`, update \`${record.ios.updateId}\`.\n- Historical provider value only: remote migration head \`${record.remoteMigrationHead}\`; current provider proof is not claimed.\n- Historical provider snapshot only: enabled Cognitive switches recorded as ${enabled}; no current switch proof is claimed.\n- Historical provider snapshot only: Cognitive schedules recorded as ${record.scheduleState.enabled}/${record.scheduleState.total} enabled; effective baseline count recorded as ${record.effectiveBaselineCount}.\n- Historical provider snapshot only: Cognitive LiveKit recorded ${record.safety.livekitSentinelRuns} formal runs, ${record.safety.livekitFindings} findings, and ${record.safety.livekitSwitchesEnabled} enabled switches.\n- Historical provider/safety snapshot only: PUBLIC schema \`net\` USAGE recorded as ${record.safety.publicSchemaNetUsage}; user-derived memory recorded as ${record.safety.userDerivedMemory}; Level 2 repair recorded as ${record.safety.level2Repair}. None is current provider proof.\n- Chi'llywood autonomous app operating model is now documented and guarded at \`${record.operatingPolicy.modelDocument}\`; Level 0/1 work does not require owner approval, while Level 3/4 boundaries do.\n- Installed Product QA closure is retained as historical evidence only: ${installedQa.schedulerStatus}; proof rows ${installedQa.proofRowIds.map((id) => `\`${id}\``).join(", ")}; last recorded matrix state \`${installedQa.currentMatrixState}\`. It is not fresh installed or physical proof.\n- RevenueCat closure values are historical only, not current provider proof: dashboard TEST recorded HTTP \`${revenueCat.dashboardTest.httpStatus}\` / \`${revenueCat.dashboardTest.result}\` with \`premiumGranted=${revenueCat.premiumGranted}\`, \`liveMoneyAction=${revenueCat.liveMoneyAction}\`, and \`moneyMoved=${revenueCat.moneyMoved}\`.\n- Current freshness claims: ${currentClaims}.\n- Blocked freshness claims: ${blockedClaims}.\n- Late exact-head Codex Review sentinels: ${lateReviews}. These block post-merge completion claims, unrelated successor work, release, and proof-tier promotion.\n- Document rendered at \`${record.timestamp}\`; document deadline \`${record.freshnessDeadline}\`. This deadline authorizes no claim. Derived live provider readback: ${record.liveProviderReadback}.\n\n## Open implementation PRs\n\n${implementations}\n\n## Open review-only PRs\n\n${reviews}\n\n## Current external blockers\n\n${blocked}\n\nHistorical proof belongs in Git history and scoped reports, not this hot path.\n`;
}

export function renderNextTask(record) {
  const actions = record.assuranceProgram.nextActions.map((entry, index) => `${index + 1}. ${entry}`).join("\n");
  return `# NEXT TASK\n\nGenerated from \`config/assurance/current-truth-v1.json\`. Do not hand-edit.\n\n${actions}\n\nDo not ask owner approval for Level 0/1 autonomous operations. Keep Level 3/4 owner approval and external-confirmation boundaries intact.\n\n${record.assuranceProgram.prohibitions.join("\n")}\n`;
}

export function classifyMigration(remote, source) {
  if (!source) return "REMOTE_ONLY";
  if (!remote) return "SOURCE_ONLY";
  if (remote.version !== source.version || remote.name !== source.name) return "VERSION_MISMATCH";
  if (remote.hash !== source.hash) return "BODY_MISMATCH";
  return "REMOTE_AND_SOURCE_MATCH";
}
