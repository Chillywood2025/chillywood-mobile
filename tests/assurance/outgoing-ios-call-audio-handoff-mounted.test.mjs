import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const documentStub = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop,
  namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1,
  ownerDocument: documentStub, parentNode: null, tagName: "DIV" });
documentStub.documentElement = container();
globalThis.document = documentStub;
globalThis.window = globalThis;
globalThis.HTMLIFrameElement = class {};

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const settle = async () => { for (let index = 0; index < 30; index += 1) await Promise.resolve(); };
const authority = (sessionGeneration = "session-a") => ({ userId: "user-a", accountId: "user-a",
  sessionGeneration, restoreOnly: false, state: "ACTIVE" });
const initialInput = () => ({ authority: authority(), authenticatedUserId: "user-a",
  invite: { id: "invite-a", callerUserId: "user-a", calleeUserId: "user-b", status: "accepted",
    mediaProvider: "legacy_webrtc", callType: "voice", threadId: "thread-a", communicationRoomId: "ROOM42" },
  roomId: "ROOM42", threadId: "thread-a" });
const compiled = ts.transpileModule(readFileSync(new URL("../../hooks/use-outgoing-ios-call-audio-handoff.ts", import.meta.url), "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

async function mount(t, options = {}) {
  let input = initialInput();
  if (options.input) input = options.input(input);
  const listeners = new Set();
  const timers = new Map();
  const claims = [], releases = [], natives = [], renderHistory = [];
  let snapshot, currentAuthority = input.authority, soundOwner = null, timerSerial = 0, clock = 0, randomSerial = 0;
  const appState = { currentState: options.appState ?? "active", addEventListener(event, listener) {
    assert.equal(event, "change"); listeners.add(listener); return { remove: () => listeners.delete(listener) };
  } };
  const facade = {
    isIosNativeCallsRuntimeEnabled: () => options.runtimeEnabled !== false,
    createIosOutgoingAudioHandoff(binding) {
      const gate = deferred();
      const native = { binding, gate, retireCount: 0, prepareCount: 0,
        retire() { native.retireCount += 1; },
        prepare(drained) { native.prepareCount += 1; return drained.then(() => gate.promise); } };
      natives.push(native);
      return native;
    },
  };
  const sound = {
    claimChillyChatCallAudioHandoff(owner, isCurrent) {
      assert.equal(isCurrent(), true, "actual hook must claim only a current owner");
      soundOwner = owner;
      const gate = deferred();
      claims.push({ owner, isCurrent, gate });
      if (!options.pendingDrain) gate.resolve();
      return gate.promise;
    },
    releaseChillyChatCallAudioHandoff(owner) {
      releases.push(owner);
      if (soundOwner === owner) soundOwner = null;
    },
  };
  const mocks = {
    react: React,
    "react-native": { AppState: appState, Platform: { OS: options.platform ?? "ios" } },
    "../_lib/accountSessionAuthority": {
      getCurrentAccountSessionAuthoritySnapshot: () => currentAuthority,
      sameAccountSessionAuthority(a, b) { return !!a && !!b && a.userId === b.userId
        && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration
        && a.restoreOnly === b.restoreOnly && a.state === b.state; },
    },
    "../_lib/chillyChatCallSoundAssets": sound,
    "../_lib/iosNativeCalls": facade,
  };
  const context = { exports: {},
    crypto: options.secureRandom === false ? undefined : {
      getRandomValues(bytes) { randomSerial += 1; bytes.fill(randomSerial); return bytes; },
    },
    setTimeout(callback, duration) { const id = ++timerSerial; timers.set(id, { at: clock + duration, callback }); return id; },
    clearTimeout(id) { timers.delete(id); },
    require(name) { assert.ok(name in mocks, `unexpected actual hook dependency: ${name}`); return mocks[name]; },
  };
  vm.runInNewContext(compiled, context);
  const hook = context.exports.useOutgoingIosCallAudioHandoff;
  let root = createRoot(container());
  function Probe() {
    snapshot = hook(input);
    renderHistory.push({ ready: snapshot.ready, error: snapshot.error });
    return null;
  }
  const run = async (action) => React.act(async () => { await action(); await settle(); });
  const render = async (nextInput = input) => { input = nextInput; await run(() => root.render(React.createElement(Probe))); };
  let unmounted = false;
  const unmount = async () => {
    if (unmounted) return;
    unmounted = true;
    await run(() => root.unmount());
  };
  t.after(unmount);
  await render();
  return {
    claims, releases, natives, timers, listeners, renderHistory, run, render, unmount,
    get input() { return input; }, get snapshot() { return snapshot; }, get soundOwner() { return soundOwner; },
    setAuthority(next) { currentAuthority = next; },
    async appState(next) { await run(() => { appState.currentState = next; for (const listener of listeners) listener(next); }); },
    async remount(nextInput = input) {
      await unmount();
      root = createRoot(container());
      unmounted = false;
      await render(nextInput);
    },
    async advance(milliseconds) { await run(() => {
      clock += milliseconds;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= clock) { timers.delete(id); timer.callback(); }
      }
    }); },
  };
}

