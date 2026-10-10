import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { createChillyChatCallSoundLifecycle } from "../_lib/chillyChatCallSoundLifecycle.mjs";

const source = readFileSync(new URL("../_lib/iosNativeCalls.ts", import.meta.url), "utf8");
const ast = ts.createSourceFile("iosNativeCalls.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const declarations = ast.statements.filter((node) => ts.isFunctionDeclaration(node)
  && node.name?.text === "createIosOutgoingAudioHandoff");
assert.equal(declarations.length, 1, "execute the unique actual production handoff function");
const compiled = ts.transpileModule(declarations[0].getText(ast), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
};
const settle = async () => { for (let index = 0; index < 16; index += 1) await Promise.resolve(); };
const binding = () => ({ userId: "synthetic-user", accountId: "synthetic-account", sessionGeneration: "synthetic-session" });

function fixture({ authorityRead, begin, prepare, missing, runtimeEnabled = true, ownerId = "synthetic-owner" } = {}) {
  const calls = [];
  const listeners = new Set();
  const authority = binding();
  let owns = true;
  let revocations = 0;
  let reads = 0;
  let activationAttempts = 0;
  const native = {
    async beginOutgoingAudioHandoffAsync(input) { calls.push(["begin", input]); await begin?.(); },
    async prepareOutgoingAudioHandoffAsync(owner) { calls.push(["prepare", owner]); await prepare?.(); },
    async retireOutgoingAudioHandoffAsync(owner) { calls.push(["retire", owner]); },
  };
  if (missing && missing !== "module") delete native[missing];
  const context = {
    exports: {},
    voipAuthorityContext: { authority, installId: "synthetic-install" },
    voipLifecycleGeneration: 7,
    NativeCallsModule: missing === "module" ? null : new Proxy(native, {
      get(target, name) {
        if (name in target || name === missing) return target[name];
        activationAttempts += 1;
        throw new Error(`Unexpected native operation: ${String(name)}`);
      },
    }),
    subscribeToIosNativeCallEvents(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    sameAccountSessionAuthority(a, b) {
      return a.userId === b.userId && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration;
    },
    isIosNativeCallsRuntimeEnabled: () => runtimeEnabled,
    async isExactVoipAuthorityCurrent(candidate) {
      reads += 1;
      return authorityRead ? authorityRead(candidate, reads) : true;
    },
    synchronizeLiveKitCallKitAudioSession() { activationAttempts += 1; throw new Error("No outgoing activation authority"); },
  };
  vm.runInNewContext(compiled, context);
  const input = {
    ownerId, authority,
    inviteId: "synthetic-invite", threadId: "synthetic-thread", roomId: "ROOM42", callType: "voice",
    isCurrent: () => owns,
    onRevoked: () => { revocations += 1; },
  };
  const handoff = context.exports.createIosOutgoingAudioHandoff(input);
  return {
    handoff, input, context, calls, listeners,
    revokeCurrent() { owns = false; },
    emit(event) { for (const listener of [...listeners]) listener(event); },
    get revocations() { return revocations; },
    get reads() { return reads; },
    get activationAttempts() { return activationAttempts; },
  };
}

test("a rejected competing sound owner cannot touch the current owner's native handoff", async () => {
  const sounds = createChillyChatCallSoundLifecycle();
  const ownerA = {}, ownerB = {};
  const a = fixture({ ownerId: "synthetic-owner-a" }), b = fixture({ ownerId: "synthetic-owner-b" });
  await a.handoff.prepare(sounds.claim(ownerA, () => true));
  const originalCalls = [...a.calls];
  await assert.rejects(b.handoff.prepare(sounds.claim(ownerB, () => true)), /Another call owns the audio handoff/);
  assert.deepEqual(b.calls, [], "a rejected sound claim must not begin, prepare, or retire a native lease");
  assert.deepEqual(a.calls, originalCalls);
  await sounds.claim(ownerA, () => true);
  a.handoff.retire();
  sounds.release(ownerA);
});

for (const change of ["End", "account"]) {
  test(`${change} while sound drain is pending cannot begin or retire an unrequested native lease`, async () => {
    const drain = deferred();
    const f = fixture();
    const preparing = f.handoff.prepare(drain.promise);
    const rejected = assert.rejects(preparing, /handoff_retired/);
    await settle();
    if (change === "End") f.handoff.retire();
    else f.context.voipAuthorityContext = { authority: { ...binding(), accountId: "replacement-account" }, installId: "replacement-install" };
    drain.resolve();
    await rejected;
    assert.deepEqual(f.calls, []);
    assert.equal(f.listeners.size, 0);
  });
}

test("actual handoff drains sound before reserving exact native authority and preparing without activation", async () => {
  const drain = deferred();
  const f = fixture();
  const preparing = f.handoff.prepare(drain.promise);
  await settle();
  assert.deepEqual(f.calls, []);
  drain.resolve();
  await preparing;
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0][1])), {
    ownerId: f.input.ownerId, ...f.input.authority, installId: "synthetic-install",
    inviteId: f.input.inviteId, threadId: f.input.threadId, roomId: f.input.roomId, callType: "voice",
  });
  assert.deepEqual(f.calls.map(([kind]) => kind), ["begin", "prepare"]);
  assert.equal(f.calls[1][1], f.input.ownerId);
  assert.equal(f.reads, 3, "revalidate exact account after sound retirement and native reservation");
  assert.equal(f.activationAttempts, 0);
  f.handoff.retire();
  assert.deepEqual(f.calls.at(-1), ["retire", f.input.ownerId]);
  assert.equal(f.listeners.size, 0);
});

