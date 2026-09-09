begin;
select plan(68);
insert into auth.users(id,is_sso_user,is_anonymous) values
  ('af200000-0000-4000-8000-000000000001',false,false), ('af200000-0000-4000-8000-000000000002',false,false), ('af200000-0000-4000-8000-000000000003',false,false),
  ('af200000-0000-4000-8000-000000000004',false,false), ('af200000-0000-4000-8000-000000000005',false,false) on conflict(id) do nothing;
update public.platform_money_kill_switches set state=case when key in ('revenuecat_google_play_enabled','revenuecat_app_store_enabled','provider_webhooks_enabled')
    then 'sandbox_only' when key in ('live_money_enabled','payouts_enabled','cashout_enabled') then 'off' else state
end where key in ( 'revenuecat_google_play_enabled','revenuecat_app_store_enabled','provider_webhooks_enabled', 'live_money_enabled','payouts_enabled','cashout_enabled' );
create function pg_temp.apply_google_premium_lifecycle( p_event_id text, p_event_type text, p_user_id uuid, p_original_transaction_id text, p_entitlement_status text,
  p_starts_at timestamptz, p_expires_at timestamptz, p_occurred_at timestamptz, p_hash text )
returns jsonb
language sql
volatile
as $$
  select public.process_revenuecat_premium_event_atomic( 'revenuecat_google_play',p_event_id,p_event_type,p_user_id, product.provider_product_id,product.provider_base_plan_id,
    'sandbox',p_entitlement_status,p_starts_at,p_expires_at,p_occurred_at, 999,'usd',p_hash,'NORMAL','google_play','android',null,product.id, p_original_transaction_id )
  from public.monetization_products product
  where product.provider='revenuecat_google_play' and product.environment='sandbox' and product.product_type='premium_subscription' and product.status='sandbox'
  order by product.created_at,product.id limit 1;
$$;
select lives_ok(
  $$insert into public.revenuecat_terminal_authority_quarantines( provider_scope,environment_scope,user_id,reported_provider_event_id, event_type,raw_payload_hash,reason,created_at
    ) values ( 'revenuecat_google_play','sandbox','af200000-0000-4000-8000-000000000001', 'generation-lifecycle-quarantine','TRANSFER',repeat('1',64),
      'terminal_identity_invalid:transfer_store_identity_missing_or_unsupported', clock_timestamp()-interval '1 day' )$$,
  'the exact unsupported-store TRANSFER quarantine exists before admission' );
select is( pg_temp.apply_google_premium_lifecycle( 'generation-lifecycle-initial','INITIAL_PURCHASE', 'af200000-0000-4000-8000-000000000001','generation-lifecycle-original',
    'active',clock_timestamp()-interval '13 hours',clock_timestamp()+interval '30 days', clock_timestamp()-interval '12 hours',repeat('2',64) )->>'status', 'processed',
  'a newer exact sandbox initial purchase admits the Premium generation' );
select ok( public.revenuecat_premium_post_quarantine_generation_internal( 'revenuecat_google_play','af200000-0000-4000-8000-000000000001', 'sandbox','generation-lifecycle-original'
  ), 'the immutable first event proves the exact admitted generation' );
select is( pg_temp.apply_google_premium_lifecycle( 'generation-lifecycle-renewal','RENEWAL', 'af200000-0000-4000-8000-000000000001','generation-lifecycle-original',
    'active',clock_timestamp()-interval '7 hours',clock_timestamp()+interval '30 days', clock_timestamp()-interval '6 hours',repeat('3',64) )->>'status', 'processed',
  'the first legitimate renewal continues the exact admitted generation' );
create temporary table duplicate_renewal_result on commit drop as
select pg_temp.apply_google_premium_lifecycle( 'generation-lifecycle-renewal','RENEWAL', 'af200000-0000-4000-8000-000000000001','generation-lifecycle-original',
  'active',clock_timestamp()-interval '7 hours',clock_timestamp()+interval '30 days', clock_timestamp()-interval '6 hours',repeat('3',64) ) result;
