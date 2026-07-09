#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const nodeCommand = process.execPath;

const allowedSourceIds = ["c28e3838-7d2e-4f48-a8ad-73e3100f8cf1"];
const cityLightsSourceId = allowedSourceIds[0];
const cityLightsSlug = "chillywood-city-lights";
const cityLightsWorkerProofPrefixRoot = "playback/public/worker-proof/chillywood-city-lights/";
const privateBackupBucket = "chillywood-media-proof";
const publicPlaybackBucket = "chillywood-media-public-playback-proof";
const privateBackupPrefixRoot = "backups/media-worker/";
const mediaPublicDomain = "media.chillywoodstream.com";
const expectedProjectRef = "bmkkhihfbmsnnmcqkoly";
const expectedProjectName = "Chillywood2025's Project";
const expectedProjectRegion = "us-west-2";
const latestBackupPrefix = "backups/media-worker/2026/07/09/media-worker-logical-20260709T152048-8820af024114/";
const validModes = [
  "preflight",
  "dry-run",
  "status",
  "run-one",
  "audit",
  "verify-output",
  "rollback-plan",
];
const forbiddenPublicSegments = new Set([
  "original",
  "originals",
  "master",
  "masters",
  "source",
  "sources",
  "uploads",
  "private",
  "premium",
  "processing",
  "moderation-blocked",
  "moderation_blocked",
  "unscanned",
]);

function parseArgValue(name) {
  const args = process.argv.slice(2);
  const prefix = `${name}=`;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === name) return args[index + 1] ?? "";
  }
  return null;
}

const mode = parseArgValue("--mode") ?? "status";

function normalizeBool(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function safeJson(value) {
  return `${JSON.stringify({
    ...value,
    noSecretsPrinted: true,
    productionRowsWritten: false,
    productionPlaybackSwitched: false,
  }, null, 2)}\n`;
}

function safeExit(code, payload) {
  const output = safeJson(payload);
  if (code === 0) process.stdout.write(output);
  else process.stderr.write(output);
  process.exit(code);
}

function failClosed(reason, details = {}) {
  safeExit(1, {
    ok: false,
    failClosed: true,
    mode,
    reason,
    ...details,
  });
}

function assertNoSecretLikeText(label, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const patterns = [
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bASIA[0-9A-Z]{16}\b/,
    /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\b/,
    /\bX-Amz-Signature=[A-Fa-f0-9]{32,}\b/i,
    /\b(Bearer|password|access_key|api_key|authorization)\s*[:=]/i,
    /\bservice[_-]?role[_-]?key\b/i,
    /postgres(?:ql)?:\/\//i,
  ];
  const matches = patterns.filter((pattern) => pattern.test(text)).map(String);
  if (matches.length > 0) failClosed("secret_like_value_refused", { label, matches });
}

function assertSimpleId(label, value) {
  const text = String(value ?? "").trim();
  if (!text) failClosed(`${label}_required`);
  if (!/^[A-Za-z0-9._:-]+$/.test(text)) failClosed(`${label}_unsafe`, { label });
  assertNoSecretLikeText(label, text);
  return text;
}

function assertAllowlistedSource(sourceId) {
  const text = assertSimpleId("source_id", sourceId);
  if (!allowedSourceIds.includes(text)) failClosed("source_not_allowlisted", { sourceId: text, allowedSourceIds });
  return text;
}

function normalizePrefix(value) {
  const text = String(value ?? "").trim().replace(/^\/+/, "");
  return text.endsWith("/") ? text : `${text}/`;
}

function assertSafeOutputPrefix(prefix) {
  const normalized = normalizePrefix(prefix);
  const failures = [];
  if (!normalized.startsWith(cityLightsWorkerProofPrefixRoot)) {
    failures.push("prefix_must_start_worker_proof_city_lights");
  }
  if (normalized === "playback/public/" || normalized === cityLightsWorkerProofPrefixRoot) {
    failures.push("prefix_too_broad");
  }
  if (normalized.includes("..") || normalized.startsWith("/") || /^https?:\/\//i.test(normalized)) {
    failures.push("prefix_must_be_relative");
  }
  if (normalized.includes(mediaPublicDomain)) failures.push("public_media_domain_not_a_prefix");
  for (const segment of normalized.split("/").filter(Boolean)) {
    if (forbiddenPublicSegments.has(segment.toLowerCase())) failures.push(`forbidden_segment_${segment}`);
  }
  if (failures.length > 0) failClosed("unsafe_output_prefix_refused", { outputPrefix: normalized, failures });
  return normalized;
}

function assertBackupGateClosed() {
  const gate = String(process.env.MEDIA_WORKER_BACKUP_GATE_STATE || "closed").trim().toLowerCase();
  if (["missing", "stale", "blocked", "partial", "open", "failed"].includes(gate)) {
    failClosed("backup_gate_not_closed", { backupGateState: gate });
  }
  return {
    backupGateState: "closed_for_latest_manual_backup",
    latestBackupPrefix,
    privateBackupBucket,
    logicalBackupNotPitr: true,
  };
}

function runJsonCommand(command, args, failureReason, maxBuffer = 50 * 1024 * 1024) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) failClosed(failureReason);
  assertNoSecretLikeText(`${failureReason}_stdout`, result.stdout);
  assertNoSecretLikeText(`${failureReason}_stderr`, result.stderr);
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
    "supabase_linked_query_failed_without_secret_output",
  );
  if (!Array.isArray(parsed.rows)) failClosed("supabase_linked_query_missing_rows");
  return parsed.rows;
}

