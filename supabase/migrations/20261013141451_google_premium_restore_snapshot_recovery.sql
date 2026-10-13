-- Same-owner Google Play sandbox restore recovery for a previously bound
-- original transaction. Current/original customer, complete transaction
-- history, exact catalog product/base-plan and finite period are read from
-- RevenueCat by the authenticated Edge. Apple and retail policy are unchanged.

create or replace function public."reconcile_revenuecat_google_premium_snapshot_atomic"(
  p_snapshot_id text,
  p_user_id uuid,
  p_original_customer_id text,
  p_revenuecat_subscription_id text,
  p_original_transaction_id text,
  p_provider_product_id text,
  p_provider_base_plan_id text,
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
  v_subscription_id text := trim(coalesce(p_revenuecat_subscription_id, ''));
  v_original_transaction_id text := trim(coalesce(p_original_transaction_id, ''));
  v_provider_product_id text := trim(coalesce(p_provider_product_id, ''));
  v_status text := lower(trim(coalesce(p_entitlement_status, '')));
  v_product public."monetization_products"%rowtype;
  v_binding public."revenuecat_premium_transaction_authority"%rowtype;
  v_existing_event public."provider_events"%rowtype;
  v_projected_event_id uuid;
  v_anchor public."provider_events"%rowtype;
  v_entitlement public."user_entitlements"%rowtype;
  v_grant public."access_grants"%rowtype;
  v_expiration_marker boolean := false;
  v_revenuecat_switch text;
  v_webhook_switch text;
  v_live_money_switch text;
  v_payouts_switch text;
  v_cashout_switch text;
begin
  if p_user_id is null
    or p_original_customer_id is distinct from p_user_id::text
    or coalesce(p_provider_base_plan_id, '') !~ '^[a-z0-9][a-z0-9-]{0,62}$'
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
  if p_starts_at is null or not isfinite(p_starts_at) or p_starts_at > v_now
    or p_expires_at is null or not isfinite(p_expires_at) or p_expires_at <= v_now
    or p_expires_at <= p_starts_at
    or p_observed_at is null or not isfinite(p_observed_at)
    or p_observed_at > v_now + interval '5 minutes'
    or p_observed_at < v_now - interval '5 minutes'
    or p_observed_at < p_starts_at
  then
    raise exception 'premium_reconciliation_period_invalid';
  end if;

  -- Match the deployed Google webhook order: event, original, premium-original,
  -- quarantine, then product. Apple account-stream locking is unchanged.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-event-id:' || v_snapshot_id, 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-original:revenuecat_google_play:' || v_original_transaction_id, 0
  ));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-original:revenuecat_google_play:' || v_original_transaction_id, 0
  ));
  perform public."lock_revenuecat_premium_quarantine_scopes_internal"(
    'revenuecat_google_play', p_user_id, 'sandbox'
  );
  lock table public."monetization_products" in share mode;
  if (select count(*) from public."monetization_products" product
      where product."product_type" = 'premium_subscription'
        and product."provider" = 'revenuecat_google_play'
        and product."provider_product_id" = v_provider_product_id
        and product."provider_base_plan_id" = p_provider_base_plan_id
        and product."environment" = 'sandbox' and product."status" = 'sandbox'
        and product."is_android_digital" is true) <> 1
    or v_provider_product_id <> 'premium_subscription'
  then raise exception 'premium_reconciliation_store_mapping_invalid'; end if;
  select product.* into v_product from public."monetization_products" product
  where product."product_type" = 'premium_subscription'
    and product."provider" = 'revenuecat_google_play'
    and product."provider_product_id" = v_provider_product_id
    and product."provider_base_plan_id" = p_provider_base_plan_id
    and product."environment" = 'sandbox' and product."status" = 'sandbox'
    and product."is_android_digital" is true;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium:' || p_user_id::text || ':' || v_product."id"::text, 0
  ));

  select "state" into v_revenuecat_switch
  from public."platform_money_kill_switches"
  where "key" = 'revenuecat_google_play_enabled';
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
      'revenuecat_google_play', p_user_id, 'sandbox'
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

  -- RevenueCat v2 may start a new subscription record at resubscription or
  -- product changes. Its first transaction is not sufficient first-binding
  -- authority. Require an existing original transaction established by the
  -- authenticated webhook for exactly this owner and catalog pair.
  select transaction_authority.* into v_binding
  from public."revenuecat_premium_transaction_authority" transaction_authority
  where transaction_authority."provider" = 'revenuecat_google_play'
    and transaction_authority."original_transaction_id" = v_original_transaction_id
  for update;
  if v_binding."id" is null then
    raise exception 'premium_reconciliation_original_authority_missing';
  end if;
  if v_binding."user_id" <> p_user_id or v_binding."environment" <> 'sandbox' then
    raise exception 'premium_reconciliation_cross_user_transaction';
  end if;
  if v_binding."current_product_id" is distinct from v_product."id"
    or v_binding."current_provider_product_id" is distinct from v_provider_product_id
    or v_binding."current_provider_base_plan_id" is distinct from p_provider_base_plan_id
  then raise exception 'premium_reconciliation_bound_product_mismatch'; end if;
  if v_binding."authority_state" not in ('active', 'retained', 'expired') then
    raise exception 'premium_reconciliation_terminal_authority_not_superseded';
  end if;

  -- Restore repairs only an existing, internally consistent access graph.
  -- A missing initial provider event cannot be replaced by a guessed purchase.
  select event.* into v_anchor from public."provider_events" event
  where event."provider" = 'revenuecat_google_play'
    and event."provider_event_id" = v_binding."latest_event_id"
    and event."raw_payload_hash" = v_binding."latest_event_hash"
    and event."user_id" = p_user_id and event."product_id" = v_product."id"
    and event."environment" = 'sandbox'
    and event."status" in ('processed', 'reversed')
    and event."metadata"->>'original_transaction_id' = v_original_transaction_id
    and event."metadata"->>'premium_transaction_binding_id' = v_binding."id"::text;
  if v_anchor."id" is null then
    raise exception 'premium_reconciliation_bound_evidence_missing';
  end if;
  select entitlement.* into v_entitlement from public."user_entitlements" entitlement
  where entitlement."user_id" = p_user_id::text
    and entitlement."entitlement_key" = 'premium'
  for update;
  if v_entitlement."user_id" is null or v_entitlement."source" <> 'revenuecat'
    or v_entitlement."metadata"->>'environment' is distinct from 'sandbox'
    or v_entitlement."metadata"->>'revenuecat_event_id' is distinct from v_anchor."provider_event_id"
    or v_entitlement."metadata"->>'revenuecat_event_hash' is distinct from v_anchor."raw_payload_hash"
    or v_entitlement."revoked_at" is not null
    or v_entitlement."status" not in ('active', 'trialing', 'grace_period', 'expired', 'canceled')
  then raise exception 'premium_reconciliation_bound_entitlement_mismatch'; end if;
  if (select count(*) from public."access_grants" grant_row
      where grant_row."user_id" = p_user_id and grant_row."product_id" = v_product."id"
        and grant_row."grant_type" = 'premium') <> 1
  then raise exception 'premium_reconciliation_bound_grant_mismatch'; end if;
  select grant_row.* into v_grant from public."access_grants" grant_row
  where grant_row."user_id" = p_user_id and grant_row."product_id" = v_product."id"
    and grant_row."grant_type" = 'premium'
  for update;
  -- Only the exact ordinary-expiration marker from the existing terminal
  -- dispatcher may be cleared by a strictly newer verified provider period.
  -- Refunds, revocations, pauses, blocks and unmatched markers remain closed.
  v_expiration_marker := v_binding."authority_state" = 'expired'
    and v_binding."latest_event_type" = 'EXPIRATION' and v_anchor."event_type" = 'EXPIRATION'
    and p_starts_at > v_binding."latest_occurred_at"
    and v_grant."status" = 'expired' and v_grant."refunded_at" is null
    and v_grant."revoked_at" = v_anchor."occurred_at"
    and v_grant."revoke_reason" = 'RevenueCat expiration terminal dispatch.'
    and v_grant."metadata"->>'terminal_dispatch_domain' = 'premium'
    and v_grant."metadata"->>'latest_provider_event_id' = v_anchor."id"::text
    and v_grant."metadata"->>'original_transaction_id' = v_original_transaction_id;
  if v_grant."provider" <> 'revenuecat_google_play'
    or v_grant."environment" <> 'sandbox'
    or v_grant."provider_event_id" is distinct from v_anchor."id"
    or v_grant."source_type" <> 'provider_event'
    or v_grant."refunded_at" is not null
    or (v_grant."revoked_at" is not null and not coalesce(v_expiration_marker, false))
    or v_grant."status" not in ('sandbox_only', 'expired')
  then raise exception 'premium_reconciliation_bound_grant_mismatch'; end if;

  -- Locks can wait past expiry; transaction now() is not a freshness clock.
  v_now := clock_timestamp();
  if p_expires_at <= v_now or p_observed_at < v_now - interval '5 minutes' then
    raise exception 'premium_reconciliation_period_invalid';
  end if;

  select event.* into v_existing_event
  from public."provider_events" event
  where event."provider" in ('revenuecat', 'revenuecat_app_store', 'revenuecat_google_play')
    and event."provider_event_id" = v_snapshot_id
  limit 1
  for update;
  if v_existing_event."id" is not null then
    if v_existing_event."provider" <> 'revenuecat_google_play'
      or v_existing_event."provider_event_id" <> v_snapshot_id
      or v_existing_event."status" <> 'processed'
      or v_existing_event."metadata"->>'premium_transaction_binding_id' is distinct from v_binding."id"::text
      or v_existing_event."metadata"->>'provider_product_id' is distinct from v_provider_product_id
      or v_existing_event."metadata"->>'provider_base_plan_id' is distinct from p_provider_base_plan_id
      or v_existing_event."metadata"->>'snapshot_original_customer_id' is distinct from p_original_customer_id
      or v_existing_event."metadata"->>'snapshot_status' is distinct from v_status
      or (v_existing_event."metadata"->>'snapshot_starts_at')::timestamptz is distinct from p_starts_at
      or (v_existing_event."metadata"->>'snapshot_expires_at')::timestamptz is distinct from p_expires_at
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
    if p_expires_at <= clock_timestamp()
      or p_observed_at < clock_timestamp() - interval '5 minutes' then
      raise exception 'premium_reconciliation_period_invalid';
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
    where creator_binding."provider" = 'revenuecat_google_play'
      and creator_binding."original_transaction_id" = v_original_transaction_id
  ) or exists (
    select 1
    from public."revenuecat_unbound_initial_authority" creator_reservation
    where creator_reservation."provider" = 'revenuecat_google_play'
      and creator_reservation."original_transaction_id" = v_original_transaction_id
  ) or exists (
    select 1
    from public."revenuecat_unbound_terminal_authority" terminal_reservation
    where terminal_reservation."provider" = 'revenuecat_google_play'
      and terminal_reservation."original_transaction_id" = v_original_transaction_id
  ) then
    raise exception 'premium_reconciliation_cross_domain_transaction_reserved';
  end if;

  if (p_starts_at, 3, v_snapshot_id collate "C") <= (
    v_binding."latest_occurred_at", v_binding."latest_event_rank", v_binding."latest_event_id" collate "C"
  ) then
    if p_expires_at <= clock_timestamp()
      or p_observed_at < clock_timestamp() - interval '5 minutes' then
      raise exception 'premium_reconciliation_period_invalid';
    end if;
    return jsonb_build_object(
      'status', 'duplicate_ignored', 'reason', 'premium_reconciliation_snapshot_stale',
      'eventType', 'RECONCILIATION', 'eventId', v_snapshot_id,
      'entitlementActive', public."premium_subject_has_finite_authority_internal"(p_user_id::text),
      'duplicateEvent', true, 'liveMoneyAction', false
    );
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
        and event."provider" = 'revenuecat_google_play'
        and event."metadata"->>'original_transaction_id' = v_original_transaction_id
    )
  then
    raise exception 'premium_reconciliation_conflicting_active_authority';
  end if;

  -- Typed verification evidence only. No purchase operation, price, billing
  -- row, money ledger row, original binding or new grant is manufactured.
  insert into public."provider_events" (
    "provider_event_id", "provider", "product_id", "product_key", "user_id",
    "app_user_id", "environment", "event_type", "status", "occurred_at",
    "idempotency_key", "raw_payload_hash", "metadata"
  ) values (
    v_snapshot_id, 'revenuecat_google_play', v_product."id", v_product."product_key", p_user_id,
    p_user_id::text, 'sandbox', 'RECONCILIATION', 'processed', p_starts_at,
    'RECONCILIATION:' || v_snapshot_id, p_raw_payload_hash,
    jsonb_build_object(
      'provider_payload_stored', false, 'provider_product_id', v_provider_product_id,
      'provider_base_plan_id', p_provider_base_plan_id, 'store', 'google_play', 'platform', 'android',
      'entitlement_key', 'premium', 'sandbox_only', true, 'money_action', false, 'payout_ready', false,
      'lifecycle_event_type', 'RECONCILIATION', 'reconciliation_source', 'revenuecat_v2_current_customer',
      'revenuecat_subscription_id', v_subscription_id, 'original_transaction_id', v_original_transaction_id,
      'premium_transaction_binding_id', v_binding."id", 'provider_snapshot_only', true,
      'provider_transaction_created', false, 'billing_event_created', false, 'money_ledger_created', false,
      'snapshot_original_customer_id', p_original_customer_id, 'snapshot_status', v_status,
      'snapshot_starts_at', p_starts_at, 'snapshot_expires_at', p_expires_at,
      'previous_provider_event_id', v_anchor."id", 'access_grant_id', v_grant."id"
    )
  ) returning "id" into v_projected_event_id;

  update public."user_entitlements" entitlement
  set "status" = v_status, "starts_at" = p_starts_at, "expires_at" = p_expires_at,
      "updated_at" = v_now,
      "metadata" = coalesce(entitlement."metadata", '{}'::jsonb) || jsonb_build_object(
        'revenuecat_event_id', v_snapshot_id, 'revenuecat_event_type', 'RECONCILIATION',
        'revenuecat_event_hash', p_raw_payload_hash, 'environment', 'sandbox',
        'reconciliation_source', 'revenuecat_v2_current_customer', 'provider_transaction_created', false
      )
  where entitlement."user_id" = p_user_id::text and entitlement."entitlement_key" = 'premium';
  if not found then raise exception 'premium_reconciliation_entitlement_update_missing'; end if;

  update public."access_grants" grant_row
  set "provider_event_id" = v_projected_event_id, "source_id" = v_projected_event_id,
      "status" = 'sandbox_only', "starts_at" = p_starts_at, "expires_at" = p_expires_at,
      "revoked_at" = case when v_expiration_marker then null else grant_row."revoked_at" end,
      "revoke_reason" = case when v_expiration_marker then null else grant_row."revoke_reason" end,
      "updated_at" = v_now,
      "metadata" = coalesce(grant_row."metadata", '{}'::jsonb) || jsonb_build_object(
        'lifecycle_event_type', 'RECONCILIATION', 'reconciliation_source', 'revenuecat_v2_current_customer',
        'provider_transaction_created', false, 'authority_granted', false, 'payout_access', false
      )
  where grant_row."id" = v_grant."id";
  if not found then raise exception 'premium_reconciliation_grant_update_missing'; end if;

  update public."revenuecat_premium_transaction_authority" transaction_authority
  set "latest_event_id" = v_snapshot_id, "latest_event_hash" = p_raw_payload_hash,
      "latest_event_type" = 'RECONCILIATION', "latest_occurred_at" = p_starts_at,
      "latest_event_rank" = 3, "authority_state" = 'active', "updated_at" = v_now
  where transaction_authority."id" = v_binding."id";
  if not found then raise exception 'premium_reconciliation_binding_update_missing'; end if;

  if p_expires_at <= clock_timestamp()
    or p_observed_at < clock_timestamp() - interval '5 minutes'
    or not public."premium_subject_has_finite_authority_internal"(p_user_id::text) then
    raise exception 'premium_reconciliation_postcondition_failed';
  end if;
  return jsonb_build_object(
    'status', 'processed',
    'providerEventId', v_projected_event_id,
    'accessGrantId', v_grant."id",
    'providerTransactionCreated', false, 'billingEventCreated', false, 'moneyLedgerCreated', false,
    'eventType', 'RECONCILIATION',
    'eventId', v_snapshot_id,
    'environment', 'sandbox',
    'entitlementActive', true,
    'duplicateEvent', false,
    'liveMoneyAction', false
  );
end;
$$;

revoke all on function public."reconcile_revenuecat_google_premium_snapshot_atomic"(
  text, uuid, text, text, text, text, text, text, timestamptz, timestamptz, timestamptz, text
) from public, anon, authenticated, service_role;
grant execute on function public."reconcile_revenuecat_google_premium_snapshot_atomic"(
  text, uuid, text, text, text, text, text, text, timestamptz, timestamptz, timestamptz, text
) to service_role;
comment on function public."reconcile_revenuecat_google_premium_snapshot_atomic"(
  text, uuid, text, text, text, text, text, text, timestamptz, timestamptz, timestamptz, text
) is 'Service-only sandbox restore reconciliation from an exact RevenueCat v2 current-customer subscription and transaction snapshot. It requires one already-bound Google Play original transaction and the same owner/product, refuses conflicting or terminal authority, creates no provider transaction or payable balance, and repairs only the exact existing finite-access graph from typed verification evidence.';
