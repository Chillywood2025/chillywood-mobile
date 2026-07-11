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

const operatorSource = readFileSync(path.join(root, "_lib/livekitAutonomousOperator.ts"), "utf8");
const functionSource = readFileSync(path.join(root, "supabase/functions/livekit-operator/index.ts"), "utf8");
const migrationSource = readFileSync(path.join(root, "supabase/migrations/20260711043323_livekit_autonomous_operator.sql"), "utf8");

const {
  LIVEKIT_AUTONOMOUS_OPERATOR_SURFACES,
  canAutoExecuteLiveKitRecovery,
  classifyLiveKitFunctionHealth,
  classifyLiveKitRenderHealth,
  classifyLiveKitRouterHealth,
  planLiveKitRecoveryAction,
  sanitizeLiveKitOperatorProof,
  updateLiveKitOperatorLearningState,
} = await importTypeScriptModule("_lib/livekitAutonomousOperator.ts");

const staleRouter = classifyLiveKitRouterHealth({
  servers: [{
    currentParticipants: 0,
    currentPublishers: 0,
    currentRooms: 0,
    heartbeatAgeSeconds: 301,
    maxParticipants: 100,
    maxRooms: 10,
    publicWsUrl: "wss://live.chillywoodstream.com",
    status: "active",
  }],
  staleHeartbeatSeconds: 120,
});
assert.equal(staleRouter.healthState, "stale_heartbeat");

const noServers = classifyLiveKitRouterHealth({ servers: [] });
assert.equal(noServers.healthState, "no_eligible_server");
assert.equal(noServers.reason, "no_servers_registered");

const missingBlob = classifyLiveKitFunctionHealth({
  errorCode: "NOT_FOUND_FUNCTION_BLOB",
  functionName: "livekit-heartbeat-monitor",
  httpStatus: 503,
  responds: false,
});
assert.equal(missingBlob.healthState, "function_blob_missing");

const healthyRouter = classifyLiveKitRouterHealth({
  servers: [{
    currentParticipants: 0,
    currentPublishers: 0,
    currentRooms: 0,
    heartbeatAgeSeconds: 11,
    maxParticipants: 100,
    maxRooms: 10,
    publicWsUrl: "wss://live.chillywoodstream.com",
    status: "active",
  }],
});
assert.equal(healthyRouter.healthState, "healthy");

const stalePlan = planLiveKitRecoveryAction(staleRouter);
assert.equal(stalePlan.action, "run_heartbeat_monitor");
assert.equal(stalePlan.level, 1);
assert.equal(canAutoExecuteLiveKitRecovery(stalePlan, {
  hostProofHealthy: true,
  operatorTokenValid: true,
  scopedAction: true,
}), true);

const blobPlan = planLiveKitRecoveryAction(missingBlob);
assert.equal(blobPlan.action, "redeploy_known_edge_function");
assert.equal(blobPlan.level, 2);

const ownerPlan = planLiveKitRecoveryAction({
  confidence: 0.9,
  healthState: "websocket_unreachable",
  reason: "host_public_ws_down",
  severity: "critical",
  surface: "host_agent",
});
assert.equal(ownerPlan.requiresOwnerApproval, true);
assert.equal(canAutoExecuteLiveKitRecovery(ownerPlan, {
  hostProofHealthy: false,
  operatorTokenValid: true,
  scopedAction: true,
}), false);

const flicker = classifyLiveKitRenderHealth({
  bubbleGridItemCount: 2,
  bubbleGridTrackCount: 0,
  canPublish: true,
  fallbackRosterShown: true,
  fallbackShownAfterMs: 250,
  hasRenderableContract: true,
  shouldRenderSurface: true,
  surface: "watch_party_live",
});
assert.equal(flicker.healthState, "fallback_flash_regression");

const nbfGrace = classifyLiveKitRenderHealth({
  eventName: "livekit_token_nbf_future_grace_used",
  nbfDeltaSeconds: 1,
  surface: "watch_party_live",
});
assert.equal(nbfGrace.healthState, "healthy");
assert.equal(nbfGrace.reason, "token_nbf_future_within_grace");

const nbfBlocked = classifyLiveKitRenderHealth({
  eventName: "livekit_token_nbf_rejected",
  nbfDeltaSeconds: 10,
  surface: "live_stage",
});
assert.equal(nbfBlocked.healthState, "token_time_skew_blocker");

const clearedRenderable = classifyLiveKitRenderHealth({
  hasRenderableContract: true,
  renderableContractCleared: true,
  surface: "watch_party_live",
});
assert.equal(clearedRenderable.healthState, "renderable_contract_regression");

const learning = updateLiveKitOperatorLearningState(null, {
  action: "run_heartbeat_monitor",
  healthState: "stale_heartbeat",
  recoverySucceeded: true,
  surface: "livekit_router",
});
assert.equal(learning.occurrenceCount, 1);
assert.equal(learning.successCount, 1);
assert.ok(learning.confidence > 0.5);

const sanitized = sanitizeLiveKitOperatorProof({
  participantToken: "a".repeat(80),
  safe: "value",
  secretKey: "hidden",
});
assert.equal(sanitized.participantToken, "[redacted]");
assert.equal(sanitized.secretKey, "[redacted]");
assert.equal(sanitized.safe, "value");

for (const surface of ["live_stage", "watch_party_live", "party_room_live_sidecar", "chat_call", "livekit_token", "livekit_router", "heartbeat_monitor", "host_agent"]) {
  assert.ok(LIVEKIT_AUTONOMOUS_OPERATOR_SURFACES.includes(surface), `missing surface ${surface}`);
}

assert.ok(functionSource.includes("x-livekit-operator-token"), "operator function must require a narrow token header");
assert.ok(functionSource.includes("LIVEKIT_OPERATOR_TOKEN_SHA256"), "operator function must validate token hash");
assert.ok(functionSource.includes("constantTimeEqual"), "operator function must use constant-time token comparison");
assert.ok(!functionSource.includes("participantToken"), "operator function must not return or log participant tokens");
assert.ok(!functionSource.includes(".from(\"livekit_servers\").update"), "operator must not directly mark LiveKit servers healthy");
assert.ok(functionSource.includes("invokeHeartbeatMonitor"), "safe recovery must use the legitimate heartbeat monitor path");
assert.ok(functionSource.includes("render_event_ingest"), "operator must ingest client render telemetry");
assert.ok(functionSource.includes("authenticated_user_required"), "client render telemetry must require auth");
assert.ok(functionSource.includes("watch_once"), "operator must support scheduled watch-once loop");
assert.ok(functionSource.includes("recordLearningState"), "operator must store learning outcomes");
assert.ok(functionSource.includes("NOT_FOUND_FUNCTION_BLOB") === false, "function should not hardcode blob success");

assert.ok(migrationSource.includes("enable row level security"), "operator tables must enable RLS");
assert.ok(migrationSource.includes("revoke all on table public.livekit_operator_events from anon, authenticated"), "client writes must be revoked");
assert.ok(operatorSource.includes("Never") === false, "operator model should encode rules as data, not prose-only");

console.log(JSON.stringify({
  autoRecovery: stalePlan.action,
  blobAction: blobPlan.action,
  nbfBlocked: nbfBlocked.healthState,
  learningConfidence: learning.confidence,
  status: "passed",
  surfaces: LIVEKIT_AUTONOMOUS_OPERATOR_SURFACES,
}, null, 2));
