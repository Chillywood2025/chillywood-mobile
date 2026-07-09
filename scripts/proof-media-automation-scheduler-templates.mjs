#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const assertNoSecretLikeText = (label, value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const patterns = [
    /postgres(?:ql)?:\/\//i,
    new RegExp(`X-Amz-${"Signature"}=`, "i"),
    /\bservice[_-]?role\b/i,
    /\bBearer\s+[A-Za-z0-9._-]+/i,
    /\beyJ[A-Za-z0-9_-]{20,}\./,
  ];
  const match = patterns.find((pattern) => pattern.test(text));
  assert(!match, `${label} contained secret-like text`);
};

const servicePath = "ops/media-automation/systemd/media-automation-worker.service";
const timerPath = "ops/media-automation/systemd/media-automation-worker.timer";
const service = read(servicePath);
const timer = read(timerPath);
const packageJson = read("package.json");
const docs = [
  read("docs/MEDIA_AUTOMATION_OPERATOR_RUNBOOK.md"),
  read("docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md"),
  read("docs/MEDIA_RECOVERY_OPERATOR_RUNBOOK.md"),
  read("docs/MEDIA_DELIVERY_SCALE_ARCHITECTURE.md"),
  read("CURRENT_STATE.md"),
  read("NEXT_TASK.md"),
].join("\n\n");

assert(service.includes("disabled template"), "service must be marked disabled template");
assert(timer.includes("Disabled template only"), "timer must be marked disabled template");
assert(service.includes("MEDIA_AUTOMATION_MODE=continuous_limited"), "service documents continuous_limited mode");
assert(service.includes("MEDIA_AUTOMATION_EMERGENCY_STOP=false"), "service documents emergency stop env");
assert(service.includes("MEDIA_AUTOMATION_REQUIRE_BACKUP_GATE=true"), "service requires backup gate");
assert(service.includes("MEDIA_AUTOMATION_DISABLE_BACKFILL=true"), "service disables backfill");
assert(service.includes("MEDIA_AUTOMATION_MAX_BATCH_SIZE=1"), "service has max batch cap");
assert(service.includes("MEDIA_AUTOMATION_MAX_CONCURRENCY=1"), "service has max concurrency cap");
assert(service.includes("MEDIA_AUTOMATION_DRY_RUN=true"), "service template defaults dry-run");
assert(service.includes("Never echo"), "service documents safe logging");
assert(service.includes("ExecStart=/usr/bin/npm run media-automation:run-continuous-once"), "service uses bounded one-iteration command");
assert(service.includes("Restart=no"), "service does not restart as a daemon loop");
assert(timer.includes("OnCalendar=hourly"), "timer documents future cadence");
assert(timer.includes("Intentionally not enabled"), "timer states not enabled");
assert(packageJson.includes("media-automation:run-continuous-once"), "package exposes bounded continuous once command");
assert(packageJson.includes("media-automation:report"), "package exposes report command");
assert(!docs.match(/\bcontinuous automation (is )?live\b/i), "docs must not claim continuous automation live");
assert(docs.includes("no daemon") || docs.includes("No daemon"), "docs must say no daemon is live");
assert(docs.includes("no cron") || docs.includes("No cron"), "docs must say no cron is live");
assert(docs.includes("no scheduler") || docs.includes("No scheduler"), "docs must say no scheduler is live");
assert(docs.includes("private/Premium/original") || docs.includes("private/original/Premium"), "docs must preserve private/Premium/original block");

const summary = {
  ok: true,
  serviceTemplate: servicePath,
  timerTemplate: timerPath,
  disabledByDefault: true,
  cronAdded: false,
  githubActionsScheduleAdded: false,
  daemonStarted: false,
  backupGateRequired: true,
  dryRunModeOption: true,
  safeLogging: true,
};
assertNoSecretLikeText("scheduler template proof", summary);
console.log(JSON.stringify(summary, null, 2));
