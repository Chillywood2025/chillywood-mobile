begin;
select plan(62);

insert into auth.users (id, is_sso_user, is_anonymous)
values
  ('44444444-4444-4444-4444-444444444444', false, false),
  ('66666666-6666-6666-6666-666666666666', false, false),
  ('77777777-7777-7777-7777-777777777777', false, false),
  ('99999999-9999-9999-9999-999999999999', false, false),
  ('aaaaaaaa-1111-1111-1111-111111111111', false, false),
  ('bbbbbbbb-1111-1111-1111-111111111111', false, false)
on conflict (id) do nothing;

create temporary table revenuecat_creator_authority_fixture as
select row_number() over (order by candidate_number)::integer as fixture_index, creator_id
from (
  select
    candidate_number,
    md5('revenuecat-atomic-creator:' || candidate_number::text)::uuid as creator_id
  from generate_series(1, 1000) candidate_number
) candidates
where mod(hashtextextended('chillywood-wave1-us-rollout-v1:' || creator_id::text, 20260814), 100) = 0
order by candidate_number
limit 3;

insert into auth.users (id, is_sso_user, is_anonymous)
select creator_id, false, false
from pg_temp.revenuecat_creator_authority_fixture;

do $$
declare
  creator_fixture record;
  eligibility_result jsonb;
begin
  for creator_fixture in
    select fixture_index, creator_id
    from pg_temp.revenuecat_creator_authority_fixture
    order by fixture_index
  loop
    select public.wave1_evaluate_creator_eligibility(
      creator_fixture.creator_id,
      jsonb_build_object(
        'accountStatus', 'ACTIVE',
        'age18Plus', true,
        'legalAccepted', true,
        'creatorRole', true,
        'moderationState', 'CLEAR',
        'market', 'UNITED_STATES',
        'rolloutEligible', false,
        'platformCapability', true,
        'providerEligible', true,
        'kycComplete', true,
        'taxComplete', true,
        'sanctionsClear', true,
        'payoutEligible', true,
        'inputVersions', jsonb_build_object('evaluationSequence', 1)
      ),
      'revenuecat-atomic-fixture:' || creator_fixture.fixture_index::text,
      'local_pgtap'
    ) into eligibility_result;
    if eligibility_result->>'state' <> 'VERIFIED' then
      raise exception 'revenuecat_creator_fixture_not_verified';
    end if;
  end loop;
end;
$$;

insert into public.wave1_legal_acceptances (
  user_id, subject_hash, document_key, document_version, market,
  role_key, capability, session_generation, authority_source
)
select
  creator.creator_id, public.wave1_sha256(creator.creator_id::text),
  document.document_key, document.version, document.market,
  'member', document.capability, 'revenuecat-atomic-fixture', 'service_reconciliation'
from pg_temp.revenuecat_creator_authority_fixture creator
cross join public.wave1_legal_document_versions document
where document.active
  and document.market = 'UNITED_STATES'
  and (document.document_key, document.capability) in (
    ('terms', 'account'),
    ('privacy', 'account'),
    ('community_guidelines', 'account'),
    ('creator_terms', 'creator'),
    ('money_terms', 'creator_money')
  );

update public.platform_money_kill_switches
set state = case
  when key in ('revenuecat_app_store_enabled', 'provider_webhooks_enabled', 'tips_enabled', 'watch_party_tickets_enabled') then 'sandbox_only'
  when key in ('live_money_enabled', 'payouts_enabled') then 'off'
  else state
end
where key in (
  'revenuecat_app_store_enabled', 'provider_webhooks_enabled', 'tips_enabled',
  'watch_party_tickets_enabled', 'live_money_enabled', 'payouts_enabled'
);

