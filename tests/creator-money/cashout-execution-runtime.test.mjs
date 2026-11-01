import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const runtime={exports:{},URLSearchParams,AbortSignal,Date,Error,JSON,Number,RegExp,TextDecoder,Uint8Array,setTimeout,clearTimeout};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/_shared/creator-cashout-execution.ts','utf8'),
 {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,runtime);
const {runCreatorCashout:run,normalizeCashoutPayout:payout,normalizeCashoutTransfer:transfer}=runtime.exports;
const context={requestId:'a0000000-0000-4000-8000-000000000001',executionId:'a0000000-0000-4000-8000-000000000002',
 platformAccountId:'acct_platform',accountId:'acct_creator',destinationId:'ba_destination',environment:'live',method:'instant',
 sourceType:'card',grossMinor:10000,appFeeMinor:200,expectedProviderFeeMinor:0,bankMinor:9800,currency:'usd',phase:'prepared',
 transferId:null,payoutId:null,reversalId:null,dispatchKey:'cw-cashout-a0000000-0000-4000-8000-000000000002',dispatchedAt:100};
const metadata={chillywood_cashout_execution:context.executionId,chillywood_cashout_request:context.requestId};
test('qualified inline-known zero is exact connected payout balance evidence, never an empty-report inference',async()=>{
 const f=fixture({phase:'paid',payoutId:'po_bank',transferId:'tr_funding',inlineKnownZeroQualified:true});
 const bt={object:'balance_transaction',id:'txn_payout',source:'po_bank',type:'payout',currency:'usd',amount:-9800,net:-9800,fee:0,status:'available',fee_details:[]};
 const transport=async(url,options)=>url.endsWith('/v1/payouts/po_bank')?Response.json({...p(),status:'paid'}):url.endsWith('/v1/balance_transactions/txn_payout')?Response.json(bt):f.transport(url,options);
 await run(context.requestId,f.store,'rk_live_fixture',transport);
 assert.equal(f.observed[0].facts.inlineZeroBalance.feeMinor,0);assert.equal(f.observed[0].facts.inlineZeroBalance.accountId,'acct_creator');assert.equal(f.claims.length,0);
 for(const mutation of [{fee:1},{net:-9801},{source:'po_other'},{status:'pending'},{type:'charge'},{amount:9800}]){
  const changed=async(url,options)=>url.endsWith('/v1/balance_transactions/txn_payout')?Response.json({...bt,...mutation}):transport(url,options);
  await assert.rejects(run(context.requestId,f.store,'rk_live_fixture',changed),/inline_zero_balance_unqualified/);
 }
});
const t=()=>({object:'transfer',id:'tr_funding',livemode:true,amount:9800,currency:'usd',destination:'acct_creator',metadata,amount_reversed:0,reversed:false});
test('funded cancellation reverses once; unknown and empty recovery are GET-only, exact platform balances required',async()=>{
 const reversal={object:'transfer_reversal',id:'trr_fundingReturn',transfer:'tr_funding',amount:9800,currency:'usd',metadata,balance_transaction:'txn_return'};
 const fundingBt={object:'balance_transaction',id:'txn_funding',source:'tr_funding',amount:-9800,fee:12,net:-9812,currency:'usd',status:'available',type:'transfer'};
 const returnBt={object:'balance_transaction',id:'txn_return',source:'trr_fundingReturn',amount:9800,fee:3,net:9797,currency:'usd',status:'available',type:'transfer_refund'};
 for(const phase of ['funding_return_pending','funding_return_unknown']){
  const f=fixture({phase,transferId:'tr_funding'});let writes=0;
  const transport=async(url,options)=>{
   assert.equal(options.headers['Stripe-Account'],undefined,'platform return evidence is not read from connected balance');
   if(url.endsWith('/v1/transfers/tr_funding'))return Response.json({...t(),balance_transaction:'txn_funding',...(phase==='funding_return_unknown'?{amount_reversed:9800,reversed:true}:{})});
   if(url.endsWith('/reversals')&&options.method==='POST'){writes++;assert.match(options.headers['Idempotency-Key'],/-funding-return$/);return Response.json(reversal);}
   if(url.includes('/reversals?'))return Response.json({object:'list',data:[reversal],has_more:false});
   if(url.endsWith('/balance_transactions/txn_funding'))return Response.json(fundingBt);
   if(url.endsWith('/balance_transactions/txn_return'))return Response.json(returnBt);
   return f.transport(url,options);
  };
  await run(context.requestId,f.store,'rk_live_fixture',transport);
  assert.equal(writes,phase==='funding_return_pending'?1:0);
  assert.deepEqual(f.claims,phase==='funding_return_pending'?['funding_return']:[]);
  assert.equal(f.observed[0].facts.kind,'funding_return');assert.equal(f.observed[0].facts.returnBalance.feeMinor,3);
  for(const mutation of [{source:'trr_other'},{amount:9700},{net:9800},{status:'pending'},{type:'charge'}]){
   const unknown=fixture({phase:'funding_return_unknown',transferId:'tr_funding'});
   await assert.rejects(run(context.requestId,unknown.store,'rk_live_fixture',async(url,options)=>url.endsWith('/balance_transactions/txn_return')?Response.json({...returnBt,...mutation}):transport(url,options)),/funding_return_balance_/);
   assert.equal(unknown.claims.length,0);
  }
 }
 const f=fixture({phase:'funding_return_unknown',transferId:'tr_funding'});
 const empty=async(url,options)=>{assert.equal(options.method,'GET');if(url.endsWith('/v1/transfers/tr_funding'))return Response.json({...t(),balance_transaction:'txn_funding'});
  if(url.includes('/reversals?'))return Response.json({object:'list',data:[],has_more:false});return f.transport(url,options);};
 assert.equal((await run(context.requestId,f.store,'rk_live_fixture',empty)).status,'funding_return_unknown');assert.equal(f.claims.length,0);assert.equal(f.observed.length,0);
 const before=fixture({phase:'funding_return_pending',transferId:'tr_funding'});
 await assert.rejects(run(context.requestId,before.store,'rk_live_fixture',async(url,options)=>{
  if(url.endsWith('/v1/transfers/tr_funding'))return Response.json({...t(),balance_transaction:'txn_funding'});
  if(options.method==='POST')throw Error('network timeout after dispatch');return before.transport(url,options);
 }),/network timeout/);assert.deepEqual(before.claims,['funding_return']);assert.equal(before.observed.length,0);
});
const p=()=>({object:'payout',id:'po_bank',livemode:true,amount:9800,currency:'usd',destination:'ba_destination',metadata,method:'instant',source_type:'card',automatic:false,status:'pending',application_fee:null,balance_transaction:'txn_payout',failure_balance_transaction:null});
function fixture(overrides={}){
 const c={...context,...overrides},calls=[],observed=[],claims=[];
 let claim=true;
 const store={read:async()=>c,claim:async(id,stage)=>{claims.push(stage);const result={claimed:claim,token:'a0000000-0000-4000-8000-000000000003'};claim=false;return result;},
  observe:async(id,token,facts)=>{observed.push({token,facts});return facts;}};
 const transport=async(url,options)=>{
  calls.push({url,options});assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer rk_live_fixture');
  if(url.endsWith('/v1/account'))return Response.json({object:'account',id:'acct_platform'});
  if(url.includes('/v2/core/accounts/'))return Response.json({id:'acct_creator',livemode:true,configuration:{recipient:{capabilities:{stripe_balance:{stripe_transfers:{status:'active'}}}}},defaults:{responsibilities:{fees_collector:'application',losses_collector:'application'}}});
  if(url.endsWith('/v1/accounts/acct_creator'))return Response.json({id:'acct_creator',country:'US',default_currency:'usd',settings:{payouts:{schedule:{interval:'manual'}}}});
  if(url.includes('/external_accounts/'))return Response.json({id:'ba_destination',account:'acct_creator',currency:'usd',country:'US',available_payout_methods:['standard','instant']});
  if(url.endsWith('/v1/balance'))return Response.json({object:'balance',livemode:true,instant_available:[{currency:'usd',amount:20000,net_available:[{destination:'ba_destination',amount:10000}]}],available:[{currency:'usd',amount:20000,source_types:{card:10000}}]});
  if(options.method==='POST'&&url.endsWith('/v1/transfers'))return Response.json(t());
  if(options.method==='POST'&&url.endsWith('/v1/payouts'))return Response.json(p());
  if(url.includes('/v1/transfers?'))return Response.json({object:'list',data:[t()],has_more:false});
  if(url.includes('/v1/payouts?'))return Response.json({object:'list',data:[p()],has_more:false});
  if(url.endsWith('/v1/payouts/po_bank'))return Response.json(p());
  if(url.endsWith('/v1/transfers/tr_funding'))return Response.json(t());
  throw Error(`unexpected request ${url}`);
 };
 return{c,calls,observed,claims,store,transport};
}
test('funding retains accepted exact appfee once and does not claim bank payout paid',async()=>{
 const f=fixture();const result=await run(f.c.requestId,f.store,'rk_live_fixture',f.transport);
 assert.equal(result.kind,'transfer');assert.equal(result.amountMinor,9800);assert.equal(result.status,undefined);
 assert.deepEqual(f.claims,['funding']);const post=f.calls.find(x=>x.options.method==='POST');
 assert.equal(post.options.body.get('amount'),'9800');assert.equal(post.options.body.get('destination'),'acct_creator');
 assert.equal(post.options.body.has('application_fee_amount'),false);assert.equal(post.options.headers['Idempotency-Key'],`${context.dispatchKey}-funding`);
 assert.equal(f.calls.filter(x=>x.options.method==='POST').length,1);
});
test('bank payout uses connected scope, exact destination, stable distinct key and postclaim',async()=>{
 const f=fixture({phase:'funded',transferId:'tr_funding'});await run(f.c.requestId,f.store,'rk_live_fixture',f.transport);
 assert.deepEqual(f.claims,['payout']);const post=f.calls.find(x=>x.options.method==='POST');
 assert.equal(post.options.headers['Stripe-Account'],'acct_creator');assert.equal(post.options.body.get('destination'),'ba_destination');
 assert.equal(post.options.body.get('amount'),'9800');assert.equal(post.options.body.has('application_fee_amount'),false);
 assert.equal(post.options.headers['Idempotency-Key'],`${context.dispatchKey}-payout`);
});
for(const phase of ['funding_unknown','payout_unknown'])test(`${phase} is GET-only even after idempotency lifetime`,async()=>{
 const f=fixture({phase,transferId:phase==='payout_unknown'?'tr_funding':null});
 await run(f.c.requestId,f.store,'rk_live_fixture',f.transport);assert.equal(f.claims.length,0);
 assert.ok(f.calls.every(x=>x.options.method==='GET'));assert.equal(f.observed.length,1);
});
test('unknown empty search stays unknown and never creates another provider object',async()=>{
 const f=fixture({phase:'funding_unknown'});const result=await run(f.c.requestId,f.store,'rk_live_fixture',async(url,opt)=>url.includes('/transfers?')?Response.json({object:'list',data:[],has_more:false}):f.transport(url,opt));
 assert.equal(result.status,'funding_unknown');assert.equal(f.claims.length,0);assert.equal(f.observed.length,0);
});
test('provider timeout after durable claim keeps dispatch unknown and no compensation/retry is attempted',async()=>{
 const f=fixture();await assert.rejects(run(f.c.requestId,f.store,'rk_live_fixture',async(url,opt)=>{if(opt.method==='POST')throw Error('connection lost after dispatch');return f.transport(url,opt);}),/connection lost/);
 assert.deepEqual(f.claims,['funding']);assert.equal(f.observed.length,0);
});
test('zero claim authorizes no POST',async()=>{
 const f=fixture();f.store.claim=async()=>({claimed:false,token:null});await run(f.c.requestId,f.store,'rk_live_fixture',f.transport);
 assert.ok(f.calls.every(x=>x.options.method==='GET'));
});
test('instant uses destination net_available not gross balance',async()=>{
 const f=fixture({phase:'funded',transferId:'tr_funding'});const result=await run(f.c.requestId,f.store,'rk_live_fixture',async(url,opt)=>url.endsWith('/v1/balance')?Response.json({object:'balance',livemode:true,instant_available:[{currency:'usd',amount:50000,net_available:[{destination:'ba_destination',amount:9799}]}]}):f.transport(url,opt));
 assert.equal(result.status,'waiting_for_connected_balance');assert.equal(f.claims.length,0);
});
for(const [name,mutate] of [
 ['foreign connected account',x=>x.destination='acct_other'],['wrong amount',x=>x.amount=10000],['test mode',x=>x.livemode=false],
 ['wrong request',x=>x.metadata={...metadata,chillywood_cashout_request:'different'}],['negative reversal',x=>x.amount_reversed=-1],
])test(`reject transfer ${name}`,()=>{const value=t();mutate(value);assert.throws(()=>transfer(value,context));});
for(const [name,mutate] of [
 ['transfer as payout',x=>x.object='transfer'],['foreign destination',x=>x.destination='ba_other'],['wrong amount',x=>x.amount=10000],
 ['test mode',x=>x.livemode=false],['extra appfee',x=>x.application_fee='fee_duplicate'],['automatic payout',x=>x.automatic=true],
 ['wrong method',x=>x.method='standard'],['unknown status',x=>x.status='complete'],['wrong identity',x=>x.id='po_other'],
])test(`reject payout ${name}`,()=>{const value=p();mutate(value);assert.throws(()=>payout(value,{...context,payoutId:'po_bank'}));});
test('webhook reconciliation cannot dispatch a prepared or funded execution',async()=>{
 for(const phase of ['prepared','funded','return_confirmed']){const f=fixture({phase});await run(f.c.requestId,f.store,'rk_live_fixture',f.transport,Date.now,true);assert.equal(f.claims.length,0);assert.ok(f.calls.every(x=>x.options.method==='GET'));}
});
test('credential mode and malformed stored economics fail before provider transport',async()=>{
 const f=fixture();await assert.rejects(run(f.c.requestId,f.store,'rk_test_fixture',f.transport));assert.equal(f.calls.length,0);
 f.c.bankMinor++;await assert.rejects(run(f.c.requestId,f.store,'rk_live_fixture',f.transport));assert.equal(f.calls.length,0);
});
test('paid later failed is reconciled only with exact available returned principal',async()=>{
 const f=fixture({phase:'paid',transferId:'tr_funding',payoutId:'po_bank'});
 const result=await run(f.c.requestId,f.store,'rk_live_fixture',async(url,opt)=>{
  if(url.endsWith('/payouts/po_bank'))return Response.json({...p(),status:'failed',failure_balance_transaction:'txn_return'});
  if(url.endsWith('/balance_transactions/txn_return'))return Response.json({object:'balance_transaction',id:'txn_return',source:'po_bank',currency:'usd',amount:9800,status:'available',fee:0,net:9800});
  return f.transport(url,opt);
 });assert.equal(result.status,'failed');assert.equal(result.returnedMinor,9800);assert.equal(f.claims.length,0);
});
