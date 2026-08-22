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

let payload = null;
try {
  payload = JSON.parse((result.stdout ?? "").trim());
} catch {
  payload = null;
}

const expectedFiniteTaskFindings = new Set([
  "FINITE_TASK_EFFECTIVE_RESERVATION_LIVE_AUTHORITY_REQUIRED",
  "FINITE_TASK_TEST_ADAPTATION_FIXTURE_INTEGRITY_INVALID",
  "FINITE_TASK_TEST_ADAPTATION_PARTITION_INVALID",
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
  && failures.every(admissionOnlyFailure);

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
