import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { waitForLegacyBrowserReceivedSilence } from "./assurance/helpers/legacy-browser-silence-wait.mjs";

const endpoint = (samples = 0, energy = 0, packets = 0) => ({
  userId: "receiver", instanceId: 2,
  peers: [{ id: 2, connection: "connected", signaling: "stable" }],
  stats: [{ peerId: 2, kind: "audio", packets }],
  audioReceivers: [{
    peerId: 2, connection: "connected", error: null, contextState: "running",
    trackState: "live", trackEnabled: true, playbackPaused: false, playbackReadyState: 4,
    pcmSamples: samples, pcmEnergy: energy, pcmSampleRate: 48_000,
  }],
});
const simulate = (next, { receiver = endpoint(), readDelay = 0 } = {}) => {
  let elapsed = 0, reads = 0;
  const result = waitForLegacyBrowserReceivedSilence({
    receiver, now: () => elapsed,
    pause: async (ms) => { elapsed += ms; },
    read: async () => {
      elapsed += readDelay;
      reads += 1;
      return next(reads);
    },
  });
  return { result, elapsed: () => elapsed, reads: () => reads };
};

test("HTTP mute gate uses the bounded real-input observer and retains six control cycles", () => {
  const root = process.env.CHILLY_CHAT_SOURCE_ROOT || fileURLToPath(new URL("../", import.meta.url));
  const source = fs.readFileSync(path.join(root, "scripts/test-chilly-chat-real-peer-http.mjs"), "utf8");
  const mute = source.indexOf('await control(userId, "setMicrophoneEnabled", false');
  const unmute = source.indexOf('await control(userId, "setMicrophoneEnabled", true', mute);
  assert.ok(mute > 0 && unmute > mute);
  const interval = source.slice(mute, unmute);
  assert.match(interval, /await waitForLegacyBrowserReceivedSilence\(\{/);
  assert.match(interval, /receiver: projected\.endpoints\.find\(\(endpoint\) => endpoint\.userId !== userId\)/);
  assert.match(interval, /read: async \(\) => \(await read\(\)\)\.endpoints\.find\(\(endpoint\) => endpoint\.userId !== userId\)/);
  assert.match(interval, /await proveOwnedRows/);
  assert.doesNotMatch(interval, /await pause\(300\)/);
  assert.match(source, /for \(const userId of users\.flatMap\(\(id\) => Array\.from\(\{ length: 3 \}, \(\) => id\)\)\)/);
});

test("buffered audible PCM drains before at least 300 ms of received silent input proves mute", async () => {
  const run = simulate((read) => endpoint(read * 4_800, Math.min(read, 5) * 0.01, read * 5));
  const received = await run.result;
  assert.equal(run.reads(), 8, "five noisy observations must reset the actual-input baseline");
  assert.equal(received.audioReceivers[0].pcmSamples, 38_400);
  assert.equal(run.elapsed(), 700);
});

test("one polling interval can prove silence only when 300 ms of real input and RTP advanced", async () => {
  const run = simulate(() => endpoint(14_400, 0, 15));
  await run.result;
  assert.equal(run.reads(), 1);
});

for (const [name, next] of [
  ["never-silent audio", (read) => endpoint(read * 4_800, read * 0.01, read * 5)],
  ["stalled PCM with continuing RTP", (read) => endpoint(0, 0, read * 5)],
  ["stalled RTP with continuing silent PCM", (read) => endpoint(read * 4_800, 0, 0)],
  ["a full input interval exactly at the strict energy ceiling", () => endpoint(14_400, 0.0001, 15)],
]) {
  test(`${name} cannot pass before the bounded deadline`, async () => {
    const run = simulate(next);
    await assert.rejects(run.result, /three-second settling deadline expired[\s\S]*Received silence intervals:/);
    assert.equal(run.elapsed(), 3_000);
    assert.equal(run.reads(), 30);
  });
}

for (const [name, change, message] of [
  ["wrong endpoint", (value) => { value.userId = "sender"; }, /endpoint identity changed/],
  ["replacement endpoint", (value) => { value.instanceId += 1; }, /endpoint identity changed/],
  ["replacement peer", (value) => { value.peers[0].id = 3; value.audioReceivers[0].peerId = 3; value.stats[0].peerId = 3; }, /peer identity/],
  ["stale receiver on the current peer", (value) => { value.audioReceivers[0].peerId = 1; }, /peer identity/],
  ["stale RTP report", (value) => { value.stats[0].peerId = 1; }, /RTP must belong/],
  ["duplicate connected receiver", (value) => { value.audioReceivers.push({ ...value.audioReceivers[0] }); }, /one connected peer and audio receiver/],
  ["extra stale RTP report", (value) => { value.stats.push({ peerId: 1, kind: "audio", packets: 100 }); }, /RTP must belong/],
  ["disconnected peer", (value) => { value.peers[0].connection = "closed"; }, /one connected peer/],
  ["unstable peer", (value) => { value.peers[0].signaling = "have-local-offer"; }, /stable connection/],
  ["suspended processor", (value) => { value.audioReceivers[0].contextState = "suspended"; }, /healthy, live receiver/],
  ["ended remote track", (value) => { value.audioReceivers[0].trackState = "ended"; }, /healthy, live receiver/],
  ["disabled receiving track", (value) => { value.audioReceivers[0].trackEnabled = false; }, /healthy, live receiver/],
  ["paused playback", (value) => { value.audioReceivers[0].playbackPaused = true; }, /healthy, live receiver/],
  ["unready playback", (value) => { value.audioReceivers[0].playbackReadyState = 1; }, /healthy, live receiver/],
  ["invalid PCM", (value) => { value.audioReceivers[0].pcmEnergy = null; }, /Missing or invalid/],
]) {
  test(`${name} cannot substitute for current received silence`, async () => {
    const run = simulate(() => {
      const value = endpoint(14_400, 0, 15);
      change(value);
      return value;
    });
    await assert.rejects(run.result, message);
    assert.equal(run.reads(), 1);
  });
}

test("receiver identity remains pinned after a valid but insufficient silent interval", async () => {
  const run = simulate((read) => {
    const value = endpoint(read * 4_800, 0, read * 5);
    if (read === 3) value.instanceId += 1;
    return value;
  });
  await assert.rejects(run.result, /endpoint identity changed/);
  assert.equal(run.reads(), 3);
});

test("missing confirmed receiver cannot establish a new identity after mute", async () => {
  await assert.rejects(simulate(() => endpoint(14_400, 0, 15), { receiver: null }).result,
    /valid confirmed receiver identity/);
});

for (const readDelay of [3_000, 3_001]) {
  test(`otherwise-silent browser read settling after ${readDelay} ms cannot pass`, async () => {
    const run = simulate(() => endpoint(14_400, 0, 15), { readDelay });
    await assert.rejects(run.result, /three-second settling deadline expired/);
    assert.equal(run.reads(), 1);
  });
}

test("failure diagnostics retain numeric interval evidence without arbitrary fixture or receiver error fields", async () => {
  const run = simulate((read) => {
    const value = endpoint(read * 4_800, read * 0.01, read * 5);
    value.secret = "private-fixture-marker";
    if (read === 3) value.audioReceivers[0].error = "private-receiver-error-marker";
    return value;
  });
  await assert.rejects(run.result, (error) => {
    assert.match(error.message, /healthy, live receiver/);
    assert.match(error.message, /"noisyWindows":2/);
    assert.match(error.message, /"durationSeconds":0.1/);
    assert.match(error.message, /"processorHealthy":false/);
    assert.doesNotMatch(error.message, /private-fixture-marker|private-receiver-error-marker/);
    return true;
  });
});
