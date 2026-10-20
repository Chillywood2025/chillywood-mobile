import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { webcrypto } from "node:crypto";
import React from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

const noop = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: doc, parentNode: null, tagName: "DIV" });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const act = fn => React.act(async () => { await fn(); for (let i = 0; i < 12; i++) await Promise.resolve(); });
const compile = (file, mocks, extra = {}) => {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText,
    { module, exports: module.exports, require: name => name === "react" ? React : mocks[name], URL, AbortController, setTimeout, clearTimeout, Date, Uint8Array, crypto: webcrypto, ...extra });
  return module.exports;
};
const authority = { userId: "00000000-0000-4000-8000-000000000001", accountId: "00000000-0000-4000-8000-000000000001", sessionGeneration: "synthetic-session", state: "ACTIVE", restoreOnly: false };
const contextId = "00000000-0000-4000-8000-000000000002";
const target = { targetType: "creator_video", targetId: "00000000-0000-4000-8000-000000000003" };
const same = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
const api = compile("_lib/contentInspection.ts", { "react-native-get-random-values": {}, "./accountSessionAuthority": { sameAccountSessionAuthority: same } });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const endpoint = "https://fixture.invalid/functions/v1/admin-content-inspection";
const ready = () => ({ availability: "ready", receiptId: contextId, storedVersion: "a".repeat(32), mimeType: "image/jpeg", mediaKind: "image", sizeBytes: 100, expiresAt: new Date(Date.now() + 60_000).toISOString(), streamUrl: `${endpoint}?v=${"a".repeat(32)}` });
function helper(overrides = {}) {
  let current = authority;
  const calls = [];
  const module = compile("_lib/contentInspectionMedia.ts", {
    "react-native-get-random-values": {}, "./contentInspection": api,
    "./supabase": { SUPABASE_URL: "https://fixture.invalid", SUPABASE_ANON_KEY: "synthetic-anon" },
    "./accountSessionAuthority": { sameAccountSessionAuthority: same },
    "./accountBoundSupabaseMutation": {
      captureAccountBoundSupabaseMutationSubject: overrides.capture ?? (async () => ({ authority, accessToken: "synthetic-jwt" })),
      assertAccountBoundSupabaseMutationSubjectCurrent: subject => { if (!same(subject.authority, current)) throw new api.ContentInspectionError("account_changed"); },
    },
  }, { fetch: async (url, init) => { calls.push({ url, init }); return overrides.fetch ? overrides.fetch(url, init) : init.method === "POST" ? new Response(JSON.stringify(ready())) : new Response(new Uint8Array([1]), { status: 206, headers: { "Content-Range": "bytes 0-0/100", "Content-Type": "image/jpeg" } }); } });
  return { ...module, calls, change: value => { current = value; }, prepare(signal = new AbortController().signal) { return module.prepareInspectionMedia(authority, contextId, target, "Inspect synthetic fixture", signal); } };
}
test("production helper freezes credentials and strictly separates URL, bearer and receipt", async () => {
  const h = helper(); const controller = new AbortController(); const lease = await h.prepare(controller.signal);
  assert.equal(h.calls.length, 2); assert.equal(h.calls[0].init.method, "POST");
  assert.equal(JSON.parse(h.calls[0].init.body).action, "prepare_media");
  assert.equal(h.calls[1].init.headers.Range, "bytes=0-0");
  assert.equal(lease.source.headers.Authorization, "Bearer synthetic-jwt"); assert.equal(lease.source.headers["X-Inspection-Receipt"], contextId);
  assert.equal(lease.source.uri.includes(contextId), false); assert.equal(lease.source.uri.includes("synthetic-jwt"), false);
  assert.equal(h.calls[1].init.redirect, "error"); assert.equal(h.calls[1].init.cache, "no-store");
  controller.abort(); assert.equal(lease.active(), false); assert.equal(lease.source.uri, ""); assert.equal(Object.keys(lease.source.headers).length, 0);
});
test("production helper rejects external, credential-bearing and malformed source URLs", () => {
  const h = helper(); const version = "a".repeat(32);
  for (const value of [`https://evil.invalid/?v=${version}`, `${endpoint}?v=${version}&token=secret`, `${endpoint}?receipt=${contextId}&v=${version}`, `${endpoint}/extra?v=${version}`, `http://fixture.invalid/functions/v1/admin-content-inspection?v=${version}`]) assert.throws(() => h.validatedInspectionStreamUrl(value, version));
});
test("deferred capture/session change and background abort cannot expose source", async () => {
  const pending = deferred(); const h = helper({ capture: () => pending.promise }); const result = h.prepare(); h.change(null);
  pending.resolve({ authority, accessToken: "synthetic-jwt" }); await assert.rejects(result, error => error.code === "account_changed"); assert.equal(h.calls.length, 0);
  const held = deferred(); const second = helper({ fetch: () => held.promise }); const controller = new AbortController(); const late = second.prepare(controller.signal);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(second.calls.length, 1); controller.abort(); held.resolve(new Response(JSON.stringify(ready()))); await assert.rejects(late);
});
test("revocation on preflight, wrong range and quarantined response never yield a lease", async () => {
  for (const probe of [new Response("denied", { status: 403 }), new Response("x", { status: 200 })]) {
    const h = helper({ fetch: (_url, init) => init.method === "POST" ? new Response(JSON.stringify(ready())) : probe });
    await assert.rejects(h.prepare());
  }
  const h = helper({ fetch: () => new Response(JSON.stringify({ availability: "quarantined_unrenderable" })) });
  assert.equal((await h.prepare()).availability, "quarantined_unrenderable"); assert.equal(h.calls.length, 1);
});

