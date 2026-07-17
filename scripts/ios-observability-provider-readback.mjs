#!/usr/bin/env node

import { spawnSync } from "node:child_process";

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
const readback = {
  firebase: {
    projectReadbackComplete: firebaseProjectAvailable,
    crashlyticsReadbackComplete: false,
    performanceReadbackComplete: false,
    analyticsReadbackComplete: false,
    reason: firebaseProjectAvailable ? "metric_api_adapter_not_configured" : firebaseApps.reason ?? "firebase_provider_unavailable",
  },
  supabaseEdgeFunctions: {
    readbackComplete: false,
    reason: "sanitized_edge_log_export_not_configured",
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
