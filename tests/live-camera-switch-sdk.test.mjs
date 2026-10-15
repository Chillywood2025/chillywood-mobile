import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
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

// Preserved source from merged main 985409b4. The same real SDK scenario must
// reject this former cancellation behavior, not merely pass a modeled owner.
const formerSwitch = evaluate("tests/fixtures/owned-camera-switch-before-reconnect-fix.txt", {
  "livekit-client": livekit, "../communicationCaptureRetirement": retirement,
}).OwnedLiveCameraSwitch;
assert.equal(createHash("sha256").update(fs.readFileSync("tests/fixtures/owned-camera-switch-before-reconnect-fix.txt")).digest("hex"),
  "82ef540526a7086124f690e2ec018f0511bd2bd9926a562b9b48208d573fa754", "former source must remain the exact reviewed baseline");

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

async function mountSignalRoom(t, platform = "android", former = false) {
  const React = require("react"), { createRoot } = require("react-dom/client");
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const noop = () => {};
  const document = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
  const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml",
    nodeName: "DIV", nodeType: 1, ownerDocument: document, parentNode: null, tagName: "DIV" });
  document.documentElement = container(); globalThis.document = document; globalThis.window = globalThis;
  globalThis.HTMLIFrameElement = class {};
  const h = await setup(t, platform), snapshots = [], timers = new Set();
  Object.defineProperty(globalThis, "navigator", { configurable: true,
    value: { product: "ReactNative", userAgent: "ReactNative", mediaDevices: h.r.mediaDevices } });
  const room = new livekit.Room();
  room.localParticipant.permissions = { canPublish: true };
  const pub = new livekit.LocalTrackPublication(livekit.Track.Kind.Video,
    { sid: "TR_camera", name: "camera", source: 1 }, h.owner);
  room.localParticipant.addTrackPublication(pub);
  room.setAndEmitConnectionState(livekit.ConnectionState.Connected);
  const deps = {
    react: React, "react-native": { Platform: { OS: platform }, AppState: { currentState: "active",
      addEventListener: () => ({ remove() {} }) } },
    "expo-constants": { default: { expoConfig: { extra: { runtime: {
      otaGeneration: { internalOnly: true, channel: `${platform}-internal-v2` } } } } } },
    "expo-updates": { channel: `${platform}-internal-v2` }, "livekit-client": livekit,
    "../modules/chillywood-camera-effects": { default: null },
    "../_lib/livekit/cameraEffectsController": evaluate("_lib/livekit/cameraEffectsController.ts"),
    "../_lib/communication": h.r.api,
    "../_lib/livekit/ownedCameraSwitch": { OwnedLiveCameraSwitch: former ? formerSwitch : OwnedLiveCameraSwitch },
  };
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("hooks/use-live-camera-effects.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require(name) { assert.ok(Object.hasOwn(deps, name), name); return deps[name]; },
    setInterval(fn) { timers.add(fn); return fn; }, clearInterval(fn) { timers.delete(fn); } });
  function Harness() { exports.useLiveCameraEffects({ room, allowed: true, onCameraEffectsControls: s => snapshots.push(s) }); return null; }
  const root = createRoot(container());
  await React.act(async () => root.render(React.createElement(Harness)));
  t.after(async () => { await React.act(async () => root.unmount()); room.clearConnectionReconcile(); });
  let captureSerial = 0;
  const completeCapture = (constraints, success, prefix = "retry") => success(`${prefix}-${++captureSerial}`, [{
    id: `${prefix}-${captureSerial}-video`, kind: "video", remote: false, enabled: true,
    peerConnectionId: -1, readyState: "live", settings: constraints.video,
  }]);
  return { ...h, room, pub, snapshots, tick() { for (const fn of timers) fn(); },
    resume() { room.engine.emit("resumed"); }, reconnect() { room.engine.emit("resuming"); },
    ordinaryCapture() { h.r.setCapture(completeCapture); },
    delayedCapture() {
      let finish;
      h.r.setCapture((constraints, success) => { finish = () => completeCapture(constraints, success, "late"); });
      return () => { assert.ok(finish); finish(); };
    },
  };
}

function assertInterruptedCamera(h) {
  assert.equal(h.pub.isMuted, true, "an interrupted stopped source must be explicitly muted");
  assert.equal(h.owner.mediaStreamTrack.readyState, "ended");
  assert.match(h.snapshots.at(-1).cameraSwitchReason ?? "", /camera.*on.*try again/iu);
  assert.equal(h.audio.readyState, "live");
  assert.equal(h.audio.enabled, true);
}