test("already stale input cannot reserve native audio", async () => {
  const f = fixture();
  f.revokeCurrent();
  await assert.rejects(f.handoff.prepare(Promise.resolve()), /authority_unavailable/);
  assert.deepEqual(f.calls, []);
});

for (const change of ["account", "lifecycle", "context", "input"]) {
  test(`${change} change while the first account check is pending prevents begin`, async () => {
    const gate = deferred();
    const f = fixture({ authorityRead: () => gate.promise });
    const preparing = f.handoff.prepare(Promise.resolve());
    const rejected = assert.rejects(preparing, /authority_unavailable/);
    if (change === "account") f.context.voipAuthorityContext.authority = { ...binding(), userId: "replacement-user" };
    if (change === "lifecycle") f.context.voipLifecycleGeneration += 1;
    if (change === "context") f.context.voipAuthorityContext = { ...f.context.voipAuthorityContext };
    if (change === "input") f.revokeCurrent();
    gate.resolve(true);
    await rejected;
    assert.equal(f.calls.some(([kind]) => kind === "begin"), false);
    assert.equal(f.calls.some(([kind]) => kind === "prepare"), false);
  });
}

test("account validation returning false does not begin native audio", async () => {
  const f = fixture({ authorityRead: async () => false });
  await assert.rejects(f.handoff.prepare(Promise.resolve()), /authority_unavailable/);
  assert.deepEqual(f.calls, []);
});

test("account replacement during pending native begin cannot proceed to prepare", async () => {
  const gate = deferred();
  const f = fixture({ begin: () => gate.promise });
  const preparing = f.handoff.prepare(Promise.resolve());
  const rejected = assert.rejects(preparing, /handoff_retired/);
  await settle();
  assert.equal(f.calls[0][0], "begin");
  f.context.voipAuthorityContext = { authority: { ...binding(), accountId: "replacement-account" }, installId: "replacement-install" };
  gate.resolve();
  await rejected;
  assert.equal(f.calls.some(([kind]) => kind === "prepare"), false);
});

test("retiring during pending native begin revokes immediately and rejects its late completion", async () => {
  const gate = deferred();
  const f = fixture({ begin: () => gate.promise });
  const preparing = f.handoff.prepare(Promise.resolve());
  const rejected = assert.rejects(preparing, /handoff_retired/);
  await settle();
  f.handoff.retire();
  assert.deepEqual(f.calls.at(-1), ["retire", f.input.ownerId]);
  assert.equal(f.listeners.size, 0);
  gate.resolve();
  await rejected;
  assert.equal(f.calls.some(([kind]) => kind === "prepare"), false);
});

test("second account read is fenced before and after its await", async () => {
  const gate = deferred();
  const f = fixture({ authorityRead: (_context, read) => read === 1 ? true : gate.promise });
  const preparing = f.handoff.prepare(Promise.resolve());
  const rejected = assert.rejects(preparing, /handoff_retired/);
  await settle();
  assert.equal(f.reads, 2);
  f.revokeCurrent();
  gate.resolve(true);
  await rejected;
  assert.equal(f.calls.some(([kind]) => kind === "prepare"), false);
});

