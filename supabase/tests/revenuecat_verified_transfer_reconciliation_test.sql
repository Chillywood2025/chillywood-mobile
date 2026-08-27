begin;
select plan(121);

-- This proof exercises the sandbox provider rail only.  Keep production money
-- and payouts disabled while enabling exact sandbox webhook reconciliation for
-- the duration of this rolled-back fixture.
update public.platform_money_kill_switches
set state = case
  when key in ('revenuecat_app_store_enabled', 'provider_webhooks_enabled')
    then 'sandbox_only'
  when key in ('live_money_enabled', 'payouts_enabled') then 'off'
  else state
end
where key in (
  'revenuecat_app_store_enabled', 'provider_webhooks_enabled',
  'live_money_enabled', 'payouts_enabled'
);

insert into auth.users (id)
values
  ('c0000000-0000-4000-8000-000000000001'), ('d0000000-0000-4000-8000-000000000002'),
  ('e0000000-0000-4000-8000-000000000003'), ('f0000000-0000-4000-8000-000000000004'),
  ('a1111111-1111-4111-8111-111111111111'), ('b1111111-1111-4111-8111-111111111111'),
  ('c1000000-0000-4000-8000-000000000001'), ('c1000000-0000-4000-8000-000000000002'),
  ('c2000000-0000-4000-8000-000000000001'), ('c2000000-0000-4000-8000-000000000002'),
  ('c3000000-0000-4000-8000-000000000001'), ('c3000000-0000-4000-8000-000000000002'),
  ('c4000000-0000-4000-8000-000000000001'), ('c4000000-0000-4000-8000-000000000002'),
  ('c5000000-0000-4000-8000-000000000001'), ('c5000000-0000-4000-8000-000000000002'),
  ('c6000000-0000-4000-8000-000000000001'), ('c6000000-0000-4000-8000-000000000002'),
  ('c7000000-0000-4000-8000-000000000001'), ('c7000000-0000-4000-8000-000000000002'),
  ('c8000000-0000-4000-8000-000000000001'), ('c8000000-0000-4000-8000-000000000002'),
  ('c9000000-0000-4000-8000-000000000001'), ('c9000000-0000-4000-8000-000000000002'),
  ('ca000000-0000-4000-8000-000000000001'), ('ca000000-0000-4000-8000-000000000002'),
  ('cb000000-0000-4000-8000-000000000001'), ('cb000000-0000-4000-8000-000000000002'),
  ('cc000000-0000-4000-8000-000000000001'), ('cc000000-0000-4000-8000-000000000002'),
  ('cd000000-0000-4000-8000-000000000001'), ('cd000000-0000-4000-8000-000000000002'),
  ('ce000000-0000-4000-8000-000000000001'), ('ce000000-0000-4000-8000-000000000002'),
  ('cf000000-0000-4000-8000-000000000001'), ('cf000000-0000-4000-8000-000000000002'),
  ('d1000000-0000-4000-8000-000000000001'), ('d1000000-0000-4000-8000-000000000002'),
  ('d2000000-0000-4000-8000-000000000001'), ('d2000000-0000-4000-8000-000000000002'),
  ('d3000000-0000-4000-8000-000000000001'), ('d3000000-0000-4000-8000-000000000002'),
  ('d4000000-0000-4000-8000-000000000001'), ('d4000000-0000-4000-8000-000000000002'),
  ('d5000000-0000-4000-8000-000000000001'), ('d5000000-0000-4000-8000-000000000002'),
  ('d6000000-0000-4000-8000-000000000001'), ('d6000000-0000-4000-8000-000000000002'),
  ('d7000000-0000-4000-8000-000000000001'), ('d7000000-0000-4000-8000-000000000002'),
  ('d8000000-0000-4000-8000-000000000001'), ('d8000000-0000-4000-8000-000000000002'),
  ('d9000000-0000-4000-8000-000000000001'), ('d9000000-0000-4000-8000-000000000002'),
  ('da000000-0000-4000-8000-000000000001'), ('da000000-0000-4000-8000-000000000002'),
  ('db000000-0000-4000-8000-000000000001'), ('db000000-0000-4000-8000-000000000002'),
  ('dc000000-0000-4000-8000-000000000001'), ('dc000000-0000-4000-8000-000000000002'),
  ('dc000000-0000-4000-8000-000000000003'), ('dc000000-0000-4000-8000-000000000004'), ('dd000000-0000-4000-8000-000000000001')
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
  select public.process_revenuecat_premium_event_atomic(
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
    repeat('a', 64),
    'NORMAL',
    'app_store',
    'ios',
    mapping.id,
    mapping.product_id,
    'transfer-fixture-original:' || p_user_id::text
  )
  from public.monetization_product_store_mappings mapping
  where mapping.provider = 'revenuecat_app_store'
    and mapping.provider_product_id = 'com.chillywood.premium.monthly'
    and mapping.environment = 'sandbox'
  limit 1;
$$;
create function pg_temp.transfer_state(p_source uuid, p_target uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'entitlements', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.user_id, row_value.entitlement_key) from public.user_entitlements row_value where row_value.user_id in (p_source::text, p_target::text)), '[]'::jsonb),
    'grants', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id) from public.access_grants row_value where row_value.user_id in (p_source, p_target)), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id) from public.provider_events row_value where row_value.user_id in (p_source, p_target)), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(to_jsonb(row_value) order by row_value.id) from public.money_access_ledger_events row_value where row_value.user_id in (p_source, p_target)), '[]'::jsonb)
  );
