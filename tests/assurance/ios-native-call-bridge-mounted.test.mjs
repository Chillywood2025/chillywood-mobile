import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";
import { getIosNativeCallAuthorityBindingKey, resolveIosNativeCallBridgeLifecycle } from "../../_lib/iosNativeCallBridgeLifecycle.mjs";
import * as lifecycle from "../../_lib/iosNativeCallBridgeLifecycle.mjs";
import * as provenance from "../../_lib/nativeCallTransitionProvenance.mjs";
import * as nativeCallErrorDiagnostics from "../../_lib/nativeCallErrorDiagnostics.mjs";
import * as roomIdentifiers from "../../_lib/communicationRoomIdentifier.mjs";
import * as callMediaPolicy from "../../_lib/communicationCallMediaPolicy.mjs";

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
const ids = {
  user: "00000000-0000-4000-8000-000000000001",
  invite: "00000000-0000-4000-8000-000000000002",
  thread: "00000000-0000-4000-8000-000000000003",
  uuid: "00000000-0000-4000-8000-000000000002",
  replacementUuid: "00000000-0000-4000-8000-000000000005",
  session: "00000000-0000-4000-8000-000000000006",
};
const nativeEvent = (type, extra = {}) => ({ type, callInviteId: ids.invite, callUuid: ids.uuid, threadId: ids.thread, callType: "video",
  nativeCallGeneration: "00000000-0000-4000-8000-000000000007", nativeSessionGeneration: ids.session, ...extra });

