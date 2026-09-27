import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import React from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: doc, parentNode: null, tagName: "DIV" });
doc.documentElement = container();
globalThis.document = doc;
globalThis.window = globalThis;
globalThis.HTMLIFrameElement = class {};
const settle = async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
const authority = (userId = "user-a", generation = "session-a") => ({ userId, accountId: userId, sessionGeneration: generation, state: "ACTIVE", restoreOnly: false });
const baseNow = Date.parse("2026-09-27T12:00:00Z");
const invite = (id = "invite-a", expiresAt = new Date(baseNow + 90_000).toISOString(), status = "ringing") => ({
  id, expiresAt, status, threadId: "thread-a", communicationRoomId: "ROOMA1", callerUserId: "caller", calleeUserId: "user-a",
});
const alertFor = (record = invite()) => ({ invite: record, inviteId: record.id, path: "/chat/thread-a" });

const source = fs.readFileSync(new URL("../app/_layout.tsx", import.meta.url), "utf8");
const ast = ts.createSourceFile("_layout.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functionSource = (name) => {
  const node = ast.statements.find((candidate) => ts.isFunctionDeclaration(candidate) && candidate.name?.text === name);
  assert.ok(node, `execute production ${name}`);
  return node.getText(ast);
};
const bridge = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === "IncomingCallNotificationBridge");
const variables = new Map();
function inspect(node) {
  if (ts.isVariableDeclaration(node)) variables.set(node.name.getText(ast), node.getText(ast));
  ts.forEachChild(node, inspect);
}
inspect(bridge);
const declaration = (name) => { assert.ok(variables.has(name), name); return `const ${variables.get(name)};`; };
const compiled = ts.transpileModule([
  functionSource("useIncomingCallActionOwnership"), functionSource("useIncomingCallAlertDeadline"), functionSource("mergeIncomingCallAlert"),
  "function Harness() { const {authority, isSignedIn, user, alert, pathname} = props;",
  'const latestInviteAlertIdRef = useRef(alert?.inviteId ?? "");',
  ...["currentAlertInviteId", "currentAlertUserId", "incomingActionKey", "incomingActionOwner"].map(declaration),
  "useIncomingCallAlertDeadline(alert, setAlert, timerRef);",
  declaration("showAlert"), declaration("decline"), declaration("openCall"), declaration("leaveRoomAndAnswer"),
  "globalThis.showAlert = showAlert; globalThis.decline = decline; globalThis.openCall = openCall; globalThis.leaveRoomAndAnswer = leaveRoomAndAnswer; return null; } globalThis.Harness = Harness;",
].join("\n"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;

async function mount(t, initial = {}) {
  let now = baseNow;
  let reader = async () => invite();
  const steps = [];
  const handlers = new Map();
  const timers = new Map();
  let serial = 0;
  const step = async (name, args, fallback) => {
    steps.push({ name, args });
    return handlers.has(name) ? handlers.get(name)(...args) : fallback;
  };
  const context = {
    ...React, console,
    props: { authority: authority(), isSignedIn: true, user: { id: "user-a" }, alert: alertFor(), pathname: "/watch-party/room-a", ...initial },
    timerRef: { current: null },
    Date: class extends Date { static now() { return now; } },
    setTimeout: (callback, ms) => { const id = ++serial; timers.set(id, { callback, at: now + ms }); return id; },
    clearTimeout: (id) => timers.delete(id),
    setAlert: (next) => { context.props.alert = typeof next === "function" ? next(context.props.alert) : next; },
    readChillyChatCallInvite: (...args) => reader(...args),
    Platform: { OS: "android" },
    waitForIosNativeCallPresentation: (...args) => step("presentation", args, "presented"),
    resolveIosForegroundIncomingAnswerAuthority: (outcome) => outcome === "presented" ? "native_answer" : "fallback",
    requestIosNativeCallAnswer: (...args) => step("native-answer", args, true),
    createForegroundAuthenticatedUiCallIntent: (...args) => {
      steps.push({ name: "claim", args });
      return { status: "created", claimId: "claim-a" };
    },
    router: { push: (...args) => steps.push({ name: "navigate", args }) },
    updateChillyChatCallInviteStatus: (...args) => step("transition", args, { ...args[0].invite, status: args[0].status }),
    clearEndedChatThreadCall: (...args) => step("thread", args, { cleared: true }),
    dismissPresentedChillyChatCallNotifications: (...args) => step("presented", args, 1),
    dismissChillyChatCallNotificationRows: (...args) => step("rows", args, 1),
    cleanupChillyChatCallNotifications: (...args) => { steps.push({ name: "retry-cleanup", args }); },
    clearAlert: () => { steps.push({ name: "clear", args: [] }); context.props.alert = null; },
    isHostedLiveSurfacePath: (path) => path.startsWith("/watch-party/live-stage"),
    Alert: { alert: (...args) => steps.push({ name: "error", args }) },
  };
  context.globalThis = context;
  vm.runInNewContext(compiled, context);
  const root = createRoot(container());
  let mounted = true;
  const render = () => React.act(async () => { root.render(React.createElement(context.Harness)); await settle(); });
  const unmount = async () => { if (!mounted) return; mounted = false; await React.act(async () => root.unmount()); };
  t.after(unmount);
  await render();
  return {
    steps, timers, get alert() { return context.props.alert; },
    setReader(next) { reader = next; }, setStage(name, handler) { handlers.set(name, handler); },
    decline: () => context.decline(),
    answer: () => context.openCall(),
    retainedAnswer: () => context.openCall,
    retainedDecline: () => context.decline,
    leaveRoomAndAnswer: () => context.leaveRoomAndAnswer(),
    setPlatform(os) { context.Platform.OS = os; },
    async hydrate(next) { context.showAlert(next); await render(); },
    async rerender(next) { context.props = { ...context.props, ...next }; await render(); },
    async resolve(pending, result) { await React.act(async () => { pending.resolve(result); await settle(); }); },
    async advance(ms) {
      now += ms;
      await React.act(async () => {
        for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); }
        await settle();
      });
      await render();
    },
    unmount,
  };
}

