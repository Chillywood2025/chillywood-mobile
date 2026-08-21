-- Atomic RevenueCat/App Store creator-money processing for the finite catalog.
-- This deliberately allows production code paths to exist while keeping activation
-- controlled by mappings + kill switches. Production revenue enters
-- pending_verification; this function never creates a payable balance or payout.

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
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text := upper(trim(coalesce(p_event_type, '')));
  v_environment text := lower(trim(coalesce(p_environment, '')));
  v_now timestamptz := timezone('utc'::text, now());
  v_occurred timestamptz := coalesce(p_occurred_at, v_now);
  v_currency text := lower(trim(coalesce(p_currency, 'usd')));
  v_mapping public."monetization_product_store_mappings"%rowtype;
  v_product public."monetization_products"%rowtype;
  v_intent public."money_purchase_intents"%rowtype;
  v_provider public."provider_events"%rowtype;
  v_grant public."access_grants"%rowtype;
  v_ledger public."money_access_ledger_events"%rowtype;
  v_grant_type text;
  v_feature_key text;
  v_feature_state text;
  v_app_store_state text;
  v_webhook_state text;
  v_creator_money_state text;
  v_live_state text;
  v_grant_status text;
  v_payable_state text;
  v_ledger_status text;
  v_provider_status text;
  v_is_active_event boolean;
  v_is_refund_event boolean;
  v_is_expiration_event boolean;
  v_is_cancellation_event boolean;
  v_is_billing_issue boolean;
  v_is_subscription boolean;
  v_existing_event boolean := false;
  v_existing_grant boolean := false;
  v_existing_ledger boolean := false;
  v_retain_subscription_access boolean := false;
  v_original_transaction text := nullif(trim(coalesce(p_original_transaction_id, '')), '');
