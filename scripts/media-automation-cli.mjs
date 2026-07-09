#!/usr/bin/env node

const cityLightsSourceId = "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1";
const ownerConfirmation = "I_UNDERSTAND_BATCH_AUTOMATION";
const validModes = new Set([
  "status",
  "discover",
  "plan-batch",
  "dry-run-batch",
  "run-batch",
  "audit-batch",
  "rollback-plan",
  "pause",
  "emergency-stop",
]);

const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--")).map((arg) => {
  const [key, ...value] = arg.slice(2).split("=");
  return [key, value.length ? value.join("=") : "true"];
}));

const mode = args.mode || "status";
const maxBatchSize = Math.max(0, Math.floor(Number(args["max-batch-size"] || process.env.MEDIA_AUTOMATION_MAX_BATCH_SIZE || "5")));

function safeExit(code, payload) {
  const output = JSON.stringify({
    ...payload,
    noSecretsPrinted: true,
    productionPlaybackSwitched: false,
    productionRowsWritten: false,
    daemonDeployed: false,
    cronSchedulerAdded: false,
  }, null, 2);
  if (code === 0) process.stdout.write(`${output}\n`);
  else process.stderr.write(`${output}\n`);
  process.exit(code);
}

function failClosed(reason, extra = {}) {
  safeExit(1, {
    ok: false,
    failClosed: true,
    mode,
    reason,
    ...extra,
  });
}

function assertNoSecretLikeText(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (/postgres(?:ql)?:\/\//i.test(text) || /X-Amz-Signature=/i.test(text) || /\bservice[_-]?role\b/i.test(text)) {
    failClosed("secret_like_value_refused");
  }
}

function safeSourceId(value) {
  const text = String(value || "").trim();
  if (!text) failClosed("source_id_required");
  if (!/^[A-Za-z0-9._:-]+$/.test(text)) failClosed("source_id_unsafe");
  assertNoSecretLikeText(text);
  return text;
}

function safeBatchId(value) {
  const text = String(value || "").trim();
  if (!text) failClosed("batch_id_required");
  if (!/^[A-Za-z0-9._:-]+$/.test(text)) failClosed("batch_id_unsafe");
  assertNoSecretLikeText(text);
  return text;
}

function normalizePrefix(value) {
  const text = String(value || "").trim().replace(/^\/+/, "");
  return text.endsWith("/") ? text : `${text}/`;
}

