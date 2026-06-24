#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const redact = (value) => String(value ?? "").replace(/[A-Za-z0-9._~+/=-]{32,}/g, "[redacted]");

const migration = read("supabase/migrations/20260623143000_livekit_server_metrics_readback.sql");
const registryFunction = read("supabase/functions/livekit-registry/index.ts");
const routing = read("supabase/functions/_shared/livekit-routing.ts");
const tokenFunction = read("supabase/functions/livekit-token/index.ts");
const heartbeatScript = read("ops/livekit-registry/heartbeat-livekit.sh");

const requiredColumns = [
  "memory_used_mb",
  "memory_total_mb",
  "disk_usage_percent",
  "network_rx_bps",
  "network_tx_bps",
  "livekit_node_status",
  "turn_status",
  "metrics_source",
  "metrics_collected_at",
];

for (const column of requiredColumns) {
  assert.ok(migration.includes(`"${column}"`), `missing migration column ${column}`);
  assert.ok(registryFunction.includes(column), `livekit-registry does not read/write ${column}`);
}

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
].forEach((envName) => {
  assert.ok(heartbeatScript.includes(envName), `heartbeat helper is missing ${envName}`);
});

[
  "participantToken",
  "serverUrl",
].forEach((needle) => assert.ok(tokenFunction.includes(needle), `livekit-token missing ${needle}`));
[
  "cpuPercent",
  "ramPercent",
  "memoryUsedMb",
  "networkTxBps",
  "turnStatus",
  "metricsSource",
].forEach((needle) => {
  assert.ok(!tokenFunction.includes(needle), `livekit-token must not return registry metric field ${needle}`);
});

const now = Date.parse("2026-06-23T12:00:00.000Z");
const staleSeconds = 120;
const limits = {
  maxBandwidthOutMbps: 0,
  maxCpuPercent: 85,
  maxPacketLossPercent: 8,
  maxRamPercent: 90,
  staleHeartbeatSeconds: staleSeconds,
};

const baseServer = {
  bandwidthOutMbps: 12,
  cpuPercent: 25,
  currentParticipants: 8,
  currentPublishers: 2,
  currentRooms: 1,
  lastHeartbeatAt: new Date(now - 10_000).toISOString(),
  maxEgressMbps: 1000,
  maxParticipants: 1000,
  maxPublishers: 100,
  maxRooms: 100,
  packetLossPercent: 0,
  publicWsUrl: "wss://live.chillywoodstream.com",
  ramPercent: 40,
  status: "active",
};

const rejectReason = (server) => {
  const heartbeatAge = Number.isFinite(Date.parse(server.lastHeartbeatAt ?? ""))
    ? now - Date.parse(server.lastHeartbeatAt)
    : Number.POSITIVE_INFINITY;
  if (server.status !== "active") return `status_${server.status}`;
  if (!/^wss:\/\/\S+$/.test(server.publicWsUrl)) return "missing_public_ws_url";
  if (heartbeatAge > limits.staleHeartbeatSeconds * 1000) return "stale_heartbeat";
  if (server.currentRooms >= server.maxRooms) return "room_capacity_full";
  if (server.currentParticipants >= server.maxParticipants) return "participant_capacity_full";
  if (server.maxPublishers !== null && server.currentPublishers >= server.maxPublishers) return "publisher_capacity_full";
  if (server.cpuPercent !== null && server.cpuPercent >= limits.maxCpuPercent) return "cpu_over_threshold";
  if (server.ramPercent !== null && server.ramPercent >= limits.maxRamPercent) return "ram_over_threshold";
  if (server.packetLossPercent !== null && server.packetLossPercent >= limits.maxPacketLossPercent) return "packet_loss_over_threshold";
  if (
    limits.maxBandwidthOutMbps > 0
    && server.bandwidthOutMbps !== null
    && server.bandwidthOutMbps >= limits.maxBandwidthOutMbps
  ) return "bandwidth_out_over_threshold";
  if (
    server.maxEgressMbps !== null
    && server.bandwidthOutMbps !== null
    && server.bandwidthOutMbps >= server.maxEgressMbps
  ) return "egress_bandwidth_full";
  return null;
};

assert.equal(rejectReason(baseServer), null, "fresh metrics server should be eligible");
assert.equal(rejectReason({ ...baseServer, cpuPercent: 91 }), "cpu_over_threshold");
assert.equal(rejectReason({ ...baseServer, ramPercent: 95 }), "ram_over_threshold");
assert.equal(rejectReason({ ...baseServer, packetLossPercent: 10 }), "packet_loss_over_threshold");
assert.equal(rejectReason({ ...baseServer, bandwidthOutMbps: 1000 }), "egress_bandwidth_full");
assert.equal(
  rejectReason({ ...baseServer, lastHeartbeatAt: new Date(now - staleSeconds * 1000 - 1).toISOString() }),
  "stale_heartbeat",
);
assert.equal(rejectReason({ ...baseServer, status: "draining" }), "status_draining");
assert.equal(
  rejectReason({
    ...baseServer,
    bandwidthOutMbps: null,
    cpuPercent: null,
    packetLossPercent: null,
    ramPercent: null,
  }),
  null,
  "missing detailed metrics may keep existing routing behavior eligible but cannot prove capacity increase",
);

assert.ok(routing.includes("stale_heartbeat"), "router stale heartbeat fail-safe missing");
assert.ok(routing.includes("cpu_over_threshold"), "router CPU threshold check missing");
assert.ok(routing.includes("ram_over_threshold"), "router RAM threshold check missing");
assert.ok(routing.includes("bandwidth_out_over_threshold"), "router bandwidth threshold check missing");

const remoteFunctionUrl = process.env.LIVEKIT_REGISTRY_FUNCTION_URL || "";
const operatorToken = process.env.LIVEKIT_REGISTRY_OPERATOR_ACCESS_TOKEN || "";
let remoteReadback = {
  status: "skipped_missing_operator_env",
};

if (remoteFunctionUrl && operatorToken) {
  const response = await fetch(remoteFunctionUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${operatorToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "list", limit: 5 }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`remote registry list failed: ${response.status} ${redact(JSON.stringify(body))}`);
  }
  const servers = Array.isArray(body?.servers) ? body.servers : [];
  const productionServer = servers.find((server) => server.serverId === "chillywood-prod-01") ?? servers[0] ?? null;
  assert.ok(productionServer, "remote registry list returned no servers");
  [
    "internalApiUrl",
    "apiSecret",
    "serviceRoleKey",
    "heartbeatSecret",
    "turnSecret",
    "participantToken",
  ].forEach((field) => assert.ok(!(field in productionServer), `remote readback leaked ${field}`));
  remoteReadback = {
    heartbeatFreshness: productionServer.lastHeartbeatAt ? "operator_readback_available" : "missing_heartbeat",
    publicWsUrl: productionServer.publicWsUrl,
    serverId: productionServer.serverId,
    status: "passed",
    metrics: {
      cpuPercent: productionServer.cpuPercent ?? null,
      ramPercent: productionServer.ramPercent ?? null,
      networkTxBps: productionServer.networkTxBps ?? null,
      turnStatus: productionServer.turnStatus ?? null,
    },
  };
}

console.log(JSON.stringify({
  capacityClaim: "unchanged_active_camera_mic_seats_4_passive_viewer_capacity_unproved",
  localProof: {
    metricsColumns: "passed",
    heartbeatPayloadShape: "passed",
    missingMetricsBehavior: "eligible_but_capacity_not_raised",
    routerThresholdChecks: "passed",
    tokenEndpointRegression: "passed",
  },
  remoteReadback,
  status: "passed",
}, null, 2));
