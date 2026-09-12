import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const GIT_SHA = /^[0-9a-f]{40}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const DEFAULT_GIT_OUTPUT_LIMIT = 32 * 1024 * 1024;

export const ASSURANCE_CONTROL_PLANE_CONSOLIDATION_V2 = "ASSURANCE_CONTROL_PLANE_CONSOLIDATION_V2";
export const ASSURANCE_CONTROL_PLANE_CONSOLIDATION_V2_PATHS = Object.freeze([
  ".github/workflows/phase1-ci.yml",
  "CURRENT_STATE.md",
  "NEXT_TASK.md",
  "config/assurance/current-truth-contract-v1.json",
  "config/assurance/current-truth-v1.json",
  "config/assurance/efficiency-e0-v1.json",
  "config/assurance/schemas-v1.json",
  "docs/assurance/CONTROL_PLANE_V2.md",
  "scripts/assurance/active-task.mjs",
  "scripts/assurance/benchmark.mjs",
  "scripts/assurance/control-plane-qualification.mjs",
  "scripts/assurance/control-plane-v2.mjs",
  "scripts/assurance/current-truth.mjs",
  "scripts/assurance/efficiency-lib.mjs",
  "scripts/assurance/engineering-closure.mjs",
  "scripts/assurance/evidence-index.mjs",
  "scripts/assurance/github-main-ruleset-readback.mjs",
  "scripts/assurance/lib.mjs",
  "scripts/assurance/phase1-admission.mjs",
  "scripts/assurance/pr-scope.mjs",
  "scripts/assurance/review-history.mjs",
  "scripts/assurance/terminal-sync.mjs",
  "tests/assurance/codex-review-exact-head.test.mjs",
  "tests/assurance/control-plane-v2.test.mjs",
  "tests/assurance/current-truth-sync.test.mjs",
  "tests/assurance/engineering-doctrine.test.mjs",
  "tests/assurance/github-main-ruleset-readback.test.mjs",
  "tests/assurance/phase1-admission.test.mjs",
  "tests/assurance/pr-scope-feature-bundles.test.mjs",
  "tests/assurance/terminal-sync.test.mjs",
]);
export const ASSURANCE_CONTROL_PLANE_CONSOLIDATION_V2_PROFILE = Object.freeze({
  profileId: ASSURANCE_CONTROL_PLANE_CONSOLIDATION_V2,
  paths: ASSURANCE_CONTROL_PLANE_CONSOLIDATION_V2_PATHS,
  maximumFiles: ASSURANCE_CONTROL_PLANE_CONSOLIDATION_V2_PATHS.length,
  maximumChangedLines: 6500,
});

const stableValue = (value) => Array.isArray(value)
  ? value.map(stableValue)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
    : value;

export const canonicalJson = (value) => JSON.stringify(stableValue(value));
export const controlPlaneHash = (value) => crypto.createHash("sha256")
  .update(typeof value === "string" || Buffer.isBuffer(value) ? value : canonicalJson(value))
  .digest("hex");

const uniqueSorted = (values) => [...new Set(values)].sort();
const exactObject = (left, right) => canonicalJson(left) === canonicalJson(right);

export const PROVIDER_CLASSIFICATIONS = Object.freeze({
  VALIDATION_FAILURE: "VALIDATION_FAILURE",
  READ_INCOMPLETE: "PROVIDER_READ_INCOMPLETE",
  TRANSIENT_FAILURE: "PROVIDER_TRANSIENT_FAILURE",
  DISPATCH_UNAVAILABLE: "PROVIDER_DISPATCH_UNAVAILABLE",
  AUTHORITY_MISSING: "PROVIDER_AUTHORITY_MISSING",
  CONFIGURATION_DRIFT: "PROVIDER_CONFIGURATION_DRIFT",
});

export const GITHUB_AUTHORITY_INVENTORY_V2 = Object.freeze({
  repositoryMetadata: Object.freeze({ endpoint: "GET /repos/{owner}/{repo}", permission: "metadata:read" }),
  pullRequest: Object.freeze({ endpoint: "GET /repos/{owner}/{repo}/pulls/{number}", permission: "pull_requests:read" }),
  issueComments: Object.freeze({ endpoint: "GET /repos/{owner}/{repo}/issues/{number}/comments", permission: "issues:read" }),
  pullCommits: Object.freeze({ endpoint: "GET /repos/{owner}/{repo}/pulls/{number}/commits", permission: "pull_requests:read" }),
  workflowRuns: Object.freeze({ endpoint: "GET /repos/{owner}/{repo}/actions/runs", permission: "actions:read" }),
  checks: Object.freeze({ endpoint: "GET /repos/{owner}/{repo}/commits/{ref}/check-runs", permission: "checks:read" }),
  rulesets: Object.freeze({ endpoint: "GET /repos/{owner}/{repo}/rulesets/{id}", permission: "administration:read" }),
  appReadback: Object.freeze({ endpoint: "GET /app and GET /user/installations", permission: "app-jwt/installation metadata:read" }),
});

function runGit(root, args, { maxBuffer = DEFAULT_GIT_OUTPUT_LIMIT, encoding = "utf8" } = {}) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding,
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer,
  });
  if (result.status !== 0 || result.error) {
    const error = new Error("CONTROL_PLANE_GIT_READ_FAILED");
    error.code = result.error?.code ?? "GIT_NONZERO";
    error.status = result.status;
    throw error;
  }
  return typeof result.stdout === "string" ? result.stdout : Buffer.from(result.stdout ?? "");
}

function nulValues(value) {
  return String(value).split("\0").filter(Boolean);
}

