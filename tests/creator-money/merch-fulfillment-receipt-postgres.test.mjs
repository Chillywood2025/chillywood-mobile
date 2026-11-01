import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

test('creator fulfillment records exact session and revision without a public receipt bypass',{timeout:240000},async()=>{
 const {db}=await createDatabase({includeHeldStudio:true,applyRepair:true,repairInMigrationOrder:true,implicitApiGrants:false});
 const one=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
 try {
  await db.exec(fs.readFileSync('tests/fixtures/event-reservation-authority.sql','utf8'));
  const actors=(await db.query('select * from event_reservation_fixture.actors')).rows;
  const creator=actors.find(a=>a.kind==='creator'),buyer=actors.find(a=>a.kind==='buyer1'),order=randomUUID();
  await db.query(`insert into public.merch_orders(id,buyer_id,creator_id,provider,environment,order_status,fulfillment_status,payment_status,amount_subtotal_minor,amount_total_minor,currency)
   values($1,$2,$3,'stripe_physical_goods','sandbox','paid','not_started','paid',1000,1000,'usd')`,[order,buyer.user_id,creator.user_id]);
  const login=async(a,sid=a.session_id)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claims',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[JSON.stringify({role:'authenticated',sub:a.user_id,session_id:sid})]);await db.exec('set role authenticated');};
  const update=(next,prior)=>one('select public.update_creator_merch_fulfillment($1,$2,$3)',[order,next,prior]);
  await login(buyer);await assert.rejects(update('processing','not_started'),/merch_order_not_found/);
  await login(creator,randomUUID());await assert.rejects(update('processing','not_started'),/merch_current_session_required/);
  await login(creator);await update('processing','not_started');await update('shipped','processing');
  await assert.rejects(update('shipped','processing'),/merch_order_changed_reload/);
  await assert.rejects(one('select public.update_creator_merch_fulfillment_before_release_receipt($1,$2,$3)',[order,'delivered','shipped']),/permission denied/);
  await assert.rejects(db.query('select * from private.merch_fulfillment_receipts'),/permission denied/);
  await db.exec('reset role');
  const rows=(await db.query('select * from private.merch_fulfillment_receipts where order_id=$1 order by fulfillment_revision',[order])).rows;
  assert.equal(rows.length,2);assert.deepEqual(rows.map(x=>x.status),['processing','shipped']);
  assert.deepEqual(rows.map(x=>Number(x.fulfillment_revision)),[1,2]);
  assert.ok(rows.every(x=>x.creator_id===creator.user_id&&x.actor_session_id===creator.session_id));
  await assert.rejects(db.query('update public.merch_orders set fulfillment_revision=99 where id=$1',[order]),/revision_immutable/);
  await assert.rejects(db.query('delete from private.merch_fulfillment_receipts where order_id=$1',[order]),/immutable/);
 }finally{await db.close();}
});
