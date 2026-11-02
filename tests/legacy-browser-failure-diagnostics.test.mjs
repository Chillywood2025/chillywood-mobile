import test from "node:test";
import assert from "node:assert/strict";
import { summarizeLegacyBrowserFailure, summarizeLegacyIceConfiguration } from "./assurance/helpers/legacy-paired-browser-harness.mjs";
import { collectLegacyFailureTransportDiagnostics } from "./assurance/helpers/legacy-failure-transport-diagnostics.mjs";

test("failure-only transport collection returns native evidence without modification", async () => {
  const evidence = [{ peerId: 4, localCandidates: 2, remoteCandidates: 0 }];
  assert.equal(await collectLegacyFailureTransportDiagnostics(() => evidence), evidence);
});

test("closed page and synchronous diagnostic failures use fixed sanitized fallbacks", async () => {
  for (const collect of [() => { throw new Error("private URL and credential"); },
    () => Promise.reject(new Error("private browser error"))]) {
    assert.deepEqual(await collectLegacyFailureTransportDiagnostics(collect), {
      error: "transport diagnostics unavailable",
    });
  }
});

test("stuck getStats is bounded and cannot replace the original failure label", async () => {
  const label = "fresh accepted room must receive media";
  const diagnostics = await collectLegacyFailureTransportDiagnostics(() => new Promise(() => {}), 5);
  assert.deepEqual(diagnostics, { error: "transport diagnostics deadline exceeded" });
  assert.throws(() => { throw new Error(`${label}: ${JSON.stringify(diagnostics)}`); },
    /^Error: fresh accepted room must receive media:/);
});

test("ICE diagnostics retain policy and scheme counts without server URLs or credentials", () => {
  const configuration = { iceTransportPolicy: "relay", iceServers: [
    { urls: ["stun:private.example", "turns:private.example?transport=tcp"], username: "secret-user", credential: "secret-password" },
    { urls: "turn:another-private.example" },
  ] };
  const before = structuredClone(configuration);
  assert.deepEqual(summarizeLegacyIceConfiguration(configuration), {
    serverCount: 2, schemes: { stun: 1, stuns: 0, turn: 1, turns: 1, other: 0 }, iceTransportPolicy: "relay",
  });
  assert.deepEqual(configuration, before);
  assert.deepEqual(summarizeLegacyIceConfiguration(), {
    serverCount: 0, schemes: { stun: 0, stuns: 0, turn: 0, turns: 0, other: 0 }, iceTransportPolicy: "default",
  });
  assert.equal(JSON.stringify(summarizeLegacyIceConfiguration(configuration)).includes("private"), false);
  assert.equal(JSON.stringify(summarizeLegacyIceConfiguration(configuration)).includes("secret"), false);
  assert.equal(summarizeLegacyIceConfiguration({ iceServers: [null] }).schemes.other, 1);
});

test("failure diagnostics put current peer and received-media proof before bounded historical events", () => {
  const endpoint = {
    userId: "alice", channelState: "reconnecting", error: "synthetic current error",
    peers: [{ id: 1, connection: "closed" }, { id: 2, connection: "connecting", signaling: "have-local-offer" }],
    tracks: [{ state: "ended" }, { state: "live", enabled: true }],
    audioReceivers: [{ connection: "closed" }, { connection: "connecting", pcmSamples: 0, pcmEnergy: 0 }],
    stats: [{ packets: 0 }], pixels: [],
  };
  const state = {
    roomId: "SYNTHETIC-NEW-ROOM", errors: [],
    events: Array.from({ length: 1000 }, (_, i) => ({ i, detail: "x".repeat(100) })),
    operationResults: Array.from({ length: 30 }, (_, i) => ({ i })),
    endpoints: [endpoint], retiredEndpoints: [endpoint],
  };
  const before = structuredClone(state);
  const result = summarizeLegacyBrowserFailure(state);
  assert.deepEqual(state, before, "diagnostics cannot mutate predicate inputs");
  assert.deepEqual(result.endpoints[0].peers, [endpoint.peers[1]]);
  assert.deepEqual(result.endpoints[0].tracks, [endpoint.tracks[1]]);
  assert.deepEqual(result.endpoints[0].audioReceivers, [endpoint.audioReceivers[1]]);
  assert.equal(result.endpoints[0].closedPeerCount, 1);
  assert.equal(result.endpoints[0].endedTrackCount, 1);
  assert.equal(result.endpoints[0].closedAudioReceiverCount, 1);
  assert.deepEqual(result.endpoints[0].stats, endpoint.stats);
  assert.equal(result.eventCount, 1000);
  assert.equal(result.operationResultCount, 30);
  assert.equal(result.recentEvents.length, 20);
  assert.equal(result.recentEvents[0].i, 980);
  assert.equal(result.recentOperationResults.length, 12);
  const output = JSON.stringify(result);
  assert.ok(output.indexOf('"endpoints"') < output.indexOf('"recentEvents"'));
  assert.ok(output.length < 6000, "historical chatter must not bury current endpoint state");
});

test("independent audio control diagnostics preserve native proof without endpoint arrays", () => {
  const state = { errors: [], senderConnection: "connected", received: { pcmSamples: 2048, pcmEnergy: 0.1 } };
  const result = summarizeLegacyBrowserFailure(state);
  assert.deepEqual(result.received, state.received);
  assert.equal(result.senderConnection, "connected");
  assert.deepEqual(result.recentEvents, []);
});