function parseNumstatZ(value) {
  const tokens = nulValues(value);
  const rows = [];
  for (let index = 0; index < tokens.length;) {
    const fields = tokens[index].split("\t");
    if (fields.length >= 3) {
      rows.push({ added: fields[0], deleted: fields[1], path: fields.slice(2).join("\t") });
      index += 1;
      continue;
    }
    if (fields.length === 2 && tokens[index + 1]) {
      rows.push({ added: fields[0], deleted: fields[1], path: tokens[index + 1] });
      index += 2;
      continue;
    }
    throw new Error("CONTROL_PLANE_GIT_NUMSTAT_MALFORMED");
  }
  return rows;
}

function canonicalRawDiff(value) {
  const tokens = nulValues(value);
  return tokens.map((token) => token.replace(/^:+/u, (prefix) => ":".repeat(prefix.length))).join("\0");
}

function canonicalPatchText(value) {
  return String(value).replace(/\r\n?|\n/gu, "\n").trim();
}

/**
 * Resolves candidate identity from Git object metadata, path names and numstat.
 * Object identity never depends on patch contents. A separate compatibility
 * hash is calculated with a deliberate 32 MiB bound for immutable legacy
 * receipts that already bind the canonical Git patch hash; this removes the
 * historical implicit 1 MiB child-process ceiling without becoming unbounded.
 */
export function createCandidateGitContext({ root, base, head = "HEAD", expectedHead = null } = {}) {
  if (typeof root !== "string" || !root || typeof base !== "string" || !base) {
    return { ok: false, classification: "SOURCE_IDENTITY_UNRESOLVED", findings: ["CANDIDATE_GIT_CONTEXT_INPUT_INVALID"] };
  }
  try {
    const sourceHead = String(runGit(root, ["rev-parse", `${head}^{commit}`])).trim();
    const sourceTree = String(runGit(root, ["rev-parse", `${sourceHead}^{tree}`])).trim();
    const baseHead = String(runGit(root, ["rev-parse", `${base}^{commit}`])).trim();
    const baseTree = String(runGit(root, ["rev-parse", `${baseHead}^{tree}`])).trim();
    if (![sourceHead, sourceTree, baseHead, baseTree].every((value) => GIT_SHA.test(value))
      || (expectedHead && sourceHead !== expectedHead)) {
      return { ok: false, classification: "SOURCE_IDENTITY_UNRESOLVED", findings: ["CANDIDATE_GIT_OBJECT_IDENTITY_INVALID"] };
    }
    const range = `${baseHead}...${sourceHead}`;
    const paths = uniqueSorted(nulValues(runGit(root, ["diff", "--name-only", "-z", "--no-renames", range])));
    const raw = canonicalRawDiff(runGit(root, ["diff", "--raw", "-z", "--full-index", "--no-renames", range]));
    const numstat = parseNumstatZ(runGit(root, ["diff", "--numstat", "-z", "--no-renames", range]));
    const canonicalPatch = canonicalPatchText(runGit(root, ["diff", "--full-index", "--binary", "--no-ext-diff", range]));
    const rowPaths = uniqueSorted(numstat.map(({ path }) => path));
    if (!exactObject(paths, rowPaths)) {
      return { ok: false, classification: "SOURCE_IDENTITY_UNRESOLVED", findings: ["CANDIDATE_GIT_PATH_ENUMERATION_MISMATCH"] };
    }
    const binaryPaths = uniqueSorted(numstat.filter(({ added, deleted }) => added === "-" || deleted === "-").map(({ path }) => path));
    const textRows = numstat.filter(({ added, deleted }) => /^\d+$/u.test(added) && /^\d+$/u.test(deleted));
    if (textRows.length + binaryPaths.length !== numstat.length) {
      return { ok: false, classification: "SOURCE_IDENTITY_UNRESOLVED", findings: ["CANDIDATE_GIT_NUMSTAT_INVALID"] };
    }
    const additions = textRows.reduce((sum, row) => sum + Number(row.added), 0);
    const deletions = textRows.reduce((sum, row) => sum + Number(row.deleted), 0);
    const sourceIdentity = {
      schemaVersion: 2,
      algorithm: "GIT_OBJECT_METADATA_NO_PATCH_BODY_V2",
      baseHead,
      baseTree,
      sourceHead,
      sourceTree,
      changedPaths: paths,
      changedPathHash: controlPlaneHash(paths),
      objectDeltaHash: controlPlaneHash({ raw, numstat }),
      diffHash: controlPlaneHash(canonicalPatch),
      additions,
      deletions,
      canonicalChangedLines: additions + deletions,
      binaryPaths,
    };
    return { ok: true, classification: "SOURCE_IDENTITY_RESOLVED", findings: [], ...sourceIdentity, sourceIdentityHash: controlPlaneHash(sourceIdentity) };
  } catch (error) {
    return { ok: false, classification: "SOURCE_IDENTITY_UNRESOLVED", findings: [error?.message ?? "CONTROL_PLANE_GIT_READ_FAILED"] };
  }
}

export function readCandidatePath({ root, candidateHead, path }) {
  if (!GIT_SHA.test(candidateHead ?? "") || typeof path !== "string" || !path || path.startsWith("/") || path.split("/").includes("..")) {
    return { ok: false, finding: "CANDIDATE_PATH_READ_INVALID" };
  }
  try {
    const body = runGit(root, ["show", `${candidateHead}:${path}`], { maxBuffer: DEFAULT_GIT_OUTPUT_LIMIT });
    return { ok: true, body: String(body), source: "CANDIDATE_GIT_OBJECT" };
  } catch {
    return { ok: false, finding: "CANDIDATE_PATH_MISSING" };
  }
}

