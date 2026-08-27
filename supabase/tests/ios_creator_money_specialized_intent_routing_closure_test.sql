begin;

create extension if not exists pgtap with schema extensions;
set search_path=public,extensions;
select plan(39);

select ok(
  (select prosecdef and pg_get_functiondef(oid) ilike '%set search_path to ''''%'
   from pg_proc where oid=
     'public.create_ios_creator_money_purchase_intent(text,uuid,integer,jsonb)'::regprocedure),
  '1. App Store creator-money issuance is SECURITY DEFINER with an empty path'
);

select ok(
  (select bool_and(prosecdef and pg_get_functiondef(oid) ilike '%set search_path to ''''%')
   from pg_proc where oid in (
     'public.create_paid_creator_event_pass_purchase_intent(uuid)'::regprocedure,
     'public.create_creator_vip_pass_purchase_intent(uuid)'::regprocedure,
     'public.create_creator_channel_subscription_purchase_intent(uuid)'::regprocedure
   )),
  '2. all three mobile specialized wrappers use a fixed definer path'
);

select ok(
  not exists (
    select 1 from pg_proc procedure
    cross join lateral aclexplode(procedure.proacl) acl
    where procedure.oid=
      'public.create_ios_creator_money_purchase_intent(text,uuid,integer,jsonb)'::regprocedure
      and acl.grantee=0 and acl.privilege_type='EXECUTE'
  )
  and not has_function_privilege('anon','public.create_ios_creator_money_purchase_intent(text,uuid,integer,jsonb)','EXECUTE'),
  '3. PUBLIC and anon cannot issue App Store purchase authority'
);

select ok(
  has_function_privilege('authenticated','public.create_ios_creator_money_purchase_intent(text,uuid,integer,jsonb)','EXECUTE')
  and has_function_privilege('service_role','public.create_ios_creator_money_purchase_intent(text,uuid,integer,jsonb)','EXECUTE'),
  '4. only the intended authenticated/service App Store callers remain'
);

select ok(
  not has_function_privilege('anon','public.create_paid_creator_event_pass_purchase_intent(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.create_creator_vip_pass_purchase_intent(uuid)','EXECUTE')
  and not has_function_privilege('anon','public.create_creator_channel_subscription_purchase_intent(uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.create_paid_creator_event_pass_purchase_intent(uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.create_creator_vip_pass_purchase_intent(uuid)','EXECUTE')
  and has_function_privilege('authenticated','public.create_creator_channel_subscription_purchase_intent(uuid)','EXECUTE'),
  '5. specialized purchase RPCs are authenticated-only API surfaces'
);

select ok(
  not has_function_privilege('authenticated','public.create_ios_creator_money_purchase_intent_pre_specialized_routing_closure(text,uuid,integer,jsonb)','EXECUTE')
  and not has_function_privilege('service_role','public.create_ios_creator_money_purchase_intent_pre_specialized_routing_closure(text,uuid,integer,jsonb)','EXECUTE')
  and not has_function_privilege('authenticated','public.create_paid_creator_event_pass_purchase_intent_pre_ios_routing_closure(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.create_creator_vip_pass_purchase_intent_pre_ios_routing_closure(uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.create_creator_channel_subscription_purchase_intent_pre_ios_routing_closure(uuid)','EXECUTE'),
  '6. superseded implementation functions are not direct API authority'
);

select ok(
  not has_function_privilege('anon','public.creator_money_historical_intent_safe_row_internal(uuid,text,uuid,uuid)','EXECUTE')
  and not has_function_privilege('authenticated','public.creator_money_historical_intent_safe_row_internal(uuid,text,uuid,uuid)','EXECUTE')
  and not has_function_privilege('service_role','public.creator_money_historical_intent_safe_row_internal(uuid,text,uuid,uuid)','EXECUTE'),
  '7. immutable historical identity projection remains owner-internal'
);

