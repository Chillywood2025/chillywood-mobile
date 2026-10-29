-- Preserve exact pending-payment identity before evaluating changed event
-- admission. No charge, refund, access grant or payout is newly authorized.
-- These explicit replacements move one existing check; all other provider,
-- environment, timestamp, economics, terminal and idempotency guards remain.

create or replace function public."process_creator_money_provider_event_pre_source_lock"(
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
  p_provider text,
  p_platform text,
  p_store text,
  p_store_switch_key text,
  p_input_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id text := trim(coalesce(p_provider_event_id, ''));
  v_event_type text := upper(trim(coalesce(p_event_type, '')));
  v_environment text := lower(trim(coalesce(p_environment, '')));
  v_provider_product_id text := trim(coalesce(p_provider_product_id, ''));
  v_original_transaction text := nullif(trim(coalesce(p_original_transaction_id, '')), '');
  v_provider_key text := lower(trim(coalesce(p_provider, '')));
  v_product_identity_unresolved boolean := v_provider_product_id = '<missing-or-ambiguous>';
  v_platform text := lower(trim(coalesce(p_platform, '')));
  v_store text := lower(trim(coalesce(p_store, '')));
  v_store_switch_key text := lower(trim(coalesce(p_store_switch_key, '')));
  v_reported_currency text := lower(trim(coalesce(p_currency, '')));
  v_currency text := case when lower(trim(coalesce(p_currency, ''))) ~ '^[a-z]{3}$'
    then lower(trim(p_currency)) else 'usd' end;
  v_event_amount integer := greatest(coalesce(p_amount_minor, 0), 0);
  v_now timestamptz := timezone('utc'::text, now());
  v_occurred_at timestamptz := p_occurred_at;
  v_authority_occurred_at timestamptz;
  v_mapping public."monetization_product_store_mappings"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_provider public."provider_events"%rowtype;
  v_intent public."money_purchase_intents"%rowtype;
  v_link public."revenuecat_consumable_transaction_intents"%rowtype;
  v_unbound_terminal public."revenuecat_unbound_terminal_authority"%rowtype;
  v_unbound_initial public."revenuecat_unbound_initial_authority"%rowtype;
  v_seat_offer public."paid_watch_party_offers"%rowtype;
  v_event_offer public."paid_creator_events"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_grant public."access_grants"%rowtype;
  v_candidate_ids uuid[];
  v_provider_count integer := 0;
  v_catalog_count integer := 0;
  v_link_count integer := 0;
  v_expected_source_type text;
  v_expected_product_type text;
  v_required_offer_status text;
  v_grant_type text;
  v_feature_key text;
  v_feature_state text;
  v_store_state text;
  v_webhook_state text;
  v_creator_money_state text;
  v_live_state text;
  v_event_rank smallint := public."revenuecat_creator_money_authority_rank_internal"(v_event_type);
  v_is_initial boolean := v_event_type in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE');
  v_is_active boolean := v_event_type in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','UNCANCELLATION','PRODUCT_CHANGE');
  v_is_financial_terminal boolean := v_event_type in ('REFUND','REVOCATION');
  v_is_access_terminal boolean := v_event_type in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED');
  v_is_subscription boolean := false;
  v_ignore_reason text := case when v_is_active
    then nullif(trim(coalesce(p_input_reason, '')), '') else null end;
  v_grant_status text;
  v_payable_state text;
  v_ledger_status text;
  v_provider_status text;
  v_retain_subscription_access boolean := false;
  v_duplicate_grant boolean := false;
  v_duplicate_ledger boolean := false;
  v_bound_amount integer;
  v_bound_currency text;
begin
  if p_user_id is null then raise exception 'revenuecat_user_required'; end if;
  if v_event_id = '' or length(v_event_id)>512
    or v_event_id is distinct from coalesce(p_provider_event_id,'')
    or v_event_id ~ '[[:cntrl:]]'
  then raise exception 'revenuecat_event_id_invalid'; end if;
  if v_provider_product_id = '' or length(v_provider_product_id)>512
    or v_provider_product_id is distinct from coalesce(p_provider_product_id,'')
    or v_provider_product_id ~ '[[:cntrl:]]'
  then raise exception 'revenuecat_product_id_invalid'; end if;
  if v_environment not in ('sandbox','production') then raise exception 'revenuecat_environment_invalid'; end if;
  if not (
    (v_provider_key = 'revenuecat_app_store' and v_platform = 'ios' and v_store = 'app_store'
      and v_store_switch_key = 'revenuecat_app_store_enabled')
    or (v_provider_key = 'revenuecat_google_play' and v_platform = 'android' and v_store = 'google_play'
      and v_store_switch_key = 'revenuecat_google_play_enabled')
  ) then raise exception 'revenuecat_provider_store_tuple_invalid'; end if;
  if coalesce(p_raw_payload_hash,'') !~ '^[0-9a-f]{64}$'
  then raise exception 'revenuecat_payload_hash_invalid'; end if;
  if v_original_transaction is not null and (
    length(v_original_transaction)>512
    or v_original_transaction is distinct from coalesce(p_original_transaction_id,'')
    or v_original_transaction ~ '[[:cntrl:]]'
  ) then raise exception 'revenuecat_original_transaction_id_invalid'; end if;
  if p_occurred_at is null then
    v_occurred_at := v_now;
    if v_is_active then
      v_ignore_reason := coalesce(v_ignore_reason,'active_provider_occurred_at_required');
    end if;
  end if;
  if v_is_active and (p_amount_minor is null or p_amount_minor <= 0) then
    v_ignore_reason := coalesce(v_ignore_reason, 'active_provider_amount_invalid');
  end if;
  if v_is_active and (
    v_reported_currency !~ '^[a-z]{3}$'
    or public."money_currency_minor_unit_exponent_internal"(v_reported_currency) is null
  ) then
    v_ignore_reason := coalesce(v_ignore_reason, 'active_provider_currency_invalid');
  end if;
  if v_is_active and v_occurred_at > v_now + interval '5 minutes' then
    v_ignore_reason := coalesce(v_ignore_reason, 'active_provider_occurred_at_future_skew');
  end if;
  -- Preserve the signed provider time on provider_events, but never let any
  -- future-skewed delivery move the ordering watermark beyond receipt time.
  v_authority_occurred_at := least(v_occurred_at, v_now);

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'revenuecat-premium-event-id:'||v_event_id,0
  ));
  perform pg_advisory_xact_lock(hashtextextended('creator-money-provider-event:' || v_event_id, 0));
  if v_original_transaction is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'revenuecat-original:'||v_provider_key||':'||v_original_transaction,0
    ));
    perform pg_advisory_xact_lock(hashtextextended('creator-money-original-transaction:' || v_original_transaction, 0));
    select tombstone.* into v_unbound_initial
    from public."revenuecat_unbound_initial_authority" tombstone
    where tombstone."provider"=v_provider_key
      and tombstone."original_transaction_id"=v_original_transaction
    for update;
    if v_unbound_initial."provider" is not null and v_is_initial then
      if v_unbound_initial."user_id" is distinct from p_user_id
        or v_unbound_initial."provider_product_id" is distinct from v_provider_product_id
        or v_unbound_initial."environment" is distinct from v_environment
      then
        v_ignore_reason := coalesce(v_ignore_reason,'unbound_initial_authority_mismatch');
      else
        v_ignore_reason := coalesce(v_ignore_reason,'unbound_initial_original_transaction_reserved');
      end if;
    end if;
    if v_is_initial and exists (
      select 1
      from public."revenuecat_premium_transaction_authority" premium_binding
      where premium_binding."provider"=v_provider_key
        and premium_binding."original_transaction_id"=v_original_transaction
    ) then
      v_ignore_reason:=coalesce(v_ignore_reason,'revenuecat_original_transaction_cross_domain_reserved');
    end if;
  end if;

  select count(*)::integer into v_provider_count
  from public."provider_events" event
  where event."provider" = v_provider_key
    and event."provider_event_id" = v_event_id;
  if v_provider_count > 1 then
    raise exception 'revenuecat_provider_event_identity_ambiguous';
  end if;

  if v_provider_key = 'revenuecat_app_store' then
    select mapping.* into v_mapping
    from public."monetization_product_store_mappings" mapping
    where mapping."platform" = v_platform
      and mapping."store" = v_store
      and mapping."provider" = v_provider_key
      and mapping."provider_product_id" = v_provider_product_id
      and mapping."provider_base_plan_id" is null
      and mapping."environment" = v_environment
    order by mapping."updated_at" desc, mapping."id"
    limit 1;
    if v_mapping."id" is not null then
      select product.* into v_product
      from public."monetization_products" product
      where product."id" = v_mapping."product_id";
    end if;
  else
    select count(*)::integer into v_catalog_count
    from public."monetization_products" product
    where product."provider" = v_provider_key
      and product."provider_product_id" = v_provider_product_id
      and product."environment" = v_environment;
    if v_catalog_count = 1 then
      select product.* into v_product
      from public."monetization_products" product
      where product."provider" = v_provider_key
        and product."provider_product_id" = v_provider_product_id
        and product."environment" = v_environment;
      v_mapping."id" := v_product."id";
      v_mapping."product_id" := v_product."id";
      v_mapping."concept" := case v_product."product_type"
        when 'creator_tip' then 'creator_tip'
        when 'watch_party_live_ticket' then 'seat_pass'
        when 'paid_content_access' then 'paid_video'
        when 'event_pass' then 'event_pass'
        when 'vip_pass' then 'vip_pass'
        when 'channel_subscription' then 'channel_subscription'
        else null end;
      v_mapping."platform" := v_platform;
      v_mapping."store" := v_store;
      v_mapping."provider" := v_provider_key;
      v_mapping."provider_product_id" := v_provider_product_id;
      v_mapping."store_product_type" := case when v_product."product_type" = 'channel_subscription'
        then 'auto_renewable_subscription' else 'consumable' end;
      v_mapping."tier" := coalesce(v_product."metadata"->>'price_tier',substring(v_product."product_key" from '([0-9]+)$'));
      if coalesce(v_mapping."tier", '') ~ '^[0-9]+$' then
        v_mapping."reference_price_minor" := v_mapping."tier"::integer;
      end if;
      v_mapping."reference_currency" := 'usd';
      v_mapping."environment" := v_product."environment";
      v_mapping."status" := v_product."status";
      v_mapping."unlocks_digital_access" := v_mapping."concept" <> 'creator_tip';
      v_mapping."grants_livekit_authority" := false;
      v_mapping."creates_payable_balance" := false;
      v_mapping."metadata" := coalesce(v_product."metadata", '{}'::jsonb) || jsonb_build_object(
        'source_bound',true,'live_money_action',false,'google_product_catalog_binding',true
      );
    elsif v_catalog_count > 1 and v_is_active then
      v_ignore_reason := coalesce(v_ignore_reason, 'product_catalog_binding_ambiguous');
    end if;
  end if;

  if v_provider_count = 1 then
    select event.* into v_provider
    from public."provider_events" event
    where event."provider" = v_provider_key
      and event."provider_event_id" = v_event_id
    for update;
    if v_provider."user_id" is distinct from p_user_id
      or v_provider."environment" is distinct from v_environment
      or v_provider."event_type" is distinct from v_event_type
      or v_provider."raw_payload_hash" is distinct from p_raw_payload_hash
      or v_provider."metadata"->>'provider_product_id' is distinct from v_provider_product_id
      or v_provider."metadata"->>'original_transaction_id' is distinct from v_original_transaction
    then
      raise exception 'revenuecat_provider_event_replay_mismatch';
    end if;
    if v_provider."status" <> 'received' then
      if nullif(v_provider."metadata"->>'ledger_event_id', '') is not null then
        select ledger.* into v_ledger
        from public."money_access_ledger_events" ledger
        where ledger."id" = (v_provider."metadata"->>'ledger_event_id')::uuid;
      end if;
      if nullif(v_provider."metadata"->>'access_grant_id', '') is not null then
        select grant_row.* into v_grant
        from public."access_grants" grant_row
        where grant_row."id" = (v_provider."metadata"->>'access_grant_id')::uuid;
      end if;
      return jsonb_build_object(
        'status', case when v_provider."status" = 'ignored' then 'ignored' else 'processed' end,
        'reason', coalesce(v_provider."metadata"->>'final_reason', 'duplicate_provider_event_already_finalized'),
        'productKey', v_provider."product_key",
        'productType', v_product."product_type",
        'providerEventId', v_provider."id",
        'accessGrantId', v_grant."id",
        'ledgerEventId', v_ledger."id",
        'purchaseIntentId', nullif(v_provider."metadata"->>'purchase_intent_id', ''),
        'environment', v_environment,
        'payableState', coalesce(v_ledger."payable_state", 'not_payable'),
        'grantStatus', coalesce(v_grant."status", 'blocked'),
        'duplicateProviderEvent', true,
        'duplicateAccessGrant', v_grant."id" is not null,
        'duplicateLedgerEvent', v_ledger."id" is not null
      );
    end if;
  else
    insert into public."provider_events" (
      "provider_event_id","provider","product_id","product_key","user_id","app_user_id",
      "environment","event_type","status","occurred_at","idempotency_key","raw_payload_hash","metadata"
    ) values (
      v_event_id,v_provider_key,v_product."id",v_product."product_key",p_user_id,p_user_id::text,
      v_environment,v_event_type,'received',v_occurred_at,'creator_money:' || v_event_id,p_raw_payload_hash,
      jsonb_strip_nulls(jsonb_build_object(
        'provider_payload_stored',false,
        'provider_product_id',v_provider_product_id,
        'original_transaction_id',v_original_transaction,
        'store_mapping_id',v_mapping."id",
        'concept',v_mapping."concept",
        'reported_amount_minor',p_amount_minor,
        'reported_currency',nullif(v_reported_currency,''),
        'reported_expires_at',p_expires_at,
        'reference_price_minor',v_mapping."reference_price_minor",
        'reference_currency',v_mapping."reference_currency",
        'localized_storefront_price',v_mapping."id" is not null and (
          p_amount_minor is distinct from v_mapping."reference_price_minor"
          or v_currency is distinct from v_mapping."reference_currency"
        ),
        'production_money',v_environment = 'production',
        'live_money_action',false,
        'payout_ready',false
      ))
    ) returning * into v_provider;
  end if;

  if v_event_rank = 0 then v_ignore_reason := 'unsupported_event_type'; end if;
  if v_is_active and v_mapping."id" is null then v_ignore_reason := coalesce(v_ignore_reason, 'product_mapping_missing'); end if;
  if v_is_active and v_mapping."id" is not null and v_product."id" is null then v_ignore_reason := coalesce(v_ignore_reason, 'conceptual_product_missing'); end if;
  if v_original_transaction is null then v_ignore_reason := coalesce(v_ignore_reason, 'original_transaction_id_required'); end if;
  if v_is_active and v_mapping."id" is not null
    and (v_mapping."grants_livekit_authority" or v_mapping."creates_payable_balance") then
    v_ignore_reason := coalesce(v_ignore_reason, 'unsafe_store_mapping_authority');
  end if;
  if v_is_active and v_mapping."concept" = 'creator_tip' and v_mapping."unlocks_digital_access" then
    v_ignore_reason := coalesce(v_ignore_reason, 'tip_cannot_unlock_access');
  end if;
  if v_is_active and v_mapping."concept" not in ('creator_tip','seat_pass','paid_video','event_pass','vip_pass','channel_subscription') then
    v_ignore_reason := coalesce(v_ignore_reason, 'unsupported_creator_money_concept');
  end if;

  v_is_subscription := v_mapping."concept" = 'channel_subscription';
  if v_is_active and not v_is_subscription and v_event_type in (
    'RENEWAL','UNCANCELLATION','PRODUCT_CHANGE','CANCELLATION','BILLING_ISSUE','EXPIRATION','SUBSCRIPTION_PAUSED'
  ) then
    v_ignore_reason := coalesce(v_ignore_reason, 'lifecycle_event_requires_subscription');
  end if;
  if v_is_active and v_is_subscription and v_event_type = 'NON_RENEWING_PURCHASE' then
    v_ignore_reason := coalesce(v_ignore_reason, 'subscription_event_type_invalid');
  end if;
  if v_is_subscription and v_is_active and (p_expires_at is null or p_expires_at <= v_now) then
    v_ignore_reason := coalesce(v_ignore_reason, 'channel_subscription_finite_expiry_required');
  end if;

  v_expected_source_type := case v_mapping."concept"
    when 'creator_tip' then 'creator_tip'
    when 'seat_pass' then 'watch_party_live'
    when 'paid_video' then 'paid_content'
    when 'event_pass' then 'event'
    when 'vip_pass' then 'vip_pass'
    when 'channel_subscription' then 'channel_subscription'
    else null end;
  v_expected_product_type := case v_mapping."concept"
    when 'creator_tip' then 'creator_tip'
    when 'seat_pass' then 'watch_party_live_ticket'
    when 'paid_video' then 'paid_content_access'
    when 'event_pass' then 'event_pass'
    when 'vip_pass' then 'vip_pass'
    when 'channel_subscription' then 'channel_subscription'
    else null end;
  v_grant_type := case v_mapping."concept"
    when 'seat_pass' then 'watch_party_live_ticket'
    when 'paid_video' then 'paid_content_access'
    when 'event_pass' then 'event_pass'
    when 'vip_pass' then 'vip_pass'
    when 'channel_subscription' then 'channel_subscription'
    else null end;
  if v_is_active and v_product."id" is not null
    and v_product."product_type" is distinct from v_expected_product_type then
    v_ignore_reason := coalesce(v_ignore_reason, 'conceptual_product_type_mismatch');
  end if;

  v_feature_key := case
    when v_mapping."concept" = 'paid_video' then 'paid_content_enabled'
    when v_mapping."concept" = 'seat_pass' then 'watch_party_tickets_enabled'
    when v_mapping."concept" = 'creator_tip' then 'tips_enabled'
    else 'digital_sales_enabled' end;
  select "state" into v_store_state from public."platform_money_kill_switches" where "key" = v_store_switch_key;
  select "state" into v_webhook_state from public."platform_money_kill_switches" where "key" = 'provider_webhooks_enabled';
  select "state" into v_creator_money_state from public."platform_money_kill_switches" where "key" = 'creator_monetization_enabled';
  select "state" into v_live_state from public."platform_money_kill_switches" where "key" = 'live_money_enabled';
  select "state" into v_feature_state from public."platform_money_kill_switches" where "key" = v_feature_key;

  if v_is_active then
    if v_environment = 'sandbox' then
      if v_mapping."status" is distinct from 'sandbox'
        or coalesce(v_store_state, 'off') <> 'sandbox_only'
        or coalesce(v_webhook_state, 'off') <> 'sandbox_only'
        or coalesce(v_feature_state, 'off') not in ('sandbox_only','on')
        or coalesce(v_creator_money_state, 'off') not in ('sandbox_only','on')
        or coalesce(v_live_state, 'off') <> 'off'
      then
        v_ignore_reason := coalesce(v_ignore_reason, 'sandbox_switch_or_mapping_not_ready');
      end if;
    else
      if v_mapping."status" is distinct from 'active'
        or coalesce(v_store_state, 'off') <> 'on'
        or coalesce(v_webhook_state, 'off') <> 'on'
        or coalesce(v_feature_state, 'off') <> 'on'
        or coalesce(v_creator_money_state, 'off') <> 'on'
        or coalesce(v_live_state, 'off') <> 'on'
        or coalesce((v_mapping."metadata"->>'provider_proof')::boolean, false) is not true
        or coalesce((v_mapping."metadata"->>'owner_release_approved')::boolean, false) is not true
        or coalesce((v_mapping."metadata"->>'physical_device_proof')::boolean, false) is not true
      then
        v_ignore_reason := coalesce(v_ignore_reason, 'production_activation_proof_incomplete');
      end if;
    end if;
  end if;

  -- Every supported lifecycle event must recover the durable exact
  -- original-transaction binding. Only an INITIAL active event may create that
  -- binding from a unique pending intent; terminal events never fall back to a
  -- current/latest intent.
  if v_ignore_reason is null then
    select count(*)::integer into v_link_count
    from public."revenuecat_consumable_transaction_intents" link
    where link."provider" = v_provider_key
      and link."original_transaction_id" = v_original_transaction;
    if v_link_count > 1 or exists (
      select 1
      from public."revenuecat_consumable_transaction_intents" link
      where link."provider" = v_provider_key
        and link."original_transaction_id" = v_original_transaction
        and link."binding_state" <> 'exact'
    ) then
      v_ignore_reason := 'original_transaction_binding_ambiguous';
    elsif v_link_count = 1 then
      select link.* into v_link
      from public."revenuecat_consumable_transaction_intents" link
      where link."provider" = v_provider_key
        and link."original_transaction_id" = v_original_transaction
        and link."binding_state" = 'exact'
      for update;
      if v_link."user_id" is distinct from p_user_id then
        v_ignore_reason := 'original_transaction_authority_mismatch';
      elsif v_is_initial then
        v_ignore_reason := 'original_transaction_already_bound';
      else
        select intent.* into v_intent
        from public."money_purchase_intents" intent
        where intent."id" = v_link."purchase_intent_id"
        for update;
        if not v_is_active and v_intent."id" is not null then
          select product.* into v_product
          from public."monetization_products" product
          where product."id" = v_intent."product_id";
          v_mapping."id" := coalesce(v_mapping."id",v_product."id");
          v_mapping."product_id" := v_product."id";
          v_mapping."concept" := case v_intent."source_type"
            when 'creator_tip' then 'creator_tip'
            when 'watch_party_live' then 'seat_pass'
            when 'paid_content' then 'paid_video'
            when 'event' then 'event_pass'
            when 'vip_pass' then 'vip_pass'
            when 'channel_subscription' then 'channel_subscription'
            else null end;
          v_mapping."reference_price_minor" := v_intent."amount_minor";
          v_mapping."reference_currency" := lower(v_intent."currency");
          v_expected_source_type := v_intent."source_type";
          v_expected_product_type := v_intent."product_type";
          v_grant_type := case v_intent."source_type"
            when 'watch_party_live' then 'watch_party_live_ticket'
            when 'paid_content' then 'paid_content_access'
            when 'event' then 'event_pass'
            when 'vip_pass' then 'vip_pass'
            when 'channel_subscription' then 'channel_subscription'
            else null end;
          v_is_subscription := v_intent."source_type" = 'channel_subscription';
          update public."provider_events"
          set "product_id" = v_product."id", "product_key" = v_product."product_key",
              "metadata" = coalesce("metadata",'{}'::jsonb) || jsonb_build_object(
                'durable_bound_product_recovered',true,'concept',v_mapping."concept"
              )
          where "id" = v_provider."id"
          returning * into v_provider;
        end if;
        if v_intent."id" is null
          or v_intent."user_id" is distinct from p_user_id
          or v_intent."product_id" is distinct from v_product."id"
          or v_link."product_id" is distinct from v_intent."product_id"
          or v_intent."provider" is distinct from v_provider_key
          or (not v_product_identity_unresolved
            and v_intent."provider_product_id" is distinct from v_provider_product_id)
          or v_intent."environment" is distinct from v_environment
          or v_intent."source_type" is distinct from v_expected_source_type
        then
          v_ignore_reason := 'bound_purchase_intent_authority_mismatch';
        end if;
      end if;
    elsif not v_is_initial then
      if not v_is_active and v_event_rank > 0 then
        select tombstone.* into v_unbound_terminal
        from public."revenuecat_unbound_terminal_authority" tombstone
        where tombstone."provider"=v_provider_key
          and tombstone."original_transaction_id"=v_original_transaction
        for update;
        if v_unbound_terminal."provider" is null then
          insert into public."revenuecat_unbound_terminal_authority" (
            "provider","original_transaction_id","user_id","provider_product_id","environment",
            "last_provider_event_id","last_occurred_at","last_event_type","last_event_rank"
          ) values (
            v_provider_key,v_original_transaction,p_user_id,v_provider_product_id,v_environment,
            v_provider."id",v_authority_occurred_at,v_event_type,v_event_rank
          ) returning * into v_unbound_terminal;
          v_ignore_reason := 'unbound_terminal_authority_recorded';
        elsif v_unbound_terminal."user_id" is distinct from p_user_id
          or v_unbound_terminal."provider_product_id" is distinct from v_provider_product_id
          or v_unbound_terminal."environment" is distinct from v_environment
        then
          v_ignore_reason := 'unbound_terminal_authority_mismatch';
        else
          if v_unbound_terminal."last_occurred_at" < v_authority_occurred_at
            or (v_unbound_terminal."last_occurred_at"=v_authority_occurred_at
              and v_unbound_terminal."last_event_rank"<=v_event_rank)
          then
            update public."revenuecat_unbound_terminal_authority"
            set "last_provider_event_id"=v_provider."id",
                "last_occurred_at"=v_authority_occurred_at,
                "last_event_type"=v_event_type,
                "last_event_rank"=v_event_rank,
                "updated_at"=v_now
            where "provider"=v_provider_key and "original_transaction_id"=v_original_transaction
            returning * into v_unbound_terminal;
          end if;
          v_ignore_reason := 'unbound_terminal_authority_retained';
        end if;
      else
        v_ignore_reason := 'original_transaction_binding_missing';
      end if;
    else
      select tombstone.* into v_unbound_terminal
      from public."revenuecat_unbound_terminal_authority" tombstone
      where tombstone."provider"=v_provider_key
        and tombstone."original_transaction_id"=v_original_transaction
      for update;
      if v_unbound_terminal."provider" is not null then
        if v_unbound_terminal."user_id" is distinct from p_user_id
          or v_unbound_terminal."provider_product_id" is distinct from v_provider_product_id
          or v_unbound_terminal."environment" is distinct from v_environment
        then
          v_ignore_reason := 'unbound_terminal_authority_mismatch';
        elsif v_unbound_terminal."last_event_type" in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED') then
          v_ignore_reason := 'terminal_original_transaction_cannot_open';
        elsif v_unbound_terminal."last_occurred_at" > v_authority_occurred_at
          or (v_unbound_terminal."last_occurred_at"=v_authority_occurred_at
            and v_unbound_terminal."last_event_rank">=v_event_rank)
        then
          v_ignore_reason := 'prior_lifecycle_prevents_older_initial';
        end if;
      end if;
      if v_ignore_reason is null then
        perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
          'creator-money-pending-intent:'||p_user_id::text||':'||v_provider_key||':'
            ||v_product."id"::text||':'||coalesce(v_expected_source_type,''),0
        ));
        select array_agg(intent."id" order by intent."created_at", intent."id") into v_candidate_ids
        from public."money_purchase_intents" intent
        where intent."user_id" = p_user_id
          and intent."product_id" = v_product."id"
          and intent."provider" = v_provider_key
          and intent."provider_product_id" = v_provider_product_id
          and intent."environment" = v_environment
          and intent."source_type" = v_expected_source_type
          and ((intent."source_type"<>'event' and intent."status"='pending' and intent."expires_at">v_now)
            or public.creator_event_intent_receipt_matches_internal(intent,v_event_id))
          and intent."amount_minor" = v_mapping."reference_price_minor"
          and lower(intent."currency") = v_mapping."reference_currency";
        if coalesce(cardinality(v_candidate_ids), 0) = 0 then
          v_ignore_reason := 'purchase_intent_missing_or_expired';
        elsif cardinality(v_candidate_ids) <> 1 then
          v_ignore_reason := 'purchase_intent_binding_ambiguous';
        else
          v_intent:=null;
          select intent.* into v_intent
          from public."money_purchase_intents" intent
          where intent."id" = v_candidate_ids[1]
            and intent."user_id"=p_user_id
            and intent."product_id"=v_product."id"
            and intent."provider"=v_provider_key
            and intent."provider_product_id"=v_provider_product_id
            and intent."environment"=v_environment
            and intent."source_type"=v_expected_source_type
            and ((intent."source_type"<>'event' and intent."status"='pending' and intent."expires_at">v_now)
              or public.creator_event_intent_receipt_matches_internal(intent,v_event_id))
            and intent."amount_minor"=v_mapping."reference_price_minor"
            and lower(intent."currency")=v_mapping."reference_currency"
          for update;
          if v_intent."id" is null then
            v_ignore_reason:='purchase_intent_no_longer_pending';
          end if;
        end if;
      end if;
    end if;
  end if;

  -- Keep the exact immutable intent binding even when a schedule/capacity
  -- change prevents fulfillment. Running this before binding would turn the
  -- verified charge into an unbound obligation and hide the buyer's remedy.
  -- This check still runs before every access grant, accounting or consumption.
  if v_ignore_reason is null and v_is_active and v_intent."source_type"='event' then
    v_ignore_reason:=public.event_ticket_reservation_failure_internal(
      v_intent."id",p_user_id,p_provider_event_id);
  end if;

  -- Active provider events must still resolve the exact source offer. Production
  -- can never consume a sandbox source merely because its price matches.
  if v_ignore_reason is null and v_is_active then
    -- The pending intent is the immutable quote accepted before Store checkout.
    -- Mutable sale state, price edits, or payout readiness cannot erase a
    -- provider-confirmed charge. Recheck only source identity and present
    -- safety/admission constraints here; unsafe or unavailable sources remain
    -- denied and are placed in durable provider reconciliation below.
    v_required_offer_status := case when v_environment = 'production' then 'active' else 'sandbox' end;
    if v_mapping."concept" = 'creator_tip' then
      if not exists (
        select 1 from public."user_profiles" creator
        where creator."user_id" = v_intent."creator_id"::text
      ) then v_ignore_reason := 'creator_tip_source_not_available'; end if;
    elsif v_mapping."concept" = 'seat_pass' then
      select offer.* into v_seat_offer
      from public."paid_watch_party_offers" offer
      join public."watch_party_rooms" room on room."party_id"=offer."party_id"
      where offer."id" = v_intent."source_id"
        and offer."creator_id" = v_intent."creator_id"
        and offer."status" not in ('blocked','canceled')
        and coalesce(room."is_active",false)
        and room."room_type"='title'
      for update of offer;
      if v_seat_offer."id" is null then
        v_ignore_reason := 'seat_pass_source_not_available';
      elsif exists (
        select 1 from public."paid_watch_party_tickets" ticket
        where ticket."offer_id"=v_seat_offer."id"
          and ticket."buyer_id"=p_user_id
          and ticket."status"='active'
          and ticket."refunded_at" is null and ticket."revoked_at" is null
          and (ticket."expires_at" is null or ticket."expires_at">v_now)
      ) then
        v_ignore_reason := 'seat_pass_already_owned';
      elsif v_seat_offer."seat_limit" is not null and (
        select count(*)::integer from public."paid_watch_party_tickets" ticket
        where ticket."offer_id"=v_seat_offer."id"
          and ticket."status"='active'
          and ticket."refunded_at" is null and ticket."revoked_at" is null
          and (ticket."expires_at" is null or ticket."expires_at">v_now)
      ) >= v_seat_offer."seat_limit" then
        update public."paid_watch_party_offers"
        set "status"='sold_out',"updated_at"=v_now
        where "id"=v_seat_offer."id";
        v_ignore_reason := 'seat_pass_sold_out';
      end if;
    elsif v_mapping."concept" = 'paid_video' then
      if not exists (
        select 1 from public."videos" video
        where video."id" = v_intent."source_id"
          and video."owner_id" = v_intent."creator_id"
          and video."visibility" = 'public'
          and video."moderation_status" in ('clean','reported')
          and video."quarantined_at" is null
          and public."media_scan_public_safe"(video."scan_status")
          and public."is_creator_video_playable_source"(
            video."storage_path",video."storage_object_key",video."playback_url"
          )
          and not coalesce(video."vip_access_required",false)
      ) then v_ignore_reason := 'paid_video_source_not_available'; end if;
    elsif v_mapping."concept" = 'event_pass' then
      select offer.* into v_event_offer
      from public."paid_creator_events" offer
      join public."creator_events" event on event."id"=offer."creator_event_id"
      join public.event_ticket_reservations reservation
        on reservation.purchase_intent_id=v_intent."id" and reservation.offer_id=offer."id"
       and reservation.buyer_id=p_user_id
      where offer."creator_event_id"=v_intent."source_id"
        and offer."creator_id"=v_intent."creator_id"
        and offer."status" not in ('blocked','canceled')
        and event."status" not in ('ended','expired','canceled','removed','unsafe','blocked')
      for update of offer;
      if v_event_offer."id" is null then
        v_ignore_reason:='event_pass_source_not_available';
      elsif exists (
        select 1 from public."paid_creator_event_passes" pass_row
        where pass_row."event_id"=v_event_offer."id" and pass_row."buyer_id"=p_user_id
          and pass_row."status"='active' and pass_row."refunded_at" is null
          and pass_row."revoked_at" is null
          and (pass_row."expires_at" is null or pass_row."expires_at">v_now)
      ) then
        v_ignore_reason:='event_pass_already_owned';
      elsif v_event_offer."capacity_limit" is not null and (
        select count(*)::integer from public."paid_creator_event_passes" pass_row
        where pass_row."event_id"=v_event_offer."id" and pass_row."status"='active'
          and pass_row."refunded_at" is null and pass_row."revoked_at" is null
          and (pass_row."expires_at" is null or pass_row."expires_at">v_now)
      )>=v_event_offer."capacity_limit" then
        update public."paid_creator_events"
        set "status"='sold_out',"updated_at"=v_now
        where "id"=v_event_offer."id";
        v_ignore_reason:='event_pass_sold_out';
      end if;
    elsif v_mapping."concept" = 'vip_pass' then
      if not exists (
        select 1 from public."creator_vip_pass_offers" offer
        where offer."id" = v_intent."source_id"
          and offer."creator_id" = v_intent."creator_id"
          and offer."status" <> 'blocked'
      ) then v_ignore_reason := 'vip_pass_source_not_available'; end if;
    elsif v_mapping."concept" = 'channel_subscription' then
      if not exists (
        select 1 from public."creator_channel_subscription_offers" offer
        where offer."id" = v_intent."source_id"
          and offer."creator_id" = v_intent."creator_id"
          and offer."status" <> 'blocked'
      ) then v_ignore_reason := 'channel_subscription_source_not_available'; end if;
    end if;
  end if;

  -- Lifecycle and terminal deliveries carry no authority over price. Recover
  -- the original exact-bound financial values so a provider's 0/default
  -- terminal payload cannot create a mismatched reversal or ledger entry.
  if v_ignore_reason is null and not v_is_active then
    select ledger."amount_minor", lower(ledger."currency")
    into v_bound_amount, v_bound_currency
    from public."money_access_ledger_events" ledger
    where ledger."user_id" = p_user_id
      and ledger."product_id" = v_intent."product_id"
      and ledger."source_type" = v_intent."source_type"
      and ledger."source_id" = v_intent."source_id"
      and ledger."metadata"->>'purchase_intent_id' = v_intent."id"::text
      and ledger."metadata"->>'original_transaction_id' = v_original_transaction
      and ledger."event_type" in (
        'INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','UNCANCELLATION','PRODUCT_CHANGE'
      )
      and ledger."status" in ('verified','sandbox_only')
    order by ledger."created_at" desc, ledger."id" desc
    limit 1;
    v_event_amount := coalesce(v_bound_amount, v_intent."amount_minor");
    v_currency := coalesce(v_bound_currency, lower(v_intent."currency"));
    if v_event_amount is null or v_event_amount <= 0
      or v_currency is null or v_currency !~ '^[a-z]{3}$'
    then
      v_ignore_reason := 'bound_financial_authority_missing';
    end if;
  end if;

  if v_ignore_reason is null and v_is_active then
    if public."revenuecat_authority_quarantined_internal"(
      v_provider_key,p_user_id,v_environment
    ) then
      v_ignore_reason := 'revenuecat_terminal_authority_quarantined';
    elsif v_is_subscription and not v_is_initial
      and v_event_type in ('RENEWAL','UNCANCELLATION','PRODUCT_CHANGE')
      and not public."wave1_user_account_provider_authorized_internal"(v_intent."user_id")
    then
      v_ignore_reason := 'subscription_account_authority_not_current';
    elsif (not v_is_subscription or v_is_initial)
      and not public."money_purchase_intent_session_authorized_internal"(
        v_intent."user_id",v_intent."session_generation"
      )
    then
      v_ignore_reason := 'purchase_intent_session_authority_not_current';
    elsif public."is_account_access_restricted"(p_user_id::text) then
      v_ignore_reason := 'buyer_account_restricted';
    elsif v_intent."creator_id" is null
      or public."is_account_access_restricted"(v_intent."creator_id"::text)
    then
      v_ignore_reason := case when v_mapping."concept" = 'seat_pass'
        then 'seat_pass_creator_authority_required'
        else 'creator_source_authority_restricted' end;
    end if;
  end if;

  if v_ignore_reason is null and v_link."last_provider_event_id" is not null then
    if v_link."terminal" and not v_is_access_terminal then
      v_ignore_reason := 'terminal_original_transaction_cannot_reopen';
    elsif (
      v_link."last_occurred_at" > v_authority_occurred_at
      or (v_link."last_occurred_at" = v_authority_occurred_at and v_link."last_event_rank" > v_event_rank)
      or (v_link."last_occurred_at" = v_authority_occurred_at and v_link."last_event_rank" = v_event_rank
        and v_link."last_event_type" is not null
        and (select prior."provider_event_id" from public."provider_events" prior where prior."id" = v_link."last_provider_event_id") collate "C" > v_event_id collate "C")
    ) then
      v_ignore_reason := 'stale_provider_authority_event';
    end if;
  end if;

  if v_ignore_reason is not null then
    if v_is_initial and v_original_transaction is not null and v_link."provider" is null then
      insert into public."revenuecat_unbound_initial_authority" (
        "provider","original_transaction_id","user_id","provider_product_id","environment",
        "first_provider_event_id","first_ignore_reason"
      ) values (
        v_provider_key,v_original_transaction,p_user_id,v_provider_product_id,v_environment,
        v_provider."id",left(v_ignore_reason,160)
      )
      on conflict ("provider","original_transaction_id") do nothing;
    end if;
    update public."provider_events"
    set "status" = 'ignored',
        "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
          'final_reason',v_ignore_reason,
          'authority_granted',false,
          'payout_ready',false,
          'live_money_action',false,
          'purchase_intent_id',v_intent."id",
          -- Every authoritative active delivery can represent a completed
          -- Store charge. No ignored active event may disappear without an
          -- explicit refund-or-reconciliation obligation.
          'provider_reconciliation_required',v_is_active,
          'provider_reconciliation_disposition',case
            when v_is_active
              then 'refund_or_authoritative_provider_reconciliation_required'
            else 'not_required'
          end
        )
    where "id" = v_provider."id"
    returning * into v_provider;
    return jsonb_build_object(
      'status','ignored','reason',v_ignore_reason,'productKey',v_product."product_key",
      'productType',v_product."product_type",'providerEventId',v_provider."id",
      'accessGrantId',null,'ledgerEventId',null,'purchaseIntentId',v_intent."id",
      'environment',v_environment,'payableState','not_payable','grantStatus','blocked',
      'duplicateProviderEvent',v_provider_count = 1,'duplicateAccessGrant',false,'duplicateLedgerEvent',false
    );
  end if;

  v_retain_subscription_access := v_is_subscription
    and v_event_type in ('CANCELLATION','BILLING_ISSUE')
    and p_expires_at is not null
    and p_expires_at > v_now;
  v_grant_status := case
    when v_event_type = 'REFUND' then 'refunded'
    when v_event_type in ('REVOCATION','SUBSCRIPTION_PAUSED') then 'revoked'
    when v_event_type = 'EXPIRATION' then 'expired'
    when v_event_type = 'CANCELLATION' and not v_retain_subscription_access then 'expired'
    when v_event_type = 'BILLING_ISSUE' and not v_retain_subscription_access then 'blocked'
    when v_environment = 'production' then 'active'
    else 'sandbox_only' end;
  v_payable_state := case
    when v_event_type = 'REFUND' then 'refunded'
    when v_event_type = 'REVOCATION' then 'reversed'
    when v_environment = 'production' and v_is_active then 'pending_verification'
    else 'not_payable' end;
  v_ledger_status := case
    when v_event_type = 'REFUND' then 'refunded'
    when v_event_type = 'REVOCATION' then 'reversed'
    when v_environment = 'production' and v_is_active then 'verified'
    when v_event_type = 'BILLING_ISSUE' then 'pending'
    when v_event_type in ('EXPIRATION','CANCELLATION','SUBSCRIPTION_PAUSED') then 'ignored'
    else 'sandbox_only' end;
  v_provider_status := case
    when v_event_type = 'REFUND' then 'refunded'
    when v_event_type in ('REVOCATION','SUBSCRIPTION_PAUSED') then 'reversed'
    else 'processed' end;

  select ledger.* into v_ledger
  from public."money_access_ledger_events" ledger
  where ledger."provider_event_id" = v_provider."id"
  order by ledger."created_at", ledger."id"
  limit 1;
  if v_ledger."id" is null then
    insert into public."money_access_ledger_events" (
      "user_id","creator_id","platform_id","product_id","provider_event_id","event_type",
      "amount_minor","currency","environment","payable_state","status","source_type","source_id","metadata"
    ) values (
      p_user_id,v_intent."creator_id",v_intent."platform_id",v_product."id",v_provider."id",v_event_type,
      v_event_amount,v_currency,v_environment,v_payable_state,v_ledger_status,v_intent."source_type",v_intent."source_id",
      jsonb_build_object(
        'product_key',v_product."product_key",
        'purchase_intent_id',v_intent."id",
        'provider_product_id',v_provider_product_id,
        'original_transaction_id',v_original_transaction,
        'reported_amount_minor',p_amount_minor,
        'reported_currency',nullif(v_reported_currency,''),
        'reference_price_minor',v_mapping."reference_price_minor",
        'reference_currency',v_mapping."reference_currency",
        'localized_storefront_price',p_amount_minor is distinct from v_mapping."reference_price_minor" or v_reported_currency is distinct from v_mapping."reference_currency",
        'sandbox_only',v_environment = 'sandbox',
        'production_money',v_environment = 'production',
        'not_payable',v_payable_state = 'not_payable',
        'payout_readiness_proved',false,
        'live_money_enabled_at_verification',v_environment = 'production' and v_live_state = 'on',
        'requires_settlement_before_payable',true
      )
    ) returning * into v_ledger;
  else
    v_duplicate_ledger := true;
  end if;

  if v_grant_type is not null then
    select grant_row.* into v_grant
    from public."access_grants" grant_row
    where grant_row."user_id" = p_user_id
      and grant_row."product_id" = v_product."id"
      and grant_row."grant_type" = v_grant_type
      and grant_row."source_id" = v_intent."source_id"
      and grant_row."metadata"->>'purchase_intent_id' = v_intent."id"::text
    order by grant_row."created_at", grant_row."id"
    limit 1
    for update;
    if v_grant."id" is null and v_is_active then
      insert into public."access_grants" (
        "user_id","grant_type","source_type","source_id","product_id","provider","provider_event_id",
        "environment","status","starts_at","expires_at","metadata"
      ) values (
        p_user_id,v_grant_type,'provider_event',v_intent."source_id",v_product."id",v_provider_key,v_provider."id",
        v_environment,v_grant_status,v_occurred_at,p_expires_at,
        jsonb_build_object(
          'product_key',v_product."product_key",
          'purchase_intent_id',v_intent."id",
          'provider_product_id',v_provider_product_id,
          'original_transaction_id',v_original_transaction,
          'viewer_access_only',true,
          'authority_granted',false,
          'speaker_authority',false,
          'moderator_authority',false,
          'payout_access',false,
          'premium_unlock',false,
          'creator_specific_vip_only',v_mapping."concept" = 'vip_pass',
          'production_money',v_environment = 'production'
        )
      ) returning * into v_grant;
    elsif v_grant."id" is not null then
      v_duplicate_grant := true;
      update public."access_grants"
      set "provider_event_id" = v_provider."id",
          "status" = v_grant_status,
          "expires_at" = case
            when v_is_subscription and v_grant_status in ('active','sandbox_only') then p_expires_at
            when p_expires_at is not null then p_expires_at
            else "expires_at" end,
          "refunded_at" = case when v_event_type = 'REFUND' then v_occurred_at else null end,
          "revoked_at" = case when v_grant_status in ('refunded','revoked','expired','blocked') then v_occurred_at else null end,
          "revoke_reason" = case when v_grant_status in ('refunded','revoked','expired','blocked') then 'RevenueCat ' || lower(v_event_type) || ' event.' else null end,
          "metadata" = (((coalesce("metadata", '{}'::jsonb)
            - 'grants_livekit_publish' - 'grants_host_power' - 'grants_admin_power' - 'grants_payout_access')
            || jsonb_build_object(
              'latest_provider_event_id',v_provider."id",
              'original_transaction_id',v_original_transaction,
              'viewer_access_only',true,
              'authority_granted',false,
              'speaker_authority',false,
              'moderator_authority',false,
              'payout_access',false,
              'premium_unlock',false,
              'production_money',v_environment = 'production'
            ))),
          "updated_at" = v_now
      where "id" = v_grant."id"
      returning * into v_grant;
    end if;
  end if;

  if v_is_active and (v_intent."status"='pending' or (v_intent."source_type"='event' and v_intent."status"='expired')) then
    update public."money_purchase_intents"
    set "status" = 'consumed',
        "consumed_at" = v_now,
        "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
          'consumed_by_provider_event_id',v_provider."id",
          'original_transaction_id',v_original_transaction,
          'sandbox_only',v_environment = 'sandbox',
          'production_money',v_environment = 'production',
          'not_payable',true,
          'requires_settlement_before_payable',true
        ),
        "updated_at" = v_now
    where "id" = v_intent."id";
  elsif v_is_financial_terminal then
    update public."money_purchase_intents"
    set "status" = 'revoked',
        "revoked_at" = v_occurred_at,
        "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_build_object(
          'revoked_by_provider_event_id',v_provider."id",
          'not_payable',true
        ),
        "updated_at" = v_now
    where "id" = v_intent."id"
      and "status" in ('consumed','revoked');
  end if;

  if v_is_initial then
    insert into public."revenuecat_consumable_transaction_intents" (
      "provider","original_transaction_id","user_id","product_id","purchase_intent_id","provider_event_id",
      "last_provider_event_id","last_occurred_at","last_event_type","last_event_rank","terminal","binding_state"
    ) values (
      v_provider_key,v_original_transaction,p_user_id,v_product."id",v_intent."id",v_provider."id",
      v_provider."id",v_authority_occurred_at,v_event_type,v_event_rank,v_is_access_terminal,'exact'
    ) returning * into v_link;
  else
    update public."revenuecat_consumable_transaction_intents"
    set "last_provider_event_id" = v_provider."id",
        "last_occurred_at" = v_authority_occurred_at,
        "last_event_type" = v_event_type,
        "last_event_rank" = v_event_rank,
        "terminal" = "terminal" or v_is_access_terminal
    where "provider" = v_provider_key
      and "original_transaction_id" = v_original_transaction
      and "binding_state" = 'exact'
    returning * into v_link;
  end if;

  update public."provider_events"
  set "status" = v_provider_status,
      "occurred_at" = v_occurred_at,
      "metadata" = coalesce("metadata", '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object(
        'final_reason',case when v_grant_type is null then 'ledger_recorded_no_access_grant' else 'access_and_ledger_recorded' end,
        'purchase_intent_id',v_intent."id",
        'access_grant_id',v_grant."id",
        'ledger_event_id',v_ledger."id",
        'authority_granted',v_grant."id" is not null and v_grant."status" in ('active','sandbox_only'),
        'payout_ready',false,
        'live_money_action',false
      ))
  where "id" = v_provider."id"
  returning * into v_provider;

  -- Refresh after the ledger normalization and subscription projection triggers.
  select ledger.* into v_ledger from public."money_access_ledger_events" ledger where ledger."id" = v_ledger."id";
  return jsonb_build_object(
    'status','processed',
    'reason',case when v_grant_type is null then 'ledger_recorded_no_access_grant' else 'access_and_ledger_recorded' end,
    'productKey',v_product."product_key",'productType',v_product."product_type",
    'providerEventId',v_provider."id",'accessGrantId',v_grant."id",'ledgerEventId',v_ledger."id",
    'purchaseIntentId',v_intent."id",'environment',v_environment,'payableState',v_ledger."payable_state",
    'ledgerStatus',v_ledger."status",'grantStatus',coalesce(v_grant."status",'blocked'),
    'duplicateProviderEvent',v_provider_count = 1,'duplicateAccessGrant',v_duplicate_grant,'duplicateLedgerEvent',v_duplicate_ledger
  );
