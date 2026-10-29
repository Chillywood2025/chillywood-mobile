#!/usr/bin/env node
// Execute production setter/resolver SQL in disposable PostgreSQL. External
// creator eligibility and provider identity are explicit fixtures, not claims
// of a full Supabase rollout or a real Store transaction.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = name => fs.readFileSync(`supabase/migrations/${name}.sql`, 'utf8');
const original = read('20260612213500_paid_events_metadata_safe_keys');
const schema = read('20260612201011_paid_events_v1_sandbox');
const integrity = read('20260824034109_creator_money_authority_integrity_closeout');
const historical = read('20260827221500_historical_creator_access_lifecycle_closure');
const repair = read('20261026104519_creator_event_offer_lifecycle');
const extract = (text, name) => {
  const start = text.lastIndexOf(`create or replace function public."${name}"(`);
  assert.ok(start >= 0, `production function ${name}`);
  return text.slice(start, text.indexOf('$$;', start) + 3);
};
const exportFixture = process.argv.includes('--export-fixture');
const fixtureStatements = [];
const db = exportFixture
  ? { exec: async sql => fixtureStatements.push(sql), close: async () => {} }
  : new PGlite();
const creator = '11111111-1111-4111-8111-111111111111';
const buyer = '22222222-2222-4222-8222-222222222222';
const event = '33333333-3333-4333-8333-333333333333';
const freeEvent = '44444444-4444-4444-8444-444444444444';
const grant = '55555555-5555-4555-8555-555555555555';
let checks = 0;
const check = (value, label) => { assert.ok(value, label); checks++; };
const actor = async id => db.query("select set_config('fixture.actor',$1,false)", [id ?? '']);
const save = async (status, price = 99, id = event) => (await db.query(
  'select public.set_paid_creator_event_offer($1,null,$2,2,$3) result', [id,price,status]
)).rows[0].result;
const access = async id => (await db.query(
  'select public.resolve_paid_creator_event_pass_access($1) result', [id]
)).rows[0].result;
const denied = async (operation, expression, label) => { await assert.rejects(operation, expression, label); checks++; };