select ok(
  pg_get_functiondef('public.create_event_pass_intent_pre_source_lock(uuid)'::regprocedure)
    ilike '%create_ios_creator_money_purchase_intent%''event_pass''%'
  and pg_get_functiondef('public.create_vip_pass_intent_pre_source_lock(uuid)'::regprocedure)
    ilike '%create_ios_creator_money_purchase_intent%''vip_pass''%'
  and pg_get_functiondef('public.create_channel_subscription_intent_pre_source_lock(uuid)'::regprocedure)
    ilike '%create_ios_creator_money_purchase_intent%''channel_subscription''%',
  '8. all specialized iOS calls route through finite App Store authority'
);

select ok(
  pg_get_functiondef('public.create_event_pass_intent_pre_source_lock(uuid)'::regprocedure)
    ilike '%v_offer."creator_event_id"%'
  and pg_get_functiondef('public.create_vip_pass_intent_pre_source_lock(uuid)'::regprocedure)
    ilike '%v_offer."id"%'
  and pg_get_functiondef('public.create_channel_subscription_intent_pre_source_lock(uuid)'::regprocedure)
    ilike '%v_offer."id"%',
  '9. Event uses its source event while VIP and Channel retain exact offer identity'
);

select ok(
  pg_get_functiondef('public.create_ios_creator_money_intent_pre_source_lock(text,uuid,integer,jsonb)'::regprocedure)
    ilike '%sessiongeneration%is distinct from%session_id%',
  '10. intent issuance binds the exact current authenticated session generation'
);

select ok(
  (select count(*)=4 from pg_proc procedure
   where procedure.oid in (
     'public.create_ios_creator_money_purchase_intent(text,uuid,integer,jsonb)'::regprocedure,
     'public.create_paid_creator_event_pass_purchase_intent(uuid)'::regprocedure,
     'public.create_creator_vip_pass_purchase_intent(uuid)'::regprocedure,
     'public.create_creator_channel_subscription_purchase_intent(uuid)'::regprocedure
   ) and procedure.prosrc like '%creator-money-source-intent:%'),
  '11. every platform entry serializes one exact buyer/source purchase lane'
);

select ok(
  pg_get_functiondef('public.create_ios_creator_money_purchase_intent(text,uuid,integer,jsonb)'::regprocedure)
    ilike '%creator_money_reject_live_source_intent_internal%'
  and pg_get_functiondef('public.creator_money_reject_live_source_intent_internal(uuid,text,uuid)'::regprocedure)
    ilike '%source_purchase_intent_ambiguous%'
  and pg_get_functiondef('public.creator_money_reject_live_source_intent_internal(uuid,text,uuid)'::regprocedure)
    ilike '%source_purchase_intent_already_pending%',
  '12. ambiguous and cross-store pending intents fail closed before charge'
);

select ok(
  pg_get_functiondef('public.create_ios_creator_money_intent_pre_source_lock(text,uuid,integer,jsonb)'::regprocedure)
    ilike '%com.chillywood.eventpass.%'
  and pg_get_functiondef('public.create_ios_creator_money_intent_pre_source_lock(text,uuid,integer,jsonb)'::regprocedure)
    ilike '%tier1%99%tier2%299%tier3%499%tier4%999%',
  '13. Event intent readback is checked against the exact finite price tier'
);

select ok(
  pg_get_functiondef('public.create_ios_creator_money_intent_pre_source_lock(text,uuid,integer,jsonb)'::regprocedure)
    ilike '%com.chillywood.vip.%'
  and pg_get_functiondef('public.create_ios_creator_money_intent_pre_source_lock(text,uuid,integer,jsonb)'::regprocedure)
    ilike '%product."product_type"=v_concept%',
  '14. VIP cannot alias Event, Premium, or another conceptual product'
);

select ok(
  pg_get_functiondef('public.create_ios_creator_money_intent_pre_source_lock(text,uuid,integer,jsonb)'::regprocedure)
    ilike '%auto_renewable_subscription%'
  and pg_get_functiondef('public.create_ios_creator_money_intent_pre_source_lock(text,uuid,integer,jsonb)'::regprocedure)
    ilike '%chillywood_channel_slot_%'
  and pg_get_functiondef('public.create_ios_creator_money_intent_pre_source_lock(text,uuid,integer,jsonb)'::regprocedure)
    ilike '%slot_number%''1'',''2'',''3'',''4'',''5'',''6'',''7'',''8''%',
  '15. Channel intent validation preserves one exact monthly slot and group'
);