export function resolveFiniteTaskAmendmentState({ maximumAmendments, amendmentsConsumed, amendmentReceipt = null, baseLease, effectiveLease } = {}) {
  const findings = [];
  if (!Number.isSafeInteger(maximumAmendments) || maximumAmendments < 0) findings.push("AMENDMENT_MAXIMUM_INVALID");
  if (!Number.isSafeInteger(amendmentsConsumed) || amendmentsConsumed < 0) findings.push("AMENDMENT_CONSUMED_INVALID");
  if (Number.isSafeInteger(maximumAmendments) && Number.isSafeInteger(amendmentsConsumed) && amendmentsConsumed > maximumAmendments) findings.push("AMENDMENT_MAXIMUM_EXCEEDED");
  const leaseChanged = !exactObject(baseLease, effectiveLease);
  if (amendmentsConsumed === 0) {
    if (amendmentReceipt !== null) findings.push("UNCONSUMED_AMENDMENT_RECEIPT_FORBIDDEN");
    if (leaseChanged) findings.push("EFFECTIVE_LEASE_CHANGED_WITHOUT_AMENDMENT");
  } else if (amendmentsConsumed === 1) {
    if (!amendmentReceipt || typeof amendmentReceipt !== "object") findings.push("CONSUMED_AMENDMENT_RECEIPT_REQUIRED");
    if (!leaseChanged) findings.push("CONSUMED_AMENDMENT_MUST_CHANGE_LEASE");
  } else if (amendmentsConsumed > 1) {
    findings.push("MULTIPLE_AMENDMENTS_UNSUPPORTED");
  }
  const status = findings.length ? "INVALID" : amendmentsConsumed === 0 ? "BASE_ONLY" : "AMENDED";
  return {
    ok: findings.length === 0,
    status,
    reservation: status,
    maximumAmendments,
    amendmentsConsumed,
    amendmentReceipt,
    baseLease,
    effectiveLease,
    findings: uniqueSorted(findings),
  };
}

const EVIDENCE_KEY_FIELDS = Object.freeze([
  "repository", "pr", "taskId", "leaseHash", "headSha", "tree", "baseSha",
  "changedPathHash", "sourceIdentityHash", "lifecycleGeneration", "rulesetStage", "reviewIdentity",
]);

export function exactEvidenceIdentity(value) {
  const missing = EVIDENCE_KEY_FIELDS.filter((field) => value?.[field] === undefined || value?.[field] === null || value?.[field] === "");
  if (missing.length) return { ok: false, findings: missing.map((field) => `EVIDENCE_IDENTITY_${field.toUpperCase()}_REQUIRED`) };
  const identity = Object.fromEntries(EVIDENCE_KEY_FIELDS.map((field) => [field, value[field]]));
  if (identity.repository !== "Chillywood2025/chillywood-mobile"
    || !Number.isSafeInteger(identity.pr) || identity.pr < 1
    || typeof identity.taskId !== "string" || !identity.taskId
    || ![identity.lifecycleGeneration, identity.rulesetStage, identity.reviewIdentity].every((item) => typeof item === "string" && item)
    || !GIT_SHA.test(identity.headSha) || !GIT_SHA.test(identity.tree) || !GIT_SHA.test(identity.baseSha)
    || !SHA256.test(identity.leaseHash) || !SHA256.test(identity.changedPathHash) || !SHA256.test(identity.sourceIdentityHash)) {
    return { ok: false, findings: ["EVIDENCE_IDENTITY_HASH_INVALID"] };
  }
  return { ok: true, identity, key: controlPlaneHash(identity), findings: [] };
}

export function canReuseEvidence({ evidence, request }) {
  const expected = exactEvidenceIdentity(request);
  const observed = exactEvidenceIdentity(evidence?.identity);
  return Boolean(expected.ok && observed.ok && evidence?.immutable === true && evidence?.key === observed.key && expected.key === observed.key);
}

export function classifyProviderFailure(value, { operation = "read" } = {}) {
  // `gh` exits with status 1 for every HTTP failure. Prefer the parsed HTTP
  // status so an external 500 is not mislabeled as a repository validation
  // failure (and a 403 is not retried as if it were transient).
  const status = Number(value?.statusCode ?? value?.response?.status ?? value?.status);
  const code = String(value?.code ?? "").toUpperCase();
  const message = String(value?.message ?? value ?? "").toLowerCase();
  if (status === 401 || status === 403 || code === "EACCES" || /permission|credential|token|unauthori[sz]ed/u.test(message)) {
    return { classification: PROVIDER_CLASSIFICATIONS.AUTHORITY_MISSING, retryable: false };
  }
  if (operation === "dispatch" && (status >= 500 || /failed to queue|workflow.*unavailable/u.test(message))) {
    return { classification: PROVIDER_CLASSIFICATIONS.DISPATCH_UNAVAILABLE, retryable: true };
  }
  if (status === 408 || status === 429 || status >= 500 || ["ECONNRESET", "ETIMEDOUT", "EAI_AGAIN"].includes(code)) {
    return { classification: PROVIDER_CLASSIFICATIONS.TRANSIENT_FAILURE, retryable: true };
  }
  if (value instanceof SyntaxError || code === "ENOBUFS" || /unexpected (?:end|token)|invalid json|response.*truncated/u.test(message)) {
    return { classification: PROVIDER_CLASSIFICATIONS.READ_INCOMPLETE, retryable: false };
  }
  if (/pagination|incomplete|missing page|cursor/u.test(message)) {
    return { classification: PROVIDER_CLASSIFICATIONS.READ_INCOMPLETE, retryable: false };
  }
  if (/configuration|ruleset|workflow.*missing|endpoint.*changed/u.test(message)) {
    return { classification: PROVIDER_CLASSIFICATIONS.CONFIGURATION_DRIFT, retryable: false };
  }
  return { classification: PROVIDER_CLASSIFICATIONS.VALIDATION_FAILURE, retryable: false };
}

export async function boundedProviderOperation({ operation = "read", attempts = 3, invoke } = {}) {
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 3 || typeof invoke !== "function") {
    return { ok: false, classification: PROVIDER_CLASSIFICATIONS.VALIDATION_FAILURE, attempts: 0, retryable: false };
  }
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const value = await invoke(attempt);
      return { ok: true, classification: "PROVIDER_OPERATION_COMPLETE", attempts: attempt, value, retryable: false };
    } catch (error) {
      last = classifyProviderFailure(error, { operation });
      if (!last.retryable || attempt === attempts) return { ok: false, ...last, attempts: attempt };
    }
  }
  return { ok: false, ...(last ?? classifyProviderFailure(null, { operation })), attempts };
}