test("current global Decline preserves exact room/account cleanup across equivalent rerenders", async (t) => {
  const h = await mount(t);
  const pending = deferred(); h.setStage("transition", () => pending.promise);
  const outcome = h.decline(); await settle();
  await h.rerender({ authority: { ...authority() }, user: { id: "user-a" }, alert: { ...alertFor() } });
  await h.resolve(pending, { ...invite(), status: "declined" }); await outcome;
  assert.deepEqual(h.steps.map(({ name }) => name), ["transition", "thread", "presented", "rows", "retry-cleanup", "clear"]);
  assert.equal(h.steps[1].args[1], "ROOMA1");
  assert.equal(h.steps[1].args[2].sessionGeneration, "session-a");
  assert.equal(h.steps[2].args[0].exactInviteOnly, true);
  assert.equal(h.steps[3].args[0].userId, "user-a");
  assert.equal(h.alert, null);
});

for (const replacement of [
  { name: "new invite", props: { alert: alertFor(invite("invite-b")) } },
  { name: "account replacement", props: { authority: authority("user-b", "session-b"), user: { id: "user-b" } } },
  { name: "new session", props: { authority: authority("user-a", "session-b") } },
  { name: "unknown/sign-out", props: { authority: null, isSignedIn: false, user: null } },
]) {
  test(`old global Decline result cannot clear state after ${replacement.name}`, async (t) => {
    const h = await mount(t);
    const pending = deferred(); h.setStage("transition", () => pending.promise);
    const outcome = h.decline(); await settle();
    await h.rerender(replacement.props);
    const currentAlert = h.alert;
    await h.resolve(pending, { ...invite(), status: "declined" }); await outcome;
    assert.deepEqual(h.steps.map(({ name }) => name), ["transition"]);
    assert.equal(h.alert, currentAlert);
  });
}

