import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

// Real React mounts the production component and authority binding. Native image
// transport is controlled here; this is not a claim about installed-device timing.
const rootPath = path.resolve(import.meta.dirname, "..");
const baseline = "54b36c322796836f8e2d0b6b817a79f978a318d1";
const noop = () => {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const document = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: document, parentNode: null, tagName: "DIV" });
document.documentElement = container();
globalThis.document = document; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const flatten = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
const PROJECT_URL = "https://image-fixture.supabase.co";
const protectedUrl = `${PROJECT_URL}/functions/v1/profile-media-public?ownerUserId=creator&objectKey=creator/avatar/a.jpg`;
const owner = (id = "viewer-a", generation = "session-a") => ({
  authorityStatus: "active", authority: { userId: id, accountId: id, sessionGeneration: generation, state: "ACTIVE", restoreOnly: false },
  session: { user: { id }, access_token: `${id}-token` }, user: { id },
});

function harness(t, initial = {}, componentName = "StableImage") {
  const records = new Map(), modules = new Map();
  let session = owner(), order = 0, disposed = false;
  const native = { StyleSheet: { create: value => value, absoluteFill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } } };
  function host(name) {
    return function NativeHost(props) {
      const id = React.useId();
      React.useLayoutEffect(() => {
        records.set(id, { id, name, props, order: order++ });
        return () => records.delete(id);
      });
      return React.createElement(React.Fragment, null, ...React.Children.toArray(props.children).filter(React.isValidElement));
    };
  }
  for (const name of ["Image", "Pressable", "Text", "View"]) native[name] = host(name);
  native.Image.resolveAssetSource = value => typeof value === "number" ? { uri: `asset:${value}` } : value;
  const Skeleton = host("Skeleton");
  function load(file) {
    if (modules.has(file)) return modules.get(file);
    const source = process.env.STABLE_IMAGE_TEST_BASELINE === "1" && ["components/ui/StableImage.tsx", "components/ui/ProfileMediaImage.tsx"].includes(file)
      ? execFileSync("git", ["show", `${baseline}:${file}`], { cwd: rootPath, encoding: "utf8" })
      : readFileSync(path.join(rootPath, file), "utf8");
    const exports = {};
    const context = { exports, URL, console, require(name) {
      if (name === "react") return React;
      if (name === "react-native") return native;
      if (name === "./Skeleton") return { Skeleton };
      if (name === "../../_lib/session") return { useOptionalSession: () => session };
      if (name === "../../_lib/supabase") return { SUPABASE_URL: PROJECT_URL };
      if (name === "./tokens") return load("components/ui/tokens.ts");
      if (name === "./ProfileMediaImage") return load("components/ui/ProfileMediaImage.tsx");
      if (name === "../../_lib/profileMediaImageAuthority") return load("_lib/profileMediaImageAuthority.ts");
      throw new Error(`Unexpected import ${name}`);
    } };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true,
    } }).outputText, context, { filename: file });
    modules.set(file, exports); return exports;
  }
  const Component = load(`components/ui/${componentName}.tsx`)[componentName];
  const root = createRoot(container());
  let props = { expectedWidth: 80, expectedHeight: 80, source: { uri: "https://cdn.example/avatar-a.jpg" }, ...initial };
  const act = callback => React.act(async () => { await callback(); });
  const render = () => act(() => root.render(React.createElement(Component, props)));
  const byName = name => [...records.values()].filter(item => item.name === name).sort((a, b) => a.order - b.order);
  const unmount = async () => { if (!disposed) { disposed = true; await act(() => root.unmount()); } };
  t.after(unmount);
  return {
    act, render, unmount, records, byName,
    images: () => byName("Image"), skeletons: () => byName("Skeleton"), retries: () => byName("Pressable"),
    async change(changes) { props = { ...props, ...changes }; await render(); },
    async authority(value) { session = value; await render(); },
    async event(image, callback, event = { nativeEvent: { source: { uri: image.props.source?.uri } } }) {
      await act(() => image.props[callback]?.(event));
    },
    async retry() { const button = byName("Pressable")[0]; assert.ok(button, "error exposes a retry action"); let stopped = false; await act(() => button.props.onPress({ stopPropagation: () => { stopped = true; } })); assert.equal(stopped, true, "retry must not activate the enclosing media card"); },
  };
}

const visible = image => (flatten(image.props.style).opacity ?? 1) !== 0;
const onlyImage = h => { assert.equal(h.images().length, 1); return h.images()[0]; };

