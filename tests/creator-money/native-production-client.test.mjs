import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';
import {syntheticNativePurchaseOwner} from '../helpers/native-store-sdk-owner.mjs';
const id=n=>`e0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const authority={userId:id(1),accountId:id(1),sessionGeneration:id(2),state:'ACTIVE',restoreOnly:false};
const subject={userId:id(1),accessToken:'synthetic',authority};
const expected={userId:id(1),sourceType:'paid_content',sourceId:id(3),creatorId:id(4),provider:'revenuecat_google_play',
 providerProductId:'synthetic-video',environment:'production',amountMinor:199,currency:'usd'};
function fixture({enabled=true,pending=false,changeAt='',outcome='witness',reconcileStatus='HELD',authorizationFailures=0,lostNativeResponse=false,preEntryFailure=''}={}){
 let current=authority, purchases=0,recoveries=0;const calls=[];const AppState={currentState:'active'};
 const native={dispatchId:id(5),admissionId:id(6),quoteId:'a'.repeat(64),challenge:'b'.repeat(64),buyerId:id(1),sessionId:id(2),
  productId:'synthetic-video',grossMinor:'199',currency:'USD',configurationSha256:'c'.repeat(64),applicationId:'fixture.app',nativeBuild:'1',sdkVersion:'10.28.1',launchBeforeMs:String(Date.now()+60000)};
 const hit=name=>{calls.push(name);if(changeAt===name)current={...authority,sessionGeneration:id(9)};};
 const completed=()=>({status:outcome,dispatchId:id(5),witness:'synthetic-witness',integrityToken:'synthetic-token'});
 const owner=syntheticNativePurchaseOwner({readAuthority:()=>{hit('ownerRead');return current;},purchase:()=>{throw Error('legacy SDK must not run');},
  productionAuthorize:async()=>{hit('nativeClaimCheck');if(purchases>0)throw Error('native handle consumed');if(authorizationFailures-->0)throw Error('temporary authorization failure');},
  productionPurchase:async()=>{
   if(preEntryFailure){const error=preEntryFailure;preEntryFailure='';throw Error(error);}
   purchases++;if(lostNativeResponse)throw Error('native response interrupted');return completed();}});
 const bridge={status:async()=>{hit('status');return {protocol:'native-production-witness-v1',available:true,
  configurationSha256:native.configurationSha256,applicationId:native.applicationId,nativeBuild:'1',sdkVersion:'10.28.1'};},
  prepare:async()=>{hit('prepare');return 'native-handle';},recover:async()=>{recoveries++;return completed();}};
 const mocks={
  'react-native':{AppState,Platform:{OS:'android'}},'./nativeProductionPaidVideoBridge':{nativeProductionPaidVideoBridge:()=>bridge},
  './revenuecat':owner,'./supabase':{SUPABASE_URL:'https://fixture.invalid',SUPABASE_ANON_KEY:'synthetic-public'},
  './creatorMoneyPurchaseAuthority':{
   isCreatorMoneyPurchaseAuthorityCurrent:()=>current===authority,revalidateCreatorMoneyPurchaseSubject:async()=>current===authority,
   validateCreatorMoneyPurchaseIntent:row=>row.id===id(7)?row:null,
   invokeCreatorMoneyPurchaseSubjectRpc:async(_subject,name,args)=>{hit(name);let data;
    if(name==='list_native_production_purchase_recovery')data={dispatches:[{dispatchId:id(5),originalSessionId:id(2)}]};
    else if(name==='prepare_native_production_paid_video')data=pending?{nativeProductionPending:true,id:id(7),dispatchId:id(5),originalSessionId:id(2)}:
     {nativeProductionPreparation:{admissionId:id(6),quoteSha256:native.quoteId,dispatchAllowed:false}};
    else if(name==='get_native_production_paid_video_capability')data={protocol:'native-production-checkout-v1',environment:'production',enabled};
    else if(name==='create_native_production_paid_video_intent')data={id:id(7),nativeProductionDispatchId:id(5)};
    else if(name==='claim_native_production_paid_video_checkout')data={id:id(7),startAuthorized:true,dispatchAllowed:true,
     checkoutAttemptId:args.p_attempt_id,nativeProductionDispatchId:id(5),configurationSha256:native.configurationSha256,quoteSha256:native.quoteId};
    else throw Error('unexpected rpc '+name);
    return {data,error:null};
   },
  },
 };
 const output={};const code=ts.transpileModule(fs.readFileSync('_lib/nativeProductionPaidVideo.ts','utf8'),
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('exports','require','fetch','crypto',code)(output,key=>{assert.ok(key in mocks,key);return mocks[key];},async(url,init)=>{
  const body=JSON.parse(init.body);hit(body.action??'preflight');
  assert.equal(init.headers.Authorization,'Bearer synthetic');assert.equal(init.headers['X-Chillywood-Auth-Session'],id(2));
  const value=url.includes('/preflight/')?{status:'READY',admissionId:id(6)}:body.action==='prepare'?{status:'READY',nativeContext:native}:
   {status:body.action==='reconcile'?reconcileStatus:'HELD',accessGranted:reconcileStatus==='ACCESS_VERIFIED',financialAuthority:false,payable:false};
  return new Response(JSON.stringify(value));
 },webcrypto);
 return {run:()=>output.purchaseNativeProductionPaidVideo(subject,expected,'synthetic-key'),refresh:()=>output.reconcileNativeProductionPaidVideoPurchases(subject),calls,
  pending:()=>{pending=true;},
  counts:()=>({purchases,recoveries}),background:()=>{AppState.currentState='background';}};
}
test('Purchases recovery is no-charge, single flight and current-account bound across interrupted retries',async()=>{
 for(const restart of [false,true]){
  const f=fixture();await Promise.all([f.refresh(),f.refresh()]);
  assert.deepEqual(f.counts(),{purchases:0,recoveries:1});
  assert.ok(f.calls.indexOf('reconcile')<f.calls.indexOf('complete'));
  if(restart){const relaunched=fixture();await relaunched.refresh();assert.equal(relaunched.counts().purchases,0);}
  else {await f.refresh();assert.equal(f.counts().purchases,0);}
 }
 const bound=fixture({reconcileStatus:'ACCESS_VERIFIED'});await bound.refresh();assert.deepEqual(bound.counts(),{purchases:0,recoveries:0});
 for(const changeAt of ['list_native_production_purchase_recovery','reconcile']){
  const f=fixture({changeAt});await f.refresh();assert.deepEqual(f.counts(),{purchases:0,recoveries:0});
 }
 for(const outcome of ['unknown','cancelled']){const f=fixture({outcome});await f.refresh();assert.equal(f.counts().purchases,0);assert.ok(!f.calls.includes('complete'));}
});
test('normal production client uses shared one-shot native owner and separate verified access',async()=>{
 const f=fixture();const result=await f.run();assert.equal(result.launched,true);assert.equal(result.accessGranted,false);
 assert.deepEqual(f.counts(),{purchases:1,recoveries:0});
 assert.ok(f.calls.indexOf('claim_native_production_paid_video_checkout')>f.calls.indexOf('prepare'));
 assert.equal(f.calls.filter(x=>x==='preflight').length,3);
});
test('shared owner rechecks after the native direct claimed-dispatch await',async()=>{
 const f=fixture({changeAt:'nativeClaimCheck'});await assert.rejects(f.run);assert.equal(f.counts().purchases,0);
});
test('authorization retries preserve the same original process handle and never repeat an uncertain invocation',async()=>{
 const transient=fixture({authorizationFailures:1});await transient.run();assert.equal(transient.counts().purchases,1);
 assert.equal(transient.calls.filter(x=>x==='nativeClaimCheck').length,2);
 const retry=fixture({authorizationFailures:2});await assert.rejects(retry.run);assert.equal(retry.counts().purchases,0);
 const preparations=retry.calls.filter(x=>x==='prepare').length;
 retry.pending();assert.equal((await retry.run()).launched,true);assert.equal(retry.counts().purchases,1);
 assert.equal(retry.calls.filter(x=>x==='prepare').length,preparations,'same native handle, no re-preparation');
 assert.equal(retry.calls.filter(x=>x==='claim_native_production_paid_video_checkout').length,1,'same claimed dispatch');
 const uncertain=fixture({lostNativeResponse:true});await assert.rejects(uncertain.run);uncertain.pending();await assert.rejects(uncertain.run);
 assert.equal(uncertain.counts().purchases,1);
 const restarted=fixture({pending:true,outcome:'unknown'});await restarted.run();assert.equal(restarted.counts().purchases,0,'restart never reconstructs a launch handle');
});
test('known live native pre-entry failures retry the same handle without reconstructing a Store call',async()=>{
 // Native boundary doubles exercise the actual JS owner/retained-handle path.
 // They do not substitute for Swift/Kotlin compile or device fault injection.
 for(const preEntryFailure of ['final-owned-check','journal-before-write','journal-after-atomic-write']){
  const f=fixture({preEntryFailure});await assert.rejects(f.run);assert.equal(f.counts().purchases,0);
  f.pending();await f.run();assert.equal(f.counts().purchases,1);
  assert.equal(f.calls.filter(x=>x==='claim_native_production_paid_video_checkout').length,1);
 }
 const swift=fs.readFileSync('modules/chillywood-production-paid-video/ios/ChillywoodProductionPaidVideoModule.swift','utf8');
 const kotlin=fs.readFileSync('modules/chillywood-production-paid-video/android/src/main/java/expo/modules/chillywoodproductionpaidvideo/ChillywoodProductionPaidVideoModule.kt','utf8');
 const swiftEntry=swift.slice(swift.indexOf('func purchase(_ handle:'),swift.indexOf('func attestStored('));
 assert.ok(swiftEntry.indexOf('try write(journal')<swiftEntry.indexOf('entryState[handle] = .invoked'));
 assert.ok(swiftEntry.indexOf('entryState[handle] = .invoked')<swiftEntry.indexOf('purchases.purchase('));
 assert.match(swiftEntry,/entryEpoch\[handle\] == epoch && entryState\[handle\] == \.checking/);
 const androidEntry=kotlin.slice(kotlin.indexOf('fun purchase(handle:'),kotlin.indexOf('private fun attest('));
 assert.ok(androidEntry.indexOf('write(dispatch, record)')<androidEntry.indexOf('entryState[handle]=EntryState.INVOKED'));
 assert.ok(androidEntry.indexOf('entryState[handle]=EntryState.INVOKED')<androidEntry.indexOf('purchases.purchase(params,callback)'));
 assert.match(androidEntry,/entryEpoch\[handle\]==epoch && entryState\[handle\]==EntryState.CHECKING/);
});
test('OFF/unknown and changed ownership after each await never fall through to a Store charge',async()=>{
 for(const enabled of [false,undefined,null,'true']){const f=fixture({enabled:enabled===undefined?null:enabled});await assert.rejects(f.run);assert.equal(f.counts().purchases,0);}
 for(const changeAt of ['status','prepare_native_production_paid_video','get_native_production_paid_video_capability','preflight',
  'create_native_production_paid_video_intent','prepare','claim_native_production_paid_video_checkout','ownerRead']){
  const f=fixture({changeAt});await assert.rejects(f.run);assert.equal(f.counts().purchases,0,changeAt);
 }
 const background=fixture();background.background();await assert.rejects(background.run);assert.equal(background.counts().purchases,0);
});
test('pending recovery, cancellation and unknown completion never invoke a second purchase',async()=>{
 const recovery=fixture({pending:true,enabled:false});await recovery.run();assert.deepEqual(recovery.counts(),{purchases:0,recoveries:1});
 assert.equal(recovery.calls.includes('claim_native_production_paid_video_checkout'),false);
 for(const outcome of ['unknown','cancelled']){const f=fixture({outcome});const result=await f.run();assert.equal(result.accessGranted,false);
  assert.deepEqual(f.counts(),{purchases:1,recoveries:0});assert.equal(f.calls.includes('complete'),false);}
});