create function pg_temp.apply_premium(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_status text,
  p_expires_at timestamptz,
  p_failpoint text default null
)
returns jsonb
language sql
volatile
as $$
  select public.process_revenuecat_premium_event_atomic_internal(
    'revenuecat_app_store', p_event_id, p_event_type, p_user_id,
    mapping.provider_product_id, null, 'sandbox', p_status,
    timezone('utc'::text, now()) - interval '30 days', p_expires_at,
    timezone('utc'::text, now()), mapping.reference_price_minor,
    mapping.reference_currency, 'sha256-normalized-premium-test', 'NORMAL',
    'app_store', 'ios', mapping.id, mapping.product_id, p_failpoint
  )
  from public.monetization_product_store_mappings mapping
  where mapping.provider = 'revenuecat_app_store'
    and mapping.provider_product_id = 'com.chillywood.premium.monthly'
  limit 1;
$$;

create function pg_temp.apply_consumable(
  p_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_provider_product_id text,
  p_failpoint text default null,
  p_amount_minor integer default null,
  p_currency text default null,
  p_original_transaction_id text default 'sandbox-original-transaction'
)
returns jsonb
language plpgsql
volatile
as $$
declare
  v_result jsonb;
begin
  if p_failpoint is null then
    select public.process_revenuecat_consumable_event_atomic(
      p_event_id, p_event_type, p_user_id, mapping.provider_product_id,
      'sandbox', timezone('utc'::text, now()), null,
      coalesce(p_amount_minor, mapping.reference_price_minor), coalesce(p_currency, mapping.reference_currency),
      'sha256-normalized-consumable-test', p_original_transaction_id
    ) into v_result
    from public.monetization_product_store_mappings mapping
    where mapping.provider = 'revenuecat_app_store'
      and mapping.provider_product_id = p_provider_product_id
    limit 1;
  else
    select public.process_revenuecat_consumable_event_atomic_internal(
      p_event_id, p_event_type, p_user_id, mapping.provider_product_id,
      'sandbox', timezone('utc'::text, now()), null,
      coalesce(p_amount_minor, mapping.reference_price_minor), coalesce(p_currency, mapping.reference_currency),
      'sha256-normalized-consumable-test', p_original_transaction_id, p_failpoint
    ) into v_result
    from public.monetization_product_store_mappings mapping
    where mapping.provider = 'revenuecat_app_store'
      and mapping.provider_product_id = p_provider_product_id
    limit 1;
  end if;
  return v_result;
end;
$$;

create function pg_temp.premium_failure_rolled_back(p_stage text)
returns boolean
language plpgsql
as $$
declare
  v_event_id text := 'premium-failure-' || p_stage;
begin
  perform pg_temp.apply_premium(
    v_event_id, 'INITIAL_PURCHASE', '88888888-8888-8888-8888-888888888888',
    'active', now() + interval '30 days', p_stage
  );
  return false;
exception when others then
  return not exists (
      select 1 from public.provider_events where provider_event_id = v_event_id
    )
    and not exists (
      select 1 from public.billing_events where metadata->>'revenuecat_event_id' = v_event_id
    )
    and not exists (
      select 1 from public.user_entitlements where user_id = '88888888-8888-8888-8888-888888888888'
    )
    and not exists (
      select 1 from public.access_grants where user_id = '88888888-8888-8888-8888-888888888888'
    )
    and not exists (
      select 1 from public.money_access_ledger_events where user_id = '88888888-8888-8888-8888-888888888888'
    );
end;
$$;

create function pg_temp.consumable_failure_rolled_back(p_stage text)
returns boolean
language plpgsql
as $$
declare
  v_event_id text := 'consumable-failure-' || p_stage;
begin
  perform pg_temp.apply_consumable(
    v_event_id, 'INITIAL_PURCHASE', '99999999-9999-9999-9999-999999999999',
    'com.chillywood.seatpass.tier1', p_stage
  );
  return false;
exception when others then
  return not exists (
      select 1 from public.provider_events where provider_event_id = v_event_id
    )
    and not exists (
      select 1 from public.access_grants where user_id = '99999999-9999-9999-9999-999999999999'
    )
    and not exists (
      select 1 from public.money_access_ledger_events where user_id = '99999999-9999-9999-9999-999999999999'
    )
    and (select status = 'pending' from public.money_purchase_intents where id = '90000000-0000-0000-0000-000000000001');
end;
$$;