export async function enumerateCompletePages({ fetchPage, pageSize = 100, maximumPages = 100 } = {}) {
  if (typeof fetchPage !== "function" || !Number.isSafeInteger(pageSize) || pageSize < 1 || !Number.isSafeInteger(maximumPages) || maximumPages < 1) {
    return { ok: false, complete: false, classification: PROVIDER_CLASSIFICATIONS.VALIDATION_FAILURE, items: [], pages: 0 };
  }
  const items = [];
  const seenCursors = new Set();
  let cursor = null;
  for (let page = 1; page <= maximumPages; page += 1) {
    let result;
    try { result = await fetchPage({ cursor, page, pageSize }); }
    catch (error) {
      const failure = classifyProviderFailure(error);
      return { ok: false, complete: false, ...failure, items: [], pages: page - 1 };
    }
    if (!result || !Array.isArray(result.items) || typeof result.complete !== "boolean") {
      return { ok: false, complete: false, classification: PROVIDER_CLASSIFICATIONS.READ_INCOMPLETE, retryable: false, items: [], pages: page - 1 };
    }
    items.push(...result.items);
    if (result.complete) return { ok: true, complete: true, classification: "PROVIDER_READ_COMPLETE", items, pages: page };
    if (result.items.length === 0 || typeof result.nextCursor !== "string" || !result.nextCursor || seenCursors.has(result.nextCursor)) {
      return { ok: false, complete: false, classification: PROVIDER_CLASSIFICATIONS.READ_INCOMPLETE, retryable: false, items: [], pages: page };
    }
    seenCursors.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  return { ok: false, complete: false, classification: PROVIDER_CLASSIFICATIONS.READ_INCOMPLETE, retryable: false, items: [], pages: maximumPages };
}

function synchronousProviderAttempt({ invoke, operation = "read", attempts = 3 }) {
  if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 3 || typeof invoke !== "function") {
    return { ok: false, classification: PROVIDER_CLASSIFICATIONS.VALIDATION_FAILURE, attempts: 0, retryable: false };
  }
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try { return { ok: true, classification: "PROVIDER_OPERATION_COMPLETE", attempts: attempt, value: invoke(attempt) }; }
    catch (error) {
      last = classifyProviderFailure(error, { operation });
      if (!last.retryable || attempt === attempts) return { ok: false, ...last, attempts: attempt };
    }
  }
  return { ok: false, ...(last ?? classifyProviderFailure(null, { operation })), attempts };
}

function ghFailure(result) {
  const error = new Error("GITHUB_API_READ_FAILED");
  error.status = result.status;
  const stderr = String(result.stderr ?? "");
  const status = /HTTP\s+(\d{3})/iu.exec(stderr)?.[1];
  if (status) error.statusCode = Number(status);
  error.code = result.error?.code;
  return error;
}

export function readGitHubJsonSync({ root, endpoint, paginate = false, attempts = 3, run = spawnSync } = {}) {
  if (typeof root !== "string" || !root || typeof endpoint !== "string" || !endpoint) {
    return { ok: false, complete: false, items: [], classification: PROVIDER_CLASSIFICATIONS.VALIDATION_FAILURE, attempts: 0 };
  }
  const operation = synchronousProviderAttempt({
    attempts,
    invoke: () => {
      const args = ["api", "--method=GET"];
      if (paginate) args.push("--paginate", "--slurp");
      args.push(endpoint);
      const result = run("gh", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: DEFAULT_GIT_OUTPUT_LIMIT,
        env: {
          ...process.env,
          ...(!process.env.GH_TOKEN && process.env.GITHUB_TOKEN ? { GH_TOKEN: process.env.GITHUB_TOKEN } : {}),
        },
      });
      if (result.status !== 0 || result.error) throw ghFailure(result);
      return JSON.parse(result.stdout);
    },
  });
  if (!operation.ok) return { ...operation, complete: false, items: [] };
  if (paginate) {
    const pages = operation.value;
    const complete = Array.isArray(pages) && pages.length > 0 && pages.every(Array.isArray);
    return complete
      ? { ok: true, complete: true, classification: "PROVIDER_READ_COMPLETE", attempts: operation.attempts, items: pages.flat(), pages: pages.length }
      : { ok: false, complete: false, classification: PROVIDER_CLASSIFICATIONS.READ_INCOMPLETE, attempts: operation.attempts, items: [] };
  }
  return { ok: true, complete: true, classification: "PROVIDER_READ_COMPLETE", attempts: operation.attempts, value: operation.value };
}

export function readGitHubTextSync({ root, endpoint, attempts = 3, run = spawnSync } = {}) {
  if (typeof root !== "string" || !root || typeof endpoint !== "string" || !endpoint) {
    return { ok: false, classification: PROVIDER_CLASSIFICATIONS.VALIDATION_FAILURE, attempts: 0 };
  }
  const operation = synchronousProviderAttempt({
    attempts,
    invoke: () => {
      const result = run("gh", ["api", "--method=GET", endpoint], {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        maxBuffer: DEFAULT_GIT_OUTPUT_LIMIT,
        env: {
          ...process.env,
          ...(!process.env.GH_TOKEN && process.env.GITHUB_TOKEN ? { GH_TOKEN: process.env.GITHUB_TOKEN } : {}),
        },
      });
      if (result.status !== 0 || result.error) throw ghFailure(result);
      return String(result.stdout ?? "");
    },
  });
  return operation.ok
    ? { ok: true, complete: true, classification: "PROVIDER_READ_COMPLETE", attempts: operation.attempts, value: operation.value }
    : { ...operation, complete: false, value: null };
}

