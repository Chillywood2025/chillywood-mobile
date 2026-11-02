import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { hasIsolatedLegacyFreshPeerEvidence } from "./assurance/helpers/legacy-fresh-peer-evidence.mjs";

const evidence = () => ({
  endpoint: { instanceId: 1, membership: { membershipGeneration: "fresh-generation" },
    stats: [{ peerId: 5 }], pixels: [{ peerId: 5 }] },
  previous: { instanceId: 1 }, priorGenerations: new Set(["initial-generation", "previous-generation"]),
  oldPeerIds: new Set([1, 2, 3, 4]), connectedPeers: [{ id: 5 }], receivedAudio: [{ peerId: 5 }],
});

test("fresh evidence retains mounted identity and excludes all historical generations/counters", () => {
  assert.equal(hasIsolatedLegacyFreshPeerEvidence(evidence()), true);
});

for (const [name, corrupt] of [
  ["remounted hook", (value) => { value.endpoint.instanceId = 2; }],
  ["initial generation reused", (value) => { value.endpoint.membership.membershipGeneration = "initial-generation"; }],
  ["previous generation reused", (value) => { value.endpoint.membership.membershipGeneration = "previous-generation"; }],
  ["missing generation", (value) => { value.endpoint.membership = null; }],
  ["old connected peer", (value) => { value.connectedPeers[0].id = 1; }],
  ["old RTP counters", (value) => { value.endpoint.stats[0].peerId = 2; }],
  ["old received PCM", (value) => { value.receivedAudio[0].peerId = 3; }],
  ["old video pixels", (value) => { value.endpoint.pixels[0].peerId = 4; }],
]) {
  test(`negative control rejects ${name}`, () => {
    const value = evidence(); corrupt(value);
    assert.equal(hasIsolatedLegacyFreshPeerEvidence(value), false);
  });
}

test("authenticated repeat gate requires four sequential full lifecycles without weakening media predicates", () => {
  const source = fs.readFileSync(new URL("../scripts/test-chilly-chat-real-peer-http.mjs", import.meta.url), "utf8");
  const loop = source.slice(source.indexOf("for (let cycle = 1; cycle <= 4; cycle += 1)"), source.indexOf("  } catch (error) {\n    failed = true;"));
  assert.ok(loop.includes("createAcceptedCall(`FRESH${cycle}`)"));
  assert.ok(loop.includes("hasMedia(endpoint) && hasIsolatedLegacyFreshPeerEvidence"));
  assert.ok(loop.includes("advances(endpoint, freshInitial.endpoints.find"));
  assert.ok(loop.includes("await proveOwnedRows(fresh.roomId, freshAdvanced"));
  assert.ok(loop.includes("await endAndProve(fresh)"));
  assert.ok(loop.indexOf("await endAndProve(fresh)") < loop.indexOf("beforeEnd = freshAdvanced"));
  assert.equal(loop.includes("catch"), false, "a failed case must exit, not retry the cycle");
  assert.ok(source.includes("const wait = async (predicate, label, timeout = 20_000)"));
});
