import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createChillyChatCallSoundLifecycle } from "../_lib/chillyChatCallSoundLifecycle.mjs";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

function fixture({ blocked, failures = {}, drainTimeoutMs = 30 } = {}) {
  const gate = deferred();
  const reached = deferred();
  const events = [];
  const sound = {};
  const operations = { create: () => { events.push("create"); return sound; } };
  for (const name of ["configure", "load", "setVolume", "play", "verify", "stop", "unload"]) {
    operations[name] = async () => {
      events.push(name);
      if (name === blocked) { reached.resolve(); await gate.promise; }
      if (failures[name]) throw new Error(`synthetic ${name} failure`);
      return name === "verify" ? true : undefined;
    };
  }
  return { lifecycle: createChillyChatCallSoundLifecycle({ drainTimeoutMs }), operations, events, sound, gate, reached };
}

test("ordinary sound remains tracked through playback and unload", async () => {
  const f = fixture();
  assert.equal(await f.lifecycle.play(f.operations), f.sound);
  assert.deepEqual(f.events, ["create", "configure", "load", "setVolume", "play", "verify"]);
  assert.equal(await f.lifecycle.stop(f.sound), true);
  assert.deepEqual(f.events.slice(-2), ["stop", "unload"]);
  await f.lifecycle.claim({}, () => true);
});

for (const blocked of ["configure", "load", "setVolume", "play", "verify"]) {
  test(`handoff retires a sound paused during ${blocked}, before the next native operation`, async () => {
    const f = fixture({ blocked });
    const playing = f.lifecycle.play(f.operations);
    await f.reached.promise;
    const owner = {};
    const handoff = f.lifecycle.claim(owner, () => true);
    assert.equal(f.lifecycle.claim(owner, () => true), handoff);
    assert.equal(await f.lifecycle.play(f.operations), null);
    assert.equal(f.events.filter((x) => x === "create").length, 1);
    f.gate.resolve();
    assert.equal(await playing, null);
    await handoff;
    const startup = ["configure", "load", "setVolume", "play", "verify"];
    const through = startup.indexOf(blocked);
    assert.deepEqual(f.events, ["create", ...startup.slice(0, through + 1), ...(blocked === "configure" ? [] : ["stop", "unload"])]);
  });
}

test("claim in same turn blocks even the first mode change and all later shared starts", async () => {
  const f = fixture();
  const playing = f.lifecycle.play(f.operations);
  const owner = {};
  const handoff = f.lifecycle.claim(owner, () => true);
  await handoff;
  assert.equal(await playing, null);
  assert.equal(await f.lifecycle.play(f.operations), null);
  assert.deepEqual(f.events, ["create"]);
  f.lifecycle.release({});
  assert.equal(await f.lifecycle.play(f.operations), null, "foreign release cannot remove fence");
  f.lifecycle.release(owner);
  assert.equal(await f.lifecycle.play(f.operations), f.sound);
  await f.lifecycle.stop(f.sound);
  await assert.rejects(f.lifecycle.claim(owner, () => true), /no longer owns/);
});

for (const blocked of ["configure", "load", "play", "stop", "unload"]) {
  test(`never-settling ${blocked} times out but remains fenced until the original work settles`, async () => {
    const f = fixture({ blocked, drainTimeoutMs: 8 });
    const playing = f.lifecycle.play(f.operations);
    if (["stop", "unload"].includes(blocked)) await playing;
    else await f.reached.promise;
    const owner = {};
    const first = f.lifecycle.claim(owner, () => true);
    await assert.rejects(first, /cleanup could not be verified/);
    assert.equal(await f.lifecycle.play(f.operations), null);
    f.lifecycle.release(owner);
    assert.equal(await f.lifecycle.play(f.operations), null, "release does not forgive pending native work");
    const replacement = f.lifecycle.claim({}, () => true);
    let replacementReady = false;
    void replacement.then(() => { replacementReady = true; });
    await tick();
    assert.equal(replacementReady, false);
    f.gate.resolve();
    await replacement;
    await playing;
    assert.equal(f.events.filter((x) => x === blocked).length, 1, "do not retry an uncertain native operation");
    if (blocked === "configure") assert.equal(f.events.includes("load"), false);
    if (blocked === "load") assert.equal(f.events.includes("play"), false);
  });
}

