#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const cityLightsSourceId = "c28e3838-7d2e-4f48-a8ad-73e3100f8cf1";
const workerProofMasterPath =
  "playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6/master.m3u8";

const toText = (value) => String(value ?? "").trim();
const toInteger = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : fallback;
};

export function parseArgs(argv = process.argv.slice(2)) {
  const args = {};
  for (const entry of argv) {
    if (!entry.startsWith("--")) continue;
    const [rawKey, ...rawValue] = entry.slice(2).split("=");
    args[rawKey] = rawValue.length ? rawValue.join("=") : "true";
  }
  return args;
}

export function loadEligibilityHelpers() {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-cdn-rollout-planner-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaDelivery.ts",
        "_lib/mediaRenditionMetadata.ts",
        "_lib/mediaPlaybackCdnEligibility.ts",
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
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    const requireFromHere = createRequire(import.meta.url);
    const loadCompiled = (fileName) => {
      for (const candidate of [
        path.join(outDir, fileName),
        path.join(outDir, "_lib", fileName),
      ]) {
        try {
          return requireFromHere(candidate);
        } catch {
          // Try the next compiler output shape.
        }
      }
      throw new Error(`Compiled helper ${fileName} was not found.`);
    };

    return {
      playbackCdnEligibility: loadCompiled("mediaPlaybackCdnEligibility.js"),
      renditionMetadata: loadCompiled("mediaRenditionMetadata.js"),
      cleanup: () => rmSync(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
}

export function buildRolloutFixtureRows(renditionMetadata, options = {}) {
  const eligibleCount = toInteger(options.eligibleCount, 1);
  const includeBlocked = options.includeBlocked !== false;
  const base = renditionMetadata
    .buildCityLightsTrustedHlsRenditionFixtures("2026-07-09T00:00:00.000Z")[1];
  const rows = [];

  for (let index = 0; index < eligibleCount; index += 1) {
    const sourceId = index === 0 ? cityLightsSourceId : `eligible-source-${String(index).padStart(4, "0")}`;
    const prefix = index === 0
      ? "playback/public/worker-proof/chillywood-city-lights/worker-one-job-20260709-b81c7b1423c6"
      : `playback/public/worker-proof/eligible-source-${String(index).padStart(4, "0")}/batch-proof`;
    rows.push({
      ...base,
      id: `eligible-rendition-${index}`,
      media_id: sourceId,
      video_id: sourceId,
      source_id: sourceId,
      audit_status: "passed",
      public_playback_path: `${prefix}/master.m3u8`,
      manifest_path: `${prefix}/master.m3u8`,
      variant_playlist_path: `${prefix}/480p/index.m3u8`,
      proof_mode: true,
    });
  }

  if (includeBlocked) {
    rows.push(
      { ...base, id: "blocked-pending-audit", source_id: "pending-audit-source", audit_status: "pending" },
      { ...base, id: "blocked-private", source_id: "private-source", audit_status: "passed", visibility: "private" },
      { ...base, id: "blocked-premium", source_id: "premium-source", audit_status: "passed", visibility: "premium" },
      { ...base, id: "blocked-original", source_id: "original-source", audit_status: "passed", rendition_label: "original", is_original: true },
      { ...base, id: "blocked-moderation", source_id: "moderation-source", audit_status: "passed", moderation_status: "blocked" },
      {
        ...base,
        id: "blocked-wrong-prefix",
        source_id: "wrong-prefix-source",
        audit_status: "passed",
        public_playback_path: "renditions/wrong-prefix/master.m3u8",
        manifest_path: "renditions/wrong-prefix/master.m3u8",
        variant_playlist_path: "renditions/wrong-prefix/480p/index.m3u8",
      },
    );
  }

  return rows;
}

export function buildMediaCdnRolloutPlan(rows, options, playbackCdnEligibility) {
  const maxBatchSize = toInteger(options.maxBatchSize, 0);
  const deniedSourceIds = new Set((options.deniedSourceIds ?? []).map(toText).filter(Boolean));
  const backupGate = options.backupGate ?? {
    status: "closed_for_latest_manual_backup",
    latestBackupVerified: true,
    restoreDrillPassed: true,
  };
  const failures = [];
  if (maxBatchSize <= 0) failures.push("max_batch_size_required");

  const baseConfig = {
    enabled: true,
    killSwitch: false,
    rolloutMode: "trusted_public",
    allowedSourceIds: [],
    deniedSourceIds: Array.from(deniedSourceIds),
    playbackDeliveryProvider: "cloudflare_r2_custom_domain",
    maxBatchSize: 0,
    percentRollout: 0,
    cdnBaseUrl: "https://media.chillywoodstream.com",
    cdnPublicPlaybackPrefix: "playback/public/",
    cdnPrivatePlaybackDisabled: true,
    cdnSigningMode: "off",
    requireAuditPassed: true,
    requireBackupFresh: true,
    fallbackToOrigin: true,
    backupGate,
  };

  const eligibleRows = [];
  const blockedReasonCounts = {};
  for (const row of rows) {
    const eligibility = playbackCdnEligibility.canUseAuditedPublicRenditionForCdnPlayback(row, baseConfig);
    if (eligibility.cdnEligible && !deniedSourceIds.has(row.source_id)) {
      eligibleRows.push(row);
    } else {
      const reason = deniedSourceIds.has(row.source_id)
        ? "source_denied"
        : eligibility.blockedReason ?? "unknown_block";
      blockedReasonCounts[reason] = (blockedReasonCounts[reason] ?? 0) + 1;
    }
  }

  const selectedRows = eligibleRows.slice(0, Math.max(0, maxBatchSize));
  const rollbackPlan = selectedRows.map((row) => {
    const manifestPath = toText(row.manifest_path);
    return {
      source_id: row.source_id,
      rendition_id: row.id,
      exact_manifest_path: manifestPath,
      exact_output_prefix: manifestPath.split("/").slice(0, -1).join("/"),
      rollback_scope: "exact_source_and_prefix_only",
    };
  });

  return {
    mode: "plan",
    proofOnly: true,
    mutationAttempted: false,
    productionPlaybackSwitched: false,
    productionBackfillRun: false,
    continuousWorkerEnabled: false,
    inputRowCount: rows.length,
    eligibleRowCount: eligibleRows.length,
    selectedBatchSize: selectedRows.length,
    maxBatchSize,
    maxBatchCapEnforced: maxBatchSize > 0 && selectedRows.length <= maxBatchSize,
    blockedReasonCounts,
    deniedSourceIds: Array.from(deniedSourceIds),
    selectedSourceIds: selectedRows.map((row) => row.source_id),
    rollbackPlanRequired: true,
    rollbackPlan,
    failures,
  };
}

export function sanitizeMediaCdnRolloutPlan(plan) {
  return {
    mode: plan.mode,
    proofOnly: plan.proofOnly,
    mutationAttempted: plan.mutationAttempted,
    productionPlaybackSwitched: plan.productionPlaybackSwitched,
    productionBackfillRun: plan.productionBackfillRun,
    continuousWorkerEnabled: plan.continuousWorkerEnabled,
    inputRowCount: plan.inputRowCount,
    eligibleRowCount: plan.eligibleRowCount,
    selectedBatchSize: plan.selectedBatchSize,
    maxBatchSize: plan.maxBatchSize,
    maxBatchCapEnforced: plan.maxBatchCapEnforced,
    blockedReasonCounts: plan.blockedReasonCounts,
    deniedSourceIds: plan.deniedSourceIds,
    selectedSourceIds: plan.selectedSourceIds,
    rollbackPlanRequired: plan.rollbackPlanRequired,
    rollbackPlanCount: plan.rollbackPlan.length,
    failures: plan.failures,
  };
}

async function main() {
  const args = parseArgs();
  const mode = toText(args.mode) || "plan";
  const loaded = loadEligibilityHelpers();
  try {
    const fixtureRows = buildRolloutFixtureRows(loaded.renditionMetadata, {
      eligibleCount: toInteger(args["fixture-eligible-count"], mode === "status" ? 1 : 10),
      includeBlocked: args["include-blocked"] !== "false",
    });
    const plan = buildMediaCdnRolloutPlan(
      fixtureRows,
      {
        maxBatchSize: toInteger(args["max-batch-size"], 0),
        deniedSourceIds: toText(args["denied-source-ids"]).split(",").filter(Boolean),
      },
      loaded.playbackCdnEligibility,
    );
    const summary = sanitizeMediaCdnRolloutPlan(plan);
    if (mode === "status") {
      summary.status = "planner_available_proof_only_no_mutation";
    }
    console.log(JSON.stringify(summary, null, 2));
    if (plan.failures.length) process.exit(1);
  } finally {
    loaded.cleanup();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(JSON.stringify({
      error: "media_cdn_rollout_planner_failed",
      message: error instanceof Error ? error.message : "unknown_error",
    }, null, 2));
    process.exit(1);
  });
}
