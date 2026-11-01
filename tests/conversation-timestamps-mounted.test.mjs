import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync, execFileSync } from "node:child_process";
import test from "node:test";
import React from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";
import { computeValidationPlan } from "../scripts/ci/required-validation.mjs";

const rootPath = path.resolve(import.meta.dirname, "..");
const noop = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const document = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: document, parentNode: null, tagName: "DIV" });
document.documentElement = container();
globalThis.document = document; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const WEEK = 604800000;
const sources = [
  ["app/chat/index.tsx", 1], ["app/chat/[threadId].tsx", 2],
  ["components/notifications/notification-bell-button.tsx", 1], ["components/ProfileSocialFeedCard.tsx", 1],
  ["app/profile/[userId].tsx", 1], ["app/player/[id].tsx", 2],
  ["app/watch-party/[partyId].tsx", 1], ["app/watch-party/live-stage/[partyId].tsx", 1],
];
function read(file) {
  let source = process.env.TIMESTAMP_CONTROL === "old-renderers" && sources.some(([name]) => name === file)
    ? execFileSync("git", ["show", `934db4003e604e9ac42aa6feb9d4511e1c80a97b:${file}`], { cwd: rootPath, encoding: "utf8" })
    : fs.readFileSync(path.join(rootPath, file), "utf8");
  if (file === "_lib/conversationTimestamp.ts") {
    if (process.env.TIMESTAMP_CONTROL === "inclusive-week") source = source.replace("age < CONVERSATION_TIMESTAMP_WEEK_MS", "age <= CONVERSATION_TIMESTAMP_WEEK_MS");
    if (process.env.TIMESTAMP_CONTROL === "utc") source = source.replace("timeZone: options.timeZone", 'timeZone: "UTC"');
    if (process.env.TIMESTAMP_CONTROL === "missing-now") source = source.replace('return { label: "Time unavailable", fullLabel: "Time unavailable", valid: false }', 'return formatConversationTimestamp(now, now, options)');
  }
  if (file === "hooks/use-conversation-clock.ts" && process.env.TIMESTAMP_CONTROL === "frozen") source = source.replace("listeners.forEach((listener) => listener());", "// deliberately broken clock notification");
  if (file === "components/social/conversation-timestamp.tsx" && process.env.TIMESTAMP_CONTROL === "short-accessibility") source = source.replace("accessibilityLabel={timestamp.fullLabel}", "accessibilityLabel={timestamp.label}");
  if (file === "_lib/chat.ts" && process.env.TIMESTAMP_CONTROL === "invented-provenance") source = source.replace("displayCreatedAt: toText(row.created_at) || null", "displayCreatedAt: new Date().toISOString()");
  if (file === "_lib/chat.ts" && process.env.TIMESTAMP_CONTROL === "metadata-activity") source = source.replace("toText(row.last_message_at) || toText(row.created_at) || null", "toText(row.last_message_at) || toText(row.updated_at) || null");
  if (file === "_lib/notifications.ts" && process.env.TIMESTAMP_CONTROL === "normalized-invalid-date") source = source.replace("displayCreatedAt: normalizeText(row.created_at) || null", "displayCreatedAt: normalizeIsoTimestamp(row.created_at)");
  if (file === "app/chat/index.tsx" && process.env.TIMESTAMP_CONTROL === "changed-back-wrapper") source = source.replace('backNavigation: { position: "absolute", zIndex: 1', 'backNavigation: { position: "absolute", zIndex: 2');
  if (file === "app/chat/[threadId].tsx" && process.env.TIMESTAMP_CONTROL === "changed-unread-color") source = source.replace('borderColor: "#C5A8FF"', 'borderColor: "#000000"');
  if (file === "app/chat/index.tsx" && process.env.TIMESTAMP_CONTROL === "changed-original-style") source = source.replace('paddingBottom: 38', 'paddingBottom: 39');
  return source;
}
const ast = file => ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, file.endsWith("tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
function nodes(source, predicate) {
  const result = [];
  const visit = node => { if (predicate(node)) result.push(node); ts.forEachChild(node, visit); };
  visit(source); return result;
}
function declaration(file, name) {
  const source = ast(file);
  const node = nodes(source, n => (ts.isFunctionDeclaration(n) && n.name?.text === name)
    || (ts.isVariableDeclaration(n) && n.name.getText(source) === name))[0];
  assert.ok(node, `actual ${file} declaration ${name}`);
  return ts.isVariableDeclaration(node) ? `const ${node.getText(source)};` : node.getText(source);
}
const compile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true,
} }).outputText;
const textOf = node => Array.isArray(node) ? node.map(textOf).join("")
  : node && typeof node === "object" ? textOf(node.props?.children)
    : typeof node === "string" || typeof node === "number" ? String(node) : "";

