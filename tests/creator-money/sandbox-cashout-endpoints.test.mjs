import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const shared={exports:{},URLSearchParams,AbortSignal,Date,Error,JSON,Number,RegExp,TextDecoder,Uint8Array,setTimeout,clearTimeout};
vm.runInNewContext(compile(fs.readFileSync('supabase/functions/_shared/creator-cashout-execution.ts','utf8')),shared);
const id='a0000000-0000-4000-8000-000000000001';
const row={requestId:id,environment:'test',financialAuthority:false,bankPaid:false,status:'prepared'};
function endpoint(name,{environment={},authorized=row,context={requestId:id,environment:'test',executionId:'execution',accountId:'acct_creator'},signature=true,run=async()=>({status:'prepared'}),userRpc,adminRpc,readProof=async()=>({kind:'prefunded_destination_tip'})}={}){
 let handler;const calls=[],env={SANDBOX_CREATOR_CASHOUT_ENABLED:'true',STRIPE_CASHOUT_TEST_KEY:'rk_test_fixture',STRIPE_CASHOUT_TEST_WEBHOOK_SECRET:'secret',...environment};
 const bindings={readOptionalEnv:key=>env[key],createAuthClient:()=>({supabaseUrl:'https://fixture.supabase.co',supabaseAnonKey:'anon'}),
  createClient:()=>({rpc:async(...args)=>{calls.push(['user',...args]);return userRpc?userRpc(...args):{data:authorized};}}),
  createAdminClient:()=>({configured:true,client:{rpc:async(...args)=>{calls.push(['admin',...args]);return adminRpc?adminRpc(...args):{data:context};}}}),
  optionsResponse:()=>new Response(null,{status:204}),jsonResponse:(status,body)=>Response.json(body,{status}),verifyStripeWebhookSignature:async()=>signature,
  readCashoutBody:shared.exports.readCashoutBody,runCreatorCashout:run,readPrefundedTipEvidence:readProof};
 vm.runInNewContext(compile(fs.readFileSync(`supabase/functions/${name}/index.ts`,'utf8')),{exports:{},Deno:{serve:fn=>handler=fn},require:()=>bindings,Date,JSON,Error,Number,fetch:async()=>{throw Error('network prohibited');}});
 return {handler,calls};
}
const request=(body,headers={Authorization:'Bearer user'})=>new Request('https://fixture.invalid',{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});
test('sandbox adapter refuses missing auth, extra client controls, disabled execution and live credentials',async()=>{
 const e=endpoint('sandbox-creator-cashout',{run:async()=>assert.fail('must not run')});
 assert.equal((await e.handler(request({request_id:id},{}))).status,401);
 for(const extra of [{environment:'live'},{account_id:'acct_wrong'},{amount:10}])assert.equal((await e.handler(request({request_id:id,...extra}))).status,400);
 for(const environment of [{SANDBOX_CREATOR_CASHOUT_ENABLED:'false'},{STRIPE_CASHOUT_TEST_KEY:'rk_live_fixture'}]){
  const disabled=endpoint('sandbox-creator-cashout',{environment,run:async()=>assert.fail('must not run')});
  assert.equal((await disabled.handler(request({request_id:id}))).status,503);assert.equal(disabled.calls.length,0);
 }
 assert.equal((await e.handler(request('x'.repeat(257)))).status,409);
});
test('sandbox adapter gates service reads on authenticated exact-session owned record and uses isolated RPCs',async()=>{
 for(const authorized of [null,{...row,environment:'live'},{...row,financialAuthority:true},{...row,requestId:'other'}]){
  const e=endpoint('sandbox-creator-cashout',{authorized,run:async()=>assert.fail('unauthorized')});
  assert.equal((await e.handler(request({request_id:id}))).status,403);assert.equal(e.calls.some(x=>x[0]==='admin'),false);
 }
 let runs=0;const e=endpoint('sandbox-creator-cashout',{run:async(requestId,store,key)=>{
  assert.equal(requestId,id);assert.equal(key,'rk_test_fixture');assert.equal((await store.read(id)).environment,'test');
  await store.claim(id,'funding');await store.observe(id,'token',{kind:'transfer'});runs++;
 }});
 const response=await e.handler(request({request_id:id}));assert.equal(response.status,200);assert.deepEqual(await response.json(),row);assert.equal(runs,1);
 assert.deepEqual(e.calls.filter(x=>x[0]==='admin').map(x=>x[1]),['get_sandbox_creator_cashout_execution_context','claim_sandbox_creator_cashout_dispatch','record_sandbox_creator_cashout_observation']);
 assert.equal(e.calls.filter(x=>x[0]==='user').length,2);
 const wrong=endpoint('sandbox-creator-cashout',{context:{environment:'live'},run:async(id,store)=>store.read(id)});
 assert.equal((await wrong.handler(request({request_id:id}))).status,409);
});
test('ambiguous test dispatch never authorizes a replacement payout',async()=>{
 const e=endpoint('sandbox-creator-cashout',{run:async()=>{throw Error('timeout after provider write');}});
 const response=await e.handler(request({request_id:id}));assert.equal(response.status,409);assert.equal((await response.json()).canRetryPayout,false);
});
test('prefunded adapter uses server-authorized kind and refreshes source/balance before payout claim',async()=>{
 const prefunded={...row,executionKind:'prefunded_destination_tip',status:'ready'};
 const e=endpoint('sandbox-creator-cashout',{
  userRpc:async name=>name==='get_my_sandbox_creator_cashout_execution'?{error:{message:'not found'}}:{data:prefunded},
  adminRpc:async name=>({data:name==='get_sandbox_prefunded_tip_cashout_context'?{requestId:id,tipId:id,environment:'test',fundingMode:'prefunded_destination'}:name==='record_sandbox_prefunded_tip_receipt'?{receiptId:id}:{tipId:id}}),
  run:async(requestId,store)=>{assert.equal((await store.read(requestId)).fundingMode,'prefunded_destination');await store.preparePrefundedClaim(requestId,{accountId:'acct_creator',environment:'test',currency:'usd',sourceType:'card',availableMinor:500,observedAt:1000});await store.claim(requestId,'payout');},
 });
 assert.equal((await e.handler(request({request_id:id}))).status,200);
 const names=e.calls.filter(x=>x[0]==='admin').map(x=>x[1]);
 assert.deepEqual(names,['get_sandbox_prefunded_tip_cashout_context','get_sandbox_prefunded_tip_cashout_context','get_sandbox_prefunded_tip_source_context','record_sandbox_prefunded_tip_receipt','prepare_sandbox_prefunded_tip_dispatch','claim_sandbox_prefunded_tip_cashout_dispatch']);
 assert.equal(e.calls.some(x=>x[1]==='claim_sandbox_creator_cashout_dispatch'),false);
});
test('receipt endpoint requires exact tester ownership before GET evidence and never accepts client facts',async()=>{
 const source={tipId:id,environment:'test',financialAuthority:false};let reads=0;
 const e=endpoint('sandbox-prefunded-tip-receipt',{authorized:source,
  adminRpc:async name=>({data:name==='record_sandbox_prefunded_tip_receipt'?{receiptId:id}:source}),
  readProof:async value=>{assert.equal(value.tipId,id);reads++;return {kind:'prefunded_destination_tip'};}});
 assert.equal((await e.handler(request({tip_id:id}))).status,200);assert.equal(reads,1);
 assert.equal((await e.handler(request({tip_id:id,fee:0}))).status,400);
 const denied=endpoint('sandbox-prefunded-tip-receipt',{authorized:null,readProof:async()=>assert.fail('unauthorized provider read')});
 assert.equal((await denied.handler(request({tip_id:id}))).status,403);assert.equal(denied.calls.some(x=>x[0]==='admin'),false);
});
const event={object:'event',id:'evt_fixture',livemode:false,type:'payout.paid',account:'acct_creator',data:{object:{metadata:{chillywood_cashout_request:id,chillywood_cashout_execution:'execution'}}}};
test('isolated signed test webhook only reconciles and rejects live/account/execution mismatches',async()=>{
 let runs=0;const run=async(id,store,key,transport,now,readOnly)=>{assert.equal(readOnly,true);assert.equal(key,'rk_test_fixture');await store.read(id);await assert.rejects(store.claim(),/webhook_cannot_dispatch/);runs++;};
 const e=endpoint('sandbox-creator-cashout-webhook',{run});
 assert.equal((await e.handler(request(event))).status,200);assert.equal(runs,1);
 assert.equal((await e.handler(request({...event,livemode:true}))).status,400);
 assert.equal((await e.handler(request({...event,account:'acct_other'}))).status,503);
 const unsigned=endpoint('sandbox-creator-cashout-webhook',{signature:false,run:async()=>assert.fail('unsigned')});
 assert.equal((await unsigned.handler(request(event))).status,400);assert.equal(unsigned.calls.length,0);
 const live=endpoint('sandbox-creator-cashout-webhook',{context:{environment:'live',executionId:'execution',accountId:'acct_creator'},run});
 assert.equal((await live.handler(request(event))).status,503);assert.equal(runs,1);
});

test('both sandbox Edge entry points are included in required Deno typechecking',()=>{
 const workflow=fs.readFileSync('.github/workflows/required-validation.yml','utf8');
 const line=workflow.split('\n').find(value=>value.includes('deno check')&&value.includes('creator-cashout-driver/index.ts'));
 assert.ok(line,'existing required cashout Deno gate must remain');
 for(const name of ['sandbox-creator-cashout','sandbox-creator-cashout-webhook','sandbox-prefunded-tip-receipt'])
  assert.ok(line.includes(`supabase/functions/${name}/index.ts`),`${name} must use actual Deno typecheck`);
});
