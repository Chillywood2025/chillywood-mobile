import assert from 'node:assert/strict';
import test from 'node:test';
import {createControlledPaidDatabase} from './helpers/database-runtime-paid-fixture.mjs';

// Reconstructed test adapter, with deliberately controlled prerequisite doubles.
// An unexpected SQL exception fails a case; it is never counted as denial proof.
test('controlled paid authority preserves strong deployed guards and exact proofs',{timeout:120_000},async t=>{
const {db,definition,install,evaluate,candidateHash,variants}=await createControlledPaidDatabase();
const results=[];
try {
assert.deepEqual(variants.map(([name])=>name),['captured_actual','canonical_replacement','candidate']);
for(const [variant,definitions] of variants){
  await install(variant,definitions);
  for(const scenario of ['valid','quarantined','terminal','ambiguous_binding','buyer_legal_invalid','creator_authority_invalid']){
    await db.query(`select set_config('fixture.quarantine',$1,false),set_config('fixture.creator_authority',$2,false),set_config('fixture.session_legal',$3,false)`,[String(scenario==='quarantined'),String(scenario!=='creator_authority_invalid'),String(scenario!=='buyer_legal_invalid')]);
    await db.query(`update public.revenuecat_consumable_transaction_intents set terminal=$1,binding_state=$2`,[scenario==='terminal',scenario==='ambiguous_binding'?'ambiguous_legacy':'exact']);
    const row=(await db.query(`select public.watch_party_room_self_access_allowed_internal('PAIDTITLE','20000000-0000-4000-8000-000000000000') room_access,public.resolve_watch_party_livekit_viewer_authority('PAIDTITLE','20000000-0000-4000-8000-000000000000','20000000-0000-4000-8000-000000000001') current_session,public.resolve_watch_party_livekit_viewer_authority('PAIDTITLE','20000000-0000-4000-8000-000000000000',null) service_target`)).rows[0];
    const host=(scenario==='valid'||scenario==='quarantined'||scenario==='creator_authority_invalid')
      ? (await db.query(`select public.resolve_watch_party_livekit_viewer_authority('PAIDTITLE','10000000-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000001') host_current_session`)).rows[0] : {};
    results.push({variant,scenario,...row,...host});
  }
}
assert.deepEqual(results.map(x=>`${x.variant}:${x.scenario}`).sort(),
 ['captured_actual','canonical_replacement','candidate'].flatMap(variant=>
  ['valid','quarantined','terminal','ambiguous_binding','buyer_legal_invalid','creator_authority_invalid'].map(scenario=>`${variant}:${scenario}`)).sort(),
 'every current, canonical and repaired guard scenario must execute exactly once');
assert(results.filter(x=>x.scenario==='valid').every(x=>x.current_session.allowed));
assert(results.filter(x=>x.variant==='canonical_replacement').every(x=>x.current_session.allowed));
assert(results.filter(x=>x.variant==='captured_actual'&&x.scenario!=='valid').every(x=>!x.current_session.allowed));
assert(results.find(x=>x.variant==='captured_actual'&&x.scenario==='quarantined').host_current_session.allowed===false);
assert(results.find(x=>x.variant==='canonical_replacement'&&x.scenario==='quarantined').host_current_session.allowed===true);
assert(results.filter(x=>x.variant==='candidate'&&x.scenario!=='valid').every(x=>!x.current_session.allowed));
assert(results.filter(x=>x.variant==='candidate'&& !['valid','buyer_legal_invalid'].includes(x.scenario)).every(x=>!x.room_access&&!x.service_target.allowed));
await db.exec(`
create table public.paid_live_watch_party_offers(id uuid,party_id text,pass_type text,status text,starts_at timestamptz,ends_at timestamptz);
create table public.paid_live_watch_party_passes(id uuid,offer_id uuid,party_id text,buyer_id uuid,pass_type text,status text,created_at timestamptz,provider_event_id uuid,access_grant_id uuid);
insert into public.paid_live_watch_party_offers values('90000000-0000-4000-8000-000000000000','PAIDTITLE','live_watch_party_access_pass','active',now()-interval '1 hour',now()+interval '1 hour');
update public.watch_party_rooms set room_type='live';
update public.revenuecat_consumable_transaction_intents set terminal=false,binding_state='exact';
select set_config('fixture.quarantine','false',false),set_config('fixture.creator_authority','true',false),set_config('fixture.session_legal','true',false);
`);
await db.exec(definition('20260901010000_watch_party_live_money_rfgc_closure.sql','resolve_live_watch_party_money_access_as_service_internal'));
await db.exec(definition('20260901010000_watch_party_live_money_rfgc_closure.sql','resolve_live_watch_party_livekit_authority_internal'));
const normalization=[];
for(const [variant,definitions] of variants){
  await install(variant,definitions);
  for(const party of ['PAIDTITLE','paidtitle',' PAIDTITLE ']){
    const row=(await db.query(`select public.resolve_watch_party_livekit_viewer_authority($1,'20000000-0000-4000-8000-000000000000','20000000-0000-4000-8000-000000000001') current_session,public.resolve_watch_party_livekit_viewer_authority($1,'20000000-0000-4000-8000-000000000000',null) service_target`,[party])).rows[0];
    normalization.push({variant,party,...row});
  }
}
assert.deepEqual(normalization.map(x=>`${x.variant}:${x.party}`).sort(),
 ['captured_actual','canonical_replacement','candidate'].flatMap(variant=>['PAIDTITLE','paidtitle',' PAIDTITLE '].map(party=>`${variant}:${party}`)).sort(),
 'all historical and repaired normalization branches must execute');
assert(normalization.filter(x=>x.party==='PAIDTITLE').every(x=>!x.current_session.allowed&&!x.service_target.allowed));
assert(normalization.filter(x=>x.variant==='captured_actual'&&x.party!=='PAIDTITLE').every(x=>!x.current_session.allowed));
assert(normalization.filter(x=>x.variant==='canonical_replacement'&&x.party!=='PAIDTITLE').every(x=>x.current_session.allowed));
assert(normalization.filter(x=>x.variant==='candidate').every(x=>!x.current_session.allowed&&!x.service_target.allowed));
await db.exec(`update public.watch_party_rooms set room_type='title';
create or replace function public.is_account_access_restricted(text) returns boolean language sql stable as $$select $1=coalesce(current_setting('fixture.restricted_user',true),'')$$;`);
const checks=[];
const mutations=[
 ['quarantine',`select set_config('fixture.quarantine','true',true)`],
 ['creator_authority',`select set_config('fixture.creator_authority','false',true)`],
 ['link_terminal',`update public.revenuecat_consumable_transaction_intents set terminal=true`],
 ['link_ambiguous',`update public.revenuecat_consumable_transaction_intents set binding_state='ambiguous_legacy'`],
 ['event_product',`update public.provider_events set product_id='ffffffff-0000-4000-8000-000000000000'`],
 ['event_environment',`update public.provider_events set environment='production'`],
 ['event_user',`update public.provider_events set user_id='ffffffff-0000-4000-8000-000000000000'`],
 ['event_intent',`update public.provider_events set metadata=jsonb_set(metadata,'{purchase_intent_id}','"ffffffff-0000-4000-8000-000000000000"')`],
 ['intent_product',`update public.money_purchase_intents set product_id='ffffffff-0000-4000-8000-000000000000'`],
 ['intent_product_key',`update public.money_purchase_intents set product_key='wrong'`],
 ['intent_product_type',`update public.money_purchase_intents set product_type='wrong'`],
 ['intent_source_type',`update public.money_purchase_intents set source_type='wrong'`],
 ['intent_source_id',`update public.money_purchase_intents set source_id='ffffffff-0000-4000-8000-000000000000'`],
 ['intent_environment',`update public.money_purchase_intents set environment='production'`],
 ['intent_amount',`update public.money_purchase_intents set amount_minor=1`],
 ['intent_currency',`update public.money_purchase_intents set currency='eur'`],
 ['intent_consumed_at',`update public.money_purchase_intents set consumed_at=null`],
 ['intent_revoked',`update public.money_purchase_intents set revoked_at=now()`],
 ['intent_sku',`update public.money_purchase_intents set provider_product_id='wrong'`],
 ['intent_creator',`update public.money_purchase_intents set creator_id='ffffffff-0000-4000-8000-000000000000'`],
 ['link_user',`update public.revenuecat_consumable_transaction_intents set user_id='ffffffff-0000-4000-8000-000000000000'`],
 ['link_product',`update public.revenuecat_consumable_transaction_intents set product_id='ffffffff-0000-4000-8000-000000000000'`],
 ['link_event',`update public.revenuecat_consumable_transaction_intents set provider_event_id='ffffffff-0000-4000-8000-000000000000'`],
 ['link_original',`update public.revenuecat_consumable_transaction_intents set original_transaction_id='wrong'`],
 ['link_missing',`delete from public.revenuecat_consumable_transaction_intents`],
 ['ticket_creator',`update public.paid_watch_party_tickets set creator_id='ffffffff-0000-4000-8000-000000000000'`],
 ['ticket_host',`update public.paid_watch_party_tickets set host_id='ffffffff-0000-4000-8000-000000000000'`],
 ['ticket_provider',`update public.paid_watch_party_tickets set provider='wrong'`],
 ['ticket_event',`update public.paid_watch_party_tickets set provider_transaction_id='wrong'`],
 ['ticket_publish',`update public.paid_watch_party_tickets set metadata=metadata||'{"grants_livekit_publish":true}'::jsonb`],
 ['ticket_host_authority',`update public.paid_watch_party_tickets set metadata=metadata||'{"grants_host_authority":true}'::jsonb`],
 ['ticket_refunded',`update public.paid_watch_party_tickets set refunded_at=now()`],
 ['ticket_revoked',`update public.paid_watch_party_tickets set revoked_at=now()`],
 ['grant_refunded',`update public.access_grants set refunded_at=now()`],
 ['ticket_expired',`update public.paid_watch_party_tickets set expires_at=now()-interval '1 second'`],
 ['grant_expired',`update public.access_grants set expires_at=now()-interval '1 second'`],
 ['grant_privilege',`update public.access_grants set metadata=metadata||'{"speaker_authority":true}'::jsonb`],
 ['offer_host',`update public.paid_watch_party_offers set host_id='ffffffff-0000-4000-8000-000000000000'`],
 ['offer_paused',`update public.paid_watch_party_offers set status='paused'`],
 ['offer_expired',`update public.paid_watch_party_offers set ends_at=now()-interval '1 second'`],
 ['target_deleted',`update auth.users set deleted_at=now() where id='20000000-0000-4000-8000-000000000000'`],
 ['target_missing',`delete from auth.users where id='20000000-0000-4000-8000-000000000000'`],
 ['host_deleted',`update auth.users set deleted_at=now() where id='10000000-0000-4000-8000-000000000000'`],
 ['host_missing',`delete from auth.users where id='10000000-0000-4000-8000-000000000000'`],
 ['target_restricted',`select set_config('fixture.restricted_user','20000000-0000-4000-8000-000000000000',true)`],
 ['host_restricted',`select set_config('fixture.restricted_user','10000000-0000-4000-8000-000000000000',true)`],
 ['blank_original_transaction',`update public.provider_events set metadata=jsonb_set(metadata,'{original_transaction_id}','""'); update public.access_grants set metadata=jsonb_set(metadata,'{original_transaction_id}','""'); update public.revenuecat_consumable_transaction_intents set original_transaction_id=''`],
 ['whitespace_original_transaction',`update public.provider_events set metadata=jsonb_set(metadata,'{original_transaction_id}','"   "'); update public.access_grants set metadata=jsonb_set(metadata,'{original_transaction_id}','"   "'); update public.revenuecat_consumable_transaction_intents set original_transaction_id='   '`],
];
for(const provider of ['revenuecat_app_store','revenuecat_google_play']){
 for(const table of ['provider_events','money_purchase_intents','access_grants','paid_watch_party_tickets','revenuecat_consumable_transaction_intents']) await db.query(`update public.${table} set provider=$1`,[provider]);
 const positive=await evaluate(); assert(positive.room_access&&positive.current_session.allowed&&positive.service_target.allowed);
 for(const [name,sql] of mutations)await t.test(`${provider}: ${name}`,async()=>{
   await db.exec('begin');
   try { await db.exec(sql); const outcome=await evaluate(); assert.equal(outcome.room_access,false);assert.equal(outcome.current_session.allowed,false);assert.equal(outcome.service_target.allowed,false);checks.push({provider,name,...outcome}); }
   finally {await db.exec('rollback');}
 });
}
await db.exec(`begin; update public.access_grants set expires_at=now()+interval '10 seconds'; update public.paid_watch_party_tickets set expires_at=now()+interval '20 seconds'; update public.paid_watch_party_offers set ends_at=now()+interval '25 seconds'; update auth.sessions set not_after=now()+interval '5 seconds';`);
const ttl=(await db.query(`select extract(epoch from ((public.resolve_watch_party_livekit_viewer_authority('PAIDTITLE','20000000-0000-4000-8000-000000000000','20000000-0000-4000-8000-000000000001')->>'expiresAt')::timestamptz-now())) viewer_seconds,extract(epoch from ((public.resolve_watch_party_livekit_viewer_authority('PAIDTITLE','10000000-0000-4000-8000-000000000000','10000000-0000-4000-8000-000000000001')->>'expiresAt')::timestamptz-now())) host_seconds`)).rows[0];
assert.equal(Number(ttl.viewer_seconds),5);assert.equal(Number(ttl.host_seconds),5);
await db.exec('rollback');
assert.equal(checks.length,96);
t.diagnostic(`96 controlled adverse cases; exact current function bodies; migration SHA256 ${candidateHash}`);
}finally{await db.close();}
});
