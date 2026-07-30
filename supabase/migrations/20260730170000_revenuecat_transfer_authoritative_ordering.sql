-- Prevent a delayed RevenueCat TRANSFER from replacing newer Premium
-- authority. The already-deployed transfer implementations remain immutable;
-- this forward-only successor replaces only the service wrapper and delegates
-- the atomic writes to the deployed internal reconciler.
--
-- Ordinary Premium lifecycle events serialize on:
--   revenuecat-premium:<user_id>:<product_id>
-- Acquire that exact namespace for both transfer participants, in stable user
-- order, then re-read provider authority before allowing the transfer.

create or replace function public."process_revenuecat_premium_transfer_ordered_internal"(
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
  v_transfer_event_id text := trim(coalesce(p_provider_event_id, ''));
  v_source_event_id text;
  v_target_event_id text;
  v_source_transfer_event public."provider_events"%rowtype;
  v_target_transfer_event public."provider_events"%rowtype;
  v_source_current_entitlement public."user_entitlements"%rowtype;
  v_target_current_entitlement public."user_entitlements"%rowtype;
  v_locked_product_id uuid;
  v_lock_product_id uuid;
  v_first_user_id uuid;
  v_second_user_id uuid;
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
  if lower(trim(coalesce(p_environment, ''))) <> 'sandbox' then
    raise exception 'transfer_environment_must_be_sandbox';
  end if;
  if nullif(trim(coalesce(p_raw_payload_hash, '')), '') is null then
    raise exception 'transfer_payload_hash_required';
  end if;
  if p_occurred_at is null then
    raise exception 'transfer_occurred_at_required';
  end if;

  lock table public."monetization_products" in share mode;
  v_first_user_id := least(p_source_user_id::text, p_target_user_id::text)::uuid;
  v_second_user_id := greatest(p_source_user_id::text, p_target_user_id::text)::uuid;

  -- Lock every registered Premium product in stable product/user order. This
  -- closes the empty/pre-lock lookup race and prevents a concurrent lifecycle
  -- event from changing which Premium product the deployed reconciler reads.
  for v_lock_product_id in
    select product."id"
    from public."monetization_products" product
    where product."product_type" = 'premium_subscription'
    order by product."id"
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'revenuecat-premium:' || v_first_user_id::text || ':' || v_lock_product_id::text, 0
    ));
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'revenuecat-premium:' || v_second_user_id::text || ':' || v_lock_product_id::text, 0
    ));
  end loop;

  -- Product locks always precede event locks. Every service-accessible Premium
  -- lifecycle path follows this order, so a waiter cannot hold an event lock
  -- while blocking a transfer that already holds a product lock.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-transfer:' || v_transfer_event_id,
    0
  ));

  v_source_event_id := 'transfer:' || v_transfer_event_id || ':source';
  v_target_event_id := 'transfer:' || v_transfer_event_id || ':target';

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

  -- Duplicate recognition remains in front of chronological rejection. The
  -- wrapper rejects either one-sided marker and returns only when both exact
  -- transfer rows prove one committed transaction.
  if v_source_transfer_event."id" is not null
    or v_target_transfer_event."id" is not null
  then
    if v_source_transfer_event."id" is null
      or v_target_transfer_event."id" is null
      or v_source_transfer_event."user_id" <> p_source_user_id
      or v_target_transfer_event."user_id" <> p_target_user_id
      or v_source_transfer_event."status" <> 'refunded'
      or v_target_transfer_event."status" <> 'processed'
    then
      raise exception 'transfer_partial_or_identity_mismatch';
    end if;

    if (
        v_source_transfer_event."occurred_at" is distinct from p_occurred_at
        or v_target_transfer_event."occurred_at" is distinct from p_occurred_at
        or v_source_transfer_event."raw_payload_hash" is distinct from p_raw_payload_hash
        or v_target_transfer_event."raw_payload_hash" is distinct from p_raw_payload_hash
        or v_source_transfer_event."metadata"->>'transfer_provider_event_id'
          is distinct from v_transfer_event_id
        or v_target_transfer_event."metadata"->>'transfer_provider_event_id'
          is distinct from v_transfer_event_id
    )
    then
      raise exception 'transfer_duplicate_identity_mismatch';
    end if;

    select entitlement.* into v_source_current_entitlement
    from public."user_entitlements" entitlement
    where entitlement."user_id" = p_source_user_id::text
      and entitlement."entitlement_key" = 'premium'
    limit 1;

    select entitlement.* into v_target_current_entitlement
    from public."user_entitlements" entitlement
    where entitlement."user_id" = p_target_user_id::text
      and entitlement."entitlement_key" = 'premium'
    limit 1;

    return jsonb_build_object(
      'status', 'duplicate_ignored',
      'duplicateEvent', true,
      'sourceRevoked', v_source_current_entitlement."status" = 'revoked',
      'targetActive', v_target_current_entitlement."status" in (
        'active', 'trialing', 'grace_period'
      ),
      'environment', 'sandbox',
      'liveMoneyAction', false
    );
  end if;

  select grant_row."product_id" into v_locked_product_id
  from public."access_grants" grant_row
  where grant_row."user_id" = p_source_user_id
    and grant_row."grant_type" = 'premium'
    and grant_row."provider" = 'revenuecat_app_store'
    and grant_row."environment" = 'sandbox'
    and grant_row."product_id" is not null
  order by grant_row."updated_at" desc
  limit 1;

  if v_locked_product_id is null then
    raise exception 'transfer_source_provider_grant_not_active';
  end if;

  if exists (
    select 1
    from public."provider_events" event
    where event."user_id" in (p_source_user_id, p_target_user_id)
      and event."product_id" = v_locked_product_id
      and event."provider" in (
        'revenuecat',
        'revenuecat_app_store',
        'revenuecat_google_play'
      )
      and event."environment" = 'sandbox'
      and event."status" in ('processed', 'refunded', 'reversed')
      and event."occurred_at" > p_occurred_at
  ) then
    raise exception 'transfer_event_stale';
  end if;

  return public."process_revenuecat_premium_transfer_atomic_internal"(
    p_provider_event_id,
    p_source_user_id,
    p_target_user_id,
    p_environment,
    p_occurred_at,
    p_raw_payload_hash,
    p_failpoint
  );
