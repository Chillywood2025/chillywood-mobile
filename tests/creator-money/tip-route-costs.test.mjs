import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
export function loadCosts() {
  const module={exports:{}};
  new Function('exports','module',ts.transpileModule(fs.readFileSync('_lib/creatorTipRouteCosts.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module.exports,module);
  return module.exports;
}
const {compareCreatorTipRouteCosts:compare}=loadCosts();
const now=Date.parse('2026-10-30T19:00:00Z'), expiry='2026-10-30T19:05:00Z';
const expected={buyerId:'buyer',sessionId:'session',creatorId:'creator',amountMinor:299,currency:'usd',platform:'ios',environment:'test'};
function snapshot() {
  const routeId=(provider,index)=>`${provider==='app_store'?'revenuecat_app_store':provider}:binding-${index}`;
  const routes=['app_store','stripe_connect'].map((provider,index)=>({routeId:routeId(provider,index),provider,purchaseBindingId:`binding-${index}`,
    qualification:'eligible',qualificationEvidenceId:'qualification',eligibilityExpiresAt:expiry,
    fees:{...expected,benefit:'creator_tip_no_access',routeId:routeId(provider,index),purchaseBindingId:`binding-${index}`,evidenceId:'evidence',
      authority:'account_qualified',allUnavoidableFeesIncluded:true,expiresAt:expiry,processorMinor:index?45:0,storeMinor:index?0:60,
      platformMinor:0,otherMinor:0,totalMinor:index?45:60,buyerTotalMinor:299,taxMinor:0,taxTreatment:'not_taxed',feeBaseMinor:299}}));
  return {...expected,version:1,available:true,noAccessGranted:true,liveMoneyAction:false,benefit:'creator_tip_no_access',
    completeCandidateSet:true,unresolvedPayment:false,expiresAt:expiry,routes};
}
test('complete exact account-qualified fee comparison recommends without payment dispatch',()=>{
  const result=compare(snapshot(),expected,now);
  assert.equal(result.status,'compared');assert.deepEqual(result.lowestCostRouteIds,['stripe_connect:binding-1']);assert.equal(result.totalFeeMinor,45);
});
test('unknown fees on any eligible alternative prevent cheapest claim, never count as zero',()=>{
  for(const mutation of [s=>s.routes[0].fees=null,s=>delete s.routes[0].fees.otherMinor,s=>s.routes[0].fees.processorMinor=null,
    s=>s.routes[0].fees.authority='public_rate',s=>s.routes[0].fees.allUnavoidableFeesIncluded=false,
    s=>s.routes[0].fees.totalMinor=0,s=>s.routes[0].fees.otherMinor=-1,s=>s.routes[0].fees.otherMinor=0.1,
    s=>s.completeCandidateSet=false,s=>s.unresolvedPayment=true,s=>s.routes[0].qualification='unknown',
    s=>delete s.routes[0].fees.taxMinor,s=>s.routes[0].fees.taxTreatment='unknown',s=>delete s.routes[0].fees.feeBaseMinor,
    s=>Object.assign(s.routes[0].fees,{taxMinor:30,taxTreatment:'exclusive',buyerTotalMinor:329,totalMinor:90})]) {
    const s=snapshot();mutation(s);const result=compare(s,expected,now);assert.equal(result.status,'incomplete');assert.deepEqual(result.lowestCostRouteIds,[]);
  }
});
test('buyer/session/creator/exact amount/currency/platform/environment/benefit and fresh evidence must match',()=>{
  for(const key of Object.keys(expected)) {
    for(const layer of ['envelope','fee']) {const s=snapshot();(layer==='envelope'?s:s.routes[0].fees)[key]='wrong';assert.equal(compare(s,expected,now).status,'incomplete');}
  }
  for(const mutation of [s=>s.routes[0].fees.purchaseBindingId='wrong',s=>s.routes[0].fees.routeId='wrong',
    s=>s.routes[0].fees.benefit='vip',s=>s.routes[0].provider='google_play',s=>s.routes.push(s.routes[0]),
    s=>s.expiresAt=new Date(now).toISOString(),s=>s.routes[0].eligibilityExpiresAt=new Date(now).toISOString(),
    s=>s.routes[0].fees.expiresAt=new Date(now).toISOString()]) {
    const s=snapshot();mutation(s);assert.equal(compare(s,expected,now).status,'incomplete');
  }
});
test('no matching SKU is not a candidate; one route is not a comparison; ties preserve both',()=>{
  const s=snapshot();s.routes.pop();assert.equal(compare(s,expected,now).status,'single_route');
  const tie=snapshot();tie.routes[1].fees.processorMinor=60;tie.routes[1].fees.totalMinor=60;
  assert.deepEqual(compare(tie,expected,now).lowestCostRouteIds,['revenuecat_app_store:binding-0','stripe_connect:binding-1']);
  assert.equal(compare(null,expected,now).status,'unavailable');
  const extra=snapshot();for(const route of extra.routes) Object.assign(route.fees,{
    taxMinor:30,taxTreatment:'exclusive',buyerTotalMinor:329,totalMinor:route.fees.totalMinor+30});
  assert.equal(compare(extra,expected,now).status,'incomplete','equal additional tax is still unsupported by current exact-charge dispatch');
});

test('real client reader invokes only read RPC, rejects session replacement and unsupported native binding',async()=>{
  let authority={userId:'buyer',sessionGeneration:'session',restoreOnly:false}, reply=snapshot(), calls=[];
  const module={exports:{}};
  const mocks={
    'react-native':{Platform:{OS:'ios'}},
    './supabase':{supabase:{rpc:async(name,args)=>{calls.push({name,args});return {data:reply,error:null};}}},
    './accountSessionAuthority':{getCurrentAccountSessionAuthoritySnapshot:()=>authority,
      sameAccountSessionAuthority:(a,b)=>a.userId===b.userId&&a.sessionGeneration===b.sessionGeneration},
    './entitlementAuthority':{withAuthorityReadDeadline:async promise=>promise},
    './creatorTipRouteCosts':{compareCreatorTipRouteCosts:(payload,subject)=>compare(payload,subject,now)},
    './revenuecat':{getRevenueCatProductionReadiness:()=>({iosPublicKeyConfigured:true}),readRevenueCatNonSubscriptionProducts:async()=>[{identifier:'native-product',price:2.99,currencyCode:'USD'}]},
    './runtimeConfig':{getRuntimeConfig:()=>({revenueCat:{appStorePurchasesEnabled:true}})},
    './paymentRailPolicy':{resolvePaymentRailPolicy:()=>({allowed:true,provider:'revenuecat_app_store'})},
    './creatorMoneyStoreQuote':{isCreatorMoneyStoreQuoteMatch:(product,expected)=>product.identifier===expected.productId&&product.price*100===expected.amountMinor},
    './google-play-external-content-links':{isGooglePlayExternalContentLinkSupported:()=>true},
    './iosExternalAdmission':{isIosExternalCheckoutSupported:()=>true},
  };
  new Function('exports','module','require',ts.transpileModule(fs.readFileSync('_lib/readCreatorTipRouteCosts.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module.exports,module,name=>{
      assert.ok(name in mocks,`unexpected dependency ${name}`);return mocks[name];
    });
  const read=module.exports.readCreatorTipRouteCosts;
  const nativePrice={priceKey:'binding-0',amountMinor:299,providerProductId:'native-product'};
  assert.equal((await read('creator',299,[nativePrice])).status,'compared');
  assert.equal(calls[0].name,'get_creator_tip_route_costs');assert.deepEqual(calls[0].args,{p_creator_id:'creator',p_amount_minor:299,p_platform:'ios'});
  assert.equal((await read('creator',299,[])).status,'unavailable');
  reply=snapshot();reply.routes.push({...reply.routes[0],routeId:'another-native',purchaseBindingId:'binding-2'});
  assert.equal((await read('creator',299,[nativePrice,{...nativePrice,priceKey:'binding-2'}])).status,'unavailable');
  reply=snapshot();
  mocks['./paymentRailPolicy'].resolvePaymentRailPolicy=()=>({allowed:false});
  assert.equal((await read('creator',299,[nativePrice])).status,'unavailable');
  mocks['./paymentRailPolicy'].resolvePaymentRailPolicy=()=>({allowed:true,provider:'revenuecat_app_store'});
  mocks['./revenuecat'].readRevenueCatNonSubscriptionProducts=async()=>[];
  assert.equal((await read('creator',299,[nativePrice])).status,'unavailable');
  mocks['./supabase'].supabase.rpc=async()=>{authority={...authority,sessionGeneration:'replacement'};return {data:reply,error:null};};
  assert.equal((await read('creator',299,[nativePrice])).status,'unavailable');
});
