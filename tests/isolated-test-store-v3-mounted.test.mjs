import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import React from "react";
import { createRoot } from "react-dom/client";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import { A, B, clone, customer as defaultCustomer, digest as defaultDigest, quote as defaultQuote, registration, uuid, capturedPurchaseChain } from "./helpers/isolated-test-store-v3-fixtures.mjs";

// Real component/actions/parsers/journals; only platform, storage and transport
// boundaries are controlled here. Synthetic success is not provider evidence.
// The two capture-backed cases replay unchanged PostgreSQL response objects.

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
async function prepare(f) {
  await f.press("paid-video-v3-review"); await f.press("paid-video-v3-prepare");
  return (await f.preparations().list()).at(-1);
}
async function allocate(f) {
  const p=await prepare(f); await f.press(`paid-video-v3-allocate-${p.requestId}`); return (await f.journal().list()).at(-1);
}
async function purchase(f,a) {
  await f.press(`paid-video-v3-purchase-review-${a.intentId}`); await f.press(`paid-video-v3-purchase-${a.intentId}`);
}
for(const platform of ["ios","android"])test(`mounted ${platform} exact video quote reaches one retained Package purchase without claiming playback`,async t=>{
  const f=fixture({platform});t.after(()=>f.dispose());await f.render();await f.press("paid-video-v3-bind");
  assert.equal(f.node("paid-video-v3-prepare").props.accessibilityState.disabled,true);
  const a=await allocate(f);assert.deepEqual(clone(a.quote.asset),defaultQuote.asset);await purchase(f,a);
  assert.equal(f.nativeCalls.filter(c=>c[0]==="purchase").length,1);assert.equal((await f.journal().list())[0].observation.receipt,null);
  assert.equal(f.playback.length,0);assert.match(f.text(),/Native window:\s*completed/u);assert.match(f.text(),/historical evidence/u);
});
test("unconfigured native profile and unavailable server offer cannot start preparation",async t=>{
  const f=fixture({configured:false});t.after(()=>f.dispose());await f.render();assert.match(f.text(),/unavailable/u);assert.equal(f.calls.length,0);assert.equal(f.coreCalls.length,0);
  const g=fixture();t.after(()=>g.dispose());g.unavailable();await g.render();await g.press("paid-video-v3-bind");assert.equal(g.node("paid-video-v3-review").props.disabled,true);assert.equal(g.node("paid-video-v3-prepare").props.disabled,true);
});
test("price or immutable asset change after review requires a fresh review before any preparation",async t=>{
  const f=fixture();t.after(()=>f.dispose());await f.render();await f.press("paid-video-v3-bind");await f.press("paid-video-v3-review");
  f.changeQuote(q=>{q.asset.incarnation=uuid(800);});await f.press("paid-video-v3-prepare");assert.equal(f.coreCalls.some(c=>c.command==="prepare"),false);assert.equal(f.nativeCalls.length,0);
});
test("lost preparation survives restart and status recovery never sends the old mutation again",async t=>{
  const f=fixture();await f.render();await f.press("paid-video-v3-bind");f.losePrepare();const p=await prepare(f);assert.equal(p.attempt.state,"unknown");await f.dispose();
  const reopened=fixture({memory:f.memory,server:f.server,nativeState:f.nativeState});t.after(()=>reopened.dispose());await reopened.render();
  await reopened.press(`paid-video-v3-recover-${p.requestId}`);assert.equal((await reopened.preparations().list())[0].attempt.state,"intent_prepared");assert.equal(reopened.coreCalls.some(c=>c.command==="prepare"),false);
});
test("refused allocation can explicitly close then start a new purchase without forgetting old history",async t=>{
  const f=fixture();await f.render();await f.press("paid-video-v3-bind");f.refuseAllocation();const a=await allocate(f),p=(await f.preparations().list())[0];
  assert.equal(a.allocation,null);assert.equal(a.initiationReleased,false);assert.equal(f.node(`paid-video-v3-allocate-${p.requestId}`).props.disabled,true);
  assert.equal(f.node(`paid-video-v3-close-${p.requestId}`).props.disabled,false);await f.press(`paid-video-v3-close-${p.requestId}`);
  assert.equal((await f.journal().list())[0].initiationReleased,true);assert.equal(f.nativeCalls.length,0);await f.dispose();
  const reopened=fixture({memory:f.memory,server:f.server,nativeState:f.nativeState});t.after(()=>reopened.dispose());await reopened.render();
  const next=await allocate(reopened);assert.notEqual(next.intentId,a.intentId);assert.equal((await reopened.journal().list()).length,2);await purchase(reopened,next);
  assert.equal(reopened.nativeCalls.filter(c=>c[0]==="purchase").length,1);
});
test("lost committed allocation cannot be closed as absent, while status recovery retains its allocation",async t=>{
  const f=fixture();t.after(()=>f.dispose());await f.render();await f.press("paid-video-v3-bind");f.loseAllocation();const a=await allocate(f),p=(await f.preparations().list())[0];
  assert.equal(a.allocation,null);await f.press(`paid-video-v3-close-${p.requestId}`);
  assert.notEqual((await f.preparations().list())[0].attempt.state,"closed");assert.equal((await f.journal().list())[0].initiationReleased,false);
  await f.press(`paid-video-v3-status-${a.intentId}`);assert.ok((await f.journal().list())[0].allocation);
  assert.equal(f.node(`paid-video-v3-close-${p.requestId}`).props.disabled,true);assert.equal(f.nativeCalls.filter(c=>c[0]==="purchase").length,0);
});
test("restart repairs local release projection after server closure was durably saved",async t=>{
  const f=fixture();await f.render();await f.press("paid-video-v3-bind");f.refuseAllocation();await allocate(f);const p=(await f.preparations().list())[0];
  await f.press(`paid-video-v3-close-${p.requestId}`);await f.dispose();
  const key="@chillywood/isolated-test-store-v3/installation-journal",document=JSON.parse(f.memory.get(key));
  delete document.attempts[0].unallocatedRelease;f.memory.set(key,JSON.stringify(document));
  const reopened=fixture({memory:f.memory,server:f.server,nativeState:f.nativeState});t.after(()=>reopened.dispose());await reopened.render();
  assert.equal((await reopened.journal().list())[0].initiationReleased,true);assert.equal(reopened.coreCalls.some(c=>c.command==="abandon"),false);
  await allocate(reopened);assert.equal((await reopened.journal().list()).length,2);
});
test("lost claim and restart cannot recreate the consumed SDK opportunity",async t=>{
  const f=fixture();await f.render();await f.press("paid-video-v3-bind");const a=await allocate(f);f.loseClaim();await purchase(f,a);await f.dispose();
  const reopened=fixture({memory:f.memory,server:f.server,nativeState:f.nativeState});t.after(()=>reopened.dispose());await reopened.render();await reopened.press(`paid-video-v3-status-${a.intentId}`);
  assert.equal(reopened.node(`paid-video-v3-purchase-${a.intentId}`).props.disabled,true);assert.equal(reopened.calls.some(c=>c.command==="claim"),false);assert.equal(reopened.nativeCalls.filter(c=>c[0]==="purchase").length,0);
});
test("A to B to A while native completion is pending permanently retires old continuations",async t=>{
  const f=fixture();t.after(()=>f.dispose());await f.render();await f.press("paid-video-v3-bind");const a=await allocate(f),wait=f.holdPurchase();await purchase(f,a);
  await f.change(B);await f.change(A);await React.act(async()=>wait.resolve());await f.settle();assert.match(f.text(),/account session changed/u);assert.equal(f.nativeState.retired,true);assert.equal(f.calls.some(c=>c.command==="report"),false);
});
test("StrictMode effect replay keeps current authority usable without reviving a retired session",async t=>{
  const f=fixture({strictMode:true});t.after(()=>f.dispose());await f.render();await f.press("paid-video-v3-bind");const a=await allocate(f);await purchase(f,a);assert.equal(f.nativeCalls.filter(c=>c[0]==="purchase").length,1);
  await f.change(B);await f.change(A);assert.match(f.text(),/account session changed/u);
});
test("held provider evidence disables purchase and a historical receipt still requires current playback",async t=>{
  const f=fixture();t.after(()=>f.dispose());await f.render();await f.press("paid-video-v3-bind");const a=await allocate(f);await purchase(f,a);f.verify(a.allocation.id);
  await f.press(`paid-video-v3-status-${a.intentId}`);await f.press("paid-video-v3-refresh");assert.equal(f.playback.length,0);
  await f.press(`paid-video-v3-playback-${a.intentId}`);assert.equal(f.playback.at(-1).selection.grantId,`scv1_grant_${a.allocation.dispatchId}`);assert.equal(f.playback.at(-1).blocked,false);
  assert.deepEqual(clone(f.playback.at(-1).selection.quote.asset),defaultQuote.asset);
  f.hold();await f.press(`paid-video-v3-status-${a.intentId}`);assert.equal(f.playback.at(-1).blocked,true);assert.equal(f.node(`paid-video-v3-purchase-${a.intentId}`).props.disabled,true);
});
test("native cancellation stays unknown and never retries automatically",async t=>{
  const f=fixture();t.after(()=>f.dispose());await f.render();await f.press("paid-video-v3-bind");const a=await allocate(f);f.cancelNative();await purchase(f,a);
  assert.equal((await f.journal().list())[0].nativeInvocation.outcome,"sdk_cancelled");assert.equal((await f.journal().list())[0].observation.receipt,null);
  await f.press(`paid-video-v3-status-${a.intentId}`);assert.equal(f.nativeCalls.filter(c=>c[0]==="purchase").length,1);assert.equal(f.node(`paid-video-v3-purchase-${a.intentId}`).props.disabled,true);
});
test("current hold vetoes a fresh purchase before any SDK lookup",async t=>{
  const f=fixture();t.after(()=>f.dispose());await f.render();await f.press("paid-video-v3-bind");const a=await allocate(f);await f.press(`paid-video-v3-purchase-review-${a.intentId}`);
  f.hold();await f.press(`paid-video-v3-purchase-${a.intentId}`);assert.equal(f.nativeCalls.filter(c=>c[0]==="lookup").length,0);assert.equal(f.calls.some(c=>c.command==="claim"),false);
});
test("a pending read blocks even a retained old purchase callback",async t=>{
  const f=fixture();t.after(()=>f.dispose());await f.render();await f.press("paid-video-v3-bind");const a=await allocate(f);await f.press(`paid-video-v3-purchase-review-${a.intentId}`);
  const old=f.node(`paid-video-v3-purchase-${a.intentId}`).props.onPress,wait=f.delayRead();await f.press(`paid-video-v3-status-${a.intentId}`);
  await React.act(async()=>{old();await new Promise(resolve=>setImmediate(resolve));});assert.equal(f.calls.some(c=>c.command==="claim"),false);assert.equal(f.nativeCalls.length,0);
  await React.act(async()=>wait.resolve());await f.settle();await purchase(f,a);assert.equal(f.nativeCalls.filter(c=>c[0]==="purchase").length,1);
});
test("explicit acknowledged continuation retains unknown history and permits a distinct new intent",async t=>{
  const f=fixture();t.after(()=>f.dispose());await f.render();await f.press("paid-video-v3-bind");const a=await allocate(f);await purchase(f,a);f.advanceClock();
  await f.press(`paid-video-v3-advance-${a.intentId}`);assert.equal(f.calls.some(c=>c.command==="advance"),false);
  await f.press(`paid-video-v3-unknown-${a.intentId}`);await f.press(`paid-video-v3-advance-${a.intentId}`);
  assert.equal((await f.journal().list())[0].initiationReleased,true);assert.equal((await f.journal().list())[0].observation.receipt,null);
  const second=await allocate(f);assert.notEqual(second.intentId,a.intentId);assert.notEqual(second.allocation.registration.offeringIdentifier,a.allocation.registration.offeringIdentifier);
});
test("explicit unallocated closure alone permits replacement and allocated attempts cannot use it",async t=>{
  const f=fixture();t.after(()=>f.dispose());await f.render();await f.press("paid-video-v3-bind");const p=await prepare(f);await f.press(`paid-video-v3-close-${p.requestId}`);
  assert.equal((await f.preparations().list())[0].attempt.state,"closed");assert.equal(f.calls.some(c=>c.command==="allocate"),false);
  const next=await prepare(f);await f.press(`paid-video-v3-allocate-${next.requestId}`);assert.equal(f.node(`paid-video-v3-close-${next.requestId}`).props.disabled,true);
});
test("lost explicit closure remains unknown across restart until a new explicit exact re-ack",async t=>{
  const f=fixture();await f.render();await f.press("paid-video-v3-bind");const p=await prepare(f);f.loseClose();await f.press(`paid-video-v3-close-${p.requestId}`);assert.equal((await f.preparations().list())[0].attempt.state,"unknown");await f.dispose();
  const reopened=fixture({memory:f.memory,server:f.server,nativeState:f.nativeState});t.after(()=>reopened.dispose());await reopened.render();await reopened.press(`paid-video-v3-recover-${p.requestId}`);assert.equal((await reopened.preparations().list())[0].attempt.state,"unknown");
  assert.equal(reopened.coreCalls.some(c=>c.command==="abandon"),false);await reopened.press(`paid-video-v3-close-${p.requestId}`);assert.equal((await reopened.preparations().list())[0].attempt.state,"closed");
});
test("account change during durable preparation prevents network dispatch",async t=>{
  const f=fixture();t.after(()=>f.dispose());await f.render();await f.press("paid-video-v3-bind");await f.press("paid-video-v3-review");const wait=f.delayStorageWrite();await f.press("paid-video-v3-prepare");
  await f.change(B);await f.change(A);await React.act(async()=>wait.resolve());await f.settle();assert.equal(f.coreCalls.some(c=>c.command==="prepare"),false);assert.equal((await f.preparations().list())[0].attempt.state,"not_applied");
});
test("navigation after durable native preparation closes the exact unused Package without a claim or purchase",async t=>{
  const f=fixture();await f.render();await f.press("paid-video-v3-bind");const a=await allocate(f),wait=f.holdPrepare();await purchase(f,a);
  assert.equal(f.nativeState.invocations.get(a.allocation.dispatchId).state,"prepared");await f.dispose();await React.act(async()=>wait.resolve());await f.settle();
  assert.equal(f.calls.some(c=>c.command==="claim"),false);assert.equal(f.nativeCalls.some(c=>c[0]==="purchase"),false);
  const reopened=fixture({memory:f.memory,server:f.server,nativeState:f.nativeState});t.after(()=>reopened.dispose());await reopened.render();await purchase(reopened,a);
  assert.equal((await reopened.journal().list())[0].nativePhase,"prepared");assert.equal(reopened.node(`paid-video-v3-purchase-${a.intentId}`).props.disabled,true);
  await reopened.press(`paid-video-v3-close-native-${a.intentId}`);
  const saved=(await reopened.journal().list())[0];assert.equal(saved.nativePhase,"prepared_closed");assert.equal(saved.initiationReleased,true);
  assert.equal(reopened.nativeState.active,null);assert.equal(reopened.nativeState.handles.size,0);assert.equal((await reopened.closures().list())[0].state,"closed");
  assert.equal(reopened.calls.some(c=>c.command==="claim"),false);assert.equal(reopened.nativeCalls.some(c=>c[0]==="purchase"),false);
  const next=await allocate(reopened);assert.notEqual(next.intentId,a.intentId);assert.equal((await reopened.journal().list())[0].nativePhase,"prepared_closed");
});
test("an invoking native purchase cannot use prepared-only closure",async t=>{
  const f=fixture();t.after(()=>f.dispose());await f.render();await f.press("paid-video-v3-bind");const a=await allocate(f),wait=f.holdPurchase();await purchase(f,a);
  assert.equal(f.nativeState.invocations.get(a.allocation.dispatchId).state,"invoking");
  assert.equal(f.node(`paid-video-v3-close-native-${a.intentId}`).props.disabled,true);assert.equal(f.coreCalls.some(c=>c.command==="close_prepared"),false);
  await React.act(async()=>wait.resolve());await f.settle();
});
test("a lost successful claim permits only native closure plus explicit retained-unknown continuation",async t=>{
  const f=fixture();t.after(()=>f.dispose());await f.render();await f.press("paid-video-v3-bind");const a=await allocate(f);f.loseClaim();await purchase(f,a);
  await f.press(`paid-video-v3-status-${a.intentId}`);await f.press(`paid-video-v3-close-native-${a.intentId}`);
  let saved=(await f.journal().list())[0];assert.equal(saved.nativePhase,"prepared_closed");assert.equal(saved.initiationReleased,false);
  assert.equal((await f.closures().list())[0].state,"unknown");assert.equal(f.server.preparedClosed.size,0);assert.equal(f.nativeCalls.some(c=>c[0]==="purchase"),false);
  f.advanceClock();await f.press(`paid-video-v3-advance-${a.intentId}`);assert.equal(f.calls.some(c=>c.command==="advance"),false);
  await f.press(`paid-video-v3-unknown-${a.intentId}`);await f.press(`paid-video-v3-advance-${a.intentId}`);
  saved=(await f.journal().list())[0];assert.equal(saved.initiationReleased,true);assert.equal(saved.observation.receipt,null);assert.equal((await f.closures().list())[0].state,"unknown");
});
for(const reachesServer of [true,false])test(`lost prepared-only closure ${reachesServer?"is recovered read-only":"needs a new explicit exact re-ack"} after restart`,async t=>{
  const f=fixture();await f.render();await f.press("paid-video-v3-bind");const a=await allocate(f),wait=f.holdPrepare();await purchase(f,a);await f.dispose();await React.act(async()=>wait.resolve());await f.settle();
  const g=fixture({memory:f.memory,server:f.server,nativeState:f.nativeState});await g.render();await g.press(`paid-video-v3-status-${a.intentId}`);
  if(reachesServer)g.losePreparedClosure();else g.dropPreparedClosure();await g.press(`paid-video-v3-close-native-${a.intentId}`);
  const original=(await g.closures().list())[0];assert.equal(original.state,"unknown");await g.dispose();
  const h=fixture({memory:g.memory,server:g.server,nativeState:g.nativeState});t.after(()=>h.dispose());await h.render();
  await h.press(`paid-video-v3-recover-native-close-${original.requestId}`);assert.equal(h.coreCalls.some(c=>c.command==="close_prepared"),false);
  if(!reachesServer){assert.equal((await h.closures().list())[0].state,"unknown");await h.press(`paid-video-v3-close-native-${a.intentId}`);
    const rows=await h.closures().list();assert.equal(rows.length,2);assert.equal(rows[0].state,"unknown");assert.equal(rows[1].state,"closed");assert.notEqual(rows[1].requestId,original.requestId);assert.deepEqual(clone(rows[1].payload),clone(original.payload));}
  assert.equal((await h.journal().list())[0].initiationReleased,true);assert.equal(h.nativeCalls.some(c=>c[0]==="purchase"),false);
});
test("a fresh session recovers and closes original native preparation without reopening its purchase",async t=>{
  const f=fixture();await f.render();await f.press("paid-video-v3-bind");const a=await allocate(f),wait=f.holdPrepare();await purchase(f,a);await f.dispose();await React.act(async()=>wait.resolve());await f.settle();
  const later={...A,sessionGeneration:uuid(8800)},g=fixture({memory:f.memory,server:f.server,nativeState:f.nativeState,initial:later});t.after(()=>g.dispose());await g.render();await g.press(`paid-video-v3-status-${a.intentId}`);
  assert.equal(g.node(`paid-video-v3-purchase-${a.intentId}`).props.disabled,true);await g.press(`paid-video-v3-close-native-${a.intentId}`);
  const closed=(await g.closures().list())[0];assert.equal(closed.sessionId,later.sessionGeneration);assert.equal(closed.payload.originalSessionId,A.sessionGeneration);assert.equal(closed.nativeClosure.invocation.sessionId,A.sessionGeneration);
  assert.equal((await g.journal().list())[0].initiationReleased,true);assert.equal(g.nativeCalls.some(c=>c[0]==="lookup"||c[0]==="purchase"),false);
});
test("retained duplicate purchases resolve the selected current grant instead of the receipt grant",async t=>{
  const f=fixture();t.after(()=>f.dispose());await f.render();await f.press("paid-video-v3-bind");const a=await allocate(f);await purchase(f,a);f.verify(a.allocation.id);f.advanceClock();
  await f.press(`paid-video-v3-status-${a.intentId}`);await f.press(`paid-video-v3-advance-${a.intentId}`);const b=await allocate(f);await purchase(f,b);f.verify(b.allocation.id);
  const selected=`scv1_grant_${a.allocation.dispatchId}`;f.selectGrant(defaultQuote.resourceId,selected);await f.press("paid-video-v3-refresh");await f.press(`paid-video-v3-playback-${b.intentId}`);
  assert.notEqual(selected,`scv1_grant_${b.allocation.dispatchId}`);assert.equal(f.playback.at(-1).selection.grantId,selected);assert.equal(f.playback.at(-1).blocked,false);
  f.refund(b.allocation.id);await f.press("paid-video-v3-refresh");await f.press(`paid-video-v3-playback-${b.intentId}`);assert.equal(f.playback.at(-1).selection.grantId,selected);assert.equal(f.playback.at(-1).blocked,false);
  f.selectGrant(defaultQuote.resourceId,null);const before=f.playback.length;await f.press(`paid-video-v3-playback-${b.intentId}`);assert.equal(f.playback.length,before);assert.match(f.text(),/No current playback grant/u);
});
if(process.env.ISOLATED_PAID_VIDEO_CURRENT_GRANT_CAPTURES)test("mounted playback resolves unchanged actual PostgreSQL selected grants including refunded history",async t=>{
  const captures=JSON.parse(fs.readFileSync(process.env.ISOLATED_PAID_VIDEO_CURRENT_GRANT_CAPTURES,"utf8"));
  const cases=[captures.find(e=>e.result.data.currentGrantId&&e.result.data.currentGrantId!==e.result.data.intent.grantId&&e.result.data.intent.receipt?.state==="verified"),
    captures.find(e=>e.result.data.currentGrantId&&e.result.data.intent.receipt?.state==="refunded"),captures.find(e=>e.result.data.currentGrantId===null&&e.result.data.intent.receipt?.state==="verified")];
  for(const entry of cases){assert.ok(entry);const {actor,request}=entry.input,history=entry.result.data.intent;
    const profile={authority:{...A,userId:actor.userId,accountId:actor.userId,sessionGeneration:actor.sessionId},digest:request.configurationDigest,quote:history.quote,
      customer:{...defaultCustomer,buyerId:actor.userId,configurationDigest:request.configurationDigest}};
    const ids=[uuid(9300),request.requestId],seen=[];
    const replay=body=>{if(body.command==="history")return {protocol:"isolated-paid-video-checkout-v3",command:"history",requestId:body.requestId,actor,status:"ok",data:{intents:[history],nextCursor:null},providerDispatchAllowed:false,grantsAccess:false,financialAuthority:false,notPayable:true};
      if(body.command==="resolve_playback"){assert.deepEqual(body,request);seen.push(body);return entry.result;}return undefined;};
    const f=fixture({profile,replay,requestIds:ids,offerEnabled:false});t.after(()=>f.dispose());await f.render();assert.equal(f.playback.length,0);await f.press(`paid-video-v3-playback-${history.id}`);
    assert.equal(seen.length,1);assert.equal(ids.length,0);
    if(entry.result.data.currentGrantId){assert.equal(f.playback.at(-1).selection.grantId,entry.result.data.currentGrantId);assert.deepEqual(clone(f.playback.at(-1).selection.quote),history.quote);}
    else {assert.equal(f.playback.length,0);assert.match(f.text(),/No current playback grant/u);}
    assert.equal(f.nativeCalls.length,0);assert.equal(f.calls.length,0);
  }
});
if(process.env.ISOLATED_PAID_VIDEO_CHECKOUT_V3_FIXTURE)test("mounted preparation and explicit closure use unchanged actual PostgreSQL successor responses",async t=>{
  const captures=JSON.parse(fs.readFileSync(process.env.ISOLATED_PAID_VIDEO_CHECKOUT_V3_FIXTURE,"utf8"));
  const close=captures.find(e=>e.input.request.command==="abandon"&&!e.result.data.replayed);assert.ok(close);
  const original=captures.find(e=>e.input.request.command==="prepare"&&e.input.request.requestId===close.input.request.payload.originalRequestId&&!e.result.data.replayed);
  const offered=captures.find(e=>e.input.request.command==="offer"&&e.result.data.preparationAllowed&&e.result.data.quote.offerId===original.input.request.payload.offerId);
  const recovery=captures.find(e=>e.input.request.command==="recover"&&e.result.status==="ok"&&e.result.data.originalRequestId===original.input.request.requestId&&e.input.actor.sessionId===original.input.actor.sessionId);
  assert.ok(original&&offered&&recovery);const actor=original.input.actor,digest=original.input.request.configurationDigest;
  const authority={...A,userId:actor.userId,accountId:actor.userId,sessionGeneration:actor.sessionId};
  const profile={authority,digest,quote:original.input.request.payload.expectedQuote,customer:{...defaultCustomer,buyerId:actor.userId,configurationDigest:digest}};
  const ids=[offered.input.request.requestId,uuid(9001),uuid(9002),original.input.request.requestId,offered.input.request.requestId,recovery.input.request.requestId,recovery.input.request.requestId,close.input.request.requestId],seen=[];
  const replay=body=>{const found=[offered,original,recovery,close].find(e=>e.input.request.command===body.command&&e.input.request.requestId===body.requestId);if(!found)return undefined;
    assert.deepEqual(body,found.input.request);seen.push(found);return found.result;};
  const f=fixture({profile,replay,requestIds:ids,epoch:Date.parse(original.result.data.intent.createdAt)+1});t.after(()=>f.dispose());await f.render();await f.press("paid-video-v3-bind");
  const prepared=await prepare(f);assert.equal(prepared.attempt.intentId,original.result.data.intent.id);assert.deepEqual(clone(prepared.quote.asset),profile.quote.asset);
  await f.press(`paid-video-v3-close-${prepared.requestId}`);const saved=(await f.preparations().list())[0].attempt;
  assert.equal(saved.state,"closed");assert.equal(saved.closure.id,close.result.data.closure.id);assert.equal(f.nativeCalls.length,0);
  assert.ok(seen.includes(original)&&seen.includes(recovery)&&seen.includes(close));assert.equal(ids.length,0);
});
if(process.env.ISOLATED_TEST_STORE_V3_FIXTURE)test("mounted retained allocation uses unchanged actual PostgreSQL read and one-use claim before native boundary",async t=>{
  const captures=JSON.parse(fs.readFileSync(process.env.ISOLATED_TEST_STORE_V3_FIXTURE,"utf8")).cases;
  const { b, a, r, c } = capturedPurchaseChain(captures);
  const actor=b.actor,authority={...A,userId:actor.userId,accountId:actor.userId,sessionGeneration:actor.sessionId},profile={authority,digest:b.configurationDigest,quote:a.payload.expectedQuote,customer:b.response.result.customer};
  const ids=[uuid(9010),r.requestId,c.requestId],seen=[];
  const replay=body=>{const found=[r,c].find(e=>e.command===body.command&&e.requestId===body.requestId);if(!found)return undefined;
    assert.deepEqual(body,{protocol:"isolated-test-store-v3",command:found.command,requestId:found.requestId,expectedSessionId:found.actor.sessionId,configurationDigest:found.configurationDigest,payload:found.payload});seen.push(found);return found.response;};
  const f=fixture({profile,replay,requestIds:ids,offerEnabled:false,epoch:Date.parse(c.response.result.authorityValidUntil)-1000});let wait;
  t.after(async()=>{await f.dispose();wait?.resolve();});const journal=f.journal();
  await(await journal.prepareBinding({requestId:b.requestId,sessionId:actor.sessionId})).execute(async()=>b.response);
  await(await journal.prepareAllocation({requestId:a.requestId,sessionId:actor.sessionId,intentId:a.payload.intentId,quote:a.payload.expectedQuote})).execute(async()=>a.response);
  await journal.reconcile({requestId:r.requestId,sessionId:actor.sessionId,payload:r.payload},r.response);
  await f.render();wait=f.holdPurchase();await purchase(f,(await journal.list())[0]);
  assert.equal(f.nativeCalls.filter(call=>call[0]==="purchase").length,1);assert.equal((await journal.list())[0].nativePhase,"invoking");assert.equal((await journal.list())[0].observation.receipt,null);
  assert.ok(seen.includes(r)&&seen.includes(c));assert.equal(f.playback.length,0);assert.equal(ids.length,0);
});
function fixture({ memory = new Map(), server = null, nativeState = null, initial = A, configured = true, platform = "ios", strictMode = false, profile = null, replay = null, requestIds = null, epoch = null, offerEnabled = true } = {}) {
  const buyer = profile?.authority ?? initial, customer = profile?.customer ?? defaultCustomer, quote = profile?.quote ?? defaultQuote, digest = profile?.digest ?? defaultDigest;
  let current = buyer, nodes = [], now = epoch ?? Date.parse("2026-11-07T12:00:00Z"), cacheMissing = false, lostClaim = false, lostAdvance = false, heldRead = null, nativeOutcome = "sdk_success";
  const listeners = new Set(), calls = [], nativeCalls = [], coreCalls = [];
  let lostPrepare=false, lostClose=false, lostPreparedClose=false, dropPreparedClose=false, refuseAllocation=false, loseAllocation=false; const playback=[];
  const state = server ?? { quote:clone(quote), preparationAllowed:true, bound: false, serial: 100, revision: 1, active: null, core: new Map(), allocations: new Map(), held: false, verified: new Set() };
  state.preparedClosed ??= new Map(); state.closeRequests ??= new Map(); state.allocationSessions ??= new Map(); state.selectedGrants ??= new Map(); state.receiptStates ??= new Map();
  const device = nativeState ?? { customer: null, retired: false, active: null, invocations: new Map(), handles: new Map() };
  let purchaseWait = null, claimWait = null, storageWait = null, prepareWait = null;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const globals = { Date: Clock };
  const storage = { getItem: async key => memory.get(key) ?? null, setItem: async (key, value) => { const wait = storageWait; storageWait = null; if (wait) await wait.promise; memory.set(key, value); } };
  const authority = { getCurrentAccountSessionAuthoritySnapshot: () => current,
    sameAccountSessionAuthority: (a, b) => !!a && !!b && a.userId === b.userId && a.accountId === b.accountId && a.sessionGeneration === b.sessionGeneration && a.restoreOnly === b.restoreOnly,
    subscribeToAccountSessionAuthority(fn) { listeners.add(fn); return () => listeners.delete(fn); } };
  const account = { captureAccountBoundSupabaseMutationSubject: async () => ({ authority: current, accessToken: "captured-fixture-token" }) };
  const supabase = { SUPABASE_URL: "https://fixture.invalid", SUPABASE_ANON_KEY: "public-fixture" };
  const coreEnvelope = (body,data,status="ok") => ({protocol:"isolated-paid-video-checkout-v3",command:body.command,requestId:body.requestId,actor:{userId:current.userId,sessionId:body.expectedSessionId},status,data,providerDispatchAllowed:false,grantsAccess:false,financialAuthority:false,notPayable:true});
  const coreIntent = original => {
    const a=[...state.allocations.values()].find(value=>value.intentId===original.id),verified=a&&state.verified.has(a.id);
    return {id:original.id,state:original.closed||state.preparedClosed.has(a?.id)?"expired":verified?"verified":a?.claimed?"provider_pending":"prepared",quote:clone(original.payload.expectedQuote),createdAt:"2026-11-07T11:59:00Z",expiresAt:"2030-01-01T00:00:00Z",
      receipt:verified?{id:`scv1_receipt_${a.dispatchId}`,state:state.receiptStates.get(a.id)??"verified",originalTransactionId:`original_${a.dispatchId}`,purchasedAt:"2026-11-07T12:00:00Z"}:null,
      grantId:verified?`scv1_grant_${a.dispatchId}`:null,dispatchAllowed:false,accessRequiresCurrentAuthorization:true,notPayable:true};
  };
  const coreFetch = async (_url,options) => {
    const body=JSON.parse(options.body),p=body.payload;coreCalls.push(body);
    if(replay){const found=await replay(body);if(found!==undefined)return {ok:true,json:async()=>found};}
    let data,status="ok";
    if(body.command==="offer") data={quote:clone(state.quote),preparationAllowed:state.preparationAllowed};
    else if(body.command==="prepare") {const id=`scv1_intent_${uuid(++state.serial)}`,original={id,requestId:body.requestId,sid:body.expectedSessionId,payload:clone(p)};state.core.set(body.requestId,original);data={intent:coreIntent(original),replayed:false};if(lostPrepare)throw Error("lost prepare");}
    else if(body.command==="recover") {const original=state.core.get(p.originalRequestId);status=original?"ok":"unknown";data=original?{originalRequestId:p.originalRequestId,originalSessionId:original.sid,originalPayload:original.payload,intent:coreIntent(original)}:{originalRequestId:p.originalRequestId,intent:null};}
    else if(body.command==="history") {const rows=[...state.core.values()].map(coreIntent).sort((a,b)=>b.id.localeCompare(a.id)),start=p.cursor?rows.findIndex(i=>i.id===p.cursor)+1:0,part=rows.slice(start,start+p.limit);data={intents:part,nextCursor:start+p.limit<rows.length?part.at(-1).id:null};}
    else if(body.command==="abandon") {const original=state.core.get(p.originalRequestId);assert.ok(original);assert.equal([...state.allocations.values()].some(a=>a.intentId===original.id),false);const replayed=!!original.closed;original.closed??={id:uuid(++state.serial),originalRequestId:original.requestId,originalSessionId:original.sid,configurationDigest:digest,closedAt:new Clock().toISOString(),kind:"unallocated_preparation",allocationAbsent:true,dispatchAbsent:true};data={intent:coreIntent(original),closure:original.closed,replayed};if(lostClose)throw Error("lost closure");}
    else if(body.command==="close_prepared") {
      if(dropPreparedClose)throw Error("close never reached server");
      const a=[...state.allocations.values()].find(a=>a.intentId===p.intentId),original=[...state.core.values()].find(i=>i.id===p.intentId);assert.ok(a&&original);
      assert.equal(a.claimed,undefined);assert.equal(state.verified.has(a.id),false);assert.equal(p.customerBindingId,customer.id);assert.equal(p.dispatchId,a.dispatchId);assert.equal(p.registrationId,a.registration.id);
      assert.equal(p.originalSessionId,state.allocationSessions.get(a.id));assert.deepEqual(p.expectedQuote,a.quote);
      let closure=state.preparedClosed.get(a.id);const replayed=!!closure;
      if(!closure){assert.equal(state.active,a.id);assert.equal(state.revision,p.expectedReservationRevision);state.active=null;state.revision++;
        closure={id:uuid(++state.serial),kind:"unclaimed_allocation",customerBindingId:customer.id,allocationId:a.id,dispatchId:a.dispatchId,registrationId:a.registration.id,originalSessionId:p.originalSessionId,configurationDigest:digest,previousReservationRevision:p.expectedReservationRevision,releasedReservationRevision:p.expectedReservationRevision+1,closedAt:new Clock().toISOString(),claimAbsent:true};state.preparedClosed.set(a.id,closure);}
      assert.equal(closure.previousReservationRevision,p.expectedReservationRevision);
      state.closeRequests.set(body.requestId,{sessionId:body.expectedSessionId,payload:clone(p),closure});data={intent:coreIntent(original),closure,replayed};if(lostPreparedClose)throw Error("lost server closure response");
    }
    else if(body.command==="recover_close_prepared") {const saved=state.closeRequests.get(p.originalRequestId);status=saved?"ok":"unknown";data=saved?{originalRequestId:p.originalRequestId,originalSessionId:saved.sessionId,originalPayload:saved.payload,intent:coreIntent([...state.core.values()].find(i=>i.id===saved.payload.intentId)),closure:saved.closure}:{originalRequestId:p.originalRequestId,intent:null,closure:null};}
    else if(body.command==="resolve_playback") {const original=[...state.core.values()].find(i=>i.id===p.intentId);assert.ok(original);const intent=coreIntent(original),chosen=state.selectedGrants.get(intent.quote.resourceId);
      data={intent,currentGrantId:state.held?null:state.selectedGrants.has(intent.quote.resourceId)?chosen:(intent.receipt?.state==="verified"?intent.grantId:null),accessRequiresCurrentAuthorization:true};}
    else throw Error(`unsupported checkout ${body.command}`);
    return {ok:true,json:async()=>coreEnvelope(body,data,status)};
  };
  const coreBindings = { "./accountBoundSupabaseMutation": account, "./supabase": supabase, "react-native": { Platform: { OS: platform } }, "./accountSessionAuthority": authority };
  const v1 = load("_lib/isolatedTestStoreContract.ts", {}, globals), contract = load("_lib/isolatedTestStoreV3Contract.ts", { "./isolatedTestStoreContract": v1 }, globals);
  const coreApi=load("_lib/isolatedPaidVideoCheckoutV3.ts",{...coreBindings,"react-native-get-random-values":{},"./isolatedTestStoreContract":v1,"./isolatedTestStoreV3Contract":contract},{...globals,fetch:coreFetch});
  const nativeInvocation = (allocation, sid, status) => ({ protocol: "isolated-test-store-native-v3", invocationId: allocation.dispatchId,
    customerBindingId: customer.id, installationId: customer.installationId, buyerId: customer.buyerId, configurationDigest: digest,
    providerAppUserId: customer.providerAppUserId, allocationId: allocation.id, registrationId: allocation.registration.id, sessionId: sid, quote:clone(allocation.quote),
    state: status, outcome: status === "completed" ? nativeOutcome : null, transactionHint: null, completedAt: status === "completed" ? new Clock().toISOString() : null });
  const nativeModule = { isolatedTestStoreV3Flavor: true,
    build: configured ? { protocol: "isolated-test-store-build-v3", mode: "test-store-debug-v3", platform, applicationId: "com.chillywood.mobile.teststoredebugv3",
      projectId: customer.projectId, appId: customer.appId, publicSdkKey: "test_nonsecretfixture", configId: digest, storageNamespace: "@chillywood/test-store-debug-v3", nativeDebug: true } : null,
    async inspectInstallation() { return { protocol: "isolated-test-store-native-v3", installationId: customer.installationId, configurationDigest: digest, customer: device.customer, processRetired: device.retired, activeInvocationId: device.active }; },
    async bindCustomer(json, sid) { const c = JSON.parse(json); nativeCalls.push(["bind", c.providerAppUserId, sid]); assert.ok(!device.customer || device.customer.providerAppUserId === c.providerAppUserId); device.customer = c; return this.inspectInstallation(); },
    async preparePackage(_customer, json, sid) {
      const a = JSON.parse(json); nativeCalls.push(["lookup", a.registration.offeringIdentifier]);
      if (cacheMissing) return { status: "package_unavailable", handleId: null, invocation: null };
      assert.equal(device.active, null); assert.equal(device.retired, false); device.active = a.dispatchId;
      const invocation = nativeInvocation(a, sid, "prepared"), handleId = uuid(++state.serial); device.invocations.set(a.dispatchId, invocation); device.handles.set(handleId, a);
      if(prepareWait)await prepareWait.promise;
      return { status: "prepared", handleId, invocation };
    },
    async purchasePrepared(handleId, rawClaim) {
      const claim = JSON.parse(rawClaim), a = device.handles.get(handleId); assert.ok(a); device.handles.delete(handleId);
      nativeCalls.push(["purchase", a.registration.offeringIdentifier]); device.invocations.set(a.dispatchId, nativeInvocation(a, claim.actor.sessionId, "invoking"));
      if (purchaseWait) await purchaseWait.promise;
      const completed = nativeInvocation(a, claim.actor.sessionId, "completed"); device.invocations.set(a.dispatchId, completed); device.active = null; return completed;
    },
    async readInvocation(id) { return device.invocations.get(id) ?? null; },
    async closePrepared(_customer,json,_currentSession) {
      const a=JSON.parse(json),record=device.invocations.get(a.dispatchId);assert.equal(device.retired,false);assert.ok(record);
      if(record.state==="prepared_closed")return clone(record);
      assert.equal(record.state,"prepared");assert.equal(device.active,a.dispatchId);assert.deepEqual(record.quote,a.quote);assert.equal(record.allocationId,a.id);
      const closure={protocol:"isolated-test-store-native-prepared-closure-v3",state:"prepared_closed",invocation:clone(record),closedAt:new Clock().toISOString()};
      device.invocations.set(a.dispatchId,closure);device.handles.clear();device.active=null;return clone(closure);
    },
    async retireSession() { device.retired = true; },
  };
  const build = load("_lib/isolatedTestStoreV3Build.ts", { "expo-application": { applicationId: "com.chillywood.mobile.teststoredebugv3" },
    "expo-modules-core": { requireOptionalNativeModule: () => nativeModule }, "react-native": { Platform: { OS: platform } }, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV3Contract": contract }, globals);
  const transport = load("_lib/isolatedTestStoreV3.ts", { ...coreBindings, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV3Contract": contract }, { ...globals,
    fetch: async (_url, options) => {
      const body = JSON.parse(options.body), p = body.payload; calls.push(body);
      if(replay){const found=await replay(body);if(found!==undefined)return {ok:true,json:async()=>found};}
      let a = null, status;
      if (body.command === "bind") { state.bound = true; a = state.active ? state.allocations.get(state.active) : null; }
      else if (body.command === "allocate" && !refuseAllocation) {
        assert.equal(state.active, null); a = { id: `scv3_allocation_${uuid(++state.serial)}`, intentId: p.intentId, dispatchId: uuid(++state.serial),
          customerBindingId: customer.id, configurationDigest: digest, productId: registration.productId, quote: clone(p.expectedQuote),
          acceptPurchaseUntil: new Clock(now + 60_000).toISOString(), registration: { ...registration, id: `scv3_registration_${uuid(++state.serial)}`, offeringIdentifier: `intent_${state.serial}` } };
        state.allocations.set(a.id, a); state.active = a.id; state.revision++;
        state.allocationSessions.set(a.id,body.expectedSessionId);
        if(loseAllocation)throw Error("allocation reply lost");
      } else a = [...state.allocations.values()].find(x => x.intentId === p.intentId);
      if (body.command === "claim") { assert.equal(state.preparedClosed.has(a.id),false);a.claimed = true; if (lostClaim) throw Error("claim response lost"); }
      if (body.command === "advance") { assert.equal(state.active, a.id); assert.equal(state.revision, p.expectedReservationRevision); state.active = null; state.revision++; status = "released"; if (lostAdvance) throw Error("advance response lost"); }
      const receipt = a && state.verified.has(a.id) ? { id: `scv1_receipt_${a.dispatchId}`, state: "verified", providerTransactionId: `tx_${a.dispatchId}`, originalTransactionId: `original_${a.dispatchId}`, purchasedAt: "2026-11-07T12:00:00Z" } : null;
      status = state.held ? "held" : status ?? (receipt ? "verified" : !a ? body.command === "bind" ? "customer_bound" : "unavailable" : state.preparedClosed.has(a.id)?"expired":body.command === "claim" ? "dispatch_claimed" : a.claimed ? "pending" : "offering_ready");
      const clean = a ? Object.fromEntries(Object.entries(a).filter(([k]) => k !== "claimed")) : null;
      const result = { protocol: "isolated-test-store-v3", command: body.command, requestId: body.requestId, actor: { userId: current.userId, sessionId: body.expectedSessionId }, generation: 1, environment: "sandbox",
        result: { status, reason: status, dispatchAllowed: body.command === "claim" && !state.held, retryProviderMutation: false, grantsAccess: false, notPayable: true,
          customer: clone(customer), allocation: clone(clean), reservation: { revision: state.revision, activeAllocationId: state.active }, authorityValidUntil: body.command === "claim" && !state.held ? new Clock(now + 4_000).toISOString() : null, receipt } };
      const wait = body.command === "read" ? heldRead : body.command === "claim" ? claimWait : null;
      if (body.command === "read" && wait) heldRead = null;
      if (body.command === "claim" && wait) claimWait = null;
      return { ok: true, json: async () => { if (wait) await wait.promise; return result; } };
    } });
  const closures = load("_lib/isolatedTestStoreV3PreparedClosures.ts", { "@react-native-async-storage/async-storage": storage, "./isolatedPaidVideoCheckoutV3": coreApi, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV3Contract": contract }, globals);
  const coreJournal = load("_lib/isolatedPaidVideoCheckoutV3Attempts.ts", { "@react-native-async-storage/async-storage": storage, "./isolatedPaidVideoCheckoutV3": coreApi,"./isolatedTestStoreContract":v1,"./isolatedTestStoreV3Contract":contract }, globals);
  const journal = load("_lib/isolatedTestStoreV3Attempts.ts", { "@react-native-async-storage/async-storage": storage, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV3Contract": contract, "./isolatedTestStoreV3PreparedClosures": closures, "./isolatedPaidVideoCheckoutV3Attempts": coreJournal }, globals);
  const preparations = load("_lib/isolatedTestStoreV3Preparations.ts", { "@react-native-async-storage/async-storage": storage, "./isolatedPaidVideoCheckoutV3Attempts": coreJournal, "./isolatedTestStoreContract": v1, "./isolatedTestStoreV3Contract": contract, "./isolatedTestStoreV3Attempts": journal }, globals);
  const sdk = load("_lib/isolatedTestStoreV3Sdk.ts", { "./accountSessionAuthority": authority, "./isolatedTestStoreV3Build": build, "./isolatedTestStoreV3Contract": contract }, globals);
  const actions = load("_lib/isolatedTestStoreV3Actions.ts", { "./accountSessionAuthority": authority, "./isolatedPaidVideoCheckoutV3": coreApi, "./isolatedTestStoreV3Contract": contract,
    "./isolatedTestStoreV3": transport, "./isolatedTestStoreV3Attempts": journal, "./isolatedTestStoreV3Preparations": preparations, "./isolatedTestStoreV3Build": build, "./isolatedTestStoreV3Sdk": sdk, "./isolatedTestStoreV3PreparedClosures": closures }, globals);
  const actionsBoundary={...actions,captureIsolatedTestStoreV3Actions:(a)=>actions.captureIsolatedTestStoreV3Actions(a,requestIds?{nextRequestId:()=>{assert.ok(requestIds.length,"capture request id queue");return requestIds.shift();}}:{})};
  const primitive = name => function Primitive(props) { nodes.push({ name, props }); return name === "Text" ? null : React.createElement(React.Fragment, null, props.children); };
  const native = { StyleSheet: { create: v => v }, ...Object.fromEntries(["View", "Text", "Pressable"].map(n => [n, primitive(n)])) };
  const component = load("components/monetization/isolated-test-store-v3-checkout.tsx", { react: React, "react-native": native, "../../_lib/accountSessionAuthority": authority,
    "../../_lib/isolatedTestStoreV3Actions": actionsBoundary, "../../_lib/isolatedTestStoreV3Build": build,"../../_lib/isolatedTestStoreV3Contract":contract,"@react-navigation/native":{useIsFocused:()=>true},"./isolated-paid-video-player":{IsolatedPaidVideoPlayer:props=>{playback.push(props);return null;}} }, globals);
  const root = createRoot(container()), visible = () => nodes.slice(Math.max(0, nodes.findLastIndex(n => n.props.testID === "paid-video-v3-checkout")));
  const getJournal = () => journal.createIsolatedTestStoreV3AttemptJournal({ userId: current.userId, installationId: customer.installationId, configurationDigest: digest });
  return { playback, profile:{authority:buyer,quote,customer,digest}, memory, server: state, nativeState: device, calls, coreCalls, nativeCalls, journal: getJournal,
    preparations: () => preparations.createIsolatedTestStoreV3Preparations({ userId: current.userId, installationId: customer.installationId, configurationDigest: digest }),
    closures: () => closures.createTestStoreV3PreparedClosureJournal({userId:current.userId,installationId:customer.installationId,configurationDigest:digest}),
    losePrepare(){lostPrepare=true;},loseClose(){lostClose=true;},allowClose(){lostClose=false;},changeQuote(fn){fn(state.quote);},unavailable(){state.preparationAllowed=false;},
    refuseAllocation(){refuseAllocation=true;},allowAllocation(){refuseAllocation=false;},loseAllocation(){loseAllocation=true;},
    async render(equivalentAuthority = false) { nodes = []; await React.act(async () => { const child = React.createElement(component.IsolatedTestStoreV3Checkout, { authority: equivalentAuthority ? { ...current } : current, offerId:offerEnabled?quote.offerId:null }); root.render(strictMode ? React.createElement(React.StrictMode, null, child) : child); }); },
    node: id => visible().findLast(n => n.props.testID === id), text: () => visible().filter(n => n.name === "Text").flatMap(n => n.props.children).join("\n"),
    async press(id) { const n = visible().findLast(n => n.props.testID === id); assert.ok(n, id); assert.notEqual(n.props.disabled, true, id); await React.act(async () => { n.props.onPress(); await new Promise(done => setImmediate(done)); }); },
    async settle() { await React.act(async () => { await new Promise(done => setImmediate(done)); }); },
    async change(next) { await React.act(async () => { current = next; for (const listener of listeners) listener(next); }); },
    advanceClock() { now += 5_000; }, cacheMiss(v) { cacheMissing = v; }, loseClaim() { lostClaim = true; }, loseAdvance() { lostAdvance = true; }, cancelNative() { nativeOutcome = "sdk_cancelled"; },
    verify(id) { state.verified.add(id); }, hold() { state.held = true; }, delayRead() { heldRead = deferred(); return heldRead; },
    holdPurchase() { purchaseWait = deferred(); return purchaseWait; },
    holdPrepare() { prepareWait=deferred();return prepareWait; }, losePreparedClosure() { lostPreparedClose=true; }, dropPreparedClosure(){dropPreparedClose=true;}, allowPreparedClosure(){dropPreparedClose=false;lostPreparedClose=false;},
    selectGrant(resourceId,grantId){state.selectedGrants.set(resourceId,grantId);},refund(id){state.receiptStates.set(id,"refunded");},
    delayClaim() { claimWait = deferred(); return claimWait; }, delayStorageWrite() { storageWait = deferred(); return storageWait; },
    async dispose() { await React.act(async () => root.unmount()); } };
}
