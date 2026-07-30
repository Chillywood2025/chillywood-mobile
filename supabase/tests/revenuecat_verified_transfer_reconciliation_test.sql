begin;
select plan(52);

insert into auth.users (id)
values
  ('c0000000-0000-4000-8000-000000000001'),
  ('d0000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000003'),
  ('f0000000-0000-4000-8000-000000000004'),
  ('a1111111-1111-4111-8111-111111111111'),
  ('b1111111-1111-4111-8111-111111111111'),
  ('c1000000-0000-4000-8000-000000000001'),
  ('c1000000-0000-4000-8000-000000000002'),
  ('c2000000-0000-4000-8000-000000000001'),
  ('c2000000-0000-4000-8000-000000000002'),
  ('c3000000-0000-4000-8000-000000000001'),
  ('c3000000-0000-4000-8000-000000000002'),
  ('c4000000-0000-4000-8000-000000000001'),
  ('c4000000-0000-4000-8000-000000000002'),
  ('c5000000-0000-4000-8000-000000000001'),
  ('c5000000-0000-4000-8000-000000000002')
on conflict (id) do nothing;

insert into public.user_entitlements (
  user_id,
  entitlement_key,
  status,
  source,
  starts_at,
  expires_at,
  updated_at,
  metadata
) values (
  'd0000000-0000-4000-8000-000000000002',
  'premium',
  'active',
  'test_grant',
  timezone('utc'::text, now()) - interval '2 days',
  timezone('utc'::text, now()) - interval '1 day',
  timezone('utc'::text, now()) - interval '1 day',
  jsonb_build_object('expired_test_residue', true)
);

create function pg_temp.seed_transfer_source(
  p_event_id text,
  p_user_id uuid
)
returns jsonb
language sql
volatile
as $$
  select public.process_revenuecat_premium_event_atomic_internal(
    'revenuecat_app_store',
    p_event_id,
    'INITIAL_PURCHASE',
    p_user_id,
    mapping.provider_product_id,
    null,
    'sandbox',
    'active',
    timezone('utc'::text, now()) - interval '1 day',
    timezone('utc'::text, now()) + interval '30 days',
    timezone('utc'::text, now()) - interval '1 hour',
    mapping.reference_price_minor,
    mapping.reference_currency,
    'sha256-transfer-source',
    'NORMAL',
    'app_store',
    'ios',
    mapping.id,
    mapping.product_id,
    null
  )
  from public.monetization_product_store_mappings mapping
  where mapping.provider = 'revenuecat_app_store'
    and mapping.provider_product_id = 'com.chillywood.premium.monthly'
    and mapping.environment = 'sandbox'
  limit 1;
$$;

create function pg_temp.transfer_failure_rolled_back()
returns boolean
language plpgsql
as $$
begin
  perform public.process_revenuecat_premium_transfer_atomic_internal(
    'transfer-failure-1',
    'e0000000-0000-4000-8000-000000000003',
    'f0000000-0000-4000-8000-000000000004',
    'sandbox',
    timezone('utc'::text, now()),
    'sha256-transfer-failure',
    'after_source'
  );
  return false;
exception when others then
  return (
    select entitlement.status = 'active'
    from public.user_entitlements entitlement
    where entitlement.user_id = 'e0000000-0000-4000-8000-000000000003'
      and entitlement.entitlement_key = 'premium'
  )
  and (
    select grant_row.status = 'sandbox_only'
    from public.access_grants grant_row
    where grant_row.user_id = 'e0000000-0000-4000-8000-000000000003'
      and grant_row.grant_type = 'premium'
  )
  and not exists (
    select 1
    from public.user_entitlements entitlement
    where entitlement.user_id = 'f0000000-0000-4000-8000-000000000004'
      and entitlement.entitlement_key = 'premium'
  )
  and not exists (
    select 1
    from public.provider_events event
    where event.provider_event_id like 'transfer:transfer-failure-1:%'
  );
end;
$$;

