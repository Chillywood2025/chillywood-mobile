begin;
select plan(38);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('ae300000-0000-4000-8000-000000000001', false, false),
  ('ae300000-0000-4000-8000-000000000002', false, false),
  ('ae300000-0000-4000-8000-000000000003', false, false),
  ('ae300000-0000-4000-8000-000000000004', false, false),
  ('ae300000-0000-4000-8000-000000000005', false, false),
  ('ae300000-0000-4000-8000-000000000006', false, false)
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

create function pg_temp.reconcile_current_owner(
  p_snapshot_id text,
  p_user_id uuid,
  p_original_customer_id text,
  p_original_transaction_id text,
  p_payload_hash text default repeat('c', 64)
)
returns jsonb
language sql
volatile
as $$
  select public.reconcile_revenuecat_premium_current_owner_snapshot_atomic(
    p_snapshot_id,
    p_user_id,
    p_original_customer_id,
    'rc-current-owner-subscription',
    p_original_transaction_id,
    'com.chillywood.premium.monthly',
    'active',
    timezone('utc'::text, now()) - interval '10 minutes',
    timezone('utc'::text, now()) + interval '30 days',
    timezone('utc'::text, now()),
    p_payload_hash
  );
$$;

select is(
  has_function_privilege(
    'anon',
    'public.reconcile_revenuecat_premium_current_owner_snapshot_atomic(text,uuid,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text)',
    'EXECUTE'
  ),
  false,
  'anonymous callers cannot invoke current-owner reconciliation'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.reconcile_revenuecat_premium_current_owner_snapshot_atomic(text,uuid,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text)',
    'EXECUTE'
  ),
  false,
  'authenticated clients cannot invoke current-owner reconciliation'
);
select is(
  has_function_privilege(
    'service_role',
    'public.reconcile_revenuecat_premium_current_owner_snapshot_atomic(text,uuid,text,text,text,text,text,timestamptz,timestamptz,timestamptz,text)',
    'EXECUTE'
  ),
  true,
  'only the provider reconciler can invoke current-owner reconciliation'
);
select is(
  has_function_privilege(
    'anon',
    'public.lock_revenuecat_premium_owner_users_internal(uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'anonymous callers cannot acquire internal Premium owner locks'
);
select is(
  has_function_privilege(
    'authenticated',
    'public.lock_revenuecat_premium_owner_users_internal(uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'authenticated callers cannot acquire internal Premium owner locks'
);
select is(
  has_function_privilege(
    'service_role',
    'public.lock_revenuecat_premium_owner_users_internal(uuid,uuid)',
    'EXECUTE'
  ),
  false,
  'the account-lock helper remains internal to security-definer projectors'
);
select is(
  has_function_privilege(
    'service_role',
    'public.process_revenuecat_premium_event_pre_owner_serialization(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)',
    'EXECUTE'
  ),
  false,
  'the pre-serialization provider-event implementation is not service-callable'
);
select is(
  has_function_privilege(
    'service_role',
    'public.reconcile_revenuecat_premium_snapshot_pre_owner_serialization(text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,text)',
    'EXECUTE'
  ),
  false,
  'the pre-serialization snapshot implementation is not service-callable'
);
select is(
  has_function_privilege(
    'service_role',
    'public.process_revenuecat_premium_transfer_pre_owner_serialization(text,uuid,uuid,text,timestamptz,text)',
    'EXECUTE'
  ),
  false,
  'the pre-serialization transfer implementation is not service-callable'
);
select is(
  has_function_privilege(
    'service_role',
    'public.process_revenuecat_premium_transfer_atomic(text,uuid,uuid,text,timestamptz,text)',
    'EXECUTE'
  ),
  true,
  'the serialized signed transfer wrapper remains service-callable'
);

select is(
  pg_temp.reconcile_current_owner(
    'rc-current-owner-same-user',
    'ae300000-0000-4000-8000-000000000006',
    'ae300000-0000-4000-8000-000000000006',
    'apple-current-owner-same-user',
    repeat('1', 64)
  )->>'status',
  'processed',
  'new and same-owner subscriptions retain the existing strict reconciliation path'
);

select is(
  public.reconcile_revenuecat_premium_snapshot_atomic(
    'rc-current-owner-source',
    'ae300000-0000-4000-8000-000000000001',
    'rc-current-owner-subscription',
    'apple-current-owner-transfer',
    'com.chillywood.premium.monthly',
    'active',
    timezone('utc'::text, now()) - interval '2 days',
    timezone('utc'::text, now()) + interval '1 day',
    timezone('utc'::text, now()) - interval '1 day',
    repeat('2', 64)
  )->>'status',
  'processed',
  'the former owner begins with exact provider-backed Premium authority'
);

select throws_ok(
  $$select pg_temp.reconcile_current_owner(
    'rc-current-owner-source-still-active',
    'ae300000-0000-4000-8000-000000000002',
    'ae300000-0000-4000-8000-000000000001',
    'apple-current-owner-transfer',
    repeat('3', 64)
  )$$,
  'premium_current_owner_transfer_source_still_active',
  'current-owner reconciliation cannot replace still-active source authority'
);

update public.user_entitlements
set expires_at = timezone('utc'::text, now()) - interval '1 minute'
where user_id = 'ae300000-0000-4000-8000-000000000001'
  and entitlement_key = 'premium';
update public.access_grants
set expires_at = timezone('utc'::text, now()) - interval '1 minute'
where user_id = 'ae300000-0000-4000-8000-000000000001'
  and grant_type = 'premium';

select throws_ok(
  $$select pg_temp.reconcile_current_owner(
    'rc-current-owner-no-transfer',
    'ae300000-0000-4000-8000-000000000002',
    'ae300000-0000-4000-8000-000000000001',
    'apple-current-owner-transfer',
    repeat('4', 64)
  )$$,
  'premium_current_owner_transfer_evidence_missing',
  'an expired former owner alone cannot authorize a cross-user move'
);

insert into public.provider_events (
  provider_event_id, provider, product_id, product_key, user_id, app_user_id,
  environment, event_type, status, occurred_at, idempotency_key,
  raw_payload_hash, metadata
) values (
  'rc-current-owner-transfer-one', 'revenuecat_app_store', null, null,
  'ae300000-0000-4000-8000-000000000002',
  'ae300000-0000-4000-8000-000000000002',
  'sandbox', 'TRANSFER', 'ignored', timezone('utc'::text, now()) - interval '1 minute',
  'TRANSFER:rc-current-owner-transfer-one', repeat('5', 64),
  jsonb_build_object(
    'source_user_id', 'ae300000-0000-4000-8000-000000000001',
    'target_user_id', 'ae300000-0000-4000-8000-000000000002',
    'reported_occurred_at', timezone('utc'::text, now()) - interval '1 minute',
    'transfer_time_valid', true,
    'transfer_applied', false,
    'final_reason', 'premium_transfer_source_transaction_authority_missing',
    'provider_payload_stored', false,
    'money_action', false
  )
);

select throws_ok(
  $$select pg_temp.reconcile_current_owner(
    'rc-current-owner-wrong-target',
    'ae300000-0000-4000-8000-000000000003',
    'ae300000-0000-4000-8000-000000000001',
    'apple-current-owner-transfer',
    repeat('6', 64)
  )$$,
  'premium_current_owner_transfer_evidence_missing',
  'the signed transfer cannot grant an unrelated target'
);

create temporary table current_owner_result as
select pg_temp.reconcile_current_owner(
  'rc-current-owner-target',
  'ae300000-0000-4000-8000-000000000002',
  'ae300000-0000-4000-8000-000000000001',
  'apple-current-owner-transfer',
  repeat('7', 64)
) as value;

select is((select value->>'status' from current_owner_result), 'processed',
  'verified current-owner reconciliation is processed');
select is((select value->>'currentOwnerTransfer' from current_owner_result), 'true',
  'the result records the bounded current-owner transfer class');
select is((select value->>'sourceRevoked' from current_owner_result), 'true',
  'the former owner is revoked atomically');
select is((select value->>'targetActive' from current_owner_result), 'true',
  'the exact authenticated provider customer becomes active atomically');
select is(
  public.premium_subject_has_finite_authority_internal(
    'ae300000-0000-4000-8000-000000000001'
  ),
  false,
  'the former user retains no finite Premium authority'
);
select is(
  public.premium_subject_has_finite_authority_internal(
    'ae300000-0000-4000-8000-000000000002'
  ),
  true,
  'the exact target has complete finite Premium authority'
);
select is(
  (select user_id::text
   from public.revenuecat_premium_transaction_authority
   where provider = 'revenuecat_app_store'
     and original_transaction_id = 'apple-current-owner-transfer'),
  'ae300000-0000-4000-8000-000000000002',
  'the immutable original transaction binding has exactly one current owner'
);
select is(
  (select status from public.user_entitlements
   where user_id = 'ae300000-0000-4000-8000-000000000001'
     and entitlement_key = 'premium'),
  'revoked',
  'the source entitlement projection is revoked'
);
select is(
  (select status from public.user_entitlements
   where user_id = 'ae300000-0000-4000-8000-000000000002'
     and entitlement_key = 'premium'),
  'active',
  'the target entitlement projection is active'
);
select is(
  (select metadata->>'transfer_applied' from public.provider_events
   where provider_event_id = 'rc-current-owner-transfer-one'),
  'true',
  'the prior signed transfer identity is consumed exactly once'
);
select is(
  (select metadata->>'final_reason' from public.provider_events
   where provider_event_id = 'rc-current-owner-transfer-one'),
  'premium_transfer_current_customer_reconciled',
  'the transfer evidence records its exact final disposition'
);
select is(
  (select event_type from public.provider_events
   where provider_event_id = 'rc-current-owner-target'),
  'RECONCILIATION',
  'target evidence remains reconciliation rather than a fabricated purchase'
);
select is(
  (select metadata->>'provider_transaction_created' from public.provider_events
   where provider_event_id = 'rc-current-owner-target'),
  'false',
  'current-owner reconciliation creates no provider transaction'
);
select is(
  (select amount_minor from public.money_access_ledger_events ledger
   join public.provider_events event on event.id = ledger.provider_event_id
   where event.provider_event_id = 'rc-current-owner-target'),
  0,
  'current-owner reconciliation creates no charge amount'
);
select is(
  (select payable_state from public.money_access_ledger_events ledger
   join public.provider_events event on event.id = ledger.provider_event_id
   where event.provider_event_id = 'rc-current-owner-target'),
  'not_payable',
  'current-owner reconciliation creates no payable balance'
);
select is(
  pg_temp.reconcile_current_owner(
    'rc-current-owner-target',
    'ae300000-0000-4000-8000-000000000002',
    'ae300000-0000-4000-8000-000000000001',
    'apple-current-owner-transfer',
    repeat('7', 64)
  )->>'status',
  'duplicate_ignored',
  'the exact current-owner snapshot is idempotent'
);
select throws_ok(
  $$select pg_temp.reconcile_current_owner(
    'rc-current-owner-after-move-wrong-user',
    'ae300000-0000-4000-8000-000000000003',
    'ae300000-0000-4000-8000-000000000001',
    'apple-current-owner-transfer',
    repeat('8', 64)
  )$$,
  'premium_current_owner_transfer_source_still_active',
  'the moved transaction cannot leak from its active target to another user'
);

select is(
  public.reconcile_revenuecat_premium_snapshot_atomic(
    'rc-current-owner-ambiguous-source',
    'ae300000-0000-4000-8000-000000000004',
    'rc-current-owner-ambiguous-subscription',
    'apple-current-owner-ambiguous',
    'com.chillywood.premium.monthly',
    'active',
    timezone('utc'::text, now()) - interval '2 days',
    timezone('utc'::text, now()) + interval '1 day',
    timezone('utc'::text, now()) - interval '1 day',
    repeat('9', 64)
  )->>'status',
  'processed',
  'the ambiguity case begins with exact source authority'
);
update public.user_entitlements
set expires_at = timezone('utc'::text, now()) - interval '1 minute'
where user_id = 'ae300000-0000-4000-8000-000000000004'
  and entitlement_key = 'premium';
update public.access_grants
set expires_at = timezone('utc'::text, now()) - interval '1 minute'
where user_id = 'ae300000-0000-4000-8000-000000000004'
  and grant_type = 'premium';
insert into public.provider_events (
  provider_event_id, provider, product_id, product_key, user_id, app_user_id,
  environment, event_type, status, occurred_at, idempotency_key,
  raw_payload_hash, metadata
)
select
  'rc-current-owner-ambiguous-' || suffix,
  'revenuecat_app_store', null, null,
  'ae300000-0000-4000-8000-000000000005',
  'ae300000-0000-4000-8000-000000000005',
  'sandbox', 'TRANSFER', 'ignored',
  timezone('utc'::text, now()) - interval '1 minute',
  'TRANSFER:rc-current-owner-ambiguous-' || suffix,
  repeat(suffix, 64),
  jsonb_build_object(
    'source_user_id', 'ae300000-0000-4000-8000-000000000004',
    'target_user_id', 'ae300000-0000-4000-8000-000000000005',
    'reported_occurred_at', timezone('utc'::text, now()) - interval '1 minute',
    'transfer_time_valid', true,
    'transfer_applied', false,
    'final_reason', 'premium_transfer_source_transaction_authority_missing',
    'provider_payload_stored', false,
    'money_action', false
  )
from (values ('a'), ('b')) fixture(suffix);
select throws_ok(
  $$select pg_temp.reconcile_current_owner(
    'rc-current-owner-ambiguous-target',
    'ae300000-0000-4000-8000-000000000005',
    'ae300000-0000-4000-8000-000000000004',
    'apple-current-owner-ambiguous',
    repeat('d', 64)
  )$$,
  'premium_current_owner_transfer_evidence_ambiguous',
  'ambiguous signed transfer evidence fails closed'
);
select is(
  (select count(*)::integer from public.user_entitlements
   where user_id = 'ae300000-0000-4000-8000-000000000005'
     and entitlement_key = 'premium'),
  0,
  'ambiguous transfer evidence grants no target entitlement'
);
select throws_ok(
  $$select pg_temp.reconcile_current_owner(
    'rc-current-owner-empty-provider-origin',
    'ae300000-0000-4000-8000-000000000003',
    '',
    'apple-current-owner-new',
    repeat('e', 64)
  )$$,
  'premium_current_owner_reconciliation_identity_invalid',
  'missing RevenueCat original-customer identity fails closed'
);
select is(
  (select count(*)::integer
   from public.money_access_ledger_events
   where payable_state not in ('not_payable', 'refunded', 'reversed')),
  0,
  'the complete current-owner matrix creates no payable ledger state'
);
select results_eq(
  $$select requested.key,
      coalesce((select switch_row.state
        from public.platform_money_kill_switches switch_row
        where switch_row.key = requested.key), 'off') as state
    from (values
      ('cashout_enabled'::text),
      ('live_money_enabled'::text),
      ('payouts_enabled'::text)
    ) requested(key)
    order by requested.key$$,
  $$values
    ('cashout_enabled'::text, 'off'::text),
    ('live_money_enabled'::text, 'off'::text),
    ('payouts_enabled'::text, 'off'::text)$$,
  'money, payout, and cash-out switches remain off'
);

select * from finish();
rollback;
