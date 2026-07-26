#!/usr/bin/env node

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { ANDROID_PRODUCTION_RELEASE_MANIFEST } from "../supabase/functions/_shared/release-manifest-contract.generated.mjs";
import { sanitizeAutonomousReadback } from "../supabase/functions/_shared/ios-autonomous-operator-policy.mjs";

const text = (value) => String(value ?? "").trim();
const firstPresent = (...names) => names.map((name) => process.env[name]).find((value) => text(value)) ?? "";
const parseJson = (value) => {
  const raw = text(value);
  for (const marker of ["[", "{"]) {
    const index = raw.indexOf(marker);
    if (index >= 0) try { return JSON.parse(raw.slice(index)); } catch { /* never emit raw provider output */ }
  }
  return null;
};
const runJson = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024, timeout: 90_000 });
  const data = result.status === 0 ? parseJson(result.stdout) : null;
  return { ok: result.status === 0 && data !== null, data };
};

const easCommand = firstPresent("EAS_CLI_BIN") || "eas";
const builds = runJson(easCommand, ["build:list", "--platform", "android", "--limit", "20", "--json", "--non-interactive"]);
const channel = runJson(easCommand, ["channel:view", ANDROID_PRODUCTION_RELEASE_MANIFEST.channel, "--json", "--non-interactive"]);
const buildRows = Array.isArray(builds.data) ? builds.data : [];
const latest = buildRows[0] ?? null;
const updateRows = Array.isArray(channel.data?.branches)
  ? channel.data.branches.flatMap((branch) => Array.isArray(branch?.updates) ? branch.updates : [])
  : Array.isArray(channel.data?.updates) ? channel.data.updates : [];
const compatible = updateRows.filter((row) => text(row?.runtimeVersion) === ANDROID_PRODUCTION_RELEASE_MANIFEST.runtimeVersion);
const eas = builds.ok && channel.ok ? {
  readbackComplete: true,
  platform: latest?.platform ? text(latest.platform).toLowerCase() : null,
  buildId: latest?.id ?? null,
  appVersion: latest?.appVersion ?? null,
  channel: latest?.channel ?? channel.data?.name ?? null,
  runtimeVersion: latest?.runtimeVersion ?? compatible[0]?.runtimeVersion ?? null,
  sourceCommit: latest?.gitCommitHash ?? null,
  updateId: compatible[0]?.id ?? null,
  updateGroup: compatible[0]?.group ?? compatible[0]?.groupId ?? null,
  processingStatus: latest?.status ?? null,
} : {
  readbackComplete: false,
  reason: !builds.ok ? "eas_android_build_readback_unavailable" : "eas_android_channel_readback_unavailable",
};

const sanitizedPlayPath = firstPresent("GOOGLE_PLAY_SANITIZED_RELEASE_READBACK_PATH");
let googlePlay = { readbackComplete: false, reason: "google_play_sanitized_readback_unavailable" };
if (sanitizedPlayPath && fs.existsSync(sanitizedPlayPath)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(sanitizedPlayPath, "utf8"));
    if (parsed?.packageIdentifier === ANDROID_PRODUCTION_RELEASE_MANIFEST.packageIdentifier && parsed?.readbackComplete === true) {
      googlePlay = {
        readbackComplete: true,
        packageIdentifier: text(parsed.packageIdentifier),
        appVersion: text(parsed.appVersion) || null,
        nativeBuild: text(parsed.nativeBuild) || null,
        distributionSource: text(parsed.distributionSource) || "google_play_internal",
        track: text(parsed.track) || null,
        releaseStatus: text(parsed.releaseStatus) || null,
      };
    }
  } catch {
    googlePlay = { readbackComplete: false, reason: "google_play_sanitized_readback_invalid" };
  }
}

process.stdout.write(`${JSON.stringify(sanitizeAutonomousReadback({ eas, googlePlay }))}\n`);
