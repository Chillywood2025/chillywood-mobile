begin;
select no_plan();
select ok((select bool_and(relrowsecurity and relforcerowsecurity) from pg_class where oid in (
  'public.creator_channel_subscription_catalog_bindings'::regclass,
  'public.creator_channel_subscription_group_owners'::regclass,
  'public.creator_channel_subscription_price_requests'::regclass)),
  'all subscription control tables enable and force RLS');
select ok(not has_table_privilege('authenticated','public.creator_channel_subscription_catalog_bindings','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('anon','public.creator_channel_subscription_catalog_bindings','SELECT,INSERT,UPDATE,DELETE')
  and not has_table_privilege('authenticated','public.creator_channel_subscription_group_owners','SELECT,INSERT,UPDATE,DELETE'),
  'ordinary clients gain no catalog or group-owner table authority');
select ok(not has_function_privilege('authenticated','public.approve_creator_channel_subscription_catalog_binding(uuid,uuid,text,text)','EXECUTE')
  and not has_function_privilege('anon','public.approve_creator_channel_subscription_catalog_binding(uuid,uuid,text,text)','EXECUTE')
  and has_function_privilege('service_role','public.approve_creator_channel_subscription_catalog_binding(uuid,uuid,text,text)','EXECUTE'),
  'catalog approval is service-only');
select ok(not has_table_privilege('service_role','public.creator_channel_subscription_catalog_bindings','INSERT,DELETE')
  and has_column_privilege('service_role','public.creator_channel_subscription_catalog_bindings','available_for_new_purchases','UPDATE')
  and not has_column_privilege('service_role','public.creator_channel_subscription_catalog_bindings','amount_minor','UPDATE'),
  'service can retire new selection but cannot directly rewrite binding identity');
select ok(not has_function_privilege('authenticated','public.money_purchase_intent_safe_row_pre_subscription_binding(public.money_purchase_intents)','EXECUTE')
  and not has_function_privilege('authenticated','public.create_creator_channel_subscription_intent_pre_binding(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.create_ios_creator_money_intent_pre_subscription_binding(text,uuid,integer,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','public.set_creator_channel_subscription_offer_at_price_pre_binding(text,text,text,uuid)','EXECUTE'),
  'legacy implementation functions cannot bypass current catalog routing');
select ok((select bool_and(prosecdef and proconfig @> array['search_path=""']) from pg_proc where oid in (
  'public.create_creator_channel_subscription_purchase_intent(uuid)'::regprocedure,
  'public.approve_creator_channel_subscription_catalog_binding(uuid,uuid,text,text)'::regprocedure,
  'public.list_creator_supported_prices(text,text,text,uuid)'::regprocedure)),
  'public boundaries use fixed empty definer search paths');
select is((select count(*) from public.creator_channel_subscription_catalog_bindings),0::bigint,
  'migration provisions no creator catalog rows');
select is((select count(*) from public.creator_channel_subscription_group_owners),0::bigint,
  'migration assigns no provider groups');
select throws_ok($$select public.approve_creator_channel_subscription_catalog_binding(
  'cb200000-0000-4000-8000-000000000001','cb200000-0000-4000-8000-000000000002','ios','sandbox')$$,
  'P0001','offer_not_found','approval requires an actual creator offer');
select is(public.creator_subscription_catalog_binding_ready_internal('cb200000-0000-4000-8000-000000000001'),false,
  'missing catalog readiness fails closed');
select ok(exists(select 1 from pg_constraint where conrelid='public.money_purchase_intents'::regclass
  and confrelid='public.creator_channel_subscription_catalog_bindings'::regclass and contype='f')
  and exists(select 1 from pg_constraint where conrelid='public.creator_money_purchase_quotes'::regclass
    and confrelid='public.creator_channel_subscription_catalog_bindings'::regclass and contype='f'),
  'intent and quote retain durable catalog foreign keys');
select * from finish();
rollback;