function harness({ now = "2026-10-16T08:30:00Z", zone = "America/Los_Angeles", locale = "en-US" } = {}) {
  const state = { now: Date.parse(now), zone, locale };
  const timers = new Map(), activations = new Set(), captures = new Map(), cache = new Map();
  let sequence = 0;
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
    static now() { return state.now; }
  }
  const intl = { DateTimeFormat: function(locales, options) {
    return new Intl.DateTimeFormat(locales ?? state.locale, { ...options, timeZone: options?.timeZone ?? state.zone });
  } };
  const schedule = (fn, delay, interval = false) => { const id = ++sequence; timers.set(id, { fn, due: state.now + delay, delay, interval }); return id; };
  const native = {
    AppState: { currentState: "active", addEventListener: (type, callback) => { assert.equal(type, "change"); activations.add(callback); return { remove: () => activations.delete(callback) }; } },
    Platform: { OS: "ios", select: value => value.ios ?? value.default },
    useWindowDimensions: () => ({ fontScale: 1 }), StyleSheet: { create: value => value, absoluteFillObject: {} },
  };
  for (const name of ["Text", "View", "TouchableOpacity", "Pressable", "ScrollView", "Modal", "ActivityIndicator", "TextInput", "RefreshControl"]) {
    native[name] = function Host(props) {
      const key = React.useId();
      React.useLayoutEffect(() => { captures.set(key, { name, ...props }); return () => captures.delete(key); });
      return React.createElement(React.Fragment, null, ...React.Children.toArray(props.children).filter(React.isValidElement));
    };
  }
  const globals = { React, Date: ClockDate, Intl: intl, console, AbortController,
    setTimeout: (fn, delay) => schedule(fn, delay), clearTimeout: id => timers.delete(id),
    setInterval: (fn, delay) => schedule(fn, delay, true), clearInterval: id => timers.delete(id),
  };
  function evaluate(source, extra = {}, modules = {}) {
    const context = { ...globals, exports: {}, require: name => {
      if (name === "react") return React;
      if (name === "react-native") return native;
      assert.ok(Object.hasOwn(modules, name), `unmodeled import ${name}`); return modules[name];
    }, ...extra };
    vm.runInNewContext(compile(source), context); return context;
  }
  function load(file, overrides = {}) {
    if (cache.has(file)) return cache.get(file);
    const source = read(file);
    const modules = { ...overrides };
    for (const match of compile(source).matchAll(/require\("([^"]+)"\)/g)) {
      const name = match[1];
      if (name.startsWith(".") && !Object.hasOwn(modules, name)) {
        const relative = path.posix.normalize(path.posix.join(path.posix.dirname(file), name));
        const resolved = [relative, `${relative}.ts`, `${relative}.tsx`].find(candidate => fs.existsSync(path.join(rootPath, candidate)));
        assert.ok(resolved, `resolve ${name}`); modules[name] = load(resolved);
      }
    }
    const result = evaluate(source, {}, modules).exports; cache.set(file, result); return result;
  }
  const formatter = load("_lib/conversationTimestamp.ts");
  const clock = load("hooks/use-conversation-clock.ts");
  const component = load("components/social/conversation-timestamp.tsx").ConversationTimestamp;
  const root = createRoot(container());
  const act = async callback => React.act(async () => { await callback(); for (let i = 0; i < 30; i++) await Promise.resolve(); });
  return {
    state, timers, activations, captures, formatter, component, clock, load, evaluate, native, act,
    render: element => act(() => root.render(element)),
    unmount: () => act(() => root.unmount()),
    async advance(milliseconds) {
      const target = state.now + milliseconds;
      while (true) {
        const next = [...timers.entries()].filter(([, timer]) => timer.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
        if (!next) break;
        const [id, timer] = next; state.now = timer.due;
        if (timer.interval) timer.due += timer.delay; else timers.delete(id);
        await act(timer.fn);
      }
      state.now = target;
    },
    active: () => act(() => activations.forEach(callback => callback("active"))),
    texts: () => [...captures.values()].filter(props => props.name === "Text" && props.accessibilityRole === "text"),
  };
}

test("mounted exact seven-day boundary changes without rerendering the parent", async t => {
  const h = harness(); t.after(h.unmount);
  const value = h.state.now - WEEK + 500;
  await h.render(React.createElement(h.component, { value }));
  assert.equal(textOf(h.texts()[0].children), "Fri 1:30 AM");
  assert.equal(h.texts()[0].accessibilityLabel, "Friday, October 9, 2026 at 1:30 AM PDT");
  await h.advance(499);
  assert.equal(textOf(h.texts()[0].children), "Fri 1:30 AM");
  await h.advance(1);
  assert.equal(textOf(h.texts()[0].children), "Oct 9, 2026, 1:30 AM");
});

