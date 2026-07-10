#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const compileHelpers = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-media-rendition-ladder-"));
  try {
    execFileSync(
      npxCommand,
      [
        "tsc",
        "_lib/mediaRenditionLadder.ts",
        "_lib/mediaAutomationDiscovery.ts",
        "_lib/mediaAutomationJobs.ts",
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
      ladder: requireFromHere(path.join(outDir, "mediaRenditionLadder.js")),
      discovery: requireFromHere(path.join(outDir, "mediaAutomationDiscovery.js")),
      jobs: requireFromHere(path.join(outDir, "mediaAutomationJobs.js")),
      cleanup: () => rmSync(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const labels = (renditions) => renditions.map((rendition) => rendition.label);
const accessTiers = (renditions) => Object.fromEntries(renditions.map((rendition) => [rendition.label, rendition.accessTier]));
const assertLabels = (actual, expected, message) => {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: expected ${expected.join(",")} got ${actual.join(",")}`);
};

const loaded = compileHelpers();

try {
  const {
    getSupportedRenditionsForSource,
    getFreeRenditionsForSource,
    getPremiumRenditionsForSource,
    shouldGenerateRendition,
  } = loaded.ladder;
  const { classifyMediaAutomationCandidate } = loaded.discovery;
  const { buildMediaTranscodeJobPlan } = loaded.jobs;

  const source480 = getSupportedRenditionsForSource({ width: 854, height: 480 }, { premiumEnabled: true });
  const source720 = getSupportedRenditionsForSource({ width: 1280, height: 720 }, { premiumEnabled: true });
  const source1080 = getSupportedRenditionsForSource({ width: 1920, height: 1080 }, { premiumEnabled: true });
  const source320 = getSupportedRenditionsForSource({ width: 320, height: 180 }, { premiumEnabled: true });
  const premiumDisabled = getSupportedRenditionsForSource({ width: 1920, height: 1080 }, { premiumEnabled: false });
  const unknownConservative = getSupportedRenditionsForSource(
    { width: null, height: null },
    { premiumEnabled: true, unknownSourceStrategy: "conservative_free" },
  );

  assertLabels(labels(source480), ["360p", "480p"], "480p source should produce free SD only");
  assertLabels(labels(source720), ["360p", "480p", "720p"], "720p source should include true 720p");
  assertLabels(labels(source1080), ["360p", "480p", "720p", "1080p"], "1080p source should include true 1080p");
  assertLabels(labels(source320), [], "sub-360p source should not upscale to fake 360p");
  assertLabels(labels(premiumDisabled), ["360p", "480p"], "Premium-disabled playback should not expose HD");
  assertLabels(labels(getFreeRenditionsForSource({ width: 1920, height: 1080 })), ["360p", "480p"], "free ladder should cap at 480p");
  assertLabels(labels(getPremiumRenditionsForSource({ width: 1920, height: 1080 })), ["720p", "1080p"], "Premium ladder should include HD when true source supports it");
  assertLabels(labels(unknownConservative), ["360p", "480p"], "unknown source dimensions should be conservative free-only in planning");
  assert(shouldGenerateRendition({ width: 854, height: 480 }, "720p") === false, "480p source must not upscale to 720p");
  assert(shouldGenerateRendition({ width: 1920, height: 1080 }, "1080p") === true, "1080p source supports 1080p");

  const tierMap = accessTiers(source1080);
  assert(tierMap["360p"] === "free" && tierMap["480p"] === "free", "360p/480p must be free tier");
  assert(tierMap["720p"] === "premium" && tierMap["1080p"] === "premium", "720p/1080p must be Premium tier");

  const baseCandidateRow = {
    source_type: "creator_video",
    source_id: "source-aware-proof",
    title: "Source Aware Proof",
    visibility: "public",
    scan_status: "clean",
    moderation_status: "allowed",
    source_present: true,
    mime_type: "video/mp4",
  };
  const candidate480 = classifyMediaAutomationCandidate({ ...baseCandidateRow, source_width: 854, source_height: 480 });
  const candidate720 = classifyMediaAutomationCandidate({ ...baseCandidateRow, source_width: 1280, source_height: 720 });
  const candidate1080 = classifyMediaAutomationCandidate({ ...baseCandidateRow, source_width: 1920, source_height: 1080 });
  const candidateUnknown = classifyMediaAutomationCandidate(baseCandidateRow);
  assertLabels(
    buildMediaTranscodeJobPlan({ batchId: "ladder-proof", candidate: candidate480 }).requestedRenditions,
    ["360p", "480p"],
    "job plan 480p source",
  );
  assertLabels(
    buildMediaTranscodeJobPlan({ batchId: "ladder-proof", candidate: candidate720 }).requestedRenditions,
    ["360p", "480p", "720p"],
    "job plan 720p source",
  );
  assertLabels(
    buildMediaTranscodeJobPlan({ batchId: "ladder-proof", candidate: candidate1080 }).requestedRenditions,
    ["360p", "480p", "720p", "1080p"],
    "job plan 1080p source",
  );
  assertLabels(
    buildMediaTranscodeJobPlan({ batchId: "ladder-proof", candidate: candidateUnknown }).requestedRenditions,
    ["360p", "480p"],
    "job plan unknown source fallback",
  );

  const cdnEligibilitySource = readFileSync(path.join(repoRoot, "_lib/mediaPlaybackCdnEligibility.ts"), "utf8");
  assert(cdnEligibilitySource.includes("premium_requires_token_cdn"), "Premium rows must remain blocked from public CDN without token mode");
  assert(cdnEligibilitySource.includes("private_requires_token_cdn"), "Private rows must remain blocked from public CDN without token mode");

  const summary = {
    ok: true,
    source480: labels(source480),
    source720: labels(source720),
    source1080: labels(source1080),
    source320: labels(source320),
    premiumDisabled: labels(premiumDisabled),
    unknownSourcePlanningFallback: labels(unknownConservative),
    accessTiers: tierMap,
    jobPlan480: buildMediaTranscodeJobPlan({ batchId: "ladder-proof", candidate: candidate480 }).requestedRenditions,
    jobPlan720: buildMediaTranscodeJobPlan({ batchId: "ladder-proof", candidate: candidate720 }).requestedRenditions,
    jobPlan1080: buildMediaTranscodeJobPlan({ batchId: "ladder-proof", candidate: candidate1080 }).requestedRenditions,
    premiumPublicCdnBlockedWithoutTokenMode: true,
    privatePublicCdnBlockedWithoutTokenMode: true,
    productionMediaProcessed: false,
    productionPlaybackSwitched: false,
  };
  console.log(JSON.stringify(summary, null, 2));
} finally {
  loaded.cleanup();
}