select is((select result->>'status' from duplicate_renewal_result),'processed', 'an exact processed renewal retry remains a successful idempotent acknowledgement');
select is((select result->>'duplicateEvent' from duplicate_renewal_result),'true', 'the exact renewal retry is identified as a duplicate without reapplying authority');
select is( (select count(*)::text||':'||(select latest_event_id from public.revenuecat_premium_transaction_authority
    where provider='revenuecat_google_play' and original_transaction_id='generation-lifecycle-original')
   from public.provider_events where provider_event_id='generation-lifecycle-renewal'),
  '1:generation-lifecycle-renewal','the duplicate renewal creates no row and preserves the watermark');
select ok( public.premium_subject_has_finite_authority_internal( 'af200000-0000-4000-8000-000000000001' ), 'the backend Premium resolver follows the renewed exact generation' );
select is( (select authority_state from public.revenuecat_premium_transaction_authority
   where provider='revenuecat_google_play' and original_transaction_id='generation-lifecycle-original'), 'active', 'the renewed transaction authority remains active' );
select is( (select latest_event_id from public.revenuecat_premium_transaction_authority
   where provider='revenuecat_google_play' and original_transaction_id='generation-lifecycle-original'), 'generation-lifecycle-renewal',
  'the exact renewal becomes the transaction watermark' );
select is( (select metadata->>'premium_post_quarantine_generation_lifecycle' from public.provider_events where provider_event_id='generation-lifecycle-renewal'), 'true',
  'the immutable renewal records the bounded lifecycle decision' );
select is( (select count(*)::integer from public.user_entitlements where user_id='af200000-0000-4000-8000-000000000002' and entitlement_key='premium'), 0,
  'the renewal grants no authority to an unrelated user' );
select throws_ok(
  $$select pg_temp.apply_google_premium_lifecycle( 'generation-lifecycle-cross-user','RENEWAL', 'af200000-0000-4000-8000-000000000002','generation-lifecycle-original',
    'active',clock_timestamp()-interval '5 hours',clock_timestamp()+interval '30 days', clock_timestamp()-interval '4 hours',repeat('a',64)
  )$$,'revenuecat_premium_original_transaction_subject_mismatch', 'the public lifecycle wrapper rejects a different user for the bound transaction');
select throws_ok(
  $$select pg_temp.apply_google_premium_lifecycle( 'generation-lifecycle-renewal','RENEWAL','af200000-0000-4000-8000-000000000001','generation-lifecycle-original',
    'active',clock_timestamp()-interval '7 hours',clock_timestamp()+interval '30 days',clock_timestamp()-interval '6 hours',repeat('b',64)
  )$$,'revenuecat_premium_event_id_identity_mismatch','a renewal ID cannot be replayed with a different immutable payload hash');
create temporary table duplicate_quarantine_result on commit drop as
select public.quarantine_revenuecat_terminal_authority(
  'revenuecat_google_play','generation-lifecycle-quarantine','TRANSFER','af200000-0000-4000-8000-000000000001','sandbox',repeat('1',64),
  'terminal_identity_invalid:transfer_store_identity_missing_or_unsupported' ) result;
select is((select (result->>'status')||':'||(result->>'duplicateEvent') from duplicate_quarantine_result),'quarantined:true',
  'an exact historical quarantine replay is acknowledged without a second projection');
select ok(public.premium_subject_has_finite_authority_internal('af200000-0000-4000-8000-000000000001'),
  'the exact quarantine replay cannot revoke the deliberately admitted Premium generation');
select ok((select latest_event_id='generation-lifecycle-renewal' and latest_event_hash=repeat('3',64) and latest_event_rank=public.revenuecat_premium_authority_rank_internal('RENEWAL',false) and authority_state='active'
  from public.revenuecat_premium_transaction_authority where provider='revenuecat_google_play' and original_transaction_id='generation-lifecycle-original') and
  (select count(*)=1 from public.access_grants grant_row join public.provider_events event on event.id=grant_row.provider_event_id where event.provider_event_id='generation-lifecycle-renewal') and
  (select count(*)=1 from public.money_access_ledger_events ledger join public.provider_events event on event.id=ledger.provider_event_id where event.provider_event_id='generation-lifecycle-renewal'),
  'duplicate delivery preserves the complete binding watermark and grant/ledger cardinality');
