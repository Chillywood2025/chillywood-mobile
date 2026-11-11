import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const module = {exports:{}};
new Function('exports','module',ts.transpileModule(readFileSync('supabase/functions/_shared/native-production-store-verification.ts','utf8'),
  {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText)(module.exports,module);
const {appleTransactionFacts,googleTransactionFacts,googleMoneyCents,verifyGoogleIntegrityVerdict,readGooglePurchase,decodeGoogleIntegrity}=module.exports;
const context={provider:'app_store',applicationId:'fixture.app',buyerId:'buyer',productId:'video',transactionId:'tx'};
const apple={environment:'Production',bundleId:'fixture.app',transactionId:'tx',originalTransactionId:'original',productId:'video',
  quantity:1,currency:'USD',inAppOwnershipType:'PURCHASED',appAccountToken:'buyer',type:'Consumable',price:4990,purchaseDate:1700000000000};
test('Apple actual signed-data normalization requires exact identity, purchase and milliunit amount',()=>{
  assert.equal(appleTransactionFacts(apple,context).grossMinor,499);
  for(const change of [{environment:'Sandbox'},{bundleId:'other'},{transactionId:'other'},{productId:'other'},
    {quantity:2},{currency:'EUR'},{inAppOwnershipType:'FAMILY_SHARED'},{appAccountToken:'other'},
    {revocationDate:1},{revocationReason:0},{price:4991},{price:0},{purchaseDate:NaN},{type:'Auto-Renewable Subscription'}])
    assert.throws(()=>appleTransactionFacts({...apple,...change},context));
});
const googleContext={...context,provider:'google_play',purchaseToken:'private-token',expectedGoogleAccountId:'stable-account'};
const purchase={orderId:'tx',purchaseStateContext:{purchaseState:'PURCHASED'},obfuscatedExternalAccountId:'stable-account',
  purchaseCompletionTime:'2026-11-11T01:00:00Z',productLineItem:[{productId:'video',productOfferDetails:{quantity:1,refundableQuantity:1}}]};
const total={currencyCode:'USD',units:'4',nanos:990000000};
const zero={currencyCode:'USD'};
const order={orderId:'tx',purchaseToken:'private-token',state:'PROCESSED',total,tax:zero,orderDetails:{taxInclusive:false},orderHistory:{},
  lineItems:[{productId:'video',listingPrice:total,total,tax:zero,oneTimePurchaseDetails:{quantity:1}}]};
test('Google requires both actual token purchase and exact processed order, never a listing price',()=>{
  assert.equal(googleTransactionFacts(purchase,order,googleContext).grossMinor,499);
  for(const change of [{orderId:'other'},{testPurchaseContext:{}},{purchaseStateContext:{purchaseState:'PENDING'}},
    {obfuscatedExternalAccountId:'other'},{productLineItem:[]},{purchaseCompletionTime:null}])
    assert.throws(()=>googleTransactionFacts({...purchase,...change},order,googleContext));
  for(const change of [{purchaseToken:'other'},{state:'REFUNDED'},{total:null},{lineItems:[]},{orderHistory:{refundEvent:{}}}])
    assert.throws(()=>googleTransactionFacts(purchase,{...order,...change},googleContext));
  for(const money of [{...total,nanos:1},{...total,nanos:1e9},{...total,units:'-1'},{...total,currencyCode:'JPY'},{...total,units:4}])
    assert.throws(()=>googleMoneyCents(money));
});
test('Google listing, paid total, tax and derived adjustment remain distinct, including zero cash',()=>{
 const money=cents=>({currencyCode:'USD',units:String(Math.floor(cents/100)),nanos:(cents%100)*1e7});
 const check=(listing,paid,tax,inclusive,points)=>{
  const changed={...order,total:money(paid),tax:money(tax),orderDetails:{taxInclusive:inclusive},
   lineItems:[{...order.lineItems[0],listingPrice:money(listing),total:money(paid),tax:money(tax)}],
   ...(points?{pointsDetails:{pointsCouponValue:money(listing),pointsSpent:'100',pointsDiscountRateMicros:'500000'}}:{})};
  return googleTransactionFacts(purchase,changed,googleContext);
 };
 for(const [listing,paid,tax,inclusive,points,adjustment] of [
  [199,215,16,false,false,0],[199,199,16,true,false,0],[199,165,16,false,false,50],
  [199,149,16,true,false,50],[199,0,0,false,true,199]]){
  const facts=check(listing,paid,tax,inclusive,points);
  assert.equal(facts.grossMinor,paid);assert.equal(facts.pricing.listingMinor,listing);
  assert.equal(facts.pricing.taxMinor,tax);assert.equal(facts.pricing.adjustmentMinor,adjustment);
  assert.equal(facts.pricing.allocation,'unknown');assert.equal(facts.pricing.pointsPresent,points);
 }
 assert.equal(googleMoneyCents(zero),0,'omitted protobuf numeric scalars default zero in a present USD Money');
 assert.throws(()=>googleMoneyCents(undefined),'absent Money message is not zero');
 assert.throws(()=>check(199,215,16,true,false));
 assert.throws(()=>check(199,15,16,false,false));
 for(const patch of [{tax:undefined},{tax:money(1)},{orderDetails:{taxInclusive:'false'}},
  {pointsDetails:{pointsDiscountRateMicros:'1000001'}},{lineItems:[{...order.lineItems[0],listingPrice:null}]},
  {lineItems:[{...order.lineItems[0],oneTimePurchaseDetails:{quantity:2}}]}])
  assert.throws(()=>googleTransactionFacts(purchase,{...order,...patch},googleContext));
});
test('Google readers use only official fixed paths and read operations',async()=>{
  const calls=[];
  const result=await readGooglePurchase(googleContext,'synthetic-token',new AbortController().signal,async(url,options)=>{
    calls.push({url,options});return new Response(JSON.stringify(calls.length===1?purchase:order));
  });
  assert.equal(result.grossMinor,499);assert.equal(calls.length,2);
  for(const call of calls){assert.match(call.url,/^https:\/\/androidpublisher.googleapis.com\/androidpublisher\/v3\/applications\/fixture.app\//);
    assert.equal(call.options.method,undefined);assert.equal(call.options.redirect,'error');assert.equal(call.options.cache,'no-store');}
});
const policy={applicationId:'fixture.app',nativeBuild:'1',certificateSha256:'certificate',requestHash:'hash',earliestMs:1700000000000,latestMs:1700000005000};
test('provider response bounds apply to streamed bytes before full allocation',async()=>{
  for (const declared of [false,true]) {
    for (const integrity of [false,true]) {
      let cancelled=false,reads=0;
      const response=new Response(new ReadableStream({pull(controller){reads++;controller.enqueue(new Uint8Array(32769));},
        cancel(){cancelled=true;}}),{headers:declared?{'content-length':'65537'}:{}});
      const fetcher=async()=>response;
      await assert.rejects(integrity
        ?decodeGoogleIntegrity('synthetic',policy,'synthetic',new AbortController().signal,fetcher)
        :readGooglePurchase(googleContext,'synthetic',new AbortController().signal,fetcher),/response_too_large/);
      assert.equal(cancelled,true);assert.ok(reads<=3);
    }
  }
});
const payload={requestDetails:{requestPackageName:'fixture.app',requestHash:'hash',timestampMillis:'1700000000001'},
  appIntegrity:{appRecognitionVerdict:'PLAY_RECOGNIZED',packageName:'fixture.app',versionCode:'1',certificateSha256Digest:['certificate']},
  accountDetails:{appLicensingVerdict:'LICENSED'},deviceIntegrity:{deviceRecognitionVerdict:['MEETS_DEVICE_INTEGRITY','MEETS_STRONG_INTEGRITY']}};
test('Play integrity binds exact challenge, app certificate/build, timestamp and device policy',()=>{
  verifyGoogleIntegrityVerdict({tokenPayloadExternal:payload},policy);
  for(const change of [{requestHash:'other'},{applicationId:'other'},{nativeBuild:'2'},{certificateSha256:'other'},
    {earliestMs:1700000000002},{latestMs:1700000000000}])
    assert.throws(()=>verifyGoogleIntegrityVerdict({tokenPayloadExternal:payload},{...policy,...change}));
  assert.throws(()=>verifyGoogleIntegrityVerdict({tokenPayloadExternal:{...payload,deviceIntegrity:{deviceRecognitionVerdict:['MEETS_BASIC_INTEGRITY']}}},policy));
  assert.throws(()=>verifyGoogleIntegrityVerdict({tokenPayloadExternal:{...payload,accountDetails:{appLicensingVerdict:'UNLICENSED'}}},policy));
});