async function mount(t, { realFacade = false, initialNativeEvents = [], persistedSameAuthority = true, controlledRetryTimers = false } = {}) {
  let session = { user: { id: "user-a" }, authority: binding(), authorityStatus: "active" };
  let nativeListener;
  let reader = async () => ({ status: "ringing", threadId: "thread-a" });
  let router = { replace: noop };
  const subscriptions = new Map();
  const presentations = new Map();
  const errorReports = [];
  const mediaDiagnostics = [];
  const activations = new Set();
  const ends = [];
  const starts = [];
  const terminalSteps = [];
  const stageHandlers = new Map();
  let nativeAuthority = "";
  let revokes = 0;
  const routes = [];
  const nativeSteps = [];
  const pendingEvents = [...initialNativeEvents];
  const nativePresentedCalls = new Map();
  const nativeAnsweredCallUuids = new Set();
  const nativeAudioOwnerGenerations = new Map();
  const pendingRebindReceipts = new WeakSet();
  const observeNativeReceipt = (event) => {
    if (event.type === "audioSessionActivated" && nativePresentedCalls.get(event.callUuid)?.nativeCallGeneration === event.nativeCallGeneration) {
      nativeAudioOwnerGenerations.set(event.callUuid, event.nativeCallGeneration);
    }
    if (["audioSessionDeactivated", "providerReset", "audioSessionFailed", "audioInterruptionBegan"].includes(event.type)) nativeAudioOwnerGenerations.clear();
    if (event.type === "incoming" || event.type === "recovered") {
      if (nativePresentedCalls.get(event.callUuid)?.nativeCallGeneration !== event.nativeCallGeneration) {
        nativeAnsweredCallUuids.delete(event.callUuid);
        nativeAudioOwnerGenerations.delete(event.callUuid);
      }
      nativePresentedCalls.set(event.callUuid, event);
    }
    if (["remoteEnded", "ended", "declined", "timeout", "answerFailed"].includes(event.type)) {
      nativePresentedCalls.delete(event.callUuid);
      nativeAnsweredCallUuids.delete(event.callUuid);
      nativeAudioOwnerGenerations.delete(event.callUuid);
    }
  };
  const drainNativeEvents = () => pendingEvents.splice(0).filter(event => !pendingRebindReceipts.has(event)
    || nativePresentedCalls.has(event.callUuid));
  const nativeLifecycleOrder = [];
  const bridgeWork = new Set();
  const retryTimers = new Map();
  let nextRetryTimerId = 0;
  let facade;
  let applicationActive = true;
  let nativeModuleListener;
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
    ...React, console,
    setTimeout: controlledRetryTimers ? (callback, delay) => {
      const id = ++nextRetryTimerId;
      retryTimers.set(id, { callback, delay });
      return id;
    } : setTimeout,
    clearTimeout: controlledRetryTimers ? (id) => retryTimers.delete(id) : clearTimeout,
    useRouter: () => router,
    useSession: () => session,
    resolveIosNativeCallBridgeLifecycle,
    AppState: { addEventListener: (_name, listener) => { activations.add(listener); return { remove: () => activations.delete(listener) }; } },
    startIosNativeCallsReadiness: async (authority, listener) => {
      if (stageHandlers.has("readiness-start")) return stageHandlers.get("readiness-start")(authority, listener);
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
    reportIosNativeCallRemoteEnd: async (uuid, reason) => {
      ends.push({ uuid, reason });
      const result = stageHandlers.has("remoteEnd") ? await stageHandlers.get("remoteEnd")(uuid, reason) : true;
      if (result === true) {
        const presentation = [...presentations.values()].find((entry) => entry.callUuid === uuid);
        if (presentation) {
          presentations.delete(presentation.callInviteId);
          await nativeListener({ ...presentation, type: "remoteEnded" });
        }
      }
      return result;
    },
    revokeIosVoipRegistration: async () => { revokes += 1; nativeAuthority = ""; presentations.clear(); },
    createIosCallKitAnswerRouteHandler: () => async () => true,
    completeIosNativeCallAnswer: (...args) => terminalStep("answer-failure", args, true),
    waitForIosNativeCallAnswerRouteReadiness: async () => stageHandlers.has("readiness") ? stageHandlers.get("readiness")() : true,
    drainIosNativeCallPendingEvents: async () => {},
    updateChillyChatCallInviteStatus: (...args) => terminalStep("transition", args, { status: args[0].status }),
    clearEndedChatThreadCall: (...args) => terminalStep("thread", args, { cleared: true }),
    dismissPresentedChillyChatCallNotifications: (...args) => terminalStep("presented", args, 1),
    dismissChillyChatCallNotificationRows: (...args) => terminalStep("rows", args, 1),
    completeIosNativeCallTerminalTransition: (...args) => terminalStep("native", args, true),
    reportRuntimeError: (scope, error) => { throw new Error(`${scope}: ${error}`); },
  };
  if (realFacade) {
    // Execute the complete production JS facade and route provenance together
    // with the mounted root bridge. Only the OS/native module and authenticated
    // service boundary are simulated; do not stub readiness/routing success.
    provenance.clearNativeCallTransitionClaims("ios");
    session = { ...session, user: { id: ids.user }, authority: { ...binding(ids.session), userId: ids.user, accountId: ids.user } };
    let nativeBindingKey = persistedSameAuthority ? getIosNativeCallAuthorityBindingKey(session.authority) : "retired-native-account";
    const foregroundInviteExpiry = new Date(Date.now() + 90_000).toISOString();
    router = { replace: (destination) => routes.push(destination) };
    const nativeModule = {
      isBuildEnabledAsync: async () => true,
      isApplicationActiveAsync: async () => applicationActive,
      addListener: (_name, listener) => {
        nativeLifecycleOrder.push("listen");
        nativeModuleListener = listener;
        // Swift startObserving replays its queue on the main queue. This must
        // not deliver a retired native binding's events under the next JS user.
        queueMicrotask(() => { if (nativeModuleListener === listener) drainNativeEvents().forEach(listener); });
        return { remove: () => { if (nativeModuleListener === listener) nativeModuleListener = null; } };
      },
      getPendingEventsAsync: async () => { nativeLifecycleOrder.push("drain"); return drainNativeEvents(); },
      startVoipRegistrationAsync: async (userId, accountId, sessionGeneration) => {
        nativeLifecycleOrder.push("bind");
        const nextBindingKey = getIosNativeCallAuthorityBindingKey({ ...binding(sessionGeneration), userId, accountId });
        // Mirrors Swift: only a DIFFERENT existing authority resets pending
        // native calls/events. Same-authority cold launch preserves Answer.
        if (nativeBindingKey && nativeBindingKey !== nextBindingKey) {
          pendingEvents.length = 0;
          nativePresentedCalls.clear();
          nativeAnsweredCallUuids.clear();
          nativeAudioOwnerGenerations.clear();
        } else if (nativeBindingKey === nextBindingKey) {
          // Native rebind emits genuine recovered receipts for its confirmed,
          // still-live CallKit calls. The facade must consume those events.
          for (const event of nativePresentedCalls.values()) {
            const recovered = { ...event, type: "recovered", audioSessionActive:
              nativeAudioOwnerGenerations.get(event.callUuid) === event.nativeCallGeneration && nativeAnsweredCallUuids.has(event.callUuid) };
            pendingRebindReceipts.add(recovered);
            pendingEvents.push(recovered);
          }
        }
        nativeBindingKey = nextBindingKey;
        return true;
      },
      stopVoipRegistrationAsync: async () => true,
      reportRemoteEndAsync: async (uuid, reason) => {
        nativeSteps.push({ name: "remoteEnd", uuid, reason });
        if (stageHandlers.has("os-remoteEnd")) return stageHandlers.get("os-remoteEnd")(uuid, reason);
        nativePresentedCalls.delete(uuid);
        nativeModuleListener?.({ type: "remoteEnded", callUuid: uuid, callInviteId: ids.invite, threadId: ids.thread });
      },
      completeAnswerAsync: async (uuid, connected) => {
        nativeSteps.push({ name: "answer", uuid, connected });
        if (stageHandlers.has("os-completeAnswer")) return stageHandlers.get("os-completeAnswer")(uuid, connected);
        if (connected) nativeAnsweredCallUuids.add(uuid);
      },
      endCallAsync: async (uuid, reason) => {
        nativeSteps.push({ name: "end", uuid, reason });
        if (stageHandlers.has("os-endCall")) return stageHandlers.get("os-endCall")(uuid, reason);
        // Transaction acceptance does not manufacture its CXEndCallAction delegate event.
      },
      requestAnswerAsync: async (uuid, inviteId) => {
        nativeSteps.push({ name: "requestAnswer", uuid, inviteId });
        // The OS edge must explicitly deliver its event; a request promise
        // alone never fabricates an Answer route or server acceptance.
        return stageHandlers.has("os-requestAnswer")
          ? stageHandlers.get("os-requestAnswer")(uuid, inviteId) : false;
      },
      setMutedAsync: async (uuid, muted) => {
        nativeSteps.push({ name: "setMuted", uuid, muted });
        // A queued CXSetMutedCallAction is not its delegate receipt. Tests
        // control delivery separately through the native-module listener.
        if (stageHandlers.has("os-setMuted")) return stageHandlers.get("os-setMuted")(uuid, muted);
      },
      completeTerminalTransitionAsync: async (uuid) => { nativeSteps.push({ name: "terminal", uuid }); },
    };
    const imports = {
      "expo-constants": { default: { expoConfig: { extra: { runtime: { iosNativeCallsEnabled: true } } } } },
      "expo-application": { nativeApplicationVersion: "test", nativeBuildVersion: "test" },
      "react-native": { Platform: { OS: "ios" } },
      "../modules/chillywood-native-calls": { default: nativeModule },
      "./accountSessionAuthority": {
        isCurrentAccountSessionAuthority: async (value) => getIosNativeCallAuthorityBindingKey(value)
          === getIosNativeCallAuthorityBindingKey(stageHandlers.has("authority-read") ? await stageHandlers.get("authority-read")() : session.authority),
        readCurrentAccountSessionAuthority: async () => stageHandlers.has("authority-read") ? stageHandlers.get("authority-read")() : session.authority,
        sameAccountSessionAuthority: (left, right) => !!left && !!right
          && getIosNativeCallAuthorityBindingKey(left) === getIosNativeCallAuthorityBindingKey(right),
      },
      "./communicationRoomIdentifier.mjs": roomIdentifiers,
      "./iosNativeCallBridgeLifecycle.mjs": lifecycle,
      "./livekit/bootstrap": { synchronizeLiveKitCallKitAudioSession: lifecycle => stageHandlers.has("sdk-audio-sync") ? stageHandlers.get("sdk-audio-sync")(lifecycle) : true },
      "./communicationCallMediaPolicy.mjs": callMediaPolicy,
      "./internalCallMediaDiagnostics": { reportInternalCallMediaDiagnostic: (phase, input) => mediaDiagnostics.push({ phase, ...input }) },
      "./nativeCallTransitionProvenance.mjs": provenance,
      "./nativeCallErrorDiagnostics.mjs": nativeCallErrorDiagnostics,
      "./logger": { reportRuntimeError: (scope, error, metadata) => {
        errorReports.push({ scope, error, metadata });
        if (stageHandlers.has("diagnostic-report")) stageHandlers.get("diagnostic-report")();
      } },
      "./notifications": { createPushOwnershipOperationKey: () => "test-operation", getNotificationInstallId: async () => "test-install", getNotificationRevocationCredential: async () => "test-credential" },
      "./supabase": { supabase: {
        functions: { invoke: async () => ({ data: null, error: null }) },
        from: (table) => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ error: null, data: table === "chat_call_invites" ? {
          id: ids.invite, thread_id: ids.thread, communication_room_id: "ROOM-LEGACY",
          caller_user_id: "00000000-0000-4000-8000-000000000099", callee_user_id: ids.user,
          call_type: "voice", status: "ringing", expires_at: foregroundInviteExpiry,
        } : {
          id: ids.thread, active_communication_room_id: "ROOM-LEGACY", members: [ids.user, "00000000-0000-4000-8000-000000000099"].map(user_id => ({ user_id, thread_id: ids.thread })),
        } }) }) }) }),
      } },
    };
    const facadeContext = {
      exports: {}, console, performance: { now: () => stageHandlers.has("monotonic-now")
        ? stageHandlers.get("monotonic-now")() : globalThis.performance.now() }, process: { env: {} }, __DEV__: false, setTimeout, clearTimeout,
      require: (name) => { assert.ok(imports[name], `unexpected facade import: ${name}`); return imports[name]; },
    };
    const facadeSource = ts.transpileModule(fs.readFileSync("_lib/iosNativeCalls.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: false } }).outputText;
    vm.runInNewContext(facadeSource, facadeContext, { filename: "_lib/iosNativeCalls.ts" });
    facade = facadeContext.exports;
    Object.assign(context, facade, { createIosCallKitAnswerRouteHandler: provenance.createIosCallKitAnswerRouteHandler });
    context.startIosNativeCallsReadiness = (authority, listener) => facade.startIosNativeCallsReadiness(authority, (event) => {
      const work = listener(event);
      bridgeWork.add(work);
      void work.finally(() => bridgeWork.delete(work));
      return work;
    });
  }
  context.globalThis = context;
  vm.runInNewContext(compiled, context, { filename: file });
  const root = createRoot(container());
  let mounted = true;
  const render = async () => React.act(async () => { root.render(React.createElement(context.Bridge)); await settle(); });
  const unmount = async () => { if (!mounted) return; mounted = false; await React.act(async () => { root.unmount(); await settle(); }); };
  t.after(unmount);
  await render();
  return {
    subscriptions, ends, starts, terminalSteps, routes, nativeSteps, nativeLifecycleOrder, retryTimers, errorReports, mediaDiagnostics,
    get facade() { return facade; },
    get revokes() { return revokes; },
    setReader(next) { reader = next; },
    setStage(name, handler) { stageHandlers.set(name, handler); },
    async event(event) {
      if (!realFacade) return nativeListener(event);
      observeNativeReceipt(event);
      nativeModuleListener?.(event);
      await settle();
      await Promise.all([...bridgeWork]);
      await settle();
    },
    emitWithoutWaiting(event) { observeNativeReceipt(event); nativeModuleListener?.(event); },
    async flush() { await settle(); await Promise.all([...bridgeWork]); await settle(); },
    setApplicationActive(next) { applicationActive = next; },
    queue(event) { pendingEvents.push(event); },
    async rerender(next = {}) { session = { ...session, ...next }; router = { replace: realFacade ? (destination) => routes.push(destination) : noop }; await render(); },
    async incoming(uuid = "native-a", inviteId = "invite-a") {
      const event = { type: "incoming", callInviteId: inviteId, callUuid: uuid, threadId: "thread-a" };
      presentations.set(event.callInviteId, event);
      await React.act(async () => { await nativeListener(event); await settle(); });
    },
    async update(inviteId = "invite-a") { await React.act(async () => { subscriptions.get(inviteId)?.(); await settle(); }); },
    async activate() { await React.act(async () => { for (const listener of activations) listener("active"); await settle(); }); },
    async runRetry() {
      const [id, timer] = retryTimers.entries().next().value ?? [];
      assert.ok(timer, "a bounded reconciliation retry is scheduled");
      retryTimers.delete(id);
      await React.act(async () => { timer.callback(); await settle(); });
      return timer.delay;
    },
    async resolve(pending, result) { await React.act(async () => { pending.resolve(result); await settle(); }); },
    unmount,
  };
}

