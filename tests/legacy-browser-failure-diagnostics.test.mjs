import test from "node:test";
import assert from "node:assert/strict";
import { summarizeLegacyBrowserFailure } from "./assurance/helpers/legacy-paired-browser-harness.mjs";

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
