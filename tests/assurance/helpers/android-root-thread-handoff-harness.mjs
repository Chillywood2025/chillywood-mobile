import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createHash } from "node:crypto";
import React from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";
import * as provenance from "../../../_lib/nativeCallTransitionProvenance.mjs";
import * as routes from "../../../_lib/chillyChatNativeCallRoutes.mjs";

// Execute the complete production root component and native-buffer module.
// The native store, OS events, auth hook and router transport are controlled;
// this does not launch an Android Activity, Expo navigation, or receive FCM.
const settle = async () => { for (let index = 0; index < 160; index += 1) await Promise.resolve(); };
const noop = () => {};
const rootSource = fs.readFileSync("app/_layout.tsx", "utf8");
const ast = ts.createSourceFile("app/_layout.tsx", rootSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "AndroidNativeCallRouteBridge");
assert.ok(declaration, "actual Android root route component must exist");

function compile(source, filename, modules) {
  const module = { exports: {} };
  const code = ts.transpileModule(source, { fileName: filename, compilerOptions: {
    esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  vm.runInNewContext(code, { module, exports: module.exports, console, URL, globalThis,
    require: name => {
      assert.ok(Object.hasOwn(modules, name), `unmodeled Android root boundary: ${name}`);
      return modules[name];
    } }, { filename });
  return module.exports;
}

function container() {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
  const element = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml",
    nodeName: "DIV", nodeType: 1, ownerDocument: doc, parentNode: null, tagName: "DIV" });
  doc.documentElement = element(); globalThis.document = doc; globalThis.window = globalThis;
  globalThis.HTMLIFrameElement = class {};
  return element();
}

export const androidIds = Object.freeze({
  user: "81000000-0000-4000-8000-000000000001",
  other: "81000000-0000-4000-8000-000000000002",
  thread: "81000000-0000-4000-8000-000000000003",
  invite: "81000000-0000-4000-8000-000000000004",
});
export function androidAction(overrides = {}) {
  const payload = { schemaVersion: 2, captureGeneration: 1, createdAt: Date.now(),
    threadId: androidIds.thread, callInviteId: androidIds.invite, nativeCallAction: "answer", ...overrides };
  return { ...payload, requestKey: createHash("sha256")
    .update(`${payload.threadId}:${payload.callInviteId}:${payload.nativeCallAction}`).digest("hex") };
}

export async function mountAndroidRoot(t, options = {}) {
  provenance.clearNativeCallTransitionClaims("android");
  const pending = [...(options.pending ?? [])];
  const events = new Map();
  const appListeners = new Set();
  const attempts = [], destinations = [], errors = [];
  const state = { isLoading: false, isSignedIn: true, user: { id: androidIds.user }, ...options.session };
  const AppState = { currentState: options.appState ?? "active", addEventListener: (_name, listener) => {
    appListeners.add(listener); return { remove: () => appListeners.delete(listener) };
  } };
  const native = { consumePendingNativeCallAction: async () => {
    attempts.push(state.user?.id ?? null);
    const next = pending.shift(); return typeof next === "function" ? next() : next;
  } };
  const platform = { OS: "android" };
  const reactNative = { Platform: platform, AppState, NativeModules: { ChillyChatCallNotifications: native },
    DeviceEventEmitter: { addListener: (name, listener) => {
      if (!events.has(name)) events.set(name, new Set());
      events.get(name).add(listener); return { remove: () => events.get(name).delete(listener) };
    } } };
  const buffer = compile(fs.readFileSync("_lib/chillyChatNativeCallRouteBuffer.ts", "utf8"),
    "_lib/chillyChatNativeCallRouteBuffer.ts", { "react-native": reactNative,
      "./chillyChatNativeCallRoutes.mjs": routes, "./nativeCallTransitionProvenance.mjs": provenance });
  const router = { replace: destination => {
    if (options.rejectNavigation) throw Error("controlled router rejection");
    destinations.push(destination);
  } };
  let body = declaration.getText(ast);
  if (options.mutateRoot) body = options.mutateRoot(body);
  const Root = compile(`
    import { useEffect } from "react";
    import { AppState, Platform } from "react-native";
    import { useRouter } from "expo-router";
    import { useSession } from "session";
    import { reportRuntimeError } from "logger";
    import { clearPendingAndroidNativeCallRouteClaims, consumePendingAndroidNativeCallRoute,
      subscribeToPendingAndroidNativeCallActionAvailability } from "buffer";
    import { consumeTrustedAndroidNativeActionStoreClaim } from "provenance";
    ${body}
    export { AndroidNativeCallRouteBridge };`, "app/_layout.tsx", {
    react: React, "react-native": reactNative, "expo-router": { useRouter: () => router },
    session: { useSession: () => state }, logger: { reportRuntimeError: (scope, error) => errors.push({ scope, message: error.message }) },
    buffer, provenance,
  }).AndroidNativeCallRouteBridge;
  const root = createRoot(container());
  const run = async fn => { let value; await React.act(async () => { value = await fn(); await settle(); }); return value; };
  await run(() => root.render(React.createElement(Root)));
  t.after(async () => { await run(() => root.unmount()); provenance.clearNativeCallTransitionClaims("android"); });
  return { destinations, attempts, errors, pending, state,
    run,
    emit: () => run(() => { for (const listener of events.get("pendingNativeCallActionAvailable") ?? []) listener(); }),
    appState: next => run(() => { AppState.currentState = next; for (const listener of appListeners) listener(next); }),
    rerender: patch => run(() => { Object.assign(state, patch); root.render(React.createElement(Root)); }),
  };
}