test("transient readiness quarantine recovers a live CallKit receipt before a later native Answer", async (t) => {
  const h = await mount(t, { realFacade: true, controlledRetryTimers: true });
  await h.event(nativeEvent("incoming"));
  assert.equal(h.facade.hasIosNativeCallPresentation(ids.invite), true);
  h.setStage("authority-read", async () => null);
  await h.activate();
  assert.equal(h.facade.hasIosNativeCallPresentation(ids.invite), false, "unknown authority quarantines JS presentation claims");
  h.setStage("authority-read", async () => ({ ...binding(ids.session), userId: ids.user, accountId: ids.user }));
  await h.activate();
  await h.flush();
  assert.equal(h.facade.hasIosNativeCallPresentation(ids.invite), true, "rebind drains the native recovered receipt");
  await h.event(nativeEvent("answerRequested"));
  await h.flush();
  assert.equal(h.routes.length, 1, "an actual native Answer remains eligible after transient recovery");
  assert.equal(h.nativeSteps.some(step => step.name === "requestAnswer"), false, "no foreground report or fabricated Answer was needed");
});

test("root readiness retries two transient failures and foreground can recover after exhaustion", async (t) => {
  const h = await mount(t, { controlledRetryTimers: true });
  let attempts = 0;
  h.setStage("readiness-start", async () => { attempts += 1; return { status: "error" }; });
  await h.activate();
  assert.equal(attempts, 1);
  assert.equal(await h.runRetry(), 1_000);
  assert.equal(await h.runRetry(), 3_000);
  assert.equal(attempts, 3);
  assert.equal(h.retryTimers.size, 0, "network failure cannot create an unbounded retry loop");
  h.setStage("readiness-start", async () => { attempts += 1; return { status: "started" }; });
  await h.activate();
  assert.equal(attempts, 4, "a new foreground transition revalidates native readiness");
  assert.equal(h.retryTimers.size, 0);
});

