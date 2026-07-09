#!/usr/bin/env node

import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const failures = [];
const fail = (message) => failures.push(message);

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} missing ${needle}`);
};

const assertNotMatches = (source, pattern, label) => {
  const match = source.match(pattern);
  if (match) fail(`${label} must not match ${pattern}: ${match[0]}`);
};

const beforeHeading = (source, heading) => {
  const index = source.indexOf(heading);
  return index === -1 ? source : source.slice(0, index);
};

const runbook = read("docs/MEDIA_TRANSCODE_WORKER_RUNBOOK.md");
const migrationPlan = read("docs/MEDIA_TRANSCODE_RENDITION_MIGRATION_PLAN.md");
const architecture = read("docs/MEDIA_DELIVERY_SCALE_ARCHITECTURE.md");
const vodDoc = read("docs/VOD_QUALITY_LADDER_AND_PLAYBACK_RESOLVER.md");
const currentState = read("CURRENT_STATE.md");
const nextTaskMediaSection = beforeHeading(read("NEXT_TASK.md"), "# Watch-Party");

const requiredReadbackStrings = [
  "`bmkkhihfbmsnnmcqkoly`",
  "`Chillywood2025's Project`",
  "`us-west-2`",
  "`ACTIVE_HEALTHY`",
  "`pitr_enabled=false`",
  "`walg_enabled=true`",
  "`backups=[]`",
  "`physical_backup_data={}`",
  "`pitr_7`",
  "`$100/month`",
  "`pitr_14`",
  "`$200/month`",
  "`pitr_28`",
  "`$400/month`",
];

for (const needle of requiredReadbackStrings) {
  assertIncludes(runbook, needle, "worker runbook backup/PITR readback");
}

assertIncludes(
  runbook,
  "Backup/PITR gate status: Blocked for production worker writes/backfill/activation.",
  "worker runbook backup gate classification",
);
assertIncludes(
  runbook,
  "Enabling PITR is a provider billing/add-on mutation and requires explicit owner approval before any change.",
  "worker runbook PITR billing approval",
);
assertIncludes(
  runbook,
  "No production worker writes or backfill while the backup/PITR gate is Blocked or Partial.",
  "worker runbook blocked/partial no-write rule",
);
assertIncludes(
  runbook,
  "Before worker activation, run a restore readiness drill or document an owner-approved restore method with the restore window",
  "worker runbook restore drill requirement",
);

assertIncludes(
  migrationPlan,
  "Backup/PITR gate: Blocked for production worker writes/backfill/activation.",
  "migration plan backup gate classification",
);
assertIncludes(
  architecture,
  "Backup/PITR activation gate: Blocked for production worker writes/backfill/activation.",
  "architecture backup gate classification",
);
assertIncludes(
  vodDoc,
  "Backup/PITR gate status is Blocked",
  "VOD doc backup gate classification",
);
assertIncludes(
  currentState,
  "Backup/PITR gate status is Blocked for production worker writes/backfill/activation",
  "current state backup gate classification",
);
assertIncludes(
  nextTaskMediaSection,
  "Backup/PITR gate is Blocked for production worker activation",
  "next task backup gate classification",
);

const mediaBackupGateCorpus = [
  runbook,
  migrationPlan,
  architecture,
  vodDoc,
  currentState,
  nextTaskMediaSection,
].join("\n\n");

assertIncludes(
  mediaBackupGateCorpus,
  "No production worker writes or backfill while the gate is Blocked or Partial.",
  "backup gate no-write rule",
);
assertIncludes(
  mediaBackupGateCorpus,
  "WAL-G alone is not",
  "backup gate WAL-G limitation",
);

assertNotMatches(
  mediaBackupGateCorpus,
  /\bBackup\/PITR gate status:\s*(?:Closed|Complete|Ready)\b/,
  "media backup gate docs",
);
assertNotMatches(
  mediaBackupGateCorpus,
  /\bPITR (?:is )?enabled\b/i,
  "media backup gate docs",
);
assertNotMatches(
  mediaBackupGateCorpus,
  /(?<!no )\bproduction transcode worker is (?:live|deployed|running|ready)\b/i,
  "media backup gate docs",
);
assertNotMatches(
  mediaBackupGateCorpus,
  /\bproduction worker activation (?:is )?(?:approved|ready|unblocked)\b/i,
  "media backup gate docs",
);

const summary = {
  proof: "media-transcode-backup-gate",
  staticDocValidationPassed: failures.length === 0,
  projectRef: "bmkkhihfbmsnnmcqkoly",
  projectName: "Chillywood2025's Project",
  projectRegion: "us-west-2",
  projectStatus: "ACTIVE_HEALTHY",
  pitrEnabled: false,
  walgEnabled: true,
  backupsListed: 0,
  physicalBackupDataListed: false,
  pitrPaidAddonsAvailable: ["pitr_7", "pitr_14", "pitr_28"],
  enablingPitrRequiresBillingApproval: true,
  backupGateClassification: "blocked",
  productionWorkerDeployed: false,
  productionQueueProcessorRun: false,
  productionDbWritesEnabled: false,
  productionPlaybackSwitched: false,
  providerMutationPerformed: false,
  noSecretsPrinted: true,
};

if (failures.length > 0) {
  console.error(JSON.stringify({ ...summary, failures }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(summary, null, 2));
