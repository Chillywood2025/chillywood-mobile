import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const owner = (id = "host", sessionGeneration = "session-a") => ({ userId: id, accountId: id, sessionGeneration, state: "ACTIVE", restoreOnly: false });
const same = (a, b) => !!a && !!b && a.userId === b.userId && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration && a.restoreOnly === b.restoreOnly;
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const reply = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

function harness() {
  let time = 0, seq = 0, authority = owner(), session = { access_token: "fixture-token", user: { id: "host" } };
  let reader = async () => authority, sessionReader = async () => ({ data: { session }, error: null });
  const timers = new Map(), calls = [], listeners = new Set();
  const setTimer = (fn, ms = 0) => { const id = ++seq; timers.set(id, { at: time + ms, fn }); return id; };
  let send = async () => reply(200, { published: true, roomName: "STAGE42" });
  const authorityModule = { readCurrentAccountSessionAuthority: () => reader(), sameAccountSessionAuthority: same,
    subscribeToAccountSessionAuthority: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
  const context = { exports: {}, console, AbortController, Date, setTimeout: setTimer, clearTimeout: id => timers.delete(id),
    fetch: async (url, init) => { calls.push({ url, init }); return send(url, init); },
    require(name) {
      if (name === "livekit-client") return { decodeTokenPayload: () => ({}) };
      if (name === "./livekitRenderTelemetry") return { emitLiveKitRenderTelemetryEvent() {} };
      if (name === "../runtimeConfig") return { getRuntimeLiveKitConfig: () => ({ tokenEndpoint: "https://fixture.invalid/livekit-token" }), isLiveKitRuntimeConfigured: () => true };
      if (name === "../supabase") return { supabase: { auth: { getSession: () => sessionReader() } } };
      if (name === "../accountSessionAuthority") return authorityModule;
      throw new Error(`unmodeled dependency: ${name}`);
    } };
  const file = new URL("../_lib/livekit/token-contract.ts", import.meta.url);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, context, { filename: file.pathname });
  return { module: context.exports, authorityModule, calls, timers, context, get authority() { return authority; },
    setAuthority(value) { authority = value; for (const fn of listeners) fn(value); },
    read(fn) { reader = fn; }, authRead(fn) { sessionReader = fn; }, send(fn) { send = fn; },
    async advance(ms) { const target = time + ms; await tick(); for (;;) {
      const next = [...timers.entries()].filter(([, value]) => value.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break; time = next[1].at; timers.delete(next[0]); next[1].fn(); await tick();
    } time = target; await tick(); },
    start(signal = new AbortController().signal) { return context.exports.markLiveStageRoomConnectedForDiscovery("STAGE42", { authority: owner(), signal }); },
  };
}

test("actual publication transport retries transient provider failure and confirms the exact room", { timeout: 3000 }, async () => {
  const h = harness(); h.send(async () => h.calls.length < 3
    ? reply(502, { error: "live_discovery_provider_confirmation_failed" }) : reply(200, { published: true, roomName: "STAGE42" }));
  const run = h.start(); await h.advance(2250);
  assert.equal(h.calls.length, 3);
  assert.equal((await run).status, "published");
});

for (const error of ["live_discovery_provider_room_unconfirmed", "live_discovery_provider_host_unconfirmed"])
  test(`actual transport bounds retries for ${error}`, { timeout: 3000 }, async () => {
    const h = harness(); h.send(async () => reply(409, { error }));
    const run = h.start(); await h.advance(749); assert.equal(h.calls.length, 1);
    await h.advance(1); assert.equal(h.calls.length, 2); await h.advance(1499); assert.equal(h.calls.length, 2);
    await h.advance(1); assert.equal(h.calls.length, 3);
    assert.equal((await run).retryable, true); assert.equal(h.timers.size, 0);
  });

for (const status of [401, 403, 409]) test(`actual transport does not retry denied or ineligible status ${status}`, async () => {
  const h = harness(); h.send(async () => reply(status, { error: "live_discovery_not_published" }));
  const result = await h.start(); assert.equal(result.status, "failed"); assert.equal(result.retryable, false);
  assert.equal(h.calls.length, 1); assert.equal(h.timers.size, 0);
});

test("a success response must name the exact room", async () => {
  const h = harness(); h.send(async () => reply(200, { published: true, roomName: "OTHER42" }));
  assert.equal((await h.start()).reason, "invalid_response");
  const request = h.calls[0]; assert.equal(request.init.headers.Authorization, "Bearer fixture-token");
  assert.deepEqual(JSON.parse(request.init.body), { action: "mark-room-live", surface: "live-stage", roomName: "STAGE42" });
});

test("network failure is bounded and does not claim publication", { timeout: 3000 }, async () => {
  const h = harness(); h.send(async () => { throw new Error("network unavailable"); });
  const run = h.start(); await h.advance(2250); assert.equal((await run).status, "failed"); assert.equal(h.calls.length, 3);
});

test("expired auth prevents any publication send", async () => {
  const h = harness(); h.authRead(async () => ({ data: { session: { access_token: "expired", user: { id: "host" }, expires_at: 1 } }, error: null }));
  assert.equal((await h.start()).reason, "session_changed"); assert.equal(h.calls.length, 0);
});

test("same-user session replacement during auth read cannot send", async () => {
  const h = harness(); h.authRead(async () => {
    h.setAuthority(owner("host", "replacement"));
    return { data: { session: { access_token: "new-token", user: { id: "host" } } }, error: null };
  });
  assert.equal((await h.start()).reason, "session_changed"); assert.equal(h.calls.length, 0);
});

test("account replacement during a held response cannot confirm the prior room", async () => {
  const h = harness(), held = deferred(); h.send(() => held.promise);
  const run = h.start(); await tick(); h.setAuthority(owner("replacement"));
  held.resolve(reply(200, { published: true, roomName: "STAGE42" }));
  assert.equal((await run).reason, "session_changed");
});

for (const boundary of ["authority", "auth", "fetch", "body", "backoff"])
  test(`cancelled ${boundary} cannot start or continue publication`, { timeout: 3000 }, async () => {
    const h = harness(), held = deferred(), controller = new AbortController();
    if (boundary === "authority") h.read(() => held.promise);
    if (boundary === "auth") h.authRead(() => held.promise);
    if (boundary === "fetch") h.send(() => held.promise);
    if (boundary === "body") h.send(async () => ({ ...reply(200, {}), json: () => held.promise }));
    if (boundary === "backoff") h.send(async () => reply(502, {}));
    const run = h.start(controller.signal); await tick(); controller.abort();
    assert.equal((await run).status, "cancelled");
    const count = h.calls.length; held.resolve(null); await h.advance(30000);
    assert.equal(h.calls.length, count); assert.equal(h.timers.size, 0);
    if (["authority", "auth"].includes(boundary)) assert.equal(count, 0);
    if (h.calls.length) assert.equal(h.calls[0].init.signal.aborted, true);
  });

test("body read shares the attempt deadline; a late body cannot change the next result", { timeout: 3000 }, async () => {
  const h = harness(), held = deferred(); h.send(async () => h.calls.length === 1
    ? { ...reply(200, {}), json: () => held.promise } : reply(200, { published: true, roomName: "STAGE42" }));
  const run = h.start(); await h.advance(4999); assert.equal(h.calls.length, 1);
  await h.advance(751); assert.equal(h.calls.length, 2); assert.equal((await run).status, "published");
  held.resolve({ published: true, roomName: "OTHER" }); await tick(); assert.equal(h.timers.size, 0);
});

test("a held SDK read has a total three-attempt bound and never launches a late send", { timeout: 3000 }, async () => {
  const h = harness(), held = deferred(); h.authRead(() => held.promise);
  const run = h.start(); await h.advance(17250); assert.equal((await run).status, "failed");
  held.resolve({ data: { session: { access_token: "late", user: { id: "host" } } } }); await tick();
  assert.equal(h.calls.length, 0); assert.equal(h.timers.size, 0);
});

const React = require("react"), { createRoot } = require("react-dom/client");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {}, doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: doc, parentNode: null, tagName: "DIV" });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};