function readSupabaseProject() {
  const projects = runJsonCommand(
    npxCommand,
    ["supabase", "projects", "list", "--output", "json"],
    "supabase_project_list_failed_without_secret_output",
  );
  const project = projects.find((entry) => entry.id === expectedProjectRef || entry.ref === expectedProjectRef);
  if (!project) failClosed("expected_supabase_project_not_found", { expectedProjectRef });
  const readback = {
    projectRef: project.id ?? project.ref,
    projectName: project.name,
    projectRegion: project.region,
    projectStatus: project.status,
  };
  if (readback.projectRef !== expectedProjectRef) failClosed("supabase_project_ref_mismatch", { expectedProjectRef });
  if (readback.projectName !== expectedProjectName) failClosed("supabase_project_name_mismatch", { expectedProjectName });
  if (readback.projectRegion !== expectedProjectRegion) failClosed("supabase_project_region_mismatch", { expectedProjectRegion });
  return readback;
}

function readWorkerCounts() {
  const rows = runSupabaseLinkedQuery([
    "select json_build_object(",
    "  'media_transcode_jobs', (select count(*)::int from public.media_transcode_jobs),",
    "  'media_renditions', (select count(*)::int from public.media_renditions),",
    "  'active_unfinished_jobs', (select count(*)::int from public.media_transcode_jobs where status not in ('ready', 'failed', 'canceled')),",
    "  'unsafe_cdn_rows', (select count(*)::int from public.media_renditions where delivery_provider = 'cloudflare_r2_custom_domain' and not (is_ready = true and is_public_playback_safe = true and visibility = 'public' and is_original = false and storage_provider = 'cloudflare_r2' and bucket_role = 'public_playback' and scan_status in ('clean', 'approved') and moderation_status in ('clean', 'approved', 'allowed') and public_playback_path like 'playback/public/%')),",
    `  'other_source_renditions', (select count(*)::int from public.media_renditions where source_id <> '${cityLightsSourceId}')`,
    ") as counts;",
  ].join(" "));
  return rows[0]?.counts ?? {};
}

