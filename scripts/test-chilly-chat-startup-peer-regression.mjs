#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import { buildLegacyPairedBrowserBundle } from "../tests/assurance/helpers/legacy-paired-browser-harness.mjs";

const require = createRequire(new URL("../tests/integration/real-peer-browser/package.json", import.meta.url));
const { chromium } = require(process.env.CHILLY_CHAT_PLAYWRIGHT_MODULE || "./node_modules/playwright");
assert.ok(process.argv.slice(2).every((argument) => argument === "--diagnose"), "Only --diagnose is supported; it retains all assertions");
const diagnose = process.argv.includes("--diagnose");
const bundle = buildLegacyPairedBrowserBundle({ sourceRoot: process.env.CHILLY_CHAT_SOURCE_ROOT || process.cwd() });
const server = http.createServer((request, response) => {
  response.setHeader("Content-Type", request.url === "/fixture.js" ? "application/javascript" : "text/html");
  response.end(request.url === "/fixture.js" ? bundle : '<!doctype html><html><body><script src="/fixture.js"></script></body></html>');
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const received = (endpoint) => ({
  samples: endpoint.audioReceivers.filter((receiver) => receiver.connection === "connected" && !receiver.error).reduce((sum, receiver) => sum + receiver.pcmSamples, 0),
  energy: endpoint.audioReceivers.filter((receiver) => receiver.connection === "connected" && !receiver.error).reduce((sum, receiver) => sum + receiver.pcmEnergy, 0),
  packets: endpoint.stats.filter((report) => report.kind === "audio").reduce((sum, report) => sum + report.packets, 0),
  frames: endpoint.stats.filter((report) => report.kind === "video").reduce((sum, report) => sum + report.frames, 0),
});
const healthy = (endpoint) => {
  const media = received(endpoint);
  return endpoint.channelState === "live" && endpoint.mediaControlsBusy === false && endpoint.micEnabled === true && endpoint.cameraEnabled === true
    && endpoint.peers.filter((peer) => peer.connection === "connected" && peer.signaling === "stable").length === 1
    && media.samples > 2048 && media.energy > 0 && media.packets > 0 && media.frames > 5
    && endpoint.pixels.some((frame) => frame.brightness > 20);
};
const summarize = (state) => state && ({ errors: state.errors, held: state.heldCameraPermissionReads,
  endpoints: state.endpoints.map((endpoint) => ({ userId: endpoint.userId, appState: endpoint.appState,
    channelState: endpoint.channelState, micEnabled: endpoint.micEnabled, cameraEnabled: endpoint.cameraEnabled,
    error: endpoint.error, mediaControlError: endpoint.mediaControlError, media: received(endpoint), peers: endpoint.peers })),
  operations: state.events.filter((event) => event.kind === "peer-operation").slice(-24),
});
let browser;
let page;
let latest;
const bounded = async (promise, milliseconds = 20_000) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Browser operation deadline exceeded")), milliseconds);
  })]); } finally { clearTimeout(timer); }
};
const wait = async (predicate, description, timeout = 20_000) => {
  const deadline = performance.now() + timeout;
  do {
    latest = await bounded(page.evaluate(() => window.__pairedCall.read()));
    assert.deepEqual(latest.errors, [], "Actual browser fixture must remain error-free");
    if (predicate(latest)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (performance.now() < deadline);
  throw new Error(`Timed out: ${description}`);
};
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHILLY_CHAT_CHROMIUM_PATH || undefined,
    args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--allow-loopback-in-peer-connection"] });
  console.log(`Startup regression: Chromium ${browser.version()}, actual production hooks, synthetic capture, local signaling only`);
  const context = await browser.newContext();
  await context.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  page = await context.newPage();
  page.setDefaultTimeout(20_000);
  await page.goto(origin);
  console.log("Fixture loaded; holding caller camera reconciliation");
  await bounded(page.evaluate(async () => {
    window.__pairedCall.holdNextCameraPermissionRead("alice");
    await window.__pairedCall.start({ callType: "video", hostUserId: "alice", initialAppStates: { alice: "active", bob: "background" } });
  }));
  await wait((state) => state.heldCameraPermissionReads.includes("alice") && state.endpoints.length === 2
    && state.endpoints.every((endpoint) => endpoint.channelState === "live"), "startup admission and held foreground camera permission");
  console.log("Both hooks admitted; foregrounding receiver");
  await bounded(page.evaluate(() => window.__pairedCall.setAppState("bob", "active")));
  const before = await wait((state) => state.endpoints.every(healthy), "both peers receive audio PCM/RTP and video before releasing the unchanged camera");
  assert.deepEqual(before.heldCameraPermissionReads, ["alice"], "The actual foreground camera continuation must still be held");
  const aliceBefore = before.endpoints.find((endpoint) => endpoint.userId === "alice");
  const peerBefore = aliceBefore.peers.find((peer) => peer.connection === "connected");
  const videoSender = peerBefore.senderTracks.find((track) => track?.kind === "video");
  assert.ok(videoSender && videoSender.state === "live" && videoSender.enabled, "Camera is already sending through a live existing sender");
  assert.ok(peerBefore.transceivers.some((transceiver) => transceiver.senderTrackId === videoSender.trackId
    && ["sendrecv", "sendonly"].includes(transceiver.currentDirection)), "Existing camera sender is already negotiated to send");
  console.log("Both peers receive media; releasing unchanged caller camera");
  await bounded(page.evaluate(() => window.__pairedCall.releaseHeldCameraPermissionReads("alice")));
  const after = await wait((state) => !state.heldCameraPermissionReads.length
    && state.events.slice(before.events.length).some((event) => event.kind === "commit"
      && event.userId === "alice" && event.operation === "touch" && event.mic === true && event.camera === true)
    && state.events.slice(before.events.length).some((event) => event.kind === "broadcast"
      && event.sender === "alice" && event.event === "media:update")
    && state.endpoints.every((endpoint) => {
    const baseline = before.endpoints.find((entry) => entry.userId === endpoint.userId);
    const initial = received(baseline);
    const current = received(endpoint);
    return healthy(endpoint) && current.samples > initial.samples && current.energy > initial.energy
      && current.packets > initial.packets && current.frames > initial.frames + 3
      && endpoint.pixels.some((frame) => frame.fingerprint !== baseline.pixels.find((previous) => previous.peerId === frame.peerId)?.fingerprint);
  }), "both peers continue receiving advancing audio and moving video after camera reconciliation");
  const aliceAfter = after.endpoints.find((endpoint) => endpoint.userId === "alice");
  const peerAfter = aliceAfter.peers.find((peer) => peer.connection === "connected");
  assert.equal(aliceAfter.instanceId, aliceBefore.instanceId, "Reconciliation must use the same actual hook instance");
  assert.equal(peerAfter.id, peerBefore.id, "Reconciliation must use the same native peer");
  assert.deepEqual(peerAfter.senderTracks, peerBefore.senderTracks, "Already live camera/audio sender tracks remain unchanged");
  const extraOffers = after.events.slice(before.events.length).filter((event) => event.kind === "peer-operation"
    && event.userId === "alice" && event.operation === "createOffer");
  console.log(JSON.stringify({ scenario: "delayed unchanged foreground camera", extraAliceOffers: extraOffers.length,
    before: before.endpoints.map((endpoint) => ({ userId: endpoint.userId, ...received(endpoint) })),
    after: after.endpoints.map((endpoint) => ({ userId: endpoint.userId, ...received(endpoint) })) }));
  if (diagnose) console.log(JSON.stringify(summarize(after)));
  assert.equal(extraOffers.length, 0, "Releasing unchanged, already negotiated foreground camera must not create another offer");
  console.log("PASS: unchanged foreground camera adds no offer; both real browser peers retain advancing received audio and video. This is not native-device causation proof.");
} catch (error) {
  if (diagnose) console.error(JSON.stringify(summarize(latest)));
  throw error;
} finally {
  if (page && !page.isClosed()) await bounded(page.evaluate(() => window.__pairedCall?.dispose()), 5000).catch(() => {});
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