test("cold delayed load leaves the native image visible above its loading placeholder", async t => {
  const h = harness(t); await h.render(); const image = onlyImage(h);
  assert.equal(visible(image), true, "a cached/native-ready bitmap must never be hidden pending JS events");
  assert.equal(image.props.fadeDuration, 0);
  assert.equal(h.skeletons().length, 1, "network loading remains deliberate");
  assert.ok(h.skeletons()[0].order < image.order, "placeholder is behind, not over, the image");
  await h.event(image, "onLoadStart");
  assert.equal(h.skeletons().length, 1);
  await h.event(image, "onLoadEnd");
  assert.equal(h.skeletons().length, 1, "end alone is not evidence of successful pixels");
  await h.event(image, "onLoad");
  assert.equal(h.skeletons().length, 0);
});

test("successful warm refetch preserves the mounted native view and never returns to a placeholder", async t => {
  const h = harness(t); await h.render(); const image = onlyImage(h);
  await h.event(image, "onLoad");
  await h.change({ source: { uri: image.props.source.uri }, expectedWidth: 96 });
  assert.equal(onlyImage(h).id, image.id);
  assert.equal(visible(onlyImage(h)), true);
  assert.equal(h.skeletons().length, 0);
  assert.equal(flatten(h.byName("View").at(-1).props.style).width, 96);
});

test("warm navigation remount does not hide a bitmap available from the native cache", async t => {
  const first = harness(t); await first.render(); await first.event(onlyImage(first), "onLoad"); await first.unmount();
  const next = harness(t); await next.render(); const image = onlyImage(next);
  assert.equal(visible(image), true, "before the delayed JS load callback, native can already paint cache pixels");
  assert.ok(next.skeletons()[0].order < image.order);
});

test("recycled source clears readiness synchronously and ignores retired callbacks", async t => {
  const calls = [];
  const h = harness(t, { onLoad: () => calls.push("load"), onError: () => calls.push("error"), onLoadEnd: () => calls.push("end") });
  await h.render(); const old = onlyImage(h); await h.event(old, "onLoad"); calls.length = 0;
  await h.change({ source: { uri: "https://cdn.example/avatar-b.jpg" } });
  const current = onlyImage(h);
  assert.notEqual(current.id, old.id, "old pixels cannot survive a recycled identity");
  assert.equal(h.skeletons().length, 1);
  for (const callback of ["onLoad", "onLoadEnd", "onError"]) await h.event(old, callback);
  assert.deepEqual(calls, []);
  assert.equal(onlyImage(h).id, current.id);
  assert.equal(h.skeletons().length, 1);
  await h.event(current, "onLoad"); assert.equal(h.skeletons().length, 0);
});

test("onError is terminal for that attempt; onLoadEnd and late success cannot mask it", async t => {
  const calls = [];
  const h = harness(t, { onError: () => calls.push("error"), onLoad: () => calls.push("load"), onLoadEnd: () => calls.push("end") });
  await h.render(); const image = onlyImage(h);
  await h.event(image, "onError"); await h.event(image, "onLoadEnd"); await h.event(image, "onLoad");
  assert.equal(h.images().length, 0); assert.equal(h.skeletons().length, 0);
  assert.equal(h.retries()[0]?.props.accessibilityLabel, "Retry image");
  assert.deepEqual(calls, ["error", "end"]);
});

test("retry remounts a failed same-URI request and rejects late events from the failure", async t => {
  let retries = 0;
  const h = harness(t, { onRetry: () => { retries += 1; } }); await h.render(); const failed = onlyImage(h);
  await h.event(failed, "onError"); await h.retry();
  const current = onlyImage(h); assert.notEqual(current.id, failed.id); assert.equal(retries, 1);
  assert.equal(current.props.source.uri, failed.props.source.uri); assert.equal(h.skeletons().length, 1);
  await h.event(failed, "onError"); await h.event(failed, "onLoad");
  assert.equal(onlyImage(h).id, current.id); assert.equal(h.skeletons().length, 1);
  await h.event(current, "onLoad"); assert.equal(h.retries().length, 0); assert.equal(h.skeletons().length, 0);
});

test("external retryKey recovers the same URI after network recovery", async t => {
  const h = harness(t); await h.render(); const failed = onlyImage(h); await h.event(failed, "onError");
  await h.change({ retryKey: 1 }); const next = onlyImage(h);
  assert.notEqual(next.id, failed.id); await h.event(next, "onLoad"); assert.equal(h.skeletons().length, 0);
});