create function pg_temp.apply_premium_event(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_status text,
  p_occurred_at timestamptz,
  p_expires_at timestamptz
)
returns jsonb
language sql
volatile
as $$
  select public.process_revenuecat_premium_event_atomic_internal(
    'revenuecat_app_store',
    p_event_id,
    p_event_type,
    p_user_id,
    mapping.provider_product_id,
    null,
    'sandbox',
    p_status,
    p_occurred_at - interval '30 days',
    p_expires_at,
    p_occurred_at,
    mapping.reference_price_minor,
    mapping.reference_currency,
    'sha256-ordering-' || p_event_id,
    'NORMAL',
    'app_store',
    'ios',
    mapping.id,
    mapping.product_id,
    null
  )
  from public.monetization_product_store_mappings mapping
  where mapping.provider = 'revenuecat_app_store'
    and mapping.provider_product_id = 'com.chillywood.premium.monthly'
    and mapping.environment = 'sandbox'
  limit 1;
$$;

select lives_ok(
  $$select pg_temp.seed_transfer_source('transfer-source-1', 'c0000000-0000-4000-8000-000000000001')$$,
  'provider-backed sandbox Premium source is active before transfer'
);

select lives_ok(
  $$select public.process_revenuecat_premium_transfer_atomic(
    'transfer-event-1',
    'c0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002',
    'sandbox',
    now(),
    'sha256-transfer-event'
  )$$,
  'verified sandbox App Store transfer atomically supersedes expired test residue'
);

select is(
  (select status from public.user_entitlements where user_id = 'c0000000-0000-4000-8000-000000000001' and entitlement_key = 'premium'),
  'revoked',
  'transfer revokes the provider source entitlement'
);
select is(
  (select status from public.user_entitlements where user_id = 'd0000000-0000-4000-8000-000000000002' and entitlement_key = 'premium'),
  'active',
  'transfer activates the provider destination entitlement'
);
select is(
  (select status from public.access_grants where user_id = 'c0000000-0000-4000-8000-000000000001' and grant_type = 'premium'),
  'revoked',
  'transfer revokes the source access grant'
);
select is(
  (select status from public.access_grants where user_id = 'd0000000-0000-4000-8000-000000000002' and grant_type = 'premium'),
  'sandbox_only',
  'transfer activates only sandbox destination access'
);
select is(
  (select expires_at from public.user_entitlements where user_id = 'd0000000-0000-4000-8000-000000000002' and entitlement_key = 'premium'),
  (select expires_at from public.user_entitlements where user_id = 'c0000000-0000-4000-8000-000000000001' and entitlement_key = 'premium'),
  'transfer preserves the provider-backed expiration'
);
select is(
  (select count(*)::integer from public.provider_events where provider_event_id like 'transfer:transfer-event-1:%'),
  2,
  'transfer records exactly one source and one destination lifecycle event'
);
select is(
  (select count(*)::integer from public.provider_events where provider_event_id like 'transfer:transfer-event-1:%' and (metadata->>'revenuecat_transfer')::boolean),
  2,
  'both normalized provider events retain transfer audit metadata'
);
select is(
  (select count(*)::integer from public.money_access_ledger_events ledger
   join public.provider_events event on event.id = ledger.provider_event_id
   where event.provider_event_id like 'transfer:transfer-event-1:%'
     and ledger.amount_minor = 0
     and ledger.environment = 'sandbox'),
  2,
  'transfer ledger entries are zero-amount sandbox records'
);
select is(
  (select payable_state from public.money_access_ledger_events ledger
   join public.provider_events event on event.id = ledger.provider_event_id
   where event.provider_event_id = 'transfer:transfer-event-1:target'),
  'not_payable',
  'destination transfer never creates a payable balance'
);
select ok(
  (select not (metadata->>'authority_granted')::boolean
     and not (metadata->>'payout_access')::boolean
   from public.access_grants
   where user_id = 'd0000000-0000-4000-8000-000000000002'
     and grant_type = 'premium'),
  'destination transfer creates viewer access without authority or payout access'
);