$$;
create function pg_temp.transfer_denial_is_atomic(
  p_event_id text, p_source uuid, p_target uuid, p_environment text,
  p_occurred_at timestamptz, p_hash text, p_expected_error text,
  p_failpoint text default null
)
returns boolean language plpgsql as $$
declare
  v_before jsonb := pg_temp.transfer_state(p_source, p_target);
  v_after jsonb;
  v_normalized_before integer := (
    select count(*)::integer
    from public.provider_events
    where provider_event_id like 'transfer:' || p_event_id || ':%'
  );
  v_normalized_after integer;
  v_result jsonb;
  v_error_matched boolean := false;
  v_recorded_denial boolean := false;
begin
  begin
    if p_failpoint is null then
      v_result := public.process_revenuecat_premium_transfer_atomic(
        p_event_id, p_source, p_target, p_environment, p_occurred_at, p_hash
      );
    else
      perform public.process_revenuecat_premium_transfer_atomic_internal(p_event_id, p_source, p_target, p_environment, p_occurred_at, p_hash, p_failpoint);
    end if;
    if p_failpoint is null
      and v_result->>'status' = 'ignored'
      and v_result->>'reason' = p_expected_error
    then
      v_error_matched := true;
      v_recorded_denial := true;
    else
      raise exception 'transfer_denial_not_raised';
    end if;
  exception when others then
    if sqlerrm = p_expected_error then v_error_matched := true;
    elsif sqlerrm <> 'transfer_denial_not_raised' then raise;
    end if;
  end;
  v_after := pg_temp.transfer_state(p_source, p_target);
  select count(*)::integer into v_normalized_after
  from public.provider_events
  where provider_event_id like 'transfer:' || p_event_id || ':%';
  return v_error_matched
    and (
      (not v_recorded_denial and v_before = v_after)
      or (
        v_recorded_denial
        and (v_before - 'events') = (v_after - 'events')
        and jsonb_array_length(v_after->'events') = jsonb_array_length(v_before->'events') + 1
        and 1 = (
          select count(*)
          from public.provider_events event
          where event.provider = 'revenuecat_app_store'
            and event.provider_event_id = p_event_id
            and event.event_type = 'TRANSFER'
            and event.status = 'ignored'
            and event.user_id = p_target
            and event.raw_payload_hash = p_hash
            and event.metadata->>'source_user_id' = p_source::text
            and event.metadata->>'target_user_id' = p_target::text
            and coalesce((event.metadata->>'transfer_applied')::boolean, false) = false
            and coalesce((event.metadata->>'authority_granted')::boolean, false) = false
            and coalesce((event.metadata->>'money_action')::boolean, false) = false
        )
      )
    )
    and v_normalized_after = v_normalized_before
    and not exists (select 1 from public.money_access_ledger_events where user_id in (p_source, p_target) and payable_state not in ('not_payable', 'refunded', 'reversed', 'chargeback'))
    and not exists (select 1 from public.access_grants where user_id in (p_source, p_target) and (
      coalesce((metadata->>'authority_granted')::boolean, false) or coalesce((metadata->>'payout_access')::boolean, false)
      or coalesce((metadata->>'grants_livekit_publish')::boolean, false) or coalesce((metadata->>'grants_host_power')::boolean, false)
      or coalesce((metadata->>'grants_admin_power')::boolean, false) or coalesce((metadata->>'grants_payout_access')::boolean, false)
    ));