async function mount(t, overrides = {}, strict = false, connectionState = null) {
  const h = harness(); let result, disposed = false;
  const props = { roomName: "STAGE42", hostUserId: "host", visibility: "public", isHost: true, active: true, connectionKey: "connection-a", ...overrides };
  const listeners = new Set(), app = { currentState: "active", addEventListener: (_, fn) => { listeners.add(fn); return { remove: () => listeners.delete(fn) }; } };
  const context = { exports: {}, AbortController, console, require(name) {
    if (name === "react") return React;
    if (name === "react-native") return { AppState: app };
    if (name === "../session") return { useSession: () => ({ authority: h.authority, authorityStatus: h.authority ? "active" : "signed_out" }) };
    if (name === "../accountSessionAuthority") return h.authorityModule;
    if (name === "./token-contract") return h.module;
    throw new Error(name);
  } };
  const file = new URL("../_lib/livekit/useLiveStageDiscoveryPublication.ts", import.meta.url);
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  let room = { state: connectionState };
  const retiredRooms = new Set();
  function Host() {
    result = context.exports.useLiveStageDiscoveryPublication(props);
    context.exports.useLiveStageConnectionPublication({ room, active: connectionState !== null && app.currentState === "active" && props.active,
      retiredRooms, onConnected: result.onConnected });
    return null;
  }
  const root = createRoot(container());
  const render = async () => React.act(async () => { root.render(strict ? React.createElement(React.StrictMode, null, React.createElement(Host)) : React.createElement(Host)); });
  const unmount = async () => { if (!disposed) { disposed = true; await React.act(async () => root.unmount()); } };
  t.after(unmount); await render();
  return { ...h, result: () => result, unmount,
    async props(change) { Object.assign(props, change); await render(); },
    async account(value) { await React.act(async () => h.setAuthority(value)); await render(); },
    async invoke(callback) { await React.act(async () => { callback(); await tick(); }); },
    async advance(ms) { await React.act(async () => h.advance(ms)); },
    async resolve(held, value) { await React.act(async () => { held.resolve(value); await tick(); }); },
    async background() { await React.act(async () => { app.currentState = "background"; for (const fn of listeners) fn("background"); }); await render(); },
    async foreground() { await React.act(async () => { app.currentState = "active"; for (const fn of listeners) fn("active"); }); await render(); },
    async roomState(value) { room.state = value; await render(); },
    async replaceRoom(state, retired = false) { retiredRooms.add(room); room = { state }; if (retired) retiredRooms.add(room); props.connectionKey += "-new"; await render(); },
  };
}