select lives_ok(
  $$select public.process_revenuecat_premium_transfer_atomic(
    'transfer-event-1',
    'c0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002',
    'sandbox',
    now(),
    'sha256-transfer-event'
  )$$,
  'duplicate transfer delivery is retry safe'
);
select is(
  (select count(*)::integer from public.provider_events where provider_event_id like 'transfer:transfer-event-1:%'),
  2,
  'duplicate transfer creates no additional provider events'
);
select is(
  (select count(*)::integer from public.money_access_ledger_events ledger
   join public.provider_events event on event.id = ledger.provider_event_id
   where event.provider_event_id like 'transfer:transfer-event-1:%'),
  2,
  'duplicate transfer creates no additional ledger events'
);

select throws_ok(
  $$select public.process_revenuecat_premium_transfer_atomic(
    'transfer-self',
    'c0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'sandbox',
    now(),
    'sha256-transfer-self'
  )$$,
  'transfer_users_must_differ',
  'transfer to the same user fails closed'
);
select throws_ok(
  $$select public.process_revenuecat_premium_transfer_atomic(
    'transfer-production',
    'c0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002',
    'production',
    now(),
    'sha256-transfer-production'
  )$$,
  'transfer_environment_must_be_sandbox',
  'production transfer is outside this bounded reconciliation'
);
select throws_ok(
  $$select public.process_revenuecat_premium_transfer_atomic(
    'transfer-missing-user',
    'c0000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000099',
    'sandbox',
    now(),
    'sha256-transfer-missing-user'
  )$$,
  'transfer_auth_user_missing',
  'transfer requires both exact auth users'
);

select lives_ok(
  $$select pg_temp.seed_transfer_source('transfer-source-conflict', 'a1111111-1111-4111-8111-111111111111')$$,
  'effective non-provider conflict source is provider-backed and active'
);
insert into public.user_entitlements (
  user_id,
  entitlement_key,
  status,
  source,
  starts_at,
  expires_at,
  updated_at,
  metadata
) values (
  'b1111111-1111-4111-8111-111111111111',
  'premium',
  'active',
  'test_grant',
  timezone('utc'::text, now()) - interval '1 day',
  timezone('utc'::text, now()) + interval '1 day',
  timezone('utc'::text, now()),
  jsonb_build_object('effective_test_grant', true)
);
select throws_ok(
  $$select public.process_revenuecat_premium_transfer_atomic(
    'transfer-effective-conflict',
    'a1111111-1111-4111-8111-111111111111',
    'b1111111-1111-4111-8111-111111111111',
    'sandbox',
    now(),
    'sha256-transfer-effective-conflict'
  )$$,
  'transfer_target_entitlement_conflict',
  'effective non-provider destination entitlement remains a hard conflict'
);

select lives_ok(
  $$select pg_temp.seed_transfer_source('transfer-source-failure', 'e0000000-0000-4000-8000-000000000003')$$,
  'rollback source fixture is provider-backed and active'
);
select ok(
  pg_temp.transfer_failure_rolled_back(),
  'forced failure rolls back the entire transfer and leaves no one-sided duplicate marker'
);

select throws_ok(
  $$select public.process_revenuecat_premium_transfer_atomic(
    'transfer-null-time',
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002',
    'sandbox',
    null,
    'sha256-transfer-null-time'
  )$$,
  'transfer_occurred_at_required',
  'transfer authority requires an exact provider occurrence time'
);

