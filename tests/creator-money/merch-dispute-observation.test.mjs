import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {loadPureTypeScriptModule} from '../helpers/pure-typescript-module.mjs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
const {observeMerchDisputes:observe}=loadPureTypeScriptModule('supabase/functions/_shared/merch-dispute-observation.ts');
const context={id:randomUUID(),order_id:randomUUID(),payment_intent_id:'pi_merch',charge_id:null,amount_minor:1000,currency:'usd'};
function fixture(disputes=[]){
 const data={ '/account':{id:'acct_test',object:'account'},'/payment_intents/pi_merch':{id:'pi_merch',object:'payment_intent',livemode:false,status:'succeeded',amount:1000,amount_received:1000,currency:'usd',latest_charge:'ch_merch'},
 '/charges/ch_merch':{id:'ch_merch',object:'charge',payment_intent:'pi_merch',livemode:false,paid:true,captured:true,amount:1000,amount_captured:1000,currency:'usd',disputed:false},
 '/disputes?charge=ch_merch&limit=100':{object:'list',has_more:false,data:disputes}};
 const calls=[];return {data,calls,transport:async(url,options)=>{assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer sk_test_synthetic');const p=url.replace('https://api.stripe.com/v1','');calls.push(p);assert.ok(data[p],p);return new Response(JSON.stringify(data[p]));}};
}
const dispute=(patch={})=>({id:'du_test',object:'dispute',charge:'ch_merch',payment_intent:'pi_merch',livemode:false,amount:1000,currency:'usd',created:1700000000,status:'won',...patch});
test('complete real adapter repeats full provider list and charge, retains only non-PII evidence',async()=>{
 const f=fixture([dispute({evidence:{customer_email_address:'not-persisted@example.test'}})]),out=await observe(context,'sk_test_synthetic','acct_test',f.transport);
 assert.equal(out.complete,true);assert.equal(out.financial_authority,false);assert.deepEqual(Object.keys(out.disputes[0]),['id','status','amount','created']);
 assert.equal(f.calls.filter(x=>x.startsWith('/disputes?')).length,2);assert.equal(f.calls.filter(x=>x.startsWith('/charges/')).length,2);
});
for(const patch of [{charge:'ch_other'},{payment_intent:'pi_other'},{livemode:true},{status:'unknown'},{amount:null},{currency:'eur'}])test('mismatched or unknown provider dispute is not clearance '+JSON.stringify(patch),async()=>{const f=fixture([dispute(patch)]);await assert.rejects(observe(context,'sk_test_synthetic','acct_test',f.transport));});
test('incomplete pagination, changed snapshot and account mismatch fail closed',async()=>{
 const f=fixture();f.data['/disputes?charge=ch_merch&limit=100'].has_more=true;await assert.rejects(observe(context,'sk_test_synthetic','acct_test',f.transport));
 const g=fixture();g.data['/account'].id='acct_other';await assert.rejects(observe(context,'sk_test_synthetic','acct_test',g.transport));
 const h=fixture();let reads=0;await assert.rejects(observe(context,'sk_test_synthetic','acct_test',async(url,opt)=>{if(url.includes('/disputes?')&&++reads===2)h.data['/disputes?charge=ch_merch&limit=100'].data=[dispute()];return h.transport(url,opt);}));
});
test('actual endpoint starts a server attempt before provider observation and persists before cost work',async()=>{
 let handler;const calls=[],f=fixture();const a={...context};
 const admin={rpc:async(name,args)=>{calls.push(name);if(name==='get_merch_cost_reconciliation_context')return{data:{id:context.order_id}};
  if(name==='begin_merch_dispute_observation')return{data:a};if(name==='complete_merch_dispute_observation'){assert.equal(args.p_attempt_id,a.id);assert.equal(args.p_facts.complete,true);return{data:{disputeState:'none'}};}
  if(name==='record_merch_provider_cost_observation')return{data:{financialAuthority:false}};throw Error(name);}};
 const runtime={exports:{},Deno:{serve:f=>handler=f},require:name=>{
  if(name.startsWith('jsr:'))return{};
  if(name.endsWith('merch-observation-budget.ts'))return loadPureTypeScriptModule('supabase/functions/_shared/merch-observation-budget.ts');
  if(name.endsWith('merch-dispute-observation.ts'))return{observeMerchDisputes:async(c,s,account)=>{calls.push('provider_disputes');return observe(c,s,account,f.transport);}};
  if(name.endsWith('stripe-merch-cost-observation.ts'))return{observeStripeMerchCosts:async()=>{calls.push('provider_costs');return{};}};
  if(name.endsWith('stripe-connect.ts'))return{readOptionalEnv:k=>k==='SUPABASE_SERVICE_ROLE_KEY'?'service_synthetic':'acct_test',readStripeTestSecret:()=>({configured:true,secret:'sk_test_synthetic'}),createAdminClient:()=>({configured:true,client:admin}),jsonResponse:(status,body)=>new Response(JSON.stringify(body),{status})};throw Error(name);
 }};
 vm.runInNewContext(ts.transpileModule(readFileSync('supabase/functions/stripe-merch-cost-reconcile/index.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,runtime);
 const send=token=>handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify({order_id:context.order_id})}));
 assert.equal((await send('user_jwt')).status,403);assert.deepEqual(calls,[]);
 assert.equal((await send('service_synthetic')).status,200);
 assert.deepEqual(calls,['get_merch_cost_reconciliation_context','begin_merch_dispute_observation','provider_disputes','complete_merch_dispute_observation','provider_costs','record_merch_provider_cost_observation']);
});
test('actual full-schema roles: delivery-independent none/open/lost snapshots, stale attempts and nonfinancial holds',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const root=()=>db.exec('reset role');const service=()=>db.exec(`reset role;select set_config('request.jwt.claims','{"role":"service_role"}',false);set role service_role;`);
 const begin=order=>one('select public.begin_merch_dispute_observation($1)',[order]);
 const save=(a,f)=>one('select public.complete_merch_dispute_observation($1,$2)',[a.id,JSON.stringify(f)]);
 const state=async(order)=>{await root();return one('select private.merch_return_hold_state(o,clock_timestamp()) from public.merch_orders o where id=$1',[order]);};
 try{
  for(const mode of ['tracked','untracked']){
   await root();const id=randomUUID(),product=randomUUID(),buyer=randomUUID(),creator=randomUUID();
   await db.query(`insert into public.merch_products(id,creator_id,display_name,title,provider,status,fulfillment_model,price_minor,currency,environment,is_physical_good,creates_digital_access,publication_status,stock_quantity,shipping_tracking_mode) values($1,$2,'Synthetic','Synthetic','stripe_physical_goods','sandbox','manual',1000,'usd','sandbox',true,false,'published',10,$3)`,[product,creator,mode]);
   await db.query(`insert into public.merch_orders(id,product_id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id) values($1,$2,$3,$4,'stripe_physical_goods','sandbox','paid','not_started','paid',1000,1000,'usd',$5,$6)`,[id,product,buyer,creator,'cs_test_'+mode,'pi_'+mode]);
   assert.ok((await state(id)).returnHoldReasons.includes('merch_dispute_clearance_unknown'));
   for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(begin(id),/permission denied/);await root();}
   await service();const a=await begin(id),f={account_id:'acct_test',order_id:id,payment_intent_id:'pi_'+mode,charge_id:'ch_'+mode,currency:'usd',amount_minor:1000,environment:'sandbox',complete:true,financial_authority:false,disputed:false,disputes:[]};
   await assert.rejects(save(a,{...f,order_id:randomUUID()}),/invalid/);await assert.rejects(save(a,{...f,complete:false}),/invalid/);
   assert.equal((await save(a,f)).disputeState,'none');assert.equal((await save(a,f)).duplicate,true);
   let s=await state(id);assert.equal(s.providerDisputeRefreshStatus,'fresh');assert.ok(s.providerDisputeCheckedAt);assert.ok(s.providerDisputeFreshUntil);assert.equal(s.providerDisputeState,'none');assert.ok(!s.returnHoldReasons.includes('merch_dispute_clearance_unknown'));
   assert.ok(s.returnHoldReasons.includes(mode==='tracked'?'verified_delivery_required':'verified_purchase_required'));assert.equal(s.financialAuthority,false);
   await root();assert.equal(await one('select count(*)::int from private.merch_return_evidence where order_id=$1',[id]),0,'no fabricated parcel delivery');
   const expired=await one("select private.merch_return_hold_state(o,clock_timestamp()+interval '13 hours') from public.merch_orders o where id=$1",[id]);
   assert.equal(expired.providerDisputeRefreshStatus,'stale');assert.equal(expired.providerDisputeState,'unknown');assert.ok(expired.returnHoldReasons.includes('merch_dispute_clearance_unknown'));
   await service();const won=await begin(id);await save(won,{...f,disputed:true,disputes:[{id:'du_'+mode,status:'won',created:1700000000,amount:1000}]});
   assert.equal((await state(id)).providerDisputeState,'resolved');
   await service();const older=await begin(id),newer=await begin(id);await assert.rejects(save(older,f),/stale/);assert.equal((await state(id)).providerDisputeState,'unknown','incomplete newer reconciliation invalidates prior clearance');
   await service();const open={...f,disputed:true,disputes:[{id:'du_'+mode,status:'needs_response',created:1700000000,amount:1000}]};await save(newer,open);assert.equal((await state(id)).providerDisputeState,'open');
   await service();const lost=await begin(id);await save(lost,{...open,disputes:[{...open.disputes[0],status:'lost'}]});assert.equal((await state(id)).providerDisputeState,'lost');
   await service();const erased=await begin(id);await assert.rejects(save(erased,f),/history_regressed/);await assert.rejects(save(erased,{...open,account_id:'acct_other'}),/identity_changed/);
   const recovered=await begin(id);await save(recovered,{...open,disputes:[{...open.disputes[0],status:'won'}]});
   s=await state(id);assert.equal(s.providerDisputeState,'resolved');assert.equal(s.financialAuthority,false);
   assert.ok(s.returnHoldReasons.includes(mode==='tracked'?'verified_delivery_required':'verified_purchase_required'),'resolved provider case does not clear independent obligations');
   assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),0,'no dispute snapshot credits or pays earnings');
   const financialHold=await one(`select private.merch_return_hold_state(jsonb_populate_record(o,'{"payment_status":"disputed"}'::jsonb),clock_timestamp()) from public.merch_orders o where id=$1`,[id]);
   assert.ok(financialHold.returnHoldReasons.includes('merch_dispute_unresolved'),'won provider evidence cannot clear independent payment loss hold');
   await service();const beforeUpdate=await begin(id);await root();await new Promise(resolve=>setTimeout(resolve,20));
   await db.query("update public.merch_orders set updated_at=clock_timestamp()+interval '1 second' where id=$1",[id]);
   assert.equal((await state(id)).providerDisputeState,'unknown','newer order webhook invalidates clearance');
   await service();await assert.rejects(save(beforeUpdate,{...open,disputes:[{...open.disputes[0],status:'won'}]}),/stale/);

   await root();await assert.rejects(db.exec('delete from private.merch_dispute_observations'),/append_only/);
   for(const role of ['anon','authenticated','service_role']){await db.exec(`set role ${role}`);await assert.rejects(one('select count(*) from private.merch_dispute_observations'),/permission denied/);await root();}
  }
 }finally{await db.close();}
});