test("old global Decline read cannot start a mutation after a new invite arrives", async (t) => {
  const h = await mount(t); const pending = deferred(); h.setReader(() => pending.promise);
  const outcome = h.decline(); await settle();
  await h.rerender({ alert: alertFor(invite("invite-b")) });
  await h.resolve(pending, invite()); await outcome;
  assert.deepEqual(h.steps, []);
  assert.equal(h.alert.inviteId, "invite-b");
});

for (const stage of ["thread", "presented", "rows"]) {
  test(`global Decline stops following work after ownership changes during ${stage}`, async (t) => {
    const h = await mount(t); const pending = deferred(); h.setStage(stage, () => pending.promise);
    const outcome = h.decline(); await settle();
    const count = h.steps.length;
    await h.rerender({ alert: alertFor(invite("invite-b")) });
    await h.resolve(pending, true); await outcome;
    assert.equal(h.steps.length, count);
    assert.equal(h.alert.inviteId, "invite-b");
  });
}

test("global ringing lifetime uses the full server deadline and duplicate readback cannot renew it", async (t) => {
  const h = await mount(t);
  await h.advance(45_000);
  assert.equal(h.alert.inviteId, "invite-a", "the former 45-second presentation cap is not authority");
  await h.rerender({ alert: alertFor() });
  await h.advance(44_999); assert.equal(h.alert.inviteId, "invite-a");
  await h.advance(1); assert.equal(h.alert, null);
});

test("delayed arrival receives only the remaining authoritative lifetime", async (t) => {
  const h = await mount(t, { alert: null });
  await h.advance(80_000); await h.rerender({ alert: alertFor() });
  await h.advance(9_999); assert.equal(h.alert.inviteId, "invite-a");
  await h.advance(1); assert.equal(h.alert, null);
});

test("a retired timer cannot hide the replacement invite even if its callback runs", async (t) => {
  const h = await mount(t);
  const oldCallback = [...h.timers.values()][0].callback;
  const replacement = alertFor(invite("invite-b", new Date(baseNow + 120_000).toISOString()));
  await h.rerender({ alert: replacement });
  oldCallback();
  assert.equal(h.alert.inviteId, "invite-b");
  await h.advance(90_000); assert.equal(h.alert.inviteId, "invite-b");
  await h.advance(30_000); assert.equal(h.alert, null);
});

test("accepted calls do not expire at their former ringing deadline", async (t) => {
  const h = await mount(t);
  const oldCallback = [...h.timers.values()][0].callback;
  await h.rerender({ alert: alertFor(invite("invite-a", invite().expiresAt, "accepted")) });
  oldCallback(); await h.advance(120_000);
  assert.equal(h.alert.invite.status, "accepted");
});

for (const expiresAt of ["invalid", "", new Date(baseNow - 1).toISOString()]) {
  test(`invalid/expired authoritative deadline grants no new ringing window: ${expiresAt || "empty"}`, async (t) => {
    const h = await mount(t, { alert: alertFor(invite("invite-a", expiresAt)) });
    assert.equal(h.alert, null);
    assert.equal(h.timers.size, 0);
  });
}

test("unchanged invite hydration preserves attention/deadline identity but actual status updates apply", async (t) => {
  const h = await mount(t);
  const original = h.alert;
  const originalTimer = [...h.timers.values()][0];
  await h.hydrate(alertFor({ ...invite() }));
  assert.equal(h.alert, original, "unchanged polling must not restart the alert-dependent sound effect");
  assert.equal([...h.timers.values()][0], originalTimer);
  await h.hydrate(alertFor(invite("invite-a", invite().expiresAt, "accepted")));
  assert.notEqual(h.alert, original);
  assert.equal(h.alert.invite.status, "accepted");
  assert.equal(h.timers.size, 0);
});