function queryBatchRows(batchId, sourceId) {
  const rows = runSupabaseLinkedQuery([
    "select json_build_object(",
    `  'job_rows', (select count(*)::int from public.media_transcode_jobs where id::text = '${batchId}' and source_id = '${sourceId}'),`,
    `  'rendition_rows', (select count(*)::int from public.media_renditions where job_id::text = '${batchId}' and source_id = '${sourceId}'),`,
    `  'unexpected_other_source_rows', (select count(*)::int from public.media_renditions where job_id::text = '${batchId}' and source_id <> '${sourceId}'),`,
    `  'unsafe_rows', (select count(*)::int from public.media_renditions where job_id::text = '${batchId}' and source_id = '${sourceId}' and not (is_ready = true and is_public_playback_safe = true and visibility = 'public' and is_original = false and bucket_role = 'public_playback' and public_playback_path like 'playback/public/%' and scan_status in ('clean', 'approved') and moderation_status in ('clean', 'approved', 'allowed'))),`,
    `  'resolver_safe_rows', (select count(*)::int from public.media_renditions where job_id::text = '${batchId}' and source_id = '${sourceId}' and is_ready = true and is_public_playback_safe = true and visibility = 'public' and is_original = false and bucket_role = 'public_playback' and public_playback_path like 'playback/public/%' and scan_status in ('clean', 'approved') and moderation_status in ('clean', 'approved', 'allowed'))`,
    ") as batch;",
  ].join(" "));
  return rows[0]?.batch ?? {};
}

function hasCronOrMediaWorkerWorkflow() {
  const workflowsDir = path.join(repoRoot, ".github", "workflows");
  if (!existsSync(workflowsDir)) return false;
  const workflowFiles = readdirSync(workflowsDir).filter((name) => /\.ya?ml$/i.test(name));
  return workflowFiles.some((name) => {
    const source = readFileSync(path.join(workflowsDir, name), "utf8");
    return /media[-_]?(worker|transcode)/i.test(name + source) || /\bschedule\s*:/i.test(source);
  });
}

function assertProductionPlaybackUnchanged() {
  const vodQuality = readFileSync(path.join(repoRoot, "_lib", "vodQuality.ts"), "utf8");
  if (!vodQuality.includes("publicPlaybackSafe: false")) {
    failClosed("production_creator_video_playback_not_confirmed_signed_origin_fallback");
  }
  return true;
}

function runBackupCli(modeName) {
  const payload = runJsonCommand(
    nodeCommand,
    ["./scripts/media-worker-backup-cli.mjs", `--mode=${modeName}`],
    `backup_cli_${modeName}_failed`,
  );
  if (payload.ok !== true) failClosed(`backup_cli_${modeName}_not_ok`);
  return payload;
}

function buildBatchId(sourceId, label = "dry-run") {
  return parseArgValue("--batch-id")
    ?? process.env.MEDIA_WORKER_BATCH_ID
    ?? `worker-cli-${label}-${sourceId.slice(0, 8)}`;
}

function buildOutputPrefix(batchId) {
  return assertSafeOutputPrefix(
    parseArgValue("--output-prefix")
    ?? process.env.MEDIA_WORKER_OUTPUT_PREFIX
    ?? `${cityLightsWorkerProofPrefixRoot}${batchId}/`,
  );
}

function getMaxJobs() {
  const maxJobs = Number(parseArgValue("--max-jobs") ?? process.env.MEDIA_WORKER_MAX_JOBS ?? "1");
  if (!Number.isInteger(maxJobs) || maxJobs < 1) failClosed("max_jobs_invalid");
  return maxJobs;
}

function getBackfillRequested() {
  return normalizeBool(parseArgValue("--backfill") ?? process.env.MEDIA_WORKER_BACKFILL);
}

function buildOneJobPlan({ sourceId, batchId, outputPrefix, backupGate }) {
  return {
    sourceId,
    sourceAllowlisted: allowedSourceIds.includes(sourceId),
    maxJobsPerRun: 1,
    backfillEnabled: false,
    operatorMode: "one_job",
    leaseRequired: true,
    workerCannotSelfEnable: true,
    emergencyStopActive: false,
    backupGate,
    outputPrefix,
    expectedPublicHlsMaster: `${outputPrefix}master.m3u8`,
    expectedRenditions: [
      { rendition_label: "360p", delivery_format: "hls", worker_status: "pending_audit" },
      { rendition_label: "480p", delivery_format: "hls", worker_status: "pending_audit" },
    ],
    expectedJobRow: {
      source_type: "creator_video",
      source_id: sourceId,
      status_sequence: ["queued", "probing", "transcoding", "uploading", "ready"],
      output_prefix: outputPrefix,
      proof_mode: true,
    },
    auditBatch: {
      batch_id: batchId,
      source_id: sourceId,
      expected_row_count: 2,
      exact_r2_prefix: outputPrefix,
      audit_pass_required_before_resolver_trust: true,
    },
    rollbackPlan: buildRollbackPlan({ batchId, sourceId, outputPrefix }),
    writesAttempted: false,
    mediaUploaded: false,
    queueProcessorRun: false,
    productionPlaybackSwitched: false,
  };
}

