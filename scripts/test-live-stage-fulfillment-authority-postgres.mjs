#!/usr/bin/env node
// Runs the actual baseline and repaired Live Stage projector and session
// binding trigger in disposable PostgreSQL, including a baseline failure control.
// Schemas/provider/rollout state are synthetic; full-schema RLS and concurrent
// session invalidation still need independent qualification.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const source = fs.readFileSync('supabase/migrations/20260901010000_watch_party_live_money_rfgc_closure.sql', 'utf8');
const integrity = fs.readFileSync('supabase/migrations/20260824034109_creator_money_authority_integrity_closeout.sql', 'utf8');
const reconciliation = fs.readFileSync('supabase/migrations/20260827222000_revenuecat_ignored_charge_reconciliation.sql','utf8');
const extract = (text, name) => {
  const start = text.lastIndexOf(`create or replace function public."${name}"(`);
  assert.ok(start >= 0);
  return text.slice(start, text.indexOf('$$;', start) + 3);
};
const db = new PGlite();
const buyer = '11111111-1111-4111-8111-111111111111';
const creator = '22222222-2222-4222-8222-222222222222';
const product = '33333333-3333-4333-8333-333333333333';
const offer = '44444444-4444-4444-8444-444444444444';
const intent = '55555555-5555-4555-8555-555555555555';
const generation = '66666666-6666-4666-8666-666666666666';
const scalar = async (sql, params=[]) => Object.values((await db.query(sql,params)).rows[0])[0];
const project = (eventId, original, eventType='NON_RENEWING_PURCHASE', timestamp='now()') => scalar(`select public.process_revenuecat_live_watch_party_event_atomic(
  'revenuecat_google_play',$1,$2,$3,'live_fixture_sku','sandbox',${timestamp},99,'usd',repeat('a',64),$4)`,[eventId,eventType,buyer,original]);