select is(
  (select reference_price_minor from public.monetization_product_store_mappings where provider_product_id = 'com.chillywood.premium.monthly'),
  999,
  'monthly App Store Premium mapping is 999'
);
select is(
  (select reference_price_minor from public.monetization_product_store_mappings where provider_product_id = 'com.chillywood.premium.yearly'),
  9999,
  'yearly App Store Premium mapping is 9999'
);
select is(
  (select count(*)::integer from public.monetization_product_store_mappings
   where provider_product_id in ('com.chillywood.premium.monthly', 'com.chillywood.premium.yearly')
     and platform = 'ios' and store = 'app_store' and provider = 'revenuecat_app_store'
     and environment = 'sandbox' and status = 'sandbox'),
  2,
  'Premium mappings remain exact iOS App Store sandbox rows'
);
select is(
  (select count(*)::integer from public.monetization_product_store_mappings
   where platform = 'android' and (store <> 'google_play' or provider <> 'revenuecat_google_play')),
  0,
  'no Android mapping is rewritten to the App Store provider'
);

select lives_ok(
  $$select pg_temp.apply_premium('premium-initial-1', 'INITIAL_PURCHASE', '44444444-4444-4444-4444-444444444444', 'active', now() + interval '30 days')$$,
  'Premium initial purchase is atomic'
);
select is((select status from public.user_entitlements where user_id = '44444444-4444-4444-4444-444444444444' and entitlement_key = 'premium'), 'active', 'initial purchase activates entitlement');
select is((select status from public.access_grants where user_id = '44444444-4444-4444-4444-444444444444' and grant_type = 'premium'), 'sandbox_only', 'initial purchase grants sandbox Premium access');
select is((select payable_state from public.money_access_ledger_events ledger join public.provider_events event on event.id = ledger.provider_event_id where event.provider_event_id = 'premium-initial-1'), 'not_payable', 'Premium ledger is not payable');

select lives_ok(
  $$select pg_temp.apply_premium('premium-initial-1', 'INITIAL_PURCHASE', '44444444-4444-4444-4444-444444444444', 'active', now() + interval '30 days')$$,
  'duplicate Premium delivery is retry safe'
);
select is((select count(*)::integer from public.provider_events where provider_event_id = 'premium-initial-1'), 1, 'duplicate Premium event creates one provider event');
select is((select count(*)::integer from public.billing_events where metadata->>'revenuecat_event_id' = 'premium-initial-1'), 1, 'duplicate Premium event creates one billing event');
select is((select count(*)::integer from public.money_access_ledger_events ledger join public.provider_events event on event.id = ledger.provider_event_id where event.provider_event_id = 'premium-initial-1'), 1, 'duplicate Premium event creates one ledger event');

select lives_ok(
  $$select pg_temp.apply_premium('premium-renewal-1', 'RENEWAL', '44444444-4444-4444-4444-444444444444', 'active', now() + interval '60 days')$$,
  'Premium renewal applies atomically'
);
select lives_ok(
  $$select pg_temp.apply_premium('premium-cancel-1', 'CANCELLATION', '44444444-4444-4444-4444-444444444444', 'active', now() + interval '60 days')$$,
  'Premium cancellation applies atomically'
);
select is((select status from public.user_entitlements where user_id = '44444444-4444-4444-4444-444444444444' and entitlement_key = 'premium'), 'active', 'cancellation retains entitlement through paid period');
select is((select status from public.access_grants where user_id = '44444444-4444-4444-4444-444444444444' and grant_type = 'premium'), 'sandbox_only', 'cancellation retains sandbox access through paid period');

select lives_ok(
  $$select pg_temp.apply_premium('premium-billing-1', 'BILLING_ISSUE', '44444444-4444-4444-4444-444444444444', 'grace_period', now() + interval '7 days')$$,
  'Premium billing grace event applies atomically'
);
select is((select status from public.user_entitlements where user_id = '44444444-4444-4444-4444-444444444444' and entitlement_key = 'premium'), 'grace_period', 'billing issue records grace period');
select is((select status from public.access_grants where user_id = '44444444-4444-4444-4444-444444444444' and grant_type = 'premium'), 'sandbox_only', 'grace period retains sandbox access');