test("actual hook stays blocked until sound drain and deferred native prepare both finish", async (t) => {
  const h = await mount(t, { pendingDrain: true });
  assert.equal(h.snapshot.ready, false);
  assert.equal(h.snapshot.error, null);
  assert.equal(h.claims.length, 1);
  assert.equal(h.natives[0].binding.roomId, "ROOM42");
  assert.match(h.natives[0].binding.ownerId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  await h.run(() => h.natives[0].gate.resolve());
  assert.equal(h.snapshot.ready, false, "a completed native promise cannot bypass unresolved sound cleanup");
  await h.run(() => h.claims[0].gate.resolve());
  assert.equal(h.snapshot.ready, true);
  assert.equal(h.snapshot.error, null);
  assert.equal(h.timers.size, 0);
  assert.equal(h.soundOwner, h.claims[0].owner, "ready media retains the sound fence");
});

test("explicit End retires the captured owner and late prepare never enables media", async (t) => {
  const h = await mount(t);
  await h.run(() => h.snapshot.retire());
  assert.equal(h.natives[0].retireCount, 1);
  assert.equal(h.soundOwner, null);
  assert.equal(h.claims[0].isCurrent(), false);
  await h.run(() => h.natives[0].gate.resolve());
  assert.equal(h.snapshot.ready, false);
  await h.render({ ...h.input });
  assert.equal(h.snapshot.ready, false);
  assert.equal(h.natives.length, 1, "unrelated rerender cannot resurrect a retired attempt");
});

test("account replacement invalidates pending preparation before its late result", async (t) => {
  const h = await mount(t);
  const replacement = { ...authority("session-b"), userId: "user-b", accountId: "user-b" };
  h.setAuthority(replacement);
  await h.render({ ...h.input, authority: replacement });
  assert.equal(h.snapshot.ready, false);
  assert.match(h.snapshot.error, /Call audio could not be prepared/);
  assert.equal(h.natives[0].retireCount, 1);
  assert.equal(h.soundOwner, null);
  await h.run(() => h.natives[0].gate.resolve());
  assert.equal(h.snapshot.ready, false);
});

test("explicit End survives background/foreground and late prepare but allows a different call", async (t) => {
  const h = await mount(t);
  await h.run(() => h.snapshot.retire());
  await h.appState("background");
  await h.appState("active");
  assert.equal(h.natives.length, 1, "the still-accepted ended call must not acquire a fresh owner");
  assert.equal(h.claims.length, 1);
  await h.run(() => h.natives[0].gate.resolve());
  assert.equal(h.snapshot.ready, false);
  assert.equal(h.soundOwner, null);
  await h.render({ ...h.input, roomId: "ROOM43", invite: { ...h.input.invite, id: "invite-b", communicationRoomId: "ROOM43" } });
  assert.equal(h.natives.length, 2);
  await h.run(() => h.natives[1].gate.resolve());
  assert.equal(h.snapshot.ready, true, "a different accepted call remains usable");
});

test("explicit End survives screen remount in the same module while a different invite can prepare", async (t) => {
  const h = await mount(t);
  await h.run(() => h.natives[0].gate.resolve());
  assert.equal(h.snapshot.ready, true);
  await h.run(() => h.snapshot.retire());
  await h.remount();
  assert.equal(h.snapshot.ready, false);
  assert.match(h.snapshot.error, /Use End Call to finish closing/);
  assert.equal(h.natives.length, 1, "same module must retain End intent across screen removal");
  assert.equal(h.claims.length, 1);
  await h.remount({ ...h.input, roomId: "ROOM43", invite: { ...h.input.invite, id: "invite-b", communicationRoomId: "ROOM43" } });
  assert.equal(h.natives.length, 2);
  await h.run(() => h.natives[1].gate.resolve());
  assert.equal(h.snapshot.ready, true);
});

test("explicit Cancel while outgoing is ringing blocks later acceptance of the same invite but permits a new invite", async (t) => {
  const h = await mount(t, { input: input => ({ ...input, invite: { ...input.invite, status: "ringing" } }) });
  assert.equal(h.natives.length, 0, "ringing cannot prepare capture");
  assert.equal(h.claims.length, 0);
  await h.run(() => h.snapshot.retire());
  await h.render({ ...h.input, invite: { ...h.input.invite, status: "accepted" } });
  assert.equal(h.snapshot.ready, false);
  assert.match(h.snapshot.error, /Use End Call to finish closing/);
  assert.equal(h.natives.length, 0);
  await h.render({ ...h.input, roomId: "ROOM43", invite: { ...h.input.invite, id: "invite-b", communicationRoomId: "ROOM43" } });
  assert.equal(h.natives.length, 1);
  await h.run(() => h.natives[0].gate.resolve());
  assert.equal(h.snapshot.ready, true);
});

for (const replacement of ["account", "session"]) {
  test(`ringing Cancel intent does not poison a replacement ${replacement} authority`, async (t) => {
    const h = await mount(t, { input: input => ({ ...input, invite: { ...input.invite, status: "ringing" } }) });
    await h.run(() => h.snapshot.retire());
    const next = replacement === "account"
      ? { ...authority(), userId: "user-c", accountId: "user-c" }
      : authority("session-b");
    h.setAuthority(next);
    await h.render({ ...h.input, authority: next, authenticatedUserId: next.userId,
      invite: { ...h.input.invite, callerUserId: next.userId, status: "accepted" } });
    assert.equal(h.natives.length, 1);
    await h.run(() => h.natives[0].gate.resolve());
    assert.equal(h.snapshot.ready, true);
  });
}

test("stale captured ringing Cancel callback cannot retire the currently rendered replacement call", async (t) => {
  const h = await mount(t, { input: input => ({ ...input, invite: { ...input.invite, status: "ringing" } }) });
  const oldRetire = h.snapshot.retire;
  await h.render({ ...h.input, roomId: "ROOM43", invite: { ...h.input.invite, id: "invite-b", communicationRoomId: "ROOM43", status: "accepted" } });
  await h.run(() => h.natives[0].gate.resolve());
  assert.equal(h.snapshot.ready, true);
  const currentOwner = h.soundOwner;
  await h.run(oldRetire);
  assert.equal(h.snapshot.ready, true);
  assert.equal(h.natives[0].retireCount, 0);
  assert.equal(h.soundOwner, currentOwner);
});

test("captured ringing Cancel retires the now-ready accepted owner of that exact same call", async (t) => {
  const h = await mount(t, { input: input => ({ ...input, invite: { ...input.invite, status: "ringing" } }) });
  const ringingRetire = h.snapshot.retire;
  await h.render({ ...h.input, invite: { ...h.input.invite, status: "accepted" } });
  assert.equal(h.natives.length, 1);
  await h.run(() => h.natives[0].gate.resolve());
  assert.equal(h.snapshot.ready, true);
  await h.run(ringingRetire);
  assert.equal(h.natives[0].retireCount, 1, "the same call's accepted owner must retire immediately");
  assert.equal(h.snapshot.ready, false);
  assert.equal(h.soundOwner, null);
  assert.match(h.snapshot.error, /Use End Call to finish closing/);
  await h.appState("background");
  await h.appState("active");
  await h.remount();
  assert.equal(h.natives.length, 1);
  assert.equal(h.snapshot.ready, false);
});

test("current authority snapshot changing before rerender still blocks late readiness", async (t) => {
  const h = await mount(t);
  h.setAuthority(authority("session-b"));
  assert.equal(h.claims[0].isCurrent(), false);
  await h.run(() => h.natives[0].gate.resolve());
  assert.equal(h.snapshot.ready, false);
});

test("new invite binding needs its own handoff and rejects predecessor readiness", async (t) => {
  const h = await mount(t);
  await h.render({ ...h.input, roomId: "ROOM43", invite: { ...h.input.invite, id: "invite-b", communicationRoomId: "ROOM43" } });
  assert.equal(h.natives.length, 2);
  assert.notEqual(h.natives[0].binding.ownerId, h.natives[1].binding.ownerId);
  assert.equal(h.natives[0].retireCount, 1);
  assert.equal(h.soundOwner, h.claims[1].owner);
  await h.run(() => h.natives[0].gate.resolve());
  assert.equal(h.snapshot.ready, false);
  await h.run(() => h.natives[1].gate.resolve());
  assert.equal(h.snapshot.ready, true);
});

test("background retires pending work; foreground requires a fresh handoff", async (t) => {
  const h = await mount(t);
  await h.appState("background");
  assert.equal(h.snapshot.ready, false);
  assert.equal(h.natives[0].retireCount, 1);
  assert.equal(h.soundOwner, null);
  await h.run(() => h.natives[0].gate.resolve());
  assert.equal(h.snapshot.ready, false);
  await h.appState("active");
  assert.equal(h.natives.length, 2);
  assert.equal(h.snapshot.ready, false);
  await h.run(() => h.natives[1].gate.resolve());
  assert.equal(h.snapshot.ready, true);
});

test("native takeover revokes ready media and retains the failed sound fence until End", async (t) => {
  const h = await mount(t);
  await h.run(() => h.natives[0].gate.resolve());
  assert.equal(h.snapshot.ready, true);
  await h.run(() => h.natives[0].binding.onRevoked());
  assert.equal(h.snapshot.ready, false);
  assert.match(h.snapshot.error, /Call audio could not be prepared/);
  assert.equal(h.soundOwner, h.claims[0].owner);
  await h.run(() => h.snapshot.retire());
  assert.equal(h.soundOwner, null);
});

test("15-second deadline fails visibly, retains sound ownership and rejects late success", async (t) => {
  const h = await mount(t);
  await h.advance(14_999);
  assert.equal(h.snapshot.ready, false);
  assert.equal(h.snapshot.error, null);
  await h.advance(1);
  assert.equal(h.snapshot.ready, false);
  assert.match(h.snapshot.error, /Call audio could not be prepared/);
  assert.equal(h.natives[0].retireCount, 1);
  assert.equal(h.soundOwner, h.claims[0].owner);
  assert.equal(h.releases.length, 0);
  await h.run(() => h.natives[0].gate.resolve());
  assert.equal(h.snapshot.ready, false);
  assert.match(h.snapshot.error, /Call audio could not be prepared/);
});

test("sound-drain rejection keeps a visible blocked gate without releasing sound ownership", async (t) => {
  const h = await mount(t, { pendingDrain: true });
  await h.run(() => h.claims[0].gate.reject(new Error("synthetic cleanup uncertain")));
  assert.equal(h.snapshot.ready, false);
  assert.match(h.snapshot.error, /Call audio could not be prepared/);
  assert.equal(h.soundOwner, h.claims[0].owner);
  assert.equal(h.releases.length, 0);
  assert.equal(h.timers.size, 0);
});

test("unmount retires its owner, releases its fence and prevents late rendering", async (t) => {
  const h = await mount(t);
  await h.unmount();
  const renders = h.renderHistory.length;
  assert.equal(h.natives[0].retireCount, 1);
  assert.equal(h.soundOwner, null);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.timers.size, 0);
  await h.run(() => h.natives[0].gate.resolve());
  assert.equal(h.renderHistory.length, renders);
});

for (const [label, options] of [
  ["Android", { platform: "android" }],
  ["native disabled", { runtimeEnabled: false }],
  ["incoming CallKit", { input: (input) => ({ ...input, invite: { ...input.invite, callerUserId: "user-b", calleeUserId: "user-a" } }) }],
  ["LiveKit provider", { input: (input) => ({ ...input, invite: { ...input.invite, mediaProvider: "livekit" } }) }],
]) {
  test(`${label} bypasses this outgoing legacy iOS preparation without claiming shared audio`, async (t) => {
    const h = await mount(t, options);
    assert.equal(h.snapshot.ready, true);
    assert.equal(h.snapshot.error, null);
    assert.equal(h.natives.length, 0);
    assert.equal(h.claims.length, 0);
    assert.equal(h.timers.size, 0);
  });
}

test("missing secure random fails visibly without creating a native or sound owner", async (t) => {
  const h = await mount(t, { secureRandom: false });
  assert.equal(h.snapshot.ready, false);
  assert.match(h.snapshot.error, /Call audio could not be prepared/);
  assert.equal(h.natives.length, 0);
  assert.equal(h.claims.length, 0);
});
