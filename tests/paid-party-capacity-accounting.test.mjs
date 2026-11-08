import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {databaseFactory} from './helpers/native-deployment-database.mjs';
const sql=fs.readFileSync(new URL('../supabase/migrations/20261108095500_paid_party_ticket_capacity_accounting.sql',import.meta.url),'utf8');
const fixture=fs.readFileSync(new URL('./fixtures/paid-party-capacity-component.sql',import.meta.url),'utf8');
const offer='00000000-0000-4000-8000-000000000001',buyer='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003',event='00000000-0000-4000-8000-000000000004';
async function setup(){const db=process.env.NATIVE_DEPLOYMENT_PG_BIN?await databaseFactory():new PGlite();await db.exec("set time zone 'UTC';"+fixture+sql+`
 create trigger insert_guard before insert on public.paid_watch_party_tickets for each row execute function public.prevent_paid_watch_party_ticket_oversell();
 create trigger sync_grant after insert or update on public.access_grants for each row execute function public.sync_paid_watch_party_ticket_from_access_grant();
 insert into public.paid_watch_party_offers(id,party_id,seat_limit,status,price_cents,currency)values('${offer}','TEST',1,'active',99,'usd');
 insert into public.provider_events(id,provider_event_id,metadata)values('${event}','synthetic','{}');`);return db;}
const grant=`insert into public.access_grants(id,user_id,grant_type,source_id,provider_event_id,status,starts_at,environment) values(gen_random_uuid(),'${buyer}','watch_party_live_ticket','${offer}','${event}','sandbox_only',now()-interval '1 minute','sandbox')`;
const state=async db=>(await db.query(`select (select count(*)::int from public.paid_watch_party_tickets) tickets,(select count(*)::int from public.access_grants) grants,(select count(*)::int from public.creator_room_ticket_transactions) transactions,(select count(*)::int from public.room_ticket_events where event_type='ticket_verified') verified`)).rows[0];
test('full capacity refuses atomically, with repeatable refusal and no false verified grant',async()=>{const db=await setup();try{
 await db.exec(`insert into public.paid_watch_party_tickets(id,offer_id,buyer_id,status)values(gen_random_uuid(),'${offer}','${other}','active')`);
 const before=await state(db);for(let i=0;i<2;i++){await assert.rejects(db.exec(grant),/room_admission_sold_out/);assert.deepEqual(await state(db),before);}
}finally{await db.close();}});
if(process.env.NATIVE_DEPLOYMENT_PG_BIN)test('native competing buyers wait on capacity lock, then loser rolls back without authority',async()=>{
 const db=await setup();try{
  const secondEvent='00000000-0000-4000-8000-000000000005';
  await db.exec(`insert into public.provider_events(id,provider_event_id,metadata)values('${secondEvent}','synthetic-second','{}')`);
  await db.withConnection(async holder=>{
   await holder.query("set time zone 'UTC';begin");await holder.query(grant);
   const secondGrant=grant.replaceAll(buyer,other).replaceAll(event,secondEvent);
   const pending=db.exec('begin;'+secondGrant+';commit').then(()=>null,error=>error);
   try{
    let blocked=false;for(let i=0;i<100;i++){
     await holder.query('select pg_stat_clear_snapshot()');
     blocked=(await holder.query('select pg_backend_pid()=any(pg_blocking_pids($1)) blocked',[db.backendPid])).rows[0].blocked;
     if(blocked)break;await new Promise(r=>setTimeout(r,10));
    }
    assert.equal(blocked,true,'second buyer really waits for first transaction');
    await holder.query('commit');assert.match((await pending)?.message??'',/room_admission_sold_out/);
   }finally{await holder.query('rollback');await pending;await db.exec('rollback');}
  });
  assert.deepEqual(await state(db),{tickets:1,grants:1,transactions:1,verified:1});
 }finally{await db.close();}
});
test('same valid buyer refresh succeeds at capacity without duplicating ticket or transaction',async()=>{const db=await setup();try{
 await db.exec(grant);await db.exec(`update public.access_grants set expires_at=now()+interval '1 hour'`);
 assert.deepEqual(await state(db),{tickets:1,grants:1,transactions:1,verified:2});
 assert.equal((await db.query('select count(*)::int n from public.room_ticket_events where ticket_id is null')).rows[0].n,0);
}finally{await db.close();}});
test('suppressed insertion cannot manufacture success even when inline capacity check passed',async()=>{const db=await setup();try{
 await db.exec(`create function public.test_suppress_ticket() returns trigger language plpgsql as $$begin return null;end$$;create trigger aa_suppress before insert on public.paid_watch_party_tickets for each row execute function public.test_suppress_ticket();`);
 await assert.rejects(db.exec(grant),/room_admission_sold_out/);assert.deepEqual(await state(db),{tickets:0,grants:0,transactions:0,verified:0});
}finally{await db.close();}});
for(const invalid of ['expired','revoked'])test(`${invalid} same-buyer ticket does not bypass a full cap`,async()=>{const db=await setup();try{
 await db.exec(`insert into public.paid_watch_party_tickets(id,offer_id,buyer_id,status,expires_at,revoked_at)values(gen_random_uuid(),'${offer}','${buyer}','active',${invalid==='expired'?"now()-interval '1 hour'":'null'},${invalid==='revoked'?'now()':'null'});insert into public.paid_watch_party_tickets(id,offer_id,buyer_id,status)values(gen_random_uuid(),'${offer}','${other}','active')`);
 const before=await state(db);await assert.rejects(db.exec(grant),/room_admission_sold_out/);assert.deepEqual(await state(db),before);
}finally{await db.close();}});
test('refused attempt can retry after capacity frees without stale grant or accounting residue',async()=>{const db=await setup();try{
 await db.exec(`insert into public.paid_watch_party_tickets(id,offer_id,buyer_id,status)values(gen_random_uuid(),'${offer}','${other}','active')`);
 await assert.rejects(db.exec(grant),/room_admission_sold_out/);
 await db.exec(`update public.paid_watch_party_tickets set status='expired' where buyer_id='${other}'`);
 await db.exec(grant);await db.exec(`update public.access_grants set expires_at=now()+interval '1 hour'`);
 assert.deepEqual(await state(db),{tickets:2,grants:1,transactions:1,verified:2});
 assert.equal((await db.query("select count(*)::int n from public.paid_watch_party_tickets where status='active'")).rows[0].n,1);
}finally{await db.close();}});