select lives_ok(
  $$select pg_temp.apply_premium_event(
    'ordering-source-1', 'INITIAL_PURCHASE',
    'c1000000-0000-4000-8000-000000000001',
    'active', now() - interval '4 hours', now() + interval '30 days'
  )$$,
  'delayed-transfer source begins with older provider authority'
);
select lives_ok(
  $$select pg_temp.apply_premium_event(
    'ordering-renewal-1', 'RENEWAL',
    'c1000000-0000-4000-8000-000000000001',
    'active', now() - interval '1 hour', now() + interval '60 days'
  )$$,
  'newer renewal becomes source authority before delayed transfer'
);
select throws_ok(
  $$select public.process_revenuecat_premium_transfer_atomic(
    'ordering-delayed-transfer-1',
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002',
    'sandbox',
    now() - interval '2 hours',
    'sha256-ordering-delayed-transfer-1'
  )$$,
  'transfer_event_stale',
  'delayed transfer cannot replace a newer source renewal'
);
select is(
  (select metadata->>'revenuecat_event_id'
   from public.user_entitlements
   where user_id = 'c1000000-0000-4000-8000-000000000001'
     and entitlement_key = 'premium'),
  'ordering-renewal-1',
  'rejected delayed transfer preserves the newer renewal authority'
);
select is(
  (select count(*)::integer
   from public.user_entitlements
   where user_id = 'c1000000-0000-4000-8000-000000000002'
     and entitlement_key = 'premium'),
  0,
  'rejected delayed transfer creates no destination entitlement'
);

select lives_ok(
  $$select pg_temp.apply_premium_event(
    'ordering-source-2', 'INITIAL_PURCHASE',
    'c2000000-0000-4000-8000-000000000001',
    'active', now() - interval '3 hours', now() + interval '30 days'
  )$$,
  'newer-transfer source has older provider authority'
);
select lives_ok(
  $$select public.process_revenuecat_premium_transfer_atomic(
    'ordering-newer-transfer-2',
    'c2000000-0000-4000-8000-000000000001',
    'c2000000-0000-4000-8000-000000000002',
    'sandbox',
    now() - interval '1 hour',
    'sha256-ordering-newer-transfer-2'
  )$$,
  'newer transfer may follow an older source event'
);
select is(
  (select status from public.user_entitlements
   where user_id = 'c2000000-0000-4000-8000-000000000001'
     and entitlement_key = 'premium'),
  'revoked',
  'valid newer transfer revokes the source exactly once'
);
select is(
  (select status from public.user_entitlements
   where user_id = 'c2000000-0000-4000-8000-000000000002'
     and entitlement_key = 'premium'),
  'active',
  'valid newer transfer activates the destination exactly once'
);

select lives_ok(
  $$select pg_temp.apply_premium_event(
    'ordering-source-3', 'INITIAL_PURCHASE',
    'c3000000-0000-4000-8000-000000000001',
    'active', now() - interval '4 hours', now() + interval '30 days'
  )$$,
  'expiration ordering source begins active'
);
select lives_ok(
  $$select pg_temp.apply_premium_event(
    'ordering-expiration-3', 'EXPIRATION',
    'c3000000-0000-4000-8000-000000000001',
    'expired', now() - interval '1 hour', now() - interval '1 hour'
  )$$,
  'newer expiration becomes authoritative'
);
select throws_ok(
  $$select public.process_revenuecat_premium_transfer_atomic(
    'ordering-delayed-transfer-3',
    'c3000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000002',
    'sandbox',
    now() - interval '2 hours',
    'sha256-ordering-delayed-transfer-3'
  )$$,
  'transfer_event_stale',
  'delayed transfer cannot replace a newer expiration'
);

select lives_ok(
  $$select pg_temp.apply_premium_event(
    'ordering-source-4', 'INITIAL_PURCHASE',
    'c4000000-0000-4000-8000-000000000001',
    'active', now() - interval '4 hours', now() + interval '30 days'
  )$$,
  'refund ordering source begins active'
);
select lives_ok(
  $$select pg_temp.apply_premium_event(
    'ordering-refund-4', 'REFUND',
    'c4000000-0000-4000-8000-000000000001',
    'revoked', now() - interval '1 hour', now() + interval '30 days'
  )$$,
  'newer refund becomes authoritative'
);
select throws_ok(
  $$select public.process_revenuecat_premium_transfer_atomic(
    'ordering-delayed-transfer-4',
    'c4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000002',
    'sandbox',
    now() - interval '2 hours',
    'sha256-ordering-delayed-transfer-4'
  )$$,
  'transfer_event_stale',
  'delayed transfer cannot replace a newer refund or revocation'
);