select is(
  (select count(*)::integer
   from public.monetization_product_store_mappings mapping
   where mapping.concept='event_pass' and mapping.platform='ios'
     and mapping.store='app_store' and mapping.provider='revenuecat_app_store'
     and mapping.store_product_type='consumable'
     and mapping.provider_product_id in (
       'com.chillywood.eventpass.tier1','com.chillywood.eventpass.tier2',
       'com.chillywood.eventpass.tier3','com.chillywood.eventpass.tier4'
     )),
  4,
  '16. the database contains exactly four canonical Event App Store tiers'
);

select is(
  (select count(*)::integer
   from public.monetization_product_store_mappings mapping
   where mapping.concept='vip_pass' and mapping.platform='ios'
     and mapping.store='app_store' and mapping.provider='revenuecat_app_store'
     and mapping.store_product_type='consumable'
     and mapping.provider_product_id in (
       'com.chillywood.vip.tier1','com.chillywood.vip.tier2',
       'com.chillywood.vip.tier3','com.chillywood.vip.tier4'
     )),
  4,
  '17. the database contains exactly four canonical VIP App Store tiers'
);

select is(
  (select count(*)::integer
   from public.monetization_product_store_mappings mapping
   where mapping.concept='channel_subscription' and mapping.platform='ios'
     and mapping.store='app_store' and mapping.provider='revenuecat_app_store'
     and mapping.store_product_type='auto_renewable_subscription'
     and mapping.metadata->>'slot_number' in ('1','2','3','4','5','6','7','8')
     and mapping.provider_product_id=
       'com.chillywood.channel.subscription.slot'||(mapping.metadata->>'slot_number')
     and mapping.apple_subscription_group=
       'chillywood_channel_slot_'||(mapping.metadata->>'slot_number')),
  8,
  '18. the database contains exactly eight creator-specific Channel slots'
);

select ok(
  (select state='off' from public.platform_money_kill_switches where key='live_money_enabled')
  and (select state='off' from public.platform_money_kill_switches where key='payouts_enabled'),
  '19. source routing closure does not activate live money or payouts'
);

select ok(
  pg_get_functiondef('public.create_ios_creator_money_intent_pre_source_lock(text,uuid,integer,jsonb)'::regprocedure)
    ilike '%not_payable%true%'
  and pg_get_functiondef('public.create_ios_creator_money_intent_pre_source_lock(text,uuid,integer,jsonb)'::regprocedure)
    ilike '%payout_ready%false%'
  and pg_get_functiondef('public.create_ios_creator_money_intent_pre_source_lock(text,uuid,integer,jsonb)'::regprocedure)
    ilike '%premium_unlock%false%',
  '20. intent metadata cannot grant payout or Premium authority'
);

select ok(
  pg_get_functiondef('public.create_ios_creator_money_purchase_intent_pre_protected_video_closeout(text,uuid,integer,jsonb)'::regprocedure)
    ilike '%has_paid_content_access%->>''allowed''%',
  '21. the protected-video predecessor reads JSON access as a boolean field rather than a JSONB condition'
);

select ok(
  pg_get_functiondef('public.creator_money_historical_intent_safe_row_internal(uuid,text,uuid,uuid)'::regprocedure)
    ilike '%creator_money_historical_purchase_identity_internal%'
  and pg_get_functiondef('public.creator_money_historical_intent_safe_row_internal(uuid,text,uuid,uuid)'::regprocedure)
    ilike '%status%consumed%'
  and pg_get_functiondef('public.creator_money_historical_intent_safe_row_internal(uuid,text,uuid,uuid)'::regprocedure)
    ilike '%creator_id%p_creator_id%',
  '22. no-charge history remains exact consumed buyer/source/creator/provider identity'
);

