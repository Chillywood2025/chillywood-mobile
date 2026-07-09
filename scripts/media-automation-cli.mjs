#!/usr/bin/env node

import { spawnSync } from "node:child_process";

const cityLightsSourceId = "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1";
const autoDetectConfirmation = "I_UNDERSTAND_AUTO_DETECT_BATCH";
const legacyBatchConfirmation = "I_UNDERSTAND_BATCH_AUTOMATION";
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

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
const dataSource = String(args.source || process.env.MEDIA_AUTOMATION_DATABASE_SOURCE || "fixture").trim();
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
    || new RegExp(`X-Amz-${"Signature"}=`, "i").test(text)
    || /\bservice[_-]?role\b/i.test(text)
    || /\bBearer\s+[A-Za-z0-9._-]+/i.test(text)
  ) {
    failClosed("secret_like_value_refused");
  }
}

function runJsonCommand(command, commandArgs, failureReason, maxBuffer = 50 * 1024 * 1024) {
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    failClosed(failureReason, { stderrRedacted: true });
  }
  assertNoSecretLikeText(result.stdout);
  assertNoSecretLikeText(result.stderr);
  try {
    return JSON.parse(result.stdout || "{}");
  } catch {
    failClosed(`${failureReason}_json_parse_failed`);
  }
}

function runSupabaseLinkedQuery(sql) {
  const parsed = runJsonCommand(
    npxCommand,
    ["supabase", "db", "query", "--linked", sql],
    "supabase_linked_read_only_query_failed",
  );
  if (!Array.isArray(parsed.rows)) failClosed("supabase_linked_query_missing_rows");
  return parsed.rows;
}

