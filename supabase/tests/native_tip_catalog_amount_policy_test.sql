begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);

-- Focused boundary contract. Canonical receipt/refund and exact-session checkout
-- semantics also run in the full-schema creator-money Node fixtures. No provider IO.
select ok(
  pg_get_functiondef('public.list_creator_supported_prices_pre_subscription_binding(text,text,text,uuid)'::regprocedure)
    not like '%between v_min and v_max%'
  and pg_get_functiondef('public.list_creator_supported_prices_pre_subscription_binding(text,text,text,uuid)'::regprocedure)
    like '%creator_money_supported_prices_internal%'
  and pg_get_functiondef('public.list_creator_supported_prices_pre_subscription_binding(text,text,text,uuid)'::regprocedure)
    like '%lower(v_currency)=price->>''currency''%',
  'effective native catalog ignores legacy preset bounds but retains catalog and currency binding');
select ok(
  pg_get_functiondef('public.create_money_purchase_intent_pre_protected_video_closeout(text,text,uuid,jsonb)'::regprocedure)
    not like '%v_catalog_amount between settings.%'
  and pg_get_functiondef('public.create_money_purchase_intent_pre_protected_video_closeout(text,text,uuid,jsonb)'::regprocedure)
    like '%v_catalog_amount <= 0%'
  and pg_get_functiondef('public.create_money_purchase_intent_pre_protected_video_closeout(text,text,uuid,jsonb)'::regprocedure)
    like '%source_offer_catalog_price_mismatch%',
  'effective Android intent keeps positive exact catalog price without creator preset limits');
select ok(
  pg_get_functiondef('private.read_creator_tip_route_costs_for_subject(uuid,uuid,uuid,integer,text)'::regprocedure)
    not like '%between settings.min_amount_cents and settings.max_amount_cents%'
  and pg_get_functiondef('private.read_creator_tip_route_costs_for_subject(uuid,uuid,uuid,integer,text)'::regprocedure)
    like '%(value->>''amountMinor'')::integer=p_amount_minor%'
  and pg_get_functiondef('private.read_creator_tip_route_costs_for_subject(uuid,uuid,uuid,integer,text)'::regprocedure)
    like '%resolve_creator_external_payment_capability%',
  'fee candidates remain exact native amounts and external capabilities retain their own limits');
select ok(
  pg_get_functiondef('public.list_creator_supported_prices(text,text,text,uuid)'::regprocedure) like '%list_creator_supported_prices_pre_subscription_binding%'
  and pg_get_functiondef('public.create_money_purchase_intent(text,text,uuid,jsonb)'::regprocedure) like '%create_money_purchase_intent_pre_source_lock%'
  and pg_get_functiondef('public.create_money_purchase_intent_pre_source_lock(text,text,uuid,jsonb)'::regprocedure) like '%create_money_purchase_intent_pre_protected_video_closeout%'
  and pg_get_functiondef('public.get_creator_tip_route_costs(uuid,integer,text)'::regprocedure) like '%read_creator_tip_route_costs_for_subject%',
  'current public wrappers retain delegation through their authority layers');
select ok((select bool_and(not has_function_privilege(role_name,signature,'EXECUTE'))
  from unnest(array['anon','authenticated','service_role']) role_name cross join unnest(array[
    'public.list_creator_supported_prices_pre_subscription_binding(text,text,text,uuid)',
    'public.create_money_purchase_intent_pre_protected_video_closeout(text,text,uuid,jsonb)',
    'public.create_money_purchase_intent_pre_source_lock(text,text,uuid,jsonb)',
    'private.read_creator_tip_route_costs_for_subject(uuid,uuid,uuid,integer,text)']) signature),
  'internal implementations remain inaccessible to all API roles including PUBLIC inheritance');
select ok(has_function_privilege('authenticated','public.list_creator_supported_prices(text,text,text,uuid)','EXECUTE')
  and not has_function_privilege('anon','public.list_creator_supported_prices(text,text,text,uuid)','EXECUTE')
  and not has_function_privilege('service_role','public.list_creator_supported_prices(text,text,text,uuid)','EXECUTE'),
  'public catalog retains authenticated-only execution');
select ok(has_function_privilege('authenticated','public.create_money_purchase_intent(text,text,uuid,jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.create_money_purchase_intent(text,text,uuid,jsonb)','EXECUTE')
  and not has_function_privilege('anon','public.create_money_purchase_intent(text,text,uuid,jsonb)','EXECUTE'),
  'public intent retains original authenticated and service execution grants');
select ok(has_function_privilege('authenticated','public.get_creator_tip_route_costs(uuid,integer,text)','EXECUTE')
  and not has_function_privilege('anon','public.get_creator_tip_route_costs(uuid,integer,text)','EXECUTE')
  and not has_function_privilege('service_role','public.get_creator_tip_route_costs(uuid,integer,text)','EXECUTE'),
  'public fee feed retains authenticated-only execution');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where oid in (
  'public.list_creator_supported_prices_pre_subscription_binding(text,text,text,uuid)'::regprocedure,
  'public.create_money_purchase_intent_pre_protected_video_closeout(text,text,uuid,jsonb)'::regprocedure,
  'private.read_creator_tip_route_costs_for_subject(uuid,uuid,uuid,integer,text)'::regprocedure)),
  'modified definer bodies retain fixed empty search paths');
select ok((select bool_and(relrowsecurity and not relforcerowsecurity) from pg_class where oid in (
  'public.creator_tip_settings'::regclass,'public.money_purchase_intents'::regclass)),
  'legacy settings and intents retain their original enabled non-FORCE RLS posture');
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in (
  'public.creator_money_purchase_quotes'::regclass,'private.creator_tip_route_fee_evidence'::regclass)),
  'quote and fee evidence tables retain enabled FORCE RLS');
select is((select pg_get_expr(adbin,adrelid) from pg_attrdef where adrelid='public.creator_tip_settings'::regclass
  and adnum=(select attnum from pg_attribute where attrelid='public.creator_tip_settings'::regclass and attname='min_amount_cents')),
  '100','legacy minimum metadata default remains unchanged');

insert into auth.users(id,is_sso_user,is_anonymous,email_confirmed_at)
values('c0990000-0000-4000-8000-000000000001',false,false,now());
select throws_ok($$insert into public.creator_tip_settings(creator_id,min_amount_cents)
  values('c0990000-0000-4000-8000-000000000001',99)$$,
  '23514',null,'legacy settings constraint still rejects min 99 metadata');
select lives_ok($$insert into public.creator_tip_settings(creator_id)
  values('c0990000-0000-4000-8000-000000000001')$$,
  'ordinary legacy settings with default metadata remain valid');
select is((select min_amount_cents from public.creator_tip_settings
  where creator_id='c0990000-0000-4000-8000-000000000001'),100,
  'metadata persists at 100 without enabling or repricing a purchase');
select ok(exists(select 1 from public.creator_money_supported_prices_internal('creator_tip','android','sandbox') price
  where price->>'productKey'='creator_tip_sandbox_099'
    and price->>'providerProductId'='cw_creator_tip_sandbox_099'
    and (price->>'amountMinor')::integer=99 and price->>'currency'='usd'),
  'unchanged existing Android catalog supplies exact 99 without a new SKU');
select * from finish();
rollback;
