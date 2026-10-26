import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";
import * as singleFlight from "../_lib/actionSingleFlight.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: doc, parentNode: null, tagName: "DIV" });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const textOf = node => Array.isArray(node) ? node.map(textOf).join(" ") : node == null || typeof node === "boolean" ? "" : typeof node !== "object" ? String(node) : textOf(node.props?.children);
const load = (file, imports = {}, source = fs.readFileSync(file, "utf8")) => {
  const context = { exports: {}, Date, Intl, Promise, require: name => { assert.ok(name in imports, `unexpected import ${name}`); return imports[name]; } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, context);
  return context.exports;
};
const presentation = load("_lib/customerExperiencePresentation.ts");
const schedule = load("_lib/eventSchedule.ts");
const offer = { title: "Sunday show", priceCents: 99, currency: "usd", status: "sandbox" };
const locked = { allowed: false, requiresPurchase: true, reason: "event_pass_required", offer };
const owned = { allowed: true, requiresPurchase: false, reason: "event_pass_confirmed", passId: "pass-old", offer };

async function mount(t, options = {}) {
  const nodes = new Map(), routes = [];
  let access = options.access ?? locked, purchase = options.purchase ?? (async () => ({ ok: false, access: locked, message: "Pending" })), authCallback;
  const host = name => function NativeHost(props) {
    const id = React.useId(); nodes.set(id, { type: name, props });
    React.useEffect(() => () => nodes.delete(id), [id]);
    return React.createElement(React.Fragment, null, ...React.Children.toArray(props.children).filter(child => typeof child === "object"));
  };
  const native = { Platform: { OS: "android" }, Alert: { alert: noop }, AppState: { addEventListener: () => ({ remove: noop }) }, StyleSheet: { create: x => x } };
  for (const name of ["ActivityIndicator", "Pressable", "RefreshControl", "ScrollView", "Text", "View"]) native[name] = host(name);
  const event = { id: "event-one", event_title: "Sunday show", status: "scheduled", starts_at: "2026-11-02T01:00:00Z", visibility: "public" };
  const supabase = { auth: { onAuthStateChange: callback => { authCallback = callback; return { data: { subscription: { unsubscribe: noop } } }; } }, from: () => {
    const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: event, error: null }) }; return query;
  } };
  const Screen = load("app/event/[eventId].tsx", {
    react: React, "react-native": native, "react-native-safe-area-context": { SafeAreaView: host("SafeAreaView") },
    "expo-router": { useLocalSearchParams: () => ({ eventId: "event-one" }), useRouter: () => ({ canGoBack: () => false, back: () => routes.push("back"), replace: x => routes.push(x), push: x => routes.push(x) }) },
    "../../_lib/paidCreatorEvents": { resolvePaidCreatorEventPassAccess: async () => access, purchasePaidCreatorEventPass: input => purchase(input), formatPaidCreatorEventPrice: () => "$0.99" },
    "../../_lib/moderation": {}, "../../_lib/actionSingleFlight.mjs": singleFlight,
    "../../_lib/circleSpectatorFeed": { readCircleSpectatorFeedItems: async () => [] },
    "../../_lib/discoveryFeed": { readPublicDiscoveryFeedItems: async () => [] },
    "../../_lib/customerExperiencePresentation": presentation, "../../_lib/eventSchedule": schedule,
    "../../_lib/supabase": { supabase }, "../../components/monetization/MoneyScopeInfoButton": { MoneyScopeInfoButton: host("MoneyScopeInfoButton") },
    "../../components/monetization/money-ui": Object.fromEntries(["MoneyOfferCard", "MoneyScopeStrip", "MoneyStatusChip", "MoneySuccessReceipt"].map(name => [name, host(name)])),
    "../../components/safety/report-sheet": { ReportSheet: () => null },
  }, options.source).default;
  const root = createRoot(container()); await React.act(async () => root.render(React.createElement(Screen)));
  t.after(() => React.act(async () => root.unmount()));
  return { routes, node: id => [...nodes.values()].find(node => node.props.testID === id),
    text: () => [...nodes.values()].map(textOf).join(" "),
    async press(id) { const node = [...nodes.values()].find(node => node.props.testID === id); assert.ok(node, id); await React.act(async () => { void node.props.onPress(); }); },
    async account(next) { access = next; await React.act(async () => authCallback()); },
    async resolve(d, value) { await React.act(async () => d.resolve(value)); },
  };
}

test("mounted event shows sold-out state and cold deep-link Back recovers to home", async t => {
  const h = await mount(t, { access: { allowed: false, requiresPurchase: false, reason: "sold_out", offer: null } });
  assert.match(h.text(), /Event Passes are sold out/);
  assert.equal(h.node("event-pass-purchase-button"), undefined);
  await h.press("event-back-button");
  assert.deepEqual(h.routes, ["/(tabs)"]);
});

test("mounted event suppresses a previous account's late purchase receipt and access", async t => {
  const d = deferred(); const h = await mount(t, { purchase: () => d.promise });
  await h.press("event-pass-purchase-button");
  await h.account({ allowed: false, requiresPurchase: false, reason: "access_check_failed", offer: null });
  await h.resolve(d, { ok: false, access: owned, message: "Old account receipt" });
  assert.equal(h.node("event-pass-success-receipt"), undefined);
  assert.doesNotMatch(h.text(), /Old account receipt/);
  assert.match(h.text(), /could not be verified/);
});

test("negative control detects removing late purchase account isolation", async t => {
  const source = fs.readFileSync("app/event/[eventId].tsx", "utf8");
  const changed = source.replace("if (context !== purchaseContextRef.current) return;", "");
  assert.notEqual(changed, source);
  const d = deferred(); const h = await mount(t, { source: changed, purchase: () => d.promise });
  await h.press("event-pass-purchase-button");
  await h.account({ allowed: false, requiresPurchase: false, reason: "access_check_failed", offer: null });
  await h.resolve(d, { ok: false, access: owned, message: "Old account receipt" });
  assert.ok(h.node("event-pass-success-receipt"), "mutant reproduces stale account receipt");
});
