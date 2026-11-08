import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url); const React = require("react"); const ts = require("typescript"); const { createRoot } = require("react-dom/client");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {}; const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: doc, parentNode: null, tagName: "DIV" });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const uuid = n => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = { userId: uuid(1), accountId: uuid(1), sessionGeneration: uuid(2), state: "ACTIVE", restoreOnly: false };
const B = { ...A, userId: uuid(3), accountId: uuid(3), sessionGeneration: uuid(4) };
const digest = "a".repeat(64); const intentId = `scv1_intent_${uuid(5)}`;
const quote = { offerId: `scv1_offer_${uuid(6)}`, offerRevision: 1, resourceId: `scv1_resource_${uuid(7)}`, resourceRevision: 1, creatorId: uuid(8), kind: "creator_tip", amountMinor: 199, currency: "usd" };
const preparation = { requestId: uuid(9), userId: A.userId, sessionGeneration: A.sessionGeneration, command: "checkout.prepare", prepareRequestId: uuid(9), payload: { offerId: quote.offerId, expectedRevision: 1 }, quote, intentId, state: "intent_prepared", result: null };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function load(path, bindings, globals = {}) {
  const scope = { exports: {}, setTimeout, clearTimeout, ...globals, require(name) { assert.ok(name in bindings, `unmodeled dependency ${name}`); return bindings[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(path, import.meta.url), "utf8"), { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, scope); return scope.exports;
}
function fixture({ initial = A, memory = new Map(), configured = true, platform = "ios", strict = false } = {}) {
  let current = initial; let nodes = []; let serial = 100; let verified = false; let reviewHold = false; let backendUnavailable = false; let rejectClaim = false; let sdkPrice = 1.99; let readWait = null; let serverWait = null; let localWait = null;
  const purchasedAt = new Date().toISOString();
  let purchase = async () => ({ productIdentifier: "tip-199", transaction: { productIdentifier: "tip-199", transactionIdentifier: "sdk-hint-only" } });
  const listeners = new Set(); const calls = []; const nativeCalls = []; let sdkUser = null;
  const allocation = { intentId, dispatchId: uuid(10), providerAppUserId: `scv1_teststore_${uuid(11)}`, configurationDigest: digest, projectId: "test-project", appId: "test-app", productId: "tip-199", provider: "revenuecat", store: "TEST_STORE", sourceEnvironment: "SANDBOX", providerScopeKey: "test-only", economicApplicationId: "isolated-test-app", quote, acceptPurchaseUntil: new Date(Date.now() + 60_000).toISOString() };
  const storage = { async getItem(key) { return memory.get(key) ?? null; }, async setItem(key, value) { memory.set(key, value); } };
  const authority = { getCurrentAccountSessionAuthoritySnapshot: () => current, sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration && a.restoreOnly === b.restoreOnly, subscribeToAccountSessionAuthority: fn => { listeners.add(fn); return () => listeners.delete(fn); } };
  const build = { configId: digest, projectId: allocation.projectId, appId: allocation.appId };
  const nativeBuild = { isIsolatedTestStoreFlavor: () => true, readIsolatedTestStoreBuild: () => configured ? build : null,
    configureIsolatedTestStoreNative: async uid => { nativeCalls.push("configure"); assert.equal(sdkUser, null); sdkUser = uid; return { configured: true, configId: digest, providerAppUserId: uid }; }, ownsIsolatedTestStoreProviderIdentity: async uid => uid === sdkUser };
  const contract = load("../_lib/isolatedTestStoreContract.ts", {});
  const journalModule = load("../_lib/isolatedTestStoreAttempts.ts", { "@react-native-async-storage/async-storage": storage, "./isolatedTestStoreContract": contract });
  const journal = () => journalModule.createIsolatedTestStoreAttemptJournal({ userId: current.userId, configurationDigest: digest });
  const uiJournal = { ...journalModule, createIsolatedTestStoreAttemptJournal: args => {
    const actual = journalModule.createIsolatedTestStoreAttemptJournal(args);
    return { ...actual, readGlobalReservation: async () => { const value = await actual.readGlobalReservation(); const wait = localWait; if (wait) { localWait = null; wait.started.resolve(); await wait.release.promise; } return value; } };
  } };
  const transport = load("../_lib/isolatedTestStore.ts", { "react-native": { Platform: { OS: platform } }, "./supabase": { SUPABASE_URL: "https://fixture.invalid", SUPABASE_ANON_KEY: "fixture-public" }, "./accountSessionAuthority": authority, "./accountBoundSupabaseMutation": { captureAccountBoundSupabaseMutationSubject: async () => ({ authority: current, accessToken: "captured-fixture-token" }) }, "./isolatedTestStoreContract": contract }, {
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body); calls.push(body);
      const delayedArrival = body.command === "read" ? serverWait : null; if (delayedArrival) { serverWait = null; await delayedArrival.promise; }
      const [saved] = await journal().list(); assert.ok(saved || body.command === "read");
      if (body.command === "allocate") assert.equal(saved.phase, "allocation_unknown");
      if (body.command === "claim") { assert.equal(saved.phase, "claim_unknown"); if (rejectClaim) throw Error("response lost"); }
      if (body.command === "report") assert.equal(saved.phase, "report_unknown");
      const receipt = verified && !reviewHold ? { id: `scv1_receipt_${uuid(12)}`, state: "verified", providerTransactionId: "server-transaction", originalTransactionId: "server-original", purchasedAt } : null;
      const status = backendUnavailable ? "unavailable" : reviewHold ? "held" : receipt ? "verified" : body.command === "allocate" ? "allocated" : body.command === "claim" ? "dispatch_claimed" : "pending";
      const response = { protocol: "isolated-test-store-v1", command: body.command, requestId: body.requestId, actor: { userId: current.userId, sessionId: body.expectedSessionId }, generation: 1, environment: "sandbox", result: { status, reason: status, dispatchAllowed: body.command === "claim" && !receipt, retryProviderMutation: false, grantsAccess: false, notPayable: true, allocation: backendUnavailable || reviewHold ? null : allocation, authorityValidUntil: body.command === "claim" && !receipt ? new Date(Date.now() + 4_000).toISOString() : null, receipt } };
      const heldRead = body.command === "read" ? readWait : null; if (heldRead) readWait = null;
      return { ok: true, json: async () => { if (heldRead) await heldRead.promise; return response; } };
    },
  });
  const sdk = load("../_lib/isolatedTestStoreSdk.ts", { "react-native-purchases": { __esModule: true, default: { getAppUserID: async () => sdkUser, isAnonymous: async () => false, getCustomerInfo: async () => ({ originalAppUserId: sdkUser, nonSubscriptionTransactions: [], activeSubscriptions: [], entitlements: { active: {} } }), getProducts: async () => [{ identifier: "tip-199", price: sdkPrice, currencyCode: "USD", subscriptionPeriod: null }], purchaseStoreProduct: async () => { const [saved] = await journal().list(); assert.equal(saved.phase, "sdk_unknown"); nativeCalls.push("purchase"); return purchase(); } }, PRODUCT_CATEGORY: { NON_SUBSCRIPTION: "NON_SUBSCRIPTION" } }, "./accountSessionAuthority": authority, "./isolatedTestStoreBuild": nativeBuild, "./isolatedTestStoreContract": contract });
  const rehearsal = load("../_lib/isolatedTestStoreRehearsal.ts", { "./accountSessionAuthority": authority, "./isolatedTestStoreSdk": sdk });
  const primitive = name => function NativePrimitive(props) { nodes.push({ name, props }); return name === "Text" ? null : React.createElement(React.Fragment, null, props.children); };
  const native = { StyleSheet: { create: value => value }, ...Object.fromEntries(["View", "Pressable", "Text"].map(n => [n, primitive(n)])) };
  const component = load("../components/monetization/isolated-test-store-checkout.tsx", { react: React, "react-native": native, "../../_lib/accountSessionAuthority": authority, "../../_lib/isolatedSandboxTips": { newTipRequestId: () => uuid(++serial) }, "../../_lib/isolatedTestStoreBuild": nativeBuild, "../../_lib/isolatedTestStore": transport, "../../_lib/isolatedTestStoreAttempts": uiJournal, "../../_lib/isolatedTestStoreRehearsal": rehearsal, "./isolated-tip-receipt": { isolatedTipMoney: (amount, currency) => `${(amount / 100).toFixed(2)} ${currency}` } });
  const root = createRoot(container());
  const visible = () => nodes.slice(Math.max(0, nodes.findLastIndex(n => n.props.testID === "isolated-test-store-panel")));
  const render = async () => { nodes = []; await React.act(async () => { const child = React.createElement(component.IsolatedTestStoreCheckout, { authority: current, preparation: current.userId === A.userId ? preparation : null }); root.render(strict ? React.createElement(React.StrictMode, null, child) : child); }); };
  return { memory, calls, nativeCalls, journal, render, node: id => visible().findLast(n => n.props.testID === id), text: () => visible().filter(n => n.name === "Text").flatMap(n => n.props.children).join("\n"),
    async press(id) { const n = visible().findLast(n => n.props.testID === id); assert.ok(n, id); assert.notEqual(n.props.disabled, true); await React.act(async () => { n.props.onPress(); await new Promise(done => setImmediate(done)); }); },
    async publish(next) { await React.act(async () => { current = next; for (const listener of listeners) listener(next); }); },
    async change(next) { await React.act(async () => { current = next; for (const listener of listeners) listener(next); }); await render(); },
    async settle() { await React.act(async () => { await new Promise(done => setImmediate(done)); }); }, verify() { verified = true; }, hold() { reviewHold = true; }, unavailable() { backendUnavailable = true; }, delayRead() { readWait = deferred(); return readWait; }, delayServerArrival() { serverWait = deferred(); return serverWait; }, delayLocalReservation() { localWait = { started: deferred(), release: deferred() }; return localWait; }, loseClaim() { rejectClaim = true; }, wrongPrice() { sdkPrice = 2; }, setPurchase(fn) { purchase = fn; }, async dispose() { await React.act(async () => root.unmount()); } };
}

