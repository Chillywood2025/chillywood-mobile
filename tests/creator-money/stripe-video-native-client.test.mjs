import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const id='00000000-0000-4000-8000-000000000001';
const source=ts.transpileModule(readFileSync('_lib/stripePaidVideoNative.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const parserSource=ts.transpileModule(readFileSync('_lib/stripePaidVideoSandbox.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness({platform='ios',retained=null,recovery,patch={},badOffer=false,switchAfter=false,invokeError=false,edgeUnavailable=false,granted=false}={}){
 const calls=[],links=[],exports={};let saved=retained,current=true,stores=0,retired=false;
 const offer={available:true,checkoutAllowed:true,canAccess:false,reason:'ready',videoId:id,creatorId:id,priceId:id,priceRevision:1,amountMinor:100,currency:'usd',provider:'stripe',environment:'sandbox'};
 if(granted){offer.canAccess=true;offer.checkoutAllowed=false;}
 const row={...offer,buyerId:id,requestId:id,orderId:id,checkoutPlatform:platform,status:'checkout_ready',checkoutUrl:'https://checkout.stripe.com/c/pay/test',...patch};
 const parser={};new Function('require','exports',parserSource)(()=>({}),parser);
 const deps={
 'react-native':{Platform:{OS:platform},Linking:{openURL:async url=>links.push(url)}},'expo-crypto':{randomUUID:()=>id},
 './supabase':{supabase:{rpc:async()=>{calls.push('offer');return {data:badOffer?{...offer,priceRevision:0}:offer};},functions:{invoke:async(_name,{body})=>{if(body.action==='eligibility')return {error:edgeUnavailable?Error('disabled'):null,data:{...offer,checkoutPlatform:platform}};calls.push(body);if(switchAfter)current=false;return {error:invokeError?Error('offline'):null,data:body.action?(recovery??{...row,checkoutUrl:undefined}):row};}}}},
 './entitlementAuthority':{withAuthorityReadDeadline:async p=>p},
 './accountBoundSupabaseMutation':{captureAccountBoundSupabaseMutationSubject:async()=>({authority:{userId:id},accessToken:'secret'}),assertAccountBoundSupabaseMutationSubjectCurrent:()=>{if(!current)throw Error('account changed');}},
 './stripeVideoNativeAttemptJournal':{withNativeStripeVideoAttempt:async(_u,_v,check,fn)=>{check();return fn({read:async()=>saved,prepare:async()=>saved={requestId:id,orderId:null},remember:async(_a,orderId)=>{check();saved={requestId:id,orderId};},retireUnpaid:async()=>{saved=null;retired=true;}});}},
 './stripePaidVideoSandbox':parser,
 './iosExternalAdmission':{assertIosExternalStorefront:async()=>{stores++;return {countryCode:'USA'};}},
 './google-play-external-content-links':{withGooglePlayExternalContentLink:async cb=>{calls.push('sdk');const result=await cb({google_play_external_link_api_version:1,google_play_external_transaction_token:'opaque'});links.push(result.url);}},
 };
 new Function('require','exports',source)(name=>{if(!(name in deps))throw Error(name);return deps[name];},exports);
 return {api:exports,calls,links,saved:()=>saved,stores:()=>stores,retired:()=>retired};
}
test('iOS and Android initial exact checkout use platform SDK and only persist IDs',async()=>{
 for(const platform of ['ios','android']){const h=harness({platform});await h.api.openNativeStripeSandboxVideoCheckout(id);assert.equal(h.links.length,1);assert.deepEqual(h.saved(),{requestId:id,orderId:id});assert.equal(h.stores(),platform==='ios'?2:0);const body=h.calls.find(x=>x.nativeObservation);assert.deepEqual(body.nativeObservation,platform==='ios'?{apiVersion:1,countryCode:'USA'}:{apiVersion:1,externalTransactionToken:'opaque'});}
});
test('retained order or request only reconciles, even if server includes an old URL',async()=>{
 for(const orderId of [id,null]){const h=harness({platform:'android',retained:{requestId:id,orderId}});await h.api.openNativeStripeSandboxVideoCheckout(id);assert.equal(h.links.length,0);assert.equal(h.calls.includes('sdk'),false);assert.equal(h.calls[0].action,orderId?'status':'recover');assert.equal(h.calls.length,1);}
});
test('conclusive absent request reuses ID, refresh alone never creates',async()=>{
 const recovery={found:false,requestId:id,videoId:id,buyerId:id,environment:'sandbox',provider:'stripe'};
 const h=harness({retained:{requestId:id,orderId:null},recovery});await h.api.openNativeStripeSandboxVideoCheckout(id);assert.equal(h.links.length,1);assert.equal(h.calls.find(x=>x.nativeObservation).requestId,id);
 const refresh=harness({retained:{requestId:id,orderId:null},recovery});await refresh.api.refreshNativeStripeSandboxVideoPayment(id);assert.equal(refresh.calls.length,1);assert.equal(refresh.links.length,0);
});
test('failed unpaid retires without automatic creation',async()=>{
 const h=harness({retained:{requestId:id,orderId:id},patch:{status:'failed',canAccess:false}});await h.api.openNativeStripeSandboxVideoCheckout(id);assert.equal(h.retired(),true);assert.equal(h.calls.length,1);assert.equal(h.links.length,0);
});
test('changed identity price platform and malformed offer never navigate',async()=>{
 for(const patch of [{checkoutPlatform:'web'},{buyerId:'other'},{priceRevision:2},{orderId:'bad'},{currency:'eur'},{checkoutUrl:'https://evil.test/pay'}]){const h=harness({patch});await assert.rejects(h.api.openNativeStripeSandboxVideoCheckout(id));assert.equal(h.links.length,0);assert.ok(h.saved());}
 const h=harness({badOffer:true});await assert.rejects(h.api.openNativeStripeSandboxVideoCheckout(id));assert.equal(h.saved(),null);assert.deepEqual(h.calls,['offer']);
});
test('account changes and network ambiguity retain request without launch or second POST',async()=>{
 for(const options of [{switchAfter:true},{invokeError:true}]){const h=harness(options);await assert.rejects(h.api.openNativeStripeSandboxVideoCheckout(id));assert.equal(h.links.length,0);assert.deepEqual(h.saved(),{requestId:id,orderId:null});}
});
test('wrong absent identity cannot start new checkout; web unsupported',async()=>{
 const h=harness({retained:{requestId:id,orderId:null},recovery:{found:false,buyerId:'other'}});await assert.rejects(h.api.openNativeStripeSandboxVideoCheckout(id));assert.equal(h.calls.length,1);
 const web=harness({platform:'web'});await assert.rejects(web.api.openNativeStripeSandboxVideoCheckout(id));assert.equal(web.calls.length,0);
});

test('native access survives disabled edge but checkout does not; existing grants avoid edge',async()=>{
 const h=harness({edgeUnavailable:true});const offer=await h.api.readNativeStripeSandboxVideoAccess(id);assert.equal(offer.available,true);assert.equal(offer.checkoutAllowed,false);await assert.rejects(h.api.openNativeStripeSandboxVideoCheckout(id));assert.equal(h.saved(),null);
 const granted=harness({granted:true,edgeUnavailable:true});const access=await granted.api.readNativeStripeSandboxVideoAccess(id);assert.equal(access.canAccess,true);assert.equal(access.checkoutAllowed,false);
});
