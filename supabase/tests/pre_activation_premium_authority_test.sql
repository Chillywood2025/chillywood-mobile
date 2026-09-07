begin;
select plan(16);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('ad100000-0000-4000-8000-000000000001', false, false),
  ('ad100000-0000-4000-8000-000000000002', false, false)
on conflict (id) do nothing;

update public.platform_money_kill_switches
set state = case
  when key in ('revenuecat_app_store_enabled', 'provider_webhooks_enabled') then 'sandbox_only'
  when key in ('live_money_enabled', 'payouts_enabled', 'cashout_enabled') then 'off'
  else state
end
where key in (
  'revenuecat_app_store_enabled', 'provider_webhooks_enabled',
  'live_money_enabled', 'payouts_enabled', 'cashout_enabled'
);

create function pg_temp.reconcile_premium(
  p_snapshot_id text,
  p_user_id uuid,
  p_original_transaction_id text,
  p_product_id text default 'com.chillywood.premium.monthly',
  p_starts_at timestamptz default timezone('utc'::text, now()) - interval '1 day',
  p_expires_at timestamptz default timezone('utc'::text, now()) + interval '29 days'
)
returns jsonb
language sql
volatile
as $$
  select public.reconcile_revenuecat_premium_snapshot_atomic(
    p_snapshot_id,
    p_user_id,
    'rc-subscription-sandbox-one',
    p_original_transaction_id,
    p_product_id,
    'active',
    p_starts_at,
    p_expires_at,
    timezone('utc'::text, now()),
    repeat('a', 64)
  );
$$;

select is(
  has_function_privilege('anon',
    'public.reconcile_revenuecat_premium_snapshot_atomic(text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text)',
    'EXECUTE'),
  false,
  'anonymous callers cannot execute Premium provider reconciliation'
);
select is(
  has_function_privilege('authenticated',
    'public.reconcile_revenuecat_premium_snapshot_atomic(text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text)',
    'EXECUTE'),
  false,
  'authenticated clients cannot execute the service projector directly'
);
select is(
  has_function_privilege('service_role',
    'public.reconcile_revenuecat_premium_snapshot_atomic(text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text)',
    'EXECUTE'),
  true,
  'only the service reconciler can execute the projector'
);

select is(
  pg_temp.reconcile_premium(
    'rc-v2-sub-one-period-one',
    'ad100000-0000-4000-8000-000000000001',
    'apple-original-one'
  )->>'status',
  'processed',
  'an exact active App Store sandbox current-customer snapshot is processed'
);
select ok(
  public.premium_subject_has_finite_authority_internal(
    'ad100000-0000-4000-8000-000000000001'
  ),
  'the authenticated subject has complete finite Premium authority after reconciliation'
);
select is(
  (select status from public.user_entitlements
   where user_id = 'ad100000-0000-4000-8000-000000000001' and entitlement_key = 'premium'),
  'active',
  'the authoritative Premium projection is active'
);
select is(
  (select event_type from public.provider_events
   where provider = 'revenuecat_app_store' and provider_event_id = 'rc-v2-sub-one-period-one'),
  'RECONCILIATION',
  'provider evidence is typed as reconciliation rather than a fabricated purchase'
);
select is(
  (select metadata->>'provider_transaction_created' from public.provider_events
   where provider = 'revenuecat_app_store' and provider_event_id = 'rc-v2-sub-one-period-one'),
  'false',
  'reconciliation explicitly records that no provider transaction was created'
);
select is(
  (select amount_minor from public.money_access_ledger_events ledger
   join public.provider_events event on event.id = ledger.provider_event_id
   where event.provider_event_id = 'rc-v2-sub-one-period-one'),
  0,
  'reconciliation creates no charge amount'
);
select is(
  (select payable_state from public.money_access_ledger_events ledger
   join public.provider_events event on event.id = ledger.provider_event_id
   where event.provider_event_id = 'rc-v2-sub-one-period-one'),
  'not_payable',
  'reconciliation cannot create payable authority'
);
select is(
  pg_temp.reconcile_premium(
    'rc-v2-sub-one-period-one',
    'ad100000-0000-4000-8000-000000000001',
    'apple-original-one'
  )->>'status',
  'duplicate_ignored',
  'the exact reconciliation snapshot is idempotent'
);
select throws_ok(
  $$select pg_temp.reconcile_premium(
    'rc-v2-sub-two-cross-user',
    'ad100000-0000-4000-8000-000000000002',
    'apple-original-one'
  )$$,
  'premium_reconciliation_cross_user_transaction',
  'the same Apple original transaction cannot move to another user through reconciliation'
);
select is(
  (select count(*)::integer from public.user_entitlements
   where user_id = 'ad100000-0000-4000-8000-000000000002' and entitlement_key = 'premium'),
  0,
  'the unrelated user receives no Premium projection'
);
select throws_ok(
  $$select pg_temp.reconcile_premium(
    'rc-v2-sub-one-conflict',
    'ad100000-0000-4000-8000-000000000001',
    'apple-original-two'
  )$$,
  'premium_reconciliation_conflicting_active_authority',
  'a second Apple original transaction cannot replace current finite authority'
);
select throws_ok(
  $$select pg_temp.reconcile_premium(
    'rc-v2-sub-one-invalid-product',
    'ad100000-0000-4000-8000-000000000001',
    'apple-original-two',
    'com.example.not-premium'
  )$$,
  'premium_reconciliation_store_mapping_invalid',
  'an unmapped provider product cannot grant Premium'
);
select throws_ok(
  $$select pg_temp.reconcile_premium(
    'rc-v2-sub-one-expired',
    'ad100000-0000-4000-8000-000000000001',
    'apple-original-two',
    'com.chillywood.premium.monthly',
    timezone('utc'::text, now()) - interval '31 days',
    timezone('utc'::text, now()) - interval '1 day'
  )$$,
  'premium_reconciliation_period_invalid',
  'an expired provider snapshot fails closed'
);

select * from finish();
rollback;
