import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const exports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync("_lib/livekit/cameraEffectsController.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports });
const { CameraEffectsController, cameraEffectsInternalBuild, normalizeEffectIntensity } = exports;
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function setup({ internal = true, module = true, capabilities = {} } = {}) {
  const calls = [];
  let status = { state: "starting", processedFrames: 0 };
  const native = {
    capabilities: () => ({ studioLighting: true, chicagoSkyline: true, depthMode: "subject-parallax", ...capabilities }),
    configure: (id, effect, intensity) => { calls.push(["configure", id, effect, intensity]); return { processorName: `effect-${id}` }; },
    release: (id) => calls.push(["release", id]),
    status: () => status,
  };
  const track = (id = "camera-a") => {
    const settings = { facingMode: "user", width: 640, height: 480 };
    return { id, kind: "video", remote: false, enabled: true, readyState: "live",
      _setVideoEffects: names => calls.push(["setEffects", id, names === null ? null : [...names]]),
      getSettings: () => settings,
      getConstraints: () => ({ deviceId: "front-id", width: 640, frameRate: 30 }),
      async applyConstraints(constraints) { calls.push(["constraints", id, constraints]); settings.facingMode = constraints.facingMode; },
    };
  };
  return { native, calls, track, setStatus: value => { status = value; },
    controller: new CameraEffectsController(module ? native : null, internal) };
}

test("effects require both the native internal channel and matching internal runtime", () => {
  for (const platform of ["android", "ios"]) {
    const channel = `${platform}-internal-v2`;
    const runtime = { otaGeneration: { internalOnly: true, channel } };
    assert.equal(cameraEffectsInternalBuild(platform, channel, runtime), true);
    for (const invalid of [null, "production", "preview", "other-internal"]) assert.equal(cameraEffectsInternalBuild(platform, invalid, runtime), false);
    assert.equal(cameraEffectsInternalBuild(platform, channel, { otaGeneration: { channel } }), false);
    assert.equal(cameraEffectsInternalBuild(platform, channel, { otaGeneration: { channel: "production", internalOnly: true } }), false);
  }
  assert.equal(cameraEffectsInternalBuild("web", "web-internal-v2", { otaGeneration: { internalOnly: true, channel: "web-internal-v2" } }), false);
});

test("intensity is bounded including NaN and infinities", () => {
  for (const [input, expected] of [[-1, 0], [2, 1], [0, 0], [0.75, 0.75], [NaN, 0.5], [Infinity, 0.5]]) assert.equal(normalizeEffectIntensity(input), expected);
});

for (const boundary of ["viewer", "remote", "audio", "disabled", "ended", "missing"]) {
  test(`does not attach or switch at ${boundary} boundary`, async () => {
    const h = setup(), track = h.track();
    if (boundary === "remote") track.remote = true;
    if (boundary === "audio") track.kind = "audio";
    if (boundary === "disabled") track.enabled = false;
    if (boundary === "ended") track.readyState = "ended";
    h.controller.bind(boundary === "missing" ? null : track, boundary !== "viewer");
    h.controller.select("studio-light", 0.5);
    assert.equal(h.controller.snapshot().state, "unavailable");
    assert.equal(await h.controller.switchCamera(), false);
    assert.equal(h.calls.length, 0);
  });
}

for (const config of [{ internal: false }, { module: false }]) test(`old/public build fails closed ${JSON.stringify(config)}`, async () => {
  const h = setup(config); h.controller.bind(h.track(), true); h.controller.select("chicago-skyline", 0.5);
  assert.equal(h.controller.snapshot().state, "unavailable");
  assert.equal(h.calls.length, 0);
  // Existing internal binaries can switch without an effects module. Public
  // builds cannot activate any of these newly introduced controls.
  assert.equal(await h.controller.switchCamera(), config.internal !== false);
});

test("select changes the outgoing media track, and active requires a native processed frame", () => {
  const h = setup(); h.controller.bind(h.track(), true); h.controller.select("studio-light", 0.75);
  assert.deepEqual(h.calls, [["configure", "camera-a", "studio-light", 0.75], ["setEffects", "camera-a", ["effect-camera-a"]]]);
  assert.equal(h.controller.snapshot().state, "starting");
  h.setStatus({ state: "active", processedFrames: 0 }); assert.equal(h.controller.snapshot().state, "starting");
  h.setStatus({ state: "active", processedFrames: 1 }); assert.equal(h.controller.snapshot().state, "active");
});

test("off disables native before detaching and never stops or republishes the camera", () => {
  const h = setup(); h.controller.bind(h.track(), true); h.controller.select("chicago-skyline", 1);
  h.calls.length = 0; h.controller.select("off", 1);
  assert.deepEqual(h.calls, [["release", "camera-a"], ["setEffects", "camera-a", null]]);
  assert.equal(h.controller.snapshot().state, "off");
});

test("zero intensity immediately restores natural camera", () => {
  const h = setup(); h.controller.bind(h.track(), true); h.controller.select("studio-light", 0.5); h.calls.length = 0;
  h.controller.select("studio-light", 0); assert.equal(h.controller.snapshot().state, "off");
  assert.equal(h.calls[0][0], "release");
});

test("iOS uses an empty list rather than Android's nullable detach boundary", () => {
  const h = setup(); const ios = new CameraEffectsController(h.native, true, "ios");
  ios.bind(h.track(), true); ios.select("studio-light", 0.5); h.calls.length = 0;
  ios.select("off"); assert.deepEqual(h.calls, [["release", "camera-a"], ["setEffects", "camera-a", []]]);
});

test("ended/replaced tracks release the exact old registration and reattach to the new track", () => {
  const h = setup(), old = h.track(); h.controller.bind(old, true); h.controller.select("chicago-skyline", 0.5);
  old.readyState = "ended"; h.controller.bind(old, true); assert.equal(h.controller.snapshot().state, "unavailable");
  h.calls.length = 0; h.controller.bind(h.track("camera-b"), true);
  assert.deepEqual(h.calls, [["configure", "camera-b", "chicago-skyline", 0.5], ["setEffects", "camera-b", ["effect-camera-b"]]]);
});

test("camera mute/demotion release, and authorization recovery can reattach", () => {
  const h = setup(), track = h.track(); h.controller.bind(track, true); h.controller.select("studio-light", 0.5);
  track.enabled = false; h.controller.bind(track, true); assert.equal(h.controller.snapshot().canSwitchCamera, false);
  track.enabled = true; h.controller.bind(track, true); assert.equal(h.calls.filter(c => c[0] === "configure").length, 2);
  h.controller.bind(track, false); assert.equal(h.controller.snapshot().state, "unavailable");
});

test("partial registration and native bridge errors are cleaned up", () => {
  const h = setup(); h.native.configure = () => { throw new Error("native error with private details"); };
  h.controller.bind(h.track(), true); h.controller.select("studio-light", 0.5);
  assert.equal(h.controller.snapshot().state, "error");
  assert.ok(!h.controller.snapshot().reason.includes("private details"));
  assert.equal(h.calls[0][0], "release");
});

test("unknown catalogue effects never attach a processor", () => {
  const h = setup(); h.controller.bind(h.track(), true); h.controller.select("future-age", 1);
  assert.equal(h.controller.snapshot().effect, "off"); assert.equal(h.calls.length, 0);
});

for (const [effect, capability] of [["crimson-aura", "crimsonAura"], ["neon-edge", "neonEdge"], ["spotlight", "spotlight"]]) {
  test(`${effect} needs its own native capability and attaches the exact effect`, () => {
    const old = setup(); old.controller.bind(old.track(), true); old.controller.select(effect, 0.75);
    assert.equal(old.controller.snapshot().state, "unavailable"); assert.equal(old.calls.length, 0);
    const ready = setup({ capabilities: { [capability]: true } }); ready.controller.bind(ready.track(), true);
    ready.controller.select(effect, 0.75); assert.deepEqual(ready.calls[0], ["configure", "camera-a", effect, 0.75]);
    ready.controller.select("off"); assert.equal(ready.calls.at(-2)[0], "release");
  });
}

test("camera switching awaits applyConstraints, removes stale device id and resets detections", async () => {
  const h = setup(); h.controller.bind(h.track(), true); h.controller.select("studio-light", 0.5); h.calls.length = 0;
  assert.equal(await h.controller.switchCamera(), true);
  assert.equal(h.calls[0][0], "release");
  const constraints = h.calls.find(c => c[0] === "constraints")[2];
  assert.equal(constraints.deviceId, undefined); assert.equal(constraints.width, 640);
  assert.equal(constraints.facingMode, "environment"); assert.equal(h.controller.snapshot().facingMode, "environment");
  assert.equal(h.calls.at(-1)[0], "setEffects");
  assert.equal(await h.controller.switchCamera(), true); assert.equal(h.controller.snapshot().facingMode, "user");
});

for (const boundary of ["demote", "dispose", "replacement"]) test(`late camera switch cannot attach effects after ${boundary}`, async () => {
  const h = setup(), held = deferred(), track = h.track();
  track.applyConstraints = () => held.promise;
  h.controller.bind(track, true); h.controller.select("chicago-skyline", 1);
  const switching = h.controller.switchCamera();
  assert.equal(h.controller.snapshot().switchingCamera, true);
  assert.equal(await h.controller.switchCamera(), false);
  if (boundary === "dispose") h.controller.dispose();
  else h.controller.bind(boundary === "replacement" ? h.track("new") : null, boundary === "replacement");
  h.calls.length = 0; held.resolve(); assert.equal(await switching, false);
  assert.equal(h.calls.length, 0);
});

test("off during camera switch stays off after native completion", async () => {
  const h = setup(), track = h.track(), held = deferred();
  track.applyConstraints = async () => { await held.promise; track.getSettings().facingMode = "environment"; };
  h.controller.bind(track, true); h.controller.select("studio-light", 0.5);
  const switching = h.controller.switchCamera(); h.controller.select("off"); h.calls.length = 0;
  held.resolve(); assert.equal(await switching, true); assert.equal(h.calls.length, 0);
  assert.equal(h.controller.snapshot().state, "off");
});

test("switch rejection or missing facing-mode acknowledgment does not report success", async () => {
  for (const reject of [true, false]) {
    const h = setup(), track = h.track();
    track.applyConstraints = async () => { if (reject) throw new Error("no back camera"); };
    h.controller.bind(track, true); assert.equal(await h.controller.switchCamera(), false);
    assert.equal(h.controller.snapshot().state, "error");
    assert.equal(h.controller.snapshot().switchingCamera, false);
  }
});

test("both live surfaces use the same existing-room integration and real controls", () => {
  const stage = fs.readFileSync("app/watch-party/live-stage/[partyId].tsx", "utf8");
  const surface = fs.readFileSync("components/watch-party-live/livekit-stage-media-surface.tsx", "utf8");
  const player = fs.readFileSync("app/player/[id].tsx", "utf8");
  for (const source of [stage, surface]) {
    assert.match(source, /useLiveCameraEffects\(\{ room,/);
    assert.match(source, /allowed: effectivePublishLocalCamera && joinContract.participantRole !== "viewer" && joinContract.requestedGrants.canPublish/);
  }
  for (const source of [stage, player]) assert.match(source, /<LiveCameraControls/);
  assert.match(player, /cameraEffectId=\{cameraEffectId\}/);
  const hook = fs.readFileSync("hooks/use-live-camera-effects.ts", "utf8");
  assert.doesNotMatch(hook, /getUserMedia|setCameraEnabled|publishTrack\(/);
  assert.match(hook, /permissions\?\.canPublish === true/);
  assert.match(hook, /controller.dispose\(\)/);
});