test("readiness retry timer cannot restart native registration after bridge unmount", async (t) => {
  const h = await mount(t, { controlledRetryTimers: true });
  let attempts = 0;
  h.setStage("readiness-start", async () => { attempts += 1; return { status: "error" }; });
  await h.activate();
  const retainedTimer = h.retryTimers.values().next().value;
  assert.ok(retainedTimer);
  await h.unmount();
  assert.equal(h.retryTimers.size, 0);
  retainedTimer.callback();
  await h.flush();
  assert.equal(attempts, 1);
});

test("failed readiness from a retired session cannot schedule recovery under its old authority", async (t) => {
  const h = await mount(t, { controlledRetryTimers: true });
  const old = deferred();
  const requests = [];
  h.setStage("readiness-start", async (authority) => {
    requests.push(authority.sessionGeneration);
    return authority.sessionGeneration === "session-a" ? old.promise : { status: "started" };
  });
  await h.activate();
  await h.rerender({ authority: binding("session-b") });
  await h.resolve(old, { status: "error" });
  assert.deepEqual(requests, ["session-a", "session-b"]);
  assert.equal(h.retryTimers.size, 0);
});

test("overlapping foreground notifications do not start concurrent readiness checks", async (t) => {
  const h = await mount(t, { controlledRetryTimers: true });
  const pending = deferred();
  let attempts = 0;
  h.setStage("readiness-start", async () => { attempts += 1; return pending.promise; });
  await h.activate();
  await h.activate();
  assert.equal(attempts, 1);
  await h.resolve(pending, { status: "started" });
  assert.equal(h.retryTimers.size, 0);
});

test("native terminal retries are bounded and activation remains an explicit retry after exhaustion", async (t) => {
  const h = await mount(t, { controlledRetryTimers: true });
  await h.incoming();
  h.setReader(async () => ({ status: "canceled" }));
  h.setStage("remoteEnd", async () => false);
  await h.update();
  assert.equal(h.ends.length, 1);
  for (const delay of [400, 800, 1200]) assert.equal(await h.runRetry(), delay);
  assert.equal(h.ends.length, 4);
  assert.equal(h.retryTimers.size, 0, "a failed native bridge cannot create an unbounded timer loop");
  assert.equal(h.subscriptions.has("invite-a"), true, "exhausting retries does not falsely acknowledge native cleanup");
  h.setStage("remoteEnd", async () => true);
  await h.activate();
  assert.equal(h.ends.length, 5);
  assert.equal(h.subscriptions.size, 0);
});