function assertSupportedDataSource() {
  if (!["fixture", "linked"].includes(dataSource)) {
    failClosed("unsupported_data_source", { supportedSources: ["fixture", "linked"] });
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

const classificationKeys = [
  "eligible_needs_transcode",
  "eligible_already_has_audited_hls",
  "excluded_private",
  "excluded_premium",
  "excluded_original_master",
  "excluded_unscanned",
  "excluded_moderation_blocked",
  "excluded_missing_source",
  "excluded_unsupported_format",
  "excluded_already_active_job",
  "excluded_denied_source",
  "excluded_already_processed",
];

const emptyClassificationCounts = () => Object.fromEntries(classificationKeys.map((key) => [key, 0]));

function countClassifications(candidates) {
  const counts = emptyClassificationCounts();
  for (const candidate of candidates) {
    counts[candidate.classification] = (counts[candidate.classification] || 0) + 1;
  }
  return counts;
}

function riskLevelForBatchSize(batchSize) {
  if (batchSize <= 0) return "blocked";
  if (batchSize === 1) return "low";
  if (batchSize <= 5) return "medium";
  return "elevated";
}

const productionDiscoverySql = `
with trusted_hls as (
  select distinct r.source_id
  from public.media_renditions r
  where r.source_type = 'creator_video'
    and r.delivery_format = 'hls'
    and r.delivery_provider = 'cloudflare_r2_custom_domain'
    and r.is_ready = true
    and r.is_public_playback_safe = true
    and r.visibility = 'public'
    and r.is_original = false
    and r.bucket_role = 'public_playback'
    and r.public_playback_path like 'playback/public/%'
    and r.scan_status in ('clean', 'approved')
    and r.moderation_status in ('clean', 'approved', 'allowed')
),
video_catalog as (
  select
    v.id::text as source_id,
    case when coalesce(v.visibility, '') = 'public' then coalesce(nullif(v.title, ''), 'Untitled video') else '[redacted]' end as safe_title,
    coalesce(v.visibility, '') as visibility,
    coalesce(v.scan_status, '') as scan_status,
    coalesce(v.moderation_status, '') as moderation_status,
    coalesce(v.mime_type, '') as mime_type,
    (
      (v.playback_url is not null and v.playback_url <> '')
      or (v.storage_path is not null and v.storage_path <> '')
      or (v.storage_object_key is not null and v.storage_object_key <> '')
    ) as source_present,
    ((coalesce(v.storage_path, '') || '/' || coalesce(v.storage_object_key, '') || '/' || coalesce(v.playback_url, '')) ~* '(^|/)(originals?|masters?)(/|$)') as original_master_like,
    (
      exists (
        select 1
        from public.creator_content_prices p
        where p.content_id = v.id
          and coalesce(p.is_paid, false) = true
          and coalesce(p.status, '') not in ('disabled', 'deleted', 'inactive')
      )
      or exists (
        select 1
        from public.creator_monetization_configs m
        where m.source_id = v.id
          and coalesce(m.status, '') not in ('disabled', 'deleted', 'inactive')
          and (
            coalesce(m.creates_digital_access, false) = true
            or coalesce(m.production_enabled, false) = true
            or coalesce(m.product_type, '') ilike '%paid%'
          )
      )
    ) as premium_locked,
    exists (
      select 1
      from public.media_transcode_jobs j
      where j.source_type = 'creator_video'
        and j.source_id = v.id::text
        and j.status not in ('ready', 'failed', 'canceled')
    ) as active_job,
    exists (
      select 1
      from public.media_transcode_jobs j
      where j.source_type = 'creator_video'
        and j.source_id = v.id::text
        and j.status = 'ready'
    ) as already_processed
  from public.videos v
  where not exists (select 1 from trusted_hls h where h.source_id = v.id::text)
),
classified_videos as (
  select
    source_id,
    safe_title,
    'creator_video'::text as source_type,
    case
      when coalesce(visibility, '') <> 'public' then 'excluded_private'
      when premium_locked then 'excluded_premium'
      when original_master_like then 'excluded_original_master'
      when coalesce(scan_status, '') not in ('clean', 'approved') then 'excluded_unscanned'
      when coalesce(moderation_status, '') not in ('clean', 'approved', 'allowed') then 'excluded_moderation_blocked'
      when not source_present then 'excluded_missing_source'
      when mime_type <> '' and mime_type not ilike 'video/%' then 'excluded_unsupported_format'
      when active_job then 'excluded_already_active_job'
      when already_processed then 'excluded_already_processed'
      else 'eligible_needs_transcode'
    end as classification,
    source_present,
    mime_type
  from video_catalog
),
trusted_hls_rows as (
  select
    h.source_id,
    coalesce((select case when coalesce(v.visibility, '') = 'public' then coalesce(nullif(v.title, ''), 'Untitled video') else '[redacted]' end from public.videos v where v.id::text = h.source_id limit 1), 'Audited HLS source') as safe_title,
    'creator_video'::text as source_type,
    'eligible_already_has_audited_hls'::text as classification,
    true as source_present,
    'application/vnd.apple.mpegurl'::text as mime_type
  from trusted_hls h
),
all_candidates as (
  select * from classified_videos
  union all
  select * from trusted_hls_rows
)
select json_build_object(
  'totalCandidatesScanned', (select count(*)::int from all_candidates),
  'classificationCounts', (
    select coalesce(json_object_agg(classification, count), '{}'::json)
    from (
      select classification, count(*)::int as count
      from all_candidates
      group by classification
    ) counts
  ),
  'eligibleCandidates', (
    select coalesce(json_agg(json_build_object(
      'sourceType', source_type,
      'sourceId', source_id,
      'title', safe_title,
      'classification', classification,
      'currentPlaybackSource', case when source_present then 'source_present_redacted' else 'missing_source' end,
      'mimeType', mime_type,
      'transcodeNeeded', classification = 'eligible_needs_transcode',
      'expectedOutputPrefix', 'playback/public/auto/' || source_type || '/' || source_id || '/auto-detect-production-readonly/',
      'rollbackScope', 'exact_source_and_prefix_only'
    ) order by safe_title, source_id), '[]'::json)
    from all_candidates
    where classification = 'eligible_needs_transcode'
  ),
  'alreadyAuditedHlsSources', (
    select coalesce(json_agg(json_build_object(
      'sourceType', source_type,
      'sourceId', source_id,
      'title', safe_title,
      'classification', classification,
      'transcodeNeeded', false
    ) order by safe_title, source_id), '[]'::json)
    from all_candidates
    where classification = 'eligible_already_has_audited_hls'
  )
) as discovery;
`;

function readProductionDiscovery() {
  const rows = runSupabaseLinkedQuery(productionDiscoverySql);
  const discovery = rows[0]?.discovery;
  if (!discovery || typeof discovery !== "object") failClosed("production_discovery_missing_payload");
  const classificationCounts = {
    ...emptyClassificationCounts(),
    ...(discovery.classificationCounts || {}),
  };
  return {
    totalCandidatesScanned: Number(discovery.totalCandidatesScanned || 0),
    classificationCounts,
    eligibleCandidates: Array.isArray(discovery.eligibleCandidates) ? discovery.eligibleCandidates : [],
    alreadyAuditedHlsSources: Array.isArray(discovery.alreadyAuditedHlsSources) ? discovery.alreadyAuditedHlsSources : [],
  };
}

function readWorkerCountsLinked() {
  const rows = runSupabaseLinkedQuery([
    "select json_build_object(",
    "  'media_transcode_jobs', (select count(*)::int from public.media_transcode_jobs),",
    "  'media_renditions', (select count(*)::int from public.media_renditions),",
    "  'active_unfinished_jobs', (select count(*)::int from public.media_transcode_jobs where status not in ('ready', 'failed', 'canceled')),",
    "  'unsafe_cdn_rows', (select count(*)::int from public.media_renditions where delivery_provider = 'cloudflare_r2_custom_domain' and not (is_ready = true and is_public_playback_safe = true and visibility = 'public' and is_original = false and storage_provider = 'cloudflare_r2' and bucket_role = 'public_playback' and scan_status in ('clean', 'approved') and moderation_status in ('clean', 'approved', 'allowed') and public_playback_path like 'playback/public/%')),",
    "  'other_source_renditions', (select count(*)::int from public.media_renditions where source_id <> 'c28e3838-7d2e-4f48-a8ad-73e3100f8cf1')",
    ") as counts;",
  ].join(" "));
  return rows[0]?.counts || {};
}

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
  if (reasonCodes.length) {
    return {
      batchSize: 0,
      riskLevel: "blocked",
      reasonCodes,
      manualBatchSizeRequired: false,
    };
  }

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
    riskLevel: riskLevelForBatchSize(Math.min(eligibleCount, cap, hardMaxBatchCap, 25)),
    reasonCodes,
    manualBatchSizeRequired: false,
  };
}

