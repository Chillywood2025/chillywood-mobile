import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { createRoot } from "react-dom/client";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import { A, B, clone, customer, digest, quote, registration, uuid } from "./helpers/isolated-test-store-v2-fixtures.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {}, doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: doc, parentNode: null, tagName: "DIV" });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function load(file, bindings, globals = {}) {
  const scope = { exports: {}, Error, setTimeout, clearTimeout, crypto: webcrypto, ...globals, require(name) { assert.ok(name in bindings, `Unmodeled production import ${name}`); return bindings[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, scope);
  return scope.exports;
}
function fixture({ memory = new Map(), server = null, nativeState = null, initial = A, configured = true, platform = "ios", strictMode = false } = {}) {
  let current = initial, nodes = [], now = Date.parse("2026-11-07T12:00:00Z"), cacheMissing = false, lostClaim = false, lostAdvance = false, heldRead = null, nativeOutcome = "sdk_success";
  const listeners = new Set(), calls = [], nativeCalls = [], coreCalls = [];
  const state = server ?? { bound: false, serial: 100, revision: 1, active: null, core: new Map(), allocations: new Map(), held: false, verified: new Set() };
  const device = nativeState ?? { customer: null, retired: false, active: null, invocations: new Map(), handles: new Map() };
  let purchaseWait = null, claimWait = null, storageWait = null;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const globals = { Date: Clock };
  const storage = { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => { const wait = storageWait; storageWait = null; if (wait) await wait.promise; memory.set(key, value); } };
  const authority = { getCurrentAccountSessionAuthoritySnapshot: () => current,
    sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration && a.restoreOnly === b.restoreOnly,
    subscribeToAccountSessionAuthority(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const account = { captureAccountBoundSupabaseMutationSubject: async () => ({ authority: current, accessToken: "captured-fixture-token" }) };
  const supabase = { SUPABASE_URL: "https://fixture.invalid", SUPABASE_ANON_KEY: "public-fixture" };
  const actor = sid => ({ userId: current.userId, accountId: current.userId, sessionGeneration: sid });
  const coreEnvelope = (command, requestId, sid, data) => ({ protocol: "sandbox-commerce-v1", environment: "sandbox", command, requestId, actor: actor(sid), status: "ok", data });
  const rpc = { isAccountBoundSupabaseRpcOutcomeAmbiguous: () => true, async invokeAccountBoundSupabaseRpc({ args }) {
    const command = args.p_command, p = args.p_payload, sid = args.p_expected_session_generation; coreCalls.push({ command, payload: clone(p) });
    let data;
    if (command === "checkout.prepare") {
      const id = `scv1_intent_${uuid(++state.serial)}`; state.core.set(p.requestId, { id, requestId: p.requestId, sid, payload: clone(p) });
      data = { intent: { id, offerId: p.offerId, resourceId: quote.resourceId, kind: "creator_tip", status: "prepared", providerDispatchAllowed: false } };
    } else if (command === "request.read") {
      const original = state.core.get(p.originalRequestId);
      data = { resolution: original ? "found" : "unknown", originalRequestId: p.originalRequestId,
        recordedCommand: original ? "checkout.prepare" : null, recordedSessionId: original?.sid ?? null, recordedPayload: original?.payload ?? null,
        resource: null, offer: null, declaration: null, retryAllowed: false, noDispatchProven: false,
        entry: original ? { id: original.id, offerId: quote.offerId, offerRevision: quote.offerRevision, resourceId: quote.resourceId,
          resourceRevision: quote.resourceRevision, creatorId: quote.creatorId, kind: "creator_tip", amountMinor: quote.amountMinor, currency: quote.currency,
          status: "prepared", createdAt: "2026-11-07T11:59:00Z", expiresAt: "2026-11-07T12:15:00Z", originalSessionMatchesCurrent: original.sid === sid,
          dispatchState: "not_recorded", receipt: null, abandonment: null, providerDispatchAllowed: false, noDispatchProven: false } : null };
    } else throw Error(`Unsupported core fixture ${command}`);
    return { data: coreEnvelope(command, p.requestId, sid, data), error: null };
  } };
  const coreBindings = { "./accountBoundSupabaseMutation": account, "./accountBoundSupabaseRpc.mjs": rpc, "./supabase": supabase, "react-native": { Platform: { OS: platform } }, "./accountSessionAuthority": authority };
  const commerce = load("_lib/isolatedSandboxCommerce.ts", coreBindings, globals);
  const coreApi = load("_lib/isolatedSandboxTips.ts", { ...coreBindings, "react-native-get-random-values": {}, "./isolatedSandboxCommerce": commerce }, globals);
  const v1 = load("_lib/isolatedTestStoreContract.ts", {}, globals), contract = load("_lib/isolatedTestStoreV2Contract.ts", { "./isolatedTestStoreContract": v1 }, globals);
  const nativeInvocation = (allocation, sid, status) => ({ protocol: "isolated-test-store-native-v2", invocationId: allocation.dispatchId,
    customerBindingId: customer.id, installationId: customer.installationId, buyerId: customer.buyerId, configurationDigest: digest,
    providerAppUserId: customer.providerAppUserId, allocationId: allocation.id, registrationId: allocation.registration.id, sessionId: sid,
    state: status, outcome: status === "completed" ? nativeOutcome : null, transactionHint: null, completedAt: status === "completed" ? new Clock().toISOString() : null });
  const nativeModule = { isolatedTestStoreV2Flavor: true,
    build: configured ? { protocol: "isolated-test-store-build-v2", mode: "test-store-debug-v2", platform, applicationId: "com.chillywood.mobile.teststoredebugv2",
      projectId: customer.projectId, appId: customer.appId, publicSdkKey: "test_nonsecretfixture", configId: digest, storageNamespace: "@chillywood/test-store-debug-v2", nativeDebug: true } : null,
    async inspectInstallation() { return { protocol: "isolated-test-store-native-v2", installationId: customer.installationId, configurationDigest: digest, customer: device.customer, processRetired: device.retired, activeInvocationId: device.active }; },
    async bindCustomer(json, sid) { const c = JSON.parse(json); nativeCalls.push(["bind", c.providerAppUserId, sid]); assert.ok(!device.customer || device.customer.providerAppUserId === c.providerAppUserId); device.customer = c; return this.inspectInstallation(); },
    async preparePackage(_customer, json, sid) {
      const a = JSON.parse(json); nativeCalls.push(["lookup", a.registration.offeringIdentifier]);
      if (cacheMissing) return { status: "package_unavailable", handleId: null, invocation: null };
      assert.equal(device.active, null); assert.equal(device.retired, false); device.active = a.dispatchId;
      const invocation = nativeInvocation(a, sid, "prepared"), handleId = uuid(++state.serial); device.invocations.set(a.dispatchId, invocation); device.handles.set(handleId, a);
      return { status: "prepared", handleId, invocation };
    },
    async purchasePrepared(handleId, rawClaim) {
      const claim = JSON.parse(rawClaim), a = device.handles.get(handleId); assert.ok(a); device.handles.delete(handleId);
      nativeCalls.push(["purchase", a.registration.offeringIdentifier]); device.invocations.set(a.dispatchId, nativeInvocation(a, claim.actor.sessionId, "invoking"));
      if (purchaseWait) await purchaseWait.promise;
      const completed = nativeInvocation(a, claim.actor.sessionId, "completed"); device.invocations.set(a.dispatchId, completed); device.active = null; return completed;
    },
    async readInvocation(id) { return device.invocations.get(id) ?? null; },
    async retireSession() { device.retired = true; },
  };
  const build = load("_lib/isolatedTestStoreV2Build.ts", { "expo-application": { applicationId: "com.chillywood.mobile.teststoredebugv2" },
    "expo-modules-core": { requireOptionalNativeModule: () => nativeModule }, "react-native": { Platform: { OS: platform } }, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV2Contract": contract }, globals);
  const transport = load("_lib/isolatedTestStoreV2.ts", { ...coreBindings, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV2Contract": contract }, { ...globals,
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body), p = body.payload; calls.push(body); let a = null, status;
      if (body.command === "bind") { state.bound = true; a = state.active ? state.allocations.get(state.active) : null; }
      else if (body.command === "allocate") {
        assert.equal(state.active, null); a = { id: `scv2_allocation_${uuid(++state.serial)}`, intentId: p.intentId, dispatchId: uuid(++state.serial),
          customerBindingId: customer.id, configurationDigest: digest, productId: registration.productId, quote: clone(p.expectedQuote),
          acceptPurchaseUntil: new Clock(now + 60_000).toISOString(), registration: { ...registration, id: `scv2_registration_${uuid(++state.serial)}`, offeringIdentifier: `intent_${state.serial}` } };
        state.allocations.set(a.id, a); state.active = a.id; state.revision++;
      } else a = [...state.allocations.values()].find(x => x.intentId === p.intentId);
      if (body.command === "claim") { a.claimed = true; if (lostClaim) throw Error("claim response lost"); }
      if (body.command === "advance") { assert.equal(state.active, a.id); assert.equal(state.revision, p.expectedReservationRevision); state.active = null; state.revision++; status = "released"; if (lostAdvance) throw Error("advance response lost"); }
      const receipt = a && state.verified.has(a.id) ? { id: `scv1_receipt_${a.dispatchId}`, state: "verified", providerTransactionId: `tx_${a.dispatchId}`, originalTransactionId: `original_${a.dispatchId}`, purchasedAt: "2026-11-07T12:00:00Z" } : null;
      status = state.held ? "held" : status ?? (receipt ? "verified" : !a ? "customer_bound" : body.command === "claim" ? "dispatch_claimed" : a.claimed ? "pending" : "offering_ready");
      const clean = a ? Object.fromEntries(Object.entries(a).filter(([k]) => k !== "claimed")) : null;
      const result = { protocol: "isolated-test-store-v2", command: body.command, requestId: body.requestId, actor: { userId: current.userId, sessionId: body.expectedSessionId }, generation: 1, environment: "sandbox",
        result: { status, reason: status, dispatchAllowed: body.command === "claim" && !state.held, retryProviderMutation: false, grantsAccess: false, notPayable: true,
          customer: clone(customer), allocation: clone(clean), reservation: { revision: state.revision, activeAllocationId: state.active }, authorityValidUntil: body.command === "claim" && !state.held ? new Clock(now + 4_000).toISOString() : null, receipt } };
      const wait = body.command === "read" ? heldRead : body.command === "claim" ? claimWait : null;
      if (body.command === "read" && wait) heldRead = null;
      if (body.command === "claim" && wait) claimWait = null;
      return { ok: true, json: async () => { if (wait) await wait.promise; return result; } };
    } });
  const journal = load("_lib/isolatedTestStoreV2Attempts.ts", { "@react-native-async-storage/async-storage": storage, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV2Contract": contract }, globals);
  const coreJournal = load("_lib/isolatedSandboxTipCheckoutAttempts.ts", { "@react-native-async-storage/async-storage": storage, "./isolatedSandboxCommerce": commerce }, globals);
  const preparations = load("_lib/isolatedTestStoreV2Preparations.ts", { "@react-native-async-storage/async-storage": storage, "./isolatedSandboxTipCheckoutAttempts": coreJournal, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV2Contract": contract, "./isolatedTestStoreV2Attempts": journal }, globals);
  const sdk = load("_lib/isolatedTestStoreV2Sdk.ts", { "./accountSessionAuthority": authority, "./isolatedTestStoreV2Build": build, "./isolatedTestStoreV2Contract": contract }, globals);
  const actions = load("_lib/isolatedTestStoreV2Actions.ts", { "./accountSessionAuthority": authority, "./isolatedSandboxTips": coreApi, "./isolatedSandboxCommerce": commerce,
    "./isolatedTestStoreV2": transport, "./isolatedTestStoreV2Attempts": journal, "./isolatedTestStoreV2Preparations": preparations, "./isolatedTestStoreV2Build": build, "./isolatedTestStoreV2Sdk": sdk }, globals);
  const primitive = name => function Primitive(props) { nodes.push({ name, props }); return name === "Text" ? null : React.createElement(React.Fragment, null, props.children); };
  const native = { StyleSheet: { create: v => v }, ...Object.fromEntries(["View", "Text", "Pressable"].map(n => [n, primitive(n)])) };
  const component = load("components/monetization/isolated-test-store-v2-checkout.tsx", { react: React, "react-native": native, "../../_lib/accountSessionAuthority": authority,
    "../../_lib/isolatedTestStoreV2Actions": actions, "../../_lib/isolatedTestStoreV2Build": build, "./isolated-tip-receipt": { isolatedTipMoney: (amount, currency) => `${(amount / 100).toFixed(2)} ${currency}` } }, globals);
  const offer = { id: quote.offerId, resourceId: quote.resourceId, revision: quote.offerRevision, resourceRevision: quote.resourceRevision, creatorId: quote.creatorId, kind: "creator_tip", amountMinor: 199, currency: "usd", available: true };
  const root = createRoot(container()), visible = () => nodes.slice(Math.max(0, nodes.findLastIndex(n => n.props.testID === "isolated-test-store-v2-panel")));
  const getJournal = () => journal.createIsolatedTestStoreV2AttemptJournal({ userId: current.userId, installationId: customer.installationId, configurationDigest: digest });
  return { memory, server: state, nativeState: device, calls, coreCalls, nativeCalls, journal: getJournal,
    preparations: () => preparations.createIsolatedTestStoreV2Preparations({ userId: current.userId, installationId: customer.installationId, configurationDigest: digest }),
    async render(equivalentAuthority = false) { nodes = []; await React.act(async () => { const child = React.createElement(component.IsolatedTestStoreV2Checkout, { authority: equivalentAuthority ? { ...current } : current, offer }); root.render(strictMode ? React.createElement(React.StrictMode, null, child) : child); }); },
    node: id => visible().findLast(n => n.props.testID === id), text: () => visible().filter(n => n.name === "Text").flatMap(n => n.props.children).join("\n"),
    async press(id) { const n = visible().findLast(n => n.props.testID === id); assert.ok(n, id); assert.notEqual(n.props.disabled, true, id); await React.act(async () => { n.props.onPress(); await new Promise(done => setImmediate(done)); }); },
    async settle() { await React.act(async () => { await new Promise(done => setImmediate(done)); }); },
    async change(next) { await React.act(async () => { current = next; for (const listener of listeners) listener(next); }); },
    advanceClock() { now += 5_000; }, cacheMiss(v) { cacheMissing = v; }, loseClaim() { lostClaim = true; }, loseAdvance() { lostAdvance = true; }, cancelNative() { nativeOutcome = "sdk_cancelled"; },
    verify(id) { state.verified.add(id); }, hold() { state.held = true; }, delayRead() { heldRead = deferred(); return heldRead; },
    holdPurchase() { purchaseWait = deferred(); return purchaseWait; },
    delayClaim() { claimWait = deferred(); return claimWait; }, delayStorageWrite() { storageWait = deferred(); return storageWait; },
    async dispose() { await React.act(async () => root.unmount()); } };
}
async function allocate(f) {
  await f.press("isolated-test-store-v2-review-quote"); await f.press("isolated-test-store-v2-prepare-quote");
  const request = f.coreCalls.findLast(c => c.command === "checkout.prepare").payload.requestId;
  await f.press(`isolated-test-store-v2-allocate-${request}`); return (await f.journal().list()).at(-1);
}
async function purchase(f, a) { await f.press(`isolated-test-store-v2-review-purchase-${a.allocationRequestId}`); await f.press(`isolated-test-store-v2-purchase-${a.allocationRequestId}`); }

for (const platform of ["ios", "android"]) test(`mounted ${platform} actual quote, transport and journals permit two explicit Offering-bound purchases`, async t => {
  const f = fixture({ platform }); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-v2-bind");
  const first = await allocate(f); await purchase(f, first); assert.equal(f.nativeCalls.filter(c => c[0] === "purchase").length, 1);
  assert.match(f.text(), /Receipt unconfirmed/u); f.verify(first.allocation.id); await f.press(`isolated-test-store-v2-recover-${first.allocationRequestId}`);
  assert.match(f.text(), /Server receipt: verified/u); f.advanceClock(); await f.press(`isolated-test-store-v2-advance-${first.allocationRequestId}`);
  assert.equal((await f.journal().list())[0].initiationReleased, true); const second = await allocate(f); await purchase(f, second);
  assert.notEqual(first.intentId, second.intentId); assert.notEqual(first.allocation.registration.offeringIdentifier, second.allocation.registration.offeringIdentifier);
  assert.equal(f.nativeCalls.filter(c => c[0] === "purchase").length, 2); assert.equal(new Set(f.nativeCalls.filter(c => c[0] === "bind").map(c => c[1])).size, 1);
});
test("mounted unconfigured profile makes no backend or native purchase request", async t => {
  const f = fixture({ configured: false }); t.after(() => f.dispose()); await f.render();
  assert.match(f.text(), /unavailable/u); assert.equal(f.node("isolated-test-store-v2-bind").props.disabled, true); assert.equal(f.calls.length, 0); assert.equal(f.nativeCalls.length, 0);
});
test("completed cache miss allows an explicit new lookup without consuming a server claim", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-v2-bind"); const a = await allocate(f);
  f.cacheMiss(true); await purchase(f, a); assert.equal(f.calls.filter(c => c.command === "claim").length, 0); assert.match(f.text(), /native cache/u);
  f.cacheMiss(false); await purchase(f, a); assert.equal(f.calls.filter(c => c.command === "claim").length, 1); assert.equal(f.nativeCalls.filter(c => c[0] === "purchase").length, 1);
});
test("lost claim survives restart as read-only recovery and never opens the old native handle", async t => {
  const f = fixture(); await f.render(); await f.press("isolated-test-store-v2-bind"); const a = await allocate(f); f.loseClaim(); await purchase(f, a); await f.dispose();
  const reopened = fixture({ memory: f.memory, server: f.server, nativeState: f.nativeState }); t.after(() => reopened.dispose()); await reopened.render();
  await reopened.press(`isolated-test-store-v2-recover-${a.allocationRequestId}`);
  assert.equal(reopened.node(`isolated-test-store-v2-purchase-${a.allocationRequestId}`), undefined); assert.equal(reopened.nativeCalls.filter(c => c[0] === "purchase").length, 0);
  assert.equal(reopened.calls.some(c => c.command === "claim"), false); assert.equal((await reopened.journal().list())[0].nativePhase, "unprepared");
});
test("explicit unknown-outcome continuation retains pending history and requires acknowledgement", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-v2-bind"); const a = await allocate(f); await purchase(f, a); f.advanceClock();
  assert.equal(f.node(`isolated-test-store-v2-advance-${a.allocationRequestId}`).props.disabled, true);
  await f.press(`isolated-test-store-v2-acknowledge-${a.allocationRequestId}`); await f.press(`isolated-test-store-v2-advance-${a.allocationRequestId}`);
  const saved = (await f.journal().list())[0]; assert.equal(saved.initiationReleased, true); assert.equal(saved.observation.receipt, null); assert.match(f.text(), /unknown outcome remains/u);
  assert.equal(f.calls.findLast(c => c.command === "advance").payload.disposition, "retain_unknown");
});
test("late positive response cannot erase a newer hold in mounted presentation", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-v2-bind"); const a = await allocate(f); await purchase(f, a); f.verify(a.allocation.id);
  const wait = f.delayRead(); await f.press(`isolated-test-store-v2-recover-${a.allocationRequestId}`); f.hold(); await f.press(`isolated-test-store-v2-recover-${a.allocationRequestId}`);
  await React.act(async () => wait.resolve()); await f.settle(); assert.match(f.text(), /Server review hold/u); assert.doesNotMatch(f.text(), /Server receipt: verified/u);
  assert.equal(f.node(`isolated-test-store-v2-advance-${a.allocationRequestId}`), undefined);
});
test("A to B to A while native callback is pending retires UI and old continuations", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-v2-bind"); const a = await allocate(f); const wait = f.holdPurchase(); await purchase(f, a);
  await f.change(B); await f.change(A); await React.act(async () => wait.resolve()); await f.settle();
  assert.match(f.text(), /account session changed/u); assert.equal(f.nativeState.retired, true); assert.equal(f.calls.some(c => c.command === "report"), false);
  assert.equal(f.nativeCalls.filter(c => c[0] === "purchase").length, 1);
});
test("native cancellation stays economically unknown until explicit continuation and never auto-retries", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-v2-bind"); const a = await allocate(f); f.cancelNative(); await purchase(f, a);
  const saved = (await f.journal().list())[0]; assert.equal(saved.nativeInvocation.outcome, "sdk_cancelled"); assert.equal(saved.observation.receipt, null);
  assert.equal(saved.initiationReleased, false); assert.equal(f.node(`isolated-test-store-v2-advance-${a.allocationRequestId}`).props.disabled, true);
  assert.equal(f.nativeCalls.filter(c => c[0] === "purchase").length, 1); assert.match(f.text(), /Receipt unconfirmed/u);
});
test("lost advance recovers the new slot through a read while old pending history remains", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-v2-bind"); const a = await allocate(f); await purchase(f, a); f.advanceClock(); f.loseAdvance();
  await f.press(`isolated-test-store-v2-acknowledge-${a.allocationRequestId}`); await f.press(`isolated-test-store-v2-advance-${a.allocationRequestId}`);
  assert.equal((await f.journal().list())[0].initiationReleased, false); await f.press(`isolated-test-store-v2-recover-${a.allocationRequestId}`);
  const saved = (await f.journal().list())[0]; assert.equal(saved.initiationReleased, true); assert.equal(saved.observation.status, "pending"); assert.equal(saved.observation.receipt, null);
  assert.equal(f.calls.filter(c => c.command === "advance").length, 1); assert.equal(f.node("isolated-test-store-v2-review-quote").props.disabled, false);
});
test("restart during native work permits only recovery and later captures durable native completion", async t => {
  const f = fixture(); await f.render(); await f.press("isolated-test-store-v2-bind"); const a = await allocate(f), wait = f.holdPurchase(); await purchase(f, a); await f.dispose();
  const reopened = fixture({ memory: f.memory, server: f.server, nativeState: f.nativeState }); t.after(() => reopened.dispose()); await reopened.render();
  await reopened.press(`isolated-test-store-v2-recover-${a.allocationRequestId}`); assert.notEqual((await reopened.journal().list())[0].nativePhase, "completed");
  assert.equal(reopened.node(`isolated-test-store-v2-purchase-${a.allocationRequestId}`), undefined);
  await React.act(async () => wait.resolve()); await reopened.press(`isolated-test-store-v2-recover-${a.allocationRequestId}`);
  assert.equal((await reopened.journal().list())[0].nativePhase, "completed"); assert.equal(reopened.nativeCalls.filter(c => c[0] === "purchase").length, 0);
});
test("server binding recovers untracked history without recreating its original purchase capability", async t => {
  const f = fixture(); await f.render(); await f.press("isolated-test-store-v2-bind"); const a = await allocate(f); await purchase(f, a); await f.dispose();
  const reopened = fixture({ server: f.server, nativeState: f.nativeState }); t.after(() => reopened.dispose()); await reopened.render(); await reopened.press("isolated-test-store-v2-bind");
  assert.match(reopened.text(), /Retained server attempt/u); assert.match(reopened.text(), /read-only/u);
  await reopened.press("isolated-test-store-v2-recover-binding"); assert.equal((await reopened.journal().list()).length, 0);
  assert.equal(reopened.calls.some(c => c.command === "claim"), false); assert.equal(reopened.nativeCalls.filter(c => c[0] === "purchase").length, 0);
});
test("equivalent authority object rerender keeps the same current client usable", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-v2-bind");
  await f.render(true); const a = await allocate(f); await purchase(f, a);
  assert.equal(f.nativeCalls.filter(c => c[0] === "purchase").length, 1);
  assert.doesNotMatch(f.text(), /account session changed/u);
});
test("status reads cannot consume a pending fresh claim handoff but remain available during native work", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-v2-bind"); const a = await allocate(f);
  const recoverId = `isolated-test-store-v2-recover-${a.allocationRequestId}`, staleRecover = f.node(recoverId).props.onPress;
  const claim = f.delayClaim(), native = f.holdPurchase(); await purchase(f, a);
  assert.equal(f.node(recoverId).props.disabled, true); const reads = f.calls.filter(c => c.command === "read").length;
  await React.act(async () => { staleRecover(); await new Promise(done => setImmediate(done)); });
  assert.equal(f.calls.filter(c => c.command === "read").length, reads); assert.equal(f.nativeCalls.filter(c => c[0] === "purchase").length, 0);
  await React.act(async () => claim.resolve()); await f.settle();
  assert.equal(f.node(recoverId).props.disabled, false); assert.equal(f.nativeCalls.filter(c => c[0] === "purchase").length, 1);
  await f.press(recoverId); await React.act(async () => native.resolve()); await f.settle();
  assert.equal((await f.journal().list())[0].nativePhase, "completed"); assert.equal(f.calls.filter(c => c.command === "claim").length, 1);
});
test("account gap during durable quote preparation records a proven pre-send stop", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-v2-bind");
  await f.press("isolated-test-store-v2-review-quote"); const write = f.delayStorageWrite(); await f.press("isolated-test-store-v2-prepare-quote");
  await f.change(B); await f.change(A); await React.act(async () => write.resolve()); await f.settle();
  assert.equal(f.coreCalls.some(c => c.command === "checkout.prepare"), false);
  const saved = await f.preparations().list(); assert.equal(saved.length, 1); assert.equal(saved[0].attempt.state, "not_applied");
  assert.match(f.text(), /account session changed/u);
});
test("an already pending status read fences new mutations including stale press callbacks", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-v2-bind"); const a = await allocate(f);
  await f.press(`isolated-test-store-v2-review-purchase-${a.allocationRequestId}`);
  const purchaseId = `isolated-test-store-v2-purchase-${a.allocationRequestId}`, stalePurchase = f.node(purchaseId).props.onPress;
  const read = f.delayRead(); await f.press(`isolated-test-store-v2-recover-${a.allocationRequestId}`);
  assert.equal(f.node(purchaseId).props.disabled, true);
  await React.act(async () => { stalePurchase(); await new Promise(done => setImmediate(done)); });
  assert.equal(f.calls.some(c => c.command === "claim"), false); assert.equal(f.nativeCalls.filter(c => c[0] === "lookup").length, 0);
  await React.act(async () => read.resolve()); await f.settle(); await purchase(f, a);
  assert.equal(f.calls.filter(c => c.command === "claim").length, 1); assert.equal(f.nativeCalls.filter(c => c[0] === "purchase").length, 1);
  assert.equal((await f.journal().list())[0].nativePhase, "completed");
});
test("StrictMode effect replay retires old capture incarnations without retiring the current Auth session", async t => {
  const f = fixture({ strictMode: true }); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-v2-bind");
  const a = await allocate(f); const native = f.holdPurchase(); await purchase(f, a);
  assert.equal(f.nativeCalls.filter(c => c[0] === "purchase").length, 1);
  await f.change(B); await f.change(A); await React.act(async () => native.resolve()); await f.settle();
  assert.match(f.text(), /account session changed/u); assert.equal(f.nativeState.retired, true);
  assert.equal(f.calls.some(c => c.command === "report"), false);
});
test("a current installation hold keeps prior receipt history visibly held and blocks continuation", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render(); await f.press("isolated-test-store-v2-bind"); const a = await allocate(f); await purchase(f, a);
  f.verify(a.allocation.id); await f.press(`isolated-test-store-v2-recover-${a.allocationRequestId}`); assert.match(f.text(), /Server receipt: verified/u);
  f.hold(); await f.press("isolated-test-store-v2-bind");
  assert.match(f.text(), /installation has a server review hold/u); assert.match(f.text(), /Server review hold/u);
  assert.match(f.text(), /Earlier server receipt:\s*verified/u); assert.doesNotMatch(f.text(), /Server receipt: verified/u);
  assert.equal(f.node(`isolated-test-store-v2-advance-${a.allocationRequestId}`), undefined);
});