test("missing and removed images have a static fallback and no outstanding image", async t => {
  const h = harness(t, { source: null, fallback: "Missing image" }); await h.render();
  assert.equal(h.images().length, 0); assert.equal(h.skeletons().length, 0); assert.equal(h.retries().length, 0);
  await h.change({ source: { uri: "https://cdn.example/a.jpg" } }); const old = onlyImage(h);
  await h.event(old, "onLoad"); await h.change({ source: undefined });
  await h.event(old, "onLoad"); assert.equal(h.images().length, 0); assert.equal(h.skeletons().length, 0);
  assert.ok(h.byName("View").some(item => item.props.children === "Missing image"));
});

test("explicit versioned identity retains the same successful native bitmap through signed URL renewal", async t => {
  const h = harness(t, { identityKey: "viewer-a:session-a:asset-a:version-1", source: { uri: "https://cdn.example/a.jpg?signature=first" }, style: { backgroundColor: "black", opacity: 0.9 } });
  await h.render(); const first = onlyImage(h); await h.event(first, "onLoad");
  await h.change({ source: { uri: "https://cdn.example/a.jpg?signature=renewed" } });
  assert.equal(h.images().length, 2); const [retained, pending] = h.images();
  assert.equal(retained.id, first.id); assert.equal(visible(retained), true); assert.equal(visible(pending), false);
  assert.equal(h.skeletons().length, 0); assert.equal(retained.props.importantForAccessibility, "no-hide-descendants");
  await h.event(first, "onError"); assert.equal(h.images().length, 2);
  await h.event(pending, "onLoad"); const ready = onlyImage(h);
  assert.equal(ready.id, pending.id); assert.equal(visible(ready), true); assert.equal(flatten(ready.props.style).opacity, 0.9);
});

test("multiple signed-URL races retain only the last success and ignore intermediate response", async t => {
  const h = harness(t, { identityKey: "scope:asset:version" }); await h.render(); const first = onlyImage(h); await h.event(first, "onLoad");
  await h.change({ source: { uri: "https://cdn.example/a.jpg?signature=second" } }); const second = h.images()[1];
  await h.change({ source: { uri: "https://cdn.example/a.jpg?signature=third" } }); const third = h.images()[1];
  assert.equal(h.images()[0].id, first.id); assert.notEqual(third.id, second.id);
  for (const callback of ["onLoad", "onLoadEnd", "onError"]) await h.event(second, callback);
  assert.equal(h.images().length, 2); await h.event(third, "onLoad"); assert.equal(onlyImage(h).id, third.id);
});

test("signed URL failure clears retained content and retry can obtain a fresh URL", async t => {
  const h = harness(t, { identityKey: "scope:asset:version" }); await h.render(); await h.event(onlyImage(h), "onLoad");
  await h.change({ source: { uri: "https://cdn.example/a.jpg?signature=expired" } });
  await h.event(h.images()[1], "onError"); assert.equal(h.images().length, 0); assert.equal(h.skeletons().length, 0);
  await h.change({ source: { uri: "https://cdn.example/a.jpg?signature=fresh" } });
  const fresh = onlyImage(h); assert.equal(h.skeletons().length, 1); await h.event(fresh, "onLoad"); assert.equal(h.skeletons().length, 0);
});

for (const change of [{ identityKey: "other-viewer:asset:version" }, { identityKey: "scope:other-asset:version" }, { identityKey: "scope:asset:new-version" }, { source: null }]) {
  test(`retention clears on scope/asset/version/removal change ${JSON.stringify(change)}`, async t => {
    const h = harness(t, { identityKey: "scope:asset:version" }); await h.render(); const old = onlyImage(h); await h.event(old, "onLoad");
    await h.change({ source: { uri: "https://cdn.example/a.jpg?signature=next" } });
    await h.change(change);
    assert.ok(h.images().every(image => image.id !== old.id));
    await h.event(old, "onError"); assert.equal(h.retries().length, 0);
  });
}

test("same-session profile token renewal keeps prior pixels but still uses authority-bound cache reload", async t => {
  const h = harness(t, { source: { uri: protectedUrl, cache: "force-cache", headers: { Authorization: "caller-token" } } });
  await h.render(); const first = onlyImage(h); assert.equal(first.props.source.cache, "reload");
  assert.equal(first.props.source.headers.Authorization, "Bearer viewer-a-token"); await h.event(first, "onLoad");
  const renewed = owner(); renewed.session.access_token = "refreshed-token"; await h.authority(renewed);
  assert.equal(h.images().length, 2); assert.equal(h.images()[0].id, first.id);
  const pending = h.images()[1]; assert.equal(pending.props.source.headers.Authorization, "Bearer refreshed-token");
  assert.equal(pending.props.source.cache, "reload"); assert.equal(h.skeletons().length, 0);
  await h.event(pending, "onLoad"); assert.equal(onlyImage(h).id, pending.id);
});

