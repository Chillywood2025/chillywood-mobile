import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const React = require("react");
const { createRoot } = require("react-dom/client");
const ts = require("typescript");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const document = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml",
  nodeName: "DIV", nodeType: 1, ownerDocument: document, parentNode: null, tagName: "DIV" });
document.documentElement = container(); globalThis.document = document; globalThis.window = globalThis;
globalThis.HTMLIFrameElement = class {};
function evaluate(file, dependencies, extra = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText, { exports, require: name => {
    assert.ok(Object.hasOwn(dependencies, name), `modeled dependency: ${name}`); return dependencies[name];
  }, ...extra }); return exports;
}
const controller = evaluate("_lib/livekit/cameraEffectsController.ts", {});
async function mount(t, { allowed = true, channel = "android-internal-v2" } = {}) {
  const calls = [], snapshots = [], timers = new Set(), listeners = new Map(), appListeners = new Set();
  let status = { state: "starting", processedFrames: 0 };
  const native = { capabilities: () => ({ studioLighting: true, chicagoSkyline: true, depthMode: "subject-parallax" }),
    configure: (id, effect) => { calls.push(["configure", id, effect]); return { processorName: id }; },
    release: id => calls.push(["release", id]), status: () => status };
  const track = id => ({ id, kind: "video", enabled: true, readyState: "live", remote: false,
    _setVideoEffects: names => calls.push(["effects", id, names === null ? null : [...names]]),
    getSettings: () => ({ facingMode: "user" }), applyConstraints: async () => {} });
  let publication = { isMuted: false, track: { mediaStreamTrack: track("camera-a") } };
  const room = { state: "connected", localParticipant: { permissions: { canPublish: true }, getTrackPublication: () => publication },
    on(event, fn) { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event).add(fn); },
    off(event, fn) { listeners.get(event)?.delete(fn); } };
  const events = Object.fromEntries(["LocalTrackPublished", "LocalTrackUnpublished", "TrackMuted", "TrackUnmuted",
    "ConnectionStateChanged", "ParticipantPermissionsChanged"].map(k => [k, k]));
  const hook = evaluate("hooks/use-live-camera-effects.ts", {
    react: React, "react-native": { Platform: { OS: "android" }, AppState: { currentState: "active",
      addEventListener: (_, fn) => { appListeners.add(fn); return { remove: () => appListeners.delete(fn) }; } } },
    "expo-constants": { expoConfig: { extra: { runtime: { otaGeneration: { internalOnly: true, channel: "android-internal-v2" } } } } },
    "expo-updates": { channel }, "livekit-client": { ConnectionState: { Connected: "connected" }, RoomEvent: events, Track: { Source: { Camera: "camera" } } },
    "../modules/chillywood-camera-effects": native, "../_lib/livekit/cameraEffectsController": controller,
  }, { setInterval(fn) { timers.add(fn); return fn; }, clearInterval(fn) { timers.delete(fn); } });
  let props = { room, allowed, cameraEffectId: "studio-light", cameraEffectIntensity: 0.5,
    onCameraEffectsControls: value => snapshots.push(value) };
  function Harness({ value }) { hook.useLiveCameraEffects(value); return null; }
  const root = createRoot(container()); let mounted = true;
  async function update(patch = {}) { props = { ...props, ...patch }; await React.act(async () => root.render(React.createElement(Harness, { value: props }))); }
  async function unmount() { if (mounted) { mounted = false; await React.act(async () => root.unmount()); } }
  t.after(unmount); await update();
  return { calls, snapshots, timers, listeners, room, track, update, unmount,
    appState(value) { for (const fn of appListeners) fn(value); },
    setPublication(value) { publication = value; }, get publication() { return publication; },
    setStatus(value) { status = value; }, tick() { for (const fn of timers) fn(); },
    emit(name) { for (const fn of listeners.get(name) ?? []) fn(); },
  };
}

