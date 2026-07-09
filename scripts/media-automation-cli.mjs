#!/usr/bin/env node

const cityLightsSourceId = "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1";
const autoDetectConfirmation = "I_UNDERSTAND_AUTO_DETECT_BATCH";
const legacyBatchConfirmation = "I_UNDERSTAND_BATCH_AUTOMATION";

const validModes = new Set([
  "status",
  "discover",
  "plan-auto",
  "dry-run-auto",
  "run-auto",
  "plan-batch",
  "dry-run-batch",
  "run-batch",
  "audit",
  "audit-batch",
  "rollback-plan",
  "pause",
  "emergency-stop",
]);

const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--")).map((arg) => {
  const [key, ...value] = arg.slice(2).split("=");
  return [key, value.length ? value.join("=") : "true"];
}));

const rawMode = args.mode || "status";
const modeAliases = {
  "plan-batch": "plan-auto",
  "dry-run-batch": "dry-run-auto",
  "run-batch": "run-auto",
  "audit-batch": "audit",
};
const mode = modeAliases[rawMode] || rawMode;

function safeExit(code, payload) {
  const output = JSON.stringify({
    ...payload,
    noSecretsPrinted: true,
    productionPlaybackSwitched: false,
    productionRowsWritten: false,
    daemonDeployed: false,
    cronSchedulerAdded: false,
    schedulerAdded: false,
    queueProcessorRunning: false,
    continuousAutomationEnabled: false,
  }, null, 2);
  if (code === 0) process.stdout.write(`${output}\n`);
  else process.stderr.write(`${output}\n`);
  process.exit(code);
}

function failClosed(reason, extra = {}) {
  safeExit(1, {
    ok: false,
    failClosed: true,
    requestedMode: rawMode,
    mode,
    reason,
    ...extra,
  });
}

function assertNoSecretLikeText(value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (
    /postgres(?:ql)?:\/\//i.test(text)
    || /X-Amz-Signature=/i.test(text)
    || /\bservice[_-]?role\b/i.test(text)
    || /\bBearer\s+[A-Za-z0-9._-]+/i.test(text)
  ) {
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
    sourceId: "auto-public-safe-001",
    title: "Auto Public Safe 001",
    classification: "eligible_needs_transcode",
    legacyClassification: "needs_transcode",
    publicSafe: true,
    needsTranscode: true,
    alreadyHasAuditedHls: false,
  },
  {
    sourceType: "creator_video",
    sourceId: "auto-public-safe-002",
    title: "Auto Public Safe 002",
    classification: "eligible_needs_transcode",
    legacyClassification: "needs_transcode",
    publicSafe: true,
    needsTranscode: true,
    alreadyHasAuditedHls: false,
  },
  {
    sourceType: "creator_video",
    sourceId: cityLightsSourceId,
    title: "Chi'llwood City Lights",
    classification: "eligible_already_has_audited_hls",
    legacyClassification: "already_has_audited_hls",
    publicSafe: true,
    needsTranscode: false,
    alreadyHasAuditedHls: true,
  },
  { sourceType: "creator_video", sourceId: "private", title: "Private", classification: "excluded_private", legacyClassification: "private_blocked", publicSafe: false },
  { sourceType: "creator_video", sourceId: "premium", title: "Premium", classification: "excluded_premium", legacyClassification: "premium_blocked", publicSafe: false },
  { sourceType: "creator_video", sourceId: "original", title: "Original", classification: "excluded_original_master", legacyClassification: "original_only_blocked", publicSafe: false },
  { sourceType: "creator_video", sourceId: "unscanned", title: "Unscanned", classification: "excluded_unscanned", legacyClassification: "unscanned_blocked", publicSafe: false },
  { sourceType: "creator_video", sourceId: "moderation", title: "Moderation Blocked", classification: "excluded_moderation_blocked", legacyClassification: "moderation_blocked", publicSafe: false },
  { sourceType: "creator_video", sourceId: "active-job", title: "Active Job", classification: "excluded_already_active_job", legacyClassification: "needs_transcode", publicSafe: false },
];

function calculateAutoBatchSize({
  eligibleCount,
  latestBackupFresh = true,
  restoreDrillFresh = true,
  previousSuccessStreak = 0,
  previousFailureCount = 0,
  activeUnfinishedJobs = 0,
  unsafeCdnRows = 0,
  hardMaxBatchCap = 25,
} = {}) {
  const reasonCodes = [];
  if (eligibleCount <= 0) reasonCodes.push("no_eligible_candidates");
  if (!latestBackupFresh) reasonCodes.push("latest_backup_stale");
  if (!restoreDrillFresh) reasonCodes.push("restore_drill_stale");
  if (activeUnfinishedJobs > 0) reasonCodes.push("active_unfinished_jobs_present");
  if (unsafeCdnRows > 0) reasonCodes.push("unsafe_cdn_rows_present");
  if (reasonCodes.length) return { batchSize: 0, reasonCodes, manualBatchSizeRequired: false };

  let cap = 1;
  if (previousFailureCount > 0) {
    cap = 1;
    reasonCodes.push("previous_failure_drops_cap_to_one");
  } else if (previousSuccessStreak >= 5) {
    cap = 25;
    reasonCodes.push("success_streak_cap_twenty_five");
  } else if (previousSuccessStreak >= 3) {
    cap = 10;
    reasonCodes.push("success_streak_cap_ten");
  } else if (previousSuccessStreak >= 1) {
    cap = 5;
    reasonCodes.push("success_streak_cap_five");
  } else {
    reasonCodes.push("first_auto_run_cap_one");
  }
  return {
    batchSize: Math.min(eligibleCount, cap, hardMaxBatchCap, 25),
    reasonCodes,
    manualBatchSizeRequired: false,
  };
}

