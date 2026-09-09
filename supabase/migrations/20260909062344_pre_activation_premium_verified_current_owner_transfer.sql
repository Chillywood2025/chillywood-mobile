-- RevenueCat can move an App Store subscription after Restore even when the
-- local former owner's finite grant has already expired. The signed TRANSFER
-- webhook is then durably ignored by the existing projector because there is
-- no active source authority to move. A later server-authenticated RevenueCat
-- v2 current-customer snapshot is sufficient to finish that exact move, but
-- only when it matches the previously verified source -> target TRANSFER.
--
-- This is intentionally a new, uniquely named service-only entry point. The
-- existing same-owner reconciliation remains unchanged and continues to reject
-- arbitrary cross-user rebinding.

-- Every App Store Premium producer that can establish or move finite authority
-- must share one account-level lock before its first authority observation.
-- Product and original-transaction locks remain authoritative for their own
-- scopes; this additional layer closes the account-switch ordering boundary
-- when the source has no currently active product row to lock.
create or replace function public."lock_revenuecat_premium_owner_users_internal"(
  p_first_user_id uuid,
  p_second_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_first_user_id is null or p_second_user_id is null then
    raise exception 'revenuecat_premium_owner_lock_identity_invalid';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-owner-user:'
      || least(p_first_user_id::text, p_second_user_id::text),
    0
  ));
  if p_first_user_id <> p_second_user_id then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'revenuecat-premium-owner-user:'
        || greatest(p_first_user_id::text, p_second_user_id::text),
      0
    ));
  end if;
end;
$$;

revoke all on function public."lock_revenuecat_premium_owner_users_internal"(
  uuid, uuid
) from public, anon, authenticated, service_role;
comment on function public."lock_revenuecat_premium_owner_users_internal"(
  uuid, uuid
) is 'Internal deterministic per-user serialization for App Store Premium authority producers and transfers. Callers must acquire these owner locks before event, original-transaction, product, entitlement, or transfer authority observations.';

-- Wrap the existing exact provider-event projector so signed App Store events
-- cannot race a Restore or TRANSFER through an authority-missing observation.
alter function public."process_revenuecat_premium_event_atomic"(
  text, text, text, uuid, text, text, text, text, timestamptz, timestamptz,
  timestamptz, integer, text, text, text, text, text, uuid, uuid, text
) rename to "process_revenuecat_premium_event_pre_owner_serialization";
revoke all on function public."process_revenuecat_premium_event_pre_owner_serialization"(
  text, text, text, uuid, text, text, text, text, timestamptz, timestamptz,
  timestamptz, integer, text, text, text, text, text, uuid, uuid, text
) from public, anon, authenticated, service_role;

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
  p_product_id uuid,
  p_original_transaction_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if lower(trim(coalesce(p_provider, ''))) = 'revenuecat_app_store'
    and lower(trim(coalesce(p_environment, ''))) = 'sandbox'
    and p_user_id is not null
  then
    perform public."lock_revenuecat_premium_owner_users_internal"(
      p_user_id, p_user_id
    );
    perform public."lock_revenuecat_premium_quarantine_scopes_internal"(
      'revenuecat_app_store', p_user_id, 'sandbox'
    );
  end if;

  return public."process_revenuecat_premium_event_pre_owner_serialization"(
    p_provider, p_provider_event_id, p_event_type, p_user_id,
    p_provider_product_id, p_provider_base_plan_id, p_environment,
    p_entitlement_status, p_starts_at, p_expires_at, p_occurred_at,
    p_amount_minor, p_currency, p_raw_payload_hash, p_period_type, p_store,
    p_platform, p_store_mapping_id, p_product_id, p_original_transaction_id
  );