test("mounted timezone/locale refresh, midnight, foreground and timer cleanup", async t => {
  const h = harness({ now: "2026-01-01T08:05:00Z" }); t.after(h.unmount);
  const value = "2026-01-01T07:59:00Z";
  await h.render(React.createElement(React.Fragment, null,
    React.createElement(h.component, { value }), React.createElement(h.component, { value, scale: "caption" })));
  assert.equal(h.timers.size, 3, "one shared minute timer and one exact boundary timer per timestamp");
  assert.equal(h.activations.size, 1);
  assert.equal(textOf(h.texts()[0].children), "Wed 11:59 PM");
  assert.equal(h.texts()[0].accessibilityLabel, "Wednesday, December 31, 2025 at 11:59 PM PST");
  h.state.zone = "Asia/Tokyo";
  await h.advance(60000);
  assert.equal(textOf(h.texts()[0].children), "Thu 4:59 PM");
  assert.match(h.texts()[0].accessibilityLabel, /January 1, 2026/);
  h.state.zone = "Europe/Berlin"; h.state.locale = "de-DE";
  await h.active();
  assert.equal(textOf(h.texts()[0].children), "Do., 08:59");
  assert.match(h.texts()[0].accessibilityLabel, /Donnerstag, 1. Januar 2026 um 08:59 MEZ/);
  await h.unmount();
  assert.equal(h.timers.size, 0); assert.equal(h.activations.size, 0);
});

test("mounted DST transitions use elapsed age and viewer-local wall clock", async t => {
  const h = harness({ now: "2026-03-15T06:59:59.999Z", zone: "America/New_York" }); t.after(h.unmount);
  await h.render(React.createElement(h.component, { value: "2026-03-08T07:00:00Z" }));
  assert.equal(textOf(h.texts()[0].children), "Sun 3:00 AM");
  await h.advance(1);
  assert.equal(textOf(h.texts()[0].children), "Mar 8, 2026, 3:00 AM");
  h.state.now = Date.parse("2026-11-01T08:00:00Z");
  await h.render(React.createElement(React.Fragment, null,
    React.createElement(h.component, { value: "2026-11-01T05:30:00Z" }),
    React.createElement(h.component, { value: "2026-11-01T06:30:00Z" })));
  assert.deepEqual(h.texts().map(p => p.accessibilityLabel), [
    "Sunday, November 1, 2026 at 1:30 AM EDT", "Sunday, November 1, 2026 at 1:30 AM EST",
  ]);
});

test("mounted foreground catches a suspended week boundary and midnight keeps the message weekday", async t => {
  const h = harness({ now: "2026-10-16T06:59:59.999Z" }); t.after(h.unmount);
  await h.render(React.createElement(h.component, { value: "2026-10-16T06:59:00Z" }));
  assert.equal(textOf(h.texts()[0].children), "Thu 11:59 PM");
  await h.advance(1);
  assert.equal(textOf(h.texts()[0].children), "Thu 11:59 PM", "midnight must not relabel the message as Friday");
  // A suspended native app does not run its timers. The first foreground event
  // must catch up immediately, before waiting for the minute interval.
  h.state.now += WEEK;
  await h.active();
  assert.equal(textOf(h.texts()[0].children), "Oct 15, 2026, 11:59 PM");
});

test("mounted invalid, missing and future values do not invent recent activity", async t => {
  const h = harness(); t.after(h.unmount);
  for (const value of [undefined, null, "", "  ", "bad-date", NaN, Infinity, new Date(NaN), "2026-02-30T12:00:00Z"]) {
    await h.render(React.createElement(h.component, { value }));
    assert.equal(textOf(h.texts()[0].children), "Time unavailable");
    assert.equal(h.texts()[0].accessibilityLabel, "Time unavailable");
  }
  await h.render(React.createElement(h.component, { value: h.state.now + 1000 }));
  assert.equal(textOf(h.texts()[0].children), "Oct 16, 2026, 1:30 AM");
  await h.advance(1000);
  assert.equal(textOf(h.texts()[0].children), "Fri 1:30 AM");
  await h.render(React.createElement(h.component, { value: "2024-02-29T12:00:00+05:30" }));
  assert.equal(textOf(h.texts()[0].children), "Feb 28, 2024, 10:30 PM");
});

for (const [file, count] of sources) {
  test(`actual timestamp renderer wiring: ${file}`, async t => {
    const h = harness(); t.after(h.unmount);
    const source = ast(file);
    const renderers = nodes(source, n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(source) === "ConversationTimestamp");
    assert.equal(renderers.length, count, "every audited production timestamp site must execute");
    for (const node of renderers) {
      // Execute the exact JSX expression taken from the production screen, not a copied adapter.
      const render = h.evaluate(`export function render(fixture) { const { item, message, event, comment, msg, notification } = fixture; return (${node.getText(source)}); }`, {
        ConversationTimestamp: h.component, conversationCreatedAt: h.formatter.conversationCreatedAt, styles: {},
      }).exports.render;
      for (const raw of ["2026-10-16T07:59:00Z", "2025-12-31T12:00:00Z", null, "bad-date"]) {
        const row = { createdAt: "2026-10-16T08:30:00Z", updatedAt: "2026-10-16T08:30:00Z", lastMessageAt: "2026-10-16T08:30:00Z", ts: h.state.now,
          displayCreatedAt: raw, displayLastActivityAt: raw, isMe: true };
        const fixture = { item: { ...row, notification: row }, message: row, event: row, comment: row, msg: row, notification: row };
        await h.render(render(fixture));
        const expected = raw === null || raw === "bad-date" ? "Time unavailable"
          : raw.startsWith("2025") ? "Dec 31, 2025, 4:00 AM" : "Fri 12:59 AM";
        assert.equal(textOf(h.texts()[0].children), expected, `${file}: real raw display value, never the synthetic now field`);
        if (raw?.startsWith("2026")) assert.equal(h.texts()[0].accessibilityLabel, "Friday, October 16, 2026 at 12:59 AM PDT");
      }
    }
  });
}