select ok( public.revenuecat_authority_quarantined_internal( 'revenuecat_google_play','af200000-0000-4000-8000-000000000001','sandbox' ),
  'the general RevenueCat quarantine remains preserved after renewal' );
select is( pg_temp.apply_google_premium_lifecycle( 'generation-lifecycle-uncancellation','UNCANCELLATION', 'af200000-0000-4000-8000-000000000001','generation-lifecycle-original',
    'active',clock_timestamp()-interval '6 hours',clock_timestamp()+interval '30 days', clock_timestamp()-interval '5 hours',repeat('f',64)
  )->>'status','processed','uncancellation continues the exact admitted generation');
create temporary table expiration_result on commit drop as
select pg_temp.apply_google_premium_lifecycle( 'generation-lifecycle-expiration','EXPIRATION', 'af200000-0000-4000-8000-000000000001','generation-lifecycle-original',
    'expired',clock_timestamp()-interval '31 days',clock_timestamp()-interval '1 hour', clock_timestamp()-interval '1 hour',repeat('4',64) ) result;
select is( (select result->>'status' from expiration_result), 'processed', 'a provider-signed expiration still terminates the exact generation' );
select ok( not public.premium_subject_has_finite_authority_internal( 'af200000-0000-4000-8000-000000000001' ), 'the expired generation no longer resolves as Premium' );
select is( pg_temp.apply_google_premium_lifecycle( 'generation-lifecycle-after-expiration','RENEWAL', 'af200000-0000-4000-8000-000000000001','generation-lifecycle-original',
    'active',clock_timestamp()-interval '30 minutes',clock_timestamp()+interval '30 days', clock_timestamp(),repeat('5',64) )->>'reason',
  'revenuecat_terminal_authority_quarantined', 'a renewal cannot reopen a terminal generation through the lifecycle exception' );
create temporary table expired_renewal_replay_result on commit drop as
select pg_temp.apply_google_premium_lifecycle( 'generation-lifecycle-renewal','RENEWAL','af200000-0000-4000-8000-000000000001','generation-lifecycle-original',
  'active',clock_timestamp()-interval '7 hours',clock_timestamp()+interval '30 days',clock_timestamp()-interval '6 hours',repeat('3',64) ) result;
select is((select (result->>'duplicateEvent')||':'||(result->>'entitlementActive') from expired_renewal_replay_result),'true:false',
  'an exact old renewal replay after expiration is idempotent and cannot resurrect Premium');
select is((select latest_event_id||':'||authority_state from public.revenuecat_premium_transaction_authority
  where provider='revenuecat_google_play' and original_transaction_id='generation-lifecycle-original'),'generation-lifecycle-after-expiration:blocked',
  'the post-expiration replay cannot regress the terminal binding');
select lives_ok(
  $$select public.quarantine_revenuecat_terminal_authority( 'revenuecat_google_play','recoverable-generation-quarantine','TRANSFER',
    'af200000-0000-4000-8000-000000000003','sandbox',repeat('6',64), 'terminal_identity_invalid:transfer_store_identity_missing_or_unsupported' )$$,
  'a second exact subject starts with the same narrow quarantine' );
