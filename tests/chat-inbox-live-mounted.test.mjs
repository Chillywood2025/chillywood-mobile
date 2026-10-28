import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const document = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: document, parentNode: null, tagName: "DIV" });
document.documentElement = container();
globalThis.document = document; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const ownerKey = a => a ? JSON.stringify([a.userId, a.accountId, a.sessionGeneration]) : "";
const thread = id => ({ threadId: id, currentMember: { unreadCount: 0 }, otherMember: { userId: `peer-${id}`, displayName: id } });
const textOf = node => Array.isArray(node) ? node.map(textOf).join(" ")
  : node && typeof node === "object" ? textOf(node.props?.children) : typeof node === "string" ? node : "";

async function mount(t) {
  const state = { focused: true, authority: { userId: "user", accountId: "user", sessionGeneration: "one", state: "ACTIVE", restoreOnly: false }, reads: [], queued: [], friends: ["friend"], friendQueued: [], directQueued: [], searchQueued: [], routes: [], subscriptions: [], retired: [], now: 0 };
  const timers = new Map(), appListeners = new Set(); let timerId = 0;
  const schedule = (callback, delay, interval = false) => { const id = ++timerId; timers.set(id, { callback, delay, interval, due: state.now + delay }); return id; };
  const native = { AppState: { currentState: "active", addEventListener(_event, callback) { appListeners.add(callback); return { remove: () => appListeners.delete(callback) }; } }, StyleSheet: { create: value => value }, Alert: { alert: noop } };
  const modules = {
    react: React, "react-native": native,
    "expo-router": { useRouter: () => ({ push: route => state.routes.push(route) }), useFocusEffect: callback => React.useEffect(() => state.focused ? callback() : undefined, [callback, state.focused]) },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "../../_lib/session": { useSession: () => ({ isLoading: false, isSignedIn: !!state.authority, user: state.authority ? { id: state.authority.userId } : null, authority: state.authority }) },
    "../../_lib/accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: () => state.authority },
    "../../_lib/notificationActivity": { getNotificationActivityOwnerKey: ownerKey },
    "../../_lib/accountAccess": { readAccountAccessStatus: async () => ({ restricted: false }) },
    "../../_lib/analytics": { trackEvent: noop },
    "../../_lib/chat": {
      listChatThreads: options => { state.reads.push(options); const next = state.queued.length ? state.queued.shift() : [thread("initial")]; return next instanceof Error ? Promise.reject(next) : Promise.resolve(next); },
      subscribeToInbox: callback => { state.subscriptions.push(callback); return () => state.retired.push(callback); },
      getOrCreateDirectThread: () => Promise.resolve(state.directQueued.shift()),
    },
    "../../_lib/friendGraph": { readActiveFriendUserIds: () => { const next = state.friendQueued.length ? state.friendQueued.shift() : state.friends; return next instanceof Error ? Promise.reject(next) : Promise.resolve(next); } },
    "../../_lib/officialAccounts": { getOfficialPlatformAccount: () => null },
    "../../_lib/peopleSearchNormalization": { matchesPeopleSearchValues: () => true, normalizePeopleSearchQuery: query => ({ searchable: !!query, candidates: query ? [query] : [], cleaned: query }) },
    "../../_lib/publicPeopleSearch": { searchPublicPeople: () => Promise.resolve(state.searchQueued.shift() ?? []) },
    "../../_lib/userFacingErrors": { getUserFacingErrorMessage: (error, fallback) => error?.message || fallback },
  };
  // Mount all production lifecycle hooks. Only omit the JSX host tree; capture
  // the state/actions immediately before that return, without replacing logic.
  let source = fs.readFileSync("app/chat/index.tsx", "utf8");
  const ast = ts.createSourceFile("inbox.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const screen = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "ChillyChatInboxScreen");
  let emptyState;
  const findEmpty = node => {
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === "ListEmptyComponent") emptyState = node.initializer.expression.getText(ast);
    ts.forEachChild(node, findEmpty);
  };
  findEmpty(screen);
  assert.ok(emptyState, "production empty-state expression is exercised");
  const returned = screen.body.statements.find(n => ts.isIfStatement(n) && n.expression.getText(ast) === "authLoading || loading");
  source = source.slice(0, returned.pos) + `\nruntime.snapshot = { threads, activeFriendUserIds, loading, refreshing, error, loadThreads, openDirectThreadForPerson, startingChatUserId, searchPeopleLoading, setSearchQuery, emptyState: ${emptyState} }; return null;\n}` + source.slice(screen.end);
  const javascript = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(javascript, { exports: module.exports, module, require: id => modules[id] ?? {}, runtime: state, AbortController,
    setTimeout: (fn, delay) => schedule(fn, delay), clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => schedule(fn, delay, true), clearInterval: id => timers.delete(id),
  });
  const root = createRoot(container());
  const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
  const run = async fn => React.act(async () => { fn(); await flush(); });
  const render = () => run(() => root.render(React.createElement(module.exports.default)));
  await render();
  t.after(async () => { await run(() => root.unmount()); assert.equal(appListeners.size, 0); assert.equal(timers.size, 0); });
  return { state, run, render, get snapshot() { return state.snapshot; },
    async appState(value) { await run(() => { native.AppState.currentState = value; appListeners.forEach(callback => callback(value)); }); },
    async focus(value) { state.focused = value; await render(); },
    async advance(ms) { const end = state.now + ms; while (true) { const next = [...timers.entries()].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0]; if (!next) break; state.now = next[1].due; if (next[1].interval) next[1].due += next[1].delay; else timers.delete(next[0]); await run(next[1].callback); } state.now = end; },
  };
}