test("unload rejection cannot be forgiven by a subsequent unloaded JS status or owner replacement", async () => {
  const f = fixture({ failures: { unload: true } });
  await f.lifecycle.play(f.operations);
  const owner = {};
  await assert.rejects(f.lifecycle.claim(owner, () => true), /synthetic unload failure/);
  await assert.rejects(f.lifecycle.claim(owner, () => true), /synthetic unload failure/);
  f.lifecycle.release(owner);
  assert.equal(await f.lifecycle.play(f.operations), null);
  await assert.rejects(f.lifecycle.claim({}, () => true), /synthetic unload failure/);
  assert.equal(f.events.filter((x) => x === "unload").length, 1);
});

test("stop error still attempts unload and reports failure before a later verified handoff", async () => {
  const f = fixture({ failures: { stop: true } });
  await f.lifecycle.play(f.operations);
  const owner = {};
  await assert.rejects(f.lifecycle.claim(owner, () => true), /cleanup could not be verified/);
  assert.deepEqual(f.events.slice(-2), ["stop", "unload"]);
  await f.lifecycle.claim(owner, () => true);
});

test("only a stale owner can be replaced, and late completion cannot authorize the retired owner", async () => {
  const f = fixture({ blocked: "load" });
  const playing = f.lifecycle.play(f.operations);
  await f.reached.promise;
  let oldCurrent = true;
  const owner = {};
  const old = f.lifecycle.claim(owner, () => oldCurrent);
  const stale = assert.rejects(old, /no longer owns/);
  await assert.rejects(f.lifecycle.claim({}, () => true), /Another call owns/);
  oldCurrent = false;
  const replacement = f.lifecycle.claim({}, () => true);
  f.gate.resolve();
  await Promise.all([stale, replacement, playing]);
  await assert.rejects(f.lifecycle.claim(owner, () => true), /no longer owns/);
});

test("failed current-owner check never removes an existing fence", async () => {
  const f = fixture();
  await f.lifecycle.claim({}, () => true);
  await assert.rejects(f.lifecycle.claim({}, () => false), /no longer owns/);
  await assert.rejects(f.lifecycle.claim({}, () => { throw new Error("stale"); }), /no longer owns/);
  assert.equal(await f.lifecycle.play(f.operations), null);
});

test("partial load failure retires the already allocated sound before reporting the failure", async () => {
  const f = fixture({ failures: { load: true } });
  await assert.rejects(f.lifecycle.play(f.operations), /synthetic load failure/);
  assert.deepEqual(f.events, ["create", "configure", "load", "stop", "unload"]);
  await f.lifecycle.claim({}, () => true);
});

function actualAssetHelper() {
  const events = [];
  const load = deferred();
  const loaded = deferred();
  class Sound {
    constructor() { events.push("create"); this.isLoaded = false; }
    async loadAsync() { events.push("load"); loaded.resolve(); await load.promise; this.isLoaded = true; }
    async setVolumeAsync() { events.push("volume"); }
    async playAsync() { events.push("play"); }
    async getStatusAsync() { return { isLoaded: this.isLoaded, isPlaying: false }; }
    async stopAsync() { events.push("stop"); return { isLoaded: true, isPlaying: false }; }
    async unloadAsync() { events.push("unload"); this.isLoaded = false; return { isLoaded: false }; }
  }
  const compiled = ts.transpileModule(fs.readFileSync(new URL("../_lib/chillyChatCallSoundAssets.ts", import.meta.url), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const context = {
    exports: {}, setTimeout, Date,
    require(name) {
      if (name === "expo-av") return { Audio: { Sound, setAudioModeAsync: async () => { events.push("mode"); } }, InterruptionModeAndroid: { DoNotMix: 1 } };
      if (name === "./chillyChatCalls") return { normalizeChillyChatRingtoneKey: (key) => key };
      if (name === "./chillyChatCallSoundLifecycle.mjs") return { createChillyChatCallSoundLifecycle };
      if (name.endsWith(".wav")) return 1;
      throw new Error("Unexpected test dependency");
    },
  };
  vm.runInNewContext(compiled, context);
  return { api: context.exports, events, load, loaded };
}

test("actual shared helper fences ringback, incoming ringtone and Settings preview calls together", async () => {
  const f = actualAssetHelper();
  const ringback = f.api.playChillyChatCallSound("chilly_ring", { loop: true });
  await f.loaded.promise;
  const owner = {};
  const handoff = f.api.claimChillyChatCallAudioHandoff(owner, () => true);
  assert.equal(await f.api.playChillyChatCallSound("theater_bell", { loop: true }), null);
  assert.equal(await f.api.playChillyChatCallSound("classic_phone"), null);
  assert.deepEqual(f.events, ["create", "mode", "load"]);
  f.load.resolve();
  assert.equal(await ringback, null);
  await handoff;
  assert.deepEqual(f.events, ["create", "mode", "load", "stop", "unload"]);
});