test("current global Android Answer accepts once and navigates with the exact owned claim", async (t) => {
  const h = await mount(t);
  const pending = deferred(); h.setStage("transition", () => pending.promise);
  const outcome = h.answer(); await settle();
  await h.rerender({ authority: { ...authority() }, alert: alertFor({ ...invite() }) });
  await h.resolve(pending, { ...invite(), status: "accepted" }); await outcome;
  assert.deepEqual(h.steps.map(({ name }) => name), ["transition", "claim", "retry-cleanup", "clear", "navigate"]);
  assert.equal(h.steps[1].args[0].authenticatedUserId, "user-a");
  assert.equal(h.steps[1].args[0].inviteId, "invite-a");
  assert.equal(h.steps.at(-1).args[0].params.foregroundCallClaim, "claim-a");
});

for (const replacement of [
  { name: "new invite", props: { alert: alertFor(invite("invite-b")) } },
  { name: "account replacement", props: { authority: authority("user-b", "session-b"), user: { id: "user-b" } } },
  { name: "new session", props: { authority: authority("user-a", "session-b") } },
  { name: "unknown/sign-out", props: { authority: null, isSignedIn: false, user: null } },
]) {
  test(`old global Answer cannot navigate or clear a banner after ${replacement.name}`, async (t) => {
    const h = await mount(t);
    const pending = deferred(); h.setStage("transition", () => pending.promise);
    const outcome = h.answer(); await settle();
    await h.rerender(replacement.props);
    const currentAlert = h.alert;
    await h.resolve(pending, { ...invite(), status: "accepted" }); await outcome;
    assert.deepEqual(h.steps.map(({ name }) => name), ["transition"]);
    assert.equal(h.alert, currentAlert);
  });
}

test("an old global Answer read cannot start server acceptance after replacement", async (t) => {
  const h = await mount(t); const pending = deferred(); h.setReader(() => pending.promise);
  const outcome = h.answer(); await settle();
  await h.rerender({ alert: alertFor(invite("invite-b")) });
  await h.resolve(pending, invite()); await outcome;
  assert.deepEqual(h.steps, []);
});

test("current global iPhone Answer requests the native owner without a second server acceptance", async (t) => {
  const h = await mount(t); h.setPlatform("ios");
  await h.answer();
  assert.deepEqual(h.steps.map(({ name }) => name), ["presentation", "native-answer", "retry-cleanup", "clear"]);
  assert.equal(h.steps[1].args[0], "invite-a");
});

for (const stage of ["presentation", "native-answer"]) {
  test(`global iPhone Answer rejects stale completion during ${stage}`, async (t) => {
    const h = await mount(t); h.setPlatform("ios");
    const pending = deferred(); h.setStage(stage, () => pending.promise);
    const outcome = h.answer(); await settle();
    const count = h.steps.length;
    await h.rerender({ alert: alertFor(invite("invite-b")) });
    await h.resolve(pending, stage === "presentation" ? "presented" : true); await outcome;
    assert.equal(h.steps.length, count);
    assert.equal(h.alert.inviteId, "invite-b");
  });
}

for (const action of ["Answer", "Decline"]) {
  test(`retained global ${action} callback cannot borrow a replacement invite's owner`, async (t) => {
    const h = await mount(t);
    const retained = action === "Answer" ? h.retainedAnswer() : h.retainedDecline();
    let reads = 0; h.setReader(async () => { reads += 1; return invite(); });
    await h.rerender({ alert: alertFor(invite("invite-b")) });
    await retained();
    assert.equal(reads, 0, "a closed-over old action cannot start work under the new owner");
    assert.deepEqual(h.steps, []);
    assert.equal(h.alert.inviteId, "invite-b");
  });
}

test("delayed Leave room and answer confirmation cannot act on a replacement invite", async (t) => {
  const h = await mount(t);
  h.leaveRoomAndAnswer();
  const confirmation = h.steps[0].args[2].find((button) => button.text === "Leave room and answer");
  assert.equal(typeof confirmation.onPress, "function");
  let reads = 0; h.setReader(async () => { reads += 1; return invite(); });
  await h.rerender({ alert: alertFor(invite("invite-b")) });
  confirmation.onPress(); await settle();
  assert.equal(reads, 0);
  assert.equal(h.steps.length, 1, "no claim, native call, cleanup or navigation follows the old confirmation");
  assert.equal(h.alert.inviteId, "invite-b");
});

