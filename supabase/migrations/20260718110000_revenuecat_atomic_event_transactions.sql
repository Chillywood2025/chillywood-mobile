-- Atomic RevenueCat event application.
--
-- The Edge Function remains responsible for webhook authentication and
-- normalized store/product policy. These RPCs apply each normalized event in
-- one PostgreSQL transaction. They are service-role only and never persist a
-- provider payload, payment authority, room authority, or payable balance.

create or replace function public."process_revenuecat_premium_event_atomic_internal"(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_provider_product_id text,
  p_provider_base_plan_id text,
  p_environment text,
  p_entitlement_status text,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_occurred_at timestamptz,
  p_amount_minor integer,
  p_currency text,
  p_raw_payload_hash text,
  p_period_type text,
  p_store text,
  p_platform text,
  p_store_mapping_id uuid,
  p_product_id uuid,
  p_failpoint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc'::text, now());
  v_occurred_at timestamptz := coalesce(p_occurred_at, v_now);
  v_event_type text := upper(trim(coalesce(p_event_type, '')));
  v_environment text := lower(trim(coalesce(p_environment, '')));
  v_status text := lower(trim(coalesce(p_entitlement_status, '')));
  v_currency text := lower(trim(coalesce(p_currency, 'usd')));
  v_idempotency_key text;
  v_duplicate boolean := false;
  v_product public."monetization_products"%rowtype;
  v_mapping public."monetization_product_store_mappings"%rowtype;
  v_provider_event public."provider_events"%rowtype;
  v_access_grant public."access_grants"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_billing_event_id bigint;
  v_grant_status text;
  v_ledger_status text;
  v_payable_state text;
  v_provider_status text;
begin
  if p_provider not in ('revenuecat', 'revenuecat_app_store', 'revenuecat_google_play') then
    raise exception 'revenuecat_provider_invalid';
  end if;
  if nullif(trim(coalesce(p_provider_event_id, '')), '') is null then
    raise exception 'provider_event_id_required';
  end if;
  if v_event_type not in (
    'INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE', 'RENEWAL',
    'UNCANCELLATION', 'CANCELLATION', 'EXPIRATION', 'BILLING_ISSUE',
    'REFUND', 'REVOCATION', 'SUBSCRIPTION_PAUSED'
  ) then
    raise exception 'revenuecat_event_type_unsupported';
  end if;
  if p_user_id is null then
    raise exception 'user_id_required';
  end if;
  if v_environment not in ('setup', 'sandbox', 'production') then
    raise exception 'environment_invalid';
  end if;
  if v_status not in ('active', 'trialing', 'grace_period', 'pending', 'expired', 'canceled', 'revoked') then
    raise exception 'entitlement_status_invalid';
  end if;
  if coalesce(p_amount_minor, 0) < 0 then
    raise exception 'amount_minor_invalid';
  end if;
  if v_currency !~ '^[a-z]{3}$' then
    raise exception 'currency_invalid';
  end if;
  if nullif(trim(coalesce(p_raw_payload_hash, '')), '') is null then
    raise exception 'payload_hash_required';
  end if;

  select product.* into v_product
  from public."monetization_products" product
  where product."id" = p_product_id
    and product."product_type" = 'premium_subscription'
  limit 1;
  if v_product."id" is null then
    raise exception 'premium_product_not_found';
  end if;

  if p_provider = 'revenuecat_app_store' then
    select mapping.* into v_mapping
    from public."monetization_product_store_mappings" mapping
    where mapping."id" = p_store_mapping_id
      and mapping."product_id" = v_product."id"
      and mapping."concept" = 'premium'
      and mapping."platform" = 'ios'
      and mapping."store" = 'app_store'
      and mapping."provider" = 'revenuecat_app_store'
      and mapping."provider_product_id" = p_provider_product_id
      and mapping."provider_base_plan_id" is null
      and mapping."environment" = v_environment
      and mapping."status" in ('sandbox', 'active')
      and mapping."unlocks_digital_access" is true
      and mapping."grants_livekit_authority" is false
      and mapping."creates_payable_balance" is false
    limit 1;
    if v_mapping."id" is null then
      raise exception 'premium_app_store_mapping_invalid';
    end if;
  elsif p_provider = 'revenuecat_google_play' then
    if coalesce(v_product."provider", '') not in ('revenuecat_google_play', 'google_play', 'revenuecat')
      or nullif(trim(coalesce(v_product."provider_product_id", '')), '') is null
    then
      raise exception 'premium_google_product_invalid';
    end if;
  end if;

  v_idempotency_key := v_event_type || ':' || trim(p_provider_event_id);
  perform pg_advisory_xact_lock(hashtextextended('revenuecat-event:' || v_idempotency_key, 0));
  perform pg_advisory_xact_lock(hashtextextended('revenuecat-premium:' || p_user_id::text || ':' || v_product."id"::text, 0));

  select event.* into v_provider_event
  from public."provider_events" event
  where event."idempotency_key" = v_idempotency_key
    and event."provider" in (
      p_provider,
      case when p_provider <> 'revenuecat' then 'revenuecat' else p_provider end
    )
  order by event."created_at" asc
  limit 1
  for update;

  v_duplicate := v_provider_event."id" is not null;
  if not v_duplicate then
    insert into public."provider_events" (
      "provider_event_id", "provider", "product_id", "product_key", "user_id",
      "app_user_id", "environment", "event_type", "status", "occurred_at",
      "idempotency_key", "raw_payload_hash", "metadata"
    ) values (
      trim(p_provider_event_id), p_provider, v_product."id", v_product."product_key", p_user_id,
      p_user_id::text, v_environment, v_event_type, 'received', v_occurred_at,
      v_idempotency_key, p_raw_payload_hash,
      jsonb_build_object(
        'provider_payload_stored', false,
        'provider_product_id', p_provider_product_id,
        'provider_base_plan_id', nullif(trim(coalesce(p_provider_base_plan_id, '')), ''),
        'store', nullif(trim(coalesce(p_store, '')), ''),
        'platform', nullif(trim(coalesce(p_platform, '')), ''),
        'store_mapping_id', p_store_mapping_id,
        'period_type', nullif(trim(coalesce(p_period_type, '')), ''),
        'entitlement_key', 'premium',
        'sandbox_only', v_environment = 'sandbox',
        'money_action', false,
        'payout_ready', false
      )
    )
    returning * into v_provider_event;
  end if;

  if p_failpoint = 'after_provider_event' then
    raise exception 'forced_failure_after_provider_event';
  end if;

  insert into public."user_entitlements" (
    "user_id", "entitlement_key", "status", "source", "starts_at", "expires_at",
    "revoked_at", "updated_at", "metadata"
  ) values (
    p_user_id::text, 'premium', v_status, 'revenuecat', p_starts_at, p_expires_at,
    case when v_status = 'revoked' then v_occurred_at else null end,
    v_now,
    jsonb_build_object(
      'revenuecat_event_id', trim(p_provider_event_id),
      'revenuecat_event_hash', p_raw_payload_hash,
      'revenuecat_event_type', v_event_type,
      'product_id', p_provider_product_id,
      'environment', v_environment,
      'period_type', nullif(trim(coalesce(p_period_type, '')), ''),
      'store', nullif(trim(coalesce(p_store, '')), ''),
      'sandbox', v_environment = 'sandbox',
      'provider_payload_stored', false
    )
  )
  on conflict ("user_id", "entitlement_key") do update set
    "status" = excluded."status",
    "source" = excluded."source",
    "starts_at" = excluded."starts_at",
    "expires_at" = excluded."expires_at",
    "revoked_at" = excluded."revoked_at",
    "updated_at" = excluded."updated_at",
    "metadata" = excluded."metadata";

  if p_failpoint = 'after_entitlement' then
    raise exception 'forced_failure_after_entitlement';
  end if;

  select billing."id" into v_billing_event_id
  from public."billing_events" billing
  where billing."provider" = 'revenuecat'
    and billing."event_type" = v_event_type
    and billing."metadata"->>'revenuecat_event_id' = trim(p_provider_event_id)
  order by billing."id" asc
  limit 1;

  if v_billing_event_id is null then
    insert into public."billing_events" (
      "user_id", "event_type", "provider", "entitlement_key", "status", "occurred_at", "metadata"
    ) values (
      p_user_id::text, v_event_type, 'revenuecat', 'premium', v_status, v_occurred_at,
      jsonb_build_object(
        'revenuecat_event_id', trim(p_provider_event_id),
        'revenuecat_event_hash', p_raw_payload_hash,
        'product_id', p_provider_product_id,
        'environment', v_environment,
        'duplicate_safe', true,
        'provider_payload_stored', false,
        'premium_granted', v_status in ('active', 'trialing', 'grace_period'),
        'money_action', false
      )
    ) returning "id" into v_billing_event_id;
  end if;

  if p_failpoint = 'after_billing_event' then
    raise exception 'forced_failure_after_billing_event';
  end if;

  v_grant_status := case
    when v_status = 'revoked' then 'revoked'
    when v_status in ('expired', 'canceled') then 'expired'
    when v_status in ('active', 'trialing', 'grace_period') and v_environment = 'production' then 'active'
    when v_status in ('active', 'trialing', 'grace_period') and v_environment = 'sandbox' then 'sandbox_only'
    when v_environment = 'setup' then 'setup_only'
    when v_environment = 'production' then 'pending'
    else 'blocked'
  end;

  select grant_row.* into v_access_grant
  from public."access_grants" grant_row
  where grant_row."user_id" = p_user_id
    and grant_row."product_id" = v_product."id"
    and grant_row."grant_type" = 'premium'
  order by grant_row."updated_at" desc
  limit 1
  for update;

  if v_access_grant."id" is null then
    insert into public."access_grants" (
      "user_id", "grant_type", "source_type", "source_id", "product_id", "provider",
      "provider_event_id", "environment", "status", "starts_at", "expires_at",
      "refunded_at", "revoked_at", "revoke_reason", "metadata"
    ) values (
      p_user_id, 'premium', 'provider_event', v_provider_event."id", v_product."id", p_provider,
      v_provider_event."id", v_environment, v_grant_status, coalesce(p_starts_at, v_occurred_at), p_expires_at,
      case when v_event_type in ('REFUND', 'REVOCATION') then v_occurred_at else null end,
      case when v_grant_status = 'revoked' then v_occurred_at else null end,
      case when v_grant_status = 'revoked' then 'RevenueCat provider lifecycle event.' else null end,
      jsonb_build_object(
        'entitlement_key', 'premium',
        'user_entitlements_source_of_truth', true,
        'viewer_access_only', true,
        'authority_granted', false,
        'payout_access', false,
        'lifecycle_event_type', v_event_type
      )
    ) returning * into v_access_grant;
  else
    update public."access_grants" set
      "provider" = p_provider,
      "provider_event_id" = v_provider_event."id",
      "environment" = v_environment,
      "status" = v_grant_status,
      "starts_at" = coalesce(p_starts_at, v_occurred_at),
      "expires_at" = p_expires_at,
      "refunded_at" = case when v_event_type in ('REFUND', 'REVOCATION') then v_occurred_at else null end,
      "revoked_at" = case when v_grant_status = 'revoked' then v_occurred_at else null end,
      "revoke_reason" = case when v_grant_status = 'revoked' then 'RevenueCat provider lifecycle event.' else null end,
      "metadata" = jsonb_build_object(
        'entitlement_key', 'premium',
        'user_entitlements_source_of_truth', true,
        'viewer_access_only', true,
        'authority_granted', false,
        'payout_access', false,
        'lifecycle_event_type', v_event_type
      )
    where "id" = v_access_grant."id"
    returning * into v_access_grant;
  end if;

  if p_failpoint = 'after_access_grant' then
    raise exception 'forced_failure_after_access_grant';
  end if;

  v_ledger_status := case
    when v_event_type in ('REFUND', 'REVOCATION', 'SUBSCRIPTION_PAUSED') then 'refunded'
    when v_event_type = 'EXPIRATION' or (v_event_type = 'CANCELLATION' and v_status <> 'active') then 'reversed'
    when v_event_type = 'BILLING_ISSUE' and v_status <> 'grace_period' then 'pending'
    when v_environment = 'production' then 'verified'
    when v_environment = 'sandbox' then 'sandbox_only'
    else 'setup_only'
  end;
  v_payable_state := case
    when v_ledger_status = 'refunded' then 'refunded'
    when v_ledger_status = 'reversed' then 'reversed'
    else 'not_payable'
  end;

  select ledger.* into v_ledger
  from public."money_access_ledger_events" ledger
  where ledger."provider_event_id" = v_provider_event."id"
    and ledger."event_type" = v_event_type
  order by ledger."created_at" asc
  limit 1
  for update;

  if v_ledger."id" is null then
    insert into public."money_access_ledger_events" (
      "user_id", "product_id", "provider_event_id", "event_type", "amount_minor", "currency",
      "environment", "payable_state", "status", "source_type", "source_id", "metadata"
    ) values (
      p_user_id, v_product."id", v_provider_event."id", v_event_type, greatest(coalesce(p_amount_minor, 0), 0), v_currency,
      v_environment, v_payable_state, v_ledger_status, 'provider_event', v_provider_event."id",
      jsonb_build_object(
        'product_key', v_product."product_key",
        'entitlement_key', 'premium',
        'sandbox_only', v_environment = 'sandbox',
        'not_payable', v_payable_state = 'not_payable',
        'production_money', false,
        'payout_readiness_proved', false,
        'money_enabled_at_verification', false
      )
    ) returning * into v_ledger;
  end if;

  if p_failpoint = 'after_ledger_event' then
    raise exception 'forced_failure_after_ledger_event';
  end if;

  v_provider_status := case
    when v_ledger_status = 'refunded' then 'refunded'
    when v_ledger_status = 'reversed' then 'reversed'
    else 'processed'
  end;
  update public."provider_events" set
    "product_id" = v_product."id",
    "product_key" = v_product."product_key",
    "user_id" = p_user_id,
    "app_user_id" = p_user_id::text,
    "environment" = v_environment,
    "event_type" = v_event_type,
    "status" = v_provider_status,
    "occurred_at" = v_occurred_at,
    "raw_payload_hash" = p_raw_payload_hash,
    "metadata" = coalesce(v_provider_event."metadata", '{}'::jsonb) || jsonb_build_object(
      'provider_payload_stored', false,
      'provider_product_id', p_provider_product_id,
      'provider_base_plan_id', nullif(trim(coalesce(p_provider_base_plan_id, '')), ''),
      'store_mapping_id', p_store_mapping_id,
      'entitlement_key', 'premium',
      'billing_event_id', v_billing_event_id,
      'access_grant_id', v_access_grant."id",
      'ledger_event_id', v_ledger."id",
      'lifecycle_event_type', v_event_type,
      'money_action', false,
      'payout_ready', false
    )
  where "id" = v_provider_event."id"
  returning * into v_provider_event;

  return jsonb_build_object(
    'status', v_provider_status,
    'eventType', v_event_type,
    'eventId', trim(p_provider_event_id),
    'userId', p_user_id,
    'productKey', v_product."product_key",
    'providerEventId', v_provider_event."id",
    'billingEventId', v_billing_event_id,
    'accessGrantId', v_access_grant."id",
    'ledgerEventId', v_ledger."id",
    'environment', v_environment,
    'entitlementStatus', v_status,
    'entitlementActive', v_status in ('active', 'trialing', 'grace_period'),
    'grantStatus', v_grant_status,
    'payableState', v_payable_state,
    'duplicateEvent', v_duplicate,
    'duplicateAccessGrant', v_duplicate and v_access_grant."id" is not null,
    'duplicateLedgerEvent', v_duplicate and v_ledger."id" is not null
  );
end;
$$;

create or replace function public."process_revenuecat_premium_event_atomic"(
  p_provider text,
  p_provider_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_provider_product_id text,
  p_provider_base_plan_id text,
  p_environment text,
  p_entitlement_status text,
  p_starts_at timestamptz,
  p_expires_at timestamptz,
  p_occurred_at timestamptz,
  p_amount_minor integer,
  p_currency text,
  p_raw_payload_hash text,
  p_period_type text,
  p_store text,
  p_platform text,
  p_store_mapping_id uuid,
  p_product_id uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public."process_revenuecat_premium_event_atomic_internal"(
    p_provider, p_provider_event_id, p_event_type, p_user_id, p_provider_product_id,
    p_provider_base_plan_id, p_environment, p_entitlement_status, p_starts_at,
    p_expires_at, p_occurred_at, p_amount_minor, p_currency, p_raw_payload_hash,
    p_period_type, p_store, p_platform, p_store_mapping_id, p_product_id, null
  );
$$;

create or replace function public."process_revenuecat_consumable_event_atomic_internal"(
  p_provider_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_provider_product_id text,
  p_environment text,
  p_occurred_at timestamptz,
  p_expires_at timestamptz,
  p_amount_minor integer,
  p_currency text,
  p_raw_payload_hash text,
  p_original_transaction_id text,
  p_failpoint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc'::text, now());
  v_occurred_at timestamptz := coalesce(p_occurred_at, v_now);
  v_event_type text := upper(trim(coalesce(p_event_type, '')));
  v_environment text := lower(trim(coalesce(p_environment, '')));
  v_currency text := lower(trim(coalesce(p_currency, 'usd')));
  v_idempotency_key text;
  v_duplicate boolean := false;
  v_terminal boolean;
  v_mapping public."monetization_product_store_mappings"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_provider_event public."provider_events"%rowtype;
  v_intent public."money_purchase_intents"%rowtype;
  v_access_grant public."access_grants"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_switch_state text;
  v_webhook_state text;
  v_live_money_state text;
  v_payouts_state text;
  v_feature_state text;
  v_provider_status text;
begin
  if nullif(trim(coalesce(p_provider_event_id, '')), '') is null then
    raise exception 'provider_event_id_required';
  end if;
  if v_event_type not in ('INITIAL_PURCHASE', 'NON_RENEWING_PURCHASE', 'REFUND', 'REVOCATION') then
    raise exception 'consumable_event_type_unsupported';
  end if;
  if p_user_id is null then
    raise exception 'user_id_required';
  end if;
  if v_environment <> 'sandbox' then
    raise exception 'ios_consumable_sandbox_required';
  end if;
  if coalesce(p_amount_minor, -1) < 0 then
    raise exception 'amount_minor_invalid';
  end if;
  if v_currency !~ '^[a-z]{3}$' then
    raise exception 'currency_invalid';
  end if;
  if nullif(trim(coalesce(p_raw_payload_hash, '')), '') is null then
    raise exception 'payload_hash_required';
  end if;

  select mapping.* into v_mapping
  from public."monetization_product_store_mappings" mapping
  where mapping."platform" = 'ios'
    and mapping."store" = 'app_store'
    and mapping."provider" = 'revenuecat_app_store'
    and mapping."provider_product_id" = trim(p_provider_product_id)
    and mapping."provider_base_plan_id" is null
    and mapping."concept" in ('creator_tip', 'seat_pass')
    and mapping."store_product_type" = 'consumable'
    and mapping."environment" = 'sandbox'
    and mapping."status" = 'sandbox'
    and mapping."grants_livekit_authority" is false
    and mapping."creates_payable_balance" is false
    and (mapping."concept" <> 'creator_tip' or mapping."unlocks_digital_access" is false)
  limit 1;
  if v_mapping."id" is null then
    raise exception 'ios_consumable_mapping_invalid';
  end if;

  select product.* into v_product
  from public."monetization_products" product
  where product."id" = v_mapping."product_id"
    and (
      (v_mapping."concept" = 'creator_tip' and product."product_type" = 'creator_tip')
      or (v_mapping."concept" = 'seat_pass' and product."product_type" = 'watch_party_live_ticket')
    )
  limit 1;
  if v_product."id" is null then
    raise exception 'ios_consumable_product_invalid';
  end if;
  if p_amount_minor <> v_mapping."reference_price_minor"
    or v_currency <> v_mapping."reference_currency"
  then
    raise exception 'ios_consumable_exact_store_price_required';
  end if;

  v_terminal := v_event_type in ('REFUND', 'REVOCATION');
  select "state" into v_switch_state from public."platform_money_kill_switches" where "key" = 'revenuecat_app_store_enabled';
  select "state" into v_webhook_state from public."platform_money_kill_switches" where "key" = 'provider_webhooks_enabled';
  select "state" into v_live_money_state from public."platform_money_kill_switches" where "key" = 'live_money_enabled';
  select "state" into v_payouts_state from public."platform_money_kill_switches" where "key" = 'payouts_enabled';
  select "state" into v_feature_state
  from public."platform_money_kill_switches"
  where "key" = case when v_mapping."concept" = 'creator_tip' then 'tips_enabled' else 'watch_party_tickets_enabled' end;

  if coalesce(v_live_money_state, 'off') <> 'off' or coalesce(v_payouts_state, 'off') <> 'off' then
    raise exception 'money_or_payout_switch_must_remain_off';
  end if;
  if not v_terminal and (
    coalesce(v_switch_state, 'off') <> 'sandbox_only'
    or coalesce(v_webhook_state, 'off') <> 'sandbox_only'
    or coalesce(v_feature_state, 'off') <> 'sandbox_only'
  ) then
    raise exception 'ios_consumable_sandbox_switches_required';
  end if;

  v_idempotency_key := v_event_type || ':' || trim(p_provider_event_id);
  perform pg_advisory_xact_lock(hashtextextended('revenuecat-event:' || v_idempotency_key, 0));

  select event.* into v_provider_event
  from public."provider_events" event
  where event."idempotency_key" = v_idempotency_key
    and event."provider" in ('revenuecat_app_store', 'revenuecat')
  order by event."created_at" asc
  limit 1
  for update;
  v_duplicate := v_provider_event."id" is not null;

  if not v_duplicate then
    insert into public."provider_events" (
      "provider_event_id", "provider", "product_id", "product_key", "user_id",
      "app_user_id", "environment", "event_type", "status", "occurred_at",
      "idempotency_key", "raw_payload_hash", "metadata"
    ) values (
      trim(p_provider_event_id), 'revenuecat_app_store', v_product."id", v_product."product_key", p_user_id,
      p_user_id::text, 'sandbox', v_event_type, 'received', v_occurred_at,
      v_idempotency_key, p_raw_payload_hash,
      jsonb_build_object(
        'provider_payload_stored', false,
        'provider_product_id', trim(p_provider_product_id),
        'original_transaction_id', nullif(trim(coalesce(p_original_transaction_id, '')), ''),
        'store_mapping_id', v_mapping."id",
        'dynamic_product', true,
        'sandbox_only', true,
        'money_action', false,
        'payout_ready', false
      )
    ) returning * into v_provider_event;
  end if;

  if p_failpoint = 'after_provider_event' then
    raise exception 'forced_failure_after_provider_event';
  end if;

  if nullif(v_provider_event."metadata"->>'purchase_intent_id', '') is not null then
    select intent.* into v_intent
    from public."money_purchase_intents" intent
    where intent."id" = (v_provider_event."metadata"->>'purchase_intent_id')::uuid
    for update;
  else
    select intent.* into v_intent
    from public."money_purchase_intents" intent
    where intent."user_id" = p_user_id
      and intent."product_id" = v_product."id"
      and intent."provider" = 'revenuecat_app_store'
      and intent."provider_product_id" = trim(p_provider_product_id)
      and (
        (not v_terminal and intent."status" = 'pending' and intent."expires_at" > v_now)
        or (v_terminal and intent."status" in ('consumed', 'revoked'))
        or (v_duplicate and not v_terminal and intent."status" = 'consumed')
      )
    order by intent."created_at" desc
    limit 1
    for update;
  end if;

  if v_intent."id" is null
    or v_intent."amount_minor" <> v_mapping."reference_price_minor"
    or lower(coalesce(v_intent."currency", '')) <> v_mapping."reference_currency"
    or (v_mapping."concept" = 'creator_tip' and v_intent."source_type" <> 'creator_tip')
    or (v_mapping."concept" = 'seat_pass' and v_intent."source_type" <> 'watch_party_live')
  then
    update public."provider_events" set
      "status" = 'ignored',
      "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
        'ignored_reason', 'purchase_intent_missing_or_mismatched',
        'access_granted', false,
        'ledger_created', false,
        'money_action', false,
        'payout_ready', false
      )
    where "id" = v_provider_event."id"
    returning * into v_provider_event;

    return jsonb_build_object(
      'status', 'ignored',
      'productKey', v_product."product_key",
      'providerEventId', v_provider_event."id",
      'accessGrantId', null,
      'ledgerEventId', null,
      'purchaseIntentId', null,
      'environment', 'sandbox',
      'payableState', 'not_payable',
      'grantStatus', 'blocked',
      'reason', 'purchase_intent_missing_or_mismatched',
      'duplicateProviderEvent', v_duplicate,
      'duplicateAccessGrant', false,
      'duplicateLedgerEvent', false
    );
  end if;

  perform pg_advisory_xact_lock(hashtextextended('revenuecat-intent:' || v_intent."id"::text, 0));
  if p_failpoint = 'after_intent_lock' then
    raise exception 'forced_failure_after_intent_lock';
  end if;

  if v_mapping."concept" = 'seat_pass' then
    select grant_row.* into v_access_grant
    from public."access_grants" grant_row
    where grant_row."user_id" = p_user_id
      and grant_row."product_id" = v_product."id"
      and grant_row."grant_type" = 'watch_party_live_ticket'
      and grant_row."source_id" = v_intent."source_id"
    order by grant_row."created_at" asc
    limit 1
    for update;

    if not v_terminal and v_access_grant."id" is null then
      insert into public."access_grants" (
        "user_id", "grant_type", "source_type", "source_id", "product_id", "provider",
        "provider_event_id", "environment", "status", "starts_at", "expires_at", "metadata"
      ) values (
        p_user_id, 'watch_party_live_ticket', 'provider_event', v_intent."source_id", v_product."id",
        'revenuecat_app_store', v_provider_event."id", 'sandbox', 'sandbox_only', v_occurred_at, p_expires_at,
        jsonb_build_object(
          'product_key', v_product."product_key",
          'purchase_intent_id', v_intent."id",
          'viewer_access_only', true,
          'authority_granted', false,
          'speaker_authority', false,
          'moderator_authority', false,
          'payout_access', false,
          'premium_unlock', false
        )
      ) returning * into v_access_grant;
    elsif v_terminal and v_access_grant."id" is not null then
      update public."access_grants" set
        "provider_event_id" = v_provider_event."id",
        "status" = 'refunded',
        "refunded_at" = v_occurred_at,
        "revoked_at" = v_occurred_at,
        "revoke_reason" = 'RevenueCat App Store consumable reversal.'
      where "id" = v_access_grant."id"
      returning * into v_access_grant;
    end if;
  end if;

  if p_failpoint = 'after_access_grant' then
    raise exception 'forced_failure_after_access_grant';
  end if;

  select ledger.* into v_ledger
  from public."money_access_ledger_events" ledger
  where ledger."provider_event_id" = v_provider_event."id"
    and ledger."event_type" = v_event_type
  order by ledger."created_at" asc
  limit 1
  for update;

  if v_ledger."id" is null then
    insert into public."money_access_ledger_events" (
      "user_id", "creator_id", "platform_id", "product_id", "provider_event_id", "event_type",
      "amount_minor", "currency", "environment", "payable_state", "status", "source_type", "source_id", "metadata"
    ) values (
      p_user_id, v_intent."creator_id", v_intent."platform_id", v_product."id", v_provider_event."id", v_event_type,
      p_amount_minor, v_currency, 'sandbox', case when v_terminal then 'refunded' else 'not_payable' end,
      case when v_terminal then 'refunded' else 'sandbox_only' end, v_intent."source_type", v_intent."source_id",
      jsonb_build_object(
        'product_key', v_product."product_key",
        'purchase_intent_id', v_intent."id",
        'concept', v_mapping."concept",
        'sandbox_only', true,
        'not_payable', not v_terminal,
        'production_money', false,
        'payout_readiness_proved', false,
        'money_enabled_at_verification', false,
        'viewer_access_only', v_mapping."concept" = 'seat_pass',
        'authority_granted', false
      )
    ) returning * into v_ledger;
  end if;

  if p_failpoint = 'after_ledger_event' then
    raise exception 'forced_failure_after_ledger_event';
  end if;

  if v_terminal then
    update public."money_purchase_intents" set
      "status" = 'revoked',
      "revoked_at" = v_occurred_at,
      "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
        'revoked_by_provider_event_id', v_provider_event."id",
        'sandbox_only', true,
        'not_payable', true
      )
    where "id" = v_intent."id";
  else
    update public."money_purchase_intents" set
      "status" = 'consumed',
      "consumed_at" = coalesce("consumed_at", v_now),
      "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
        'consumed_by_provider_event_id', v_provider_event."id",
        'sandbox_only', true,
        'not_payable', true
      )
    where "id" = v_intent."id";
  end if;

  if p_failpoint = 'after_intent_update' then
    raise exception 'forced_failure_after_intent_update';
  end if;

  v_provider_status := case when v_terminal then 'refunded' else 'processed' end;
  update public."provider_events" set
    "status" = v_provider_status,
    "raw_payload_hash" = p_raw_payload_hash,
    "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
      'provider_payload_stored', false,
      'provider_product_id', trim(p_provider_product_id),
      'original_transaction_id', nullif(trim(coalesce(p_original_transaction_id, '')), ''),
      'store_mapping_id', v_mapping."id",
      'purchase_intent_id', v_intent."id",
      'access_grant_id', v_access_grant."id",
      'ledger_event_id', v_ledger."id",
      'concept', v_mapping."concept",
      'money_action', false,
      'payout_ready', false
    )
  where "id" = v_provider_event."id"
  returning * into v_provider_event;

  return jsonb_build_object(
    'status', 'processed',
    'providerStatus', v_provider_status,
    'productKey', v_product."product_key",
    'productType', v_product."product_type",
    'providerEventId', v_provider_event."id",
    'accessGrantId', v_access_grant."id",
    'ledgerEventId', v_ledger."id",
    'purchaseIntentId', v_intent."id",
    'creatorId', v_intent."creator_id",
    'sourceId', v_intent."source_id",
    'sourceType', v_intent."source_type",
    'environment', 'sandbox',
    'payableState', case when v_terminal then 'refunded' else 'not_payable' end,
    'grantStatus', case
      when v_mapping."concept" = 'creator_tip' then 'blocked'
      when v_terminal then 'revoked'
      else 'sandbox_only'
    end,
    'reason', case
      when v_mapping."concept" = 'creator_tip' then 'ledger_recorded_no_entitlement_or_access_grant'
      when v_terminal then 'seat_pass_revoked'
      else 'viewer_access_and_ledger_recorded'
    end,
    'duplicateProviderEvent', v_duplicate,
    'duplicateAccessGrant', v_duplicate and v_access_grant."id" is not null,
    'duplicateLedgerEvent', v_duplicate and v_ledger."id" is not null
  );
