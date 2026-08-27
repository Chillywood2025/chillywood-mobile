begin;

create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(20);

select ok(
  (select prosecdef and pg_get_functiondef(oid) ilike '%set search_path to ''''%'
   from pg_proc where oid=
     'public.create_money_purchase_intent(text,text,uuid,jsonb)'::regprocedure),
  'generic creator-money issuance remains a fixed-path definer boundary'
);

select ok(
  has_function_privilege(
    'authenticated','public.create_money_purchase_intent(text,text,uuid,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon','public.create_money_purchase_intent(text,text,uuid,jsonb)','EXECUTE'
  ),
  'the generic issuance surface is authenticated-only'
);

select ok(
  pg_get_functiondef(
    'public.create_money_purchase_intent(text,text,uuid,jsonb)'::regprocedure
  ) ilike '%creator-money-source-intent:%'
  and pg_get_functiondef(
    'public.create_money_purchase_intent(text,text,uuid,jsonb)'::regprocedure
  ) ilike '%creator_money_reject_live_source_intent_internal%'
  and pg_get_functiondef(
    'public.create_money_purchase_intent(text,text,uuid,jsonb)'::regprocedure
  ) ilike '%creator_money_source_has_history_internal%',
  'direct generic callers use exact source locking, pending rejection, and post-lock history'
);

select ok(
  pg_get_functiondef(
    'public.create_ios_creator_money_purchase_intent(text,uuid,integer,jsonb)'::regprocedure
  ) ilike '%creator-money-source-intent:%'
  and pg_get_functiondef(
    'public.create_ios_creator_money_purchase_intent(text,uuid,integer,jsonb)'::regprocedure
  ) ilike '%creator_money_reject_live_source_intent_internal%'
  and pg_get_functiondef(
    'public.create_ios_creator_money_purchase_intent(text,uuid,integer,jsonb)'::regprocedure
  ) ilike '%creator_money_source_has_history_internal%',
  'direct App Store creator-money issuance rechecks the exact source under lock'
);

select ok(
  pg_get_functiondef(
    'public.create_ios_app_store_purchase_intent(text,text,uuid,jsonb)'::regprocedure
  ) ilike '%creator-money-source-intent:%'
  and pg_get_functiondef(
    'public.create_ios_app_store_purchase_intent(text,text,uuid,jsonb)'::regprocedure
  ) ilike '%creator_money_reject_live_source_intent_internal%',
  'direct bounded Tip and Seat App Store issuance cannot reuse a pending source'
);

select ok(
  (select count(*)=4 from pg_proc procedure
   where procedure.oid in (
     'public.create_paid_watch_party_ticket_purchase_intent(uuid)'::regprocedure,
     'public.create_paid_creator_event_pass_purchase_intent(uuid)'::regprocedure,
     'public.create_creator_vip_pass_purchase_intent(uuid)'::regprocedure,
     'public.create_creator_channel_subscription_purchase_intent(uuid)'::regprocedure
   )
   and procedure.prosrc like '%creator-money-source-intent:%'
   and procedure.prosrc like '%creator_money_reject_live_source_intent_internal%'),
  'Seat, Event, VIP, and Channel entry points reject a second exact-source checkout'
);

select ok(
  not has_function_privilege(
    'authenticated','public.create_money_purchase_intent_pre_source_lock(text,text,uuid,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role','public.create_ios_creator_money_intent_pre_source_lock(text,uuid,integer,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated','public.create_ios_app_store_intent_pre_source_lock(text,text,uuid,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated','public.create_event_pass_intent_pre_source_lock(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated','public.create_vip_pass_intent_pre_source_lock(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated','public.create_channel_subscription_intent_pre_source_lock(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated','public.create_seat_pass_intent_pre_source_lock(uuid)',
    'EXECUTE'
  ),
  'every superseded issuance implementation is non-callable by API roles'
);

select ok(
  not has_function_privilege(
    'anon','public.creator_money_source_has_history_internal(uuid,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated','public.creator_money_reject_live_source_intent_internal(uuid,text,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role','public.creator_money_provider_source_identity_internal(text,uuid,text,text,text,text)',
    'EXECUTE'
  ),
  'source identity and pending/history helpers remain owner-internal'
);

select ok(
  (select prosecdef and pg_get_functiondef(oid) ilike '%set search_path to ''''%'
   from pg_proc where oid=
     'public.process_revenuecat_consumable_event_provider_internal(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)'::regprocedure),
  'provider source-lock reconciliation is a fixed-path definer boundary'
);

