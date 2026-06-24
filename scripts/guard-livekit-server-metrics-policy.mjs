#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`LiveKit server metrics guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const sliceBetween = (source, startNeedle, endNeedle, label) => {
  const startIndex = source.indexOf(startNeedle);
  const endIndex = source.indexOf(endNeedle, startIndex + startNeedle.length);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    fail(`${label} boundary missing`);
    return "";
  }
  return source.slice(startIndex, endIndex);
};

const migration = read("supabase/migrations/20260623143000_livekit_server_metrics_readback.sql");
const registryFunction = read("supabase/functions/livekit-registry/index.ts");
const tokenFunction = read("supabase/functions/livekit-token/index.ts");
const routing = read("supabase/functions/_shared/livekit-routing.ts");
const heartbeatScript = read("ops/livekit-registry/heartbeat-livekit.sh");
const packageJson = read("package.json");
const runbook = read("docs/LIVEKIT_PRODUCTION_READINESS_RUNBOOK.md");
const simPolicy = read("docs/LIVEKIT_SIMULCAST_DYNACAST_POLICY.md");
const sharedRoom = read("_lib/watch-party/room-shared.ts");
const tokenContract = read("_lib/livekit/token-contract.ts");
const sanitizeServerBody = sliceBetween(
  registryFunction,
  "const sanitizeServer = (row: JsonObject) => ({",
  "const sanitizeAssignment = (row: JsonObject) => ({",
  "registry sanitizeServer",
);

[
  "memory_used_mb",
  "memory_total_mb",
  "disk_usage_percent",
  "network_rx_bps",
  "network_tx_bps",
  "livekit_node_status",
  "turn_status",
  "metrics_source",
  "metrics_collected_at",
].forEach((column) => {
  assertIncludes(migration, `"${column}"`, "metrics migration");
  assertIncludes(registryFunction, column, "livekit-registry metrics readback");
});

[
  "LIVEKIT_MEMORY_USED_MB",
  "LIVEKIT_MEMORY_TOTAL_MB",
  "LIVEKIT_DISK_USAGE_PERCENT",
  "LIVEKIT_NETWORK_RX_BPS",
  "LIVEKIT_NETWORK_TX_BPS",
  "LIVEKIT_NODE_STATUS",
  "LIVEKIT_TURN_STATUS",
  "LIVEKIT_METRICS_SOURCE",
  "LIVEKIT_METRICS_COLLECTED_AT",
].forEach((envName) => assertIncludes(heartbeatScript, envName, "heartbeat helper"));

assertIncludes(registryFunction, "safeMetricsSource", "registry metrics source sanitizer");
assertIncludes(registryFunction, "VALID_TURN_STATUSES", "registry TURN status sanitizer");
assertIncludes(registryFunction, "VALID_LIVEKIT_NODE_STATUSES", "registry node status sanitizer");
assertIncludes(registryFunction, "heartbeatTokenAllowed", "heartbeat auth boundary");
assertIncludes(registryFunction, "requireOperator", "operator auth boundary");

[
  "internal_api_url",
  "internalApiUrl",
  "apiSecret",
  "serviceRoleKey",
  "heartbeatSecret",
  "turnSecret",
  "participantToken",
  "privateKey",
].forEach((needle) => assertNotIncludes(sanitizeServerBody, needle, "registry sanitized server response"));

[
  "cpuPercent",
  "ramPercent",
  "memoryUsedMb",
  "networkTxBps",
  "turnStatus",
  "metricsSource",
].forEach((needle) => assertNotIncludes(tokenFunction, needle, "livekit-token client response"));

assertIncludes(tokenFunction, "participantToken", "token endpoint contract");
assertIncludes(tokenFunction, "serverUrl", "token endpoint contract");
assertIncludes(tokenContract, "participantToken", "mobile token contract");
assertIncludes(tokenContract, "serverUrl", "mobile token contract");
assertNotIncludes(tokenContract, "cpuPercent", "mobile token contract metrics leak");
assertNotIncludes(tokenContract, "turnStatus", "mobile token contract metrics leak");

assertIncludes(routing, "stale_heartbeat", "router stale fail-safe");
assertIncludes(routing, "cpu_over_threshold", "router CPU threshold");
assertIncludes(routing, "ram_over_threshold", "router RAM threshold");
assertIncludes(routing, "bandwidth_out_over_threshold", "router bandwidth threshold");
assertIncludes(routing, "egress_bandwidth_full", "router egress threshold");
assertNotIncludes(routing, "LIVEKIT_URL", "router hardcoded fallback");

assertIncludes(sharedRoom, "export const LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS = 4;", "active camera/mic cap");
assertIncludes(simPolicy, "Launch guidance remains 4 active speaker/camera seats", "capacity proof policy");
assertIncludes(runbook, "10-participant readiness: no 10-participant proof is claimed", "no load claim policy");
assertIncludes(runbook, "server metrics proof", "metrics proof runbook");

assertIncludes(packageJson, "\"guard:livekit-server-metrics-policy\"", "package guard script");
assertIncludes(packageJson, "\"proof:livekit-server-metrics\"", "package proof script");

[
  "RevenueCat",
  "Stripe",
  "Google Play",
  "payout",
].forEach((needle) => {
  assertNotIncludes(migration, needle, "metrics migration payment isolation");
  assertNotIncludes(registryFunction, needle, "registry payment isolation");
  assertNotIncludes(heartbeatScript, needle, "heartbeat payment isolation");
});

if (process.exitCode) process.exit(process.exitCode);
console.log("LiveKit server metrics guard passed.");
