#!/usr/bin/env node
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const DEFAULT_STALE_SECONDS = 120;
const SERVER_ID = process.env.LIVEKIT_HEALTH_SERVER_ID || "chillywood-prod-01";
const WATCH_WINDOW_MINUTES = Number(process.env.LIVEKIT_HEALTH_AUDIT_WINDOW_MINUTES || 30);
const shouldInvokeMonitor = process.env.LIVEKIT_HEARTBEAT_MONITOR_INVOKE === "1";

const redact = (value) => String(value ?? "").replace(/[A-Za-z0-9._~+/=-]{32,}/g, "[redacted]");
const toNumber = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const requiredEnv = (name, fallback = "") => {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
};
const supabaseUrl = requiredEnv("SUPABASE_URL", process.env.EXPO_PUBLIC_SUPABASE_URL || "");
const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
const staleSeconds = Number(process.env.LIVEKIT_ROUTER_HEARTBEAT_STALE_SECONDS || DEFAULT_STALE_SECONDS);
const sinceIso = new Date(Date.now() - Math.max(1, WATCH_WINDOW_MINUTES) * 60_000).toISOString();

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function invokeMonitorIfRequested() {
  if (!shouldInvokeMonitor) {
    return { status: "skipped" };
  }

  const monitorUrl = requiredEnv("LIVEKIT_HEARTBEAT_MONITOR_FUNCTION_URL");
  const monitorSecret = requiredEnv("LIVEKIT_HEARTBEAT_MONITOR_SECRET");
  const response = await fetch(monitorUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-LiveKit-Heartbeat-Monitor-Token": monitorSecret,
    },
    body: JSON.stringify({
      server_id: SERVER_ID,
      source: "check-livekit-routing-health",
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    return {
      body,
      ok: false,
      status: response.status,
    };
  }
  return {
    body,
    ok: true,
    status: response.status,
  };
}

function isEligible(server, now = Date.now()) {
  const heartbeatAt = Date.parse(server.last_heartbeat_at || "");
  const heartbeatAgeSeconds = Number.isFinite(heartbeatAt)
    ? Math.max(0, Math.round((now - heartbeatAt) / 1000))
    : Number.POSITIVE_INFINITY;
  const maxPublishers = toNumber(server.max_publishers);
  const bandwidthOut = toNumber(server.bandwidth_out_mbps);
  const maxEgress = toNumber(server.max_egress_mbps);
  const reasons = [];

  if (server.status !== "active") reasons.push(`status_${server.status || "unknown"}`);
  if (!/^wss:\/\/\S+$/i.test(server.public_ws_url || "")) reasons.push("missing_public_ws_url");
  if (heartbeatAgeSeconds > staleSeconds) reasons.push("stale_heartbeat");
  if (Number(server.current_rooms || 0) >= Number(server.max_rooms || 1)) reasons.push("room_capacity_full");
  if (Number(server.current_participants || 0) >= Number(server.max_participants || 1)) reasons.push("participant_capacity_full");
  if (maxPublishers !== null && Number(server.current_publishers || 0) >= maxPublishers) reasons.push("publisher_capacity_full");
  if (toNumber(server.cpu_percent) !== null && toNumber(server.cpu_percent) >= 85) reasons.push("cpu_over_threshold");
  if (toNumber(server.ram_percent) !== null && toNumber(server.ram_percent) >= 90) reasons.push("ram_over_threshold");
  if (toNumber(server.packet_loss_percent) !== null && toNumber(server.packet_loss_percent) >= 8) reasons.push("packet_loss_over_threshold");
  if (maxEgress !== null && bandwidthOut !== null && bandwidthOut >= maxEgress) reasons.push("egress_bandwidth_full");

  return {
    eligible: reasons.length === 0,
    heartbeatAgeSeconds,
    reasons,
  };
}

const monitorResult = await invokeMonitorIfRequested();

const { data: servers, error: serversError } = await client
  .from("livekit_servers")
  .select("server_id,status,public_ws_url,last_heartbeat_at,current_rooms,current_participants,current_publishers,max_rooms,max_participants,max_publishers,cpu_percent,ram_percent,packet_loss_percent,bandwidth_out_mbps,max_egress_mbps,metrics_source,livekit_node_status,turn_status")
  .order("server_id", { ascending: true });

if (serversError) throw new Error(`livekit_servers read failed: ${serversError.message}`);

const evaluations = (servers || []).map((server) => ({
  server,
  state: isEligible(server),
}));
const production = evaluations.find((entry) => entry.server.server_id === SERVER_ID);
const eligibleCount = evaluations.filter((entry) => entry.state.eligible).length;
const staleCount = evaluations.filter((entry) => entry.state.reasons.includes("stale_heartbeat")).length;
const disabledCount = evaluations.filter((entry) => entry.server.status !== "active").length;

const [routingAudit, tokenAudit] = await Promise.all([
  client
    .from("livekit_routing_audit")
    .select("event_type,reason,created_at")
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(100),
  client
    .from("livekit_token_request_audit")
    .select("surface,outcome,error_code,room_join,can_subscribe,created_at")
    .in("surface", ["watch-party-live", "live-stage"])
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .limit(100),
]);

if (routingAudit.error) throw new Error(`livekit_routing_audit read failed: ${routingAudit.error.message}`);
if (tokenAudit.error) throw new Error(`livekit_token_request_audit read failed: ${tokenAudit.error.message}`);

const noEligibleCount = (routingAudit.data || [])
  .filter((row) => row.event_type === "no_eligible_server")
  .length;
const tokenSummary = (tokenAudit.data || []).reduce((summary, row) => {
  const key = `${row.surface}:${row.outcome}${row.error_code ? `:${row.error_code}` : ""}`;
  summary[key] = (summary[key] || 0) + 1;
  return summary;
}, {});

const output = {
  monitorInvoke: monitorResult.ok === false
    ? {
        error: monitorResult.body?.error || "monitor_failed",
        status: monitorResult.status,
      }
    : {
        status: monitorResult.status || monitorResult.status === 0 ? monitorResult.status : monitorResult.status ?? "skipped",
        ok: monitorResult.ok ?? false,
      },
  routingHealth: {
    disabledServerCount: disabledCount,
    eligibleServerCount: eligibleCount,
    noEligibleServerCountRecent: noEligibleCount,
    staleHeartbeatCount: staleCount,
    staleHeartbeatSeconds: staleSeconds,
    tokenSummary,
    windowMinutes: WATCH_WINDOW_MINUTES,
  },
  server: production
    ? {
        currentParticipants: Number(production.server.current_participants || 0),
        currentPublishers: Number(production.server.current_publishers || 0),
        currentRooms: Number(production.server.current_rooms || 0),
        heartbeatAgeSeconds: production.state.heartbeatAgeSeconds,
        livekitNodeStatus: production.server.livekit_node_status,
        metricsSource: production.server.metrics_source,
        publicWsUrl: production.server.public_ws_url,
        rejectionReasons: production.state.reasons,
        serverId: production.server.server_id,
        status: production.server.status,
        turnStatus: production.server.turn_status,
      }
    : null,
};

console.log(JSON.stringify(output, null, 2));

assert.ok(production, `${SERVER_ID} is not registered`);
assert.equal(production.server.status, "active", `${SERVER_ID} must be active`);
assert.ok(
  Number.isFinite(production.state.heartbeatAgeSeconds) && production.state.heartbeatAgeSeconds <= staleSeconds,
  `${SERVER_ID} heartbeat is stale: ${production.state.heartbeatAgeSeconds}s > ${staleSeconds}s`,
);
assert.equal(eligibleCount > 0, true, "production has zero eligible LiveKit servers");
assert.equal(production.state.eligible, true, `${SERVER_ID} is not eligible: ${production.state.reasons.join(",")}`);