select ok(
  (select prosecdef and pg_get_functiondef(oid) ilike '%set search_path to ''''%'
   from pg_proc where oid=
     'public.ios_creator_money_store_mapping_id_internal(uuid,text)'::regprocedure)
  and not has_function_privilege(
    'anon','public.ios_creator_money_store_mapping_id_internal(uuid,text)','EXECUTE'
  )
  and not has_function_privilege(
    'authenticated','public.ios_creator_money_store_mapping_id_internal(uuid,text)','EXECUTE'
  )
  and not has_function_privilege(
    'service_role','public.ios_creator_money_store_mapping_id_internal(uuid,text)','EXECUTE'
  ),
  '23. pending App Store quote validation is a private fixed-path helper'
);

select ok(
  (select prosecdef and pg_get_functiondef(oid) ilike '%set search_path to ''''%'
   from pg_proc where oid=
     'public.ios_creator_money_expected_environment_internal()'::regprocedure)
  and not has_function_privilege(
    'anon','public.ios_creator_money_expected_environment_internal()','EXECUTE'
  )
  and not has_function_privilege(
    'authenticated','public.ios_creator_money_expected_environment_internal()','EXECUTE'
  )
  and not has_function_privilege(
    'service_role','public.ios_creator_money_expected_environment_internal()','EXECUTE'
  ),
  '24. current App Store environment resolution is private and fixed-path'
);

select is(
  public.ios_creator_money_expected_environment_internal(),
  null::text,
  '25. the default App Store-off rail resolves no purchase environment'
);

update public.platform_money_kill_switches
set state=case key
  when 'revenuecat_app_store_enabled' then 'sandbox_only'
  when 'provider_webhooks_enabled' then 'sandbox_only'
  when 'digital_sales_enabled' then 'sandbox_only'
  when 'paid_content_enabled' then 'sandbox_only'
  when 'creator_monetization_enabled' then 'sandbox_only'
  when 'live_money_enabled' then 'off'
  when 'payouts_enabled' then 'off'
end
where key in (
  'revenuecat_app_store_enabled','provider_webhooks_enabled',
  'digital_sales_enabled','paid_content_enabled','creator_monetization_enabled',
  'live_money_enabled','payouts_enabled'
);

select is(
  public.ios_creator_money_expected_environment_internal(),
  'sandbox',
  '26. only the complete sandbox rail selects the sandbox environment'
);

select is(
  public.ios_paid_video_expected_environment_internal(),
  'sandbox',
  '27. only the complete Paid Video rail selects the sandbox environment'
);

set local session_replication_role=replica;
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
  amount_minor,currency,idempotency_key,expires_at,metadata,
  session_generation
)
select
  seed.id,'81000000-0000-4000-8000-000000000001'::uuid,
  selected.product_id,selected.product_key,selected.product_type,
  'revenuecat_app_store',selected.provider_product_id,'event',seed.source_id,
  '82000000-0000-4000-8000-000000000001'::uuid,selected.environment,
  'pending',selected.reference_price_minor+seed.amount_delta,
  lower(selected.reference_currency),'ios-stale-quote-'||seed.label,
  timezone('utc'::text,now())+interval '15 minutes',
  jsonb_build_object(
    'concept','event_pass','store_mapping_id',selected.id,
    'not_payable',true,'viewer_access_only',true,
    'grants_livekit_authority',false,'grants_host_authority',false,
    'premium_unlock',false,'payout_ready',false
  ),'83000000-0000-4000-8000-000000000001'
from selected
cross join (values
  ('84000000-0000-4000-8000-000000000001'::uuid,
   '85000000-0000-4000-8000-000000000001'::uuid,0,'exact'),
  ('84000000-0000-4000-8000-000000000002'::uuid,
   '85000000-0000-4000-8000-000000000002'::uuid,1,'repriced')
) as seed(id,source_id,amount_delta,label);
set local session_replication_role=origin;