test("focused inbox reconciles hints, preserves rows on errors and polls only in foreground", async t => {
  const h = await mount(t); assert.equal(h.snapshot.threads[0].threadId, "initial");
  h.state.queued.push(new Error("offline"));
  await h.run(() => h.state.subscriptions.at(-1)());
  assert.equal(h.snapshot.threads[0].threadId, "initial"); assert.equal(h.snapshot.error, "offline");
  assert.deepEqual(h.snapshot.activeFriendUserIds, ["friend"]);
  const before = h.state.reads.length;
  await h.advance(64_999); assert.equal(h.state.reads.length, before);
  await h.advance(1); assert.equal(h.state.reads.length, before + 1);
  await h.appState("background"); await h.advance(130_000); assert.equal(h.state.reads.length, before + 1);
  await h.appState("active"); assert.equal(h.state.reads.length, before + 2);
  await h.focus(false); await h.appState("background"); await h.appState("active"); await h.advance(130_000);
  assert.equal(h.state.reads.length, before + 2);
});

test("deadline aborts without allowing overlapping retry while source ignores abort", async t => {
  const h = await mount(t); const held = deferred(); h.state.queued.push(held.promise);
  await h.run(() => { void h.snapshot.loadThreads(true); });
  const before = h.state.reads.length; const signal = h.state.reads.at(-1).signal;
  await h.advance(15_000);
  assert.equal(signal.aborted, true); assert.equal(h.snapshot.refreshing, false); assert.match(h.snapshot.error, /took too long/);
  await h.run(() => { void h.snapshot.loadThreads(true); });
  await h.appState("background"); await h.appState("active");
  await h.advance(130_000); assert.equal(h.state.reads.length, before);
  h.state.queued.push([thread("fresh")]);
  await h.run(() => held.resolve([thread("stale")]));
  assert.equal(h.state.reads.length, before + 1); assert.equal(h.snapshot.threads[0].threadId, "fresh");
});

test("blur/refocus and same-user session replacement fence old responses and retired hints", async t => {
  const h = await mount(t); const held = deferred(); h.state.queued.push(held.promise);
  await h.run(() => { void h.snapshot.loadThreads(true); });
  const oldHint = h.state.subscriptions.at(-1);
  await h.focus(false); await h.focus(true);
  h.state.authority = { ...h.state.authority, sessionGeneration: "two" };
  h.state.queued.push([thread("new-session")]); await h.render();
  assert.equal(h.snapshot.threads[0].threadId, "new-session");
  const before = h.state.reads.length;
  await h.run(() => { oldHint(); held.resolve([thread("old-session")]); });
  assert.equal(h.snapshot.threads[0].threadId, "new-session"); assert.equal(h.state.reads.length, before);
});