test("actual bell row composes full accessible date and retains action metadata", async t => {
  const h = harness(); t.after(h.unmount);
  const renderer = h.evaluate(`${declaration("components/notifications/notification-bell-button.tsx", "renderRow")}\nexports.render = renderRow;`, {
    ...h.native, ConversationTimestamp: h.component, ...h.formatter,
    busyId: null, styles: {}, resolveNotificationPath: () => "/chat/thread", openNotification: noop, dismiss: noop, MaterialIcons: () => null,
  }).exports.render;
  function ActualRow() { h.clock.useConversationClock(); return renderer({ id: "row", notificationType: "chat_message", title: "Message", body: "Body",
    createdAt: "2026-10-16T07:59:00Z", target: {}, actionLabel: "Open", isRead: false }); }
  await h.render(React.createElement(ActualRow));
  const open = () => [...h.captures.values()].find(p => p.accessibilityLabel?.startsWith("Open notification:"));
  assert.equal(open().accessibilityLabel, "Open notification: Message. Friday, October 16, 2026 at 12:59 AM PDT");
  assert.ok([...h.captures.values()].some(p => textOf(p.children).includes("Unread · Open")));
  h.state.zone = "Asia/Tokyo"; await h.advance(60000);
  assert.equal(open().accessibilityLabel, "Open notification: Message. Friday, October 16, 2026 at 4:59 PM GMT+9");
});

test("production parsers carry raw provenance into actual comment/message/call renderers", async t => {
  const h = harness();
  t.after(h.unmount);
  const normalize = value => String(value ?? "").trim();
  const cases = [
    ["_lib/chat.ts", "parseChatMessage", { id: "m", thread_id: "t", sender_user_id: "u", body: "hello" }, undefined, "app/chat/[threadId].tsx", 0],
    ["_lib/chillyChatCalls.ts", "parseEvent", { id: "e", thread_id: "t", actor_user_id: "u" }, undefined, "app/chat/[threadId].tsx", 1],
    ["_lib/creatorVideoComments.ts", "parseCreatorVideoComment", { id: "c", user_id: "u" }, new Map(), "app/player/[id].tsx", 0],
    ["_lib/profilePosts.ts", "parseProfilePostComment", { id: "c", user_id: "u" }, new Map(), "app/profile/[userId].tsx", 0],
  ];
  for (const [file, name, row, authors, screen, index] of cases) {
    const parser = h.evaluate(`${declaration(file, name)}\nexports.parse = ${name};`, {
      toText: normalize, normalizeText: normalize, normalizeModerationStatus: () => "clean", normalizeCallType: () => "voice", normalizeEventType: () => "ended",
    }).exports.parse;
    const source = ast(screen);
    const node = nodes(source, n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(source) === "ConversationTimestamp")[index];
    const render = h.evaluate(`export function render(message) { const comment = message, event = message; return (${node.getText(source)}); }`, {
      ConversationTimestamp: h.component, conversationCreatedAt: h.formatter.conversationCreatedAt, styles: {},
    }).exports.render;
    for (const value of [null, undefined, "", "2025-12-31T12:00:00Z", "2026-10-16T07:59:00Z", "2026-02-30T12:00:00Z"]) {
      const result = parser({ ...row, created_at: value }, authors);
      assert.equal(result.displayCreatedAt, value || null, `${file} raw provenance`);
      assert.equal(result.createdAt, value || new Date(h.state.now).toISOString(), `${file} legacy sort field unchanged`);
      await h.render(render(result));
      assert.equal(textOf(h.texts()[0].children), value?.startsWith("2025") ? "Dec 31, 2025, 4:00 AM" : value?.startsWith("2026-10") ? "Fri 12:59 AM" : "Time unavailable");
    }
  }
});

test("required product job selects and executes this mounted suite", () => {
  const plan = computeValidationPlan([...sources.map(([file]) => file), "tests/conversation-timestamps-mounted.test.mjs"]);
  assert.equal(plan.categories.product, true);
  assert.match(read(".github/workflows/required-validation.yml"), /node --test --test-concurrency=1 tests\/\*\.test\.mjs/);
});

