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
const clone = value => JSON.parse(JSON.stringify(value));
function load(file, bindings, extra = {}) {
  const scope = { exports: {}, Error, Uint8Array, crypto: webcrypto, setTimeout, clearTimeout, ...extra, require(name) { if (name.endsWith(".png")) return 1; assert.ok(name in bindings, `Unmodeled dependency ${file}: ${name}`); return bindings[name]; } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file, import.meta.url), "utf8"), { fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText, scope, { filename: file }); return scope.exports;
}
function fixture({ initial = A, platform = "ios", memory = new Map(), strict = false, nativeConfig = "b".repeat(64), mode = "test_store_v3", clockNow = null, remote = { upload: clone(upload), resource: clone(resource), offer: null, transfer: null, recorded: false } } = {}) {
  // Keep the synthetic upload and every participating boundary on one clock.
  // Real captured envelopes supply their own explicit observation time below.
  const now = () => clockNow ?? Date.parse("2026-11-07T12:00:00Z");
  class Clock extends Date { static now() { return now(); } }
  let losePut = false, losePost = false; let current = initial, nodes = [], params = {}, beforeStore = async () => {}, failStorage = false, picked = 0, requestIds = [];
  let beforeDigest = async () => {}, waitingFor = null;
  const listeners = new Set(), calls = [], navigations = [], shares = [], checkoutEntries = [];
  const authority = { getCurrentAccountSessionAuthoritySnapshot: () => current,
    sameAccountSessionAuthority: (a, b) => !!a && !!b && ["userId", "accountId", "sessionGeneration", "restoreOnly"].every(k => a[k] === b[k]),
    subscribeToAccountSessionAuthority(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const storage = { async getItem(key) { return memory.get(key) ?? null; }, async setItem(key, value) { if (failStorage) throw Error("disk"); await beforeStore(); memory.set(key, value); } };
  const primitive = name => function NativePrimitive(props) { nodes.push({ name, props }); return ["Text", "TextInput", "ActivityIndicator"].includes(name) ? null : React.createElement(React.Fragment, null, props.children); };
  const native = { Share: { async share(value) { shares.push(clone(value)); return { action: "sharedAction" }; } }, Platform: { OS: platform }, StyleSheet: { create: v => v, absoluteFillObject: {} }, ...Object.fromEntries(["ActivityIndicator", "ImageBackground", "Pressable", "ScrollView", "Text", "TextInput", "View"].map(n => [n, primitive(n)])) };
  const offerCodes = load("../_lib/isolatedPaidVideoOfferCode.ts", {});
  const api = load("../_lib/isolatedPaidVideoV2.ts", { "react-native": native, "react-native-get-random-values": {}, "./accountSessionAuthority": authority, "./paidVideoAuthoringProfile": { readPaidVideoAuthoringProfile: () => ({configId:nativeConfig,mode}) },
    "./supabase": { SUPABASE_URL: "https://isolated.invalid", SUPABASE_ANON_KEY: "public-fixture" },
    "./accountBoundSupabaseMutation": { async captureAccountBoundSupabaseMutationSubject() { return { authority: current, accessToken: "captured-fixture-token" }; } } },
  { Date: Clock, fetch: async (url, options) => { const body = JSON.parse(options.body); calls.push({ url, options, body }); return { ok: true, json: async () => respond(body) }; } });
  const secureId = api.newPaidVideoV2RequestId; api.newPaidVideoV2RequestId = () => requestIds.shift() ?? secureId();
  const journal = load("../_lib/isolatedPaidVideoV2Attempts.ts", { "@react-native-async-storage/async-storage": storage, "./isolatedPaidVideoV2": api });
  const mediaPicker = loadMediaPickerHost({React,native,host:primitive,snapshot:()=>current,subscribe:authority.subscribeToAccountSessionAuthority});
  const adapter = load("../_lib/deviceAttachmentPicker.ts", {"./mediaPickerCoordinator":mediaPicker.coordinator,
    "./userFacingErrors":load("../_lib/userFacingErrors.ts",{}),
    "expo-document-picker": { async getDocumentAsync() { picked++; return { canceled: false, assets: [{ name: "Private.mp4", uri: "file:///private/cache/file.mp4", mimeType: "video/mp4", size: bytes.length }] }; } }});
  const files = load("../_lib/isolatedPaidVideoFiles.ts", { "react-native": native, "./accountSessionAuthority": authority, "./isolatedPaidVideo": api,
    "./deviceAttachmentPicker":adapter,"./mediaPickerResources":mediaPicker.resources,
    "expo-file-system": { File: class { exists = true; size = bytes.length; async arrayBuffer() { return Uint8Array.from(bytes).buffer; } } },
    "expo-crypto": { CryptoDigestAlgorithm: { SHA256: "SHA-256" }, digest: async (algorithm, data) => { await beforeDigest(); return webcrypto.subtle.digest(algorithm, Buffer.from(data)); } } });
  const transfer = load("../_lib/isolatedPaidVideoTransfer.ts", { "./isolatedPaidVideoV2":api,"./accountSessionAuthority":authority,
    "./accountBoundSupabaseMutation":{async captureAccountBoundSupabaseMutationSubject(){return {authority:current,accessToken:"captured-fixture-token"};}},
    "./supabase":{SUPABASE_URL:"https://isolated.invalid",SUPABASE_ANON_KEY:"public-fixture"}},
    {Date:Clock,fetch:async(url,options)=>{calls.push({url,options,method:options.method});return {ok:true,json:async()=>transferRespond(options)};}});
  const transferJournal=load("../_lib/isolatedPaidVideoTransferAttempts.ts",{"@react-native-async-storage/async-storage":storage,"./isolatedPaidVideoV2":api,"./isolatedPaidVideoTransfer":transfer});
  const actions = load("../_lib/isolatedPaidVideoV2Actions.ts", { "react-native": native, "./isolatedPaidVideoOfferCode": offerCodes, "./accountSessionAuthority": authority, "./isolatedPaidVideoV2": api, "./isolatedPaidVideoV2Attempts": journal, "./isolatedPaidVideoFiles": files, "./isolatedPaidVideoTransfer":transfer,"./isolatedPaidVideoTransferAttempts":transferJournal }, {Date:Clock});
  const envelope = (body, data, status = "ok") => ({ protocol: "isolated-paid-video-v2", command: body.command, requestId: body.requestId, status, configurationDigest:"b".repeat(64), capabilityExpiresAtMs:now()+4000,
    actor: { userId: current.userId, accountId: current.accountId, sessionGeneration: current.sessionGeneration }, data });
  let respond = async body => {
    if(body.command==="upload.reserve")remote.upload={...clone(upload),title:body.payload.title,transferAvailable:true};
    if(body.command==="upload.finalize")remote.upload={...remote.upload,state:"scan_pending"};
    if(body.command==="offer.publish"){remote.offer={...clone(offer),amountMinor:body.payload.amountMinor,checkoutAvailable:true};remote.resource={...remote.resource,status:"published"};}
    const data={"capability.read":{creatorEligible:current.userId===A.userId,uploadRouteAvailable:true,transferAvailable:true,checkoutAvailable:false,profile:clone(api.PAID_VIDEO_PROFILE)},
      "studio.read":{uploads:[remote.upload],nextCursor:null},"upload.reserve":{upload:remote.upload},"upload.read":{upload:remote.upload,transfer:remote.transfer&&{requestId:remote.transfer.requestId,originalSessionId:remote.transfer.originalSessionId,configurationDigest:remote.transfer.originalConfigurationDigest}},
      "resource.read":{upload:remote.upload,resource:remote.resource,...(remote.offer?{offer:remote.offer}:{})},"upload.finalize":{upload:remote.upload},"offer.publish":{upload:remote.upload,offer:remote.offer},
      "offer.read":{offer:remote.offer??offer,...(current.userId===A.userId?{upload:remote.upload}:{})},"offer.retire":{upload:remote.upload,offer:{...(remote.offer??offer),status:"retired"}},
      "upload.recover":{recovery:{state:"unknown",originalRequestId:body.payload.originalRequestId}}}[body.command];
    assert.ok(data,body.command);return envelope(body,clone(data),body.command==="upload.recover"?"unknown":"ok");
  };
  const receipt=()=>({protocol:"scpv-object-receipt-v2",state:"recorded",...remote.transfer});
  async function transferRespond(options){
    const h=options.headers;
    if(options.method==="PUT"){
      assert.equal(createHash("sha256").update(Buffer.from(options.body)).digest("hex"),remote.upload.expectedSha256);
      assert.equal(remote.transfer,null,"Never repeat a transfer");
      remote.transfer={uploadId:remote.upload.id,userId:current.userId,originalSessionId:h["x-chillywood-auth-session"],originalConfigurationDigest:h["x-chillywood-native-configuration"],requestId:h["x-chillywood-request-id"],transferId:uuid(800),incarnation:remote.upload.incarnation,sha256:remote.upload.expectedSha256,byteLength:remote.upload.expectedByteLength,objectVersion:"fixture-version-1"};
      remote.upload={...remote.upload,transferAvailable:false};if(losePut)throw Error("lost PUT response");
      return {protocol:"scpv-transfer-v2",state:"unknown",uploadId:remote.upload.id,requestId:remote.transfer.requestId,verificationRequired:true};
    }
    assert.ok(remote.transfer,"No transfer exists");assert.equal(h["x-chillywood-request-id"],remote.transfer.requestId);
    if(options.method==="GET"){
      if(remote.recorded)return receipt();
      return {protocol:"scpv-upload-probe-v2",state:"observed",signature:"c".repeat(64),observationRaw:JSON.stringify({protocol:"scpv-object-observation-v2",...remote.transfer,sessionId:h["x-chillywood-auth-session"],configurationDigest:h["x-chillywood-native-configuration"],verifierId:uuid(801),checkedAtMs:now(),expiresAtMs:now()+25000})};
    }
    assert.equal(options.method,"POST");const body=JSON.parse(options.body);assert.equal(body.protocol,"scpv-reconcile-v2");assert.equal(JSON.parse(body.observationRaw).requestId,remote.transfer.requestId);
    remote.recorded=true;if(losePost)throw Error("lost reconcile response");return receipt();
  }
  const ui = load("../components/monetization/isolated-paid-video-v2-screens.tsx", { react: React, "react-native": native,
    "../../hooks/useMediaPicker":mediaPicker,
    "react-native-safe-area-context": { SafeAreaView: primitive("SafeAreaView") }, "expo-router": { useLocalSearchParams: () => params, useRouter: () => ({ push: p => navigations.push(p), replace: p => navigations.push(p), canGoBack: () => false }) },
    "../../_lib/session": { useSession: () => ({ user: current ? { id: current.userId } : null, authority: current && { ...current }, isLoading: false }) },
    "../../_lib/isolatedPaidVideoV2Actions": actions, "../navigation/app-back-button": { AppBackButton: primitive("AppBackButton") },
    "../../_lib/isolatedPaidVideoOfferCode": offerCodes,
    "../../_lib/paidVideoAuthoringProfile": { readPaidVideoAuthoringProfile: () => ({ mode, configId: nativeConfig }) },
    "./isolated-test-store-v3-checkout": { IsolatedTestStoreV3Checkout: props => { checkoutEntries.push(props); return null; } },
     });
  const root = createRoot(container()); const visible = () => nodes.slice(Math.max(0, nodes.findLastIndex(n => n.name === "ImageBackground")));
  const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(done => setImmediate(done)); };
  const f = { memory, remote, calls, shares, checkoutEntries, offerCodes, transfers:()=>transferJournal.createIsolatedPaidVideoTransferJournal({userId:initial.userId,storage}),losePut(){losePut=true;},losePost(){losePost=true;},scanClear(){remote.upload={...remote.upload,state:"clean",bytesClean:true,moderation:"clear"};}, navigations, api, journal: () => journal.createIsolatedPaidVideoV2AttemptJournal({ userId: initial.userId, storage }), envelope,
    async render(page, next = params) { params = next; nodes = []; await React.act(async () => { const element = React.createElement(ui.IsolatedPaidVideoV2Screen, { page }); root.render(strict ? React.createElement(React.StrictMode, null, element) : element); await settle(); }); },
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

async function reserve(f) { await f.render("studio"); await f.input("paid-video-title", upload.title); await f.press("paid-video-select"); await f.press("paid-video-reserve"); }
async function openUpload(f) { await f.render("upload", { uploadId: upload.id }); await f.press("paid-video-select-transfer"); }
test("creator shares only a current published sandbox identity and a free buyer opens its authenticated checkout entry", async t => {
  for (const mode of ["test_store_v3", "native"]) {
  const creator = fixture({ mode, remote: { upload: clone(upload), resource: { ...resource, status: "published" }, offer: { ...clone(offer), checkoutAvailable: mode !== "native" }, transfer: null, recorded: false } });
  t.after(() => creator.dispose()); await creator.render("offer", { offerId: offer.id });
  if (mode === "native") { assert.equal(creator.node("paid-video-native-store-quote"), undefined); assert.match(creator.text(), /Your own account cannot buy this video/u); }
  await creator.press("paid-video-share-offer"); assert.equal(creator.shares.length, 1);
  const shared = creator.shares[0]; assert.equal(shared.message, `chillywood-sandbox-video-v3:${offer.id}`);
  assert.deepEqual(Object.keys(shared).sort(), ["message", "title"]); assert.doesNotMatch(JSON.stringify(shared), /https:|Bearer|sha256|incarnation|grant|price|bucket/u);
  const buyer = fixture({ mode, initial: B, remote: creator.remote }); t.after(() => buyer.dispose()); await buyer.render("home");
  assert.match(buyer.text(), /Buyers do not need Premium/u); await buyer.input("paid-video-offer-code", shared.message);
  assert.equal(buyer.node("paid-video-open-offer-code").props.accessibilityRole, "button"); await buyer.press("paid-video-open-offer-code");
  assert.deepEqual(buyer.navigations, [`/sandbox-videos/offer/${offer.id}`]);
  assert.equal(buyer.calls.some(c => c.body?.command === "offer.read" && c.body.payload.offerId === offer.id), true);
  await buyer.render("offer", { offerId: offer.id });
  if (mode === "native") {
    assert.equal(buyer.checkoutEntries.length, 0);
    await buyer.press("paid-video-native-store-quote");
    assert.equal(buyer.navigations.at(-1), `/sandbox-videos/native-offer/${offer.id}`);
  } else {
    assert.equal(buyer.checkoutEntries.at(-1).offerId, offer.id);
    assert.equal(buyer.checkoutEntries.at(-1).authority.userId, B.userId);
  } assert.equal(buyer.node("paid-video-share-offer"), undefined);
  assert.equal(buyer.calls.some(c => /purchase|prepare|allocate|claim|restore/u.test(c.body?.command ?? "")), false);
  }
});
test("malformed or noncanonical sandbox offer codes never navigate or query; current unavailable offers do not start checkout", async t => {
  const f = fixture({ initial: B }); t.after(() => f.dispose()); await f.render("home"); const before = f.calls.length;
  for (const code of ["https://example.invalid/" + offer.id, offer.id.toUpperCase(), `${offer.id}?grant=x`, `chillywood-sandbox-video-v2:${offer.id}`, ` ${offer.id}/x`, `scv1_resource_${uuid(14)}`, "scv1_offer_not-a-uuid"]) {
    await f.input("paid-video-offer-code", code); assert.equal(f.node("paid-video-open-offer-code").props.disabled, true); assert.equal(f.offerCodes.parsePaidVideoOfferCode(code), null);
  }
  assert.equal(f.calls.length, before); assert.deepEqual(f.navigations, []);
  await f.input("paid-video-offer-code", f.offerCodes.formatPaidVideoOfferCode(offer.id)); await f.press("paid-video-open-offer-code");
  assert.deepEqual(f.navigations, []); assert.match(f.text(), /not currently available for sandbox checkout/u);
});
test("a stale published screen cannot share a retired offer or cross an account gap while reading publication", async t => {
  const f = fixture({ remote: { upload: clone(upload), resource: clone(resource), offer: { ...clone(offer), checkoutAvailable: true }, transfer: null, recorded: false } });
  t.after(() => f.dispose()); await f.render("offer", { offerId: offer.id }); f.remote.offer.status = "retired";
  await f.press("paid-video-share-offer"); assert.equal(f.shares.length, 0); assert.match(f.text(), /Only a current published/u);
  f.remote.offer.status = "published"; const respond = f.responder; let resume; const wait = new Promise(resolve => { resume = resolve; });
  f.respond(async body => { if (body.command === "offer.read") await wait; return respond(body); });
  await f.press("paid-video-share-offer"); await f.change(B); await f.change(A); await React.act(async () => { resume(); await new Promise(resolve => setImmediate(resolve)); }); await f.flush();
  assert.equal(f.shares.length, 0); assert.match(f.text(), /session changed/u);
});
test("mounted V3 authoring performs one durable upload, exact reconciliation, scan request and publication without client grants", async t => {
  for (const [mode,platform] of [["test_store_v3","ios"],["native","android"],["native","ios"]]) {
  const f = fixture({ strict: true, mode, platform }); t.after(() => f.dispose()); await reserve(f); assert.equal((await f.journal().list()).at(-1).state, "completed");
  await openUpload(f); assert.equal(f.node("paid-video-transfer").props.accessibilityRole, "button");
  await f.press("paid-video-transfer"); const transfer = (await f.transfers().list()).at(-1); assert.equal(transfer.state, "unknown");
  assert.equal(f.node("paid-video-transfer").props.disabled, true); assert.equal(f.node("paid-video-finalize").props.disabled, true);
  await f.press(`paid-video-verify-${transfer.requestId}`); assert.equal((await f.transfers().list()).at(-1).state, "recorded");
  assert.match(f.text(), /receipt grants no playback access/u); await f.press("paid-video-finalize"); assert.equal(f.remote.upload.state, "scan_pending");
  f.scanClear(); await f.press("paid-video-refresh"); await f.input("paid-video-price", "1.99"); await f.press("paid-video-publish");
  assert.equal(f.remote.offer.amountMinor, 199); assert.match(f.text(), /Test offer.*published/us);
  assert.equal(f.node("paid-video-checkout"), undefined); assert.deepEqual(f.calls.filter(c => c.method).map(c => c.method), ["PUT", "GET", "POST"]);
  assert.equal(f.calls.some(c => /checkout|purchase|restore/u.test(c.body?.command ?? "")), false);
  }
});
test("shared sandbox source cancellation and account replacement cannot select bytes or reserve a draft",async t=>{
  for(const platform of ["ios","android"]){
    const f=fixture({platform});t.after(()=>f.dispose());await f.render("studio");await f.input("paid-video-title",upload.title);
    const before=f.calls.length;
    await f.press("paid-video-select","cancel");assert.equal(f.picked(),0);assert.equal(f.calls.length,before);
    assert.equal(f.node("paid-video-reserve").props.disabled,true);
    await f.press("paid-video-select",null);assert.equal(f.picked(),0);
    await f.change(B);await f.change(A);await f.render("studio");
    assert.equal(f.picked(),0);assert.equal(f.calls.some(c=>c.body?.command==="upload.reserve"),false);
    assert.equal(f.node("paid-video-reserve").props.disabled,true);
  }
});
test("lost PUT survives restart and new session recovery never repeats it", async t => {
  for (const mode of ["test_store_v3","native"]) {
  const f = fixture({ mode }); await reserve(f); await openUpload(f); f.losePut(); await f.press("paid-video-transfer");
  const attempt = (await f.transfers().list()).at(-1); assert.equal(attempt.state, "unknown"); await f.dispose();
  const fresh = fixture({ mode, memory: f.memory, remote: f.remote, initial: { ...A, sessionGeneration: uuid(60) } }); t.after(() => fresh.dispose());
  await fresh.render("upload", { uploadId: upload.id }); assert.equal(fresh.node("paid-video-transfer").props.disabled, true);
  await fresh.press(`paid-video-verify-${attempt.requestId}`); const result = (await fresh.transfers().list()).at(-1);
  assert.equal(result.state, "recorded"); assert.equal(result.sessionGeneration, A.sessionGeneration); assert.equal(result.receipt.originalSessionId, A.sessionGeneration);
  assert.deepEqual(fresh.calls.filter(c => c.method).map(c => c.method), ["GET", "POST"]);
  }
});
test("new device adopts only the authoritative retained descriptor and cannot gain a fresh PUT opportunity", async t => {
  const first = fixture(); await reserve(first); await openUpload(first); first.losePut(); await first.press("paid-video-transfer");
  const original = (await first.transfers().list()).at(-1); await first.dispose();
  const next = fixture({ remote: first.remote, initial: { ...A, sessionGeneration: uuid(61) }, memory: new Map() }); t.after(() => next.dispose());
  await next.render("upload", { uploadId: upload.id }); const adopted = (await next.transfers().list()).at(-1);
  assert.equal(adopted.state, "unknown"); assert.equal(adopted.requestId, original.requestId); assert.equal(adopted.sessionGeneration, A.sessionGeneration);
  assert.equal(next.node("paid-video-transfer").props.disabled, true); await next.press(`paid-video-verify-${original.requestId}`);
  assert.equal((await next.transfers().list()).at(-1).state, "recorded"); assert.equal(next.calls.some(c => c.method === "PUT"), false);
});
test("lost reconciliation response recovers with GET and never repeats the old POST", async t => {
  const f = fixture(); t.after(() => f.dispose()); await reserve(f); await openUpload(f); await f.press("paid-video-transfer");
  const attempt = (await f.transfers().list()).at(-1); f.losePost(); await f.press(`paid-video-verify-${attempt.requestId}`);
  assert.equal((await f.transfers().list()).at(-1).state, "unknown"); assert.equal(f.remote.recorded, true);
  await f.press(`paid-video-verify-${attempt.requestId}`); assert.equal((await f.transfers().list()).at(-1).state, "recorded");
  assert.deepEqual(f.calls.filter(c => c.method).map(c => c.method), ["PUT", "GET", "POST", "GET"]);
});
test("A to B to A during transfer persistence closes the old owner before PUT", async t => {
  const f = fixture(); t.after(() => f.dispose()); await reserve(f); await openUpload(f);
  f.beforeStore(async () => { f.beforeStore(async () => {}); f.publish(B); f.publish(A); }); await f.press("paid-video-transfer");
  assert.equal(f.calls.some(c => c.method === "PUT"), false); assert.equal((await f.transfers().list()).at(-1).state, "not_applied");
  assert.match(f.text(), /session changed/u); await f.render("upload", { uploadId: upload.id }); assert.equal(f.node("paid-video-refresh").props.disabled, true);
});
test("fresh capability loss, expired upload and local storage failure each stop transfer before any raw bytes", async t => {
  for (const scenario of ["capability", "expiry", "storage"]) {
    const f = fixture(); t.after(() => f.dispose()); await reserve(f); await openUpload(f);
    if (scenario === "capability") f.remote.upload.transferAvailable = false;
    else if (scenario === "expiry") f.remote.upload.expiresAt = "2026-11-07T12:00:00Z";
    else f.failStorage();
    await f.press("paid-video-transfer"); assert.equal(f.calls.some(c => c.method === "PUT"), false);
    if (scenario !== "storage") assert.equal((await f.transfers().list()).at(-1).state, "not_applied");
  }
});
if (process.env.ISOLATED_PAID_VIDEO_V2_FIXTURE) test("mounted retained upload view consumes unchanged actual gateway responses and adopts only their exact descriptor", async t => {
  const captures = JSON.parse(fs.readFileSync(process.env.ISOLATED_PAID_VIDEO_V2_FIXTURE, "utf8")).captures;
  const retained = captures.find(c => c.input?.command === "upload.read" && c.result.data.transfer !== null && c.result.data.transfer !== undefined); assert.ok(retained);
  const resourceRead = captures.find(c => c.input?.command === "resource.read" && c.input.payload.resourceId === retained.result.data.upload.resourceId); assert.ok(resourceRead);
  const f = fixture({ initial: { ...retained.result.actor, state: "ACTIVE", restoreOnly: false }, nativeConfig: retained.input.configurationDigest,
    clockNow: Math.max(retained.result.capabilityExpiresAtMs, resourceRead.result.capabilityExpiresAtMs) }); t.after(() => f.dispose());
  // Native profile observation is modeled here; responses and request identity
  // are the unchanged actual SQL/gateway artifacts. This is not device proof.
  f.respond(body => { const entry = body.command === "upload.read" ? retained : resourceRead;
    assert.deepEqual(clone(body), entry.input); return clone(entry.result); });
  f.ids([retained.input.requestId, resourceRead.input.requestId]); await f.render("upload", { uploadId: retained.input.payload.uploadId });
  const saved = (await f.transfers().list()).at(-1); assert.ok(saved); assert.equal(saved.requestId, retained.result.data.transfer.requestId);
  assert.equal(saved.state, "unknown"); assert.equal(saved.sessionGeneration, retained.result.data.transfer.originalSessionId);
  assert.equal(saved.configurationDigest, retained.result.data.transfer.configurationDigest); assert.equal(f.node("paid-video-transfer").props.disabled, true);
  assert.doesNotMatch(f.text(), /could not be verified/u); assert.equal(f.calls.some(c => c.method === "PUT"), false);
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
