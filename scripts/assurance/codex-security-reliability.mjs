#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { emit, git, sha256, stableJson } from "./lib.mjs";
import { privateArtifactDirectory } from "./efficiency-lib.mjs";
import { governedReceiptIdentityHash, governedReceiptRule } from "./receipt.mjs";
import { repositorySnapshotDigest, targetDescriptor } from "./codex-security-target.mjs";

export const states = [
  "TARGET_FROZEN",
  "HOST_PREFLIGHT_CLEAR",
  "DISCOVERY_RUNNING",
  "SOURCE_REVIEW_COMPLETE",
  "FINALIZATION_RUNNING",
  "SEALED",
  "HOST_PREFLIGHT_BLOCKED",
  "SOURCE_REVIEW_INCOMPLETE",
  "SOURCE_REVIEW_COMPLETE_SEAL_BLOCKED_TOOLING",
  "TERMINAL_FAILED",
  "CANCELED",
];

export const resultCodes = [
  "BLOCKED_TOOLING_CODEX_SECURITY_SNAPSHOT_DIGEST_PREFLIGHT",
  "HOST_SNAPSHOT_DIGEST_NOT_PREFLIGHTABLE",
  "CODEX_SECURITY_PREFLIGHT_IDENTITY_INVALID",
  "CODEX_SECURITY_PREFLIGHT_IDENTITY_MISMATCH",
  "CODEX_SECURITY_SOURCE_LEASE_CHANGED",
  "CODEX_SECURITY_ILLEGAL_TRANSITION",
  "CODEX_SECURITY_COMPLETION_ALREADY_ATTEMPTED",
  "CODEX_SECURITY_FINALIZATION_GUARD",
];

const terminalStates = new Set([
  "SEALED",
  "HOST_PREFLIGHT_BLOCKED",
  "SOURCE_REVIEW_INCOMPLETE",
  "SOURCE_REVIEW_COMPLETE_SEAL_BLOCKED_TOOLING",
  "TERMINAL_FAILED",
  "CANCELED",
]);
const gitSha = (value) => typeof value === "string" && /^[0-9a-f]{40}$/u.test(value);
const digest = (value) => typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
const scanIdentifier = (value) => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);
const safePath = (value) => typeof value === "string"
  && value.length > 0
  && !value.startsWith("/")
  && !/[\u0000-\u001f\u007f]/u.test(value)
  && !value.split("/").some((part) => !part || part === "." || part === "..");
