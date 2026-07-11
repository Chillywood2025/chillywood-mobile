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

const player = readFileSync(path.join(root, "app/player/[id].tsx"), "utf8");
const livekitSurface = readFileSync(path.join(root, "components/watch-party-live/livekit-stage-media-surface.tsx"), "utf8");
const livekitTokenContract = readFileSync(path.join(root, "_lib/livekit/token-contract.ts"), "utf8");

const {
  WATCH_PARTY_LIVEKIT_FALLBACK_ROSTER_GRACE_MILLIS,
  classifyLiveKitRenderHealth,
} = await importTypeScriptModule("_lib/livekitAutonomousOperator.ts");

assert.ok(WATCH_PARTY_LIVEKIT_FALLBACK_ROSTER_GRACE_MILLIS >= 1200, "fallback roster grace must be at least 1200ms");
assert.ok(WATCH_PARTY_LIVEKIT_FALLBACK_ROSTER_GRACE_MILLIS <= 2000, "fallback roster grace must be at most 2000ms");

assert.ok(player.includes("watchPartyLiveKitFallbackRosterAllowed"), "Player must track fallback roster grace state");
assert.ok(player.includes("watchPartyLiveKitHardFallbackReason"), "Player must distinguish hard fallback from transient refresh");
assert.ok(player.includes("shouldRenderWatchPartyLiveKitStableShell"), "Player must render a stable LiveKit shell during refresh");
assert.ok(player.includes("shared-player-livekit-connecting-shell"), "Player must expose stable connecting shell for installed proof");
assert.ok(player.includes("CONNECTING LIVEKIT"), "stable shell must communicate LiveKit connection preparation");
assert.ok(player.includes("WATCH_PARTY_LIVEKIT_FALLBACK_ROSTER_GRACE_MILLIS"), "Player must use shared grace constant");
assert.ok(livekitTokenContract.includes("LIVEKIT_TOKEN_REFRESH_MAX_SKEW_MILLIS = 60_000"), "LiveKit token expiry keeps the normal max refresh skew");
assert.ok(livekitTokenContract.includes("LIVEKIT_TOKEN_REFRESH_MIN_SKEW_MILLIS = 2_000"), "LiveKit token expiry keeps a minimum safety skew");
assert.ok(livekitTokenContract.includes("LIVEKIT_TOKEN_REFRESH_LIFETIME_RATIO = 0.1"), "LiveKit token expiry must use a lifetime ratio for short TTL tokens");
assert.ok(livekitTokenContract.includes("issuedAtSeconds"), "LiveKit token expiry must inspect issued-at time for adaptive skew");
assert.ok(livekitTokenContract.includes("tokenLifetimeMillis * LIVEKIT_TOKEN_REFRESH_LIFETIME_RATIO"), "short-lived LiveKit tokens must not be consumed by a fixed 60s skew");
assert.ok(livekitTokenContract.includes("notBeforeSeconds * 1000 > nowMillis"), "not-yet-valid LiveKit tokens must remain blocked");

const bubbleSurfaceStart = player.indexOf("const renderWatchPartyBubbleGridSurface =");
const bubbleSurfaceEnd = player.indexOf("const renderWatchPartySocialPanel", bubbleSurfaceStart);
const bubbleSurface = player.slice(bubbleSurfaceStart, bubbleSurfaceEnd);
assert.ok(bubbleSurface.includes("shouldRenderWatchPartyLiveKit && activeWatchPartyLiveKitJoinContract"), "real LiveKit surface remains primary");
assert.ok(bubbleSurface.indexOf("shouldRenderWatchPartyLiveKitStableShell") < bubbleSurface.indexOf("shared-player-live-roster-placeholder"), "stable shell must appear before separate roster placeholder");
assert.ok(bubbleSurface.includes("LiveKitStageMediaSurface"), "LiveKitStageMediaSurface must remain mounted for active/renderable contracts");

const fallbackHandlerStart = player.indexOf("const onWatchPartyLiveKitFallback = useCallback");
const fallbackHandlerEnd = player.indexOf("useEffect(() => {\n    if (!activeParticipantId) return;", fallbackHandlerStart);
const fallbackHandler = player.slice(fallbackHandlerStart, fallbackHandlerEnd);
assert.ok(fallbackHandler.includes("reason === \"room_error\" ? \"room_error\" : null"), "hard room errors must bypass the grace window");
assert.ok(fallbackHandler.includes("shouldPreserveRenderableContract"), "transient fallback must preserve valid renderable contract");
assert.ok(!fallbackHandler.includes("setWatchPartyLiveKitRenderableContract(null);"), "transient fallback must not unconditionally clear renderable contract");

assert.ok(livekitSurface.includes("Camera preparing"), "publish-capable participants without track must show Camera preparing");
assert.ok(livekitSurface.includes("participantRosterByIdentity.forEach"), "surface must render roster placeholders before tracks publish");
assert.ok(livekitSurface.includes("bubbleGridItems.length > 0"), "surface must keep stable bubble shell when roster items exist");

const flicker = classifyLiveKitRenderHealth({
  bubbleGridItemCount: 1,
  bubbleGridTrackCount: 0,
  fallbackRosterShown: true,
  fallbackShownAfterMs: 500,
  hasRenderableContract: true,
  shouldRenderSurface: true,
  surface: "watch_party_live",
});
assert.equal(flicker.healthState, "render_surface_flicker");

const hardFailure = classifyLiveKitRenderHealth({
  hasRenderableContract: false,
  roomError: true,
  shouldRenderSurface: false,
  surface: "watch_party_live",
});
assert.equal(hardFailure.healthState, "render_contract_missing");
assert.equal(hardFailure.reason, "hard_room_error");

console.log(JSON.stringify({
  graceMillis: WATCH_PARTY_LIVEKIT_FALLBACK_ROSTER_GRACE_MILLIS,
  hardFailure: hardFailure.reason,
  status: "passed",
  transientFlicker: flicker.healthState,
}, null, 2));