select lives_ok(
  $$select pg_temp.apply_premium('premium-expire-1', 'EXPIRATION', '44444444-4444-4444-4444-444444444444', 'expired', now() - interval '1 minute')$$,
  'Premium expiration applies atomically'
);
select is((select status from public.user_entitlements where user_id = '44444444-4444-4444-4444-444444444444' and entitlement_key = 'premium'), 'expired', 'expiration expires entitlement');
select is((select status from public.access_grants where user_id = '44444444-4444-4444-4444-444444444444' and grant_type = 'premium'), 'expired', 'expiration expires access grant');

select lives_ok(
  $$select pg_temp.apply_premium('premium-refund-1', 'REFUND', '44444444-4444-4444-4444-444444444444', 'revoked', now() + interval '60 days')$$,
  'Premium refund applies atomically'
);
select is((select status from public.user_entitlements where user_id = '44444444-4444-4444-4444-444444444444' and entitlement_key = 'premium'), 'revoked', 'refund revokes entitlement');
select is((select status from public.access_grants where user_id = '44444444-4444-4444-4444-444444444444' and grant_type = 'premium'), 'revoked', 'refund revokes access grant');
select is((select payable_state from public.money_access_ledger_events ledger join public.provider_events event on event.id = ledger.provider_event_id where event.provider_event_id = 'premium-refund-1'), 'refunded', 'refund ledger cannot become payable');

select ok(pg_temp.premium_failure_rolled_back('after_provider_event'), 'Premium provider-event forced failure rolls back every write');
select ok(pg_temp.premium_failure_rolled_back('after_entitlement'), 'Premium entitlement forced failure rolls back every write');
select ok(pg_temp.premium_failure_rolled_back('after_billing_event'), 'Premium billing forced failure rolls back every write');
select ok(pg_temp.premium_failure_rolled_back('after_access_grant'), 'Premium access forced failure rolls back every write');
select ok(pg_temp.premium_failure_rolled_back('after_ledger_event'), 'Premium ledger forced failure rolls back every write');

insert into public.money_purchase_intents (
  id, user_id, product_id, product_key, product_type, provider, provider_product_id,
  source_type, source_id, creator_id, environment, status, amount_minor, currency,
  idempotency_key, expires_at, metadata
)
select
  '60000000-0000-0000-0000-000000000001', '66666666-6666-6666-6666-666666666666',
  mapping.product_id, product.product_key, product.product_type, mapping.provider,
  mapping.provider_product_id, 'creator_tip', '65000000-0000-0000-0000-000000000001',
  (select creator_id from pg_temp.revenuecat_creator_authority_fixture where fixture_index = 1), 'sandbox', 'pending',
  mapping.reference_price_minor, mapping.reference_currency, 'tip-intent-atomic-test',
  now() + interval '15 minutes', jsonb_build_object('sandbox_only', true, 'not_payable', true)
from public.monetization_product_store_mappings mapping
join public.monetization_products product on product.id = mapping.product_id
where mapping.provider_product_id = 'com.chillywood.tip.tier1';

select lives_ok(
  $$select pg_temp.apply_consumable('tip-initial-1', 'INITIAL_PURCHASE', '66666666-6666-6666-6666-666666666666', 'com.chillywood.tip.tier1')$$,
  'creator tip transaction is atomic'
);
select is((select count(*)::integer from public.user_entitlements where user_id = '66666666-6666-6666-6666-666666666666'), 0, 'creator tip creates no entitlement');
select is((select count(*)::integer from public.access_grants where user_id = '66666666-6666-6666-6666-666666666666'), 0, 'creator tip creates no access grant');
select is((select payable_state from public.money_access_ledger_events where user_id = '66666666-6666-6666-6666-666666666666'), 'not_payable', 'creator tip creates no payable balance');
select is((select status from public.money_purchase_intents where id = '60000000-0000-0000-0000-000000000001'), 'consumed', 'creator tip consumes exact purchase intent');
select lives_ok(
  $$select pg_temp.apply_consumable('tip-initial-1', 'INITIAL_PURCHASE', '66666666-6666-6666-6666-666666666666', 'com.chillywood.tip.tier1')$$,
  'duplicate creator tip delivery is retry safe'
);
select is((select count(*)::integer from public.provider_events where provider_event_id = 'tip-initial-1'), 1, 'duplicate tip creates one provider event');
select is((select count(*)::integer from public.money_access_ledger_events where user_id = '66666666-6666-6666-6666-666666666666'), 1, 'duplicate tip creates one ledger event');