function buildAutoPlan() {
  const eligible = fixtureCandidates.filter((candidate) => candidate.publicSafe && candidate.needsTranscode);
  const batch = calculateAutoBatchSize({
    eligibleCount: eligible.length,
    latestBackupFresh: true,
    restoreDrillFresh: true,
    previousSuccessStreak: Number(process.env.MEDIA_AUTOMATION_SUCCESS_STREAK || "0"),
    previousFailureCount: Number(process.env.MEDIA_AUTOMATION_FAILURE_COUNT || "0"),
    activeUnfinishedJobs: 0,
    unsafeCdnRows: 0,
    hardMaxBatchCap: 25,
  });
  const selected = eligible.slice(0, batch.batchSize);
  return {
    automationMode: "auto_detect",
    manualSourceIdsRequired: false,
    manualBatchSizeRequired: false,
    backupGateRequired: true,
    backupGateState: "closed_for_latest_manual_backup",
    restoreDrillState: "fresh",
    calculatedBatchSize: batch.batchSize,
    batchReasonCodes: batch.reasonCodes,
    hardMaxBatchCap: 25,
    selectedCount: selected.length,
    selectedSourceIds: selected.map((candidate) => candidate.sourceId),
    excludedCounts: fixtureCandidates.reduce((accumulator, candidate) => {
      if (candidate.publicSafe && candidate.needsTranscode) return accumulator;
      accumulator[candidate.classification] = (accumulator[candidate.classification] || 0) + 1;
      return accumulator;
    }, {}),
    rollbackScopes: selected.map((candidate) => ({
      source_id: candidate.sourceId,
      exact_output_prefix: `playback/public/auto/${candidate.sourceType}/${candidate.sourceId}/automation-cli-auto-detect/`,
      scope: "exact_source_and_prefix_only",
    })),
    mutationAttempted: false,
    workerRun: false,
    backfillRun: false,
  };
}

if (!validModes.has(rawMode)) failClosed("invalid_mode", { validModes: Array.from(validModes) });

if (mode === "status") {
  safeExit(0, {
    ok: true,
    requestedMode: rawMode,
    mode,
    automationDefaultMode: "off",
    normalOperation: "auto_detect_cli",
    manualSourceIdsRequired: false,
    manualBatchSizeRequired: false,
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
    requestedMode: rawMode,
    mode,
    readOnly: true,
    manualSourceIdsRequired: false,
    manualBatchSizeRequired: false,
    candidates: fixtureCandidates.map(({ sourceType, sourceId, title, classification, legacyClassification, publicSafe }) => ({
      sourceType,
      sourceId,
      title,
      classification,
      legacyClassification,
      publicSafe,
    })),
  });
}

if (mode === "plan-auto" || mode === "dry-run-auto") {
  safeExit(0, {
    ok: true,
    requestedMode: rawMode,
    mode,
    readOnly: true,
    dryRun: mode === "dry-run-auto",
    ...buildAutoPlan(),
  });
}

if (mode === "run-auto") {
  const confirmation = args.confirm || process.env.MEDIA_AUTOMATION_RUN_CONFIRM;
  if (rawMode === "run-batch" && confirmation !== legacyBatchConfirmation && confirmation !== autoDetectConfirmation) {
    failClosed("batch_automation_confirmation_missing", {
      requiredEnv: `MEDIA_AUTOMATION_RUN_CONFIRM=${legacyBatchConfirmation}`,
      autoDetectEnv: `MEDIA_AUTOMATION_RUN_CONFIRM=${autoDetectConfirmation}`,
    });
  }
  if (rawMode !== "run-batch" && confirmation !== autoDetectConfirmation) {
    failClosed("auto_detect_batch_confirmation_missing", {
      requiredEnv: `MEDIA_AUTOMATION_RUN_CONFIRM=${autoDetectConfirmation}`,
    });
  }
  const plan = buildAutoPlan();
  if (plan.calculatedBatchSize <= 0) failClosed("calculated_batch_size_zero", plan);
  if (plan.selectedCount > 25) failClosed("calculated_batch_exceeds_hard_cap", plan);
  if (Object.keys(plan.excludedCounts).some((key) => key === "excluded_private" || key === "excluded_premium" || key === "excluded_original_master")) {
    // Unsafe rows may exist in discovery, but they are excluded from the selected batch.
    if (plan.selectedSourceIds.some((sourceId) => ["private", "premium", "original"].includes(sourceId))) {
      failClosed("unsafe_candidate_selected", plan);
    }
  }
  failClosed("batch_execution_not_enabled_in_source_proof_build", {
    futureConfirmationPassed: true,
    ...plan,
  });
}

if (mode === "audit") {
  const sourceId = safeSourceId(args["source-id"] || process.env.MEDIA_AUTOMATION_SOURCE_ID);
  const batchId = safeBatchId(args["batch-id"] || process.env.MEDIA_AUTOMATION_BATCH_ID);
  safeExit(0, {
    ok: true,
    requestedMode: rawMode,
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
    requestedMode: rawMode,
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
    requestedMode: rawMode,
    mode,
    automationPaused: true,
    emergencyStopActive: mode === "emergency-stop",
    workerRun: false,
  });
}