test("retained current Answer still works after a semantically equivalent rerender", async (t) => {
  const h = await mount(t);
  const retained = h.retainedAnswer();
  await h.rerender({ authority: { ...authority() }, user: { id: "user-a" }, alert: alertFor({ ...invite() }) });
  await retained();
  assert.deepEqual(h.steps.map(({ name }) => name), ["transition", "claim", "retry-cleanup", "clear", "navigate"]);
});

for (const platform of ["android", "ios"]) {
  test(`overlapping global ${platform} Answer actions dispatch once and cannot replay before banner commit`, async (t) => {
    const h = await mount(t); h.setPlatform(platform);
    const pending = deferred();
    const actionStage = platform === "ios" ? "native-answer" : "transition";
    h.setStage(actionStage, () => pending.promise);
    const retained = h.retainedAnswer();
    const first = retained(); const second = retained(); await settle();
    assert.equal(h.steps.filter(({ name }) => name === actionStage).length, 1);
    await h.resolve(pending, platform === "ios" ? true : { ...invite(), status: "accepted" });
    await Promise.all([first, second]);
    const completedSteps = h.steps.length;
    await retained();
    assert.equal(h.steps.length, completedSteps, "completed owner is retired before the next render");
    assert.equal(h.steps.filter(({ name }) => name === "navigate").length, platform === "ios" ? 0 : 1);
  });
}

for (const firstAction of ["answer", "decline"]) {
  test(`global ${firstAction} holds one action owner against a conflicting tap`, async (t) => {
    const h = await mount(t);
    const pending = deferred(); h.setStage("transition", () => pending.promise);
    const first = h[firstAction](); await settle();
    const conflicting = h[firstAction === "answer" ? "decline" : "answer"](); await settle();
    assert.equal(h.steps.filter(({ name }) => name === "transition").length, 1);
    await h.resolve(pending, { ...invite(), status: firstAction === "answer" ? "accepted" : "declined" });
    await Promise.all([first, conflicting]);
    assert.equal(h.steps.filter(({ name }) => name === "clear").length, 1);
  });
}

for (const action of ["answer", "decline"]) {
  test(`failed global ${action} releases its owner for an explicit retry`, async (t) => {
    const h = await mount(t);
    h.setStage("transition", () => null);
    await h[action]();
    assert.equal(h.alert.inviteId, "invite-a");
    h.setStage("transition", ({ invite: record, status }) => ({ ...record, status }));
    await h[action]();
    assert.equal(h.steps.filter(({ name }) => name === "transition").length, 2);
    assert.equal(h.steps.filter(({ name }) => name === "clear").length, 1);
  });
}

test("retired action completion cannot unlock a replacement invite's pending action", async (t) => {
  const h = await mount(t); const oldPending = deferred(); const newPending = deferred();
  h.setStage("transition", ({ invite: record }) => record.id === "invite-a" ? oldPending.promise : newPending.promise);
  const oldAnswer = h.answer(); await settle();
  await h.rerender({ alert: alertFor(invite("invite-b")) });
  h.setReader(async () => invite("invite-b"));
  const currentAnswer = h.answer(); await settle();
  await h.resolve(oldPending, { ...invite(), status: "accepted" }); await oldAnswer;
  const duplicate = h.answer(); await settle();
  assert.equal(h.steps.filter(({ name }) => name === "transition").length, 2);
  await h.resolve(newPending, { ...invite("invite-b"), status: "accepted" });
  await Promise.all([currentAnswer, duplicate]);
  assert.equal(h.steps.filter(({ name }) => name === "navigate").length, 1);
  assert.equal(h.steps.find(({ name }) => name === "navigate").args[0].params.callInviteId, "invite-b");
});