const safeRef = (value) => typeof value === "string"
  && /^(?!-)[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/u.test(value)
  && !value.includes("..")
  && !value.includes("@{")
  && !value.endsWith("/")
  && !value.endsWith(".");
const exactKeys = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && stableJson(Object.keys(value).sort()) === stableJson([...keys].sort());
const exactArray = (left, right) => stableJson(left) === stableJson(right);
const completeLedgers = (value) => exactKeys(value, ["discovery", "validation", "attackPath", "policy"])
  && ["discovery", "validation", "attackPath", "policy"].every((key) => value[key] === true);

export function descriptorValid(descriptor) {
  if (!exactKeys(descriptor, ["schemaVersion", "kind", "repository", "base", "target", "changedPaths", "changedPathWorklistSha256", "contractHashes", "repositorySourceSnapshotDigest"])
    || descriptor.schemaVersion !== 1
    || descriptor.kind !== "codex-security-target-v1"
    || !exactKeys(descriptor.repository, ["slug", "originUrlSha256"])
    || descriptor.repository.slug !== "Chillywood2025/chillywood-mobile"
    || descriptor.repository.originUrlSha256 !== sha256(`https://github.com/${descriptor.repository.slug}.git`)
    || !exactKeys(descriptor.base, ["ref", "head", "tree"])
    || !exactKeys(descriptor.target, ["ref", "head", "tree"])
    || !safeRef(descriptor.base.ref)
    || !safeRef(descriptor.target.ref)
    || ![descriptor.base.head, descriptor.base.tree, descriptor.target.head, descriptor.target.tree].every(gitSha)
    || descriptor.base.head === descriptor.target.head
    || !Array.isArray(descriptor.changedPaths)
    || descriptor.changedPaths.length === 0
    || !exactKeys(descriptor.contractHashes, ["policySha256", "threatSha256", "featureRegistrySha256"])
    || !Object.values(descriptor.contractHashes).every(digest)) return false;
  const paths = descriptor.changedPaths.map((entry) => entry?.path);
  if (new Set(paths).size !== paths.length || stableJson(paths) !== stableJson([...paths].sort())) return false;
  if (!descriptor.changedPaths.every((entry) => exactKeys(entry, ["status", "path", "beforeBlob", "afterBlob"])
    && /^[AMDT]$/u.test(entry.status)
    && safePath(entry.path)
    && (entry.beforeBlob === null || gitSha(entry.beforeBlob))
    && (entry.afterBlob === null || gitSha(entry.afterBlob))
    && (entry.status === "A" ? entry.beforeBlob === null && gitSha(entry.afterBlob) : true)
    && (entry.status === "D" ? gitSha(entry.beforeBlob) && entry.afterBlob === null : true)
    && (["M", "T"].includes(entry.status) ? gitSha(entry.beforeBlob) && gitSha(entry.afterBlob) : true))) return false;
  return digest(descriptor.changedPathWorklistSha256)
    && descriptor.changedPathWorklistSha256 === sha256(descriptor.changedPaths)
    && digest(descriptor.repositorySourceSnapshotDigest)
    && descriptor.repositorySourceSnapshotDigest === repositorySnapshotDigest(descriptor);
}

function leasePayload(descriptor) {
  return {
    repository: descriptor.repository,
    base: descriptor.base,
    target: descriptor.target,
    changedPathWorklistSha256: descriptor.changedPathWorklistSha256,
    contractHashes: descriptor.contractHashes,
    repositorySourceSnapshotDigest: descriptor.repositorySourceSnapshotDigest,
  };
}

export function lease(descriptor) {
  if (!descriptorValid(descriptor)) return null;
  const payload = leasePayload(descriptor);
  return { ...payload, sourceLeaseHash: sha256(payload) };
}

export function leaseCurrent(activeLease, descriptor) {
  const expected = lease(descriptor);
  return expected !== null && stableJson(activeLease) === stableJson(expected);
}

export function repositoryIdentityCurrent(descriptor, runGit = git) {
  if (!descriptorValid(descriptor)) return false;
  try {
    const observed = targetDescriptor({
      base: descriptor.base.ref,
      target: descriptor.target.ref,
      expectedRepository: descriptor.repository.slug,
      runGit,
    });
    return observed.ok === true && stableJson(observed.descriptor) === stableJson(descriptor);
  } catch {
    return false;
  }
}

export function createLifecycle({ descriptor, scanId, scanState = "RUNNING" }) {
  if (!descriptorValid(descriptor) || !scanIdentifier(scanId) || scanState !== "RUNNING") {
    return { ok: false, status: "CODEX_SECURITY_PREFLIGHT_IDENTITY_INVALID", workersStarted: false };
  }
  return {
    ok: true,
    lifecycle: {
      schemaVersion: 1,
      scanId,
      scanState,
      state: "TARGET_FROZEN",
      terminal: false,
      workersStarted: false,
      completionAttempts: 0,
      sourceLease: lease(descriptor),
      hostBinding: null,
      terminalReason: null,
    },
  };
}

function terminalize(lifecycle, state, reason) {
  return {
    ...lifecycle,
    state,
    terminal: true,
    workersStarted: lifecycle.workersStarted === true,
    terminalReason: reason,
  };
}

function blockedPreflight(lifecycle, status, fallback = null) {
  return {
    ok: false,
    status,
    fallback,
    discoveryAuthorized: false,
    workersStarted: false,
    lifecycle: terminalize(lifecycle, "HOST_PREFLIGHT_BLOCKED", status),
  };
}

function hostIdentityMatches(host, lifecycle, descriptor) {
  return host?.scanId === lifecycle.scanId
    && host?.scanState === "RUNNING"
    && host?.repository === descriptor.repository.slug
    && host?.base?.head === descriptor.base.head
    && host?.base?.tree === descriptor.base.tree
    && host?.target?.head === descriptor.target.head
    && host?.target?.tree === descriptor.target.tree;
}

export function preflight({ lifecycle, descriptor, host = {}, runGit = git }) {
  if (lifecycle?.state !== "TARGET_FROZEN" || lifecycle?.terminal === true || !leaseCurrent(lifecycle?.sourceLease, descriptor)) {
    return blockedPreflight(lifecycle ?? {}, "CODEX_SECURITY_PREFLIGHT_IDENTITY_INVALID");
  }
  if (!repositoryIdentityCurrent(descriptor, runGit)) {
    return blockedPreflight(lifecycle, "CODEX_SECURITY_SOURCE_LEASE_CHANGED");
  }
  if (!hostIdentityMatches(host, lifecycle, descriptor)) {
    return blockedPreflight(lifecycle, "CODEX_SECURITY_PREFLIGHT_IDENTITY_MISMATCH");
  }
  if (host.snapshotDigestExposed !== true) {
    return blockedPreflight(lifecycle, "HOST_SNAPSHOT_DIGEST_NOT_PREFLIGHTABLE", "REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED");
  }
  const hostSnapshotDigest = host?.target?.snapshotDigest;
  if (!digest(hostSnapshotDigest)) {
    return blockedPreflight(lifecycle, "BLOCKED_TOOLING_CODEX_SECURITY_SNAPSHOT_DIGEST_PREFLIGHT", "REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED");
  }
  if (hostSnapshotDigest === descriptor.repositorySourceSnapshotDigest) {
    return blockedPreflight(lifecycle, "CODEX_SECURITY_PREFLIGHT_IDENTITY_MISMATCH");
  }
  return {
    ok: true,
    status: "HOST_PREFLIGHT_CLEAR",
    discoveryAuthorized: true,
    workersStarted: false,
    lifecycle: {
      ...lifecycle,
      state: "HOST_PREFLIGHT_CLEAR",
      hostBinding: {
        repository: host.repository,
        scanId: host.scanId,
        scanState: host.scanState,
        base: host.base,
        target: {
          head: host.target.head,
          tree: host.target.tree,
          snapshotDigest: hostSnapshotDigest,
        },
      },
    },
  };
}

export function beginDiscovery({ lifecycle, descriptor, runGit = git }) {
  if (lifecycle?.terminal === true || lifecycle?.state !== "HOST_PREFLIGHT_CLEAR") {
    return { ok: false, status: "CODEX_SECURITY_ILLEGAL_TRANSITION", workersStarted: false, lifecycle };
  }
  if (!leaseCurrent(lifecycle.sourceLease, descriptor) || !repositoryIdentityCurrent(descriptor, runGit)) {
    return { ok: false, status: "CODEX_SECURITY_SOURCE_LEASE_CHANGED", workersStarted: false, lifecycle: terminalize(lifecycle, "TERMINAL_FAILED", "CODEX_SECURITY_SOURCE_LEASE_CHANGED") };
  }
  return { ok: true, status: "DISCOVERY_RUNNING", workersStarted: true, lifecycle: { ...lifecycle, state: "DISCOVERY_RUNNING", workersStarted: true } };
}

export function completeSourceReview({ lifecycle, descriptor, complete, runGit = git }) {
  if (lifecycle?.terminal === true || lifecycle?.state !== "DISCOVERY_RUNNING") {
    return { ok: false, status: "CODEX_SECURITY_ILLEGAL_TRANSITION", lifecycle };
  }
  if (!leaseCurrent(lifecycle?.sourceLease, descriptor) || !repositoryIdentityCurrent(descriptor, runGit)) {
    return { ok: false, status: "CODEX_SECURITY_SOURCE_LEASE_CHANGED", lifecycle: terminalize(lifecycle, "TERMINAL_FAILED", "CODEX_SECURITY_SOURCE_LEASE_CHANGED") };
  }
  if (complete !== true) {
    return { ok: false, status: "SOURCE_REVIEW_INCOMPLETE", lifecycle: terminalize(lifecycle, "SOURCE_REVIEW_INCOMPLETE", "SOURCE_REVIEW_INCOMPLETE") };
  }
  return { ok: true, status: "SOURCE_REVIEW_COMPLETE", lifecycle: { ...lifecycle, state: "SOURCE_REVIEW_COMPLETE" } };
}

export function finalize({ lifecycle, descriptor, host = {}, sourceReviewComplete, coverageComplete, deferredFindings = [], ledger, runGit = git }) {
  if (lifecycle?.completionAttempts > 0 || lifecycle?.terminal === true) {
    return { ok: false, status: "CODEX_SECURITY_COMPLETION_ALREADY_ATTEMPTED", lifecycle };
  }
  if (lifecycle?.state !== "SOURCE_REVIEW_COMPLETE") {
    return { ok: false, status: "CODEX_SECURITY_ILLEGAL_TRANSITION", lifecycle };
  }
  const attempted = { ...lifecycle, state: "FINALIZATION_RUNNING", completionAttempts: 1 };
  const snapshotDigest = host?.target?.snapshotDigest;
  if (host?.snapshotDigestExposed !== true || !digest(snapshotDigest)) {
    return {
      ok: false,
      status: host?.snapshotDigestExposed === true ? "BLOCKED_TOOLING_CODEX_SECURITY_SNAPSHOT_DIGEST_PREFLIGHT" : "HOST_SNAPSHOT_DIGEST_NOT_PREFLIGHTABLE",
      lifecycle: terminalize(attempted, "SOURCE_REVIEW_COMPLETE_SEAL_BLOCKED_TOOLING", "HOST_SNAPSHOT_DIGEST_UNAVAILABLE_AT_FINALIZATION"),
    };
  }
  const guard = leaseCurrent(lifecycle.sourceLease, descriptor)
    && repositoryIdentityCurrent(descriptor, runGit)
    && hostIdentityMatches(host, lifecycle, descriptor)
    && stableJson(host) === stableJson({ ...lifecycle.hostBinding, snapshotDigestExposed: true })
    && snapshotDigest !== descriptor.repositorySourceSnapshotDigest
    && sourceReviewComplete === true
    && coverageComplete === true
    && Array.isArray(deferredFindings) && deferredFindings.length === 0
    && completeLedgers(ledger);
  if (!guard) return { ok: false, status: "CODEX_SECURITY_FINALIZATION_GUARD", lifecycle: terminalize(attempted, "TERMINAL_FAILED", "CODEX_SECURITY_FINALIZATION_GUARD") };
  return { ok: true, status: "SEALED", lifecycle: terminalize(attempted, "SEALED", "SEALED") };
}

export function transition(lifecycle, next) {
  if (!states.includes(lifecycle?.state) || lifecycle?.terminal === true || terminalStates.has(lifecycle?.state)) {
    return { ok: false, status: "CODEX_SECURITY_ILLEGAL_TRANSITION", lifecycle };
  }
  if (next !== "CANCELED") return { ok: false, status: "CODEX_SECURITY_ILLEGAL_TRANSITION", lifecycle };
  return { ok: true, status: "CANCELED", lifecycle: terminalize(lifecycle, "CANCELED", "CANCELED") };
}

function reviewHash(review) {
  const { exactReviewHash, ...payload } = review;
  return sha256(payload);
}

function reviewValid(review, descriptor) {
  const expectedPaths = descriptor.changedPaths.map(({ path }) => path);
  return exactKeys(review, ["classification", "target", "coveredPaths", "changedPathWorklistSha256", "p0", "p1", "deferredFindings", "findingDispositions", "exactReviewHash"])
    && review.classification === "INDEPENDENT_EXACT_HEAD_REPOSITORY_SECURITY_REVIEW"
    && stableJson(review.target) === stableJson(descriptor.target)
    && exactArray(review.coveredPaths, expectedPaths)
    && review.changedPathWorklistSha256 === descriptor.changedPathWorklistSha256
    && review.p0 === 0
    && review.p1 === 0
    && Array.isArray(review.deferredFindings) && review.deferredFindings.length === 0
    && Array.isArray(review.findingDispositions)
    && review.findingDispositions.every((item) => exactKeys(item, ["findingId", "disposition", "evidenceHash"])
      && typeof item.findingId === "string" && item.findingId.length > 0
      && item.disposition === "CLOSED"
      && digest(item.evidenceHash))
    && digest(review.exactReviewHash)
    && review.exactReviewHash === reviewHash(review);
}

export const repositoryClosureTestIds = [
  "contracts",
  "current-truth",
  "diff-check",
  "lint",
  "node-version",
  "s0-active-task",
  "s0-benchmark",
  "s0-focused-test",
  "s0-plan",
  "s0-scope",
  "s0-target",
  "typecheck",
];

function readPrivateReceipt(artifactLocation) {
  return JSON.parse(fs.readFileSync(path.join(artifactLocation, "receipt.json"), "utf8"));
}

function testsValid(tests, descriptor, {
  readReceipt = readPrivateReceipt,
  receiptArtifactDirectory = (identityHash) => privateArtifactDirectory("receipts", identityHash),
} = {}) {
  if (!Array.isArray(tests) || tests.length !== repositoryClosureTestIds.length) return false;
  const ids = tests.map(({ id }) => id);
  if (new Set(ids).size !== ids.length || stableJson([...ids].sort()) !== stableJson(repositoryClosureTestIds)) return false;
  return tests.every((item) => {
    if (!exactKeys(item, ["id", "target", "commandSha256", "resultSha256", "passed", "receiptIdentityHash", "artifactLocation"])
      || stableJson(item.target) !== stableJson(descriptor.target)
      || !digest(item.commandSha256)
      || !digest(item.resultSha256)
      || !digest(item.receiptIdentityHash)
      || item.passed !== true) return false;
    const rule = governedReceiptRule(item.id);
    if (!rule || item.commandSha256 !== sha256([rule.file, ...rule.args])) return false;
    let canonicalArtifactLocation;
    let receipt;
    try {
      canonicalArtifactLocation = receiptArtifactDirectory(item.receiptIdentityHash);
      if (item.artifactLocation !== canonicalArtifactLocation) return false;
      receipt = readReceipt(canonicalArtifactLocation);
    } catch {
      return false;
    }
    return receipt?.identityHash === item.receiptIdentityHash
      && governedReceiptIdentityHash(receipt) === receipt.identityHash
      && receipt.commandId === item.id
      && stableJson(receipt.exactCommand) === stableJson([rule.file, ...rule.args])
      && receipt.configurationHash === sha256(rule)
      && receipt.sourceHead === descriptor.target.head
      && receipt.sourceTree === descriptor.target.tree
      && receipt.outputHashes?.combinedSha256 === item.resultSha256
      && receipt.exitStatus === 0
      && receipt.signal === null
      && receipt.failureCategory === null
      && Number.isFinite(receipt.startedAtMs)
      && Number.isFinite(receipt.endedAtMs)
      && receipt.endedAtMs >= receipt.startedAtMs
      && receipt.durationMs === receipt.endedAtMs - receipt.startedAtMs
      && Number.isInteger(receipt.resultTotals) && receipt.resultTotals > 0
      && Number.isInteger(receipt.assertionTotals) && receipt.assertionTotals > 0
      && receipt.result !== null
      && receipt.cleanupState === "SYNCHRONOUS_CHILD_EXITED";
  });
}

export function repositoryClosure(value, { runGit = git, readReceipt, receiptArtifactDirectory } = {}) {
  const descriptor = value?.descriptor;
  const policySelfReview = value?.reason === "HOSTED_SECURITY_SELF_APPROVAL_PROHIBITED"
    && value?.hostScanStarted === false
    && value?.lifecycle === null;
  const toolingFallback = ["HOST_SNAPSHOT_DIGEST_NOT_PREFLIGHTABLE", "BLOCKED_TOOLING_CODEX_SECURITY_SNAPSHOT_DIGEST_PREFLIGHT"].includes(value?.reason)
    && value?.lifecycle?.state === "HOST_PREFLIGHT_BLOCKED"
    && value?.lifecycle?.terminal === true
    && value?.lifecycle?.terminalReason === value.reason
    && value?.hostScanStarted === false;
  const ok = descriptorValid(descriptor)
    && repositoryIdentityCurrent(descriptor, runGit)
    && value?.classification === "REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED"
    && value?.requestedStatus === "REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED"
    && value?.hostedSealingUsed === false
    && leaseCurrent(value?.activeLease, descriptor)
    && (policySelfReview || toolingFallback)
    && reviewValid(value?.review, descriptor)
    && testsValid(value?.tests, descriptor, { readReceipt, receiptArtifactDirectory })
    && value?.priorFindingsClosed === true
    && value?.noDeferredWork === true;
  if (!ok) return { ok: false, status: "SOURCE_REVIEW_COMPLETE_SEAL_BLOCKED_TOOLING", sealed: false, closure: null };
  const closure = {
    schemaVersion: 1,
    classification: "REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED",
    sealed: false,
    reason: value.reason,
    repository: descriptor.repository.slug,
    target: descriptor.target,
    changedPathWorklistSha256: descriptor.changedPathWorklistSha256,
    repositorySourceSnapshotDigest: descriptor.repositorySourceSnapshotDigest,
    exactReviewHash: value.review.exactReviewHash,
    testResultHashes: value.tests.map(({ id, resultSha256 }) => ({ id, resultSha256 })),
    p0: 0,
    p1: 0,
    deferredWork: 0,
  };
  closure.closureHash = sha256(closure);
  return { ok: true, status: closure.classification, sealed: false, closure };
}

export function reusable(entry, descriptor) {
  const sourceExact = leaseCurrent(entry?.sourceLease, descriptor);
  const evidenceClassAllowed = entry?.evidenceClass === "REPOSITORY_SOURCE_SECURITY";
  const classificationAllowed = ["CODEX_SECURITY_SEALED", "REPOSITORY_SECURITY_CLOSURE_NOT_CODEX_SEALED"].includes(entry?.classification);
  const expectedTerminalState = entry?.classification === "CODEX_SECURITY_SEALED" ? "SEALED" : "SOURCE_REVIEW_COMPLETE_SEAL_BLOCKED_TOOLING";
  const proofComplete = typeof entry?.id === "string" && entry.id.length > 0
    && entry?.terminal === true && entry?.terminalState === expectedTerminalState && entry?.p0 === 0 && entry?.p1 === 0
    && Array.isArray(entry?.deferredFindings) && entry.deferredFindings.length === 0 && digest(entry?.evidenceHash);
  if (!classificationAllowed || !evidenceClassAllowed || !proofComplete) return { ok: false, status: "MISS_DENIED_EVIDENCE_CLASS" };
  return sourceExact ? { ok: true, status: "EXACT_UNCHANGED_SOURCE_REUSE" } : { ok: false, status: "MISS_SOURCE_OR_CONTRACT_CHANGED" };
}

export function invalidateChangedSourceEvidence(entries, descriptor) {
  if (!Array.isArray(entries)) return { ok: false, status: "EVIDENCE_LEDGER_INVALID", reusable: [], invalidated: [] };
  const reusableEntries = [];
  const invalidated = [];
  for (const entry of entries) {
    const result = reusable(entry, descriptor);
    if (result.ok) reusableEntries.push(entry.id);
    else invalidated.push({ id: entry.id, status: result.status });
  }
  return { ok: true, status: invalidated.length ? "CHANGED_SOURCE_EVIDENCE_INVALIDATED" : "UNCHANGED_SOURCE_EVIDENCE_REUSABLE", reusable: reusableEntries, invalidated };
}

const recurringFailures = new Map([
  ["508c30b1-cf43-4902-96f1-92563d490149", "scan.target.snapshotDigest: expected a non-empty string"],
  ["a64456db-438c-4857-8f01-c40fcc965936", "scan.target.snapshotDigest: expected a non-empty string"],
]);

export function sanitizeIncident(value) {
  const allowedKeys = ["scanId", "error", "sourceReviewCompletionState", "finalizationState", "mitigation"];
  if (!exactKeys(value, allowedKeys)
    || recurringFailures.get(value.scanId) !== value.error
    || value.sourceReviewCompletionState !== "SOURCE_REVIEW_COMPLETE"
    || value.finalizationState !== "HOST_PREFLIGHT_BLOCKED"
    || value.mitigation !== "strict repository closure") return { ok: false, status: "CODEX_SECURITY_INCIDENT_UNSANITIZED" };
  const record = {
    schemaVersion: 1,
    scanId: value.scanId,
    errorCode: "HOST_SNAPSHOT_DIGEST_MISSING_FINALIZER",
    errorFingerprint: sha256(value.error),
    sourceReviewCompletionState: value.sourceReviewCompletionState,
    finalizationState: value.finalizationState,
    mitigation: value.mitigation,
    tokenValues: null,
    wallValues: null,
  };
  record.incidentHash = sha256(record);
  return { ok: true, record };
}

export function benchmark() {
  const contractTexts = {
    "config/assurance/codex-security-reliability-s0-v1.json": "benchmark-policy-v1",
    "config/assurance/escaped-defect-catalog-v1.json": "benchmark-threat-v1",
    "config/assurance/feature-registry-v1.json": "benchmark-feature-registry-v1",
  };
  const descriptor = {
    schemaVersion: 1,
    kind: "codex-security-target-v1",
    repository: { slug: "Chillywood2025/chillywood-mobile", originUrlSha256: sha256("https://github.com/Chillywood2025/chillywood-mobile.git") },
    base: { ref: "origin/main", head: "2".repeat(40), tree: "3".repeat(40) },
    target: { ref: "HEAD", head: "4".repeat(40), tree: "5".repeat(40) },
    changedPaths: [{ status: "M", path: "scripts/assurance/example.mjs", beforeBlob: "6".repeat(40), afterBlob: "7".repeat(40) }],
    changedPathWorklistSha256: "",
    contractHashes: {
      policySha256: sha256(contractTexts["config/assurance/codex-security-reliability-s0-v1.json"]),
      threatSha256: sha256(contractTexts["config/assurance/escaped-defect-catalog-v1.json"]),
      featureRegistrySha256: sha256(contractTexts["config/assurance/feature-registry-v1.json"]),
    },
    repositorySourceSnapshotDigest: "",
  };
  descriptor.changedPathWorklistSha256 = sha256(descriptor.changedPaths);
  descriptor.repositorySourceSnapshotDigest = repositorySnapshotDigest(descriptor);
  const runGit = (args) => {
    if (stableJson(args) === stableJson(["remote", "get-url", "origin"])) return "https://github.com/Chillywood2025/chillywood-mobile.git";
    if (args[0] === "rev-parse" && args[1] === "--verify") {
      const revision = args[2];
      if (revision === `${descriptor.base.ref}^{commit}`) return descriptor.base.head;
      if (revision === `${descriptor.base.head}^{tree}`) return descriptor.base.tree;
      if (revision === `${descriptor.target.ref}^{commit}`) return descriptor.target.head;
      if (revision === `${descriptor.target.head}^{tree}`) return descriptor.target.tree;
      if (revision === `${descriptor.base.head}:${descriptor.changedPaths[0].path}`) return descriptor.changedPaths[0].beforeBlob;
      if (revision === `${descriptor.target.head}:${descriptor.changedPaths[0].path}`) return descriptor.changedPaths[0].afterBlob;
    }
    if (stableJson(args) === stableJson(["diff", "--no-ext-diff", "--name-status", "--no-renames", "-z", `${descriptor.base.head}..${descriptor.target.head}`])) {
      return `M\0${descriptor.changedPaths[0].path}\0`;
    }
    if (args[0] === "show") {
      const [commit, file] = args[1].split(":");
      if (commit === descriptor.target.head && Object.hasOwn(contractTexts, file)) return contractTexts[file];
    }
    throw new Error("unexpected benchmark git read");
  };
  const created = createLifecycle({ descriptor, scanId: "s0-benchmark" });
  const noExposure = preflight({
    lifecycle: created.lifecycle,
    descriptor,
    host: { scanId: "s0-benchmark", scanState: "RUNNING", repository: descriptor.repository.slug, base: { head: descriptor.base.head, tree: descriptor.base.tree }, target: { head: descriptor.target.head, tree: descriptor.target.tree }, snapshotDigestExposed: false },
    runGit,
  });
  const missingDigest = preflight({
    lifecycle: created.lifecycle,
    descriptor,
    host: { scanId: "s0-benchmark", scanState: "RUNNING", repository: descriptor.repository.slug, base: { head: descriptor.base.head, tree: descriptor.base.tree }, target: { head: descriptor.target.head, tree: descriptor.target.tree, snapshotDigest: "" }, snapshotDigestExposed: true },
    runGit,
  });
  const incidentResults = [...recurringFailures].map(([scanId, error]) => sanitizeIncident({ scanId, error, sourceReviewCompletionState: "SOURCE_REVIEW_COMPLETE", finalizationState: "HOST_PREFLIGHT_BLOCKED", mitigation: "strict repository closure" }));
  const ok = noExposure.status === "HOST_SNAPSHOT_DIGEST_NOT_PREFLIGHTABLE"
    && noExposure.workersStarted === false
    && missingDigest.status === "BLOCKED_TOOLING_CODEX_SECURITY_SNAPSHOT_DIGEST_PREFLIGHT"
    && missingDigest.workersStarted === false
    && incidentResults.every(({ ok: incidentOk }) => incidentOk);
  return {
    ok,
    failedIncidents: [...recurringFailures.keys()],
    expensiveScanWorkAvoided: 2,
    preflightResults: [noExposure.status, missingDigest.status],
    incidentHashes: incidentResults.map(({ record }) => record?.incidentHash),
    tokenValues: null,
    wallValues: null,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const validArgs = process.argv.length === 3 && process.argv[2] === "--benchmark=all";
  const result = validArgs ? benchmark() : { ok: false, status: "CODEX_SECURITY_BENCHMARK_OPTIONS_INVALID" };
  emit("assurance:codex-security-reliability", result.ok, { benchmark: result });
}
