import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';

// Narrow execution test of the actual accounting migration. Provider receipt
// admission and complete schema replay are separate integration tests.
test('Stripe video receipts use one nonpayable ledger with cumulative refund deltas', {timeout:120000}, async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create schema private; create role anon; create role authenticated; create role service_role;
   create function private.guard_event_ticket_terms_immutable() returns trigger language plpgsql as $$begin raise exception 'immutable'; end;$$;
   create table private.stripe_paid_video_orders(id uuid primary key,buyer_id uuid,creator_id uuid,video_id uuid,
    environment text,currency text,stripe_account_id text,amount_minor integer,
    checkout_session_id text default 'cs_test_one',payment_intent_id text default 'pi_one',charge_id text default 'ch_one');
   create table private.stripe_paid_video_observations(id uuid primary key,order_id uuid,kind text,
    stripe_account_id text,currency text,amount_minor integer,refund_amount_minor integer,
    checkout_session_id text default 'cs_test_one',payment_intent_id text default 'pi_one',charge_id text default 'ch_one');
   create table public.provider_events(id uuid primary key default gen_random_uuid(),provider text,provider_event_id text,
    user_id uuid,environment text,event_type text,status text,idempotency_key text unique,metadata jsonb);
   create table public.money_access_ledger_events(id uuid primary key default gen_random_uuid(),user_id uuid,creator_id uuid,
    provider_event_id uuid,event_type text,amount_minor integer,currency text,environment text,payable_state text,status text,
    source_type text,source_id uuid,metadata jsonb);`);
  await db.exec(readFileSync('supabase/migrations/20261112183000_stripe_paid_video_sandbox_held_receipts.sql','utf8'));
  const order=randomUUID(),buyer=randomUUID(),creator=randomUUID(),video=randomUUID();
  await db.query(`insert into private.stripe_paid_video_orders values($1,$2,$3,$4,'sandbox','usd','acct_test',1000)`,[order,buyer,creator,video]);
  const observe=async(kind,amount=0)=>{const id=randomUUID();await db.query(`insert into private.stripe_paid_video_observations values($1,$2,$3,'acct_test','usd',1000,$4)`,[id,order,kind,amount]);return id;};
  const record=async(id)=>(await db.query('select private.record_stripe_paid_video_held_earning($1,$2) id',[order,id])).rows[0].id;
  const paid=await observe('paid'),first=await record(paid);
  assert.equal(await record(paid),first);
  const ledger=async()=>(await db.query('select * from public.money_access_ledger_events')).rows;
  assert.equal((await ledger()).length,1);
  assert.equal((await ledger())[0].payable_state,'not_payable');
  assert.equal((await ledger())[0].metadata.creator_earnings_known,false);
  assert.equal((await ledger())[0].metadata.platform_basis_points,2000);
  assert.equal((await ledger())[0].amount_minor,1000);
  await assert.rejects(record(await observe('paid')),/duplicate_paid_receipt/);
  await record(await observe('refund',250));await record(await observe('refund',400));
  assert.deepEqual((await ledger()).map(row=>row.amount_minor),[1000,250,150]);
  await assert.rejects(record(await observe('refund',300)),/refund_amount_invalid/);
  await assert.rejects(record(await observe('refund',1001)),/refund_amount_invalid/);
  await db.query("update private.stripe_paid_video_orders set environment='production' where id=$1",[order]);
  await assert.rejects(record(paid),/held_identity_invalid/);
  await assert.rejects(db.exec('delete from private.stripe_paid_video_held_receipts'),/immutable/);
  for(const role of ['anon','authenticated','service_role']){
   await db.exec(`set role ${role}`);
   await assert.rejects(record(paid),/permission denied/);
   await db.exec('reset role');
  }
 }finally {await db.close();}
});