end;
$$;

create or replace function public."process_revenuecat_consumable_event_atomic"(
  p_provider_event_id text,
  p_event_type text,
  p_user_id uuid,
  p_provider_product_id text,
  p_environment text,
  p_occurred_at timestamptz,
  p_expires_at timestamptz,
  p_amount_minor integer,
  p_currency text,
  p_raw_payload_hash text,
  p_original_transaction_id text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public."process_revenuecat_consumable_event_atomic_internal"(
    p_provider_event_id, p_event_type, p_user_id, p_provider_product_id,
    p_environment, p_occurred_at, p_expires_at, p_amount_minor, p_currency,
    p_raw_payload_hash, p_original_transaction_id, null
  );
$$;

create or replace function public."reconcile_revenuecat_partial_provider_events"(
  p_limit integer default 100
)
returns table (
  provider_event_id uuid,
  provider text,
  event_type text,
  product_key text,
  status text,
  missing_entitlement boolean,
  missing_billing_event boolean,
  missing_access_grant boolean,
  missing_ledger_event boolean,
  missing_purchase_intent_link boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    event."id",
    event."provider",
    event."event_type",
    event."product_key",
    event."status",
    product."product_type" = 'premium_subscription'
      and not exists (
        select 1 from public."user_entitlements" entitlement
        where entitlement."user_id" = event."user_id"::text
          and entitlement."entitlement_key" = 'premium'
      ),
    product."product_type" = 'premium_subscription'
      and not exists (
        select 1 from public."billing_events" billing
        where billing."provider" = 'revenuecat'
          and billing."event_type" = event."event_type"
          and billing."metadata"->>'revenuecat_event_id' = event."provider_event_id"
      ),
    product."product_type" in ('premium_subscription', 'watch_party_live_ticket')
      and not exists (
        select 1 from public."access_grants" grant_row
        where grant_row."provider_event_id" = event."id"
          or (
            product."product_type" = 'premium_subscription'
            and grant_row."user_id" = event."user_id"
            and grant_row."product_id" = event."product_id"
            and grant_row."grant_type" = 'premium'
          )
      ),
    not exists (
      select 1 from public."money_access_ledger_events" ledger
      where ledger."provider_event_id" = event."id"
        and ledger."event_type" = event."event_type"
    ),
    product."product_type" in ('creator_tip', 'watch_party_live_ticket')
      and nullif(event."metadata"->>'purchase_intent_id', '') is null
  from public."provider_events" event
  left join public."monetization_products" product on product."id" = event."product_id"
  where event."provider" in ('revenuecat', 'revenuecat_app_store', 'revenuecat_google_play')
    and (
      event."status" in ('received', 'failed')
      or (
        event."status" <> 'ignored'
        and (
          not exists (
            select 1 from public."money_access_ledger_events" ledger
            where ledger."provider_event_id" = event."id"
              and ledger."event_type" = event."event_type"
          )
          or (
            product."product_type" = 'premium_subscription'
            and not exists (
              select 1 from public."user_entitlements" entitlement
              where entitlement."user_id" = event."user_id"::text
                and entitlement."entitlement_key" = 'premium'
            )
          )
        )
      )
    )
  order by event."occurred_at" asc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke all on function public."process_revenuecat_premium_event_atomic_internal"(
  text, text, text, uuid, text, text, text, text, timestamptz, timestamptz,
  timestamptz, integer, text, text, text, text, text, uuid, uuid, text
) from public, anon, authenticated, service_role;
revoke all on function public."process_revenuecat_consumable_event_atomic_internal"(
  text, text, uuid, text, text, timestamptz, timestamptz, integer, text, text, text, text
) from public, anon, authenticated, service_role;

revoke all on function public."process_revenuecat_premium_event_atomic"(
  text, text, text, uuid, text, text, text, text, timestamptz, timestamptz,
  timestamptz, integer, text, text, text, text, text, uuid, uuid
) from public, anon, authenticated;
grant execute on function public."process_revenuecat_premium_event_atomic"(
  text, text, text, uuid, text, text, text, text, timestamptz, timestamptz,
  timestamptz, integer, text, text, text, text, text, uuid, uuid
) to service_role;

revoke all on function public."process_revenuecat_consumable_event_atomic"(
  text, text, uuid, text, text, timestamptz, timestamptz, integer, text, text, text
) from public, anon, authenticated;
grant execute on function public."process_revenuecat_consumable_event_atomic"(
  text, text, uuid, text, text, timestamptz, timestamptz, integer, text, text, text
) to service_role;

revoke all on function public."reconcile_revenuecat_partial_provider_events"(integer)
  from public, anon, authenticated;
grant execute on function public."reconcile_revenuecat_partial_provider_events"(integer)
  to service_role;

comment on function public."process_revenuecat_premium_event_atomic"(
  text, text, text, uuid, text, text, text, text, timestamptz, timestamptz,
  timestamptz, integer, text, text, text, text, text, uuid, uuid
) is 'Service-only atomic RevenueCat Premium lifecycle transaction. It stores normalized fields and a payload hash, never a raw provider payload.';

comment on function public."process_revenuecat_consumable_event_atomic"(
  text, text, uuid, text, text, timestamptz, timestamptz, integer, text, text, text
) is 'Service-only atomic App Store consumable transaction. Creator tips create ledger history only; Seat Passes create viewer access only. Neither can create payable balances or room authority.';

comment on function public."reconcile_revenuecat_partial_provider_events"(integer)
  is 'Service-only readback for RevenueCat provider events missing one or more normalized transactional effects.';