test("whole notification tray executes service-to-row mapping and refreshes accessible dates", async t => {
  const h = harness(); t.after(h.unmount);
  const normalize = value => String(value ?? "").trim();
  const parse = h.evaluate(`${declaration("_lib/notifications.ts", "normalizeIsoTimestamp")}\n${declaration("_lib/notifications.ts", "parseNotificationRow")}\nexports.parse = parseNotificationRow;`, {
    normalizeText: normalize, normalizeNotificationCategory: normalize,
    normalizeProductNotificationCopy: normalize, normalizeNotificationTarget: () => ({ supported: true }),
    classifyNotificationAction: () => ({ actionLabel: "Open", actionStatus: "pending" }),
  }).exports.parse;
  let rows = [];
  const owner = { userId: "u" };
  const session = { user: { id: "u" }, authority: owner, authorityStatus: "active" };
  const Bell = h.load("components/notifications/notification-bell-button.tsx", {
    "@expo/vector-icons/MaterialIcons": () => null,
    "expo-router": { router: { push: noop }, useFocusEffect: callback => React.useEffect(callback, [callback]) },
    "../../_lib/session": { useSession: () => session },
    "../../_lib/notificationActivity": { getNotificationActivityOwnerKey: () => "owner", getCurrentNotificationActivityOwnerKey: () => "owner",
      subscribeToNotificationActivity: () => noop, invalidateNotificationActivity: noop },
    "../ui/chillywood-visual-system": { CHILLYWOOD_VISUAL: {}, ChillywoodPrimaryActionFill: () => null },
    "../../_lib/notifications": { readNotificationSummary: async () => ({ unreadCount: rows.length, categories: [] }),
      readNotificationListPage: async () => ({ status: "resolved", items: rows, nextCursor: null }),
      readImportantNotificationList: async () => [], resolveNotificationPath: () => "/chat/t", dismissNotification: noop, markNotificationRead: noop },
  }).NotificationBellButton;
  const rawValues = ["2026-10-16T07:59:00Z", "2025-12-31T12:00:00Z", null, "2026-02-30T12:00:00Z"];
  rows = rawValues.map((created_at, i) => parse({ id: String(i), user_id: "u", title: `Notice ${i}`, created_at }));
  await h.render(React.createElement(Bell, { surface: "timestamp" }));
  const button = [...h.captures.values()].find(p => p.testID === "timestamp-notification-bell");
  assert.ok(button);
  await h.act(button.onPress);
  assert.deepEqual(h.texts().map(p => textOf(p.children)), ["Time unavailable", "Fri 12:59 AM", "Time unavailable", "Dec 31, 2025, 4:00 AM"], "legacy createdAt order is unchanged, even when its synthetic fallback is not displayed");
  assert.ok([...h.captures.values()].some(p => p.accessibilityLabel === "Open notification: Notice 0. Friday, October 16, 2026 at 12:59 AM PDT"));
  h.state.zone = "Asia/Tokyo"; await h.active();
  assert.equal(textOf(h.texts()[1].children), "Fri 4:59 PM");
  assert.ok([...h.captures.values()].some(p => p.accessibilityLabel === "Open notification: Notice 0. Friday, October 16, 2026 at 4:59 PM GMT+9"));
});

test("whole profile activity card preserves notification action and native styles", async t => {
  const h = harness(); t.after(h.unmount);
  const Card = h.load("components/ProfileSocialFeedCard.tsx", {
    "@expo/vector-icons/MaterialIcons": () => null,
    "../_lib/discoveryFeed": {}, "./creator-media/creator-video-card": {}, "./social/linked-text": {},
    "./social/social-attachment-card": {}, "./ui/ProfileMediaImage": {},
  }).ProfileSocialFeedCard;
  const item = { type: "backed_activity_item", notification: { title: "Message", body: "Body", target: { supported: true },
    createdAt: "2026-10-16T08:30:00Z", displayCreatedAt: "2025-12-31T12:00:00Z" } };
  let opened;
  await h.render(React.createElement(Card, { item, onOpenNotification: value => { opened = value; } }));
  assert.equal(textOf(h.texts()[0].children), "Dec 31, 2025, 4:00 AM");
  assert.ok(h.texts()[0].style.color, "uses the production native metadata style");
  const button = [...h.captures.values()].find(p => p.name === "TouchableOpacity");
  await h.act(button.onPress); assert.equal(opened, item);
});