select lives_ok(
  $$select pg_temp.apply_premium_event(
    'ordering-source-5', 'INITIAL_PURCHASE',
    'c5000000-0000-4000-8000-000000000001',
    'active', now() - interval '4 hours', now() + interval '30 days'
  )$$,
  'duplicate ordering source begins active'
);
select lives_ok(
  $$select public.process_revenuecat_premium_transfer_atomic(
    'ordering-transfer-5',
    'c5000000-0000-4000-8000-000000000001',
    'c5000000-0000-4000-8000-000000000002',
    'sandbox',
    now() - interval '2 hours',
    'sha256-ordering-transfer-5'
  )$$,
  'initial ordered transfer succeeds'
);
select lives_ok(
  $$select pg_temp.apply_premium_event(
    'ordering-target-renewal-5', 'RENEWAL',
    'c5000000-0000-4000-8000-000000000002',
    'active', now() - interval '1 hour', now() + interval '60 days'
  )$$,
  'newer destination renewal follows the transfer'
);
select lives_ok(
  $$select public.process_revenuecat_premium_transfer_atomic(
    'ordering-transfer-5',
    'c5000000-0000-4000-8000-000000000001',
    'c5000000-0000-4000-8000-000000000002',
    'sandbox',
    now() - interval '2 hours',
    'sha256-ordering-transfer-5'
  )$$,
  'duplicate replay remains idempotent after a newer renewal'
);
select is(
  (select metadata->>'revenuecat_event_id'
   from public.user_entitlements
   where user_id = 'c5000000-0000-4000-8000-000000000002'
     and entitlement_key = 'premium'),
  'ordering-target-renewal-5',
  'duplicate replay does not overwrite newer destination authority'
);
select is(
  (select count(*)::integer
   from public.provider_events
   where provider_event_id like 'transfer:ordering-transfer-5:%'),
  2,
  'duplicate ordered transfer retains exactly two normalized events'
);

select ok(
  pg_get_functiondef(
    'public.process_revenuecat_premium_transfer_ordered_internal(text,uuid,uuid,text,timestamptz,text,text)'::regprocedure
  ) like '%revenuecat-premium:%',
  'transfer and ordinary Premium lifecycle events share an advisory-lock namespace'
);
select ok(
  pg_get_functiondef(
    'public.process_revenuecat_premium_transfer_ordered_internal(text,uuid,uuid,text,timestamptz,text,text)'::regprocedure
  ) like '%transfer_event_stale%',
  'ordered transfer rechecks authoritative event time after serialization'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.process_revenuecat_premium_transfer_ordered_internal(text,uuid,uuid,text,timestamptz,text,text)',
    'EXECUTE'
  ),
  'service role cannot bypass the ordered public transfer wrapper'
);

select ok(
  not has_function_privilege('anon', 'public.process_revenuecat_premium_transfer_atomic(text,uuid,uuid,text,timestamptz,text)', 'EXECUTE'),
  'anon cannot execute the transfer reconciler'
);
select ok(
  not has_function_privilege('authenticated', 'public.process_revenuecat_premium_transfer_atomic(text,uuid,uuid,text,timestamptz,text)', 'EXECUTE'),
  'authenticated clients cannot execute the transfer reconciler'
);
select ok(
  has_function_privilege('service_role', 'public.process_revenuecat_premium_transfer_atomic(text,uuid,uuid,text,timestamptz,text)', 'EXECUTE'),
  'only the service role can invoke the verified transfer wrapper'
);
select ok(
  not has_function_privilege('service_role', 'public.process_revenuecat_premium_transfer_atomic_internal(text,uuid,uuid,text,timestamptz,text,text)', 'EXECUTE'),
  'the failpoint-bearing internal transfer function is not executable by the service role'
);

select is(
  (select count(*)::integer
   from public.money_access_ledger_events ledger
   join public.provider_events event on event.id = ledger.provider_event_id
   where event.provider_event_id like 'transfer:transfer-event-1:%'
     and ledger.payable_state not in ('not_payable', 'refunded')),
  0,
  'transfer creates no charge, payout, or payable ledger state'
);

select * from finish();
rollback;
