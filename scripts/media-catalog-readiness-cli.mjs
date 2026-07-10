#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const validModes = new Set(["status", "readiness-plan", "scan-plan"]);

const args = Object.fromEntries(process.argv.slice(2).filter((arg) => arg.startsWith("--")).map((arg) => {
  const [key, ...value] = arg.slice(2).split("=");
  return [key, value.length ? value.join("=") : "true"];
}));

const mode = String(args.mode || "status").trim();
const dataSource = String(args.source || process.env.MEDIA_CATALOG_DATABASE_SOURCE || "fixture").trim();

function safeExit(code, payload) {
  const output = JSON.stringify({
    ...payload,
    noSecretsPrinted: true,
    readOnly: true,
    mutationAttempted: false,
    scanExecutionAttempted: false,
    productionRowsWritten: false,
    mediaProcessed: false,
    playbackSwitched: false,
    privateMediaExposed: false,
    premiumMediaExposed: false,
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
  if (
    /postgres(?:ql)?:\/\//i.test(text)
    || new RegExp(`X-Amz-${"Signature"}=`, "i").test(text)
    || /\bservice[_-]?role\b/i.test(text)
    || /\bBearer\s+[A-Za-z0-9._-]+/i.test(text)
    || /https?:\/\/(?!media\.chillywoodstream\.com\b)[^\s"']+/i.test(text)
  ) {
    failClosed("secret_or_private_url_like_value_refused");
  }
}

function runJsonCommand(command, commandArgs, failureReason, maxBuffer = 50 * 1024 * 1024) {
  const result = spawnSync(command, commandArgs, {
    cwd: repoRoot,
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

function assertSupportedModeAndSource() {
  if (!validModes.has(mode)) failClosed("invalid_mode", { validModes: Array.from(validModes) });
  if (!["fixture", "linked"].includes(dataSource)) {
    failClosed("unsupported_data_source", { supportedSources: ["fixture", "linked"] });
  }
}

function loadReadinessHelper() {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-catalog-readiness-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaCatalogReadiness.ts",
        "--target",
        "ES2020",
        "--module",
        "commonjs",
        "--moduleResolution",
        "node",
        "--outDir",
        outDir,
        "--strict",
        "--skipLibCheck",
      ],
      {
        cwd: repoRoot,
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
      },
    );
    const requireFromHere = createRequire(import.meta.url);
    return {
      helper: requireFromHere(path.join(outDir, "mediaCatalogReadiness.js")),
      cleanup: () => rmSync(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
}

const productionCatalogSql = `
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
catalog as (
  select
    'creator_video'::text as source_type,
    v.id::text as source_id,
    case when coalesce(v.visibility, '') = 'public' then coalesce(nullif(v.title, ''), 'Untitled video') else '[redacted]' end as title,
    coalesce(v.visibility, '') as visibility,
    coalesce(v.scan_status, '') as scan_status,
    coalesce(v.moderation_status, '') as moderation_status,
    coalesce(v.mime_type, '') as mime_type,
    (
      (v.playback_url is not null and v.playback_url <> '')
      or (v.storage_path is not null and v.storage_path <> '')
      or (v.storage_object_key is not null and v.storage_object_key <> '')
    ) as source_present,
    ((coalesce(v.storage_path, '') || '/' || coalesce(v.storage_object_key, '') || '/' || coalesce(v.playback_url, '')) ~* '(^|/)(originals?|masters?)(/|$)') as is_original_only,
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
    ) as paid_or_premium_locked,
    exists (select 1 from trusted_hls h where h.source_id = v.id::text) as has_audited_hls,
    exists (
      select 1
      from public.media_transcode_jobs j
      where j.source_type = 'creator_video'
        and j.source_id = v.id::text
        and j.status = 'failed'
        and j.error_code in ('source_resolution_below_minimum_hls_rendition')
    ) as unsupported_failed_job
  from public.videos v
)
select json_agg(to_jsonb(catalog) order by title, source_id) as catalog
from catalog;
`;

const fixtureRows = [
  {
    source_type: "creator_video",
    source_id: "ready-public",
    title: "Ready Public",
    visibility: "public",
    scan_status: "clean",
    moderation_status: "allowed",
    mime_type: "video/mp4",
    source_present: true,
  },
  {
    source_type: "creator_video",
    source_id: "audited-hls",
    title: "Audited HLS",
    visibility: "public",
    scan_status: "approved",
    moderation_status: "clean",
    mime_type: "application/vnd.apple.mpegurl",
    source_present: true,
    has_audited_hls: true,
  },
  {
    source_type: "creator_video",
    source_id: "unscanned-public",
    title: "Unscanned Public",
    visibility: "public",
    scan_status: "manual_review",
    moderation_status: "allowed",
    mime_type: "video/mp4",
    source_present: true,
  },
  { source_type: "creator_video", source_id: "needs-moderation", title: "Needs Moderation", visibility: "public", scan_status: "clean", moderation_status: "pending_review", mime_type: "video/mp4", source_present: true },
  { source_type: "creator_video", source_id: "private", title: "Private", visibility: "private", scan_status: "clean", moderation_status: "allowed", mime_type: "video/mp4", source_present: true },
  { source_type: "creator_video", source_id: "premium", title: "Premium", visibility: "public", scan_status: "clean", moderation_status: "allowed", mime_type: "video/mp4", source_present: true, paid_or_premium_locked: true },
  { source_type: "creator_video", source_id: "original", title: "Original", visibility: "public", scan_status: "clean", moderation_status: "allowed", mime_type: "video/mp4", source_present: true, is_original_only: true },
  { source_type: "creator_video", source_id: "missing", title: "Missing", visibility: "public", scan_status: "clean", moderation_status: "allowed", mime_type: "video/mp4", source_present: false },
  { source_type: "creator_video", source_id: "unsupported", title: "Unsupported", visibility: "public", scan_status: "clean", moderation_status: "allowed", mime_type: "application/octet-stream", source_present: true },
  { source_type: "creator_video", source_id: "blocked", title: "Blocked", visibility: "public", scan_status: "clean", moderation_status: "blocked", mime_type: "video/mp4", source_present: true },
];

function readCatalogRows() {
  if (dataSource === "fixture") return fixtureRows;
  const rows = runSupabaseLinkedQuery(productionCatalogSql);
  const catalog = rows[0]?.catalog;
  if (!Array.isArray(catalog)) failClosed("production_catalog_missing_payload");
  return catalog;
}

function summarizeResult(result) {
  return {
    sourceType: result.sourceType,
    sourceId: result.sourceId,
    title: result.title,
    classification: result.classification,
    scanStatus: result.scanStatus,
    moderationStatus: result.moderationStatus,
    canQueueForScan: result.canQueueForScan,
    canPromoteToTranscodeEligibility: result.canPromoteToTranscodeEligibility,
    nextStep: result.nextStep,
  };
}

function buildOutput() {
  const loaded = loadReadinessHelper();
  try {
    const rows = readCatalogRows();
    const plan = loaded.helper.buildMediaReadinessPlan(rows);
    const sanitizedPlan = loaded.helper.sanitizeMediaReadinessProof({
      totalRows: plan.totalRows,
      classificationCounts: plan.classificationCounts,
      readyForTranscodeCount: plan.readyForTranscode.length,
      alreadyAuditedHlsCount: plan.alreadyAuditedHls.length,
      scanCandidateCount: plan.scanCandidates.length,
      moderationReviewCandidateCount: plan.moderationReviewCandidates.length,
      readyForTranscode: plan.readyForTranscode.map(summarizeResult),
      alreadyAuditedHls: plan.alreadyAuditedHls.map(summarizeResult),
      scanCandidates: plan.scanCandidates.map((result) => ({
        ...summarizeResult(result),
        proposedTransition: "unscanned_or_manual_review_to_scan_pending_then_clean_or_blocked",
        requiredProof: ["scanner_verdict", "scan_status_readback", "moderation_gate_readback"],
      })),
      moderationReviewCandidates: plan.moderationReviewCandidates.map(summarizeResult),
      scanAutomationStatus: "existing_scanner_pipeline_documented_but_catalog_readiness_cli_is_plan_only",
      scanExecutionAvailableInThisCommand: false,
      moderationPromotionAvailableInThisCommand: false,
      mutationAttempted: plan.mutationAttempted,
      scanExecutionAttempted: plan.scanExecutionAttempted,
      productionRowsWritten: plan.productionRowsWritten,
      mediaProcessed: plan.mediaProcessed,
      playbackSwitched: plan.playbackSwitched,
    });

    assertNoSecretLikeText(sanitizedPlan);
    return sanitizedPlan;
  } finally {
    loaded.cleanup();
  }
}

assertSupportedModeAndSource();

const output = buildOutput();
if (mode === "status") {
  safeExit(0, {
    ok: true,
    mode,
    dataSource: dataSource === "linked" ? "linked_supabase_read_only" : "fixture",
    totalRows: output.totalRows,
    classificationCounts: output.classificationCounts,
    scanCandidateCount: output.scanCandidateCount,
    readyForTranscodeCount: output.readyForTranscodeCount,
    alreadyAuditedHlsCount: output.alreadyAuditedHlsCount,
    scanAutomationStatus: output.scanAutomationStatus,
  });
}

if (mode === "readiness-plan") {
  safeExit(0, {
    ok: true,
    mode,
    dataSource: dataSource === "linked" ? "linked_supabase_read_only" : "fixture",
    ...output,
  });
}

if (mode === "scan-plan") {
  safeExit(0, {
    ok: true,
    mode,
    dataSource: dataSource === "linked" ? "linked_supabase_read_only" : "fixture",
    totalRows: output.totalRows,
    scanCandidateCount: output.scanCandidateCount,
    scanCandidates: output.scanCandidates,
    scanExecutionAvailableInThisCommand: output.scanExecutionAvailableInThisCommand,
    moderationPromotionAvailableInThisCommand: output.moderationPromotionAvailableInThisCommand,
    scanAutomationStatus: output.scanAutomationStatus,
  });
}
