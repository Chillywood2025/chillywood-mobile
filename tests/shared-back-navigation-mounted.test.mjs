import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const displayText = (() => {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync("_lib/displayText.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports });
  return module.exports;
})();
const document = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: document, parentNode: null, tagName: "DIV" });
document.documentElement = container();
globalThis.document = document; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const ownerKey = a => a ? JSON.stringify([a.userId, a.accountId, a.sessionGeneration]) : "";
const thread = id => ({ threadId: id, currentMember: { unreadCount: 0 }, otherMember: { userId: `peer-${id}`, displayName: id } });
const textOf = node => Array.isArray(node) ? node.map(textOf).join(" ")
  : node && typeof node === "object" ? textOf(node.props?.children) : typeof node === "string" ? node : "";

async function mount(t, options = {}) {
  const state = { focused: true, authority: { userId: "user", accountId: "user", sessionGeneration: "one", state: "ACTIVE", restoreOnly: false }, reads: [], queued: [], friends: ["friend"], friendQueued: [], directQueued: [], searchQueued: [], routes: [], subscriptions: [], retired: [], now: 0 };
  Object.assign(state, { canGoBack: false, authLoading: false, restricted: false, insets: { top: 59, bottom: 34, left: 0, right: 0 } }, options);
  const timers = new Map(), appListeners = new Set(); let timerId = 0;
  const schedule = (callback, delay, interval = false) => { const id = ++timerId; timers.set(id, { callback, delay, interval, due: state.now + delay }); return id; };
  const native = { Text: "Text", View: "View", TouchableOpacity: "TouchableOpacity", ActivityIndicator: "ActivityIndicator", FlatList: "FlatList", RefreshControl: "RefreshControl", TextInput: "TextInput", AppState: { currentState: "active", addEventListener(_event, callback) { appListeners.add(callback); return { remove: () => appListeners.delete(callback) }; } }, StyleSheet: { create: value => value }, Alert: { alert: noop } };
  const modules = {
    react: React, "react-native": native,
    "../../components/navigation/app-back-button": { AppBackButton },
    "../../components/ui/chillywood-branded-surface": { ChillywoodBrandedSurface: "Surface" },
    "expo-router": { useRouter: () => ({ push: route => state.routes.push(route), canGoBack: () => state.canGoBack, back: () => state.routes.push("BACK"), replace: route => state.routes.push(route) }), useFocusEffect: callback => React.useEffect(() => state.focused ? callback() : undefined, [callback, state.focused]) },
    "react-native-safe-area-context": { useSafeAreaInsets: () => state.insets },
    "../../_lib/session": { useSession: () => ({ isLoading: state.authLoading, isSignedIn: !!state.authority, user: state.authority ? { id: state.authority.userId } : null, authority: state.authority }) },
    "../../_lib/accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: () => state.authority },
    "../../_lib/notificationActivity": { getNotificationActivityOwnerKey: ownerKey },
    "../../_lib/accountAccess": { readAccountAccessStatus: async () => ({ restricted: state.restricted }) },
    "../../_lib/analytics": { trackEvent: noop },
    "../../_lib/displayText": displayText,
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
  // Keep complete production hooks, handlers and every render branch; replace
  // only native host rendering with a captured React element tree.
  const source = options.source ?? fs.readFileSync("app/chat/index.tsx", "utf8");
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true },
    transformers: { before: [context => root => ts.visitEachChild(root, node => {
      if (!ts.isFunctionDeclaration(node) || node.name?.text !== "ChillyChatInboxScreen") return node;
      const visit = n => {
        if (ts.isFunctionLike(n)) return n;
        if (ts.isReturnStatement(n) && n.expression) return ts.factory.updateReturnStatement(n, ts.factory.createCallExpression(ts.factory.createIdentifier("capture"), undefined, [n.expression]));
        return ts.visitEachChild(n, visit, context);
      };
      return ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, ts.factory.updateBlock(node.body, node.body.statements.map(visit)));
    }, context)] },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(javascript, { exports: module.exports, module, require: id => modules[id] ?? {}, capture: tree => { state.tree = tree; return null; }, AbortController,
    setTimeout: (fn, delay) => schedule(fn, delay), clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => schedule(fn, delay, true), clearInterval: id => timers.delete(id),
  });
  const root = createRoot(container());
  const flush = async () => { for (let i = 0; i < 25; i++) await Promise.resolve(); };
  const run = async fn => React.act(async () => { fn(); await flush(); });
  const render = () => run(() => root.render(React.createElement(module.exports.default)));
  await render();
  t.after(async () => { await run(() => root.unmount()); assert.equal(appListeners.size, 0); assert.equal(timers.size, 0); });
  return { state, run, render, get tree() { return state.tree; },
    async appState(value) { await run(() => { native.AppState.currentState = value; appListeners.forEach(callback => callback(value)); }); },
    async focus(value) { state.focused = value; await render(); },
    async advance(ms) { const end = state.now + ms; while (true) { const next = [...timers.entries()].filter(([, timer]) => timer.due <= end).sort((a, b) => a[1].due - b[1].due)[0]; if (!next) break; state.now = next[1].due; if (next[1].interval) next[1].due += next[1].delay; else timers.delete(next[0]); await run(next[1].callback); } state.now = end; },
  };
}


