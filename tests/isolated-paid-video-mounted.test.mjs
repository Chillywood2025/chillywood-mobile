import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import { webcrypto, createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { loadMediaPickerHost } from "./helpers/media-picker-host.mjs";
const require = createRequire(import.meta.url), React = require("react"), ts = require("typescript"), { createRoot } = require("react-dom/client");
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {}, doc = { addEventListener: noop, removeEventListener: noop, defaultView: globalThis, nodeType: 9 };
const container = () => ({ addEventListener: noop, removeEventListener: noop, namespaceURI: "http://www.w3.org/1999/xhtml", nodeName: "DIV", nodeType: 1, ownerDocument: doc, parentNode: null, tagName: "DIV" });
doc.documentElement = container(); globalThis.document = doc; globalThis.window = globalThis; globalThis.HTMLIFrameElement = class {};
const uuid = n => `e0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = { userId: uuid(1), accountId: uuid(1), sessionGeneration: uuid(2), state: "ACTIVE", restoreOnly: false }, B = { ...A, userId: uuid(3), accountId: uuid(3), sessionGeneration: uuid(4) };
const bytes = Buffer.from("bounded native file adapter fixture"), hash = createHash("sha256").update(bytes).digest("hex");
const upload = { id: `scpv_upload_${uuid(10)}`, title: "Private sample", resourceId: `scv1_resource_${uuid(11)}`, assetId: `scv1_asset_${uuid(12)}`, incarnation: uuid(13),
  state: "reserved", expectedSha256: hash, expectedByteLength: bytes.length, bytesClean: false, moderation: "unreviewed", profile: "scpv-mp4-h264-aac-v1", expiresAt: "2026-11-08T00:00:00Z", transferAvailable: false, checkoutAvailable: false };
const resource = { id: upload.resourceId, creatorId: A.userId, kind: "paid_content", revision: 1, status: "draft", title: upload.title };
const offer = { id: `scv1_offer_${uuid(14)}`, resourceId: resource.id, kind: "paid_content", revision: 1, status: "published", amountMinor: 199, currency: "usd", resourceRevision: 1,
  asset: { id: upload.assetId, incarnation: upload.incarnation, sha256: hash, byteLength: bytes.length, resourceRevision: 1, profile: upload.profile }, checkoutAvailable: false };
const clone = value => JSON.parse(JSON.stringify(value)), deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
function load(file, bindings, extra = {}) {
  const scope = { exports: {}, Error, crypto: webcrypto, setTimeout, clearTimeout, ...extra, require(name) { if (name.endsWith(".png")) return 1; assert.ok(name in bindings, `Unmodeled dependency ${file}: ${name}`); return bindings[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, scope, { filename: file }); return scope.exports;
}
function fixture({ initial = A, platform = "ios", memory = new Map(), strict = false } = {}) {
  let current = initial, nodes = [], params = {}, beforeStore = async () => {}, failStorage = false, picked = 0, requestIds = [];
  let beforeDigest = async () => {}, waitingFor = null;
  const listeners = new Set(), calls = [], navigations = [];
  const authority = { getCurrentAccountSessionAuthoritySnapshot: () => current,
    sameAccountSessionAuthority: (a, b) => !!a && !!b && ["userId", "accountId", "sessionGeneration", "restoreOnly"].every(k => a[k] === b[k]),
    subscribeToAccountSessionAuthority(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const storage = { async getItem(key) { return memory.get(key) ?? null; }, async setItem(key, value) { if (failStorage) throw Error("disk"); await beforeStore(); memory.set(key, value); } };
  const primitive = name => function NativePrimitive(props) { nodes.push({ name, props }); return ["Text", "TextInput", "ActivityIndicator"].includes(name) ? null : React.createElement(React.Fragment, null, props.children); };
  const native = { Platform: { OS: platform }, StyleSheet: { create: v => v, absoluteFillObject: {} }, ...Object.fromEntries(["ActivityIndicator", "ImageBackground", "Pressable", "ScrollView", "Text", "TextInput", "View"].map(n => [n, primitive(n)])) };
  const api = load("../_lib/isolatedPaidVideo.ts", { "react-native": native, "react-native-get-random-values": {}, "./accountSessionAuthority": authority,
    "./supabase": { SUPABASE_URL: "https://isolated.invalid", SUPABASE_ANON_KEY: "public-fixture" },
    "./accountBoundSupabaseMutation": { async captureAccountBoundSupabaseMutationSubject() { return { authority: current, accessToken: "captured-fixture-token" }; } } },
  { fetch: async (url, options) => { const body = JSON.parse(options.body); calls.push({ url, options, body }); return { ok: true, json: async () => respond(body) }; } });
  const secureId = api.newPaidVideoRequestId; api.newPaidVideoRequestId = () => requestIds.shift() ?? secureId();
  const journal = load("../_lib/isolatedPaidVideoAttempts.ts", { "@react-native-async-storage/async-storage": storage, "./isolatedPaidVideo": api });
  const mediaPicker = loadMediaPickerHost({React,native,host:primitive,snapshot:()=>current,subscribe:authority.subscribeToAccountSessionAuthority});
  const adapter = load("../_lib/deviceAttachmentPicker.ts", {"./mediaPickerCoordinator":mediaPicker.coordinator,
    "./userFacingErrors":load("../_lib/userFacingErrors.ts",{}),
    "expo-document-picker": { async getDocumentAsync() { picked++; return { canceled: false, assets: [{ name: "Private.mp4", uri: "file:///private/cache/file.mp4", mimeType: "video/mp4", size: bytes.length }] }; } }});
  const files = load("../_lib/isolatedPaidVideoFiles.ts", { "react-native": native, "./accountSessionAuthority": authority, "./isolatedPaidVideo": api,
    "./deviceAttachmentPicker":adapter,"./mediaPickerResources":mediaPicker.resources,
    "expo-file-system": { File: class { exists = true; size = bytes.length; async arrayBuffer() { return Uint8Array.from(bytes).buffer; } } },
    "expo-crypto": { CryptoDigestAlgorithm: { SHA256: "SHA-256" }, digest: async (algorithm, data) => { await beforeDigest(); return webcrypto.subtle.digest(algorithm, Buffer.from(data)); } } });
  const actions = load("../_lib/isolatedPaidVideoActions.ts", { "./accountSessionAuthority": authority, "./isolatedPaidVideo": api, "./isolatedPaidVideoAttempts": journal, "./isolatedPaidVideoFiles": files });
  const envelope = (body, data, status = "ok") => ({ protocol: "isolated-paid-video-v1", command: body.command, requestId: body.requestId, status,
    actor: { userId: current.userId, accountId: current.accountId, sessionGeneration: current.sessionGeneration }, data });
  let respond = async body => {
    const data = { "capability.read": { creatorEligible: current.userId === A.userId, uploadRouteAvailable: true, transferAvailable: false, checkoutAvailable: false, profile: clone(api.PAID_VIDEO_PROFILE) },
      "studio.read": { uploads: [upload], nextCursor: null }, "upload.reserve": { upload: { ...upload, title: body.payload.title } }, "upload.read": { upload },
      "resource.read": { upload, resource }, "upload.finalize": { upload }, "offer.publish": { upload, offer }, "offer.retire": { upload, offer: { ...offer, status: "retired" } },
      "offer.read": { offer, ...(current.userId === A.userId ? { upload } : {}) },
      "upload.recover": { recovery: { state: "unknown", originalRequestId: body.payload.originalRequestId } } }[body.command];
    assert.ok(data, body.command); return envelope(body, clone(data), body.command === "upload.recover" ? "unknown" : "ok");
  };
  const ui = load("../components/monetization/isolated-paid-video-screens.tsx", { react: React, "react-native": native,
    "../../hooks/useMediaPicker":mediaPicker,
    "react-native-safe-area-context": { SafeAreaView: primitive("SafeAreaView") }, "expo-router": { useLocalSearchParams: () => params, useRouter: () => ({ push: p => navigations.push(p), replace: p => navigations.push(p), canGoBack: () => false }) },
    "../../_lib/session": { useSession: () => ({ user: current ? { id: current.userId } : null, authority: current && { ...current }, isLoading: false }) },
    "../../_lib/isolatedPaidVideoActions": actions, "../navigation/app-back-button": { AppBackButton: primitive("AppBackButton") },
    "../../_lib/isolatedTestStoreBuild": { isIsolatedTestStoreFlavor: () => false }, "../../_lib/isolatedTestStoreV2Build": { isIsolatedTestStoreV2Flavor: () => false },
    "../../_lib/isolatedTestStoreV3Build": { isIsolatedTestStoreV3Flavor: () => false }, "./isolated-paid-video-v2-screens": { IsolatedPaidVideoV2Screen: () => { throw Error("Wrong native flavor"); } } });
  const root = createRoot(container()); const visible = () => nodes.slice(Math.max(0, nodes.findLastIndex(n => n.name === "ImageBackground")));
  const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(done => setImmediate(done)); };
  const f = { memory, calls, navigations, api, journal: () => journal.createIsolatedPaidVideoAttemptJournal({ userId: initial.userId, storage }), envelope,
    async render(page, next = params) { params = next; nodes = []; await React.act(async () => { const element = React.createElement(ui.IsolatedPaidVideoScreen, { page }); root.render(strict ? React.createElement(React.StrictMode, null, element) : element); await settle(); }); },
    async press(id, source = "files") {
      const n = f.node(id); assert.ok(n, id); assert.equal(n.props.disabled, false, id);
      const before = picked;
      await React.act(async () => { n.props.onPress(); await settle(); });
      if (["paid-video-select","paid-video-select-transfer"].includes(id)) {
        assert.equal(picked,before,"shared source sheet must precede native picker");
        if (source === null) return;
        const choice=f.node(`media-source-${source}`);assert.ok(choice);
        await React.act(async()=>{choice.props.onPress();await settle();});
        if(platform==="ios")assert.equal(picked,before,"iOS native launch waits for dismissal");
        await React.act(async()=>{nodes.findLast(n=>n.name==="Modal")?.props.onDismiss();await settle();});
        await f.waitFor(() => f.node("paid-video-refresh")?.props.disabled === false, "file inspection settles");
      }
    },
    async input(id, value) { const n = f.node(id); assert.ok(n, id); await React.act(async () => { n.props.onChangeText(value); await settle(); }); },
    publish(value) { current = value; for (const fn of listeners) fn(value); },
    async change(value) { await React.act(async () => { f.publish(value); await settle(); }); },
    async waitFor(predicate, label = "expected mounted outcome") {
      waitingFor = label;
      const deadline = Date.now() + 5000;
      while (!(await predicate())) {
        assert.ok(Date.now() < deadline, label);
        await React.act(async () => { await new Promise(done => setImmediate(done)); });
      }
    },
    waitingFor: () => waitingFor, beforeDigest(fn) { beforeDigest = fn; },
    async flush() { await React.act(settle); }, async dispose() { await React.act(async () => { root.unmount(); await settle(); }); },
    node: id => visible().filter(n => n.props.testID === id).at(-1), text: () => visible().filter(n => n.name === "Text").flatMap(n => n.props.children).join("\n"),
    respond(fn) { respond = fn; }, get responder() { return respond; }, ids(ids) { requestIds = [...ids]; }, picked: () => picked,
    failStorage() { failStorage = true; }, beforeStore(fn) { beforeStore = fn; },
  }; return f;
}

test("signed-out route requires an active account and sends no authoring traffic", async t => {
  const f = fixture({ initial: null }); t.after(() => f.dispose()); await f.render("studio");
  assert.match(f.text(), /Sign in with an active account/u); assert.equal(f.calls.length, 0); await f.press("paid-video-sign-in"); assert.equal(f.navigations[0], "/(auth)/login");
});
for (const platform of ["ios", "android"]) test(`mounted ${platform} studio hashes bytes and persists the exact reservation before transport`, async t => {
  const f = fixture({ platform }); t.after(() => f.dispose()); await f.render("studio");
  assert.equal(f.node("paid-video-title").props.accessibilityLabel, "Video title"); assert.match(f.text(), /File transfer and test checkout are not connected/u);
  await f.input("paid-video-title", upload.title); await f.press("paid-video-select");
  const prior = f.responder; f.respond(async body => { if (body.command === "upload.reserve") {
    const saved = (await f.journal().list()).at(-1); assert.equal(saved.state, "prepared"); assert.equal(saved.payload.expectedSha256, hash);
    assert.equal(saved.payload.expectedByteLength, bytes.length); return f.envelope(body, { upload });
  } return prior(body); });
  await f.press("paid-video-reserve"); assert.equal((await f.journal().list()).at(-1).state, "completed");
  assert.match(f.text(), /does not establish a completed upload, purchase or playback grant/u); assert.equal(f.calls.filter(c => c.body.command === "upload.reserve").length, 1);
  assert.equal(f.calls.some(c => /purchase|checkout|restore/u.test(c.body.command)), false);
});
test("StrictMode effect replay and equivalent authority objects preserve one live screen owner", async t => {
  const f = fixture({ strict: true }); t.after(() => f.dispose()); await f.render("studio"); const before = f.calls.length;
  await f.input("paid-video-title", "A title"); await f.press("paid-video-select"); assert.equal(f.calls.length, before);
  assert.equal(f.node("paid-video-reserve").props.disabled, false); await f.press("paid-video-reserve");
  assert.equal(f.calls.filter(c => c.body.command === "upload.reserve").length, 1);
});
test("unknown mutation survives unmount/restart and only fresh read-only recovery can resolve it", async t => {
  const memory = new Map(), f = fixture({ memory }); await f.render("studio"); await f.input("paid-video-title", upload.title); await f.press("paid-video-select");
  const prior = f.responder; f.respond(body => body.command === "upload.reserve" ? Promise.reject(Error("connection lost")) : prior(body));
  await f.press("paid-video-reserve"); const old = (await f.journal().list()).at(-1); assert.equal(old.state, "unknown"); await f.dispose();
  const next = { ...A, sessionGeneration: uuid(20) }, fresh = fixture({ memory, initial: next }); t.after(() => fresh.dispose()); await fresh.render("history");
  await fresh.press(`paid-video-recover-${old.requestId}`); assert.equal((await fresh.journal().list()).at(-1).state, "unknown");
  fresh.respond(body => fresh.envelope(body, { recovery: { state: "recorded", originalRequestId: old.requestId, originalCommand: old.command,
    originalSessionGeneration: old.sessionGeneration, originalPayload: { protocol: "isolated-paid-video-v1", requestId: old.requestId, ...old.payload } }, upload }));
  await fresh.press(`paid-video-recover-${old.requestId}`); assert.equal((await fresh.journal().list()).at(-1).state, "completed");
  assert.equal(fresh.calls.filter(c => c.body.command === "upload.reserve").length, 0); assert.match(fresh.text(), /Recorded by server/u);
});
test("Auth A to B to A during durable prepare stops before fetch and permanently retires the old view", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render("studio"); await f.input("paid-video-title", upload.title); await f.press("paid-video-select");
  f.beforeStore(async () => { f.beforeStore(async () => {}); f.publish(B); f.publish(A); });
  await f.press("paid-video-reserve"); assert.equal(f.calls.some(c => c.body.command === "upload.reserve"), false);
  assert.equal((await f.journal().list()).at(-1).state, "not_applied"); assert.match(f.text(), /session changed/u); assert.equal(f.node("paid-video-refresh").props.disabled, true);
  await f.render("studio"); assert.equal(f.node("paid-video-refresh").props.disabled, true);
});
test("storage failure prevents mutation; stale press closures cannot bypass an in-flight owner", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render("studio"); await f.input("paid-video-title", upload.title); await f.press("paid-video-select");
  f.failStorage(); await f.press("paid-video-reserve"); assert.equal(f.calls.some(c => c.body.command === "upload.reserve"), false);
  const g = fixture(), pending = deferred(); t.after(() => g.dispose()); await g.render("studio"); await g.input("paid-video-title", upload.title); await g.press("paid-video-select");
  const prior = g.responder; g.respond(async body => { if (body.command !== "upload.reserve") return prior(body); await pending.promise; return g.envelope(body, { upload }); });
  const press = g.node("paid-video-reserve").props.onPress; await React.act(async () => { press(); press(); }); await g.flush();
  assert.equal(g.calls.filter(c => c.body.command === "upload.reserve").length, 1); pending.resolve(); await g.flush();
});
test("free buyer can review an offer while owner retirement and checkout remain unavailable", async t => {
  const f = fixture({ initial: B }); t.after(() => f.dispose()); await f.render("offer", { offerId: offer.id });
  assert.match(f.text(), /1.99/u); assert.equal(f.node("paid-video-retire").props.disabled, true); assert.equal(f.node("paid-video-checkout").props.disabled, true);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].body.command, "offer.read");
});
test("historical clean scan cannot bypass current moderation or authorize publication", async t => {
  const f = fixture(); t.after(() => f.dispose()); f.respond(body => f.envelope(body, body.command === "upload.read"
    ? { upload: { ...upload, state: "clean", bytesClean: true, moderation: "held" } }
    : { upload: { ...upload, state: "clean", bytesClean: true, moderation: "held" }, resource }));
  await f.render("upload", { uploadId: upload.id }); await f.input("paid-video-price", "1.99");
  assert.equal(f.node("paid-video-publish").props.disabled, true); assert.equal(f.node("paid-video-transfer").props.disabled, true);
  assert.match(f.text(), /Moderation:.*held/us);
});
if (process.env.ISOLATED_PAID_VIDEO_FIXTURE) test("mounted offer and status views consume unchanged actual PostgreSQL responses through the strict transport", async t => {
  const fixtureData = JSON.parse(fs.readFileSync(process.env.ISOLATED_PAID_VIDEO_FIXTURE, "utf8"));
  for (const command of ["offer.read", "upload.recover"]) {
    const entry = fixtureData.contractCaptures.find(c => c.command === command && c.response.status === "ok"); assert.ok(entry, command);
    const initial = { ...entry.response.actor, state: "ACTIVE", restoreOnly: false }, f = fixture({ initial }); t.after(() => f.dispose());
    f.ids([entry.payload.requestId]); f.respond(body => { assert.equal(body.requestId, entry.payload.requestId); assert.equal(body.command, command); return clone(entry.response); });
    await f.render(command === "offer.read" ? "offer" : "status", command === "offer.read" ? { offerId: entry.payload.offerId } : { requestId: entry.payload.originalRequestId });
    assert.equal(f.calls.length, 1); assert.doesNotMatch(f.text(), /could not be verified/u);
    if (command === "offer.read") assert.match(f.text(), /Test offer/u); else assert.match(f.text(), /server recorded/u);
  }
});

test("file selection waits for delayed digest and durable preparation waits for storage", async t => {
  const f = fixture(); t.after(() => f.dispose()); await f.render("studio"); await f.input("paid-video-title", upload.title);
  let releaseDigest, enteredDigest = false;
  const digestGate = new Promise(resolve => { releaseDigest = resolve; });
  f.beforeDigest(async () => { enteredDigest = true; await digestGate; });
  const selection = f.press("paid-video-select");
  // Drain independently of React.act to avoid overlapping act scopes.
  const deadline = Date.now() + 5000;
  while (!enteredDigest || f.waitingFor() !== "file inspection settles") { assert.ok(Date.now() < deadline, "digest starts"); await new Promise(resolve => setImmediate(resolve)); }
  assert.equal(f.calls.some(c => c.body?.command === "upload.reserve"), false);
  releaseDigest(); await selection;
  assert.equal(f.node("paid-video-reserve").props.disabled, false);
  let releaseStore, enteredStore = false;
  const storeGate = new Promise(resolve => { releaseStore = resolve; });
  f.beforeStore(async () => { enteredStore = true; await storeGate; });
  const reserve = f.press("paid-video-reserve");
  const storeDeadline = Date.now() + 5000;
  while (!enteredStore) { assert.ok(Date.now() < storeDeadline, "storage starts"); await new Promise(resolve => setImmediate(resolve)); }
  assert.equal(f.calls.some(c => c.body?.command === "upload.reserve"), false, "no fetch before durable storage");
  await reserve;
  assert.equal(f.calls.some(c => c.body?.command === "upload.reserve"), false);
  releaseStore();
  await f.waitFor(async () => (await f.journal().list()).at(-1)?.state === "completed", "durable reservation completes");
  assert.equal(f.calls.filter(c => c.body?.command === "upload.reserve").length, 1);
});
