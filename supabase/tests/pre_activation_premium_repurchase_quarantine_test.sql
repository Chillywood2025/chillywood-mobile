begin;
select plan(26);

insert into auth.users(id,is_sso_user,is_anonymous)
values
  ('ae100000-0000-4000-8000-000000000001',false,false),
  ('ae100000-0000-4000-8000-000000000002',false,false),
  ('ae100000-0000-4000-8000-000000000003',false,false),
  ('ae100000-0000-4000-8000-000000000004',false,false)
on conflict(id) do nothing;

update public.platform_money_kill_switches
set state=case
  when key in ('revenuecat_google_play_enabled','revenuecat_app_store_enabled','provider_webhooks_enabled')
    then 'sandbox_only'
  when key in ('live_money_enabled','payouts_enabled','cashout_enabled') then 'off'
  else state
end
where key in (
  'revenuecat_google_play_enabled','revenuecat_app_store_enabled','provider_webhooks_enabled',
  'live_money_enabled','payouts_enabled','cashout_enabled'
);

create function pg_temp.apply_google_premium(
  p_event_id text,
  p_user_id uuid,
  p_original_transaction_id text,
  p_occurred_at timestamptz,
  p_hash text
)
returns jsonb
language sql
volatile
as $$
  select public.process_revenuecat_premium_event_atomic(
    'revenuecat_google_play',p_event_id,'INITIAL_PURCHASE',p_user_id,
    product.provider_product_id,product.provider_base_plan_id,
    'sandbox','active',p_occurred_at-interval '1 minute',p_occurred_at+interval '30 days',
    p_occurred_at,999,'usd',p_hash,
    'NORMAL','google_play','android',null,product.id,p_original_transaction_id
  )
  from public.monetization_products product
  where product.provider='revenuecat_google_play'
    and product.environment='sandbox'
    and product.product_type='premium_subscription'
    and product.status='sandbox'
  order by product.created_at,product.id
  limit 1;
$$;

select lives_ok(
  $$select public.quarantine_revenuecat_terminal_authority(
    'revenuecat_google_play','repurchase-transfer-quarantine','TRANSFER',
    'ae100000-0000-4000-8000-000000000001','sandbox',repeat('1',64),
    'terminal_identity_invalid:transfer_store_identity_missing_or_unsupported'
  )$$,
  'an exact subject/provider/environment unsupported-store TRANSFER remains quarantined'
);
select ok(
  public.revenuecat_authority_quarantined_internal(
    'revenuecat_google_play','ae100000-0000-4000-8000-000000000001','sandbox'
  ),
  'the ambiguous transfer generation is fail-closed before a newer exact purchase'
);
select is(
  pg_temp.apply_google_premium(
    'repurchase-new-initial','ae100000-0000-4000-8000-000000000001',
    'repurchase-new-original',clock_timestamp(),repeat('2',64)
  )->>'status',
  'processed',
  'a genuinely newer exact Google Play initial purchase establishes a new Premium generation'
);
select ok(
  public.premium_subject_has_finite_authority_internal(
    'ae100000-0000-4000-8000-000000000001'
  ),
  'the exact newly processed Premium generation is authoritative'
);
select is(
  (select status from public.user_entitlements
   where user_id='ae100000-0000-4000-8000-000000000001'
     and entitlement_key='premium'),
  'active',
  'the authoritative backend Premium projection is active'
);
select ok(
  public.revenuecat_authority_quarantined_internal(
    'revenuecat_google_play','ae100000-0000-4000-8000-000000000001','sandbox'
  ),
  'the general RevenueCat quarantine remains for unrelated product authority'
);
select is(
  (select count(*)::integer
   from public.revenuecat_terminal_authority_quarantine_resolutions resolution
   join public.revenuecat_terminal_authority_quarantines quarantine
     on quarantine.id=resolution.quarantine_id
   where quarantine.user_id='ae100000-0000-4000-8000-000000000001'),
  0,
  'Premium generation repair does not falsely resolve the ambiguous transfer for every domain'
);
select is(
  (select metadata->>'premium_fresh_authority_after_transfer_quarantine'
   from public.provider_events where provider_event_id='repurchase-new-initial'),
  'true',
  'the immutable provider event records the narrow Premium-generation decision'
);
select is(
  (select payable_state from public.money_access_ledger_events ledger
   join public.provider_events event on event.id=ledger.provider_event_id
   where event.provider_event_id='repurchase-new-initial'),
  'not_payable',
  'the sandbox Premium repurchase creates no payable balance'
);
select is(
  (select count(*)::integer from public.user_entitlements
   where user_id='ae100000-0000-4000-8000-000000000002'
     and entitlement_key='premium'),
  0,
  'an unrelated user receives no Premium authority'
);

