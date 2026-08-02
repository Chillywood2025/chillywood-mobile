-- Reconcile verified RevenueCat TRANSFER lifecycle events without treating the
-- webhook as entitlement authority. A transfer can only move an already-active,
-- provider-backed App Store sandbox entitlement from one auth user to another.
-- The operation is atomic, retry-safe, stores no raw payload, and creates no
-- payable balance or LiveKit authority.

create or replace function public."process_revenuecat_premium_transfer_atomic_internal"(
  p_provider_event_id text,
  p_source_user_id uuid,
  p_target_user_id uuid,
  p_environment text,
  p_occurred_at timestamptz,
  p_raw_payload_hash text,
  p_failpoint text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := timezone('utc'::text, now());
  v_environment text := lower(trim(coalesce(p_environment, '')));
  v_occurred_at timestamptz := coalesce(p_occurred_at, v_now);
  v_transfer_event_id text := trim(coalesce(p_provider_event_id, ''));
  v_source_event_id text;
  v_target_event_id text;
  v_source_result jsonb;
  v_target_result jsonb;
  v_source_entitlement public."user_entitlements"%rowtype;
  v_source_grant public."access_grants"%rowtype;
  v_target_grant public."access_grants"%rowtype;
  v_source_provider_event public."provider_events"%rowtype;
  v_source_transfer_event public."provider_events"%rowtype;
  v_target_transfer_event public."provider_events"%rowtype;
  v_mapping public."monetization_product_store_mappings"%rowtype;
  v_product public."monetization_products"%rowtype;
begin
  if v_transfer_event_id = '' then
    raise exception 'transfer_provider_event_id_required';
  end if;
  if p_source_user_id is null or p_target_user_id is null then
    raise exception 'transfer_user_id_required';
  end if;
  if p_source_user_id = p_target_user_id then
    raise exception 'transfer_users_must_differ';
  end if;
  if v_environment <> 'sandbox' then
    raise exception 'transfer_environment_must_be_sandbox';
  end if;
  if nullif(trim(coalesce(p_raw_payload_hash, '')), '') is null then
    raise exception 'transfer_payload_hash_required';
  end if;
  if v_occurred_at > v_now + interval '5 minutes' then
    raise exception 'transfer_occurred_at_invalid';
  end if;
  if p_failpoint is not null and p_failpoint not in ('after_source', 'after_target') then
    raise exception 'transfer_failpoint_invalid';
  end if;

  v_source_event_id := 'transfer:' || v_transfer_event_id || ':source';
  v_target_event_id := 'transfer:' || v_transfer_event_id || ':target';

  perform pg_advisory_xact_lock(hashtextextended('revenuecat-transfer:' || v_transfer_event_id, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'revenuecat-transfer-user:' || least(p_source_user_id::text, p_target_user_id::text),
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'revenuecat-transfer-user:' || greatest(p_source_user_id::text, p_target_user_id::text),
    0
  ));

  select event.* into v_source_transfer_event
  from public."provider_events" event
  where event."provider" = 'revenuecat_app_store'
    and event."idempotency_key" = 'REVOCATION:' || v_source_event_id
  limit 1
  for update;

  select event.* into v_target_transfer_event
  from public."provider_events" event
  where event."provider" = 'revenuecat_app_store'
    and event."idempotency_key" = 'RENEWAL:' || v_target_event_id
  limit 1
  for update;

  if v_source_transfer_event."id" is not null or v_target_transfer_event."id" is not null then
    if v_source_transfer_event."id" is null
      or v_target_transfer_event."id" is null
      or v_source_transfer_event."user_id" <> p_source_user_id
      or v_target_transfer_event."user_id" <> p_target_user_id
      or v_source_transfer_event."status" <> 'refunded'
      or v_target_transfer_event."status" <> 'processed'
    then
      raise exception 'transfer_partial_or_identity_mismatch';
    end if;

    return jsonb_build_object(
      'status', 'duplicate_ignored',
      'duplicateEvent', true,
      'sourceRevoked', true,
      'targetActive', true,
      'environment', 'sandbox',
      'liveMoneyAction', false
    );
  end if;

  if not exists (
    select 1 from auth."users" user_row where user_row."id" = p_source_user_id
  ) or not exists (
    select 1 from auth."users" user_row where user_row."id" = p_target_user_id
  ) then
    raise exception 'transfer_auth_user_missing';
  end if;

  select entitlement.* into v_source_entitlement
  from public."user_entitlements" entitlement
  where entitlement."user_id" = p_source_user_id::text
    and entitlement."entitlement_key" = 'premium'
  limit 1
  for update;

  if v_source_entitlement."user_id" is null
    or v_source_entitlement."source" <> 'revenuecat'
    or v_source_entitlement."status" not in ('active', 'trialing', 'grace_period')
    or v_source_entitlement."expires_at" is null
    or v_source_entitlement."expires_at" <= v_now
  then
    raise exception 'transfer_source_entitlement_not_active';
  end if;

  select grant_row.* into v_source_grant
  from public."access_grants" grant_row
  where grant_row."user_id" = p_source_user_id
    and grant_row."grant_type" = 'premium'
    and grant_row."provider" = 'revenuecat_app_store'
    and grant_row."environment" = 'sandbox'
    and grant_row."status" = 'sandbox_only'
    and grant_row."expires_at" > v_now
  order by grant_row."updated_at" desc
  limit 1
  for update;

  if v_source_grant."id" is null
    or v_source_grant."product_id" is null
    or v_source_grant."provider_event_id" is null
  then
    raise exception 'transfer_source_provider_grant_not_active';
  end if;

  select event.* into v_source_provider_event
  from public."provider_events" event
  where event."id" = v_source_grant."provider_event_id"
    and event."provider" = 'revenuecat_app_store'
    and event."user_id" = p_source_user_id
    and event."environment" = 'sandbox'
    and event."status" = 'processed'
    and event."product_id" = v_source_grant."product_id"
  limit 1
  for update;

  if v_source_provider_event."id" is null
    or nullif(v_source_provider_event."metadata"->>'provider_product_id', '') is null
    or nullif(v_source_provider_event."metadata"->>'store_mapping_id', '') is null
  then
    raise exception 'transfer_source_provider_event_invalid';
  end if;

  select mapping.* into v_mapping
  from public."monetization_product_store_mappings" mapping
  where mapping."id"::text = v_source_provider_event."metadata"->>'store_mapping_id'
    and mapping."product_id" = v_source_grant."product_id"
    and mapping."concept" = 'premium'
    and mapping."platform" = 'ios'
    and mapping."store" = 'app_store'
    and mapping."provider" = 'revenuecat_app_store'
    and mapping."provider_product_id" = v_source_provider_event."metadata"->>'provider_product_id'
    and mapping."environment" = 'sandbox'
    and mapping."status" = 'sandbox'
    and mapping."unlocks_digital_access" is true
    and mapping."grants_livekit_authority" is false
    and mapping."creates_payable_balance" is false
  limit 1;

  if v_mapping."id" is null then
    raise exception 'transfer_source_store_mapping_invalid';
  end if;

  select product.* into v_product
  from public."monetization_products" product
  where product."id" = v_mapping."product_id"
    and product."product_type" = 'premium_subscription'
  limit 1;

  if v_product."id" is null then
    raise exception 'transfer_source_product_invalid';
  end if;

  select grant_row.* into v_target_grant
  from public."access_grants" grant_row
  where grant_row."user_id" = p_target_user_id
    and grant_row."grant_type" = 'premium'
  order by grant_row."updated_at" desc
  limit 1
  for update;

  if v_target_grant."id" is not null
    and (
      v_target_grant."provider" <> 'revenuecat_app_store'
      or v_target_grant."environment" <> 'sandbox'
      or v_target_grant."product_id" <> v_product."id"
    )
  then
    raise exception 'transfer_target_grant_conflict';
  end if;

  if exists (
    select 1
    from public."user_entitlements" entitlement
    where entitlement."user_id" = p_target_user_id::text
      and entitlement."entitlement_key" = 'premium'
      and entitlement."source" <> 'revenuecat'
  ) then
    raise exception 'transfer_target_entitlement_conflict';
  end if;

  v_source_result := public."process_revenuecat_premium_event_atomic_internal"(
    'revenuecat_app_store',
    v_source_event_id,
    'REVOCATION',
    p_source_user_id,
    v_mapping."provider_product_id",
    null,
    'sandbox',
    'revoked',
    v_source_entitlement."starts_at",
    v_source_entitlement."expires_at",
    v_occurred_at,
    0,
    'usd',
    p_raw_payload_hash,
    'TRANSFER',
    'app_store',
    'ios',
    v_mapping."id",
    v_product."id",
    null
  );

  if p_failpoint = 'after_source' then
    raise exception 'forced_failure_after_transfer_source';
  end if;

  v_target_result := public."process_revenuecat_premium_event_atomic_internal"(
    'revenuecat_app_store',
    v_target_event_id,
    'RENEWAL',
    p_target_user_id,
    v_mapping."provider_product_id",
    null,
    'sandbox',
    'active',
    v_source_entitlement."starts_at",
    v_source_entitlement."expires_at",
    v_occurred_at,
    0,
    'usd',
    p_raw_payload_hash,
    'TRANSFER',
    'app_store',
    'ios',
    v_mapping."id",
    v_product."id",
    null
  );

  if p_failpoint = 'after_target' then
    raise exception 'forced_failure_after_transfer_target';
  end if;

  update public."provider_events"
  set "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
    'revenuecat_transfer', true,
    'transfer_direction', 'source_revoked',
    'transfer_provider_event_id', v_transfer_event_id,
    'transfer_payload_hash', p_raw_payload_hash,
    'provider_payload_stored', false,
    'money_action', false
  )
  where "id" = (v_source_result->>'providerEventId')::uuid;

  update public."provider_events"
  set "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
    'revenuecat_transfer', true,
    'transfer_direction', 'target_activated',
    'transfer_provider_event_id', v_transfer_event_id,
    'transfer_payload_hash', p_raw_payload_hash,
    'provider_payload_stored', false,
    'money_action', false
  )
  where "id" = (v_target_result->>'providerEventId')::uuid;

  return jsonb_build_object(
    'status', 'processed',
    'duplicateEvent', false,
    'sourceRevoked', v_source_result->>'entitlementStatus' = 'revoked',
    'targetActive', (v_target_result->>'entitlementActive')::boolean,
    'environment', 'sandbox',
    'liveMoneyAction', false
  );