begin
  if p_user_id is null then raise exception 'revenuecat_user_required'; end if;
  if nullif(trim(coalesce(p_provider_event_id, '')), '') is null then raise exception 'revenuecat_event_id_required'; end if;
  if nullif(trim(coalesce(p_provider_product_id, '')), '') is null then raise exception 'revenuecat_product_id_required'; end if;
  if v_environment not in ('sandbox', 'production') then raise exception 'revenuecat_environment_invalid'; end if;
  if p_amount_minor is null or p_amount_minor < 0 then raise exception 'revenuecat_amount_invalid'; end if;
  if v_currency !~ '^[a-z]{3}$' then raise exception 'revenuecat_currency_invalid'; end if;
  if nullif(trim(coalesce(p_raw_payload_hash, '')), '') is null then raise exception 'revenuecat_payload_hash_required'; end if;

  v_is_active_event := v_event_type in ('INITIAL_PURCHASE','NON_RENEWING_PURCHASE','RENEWAL','UNCANCELLATION','PRODUCT_CHANGE');
  v_is_refund_event := v_event_type in ('REFUND','REVOCATION','SUBSCRIPTION_PAUSED');
  v_is_expiration_event := v_event_type = 'EXPIRATION';
  v_is_cancellation_event := v_event_type = 'CANCELLATION';
  v_is_billing_issue := v_event_type = 'BILLING_ISSUE';
  if not (v_is_active_event or v_is_refund_event or v_is_expiration_event or v_is_cancellation_event or v_is_billing_issue) then
    return jsonb_build_object('status','ignored','reason','unsupported_event_type','environment',v_environment,
      'payableState','not_payable','grantStatus','blocked','duplicateProviderEvent',false,'duplicateAccessGrant',false,'duplicateLedgerEvent',false);
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ios_creator_money:'||p_user_id::text||':'||p_provider_product_id, 0));

  select mapping.* into v_mapping
  from public."monetization_product_store_mappings" mapping
  where mapping."platform"='ios' and mapping."store"='app_store' and mapping."provider"='revenuecat_app_store'
    and mapping."provider_product_id"=p_provider_product_id
    and mapping."provider_base_plan_id" is null
  order by case when mapping."environment"=v_environment then 0 else 1 end, mapping."updated_at" desc
  limit 1;
  if v_mapping."id" is null then
    return jsonb_build_object('status','ignored','reason','product_mapping_missing','environment',v_environment,
      'payableState','not_payable','grantStatus','blocked','duplicateProviderEvent',false,'duplicateAccessGrant',false,'duplicateLedgerEvent',false);
  end if;
  if v_mapping."environment"<>v_environment then
    return jsonb_build_object('status','ignored','reason','mapping_environment_mismatch','environment',v_environment,
      'payableState','not_payable','grantStatus','blocked','duplicateProviderEvent',false,'duplicateAccessGrant',false,'duplicateLedgerEvent',false);
  end if;
  if v_mapping."grants_livekit_authority" or v_mapping."creates_payable_balance" then raise exception 'unsafe_store_mapping_authority'; end if;
  if v_mapping."concept"='creator_tip' and v_mapping."unlocks_digital_access" then raise exception 'tip_cannot_unlock_access'; end if;

  select * into v_product from public."monetization_products" where "id"=v_mapping."product_id";
  if v_product."id" is null then raise exception 'conceptual_product_missing'; end if;
  v_is_subscription := v_mapping."concept"='channel_subscription';
  v_grant_type := case v_mapping."concept"
    when 'creator_tip' then null
    when 'seat_pass' then 'watch_party_live_ticket'
    when 'paid_video' then 'paid_content_access'
    when 'event_pass' then 'event_pass'
    when 'vip_pass' then 'vip_pass'
    when 'channel_subscription' then 'channel_subscription'
    else null end;
  if v_mapping."concept" not in ('creator_tip','seat_pass','paid_video','event_pass','vip_pass','channel_subscription') then
    return jsonb_build_object('status','ignored','reason','unsupported_creator_money_concept','productKey',v_product."product_key",
      'productType',v_product."product_type",'environment',v_environment,'payableState','not_payable','grantStatus','blocked',
      'duplicateProviderEvent',false,'duplicateAccessGrant',false,'duplicateLedgerEvent',false);
  end if;

  select "state" into v_app_store_state from public."platform_money_kill_switches" where "key"='revenuecat_app_store_enabled';
  select "state" into v_webhook_state from public."platform_money_kill_switches" where "key"='provider_webhooks_enabled';
  select "state" into v_creator_money_state from public."platform_money_kill_switches" where "key"='creator_monetization_enabled';
  select "state" into v_live_state from public."platform_money_kill_switches" where "key"='live_money_enabled';
  v_feature_key := case when v_mapping."concept"='paid_video' then 'paid_content_enabled' when v_mapping."concept"='seat_pass' then 'watch_party_tickets_enabled' when v_mapping."concept"='creator_tip' then 'tips_enabled' else 'digital_sales_enabled' end;
  select "state" into v_feature_state from public."platform_money_kill_switches" where "key"=v_feature_key;

  if v_environment='sandbox' then
    if v_mapping."status"<>'sandbox' or coalesce(v_app_store_state,'off')<>'sandbox_only'
      or coalesce(v_webhook_state,'off')<>'sandbox_only' or coalesce(v_feature_state,'off') not in ('sandbox_only','on')
      or coalesce(v_creator_money_state,'off') not in ('sandbox_only','on') or coalesce(v_live_state,'off')<>'off'
    then return jsonb_build_object('status','ignored','reason','sandbox_switch_or_mapping_not_ready','productKey',v_product."product_key",
      'productType',v_product."product_type",'environment',v_environment,'payableState','not_payable','grantStatus','blocked',
      'duplicateProviderEvent',false,'duplicateAccessGrant',false,'duplicateLedgerEvent',false); end if;
  else
    if v_mapping."status"<>'active' or coalesce(v_app_store_state,'off')<>'on' or coalesce(v_webhook_state,'off')<>'on'
      or coalesce(v_feature_state,'off')<>'on' or coalesce(v_creator_money_state,'off')<>'on' or coalesce(v_live_state,'off')<>'on'
      or coalesce((v_mapping."metadata"->>'provider_proof')::boolean,false) is not true
      or coalesce((v_mapping."metadata"->>'owner_release_approved')::boolean,false) is not true
      or coalesce((v_mapping."metadata"->>'physical_device_proof')::boolean,false) is not true
    then return jsonb_build_object('status','ignored','reason','production_activation_proof_incomplete','productKey',v_product."product_key",
      'productType',v_product."product_type",'environment',v_environment,'payableState','pending_verification','grantStatus','blocked',
      'duplicateProviderEvent',false,'duplicateAccessGrant',false,'duplicateLedgerEvent',false); end if;
  end if;

  select * into v_provider from public."provider_events"
  where "provider"='revenuecat_app_store' and "provider_event_id"=p_provider_event_id
  order by "created_at" asc limit 1 for update;
  if v_provider."id" is not null then v_existing_event:=true; end if;

  -- INITIAL/NON_RENEWING require a live, exact, source-bound intent. Renewals and
  -- lifecycle events may bind to the prior consumed subscription intent.
  if v_is_subscription and v_event_type<>'INITIAL_PURCHASE' then
    select * into v_intent from public."money_purchase_intents"
    where "user_id"=p_user_id and "product_id"=v_product."id" and "provider"='revenuecat_app_store'
      and "provider_product_id"=p_provider_product_id and "status" in ('consumed','revoked')
      and (v_original_transaction is null or coalesce("metadata"->>'original_transaction_id',v_original_transaction)=v_original_transaction)
    order by "created_at" desc limit 1 for update;
  elsif v_is_refund_event or v_is_expiration_event or v_is_cancellation_event or v_is_billing_issue then
    select * into v_intent from public."money_purchase_intents"
    where "user_id"=p_user_id and "product_id"=v_product."id" and "provider"='revenuecat_app_store'
      and "provider_product_id"=p_provider_product_id and "status" in ('consumed','revoked')
    order by "created_at" desc limit 1 for update;
  else
    select * into v_intent from public."money_purchase_intents"
    where "user_id"=p_user_id and "product_id"=v_product."id" and "provider"='revenuecat_app_store'
      and "provider_product_id"=p_provider_product_id and "status"='pending' and "expires_at">v_now
    order by "created_at" desc limit 1 for update;
  end if;

  if v_intent."id" is null then
    if v_existing_event and v_provider."status" in ('processed','refunded','reversed') then
      select * into v_ledger from public."money_access_ledger_events" where "provider_event_id"=v_provider."id" order by "created_at" desc limit 1;
      if v_grant_type is not null then select * into v_grant from public."access_grants" where "provider_event_id"=v_provider."id" and "user_id"=p_user_id and "grant_type"=v_grant_type order by "updated_at" desc limit 1; end if;
      return jsonb_build_object('status','processed','reason','duplicate_provider_event_already_finalized','productKey',v_product."product_key",
        'productType',v_product."product_type",'providerEventId',v_provider."id",'accessGrantId',v_grant."id",'ledgerEventId',v_ledger."id",
        'purchaseIntentId',null,'environment',v_environment,'payableState',coalesce(v_ledger."payable_state",case when v_environment='production' then 'pending_verification' else 'not_payable' end),
        'grantStatus',coalesce(v_grant."status",'blocked'),'duplicateProviderEvent',true,'duplicateAccessGrant',v_grant."id" is not null,'duplicateLedgerEvent',v_ledger."id" is not null);
    end if;
    return jsonb_build_object('status','ignored','reason','purchase_intent_missing_or_expired','productKey',v_product."product_key",
      'productType',v_product."product_type",'environment',v_environment,'payableState',case when v_environment='production' then 'pending_verification' else 'not_payable' end,
      'grantStatus','blocked','duplicateProviderEvent',v_existing_event,'duplicateAccessGrant',false,'duplicateLedgerEvent',false);
  end if;

  if v_environment='production' and not exists (
    select 1 from public."wave1_creator_eligibility" e where e."creator_user_id"=v_intent."creator_id" and e."state"='VERIFIED'
      and e."account_status"='ACTIVE' and e."age_18_plus" and e."legal_accepted" and e."creator_role" and e."moderation_state"='CLEAR'
      and e."market"='UNITED_STATES' and e."rollout_eligible" and e."platform_capability" and e."provider_eligible"
      and e."kyc_complete" and e."tax_complete" and e."sanctions_clear" and e."payout_eligible"
  ) then raise exception 'creator_no_longer_verified_for_production_money'; end if;

  if not v_existing_event then
    insert into public."provider_events" ("provider_event_id","provider","product_id","product_key","user_id","app_user_id","environment","event_type","status","occurred_at","idempotency_key","raw_payload_hash","metadata")
    values (p_provider_event_id,'revenuecat_app_store',v_product."id",v_product."product_key",p_user_id,p_user_id::text,v_environment,v_event_type,'received',v_occurred,
      'revenuecat_app_store:'||p_provider_event_id,p_raw_payload_hash,jsonb_build_object('provider_payload_stored',false,'provider_product_id',p_provider_product_id,
      'original_transaction_id',v_original_transaction,'store_mapping_id',v_mapping."id",'concept',v_mapping."concept",'production_money',v_environment='production','live_money_action',false,'payout_ready',false))
    returning * into v_provider;
  end if;

  v_retain_subscription_access := v_is_subscription and ((v_is_cancellation_event or v_is_billing_issue) and p_expires_at is not null and p_expires_at>v_now);
  v_grant_status := case
    when v_is_refund_event then case when v_event_type='REFUND' then 'refunded' else 'revoked' end
    when v_is_expiration_event then 'expired'
    when v_is_cancellation_event and not v_retain_subscription_access then 'expired'
    when v_is_billing_issue and not v_retain_subscription_access then 'blocked'
    when v_environment='production' then 'active'
    else 'sandbox_only' end;
  v_payable_state := case
    when v_is_refund_event then 'refunded'
    when v_is_expiration_event then 'reversed'
    when v_environment='production' and v_is_active_event then 'pending_verification'
    else 'not_payable' end;
  v_ledger_status := case
    when v_is_refund_event then 'refunded'
    when v_is_expiration_event then 'reversed'
    when v_environment='production' and v_is_active_event then 'verified'
    when v_is_billing_issue then 'pending'
    else 'sandbox_only' end;
  v_provider_status := case when v_is_refund_event then 'refunded' when v_is_expiration_event then 'reversed' else 'processed' end;

  if v_grant_type is not null then
    -- Lifecycle events update the exact prior source-bound grant. Active initial
    -- purchases insert exactly one provider-backed grant.
    select * into v_grant from public."access_grants"
    where "user_id"=p_user_id and "product_id"=v_product."id" and "grant_type"=v_grant_type and "source_id"=v_intent."source_id"
    order by "updated_at" desc limit 1 for update;
    if v_grant."id" is null and v_is_active_event then
      insert into public."access_grants" ("user_id","grant_type","source_type","source_id","product_id","provider","provider_event_id","environment","status","starts_at","expires_at","metadata")
      values (p_user_id,v_grant_type,'provider_event',v_intent."source_id",v_product."id",'revenuecat_app_store',v_provider."id",v_environment,v_grant_status,v_occurred,p_expires_at,
        jsonb_build_object('product_key',v_product."product_key",'purchase_intent_id',v_intent."id",'provider_product_id',p_provider_product_id,
          'original_transaction_id',v_original_transaction,'viewer_access_only',true,'grants_livekit_publish',false,'grants_host_power',false,'grants_admin_power',false,
          'grants_payout_access',false,'premium_unlock',false,'creator_specific_vip_only',v_mapping."concept"='vip_pass','production_money',v_environment='production'))
      returning * into v_grant;
    elsif v_grant."id" is not null then
      update public."access_grants" set "provider_event_id"=v_provider."id","status"=v_grant_status,"expires_at"=coalesce(p_expires_at,"expires_at"),
        "refunded_at"=case when v_event_type='REFUND' then v_occurred else null end,
        "revoked_at"=case when v_grant_status in ('refunded','revoked','expired') then v_occurred else null end,
        "revoke_reason"=case when v_grant_status in ('refunded','revoked','expired') then 'RevenueCat '||lower(v_event_type)||' event.' else null end,
        "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object('latest_provider_event_id',v_provider."id",'original_transaction_id',v_original_transaction,
          'viewer_access_only',true,'grants_livekit_publish',false,'grants_host_power',false,'grants_admin_power',false,'grants_payout_access',false,'production_money',v_environment='production'),
        "updated_at"=v_now where "id"=v_grant."id" returning * into v_grant;
    end if;
  end if;

  select * into v_ledger from public."money_access_ledger_events" where "provider_event_id"=v_provider."id" order by "created_at" desc limit 1;
  if v_ledger."id" is not null then v_existing_ledger:=true; else
    insert into public."money_access_ledger_events" ("user_id","creator_id","platform_id","product_id","provider_event_id","event_type","amount_minor","currency","environment","payable_state","status","source_type","source_id","metadata")
    values (p_user_id,v_intent."creator_id",v_intent."platform_id",v_product."id",v_provider."id",v_event_type,p_amount_minor,v_currency,v_environment,v_payable_state,v_ledger_status,v_intent."source_type",v_intent."source_id",
      jsonb_build_object('product_key',v_product."product_key",'purchase_intent_id',v_intent."id",'provider_product_id',p_provider_product_id,'original_transaction_id',v_original_transaction,
        'sandbox_only',v_environment='sandbox','production_money',v_environment='production','not_payable',v_payable_state='not_payable','payout_readiness_proved',false,
        'live_money_enabled_at_verification',v_environment='production' and coalesce(v_live_state,'off')='on','requires_settlement_before_payable',true))
    returning * into v_ledger;
  end if;

  if v_is_active_event and v_intent."status"='pending' then
    update public."money_purchase_intents" set "status"='consumed',"consumed_at"=v_now,
      "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object('consumed_by_provider_event_id',v_provider."id",'original_transaction_id',v_original_transaction,
        'sandbox_only',v_environment='sandbox','production_money',v_environment='production','not_payable',true,'requires_settlement_before_payable',true),"updated_at"=v_now
    where "id"=v_intent."id";
  elsif v_is_refund_event then
    update public."money_purchase_intents" set "status"='revoked',"revoked_at"=v_occurred,
      "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object('revoked_by_provider_event_id',v_provider."id",'not_payable',true),"updated_at"=v_now
    where "id"=v_intent."id" and "status" in ('consumed','revoked');
  end if;

  update public."provider_events" set "status"=v_provider_status,
    "metadata"=coalesce("metadata",'{}'::jsonb)||jsonb_build_object('provider_product_id',p_provider_product_id,'original_transaction_id',v_original_transaction,
      'purchase_intent_id',v_intent."id",'access_grant_id',v_grant."id",'ledger_event_id',v_ledger."id",'concept',v_mapping."concept",
      'sandbox_only',v_environment='sandbox','production_money',v_environment='production','live_money_action',false,'payout_ready',false),
    "occurred_at"=v_occurred where "id"=v_provider."id" returning * into v_provider;

  return jsonb_build_object('status','processed','reason',case when v_grant_type is null then 'ledger_recorded_no_access_grant' else 'access_and_ledger_recorded' end,
    'productKey',v_product."product_key",'productType',v_product."product_type",'providerEventId',v_provider."id",'accessGrantId',v_grant."id",
    'ledgerEventId',v_ledger."id",'purchaseIntentId',v_intent."id",'environment',v_environment,'payableState',v_payable_state,'grantStatus',coalesce(v_grant_status,'blocked'),
    'duplicateProviderEvent',v_existing_event,'duplicateAccessGrant',v_existing_grant,'duplicateLedgerEvent',v_existing_ledger);
end;
$$;

revoke all on function public."process_revenuecat_consumable_event_atomic"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text) from public, anon, authenticated;
grant execute on function public."process_revenuecat_consumable_event_atomic"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text) to service_role;
comment on function public."process_revenuecat_consumable_event_atomic"(text,text,uuid,text,text,timestamptz,timestamptz,integer,text,text,text)
is 'Atomic App Store creator-money provider authority. Production sales remain pending_verification and never become payable here.';