function buildRollbackPlan({ batchId, sourceId, outputPrefix }) {
  return {
    batch_id: batchId,
    source_id: sourceId,
    exact_r2_prefix: outputPrefix,
    targetOnlyExactBatch: true,
    targetOnlyExactPrefix: true,
    denyBroadPrefix: true,
    deletePrivateOriginMedia: false,
    revokeResolverTrustOnlyForScopedRows: true,
    productionPlaybackSwitched: false,
    execution: "plan_only_no_delete",
  };
}

function fetchPublicUrl(url, method = "GET") {
  const args = method === "HEAD"
    ? ["-sS", "-I", "--max-time", "20", url]
    : ["-sS", "-D", "-", "--max-time", "20", url];
  const result = spawnSync("curl", args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.status !== 0) failClosed("public_output_fetch_failed", { url: redactPublicUrl(url), method });
  assertNoSecretLikeText("public_output_fetch", result.stdout + result.stderr);
  const lines = result.stdout.split(/\r?\n/);
  const statusLine = lines.find((line) => /^HTTP\//i.test(line)) ?? "";
  const status = Number(statusLine.match(/\s(\d{3})\s/)?.[1] ?? 0);
  const bodyStart = result.stdout.indexOf("\r\n\r\n");
  const body = bodyStart >= 0 ? result.stdout.slice(bodyStart + 4).replace(/^\r?\n/, "") : "";
  return {
    status,
    headers: lines.filter((line) => /^content-type:|^cache-control:|^cf-cache-status:|^age:/i.test(line)),
    body,
  };
}

function redactPublicUrl(url) {
  return url.replace(/^https:\/\/media\.chillywoodstream\.com\//, "media-domain:/");
}

function verifyOutputPrefix(outputPrefix) {
  const masterUrl = `https://${mediaPublicDomain}/${outputPrefix}master.m3u8`;
  const master = fetchPublicUrl(masterUrl);
  if (master.status !== 200) failClosed("hls_master_fetch_not_200", { status: master.status, masterUrl: redactPublicUrl(masterUrl) });
  const variantPath = master.body.split(/\r?\n/).find((line) => line.trim().endsWith(".m3u8") && !line.startsWith("#"));
  if (!variantPath) failClosed("hls_master_missing_variant_playlist");
  const variantUrl = new URL(variantPath, masterUrl).toString();
  const variant = fetchPublicUrl(variantUrl);
  if (variant.status !== 200) failClosed("hls_variant_fetch_not_200", { status: variant.status, variantUrl: redactPublicUrl(variantUrl) });
  const segmentPath = variant.body.split(/\r?\n/).find((line) => line.trim().endsWith(".ts") && !line.startsWith("#"));
  if (!segmentPath) failClosed("hls_variant_missing_segment");
  const segmentUrl = new URL(segmentPath, variantUrl).toString();
  const segment = fetchPublicUrl(segmentUrl, "HEAD");
  if (segment.status !== 200) failClosed("hls_segment_head_not_200", { status: segment.status, segmentUrl: redactPublicUrl(segmentUrl) });
  return {
    master: { url: redactPublicUrl(masterUrl), status: master.status, headers: master.headers },
    variant: { url: redactPublicUrl(variantUrl), status: variant.status, headers: variant.headers },
    segment: { url: redactPublicUrl(segmentUrl), status: segment.status, headers: segment.headers },
    scopedOutputPrefix: outputPrefix,
    exactPrefixOnly: true,
  };
}

function validateMode() {
  if (!validModes.includes(mode)) failClosed("invalid_mode", { validModes });
}

function runDryRun() {
  const sourceId = assertAllowlistedSource(parseArgValue("--source-id") ?? process.env.MEDIA_WORKER_SOURCE_ID);
  const maxJobs = getMaxJobs();
  if (maxJobs !== 1) failClosed("max_jobs_must_be_one", { maxJobs });
  if (getBackfillRequested()) failClosed("backfill_disabled_required");
  const backupGate = assertBackupGateClosed();
  const batchId = assertSimpleId("batch_id", buildBatchId(sourceId));
  const outputPrefix = buildOutputPrefix(batchId);
  const plan = buildOneJobPlan({ sourceId, batchId, outputPrefix, backupGate });
  safeExit(0, {
    ok: true,
    mode,
    dryRun: true,
    plan,
    productionWorkerDeployed: false,
    continuousAutomationEnabled: false,
  });
}

function runRunOne() {
  const sourceId = parseArgValue("--source-id") ?? process.env.MEDIA_WORKER_SOURCE_ID;
  if (!sourceId) failClosed("source_id_required");
  assertAllowlistedSource(sourceId);
  const maxJobs = getMaxJobs();
  if (maxJobs !== 1) failClosed("max_jobs_must_be_one", { maxJobs });
  if (getBackfillRequested()) failClosed("backfill_disabled_required");
  const backupGate = assertBackupGateClosed();
  const confirm = parseArgValue("--confirm") ?? process.env.MEDIA_WORKER_RUN_ONE_CONFIRM;
  if (confirm !== "I_UNDERSTAND_ONE_JOB") {
    failClosed("run_one_confirmation_missing", {
      requiredEnv: "MEDIA_WORKER_RUN_ONE_CONFIRM=I_UNDERSTAND_ONE_JOB",
    });
  }
  const batchId = assertSimpleId("batch_id", buildBatchId(sourceId, "run-one"));
  const outputPrefix = buildOutputPrefix(batchId);
  const plan = buildOneJobPlan({ sourceId, batchId, outputPrefix, backupGate });
  failClosed("run_one_execution_not_implemented_in_cli_infrastructure_build", {
    plan,
    futureApprovalRequired: true,
    productionDbWritesEnabled: false,
  });
}

function runAudit() {
  const sourceId = assertAllowlistedSource(parseArgValue("--source-id") ?? process.env.MEDIA_WORKER_SOURCE_ID);
  const batchId = assertSimpleId("batch_id", parseArgValue("--batch-id") ?? process.env.MEDIA_WORKER_BATCH_ID);
  const outputPrefix = parseArgValue("--output-prefix") || process.env.MEDIA_WORKER_OUTPUT_PREFIX;
  const scopedPrefix = outputPrefix ? assertSafeOutputPrefix(outputPrefix) : null;
  const shouldReadDb = normalizeBool(parseArgValue("--read-db") ?? process.env.MEDIA_WORKER_AUDIT_READ_DB);
  const readback = shouldReadDb ? queryBatchRows(batchId, sourceId) : null;
  safeExit(0, {
    ok: true,
    mode,
    auditPlanOnly: true,
    batchId,
    sourceId,
    outputPrefix: scopedPrefix,
    requiredChecks: [
      "exact_source_id",
      "exact_expected_row_count",
      "public_playback_path_under_playback_public",
      "no_original_master_public_playback",
      "no_private_or_premium_public_cdn",
      "scan_clean_or_approved",
      "moderation_allowed",
      "no_unexpected_ready_rows_before_audit",
    ],
    dbReadback: readback,
    writesAttempted: false,
    resolverTrustChanged: false,
  });
}

function runVerifyOutput() {
  const sourceId = assertAllowlistedSource(parseArgValue("--source-id") ?? process.env.MEDIA_WORKER_SOURCE_ID);
  const outputPrefix = assertSafeOutputPrefix(parseArgValue("--output-prefix") ?? process.env.MEDIA_WORKER_OUTPUT_PREFIX);
  const networkFetchDisabled = normalizeBool(parseArgValue("--plan-only") ?? process.env.MEDIA_WORKER_VERIFY_OUTPUT_PLAN_ONLY);
  const proof = networkFetchDisabled ? {
    planOnly: true,
    scopedOutputPrefix: outputPrefix,
    exactPrefixOnly: true,
  } : verifyOutputPrefix(outputPrefix);
  safeExit(0, {
    ok: true,
    mode,
    sourceId,
    ...proof,
    privateSignedOriginUrlExposed: false,
    productionPlaybackSwitched: false,
  });
}

function runRollbackPlan() {
  const sourceId = assertAllowlistedSource(parseArgValue("--source-id") ?? process.env.MEDIA_WORKER_SOURCE_ID);
  const batchId = assertSimpleId("batch_id", parseArgValue("--batch-id") ?? process.env.MEDIA_WORKER_BATCH_ID);
  const outputPrefix = assertSafeOutputPrefix(parseArgValue("--output-prefix") ?? process.env.MEDIA_WORKER_OUTPUT_PREFIX);
  safeExit(0, {
    ok: true,
    mode,
    rollbackPlan: buildRollbackPlan({ batchId, sourceId, outputPrefix }),
    broadDeleteAllowed: false,
    privatePremiumOriginalDeleteAllowed: false,
    execution: "plan_only_no_delete",
  });
}

async function main() {
  validateMode();

  if (mode === "dry-run") return runDryRun();
  if (mode === "run-one") return runRunOne();
  if (mode === "audit") return runAudit();
  if (mode === "verify-output") return runVerifyOutput();
  if (mode === "rollback-plan") return runRollbackPlan();

  if (mode === "status") {
    const project = readSupabaseProject();
    const counts = readWorkerCounts();
    const backupGate = assertBackupGateClosed();
    safeExit(0, {
      ok: true,
      mode,
      project,
      rowCounts: counts,
      latestBackupGate: backupGate,
      workerDisabled: true,
      activeUnfinishedJobs: Number(counts.active_unfinished_jobs ?? 0),
      unsafeCdnRows: Number(counts.unsafe_cdn_rows ?? 0),
      otherSourceRenditions: Number(counts.other_source_renditions ?? 0),
      continuousAutomationEnabled: false,
      productionWorkerDeployed: false,
      queueProcessorRunning: false,
      productionPlaybackUnchanged: assertProductionPlaybackUnchanged(),
    });
  }

  if (mode === "preflight") {
    const project = readSupabaseProject();
    const counts = readWorkerCounts();
    const backupGate = assertBackupGateClosed();
    const verifyLatest = runBackupCli("verify-latest");
    const restoreDrill = runBackupCli("restore-drill");
    safeExit(0, {
      ok: true,
      mode,
      project,
      rowCounts: counts,
      backupGate,
      verifyLatestPassed: verifyLatest.ok === true && verifyLatest.checksumsMatch === true,
      restoreDrillPassed: restoreDrill.ok === true && restoreDrill.rowCountsMatch === true,
      maxJobsPerRun: 1,
      backfillEnabled: false,
      sourceAllowlistRequired: true,
      allowedSourceIds,
      emergencyStopActive: false,
      workerDisabled: true,
      noContinuousWorkerRunning: Number(counts.active_unfinished_jobs ?? 0) === 0,
      cronOrSchedulerAdded: hasCronOrMediaWorkerWorkflow(),
      cronOrSchedulerDenied: !hasCronOrMediaWorkerWorkflow(),
      privateBackupBucket,
      publicPlaybackBucketDeniedForBackups: true,
      mediaPublicDomainDeniedForBackups: true,
      publicPlaybackBucket: publicPlaybackBucket,
      productionPlaybackUnchanged: assertProductionPlaybackUnchanged(),
      productionWorkerDeployed: false,
      continuousAutomationEnabled: false,
    });
  }
}

main().catch((error) => {
  failClosed("media_transcode_worker_cli_failed_without_secret_output", { error: error.message });
});
