import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const shared={exports:{},URLSearchParams,AbortSignal,Date,Error,JSON,Number,RegExp,TextDecoder,Uint8Array,setTimeout,clearTimeout};
vm.runInNewContext(compile(fs.readFileSync('supabase/functions/_shared/creator-cashout-execution.ts','utf8')),shared);
const id='a0000000-0000-4000-8000-000000000001';
function endpoint(name,{enabled='true',signature=true,run=async()=>({status:'prepared'}),rpc=async()=>({data:{executionId:'execution',accountId:'acct_creator'}})}={}){
 let handler;const calls=[],env={SUPABASE_SERVICE_ROLE_KEY:'service',CREATOR_CASHOUT_EXECUTION_ENABLED:enabled,STRIPE_CASHOUT_LIVE_KEY:'rk_live_fixture',STRIPE_CASHOUT_WEBHOOK_SECRET:'secret'};
 const bindings={readOptionalEnv:key=>env[key],createAdminClient:()=>({configured:true,client:{rpc:async(...args)=>{calls.push(args);return rpc(...args);}}}),
  jsonResponse:(status,body)=>Response.json(body,{status}),verifyStripeWebhookSignature:async()=>signature,
  readCashoutBody:shared.exports.readCashoutBody,runCreatorCashout:run};
 vm.runInNewContext(compile(fs.readFileSync(`supabase/functions/${name}/index.ts`,'utf8')),{exports:{},Deno:{serve:fn=>handler=fn},require:()=>bindings,Date,JSON,Error,Number,fetch:async()=>{throw Error('no network in endpoint fixture');}});
 return {handler,calls};
}
const request=(body,headers={Authorization:'Bearer service'})=>new Request('https://fixture.invalid',{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});
test('worker requires service authority, execution switch and bounded exact request body',async()=>{
 let runs=0;const e=endpoint('creator-cashout-worker',{run:async()=>{runs++;return {};}});
 assert.equal((await e.handler(request({request_id:id},{}))).status,403);
 assert.equal((await e.handler(request({request_id:id,amount:10000}))).status,400);
 assert.equal((await e.handler(request('x'.repeat(257)))).status,409);
 assert.equal(runs,0);
 assert.equal((await e.handler(request({request_id:id}))).status,200);assert.equal(runs,1);
 const off=endpoint('creator-cashout-worker',{enabled:'false',run:async()=>assert.fail('disabled dispatched')});
 assert.equal((await (await off.handler(request({request_id:id}))).json()).status,'disabled');
});
test('worker transport failure never tells caller that a second payout is safe',async()=>{
 const e=endpoint('creator-cashout-worker',{run:async()=>{throw Error('ambiguous provider timeout');}});
 const res=await e.handler(request({request_id:id}));assert.equal(res.status,409);assert.equal((await res.json()).canRetryPayout,false);
});
test('worker refuses malformed reconciliation results without claiming a safe payout retry',async()=>{
 for(const result of [null,undefined,[],['paid'],'paid',true,42]){
  let runs=0;const e=endpoint('creator-cashout-worker',{run:async()=>{runs++;return result;}});
  const response=await e.handler(request({request_id:id}));
  assert.equal(response.status,409);assert.deepEqual(await response.json(),{error:'cashout_requires_reconciliation',canRetryPayout:false});
  assert.equal(runs,1);
 }
 const expected={status:'needs_review',canRetryPayout:false};
 const e=endpoint('creator-cashout-worker',{run:async()=>expected});
 const response=await e.handler(request({request_id:id}));
 assert.equal(response.status,200);assert.deepEqual(await response.json(),expected);
});
const event={object:'event',id:'evt_fixture',livemode:true,type:'payout.paid',account:'acct_creator',data:{object:{metadata:{chillywood_cashout_request:id,chillywood_cashout_execution:'execution'}}}};
test('signed webhook only wakes GET reconciliation and cannot claim a dispatch',async()=>{
 let reconciled=0;const e=endpoint('creator-cashout-webhook',{run:async(requestId,store,key,transport,now,readOnly)=>{
  assert.equal(requestId,id);assert.equal(readOnly,true);await store.read(id);await assert.rejects(store.claim(),/webhook_cannot_dispatch/);reconciled++;
 }});
 assert.equal((await e.handler(request(event))).status,200);assert.equal(reconciled,1);
 const invalid=endpoint('creator-cashout-webhook',{signature:false,run:async()=>assert.fail('unsigned event used')});
 assert.equal((await invalid.handler(request(event))).status,400);assert.equal(invalid.calls.length,0);
 assert.equal((await e.handler(request({...event,account:'acct_other'}))).status,503);assert.equal(reconciled,1);
 assert.equal((await e.handler(request({...event,livemode:false}))).status,400);
});
