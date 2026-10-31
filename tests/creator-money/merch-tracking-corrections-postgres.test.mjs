import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('tracking correction intake is exact-order, append-only, replay-safe and never clears delivery or earnings holds',{timeout:240000},async()=>{
 const {db}=await createDatabase({applyRepair:true,repairInMigrationOrder:true,includeHeldStudio:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 const creator=randomUUID(),buyer=randomUUID(),other=randomUUID(),staff=randomUUID(),moderator=randomUUID();
 const actors=[creator,buyer,other,staff,moderator],sessions=Object.fromEntries(actors.map(a=>[a,randomUUID()]));
 const root=()=>db.exec('reset role');
 const claim=async(u,s=sessions[u])=>{await root();await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:u,session_id:s,email:u+'@example.test'})]);await db.exec('set role authenticated');};
 const state=async(id)=>{await root();return one('select public.merch_order_projection_internal(o) from public.merch_orders o where id=$1',[id]);};
 const request=(order,id=randomUUID(),number='NEW123456',note='Wrong number typed',carrier='usps')=>one('select public.request_merch_tracking_correction($1,$2,$3,$4,$5)',[order,id,carrier,number,note]);
 try {
  for(const actor of actors){
   await db.query('insert into auth.users(id,email,is_anonymous,email_confirmed_at) values($1,$2,false,now())',[actor,actor+'@example.test']);
   await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessions[actor],actor]);
  }
  await db.query(`insert into public.wave1_legal_acceptances(user_id,subject_hash,document_key,document_version,market,role_key,capability,session_generation,authority_source)
   select s.user_id,public.wave1_sha256(s.user_id::text),d.document_key,d.version,d.market,'member',d.capability,s.id::text,'service_reconciliation'
   from auth.sessions s cross join public.wave1_legal_document_versions d where d.active and d.market='UNITED_STATES' and d.capability='account'`);
  for(const actor of [staff,moderator])await db.query(`insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by) values('moderator',$1,$2,'active','Synthetic role','test')`,[actor,actor+'@example.test']);
  for(const key of ['admin.support.manage','admin.refund_status.record'])await db.query(`insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,reason) values($1,$2,$3,'active','Synthetic scope')`,[staff,staff+'@example.test',key]);
  const make=async(number,owner=creator)=>{
   await root();const product=randomUUID(),id=randomUUID();
   await db.query(`insert into public.merch_products(id,creator_id,display_name,title,provider,status,fulfillment_model,price_minor,currency,environment,is_physical_good,creates_digital_access,publication_status,stock_quantity,shipping_tracking_mode)
    values($1,$2,'Synthetic','Synthetic','stripe_physical_goods','sandbox','manual',1000,'usd','sandbox',true,false,'published',10,'tracked')`,[product,owner]);
   await db.query(`insert into public.merch_orders(id,product_id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency,created_at)
    values($1,$2,$3,$4,'stripe_physical_goods','sandbox','paid','shipped','paid',1000,1000,'usd',clock_timestamp()-interval '40 days')`,[id,product,buyer,owner]);
   await claim(owner);await one("select public.assign_merch_tracking($1,'usps',$2)",[id,number]);return id;
  };
  const order=await make('OLD123456'),second=await make('OLD654321'),foreign=await make('OTH123456',other);
  await root();
  await db.query(`insert into private.merch_return_evidence(order_id,delivered_at,evidence_reference,delivery_state,return_state,dispute_state)
   values($1,clock_timestamp()-interval '31 days','Synthetic existing carrier evidence','verified','unknown','unknown')`,[order]);
  const terms=await one('select to_jsonb(o) from public.merch_orders o where id=$1',[order]);
  const before=await state(order);
  assert.ok(before.verifiedDeliveryAt);
  await claim(buyer);await assert.rejects(request(order),/unavailable/);
  await claim(other);await assert.rejects(request(order),/unavailable/);
  await claim(creator,sessions[buyer]);await assert.rejects(request(order),/unavailable/);
  await claim(creator);await assert.rejects(request(foreign),/unavailable/);
  await assert.rejects(request(order,randomUUID(),'bad!'),/invalid/);
  await assert.rejects(request(order,randomUUID(),'NEW123456',''),/invalid/);
  await assert.rejects(request(order,randomUUID(),'NEW123456','reason','invalid'),/invalid/);
  await assert.rejects(request(order,randomUUID(),'OLD123456'),/invalid/);
  await assert.rejects(request(order,randomUUID(),'OTH123456'),/identity_unavailable/);
  const id=randomUUID();const first=await request(order,id);assert.equal(first.requests[0].status,'pending_review');
  assert.equal((await request(order,id)).requests.length,1);
  await assert.rejects(request(order,id,'NEW654321'),/request_conflict/);
  await assert.rejects(request(second,id),/request_conflict/);
  await assert.rejects(request(order),/pending/);
  await claim(buyer);assert.equal((await one('select public.read_merch_tracking_corrections($1)',[order])).requests.length,1);
  await claim(other);await assert.rejects(one('select public.read_merch_tracking_corrections($1)',[order]),/unavailable/);
  const held=await state(order);
  assert.ok(held.returnHoldReasons.includes('merch_tracking_correction_review_required'));
  assert.ok(held.netSettlementHoldReasons.includes('merch_tracking_correction_review_required'));
  for(const reason of before.returnHoldReasons)assert.ok(held.returnHoldReasons.includes(reason),reason);
  assert.equal(held.verifiedDeliveryAt,before.verifiedDeliveryAt);assert.equal(held.returnWindowEndsAt,before.returnWindowEndsAt);
  await root();assert.equal(await one('select count(*)::int from private.merch_return_evidence'),1);
  assert.deepEqual(await one('select to_jsonb(o) from public.merch_orders o where id=$1',[order]),terms,'no payment, shipping, or accepted order terms changed');
  assert.equal(await one('select tracking_number from private.merch_tracking_assignments where order_id=$1',[order]),'OLD123456');
  await assert.rejects(db.query("update private.merch_tracking_corrections set note='changed' where id=$1",[id]),/immutable/);
  await assert.rejects(db.query('delete from private.merch_tracking_corrections where id=$1',[id]),/immutable/);
  for(const role of ['anon','authenticated','service_role']){
   await root();await db.exec(`set role ${role}`);
   for(const table of ['merch_tracking_corrections','merch_tracking_correction_declines'])await assert.rejects(one('select * from private.'+table),/permission denied/);
   if(role!=='authenticated')await assert.rejects(one('select public.read_merch_tracking_corrections($1)',[order]),/permission denied/);
  }
  const decline=(req=randomUUID(),note='Incorrect proposal; further verification needed')=>one('select public.decline_merch_tracking_correction($1,$2,$3)',[id,req,note]);
  await claim(moderator);await assert.rejects(decline(),/unavailable/);await assert.rejects(one('select public.list_merch_tracking_correction_queue()'),/unavailable/);
  await claim(creator);await assert.rejects(decline(),/unavailable/);
  await claim(staff,sessions[buyer]);await assert.rejects(decline(),/unavailable/);
  await claim(staff);assert.equal((await one('select public.list_merch_tracking_correction_queue()')).requests.length,1);
  const declineId=randomUUID();assert.equal((await decline(declineId)).requests[0].status,'declined_held');
  assert.equal((await decline(declineId)).requests[0].status,'declined_held');
  await assert.rejects(decline(declineId,'changed'),/request_conflict/);await assert.rejects(decline(),/already_reviewed/);
  assert.equal((await one('select public.list_merch_tracking_correction_queue()')).requests[0].status,'declined_held');
  const declined=await state(order);for(const reason of held.returnHoldReasons)assert.ok(declined.returnHoldReasons.includes(reason));
  assert.equal(declined.verifiedDeliveryAt,before.verifiedDeliveryAt);assert.equal(declined.returnWindowEndsAt,before.returnWindowEndsAt);
  await claim(creator);await request(order,randomUUID(),'NEW654321');await request(second,randomUUID(),'NEW987654');
  await claim(staff);const page=await one('select public.list_merch_tracking_correction_queue(null,1)');assert.equal(page.requests.length,1);assert.ok(page.nextCursor);
  const next=await one('select public.list_merch_tracking_correction_queue($1,100)',[page.nextCursor]);assert.equal(next.requests.length,2);assert.equal(next.nextCursor,null);
  await assert.rejects(one('select public.list_merch_tracking_correction_queue($1,1)',[randomUUID()]),/unavailable/);
  // Approved rule: only a separate scoped staff reviewer, before EVER verified
  // delivery and without either immutable destination conflict, can supersede.
  const pendingFirst=next.requests.find(r=>r.orderId===order),pendingSecond=next.requests.find(r=>r.orderId===second);
  const approve=(r,req=randomUUID(),note='Reviewed pre-delivery typo')=>one('select public.approve_merch_tracking_correction($1,$2,$3)',[r.id,req,note]);
  await assert.rejects(approve(pendingFirst),/manual_review_required/);
  await root();await db.query(`insert into private.merch_return_evidence(order_id,delivered_at,evidence_reference,delivery_state,return_state,dispute_state)
   select order_id,delivered_at,'Synthetic revocation','revoked',return_state,dispute_state from private.merch_return_evidence where order_id=$1 order by id desc limit 1`,[order]);
  await claim(staff);await assert.rejects(approve(pendingFirst),/manual_review_required/,'revocation cannot reopen pre-delivery authority');
  const conflictOrder=await make('CONFLICT123');await request(conflictOrder,randomUUID(),'CHANGE1234');
  await root();await db.query("insert into private.merch_fulfillment_address_conflicts(order_id,event_id) values($1,'synthetic-other-street')",[conflictOrder]);
  await claim(staff);const conflict=(await one('select public.read_merch_tracking_corrections($1)',[conflictOrder])).requests[0];
  await assert.rejects(approve(conflict),/manual_review_required/);
  await claim(creator);await assert.rejects(approve(pendingSecond),/unavailable/);
  await claim(moderator);await assert.rejects(approve(pendingSecond),/unavailable/);
  await claim(staff,sessions[creator]);await assert.rejects(approve(pendingSecond),/unavailable/);
  await root();const old=await one('select private.merch_active_tracking_assignment($1)',[second]);
  await db.exec("insert into private.merch_tracking_qualification values(true,true,'Synthetic qualification',clock_timestamp()+interval '1 day')");
  await db.query("insert into private.merch_tracking_accounts values($1,'synthetic-managed',true,'Synthetic mapping',clock_timestamp()+interval '1 day')",[creator]);
  await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false);set role service_role`);
  const jobs=await one('select public.claim_merch_tracking_jobs(20)'),oldLease=jobs.find(j=>j.id===old).lease;
  await assert.rejects(approve(pendingSecond),/permission denied/);
  await root();await db.query("update private.merch_tracking_jobs set registration_state='unknown' where assignment_id=$1",[old]);
  await claim(staff);const approvalId=randomUUID();const approved=await approve(pendingSecond,approvalId);
  assert.equal(approved.requests[0].status,'approved');assert.equal(approved.requests[0].replacementApplied,true);
  assert.deepEqual(await approve(pendingSecond,approvalId),approved);
  await assert.rejects(approve(pendingSecond,approvalId,'changed'),/request_conflict/);
  await assert.rejects(approve(pendingSecond),/already_reviewed/);
  await assert.rejects(one('select public.decline_merch_tracking_correction($1,$2,$3)',[pendingSecond.id,randomUUID(),'Too late']),/already_reviewed/);
  await root();const active=await one('select private.merch_active_tracking_assignment($1)',[second]);assert.notEqual(active,old);
  assert.equal(await one('select count(*)::int from private.merch_tracking_assignments where order_id=$1',[second]),2);
  assert.equal(await one('select registration_state from private.merch_tracking_jobs where assignment_id=$1',[old]),'unknown','unknown old registration is never reset to pending');
  await assert.rejects(db.query('delete from private.merch_tracking_supersessions where id=$1',[approvalId]),/immutable/);
  const afterApproval=await state(second);assert.ok(afterApproval.returnHoldReasons.includes('merch_tracking_review_required'));
  assert.ok(!afterApproval.returnHoldReasons.includes('merch_tracking_correction_review_required'));
  assert.equal(afterApproval.verifiedDeliveryAt,null);
  await claim(creator);assert.equal((await one('select public.get_merch_tracking($1)',[second])).trackingNumber,'NEW987654');
  assert.equal((await one("select public.assign_merch_tracking($1,'usps','NEW987654')",[second])).trackingNumber,'NEW987654');
  await assert.rejects(one("select public.assign_merch_tracking($1,'usps','OLD654321')",[second]),/immutable/);
  await assert.rejects(request(second,randomUUID(),'OLD654321'),/identity_unavailable/,'superseded identities are never recycled');
  await root();await db.exec(`select set_config('request.jwt.claims','{"role":"service_role"}',false);set role service_role`);
  const stale=await one("select public.complete_merch_tracking_job($1,$2,'{}',true)",[old,oldLease]);assert.equal(stale.superseded,true);
  assert.equal((await one("select public.receive_merch_tracking_hint(repeat('e',64),'usps','OLD654321')")).accepted,false);
  const fresh=await one('select public.claim_merch_tracking_jobs(20)');assert.ok(fresh.some(j=>j.id===active));assert.ok(!fresh.some(j=>j.id===old));
  await root();assert.equal(await one('select count(*)::int from private.merch_return_evidence where order_id=$1',[second]),0,'old callback cannot generate delivery evidence');
  await claim(creator);const further=await request(second,randomUUID(),'FURTHER123');assert.equal(further.requests.at(-1).status,'pending_review');
  await root();assert.equal(await one('select assignment_id from private.merch_tracking_corrections where id=$1',[further.requests.at(-1).id]),active,'subsequent request targets active identity');
  await claim(other);const conflicting=await request(foreign,randomUUID(),'FURTHER123');
  await claim(staff);await approve(conflicting.requests[0]);
  await assert.rejects(approve(further.requests.at(-1)),/identity_unavailable/,'approval rechecks global uniqueness after request time');
  assert.ok((await state(second)).returnHoldReasons.includes('merch_tracking_correction_review_required'));
  await root();await db.query(`insert into public.platform_role_memberships(role,user_id,email,status,notes,granted_by) values('moderator',$1,$2,'active','Synthetic self-review negative','test')`,[creator,creator+'@example.test']);
  for(const key of ['admin.support.manage','admin.refund_status.record'])await db.query(`insert into public.platform_staff_permission_grants(target_user_id,target_email,permission_key,status,reason) values($1,$2,$3,'active','Synthetic self-review negative')`,[creator,creator+'@example.test',key]);
  await claim(creator);await assert.rejects(approve(further.requests.at(-1)),/unavailable/,'staff cannot approve their own sale');
  await claim(staff);await one('select public.decline_merch_tracking_correction($1,$2,$3)',[further.requests.at(-1).id,randomUUID(),'Identity assigned elsewhere; submit the correct number']);
  await claim(creator);const chain=await request(second,randomUUID(),'CHAINFINAL123');
  await claim(staff);await approve(chain.requests.at(-1));
  const chainRead=await one('select public.read_merch_tracking_corrections($1)',[second]);
  assert.equal(chainRead.requests.find(r=>r.id===further.requests.at(-1).id).status,'superseded','later approved proposal resolves old declined identity report');
  await root();const final=await one('select private.merch_active_tracking_assignment($1)',[second]);assert.notEqual(final,active);assert.notEqual(final,old);
  assert.equal(await one('select count(*)::int from private.merch_tracking_assignments where order_id=$1',[second]),3,'A to B to C keeps all three immutable rows');
  assert.equal(await one('select count(*)::int from private.merch_tracking_supersessions where order_id=$1',[second]),2);
  const chainedState=await state(second);assert.ok(!chainedState.returnHoldReasons.includes('merch_tracking_correction_review_required'));assert.ok(chainedState.returnHoldReasons.includes('merch_tracking_review_required'));
  await claim(creator);assert.equal((await one('select public.get_merch_tracking($1)',[second])).trackingNumber,'CHAINFINAL123');
  await root();await db.query("update public.platform_staff_permission_grants set status='revoked' where target_user_id=$1 and permission_key='admin.refund_status.record'",[staff]);
  await claim(staff);await assert.rejects(one('select public.list_merch_tracking_correction_queue()'),/unavailable/);
 } finally {await db.close();}
});