function fixtureLease(kind = "image") {
  let active = true; const callbacks = new Set();
  const lease = { availability: "ready", mediaKind: kind, mimeType: `${kind}/fixture`, source: { uri: `${endpoint}?v=${"b".repeat(32)}`, headers: { Authorization: "Bearer fixture", "X-Inspection-Receipt": contextId } }, active: () => active,
    dispose() { if (!active) return; active = false; lease.source.uri = ""; lease.source.headers = {}; callbacks.forEach(fn => fn()); callbacks.clear(); }, onDispose(fn) { callbacks.add(fn); return () => callbacks.delete(fn); } };
  return lease;
}
async function mount(t, options = {}) {
  let lifecycle, identity, current, imageProps, videoProps, player, sound;
  const calls = [], buttons = new Map();
  const children = props => React.createElement(React.Fragment, null, props.children);
  const native = { Platform: { OS: options.web ? "web" : "ios" }, AppState: { currentState: "active", addEventListener: (_event, fn) => { lifecycle = fn; return { remove: noop }; } }, StyleSheet: { create: x => x }, View: children, Text: () => null, TouchableOpacity: props => { buttons.set(props.accessibilityLabel, props); return null; } };
  const source = compile("components/admin/content-inspection-media-viewer.tsx", {
    "react-native": native, "../../_lib/contentInspection": api,
    "../../_lib/accountSessionAuthority": { sameAccountSessionAuthority: same, getCurrentAccountSessionAuthoritySnapshot: () => authority, subscribeToAccountSessionAuthority: fn => { identity = fn; return noop; } },
    "../../_lib/contentInspectionMedia": { prepareInspectionMedia: (...args) => { const pending = deferred(); calls.push({ ...pending, args }); return pending.promise; } },
    "expo-image": { Image: props => { imageProps = props; return null; } },
    "expo-video": { VideoView: props => { videoProps = props; return null; }, createVideoPlayer: () => { player = { played: 0, released: 0, pause: noop, play() { this.played++; }, release() { this.released++; }, replace(value) { this.source = value; }, addListener(_event, fn) { this.error = () => fn({ status: "error" }); return { remove: noop }; } }; return player; } },
    "expo-av": { Audio: { Sound: class { constructor() { sound = this; this.unloaded = 0; } setOnPlaybackStatusUpdate(fn) { this.status = fn; } loadAsync(...args) { this.args = args; return options.audioPending?.promise ?? Promise.resolve(); } unloadAsync() { this.unloaded++; return Promise.resolve(); } playAsync() { this.played = true; return Promise.resolve(); } pauseAsync() { return Promise.resolve(); } } } },
  });
  let props = { authority, contextId, target, reason: "Inspect synthetic fixture" };
  function Probe() { current = source.useInspectionMedia(props); return null; }
  const root = createRoot(container()); const render = () => act(() => root.render(React.createElement(options.full ? source.ContentInspectionMediaViewer : Probe, props)));
  await render(); t.after(() => act(() => root.unmount()));
  return { calls, buttons, get current() { return current; }, get image() { return imageProps; }, get video() { return videoProps; }, get player() { return player; }, get sound() { return sound; }, background: () => act(() => lifecycle("background")), switchSession: () => act(() => identity({ ...authority, sessionGeneration: "different" })), async change(values) { props = { ...props, ...values }; await render(); } };
}
test("actual lifecycle hook drops deferred results on background, session and selection changes", async t => {
  for (const transition of [h => h.background(), h => h.switchSession(), h => h.change({ reason: "Changed fixture reason" }), h => h.change({ contextId: target.targetId })]) {
    const h = await mount(t); const request = h.calls[0]; await transition(h); const lease = fixtureLease();
    await act(() => request.resolve(lease)); assert.equal(lease.active(), false); assert.equal(h.current.lease, null);
  }
});
test("actual hook clears displayed media on revoke/expiry and safely reports request errors", async t => {
  const h = await mount(t); const lease = fixtureLease(); await act(() => h.calls[0].resolve(lease)); assert.equal(h.current.lease, lease);
  await act(() => lease.dispose()); assert.equal(h.current.lease, null);
  await h.change({ reason: "Different fixture reason" }); await act(() => h.calls.at(-1).reject(new api.ContentInspectionError("denied")));
  assert.equal(h.current.lease, null); assert.match(h.current.message, /denied/i);
});
test("browser performs no preparation or native playback", async t => { const h = await mount(t, { web: true }); assert.equal(h.calls.length, 0); assert.match(h.current.message, /unavailable in this browser/); });
test("actual image uses authenticated original and no cache; background retires it", async t => {
  const h = await mount(t, { full: true }); const lease = fixtureLease(); await act(() => h.calls[0].resolve(lease));
  assert.equal(h.image.source, lease.source); assert.equal(h.image.cachePolicy, "none"); assert.equal(h.image.contentFit, "contain");
  await h.background(); assert.equal(lease.active(), false);
});
test("actual video disables cache/export/autoplay and releases on native error", async t => {
  const h = await mount(t, { full: true }); const lease = fixtureLease("video"); await act(() => h.calls[0].resolve(lease));
  const player = h.player; assert.equal(player.played, 0); assert.equal(player.source.useCaching, false); assert.equal(player.allowsExternalPlayback, false); assert.equal(player.staysActiveInBackground, false);
  assert.equal(h.video.nativeControls, false); assert.equal(h.video.allowsPictureInPicture, false);
  await act(() => h.buttons.get("Play original video").onPress()); assert.equal(player.played, 1);
  await act(() => player.error()); assert.equal(lease.active(), false); assert.equal(player.released, 1);
});
test("actual audio does not download/autoplay and unloads deferred completion after session change", async t => {
  const pending = deferred(); const h = await mount(t, { full: true, audioPending: pending }); const lease = fixtureLease("audio"); await act(() => h.calls[0].resolve(lease));
  const sound = h.sound; assert.equal(sound.args[1].shouldPlay, false); assert.equal(sound.args[2], false);
  await h.switchSession(); assert.ok(sound.unloaded >= 1); await act(() => pending.resolve()); assert.ok(sound.unloaded >= 2); assert.equal(sound.played, undefined);
});