test("native retry timers are canceled at replacement and unmount; already queued old callbacks have no authority", async (t) => {
  const h = await mount(t, { controlledRetryTimers: true });
  await h.incoming();
  h.setReader(async () => ({ status: "canceled" }));
  h.setStage("remoteEnd", async () => false);
  await h.update();
  const retiredCallback = [...h.retryTimers.values()][0].callback;
  h.setReader(async () => ({ status: "ringing" }));
  await h.incoming("native-b");
  assert.equal(h.retryTimers.size, 0);
  await React.act(async () => { retiredCallback(); await settle(); });
  assert.equal(h.ends.length, 1, "old presentation retry cannot terminate its replacement");
  h.setReader(async () => ({ status: "ended" }));
  await h.update();
  assert.equal(h.ends.at(-1).uuid, "native-b");
  assert.equal(h.retryTimers.size, 1);
  await h.unmount();
  assert.equal(h.retryTimers.size, 0);
});

for (const failure of [false, "reject"]) {
  test(`terminal native dismissal retains the exact watcher for activation retry after ${failure}`, async (t) => {
    const h = await mount(t);
    await h.incoming();
    h.setReader(async () => ({ status: "canceled" }));
    h.setStage("remoteEnd", async () => {
      if (failure === "reject") throw new Error("native unavailable");
      return false;
    });
    await h.update();
    assert.equal(h.subscriptions.has("invite-a"), true, "unsuccessful dismissal must not orphan visible CallKit UI");
    h.setStage("remoteEnd", async () => true);
    await h.activate();
    assert.equal(h.ends.length, 2);
    assert.equal(h.subscriptions.size, 0);
  });
}

test("overlapping terminal signals issue one native dismissal and old completion preserves a replacement watcher", async (t) => {
  const h = await mount(t);
  await h.incoming();
  const pending = deferred();
  h.setReader(async () => ({ status: "ended" }));
  h.setStage("remoteEnd", () => pending.promise);
  await h.update();
  await h.activate();
  await h.update();
  assert.equal(h.ends.length, 1);
  h.setReader(async () => ({ status: "ringing" }));
  await h.incoming("native-b");
  await h.resolve(pending, true);
  assert.equal(h.subscriptions.has("invite-a"), true);
  h.setStage("remoteEnd", async () => true);
  h.setReader(async () => ({ status: "ended" }));
  await h.update();
  assert.equal(h.ends.at(-1).uuid, "native-b");
});

test("a delayed old native terminal event cannot remove the replacement's watcher", async (t) => {
  const h = await mount(t);
  await h.incoming();
  await h.incoming("native-b");
  await h.event({ type: "remoteEnded", callInviteId: "invite-a", callUuid: "native-a" });
  assert.equal(h.subscriptions.has("invite-a"), true);
  h.setReader(async () => ({ status: "ended" }));
  await h.update();
  assert.equal(h.ends.at(-1).uuid, "native-b");
});

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

test("failed native terminal acknowledgment is retried after the server row is already terminal", async (t) => {
  const h = await mount(t);
  await h.incoming();
  let record = ringingInvite;
  h.setReader(async () => record);
  h.setStage("transition", ({ status }) => { record = { ...record, status }; return record; });
  h.setStage("native", async () => false);
  await h.event(declineEvent);
  assert.equal(record.status, "declined");
  h.setStage("native", async () => true);
  await h.activate();
  assert.equal(h.terminalSteps.filter(({ name }) => name === "transition").length, 1, "retry does not repeat a completed server transition");
  assert.equal(h.terminalSteps.filter(({ name }) => name === "native").length, 2);
});

test("native Answer failure before server acceptance settles the ringing callee invite", async (t) => {
  const h = await mount(t);
  await h.incoming();
  h.setReader(async () => ringingInvite);
  await h.event({ ...declineEvent, type: "answerFailed" });
  assert.equal(h.terminalSteps[0]?.name, "transition");
  assert.equal(h.terminalSteps[0]?.args[0].status, "declined");
  assert.equal(h.terminalSteps.at(-1)?.name, "native");
});

const acceptedConfigurationFailureInvite = {
  id: ids.invite, status: "accepted", threadId: ids.thread, communicationRoomId: "ROOM-LEGACY",
  callerUserId: "00000000-0000-4000-8000-000000000099", calleeUserId: ids.user,
};
const configurationFailureEvent = () => nativeEvent("answerFailed", { reason: "audio_session_configuration_failed" });

test("actual root and facade settle an accepted call after native Answer audio configuration failure", async (t) => {
  const h = await mount(t, { realFacade: true });
  let record = { ...acceptedConfigurationFailureInvite };
  h.setReader(async () => ({ ...record }));
  h.setStage("transition", ({ actorUserId, invite, status }) => {
    assert.equal(actorUserId, ids.user);
    assert.equal(invite.id, ids.invite);
    assert.equal(status, "ended", "configuration failure follows server acceptance, so decline is no longer legal");
    record = { ...record, status };
    return { ...record };
  });
  await h.event(nativeEvent("incoming"));
  assert.equal(await h.facade.completeIosNativeCallAnswer(ids.uuid, true), true);
  assert.equal(h.terminalSteps.length, 0, "native dispatch acknowledgment alone does not settle the server invite");
  await h.event(configurationFailureEvent());
  assert.equal(record.status, "ended");
  assert.equal(h.facade.hasIosNativeCallPresentation(ids.invite), false);
  assert.deepEqual(h.terminalSteps.map(({ name }) => name), ["transition", "thread", "presented", "rows"]);
  const threadArgs = h.terminalSteps.find(({ name }) => name === "thread").args;
  assert.equal(threadArgs[0], ids.thread);
  assert.equal(threadArgs[1], "ROOM-LEGACY");
  assert.equal(threadArgs[2].userId, ids.user);
  assert.equal(threadArgs[2].sessionGeneration, ids.session);
  for (const name of ["presented", "rows"]) {
    const input = h.terminalSteps.find(step => step.name === name).args[0];
    assert.equal(input.callInviteId, ids.invite);
    assert.equal(input.threadId, ids.thread);
    assert.equal(input.exactInviteOnly, true);
  }
  assert.equal(h.terminalSteps.find(({ name }) => name === "rows").args[0].userId, ids.user);
  assert.deepEqual(h.nativeSteps.filter(({ name }) => name === "terminal"), [{ name: "terminal", uuid: ids.uuid }]);
  assert.equal(h.subscriptions.has(ids.invite), false);
  assert.equal(h.routes.length, 0, "terminal recovery must not route another Answer");
});

