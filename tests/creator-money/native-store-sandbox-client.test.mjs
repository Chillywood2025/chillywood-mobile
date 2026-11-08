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
  transport=async body=>{if(body.command==='prepare')selection={id:`nssv1_selection_${uuid(11)}`,originalRequestId:body.requestId,originalSessionGeneration:current.sessionGeneration,createdAt:'2026-11-08T01:00:00Z',quote:body.payload.expectedQuote};
    const value=result(body,body.command==='offer'?{quote:quote(),reason:null}:{selection,reason:selection?null:'selection_unknown'},body.command==='recover'&&!selection?'unknown':'ok');return{ok:true,text:async()=>JSON.stringify(value)};};
  return{api,calls,storage,memory,authority,result,actor,connect:()=>api.captureNativeSandboxQuoteClient(current,offerId,'APP_STORE',{storage,deadlineMs}),
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
const sdkCallback=(transactionIdentifier='native-txn-1')=>({productIdentifier:'one_time',transaction:{transactionIdentifier,productIdentifier:'one_time',purchaseDate:'2026-11-08T01:00:00Z',purchaseToken:'MUST_NOT_PERSIST'},rawReceipt:'MUST_NOT_PERSIST'});
const claimFor=(body,session=A.sessionGeneration)=>({id:`nssv1_claim_${uuid(25)}`,selectionId:body.payload.selectionId,originalRequestId:body.requestId,originalSessionGeneration:session,createdAt:'2026-11-08T01:00:00Z',transactionIdentifier:body.payload.transactionIdentifier,productIdentifier:body.payload.productIdentifier,evidence:'client_assertion',settlementAllowed:false});
test('callback stores only exact transaction assertion before claim and process restart recovers same-account claim',async()=>{
  const f=fixture(),c=await f.connect(),s=(await c.prepare(quote())).data.selection;
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
  const f=fixture({deadlineMs:30}),c=await f.connect(),s=(await c.prepare(quote())).data.selection;let recorded;
  f.setTransport(body=>{recorded=claimFor(body);return new Promise(()=>{});});
  await assert.rejects(c.captureCallback(s.id,sdkCallback()),e=>e.code==='outcome_unknown');await assert.rejects(c.captureCallback(s.id,sdkCallback()),e=>e.code==='saved_selection_requires_recovery');c.dispose();
  const restarted=fixture({memory:f.memory});restarted.setTransport(async body=>({ok:true,text:async()=>JSON.stringify(restarted.result(body,{claim:recorded,reason:null}))}));
  const next=await restarted.connect();assert.equal((await next.recoverClaim()).data.claim.transactionIdentifier,'native-txn-1');assert.deepEqual(restarted.calls.map(c=>c.body.command),['claim-recover']);next.dispose();
});
test('claim recovery rejects changed ownership, assertion, transaction, or authority fields',async()=>{
  const f=fixture(),c=await f.connect(),s=(await c.prepare(quote())).data.selection;let original;
  f.setTransport(async body=>{original=claimFor(body);return{ok:true,text:async()=>JSON.stringify(f.result(body,{claim:original,reason:null}))};});await c.captureCallback(s.id,sdkCallback());
  for(const mutate of [v=>v.actor.userId=B.userId,v=>v.dispatchAllowed=true,v=>v.correlation='verified',v=>v.data.claim.settlementAllowed=true,v=>v.data.claim.evidence='provider_verified',v=>v.data.claim.selectionId=`nssv1_selection_${uuid(99)}`,v=>v.data.claim.transactionIdentifier='other',v=>v.data.claim.productIdentifier='other',v=>v.data.claim.originalRequestId=uuid(99),v=>v.data.claim.originalSessionGeneration='invalid',v=>v.data.claim.extra='grant']){
    f.setTransport(async body=>{const value=f.result(body,{claim:clone(original),reason:null});mutate(value);return{ok:true,text:async()=>JSON.stringify(value)};});await assert.rejects(c.recoverClaim(),e=>e.code==='unavailable');
  }
  f.setTransport(async body=>({ok:true,text:async()=>JSON.stringify(f.result(body,{claim:null,reason:'claim_unknown'},'unknown'))}));assert.equal((await c.recoverClaim()).status,'unknown');c.dispose();
});
test('explicit saved assertion retry keeps exact request across a new session whether old write committed or never arrived',async()=>{
  for(const committed of [false,true]){
    const f=fixture({deadlineMs:30}),c=await f.connect(),selection=(await c.prepare(quote())).data.selection;let first,serverClaim=null;
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
  const f=fixture(),c=await f.connect(),s=(await c.prepare(quote())).data.selection;
  for(const tx of ['😀'.repeat(129),'txn\nvalue','txn\ud800','txn\udfff'])await assert.rejects(c.captureCallback(s.id,sdkCallback(tx)),e=>e.code==='invalid_request');
  assert.equal(f.calls.length,1);
  f.setTransport(async body=>({ok:true,text:async()=>JSON.stringify(f.result(body,{claim:claimFor(body),reason:null}))}));
  const tx='😀'.repeat(128);assert.equal(Buffer.byteLength(tx,'utf8'),512);
  assert.equal((await c.captureCallback(s.id,sdkCallback(tx))).data.claim.transactionIdentifier,tx);c.dispose();
});
test('multiple uncertain same-account retries preserve the intermediate session that actually inserted the assertion',async()=>{
  const f=fixture({deadlineMs:30}),c=await f.connect(),selection=(await c.prepare(quote())).data.selection;let request,claim;
  f.setTransport(body=>{request=body;return new Promise(()=>{});});await assert.rejects(c.captureCallback(selection.id,sdkCallback()),e=>e.code==='outcome_unknown');c.dispose();
  const middle=fixture({memory:f.memory,deadlineMs:30});middle.change({...A,sessionGeneration:uuid(28)});middle.setTransport(body=>{assert.deepEqual(body,request);claim=claimFor(body,uuid(28));return new Promise(()=>{});});
  const second=await middle.connect();await assert.rejects(second.retrySavedClaim(),e=>e.code==='outcome_unknown');second.dispose();
  const latest=fixture({memory:f.memory});latest.change({...A,sessionGeneration:uuid(29)});latest.setTransport(async body=>{assert.deepEqual(body,request);return{ok:true,text:async()=>JSON.stringify(latest.result(body,{claim,reason:null}))};});
  const third=await latest.connect();assert.equal((await third.retrySavedClaim()).data.claim.originalSessionGeneration,uuid(28));third.dispose();
});
test('callback rejects unconfirmed/mismatched selection or product and snapshots identifiers before storage wait',async()=>{
  const f=fixture(),c=await f.connect();await assert.rejects(c.captureCallback(`nssv1_selection_${uuid(11)}`,sdkCallback()),e=>e.code==='invalid_request');const s=(await c.prepare(quote())).data.selection;
  for(const [selected,cb] of [[`nssv1_selection_${uuid(99)}`,sdkCallback()],[s.id,{...sdkCallback(),productIdentifier:'other'}],[s.id,{...sdkCallback(),transaction:{...sdkCallback().transaction,productIdentifier:'other'}}],[s.id,sdkCallback('')],[s.id,sdkCallback(' txn ')],[s.id,sdkCallback('a'.repeat(513))]])await assert.rejects(c.captureCallback(selected,cb),e=>e.code==='invalid_request');
  assert.equal(f.calls.length,1);const wait=f.delayStore(),cb=sdkCallback();
  f.setTransport(async body=>({ok:true,text:async()=>JSON.stringify(f.result(body,{claim:claimFor(body),reason:null}))}));
  const pending=c.captureCallback(s.id,cb);cb.transaction.transactionIdentifier='mutated';cb.productIdentifier='other';wait.resolve();
  assert.equal((await pending).data.claim.transactionIdentifier,'native-txn-1');c.dispose();
});
test('late or failed callback persistence never dispatches or permits a concurrent replacement; authority gaps retire late claims',async()=>{
  const f=fixture({deadlineMs:30}),c=await f.connect(),s=(await c.prepare(quote())).data.selection,wait=f.delayStore();
  await assert.rejects(c.captureCallback(s.id,sdkCallback()),e=>e.code==='unavailable');const other=await f.connect();await other.recover();
  await assert.rejects(other.captureCallback(s.id,sdkCallback('replacement')),e=>e.code==='saved_selection_requires_recovery');wait.resolve();await new Promise(r=>setTimeout(r,0));assert.equal(f.calls.some(c=>c.body.command==='claim'),false);c.dispose();other.dispose();
  const g=fixture(),d=await g.connect(),sel=(await d.prepare(quote())).data.selection,late=deferred();let body;
  g.setTransport(async b=>{body=b;await late.promise;return{ok:true,text:async()=>JSON.stringify(g.result(b,{claim:claimFor(body),reason:null}))};});
  const pending=d.captureCallback(sel.id,sdkCallback());const rejected=assert.rejects(pending,e=>e.code==='authority_retired');await new Promise(r=>setTimeout(r,0));g.change(B);g.change(A);late.resolve();await rejected;d.dispose();
});
const container=()=>({addEventListener:noop,removeEventListener:noop,namespaceURI:'http://www.w3.org/1999/xhtml',nodeName:'DIV',nodeType:1,ownerDocument:doc,parentNode:null,tagName:'DIV'});
doc.documentElement=container();globalThis.document=doc;globalThis.window=globalThis;globalThis.HTMLIFrameElement=class{};globalThis.IS_REACT_ACT_ENVIRONMENT=true;
function mountFixture(f, flavor=0, sessionOverride=null, canGoBack=true) {
  const navigation=[];
  let nodes=[];const primitive=name=>function NativePrimitive(props){nodes.push({name,props});return ['Text','ActivityIndicator'].includes(name)?null:React.createElement(React.Fragment,null,props.children);};
  const native={Platform:{OS:'ios'},StyleSheet:{create:v=>v,absoluteFillObject:{position:'absolute',top:0,right:0,bottom:0,left:0}},...Object.fromEntries(['ActivityIndicator','ImageBackground','Pressable','ScrollView','Text','View'].map(n=>[n,primitive(n)]))};
  const visual=load('../../components/ui/chillywood-visual-system.tsx',{'react':React,'react-native':native,'react-native-svg':{}});
  const background={asset:'assets/images/chillywood-branded-background.png'};
  const component=load('../../components/monetization/native-store-sandbox-quote-screen.tsx',{'react':React,'react-native':native,'react-native-safe-area-context':{SafeAreaView:primitive('SafeAreaView')},'expo-router':{useLocalSearchParams:()=>({offerId}),useRouter:()=>({canGoBack:()=>canGoBack,back(){navigation.push('back');},replace(path){navigation.push(path);}})},
    '../../assets/images/chillywood-branded-background.png':background,'../ui/chillywood-visual-system':visual,
    '../../_lib/session':{useSession:()=>sessionOverride??({user:{id:f.current().userId},authority:f.current(),isLoading:false})},'../../_lib/isolatedTestStoreBuild':{isIsolatedTestStoreFlavor:()=>flavor===1},'../../_lib/isolatedTestStoreV2Build':{isIsolatedTestStoreV2Flavor:()=>flavor===2},'../../_lib/isolatedTestStoreV3Build':{isIsolatedTestStoreV3Flavor:()=>flavor===3},'../../_lib/nativeStoreSandboxQuote':f.api,'../navigation/app-back-button':{AppBackButton:primitive('AppBackButton')}});
  const root=createRoot(container());const flush=()=>React.act(async()=>{await new Promise(r=>setTimeout(r,0));});
  const button=id=>nodes.filter(n=>n.props.testID===id).at(-1).props;
  return {button,flush,background,visual:visual.CHILLYWOOD_VISUAL,navigation,nodes:()=>nodes,clear(){nodes=[];},render:()=>React.act(async()=>root.render(React.createElement(component.NativeStoreSandboxQuoteScreen))),unmount:()=>React.act(async()=>root.unmount())};
}
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
