import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { Buffer } from 'node:buffer';
const require = createRequire(import.meta.url), ts = require('typescript'), React = require('react'), { createRoot } = require('react-dom/client');
const uuid = n => `e0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const A = { userId:uuid(1),accountId:uuid(1),sessionGeneration:uuid(2),state:'ACTIVE',restoreOnly:false }, B = {...A,userId:uuid(3),accountId:uuid(3),sessionGeneration:uuid(4)};
const offerId=`scv1_offer_${uuid(5)}`;
const quote=()=>({offerId,offerRevision:1,resourceId:`scv1_resource_${uuid(6)}`,resourceRevision:2,creatorId:uuid(7),kind:'paid_content',amountMinor:199,currency:'usd',
  asset:{id:`scv1_asset_${uuid(8)}`,incarnation:uuid(9),sha256:'a'.repeat(64),byteLength:100,resourceRevision:2,profile:'scpv-mp4-h264-aac-v1'},
  catalog:{bindingId:`nssv1_catalog_${uuid(10)}`,revision:1,projectId:'test-project',appId:'test-app',store:'APP_STORE',environment:'SANDBOX',wireProductId:'one_time'},quoteDigest:'b'.repeat(64)});
const clone=v=>JSON.parse(JSON.stringify(v));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function load(file,bindings,extra={}) {
  const scope={exports:{},crypto:webcrypto,AbortController,setTimeout,clearTimeout,...extra,require(name){assert.ok(name in bindings,`Unexpected dependency: ${name}`);return bindings[name];}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL(file,import.meta.url),'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,scope);
  return scope.exports;
}
function fixture({deadlineMs=1000,memory=new Map()}={}) {
  let current=A,transport,captureWait=null,storeWait=null,storageFailed=false,readFailed=false;const calls=[],listeners=new Set();
  const authority={getCurrentAccountSessionAuthoritySnapshot:()=>current,sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&['userId','accountId','sessionGeneration','state','restoreOnly'].every(k=>a[k]===b[k]),subscribeToAccountSessionAuthority(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
  const storage={async getItem(key){if(readFailed)throw Error('read');return memory.get(key)??null;},async setItem(key,value){if(storageFailed)throw Error('disk');if(storeWait)await storeWait.promise;memory.set(key,value);}};
  const api=load('../../_lib/nativeStoreSandboxQuote.ts',{'@react-native-async-storage/async-storage':storage,'react-native-get-random-values':{},'./accountSessionAuthority':authority,
    './accountBoundSupabaseMutation':{async captureAccountBoundSupabaseMutationSubject(){const captured={authority:current,accessToken:'synthetic-token'};if(captureWait)await captureWait.promise;return captured;}},'./supabase':{SUPABASE_URL:'https://local.invalid',SUPABASE_ANON_KEY:'public-test'}},
    {fetch:async(url,options)=>{const body=JSON.parse(options.body);calls.push({url,options,body});return transport(body);}});
  const actor=()=>({userId:current.userId,accountId:current.accountId,sessionGeneration:current.sessionGeneration});
  const result=(body,data,status='ok')=>({protocol:api.NATIVE_STORE_SANDBOX_PROTOCOL,command:body.command,requestId:body.requestId,actor:actor(),status,data,dispatchAllowed:false,correlation:'unsupported'});
  let selection=null;
  transport=async body=>{if(body.command==='reserve'||body.command==='reserve-recover') {
      const attempt=[...memory.values()].map(v=>JSON.parse(v)).find(v=>v.attemptId&&v.selectionId===body.payload.selectionId);
      const reservation={id:`nssv1_reservation_${uuid(90)}`,selectionId:attempt.selectionId,originalRequestId:attempt.attemptId,originalSessionGeneration:attempt.originalSessionGeneration,createdAt:'2026-11-08T00:00:00Z',quoteDigest:attempt.quote.quoteDigest,state:'dispatch_reserved',dispatchAllowed:false,providerQualified:false};
      return{ok:true,text:async()=>JSON.stringify(result(body,{reservation,reason:null}))};
    }if(body.command==='prepare')selection={id:`nssv1_selection_${body.requestId}`,originalRequestId:body.requestId,originalSessionGeneration:current.sessionGeneration,createdAt:'2026-11-08T01:00:00Z',quote:body.payload.expectedQuote};
    const value=result(body,body.command==='offer'?{quote:quote(),reason:null}:{selection,reason:selection?null:'selection_unknown'},body.command==='recover'&&!selection?'unknown':'ok');return{ok:true,text:async()=>JSON.stringify(value)};};
  return{api,calls,storage,memory,authority,result,actor,connect:(selectedOffer=offerId)=>api.captureNativeSandboxQuoteClient(current,selectedOffer,'APP_STORE',{storage,deadlineMs}),
    change(v){current=v;listeners.forEach(fn=>fn(v));},current:()=>current,setTransport(fn){transport=fn;},delayCapture(){captureWait=deferred();return captureWait;},delayStore(){storeWait=deferred();return storeWait;},failStorage(){storageFailed=true;},failRead(v){readFailed=v;}};
}
test('actual client reads exact quote, persists before prepare, and recovers without a second store or prepare call',async()=>{
  const f=fixture(),c=await f.connect();const read=await c.offer();assert.equal(read.data.quote.amountMinor,199);
  const selected=await c.prepare(read.data.quote);assert.equal(selected.data.selection.quote.offerId,offerId);assert.equal(f.memory.size,1);
  await assert.rejects(c.prepare(quote()),e=>e.code==='saved_selection_requires_recovery');
  const recovered=await c.recover();assert.equal(recovered.data.selection.originalRequestId,selected.data.selection.originalRequestId);
  assert.deepEqual(f.calls.map(c=>c.body.command),['offer','prepare','recover']);assert.ok(f.calls.every(c=>c.url.endsWith('/native-store-sandbox-command-v1')));c.dispose();
});
test('strict response rejects changed actor, store, asset, quote, authority and unknown fields',async()=>{
  const f=fixture(),body={command:'offer',requestId:uuid(20)},good=f.result(body,{quote:quote(),reason:null}),expected={actor:f.actor(),command:'offer',requestId:body.requestId,offerId,store:'APP_STORE'};
  for(const mutate of [v=>v.actor.userId=B.userId,v=>v.dispatchAllowed=true,v=>v.extra='grant',v=>v.data.quote.catalog.store='TEST_STORE',v=>v.data.quote.asset.resourceRevision=3,v=>v.data.quote.creatorId=A.userId,v=>v.data.quote.catalog.extra=true]){
    const bad=clone(good);mutate(bad);assert.throws(()=>f.api.parseNativeSandboxResponse(bad,expected),e=>e.code==='invalid_response');}
  assert.throws(()=>f.api.parseNativeSandboxResponse({...good,status:'unknown',data:{quote:null,reason:'unknown'}},expected),e=>e.code==='invalid_response');
  const c=await f.connect();await c.prepare(quote());f.setTransport(async b=>({ok:true,text:async()=>JSON.stringify(f.result(b,{selection:{id:`nssv1_selection_${uuid(11)}`,originalRequestId:b.payload.originalRequestId,originalSessionGeneration:A.sessionGeneration,createdAt:'2026-11-08T01:00:00Z',quote:{...quote(),amountMinor:200}},reason:null}))}));
  await assert.rejects(c.recover());c.dispose();
});
test('uncertain prepare is bounded and never retried; recovery can read the original request',async()=>{
  const f=fixture({deadlineMs:30}),c=await f.connect();f.setTransport(()=>new Promise(()=>{}));
  await assert.rejects(c.prepare(quote()),e=>e.code==='outcome_unknown');await assert.rejects(c.prepare(quote()),e=>e.code==='saved_selection_requires_recovery');assert.equal(f.calls.length,1);
  const saved=await c.readSaved();assert.equal(saved.originalRequestId,f.calls[0].body.requestId);c.dispose();
});
test('failed/late local persistence cannot dispatch or be replaced by a parallel owner',async()=>{
  const f=fixture({deadlineMs:30}),c=await f.connect(),other=await f.connect(),wait=f.delayStore();
  const pending=c.prepare(quote());await assert.rejects(other.prepare(quote()),e=>e.code==='saved_selection_requires_recovery');await assert.rejects(pending);await assert.rejects(other.prepare(quote()),e=>e.code==='saved_selection_requires_recovery');
  assert.equal(f.calls.length,0);wait.resolve();await new Promise(r=>setTimeout(r,0));assert.equal((await other.readSaved()).quote.amountMinor,199);c.dispose();other.dispose();
  const g=fixture();g.failStorage();const failed=await g.connect();await assert.rejects(failed.prepare(quote()));assert.equal(g.calls.length,0);failed.dispose();
});
test('known pre-write read failure releases only the in-process preparation guard',async()=>{
  const f=fixture(),c=await f.connect();f.failRead(true);await assert.rejects(c.prepare(quote()));assert.equal(f.calls.length,0);assert.equal(f.memory.size,0);
  f.failRead(false);await c.prepare(quote());assert.equal(f.calls.length,1);c.dispose();
});
test('account gaps permanently retire clients, including capture and delayed replies',async()=>{
  const f=fixture(),wait=f.delayCapture(),capture=f.connect();f.change(B);f.change(A);wait.resolve();await assert.rejects(capture,e=>e.code==='authority_retired');
  const g=fixture(),c=await g.connect(),reply=deferred();g.setTransport(async b=>({ok:true,text:async()=>{await reply.promise;return JSON.stringify(g.result(b,{quote:quote(),reason:null}));}}));
  const pending=c.offer();g.change(B);g.change(A);reply.resolve();await assert.rejects(pending,e=>e.code==='authority_retired');await assert.rejects(c.offer(),e=>e.code==='authority_retired');c.dispose();
});
test('saved request survives remount/current-session replacement and remains isolated by account',async()=>{
  const f=fixture(),c=await f.connect();await c.prepare(quote());c.dispose();f.change({...A,sessionGeneration:uuid(99)});
  const fresh=await f.connect();assert.equal((await fresh.readSaved()).originalSessionGeneration,A.sessionGeneration);assert.equal((await fresh.recover()).data.selection.originalSessionGeneration,A.sessionGeneration);fresh.dispose();
  f.change(B);const b=await f.connect();assert.equal(await b.readSaved(),null);b.dispose();
});
test('quote and key snapshots cannot mutate between persistence and transport',async()=>{
  const f=fixture(),c=await f.connect(),q=quote(),wait=f.delayStore();const pending=c.prepare(q);q.amountMinor=999;q.asset.sha256='c'.repeat(64);wait.resolve();await pending;
  assert.equal(f.calls[0].body.payload.expectedQuote.amountMinor,199);assert.equal(f.calls[0].body.payload.expectedQuote.asset.sha256,'a'.repeat(64));c.dispose();
});

const noop=()=>{},doc={addEventListener:noop,removeEventListener:noop,defaultView:globalThis,nodeType:9};
function productReader(f,read,platform='ios',flavor=0){return load('../../_lib/nativeStoreSandboxProduct.ts',{
  'react-native':{Platform:{OS:platform}},'./accountSessionAuthority':f.authority,'./nativeStoreSandboxQuote':f.api,
  './creatorMoneyStoreQuote':load('../../_lib/creatorMoneyStoreQuote.ts',{}),'./revenuecat':{readRevenueCatNonSubscriptionProducts:read,getRevenueCatAppUserId:async()=>f.current().userId,canMakeRevenueCatPurchases:async()=>true},
  './entitlementAuthority':{withAuthorityReadDeadline:async(p,fallback)=>{let timer;try{return await Promise.race([p,new Promise(r=>{timer=setTimeout(()=>r(fallback),30);})]);}finally{clearTimeout(timer);}}},
  './isolatedTestStoreBuild':{isIsolatedTestStoreFlavor:()=>flavor===1},'./isolatedTestStoreV2Build':{isIsolatedTestStoreV2Flavor:()=>flavor===2},'./isolatedTestStoreV3Build':{isIsolatedTestStoreV3Flavor:()=>flavor===3},
});}
test('read-only shared-owner preflight matches exact device product/price/currency and never admits purchases',async()=>{
  for(const platform of ['ios','android']){
    const f=fixture(),q=quote();q.catalog.store=platform==='ios'?'APP_STORE':'PLAY_STORE';let reads=0;
    for(const [products,expected] of [[[{identifier:'one_time',price:1.99,currencyCode:'USD'}],'matched'],[[{identifier:'other',price:1.99,currencyCode:'USD'}],'unavailable'],[[{identifier:'one_time',price:2,currencyCode:'USD'}],'unavailable'],[[{identifier:'one_time',price:1.99,currencyCode:'EUR'}],'unavailable'],[[],'unavailable'],[[{identifier:'one_time',price:1.99,currencyCode:'USD'},{identifier:'one_time',price:1.99,currencyCode:'USD'}],'unavailable']]){
      const api=productReader(f,async ids=>{reads++;assert.deepEqual([...ids],['one_time']);return products;},platform);
      const result=await api.readNativeSandboxDeviceProduct(A,q);assert.equal(result.status,expected);assert.equal(result.dispatchAllowed,false);assert.equal(result.environmentVerified,false);
    }assert.equal(reads,6);
    for(const flavor of [1,2,3])assert.equal((await productReader(f,()=>assert.fail('isolated must not read native SDK'),platform,flavor).readNativeSandboxDeviceProduct(A,q)).status,'unavailable');
  }
});
test('device preflight snapshots quote and permanently retires across account gaps; hung read is bounded',async()=>{
  const f=fixture(),wait=deferred(),q=quote(),api=productReader(f,()=>wait.promise);const pending=api.readNativeSandboxDeviceProduct(A,q);q.amountMinor=999;
  wait.resolve([{identifier:'one_time',price:1.99,currencyCode:'USD'}]);assert.equal((await pending).status,'matched');
  const later=deferred(),late=productReader(f,()=>later.promise).readNativeSandboxDeviceProduct(A,quote());f.change(B);f.change(A);later.resolve([{identifier:'one_time',price:1.99,currencyCode:'USD'}]);assert.equal((await late).status,'unavailable');
  assert.equal((await productReader(f,()=>new Promise(()=>{})).readNativeSandboxDeviceProduct(A,quote())).status,'unavailable');
  assert.equal((await productReader(f,()=>assert.fail('web must not read SDK'),'web').readNativeSandboxDeviceProduct(A,quote())).status,'unavailable');
});
const sdkCallback=(transactionIdentifier='native-txn-1')=>({productIdentifier:'one_time',transaction:{transactionIdentifier,productIdentifier:'one_time',purchaseDate:'2026-11-08T01:00:00Z',purchaseToken:'MUST_NOT_PERSIST'},rawReceipt:'MUST_NOT_PERSIST'});
test('native reservation fences same-SKU different offers, survives restart with no callback, and never admits dispatch',async()=>{
  const f=fixture(),otherOffer=`scv1_offer_${uuid(40)}`,c=await f.connect(),d=await f.connect(otherOffer);
  const first=(await c.prepare(quote())).data.selection,q={...quote(),offerId:otherOffer,resourceId:`scv1_resource_${uuid(41)}`,quoteDigest:'c'.repeat(64)};
  const second=(await d.prepare(q)).data.selection;
  await assert.rejects(c.captureCallback(first.id,sdkCallback()),e=>e.code==='invalid_request');
  const result=await c.retainPurchaseAttempt(first.id);assert.equal(result.status,'dispatch_reserved');assert.equal(result.dispatchAllowed,false);assert.equal(result.providerQualified,false);
  await assert.rejects(d.retainPurchaseAttempt(second.id),e=>e.code==='saved_selection_requires_recovery');assert.equal((await d.readPurchaseAttempt()).status,'blocked_by_other_selection');
  await assert.rejects(d.captureCallback(second.id,sdkCallback()),e=>e.code==='invalid_request');assert.equal(f.calls.length,3);c.dispose();d.dispose();
  const restart=fixture({memory:f.memory});restart.change({...A,sessionGeneration:uuid(42)});restart.setTransport(async body=>({ok:true,text:async()=>JSON.stringify(restart.result(body,{selection:first,reason:null}))}));
  const recovered=await restart.connect();assert.equal((await recovered.readPurchaseAttempt()).status,'dispatch_reserved');await recovered.recover();
  await assert.rejects(recovered.retainPurchaseAttempt(first.id),e=>e.code==='saved_selection_requires_recovery');assert.equal(restart.calls.length,1);recovered.dispose();
  const blocked=await restart.connect(otherOffer);assert.equal((await blocked.readPurchaseAttempt()).status,'blocked_by_other_selection');blocked.dispose();
});
test('reservation cross-offer race and delayed persistence never permit replacement or callback before durable marker',async()=>{
  const f=fixture({deadlineMs:30}),otherOffer=`scv1_offer_${uuid(43)}`,c=await f.connect(),d=await f.connect(otherOffer);
  const first=(await c.prepare(quote())).data.selection,second=(await d.prepare({...quote(),offerId:otherOffer})).data.selection,wait=f.delayStore();
  const pending=c.retainPurchaseAttempt(first.id);await assert.rejects(d.retainPurchaseAttempt(second.id),e=>e.code==='saved_selection_requires_recovery');await assert.rejects(pending,e=>e.code==='unavailable');
  assert.equal((await c.readPurchaseAttempt()).status,'reservation_write_uncertain');await assert.rejects(c.captureCallback(first.id,sdkCallback()),e=>e.code==='invalid_request');
  wait.resolve();await new Promise(r=>setTimeout(r,0));assert.equal((await c.readPurchaseAttempt()).status,'dispatch_reserved');assert.equal((await d.readPurchaseAttempt()).status,'blocked_by_other_selection');assert.equal(f.calls.length,2);c.dispose();d.dispose();
});
test('reservation storage failure and authority gaps remain non-dispatching; corrupted or changed scope is rejected',async()=>{
  const f=fixture(),c=await f.connect(),selection=(await c.prepare(quote())).data.selection;f.failStorage();await assert.rejects(c.retainPurchaseAttempt(selection.id));
  assert.equal((await c.readPurchaseAttempt()).status,'reservation_write_uncertain');assert.equal(f.calls.length,1);c.dispose();
  const g=fixture(),d=await g.connect(),s=(await d.prepare(quote())).data.selection,wait=g.delayStore();
  const pending=d.retainPurchaseAttempt(s.id);const rejected=assert.rejects(pending,e=>e.code==='authority_retired');g.change(B);g.change(A);wait.resolve();await rejected;d.dispose();
  const h=fixture(),e=await h.connect(),sel=(await e.prepare(quote())).data.selection;await e.retainPurchaseAttempt(sel.id);
  const key=[...h.memory.keys()].find(k=>k.startsWith('@chillywood/native-store-attempt:')),original=h.memory.get(key);
  for(const mutate of [v=>v.userId=B.userId,v=>v.quote.catalog.projectId='other',v=>v.quote.catalog.appId='other',v=>v.quote.catalog.environment='PRODUCTION',v=>v.quote.catalog.wireProductId='other',v=>v.state='dispatch_allowed']){const value=JSON.parse(original);mutate(value);h.memory.set(key,JSON.stringify(value));await assert.rejects(e.readPurchaseAttempt(),err=>err.code==='unavailable');}
  h.memory.set(key,original);h.change(B);const b=await h.connect();await assert.rejects(b.readPurchaseAttempt(),err=>err.code==='invalid_request');b.dispose();e.dispose();
});
const claimFor=(body,session=A.sessionGeneration)=>({id:`nssv1_claim_${uuid(25)}`,selectionId:body.payload.selectionId,originalRequestId:body.requestId,originalSessionGeneration:session,createdAt:'2026-11-08T01:00:00Z',transactionIdentifier:body.payload.transactionIdentifier,productIdentifier:body.payload.productIdentifier,evidence:'client_assertion',settlementAllowed:false});
test('callback stores only exact transaction assertion before claim and process restart recovers same-account claim',async()=>{
  const f=fixture(),c=await f.connect(),s=(await c.prepare(quote())).data.selection;await c.retainPurchaseAttempt(s.id);
  let serverClaim;
  f.setTransport(async body=>{assert.equal(body.command,'claim');assert.ok([...f.memory.values()].some(v=>v.includes(body.requestId)));serverClaim=claimFor(body);return{ok:true,text:async()=>JSON.stringify(f.result(body,{claim:serverClaim,reason:null}))};});
  const response=await c.captureCallback(s.id,sdkCallback());assert.equal(response.data.claim.evidence,'client_assertion');assert.equal(response.data.claim.settlementAllowed,false);
  assert.equal([...f.memory.values()].some(v=>v.includes('MUST_NOT_PERSIST')||v.includes('purchaseDate')||v.includes('purchaseToken')),false);
  await assert.rejects(c.captureCallback(s.id,sdkCallback('another')),e=>e.code==='saved_selection_requires_recovery');c.dispose();
  const restarted=fixture({memory:f.memory});restarted.change({...A,sessionGeneration:uuid(26)});
  restarted.setTransport(async body=>{assert.equal(body.command,'claim-recover');assert.deepEqual(body.payload,{selectionId:s.id});return{ok:true,text:async()=>JSON.stringify(restarted.result(body,{claim:serverClaim,reason:null}))};});
  const next=await restarted.connect();assert.equal((await next.recoverClaim()).data.claim.originalRequestId,serverClaim.originalRequestId);next.dispose();
  const other=fixture({memory:f.memory});other.change(B);const wrong=await other.connect();await assert.rejects(wrong.recoverClaim(),e=>e.code==='invalid_request');assert.equal(other.calls.length,0);wrong.dispose();
});
test('unknown claim response is recovery-only across restart and never redispatches callback',async()=>{
  const f=fixture({deadlineMs:30}),c=await f.connect(),s=(await c.prepare(quote())).data.selection;await c.retainPurchaseAttempt(s.id);let recorded;
  f.setTransport(body=>{recorded=claimFor(body);return new Promise(()=>{});});
  await assert.rejects(c.captureCallback(s.id,sdkCallback()),e=>e.code==='outcome_unknown');await assert.rejects(c.captureCallback(s.id,sdkCallback()),e=>e.code==='saved_selection_requires_recovery');c.dispose();
  const restarted=fixture({memory:f.memory});restarted.setTransport(async body=>({ok:true,text:async()=>JSON.stringify(restarted.result(body,{claim:recorded,reason:null}))}));
  const next=await restarted.connect();assert.equal((await next.recoverClaim()).data.claim.transactionIdentifier,'native-txn-1');assert.deepEqual(restarted.calls.map(c=>c.body.command),['claim-recover']);next.dispose();
});
test('claim recovery rejects changed ownership, assertion, transaction, or authority fields',async()=>{
  const f=fixture(),c=await f.connect(),s=(await c.prepare(quote())).data.selection;await c.retainPurchaseAttempt(s.id);let original;
  f.setTransport(async body=>{original=claimFor(body);return{ok:true,text:async()=>JSON.stringify(f.result(body,{claim:original,reason:null}))};});await c.captureCallback(s.id,sdkCallback());
  for(const mutate of [v=>v.actor.userId=B.userId,v=>v.dispatchAllowed=true,v=>v.correlation='verified',v=>v.data.claim.settlementAllowed=true,v=>v.data.claim.evidence='provider_verified',v=>v.data.claim.selectionId=`nssv1_selection_${uuid(99)}`,v=>v.data.claim.transactionIdentifier='other',v=>v.data.claim.productIdentifier='other',v=>v.data.claim.originalRequestId=uuid(99),v=>v.data.claim.originalSessionGeneration='invalid',v=>v.data.claim.extra='grant']){
    f.setTransport(async body=>{const value=f.result(body,{claim:clone(original),reason:null});mutate(value);return{ok:true,text:async()=>JSON.stringify(value)};});await assert.rejects(c.recoverClaim(),e=>e.code==='unavailable');
  }
  f.setTransport(async body=>({ok:true,text:async()=>JSON.stringify(f.result(body,{claim:null,reason:'claim_unknown'},'unknown'))}));assert.equal((await c.recoverClaim()).status,'unknown');c.dispose();
});
test('explicit saved assertion retry keeps exact request across a new session whether old write committed or never arrived',async()=>{
  for(const committed of [false,true]){
    const f=fixture({deadlineMs:30}),c=await f.connect(),selection=(await c.prepare(quote())).data.selection;await c.retainPurchaseAttempt(selection.id);let first,serverClaim=null;
    f.setTransport(body=>{first=body;if(committed)serverClaim=claimFor(body);return new Promise(()=>{});});
    await assert.rejects(c.captureCallback(selection.id,sdkCallback()),e=>e.code==='outcome_unknown');c.dispose();const before=[...f.memory.entries()];
    const restarted=fixture({memory:f.memory});restarted.change({...A,sessionGeneration:uuid(27)});
    restarted.setTransport(async body=>{
      if(body.command==='claim-recover')return{ok:true,text:async()=>JSON.stringify(restarted.result(body,{claim:serverClaim,reason:serverClaim?null:'claim_unknown'},serverClaim?'ok':'unknown'))};
      assert.deepEqual(body,first);serverClaim??=claimFor(body,restarted.current().sessionGeneration);
      return{ok:true,text:async()=>JSON.stringify(restarted.result(body,{claim:serverClaim,reason:null}))};
    });
    const next=await restarted.connect();assert.equal((await next.recoverClaim()).status,committed?'ok':'unknown');
    const retry=await next.retrySavedClaim();assert.equal(retry.data.claim.originalSessionGeneration,committed?A.sessionGeneration:uuid(27));
    assert.equal((await next.retrySavedClaim()).data.claim.id,retry.data.claim.id);assert.deepEqual([...f.memory.entries()],before);
    assert.deepEqual(restarted.calls.map(v=>v.body.command),['claim-recover','claim','claim']);next.dispose();
    const other=fixture({memory:f.memory});other.change(B);const wrong=await other.connect();await assert.rejects(wrong.retrySavedClaim(),e=>e.code==='invalid_request');assert.equal(other.calls.length,0);wrong.dispose();
  }
});
test('callback transaction metadata honors UTF-8 byte bounds and rejects newline and lone surrogates',async()=>{
  const f=fixture(),c=await f.connect(),s=(await c.prepare(quote())).data.selection;await c.retainPurchaseAttempt(s.id);
  for(const tx of ['😀'.repeat(129),'txn\nvalue','txn\ud800','txn\udfff'])await assert.rejects(c.captureCallback(s.id,sdkCallback(tx)),e=>e.code==='invalid_request');
  assert.equal(f.calls.length,2);
  f.setTransport(async body=>({ok:true,text:async()=>JSON.stringify(f.result(body,{claim:claimFor(body),reason:null}))}));
  const tx='😀'.repeat(128);assert.equal(Buffer.byteLength(tx,'utf8'),512);
  assert.equal((await c.captureCallback(s.id,sdkCallback(tx))).data.claim.transactionIdentifier,tx);c.dispose();
});
test('multiple uncertain same-account retries preserve the intermediate session that actually inserted the assertion',async()=>{
  const f=fixture({deadlineMs:30}),c=await f.connect(),selection=(await c.prepare(quote())).data.selection;await c.retainPurchaseAttempt(selection.id);let request,claim;
  f.setTransport(body=>{request=body;return new Promise(()=>{});});await assert.rejects(c.captureCallback(selection.id,sdkCallback()),e=>e.code==='outcome_unknown');c.dispose();
  const middle=fixture({memory:f.memory,deadlineMs:30});middle.change({...A,sessionGeneration:uuid(28)});middle.setTransport(body=>{assert.deepEqual(body,request);claim=claimFor(body,uuid(28));return new Promise(()=>{});});
  const second=await middle.connect();await assert.rejects(second.retrySavedClaim(),e=>e.code==='outcome_unknown');second.dispose();
  const latest=fixture({memory:f.memory});latest.change({...A,sessionGeneration:uuid(29)});latest.setTransport(async body=>{assert.deepEqual(body,request);return{ok:true,text:async()=>JSON.stringify(latest.result(body,{claim,reason:null}))};});
  const third=await latest.connect();assert.equal((await third.retrySavedClaim()).data.claim.originalSessionGeneration,uuid(28));third.dispose();
});
test('callback rejects unconfirmed/mismatched selection or product and snapshots identifiers before storage wait',async()=>{
  const f=fixture(),c=await f.connect();await assert.rejects(c.captureCallback(`nssv1_selection_${uuid(11)}`,sdkCallback()),e=>e.code==='invalid_request');const s=(await c.prepare(quote())).data.selection;await c.retainPurchaseAttempt(s.id);
  for(const [selected,cb] of [[`nssv1_selection_${uuid(99)}`,sdkCallback()],[s.id,{...sdkCallback(),productIdentifier:'other'}],[s.id,{...sdkCallback(),transaction:{...sdkCallback().transaction,productIdentifier:'other'}}],[s.id,sdkCallback('')],[s.id,sdkCallback(' txn ')],[s.id,sdkCallback('a'.repeat(513))]])await assert.rejects(c.captureCallback(selected,cb),e=>e.code==='invalid_request');
  assert.equal(f.calls.length,2);const wait=f.delayStore(),cb=sdkCallback();
  f.setTransport(async body=>({ok:true,text:async()=>JSON.stringify(f.result(body,{claim:claimFor(body),reason:null}))}));
  const pending=c.captureCallback(s.id,cb);cb.transaction.transactionIdentifier='mutated';cb.productIdentifier='other';wait.resolve();
  assert.equal((await pending).data.claim.transactionIdentifier,'native-txn-1');c.dispose();
});
test('late or failed callback persistence never dispatches or permits a concurrent replacement; authority gaps retire late claims',async()=>{
  const f=fixture({deadlineMs:30}),c=await f.connect(),s=(await c.prepare(quote())).data.selection;await c.retainPurchaseAttempt(s.id);const wait=f.delayStore();
  await assert.rejects(c.captureCallback(s.id,sdkCallback()),e=>e.code==='unavailable');const other=await f.connect();await other.recover();
  await assert.rejects(other.captureCallback(s.id,sdkCallback('replacement')),e=>e.code==='saved_selection_requires_recovery');wait.resolve();await new Promise(r=>setTimeout(r,0));assert.equal(f.calls.some(c=>c.body.command==='claim'),false);c.dispose();other.dispose();
  const g=fixture(),d=await g.connect(),sel=(await d.prepare(quote())).data.selection;await d.retainPurchaseAttempt(sel.id);const late=deferred();let body;
  g.setTransport(async b=>{body=b;await late.promise;return{ok:true,text:async()=>JSON.stringify(g.result(b,{claim:claimFor(body),reason:null}))};});
  const pending=d.captureCallback(sel.id,sdkCallback());const rejected=assert.rejects(pending,e=>e.code==='authority_retired');await new Promise(r=>setTimeout(r,0));g.change(B);g.change(A);late.resolve();await rejected;d.dispose();
});
const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
function mountFixture(f, flavor=0, sessionOverride=null, canGoBack=true, readProduct=null) {
  const navigation=[];
  const productReads=[];
  const products=productReader(f,async ids=>{productReads.push([...ids]);return readProduct?readProduct():[{identifier:'one_time',price:1.99,currencyCode:'USD'}];});
  let nodes=[];const primitive=name=>function NativePrimitive(props){nodes.push({name,props});return ['Text','ActivityIndicator'].includes(name)?null:React.createElement(React.Fragment,null,props.children);};
  const native={Platform:{OS:'ios'},StyleSheet:{create:v=>v,absoluteFillObject:{position:'absolute',top:0,right:0,bottom:0,left:0}},...Object.fromEntries(['ActivityIndicator','ImageBackground','Pressable','ScrollView','Text','View'].map(n=>[n,primitive(n)]))};
  const visual=load('../../components/ui/chillywood-visual-system.tsx',{'react':React,'react-native':native,'react-native-svg':{}});
  const background={asset:'assets/images/chillywood-branded-background.png'};
  const component=load('../../components/monetization/native-store-sandbox-quote-screen.tsx',{'react':React,'react-native':native,'react-native-safe-area-context':{SafeAreaView:primitive('SafeAreaView')},'expo-router':{useLocalSearchParams:()=>({offerId}),useRouter:()=>({canGoBack:()=>canGoBack,back(){navigation.push('back');},replace(path){navigation.push(path);}})},
    '../../assets/images/chillywood-branded-background.png':background,'../ui/chillywood-visual-system':visual,
    '../../_lib/nativeStoreSandboxProduct':products,
    '../../_lib/session':{useSession:()=>sessionOverride??({user:{id:f.current().userId},authority:f.current(),isLoading:false})},'../../_lib/isolatedTestStoreBuild':{isIsolatedTestStoreFlavor:()=>flavor===1},'../../_lib/isolatedTestStoreV2Build':{isIsolatedTestStoreV2Flavor:()=>flavor===2},'../../_lib/isolatedTestStoreV3Build':{isIsolatedTestStoreV3Flavor:()=>flavor===3},'../../_lib/nativeStoreSandboxQuote':f.api,'../navigation/app-back-button':{AppBackButton:primitive('AppBackButton')}});
  const root=createRoot(container());const flush=()=>React.act(async()=>{await new Promise(r=>setTimeout(r,0));});
  const button=id=>nodes.filter(n=>n.props.testID===id).at(-1).props;
  return {button,flush,background,productReads,visual:visual.CHILLYWOOD_VISUAL,navigation,nodes:()=>nodes,clear(){nodes=[];},render:()=>React.act(async()=>root.render(React.createElement(component.NativeStoreSandboxQuoteScreen))),unmount:()=>React.act(async()=>root.unmount())};
}
test('mounted store availability action uses read-only shared owner and says neither test-account proof nor purchase permission',async()=>{
  const f=fixture(),m=mountFixture(f);await m.render();await m.flush();assert.equal(m.productReads.length,0);
  await React.act(async()=>m.button('native-sandbox-check-product').onPress());await m.flush();assert.deepEqual(m.productReads,[['one_time']]);
  assert.equal(m.button('native-sandbox-prepare').disabled,false);assert.ok(m.nodes().some(n=>n.props.testID==='native-sandbox-price'&&n.props.children[0]==='1.99'));
  assert.ok(m.nodes().some(n=>n.name==='Text'&&String(n.props.children).includes('does not verify a test account or enable a purchase')));assert.deepEqual(f.calls.map(v=>v.body.command),['offer']);await m.unmount();
});
test('mounted device read is single-flight and late old-account product result cannot update replacement screen',async()=>{
  const f=fixture(),wait=deferred(),m=mountFixture(f,0,null,true,()=>wait.promise);await m.render();await m.flush();
  const button=m.button('native-sandbox-check-product');await React.act(async()=>{button.onPress();button.onPress();});assert.equal(m.productReads.length,1);
  f.change(B);await m.render();await m.flush();m.clear();wait.resolve([{identifier:'one_time',price:1.99,currencyCode:'USD'}]);await m.flush();
  assert.equal(m.nodes().some(n=>n.name==='Text'&&String(n.props.children).includes("This device's store product and price")),false);await m.unmount();
});
test('shared branded background and transparent safe-area layout remain on ready, loading, signed-out and held screens; back has Library fallback',async()=>{
  assert.ok(fs.existsSync(new URL('../../assets/images/chillywood-branded-background.png',import.meta.url)));
  for(const state of ['ready','loading','signed-out','held']){
    const session=state==='loading'?{user:null,authority:null,isLoading:true}:state==='signed-out'?{user:null,authority:null,isLoading:false}:null;
    const m=mountFixture(fixture(),state==='held'?3:0,session,state!=='signed-out');await m.render();await m.flush();
    const bg=m.nodes().find(n=>n.name==='ImageBackground');assert.equal(bg.props.source,m.background);assert.equal(bg.props.resizeMode,'cover');
    for(const n of m.nodes().filter(n=>['ImageBackground','SafeAreaView'].includes(n.name)))assert.equal(n.props.style.backgroundColor,undefined,'opaque inner surfaces must not hide branding');
    assert.ok(m.nodes().some(n=>n.name==='View'&&n.props.pointerEvents==='none'&&n.props.style.backgroundColor==='rgba(0,0,0,0.76)'));
    assert.ok(m.nodes().some(n=>n.name==='ScrollView'&&n.props.contentContainerStyle.paddingBottom===48));
    if(state==='ready'){assert.ok(m.nodes().some(n=>n.name==='View'&&n.props.style?.backgroundColor===m.visual.glassBackground));assert.equal(m.button('native-sandbox-prepare').style[0].backgroundColor,m.visual.controlBackground);}
    m.button('native-sandbox-back').onPress();assert.deepEqual(m.navigation,[state==='signed-out'?'/(tabs)/my-list':'back']);await m.unmount();
  }
});
test('mounted normal screen prepares and recovers for ordinary active user without any store invocation',async()=>{
  const f=fixture(),m=mountFixture(f);await m.render();await m.flush();
  assert.equal(m.button('native-sandbox-prepare').disabled,false);
  const prepare=m.button('native-sandbox-prepare');m.clear();
  await React.act(async()=>prepare.onPress());await m.flush();
  assert.equal(m.button('native-sandbox-prepare').disabled,true);await React.act(async()=>m.button('native-sandbox-recover').onPress());await m.flush();
  assert.deepEqual(f.calls.map(c=>c.body.command),['offer','prepare','recover']);assert.ok(m.nodes().some(n=>n.name==='Text'&&String(n.props.children).includes('not enabled')));
  await m.unmount();
});
test('mounted account replacement cannot receive a delayed previous-account selection',async()=>{
  const f=fixture(),m=mountFixture(f),wait=deferred();await m.render();await m.flush();
  f.setTransport(async body=>{if(body.command==='prepare')await wait.promise;return {ok:true,text:async()=>JSON.stringify(f.result(body,body.command==='offer'?{quote:quote(),reason:null}:{selection:{id:`nssv1_selection_${uuid(11)}`,originalRequestId:body.requestId,originalSessionGeneration:A.sessionGeneration,createdAt:'2026-11-08T01:00:00Z',quote:quote()},reason:null}))};});
  await React.act(async()=>m.button('native-sandbox-prepare').onPress());
  f.change(B);m.clear();await m.render();await m.flush();wait.resolve();await m.flush();
  assert.equal(m.button('native-sandbox-prepare').disabled,false);assert.equal(m.button('native-sandbox-recover').disabled,true);
  assert.equal(m.nodes().some(n=>n.name==='Text'&&String(n.props.children).includes('Your exact selection is recorded')),false);await m.unmount();
});
test('mounted saved selection resumes recovery-only after unmount, never a replacement prepare',async()=>{
  const f=fixture(),first=mountFixture(f);await first.render();await first.flush();await React.act(async()=>first.button('native-sandbox-prepare').onPress());await first.flush();await first.unmount();
  const resumed=mountFixture(f);await resumed.render();await resumed.flush();assert.equal(resumed.button('native-sandbox-prepare').disabled,true);assert.equal(resumed.button('native-sandbox-recover').disabled,false);
  await React.act(async()=>resumed.button('native-sandbox-recover').onPress());await resumed.flush();assert.deepEqual(f.calls.map(c=>c.body.command),['offer','prepare','recover']);await resumed.unmount();
});
test('unmounted screen discards late read and all isolated Test Store flavors remain separate',async()=>{
  const f=fixture(),wait=deferred();f.setTransport(async body=>{await wait.promise;return{ok:true,text:async()=>JSON.stringify(f.result(body,{quote:quote(),reason:null}))};});
  const m=mountFixture(f);await m.render();await m.flush();await m.unmount();m.clear();wait.resolve();await m.flush();assert.equal(m.nodes().length,0);
  for(const flavor of [1,2,3]){const isolated=fixture(),view=mountFixture(isolated,flavor);await view.render();await view.flush();assert.equal(isolated.calls.length,0);assert.ok(view.nodes().some(n=>n.name==='Text'&&String(n.props.children).includes('normal internal')));await view.unmount();}
});

test('server reservation lost replies recover across sessions; exact request retry never replaces the purchase',async()=>{
 for(const committed of [false,true]) {
  const f=fixture({deadlineMs:30}),c=await f.connect(),selection=(await c.prepare(quote())).data.selection;let request,server=null;
  const make=(body,session)=>({id:`nssv1_reservation_${uuid(91)}`,selectionId:selection.id,originalRequestId:body.requestId,originalSessionGeneration:session,createdAt:'2026-11-08T00:00:00Z',quoteDigest:quote().quoteDigest,state:'dispatch_reserved',dispatchAllowed:false,providerQualified:false});
  f.setTransport(body=>{request=body;if(committed)server=make(body,A.sessionGeneration);return new Promise(()=>{});});
  await assert.rejects(c.retainPurchaseAttempt(selection.id),e=>e.code==='outcome_unknown');
  assert.equal((await c.readPurchaseAttempt()).serverReservationConfirmed,false);
  await assert.rejects(c.captureCallback(selection.id,sdkCallback()),e=>e.code==='invalid_request');c.dispose();
  const g=fixture({memory:f.memory});g.change({...A,sessionGeneration:uuid(92)});
  g.setTransport(async body=>{if(body.command==='reserve'){assert.deepEqual(body,request);server??=make(body,uuid(92));}
    return{ok:true,text:async()=>JSON.stringify(g.result(body,{reservation:server,reason:server?null:'reservation_unknown'},server?'ok':'unknown'))};});
  const recovered=await g.connect();assert.equal((await recovered.readPurchaseAttempt()).serverReservationConfirmed,false);
  assert.equal((await recovered.recoverPurchaseAttempt()).status,committed?'ok':'unknown');
  const retried=await recovered.retrySavedPurchaseReservation();assert.equal(retried.data.reservation.originalSessionGeneration,committed?A.sessionGeneration:uuid(92));
  assert.equal((await recovered.readPurchaseAttempt()).serverReservationConfirmed,true);assert.ok(g.calls.every(v=>['reserve','reserve-recover'].includes(v.body.command)));recovered.dispose();
 }
});
test('server reservation rejects forged authority, request, scope, and late account results',async()=>{
 for(const mutate of [r=>r.dispatchAllowed=true,r=>r.providerQualified=true,r=>r.selectionId=`nssv1_selection_${uuid(99)}`,r=>r.originalRequestId=uuid(99),r=>r.quoteDigest='d'.repeat(64),r=>r.createdAt='yesterday']){
  const f=fixture(),c=await f.connect(),selection=(await c.prepare(quote())).data.selection;
  f.setTransport(async body=>{const r={id:`nssv1_reservation_${uuid(91)}`,selectionId:selection.id,originalRequestId:body.requestId,originalSessionGeneration:A.sessionGeneration,createdAt:'2026-11-08T00:00:00Z',quoteDigest:quote().quoteDigest,state:'dispatch_reserved',dispatchAllowed:false,providerQualified:false};mutate(r);return{ok:true,text:async()=>JSON.stringify(f.result(body,{reservation:r,reason:null}))};});
  await assert.rejects(c.retainPurchaseAttempt(selection.id),e=>e.code==='outcome_unknown');assert.equal((await c.readPurchaseAttempt()).serverReservationConfirmed,false);c.dispose();
 }
 const f=fixture(),c=await f.connect(),selection=(await c.prepare(quote())).data.selection,wait=deferred();f.setTransport(()=>wait.promise);
 const p=c.retainPurchaseAttempt(selection.id);const rejected=assert.rejects(p,e=>e.code==='authority_retired');await new Promise(r=>setTimeout(r,0));f.change(B);wait.resolve({ok:false});await rejected;c.dispose();
});
test('mounted retained reservation recovery is read-only and stays separate from device availability',async()=>{
 const f=fixture(),c=await f.connect(),selection=(await c.prepare(quote())).data.selection;await c.retainPurchaseAttempt(selection.id);c.dispose();const start=f.calls.length;
 const m=mountFixture(f);await m.render();await m.flush();assert.equal(m.button('native-sandbox-reservation-recover').disabled,true);
 assert.ok(m.nodes().some(n=>n.props.testID==='native-sandbox-reservation-status'&&n.props.children.includes('has not been checked')));
 await React.act(async()=>m.button('native-sandbox-recover').onPress());await m.flush();assert.equal(m.button('native-sandbox-reservation-recover').disabled,false);
 await React.act(async()=>m.button('native-sandbox-reservation-recover').onPress());await m.flush();
 const status=()=>m.nodes().filter(n=>n.props.testID==='native-sandbox-reservation-status').at(-1).props.children;
 assert.match(status(),/server has this exact reservation/u);
 await React.act(async()=>m.button('native-sandbox-check-product').onPress());await m.flush();assert.match(status(),/server has this exact reservation/u);
 assert.deepEqual(f.calls.slice(start).map(v=>v.body.command),['recover','reserve-recover']);
 assert.equal(m.nodes().some(n=>n.name==='Pressable'&&/reserve|purchase|retry/iu.test(String(n.props.testID))&&!/recover/u.test(String(n.props.testID))),false);await m.unmount();
 const empty=mountFixture(fixture());await empty.render();await empty.flush();assert.equal(empty.nodes().some(n=>n.props.testID==='native-sandbox-reservation-recover'),false);await empty.unmount();
});
test('mounted reservation unknown/failed reads retain the original request and never reserve or resend',async()=>{
 for(const outcome of ['unknown','failure']){
  const f=fixture(),c=await f.connect(),selection=(await c.prepare(quote())).data.selection;await c.retainPurchaseAttempt(selection.id);c.dispose();const durable=[...f.memory];
  const m=mountFixture(f);await m.render();await m.flush();await React.act(async()=>m.button('native-sandbox-recover').onPress());await m.flush();
  f.setTransport(async body=>outcome==='failure'?{ok:false}:{ok:true,text:async()=>JSON.stringify(f.result(body,{reservation:null,reason:'reservation_unknown'},'unknown'))});
  const start=f.calls.length;await React.act(async()=>m.button('native-sandbox-reservation-recover').onPress());await m.flush();
  const text=m.nodes().filter(n=>n.props.testID==='native-sandbox-reservation-status').at(-1).props.children;
  assert.match(text,/not confirmed|could not be confirmed/u);assert.match(text,/original request/u);assert.deepEqual([...f.memory],durable);
  assert.deepEqual(f.calls.slice(start).map(v=>v.body.command),['reserve-recover']);await m.unmount();
 }
});
test('mounted reservation reads are single-flight and discarded after account replacement or unmount',async()=>{
 for(const stop of ['account','unmount']){
  const f=fixture(),c=await f.connect(),selection=(await c.prepare(quote())).data.selection;await c.retainPurchaseAttempt(selection.id);c.dispose();
  const m=mountFixture(f);await m.render();await m.flush();await React.act(async()=>m.button('native-sandbox-recover').onPress());await m.flush();
  const wait=deferred();f.setTransport(async body=>body.command==='reserve-recover'?wait.promise:{ok:true,text:async()=>JSON.stringify(f.result(body,{quote:quote(),reason:null}))});
  const start=f.calls.length,button=m.button('native-sandbox-reservation-recover');await React.act(async()=>{button.onPress();button.onPress();});assert.equal(f.calls.length,start+1);
  if(stop==='account'){f.change(B);await m.render();await m.flush();}else await m.unmount();
  m.clear();wait.resolve({ok:false});await m.flush();assert.equal(m.nodes().some(n=>n.props.testID==='native-sandbox-reservation-status'),false);
  if(stop==='account')await m.unmount();
 }
});
const consumedEvidence=(selection,reservation)=>({id:`nssv1_attempt_${uuid(95)}`,reservationId:reservation.id,selectionId:selection.id,originalRequestId:uuid(96),originalSessionGeneration:A.sessionGeneration,quoteDigest:selection.quote.quoteDigest,createdAt:'2026-11-08T00:00:00Z',state:'consumed',dispatchAllowed:false,providerQualified:false});
test('dormant retainer persists original-account evidence after retirement, with exact duplicate-only callbacks',async()=>{
 const f=fixture(),c=await f.connect(),selection=(await c.prepare(quote())).data.selection;await c.retainPurchaseAttempt(selection.id);const reservation=(await c.recoverPurchaseAttempt()).data.reservation;
 const consumed=consumedEvidence(selection,reservation),retain=await c.createCallbackRetainer(selection.id,consumed),start=f.calls.length;
 consumed.id=`nssv1_attempt_${uuid(99)}`;const wait=f.delayStore(),evidence={productIdentifier:'one_time',transactionIdentifier:'original'};
 const pending=retain(evidence,A);evidence.transactionIdentifier='mutated';f.change(B);c.dispose();
 const duplicate=retain({productIdentifier:'one_time',transactionIdentifier:'original'},A);assert.equal(duplicate,pending);
 await assert.rejects(retain({productIdentifier:'one_time',transactionIdentifier:'different'},A),e=>e.code==='outcome_unknown');
 wait.resolve();await pending;assert.equal(f.calls.length,start);
 const claim=[...f.memory.values()].map(v=>JSON.parse(v)).find(v=>v.version===2);assert.equal(claim.userId,A.userId);assert.equal(claim.transactionIdentifier,'original');assert.equal(claim.consumedAttempt.id,`nssv1_attempt_${uuid(95)}`);
 const other=fixture({memory:f.memory});other.change(B);const wrong=await other.connect();await assert.rejects(wrong.retrySavedClaim(),e=>e.code==='invalid_request');assert.equal(other.calls.length,0);wrong.dispose();
 const restart=fixture({memory:f.memory});restart.change({...A,sessionGeneration:uuid(98)});restart.setTransport(async body=>({ok:true,text:async()=>JSON.stringify(restart.result(body,{claim:claimFor(body,uuid(98)),reason:null}))}));
 const original=await restart.connect();assert.equal((await original.retrySavedClaim()).data.claim.transactionIdentifier,'original');assert.deepEqual(Object.keys(restart.calls[0].body.payload).sort(),['productIdentifier','selectionId','transactionIdentifier']);original.dispose();
});
test('retainer factory refuses absent/incorrect reservation, consumed scope and nonoriginal authority',async()=>{
 const f=fixture(),c=await f.connect(),selection=(await c.prepare(quote())).data.selection;
 await assert.rejects(c.createCallbackRetainer(selection.id,{}),e=>e.code==='invalid_request');await c.retainPurchaseAttempt(selection.id);const reservation=(await c.recoverPurchaseAttempt()).data.reservation,good=consumedEvidence(selection,reservation);
 for(const patch of [{reservationId:`nssv1_reservation_${uuid(99)}`},{selectionId:`nssv1_selection_${uuid(99)}`},{quoteDigest:'e'.repeat(64)},{originalSessionGeneration:uuid(99)},{dispatchAllowed:true},{providerQualified:true},{state:'reserved'}])await assert.rejects(c.createCallbackRetainer(selection.id,{...good,...patch}),e=>e.code==='invalid_request');
 const retain=await c.createCallbackRetainer(selection.id,good);await assert.rejects(retain({productIdentifier:'one_time',transactionIdentifier:'txn'},B),e=>e.code==='invalid_request');
 await assert.rejects(retain({productIdentifier:'one_time',transactionIdentifier:'txn',rawReceipt:'secret'},A),e=>e.code==='invalid_request');assert.equal(f.memory.size,2);c.dispose();
});
test('retired local retainer timeout stays uncertain, never sends or replaces original evidence',async()=>{
 const f=fixture({deadlineMs:30}),c=await f.connect(),selection=(await c.prepare(quote())).data.selection;await c.retainPurchaseAttempt(selection.id);const reservation=(await c.recoverPurchaseAttempt()).data.reservation;
 const retain=await c.createCallbackRetainer(selection.id,consumedEvidence(selection,reservation)),wait=f.delayStore(),start=f.calls.length,evidence={productIdentifier:'one_time',transactionIdentifier:'retained'};
 c.dispose();const pending=retain(evidence,A);await assert.rejects(pending,e=>e.code==='outcome_unknown');assert.equal(retain(evidence,A),pending);
 await assert.rejects(retain({...evidence,transactionIdentifier:'replacement'},A),e=>e.code==='outcome_unknown');wait.resolve();await new Promise(r=>setTimeout(r,0));
 assert.equal(f.calls.length,start);assert.equal([...f.memory.values()].map(v=>JSON.parse(v)).find(v=>v.version===2).transactionIdentifier,'retained');
});
