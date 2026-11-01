import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID,createHmac} from 'node:crypto';
import ts from 'typescript';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
function load(file,{Deno={},modules={},fetch=globalThis.fetch}={}){
 const module={exports:{}};const require=n=>n.startsWith('jsr:')?{}:modules[n];
 new Function('require','module','exports','Deno','fetch',ts.transpileModule(readFileSync('supabase/functions/'+file,'utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(require,module,module.exports,Deno,fetch);
 return module.exports;
}

test('signed callback → durable inbox → scoped authenticated GET → real SQL 30-day state; adversarial corrections stay held',{timeout:240000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const creator=randomUUID(),buyer=randomUUID(),stranger=randomUUID(),cs=randomUUID(),bs=randomUUID(),ss=randomUUID();
 const root=()=>db.exec('reset role');
 const claim=async(u,s)=>{await root();await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:u,session_id:s})]);await db.exec('set role authenticated');};
 const service=async()=>{await root();await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false);set role service_role`);};
 let order,webhook,worker,stripeWebhook;const network=[];
 const env={MERCH_SHIPPO_WEBHOOK_SECRET:'fixture-hmac',MERCH_TRACKING_WORKER_SECRET:'fixture-worker',MERCH_SHIPPO_TEST_TOKEN:'shippo_test_fixture',
  STRIPE_MERCH_WEBHOOK_SECRET:'whsec_fixture',SUPABASE_URL:'https://fixture.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'fixture'};
 const rpc=async(name,args)=>{
  await service();
  const specs={receive_merch_tracking_hint:['p_hash','p_carrier','p_tracking_number','p_environment'],claim_merch_tracking_jobs:['p_limit','p_environment'],
   complete_merch_tracking_job:['p_assignment_id','p_lease','p_facts','p_registered'],
   process_stripe_merch_webhook_lifecycle:['p_event_id','p_event_type','p_raw_event_hash','p_facts']};
  const keys=specs[name];assert.ok(keys,name);
  try{return {data:await one(`select public.${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')})`,keys.map(k=>typeof args[k]==='object'?JSON.stringify(args[k]):args[k])),error:null};}
  catch(e){return {data:null,error:{message:e.message}};}finally{await root();}
 };
 const admin={rpc},shared={createAdminClient:()=>({configured:true,client:admin}),jsonResponse:(s,b)=>new Response(JSON.stringify(b),{status:s}),readOptionalEnv:k=>env[k]};
 let snapshot;
 const provider=load('_shared/merch-tracking.ts',{fetch:async(url,options)=>{
  network.push({url,method:options.method,account:options.headers['SHIPPO-ACCOUNT-ID']});
  if(snapshot===null)throw Error('synthetic outage');return new Response(JSON.stringify(snapshot));
 }});
 const modules={'../_shared/stripe-connect.ts':shared,'../_shared/merch-tracking.ts':provider};
 load('merch-tracking-webhook/index.ts',{Deno:{serve:h=>{webhook=h;}},modules});
 load('merch-tracking-reconcile/index.ts',{Deno:{serve:h=>{worker=h;}},modules});
 const Deno={env:{get:k=>env[k]},serve:h=>{stripeWebhook=h;}};
 const stripe=load('_shared/stripe-connect.ts',{Deno,modules:{'npm:@supabase/supabase-js@2':{createClient:()=>admin},
  './exact-subject-authority.ts':load('_shared/exact-subject-authority.ts')}});
 load('stripe-merch-webhook/index.ts',{Deno,modules:{'../_shared/stripe-connect.ts':{...stripe,safeWriteAuditLog:async()=>{}},
  '../_shared/stripe-payment-settlement.ts':load('_shared/stripe-payment-settlement.ts')}});
 const sendSigned=async(handler,event,header,secret)=>{
  const raw=JSON.stringify(event),now=Math.floor(Date.now()/1000),signature=createHmac('sha256',secret).update(`${now}.${raw}`).digest('hex');
  return handler(new Request('https://fixture.test',{method:'POST',body:raw,headers:{[header]:`t=${now},v1=${signature}`}}));
 };
 const run=()=>worker(new Request('https://fixture.test',{method:'POST',headers:{authorization:'Bearer fixture-worker'}}));
 const due=async()=>{await root();await db.exec("update private.merch_tracking_jobs set next_attempt_at=clock_timestamp()-interval '1 minute'");};
 const projection=async()=>{await root();return one('select public.merch_order_projection_internal(o) from public.merch_orders o where id=$1',[order]);};
 try{
  await db.query('insert into auth.users(id,is_anonymous,email_confirmed_at) values($1,false,now()),($2,false,now()),($3,false,now())',[creator,buyer,stranger]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$4),($5,$6)',[cs,creator,bs,buyer,ss,stranger]);
  await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
   select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,'member',d.capability,s.id::text,'service_reconciliation'
   from auth.sessions s cross join public.wave1_legal_document_versions d where s.user_id in($1,$2,$3) and d.active and d.market='UNITED_STATES' and d.capability='account'`,[creator,buyer,stranger]);
  const product=randomUUID();await db.query(`insert into public.merch_products(id,creator_id,display_name,title,provider,status,fulfillment_model,price_minor,currency,environment,is_physical_good,creates_digital_access,publication_status,stock_quantity,shipping_tracking_mode)
   values($1,$2,'Test','Test','stripe_physical_goods','sandbox','manual',1000,'usd','sandbox',true,false,'published',10,'tracked')`,[product,creator]);
  const make=async()=>{const id=randomUUID();await root();await db.query(`insert into public.merch_orders(id,product_id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,stripe_checkout_session_id,stripe_payment_intent_id,created_at)
   values($1,$2,$3,$4,'stripe_physical_goods','sandbox','pending','not_started','pending',1000,1000,'usd',$5,$6,clock_timestamp()-interval '40 days')`,[id,product,buyer,creator,'cs_test_'+id.replaceAll('-',''),'pi_'+id.replaceAll('-','')]);return id;};
  order=await make();const now=Math.floor(Date.now()/1000),paid=now-35*86400,first=paid+86400,delivered=now-31*86400;
  const checkout={id:'evt_checkout_'+order.replaceAll('-',''),type:'checkout.session.completed',created:paid,livemode:false,data:{object:{
   id:'cs_test_'+order.replaceAll('-',''),object:'checkout.session',livemode:false,mode:'payment',status:'complete',payment_status:'paid',payment_intent:'pi_'+order.replaceAll('-',''),
   amount_total:1000,currency:'usd',client_reference_id:order,metadata:{chillywood_order_id:order},
   collected_information:{shipping_details:{name:'SYNTHETIC RECIPIENT',address:{country:'US',postal_code:'12345',line1:'SYNTHETIC STREET',city:'TESTVILLE',state:'CA'}}}}}};
  let r=await sendSigned(stripeWebhook,checkout,'stripe-signature',env.STRIPE_MERCH_WEBHOOK_SECRET);assert.equal(r.status,200,await r.text());
  assert.equal(await one('select postal_code from private.merch_checkout_destination where order_id=$1',[order]),'12345');
  const success={id:'evt_pi_'+order.replaceAll('-',''),type:'payment_intent.succeeded',created:paid,livemode:false,data:{object:{id:'pi_'+order.replaceAll('-',''),object:'payment_intent',
   status:'succeeded',livemode:false,amount:1000,amount_received:1000,currency:'usd',metadata:{chillywood_order_id:order}}}};
  r=await sendSigned(stripeWebhook,success,'stripe-signature',env.STRIPE_MERCH_WEBHOOK_SECRET);assert.equal(r.status,200,await r.text());
  await claim(stranger,ss);await assert.rejects(one('select public.get_merch_tracking($1)',[order]),/unavailable/);
  await claim(buyer,bs);await assert.rejects(one("select public.assign_merch_tracking($1,'usps','ABC123456')",[order]),/unavailable/);
  await claim(creator,cs);assert.equal((await one("select public.assign_merch_tracking($1,'usps','ABC123456')",[order])).assigned,true);
  assert.equal((await one("select public.assign_merch_tracking($1,'usps','ABC123456')",[order])).assigned,true);
  await assert.rejects(one("select public.assign_merch_tracking($1,'ups','XYZ123456')",[order]),/immutable/);
  await root();const assignment=await one('select id from private.merch_tracking_assignments where order_id=$1',[order]);
  await service();assert.equal((await one("select public.complete_merch_tracking_job($1,null,'{}',true)",[assignment])).stale,true);await root();
  assert.equal((await run()).status,200);assert.equal(network.length,0,'no qualification means no provider request');
  // Synthetic accounting snapshot only: prove a former dynamic tracking hold
  // refreshes without removing other immutable financial holds.
  const costObservation=randomUUID();await db.query("insert into private.merch_provider_cost_observations(id,order_id,observation_hash,facts) values($1,$2,'fixture','{}')",[costObservation,order]);
  await db.query(`insert into private.merch_held_net_allocations(observation_id,order_id,policy_version,net_minor,platform_minor,creator_minor,
   platform_delta_minor,creator_delta_minor,recovery_obligation_minor,hold_reasons)
   values($1,$2,'physical_merch_net_90_10_v1',0,0,0,0,0,0,array['sandbox_not_payable','verified_purchase_required','merch_tracking_review_required'])`,[costObservation,order]);
  await db.exec("insert into private.merch_tracking_qualification values(true,true,'SYNTHETIC TEST ONLY',clock_timestamp()+interval '1 day')");
  await db.query("insert into private.merch_tracking_accounts values($1,'managed_fixture',true,'SYNTHETIC TEST ONLY',clock_timestamp()+interval '1 day')",[creator]);
  assert.equal(await one("select private.merch_tracking_configured($1,'production')",[creator]),false,
   'sandbox qualification cannot qualify a live merchant');
  assert.deepEqual(await one("select public.claim_merch_tracking_jobs(5,'production')"),[],
   'live worker cannot claim sandbox shipments');
  await assert.rejects(one("select public.claim_merch_tracking_jobs(5,'unknown')"),/environment_invalid/);
  const iso=n=>new Date(n*1000).toISOString();
  snapshot={carrier:'usps',tracking_number:'ABC123456',test:true,address_to:{zip:'12345',country:'US'},
   tracking_status:{status:'DELIVERED',status_date:iso(delivered)},tracking_history:[{status:'TRANSIT',status_date:iso(first)}]};
  const hint={event:'track_updated',data:snapshot};
  for(let i=0;i<2;i++)assert.equal((await sendSigned(webhook,hint,'shippo-auth-signature',env.MERCH_SHIPPO_WEBHOOK_SECRET)).status,200);
  assert.equal(await one('select count(*)::int from private.merch_tracking_inbox'),1);assert.equal((await projection()).returnWindowStatus,'awaiting_verified_delivery');
  r=await run();assert.equal(r.status,200,await r.text());assert.deepEqual(network.map(x=>x.method),['POST','GET']);
  assert.ok(network.every(x=>x.account==='managed_fixture'));
  let p=await projection();assert.equal(p.returnWindowStatus,'review_required','unqualified return/dispute clearance still held');
  assert.ok(!p.netSettlementHoldReasons.includes('merch_tracking_review_required'));assert.ok(!p.netSettlementHoldReasons.includes('verified_purchase_required'));
  assert.ok(p.netSettlementHoldReasons.includes('sandbox_not_payable'));
  assert.equal(new Date(p.returnWindowEndsAt).getTime(),(delivered+30*86400)*1000);assert.equal(p.financialAuthority,false);
  assert.equal(await one("select confidence from private.merch_tracking_jobs"),'corroborated');
  await db.exec("update private.merch_tracking_jobs set checked_at=clock_timestamp()-interval '13 hours'");
  await claim(buyer,bs);const staleProjection=await one('select public.get_merch_tracking($1)',[order]);
  assert.equal(staleProjection.confidence,'unverified');assert.equal(staleProjection.reviewReason,'tracking_reconciliation_required');
  await root();await db.exec('update private.merch_tracking_jobs set checked_at=clock_timestamp()');
  // A lease is single-writer, and a delayed previous worker cannot overwrite it.
  await due();await service();
  const leased=await one('select public.claim_merch_tracking_jobs(5)');assert.equal(leased.length,1);
  assert.deepEqual(await one('select public.claim_merch_tracking_jobs(5)'),[]);
  const facts=await provider.normalizeTracking(JSON.stringify(snapshot));
  assert.equal((await one('select public.complete_merch_tracking_job($1,$2,$3,true)',[leased[0].id,randomUUID(),JSON.stringify(facts)])).stale,true);
  const accepted=await one('select public.complete_merch_tracking_job($1,$2,$3,true)',[leased[0].id,leased[0].lease,JSON.stringify(facts)]);
  assert.equal(accepted.confidence,'corroborated');
  assert.equal((await one('select public.complete_merch_tracking_job($1,$2,$3,true)',[leased[0].id,leased[0].lease,JSON.stringify(facts)])).stale,true);
  assert.equal((await one('select public.complete_merch_tracking_job($1,null,$2,true)',[leased[0].id,JSON.stringify(facts)])).stale,true);
  await root();
  // Corroboration does not clear unrelated order-wide open cases.
  await db.query(`insert into private.merch_return_evidence(order_id,delivered_at,evidence_reference,delivery_state,return_state,dispute_state)
   values($1,$2,'test-open-return','verified','open','open')`,[order,iso(delivered)]);
  await due();await run();p=await projection();assert.ok(p.returnHoldReasons.includes('merch_return_unresolved'));assert.ok(p.returnHoldReasons.includes('merch_dispute_unresolved'));
  // Out-of-order notifications never replace authoritative GET state.
  await sendSigned(webhook,{event:'track_updated',data:{...snapshot,tracking_status:{status:'TRANSIT',status_date:iso(first)}}},'shippo-auth-signature',env.MERCH_SHIPPO_WEBHOOK_SECRET);
  await run();assert.equal(await one('select confidence from private.merch_tracking_jobs'),'corroborated');
  snapshot.tracking_status.status_date=iso(delivered+3600);await due();await run();
  assert.equal(await one('select review_reason from private.merch_tracking_jobs'),'delivery_timestamp_corrected');
  assert.equal((await projection()).returnWindowStatus,'awaiting_verified_delivery');
  snapshot.tracking_status.status_date=iso(delivered);await due();await run();assert.equal(await one('select confidence from private.merch_tracking_jobs'),'corroborated');
  snapshot.address_to.zip='99999';await due();await run();assert.equal(await one('select review_reason from private.merch_tracking_jobs'),'destination_mismatch_or_missing');
  snapshot.address_to.zip='12345';snapshot.tracking_history[0].status_date=iso(paid-1);await due();await run();
  assert.equal(await one('select review_reason from private.merch_tracking_jobs'),'shipment_timing_unverified');
  snapshot.tracking_history[0].status_date=iso(first);snapshot.tracking_number='WRONG12345';await due();await run();
  assert.equal(await one('select review_reason from private.merch_tracking_jobs'),'tracking_identity_mismatch');
  snapshot.tracking_number='ABC123456';snapshot.test=false;await due();await run();
  assert.equal(await one('select review_reason from private.merch_tracking_jobs'),'provider_environment_mismatch');snapshot.test=true;
  snapshot.tracking_history[0].status_date=iso(first);snapshot.tracking_status.status='RETURNED';await due();await run();
  assert.equal((await projection()).returnWindowStatus,'awaiting_verified_delivery');
  snapshot=null;await due();await run();assert.ok((await projection()).returnHoldReasons.includes('verified_delivery_required'));
  const other=await make();await db.query("update public.merch_orders set payment_status='paid' where id=$1",[other]);
  await claim(creator,cs);await assert.rejects(one("select public.assign_merch_tracking($1,'usps','ABC123456')",[other]),/reused/);
  await one("select public.assign_merch_tracking($1,'ups','XYZ987654')",[other]);
  await root();await due();await service();const pending=await one('select public.claim_merch_tracking_jobs(5)');
  const newJob=pending.find(j=>j.order_id===other);assert.equal(newJob.registration_state,'pending');await root();
  await db.query("update private.merch_tracking_jobs set lease_until=clock_timestamp()-interval '1 second' where assignment_id=$1",[newJob.id]);
  await service();const reclaimed=await one('select public.claim_merch_tracking_jobs(5)');
  assert.equal(reclaimed.find(j=>j.id===newJob.id).registration_state,'attempted','unknown-outcome registration never becomes pending again');await root();
  await db.query("update public.merch_products set shipping_tracking_mode='untracked' where id=$1",[product]);
  const untracked=await make();await db.query("update public.merch_orders set payment_status='paid' where id=$1",[untracked]);
  await claim(creator,cs);await assert.rejects(one("select public.assign_merch_tracking($1,'usps','UNTRACKED1')",[untracked]),/not_available/);await root();
  const conflictCheckout=structuredClone(checkout);conflictCheckout.id+='conflict';
  conflictCheckout.data.object.collected_information.shipping_details.address.line1='CHANGED SYNTHETIC STREET';
  r=await sendSigned(stripeWebhook,conflictCheckout,'stripe-signature',env.STRIPE_MERCH_WEBHOOK_SECRET);
  assert.equal(r.status,200,await r.text());assert.equal(await one('select count(*)::int from private.merch_checkout_destination_conflicts'),1);
  assert.equal(await one('select count(*)::int from private.merch_fulfillment_address_conflicts'),1,'same-ZIP street conflict revokes destination corroboration');
  assert.equal(await one('select postal_code from private.merch_checkout_destination where order_id=$1',[order]),'12345','original destination is immutable');
  await claim(buyer,bs);assert.equal((await one('select public.get_merch_tracking($1)',[order])).reviewReason,'checkout_destination_conflict');await root();
  assert.ok((await projection()).returnHoldReasons.includes('merch_tracking_review_required'));
  const zipConflict=structuredClone(checkout);zipConflict.id+='zipconflict';
  zipConflict.data.object.collected_information.shipping_details.address.postal_code='99999';
  r=await sendSigned(stripeWebhook,zipConflict,'stripe-signature',env.STRIPE_MERCH_WEBHOOK_SECRET);assert.equal(r.status,200,await r.text());
  assert.equal(await one('select count(*)::int from private.merch_checkout_destination_conflicts'),1,'ZIP conflict remains append-only and deduplicated');
  assert.equal(await one('select postal_code from private.merch_checkout_destination where order_id=$1',[order]),'12345');
  await db.exec("update private.merch_tracking_qualification set valid_until=clock_timestamp()-interval '1 second'");
  const beforeRequests=network.length;await due();await run();assert.equal(network.length,beforeRequests,'expired qualification prevents provider I/O');
  await claim(buyer,bs);const expired=await one('select public.get_merch_tracking($1)',[order]);
  assert.equal(expired.confidence,'unverified');assert.equal(expired.reviewReason,'provider_unqualified');await root();
  await root();await db.query("update auth.sessions set not_after=clock_timestamp()-interval '1 minute' where id=$1",[cs]);
  await claim(creator,cs);await assert.rejects(one('select public.get_merch_tracking($1)',[order]),/unavailable/);await root();
  for(const role of ['anon','authenticated','service_role']){await db.exec(`set role ${role}`);
   await assert.rejects(db.exec('select * from private.merch_tracking_assignments'),/permission denied/);
   await assert.rejects(db.exec('update private.merch_tracking_qualification set qualified=true'),/permission denied/);await root();}
  assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),0);
  assert.equal(await one("select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where relnamespace='private'::regnamespace and relname like 'merch_tracking_%' and relkind='r'"),true);
 }finally{await db.close();}
});