select lives_ok(
  $$select public.quarantine_revenuecat_terminal_authority(
    'revenuecat_google_play','stale-transfer-quarantine','TRANSFER',
    'ae100000-0000-4000-8000-000000000002','sandbox',repeat('3',64),
    'terminal_identity_invalid:transfer_store_identity_missing_or_unsupported'
  )$$,
  'the stale-event subject quarantine is established'
);
select is(
  pg_temp.apply_google_premium(
    'repurchase-stale-initial','ae100000-0000-4000-8000-000000000002',
    'repurchase-stale-original',timezone('utc'::text,now())-interval '1 hour',repeat('4',64)
  )->>'reason',
  'revenuecat_terminal_authority_quarantined',
  'an initial purchase older than the quarantine cannot reopen authority'
);
select ok(
  not public.premium_subject_has_finite_authority_internal(
    'ae100000-0000-4000-8000-000000000002'
  ),
  'the stale candidate creates no Premium authority'
);

select lives_ok(
  $$select public.quarantine_revenuecat_terminal_authority(
    'revenuecat_google_play','other-reason-quarantine','TRANSFER',
    'ae100000-0000-4000-8000-000000000003','sandbox',repeat('5',64),
    'terminal_identity_invalid:transfer_target_identity_missing_or_ambiguous'
  )$$,
  'a different transfer-identity defect remains independently quarantined'
);
select is(
  pg_temp.apply_google_premium(
    'repurchase-other-reason','ae100000-0000-4000-8000-000000000003',
    'repurchase-other-original',clock_timestamp(),repeat('6',64)
  )->>'reason',
  'revenuecat_terminal_authority_quarantined',
  'the narrow exception does not bypass another transfer-identity defect'
);

select ok(
  not public.revenuecat_premium_fresh_authority_allowed_internal(
    'revenuecat_google_play','ae100000-0000-4000-8000-000000000001','production',
    'production-remains-closed','INITIAL_PURCHASE',clock_timestamp()
  ),
  'the pre-activation successor cannot weaken a production quarantine'
);

select lives_ok(
  $$select public.quarantine_revenuecat_terminal_authority(
    'revenuecat_app_store','reconciliation-transfer-quarantine','TRANSFER',
    'ae100000-0000-4000-8000-000000000004','sandbox',repeat('7',64),
    'terminal_identity_invalid:transfer_store_identity_missing_or_unsupported'
  )$$,
  'the App Store current-customer reconciliation subject starts quarantined'
);
select is(
  (select public.reconcile_revenuecat_premium_snapshot_atomic(
    'repurchase-reconciliation-snapshot','ae100000-0000-4000-8000-000000000004',
    'repurchase-reconciliation-subscription','repurchase-reconciliation-original',
    mapping.provider_product_id,'active',clock_timestamp()-interval '1 day',
    clock_timestamp()+interval '29 days',clock_timestamp(),repeat('8',64)
  )->>'status'
  from public.monetization_product_store_mappings mapping
  where mapping.provider='revenuecat_app_store'
    and mapping.environment='sandbox'
    and mapping.concept='premium'
  order by mapping.created_at,mapping.id
  limit 1),
  'processed',
  'an exact newer App Store current-customer snapshot can establish its Premium generation'
);
select ok(
  public.premium_subject_has_finite_authority_internal(
    'ae100000-0000-4000-8000-000000000004'
  ),
  'the reconciled App Store subject has exact authoritative Premium'
);
select is(
  (select metadata->>'premium_fresh_authority_after_transfer_quarantine'
   from public.provider_events
   where provider_event_id='repurchase-reconciliation-snapshot'),
  'true',
  'the reconciliation event records the narrow Premium-generation decision'
);

select ok(
  to_regprocedure('public.lock_revenuecat_premium_quarantine_scopes_internal(text,uuid,text)') is not null,
  'the Premium projector has a canonical covering-scope serialization helper'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.lock_revenuecat_premium_quarantine_scopes_internal(text,uuid,text)',
    'EXECUTE'
  ),
  'authenticated callers cannot acquire or steer internal provider scope locks'
);
select is(
  (select tgenabled::text
   from pg_trigger
   where tgrelid='public.revenuecat_terminal_authority_quarantines'::regclass
     and tgname='serialize_revenuecat_terminal_quarantine_insert'
     and not tgisinternal),
  'O',
  'every new terminal quarantine takes its exclusive covering-scope lock'
);
select ok(
  pg_get_functiondef(
    'public.process_revenuecat_premium_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)'::regprocedure
  ) like '%lock_revenuecat_premium_quarantine_scopes_internal%',
  'INITIAL_PURCHASE takes shared covering-scope locks before quarantine readback'
);
select ok(
  pg_get_functiondef(
    'public.reconcile_revenuecat_premium_snapshot_atomic(text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text)'::regprocedure
  ) like '%lock_revenuecat_premium_quarantine_scopes_internal%',
  'current-customer reconciliation takes the same shared covering-scope locks'
);
select ok(
  pg_get_functiondef(
    'public.serialize_revenuecat_terminal_quarantine_insert_internal()'::regprocedure
  ) like '%pg_advisory_xact_lock%'
  and pg_get_functiondef(
    'public.serialize_revenuecat_terminal_quarantine_insert_internal()'::regprocedure
  ) like '%revenuecat-terminal-scope:%',
  'the quarantine insert uses an exclusive advisory lock in the identical key namespace'
);

select * from finish();
rollback;