function safeOutputPrefix(value) {
  const prefix = normalizePrefix(value);
  const failures = [];
  if (!prefix.startsWith("playback/public/auto/")) failures.push("must_start_playback_public_auto");
  if (prefix === "playback/public/" || prefix === "playback/public/auto/") failures.push("prefix_too_broad");
  if (prefix.includes("..") || /^https?:\/\//i.test(prefix)) failures.push("prefix_must_be_relative");
  if (/(^|\/)(originals?|masters?|sources?|uploads|private|premium|processing|moderation[-_]blocked|unscanned)(\/|$)/i.test(prefix)) {
    failures.push("forbidden_private_segment");
  }
  if (failures.length) failClosed("unsafe_output_prefix_refused", { outputPrefix: prefix, failures });
  return prefix;
}

const fixtureCandidates = [
  {
    sourceType: "creator_video",
    sourceId: "public-safe-needs-transcode",
    title: "Public Safe Needs Transcode",
    classification: "needs_transcode",
    publicSafe: true,
    needsTranscode: true,
    alreadyHasAuditedHls: false,
  },
  {
    sourceType: "creator_video",
    sourceId: cityLightsSourceId,
    title: "Chi'llwood City Lights",
    classification: "already_has_audited_hls",
    publicSafe: true,
    needsTranscode: false,
    alreadyHasAuditedHls: true,
  },
  { sourceType: "creator_video", sourceId: "private", title: "Private", classification: "private_blocked", publicSafe: false },
  { sourceType: "creator_video", sourceId: "premium", title: "Premium", classification: "premium_blocked", publicSafe: false },
  { sourceType: "creator_video", sourceId: "original", title: "Original", classification: "original_only_blocked", publicSafe: false },
  { sourceType: "creator_video", sourceId: "unscanned", title: "Unscanned", classification: "unscanned_blocked", publicSafe: false },
  { sourceType: "creator_video", sourceId: "moderation", title: "Moderation Blocked", classification: "moderation_blocked", publicSafe: false },
];

function buildPlan() {
  const eligible = fixtureCandidates.filter((candidate) => candidate.publicSafe && candidate.needsTranscode);
  const selected = eligible.slice(0, maxBatchSize);
  return {
    mode,
    automationMode: "dry_run",
    backupGateRequired: true,
    backupGateState: "closed_for_latest_manual_backup",
    batchCap: maxBatchSize,
    selectedCount: selected.length,
    selectedSourceIds: selected.map((candidate) => candidate.sourceId),
    excludedCounts: fixtureCandidates.reduce((accumulator, candidate) => {
      if (candidate.publicSafe && candidate.needsTranscode) return accumulator;
      accumulator[candidate.classification] = (accumulator[candidate.classification] || 0) + 1;
      return accumulator;
    }, {}),
    rollbackScopes: selected.map((candidate) => ({
      source_id: candidate.sourceId,
      exact_output_prefix: `playback/public/auto/${candidate.sourceType}/${candidate.sourceId}/automation-cli-dry-run/`,
      scope: "exact_source_and_prefix_only",
    })),
    mutationAttempted: false,
    workerRun: false,
    queueProcessorRunning: false,
  };
}

if (!validModes.has(mode)) failClosed("invalid_mode", { validModes: Array.from(validModes) });

if (mode === "status") {
  safeExit(0, {
    ok: true,
    mode,
    automationDefaultMode: "off",
    continuousAutomationEnabled: false,
    workerDeployed: false,
    schedulerEnabled: false,
    signedOriginFallbackAvailable: true,
    emergencyStopAvailable: true,
    killSwitchAvailable: true,
  });
}

if (mode === "discover") {
  safeExit(0, {
    ok: true,
    mode,
    readOnly: true,
    candidates: fixtureCandidates.map(({ sourceType, sourceId, title, classification, publicSafe }) => ({
      sourceType,
      sourceId,
      title,
      classification,
      publicSafe,
    })),
  });
}

if (mode === "plan-batch" || mode === "dry-run-batch") {
  safeExit(0, {
    ok: true,
    readOnly: true,
    dryRun: mode === "dry-run-batch",
    ...buildPlan(),
  });
}

if (mode === "run-batch") {
  if ((args.confirm || process.env.MEDIA_AUTOMATION_RUN_CONFIRM) !== ownerConfirmation) {
    failClosed("batch_automation_confirmation_missing", {
      requiredEnv: `MEDIA_AUTOMATION_RUN_CONFIRM=${ownerConfirmation}`,
    });
  }
  if (maxBatchSize < 1) failClosed("max_batch_size_required");
  failClosed("batch_execution_not_enabled_in_source_proof_build", {
    futureOwnerApprovalRequired: true,
    ...buildPlan(),
  });
}

if (mode === "audit-batch") {
  const sourceId = safeSourceId(args["source-id"] || process.env.MEDIA_AUTOMATION_SOURCE_ID);
  const batchId = safeBatchId(args["batch-id"] || process.env.MEDIA_AUTOMATION_BATCH_ID);
  safeExit(0, {
    ok: true,
    mode,
    batchId,
    sourceId,
    auditPlanOnly: true,
    auditRequiresExactSource: true,
    auditRequiresPendingRows: true,
    resolverTrustChanged: false,
  });
}

if (mode === "rollback-plan") {
  const sourceId = safeSourceId(args["source-id"] || process.env.MEDIA_AUTOMATION_SOURCE_ID);
  const batchId = safeBatchId(args["batch-id"] || process.env.MEDIA_AUTOMATION_BATCH_ID);
  const outputPrefix = safeOutputPrefix(args["output-prefix"] || process.env.MEDIA_AUTOMATION_OUTPUT_PREFIX);
  safeExit(0, {
    ok: true,
    mode,
    rollbackPlanOnly: true,
    batchId,
    sourceId,
    exactOutputPrefix: outputPrefix,
    broadDeleteAllowed: false,
    privatePremiumOriginalDeleteAllowed: false,
  });
}

if (mode === "pause" || mode === "emergency-stop") {
  safeExit(0, {
    ok: true,
    mode,
    automationPaused: true,
    emergencyStopActive: mode === "emergency-stop",
    workerRun: false,
  });
}
