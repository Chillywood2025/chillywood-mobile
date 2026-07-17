#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { sanitizeAutonomousReadback } from "../supabase/functions/_shared/ios-autonomous-operator-policy.mjs";

const text = (value) => String(value ?? "").trim();
const runAdapter = (relative) => {
  const result = spawnSync(process.execPath, [relative], { cwd: process.cwd(), encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"], timeout: 120_000, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) return { readbackComplete: false, reason: `${relative.includes("ios-") ? "ios" : "android"}_adapter_unavailable` };
  try { return JSON.parse(result.stdout); } catch { return { readbackComplete: false, reason: "adapter_output_invalid" }; }
};
const providerReadback = sanitizeAutonomousReadback({
  ios: runAdapter("scripts/ios-release-provider-readback.mjs"),
  android: runAdapter("scripts/android-release-provider-readback.mjs"),
});
if (!process.argv.includes("--post")) {
  process.stdout.write(`${JSON.stringify(providerReadback)}\n`);
  process.exit(0);
}
const baseUrl = text(process.env.SUPABASE_FUNCTIONS_URL).replace(/\/$/u, "");
const endpoint = text(process.env.RELEASE_OPERATOR_FUNCTION_URL) || (baseUrl ? `${baseUrl}/release-operator` : "");
const operatorToken = text(process.env.RELEASE_OPERATOR_TOKEN);
if (!endpoint || !operatorToken) {
  process.stdout.write(`${JSON.stringify({ ok: false, reason: "operator_access_missing" })}\n`);
  process.exit(2);
}
const response = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json", "x-release-operator-token": operatorToken },
  body: JSON.stringify({ action: "watch_once", platform: "shared", scheduler: "systemd_timer", operator_id: "release_ota_operator", source: "systemd_all_platform_provider_adapter", provider_readback: providerReadback }),
});
let body = {};
try { body = await response.json(); } catch { /* response body is never emitted raw */ }
process.stdout.write(`${JSON.stringify({ ok: response.ok && body?.ok === true, status: response.status, readbackComplete: body?.readbackComplete === true, healthState: body?.healthState ?? "unknown", platformResultCount: Array.isArray(body?.platformResults) ? body.platformResults.length : 0 })}\n`);
if (!response.ok) process.exitCode = 1;