insert into public.money_purchase_intents (
  id, user_id, product_id, product_key, product_type, provider, provider_product_id,
  source_type, source_id, creator_id, environment, status, amount_minor, currency,
  idempotency_key, expires_at, metadata
)
select
  '61000000-0000-0000-0000-000000000001', 'bbbbbbbb-1111-1111-1111-111111111111',
  mapping.product_id, product.product_key, product.product_type, mapping.provider,
  mapping.provider_product_id, 'creator_tip', '65100000-0000-0000-0000-000000000001',
  (select creator_id from pg_temp.revenuecat_creator_authority_fixture where fixture_index = 1), 'sandbox', 'pending',
  mapping.reference_price_minor, mapping.reference_currency, 'tip-intent-localized-storefront-test',
  now() + interval '15 minutes', jsonb_build_object('sandbox_only', true, 'not_payable', true)
from public.monetization_product_store_mappings mapping
join public.monetization_products product on product.id = mapping.product_id
where mapping.provider_product_id = 'com.chillywood.tip.tier1';

select lives_ok(
  $$select public.process_revenuecat_consumable_event_atomic(
    'tip-localized-eur-1', 'INITIAL_PURCHASE', 'bbbbbbbb-1111-1111-1111-111111111111',
    'com.chillywood.tip.tier1', 'sandbox', now(), null, 129, 'eur',
    'sha256-localized-consumable-test', 'localized-eur-original-transaction'
  )$$,
  'localized non-USD App Store consumable is accepted by permanent product and exact intent identity'
);
select is(
  (select amount_minor from public.money_access_ledger_events where user_id = 'bbbbbbbb-1111-1111-1111-111111111111'),
  129,
  'localized provider amount is recorded instead of the USD reference amount'
);
select is(
  (select currency from public.money_access_ledger_events where user_id = 'bbbbbbbb-1111-1111-1111-111111111111'),
  'eur',
  'localized provider currency is recorded'
);
select ok(
  (select (metadata->>'localized_storefront_price')::boolean from public.provider_events where provider_event_id = 'tip-localized-eur-1'),
  'provider event retains explicit localized-versus-reference metadata'
);

insert into public.money_purchase_intents (
  id, user_id, product_id, product_key, product_type, provider, provider_product_id,
  source_type, source_id, creator_id, environment, status, amount_minor, currency,
  idempotency_key, expires_at, metadata
)
select
  '70000000-0000-0000-0000-000000000001', '77777777-7777-7777-7777-777777777777',
  mapping.product_id, product.product_key, product.product_type, mapping.provider,
  mapping.provider_product_id, 'watch_party_live', '75000000-0000-0000-0000-000000000001',
  (select creator_id from pg_temp.revenuecat_creator_authority_fixture where fixture_index = 2), 'sandbox', 'pending',
  mapping.reference_price_minor, mapping.reference_currency, 'seat-intent-atomic-test',
  now() + interval '15 minutes', jsonb_build_object('sandbox_only', true, 'not_payable', true)
from public.monetization_product_store_mappings mapping
join public.monetization_products product on product.id = mapping.product_id
where mapping.provider_product_id = 'com.chillywood.seatpass.tier1';