for (const [label, authority] of [
  ["another user", owner("viewer-b", "session-b")],
  ["new session", owner("viewer-a", "session-new")],
  ["sign-out", null],
  ["restricted", { ...owner(), authorityStatus: "restricted", authority: { ...owner().authority, state: "RESTRICTED" } }],
  ["restore-only", { ...owner(), authority: { ...owner().authority, restoreOnly: true } }],
]) test(`protected identity boundary invalidates pixels and stale callbacks on ${label}`, async t => {
  let callbackCount = 0;
  const h = harness(t, { identityKey: "caller-key-cannot-override-authority", source: { uri: protectedUrl }, onError: () => { callbackCount += 1; } });
  await h.render(); const old = onlyImage(h); await h.event(old, "onLoad");
  await h.authority(authority); const current = onlyImage(h); assert.notEqual(current.id, old.id);
  await h.event(old, "onError"); assert.equal(callbackCount, 0); assert.equal(onlyImage(h).id, current.id);
  assert.equal(h.skeletons().length, 1); assert.equal(current.props.source.cache, "reload");
  if (!authority || label === "restricted" || label === "restore-only") assert.equal(current.props.source.headers?.Authorization, undefined);
});

test("unbound authorization header changes do not retain another authorization's image", async t => {
  const h = harness(t, { source: { uri: "https://private-cdn.example/image", headers: { Authorization: "first" } } });
  await h.render(); const first = onlyImage(h); await h.event(first, "onLoad");
  await h.change({ source: { uri: first.props.source.uri, headers: { Authorization: "second" } } });
  assert.notEqual(onlyImage(h).id, first.id); assert.equal(h.skeletons().length, 1);
});

test("native source alternatives, asset IDs, dimensions, styling and callbacks survive", async t => {
  const calls = [];
  const h = harness(t, { source: 17, borderRadius: 8, expectedHeight: "100%", expectedWidth: 120, resizeMode: "contain", fadeDuration: 20,
    containerStyle: { backgroundColor: "#123456" }, style: { tintColor: "white" }, testID: "test-image", onLoadStart: () => calls.push("start"), onLoad: () => calls.push("load"), onLoadEnd: () => calls.push("end") });
  await h.render(); const asset = onlyImage(h);
  assert.equal(asset.props.source, 17); assert.equal(asset.props.resizeMode, "contain"); assert.equal(asset.props.fadeDuration, 20);
  assert.equal(asset.props.testID, "test-image"); assert.equal(flatten(asset.props.style).tintColor, "white"); assert.equal(flatten(asset.props.style).borderRadius, 8);
  assert.equal(flatten(h.byName("View").at(-1).props.style).backgroundColor, "#123456");
  for (const callback of ["onLoadStart", "onLoad", "onLoadEnd"]) await h.event(asset, callback);
  assert.deepEqual(calls, ["start", "load", "end"]);
  await h.change({ source: [{ uri: "https://cdn.example/small.jpg", width: 32 }, { uri: "https://cdn.example/large.jpg", width: 64 }] });
  assert.equal(onlyImage(h).props.source.length, 2); assert.notEqual(onlyImage(h).id, asset.id);
});

test("unmounted load, error and retry callbacks cannot update state or call consumers", async t => {
  const calls = [];
  const h = harness(t, { onError: () => calls.push("error"), onLoad: () => calls.push("load"), onLoadEnd: () => calls.push("end"), onRetry: () => calls.push("retry") });
  await h.render(); const image = onlyImage(h); await h.event(image, "onError"); const button = h.retries()[0]; calls.length = 0;
  await h.unmount();
  for (const callback of ["onError", "onLoad", "onLoadEnd"]) await h.event(image, callback);
  if (button) await h.act(() => button.props.onPress({ stopPropagation() {} }));
  assert.deepEqual(calls, []);
});

test("raw ProfileMediaImage has no forced Android fade and preserves caller fade, authority and source", async t => {
  const h = harness(t, { source: { uri: protectedUrl, cache: "force-cache" } }, "ProfileMediaImage");
  await h.render(); const image = onlyImage(h);
  assert.equal(image.props.fadeDuration, 0);
  assert.equal(image.props.source.cache, "reload");
  assert.equal(image.props.source.headers.Authorization, "Bearer viewer-a-token");
  await h.change({ fadeDuration: 75 }); assert.equal(onlyImage(h).props.fadeDuration, 75);
  await h.authority(null); assert.notEqual(onlyImage(h).id, image.id);
  assert.equal(onlyImage(h).props.source.headers?.Authorization, undefined);
});
