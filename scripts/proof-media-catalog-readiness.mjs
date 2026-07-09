#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const nodeCommand = process.execPath;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function compileReadinessHelper() {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-catalog-readiness-proof-"));
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

function assertNoSecretLikeText(label, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const patterns = [
    /postgres(?:ql)?:\/\//i,
    new RegExp(`X-Amz-${"Signature"}=`, "i"),
    /\bservice[_-]?role\b/i,
    /\bBearer\s+[A-Za-z0-9._-]+/i,
    /https?:\/\/private-origin\.example/i,
  ];
  const match = patterns.find((pattern) => pattern.test(text));
  assert(!match, `${label} contained secret/private URL-like text`);
}

function runCli(args) {
  const result = spawnSync(nodeCommand, ["./scripts/media-catalog-readiness-cli.mjs", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  const text = result.stdout || result.stderr || "{}";
  let output;
  try {
    output = JSON.parse(text);
  } catch {
    throw new Error(`Catalog readiness CLI returned non-JSON output: ${text}`);
  }
  assertNoSecretLikeText("catalog readiness CLI output", output);
  return { status: result.status, output };
}

const rows = [
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
    source_id: "already-audited",
    title: "Already Audited",
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
  { source_type: "creator_video", source_id: "needs-moderation", visibility: "public", scan_status: "clean", moderation_status: "pending_review", mime_type: "video/mp4", source_present: true },
  { source_type: "creator_video", source_id: "private", visibility: "private", scan_status: "clean", moderation_status: "allowed", mime_type: "video/mp4", source_present: true },
  { source_type: "creator_video", source_id: "premium", visibility: "public", scan_status: "clean", moderation_status: "allowed", mime_type: "video/mp4", source_present: true, paid_or_premium_locked: true },
  { source_type: "creator_video", source_id: "original", visibility: "public", scan_status: "clean", moderation_status: "allowed", mime_type: "video/mp4", source_present: true, is_original_only: true },
  { source_type: "creator_video", source_id: "missing", visibility: "public", scan_status: "clean", moderation_status: "allowed", mime_type: "video/mp4", source_present: false },
  { source_type: "creator_video", source_id: "unsupported", visibility: "public", scan_status: "clean", moderation_status: "allowed", mime_type: "application/octet-stream", source_present: true },
  { source_type: "creator_video", source_id: "blocked", visibility: "public", scan_status: "clean", moderation_status: "blocked", mime_type: "video/mp4", source_present: true },
  { source_type: "creator_video", source_id: "denied", visibility: "public", scan_status: "clean", moderation_status: "allowed", mime_type: "video/mp4", source_present: true },
  {
    source_type: "creator_video",
    source_id: "private-url-redaction",
    title: ["https:", "", "private-origin.example", "signed?X-Amz-" + "Signature=abc"].join("/"),
    visibility: "public",
    scan_status: "manual_review",
    moderation_status: "allowed",
    mime_type: "video/mp4",
    source_present: true,
  },
];

const loaded = compileReadinessHelper();

try {
  const {
    classifyMediaCatalogReadiness,
    canQueueMediaForScan,
    canPromoteScanResultToTranscodeEligibility,
    buildMediaReadinessPlan,
    sanitizeMediaReadinessProof,
  } = loaded.helper;

  const classified = rows.map((row) => classifyMediaCatalogReadiness(row, { deniedSourceIds: ["denied"] }));
  const byId = new Map(classified.map((result) => [result.sourceId, result]));

  assert(byId.get("private").classification === "private_excluded", "private media excluded");
  assert(byId.get("premium").classification === "premium_excluded", "Premium media excluded");
  assert(byId.get("unscanned-public").classification === "needs_scan", "unscanned public media needs scan");
  assert(byId.get("ready-public").classification === "ready_for_transcode", "clean + allowed media ready for transcode");
  assert(byId.get("needs-moderation").classification === "needs_moderation_review", "moderation pending needs review");
  assert(byId.get("blocked").classification === "blocked_moderation", "moderation blocked stays blocked");
  assert(byId.get("missing").classification === "missing_source", "missing source classified");
  assert(byId.get("unsupported").classification === "unsupported_format", "unsupported format classified");
  assert(byId.get("already-audited").classification === "already_audited_hls", "already audited HLS classified");
  assert(byId.get("original").classification === "original_master_excluded", "original/master excluded");
  assert(byId.get("denied").classification === "denied_source", "denied source classified");
  assert(canQueueMediaForScan(byId.get("unscanned-public")) === true, "unscanned public candidate can queue for scan");
  assert(canPromoteScanResultToTranscodeEligibility(byId.get("ready-public")) === true, "clean+allowed can promote");
  assert(canPromoteScanResultToTranscodeEligibility(byId.get("unscanned-public")) === false, "unscanned cannot promote");

  const plan = buildMediaReadinessPlan(rows, { deniedSourceIds: ["denied"] });
  assert(plan.scanCandidates.length === 2, "two public scan candidates in fixture");
  assert(plan.readyForTranscode.length === 1, "one ready candidate in fixture");
  assert(plan.alreadyAuditedHls.length === 1, "one already audited HLS fixture");
  assert(plan.mutationAttempted === false, "readiness plan does not mutate");
  assert(plan.scanExecutionAttempted === false, "readiness plan does not execute scan");
  assert(plan.productionRowsWritten === false, "readiness plan writes no rows");
  assert(plan.mediaProcessed === false, "readiness plan processes no media");

  const sanitized = sanitizeMediaReadinessProof({
    ok: true,
    classifications: Object.fromEntries(classified.map((result) => [result.sourceId, result.classification])),
    queueableScanCount: plan.scanCandidates.length,
    readyForTranscodeCount: plan.readyForTranscode.length,
    mutationAttempted: plan.mutationAttempted,
    privateUrlProbe: byId.get("private-url-redaction").title,
  });
  assertNoSecretLikeText("sanitized readiness proof", sanitized);

  const cliStatus = runCli(["--mode=status"]);
  assert(cliStatus.status === 0, "catalog status CLI passes");
  assert(cliStatus.output.readOnly === true, "catalog status CLI read-only");
  const cliPlan = runCli(["--mode=readiness-plan"]);
  assert(cliPlan.status === 0, "catalog readiness plan CLI passes");
  assert(cliPlan.output.mutationAttempted === false, "catalog readiness plan CLI no mutation");
  const cliScanPlan = runCli(["--mode=scan-plan"]);
  assert(cliScanPlan.status === 0, "catalog scan plan CLI passes");
  assert(cliScanPlan.output.scanExecutionAvailableInThisCommand === false, "scan plan does not execute scans");

  console.log(JSON.stringify({
    ok: true,
    classifications: sanitized.classifications,
    privateExcluded: byId.get("private").classification,
    premiumExcluded: byId.get("premium").classification,
    unscannedPublic: byId.get("unscanned-public").classification,
    cleanAllowed: byId.get("ready-public").classification,
    moderationBlocked: byId.get("blocked").classification,
    missingSource: byId.get("missing").classification,
    unsupportedFormat: byId.get("unsupported").classification,
    alreadyAuditedHls: byId.get("already-audited").classification,
    queueableScanCount: plan.scanCandidates.length,
    readinessPlanMutates: plan.mutationAttempted,
    cliReadOnly: cliPlan.output.readOnly,
    noSecretsPrinted: true,
    productionRowsWritten: false,
    mediaProcessed: false,
    playbackSwitched: false,
  }, null, 2));
} finally {
  loaded.cleanup();
}