function loadBackButton(source = fs.readFileSync("components/navigation/app-back-button.tsx", "utf8")) {
  const module = { exports: {} };
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require: id => id === "react" ? React : id === "@expo/vector-icons" ? { Ionicons: "Icon" } : { Text: "Text", TouchableOpacity: "TouchableOpacity", StyleSheet: { create: x => x, flatten: x => x } } });
  return module.exports.AppBackButton;
}
const AppBackButton = loadBackButton();
test("standalone player and both Spectator header branches use shared functional arrow", () => {
  for (const [file, testId, count] of [
    ["app/player/[id].tsx", "standalone-player-back-button", 1],
    ["app/spectate-metadata/[itemId].tsx", "spectator-back-button", 2],
    ["components/merch/merch-screens.tsx", "merch-back-button", 1],
  ]) {
    const source = fs.readFileSync(file, "utf8");
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const controls = [];
    const visit = n => {
      if (ts.isJsxSelfClosingElement(n) && n.tagName.getText(ast) === "AppBackButton" && n.attributes.properties.some(a => a.name?.text === "testID" && a.initializer?.text === testId)) controls.push(n);
      ts.forEachChild(n, visit);
    };
    visit(ast); assert.equal(controls.length, count);
    for (const control of controls) for (const canGoBack of [true, false]) {
      const press = control.attributes.properties.find(a => a.name?.text === "onPress").initializer.expression.getText(ast);
      const calls = [];
      vm.runInNewContext(`(${press})()`, { router: { canGoBack: () => canGoBack, back: () => calls.push("BACK"), replace: route => calls.push(route) } });
      assert.deepEqual(calls, [canGoBack ? "BACK" : file.startsWith("components") ? "/(tabs)/profile" : "/(tabs)"]);
    }
  }
});
function productionCallback(file, name) {
  const source = fs.readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  const visit = n => {
    if (ts.isVariableDeclaration(n) && n.name.getText(ast) === name) expression = ts.isCallExpression(n.initializer) ? n.initializer.arguments[0].getText(ast) : n.initializer.getText(ast);
    ts.forEachChild(n, visit);
  };
  visit(ast); assert.ok(expression, `production callback ${name}`);
  return globals => vm.runInNewContext(`(${expression})`, globals);
}
test("thread and Waiting Room execute their actual stack/deep-link callbacks", () => {
  for (const [file, name, fallback] of [
    ["app/chat/[threadId].tsx", "onThreadBack", "/chat"],
    ["app/watch-party/index.tsx", "onWaitingRoomBack", "/(tabs)/live"],
  ]) {
    for (const canGoBack of [true, false]) {
      const calls = [];
      const callback = productionCallback(file, name)({ router: { canGoBack: () => canGoBack, back: () => calls.push("BACK"), replace: route => calls.push(route) } });
      callback(); assert.deepEqual(calls, [canGoBack ? "BACK" : fallback]);
    }
  }
  const thread = fs.readFileSync("app/chat/[threadId].tsx", "utf8");
  assert.equal((thread.match(/\{threadStateBackControl\(\)\}/g) ?? []).length, 4);
  assert.equal((thread.match(/onPress=\{onThreadBack\}/g) ?? []).length, 2);
  assert.doesNotMatch(thread, /← Back/);
});
test("shared room/stage settings playback callbacks and root tab semantics remain bound", () => {
  for (const [file, testId, handler] of [
    ["app/watch-party/index.tsx", "watch-party-waiting-room-back-button", "onWaitingRoomBack"],
    ["app/watch-party/[partyId].tsx", "watch-party-room-back-button", "returnToWatchPartyEntry"],
    ["app/watch-party/live-stage/[partyId].tsx", "live-stage-live-room-button", "onReturnToLiveRoom"],
  ]) {
    const source = fs.readFileSync(file, "utf8");
    const controls = [...source.matchAll(/<AppBackButton[\s\S]*?\/>/g)].map(m => m[0]);
    const control = controls.find(c => c.includes(`testID="${testId}"`));
    assert.ok(control); assert.ok(control.includes(`onPress={${handler}}`));
  }
  const playback = fs.readFileSync("app/event-watch/[eventId].tsx", "utf8");
  assert.match(playback, /stop\(\); if \(router.canGoBack\(\)\) router.back\(\)/);
  assert.match(fs.readFileSync("app/watch-party/live-stage/[partyId].tsx", "utf8"), /onPressIn=\{armAndRevealStageOverlay\}/);
  for (const file of ["app/(tabs)/index.tsx", "app/(tabs)/live.tsx"]) assert.doesNotMatch(fs.readFileSync(file, "utf8"), /<AppBackButton/);
});
const walk = (n, predicate) => Array.isArray(n) ? n.flatMap(x => walk(x, predicate)) : n && typeof n === "object" ? [...(predicate(n) ? [n] : []), ...walk(n.props?.children, predicate)] : [];
function inboxBack(tree) {
  const controls = walk(tree, n => n.props.testID === "chat-inbox-back-button");
  assert.equal(controls.length, 1, "Inbox must expose exactly one back control");
  return AppBackButton(controls[0].props);
}
function checkArrow(button) {
  assert.equal(textOf(button).trim(), "");
  assert.equal(button.props.children.type, "Icon");
  assert.equal(button.props.children.props.name, "arrow-back");
  assert.equal(button.props.children.props.size, 24);
  assert.equal(button.props.accessibilityRole, "button");
  assert.ok(button.props.accessibilityLabel);
  assert.equal(button.props.accessible, true);
  assert.equal(button.props.focusable, true);
  assert.ok(button.props.style[0].minHeight >= 44);
  assert.ok(button.props.style[0].minWidth >= 44);
}

