import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "..");
const sdkRequire = createRequire(path.join(root, "node_modules/@supabase/realtime-js/package.json"));
const { Presence } = sdkRequire("@supabase/phoenix");
const upstream = (name, file) => execFileSync("tar", ["-xOf",
  path.join(root, "vendor/supabase-presence-backport/upstream", `${name}-2.100.0.tgz`), `package/${file}`],
{ encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });

// Execute each complete installed adapter with the real installed Phoenix
// implementation. TypeScript only loads the TS/ESM entrypoints into Node's CJS
// harness; it does not replace the state machine or its callbacks.
function loadAdapter(source, filename) {
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, require: sdkRequire }, { filename });
  return module.exports.default;
}

const wireMeta = (ref, fields = {}) => JSON.parse(JSON.stringify({ phx_ref: ref, user_id: "peer", ...fields }));

function assertAdapterLifecycle(Adapter) {
  let state = { peer: { metas: [wireMeta("first", { micOn: true })] } };
  const events = [];
  const sync = (joins, leaves) => {
    state = Presence.syncDiff(state, { joins, leaves },
      (...args) => events.push(Adapter.onJoinPayload(...args)),
      (...args) => events.push(Adapter.onLeavePayload(...args)));
  };
  sync({ peer: { metas: [wireMeta("replacement", { phx_ref_prev: "first", micOn: false })] } },
    { peer: { metas: [wireMeta("first", { micOn: true })] } });
  assert.equal(state.peer.metas.length, 1, "metadata update retains one current presence");
  assert.equal(state.peer.metas[0].phx_ref, "replacement", "callbacks preserve Phoenix phx_ref");
  assert.equal(events.at(-1).currentPresences.length, 1, "metadata replacement leave retains the online device");
  sync({ peer: { metas: [wireMeta("second-device", { micOn: true })] } }, {});
  assert.equal(state.peer.metas.length, 2, "two devices remain independently represented");
  sync({}, { peer: { metas: [wireMeta("second-device", { micOn: true })] } });
  assert.equal(state.peer.metas.length, 1, "leaving one device preserves the other");
  assert.equal(state.peer.metas[0].phx_ref, "replacement", "surviving device retains its reference");
  sync({}, { peer: { metas: [wireMeta("replacement", { micOn: false })] } });
  assert.deepEqual(state, {}, "last actual leave removes the presence key");
  assert.equal(events.at(-1).currentPresences.length, 0, "last leave reports no remaining presence");
}

function assertMetadataIsolation(Adapter) {
  const meta = JSON.parse('{"phx_ref":"device","phx_ref_prev":"old","__proto__":{"reviewSentinel":true},"micOn":true}');
  Object.defineProperty(meta, "nonEnumerable", { value: "preserved", enumerable: false, configurable: true });
  const before = Object.getOwnPropertyDescriptors(meta);
  const payload = Adapter.onJoinPayload("peer", { metas: [] }, { metas: [meta] });
  const transformed = payload.newPresences[0];
  assert.deepEqual(Object.getOwnPropertyDescriptors(meta), before, "input metadata remains unchanged");
  assert.notEqual(transformed, meta, "callback payload owns a separate metadata object");
  assert.equal(transformed.presence_ref, "device");
  assert.equal(Object.hasOwn(transformed, "phx_ref"), false);
  assert.equal(Object.hasOwn(transformed, "phx_ref_prev"), false);
  assert.deepEqual(Object.getOwnPropertyDescriptor(transformed, "nonEnumerable"), before.nonEnumerable);
  assert.equal(Object.hasOwn(transformed, "__proto__"), true, "own __proto__ metadata is retained as data");
  assert.equal(Object.getPrototypeOf(transformed), Object.getPrototypeOf(payload), "metadata never becomes the payload prototype");
  assert.equal("reviewSentinel" in transformed, false);
  assert.equal(Reflect.get(transformed, "__proto__").reviewSentinel, true);
  assert.equal({}.reviewSentinel, undefined);
}

