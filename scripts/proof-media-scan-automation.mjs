#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const nodeCommand = process.execPath;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

function compileScanHelper() {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-scan-proof-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaScanAutomation.ts",
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
      helper: requireFromHere(path.join(outDir, "mediaScanAutomation.js")),
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
    /\bservice[_-]?role\s*[:=]/i,
    /\bBearer\s+[A-Za-z0-9._-]+/i,
    /https?:\/\/private-origin\.example/i,
  ];
  const match = patterns.find((pattern) => pattern.test(text));
  assert(!match, `${label} contained secret/private URL-like text`);
}

function commandAvailable(command) {
  return spawnSync("sh", ["-lc", `command -v ${command}`], { encoding: "utf8" }).status === 0;
}

function runCli(args, env = {}) {
  const result = spawnSync(nodeCommand, ["./scripts/media-scan-cli.mjs", ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
  const text = result.stdout || result.stderr || "{}";
  let output;
  try {
    output = JSON.parse(text);
  } catch {
    throw new Error(`media scan CLI returned non-JSON output: ${text}`);
  }
  assertNoSecretLikeText("media scan CLI output", output);
  return { status: result.status, output };
}

function runFfprobeProof() {
  if (!commandAvailable("ffprobe")) {
    return {
      ffprobeAvailable: false,
      readableProof: {
        status: "manual_review",
        scannerName: "ffprobe",
        scannerVersion: "unavailable",
        scannerType: "ffprobe_media_readability",
        proof: { observedReadable: false, decodedStreams: 0, errorCode: "ffprobe_unavailable" },
      },
      failedProof: {
        status: "scan_failed",
        scannerName: "ffprobe",
        scannerVersion: "unavailable",
        scannerType: "ffprobe_media_readability",
        proof: { observedReadable: false, decodedStreams: 0, errorCode: "ffprobe_unavailable" },
      },
    };
  }

  const tmpDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-ffprobe-readability-"));
  try {
    const validPath = path.join(tmpDir, "readable.mp4");
    const invalidPath = path.join(tmpDir, "invalid.mp4");
    writeFileSync(invalidPath, "not a media file");
    if (commandAvailable("ffmpeg")) {
      const ffmpeg = spawnSync("ffmpeg", [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=size=16x16:rate=1",
        "-t",
        "1",
        "-pix_fmt",
        "yuv420p",
        "-y",
        validPath,
      ], { encoding: "utf8" });
      assert(ffmpeg.status === 0, "ffmpeg fixture generation failed");
    } else {
      throw new Error("ffmpeg is required to generate readable ffprobe fixture in this environment");
    }

    const version = spawnSync("ffprobe", ["-version"], { encoding: "utf8" }).stdout.split(/\r?\n/)[0]?.trim() || "ffprobe";
    const readable = spawnSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration:stream=codec_type",
      "-of",
      "json",
      validPath,
    ], { encoding: "utf8" });
    assert(readable.status === 0, "ffprobe readable fixture failed");
    const parsed = JSON.parse(readable.stdout || "{}");
    const decodedStreams = Array.isArray(parsed.streams) ? parsed.streams.length : 0;
    const durationMillis = Math.round(Number(parsed.format?.duration || 0) * 1000);

    const failed = spawnSync("ffprobe", ["-v", "error", "-of", "json", invalidPath], { encoding: "utf8" });
    assert(failed.status !== 0, "ffprobe invalid fixture unexpectedly passed");

    return {
      ffprobeAvailable: true,
      readableProof: {
        status: "clean",
        scannerName: "ffprobe",
        scannerVersion: version,
        scannerType: "ffprobe_media_readability",
        proof: { observedReadable: true, decodedStreams, durationMillis },
      },
      failedProof: {
        status: "scan_failed",
        scannerName: "ffprobe",
        scannerVersion: version,
        scannerType: "ffprobe_media_readability",
        proof: { observedReadable: false, decodedStreams: 0, errorCode: "ffprobe_failed" },
      },
    };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

const rows = [
  {
    source_type: "creator_video",
    source_id: "public-unscanned",
    title: "Public Unscanned",
    visibility: "public",
    scan_status: "manual_review",
    moderation_status: "allowed",
    mime_type: "video/mp4",
    source_present: true,
  },
  { source_type: "creator_video", source_id: "private", visibility: "private", scan_status: "manual_review", moderation_status: "allowed", mime_type: "video/mp4", source_present: true },
  { source_type: "creator_video", source_id: "premium", visibility: "public", scan_status: "manual_review", moderation_status: "allowed", mime_type: "video/mp4", source_present: true, paid_or_premium_locked: true },
  { source_type: "creator_video", source_id: "missing", visibility: "public", scan_status: "manual_review", moderation_status: "allowed", mime_type: "video/mp4", source_present: false },
  { source_type: "creator_video", source_id: "unsupported", visibility: "public", scan_status: "manual_review", moderation_status: "allowed", mime_type: "application/octet-stream", source_present: true },
  { source_type: "creator_video", source_id: "moderation-blocked", visibility: "public", scan_status: "manual_review", moderation_status: "blocked", mime_type: "video/mp4", source_present: true },
  { source_type: "creator_video", source_id: "already-audited", visibility: "public", scan_status: "manual_review", moderation_status: "allowed", mime_type: "video/mp4", source_present: true, has_audited_hls: true },
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

const loaded = compileScanHelper();

try {
  const {
    classifyMediaScanCandidate,
    buildMediaScanJobPlan,
    validateMediaScanResult,
    canPromoteScanResultToReadiness,
    sanitizeMediaScanProof,
  } = loaded.helper;

  const classified = rows.map((row) => classifyMediaScanCandidate(row));
  const byId = new Map(classified.map((result) => [result.sourceId, result]));
  assert(byId.get("public-unscanned").canScan === true, "public unscanned candidate scan eligible");
  assert(byId.get("private").scanState === "scan_skipped_private", "private candidate skipped");
  assert(byId.get("premium").scanState === "scan_skipped_premium", "Premium candidate skipped");
  assert(byId.get("missing").scanState === "scan_skipped_missing_source", "missing source skipped");
  assert(byId.get("unsupported").scanState === "scan_skipped_unsupported", "unsupported format skipped");
  assert(byId.get("already-audited").scanState === "scan_skipped_already_audited_hls", "already audited HLS skipped");

  const ffprobeProof = runFfprobeProof();
  const readableValidation = validateMediaScanResult(ffprobeProof.readableProof);
  const failedValidation = validateMediaScanResult(ffprobeProof.failedProof);
  if (ffprobeProof.ffprobeAvailable) {
    assert(readableValidation.valid === true, "ffprobe-readable media validates clean");
    assert(readableValidation.scanState === "scan_clean", "ffprobe-readable media scan clean");
  }
  assert(failedValidation.scanState === "scan_failed", "ffprobe failure validates failed");

  const blockedPromotion = canPromoteScanResultToReadiness(byId.get("moderation-blocked"), readableValidation);
  assert(blockedPromotion.allowed === false, "moderation-blocked not ready for transcode");
  const cleanAllowedPromotion = canPromoteScanResultToReadiness(byId.get("public-unscanned"), readableValidation);
  if (ffprobeProof.ffprobeAvailable) {
    assert(cleanAllowedPromotion.allowed === true, "clean scan + moderation allowed ready for transcode");
  }
  const missingModerationCandidate = classifyMediaScanCandidate({
    source_type: "creator_video",
    source_id: "needs-moderation",
    visibility: "public",
    scan_status: "manual_review",
    moderation_status: "pending_review",
    mime_type: "video/mp4",
    source_present: true,
  });
  assert(canPromoteScanResultToReadiness(missingModerationCandidate, readableValidation).allowed === false, "clean scan + moderation missing not ready");

  const plan = buildMediaScanJobPlan(rows, { maxJobs: 2 });
  assert(plan.plannedJobCount === 2, "scan plan caps selected public candidates");
  assert(plan.productionRowsWritten === false, "scan plan writes no rows");
  assert(plan.mediaProcessed === false, "scan plan processes no media");
  assert(plan.transcodeStarted === false, "scan plan does not transcode");

  const cliStatus = runCli(["--mode=status"]);
  assert(cliStatus.status === 0, "media scan status passes");
  const cliPlan = runCli(["--mode=plan"]);
  assert(cliPlan.status === 0, "media scan plan passes");
  const cliDryRun = runCli(["--mode=dry-run"]);
  assert(cliDryRun.status === 0, "media scan dry-run passes");
  assert(cliDryRun.output.productionRowsWritten === false, "media scan dry-run writes no rows");
  const cliRunDenied = runCli(["--mode=run-one"]);
  assert(cliRunDenied.status !== 0, "media scan run-one denied without confirmation");
  assert(cliRunDenied.output.reason === "media_scan_run_one_confirmation_missing", "run-one requires confirmation");
  const cliRunConfirmedDenied = runCli(["--mode=run-one"], {
    MEDIA_SCAN_RUN_ONE_CONFIRM: "I_UNDERSTAND_PUBLIC_SCAN_ONE",
  });
  assert(cliRunConfirmedDenied.status !== 0, "media scan run-one still source-proof blocked after confirmation");
  assert(cliRunConfirmedDenied.output.reason === "production_scan_write_not_enabled_in_this_source_proof_build", "confirmed run-one requires future trusted writer");

  const sanitized = sanitizeMediaScanProof({
    classifications: Object.fromEntries(classified.map((result) => [result.sourceId, result.scanState])),
    ffprobeAvailable: ffprobeProof.ffprobeAvailable,
    readableValidation,
    failedValidation,
    privateUrlProbe: rows.find((row) => row.source_id === "private-url-redaction")?.title,
    runOneRequiresConfirmation: cliRunDenied.output.reason,
    productionRowsWritten: false,
    mediaProcessed: false,
    playbackSwitched: false,
  });
  assertNoSecretLikeText("sanitized media scan proof", sanitized);

  console.log(JSON.stringify({
    ok: true,
    classifications: sanitized.classifications,
    ffprobeAvailable: ffprobeProof.ffprobeAvailable,
    readableScanState: readableValidation.scanState,
    failedScanState: failedValidation.scanState,
    moderationBlockedReadyForTranscode: blockedPromotion.allowed,
    cleanAllowedReadyForTranscode: cleanAllowedPromotion.allowed,
    scanPlanWritesRows: plan.productionRowsWritten,
    runOneRequiresConfirmation: cliRunDenied.output.reason,
    confirmedRunOneBlocked: cliRunConfirmedDenied.output.reason,
    noSecretsPrinted: true,
    productionRowsWritten: false,
    transcodeStarted: false,
    playbackSwitched: false,
  }, null, 2));
} finally {
  loaded.cleanup();
}
