import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const runtime={exports:{},URLSearchParams,AbortSignal,Date,Error,JSON,Number,RegExp,TextDecoder,Uint8Array,setTimeout,clearTimeout};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('supabase/functions/_shared/creator-cashout-execution.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,runtime);
const c={requestId:'a0000000-0000-4000-8000-000000000001',executionId:'a0000000-0000-4000-8000-000000000002',platformAccountId:'acct_platform',accountId:'acct_testcreator',destinationId:'ba_testdestination',environment:'test',method:'standard',sourceType:'card',grossMinor:10000,appFeeMinor:0,expectedProviderFeeMinor:0,bankMinor:10000,currency:'usd',phase:'prepared',transferId:null,payoutId:null,reversalId:null,dispatchKey:'cw-cashout-a0000000-0000-4000-8000-000000000002',dispatchedAt:null};
const metadata={chillywood_cashout_execution:c.executionId,chillywood_cashout_request:c.requestId};
test('same production engine performs isolated test transfer then test payout with durable stage claims',async()=>{
 const calls=[],claims=[],facts=[];let phase='prepared';
 const store={read:async()=>({...c,phase,transferId:phase==='funded'?'tr_test':null}),claim:async(id,stage)=>{claims.push(stage);return {claimed:true,token:'a0000000-0000-4000-8000-000000000003'};},observe:async(id,token,f)=>{facts.push(f);return {status:f.kind==='transfer'?'funded':'payout_pending'};}};
 const transport=async(url,options)=>{
  calls.push({url,options});assert.equal(options.headers.Authorization,'Bearer rk_test_fixture');
  if(url.endsWith('/v1/account'))return Response.json({object:'account',id:c.platformAccountId});
  if(url.includes('/v2/core/accounts/'))return Response.json({id:c.accountId,livemode:false,configuration:{recipient:{capabilities:{stripe_balance:{stripe_transfers:{status:'active'}}}}},defaults:{responsibilities:{fees_collector:'application',losses_collector:'application'}}});
  if(url.endsWith(`/v1/accounts/${c.accountId}`))return Response.json({id:c.accountId,country:'US',default_currency:'usd',settings:{payouts:{schedule:{interval:'manual'}}}});
  if(url.includes('/external_accounts/'))return Response.json({id:c.destinationId,account:c.accountId,currency:'usd',country:'US',available_payout_methods:['standard']});
  if(url.endsWith('/v1/balance'))return Response.json({object:'balance',livemode:false,available:[{currency:'usd',source_types:{card:10000}}]});
  if(options.method==='POST'){
   assert.equal(claims.at(-1),url.endsWith('/transfers')?'funding':'payout');
   assert.equal(options.body.get('metadata[chillywood_cashout_execution]'),c.executionId);
   if(url.endsWith('/transfers'))return Response.json({object:'transfer',id:'tr_test',livemode:false,amount:10000,currency:'usd',destination:c.accountId,metadata,amount_reversed:0,reversed:false});
   assert.equal(options.headers['Stripe-Account'],c.accountId);assert.equal(options.body.get('destination'),c.destinationId);
   return Response.json({object:'payout',id:'po_test',livemode:false,amount:10000,currency:'usd',destination:c.destinationId,method:'standard',source_type:'card',automatic:false,status:'pending',metadata});
  }
  throw Error(`Unexpected ${url}`);
 };
 const run=runtime.exports.runCreatorCashout;
 assert.equal((await run(c.requestId,store,'rk_test_fixture',transport)).status,'funded');phase='funded';
 assert.equal((await run(c.requestId,store,'rk_test_fixture',transport)).status,'payout_pending');
 assert.deepEqual(claims,['funding','payout']);assert.equal(facts.every(f=>f.environment==='test'),true);
 const writes=calls.filter(x=>x.options.method==='POST');assert.equal(writes.length,2);
 assert.notEqual(writes[0].options.headers['Idempotency-Key'],writes[1].options.headers['Idempotency-Key']);
 const count=calls.length;await assert.rejects(run(c.requestId,store,'rk_live_fixture',transport),/credential_mode_mismatch/);assert.equal(calls.length,count);
});