for (const file of ["src/phoenix/presenceAdapter.ts", "dist/main/phoenix/presenceAdapter.js", "dist/module/phoenix/presenceAdapter.js"]) {
  test(`${file}: original fails and installed backport preserves real Phoenix metadata/leave state`, () => {
    const original = loadAdapter(upstream("realtime-js", file), file);
    assert.throws(() => assertAdapterLifecycle(original), /metadata update retains one current presence|callbacks preserve Phoenix phx_ref/u);
    const installed = loadAdapter(fs.readFileSync(path.join(root, "node_modules/@supabase/realtime-js", file), "utf8"), file);
    assertAdapterLifecycle(installed);
  });
  test(`${file}: copied metadata preserves descriptors without prototype mutation`, () => {
    const original = loadAdapter(upstream("realtime-js", file), file);
    assert.throws(() => assertMetadataIsolation(original), /input metadata remains unchanged/u);
    const installed = loadAdapter(fs.readFileSync(path.join(root, "node_modules/@supabase/realtime-js", file), "utf8"), file);
    assertMetadataIsolation(installed);
  });
}

// The UMD build embeds its own Phoenix and adapter. Feed decoded wire packets
// into its actual Channel callbacks, retaining every production Presence layer.
// The join reference is a transport fixture; no subscription/network is opened.
function loadUmdChannel(source) {
  const context = { console, URL, URLSearchParams, Headers, Request, Response, TextEncoder, TextDecoder,
    AbortController, setTimeout, clearTimeout, setInterval, clearInterval };
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: "supabase.umd.js" });
  class ForbiddenSocket { constructor() { throw new Error("Presence regression test attempted network access"); } }
  const client = new context.supabase.RealtimeClient("ws://127.0.0.1/unused", {
    params: { apikey: "local-presence-fixture" }, transport: ForbiddenSocket,
    fetch: () => { throw new Error("Presence regression test attempted HTTP access"); },
  });
  const channel = client.channel("presence-backport-proof");
  const rawChannel = channel.channelAdapter.getChannel();
  rawChannel.joinPush.ref = "fixture-joined-reference";
  const events = [];
  channel.on("presence", { event: "leave" }, (payload) => events.push(payload));
  return { channel, rawChannel, events };
}

function assertUmdLifecycle(source) {
  const { channel, rawChannel, events } = loadUmdChannel(source);
  rawChannel.trigger("presence_state", { peer: { metas: [wireMeta("first", { cameraOn: true })] } });
  rawChannel.trigger("presence_diff", {
    joins: { peer: { metas: [wireMeta("replacement", { phx_ref_prev: "first", cameraOn: false })] } },
    leaves: { peer: { metas: [wireMeta("first", { cameraOn: true })] } },
  });
  assert.equal(channel.presenceState().peer.length, 1, "UMD metadata update retains one current presence");
  assert.equal(channel.presenceState().peer[0].presence_ref, "replacement");
  assert.equal(events.at(-1).currentPresences.length, 1, "UMD metadata-only leave does not mean the peer disappeared");
  rawChannel.trigger("presence_diff", { joins: { peer: { metas: [wireMeta("second-device")] } }, leaves: {} });
  assert.equal(channel.presenceState().peer.length, 2);
  rawChannel.trigger("presence_diff", { joins: {}, leaves: { peer: { metas: [wireMeta("second-device")] } } });
  assert.equal(channel.presenceState().peer.length, 1);
  rawChannel.trigger("presence_diff", { joins: {}, leaves: { peer: { metas: [wireMeta("replacement", { cameraOn: false })] } } });
  assert.equal(Object.keys(channel.presenceState()).length, 0, "UMD final leave removes the presence key");
  assert.equal(events.at(-1).currentPresences.length, 0);
}

test("Supabase UMD: original fails and installed channel removes the final real presence", () => {
  assert.throws(() => assertUmdLifecycle(upstream("supabase-js", "dist/umd/supabase.js")), /UMD metadata update retains one current presence/u);
  assertUmdLifecycle(fs.readFileSync(path.join(root, "node_modules/@supabase/supabase-js/dist/umd/supabase.js"), "utf8"));
});

test("Supabase UMD: actual embedded adapter preserves metadata/prototype boundaries", () => {
  const original = loadUmdChannel(upstream("supabase-js", "dist/umd/supabase.js"));
  assert.throws(() => assertMetadataIsolation(original.channel.presence.presenceAdapter.constructor), /input metadata remains unchanged/u);
  const installed = loadUmdChannel(fs.readFileSync(path.join(root, "node_modules/@supabase/supabase-js/dist/umd/supabase.js"), "utf8"));
  assertMetadataIsolation(installed.channel.presence.presenceAdapter.constructor);
});