function buildAutoPlan() {
  assertSupportedDataSource();
  const productionDiscovery = dataSource === "linked" ? readProductionDiscovery() : null;
  const workerCounts = dataSource === "linked" ? readWorkerCountsLinked() : {
    active_unfinished_jobs: 0,
    unsafe_cdn_rows: 0,
  };
  const eligible = dataSource === "linked"
    ? productionDiscovery.eligibleCandidates.map((candidate) => ({
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      title: candidate.title,
      classification: candidate.classification,
      legacyClassification: "needs_transcode",
      publicSafe: true,
      needsTranscode: true,
      alreadyHasAuditedHls: false,
      currentPlaybackSource: candidate.currentPlaybackSource,
      expectedOutputPrefix: candidate.expectedOutputPrefix,
    }))
    : fixtureCandidates.filter((candidate) => candidate.publicSafe && candidate.needsTranscode);
  const batch = calculateAutoBatchSize({
    eligibleCount: eligible.length,
    latestBackupFresh: true,
    restoreDrillFresh: true,
    previousSuccessStreak: Number(process.env.MEDIA_AUTOMATION_SUCCESS_STREAK || "0"),
    previousFailureCount: Number(process.env.MEDIA_AUTOMATION_FAILURE_COUNT || "0"),
    activeUnfinishedJobs: Number(workerCounts.active_unfinished_jobs || 0),
    unsafeCdnRows: Number(workerCounts.unsafe_cdn_rows || 0),
    hardMaxBatchCap: 25,
  });
  const selected = eligible.slice(0, batch.batchSize);
  const classificationCounts = dataSource === "linked"
    ? productionDiscovery.classificationCounts
    : countClassifications(fixtureCandidates);
  return {
    automationMode: "auto_detect",
    dataSource: dataSource === "linked" ? "linked_supabase_read_only" : "fixture",
    manualSourceIdsRequired: false,
    manualBatchSizeRequired: false,
    backupGateRequired: true,
    backupGateState: "closed_for_latest_manual_backup",
    restoreDrillState: "fresh",
    backupGateFresh: true,
    restoreDrillFresh: true,
    activeUnfinishedJobs: Number(workerCounts.active_unfinished_jobs || 0),
    unsafeCdnRows: Number(workerCounts.unsafe_cdn_rows || 0),
    calculatedBatchSize: batch.batchSize,
    riskLevel: batch.riskLevel || riskLevelForBatchSize(batch.batchSize),
    batchReasonCodes: batch.reasonCodes,
    hardMaxBatchCap: 25,
    selectedCount: selected.length,
    selectedSourceIds: selected.map((candidate) => candidate.sourceId),
    selectedCandidates: selected.map((candidate) => ({
      sourceType: candidate.sourceType,
      sourceId: candidate.sourceId,
      title: candidate.title,
      currentPlaybackSource: candidate.currentPlaybackSource || "source_present_redacted",
      transcodeNeeded: true,
      expectedOutputPrefix: candidate.expectedOutputPrefix || `playback/public/auto/${candidate.sourceType}/${candidate.sourceId}/automation-cli-auto-detect/`,
    })),
    classificationCounts,
    excludedCounts: Object.fromEntries(Object.entries(classificationCounts).filter(([key]) => !key.startsWith("eligible_"))),
    rollbackScopes: selected.map((candidate) => ({
      source_id: candidate.sourceId,
      exact_output_prefix: candidate.expectedOutputPrefix || `playback/public/auto/${candidate.sourceType}/${candidate.sourceId}/automation-cli-auto-detect/`,
      scope: "exact_source_and_prefix_only",
    })),
    mutationAttempted: false,
    workerRun: false,
    backfillRun: false,
  };
}