end;
$$;

create or replace function public."process_revenuecat_consumable_event_provider_internal"(
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
  p_provider text,
  p_platform text,
  p_store text,
  p_store_switch_key text,
  p_input_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text:=upper(pg_catalog.btrim(coalesce(p_event_type,'')));
  v_is_active boolean:=v_event_type in (
    'INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','UNCANCELLATION',
    'PRODUCT_CHANGE'
  );
  v_before jsonb;
  v_result jsonb;
  v_after jsonb;
  v_reason text:=nullif(pg_catalog.btrim(coalesce(p_input_reason,'')),'');
begin
  v_before:=public."creator_money_provider_source_identity_internal"(
    p_provider_event_id,p_user_id,p_provider_product_id,p_environment,
    p_original_transaction_id,p_provider
  );
  -- The terminal dispatcher already owns event/original locks before invoking
  -- this function. Terminal events never bind or consume a pending intent, so
  -- they deliberately retain that established lock order and skip the source
  -- lock. Active events enter source-first before the predecessor takes either
  -- provider lock, eliminating an active/terminal cycle.
  if v_is_active and v_before is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'creator-money-source-intent:'||(v_before->>'userId')||':'||
        (v_before->>'sourceType')||':'||(v_before->>'sourceId'),0
    ));
    v_after:=public."creator_money_provider_source_identity_internal"(
      p_provider_event_id,p_user_id,p_provider_product_id,p_environment,
      p_original_transaction_id,p_provider
    );
    if v_after is null
      or v_after->>'userId' is distinct from v_before->>'userId'
      or v_after->>'sourceType' is distinct from v_before->>'sourceType'
      or v_after->>'sourceId' is distinct from v_before->>'sourceId'
      or v_after->>'purchaseIntentId' is distinct from
        v_before->>'purchaseIntentId'
    then
      v_reason:=coalesce(v_reason,'provider_source_identity_changed');
    end if;
  elsif v_is_active then
    -- Supplying an input reason guarantees the predecessor cannot bind or
    -- consume an intent that appeared after this unresolved pre-read. It still
    -- records the charged event and its refund/reconciliation obligation.
    v_reason:=coalesce(v_reason,'provider_source_lock_unresolved');
  end if;
  -- Reservation admission is checked by the predecessor after its full
  -- unique/time-bound immutable intent binding, before any fulfillment.
  v_result:=public."process_creator_money_provider_event_pre_source_lock"(
    p_provider_event_id,p_event_type,p_user_id,p_provider_product_id,
    p_environment,p_occurred_at,p_expires_at,p_amount_minor,p_currency,
    p_raw_payload_hash,p_original_transaction_id,p_provider,p_platform,p_store,
    p_store_switch_key,v_reason
  );
  if v_is_active and v_after->>'sourceType'='event' then
    perform public.finalize_event_ticket_reservation_internal(
      (v_after->>'purchaseIntentId')::uuid,p_user_id,p_provider_event_id,v_result);
  end if;
  return v_result;
end;
$$;