for (const platform of ["android", "ios"]) {
  for (const settles of ["before-resume", "after-resume"]) test(`${platform}: signal reconnect mutes canceled capture ${settles} and normal camera-on recovers`, async t => {
    const h = await mountSignalRoom(t, platform), finish = h.delayedCapture();
    const switching = h.snapshots.at(-1).switchCamera();
    await turn(); h.reconnect(); await turn(); h.tick();
    assertInterruptedCamera(h); // Native acquisition is still unresolved.
    assert.equal(h.room.state, livekit.ConnectionState.SignalReconnecting);
    assert.equal(h.r.calls.captures.length, 2, "reconnect cannot authorize another capture");
    if (settles === "after-resume") h.resume();
    finish(); assert.equal(await switching, false);
    if (settles === "before-resume") h.resume();
    h.tick(); assertInterruptedCamera(h);
    const before = h.r.calls.captures.length;
    h.ordinaryCapture(); await h.room.localParticipant.setCameraEnabled(true); h.tick();
    assert.equal(h.r.calls.captures.length, before + 1);
    assert.equal(h.owner.mediaStreamTrack.readyState, "live");
    assert.equal(h.pub.isMuted, false);
    assert.equal(h.room.localParticipant.getTrackPublication(livekit.Track.Source.Camera), h.pub);
    assert.equal(h.snapshots.at(-1).canSwitchCamera, true);
    assert.equal(h.snapshots.at(-1).cameraSwitchReason, undefined);
    assert.equal(h.audio.readyState, "live");
  });

  test(`${platform}: reconnect during sender ACK remains muted after the SDK installs the retired replacement`, async t => {
    const h = await mountSignalRoom(t, platform), gate = deferred();
    h.r.setReplace(() => gate.promise);
    const switching = h.snapshots.at(-1).switchCamera();
    await turn(); await turn(); h.reconnect(); await turn(); h.tick();
    assertInterruptedCamera(h);
    gate.resolve(true); assert.equal(await switching, false);
    h.resume(); h.tick(); assertInterruptedCamera(h);
    assert.equal(h.owner.sender.track.readyState, "ended");
    h.r.setReplace(async () => true); h.ordinaryCapture();
    await h.room.localParticipant.setCameraEnabled(true); h.tick();
    assert.equal(h.owner.mediaStreamTrack.readyState, "live");
    assert.equal(h.pub.isMuted, false);
  });

  test(`${platform}: late canceled capture cannot re-mute a newer explicit camera-on`, async t => {
    const h = await mountSignalRoom(t, platform), finish = h.delayedCapture();
    const switching = h.snapshots.at(-1).switchCamera();
    await turn(); h.reconnect(); await turn(); h.resume();
    h.ordinaryCapture(); await h.room.localParticipant.setCameraEnabled(true);
    const newer = h.owner.mediaStreamTrack;
    finish(); assert.equal(await switching, false); h.tick();
    assert.equal(h.owner.mediaStreamTrack, newer);
    assert.equal(newer.readyState, "live"); assert.equal(newer.enabled, true);
    assert.equal(h.pub.isMuted, false);
    assert.equal(h.audio.readyState, "live");
  });

  test(`${platform}: a publication successor is never muted by the retired switch`, async t => {
    const h = await mountSignalRoom(t, platform);
    const replacement = (await h.r.api.createCommunicationMediaStream({ audio: false, video: true })).getVideoTracks()[0];
    const newOwner = new livekit.LocalVideoTrack(replacement, replacement.getConstraints(), false);
    newOwner.source = livekit.Track.Source.Camera; await turn(); newOwner.sender = h.r.sender(replacement, "new-sender");
    t.after(() => newOwner.stop());
    const finish = h.delayedCapture(), switching = h.snapshots.at(-1).switchCamera();
    await turn();
    const newPub = new livekit.LocalTrackPublication(livekit.Track.Kind.Video,
      { sid: h.pub.trackSid, name: "new-camera", source: 1 }, newOwner);
    h.room.localParticipant.addTrackPublication(newPub);
    h.room.emit(livekit.RoomEvent.LocalTrackPublished, newPub);
    finish(); assert.equal(await switching, false); h.tick();
    assert.equal(h.room.localParticipant.getTrackPublication(livekit.Track.Source.Camera), newPub);
    assert.equal(newOwner.isMuted, false); assert.equal(newOwner.mediaStreamTrack, replacement);
    assert.equal(replacement.readyState, "live"); assert.equal(replacement.enabled, true);
    assert.equal(h.audio.readyState, "live");
  });

  test(`${platform}: explicit camera-off remains off after cancellation and repeated signal resume`, async t => {
    const h = await mountSignalRoom(t, platform), finish = h.delayedCapture();
    const switching = h.snapshots.at(-1).switchCamera();
    await turn(); h.reconnect(); await turn();
    await h.room.localParticipant.setCameraEnabled(false);
    h.resume(); h.reconnect(); h.resume();
    finish(); assert.equal(await switching, false); h.tick();
    assertInterruptedCamera(h);
    assert.equal(h.r.calls.captures.length, 2, "resume must not silently capture again");
  });
}

test("former merged switch source fails the actual mounted signal-reconnect recovery contract", async t => {
  const h = await mountSignalRoom(t, "android", true), finish = h.delayedCapture();
  const switching = h.snapshots.at(-1).switchCamera();
  await turn(); h.reconnect(); finish(); assert.equal(await switching, false);
  h.resume(); h.tick();
  assert.equal(h.pub.isMuted, false);
  assert.equal(h.owner.mediaStreamTrack.readyState, "ended");
  const before = h.r.calls.captures.length;
  await h.room.localParticipant.setCameraEnabled(true);
  assert.equal(h.r.calls.captures.length, before, "former unmuted-ended state makes ordinary camera-on a no-op");
  assert.throws(() => assertInterruptedCamera(h), /interrupted stopped source must be explicitly muted/u);
});
