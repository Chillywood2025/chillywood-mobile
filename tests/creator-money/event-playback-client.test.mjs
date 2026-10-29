import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { createRoot } from "react-dom/client";

const eventId = "22222222-2222-4222-8222-222222222222", base = "https://test.supabase.co";
const allowed = (changes = {}) => ({ allowed: true, canRenderPlayback: true, creatorEventId: eventId, kind: "live",
  playbackIdentity: "a".repeat(43),
  playbackUrl: `${base}/functions/v1/spectator-playback/events/${eventId}/index.m3u8?eventToken=synthetic-token`,
  expiresAt: new Date(Date.now() + 240_000).toISOString(), rawHlsUrlReturned: false, fullRoomTokenForSpectators: false, ...changes });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const load = (file, imports, globals = {}) => {
  const context = { exports: {}, URL, Date, Intl, Promise, AbortController, setTimeout, clearTimeout, ...globals,
    require: name => { assert.ok(name in imports, `unexpected import ${name}`); return imports[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, context); return context.exports;
};
function client(options = {}) {
  let authority = { userId: "buyer", accountId: "buyer", state: "ACTIVE", restoreOnly: false, sessionGeneration: "one" };
  let payload = options.payload ?? allowed(); const calls = [], listeners = new Set();
  const account = { getCurrentAccountSessionAuthoritySnapshot: () => authority,
    sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId && a.sessionGeneration === b.sessionGeneration,
    subscribeToAccountSessionAuthority: cb => { listeners.add(cb); return () => listeners.delete(cb); } };
  const api = load("_lib/creatorEventPlayback.ts", {
    "react-native": { Platform: { OS: "android" } }, "./accountSessionAuthority": account,
    "./accountBoundSupabaseMutation": { captureAccountBoundSupabaseMutationSubject: async () => {
      const frozen = authority; if (options.switchBeforeFetch) authority = { ...authority, sessionGeneration: "two" };
      return { accessToken: "synthetic-session", authority: frozen };
    } },
    "./supabase": { SUPABASE_URL: base, SUPABASE_ANON_KEY: "public-test-key" },
  }, { fetch: async (url, init) => { calls.push({ url, init }); return { ok: options.httpOk ?? true, json: async () => options.response ? options.response() : payload }; } });
  return { api, account, calls, getAuthority: () => authority,
    payload: value => { payload = value; },
    switchSession() { authority = { ...authority, sessionGeneration: "two" }; listeners.forEach(cb => cb(authority)); },
  };
}

test("event playback accepts only exact controlled event URL and bounded verified playback tuple", () => {
  const h = client(); assert.equal(h.api.parseCreatorEventPlayback(allowed(), eventId).allowed, true);
  for (const changes of [{ allowed: "true" }, { creatorEventId: "other" }, { rawHlsUrlReturned: true }, { fullRoomTokenForSpectators: true }, { kind: "public" }, { playbackIdentity: null }, { playbackIdentity: "raw-source-url" },
    { expiresAt: new Date(Date.now() - 1000).toISOString() }, { expiresAt: new Date(Date.now() + 600_000).toISOString() },
    { playbackUrl: "https://foreign.test/index.m3u8?eventToken=synthetic-token" },
    { playbackUrl: allowed().playbackUrl.replace(eventId, "other-event") },
    { playbackUrl: allowed().playbackUrl.replace("/events/", "/records/") },
    { playbackUrl: allowed().playbackUrl + "&eventToken=second" }, { playbackUrl: allowed().playbackUrl + "#fragment" },
    { playbackUrl: allowed().playbackUrl.replace("https:", "http:") }]) {
    assert.equal(h.api.parseCreatorEventPlayback(allowed(changes), eventId).allowed, false, JSON.stringify(changes));
  }
  assert.equal(h.api.parseCreatorEventPlayback({ allowed: false, canRenderPlayback: false, playbackUrl: null, reason: "not_started" }, eventId).playbackUrl, null);
});

test("event request freezes exact bearer session and discards stale or aborted response", async () => {
  const h = client(); assert.equal((await h.api.readCreatorEventPlayback(eventId)).allowed, true);
  assert.equal(h.calls[0].init.headers.Authorization, "Bearer synthetic-session");
  assert.deepEqual(JSON.parse(h.calls[0].init.body), { mode: "event_state", creatorEventId: eventId });
  assert.equal(h.calls[0].url, `${base}/functions/v1/spectator-playback`);
  const d = deferred(), stale = client({ response: () => d.promise });
  const pending = stale.api.readCreatorEventPlayback(eventId); await new Promise(resolve => setImmediate(resolve));
  stale.switchSession(); d.resolve(allowed()); assert.equal((await pending).allowed, false);
  const aborted = new AbortController(); aborted.abort(); assert.equal((await h.api.readCreatorEventPlayback(eventId, aborted.signal)).allowed, false);
  const beforeFetch = client({ switchBeforeFetch: true }); assert.equal((await beforeFetch.api.readCreatorEventPlayback(eventId)).allowed, false); assert.equal(beforeFetch.calls.length, 0);
});

test("403 preserves a structured denial but cannot smuggle allowed playback", async () => {
  const denied = client({ httpOk: false, payload: { allowed: false, canRenderPlayback: false, playbackUrl: null, reason: "event_not_started" } });
  const state = await denied.api.readCreatorEventPlayback(eventId); assert.equal(state.allowed, false); assert.equal(state.reason, "event_not_started");
  assert.match(denied.api.creatorEventPlaybackUnavailableCopy(state.reason), /has not opened/);
  assert.equal((await client({ httpOk: false, payload: allowed() }).api.readCreatorEventPlayback(eventId)).allowed, false);
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: doc, parentNode: null, tagName: "DIV" });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
async function mount(t, options = {}) {
  const h = client(options), nodes = new Map(), routes = [], players = [], timers = new Map(); let appCallback, nextTimerId = 0;
  const host = name => function Host(props) { const id = React.useId(); nodes.set(id, { type: name, props });
    React.useEffect(() => () => nodes.delete(id), [id]);
    return React.createElement(React.Fragment, null, ...React.Children.toArray(props.children).filter(child => typeof child === "object")); };
  const native = { AppState: { currentState: "active", addEventListener: (_name, cb) => { appCallback = cb; return { remove: noop }; } }, StyleSheet: { create: x => x, absoluteFillObject: {} } };
  for (const name of ["ActivityIndicator", "ImageBackground", "Pressable", "ScrollView", "Text", "View"]) native[name] = host(name);
  const Screen = load("app/event-watch/[eventId].tsx", {
    react: React, "react-native": native, "react-native-safe-area-context": { SafeAreaView: host("SafeAreaView") },
    "expo-router": { useLocalSearchParams: () => ({ eventId }), useFocusEffect: cb => React.useEffect(cb, [cb]),
      useRouter: () => ({ canGoBack: () => false, back: () => routes.push("back"), replace: route => routes.push(route), push: route => routes.push(route) }) },
    "expo-video": { VideoView: host("VideoView"), useVideoPlayer: (source, setup) => {
      const [player] = React.useState(() => { const value = { source, currentTime: 0, pauses: 0, listeners: {}, play: noop, pause() { this.pauses += 1; }, addListener(name, cb) { this.listeners[name] = cb; return { remove: () => { delete this.listeners[name]; } }; } }; setup(value); players.push(value); return value; });
      return player;
    } },
    "../../_lib/session": { useSession: () => ({ user: { id: "buyer" }, authority: h.getAuthority(), isLoading: false }) },
    "../../_lib/accountSessionAuthority": h.account, "../../_lib/creatorEventPlayback": h.api,
    "../../components/navigation/app-back-button": { AppBackButton: host("AppBackButton") },
    "../../components/ui/chillywood-visual-system": { CHILLYWOOD_VISUAL: { glassBackground: "black" } },
    "../../assets/images/chillywood-branded-background.png": {},
  }, { setTimeout: (cb, delay) => { const id = ++nextTimerId; timers.set(id, { cb, delay }); return id; }, clearTimeout: id => timers.delete(id) }).default;
  const root = createRoot(container()); let unmounted = false; await React.act(async () => root.render(React.createElement(Screen)));
  t.after(() => !unmounted && React.act(async () => root.unmount()));
  return { ...h, nodes, routes, players, timers, node: id => [...nodes.values()].find(node => node.props.testID === id),
    async press(id) { const node = [...nodes.values()].find(node => node.props.testID === id); assert.ok(node); await React.act(async () => { void node.props.onPress(); }); },
    async foreground(state) { await React.act(async () => appCallback(state)); },
    async account() { await React.act(async () => { h.switchSession(); root.render(React.createElement(Screen)); }); },
    async timer(readiness = false) { const timer = [...timers.values()].find(timer => readiness ? timer.delay === 20_000 : timer.delay > 20_000); assert.ok(timer); await React.act(async () => timer.cb()); return timer.delay; },
    async firstFrame() { const node = [...nodes.values()].find(node => node.props.testID === "event-watch-video"); assert.ok(node); await React.act(async () => node.props.onFirstFrameRender()); },
    async status(status) { await React.act(async () => players.at(-1).listeners.statusChange({ status })); },
    async resolve(d, value) { await React.act(async () => d.resolve(value)); },
    async unmount() { await React.act(async () => root.unmount()); unmounted = true; },
  };
}

test("mounted watch screen permits only protected watch-only source, refreshes before expiry and recovers exact event", async t => {
  const h = await mount(t); assert.ok(h.node("event-watch-video")); assert.equal(h.players[0].staysActiveInBackground, false);
  assert.equal(h.node("event-watch-video").props.allowsPictureInPicture, false);
  assert.ok(h.players[0].source.uri.includes(`/events/${eventId}/`));
  await h.firstFrame(); assert.equal(h.node("event-watch-buffering"), undefined);
  const initialCalls = h.calls.length; const delay = await h.timer(); assert.ok(delay > 0 && delay < 240_000); assert.ok(h.calls.length > initialCalls);
  assert.ok(h.players[0].pauses > 0);
  await h.press("event-watch-back"); assert.equal(h.routes[0].params.eventId, eventId);
});

test("mounted watch screen denies wrong host, wrong event and public spectator fallback", async t => {
  for (const playbackUrl of ["https://public.test/live.m3u8", allowed().playbackUrl.replace(eventId, "other"), allowed().playbackUrl.replace("/events/", "/records/")]) {
    const h = await mount(t, { payload: allowed({ playbackUrl }) }); assert.equal(h.node("event-watch-video"), undefined); assert.ok(h.node("event-watch-unavailable"));
    assert.equal(h.players.length, 0);
  }
});

test("mounted watch screen stops in background and discards replaced-account playback", async t => {
  const h = await mount(t); await h.foreground("background"); assert.equal(h.node("event-watch-video"), undefined); assert.ok(h.players[0].pauses > 0);
  await h.foreground("active"); assert.ok(h.node("event-watch-video"));
  const old = deferred(), fresh = deferred(); let reads = 0;
  const stale = await mount(t, { response: () => ++reads === 1 ? old.promise : fresh.promise });
  await stale.account(); await stale.resolve(old, allowed()); assert.equal(stale.node("event-watch-video"), undefined);
  await stale.resolve(fresh, allowed({ kind: "replay" }));
  assert.ok(stale.calls.length >= 2); assert.equal(stale.players.length, 1);
  await stale.foreground("background"); assert.equal(stale.node("event-watch-video"), undefined);
});

test("unmount aborts the exact playback request and a late response creates no player", async t => {
  const d = deferred(), h = await mount(t, { response: () => d.promise });
  await h.unmount(); assert.equal(h.calls[0].init.signal.aborted, true);
  await h.resolve(d, allowed()); assert.equal(h.players.length, 0); assert.equal(h.nodes.size, 0);
});

test("native first-frame and buffering deadlines end unavailable playback with explicit retry", async t => {
  const h = await mount(t); assert.ok(h.node("event-watch-buffering"));
  await h.status("readyToPlay"); await h.timer(true);
  assert.equal(h.node("event-watch-video"), undefined); assert.ok(h.node("event-watch-unavailable"));
  await h.press("event-watch-retry"); await h.firstFrame();
  assert.equal(h.node("event-watch-buffering"), undefined);
  await h.status("loading"); assert.ok(h.node("event-watch-buffering")); await h.timer(true);
  assert.equal(h.node("event-watch-video"), undefined);
  await h.press("event-watch-retry"); await h.status("error"); assert.equal(h.node("event-watch-video"), undefined);
});

test("replay refresh resumes only the identical verified playback identity and current session", async t => {
  const h = await mount(t, { payload: allowed({ kind: "replay" }) });
  await h.firstFrame(); h.players.at(-1).currentTime = 135;
  h.payload(allowed({ kind: "replay", playbackUrl: allowed().playbackUrl.replace("synthetic-token", "refreshed-token") }));
  await h.timer(); assert.equal(h.players.at(-1).currentTime, 135);
  await h.firstFrame(); h.players.at(-1).currentTime = 150;
  h.payload(allowed({ kind: "replay", playbackIdentity: "b".repeat(43), playbackUrl: allowed().playbackUrl.replace("synthetic-token", "replacement-record-token") }));
  await h.timer(); assert.equal(h.players.at(-1).currentTime, 0, "replacement replay must not inherit another asset position");
  await h.firstFrame(); h.players.at(-1).currentTime = 200;
  await h.account(); assert.equal(h.players.at(-1).currentTime, 0, "replacement session must not inherit previous replay position");
});