test("whole inbox loads threads, preserves row order/navigation and updates timestamps", async t => {
  const h = harness(); t.after(h.unmount);
  const rows = ["2025-12-31T12:00:00Z", "2026-10-16T07:59:00Z", null].map((raw, i) => ({
    threadId: `t${i}`, lastMessageAt: "2026-10-16T08:30:00Z", displayLastActivityAt: raw,
    otherMember: { userId: `other${i}`, displayName: `Person ${i}` }, currentMember: { unreadCount: 0 },
  }));
  const routes = [];
  h.native.FlatList = ({ data, renderItem, ListHeaderComponent }) => React.createElement(React.Fragment, null,
    ListHeaderComponent, ...data.map(item => React.createElement(React.Fragment, { key: item.threadId }, renderItem({ item }))));
  h.native.Alert = { alert: noop };
  h.native.StyleSheet.flatten = value => value;
  // Mount the real shared Back control; only its native icon is a host stub.
  h.load("components/navigation/app-back-button.tsx", { "@expo/vector-icons": { Ionicons: () => null } });
  const inboxAuthority = { userId: "u", accountId: "u", sessionGeneration: "inbox-one", state: "ACTIVE", restoreOnly: false };
  const inboxOwnerKey = a => a ? JSON.stringify([a.userId, a.accountId, a.sessionGeneration]) : "";
  const Screen = h.load("app/chat/index.tsx", {
    "expo-router": { useRouter: () => ({ push: value => routes.push(value) }), useFocusEffect: callback => React.useEffect(callback, [callback]) },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    "../../components/ui/ProfileMediaImage": { ProfileMediaImage: () => null },
    "../../components/ui/chillywood-branded-surface": { ChillywoodBrandedSurface: h.native.View },
    "../../_lib/session": { useSession: () => ({ isLoading: false, isSignedIn: true, user: { id: "u" }, authority: inboxAuthority }) },
    "../../_lib/accountSessionAuthority": { getCurrentAccountSessionAuthoritySnapshot: () => inboxAuthority },
    "../../_lib/notificationActivity": { getNotificationActivityOwnerKey: inboxOwnerKey },
    "../../_lib/accountAccess": { readAccountAccessStatus: async () => ({ restricted: false }) },
    "../../_lib/analytics": { trackEvent: noop }, "../../_lib/displayText": { decodeVisiblePercentEscapes: value => value },
    "../../_lib/chat": { listChatThreads: async () => rows, subscribeToInbox: () => noop },
    "../../_lib/publicPeopleSearch": {}, "../../_lib/friendGraph": { readActiveFriendUserIds: async () => [] },
    "../../_lib/officialAccounts": { getOfficialPlatformAccount: () => null },
    "../../_lib/nativeCallTransitionProvenance.mjs": {}, "../../_lib/userFacingErrors": { getUserFacingErrorMessage: (_, fallback) => fallback },
    "../../_lib/usernameHandles": { formatUsernameHandle: () => "" },
  }).default;
  await h.render(React.createElement(Screen));
  assert.deepEqual(h.texts().map(p => textOf(p.children)), ["Dec 31, 2025, 4:00 AM", "Fri 12:59 AM", "Time unavailable"]);
  const rowButtons = [...h.captures.values()].filter(p => p.testID?.startsWith("chat-thread-row-"));
  assert.deepEqual(rowButtons.map(p => p.testID), ["chat-thread-row-t0", "chat-thread-row-t1", "chat-thread-row-t2"]);
  await h.act(rowButtons[1].onPress);
  assert.ok(JSON.stringify(routes).includes("t1"));
  h.state.zone = "Asia/Tokyo"; await h.advance(60000);
  assert.equal(textOf(h.texts()[1].children), "Fri 4:59 PM");
});

test("actual thread summary parser carries raw activity through the rendered inbox expression", async t => {
  const h = harness(); t.after(h.unmount);
  const parse = h.evaluate(`${declaration("_lib/chat.ts", "parseChatThreadMember")}\n${declaration("_lib/chat.ts", "parseChatThread")}\nexports.parse = parseChatThread;`, {
    toText: value => String(value ?? "").trim(), isDefined: value => value !== null, normalizeCallType: () => undefined,
  }).exports.parse;
  const source = ast("app/chat/index.tsx");
  const node = nodes(source, n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(source) === "ConversationTimestamp")[0];
  const render = h.evaluate(`export function render(item) { return (${node.getText(source)}); }`, { ConversationTimestamp: h.component, styles: {} }).exports.render;
  for (const [activity, expected] of [
    [{}, "Time unavailable"],
    [{ updated_at: "2026-10-16T08:30:00Z" }, "Time unavailable"],
    [{ created_at: "2025-12-31T12:00:00Z", updated_at: "2026-10-16T08:30:00Z" }, "Dec 31, 2025, 4:00 AM"],
    [{ last_message_at: "2026-10-16T07:59:00Z", updated_at: "2025-12-31T12:00:00Z" }, "Fri 12:59 AM"],
    [{ last_activity_at: "2026-10-16T07:59:00Z", last_message_at: "2025-12-31T12:00:00Z" }, "Fri 12:59 AM"],
    [{ last_activity_at: null, last_message_at: "2026-10-16T07:59:00Z" }, "Time unavailable"],
  ]) {
    const row = parse({ id: "t", participant_pair_key: "u:v", created_by: "u", ...activity }, "u", { requireCurrentMember: false });
    assert.equal(row.updatedAt, activity.updated_at ?? "", "missing metadata cannot manufacture fresh activity");
    await h.render(render(row)); assert.equal(textOf(h.texts()[0].children), expected);
  }
});