function reservationSelfValid(reservation) {
  const paths = uniqueSorted(reservation?.allowedPaths ?? []);
  const unhashed = Object.fromEntries(Object.entries(reservation ?? {}).filter(([key]) => key !== "reservationHash"));
  return paths.length > 0
    && exactObject(reservation?.allowedPaths, paths)
    && exactObject(reservation?.pathGlobs, paths)
    && paths.every((path) => typeof path === "string" && path && !path.startsWith("/") && !path.includes("..") && !path.includes("*"))
    && Number.isSafeInteger(reservation?.maximumFiles) && reservation.maximumFiles >= paths.length
    && Number.isSafeInteger(reservation?.maximumLines) && reservation.maximumLines > 0
    && reservation?.eligiblePathCount === paths.length
    && reservation?.reservationHash === controlPlaneHash(unhashed);
}

/**
 * Validates the amendment projection carried into terminal synchronization.
 * Optional amendment capacity and consumed amendment authority are separate:
 * an unused reservation is BASE_ONLY even when maximumAmendments is one.
 */
export function resolveTerminalAmendmentState({ lease, baseReservation, effectiveReservation, amendmentReceipt = null } = {}) {
  const findings = [];
  const maximumAmendments = lease?.amendmentMaximum?.maximumAmendments ?? 0;
  const amendmentsConsumed = amendmentReceipt === null ? 0 : 1;
  const semantic = resolveFiniteTaskAmendmentState({
    maximumAmendments,
    amendmentsConsumed,
    amendmentReceipt,
    baseLease: baseReservation,
    effectiveLease: effectiveReservation,
  });
  findings.push(...semantic.findings);
  if (!reservationSelfValid(baseReservation) || !reservationSelfValid(effectiveReservation)) findings.push("TERMINAL_RESERVATION_INVALID");
  if (Array.isArray(lease?.allowedPaths) && !exactObject(baseReservation?.allowedPaths, uniqueSorted(lease.allowedPaths))) findings.push("TERMINAL_BASE_RESERVATION_PATHS_INVALID");
  if (Number.isSafeInteger(lease?.scopeBudget?.maximumFiles) && baseReservation?.maximumFiles !== lease.scopeBudget.maximumFiles) findings.push("TERMINAL_BASE_RESERVATION_FILE_BUDGET_INVALID");
  if (Number.isSafeInteger(lease?.scopeBudget?.maximumChangedLines) && baseReservation?.maximumLines !== lease.scopeBudget.maximumChangedLines) findings.push("TERMINAL_BASE_RESERVATION_LINE_BUDGET_INVALID");
  if (semantic.status === "AMENDED") {
    const addedPaths = uniqueSorted(amendmentReceipt?.addedPaths ?? []);
    const effectivePaths = uniqueSorted([...(baseReservation?.allowedPaths ?? []), ...addedPaths]);
    const maximum = lease?.amendmentMaximum ?? {};
    if (!Number.isSafeInteger(amendmentReceipt?.commentId) || amendmentReceipt.commentId < 1
      || !Number.isFinite(Date.parse(amendmentReceipt?.createdAt ?? ""))
      || ![amendmentReceipt?.subjectHash, amendmentReceipt?.bodyHash, amendmentReceipt?.rawBodyHash].every((value) => SHA256.test(value ?? ""))
      || !GIT_SHA.test(amendmentReceipt?.boundStartingHead ?? "")
      || !GIT_SHA.test(amendmentReceipt?.boundStartingTree ?? "")
      || amendmentReceipt?.authorityClassification !== "LIVE_IMMUTABLE_OWNER_RECEIPT"
      || amendmentReceipt?.domain !== lease?.domain
      || !exactObject(amendmentReceipt?.addedPaths, addedPaths)
      || addedPaths.length < 1
      || addedPaths.some((path) => typeof path !== "string" || !path || path.startsWith("/") || path.includes("..") || path.includes("*"))
      || !exactObject(effectiveReservation?.allowedPaths, effectivePaths)
      || effectiveReservation?.maximumFiles > maximum.maximumFiles
      || effectiveReservation?.maximumLines > maximum.maximumChangedLines
      || effectiveReservation?.maximumFiles < baseReservation?.maximumFiles
      || effectiveReservation?.maximumLines < baseReservation?.maximumLines) {
      findings.push("TERMINAL_AMENDMENT_RECEIPT_INVALID");
    }
  }
  return {
    ok: findings.length === 0,
    status: findings.length ? "INVALID" : semantic.status,
    maximumAmendments,
    amendmentsConsumed,
    findings: uniqueSorted(findings),
  };
}

export function resolveLifecycle({ state, event, identity, evidence = null } = {}) {
  const findings = [];
  if (!["DRAFT", "READY", "MERGED"].includes(state)) findings.push("LIFECYCLE_STATE_INVALID");
  if (!["SOURCE_READINESS", "MARK_READY", "MARK_DRAFT", "HEAD_CHANGED", "BASE_CHANGED", "REVIEW", "PHASE1", "MERGE"].includes(event)) findings.push("LIFECYCLE_EVENT_INVALID");
  const nextState = event === "MARK_READY" ? "READY" : event === "MARK_DRAFT" ? "DRAFT" : event === "MERGE" ? "MERGED" : state;
  const invalidated = ["HEAD_CHANGED", "BASE_CHANGED", "MARK_DRAFT"].includes(event);
  if (event === "MERGE" && state !== "READY") findings.push("DRAFT_MERGE_FORBIDDEN");
  if (event === "MERGE" && (!evidence?.reviewCurrent || !evidence?.phase1Current || !evidence?.finalSourceCurrent)) findings.push("MERGE_EVIDENCE_INCOMPLETE");
  if (event === "MERGE" && evidence?.headSha !== identity?.headSha) findings.push("MERGE_HEAD_STALE");
  if (event === "MERGE" && evidence?.tree !== identity?.tree) findings.push("MERGE_TREE_STALE");
  if (event === "MERGE" && evidence?.baseSha !== identity?.baseSha) findings.push("MERGE_BASE_STALE");
  return {
    ok: findings.length === 0,
    priorState: state,
    state: nextState,
    mergeAuthorityGranted: findings.length === 0 && event === "MERGE",
    sourceReadinessOnly: nextState === "DRAFT",
    invalidated,
    evidence: invalidated ? null : evidence,
    findings: uniqueSorted(findings),
  };
}

