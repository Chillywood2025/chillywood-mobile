import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const runtime={exports:{},URLSearchParams,AbortSignal,Date,Error,JSON,Number,RegExp,TextDecoder,Uint8Array,setTimeout,clearTimeout};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/_shared/creator-cashout-execution.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,runtime);
const c={fundingMode:'prefunded_destination',requestId:'b0000000-0000-4000-8000-000000000001',executionId:'b0000000-0000-4000-8000-000000000002',platformAccountId:'acct_platform',accountId:'acct_recipient',destinationId:'ba_destination',environment:'test',method:'standard',sourceType:'card',grossMinor:1000,appFeeMinor:0,expectedProviderFeeMinor:10,bankMinor:990,currency:'usd',phase:'ready',transferId:null,payoutId:null,reversalId:null,dispatchKey:'cw-cashout-b0000000-0000-4000-8000-000000000002',dispatchedAt:null};
const metadata={chillywood_cashout_execution:c.executionId,chillywood_cashout_request:c.requestId};
const payout=(status='pending')=>({object:'payout',id:'po_tip',livemode:false,amount:990,currency:'usd',destination:c.destinationId,method:'standard',source_type:'card',automatic:false,status,metadata,balance_transaction:'txn_debit',failure_balance_transaction:'txn_return'});
function harness(context=c, options={}) {
 const calls=[],claims=[],facts=[];
 const store={read:async()=>context,claim:async(id,stage)=>{claims.push(stage);return {claimed:true,token:'b0000000-0000-4000-8000-000000000003'};},observe:async(id,token,f)=>{facts.push(f);return f;}};
 const transport=async(url,request)=>{
  calls.push({url,request});
  assert.equal(url.includes('/transfers'),false,'payout-only must not read or write funding transfers');
  if(request.method==='POST') {assert.equal(url,'https://api.stripe.com/v1/payouts');assert.equal(request.headers['Stripe-Account'],c.accountId);assert.deepEqual(claims,['payout']);if(options.lost)throw Error('lost response');return Response.json(payout());}
  if(url.endsWith('/v1/account'))return Response.json({object:'account',id:c.platformAccountId});
  if(url.includes('/v2/core/accounts/'))return Response.json({id:c.accountId,livemode:false,configuration:{recipient:{capabilities:{stripe_balance:{stripe_transfers:{status:'active'}}}}},defaults:{responsibilities:{fees_collector:'application',losses_collector:'application'}}});
  if(url.endsWith(`/v1/accounts/${c.accountId}`))return Response.json({id:c.accountId,country:'US',default_currency:'usd',settings:{payouts:{schedule:{interval:'manual'}}}});
  if(url.includes('/external_accounts/'))return Response.json({id:c.destinationId,account:c.accountId,currency:'usd',country:'US',available_payout_methods:['standard']});
  if(url.endsWith('/v1/balance'))return Response.json({object:'balance',livemode:false,available:[{currency:'usd',source_types:{card:options.balance??1000}}]});
  if(url.includes('/v1/payouts?'))return Response.json({object:'list',data:[],has_more:false});
  if(url.endsWith('/v1/payouts/po_tip'))return Response.json(payout(options.status??'failed'));
  if(url.includes('/balance_transactions/')) {
   assert.equal(request.headers['Stripe-Account'],c.accountId);
   const returned=url.endsWith('txn_return');
   return Response.json(returned?{object:'balance_transaction',id:'txn_return',source:options.badSource?'po_other':'po_tip',type:options.status==='canceled'?'payout_cancel':'payout_failure',currency:'usd',amount:990,fee:3,net:987,status:'available',fee_details:[{amount:3,currency:'usd'}]}:{object:'balance_transaction',id:'txn_debit',source:'po_tip',type:'payout',currency:'usd',amount:-990,fee:10,net:-1000,status:'available',fee_details:[{amount:10,currency:'usd'}]});
  }
  throw Error(`Unexpected ${url}`);
 };
 return {calls,claims,facts,run:()=>runtime.exports.runCreatorCashout(c.requestId,store,'rk_test_fixture',transport)};
}
test('prefunded ready dispatches only one connected payout, reserving actual payout cost',async()=>{
 const h=harness();await h.run();assert.deepEqual(h.claims,['payout']);assert.equal(h.calls.filter(x=>x.request.method==='POST').length,1);
 const insufficient=harness(c,{balance:990});assert.equal((await insufficient.run()).status,'waiting_for_connected_balance');assert.equal(insufficient.claims.length,0);
});
test('prefunded mode rejects every funding/reversal phase and incompatible context before provider access',async()=>{
 for(const patch of [{phase:'prepared'},{phase:'funded'},{phase:'funding_unknown'},{phase:'return_confirmed'},{phase:'reversal_unknown'},{phase:'funding_return_pending'},{phase:'funding_return_unknown'},{phase:'paid'},{phase:'return_pending'},{payoutId:'po_existing'},{environment:'live'},{method:'instant'},{transferId:'tr_source'},{reversalId:'trr_source'},{fundingMode:'typo'}]) {
  const h=harness({...c,...patch});await assert.rejects(h.run(),/prefunded_context_invalid|funding_mode_invalid/);assert.equal(h.calls.length,0);assert.equal(h.claims.length,0);
 }
});
test('lost prefunded POST remains GET-only on repeated unknown recovery and cancellation stays inert',async()=>{
 const lost=harness(c,{lost:true});await assert.rejects(lost.run(),/lost response/);assert.equal(lost.claims.length,1);
 for(const phase of ['payout_unknown','canceled','needs_review']) {
  const h=harness({...c,phase});await h.run();await h.run();assert.equal(h.calls.some(x=>x.request.method==='POST'),false);assert.equal(h.claims.length,0);
 }
});
test('prefunded return requires exact connected debit and credit, retains observed fees without transfer reversal',async()=>{
 for(const status of ['failed','canceled']) {
  const h=harness({...c,phase:'return_pending',payoutId:'po_tip'},{status});const result=await h.run();assert.equal(result.returnedMinor,987);assert.equal(result.retainedProviderFeeMinor,13);assert.equal(h.claims.length,0);assert.equal(h.calls.some(x=>x.request.method==='POST'),false);
 }
 const bad=harness({...c,phase:'return_pending',payoutId:'po_tip'},{badSource:true});await assert.rejects(bad.run(),/prefunded_payout_return_unconfirmed/);assert.equal(bad.facts.length,0);
 const paid=harness({...c,phase:'paid',payoutId:'po_tip'},{status:'paid'});const result=await paid.run();assert.equal(result.payoutDebit.feeMinor,10);assert.equal(result.payoutReturn,undefined);
});
