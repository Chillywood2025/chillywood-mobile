import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {}, doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: doc, parentNode: null, tagName: "DIV" });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const id = n => `b0000000-0000-4000-8000-${String(n).padStart(12, "0")}`, clone = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function load(file, bindings) {
  const scope = { exports: {}, Error, require(name) { assert.ok(name in bindings, `Unmodeled production import ${name}`); return bindings[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8"), { fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, scope);
  return scope.exports;
}
function fixture({ state: retained, strict = false, unavailable = false } = {}) {
  const calls = [], state = retained ?? { protocol: "test-store-qualification-native-v1", configurationDigest: "a".repeat(64), installationId: id(1), providerAppUserId: `scq_teststore_${id(1)}`,
    runId: id(2), closed: false, configured: false, activeInvocationId: null, scenarios: [{ id: id(3), label: "Source fixture", providerOfferingId: "ofrng_object", offeringIdentifier: "lookup_offering",
      providerPackageId: "pk_object", packageIdentifier: "lookup_package", providerProductId: "prod_object", productId: "test_tip", amountMinor: 199, currency: "usd", intendedAction: "purchase" }], records: [] };
  let nodes = [], cacheMiss = false, pending = null, nextRead = null, outcome = "sdk_success";
  const native = { async inspect() { const result = clone(state), delay = nextRead; nextRead = null; if (delay) await delay.promise; return result; },
    async configure() { calls.push("configure"); assert.equal(state.closed, false); state.configured = true; },
    async prepare(scenarioId) {
      calls.push("prepare"); assert.equal(state.closed, false); assert.equal(state.activeInvocationId, null);
      if (cacheMiss) return { status: "package_unavailable", handleId: null, record: null };
      const scenario = state.scenarios[0], record = { protocol: "test-store-qualification-record-v1", invocationId: id(100 + state.records.length), scenarioId,
        runId: state.runId, configurationDigest: state.configurationDigest, providerAppUserId: state.providerAppUserId, offeringIdentifier: scenario.offeringIdentifier,
        packageIdentifier: scenario.packageIdentifier, productId: scenario.productId, amountMinor: scenario.amountMinor, currency: scenario.currency,
        state: "prepared", outcome: null, createdAt: "2026-11-07T12:00:00Z", completedAt: null };
      state.records.push(record); state.activeInvocationId = record.invocationId; return { status: "prepared", handleId: id(200 + state.records.length), record: clone(record) };
    }, async purchase() { calls.push("purchase"); const record = state.records.at(-1); record.state = "invoking"; if (pending) await pending.promise;
      record.state = "completed"; record.outcome = outcome; record.completedAt = "2026-11-07T12:01:00Z"; state.activeInvocationId = null; return clone(record); },
    async seal() { calls.push("seal"); state.closed = true; },
  };
  const bridge = load("native.js", { "expo-modules-core": { requireOptionalNativeModule: () => unavailable ? null : native } });
  const primitive = name => function Primitive(props) { nodes.push({ name, props }); return name === "Text" ? null : React.createElement(React.Fragment, null, props.children); };
  const rn = { StyleSheet: { create: v => v }, ...Object.fromEntries(["View", "Text", "Pressable", "ScrollView"].map(name => [name, primitive(name)])) };
  const App = load("App.js", { react: React, "react-native": rn, "./native": bridge }).default, root = createRoot(container());
  const visible = () => nodes.slice(Math.max(0, nodes.findLastIndex(n => n.props.testID === "scq-app")));
  return { calls, state,
    async render() { nodes = []; await React.act(async () => root.render(strict ? React.createElement(React.StrictMode, null, React.createElement(App)) : React.createElement(App))); },
    node: key => visible().findLast(n => n.props.testID === key), text: () => visible().filter(n => n.name === "Text").flatMap(n => n.props.children).join("\n"),
    async press(key) { const node = this.node(key); assert.ok(node, key); assert.notEqual(node.props.disabled, true, key); await React.act(async () => { node.props.onPress(); await new Promise(done => setImmediate(done)); }); },
    async settle() { await React.act(async () => { await new Promise(done => setImmediate(done)); }); },
    cacheMiss() { cacheMiss = true; }, cancel() { outcome = "sdk_cancelled"; }, waitPurchase() { pending = deferred(); return pending; },
    delayRead() { nextRead = deferred(); return nextRead; }, async dispose() { await React.act(async () => root.unmount()); },
  };
}
const prepare = async f => { await f.press("scq-configure"); await f.press(`scq-prepare-${id(3)}`); };

test("mounted unavailable profile makes no SDK call and exposes accessible disabled actions", async t => {
  const f = fixture({ unavailable: true }); t.after(() => f.dispose()); await f.render();
  assert.match(f.text(), /module is missing/u); assert.equal(f.node("scq-configure").props.accessibilityRole, "button");
  assert.equal(f.node("scq-configure").props.accessibilityState.disabled, true); assert.equal(f.calls.length, 0);
});
test("StrictMode setup replay retains usable current capture and one explicit purchase ticket", async t => {
  const f = fixture({ strict: true }); t.after(() => f.dispose()); await f.render(); await prepare(f);
  const stale = f.node("scq-purchase").props.onPress; await f.press("scq-purchase");
  assert.match(f.text(), /not authenticated receipt, no-charge, or commerce qualification/u);
  await React.act(async () => stale());
  assert.equal(f.calls.filter(c => c === "purchase").length, 1); assert.match(f.text(), /sdk_success/u);
  assert.match(f.text(), /Unknown native work is not retried or reset/u);
});
test("exact Package miss remains visible and does not invoke purchase", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render(); f.cacheMiss(); await prepare(f);
  assert.match(f.text(), /exact Package is unavailable/u); assert.equal(f.node("scq-purchase"), undefined); assert.equal(f.calls.includes("purchase"), false);
});
test("native cancellation keeps local history and requires explicit separate next attempt", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render(); await prepare(f); f.cancel(); await f.press("scq-purchase");
  assert.match(f.text(), /sdk_cancelled/u); assert.equal(f.state.records.length, 1); await f.press(`scq-prepare-${id(3)}`);
  assert.equal(f.state.records.length, 2); assert.equal(f.calls.filter(c => c === "purchase").length, 1);
  assert.equal(new Set(f.state.records.map(r => r.providerAppUserId)).size, 1);
});
test("restart cannot turn retained prepared record into a new SDK invocation", async t => {
  const old = fixture(); await old.render(); await prepare(old); await old.dispose();
  const fresh = fixture({ state: old.state }); t.after(() => fresh.dispose()); await fresh.render();
  assert.match(fresh.text(), /restart or missing callback/u); assert.equal(fresh.node("scq-purchase"), undefined);
  assert.equal(fresh.node(`scq-prepare-${id(3)}`).props.disabled, true); assert.equal(fresh.calls.length, 0);
});
test("pending native completion survives unmount without rendering stale success or retrying", async t => {
  const old = fixture(); await old.render(); await prepare(old); const finish = old.waitPurchase(); await old.press("scq-purchase"); await old.dispose();
  const fresh = fixture({ state: old.state }); t.after(() => fresh.dispose()); await fresh.render();
  assert.equal(fresh.node(`scq-prepare-${id(3)}`).props.disabled, true); await React.act(async () => finish.resolve()); await fresh.press("scq-refresh");
  assert.match(fresh.text(), /sdk_success/u); assert.equal(fresh.calls.includes("purchase"), false);
});
test("permanent local stop preserves pending ticket and does not claim receiver sealing", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render(); await prepare(f); await f.press("scq-seal");
  assert.equal(f.node("scq-purchase"), undefined); assert.match(f.text(), /receiver must be sealed separately/u);
  assert.equal(f.state.activeInvocationId, f.state.records[0].invocationId); assert.equal(f.calls.includes("purchase"), false);
});
test("delayed pre-seal local snapshot cannot reopen current sealed presentation", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render(); const late = f.delayRead(); await f.press("scq-refresh"); await f.press("scq-seal");
  await React.act(async () => late.resolve()); await f.settle(); assert.match(f.text(), /permanently stopped/u);
  assert.equal(f.node("scq-configure").props.disabled, true);
});
