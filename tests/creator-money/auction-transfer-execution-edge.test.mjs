import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
function load(file,globals={}){
 const module={exports:{}};
 new Function('module','exports',...Object.keys(globals),ts.transpileModule(readFileSync('supabase/functions/'+file,'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(module,module.exports,...Object.values(globals));
 return module.exports;
}
const adapter=load('_shared/stripe-auction-transfer.ts');
const op={id:'11111111-1111-4111-8111-111111111111',contract_id:'22222222-2222-4222-8222-222222222222',
 platform_account_id:'acct_platform',destination:'acct_creator',source_charge_id:'ch_source',amount_minor:160,currency:'usd',
 transfer_group:'auction-contract-22222222-2222-4222-8222-222222222222',idempotency_key:'auction-transfer-v1-22222222-2222-4222-8222-222222222222',
 environment:'test',dispatchAuthorized:true};
const transfer=()=>({object:'transfer',id:'tr_created',livemode:false,amount:160,currency:'usd',destination:'acct_creator',source_transaction:'ch_source',
 transfer_group:op.transfer_group,amount_reversed:0,metadata:{auction_operation_id:op.id,auction_contract_id:op.contract_id}});
function fixture(){
 const calls=[];const data={
  '/account':{object:'account',id:'acct_platform'},'/accounts/acct_creator':{object:'account',id:'acct_creator',capabilities:{transfers:'active'}},
  '/charges/ch_source':{object:'charge',id:'ch_source',livemode:false,paid:true,captured:true,disputed:false,refunded:false,amount_refunded:0,
   currency:'usd',amount_captured:237,balance_transaction:'txn_source'},
  '/balance_transactions/txn_source':{object:'balance_transaction',id:'txn_source',source:'ch_source',type:'charge',currency:'usd',net:200,status:'available'},
  '/transfers':transfer(),'/transfers/tr_created':transfer(),
  ['/transfers?'+new URLSearchParams({transfer_group:op.transfer_group,limit:'100'})]:{object:'list',data:[transfer()],has_more:false}
 };
 return {data,calls,transport:async(url,options)=>{
  const path=url.replace('https://api.stripe.com/v1','');calls.push({path,...options});
  assert.equal(options.headers.Authorization,'Bearer sk_test_synthetic');assert.equal(options.headers['Stripe-Account'],undefined);
  assert.equal(options.headers['Stripe-Version'],'2026-10-28.endive');assert.equal(options.redirect,'error');
  assert.ok(data[path],path);if(data[path] instanceof Error)throw data[path];
  if(options.method==='POST'&&path.endsWith('/reversals'))data['/transfers/tr_created'].amount_reversed+=data[path].amount;
  return new Response(JSON.stringify(data[path]),{status:200});
 }};
}
test('actual transfer adapter verifies account, recipient and available charge before one exact separate transfer',async()=>{
 const f=fixture(),result=await adapter.dispatchAuctionTestTransfer(op,'sk_test_synthetic','acct_platform',f.transport);
 assert.equal(result.id,'tr_created');const posts=f.calls.filter(c=>c.method==='POST');assert.equal(posts.length,1);
 assert.equal(posts[0].headers['Idempotency-Key'],op.idempotency_key);
 assert.deepEqual(Object.fromEntries(posts[0].body),{amount:'160',currency:'usd',destination:'acct_creator',source_transaction:'ch_source',
  transfer_group:op.transfer_group,'metadata[auction_operation_id]':op.id,'metadata[auction_contract_id]':op.contract_id});
 assert.ok(f.calls.every(c=>!c.path.includes('payout')));
});
for(const [path,key,value] of [['/account','id','acct_other'],['/accounts/acct_creator','capabilities',{transfers:'inactive'}],
 ['/charges/ch_source','disputed',true],['/charges/ch_source','amount_refunded',1],['/charges/ch_source','livemode',true],
 ['/balance_transactions/txn_source','status','pending'],['/balance_transactions/txn_source','source','ch_wrong']])
test(`fails closed before transfer: ${path}.${key}`,async()=>{
 const f=fixture();f.data[path][key]=value;await assert.rejects(adapter.dispatchAuctionTestTransfer(op,'sk_test_synthetic','acct_platform',f.transport));
 assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
});
test('live key, denied permit and altered immutable request never access provider',async()=>{
 for(const [o,key] of [[op,'sk_live_denied'],[{...op,dispatchAuthorized:false},'sk_test_synthetic'],[{...op,amount_minor:1.5},'sk_test_synthetic'],
  [{...op,idempotency_key:'replacement'},'sk_test_synthetic']]){
  const f=fixture();await assert.rejects(adapter.dispatchAuctionTestTransfer(o,key,'acct_platform',f.transport));assert.equal(f.calls.length,0);
 }
});
test('timeout stays unresolved; recovery only GETs exact identity, empty list never authorizes POST',async()=>{
 const f=fixture();f.data['/transfers']=Error('timeout');
 await assert.rejects(adapter.dispatchAuctionTestTransfer(op,'sk_test_synthetic','acct_platform',f.transport));
 const result=await adapter.reconcileAuctionTestTransfer(op,'sk_test_synthetic','acct_platform',f.transport);assert.equal(result.id,'tr_created');
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
 const list=Object.keys(f.data).find(k=>k.startsWith('/transfers?'));f.data[list].data=[];
 await assert.rejects(adapter.reconcileAuctionTestTransfer(op,'sk_test_synthetic','acct_platform',f.transport),/unresolved/);
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});
test('recovery rejects cross-operation, duplicate and mismatched transfers',async()=>{
 for(const modify of [t=>t.amount=161,t=>t.source_transaction='ch_wrong',t=>t.metadata.auction_contract_id='wrong',t=>t.livemode=true]){
  const f=fixture(),list=Object.keys(f.data).find(k=>k.startsWith('/transfers?'));modify(f.data[list].data[0]);
  await assert.rejects(adapter.reconcileAuctionTestTransfer(op,'sk_test_synthetic','acct_platform',f.transport));
 }
 const f=fixture(),list=Object.keys(f.data).find(k=>k.startsWith('/transfers?'));f.data[list].data.push({...transfer(),id:'tr_duplicate'});
 await assert.rejects(adapter.reconcileAuctionTestTransfer(op,'sk_test_synthetic','acct_platform',f.transport),/unresolved/);
});
const reversal={id:'33333333-3333-4333-8333-333333333333',transfer:{...op,provider_transfer_id:'tr_created'},amount_minor:80,
 expected_reversed_minor:0,idempotency_key:'auction-reversal-v1-33333333-3333-4333-8333-333333333333',dispatchAuthorized:true};
const reversed=()=>({id:'trr_created',object:'transfer_reversal',amount:80,currency:'usd',transfer:'tr_created',
 metadata:{auction_reversal_id:reversal.id,auction_operation_id:op.id}});
test('separate net-recovery reversal and GET-only unknown-result reconciliation never imply buyer refund',async()=>{
 const f=fixture();f.data['/transfers/tr_created/reversals']=reversed();f.data['/transfers/tr_created/reversals?limit=100']={object:'list',data:[reversed()],has_more:false};
 const result=await adapter.dispatchAuctionTestReversal(reversal,'sk_test_synthetic','acct_platform',f.transport);assert.equal(result.id,'trr_created');
 assert.equal(result.cumulative_reconciled,true);assert.equal(result.parent_transfer.amount_reversed,80);
 const post=f.calls.find(c=>c.method==='POST');assert.equal(post.body.get('amount'),'80');assert.equal(post.headers['Idempotency-Key'],reversal.idempotency_key);
 assert.equal((await adapter.reconcileAuctionTestReversal(reversal,'sk_test_synthetic','acct_platform',f.transport)).id,'trr_created');
 f.data['/transfers/tr_created/reversals?limit=100'].data=[];
 await assert.rejects(adapter.reconcileAuctionTestReversal(reversal,'sk_test_synthetic','acct_platform',f.transport),/unresolved/);
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);assert.ok(f.calls.every(c=>!c.path.startsWith('/refunds')));
});
test('an external reversal after reservation blocks POST even when original transfer capacity remains',async()=>{
 const f=fixture();f.data['/transfers/tr_created'].amount_reversed=40;
 await assert.rejects(adapter.dispatchAuctionTestReversal(reversal,'sk_test_synthetic','acct_platform',f.transport),/observation_changed/);
 assert.equal(f.calls.filter(c=>c.method==='POST').length,0);
});
test('an external reversal between GET and POST preserves own success but flags cumulative recovery',async()=>{
 const f=fixture();f.data['/transfers/tr_created/reversals']=reversed();
 const transport=async(url,options)=>{
  if(options.method==='POST'&&url.endsWith('/reversals'))f.data['/transfers/tr_created'].amount_reversed=40;
  return f.transport(url,options);
 };
 const result=await adapter.dispatchAuctionTestReversal(reversal,'sk_test_synthetic','acct_platform',transport);
 assert.equal(result.id,'trr_created');assert.equal(result.cumulative_reconciled,false);assert.equal(result.parent_transfer.amount_reversed,120);
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});
test('postflight GET failure retains exact successful reversal for durable reconciliation',async()=>{
 const f=fixture();f.data['/transfers/tr_created/reversals']=reversed();let posted=false;
 const transport=async(url,options)=>{
  if(posted&&url.endsWith('/transfers/tr_created'))throw Error('synthetic postflight outage');
  const response=await f.transport(url,options);if(options.method==='POST')posted=true;return response;
 };
 const result=await adapter.dispatchAuctionTestReversal(reversal,'sk_test_synthetic','acct_platform',transport);
 assert.equal(result.id,'trr_created');assert.equal(result.parent_transfer,null);assert.equal(result.cumulative_reconciled,false);
 assert.equal(f.calls.filter(c=>c.method==='POST').length,1);
});
test('actual endpoint is disabled by default and consumes DB permit before dispatch; persisted failure stays unknown',async()=>{
 const env={SUPABASE_SERVICE_ROLE_KEY:'synthetic',STRIPE_AUCTION_PLATFORM_TEST_KEY:'sk_test_synthetic',STRIPE_AUCTION_PLATFORM_TEST_ACCOUNT_ID:'acct_platform'};
 const calls=[];let handler,permitted=true;
 const Deno={env:{get:k=>env[k]},serve:f=>handler=f};
 const shared={readOptionalEnv:k=>env[k],jsonResponse:(s,b)=>new Response(JSON.stringify(b),{status:s}),createAdminClient:()=>({configured:true,client:{rpc:async(name,args)=>{
  calls.push({name,args});if(name.startsWith('claim')){const result={...op,dispatchAuthorized:permitted};permitted=false;return{data:result};}
  return{error:{message:'synthetic persistence interruption'}};
 }}})};
 load('stripe-auction-test-transfer/index.ts',{Deno,require:name=>name.startsWith('jsr:')?{}:name.endsWith('stripe-connect.ts')?shared:
  {...adapter,dispatchAuctionTestTransfer:async()=>{calls.push({name:'provider-post'});return transfer();}}});
 const send=()=>handler(new Request('https://test.invalid',{method:'POST',headers:{Authorization:'Bearer synthetic'},
  body:JSON.stringify({operation_id:op.id,action:'dispatch'})}));
 assert.equal((await send()).status,503);assert.equal(calls.length,0);
 env.STRIPE_AUCTION_TEST_TRANSFER_EXECUTION_ENABLED='true';
 const failed=await send();assert.equal(failed.status,409);assert.equal((await failed.json()).reconcileOnly,true);
 assert.deepEqual(calls.map(c=>c.name),['claim_auction_test_transfer_dispatch','provider-post','record_auction_test_transfer_result']);
 assert.equal((await send()).status,409);assert.equal(calls.filter(c=>c.name==='provider-post').length,1);
});
