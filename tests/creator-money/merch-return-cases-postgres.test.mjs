import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';
import {mountReturns} from '../helpers/merch-return-mounted-harness.mjs';

test('actual API actors: order-bound cases, immutable aggregate holds, scoped staff review, independent provider evidence',{timeout:240000},async()=>{
 const migration='20261030212744_merch_return_cases.sql';
 const replies='20261031011906_merch_return_buyer_replies.sql';
 const queue='20261031012501_merch_return_case_queues.sql';
 const successors=['20261031011531_merch_provider_dispute_observations.sql',replies,queue,'20261031012502_merch_reconciliation_driver.sql',
  '20261031033820_commerce_tax_readiness.sql','20261031033911_merch_tracking_correction_intake.sql',
  '20261031034904_merch_tracking_reviewed_supersession.sql',
  '20261101045810_merch_checkout_dispatch_provenance.sql',
  '20261101045816_merch_reconciliation_bounded_drain.sql'];
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false,excludeMigrations:[migration,...successors]});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const creator=await one("select md5('return-host:'||n::text)::uuid from generate_series(1,1000)n where mod(hashtextextended('chillywood-wave1-us-rollout-v1:'||md5('return-host:'||n::text)::uuid::text,20260814),100)=0 limit 1");
 const buyer=randomUUID(),other=randomUUID(),staff=randomUUID(),moderator=randomUUID();
 const actors=[creator,buyer,other,staff,moderator],sessions=Object.fromEntries(actors.map(a=>[a,randomUUID()]));
 const root=()=>db.exec('reset role');
 const claim=async(u,s=sessions[u])=>{await root();await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:u,session_id:s,email:u+'@example.test'})]);await db.exec('set role authenticated');};
 const submit=async(order,kind='non_delivery',actor=buyer,request=randomUUID(),note='Synthetic order support concern')=>{await claim(actor);return one('select public.submit_merch_return_case($1,$2,$3,$4)',[order,request,kind,note]);};
 const respond=async(c,action,actor=buyer,request=randomUUID(),note='Synthetic support response')=>{await claim(actor);return one('select public.respond_merch_return_case($1,$2,$3,$4)',[c.id,request,action,note]);};
 const state=async(id)=>{await root();return one(`select public.merch_order_projection_internal(o) from public.merch_orders o where id=$1`,[id]);};
 try{
  for(const actor of actors){
   await db.query('insert into auth.users(id,email,is_anonymous,email_confirmed_at) values($1,$2,false,now())',[actor,actor+'@example.test']);
   await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessions[actor],actor]);
  }
  await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
   select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,'member',d.capability,s.id::text,'service_reconciliation'
   from auth.sessions s cross join public.wave1_legal_document_versions d where d.active and d.market='UNITED_STATES'
   and (d.capability='account' or (s.user_id=$1 and d.capability in('creator','creator_money')))`,[creator]);
  await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false)`);
  await one(`select public.wave1_evaluate_creator_eligibility($1,'{"accountStatus":"ACTIVE","age18Plus":true,"legalAccepted":true,"creatorRole":true,"moderationState":"CLEAR","market":"UNITED_STATES","rolloutEligible":true,"platformCapability":true,"providerEligible":true,"kycComplete":true,"taxComplete":true,"sanctionsClear":true,"payoutEligible":true,"inputVersions":{"evaluationSequence":1}}','return-fixture','local_pgtap')`,[creator]);
  for(const actor of [staff,moderator])await db.query(`insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by) values('moderator',$1,$2,'active','Synthetic role','test')`,[actor,actor+'@example.test']);
  for(const key of ['admin.support.manage','admin.refund_status.record'])await db.query(`insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,reason) values($1,$2,$3,'active','Synthetic scope')`,[staff,staff+'@example.test',key]);
  const make=async(mode='tracked',age=2)=>{
   await root();const product=randomUUID(),id=randomUUID();
   await db.query(`insert into public.merch_products(id,creator_id,display_name,title,provider,status,fulfillment_model,price_minor,currency,environment,is_physical_good,creates_digital_access,publication_status,stock_quantity,shipping_tracking_mode)
    values($1,$2,'Synthetic','Synthetic','stripe_physical_goods','sandbox','manual',1000,'usd','sandbox',true,false,'published',10,$3)`,[product,creator,mode]);
   await db.query(`insert into public.merch_orders(id,product_id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,created_at)
    values($1,$2,$3,$4,'stripe_physical_goods','sandbox','paid','shipped','paid',1000,1000,'usd',clock_timestamp()-($5||' days')::interval)`,[id,product,buyer,creator,age]);return id;
  };
  const historical=await make();
  for(const file of [migration,...successors])await db.exec(readFileSync('supabase/migrations/'+file,'utf8'));
  assert.equal((await state(historical)).returnCaseProtocol,null);
  assert.ok((await state(historical)).returnHoldReasons.includes('merch_return_clearance_unknown'));
  const order=await make(),otherOrder=await make();
  assert.equal((await state(order)).appReturnCaseState,'none');
  assert.ok(!(await state(order)).returnHoldReasons.includes('merch_return_clearance_unknown'));
  assert.ok((await state(order)).returnHoldReasons.includes('merch_dispute_clearance_unknown'));
  await root();await assert.rejects(db.query('update public.merch_orders set return_case_protocol=null where id=$1',[order]),/protocol_immutable/);
  await assert.rejects(db.query("update public.merch_orders set return_case_protocol='app_merch_cases_v1' where id=$1",[historical]),/protocol_immutable/);
  await assert.rejects(submit(order,'non_delivery',other),/unavailable/);
  await assert.rejects(submit(order,'return'),/window_unavailable/);
  const req=randomUUID(),first=await submit(order,'non_delivery',buyer,req);
  assert.equal(first.kind,'non_delivery');assert.equal(first.status,'open');assert.equal(first.refundExecuted,false);
  assert.equal((await submit(order,'non_delivery',buyer,req)).id,first.id);
  await assert.rejects(submit(otherOrder,'non_delivery',buyer,req),/request_conflict/);
  await assert.rejects(submit(order,'non_delivery',buyer,req,'Changed payload'),/request_conflict/);
  const second=await submit(order);let projection=await state(order);
  assert.equal(projection.appReturnCaseState,'open');
  assert.equal(projection.unresolvedReturnCaseCount,2);assert.equal(projection.verifiedDeliveryAt,null);
  assert.ok(projection.netSettlementHoldReasons.includes('merch_case_unresolved'));
  await root();assert.equal(await one('select count(*)::int from public.user_report_intake_events where source=\'merch_return_case\''),2);
  assert.equal(await one('select cardinality(unresolved_case_ids) from private.merch_return_case_hold_events order by event_id desc limit 1'),2);
  assert.equal(await one('select count(*)::int from private.merch_return_evidence'),0,'non-delivery never invents delivery');
  await claim(other);await assert.rejects(one('select public.read_merch_return_cases($1)',[order]),/unavailable/);
  await claim(buyer,sessions[creator]);await assert.rejects(one('select public.read_merch_return_cases($1)',[order]),/unavailable/);
  await assert.rejects(one('select public.submit_merch_return_case($1,$2,$3,$4)',[order,randomUUID(),'non_delivery','Wrong-session mutation']),/unavailable/);
  await assert.rejects(one('select public.respond_merch_return_case($1,$2,$3,$4)',[first.id,randomUUID(),'buyer_close','Wrong-session closure']),/unavailable/);
  for(const role of ['anon','authenticated','service_role']){
   await root();await db.exec(`set role ${role}`);
   for(const table of ['merch_return_cases','merch_return_case_events','merch_return_case_hold_events'])await assert.rejects(one('select * from private.'+table),/permission denied/);
   if(role!=='authenticated')await assert.rejects(one('select public.read_merch_return_cases($1)',[order]),/permission denied/);
  }
  assert.equal((await respond(first,'creator_response',creator)).status,'open');
  await assert.rejects(respond(first,'creator_response',buyer),/action_denied/);
  const replyId=randomUUID();const reply=await respond(first,'buyer_response',buyer,replyId,'Buyer additional evidence');
  assert.equal(reply.status,'open');assert.equal(reply.refundExecuted,false);
  assert.equal(reply.events.at(-1).actorRole,'buyer');assert.equal(reply.events.at(-1).note,'Buyer additional evidence');
  assert.equal((await respond(first,'buyer_response',buyer,replyId,'Buyer additional evidence')).events.length,reply.events.length);
  assert.equal((await state(order)).unresolvedReturnCaseCount,2);
  await assert.rejects(respond(first,'buyer_response',other),/unavailable/);
  await assert.rejects(respond(first,'buyer_response',creator),/action_denied/);
  await assert.rejects(respond(first,'buyer_response',staff),/action_denied/);
  await claim(buyer,sessions[other]);await assert.rejects(one('select public.respond_merch_return_case($1,$2,$3,$4)',[first.id,randomUUID(),'buyer_response','Stale reply']),/unavailable/);
  await assert.rejects(respond(first,'buyer_close',creator),/action_denied/);
  await assert.rejects(respond(first,'staff_resolve',moderator),/unavailable|action_denied/);
  await assert.rejects(respond(first,'staff_resolve',staff),/action_denied/);
  const esc=randomUUID();await respond(first,'escalate',buyer,esc);await respond(first,'escalate',buyer,esc);
  assert.equal((await respond(first,'buyer_response')).status,'escalated','reply never silently clears staff review');
  await claim(moderator);await assert.rejects(one('select public.list_merch_return_review_cases(50)'),/unavailable/);
  await claim(staff);assert.equal((await one('select public.list_merch_return_review_cases(50)')).cases.length,1);
  await root();await db.query("update public.platform_staff_permission_grants set status='revoked' where target_user_id=$1 and permission_key='admin.refund_status.record'",[staff]);
  await assert.rejects(respond(first,'staff_resolve',staff),/unavailable|action_denied/);
  await root();await db.query("update public.platform_staff_permission_grants set status='active' where target_user_id=$1",[staff]);
  assert.equal((await respond(first,'staff_resolve',staff)).status,'closed');
  await assert.rejects(respond(first,'buyer_response'),/already_closed/);
  projection=await state(order);assert.equal(projection.unresolvedReturnCaseCount,1);assert.ok(projection.netSettlementHoldReasons.includes('merch_case_unresolved'));
  await root();await db.query("update public.merch_orders set payment_status='disputed' where id=$1",[order]);
  await respond(second,'buyer_close');projection=await state(order);
  assert.equal(projection.unresolvedReturnCaseCount,0);assert.ok(!projection.netSettlementHoldReasons.includes('merch_case_unresolved'));
  assert.equal(projection.appReturnCaseState,'resolved');
  assert.ok(projection.returnHoldReasons.includes('merch_dispute_unresolved'));
  assert.equal(projection.paymentStatus,'disputed');
  await root();assert.equal(await one('select count(*)::int from public.creator_earnings_ledger'),0);
  for(const table of ['merch_return_cases','merch_return_case_events','merch_return_case_hold_events'])await assert.rejects(db.exec('delete from private.'+table),/immutable/);
  // Verified-delivery fixture exercises shipped-order eligibility, not creator
  // fulfillment assertions. The app's generic refund resolver is not consulted.
  const delivered=await make();await root();await db.query(`insert into private.merch_return_evidence(order_id,delivered_at,evidence_reference,delivery_state,return_state,dispute_state)
   values($1,clock_timestamp()-interval '1 day','SYNTHETIC VERIFIED DELIVERY','verified','none','none')`,[delivered]);
  const returned=await submit(delivered,'return');assert.ok(returned.acceptedTerms.returnWindowEndsAt);
  const immutableTerms=returned.acceptedTerms;await respond(returned,'escalate');
  await claim(buyer);assert.deepEqual((await one('select public.read_merch_return_cases($1)',[delivered])).cases[0].acceptedTerms,immutableTerms);
  await root();await db.query(`insert into private.merch_return_evidence(order_id,delivered_at,evidence_reference,delivery_state,return_state,dispute_state)
   select order_id,delivered_at,'SYNTHETIC EXTERNAL OPEN RETURN','verified','open','unknown' from private.merch_return_evidence where order_id=$1 limit 1`,[delivered]);
  await respond(returned,'buyer_close');const externallyHeld=await state(delivered);
  assert.equal(externallyHeld.appReturnCaseState,'resolved');assert.ok(externallyHeld.returnHoldReasons.includes('merch_return_unresolved'));
  assert.ok(externallyHeld.returnHoldReasons.includes('merch_dispute_clearance_unknown'));
  const elapsed=await make('tracked',60);await root();await db.query(`insert into private.merch_return_evidence(order_id,delivered_at,evidence_reference,delivery_state,return_state,dispute_state)
   values($1,clock_timestamp()-interval '31 days','SYNTHETIC EXPIRED DELIVERY','verified','none','none')`,[elapsed]);
  await assert.rejects(submit(elapsed,'return'),/window_unavailable/);
  assert.equal((await submit(elapsed,'non_delivery')).status,'open','support report never implies return deadline waiver');
  const untracked=await make('untracked',60);await root();
  await db.query("update public.merch_orders set stripe_payment_intent_id=$2 where id=$1",[untracked,'pi_'+untracked]);
  const event='evt_'+untracked;await db.query("insert into public.stripe_merch_events(stripe_event_id,event_type,status,linked_order_id) values($1,'payment_intent.succeeded','processed',$2)",[event,untracked]);
  // Consumption-only fixture; signed purchase issuance is separately tested.
  await db.query(`insert into private.merch_purchase_time_evidence(order_id,stripe_event_id,stripe_payment_intent_id,succeeded_at,raw_event_hash)
   values($1,$2,$3,clock_timestamp()-interval '29 days',repeat('a',64))`,[untracked,event,'pi_'+untracked]);
  const untrackedCase=await submit(untracked,'return');assert.equal(untrackedCase.acceptedTerms.shippingTrackingMode,'untracked');
  assert.equal(untrackedCase.acceptedTerms.verifiedDeliveryAt,null);
  await root();const future=await one("select private.merch_return_hold_state(o,clock_timestamp()+interval '2 days') from public.merch_orders o where id=$1",[untracked]);
  assert.equal(future.appReturnCaseState,'open');assert.ok(future.returnHoldReasons.includes('merch_case_unresolved'));
  const mountedOrder=await make();const ui=await mountReturns({orderId:mountedOrder,actor:buyer,rpc:async(name,args,actor)=>{
   await claim(actor);
   if(name==='read_merch_return_cases')return one('select public.read_merch_return_cases($1)',[args.p_order_id]);
   if(name==='submit_merch_return_case')return one('select public.submit_merch_return_case($1,$2,$3,$4)',[args.p_order_id,args.p_request_id,args.p_kind,args.p_note]);
   return one('select public.respond_merch_return_case($1,$2,$3,$4)',[args.p_case_id,args.p_request_id,args.p_action,args.p_note]);
  }});
  try{await ui.press('View return cases');await ui.change('SQL-backed mounted non-delivery claim');await ui.press('Report non-delivery');
   assert.match(ui.text(),/SQL-backed mounted non-delivery claim/);assert.equal((await state(mountedOrder)).unresolvedReturnCaseCount,1);
   await claim(buyer);const liveCase=(await one('select public.read_merch_return_cases($1)',[mountedOrder])).cases[0];
   await respond(liveCase,'creator_response',creator,randomUUID(),'Creator asks for details');await ui.press('Refresh return cases');
   assert.match(ui.text(),/Creator asks for details/);await ui.change('Buyer replies within same case');await ui.press(`Reply to case ${liveCase.id}`);
   assert.match(ui.text(),/Buyer replies within same case/);assert.equal((await state(mountedOrder)).unresolvedReturnCaseCount,1);
  }finally{await ui.close();}
  // Stable keyset discovery across 52 unresolved cases; closing an earlier row
  // cannot offset-skip the unseen 51st case. No per-order client fanout.
  const queueOrder=await make(),queueCases=[];
  for(let i=0;i<52;i++){const c=await submit(queueOrder);await respond(c,'escalate');queueCases.push(c);}
  const queueRead=async(role,after=null)=>one('select public.list_merch_return_case_queue($1,$2,50)',[role,after]);
  await claim(creator);const creatorPage=await queueRead('creator');
  assert.equal(creatorPage.cases.length,50);assert.ok(creatorPage.totalCount>=52);assert.ok(creatorPage.nextCursor);
  await claim(staff);const staffPage=await queueRead('staff');assert.equal(staffPage.cases.length,50);assert.ok(staffPage.totalCount>=52);
  await respond(staffPage.cases[0],'staff_resolve',staff);
  await claim(staff);const staffNext=await queueRead('staff',staffPage.nextCursor);
  assert.ok(staffNext.cases.length>=2);assert.equal(staffNext.nextCursor,null);
  const staffSeen=new Set([...staffPage.cases,...staffNext.cases].map(c=>c.id));
  for(const c of queueCases)assert.ok(staffSeen.has(c.id),'all escalated cases reachable including 51st');
  await claim(creator);const creatorNext=await queueRead('creator',creatorPage.nextCursor);
  const creatorSeen=new Set([...creatorPage.cases,...creatorNext.cases].map(c=>c.id));
  for(const c of queueCases)assert.ok(creatorSeen.has(c.id),'all creator unresolved cases reachable after closure');
  await claim(other);assert.equal((await queueRead('creator')).totalCount,0);assert.equal((await queueRead('buyer')).totalCount,0);
  await assert.rejects(queueRead('creator',creatorPage.nextCursor),/unavailable/);
  await assert.rejects(queueRead('staff'),/unavailable/);
  await claim(creator,sessions[other]);await assert.rejects(queueRead('creator'),/unavailable/);
  await claim(buyer);const buyerPage=await queueRead('buyer');assert.ok(buyerPage.totalCount>=51);
  await root();await db.exec('set role anon');await assert.rejects(queueRead('buyer'),/permission denied/);
  await root();const missingCreator=randomUUID();
  await db.query(`insert into public.merch_orders(id,buyer_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency)
   values($1,$2,'stripe_physical_goods','sandbox','paid','shipped','paid',1000,1000,'usd')`,[missingCreator,buyer]);
  const orphanCase=await submit(missingCreator);
  await claim(other);await assert.rejects(one('select public.read_merch_return_cases($1)',[missingCreator]),/unavailable/);
  await assert.rejects(respond(orphanCase,'escalate',other),/unavailable/,'nullable creator cannot null-bypass party authority');
  await root();const staffOrder=randomUUID();
  await db.query(`insert into public.merch_orders(id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency)
   values($1,$2,$3,'stripe_physical_goods','sandbox','paid','shipped','paid',1000,1000,'usd')`,[staffOrder,staff,creator]);
  const own=await submit(staffOrder,'non_delivery',staff);await respond(own,'escalate',staff);
  await assert.rejects(respond(own,'staff_resolve',staff),/action_denied/,'staff cannot adjudicate their own order');
  await claim(staff,sessions[other]);await assert.rejects(one('select public.list_merch_return_review_cases(50)'),/unavailable/);
 }finally{await db.close();}
});