end;
$$;

create or replace function public."process_revenuecat_premium_transfer_atomic"(
  p_provider_event_id text,
  p_source_user_id uuid,
  p_target_user_id uuid,
  p_environment text,
  p_occurred_at timestamptz,
  p_raw_payload_hash text
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public."process_revenuecat_premium_transfer_atomic_internal"(
    p_provider_event_id,
    p_source_user_id,
    p_target_user_id,
    p_environment,
    p_occurred_at,
    p_raw_payload_hash,
    null
  );
$$;

revoke all on function public."process_revenuecat_premium_transfer_atomic_internal"(
  text, uuid, uuid, text, timestamptz, text, text
) from public, anon, authenticated, service_role;

revoke all on function public."process_revenuecat_premium_transfer_atomic"(
  text, uuid, uuid, text, timestamptz, text
) from public, anon, authenticated;

grant execute on function public."process_revenuecat_premium_transfer_atomic"(
  text, uuid, uuid, text, timestamptz, text
) to service_role;

comment on function public."process_revenuecat_premium_transfer_atomic"(
  text, uuid, uuid, text, timestamptz, text
) is 'Service-only atomic reconciliation for a verified RevenueCat App Store sandbox TRANSFER. It can only move an active provider-backed Premium entitlement, stores no raw payload, and creates no payable balance or LiveKit authority.';
