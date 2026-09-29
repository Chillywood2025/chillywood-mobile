#!/usr/bin/env node
import assert from "node:assert/strict";
import http from "node:http";
import { createRequire } from "node:module";
import { buildLegacyPairedBrowserBundle } from "../tests/assurance/helpers/legacy-paired-browser-harness.mjs";

const require = createRequire(new URL("../tests/integration/real-peer-browser/package.json", import.meta.url));
const { chromium } = require("./node_modules/playwright");
const bundle = buildLegacyPairedBrowserBundle({ sourceRoot: process.env.CHILLY_CHAT_SOURCE_ROOT || process.cwd() });
const server = http.createServer((request, response) => {
  if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); response.end(bundle); }
  else { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><body><script src="/fixture.js"></script></body></html>'); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const wait = async (page, predicate, description, timeout = 20_000, read = () => window.__pairedCall.read()) => {
  const deadline = Date.now() + timeout;
  let state;
  while (Date.now() < deadline) {
    state = await page.evaluate(read);
    assert.deepEqual(state.errors, [], `browser fixture must not throw\n${JSON.stringify(state, null, 2)}`);
    if (state.callType === "audio") {
      assert.ok([...state.endpoints, ...state.retiredEndpoints].every((endpoint) => endpoint.tracks.every((track) => track.kind === "audio")), "Audio-only production-hook scenarios must never acquire a video track, including retired capture");
    }
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${description}\n${JSON.stringify(state, null, 2)}`);
};
const receivedAudio = (endpoint) => endpoint.audioReceivers.filter((receiver) => receiver.connection === "connected");
const pcmValue = (endpoint, name) => receivedAudio(endpoint).reduce((sum, receiver) => sum + (!receiver.error && Number.isFinite(receiver[name]) ? receiver[name] : Number.NaN), 0);
const audioSamples = (endpoint) => pcmValue(endpoint, "pcmSamples");
const audioPackets = (endpoint) => endpoint.stats.filter((report) => report.kind === "audio").reduce((sum, report) => sum + report.packets, 0);
const media = (endpoint, kind) => kind === "audio" ? pcmValue(endpoint, "pcmEnergy") : endpoint.stats.filter((report) => report.kind === kind).reduce((sum, report) => sum + report.frames, 0);
const hasColor = (endpoint) => endpoint.pixels.some((frame) => frame.brightness > 20);
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHILLY_CHAT_CHROMIUM_PATH || undefined, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--allow-loopback-in-peer-connection"] });
  console.log(`Real peer integration: Chromium ${browser.version()}, production hooks, synthetic local capture, in-memory signaling adapter`);
  const createPage = async () => {
    const context = await browser.newContext();
    await context.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const page = await context.newPage();
    page.on("pageerror", (error) => { console.error(error); });
    await page.goto(origin);
    return { context, page };
  };
  const audioControl = await createPage();
  try {
    await audioControl.page.evaluate(() => window.__pairedCall.startAudioControl());
    const read = () => window.__pairedAudioControl.read();
    const controlPackets = (state) => state.receiverStats.filter((report) => report.type === "inbound-rtp").reduce((sum, report) => sum + (report.packetsReceived ?? 0), 0);
    const first = await wait(audioControl.page, (state) => state.senderConnection === "connected" && state.receiverConnection === "connected"
      && state.received?.pcmSamples > 2048 && state.received.pcmEnergy > 0 && !state.received.error
      && !state.received.playbackPaused && state.received.playbackReadyState >= 2 && controlPackets(state) > 0,
    "Independent native two-peer audio control must receive actual RTP and nonzero remote-track PCM before testing production hooks", 20_000, read);
    console.log(`Audio control initial diagnostics: ${JSON.stringify(first)}`);
    await audioControl.page.evaluate(() => window.__pairedAudioControl.setEnabled(false));
    await new Promise((resolve) => setTimeout(resolve, 300));
    const silentStart = await audioControl.page.evaluate(read);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const silentEnd = await audioControl.page.evaluate(read);
    assert.ok(silentEnd.received.pcmSamples > silentStart.received.pcmSamples && controlPackets(silentEnd) > controlPackets(silentStart), "Independent disabled-track control must keep receiving actual RTP and measured input samples");
    assert.ok(silentEnd.received.pcmEnergy - silentStart.received.pcmEnergy < 0.0001, "Independent disabled-track control must receive silence");
    await audioControl.page.evaluate(() => window.__pairedAudioControl.setEnabled(true));
    await wait(audioControl.page, (state) => state.received?.pcmSamples > silentEnd.received.pcmSamples
      && state.received.pcmEnergy > silentEnd.received.pcmEnergy && controlPackets(state) > controlPackets(silentEnd),
    "Independent re-enabled track must restore received PCM energy", 20_000, read);
    console.log("PASS: independent native two-peer audio, received-track PCM, disabled-track silence, and restored audio");
  } finally {
    await audioControl.page.evaluate(async () => { await window.__pairedAudioControl?.dispose(); });
    await audioControl.context.close();
  }
  const run = async (options) => {
    const result = await createPage();
    await result.page.evaluate((input) => window.__pairedCall.start(input), options);
    return result;
  };
  for (const callType of ["video", "audio"]) for (const hostUserId of ["alice", "bob"]) {
  const scenario = `${callType} host=${hostUserId}`;
  const isVideo = callType === "video";
  const hasRequiredMedia = (endpoint) => media(endpoint, "audio") > 0 && audioSamples(endpoint) > 2048 && audioPackets(endpoint) > 0
    && (!isVideo || (media(endpoint, "video") > 5 && hasColor(endpoint)));
  const mediaAdvances = (endpoint, baseline) => media(endpoint, "audio") > media(baseline, "audio")
    && audioSamples(endpoint) > audioSamples(baseline) && audioPackets(endpoint) > audioPackets(baseline)
    && (!isVideo || (media(endpoint, "video") > media(baseline, "video") + 3 && hasColor(endpoint)));
  console.log(`Scenario: ${scenario}; actual production legacy hooks, injected local capture and signaling`);
  const { context, page } = await run({ callType, hostUserId });
  try {
    const first = await wait(page, (state) => state.endpoints.length === 2 && state.endpoints.every((endpoint) => endpoint.channelState === "live" && endpoint.peers.some((peer) => peer.connection === "connected") && hasRequiredMedia(endpoint)), `${scenario}: both real peers must negotiate and receive actual RTP and nonzero received PCM, plus video for video calls`);
    assert.equal(first.hostUserId, hostUserId, `${scenario}: the fixture retains the configured host`);
    assert.deepEqual(first.memberships.filter((member) => member.role === "host").map((member) => member.userId), [hostUserId], `${scenario}: the durable fixture assigns only the configured host role`);
    for (const endpoint of first.endpoints) {
      assert.equal(endpoint.roomHostUserId, hostUserId, `${scenario}: ${endpoint.userId}'s actual hook must resolve the configured host`);
      assert.deepEqual(endpoint.participants.filter((participant) => participant.isHost).map((participant) => participant.userId), [hostUserId], `${scenario}: both actual hooks must project the configured host`);
    }
    // Host preference governs presence-driven startup and glare handling. The
    // actual initial foreground-media reconciliation can also offer from the
    // participant, so the first packet is not a host/caller-role invariant.
    assert.ok(first.events.some((event) => event.kind === "broadcast" && event.event === "webrtc:offer"), `${scenario}: startup must send an actual SDP offer`);
    assert.ok(first.events.some((event) => event.kind === "broadcast" && event.event === "webrtc:answer"), `${scenario}: startup must send an actual SDP answer`);
    if (isVideo) await wait(page, (state) => state.endpoints.every((endpoint, index) => endpoint.pixels.some((frame) => frame.fingerprint !== first.endpoints[index].pixels[0]?.fingerprint)), "Received pixels must change on both endpoints, not merely repeat a frozen frame");
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
        assert.ok(audioSamples(silentEnd.endpoints[remoteIndex]) > audioSamples(silentStart.endpoints[remoteIndex]), `${userId} mute must keep receiving measured PCM samples; missing audio is not silence`);
        assert.ok(audioPackets(silentEnd.endpoints[remoteIndex]) > audioPackets(silentStart.endpoints[remoteIndex]), `${userId} mute must keep receiving actual audio RTP packets`);
        assert.ok(media(silentEnd.endpoints[remoteIndex], "audio") - media(silentStart.endpoints[remoteIndex], "audio") < 0.0001, `${userId} mute must stop received synthetic audio energy`);
        assert.equal(await page.evaluate((id) => window.__pairedCall.control(id, "setMicrophoneEnabled", true), userId), true, `${userId} unmute`);
        if (isVideo) {
        assert.equal(await page.evaluate((id) => window.__pairedCall.control(id, "toggleCamera"), userId), true, `${userId} camera off`);
        await wait(page, (state) => state.endpoints.every((endpoint) => endpoint.participants.some((participant) => participant.userId === userId && participant.cameraOn === false)), `${userId} camera-off must project on both actual hooks`);
        await wait(page, (state) => {
          const remote = state.endpoints.find((endpoint) => endpoint.userId !== userId);
          return remote.pixels.length > 0 && remote.pixels.every((frame) => frame.brightness < 5);
        }, `${userId} camera-off must actually remove the picture at the receiving endpoint`);
        assert.equal(await page.evaluate((id) => window.__pairedCall.control(id, "toggleCamera"), userId), true, `${userId} camera on`);
        }
        const baseline = await page.evaluate(() => window.__pairedCall.read());
        await wait(page, (state) => state.endpoints.every((endpoint, index) => mediaAdvances(endpoint, baseline.endpoints[index]) && endpoint.peers.filter((peer) => peer.connection === "connected").length === 1), `${scenario}: ${userId} cycle ${cycle + 1} must preserve real received media and one peer`);
      }
    }
    for (const userId of ["alice", "bob"]) {
      const beforeReacquisition = await page.evaluate(() => window.__pairedCall.read());
      const owner = beforeReacquisition.endpoints.find((endpoint) => endpoint.userId === userId);
      assert.deepEqual(await page.evaluate((id) => window.__pairedCall.stopLocalCapture(id, "audio"), userId),
        { count: 1, kind: "audio", state: "ended" }, `${scenario}: ${userId} must end exactly one real audio capture before reacquisition`);
      assert.equal(await page.evaluate((id) => window.__pairedCall.control(id, "setMicrophoneEnabled", true), userId), true,
        `${scenario}: ${userId}'s actual hook must complete microphone reacquisition and SDP negotiation`);
      const afterReacquisition = await page.evaluate(() => window.__pairedCall.read());
      await wait(page, (state) => {
        const current = state.endpoints.find((endpoint) => endpoint.userId === userId);
        return current.membership.membershipGeneration === owner.membership.membershipGeneration
          && current.membership.micEnabled === true && current.micEnabled === true
          && current.tracks.filter((track) => track.kind === "audio" && track.state === "live" && track.enabled).length === 1
          && state.events.slice(beforeReacquisition.events.length).some((event) => event.kind === "broadcast"
            && event.event === "webrtc:offer" && event.sender === userId && event.generation === owner.membership.membershipGeneration)
          && state.endpoints.every((endpoint, index) => mediaAdvances(endpoint, afterReacquisition.endpoints[index])
            && endpoint.peers.filter((peer) => peer.connection === "connected" && peer.signaling === "stable").length === 1);
      }, `${scenario}: ${userId}'s actual SDP offer must settle and restore received media with one current capture`);
    }
    console.log(`PASS: both actual offerers complete microphone reacquisition and received-media recovery (${scenario})`);
    for (const userId of ["alice", "bob"]) {
      const beforeBackground = await page.evaluate(() => window.__pairedCall.read());
      const owner = beforeBackground.endpoints.find((endpoint) => endpoint.userId === userId);
      await page.evaluate((id) => window.__pairedCall.setAppState(id, "background"), userId);
      await wait(page, (state) => {
        const local = state.endpoints.find((endpoint) => endpoint.userId === userId);
        return local.appState === "background" && local.membership.micEnabled === false && local.membership.cameraEnabled === false
          && local.tracks.every((track) => track.kind === "video" ? track.state === "ended" : track.state === "ended" || !track.enabled)
          && state.endpoints.every((endpoint) => endpoint.participants.some((participant) => participant.userId === userId && !participant.micOn && !participant.cameraOn));
      }, `${scenario}: injected AppState background must apply actual capture privacy and durable/peer projection`);
      await new Promise((resolve) => setTimeout(resolve, 300));
      const silentStart = await page.evaluate(() => window.__pairedCall.read());
      await new Promise((resolve) => setTimeout(resolve, 300));
      const silentEnd = await page.evaluate(() => window.__pairedCall.read());
      const remoteStart = silentStart.endpoints.find((endpoint) => endpoint.userId !== userId);
      const remoteEnd = silentEnd.endpoints.find((endpoint) => endpoint.userId !== userId);
      assert.ok(audioSamples(remoteEnd) > audioSamples(remoteStart) && audioPackets(remoteEnd) > audioPackets(remoteStart), `${scenario}: injected background must preserve measured received samples/RTP for the privacy check`);
      assert.ok(media(remoteEnd, "audio") - media(remoteStart, "audio") < 0.0001, `${scenario}: injected background must deliver actual silence`);
      await page.evaluate((id) => window.__pairedCall.setAppState(id, "active"), userId);
      const resumed = await wait(page, (state) => {
        const local = state.endpoints.find((endpoint) => endpoint.userId === userId);
        return local.appState === "active" && local.membership.micEnabled === true && local.membership.cameraEnabled === isVideo
          && local.membership.membershipGeneration === owner.membership.membershipGeneration
          && state.endpoints.every((endpoint, index) => endpoint.channelState === "live" && mediaAdvances(endpoint, silentEnd.endpoints[index])
            && endpoint.peers.filter((peer) => peer.connection === "connected").length === 1);
      }, `${scenario}: injected foreground must restore real received media under the same membership owner`);
      assert.deepEqual(resumed.endpoints.map((endpoint) => endpoint.instanceId), beforeBackground.endpoints.map((endpoint) => endpoint.instanceId), "AppState recovery must use the mounted production hooks");
    }
    console.log(`PASS: injected AppState background privacy and foreground received-media recovery on both endpoints (${scenario}; browser lifecycle adapter, not mobile OS suspension)`);
    for (const observeAbsence of [false, true]) {
    const beforeRestart = await page.evaluate(() => window.__pairedCall.read());
    const oldPeerIds = beforeRestart.endpoints.flatMap((endpoint) => endpoint.peers.map((peer) => peer.id));
    const originalAlice = beforeRestart.endpoints.find((endpoint) => endpoint.userId === "alice");
    const originalBob = beforeRestart.endpoints.find((endpoint) => endpoint.userId === "bob");
    assert.deepEqual(await page.evaluate(() => {
      window.__pairedCall.holdNextSignal("bob", "webrtc:offer");
      // Ordinary mute preserves sender topology and needs no SDP. Ending the
      // actual capture forces the hook to reacquire and replace its track.
      const stopped = window.__pairedCall.stopLocalCapture("bob", "audio");
      window.__pairedCall.beginControl("bob", "setMicrophoneEnabled", true);
      return stopped;
    }), { count: 1, kind: "audio", state: "ended" }, "End exactly one real Bob audio capture before exercising strict reacquisition");
    await wait(page, (state) => state.heldSignals.some((signal) => signal.sender === "bob" && signal.event === "webrtc:offer" && signal.generation === originalBob.membership.membershipGeneration), "Hold an actual, server-admitted Bob SDP offer before its first delivery");
    let replacement;
    let returnedAt;
    if (observeAbsence) {
    const departure = await page.evaluate(() => window.__pairedCall.departEndpoint("bob"));
    assert.equal(departure.roomId, beforeRestart.roomId, "Absence and return must stay in the same room");
    assert.equal(departure.retiredInstanceId, originalBob.instanceId);
    const isActuallyAbsent = (state) => {
      const alice = state.endpoints.find((endpoint) => endpoint.userId === "alice");
      const bobMembership = state.memberships.find((membership) => membership.userId === "bob");
      const retired = state.retiredEndpoints.find((endpoint) => endpoint.instanceId === originalBob.instanceId);
      assert.equal(bobMembership?.membershipGeneration, originalBob.membership.membershipGeneration, "Absence cannot be manufactured by rotating durable ownership");
      assert.equal(bobMembership?.membershipState, "active", "Absence cannot be manufactured by ending durable membership");
      assert.equal(bobMembership?.leftAt, null, "The departed endpoint has not issued End");
      assert.equal(alice?.membership.membershipGeneration, originalAlice.membership.membershipGeneration, "The surviving owner must remain current during peer absence");
      return state.endpoints.length === 1 && alice.instanceId === originalAlice.instanceId && alice.channelState === "reconnecting"
        && alice.participants.every((participant) => participant.userId !== "bob" || participant.connectionState !== "connected")
        && alice.peers.every((peer) => peer.connection !== "connected" || ["disconnected", "failed", "closed"].includes(peer.ice))
        && retired.peers.every((peer) => peer.connection === "closed") && retired.tracks.every((track) => track.state === "ended")
        && retired.pendingControl?.settled && retired.pendingControl.result === false
        && state.events.some((event) => event.kind === "presence-leave" && event.key === "bob" && event.remaining === 0);
    };
    await wait(page, isActuallyAbsent, `${scenario}: actual endpoint departure must demote the surviving hook after real RTC loss, without changing durable membership`, 45_000);
    // An observed interval distinguishes absence/return from immediate owner
    // replacement. Every sample must retain truthful disconnected UI state.
    for (let sample = 0; sample < 6; sample += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const absent = await page.evaluate(() => window.__pairedCall.read());
      assert.deepEqual(absent.errors, []);
      assert.ok(isActuallyAbsent(absent), `${scenario}: no stale Connected participant or channel during the absent interval`);
    }
    returnedAt = Date.now();
    replacement = await page.evaluate(() => window.__pairedCall.returnEndpoint("bob"));
    } else {
      replacement = await page.evaluate(() => window.__pairedCall.restartEndpoint("bob"));
    }
    assert.equal(replacement.roomId, beforeRestart.roomId);
    assert.equal(replacement.retiredInstanceId, originalBob.instanceId);
    const restarted = await wait(page, (state) => {
      const alice = state.endpoints.find((endpoint) => endpoint.userId === "alice");
      const bob = state.endpoints.find((endpoint) => endpoint.userId === "bob");
      const retired = state.retiredEndpoints.find((endpoint) => endpoint.instanceId === originalBob.instanceId);
      return alice?.instanceId === originalAlice.instanceId
        && alice.membership.membershipGeneration === originalAlice.membership.membershipGeneration
        && bob?.instanceId === replacement.replacementInstanceId
        && bob.membership.membershipGeneration !== originalBob.membership.membershipGeneration
        && retired?.peers.every((peer) => peer.connection === "closed")
        && retired.tracks.every((track) => track.state === "ended")
        && retired.pendingControl?.settled && retired.pendingControl.result === false
        && state.endpoints.every((endpoint) => endpoint.channelState === "live"
          && endpoint.peers.filter((peer) => peer.connection === "connected" && peer.signaling === "stable" && !oldPeerIds.includes(peer.id)).length === 1
          && endpoint.peers.filter((peer) => oldPeerIds.includes(peer.id)).every((peer) => peer.connection === "closed")
          && endpoint.stats.every((report) => !oldPeerIds.includes(report.peerId))
          && receivedAudio(endpoint).every((receiver) => !oldPeerIds.includes(receiver.peerId))
          && endpoint.pixels.every((frame) => !oldPeerIds.includes(frame.peerId))
          && hasRequiredMedia(endpoint));
    }, "Same-room Bob app restart must retire old resources and make unchanged Alice receive real media through a new peer");
    const advanced = await wait(page, (state) => state.endpoints.every((endpoint) => {
      const baseline = restarted.endpoints.find((candidate) => candidate.instanceId === endpoint.instanceId);
      return baseline && endpoint.membership.membershipGeneration === baseline.membership.membershipGeneration && mediaAdvances(endpoint, baseline)
        && (!isVideo || endpoint.pixels.some((frame) => frame.fingerprint !== baseline.pixels[0]?.fingerprint));
    }), "Replacement peers must receive advancing audio, decoded frames, and changing pixels independently of retired statistics");
    if (observeAbsence) {
      assert.ok(Date.now() - returnedAt < 20_000, `${scenario}: returning peer must restore actual advancing media within the bounded recovery deadline`);
      console.log(`PASS: controlled peer absence interval, truthful reconnecting projection, unchanged surviving ownership, and bounded real-media return (${scenario})`);
    }
    const aliceBeforeOldPacket = advanced.endpoints.find((endpoint) => endpoint.userId === "alice");
    assert.equal(await page.evaluate(() => window.__pairedCall.releaseHeldSignals()), 1, "Release the original delayed offer with its original admission stamp");
    await new Promise((resolve) => setTimeout(resolve, 400));
    await wait(page, (state) => {
      const aliceAfterOldPacket = state.endpoints.find((endpoint) => endpoint.userId === "alice");
      assert.equal(aliceAfterOldPacket.membership.membershipGeneration, originalAlice.membership.membershipGeneration, "The surviving owner must remain unchanged after return and stale SDP delivery");
      assert.deepEqual(aliceAfterOldPacket.peers.map(({ id, remoteDescriptionApplications }) => ({ id, remoteDescriptionApplications })), aliceBeforeOldPacket.peers.map(({ id, remoteDescriptionApplications }) => ({ id, remoteDescriptionApplications })), "Old-generation SDP must neither create a peer nor reach setRemoteDescription after the replacement is authoritative");
      return mediaAdvances(aliceAfterOldPacket, aliceBeforeOldPacket);
    }, "Alice must keep receiving actual replacement media after dropping the stale offer");
    console.log(`PASS: same-room one-endpoint app restart, new-peer received media, retired resources, and delayed old-generation SDP rejection (${scenario}; ${observeAbsence ? "after observed absence" : "immediate replacement"})`);
    }
    const beforeEnd = await page.evaluate(() => window.__pairedCall.read());
    assert.ok(beforeEnd.events.some((event) => event.kind === "presence-leave" && event.remaining > 0), "exercise real SDK metadata-replacement leave events");
    await page.evaluate(() => window.__pairedCall.end());
    await wait(page, (state) => state.endpoints.every((endpoint) => endpoint.peers.every((peer) => peer.connection === "closed") && endpoint.tracks.every((track) => track.state === "ended")), "End must close actual peers and end every acquired track");
    console.log(isVideo
      ? `PASS: real two-hook offer/answer, changing received video pixels/PCM audio energy, six measured silence/black-frame/restoration cycles, projection, and cleanup (${scenario})`
      : `PASS: audio-only production hooks, zero video capture, six received-PCM silence/restoration cycles, projection, and cleanup (${scenario})`);
    await page.evaluate(() => window.__pairedCall.freshCall());
    await wait(page, (state) => state.endpoints.length === 2 && state.endpoints.every((endpoint) => endpoint.peers.filter((peer) => peer.connection === "connected").length === 1 && hasRequiredMedia(endpoint)), "A fresh call must receive media after prior End in the same mounted hooks and browser context");
    const freshBaseline = await page.evaluate(() => window.__pairedCall.read());
    await wait(page, (state) => state.endpoints.every((endpoint, index) => mediaAdvances(endpoint, freshBaseline.endpoints[index])), "Fresh-call received counters must advance independently of retired peer statistics");
    await page.evaluate(() => window.__pairedCall.end());
    await wait(page, (state) => state.endpoints.every((endpoint) => endpoint.peers.every((peer) => peer.connection === "closed") && endpoint.tracks.every((track) => track.state === "ended")), "Fresh-call cleanup must also retire all resources");
    console.log(`PASS: fresh call in the same mounted hooks/context after completed cleanup (${scenario})`);
  } finally { await page.evaluate(() => window.__pairedCall.dispose()); await context.close(); }
  const negative = await run({ callType, hostUserId, dropAnswers: true });
  try {
    await wait(negative.page, (state) => state.events.some((event) => event.event === "webrtc:answer"), "negative control must reach actual answer creation");
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const state = await negative.page.evaluate(() => window.__pairedCall.read());
    assert.ok(state.endpoints.some((endpoint) => !endpoint.peers.some((peer) => peer.connection === "connected")), "Dropping real answers must prevent full connection; no simulated auto-answer");
    assert.ok(state.endpoints.every((endpoint) => endpoint.channelState !== "live"), "Missing answer must not falsely project either call as live");
    assert.ok(state.endpoints.some((endpoint) => audioPackets(endpoint) === 0 && media(endpoint, "audio") === 0), "Dropped answer must block at least one actual received audio RTP/PCM stream");
    if (isVideo) assert.ok(state.endpoints.some((endpoint) => media(endpoint, "video") === 0), "Dropped answer must block at least one received video stream");
    console.log(`PASS: dropped-answer negative control fails connection/media proof (${scenario})`);
  } finally { await negative.page.evaluate(() => window.__pairedCall.dispose()); await negative.context.close(); }
  }
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