test("actual root and facade retry rejected accepted-call configuration failure cleanup on foreground", async (t) => {
  const h = await mount(t, { realFacade: true });
  let record = { ...acceptedConfigurationFailureInvite };
  h.setReader(async () => ({ ...record }));
  h.setStage("transition", async () => { throw Error("temporary terminal transition rejection"); });
  await h.event(nativeEvent("incoming"));
  await h.event(configurationFailureEvent());
  assert.equal(record.status, "accepted", "local CallKit failure is not proof of server termination");
  assert.equal(h.terminalSteps.length, 3, "one failure receipt has bounded transition retries");
  assert.ok(h.terminalSteps.every(({ name, args }) => name === "transition" && args[0].status === "ended"));
  assert.equal(h.nativeSteps.some(({ name }) => name === "terminal"), false);
  assert.equal(h.facade.hasIosNativeCallPresentation(ids.invite), false, "native failure retires presentation even when server cleanup fails");
  h.setStage("transition", ({ status }) => { record = { ...record, status }; return { ...record }; });
  await h.activate();
  await h.flush();
  assert.equal(record.status, "ended");
  assert.equal(h.terminalSteps.filter(({ name }) => name === "transition").length, 4);
  assert.equal(h.terminalSteps.filter(({ name }) => name === "thread").length, 1);
  assert.deepEqual(h.nativeSteps.filter(({ name }) => name === "terminal"), [{ name: "terminal", uuid: ids.uuid }]);
  assert.equal(h.subscriptions.has(ids.invite), false);
});

test("actual root and facade cannot apply late configuration-failure cleanup to replacement authority", async (t) => {
  const h = await mount(t, { realFacade: true });
  const pending = deferred();
  h.setReader(async () => ({ ...acceptedConfigurationFailureInvite }));
  h.setStage("transition", () => pending.promise);
  await h.event(nativeEvent("incoming"));
  const failure = h.event(configurationFailureEvent());
  await settle();
  assert.deepEqual(h.terminalSteps.map(({ name }) => name), ["transition"]);
  const nextUser = "00000000-0000-4000-8000-000000000007";
  const nextInvite = "00000000-0000-4000-8000-000000000008";
  const nextSession = "00000000-0000-4000-8000-000000000009";
  const replacement = { ...acceptedConfigurationFailureInvite, id: nextInvite,
    communicationRoomId: "ROOM-REPLACEMENT", calleeUserId: nextUser };
  h.setReader(async id => id === nextInvite ? { ...replacement } : { ...acceptedConfigurationFailureInvite });
  await h.rerender({ user: { id: nextUser }, authority: {
    ...binding(nextSession), userId: nextUser, accountId: nextUser,
  } });
  h.emitWithoutWaiting(nativeEvent("incoming", { callUuid: ids.replacementUuid, callInviteId: nextInvite, nativeSessionGeneration: nextSession }));
  await settle();
  await h.resolve(pending, { ...acceptedConfigurationFailureInvite, status: "ended" });
  await failure;
  await h.activate();
  await h.flush();
  assert.deepEqual(h.terminalSteps.map(({ name }) => name), ["transition"], "retired mutation cannot clear thread or notifications under the new account");
  assert.equal(h.nativeSteps.some(({ name }) => name === "terminal" || name === "remoteEnd"), false);
  assert.equal(h.facade.hasIosNativeCallPresentation(nextInvite), true);
  assert.equal(h.subscriptions.has(nextInvite), true);
  assert.equal(h.routes.length, 0);
});

test("late failed route readiness from a retired account cannot fail a replacement native Answer", async (t) => {
  const h = await mount(t);
  await h.incoming();
  const pending = deferred();
  h.setStage("readiness", () => pending.promise);
  const result = h.event({ ...declineEvent, type: "answerRequested" });
  await settle();
  await h.rerender({ authority: binding("session-b") });
  await h.resolve(pending, false);
  await result;
  assert.equal(h.terminalSteps.some(({ name }) => name === "answer-failure"), false);
});

test("old native terminal action cannot borrow a replacement presentation's same-invite authority", async (t) => {
  const h = await mount(t);
  await h.incoming();
  await h.incoming("native-b");
  h.setReader(async () => ringingInvite);
  await h.event(declineEvent);
  assert.deepEqual(h.terminalSteps, []);
  assert.equal(h.subscriptions.has("invite-a"), true);
});