test("mounted hook applies only to the published authorized camera", async t => {
  const h = await mount(t); assert.deepEqual(h.calls, [["configure", "camera-a", "studio-light"], ["effects", "camera-a", ["camera-a"]]]);
  h.tick(); h.tick(); assert.equal(h.calls.length, 2);
  assert.equal(h.snapshots.at(-1).state, "starting");
  h.setStatus({ state: "active", processedFrames: 1 }); h.tick(); assert.equal(h.snapshots.at(-1).state, "active");
  const notifications = h.snapshots.length;
  h.setStatus({ state: "active", processedFrames: 50 }); h.tick(); assert.equal(h.snapshots.length, notifications);
});

test("mounted role revocation detaches before later polling", async t => {
  const h = await mount(t); h.calls.length = 0; h.room.localParticipant.permissions.canPublish = false;
  h.emit("ParticipantPermissionsChanged");
  assert.deepEqual(h.calls, [["release", "camera-a"], ["effects", "camera-a", null]]);
  h.tick(); assert.equal(h.calls.length, 2); assert.equal(h.snapshots.at(-1).canSwitchCamera, false);
});

test("mounted background/inactive-owner transition releases and foreground rebinds", async t => {
  const h = await mount(t); await h.update({ allowed: false });
  assert.equal(h.snapshots.at(-1).state, "unavailable"); h.calls.length = 0;
  await h.update({ allowed: true }); assert.equal(h.calls[0][0], "configure");
});

test("native app-state boundary resets effects even before the parent updates allowed", async t => {
  const h = await mount(t); h.calls.length = 0; h.appState("background");
  assert.equal(h.calls[0][0], "release"); h.calls.length = 0; h.tick(); assert.equal(h.calls.length, 0);
  h.appState("active"); assert.equal(h.calls[0][0], "configure");
});

test("mounted disconnected room cannot process; reconnect reattaches", async t => {
  const h = await mount(t); h.room.state = "reconnecting"; h.emit("ConnectionStateChanged");
  assert.equal(h.snapshots.at(-1).state, "unavailable"); h.calls.length = 0;
  h.room.state = "connected"; h.emit("ConnectionStateChanged"); assert.equal(h.calls[0][0], "configure");
});

test("mounted native SDK camera replacement is detected even without publication events", async t => {
  const h = await mount(t); h.calls.length = 0;
  h.publication.track.mediaStreamTrack = h.track("replacement"); h.tick();
  assert.deepEqual(h.calls, [["release", "camera-a"], ["effects", "camera-a", null],
    ["configure", "replacement", "studio-light"], ["effects", "replacement", ["replacement"]]]);
});

test("mounted mute/unpublish cannot keep a processor alive", async t => {
  const h = await mount(t); h.publication.isMuted = true; h.emit("TrackMuted");
  assert.equal(h.snapshots.at(-1).state, "unavailable");
  h.setPublication(undefined); h.emit("LocalTrackUnpublished"); assert.equal(h.calls.filter(c => c[0] === "release").length, 1);
});

test("mounted viewer and mismatched public channels fail closed", async t => {
  const viewer = await mount(t, { allowed: false }); assert.equal(viewer.calls.length, 0);
  const publicBuild = await mount(t, { channel: "production" }); assert.equal(publicBuild.calls.length, 0);
  assert.equal(publicBuild.snapshots.at(-1).capabilities.studioLighting, false);
});

test("mounted effect selection and off callback act immediately and cleanup is complete", async t => {
  const h = await mount(t); await h.update({ cameraEffectId: "chicago-skyline", cameraEffectIntensity: 0.75 });
  assert.equal(h.calls.at(-2)[2], "chicago-skyline"); h.calls.length = 0;
  h.snapshots.at(-1).select("off", 0.75);
  assert.equal(h.calls[0][0], "release");
  await h.update({ cameraEffectId: "off" });
  await h.unmount(); assert.equal(h.timers.size, 0);
  assert.equal([...h.listeners.values()].reduce((sum, list) => sum + list.size, 0), 0);
  assert.equal(h.snapshots.at(-1).canSwitchCamera, false);
  h.calls.length = 0; h.snapshots.at(-1).select("studio-light", 1); assert.equal(h.calls.length, 0);
});