set local session_replication_role=replica;
with selected as materialized (
  select mapping.*,product.product_key,product.product_type
  from public.monetization_product_store_mappings mapping
  join public.monetization_products product on product.id=mapping.product_id
  where mapping.concept='paid_video'
    and mapping.platform='ios'
    and mapping.store='app_store'
    and mapping.provider='revenuecat_app_store'
    and mapping.provider_product_id='com.chillywood.paidvideo.tier1'
  limit 1
)
insert into public.money_purchase_intents(
  id,user_id,product_id,product_key,product_type,provider,
  provider_product_id,source_type,source_id,creator_id,environment,status,
  amount_minor,currency,idempotency_key,expires_at,metadata,
  session_generation
)
select
  seed.id,'81000000-0000-4000-8000-000000000001'::uuid,
  selected.product_id,selected.product_key,selected.product_type,
  'revenuecat_app_store',selected.provider_product_id,'paid_content',seed.source_id,
  '82000000-0000-4000-8000-000000000001'::uuid,selected.environment,
  'pending',selected.reference_price_minor+seed.amount_delta,
  lower(selected.reference_currency),'ios-paid-stale-quote-'||seed.label,
  timezone('utc'::text,now())+interval '15 minutes',
  jsonb_build_object(
    'concept','paid_video','store_mapping_id',selected.id,
    'not_payable',true,'viewer_access_only',true,
    'grants_livekit_authority',false,'grants_host_authority',false,
    'premium_unlock',false,'payout_ready',false
  ),'83000000-0000-4000-8000-000000000001'
from selected
cross join (values
  ('84000000-0000-4000-8000-000000000010'::uuid,
   '85000000-0000-4000-8000-000000000010'::uuid,0,'exact'),
  ('84000000-0000-4000-8000-000000000011'::uuid,
   '85000000-0000-4000-8000-000000000011'::uuid,1,'repriced')
) as seed(id,source_id,amount_delta,label);
set local session_replication_role=origin;

select ok(
  public.ios_creator_money_store_mapping_id_internal(
    '84000000-0000-4000-8000-000000000001','event_pass'
  ) is not null,
  '28. an exact pending App Store intent resolves one canonical mapping'
);

select is(
  public.ios_creator_money_store_mapping_id_internal(
    '84000000-0000-4000-8000-000000000002','event_pass'
  ),
  null::uuid,
  '29. a repriced stale pending intent cannot resolve charge authority'
);

select ok(
  public.ios_creator_money_store_mapping_id_internal(
    '84000000-0000-4000-8000-000000000010','paid_video'
  ) is not null,
  '30. an exact Paid Video pending intent resolves its one canonical tier'
);

select is(
  public.ios_creator_money_store_mapping_id_internal(
    '84000000-0000-4000-8000-000000000011','paid_video'
  ),
  null::uuid,
  '31. a repriced Paid Video intent cannot retain App Store charge authority'
);

select set_config('request.jwt.claim.role','service_role',true);
update public.platform_money_kill_switches
set state='on'
where key in (
  'revenuecat_app_store_enabled','provider_webhooks_enabled',
  'digital_sales_enabled','paid_content_enabled',
  'creator_monetization_enabled','live_money_enabled'
);
select set_config('request.jwt.claim.role','',true);

select is(
  public.ios_creator_money_expected_environment_internal(),
  'production',
  '32. a complete activation transition selects production atomically'
);

select is(
  public.ios_paid_video_expected_environment_internal(),
  'production',
  '33. Paid Video selects production only from its complete production rail'
);

select isnt(
  (select environment from public.money_purchase_intents
   where id='84000000-0000-4000-8000-000000000001'::uuid),
  public.ios_creator_money_expected_environment_internal(),
  '34. an Event sandbox intent is stale after a production transition'
);

select isnt(
  (select environment from public.money_purchase_intents
   where id='84000000-0000-4000-8000-000000000010'::uuid),
  public.ios_paid_video_expected_environment_internal(),
  '35. a Paid Video sandbox intent is stale after a production transition'
);

