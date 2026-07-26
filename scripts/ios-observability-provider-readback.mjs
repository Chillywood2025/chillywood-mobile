#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { normalizeSanitizedObservabilityExport } from "./observability-sanitized-readback.mjs";

const runJson = (command, args) => {
  const result = spawnSync(command, args, { encoding: "utf8", env: process.env, maxBuffer: 2 * 1024 * 1024 });
  if (result.status !== 0) return { ok: false, reason: `${command}_readback_unavailable` };
  try {
    return { ok: true, value: JSON.parse(result.stdout) };
  } catch {
    return { ok: false, reason: `${command}_readback_invalid_json` };
  }
};

const requestedPlatform = process.argv.includes("--android") ? "android" : "ios";
const firebasePlatform = requestedPlatform === "android" ? "ANDROID" : "IOS";
const firebaseApps = runJson("firebase", ["apps:list", firebasePlatform, "--json"]);
const firebaseProjectAvailable = firebaseApps.ok && JSON.stringify(firebaseApps.value).includes("com.chillywood.mobile");
const firstPresent = (...names) => names.map((name) => String(process.env[name] ?? "").trim()).find(Boolean) ?? "";
const readSanitizedExport = (path, platform) => {
  if (!path || !fs.existsSync(path)) return { readbackComplete: false, reason: "sanitized_export_unavailable" };
  try {
    return normalizeSanitizedObservabilityExport(JSON.parse(fs.readFileSync(path, "utf8")), platform);
  } catch {
    return { readbackComplete: false, reason: "sanitized_export_invalid" };
  }
};
const firebaseExportPath = requestedPlatform === "android"
  ? firstPresent("FIREBASE_ANDROID_OBSERVABILITY_READBACK_PATH", "FIREBASE_OBSERVABILITY_READBACK_PATH")
  : firstPresent("FIREBASE_IOS_OBSERVABILITY_READBACK_PATH", "FIREBASE_OBSERVABILITY_READBACK_PATH");
const firebaseExport = readSanitizedExport(firebaseExportPath, requestedPlatform);
const edgeExportPath = requestedPlatform === "android"
  ? firstPresent("SUPABASE_ANDROID_EDGE_OBSERVABILITY_READBACK_PATH")
  : firstPresent("SUPABASE_IOS_EDGE_OBSERVABILITY_READBACK_PATH");
const edgeExport = readSanitizedExport(edgeExportPath, requestedPlatform);
const readback = {
  firebase: {
    projectReadbackComplete: firebaseProjectAvailable,
    crashlyticsReadbackComplete: firebaseExport.crashlyticsReadbackComplete === true,
    performanceReadbackComplete: firebaseExport.performanceReadbackComplete === true,
    analyticsReadbackComplete: firebaseExport.analyticsReadbackComplete === true,
    nativeCrashCount: firebaseExport.nativeCrashCount ?? 0,
    jsFatalCount: firebaseExport.jsFatalCount ?? 0,
    startupFailureCount: firebaseExport.startupFailureCount ?? 0,
    performanceRegressionCount: firebaseExport.performanceRegressionCount ?? 0,
    analyticsDeliveryFailureCount: firebaseExport.analyticsDeliveryFailureCount ?? 0,
    reason: !firebaseProjectAvailable ? firebaseApps.reason ?? "firebase_provider_unavailable" : firebaseExport.reason ?? null,
  },
  supabaseEdgeFunctions: {
    readbackComplete: edgeExport.readbackComplete === true,
    errorRatePercent: edgeExport.errorRatePercent ?? null,
    reason: edgeExport.reason ?? null,
  },
};

if (!process.argv.includes("--post")) {
  process.stdout.write(`${JSON.stringify(readback)}\n`);
  process.exit(0);
}

const endpoint = process.env.OBSERVABILITY_OPERATOR_FUNCTION_URL;
const operatorToken = process.env.OBSERVABILITY_OPERATOR_TOKEN;
if (!endpoint || !operatorToken) {
  process.stderr.write("observability_operator_adapter_configuration_missing\n");
  process.exit(2);
}
const response = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json", "x-observability-operator-token": operatorToken },
  body: JSON.stringify({
    action: "watch_once",
    platform: requestedPlatform,
    source: "systemd_read_only_provider_adapter",
    scheduler: process.env.OBSERVABILITY_OPERATOR_SCHEDULER ?? "observability-operator.timer",
    provider_readback: readback,
  }),
});
if (!response.ok) {
  process.stderr.write(`observability_operator_watch_once_failed:${response.status}\n`);
  process.exit(1);
}
const body = await response.json();
process.stdout.write(`${JSON.stringify({ ok: body.ok === true, platform: body.platform, readbackComplete: body.readbackComplete, healthState: body.healthState })}\n`);
