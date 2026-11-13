import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

const source=ts.transpileModule(readFileSync('_lib/creatorPaidVideos.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function harness({platform='ios',historical=false,failed=false,eligible=true,granted=false,changed=false}={}) {
 const calls=[],api={};
 const access={available:true,canAccess:granted,checkoutAllowed:eligible&&!granted,amountMinor:100,currency:'usd',creatorId:'creator'};
 const deps={
  'react-native':{Platform:{OS:platform}},
  './supabase':{supabase:{rpc:async()=>({error:failed?Error('offline'):null,data:{allowed:historical,reason:historical?'active_grant':'stripe_sandbox_protected_delivery_required',resolverStatus:'resolved'}})}},
  './creatorMonetization':{normalizeCreatorContentAccessResolution:x=>x},
  './entitlementAuthority':{withAuthorityReadDeadline:async p=>p},
  './creatorMoneyPurchaseAuthority':{captureCreatorMoneyPurchaseAuthority:()=>({}),isCreatorMoneyPurchaseAuthorityCurrent:()=>!changed},
  './stripePaidVideoSandbox':{readStripeSandboxVideoAccess:async()=>{calls.push('web-read');return access;},openStripeSandboxVideoCheckout:async()=>{calls.push('web-open');return 'pending';},refreshStripeSandboxVideoPayment:async()=>{calls.push('web-refresh');return 'pending';}},
  './stripePaidVideoNative':{readNativeStripeSandboxVideoAccess:async()=>{calls.push('native-read');return access;},openNativeStripeSandboxVideoCheckout:async()=>{calls.push('native-open');return 'pending';},refreshNativeStripeSandboxVideoPayment:async()=>{calls.push('native-refresh');return 'pending';}},
 };
 new Function('require','exports',source)(name=>deps[name]??{},api);
 return {api,calls};
}
for(const platform of ['web','ios','android']) {
 test(`${platform} routes canonical Stripe offer to its admitted transport`,async()=>{
  const h=harness({platform}); const r=await h.api.purchasePaidVideoAccess({videoId:'video',creatorId:'creator',amountCents:100});
  assert.equal(r.ok,false); assert.equal(r.access.provider,'stripe'); assert.deepEqual(h.calls,[platform==='web'?'web-read':'native-read',platform==='web'?'web-open':'native-open']);
 });
 test(`${platform} historical grant avoids a second purchase`,async()=>{
  const h=harness({platform,historical:true}); const r=await h.api.purchasePaidVideoAccess({videoId:'video',creatorId:'creator',amountCents:100});
  assert.equal(r.ok,true); assert.deepEqual(h.calls,[]);
 });
 test(`${platform} disabled eligibility and changed quote cannot open checkout`,async()=>{
  for(const options of [{eligible:false},{changed:true},{}]) {
   const h=harness({platform,...options}); const r=await h.api.purchasePaidVideoAccess({videoId:'video',creatorId:'creator',amountCents:101});
   assert.equal(r.ok,false); assert.equal(h.calls.some(x=>x.endsWith('open')),false);
  }
 });
 test(`${platform} authoritative read failure does not fall through to checkout`,async()=>{
  const h=harness({platform,failed:true}); const r=await h.api.purchasePaidVideoAccess({videoId:'video',creatorId:'creator',amountCents:100}); assert.equal(r.ok,false); assert.deepEqual(h.calls,[]);
 });
 test(`${platform} refresh selects status-only transport`,async()=>{
  const h=harness({platform});await h.api.refreshPaidVideoPayment('video');assert.deepEqual(h.calls,[platform==='web'?'web-refresh':'native-refresh']);
 });
}
