import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,createHmac} from 'node:crypto';
import ts from 'typescript';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {mountShipping} from '../helpers/merch-shipping-mounted-harness.mjs';
function load(file,{Deno={},modules={}}={}){
 const module={exports:{}};
 new Function('require','module','exports','Deno',ts.transpileModule(readFileSync('supabase/functions/'+file,'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>n.startsWith('jsr:')?{}:modules[n],module,module.exports,Deno);
 return module.exports;
}

test('signed exact Checkout → private SQL address under actual API roles → mounted shipping details; no financial authority',{timeout:240000},async()=>{
 const migration='20261030210200_merch_private_fulfillment_address.sql';
 const successors=['20261030212744_merch_return_cases.sql','20261031011531_merch_provider_dispute_observations.sql',
  '20261031011906_merch_return_buyer_replies.sql','20261031012501_merch_return_case_queues.sql','20261031012502_merch_reconciliation_driver.sql',
  '20261031033820_commerce_tax_readiness.sql','20261031033911_merch_tracking_correction_intake.sql',
  '20261031034904_merch_tracking_reviewed_supersession.sql',
  '20261101045810_merch_checkout_dispatch_provenance.sql',
  '20261101045816_merch_reconciliation_bounded_drain.sql'];
 const {db}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false,excludeMigrations:[migration,...successors]});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const creator=await one("select md5('shipping-host:'||n::text)::uuid from generate_series(1,1000)n where mod(hashtextextended('chillywood-wave1-us-rollout-v1:'||md5('shipping-host:'||n::text)::uuid::text,20260814),100)=0 limit 1");
 const buyer=randomUUID(),other=randomUUID(),cs=randomUUID(),bs=randomUUID(),os=randomUUID();
 const sessions={[creator]:cs,[buyer]:bs,[other]:os},audits=[];
 const root=()=>db.exec('reset role');
 const claim=async(u,s=sessions[u])=>{await root();await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:u,session_id:s})]);await db.exec('set role authenticated');};
 const service=async()=>{await root();await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false);set role service_role`);};
 let webhook,ui;
 const admin={rpc:async(name,args)=>{await service();try{return {data:await one(`select public.${name}($1,$2,$3,$4)`,[args.p_event_id,args.p_event_type,args.p_raw_event_hash,JSON.stringify(args.p_facts)]),error:null};}catch(e){return {data:null,error:{message:e.message}};}finally{await root();}}};
 const env={STRIPE_MERCH_WEBHOOK_SECRET:'whsec_synthetic',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'};
 const Deno={env:{get:k=>env[k]},serve:h=>{webhook=h;}};
 const stripe=load('_shared/stripe-connect.ts',{Deno,modules:{'npm:@supabase/supabase-js@2':{createClient:()=>admin},'./exact-subject-authority.ts':load('_shared/exact-subject-authority.ts')}});
 load('stripe-merch-webhook/index.ts',{Deno,modules:{'../_shared/stripe-connect.ts':{...stripe,safeWriteAuditLog:async(_c,a)=>audits.push(a)},'../_shared/stripe-payment-settlement.ts':load('_shared/stripe-payment-settlement.ts')}});
 const send=async(event,valid=true)=>{const raw=JSON.stringify(event),now=Math.floor(Date.now()/1000),signature=createHmac('sha256',valid?env.STRIPE_MERCH_WEBHOOK_SECRET:'wrong').update(`${now}.${raw}`).digest('hex');return webhook(new Request('https://fixture.test',{method:'POST',body:raw,headers:{'stripe-signature':`t=${now},v1=${signature}`}}));};
 const address={name:'SYNTHETIC RECIPIENT',line1:'100 FIXTURE STREET',line2:'UNIT TEST',city:'TESTVILLE',state:'CA',postal_code:'12345',country:'US'};
 const eventTime=Math.floor(Date.now()/1000);
 const event=(id,tag='a',shipping=address)=>({id:'evt_'+tag+'_'+id.replaceAll('-',''),type:'checkout.session.completed',created:eventTime,livemode:false,data:{object:{id:'cs_test_'+id.replaceAll('-',''),object:'checkout.session',livemode:false,mode:'payment',status:'complete',payment_status:'paid',payment_intent:'pi_'+id.replaceAll('-',''),amount_total:1000,currency:'usd',client_reference_id:id,metadata:{chillywood_order_id:id},collected_information:{shipping_details:{name:shipping.name,address:shipping,phone:'DO NOT STORE'}},customer_details:{email:'do-not-store@example.test'}}}});
 const read=async(id,actor=buyer)=>{await claim(actor);return one('select public.get_merch_fulfillment_address($1)',[id]);};
 try{
  await db.query('insert into auth.users(id,is_anonymous,email_confirmed_at) values($1,false,now()),($2,false,now()),($3,false,now())',[creator,buyer,other]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4),($5,$6)',[cs,creator,bs,buyer,os,other]);
  await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
   select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,'member',d.capability,s.id::text,'service_reconciliation'
   from auth.sessions s cross join public.wave1_legal_document_versions d where s.user_id in($1,$2,$3) and d.active and d.market='UNITED_STATES'
   and (d.capability='account' or (s.user_id=$1 and d.capability in('creator','creator_money')))`,[creator,buyer,other]);
  await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
  await one(`select public.wave1_evaluate_creator_eligibility($1,'{"accountStatus":"ACTIVE","age18Plus":true,"legalAccepted":true,"creatorRole":true,"moderationState":"CLEAR","market":"UNITED_STATES","rolloutEligible":true,"platformCapability":true,"providerEligible":true,"kycComplete":true,"taxComplete":true,"sanctionsClear":true,"payoutEligible":true,"inputVersions":{"evaluationSequence":1}}','shipping-fixture','local_pgtap')`,[creator]);
  const product=randomUUID();await db.query(`insert into public.merch_products(id,creator_id,display_name,title,provider,status,fulfillment_model,price_minor,currency,environment,is_physical_good,creates_digital_access,publication_status,stock_quantity,shipping_tracking_mode)
   values($1,$2,'Test','Test','stripe_physical_goods','sandbox','manual',1000,'usd','sandbox',true,false,'published',10,'untracked')`,[product,creator]);
  const make=async()=>{await root();const id=randomUUID();await db.query(`insert into public.merch_orders(id,product_id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id)
   values($1,$2,$3,$4,'stripe_physical_goods','sandbox','pending','not_started','pending',1000,1000,'usd',$5,$6)`,[id,product,buyer,creator,'cs_test_'+id.replaceAll('-',''),'pi_'+id.replaceAll('-','')]);return id;};
  const legacy=await make();
  for(const file of [migration,...successors])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
  assert.equal(await one('select fulfillment_address_policy_version from public.merch_orders where id=$1',[legacy]),null);
  const order=await make(),second=await make(),missing=await make();
  await assert.rejects(read(order),/unavailable/);
  let response=await send(event(order),false);assert.equal(response.status,400);await root();assert.equal(await one('select count(*)::int from private.merch_fulfillment_addresses'),0);
  const mismatched=event(order,'bad');mismatched.data.object.payment_intent='pi_wrong';response=await send(mismatched);assert.equal(response.status,200);assert.equal(await one('select count(*)::int from private.merch_fulfillment_addresses'),0);
  response=await send(event(order));assert.equal(response.status,200,await response.text());
  const original=await one('select address from private.merch_fulfillment_addresses where order_id=$1',[order]);assert.deepEqual(original,address);
  assert.equal((await read(order,creator)).status,'available');assert.deepEqual((await read(order)).address,address);
  await assert.rejects(read(order,other),/unavailable/);
  await claim(buyer,cs);await assert.rejects(one('select public.get_merch_fulfillment_address($1)',[order]),/unavailable/);
  await claim(buyer);await assert.rejects(one('select * from private.merch_fulfillment_addresses'),/permission denied/);
  await assert.rejects(one('select public.process_stripe_merch_before_fulfillment_address(null,null,null,null)'),/permission denied/);
  await service();await assert.rejects(one('select * from private.merch_fulfillment_addresses'),/permission denied/);
  await root();await db.exec('set role anon');await assert.rejects(one('select public.get_merch_fulfillment_address($1)',[order]),/permission denied/);await root();
  const before=await one('select to_jsonb(o) from public.merch_orders o where id=$1',[order]);
  assert.equal((await send(event(order))).status,200);
  assert.deepEqual(await one('select to_jsonb(o) from public.merch_orders o where id=$1',[order]),before);
  assert.equal(await one('select count(*)::int from private.merch_fulfillment_addresses'),1);
  assert.doesNotMatch(JSON.stringify(await one('select public.merch_order_projection_internal(o) from public.merch_orders o where id=$1',[order])),/FIXTURE STREET|RECIPIENT|UNIT TEST/);
  assert.doesNotMatch(JSON.stringify(await one('select jsonb_agg(to_jsonb(e)) from public.stripe_merch_events e')),/FIXTURE STREET|RECIPIENT|DO NOT STORE|example.test/);
  ui=await mountShipping({orderId:order,actor:creator,rpc:async(name,args,actor)=>{assert.equal(name,'get_merch_fulfillment_address');return read(args.p_order_id,actor);}});
  assert.doesNotMatch(ui.text(),/FIXTURE STREET/);await ui.press('View shipping details');assert.match(ui.text(),/100 FIXTURE STREET/);
  await ui.press('Hide shipping details');assert.doesNotMatch(ui.text(),/FIXTURE STREET/);
  await ui.order(second);await ui.press('View shipping details');assert.doesNotMatch(ui.text(),/FIXTURE STREET/);assert.match(ui.text(),/unavailable/);await ui.close();ui=null;
  await root();assert.equal(await one('select count(*)::int from private.merch_fulfillment_address_access'),2,'bounded buyer and eligible seller audit');
  await assert.rejects(db.query('update public.merch_orders set fulfillment_address_policy_version=null where id=$1',[order]),/immutable/);
  await db.query("update public.wave1_creator_eligibility set state='SUSPENDED' where creator_user_id=$1",[creator]);
  await assert.rejects(read(order,creator),/unavailable/);await root();
  await assert.rejects(db.query("update private.merch_fulfillment_addresses set address='{}' where order_id=$1",[order]),/immutable/);
  const empty=event(missing);delete empty.data.object.collected_information;await send(empty);assert.equal((await read(missing)).status,'unavailable');
  await send(event(second,'a',{...address,line1:'SECOND FIXTURE STREET'}));assert.equal((await read(second)).address.line1,'SECOND FIXTURE STREET');
  await send(event(legacy));assert.equal((await read(legacy)).status,'unavailable','historical orders never silently acquire new address authority');
  const malformed=await make();await send(event(malformed,'malformed',{...address,line1:'BAD\nCONTROL'}));assert.equal((await read(malformed)).status,'unavailable');
  const asynchronous=await make();const pending=event(asynchronous,'pending');pending.data.object.payment_status='unpaid';
  await send(pending);await root();assert.equal(await one('select count(*)::int from private.merch_fulfillment_addresses where order_id=$1',[asynchronous]),0);
  const settled=event(asynchronous,'settled');settled.type='checkout.session.async_payment_succeeded';await send(settled);assert.equal((await read(asynchronous)).status,'available');
  await send(pending);assert.equal((await read(asynchronous)).status,'available','late unpaid callback cannot replace frozen paid address');
  await root();assert.equal(await one('select count(*)::int from private.merch_purchase_time_evidence'),0,'Checkout must not fabricate successful PI purchase time');
  const success={id:'evt_pi_'+order.replaceAll('-',''),type:'payment_intent.succeeded',created:Math.floor(Date.now()/1000),livemode:false,data:{object:{
   id:'pi_'+order.replaceAll('-',''),object:'payment_intent',status:'succeeded',livemode:false,amount:1000,amount_received:1000,currency:'usd',metadata:{chillywood_order_id:order}}}};
  const purchaseResponse=await send(success);assert.equal(purchaseResponse.status,200,await purchaseResponse.text());
  await root();
  // Synthetic clearance fixture tests only consumption of the additive hold,
  // not issuance of return approval or a production clearance workflow.
  await db.query("insert into private.merch_return_evidence(order_id,delivered_at,evidence_reference,delivery_state,return_state,dispute_state) values($1,null,'SYNTHETIC CLEARANCE ONLY','not_applicable','none','none')",[order]);
  const futureState=()=>one("select private.merch_return_hold_state(o,statement_timestamp()+interval '31 days') from public.merch_orders o where id=$1",[order]);
  const beforeFuture=await futureState();assert.equal(beforeFuture.returnWindowStatus,'elapsed');
  await root();const beforeConflict=await one('select public.merch_order_projection_internal(o) from public.merch_orders o where id=$1',[order]);
  assert.ok(beforeConflict.verifiedPurchaseAt);assert.ok(beforeConflict.returnWindowEndsAt);
  await send(event(order,'conflict',{...address,line1:'CHANGED FIXTURE STREET'}));assert.equal((await read(order)).status,'review_required');await root();assert.deepEqual(await one('select address from private.merch_fulfillment_addresses where order_id=$1',[order]),original);
  const afterConflict=await one('select public.merch_order_projection_internal(o) from public.merch_orders o where id=$1',[order]);
  assert.equal(afterConflict.shippingTrackingMode,'untracked');assert.ok(afterConflict.returnHoldReasons.includes('merch_fulfillment_address_review_required'));
  assert.ok(afterConflict.netSettlementHoldReasons.includes('merch_fulfillment_address_review_required'));
  const afterFuture=await futureState();assert.equal(afterFuture.returnWindowStatus,'review_required');assert.equal(afterFuture.returnWindowEndsAt,beforeFuture.returnWindowEndsAt);
  assert.ok(afterFuture.returnHoldReasons.includes('merch_fulfillment_address_review_required'),'fulfillment conflict independently blocks cleared, elapsed untracked evidence');
  for(const key of ['verifiedPurchaseAt','verifiedDeliveryAt','returnWindowEndsAt','returnPolicyVersion'])assert.deepEqual(afterConflict[key],beforeConflict[key],key+' is not changed by a fulfillment conflict');
  assert.equal(await one('select count(*)::int from private.merch_checkout_destination_conflicts where order_id=$1',[order]),1,'same-ZIP street conflict also invalidates tracking destination corroboration');
  await db.query("update public.merch_orders set payment_status='disputed' where id=$1",[second]);await assert.rejects(read(second),/unavailable/);
  await root();await db.query("update public.merch_orders set refunded_amount_minor=100 where id=$1",[asynchronous]);await assert.rejects(read(asynchronous),/unavailable/);
  await root();await db.query("delete from auth.sessions where id=$1",[bs]);await assert.rejects(read(missing),/unavailable/);
  await root();assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),0);assert.equal(await one('select count(*)::int from private.merch_purchase_time_evidence'),1,'only canonical succeeded PI establishes purchase time');
  admin.rpc=async()=>({data:null,error:{message:'PRIVATE FIXTURE STREET SQL constraint payload'}});
  const failed=await send(event(order,'error'));assert.equal(failed.status,500);assert.doesNotMatch(await failed.text(),/PRIVATE FIXTURE|constraint payload/);
  assert.doesNotMatch(JSON.stringify(audits),/FIXTURE STREET|RECIPIENT|DO NOT STORE|example.test/);
 }finally{if(ui)await ui.close();await db.close();}
});