test("native presentation replacement during server transition stops all late terminal cleanup", async (t) => {
  const h = await mount(t);
  await h.incoming();
  h.setReader(async () => ringingInvite);
  const pending = deferred();
  h.setStage("transition", () => pending.promise);
  const outcome = h.event(declineEvent);
  await settle();
  await h.incoming("native-b");
  await h.resolve(pending, { ...ringingInvite, status: "declined" });
  await outcome;
  assert.deepEqual(h.terminalSteps.map(({ name }) => name), ["transition"]);
  assert.equal(h.subscriptions.has("invite-a"), true);
});

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

test("actual native facade, mounted bridge, and provenance deliver one consumable Answer route", async (t) => {
  const h = await mount(t, { realFacade: true });
  await h.event(nativeEvent("incoming"));
  assert.equal(h.facade.hasIosNativeCallPresentation(ids.invite), true);
  await h.event(nativeEvent("answerRequested"));
  await h.event(nativeEvent("answerRequested"));
  assert.equal(h.routes.length, 1, "duplicate native delivery cannot stack or replace a second call screen");
  const destination = new URL(h.routes[0], "https://test.invalid");
  assert.equal(destination.pathname, `/chat/${ids.thread}`);
  const expected = {
    action: "answer", authenticatedUserId: ids.user, claimId: destination.searchParams.get("nativeCallClaim"),
    inviteId: ids.invite, nativeIdentity: ids.uuid, platform: "ios", source: "ios_callkit_native_event", threadId: ids.thread,
  };
  const claim = provenance.consumeNativeCallTransitionClaim(expected);
  assert.equal(claim.consumed, true);
  assert.equal(provenance.isAttestedNativeCallTransitionClaim(claim), true);
  assert.equal(provenance.consumeNativeCallTransitionClaim(expected), null);
  assert.equal(h.nativeSteps.some(({ name }) => name === "answer"), false, "routing is not fabricated media connection success");
});

test("actual facade rejects an old UUID terminal event without erasing replacement Answer readiness", async (t) => {
  const h = await mount(t, { realFacade: true });
  await h.event(nativeEvent("incoming"));
  await h.event(nativeEvent("recovered", { callUuid: ids.replacementUuid }));
  await h.event(nativeEvent("remoteEnded"));
  assert.equal(h.facade.readIosNativeCallPresentations()[0]?.callUuid, ids.replacementUuid);
  assert.equal(h.subscriptions.has(ids.invite), true);
  await h.event(nativeEvent("answerRequested", { callUuid: ids.replacementUuid }));
  assert.equal(h.routes.length, 1);
  assert.equal(new URL(h.routes[0], "https://test.invalid").searchParams.get("nativeCallUuid"), ids.replacementUuid);
  await h.event({ type: "applicationActive" });
  const activationSerial = h.facade.readIosNativeApplicationActiveSerial(ids.invite);
  assert.ok(activationSerial > 0);
  await h.event(nativeEvent("remoteEnded"));
  assert.equal(h.facade.readIosNativeApplicationActiveSerial(ids.invite), activationSerial, "old native events cannot erase the current Answer's activation witness");
});

test("actual facade rejection retains server cancellation until activation retries native dismissal", async (t) => {
  const h = await mount(t, { realFacade: true });
  await h.event(nativeEvent("incoming"));
  h.setReader(async () => ({ status: "canceled" }));
  let attempts = 0;
  h.setStage("os-remoteEnd", async () => {
    attempts += 1;
    if (attempts === 1) throw new Error("native dispatch interrupted");
    h.emitWithoutWaiting(nativeEvent("remoteEnded"));
  });
  await h.update(ids.invite);
  assert.equal(h.facade.hasIosNativeCallPresentation(ids.invite), true);
  assert.equal(h.subscriptions.has(ids.invite), true);
  await h.activate();
  await h.flush();
  assert.equal(attempts, 2);
  assert.equal(h.facade.hasIosNativeCallPresentation(ids.invite), false);
  assert.equal(h.subscriptions.has(ids.invite), false);
});

test("native dispatch acknowledgment alone cannot count as presentation removal", async (t) => {
  const h = await mount(t, { realFacade: true });
  await h.event(nativeEvent("incoming"));
  h.setReader(async () => ({ status: "canceled" }));
  h.setStage("os-remoteEnd", async () => undefined);
  await h.update(ids.invite);
  assert.equal(h.subscriptions.has(ids.invite), true, "retain watcher while the native main-queue operation has not emitted completion");
  assert.equal(h.facade.hasIosNativeCallPresentation(ids.invite), true);
  await h.event(nativeEvent("remoteEnded"));
  assert.equal(h.subscriptions.has(ids.invite), false);
  assert.equal(h.facade.hasIosNativeCallPresentation(ids.invite), false);
});

test("pending native incoming and Answer replay flow through actual facade after activation", async (t) => {
  const h = await mount(t, { realFacade: true });
  h.queue(nativeEvent("incoming"));
  h.queue(nativeEvent("answerRequested"));
  await h.activate();
  await h.flush();
  assert.equal(h.routes.length, 1);
  assert.equal(h.subscriptions.has(ids.invite), true);
});

test("Swift's durable Answer-first replay order recovers presentation before evaluating Answer readiness", async (t) => {
  const h = await mount(t, { realFacade: true });
  const swift = fs.readFileSync("modules/chillywood-native-calls/ios/ChillywoodNativeCallCoordinator.swift", "utf8");
  assert.match(swift, /let events = durableAnswerEvents \+ transientEvents \+ pendingEvents/u, "exercise the queue order produced by the current native implementation");
  h.queue(nativeEvent("answerRequested"));
  h.queue(nativeEvent("incoming"));
  await h.activate();
  await h.flush();
  assert.equal(h.routes.length, 1, "a valid durable Answer must not be rejected before its queued incoming event restores ownership");
  assert.equal(h.nativeSteps.some(({ name }) => name === "answer"), false);
});

