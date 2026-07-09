#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const checklistPath = "docs/MEDIA_WORKER_CLI_OPERATING_CHECKLIST.md";

const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

const assertIncludes = (content, needle, label) => {
  if (!content.includes(needle)) {
    throw new Error(`${label}: missing ${needle}`);
  }
};

const assertNotMatches = (content, pattern, label) => {
  const match = content.match(pattern);
  if (match) {
    throw new Error(`${label}: unexpected ${match[0]}`);
  }
};

if (!fs.existsSync(path.join(repoRoot, checklistPath))) {
  throw new Error(`${checklistPath} is missing`);
}

const checklist = read(checklistPath);
const packageJson = read("package.json");
const currentState = read("CURRENT_STATE.md");
const nextTask = read("NEXT_TASK.md");
const secretLikePattern = new RegExp([
  String.raw`postgres(?:ql)?://`,
  String.raw`service[_-]?role`,
  String.raw`eyJ[A-Za-z0-9_-]{20,}\.`,
  String.raw`AKIA[0-9A-Z]{16}`,
  String.raw`ASIA[0-9A-Z]{16}`,
  String.raw`BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY`,
  String.raw`x-amz-` + String.raw`signature=`,
  String.raw`X-Amz-` + String.raw`Signature=`,
].join("|"), "i");

const requiredBackupCommands = [
  "npm run backup:media-worker:preflight",
  "npm run backup:media-worker:status",
  "npm run backup:media-worker:verify-latest",
  "npm run backup:media-worker:restore-drill",
];

const requiredWorkerCommands = [
  "npm run media-worker:preflight",
  "npm run media-worker:status",
  "npm run media-worker:dry-run -- --source-id <id>",
  "npm run media-worker:run-one -- --source-id <id>",
  "npm run media-worker:audit -- --batch-id <batch> --source-id <id>",
  "npm run media-worker:verify-output -- --batch-id <batch> --source-id <id> --output-prefix <exact-playback-public-worker-proof-prefix>",
  "npm run media-worker:rollback-plan -- --batch-id <batch> --source-id <id> --output-prefix <exact-playback-public-worker-proof-prefix>",
];

for (const command of requiredBackupCommands) {
  assertIncludes(checklist, command, "checklist backup command");
}

for (const command of requiredWorkerCommands) {
  assertIncludes(checklist, command, "checklist worker command");
}

assertIncludes(checklist, "MEDIA_WORKER_RUN_ONE_CONFIRM=I_UNDERSTAND_ONE_JOB", "checklist owner confirmation");
assertIncludes(checklist, "Continuous automation remains blocked", "checklist continuous automation boundary");
assertIncludes(checklist, "production creator-video playback remains signed-origin fallback by default", "checklist production playback fallback");
assertIncludes(checklist, "The production worker is not deployed", "checklist production worker status");
assertIncludes(checklist, "no cron or scheduler is configured", "checklist scheduler status");
assertIncludes(checklist, "It is not PITR and does not replace PITR for continuous production.", "checklist PITR boundary");
assertIncludes(checklist, "Do not run broad backfill.", "checklist broad backfill denial");
assertIncludes(checklist, "Audit pass is required before resolver trust.", "checklist audit before resolver trust");
assertIncludes(checklist, "Quarantine the batch.", "checklist quarantine emergency step");
assertIncludes(checklist, "Storing backups in the public playback bucket.", "checklist public bucket prohibition");
assertIncludes(checklist, "Serving backups through `media.chillywoodstream.com`.", "checklist public media domain prohibition");

assertIncludes(packageJson, "\"proof:media-worker-cli-operating-checklist\"", "package checklist proof script");
assertIncludes(currentState, "Final CLI media-worker operating checklist", "current state checklist reference");
assertIncludes(nextTask, "Use CLI checklist for any future allowlisted one-job media worker run.", "next task checklist instruction");

assertNotMatches(checklist, /\b(?:worker is deployed|continuous automation is closed|production playback uses CDN|production playback uses HLS|R2 logical backup is true PITR|R2 logical backups are true PITR|PITR is unnecessary)\b/i, "checklist overclaim");
assertNotMatches(checklist, /\b(?:schedule:\s*\[|workflow_dispatch|cron\s*:\s*|on:\s*push)\b/i, "checklist workflow or cron instructions");
assertNotMatches(checklist, secretLikePattern, "checklist secret-like value");

console.log(JSON.stringify({
  proof: "media-worker-cli-operating-checklist",
  checklistExists: true,
  backupCommandsCovered: requiredBackupCommands.length,
  workerCommandsCovered: requiredWorkerCommands.length,
  ownerConfirmationRequired: true,
  continuousAutomationBlocked: true,
  productionPlaybackUnchanged: true,
  cronSchedulerInstructionsAbsent: true,
  pitrReplacementClaimAbsent: true,
  secretsAbsent: true,
}, null, 2));