const state = (name,value) => db.query('select set_config($1,$2,false)',[`fixture.${name}`,value]);
const restoreSession = () => db.exec(`insert into auth.sessions values ('${generation}','${buyer}',null) on conflict do nothing;`);
const resetPurchase = async () => {
  await state('quarantined','false');
  await state('restricted','');
  await restoreSession();
  await db.exec(`truncate public.revenuecat_provider_reconciliation_obligations,public.provider_events,public.access_grants,public.money_access_ledger_events,
    public.paid_live_watch_party_passes,public.revenuecat_consumable_transaction_intents,public.revenuecat_unbound_initial_authority;
    update public.money_purchase_intents set status='pending',consumed_at=null;`);
};
let failed = false;
try {
  await db.exec(`
    set timezone='UTC';
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql as $$select null::uuid$$;
    create function auth.jwt() returns jsonb language sql as $$select '{}'::jsonb$$;
    create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz);
    create table public.user_profiles(user_id text,channel_role text);
    create table public.wave1_legal_document_versions(active boolean,market text,capability text,document_key text,version text);
    create table public.wave1_legal_acceptances(user_id uuid,session_generation text,document_key text,document_version text,market text,capability text,role_key text,invalidated_at timestamptz);
    create function public.wave1_legal_document_configuration_complete_internal(text) returns boolean language sql as $$select true$$;
    create function public.revenuecat_authority_quarantined_internal(text,uuid,text) returns boolean language sql as $$select coalesce(current_setting('fixture.quarantined',true),'true')='true'$$;
    create function public.is_account_access_restricted(text) returns boolean language sql as $$select coalesce(current_setting('fixture.restricted',true),'')=$1$$;
    create function public.revenuecat_premium_authority_rank_internal(text,boolean) returns smallint language sql as $$select 10::smallint$$;
    create function public.assert_live_watch_party_sandbox_rail_internal(text) returns void language plpgsql as $$begin return; end$$;
    create table public.monetization_products(id uuid primary key,product_key text,product_type text,provider text,provider_product_id text,environment text);
    create table public.watch_party_rooms(party_id text primary key,room_type text,host_user_id uuid,is_active boolean);
    create table public.money_purchase_intents(id uuid primary key,user_id uuid,product_id uuid,product_key text,product_type text,provider text,
      provider_product_id text,source_type text,source_id uuid,creator_id uuid,environment text,status text,amount_minor integer,
      currency text,expires_at timestamptz,created_at timestamptz,consumed_at timestamptz,updated_at timestamptz,session_generation text);
    create table public.paid_live_watch_party_offers(id uuid primary key,party_id text,creator_id uuid,host_user_id uuid,pass_type text,
      product_id uuid,provider text,provider_product_id text,environment text,price_cents integer,currency text,status text);
    create table public.provider_events(id uuid primary key default gen_random_uuid(),provider_event_id text,provider text,product_id uuid,
      product_key text,user_id uuid,app_user_id text,environment text,event_type text,status text,occurred_at timestamptz,
      idempotency_key text,raw_payload_hash text,metadata jsonb);
    create table public.revenuecat_consumable_transaction_intents(provider text,original_transaction_id text,user_id uuid,
      product_id uuid,purchase_intent_id uuid,provider_event_id uuid,last_provider_event_id uuid,last_occurred_at timestamptz,
      last_event_type text,last_event_rank smallint,terminal boolean,binding_state text);
    create table public.revenuecat_unbound_initial_authority(provider text,original_transaction_id text,user_id uuid,
      provider_product_id text,environment text,first_provider_event_id uuid,first_ignore_reason text,
      primary key(provider,original_transaction_id));
    create table public.access_grants(id uuid primary key default gen_random_uuid(),user_id uuid,grant_type text,source_type text,source_id uuid,
      product_id uuid,provider text,provider_event_id uuid,environment text,status text,starts_at timestamptz,metadata jsonb,
      expires_at timestamptz,refunded_at timestamptz,revoked_at timestamptz,revoke_reason text,updated_at timestamptz);
    create table public.paid_live_watch_party_passes(id uuid primary key default gen_random_uuid(),offer_id uuid,party_id text,buyer_id uuid,
      creator_id uuid,pass_type text,access_grant_id uuid,provider_event_id uuid,status text,refunded_at timestamptz,revoked_at timestamptz,updated_at timestamptz);
    create table public.watch_party_room_memberships(party_id text,user_id text,role text,stage_role text,can_speak boolean,
      camera_enabled boolean,mic_enabled boolean,membership_state text,left_at timestamptz,updated_at timestamptz);
    create table public.money_access_ledger_events(id uuid primary key default gen_random_uuid(),user_id uuid,creator_id uuid,product_id uuid,
      provider_event_id uuid,event_type text,amount_minor integer,currency text,environment text,payable_state text,status text,
      source_type text,source_id uuid,metadata jsonb,created_at timestamptz default now());
    insert into public.monetization_products values ('${product}','live_fixture','live_watch_party_access_pass','revenuecat_google_play','live_fixture_sku','sandbox');
    insert into public.watch_party_rooms values ('synthetic-live-stage','live','${creator}',true);
    insert into public.paid_live_watch_party_offers values ('${offer}','synthetic-live-stage','${creator}','${creator}',
      'live_watch_party_access_pass','${product}','revenuecat_google_play','live_fixture_sku','sandbox',99,'usd','sandbox');
    insert into public.money_purchase_intents(id,user_id,product_id,product_key,product_type,provider,provider_product_id,source_type,source_id,
      creator_id,environment,status,amount_minor,currency,expires_at,created_at,session_generation)
      values ('${intent}','${buyer}','${product}','live_fixture','live_watch_party_access_pass','revenuecat_google_play','live_fixture_sku',
      'live_watch_party_access','${offer}','${creator}','sandbox','pending',99,'usd',now()+interval '15 minutes',now(),'${generation}');
  `);
  await db.exec(extract(integrity, 'money_purchase_intent_session_authorized_internal'));
  await db.exec(reconciliation.slice(reconciliation.indexOf('create table'),reconciliation.indexOf('alter table')));
  await db.exec(extract(reconciliation,'capture_ignored_revenuecat_charge_internal'));
  await db.exec(`create trigger capture_ignored_revenuecat_charge after insert or update of status,metadata on public.provider_events
    for each row when (new.status='ignored') execute function public.capture_ignored_revenuecat_charge_internal();`);
  await db.exec(extract(integrity, 'bind_money_purchase_intent_session_internal'));
  await db.exec(`create trigger bind_money_purchase_intent_session before insert or update of user_id,session_generation,status
    on public.money_purchase_intents for each row execute function public.bind_money_purchase_intent_session_internal();`);
  await db.exec(extract(source, 'process_revenuecat_live_watch_party_event_atomic'));
  assert.equal((await db.query('select public.money_purchase_intent_session_authorized_internal($1,$2) allowed', [buyer,generation])).rows[0].allowed, false,
    'the actual ordinary money authority helper rejects the missing issuing session');
  assert.equal((await db.query("select public.revenuecat_authority_quarantined_internal('revenuecat_google_play',$1,'sandbox') quarantined",[buyer])).rows[0].quarantined, true);
  const result = (await db.query(`select public.process_revenuecat_live_watch_party_event_atomic(
    'revenuecat_google_play','synthetic-stale-session-event','NON_RENEWING_PURCHASE',$1,'live_fixture_sku','sandbox',now(),99,'usd',repeat('a',64),'synthetic-original') result`,[buyer])).rows[0].result;
  assert.equal(result.status, 'processed', 'baseline gap reproduced: projector processes active purchase despite stale authority');
  assert.equal((await db.query('select count(*)::int count from public.access_grants')).rows[0].count, 1);
  assert.equal((await db.query('select status from public.money_purchase_intents')).rows[0].status, 'consumed');
  assert.equal((await db.query('select payable_state from public.money_access_ledger_events')).rows[0].payable_state, 'not_payable');
  console.log(JSON.stringify({ auditFinding: 'MB-05', baselineReproduced: true, productionProjectorExecuted: true,
    productionSessionTriggerExecuted: true, issuingSessionPresent: false, authorityQuarantined: true,
    grantCreated: true, intentConsumed: true, payable: false, fullSchemaConcurrencyQualified: false }));
  await db.exec(fs.readFileSync('supabase/migrations/20261026105832_live_stage_purchase_fulfillment_authority.sql','utf8'));
  await resetPurchase();
  await db.exec('delete from auth.sessions');
  assert.equal((await project('stale','stale-original')).reason,'purchase_intent_session_authority_not_current');
  assert.equal(await scalar('select count(*)::int from public.access_grants'),0);
  assert.equal(await scalar('select count(*)::int from public.money_access_ledger_events'),0);
  assert.equal(await scalar('select status from public.money_purchase_intents'),'pending');
  assert.equal(await scalar("select (metadata->>'provider_reconciliation_required')::boolean from public.provider_events"),true);
  assert.equal(await scalar('select count(*)::int from public.revenuecat_provider_reconciliation_obligations'),1,'real capture trigger creates an actionable obligation');
  assert.equal(await scalar('select reported_amount_minor from public.revenuecat_provider_reconciliation_obligations'),99);
  assert.equal(await scalar('select reported_currency from public.revenuecat_provider_reconciliation_obligations'),'usd');
  assert.equal((await project('stale','stale-original')).duplicateProviderEvent,true);
  assert.equal(await scalar('select count(*)::int from public.revenuecat_provider_reconciliation_obligations'),1,'exact retries cannot duplicate reconciliation obligations');
  await restoreSession();
  assert.equal((await project('stale-new-event','stale-original')).reason,'initial_authority_not_rebindable');
  assert.equal(await scalar('select count(*)::int from public.access_grants'),0);
  await resetPurchase();
  await state('quarantined','true');
  assert.equal((await project('quarantined','quarantined-original')).reason,'revenuecat_terminal_authority_quarantined');
  assert.equal(await scalar('select count(*)::int from public.access_grants'),0);
  await resetPurchase();
  assert.equal((await project('missing-time','missing-time-original','NON_RENEWING_PURCHASE','null')).reason,'provider_occurred_at_missing_or_invalid');
  await resetPurchase();
  await state('restricted',buyer);
  assert.equal((await project('restricted-buyer','restricted-buyer-original')).reason,'buyer_account_restricted');
  await resetPurchase();
  await state('restricted',creator);
  assert.equal((await project('restricted-creator','restricted-creator-original')).reason,'creator_source_authority_restricted');
  await resetPurchase();
  assert.equal((await project('current','current-original')).status,'processed');
  assert.equal(await scalar('select count(*)::int from public.access_grants'),1);
  assert.equal(await scalar("select idempotency_key from public.provider_events where provider_event_id='current'"),'NON_RENEWING_PURCHASE:current');
  assert.equal((await project('current-second-event','current-original')).reason,'duplicate_original_transaction',
    'distinct provider event for a fulfilled original retains existing duplicate-original behavior');
  assert.equal(await scalar('select count(*)::int from public.revenuecat_provider_reconciliation_obligations'),0,
    'a second event for an already fulfilled original must not create a new authority-denial obligation');
  assert.equal(await scalar('select count(*)::int from public.access_grants'),1);
  assert.equal(await scalar('select count(*)::int from public.money_access_ledger_events'),1);
  assert.equal(await scalar("select idempotency_key from public.provider_events where provider_event_id='current-second-event'"),
    'NON_RENEWING_PURCHASE:current-second-event');
  await db.exec('delete from auth.sessions');
  await state('quarantined','true');
  assert.equal((await project('current','current-original')).duplicateProviderEvent,true,'already consumed event remains idempotent after authority changes');
  assert.equal(await scalar('select count(*)::int from public.access_grants'),1);
  assert.equal((await project('refund','current-original','REFUND')).status,'refunded','terminal removal is independent of current purchase authority');
  assert.equal(await scalar('select status from public.access_grants'),'refunded');
  assert.equal(await scalar("select count(*)::int from public.money_access_ledger_events where event_type='REFUND'"),1);
  assert.equal((await project('refund','current-original','REFUND')).duplicateProviderEvent,true);
  assert.equal(await scalar("select idempotency_key from public.provider_events where provider_event_id='refund'"),'REFUND:refund');
  const signature='public.process_revenuecat_live_watch_party_event_atomic(text,text,text,uuid,text,text,timestamptz,integer,text,text,text)';
  assert.equal(await scalar("select has_function_privilege('authenticated',$1,'EXECUTE')",[signature]),false);
  assert.equal(await scalar("select has_function_privilege('anon',$1,'EXECUTE')",[signature]),false);
  assert.equal(await scalar("select has_function_privilege('service_role',$1,'EXECUTE')",[signature]),true);
  await resetPurchase();
  await db.exec('update public.paid_live_watch_party_offers set price_cents=999');
  await assert.rejects(()=>project('edited-offer','edited-offer-original'),/live_watch_party_active_offer_binding_stale/,
    'negative control: prior projector rejects the accepted99-cent quote after an offer edit');
  const quoteSource=fs.readFileSync('supabase/migrations/20261026164507_creator_supported_prices_and_purchase_quotes.sql','utf8');
  await db.exec(extract(quoteSource,'process_revenuecat_live_watch_party_event_atomic'));
  assert.equal((await project('edited-offer','edited-offer-original')).status,'processed');
  assert.equal(await scalar('select amount_minor from public.money_access_ledger_events'),99,'accepted price survives offer edit');
  assert.equal((await project('edited-offer','edited-offer-original')).duplicateProviderEvent,true);
  assert.equal((await project('edited-offer-refund','edited-offer-original','REFUND')).status,'refunded');
  assert.equal(await scalar("select amount_minor from public.money_access_ledger_events where event_type='REFUND'"),99);
  console.log('Live Stage SQL authority repair: stale/session/quarantine/restriction/time/immutable-denial/duplicate/refund/grants controls passed.');
} catch (error) {
  console.error({message:error.message,code:error.code,where:error.where,stack:error.stack});
  failed = true;
} finally { await db.close(); }
if (failed) process.exitCode = 1;