test("terminal event in the same replay batch still defeats pending Answer after presentation hydration", async (t) => {
  const h = await mount(t, { realFacade: true });
  h.queue(nativeEvent("answerRequested"));
  h.queue(nativeEvent("incoming"));
  h.queue(nativeEvent("remoteEnded"));
  await h.activate();
  await h.flush();
  assert.equal(h.routes.length, 0);
  assert.equal(h.facade.hasIosNativeCallPresentation(ids.invite), false);
});

test("observer-delivered durable Answer waits for its later incoming event instead of failing handoff", async (t) => {
  const h = await mount(t, { realFacade: true });
  h.emitWithoutWaiting(nativeEvent("answerRequested"));
  await settle();
  assert.equal(h.nativeSteps.length, 0, "missing JS presentation during native replay is not an Answer failure");
  await h.event(nativeEvent("incoming"));
  await h.flush();
  assert.equal(h.routes.length, 1);
  assert.equal(h.nativeSteps.some(({ name }) => name === "answer"), false);
});

test("actual readiness awaiting stable foreground cannot fail a retired account's Answer", async (t) => {
  const h = await mount(t, { realFacade: true });
  await h.event(nativeEvent("incoming"));
  h.emitWithoutWaiting(nativeEvent("answerRequested"));
  await settle();
  await h.rerender({ authority: { ...binding("session-b"), userId: ids.user, accountId: ids.user } });
  await h.flush();
  assert.equal(h.routes.length, 0);
  assert.equal(h.nativeSteps.some(({ name }) => name === "answer"), false);
});

test("native binding resets retired-account events before JS observer replay under a new account", async (t) => {
  const h = await mount(t, {
    realFacade: true, persistedSameAuthority: false,
    initialNativeEvents: [nativeEvent("answerRequested"), nativeEvent("incoming")],
  });
  await h.flush();
  assert.equal(h.routes.length, 0);
  assert.equal(h.facade.hasIosNativeCallPresentation(ids.invite), false);
  assert.equal(h.subscriptions.size, 0);
  assert.ok(h.nativeLifecycleOrder.indexOf("bind") < h.nativeLifecycleOrder.indexOf("listen"));
});

test("same-authority cold launch preserves queued CallKit Answer through native binding", async (t) => {
  const h = await mount(t, {
    realFacade: true, persistedSameAuthority: true,
    initialNativeEvents: [nativeEvent("answerRequested"), nativeEvent("recovered")],
  });
  await h.flush();
  assert.equal(h.routes.length, 1);
  assert.equal(h.subscriptions.has(ids.invite), true);
  const swift = fs.readFileSync("modules/chillywood-native-calls/ios/ChillywoodNativeCallCoordinator.swift", "utf8");
  assert.match(swift, /if previousAuthority != nil && previousAuthority != authority \{\s*ChillywoodNativeCallDiagnostics.shared.record\(\.registrationAuthorityReplaced\)\s*self.resetAccountContextOnMain\(\)/u, "native reset is conditional on a different binding, not every startup");
  assert.match(swift, /private func resetAccountContextOnMain\(\)[\s\S]*?pendingEvents.removeAll\(\)/u);
});

for (const operation of ["request", "complete"]) {
  for (const reporterThrows of [false, true]) {
    test(`actual native Answer ${operation} rejection stays false with bounded evidence: reporter throws ${reporterThrows}`, async t => {
      const h = await mount(t, { realFacade: true });
      await h.event(nativeEvent("incoming"));
      const privateMarker = "PRIVATE-NATIVE-ANSWER-PAYLOAD-TOKEN";
      const original = Object.assign(new Error(privateMarker), {
        domain: "com.apple.CallKit.error.requesttransaction", code: 4,
        callUuid: ids.uuid, inviteId: ids.invite, userInfo: { payload: privateMarker },
      });
      h.setStage(operation === "request" ? "os-requestAnswer" : "os-completeAnswer", async () => { throw original; });
      if (reporterThrows) h.setStage("diagnostic-report", () => { throw new Error("reporter unavailable"); });
      const isCurrent = () => true;
      if (operation === "request") {
        assert.equal(await h.facade.ensureIosForegroundIncomingCallPresentation({
          inviteId: ids.invite, threadId: ids.thread, roomId: "ROOM-LEGACY", isCurrent,
          authority: { ...binding(ids.session), userId: ids.user, accountId: ids.user },
        }), "presented");
      }
      const result = operation === "request"
        ? await h.facade.requestIosNativeCallAnswer(ids.invite, isCurrent)
        : await h.facade.completeIosNativeCallAnswer(ids.uuid, true);
      assert.equal(result, false, "native rejection retains its existing public result");
      assert.equal(h.errorReports.length, 1);
      assert.equal(h.errorReports[0].scope, `ios-native-answer-${operation}`);
      assert.equal(h.errorReports[0].metadata.nativeErrorDomain, "com.apple.CallKit.error.requesttransaction");
      assert.equal(h.errorReports[0].metadata.nativeErrorCode, 4);
      const evidence = JSON.stringify(h.errorReports);
      for (const prohibited of [privateMarker, ids.uuid, ids.invite]) assert.equal(evidence.includes(prohibited), false);
    });
  }
}