select ok(
  not has_function_privilege(
    'public','public.process_revenuecat_consumable_event_provider_internal(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'anon','public.process_revenuecat_consumable_event_provider_internal(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated','public.process_revenuecat_consumable_event_provider_internal(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role','public.process_revenuecat_consumable_event_provider_internal(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'the provider reconciliation implementation is not a direct API surface'
);

select ok(
  not has_function_privilege(
    'service_role','public.process_creator_money_provider_event_pre_source_lock(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)',
    'EXECUTE'
  ),
  'the pre-closure provider projector cannot bypass source locking'
);

select ok(
  strpos(pg_get_functiondef(
    'public.process_revenuecat_consumable_event_provider_internal(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)'::regprocedure
  ),'creator_money_provider_source_identity_internal')
  < strpos(pg_get_functiondef(
    'public.process_revenuecat_consumable_event_provider_internal(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)'::regprocedure
  ),'pg_advisory_xact_lock')
  and strpos(pg_get_functiondef(
    'public.process_revenuecat_consumable_event_provider_internal(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)'::regprocedure
  ),'pg_advisory_xact_lock')
  < strpos(pg_get_functiondef(
    'public.process_revenuecat_consumable_event_provider_internal(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)'::regprocedure
  ),'v_after:=public."creator_money_provider_source_identity_internal"')
  and strpos(pg_get_functiondef(
    'public.process_revenuecat_consumable_event_provider_internal(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)'::regprocedure
  ),'v_after:=public."creator_money_provider_source_identity_internal"')
  < strpos(pg_get_functiondef(
    'public.process_revenuecat_consumable_event_provider_internal(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)'::regprocedure
  ),'process_creator_money_provider_event_pre_source_lock')
  and pg_get_functiondef(
    'public.process_revenuecat_consumable_event_provider_internal(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)'::regprocedure
  ) ilike '%if v_is_active and v_before is not null%',
  'active provider processing pre-reads, source-locks, revalidates, then projects while terminal lock order remains unchanged'
);

select ok(
  pg_get_functiondef(
    'public.process_revenuecat_consumable_event_provider_internal(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)'::regprocedure
  ) ilike '%provider_source_lock_unresolved%'
  and pg_get_functiondef(
    'public.process_revenuecat_consumable_event_provider_internal(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text,text,text,text,text,text)'::regprocedure
  ) ilike '%v_reason%process_creator_money_provider_event_pre_source_lock%',
  'unresolved active provider state is forced to durable ignored reconciliation'
);

select ok(
  pg_get_functiondef(
    'public.creator_money_provider_source_identity_internal(text,uuid,text,text,text,text)'::regprocedure
  ) ilike '%intent."provider_product_id"=p_provider_product_id%'
  and pg_get_functiondef(
    'public.creator_money_provider_source_identity_internal(text,uuid,text,text,text,text)'::regprocedure
  ) ilike '%intent."source_type" in%creator_tip%watch_party_live%paid_content%event%vip_pass%channel_subscription%'
  and pg_get_functiondef(
    'public.creator_money_provider_source_identity_internal(text,uuid,text,text,text,text)'::regprocedure
  ) ilike '%link."binding_state"=''exact''%',
  'provider pre-read resolves only exact provider/product/environment source identity'
);

select ok(
  (select state='off' from public.platform_money_kill_switches
   where key='live_money_enabled')
  and (select state='off' from public.platform_money_kill_switches
   where key='payouts_enabled'),
  'source-intent race closure leaves production money and payouts off'
);

set local session_replication_role=replica;
insert into auth.users(id) values
  ('91000000-0000-4000-8000-000000000001'::uuid),
  ('92000000-0000-4000-8000-000000000001'::uuid);
with selected as materialized (
  select mapping.*,product.product_key,product.product_type
  from public.monetization_product_store_mappings mapping
  join public.monetization_products product on product.id=mapping.product_id
  where mapping.concept='event_pass'
    and mapping.platform='ios'
    and mapping.store='app_store'
    and mapping.provider='revenuecat_app_store'
    and mapping.provider_product_id='com.chillywood.eventpass.tier1'
  limit 1
)
insert into public.money_purchase_intents(
  id,user_id,product_id,product_key,product_type,provider,
  provider_product_id,source_type,source_id,creator_id,environment,status,
  amount_minor,currency,idempotency_key,expires_at,metadata,session_generation
)
select
  '93000000-0000-4000-8000-000000000001'::uuid,
  '91000000-0000-4000-8000-000000000001'::uuid,
  selected.product_id,selected.product_key,selected.product_type,
  'revenuecat_app_store',selected.provider_product_id,'event',
  '94000000-0000-4000-8000-000000000001'::uuid,
  '92000000-0000-4000-8000-000000000001'::uuid,
  selected.environment,'pending',selected.reference_price_minor,
  lower(selected.reference_currency),'source-lock-runtime-one',
  timezone('utc'::text,now())+interval '15 minutes',
  jsonb_build_object('concept','event_pass','store_mapping_id',selected.id),
  '95000000-0000-4000-8000-000000000001'
from selected;
set local session_replication_role=origin;

select is(
  public.creator_money_provider_source_identity_internal(
    'source-lock-runtime-provider',
    '91000000-0000-4000-8000-000000000001'::uuid,
    'com.chillywood.eventpass.tier1','sandbox','source-lock-original',
    'revenuecat_app_store'
  )->>'sourceId',
  '94000000-0000-4000-8000-000000000001',
  'a unique pending Event intent resolves one exact provider source lock'
);

set local session_replication_role=replica;
insert into public.money_purchase_intents(
  id,user_id,product_id,product_key,product_type,provider,
  provider_product_id,source_type,source_id,creator_id,environment,status,
  amount_minor,currency,idempotency_key,expires_at,metadata,session_generation
)
select
  '93000000-0000-4000-8000-000000000002'::uuid,user_id,product_id,
  product_key,product_type,provider,provider_product_id,source_type,
  '94000000-0000-4000-8000-000000000002'::uuid,creator_id,environment,
  status,amount_minor,currency,'source-lock-runtime-two',expires_at,metadata,
  session_generation
from public.money_purchase_intents
where id='93000000-0000-4000-8000-000000000001'::uuid;
set local session_replication_role=origin;

select is(
  public.creator_money_provider_source_identity_internal(
    'source-lock-runtime-provider',
    '91000000-0000-4000-8000-000000000001'::uuid,
    'com.chillywood.eventpass.tier1','sandbox','source-lock-original',
    'revenuecat_app_store'
  ),
  null::jsonb,
  'ambiguous pooled-product pending intents resolve no provider authority'
);

delete from public.money_purchase_intents
where id='93000000-0000-4000-8000-000000000002'::uuid;
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"role":"authenticated","sub":"91000000-0000-4000-8000-000000000001","session_id":"95000000-0000-4000-8000-000000000001"}',
  true
);

select throws_ok(
  $$select public.create_money_purchase_intent(
    (select product_key from public.money_purchase_intents
     where id='93000000-0000-4000-8000-000000000001'::uuid),
    'event','94000000-0000-4000-8000-000000000001'::uuid,'{}'::jsonb
  )$$,
  'P0001','source_purchase_intent_already_pending',
  'an authenticated direct generic Event call cannot reuse the live intent'
);

select throws_ok(
  $$select public.create_ios_creator_money_purchase_intent(
    'event_pass','94000000-0000-4000-8000-000000000001'::uuid,99,'{}'::jsonb
  )$$,
  'P0001','source_purchase_intent_already_pending',
  'an authenticated direct iOS Event call cannot reuse the live intent'
);
reset role;

select is(
  (select count(*)::integer from public.money_purchase_intents
   where user_id='91000000-0000-4000-8000-000000000001'::uuid
     and source_type='event'
     and source_id='94000000-0000-4000-8000-000000000001'::uuid),
  1,
  'failed direct replays leave exactly one source-bound pending intent'
);

select * from finish();
rollback;
