#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import { buildLegacyPairedBrowserBundle } from "../tests/assurance/helpers/legacy-paired-browser-harness.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const bundle = buildLegacyPairedBrowserBundle({ sourceRoot: process.env.CHILLY_CHAT_SOURCE_ROOT || process.cwd() });
const server = http.createServer((request, response) => {
  if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); response.end(bundle); }
  else { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><body><script src="/fixture.js"></script></body></html>'); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const wait = async (page, predicate, description, timeout = 20_000) => {
  const deadline = Date.now() + timeout;
  let state;
  while (Date.now() < deadline) {
    state = await page.evaluate(() => window.__pairedCall.read());
    assert.deepEqual(state.errors, [], `production hook must not throw in browser\n${JSON.stringify(state, null, 2)}`);
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${description}\n${JSON.stringify(state, null, 2)}`);
};
const media = (endpoint, kind) => endpoint.stats.filter((report) => report.kind === kind).reduce((sum, report) => sum + (kind === "video" ? report.frames : report.energy), 0);
const hasColor = (endpoint) => endpoint.pixels.some((frame) => frame.brightness > 20);
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHILLY_CHAT_CHROMIUM_PATH || undefined, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--allow-loopback-in-peer-connection"] });
  console.log(`Real peer integration: Chromium ${browser.version()}, production hooks, synthetic local capture, in-memory signaling adapter`);
  const run = async (dropAnswers = false) => {
    const context = await browser.newContext();
    await context.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on("pageerror", (error) => { console.error(error); });
    await page.goto(origin);
    await page.evaluate((drop) => window.__pairedCall.start({ dropAnswers: drop }), dropAnswers);
    return { context, page };
  };
  const { context, page } = await run();
  try {
    const first = await wait(page, (state) => state.endpoints.length === 2 && state.endpoints.every((endpoint) => endpoint.channelState === "live" && endpoint.peers.some((peer) => peer.connection === "connected") && media(endpoint, "video") > 5 && media(endpoint, "audio") > 0 && hasColor(endpoint)), "Both real peers must negotiate and receive decoded video and nonzero audio energy");
    await wait(page, (state) => state.endpoints.every((endpoint, index) => endpoint.pixels.some((frame) => frame.fingerprint !== first.endpoints[index].pixels[0]?.fingerprint)), "Received pixels must change on both endpoints, not merely repeat a frozen frame");
    for (const userId of ["alice", "bob"]) {
      for (let cycle = 0; cycle < 3; cycle += 1) {
        assert.equal(await page.evaluate((id) => window.__pairedCall.control(id, "setMicrophoneEnabled", false), userId), true, `${userId} mute`);
        await wait(page, (state) => state.endpoints.every((endpoint) => endpoint.participants.some((participant) => participant.userId === userId && participant.micOn === false)), `${userId} mute must project on both hooks`);
        // Drain previously queued media before observing the receiver. The
        // outcome is decoded synthetic silence, not the sender's UI flag.
        await new Promise((resolve) => setTimeout(resolve, 300));
        const silentStart = await page.evaluate(() => window.__pairedCall.read());
        await new Promise((resolve) => setTimeout(resolve, 300));
        const silentEnd = await page.evaluate(() => window.__pairedCall.read());
        const remoteIndex = silentEnd.endpoints.findIndex((endpoint) => endpoint.userId !== userId);
        assert.ok(media(silentEnd.endpoints[remoteIndex], "audio") - media(silentStart.endpoints[remoteIndex], "audio") < 0.0001, `${userId} mute must stop received synthetic audio energy`);
        assert.equal(await page.evaluate((id) => window.__pairedCall.control(id, "setMicrophoneEnabled", true), userId), true, `${userId} unmute`);
        assert.equal(await page.evaluate((id) => window.__pairedCall.control(id, "toggleCamera"), userId), true, `${userId} camera off`);
        await wait(page, (state) => state.endpoints.every((endpoint) => endpoint.participants.some((participant) => participant.userId === userId && participant.cameraOn === false)), `${userId} camera-off must project on both actual hooks`);
        await wait(page, (state) => {
          const remote = state.endpoints.find((endpoint) => endpoint.userId !== userId);
          return remote.pixels.length > 0 && remote.pixels.every((frame) => frame.brightness < 5);
        }, `${userId} camera-off must actually remove the picture at the receiving endpoint`);
        assert.equal(await page.evaluate((id) => window.__pairedCall.control(id, "toggleCamera"), userId), true, `${userId} camera on`);
        const baseline = await page.evaluate(() => window.__pairedCall.read());
        await wait(page, (state) => state.endpoints.every((endpoint, index) => media(endpoint, "video") > media(baseline.endpoints[index], "video") + 3 && media(endpoint, "audio") > media(baseline.endpoints[index], "audio") && hasColor(endpoint) && endpoint.peers.filter((peer) => peer.connection === "connected").length === 1), `${userId} cycle ${cycle + 1} must preserve real received media and one peer`);
      }
    }
    const beforeEnd = await page.evaluate(() => window.__pairedCall.read());
    assert.ok(beforeEnd.events.some((event) => event.kind === "presence-leave" && event.remaining > 0), "exercise real SDK metadata-replacement leave events");
    await page.evaluate(() => window.__pairedCall.end());
    await wait(page, (state) => state.endpoints.every((endpoint) => endpoint.peers.every((peer) => peer.connection === "closed") && endpoint.tracks.every((track) => track.state === "ended")), "End must close actual peers and end every acquired track");
    console.log("PASS: real two-hook offer/answer, changing received video pixels/audio energy, six silence/black-frame/restoration cycles, projection, and cleanup");
    await page.evaluate(() => window.__pairedCall.freshCall());
    await wait(page, (state) => state.endpoints.length === 2 && state.endpoints.every((endpoint) => endpoint.peers.filter((peer) => peer.connection === "connected").length === 1 && media(endpoint, "video") > 5 && media(endpoint, "audio") > 0 && hasColor(endpoint)), "A fresh call must receive media after prior End in the same mounted hooks and browser context");
    const freshBaseline = await page.evaluate(() => window.__pairedCall.read());
    await wait(page, (state) => state.endpoints.every((endpoint, index) => media(endpoint, "video") > media(freshBaseline.endpoints[index], "video") + 3 && media(endpoint, "audio") > media(freshBaseline.endpoints[index], "audio")), "Fresh-call received counters must advance independently of retired peer statistics");
    await page.evaluate(() => window.__pairedCall.end());
    await wait(page, (state) => state.endpoints.every((endpoint) => endpoint.peers.every((peer) => peer.connection === "closed") && endpoint.tracks.every((track) => track.state === "ended")), "Fresh-call cleanup must also retire all resources");
    console.log("PASS: fresh call in the same mounted hooks/context after completed cleanup");
  } finally { await page.evaluate(() => window.__pairedCall.dispose()); await context.close(); }
  const negative = await run(true);
  try {
    await wait(negative.page, (state) => state.events.some((event) => event.event === "webrtc:answer"), "negative control must reach actual answer creation");
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const state = await negative.page.evaluate(() => window.__pairedCall.read());
    assert.ok(state.endpoints.some((endpoint) => !endpoint.peers.some((peer) => peer.connection === "connected")), "Dropping real answers must prevent full connection; no simulated auto-answer");
    assert.ok(state.endpoints.every((endpoint) => endpoint.channelState !== "live"), "Missing answer must not falsely project either call as live");
    assert.ok(state.endpoints.some((endpoint) => media(endpoint, "video") === 0), "Dropped answer must block at least one received video stream");
    console.log("PASS: dropped-answer negative control fails connection/media proof");
  } finally { await negative.page.evaluate(() => window.__pairedCall.dispose()); await negative.context.close(); }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