select lives_ok(
  $$select pg_temp.apply_consumable('seat-initial-1', 'INITIAL_PURCHASE', '77777777-7777-7777-7777-777777777777', 'com.chillywood.seatpass.tier1')$$,
  'Seat Pass transaction is atomic'
);
select is((select count(*)::integer from public.access_grants where user_id = '77777777-7777-7777-7777-777777777777' and grant_type = 'watch_party_live_ticket'), 1, 'Seat Pass creates one viewer access grant');
select ok((select (metadata->>'viewer_access_only')::boolean and not (metadata->>'authority_granted')::boolean and not (metadata->>'speaker_authority')::boolean and not (metadata->>'moderator_authority')::boolean from public.access_grants where user_id = '77777777-7777-7777-7777-777777777777'), 'Seat Pass grant has viewer-only authority');
select is((select count(*)::integer from public.user_entitlements where user_id = '77777777-7777-7777-7777-777777777777'), 0, 'Seat Pass creates no entitlement');
select is((select payable_state from public.money_access_ledger_events where user_id = '77777777-7777-7777-7777-777777777777'), 'not_payable', 'Seat Pass creates no payable balance');
select is((select status from public.money_purchase_intents where id = '70000000-0000-0000-0000-000000000001'), 'consumed', 'Seat Pass consumes exact purchase intent');

select lives_ok(
  $$select pg_temp.apply_consumable('seat-refund-1', 'REFUND', '77777777-7777-7777-7777-777777777777', 'com.chillywood.seatpass.tier1')$$,
  'Seat Pass refund transaction is atomic'
);
select is((select status from public.access_grants where user_id = '77777777-7777-7777-7777-777777777777' and grant_type = 'watch_party_live_ticket'), 'refunded', 'Seat Pass refund revokes viewer access');
select is((select status from public.money_purchase_intents where id = '70000000-0000-0000-0000-000000000001'), 'revoked', 'Seat Pass refund revokes consumed intent');

select lives_ok(
  $$select pg_temp.apply_consumable('seat-missing-intent-1', 'INITIAL_PURCHASE', 'aaaaaaaa-1111-1111-1111-111111111111', 'com.chillywood.seatpass.tier1')$$,
  'missing purchase intent fails closed without partial writes'
);
select is((select status from public.provider_events where provider_event_id = 'seat-missing-intent-1'), 'ignored', 'missing intent provider event is finalized ignored');
select is((select count(*)::integer from public.money_access_ledger_events where user_id = 'aaaaaaaa-1111-1111-1111-111111111111'), 0, 'missing intent creates no ledger event');
select is((select count(*)::integer from public.access_grants where user_id = 'aaaaaaaa-1111-1111-1111-111111111111'), 0, 'missing intent creates no access grant');

insert into public.money_purchase_intents (
  id, user_id, product_id, product_key, product_type, provider, provider_product_id,
  source_type, source_id, creator_id, environment, status, amount_minor, currency,
  idempotency_key, expires_at, metadata
)
select
  '90000000-0000-0000-0000-000000000001', '99999999-9999-9999-9999-999999999999',
  mapping.product_id, product.product_key, product.product_type, mapping.provider,
  mapping.provider_product_id, 'watch_party_live', '95000000-0000-0000-0000-000000000001',
  (select creator_id from pg_temp.revenuecat_creator_authority_fixture where fixture_index = 3), 'sandbox', 'pending',
  mapping.reference_price_minor, mapping.reference_currency, 'seat-failure-intent-test',
  now() + interval '15 minutes', jsonb_build_object('sandbox_only', true, 'not_payable', true)
from public.monetization_product_store_mappings mapping
join public.monetization_products product on product.id = mapping.product_id
where mapping.provider_product_id = 'com.chillywood.seatpass.tier1';

select ok(pg_temp.consumable_failure_rolled_back('after_provider_event'), 'consumable provider-event forced failure rolls back every write');
select ok(pg_temp.consumable_failure_rolled_back('after_intent_lock'), 'consumable intent-lock forced failure rolls back every write');
select ok(pg_temp.consumable_failure_rolled_back('after_access_grant'), 'consumable access forced failure rolls back every write');
select ok(pg_temp.consumable_failure_rolled_back('after_ledger_event'), 'consumable ledger forced failure rolls back every write');
select ok(pg_temp.consumable_failure_rolled_back('after_intent_update'), 'consumable intent-update forced failure rolls back every write');

select is(
  (select count(*)::integer from public.reconcile_revenuecat_partial_provider_events(100)
   where provider_event_id in (select id from public.provider_events where provider_event_id <> 'seat-missing-intent-1')),
  0,
  'reconciliation readback reports no partial processed test event'
);

select * from finish();
rollback;
