#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`LiveKit heartbeat monitor guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const monitor = read("supabase/functions/livekit-heartbeat-monitor/index.ts");
const seatEnforcement = read("supabase/functions/_shared/livekit-seat-session-enforcement.ts");
const heartbeat = read("ops/livekit-registry/heartbeat-livekit.sh");
const service = read("ops/livekit-registry/systemd/livekit-heartbeat-monitor.service");
const timer = read("ops/livekit-registry/systemd/livekit-heartbeat-monitor.timer");
const healthScript = read("scripts/check-livekit-routing-health.mjs");
const packageJson = read("package.json");
const config = read("supabase/config.toml");

[
  "LIVEKIT_HEARTBEAT_MONITOR_SECRET",
  "RoomServiceClient",
  "checkHttpReachable",
  "recordHealthCheckedHeartbeat",
  "livekit_server_heartbeats",
  "livekit_servers",
  "health_checked_heartbeat",
  "public_endpoint_unreachable",
  "countLiveKitStateWithPaidSeatEnforcement",
  "resolve_watch_party_livekit_viewer_authority",
  "livekit_room_assignments",
  "watch_party_rooms",
  "communication_rooms",
  "readRoomAuthorityScope",
  "p_session_generation",
].forEach((needle) => assertIncludes(monitor, needle, "monitor function"));

[
  "listRooms()",
  "listParticipants(roomName)",
  "removeParticipant(",
  "authority_lookup_failed",
  "authority_malformed",
  "enforcementCause",
  "participant_removal_failed",
  "if (removed) continue",
  "!authority.allowed",
  "enforceWatchPartyAuthority",
  "roomScopeLookupFailed",
  "resolveRoomAuthorityScopeFromEvidence",
  "readLiveKitParticipantSessionGeneration",
  "sessionGeneration",
].forEach((needle) => assertIncludes(seatEnforcement, needle, "paid Seat active-session enforcement"));

[
  "X-LiveKit-Heartbeat-Monitor-Token",
  "SUPABASE_SERVICE_ROLE_KEY",
  "LIVEKIT_API_KEY",
  "LIVEKIT_API_SECRET",
].forEach((needle) => assertIncludes(monitor, needle, "monitor secret boundary"));

[
  "LIVEKIT_PUBLIC_WS_URL",
  "LIVEKIT_VERIFY_PUBLIC_URL",
  "LIVEKIT_PUBLIC_HEALTH_TIMEOUT_SECONDS",
].forEach((needle) => assertIncludes(heartbeat, needle, "host heartbeat preflight"));

[
  "Restart=always",
  "EnvironmentFile=",
  "LIVEKIT_HEARTBEAT_MONITOR_FUNCTION_URL",
].forEach((needle) => assertIncludes(service, needle, "systemd service"));

assertIncludes(timer, "OnUnitActiveSec=60s", "systemd timer cadence");
assertIncludes(timer, "Persistent=true", "systemd timer persistence");
assertIncludes(healthScript, "eligibleServerCount", "health script eligible count");
assertIncludes(healthScript, "heartbeatAgeSeconds", "health script heartbeat age");
assertIncludes(healthScript, "noEligibleServerCountRecent", "health script routing audit summary");
assertIncludes(healthScript, "livekit_token_request_audit", "health script token audit summary");
assertIncludes(packageJson, "\"check:livekit-routing-health\"", "package health script");
assertIncludes(packageJson, "\"guard:livekit-heartbeat-monitor-policy\"", "package guard script");
assertIncludes(config, "[functions.livekit-heartbeat-monitor]", "Supabase function config");

[
  "RevenueCat",
  "Stripe",
  "Google Play",
  "payout",
  "cashout",
  "ChillyChatFirebaseMessagingService",
  "nativeCallAction",
].forEach((needle) => {
  assertNotIncludes(monitor, needle, "monitor isolation");
  assertNotIncludes(heartbeat, needle, "heartbeat isolation");
  assertNotIncludes(service, needle, "systemd isolation");
});

if (process.exitCode) process.exit(process.exitCode);
console.log("LiveKit heartbeat monitor guard passed.");