end;
$$;

create or replace function public."process_revenuecat_premium_event_ordered_internal"(
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
  v_event_type text := upper(trim(coalesce(p_event_type, '')));
  v_environment text := lower(trim(coalesce(p_environment, '')));
  v_provider_event_id text := trim(coalesce(p_provider_event_id, ''));
  v_idempotency_key text;
  v_product public."monetization_products"%rowtype;
  v_existing_event public."provider_events"%rowtype;
  v_current_entitlement public."user_entitlements"%rowtype;
  v_current_grant public."access_grants"%rowtype;
  v_existing_ledger public."money_access_ledger_events"%rowtype;
  v_has_newer_authority boolean;
begin
  if p_user_id is null then
    raise exception 'user_id_required';
  end if;
  if p_product_id is null then
    raise exception 'premium_product_not_found';
  end if;
  if v_provider_event_id = '' then
    raise exception 'provider_event_id_required';
  end if;
  if nullif(trim(coalesce(p_raw_payload_hash, '')), '') is null then
    raise exception 'payload_hash_required';
  end if;
  if p_occurred_at is null then
    raise exception 'revenuecat_event_occurred_at_required';
  end if;

  -- A SHARE table lock freezes the small product-catalog identity set while
  -- authority locks are derived. Catalog writers cannot introduce or replace a
  -- Premium product between lock selection and the delegated atomic mutation.
  lock table public."monetization_products" in share mode;

  select product.* into v_product
  from public."monetization_products" product
  where product."id" = p_product_id
    and product."product_type" = 'premium_subscription'
  limit 1;

  if v_product."id" is null then
    raise exception 'premium_product_not_found';
  end if;

  -- Product authority is always acquired before event idempotency. The
  -- deployed internal function re-acquires both locks in the opposite textual
  -- order, but this session already owns both and no service role can call the
  -- internal function directly.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium:' || p_user_id::text || ':' || v_product."id"::text,
    0
  ));

  v_idempotency_key := v_event_type || ':' || v_provider_event_id;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-event:' || v_idempotency_key,
    0
  ));

  select event.* into v_existing_event
  from public."provider_events" event
  where event."idempotency_key" = v_idempotency_key
    and event."provider" in (
      p_provider,
      case when p_provider <> 'revenuecat' then 'revenuecat' else p_provider end
    )
  order by event."created_at" asc
  limit 1
  for update;

  if v_existing_event."id" is not null
    and (
      v_existing_event."provider_event_id" <> v_provider_event_id
      or v_existing_event."user_id" is distinct from p_user_id
      or v_existing_event."product_id" is distinct from v_product."id"
      or v_existing_event."environment" <> v_environment
      or v_existing_event."event_type" <> v_event_type
      or v_existing_event."occurred_at" is distinct from p_occurred_at
      or v_existing_event."raw_payload_hash" is distinct from p_raw_payload_hash
      or v_existing_event."metadata"->>'provider_product_id'
        is distinct from p_provider_product_id
      or v_existing_event."metadata"->>'store_mapping_id'
        is distinct from p_store_mapping_id::text
    )
  then
    raise exception 'revenuecat_event_duplicate_identity_mismatch';
  end if;

  select exists (
    select 1
    from public."provider_events" event
    where event."user_id" = p_user_id
      and event."product_id" = v_product."id"
      and event."provider" in (
        'revenuecat',
        'revenuecat_app_store',
        'revenuecat_google_play'
      )
      and event."environment" = v_environment
      and event."status" in ('processed', 'refunded', 'reversed')
      and event."occurred_at" > p_occurred_at
      and event."id" is distinct from v_existing_event."id"
  ) into v_has_newer_authority;

  -- A committed duplicate is a read-only acknowledgement. A historical
  -- partial duplicate may still repair only when no newer authority exists.
  if v_existing_event."id" is not null
    and (
      v_existing_event."status" in ('processed', 'refunded', 'reversed')
      or v_has_newer_authority
    )
  then
    select entitlement.* into v_current_entitlement
    from public."user_entitlements" entitlement
    where entitlement."user_id" = p_user_id::text
      and entitlement."entitlement_key" = 'premium'
    limit 1;

    select grant_row.* into v_current_grant
    from public."access_grants" grant_row
    where grant_row."user_id" = p_user_id
      and grant_row."product_id" = v_product."id"
      and grant_row."grant_type" = 'premium'
    order by grant_row."updated_at" desc
    limit 1;

    select ledger.* into v_existing_ledger
    from public."money_access_ledger_events" ledger
    where ledger."provider_event_id" = v_existing_event."id"
      and ledger."event_type" = v_existing_event."event_type"
    order by ledger."created_at" asc
    limit 1;

    return jsonb_build_object(
      'status', 'duplicate_ignored',
      'eventType', v_existing_event."event_type",
      'eventId', v_existing_event."provider_event_id",
      'userId', p_user_id,
      'productKey', v_product."product_key",
      'providerEventId', v_existing_event."id",
      'billingEventId', v_existing_event."metadata"->>'billing_event_id',
      'accessGrantId', v_current_grant."id",
      'ledgerEventId', v_existing_ledger."id",
      'environment', v_environment,
      'entitlementStatus', v_current_entitlement."status",
      'entitlementActive', v_current_entitlement."status" in (
        'active', 'trialing', 'grace_period'
      ),
      'grantStatus', v_current_grant."status",
      'payableState', v_existing_ledger."payable_state",
      'duplicateEvent', true,
      'duplicateAccessGrant', v_current_grant."id" is not null,
      'duplicateLedgerEvent', v_existing_ledger."id" is not null
    );
  end if;

  if v_has_newer_authority then
    raise exception 'revenuecat_event_stale';
  end if;

  return public."process_revenuecat_premium_event_atomic_internal"(
    p_provider,
    p_provider_event_id,
    p_event_type,
    p_user_id,
    p_provider_product_id,
    p_provider_base_plan_id,
    p_environment,
    p_entitlement_status,
    p_starts_at,
    p_expires_at,
    p_occurred_at,
    p_amount_minor,
    p_currency,
    p_raw_payload_hash,
    p_period_type,
    p_store,
    p_platform,
    p_store_mapping_id,
    p_product_id,
    p_failpoint
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
  select public."process_revenuecat_premium_event_ordered_internal"(
    p_provider,
    p_provider_event_id,
    p_event_type,
    p_user_id,
    p_provider_product_id,
    p_provider_base_plan_id,
    p_environment,
    p_entitlement_status,
    p_starts_at,
    p_expires_at,
    p_occurred_at,
    p_amount_minor,
    p_currency,
    p_raw_payload_hash,
    p_period_type,
    p_store,
    p_platform,
    p_store_mapping_id,
    p_product_id,
    null
  );
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
  select public."process_revenuecat_premium_transfer_ordered_internal"(
    p_provider_event_id,
    p_source_user_id,
    p_target_user_id,
    p_environment,
    p_occurred_at,
    p_raw_payload_hash,
    null
  );
$$;

revoke all on function public."process_revenuecat_premium_event_ordered_internal"(
  text, text, text, uuid, text, text, text, text, timestamptz, timestamptz,
  timestamptz, integer, text, text, text, text, text, uuid, uuid, text
) from public, anon, authenticated, service_role;

revoke all on function public."process_revenuecat_premium_event_atomic"(
  text, text, text, uuid, text, text, text, text, timestamptz, timestamptz,
  timestamptz, integer, text, text, text, text, text, uuid, uuid
) from public, anon, authenticated;

grant execute on function public."process_revenuecat_premium_event_atomic"(
  text, text, text, uuid, text, text, text, text, timestamptz, timestamptz,
  timestamptz, integer, text, text, text, text, text, uuid, uuid
) to service_role;

revoke all on function public."process_revenuecat_premium_transfer_ordered_internal"(
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
) is 'Service-only atomic reconciliation for a verified RevenueCat App Store sandbox TRANSFER. It serializes with Premium lifecycle authority, rejects delayed transfers, preserves duplicate idempotency, stores no raw payload, and creates no payable balance or LiveKit authority.';

comment on function public."process_revenuecat_premium_event_atomic"(
  text, text, text, uuid, text, text, text, text, timestamptz, timestamptz,
  timestamptz, integer, text, text, text, text, text, uuid, uuid
) is 'Service-only ordered RevenueCat Premium lifecycle reconciliation. It freezes product identity, locks product authority before event identity, rejects stale events, acknowledges committed duplicates without replaying writes, stores no raw payload, and creates no independent entitlement or money authority.';
