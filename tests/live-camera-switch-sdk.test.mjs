import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import test from "node:test";
import * as livekit from "livekit-client";
import { runtime } from "./assurance/chat-call-sdk-contract.test.mjs";

const require = createRequire(import.meta.url), ts = require("typescript");
function evaluate(file, dependencies = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require(name) { assert.ok(Object.hasOwn(dependencies, name), name); return dependencies[name]; } });
  return exports;
}
const retirement = evaluate("_lib/communicationCaptureRetirement.ts");
const { OwnedLiveCameraSwitch } = evaluate("_lib/livekit/ownedCameraSwitch.ts", {
  "livekit-client": livekit, "../communicationCaptureRetirement": retirement,
});
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const turn = () => new Promise(resolve => setTimeout(resolve, 0));

// Actual installed LiveKit LocalVideoTrack.replaceTrack, actual RN WebRTC
// MediaStreamTrack/Sender/getUserMedia and the complete existing capture helper.
// Only the OS/native bridge is controlled. These are not physical lens/RTP tests.
async function setup(t, platform = "android") {
  const r = runtime({ platform });
  globalThis.MediaStream = r.MediaStream;
  const stream = await r.api.createCommunicationMediaStream({ audio: true, video: true });
  const old = stream.getVideoTracks()[0], audio = stream.getAudioTracks()[0];
  const owner = new livekit.LocalVideoTrack(old, old.getConstraints(), false);
  owner.source = livekit.Track.Source.Camera;
  await turn();
  owner.sender = r.sender(old);
  let current = true, restarted = 0;
  owner.on(livekit.TrackEvent.Restarted, () => { restarted++; });
  const binding = new OwnedLiveCameraSwitch(owner,
    (facingMode, captureSettings) => r.api.createCommunicationMediaStream({ audio: false, video: true, facingMode, captureSettings }), () => current);
  t.after(() => { binding.cancel(); owner.stop(); audio.stop(); });
  return { r, owner, old, audio, binding, isCurrent: () => current,
    revoke() { current = false; binding.cancel(); }, get restarted() { return restarted; } };
}

for (const platform of ["android", "ios"]) {
  test(`${platform}: owned switch uses real video-only SDK acquisition and acknowledged existing sender replacement`, async t => {
    const h = await setup(t, platform), sender = h.owner.sender;
    const next = await h.binding.switchCamera("environment", h.isCurrent);
    assert.ok(next); assert.notEqual(next, h.old);
    assert.equal(h.old.readyState, "ended");
    assert.equal(next.getSettings().facingMode, "environment");
    assert.equal(h.owner.mediaStreamTrack, next); assert.equal(sender.track, next);
    assert.equal(h.owner.sender, sender); assert.equal(h.restarted, 1);
    assert.equal(h.audio.readyState, "live"); assert.equal(h.audio.enabled, true);
    assert.equal(h.r.calls.captures[1].audio, undefined);
    assert.deepEqual(h.r.calls.captures[1].video, { facingMode: "environment", width: 640, height: 480, frameRate: 15 });
    assert.equal(h.r.calls.captures[1].video.deviceId, undefined);
    const front = await h.binding.switchCamera("user", h.isCurrent);
    assert.ok(front); assert.equal(front.getSettings().facingMode, "user"); assert.equal(next.readyState, "ended");
    assert.equal(h.audio.readyState, "live");
  });

  test(`${platform}: pending native sender acknowledgment keeps replacement disabled and blocks duplicate switches`, async t => {
    const h = await setup(t, platform), gate = deferred();
    h.r.setReplace(() => gate.promise);
    const switching = h.binding.switchCamera("environment", h.isCurrent);
    await turn(); await turn();
    assert.equal(h.owner.sender.track, h.old);
    assert.equal(await h.binding.switchCamera("user", h.isCurrent), null);
    const newId = h.r.calls.replacements[0].track;
    assert.ok(h.r.calls.enabled.some(call => call.id === newId && call.enabled === false));
    gate.resolve(true); assert.ok(await switching);
  });

  test(`${platform}: revoke during native capture retires its late track without any sender replacement`, async t => {
    const h = await setup(t, platform);
    let finish;
    h.r.setCapture((constraints, success) => { finish = () => success("late", [{ id: "late-video", kind: "video", remote: false,
      enabled: true, peerConnectionId: -1, readyState: "live", settings: constraints.video }]); });
    const switching = h.binding.switchCamera("environment", h.isCurrent);
    await turn(); h.revoke(); finish();
    assert.equal(await switching, null); assert.equal(h.r.calls.replacements.length, 0);
    assert.ok(h.r.calls.enabled.some(call => call.id === "late-video" && call.enabled === false));
    assert.equal(retirement.retryRetiredCommunicationCaptures(), true);
    assert.equal(h.audio.readyState, "live");
  });

  test(`${platform}: revoke during sender replacement stops the exact pending camera even after a late acknowledgment`, async t => {
    const h = await setup(t, platform), gate = deferred();
    h.r.setReplace(() => gate.promise);
    const switching = h.binding.switchCamera("environment", h.isCurrent);
    await turn(); await turn(); h.revoke(); gate.resolve(true);
    assert.equal(await switching, null);
    assert.equal(h.owner.sender.track.readyState, "ended"); assert.equal(h.restarted, 0);
    assert.equal(h.audio.readyState, "live");
  });
}

