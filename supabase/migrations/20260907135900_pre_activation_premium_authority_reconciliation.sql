-- Authenticated restore reconciliation for an already-active RevenueCat App
-- Store sandbox subscription. The caller is a server Edge Function that reads
-- the exact current RevenueCat customer, subscription, entitlement and
-- transaction chain with a secret read-only API key. This path creates no
-- provider transaction: it records a typed reconciliation snapshot and reuses
-- the deployed atomic Premium projector only inside this transaction.

create or replace function public."enforce_revenuecat_premium_reconciliation_rate_limit"(
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception 'premium_reconciliation_rate_limit_subject_required';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-reconciliation-rate-limit:' || p_user_id::text, 0
  ));
  perform public."enforce_abuse_rate_limit"(
    p_user_id::text,
    'revenuecat_premium_reconciliation',
    'current_customer',
    6,
    300,
    jsonb_build_object('source', 'revenuecat-premium-reconcile')
  );
end;
$$;

revoke all on function public."enforce_revenuecat_premium_reconciliation_rate_limit"(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public."enforce_revenuecat_premium_reconciliation_rate_limit"(uuid)
  to service_role;
comment on function public."enforce_revenuecat_premium_reconciliation_rate_limit"(uuid)
  is 'Service-only, per-user atomic limiter for RevenueCat Premium current-customer reads. It grants no entitlement, provider, money, payout, or room authority.';

create or replace function public."reconcile_revenuecat_premium_snapshot_atomic"(
  p_snapshot_id text,
  p_user_id uuid,
  p_revenuecat_subscription_id text,
  p_original_transaction_id text,
  p_provider_product_id text,
  p_entitlement_status text,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_observed_at timestamptz,
  p_raw_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc'::text, now());
  v_snapshot_id text := trim(coalesce(p_snapshot_id, ''));
  v_subscription_id text := trim(coalesce(p_revenuecat_subscription_id, ''));
  v_original_transaction_id text := trim(coalesce(p_original_transaction_id, ''));
  v_provider_product_id text := trim(coalesce(p_provider_product_id, ''));
  v_status text := lower(trim(coalesce(p_entitlement_status, '')));
  v_mapping public."monetization_product_store_mappings"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_binding public."revenuecat_premium_transaction_authority"%rowtype;
  v_existing_event public."provider_events"%rowtype;
  v_projected_event_id uuid;
  v_result jsonb;
  v_revenuecat_switch text;
  v_webhook_switch text;
  v_live_money_switch text;
  v_payouts_switch text;
  v_cashout_switch text;
begin
  if p_user_id is null
    or v_snapshot_id = '' or length(v_snapshot_id) > 512
    or v_snapshot_id <> coalesce(p_snapshot_id, '')
    or v_snapshot_id ~ '[[:cntrl:]]'
    or v_subscription_id = '' or length(v_subscription_id) > 512
    or v_subscription_id <> coalesce(p_revenuecat_subscription_id, '')
    or v_subscription_id ~ '[[:cntrl:]]'
    or v_original_transaction_id = '' or length(v_original_transaction_id) > 512
    or v_original_transaction_id <> coalesce(p_original_transaction_id, '')
    or v_original_transaction_id ~ '[[:cntrl:]]'
    or v_provider_product_id = '' or length(v_provider_product_id) > 512
    or v_provider_product_id <> coalesce(p_provider_product_id, '')
    or v_provider_product_id ~ '[[:cntrl:]]'
    or v_status not in ('active', 'trialing', 'grace_period')
    or coalesce(p_raw_payload_hash, '') !~ '^[0-9a-f]{64}$'
  then
    raise exception 'premium_reconciliation_identity_invalid';
  end if;
  if p_starts_at is null or p_starts_at > v_now + interval '5 minutes'
    or p_expires_at is null or p_expires_at <= v_now
    or p_expires_at <= p_starts_at
    or p_observed_at is null or p_observed_at > v_now + interval '5 minutes'
    or p_observed_at < p_starts_at
  then
    raise exception 'premium_reconciliation_period_invalid';
  end if;

  lock table public."monetization_products" in share mode;
  select mapping.* into v_mapping
  from public."monetization_product_store_mappings" mapping
  join public."monetization_products" product
    on product."id" = mapping."product_id"
   and product."product_type" = 'premium_subscription'
  where mapping."concept" = 'premium'
    and mapping."platform" = 'ios'
    and mapping."store" = 'app_store'
    and mapping."provider" = 'revenuecat_app_store'
    and mapping."provider_product_id" = v_provider_product_id
    and mapping."provider_base_plan_id" is null
    and mapping."environment" = 'sandbox'
    and mapping."status" = 'sandbox'
    and mapping."store_product_type" = 'auto_renewable_subscription'
    and mapping."unlocks_digital_access" is true
    and mapping."grants_livekit_authority" is false
    and mapping."creates_payable_balance" is false
  order by mapping."created_at", mapping."id"
  limit 1;
  if v_mapping."id" is null then
    raise exception 'premium_reconciliation_store_mapping_invalid';
  end if;
  select product.* into v_product
  from public."monetization_products" product
  where product."id" = v_mapping."product_id";

  select "state" into v_revenuecat_switch
  from public."platform_money_kill_switches"
  where "key" = 'revenuecat_app_store_enabled';
  select "state" into v_webhook_switch
  from public."platform_money_kill_switches"
  where "key" = 'provider_webhooks_enabled';
  select "state" into v_live_money_switch
  from public."platform_money_kill_switches"
  where "key" = 'live_money_enabled';
  select "state" into v_payouts_switch
  from public."platform_money_kill_switches"
  where "key" = 'payouts_enabled';
  select "state" into v_cashout_switch
  from public."platform_money_kill_switches"
  where "key" = 'cashout_enabled';
  if coalesce(v_revenuecat_switch, 'off') not in ('sandbox_only', 'on')
    or coalesce(v_webhook_switch, 'off') not in ('sandbox_only', 'on')
  then
    raise exception 'premium_reconciliation_sandbox_rail_disabled';
  end if;
  if coalesce(v_live_money_switch, 'off') <> 'off'
    or coalesce(v_payouts_switch, 'off') <> 'off'
    or coalesce(v_cashout_switch, 'off') <> 'off'
  then
    raise exception 'premium_reconciliation_pre_activation_switches_required';
  end if;
  if public."is_account_access_restricted"(p_user_id::text)
    or public."revenuecat_authority_quarantined_internal"(
      'revenuecat_app_store', p_user_id, 'sandbox'
    )
  then
    raise exception 'premium_reconciliation_subject_restricted';
  end if;
  if exists (
    select 1
    from public."user_entitlements" entitlement
    where entitlement."user_id" = p_user_id::text
      and entitlement."entitlement_key" = 'premium'
      and entitlement."source" = 'revenuecat'
      and entitlement."metadata"->>'environment' = 'production'
  ) then
    raise exception 'premium_reconciliation_cannot_override_production';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium:' || p_user_id::text || ':' || v_product."id"::text, 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-original:revenuecat_app_store:' || v_original_transaction_id, 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-original:revenuecat_app_store:' || v_original_transaction_id, 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-reconciliation:' || v_snapshot_id, 0
  ));

  select event.* into v_existing_event
  from public."provider_events" event
  where event."provider" = 'revenuecat_app_store'
    and event."idempotency_key" = 'RECONCILIATION:' || v_snapshot_id
  limit 1
  for update;
  if v_existing_event."id" is not null then
    if v_existing_event."provider_event_id" <> v_snapshot_id
      or v_existing_event."event_type" <> 'RECONCILIATION'
      or v_existing_event."user_id" is distinct from p_user_id
      or v_existing_event."product_id" is distinct from v_product."id"
      or v_existing_event."environment" <> 'sandbox'
      or v_existing_event."raw_payload_hash" is distinct from p_raw_payload_hash
      or v_existing_event."metadata"->>'original_transaction_id'
        is distinct from v_original_transaction_id
      or v_existing_event."metadata"->>'revenuecat_subscription_id'
        is distinct from v_subscription_id
    then
      raise exception 'premium_reconciliation_duplicate_identity_mismatch';
    end if;
    return jsonb_build_object(
      'status', 'duplicate_ignored',
      'eventType', 'RECONCILIATION',
      'eventId', v_snapshot_id,
      'userId', p_user_id,
      'environment', 'sandbox',
      'entitlementActive', public."premium_subject_has_finite_authority_internal"(p_user_id::text),
      'duplicateEvent', true,
      'liveMoneyAction', false
    );
  end if;

  if exists (
    select 1
    from public."revenuecat_consumable_transaction_intents" creator_binding
    where creator_binding."provider" = 'revenuecat_app_store'
      and creator_binding."original_transaction_id" = v_original_transaction_id
  ) or exists (
    select 1
    from public."revenuecat_unbound_initial_authority" creator_reservation
    where creator_reservation."provider" = 'revenuecat_app_store'
      and creator_reservation."original_transaction_id" = v_original_transaction_id
  ) or exists (
    select 1
    from public."revenuecat_unbound_terminal_authority" terminal_reservation
    where terminal_reservation."provider" = 'revenuecat_app_store'
      and terminal_reservation."original_transaction_id" = v_original_transaction_id
  ) then
    raise exception 'premium_reconciliation_cross_domain_transaction_reserved';
  end if;

  select transaction_authority.* into v_binding
  from public."revenuecat_premium_transaction_authority" transaction_authority
  where transaction_authority."provider" = 'revenuecat_app_store'
    and transaction_authority."original_transaction_id" = v_original_transaction_id
  for update;
  if v_binding."id" is not null and (
    v_binding."user_id" <> p_user_id
    or v_binding."environment" <> 'sandbox'
  ) then
    raise exception 'premium_reconciliation_cross_user_transaction';
  end if;
  if v_binding."id" is not null
    and v_binding."authority_state" = 'financial_terminal'
    and p_starts_at <= v_binding."latest_occurred_at"
  then
    raise exception 'premium_reconciliation_terminal_authority_not_superseded';
  end if;
  if public."premium_subject_has_finite_authority_internal"(p_user_id::text)
    and not exists (
      select 1
      from public."user_entitlements" entitlement
      join public."provider_events" event
        on event."provider_event_id" = entitlement."metadata"->>'revenuecat_event_id'
       and event."raw_payload_hash" = entitlement."metadata"->>'revenuecat_event_hash'
      where entitlement."user_id" = p_user_id::text
        and entitlement."entitlement_key" = 'premium'
        and event."provider" = 'revenuecat_app_store'
        and event."metadata"->>'original_transaction_id' = v_original_transaction_id
    )
  then
    raise exception 'premium_reconciliation_conflicting_active_authority';
  end if;

  if v_binding."id" is null then
    insert into public."revenuecat_premium_transaction_authority" (
      "provider", "original_transaction_id", "user_id", "environment",
      "current_product_id", "current_provider_product_id", "current_provider_base_plan_id",
      "first_event_id", "first_event_hash", "latest_event_id", "latest_event_hash",
      "latest_event_type", "latest_occurred_at", "latest_event_rank", "authority_state"
    ) values (
      'revenuecat_app_store', v_original_transaction_id, p_user_id, 'sandbox',
      v_product."id", v_provider_product_id, null,
      v_snapshot_id, p_raw_payload_hash, v_snapshot_id, p_raw_payload_hash,
      'RECONCILIATION', p_starts_at, 3, 'pending'
    ) returning * into v_binding;
  end if;

  v_result := public."process_revenuecat_premium_event_atomic_internal"(
    'revenuecat_app_store', v_snapshot_id, 'INITIAL_PURCHASE', p_user_id,
    v_provider_product_id, null, 'sandbox', v_status, p_starts_at, p_expires_at,
    p_starts_at, 0, 'usd', p_raw_payload_hash,
    case when v_status = 'trialing' then 'trial' else 'normal' end,
    'app_store', 'ios', v_mapping."id", v_product."id", null
  );
  v_projected_event_id := nullif(v_result->>'providerEventId', '')::uuid;
  if v_projected_event_id is null then
    raise exception 'premium_reconciliation_projection_missing';
  end if;

  update public."provider_events" event
  set "event_type" = 'RECONCILIATION',
      "idempotency_key" = 'RECONCILIATION:' || v_snapshot_id,
      "metadata" = coalesce(event."metadata", '{}'::jsonb) || jsonb_build_object(
        'lifecycle_event_type', 'RECONCILIATION',
        'reconciliation_source', 'revenuecat_v2_current_customer',
        'revenuecat_subscription_id', v_subscription_id,
        'original_transaction_id', v_original_transaction_id,
        'premium_transaction_binding_id', v_binding."id",
        'provider_snapshot_only', true,
        'provider_transaction_created', false,
        'authority_granted', true,
        'money_action', false,
        'payout_ready', false
      )
  where event."id" = v_projected_event_id;
  if not found then raise exception 'premium_reconciliation_event_finalization_missing'; end if;

  update public."billing_events" billing
  set "event_type" = 'RECONCILIATION',
      "metadata" = coalesce(billing."metadata", '{}'::jsonb) || jsonb_build_object(
        'reconciliation_source', 'revenuecat_v2_current_customer',
        'provider_transaction_created', false,
        'money_action', false
      )
  where billing."provider" = 'revenuecat'
    and billing."metadata"->>'revenuecat_event_id' = v_snapshot_id;

  update public."money_access_ledger_events" ledger
  set "event_type" = 'RECONCILIATION',
      "metadata" = coalesce(ledger."metadata", '{}'::jsonb) || jsonb_build_object(
        'reconciliation_source', 'revenuecat_v2_current_customer',
        'provider_transaction_created', false,
        'not_payable', true,
        'production_money', false
      )
  where ledger."provider_event_id" = v_projected_event_id;

  update public."access_grants" grant_row
  set "metadata" = coalesce(grant_row."metadata", '{}'::jsonb) || jsonb_build_object(
        'lifecycle_event_type', 'RECONCILIATION',
        'reconciliation_source', 'revenuecat_v2_current_customer',
        'provider_transaction_created', false,
        'authority_granted', false,
        'payout_access', false
      )
  where grant_row."provider_event_id" = v_projected_event_id
    and grant_row."grant_type" = 'premium';

  update public."user_entitlements" entitlement
  set "metadata" = coalesce(entitlement."metadata", '{}'::jsonb) || jsonb_build_object(
        'revenuecat_event_type', 'RECONCILIATION',
        'reconciliation_source', 'revenuecat_v2_current_customer',
        'provider_transaction_created', false
      )
  where entitlement."user_id" = p_user_id::text
    and entitlement."entitlement_key" = 'premium'
    and entitlement."metadata"->>'revenuecat_event_id' = v_snapshot_id;

  update public."revenuecat_premium_transaction_authority" transaction_authority
  set "current_product_id" = v_product."id",
      "current_provider_product_id" = v_provider_product_id,
      "current_provider_base_plan_id" = null,
      "latest_event_id" = v_snapshot_id,
      "latest_event_hash" = p_raw_payload_hash,
      "latest_event_type" = 'RECONCILIATION',
      "latest_occurred_at" = p_starts_at,
      "latest_event_rank" = 3,
      "authority_state" = 'active',
      "updated_at" = v_now
  where transaction_authority."id" = v_binding."id";

  update public."revenuecat_premium_transaction_authority" transaction_authority
  set "authority_state" = 'expired', "updated_at" = v_now
  where transaction_authority."provider" = 'revenuecat_app_store'
    and transaction_authority."user_id" = p_user_id
    and transaction_authority."environment" = 'sandbox'
    and transaction_authority."id" <> v_binding."id"
    and transaction_authority."authority_state" in ('active', 'retained');

  if not public."premium_subject_has_finite_authority_internal"(p_user_id::text) then
    raise exception 'premium_reconciliation_postcondition_failed';
  end if;
  return v_result || jsonb_build_object(
    'status', 'processed',
    'eventType', 'RECONCILIATION',
    'eventId', v_snapshot_id,
    'environment', 'sandbox',
    'entitlementActive', true,
    'duplicateEvent', false,
    'liveMoneyAction', false
  );
end;
$$;

revoke all on function public."reconcile_revenuecat_premium_snapshot_atomic"(
  text, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, text
) from public, anon, authenticated, service_role;
grant execute on function public."reconcile_revenuecat_premium_snapshot_atomic"(
  text, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, text
) to service_role;
comment on function public."reconcile_revenuecat_premium_snapshot_atomic"(
  text, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, text
) is 'Service-only sandbox restore reconciliation from an exact RevenueCat v2 current-customer subscription and transaction snapshot. It binds one App Store original transaction to one user, refuses conflicting or terminal authority, creates no provider transaction or payable balance, and projects finite Premium through the existing atomic authority graph.';