test("negative controls detect missing Inbox exit and inert cold-link arrow", async t => {
  const source = fs.readFileSync("app/chat/index.tsx", "utf8");
  const missing = await mount(t, { source: source.replaceAll("{inboxBackControl}", "{null}") });
  assert.throws(() => inboxBack(missing.tree), /exactly one back control/);
  const inert = await mount(t, { source: source.replace('else router.replace("/(tabs)");', "else void 0;") });
  inboxBack(inert.tree).props.onPress();
  assert.throws(() => assert.equal(inert.state.routes.at(-1), "/(tabs)"), /Expected values/);
});
test("shared production control is arrow-only, accessible and preserves callbacks", () => {
  let presses = 0, armed = 0;
  const button = AppBackButton({ label: "Live Room", onPress: () => presses++, onPressIn: () => armed++ });
  checkArrow(button);
  assert.equal(button.props.accessibilityLabel, "Back to Live Room");
  assert.equal(button.props.hitSlop, 12);
  button.props.onPressIn(); button.props.onPress();
  assert.equal(presses, 1); assert.equal(armed, 1);
  const disabled = AppBackButton({ disabled: true, accessibilityLabel: "Return to Live Room", hitSlop: 20 });
  assert.equal(disabled.props.disabled, true); assert.equal(disabled.props.accessibilityState.disabled, true);
  assert.equal(disabled.props.hitSlop, 20);
  assert.throws(() => checkArrow(loadBackButton(fs.readFileSync("components/navigation/app-back-button.tsx", "utf8").replace('name="arrow-back"', 'name="close"'))({})), /Expected values/);
});
for (const mode of ["ready", "loading", "signed-out", "restricted", "error"]) {
  test(`Inbox ${mode}: one accessible back control with stack and cold-link escape`, async t => {
    const h = await mount(t, { authLoading: mode === "loading", authority: mode === "signed-out" ? null : { userId: "user", accountId: "user", sessionGeneration: "one", state: "ACTIVE", restoreOnly: false }, restricted: mode === "restricted", queued: mode === "error" ? [new Error("offline")] : [] });
    const controls = walk(h.tree, n => n.props.testID === "chat-inbox-back-button");
    if (mode === "restricted") assert.equal(h.tree.props.testID, "chat-access-restricted-state");
    if (mode === "loading") assert.match(textOf(h.tree), /Checking Chi'lly Chat access/);
    if (mode === "signed-out") assert.match(textOf(h.tree), /Sign in to open/);
    assert.equal(controls.length, 1);
    const button = AppBackButton(controls[0].props); checkArrow(button);
    button.props.onPress(); assert.equal(h.state.routes.at(-1), "/(tabs)");
    h.state.canGoBack = true; button.props.onPress(); assert.equal(h.state.routes.at(-1), "BACK");
    const position = walk(h.tree, n => Array.isArray(n.props.style) && n.props.style[0]?.position === "absolute")[0].props.style[1];
    assert.equal(position.top, 67); assert.equal(position.left, 16);
    h.state.insets = { top: 0, bottom: 21, left: 59, right: 59 }; await h.render();
    const landscape = walk(h.tree, n => Array.isArray(n.props.style) && n.props.style[0]?.position === "absolute")[0].props.style[1];
    assert.equal(landscape.left, 59); assert.equal(landscape.right, 59); assert.equal(landscape.top, 8);
  });
}
