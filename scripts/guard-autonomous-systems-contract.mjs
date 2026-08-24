#!/usr/bin/env node
import fs from "node:fs";
import { spawnSync } from "node:child_process";

const core = new URL("./guard-autonomous-systems-contract-core.mjs", import.meta.url);
const result = spawnSync(process.execPath, [core.pathname], {
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

// GITHUB_EVENT_PATH is GitHub-owned immutable event input. Draft is the only
// lifecycle state that may defer final admission; all ready/non-PR contexts
// preserve the core guard's strict result.
const sourceReadiness = event?.pull_request?.draft === true
  && typeof event?.number === "number"
  && typeof event?.repository?.full_name === "string"
  && event?.repository?.full_name === event?.pull_request?.base?.repo?.full_name;

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

const gitResult = (args) => spawnSync("git", args, {
  cwd: process.cwd(),
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

const trackedTestInventory = (ref) => {
  const inventory = gitResult([
    "ls-tree", "-r", "-z", ref, "--", "tests", "supabase/tests",
  ]);
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
  const blob = gitResult(["show", `${ref}:${file}`]);
  return blob.status === 0 ? String(blob.stdout ?? "") : null;
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

const admissionOnlyFailure = (failure) => {
  if (failure === "source-only autonomous contract requires shared evaluator eligibility") return true;
  const prefix = "finite task runtime candidate failed: ";
  if (!failure.startsWith(prefix)) return false;
  const findings = failure.slice(prefix.length).split(",").filter(Boolean);
  return findings.length > 0 && findings.every((finding) => expectedFiniteTaskFindings.has(finding));
};

const failures = Array.isArray(payload?.failures) ? payload.failures : [];
const mayDeferFinalAdmission = sourceReadiness
  && payload?.ok === false
  && failures.length > 0
  && failures.every(admissionOnlyFailure)
  && draftTestSourceNonRegression(event);

if (mayDeferFinalAdmission) {
  process.stdout.write(`${JSON.stringify({
    ok: true,
    mode: "DRAFT_SOURCE_READINESS",
    mergeAuthorityGranted: false,
    deferredFinalAdmissionFailures: failures,
  }, null, 2)}\n`);
  process.exit(0);
}

process.exit(result.status ?? 1);
