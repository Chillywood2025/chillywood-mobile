import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const telemetry = read("_lib/livekit/livekitRenderTelemetry.ts");
const legacyTelemetry = read("_lib/livekitRenderTelemetry.ts");
const tokenContract = read("_lib/livekit/token-contract.ts");
const player = read("app/player/[id].tsx");
const stageSurface = read("components/watch-party-live/livekit-stage-media-surface.tsx");
const liveStage = read("app/watch-party/live-stage/[partyId].tsx");
const operatorFunction = read("supabase/functions/livekit-operator/index.ts");

for (const eventName of [
  "livekit_token_received",
  "livekit_token_nbf_future_grace_used",
  "livekit_token_nbf_rejected",
  "livekit_token_expired_rejected",
  "livekit_renderable_contract_set",
  "livekit_renderable_contract_preserved",
  "livekit_renderable_contract_cleared",
  "livekit_surface_mount_attempt",
  "livekit_surface_mounted",
  "livekit_fallback_roster_shown",
  "livekit_fallback_roster_suppressed",
  "livekit_camera_track_present",
  "livekit_camera_preparing",
  "livekit_bubble_grid_rendered",
  "livekit_connection_state_changed",
]) {
  assert.ok(telemetry.includes(eventName), `telemetry helper must define ${eventName}`);
}

assert.ok(legacyTelemetry.includes("export * from \"./livekit/livekitRenderTelemetry\""), "legacy telemetry import path must re-export canonical helper");
assert.ok(telemetry.includes("supabase.functions.invoke(\"livekit-operator\""), "telemetry must send to livekit-operator function");
assert.ok(telemetry.includes("action: \"render_event_ingest\""), "telemetry must use render_event_ingest action");
assert.ok(telemetry.includes("sanitizeLiveKitRenderTelemetryPayload"), "telemetry must sanitize payloads before transport");
assert.ok(telemetry.includes("normalized.includes(\"token\")"), "telemetry sanitizer must remove token fields");
assert.ok(telemetry.includes("normalized.includes(\"secret\")"), "telemetry sanitizer must remove secret fields");
assert.ok(telemetry.includes("nbfDeltaSecondsBucket"), "telemetry must bucket nbf deltas");
assert.ok(telemetry.includes("expDeltaSecondsBucket"), "telemetry must bucket expiry deltas");
assert.ok(!telemetry.includes("participantToken:"), "telemetry must not build participantToken fields");

assert.ok(tokenContract.includes("emitLiveKitRenderTelemetryEvent(\"livekit_token_received\""), "token helper must emit token received telemetry");
assert.ok(tokenContract.includes("emitLiveKitRenderTelemetryEvent(\"livekit_token_nbf_future_grace_used\""), "token helper must emit nbf grace telemetry");
assert.ok(tokenContract.includes("emitLiveKitRenderTelemetryEvent(\"livekit_token_nbf_rejected\""), "token helper must emit nbf rejection telemetry");
assert.ok(tokenContract.includes("LIVEKIT_TOKEN_NOT_BEFORE_GRACE_MILLIS = 5_000"), "bounded nbf grace must stay in place");

assert.ok(player.includes("emitLiveKitRenderTelemetryEvent(\"livekit_fallback_roster_suppressed\""), "Shared Player must emit fallback suppression telemetry");
assert.ok(player.includes("emitLiveKitRenderTelemetryEvent(\"livekit_fallback_roster_shown\""), "Shared Player must emit fallback shown telemetry");
assert.ok(player.includes("emitLiveKitRenderTelemetryEvent(\"livekit_renderable_contract_set\""), "Shared Player must emit renderable contract telemetry");
assert.ok(stageSurface.includes("emitLiveKitRenderTelemetryEvent(\"livekit_surface_mounted\""), "LiveKit surface must emit mount telemetry");
assert.ok(stageSurface.includes("emitLiveKitRenderTelemetryEvent(\"livekit_camera_track_present\""), "LiveKit surface must emit camera track telemetry");
assert.ok(stageSurface.includes("emitLiveKitRenderTelemetryEvent(\"livekit_camera_preparing\""), "LiveKit surface must emit camera preparing telemetry");
assert.ok(liveStage.includes("emitLiveKitRenderTelemetryEvent(\"livekit_surface_mount_attempt\""), "Live Stage must emit mount attempt telemetry");

assert.ok(operatorFunction.includes("authenticateAppUser"), "operator must authenticate app users for telemetry ingest");
assert.ok(operatorFunction.includes("action === \"render_event_ingest\""), "operator must handle render telemetry ingest");
assert.ok(operatorFunction.includes("authenticated_user_required"), "render telemetry ingest must require app auth");
assert.ok(operatorFunction.includes("render_telemetry_rate_limited"), "render telemetry ingest must rate limit");
assert.ok(operatorFunction.includes("client telemetry cannot directly trigger recovery") === false, "policy must be enforced by code rather than comments only");
assert.ok(operatorFunction.includes("operator_token_required"), "non-telemetry operator paths must still require operator token");

console.log(JSON.stringify({
  status: "passed",
  telemetryEventsCovered: 15,
}, null, 2));