if (!validModes.has(rawMode)) failClosed("invalid_mode", { validModes: Array.from(validModes) });
assertSupportedDataSource();

if (mode === "status") {
  const linkedWorkerCounts = dataSource === "linked" ? readWorkerCountsLinked() : null;
  safeExit(0, {
    ok: true,
    requestedMode: rawMode,
    mode,
    dataSource: dataSource === "linked" ? "linked_supabase_read_only" : "fixture",
    automationDefaultMode: "off",
    normalOperation: "auto_detect_cli",
    manualSourceIdsRequired: false,
    manualBatchSizeRequired: false,
    rowCounts: linkedWorkerCounts,
    continuousAutomationEnabled: false,
    workerDeployed: false,
    schedulerEnabled: false,
    signedOriginFallbackAvailable: true,
    emergencyStopAvailable: true,
    killSwitchAvailable: true,
  });
}

if (mode === "discover") {
  const productionDiscovery = dataSource === "linked" ? readProductionDiscovery() : null;
  const fixtureClassificationCounts = dataSource === "fixture" ? countClassifications(fixtureCandidates) : null;
  safeExit(0, {
    ok: true,
    requestedMode: rawMode,
    mode,
    dataSource: dataSource === "linked" ? "linked_supabase_read_only" : "fixture",
    readOnly: true,
    manualSourceIdsRequired: false,
    manualBatchSizeRequired: false,
    totalCandidatesScanned: productionDiscovery?.totalCandidatesScanned ?? fixtureCandidates.length,
    classificationCounts: productionDiscovery?.classificationCounts ?? fixtureClassificationCounts,
    candidates: dataSource === "linked"
      ? productionDiscovery.eligibleCandidates.concat(productionDiscovery.alreadyAuditedHlsSources).map((candidate) => ({
        sourceType: candidate.sourceType,
        sourceId: candidate.sourceId,
        title: candidate.title,
        classification: candidate.classification,
        publicSafe: true,
        transcodeNeeded: candidate.transcodeNeeded,
        currentPlaybackSource: candidate.currentPlaybackSource || "audited_hls_ready",
        expectedOutputPrefix: candidate.expectedOutputPrefix,
      }))
      : fixtureCandidates.map(({ sourceType, sourceId, title, classification, legacyClassification, publicSafe }) => ({
        sourceType,
        sourceId,
        title,
        classification,
        legacyClassification,
        publicSafe,
      })),
    excludedCandidateDetailsRedacted: dataSource === "linked",
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
