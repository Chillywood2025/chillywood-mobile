#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { sanitizeAutonomousReadback } from "../supabase/functions/_shared/ios-autonomous-operator-policy.mjs";

const run = (args) => {
  const result = spawnSync(process.execPath, ["scripts/ios-observability-provider-readback.mjs", ...args], { cwd: process.cwd(), encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"], timeout: 90_000 });
  if (result.status !== 0) return { firebase: { crashlyticsReadbackComplete: false, performanceReadbackComplete: false, analyticsReadbackComplete: false, reason: "provider_adapter_unavailable" }, supabaseEdgeFunctions: { readbackComplete: false, reason: "sanitized_edge_log_export_not_configured" } };
  try { return JSON.parse(result.stdout); } catch { return { firebase: { crashlyticsReadbackComplete: false, performanceReadbackComplete: false, analyticsReadbackComplete: false, reason: "provider_adapter_invalid" }, supabaseEdgeFunctions: { readbackComplete: false, reason: "sanitized_edge_log_export_not_configured" } }; }
};
const ios = run([]);
const android = run(["--android"]);
const providerReadback = sanitizeAutonomousReadback({ ios, android, shared: { supabaseEdgeFunctions: ios.supabaseEdgeFunctions ?? { readbackComplete: false, reason: "sanitized_edge_log_export_not_configured" } } });
if (!process.argv.includes("--post")) {
  process.stdout.write(`${JSON.stringify(providerReadback)}\n`);
  process.exit(0);
}
const functionsBaseUrl = String(process.env.SUPABASE_FUNCTIONS_URL ?? "").trim().replace(/\/$/u, "");
const endpoint = String(process.env.OBSERVABILITY_OPERATOR_FUNCTION_URL ?? "").trim()
  || (functionsBaseUrl ? `${functionsBaseUrl}/observability-operator` : "");
const operatorToken = String(process.env.OBSERVABILITY_OPERATOR_TOKEN ?? "").trim();
if (!endpoint || !operatorToken) {
  process.stdout.write(`${JSON.stringify({ ok: false, reason: "operator_access_missing" })}\n`);
  process.exit(2);
}
const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "x-observability-operator-token": operatorToken }, body: JSON.stringify({ action: "watch_once", platform: "shared", source: "systemd_all_platform_provider_adapter", scheduler: "systemd_timer", provider_readback: providerReadback }) });
let body = {};
try { body = await response.json(); } catch { /* never emit raw response */ }
process.stdout.write(`${JSON.stringify({ ok: response.ok && body?.ok === true, status: response.status, readbackComplete: body?.readbackComplete === true, healthState: body?.healthState ?? "unknown", platformResultCount: Array.isArray(body?.platformResults) ? body.platformResults.length : 0 })}\n`);
if (!response.ok) process.exitCode = 1;