try {
  await db.exec(`
    create role authenticated; create role anon; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('fixture.actor',true),'')::uuid $$;
    create function public.has_platform_role(text[]) returns boolean language sql stable as $$select false$$;
    create function public.wave1_current_caller_authority_internal() returns boolean language sql stable as $$
      select coalesce(current_setting('fixture.session_current',true),'true')<>'false' $$;
    create function public.wave1_assert_current_creator_money_authority_internal() returns uuid language plpgsql as $$
      begin if not public.wave1_current_caller_authority_internal() then raise exception 'creator_session_authority_required'; end if; return auth.uid(); end $$;
    create function public.wave1_creator_money_subject_authorized_internal(uuid) returns boolean language sql stable as $$select true$$;
    create function public.is_account_access_restricted(text) returns boolean language sql stable as $$select false$$;
    create table public.channel_audience_blocks(channel_user_id text,blocked_user_id text);
    create function public.creator_money_existing_purchase_identity_internal(uuid,text,uuid) returns jsonb language sql stable as $$select null::jsonb$$;
    create function public.creator_money_historical_purchase_identity_internal(uuid,text,uuid,uuid) returns jsonb language sql stable as $$
      select case when $4='${grant}'::uuid then jsonb_build_object('accessGrantId',$4) else null::jsonb end $$;
    create table public.creator_events(id uuid primary key,host_user_id uuid,event_title text,event_type text,status text,starts_at timestamptz,ends_at timestamptz);
    create table public.platform_money_kill_switches(key text primary key,state text);
    create table public.monetization_products(id uuid default gen_random_uuid(),product_key text,product_type text,provider text,environment text,status text,provider_product_id text);
    create table public.provider_events(id uuid primary key);
    create table public.money_access_ledger_events(id uuid primary key);
    create table public.access_grants(id uuid primary key);
    insert into public.platform_money_kill_switches values ('digital_sales_enabled','sandbox_only'),('revenuecat_google_play_enabled','sandbox_only');
    insert into public.monetization_products(product_key,product_type,provider,environment,status,provider_product_id)
      values ('event_pass_sandbox_099','event_pass','revenuecat_google_play','sandbox','sandbox','cw_event_pass_sandbox_099');
    insert into public.creator_events values
      ('${event}','${creator}','Sunday 8 PM','live_first','scheduled',now()+interval '7 days',now()+interval '7 days 1 hour'),
      ('${freeEvent}','${creator}','Free show','live_first','scheduled',now()+interval '7 days',null);
  `);
  await db.exec(schema.slice(schema.indexOf('create table'), schema.indexOf('drop trigger')));
  await db.exec(extract(schema, 'paid_creator_event_safe_row'));
  await db.exec(extract(original, 'set_paid_creator_event_offer').replace(
    'public."set_paid_creator_event_offer"(', 'public."set_paid_creator_event_offer_pre_integrity_closeout"('
  ));
  await db.exec(extract(integrity, 'set_paid_creator_event_offer'));
  await db.exec(extract(integrity, 'resolve_paid_creator_event_pass_access').replace(
    'public."resolve_paid_creator_event_pass_access"(', 'public."resolve_paid_creator_event_pass_access_pre_historical_closeout"('
  ));
  await db.exec(extract(historical, 'resolve_paid_creator_event_pass_access'));

  if (exportFixture) {
    process.stdout.write(fixtureStatements.join('\n'));
  } else {
  await actor(creator);
  const first = await save('sandbox');
  const oldCancel = await save('canceled');
  check(first.id !== oldCancel.id, 'negative control: original cancel creates a separate offer');
  check((await db.query('select status from public.paid_creator_events where id=$1',[first.id])).rows[0].status === 'sandbox',
    'negative control: original offer remains for sale after cancel');
  await db.exec('truncate public.paid_event_events,public.creator_event_transactions,public.paid_creator_event_passes,public.paid_creator_events cascade');
  await save('draft');
  await actor(buyer);
  check((await access(event)).reason === 'free_event', 'baseline: inactive paid offer retains existing free-entry semantics');
  await db.exec('truncate public.paid_event_events,public.creator_event_transactions,public.paid_creator_event_passes,public.paid_creator_events cascade');

  await db.exec(repair);
  await actor(creator);
  const draft = await save('draft');
  check((await save('draft')).id === draft.id, 'repeated draft saves update the same offer');
  check((await save('sandbox')).id === draft.id, 'publishing a draft preserves its identity');
  check((await save('paused')).id === draft.id, 'pause preserves offer identity');
  check((await save('sandbox')).id === draft.id, 'resume preserves offer identity');
  const canceled = await save('canceled');
  check(canceled.id === draft.id && canceled.status === 'canceled', 'cancel updates the current sale');
  check(Number((await db.query("select count(*) n from public.paid_creator_events where status in ('sandbox','active','paused','sold_out')")).rows[0].n) === 0,
    'no sale survives cancellation');
  await actor(buyer);
  const closed = await access(event);
  check(closed.allowed === true && closed.requiresPurchase === false && closed.reason === 'free_event', 'Studio Free action preserves existing free-entry semantics');
  check((await access(freeEvent)).reason === 'free_event', 'events without paid offers retain free access');
  await denied(save('sandbox'), /event_creator_required/, 'buyer cannot modify creator offer');
  await actor(null);
  await denied(save('paused'), /auth_required/, 'unauthenticated save denied');
  await actor(creator);
  await denied(save('sandbox',199), /approved_sandbox_price_required/, 'unconfigured price remains denied');
  await db.exec("select set_config('fixture.session_current','false',false)");
  await denied(save('draft'), /creator_session_authority_required/, 'existing public creator session boundary preserved');
  await db.exec("select set_config('fixture.session_current','true',false)");
  const next = await save('sandbox');
  await db.query(`insert into public.paid_creator_event_passes(event_id,creator_event_id,buyer_id,creator_id,access_grant_id)
    values ($1,$2,$3,$4,null)`, [next.id,event,buyer,creator]);
  await db.query('insert into public.access_grants(id) values($1)', [grant]);
  await db.query('update public.paid_creator_event_passes set access_grant_id=$1 where event_id=$2',[grant,next.id]);
  check((await save('archived')).id === next.id, 'archive updates current sale identity');
  await actor(buyer);
  check((await access(event)).reason === 'event_pass_confirmed', 'historical verified buyer retains archived-offer access');
  await db.query("update public.paid_creator_event_passes set status='refunded',refunded_at=now() where event_id=$1",[next.id]);
  check((await access(event)).reason === 'free_event', 'withdrawn offer retains existing conversion-to-free behavior');
  await db.query("update public.creator_events set status='canceled' where id=$1",[event]);
  check((await access(event)).allowed === false, 'canceled source event remains inaccessible even after sale conversion');
  check((await db.query("select has_function_privilege('authenticated','public.set_paid_creator_event_offer_pre_integrity_closeout(uuid,text,integer,integer,text)','EXECUTE') allowed")).rows[0].allowed === false,
    'private setter cannot bypass public creator authority');
  console.log(`Event offer lifecycle PostgreSQL: ${checks} checks passed, including 2 pre-fix negative controls.`);
  }
} finally { await db.close(); }