test("late successful native prepare cannot make a retired handoff ready", async () => {
  const gate = deferred();
  const f = fixture({ prepare: () => gate.promise });
  const preparing = f.handoff.prepare(Promise.resolve());
  const rejected = assert.rejects(preparing, /handoff_retired/);
  await settle();
  assert.deepEqual(f.calls.map(([kind]) => kind), ["begin", "prepare"]);
  f.handoff.retire();
  gate.resolve();
  await rejected;
  assert.equal(f.activationAttempts, 0);
});

test("only the exact owner revocation event retires the pending handoff", async () => {
  const drain = deferred();
  const f = fixture();
  const preparing = f.handoff.prepare(drain.promise);
  const rejected = assert.rejects(preparing, /handoff_retired/);
  await settle();
  f.emit({ type: "outgoingAudioHandoffRevoked", outgoingAudioOwnerId: "foreign-owner" });
  f.emit({ type: "audioSessionActivated", outgoingAudioOwnerId: f.input.ownerId });
  assert.equal(f.revocations, 0);
  f.emit({ type: "outgoingAudioHandoffRevoked", outgoingAudioOwnerId: f.input.ownerId });
  assert.equal(f.revocations, 1);
  drain.resolve();
  await rejected;
  assert.equal(f.calls.some(([kind]) => kind === "prepare"), false);
  assert.equal(f.listeners.size, 0);
});

test("foreign revocation leaves a ready handoff untouched; matching takeover notifies its owner", async () => {
  const f = fixture();
  await f.handoff.prepare(Promise.resolve());
  f.emit({ type: "outgoingAudioHandoffRevoked", outgoingAudioOwnerId: "foreign-owner" });
  assert.equal(f.revocations, 0);
  f.emit({ type: "outgoingAudioHandoffRevoked", outgoingAudioOwnerId: f.input.ownerId });
  assert.equal(f.revocations, 1);
  await assert.rejects(f.handoff.prepare(Promise.resolve()), /authority_unavailable/);
});

for (const missing of ["module", "beginOutgoingAudioHandoffAsync", "prepareOutgoingAudioHandoffAsync", "retireOutgoingAudioHandoffAsync"]) {
  test(`missing ${missing} fails closed`, async () => {
    const f = fixture({ missing });
    await assert.rejects(f.handoff.prepare(Promise.resolve()), /authority_unavailable/);
    assert.equal(f.calls.some(([kind]) => kind === "begin" || kind === "prepare"), false);
  });
}

test("runtime-disabled native calls cannot reserve outgoing audio", async () => {
  const f = fixture({ runtimeEnabled: false });
  await assert.rejects(f.handoff.prepare(Promise.resolve()), /authority_unavailable/);
  assert.equal(f.calls.some(([kind]) => kind === "begin" || kind === "prepare"), false);
});

test("drain rejection is observed immediately while account validation is still pending", async () => {
  const authority = deferred();
  const drain = deferred();
  let rejectionObserverAttached = false;
  const trackedDrain = {
    then(onSuccess, onError) {
      rejectionObserverAttached = typeof onError === "function";
      return drain.promise.then(onSuccess, onError);
    },
  };
  const f = fixture({ authorityRead: () => authority.promise });
  const preparing = f.handoff.prepare(trackedDrain);
  const rejected = assert.rejects(preparing, /synthetic unverified cleanup/);
  assert.equal(rejectionObserverAttached, true, "no unhandled drain rejection during a slow account read");
  drain.reject(new Error("synthetic unverified cleanup"));
  await settle();
  assert.equal(f.calls.length, 0);
  authority.resolve(true);
  await rejected;
  assert.deepEqual(f.calls, []);
  assert.equal(f.listeners.size, 0);
});

for (const operation of ["begin", "prepare"]) {
  test(`${operation} rejection retires the exact lease and does not claim success`, async () => {
    const f = fixture({ [operation]: async () => { throw new Error(`synthetic ${operation} failure`); } });
    await assert.rejects(f.handoff.prepare(Promise.resolve()), new RegExp(`synthetic ${operation} failure`));
    assert.deepEqual(f.calls.at(-1), ["retire", f.input.ownerId]);
    assert.equal(f.listeners.size, 0);
    assert.equal(f.activationAttempts, 0);
  });
}
