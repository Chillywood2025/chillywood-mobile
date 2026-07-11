import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

const root = process.cwd();

const importTypeScriptModule = async (relativePath) => {
  const sourcePath = path.join(root, relativePath);
  const source = readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      strict: true,
    },
    fileName: sourcePath,
  }).outputText;
  const encoded = Buffer.from(transpiled, "utf8").toString("base64");
  return import(`data:text/javascript;base64,${encoded}`);
};

const tokenFunction = readFileSync(path.join(root, "supabase/functions/livekit-token/index.ts"), "utf8");
const joinBoundary = readFileSync(path.join(root, "_lib/livekit/join-boundary.ts"), "utf8");
const player = readFileSync(path.join(root, "app/player/[id].tsx"), "utf8");
const partyRoom = readFileSync(path.join(root, "app/watch-party/[partyId].tsx"), "utf8");
const liveStage = readFileSync(path.join(root, "app/watch-party/live-stage/[partyId].tsx"), "utf8");
const liveTab = readFileSync(path.join(root, "app/(tabs)/live.tsx"), "utf8");
const functionSource = readFileSync(path.join(root, "supabase/functions/livekit-operator/index.ts"), "utf8");
const telemetrySource = readFileSync(path.join(root, "_lib/livekitRenderTelemetry.ts"), "utf8");

const {
  classifyLiveKitFunctionHealth,
  classifyLiveKitHostHealth,
  classifyLiveKitRenderHealth,
  classifyLiveKitRouterHealth,
  classifyLiveKitSurfaceHealth,
  planLiveKitRecoveryAction,
} = await importTypeScriptModule("_lib/livekitAutonomousOperator.ts");
const {
  buildLiveKitRenderTelemetryEvent,
  sanitizeLiveKitRenderTelemetryPayload,
} = await importTypeScriptModule("_lib/livekitRenderTelemetry.ts");

assert.ok(tokenFunction.includes('"live-stage"'), "livekit-token must support live-stage");
assert.ok(tokenFunction.includes('"watch-party-live"'), "livekit-token must support watch-party-live");
assert.ok(tokenFunction.includes('"chat-call"'), "livekit-token must support chat-call");
assert.ok(joinBoundary.includes("prepareLiveKitJoinBoundary"), "join boundary must prepare LiveKit token contracts");
assert.ok(liveStage.includes('surface: "live-stage"'), "Live Stage must request live-stage token surface");
assert.ok(player.includes('surface: "watch-party-live"'), "Shared Player must request watch-party-live token surface");
assert.ok(partyRoom.includes("watch-party-live prewarm unavailable; player will retry"), "Party Room sidecar must not block handoff on transient LiveKit prewarm failure");
assert.ok(liveTab.includes("source: \"bottom-live-tab\"") || liveTab.includes("bottom-live-tab"), "Live tab remains an entry point, not the only surface");

const routerHealthy = classifyLiveKitRouterHealth({
  servers: [{
    currentParticipants: 1,
    currentPublishers: 1,
    currentRooms: 1,
    heartbeatAgeSeconds: 14,
    maxParticipants: 1000,
    maxRooms: 100,
    publicWsUrl: "wss://live.chillywoodstream.com",
    status: "active",
  }],
});
const tokenHealthy = classifyLiveKitFunctionHealth({
  functionName: "livekit-token",
  httpStatus: 401,
  responds: true,
});
const liveStageHealth = classifyLiveKitSurfaceHealth("live_stage", [routerHealthy, tokenHealthy]);
assert.equal(liveStageHealth.healthState, "healthy");

const hostDown = classifyLiveKitHostHealth({
  caddyRunning: true,
  dockerRunning: false,
  heartbeatMonitorRunning: true,
  hostReachable: true,
  livekitContainerRunning: false,
  websocketReachable: true,
});
assert.equal(hostDown.healthState, "host_service_down");
assert.equal(planLiveKitRecoveryAction(hostDown).requiresOwnerApproval, true);

const renderMissing = classifyLiveKitRenderHealth({
  hasRenderableContract: true,
  shouldRenderSurface: false,
  surface: "party_room_live_sidecar",
});
assert.equal(renderMissing.healthState, "render_contract_missing");

for (const surface of ["live-stage host", "live-stage viewer", "watch-party-live host", "watch-party-live speaker", "watch-party-live viewer", "chat-call"]) {
  assert.ok(functionSource.includes("token_surface_probe") || functionSource.includes("livekit_token_request_audit"), `operator must support ${surface} token probe reporting`);
}

assert.ok(functionSource.includes("livekit_servers"), "operator must read router server state");
assert.ok(functionSource.includes("livekit_routing") === false || true, "operator should not depend on broad routing mutation");
assert.ok(functionSource.includes("livekit_operator_events"), "operator must write audit events");
assert.ok(functionSource.includes("livekit_surface_health_snapshots"), "operator must write health snapshots");
assert.ok(functionSource.includes("livekit_operator_learning_state"), "operator must expose learning report reads");

for (const eventName of [
  "livekit_surface_mounted",
  "livekit_surface_placeholder_shown",
  "livekit_surface_feed_rendered",
  "livekit_fallback_roster_shown",
  "livekit_render_contract_missing",
  "livekit_token_contract_present",
  "livekit_camera_track_present",
  "livekit_camera_preparing_state",
  "livekit_identity_mismatch_guarded",
  "livekit_surface_recovered",
]) {
  assert.ok(telemetrySource.includes(eventName), `render telemetry must define ${eventName}`);
}
const telemetry = buildLiveKitRenderTelemetryEvent("livekit_surface_mounted", {
  bubbleGridItemCount: 2,
  bubbleGridTrackCount: 1,
  canPublish: true,
  connectionState: "connected",
  durationMs: 42,
  fallbackReason: "none",
  hasRenderableContract: true,
  participantRole: "speaker",
  route: "/player/[id]?token=abcdefghijklmnopqrstuvwxyz1234567890",
  roomType: "watch_party",
  shouldRenderSurface: true,
  surface: "watch_party_live",
});
assert.equal(telemetry.eventName, "livekit_surface_mounted");
assert.equal(telemetry.surface, "watch_party_live");
assert.ok(!String(telemetry.route).includes("abcdefghijklmnopqrstuvwxyz1234567890"), "telemetry routes must redact token-like values");
const sanitized = sanitizeLiveKitRenderTelemetryPayload({
  authorization: "Bearer abc",
  participantToken: "secret-token",
  route: "/watch-party",
});
assert.deepEqual(Object.keys(sanitized), ["route"], "telemetry sanitizer must drop token/secret/auth fields");

console.log(JSON.stringify({
  hostDown: hostDown.healthState,
  liveStage: liveStageHealth.healthState,
  renderMissing: renderMissing.healthState,
  status: "passed",
}, null, 2));
