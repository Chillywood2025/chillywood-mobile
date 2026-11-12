import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createDatabase} from '../helpers/database-runtime-authority-fixture.mjs';

// Actual legacy tables/triggers plus the real draft recorder. Ownership/scope
// bridges here are synthetic so this is NOT native qualification/cutover proof.
test('Apple handover recorder preserves durable ignored identity and pending recovery', {timeout:240000}, async()=>{
 const {db}=await createDatabase({includeHeldStudio:true});
 try {
  await db.exec(`create table private.native_apple_sandbox_owners(id uuid primary key,product_id text);
   create function private.native_apple_owner_immutable() returns trigger language plpgsql as $$begin raise exception 'immutable';end $$;
   create function private.native_apple_owner_lock() returns void language sql as $$select$$;
   create function private.native_apple_owner_scope(jsonb,text,boolean) returns private.native_apple_sandbox_owners
    language sql as $$select * from private.native_apple_sandbox_owners where product_id=$2$$;
   insert into private.native_apple_sandbox_owners values('00000000-0000-4000-8000-000000000002','com.chillywood.paidvideo.tier1');`);
  await db.exec(fs.readFileSync(new URL('../../isolated-runtime/native-store-apple-ownership-v1/recorder.sql',import.meta.url),'utf8'));
  await db.query("select set_config('request.jwt.claim.role','service_role',false)");
  const hash='a'.repeat(64),scope={rawSha256:hash};
  const event={eventId:'initial',eventType:'NON_RENEWING_PURCHASE',userId:'00000000-0000-4000-8000-000000000001',
   productId:'com.chillywood.paidvideo.tier1',originalTransactionId:'original',occurredAt:new Date().toISOString()};
  const reserve=e=>db.query('insert into public.revenuecat_webhook_ingress_events(provider_event_id,raw_payload_hash) values($1,$2)',[e.eventId,hash]);
  const call=async(e,s=scope)=>(await db.query('select public.native_apple_sandbox_handover_v1($1,$2) result',[s,e])).rows[0].result;
  await reserve(event);const first=await call(event);
  assert.equal(first.status,'excluded');assert.equal(first.financialAuthority,false);assert.equal(first.obligationResolved,false);
  assert.equal(Object.keys(first).length,6);assert.deepEqual(await call(event),first);
  assert.equal((await db.query('select count(*)::int n from private.native_apple_handover_receipts')).rows[0].n,1);
  assert.equal((await db.query('select state from public.revenuecat_provider_reconciliation_obligations where provider_event_id=$1',[first.providerEventId])).rows[0].state,'pending_reconciliation');
  await assert.rejects(call({...event,userId:'00000000-0000-4000-8000-000000000003'}),/identity_conflict|replay_conflict/);
  await assert.rejects(call(event,{rawSha256:'b'.repeat(64)}),/ingress_unbound/);
  await assert.rejects(call({...event,eventId:'unreserved'}),/ingress_unbound/);
  for(const patch of [{provider_product_id:'wrong'},{original_transaction_id:'wrong'},
   {purchase_intent_id:'00000000-0000-4000-8000-000000000004'},
   {access_grant_id:'00000000-0000-4000-8000-000000000004'},
   {ledger_event_id:'00000000-0000-4000-8000-000000000004'}]){
   await db.exec('begin');
   try {
    await db.query('update public.provider_events set metadata=metadata||$1::jsonb where id=$2',[patch,first.providerEventId]);
    await assert.rejects(call(event),/no_effect_proof_failed/);
   } finally {await db.exec('rollback');}
  }
  await db.exec('begin');
  try {
   await db.query("update public.provider_events set occurred_at=occurred_at-interval '1 second' where id=$1",[first.providerEventId]);
   await assert.rejects(call(event),/no_effect_proof_failed/);
  } finally {await db.exec('rollback');}
  const terminal={...event,eventId:'terminal',eventType:'CANCELLATION'};await reserve(terminal);
  assert.equal((await call(terminal)).status,'excluded');
  const terminalFirst={...terminal,eventId:'terminal-first',originalTransactionId:'terminal-original'};await reserve(terminalFirst);
  assert.equal((await call(terminalFirst)).status,'excluded');
  const lateInitial={...terminalFirst,eventId:'late-initial',eventType:'NON_RENEWING_PURCHASE'};await reserve(lateInitial);
  assert.equal((await call(lateInitial)).status,'excluded','evidence only; native allocator decides tombstoned access');
  await assert.rejects(db.query("update public.provider_events set status='processed' where id=$1",[first.providerEventId]),/native_apple_legacy_positive_owned/);
  await assert.rejects(db.query('delete from private.native_apple_handover_receipts where provider_event_id=$1',[first.providerEventId]),/immutable/);
  assert.equal((await db.query('select count(*)::int n from public.access_grants where provider_event_id=$1',[first.providerEventId])).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from public.money_access_ledger_events where provider_event_id=$1',[first.providerEventId])).rows[0].n,0);
  await db.query("select set_config('request.jwt.claim.role','authenticated',false)");
  await assert.rejects(call(event),/service_role_required/);
 } finally {await db.close();}
});