select ok(
  (select count(*)=4
   from pg_proc procedure
   where procedure.oid in (
     'public.create_ios_creator_money_intent_pre_source_lock(text,uuid,integer,jsonb)'::regprocedure,
     'public.create_event_pass_intent_pre_source_lock(uuid)'::regprocedure,
     'public.create_vip_pass_intent_pre_source_lock(uuid)'::regprocedure,
     'public.create_channel_subscription_intent_pre_source_lock(uuid)'::regprocedure
   )
   and procedure.prosrc like '%ios_creator_money_store_mapping_id_internal%')
  and pg_get_functiondef(
    'public.create_ios_creator_money_intent_pre_source_lock(text,uuid,integer,jsonb)'::regprocedure
  ) ilike '%v_pending."amount_minor" is distinct from p_amount_minor%'
  and pg_get_functiondef(
    'public.create_event_pass_intent_pre_source_lock(uuid)'::regprocedure
  ) ilike '%v_pending."amount_minor" is distinct from v_offer."price_cents"%'
  and pg_get_functiondef(
    'public.create_vip_pass_intent_pre_source_lock(uuid)'::regprocedure
  ) ilike '%v_pending."amount_minor" is distinct from v_offer."price_cents"%'
  and pg_get_functiondef(
    'public.create_channel_subscription_intent_pre_source_lock(uuid)'::regprocedure
  ) ilike '%v_pending."amount_minor" is distinct from v_offer."price_cents"%',
  '36. every iOS source lane rejects a stale quote before another intent can be issued'
);

select ok(
  (select prosecdef and pg_get_functiondef(oid) ilike '%set search_path to ''''%'
   from pg_proc where oid=
     'public.create_ios_paid_video_purchase_intent_guard_internal(uuid,integer,jsonb)'::regprocedure)
  and not has_function_privilege(
    'anon','public.create_ios_paid_video_purchase_intent_guard_internal(uuid,integer,jsonb)','EXECUTE'
  )
  and not has_function_privilege(
    'authenticated','public.create_ios_paid_video_purchase_intent_guard_internal(uuid,integer,jsonb)','EXECUTE'
  )
  and not has_function_privilege(
    'service_role','public.create_ios_paid_video_purchase_intent_guard_internal(uuid,integer,jsonb)','EXECUTE'
  )
  and not has_function_privilege(
    'authenticated','public.ios_paid_video_expected_environment_internal()','EXECUTE'
  ),
  '37. Paid Video transition helpers are private fixed-path authority'
);

select ok(
  pg_get_functiondef(
    'public.create_ios_creator_money_intent_pre_source_lock(text,uuid,integer,jsonb)'::regprocedure
  ) ilike '%create_ios_paid_video_purchase_intent_guard_internal%'
  and pg_get_functiondef(
    'public.create_ios_paid_video_purchase_intent_guard_internal(uuid,integer,jsonb)'::regprocedure
  ) ilike '%creator-money-source-intent:%paid_content%'
  and pg_get_functiondef(
    'public.create_ios_paid_video_purchase_intent_guard_internal(uuid,integer,jsonb)'::regprocedure
  ) ilike '%for share%ios_paid_video_expected_environment_internal%'
  and pg_get_functiondef(
    'public.create_ios_paid_video_purchase_intent_guard_internal(uuid,integer,jsonb)'::regprocedure
  ) ilike '%v_pending."environment" is distinct from v_expected_environment%'
  and pg_get_functiondef(
    'public.create_ios_paid_video_purchase_intent_guard_internal(uuid,integer,jsonb)'::regprocedure
  ) ilike '%ios_creator_money_store_mapping_id_internal%paid_video%',
  '38. Paid Video serializes exact source and rejects stale rail, quote, and tier authority'
);

select ok(
  pg_get_functiondef(
    'public.creator_video_paid_precharge_authority_internal(uuid,text,text,text,integer,text,text)'::regprocedure
  ) ilike '%creator-money-source-intent:%paid_content:%'
  and strpos(
    pg_get_functiondef(
      'public.creator_video_paid_precharge_authority_internal(uuid,text,text,text,integer,text,text)'::regprocedure
    ),
    'creator-money-source-intent:'
  ) < strpos(
    pg_get_functiondef(
      'public.creator_video_paid_precharge_authority_internal(uuid,text,text,text,integer,text,text)'::regprocedure
    ),
    'creator-video-commerce:'
  )
  and pg_get_functiondef(
    'public.creator_video_paid_precharge_authority_internal(uuid,text,text,text,integer,text,text)'::regprocedure
  ) ilike '%pending."source_type"=''paid_content''%pending."source_id"=p_video_id%source_purchase_intent_already_pending%',
  '39. Android and iOS Paid Video share one buyer/source lock and reject a cross-store pending intent'
);

select * from finish();
rollback;