for (const platform of ["ios", "android"]) test(`mounted ${platform} actual pipeline persists each phase, opens exactly once and waits for server receipt`, async t => {
  for (const strict of [false, true]) {
  const f = fixture({ platform, strict }); t.after(() => f.dispose()); await f.render();
  // SessionProvider publishes a fresh equivalent binding on same-session refresh.
  await f.change({ ...A });
  assert.equal(f.node("isolated-test-store-open").props.accessibilityState.disabled, true); assert.match(f.text(), /One provider attempt per installation/u);
  await f.press("isolated-test-store-review"); await f.press("isolated-test-store-open");
  assert.deepEqual(f.calls.map(v => v.command), ["allocate", "claim", "report"]); assert.deepEqual(f.nativeCalls, ["configure", "purchase"]);
  assert.match(f.text(), /Receipt unconfirmed/u); assert.equal(f.node("isolated-test-store-open").props.disabled, true);
  const [saved] = await f.journal().list(); assert.equal(saved.sdkObservation.outcome, "sdk_success");
  f.verify(); await f.press(`isolated-test-store-recover-${saved.allocationRequestId}`);
  assert.match(f.text(), /Server receipt: verified/u); assert.match(f.text(), /No access grant or payable balance/u);
  assert.equal((await f.journal().readGlobalReservation()).reserved, true); assert.equal(f.node("isolated-test-store-open").props.disabled, true);
  f.hold(); await f.press(`isolated-test-store-recover-${saved.allocationRequestId}`);
  assert.match(f.text(), /Server review hold/u); assert.match(f.text(), /Earlier server receipt:\s+verified/u); assert.doesNotMatch(f.text(), /Server receipt: verified/u);
  }
});
test("unconfigured native DEBUG view remains unavailable with zero network or SDK actions", async t => {
  const f = fixture({ configured: false }); t.after(() => f.dispose()); await f.render();
  assert.equal(f.node("isolated-test-store-open").props.disabled, true); assert.match(f.text(), /no qualified native DEBUG configuration/u); assert.equal(f.calls.length, 0); assert.equal(f.nativeCalls.length, 0);
});
test("unavailable backend never opens SDK and never reports a completed SDK step", async t => {
  const f = fixture(); f.unavailable(); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-review"); await f.press("isolated-test-store-open");
  assert.deepEqual(f.calls.map(v => v.command), ["allocate"]); assert.deepEqual(f.nativeCalls, []);
  assert.match(f.text(), /did not confirm an SDK purchase step/u); assert.doesNotMatch(f.text(), /SDK step finished/u); assert.equal(f.node("isolated-test-store-open").props.disabled, true);
});
test("lost claim and process restart preserve permanent reservation without replay", async t => {
  const memory = new Map(); const first = fixture({ memory }); first.loseClaim(); await first.render(); await first.press("isolated-test-store-review"); await first.press("isolated-test-store-open");
  assert.deepEqual(first.calls.map(v => v.command), ["allocate", "claim"]); assert.deepEqual(first.nativeCalls, ["configure"]); await first.dispose();
  const reopened = fixture({ memory, initial: { ...A, sessionGeneration: uuid(20) } }); t.after(() => reopened.dispose()); await reopened.render();
  assert.equal(reopened.node("isolated-test-store-open").props.disabled, true); assert.equal(reopened.calls.length, 0); assert.equal(reopened.nativeCalls.length, 0);
  const [saved] = await reopened.journal().list(); await reopened.press(`isolated-test-store-recover-${saved.allocationRequestId}`);
  assert.deepEqual(reopened.calls.map(v => v.command), ["read"]); assert.equal((await reopened.journal().list())[0].sessionId, A.sessionGeneration);
});
test("late SDK result after A to B to A cannot switch identity, report success or reopen", async t => {
  const held = deferred(); const f = fixture(); f.setPurchase(() => held.promise); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-review"); await f.press("isolated-test-store-open");
  assert.deepEqual(f.nativeCalls, ["configure", "purchase"]); await f.change(B); await f.change(A);
  await React.act(async () => { held.resolve({ productIdentifier: "tip-199", transaction: { productIdentifier: "tip-199", transactionIdentifier: "late" } }); }); await f.settle();
  assert.equal(f.calls.some(v => v.command === "report"), false); assert.equal(f.node("isolated-test-store-open").props.disabled, true);
  assert.deepEqual(f.nativeCalls, ["configure", "purchase"]); const [saved] = await f.journal().list(); assert.equal(saved.sdkObservation.outcome, "sdk_unknown");
  // Even if React never renders the transient authority gap, the old incarnation
  // must remain retired when the same binding returns.
  const retired = fixture({ strict: true }); t.after(() => retired.dispose()); await retired.render();
  await retired.publish(null); await retired.publish({ ...A }); await retired.render();
  assert.equal(retired.node("isolated-test-store-review").props.disabled, true);
  assert.equal(retired.calls.length, 0); assert.equal(retired.nativeCalls.length, 0);
});
test("read-only recovery stays visible while native purchase is unresolved and never releases ownership", async t => {
  const held = deferred(); const f = fixture(); f.setPurchase(() => held.promise); t.after(() => f.dispose());
  await f.render(); await f.press("isolated-test-store-review"); await f.press("isolated-test-store-open");
  const [saved] = await f.journal().list(); assert.equal(saved.phase, "sdk_unknown");
  assert.ok(f.node(`isolated-test-store-recover-${saved.allocationRequestId}`));
  await f.press(`isolated-test-store-recover-${saved.allocationRequestId}`); assert.equal(f.calls.at(-1).command, "read");
  assert.equal((await f.journal().readGlobalReservation()).reserved, true);
  await React.act(async () => { held.resolve({ productIdentifier: "tip-199", transaction: { productIdentifier: "tip-199", transactionIdentifier: "late-after-read" } }); }); await f.settle();
  assert.equal(f.calls.some(v => v.command === "report"), false); assert.deepEqual(f.nativeCalls, ["configure", "purchase"]);
});
test("SDK cancellation remains pending and cannot clear the reservation", async t => {
  const f = fixture(); f.setPurchase(async () => { throw { userCancelled: true }; }); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-review"); await f.press("isolated-test-store-open");
  const [saved] = await f.journal().list(); assert.equal(saved.sdkObservation.outcome, "sdk_cancelled"); assert.equal(saved.observation.receipt, null);
  assert.equal((await f.journal().readGlobalReservation()).reserved, true); assert.equal(f.node("isolated-test-store-open").props.disabled, true);
});
test("native product mismatch prevents server claim and purchase while retaining recovery", async t => {
  const f = fixture(); f.wrongPrice(); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-review"); await f.press("isolated-test-store-open");
  assert.deepEqual(f.calls.map(v => v.command), ["allocate"]); assert.deepEqual(f.nativeCalls, ["configure"]);
  assert.equal(f.node("isolated-test-store-open").props.disabled, true); assert.match(f.text(), /could not be confirmed/u);
});
test("older concurrent verified read cannot overwrite a newer server hold in storage or presentation", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-review"); await f.press("isolated-test-store-open");
  const [saved] = await f.journal().list(); const button = `isolated-test-store-recover-${saved.allocationRequestId}`;
  f.verify(); const old = f.delayRead(); await f.press(button);
  f.hold(); await f.press(button); assert.match(f.text(), /Server review hold/u);
  await React.act(async () => old.resolve()); await f.settle();
  assert.equal((await f.journal().list())[0].observation.status, "held"); assert.match(f.text(), /Server review hold/u); assert.doesNotMatch(f.text(), /Server receipt: verified/u);
  assert.equal((await f.journal().readGlobalReservation()).reserved, true);
});
test("earlier-started request reaching server after the hold still records its authenticated negative", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-review"); await f.press("isolated-test-store-open");
  const [saved] = await f.journal().list(); const button = `isolated-test-store-recover-${saved.allocationRequestId}`;
  f.verify(); const lateServer = f.delayServerArrival(); await f.press(button);
  await f.press(button); assert.match(f.text(), /Server receipt: verified/u);
  f.hold(); await React.act(async () => lateServer.resolve()); await f.settle();
  assert.equal((await f.journal().list())[0].observation.status, "held"); assert.match(f.text(), /Server review hold/u); assert.doesNotMatch(f.text(), /Server receipt: verified/u);
});
test("delayed local reservation completion cannot render an old positive AsyncStorage snapshot over a newer hold", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-review"); await f.press("isolated-test-store-open");
  const [saved] = await f.journal().list(); const button = `isolated-test-store-recover-${saved.allocationRequestId}`;
  f.verify(); const local = f.delayLocalReservation(); await f.press(button); await local.started.promise;
  f.hold(); await f.press(button); assert.match(f.text(), /Server review hold/u);
  await React.act(async () => local.release.resolve()); await f.settle();
  assert.equal((await f.journal().list())[0].observation.status, "held"); assert.match(f.text(), /Server review hold/u); assert.doesNotMatch(f.text(), /Server receipt: verified/u);
});