test("actual Party history/realtime and Stage mappings reach their production renderers", async t => {
  const h = harness(); t.after(h.unmount);
  for (const file of ["app/watch-party/[partyId].tsx", "app/watch-party/live-stage/[partyId].tsx"]) {
    const source = ast(file);
    const renderer = nodes(source, n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(source) === "ConversationTimestamp")[0];
    const render = h.evaluate(`export function render(message) { const comment = message; return (${renderer.getText(source)}); }`, {
      ConversationTimestamp: h.component, conversationCreatedAt: h.formatter.conversationCreatedAt, styles: {},
    }).exports.render;
    // Execute every actual persisted-row object, including the separate Party
    // history and realtime adapters, rather than constructing display fixtures.
    const mappings = nodes(source, n => ts.isObjectLiteralExpression(n) && n.properties.some(p => p.name?.getText(source) === "displayCreatedAt" && p.initializer?.getText(source) === "row.created_at ?? null")
      && n.properties.some(p => p.name?.getText(source) === (file.includes("live-stage") ? "createdAt" : "ts")));
    assert.equal(mappings.length, file.includes("live-stage") ? 1 : 2);
    for (const mapping of mappings) {
      const map = h.evaluate(`export function map(row) { const rowId = row.id, rowUserId = row.user_id, rowUsername = "Guest", rowText = row.text, id = row.id, userId = row.user_id, body = row.text, authorLabel = "Guest"; return (${mapping.getText(source)}); }`, {
        trackedUserId: "u", myUserIdRef: { current: "u" }, resolveIdentityName: value => value || "Guest", attachmentsByMessageId: new Map(),
      }).exports.map;
      for (const raw of [null, "bad-date", "2026-02-30T12:00:00Z", "2025-12-31T12:00:00Z", "2026-10-16T07:59:00Z"]) {
        const mapped = map({ id: "m", user_id: "u", text: "Body", created_at: raw });
        assert.equal(mapped.displayCreatedAt, raw);
        await h.render(render(mapped));
        assert.equal(textOf(h.texts()[0].children), raw?.startsWith("2025") ? "Dec 31, 2025, 4:00 AM" : raw?.startsWith("2026-10") ? "Fri 12:59 AM" : "Time unavailable");
      }
    }
  }
});

test("actual Party insert receipt preserves raw time through Stage and Player saved comments", async t => {
  const h = harness(); t.after(h.unmount);
  let createdAt;
  const service = h.evaluate(`${declaration("_lib/watchParty.ts", "sendPartyMessageRecord")}\nexports.send = sendPartyMessageRecord;`, {
    resolveWritableUserId: async () => "u", WATCH_PARTY_MESSAGES_TABLE: "watch_party_room_messages",
    supabase: { from(table) {
      assert.equal(table, "watch_party_room_messages");
      return { insert(payload) {
        assert.equal(payload.text, "Hello");
        return { select: () => ({ single: async () => ({ data: { id: "m", user_id: "u", text: "Hello", created_at: createdAt }, error: null }) }) };
      } };
    } },
  }).exports;
  for (const file of ["app/player/[id].tsx", "app/watch-party/live-stage/[partyId].tsx"]) {
    const source = ast(file);
    const savedMapping = file.includes("live-stage")
      ? nodes(source, n => ts.isVariableDeclaration(n) && n.name.getText(source) === "savedComment")[0].initializer
      : nodes(source, n => ts.isCallExpression(n) && n.expression.getText(source) === "pushPartyOverlayMessage" && n.arguments[0]?.getText(source).includes("saved.id"))[0].arguments[0];
    const map = h.evaluate(`export function map(saved) { const sent = saved, savedAttachments = []; return (${savedMapping.getText(source)}); }`).exports.map;
    const renderer = nodes(source, n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(source) === "ConversationTimestamp")[file.includes("live-stage") ? 0 : 1];
    const render = h.evaluate(`export function render(comment) { const msg = comment; return (${renderer.getText(source)}); }`, {
      ConversationTimestamp: h.component, conversationCreatedAt: h.formatter.conversationCreatedAt, styles: {},
    }).exports.render;
    for (createdAt of [null, "2026-02-30T12:00:00Z", "2026-10-16T07:59:00Z"]) {
      const receipt = await service.send("party", "u", "chat", "Hello");
      assert.equal(receipt.displayCreatedAt, createdAt);
      const mapped = map(receipt);
      await h.render(render(mapped));
      assert.equal(textOf(h.texts()[0].children), createdAt?.startsWith("2026-10") ? "Fri 12:59 AM" : "Time unavailable");
    }
  }
});

