#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const compileDiscovery = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-automation-discovery-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaAutomationDiscovery.ts",
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
    const helper = requireFromHere(path.join(outDir, "mediaAutomationDiscovery.js"));
    return { helper, cleanup: () => rmSync(outDir, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const rows = [
  {
    source_type: "creator_video",
    source_id: "eligible-public-safe",
    title: "Eligible Public Safe",
    visibility: "public",
    scan_status: "clean",
    moderation_status: "allowed",
    source_present: true,
    mime_type: "video/mp4",
  },
  {
    source_type: "creator_video",
    source_id: "already-audited",
    title: "Already Audited",
    visibility: "public",
    scan_status: "approved",
    moderation_status: "clean",
    source_present: true,
    has_audited_hls: true,
  },
  { source_type: "creator_video", source_id: "private", visibility: "private", scan_status: "clean", moderation_status: "allowed", source_present: true },
  { source_type: "creator_video", source_id: "premium", visibility: "public", scan_status: "clean", moderation_status: "allowed", source_present: true, paid_or_premium_locked: true },
  { source_type: "creator_video", source_id: "original", visibility: "public", scan_status: "clean", moderation_status: "allowed", source_present: true, is_original_only: true },
  { source_type: "creator_video", source_id: "unscanned", visibility: "public", scan_status: "pending_scan", moderation_status: "allowed", source_present: true },
  { source_type: "creator_video", source_id: "moderation", visibility: "public", scan_status: "clean", moderation_status: "blocked", source_present: true },
  { source_type: "creator_video", source_id: "missing", visibility: "public", scan_status: "clean", moderation_status: "allowed", source_present: false },
  { source_type: "creator_video", source_id: "unsupported", visibility: "public", scan_status: "clean", moderation_status: "allowed", source_present: true, mime_type: "application/octet-stream" },
  { source_type: "creator_video", source_id: "denied", visibility: "public", scan_status: "clean", moderation_status: "allowed", source_present: true },
];

const loaded = compileDiscovery();

try {
  const {
    classifyMediaAutomationCandidate,
    discoverEligibleTranscodeSources,
    buildTranscodeCandidateBatch,
    sanitizeAutomationDiscoveryProof,
  } = loaded.helper;

  const classified = rows.map((row) => classifyMediaAutomationCandidate(row, { deniedSourceIds: ["denied"] }));
  const byId = new Map(classified.map((candidate) => [candidate.sourceId, candidate]));
  assert(byId.get("eligible-public-safe").classification === "needs_transcode", "public safe row needs transcode");
  assert(byId.get("already-audited").classification === "already_has_audited_hls", "audited HLS row is skipped");
  assert(byId.get("private").classification === "private_blocked", "private row blocked");
  assert(byId.get("premium").classification === "premium_blocked", "premium row blocked");
  assert(byId.get("original").classification === "original_only_blocked", "original row blocked");
  assert(byId.get("unscanned").classification === "unscanned_blocked", "unscanned row blocked");
  assert(byId.get("moderation").classification === "moderation_blocked", "moderation row blocked");
  assert(byId.get("missing").classification === "missing_source_blocked", "missing source blocked");
  assert(byId.get("unsupported").classification === "unsupported_format_blocked", "unsupported format blocked");
  assert(byId.get("denied").classification === "denied_source_blocked", "denied source blocked");

  const eligible = discoverEligibleTranscodeSources(rows, { deniedSourceIds: ["denied"] });
  assert(eligible.length === 1, "only one row is eligible for new transcode");

  const batch = buildTranscodeCandidateBatch(rows, { maxBatchSize: 1, deniedSourceIds: ["denied"] });
  assert(batch.selected.length === 1, "batch cap selects one");
  assert(batch.mutationAttempted === false, "discovery must not mutate");
  assert(batch.productionPlaybackSwitched === false, "discovery must not switch playback");

  const summary = sanitizeAutomationDiscoveryProof({
    ok: true,
    classifications: Object.fromEntries(classified.map((candidate) => [candidate.sourceId, candidate.classification])),
    eligibleCount: eligible.length,
    selectedCount: batch.selected.length,
    blockedCounts: batch.blockedCounts,
    mutationAttempted: batch.mutationAttempted,
    productionPlaybackSwitched: batch.productionPlaybackSwitched,
  });
  console.log(JSON.stringify(summary, null, 2));
} finally {
  loaded.cleanup();
}