test("real SDK swallowing sender rejection cannot produce a false camera-switch success", async t => {
  const h = await setup(t); h.r.setReplace(async () => { throw new Error("native refusal"); });
  assert.equal(await h.binding.switchCamera("environment", h.isCurrent), null);
  assert.equal(h.owner.sender.track, h.old); assert.equal(h.owner.mediaStreamTrack.readyState, "ended");
  assert.equal(h.owner.isMuted, true); assert.equal(h.restarted, 0); assert.equal(h.audio.readyState, "live");
});

test("wrong facing receipt stops acquired video and never replaces the sender", async t => {
  const h = await setup(t);
  h.r.setCapture((_constraints, success) => success("wrong", [{ id: "wrong-video", kind: "video", remote: false,
    enabled: true, peerConnectionId: -1, readyState: "live", settings: { facingMode: "user" } }]));
  assert.equal(await h.binding.switchCamera("environment", h.isCurrent), null);
  assert.equal(h.r.calls.replacements.length, 0); assert.equal(h.owner.isMuted, true);
  assert.ok(h.r.calls.enabled.some(call => call.id === "wrong-video" && !call.enabled));
});

test("native capture rejection clears pending retirement and leaves audio usable", async t => {
  const h = await setup(t);
  h.r.setCapture((_constraints, _success, failure) => failure("NotReadableError", "unavailable"));
  assert.equal(await h.binding.switchCamera("environment", h.isCurrent), null);
  assert.equal(retirement.retryRetiredCommunicationCaptures(), true);
  assert.equal(h.owner.isMuted, true); assert.equal(h.audio.readyState, "live");
});

test("additional codec capture and missing sender fail before stopping the current camera", async t => {
  const h = await setup(t);
  h.owner.simulcastCodecs.set("h264", {});
  assert.equal(h.binding.available(), false);
  assert.equal(await h.binding.switchCamera("environment", h.isCurrent), null);
  assert.equal(h.old.readyState, "live"); assert.equal(h.r.calls.captures.length, 1);
  h.owner.simulcastCodecs.clear(); h.owner.sender = undefined;
  assert.equal(await h.binding.switchCamera("environment", h.isCurrent), null);
  assert.equal(h.old.readyState, "live");
});

for (const boundary of ["sender-takeover", "upstream-pause"]) test(`pending capture does not replace newer ${boundary} state`, async t => {
  const h = await setup(t);
  let finish;
  h.r.setCapture((constraints, success) => { finish = () => success("late", [{ id: "late-video", kind: "video", remote: false,
    enabled: true, peerConnectionId: -1, readyState: "live", settings: constraints.video }]); });
  const switching = h.binding.switchCamera("environment", h.isCurrent);
  await turn();
  if (boundary === "sender-takeover") await h.owner.sender.replaceTrack(h.audio);
  else await h.owner.pauseUpstream();
  const callsBefore = h.r.calls.replacements.length;
  finish(); assert.equal(await switching, null);
  assert.equal(h.r.calls.replacements.length, callsBefore);
  assert.equal(h.owner.sender.track, boundary === "sender-takeover" ? h.audio : null);
  assert.equal(h.audio.readyState, "live");
});

test("owned replacement preserves the current room camera dimensions within policy bounds", async t => {
  const h = await setup(t);
  Object.assign(h.old._settings, { width: 1280, height: 720, frameRate: 30 });
  assert.ok(await h.binding.switchCamera("environment", h.isCurrent));
  assert.deepEqual(h.r.calls.captures[1].video, { facingMode: "environment", width: 1280, height: 720, frameRate: 30 });
});
