#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => readFileSync(path.join(root, relativePath), "utf8");

const fail = (message) => {
  console.error(`LiveKit passive load guard failed: ${message}`);
  process.exitCode = 1;
};

const assertIncludes = (source, needle, label) => {
  if (!source.includes(needle)) fail(`${label} is missing ${needle}`);
};

const assertNotIncludes = (source, needle, label) => {
  if (source.includes(needle)) fail(`${label} must not include ${needle}`);
};

const packageJson = read("package.json");
const proofScript = read("scripts/proof-livekit-passive-viewer-load.mjs");
const metricsProof = read("scripts/proof-livekit-server-metrics.mjs");
const metricsGuard = read("scripts/guard-livekit-server-metrics-policy.mjs");
const routing = read("supabase/functions/_shared/livekit-routing.ts");
const tokenFunction = read("supabase/functions/livekit-token/index.ts");
const tokenContract = read("_lib/livekit/token-contract.ts");
const sharedRoom = read("_lib/watch-party/room-shared.ts");
const simPolicy = read("docs/LIVEKIT_SIMULCAST_DYNACAST_POLICY.md");

assertIncludes(packageJson, "\"proof:livekit-passive-viewer-load\"", "package proof script");
assertIncludes(packageJson, "\"guard:livekit-passive-load-policy\"", "package guard script");
assertIncludes(packageJson, "\"@livekit/rtc-node\"", "dev proof dependency");

assertIncludes(proofScript, "@livekit/rtc-node", "proof harness real RTC runtime");
assertIncludes(proofScript, "synthetic_livekit_node_rtc_subscribers_with_deployed_token_endpoint", "qualified proof method");
assertIncludes(proofScript, "PASSIVE_VIEWER_COUNT = 10", "10 passive viewer proof target");
assertIncludes(proofScript, "LIVEKIT_PASSIVE_LOAD_HOLD_MS", "measured stability window");
assertIncludes(proofScript, "LIVEKIT_PASSIVE_LOAD_HEARTBEAT_COMMAND", "operator metrics heartbeat hook");
assertIncludes(proofScript, "/functions/v1/livekit-token", "deployed token endpoint path");
assertIncludes(proofScript, "requestedGrants?.canPublish === false", "passive viewer publish denial check");
assertIncludes(proofScript, "unauthorizedSpeakerDowngraded", "speaker downgrade proof");
assertIncludes(proofScript, "duringParticipants >= PASSIVE_VIEWER_COUNT + 1", "during-load participant metrics proof");
assertIncludes(proofScript, "duringPublishers === 1", "single publisher metrics proof");
assertIncludes(proofScript, "secretLeakCheck", "secret leakage proof field");

[
  "LIVEKIT_API_SECRET",
  "LIVEKIT_API_KEY",
  "RoomServiceClient",
  "AccessToken",
  "console.log(hostToken",
  "console.log(viewerTokens",
].forEach((needle) => assertNotIncludes(proofScript, needle, "passive load proof script secret/authority isolation"));
assertNotIncludes(proofScript, "participantToken: hostToken", "passive load proof script token logging");
assertNotIncludes(proofScript, "participantToken: viewer", "passive load proof script token logging");

assertNotIncludes(proofScript, "10 real mobile devices", "proof method overclaim");
assertNotIncludes(proofScript, "real-device passive viewer proof closed", "proof method overclaim");
assertNotIncludes(proofScript, "LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS = 5", "active seat cap increase");

assertIncludes(sharedRoom, "export const LIVE_WATCH_PARTY_MAX_SPEAKER_SEATS = 4;", "active camera/mic cap");
assertIncludes(simPolicy, "Launch guidance remains 4 active speaker/camera seats", "active seat cap policy");
assertIncludes(metricsProof, "capacity_not_raised", "metrics proof capacity restraint");
assertIncludes(metricsGuard, "10-participant proof", "metrics guard load-proof separation");
assertIncludes(routing, "stale_heartbeat", "router stale heartbeat fail-safe");
assertIncludes(routing, "no_eligible_livekit_server", "router no-eligible fail-safe");
assertNotIncludes(routing, "LIVEKIT_URL", "router hardcoded fallback");

assertIncludes(tokenFunction, "canPublish: requestedGrants.canPublish", "token grants stay explicit");
assertIncludes(tokenFunction, "participantRole: effectiveParticipantRole", "token effective role response");
assertIncludes(tokenContract, "participantToken", "mobile token contract unchanged");
assertIncludes(tokenContract, "serverUrl", "mobile token contract unchanged");
assertNotIncludes(tokenContract, "cpuPercent", "mobile token contract metrics leak");

[
  "RevenueCat",
  "Stripe",
  "Google Play",
  "payout",
  "Premium entitlement",
].forEach((needle) => {
  assertNotIncludes(proofScript, needle, "passive load proof payment isolation");
});

if (process.exitCode) process.exit(process.exitCode);
console.log("LiveKit passive load guard passed.");