select is( pg_temp.apply_google_premium_lifecycle( 'recoverable-generation-initial','INITIAL_PURCHASE', 'af200000-0000-4000-8000-000000000003','recoverable-generation-original',
    'active',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 days', clock_timestamp(),repeat('7',64) )->>'status', 'processed',
  'the recovery fixture starts from a real admitted Premium generation' );
do $$
declare
  v_product public.monetization_products%rowtype;
  v_binding_id uuid;
  v_event public.provider_events%rowtype;
begin
  select product.* into strict v_product from public.monetization_products product
  where product.provider='revenuecat_google_play' and product.environment='sandbox' and product.product_type='premium_subscription' and product.status='sandbox'
  order by product.created_at,product.id limit 1;
  select authority.id into strict v_binding_id from public.revenuecat_premium_transaction_authority authority
  where authority.provider='revenuecat_google_play' and authority.original_transaction_id='recoverable-generation-original';
  perform public.record_revenuecat_premium_ignored_internal( 'revenuecat_google_play','recoverable-generation-rejected-renewal','RENEWAL',
    'af200000-0000-4000-8000-000000000003',v_product.provider_product_id, v_product.provider_base_plan_id,'sandbox',clock_timestamp(),repeat('8',64),v_product.id,
    'revenuecat_terminal_authority_quarantined',false );
  update public.provider_events event set metadata=coalesce(event.metadata,'{}'::jsonb)||jsonb_build_object( 'original_transaction_id','recoverable-generation-original',
    'premium_transaction_binding_id',v_binding_id, 'authority_granted',false,'money_action',false ) where event.provider_event_id='recoverable-generation-rejected-renewal'
  returning event.* into strict v_event;
  update public.revenuecat_premium_transaction_authority authority set latest_event_id=v_event.provider_event_id, latest_event_hash=v_event.raw_payload_hash,
      latest_event_type='RENEWAL',latest_occurred_at=v_event.occurred_at, latest_event_rank=public.revenuecat_premium_authority_rank_internal('RENEWAL',false),
      authority_state='blocked',updated_at=clock_timestamp() where authority.id=v_binding_id;
  if not found then raise exception 'recovery_fixture_binding_missing'; end if;
end;
$$;
select pass('the test reproduces the exact immutable state left by the deployed blind spot');
select ok( public.revenuecat_premium_quarantine_bug_recoverable_internal( 'revenuecat_google_play','af200000-0000-4000-8000-000000000003',
    'sandbox','recoverable-generation-original' ), 'only the known ignored-renewal sequence is recoverable' );
select is( pg_temp.apply_google_premium_lifecycle( 'recoverable-generation-renewal','RENEWAL', 'af200000-0000-4000-8000-000000000003','recoverable-generation-original',
    'active',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 days', clock_timestamp(),repeat('9',64) )->>'status', 'processed',
  'a newer legitimate renewal repairs the exact bug-blocked sandbox generation' );
select ok( public.premium_subject_has_finite_authority_internal( 'af200000-0000-4000-8000-000000000003' ), 'the recovered exact generation projects authoritative Premium' );
select ok( not public.revenuecat_premium_quarantine_bug_recoverable_internal( 'revenuecat_google_play','af200000-0000-4000-8000-000000000003',
    'sandbox','recoverable-generation-original' ), 'an active generation is no longer classified as bug-blocked recovery' );
insert into public.monetization_products( id,product_key,product_type,display_name,provider,provider_product_id,
  provider_base_plan_id,revenuecat_entitlement,environment,status,is_android_digital,metadata ) values ( 'af210000-0000-4000-8000-000000000001','test_premium_product_change',
  'premium_subscription','Test Premium Product Change','revenuecat_google_play', 'test.premium.changed','test-base-plan','premium','sandbox','sandbox',true,
  '{"test_only":true}'::jsonb );
select is( (select public.process_revenuecat_premium_event_atomic( 'revenuecat_google_play','generation-lifecycle-product-change','PRODUCT_CHANGE',
    'af200000-0000-4000-8000-000000000003',product.provider_product_id, product.provider_base_plan_id,'sandbox','active',clock_timestamp()-interval '1 minute',
    clock_timestamp()+interval '30 days',clock_timestamp(),999,'usd',repeat('0',64), 'NORMAL','google_play','android',null,product.id,'recoverable-generation-original'
  )->>'status' from public.monetization_products product where product.id='af210000-0000-4000-8000-000000000001'),
  'processed','product change preserves the admitted generation while changing exact catalog identity');
select is( (select current_provider_product_id||':'||coalesce(product_change_projection_event_id,'clear') from public.revenuecat_premium_transaction_authority
   where provider='revenuecat_google_play' and original_transaction_id='recoverable-generation-original'),
  'test.premium.changed:clear','the product-change marker clears and the new provider product becomes current');
select throws_ok(
  $$select public.process_revenuecat_premium_event_atomic(
    'revenuecat_google_play','generation-lifecycle-product-change-failure','PRODUCT_CHANGE','af200000-0000-4000-8000-000000000003',
    product.provider_product_id,product.provider_base_plan_id,'sandbox','active',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 days',
    clock_timestamp(),999,'usd','invalid-hash','NORMAL','google_play','android',null,product.id,'recoverable-generation-original'
  ) from public.monetization_products product where product.id='af210000-0000-4000-8000-000000000001'$$,
  'revenuecat_premium_transaction_identity_invalid','a failed product-change projection rolls back instead of leaving a marker');
select is((select product_change_projection_event_id from public.revenuecat_premium_transaction_authority
  where provider='revenuecat_google_play' and original_transaction_id='recoverable-generation-original'),null,
  'the transaction-local product-change marker remains clear after the forced failure');
select is( (select count(*)::integer from public.money_access_ledger_events ledger join public.provider_events event on event.id=ledger.provider_event_id
   where event.provider_event_id in ( 'generation-lifecycle-renewal','generation-lifecycle-uncancellation', 'generation-lifecycle-product-change'
   ) and ledger.payable_state<>'not_payable'), 0,'continued sandbox lifecycle authority creates no payable money');
select ok( not public.revenuecat_premium_post_quarantine_generation_internal( 'revenuecat_google_play','af200000-0000-4000-8000-000000000002',
    'sandbox','recoverable-generation-original' ), 'the immutable generation cannot be rebound to another user' );
select lives_ok(
  $$select public.quarantine_revenuecat_terminal_authority( 'revenuecat_google_play','different-reason-generation-quarantine','TRANSFER',
    'af200000-0000-4000-8000-000000000004','sandbox',repeat('a',64), 'terminal_identity_invalid:transfer_target_identity_missing_or_ambiguous' )$$,
  'a different quarantine reason remains independently fail-closed' );
select is( pg_temp.apply_google_premium_lifecycle( 'different-reason-generation-initial','INITIAL_PURCHASE',
    'af200000-0000-4000-8000-000000000004','different-reason-generation-original', 'active',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '30 days',
    clock_timestamp(),repeat('b',64) )->>'reason', 'revenuecat_terminal_authority_quarantined', 'the lifecycle repair cannot admit a different quarantine class' );
select ok( not public.revenuecat_premium_post_quarantine_generation_internal( 'revenuecat_google_play','af200000-0000-4000-8000-000000000004',
    'sandbox','different-reason-generation-original' ), 'no immutable admitted-generation proof exists for another quarantine class' );
select lives_ok(
  $$select public.quarantine_revenuecat_terminal_authority( 'revenuecat_app_store','restore-generation-quarantine','TRANSFER',
    'af200000-0000-4000-8000-000000000005','sandbox',repeat('c',64), 'terminal_identity_invalid:transfer_store_identity_missing_or_unsupported' )$$,
  'the App Store current-customer subject begins with the narrow quarantine' );
select is( (select public.reconcile_revenuecat_premium_snapshot_atomic( 'restore-generation-first','af200000-0000-4000-8000-000000000005',
    'restore-generation-subscription','restore-generation-original', mapping.provider_product_id,'active',clock_timestamp()-interval '2 days',
    clock_timestamp()+interval '29 days',clock_timestamp(),repeat('d',64) )->>'status' from public.monetization_product_store_mappings mapping
  where mapping.provider='revenuecat_app_store' and mapping.environment='sandbox' and mapping.concept='premium' and mapping.provider_product_id='com.chillywood.premium.monthly'),
  'processed', 'an exact current-customer snapshot admits the App Store Premium generation' );
select is( (select public.reconcile_revenuecat_premium_snapshot_atomic( 'restore-generation-second','af200000-0000-4000-8000-000000000005',
    'restore-generation-subscription','restore-generation-original', mapping.provider_product_id,'active',clock_timestamp()-interval '1 day',
    clock_timestamp()+interval '29 days',clock_timestamp(),repeat('e',64) )->>'status' from public.monetization_product_store_mappings mapping
  where mapping.provider='revenuecat_app_store' and mapping.environment='sandbox' and mapping.concept='premium' and mapping.provider_product_id='com.chillywood.premium.monthly'),
  'processed', 'a later exact Restore snapshot continues the already-admitted App Store generation' );
create temporary table duplicate_restore_result on commit drop as
select public.reconcile_revenuecat_premium_snapshot_atomic( 'restore-generation-second','af200000-0000-4000-8000-000000000005',
  'restore-generation-subscription','restore-generation-original', mapping.provider_product_id,'active',clock_timestamp()-interval '1 day',
  clock_timestamp()+interval '29 days',clock_timestamp(),repeat('e',64) ) result from public.monetization_product_store_mappings mapping
where mapping.provider='revenuecat_app_store' and mapping.environment='sandbox' and mapping.concept='premium' and mapping.provider_product_id='com.chillywood.premium.monthly';
select is((select result->>'status' from duplicate_restore_result),'duplicate_ignored', 'an exact Restore retry acknowledges the previously processed snapshot');
select is( (select (result->>'duplicateEvent')||':'||(result->>'entitlementActive')
   from duplicate_restore_result),'true:true','the Restore retry is idempotent and retains Premium');
select is( (select count(*)::text||':'||(select latest_event_id from public.revenuecat_premium_transaction_authority
    where provider='revenuecat_app_store' and original_transaction_id='restore-generation-original')
   from public.provider_events where provider_event_id='restore-generation-second'),
  '1:restore-generation-second','the duplicate Restore creates no row and preserves the watermark');
select is( (select public.process_revenuecat_premium_event_atomic(
    'revenuecat_app_store','restore-generation-product-change','PRODUCT_CHANGE','af200000-0000-4000-8000-000000000005',mapping.provider_product_id,null,
    'sandbox','active',clock_timestamp()-interval '30 minutes',clock_timestamp()+interval '365 days',clock_timestamp()-interval '10 minutes',4999,'usd',repeat('4',64),
    'NORMAL','app_store','ios',mapping.id,mapping.product_id,'restore-generation-original' )->>'status' from public.monetization_product_store_mappings mapping
  where mapping.provider='revenuecat_app_store' and mapping.environment='sandbox' and mapping.concept='premium' and mapping.provider_product_id='com.chillywood.premium.yearly'),
  'processed','a legitimate App Store Premium product change becomes the current bound generation');
select is((select current_provider_product_id||':'||latest_event_id||':'||coalesce(product_change_projection_event_id,'clear')
  from public.revenuecat_premium_transaction_authority where provider='revenuecat_app_store' and original_transaction_id='restore-generation-original'),
  'com.chillywood.premium.yearly:restore-generation-product-change:clear','the App Store binding records the changed product and clears its marker');
create temporary table historical_restore_duplicate_result on commit drop as
select public.reconcile_revenuecat_premium_snapshot_atomic(
  'restore-generation-second','af200000-0000-4000-8000-000000000005','restore-generation-subscription','restore-generation-original',
  mapping.provider_product_id,'active',clock_timestamp()-interval '1 day',clock_timestamp()+interval '29 days',clock_timestamp(),repeat('e',64)
) result from public.monetization_product_store_mappings mapping where mapping.provider='revenuecat_app_store' and mapping.environment='sandbox' and mapping.concept='premium'
  and mapping.provider_product_id='com.chillywood.premium.monthly';
select is((select (result->>'status')||':'||(result->>'entitlementActive') from historical_restore_duplicate_result),'duplicate_ignored:true',
  'an exact historical Restore retry stays idempotent after a legitimate product change');
select is((select latest_event_id from public.revenuecat_premium_transaction_authority
  where provider='revenuecat_app_store' and original_transaction_id='restore-generation-original'),'restore-generation-product-change',
  'the historical Restore duplicate cannot regress the product-change watermark');
select throws_ok(
  $sql$select public.reconcile_revenuecat_premium_snapshot_atomic(
    'restore-generation-second','af200000-0000-4000-8000-000000000005','restore-generation-subscription','restore-generation-original',
    mapping.provider_product_id,'active',clock_timestamp()-interval '1 day',clock_timestamp()+interval '29 days',clock_timestamp(),repeat('6',64)
  ) from public.monetization_product_store_mappings mapping where mapping.provider='revenuecat_app_store' and mapping.environment='sandbox'
    and mapping.concept='premium' and mapping.provider_product_id='com.chillywood.premium.monthly'$sql$,
  'premium_reconciliation_duplicate_identity_mismatch','an old-SKU Restore ID cannot be replayed after product change with a different immutable payload hash');
select ok((select current_provider_product_id='com.chillywood.premium.yearly' and latest_event_id='restore-generation-product-change' and latest_event_hash=repeat('4',64)
    and authority_state='active' from public.revenuecat_premium_transaction_authority where provider='revenuecat_app_store'
      and original_transaction_id='restore-generation-original') and
  (select count(*)=1 from public.provider_events where provider_event_id='restore-generation-second') and
  (select count(*)=1 from public.access_grants grant_row join public.provider_events event on event.id=grant_row.provider_event_id
    where event.provider_event_id='restore-generation-product-change') and
  (select count(*)=1 from public.money_access_ledger_events ledger join public.provider_events event on event.id=ledger.provider_event_id
    where event.provider_event_id='restore-generation-product-change'),
  'the changed-hash Restore rejection preserves the product-change watermark and grant/ledger cardinality');
create temporary table stale_restore_result on commit drop as
select public.reconcile_revenuecat_premium_snapshot_atomic( 'restore-generation-stale','af200000-0000-4000-8000-000000000005',
  'restore-generation-subscription','restore-generation-original', mapping.provider_product_id,'active',clock_timestamp()-interval '3 days',
  clock_timestamp()+interval '28 days',clock_timestamp(),repeat('1',64) ) result from public.monetization_product_store_mappings mapping
where mapping.provider='revenuecat_app_store' and mapping.environment='sandbox' and mapping.concept='premium' and mapping.provider_product_id='com.chillywood.premium.monthly';
select is((select result->>'reason' from stale_restore_result), 'premium_reconciliation_snapshot_stale','an unseen older Restore snapshot is ignored by authority ordering');
select is( (select (result->>'duplicateEvent')||':'||(result->>'entitlementActive')
   from stale_restore_result),'true:true','the stale Restore is a no-op while current Premium remains active');
select is( (select count(*)::text||':'||(select latest_event_id from public.revenuecat_premium_transaction_authority
    where provider='revenuecat_app_store' and original_transaction_id='restore-generation-original')
   from public.provider_events where provider_event_id='restore-generation-stale'),
  '0:restore-generation-product-change','the stale pre-change Restore creates no event and cannot regress the watermark');
select is((select current_provider_product_id||':'||latest_event_hash from public.revenuecat_premium_transaction_authority
  where provider='revenuecat_app_store' and original_transaction_id='restore-generation-original'),
  'com.chillywood.premium.yearly:'||repeat('4',64),'the stale pre-change Restore preserves the current product and immutable event hash');
select ok( public.premium_subject_has_finite_authority_internal( 'af200000-0000-4000-8000-000000000005' ), 'the repeated exact Restore snapshot retains authoritative Premium' );
select is( (select metadata->>'premium_post_quarantine_generation_lifecycle' from public.provider_events where provider_event_id='restore-generation-second'), 'true',
  'the repeated Restore records the bounded generation-lifecycle decision' );
create temporary table restore_revocation_result on commit drop as
select public.process_revenuecat_premium_event_atomic( 'revenuecat_app_store','restore-generation-revocation','REVOCATION',
    'af200000-0000-4000-8000-000000000005',mapping.provider_product_id,null, 'sandbox','revoked',clock_timestamp()-interval '1 day',
    clock_timestamp()+interval '29 days',clock_timestamp(),0,'usd',repeat('2',64), 'NORMAL','app_store','ios',mapping.id,mapping.product_id,'restore-generation-original'
  ) result from public.monetization_product_store_mappings mapping where mapping.provider='revenuecat_app_store' and mapping.environment='sandbox' and mapping.concept='premium'
    and mapping.provider_product_id='com.chillywood.premium.yearly';
select is((select result->>'status' from restore_revocation_result),'reversed','a provider-signed revocation terminates the restored generation');
select ok(not public.premium_subject_has_finite_authority_internal( 'af200000-0000-4000-8000-000000000005'),
  'revocation removes authoritative Premium for the restored generation');
select is( (select public.reconcile_revenuecat_premium_snapshot_atomic(
    'restore-generation-second','af200000-0000-4000-8000-000000000005','restore-generation-subscription','restore-generation-original',
    mapping.provider_product_id,'active',clock_timestamp()-interval '1 day',clock_timestamp()+interval '29 days',clock_timestamp(),repeat('e',64)
  )->>'duplicateEvent'||':'||public.premium_subject_has_finite_authority_internal('af200000-0000-4000-8000-000000000005')::text
  from public.monetization_product_store_mappings mapping where mapping.provider='revenuecat_app_store' and mapping.environment='sandbox'
    and mapping.concept='premium' and mapping.provider_product_id='com.chillywood.premium.monthly'),
  'true:false','an exact historical Restore replay after revocation cannot resurrect Premium');
select throws_ok(
  $sql$select public.reconcile_revenuecat_premium_snapshot_atomic( 'restore-generation-after-revocation','af200000-0000-4000-8000-000000000005',
    'restore-generation-subscription','restore-generation-original', mapping.provider_product_id,'active',clock_timestamp(),clock_timestamp()+interval '30 days',
    clock_timestamp(),repeat('3',64) ) from public.monetization_product_store_mappings mapping
  where mapping.provider='revenuecat_app_store' and mapping.environment='sandbox' and mapping.concept='premium' order by mapping.created_at,mapping.id limit 1$sql$,
  'premium_reconciliation_subject_restricted', 'Restore cannot resurrect a provider-revoked post-quarantine generation');
select ok( not has_function_privilege( 'authenticated', 'public.revenuecat_premium_post_quarantine_generation_internal(text,uuid,text,text)', 'EXECUTE' ),
  'authenticated callers cannot invoke the generation classifier' );
select ok( not has_function_privilege( 'authenticated', 'public.revenuecat_premium_quarantine_bug_recoverable_internal(text,uuid,text,text)', 'EXECUTE' ),
  'authenticated callers cannot invoke the legacy-block recovery classifier' );
select ok( not has_function_privilege( 'service_role',
    'public.process_revenuecat_premium_event_atomic_pre_gen_lifecycle(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)',
    'EXECUTE' ), 'the prior Premium projector implementation is not directly service-callable' );
select ok( has_function_privilege( 'service_role',
    'public.process_revenuecat_premium_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)',
    'EXECUTE' ), 'only the final Premium lifecycle wrapper remains service-callable' );
select ok( not has_table_privilege('authenticated', 'public.revenuecat_premium_transaction_authority','UPDATE'),
  'authenticated callers cannot mutate the transaction-local product-change marker' );
select ok( not has_function_privilege( 'service_role',
    'public.reconcile_revenuecat_premium_snapshot_pre_generation_lifecycle(text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text)', 'EXECUTE' ),
  'the prior reconciliation implementation is not directly service-callable' );
select * from finish();
rollback;