test("pending friend enrichment remains part of the same flight and cannot overwrite a later session", async t => {
  const h = await mount(t); const held = deferred(); h.state.friendQueued.push(held.promise);
  await h.run(() => { void h.snapshot.loadThreads(true); });
  const before = h.state.reads.length;
  await h.advance(15_000); await h.run(() => { void h.snapshot.loadThreads(true); });
  assert.equal(h.state.reads.length, before);
  h.state.authority = { ...h.state.authority, sessionGeneration: "new" }; h.state.friends = ["new-friend"];
  await h.render(); await h.run(() => held.resolve(["old-friend"]));
  assert.deepEqual(h.snapshot.activeFriendUserIds, ["new-friend"]);
});

for (const interrupt of ["background", "blur"]) {
  test(`${interrupt} retires direct-thread busy state without late navigation or failure`, async t => {
    const h = await mount(t); const held = deferred(); h.state.directQueued.push(held.promise);
    await h.run(() => { void h.snapshot.openDirectThreadForPerson({ userId: "new-peer", displayName: "New peer" }); });
    assert.equal(h.snapshot.startingChatUserId, "new-peer");
    if (interrupt === "background") { await h.appState("background"); await h.appState("active"); }
    else { await h.focus(false); await h.focus(true); }
    assert.equal(h.snapshot.startingChatUserId, "");
    await h.run(() => held.reject(new Error("retired failure")));
    assert.equal(h.snapshot.startingChatUserId, ""); assert.equal(h.state.routes.length, 0);
  });
}

test("background retires held people-search busy state", async t => {
  const h = await mount(t); const held = deferred(); h.state.searchQueued.push(held.promise);
  await h.run(() => h.snapshot.setSearchQuery("Ada")); await h.advance(420);
  assert.equal(h.snapshot.searchPeopleLoading, true);
  await h.appState("background"); assert.equal(h.snapshot.searchPeopleLoading, false);
  await h.run(() => held.reject(new Error("retired search")));
  assert.equal(h.snapshot.searchPeopleLoading, false);
});

test("session rotations cap pending owners without eviction and recover after a source settles", async t => {
  const h = await mount(t);
  const baseline = h.state.reads.length;
  const held = Array.from({ length: 4 }, deferred);
  h.state.queued.push(held[0].promise);
  await h.run(() => { void h.snapshot.loadThreads(true); });
  for (let i = 1; i < 4; i++) {
    h.state.authority = { ...h.state.authority, sessionGeneration: `held-${i}` };
    h.state.queued.push(held[i].promise);
    await h.render();
    assert.equal(h.snapshot.threads.length, 0, "old owner rows are not shown by a replacement");
  }
  assert.equal(h.state.reads.length, baseline + 4);
  for (let i = 4; i < 9; i++) {
    h.state.authority = { ...h.state.authority, sessionGeneration: `refused-${i}` };
    await h.render();
    assert.equal(h.state.reads.length, baseline + 4, "rotations cannot accumulate more underlying reads");
    assert.equal(h.snapshot.threads.length, 0);
    assert.equal(h.snapshot.loading, false);
    assert.equal(h.snapshot.refreshing, false);
    assert.match(h.snapshot.error, /requests are still finishing/);
    assert.match(textOf(h.snapshot.emptyState), /Inbox unavailable/);
    assert.doesNotMatch(textOf(h.snapshot.emptyState), /No Chi'lly Chat threads yet/);
  }
  await h.advance(130_000);
  assert.equal(h.state.reads.length, baseline + 4, "deadlines and fallback must not evict pending owners");
  await h.run(() => held[0].resolve([thread("obsolete-owner")]));
  assert.equal(h.snapshot.threads.length, 0);
  assert.equal(h.state.reads.length, baseline + 4, "settling a retired owner does not publish its rows");
  h.state.queued.push([thread("recovered-current-owner")]);
  await h.run(() => { void h.snapshot.loadThreads(true); });
  assert.equal(h.state.reads.length, baseline + 5);
  assert.equal(h.snapshot.threads[0].threadId, "recovered-current-owner");
  assert.equal(h.snapshot.error, null);
  assert.equal(h.snapshot.loading, false);
  assert.equal(h.snapshot.refreshing, false);
  await h.run(() => held.slice(1).forEach((read, index) => read.resolve([thread(`retired-${index}`)])));
  assert.equal(h.snapshot.threads[0].threadId, "recovered-current-owner");
});
