import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");
const fail = (message) => {
  console.error(`LiveKit autonomous operator guard failed: ${message}`);
  process.exit(1);
};
const assertIncludes = (source, needle, message) => {
  if (!source.includes(needle)) fail(message);
};
const assertNotIncludes = (source, needle, message) => {
  if (source.includes(needle)) fail(message);
};

const operatorModel = read("_lib/livekitAutonomousOperator.ts");
const operatorFunction = read("supabase/functions/livekit-operator/index.ts");
const migration = read("supabase/migrations/20260711043323_livekit_autonomous_operator.sql");
const player = read("app/player/[id].tsx");
const renderTelemetry = read("_lib/livekitRenderTelemetry.ts");
const packageJson = read("package.json");
const runbook = read("docs/LIVEKIT_PRODUCTION_READINESS_RUNBOOK.md");

assertIncludes(operatorModel, "LIVEKIT_AUTONOMOUS_OPERATOR_SURFACES", "operator model must enumerate all LiveKit surfaces");
assertIncludes(operatorModel, "party_room_live_sidecar", "operator must cover Party Room sidecar");
assertIncludes(operatorModel, "chat_call", "operator must cover chat-call surface");
assertIncludes(operatorModel, "stale_heartbeat", "operator must classify stale heartbeat");
assertIncludes(operatorModel, "function_blob_missing", "operator must classify missing Edge Function blob");
assertIncludes(operatorModel, "render_surface_flicker", "operator must classify render flicker");
assertIncludes(operatorModel, "owner_approval_required", "operator must encode owner approval actions");
assertIncludes(operatorModel, "level >= 3", "Level 3/4 actions must not auto-execute");

assertIncludes(operatorFunction, "x-livekit-operator-token", "operator function must require operator token header");
assertIncludes(operatorFunction, "LIVEKIT_OPERATOR_TOKEN_SHA256", "operator function must validate token hash");
assertIncludes(operatorFunction, "constantTimeEqual", "operator function must use constant-time token comparison");
assertIncludes(operatorFunction, "invokeHeartbeatMonitor", "safe recovery must call legitimate heartbeat monitor path");
assertIncludes(operatorFunction, "LIVEKIT_HEARTBEAT_MONITOR_FUNCTION_URL", "heartbeat monitor invoke URL must be server-side env");
assertIncludes(operatorFunction, "LIVEKIT_HEARTBEAT_MONITOR_SECRET", "heartbeat monitor secret must be server-side env");
assertIncludes(operatorFunction, "livekit_operator_events", "operator must write audit events");
assertIncludes(operatorFunction, "livekit_surface_health_snapshots", "operator must write health snapshots");
assertIncludes(operatorFunction, "livekit_operator_recovery_actions", "operator must write recovery actions");
assertIncludes(operatorFunction, "livekit_operator_learning_state", "operator must read learning state");
assertIncludes(operatorFunction, "operator_token_required", "missing/invalid operator token must be denied");

assertNotIncludes(operatorFunction, ".from(\"auth.", "operator must not mutate auth");
assertNotIncludes(operatorFunction, ".from(\"media_", "operator must not mutate media tables");
assertNotIncludes(operatorFunction, ".from(\"billing", "operator must not mutate billing tables");
assertNotIncludes(operatorFunction, ".from(\"revenue", "operator must not mutate RevenueCat/billing tables");
assertNotIncludes(operatorFunction, "participantToken", "operator must not return or log participant tokens");
assertNotIncludes(operatorFunction, "LIVEKIT_ROUTER_HEARTBEAT_STALE_SECONDS\", \"", "operator must not override stale heartbeat cutoff");
assertNotIncludes(operatorFunction, "last_heartbeat_at:", "operator must not manually write fake heartbeat timestamps");
assertNotIncludes(operatorFunction, ".from(\"livekit_servers\").update", "operator must not directly mark LiveKit servers healthy");

assertIncludes(migration, "enable row level security", "operator tables must have RLS enabled");
assertIncludes(migration, "revoke all on table public.livekit_operator_events from anon, authenticated", "client writes to events must be revoked");
assertIncludes(migration, "revoke all on table public.livekit_operator_recovery_actions from anon, authenticated", "client writes to recovery actions must be revoked");
assertIncludes(migration, "grant select, insert, update, delete on table public.livekit_operator_events to service_role", "service_role-only operator writes must be explicit");

assertIncludes(player, "WATCH_PARTY_LIVEKIT_FALLBACK_ROSTER_GRACE_MILLIS", "Player must debounce fallback roster flash");
assertIncludes(player, "shouldRenderWatchPartyLiveKitStableShell", "Player must use stable LiveKit shell during transient refresh");
assertIncludes(player, "shared-player-livekit-connecting-shell", "stable shell must be testable");
assertIncludes(player, "setWatchPartyLiveKitHardFallbackReason(reason === \"room_error\" ? \"room_error\" : null)", "room_error must remain hard fallback");

assertIncludes(renderTelemetry, "livekit_surface_mounted", "render telemetry must record surface mounted");
assertIncludes(renderTelemetry, "livekit_fallback_roster_shown", "render telemetry must record fallback roster");
assertIncludes(renderTelemetry, "livekit_token_contract_present", "render telemetry must record token contract presence");
assertIncludes(renderTelemetry, "livekit_camera_preparing_state", "render telemetry must record camera preparing state");
assertIncludes(renderTelemetry, "sanitizeLiveKitRenderTelemetryPayload", "render telemetry must sanitize payloads");
assertIncludes(renderTelemetry, "normalized.includes(\"token\")", "render telemetry must strip token fields");
assertIncludes(renderTelemetry, "normalized.includes(\"secret\")", "render telemetry must strip secret fields");
assertIncludes(renderTelemetry, "[redacted]", "render telemetry must redact long token-like strings");

assertIncludes(packageJson, "\"proof:livekit-autonomous-operator\"", "operator proof script must be registered");
assertIncludes(packageJson, "\"proof:livekit-surface-health\"", "surface health proof script must be registered");
assertIncludes(packageJson, "\"proof:watch-party-live-fallback-smoothing\"", "fallback smoothing proof script must be registered");
assertIncludes(packageJson, "\"guard:livekit-autonomous-operator-policy\"", "operator policy guard must be registered");
assertIncludes(packageJson, "\"livekit-operator:status\"", "operator status CLI must be registered");

assertIncludes(runbook, "Global LiveKit Router Eligibility Recovery", "runbook must document global router recovery");
assertIncludes(runbook, "Do not describe this incident as a Live tab button regression", "runbook must reject Live-tab-only framing");

console.log("LiveKit autonomous operator policy guard passed.");