export function classifyProtectedMainAdvancement({ candidateBase, protectedMain, sourceConflict = false, sourceSemanticsChanged = false } = {}) {
  if (![candidateBase, protectedMain].every((value) => GIT_SHA.test(value ?? ""))) return { ok: false, classification: "PROTECTED_MAIN_IDENTITY_INVALID" };
  if (candidateBase === protectedMain) return { ok: true, classification: "UNCHANGED", rebindAllowed: true, evidenceReusable: true };
  if (sourceConflict || sourceSemanticsChanged) return { ok: false, classification: "SEMANTIC_INVALIDATION", rebindAllowed: false, evidenceReusable: false };
  return { ok: true, classification: "MECHANICAL_BASE_ADVANCEMENT", rebindAllowed: true, evidenceReusable: false };
}

export function validateImplementationChain({ taskId, implementations, finalProtectedMain } = {}) {
  const findings = [];
  if (typeof taskId !== "string" || !taskId || !Array.isArray(implementations) || implementations.length < 1) findings.push("IMPLEMENTATION_CHAIN_INPUT_INVALID");
  const seenPrs = new Set();
  for (let index = 0; index < (implementations ?? []).length; index += 1) {
    const entry = implementations[index];
    const validation = entry?.validation;
    if (!Number.isSafeInteger(entry?.pr) || entry.pr < 1 || seenPrs.has(entry.pr)) findings.push("IMPLEMENTATION_CHAIN_PR_INVALID");
    seenPrs.add(entry?.pr);
    if (![entry?.baseSha, entry?.headSha, entry?.tree, entry?.mergeSha, entry?.mergeTree].every((value) => GIT_SHA.test(value ?? ""))) findings.push("IMPLEMENTATION_CHAIN_GIT_IDENTITY_INVALID");
    if (typeof entry?.branch !== "string" || !/^codex\/[a-z0-9][a-z0-9._/-]*$/u.test(entry.branch)
      || typeof entry?.title !== "string" || !entry.title) findings.push("IMPLEMENTATION_CHAIN_METADATA_INVALID");
    if (entry?.tree !== entry?.mergeTree) findings.push("IMPLEMENTATION_CHAIN_TREE_MISMATCH");
    if (!Array.isArray(entry?.mergeParents) || entry.mergeParents.length !== 2 || entry.mergeParents[0] !== entry.baseSha || entry.mergeParents[1] !== entry.headSha) findings.push("IMPLEMENTATION_CHAIN_PARENT_MISMATCH");
    if (index > 0 && entry.baseSha !== implementations[index - 1].mergeSha) findings.push("IMPLEMENTATION_CHAIN_DISCONTIGUOUS");
    const passDisposition = validation?.assuranceDisposition === "PASS"
      && validation?.ownerRecoveryCommentId === null
      && validation?.ownerRecoveryRawBodyHash === null
      && Array.isArray(validation?.bypassedChecks) && validation.bypassedChecks.length === 0;
    const boundedRecoveryDisposition = validation?.assuranceDisposition === "OWNER_AUTHORIZED_BOUNDED_ASSURANCE_OVERRIDE"
      && Number.isSafeInteger(validation?.ownerRecoveryCommentId) && validation.ownerRecoveryCommentId > 0
      && SHA256.test(validation?.ownerRecoveryRawBodyHash ?? "")
      && Array.isArray(validation?.bypassedChecks) && validation.bypassedChecks.length > 0
      && validation.bypassedChecks.every((check) => typeof check === "string" && check);
    if (!Number.isSafeInteger(validation?.phase1RunId) || validation.phase1RunId < 1
      || !Number.isSafeInteger(validation?.reviewRunId) || validation.reviewRunId < 1
      || validation?.phase1RawLanesPassed !== 13 || validation?.phase1RawLanesRequired !== 13
      || validation?.securityFindings !== 0 || validation?.P0 !== 0 || validation?.P1 !== 0 || validation?.launchImpactingP2 !== 0
      || (!passDisposition && !boundedRecoveryDisposition)) findings.push("IMPLEMENTATION_CHAIN_VALIDATION_INVALID");
  }
  if (implementations?.at(-1)?.mergeSha !== finalProtectedMain) findings.push("IMPLEMENTATION_CHAIN_FINAL_MAIN_MISMATCH");
  return { ok: findings.length === 0, findings: uniqueSorted(findings), taskId, implementations, finalProtectedMain };
}

export function validateRecoveryEvent({ authority, actualRuleset, intendedPermanentBypassActors = [] } = {}) {
  const findings = [];
  if (authority?.classification !== "OWNER_AUTHORIZED_BOUNDED_ASSURANCE_RECOVERY_V2") findings.push("RECOVERY_AUTHORITY_INVALID");
  if (!Number.isSafeInteger(authority?.pr) || !GIT_SHA.test(authority?.head ?? "") || !GIT_SHA.test(authority?.tree ?? "")) findings.push("RECOVERY_TARGET_INVALID");
  if (!Array.isArray(authority?.bypassedChecks) || authority.bypassedChecks.length < 1 || authority.bypassedChecks.some((item) => typeof item !== "string" || !item)) findings.push("RECOVERY_CHECK_SCOPE_INVALID");
  if (authority?.scope !== "EXACT_PR_HEAD_TREE_ONLY" || authority?.expiresOn !== `PR_${authority?.pr}_MERGE`) findings.push("RECOVERY_WINDOW_UNBOUNDED");
  if (actualRuleset?.enforcement !== "active") findings.push("RULESET_ENFORCEMENT_INVALID");
  if (!exactObject(uniqueSorted(actualRuleset?.bypassActors ?? []), uniqueSorted(intendedPermanentBypassActors))) findings.push("RULESET_BYPASS_RESTORATION_INVALID");
  if (actualRuleset?.temporaryOwnerBypass === true || actualRuleset?.temporaryRepositoryRoleBypass === true) findings.push("RECOVERY_TEMPORARY_BYPASS_PERSISTED");
  return { ok: findings.length === 0, findings: uniqueSorted(findings) };
}

