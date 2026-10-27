import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import React from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: doc, parentNode: null, tagName: "DIV" });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const textOf = node => Array.isArray(node) ? node.map(textOf).join(" ") : node == null || typeof node === "boolean" ? "" : typeof node !== "object" ? String(node) : textOf(node.props?.children);
const load = (file, imports, source = fs.readFileSync(file, "utf8")) => {
  const context = { exports: {}, Date, Intl, Promise, require: name => { assert.ok(name in imports, `unexpected import ${name}`); return imports[name]; } };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, context);
  return context.exports;
};
const wallet = load("_lib/creatorPurchases.ts", { "./accountBoundSupabaseMutation": {}, "./accountSessionAuthority": {}, "./creatorMoneyPurchaseAuthority": {}, "./revenuecat": {} });
const purchase = (id = "one", status = "upcoming", changes = {}) => ({ id, purchaseIntentId: id, sourceType: "event", sourceId: "exact-event", creatorId: "creator", productType: "event_pass", productKey: "event", title: "Sunday show", status,
  amountMinor: 299, currency: "usd", createdAt: "2026-10-26T16:30:00Z", purchasedAt: "2026-10-26T16:30:00Z", startsAt: "2026-11-01T20:00:00Z", expiresAt: null, provider: "revenuecat_google_play", environment: "sandbox",
  destination: { kind: "creator_event", id: "exact-event" }, receipt: null, terms: { timeZone: "America/New_York", replayPolicy: "none" }, termsAvailable: true, grantsAccess: false, ...changes });
const page = (items = [purchase()], extra = {}) => ({ status: "resolved", subjectUserId: "buyer", subjectSessionGeneration: "one", fetchedAt: "2026-10-26T16:30:00Z", items, nextCursor: null, ...extra });
async function mount(t, options = {}) {
  const nodes = new Map(), routes = [], reads = [];
  const userId = options.userId ?? "buyer";
  let session = { user: { id: userId }, authority: { userId, sessionGeneration: "one", restoreOnly: false }, isLoading: false };
  let reader = options.reader ?? (async () => page(options.items));
  const host = name => function NativeHost(props) {
    const id = React.useId(); nodes.set(id, { type: name, props });
    React.useEffect(() => () => nodes.delete(id), [id]);
    return React.createElement(React.Fragment, null, ...React.Children.toArray(props.children).filter(child => typeof child === "object"));
  };
  const native = { AppState: { addEventListener: () => ({ remove: noop }) }, StyleSheet: { create: x => x, absoluteFillObject: {} } };
  for (const name of ["ActivityIndicator", "Pressable", "ImageBackground", "ScrollView", "Text", "View"]) native[name] = host(name);
  const Screen = load("app/purchases.tsx", {
    react: React, "react-native": native, "react-native-safe-area-context": { SafeAreaView: host("SafeAreaView") },
    "expo-router": { useFocusEffect: callback => React.useEffect(callback, [callback]), useRouter: () => ({ canGoBack: () => false, back: () => routes.push("back"), replace: route => routes.push(route), push: route => routes.push(route) }) },
    "../_lib/session": { useSession: () => session },
    "../_lib/creatorPurchases": { ...wallet, readMyCreatorPurchases: async cursor => { reads.push(cursor); return reader(cursor); }, restoreCreatorPurchaseLibrary: options.restore ?? (async () => ({ ok: true, message: "Verified restore refreshed" })) },
    "../components/navigation/app-back-button": { AppBackButton: host("AppBackButton") },
    "../components/ui/chillywood-visual-system": { CHILLYWOOD_VISUAL: { glassBackground: "black" } },
    "../assets/images/chillywood-branded-background.png": {},
  }, options.source).default;
  const root = createRoot(container()); await React.act(async () => root.render(React.createElement(Screen)));
  t.after(() => React.act(async () => root.unmount()));
  return { routes, reads, node: id => [...nodes.values()].find(node => node.props.testID === id), text: () => [...nodes.values()].map(textOf).join(" "),
    async press(id) { const node = [...nodes.values()].find(node => node.props.testID === id); assert.ok(node, id); assert.ok(!node.props.disabled, `${id} disabled`); await React.act(async () => { void node.props.onPress(); }); },
    async account(nextReader, next = "two", nextUserId = userId) { reader = nextReader; session = { ...session, user: { id: nextUserId }, authority: { ...session.authority, userId: nextUserId, sessionGeneration: next } }; await React.act(async () => root.render(React.createElement(Screen))); },
    async resolve(d, value) { await React.act(async () => d.resolve(value)); }, setReader: next => { reader = next; },
  };
}

export { noop, container, deferred, textOf, load, wallet, purchase, page, mount };
