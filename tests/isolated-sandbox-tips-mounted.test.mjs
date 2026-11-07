import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const React = require("react"); const ts = require("typescript"); const { createRoot } = require("react-dom/client");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {}; const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: doc, parentNode: null, tagName: "DIV" });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const uuid = n => `c0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = { userId: uuid(1), accountId: uuid(1), sessionGeneration: uuid(2), state: "ACTIVE", restoreOnly: false };
const B = { ...A, userId: uuid(3), accountId: uuid(3), sessionGeneration: uuid(4) };
const id = kind => `scv1_${kind}_${uuid(10)}`;
const capability = { generationState: "active", canAuthor: true, creatorEligible: true, creatorReason: "eligible", canReadHistory: true, canRetireOwnOffers: true, checkoutConnected: false, declaration: null };
const createdAt = "2026-11-07T10:00:00Z";
const offer = { id: id("offer"), resourceId: id("resource"), creatorId: A.userId, kind: "creator_tip", title: "Support this creator", revision: 1, resourceRevision: 1, status: "published", amountMinor: 199, currency: "usd", createdAt, available: true, checkoutConnected: false };
const resource = { id: id("resource"), creatorId: A.userId, kind: "creator_tip", title: "A private draft", revision: 1, status: "draft", createdAt, offers: [], offersNextCursor: null, offersTruncated: false };
const receipt = { id: id("receipt"), intentId: id("intent"), status: "verified", receiptType: "provider_verified", purchasedAt: createdAt, amountMinor: 199, currency: "usd", grantsAccess: false, notPayable: true };
const entry = { id: id("intent"), offerId: id("offer"), resourceId: id("resource"), creatorId: A.userId, kind: "creator_tip", amountMinor: 199, currency: "usd", status: "verified", createdAt, expiresAt: "2026-11-07T10:05:00Z", originalSessionMatchesCurrent: false, dispatchState: "bound", receipt, abandonment: null, providerDispatchAllowed: false, noDispatchProven: false };
const clone = value => JSON.parse(JSON.stringify(value));
function load(path, bindings) {
  const context = { exports: {}, setTimeout, clearTimeout, require(name) { if (name.endsWith(".png")) return 1; assert.ok(name in bindings, `Unmodeled production dependency ${name}`); return bindings[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { fileName: path, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, context, { filename: path }); return context.exports;
}
function fixture(platform = "ios") {
  let nodes = []; let current = A; let params = {}; let serial = 100; let rejectStorage = false; let beforeStore = async () => {};
  const listeners = new Set(); const memory = new Map(); const calls = []; const navigations = [];
  const storage = { async getItem(key) { return memory.get(key) ?? null; }, async setItem(key, value) { if (rejectStorage) throw Error("disk unavailable"); await beforeStore(); memory.set(key, value); } };
  const commerce = load("../_lib/isolatedSandboxCommerce.ts", { "./accountBoundSupabaseMutation": {}, "./accountBoundSupabaseRpc.mjs": {}, "./supabase": {}, "react-native": { Platform: { OS: platform } }, "./accountSessionAuthority": {} });
  const journal = load("../_lib/isolatedSandboxTipAttempts.ts", { "@react-native-async-storage/async-storage": storage, "./isolatedSandboxCommerce": commerce });
  const primitive = name => props => { nodes.push({ name, props }); return ["Text", "TextInput", "ActivityIndicator"].includes(name) ? null : React.createElement(React.Fragment, null, props.children); };
  const native = { Platform: { OS: platform }, StyleSheet: { create: value => value, absoluteFillObject: {} }, AppState: { addEventListener: () => ({ remove: noop }) }, ...Object.fromEntries(["ActivityIndicator", "ImageBackground", "Pressable", "ScrollView", "Text", "TextInput", "View"].map(name => [name, primitive(name)])) };
  const authority = { sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration && a.restoreOnly === b.restoreOnly, getCurrentAccountSessionAuthoritySnapshot: () => current, subscribeToAccountSessionAuthority(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  let respond = async (command, payload) => {
    const data = { "capability.read": capability, "studio.read": { resources: [resource], nextCursor: null, catalog: [], catalogTruncated: false }, "offer.read": { offer }, "history.read": { role: payload.role, items: [entry], nextCursor: null }, "status.read": { entry }, "request.read": { resolution: "unknown", originalRequestId: payload.originalRequestId, recordedCommand: null, recordedSessionId: null, recordedPayload: null, resource: null, offer: null, entry: null, declaration: null, retryAllowed: false, noDispatchProven: false }, "resource.create": { resource: { id: resource.id, kind: "creator_tip", creatorId: A.userId, revision: 1, status: "draft" } }, "creator.declare": { eligible: payload.declared18Plus && payload.countryCode === "US" }, "offer.publish": { offer: { id: offer.id, resourceId: offer.resourceId, kind: offer.kind, revision: offer.revision, status: offer.status, amountMinor: offer.amountMinor, currency: offer.currency } }, "offer.retire": { offer: { ...offer, status: "retired", available: false } } }[command];
    if (!data) throw Error(`Unsupported simulated API ${command}`); return clone(data);
  };
  const api = { newTipRequestId: () => uuid(++serial), tipUuid: value => typeof value === "string" && /^[a-f0-9-]{36}$/u.test(value), tipId: (value, kind) => typeof value === "string" && value.startsWith(`scv1_${kind}_`), async captureIsolatedTipClient(expected) {
    let retired = false; const unsubscribe = authority.subscribeToAccountSessionAuthority(value => { if (!authority.sameAccountSessionAuthority(expected, value)) retired = true; });
    const request = async (command, requestId, payload) => {
      if (retired || !authority.sameAccountSessionAuthority(expected, current)) throw Error("retired"); calls.push({ command, requestId, payload, actor: expected });
      const data = await respond(command, payload, expected, requestId);
      if (retired || !authority.sameAccountSessionAuthority(expected, current)) throw Error("retired");
      return { protocol: "sandbox-commerce-v1", environment: "sandbox", command, requestId, actor: { userId: expected.userId, accountId: expected.accountId, sessionGeneration: expected.sessionGeneration }, status: "ok", data };
    };
    return { actor: expected, request, author: request, dispose() { retired = true; unsubscribe(); } };
  } };
  const receiptComponent = load("../components/monetization/isolated-tip-receipt.tsx", { react: React, "react-native": native });
  const ui = load("../components/monetization/isolated-tip-screens.tsx", {
    react: React, "react-native": native, "react-native-safe-area-context": { SafeAreaView: primitive("SafeAreaView") },
    "expo-router": { useRouter: () => ({ push: path => navigations.push(path), replace: path => navigations.push(path), canGoBack: () => false }), useLocalSearchParams: () => params },
    "../../_lib/session": { useSession: () => ({ user: current ? { id: current.userId } : null, authority: current, isLoading: false }) },
    "../../_lib/accountSessionAuthority": authority, "../../_lib/isolatedSandboxTips": api, "../../_lib/isolatedSandboxTipAttempts": journal, "../../_lib/isolatedSandboxCommerce": commerce,
    "../navigation/app-back-button": { AppBackButton: primitive("AppBackButton") }, "./isolated-tip-receipt": receiptComponent,
  });
  const root = createRoot(container());
  const visibleNodes = () => nodes.slice(Math.max(0, nodes.findLastIndex(node => node.name === "ImageBackground")));
  return { calls, memory, navigations, journal: userId => journal.createIsolatedSandboxAttemptJournal({ userId, storage }),
    async render(page, nextParams = params) { params = nextParams; nodes = []; await React.act(async () => { root.render(React.createElement(ui.IsolatedTipScreen, { page })); }); },
    async press(testID) { const target = visibleNodes().filter(node => node.props.testID === testID).at(-1); assert.ok(target, `Missing ${testID}`); assert.equal(target.props.disabled, false); nodes = []; await React.act(async () => target.props.onPress()); },
    async input(testID, value) { const target = visibleNodes().filter(node => node.props.testID === testID).at(-1); assert.ok(target, testID); nodes = []; await React.act(async () => target.props.onChangeText(value)); },
    node: testID => visibleNodes().filter(node => node.props.testID === testID).at(-1),
    text: () => visibleNodes().filter(node => node.name === "Text").flatMap(node => node.props.children).join("\n"),
    async change(next, page) { nodes = []; await React.act(async () => { current = next; for (const fn of listeners) fn(next); root.render(React.createElement(ui.IsolatedTipScreen, { page })); }); },
    respond(fn) { respond = fn; }, rejectStorage() { rejectStorage = true; }, changeDuringStorage(next) { beforeStore = async () => { beforeStore = async () => {}; current = next; for (const fn of listeners) fn(next); }; }, async dispose() { await React.act(async () => root.unmount()); },
  };
}

for (const platform of ["android", "ios"]) test(`mounted production ${platform} studio persists a draft action before transport and never exposes payment`, async t => {
  const f = fixture(platform); t.after(() => f.dispose()); await f.render("studio");
  assert.match(f.text(), /Creator authoring available/u); assert.match(f.text(), /No qualified test prices/u);
  assert.equal(f.node("isolated-tip-title").props.accessibilityLabel, "Tip offer title");
  assert.equal(f.node("isolated-tip-checkout").props.accessibilityState.disabled, true);
  await f.input("isolated-tip-title", "A new draft");
  f.respond(async (command, payload) => {
    if (command === "resource.create") { const saved = await f.journal(A.userId).list(); assert.equal(saved.at(-1).state, "prepared"); assert.equal(saved.at(-1).payload.title, payload.title); return { resource: { id: resource.id, kind: "creator_tip", creatorId: A.userId, revision: 1, status: "draft" } }; }
    if (command === "capability.read") return capability;
    if (command === "studio.read") return { resources: [resource], nextCursor: null, catalog: [], catalogTruncated: false };
    throw Error(command);
  });
  await f.press("isolated-tip-create"); assert.match(f.text(), /Draft saved/u);
  assert.equal((await f.journal(A.userId).list())[0].state, "completed");
  assert.ok(f.calls.every(call => !/checkout|restore|dispatch/u.test(call.command)));
});
test("mounted storage failure prevents mutation and reports an unsent action", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render("studio"); await f.input("isolated-tip-title", "Do not send"); f.rejectStorage(); await f.press("isolated-tip-create");
  assert.equal(f.calls.filter(call => call.command === "resource.create").length, 0); assert.match(f.text(), /new action was not sent/u); assert.doesNotMatch(f.text(), /Draft saved/u);
});
test("mounted authority loss during journal persistence closes only the never-sent action", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render("studio"); await f.input("isolated-tip-title", "Must not cross accounts"); f.changeDuringStorage(B); await f.press("isolated-tip-create");
  assert.equal(f.calls.filter(call => call.command === "resource.create").length, 0);
  assert.equal((await f.journal(A.userId).list())[0].state, "not_applied"); assert.equal((await f.journal(B.userId).list()).length, 0);
});
test("mounted Free buyer reads retained receipt without creator eligibility or Premium purchase", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render("history");
  assert.match(f.text(), /Test support received/u); assert.match(f.text(), /not payable/u); assert.match(f.text(), /another session/u);
  assert.deepEqual(f.calls.map(call => call.command), ["history.read"]); assert.equal(f.node("isolated-tip-checkout").props.disabled, true);
  assert.doesNotMatch(f.text(), /Upgrade|Restore store purchases/u);
});
test("mounted backend rejection is unavailable, never an empty or verified history", async t => {
  const f = fixture(); t.after(() => f.dispose()); f.respond(async () => { throw Error("RPC absent"); }); await f.render("history");
  assert.match(f.text(), /backend could not verify/u); assert.doesNotMatch(f.text(), /No test attempts|Test support received/u); assert.equal(f.node("isolated-tip-empty"), undefined);
});
test("mounted late A result cannot display under B or revive after A to B to A", async t => {
  const f = fixture(); t.after(() => f.dispose()); let resolve; const pending = new Promise(done => { resolve = done; });
  f.respond(async (command, payload, account) => { if (account.userId === A.userId) return pending; return { role: payload.role, items: [], nextCursor: null }; });
  await f.render("history"); await f.change(B, "history");
  await React.act(async () => resolve({ role: "buyer", items: [entry], nextCursor: null }));
  assert.doesNotMatch(f.text(), /Test support received|A private draft/u); assert.match(f.text(), /No test attempts/u);
  f.respond(async (_command, payload) => ({ role: payload.role, items: [], nextCursor: null })); await f.change(A, "history");
  assert.doesNotMatch(f.text(), /Test support received/u); assert.equal(f.calls.filter(call => call.command === "history.read").length, 3);
});
test("mounted restart recovery only reads original request; missing row remains unknown", async t => {
  const f = fixture(); t.after(() => f.dispose()); const original = uuid(80);
  await f.journal(A.userId).prepare({ requestId: original, sessionGeneration: A.sessionGeneration, command: "resource.create", payload: { kind: "creator_tip", title: "Uncertain draft" } }); await f.journal(A.userId).markUnknown(original);
  await f.render("status", { requestId: original });
  assert.match(f.text(), /Action outcome unknown/u); assert.match(f.text(), /Do not repeat/u);
  assert.deepEqual(f.calls.map(call => call.command), ["request.read"]); assert.equal((await f.journal(A.userId).list())[0].state, "unknown");
  await f.render("studio", {}); assert.equal(f.node("isolated-tip-create").props.disabled, true);
});
test("mounted negative declaration persists explicit false without legal consent", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render("home"); await f.press("isolated-tip-adult-no"); await f.input("isolated-tip-country", "US"); await f.input("isolated-tip-region", "CA"); await f.press("isolated-tip-declare");
  const request = f.calls.find(call => call.command === "creator.declare"); assert.equal(request.payload.declared18Plus, false); assert.equal("acceptedCreatorTerms" in request.payload, false); assert.match(f.text(), /Declaration saved/u);
});
test("mounted refunded and quarantined receipts do not show confirmed support", async t => {
  for (const status of ["refunded", "quarantined", "revoked"]) {
    const f = fixture(); t.after(() => f.dispose()); f.respond(async () => ({ entry: { ...entry, receipt: { ...receipt, status } } })); await f.render("status", { intentId: entry.id });
    assert.doesNotMatch(f.text(), /Test support received/u); assert.match(f.text(), /not payable/u); assert.equal(f.node("isolated-tip-checkout").props.disabled, true);
  }
});
test("mounted non-tip record is not presented as a tip or denied its separate content rights", async t => {
  const f = fixture(); t.after(() => f.dispose()); f.respond(async () => ({ entry: { ...entry, kind: "paid_content" } })); await f.render("status", { intentId: entry.id });
  assert.match(f.text(), /different product type/u); assert.doesNotMatch(f.text(), /This tip grants no content access|Test support received/u);
});
const preview = () => ({ ...clone(resource), status: "published", offers: Array.from({ length: 10 }, (_, n) => ({ ...clone(offer), id: `scv1_offer_${uuid(30 - n)}` })), offersNextCursor: { asOf: "2026-11-07T11:00:00Z", createdAt, id: uuid(21) }, offersTruncated: true });
test("mounted nested offer continuation is explicit, exact-resource and single-flight", async t => {
  const f = fixture(); t.after(() => f.dispose()); const initial = preview(); let resolve; const pending = new Promise(done => { resolve = done; });
  f.respond(async (command, payload) => {
    if (command === "capability.read") return capability;
    if (command === "studio.read") return { resources: [initial], nextCursor: null, catalog: [], catalogTruncated: false };
    assert.equal(command, "offers.read"); assert.deepEqual(clone(payload), { resourceId: resource.id, cursor: initial.offersNextCursor, limit: 50 }); return pending;
  });
  await f.render("studio"); assert.match(f.text(), /partial offer list/u);
  const action = f.node(`isolated-tip-more-offers-${resource.id}`).props.onPress;
  await React.act(async () => { action(); action(); });
  assert.equal(f.calls.filter(call => call.command === "offers.read").length, 1);
  const older = { ...clone(offer), id: `scv1_offer_${uuid(20)}` };
  await React.act(async () => resolve({ resourceId: resource.id, offers: [older], nextCursor: null }));
  assert.ok(f.node(`isolated-tip-offer-${older.id}`)); assert.ok(f.node(`isolated-tip-offer-${initial.offers[0].id}`));
  assert.equal(f.node(`isolated-tip-more-offers-${resource.id}`), undefined); assert.doesNotMatch(f.text(), /partial offer list/u);
  assert.ok(f.calls.every(call => !/checkout|dispatch|restore/u.test(call.command)));
});
test("mounted failed nested page keeps preview and truthfully retains continuation", async t => {
  const f = fixture(); t.after(() => f.dispose()); const initial = preview();
  f.respond(async command => {
    if (command === "capability.read") return capability;
    if (command === "studio.read") return { resources: [initial], nextCursor: null, catalog: [], catalogTruncated: false };
    throw Error("page unavailable");
  });
  await f.render("studio"); await f.press(`isolated-tip-more-offers-${resource.id}`);
  assert.match(f.text(), /Older offers could not be verified/u); assert.match(f.text(), /partial offer list/u);
  assert.ok(f.node(`isolated-tip-offer-${initial.offers[0].id}`)); assert.ok(f.node(`isolated-tip-more-offers-${resource.id}`));
});
test("mounted late nested offer page cannot cross an account change", async t => {
  const f = fixture(); t.after(() => f.dispose()); const initial = preview(); let resolve; const pending = new Promise(done => { resolve = done; });
  f.respond(async (command, _payload, account) => {
    if (command === "capability.read") return capability;
    if (command === "studio.read") return { resources: account.userId === A.userId ? [initial] : [], nextCursor: null, catalog: [], catalogTruncated: false };
    return pending;
  });
  await f.render("studio"); await f.press(`isolated-tip-more-offers-${resource.id}`); await f.change(B, "studio");
  await React.act(async () => resolve({ resourceId: resource.id, offers: [{ ...clone(offer), id: `scv1_offer_${uuid(20)}`, title: "A late private offer" }], nextCursor: null }));
  assert.doesNotMatch(f.text(), /A late private offer|A private draft/u); assert.match(f.text(), /No drafts or offers/u);
});
const nativeFixturePath = process.env.ISOLATED_TIPS_NATIVE_FIXTURES ?? process.env.ISOLATED_SANDBOX_TIPS_FIXTURE;
if (nativeFixturePath) test("mounted production history presents actual local PostgreSQL receipt captures without dispatch", async t => {
  const raw = JSON.parse(fs.readFileSync(nativeFixturePath, "utf8"));
  const cases = (Array.isArray(raw) ? raw : raw.cases).filter(item => item.command === "history.read" && item.response.data.role === "buyer" && item.response.data.items.some(entry => entry.receipt));
  assert.ok(cases.length > 0, "Need real local PostgreSQL retained receipt history captures");
  for (const item of cases) {
    const f = fixture(); t.after(() => f.dispose()); f.respond(async command => { assert.equal(command, "history.read"); return clone(item.response.data); });
    await f.change({ ...item.response.actor, state: "ACTIVE", restoreOnly: false }, "history");
    assert.match(f.text(), /not payable/u); assert.equal(f.node("isolated-tip-checkout").props.disabled, true);
    assert.deepEqual(f.calls.map(call => call.command), ["history.read"]);
    for (const entry of item.response.data.items.filter(entry => entry.receipt)) assert.ok(f.node(`isolated-tip-receipt-${entry.receipt.id}`));
  }
});