test("mounted host hook waits for real connected callback and coalesces repeated callbacks", async t => {
  const h = await mount(t); assert.equal(h.calls.length, 0);
  await h.invoke(() => { h.result().onConnected(); h.result().onConnected(); });
  assert.equal(h.calls.length, 1); assert.equal(h.result().status, "published");
});

test("mounted host shows exhausted failure, then one explicit retry can recover", async t => {
  const h = await mount(t); h.send(async () => reply(502, {}));
  await h.invoke(h.result().onConnected); await h.advance(2250);
  assert.equal(h.result().status, "failed"); assert.equal(h.result().canRetry, true);
  assert.match(h.result().message, /not confirmed/);
  const oldRetry = h.result().retry;
  h.send(async () => reply(200, { published: true, roomName: "STAGE42" }));
  await h.invoke(() => { h.result().retry(); h.result().retry(); });
  assert.equal(h.calls.length, 4); assert.equal(h.result().status, "published");
  await h.invoke(oldRetry); assert.equal(h.calls.length, 4, "a retained failed-state button cannot republish after success");
});

for (const options of [{ visibility: "private" }, { isHost: false }, { active: false }, { hostUserId: "someone-else" }])
  test(`mounted hook cannot publish ${JSON.stringify(options)}`, async t => {
    const h = await mount(t, options); await h.invoke(h.result().onConnected); await h.invoke(h.result().retry);
    assert.equal(h.calls.length, 0);
    if (options.visibility === "private") assert.match(h.result().message, /Private room/);
  });

test("Circle listing keeps its audience and does not request a public transition", async t => {
  const h = await mount(t, { visibility: "circle" }); await h.invoke(h.result().onConnected);
  assert.match(h.result().message, /Circle/);
  assert.deepEqual(JSON.parse(h.calls[0].init.body), { action: "mark-room-live", surface: "live-stage", roomName: "STAGE42" });
});