export function projectTerminalSynchronization({ record, transition } = {}) {
  if (!record || typeof record !== "object" || !transition || typeof transition !== "object") {
    return { ok: false, mutated: false, findings: ["TERMINAL_SYNCHRONIZATION_INPUT_INVALID"] };
  }
  const next = structuredClone(record);
  const implementations = transition.implementations ?? [];
  const chain = validateImplementationChain({ taskId: transition.taskId, implementations, finalProtectedMain: transition.finalProtectedMain });
  if (!chain.ok) return { ok: false, mutated: false, findings: chain.findings };
  const final = implementations.at(-1);
  const leaseIndex = (next?.finiteTaskLeases?.tasks ?? []).findIndex(({ leaseId }) => leaseId === transition.taskId);
  if (leaseIndex < 0) return { ok: false, mutated: false, findings: ["TERMINAL_SYNCHRONIZATION_LEASE_MISSING"] };
  const amendment = resolveTerminalAmendmentState({
    lease: transition.baseLease,
    baseReservation: transition.baseReservation,
    effectiveReservation: transition.effectiveReservation,
    amendmentReceipt: transition.amendmentReceipt,
  });
  const finalSource = transition.finalSourceEvidence;
  const finalSourceUnhashed = Object.fromEntries(Object.entries(finalSource ?? {}).filter(([key]) => key !== "evidenceHash"));
  const expectedImplementationEvidence = implementations.map(({ pr, headSha, tree, validation }) => ({ pr, headSha, tree, validation }));
  if (!transition.baseLease
    || transition.baseLease?.leaseId !== transition.taskId
    || !exactObject(next.finiteTaskLeases.tasks[leaseIndex], transition.baseLease)
    || !SHA256.test(transition.baseLeaseHash ?? "")
    || transition.baseLeaseHash !== controlPlaneHash(transition.baseLease)
    || !transition.baseReservation
    || !amendment.ok
    || finalSource?.schemaVersion !== 1
    || finalSource?.classification !== "EXACT_SOURCE_PHASE1_REVIEW_AND_BOUNDED_RECOVERY_EVIDENCE_V1"
    || finalSource?.repository !== "Chillywood2025/chillywood-mobile"
    || finalSource?.taskId !== transition.taskId
    || finalSource?.source !== "LIVE_GITHUB_READBACK"
    || !Number.isFinite(Date.parse(finalSource?.observedAt ?? ""))
    || finalSource?.finalHead !== final?.headSha
    || finalSource?.finalTree !== final?.tree
    || !exactObject(finalSource?.implementationEvidence, expectedImplementationEvidence)
    || !SHA256.test(finalSource?.evidenceHash ?? "")
    || finalSource.evidenceHash !== controlPlaneHash(finalSourceUnhashed)
    || !Number.isFinite(Date.parse(transition.observedAt ?? ""))
    || typeof transition.nextTask !== "string" || !transition.nextTask
    || transition.noActiveEngineeringDoctrine?.activeTaskSentinel !== "NO_ACTIVE_PRODUCT_IMPLEMENTATION"
    || transition.noActiveEngineeringDoctrine?.taskLeaseState !== "NO_ACTIVE_TASK"
    || !Array.isArray(transition.noActiveEngineeringDoctrine?.affectedDomains)
    || transition.noActiveEngineeringDoctrine.affectedDomains.length !== 0
    || transition.noActiveEngineeringDoctrine?.nextPermittedAction !== transition.nextTask) {
    return { ok: false, mutated: false, findings: ["TERMINAL_SYNCHRONIZATION_EVIDENCE_INVALID"] };
  }
  const existing = record?.finiteTaskRuntime?.terminalOutcome;
  const completed = (record?.finiteTaskLeases?.completedLeaseOutcomes ?? []).find(({ leaseId }) => leaseId === transition.taskId);
  const alreadyConverged = existing?.schemaVersion === 3
    && existing.taskId === transition.taskId
    && existing.baseLeaseHash === transition.baseLeaseHash
    && exactObject(existing.baseReservation, transition.baseReservation)
    && exactObject(existing.effectiveReservation, transition.effectiveReservation)
    && exactObject(existing.amendmentReceipt, transition.amendmentReceipt)
    && exactObject(existing.finalSourceEvidence, transition.finalSourceEvidence)
    && exactObject(existing.implementationChain, implementations)
    && existing.mergeSha === transition.finalProtectedMain
    && existing.nextTask === transition.nextTask
    && exactObject(completed, existing)
    && record.activeTaskBinding === null
    && record.engineeringDoctrine?.activeTaskSentinel === "NO_ACTIVE_PRODUCT_IMPLEMENTATION"
    && record.engineeringDoctrine?.taskLeaseState === "NO_ACTIVE_TASK";
  if (alreadyConverged) return { ok: true, mutated: false, record: structuredClone(record), terminalOutcome: structuredClone(existing), findings: [] };
  if (existing?.schemaVersion === 3 && existing?.taskId === transition.taskId) {
    return { ok: false, mutated: false, findings: ["TERMINAL_SYNCHRONIZATION_CONFLICT"] };
  }
  const terminalEvidence = {
    schemaVersion: 3,
    classification: "FINITE_TASK_IMPLEMENTATION_CHAIN_TERMINAL_EVIDENCE_V3",
    repository: "Chillywood2025/chillywood-mobile",
    taskId: transition.taskId,
    leaseId: transition.taskId,
    implementationPr: implementations[0].pr,
    implementationBranch: implementations[0].branch,
    baseLeaseHash: transition.baseLeaseHash,
    baseReservation: structuredClone(transition.baseReservation),
    effectiveReservation: structuredClone(transition.effectiveReservation),
    amendmentReceipt: structuredClone(transition.amendmentReceipt),
    finalSourceEvidence: structuredClone(transition.finalSourceEvidence),
    sourceHead: final.headSha,
    sourceTree: final.tree,
    mergeSha: final.mergeSha,
    mergeTree: final.mergeTree,
    mergeParents: final.mergeParents,
    implementationChain: structuredClone(implementations),
    nextTask: transition.nextTask,
    authority: { providerMutation: false, databaseDeployment: false, build: false, submission: false, ota: false, publicRelease: false },
  };
  const terminalOutcome = { ...terminalEvidence, evidenceHash: controlPlaneHash(terminalEvidence) };
  next.mainSha = final.mergeSha;
  next.protectedMainAuthority.checkpointSha = final.mergeSha;
  next.protectedMainAuthority.checkpointTree = final.mergeTree;
  next.latestMergedImplementationPr = { number: final.pr, state: "merged", head: final.headSha, mergeSha: final.mergeSha, mergeTree: final.mergeTree, title: final.title };
  next.openImplementationPrs = (next.openImplementationPrs ?? []).filter(({ number }) => !implementations.some(({ pr }) => pr === number));
  // The admitted lease is immutable evidence. Completion is modeled by the
  // terminal outcome rather than rewriting the authority that admitted it.
  next.finiteTaskLeases.tasks[leaseIndex] = structuredClone(transition.baseLease);
  const outcomes = next.finiteTaskLeases.completedLeaseOutcomes ?? [];
  const withoutTask = outcomes.filter(({ leaseId }) => leaseId !== transition.taskId);
  next.finiteTaskLeases.completedLeaseOutcomes = [...withoutTask, terminalOutcome];
  next.activeTaskBinding = null;
  next.finiteTaskRuntime = {
    ...next.finiteTaskRuntime,
    schemaVersion: 1,
    authority: "PROTECTED_FINITE_TASK_LEASE",
    authorityClosed: { build: true, database: true, provider: true, publicRelease: true },
    candidatePolicy: "DYNAMIC_READ_ONLY_NOT_PROTECTED_TRUTH_AUTHORITY",
    candidateObservation: {
      pr: final.pr,
      branch: final.branch,
      prState: "merged",
      head: final.headSha,
      tree: final.tree,
      classification: "MERGED_VERIFIED",
      observedAt: transition.observedAt,
    },
    finalEvidence: { mergeEligible: false, ownerReceipt: false, phase1: false, repositoryReview: false },
    historicalCandidates: [
      ...(next.finiteTaskRuntime?.historicalCandidates ?? []),
      ...implementations.map((entry) => ({
        classification: "MERGED_VERIFIED",
        pr: entry.pr,
        head: entry.headSha,
        tree: entry.tree,
        mergeSha: entry.mergeSha,
        phase1Result: `PASS_${entry.validation.phase1RawLanesPassed}_OF_${entry.validation.phase1RawLanesRequired}`,
        phase1RunId: entry.validation.phase1RunId,
      })),
    ],
    terminalOutcome,
  };
  next.engineeringDoctrine = structuredClone(transition.noActiveEngineeringDoctrine);
  next.assuranceProgram.nextActions = [transition.nextTask];
  const mutated = canonicalJson(record) !== canonicalJson(next);
  return { ok: true, mutated, record: next, terminalOutcome, findings: [] };
}

