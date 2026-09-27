import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";
import { getIosNativeCallAuthorityBindingKey, resolveIosNativeCallBridgeLifecycle } from "../../_lib/iosNativeCallBridgeLifecycle.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: doc, parentNode: null, tagName: "DIV" });
doc.documentElement = container();
globalThis.document = doc;
globalThis.window = globalThis;
globalThis.HTMLIFrameElement = class {};
const settle = async () => { for (let i = 0; i < 40; i += 1) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const binding = (generation = "session-a") => ({ userId: "user-a", accountId: "user-a", sessionGeneration: generation, state: "ACTIVE", restoreOnly: false });

async function mount(t) {
  let session = { user: { id: "user-a" }, authority: binding(), authorityStatus: "active" };
  let nativeListener;
  let reader = async () => ({ status: "ringing", threadId: "thread-a" });
  let router = { replace: noop };
  const subscriptions = new Map();
  const presentations = new Map();
  const activations = new Set();
  const ends = [];
  const starts = [];
  const terminalSteps = [];
  const stageHandlers = new Map();
  let nativeAuthority = "";
  let revokes = 0;
  const terminalStep = async (name, args, fallback) => {
    terminalSteps.push({ name, args });
    return stageHandlers.has(name) ? stageHandlers.get(name)(...args) : fallback;
  };
  const file = "app/_layout.tsx";
  const source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const bridge = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "IosNativeCallsBridge");
  assert.ok(bridge, "mount the production bridge function, not a copied implementation");
  const compiled = ts.transpileModule(`${bridge.getText(ast)}\nglobalThis.Bridge = IosNativeCallsBridge;`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const context = {
    ...React, console, setTimeout, clearTimeout,
    useRouter: () => router,
    useSession: () => session,
    resolveIosNativeCallBridgeLifecycle,
    AppState: { addEventListener: (_name, listener) => { activations.add(listener); return { remove: () => activations.delete(listener) }; } },
    startIosNativeCallsReadiness: async (authority, listener) => {
      const nextAuthority = getIosNativeCallAuthorityBindingKey(authority);
      // The real readiness owner preserves presentations for equivalent
      // authority and clears them before installing a different binding.
      if (nativeAuthority && nativeAuthority !== nextAuthority) presentations.clear();
      nativeAuthority = nextAuthority;
      starts.push(authority);
      nativeListener = listener;
      return { status: "started" };
    },
    readIosNativeCallPresentations: () => [...presentations.values()],
    readChillyChatCallInvite: (...args) => reader(...args),
    subscribeToChillyChatCallInvite: (id, listener) => { subscriptions.set(id, listener); return () => subscriptions.delete(id); },
    reportIosNativeCallRemoteEnd: async (uuid, reason) => { ends.push({ uuid, reason }); return true; },
    revokeIosVoipRegistration: async () => { revokes += 1; nativeAuthority = ""; presentations.clear(); },
    createIosCallKitAnswerRouteHandler: () => async () => true,
    completeIosNativeCallAnswer: async () => true,
    waitForIosNativeCallAnswerRouteReadiness: async () => true,
    drainIosNativeCallPendingEvents: async () => {},
    updateChillyChatCallInviteStatus: (...args) => terminalStep("transition", args, { status: args[0].status }),
    clearEndedChatThreadCall: (...args) => terminalStep("thread", args, { cleared: true }),
    dismissPresentedChillyChatCallNotifications: (...args) => terminalStep("presented", args, 1),
    dismissChillyChatCallNotificationRows: (...args) => terminalStep("rows", args, 1),
    completeIosNativeCallTerminalTransition: (...args) => terminalStep("native", args, true),
    reportRuntimeError: (scope, error) => { throw new Error(`${scope}: ${error}`); },
  };
  context.globalThis = context;
  vm.runInNewContext(compiled, context, { filename: file });
  const root = createRoot(container());
  let mounted = true;
  const render = async () => React.act(async () => { root.render(React.createElement(context.Bridge)); await settle(); });
  const unmount = async () => { if (!mounted) return; mounted = false; await React.act(async () => { root.unmount(); await settle(); }); };
  t.after(unmount);
  await render();
  return {
    subscriptions, ends, starts, terminalSteps,
    get revokes() { return revokes; },
    setReader(next) { reader = next; },
    setStage(name, handler) { stageHandlers.set(name, handler); },
    event(event) { return nativeListener(event); },
    async rerender(next = {}) { session = { ...session, ...next }; router = { replace: noop }; await render(); },
    async incoming(uuid = "native-a", inviteId = "invite-a") {
      const event = { type: "incoming", callInviteId: inviteId, callUuid: uuid, threadId: "thread-a" };
      presentations.set(event.callInviteId, event);
      await React.act(async () => { await nativeListener(event); await settle(); });
    },
    async update(inviteId = "invite-a") { await React.act(async () => { subscriptions.get(inviteId)?.(); await settle(); }); },
    async activate() { await React.act(async () => { for (const listener of activations) listener("active"); await settle(); }); },
    async resolve(pending, result) { await React.act(async () => { pending.resolve(result); await settle(); }); },
    unmount,
  };
}

test("equivalent session and router objects retain native terminal watchers", async (t) => {
  const h = await mount(t);
  await h.incoming();
  assert.equal(h.subscriptions.size, 1);
  await h.rerender({ authority: { ...binding() }, user: { id: "user-a" } });
  assert.equal(h.subscriptions.size, 1, "semantic rerender cannot silently drop terminal delivery");
  h.setReader(async () => ({ status: "canceled" }));
  await h.update();
  assert.equal(h.ends.length, 1);
  assert.equal(h.ends[0].uuid, "native-a");
});

test("native presentations are rewatched after transient unknown authority recovers", async (t) => {
  const h = await mount(t);
  await h.incoming();
  await h.rerender({ user: null, authorityStatus: "unknown", authority: null });
  assert.equal(h.revokes, 0, "unknown is not an explicit account revocation");
  assert.equal(h.ends.length, 0);
  await h.rerender({ user: { id: "user-a" }, authorityStatus: "active", authority: binding() });
  assert.equal(h.subscriptions.size, 1, "existing native presentation must recover its terminal watcher");
  h.setReader(async () => ({ status: "ended" }));
  await h.update();
  assert.equal(h.ends.at(-1).reason, "invite_ended");
});

test("an activation read cannot act after bridge unmount", async (t) => {
  const h = await mount(t);
  await h.incoming();
  const pending = deferred();
  h.setReader(() => pending.promise);
  await h.activate();
  await h.unmount();
  await h.resolve(pending, { status: "ended" });
  assert.equal(h.ends.length, 0, "retired activation callback must not terminate native state");
});

test("old watcher completion cannot remove a replacement native presentation", async (t) => {
  const h = await mount(t);
  await h.incoming();
  const pending = deferred();
  h.setReader(() => pending.promise);
  await h.update();
  h.setReader(async () => ({ status: "ringing" }));
  await h.incoming("native-b");
  await h.resolve(pending, { status: "ended" });
  assert.equal(h.ends.length, 0);
  assert.equal(h.subscriptions.size, 1);
  h.setReader(async () => ({ status: "ended" }));
  await h.update();
  assert.equal(h.ends.at(-1).uuid, "native-b");
});

test("explicit sign-out revokes registration and drops watchers", async (t) => {
  const h = await mount(t);
  await h.incoming();
  await h.rerender({ user: null, authority: null, authorityStatus: "signed_out" });
  assert.equal(h.revokes, 1);
  assert.equal(h.subscriptions.size, 0);
});

for (const replacement of [
  { name: "same user with a new session generation", session: { authority: binding("session-b") } },
  { name: "a different account", session: { user: { id: "user-b" }, authority: { ...binding("session-b"), userId: "user-b", accountId: "user-b" } } },
]) {
  test(`pending watcher reads cannot end native state after ${replacement.name}`, async (t) => {
    const h = await mount(t);
    await h.incoming();
    const pending = deferred();
    h.setReader(() => pending.promise);
    await h.update();
    await h.rerender(replacement.session);
    assert.equal(h.subscriptions.size, 0, "old presentations do not cross authority bindings");
    h.setReader(async () => ({ status: "ringing" }));
    await h.incoming("native-b", "invite-b");
    await h.resolve(pending, { status: "ended" });
    assert.equal(h.ends.length, 0);
    assert.equal(h.subscriptions.has("invite-b"), true);
    h.setReader(async () => ({ status: "ended" }));
    await h.update("invite-b");
    assert.equal(h.ends.at(-1).uuid, "native-b", "current authority retains working terminal delivery");
  });
}

const declineEvent = { type: "declined", callInviteId: "invite-a", callUuid: "native-a", threadId: "thread-a" };
const ringingInvite = {
  id: "invite-a", status: "ringing", threadId: "thread-a", communicationRoomId: "ROOMA1",
  callerUserId: "user-other", calleeUserId: "user-a",
};
const terminalStepNames = ["transition", "thread", "presented", "rows", "native"];

test("current terminal action completes exact bound cleanup through harmless semantic rerender", async (t) => {
  const h = await mount(t);
  await h.incoming();
  h.setReader(async () => ringingInvite);
  const pending = deferred();
  h.setStage("transition", () => pending.promise);
  const outcome = h.event(declineEvent);
  await settle();
  await h.rerender({ authority: { ...binding() }, user: { id: "user-a" } });
  await h.resolve(pending, { status: "declined" });
  await outcome;
  assert.deepEqual(h.terminalSteps.map((step) => step.name), terminalStepNames);
  const threadArgs = h.terminalSteps.find((step) => step.name === "thread").args;
  assert.equal(threadArgs[0], "thread-a");
  assert.equal(threadArgs[1], "ROOMA1");
  assert.equal(getIosNativeCallAuthorityBindingKey(threadArgs[2]), getIosNativeCallAuthorityBindingKey(binding()));
  assert.equal(h.terminalSteps.find((step) => step.name === "rows").args[0].userId, "user-a");
  for (const name of ["presented", "rows"]) {
    const input = h.terminalSteps.find((step) => step.name === name).args[0];
    assert.equal(input.exactInviteOnly, true, "old terminal cleanup must preserve a new invite in the same thread");
    assert.equal(input.callInviteId, "invite-a");
  }
  assert.equal(h.terminalSteps.at(-1).args[0], "native-a");
});

for (const transition of [
  { name: "account replacement", session: { user: { id: "user-b" }, authority: { ...binding("session-b"), userId: "user-b", accountId: "user-b" } } },
  { name: "session replacement", session: { authority: binding("session-b") } },
  { name: "sign-out", session: { user: null, authority: null, authorityStatus: "signed_out" } },
  { name: "unknown authority", session: { user: null, authority: null, authorityStatus: "unknown" } },
]) {
  test(`settled terminal mutation cannot resume cleanup after ${transition.name}`, async (t) => {
    const h = await mount(t);
    await h.incoming();
    h.setReader(async () => ringingInvite);
    const pending = deferred();
    h.setStage("transition", () => pending.promise);
    const outcome = h.event(declineEvent);
    await settle();
    assert.deepEqual(h.terminalSteps.map((step) => step.name), ["transition"]);
    await h.rerender(transition.session);
    await h.resolve(pending, { status: "declined" });
    await outcome;
    assert.deepEqual(h.terminalSteps.map((step) => step.name), ["transition"], "old mutation completion cannot clear or dismiss state for another authority");
  });
}

for (const suspendedStage of ["thread", "presented", "rows"]) {
  test(`terminal cleanup rechecks ownership after awaited ${suspendedStage} cleanup`, async (t) => {
    const h = await mount(t);
    await h.incoming();
    h.setReader(async () => ringingInvite);
    const pending = deferred();
    h.setStage(suspendedStage, () => pending.promise);
    const outcome = h.event(declineEvent);
    await settle();
    const expectedSteps = terminalStepNames.slice(0, terminalStepNames.indexOf(suspendedStage) + 1);
    assert.deepEqual(h.terminalSteps.map((step) => step.name), expectedSteps);
    await h.rerender({ authority: binding("session-b") });
    await h.resolve(pending, true);
    await outcome;
    assert.deepEqual(h.terminalSteps.map((step) => step.name), expectedSteps, "no further cleanup begins after ownership changes");
  });
}
