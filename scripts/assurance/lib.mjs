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
  "platform"
];
const claimStatuses = new Set(["CURRENT", "STALE_BLOCKED"]);
const claimPlatforms = new Set(["ANDROID", "IOS", "NONE"]);
const claimClassPolicy = {
  REPOSITORY_SOURCE: {
    evidenceModes: ["local-source", "git-read-only", "github-read-only", "exact-ci", "local-offline", "local-read-only", "local-and-github-read-only", "local-offline-and-github-read-only"],
    authorityAllowed: "REPOSITORY_ONLY",
    maximumHours: 24,
    allowedPlatforms: ["NONE", "ANDROID", "IOS"],
    requiresCommittedEvidence: false,
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

export function evaluateFreshnessClaims({ claims, evidenceSources, freshness, now = new Date(), evidenceSourceVerifier = null, externalEvidenceVerifier = null }) {
  const findings = [];
  const evaluated = [];
  const seenClaimIds = new Set();
  const sources = Array.isArray(evidenceSources) ? evidenceSources : [];
  const classRules = freshness?.classes;
  const evaluationTime = now instanceof Date ? now : new Date(now);
  if (!Array.isArray(claims)) findings.push(claimFinding("ASSURANCE_FRESHNESS_CLAIMS_MALFORMED"));
  if (!Array.isArray(evidenceSources)) findings.push(claimFinding("ASSURANCE_EVIDENCE_SOURCES_MALFORMED"));
  if (!classRules || typeof classRules !== "object" || Array.isArray(classRules)) {
    findings.push(claimFinding("ASSURANCE_FRESHNESS_CLASS_RULES_MALFORMED"));
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
        let externallyVerified = false;
        try {
          externallyVerified = typeof externalEvidenceVerifier === "function"
            && externalEvidenceVerifier({ claim, source }) === true;
        } catch {
          externallyVerified = false;
        }
        if (!externallyVerified) findings.push(claimFinding("ASSURANCE_FRESHNESS_EXTERNAL_RECEIPT_UNVERIFIED", claimId));
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
  const currentClaims = usableClaims.filter(({ derivedStatus }) => derivedStatus === "CURRENT");
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
      && requiredFacts.every((fact) => typeof fact === "string" && fact.length > 0);
    if (!scoped) {
      blockers.push({ id: "ASSURANCE_REQUIRED_FRESHNESS_SCOPE_MALFORMED", status: "BLOCKED_INTERNAL" });
      continue;
    }
    const matched = (claimEvaluation?.currentClaims ?? []).some((claim) => claim.freshnessClass === requirement?.freshnessClass
      && claim.platform === requirement.platform
      && claim.evidenceSourceId === requirement.evidenceSourceId
      && claim.authorityAllowed === requirement.authorityAllowed
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
    && typeof manifest.reviewRef === "string"
    && gitShaPattern.test(manifest.reviewRefHead ?? "")
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
    matchingReviewEvidence: sortStable(matchingEvidence.map(({ reviewId, reviewRef, reviewRefHead }) => ({ reviewId, reviewRef, reviewRefHead }))),
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
      synchronization = verifyBaseSynchronizedImplementationHead({
        ...(baseSynchronizations?.[ref] ?? {}),
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
  const acceptedCheckoutHead = currentBinding?.classification === "BASE_SYNCHRONIZED_IMPLEMENTATION_BRANCH"
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

export const tierIds = ["T0_REQUIREMENT", "T1_SOURCE", "T2_MODEL", "T3_INTEGRATION", "T4_NATIVE_PROVIDER", "T5_SIGNED_ARTIFACT", "T6_INSTALLED_PHYSICAL", "T7_PUBLIC_CANARY"];
export const featureRequired = ["featureId", "currentState", "ownerSystems", "productOwner", "routes", "components", "edgeFunctions", "tablesRpcs", "nativeModulesPlugins", "providers", "platformScope", "environments", "riskLevel", "requirements", "nonGoals", "states", "transitions", "invariants", "knownDefectTags", "threatFailureModes", "proofTierApplicability", "commands", "artifactRequirements", "installedRequirements", "physicalGoldenCases", "rollback", "emergencyStop", "evidenceRetention", "reviewRequirements", "unresolvedBlockers"];

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
  return `# CURRENT STATE\n\nGenerated from \`config/assurance/current-truth-v1.json\`. Do not hand-edit.\n\n- Main SHA observed at this assurance checkpoint: \`${record.mainSha}\`.\n- Latest merged implementation: PR #${record.latestMergedImplementationPr.number}, \`${record.latestMergedImplementationPr.head}\`; merge \`${record.latestMergedImplementationPr.mergeSha}\`.\n- Structured implementation binding: feature \`${active.featureId}\`, PR #${active.implementationPr}, immutable \`${active.immutableSourceHead}\` / \`${active.immutableSourceTree}\`, synchronized \`${active.currentImplementationHead}\` / \`${active.currentImplementationTree}\`, phase \`${active.phase}\`, execution \`${active.executionState}\`.\n- Assurance program display text: ${record.assuranceProgram.active}; completed: ${record.assuranceProgram.completed.join(", ") || "none"}.\n- Android internal: build ${record.android.buildNumber}, runtime \`${record.android.runtime}\`, channel \`${record.android.channel}\`, update \`${record.android.updateId}\`.\n- iOS internal: build ${record.ios.buildNumber}, runtime \`${record.ios.runtime}\`, channel \`${record.ios.channel}\`, update \`${record.ios.updateId}\`.\n- Historical provider value only: remote migration head \`${record.remoteMigrationHead}\`; current provider proof is not claimed.\n- Historical provider snapshot only: enabled Cognitive switches recorded as ${enabled}; no current switch proof is claimed.\n- Historical provider snapshot only: Cognitive schedules recorded as ${record.scheduleState.enabled}/${record.scheduleState.total} enabled; effective baseline count recorded as ${record.effectiveBaselineCount}.\n- Historical provider snapshot only: Cognitive LiveKit recorded ${record.safety.livekitSentinelRuns} formal runs, ${record.safety.livekitFindings} findings, and ${record.safety.livekitSwitchesEnabled} enabled switches.\n- Historical provider/safety snapshot only: PUBLIC schema \`net\` USAGE recorded as ${record.safety.publicSchemaNetUsage}; user-derived memory recorded as ${record.safety.userDerivedMemory}; Level 2 repair recorded as ${record.safety.level2Repair}. None is current provider proof.\n- Chi'llywood autonomous app operating model is now documented and guarded at \`${record.operatingPolicy.modelDocument}\`; Level 0/1 work does not require owner approval, while Level 3/4 boundaries do.\n- Installed Product QA closure is retained as historical evidence only: ${installedQa.schedulerStatus}; proof rows ${installedQa.proofRowIds.map((id) => `\`${id}\``).join(", ")}; last recorded matrix state \`${installedQa.currentMatrixState}\`. It is not fresh installed or physical proof.\n- RevenueCat closure values are historical only, not current provider proof: dashboard TEST recorded HTTP \`${revenueCat.dashboardTest.httpStatus}\` / \`${revenueCat.dashboardTest.result}\` with \`premiumGranted=${revenueCat.premiumGranted}\`, \`liveMoneyAction=${revenueCat.liveMoneyAction}\`, and \`moneyMoved=${revenueCat.moneyMoved}\`.\n- Current freshness claims: ${currentClaims}.\n- Blocked freshness claims: ${blockedClaims}.\n- Late exact-head Codex Review sentinels: ${lateReviews}. These block post-merge completion claims, unrelated successor work, release, and proof-tier promotion.\n- Document rendered at \`${record.timestamp}\`; document deadline \`${record.freshnessDeadline}\`. This deadline authorizes no claim. Derived live provider readback: ${record.liveProviderReadback}.\n\n## Open implementation PRs\n\n${implementations}\n\n## Open review-only PRs\n\n${reviews}\n\n## Current external blockers\n\n${blocked}\n\nHistorical proof belongs in Git history and scoped reports, not this hot path.\n`;
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