for (const boundary of ["room", "account", "session", "end", "private", "connection", "background", "unmount"])
  test(`mounted hook retires held work and old callbacks after ${boundary}`, async t => {
    const h = await mount(t), held = deferred(), old = h.result(); h.send(() => held.promise);
    await h.invoke(old.onConnected); assert.equal(h.calls.length, 1);
    if (boundary === "room") await h.props({ roomName: "OTHER42" });
    if (boundary === "account") await h.account(owner("other"));
    if (boundary === "session") await h.account(owner("host", "new-session"));
    if (boundary === "end") { await h.invoke(old.cancel); await h.props({ active: false }); }
    if (boundary === "private") await h.props({ visibility: "private" });
    if (boundary === "connection") await h.props({ connectionKey: "new-connection" });
    if (boundary === "background") await h.background();
    if (boundary === "unmount") await h.unmount();
    assert.equal(h.calls[0].init.signal.aborted, true);
    await h.resolve(held, reply(200, { published: true, roomName: "STAGE42" }));
    await h.invoke(old.onConnected); await h.invoke(old.retry); await h.advance(30000);
    assert.equal(h.calls.length, 1); assert.notEqual(h.result().status, "published");
  });

test("disconnected host cancels pending publication and a new connection can confirm", async t => {
  const h = await mount(t), held = deferred(); h.send(() => held.promise);
  await h.invoke(h.result().onConnected); await h.invoke(h.result().onDisconnected);
  assert.equal(h.result().canRetry, false); assert.equal(h.calls[0].init.signal.aborted, true);
  h.send(async () => reply(200, { published: true, roomName: "STAGE42" })); await h.invoke(h.result().onConnected);
  assert.equal(h.result().status, "published"); assert.equal(h.calls.length, 2);
  await h.resolve(held, reply(403, {})); assert.equal(h.result().status, "published");
});

test("Strict Mode effect replay retains an eligible current host", async t => {
  const h = await mount(t, {}, true); await h.invoke(h.result().onConnected);
  assert.equal(h.calls.length, 1); assert.equal(h.result().status, "published");
});

test("foreground with the same contract can confirm after an actual new connected event", async t => {
  const h = await mount(t); await h.invoke(h.result().onConnected); assert.equal(h.calls.length, 1);
  await h.background(); await h.foreground(); await h.invoke(h.result().onConnected);
  assert.equal(h.calls.length, 2); assert.equal(h.result().status, "published");
});

test("actual connected-room hook confirms an explicit private-to-public audience change", async t => {
  const h = await mount(t, { visibility: "private" }, false, "connected"); assert.equal(h.calls.length, 0);
  await h.props({ visibility: "public" }); await h.advance(0);
  assert.equal(h.calls.length, 1); assert.equal(h.result().status, "published");
});

test("foreground uses the same actual connected room, not a fabricated new connection", async t => {
  const h = await mount(t, {}, false, "connected"); await h.advance(0); assert.equal(h.calls.length, 1);
  await h.background(); await h.foreground(); await h.advance(0);
  assert.equal(h.calls.length, 2); assert.equal(h.result().status, "published");
});

test("a connecting or retired room cannot publish a replacement callback generation", async t => {
  const h = await mount(t, { visibility: "private" }, false, "connecting");
  await h.props({ visibility: "public" }); await h.advance(0); assert.equal(h.calls.length, 0);
  await h.replaceRoom("connected", true); await h.advance(0); assert.equal(h.calls.length, 0);
  await h.replaceRoom("connected"); await h.advance(0); assert.equal(h.calls.length, 1);
});

test("old room callbacks cannot retire a confirmed replacement room", async t => {
  const h = await mount(t, {}, false, "connected"); await h.advance(0); const old = h.result();
  await h.replaceRoom("connected"); await h.advance(0); assert.equal(h.calls.length, 2);
  await h.invoke(old.onDisconnected); await h.invoke(old.onConnected); await h.invoke(old.cancel);
  assert.equal(h.result().status, "published"); assert.equal(h.calls.length, 2);
});