export function terminalSynchronizationIdempotent({ record, transition } = {}) {
  const first = projectTerminalSynchronization({ record, transition });
  if (!first.ok) return { ok: false, findings: first.findings };
  const second = projectTerminalSynchronization({ record: first.record, transition });
  if (!second.ok || second.mutated) return { ok: false, findings: second.findings.length ? second.findings : ["TERMINAL_SYNCHRONIZATION_FIXED_POINT_INVALID"] };
  return { ok: true, firstMutation: first.mutated, secondMutation: second.mutated, record: second.record, findings: [] };
}

export function validateNegativeAuthority({ allowedPaths = [], changedPaths = [], authority = {}, evidence = {} } = {}) {
  const findings = [];
  const allowed = new Set(allowedPaths);
  if (changedPaths.some((path) => path === "*" || path.includes("**") || !allowed.has(path))) findings.push("UNAUTHORIZED_PATH");
  for (const boundary of ["product", "database", "provider", "money", "native", "build", "ota", "submission", "publicRelease", "release"]) {
    if (authority?.[boundary] === true) findings.push(`UNAUTHORIZED_${boundary.toUpperCase()}_AUTHORITY`);
  }
  if (evidence?.forgedOwner || evidence?.editedImmutable || evidence?.wrongTask || evidence?.wrongHead || evidence?.wrongTree || evidence?.staleReview || evidence?.staleFinalSource || evidence?.unknownSecurity || evidence?.fabricatedProvider) findings.push("EVIDENCE_INVALID");
  if (evidence?.draftMerge) findings.push("DRAFT_MERGE_FORBIDDEN");
  if ((evidence?.P0 ?? 0) > 0 || (evidence?.P1 ?? 0) > 0) findings.push("BLOCKING_SECURITY_FINDING");
  if (evidence?.rlsRegression || evidence?.entitlementFailOpen || evidence?.rulesetBypass || evidence?.persistentOwnerBypass) findings.push("AUTHORITY_FAIL_OPEN");
  return { ok: findings.length === 0, findings: uniqueSorted(findings) };
}