end;
$$;
revoke all on function public."process_revenuecat_premium_event_atomic"(
  text, text, text, uuid, text, text, text, text, timestamptz, timestamptz,
  timestamptz, integer, text, text, text, text, text, uuid, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public."process_revenuecat_premium_event_atomic"(
  text, text, text, uuid, text, text, text, text, timestamptz, timestamptz,
  timestamptz, integer, text, text, text, text, text, uuid, uuid, text
) to service_role;

-- Current-customer snapshots participate in the same account stream even when
-- the original transaction has not been bound yet.
alter function public."reconcile_revenuecat_premium_snapshot_atomic"(
  text, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, text
) rename to "reconcile_revenuecat_premium_snapshot_pre_owner_serialization";
revoke all on function public."reconcile_revenuecat_premium_snapshot_pre_owner_serialization"(
  text, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, text
) from public, anon, authenticated, service_role;

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
begin
  if p_user_id is not null then
    perform public."lock_revenuecat_premium_owner_users_internal"(
      p_user_id, p_user_id
    );
    perform public."lock_revenuecat_premium_quarantine_scopes_internal"(
      'revenuecat_app_store', p_user_id, 'sandbox'
    );
  end if;
  return public."reconcile_revenuecat_premium_snapshot_pre_owner_serialization"(
    p_snapshot_id, p_user_id, p_revenuecat_subscription_id,
    p_original_transaction_id, p_provider_product_id, p_entitlement_status,
    p_starts_at, p_expires_at, p_observed_at, p_raw_payload_hash
  );
end;
$$;
revoke all on function public."reconcile_revenuecat_premium_snapshot_atomic"(
  text, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, text
) from public, anon, authenticated, service_role;
grant execute on function public."reconcile_revenuecat_premium_snapshot_atomic"(
  text, uuid, text, text, text, text, timestamptz, timestamptz, timestamptz, text
) to service_role;

-- The signed TRANSFER wrapper must lock both named users before deciding that
-- its source has no finite authority. The prior exact projector remains intact
-- behind this service-only serialization layer.
alter function public."process_revenuecat_premium_transfer_atomic"(
  text, uuid, uuid, text, timestamptz, text
) rename to "process_revenuecat_premium_transfer_pre_owner_serialization";
revoke all on function public."process_revenuecat_premium_transfer_pre_owner_serialization"(
  text, uuid, uuid, text, timestamptz, text
) from public, anon, authenticated, service_role;

create or replace function public."process_revenuecat_premium_transfer_atomic"(
  p_provider_event_id text,
  p_source_user_id uuid,
  p_target_user_id uuid,
  p_environment text,
  p_occurred_at timestamptz,
  p_raw_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_source_user_id is null or p_target_user_id is null
    or p_source_user_id = p_target_user_id
  then
    raise exception 'revenuecat_premium_transfer_identity_invalid';
  end if;
  perform public."lock_revenuecat_premium_owner_users_internal"(
    p_source_user_id, p_target_user_id
  );
  return public."process_revenuecat_premium_transfer_pre_owner_serialization"(
    p_provider_event_id, p_source_user_id, p_target_user_id, p_environment,
    p_occurred_at, p_raw_payload_hash
  );
end;
$$;
revoke all on function public."process_revenuecat_premium_transfer_atomic"(
  text, uuid, uuid, text, timestamptz, text
) from public, anon, authenticated, service_role;
grant execute on function public."process_revenuecat_premium_transfer_atomic"(
  text, uuid, uuid, text, timestamptz, text
) to service_role;

create or replace function public."reconcile_revenuecat_premium_current_owner_snapshot_atomic"(
  p_snapshot_id text,
  p_user_id uuid,
  p_original_customer_id text,
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
  v_now timestamptz := clock_timestamp();
  v_snapshot_id text := trim(coalesce(p_snapshot_id, ''));
  v_original_customer_id text := trim(coalesce(p_original_customer_id, ''));
  v_original_transaction_id text := trim(coalesce(p_original_transaction_id, ''));
  v_binding public."revenuecat_premium_transaction_authority"%rowtype;
  v_source_entitlement public."user_entitlements"%rowtype;
  v_source_provider_event public."provider_events"%rowtype;
  v_transfer_event public."provider_events"%rowtype;
  v_mapping public."monetization_product_store_mappings"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_candidate_source_user_id uuid;
  v_source_result jsonb;
  v_result jsonb;
  v_transfer_count integer := 0;
begin
  if p_user_id is null
    or v_snapshot_id = '' or length(v_snapshot_id) > 512
    or v_snapshot_id <> coalesce(p_snapshot_id, '')
    or v_snapshot_id ~ '[[:cntrl:]]'
    or v_original_customer_id = '' or length(v_original_customer_id) > 1500
    or v_original_customer_id <> coalesce(p_original_customer_id, '')
    or v_original_customer_id ~ '[[:cntrl:]]'
    or v_original_transaction_id = '' or length(v_original_transaction_id) > 512
    or v_original_transaction_id <> coalesce(p_original_transaction_id, '')
    or v_original_transaction_id ~ '[[:cntrl:]]'
  then
    raise exception 'premium_current_owner_reconciliation_identity_invalid';
  end if;

  -- The first read discovers the possible former owner without holding an
  -- original-transaction lock. Account locks always come first; the binding is
  -- then re-read under its row/original locks and must still match.
  select transaction_authority."user_id" into v_candidate_source_user_id
  from public."revenuecat_premium_transaction_authority" transaction_authority
  where transaction_authority."provider" = 'revenuecat_app_store'
    and transaction_authority."original_transaction_id" = v_original_transaction_id;

  perform public."lock_revenuecat_premium_owner_users_internal"(
    coalesce(v_candidate_source_user_id, p_user_id), p_user_id
  );
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-reconciliation:' || v_snapshot_id, 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-original:revenuecat_app_store:' || v_original_transaction_id, 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-original:revenuecat_app_store:' || v_original_transaction_id, 0
  ));

  select transaction_authority.* into v_binding
  from public."revenuecat_premium_transaction_authority" transaction_authority
  where transaction_authority."provider" = 'revenuecat_app_store'
    and transaction_authority."original_transaction_id" = v_original_transaction_id
  for update;

  -- New subscriptions and same-owner restores continue through the already
  -- hardened path. It retains every existing identity, product, period,
  -- terminal, quarantine, switch, idempotency and money-safety check.
  if v_binding."id" is null or v_binding."user_id" = p_user_id then
    return public."reconcile_revenuecat_premium_snapshot_atomic"(
      p_snapshot_id,
      p_user_id,
      p_revenuecat_subscription_id,
      p_original_transaction_id,
      p_provider_product_id,
      p_entitlement_status,
      p_starts_at,
      p_expires_at,
      p_observed_at,
      p_raw_payload_hash
    );
  end if;

  if v_candidate_source_user_id is null
    or v_binding."user_id" <> v_candidate_source_user_id
  then
    raise exception 'premium_current_owner_transfer_binding_changed';
  end if;

  if v_binding."environment" <> 'sandbox'
    or v_binding."authority_state" not in ('active', 'retained', 'expired')
    or p_observed_at is null
    or p_observed_at > v_now + interval '5 minutes'
  then
    raise exception 'premium_current_owner_transfer_binding_invalid';
  end if;
  if not exists (
    select 1 from auth."users" user_row where user_row."id" = p_user_id
  ) or not exists (
    select 1 from auth."users" user_row where user_row."id" = v_binding."user_id"
  ) then
    raise exception 'premium_current_owner_transfer_user_missing';
  end if;

  -- This successor is deliberately limited to the physical defect class: the
  -- signed transfer arrived after the former owner's finite authority expired.
  -- An active source still uses the existing atomic TRANSFER projector.
  if public."premium_subject_has_finite_authority_internal"(v_binding."user_id"::text) then
    raise exception 'premium_current_owner_transfer_source_still_active';
  end if;

  select entitlement.* into v_source_entitlement
  from public."user_entitlements" entitlement
  join public."provider_events" source_event
    on source_event."provider_event_id" = entitlement."metadata"->>'revenuecat_event_id'
   and source_event."raw_payload_hash" = entitlement."metadata"->>'revenuecat_event_hash'
  where entitlement."user_id" = v_binding."user_id"::text
    and entitlement."entitlement_key" = 'premium'
    and entitlement."source" = 'revenuecat'
    and entitlement."expires_at" is not null
    and entitlement."expires_at" <= v_now
    and source_event."provider" = 'revenuecat_app_store'
    and source_event."user_id" = v_binding."user_id"
    and source_event."environment" = 'sandbox'
    and source_event."provider_event_id" = v_binding."latest_event_id"
    and source_event."raw_payload_hash" = v_binding."latest_event_hash"
    and source_event."metadata"->>'original_transaction_id' = v_original_transaction_id
  limit 1
  for update of entitlement;
  if v_source_entitlement."user_id" is null then
    raise exception 'premium_current_owner_transfer_expired_source_invalid';
  end if;
  select source_event.* into v_source_provider_event
  from public."provider_events" source_event
  where source_event."provider_event_id" = v_source_entitlement."metadata"->>'revenuecat_event_id'
    and source_event."raw_payload_hash" = v_source_entitlement."metadata"->>'revenuecat_event_hash'
    and source_event."provider" = 'revenuecat_app_store'
    and source_event."user_id" = v_binding."user_id"
    and source_event."environment" = 'sandbox'
    and source_event."provider_event_id" = v_binding."latest_event_id"
    and source_event."raw_payload_hash" = v_binding."latest_event_hash"
    and source_event."metadata"->>'original_transaction_id' = v_original_transaction_id
  limit 1
  for update;
  if v_source_provider_event."id" is null then
    raise exception 'premium_current_owner_transfer_expired_source_invalid';
  end if;

  select mapping.* into v_mapping
  from public."monetization_product_store_mappings" mapping
  where mapping."product_id" = v_binding."current_product_id"
    and mapping."concept" = 'premium'
    and mapping."platform" = 'ios'
    and mapping."store" = 'app_store'
    and mapping."provider" = 'revenuecat_app_store'
    and mapping."provider_product_id" = trim(coalesce(p_provider_product_id, ''))
    and mapping."provider_product_id" = v_binding."current_provider_product_id"
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
    raise exception 'premium_current_owner_transfer_store_mapping_invalid';
  end if;
  select product.* into v_product
  from public."monetization_products" product
  where product."id" = v_mapping."product_id"
    and product."product_type" = 'premium_subscription';
  if v_product."id" is null then
    raise exception 'premium_current_owner_transfer_product_invalid';
  end if;

  -- TRANSFER payloads are verified by the webhook before this immutable event
  -- is written. Reconciliation may consume exactly one previously ignored
  -- source-missing event for this source and this authenticated target.
  select count(*)::integer into v_transfer_count
  from public."provider_events" event
  where event."provider" = 'revenuecat_app_store'
    and event."event_type" = 'TRANSFER'
    and event."environment" = 'sandbox'
    and event."status" = 'ignored'
    and event."user_id" = p_user_id
    and event."occurred_at" >= v_binding."latest_occurred_at"
    and event."occurred_at" <= p_observed_at
    and event."raw_payload_hash" ~ '^[0-9a-f]{64}$'
    and event."metadata"->>'source_user_id' = v_binding."user_id"::text
    and event."metadata"->>'target_user_id' = p_user_id::text
    and event."metadata"->>'transfer_time_valid' = 'true'
    and event."metadata"->>'transfer_applied' = 'false'
    and event."metadata"->>'provider_payload_stored' = 'false'
    and event."metadata"->>'final_reason' = 'premium_transfer_source_transaction_authority_missing';
  if v_transfer_count <> 1 then
    if v_transfer_count = 0 then
      raise exception 'premium_current_owner_transfer_evidence_missing';
    end if;
    raise exception 'premium_current_owner_transfer_evidence_ambiguous';
  end if;

  select event.* into strict v_transfer_event
  from public."provider_events" event
  where event."provider" = 'revenuecat_app_store'
    and event."event_type" = 'TRANSFER'
    and event."environment" = 'sandbox'
    and event."status" = 'ignored'
    and event."user_id" = p_user_id
    and event."occurred_at" >= v_binding."latest_occurred_at"
    and event."occurred_at" <= p_observed_at
    and event."raw_payload_hash" ~ '^[0-9a-f]{64}$'
    and event."metadata"->>'source_user_id' = v_binding."user_id"::text
    and event."metadata"->>'target_user_id' = p_user_id::text
    and event."metadata"->>'transfer_time_valid' = 'true'
    and event."metadata"->>'transfer_applied' = 'false'
    and event."metadata"->>'provider_payload_stored' = 'false'
    and event."metadata"->>'final_reason' = 'premium_transfer_source_transaction_authority_missing'
  for update;

  if exists (
    select 1
    from public."provider_events" later_transfer
    where later_transfer."provider" = 'revenuecat_app_store'
      and later_transfer."event_type" = 'TRANSFER'
      and later_transfer."environment" = 'sandbox'
      and later_transfer."occurred_at" > v_transfer_event."occurred_at"
      and (
        later_transfer."metadata"->>'source_user_id' in (
          v_binding."user_id"::text, p_user_id::text
        )
        or later_transfer."metadata"->>'target_user_id' in (
          v_binding."user_id"::text, p_user_id::text
        )
      )
  ) then
    raise exception 'premium_current_owner_transfer_newer_transfer_exists';
  end if;

  v_source_result := public."process_revenuecat_premium_event_atomic_internal"(
    'revenuecat_app_store',
    'transfer:' || v_transfer_event."provider_event_id" || ':source',
    'REVOCATION',
    v_binding."user_id",
    v_mapping."provider_product_id",
    null,
    'sandbox',
    'revoked',
    v_source_entitlement."starts_at",
    v_source_entitlement."expires_at",
    v_transfer_event."occurred_at",
    0,
    'usd',
    v_transfer_event."raw_payload_hash",
    'TRANSFER_CURRENT_OWNER_RECONCILIATION',
    'app_store',
    'ios',
    v_mapping."id",
    v_product."id",
    null
  );
  if coalesce(v_source_result->>'entitlementStatus', '') <> 'revoked' then
    raise exception 'premium_current_owner_transfer_source_revocation_failed';
  end if;

  update public."provider_events" event
  set "metadata" = coalesce(event."metadata", '{}'::jsonb) || jsonb_build_object(
    'revenuecat_transfer', true,
    'transfer_direction', 'source_revoked',
    'transfer_provider_event_id', v_transfer_event."provider_event_id",
    'transfer_payload_hash', v_transfer_event."raw_payload_hash",
    'original_transaction_id', v_original_transaction_id,
    'premium_transaction_binding_id', v_binding."id",
    'current_customer_reconciliation', true,
    'provider_snapshot_only', true,
    'provider_transaction_created', false,
    'provider_payload_stored', false,
    'money_action', false,
    'payout_ready', false
  )
  where event."id" = nullif(v_source_result->>'providerEventId', '')::uuid;
  if not found then
    raise exception 'premium_current_owner_transfer_source_event_missing';
  end if;

  update public."revenuecat_premium_transaction_authority" transaction_authority
  set "user_id" = p_user_id,
      "authority_state" = 'pending',
      "updated_at" = v_now
  where transaction_authority."id" = v_binding."id"
    and transaction_authority."user_id" = v_binding."user_id";
  if not found then
    raise exception 'premium_current_owner_transfer_binding_move_failed';
  end if;

  v_result := public."reconcile_revenuecat_premium_snapshot_atomic"(
    p_snapshot_id,
    p_user_id,
    p_revenuecat_subscription_id,
    p_original_transaction_id,
    p_provider_product_id,
    p_entitlement_status,
    p_starts_at,
    p_expires_at,
    p_observed_at,
    p_raw_payload_hash
  );
  if coalesce(v_result->>'status', '') <> 'processed'
    or coalesce((v_result->>'entitlementActive')::boolean, false) is not true
  then
    raise exception 'premium_current_owner_transfer_target_projection_failed';
  end if;

  update public."provider_events" event
  set "metadata" = coalesce(event."metadata", '{}'::jsonb) || jsonb_build_object(
    'original_transaction_id', v_original_transaction_id,
    'premium_transaction_binding_id', v_binding."id",
    'verified_transfer_event_id', v_transfer_event."provider_event_id",
    'verified_transfer_event_hash', v_transfer_event."raw_payload_hash",
    'current_customer_reconciliation', true,
    'provider_original_customer_present', true,
    'provider_transaction_created', false,
    'provider_payload_stored', false,
    'money_action', false,
    'payout_ready', false
  )
  where event."provider" = 'revenuecat_app_store'
    and event."provider_event_id" = v_snapshot_id
    and event."user_id" = p_user_id
    and event."raw_payload_hash" = p_raw_payload_hash
    and event."event_type" = 'RECONCILIATION';
  if not found then
    raise exception 'premium_current_owner_transfer_target_event_missing';
  end if;

  update public."provider_events" event
  set "metadata" = coalesce(event."metadata", '{}'::jsonb) || jsonb_build_object(
    'original_transaction_id', v_original_transaction_id,
    'premium_transaction_binding_id', v_binding."id",
    'current_customer_reconciliation_snapshot_id', v_snapshot_id,
    'transfer_applied', true,
    'final_reason', 'premium_transfer_current_customer_reconciled',
    'authority_granted', false,
    'provider_payload_stored', false,
    'money_action', false
  )
  where event."id" = v_transfer_event."id"
    and event."metadata"->>'transfer_applied' = 'false';
  if not found then
    raise exception 'premium_current_owner_transfer_evidence_consume_failed';
  end if;

  if public."premium_subject_has_finite_authority_internal"(v_binding."user_id"::text)
    or not public."premium_subject_has_finite_authority_internal"(p_user_id::text)
    or not exists (
      select 1
      from public."revenuecat_premium_transaction_authority" transaction_authority
      where transaction_authority."id" = v_binding."id"
        and transaction_authority."user_id" = p_user_id
        and transaction_authority."environment" = 'sandbox'
        and transaction_authority."authority_state" = 'active'
        and transaction_authority."latest_event_id" = v_snapshot_id
        and transaction_authority."latest_event_hash" = p_raw_payload_hash
    )
  then
    raise exception 'premium_current_owner_transfer_postcondition_failed';
  end if;

  return v_result || jsonb_build_object(
    'currentOwnerTransfer', true,
    'sourceRevoked', true,
    'targetActive', true,
    'providerTransactionCreated', false,
    'liveMoneyAction', false
  );
end;
$$;

revoke all on function public."reconcile_revenuecat_premium_current_owner_snapshot_atomic"(
  text, uuid, text, text, text, text, text, timestamptz, timestamptz, timestamptz, text
) from public, anon, authenticated, service_role;
grant execute on function public."reconcile_revenuecat_premium_current_owner_snapshot_atomic"(
  text, uuid, text, text, text, text, text, timestamptz, timestamptz, timestamptz, text
) to service_role;
comment on function public."reconcile_revenuecat_premium_current_owner_snapshot_atomic"(
  text, uuid, text, text, text, text, text, timestamptz, timestamptz, timestamptz, text
) is 'Service-only exact RevenueCat v2 current-owner Premium reconciliation. Cross-user movement requires one prior verified sandbox App Store TRANSFER from the expired bound owner to the authenticated current customer, atomically revokes the source, activates only the target, stores no provider payload, creates no provider transaction or payable balance, and leaves live money and payouts off.';
