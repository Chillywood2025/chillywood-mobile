begin;
select plan(27);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('c0000000-0000-4000-8000-000000000001', false, false),
  ('d0000000-0000-4000-8000-000000000002', false, false),
  ('e0000000-0000-4000-8000-000000000003', false, false),
  ('f0000000-0000-4000-8000-000000000004', false, false),
  ('a1111111-1111-4111-8111-111111111111', false, false),
  ('b1111111-1111-4111-8111-111111111111', false, false)
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
  'forced failure after source revocation rolls back the entire transfer'
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