test("audited surfaces retain exact original StyleSheet colors, backgrounds and layout", () => {
  for (const [file] of sources) {
    let original = execFileSync("git", ["show", `934db4003e604e9ac42aa6feb9d4511e1c80a97b:${file}`], { cwd: rootPath, encoding: "utf8" });
    if (file === "app/player/[id].tsx") {
      // Reviewed shared arrow Back conversion: 44px target replaces the old
      // 112px text button. Project only these two exact historical fragments.
      for (const [previous, replacement] of [
        ['standaloneBelowBackButton: {\n    minHeight: 44,\n    minWidth: 112,', 'standaloneBelowBackButton: {\n    minHeight: 44,\n    minWidth: 44,'],
        ['  standaloneBelowBackText: {\n    color: "#EEF1F7",\n    fontSize: 12.5,\n    fontWeight: "800",\n  },\n', ''],
      ]) {
        assert.equal(original.split(previous).length, 2, 'exact historical Back witness');
        original = original.replace(previous, replacement);
      }
    }
    const before = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const after = ast(file);
    const additions = file === "app/profile/[userId].tsx" ? [
      'virtualizedFeedItem: { width: "100%" }',
      'profileListHeader: { gap: 16 }',
      'feedFreshnessOverlay: { position: "absolute", top: 8, left: 0, right: 0, zIndex: 20, alignItems: "center" }',
      'feedFreshnessButton: { backgroundColor: "#29131D", borderColor: "#DC143C", borderWidth: 1, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 12 }',
    ] : file === "app/chat/index.tsx" ? [
      'backNavigation: { position: "absolute", zIndex: 1, alignItems: "flex-start" }',
    ] : file === "app/chat/[threadId].tsx" ? [
      'stateBackNavigation: { position: "absolute", zIndex: 1, alignItems: "flex-start" }',
      'callEventCardUnread: {\n    borderColor: "#C5A8FF",\n    backgroundColor: "rgba(138,73,255,0.18)",\n  }',
      'callEventUnreadLabel: {\n    color: "#E2D3FF",\n    fontSize: 10,\n    fontWeight: "800",\n  }',
    ] : [];
    const styles = source => nodes(source, n => ts.isCallExpression(n) && n.expression.getText(source) === "StyleSheet.create").map(n => {
      if (!additions.length) return n.getText(source);
      assert.ok(ts.isObjectLiteralExpression(n.arguments[0]), `${file}: literal style inventory`);
      return n.arguments[0].properties.map(property => property.getText(source));
    });
    // Permit only the exact reviewed wrappers, new-post overlay and unread-call styles. Every original
    // style property remains text-exact and ordered; unknown additions fail.
    if (additions.length) {
      const current = styles(after);
      assert.equal(current.length, 1, file);
      assert.deepEqual(current[0].filter(property => additions.includes(property)), additions, file);
      const removals = file === "app/chat/[threadId].tsx" ? [
        'backText: {\n    color: "#E2E9F7",\n    fontSize: 14,\n    fontWeight: "800",\n  }',
      ] : [];
      const original = styles(before)[0];
      assert.deepEqual(original.filter(property => removals.includes(property)), removals, file);
      assert.deepEqual(current[0].filter(property => !additions.includes(property)), original.filter(property => !removals.includes(property)), file);
      continue;
    }
    assert.deepEqual(styles(after), styles(before), file);
  }
});

test("old source and deliberately broken timestamp controls fail the real renderer suite", { skip: !!process.env.TIMESTAMP_CONTROL }, () => {
  for (const mutation of ["old-renderers", "inclusive-week", "utc", "missing-now", "frozen", "short-accessibility", "invented-provenance", "metadata-activity", "normalized-invalid-date"]) {
    // Node marks test workers in the environment. Inheriting that marker makes
    // the child emit an IPC protocol instead of running an independent suite.
    const env = { ...process.env, TIMESTAMP_CONTROL: mutation };
    delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--test", "--test-name-pattern=^(mounted|actual|whole|production)", import.meta.filename], {
      cwd: rootPath, encoding: "utf8", env, timeout: 30000,
    });
    assert.equal(result.error, undefined, `${mutation}: suite must execute`);
    assert.notEqual(result.status, 0, `${mutation}: actual visible/accessibility/lifecycle assertion must catch regression`);
    assert.match(result.stdout, /ERR_ASSERTION/, `${mutation}: assertion failure rather than import/runtime failure`);
    assert.match(result.stdout, /tests [1-9]/, `${mutation}: nonempty suite executed`);
  }
});

test("reviewed visual additions cannot mask modified Back, unread or original styles", { skip: !!process.env.TIMESTAMP_CONTROL }, () => {
  for (const mutation of ["changed-back-wrapper", "changed-unread-color", "changed-original-style"]) {
    const env = { ...process.env, TIMESTAMP_CONTROL: mutation }; delete env.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, ["--test", "--test-name-pattern=^audited surfaces", import.meta.filename], {
      cwd: rootPath, encoding: "utf8", env, timeout: 30000,
    });
    assert.notEqual(result.status, 0, `${mutation} must fail the exact style witness`);
    assert.match(`${result.stdout}${result.stderr}`, /AssertionError/, mutation);
  }
});
