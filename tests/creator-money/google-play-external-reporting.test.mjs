import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPureTypeScriptModule} from '../helpers/pure-typescript-module.mjs';
const {googlePrice,externalReportRequest,submitExternalReport}=loadPureTypeScriptModule('supabase/functions/_shared/google-play-external-reporting.ts');
const {googlePlayStripeTaxEvidence}=loadPureTypeScriptModule('supabase/functions/_shared/google-play-stripe-tax-evidence.ts');

const report=()=>({externalTransactionId:'fixture-transaction',packageName:'com.fixture.app',operation:'create',
  externalTransactionToken:'synthetic-native-input-not-attestation',environment:'test',licenseTestQualified:true,
  originalPreTaxMinor:237,originalTaxMinor:19,transactionTime:'2026-10-30T12:00:00.000Z'});
const receipt=(r,extra={})=>({externalTransactionId:r.externalTransactionId,packageName:r.packageName,
  originalPreTaxAmount:googlePrice(r.originalPreTaxMinor),originalTaxAmount:googlePrice(r.originalTaxMinor),
  currentPreTaxAmount:googlePrice(r.originalPreTaxMinor),currentTaxAmount:googlePrice(r.originalTaxMinor),
  transactionTime:r.transactionTime,transactionState:'TRANSACTION_REPORTED',testPurchase:{},userTaxAddress:{regionCode:'US'},
  externalContentLinkDetails:{linkType:'LINK_TO_DIGITAL_CONTENT_OFFER'},...extra});
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
test('Google v3 Price uses exact micros, official content-link body and no pretend test flag',()=>{
  assert.deepEqual(googlePrice(237),{currency:'USD',priceMicros:'2370000'});
  assert.deepEqual(googlePrice(2147483647),{currency:'USD',priceMicros:'21474836470000'});
  for(const bad of [-1,1.2,NaN,Infinity,'100'])assert.throws(()=>googlePrice(bad));
  const q=externalReportRequest(report());
  assert.match(q.url,/externalTransactions\?externalTransactionId=fixture-transaction$/);
  assert.equal(q.body.externalContentLinkDetails.linkType,'LINK_TO_DIGITAL_CONTENT_OFFER');
  assert.equal(q.body.testPurchase,undefined);assert.equal(q.body.originalPreTaxAmount.units,undefined);
});
test('license qualification, opaque token and exact economics fail closed without transport',async()=>{
  for(const patch of [{licenseTestQualified:false},{environment:'live'},{externalTransactionToken:''},
    {originalTaxMinor:null},{originalPreTaxMinor:1.5},{externalTransactionId:'someone@example.com'},
    {packageName:'https://attacker.test'}]){
    let calls=0;
    const result=await submitExternalReport({...report(),...patch},'fixture',async()=>{calls++;throw Error();});
    assert.equal(calls,0);assert.equal(result.status,'needs_review');
  }
});
test('create checks canonical identity/test/tax receipt and never treats HTTP success alone as proof',async()=>{
  const r=report(),calls=[];
  const result=await submitExternalReport(r,'fixture-oauth',async(url,init)=>{
    calls.push({url,init});return init.method==='GET'?response({},404):response(receipt(r));
  });
  assert.equal(result.status,'reported');assert.equal(calls.length,2);
  assert.equal(JSON.parse(calls[1].init.body).oneTimeTransaction.externalTransactionToken,r.externalTransactionToken);
  assert.equal(JSON.stringify(result).includes(r.externalTransactionToken),false);
  for(const patch of [{testPurchase:undefined},{packageName:'com.other.app'},
    {originalTaxAmount:googlePrice(0)},{transactionTime:'2026-10-29T12:00:00Z'},
    {transactionState:'ACKNOWLEDGED'},{externalTransactionId:'other'}]){
    const bad=await submitExternalReport(r,'fixture',async()=>response(receipt(r,patch)));
    assert.equal(bad.status,'needs_review');
  }
});
test('lost create response reconciles same immutable transaction, never posts a duplicate',async()=>{
  const r=report();let exists=false,posts=0;
  const transport=async(_url,init)=>{
    if(init.method==='GET')return exists?response(receipt(r)):response({},404);
    posts++;exists=true;throw Error('synthetic response lost');
  };
  assert.equal((await submitExternalReport(r,'fixture',transport)).status,'unknown');
  assert.equal((await submitExternalReport(r,'fixture',transport)).status,'reported');
  assert.equal(posts,1);
});
test('partial/full refund uses official refund shape and exact remaining canonical balance',async()=>{
  const r={...report(),operation:'refund',refundTime:'2026-10-30T13:00:00Z',refundId:'fixture-refund',
    refundPreTaxMinor:100,previousPreTaxMinor:237,previousTaxMinor:19,remainingPreTaxMinor:137,remainingTaxMinor:11};
  const q=externalReportRequest(r);
  assert.match(q.url,/fixture-transaction:refund$/);
  assert.deepEqual(q.body.partialRefund,{refundId:'fixture-refund',refundPreTaxAmount:googlePrice(100)});
  let posts=0;
  const result=await submitExternalReport(r,'fixture',async(_url,init)=>{
    if(init.method==='GET')return response(receipt(r));
    posts++;return response(receipt(r,{currentPreTaxAmount:googlePrice(137),currentTaxAmount:googlePrice(11)}));
  });
  assert.equal(result.status,'reported');assert.equal(posts,1);
  const full={...r,refundPreTaxMinor:237,remainingPreTaxMinor:0,remainingTaxMinor:0};
  assert.deepEqual(externalReportRequest(full).body.fullRefund,{});
  const already=await submitExternalReport(full,'fixture',async(_url,init)=>{
    assert.equal(init.method,'GET');return response(receipt(full,{currentPreTaxAmount:googlePrice(0),
      currentTaxAmount:googlePrice(0),transactionState:'TRANSACTION_CANCELED'}));
  });
  assert.equal(already.status,'reported');
});
test('conflict/rate limit/unknown outcomes remain reconcilable, not simulated acknowledgements',async()=>{
  for(const [status,expected] of [[409,'unknown'],[429,'retry'],[503,'retry'],[401,'needs_review'],[400,'needs_review']]){
    const result=await submitExternalReport(report(),'fixture',async(_u,init)=>response({},init.method==='GET'?404:status));
    assert.equal(result.status,expected);assert.equal(result.receipt,undefined);
  }
});

test('tax extractor requires actual complete provider tax/address facts, never defaults absent tax to zero',()=>{
  const checkout={object:'checkout.session',status:'complete',payment_status:'paid',currency:'usd',amount_total:256,
    automatic_tax:{enabled:true,status:'complete'},customer_details:{address:{country:'US'}},
    total_details:{amount_tax:19,amount_discount:0,amount_shipping:0}};
  assert.deepEqual(googlePlayStripeTaxEvidence(checkout),{provenance:'stripe_checkout_automatic_tax_complete',
    countryCode:'US',preTaxAmountMinor:237,taxAmountMinor:19});
  for(const patch of [{automatic_tax:{enabled:true,status:'requires_location_inputs'}},{total_details:{}},
    {total_details:{amount_tax:0}},{customer_details:{address:{country:'CA'}}},{payment_status:'unpaid'},
    {total_details:{amount_tax:257,amount_discount:0,amount_shipping:0}}]){
    assert.equal(googlePlayStripeTaxEvidence({...checkout,...patch}),null);
  }
});
