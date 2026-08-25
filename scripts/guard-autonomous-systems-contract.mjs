#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";

const root = process.cwd();
const subjectGit = (argv, options = {}) => execFileSync("git", argv, {
  cwd: root,
  encoding: "utf8",
  shell: false,
  maxBuffer: options.maxBuffer ?? 64 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"],
});

const core = new URL("./guard-autonomous-systems-contract-core.mjs", import.meta.url);
const result = spawnSync(process.execPath, [core.pathname], {
  cwd: root,
  encoding: "utf8",
  env: process.env,
  maxBuffer: 64 * 1024 * 1024,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status === 0) process.exit(0);

let event = null;
try {
  event = process.env.GITHUB_EVENT_PATH
    ? JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"))
    : null;
} catch {
  event = null;
}

// This wrapper can grant only a non-authoritative draft lane result. Accept its
// event projection only in the exact GitHub pull-request Actions context; the
// protected aggregate separately re-reads live PR state before any authority.
const pull = event?.pull_request;
const sourceReadinessActions = new Set(["opened", "synchronize", "reopened", "edited", "converted_to_draft"]);
const sourceReadiness = process.env.GITHUB_ACTIONS === "true"
  && process.env.GITHUB_EVENT_NAME === "pull_request"
  && sourceReadinessActions.has(event?.action)
  && event?.repository?.full_name === "Chillywood2025/chillywood-mobile"
  && Number.isInteger(event?.number)
  && event.number > 0
  && pull?.number === event.number
  && pull?.state === "open"
  && pull?.draft === true
  && pull?.base?.ref === "main"
  && pull?.base?.repo?.full_name === event.repository.full_name
  && pull?.head?.repo?.full_name === event.repository.full_name
  && typeof pull?.head?.ref === "string"
  && pull.head.ref.length > 0
  && typeof pull?.updated_at === "string"
  && Number.isFinite(Date.parse(pull.updated_at))
  && /^[0-9a-f]{40}$/u.test(pull?.base?.sha ?? "")
  && /^[0-9a-f]{40}$/u.test(pull?.head?.sha ?? "");

const parseStructuredPayload = (output) => {
  try {
    const parsed = JSON.parse(String(output ?? "").trim());
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const exactCommit = (value) => (
  typeof value === "string" && /^[0-9a-f]{40}$/u.test(value) ? value : null
);

const canonicalGitText = (value) => String(value ?? "").replace(/\r\n?|\n/gu, "\n").trim();

const gitResult = ({ args, gitCommand }) => {
  try {
    return { status: 0, stdout: gitCommand(args, { maxBuffer: 64 * 1024 * 1024 }) };
  } catch (error) {
    return { status: Number.isInteger(error?.status) ? error.status : 1, stdout: error?.stdout ?? "" };
  }
};

const trackedTestInventory = (ref) => {
  const inventory = gitResult({
    args: ["ls-tree", "-r", "-z", ref, "--", "tests", "supabase/tests"],
    gitCommand: subjectGit,
  });
  if (inventory.status !== 0) return null;
  const rows = new Map();
  for (const entry of String(inventory.stdout ?? "").split("\0").filter(Boolean)) {
    const match = entry.match(/^[0-7]+\s+blob\s+([0-9a-f]{40})\t(.+)$/u);
    if (!match) return null;
    rows.set(match[2], match[1]);
  }
  return rows;
};

const exactGitBlobText = (ref, file) => {
  const blob = gitResult({ args: ["show", `${ref}:${file}`], gitCommand: subjectGit });
  return blob.status === 0 ? String(blob.stdout ?? "") : null;
};

const draftSourceScope = (eventPayload) => {
  try {
    const baseSha = exactCommit(eventPayload?.pull_request?.base?.sha);
    const headSha = exactCommit(eventPayload?.pull_request?.head?.sha);
    if (!baseSha || !headSha) return null;
    const baseTree = canonicalGitText(subjectGit(["rev-parse", `${baseSha}^{tree}`]));
    const headTree = canonicalGitText(subjectGit(["rev-parse", `${headSha}^{tree}`]));
    const executionSha = canonicalGitText(subjectGit(["rev-parse", "HEAD^{commit}"]));
    const executionTree = canonicalGitText(subjectGit(["rev-parse", "HEAD^{tree}"]));
    const executionParents = canonicalGitText(subjectGit(["show", "-s", "--format=%P", executionSha]))
      .split(/\s+/u)
      .filter(Boolean);
    const directHead = executionSha === headSha && executionTree === headTree;
    const exactPullRequestMerge = executionParents.length === 2
      && executionParents[0] === baseSha
      && executionParents[1] === headSha;
    if ((!directHead && !exactPullRequestMerge)
      || (process.env.GITHUB_SHA && process.env.GITHUB_SHA !== executionSha)) return null;

    const range = `${baseSha}...${headSha}`;
    const diff = canonicalGitText(subjectGit(["diff", "--full-index", "--binary", "--no-ext-diff", range]));
    const changedPaths = String(subjectGit(["diff", "--name-only", "-z", range]))
      .split("\0")
      .filter(Boolean)
      .sort();
    if (new Set(changedPaths).size !== changedPaths.length) return null;
    return Object.freeze({
      schemaVersion: 1,
      classification: "DRAFT_SOURCE_SCOPE_V1",
      repository: eventPayload.repository.full_name,
      pr: eventPayload.number,
      action: eventPayload.action,
      eventUpdatedAt: eventPayload.pull_request.updated_at,
      draft: true,
      baseRef: eventPayload.pull_request.base.ref,
      baseSha,
      baseTree,
      headRef: eventPayload.pull_request.head.ref,
      headSha,
      headTree,
      executionSha,
      executionTree,
      executionRelationship: directHead ? "EXACT_HEAD" : "EXACT_GITHUB_PULL_REQUEST_MERGE",
      changedFiles: changedPaths.length,
      changedPathWorklistSha256: crypto.createHash("sha256").update(JSON.stringify(changedPaths)).digest("hex"),
      diffHash: crypto.createHash("sha256").update(diff).digest("hex"),
      finalSourceAuthority: false,
      mergeAuthorityGranted: false,
    });
  } catch {
    return null;
  }
};

const blockedExternalProviderProof = () => {
  try {
    const truth = JSON.parse(fs.readFileSync("config/assurance/current-truth-v1.json", "utf8"));
    const revenueCat = truth?.operationalClosures?.revenueCat;
    if (truth?.liveProviderReadback !== false
      || revenueCat?.premiumGranted !== false
      || revenueCat?.liveMoneyAction !== false
      || revenueCat?.moneyMoved !== false) return null;
    return Object.freeze({
      status: "BLOCKED_EXTERNAL",
      liveProviderReadback: false,
      premiumGranted: false,
      liveMoneyAction: false,
      moneyMoved: false,
      grantsSourceAuthority: false,
      grantsMergeAuthority: false,
    });
  } catch {
    return null;
  }
};

const numericPlanCount = (source) => {
  const counts = [...source.matchAll(/\b(?:select\s+)?plan\s*\(\s*(\d+)\s*\)/giu)]
    .map((match) => Number(match[1]));
  return counts.length === 1 && Number.isSafeInteger(counts[0]) && counts[0] > 0
    ? counts[0]
    : null;
};

const staticTestCounts = (file, source) => {
  if (/\.sql$/u.test(file)) {
    return {
      assertions: (source.match(/\b(?:select\s+)?(?:ok|is|isnt|throws_ok|lives_ok|has_[a-z_]+)\s*\(/giu) ?? []).length,
      plan: numericPlanCount(source),
      tests: null,
    };
  }
  if (/\.(?:[cm]?js|tsx?)$/u.test(file)) {
    return {
      assertions: (source.match(/\bassert(?:\.[A-Za-z_$][\w$]*|[A-Za-z_$][\w$]*)?\s*\(/gu) ?? []).length,
      plan: null,
      tests: (source.match(/(?:\bDeno\s*\.\s*test|\b(?:test|it))\s*\(/gu) ?? []).length,
    };
  }
  return null;
};

// Drafts may lack final finite-task admission, but they must still preserve the
// protected base's real test inventory.  This independent source check prevents
// a fixture-integrity/partition finding from concealing deleted tests, a reduced
// pgTAP plan, or fewer static test/assertion sites.  Any unreadable ref or source
// is non-authoritative and leaves the core failure red.
const draftTestSourceNonRegression = (eventPayload) => {
  const base = exactCommit(eventPayload?.pull_request?.base?.sha);
  const head = exactCommit(eventPayload?.pull_request?.head?.sha);
  if (!base || !head) return false;
  const baseline = trackedTestInventory(base);
  const candidate = trackedTestInventory(head);
  if (!baseline || !candidate) return false;

  for (const [file, baselineBlob] of baseline) {
    const candidateBlob = candidate.get(file);
    if (!candidateBlob) return false;
    if (candidateBlob === baselineBlob) continue;
    const baselineSource = exactGitBlobText(base, file);
    const candidateSource = exactGitBlobText(head, file);
    if (baselineSource === null || candidateSource === null) return false;
    const baselineCounts = staticTestCounts(file, baselineSource);
    if (!baselineCounts) continue;
    const candidateCounts = staticTestCounts(file, candidateSource);
    if (!candidateCounts) return false;
    if (
      baselineCounts.assertions > candidateCounts.assertions
      || (baselineCounts.plan !== null && (
        candidateCounts.plan === null || candidateCounts.plan < baselineCounts.plan
      ))
      || (baselineCounts.tests !== null && baselineCounts.tests > candidateCounts.tests)
    ) return false;
  }
  return true;
};

// The core emits its structured failure receipt with console.error. Accept only
// an entire JSON object from one otherwise-exclusive channel, or identical JSON
// on both channels; never ignore conflicting or partial diagnostic output.
const stdoutText = String(result.stdout ?? "").trim();
const stderrText = String(result.stderr ?? "").trim();
const stdoutPayload = parseStructuredPayload(stdoutText);
const stderrPayload = parseStructuredPayload(stderrText);
let payload = null;
if (stdoutPayload && !stderrText) payload = stdoutPayload;
else if (stderrPayload && !stdoutText) payload = stderrPayload;
else if (stdoutPayload && stderrPayload && JSON.stringify(stdoutPayload) === JSON.stringify(stderrPayload)) {
  payload = stdoutPayload;
}

const expectedFiniteTaskFindings = new Set([
  "FINITE_TASK_EFFECTIVE_RESERVATION_LIVE_AUTHORITY_REQUIRED",
]);

const expectedRollingProtectedMainFindings = [
  "CURRENT_TRUTH_AUTHORITY_CONTROL_DRIFT",
  "CURRENT_TRUTH_PENDING_TRANSITION_AUTHORITY_INVALID",
  "CURRENT_TRUTH_PENDING_TRANSITION_ORDER_INVALID",
];

const sourceEligibilityFailure = "source-only autonomous contract requires shared evaluator eligibility";

const finiteTaskAdmissionFailure = (failure) => {
  const prefix = "finite task runtime candidate failed: ";
  if (!failure.startsWith(prefix)) return false;
  const findings = failure.slice(prefix.length).split(",").filter(Boolean);
  return findings.length > 0
    && new Set(findings).size === findings.length
    && findings.every((finding) => expectedFiniteTaskFindings.has(finding));
};

const rollingProtectedMainAdmissionFailure = (failure) => {
  const prefix = "rolling protected-main evaluation failed: ";
  if (!failure.startsWith(prefix)) return false;
  const findings = failure.slice(prefix.length).split(",").filter(Boolean);
  return JSON.stringify(findings) === JSON.stringify(expectedRollingProtectedMainFindings);
};

const admissionOnlyFailure = (failure) => {
  return failure === sourceEligibilityFailure
    || finiteTaskAdmissionFailure(failure)
    || rollingProtectedMainAdmissionFailure(failure);
};

const failures = Array.isArray(payload?.failures) ? payload.failures : [];
const sourceScope = sourceReadiness ? draftSourceScope(event) : null;
const providerProof = sourceReadiness ? blockedExternalProviderProof() : null;
const mayDeferFinalAdmission = sourceReadiness
  && payload?.ok === false
  && failures.includes(sourceEligibilityFailure)
  && failures.some((failure) => finiteTaskAdmissionFailure(failure) || rollingProtectedMainAdmissionFailure(failure))
  && failures.every(admissionOnlyFailure)
  && sourceScope !== null
  && providerProof !== null
  && draftTestSourceNonRegression(event);

if (mayDeferFinalAdmission) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: "DRAFT_SOURCE_READINESS",
    mergeAuthorityGranted: false,
    sourceScope,
    providerProof,
    deferredFinalAdmissionFailures: failures,
  }, null, 2)}\n`);
  process.exit(0);
}

process.exit(result.status ?? 1);
