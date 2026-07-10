#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = process.cwd();
const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
const failures = [];
const requireProof = (condition, message) => {
  if (!condition) failures.push(message);
};

const compileLadder = () => {
  const outDir = mkdtempSync(path.join(os.tmpdir(), "chillywood-premium-hd-renditions-proof-"));
  try {
    execFileSync(npxCommand, [
      "tsc",
      "_lib/mediaRenditionLadder.ts",
      "--target", "ES2020",
      "--module", "commonjs",
      "--moduleResolution", "node",
      "--outDir", outDir,
      "--strict",
      "--skipLibCheck",
    ], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const requireFromHere = createRequire(import.meta.url);
    return {
      ladder: requireFromHere(path.join(outDir, "mediaRenditionLadder.js")),
      cleanup: () => rmSync(outDir, { recursive: true, force: true }),
    };
  } catch (error) {
    rmSync(outDir, { recursive: true, force: true });
    throw error;
  }
};

const labels = (entries) => entries.map((entry) => entry.label);
const migration = readFileSync(path.join(repoRoot, "supabase/migrations/20260710023000_media_premium_hd_protected_renditions.sql"), "utf8");
const cli = readFileSync(path.join(repoRoot, "scripts/media-premium-hd-cli.mjs"), "utf8");
const loaded = compileLadder();

try {
  const { getSupportedRenditionsForSource, getPremiumRenditionsForSource } = loaded.ladder;
  requireProof(labels(getPremiumRenditionsForSource({ width: 854, height: 480 })).length === 0, "480p City Lights source must not generate Premium HD");
  requireProof(JSON.stringify(labels(getSupportedRenditionsForSource({ width: 1280, height: 720 }, { premiumEnabled: true }))) === JSON.stringify(["360p", "480p", "720p"]), "720p source should generate 720p only for HD");
  requireProof(JSON.stringify(labels(getSupportedRenditionsForSource({ width: 1920, height: 1080 }, { premiumEnabled: true }))) === JSON.stringify(["360p", "480p", "720p", "1080p"]), "1080p source should generate 720p and 1080p");
  requireProof(JSON.stringify(labels(getSupportedRenditionsForSource({ width: 720, height: 1280 }, { premiumEnabled: true }))) === JSON.stringify(["360p", "480p", "720p", "1080p"]), "vertical HD source uses source height without fake upscale");

  requireProof(migration.includes('"protected_playback_path"'), "protected playback path column exists");
  requireProof(migration.includes('"is_protected_playback_safe"'), "protected playback safety flag exists");
  requireProof(migration.includes("'cloudflare_r2_premium_token'"), "Premium token delivery provider exists");
  requireProof(migration.includes("'protected_premium'"), "protected Premium bucket role exists");
  requireProof(migration.includes('"delivery_provider" <> \'cloudflare_r2_premium_token\''), "Premium token safety constraint exists");
  requireProof(migration.includes('"public_playback_path" like \'playback/public/%\''), "public CDN constraint remains scoped to playback/public");
  requireProof(migration.includes('"protected_playback_path" like \'playback/protected/premium/%\''), "Premium HD constraint requires protected prefix");
  requireProof(migration.includes('"is_public_playback_safe" = false'), "Premium HD rows are not unsigned-public-safe");
  requireProof(migration.includes('"rendition_label" in (\'720p\', \'1080p\')'), "Premium protected rows are HD only");

  requireProof(cli.includes("premium_hd_download"), "Premium HD CLI uses dedicated trusted backend download action");
  requireProof(cli.includes("playback/protected/premium/"), "Premium HD CLI writes protected prefix");
  requireProof(cli.includes("cloudflare_r2_premium_token"), "Premium HD CLI writes tokenized provider");
  requireProof(cli.includes("protected_premium"), "Premium HD CLI writes protected bucket role");
  requireProof(cli.includes("premium_hd_fake_upscale_refused"), "Premium HD CLI refuses fake upscale");
  requireProof(!cli.includes("playback/public/auto/${candidate.sourceType}/${candidate.sourceId}/${batchId}/720p"), "Premium HD CLI does not use public auto prefix for HD");

  const output = {
    status: "passed",
    cases: {
      cityLightsLowSourceNoHd: true,
      source720Gets720: true,
      source1080Gets720And1080: true,
      verticalOrientationAware: true,
      protectedSchemaSupported: true,
      unsignedPublicHdBlocked: true,
      noFakeUpscale: true,
    },
    noSecretsPrinted: true,
  };
  if (failures.length) throw new Error(`Premium HD rendition proof failed:\n- ${failures.join("\n- ")}`);
  console.log(JSON.stringify(output, null, 2));
} finally {
  loaded.cleanup();
}
