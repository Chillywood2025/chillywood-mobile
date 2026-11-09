import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import {webcrypto} from 'node:crypto';
import {syntheticNativePurchaseOwner} from '../helpers/native-store-sdk-owner.mjs';
const id=n=>`e0000000-0000-4000-8000-${String(n).padStart(12,'0')}`,A={userId:id(1),accountId:id(1),sessionGeneration:id(2),state:'ACTIVE',restoreOnly:false};
const offerId='scv1_offer_'+id(3),selectionId='nssv1_selection_'+id(4),reservationId='nssv1_reservation_'+id(5);
const quote=()=>({offerId,offerRevision:1,resourceId:'scv1_resource_'+id(6),resourceRevision:1,creatorId:id(7),kind:'paid_content',amountMinor:199,currency:'usd',asset:{id:'scv1_asset_'+id(8),incarnation:id(9),sha256:'a'.repeat(64),byteLength:10,resourceRevision:1,profile:'scpv-mp4-h264-aac-v1'},catalog:{bindingId:'nssv1_catalog_'+id(10),revision:1,projectId:'synthetic-project',appId:'synthetic-app',store:'APP_STORE',environment:'SANDBOX',wireProductId:'synthetic-product'},quoteDigest:'b'.repeat(64)});
const load=(path,bindings,extra={})=>{const scope={exports:{},crypto:webcrypto,AbortController,setTimeout,clearTimeout,...extra,require:name=>{assert.ok(Object.hasOwn(bindings,name),'unmodeled import '+name);return bindings[name];}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../../'+path,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,scope);return scope.exports;};
const gate=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
async function fixture({reserve=true}={}){
 let current=A,selection,reservation,consumed=null,qualified=true,failStage=null,loseResponse=false,beforeServer=false,sdkGate=null,callback=()=>{},appEnvironment='SANDBOX',signedVersion='1.0',qualPatch={},buildEnabled=true,holdStage=null,storageGate=null;const listeners=new Set(),memory=new Map(),events=[],requests=[];let purchases=0;
 const authority={getCurrentAccountSessionAuthoritySnapshot:()=>current,sameAccountSessionAuthority:(a,b)=>!!a&&!!b&&['userId','accountId','sessionGeneration','state','restoreOnly'].every(k=>a[k]===b[k]),subscribeToAccountSessionAuthority:f=>{listeners.add(f);return()=>listeners.delete(f);}};
 const storage={getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>{const row=JSON.parse(v);if(row.state===failStage)throw Error('disk');if(row.state===holdStage){events.push('writing:'+row.state);await storageGate.promise;}memory.set(k,v);events.push(row.state??'saved');}};
 const q=quote(),qualification=()=>({id:'nssv1_qualification_'+id(20),revision:1,projectId:q.catalog.projectId,appId:q.catalog.appId,store:'APP_STORE',environment:'SANDBOX',wireProductId:q.catalog.wireProductId,catalogBindingId:q.catalog.bindingId,catalogRevision:1,quoteDigest:q.quoteDigest,connectionId:id(21),connectionRevision:1,protocolEvidenceSha256:'c'.repeat(64),platform:'ios',nativeBuild:'43',nativeVersion:'1.0',sdkVersion:'10.15.1',noChargeAccountScope:'testflight_distribution',accountEvidenceSha256:'d'.repeat(64),...qualPatch});
 const transport=async(_url,options)=>{const b=JSON.parse(options.body);requests.push(b);const actor={userId:current.userId,accountId:current.accountId,sessionGeneration:current.sessionGeneration};let data,status='ok',dispatchAllowed=false;
  if(b.command==='prepare'){selection={id:selectionId,originalRequestId:b.requestId,originalSessionGeneration:current.sessionGeneration,createdAt:'2026-11-09T00:00:00Z',quote:q};data={selection,reason:null};}
  else if(b.command==='recover')data={selection,reason:null};
  else if(b.command==='reserve'){reservation={id:reservationId,selectionId,originalRequestId:b.requestId,originalSessionGeneration:current.sessionGeneration,createdAt:'2026-11-09T00:00:00Z',quoteDigest:q.quoteDigest,state:'dispatch_reserved',dispatchAllowed:false,providerQualified:false};data={reservation,reason:null};}
  else if(b.command==='reserve-recover')data={reservation,reason:null};
  else if(b.command==='dispatch-qualification'){status=qualified?'ok':'held';data={qualification:qualified?qualification():null,reason:qualified?null:'qualification_unavailable'};}
  else if(b.command==='dispatch-consume'||b.command==='dispatch-recover'){
   if(beforeServer)throw Error('transport before commit');
   if(!qualified){status='held';data={attempt:null,qualification:null,newlyConsumed:false,reason:'qualification_unavailable'};}
   else if(!consumed&&b.command==='dispatch-recover'){status='unknown';data={attempt:null,qualification:null,newlyConsumed:false,reason:'attempt_unknown'};}
   else{const fresh=!consumed&&b.command==='dispatch-consume';if(fresh)consumed={id:'nssv1_attempt_'+id(22),reservationId,selectionId,originalRequestId:b.requestId,originalSessionGeneration:current.sessionGeneration,quoteDigest:q.quoteDigest,createdAt:'2026-11-09T00:00:00Z',state:'consumed',dispatchAllowed:false,providerQualified:false};dispatchAllowed=fresh;data={attempt:consumed,qualification:qualification(),newlyConsumed:fresh,reason:null};}
   if(loseResponse)throw Error('transport after commit');
  }else throw Error('unexpected '+b.command);
  return{ok:true,text:async()=>JSON.stringify({protocol:'native-store-sandbox-command-v1',command:b.command,requestId:b.requestId,actor,status,data,dispatchAllowed,correlation:'unsupported'})};
 };
 const contract=load('supabase/functions/_shared/native-store-sandbox-dispatch-contract-v1.ts',{});
 const clientBindings={'../supabase/functions/_shared/native-store-sandbox-dispatch-contract-v1':contract,'@react-native-async-storage/async-storage':storage,'react-native-get-random-values':{},'./accountSessionAuthority':authority,'./accountBoundSupabaseMutation':{captureAccountBoundSupabaseMutationSubject:async()=>({authority:current,accessToken:'synthetic'})},'./supabase':{SUPABASE_URL:'https://local.invalid',SUPABASE_ANON_KEY:'synthetic-public'}};
 const clientApi=()=>load('_lib/nativeStoreSandboxQuote.ts',clientBindings,{fetch:transport});
 const initial=await clientApi().captureNativeSandboxQuoteClient(current,offerId,'APP_STORE',{storage});await initial.prepare(q);if(reserve)await initial.retainPurchaseAttempt(selectionId);initial.dispose();
 const owner=syntheticNativePurchaseOwner({readAuthority:()=>current,purchase:async()=>{purchases++;events.push('sdk');callback();if(sdkGate)await sdkGate.promise;return{productIdentifier:q.catalog.wireProductId,transaction:{productIdentifier:q.catalog.wireProductId,transactionIdentifier:'synthetic-txn',purchaseDate:'2026-11-09T00:00:00Z',purchaseToken:'never-retain'},customerInfo:{entitlements:{active:{},all:{}},activeSubscriptions:[],originalAppUserId:A.userId}};}});
 const product={identifier:q.catalog.wireProductId,price:1.99,currencyCode:'USD',priceString:'$1.99',title:'Synthetic',description:'Synthetic'};
 const sdk={...owner,getRevenueCatAppUserId:async()=>current.userId,canMakeRevenueCatPurchases:async()=>true,readRevenueCatNonSubscriptionProducts:async()=>[product]};
 const module=()=>load('_lib/nativeStoreSandboxDispatch.ts',{'@react-native-async-storage/async-storage':storage,'./runtimeConfig':{getRuntimeConfig:()=>({revenueCat:{appStorePurchasesEnabled:buildEnabled}})},'./nativeStoreSandboxQuote':clientApi(),'./accountSessionAuthority':authority,'./nativeStoreSandboxProduct':{readNativeSandboxAppEvidence:async()=>({status:'observed',evidence:{environment:appEnvironment,signedAppVersion:signedVersion,unsignedNativeBuild:'43',unsignedNativeVersion:'1.0'}})},'./revenuecat':sdk,'./creatorMoneyStoreQuote':load('_lib/creatorMoneyStoreQuote.ts',{})});
 let dispatcher=module();
 return{memory,events,requests,run:(recoverOnly=false)=>dispatcher.dispatchPreparedNativeSandboxPurchase(current,offerId,'APP_STORE',selectionId,{storage,deadlineMs:30,recoverOnly}),restart(){dispatcher=module();},counts:()=>purchases,change(){current={...A,sessionGeneration:id(99)};listeners.forEach(f=>f(current));},switchAccount(){current={...A,userId:id(98),accountId:id(98)};listeners.forEach(f=>f(current));},holdStorage(stage){holdStage=stage;storageGate=gate();return storageGate;},setBuildEnabled(v){buildEnabled=v;},setQualified(v){qualified=v;},setFailure(v){failStage=v;},setLoss(v){loseResponse=v;},setBefore(v){beforeServer=v;},setEnvironment(v){appEnvironment=v;},setSignedVersion(v){signedVersion=v;},setQualification(v){qualPatch=v;},onSdk(fn){callback=fn;},holdSdk(){sdkGate=gate();return sdkGate;}};
}
test('actual client and SDK owner invoke synthetic purchase only after committed consume and durable markers',async()=>{
 const f=await fixture();assert.equal((await f.run()).status,'callback_retained');assert.equal(f.counts(),1);assert.ok(f.events.indexOf('consumed')<f.events.indexOf('sdk_started'));assert.ok(f.events.indexOf('sdk_started')<f.events.indexOf('sdk'));
 assert.equal([...f.memory.values()].some(v=>v.includes('never-retain')),false);assert.ok([...f.memory.values()].some(v=>v.includes('synthetic-txn')));await assert.rejects(f.run());f.restart();await assert.rejects(f.run());assert.equal(f.counts(),1);assert.equal((await f.run(true)).dispatchAllowed,false);
});
test('missing qualification, wrong scope/build, and production app evidence never call SDK',async()=>{
 for(const kind of ['missing','scope','build','production','signed-version','build-disabled']){const f=await fixture();if(kind==='missing')f.setQualified(false);if(kind==='build-disabled')f.setBuildEnabled(false);if(kind==='scope')f.setQualification({projectId:'other'});if(kind==='build')f.setQualification({nativeBuild:'other'});if(kind==='production')f.setEnvironment('PRODUCTION');if(kind==='signed-version')f.setSignedVersion('0.9');try{await f.run();}catch{}assert.equal(f.counts(),0,kind);}
});
test('unknown server reply never purchases on restart; original request remains recovery-only',async()=>{
 const f=await fixture();f.setLoss(true);await assert.rejects(f.run());f.setLoss(false);assert.equal((await f.run(true)).dispatchAllowed,false);assert.equal(f.counts(),0);f.restart();f.change();assert.equal((await f.run()).status,'blocked');assert.equal(f.counts(),0);const ids=f.requests.filter(r=>r.command==='dispatch-consume').map(r=>r.requestId);assert.equal(new Set(ids).size,1);
});
test('failed durable consumed or pre-SDK marker prevents SDK even after server consumption',async()=>{
 for(const stage of ['consume_pending','consumed','sdk_started']){const f=await fixture();f.setFailure(stage);await assert.rejects(f.run());assert.equal(f.counts(),0);if(stage!=='consume_pending'){f.setFailure(null);f.restart();try{await f.run();}catch{}assert.equal(f.counts(),0);}}
});
test('account retirement during actual owner callback retains original account whitelist before rejecting',async()=>{
 const f=await fixture();f.onSdk(()=>f.switchAccount());await assert.rejects(f.run());assert.equal(f.counts(),1);const claim=[...f.memory.values()].map(v=>JSON.parse(v)).find(v=>v.transactionIdentifier==='synthetic-txn');assert.equal(claim.userId,A.userId);assert.equal(claim.productIdentifier,'synthetic-product');
});
test('missing callback leaves durable sdk_started fence, restart never purchases again',async()=>{
 const f=await fixture(),gate=f.holdSdk();const first=f.run();while(!f.counts())await new Promise(r=>setTimeout(r,1));f.restart();await assert.rejects(f.run());assert.equal(f.counts(),1);gate.resolve();await first;
});

test('lost-before-server retry reuses immutable request under renewed session, not a replacement purchase',async()=>{
 const f=await fixture();f.setBefore(true);await assert.rejects(f.run());f.setBefore(false);f.restart();f.change();assert.equal((await f.run()).status,'callback_retained');assert.equal(f.counts(),1);assert.equal(new Set(f.requests.filter(r=>r.command==='dispatch-consume').map(r=>r.requestId)).size,1);
});
test('timed-out durable write may complete late but never starts SDK or permits replacement after consume',async()=>{
 const f=await fixture(),wait=f.holdStorage('consumed');await assert.rejects(f.run());assert.equal(f.counts(),0);assert.ok(f.events.includes('writing:consumed'));wait.resolve();await new Promise(r=>setTimeout(r,0));f.restart();await assert.rejects(f.run());assert.equal(f.counts(),0);
});
test('concurrent explicit callers cannot queue a second SDK operation',async()=>{
 const f=await fixture(),wait=f.holdSdk();const first=f.run();while(!f.counts())await new Promise(r=>setTimeout(r,1));await assert.rejects(f.run());assert.equal(f.counts(),1);wait.resolve();await first;
});
test('qualified SDK contract version is the exact app JavaScript dependency',()=>{assert.equal(JSON.parse(fs.readFileSync(new URL('../../package.json',import.meta.url),'utf8')).dependencies['react-native-purchases'],'10.15.1');});

test('fresh checkout discovers qualification before reserving; absent evidence creates no permanent reservation',async()=>{
 const missing=await fixture({reserve:false});missing.setQualified(false);assert.equal((await missing.run()).status,'blocked');assert.equal(missing.requests.some(r=>r.command==='reserve'),false);assert.equal(missing.counts(),0);
 const ready=await fixture({reserve:false});assert.equal((await ready.run()).status,'callback_retained');assert.equal(ready.counts(),1);const commands=ready.requests.map(r=>r.command);assert.ok(commands.indexOf('dispatch-qualification')<commands.indexOf('reserve'));assert.ok(commands.indexOf('reserve')<commands.indexOf('dispatch-consume'));
});
