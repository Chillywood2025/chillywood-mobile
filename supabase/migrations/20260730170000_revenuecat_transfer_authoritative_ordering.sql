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
  v_locked_product_id uuid;
  v_lock_product_id uuid;
  v_first_user_id uuid;
  v_second_user_id uuid;
begin
  if p_occurred_at is null then
    raise exception 'transfer_occurred_at_required';
  end if;

  -- Keep duplicate recognition in front of chronological rejection. A replay
  -- of an already-committed transfer must not reapply or become an error merely
  -- because a later renewal now exists.
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

  if v_source_transfer_event."id" is not null
    or v_target_transfer_event."id" is not null
  then
    return public."process_revenuecat_premium_transfer_atomic_internal"(
      p_provider_event_id,
      p_source_user_id,
      p_target_user_id,
      p_environment,
      p_occurred_at,
      p_raw_payload_hash,
      p_failpoint
    );
  end if;

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
      and event."provider" in ('revenuecat_app_store', 'revenuecat')
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