end;
$$;
create function pg_temp.apply_premium_event(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_status text,
  p_occurred_at timestamptz,
  p_expires_at timestamptz,
  p_payload_hash text default repeat('c', 64)
)
returns jsonb
language sql
volatile
as $$
  select public.process_revenuecat_premium_event_atomic(
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
    p_payload_hash,
    'NORMAL',
    'app_store',
    'ios',
    mapping.id,
    mapping.product_id,
    coalesce(
      (
        select authority.original_transaction_id
        from public.revenuecat_premium_transaction_authority authority
        where authority.provider = 'revenuecat_app_store'
          and authority.user_id = p_user_id
          and authority.environment = 'sandbox'
        order by authority.updated_at desc, authority.id
        limit 1
      ),
      'transfer-fixture-original:' || p_user_id::text
    )
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
    date_trunc('hour', now()),
    repeat('d', 64)
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
  (select array_agg(provider_event_id || '|' || user_id::text || '|' || status || '|' || event_type order by provider_event_id)
   from public.provider_events where provider_event_id like 'transfer:transfer-event-1:%'),
  array[
    'transfer:transfer-event-1:source|c0000000-0000-4000-8000-000000000001|refunded|REVOCATION',
    'transfer:transfer-event-1:target|d0000000-0000-4000-8000-000000000002|processed|RENEWAL'
  ],
  'normalized transfer pair binds source revocation and target renewal to the exact users'
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
    date_trunc('hour', now()),
    repeat('d', 64)
  )$$,
  'duplicate transfer delivery is retry safe'
);
set local timezone to 'America/Chicago';
select lives_ok(
  $$select public.process_revenuecat_premium_transfer_atomic(
    'transfer-event-1',
    'c0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002',
    'sandbox',
    (select (metadata->>'reported_occurred_at')::timestamptz
     from public.provider_events
     where provider = 'revenuecat_app_store'
       and provider_event_id = 'transfer-event-1'),
    repeat('d', 64)
  )$$,
  'exact duplicate transfer remains retry safe across database session timezones'
);
set local timezone to 'UTC';
select ok(pg_temp.transfer_denial_is_atomic(
    'transfer-event-1',
    'c0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002',
    'sandbox',
    date_trunc('hour', now()),
    repeat('e', 64),
    'revenuecat_premium_transfer_event_id_identity_mismatch'
  ),
  'transfer duplicate requires the exact immutable payload identity'
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
select ok(pg_temp.transfer_denial_is_atomic(
    'transfer-self',
    'c0000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'sandbox',
    now(),
    repeat('f', 64),
    'revenuecat_premium_transfer_identity_invalid'
  ),
  'transfer to the same user fails closed'
);
select ok(pg_temp.transfer_denial_is_atomic(
    'transfer-production',
    'c0000000-0000-4000-8000-000000000001',
    'd0000000-0000-4000-8000-000000000002',
    'production',
    now(),
    repeat('1', 64),
    'revenuecat_premium_transfer_identity_invalid'
  ),
  'production transfer is outside this bounded reconciliation'
);
do $setup$ begin perform pg_temp.seed_transfer_source('missing-user-source', 'dd000000-0000-4000-8000-000000000001'); end; $setup$;
select ok(pg_temp.transfer_denial_is_atomic(
    'transfer-missing-user',
    'dd000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000099',
    'sandbox',
    now(),
    repeat('2', 64),
    'revenuecat_premium_transfer_user_missing'
  ),
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
select ok(pg_temp.transfer_denial_is_atomic(
    'transfer-effective-conflict',
    'a1111111-1111-4111-8111-111111111111',
    'b1111111-1111-4111-8111-111111111111',
    'sandbox',
    now(),
    repeat('3', 64),
    'transfer_target_entitlement_conflict'
  ),
  'effective non-provider destination entitlement remains a hard conflict'
);
select lives_ok(
  $$select pg_temp.seed_transfer_source('transfer-source-failure', 'e0000000-0000-4000-8000-000000000003')$$,
  'rollback source fixture is provider-backed and active'
);
select ok(
  pg_temp.transfer_denial_is_atomic('transfer-failure-after-source', 'e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000004', 'sandbox', now(), repeat('b', 64), 'forced_failure_after_transfer_source', 'after_source'),
  'named after-source failpoint is reached and rolls back every transfer row'
);
select ok(
  pg_temp.transfer_denial_is_atomic('transfer-failure-after-target', 'e0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000004', 'sandbox', now(), repeat('b', 64), 'forced_failure_after_transfer_target', 'after_target'),
  'named after-target failpoint is reached and rolls back every transfer row'
);
select lives_ok(
  $$select pg_temp.seed_transfer_source('cardinality-source', 'cb000000-0000-4000-8000-000000000001')$$,
  'cardinality source begins with one verified provider grant'
);
insert into public.access_grants (
  user_id, grant_type, source_type, product_id, provider, environment, status,
  starts_at, expires_at, metadata
)
select
  'cb000000-0000-4000-8000-000000000001', 'premium', 'setup', product.id,
  'revenuecat_app_store', 'sandbox', 'sandbox_only', now() - interval '1 day',
  now() + interval '30 days',
  jsonb_build_object('viewer_access_only', true, 'authority_granted', false, 'payout_access', false)
from public.monetization_products product
where product.product_type = 'premium_subscription'
limit 1;
select ok(pg_temp.transfer_denial_is_atomic(
    'cardinality-source-transfer',
    'cb000000-0000-4000-8000-000000000001',
    'cb000000-0000-4000-8000-000000000002',
    'sandbox', now(), repeat('1', 64),
    'transfer_source_provider_grant_ambiguous'
  ),
  'multiple effective source grants fail closed'
);
select is(
  (select count(*)::integer from public.user_entitlements
   where user_id = 'cb000000-0000-4000-8000-000000000002'),
  0,
  'ambiguous source denial creates no target entitlement'
);
select lives_ok(
  $$select pg_temp.seed_transfer_source('target-conflict-source', 'cc000000-0000-4000-8000-000000000001')$$,
  'target-conflict source begins verified and active'
);
insert into public.access_grants (
  user_id, grant_type, source_type, product_id, provider, environment, status,
  starts_at, expires_at, metadata
)
select
  'cc000000-0000-4000-8000-000000000002', 'premium', 'setup', product.id,
  'revenuecat_google_play', 'sandbox', 'sandbox_only', now() - interval '1 day',
  now() + interval '30 days',
  jsonb_build_object('viewer_access_only', true, 'authority_granted', false, 'payout_access', false)
from public.monetization_products product
where product.product_type = 'premium_subscription'
limit 1;
select ok(pg_temp.transfer_denial_is_atomic(
    'target-conflicting-provider',
    'cc000000-0000-4000-8000-000000000001',
    'cc000000-0000-4000-8000-000000000002',
    'sandbox', now(), repeat('2', 64),
    'transfer_target_grant_conflict'
  ),
  'any effective incompatible target grant fails closed'
);
select is(
  (select status from public.user_entitlements
   where user_id = 'cc000000-0000-4000-8000-000000000001'
     and entitlement_key = 'premium'),
  'active',
  'target grant conflict leaves source authority unchanged'
);
select throws_ok(
  $$select pg_temp.apply_premium_event(
    'ordinary-raw-json-hash', 'RENEWAL',
    'cd000000-0000-4000-8000-000000000002',
    'active', now(), now() + interval '30 days', '{"raw":"payload"}'
  )$$,
  'revenuecat_premium_transaction_identity_invalid',
  'ordinary lifecycle wrapper also rejects raw JSON in its hash field'
);
select lives_ok(
  $$select pg_temp.seed_transfer_source('far-future-source', 'cd000000-0000-4000-8000-000000000001')$$,
  'far-future source begins verified and active'
);
select ok(pg_temp.transfer_denial_is_atomic(
    'far-future-transfer',
    'cd000000-0000-4000-8000-000000000001',
    'cd000000-0000-4000-8000-000000000002',
    'sandbox', now() + interval '1 day', repeat('3', 64),
    'premium_transfer_occurred_at_invalid'
  ),
  'far-future provider occurrence time fails closed'
);
select lives_ok(
  $$select pg_temp.seed_transfer_source('expired-source', 'ce000000-0000-4000-8000-000000000001')$$,
  'expired-source fixture begins provider-backed'
);
update public.user_entitlements
set status='expired', expires_at=now()-interval '1 hour'
where user_id='ce000000-0000-4000-8000-000000000001' and entitlement_key='premium';
select ok(pg_temp.transfer_denial_is_atomic(
    'expired-source-transfer',
    'ce000000-0000-4000-8000-000000000001',
    'ce000000-0000-4000-8000-000000000002',
    'sandbox', now(), repeat('4', 64),
    'premium_transfer_source_transaction_authority_missing'
  ),
  'expired source entitlement cannot transfer'
);
select lives_ok(
  $$select pg_temp.seed_transfer_source('missing-grant-source', 'cf000000-0000-4000-8000-000000000001')$$,
  'missing-grant fixture begins provider-backed'
);
delete from public.access_grants
where user_id='cf000000-0000-4000-8000-000000000001' and grant_type='premium';
select ok(pg_temp.transfer_denial_is_atomic(
    'missing-grant-transfer',
    'cf000000-0000-4000-8000-000000000001',
    'cf000000-0000-4000-8000-000000000002',
    'sandbox', now(), repeat('5', 64),
    'premium_transfer_source_transaction_authority_missing'
  ),
  'missing source provider grant fails closed before mutation'
);
select lives_ok(
  $$select pg_temp.seed_transfer_source('invalid-event-source', 'd1000000-0000-4000-8000-000000000001')$$,
  'invalid-event fixture begins provider-backed'
);
update public.provider_events event
set status='ignored'
from public.access_grants grant_row
where grant_row.user_id='d1000000-0000-4000-8000-000000000001'
  and grant_row.grant_type='premium'
  and event.id=grant_row.provider_event_id;
select ok(pg_temp.transfer_denial_is_atomic(
    'invalid-source-event-transfer',
    'd1000000-0000-4000-8000-000000000001',
    'd1000000-0000-4000-8000-000000000002',
    'sandbox', now(), repeat('6', 64),
    'premium_transfer_source_transaction_authority_missing'
  ),
  'invalid source provider event cannot authorize a transfer'
);
select ok(pg_temp.transfer_denial_is_atomic(
    'transfer-null-time',
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002',
    'sandbox',
    null,
    repeat('4', 64),
    'premium_transfer_occurred_at_invalid'
  ),
  'transfer authority requires an exact provider occurrence time'
);
select ok(pg_temp.transfer_denial_is_atomic(
    'transfer-missing-hash',
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002',
    'sandbox', now(), '',
    'revenuecat_premium_transfer_identity_invalid'
  ),
  'transfer rejects a missing payload digest before any write'
);
select ok(pg_temp.transfer_denial_is_atomic(
    'transfer-raw-json-hash',
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002',
    'sandbox', now(), '{"raw":"payload"}',
    'revenuecat_premium_transfer_identity_invalid'
  ),
  'transfer cannot persist raw JSON in the payload-hash field'
);
do $setup$
begin
  perform pg_temp.apply_premium_event('target-expiration-source', 'INITIAL_PURCHASE', 'd2000000-0000-4000-8000-000000000001', 'active', now() - interval '4 hours', now() + interval '30 days');
  perform pg_temp.apply_premium_event('target-expiration-target', 'INITIAL_PURCHASE', 'd2000000-0000-4000-8000-000000000002', 'active', now() - interval '4 hours', now() + interval '30 days');
  perform pg_temp.apply_premium_event('target-expiration-newer', 'EXPIRATION', 'd2000000-0000-4000-8000-000000000002', 'expired', now() - interval '1 hour', now() - interval '1 hour');
end;
$setup$;
select ok(pg_temp.transfer_denial_is_atomic(
  'target-expiration-delayed', 'd2000000-0000-4000-8000-000000000001', 'd2000000-0000-4000-8000-000000000002',
  'sandbox', now() - interval '2 hours', repeat('7', 64), 'transfer_event_stale'
), 'delayed transfer cannot reactivate a target with newer authoritative expiration');
do $setup$
begin
  perform pg_temp.apply_premium_event('source-revocation-source', 'INITIAL_PURCHASE', 'd3000000-0000-4000-8000-000000000001', 'active', now() - interval '4 hours', now() + interval '30 days');
  perform pg_temp.apply_premium_event('source-revocation-newer', 'REVOCATION', 'd3000000-0000-4000-8000-000000000001', 'revoked', now() - interval '1 hour', now() + interval '30 days');
end;
$setup$;
select ok(pg_temp.transfer_denial_is_atomic(
  'source-revocation-delayed', 'd3000000-0000-4000-8000-000000000001', 'd3000000-0000-4000-8000-000000000002',
  'sandbox', now() - interval '2 hours', repeat('8', 64), 'premium_transfer_source_transaction_authority_missing'
), 'newer source revocation removes provider authority before a delayed transfer');
insert into public.user_entitlements(user_id, entitlement_key, status, source, starts_at, expires_at, metadata)
values
  ('d4000000-0000-4000-8000-000000000001', 'premium', 'active', 'operator_grant', now() - interval '1 day', now() + interval '30 days', '{"denial_fixture":"manual"}'),
  ('d5000000-0000-4000-8000-000000000001', 'premium', 'active', 'migration', now() - interval '1 day', now() + interval '30 days', '{"denial_fixture":"migration"}'),
  ('d6000000-0000-4000-8000-000000000001', 'premium', 'active', 'test_grant', now() - interval '1 day', now() + interval '30 days', '{"denial_fixture":"test"}');
select ok(pg_temp.transfer_denial_is_atomic(
  'manual-source-denial', 'd4000000-0000-4000-8000-000000000001', 'd4000000-0000-4000-8000-000000000002',
  'sandbox', now(), repeat('9', 64), 'premium_transfer_source_transaction_authority_missing'
), 'manual Premium entitlement cannot substitute for provider-backed source authority');
select ok(pg_temp.transfer_denial_is_atomic(
  'migration-source-denial', 'd5000000-0000-4000-8000-000000000001', 'd5000000-0000-4000-8000-000000000002',
  'sandbox', now(), repeat('a', 64), 'premium_transfer_source_transaction_authority_missing'
), 'migration Premium entitlement cannot substitute for provider-backed source authority');
select ok(pg_temp.transfer_denial_is_atomic(
  'test-source-denial', 'd6000000-0000-4000-8000-000000000001', 'd6000000-0000-4000-8000-000000000002',
  'sandbox', now(), repeat('b', 64), 'premium_transfer_source_transaction_authority_missing'
), 'test-only Premium entitlement cannot substitute for provider-backed source authority');
do $setup$
begin
  perform pg_temp.seed_transfer_source('google-play-source', 'd7000000-0000-4000-8000-000000000001');
  update public.access_grants set provider = 'revenuecat_google_play'
  where user_id = 'd7000000-0000-4000-8000-000000000001' and grant_type = 'premium';
end;
$setup$;
select ok(pg_temp.transfer_denial_is_atomic(
  'google-play-source-denial', 'd7000000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000002',
  'sandbox', now(), repeat('c', 64), 'premium_transfer_source_transaction_authority_missing'
), 'Google Play source grant cannot authorize the App Store-only transfer wrapper');
do $setup$
begin
  perform pg_temp.seed_transfer_source('target-product-source', 'd8000000-0000-4000-8000-000000000001');
  insert into public.monetization_products(id, product_key, product_type, display_name, provider, provider_product_id, revenuecat_entitlement, environment, status, metadata)
  values ('b2000000-0000-4000-8000-000000000001', 'b2-conflicting-premium-product', 'premium_subscription', 'B2 conflicting Premium fixture', 'revenuecat', 'b2.conflicting.premium', 'premium', 'sandbox', 'sandbox', '{"test_only":true}');
  insert into public.access_grants(user_id, grant_type, source_type, product_id, provider, environment, status, starts_at, expires_at, metadata)
  values ('d8000000-0000-4000-8000-000000000002', 'premium', 'setup', 'b2000000-0000-4000-8000-000000000001', 'revenuecat_app_store', 'sandbox', 'sandbox_only', now() - interval '1 day', now() + interval '30 days', '{"viewer_access_only":true,"authority_granted":false,"payout_access":false}');
end;
$setup$;
select ok(pg_temp.transfer_denial_is_atomic(
  'target-product-conflict', 'd8000000-0000-4000-8000-000000000001', 'd8000000-0000-4000-8000-000000000002',
  'sandbox', now(), repeat('d', 64), 'transfer_target_grant_conflict'
), 'target Premium grant for a distinct product remains a hard conflict');
select ok(
  pg_get_functiondef('public.process_revenuecat_premium_transfer_atomic_internal(text,uuid,uuid,text,timestamptz,text,text)'::regprocedure)
    like '%mapping."platform" = ''ios''%'
  and pg_get_functiondef('public.process_revenuecat_premium_transfer_atomic_internal(text,uuid,uuid,text,timestamptz,text,text)'::regprocedure)
    like '%mapping."store" = ''app_store''%'
  and pg_get_functiondef('public.process_revenuecat_premium_transfer_atomic_internal(text,uuid,uuid,text,timestamptz,text,text)'::regprocedure)
    like '%mapping."provider" = ''revenuecat_app_store''%',
  'database wrapper resolves only the verified iOS App Store mapping; provider verification remains at the Edge boundary'
);
do $setup$
begin
  perform pg_temp.apply_premium_event('target-renewal-source', 'INITIAL_PURCHASE', 'd9000000-0000-4000-8000-000000000001', 'active', now() - interval '4 hours', now() + interval '30 days');
  perform pg_temp.apply_premium_event('target-renewal-target', 'INITIAL_PURCHASE', 'd9000000-0000-4000-8000-000000000002', 'active', now() - interval '4 hours', now() + interval '30 days');
  perform pg_temp.apply_premium_event('target-renewal-newer', 'RENEWAL', 'd9000000-0000-4000-8000-000000000002', 'active', now() - interval '1 hour', now() + interval '60 days');
end;
$setup$;
select ok(pg_temp.transfer_denial_is_atomic(
  'target-renewal-delayed', 'd9000000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000002',
  'sandbox', now() - interval '2 hours', repeat('e', 64), 'transfer_event_stale'
), 'first-time delayed transfer cannot overwrite newer target renewal authority');
do $setup$
begin
  perform pg_temp.apply_premium_event('equal-revocation-source-a', 'INITIAL_PURCHASE', 'da000000-0000-4000-8000-000000000001', 'active', date_trunc('hour', now()) - interval '4 hours', now() + interval '30 days');
  perform pg_temp.apply_premium_event('equal-revocation-a', 'REVOCATION', 'da000000-0000-4000-8000-000000000001', 'revoked', date_trunc('hour', now()), now() + interval '30 days');
end;
$setup$;
select ok(pg_temp.transfer_denial_is_atomic(
  'equal-revocation-transfer-a', 'da000000-0000-4000-8000-000000000001', 'da000000-0000-4000-8000-000000000002',
  'sandbox', date_trunc('hour', now()), repeat('f', 64), 'premium_transfer_source_transaction_authority_missing'
), 'equal-time revocation-first schedule denies transfer without partial state');
do $setup$
begin
  perform pg_temp.apply_premium_event('equal-revocation-source-b', 'INITIAL_PURCHASE', 'db000000-0000-4000-8000-000000000001', 'active', date_trunc('hour', now()) - interval '4 hours', now() + interval '30 days');
  perform public.process_revenuecat_premium_transfer_atomic('equal-revocation-transfer-b', 'db000000-0000-4000-8000-000000000001', 'db000000-0000-4000-8000-000000000002', 'sandbox', date_trunc('hour', now()), repeat('1', 64));
  perform pg_temp.apply_premium_event('equal-revocation-b', 'REVOCATION', 'db000000-0000-4000-8000-000000000002', 'revoked', date_trunc('hour', now()), now() + interval '30 days');
end;
$setup$;
select is(
  array[
    not exists (select 1 from public.user_entitlements where user_id = 'da000000-0000-4000-8000-000000000002' and entitlement_key = 'premium' and status in ('active', 'trialing', 'grace_period')),
    (select status = 'revoked' from public.user_entitlements where user_id = 'db000000-0000-4000-8000-000000000002' and entitlement_key = 'premium')
  ], array[true, true],
  'both equal-time transfer-versus-revocation arrival orders converge without an active target'
);
do $setup$
begin
  perform pg_temp.seed_transfer_source('duplicate-participant-source', 'dc000000-0000-4000-8000-000000000001');
  perform public.process_revenuecat_premium_transfer_atomic('duplicate-participant-event', 'dc000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000000002', 'sandbox', date_trunc('hour', now()), repeat('2', 64));
end;
$setup$;
select ok(pg_temp.transfer_denial_is_atomic(
  'duplicate-participant-event', 'dc000000-0000-4000-8000-000000000003', 'dc000000-0000-4000-8000-000000000002',
  'sandbox', date_trunc('hour', now()), repeat('2', 64), 'revenuecat_premium_transfer_event_id_identity_mismatch'
), 'same transfer event identity cannot substitute a different source user');
select ok(pg_temp.transfer_denial_is_atomic(
  'duplicate-participant-event', 'dc000000-0000-4000-8000-000000000001', 'dc000000-0000-4000-8000-000000000004',
  'sandbox', date_trunc('hour', now()), repeat('2', 64), 'revenuecat_premium_transfer_event_id_identity_mismatch'
), 'same transfer event identity cannot substitute a different target user');
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
select ok(pg_temp.transfer_denial_is_atomic(
    'ordering-delayed-transfer-1',
    'c1000000-0000-4000-8000-000000000001',
    'c1000000-0000-4000-8000-000000000002',
    'sandbox',
    date_trunc('hour', now()) - interval '2 hours',
    repeat('5', 64),
    'transfer_event_stale'
  ),
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
    repeat('6', 64)
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
select ok(pg_temp.transfer_denial_is_atomic(
    'ordering-delayed-transfer-3',
    'c3000000-0000-4000-8000-000000000001',
    'c3000000-0000-4000-8000-000000000002',
    'sandbox',
    date_trunc('hour', now()) - interval '2 hours',
    repeat('7', 64),
    'premium_transfer_source_transaction_authority_missing'
  ),
  'newer source expiration removes provider authority before a delayed transfer'
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
select ok(pg_temp.transfer_denial_is_atomic(
    'ordering-delayed-transfer-4',
    'c4000000-0000-4000-8000-000000000001',
    'c4000000-0000-4000-8000-000000000002',
    'sandbox',
    now() - interval '2 hours',
    repeat('8', 64),
    'premium_transfer_source_transaction_authority_missing'
  ),
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
    date_trunc('hour', now()) - interval '2 hours',
    repeat('9', 64)
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
    date_trunc('hour', now()) - interval '2 hours',
    repeat('9', 64)
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
select lives_ok(
  $$select pg_temp.apply_premium_event(
    'reverse-source-6', 'INITIAL_PURCHASE',
    'c6000000-0000-4000-8000-000000000001',
    'active', timestamptz '2026-07-30 12:00:00+00', timestamptz '2099-08-30 12:00:00+00'
  )$$,
  'reverse-order source begins with older ordinary authority'
);
select lives_ok(
  $$select public.process_revenuecat_premium_transfer_atomic(
    'reverse-transfer-6',
    'c6000000-0000-4000-8000-000000000001',
    'c6000000-0000-4000-8000-000000000002',
    'sandbox',
    timestamptz '2026-07-30 15:00:00+00',
    repeat('a', 64)
  )$$,
  'newer transfer commits before waiting older ordinary events'
);
select throws_ok(
  $$select pg_temp.apply_premium_event(
    'reverse-renewal-6', 'RENEWAL',
    'c6000000-0000-4000-8000-000000000001',
    'active', timestamptz '2026-07-30 13:00:00+00', timestamptz '2099-09-30 12:00:00+00'
  )$$,
  'revenuecat_premium_original_transaction_subject_mismatch',
  'an older source renewal cannot rebind the transferred original transaction'
);
select is(
  (select pg_temp.apply_premium_event(
    'reverse-refund-6', 'REFUND',
    'c6000000-0000-4000-8000-000000000002',
    'revoked', timestamptz '2026-07-30 13:00:00+00', timestamptz '2099-08-30 12:00:00+00'
  )->>'reason'),
  'terminal_dispatch_stale_premium_event',
  'an older target refund is consumed without overwriting newer transfer authority'
);
select is(
  (select status from public.user_entitlements
   where user_id = 'c6000000-0000-4000-8000-000000000001'
     and entitlement_key = 'premium'),
  'revoked',
  'rejected older ordinary events preserve the transferred source state'
);
select is(
  (select status from public.user_entitlements
   where user_id = 'c6000000-0000-4000-8000-000000000002'
     and entitlement_key = 'premium'),
  'active',
  'rejected older ordinary events preserve the transferred target state'
);
select throws_ok(
  $$select pg_temp.apply_premium_event(
    'reverse-source-6', 'INITIAL_PURCHASE',
    'c6000000-0000-4000-8000-000000000001',
    'active', timestamptz '2026-07-30 12:00:00+00', timestamptz '2099-08-30 12:00:00+00'
  )$$,
  'revenuecat_premium_original_transaction_subject_mismatch',
  'an exact old source delivery cannot rebind the transferred original transaction'
);
select is(
  (select status from public.user_entitlements
   where user_id = 'c6000000-0000-4000-8000-000000000001'
     and entitlement_key = 'premium'),
  'revoked',
  'exact stale duplicate cannot replay its old active state'
);
select throws_ok(
  $$select pg_temp.apply_premium_event(
    'reverse-source-6', 'INITIAL_PURCHASE',
    'c6000000-0000-4000-8000-000000000002',
    'active', timestamptz '2026-07-30 12:00:00+00', timestamptz '2099-08-30 12:00:00+00'
  )$$,
  'revenuecat_premium_event_id_identity_mismatch',
  'duplicate event identity cannot move between transfer participants'
);
select lives_ok(
  $$select pg_temp.seed_transfer_source('equal-source-a', 'c7000000-0000-4000-8000-000000000001')$$,
  'equal-time renewal-first source is provider-backed'
);
select lives_ok(
  $$select pg_temp.apply_premium_event(
    'equal-renewal-a', 'RENEWAL',
    'c7000000-0000-4000-8000-000000000001',
    'active', date_trunc('hour', now()), now() + interval '60 days'
  )$$,
  'equal-time renewal commits first'
);
select lives_ok(
  $$select public.process_revenuecat_premium_transfer_atomic(
    'equal-transfer-a',
    'c7000000-0000-4000-8000-000000000001',
    'c7000000-0000-4000-8000-000000000002',
    'sandbox', date_trunc('hour', now()), repeat('b', 64)
  )$$,
  'equal-time transfer outranks renewal regardless of arrival order'
);
select is(
  (select status from public.user_entitlements
   where user_id = 'c7000000-0000-4000-8000-000000000002'
     and entitlement_key = 'premium'),
  'active',
  'renewal-first equal-time schedule converges on the transfer target'
);
select lives_ok(
  $$select pg_temp.seed_transfer_source('equal-source-b', 'c8000000-0000-4000-8000-000000000001')$$,
  'equal-time transfer-first source is provider-backed'
);
select lives_ok(
  $$select public.process_revenuecat_premium_transfer_atomic(
    'equal-transfer-b',
    'c8000000-0000-4000-8000-000000000001',
    'c8000000-0000-4000-8000-000000000002',
    'sandbox', date_trunc('hour', now()), repeat('c', 64)
  )$$,
  'equal-time transfer commits first'
);
select throws_ok(
  $$select pg_temp.apply_premium_event(
    'equal-renewal-b', 'RENEWAL',
    'c8000000-0000-4000-8000-000000000001',
    'active', date_trunc('hour', now()), now() + interval '60 days'
  )$$,
  'revenuecat_premium_original_transaction_subject_mismatch',
  'equal-time renewal cannot rebind transferred original-transaction authority'
);
select is(
  (select status from public.user_entitlements
   where user_id = 'c8000000-0000-4000-8000-000000000002'
     and entitlement_key = 'premium'),
  'active',
  'transfer-first equal-time schedule converges on the same target'
);
select lives_ok(
  $$select pg_temp.seed_transfer_source('equal-source-c', 'c9000000-0000-4000-8000-000000000001')$$,
  'equal-time refund-first source is provider-backed'
);
select lives_ok(
  $$select pg_temp.apply_premium_event(
    'equal-refund-c', 'REFUND',
    'c9000000-0000-4000-8000-000000000001',
    'revoked', date_trunc('hour', now()), now() + interval '30 days'
  )$$,
  'equal-time refund commits first'
);
select ok(pg_temp.transfer_denial_is_atomic(
    'equal-transfer-c',
    'c9000000-0000-4000-8000-000000000001',
    'c9000000-0000-4000-8000-000000000002',
    'sandbox', date_trunc('hour', now()), repeat('d', 64),
    'premium_transfer_source_transaction_authority_missing'
  ),
  'equal-time transfer cannot reactivate a refunded source'
);
select is(
  (select count(*)::integer from public.user_entitlements
   where user_id = 'c9000000-0000-4000-8000-000000000002'
     and entitlement_key = 'premium'),
  0,
  'refund-first equal-time denial creates no target state'
);
select lives_ok(
  $$select pg_temp.seed_transfer_source('equal-source-d', 'ca000000-0000-4000-8000-000000000001')$$,
  'equal-time transfer-then-refund source is provider-backed'
);
select lives_ok(
  $$select public.process_revenuecat_premium_transfer_atomic(
    'equal-transfer-d',
    'ca000000-0000-4000-8000-000000000001',
    'ca000000-0000-4000-8000-000000000002',
    'sandbox', date_trunc('hour', now()), repeat('e', 64)
  )$$,
  'equal-time transfer commits before refund'
);
select lives_ok(
  $$select pg_temp.apply_premium_event(
    'equal-refund-d', 'REFUND',
    'ca000000-0000-4000-8000-000000000002',
    'revoked', date_trunc('hour', now()), now() + interval '30 days'
  )$$,
  'higher-ranked equal-time refund supersedes transfer target authority'
);
select is(
  (select status from public.user_entitlements
   where user_id = 'ca000000-0000-4000-8000-000000000002'
     and entitlement_key = 'premium'),
  'revoked',
  'both equal-time refund schedules converge without an active target'
);
select is(
  array[
    public.revenuecat_premium_authority_rank_internal('CANCELLATION', false),
    public.revenuecat_premium_authority_rank_internal('INITIAL_PURCHASE', false),
    public.revenuecat_premium_authority_rank_internal('RENEWAL', false),
    public.revenuecat_premium_authority_rank_internal('REVOCATION', true),
    public.revenuecat_premium_authority_rank_internal('EXPIRATION', false),
    public.revenuecat_premium_authority_rank_internal('REFUND', false),
    public.revenuecat_premium_authority_rank_internal('REVOCATION', false),
    public.revenuecat_premium_authority_rank_internal('UNKNOWN', false)
  ],
  array[1, 2, 3, 4, 5, 6, 7, 0]::smallint[],
  'database authority ranks exactly match the merged RevenueCat state model'
);
select ok(
  public.revenuecat_premium_authority_is_newer_internal(
    timestamptz '2026-07-30 12:00:00+00', 'RENEWAL', 'z-event', false,
    timestamptz '2026-07-30 12:00:00+00', 'RENEWAL', 'a-event', false
  ),
  'lexically higher provider event id wins an otherwise equal authority tuple'
);
select ok(
  not public.revenuecat_premium_authority_is_newer_internal(
    timestamptz '2026-07-30 12:00:00+00', 'RENEWAL', 'a-event', false,
    timestamptz '2026-07-30 12:00:00+00', 'RENEWAL', 'z-event', false
  ),
  'lexically lower provider event id cannot overwrite an equal-rank candidate'
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
  pg_get_functiondef(
    'public.process_revenuecat_premium_event_ordered_internal(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)'::regprocedure
  ) like '%lock table public."monetization_products" in share mode%',
  'ordinary Premium ordering protects its product-catalog snapshot'
);
select ok(
  strpos(
    pg_get_functiondef(
      'public.process_revenuecat_premium_event_ordered_internal(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)'::regprocedure
    ),
    'revenuecat-premium:'
  ) < strpos(
    pg_get_functiondef(
      'public.process_revenuecat_premium_event_ordered_internal(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)'::regprocedure
    ),
    'revenuecat-event:'
  ),
  'ordinary Premium product authority lock precedes its event lock'
);
select ok(
  pg_get_functiondef(
    'public.process_revenuecat_premium_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)'::regprocedure
  ) like '%revenuecat_premium_transaction_authority%',
  'service-accessible Premium RPC binds exact original-transaction authority'
);
select ok(
  not has_function_privilege(
    'service_role',
    'public.process_revenuecat_premium_event_ordered_internal(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)',
    'EXECUTE'
  ),
  'service role cannot bypass ordinary Premium ordering'
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
  not has_function_privilege(
    'anon',
    'public.process_revenuecat_premium_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)',
    'EXECUTE'
  ),
  'anon cannot execute ordinary Premium reconciliation'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.process_revenuecat_premium_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)',
    'EXECUTE'
  ),
  'authenticated clients cannot execute ordinary Premium reconciliation'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.process_revenuecat_premium_event_atomic(text,text,text,uuid,text,text,text,text,timestamptz,timestamptz,timestamptz,integer,text,text,text,text,text,uuid,uuid,text)',
    'EXECUTE'
  ),
  'service role reaches Premium only through the exact original-transaction wrapper'
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
